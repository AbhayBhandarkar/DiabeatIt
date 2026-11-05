# Live v2 provider verification — 2026-11-03

## Post-fix verdict — 14:00 UTC

**DailyMed search/detail and real OpenFoodFacts rice search now pass live checks.** This does not establish comprehensive coverage or continuous provider availability. The historical investigation below is preserved as pre-fix evidence, not the current verdict.

Only [server/v2/providers.ts](../server/v2/providers.ts), [tests/v2.providers.test.ts](../tests/v2.providers.test.ts), and this document were edited for the fixes. Internal UUID validation, auth, entities, shared types, UI, and the smoke script were not changed. The detail route is already in the provider router, so no change to the main v2 router was needed.

### Implemented behavior

- **External SPL set IDs only:** anchored case-insensitive hexadecimal `8-4-4-4-12` GUID format for DailyMed search payloads, detail route parameters, and openFDA `set_id` / `spl_set_id`. Real DailyMed ID `55062171-7581-0630-e063-6394a90ac088` is accepted even though it fails RFC UUID version/variant validation. Internal `idSchema` remains `z.uuid()`; a regression confirms that this external ID is rejected on an internal workspace route. Detail still requires an exact case-insensitive returned-ID match and constructs fixed official URLs.
- **OFF gets at most two attempts total:** only HTTP **429, 502, 503, 504** trigger one retry. Barcode retries the same public endpoint. Text search retries at the real OFF [Search-a-licious API](https://search.openfoodfacts.org/docs), `https://search.openfoodfacts.org/search`, rather than calling an unrelated provider or inserting fixtures.
- Primary text search stays `https://world.openfoodfacts.org/cgi/search.pl` with the original `search_terms`, `search_simple=1`, `action=process`, `json=1`, `page_size=20`, and minimal fields. Alternate uses `q`, `page_size=20`, and the same fields: `code,product_name,brands,nutriments`. The official alternate OpenAPI contract was inspected live. Its `hits` envelope and array-valued brands are validated separately; timed-out responses and nonempty warnings are rejected. Product URLs still point to the canonical OFF site.
- **Full-text semantics verified:** use unquoted lowercase search text, escaping parentheses and minus signs. Input validation excludes the other Lucene punctuation; lowercase prevents uppercase Boolean operators. A live probe found that quoted `"rice"` returned zero hits while unquoted `rice` returned 20. The initial quoted implementation was corrected and retested, not reported as a successful search. Alternate ranking and index freshness can differ from primary; no equivalence or coverage promise is made.
- **Retry-After:** missing header waits 100 ms. Integer seconds or an HTTP date are honored only when the remaining delay is at most 1,000 ms (past dates wait zero). Invalid or longer values stop with the existing unavailable response; the alternate is not used to bypass a requested longer wait.
- **One 10-second OFF deadline** spans both requests, waiting, and body consumption. Other providers retain 8 seconds. Each response remains capped at 4 MiB. Redirects, network errors, timeouts, malformed JSON/schema, oversized bodies, other HTTP statuses, and valid empty results do not trigger retries. Failure responses are not cached; successful public results retain the existing five-minute cache. No new logging of account headers, queries, credentials, or raw provider bodies was added.
- **No exact-label substitution:** an empty openFDA result now appends explicit guidance to the existing `limitations` field: find the exact brand/full ingredient salt name on the package or in DailyMed, verify the product, and explicitly search that name. No suggested names are invented, no extra DailyMed request is hidden inside label search, and no salts or combination products are silently substituted. The exact-name post-filter is unchanged. This is API guidance; no UI wiring or new response field was introduced.

### Final authenticated live evidence

Ran the unchanged [scripts/live-provider-smoke.mjs](../scripts/live-provider-smoke.mjs) against the restarted, updated account API at `http://127.0.0.1:3001`, beginning **2026-11-03 13:58:43 UTC**. These are real upstream results, not mocked network tests.

| Request under `/api/v2` | Final result |
| --- | --- |
| `/knowledge/medicines?q=metformin` | **200, 20 DailyMed results** |
| Detail for the first returned external GUID | **200, 1 matching result**, official PDF link in response |
| `/knowledge/labels?q=metformin` | **200, 0 exact matches**; explicit no-match guidance supplied by the adapter |
| `/knowledge/labels?q=metformin%20hydrochloride` | **200, 1 label**; adverse/warnings/interactions/indications excerpt counts **1/2/1/1** |
| `/foods/search?q=rice` | **200, 19 OFF foods**, one null nutrient across results |
| Barcode discovered from that rice response | **200, 1 OFF food**; not a hard-coded fallback barcode |
| URL query / extra redirect parameter | **400 / 400** |

The temporary account was deleted successfully (`accountDeleted: true`). Both its old session and deleted credentials returned 401. The smoke's ten redirect cases rejected all redirects with zero target requests. No patient records were created and no credentials were printed.

**Smoke exit remains 1 intentionally:** the unmodified script requires nonempty exact `metformin` labels, which openFDA does not provide in these runs. This is an observed external exact-name coverage limitation, not an adapter failure and not an overall green smoke run. Explicit `metformin hydrochloride` was independently successful. The script's diagnostic-only DailyMed schema still uses the old `z.uuid()` check; it was outside the authorized edit scope and is not the fixed server's validator.

### Live retry-path evidence (distinct from the authenticated run)

At **14:00:13 UTC**, an isolated instance of the **actual final provider router**, using real Node fetch and no database/account, observed:

1. Primary rice CGI request: **HTTP 503**, approximately **777 ms**.
2. One retry at `https://search.openfoodfacts.org/search?q=rice&page_size=20&fields=code%2Cproduct_name%2Cbrands%2Cnutriments`: **HTTP 200**, approximately **714 ms**.
3. Router response: **HTTP 200, 20 usable OFF foods**.

Only URL/status/timing/count/provider summaries were printed; no body fixtures or forced status substitutions were used. A separate direct alternate request returned 200/20 with `timed_out: false`, `warnings: null`. This proves the live fallback path worked in that observation; it is not a claim that the authenticated 19-result run used the alternate. The primary's intermittent 503 cause remains unidentified.

### Regression and application checks

- Final provider tests: **49/49 passed**. Covers external GUIDs and strict internal UUIDs, mismatched detail IDs, openFDA external IDs/exact matching/no substitution, all four transient statuses, retry exhaustion and error-cache isolation, Retry-After seconds/dates/invalid/long waits, shared deadline through body reads, alternate mapping/missing nutrients/query escaping, nontransient/parse/schema/size/network failures, and header/redirect isolation.
- Final non-video suite: **138/138 passed across seven files**, including auth, entities, consistency, API/domain, providers, and disk persistence. Command: `npm test -- --exclude tests/product-video.test.ts`.
- `npm run build` passed; final `npx tsc --noEmit` passed after the fallback query correction.
- Full `npm test` was **not entirely green**: the first run had 136 passes and six failures (one persistence timeout, five lesson-player tests). Persistence passed on isolated rerun and in the final suite. All five tests in [tests/product-video.test.ts](../tests/product-video.test.ts) still failed on isolated rerun, timing out waiting for lesson controls. Its component harness does not call the provider router. No video, UI, or test configuration changes were made to hide or repair these out-of-scope failures.
- The updated built application was reloaded in a browser and displayed the account onboarding/sign-in UI. API is running on port 3001 and Vite on 5173. This was a basic render check, not an authenticated end-to-end UI certification.

USDA remains **not live-tested**. US labels are reference information, not clinical advice; community food values remain unverified and unknown nutrients stay null. No fabricated fallback data or broadened clinical assertions were added.

---

## Historical pre-fix verdict — 13:27–13:29 UTC

**Partial functionality; broad medicine/food lookup is not verified working.** Tested the existing account API at `http://127.0.0.1:3001`, not mocked API responses. Two full smoke runs began at **13:27:59 UTC** and **13:29:26 UTC**. Both exited 1 deliberately: required searches did not all yield usable results. No backend, shared types, dependencies, configuration, or existing tests were changed.

| Authenticated request (relative to `/api/v2`) | Live result | Source / interpretation |
| --- | --- | --- |
| `GET /knowledge/medicines?q=metformin` | **Blocked: 502**, `PROVIDER_UNAVAILABLE`, both runs | DailyMed adapter rejects some real upstream set IDs; see diagnosis below. |
| `GET /knowledge/labels?q=metformin` | **200, 0 results**, both runs | `openFDA / US FDA drug product labels`; valid empty exact-name result, not a successful knowledge-content demonstration. |
| `GET /knowledge/labels?q=metformin%20hydrochloride` | **Passed: 200, 1 result**, confirmation run | Same source; first label had 1 adverse-reaction excerpt, 2 warning excerpts, 1 interaction excerpt, 1 indication excerpt. Content not reproduced or clinically assessed. |
| `GET /foods/search?q=rice` | **Blocked: 502**, `PROVIDER_UNAVAILABLE`, both runs | Public OpenFoodFacts search was intermittently reachable; no rice list delivered by the running account API in these runs. |
| `GET /foods/search?barcode=3017620422003` | **Passed: 200, 1 result**, both runs | `OpenFoodFacts`; known fallback barcode, **not discovered from the failed rice API search**. Four nutrient fields present, none null in this one result. |

Health returned 200 in `account-workspaces` mode on the first attempt in each run. Each run registered one random `example.invalid` account (201), kept its password/cookie only in memory, then deleted it (200, `ok: true`). Both old-session `/me` and login with the deleted credentials returned 401 (`UNAUTHENTICATED` and `INVALID_CREDENTIALS`). **Both temporary accounts were deleted.** No patient records, food entries, medicines, or other user data were created. Registration's recovery codes were never printed or persisted.

## Exact observed response fields

- Provider failure: `{ error, code }`; observed error text: “The reference provider is unavailable or returned unsupported data. Try again later.”
- Labels: `{ results, source, limitations }`.
  - Nonempty label: `{ id, title, generic, brand, manufacturer, route, sections, sourceUrl, updated, region }`.
  - `sections`: `{ adverse_reactions, warnings, drug_interactions, indications_and_usage }`, each an array of strings.
- Successful barcode: `{ results, provider, notice }`.
  - Food: `{ id, name, brand, per100g, source, sourceUrl }`.
  - `per100g`: `{ carbs, fiber, protein, kcal }`; contract permits numbers or null. Gram nutrients and kcal refer to 100 g, not a serving.
- The live medicine search did **not** return success fields. Source-defined, not live-verified, success shape is `{ results, source, limitations }`, with items `{ id, title, published, url }`. Detail success is `{ result, pdfUrl, source, limitations }`; no detail lookup was reached because search failed.

Contracts: [shared/v2.ts](../shared/v2.ts). Transformations and bounded excerpts: [server/v2/providers.ts](../server/v2/providers.ts).

## Direct-public investigation and precise proposed corrections

Direct requests used Node fetch, no account headers, no API key, fixed public destinations, and `redirect: 'error'`. Summaries only: status, bounded errors/schema issues, counts, source identity. The smoke reader caps bodies at 4 MiB and 15 seconds; the backend caps at 4 MiB and 8 seconds. Successful timed probes below were well within 8 seconds. Upstream traffic from the running backend itself was not intercepted; its logs were not available to this investigation.

### 1. DailyMed: confirmed overly strict identifier schema

Exact upstream request: `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json` with `drug_name=metformin&pagesize=20`.

- Direct HTTP 200; **20 records**, 4,238 bytes. Timed runs: approximately 0.94–1.02 seconds.
- Applying the current adapter schema to the real payload failed at `data[0].setid`, `data[1].setid`, `data[18].setid`, and `data[19].setid`: `invalid_format` / `Invalid UUID`.
- Independent check: **4/20 fail `z.uuid()`; 0/20 fail `z.guid()`**. The four rejected IDs have GUID shape but non-RFC UUID version/variant bits. A single rejected item fails the entire response.
- **Needed fix for main:** introduce a provider-specific set-ID validator, such as `z.guid()` or anchored hexadecimal `8-4-4-4-12` format, in DailyMed response validation **and** `/knowledge/medicines/:setid` request validation. Audit openFDA `set_id` / `spl_set_id` validators for the same external-ID assumption. Do **not** weaken the shared internal `idSchema` for accounts/entities. Retain fixed-host URL construction, length bounds, redirect rejection, and exact returned-ID comparison.
- Add representative real-format non-RFC set-ID regression fixtures, then rerun live search and detail. This is a confirmed schema mismatch, **not evidence that DailyMed is down**.

### 2. openFDA: exact-name coverage limitation, not transport failure

Exact upstream: `https://api.fda.gov/drug/label.json`, with `limit=10` and search expression `(openfda.generic_name.exact:"metformin" OR openfda.brand_name.exact:"metformin")`.

- Direct HTTP **404**, 80 bytes, `{ error: { code: "NOT_FOUND", message: "No matches found!" } }`. Backend intentionally maps this to HTTP 200 with an empty list.
- Substituting **`metformin hydrochloride`** in both exact-name clauses yielded HTTP **200**, 1 record, upstream total 1, 153,591 bytes, and 1 exact-name post-filter match. The account API also successfully delivered that record.
- **Needed product improvement for main:** distinguish “no exact product-name match” from provider failure and offer explicit, source-backed name/salt/brand discovery followed by user selection and exact-label lookup. Do not silently substitute salts, broaden into combination products, or present all candidates as equivalent. Do not remove post-filter safeguards simply to increase counts.

### 3. OpenFoodFacts: intermittent external search failure; rice breadth remains blocked

Exact upstream: `https://world.openfoodfacts.org/cgi/search.pl`, parameters `search_terms=rice`, `search_simple=1`, `action=process`, `json=1`, `page_size=20`, `fields=code,product_name,brands,nutriments`.

- Initial and diagnostic direct requests: HTTP **200**, **20 products**, 55,337 bytes. Current product schema passed; timed diagnostic request took 1.66 seconds.
- Direct probe after confirmation run: HTTP **503**, 25,281 bytes, **not JSON**. No body was logged. Subsequent bounded diagnostic request returned HTTP 200 JSON (`nginx`, no `Retry-After`); therefore the 503 page's cause was **not identified** as anti-bot, quota, maintenance, or proxy failure.
- Isolated in-memory execution of the **unchanged current provider router**, using actual external fetch and no database/account, returned HTTP **200**, **19 usable foods from 20 products**, provider `OpenFoodFacts`. Filtering invalid/nameless products explains that count difference; no fabricated fallback data was inserted. This harness result is **not a passing result for port 3001**.
- Upstream request header names observed in that harness: only `Accept`, `User-Agent`; redirect policy `error`.
- **Proposed correction for main:** preserve the visible unavailable state; add redacted provider diagnostics distinguishing transport, HTTP status, parse, and schema failures. Consider one bounded retry for transient 502/503/504 responses, honoring `Retry-After`, with a total deadline and no retry of validation errors. Repeat the real account rice test afterward. Intermittency is supported by direct evidence, but it does not prove the cause of every running-server 502. Do not replace the endpoint or disable redirect protection on this evidence alone.
- A successful barcode is not proof of broad food-text search, Indian food coverage, prepared-dish composition, or comprehensive nutrient completeness. There is no API pagination in the current adapter: at most 20 upstream products per search.
- `FDC_API_KEY` was absent from the runner environment; the supplied task states it is absent. The running process environment was not dumped. USDA was **not live-tested**; no demo key was used. Current code selects USDA for text searches only when a configured key exists; barcodes always use OpenFoodFacts. Real licensed/configured food composition coverage is separate work, not something demonstrated by this smoke.

## Redirect and credential-isolation checks

1. **Smoke API HTTP helper, actual local HTTP redirects:** GET and POST against each of 301/302/303/307/308: **10/10 rejected**, **0 redirect-target requests**. Only synthetic cookies/body markers used. This confirms the script's `redirect: 'error'` prevents replay to the target.
2. **Actual unchanged provider router in an isolated harness:** local transport substitution supplied each of the five redirect statuses, while preserving the router's fetch options. **5/5 returned 502 `PROVIDER_UNAVAILABLE`; 0 target requests; 0 inbound sensitive headers forwarded** (`Cookie`, `Authorization`, `Origin`, `x-diabeatit-client`). No real credentials and no running-server modification. The production API cannot be made to use an arbitrary upstream URL, so this is controlled component evidence, not live upstream redirect fault injection.
3. **Running account API:** URL-like medicine query and extra food `redirect` parameter both returned **400 `VALIDATION_ERROR`**, in both full runs. No external URL was followed by the client.
4. Source inspection confirms fixed HTTPS host allowlist, manually constructed public headers, and no inbound account headers forwarded. This is not a comprehensive security audit or an observation of all network traffic from the live server.

## Reproduction and limits

Use [scripts/live-provider-smoke.mjs](../scripts/live-provider-smoke.mjs) with Node: `node scripts/live-provider-smoke.mjs`. Optional `--public-only` runs public diagnostics without an account; its exit 0 only means diagnostics completed, **not** that providers all worked. Full mode intentionally fails on an empty `metformin` label search because transport success is not content breadth. Changing the desired search semantics should be explicit, not disguised by changing that criterion.

The script sends `Origin: http://127.0.0.1:3001`, `x-diabeatit-client: web`, and the account cookie only to the fixed local API; never to public providers. Startup/cleanup attempts are capped at three, registration is not replayed after an uncertain response, and cleanup is in `finally`. Abrupt process termination or persistent server outage can still prevent deletion; inspect `accountDeleted`, never assume cleanup. No credentials, account IDs, recovery codes, cookie values, raw provider bodies, or clinical excerpts are output. The script does not read API keys or use a demo key. It does not write evidence files automatically.

The isolated provider redirect harness was run separately with Node/tsx, Express and Supertest; the reusable smoke script includes the client-helper redirect fixture, not that harness. No build/test suite was run and no server was restarted by this investigation. Only the two authorized new files were created.

Reference data are **not clinical validation**, personalized advice, interaction screening, prescribing guidance, or clinical clearance. US product labels may not match Indian products or current revisions; excerpts are bounded and can be incomplete. Community/manufacturer food values require package, preparation, edible-weight, and unit checks; missing nutrients must stay unknown. Up to five minutes of process-local caching can affect repeat success results. A single label or barcode and one isolated rice list do not establish comprehensive knowledge-base or food breadth.