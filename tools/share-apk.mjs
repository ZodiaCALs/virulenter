#!/usr/bin/env node
/**
 * share-apk.mjs — puts the APK on your phone with no command line on the
 * phone side and no cable: serves it over your local network behind a small
 * page carrying a QR code, so you scan once and tap Install.
 *
 *   node tools/share-apk.mjs
 *   node tools/share-apk.mjs --port 8080
 *   node tools/share-apk.mjs --file dist/virulenter-android-debug.apk
 *
 * Also serves the single-file web build, for a phone that cannot install an
 * APK or a computer on the same network.
 */
import { createServer } from 'node:http';
import { existsSync, statSync, readFileSync, createReadStream } from 'node:fs';
import { join, resolve, dirname, basename, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { qrPng } from './qr.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 8730;

const fileArg = process.argv.indexOf('--file');
const APK = fileArg > -1
  ? resolve(process.argv[fileArg + 1])
  : join(DIST, 'virulenter-android-release.apk');

if (!existsSync(APK)) {
  console.error(`No APK at ${APK}\nBuild one first:  node tools/build-apk.mjs --release`);
  process.exit(1);
}

const APK_NAME = basename(APK);
const APK_SIZE = statSync(APK).size;
const WEB = join(DIST, 'virulenter.html');
const HAS_WEB = existsSync(WEB);

/* ── LAN address ─────────────────────────────────────────── */
function lanIp() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  /* prefer the usual private ranges over VPN / virtual adapters */
  const priv = out.find((a) => /^192\.168\./.test(a)) ||
               out.find((a) => /^10\./.test(a)) ||
               out.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a));
  return priv || out[0] || '127.0.0.1';
}

const IP = lanIp();
const BASE = `http://${IP}:${PORT}`;
const APK_URL = `${BASE}/${encodeURIComponent(APK_NAME)}`;
const QR = qrPng(APK_URL);

/* ── pages ───────────────────────────────────────────────── */
function page() {
  const mb = (APK_SIZE / 1048576).toFixed(2);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install Virulenter</title>
<style>
  :root { --ink:#11151c; --dim:#5b6472; --line:#e3e6ec; --accent:#7c3aed; --bg:#f6f7f9; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 20px 56px; background:var(--bg); color:var(--ink);
         font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         display:flex; justify-content:center; }
  main { width:100%; max-width:520px; }
  h1 { font-size:22px; margin:0 0 6px; letter-spacing:-.3px; }
  p.sub { margin:0 0 22px; color:var(--dim); font-size:14px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px; }
  .qr { display:flex; justify-content:center; padding:14px; background:#fff; }
  .qr img { width:min(300px,74vw); height:auto; image-rendering:pixelated; }
  .url { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; word-break:break-all;
         color:var(--dim); text-align:center; margin-top:10px; }
  ol { margin:0; padding-left:22px; }
  ol li { margin-bottom:9px; }
  .btn { display:block; text-align:center; text-decoration:none; background:var(--accent); color:#fff;
         font-weight:650; padding:15px; border-radius:12px; margin:18px 0 0; }
  .btn.alt { background:#eceef2; color:var(--ink); font-weight:550; margin-top:10px; }
  .meta { color:var(--dim); font-size:12.5px; text-align:center; margin-top:12px; }
  code { background:#eceef2; padding:1px 5px; border-radius:5px; font-size:12.5px; }
  .note { font-size:13px; color:var(--dim); margin-top:14px; }
</style>
</head>
<body>
<main>
  <h1>Install Virulenter</h1>
  <p class="sub">Scan the code with your phone, or type the address. Nothing to set up on the phone.</p>

  <div class="card">
    <div class="qr">
      ${QR ? `<img src="/qr.png" alt="QR code linking to ${APK_URL}" width="300" height="300">`
           : `<p style="color:#5b6472;font-size:14px;text-align:center;margin:24px 0">
                QR unavailable (no image encoder found).<br>Type the address below into your phone.</p>`}
    </div>
    <div class="url">${APK_URL}</div>
    <a class="btn" href="/${encodeURIComponent(APK_NAME)}" download>Download ${APK_NAME}</a>
    <div class="meta">${mb} MB &middot; Android 7.0 and newer</div>
  </div>

  <div class="card">
    <ol>
      <li>Open your phone's <b>camera</b> and point it at the code above.</li>
      <li>Tap the link it offers to open this page on the phone.</li>
      <li>Tap <b>Download</b>, then open the downloaded file.</li>
      <li>Android asks once to <b>allow installs from this source</b> — allow it.</li>
      <li>Tap <b>Install</b>. Done.</li>
    </ol>
    <p class="note">The app requests no permissions at all — not even internet access. It keeps
    nothing in the browser and works with no network once installed.</p>
  </div>

  ${HAS_WEB ? `<div class="card">
    <b>On a computer, or if the install is blocked?</b>
    <p class="note">Open the web version instead — one file, works offline, nothing to install.</p>
    <a class="btn alt" href="/virulenter.html">Open the web app</a>
  </div>` : ''}
</main>
</body>
</html>`;
}

/* ── server ──────────────────────────────────────────────── */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.apk': 'application/vnd.android.package-archive'
};

const server = createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const path = decodeURIComponent(url.pathname);

  if (path === '/' || path === '/index.html') {
    const body = page();
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  if (path === '/qr.png') {
    if (!QR) { res.writeHead(404).end('no QR encoder available'); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    createReadStream(QR).pipe(res);
    return;
  }

  const wanted = basename(path);
  if (wanted === APK_NAME) {
    res.writeHead(200, {
      'Content-Type': TYPES['.apk'],
      'Content-Length': APK_SIZE,
      'Content-Disposition': `attachment; filename="${APK_NAME}"`,
      'Cache-Control': 'no-store'
    });
    createReadStream(APK).pipe(res);
    return;
  }

  if (HAS_WEB && wanted === 'virulenter.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    createReadStream(WEB).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Virulenter — install on your phone\n');
  console.log(`  APK      ${APK_NAME}  (${(APK_SIZE / 1048576).toFixed(2)} MB)`);
  console.log(`  this PC  http://localhost:${PORT}/`);
  console.log(`  phone    ${BASE}/`);
  console.log(`  direct   ${APK_URL}`);
  console.log(`  QR       ${QR ? QR.replace(ROOT + '/', '') : 'unavailable — install opencv-python or open the URL manually'}`);
  console.log('\nScan the QR with the phone camera, then follow the page.');
  console.log('Ctrl+C to stop.');
});
