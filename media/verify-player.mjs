import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const media = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(media);
const temp = path.join(media, '.cache', 'browser');
await mkdir(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
const base = process.env.LESSON_BASE_URL || 'http://127.0.0.1:5181';
const manifest = JSON.parse(await readFile(path.join(root, 'public/lessons/manifest.json'), 'utf8'));
const errors = [];
const requests = [];
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(`${base}/lessons/`);
  await expect(page.locator('nav button')).toHaveCount(3);
  for (const [index, lesson] of manifest.lessons.entries()) {
    await page.locator('nav button').nth(index).click();
    await page.waitForFunction(id => {
      const v = document.querySelector('video');
      return v.readyState >= 2 && v.currentSrc.includes(id) && v.duration === 48;
    }, lesson.id);
    await page.waitForFunction(() => document.querySelector('track').readyState === 2);
    const properties = await page.locator('video').evaluate(v => ({
      duration: v.duration, width: v.videoWidth, height: v.videoHeight,
      subtitleCues: v.textTracks[0].cues.length,
      subtitleMode: v.textTracks[0].mode,
    }));
    assert.equal(properties.width, 1280);
    assert.equal(properties.height, 720);
    assert.equal(properties.subtitleCues, lesson.cues.length);
    assert.equal(properties.subtitleMode, 'showing');
    let last = 0;
    for (const cue of lesson.cues) {
      assert(cue.startSeconds >= last && cue.endSeconds > cue.startSeconds && cue.endSeconds <= 48);
      last = cue.endSeconds;
    }
    const localVideo = await readFile(path.join(root, 'public', lesson.video.src));
    assert.equal(createHash('sha256').update(localVideo).digest('hex'), lesson.production.sha256);
    const assets = [lesson.video.src, lesson.poster, lesson.subtitles[0].src, lesson.transcript];
    for (const asset of assets) {
      const response = await page.request.get(`${base}${asset}`);
      assert.equal(response.status(), 200, asset);
    }
    const range = await page.request.get(`${base}${lesson.video.src}`, { headers: { Range: 'bytes=0-31' } });
    assert.equal(range.status(), 206);
    assert.equal((await range.body()).length, 32);
    const invalidRange = await page.request.get(`${base}${lesson.video.src}`, { headers: { Range: 'bytes=999999999-' } });
    assert.equal(invalidRange.status(), 416);
    // Observe real browser playback crossing the checkpoint, not just a dispatched event.
    await page.locator('video').evaluate(async v => { v.muted = true; v.currentTime = 30.5; await v.play(); });
    await expect(page.locator('#checkpoint')).toBeVisible();
    assert(await page.locator('video').evaluate(v => v.paused && Math.abs(v.currentTime - 31) < 0.2));
    await expect(page.locator('#continue')).toBeDisabled();
    for (const [choiceIndex, choice] of lesson.checkpoints[0].choices.entries()) {
      await page.locator('#choices button').nth(choiceIndex).click();
      await expect(page.locator('#feedback')).toHaveText(choice.feedback);
    }
    await page.locator('#continue').click();
    await expect(page.locator('#checkpoint')).toBeHidden();
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return !v.paused && v.currentTime >= 32;
    });
    await page.locator('video').evaluate(v => v.pause());
    await page.locator('#restart').click();
    await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 42; });
    await expect(page.locator('#checkpoint')).toBeVisible();
    await expect(page.locator('#continue')).toBeDisabled();
    assert(await page.locator('video').evaluate(v => Math.abs(v.currentTime - 31) < 0.2));
    await page.locator('#replay').click();
    await expect(page.locator('#checkpoint')).toBeHidden();
    assert(await page.locator('video').evaluate(v => v.currentTime >= 24 && v.currentTime < 26));
    await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 31; });
    await expect(page.locator('#checkpoint')).toBeVisible();
    await expect(page.locator('#status')).toHaveText('Paused for your answer. Choose an option to see an explanation.');
    await page.locator('#choices button').last().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#choices button').last()).toHaveAttribute('aria-pressed', 'true');
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.length })), []);
    results.push({ id: lesson.id, ...properties, assetResponses: 4, feedbackChoices: 3,
      naturalPlaybackPause: true, resume: true, seekGuard: true, replay: true, restartReset: true,
      rangeRequests: true, invalidRangeRejected: true, keyboardAnswer: true,
      axeViolations: accessibility.violations.length, sha256Verified: true });
  }
  await page.screenshot({ path: path.join(media, 'player-desktop.png'), fullPage: true });
  const responsive = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `Overflow at ${width}`);
    responsive.push({ width, horizontalOverflow: overflow });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(media, 'player-mobile.png'), fullPage: true });
  const mobileAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.equal(mobileAxe.violations.length, 0);
  assert.deepEqual(errors, []);
  assert(requests.every(url => url.startsWith(base)), 'Unexpected external request');
  const report = { testedAt: new Date().toISOString(), browser: browser.version(), base,
    lessons: results, responsive, mobileAxeViolations: 0, pageErrors: errors,
    externalRequests: 0, caveats: ['Chromium desktop automation; no physical mobile or screen-reader test.', 'Narration was not human-listened end to end.'] };
  await writeFile(path.join(media, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}