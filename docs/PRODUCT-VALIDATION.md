# Final account-product verification — 2026-11-04

## Scope and execution

Verification only, against the current account product including the sidebar-hover fixes. No application, test, dependency, or configuration source was edited. The existing server at `http://127.0.0.1:3001` was reused; no server was stopped or restarted.

The requested commands ran sequentially in one PowerShell invocation, stopping at the first nonzero exit. Started **2026-11-04 02:41:37 +05:30** (2026-11-03 21:11:37 UTC); completed **2026-11-04 02:52:27 +05:30** (2026-11-03 21:22:27 UTC). All five completed successfully, without suite reruns. Build and browser-test commands regenerate their normal build/report artifacts; the only authored deliverables are this document and the requested visual screenshots.

## Results

| Check | Observed result |
| --- | --- |
| `npm run build` | **PASS** — TypeScript checking and Vite production build; 1,599 modules transformed. |
| `npm test` | **PASS — 143/143 tests, 8/8 files**, 300.02 seconds. Includes the video component and persistence tests in the same completed run. |
| `npm run test:e2e` | **PASS — 25 cases: 24 passed, 1 expected skipped, 0 failed, 0 flaky**, 197.145 seconds (3.3 minutes), one worker. |
| `node scripts/production-smoke.mjs` | **PASS** — built login/logo/CSP; account-mode health; cookie authentication and 11 blank collections; service-worker API/video cache exclusions; all three video byte-range responses; temporary account deleted; no browser runtime/CSP errors. |
| `npm audit` | **PASS — 0 vulnerabilities** reported. |

Browser breakdown: desktop 1440 × 1000 **10 passed / 1 skipped**, mobile 390 × 844 **11 passed**, narrow 320 × 800 **3 passed**. The sole skip is the desktop execution of “mobile menu opens an accessible navigation drawer”; both mobile drawer cases passed. The six light/dark all-screen audit cases cover seven screens across three viewports: **42 screen/theme/viewport checks**, with no asserted WCAG A/AA axe violations or horizontal-overflow failures. Functional cases cover accounts, knowledge/unavailable states, all three integrated videos, medicine/intake correction, meals/recipes, and sharing/revocation.

Fresh machine-readable evidence: [test-results/product/results.json](../test-results/product/results.json), with `errors: []`, `expected: 24`, `skipped: 1`, `unexpected: 0`, `flaky: 0`. The [HTML browser report](../playwright-report/product/index.html) is from this run. These results supersede the earlier failing/pending browser handoff for this locally tested build, without rewriting historical documents.

## Visual verification

**PASS — 12 PNGs captured**, 2026-11-04 **02:56:55–02:57:01 +05:30** (2026-11-03 21:26:55–21:27:01 UTC), using headless Playwright Chromium on Windows. The eight screen captures use light theme and full-page capture. Four additional viewport captures exercise both sidebar footer buttons on hover in light and dark themes.

| Screen | Desktop 1440 × 1000 | Phone 390 × 844 |
| --- | --- | --- |
| Today | [desktop-today.png](../test-results/product-visual/desktop-today.png) | [phone-today.png](../test-results/product-visual/phone-today.png) |
| Medicines | [desktop-medicines.png](../test-results/product-visual/desktop-medicines.png) | [phone-medicines.png](../test-results/product-visual/phone-medicines.png) |
| Food | [desktop-food.png](../test-results/product-visual/desktop-food.png) | [phone-food.png](../test-results/product-visual/phone-food.png) |
| Learn | [desktop-learn.png](../test-results/product-visual/desktop-learn.png) | [phone-learn.png](../test-results/product-visual/phone-learn.png) |

| Sidebar hover | Light | Dark |
| --- | --- | --- |
| Settings & privacy | [Light capture](../test-results/product-visual/desktop-sidebar-settings-hover-light.png) | [Dark capture](../test-results/product-visual/desktop-sidebar-settings-hover-dark.png) |
| Help & support | [Light capture](../test-results/product-visual/desktop-sidebar-help-hover-light.png) | [Dark capture](../test-results/product-visual/desktop-sidebar-help-hover-dark.png) |

- Both browser contexts loaded asset URLs matching the newly generated build. Service workers were blocked for visual freshness; the separate smoke verified service-worker behavior.
- All eight screen measurements reported **0 px horizontal overflow**.
- Both hovered sidebar buttons had computed text/background contrast **9.09:1 in light** and **9.37:1 in dark**; both exceed 4.5:1. This is a targeted computed-color check, not an exhaustive contrast certification.
- Opened and visually inspected the desktop light Help-hover and phone Learn PNGs. The sidebar hover label is readable and the phone lesson cards wrap within the screen width. The phone full-page PNG contains the fixed bottom navigation at its viewport position; it is a stitched full-document capture, not a physical-device screenshot or proof of every scroll position.
- API registration created one random synthetic owner account. API writes added one generic reported medicine, two explicitly synthetic glucose observations, one generic meal with unknown nutrients retained as null, and one task. No live-provider lookup, fabricated lesson completion, real patient data, or clinical recommendation was used.
- Registration's response body was discarded without parsing recovery codes. Password, generated email, and cookies remained in local variables; no trace, recording, storage-state file, credential file, or recovery-code screenshot was created.
- Cleanup ran in `finally`: **account DELETE returned 200; old-session `/me` returned 401; login with the deleted credentials returned 401**. `accountDeleted: true`, `deletedLoginRejected: true`.

### Browser console/runtime error list

- Visual run, both viewports: **console errors `[]`; uncaught runtime errors `[]`**.
- Production smoke: **no runtime or CSP errors observed**. Its console filter is CSP-specific, not a claim of exhaustive console capture.
- The E2E report has no runner errors; it is not a full browser-console transcript. Knowledge tests intentionally simulate provider failures, so their expected failure-state checks must not be confused with real upstream outages.

### Harness execution notes

Initial inline terminal attempts did not produce visual evidence: PowerShell multiline parsing failed (“The term '@ …' is not recognized”), terminal command rewriting changed JavaScript `&&` into semicolons (“SyntaxError: missing ) after argument list”), and a further inline attempt returned `^C`. The first Markdown-loader attempt also failed before executing the harness because of Windows CRLF line endings (“TypeError: Cannot read properties of undefined (reading 'split')”). These are recorded harness/tooling failures, not failing application assertions. The final successful invocation normalized CRLF and executed the JavaScript below directly from this document, avoiding shell rewriting. Only that completed run supports the visual results above.

## Live-provider evidence

Live upstream searches are deliberately not repeated in this final suite. [LIVE-PROVIDERS.md](LIVE-PROVIDERS.md) records the successful 2026-11-03 DailyMed search/detail and OpenFoodFacts rice/barcode observations, plus a successful exact `metformin hydrochloride` label query. Its unchanged live-smoke script still exited 1 because exact `metformin` yielded no labels; that coverage limitation is not an overall green live-smoke result. USDA remains untested. Browser knowledge tests use deterministic provider responses and do not establish current upstream availability.

## Boundaries

This is local engineering verification of a synthetic-data records, coordination, and education prototype. A local production-build smoke is **not deployed-production validation**. No hosted production, native app/physical-device, clinical validation, clinician signoff, real-patient suitability, or regulatory certification is established. Automated accessibility checks and screenshots do not replace comprehensive assistive-technology or human usability review. Dependency audit results are point-in-time known-advisory checks, not a security certification.

Earlier counts and pending statements in other handoff documents describe their own historical runs; this document records only the final run above.

## Reproducible visual harness

The following in-memory Playwright harness writes only PNG screenshots. Run its JavaScript body with Node as an async function from the workspace root. No script file, trace, storage-state file, account credentials, or registration response body is saved. The existing localhost server must already be running. Generated account values stay in local variables; registration's response is disposed without parsing recovery codes.

```javascript
const { chromium, expect } = await import('@playwright/test');
const { randomUUID } = await import('node:crypto');
const { readFile } = await import('node:fs/promises');
const baseURL = 'http://127.0.0.1:3001';
const headers = { 'X-Diabeatit-Client': 'web', Origin: baseURL };
const account = { name: 'Visual Reviewer', email: `${randomUUID()}@example.invalid`, password: `Visual!${randomUUID()}`, consent: true };
const report = { startedAt: new Date().toISOString(), screenshots: [], overflow: [], hover: [], consoleErrors: [], runtimeErrors: [], accountDeleted: false, deletedLoginRejected: false };
let browser, owner, attempted = false, failed = false, stage = 'startup';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const redact = value => String(value).replaceAll(account.password, '[redacted]').replaceAll(account.email, '[redacted]').replace(/[a-f0-9]{64}/gi, '[redacted]');
try {
	browser = await chromium.launch();
	owner = await browser.newContext({ baseURL, extraHTTPHeaders: headers, serviceWorkers: 'block' });
	stage = 'registration'; attempted = true;
	const registration = await owner.request.post('/api/v2/auth/register', { data: account });
	const status = registration.status(); await registration.dispose();
	check(status === 201, `registration status ${status}`);
	const identity = await owner.request.get('/api/v2/me'); check(identity.status() === 200, 'identity status');
	const { spaceId } = await identity.json();
	const cookies = await owner.cookies();
	check(cookies.some(c => c.name === 'diabeatit_account' && c.httpOnly && c.sameSite === 'Strict'), 'cookie flags');
	const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
	const now = new Date().toISOString();
	async function create(kind, data) {
		stage = `create ${kind}`;
		const response = await owner.request.post(`/api/v2/spaces/${spaceId}/entities`, { data: { kind, data } });
		check(response.status() === 201, `${kind} status ${response.status()}`);
	}
	await create('medicines', { name: 'Reported medicine A', ingredient: 'Unknown', strength: '', form: 'Tablet', route: 'Oral', instructions: 'Synthetic visual record only. No dose recommendation.', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6], startDate: today, status: 'active', source: 'Synthetic user-entered visual verification note' });
	await create('glucose', { value: 112, unit: 'mg/dL', measuredAt: new Date(Date.now() - 86400000).toISOString(), context: 'Synthetic visual observation only' });
	await create('glucose', { value: 118, unit: 'mg/dL', measuredAt: now, context: 'Synthetic visual observation only' });
	await create('meals', { name: 'Home meal record', meal: 'Breakfast', at: now, grams: 200, carbs: 40, fiber: null, protein: null, kcal: null, source: 'Synthetic user-entered values. Not verified nutrition.' });
	await create('tasks', { title: 'Prepare notes for the next conversation', assignee: '', dueDate: today, status: 'open' });
	const html = await readFile('dist/index.html', 'utf8');
	const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m => m[1]);
	check(assets.length > 0, 'build assets absent');
	for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
		const context = await browser.newContext({ baseURL, viewport, isMobile: device === 'phone', hasTouch: device === 'phone', serviceWorkers: 'block', reducedMotion: 'reduce', extraHTTPHeaders: headers });
		await context.addCookies(cookies);
		const page = await context.newPage(); page.setDefaultTimeout(20000);
		page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ device, text: redact(m.text()) }); });
		page.on('pageerror', e => report.runtimeErrors.push({ device, text: redact(e.message) }));
		stage = `${device} fresh build`; await page.goto('/');
		await expect(page.locator('main h1')).toHaveText('Hello, Visual.');
		const served = await page.locator('script[src],link[href]').evaluateAll(nodes => nodes.map(n => new URL(n.src || n.href).pathname));
		check(assets.every(a => served.includes(a)), 'served build mismatch');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		for (const screen of ['Today', 'Medicines', 'Food', 'Learn']) {
			stage = `${device} ${screen}`;
			const nav = page.getByRole('navigation', { name: device === 'desktop' ? 'Main navigation' : 'Mobile navigation', exact: true });
			await nav.getByRole('button', { name: screen, exact: true }).click();
			await expect(page.locator('.topbar-label')).toHaveText(screen);
			await expect(page.locator('main h1')).toBeVisible();
			await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
			const pixels = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
			report.overflow.push({ device, screen, pixels }); check(pixels <= 1, `horizontal overflow ${pixels}`);
			await page.mouse.move(0, 0);
			const path = `test-results/product-visual/${device}-${screen.toLowerCase()}.png`;
			await page.screenshot({ path, fullPage: true, animations: 'disabled' }); report.screenshots.push(path);
		}
		if (device === 'desktop') {
			await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Today', exact: true }).click();
			for (const theme of ['light', 'dark']) {
				if (theme === 'dark') await page.getByRole('button', { name: 'Switch color theme', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				for (const [label, slug] of [['Settings & privacy', 'settings'], ['Help & support', 'help']]) {
					stage = `sidebar ${theme} ${slug}`;
					const button = page.locator('.product-sidebar').getByRole('button', { name: label, exact: true });
					await button.hover();
					const styles = await button.evaluate(el => {
						const s = getComputedStyle(el), rgb = v => v.match(/[\d.]+/g).slice(0, 3).map(Number);
						const lum = a => a.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
						const a = lum(rgb(s.color)), b = lum(rgb(s.backgroundColor));
						return { color: s.color, background: s.backgroundColor, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
					});
					report.hover.push({ theme, button: label, ...styles }); check(styles.contrast >= 4.5, 'hover contrast below 4.5');
					const path = `test-results/product-visual/desktop-sidebar-${slug}-hover-${theme}.png`;
					await page.screenshot({ path, animations: 'disabled' }); report.screenshots.push(path);
				}
			}
		}
		await context.close();
	}
	stage = 'browser errors';
	check(report.consoleErrors.length === 0, 'console errors observed');
	check(report.runtimeErrors.length === 0, 'runtime errors observed');
} catch (error) {
	failed = true; console.error(`Visual FAIL at ${stage}: ${redact(error.message)}`);
} finally {
	if (attempted && owner) {
		try {
			let deletion = await owner.request.delete('/api/v2/account', { data: { password: account.password, confirmation: 'DELETE' } });
			if (deletion.status() === 401) {
				const login = await owner.request.post('/api/v2/auth/login', { data: { email: account.email, password: account.password } });
				if (login.status() === 200) deletion = await owner.request.delete('/api/v2/account', { data: { password: account.password, confirmation: 'DELETE' } });
			}
			check(deletion.status() === 200, `deletion status ${deletion.status()}`);
			check((await owner.request.get('/api/v2/me')).status() === 401, 'old session accepted'); report.accountDeleted = true;
			check((await owner.request.post('/api/v2/auth/login', { data: { email: account.email, password: account.password } })).status() === 401, 'deleted login accepted'); report.deletedLoginRejected = true;
		} catch (error) { failed = true; console.error(`Visual cleanup FAIL: ${redact(error.message)}`); }
	}
	await browser?.close();
}
report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
console.log(failed ? 'Visual verification: FAIL' : 'Visual verification: PASS');
if (failed) process.exitCode = 1;
```