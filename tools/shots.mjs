#!/usr/bin/env node
/**
 * shots.mjs — rebuilds verify/shots/*.png for Virulenter.
 * Seeds throwaway demo data (never persisted) so the shots are not empty.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // project root
const OUT = join(ROOT, 'verify', 'shots');
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'vr-shot-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-sandbox', '--no-first-run', '--disable-crash-reporter', '--disable-breakpad',
  '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'
], { stdio: 'ignore' });

const pf = join(profile, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 120; i++) {
  if (existsSync(pf)) { port = readFileSync(pf, 'utf8').split('\n')[0].trim(); if (port) break; }
  await new Promise((r) => setTimeout(r, 100));
}
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pend = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) { const { res, rej } = pend.get(x.id); pend.delete(x.id); x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  const t0 = Date.now();
  for (;;) {
    try { if (await ev('!!window.V && !!V.app && V.app.ready === true')) return; } catch (e) {}
    if (Date.now() - t0 > 15000) throw new Error('not ready');
    await wait(120);
  }
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(data, 'base64'));
  console.log('wrote', name + '.png');
}

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable'); await send('Runtime.enable');

const URL = 'file://' + join(ROOT, 'app', 'index.html');

/* deterministic demo data: a few events with taps spread over ~10 weeks */
const SEED = `(() => {
  const D = V.date, now = Date.now(), day = 86400000;
  function taps(perDayAgo, times) {
    const out = [];
    perDayAgo.forEach(function (d) {
      for (let i = 0; i < times; i++) {
        const base = new Date(); base.setDate(base.getDate() - d);
        base.setHours(8 + i * 3, 12 + i * 7, 0, 0);
        out.push(base.getTime());
      }
    });
    return out.sort((a, b) => a - b);
  }
  const a = V.store.create({ name: 'Coffee', color: '#f0872b', start: D.toISO(D.addDays(D.today(), -62)) });
  a.log = taps([0,0,0,1,1,2,2,3,4,5,6,7,8,9,11,12,14,16,18,21,23,26,29,33,38,44,51,58], 1);
  const b = V.store.create({ name: 'Workout', color: '#0f9d58', start: D.toISO(D.addDays(D.today(), -40)) });
  b.log = taps([1,2,3,5,6,8,9,12,13,15,19,20,24,27,31,35], 1);
  const c = V.store.create({ name: 'Cigarette', color: '#d92d4b', start: D.toISO(D.addDays(D.today(), -30)) });
  c.log = taps([0,1,2,3,4,5,7,8,10,12,15,17,20,23,26,28], 3);
  const d = V.store.create({ name: 'Water glass', color: '#2f6bff', start: D.toISO(D.addDays(D.today(), -10)) });
  d.log = taps([0,0,0,0,1,1,1,2,2,3,3,4,5,6,7,8,9], 2);
  V.views.cal.sel = D.toISO(D.today());
  V.views.renderAll('home');
})()`;

const sizes = [
  { w: 430, h: 932, dpr: 3, tag: 'phone' },
  { w: 900, h: 1000, dpr: 2, tag: 'wide' }
];

/* empty state first, before any data exists */
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: URL }); await ready(); await wait(400);
await shot('phone-empty');
await ev(`V.app.openForm(null)`); await wait(450);
await shot('phone-new-event');

for (const s of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: s.w < 600 });
  await send('Page.navigate', { url: URL }); await ready(); await wait(350);
  await ev(SEED); await wait(500);

  await shot(`${s.tag}-events`);
  await ev(`V.app.handleTap(document.querySelector('[data-tap]'))`); await wait(250);
  await shot(`${s.tag}-tap-feedback`);

  await ev(`V.views.toggleTab('calendar')`); await wait(450);
  await shot(`${s.tag}-calendar`);

  await ev(`V.views.setSelectedDay(V.date.toISO(V.date.addDays(V.date.today(), -2)))`); await wait(350);
  await shot(`${s.tag}-day-panel`);

  await ev(`V.app.openDataSheet()`); await wait(500);
  await shot(`${s.tag}-move-data`);

  await ev(`V.ui.closeSheet(V.app.dataOverlay)`); await wait(250);
  await ev(`V.app.openForm(V.store.events[0].id)`); await wait(500);
  await shot(`${s.tag}-edit-event`);
  await ev(`V.ui.closeSheet(V.app.formOverlay)`); await wait(250);

  /* statistics */
  await ev(`V.views.toggleTab('stats')`); await wait(600);
  await shot(`${s.tag}-stats`);
  await ev(`window.scrollTo(0, document.querySelector('#statMonthPanel') ? 0 : 700)`); await wait(300);
  await shot(`${s.tag}-stats-2`);

  /* calendar jump picker */
  await ev(`V.views.toggleTab('calendar'); V.app.openJump()`); await wait(550);
  await shot(`${s.tag}-jump`);

  /* appearance sheet, including a custom accent */
  await ev(`V.ui.closeSheet(V.app.jumpOverlay); V.app.openLook()`); await wait(550);
  await shot(`${s.tag}-appearance`);
  await ev(`V.store.setCustomAccent('#ff0066'); V.app.applyLook(V.store.look); V.app.renderLook()`); await wait(500);
  await shot(`${s.tag}-appearance-custom`);
  await ev(`V.store.setCustomAccent('#0d9488'); V.app.applyLook(V.store.look); V.app.renderLook(); V.ui.closeSheet(V.app.lookOverlay)`); await wait(450);

  /* teal accent across the app */
  await ev(`V.views.toggleTab('home')`); await wait(450);
  await shot(`${s.tag}-accent-teal`);
  await ev(`V.app.openDataSheet()`); await wait(500);
  await shot(`${s.tag}-settings`);
}

ws.close(); chrome.kill(); process.exit(0);
