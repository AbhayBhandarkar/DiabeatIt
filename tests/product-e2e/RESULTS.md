# Product browser validation — 2026-11-03

## Final run

Command: `npx playwright test -c playwright.product.config.ts`

- 25 configured cases: **14 passed, 10 failed, 1 intentionally skipped** (mobile drawer assertion on desktop).
- Duration: 203.99 seconds. No retries. TypeScript: `npx tsc --noEmit` passed.
- Target: http://127.0.0.1:3001, built JS asset `/assets/index-DRWWqTJs.js`, CSS `/assets/index-5X7FhiWd.css`. Port 5173 refused connections at the initial check.
- All 42 screen/theme/viewport checks completed (7 screens × 2 themes × 3 widths). **Zero document horizontal overflow** in every check.
- Final run account cleanups passed. Earlier exploratory runs omitted the required API client header and failed cleanup; those generated `example.invalid` accounts may remain. Their random credentials were intentionally not persisted, so this suite cannot safely identify/delete them later. No existing account was accessed or changed.

## Passed journeys

Both desktop 1440 and mobile 390 passed registration/recovery acknowledgement, empty unseeded workspace, logout/login; deterministic source lookup/filter/empty/error behavior; custom meal/favorite/recipe-portion arithmetic preserving null nutrients; two-account invitation acceptance, read/write boundaries and revocation; all three real MP4 players with playback, 31-second seek gate, wrong/correct checkpoint responses, skipped-video completion denial, exact transcript content and explicit persisted completion.

Medicine creation, schedule, unsure intake, correction, stable occurrence ID/version and audit assertions passed before the missing history control failed. The post-history archive assertions were not reached and are not claimed as validated.

## Reproducible issues in the served build

1. **Mobile drawer never appears (2 failures).** At 320×800 or 390×844, sign in and press **Open navigation**. The button changes to `aria-expanded="true"`, but **Main navigation** remains hidden. Bottom navigation and Account settings work. Tests explicitly fail the drawer independently; other journeys use these working UI routes, not forced clicks or DOM mutations.
2. **Intake history unavailable (2 failures).** Add a medicine with all weekdays and time 00:01 IST; record Unsure; correct to Not taken; reload and open Medicines. The **Intake history** button is absent. Current source contains it, but the served built asset does not expose it. Treat this as a build/source deployment mismatch until rebuilt and retested, not proof that the current source implementation is broken.
3. **Light-theme desktop contrast (within 1 of the 6 audit failures).** At 1440×1000, select Light and open any main screen. Sidebar eyebrow, Settings & privacy and Help & support use foreground `#075e66` on `#122e3b`: **1.89:1**, below 4.5:1. Axe rule `color-contrast`, serious.
4. **Lesson button label mismatch (all 6 audit failures).** Open Learn in either theme at any tested width. Three buttons visibly say **Explore lesson**, but their accessible names say **Start lesson: [title]**, omitting the visible text. Axe rule `label-content-name-mismatch`, serious. No rule exclusions were added.

## Output

- HTML: `playwright-report/product/index.html`
- JSON (includes base64-encoded `screen-audits.json` attachments with all 42 measurements): `test-results/product/results.json`
- Failure contexts: `test-results/product/artifacts/`

These are under the existing ignored report directories. No repository metadata was present, so Git could not independently confirm ignore handling; the existing ignore file lists both parent directories. App files, build assets, archived E2E tests and the original Playwright config were not edited. Live external-provider certification remains outside this deterministic browser suite.