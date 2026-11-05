# Product status — 2026-11-04

## Active implementation

The entry point [src/main.tsx](../src/main.tsx) loads the rebuilt account app in [src/product/App.tsx](../src/product/App.tsx). [server/index.ts](../server/index.ts) initializes and mounts v2 before listening. `/api/health` reports `mode: account-workspaces`, `clinicalScreening: false`, and `realPatientUse: false`. Legacy demo routes are not active in this server mode. A fresh registration creates a blank owner workspace, not a seeded patient story.

**This is a records/coordination/education engineering prototype. Use synthetic data. No clinical review or clinician signoff has occurred.** Functional accounts do not establish production privacy, clinical safety, or regulated readiness.

## Implemented scope and its limits

| Area | Implemented | Boundary |
| --- | --- | --- |
| Accounts | Password registration/login/logout; hashed passwords/session tokens; HttpOnly cookies; one-time-displayed recovery codes; password reset/change; account deletion | No verified email ownership, OIDC, MFA, emailed reset, or support recovery bypass. |
| Records | CRUD across 11 entity kinds: medicines, intakes, glucose, meals, recipes, documents, questions, tasks, symptoms, lessons, reviews | Patient-reported records and coordination notes, not prescriptions, verified observations, or professional approval. |
| Consistency/audit | Relational entity rows with space/kind indexes; optimistic versions; atomic entity mutation plus audit write; document-body changes included | Logical grouping, not native PostgreSQL partition tables. Audit records mutations, not every read. Multi-query snapshots are not frozen transactions. |
| Sharing | Real expiring, single-use invitations; scoped owner/companion access; acceptance and revocation | Owner manually shares the invitation. No outbound delivery, professional identity verification, staffed review, or complete professional service. |
| Sources | DailyMed metadata/label links; openFDA label excerpts with source identity/region; food source links and nullable nutrients | Public reference search, not patient-specific interaction screening. No verified safety/health score; missing results never establish safety. |
| Food providers | OpenFoodFacts; optional USDA FoodData Central via server-side `FDC_API_KEY`; barcode lookup uses OpenFoodFacts | Availability, coverage, units, and source accuracy need scrutiny. Not a verified Indian nutrition catalog or glucose prediction. |
| Education | Three integrated 48-second rendered Manim MP4s with posters, local SAPI synthetic narration, VTT captions, transcripts, chapter/checkpoint metadata, explicit account progress saves | Original educational examples; not clinician-reviewed, human-narrated, or a clinical competency assessment. |
| Web delivery | Built same-origin app, CSP, manifest/icons, service-worker public-shell asset cache, HTTP video byte ranges | No cached API health records or whole lesson-video cache. No guaranteed offline workflows or background alarms. |

The product video player pauses at checkpoints and gates completion; seeking to the end alone does not establish completion. Its accessible transcript path requires explicit confirmation and a correct checkpoint answer. The independent preview described in [media/README.md](../media/README.md) has different checkpoint rules; do not substitute its validation for product integration testing. Narration uses offline Windows SAPI (Microsoft Zira), and caption alignment is approximate phrase timing, not word-level forced alignment.

Source links and source metadata are provenance, **not verification, endorsement, comprehensive label analysis, or clearance to combine medicines**. Only explicit reference queries are sent to providers; users should not enter private health details into those search terms. Unknown nutrients remain unknown rather than becoming zero.

## Absent / not claimed

- No full professional service, clinician credential verification, clinical review workflow/signoff, or staffed monitoring.
- No OIDC/MFA, verified-email identity, email invitation delivery, or email password reset.
- No shipped native app, HealthKit/Health Connect/CGM integration, or reliable background medication reminders. [capacitor.config.ts](../capacitor.config.ts) is unused scaffolding.
- No OCR, licensed interaction engine, personalized dosing/prescribing, automated treatment changes, or clinically verified score.
- No clinical review, regulated certification, penetration-test certification, or assurance of suitability for real patient data.
- No external PostgreSQL multi-connection deployment, distributed rate-limit/cache, load, backup/restore, physical-device, or comprehensive assistive-technology validation claimed here.

## Verification ledger

Evidence must be scoped to what actually ran, not inferred from implemented tests or historical reports.

| Evidence | Status |
| --- | --- |
| Non-video unit/API/persistence tests | Last reported handoff: **138 passed**, separate from the video run. Not independently rerun during this documentation update. |
| Product video component tests | Last reported handoff: **5 passed separately**. Real browser/media with mocked account context; not full account E2E. |
| Combined current `npm test` run | No completed result claimed here; another run was reported pending/possibly overloaded. No processes stopped by this update. |
| Full rebuilt product E2E | **Pending main validation. Do not claim all passed.** Default command now selects the product config, not legacy tests. |
| Historical product browser report | [tests/product-e2e/RESULTS.md](../tests/product-e2e/RESULTS.md) records 14 passed, 10 failed, 1 skipped against an earlier served build. It is not proof of the rebuilt app's current result. |
| Independent media production/player | [media/validation.json](../media/validation.json) and [media/browser-validation.json](../media/browser-validation.json) record separate asset/player checks. Human listening, clinical, and physical-device validation are not established. |
| CI | Workflow configured to build, install Chromium, run unit/video tests and audit, then run product E2E against a built server. No hosted CI success asserted. |
| Production smoke | Checks health flags, anonymous login/logo, random-account cookie auth, `/me`, all 11 empty collections, public-shell cache exclusions, video byte ranges, and deletion of that account. It is not full E2E or provider/clinical certification. See update-specific result below. |

### Documentation/automation update verification

Targeted local verification completed on 2026-11-04:

- `node --check scripts/production-smoke.mjs`: passed syntax validation.
- `npm run test:e2e -- --list --reporter=list`: discovered **25 product cases in 6 files**, including desktop, mobile, and narrow projects; no browser test cases executed and no existing product report overwritten.
- Existing server health: HTTP 200, account-workspaces mode, clinical screening and real-patient use both false.
- `node scripts/production-smoke.mjs`: **passed** against the existing built server. Verified built login/logo/CSP, cookie-backed v2 identity, all 11 empty entity collections, active service-worker API/video cache exclusions, 206 responses with 1024-byte ranges for all three MP4s, and deletion of the generated account. No browser runtime/CSP errors observed.
- Editor diagnostics reported no errors in the changed script, package, Playwright config, CI workflow, or Markdown documents.

No full suite, rebuild, hosted CI run, or live-provider search was run for this scoped update; no existing process was stopped. The smoke script never prints credentials, cookies, recovery codes, invitation tokens, response bodies, or browser error text, and does not save browser recordings/traces. On failure it reports the failing stage and attempts to delete only the account it generated. A cleanup failure is a failing result, not a silent success; interrupted processes can still leave a synthetic account behind.

## Run and deployment boundaries

Follow the current [README.md](../README.md) and [.env.example](../.env.example). Build before starting the server or product E2E. The product config starts `npm start`, probes `http://127.0.0.1:3001/api/health`, allows 120 seconds, and reuses a healthy existing server. A reused server must be checked for build freshness. Do not run competing API processes on the same PGlite directory.

`HOST` defaults to loopback. `APP_ORIGIN` should match the actual browser origin; current middleware additionally accepts the local built origin. Set `COOKIE_SECURE=true` for HTTPS; account cookies are also Secure under `NODE_ENV=production`. The environment template is not automatically loaded. `FDC_API_KEY` is optional and server-only.

Record mutation/audit atomicity does not replace operational security. Before hosted use, establish narrowly trusted proxies, HTTPS, database access/encryption policy, shared quotas for replicas, migration discipline, backups/retention, secret-safe monitoring, and security/privacy review. Account deletion is logical live-database erasure, not guaranteed erasure of backups, exports, or contributions retained by another workspace owner.

## Reading older handoffs

[server/v2/README.md](../server/v2/README.md) remains useful for contracts and caveats, but its “mounting left to main agent” and older test counts are historical. [media/README.md](../media/README.md) documents media authoring and the standalone preview; its “not integrated” statements predate the current Learn screen. Neither has been rewritten in this scoped documentation update. Legacy demo guides and their validation counts are not current product release evidence.