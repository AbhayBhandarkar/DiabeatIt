import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { videoLessons } from '../shared/videoLessons';

// Real browser/media, mocked account context. No app/auth registration required.
const harness = `<!doctype html><html lang="en"><head><title>Lesson component validation</title></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import Learn from './src/product/Learn.tsx';
import { Context } from './src/product/context.tsx';
import './src/product/product.css';
window.calls=[]; window.failSave=false;
function Harness() {
 const [records,setRecords]=React.useState([]);
 const [account,setAccount]=React.useState('account-a');
 const space={id:account,name:'My workspace',role:'owner',scopes:['lessons:read','lessons:write']};
 const value={me:{user:{id:account,name:'Reader',email:'reader@example.test'},spaces:[space],spaceId:account},spaceId:account,busy:false,
 snapshot:{space,entities:{lessons:records},grants:[],invitations:[],audit:[]},
 create:async(kind,data)=>{window.calls.push({operation:'create',kind,data}); await new Promise(r=>setTimeout(r,100)); if(window.failSave)return false;setRecords(old=>[...old,{id:'lesson-record',kind,version:1,author:{id:account},data}]);return true;},
 update:async(entity,data)=>{window.calls.push({operation:'update',id:entity.id,version:entity.version,data});await new Promise(r=>setTimeout(r,100));if(window.failSave)return false;setRecords(old=>old.map(item=>item.id===entity.id?{...item,version:item.version+1,data}:item));return true;},
 refresh:async()=>{},remove:async()=>true,request:async()=>{},notify:()=>{}};
 return React.createElement(Context.Provider,{value},React.createElement('div',{className:'product-shell'},React.createElement('main',{className:'product-main'},React.createElement('button',{onClick:()=>{setRecords([]);setAccount('account-b');}},'Switch test account'),React.createElement(Learn))));
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Harness)));
</script></body></html>`;

let server: Server;
let browser: Browser;
let base: string;
beforeAll(async () => {
  const result = await build({ stdin: { contents: harness.split('<script type="module">')[1].split('</script>')[0], resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'virtual', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  const js = result.outputFiles!.find(file => file.path.endsWith('.js'))!.contents;
  const css = result.outputFiles!.find(file => file.path.endsWith('.css'))!.contents;
  server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (path === '/__lesson-test') { response.setHeader('Content-Type', 'text/html'); response.end(harness.replace(/<script type="module">[\s\S]*?<\/script>/, '<link rel="stylesheet" href="/bundle.css"><script type="module" src="/bundle.js"></script>')); return; }
    if (path === '/bundle.js' || path === '/bundle.css') { response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/css'); response.end(path.endsWith('.js') ? js : css); return; }
    if (!/^\/lessons\/[\w.-]+$/.test(path)) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(resolve('public', path.slice(1)));
      response.setHeader('Content-Type', path.endsWith('.mp4') ? 'video/mp4' : path.endsWith('.vtt') ? 'text/vtt' : path.endsWith('.jpg') ? 'image/jpeg' : 'text/plain');
      response.setHeader('Accept-Ranges', 'bytes');
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
      if (range) {
        const start = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 }); response.end(bytes.subarray(start, end + 1));
      } else { response.setHeader('Content-Length', bytes.length); response.end(bytes); }
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server unavailable');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); server?.closeAllConnections(); await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); });

async function openLesson(page: Page, id = 'ingredient-overlap') {
  await page.goto(`${base}/__lesson-test`);
  await page.getByRole('button', { name: `Explore lesson: ${videoLessons.find(item => item.id === id)!.title}`, exact: true }).click();
  await page.locator('video').evaluate(async element => {
    const video = element as HTMLVideoElement;
    if (video.readyState < 1) await new Promise<void>(resolve => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
  });
}

test('all three real assets, posters, filters, captions, focus return and no autoplay', async () => {
  const page = await browser.newPage();
  try {
    for (const lesson of videoLessons) {
      await openLesson(page, lesson.id);
      const media = await page.locator('video').evaluate(element => {
        const video = element as HTMLVideoElement;
        return { duration: video.duration, paused: video.paused, time: video.currentTime, src: video.currentSrc, captions: video.textTracks[0]?.mode };
      });
      expect(media.duration).toBeCloseTo(48, 0);
      expect(media.paused).toBe(true);
      expect(media.time).toBe(0);
      expect(media.src).toContain(lesson.video.src);
      expect(media.captions).toBe('showing');
      expect(await page.getByRole('button', { name: 'Mark lesson complete' }).isDisabled()).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog').count()).toBe(0);
      expect(await page.getByRole('button', { name: `Explore lesson: ${lesson.title}`, exact: true }).evaluate(element => element === document.activeElement)).toBe(true);
    }
    expect(await page.locator('.video-poster img').evaluateAll(elements => elements.every(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.getByRole('button', { name: 'Food label literacy', exact: true }).click();
    expect(await page.locator('.video-card').count()).toBe(1);
    expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
  } finally { await page.close(); }
});

test('seek gate, incorrect feedback, replay, end-seek cannot complete, close/resume and serialized saves', async () => {
  const page = await browser.newPage();
  try {
    await openLesson(page);
    await page.locator('video').evaluate(element => { (element as HTMLVideoElement).currentTime = 45; });
    await page.getByRole('heading', { name: videoLessons[0].checkpoints[0].prompt }).waitFor();
    expect(await page.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime)).toBeCloseTo(31, 0);
    await page.getByRole('button', { name: 'Different brand names rule out overlap.', exact: true }).click();
    expect(await page.getByRole('button', { name: 'Continue after checkpoint' }).isDisabled()).toBe(true);
    expect(await page.locator('.checkpoint').textContent()).toContain('Names alone do not rule out overlap');
    await page.getByRole('button', { name: 'Replay question segment' }).click();
    expect(await page.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime)).toBeCloseTo(24, 0);
    await page.locator('video').evaluate(element => { (element as HTMLVideoElement).currentTime = 40; });
    await page.getByRole('button', { name: 'Possible overlap; professional clarification needed.', exact: true }).click();
    await page.getByRole('button', { name: 'Continue after checkpoint' }).click();
    await page.locator('video').evaluate(async element => { const video = element as HTMLVideoElement; video.currentTime = 47.7; await video.play(); });
    await page.waitForFunction(() => document.querySelector('video')!.ended);
    expect(await page.getByRole('button', { name: 'Mark lesson complete' }).isDisabled()).toBe(true);
    expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
    await page.getByRole('button', { name: 'Save progress', exact: true }).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await page.getByRole('button', { name: 'Save progress', exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject([{ operation: 'create', data: { completed: false } }]);
    await page.getByRole('button', { name: 'Save progress', exact: true }).click();
    await page.getByRole('button', { name: 'Save progress', exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).calls.map((item: any) => item.operation))).toEqual(['create', 'update']);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: `Continue learning: ${videoLessons[0].title}`, exact: true }).click();
    expect(await page.getByRole('button', { name: 'Mark lesson complete' }).isDisabled()).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Switch test account' }).click();
    expect(await page.getByRole('button', { name: `Explore lesson: ${videoLessons[0].title}`, exact: true }).count()).toBe(1);
  } finally { await page.close(); }
});

test('accessible transcript requires intentional confirmation and correct answer; failed saves retry', async () => {
  const page = await browser.newPage();
  try {
    await openLesson(page, 'label-portions');
    await page.getByRole('button', { name: 'Use accessible transcript' }).click();
    const complete = page.getByRole('button', { name: 'Mark lesson complete' });
    await page.getByRole('button', { name: '24 g', exact: true }).click();
    expect(await complete.isDisabled()).toBe(true);
    await page.getByRole('checkbox', { name: 'I have read the full transcript and explanations.' }).check();
    expect(await complete.isEnabled()).toBe(true);
    await page.evaluate(() => { (window as any).failSave = true; });
    await complete.click();
    await page.getByText('Your progress was not saved. Please try again.', { exact: true }).waitFor();
    await page.evaluate(() => { (window as any).failSave = false; });
    await complete.click();
    await page.getByText('Lesson completion saved.', { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).calls.at(-1).data)).toEqual({ lessonId: 'label-portions', completed: true, position: 0 });
  } finally { await page.close(); }
});

test('real playback pauses at checkpoint and completion unlocks only after watching the end', async () => {
  const page = await browser.newPage();
  try {
    await openLesson(page, 'uncertain-intake');
    await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('2');
    await page.locator('video').evaluate(async element => { await (element as HTMLVideoElement).play(); });
    const checkpoint = videoLessons[2].checkpoints[0];
    await page.getByRole('heading', { name: checkpoint.prompt }).waitFor({ timeout: 25000 });
    expect(await page.locator('video').evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
    await page.getByRole('button', { name: checkpoint.choices.find(item => item.id === checkpoint.correctChoiceId)!.text, exact: true }).click();
    await page.getByRole('button', { name: 'Continue after checkpoint' }).click();
    expect(await page.getByRole('button', { name: 'Mark lesson complete' }).isDisabled()).toBe(true);
    await page.locator('video').evaluate(async element => { await (element as HTMLVideoElement).play(); });
    await page.waitForFunction(() => document.querySelector('video')!.ended, undefined, { timeout: 15000 });
    expect(await page.getByRole('button', { name: 'Mark lesson complete' }).isEnabled()).toBe(true);
    expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
    await page.getByRole('button', { name: 'Mark lesson complete' }).click();
    await page.getByText('Lesson completion saved.', { exact: true }).waitFor();
  } finally { await page.close(); }
}, 60000);

test('local video and transcript errors offer retries; modal has no serious accessibility violations', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.route('**/ingredient-overlap.mp4', route => route.abort());
    await page.route('**/ingredient-overlap.transcript.txt', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto(`${base}/__lesson-test`);
    await page.getByRole('button', { name: `Explore lesson: ${videoLessons[0].title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Retry video' }).waitFor();
    await page.getByRole('button', { name: 'Use accessible transcript' }).click();
    await page.getByRole('button', { name: 'Retry transcript' }).waitFor();
    await page.unroute('**/ingredient-overlap.mp4');
    await page.unroute('**/ingredient-overlap.transcript.txt');
    await page.getByRole('button', { name: 'Retry video' }).click();
    await page.getByRole('button', { name: 'Retry transcript' }).click();
    await page.getByRole('checkbox', { name: 'I have read the full transcript and explanations.' }).waitFor();
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page }).include('dialog').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  } finally { await page.close(); }
});