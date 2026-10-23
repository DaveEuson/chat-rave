import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
// Serve only app assets, never arbitrary workspace files or secrets.
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!/^(index\.html|styles\.css|js\/[a-z-]+\.js|tests\/audio\.html)$/.test(file)) {
    res.writeHead(404).end('Not found'); return;
  }
  try {
    const body = await readFile(resolve(root, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(8080, '127.0.0.1', () => console.log('Chat Rave: http://localhost:8080'));
