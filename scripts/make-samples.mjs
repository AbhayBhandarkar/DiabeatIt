// Generates synthetic sample photos used by demos and screenshots (fictional prescription, CC BY-SA meal photo).
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/assets', { recursive: true });
const html = `<!doctype html><html><body style="margin:0;background:#e9e4da;font-family:Georgia,serif">
<div style="width:760px;margin:30px auto;padding:36px 44px;background:#fffdf7;box-shadow:0 8px 30px #0003;transform:rotate(-1.2deg)">
 <div style="display:flex;justify-content:space-between;border-bottom:3px solid #1d3f73;padding-bottom:12px">
  <div><div style="font-size:30px;color:#1d3f73;font-weight:bold">Dr. Anil Mehta</div><div style="font-size:17px;color:#333">MBBS, MD (Medicine), Diabetologist · Reg. No. MMC 0000 (sample)</div></div>
  <div style="text-align:right;font-size:16px;color:#333">Sunrise Diabetes Clinic<br>Kothrud, Pune<br>Date: 05/11/2026</div></div>
 <div style="font-size:19px;margin:18px 0">Name: <b>Mrs. Sunita Sharma</b> &nbsp; Age/Sex: 58/F &nbsp; Wt: 71 kg</div>
 <div style="font-size:44px;color:#1d3f73;font-style:italic">℞</div>
 <ol style="font-family:'Segoe Print','Comic Sans MS',cursive;font-size:25px;line-height:1.9;color:#1a237e">
  <li>Tab. Glycomet SR 500 mg &nbsp; — 1-0-1 &nbsp; after food × 30 days</li>
  <li>Tab. Amaryl 1 mg &nbsp; — 1-0-0 &nbsp; before breakfast × 30 days</li>
  <li>Tab. Telma 40 mg &nbsp; — 1-0-0 &nbsp; × 30 days</li>
  <li>Tab. Atorva 10 mg &nbsp; — 0-0-1 &nbsp; at night × 30 days</li>
 </ol>
 <div style="font-size:18px;color:#333;margin-top:14px">Advice: Walk 30 min daily. HbA1c after 3 months. Review on 03/12/2026.</div>
 <div style="text-align:right;font-family:'Segoe Print',cursive;font-size:26px;color:#1a237e;margin-top:26px">A. Mehta</div>
 <div style="font-size:12px;color:#999;margin-top:10px">SYNTHETIC SAMPLE FOR SOFTWARE TESTING — NOT A REAL PRESCRIPTION</div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 860, height: 780 }, deviceScaleFactor: 1.5 });
await page.setContent(html);
await page.screenshot({ path: 'docs/assets/sample-prescription.jpg', type: 'jpeg', quality: 88 });
await browser.close();
await sharp('public/recipes/plate.webp').jpeg({ quality: 88 }).toFile('docs/assets/sample-meal.jpg');
console.log('samples written to docs/assets');
