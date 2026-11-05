// Wraps phone screenshots in an original iPhone-style device frame (no Apple artwork) and
// prepares website/deck images. Input: artifacts/screens. Output: artifacts/framed, public/site.
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';

const src = 'artifacts/screens', out = 'artifacts/framed', site = 'public/site';
await mkdir(out, { recursive: true }); await mkdir(site, { recursive: true });
const W = 1179, H = 2556, BAR = 162, PAD = 54, R_OUT = 200, R_IN = 150;
const FW = W + PAD * 2, FH = H + PAD * 2;

function statusBar(bg, dark) {
  const ink = dark ? '#ffffff' : '#111111';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}">
  <rect width="${W}" height="${BAR}" fill="${bg}"/>
  <text x="150" y="104" font-family="Segoe UI, Arial" font-weight="600" font-size="52" fill="${ink}" text-anchor="middle">9:41</text>
  <g fill="${ink}" transform="translate(860 70)">
    <rect x="0" y="24" width="12" height="16" rx="3"/><rect x="18" y="16" width="12" height="24" rx="3"/><rect x="36" y="8" width="12" height="32" rx="3"/><rect x="54" y="0" width="12" height="40" rx="3"/>
    <path d="M110 14a40 40 0 0 1 56 0l-6 7a31 31 0 0 0-44 0zM121 26a24 24 0 0 1 34 0l-6 7a15 15 0 0 0-22 0zM138 38l-7-7a10 10 0 0 1 14 0z"/>
    <rect x="190" y="2" width="82" height="38" rx="11" fill="none" stroke="${ink}" stroke-width="4" opacity=".5"/><rect x="196" y="8" width="62" height="26" rx="6"/><rect x="276" y="14" width="6" height="14" rx="3" opacity=".5"/>
  </g></svg>`);
}
const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW + 16}" height="${FH}">
  <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a42"/><stop offset=".5" stop-color="#1b1b20"/><stop offset="1" stop-color="#4a4a54"/></linearGradient></defs>
  <rect x="0" y="420" width="10" height="120" rx="4" fill="#2a2a30"/><rect x="0" y="600" width="10" height="200" rx="4" fill="#2a2a30"/><rect x="0" y="840" width="10" height="200" rx="4" fill="#2a2a30"/><rect x="${FW + 6}" y="640" width="10" height="300" rx="4" fill="#2a2a30"/>
  <rect x="8" y="0" width="${FW}" height="${FH}" rx="${R_OUT}" fill="url(#m)"/>
  <rect x="${8 + 10}" y="10" width="${FW - 20}" height="${FH - 20}" rx="${R_OUT - 10}" fill="#050507"/>
</svg>`);
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R_IN}" fill="#fff"/></svg>`);
const island = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}"><rect x="${W / 2 - 190}" y="34" width="380" height="110" rx="55" fill="#050507"/></svg>`);

async function framePhone(file) {
  const img = sharp(`${src}/${file}`);
  const { data } = await img.clone().extract({ left: 20, top: 20, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data; const dark = (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  const body = await img.clone().resize(W, H - BAR, { fit: 'cover', position: 'top' }).toBuffer();
  const indicator = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><rect x="${W / 2 - 200}" y="14" width="400" height="15" rx="7.5" fill="${dark ? '#ffffff' : '#111111'}" opacity=".85"/></svg>`);
  const screen = await sharp({ create: { width: W, height: H, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: statusBar(`rgb(${r},${g},${b})`, dark), top: 0, left: 0 }, { input: island, top: 0, left: 0 }, { input: body, top: BAR, left: 0 }, { input: indicator, top: H - 44, left: 0 }, { input: mask, blend: 'dest-in' }]).png().toBuffer();
  const name = file.replace(/\.png$/, '');
  await sharp(frame).composite([{ input: screen, top: PAD, left: PAD + 8 }]).png().toFile(`${out}/${name}.png`);
  return `${out}/${name}.png`;
}

const files = (await readdir(src)).filter(f => f.startsWith('phone-') && f.endsWith('.png') && !f.includes('-full'));
for (const f of files) await framePhone(f);
console.log(`framed ${files.length} phone screens`);

for (const [from, to] of [['phone-light-today', 'phone-today'], ['phone-light-timeline-summary', 'phone-timeline'], ['phone-light-rx-result', 'phone-rx']])
  await sharp(`${out}/${from}.png`).resize({ width: 560 }).png({ compressionLevel: 9 }).toFile(`${site}/${to}.png`);
for (const [from, to] of [['desktop-light-doctor', 'desktop-doctor'], ['desktop-light-timeline-summary', 'desktop-timeline']])
  await sharp(`${src}/${from}.png`).resize({ width: 1400 }).png({ compressionLevel: 9 }).toFile(`${site}/${to}.png`);
console.log('website images written to public/site');
