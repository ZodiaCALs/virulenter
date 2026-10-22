/* ============================================================
   Virulenter · ui.js — card rendering, sheets, small helpers.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store;

  var UI = V.ui = {

    /* ── sheets ─────────────────────────────────────────── */
    openSheet: function (overlay) {
      overlay.hidden = false;
      overlay.classList.remove('closing');
      document.body.style.overflow = 'hidden';
    },

    closeSheet: function (overlay) {
      if (!overlay || overlay.hidden) return;
      overlay.classList.add('closing');
      setTimeout(function () {
        overlay.hidden = true;
        overlay.classList.remove('closing');
        var anyOpen = ['#formOverlay', '#dataOverlay'].some(function (sel) {
          var o = U.qs(sel);
          return o && !o.hidden;
        });
        if (!anyOpen) document.body.style.overflow = '';
      }, 170);
    },

    bindSheetClose: function (overlay) {
      overlay.addEventListener('click', function (ev) {
        if (ev.target.dataset && ev.target.dataset.close) UI.closeSheet(overlay);
      });
    },

    /* ── a count formatted for reading ──────────────────── */
    countText: function (n) { return String(n); },

    plural: function (n, one, many) { return U.plural(n, one, many); },

    /* avg taps/day, with sensible precision */
    rateText: function (rate) {
      if (!rate) return '0/day';
      if (rate >= 10) return Math.round(rate) + '/day';
      if (rate >= 1) return rate.toFixed(1).replace(/\.0$/, '') + '/day';
      return rate.toFixed(2) + '/day';
    },

    /* ── the event card ─────────────────────────────────── */
    cardHTML: function (e, index) {
      var count = S.count(e);
      var last = S.last(e);
      var first = S.first(e);
      var rate = S.perDay(e);
      var startDay = D.parseISO(e.start);
      var runningFor = startDay ? D.diffDays(startDay, D.today()) + 1 : 0;

      var facts = [];
      facts.push('<div class="ev-fact"><b>' + UI.rateText(rate) + '</b><span>average</span></div>');
      if (first) {
        facts.push('<div class="ev-fact"><b>' + D.fmtDay(D.dayKey(first)) + '</b><span>first tap</span></div>');
      } else {
        facts.push('<div class="ev-fact is-muted"><span>No taps yet</span></div>');
      }
      if (runningFor > 0) {
        facts.push('<div class="ev-fact"><b>' + runningFor + '</b><span>' +
          UI.plural(runningFor, 'day') + ' since ' + D.fmtDay(e.start) + '</span></div>');
      }

      return [
        '<article class="ev" data-id="', U.esc(e.id), '" style="--c:', U.esc(e.color), ';--i:', index, '">',
          '<div class="ev-top">',
            '<span class="ev-dot" aria-hidden="true"></span>',
            '<span class="ev-name" title="', U.esc(e.name), '">', U.esc(e.name), '</span>',
            '<button class="ev-menu" type="button" data-edit="', U.esc(e.id), '" aria-label="Edit ', U.esc(e.name), '">',
              '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
            '</button>',
          '</div>',
          '<div class="ev-mid">',
            '<div class="ev-count"><b data-count="', U.esc(e.id), '">', count, '</b><span>',
              UI.plural(count, 'tap', 'taps'), '</span></div>',
            '<div class="ev-facts">', facts.join(''), '</div>',
          '</div>',
          '<div class="ev-foot">',
            '<button class="tap-btn" type="button" data-tap="', U.esc(e.id), '" aria-label="Log one tap for ', U.esc(e.name), '">',
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
              '<span>Tap to count</span>',
            '</button>',
            '<div class="ev-last" data-last="', U.esc(e.id), '">', UI.lastLine(last), '</div>',
          '</div>',
        '</article>'
      ].join('');
    },

    lastLine: function (last) {
      if (!last) return '<span>Nothing logged yet — tap the button to start</span>';
      return '<span>Last: <b>' + U.esc(D.fmtRelative(last)) + '</b> · ' +
        U.esc(D.fmtDay(D.dayKey(last))) + ' at ' + U.esc(D.fmtTime(last)) + '</span>';
    },

    renderCards: function (container, events) {
      if (!events.length) { container.innerHTML = ''; return false; }
      container.innerHTML = events.map(function (e, i) { return UI.cardHTML(e, i); }).join('');
      return true;
    },

    /* ── colour picker state (the form owns the swatch markup) ── */
    setActiveSwatch: function (color) {
      V.app.selectedColor = color;
      U.qsa('#fColor .swatch').forEach(function (b) {
        b.classList.toggle('is-on', b.dataset.color === color);
      });
    },

    /* ── one-day entry list ─────────────────────────────── */
    dayPanelHTML: function (iso) {
      var entries = S.entriesOnDay(iso);
      var total = entries.length;
      var todayISO = D.toISO(D.today());
      var head = [
        '<div class="day-head">',
          '<h3>', U.esc(D.fmtDayLong(iso)), '</h3>',
          '<span class="day-total">', total, ' ', UI.plural(total, 'tap'), '</span>',
        '</div>'
      ];

      var body;
      if (!total) {
        body = '<div class="day-empty">No taps on this day.</div>';
      } else {
        body = '<div class="day-list">' + entries.map(function (row) {
          var e = row.event;
          return '<div class="day-row" style="--c:' + U.esc(e.color) + '">' +
            '<span class="dot" aria-hidden="true"></span>' +
            '<span class="name">' + U.esc(e.name) + '</span>' +
            '<time datetime="' + U.esc(new Date(row.ts).toISOString()) + '">' + U.esc(D.fmtTime(row.ts)) + '</time>' +
            '<button class="del-btn" type="button" data-untap="' + U.esc(e.id) + '" data-ts="' + row.ts + '" aria-label="Remove this tap">' +
              '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
            '</button>' +
          '</div>';
        }).join('') + '</div>';
      }

      var addRow = '';
      if (S.events.length) {
        addRow = '<div class="day-add"><button class="btn" type="button" data-addon="' + U.esc(iso) + '">' +
          (iso === todayISO ? '＋ Log a tap now' : '＋ Add a tap on this day at ' + U.esc(D.fmtTime(Date.now()))) +
          '</button></div>';
      }

      return head.join('') + body + addRow;
    }
  };

})(window.V);
