#!/usr/bin/env node
/**
 * icon.mjs — renders the Virulenter mark: a liquid-glass "V" catching a drop.
 *
 * Every tap is a drop counted; the V is the glass that holds them. The glass
 * is drawn the way glass behaves rather than as a white shape on a gradient:
 *
 *   field      coloured light behind everything — indigo, with cyan, pink and
 *              amber glows, heavily blurred
 *   lensing    inside the V the field is seen magnified and brightened, the
 *              way a thick pane bends what is behind it; inside the drop it is
 *              seen flipped, as through a lens
 *   rims       light from the top left: a bright rim on the edges facing it,
 *              a deep edge and a thin refracted line on the far side
 *   specular   a streak down the left arm and a glint at its tip
 *   shadow     a soft shadow, and a coloured caustic — light the glass
 *              focuses onto the surface beneath it
 *
 * Gradients, masks and filters only: no bitmaps, no dependencies.
 *
 *   node tools/icon.mjs
 *
 * Writes, all from the one master:
 *   app/icons/icon.svg, favicon.svg, icon-180/192/512.png, icon-maskable-512.png
 *   app/index.html            the in-page brand mark (the #vmark symbol)
 *   apk/…/res/mipmap-*        legacy launcher bitmaps, square and round
 *   apk/…/res/drawable        adaptive icon background, foreground and the
 *                             monochrome layer Android 13+ tints for themed icons
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // project root
const OUT = join(ROOT, 'app', 'icons');
const ANDROID = join(ROOT, 'apk', 'app', 'src', 'main', 'res');
mkdirSync(OUT, { recursive: true });

/* ── geometry, on a 512 canvas ────────────────────────────── */
const VW = 66;                                             // stroke width of the V
const VPTS = [[148, 156], [256, 360], [364, 156]];         // left tip, point, right tip
const DROP = { cx: 256, cy: 196, r: 31 };
const pts = (list) => list.map((p) => p.join(',')).join(' ');
const vLine = (attrs) => `<polyline points="${pts(VPTS)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;

/* ── the artwork ─────────────────────────────────────────────
   p   id prefix — the in-page symbol shares a document with other SVGs
   Returns the <defs> and the drawing layers separately, so the variants
   (tile, round, adaptive background/foreground) can pick what they need. */
function art(p) {
  const id = (n) => `${p}${n}`;
  const url = (n) => `url(#${id(n)})`;

  const defs = `
    <linearGradient id="${id('base')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a6cff"/>
      <stop offset=".4" stop-color="#5233e4"/>
      <stop offset=".76" stop-color="#26137f"/>
      <stop offset="1" stop-color="#120840"/>
    </linearGradient>
    <radialGradient id="${id('cyan')}">
      <stop offset="0" stop-color="#6ff5ff"/>
      <stop offset=".5" stop-color="#2fb4ff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#2f7dff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id('pink')}">
      <stop offset="0" stop-color="#ff7ad9"/>
      <stop offset=".5" stop-color="#d63ad0" stop-opacity=".75"/>
      <stop offset="1" stop-color="#a21caf" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id('amber')}">
      <stop offset="0" stop-color="#ffc98a"/>
      <stop offset=".55" stop-color="#ff8a5c" stop-opacity=".5"/>
      <stop offset="1" stop-color="#ff6a5c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id('sheen')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff" stop-opacity=".9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id('soft')}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="42"/></filter>
    <filter id="${id('haze')}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>

    <!-- what the glass does to the light behind it -->
    <filter id="${id('lens')}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="9"/>
      <feColorMatrix type="saturate" values="1.55"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.1" intercept=".12"/>
        <feFuncG type="linear" slope="1.1" intercept=".12"/>
        <feFuncB type="linear" slope="1.05" intercept=".12"/>
      </feComponentTransfer>
    </filter>

    <!-- the V as a mask, and directional bands along its edges -->
    <mask id="${id('v')}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      ${vLine(`stroke="#fff" stroke-width="${VW}"`)}
    </mask>
    <mask id="${id('rimLit')}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      ${vLine(`stroke="#fff" stroke-width="${VW}"`)}
      <g transform="translate(5 7)">${vLine(`stroke="#000" stroke-width="${VW}"`)}</g>
    </mask>
    <mask id="${id('rimDeep')}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      ${vLine(`stroke="#fff" stroke-width="${VW}"`)}
      <g transform="translate(-7 -10)">${vLine(`stroke="#000" stroke-width="${VW}"`)}</g>
    </mask>
    <mask id="${id('rimLine')}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <g transform="translate(-4 -6)">${vLine(`stroke="#fff" stroke-width="${VW}"`)}</g>
      <g transform="translate(-6.5 -9.5)">${vLine(`stroke="#000" stroke-width="${VW}"`)}</g>
    </mask>
    <mask id="${id('edge')}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      ${vLine(`stroke="#fff" stroke-width="${VW}"`)}
      ${vLine(`stroke="#000" stroke-width="${VW - 3}"`)}
    </mask>

    <linearGradient id="${id('tint')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".84"/>
      <stop offset=".5" stop-color="#f4f1ff" stop-opacity=".4"/>
      <stop offset="1" stop-color="#e4ddff" stop-opacity=".6"/>
    </linearGradient>
    <linearGradient id="${id('lit')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".55" stop-color="#fff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".25"/>
    </linearGradient>
    <linearGradient id="${id('deep')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b1fb0" stop-opacity=".1"/>
      <stop offset="1" stop-color="#2a1490" stop-opacity=".42"/>
    </linearGradient>
    <linearGradient id="${id('streak')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".95"/>
      <stop offset=".55" stop-color="#fff" stop-opacity=".45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id('caustic')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5ff0ff"/>
      <stop offset=".5" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ff7ad9"/>
    </linearGradient>
    <filter id="${id('shadow')}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="15"/></filter>
    <filter id="${id('glow')}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="${id('fine')}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="${id('glint')}" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>

    <!-- the drop -->
    <clipPath id="${id('drop')}"><circle cx="${DROP.cx}" cy="${DROP.cy}" r="${DROP.r}"/></clipPath>
    <radialGradient id="${id('dropBody')}" cx=".38" cy=".32" r=".75">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset=".45" stop-color="#fff" stop-opacity=".12"/>
      <stop offset=".85" stop-color="#2a1385" stop-opacity=".25"/>
      <stop offset="1" stop-color="#140846" stop-opacity=".55"/>
    </radialGradient>
    <radialGradient id="${id('dropCaustic')}" cx=".68" cy=".78" r=".38">
      <stop offset="0" stop-color="#bff8ff" stop-opacity=".95"/>
      <stop offset="1" stop-color="#bff8ff" stop-opacity="0"/>
    </radialGradient>

    <!-- the tile as a slab of glass -->
    <linearGradient id="${id('gloss')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".42"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id('rim')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/>
      <stop offset=".4" stop-color="#fff" stop-opacity=".16"/>
      <stop offset=".75" stop-color="#fff" stop-opacity=".08"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".4"/>
    </linearGradient>`;

  /* coloured light behind the glass */
  const field = `
    <rect width="512" height="512" fill="${url('base')}"/>
    <g filter="${url('soft')}">
      <ellipse cx="430" cy="92" rx="220" ry="176" fill="${url('cyan')}"/>
      <ellipse cx="62" cy="452" rx="236" ry="196" fill="${url('pink')}"/>
      <ellipse cx="470" cy="500" rx="170" ry="120" fill="${url('cyan')}" opacity=".35"/>
    </g>
    <g filter="${url('haze')}" opacity=".22">
      <ellipse cx="200" cy="150" rx="300" ry="34" fill="${url('sheen')}" transform="rotate(-28 200 150)"/>
    </g>`;

  /* what sits under the glass: a shadow and a band of focused, coloured light */
  const under = `
    <g transform="translate(0 20)" filter="${url('shadow')}" opacity=".5">
      ${vLine(`stroke="#0a0430" stroke-width="${VW}"`)}
    </g>
    <g transform="translate(0 38)" filter="${url('glow')}" opacity=".5" style="mix-blend-mode:screen">
      ${vLine(`stroke="${url('caustic')}" stroke-width="${VW * 0.7}"`)}
    </g>`;

  /* the V itself */
  const glass = `
    <g mask="${url('v')}">
      <g filter="${url('lens')}" transform="translate(256 262) scale(1.22) translate(-256 -262)">${field}</g>
      <rect width="512" height="512" fill="${url('tint')}"/>
    </g>
    <rect width="512" height="512" fill="${url('deep')}" mask="${url('rimDeep')}"/>
    <rect width="512" height="512" fill="#9df3ff" opacity=".7" mask="${url('rimLine')}"/>
    <rect width="512" height="512" fill="${url('lit')}" mask="${url('rimLit')}"/>
    <rect width="512" height="512" fill="#fff" opacity=".5" mask="${url('edge')}"/>
    <g filter="${url('fine')}">
      <polyline points="${VPTS[0][0] + 6},${VPTS[0][1] - 2} ${VPTS[1][0] - 8},${VPTS[1][1] - 34}" fill="none"
                stroke="${url('streak')}" stroke-width="9" stroke-linecap="round"/>
      <polyline points="${VPTS[2][0] - 8},${VPTS[2][1] + 8} ${VPTS[2][0] - 34},${VPTS[2][1] + 58}" fill="none"
                stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>
    </g>
    <circle cx="${VPTS[0][0] - 6}" cy="${VPTS[0][1] - 9}" r="7" fill="#fff" filter="${url('glint')}"/>
    <circle cx="${VPTS[0][0] - 6}" cy="${VPTS[0][1] - 9}" r="3" fill="#fff"/>`;

  /* the drop: the field seen flipped and magnified, as through a lens */
  const drop = `
    <ellipse cx="${DROP.cx}" cy="${DROP.cy + DROP.r + 14}" rx="${DROP.r * 0.7}" ry="6" fill="#0a0430" opacity=".22" filter="${url('glint')}"/>
    <g clip-path="${url('drop')}">
      <g filter="${url('lens')}" transform="translate(${DROP.cx} ${DROP.cy}) scale(-1.6 -1.6) translate(${-DROP.cx} ${-DROP.cy})">${field}</g>
      <circle cx="${DROP.cx}" cy="${DROP.cy}" r="${DROP.r}" fill="${url('dropBody')}"/>
      <circle cx="${DROP.cx}" cy="${DROP.cy}" r="${DROP.r}" fill="${url('dropCaustic')}"/>
    </g>
    <circle cx="${DROP.cx}" cy="${DROP.cy}" r="${DROP.r - 0.75}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
    <ellipse cx="${DROP.cx - 11}" cy="${DROP.cy - 13}" rx="9" ry="5.5" fill="#fff" opacity=".9" transform="rotate(-35 ${DROP.cx - 11} ${DROP.cy - 13})"/>`;

  /* the tile as glass: a curved sheen and a rim catching the light */
  const slab = (r) => `
    <path d="M0 0H512V176C392 236 150 150 0 214Z" fill="${url('gloss')}" opacity=".5"/>
    <rect x="3" y="3" width="506" height="506" rx="${Math.max(0, r - 3)}" fill="none" stroke="${url('rim')}" stroke-width="5"/>`;

  return { defs, field, under, glass, drop, slab };
}

/* ── variants ──────────────────────────────────────────────── */
const head = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="Virulenter">`;

/* everything inside the shape: field, shadow, glass, drop, slab */
function body(a, r) {
  return a.field + a.under + a.glass + a.drop + a.slab(r);
}

/* rounded tile (r = corner radius; 0 = full-bleed square) */
function tile({ size = 512, r = 116, p = 'i-' } = {}) {
  const a = art(p);
  return `${head(size)}
  <defs>${a.defs}
    <clipPath id="${p}tile"><rect width="512" height="512" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#${p}tile)">${body(a, r)}</g>
</svg>
`;
}

/* circle, for android:roundIcon and launchers that mask to a circle */
function round({ size = 192, p = 'r-' } = {}) {
  const a = art(p);
  return `${head(size)}
  <defs>${a.defs}
    <clipPath id="${p}circle"><circle cx="256" cy="256" r="256"/></clipPath>
  </defs>
  <g clip-path="url(#${p}circle)">${a.field + a.under + a.glass + a.drop}
    <circle cx="256" cy="256" r="253" fill="none" stroke="url(#${p}rim)" stroke-width="5"/>
  </g>
</svg>
`;
}

/* content scaled about the centre, for maskable and adaptive layers whose
   visible area is a centred safe zone */
const shrink = (k, inner) => `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${inner}</g>`;

/* maskable: full-bleed field, glass inside the 80% safe zone */
function maskable({ size = 512, p = 'm-' } = {}) {
  const a = art(p);
  return `${head(size)}
  <defs>${a.defs}</defs>
  ${a.field}${shrink(0.78, a.under + a.glass + a.drop)}
</svg>
`;
}

/* Android adaptive icon: the launcher composes these two 108dp layers and
   masks them (circle, squircle, teardrop…), moving them slightly apart for
   parallax. The glass refracts the field, so the foreground carries its own
   lensed copy of it — inside the V only, where a few pixels of parallax do
   not show. Content stays inside the 66dp safe zone (scale ≈ 0.6). */
function adaptiveBackground({ size = 432, p = 'b-' } = {}) {
  const a = art(p);
  return `${head(size)}<defs>${a.defs}</defs>${a.field}</svg>
`;
}

function adaptiveForeground({ size = 432, p = 'f-' } = {}) {
  const a = art(p);
  return `${head(size)}<defs>${a.defs}</defs>${shrink(0.6, a.under + a.glass + a.drop)}</svg>
`;
}

/* Android 13+ themed icons: one flat silhouette the system tints */
function monochrome({ size = 432 } = {}) {
  return `${head(size)}${shrink(0.6, `
    ${vLine(`stroke="#fff" stroke-width="${VW}"`)}
    <circle cx="${DROP.cx}" cy="${DROP.cy}" r="${DROP.r}" fill="#fff"/>`)}</svg>
`;
}

/* ── write the vector files ─────────────────────────────────── */
writeFileSync(join(OUT, 'icon.svg'), tile({ size: 512 }), 'utf8');
writeFileSync(join(OUT, 'favicon.svg'), tile({ size: 512, p: 'fv-' }), 'utf8');
console.log('wrote app/icons/icon.svg, favicon.svg');

/* the in-page brand mark: the same art as a <symbol>, ids prefixed vm- */
{
  const a = art('vm-');
  const symbol = `<symbol id="vmark" viewBox="0 0 512 512">
    <defs>${a.defs}
      <clipPath id="vm-tile"><rect width="512" height="512" rx="116"/></clipPath>
    </defs>
    <g clip-path="url(#vm-tile)">${body(a, 116)}</g>
  </symbol>`;
  const indexPath = join(ROOT, 'app', 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  const start = html.indexOf('<symbol id="vmark"');
  const end = html.indexOf('</symbol>', start);
  if (start < 0 || end < 0) throw new Error('no <symbol id="vmark"> in app/index.html');
  writeFileSync(indexPath, html.slice(0, start) + symbol + html.slice(end + '</symbol>'.length), 'utf8');
  console.log('updated the #vmark symbol in app/index.html');
}

/* ── rasterise ──────────────────────────────────────────────── */
const jobs = [
  { out: join(OUT, 'icon-192.png'), size: 192, svg: () => tile({ size: 192 }) },
  { out: join(OUT, 'icon-512.png'), size: 512, svg: () => tile({ size: 512 }) },
  /* iOS rounds the corners itself, so the touch icon is a full square */
  { out: join(OUT, 'icon-180.png'), size: 180, svg: () => tile({ size: 180, r: 0 }) },
  { out: join(OUT, 'icon-maskable-512.png'), size: 512, svg: () => maskable({ size: 512 }) },
  { out: join(ANDROID, 'drawable', 'ic_launcher_background.png'), size: 432, svg: () => adaptiveBackground() },
  { out: join(ANDROID, 'drawable', 'ic_launcher_foreground.png'), size: 432, svg: () => adaptiveForeground() },
  { out: join(ANDROID, 'drawable', 'ic_launcher_monochrome.png'), size: 432, svg: () => monochrome() }
];
for (const [dir, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  jobs.push({ out: join(ANDROID, 'mipmap-' + dir, 'ic_launcher.png'), size, svg: () => tile({ size, r: 104 }) });
  jobs.push({ out: join(ANDROID, 'mipmap-' + dir, 'ic_launcher_round.png'), size, svg: () => round({ size }) });
}

let CHROME;
try { CHROME = findChrome(); } catch (e) {
  console.log(e.message + ' SVGs written, PNGs skipped.');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'vr-icon-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-sandbox', '--no-first-run', '--disable-crash-reporter', '--disable-breakpad',
  '--force-color-profile=srgb', '--hide-scrollbars', 'about:blank'
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
/* transparent page, so rounded corners and adaptive layers keep their alpha */
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

for (const job of jobs) {
  /* drawn at the exact target size, so Chrome antialiases for that size */
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${job.size}px;height:${job.size}px}</style></head><body>${job.svg()}</body></html>`;
  await send('Emulation.setDeviceMetricsOverride', { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64') });
  await new Promise((r) => setTimeout(r, 350));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 }
  });
  mkdirSync(dirname(job.out), { recursive: true });
  writeFileSync(job.out, Buffer.from(shot.data, 'base64'));
  console.log('wrote ' + job.out.replace(ROOT + '/', ''));
}

ws.close();
chrome.kill();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} ; process.exit(0); }, 200);
