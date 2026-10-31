/* ============================================================
   Virulenter · stats.js
   Statistics view: totals, streaks, distributions and heat grids.
   Every figure is derived from the tap log on render — nothing is cached
   in browser storage.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store;

  var Stats = V.stats = {
    year: null,
    _els: {},
    _tip: null,

    init: function () {
      Stats._els = {
        view: U.qs('#view-stats'),
        hero: U.qs('#statHero'),
        streak: U.qs('#statStreak'),
        d30: U.qs('#stat30'),
        d30sub: U.qs('#stat30Sub'),
        year: U.qs('#statYear'),
        months: U.qs('#statMonths'),
        weekday: U.qs('#statWeekday'),
        hour: U.qs('#statHour'),
        events: U.qs('#statEvents'),
        eventSub: U.qs('#statEventSub'),
        heatScroll: U.qs('#statHeatScroll'),
        heatMonths: U.qs('#statHeatMonths'),
        heat: U.qs('#statHeat'),
        heatSub: U.qs('#statHeatSub')
      };
      Stats._els.year.addEventListener('change', function () {
        Stats.year = Number(Stats._els.year.value);
        Stats.render();
      });
      Stats.initTooltip();
      return Stats;
    },

    render: function () {
      var s = S.stats();
      var st = S.streaks();
      var range = S.range();

      /* ── hero ── */
      var spanDays = D.diffDays(D.fromTs(range.min), D.today()) + 1;
      var perDay = spanDays > 0 ? s.total / spanDays : 0;
      var perActive = st.activeDays ? s.total / st.activeDays : 0;
      var firstEvent = S.events.reduce(function (acc, e) {
        var f = S.first(e);
        if (f === null) return acc;
        return acc === null || f < acc ? f : acc;
      }, null);

      Stats._els.hero.innerHTML = [
        '<div class="sh lead span2" style="--i:0"><b>' + s.total + '</b><span>' +
          U.plural(s.total, 'tap') + ' recorded across ' + s.events + ' ' + U.plural(s.events, 'event') + '</span></div>',
        sh(s.today, 'today', '', 1),
        sh(s.week, 'last 7 days', '', 2),
        '<div class="sh w2" style="--i:3"><b>' + perDay.toFixed(2) + '<em>per day</em></b>' +
          '<span>across ' + spanDays + ' ' + U.plural(spanDays, 'day') + ' since ' + U.esc(D.fmtDay(D.toISO(new Date(range.min)))) + '</span></div>',
        '<div class="sh w2 date" style="--i:4"><b>' + (firstEvent ? U.esc(D.fmtDay(D.dayKey(firstEvent))) : '—') + '</b>' +
          '<span>' + (firstEvent ? 'first tap ever' : 'no taps yet') + '</span></div>'
      ].join('');

      /* ── streaks ── */
      Stats._els.streak.innerHTML =
        '<div class="streak-row">' +
          sr(st.current, 'current', st.current > 0 ? 'hot' : '') +
          sr(st.longest, 'longest') +
          sr(st.activeDays, 'active days') +
        '</div>' +
        '<p class="streak-note">' +
          (st.longestEnd
            ? 'Longest run ended ' + U.esc(D.fmtDay(st.longestEnd)) +
              (st.current ? ' · currently on a ' + st.current + '-day run' : ' · no run active right now')
            : 'Tap something to start a streak.') +
          ' · average ' + perActive.toFixed(1) + ' taps on an active day.' +
        '</p>';

      /* ── last 30 days ── */
      var days = S.lastDays(30);
      var max30 = Math.max.apply(null, days.map(function (d) { return d.n; }).concat([1]));
      var sum30 = days.reduce(function (a, d) { return a + d.n; }, 0);
      var peak = days.reduce(function (best, d) { return d.n > best.n ? d : best; }, { n: 0 });
      Stats.chart(Stats._els.d30, days.map(function (d, i) {
        return {
          n: d.n,
          tip: D.fmtDay(d.iso) + ' · ' + d.n + ' ' + U.plural(d.n, 'tap'),
          cap: (i % 5 === 0 || i === days.length - 1) ? String(D.parseISO(d.iso).getDate()) : ''
        };
      }), max30, 'Last 30 days: ' + sum30 + ' ' + U.plural(sum30, 'tap') +
        (peak.n ? ', busiest ' + D.fmtDay(peak.iso) + ' with ' + peak.n : ''));
      Stats._els.d30sub.textContent = sum30 + ' ' + U.plural(sum30, 'tap') + ' · peak ' + max30;

      /* ── by month ── */
      var years = S.years();
      if (Stats.year === null || years.indexOf(Stats.year) < 0) Stats.year = years[0];
      Stats._els.year.innerHTML = years.map(function (y) {
        return '<option value="' + y + '"' + (y === Stats.year ? ' selected' : '') + '>' + y + '</option>';
      }).join('');
      var months = S.byMonth(Stats.year);
      var maxM = Math.max.apply(null, months.concat([1]));
      Stats.chart(Stats._els.months, months.map(function (n, i) {
        return { n: n, tip: D.MONTHS_LONG[i] + ' ' + Stats.year + ' · ' + n + ' ' + U.plural(n, 'tap'), cap: D.MONTHS[i][0] };
      }), maxM, 'Taps per month in ' + Stats.year, 'tall');

      /* ── weekday / hour ── */
      var wd = S.byWeekday();
      var maxWd = Math.max.apply(null, wd.concat([1]));
      Stats.chart(Stats._els.weekday, wd.map(function (n, i) {
        return { n: n, tip: D.WEEKDAYS_LONG[(i + 1) % 7] + ' · ' + n + ' ' + U.plural(n, 'tap'), cap: D.WEEKDAYS[(i + 1) % 7] };
      }), maxWd, 'Taps by weekday');

      var hr = S.byHour();
      var maxHr = Math.max.apply(null, hr.concat([1]));
      Stats.chart(Stats._els.hour, hr.map(function (n, i) {
        return { n: n, tip: U.pad2(i) + ':00–' + U.pad2(i) + ':59 · ' + n + ' ' + U.plural(n, 'tap'), cap: i % 6 === 0 ? U.pad2(i) : '' };
      }), maxHr, 'Taps by hour of day');

      /* ── per event: a table on wide screens, stacked rows on phones ── */
      var rows = S.perEvent();
      Stats._els.eventSub.textContent = rows.length ? rows.length + ' ' + U.plural(rows.length, 'event') : '';
      if (!rows.length) {
        Stats._els.events.innerHTML = '<tbody><tr><td class="table-empty" colspan="6">No events yet.</td></tr></tbody>';
      } else {
        Stats._els.events.innerHTML =
          '<thead><tr><th scope="col">Event</th><th scope="col">Taps</th><th scope="col">Share</th><th scope="col">Per day</th>' +
          '<th scope="col">Active days</th><th scope="col">Last tap</th></tr></thead>' +
          '<tbody>' + rows.map(function (r) {
            var pct = Math.round(r.share * 100);
            var color = V.ui.tone(r.event.color).c;
            return '<tr>' +
              '<td class="c-name"><span class="name-cell" style="--c:' + U.esc(color) + '">' +
                '<i class="dot"></i><span title="' + U.esc(r.event.name) + '">' + U.esc(r.event.name) + '</span></span></td>' +
              '<td class="c-taps">' + r.count + '</td>' +
              '<td class="c-share"><span class="share-cell"><span class="meter" style="--c:' + U.esc(color) + '">' +
                '<i style="--w:' + pct + '%"></i></span>' +
                '<span>' + pct + '%</span></span></td>' +
              '<td class="c-rate" data-label="Per day">' + (r.rate >= 1 ? r.rate.toFixed(1) : r.rate.toFixed(2)) + '</td>' +
              '<td class="c-days" data-label="Active days">' + r.activeDays + '</td>' +
              '<td class="c-last" data-label="Last tap">' + (r.last ? U.esc(D.fmtRelative(r.last)) : '—') + '</td>' +
            '</tr>';
          }).join('') + '</tbody>';
      }

      /* ── activity grid ── */
      Stats._els.heatSub.textContent = st.activeDays + ' active ' + U.plural(st.activeDays, 'day');
      var weeks = Stats.weeksIn(Stats.year);
      Stats._els.heatScroll.style.setProperty('--weeks', weeks);
      Stats._els.heatMonths.innerHTML = Stats.heatMonthsHTML(Stats.year);
      Stats._els.heat.innerHTML = Stats.heatGridHTML(Stats.year);
      Stats.revealHeat();
    },

    /* bars for one chart; items: [{ n, tip, cap }] */
    chart: function (el, items, max, label, extra) {
      el.className = 'bar-chart has-caps' + (extra ? ' ' + extra : '');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', label);
      var last = items.length - 1;
      el.innerHTML = items.map(function (it, i) {
        var h = it.n ? Math.max(4, Math.round((it.n / max) * 100)) : 3;
        var cls = 'bar' + (it.n ? '' : ' zero') + (i === last && it.cap ? ' cap-end' : '') + (i === 0 && it.cap ? ' cap-start' : '');
        return '<div class="' + cls + '" data-tip="' + U.esc(it.tip) + '" style="--h:' + h + '%;--i:' + i + '">' +
          '<i></i>' + (it.cap ? '<span class="cap">' + U.esc(it.cap) + '</span>' : '') +
        '</div>';
      }).join('');
    },

    /* ── tooltip: one element, fixed and clamped to the viewport ── */
    initTooltip: function () {
      var tip = Stats._tip = U.el('div', 'chart-tip');
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tip);
      var view = Stats._els.view;

      function onPoint(ev) {
        var bar = ev.target.closest && ev.target.closest('.bar-chart .bar');
        if (bar) Stats.showTip(bar);
      }
      view.addEventListener('pointerover', onPoint);
      view.addEventListener('pointerdown', onPoint);
      view.addEventListener('pointerout', function (ev) {
        if (ev.pointerType !== 'mouse') return;
        var to = ev.relatedTarget;
        if (!to || !to.closest || !to.closest('.bar-chart .bar')) Stats.hideTip();
      });
      document.addEventListener('pointerdown', function (ev) {
        if (!ev.target.closest || !ev.target.closest('.bar-chart .bar')) Stats.hideTip();
      });
      window.addEventListener('scroll', Stats.hideTip, { passive: true });
      window.addEventListener('resize', Stats.hideTip);
    },

    showTip: function (bar) {
      var tip = Stats._tip;
      var chart = bar.parentElement;
      Stats.clearBars();
      bar.classList.add('is-on');
      chart.classList.add('is-hover');
      tip.textContent = bar.dataset.tip || '';
      tip.classList.add('is-on');

      var r = (bar.querySelector('i') || bar).getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var x = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
      var top = U.qs('#topbar').getBoundingClientRect().bottom + 6;
      var y = r.top - h - 8;
      if (y < top) y = r.bottom + 8;
      tip.style.setProperty('--x', Math.round(x) + 'px');
      tip.style.setProperty('--y', Math.round(y) + 'px');
    },

    hideTip: function () {
      if (Stats._tip) Stats._tip.classList.remove('is-on');
      Stats.clearBars();
    },

    clearBars: function () {
      U.qsa('.bar-chart.is-hover').forEach(function (c) {
        c.classList.remove('is-hover');
        U.qsa('.bar.is-on', c).forEach(function (b) { b.classList.remove('is-on'); });
      });
    },

    /* ── contribution-style grid: one column per week, Monday at the top,
       oldest → newest so time reads left to right ── */
    gridStart: function (year) {
      var start = new Date(year, 0, 1);
      return D.addDays(start, -((start.getDay() + 6) % 7));      // the Monday on or before 1 Jan
    },

    weeksIn: function (year) {
      var start = Stats.gridStart(year);
      return Math.ceil((D.diffDays(start, new Date(year, 11, 31)) + 1) / 7);
    },

    heatGridHTML: function (year) {
      var totals = S.dayTotals();
      var level = V.views.levelOf;
      var levels = V.views.levels(totals);
      var y = year || new Date().getFullYear();
      var start = Stats.gridStart(y);
      var total = Stats.weeksIn(y) * 7;
      var todayISO = D.toISO(D.today());
      var cells = [];

      for (var i = 0; i < total; i++) {
        var day = D.addDays(start, i);
        var iso = D.toISO(day);
        if (day.getFullYear() !== y) {
          cells.push('<i class="hc blank"></i>');
          continue;
        }
        var n = totals[iso] || 0;
        var cls = 'hc' + (n ? ' v' + level(n, levels) : '') + (iso === todayISO ? ' today' : '');
        cells.push('<i class="' + cls + '" data-date="' + iso + '" title="' +
          U.esc(D.fmtDay(iso)) + ' — ' + n + ' ' + U.plural(n, 'tap') + '"></i>');
      }
      return cells.join('');
    },

    /* month labels placed over the week column each month starts in */
    heatMonthsHTML: function (year) {
      var start = Stats.gridStart(year);
      var out = [];
      for (var m = 0; m < 12; m++) {
        var col = Math.floor(D.diffDays(start, new Date(year, m, 1)) / 7) + 1;
        out.push('<span style="grid-column:' + col + ' / span 4">' + D.MONTHS[m] + '</span>');
      }
      return out.join('');
    },

    /* phones show part of the year: bring today (or the year's end) into view */
    revealHeat: function () {
      var scroller = Stats._els.heatScroll;
      requestAnimationFrame(function () {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) { scroller.scrollLeft = 0; return; }
        var target = U.qs('.hc.today', Stats._els.heat);
        if (!target) {
          scroller.scrollLeft = Stats.year > new Date().getFullYear() ? 0 : scroller.scrollWidth;
          return;
        }
        var sr = scroller.getBoundingClientRect(), tr = target.getBoundingClientRect();
        scroller.scrollLeft += tr.right - sr.right + Math.min(64, sr.width / 4);
      });
    },

    /* the calendar's year at a glance: a row per month, a column per day */
    yearStripHTML: function (year, selISO) {
      var totals = S.dayTotals();
      var level = V.views.levelOf;
      var levels = V.views.levels(totals);
      var todayISO = D.toISO(D.today());
      var out = [];

      for (var m = 0; m < 12; m++) {
        out.push('<span class="ym" title="' + D.MONTHS_LONG[m] + '">' + D.MONTHS[m][0] + '</span>');
        var len = D.daysInMonth(year, m);
        for (var d = 1; d <= 31; d++) {
          if (d > len) { out.push('<i class="yx" aria-hidden="true"></i>'); continue; }
          var iso = D.toISO(new Date(year, m, d));
          var n = totals[iso] || 0;
          var cls = 'hc' + (n ? ' v' + level(n, levels) : '') +
            (iso === todayISO ? ' today' : '') + (iso === selISO ? ' sel' : '');
          out.push('<i class="' + cls + '" data-date="' + iso + '" title="' +
            U.esc(D.fmtDay(iso)) + ' — ' + n + ' ' + U.plural(n, 'tap') + '"></i>');
        }
      }
      return out.join('');
    },

    show: function () {
      Stats.render();
    }
  };

  function sh(value, label, cls, i) {
    return '<div class="sh' + (cls ? ' ' + cls : '') + '" style="--i:' + (i || 0) + '"><b>' + value + '</b><span>' + U.esc(label) + '</span></div>';
  }

  function sr(value, label, cls) {
    return '<div class="sr' + (cls ? ' ' + cls : '') + '"><b>' + value + '</b><span>' + U.esc(label) + '</span></div>';
  }

})(window.V);
