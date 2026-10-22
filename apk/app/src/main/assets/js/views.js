/* ============================================================
   Virulenter · views.js — events list, calendar grid, day panel.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store, UI = V.ui;

  var Views = V.views = {
    cal: { y: 0, m: 0, sel: null },
    _els: {},

    init: function () {
      var e = Views._els = {
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
    renderHome: function () {
      var stats = S.stats();
      Views.renderStats(stats);
      Views.renderNotice();

      var events = S.list();
      var hasAny = S.events.length > 0;
      Views._els.toolbar.hidden = !hasAny;

      var shown = UI.renderCards(Views._els.list, events);
      var nothingToShow = !shown;
      Views._els.empty.hidden = shown;
      if (nothingToShow && hasAny) {
        /* events exist but the search filtered them all out */
        Views._els.list.innerHTML = '<div class="day-empty">No events match “' + U.esc(S.query) + '”.</div>';
        Views._els.empty.hidden = true;
      }
      Views.renderBrandSub();
    },

    renderBrandSub: function () {
      var stats = S.stats();
      Views._els.brandSub.textContent = stats.events
        ? stats.total + ' ' + UI.plural(stats.total, 'tap') + ' · ' + stats.events + ' ' + UI.plural(stats.events, 'event')
        : 'tap to count';
    },

    renderStats: function (stats) {
      Views._els.stats.innerHTML = [
        cell(stats.events, UI.plural(stats.events, 'event')),
        cell(stats.total, UI.plural(stats.total, 'tap')),
        cell(stats.today, 'today')
      ].join('');
      function cell(v, label) {
        return '<div class="st"><b>' + v + '</b><span>' + U.esc(label) + '</span></div>';
      }
    },

    renderNotice: function () {
      var box = Views._els.notice;
      var msgs = [];

      if (S.decodeFailed) {
        msgs.push('The data in this link could not be read, so the log is empty. Check that the whole link was copied, or paste it again from <b>Move your data</b>.');
      }
      if (S.mergeNotice) {
        msgs.push('Merged data from ' + S.mergeNotice + ' links.');
      }
      if (!S.urlOk && S.events.length) {
        msgs.push('Your log is now too large to keep in the address bar. Use <b>Move your data</b> → shareable links or a backup file to carry it to another browser.');
      }
      if (!S.events.length && !S.decodeFailed) { box.hidden = true; box.innerHTML = ''; return; }

      if (!msgs.length) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = '<span>' + msgs.join(' ') + '</span>' +
        '<button type="button" data-notice-close="1">Dismiss</button>';
    },

    /* ══════════ calendar ══════════ */
    renderCalendar: function () {
      var y = Views.cal.y, m = Views.cal.m;
      var totals = S.dayTotals();
      var levels = Views.levels(totals);

      Views._els.calTitleText.textContent = D.fmtMonth(y, m);

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
      Views._els.calGrid.innerHTML = cells.join('');

      var range = S.range();
      var monthStart = D.stripTime(new Date(y, m, 1));
      var monthEnd = D.stripTime(new Date(y, m, days));
      var outside = monthEnd < range.min || monthStart > range.max;
      U.qs('#calPrev').disabled = false;
      U.qs('#calNext').disabled = false;
      Views._els.calRange.textContent = outside
        ? 'No data in this month'
        : (D.fmtDay(D.toISO(new Date(range.min))) + ' → ' + D.fmtDay(D.toISO(new Date(range.max))));

      /* whole-year strip: 12 columns (months) × up to 31 rows (days).
         This is the "find a date in a large range" view — every day of the
         year is one click away, without paging through months. */
      var yWrap = U.qs('#calYearWrap');
      if (totals && Object.keys(totals).length) {
        yWrap.hidden = false;
        U.qs('#calYearLabel').textContent = y + ' at a glance · ' +
          Object.keys(totals).filter(function (k) { return k.slice(0, 4) === String(y); }).length +
          ' active days';
        U.qs('#calYearGrid').innerHTML = V.stats.yearStripHTML(y);
      } else {
        yWrap.hidden = true;
      }

      Views.renderDayPanel();

      function cell(date, out) {
        var iso = D.toISO(date);
        var n = totals[iso] || 0;
        var cls = ['cal-cell'];
        if (out) cls.push('out');
        if (n) cls.push('v' + Views.levelOf(n, levels));
        if (iso === todayISO) cls.push('today');
        if (iso === Views.cal.sel) cls.push('sel');
        return '<button class="' + cls.join(' ') + '" type="button" data-date="' + iso + '" role="gridcell" ' +
          'aria-label="' + iso + (n ? ', ' + n + ' ' + UI.plural(n, 'tap') : ', no taps') + '">' +
          '<span class="cal-d">' + date.getDate() + '</span>' +
          (n ? '<span class="cal-n">' + n + '</span>' : '') +
          '</button>';
      }
    },

    /* intensity scale derived from the data itself, so it stays useful
       whether someone taps 3 times a week or 40 times a day */
    levels: function (totals) {
      var vals = [];
      for (var k in totals) if (Object.prototype.hasOwnProperty.call(totals, k)) vals.push(totals[k]);
      vals.sort(function (a, b) { return a - b; });
      if (!vals.length) return { t1: 1, t2: 2, t3: 3, max: 0 };
      var max = vals[vals.length - 1];
      var p = function (q) {
        var idx = Math.min(vals.length - 1, Math.floor(q * vals.length));
        return vals[idx];
      };
      var t1 = 1;
      var t2 = Math.max(2, p(0.6));
      var t3 = Math.max(3, p(0.85));
      if (t3 <= t2) t3 = t2 + 1;
      if (t2 <= t1) t2 = t1 + 1;
      return { t1: t1, t2: t2, t3: t3, max: max };
    },

    levelOf: function (n, levels) {
      if (!n) return 0;
      if (n >= levels.t3) return 4;
      if (n >= levels.t2) return 3;
      if (n >= levels.t1) return 2;
      return 1;
    },

    renderDayPanel: function () {
      Views._els.dayPanel.innerHTML = UI.dayPanelHTML(Views.cal.sel);
    },

    setSelectedDay: function (iso) {
      Views.cal.sel = iso;
      Views.renderCalendar();
    },

    shiftMonth: function (delta) {
      var d = new Date(Views.cal.y, Views.cal.m + delta, 1);
      Views.cal.y = d.getFullYear();
      Views.cal.m = d.getMonth();
      Views.renderCalendar();
    },

    shiftYear: function (delta) {
      Views.cal.y += delta;
      /* clamp the day so 29 Feb does not roll into March */
      var maxDay = D.daysInMonth(Views.cal.y, Views.cal.m);
      var sel = D.parseISO(Views.cal.sel);
      if (sel && sel.getDate() > maxDay) {
        Views.cal.sel = D.toISO(new Date(Views.cal.y, Views.cal.m, maxDay));
      }
      Views.renderCalendar();
    },

    goTo: function (y, m, dayISO) {
      Views.cal.y = y;
      Views.cal.m = m;
      if (dayISO) Views.cal.sel = dayISO;
      Views.renderCalendar();
    },

    goToday: function () {
      var t = D.today();
      Views.cal.y = t.getFullYear();
      Views.cal.m = t.getMonth();
      Views.cal.sel = D.toISO(t);
      Views.renderCalendar();
    },

    /* remove the per-card timer because there is no live clock in the flat UI */
    refreshLastLines: function () {
      S.events.forEach(function (e) {
        var node = U.qs('[data-last="' + e.id + '"]');
        if (node) node.innerHTML = UI.lastLine(S.last(e));
        var count = U.qs('[data-count="' + e.id + '"]');
        if (count) count.textContent = S.count(e);
      });
    },

    renderSort: function () {
      var names = { recent: 'Recent', name: 'A–Z', count: 'Most taps', oldest: 'Oldest' };
      Views._els.sortLabel.textContent = names[S.sort] || names.recent;
    },

    renderAll: function (activeView) {
      Views.renderHome();
      if (activeView === 'calendar') Views.renderCalendar();
    },

    toggleTab: function (name) {
      U.qsa('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.view === name); });
      U.qs('#view-home').hidden = name !== 'home';
      U.qs('#view-calendar').hidden = name !== 'calendar';
      U.qs('#view-stats').hidden = name !== 'stats';
      /* Settings is a sheet, not a pane: the tab opens it and the Events tab
         stays highlighted underneath, so closing it never leaves a blank view */
      if (name === 'settings') {
        U.qs('#view-home').hidden = false;
        U.qs('#view-stats').hidden = true;
        U.qsa('.tab').forEach(function (t) {
          t.classList.toggle('is-on', t.dataset.view === (name === 'settings' ? 'settings' : name));
        });
        U.qs('#fab').hidden = true;
        V.app.openDataSheet();
        return;
      }
      U.qs('#fab').hidden = name !== 'home';
      if (name === 'calendar') Views.renderCalendar();
      if (name === 'stats') V.stats.render();
    }
  };

})(window.V);
