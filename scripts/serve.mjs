/**
 * serve.mjs — Servidor estático local que reproduce GitHub Pages.
 *
 * Sirve el proyecto bajo /StereoVision-Studio-3D/ (el mismo subdirectorio que
 * Pages) para detectar rutas absolutas rotas, con tipos MIME correctos y
 * peticiones por rangos (los navegadores las usan para buscar en un video).
 *   npm start               → http://localhost:8000/StereoVision-Studio-3D/
 *   PORT=9000 npm start
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/StereoVision-Studio-3D/';
const PORT = Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

export function startServer(port = PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === BASE.slice(0, -1)) {
      res.writeHead(302, { Location: BASE }).end();
      return;
    }
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end('Fuera del sitio');
      return;
    }
    let path = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    // Ni carpetas ocultas (.git) ni dependencias de desarrollo: igual que lo que publica Pages.
    if (!file.startsWith(ROOT) || file.split(sep).some((part) => part.startsWith('.') || part === 'node_modules')) {
      res.writeHead(404).end();
      return;
    }
    let info;
    try {
      info = await stat(file);
      if (!info.isFile()) throw new Error('no es archivo');
    } catch {
      res.writeHead(404).end('No encontrado');
      return;
    }
    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
  console.log(`StereoVision Studio 3D en http://localhost:${PORT}${BASE}`);
}
