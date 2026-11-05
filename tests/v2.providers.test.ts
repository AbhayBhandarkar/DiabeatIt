import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { openDatabase, type Database } from '../server/db';
import { createV2Router } from '../server/v2';
import { idSchema } from '../server/v2/validation';

let db: Database, app: Express, cookie: string;
const fetchMock = vi.fn<typeof fetch>();
const setid = '2a54192c-18f2-49fe-b251-685b6b6ea1ef';
// Real public DailyMed format: non-RFC version/variant bits, not an internal entity ID.
const externalGuid = '55062171-7581-0630-e063-6394a90ac088';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const get = (path: string) => request(app).get(`/api/v2${path}`).set('Cookie', cookie);
beforeAll(async () => {
  db = await openDatabase(true); app = express(); app.use(express.json(), cookieParser()); app.use('/api/v2', await createV2Router(db));
  const response = await request(app).post('/api/v2/auth/register').send({ name: 'Reference reader', email: 'reader@example.org', password: 'Reference reader strong passphrase', consent: true }).expect(201);
  cookie = response.headers['set-cookie'][0].split(';')[0];
});
beforeEach(async () => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('FDC_API_KEY', '');
  // Isolate rate limits and public caches; authentication still uses the real account router.
  app = express(); app.use(express.json(), cookieParser()); app.use('/api/v2', await createV2Router(db));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await db.close(); });

describe('v2 external references (network mocked only in tests)', () => {
  it('requires authentication and does not contact a provider for an unauthenticated request', async () => {
    await request(app).get('/api/v2/knowledge/medicines?q=metformin').expect(401); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('searches official DailyMed, sanitizes titles and caches public results', async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: [{ setid, title: '<b>METFORMIN — labeled product</b>', published_date: '2026-01-01' }] }));
    const response = await get('/knowledge/medicines?q=metformin').expect(200);
    expect(response.body.results[0]).toEqual({ id: setid, title: 'METFORMIN — labeled product', published: '2026-01-01', url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}` });
    const [url, options] = fetchMock.mock.calls[0]; expect(new URL(String(url)).hostname).toBe('dailymed.nlm.nih.gov'); expect(new URL(String(url)).searchParams.get('drug_name')).toBe('metformin');
    expect(options!.redirect).toBe('error'); expect(options!.signal).toBeInstanceOf(AbortSignal); expect(JSON.stringify(options)).not.toContain(cookie);
    await get('/knowledge/medicines?q=METFORMIN').expect(200); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('retrieves setid metadata and official PDF link without claiming label screening', async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: [{ setid, title: 'Exact labeled product' }] }));
    const response = await get(`/knowledge/medicines/${setid}`).expect(200);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('setid')).toBe(setid);
    expect(response.body.pdfUrl).toBe(`https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=${setid}&type=pdf`);
    expect(response.body.limitations).toContain('not personalized advice'); expect(response.body.result.published).toBeNull();
  });
  it('accepts external GUIDs in DailyMed search and detail without weakening internal UUIDs', async () => {
    expect(idSchema.safeParse(externalGuid).success).toBe(false);
    fetchMock.mockImplementation(async () => reply({ data: [{ setid: externalGuid, title: 'Public product' }] }));
    const search = await get('/knowledge/medicines?q=metformin').expect(200);
    expect(search.body.results[0].id).toBe(externalGuid);
    const detail = await get(`/knowledge/medicines/${externalGuid.toUpperCase()}`).expect(200);
    expect(detail.body.result.id).toBe(externalGuid);
    expect(detail.body.pdfUrl).toContain(`setid=${externalGuid.toUpperCase()}`);
    await get(`/spaces/${externalGuid}`).expect(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed or mismatched external set IDs', async () => {
    for (const id of [externalGuid + '0', externalGuid.replace('550', 'zz0'), externalGuid.replaceAll('-', ''), `${externalGuid}%3Fredirect=evil`]) await get(`/knowledge/medicines/${id}`).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply({ data: [{ setid, title: 'Different product' }] }));
    await get(`/knowledge/medicines/${externalGuid}`).expect(404);
  });
  it('accepts openFDA external set IDs while retaining exact name filtering', async () => {
    fetchMock.mockResolvedValueOnce(reply({ results: [{ id: 'public-label', set_id: externalGuid, openfda: { generic_name: ['Metformin hydrochloride'], spl_set_id: [externalGuid] } }] }));
    const response = await get('/knowledge/labels?q=metformin%20hydrochloride').expect(200);
    expect(response.body.results).toHaveLength(1);
  });
  it('returns actual adverse-reaction/warning/interaction/indication excerpts only for exact product-name matches', async () => {
    fetchMock.mockResolvedValueOnce(reply({ results: [
      { id: 'label-1', set_id: setid, effective_time: '20260101', openfda: { generic_name: ['Metformin'], brand_name: ['Brand A'], manufacturer_name: ['Labeler A'], route: ['ORAL'] }, adverse_reactions: ['<p>Reported gastrointestinal reactions.</p>'], warnings: ['Label warning text.'], drug_interactions: ['Label interaction text.'], indications_and_usage: ['Label indication text.'] },
      { id: 'label-2', openfda: { generic_name: ['Metformin combination'] }, adverse_reactions: ['Should not be included'] },
    ] }));
    const response = await get('/knowledge/labels?q=metformin').expect(200);
    expect(response.body.results).toHaveLength(1); const label = response.body.results[0];
    expect(label.title).toBe('Brand A — Labeler A'); expect(label.region).toBe('US'); expect(label.generic).toEqual(['Metformin']);
    expect(label.sections.adverse_reactions).toEqual(['Reported gastrointestinal reactions.']); expect(label.sections.drug_interactions).toEqual(['Label interaction text.']);
    expect(new URL(label.sourceUrl).hostname).toBe('api.fda.gov');
    expect(new URL(label.sourceUrl).searchParams.get('search')).toBe('id:"label-1"');
    const search = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('search'); expect(search).toBe('(openfda.generic_name.exact:"metformin" OR openfda.brand_name.exact:"metformin")');
  });
  it('represents no label matches as an empty list, never invented excerpts', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: 'NOT_FOUND' } }, 404));
    const response = await get('/knowledge/labels?q=nomatch').expect(200); expect(response.body.results).toEqual([]);
    expect(response.body.limitations).toContain('No exact brand or ingredient-name match');
    expect(response.body.limitations).toContain('explicitly search that name');
    expect(response.body.limitations).toContain('No alternative salt, brand, or combination product has been substituted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not silently substitute salt or combination names for an empty exact match', async () => {
    fetchMock.mockResolvedValueOnce(reply({ results: [{ id: 'salt', openfda: { generic_name: ['Metformin hydrochloride'] } }, { id: 'combination', openfda: { generic_name: ['Metformin and other ingredient'] } }] }));
    const response = await get('/knowledge/labels?q=metformin').expect(200);
    expect(response.body.results).toEqual([]); expect(response.body.limitations).toContain('No exact'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects Lucene/URL injection and extra fields without contacting upstream', async () => {
    for (const path of ['/knowledge/labels?q=aspirin%22%20OR%20*', '/knowledge/labels?q=https%3A%2F%2Fevil.invalid', '/knowledge/medicines?q=aspirin&patientId=secret', '/knowledge/medicines/not-a-uuid']) await get(path).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns provider failures honestly and never caches errors', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'upstream unavailable' }, 503));
    const failed = await get('/knowledge/medicines?q=retrylabel').expect(502); expect(failed.body.code).toBe('PROVIDER_UNAVAILABLE'); expect(failed.body.results).toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply({ data: [] })); await get('/knowledge/medicines?q=retrylabel').expect(200); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed upstream schemas and reports timeouts', async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: [{ setid: 'invalid', title: 4 }] })); await get('/knowledge/medicines?q=malformed').expect(502);
    fetchMock.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    const response = await get('/knowledge/medicines?q=slowlabel').expect(504); expect(response.body.code).toBe('PROVIDER_TIMEOUT');
  });
  it('bounds upstream response bytes and refuses a redirect/network failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(4 * 1024 * 1024 + 1))); await get('/knowledge/medicines?q=oversized').expect(502);
    fetchMock.mockRejectedValueOnce(new TypeError('redirect disallowed')); await get('/knowledge/medicines?q=redirected').expect(502);
  });
  it('uses OpenFoodFacts per100g values, preserving missing/invalid nutrients as null', async () => {
    fetchMock.mockResolvedValueOnce(reply({ products: [
      { code: '1234567890123', product_name: '<b>Packaged food</b>', brands: '<script>Brand</script>', nutriments: { carbohydrates_100g: 12.5, fiber_100g: -1, proteins_100g: 'unknown', 'energy-kcal_100g': 100 } },
      { code: '1234567890124', product_name: 'Unknown composition' }, { code: '../../evil', product_name: 'Invalid identifier' },
    ] }));
    const response = await get('/foods/search?q=packaged').expect(200);
    expect(response.body.provider).toBe('OpenFoodFacts'); expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].per100g).toEqual({ carbs: 12.5, fiber: null, protein: null, kcal: 100 });
    expect(response.body.results[1].per100g).toEqual({ carbs: null, fiber: null, protein: null, kcal: null });
    expect(response.body.results[0].sourceUrl).toBe('https://world.openfoodfacts.org/product/1234567890123');
    expect(response.body.results[0].name).toBe('Packaged food'); expect(response.body.notice).toContain('not clinically verified');
    const [url, options] = fetchMock.mock.calls[0]; expect(new URL(String(url)).searchParams.get('search_terms')).toBe('packaged'); expect((options!.headers as Record<string, string>)['User-Agent']).toContain('DiabeatIT/2.0');
  });
  it('looks up a barcode and supports a genuine not-found response', async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 1, product: { code: '2345678901234', product_name: 'Barcode product', nutriments: {} } }));
    const response = await get('/foods/search?barcode=2345678901234').expect(200); expect(response.body.results[0].id).toBe('off:2345678901234');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v2/product/2345678901234.json');
    fetchMock.mockResolvedValueOnce(reply({ status: 0 }, 404)); expect((await get('/foods/search?barcode=2345678901235').expect(200)).body.results).toEqual([]);
  });
  it.each([429, 502, 503, 504])('retries OFF HTTP %i once using the public alternate, without forwarding account headers', async status => {
    const body = new Response('Temporary upstream page', { status, headers: { 'Retry-After': '0' } });
    const cancel = vi.spyOn(body.body!, 'cancel');
    fetchMock.mockResolvedValueOnce(body).mockResolvedValueOnce(reply({ timed_out: false, warnings: [], hits: [
      { code: '0859278003295', product_name: '<b>Rice</b>', brands: ['Brand A', 'Brand B'], nutriments: { carbohydrates_100g: 36, proteins_100g: -1 } },
      { code: '9310140006451', product_name: 'Brown rice' },
    ] }));
    const response = await get('/foods/search?q=rice').set('Authorization', 'synthetic-only').set('Origin', 'http://127.0.0.1:3001').expect(200);
    expect(response.body.results).toHaveLength(2); expect(response.body.provider).toBe('OpenFoodFacts');
    expect(response.body.results[0]).toMatchObject({ name: 'Rice', brand: 'Brand A, Brand B', per100g: { carbs: 36, fiber: null, protein: null, kcal: null } });
    expect(response.body.results[1].per100g).toEqual({ carbs: null, fiber: null, protein: null, kcal: null });
    const [url, options] = fetchMock.mock.calls[1]; const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://search.openfoodfacts.org/search'); expect(parsed.searchParams.get('q')).toBe('rice');
    expect(parsed.searchParams.get('page_size')).toBe('20'); expect(parsed.searchParams.get('fields')).toBe('code,product_name,brands,nutriments');
    expect(options!.signal).toBe(fetchMock.mock.calls[0][1]!.signal); expect(options!.redirect).toBe('error');
    expect(Object.keys(options!.headers!)).toEqual(['Accept', 'User-Agent']); expect(JSON.stringify(options)).not.toContain(cookie);
    expect(cancel).toHaveBeenCalledOnce(); await get('/foods/search?q=rice').expect(200); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('retries a transient barcode response at the same endpoint, not text search', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 503)).mockResolvedValueOnce(reply({ status: 1, product: { code: '2345678901234', product_name: 'Rice' } }));
    await get('/foods/search?barcode=2345678901234').expect(200);
    expect(String(fetchMock.mock.calls[1][0])).toBe(String(fetchMock.mock.calls[0][0])); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('escapes allowed punctuation and neutralizes Lucene operators in alternate text search', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': '0' } })).mockResolvedValueOnce(reply({ timed_out: false, hits: [] }));
    await get('/foods/search?q=Rice%20OR%20%28Brown-Rice%29').expect(200);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('q')).toBe('rice or \\(brown\\-rice\\)');
  });
  it.each(['2', '99999999999999999999', 'invalid', 'Tue, 03 Nov 2026 13:00:02 GMT'])('does not bypass excessive or invalid Retry-After: %s', async retryAfter => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T13:00:00Z'));
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'Retry-After': retryAfter } }));
    await get('/foods/search?q=rice').expect(502); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['1', 'Tue, 03 Nov 2026 13:00:01 GMT'])('honors a Retry-After of at most one second: %s', async retryAfter => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T13:00:00Z'));
    const started = performance.now(); let elapsed = 0;
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': retryAfter } })).mockImplementationOnce(async () => {
      elapsed = performance.now() - started; return reply({ timed_out: false, hits: [] });
    });
    await get('/foods/search?q=rice').expect(200); expect(elapsed).toBeGreaterThanOrEqual(990); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('makes at most two attempts and does not cache failures', async () => {
    fetchMock.mockImplementation(async () => reply({}, 503));
    await get('/foods/search?q=rice').expect(502); expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(reply({ products: [] })); await get('/foods/search?q=rice').expect(200); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([400, 401, 403, 404, 500, 301, 302, 303, 307, 308])('does not retry non-transient HTTP %i', async status => {
    fetchMock.mockResolvedValueOnce(reply({}, status)); await get('/foods/search?q=rice').expect(502); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['json', 'schema', 'size', 'network', 'timeout'])('does not retry OFF %s failures', async kind => {
    if (kind === 'network' || kind === 'timeout') fetchMock.mockRejectedValueOnce(kind === 'timeout' ? new DOMException('timeout', 'TimeoutError') : new TypeError('redirect or network failure'));
    else fetchMock.mockResolvedValueOnce(kind === 'json' ? new Response('<html>not JSON</html>') : kind === 'size' ? new Response('x'.repeat(4 * 1024 * 1024 + 1)) : reply({ products: [{ code: 123, product_name: 'Malformed' }] }));
    await get('/foods/search?q=rice').expect(kind === 'timeout' ? 504 : 502); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ timed_out: true, hits: [] }, { timed_out: false, warnings: [{}], hits: [] }, { timed_out: false, hits: [{ code: '12345', brands: 42 }] }])('rejects incomplete or malformed alternate data', async body => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': '0' } })).mockResolvedValueOnce(reply(body));
    await get('/foods/search?q=rice').expect(502); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('shares one ten-second deadline across attempts and body reads', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(60));
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': '0' } })).mockImplementationOnce(async (_url, options) => {
      const signal = options!.signal!;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{"hits":['));
        const abort = () => controller.error(signal.reason);
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
      } }));
    });
    const response = await get('/foods/search?q=rice').expect(504);
    expect(response.body.code).toBe('PROVIDER_TIMEOUT'); expect(timeout).toHaveBeenCalledExactlyOnceWith(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(fetchMock.mock.calls[1][1]!.signal).toBe(fetchMock.mock.calls[0][1]!.signal);
  });
  it('rejects ambiguous food requests', async () => {
    await get('/foods/search?q=food&barcode=12345678').expect(400); await get('/foods/search').expect(400);
    await get('/foods/search?barcode=123%3BSELECT').expect(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses USDA only with configured credentials and does not expose keys or forward health records', async () => {
    vi.stubEnv('FDC_API_KEY', 'test-provider-key');
    fetchMock.mockResolvedValueOnce(reply({ foods: [{ fdcId: 12345, description: 'Provider food', brandOwner: 'Manufacturer', foodNutrients: [
      { nutrientId: 1005, value: 15, unitName: 'G' }, { nutrientId: 1079, value: 2, unitName: 'g' }, { nutrientId: 1003, value: -3, unitName: 'G' }, { nutrientId: 1008, value: 200, unitName: 'KCAL' },
    ] }] }));
    const response = await get('/foods/search?q=usdafood').expect(200); expect(response.body.provider).toBe('USDA FoodData Central');
    expect(response.body.results[0].per100g).toEqual({ carbs: 15, fiber: 2, protein: null, kcal: 200 }); expect(JSON.stringify(response.body)).not.toContain('test-provider-key');
    const [url, options] = fetchMock.mock.calls[0]; expect(new URL(String(url)).hostname).toBe('api.nal.usda.gov'); expect((options!.headers as Record<string, string>)['X-Api-Key']).toBe('test-provider-key');
    expect(JSON.parse(options!.body as string)).toEqual({ query: 'usdafood', pageSize: 20 }); expect(JSON.stringify(options)).not.toContain('reader@example.org');
  });
});