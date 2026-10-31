/* ============================================================
   Virulenter · store.js
   In-memory state. Nothing is persisted to browser storage —
   persistence is the URL (see codec.js).
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, Codec = V.codec;

  function defaultLook() {
    return { accent: V.DEFAULTS.accent, font: V.DEFAULTS.font, custom: null, theme: V.DEFAULTS.theme };
  }

  var Store = V.store = {
    events: [],
    look: defaultLook(),
    dirty: false,          // true once the user has changed something
    sort: 'recent',        // recent | name | count | oldest
    query: '',
    urlOk: true,           // false when the link got too long to keep in sync

    /* ── load ───────────────────────────────────────────── */
    load: function () {
      var hashPayload = Codec.payloadFromHash();
      var queryPayloads = Codec.payloadsFromQuery();
      var failed = false;

      function decodeOne(payload) {
        try { return Codec.unpackBytes(Codec.b64ToBytes(payload)); } catch (e) { return null; }
      }

      /* Collect every payload on the URL: repeated ?d= parameters and a #d=
         fragment all merge together, so a shared link can be combined with a
         bookmarked one instead of one silently shadowing the other. */
      var payloads = queryPayloads.slice();
      if (hashPayload && payloads.indexOf(hashPayload) < 0) payloads.push(hashPayload);

      var parts = [];
      payloads.forEach(function (p) {
        var one = decodeOne(p);
        if (one) parts.push(one);
        else failed = true;
      });

      var loaded = parts.length ? parts[0] : null;
      var merged = 0;
      if (parts.length > 1) {
        Store.mergeInto(loaded, parts.slice(1));
        merged = payloads.length;
      }

      Store.events = loaded ? loaded.events : [];
      Store.look = (loaded && loaded.look) || defaultLook();
      Store.mergeNotice = merged;
      Store.decodeFailed = failed && !loaded;
      /* some payloads read and some did not: say so rather than quietly
         showing a partial log */
      Store.partialFailure = failed && !!loaded;
      return Store.events;
    },

    /* combine additional link payloads into the primary state, by event id */
    mergeInto: function (target, others) {
      var byId = {};
      target.events.forEach(function (e) { byId[e.id] = e; });
      others.forEach(function (other) {
        other.events.forEach(function (incoming) {
          var cur = byId[incoming.id];
          if (!cur) {
            target.events.push(incoming);
            byId[incoming.id] = incoming;
            return;
          }
          /* same event: union of the taps, compared to the minute — the
             precision a link stores — and as a multiset, so two real taps
             in one minute survive while a tap seen on both sides is kept
             once. (Comparing exact milliseconds duplicated every tap of a
             session when its backup was merged back after a reload.) */
          var have = {}, seen = {};
          cur.log.forEach(function (t) { var k = Math.floor(t / 60000); have[k] = (have[k] || 0) + 1; });
          incoming.log.forEach(function (t) {
            var k = Math.floor(t / 60000);
            seen[k] = (seen[k] || 0) + 1;
            if (seen[k] > (have[k] || 0)) cur.log.push(t);
          });
          cur.log.sort(function (a, b) { return a - b; });
          if (!cur.name && incoming.name) cur.name = incoming.name;
        });
        /* the first payload's appearance wins; later ones only fill the
           settings it left at their defaults. Always a fresh object, so the
           caller decides whether to adopt it. */
        if (other.look && target.look) {
          var t = target.look, o = other.look;
          var look = { accent: t.accent, font: t.font, custom: t.custom || null, theme: t.theme || V.DEFAULTS.theme };
          if (!t.custom && t.accent === V.DEFAULTS.accent) {
            look.accent = o.accent || look.accent;
            look.custom = o.custom || null;
          }
          if (t.font === V.DEFAULTS.font && o.font) look.font = o.font;
          if (look.theme === V.DEFAULTS.theme && o.theme) look.theme = o.theme;
          target.look = look;
        }
      });
      return target;
    },

    snapshot: function () {
      return { v: V.FORMAT, events: Store.events, look: Store.look };
    },

    serialize: function () {
      return JSON.stringify({
        app: V.APP_NAME,
        v: V.FORMAT,
        exportedAt: new Date().toISOString(),
        look: Store.look,
        events: Store.events
      }, null, 2);
    },

    importJSON: function (text, mode) {
      try { JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not valid JSON.' }; }
      /* keeps the original ids, so repeated merge-imports stay idempotent */
      var state = Codec.decodeJSON(text);
      if (!state) return { ok: false, error: 'No events found in that data.' };
      Store.apply(state, mode);
      return { ok: true, count: state.events.length };
    },

    /* adopt a decoded state: replace everything, or merge by event id */
    apply: function (state, mode) {
      if (mode === 'replace') {
        Store.events = state.events;
        if (state.look && state.hasLook !== false) Store.look = state.look;
      } else {
        var target = { events: Store.events, look: Store.look };
        Store.mergeInto(target, [state]);
        Store.events = target.events;
        Store.look = target.look;
      }
      Store.dirty = true;
    },

    /* ── appearance ─────────────────────────────────────── */
    withLook: function (patch) {
      var cur = Store.look || defaultLook();
      var next = { accent: cur.accent, font: cur.font, custom: cur.custom || null, theme: cur.theme || V.DEFAULTS.theme };
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      Store.look = next;
      Store.dirty = true;
      return next;
    },

    setAccent: function (id) {
      if (!V.ACCENTS.some(function (a) { return a.id === id; })) return null;
      return Store.withLook({ accent: id, custom: null });
    },

    setCustomAccent: function (hex) {
      if (!Codec.hexToRgb(hex)) return null;
      return Store.withLook({ custom: Codec.rgbToHex(Codec.hexToRgb(hex)) });
    },

    setFont: function (id) {
      if (!V.FONTS.some(function (f) { return f.id === id; })) return null;
      return Store.withLook({ font: id });
    },

    setTheme: function (id) {
      if (V.THEMES.indexOf(id) < 0) return null;
      return Store.withLook({ theme: id });
    },

    resetLook: function () {
      Store.look = defaultLook();
      Store.dirty = true;
      return Store.look;
    },

    isDefaultLook: function (look) {
      look = look || Store.look;
      return look.accent === V.DEFAULTS.accent && look.font === V.DEFAULTS.font &&
             !look.custom && (look.theme || V.DEFAULTS.theme) === V.DEFAULTS.theme;
    },

    /* ── mutate ─────────────────────────────────────────── */
    get: function (id) {
      for (var i = 0; i < Store.events.length; i++) if (Store.events[i].id === id) return Store.events[i];
      return null;
    },

    /* a start date the link can actually carry (see V.MIN_START) */
    clampStart: function (iso) {
      var d = D.parseISO(iso) || D.today();
      var min = D.parseISO(V.MIN_START);
      return D.toISO(d < min ? min : d);
    },

    create: function (data) {
      var e = {
        id: U.uid(),
        name: String(data.name || 'Untitled').trim().slice(0, 48) || 'Untitled',
        color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : V.COLORS[0],
        start: Store.clampStart(data.start),
        log: []
      };
      Store.events.push(e);
      Store.dirty = true;
      return e;
    },

    update: function (id, data) {
      var e = Store.get(id);
      if (!e) return null;
      if (typeof data.name === 'string' && data.name.trim()) e.name = data.name.trim().slice(0, 48);
      if (/^#[0-9a-f]{6}$/i.test(data.color || '')) e.color = data.color;
      if (D.parseISO(data.start)) e.start = Store.clampStart(data.start);
      Store.dirty = true;
      return e;
    },

    remove: function (id) {
      var i = Store.events.findIndex(function (e) { return e.id === id; });
      if (i < 0) return false;
      Store.events.splice(i, 1);
      Store.dirty = true;
      return true;
    },

    /* the core action: +1 and a timestamped log entry */
    logTap: function (id, ts) {
      var e = Store.get(id);
      if (!e) return null;
      var t = ts || Date.now();
      e.log.push(t);
      e.log.sort(function (a, b) { return a - b; });
      Store.dirty = true;
      return t;
    },

    removeEntry: function (id, ts) {
      var e = Store.get(id);
      if (!e) return false;
      var i = e.log.indexOf(ts);
      if (i < 0) return false;
      e.log.splice(i, 1);
      Store.dirty = true;
      return true;
    },

    clearLog: function (id) {
      var e = Store.get(id);
      if (!e) return false;
      e.log = [];
      Store.dirty = true;
      return true;
    },

    /* ── derived ────────────────────────────────────────── */
    count: function (e) { return e.log.length; },

    last: function (e) { return e.log.length ? e.log[e.log.length - 1] : null; },

    first: function (e) { return e.log.length ? e.log[0] : null; },

    /* per-day totals across every event: { 'YYYY-MM-DD': n } */
    dayTotals: function () {
      var out = {};
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) {
          var k = D.dayKey(ts);
          out[k] = (out[k] || 0) + 1;
        });
      });
      return out;
    },

    dayTotalsFor: function (e) {
      var out = {};
      e.log.forEach(function (ts) {
        var k = D.dayKey(ts);
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    },

    entriesOnDay: function (iso) {
      var out = [];
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) {
          if (D.dayKey(ts) === iso) out.push({ event: e, ts: ts });
        });
      });
      out.sort(function (a, b) { return b.ts - a.ts; });
      return out;
    },

    /* taps per day since the event began — the start date, or the first tap
       if that came earlier, so a start moved later cannot inflate the rate */
    perDay: function (e) {
      if (!e.log.length) return 0;
      var start = D.parseISO(e.start);
      var first = D.fromTs(e.log[0]);
      var from = start && start < first ? start : first;
      var days = D.diffDays(from, D.today()) + 1;
      if (days < 1) days = 1;
      return e.log.length / days;
    },

    /* one event's taps on each of the last n days, oldest first */
    recentFor: function (e, n) {
      var totals = Store.dayTotalsFor(e);
      var out = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = D.addDays(D.today(), -i);
        var iso = D.toISO(d);
        out.push({ iso: iso, n: totals[iso] || 0 });
      }
      return out;
    },

    stats: function () {
      var total = 0, today = 0, thisWeek = 0, active = 0;
      var todayKey = D.toISO(D.today());
      var weekAgo = D.stripTime(D.addDays(D.today(), -6));
      Store.events.forEach(function (e) {
        total += e.log.length;
        if (e.log.length) active++;
        e.log.forEach(function (ts) {
          if (D.dayKey(ts) === todayKey) today++;
          if (D.stripTime(D.fromTs(ts)) >= weekAgo) thisWeek++;
        });
      });
      return { events: Store.events.length, total: total, today: today, week: thisWeek, active: active };
    },

    /* ── statistics ─────────────────────────────────────── */

    /* per-event summary rows, sorted by volume */
    perEvent: function () {
      var total = Store.stats().total;
      return Store.events.map(function (e) {
        var first = Store.first(e), last = Store.last(e);
        return {
          event: e,
          count: e.log.length,
          first: first,
          last: last,
          rate: Store.perDay(e),
          activeDays: Object.keys(Store.dayTotalsFor(e)).length,
          share: total ? e.log.length / total : 0
        };
      }).sort(function (a, b) { return b.count - a.count || a.event.name.localeCompare(b.event.name, 'en'); });
    },

    /* longest run of consecutive days with at least one tap, plus current
       run — for every event, or for the per-day totals passed in */
    streaks: function (dayTotals) {
      var totals = dayTotals || Store.dayTotals();
      var keys = Object.keys(totals).sort();
      if (!keys.length) return { longest: 0, longestEnd: null, current: 0, activeDays: 0 };

      var best = 1, bestEnd = keys[0], run = 1;
      for (var i = 1; i < keys.length; i++) {
        var prev = D.parseISO(keys[i - 1]);
        var cur = D.parseISO(keys[i]);
        if (prev && cur && D.diffDays(prev, cur) === 1) run++;
        else run = 1;
        if (run > best) { best = run; bestEnd = keys[i]; }
      }

      /* a run that reaches today or yesterday is still alive */
      var todayKey = D.toISO(D.today());
      var yesterdayKey = D.toISO(D.addDays(D.today(), -1));
      var current = 0;
      if (totals[todayKey] || totals[yesterdayKey]) {
        var cursor = totals[todayKey] ? D.today() : D.addDays(D.today(), -1);
        while (totals[D.toISO(cursor)]) {
          current++;
          cursor = D.addDays(cursor, -1);
        }
      }
      return { longest: best, longestEnd: bestEnd, current: current, activeDays: keys.length };
    },

    /* taps grouped by weekday, Monday first */
    byWeekday: function () {
      var out = [0, 0, 0, 0, 0, 0, 0];   // index 0 = Monday
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) {
          var d = new Date(ts).getDay();      // 0 = Sunday
          out[(d + 6) % 7]++;
        });
      });
      return out;
    },

    /* taps grouped by hour of day, 0..23 */
    byHour: function () {
      var out = new Array(24).fill(0);
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) { out[new Date(ts).getHours()]++; });
      });
      return out;
    },

    /* taps per month for a given year: [12] */
    byMonth: function (year) {
      var out = new Array(12).fill(0);
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) {
          var d = new Date(ts);
          if (d.getFullYear() === year) out[d.getMonth()]++;
        });
      });
      return out;
    },

    /* every year that has any tap */
    years: function () {
      var seen = {};
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) { seen[new Date(ts).getFullYear()] = true; });
      });
      var list = Object.keys(seen).map(Number).sort(function (a, b) { return b - a; });
      var thisYear = new Date().getFullYear();
      if (list.indexOf(thisYear) < 0) list.unshift(thisYear);
      return list;
    },

    /* the most recent n days, oldest first: [{ iso, weekday, n }] */
    lastDays: function (n) {
      var totals = Store.dayTotals();
      var out = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = D.addDays(D.today(), -i);
        var iso = D.toISO(d);
        out.push({ iso: iso, weekday: D.WEEKDAYS[d.getDay()], n: totals[iso] || 0 });
      }
      return out;
    },

    /* full date range covered by the data */
    range: function () {
      var min = null, max = null;
      Store.events.forEach(function (e) {
        var sd = D.parseISO(e.start);
        if (sd) {
          var t = D.stripTime(sd);
          if (min === null || t < min) min = t;
        }
        if (e.log.length) {
          var f = D.stripTime(D.fromTs(e.log[0]));
          var l = D.stripTime(D.fromTs(e.log[e.log.length - 1]));
          if (min === null || f < min) min = f;
          if (max === null || l > max) max = l;
        }
      });
      var today = D.stripTime(D.today());
      if (min === null) min = today;
      if (max === null) max = today;
      if (max < today) max = today;
      return { min: min, max: max };
    },

    /* ── list for the events view ───────────────────────── */
    list: function () {
      var q = Store.query.trim().toLowerCase();
      var rows = Store.events.slice();
      if (q) rows = rows.filter(function (e) { return e.name.toLowerCase().indexOf(q) >= 0; });
      var s = Store.sort;
      rows.sort(function (a, b) {
        if (s === 'name') return a.name.localeCompare(b.name, 'en');
        if (s === 'count') return b.log.length - a.log.length || a.name.localeCompare(b.name, 'en');
        if (s === 'oldest') {
          /* never-tapped events last; Infinity - Infinity would be NaN */
          var fa = Store.first(a), fb = Store.first(b);
          if (fa === null && fb === null) return a.name.localeCompare(b.name, 'en');
          if (fa === null) return 1;
          if (fb === null) return -1;
          return fa - fb;
        }
        var la = Store.last(a), lb = Store.last(b);
        if (la === null && lb === null) return 0;
        if (la === null) return 1;
        if (lb === null) return -1;
        return lb - la;
      });
      return rows;
    },

    /* ── export ─────────────────────────────────────────── */

    /* RFC 4180 quoting: wrap in quotes and double any embedded quote */
    csvCell: function (value) {
      var s = value == null ? '' : String(value);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    },

    csvRow: function (cells) {
      return cells.map(Store.csvCell).join(',');
    },

    /* one row per tap, oldest first — opens straight into Excel / Sheets */
    toCSV: function () {
      var rows = [Store.csvRow(['Event', 'Date', 'Time', 'Year', 'Month', 'Day', 'Weekday', 'Timestamp'])];
      var all = [];
      Store.events.forEach(function (e) {
        e.log.forEach(function (ts) { all.push({ e: e, ts: ts }); });
      });
      all.sort(function (a, b) { return a.ts - b.ts || a.e.name.localeCompare(b.e.name, 'en'); });
      all.forEach(function (row) {
        var d = new Date(row.ts);
        rows.push(Store.csvRow([
          row.e.name,
          D.toISO(d),
          D.fmtTime(row.ts),
          d.getFullYear(),
          d.getMonth() + 1,
          d.getDate(),
          D.WEEKDAYS_LONG[d.getDay()],
          Math.floor(row.ts / 1000)
        ]));
      });
      return rows.join('\r\n') + '\r\n';
    },

    /* per-event summary, for a spreadsheet overview */
    toSummaryCSV: function () {
      var rows = [Store.csvRow(['Event', 'Taps', 'Share', 'Average per day', 'Active days', 'First tap', 'Last tap', 'Start date'])];
      Store.perEvent().forEach(function (r) {
        rows.push(Store.csvRow([
          r.event.name,
          r.count,
          (r.share * 100).toFixed(1) + '%',
          r.rate.toFixed(3),
          r.activeDays,
          r.first ? D.toISO(new Date(r.first)) + ' ' + D.fmtTime(r.first) : '',
          r.last ? D.toISO(new Date(r.last)) + ' ' + D.fmtTime(r.last) : '',
          r.event.start
        ]));
      });
      return rows.join('\r\n') + '\r\n';
    },

    /* ── URL persistence ────────────────────────────────── */

    /* The address bar is the save file, so it keeps up with every change up
       to MAX_BAR. (It used to stop at MAX_URL — the share-friendly length —
       which silently dropped every tap after the ~280th on reload.) A link
       past MAX_URL is only discouraged for *sharing*; see the data sheet. */
    syncUrl: function () {
      var url;
      try { url = Codec.urlFor(Store.snapshot()); } catch (e) { return false; }
      if (url.length > Codec.MAX_BAR) { Store.urlOk = false; return false; }
      Store.urlOk = true;
      var ok = false;
      try {
        history.replaceState(null, '', url);
        ok = true;
      } catch (e) {
        try { location.replace(url); ok = true; } catch (e2) { ok = false; }
      }
      /* Tell the native wrapper the session moved.

         In a browser the URL *is* the saved state. Inside the Android app the
         URL lives in a WebView that Android may kill while the app sits in the
         background, so the wrapper keeps its own copy — and it cannot learn
         about the change by watching for navigation, because replaceState
         fires none. Without this call every tap made since the page loaded
         would be lost. */
      if (ok) {
        var bridge = (typeof window !== 'undefined') ? window.VirulenterNative : null;
        if (bridge && typeof bridge.sessionChanged === 'function') {
          try { bridge.sessionChanged(); } catch (e) { /* non-fatal */ }
        }
      }
      return ok;
    },

    clearUrl: function () {
      try { history.replaceState(null, '', Codec.baseUrl()); } catch (e) {}
    },

    urlLength: function () {
      try { return Codec.urlFor(Store.snapshot()).length; } catch (e) { return 0; }
    }
  };

})(window.V);
