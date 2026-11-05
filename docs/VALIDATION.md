# Local validation evidence

Date: 3 November 2026. Environment: Windows, Node 26.13.0, npm 11.20.0, Chromium supplied by Playwright.

## Passed

- TypeScript check and Vite production build.
- **48 unit/API/persistence tests** across three files.
- **13 end-to-end browser tests** across three files.
- Automated axe WCAG A/AA checks on five patient screens × two themes × desktop/narrow-phone layouts (20 combinations), plus desktop home and phone dark settings.
- No horizontal overflow in the checked 360px/390px phone and 1440px desktop scenarios, including larger-text checks across five destinations.
- Manual visual inspection of desktop light and phone dark full-page screenshots.
- Glucose entry preserves measurement value/unit and survives browser reload.
- Uncertain intake remains uncertain; duplicate records for the same demo occurrence are not created.
- Reviewer workflow resolves fictional request, publishes plan-note version, and resets patient acknowledgement.
- Uncertain comprehension does not acknowledge; explicit current-plan answer can.
- Companion permissions remove hidden records from server responses; unauthorized mutations, export and revoked-role switching rejected.
- PDF fixture upload, signature rejection, download, and document redaction.
- Patient JSON export download, appointment print layout, reset, deletion.
- Offline mutation fails visibly and retains form input.
- Optimistic-concurrency conflicts return 409 without replacing newer data.
- PGlite clean close/reopen regression retains stored data.
- Interrupted local database recovered after correcting OneDrive read-only directory attributes; 35 fictional sessions retained during the recovery check. Startup now handles those generated-directory attributes on Windows.
- `npm audit`: **zero known vulnerabilities** at final audit time. This is not a penetration test or a guarantee against unknown issues.
- Built-assets smoke test against port 3001: successful demo onboarding and navigation, same-origin CSP, service-worker activation, manifest/PNG icons, zero API cache entries, no browser runtime/CSP errors.

## Build notes

Initial dependency versions were updated to patched Zod 4.6.7, Vitest 4.1.12 and Sharp 0.35.5. Native CLI dependencies were removed from the web demonstrator because their transitive advisory fixes were not available in the registry versions checked. PGlite remains PostgreSQL-17-compatible 0.3.16; do not upgrade its database format without migration.

Vite emits two harmless third-party Zod PURE-comment annotation warnings. The production build succeeds. These are not application errors and no warning suppression was added.

## Not verified / not implemented

- Android/iOS native builds, physical-device haptics, platform health APIs, background notifications, manufacturer feeds.
- External PostgreSQL, public deployment, TLS proxy setup, cloud backup restore, load/capacity, distributed rate limiting.
- Real users, real invitations, real clinical review, independent nutrition or education validation.
- Live OCR, clinical interaction API, verified nutrient catalog ingestion.
- Human narration, reviewed Hindi medical content, rendered clinical videos.
- Assistive-technology user testing and representative older-adult usability study.
- Clinical outcomes, willingness to pay, competitor superiority, regulatory clearance, real-patient production readiness.
- CI workflow is included in the workspace but has not run on a remote CI service. No Git commit or remote publication was performed.

Test screenshots and traces are generated under ignored `test-results/`. Re-run the documented checks after changing the application.