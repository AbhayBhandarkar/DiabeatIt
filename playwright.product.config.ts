import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Build first: this serves dist, not the Vite development app.
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  testDir: './tests/product-e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  outputDir: './test-results/product/artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/product', open: 'never' }],
    ['json', { outputFile: 'test-results/product/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    extraHTTPHeaders: { 'X-Diabeatit-Client': 'web', Origin: 'http://127.0.0.1:3001' },
    actionTimeout: 15_000,
    browserName: 'chromium',
    // Auth responses, recovery codes and invitation fields are bearer secrets.
    // Do not capture network traces, storageState, videos or automatic screenshots.
    trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block', reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'narrow-320', testMatch: '**/quality.spec.ts', use: { viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});