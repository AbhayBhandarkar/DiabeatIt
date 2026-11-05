import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { FoodResult, FoodsResponse, LabelsResponse, MedicineDetailResponse, MedicineSearchResponse, Nutrition } from '../../shared/v2';
import { ApiError } from './validation';
import { referenceName } from '../../shared/medicineNames';

const labelNotice = 'US product labels are reference information, not personalized advice, an interaction check, prescribing guidance, or clinical clearance. Verify the exact product and current official label with a pharmacist. Excerpts may be incomplete.';
const foodNotice = 'Manufacturer/community or provider composition data, not clinically verified. Unknown nutrients remain null. Values are per 100 g; check the package, edible weight, and preparation. No patient records are sent to providers.';
const clean = (s: string, max = 500) => s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const queryText = z.string().trim().min(2).max(100).regex(/^[\p{L}\p{N}][\p{L}\p{N} .,'()\-]*$/u);
// Restrict Lucene query characters, quote exact generic/brand names and post-filter exact names.
const labelQuery = z.string().trim().min(2).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9 .\-]*$/);
const querySchema = z.object({ q: queryText }).strict();
// External SPL set IDs are GUIDs, not necessarily RFC-versioned UUIDs. Internal IDs stay unchanged.
const externalSetId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const upstreamError = () => new ApiError(502, 'PROVIDER_UNAVAILABLE', 'The reference provider is unavailable or returned unsupported data. Try again later.');

function retryDelay(value: string | null): number | null {
  if (value === null) return 100;
  const text = value.trim();
  const ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - Date.now();
  // Never truncate a provider's longer wait or bypass it using another endpoint.
  return Number.isFinite(ms) && ms <= 1000 ? Math.max(0, ms) : null;
}

/** Fixed HTTPS destinations only. No cookies, account IDs, medical records, or inbound headers forwarded. */
async function fetchJson(url: URL, options: RequestInit = {}, notFoundIsEmpty = false, retryUrl?: URL): Promise<unknown> {
  for (const destination of [url, ...(retryUrl ? [retryUrl] : [])]) {
    if (destination.protocol !== 'https:' || !['dailymed.nlm.nih.gov', 'api.fda.gov', 'world.openfoodfacts.org', 'search.openfoodfacts.org', 'api.nal.usda.gov'].includes(destination.hostname)) throw upstreamError();
  }
  // One deadline covers both requests, Retry-After, and body consumption; never 2 x 8 seconds.
  const signal = AbortSignal.timeout(retryUrl ? 10000 : 8000);
  try {
    const request = (destination: URL) => fetch(destination, { ...options, redirect: 'error', signal, headers: { Accept: 'application/json', 'User-Agent': 'DiabeatIT/2.0 (nutrition and medicine reference lookup)', ...options.headers } });
    let response = await request(url);
    if (retryUrl && [429, 502, 503, 504].includes(response.status)) {
      const wait = retryDelay(response.headers.get('Retry-After'));
      await response.body?.cancel();
      if (wait === null) throw upstreamError();
      await delay(wait, undefined, { signal });
      response = await request(retryUrl);
    }
    if (response.status === 404 && notFoundIsEmpty) { await response.body?.cancel(); return null; }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw upstreamError(); }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 4 * 1024 * 1024) { await reader.cancel(); throw upstreamError(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new ApiError(504, 'PROVIDER_TIMEOUT', 'The reference provider timed out. Try again later.');
    throw upstreamError();
  }
}
function parseProvider<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value); if (!parsed.success) throw upstreamError(); return parsed.data;
}
const splSchema = z.object({ data: z.array(z.object({ setid: externalSetId, title: z.string().min(1), published_date: z.string().optional() })).max(20) });
const splUrl = (setid: string) => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;
const splReference = (r: z.infer<typeof splSchema>['data'][number]) => ({ id: r.setid, title: clean(r.title, 1000), published: r.published_date ? clean(r.published_date, 40) : null, url: splUrl(r.setid) });
const strings = z.array(z.string()).max(100).optional();
const fdaSchema = z.object({ results: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/), set_id: externalSetId.optional(), effective_time: z.string().optional(),
  openfda: z.object({ generic_name: strings, brand_name: strings, manufacturer_name: strings, route: strings, spl_set_id: z.array(externalSetId).max(100).optional() }).optional(),
  adverse_reactions: strings, warnings: strings, warnings_and_cautions: strings, boxed_warning: strings, drug_interactions: strings, indications_and_usage: strings,
})).max(10) });
const excerpts = (s?: string[]) => (s ?? []).slice(0, 4).map(v => clean(v, 6000));
const names = (s?: string[]) => (s ?? []).slice(0, 20).map(v => clean(v, 500));
const nullableNutrient = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000 ? v : null;
const offProduct = z.object({ code: z.string().optional(), product_name: z.string().optional(), brands: z.string().optional(), nutriments: z.record(z.string(), z.unknown()).optional() });
// Search-a-licious has a different envelope and represents brands as an array.
const offSearch = z.union([
  z.object({ products: z.array(offProduct).max(20) }).transform(body => body.products),
  z.object({ timed_out: z.literal(false), warnings: z.array(z.unknown()).max(0).nullish(), hits: z.array(offProduct.extend({ brands: z.array(z.string()).max(100).optional().transform(value => value?.join(', ')) })).max(20) }).transform(body => body.hits),
]);
const offFields = 'code,product_name,brands,nutriments';
function offFood(p: z.infer<typeof offProduct>): FoodResult | null {
  if (!p.code || !/^\d{4,24}$/.test(p.code) || !p.product_name || !clean(p.product_name)) return null;
  const n = p.nutriments ?? {};
  return { id: `off:${p.code}`, name: clean(p.product_name), brand: clean(p.brands ?? ''), per100g: { carbs: nullableNutrient(n.carbohydrates_100g), fiber: nullableNutrient(n.fiber_100g), protein: nullableNutrient(n.proteins_100g), kcal: nullableNutrient(n['energy-kcal_100g']) }, source: 'OpenFoodFacts — community/manufacturer data', sourceUrl: `https://world.openfoodfacts.org/product/${p.code}` };
}
const usdaSchema = z.object({ foods: z.array(z.object({ fdcId: z.number().int().positive(), description: z.string(), brandOwner: z.string().optional(), brandName: z.string().optional(), foodNutrients: z.array(z.object({ nutrientId: z.number().int(), value: z.unknown().optional(), unitName: z.string().optional() })).max(1000).optional() })).max(20) });

export function createKnowledgeRouter(): Router {
  const router = Router();
  // Bounded, process-local TTL cache, includes only explicit public reference queries/results.
  const cache = new Map<string, { expires: number; bytes: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>(); let cacheBytes = 0;
  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const found = cache.get(key);
    if (found && found.expires > Date.now()) return found.value as T;
    if (found) { cacheBytes -= found.bytes; cache.delete(key); }
    if (pending.has(key)) return pending.get(key) as Promise<T>;
    if (pending.size >= 20) throw new ApiError(503, 'PROVIDER_BUSY', 'Reference lookups are busy. Try again shortly.');
    const promise = load().then(value => {
      const bytes = Buffer.byteLength(JSON.stringify(value));
      while (cache.size && (cache.size >= 100 || cacheBytes + bytes > 8 * 1024 * 1024)) {
        const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest);
      }
      if (bytes <= 8 * 1024 * 1024) { cache.set(key, { value, bytes, expires: Date.now() + 5 * 60000 }); cacheBytes += bytes; }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, promise); return promise;
  }
  const limit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many reference lookups. Try again shortly.', code: 'RATE_LIMITED' } });
  router.use(['/knowledge', '/foods'], limit);
  router.get('/knowledge/medicines', async (req, res) => {
    const input = querySchema.parse(req.query);
    const resolved = referenceName(input.q); const q = resolved.searched;
    const result = await cached<MedicineSearchResponse>(`spl:${q.toLowerCase()}`, async () => {
      const url = new URL('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json'); url.search = new URLSearchParams({ drug_name: q, pagesize: '20' }).toString();
      const body = parseProvider(splSchema, await fetchJson(url));
      return { results: body.data.map(splReference), source: 'DailyMed / US National Library of Medicine', limitations: labelNotice };
    });
    res.json({ ...result, query: resolved });
  });
  router.get('/knowledge/medicines/:setid', async (req, res) => {
    const setid = externalSetId.parse(req.params.setid);
    z.object({}).strict().parse(req.query);
    const result = await cached<MedicineDetailResponse>(`spl-id:${setid}`, async () => {
      // DailyMed /spls/{setid} is XML-only. Use documented /spls.json?setid for metadata.
      const url = new URL('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json'); url.search = new URLSearchParams({ setid, pagesize: '1' }).toString();
      const body = parseProvider(splSchema, await fetchJson(url));
      const label = body.data.find(r => r.setid.toLowerCase() === setid.toLowerCase());
      if (!label) throw new ApiError(404, 'NOT_FOUND', 'Product label not found.');
      return { result: splReference(label), pdfUrl: `https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=${setid}&type=pdf`, source: 'DailyMed / US National Library of Medicine', limitations: labelNotice };
    }); res.json(result);
  });
  router.get('/knowledge/labels', async (req, res) => {
    const input = z.object({ q: labelQuery }).strict().parse(req.query);
    const resolved = referenceName(input.q); const q = resolved.searched;
    const result = await cached<LabelsResponse>(`label:${q.toLowerCase()}`, async () => {
      const url = new URL('https://api.fda.gov/drug/label.json');
      url.search = new URLSearchParams({ search: `(openfda.generic_name.exact:"${q}" OR openfda.brand_name.exact:"${q}")`, limit: '10' }).toString();
      const raw = await fetchJson(url, {}, true);
      const records = raw === null ? [] : parseProvider(fdaSchema, raw).results;
      const results = records.filter(r => [...r.openfda?.generic_name ?? [], ...r.openfda?.brand_name ?? []].some(n => n.trim().toLowerCase() === q.toLowerCase())).map(r => {
        const generic = names(r.openfda?.generic_name), brand = names(r.openfda?.brand_name), manufacturer = names(r.openfda?.manufacturer_name);
        // A DailyMed set link may resolve to a different revision than these openFDA excerpts.
        const detail = new URL('https://api.fda.gov/drug/label.json'); detail.search = new URLSearchParams({ search: `id:"${r.id}"`, limit: '1' }).toString();
        return { id: r.id, title: [...brand.length ? brand : generic, ...manufacturer].join(' — '), generic, brand, manufacturer, route: names(r.openfda?.route), sections: { adverse_reactions: excerpts(r.adverse_reactions), warnings: excerpts([...(r.boxed_warning ?? []), ...(r.warnings ?? []), ...(r.warnings_and_cautions ?? [])]), drug_interactions: excerpts(r.drug_interactions), indications_and_usage: excerpts(r.indications_and_usage) }, sourceUrl: detail.toString(), updated: r.effective_time ? clean(r.effective_time, 40) : null, region: 'US' as const };
      });
      const noMatch = ' No exact brand or ingredient-name match was found. Labels may use a full ingredient salt name rather than the generic search term. Find the exact name on the package or in DailyMed, verify the product, and explicitly search that name. No alternative salt, brand, or combination product has been substituted.';
      return { results, source: 'openFDA / US FDA drug product labels', limitations: labelNotice + (results.length ? '' : noMatch) };
    }); res.json({ ...result, query: resolved });
  });
  router.get('/foods/search', async (req, res) => {
    const { q, barcode } = z.object({ q: queryText.optional(), barcode: z.string().regex(/^\d{4,24}$/).optional() }).strict().refine(v => Boolean(v.q) !== Boolean(v.barcode), 'Provide either q or barcode.').parse(req.query);
    const key = process.env.FDC_API_KEY;
    const useUsda = !!key && !barcode;
    const result = await cached<FoodsResponse>(`food:${useUsda ? 'usda' : 'off'}:${barcode ?? q!.toLowerCase()}`, async () => {
      if (useUsda) {
        const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
        const body = parseProvider(usdaSchema, await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': key! }, body: JSON.stringify({ query: q, pageSize: 20 }) }));
        const results = body.foods.map(f => {
          const nutrients = f.foodNutrients ?? [];
          const get = (id: number, unit: string) => nullableNutrient(nutrients.find(n => n.nutrientId === id && n.unitName?.toLowerCase() === unit)?.value);
          const per100g: Nutrition = { carbs: get(1005, 'g'), fiber: get(1079, 'g'), protein: get(1003, 'g'), kcal: get(1008, 'kcal') };
          return { id: `fdc:${f.fdcId}`, name: clean(f.description), brand: clean(f.brandName ?? f.brandOwner ?? ''), per100g, source: 'USDA FoodData Central — provider/manufacturer data', sourceUrl: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients` };
        }).filter(f => f.name);
        return { results, provider: 'USDA FoodData Central', notice: foodNotice };
      }
      let products: z.infer<typeof offProduct>[];
      if (barcode) {
        const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`); url.searchParams.set('fields', offFields);
        const raw = await fetchJson(url, {}, true, url);
        if (raw === null) products = [];
        else {
          const body = parseProvider(z.object({ status: z.number().int(), product: offProduct.optional() }), raw);
          if (body.status === 1 && !body.product) throw upstreamError();
          if (body.status === 1 && body.product?.code && body.product.code !== barcode) throw upstreamError();
          products = body.status === 1 ? [{ ...body.product!, code: body.product!.code ?? barcode }] : [];
        }
      } else {
        const url = new URL('https://world.openfoodfacts.org/cgi/search.pl'); url.search = new URLSearchParams({ search_terms: q!, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: offFields }).toString();
        const alternate = new URL('https://search.openfoodfacts.org/search');
        // Quoted phrases are not equivalent to full-text search on this public index.
        // queryText excludes other Lucene syntax; escape parentheses/minus and lowercase operators.
        const searchText = q!.toLowerCase().replace(/[()\-]/g, '\\$&');
        alternate.search = new URLSearchParams({ q: searchText, page_size: '20', fields: offFields }).toString();
        products = parseProvider(offSearch, await fetchJson(url, {}, false, alternate));
      }
      return { results: products.map(offFood).filter((v): v is FoodResult => v !== null), provider: 'OpenFoodFacts', notice: foodNotice };
    }); res.json(result);
  });
  return router;
}