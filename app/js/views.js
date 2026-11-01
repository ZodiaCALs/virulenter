/* ============================================================
   Virulenter · views.js — events list, calendar grid, day panel,
   tab routing.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store, UI = V.ui;

  /* attribute selector that survives any id (imported ids are free text) */
  function sel(attr, value) {
    var v = String(value);
    v = (window.CSS && CSS.escape) ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
    return '[' + attr + '="' + v + '"]';
  }

  var Views = V.views = {
    cal: { y: 0, m: 0, sel: null },
    dayTime: null,          // the time picked in the day panel, kept across re-renders
    dayExpanded: null,      // the day whose full tap list is showing
    scrollMem: {},
    dismissed: {},
    _els: {},
    sel: sel,

    init: function () {
      /* the tab highlight follows layout changes without animating */
      window.addEventListener('resize', function () {
        var g = U.qs('#tabGlide');
        if (g) g.classList.add('no-anim');
        Views.glide();
      });
      Views._els = {
        stats: U.qs('#statsRow'),
        toolbar: U.qs('#toolbar'),
        list: U.qs('#eventList'),
        empty: U.qs('#listEmpty'),
        search: U.qs('#searchInput'),
        searchClear: U.qs('#searchClear'),
        sortLabel: U.qs('#sortLabel'),
        brandSub: U.qs('#brandSub'),
        notice: U.qs('#notice'),
        calWeek: U.qs('#calWeek'),
        calGrid: U.qs('#calGrid'),
        calTitle: U.qs('#calTitle'),
        calTitleText: U.qs('#calTitleText'),
        calRange: U.qs('#calRange'),
        dayPanel: U.qs('#dayPanel')
      };

      Views._els.calWeek.innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        .map(function (d) { return '<span>' + d + '</span>'; }).join('');

      var t = D.today();
      Views.cal.y = t.getFullYear();
      Views.cal.m = t.getMonth();
      Views.cal.sel = D.toISO(t);

      return Views;
    },

    /* ══════════ events ══════════ */
    renderHome: function (opts) {
      opts = opts || {};
      Views.renderStats(S.stats());
      Views.renderNotice();

      var events = S.list();
      var hasAny = S.events.length > 0;
      Views._els.toolbar.hidden = !hasAny;

      var shown = UI.renderCards(Views._els.list, events, opts);
      Views._els.empty.hidden = shown || hasAny;
      if (!shown && hasAny) {
        /* events exist but the search filtered them all out */
        Views._els.list.innerHTML = '<div class="list-empty">' +
          '<svg class="ico" aria-hidden="true"><use href="#i-search"/></svg>' +
          '<span>No events match <b>“' + U.esc(S.query) + '”</b></span></div>';
      }
      Views.renderBrandSub();
    },

    renderBrandSub: function () {
      var stats = S.stats();
      Views._els.brandSub.textContent = stats.events
        ? stats.total + ' ' + UI.plural(stats.total, 'tap') + ' · ' + stats.events + ' ' + UI.plural(stats.events, 'event')
        : 'tap to count';
    },

    renderStats: function (stats, bump) {
      Views._els.stats.innerHTML = [
        cell(stats.today, 'today', 'hi'),
        cell(stats.week, 'last 7 days'),
        cell(stats.total, 'all time')
      ].join('');
      if (bump) U.qsa('b', Views._els.stats).forEach(function (b) { b.classList.add('bump'); });
      function cell(v, label, cls) {
        return '<div class="st' + (cls ? ' ' + cls : '') + '"><b>' + v + '</b><span>' + U.esc(label) + '</span></div>';
      }
    },

    /* Notices stay dismissed: each has a key, and dismissing it clears the
       condition (or remembers it) instead of the next render bringing it
       straight back. */
    renderNotice: function () {
      var box = Views._els.notice;
      var msgs = [];

      if (S.decodeFailed) {
        msgs.push({ key: 'decode', html: 'The data in this link could not be read, so the log is empty. Check that the whole link was copied, or paste it into <b>Settings → Paste data</b>.' });
      }
      if (S.partialFailure) {
        msgs.push({ key: 'partial', html: 'Part of this link could not be read; the rest loaded.' });
      }
      if (S.mergeNotice) {
        msgs.push({ key: 'merge', html: 'Merged data from ' + S.mergeNotice + ' links.' });
      }
      if (!S.urlOk && S.events.length) {
        msgs.push({ key: 'toolong', html: 'Your log has outgrown the address bar, so new taps are not saved in the link any more. Save a backup from <b>Settings → Export &amp; backup</b>.' });
      } else {
        delete Views.dismissed.toolong;
      }
      msgs = msgs.filter(function (m) { return !Views.dismissed[m.key]; });

      if (!msgs.length) { box.hidden = true; box.innerHTML = ''; box._keys = []; return; }
      box._keys = msgs.map(function (m) { return m.key; });
      box.hidden = false;
      box.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-alert"/></svg>' +
        '<span>' + msgs.map(function (m) { return m.html; }).join(' ') + '</span>' +
        '<button type="button" data-notice-close="1">Dismiss</button>';
    },

    dismissNotice: function () {
      var box = Views._els.notice;
      (box._keys || []).forEach(function (k) { Views.dismissed[k] = true; });
      S.decodeFailed = false;
      S.partialFailure = false;
      S.mergeNotice = 0;
      box.hidden = true;
    },

    /* ══════════ calendar ══════════ */
    renderCalendar: function (opts) {
      opts = opts || {};
      var y = Views.cal.y, m = Views.cal.m;
      var totals = S.dayTotals();
      var levels = Views.levels(totals);
      var grid = Views._els.calGrid;

      Views._els.calTitleText.textContent = D.fmtMonth(y, m);
      U.qs('#calPrevYearLabel').textContent = y - 1;
      U.qs('#calNextYearLabel').textContent = y + 1;

      var first = new Date(y, m, 1);
      var lead = (first.getDay() + 6) % 7;           // Monday-first
      var days = D.daysInMonth(y, m);
      var prevDays = D.daysInMonth(y, m - 1 < 0 ? 11 : m - 1);
      var todayISO = D.toISO(D.today());
      var cells = [];
      var i;

      for (i = lead - 1; i >= 0; i--) cells.push(cell(new Date(y, m - 1, prevDays - i), true));
      for (i = 1; i <= days; i++) cells.push(cell(new Date(y, m, i), false));
      var trail = (7 - ((lead + days) % 7)) % 7;
      for (i = 1; i <= trail; i++) cells.push(cell(new Date(y, m + 1, i), true));
      grid.innerHTML = cells.join('');

      grid.classList.remove('slide-next', 'slide-prev', 'fade');
      if (opts.dir || opts.fade) {
        void grid.offsetWidth;
        grid.classList.add(opts.dir > 0 ? 'slide-next' : opts.dir < 0 ? 'slide-prev' : 'fade');
      }

      var range = S.range();
      var monthStart = D.stripTime(new Date(y, m, 1));
      var monthEnd = D.stripTime(new Date(y, m, days));
      var outside = monthEnd < range.min || monthStart > range.max;
      Views._els.calRange.textContent = outside
        ? 'No data in this month'
        : (D.fmtDay(D.toISO(new Date(range.min))) + ' → ' + D.fmtDay(D.toISO(new Date(range.max))));

      /* the year at a glance: 12 month rows × 31 day columns, so a whole
         year fits the width of a phone and any day is one tap away */
      var yWrap = U.qs('#calYearWrap');
      if (Object.keys(totals).length) {
        yWrap.hidden = false;
        var active = Object.keys(totals).filter(function (k) { return k.slice(0, 4) === String(y); }).length;
        U.qs('#calYearLabel').textContent = y + ' at a glance';
        U.qs('#calYearSub').textContent = active + ' active ' + UI.plural(active, 'day');
        U.qs('#calYearGrid').innerHTML = V.stats.yearStripHTML(y, Views.cal.sel);
      } else {
        yWrap.hidden = true;
      }

      Views.renderDayPanel();
      Views.stale.calendar = false;

      function cell(date, out) {
        var iso = D.toISO(date);
        var n = totals[iso] || 0;
        var cls = ['cal-cell'];
        if (out) cls.push('out');
        if (n) cls.push('v' + Views.levelOf(n, levels));
        else if (iso > todayISO) cls.push('future');
        if (iso === todayISO) cls.push('today');
        if (iso === Views.cal.sel) cls.push('sel');
        return '<button class="' + cls.join(' ') + '" type="button" data-date="' + iso + '" ' +
          (iso === Views.cal.sel ? 'aria-pressed="true" ' : '') +
          'aria-label="' + U.esc(D.fmtDayLong(iso)) + (n ? ', ' + n + ' ' + UI.plural(n, 'tap') : ', no taps') + '">' +
          '<span class="cal-d">' + date.getDate() + '</span>' +
          (n ? '<span class="cal-n">' + n + '</span>' : '') +
          '</button>';
      }
    },

    /* Intensity scale derived from the data itself, so it stays useful
       whether someone taps 3 times a week or 40 times a day. Small counts
       read directly (1 tap = level 1 … 4+ = level 4); larger ones split at
       quantiles of the active days. All four levels are reachable — the
       lightest one used to be skipped entirely. */
    levels: function (totals) {
      var vals = [];
      for (var k in totals) {
        if (Object.prototype.hasOwnProperty.call(totals, k) && totals[k] > 0) vals.push(totals[k]);
      }
      vals.sort(function (a, b) { return a - b; });
      if (!vals.length) return { t2: 2, t3: 3, t4: 4, max: 0 };
      var max = vals[vals.length - 1];
      if (max <= 4) return { t2: 2, t3: 3, t4: 4, max: max };
      var p = function (q) { return vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]; };
      var t2 = Math.max(2, p(0.35));
      var t3 = Math.max(t2 + 1, p(0.65));
      var t4 = Math.max(t3 + 1, p(0.9));
      return { t2: t2, t3: t3, t4: Math.min(t4, max), max: max };
    },

    levelOf: function (n, levels) {
      if (!n) return 0;
      if (n >= levels.t4) return 4;
      if (n >= levels.t3) return 3;
      if (n >= levels.t2) return 2;
      return 1;
    },

    renderDayPanel: function () {
      Views._els.dayPanel.innerHTML = UI.dayPanelHTML(Views.cal.sel, Views.dayTime, Views.dayExpanded === Views.cal.sel);
    },

    expandDay: function () {
      Views.dayExpanded = Views.cal.sel;
      Views.renderDayPanel();
    },

    setSelectedDay: function (iso) {
      Views.cal.sel = iso;
      Views.renderCalendar();
    },

    shiftMonth: function (delta) {
      var d = new Date(Views.cal.y, Views.cal.m + delta, 1);
      Views.cal.y = d.getFullYear();
      Views.cal.m = d.getMonth();
      Views.renderCalendar({ dir: delta });
    },

    shiftYear: function (delta) {
      Views.cal.y += delta;
      /* clamp the day so 29 Feb does not roll into March */
      var maxDay = D.daysInMonth(Views.cal.y, Views.cal.m);
      var cur = D.parseISO(Views.cal.sel);
      if (cur && cur.getDate() > maxDay) {
        Views.cal.sel = D.toISO(new Date(Views.cal.y, Views.cal.m, maxDay));
      }
      Views.renderCalendar({ dir: delta });
    },

    goTo: function (y, m, dayISO) {
      var dir = (y * 12 + m) - (Views.cal.y * 12 + Views.cal.m);
      Views.cal.y = y;
      Views.cal.m = m;
      if (dayISO) Views.cal.sel = dayISO;
      Views.renderCalendar({ dir: dir > 0 ? 1 : dir < 0 ? -1 : 0 });
    },

    goToday: function () {
      var t = D.today();
      Views.goTo(t.getFullYear(), t.getMonth(), D.toISO(t));
    },

    /* the relative "Last: 3 mins ago" lines, refreshed by the app clock */
    refreshLastLines: function () {
      S.events.forEach(function (e) {
        var node = U.qs(sel('data-last', e.id));
        if (node) node.innerHTML = UI.lastLine(S.last(e));
        var count = U.qs(sel('data-count', e.id));
        if (count) count.textContent = S.count(e);
      });
    },

    /* in-place update after a tap: no re-render, so the list does not
       reorder under the finger and the button keeps focus */
    updateCard: function (e) {
      var n = S.count(e);
      var countNode = U.qs(sel('data-count', e.id));
      if (countNode) {
        countNode.textContent = n;
        countNode.classList.remove('bump');
        void countNode.offsetWidth;
        countNode.classList.add('bump');
        var unit = countNode.parentElement && countNode.parentElement.querySelector('span');
        if (unit) unit.textContent = UI.plural(n, 'tap', 'taps');
      }
      var last = U.qs(sel('data-last', e.id));
      if (last) last.innerHTML = UI.lastLine(S.last(e));
      var spark = U.qs(sel('data-spark', e.id));
      if (spark) spark.innerHTML = UI.sparkHTML(e);
      var facts = U.qs(sel('data-facts', e.id));
      if (facts) facts.innerHTML = UI.factsHTML(e);
    },

    renderSort: function (animate) {
      var names = { recent: 'Recent', name: 'A–Z', count: 'Most taps', oldest: 'Oldest' };
      Views._els.sortLabel.textContent = names[S.sort] || names.recent;
      var btn = U.qs('#btnSort');
      btn.setAttribute('aria-label', 'Sorted by ' + (names[S.sort] || names.recent).toLowerCase() + ' — change sort order');
      if (animate) {
        btn.classList.remove('flip');
        void btn.offsetWidth;
        btn.classList.add('flip');
      }
    },

    /* Calendar and Stats are rebuilt when shown, but only if something they
       draw has changed since: the log, the look, the day, or (for Stats)
       the clock its "x mins ago" cells read. Going back and forth between
       tabs then costs nothing. */
    stale: { calendar: true, stats: true },
    invalidate: function () { Views.stale.calendar = true; Views.stale.stats = true; },

    renderAll: function (activeView) {
      Views.invalidate();
      Views.renderHome();
      if (activeView === 'calendar') Views.renderCalendar();
      if (activeView === 'stats') V.stats.render();
    },

    /* highlight a tab without switching views (the Settings sheet lights
       its tab while open, then hands the highlight back) */
    markTab: function (name) {
      U.qsa('.tab').forEach(function (t) {
        var on = t.dataset.view === name;
        t.classList.toggle('is-on', on);
        if (on && name !== 'settings') t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
      Views.glide();
    },

    /* the highlight glides from the old tab to the new one */
    glide: function () {
      var g = U.qs('#tabGlide');
      var bar = g && g.parentNode;
      var ic = U.qs('.tab.is-on .tab-ic');
      if (!g || !bar || !ic) return;
      var b = bar.getBoundingClientRect(), r = ic.getBoundingClientRect();
      if (!b.width || !r.width) return;
      g.style.setProperty('--glide-x', (r.left - b.left) + 'px');
      g.style.setProperty('--glide-y', (r.top - b.top) + 'px');
      g.style.width = r.width + 'px';
      g.style.height = r.height + 'px';
      g.classList.add('is-placed');
      /* the first placement (and any after a resize) jumps; moves glide */
      if (g.classList.contains('no-anim')) {
        void g.offsetWidth;
        g.classList.remove('no-anim');
      }
    },

    /* Settings is a sheet over the current view, never a pane of its own:
       the view underneath stays as it was, and closing the sheet relights
       the tab you came from. (It used to swap in the Events view, keep the
       Settings tab lit after closing, and hide the + button.) */
    toggleTab: function (name) {
      if (name === 'settings') { V.app.openDataSheet(); return; }
      var app = V.app;
      var prev = app.view;
      var changed = prev !== name;
      if (changed && prev) Views.scrollMem[prev] = window.scrollY;
      app.view = name;
      Views.markTab(name);

      /* the new view slides in from the side its tab is on, relative to the
         one you came from: right for a tab further along, left for one back */
      var order = ['home', 'calendar', 'stats'];
      var dir = !prev || prev === name ? '' : (order.indexOf(name) > order.indexOf(prev) ? 'enter-next' : 'enter-prev');
      order.forEach(function (v) {
        var el = U.qs('#view-' + v);
        var on = v === name;
        el.hidden = !on;
        if (on && changed) {
          el.classList.remove('enter', 'enter-next', 'enter-prev');
          void el.offsetWidth;
          el.classList.add(dir || 'enter');
        }
      });

      if (name === 'calendar' && Views.stale.calendar) Views.renderCalendar();
      if (name === 'stats' && Views.stale.stats) V.stats.render();
      if (changed) window.scrollTo(0, Views.scrollMem[name] || 0);
    }
  };

})(window.V);
