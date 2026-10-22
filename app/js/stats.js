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

    init: function () {
      var e = Stats._els = {
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
        heat: U.qs('#statHeat'),
        heatSub: U.qs('#statHeatSub')
      };
      Stats._els.year.addEventListener('change', function () {
        Stats.year = Number(Stats._els.year.value);
        Stats.render();
      });
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
        sh(s.total, 'taps recorded'),
        sh(s.events, U.plural(s.events, 'event')),
        sh(s.today, 'today'),
        sh(s.week, 'last 7 days')
      ].join('') +
        '<div class="sh span2"><b>' + perDay.toFixed(2) + '<em>per day</em></b>' +
        '<span>across ' + spanDays + ' ' + U.plural(spanDays, 'day') + ' since ' + U.esc(D.fmtDay(D.toISO(new Date(range.min)))) + '</span></div>' +
        '<div class="sh span2"><b>' + (firstEvent ? D.fmtDay(D.dayKey(firstEvent)) : '—') + '</b>' +
        '<span>' + (firstEvent ? 'first tap ever' : 'no taps yet') + '</span></div>';

      /* ── streaks ── */
      Stats._els.streak.innerHTML =
        '<div class="streak-row">' +
          sr(st.current, 'current') +
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
      Stats._els.d30.className = 'bar-chart has-caps';
      Stats._els.d30.innerHTML = days.map(function (d, i) {
        var h = Math.max(3, Math.round((d.n / max30) * 100));
        var showCap = i % 5 === 0 || i === days.length - 1;
        return '<div class="bar' + (d.n ? '' : ' zero') + '">' +
          '<span class="tip">' + U.esc(D.fmtDay(d.iso)) + ' · ' + d.n + ' ' + U.plural(d.n, 'tap') + '</span>' +
          '<i data-h="' + h + '"></i>' +
          (showCap ? '<span class="cap">' + new Date(D.parseISO(d.iso)).getDate() + '</span>' : '') +
        '</div>';
      }).join('');
      var sum30 = days.reduce(function (a, d) { return a + d.n; }, 0);
      Stats._els.d30sub.textContent = sum30 + ' ' + U.plural(sum30, 'tap') + ' · peak ' + max30;

      /* ── by month ── */
      var years = S.years();
      if (Stats.year === null || years.indexOf(Stats.year) < 0) Stats.year = years[0];
      Stats._els.year.innerHTML = years.map(function (y) {
        return '<option value="' + y + '"' + (y === Stats.year ? ' selected' : '') + '>' + y + '</option>';
      }).join('');
      var months = S.byMonth(Stats.year);
      var maxM = Math.max.apply(null, months.concat([1]));
      Stats._els.months.className = 'bar-chart tall has-caps';
      Stats._els.months.innerHTML = months.map(function (n, i) {
        var h = Math.max(3, Math.round((n / maxM) * 100));
        return '<div class="bar' + (n ? '' : ' zero') + '">' +
          '<span class="tip">' + D.MONTHS_LONG[i] + ' · ' + n + ' ' + U.plural(n, 'tap') + '</span>' +
          '<i data-h="' + h + '"></i>' +
          '<span class="cap">' + D.MONTHS[i][0] + '</span>' +
        '</div>';
      }).join('');

      /* ── weekday / hour ── */
      var wd = S.byWeekday();
      var maxWd = Math.max.apply(null, wd.concat([1]));
      Stats._els.weekday.className = 'bar-chart has-caps';
      Stats._els.weekday.innerHTML = wd.map(function (n, i) {
        var h = Math.max(3, Math.round((n / maxWd) * 100));
        return '<div class="bar' + (n ? '' : ' zero') + '">' +
          '<span class="tip">' + D.WEEKDAYS_LONG[(i + 1) % 7] + ' · ' + n + '</span>' +
          '<i data-h="' + h + '"></i>' +
          '<span class="cap">' + D.WEEKDAYS[(i + 1) % 7] + '</span>' +
        '</div>';
      }).join('');

      var hr = S.byHour();
      var maxHr = Math.max.apply(null, hr.concat([1]));
      Stats._els.hour.className = 'bar-chart has-caps';
      Stats._els.hour.innerHTML = hr.map(function (n, i) {
        var h = Math.max(3, Math.round((n / maxHr) * 100));
        var showCap = i % 6 === 0;
        return '<div class="bar' + (n ? '' : ' zero') + '">' +
          '<span class="tip">' + U.pad2(i) + ':00–' + U.pad2(i) + ':59 · ' + n + '</span>' +
          '<i data-h="' + h + '"></i>' +
          (showCap ? '<span class="cap">' + U.pad2(i) + '</span>' : '') +
        '</div>';
      }).join('');

      /* ── per event table ── */
      var rows = S.perEvent();
      Stats._els.eventSub.textContent = rows.length ? rows.length + ' total' : '';
      if (!rows.length) {
        Stats._els.events.innerHTML = '<tbody><tr><td class="table-empty" colspan="6">No events yet.</td></tr></tbody>';
      } else {
        Stats._els.events.innerHTML =
          '<thead><tr><th>Event</th><th>Taps</th><th>Share</th><th>Per day</th><th>Active days</th><th>Last tap</th></tr></thead>' +
          '<tbody>' + rows.map(function (r) {
            return '<tr>' +
              '<td><span class="name-cell" style="--c:' + U.esc(r.event.color) + '">' +
                '<i class="dot"></i><span title="' + U.esc(r.event.name) + '">' + U.esc(r.event.name) + '</span></span></td>' +
              '<td class="num">' + r.count + '</td>' +
              '<td><span class="share-cell"><span class="meter" style="--c:' + U.esc(r.event.color) + '">' +
                '<i data-w="' + Math.round(r.share * 100) + '"></i></span>' +
                '<span class="num">' + Math.round(r.share * 100) + '%</span></span></td>' +
              '<td class="num">' + (r.rate >= 1 ? r.rate.toFixed(1) : r.rate.toFixed(2)) + '</td>' +
              '<td class="num">' + r.activeDays + '</td>' +
              '<td class="num">' + (r.last ? U.esc(D.fmtRelative(r.last)) : '—') + '</td>' +
            '</tr>';
          }).join('') + '</tbody>';
      }

      /* ── activity grid ── */
      Stats._els.heatSub.textContent = st.activeDays + ' active ' + U.plural(st.activeDays, 'day');
      Stats._els.heat.innerHTML = Stats.heatGridHTML(Stats.year);

      /* animate bars in after the markup exists */
      requestAnimationFrame(function () {
        U.qsa('#view-stats .bar-chart .bar i').forEach(function (el) {
          el.style.height = (el.dataset.h || 3) + '%';
        });
        U.qsa('.share-cell .meter i', Stats._els.events).forEach(function (el) {
          el.style.width = (el.dataset.w || 0) + '%';
        });
      });
    },

    /* contribution-style grid: one column per week, Monday at the top.
       Always drawn oldest → newest so time reads left to right. */
    heatGridHTML: function (year) {
      var totals = S.dayTotals();
      var level = V.views.levelOf;
      var levels = V.views.levels(totals);
      var y = year || new Date().getFullYear();

      var start = new Date(y, 0, 1);
      var end = new Date(y, 11, 31);
      /* back up to the Monday of the week containing Jan 1 */
      start = D.addDays(start, -((start.getDay() + 6) % 7));

      var todayISO = D.toISO(D.today());
      var cells = [];
      var cursor = start;
      var guard = 0;
      while (cursor <= end && guard++ < 400) {
        for (var d = 0; d < 7; d++) {
          var day = D.addDays(start, cells.length);
          var iso = D.toISO(day);
          if (day.getFullYear() !== y) {
            cells.push('<i class="hc blank"></i>');
          } else {
            var n = totals[iso] || 0;
            var cls = 'hc' + (n ? ' v' + level(n, levels) : '');
            if (iso === todayISO) cls += ' today';
            cells.push('<i class="' + cls + '" data-date="' + iso + '" title="' +
              U.esc(D.fmtDay(iso)) + ' — ' + n + ' ' + U.plural(n, 'tap') + '"></i>');
          }
        }
        cursor = D.addDays(start, cells.length);
      }
      return cells.join('');
    },

    /* compact year strip for the calendar: 12 month columns × up-to-31 day rows */
    yearStripHTML: function (year) {
      var totals = S.dayTotals();
      var level = V.views.levelOf;
      var levels = V.views.levels(totals);
      var todayISO = D.toISO(D.today());
      var cells = [];
      var guard = 0;

      for (var m = 0; m < 12; m++) {
        var len = D.daysInMonth(year, m);
        for (var d = 1; d <= len && guard++ < 400; d++) {
          var iso = D.toISO(new Date(year, m, d));
          var n = totals[iso] || 0;
          var cls = 'hc' + (n ? ' v' + level(n, levels) : '');
          if (iso === todayISO) cls += ' today';
          cells.push('<i class="' + cls + '" data-date="' + iso + '" title="' +
            U.esc(D.fmtDay(iso)) + ' — ' + n + ' ' + U.plural(n, 'tap') + '"></i>');
        }
      }
      return cells.join('');
    },

    show: function () {
      Stats.render();
    }
  };

  function sh(value, label) {
    return '<div class="sh"><b>' + value + '</b><span>' + U.esc(label) + '</span></div>';
  }

  function sr(value, label) {
    return '<div class="sr"><b>' + value + '</b><span>' + U.esc(label) + '</span></div>';
  }

})(window.V);
