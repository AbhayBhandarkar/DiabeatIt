# Account product end-to-end tests

Separate from the archived demo suite. Uses the already-running built application at http://127.0.0.1:3001; never starts, stops or rebuilds app servers. Run with `npx playwright test -c playwright.product.config.ts`.

- Desktop 1440 and mobile 390 run functional journeys and light/dark audits. Width 320 runs both all-screen audits.
- Registration uses random `example.invalid` accounts and generated passwords through the actual UI, including recovery acknowledgement and Escape gating. Worker-owned test accounts reduce auth-rate-limit pressure; every account is deleted in fixture cleanup. No existing user data is altered.
- Companion acceptance/revocation uses two independent contexts. API setup creates records but UI performs invitations, consent scopes and task creation. Backend permissions are checked independently of disabled buttons.
- Medicine uncertainty stays explicit; corrections retain occurrence identity/history. Unknown nutrition remains null through recipe/portion arithmetic.
- Knowledge tests intercept only browser knowledge endpoints for deterministic success/empty/error states. They are not live-provider certification.
- All three local MP4s must decode and actually play. Seeking cannot bypass 31-second checkpoints or count as watched completion. Transcript completion requires deliberate acknowledgement and a correct answer.
- Axe WCAG 2/2.1 A/AA scans all seven screens in both themes, at 320/390/1440. Assertions are not disabled for existing app defects. Educational fiction disclosure is allowed in Learn; seeded patients, demo roles and fictional account records are not.
- Reports: ignored `playwright-report/product/` and `test-results/product/`. No auth traces, videos, automatic screenshots, storage state, recovery codes, passwords or invitation tokens are written. Custom audit attachments contain selectors and accessibility failures only. Playwright may produce error-context DOM snapshots on failure, so never attach or share them without checking for sensitive fields if authentication itself fails.
- Real-user workflows remain subject to auth rate limits. No sleeps, rate-limit bypasses or unbounded loops. A rebuild during execution may invalidate asset requests; rerun affected tests only after confirming assets are stable.