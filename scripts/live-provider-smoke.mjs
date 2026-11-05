// Live, opt-in smoke: node scripts/live-provider-smoke.mjs
// Only creates/deletes its own temporary account. Never prints credentials or raw bodies.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';

const origin = 'http://127.0.0.1:3001';
const fields = 'code,product_name,brands,nutriments';
const report = { at: new Date().toISOString(), origin, checks: [], direct: [] };
const safeCode = value => typeof value === 'string' && /^[A-Z_0-9]{1,60}$/.test(value) ? value : undefined;
const keys = value => value && typeof value === 'object' ? Object.keys(value).slice(0, 30) : [];
const failure = error => ({ error: ['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(error?.name) ? error.name : 'CHECK_FAILED', causeCode: safeCode(error?.cause?.code) });

async function boundedFetch(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const chunks = []; let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(chunk);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let body; try { body = JSON.parse(text); } catch { /* Do not log non-JSON bodies. */ }
  return { status: response.status, headers: response.headers, body, bytes: size };
}

// Test the actual request helper against controlled redirects, using synthetic secrets only.
async function redirectCheck() {
  let targetHits = 0;
  const target = createServer((_req, res) => { targetHits++; res.end('{}'); });
  const redirector = createServer((req, res) => {
    req.resume();
    res.writeHead(Number(req.url.slice(1)), { Location: `http://127.0.0.1:${target.address().port}/sink` }); res.end();
  });
  try {
    target.listen(0, '127.0.0.1'); await once(target, 'listening');
    redirector.listen(0, '127.0.0.1'); await once(redirector, 'listening');
    let rejected = 0;
    for (const status of [301, 302, 303, 307, 308]) {
      for (const method of ['GET', 'POST']) {
        try {
          await boundedFetch(`http://127.0.0.1:${redirector.address().port}/${status}`, {
            method, headers: { Cookie: 'synthetic_cookie=not-a-secret', Origin: origin, 'x-diabeatit-client': 'web' },
            ...(method === 'POST' ? { body: 'synthetic-password-not-a-secret' } : {}),
          });
        } catch (error) { if (error instanceof TypeError) rejected++; }
      }
    }
    report.redirects = { scope: 'smoke HTTP helper; controlled loopback fixture, not backend fault injection', cases: 10, rejected, targetHits, passed: rejected === 10 && targetHits === 0 };
  } finally {
    await Promise.all([target, redirector].map(server => new Promise(resolve => {
      server.close(resolve); server.closeAllConnections();
    })));
  }
}

function summary(label, response) {
  const body = response.body;
  const results = Array.isArray(body?.results) ? body.results : body?.result ? [body.result] : undefined;
  const item = results?.[0];
  return {
    check: label, status: response.status, fields: keys(body), count: results?.length,
    source: typeof body?.source === 'string' ? body.source.slice(0, 120) : undefined,
    provider: typeof body?.provider === 'string' ? body.provider.slice(0, 120) : undefined,
    itemSources: results ? [...new Set(results.map(r => r.source).filter(v => typeof v === 'string'))].slice(0, 3).map(v => v.slice(0, 120)) : undefined,
    itemFields: item ? keys(item) : undefined,
    sectionFields: item?.sections ? keys(item.sections) : undefined,
    nutrientFields: item?.per100g ? keys(item.per100g) : undefined,
    sectionCounts: item?.sections ? Object.fromEntries(Object.entries(item.sections).map(([k, v]) => [k, Array.isArray(v) ? v.length : null])) : undefined,
    nullNutrients: results?.some(r => r.per100g) ? results.reduce((n, r) => n + Object.values(r.per100g ?? {}).filter(v => v === null).length, 0) : undefined,
    referenceNoticePresent: typeof (body?.limitations ?? body?.notice) === 'string',
    code: safeCode(body?.code),
    error: response.status >= 400 && typeof body?.error === 'string' ? body.error.slice(0, 200) : undefined,
  };
}

const publicUrls = {
  medicines: new URL('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json'),
  labels: new URL('https://api.fda.gov/drug/label.json'),
  rice: new URL('https://world.openfoodfacts.org/cgi/search.pl'),
};
publicUrls.medicines.search = new URLSearchParams({ drug_name: 'metformin', pagesize: '20' }).toString();
publicUrls.labels.search = new URLSearchParams({ search: '(openfda.generic_name.exact:"metformin" OR openfda.brand_name.exact:"metformin")', limit: '10' }).toString();
publicUrls.rice.search = new URLSearchParams({ search_terms: 'rice', search_simple: '1', action: 'process', json: '1', page_size: '20', fields }).toString();
publicUrls['labels-hydrochloride'] = new URL(publicUrls.labels);
publicUrls['labels-hydrochloride'].search = new URLSearchParams({ search: '(openfda.generic_name.exact:"metformin hydrochloride" OR openfda.brand_name.exact:"metformin hydrochloride")', limit: '10' }).toString();
const providerSchemas = {
  medicines: z.object({ data: z.array(z.object({ setid: z.uuid(), title: z.string().min(1), published_date: z.string().optional() })).max(20) }),
  rice: z.object({ products: z.array(z.object({ code: z.string().optional(), product_name: z.string().optional(), brands: z.string().optional(), nutriments: z.record(z.string(), z.unknown()).optional() })).max(20) }),
};

async function publicProbe(label, url) {
  // Deliberately separate from API client: never accepts its cookie or credentials.
  if (url.protocol !== 'https:' || !['dailymed.nlm.nih.gov', 'api.fda.gov', 'world.openfoodfacts.org'].includes(url.hostname)) throw new Error('PUBLIC_DESTINATION_REJECTED');
  const started = Date.now();
  try {
    const r = await boundedFetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'DiabeatIT/2.0 (nutrition and medicine reference lookup)' } });
    const b = r.body;
    const parsed = providerSchemas[label]?.safeParse(b);
    report.direct.push({ check: label, url: url.toString(), status: r.status, ms: Date.now() - started, bytes: r.bytes, fields: keys(b), count: (b?.data ?? b?.results ?? b?.products)?.length,
      total: b?.meta?.results?.total, schemaValid: parsed?.success,
      schemaIssues: parsed && !parsed.success ? parsed.error.issues.slice(0, 8).map(i => ({ path: i.path, code: i.code, message: i.message.slice(0, 150) })) : undefined,
      exactNameMatches: b?.results?.filter(v => [...(v.openfda?.generic_name ?? []), ...(v.openfda?.brand_name ?? [])].some(n => n.trim().toLowerCase() === (label === 'labels-hydrochloride' ? 'metformin hydrochloride' : 'metformin'))).length,
      code: safeCode(b?.error?.code), error: typeof b?.error?.message === 'string' ? b.error.message.slice(0, 240) : undefined });
    return b;
  } catch (error) { report.direct.push({ check: label, url: url.toString(), ...failure(error) }); }
}

async function liveAccount() {
  const email = `live-smoke-${randomBytes(16).toString('hex')}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  let cookie = '', registrationAttempted = false, deleted = false;
  const failedProviders = [];
  function api(path, method = 'GET', body) {
    const url = new URL(path, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw new Error('API_DESTINATION_REJECTED');
    return boundedFetch(url, { method, headers: { Accept: 'application/json', Origin: origin, 'x-diabeatit-client': 'web',
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  function retainCookie(r) {
    const value = r.headers.getSetCookie().find(v => v.startsWith('diabeatit_account='));
    if (value) cookie = value.split(';')[0];
  }
  async function check(label, path) {
    try { const r = await api(`/api/v2${path}`); report.checks.push(summary(label, r)); return r; }
    catch (error) { report.checks.push({ check: label, ...failure(error) }); return null; }
  }
  try {
    let ready = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await api('/api/health');
        ready = r.status === 200 && r.body?.mode === 'account-workspaces';
        report.checks.push({ check: 'startup', attempt, status: r.status, accountMode: ready });
        if (ready || r.status < 500) break;
      } catch (error) { report.checks.push({ check: 'startup', attempt, ...failure(error) }); }
    }
    if (!ready) throw new Error('API_NOT_READY');
    registrationAttempted = true;
    const registration = await api('/api/v2/auth/register', 'POST', { name: 'Temporary provider smoke', email, password, consent: true });
    retainCookie(registration);
    report.checks.push({ check: 'register', status: registration.status, cookieReceived: Boolean(cookie) });
    if (registration.status !== 201 || !cookie) throw new Error('REGISTRATION_FAILED');
    const queries = [['medicines', '/knowledge/medicines?q=metformin'], ['labels', '/knowledge/labels?q=metformin'], ['labels-hydrochloride', '/knowledge/labels?q=metformin%20hydrochloride'], ['rice', '/foods/search?q=rice']];
    for (const [label, path] of queries) {
      const r = await check(label, path);
      if (!r || r.status !== 200) failedProviders.push(label);
      if (label === 'medicines' && /^[a-f0-9-]{36}$/i.test(r?.body?.results?.[0]?.id ?? '')) {
        await check('medicine-detail', `/knowledge/medicines/${r.body.results[0].id}`);
      }
      if (label === 'rice') {
        const item = r?.body?.results?.find(item => /^off:\d{4,24}$/.test(item.id));
        // A widely distributed known barcode also permits diagnosis when text search is blocked.
        const barcode = item ? item.id.slice(4) : '3017620422003';
        const barcodeResult = await check(item ? 'barcode-from-rice' : 'barcode-known-fallback', `/foods/search?barcode=${barcode}`);
        if (!barcodeResult || barcodeResult.status !== 200) {
          const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`); url.searchParams.set('fields', fields);
          publicUrls.barcode = url; failedProviders.push('barcode');
        }
      }
    }
    await check('URL-query-rejected', '/knowledge/medicines?q=https%3A%2F%2Fexample.invalid');
    await check('redirect-parameter-rejected', '/foods/search?q=rice&redirect=https%3A%2F%2Fexample.invalid');
  } catch (error) { report.checks.push({ check: 'account-run', ...failure(error) }); }
  finally {
    if (registrationAttempted) {
      // Re-authenticate if a restart or uncertain registration response lost the cookie.
      // Retry cleanup finitely, never register a second account on a failed response.
      for (let attempt = 1; attempt <= 3 && !deleted; attempt++) {
        try {
          if (!cookie) {
            const login = await api('/api/v2/auth/login', 'POST', { email, password }); retainCookie(login);
            if (login.status !== 200) { report.checks.push({ check: 'cleanup-login', attempt, status: login.status }); continue; }
          }
          const oldCookie = cookie;
          const r = await api('/api/v2/account', 'DELETE', { password, confirmation: 'DELETE' });
          deleted = r.status === 200 && r.body?.ok === true;
          report.checks.push({ check: 'delete-account', attempt, status: r.status, deleted });
          if (deleted) {
            cookie = oldCookie;
            const me = await api('/api/v2/me');
            report.checks.push({ check: 'deleted-session-rejected', status: me.status, code: safeCode(me.body?.code) });
            const login = await api('/api/v2/auth/login', 'POST', { email, password });
            report.checks.push({ check: 'deleted-credentials-rejected', status: login.status, code: safeCode(login.body?.code) });
          } else if (r.status === 401) cookie = '';
        } catch (error) { report.checks.push({ check: 'cleanup', attempt, ...failure(error) }); }
      }
      report.accountDeleted = deleted;
    }
    cookie = '';
  }
  for (const label of new Set([...failedProviders, 'labels', 'labels-hydrochloride'])) await publicProbe(label, publicUrls[label]);
}

try {
  if (process.argv.includes('--public-only')) {
    for (const [label, url] of Object.entries(publicUrls)) await publicProbe(label, url);
  } else {
    await redirectCheck();
    await liveAccount();
  }
} catch (error) { report.fatal = failure(error); }
console.log(JSON.stringify(report, null, 2));
const required = ['medicines', 'labels', 'rice'];
const passed = report.accountDeleted && report.redirects?.passed
  && required.every(name => report.checks.some(c => c.check === name && c.status === 200 && c.count > 0))
  && report.checks.some(c => c.check.startsWith('barcode-') && c.status === 200 && c.count > 0)
  && ['URL-query-rejected', 'redirect-parameter-rejected'].every(name => report.checks.some(c => c.check === name && c.status === 400))
  && ['deleted-session-rejected', 'deleted-credentials-rejected'].every(name => report.checks.some(c => c.check === name && c.status === 401));
// Diagnostic-only mode makes no overall availability assertion. Full mode intentionally
// fails on an empty exact metformin label search: a valid empty response is not breadth.
process.exitCode = process.argv.includes('--public-only') ? (report.fatal ? 1 : 0) : passed ? 0 : 1;