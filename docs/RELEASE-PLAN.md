# Release plan: engineering, operations and clinical gates

## Current answer

This is not a real-patient production release. The product has working local account, record, sharing, search and learning paths; that does not establish operational scale, clinical validity or regulatory readiness.

## Ordered work and acceptance criteria

| Priority | Deliverable | Acceptance evidence | Current status |
|---|---|---|---|
| P0 | Preserve/recover original local database | Restore a verified backup into an isolated location; reconcile record counts and owners | Blocked: original checkpoint invalid; not reset/deleted |
| P0 | Managed PostgreSQL staging | Provisioned service, TLS, restricted credentials, connection budget; integration suite against actual PostgreSQL | Connection adapter exists; no provisioned service/credentials |
| P0 | Controlled schema deployment | Single migration job, advisory lock, transactional schema, runtime account without DDL | Migration command and fail-closed runtime gates implemented; external PG execution unverified |
| P0 | Backup/restore drill | Encrypted backup, defined RPO/RTO, restore into separate service, count/permission checks | Not performed; no production data may be accepted before this |
| P1 | Identity/abuse controls | Email verification, recovery policy, session inventory, professional MFA, credential-stuffing controls | Password sessions/recovery codes exist; broader controls outstanding |
| P1 | Document protection | Object storage, malware scan, retention, authorized short-lived downloads | Current DB documents/signature checks are development scope |
| P1 | Measured capacity | Declared concurrent-user target, p95 latency/error/memory thresholds, representative mixed load | No load-tested capacity claim |
| P1 | Pagination and bounded exports | Cursor-based entity history and background export jobs without full history snapshots | Audit paginated; entity snapshots still unbounded |
| P1 | Multi-replica operation | Shared rate limits/provider quotas, revocation tests under concurrent PG connections | Process-local caches/limiters; do not scale replicas blindly |
| P1 | Observability | Request IDs, PHI-free metrics, uptime/job alerts, incident runbook | Health endpoint exists; full operational monitoring outstanding |
| P1 | Clinical knowledge | Licensed India product coverage and interaction knowledge, pharmacist gold-set evaluation | Public US labels only, not combination safety screening |
| P1 | Photo nutrition | Configured/approved vision provider, consent, accuracy study, verified nutrient mapping | Identification connector built; credentials absent; no invented micronutrients |
| P1 | Editorial release | Clinical review of exact scripts, captions, diagrams and translations, dated reviewer approval | Source-linked original content; no clinician signoff |
| P2 | Native functions | Signed mobile builds, device tests for notifications/health APIs/reboot/timezones | Not built/validated |
| P2 | Older-adult usability | Representative 40–75-year-old participants, task/comprehension tests and assisted accessibility testing | Automated checks are not a substitute; study not performed |
| P2 | Monetization | Validated willingness to pay, service cost model, entitlement/billing and cancellation tests | Business hypotheses only; subscriptions intentionally absent |

## Changes in this delivery

- Four local recipe photographs, visually inspected, cropped/resized WebP. Attribution is visible in the UI and recorded in public/recipes/credits.json. All are CC BY-SA 4.0; derivatives must retain that license and credit. Photographs illustrate serving ideas, not exact authored recipes or measured portions.
- Refreshed blue video assets plus a new glucose-journey video: digestion, pancreas, insulin signalling, muscle cell and reduced response. All four are 48 seconds, fully decoded, with captions, transcript, source support and timed checkpoint. A schematic is not an anatomical scan. Synthetic narration is disclosed; professional voice and clinical review are outstanding.
- Learning is one visible video library; there is no “earlier” or “legacy” section in the patient UI. Existing learning progress and video identifiers remain valid.
- Production startup rejects embedded DB, non-HTTPS/ambiguous origin, insecure cookie configuration and missing schema acknowledgement/version. These guardrails prevent an accidental production flag from being mistaken for a safe deployment.
- Docker deployment template runs as a non-root user and has a health check. It has not been built or deployed here; it does not provision infrastructure, create secrets, or demonstrate production readiness.

## Staging procedure (requires infrastructure owner)

1. Provision an isolated managed PostgreSQL instance and HTTPS application origin. Do not copy the damaged embedded database into it or assume cross-format compatibility.
2. Set DATABASE_URL securely for an administrative migration job and run `npm run db:migrate`. Verify app_schema_versions contains version 1. Never print secrets into chat/logs.
3. Configure runtime DATABASE_URL with reviewed least-privilege rights; set NODE_ENV=production, APP_ORIGIN to exact HTTPS origin, COOKIE_SECURE=true, SCHEMA_READY=true. Match pool limits to instance size. Schema initialization is not run by replicas.
4. Build/run the container in a private staging network behind the TLS ingress. Validate origin rejection, secure cookies, account isolation, sharing revocation and media byte-range responses.
5. Test backup/restore, error paths, migrations and rollback strategy before accepting any real records. Assess Indian privacy and applicable medical-device requirements with qualified reviewers.

No account/provider credentials, signed deployment authority, licensed clinical dataset, clinician review or recovery backup can be manufactured by writing application code. Those are explicit release blockers, not UI tasks.

## Verification for this delivery — 4 November 2026

- TypeScript/Vite build passed.
- 165 tests across ten files passed, including fail-closed production configuration checks.
- Full browser suite: 28 passed, one expected desktop-only skip. New glucose-journey playback, captions, checkpoint, transcript and saved completion passed on desktop and phone.
- Recipe-photo loading, visible attribution, modal context and mobile layout passed; screenshots were inspected. That inspection caught an active-tab hover contrast defect; it was fixed and two targeted browser tests passed again after rebuilding.
- All four rendered MP4s passed full decode: 48 seconds / 1,152 frames each. The new contact sheet was visually inspected.
- Built-app smoke passed including four media byte-range responses, no API/video cache entries, and temporary-account cleanup.
- The first audit in this delivery reported zero known vulnerabilities. A later repeat was blocked by the package-feed audit endpoint with HTTP 429; that repeat is **not** a fresh clean audit result. Dependencies were not changed during this delivery.
- Docker, psql and pg_dump were not available through PATH. The Docker template and external PostgreSQL migration were not executed here. Runtime guards were unit-tested; no deployed production environment is claimed.
- Original database remains unrecovered and untouched. Browser checks used the explicitly separate validation database, not the original patient/account data.