// Standalone localhost-only preview. Does not import or change the application server.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/lessons/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.LESSON_PORT || 5181);
http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/lessons/' }).end(); return; }
    if (!pathname.startsWith('/lessons/')) { res.writeHead(404).end(); return; }
    const name = pathname.slice('/lessons/'.length) || 'index.html';
    // Only flat public lesson assets; no traversal or arbitrary workspace files.
    if (name.includes('/') || name.includes('\\') || name === '..') { res.writeHead(404).end(); return; }
    const file = path.join(root, name);
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    let start = 0, end = info.size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
      }
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      } else start = Math.max(0, info.size - Number(match[2]));
      if (start > end || start >= info.size || !Number.isSafeInteger(start)) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Independent lessons: http://127.0.0.1:${port}/lessons/`));