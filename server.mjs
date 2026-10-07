import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 3838);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\0')) throw new Error('Invalid path');
    const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const file = await stat(target);
    if (!file.isFile()) throw new Error('Not a file');
    let start = 0;
    let end = file.size - 1;
    let partial = false;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
      }
      if (!match || !(match[1] || match[2]) || start > end || start >= file.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        response.writeHead(416, { 'Content-Range': 'bytes */' + file.size });
        response.end();
        return;
      }
      partial = true;
    }
    response.writeHead(partial ? 206 : 200, {
      'Accept-Ranges': 'bytes',
      ...(partial ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + file.size } : {}),
      'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target, { start, end }).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('페이지를 찾을 수 없습니다.');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the existing server or set PORT to another number.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  나의 서재\n  Local: http://localhost:${port}\n  Press Ctrl+C to stop.\n`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
