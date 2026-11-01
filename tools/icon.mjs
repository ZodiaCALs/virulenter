#!/usr/bin/env node
/**
 * icon.mjs — renders the Virulenter app icon, in any of the candidate
 * styles drawn in tools/icon-styles.mjs, for every platform the app ships on.
 *
 *   node tools/icon.mjs                    apply the default style
 *   node tools/icon.mjs --style=chrono     apply another style
 *   node tools/icon.mjs --gallery          render every style side by side
 *                                          into docs/icons/ (nothing applied)
 *
 * Applying a style writes, all from the one drawing:
 *   app/icons/icon.svg, favicon.svg, icon-180/192/512.png, icon-maskable-512.png
 *   app/index.html            the in-page brand mark (the #vmark symbol)
 *   apk/…/res and native/composeApp/src/androidMain/res
 *                             legacy launcher bitmaps (square and round), the
 *                             adaptive icon's background and foreground, and
 *                             the monochrome layer Android 13+ tints
 *   native/composeApp/icons   app.ico (Windows), app.icns (macOS), app.png
 *                             (Linux), for the desktop installers
 *   native/composeApp/src/commonMain/composeResources/drawable/app_icon.png
 *                             the window and tray icon at run time
 *
 * PNGs are drawn by headless Chrome (tools/chrome.mjs finds it); .ico and
 * .icns files are packed here from those PNGs, with no other tools.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome.mjs';
import { STYLES, DEFAULT_STYLE, styleById } from './icon-styles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const GALLERY = process.argv.includes('--gallery');
const STYLE = styleById(arg('style') || DEFAULT_STYLE);

/* ── composition ───────────────────────────────────────────────
   A style is a plate and a glyph on a 512 canvas. These put them together
   for each place an icon is shown. */
const DEFS = /<defs>[\s\S]*?<\/defs>/g;
function parts(style, p) {
  const plate = style.plate(p);
  const plateDefs = (plate.match(DEFS) || []).join('');
  const plateBody = plate.replace(DEFS, '');
  return { plateDefs, plateBody, glyph: style.glyph(p, plateBody) };
}
const svg = (size, inner, view = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${view}" role="img" aria-label="Virulenter">${inner}</svg>\n`;
/* scale about the centre: the adaptive layers place the 512 tile in the
   72dp a launcher shows of its 108dp layers, so 2/3 */
const shrink = (k, inner) => `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${inner}</g>`;
const ADAPTIVE = 2 / 3;

/* Apple's continuous corner, close enough: a superellipse, n = 5 */
export function squirclePath(x, y, w, n = 5) {
  const a = w / 2, cx = x + a, cy = y + a, pts = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push(`${(cx + a * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)} ${(cy + a * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const shapes = {
  /* rounded square; r = 0 is full bleed (iOS and maskable round it themselves) */
  tile: (style, { size = 512, r = 112, p = 't-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}<defs><clipPath id="${p}clip"><rect width="512" height="512" rx="${r}"/></clipPath></defs>
      <g clip-path="url(#${p}clip)">${a.plateBody}${a.glyph}</g>`);
  },
  circle: (style, { size = 192, p = 'c-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}<defs><clipPath id="${p}clip"><circle cx="256" cy="256" r="256"/></clipPath></defs>
      <g clip-path="url(#${p}clip)">${a.plateBody}${a.glyph}</g>`);
  },
  squircle: (style, { size = 180, p = 'q-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}<defs><clipPath id="${p}clip"><path d="${squirclePath(0, 0, 512)}"/></clipPath></defs>
      <g clip-path="url(#${p}clip)">${a.plateBody}${a.glyph}</g>`);
  },
  /* macOS: the shape sits inside the canvas with room for its shadow */
  mac: (style, { size = 512, p = 'mac-' } = {}) => {
    const a = parts(style, p), k = 0.805, o = 256 - 256 * k;
    return svg(size, `${a.plateDefs}<defs>
        <clipPath id="${p}clip"><rect x="${o}" y="${o}" width="${512 * k}" height="${512 * k}" rx="${92}"/></clipPath>
        <filter id="${p}drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#000" flood-opacity=".32"/></filter>
      </defs>
      <rect x="${o}" y="${o}" width="${512 * k}" height="${512 * k}" rx="92" fill="#000" filter="url(#${p}drop)"/>
      <g clip-path="url(#${p}clip)">${shrink(k, a.plateBody + a.glyph)}</g>`);
  },
  maskable: (style, { size = 512, p = 'm-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}${a.plateBody}${shrink(0.9, a.glyph)}`);
  },
  background: (style, { size = 432, p = 'b-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}${shrink(ADAPTIVE, a.plateBody)}`);
  },
  foreground: (style, { size = 432, p = 'f-' } = {}) => {
    const a = parts(style, p);
    return svg(size, `${a.plateDefs}${shrink(ADAPTIVE, a.glyph)}`);
  },
  monochrome: (style, { size = 432 } = {}) => svg(size, shrink(ADAPTIVE, style.mono())),
  /* Android 13+ themed icon as a launcher draws it: the monochrome layer
     tinted over a tonal plate (for the gallery) */
  themed: (style, { size = 180, p = 'th-', bg = '#D8E2FF', ink = '#1A2B52' } = {}) =>
    svg(size, `<defs>
        <clipPath id="${p}clip"><circle cx="256" cy="256" r="256"/></clipPath>
        <mask id="${p}mask" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">${style.mono().replace(/mono-/g, p + 'mono-')}</mask>
      </defs>
      <g clip-path="url(#${p}clip)"><rect width="512" height="512" fill="${bg}"/>
      <rect width="512" height="512" fill="${ink}" mask="url(#${p}mask)"/></g>`)
};

/* ── rasteriser: headless Chrome over the DevTools protocol ──────── */
async function openChrome() {
  const CHROME = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'vr-icon-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-sandbox', '--no-first-run', '--disable-crash-reporter', '--disable-breakpad',
    '--force-color-profile=srgb', '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });
  const pf = join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    if (existsSync(pf)) port = readFileSync(pf, 'utf8').split('\n')[0].trim() || null;
    if (!port) await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { proc.kill(); throw new Error('could not reach Chrome'); }
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
  /* a transparent page, so rounded corners and adaptive layers keep alpha */
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  /* height 0 = as tall as the page */
  async function shoot(html, width, height, scale = 1) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: height || 800, deviceScaleFactor: scale, mobile: false });
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html, 'utf8').toString('base64') });
    await new Promise((r) => setTimeout(r, 400));
    if (!height) {
      const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
      height = result.value;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
      await new Promise((r) => setTimeout(r, 200));
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    return Buffer.from(shot.data, 'base64');
  }
  /* an SVG drawn at its exact pixel size, so Chrome antialiases for it */
  const png = (svgText, size) => shoot(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svgText}</body></html>`, size, size);
  const close = () => { ws.close(); proc.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 200); };
  return { shoot, png, close };
}

/* ── .ico and .icns: containers of PNGs ─────────────────────────── */
function ico(pngs) {             // [{ size, data }]
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((x) => x.data)]);
}
function icns(entries) {         // [{ type: 'ic10', data }]
  const chunks = entries.map(({ type, data }) => {
    const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(8 + data.length, 4);
    return Buffer.concat([h, data]);
  });
  const h = Buffer.alloc(8); h.write('icns', 0, 'ascii'); h.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([h, ...chunks]);
}

const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); console.log('wrote ' + path.replace(ROOT + '/', '')); };

/* ── apply one style everywhere ─────────────────────────────────── */
async function apply(style) {
  const WEB = join(ROOT, 'app', 'icons');
  write(join(WEB, 'icon.svg'), shapes.tile(style, { size: 512 }));
  write(join(WEB, 'favicon.svg'), shapes.tile(style, { size: 512, p: 'fv-' }));

  /* the in-page brand mark: the same tile as a <symbol>, ids prefixed vm- */
  {
    const a = parts(style, 'vm-');
    const symbol = `<symbol id="vmark" viewBox="0 0 512 512">${a.plateDefs}
      <defs><clipPath id="vm-clip"><rect width="512" height="512" rx="112"/></clipPath></defs>
      <g clip-path="url(#vm-clip)">${a.plateBody}${a.glyph}</g>
    </symbol>`;
    const indexPath = join(ROOT, 'app', 'index.html');
    const html = readFileSync(indexPath, 'utf8');
    const start = html.indexOf('<symbol id="vmark"');
    const end = html.indexOf('</symbol>', start);       // symbols never nest
    if (start < 0 || end < 0) throw new Error('no <symbol id="vmark"> in app/index.html');
    writeFileSync(indexPath, html.slice(0, start) + symbol + html.slice(end + '</symbol>'.length), 'utf8');
    console.log('updated the #vmark symbol in app/index.html');
  }

  let r;
  try { r = await openChrome(); } catch (e) { console.log(e.message + ' — SVGs written, PNGs skipped.'); return; }
  try {
    write(join(WEB, 'icon-192.png'), await r.png(shapes.tile(style, { size: 192 }), 192));
    write(join(WEB, 'icon-512.png'), await r.png(shapes.tile(style, { size: 512 }), 512));
    write(join(WEB, 'icon-180.png'), await r.png(shapes.tile(style, { size: 180, r: 0 }), 180));
    write(join(WEB, 'icon-maskable-512.png'), await r.png(shapes.maskable(style, { size: 512 }), 512));

    /* Android: the WebView app and the native app share the same set */
    const androidRes = [join(ROOT, 'apk', 'app', 'src', 'main', 'res')];
    const nativeRoot = join(ROOT, 'native', 'composeApp');
    if (existsSync(nativeRoot)) androidRes.push(join(nativeRoot, 'src', 'androidMain', 'res'));
    for (const res of androidRes) {
      /* the 108dp layers at xxxhdpi (432px); Android scales them down per density */
      for (const old of ['ic_launcher_background', 'ic_launcher_foreground', 'ic_launcher_monochrome']) {
        rmSync(join(res, 'drawable', old + '.png'), { force: true });
      }
      write(join(res, 'drawable-xxxhdpi', 'ic_launcher_background.png'), await r.png(shapes.background(style), 432));
      write(join(res, 'drawable-xxxhdpi', 'ic_launcher_foreground.png'), await r.png(shapes.foreground(style), 432));
      write(join(res, 'drawable-xxxhdpi', 'ic_launcher_monochrome.png'), await r.png(shapes.monochrome(style), 432));
      for (const [dir, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
        write(join(res, 'mipmap-' + dir, 'ic_launcher.png'), await r.png(shapes.tile(style, { size, r: 100 }), size));
        write(join(res, 'mipmap-' + dir, 'ic_launcher_round.png'), await r.png(shapes.circle(style, { size }), size));
      }
    }

    /* desktop: installers and the running window */
    if (existsSync(nativeRoot)) {
      const ICONS = join(nativeRoot, 'icons');
      const tilePng = async (size) => ({ size, data: await r.png(shapes.tile(style, { size, r: 104 }), size) });
      write(join(ICONS, 'app.ico'), ico(await Promise.all([16, 24, 32, 48, 64, 128, 256].map(tilePng))));
      const mac = async (size) => r.png(shapes.mac(style, { size }), size);
      write(join(ICONS, 'app.icns'), icns([
        { type: 'icp4', data: await mac(16) }, { type: 'icp5', data: await mac(32) },
        { type: 'ic11', data: await mac(32) }, { type: 'ic12', data: await mac(64) },
        { type: 'ic07', data: await mac(128) }, { type: 'ic13', data: await mac(256) },
        { type: 'ic08', data: await mac(256) }, { type: 'ic14', data: await mac(512) },
        { type: 'ic09', data: await mac(512) }, { type: 'ic10', data: await mac(1024) }
      ]));
      write(join(ICONS, 'app.png'), await r.png(shapes.tile(style, { size: 512, r: 104 }), 512));
      write(join(nativeRoot, 'src', 'commonMain', 'composeResources', 'drawable', 'app_icon.png'),
        await r.png(shapes.tile(style, { size: 256, r: 56 }), 256));
    }
  } finally { r.close(); }
}

/* ── gallery: every style, as each platform shows it ────────────── */
async function gallery() {
  const OUT = join(ROOT, 'docs', 'icons');
  mkdirSync(OUT, { recursive: true });
  const card = (style, n) => {
    const P = (k) => `${style.id}-${k}-`;
    const light = `
      <figure>${shapes.squircle(style, { size: 92, p: P('ql') })}<figcaption>iOS</figcaption></figure>
      <figure>${shapes.circle(style, { size: 92, p: P('cl') })}<figcaption>Android</figcaption></figure>
      <figure>${shapes.themed(style, { size: 92, p: P('tl') })}<figcaption>Themed</figcaption></figure>
      <figure>${shapes.mac(style, { size: 108, p: P('ml') })}<figcaption>macOS</figcaption></figure>`;
    const dark = `
      <figure>${shapes.squircle(style, { size: 92, p: P('qd') })}<figcaption>iOS</figcaption></figure>
      <figure>${shapes.tile(style, { size: 92, r: 104, p: P('wd') })}<figcaption>Windows</figcaption></figure>
      <figure>${shapes.themed(style, { size: 92, p: P('td'), bg: '#26304A', ink: '#CBD8FF' })}<figcaption>Themed</figcaption></figure>
      <figure class="smalls"><div>${[48, 32, 16].map((s, i) => shapes.tile(style, { size: s, r: 112, p: P('s' + i) })).join('')}</div><figcaption>48 · 32 · 16</figcaption></figure>`;
    return `<section class="opt">
      <div class="lead">
        <header><span class="n">${n}</span><div><h2>${style.name}${style.id === DEFAULT_STYLE ? ' <em>applied</em>' : ''}</h2><p class="fam">${style.family}</p></div></header>
        ${shapes.squircle(style, { size: 196, p: P('hero') })}
        <p class="idea">${style.idea}</p>
        <code>--style=${style.id}</code>
      </div>
      <div class="walls"><div class="wall light">${light}</div><div class="wall dark">${dark}</div></div>
    </section>`;
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virulenter icon options</title>
<style>
  :root { --bg: #F3F4F7; --ink: #10131A; --ink2: #5A6273; --card: #fff; --line: rgba(16,19,26,.08); }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 36px; background: var(--bg); color: var(--ink);
         font: 14.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -.5px; }
  .lede { margin: 0 0 24px; color: var(--ink2); max-width: 900px; }
  .opt { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 18px; align-items: stretch;
         background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
  .lead { display: grid; gap: 10px; align-content: start; justify-items: start; }
  .lead > svg { filter: drop-shadow(0 10px 16px rgba(16,19,26,.18)); margin: 4px 0 2px 20px; }
  header { display: flex; gap: 10px; align-items: center; }
  .n { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: var(--ink); color: #fff; font-weight: 700; font-size: 13px; }
  h2 { margin: 0; font-size: 17px; letter-spacing: -.3px; line-height: 1.2; }
  h2 em { font-style: normal; font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; vertical-align: 2px;
          margin-left: 6px; padding: 2px 6px; border-radius: 5px; background: #10131A; color: #fff; }
  .fam { margin: 0; color: var(--ink2); font-size: 12.5px; }
  .idea { margin: 0; color: var(--ink2); font-size: 13px; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink2); background: var(--bg); border-radius: 6px; padding: 5px 8px; }
  .walls { display: grid; gap: 12px; grid-template-rows: 1fr 1fr; }
  .wall { display: flex; gap: 14px; align-items: center; justify-content: space-around; padding: 14px; border-radius: 10px; }
  .wall.light { background: linear-gradient(135deg, #DCE6FF, #F4E6FF 55%, #FFE9DA); color: #2A3040; }
  .wall.dark { background: linear-gradient(135deg, #0B1020, #1B1036 55%, #2A0F24); color: #C9D0E0; }
  figure { margin: 0; display: grid; justify-items: center; gap: 6px; }
  figure svg { display: block; }
  figcaption { font-size: 11px; font-weight: 600; letter-spacing: .2px; opacity: .78; }
  .smalls div { display: flex; gap: 8px; align-items: flex-end; height: 92px; padding-bottom: 22px; }
</style></head><body>
<h1>Virulenter · icon options</h1>
<p class="lede"><b>Glass Heat</b>, the applied mark, is Material Heat rebuilt in glass; the five original directions follow. Each is shown as iOS, Android (and its Android 13+ themed form), macOS and Windows draw it, on a light and a dark wallpaper, down to favicon size. Apply one with <code>node tools/icon.mjs --style=…</code>.</p>
${STYLES.map((s, i) => card(s, i + 1)).join('')}
</body></html>`;
  write(join(OUT, 'index.html'), html);
  let r;
  try { r = await openChrome(); } catch (e) { console.log(e.message + ' — gallery PNG skipped.'); return; }
  try {
    write(join(OUT, 'options.png'), await r.shoot(html, 1240, 0, 1));
    for (const s of STYLES) write(join(OUT, `${s.id}.png`), await r.png(shapes.squircle(s, { size: 512, p: s.id + '-x-' }), 512));
  } finally { r.close(); }
}

if (GALLERY) await gallery();
else await apply(STYLE);
setTimeout(() => process.exit(0), 300);
