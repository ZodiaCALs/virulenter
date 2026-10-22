#!/usr/bin/env node
/**
 * serve.mjs — serves app/ over HTTP so the PWA can be installed.
 *
 * Install prompts, the service worker and offline support all require
 * http(s). This prints the LAN address as well, which is what you need to
 * reach the app from a phone on the same Wi-Fi.
 *
 *   node tools/serve.mjs [--port 8080]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    /* no-store so an edit is visible on a plain reload; the service worker
       keeps its own copy for offline use */
    'Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/'
  });
  res.end(readFileSync(file));
});

function lanAddresses() {
  const out = [];
  const ifaces = networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    });
  });
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Virulenter served from ${ROOT}\n`);
  console.log(`  this machine   http://localhost:${PORT}/`);
  lanAddresses().forEach((ip) => {
    console.log(`  phone / LAN    http://${ip}:${PORT}/`);
  });
  console.log('\nInstall: open the address above, then use the browser’s');
  console.log('Install / Add to Home Screen action. Ctrl+C to stop.');
});
