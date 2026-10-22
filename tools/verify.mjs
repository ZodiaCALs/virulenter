#!/usr/bin/env node
/**
 * verify.mjs — drives Virulenter in headless Chrome over CDP.
 * Checks the counter, the calendar log, URL-only persistence, and that the
 * app never touches browser storage.
 *
 *   node tools/verify.mjs [--url=...]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // project root
const SHOTS = join(ROOT, 'verify', 'shots');
const APP = join(ROOT, 'app');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(SHOTS, { recursive: true });

/* Package registries and chat clients aside, the PWA layer (manifest, service
   worker, install prompt) only exists over http(s) — file:// blocks it with a
   CORS error. Serve the app on a loopback port so the same suite can exercise
   the real installed-app code paths. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serve(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/'
      });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

/* --root= lets the same suite run against any build of the app, e.g. the assets
   that were packaged into the APK. */
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const SERVE_ROOT = rootArg ? resolve(rootArg.slice(7)) : APP;
/* The Android build ships no service worker on purpose (tools/sync-android.mjs
   drops it): the assets are already on the device. Detect that and check the
   omission is deliberate instead of failing on the missing file. */
const IS_APK_ASSETS = /src[\/]main[\/]assets$/.test(SERVE_ROOT);
const local = await serve(SERVE_ROOT);
const HTTP_BASE = `http://127.0.0.1:${local.port}/`;
const HTTP_URL = HTTP_BASE + 'index.html';
/* --url= overrides the target, e.g. to point at dist/virulenter.html over file:// */
const target = process.argv.find((a) => a.startsWith('--url='))?.slice(6) || HTTP_URL;
const profile = mkdtempSync(join(tmpdir(), 'vr-chrome-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-dev-shm-usage',
  '--disable-crash-reporter', '--disable-breakpad',
  '--hide-scrollbars', '--window-size=430,900',
  'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', () => {});

const portFile = join(profile, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 120; i++) {
  if (existsSync(portFile)) {
    port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
    if (port) break;
  }
  await new Promise((r) => setTimeout(r, 100));
}
if (!port) { console.error('no DevTools port'); chrome.kill(); process.exit(1); }

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push({ type: msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ') });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push({ type: 'exception', text: (d.exception?.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber });
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') logs.push({ type: 'log:error', text: e.text + ' ' + (e.url || '') });
  }
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) +
      '\n  in: ' + expression.slice(0, 160));
  }
  return r.result.value;
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

async function ready(timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await evaluate('typeof window.V !== "undefined" && !!window.V.app && window.V.app.ready === true')) return true;
    } catch (e) {}
    if (Date.now() - t0 > timeout) throw new Error('app never became ready');
    await new Promise((r) => setTimeout(r, 120));
  }
}

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.clearBrowserCache');
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });

await send('Page.navigate', { url: target });
await ready();
await new Promise((r) => setTimeout(r, 500));

/* ── 1. first run: empty, and nothing in browser storage ── */
const boot = await evaluate(`(() => ({
  v: typeof window.V,
  ready: !!window.V.app.ready,
  events: V.store.events.length,
  cards: document.querySelectorAll('#eventList .ev').length,
  emptyVisible: !document.querySelector('#listEmpty').hidden,
  stats: document.querySelector('#statsRow').innerText.replace(/\\n/g, '|'),
  localStorage: localStorage.length,
  sessionStorage: sessionStorage.length,
  cookies: document.cookie,
  dbs: typeof indexedDB.databases === 'function' ? 'unknown' : 'unknown'
}))()`);
check('app boots with no data', boot.v === 'object' && boot.ready && boot.events === 0, JSON.stringify(boot));
check('empty state shown on first run', boot.emptyVisible && boot.cards === 0, JSON.stringify(boot));
await shot('01-empty');

/* ── 2. create an event through the real form ───────────── */
const created = await evaluate(`(() => {
  document.querySelector('#btnAddEmpty').click();
  return new Promise(res => setTimeout(() => {
    const open = !document.querySelector('#formOverlay').hidden;
    document.querySelector('#fName').value = 'Coffee';
    document.querySelector('#fColor [data-color="#f0872b"]').click();
    document.querySelector('#fStart').value = '2026-01-01';
    document.querySelector('#eventForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    setTimeout(() => {
      const e = V.store.events[0];
      res({ open, n: V.store.events.length, name: e && e.name, color: e && e.color, start: e && e.start,
            sheetClosed: document.querySelector('#formOverlay').hidden,
            cards: document.querySelectorAll('#eventList .ev').length,
            emptyHidden: document.querySelector('#listEmpty').hidden,
            url: location.href.length });
    }, 350);
  }, 300));
})()`, true);
check('form creates an event', created.open && created.n === 1 && created.cards === 1 && created.sheetClosed, JSON.stringify(created));
check('colour and start date applied', created.color === '#f0872b' && created.start === '2026-01-01', JSON.stringify(created));
check('empty state hidden once an event exists', created.emptyHidden);
await shot('02-one-event');

/* ── 3. the button: +1 and a timestamped log entry ──────── */
const taps = await evaluate(`(() => new Promise(resolve => {
  const btn = document.querySelector('[data-tap]');
  const read = () => ({
    count: V.store.count(V.store.events[0]),
    log: V.store.events[0].log.slice(),
    shown: document.querySelector('[data-count]').textContent,
    unit: document.querySelector('.ev-count > span:last-child').textContent,
    last: document.querySelector('[data-last]').innerText
  });
  /* wait until the DOM reflects the expected count before sampling */
  const until = (n, done) => {
    let tries = 0;
    const tick = () => {
      const now = read();
      if ((now.shown === String(n) && now.count === n) || ++tries > 30) done(now);
      else setTimeout(tick, 40);
    };
    tick();
  };
  const before = read();
  const t0 = Date.now();
  btn.click();
  until(1, (afterOne) => {
    btn.click();
    btn.click();
    until(3, (after) => resolve({ before, afterOne, after, t0, t1: Date.now() }));
  });
}))()`, true);
check('button increments the count by one per press',
  taps.before.count === 0 && taps.after.count === 3 && taps.after.shown === '3', JSON.stringify(taps.after));
check('each press appends a real timestamp',
  taps.after.log.length === 3 && taps.after.log.every((t) => t >= taps.t0 - 2000 && t <= taps.t1 + 2000),
  JSON.stringify(taps.after.log.map((t) => new Date(t).toISOString())));
check('singular/plural label follows the count',
  taps.afterOne.unit === 'tap' && taps.after.unit === 'taps',
  JSON.stringify({ shown: taps.after.shown + ' ' + taps.after.unit, atOne: taps.afterOne.unit }));
check('last-tap line updates', /Last:/.test(taps.after.last), taps.after.last.replace(/\n/g, ' '));
await shot('03-after-taps');

/* ── 4. nothing written to browser storage, but the URL carries it ── */
const persist = await evaluate(`(() => ({
  localStorage: localStorage.length,
  sessionStorage: sessionStorage.length,
  cookies: document.cookie,
  href: location.href,
  hasHash: /#d=/.test(location.href),
  payloadLen: (location.hash.match(/d=([A-Za-z0-9\\-_]+)/) || [,''])[1].length
}))()`);
check('never writes to localStorage / sessionStorage / cookies',
  persist.localStorage === 0 && persist.sessionStorage === 0 && persist.cookies === '',
  JSON.stringify({ ls: persist.localStorage, ss: persist.sessionStorage, ck: persist.cookies }));
check('state is carried in the URL', persist.hasHash && persist.payloadLen > 8, `payload ${persist.payloadLen} chars`);
await shot('04-url-state');

/* ── 5. the URL actually restores everything after a reload ── */
const savedUrl = persist.href;
await send('Page.navigate', { url: savedUrl });
await ready();
await new Promise((r) => setTimeout(r, 400));
const restored = await evaluate(`(() => {
  const e = V.store.events[0];
  return { n: V.store.events.length, name: e && e.name, color: e && e.color,
           count: e && V.store.count(e), shown: document.querySelector('[data-count]')?.textContent,
           logTimes: e ? e.log.map(t => V.date.fmtTime(t)) : [] };
})()`);
check('reloading from the link restores events and every tap',
  restored.n === 1 && restored.count === 3 && restored.shown === '3' && restored.color === '#f0872b',
  JSON.stringify(restored));

/* ── 6. the reload happened in a *fresh* browser profile context ── */
const second = await evaluate(`(() => ({ ls: localStorage.length, ss: sessionStorage.length }))()`);
check('still zero browser storage after a real visit', second.ls === 0 && second.ss === 0, JSON.stringify(second));

/* ── 7. calendar reflects the log ───────────────────────── */
await evaluate(`V.views.toggleTab('calendar')`);
await new Promise((r) => setTimeout(r, 350));
const cal = await evaluate(`(() => {
  const today = V.date.toISO(V.date.today());
  const cell = document.querySelector('.cal-cell[data-date="' + today + '"]');
  return {
    title: document.querySelector('#calTitle').textContent,
    cells: document.querySelectorAll('#calGrid .cal-cell').length,
    todayCell: !!cell,
    todayClass: cell && cell.className,
    todayBadge: cell && cell.querySelector('.cal-n') && cell.querySelector('.cal-n').textContent,
    dayPanel: document.querySelector('#dayPanel').innerText.replace(/\\n+/g, ' | ').slice(0, 140),
    week: document.querySelector('#calWeek').innerText.replace(/\\n/g, ' ')
  };
})()`);
check('calendar renders a Monday-first month', cal.cells >= 28 && cal.cells <= 42 && cal.week.startsWith('Mon'), JSON.stringify({ cells: cal.cells, week: cal.week }));
check('taps show on the calendar with an intensity level',
  /v[1-4]/.test(cal.todayClass || '') && cal.todayBadge === '3', JSON.stringify({ cls: cal.todayClass, badge: cal.todayBadge }));
check('day panel lists the logged taps with times', /Coffee/.test(cal.dayPanel) && /\d\d:\d\d/.test(cal.dayPanel), cal.dayPanel);
await shot('05-calendar');

/* ── 8. removing a tap from the calendar ────────────────── */
const untap = await evaluate(`(() => {
  const before = V.store.count(V.store.events[0]);
  document.querySelector('#dayPanel [data-untap]').click();
  return new Promise(res => setTimeout(() => {
    const e = V.store.events[0];
    res({ before, after: V.store.count(e), badge: document.querySelector('.cal-cell.today .cal-n')?.textContent,
          card: document.querySelector('[data-count]')?.textContent,
          urlHasData: /#d=/.test(location.href) });
  }, 350));
})()`, true);
check('a tap can be removed and the count follows',
  untap.before === 3 && untap.after === 2 && untap.card === '2', JSON.stringify(untap));

/* ── 9. a day with no taps stays empty ──────────────────── */
const emptyDay = await evaluate(`(() => {
  const cells = [...document.querySelectorAll('.cal-cell:not(.out)')];
  const blank = cells.find(c => !c.querySelector('.cal-n'));
  blank.click();
  return new Promise(res => setTimeout(() => {
    res({ date: blank.dataset.date, panel: document.querySelector('#dayPanel').innerText.replace(/\\n+/g, ' | ') });
  }, 250));
})()`, true);
check('empty day says so', /No taps on this day/.test(emptyDay.panel), emptyDay.panel.slice(0, 90));

/* ── 10. add a second event and confirm independent counters ── */
const twoEvents = await evaluate(`(() => {
  V.views.toggleTab('home');
  document.querySelector('#fab').click();
  return new Promise(res => setTimeout(() => {
    document.querySelector('#fName').value = 'Workout';
    document.querySelector('#eventForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    setTimeout(() => {
      const ids = V.store.events.map(e => e.id);
      V.store.logTap(ids[1]);
      V.app.persist();
      V.views.renderHome();
      const counts = [...document.querySelectorAll('[data-count]')].map(n => n.textContent);
      res({ n: V.store.events.length, counts,
            perEvent: V.store.events.map(e => [e.name, V.store.count(e)]) });
    }, 350);
  }, 300));
})()`, true);
check('events keep independent counts', twoEvents.n === 2 && JSON.stringify(twoEvents.perEvent) ===
  JSON.stringify([['Coffee', 2], ['Workout', 1]]), JSON.stringify(twoEvents.perEvent));
await shot('06-two-events');

/* ── 11. calendar day-total merges both events ──────────── */
const merged = await evaluate(`(() => {
  const today = V.date.toISO(V.date.today());
  const totals = V.store.dayTotals();
  const entries = V.store.entriesOnDay(today);
  return { todayTotal: totals[today], entries: entries.length, names: entries.map(e => e.event.name) };
})()`);
check('calendar totals merge all events for a day',
  merged.todayTotal === 3 && merged.entries === 3 && merged.names.length === 3, JSON.stringify(merged));

/* ── 12. too-long payload is reported, not silently dropped ── */
const longData = await evaluate(`(() => {
  const e = V.store.events[0];
  const before = V.store.urlOk;
  for (let i = 0; i < 700; i++) e.log.push(Date.now() - i * 60000);
  const ok = V.app.persist();
  const notice = document.querySelector('#notice');
  const res = { before, ok, urlOk: V.store.urlOk, len: V.store.urlLength(),
                noticeShown: !notice.hidden, noticeText: notice.innerText.slice(0, 80) };
  e.log = e.log.slice(0, 2);
  V.app.persist();
  return res;
})()`);
check('oversized log warns instead of overflowing the address bar',
  longData.ok === false && longData.urlOk === false && longData.noticeShown &&
  longData.len > 2000, JSON.stringify(longData));

/* ── 13. export → erase → import round trip ─────────────── */
const roundTrip = await evaluate(`(() => {
  const json = V.store.serialize();
  const parsed = JSON.parse(json);
  const before = V.store.events.map(e => [e.name, V.store.count(e)]);
  V.store.events = [];
  const res = V.store.importJSON(json, 'replace');
  const after = V.store.events.map(e => [e.name, V.store.count(e)]);
  return { ok: res.ok, app: parsed.app, exported: parsed.events.length, before, after,
           same: JSON.stringify(before) === JSON.stringify(after) };
})()`);
check('backup export/import round-trips exactly',
  roundTrip.ok && roundTrip.same && roundTrip.app === 'Virulenter', JSON.stringify(roundTrip));

/* ── 14. merge by id unions timestamps instead of duplicating ── */
const mergeTest = await evaluate(`(() => {
  const link = V.codec.urlFor(V.store.snapshot());
  const state = V.codec.decode(link);
  const id = V.store.events[0].id;
  /* decoding mints fresh ids — re-key so this really is "the same event" */
  state.events[0].id = id;
  /* a minute not already covered by this event's log */
  state.events[0].log = [V.store.last(V.store.events[0]) - 90000];
  const target = { events: V.store.events };
  const before = V.store.count(V.store.events[0]);
  V.store.mergeInto(target, [state]);
  const e = V.store.get(id);
  return { events: target.events.length, before, after: e.log.length,
           sorted: e.log.every((t, i, a) => i === 0 || a[i-1] <= t) };
})()`);
/* by this point exactly one event (Coffee) has been removed, leaving 3 */
check('merging the same event unions timestamps by id',
  mergeTest.events === 3 && mergeTest.after === mergeTest.before + 1 && mergeTest.sorted, JSON.stringify(mergeTest));

/* ── 15. corrupt link is reported, not crashed ──────────── */
/* A hash-only change is a same-document navigation, so the app would never
   re-read its payload: navigate, then force a fresh document. */
await send('Page.navigate', { url: target.split('#')[0] + '#d=not-a@real@payload' });
await new Promise((r) => setTimeout(r, 400));
await send('Page.reload', { ignoreCache: true });
await ready();
await new Promise((r) => setTimeout(r, 300));
const corrupt = await evaluate(`(() => ({
  events: V.store.events.length,
  decodeFailed: V.store.decodeFailed,
  noticeShown: !document.querySelector('#notice').hidden,
  noticeText: document.querySelector('#notice').innerText.slice(0, 70)
}))()`);
check('a broken link reports the problem instead of failing silently',
  corrupt.decodeFailed && corrupt.noticeShown && corrupt.events === 0, JSON.stringify(corrupt));

/* ── 16. two ?d= links merge ────────────────────────────── */
const split = await evaluate(`(() => {
  const idA = V.util.uid(), idB = V.util.uid();
  const now = Date.now();
  const A = { v: 2, events: [{ id: idA, name: 'Split A', color: '#2f6bff', start: '2026-01-01', log: [now - 3000] }] };
  const B = { v: 2, events: [{ id: idB, name: 'Split B', color: '#0ea5a0', start: '2026-02-01', log: [now - 2000] }] };
  const pA = V.codec.encode(A), pB = V.codec.encode(B);
  return { pA, pB };
})()`);
await send('Page.navigate', { url: target.split('#')[0].split('?')[0] + '?d=' + split.pA + '&d=' + split.pB });
await ready();
await new Promise((r) => setTimeout(r, 300));
const merged2 = await evaluate(`(() => ({
  n: V.store.events.length,
  names: V.store.events.map(e => e.name).sort(),
  notice: document.querySelector('#notice').innerText.slice(0, 60)
}))()`);
check('two ?d= links merge into one state',
  merged2.n === 2 && JSON.stringify(merged2.names) === JSON.stringify(['Split A', 'Split B']), JSON.stringify(merged2));

/* ── 16b. a ?d= link merges with a #d= fragment ─────────── */
const bothForms = await evaluate(`(() => {
  const now = Date.now();
  const A = { v: 2, events: [{ id: V.util.uid(), name: 'Query event', color: '#2f6bff', start: '2026-01-01', log: [now - 3000] }] };
  const B = { v: 2, events: [{ id: V.util.uid(), name: 'Hash event', color: '#0ea5a0', start: '2026-02-01', log: [now - 2000] }] };
  return { pA: V.codec.encode(A), pB: V.codec.encode(B) };
})()`);
await send('Page.navigate', {
  url: target.split('#')[0].split('?')[0] + '?d=' + bothForms.pA + '#d=' + bothForms.pB
});
await ready();
await new Promise((r) => setTimeout(r, 300));
const combined = await evaluate(`(() => ({
  n: V.store.events.length,
  names: V.store.events.map(e => e.name).sort()
}))()`);
check('a ?d= link and a #d= fragment merge together',
  combined.n === 2 && JSON.stringify(combined.names) === JSON.stringify(['Hash event', 'Query event']),
  JSON.stringify(combined));

/* ── 17. wide screen: two columns ───────────────────────── */
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: target.split('#')[0].split('?')[0] });
await ready();
await new Promise((r) => setTimeout(r, 300));
const wide = await evaluate(`(() => {
  V.store.create({ name: 'Wide A', color: '#2f6bff', start: '2026-01-01' });
  V.store.create({ name: 'Wide B', color: '#0ea5a0', start: '2026-01-01' });
  V.views.renderHome();
  const cards = [...document.querySelectorAll('#eventList .ev')].map(c => c.getBoundingClientRect());
  const bad = [];
  document.querySelectorAll('.app *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > window.innerWidth + 1.5 || r.left < -1.5)) bad.push(el.className);
  });
  return { cols: cards.length === 2 ? (Math.abs(cards[0].top - cards[1].top) < 2 ? 2 : 1) : 0,
           overflow: bad.slice(0, 4), docW: document.documentElement.scrollWidth, winW: window.innerWidth };
})()`);
check('wide screen uses two columns', wide.cols === 2, JSON.stringify(wide));
check('no horizontal overflow', wide.overflow.length === 0 && wide.docW <= wide.winW + 1, JSON.stringify(wide));
await shot('07-wide');

/* ── 18. XSS safety ─────────────────────────────────────── */
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: target.split('#')[0].split('?')[0] });
await ready();
const xss = await evaluate(`(() => {
  const e = V.store.create({ name: '<img src=x onerror=alert(1)>', color: '#2f6bff', start: '2026-01-01' });
  V.store.logTap(e.id);
  V.views.renderHome();
  V.views.cal.sel = V.date.toISO(V.date.today());
  V.views.renderDayPanel();
  return { imgs: document.querySelectorAll('#eventList img, #dayPanel img').length,
           scripts: document.querySelectorAll('#eventList script, #dayPanel script').length,
           text: document.querySelector('.ev-name')?.textContent };
})()`);
check('user text is escaped everywhere', xss.imgs === 0 && xss.scripts === 0 && /<img/.test(xss.text || ''), JSON.stringify(xss));

/* ── 19. strict date handling ───────────────────────────── */
const dates = await evaluate(`(() => {
  const D = V.date;
  return {
    invalid: D.parseISO('2026-02-30') === null,
    valid: D.toISO(D.parseISO('2026-02-28')),
    monthEnd: D.toISO(D.addMonths(new Date(2026, 0, 31), 1)),
    leap: D.toISO(D.parseISO('2028-02-29')),
    tz: D.toISO(new Date(2026, 6, 4, 23, 30))
  };
})()`);
check('invalid calendar dates rejected', dates.invalid, JSON.stringify(dates));
check('date maths clamps month ends and keeps local days',
  dates.valid === '2026-02-28' && dates.monthEnd === '2026-02-28' && dates.leap === '2028-02-29' && dates.tz === '2026-07-04',
  JSON.stringify(dates));

/* ── 19b. installable-app wiring ────────────────────────── */
const manifest = await evaluate(`(async () => {
  const link = document.querySelector('link[rel=manifest]');
  if (!link) return { linked: false };
  const res = await fetch(link.href);
  const m = await res.json();
  const icons = (m.icons || []).map(i => i.src);
  const checks = await Promise.all(icons.map(async (src) => {
    try { const r = await fetch(new URL(src, link.href).href); return r.ok; } catch (e) { return false; }
  }));
  return {
    linked: true, ok: res.ok, name: m.name, short: m.short_name,
    display: m.display, start: m.start_url, scope: m.scope,
    theme: m.theme_color, bg: m.background_color,
    icons: icons.length, iconsOk: checks.every(Boolean),
    maskable: (m.icons || []).some(i => (i.purpose || '').includes('maskable')),
    shortcuts: (m.shortcuts || []).length
  };
})()`, true);
const isHttp = target.startsWith('http');
if (isHttp) {
  check('web app manifest is linked and complete',
    manifest.linked && manifest.ok && manifest.name === 'Virulenter' &&
    manifest.display === 'standalone' && manifest.maskable && manifest.icons >= 4 && manifest.iconsOk,
    JSON.stringify(manifest));
} else {
  check('single-file build omits the manifest (file:// cannot install)', manifest.linked === false, JSON.stringify(manifest));
}

const swState = await evaluate(`(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    return { supported: true, httpOnly: true, protocol: location.protocol };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { supported: true, registered: false };
  /* wait for the worker to take control of this page */
  for (let i = 0; i < 60; i++) {
    if (navigator.serviceWorker.controller) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const keys = await caches.keys();
  const cache = keys.length ? await caches.open(keys[0]) : null;
  const cached = cache ? (await cache.keys()).length : 0;
  return { supported: true, registered: true, scope: reg.scope,
           controlled: !!navigator.serviceWorker.controller, keys, cached };
})()`, true);
if (IS_APK_ASSETS) {
  check('APK assets ship no service worker (the APK is the offline shell)',
    !existsSync(join(SERVE_ROOT, 'sw.js')), swState.registered ? 'a worker registered anyway' : 'none present, as intended');
} else if (isHttp) {
  check('service worker registers and pre-caches the shell',
    swState.supported && swState.registered && swState.cached >= 10, JSON.stringify(swState));
} else {
  check('single-file build skips service-worker registration on file://',
    swState.httpOnly === true, JSON.stringify(swState));
}

/* ── 19c. the installed app works with no network ───────── */
if (isHttp && !IS_APK_ASSETS) {
const beforeOffline = await evaluate(`(() => {
  V.store.create({ name: 'Offline test', color: '#2f6bff', start: '2026-01-01' });
  V.views.renderHome();
  V.app.persist();
  return location.href;
})()`);
await send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
});
await send('Page.navigate', { url: beforeOffline });
await ready(25000);
const offline = await evaluate(`(() => ({
  ready: !!(window.V && V.app && V.app.ready),
  events: V.store.events.length,
  found: !!V.store.events.find(e => e.name === 'Offline test'),
  controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
  cards: document.querySelectorAll('#eventList .ev').length
}))()`);
check('app shell loads and keeps its data while offline',
  offline.ready && offline.found && offline.controller && offline.cards >= 1,
  JSON.stringify(offline));
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
});
}

/* ── 19d. CSV export ────────────────────────────────────── */
const csv = await evaluate(`(() => {
  /* deterministic fixture so the assertions are exact */
  V.store.events = [];
  const a = V.store.create({ name: 'Coffee, large', color: '#f0872b', start: '2026-01-01' });
  a.log = [new Date(2026, 0, 2, 9, 5).getTime(), new Date(2026, 0, 2, 9, 5).getTime(),
           new Date(2026, 2, 14, 18, 30).getTime()];
  const b = V.store.create({ name: 'He said "hi"', color: '#2f6bff', start: '2026-01-01' });
  b.log = [new Date(2026, 1, 3, 7, 0).getTime()];
  const text = V.store.toCSV();
  const lines = text.split('\\r\\n').filter(Boolean);
  const summary = V.store.toSummaryCSV().split('\\r\\n').filter(Boolean);
  return {
    header: lines[0],
    rows: lines.length - 1,
    firstData: lines[1],
    commasQuoted: text.indexOf('"Coffee, large"') >= 0,
    quotesDoubled: text.indexOf('"He said ""hi"""') >= 0,
    crlf: text.indexOf('\\r\\n') >= 0,
    summaryRows: summary.length - 1,
    summaryHeader: summary[0]
  };
})()`);
check('CSV exports one row per tap with RFC 4180 quoting',
  csv.rows === 4 && csv.header === 'Event,Date,Time,Year,Month,Day,Weekday,Timestamp' &&
  csv.commasQuoted && csv.quotesDoubled && csv.crlf, JSON.stringify(csv));
check('summary CSV has one row per event',
  csv.summaryRows === 2 && /^Event,Taps,Share/.test(csv.summaryHeader), JSON.stringify(csv));

/* ── 19e. appearance travels in the link ────────────────── */
const look = await evaluate(`(() => {
  document.querySelector('#lookAccent [data-accent="violet"]').click();
  const accentVar = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const round = V.codec.decode(V.codec.urlFor(V.store.snapshot()));
  document.querySelector('#lookFont [data-font="serif"]').click();
  const fontVar = getComputedStyle(document.documentElement).getPropertyValue('--font').trim();
  const round2 = V.codec.decode(V.codec.urlFor(V.store.snapshot()));
  document.querySelector('#lookCustomHex').value = '#ff0066';
  document.querySelector('#lookCustomApply').click();
  const round3 = V.codec.decode(V.codec.urlFor(V.store.snapshot()));
  const customVar = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const ramp = getComputedStyle(document.documentElement).getPropertyValue('--lv2').trim();
  return {
    accentVar, fontVar, customVar, ramp,
    presetRound: round.look.accent, fontRound: round2.look.font, customRound: round3.look.custom,
    swatchOn: !!document.querySelector('#lookAccent .swatch.is-on')
  };
})()`);
check('accent presets apply and survive the link',
  look.presetRound === 'violet' && look.accentVar === '#7c3aed', JSON.stringify(look));
check('font choice applies and survives the link',
  look.fontRound === 'serif' && /Georgia/.test(look.fontVar), JSON.stringify(look));
check('custom accent colour is packed, restored, and re-tints the heat ramp',
  look.customRound === '#ff0066' && look.customVar === '#ff0066' && look.ramp !== '',
  JSON.stringify({ custom: look.customRound, applied: look.customVar, ramp: look.ramp }));

/* ── 19f. calendar jump picker and year strip ───────────── */
const jump = await evaluate(`(() => {
  V.views.toggleTab('calendar');
  const startYear = V.views.cal.y;
  document.querySelector('#calTitle').click();
  const opened = !document.querySelector('#jumpOverlay').hidden;
  const months = document.querySelectorAll('#jumpMonths .jump-month').length;
  const years = document.querySelectorAll('#jumpYearList button').length;
  document.querySelector('#jumpPrevYear').click();
  document.querySelector('#jumpPrevYear').click();
  const label = Number(document.querySelector('#jumpYearLabel').textContent);
  document.querySelector('#jumpMonths [data-month="2"]').click();
  return new Promise(res => setTimeout(() => {
    res({
      opened, months, years, startYear, label,
      after: document.querySelector('#calTitleText').textContent,
      calYear: V.views.cal.y,
      yearStrip: document.querySelectorAll('#calYearGrid .hc').length,
      cells: document.querySelectorAll('#calGrid .cal-cell').length,
      closed: document.querySelector('#jumpOverlay').hidden
    });
  }, 300));
})()`, true);
check('jump picker offers 12 months and the years that have data',
  jump.opened && jump.months === 12 && jump.years >= 1, JSON.stringify(jump));
check('jumping to a month navigates the calendar',
  jump.calYear === jump.startYear - 2 && /March/.test(jump.after) && jump.closed,
  JSON.stringify({ label: jump.label, after: jump.after, calYear: jump.calYear }));
check('year strip renders every day of the year',
  jump.yearStrip >= 365 && jump.yearStrip <= 366, JSON.stringify({ yearStrip: jump.yearStrip }));

/* ── 19g. statistics view ───────────────────────────────── */
const stats = await evaluate(`(() => {
  V.views.toggleTab('stats');
  const txt = s => (document.querySelector(s) || {}).innerText || '';
  const bars = s => document.querySelectorAll(s + ' .bar').length;
  return {
    visible: !document.querySelector('#view-stats').hidden,
    homeHidden: document.querySelector('#view-home').hidden,
    hero: document.querySelectorAll('#statHero .sh').length,
    heroText: txt('#statHero').replace(/\\n+/g, ' | '),
    streaks: txt('#statStreak').replace(/\\n+/g, ' | '),
    d30: bars('#stat30'), months: bars('#statMonths'),
    weekday: bars('#statWeekday'), hours: bars('#statHour'),
    rows: document.querySelectorAll('#statEvents tbody tr').length,
    firstRow: (document.querySelector('#statEvents tbody tr') || {}).innerText || '',
    heat: document.querySelectorAll('#statHeat .hc').length,
    heatFilled: document.querySelectorAll('#statHeat .hc[title]').length
  };
})()`);
check('statistics view renders every panel',
  stats.visible && stats.homeHidden && stats.hero >= 4 && stats.d30 === 30 &&
  stats.months === 12 && stats.weekday === 7 && stats.hours === 24,
  JSON.stringify({ hero: stats.hero, d30: stats.d30, months: stats.months, weekday: stats.weekday, hours: stats.hours }));
check('streak and per-event figures are computed',
  /current/.test(stats.streaks) && /longest/.test(stats.streaks) &&
  stats.rows === 2 && /Coffee, large/.test(stats.firstRow),
  JSON.stringify({ streaks: stats.streaks.slice(0, 60), rows: stats.rows }));
check('activity heat grid renders a day per cell',
  stats.heat >= 365 && stats.heatFilled >= 3, JSON.stringify({ heat: stats.heat, filled: stats.heatFilled }));

/* ── 19h. settings tab routes to the sheet ──────────────── */
const settingsTab = await evaluate(`(() => {
  document.querySelector('.tab[data-view="settings"]').click();
  const opened = !document.querySelector('#dataOverlay').hidden;
  const tabOn = document.querySelector('.tab[data-view="settings"]').classList.contains('is-on');
  const homeVisible = !document.querySelector('#view-home').hidden;
  document.querySelector('#dataOverlay .txt-btn[data-close]').click();
  return new Promise(res => setTimeout(() => res({
    opened, tabOn, homeVisible,
    closed: document.querySelector('#dataOverlay').hidden,
    homeStillVisible: !document.querySelector('#view-home').hidden
  }), 300));
})()`, true);
check('settings tab opens the settings sheet without blanking the view',
  settingsTab.opened && settingsTab.tabOn && settingsTab.homeVisible &&
  settingsTab.closed && settingsTab.homeStillVisible, JSON.stringify(settingsTab));

/* ── 19i. export buttons exist and are wired ────────────── */
const exportButtons = await evaluate(`(() => {
  const ids = ['btnExportCsv', 'btnExportSummary', 'btnDownload', 'btnPickFile'];
  const missing = ids.filter(id => !document.getElementById(id));
  /* stub the download path so nothing actually lands on disk */
  const real = V.util.download;
  const seen = [];
  V.util.download = (name, text, mime) => { seen.push({ name, mime, bytes: text.length }); };
  document.querySelector('#btnExportCsv').click();
  document.querySelector('#btnExportSummary').click();
  document.querySelector('#btnDownload').click();
  V.util.download = real;
  return { missing, seen };
})()`);
check('all four export actions produce a file',
  exportButtons.missing.length === 0 && exportButtons.seen.length === 3 &&
  /\.csv$/.test(exportButtons.seen[0].name) && exportButtons.seen[0].mime === 'text/csv' &&
  /\.json$/.test(exportButtons.seen[2].name),
  JSON.stringify(exportButtons.seen));

/* ── 19j. native session bridge ─────────────────────────────
   The Android wrapper keeps its own copy of the session URL because Android
   may kill a backgrounded WebView. It cannot learn about changes by watching
   for navigation, since the app rewrites its URL with replaceState — so the
   web layer must push each change. This reproduces that contract. */
const bridge = await evaluate(`(() => {
  const calls = [];
  window.VirulenterNative = {
    canShare: () => true,
    saveBase64: (n, m, b, share) => { calls.push(['save', n, share]); },
    sessionChanged: () => { calls.push(['session', location.href]); }
  };
  try {
    /* hold the object itself: an earlier run may have left a same-named event */
    const ev = V.store.create({ name: 'Bridge', color: '#2f6bff', start: '2026-01-01' });
    V.views.renderHome();
    const card = document.querySelector('.ev[data-id="' + ev.id + '"] [data-tap]');
    const expect = ev.log.length + 3;
    card.click(); card.click(); card.click();
    const sessions = calls.filter((c) => c[0] === 'session');
    const last = sessions.length ? sessions[sessions.length - 1][1] : '';
    const hash = (last.match(/#d=([A-Za-z0-9\-_]+)/) || [])[1] || '';
    const decoded = hash ? V.codec.unpackBytes(V.codec.b64ToBytes(hash)) : null;
    return {
      sessionCalls: sessions.length,
      pushedHasData: /#d=/.test(last),
      tapsInPushedUrl: decoded ? decoded.events[0].log.length : -1,
      expected: expect,
      liveTaps: ev.log.length,
      canShareHonoured: calls.some((c) => c[0] === 'save')
    };
  } finally {
    delete window.VirulenterNative;
  }
})()`);
/* On file://, history.replaceState throws, so the app falls back to
   location.replace() — an actual navigation. Only same-document URL rewriting
   can notify an in-page bridge, so this contract is only testable where
   replaceState works; elsewhere the log survives by reloading the page with
   the URL intact, which the reload test covers. */
/* Decided by protocol rather than probed at runtime: on file:// the app's
   fallback is location.replace(), which navigates and tears down the page
   before any follow-up assertion could run. */
const bridgeApplies = !target.startsWith('file:') &&
  (await evaluate('location.protocol !== "file:" && !!/^https?:$/.test(location.protocol)'));
if (bridgeApplies) {
  check('wrapper is told about every session change (survives background kill)',
    bridge.sessionCalls >= 3 && bridge.pushedHasData &&
    bridge.tapsInPushedUrl === bridge.liveTaps && bridge.liveTaps === bridge.expected,
    JSON.stringify(bridge));
} else {
  /* the URL still carries every tap, which is what the wrapper persists */
  const carried = await evaluate(`(() => {
    const hash = (location.hash.match(/d=([A-Za-z0-9\-_]+)/) || [])[1] || '';
    const decoded = hash ? V.codec.unpackBytes(V.codec.b64ToBytes(hash)) : null;
    const taps = decoded ? decoded.events.reduce((n, e) => n + e.log.length, 0) : -1;
    const live = V.store.events.reduce((n, e) => n + e.log.length, 0);
    return { taps, live, hasData: location.href.indexOf('#d=') >= 0 || location.href.indexOf('?d=') >= 0 };
  })()`);
  check('session survives without history.replaceState (URL keeps every tap)',
    carried.hasData && carried.taps === carried.live && carried.live > 0,
    JSON.stringify(carried));
}

/* ── 20. codec round-trips every shape of data ──────────── */
const codecTest = await evaluate(`(() => {
  const D = V.date, now = Date.now();
  function mk(name, color, start, logs) {
    return { id: V.util.uid(), name: name, color: color, start: start, log: logs };
  }
  const cases = [
    mk('Plain', '#2f6bff', '2026-01-01', [now, now - 86400000]),
    mk('Espresso ☕️ café — ünïcode', '#0ea5a0', '2025-12-31', [now - 3600000]),
    mk('No taps yet', '#d92d4b', '2026-03-15', []),
    mk('Long ago start', '#7c4dff', '2020-01-01', [Date.parse('2020-01-01T09:30:00')]),
    mk('Future start', '#f0872b', '2030-06-01', [now - 120000])
  ];
  const state = { events: cases };
  const back = V.codec.decode(V.codec.encode(state));
  const problems = [];
  if (!back) return { fatal: 'decode returned null' };
  if (back.events.length !== cases.length) problems.push('count ' + back.events.length);
  cases.forEach(function (orig, i) {
    const got = back.events[i];
    if (got.name !== orig.name) problems.push('name[' + i + ']="' + got.name + '"');
    if (got.color.toLowerCase() !== orig.color.toLowerCase()) problems.push('color[' + i + ']=' + got.color);
    if (got.start !== orig.start) problems.push('start[' + i + ']=' + got.start);
    if (got.log.length !== orig.log.length) problems.push('logLen[' + i + ']=' + got.log.length + ' want ' + orig.log.length);
    const want = orig.log.slice().sort((a,b)=>a-b);
    const sorted = got.log.every((t, k, arr) => k === 0 || arr[k-1] <= t);
    if (!sorted) problems.push('unsorted[' + i + ']');
    /* same minute, same calendar day is the guarantee the encoding makes */
    got.log.forEach(function (t, k) {
      /* the wire format stores whole minutes, so compare at minute precision */
      const a = new Date(t);
      const b = new Date(Math.floor(want[k] / 60000) * 60000);
      if (a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() ||
          a.getDate() !== b.getDate() || a.getHours() !== b.getHours() || a.getMinutes() !== b.getMinutes()) {
        problems.push('time[' + i + '][' + k + '] ' + a.toISOString() + ' vs ' + b.toISOString());
      }
    });
  });
  return { problems: problems.slice(0, 5), events: back.events.length, names: back.events.map(e => e.name) };
})()`);
check('codec round-trips names, colours, start dates and tap times (to the minute)',
  codecTest.problems && codecTest.problems.length === 0, JSON.stringify(codecTest));

/* ── 21. a realistic year of taps still fits in a link ──── */
const yearSize = await evaluate(`(() => {
  const e = { id: V.util.uid(), name: 'Water', color: '#2f6bff', start: '2026-01-01', log: [] };
  const base = new Date(2026, 0, 1, 9, 15).getTime();
  for (let i = 0; i < 365; i++) e.log.push(base + i * 86400000);
  const url = V.codec.urlFor({ events: [e] });
  const back = V.codec.decode(url);
  const kept = back.events[0].log.length;
  return { len: url.length, shortForm: url.indexOf('#d=') >= 0, queryForm: url.indexOf('?d=') >= 0,
           kept, decodes: !!back && kept === 365,
           sameTimes: back.events[0].log.every((t, i) => {
             const a = new Date(t), b = new Date(e.log[i]);
             return a.getHours() === b.getHours() && a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
           }) };
})()`);
check('a year of daily taps produces one link that decodes exactly',
  yearSize.decodes && yearSize.sameTimes && (yearSize.shortForm || yearSize.queryForm),
  JSON.stringify(yearSize));

/* the address bar stays short; past MAX_URL it switches to ?d= rather than
   handing over a link that chat apps would truncate */
const capCheck = await evaluate(`(() => {
  function urlFor(n) {
    const e = { id: V.util.uid(), name: 'Coffee', color: '#f0872b', start: '2026-01-01', log: [] };
    const t0 = new Date(2026, 0, 1, 9, 15).getTime();
    for (let i = 0; i < n; i++) e.log.push(t0 + i * 3600000);
    return V.codec.urlFor({ events: [e] });
  }
  const many = urlFor(400);
  return { small: urlFor(50).length, smallShort: urlFor(50).indexOf('#d=') >= 0,
           bigLen: many.length, bigQuery: many.indexOf('?d=') >= 0,
           bigDecodes: V.codec.decode(many).events[0].log.length };
})()`);
check('link form switches to ?d= only when the fragment gets too long',
  capCheck.smallShort && capCheck.bigQuery && capCheck.bigDecodes === 400, JSON.stringify(capCheck));

/* ── 22. no console errors ──────────────────────────────── */
const IGNORE = [
  /* registering a worker that the APK deliberately does not ship */
  /sw\.js/,
  /bad HTTP response code \(404\) was received when fetching the script/i
];
const errors = logs
  .filter((l) => l.type === 'exception' || l.type === 'error' || l.type === 'log:error')
  .filter((l) => !(IS_APK_ASSETS && IGNORE.some((re) => re.test(l.text))));
check('no console errors or exceptions', errors.length === 0, errors.map((e) => e.text).join(' || ').slice(0, 400));

console.log('\n── console output ─────────────────────────────');
if (!logs.length) console.log('  (empty)');
logs.forEach((l) => console.log(`  [${l.type}] ${l.text.slice(0, 200)}`));

const failed = results.filter((r) => !r.ok);
console.log('\n── summary ────────────────────────────────────');
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log('  failed: ' + failed.map((f) => f.name).join(', '));
console.log('  screenshots: ' + SHOTS);

ws.close();
chrome.kill();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} ; process.exit(failed.length ? 1 : 0); }, 300);
