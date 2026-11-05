# Backend v2 integration handoff

## Mounting (main agent)

The named export and default export from [index.ts](index.ts) are both:

`async createV2Router(db: Database): Promise<Router>`

It uses the existing [Database interface](../db.ts) through the relative `../db` type import. It never needs a transaction/connection API and never opens another database.

At startup, await `createV2Router(db)` once and mount its result with `app.use('/api/v2', router)`. Await initialization **before listening**. Mount **after** the existing JSON parser, cookie parser, origin/client-header enforcement and request security middleware, but **before** the legacy `/api` authentication middleware. Nothing under v2 falls through to the legacy routes. This change is intentionally left to the main agent.

Keep the existing `express.json({ limit: '3mb' })`, or an equivalent limit: 2 MiB of file bytes requires approximately 2.8 MB of base64 JSON. Parent middleware must enforce the existing `X-Diabeatit-Client: web`/allowed-origin policy on mutations. The router assumes those checks already ran; it is not a standalone application. Parent-parser errors occur before the router; normalize their error shape in the parent if the client depends on `ErrorResponse` for malformed/oversized HTTP bodies too.

The consistency follow-up changes only this v2 directory, shared v2 types, v2 tests and the product Medicines screen. No new dependency is required. Do not change the old demo session into an account session or migrate its contents implicitly.

## Shared exports and conventions

[../../shared/v2.ts](../../shared/v2.ts) is the source of truth for request and response types.

- Identity: `User`, `Author`, `Space`, `MeResponse`, `RegisterRequest`, `RegisterResponse`, `LoginRequest`, `ChangePasswordRequest`, `RecoverRequest`, `DeleteAccountRequest`.
- Records: `entityKinds`, `EntityKind`, `Scope`, `allScopes`, `Entity`, `EntityCollections`, `EntityDataMap`, `CreateEntityRequest`, `UpdateEntityRequest`, `DeleteEntityRequest`; concrete `MedicineData`, `IntakeData`, `GlucoseData`, `Nutrition`, `MealData`, `RecipeIngredient`, `RecipeData`, `DocumentData`, `DocumentMetadata`, `QuestionData`, `TaskData`, `SymptomData`, `LessonData`, `ReviewData`.
- Sharing/history: `Grant`, `Invitation`, `AuditRecord`, `AuditQuery`, `AuditResponse`, `SnapshotResponse`, `ExportResponse`, `InviteRequest`, `InviteResponse`, `AcceptInviteRequest`, `AcceptInviteResponse`.
- References: `KnowledgeSearchQuery`, `MedicineReference`, `MedicineSearchResponse`, `MedicineDetailResponse`, `LabelSections`, `DrugLabel`, `LabelsResponse`, `FoodsSearchQuery`, `FoodResult`, `FoodsResponse`.
- Common: `OkResponse`, `ErrorResponse`.

All request objects are strict: unknown keys are rejected, not accepted as role/authority claims. Reserved prototype keys are rejected before schema transformations. JSON nesting and data size are bounded. IDs are UUID strings; dates are valid `YYYY-MM-DD`, times are `HH:mm`, timestamps are ISO strings with offsets. Response timestamps are UTC. Audit IDs are decimal strings, not JS numbers.

`Entity` is returned **directly**, not wrapped in `{entity: ...}`. Its `author` is the server-assigned latest writer `{id,name,role}`, and `createdAt` remains the original creation time. Only `owner` and `companion` roles exist. All medicines are patient-reported records, and reviews are coordination notes: neither represents a prescription, verified professional, signoff, or clinical clearance.

## HTTP contract

All paths below are relative to `/api/v2`. Successful responses are JSON except document downloads. All responses are `Cache-Control: no-store`.

| Method/path | Request | Successful response |
|---|---|---|
| POST `/auth/register` | `RegisterRequest`: name, email, password, consent literally true | 201 `RegisterResponse`: **MeResponse plus recoveryCodes** |
| POST `/auth/login` | `LoginRequest`: email, password | 200 `MeResponse` |
| POST `/auth/recover` | `RecoverRequest`: email, recoveryCode, newPassword | 200 `OkResponse`; invalidates every previous session; sign in again |
| GET `/me` | Account cookie | 200 `MeResponse` |
| POST `/auth/logout` | No body required | 200 `OkResponse`; deletes current session and clears cookie |
| POST `/auth/password` | `ChangePasswordRequest`: currentPassword, newPassword | 200 `OkResponse`; invalidates all sessions; sign in again |
| DELETE `/account` | `DeleteAccountRequest`: password, confirmation literally `DELETE` | 200 `OkResponse`; deletes account-owned records and clears cookie |
| GET `/spaces/:spaceId` | Authorized account | 200 `SnapshotResponse` |
| POST `/spaces/:spaceId/entities` | `CreateEntityRequest`: kind, data | 201 `Entity` |
| PUT `/spaces/:spaceId/entities/:entityId` | `UpdateEntityRequest`: current version, full replacement data | 200 `Entity`, version incremented by one |
| DELETE `/spaces/:spaceId/entities/:entityId` | `DeleteEntityRequest`: current version | 200 `OkResponse` |
| GET `/spaces/:spaceId/documents/:docid` | `documents:read` | 200 attachment with validated MIME; no inline rendering |
| POST `/spaces/:spaceId/invitations` | Owner; `InviteRequest`: label, scopes | 201 `InviteResponse`: id, token, expiresAt |
| DELETE `/spaces/:spaceId/invitations/:recordId` | Owner | 200 `OkResponse`; only outstanding invitations can be removed |
| POST `/invitations/accept` | `AcceptInviteRequest`: token | 201 `AcceptInviteResponse`: spaceId, grantId |
| DELETE `/spaces/:spaceId/grants/:recordId` | Owner | 200 `OkResponse` |
| GET `/spaces/:spaceId/audit?before=...` | Owner; optional decimal audit ID cursor | 200 `AuditResponse`: audit, nextBefore |
| GET `/spaces/:spaceId/export` | Owner | 200 `ExportResponse` as JSON attachment |
| GET `/knowledge/medicines?q=...` | Account; `KnowledgeSearchQuery` | 200 `MedicineSearchResponse` |
| GET `/knowledge/medicines/:setid` | Account; UUID set ID | 200 `MedicineDetailResponse` |
| GET `/knowledge/labels?q=...` | Account; exact generic or brand name | 200 `LabelsResponse` |
| GET `/foods/search?q=...` OR `?barcode=...` | Account; exactly one search parameter | 200 `FoodsResponse` |

Registration, login and recovery do not require an existing cookie; every other endpoint does. `/me` has `{user:{id,name,email},spaces:[{id,name,role,scopes}],spaceId}`. The default space is the first owned space, then the earliest shared one; it is not a persisted active-space selection. The client selects another listed space using its ID.

## Accounts and recovery

- Trim/lowercase email with a unique database constraint; no claim of verified email ownership. Names and email addresses are never authority credentials.
- Passwords: 12–256 characters, async scrypt N=32768/r=8/p=1, independently random 16-byte salt and 64-byte result; timing-safe comparisons. No plaintext password storage or logging.
- Cookie `diabeatit_account`: random 256-bit bearer token; only SHA-256 stored; HttpOnly, SameSite=Strict, path `/api/v2`, absolute seven-day expiry. Secure automatically in `NODE_ENV=production` or with `COOKIE_SECURE=true`; use HTTPS. Login rotates a presented cookie. Logout revokes only that session.
- Every request joins the persisted session, expiry, account and credential generation. Password changes/recovery increment the generation and delete old sessions, so a concurrent stale login cannot revive a revoked credential generation.
- Eight independent 256-bit recovery codes appear **only in the registration response**. The UI must show/store them offline immediately; never put them into URLs, analytics, logs, or local persisted health state. Only hashes are stored. Each code is single-use, and unused codes remain valid until used or the account is deleted. There is no email reset service, code regeneration endpoint, or support bypass.
- Register/account/blank space/session/recovery-code creation is one data-modifying CTE, including the initial audit event.
- Auth: 60 attempts per IP per 15 minutes; registration/login/recovery additionally 10 per normalized email per 15 minutes. Password and deletion attempts also use the IP limit. Invitation acceptance: 30 attempts/minute/IP. The parent may impose additional global limits.
- All `/spaces` routes have separate per-account read (240/minute) and mutation (120/minute) budgets across space IDs, including rejected attempts. Reference requests have their own IP budget; reads cannot exhaust the mutation budget. Stores are process-local, not a distributed quota or total-storage cap.

## Sharing and entity validation

Scopes are exactly `<kind>:read` and `<kind>:write`, for each of the eleven `entityKinds`. Invitations reject duplicate/unknown scopes and require the corresponding read scope whenever a write scope is included. Owners have all 22 scopes. An unshared or revoked space is 404; insufficient scope on an accessible space is 403.

Snapshots always contain **all eleven arrays**, including `intakes`. Unshared collections are empty arrays. Companions receive empty `audit`, `grants`, and `invitations`, not owner metadata. Owner snapshots list outstanding unexpired invitations without any token/hash. Tokens expire after 48 hours. Exchange links manually; there is no outbound email. Acceptance atomically consumes one invitation, creates one grant and records an audit event. Self-acceptance and duplicate grants return 409; a failed grant insertion rolls back token consumption. Re-sharing after revocation requires a new invitation.

- Medicines: full reported fields from `MedicineData`; unique `HH:mm` times (up to 24), unique days 0–6 (Sunday=0), valid start/end ordering, nonnegative integer stock. No automatic dosing/prescribing action.
- Intakes: `date` is the patient-reported occurrence calendar date, at most **IST today** (Asia/Kolkata), not the UTC submission date. `scheduledTime` identifies an entered slot, not the actual intake timestamp; a later slot today does **not** block recording what already happened. This model does not capture the actual intake instant separately. A new/moved occurrence must reference an active medicine in the **same patient space** and match its entered times, weekday and inclusive start/end dates. A storage trigger locks that medicine during validation; no clinical/dose inference is performed. Existing occurrence identity may retain status/reason corrections after archival or schedule edits, without revalidating the old slot against the current schedule. Changed identity is validated as a new occurrence. Unique SQL key `(space,medicine,date,scheduledTime)` prevents duplicates. Correct using the version, not another POST. Referenced medicines cannot be deleted while intake history remains. The Medicines screen exposes history corrections and no longer blocks early-morning IST reports or later scheduled slots today.
- Glucose: positive finite values, at most 2000 mg/dL or 111 mmol/L, valid nonfuture timestamp. These are recording limits, **not** safe/normal target ranges or clinical interpretation. Check units with the original reading.
- Meals: finite nonnegative grams, explicit nullable nutrients, nonfuture timestamp. Nutrition unknowns stay `null`; they are never silently treated as zero. Supplied source URLs must be HTTPS on the fixed reference-domain allowlist.
- Recipes: 1–1000 integer servings, 1–100 strictly validated ingredients and bounded instruction text. Quantities/nutrients are finite and nonnegative.
- Tasks/questions/symptoms/lessons/reviews: bounded text and enumerated states. Tasks require a calendar due date; symptoms cannot be future-dated; lesson position is 0–86400 seconds. Resolving a review requires a nonempty coordination resolution, not professional approval.
- Ordinary record data is limited to 64 KiB before validation and in storage; collection-specific string/array bounds apply too.
- Documents: PDF/PNG/JPEG only, strict canonical base64, maximum 2 MiB **decoded** bytes and checked magic signature. Create/PUT supplies `DocumentData` with base64; GET snapshots, write responses and export return `DocumentMetadata` with `{name,mime,size}` instead. Download uses a safe server-generated attachment filename, `nosniff` and sandbox CSP. File signatures are **not** malware scanning or full file-format validation.

## Storage, concurrency and deletion

The `v2_` relational namespace has separate accounts, sessions, recovery codes, patient spaces, grants, invitations, entities, document bodies and audit tables. Existing demo tables are untouched. Entities are **logically partitioned** by patient-space ID and kind with a composite index, not a single mutable application-state blob. This does not create native PostgreSQL partition tables; deployment-sized native partitioning/migration is a future operational choice. Foreign-key lookup and owner/grantee/expiry/audit indexes are present.

Entity create/update/delete and their audit entries execute in one SQL statement. Document-body replacement/deletion participates in the same statement/cascade. Version predicates implement optimistic concurrency: stale version = 409 with no partial record/blob/audit changes. Companion writes recheck permission in SQL and share-lock the grant against concurrent revocation. Use a fresh snapshot before retrying a conflict; never blindly overwrite with a new version.

Audit entries contain actor IDs, action, entity ID, version and timestamp, **not** submitted medical text/passwords/tokens. Database triggers forbid updates and direct deletion. Cascades for explicit owner/account erasure are allowed. Snapshots/export include the newest 500 events, ordered by the numeric database ID (not its serialized string); use `/audit` with `nextBefore` to retrieve older events. Cursors accept canonical positive signed-bigint IDs through 9223372036854775807; unknown parameters and malformed/overflow cursors are rejected. No endpoint permits direct audit writes. Entity mutations and their audit writes are atomic; rate-limited attempts write neither. This is mutation history, not a log of every read/access attempt. Entity arrays in snapshots/export are complete, not paginated: large-history clients will need paginated collection APIs before very large deployments. Multi-query snapshots are not transactionally frozen; individual entity revisions remain protected by optimistic concurrency.

Deleting an account removes its owned spaces, their records/upload bodies/audits/invitations/grants, its grants into other spaces, recovery codes and sessions via foreign keys. Other accounts and other owners' spaces/records remain. An account's historical author names/IDs and contributions in **another owner's** records/audit remain part of that owner's history; removed membership is audited there. The API performs logical database deletion, not guaranteed physical-media, backup, replica, or already-downloaded-file erasure. Set retention/backup and privacy policies accordingly.

## Reference providers

- DailyMed uses the official `/dailymed/services/v2/spls.json?drug_name=...` API. Details use documented `spls.json?setid=...` metadata and official label/PDF URLs. It does not parse XML or claim to have screened the label.
- openFDA `/drug/label.json` searches quoted exact generic/brand names using `.exact`, rejects Lucene metacharacters, and filters results for exact normalized name matches. Results retain product brand/generic/manufacturer/route, US region and an exact openFDA record-ID source link. A DailyMed set can resolve to another revision, so it is not presented as the original source of openFDA excerpts. Unsupported IDs are rejected, not sanitized into a different identity. Returned adverse-reaction/warning/interaction/indication fields are **source excerpts**, capped at four strings of 6000 characters per section; not comprehensive screening. Missing sections are empty arrays.
- Food text search uses OpenFoodFacts unless `FDC_API_KEY` is configured, when it uses USDA FoodData Central. Barcode search always uses OpenFoodFacts. USDA's key stays server-side in the `X-Api-Key` header. Unknown/invalid/negative/nonfinite nutrient values are null; USDA units must match g or kcal. No production fixture fallback exists.
- Public insight/reference access requires a live account, not medicine-read scope: owners and narrowly scoped companions can search public sources, even after a sharing grant is revoked. This grants no patient-data access. Only explicit search terms/barcode/set ID are sent upstream. No stored account/session headers, patient-space/entity content, or inbound headers are forwarded; extra patient/space query fields are rejected. A user could type private information into a search term; the server cannot guarantee that free-text queries themselves contain no PHI. Reference URLs are constructed from fixed HTTPS hosts and validated IDs; redirects are rejected. Render returned strings as text, never `innerHTML`.
- Provider requests: 8-second timeout, bounded 4 MiB streamed JSON response, schema validation, 30 reference requests/minute/IP; 5-minute bounded process cache (100 entries/8 MiB), coalesced identical requests, maximum 20 in-flight distinct lookups. Upstream errors are never cached. Limits may need tightening/shared coordination for provider quotas across users.
- Response result arrays cannot exceed the requested search page sizes: 20 DailyMed/food records or 10 openFDA labels. Excessive results fail as unsupported provider data rather than expanding the reference list. Cache hits still consume the reference request budget.
- Empty provider search results are legitimate empty arrays. Failure is 502, timeout 504, local concurrent lookup saturation 503: never show stale invented results or claim a successful lookup after an error.

## Errors, validation evidence and limitations

Router errors have `{error:string,code:string}`. Common codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED`/`INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT`/`REFERENCE_CONFLICT`/`INVITATION_UNAVAILABLE` (409), `DATA_TOO_LARGE` (413), `RATE_LIMITED` (429), `PROVIDER_UNAVAILABLE` (502), `PROVIDER_BUSY` (503), `PROVIDER_TIMEOUT` (504). Error bodies do not echo secrets or database details.

Consistency follow-up verified on 2026-11-03: **54 v2 tests passed** across four suites in PGlite memory; full-project `tsc --noEmit` passed. Tests exercise authentication/recovery/session revocation; ownership, scoped snapshots/downloads, revocation and invitation races; every record kind, injection/unknown fields, occurrence uniqueness, optimistic conflicts; audit immutability and atomic rollback; owner/companion deletion cascades; mocked provider URLs/results/errors/timeouts/cache and nutrient null handling. New coverage includes IST midnight/year/leap-day boundaries, reports before a scheduled slot, schedule days/start/end/unknown times, archived/rescheduled corrections, cross-patient and wrong-kind references, duplicate correction rollback, numeric multi-page audit ordering, bigint cursors, separate read/write budgets, reference-rate limits, scoped public insights without stored PHI forwarding, exact source identity, and excessive upstream result counts. The product Medicines changes were typechecked, not browser-tested in this follow-up; full-app integration remains with the main agent.

No live upstream-network, external PostgreSQL multi-connection, browser/UI, load, penetration, real healthcare, or regulated-readiness certification was performed. PGlite race tests issue concurrent API requests but its execution is serialized; SQL uniqueness/version/locking semantics should additionally be exercised against deployed PostgreSQL. Cache and rate-limit stores are **process-local**, not distributed. For multiple replicas, use shared rate-limit storage, provider quota coordination and a controlled schema-migration process; do not initialize schema concurrently across replicas. Configure trusted proxies narrowly, HTTPS, database encryption/access controls, backup retention, monitoring that excludes request secrets, quotas and abuse protection before deployment. This is not a regulated-ready clinical system.