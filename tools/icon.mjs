#!/usr/bin/env node
/**
 * icon.mjs — renders the Virulenter app icon as SVG and PNG.
 *
 * The mark is a liquid-glass "V": a violet→blue refraction field inside a
 * rounded square, with the V cut as a frosted band that carries a specular
 * highlight, an inner rim light, and a soft drop shadow. Everything is drawn
 * with gradients and filters only — no bitmap assets, no dependencies.
 *
 *   node tools/icon.mjs
 *
 * Writes app/icons/icon.svg plus the PNG sizes the PWA manifest and the
 * favicon need, rasterised with headless Chrome when it is available.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // project root
const OUT = join(ROOT, 'app', 'icons');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ── the mark ──────────────────────────────────────────────
   Built on a 512×512 canvas and scaled by viewBox.
   Layers, back to front:
     1. refraction field  — overlapping coloured blobs, heavily blurred
     2. glass body        — translucent white gradient + inner rim
     3. the V             — frosted band, rim-lit, with a specular streak
     4. top gloss         — broad diagonal highlight across the tile
   The V is a stroked polyline with round joins, which reads cleanly even at
   16 px, where a filled glyph would clog.
   ────────────────────────────────────────────────────────── */
function mark({ size = 512, maskable = false, rounded = true, standalone = false } = {}) {
  /* a maskable icon must keep its content inside the safe zone (80% centre),
     so the tile fills the whole square and the V shrinks. */
  const pad = maskable ? 0 : 0;
  const r = rounded ? (maskable ? 0 : 116) : 0;
  const vScale = maskable ? 0.72 : 1;
  const cx = 256, cy = 256;
  const vTop = cy - 96 * vScale, vBottom = cy + 104 * vScale, spanX = 104 * vScale;
  const strokeW = 62 * vScale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="Virulenter">
  <defs>
    <!-- 1. refraction field -->
    <radialGradient id="gA" cx="30%" cy="18%" r="72%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="55%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#4c2fd6"/>
    </radialGradient>
    <radialGradient id="gB" cx="82%" cy="24%" r="66%">
      <stop offset="0%" stop-color="#67e8f9"/>
      <stop offset="60%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gC" cx="22%" cy="88%" r="70%">
      <stop offset="0%" stop-color="#f0abfc"/>
      <stop offset="55%" stop-color="#c026d3"/>
      <stop offset="100%" stop-color="#c026d3" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gD" cx="74%" cy="82%" r="62%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="60%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0"/>
    </radialGradient>

    <!-- 2. glass body -->
    <linearGradient id="bodyG" x1="12%" y1="0%" x2="88%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".46"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity=".30"/>
    </linearGradient>

    <!-- 3. the V band -->
    <linearGradient id="vG" x1="18%" y1="0%" x2="82%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".96"/>
      <stop offset="34%" stop-color="#eef2ff" stop-opacity=".78"/>
      <stop offset="70%" stop-color="#ffffff" stop-opacity=".90"/>
      <stop offset="100%" stop-color="#dbe4ff" stop-opacity=".72"/>
    </linearGradient>
    <linearGradient id="specG" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".10"/>
      <stop offset="40%" stop-color="#ffffff" stop-opacity=".85"/>
      <stop offset="62%" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <!-- 4. top gloss -->
    <linearGradient id="glossG" x1="0%" y1="0%" x2="42%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="34%" stop-color="#ffffff" stop-opacity=".12"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="rimG" x1="0%" y1="0%" x2="60%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".90"/>
      <stop offset="38%" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity=".42"/>
    </linearGradient>

    <filter id="blurA" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="46"/>
    </filter>
    <filter id="blurB" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
    <filter id="vShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#1b0b4d" flood-opacity=".38"/>
    </filter>
    <filter id="vGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>

    <clipPath id="tile">
      <rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" rx="${r}" ry="${r}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#tile)">
    <!-- 1. refraction field -->
    <rect width="512" height="512" fill="url(#gA)"/>
    <g filter="url(#blurA)">
      <ellipse cx="404" cy="120" rx="188" ry="164" fill="url(#gB)"/>
      <ellipse cx="104" cy="418" rx="196" ry="172" fill="url(#gC)"/>
      <ellipse cx="400" cy="430" rx="172" ry="156" fill="url(#gD)"/>
    </g>
    <g filter="url(#blurB)" opacity=".55">
      <ellipse cx="256" cy="256" rx="210" ry="196" fill="#5b6cff" opacity=".55"/>
    </g>

    <!-- 2. glass body -->
    <rect width="512" height="512" fill="url(#bodyG)"/>

    <!-- 3. the V -->
    <g filter="url(#vShadow)">
      <polyline points="${cx - spanX},${vTop} ${cx},${vBottom} ${cx + spanX},${vTop}"
                fill="none" stroke="url(#vG)" stroke-width="${strokeW}"
                stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <!-- specular streak riding the left arm -->
    <polyline points="${cx - spanX},${vTop} ${cx},${vBottom}"
              fill="none" stroke="url(#specG)" stroke-width="${strokeW * 0.34}"
              stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
    <!-- faint inner glow so the band reads as thick glass -->
    <polyline points="${cx - spanX},${vTop} ${cx},${vBottom} ${cx + spanX},${vTop}"
              fill="none" stroke="#ffffff" stroke-width="${strokeW * 1.28}"
              stroke-linecap="round" stroke-linejoin="round" opacity=".16" filter="url(#vGlow)"/>

    <!-- 4. top gloss -->
    <rect width="512" height="512" fill="url(#glossG)"/>

    <!-- inner rim light -->
    <rect x="3" y="3" width="506" height="506" rx="${Math.max(0, r - 3)}" ry="${Math.max(0, r - 3)}"
          fill="none" stroke="url(#rimG)" stroke-width="6"/>
    <!-- liquid meniscus along the bottom edge -->
    <rect x="10" y="498" width="492" height="14" rx="7" fill="#ffffff" opacity=".22"/>
  </g>
</svg>
`;
}

const svg = mark({ size: 512 });
writeFileSync(join(OUT, 'icon.svg'), svg, 'utf8');
console.log('wrote app/icons/icon.svg');

/* Android needs a few extras: legacy launcher bitmaps at each density, plus an
   adaptive icon whose foreground sits inside the 66% safe zone (the platform
   masks and animates it, so anything nearer the edge gets cropped). */
/* fully round: used for android:roundIcon and for launchers that mask to a circle */
function markRound({ size = 192 } = {}) {
  const base = mark({ size, maskable: false, rounded: false });
  const defs = base.slice(base.indexOf('<defs>'), base.indexOf('</defs>') + 7);

  /* Take the artwork out of its own clipping <g> wrapper, otherwise the markup
     is left with an unmatched close tag and the SVG fails to parse. */
  const afterDefs = base.slice(base.indexOf('</defs>') + 7);
  const open = afterDefs.indexOf('<g ');
  const close = afterDefs.lastIndexOf('</g>');
  const body = (open >= 0 && close > open)
    ? afterDefs.slice(afterDefs.indexOf('>', open) + 1, close)
    : afterDefs;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="Virulenter">
  ${defs}
  <defs><clipPath id="roundTile"><circle cx="256" cy="256" r="256"/></clipPath></defs>
  <g clip-path="url(#roundTile)">${body}</g>
</svg>
`;
}

function adaptiveForeground({ size = 432 } = {}) {
  /* same mark, but square, transparent, and with the V pulled in to ~62% */
  const vScale = 0.62;
  const cx = 256, cy = 256;
  const vTop = cy - 96 * vScale, vBottom = cy + 104 * vScale, spanX = 104 * vScale;
  const strokeW = 62 * vScale;
  const src = mark({ size: 512, maskable: false, rounded: false });
  /* reuse the master gradients but drop the tile fill and rim */
  const defs = src.slice(src.indexOf('<defs>'), src.indexOf('</defs>') + 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="Virulenter">
  ${defs}
  <g filter="url(#vShadow)">
    <polyline points="${cx - spanX},${vTop} ${cx},${vBottom} ${cx + spanX},${vTop}"
              fill="none" stroke="url(#vG)" stroke-width="${strokeW}"
              stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <polyline points="${cx - spanX},${vTop} ${cx},${vBottom}"
            fill="none" stroke="url(#specG)" stroke-width="${strokeW * 0.32}"
            stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
</svg>
`;
}

/* `?` free variant: some hosts want a maskable PNG with no rounding */
const ANDROID = join(ROOT, 'apk', 'app', 'src', 'main', 'res');

const sizes = [
  { file: 'icon-192.png', size: 192, maskable: false, rounded: true },
  { file: 'icon-512.png', size: 512, maskable: false, rounded: true },
  { file: 'icon-180.png', size: 180, maskable: false, rounded: true },   // apple-touch-icon
  { file: 'icon-maskable-512.png', size: 512, maskable: true, rounded: false },
  /* launcher bitmaps for API < 26 */
  { size: 48, dir: join(ANDROID, 'mipmap-mdpi') },
  { size: 72, dir: join(ANDROID, 'mipmap-hdpi') },
  { size: 96, dir: join(ANDROID, 'mipmap-xhdpi') },
  { size: 144, dir: join(ANDROID, 'mipmap-xxhdpi') },
  { size: 192, dir: join(ANDROID, 'mipmap-xxxhdpi') },
  /* adaptive icon foreground, drawn at 432dp per the platform guidance */
  { file: 'ic_launcher_foreground.png', size: 432, adaptive: true, dir: join(ANDROID, 'drawable'), as: 'ic_launcher_foreground.png' }
];

if (!existsSync(CHROME)) {
  console.log('Chrome not found — SVG written, PNGs skipped.');
  console.log('Open app/icons/icon.svg in a browser to export PNGs manually.');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'vr-icon-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-sandbox', '--no-first-run', '--disable-crash-reporter', '--disable-breakpad',
  '--force-color-profile=srgb', 'about:blank'
], { stdio: 'ignore' });

const pf = join(profile, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 120; i++) {
  if (existsSync(pf)) { port = readFileSync(pf, 'utf8').split('\n')[0].trim(); if (port) break; }
  await new Promise((r) => setTimeout(r, 100));
}
if (!port) { console.error('could not reach Chrome'); chrome.kill(); process.exit(1); }

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pend = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) { const { res, rej } = pend.get(x.id); pend.delete(x.id); x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');

/* each density needs both a square and a round bitmap */
const expanded = [];
for (const s of sizes) {
  if (s.dir && s.size && !s.file) {
    expanded.push({ file: 'ic_launcher.png', size: s.size, rounded: true, dir: s.dir });
    expanded.push({ file: 'ic_launcher_round.png', size: s.size, round: true, dir: s.dir });
  } else {
    expanded.push(s);
  }
}
sizes.length = 0;
sizes.push(...expanded);

for (const s of sizes) {
  const body = s.adaptive
    ? adaptiveForeground({ size: s.size })
    : s.round
      ? markRound({ size: s.size })
      : mark({ size: s.size, maskable: s.maskable, rounded: s.rounded });
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(body, 'utf8').toString('base64');
  await send('Emulation.setDeviceMetricsOverride', {
    width: s.size, height: s.size, deviceScaleFactor: 1, mobile: false
  });
  await send('Page.navigate', { url: dataUrl });
  await new Promise((r) => setTimeout(r, 260));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: s.size, height: s.size, scale: 1 }
  });
  const dir = s.dir || OUT;
  if (s.dir) mkdirSync(dir, { recursive: true });
  const name = s.as || s.file;
  writeFileSync(join(dir, name), Buffer.from(shot.data, 'base64'));
  console.log('wrote ' + (s.dir ? dir.replace(ROOT + '/', '') : 'app/icons') + '/' + name);
}

/* favicon: a tiny 32 px rounded tile is unreadable, so ship the SVG alone */
ws.close();
chrome.kill();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} ; process.exit(0); }, 200);
