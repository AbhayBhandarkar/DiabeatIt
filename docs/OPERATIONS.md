# Engineering and operating notes

## Architecture

React/TypeScript → same-origin Express API → PostgreSQL-compatible store.

The current storage boundary is an isolated **fictional demo session**, not a real patient organization. State lives in a JSONB aggregate with a monotonically increasing version. Actions are validated with Zod, authorized by role and consent, applied to a cloned state, and saved with a compare-and-swap SQL update. Stale mutations return 409. SQL parameters are bound, never interpolated from user input.

Opaque 256-bit random session tokens are stored only in HttpOnly cookies; database records store SHA-256 token hashes. Demo role changes are intentionally exposed to the session owner and increment the version. This is **not production RBAC authentication**.

PGlite uses local disk and is appropriate for this single-process demonstration. Do not run multiple app instances over the same directory. Use an external PostgreSQL service when validating multi-instance deployment. The pg connection path is not yet integration-tested here.

On Windows, startup clears the read-only attribute on the generated database directory and its contents. OneDrive applies directory attributes that Emscripten otherwise interprets as Unix write denial. This does not alter Windows ACLs. A forced-stop recovery was exercised locally without deleting records. Keep the PGlite major/data format pinned: the tested 0.3.16 library uses PostgreSQL 17; newer PostgreSQL 18 data formats require migration, not an in-place dependency upgrade.

## Security controls present

- SameSite=Strict cookie, optional Secure attribute for HTTPS.
- Exact configured-origin check and mandatory custom request header on mutations; no permissive CORS.
- Helmet response headers and same-origin CSP for the built app.
- API cache-control no-store; service worker excludes every API route.
- Rate limits, strict request size limit, text bounds, event/document limits.
- Role-scoped actions and redacted companion responses.
- Source documents delivered as attachments, not inline HTML.
- PDF/PNG/JPEG signatures and 2 MB size check. These do not replace antivirus.
- Compare-and-swap updates and explicit 409 conflicts.
- Audit entries for updates; history available to patient/reviewer, not companions.

## Known security and operational gaps

- No production identity, MFA, account recovery, organization membership, legal representatives, or invitation service.
- Local files/backups are not application-level encrypted. Use appropriate encrypted storage and managed keys before any real-data deployment.
- Documents are stored as base64 in the aggregate, not hardened object storage; no malware scanner.
- Rate-limit counters are process-local; multi-instance hosting needs a shared limiter and carefully configured proxy trust.
- Session deletion removes the live row, not previously exported copies or backup history.
- Expiry cleanup is request/startup driven. Schedule and monitor retention jobs for any hosted use.
- No vulnerability penetration test, load/capacity certification, real clinical audit, or legal compliance certification performed.
- Notification delivery, provider integration, and live monitoring are unavailable.

## Local demonstration operation

Run `npm run dev` for frontend + backend. Run `npm start` only if a backend is not already active. The process listens on loopback; do not expose it to untrusted networks without deliberate review.

The API health route is `/api/health`. It checks database reachability and explicitly returns `realPatientUse: false`.

For HTTPS staging, configure `APP_ORIGIN` exactly and `COOKIE_SECURE=true`, terminate TLS in a reviewed proxy, keep credentials in the host secret store, and confirm API health and blocked-origin tests. The default CSP is for same-origin hosting. Do not add wildcard network permissions to bypass failed deployment checks.

## Backup and recovery

For local PGlite: stop the app cleanly, copy the entire `.data/diabeatit` directory to a protected location, then restart. Never copy a partially running database and assume it is consistent. For external PostgreSQL: use native database backup tooling and test restore into an isolated environment.

The patient JSON export is a readable record export, **not** a complete database disaster-recovery backup. An import endpoint is deliberately absent to avoid arbitrary data injection.

## Real-patient migration direction

Split the aggregate into patient, organization, membership, consent, prescription document, medication identity, reported use, reconciled plan, scheduled occurrence, intake report, observation, review, and append-only audit tables. Carry source provenance and versions forward. Add signed professional identity and jurisdictional scope before any plan-authoring functionality.

Integrations should sit behind typed adapters. Each adapter must expose availability, last-success time, source measurement time, coverage limits, and actionable failure states. Never turn a missing result into a green safety clearance.

## UI constraints

India time defines the demonstration's scheduled medication day. Device-local datetime inputs are converted to ISO timestamps. Displayed journal times explicitly use IST. An app tap is not proof of ingestion; two disconnected clients cannot prevent duplicate physical dosing.

Larger text and reduced motion are supported. Automated accessibility checks are not a substitute for testing with older adults, screen readers, low vision, tremor, or cognitive impairment.