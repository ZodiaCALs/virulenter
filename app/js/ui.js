/* ============================================================
   Virulenter · ui.js — sheets, dialogs, card and day-panel markup.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store, C = V.color;

  var CLOSE_MS = 220;     // matches the closing animations in base.css

  var UI = V.ui = {
    _z: 100,
    _tones: {},

    /* ── sheets ─────────────────────────────────────────────
       Every overlay opened goes on top of the ones already open: a fresh
       z-index, and first in DOM order among the overlays. The DOM order is
       what the Android wrapper's back button reads (it closes the first
       open overlay it finds); before this, Appearance opened *underneath*
       Settings because it came earlier in the document. */
    openSheet: function (overlay) {
      if (!overlay) return;
      /* re-opened inside the close animation: cancel the pending close,
         which would otherwise hide the sheet a moment after it appeared */
      if (overlay._closeTimer) {
        clearTimeout(overlay._closeTimer);
        overlay._closeTimer = null;
        overlay.classList.remove('closing');
        return;
      }
      if (!overlay.hidden) return;

      var first = document.querySelector('.overlay');
      if (first && first !== overlay) first.parentNode.insertBefore(overlay, first);
      overlay.style.zIndex = String(++UI._z);
      overlay._returnFocus = document.activeElement;
      overlay.classList.remove('closing');
      overlay.hidden = false;
      UI.syncModalState();

      var panel = overlay.querySelector('.sheet, .dialog');
      if (panel) {
        panel.scrollTop = 0;
        requestAnimationFrame(function () {
          if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
        });
      }
    },

    closeSheet: function (overlay) {
      if (!overlay || overlay.hidden || overlay._closeTimer) return;
      overlay.classList.add('closing');
      overlay._closeTimer = setTimeout(function () {
        overlay._closeTimer = null;
        overlay.hidden = true;
        overlay.classList.remove('closing');
        UI.syncModalState();
        var back = overlay._returnFocus;
        overlay._returnFocus = null;
        if (back && back.focus && document.contains(back) && !UI.topOverlay()) {
          try { back.focus({ preventScroll: true }); } catch (e) { /* gone */ }
        }
        if (typeof overlay.onclosed === 'function') overlay.onclosed();
      }, CLOSE_MS);
    },

    isOpen: function (overlay) {
      return !!overlay && !overlay.hidden && !overlay._closeTimer;
    },

    /* the overlay the user is looking at: highest z among the open ones */
    topOverlay: function () {
      var top = null;
      U.qsa('.overlay').forEach(function (o) {
        if (!UI.isOpen(o)) return;
        if (!top || Number(o.style.zIndex || 0) > Number(top.style.zIndex || 0)) top = o;
      });
      return top;
    },

    /* lock the page behind any open overlay, and take it out of the tab
       order and the accessibility tree while it is covered */
    syncModalState: function () {
      var any = U.qsa('.overlay').some(function (o) { return !o.hidden; });
      /* z-indexes only need to order the sheets open right now; restarting
         keeps them from creeping up past the toasts over a long session */
      if (!any) UI._z = 100;
      document.documentElement.classList.toggle('modal-open', any);
      document.body.style.overflow = any ? 'hidden' : '';
      var app = U.qs('#app');
      if (app) {
        if (any) app.setAttribute('inert', '');
        else app.removeAttribute('inert');
      }
    },

    bindSheetClose: function (overlay) {
      overlay.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-close]');
        if (t && overlay.contains(t)) UI.closeSheet(overlay);
      });
    },

    /* ── confirmation dialog ────────────────────────────────
       An in-page replacement for window.confirm(), which the Android
       WebView answers with an instant `false` (no WebChromeClient), so
       deleting and erasing silently did nothing there — and loading data
       silently replaced everything.

       UI.confirm({ title, message, icon, danger, actions: [{ label, value,
       kind: 'primary' | 'danger' | '' }], cancel: 'Cancel' })
       resolves to the chosen action's value, or null when dismissed. */
    confirm: function (opts) {
      var overlay = U.qs('#confirmOverlay');
      if (!overlay) return Promise.resolve(window.confirm(opts.message || opts.title) ? (opts.actions[0].value) : null);
      if (UI._confirmDone) UI._confirmDone(null);

      U.qs('#confirmTitle').textContent = opts.title || '';
      U.qs('#confirmText').innerHTML = opts.messageHTML || U.esc(opts.message || '');
      var ic = U.qs('#confirmIcon');
      ic.className = 'dialog-ic' + (opts.danger ? ' danger' : '');
      ic.innerHTML = '<svg class="ico"><use href="#i-' + (opts.icon || (opts.danger ? 'alert' : 'check')) + '"/></svg>';

      var actions = (opts.actions || []).slice();
      actions.push({ label: opts.cancel || 'Cancel', value: null, kind: '' });
      U.qs('#confirmActions').innerHTML = actions.map(function (a, i) {
        var cls = 'btn' + (a.kind === 'primary' ? ' primary' : a.kind === 'danger' ? ' danger' : '');
        return '<button class="' + cls + '" type="button" data-choice="' + i + '">' + U.esc(a.label) + '</button>';
      }).join('');

      return new Promise(function (resolve) {
        var settled = false;
        function done(value) {
          if (settled) return;
          settled = true;
          UI._confirmDone = null;
          overlay.removeEventListener('click', onClick);
          overlay.onclosed = null;
          UI.closeSheet(overlay);
          resolve(value);
        }
        function onClick(ev) {
          var b = ev.target.closest('[data-choice]');
          if (b) { done(actions[Number(b.dataset.choice)].value); return; }
          if (ev.target.closest('[data-close]')) done(null);
        }
        UI._confirmDone = done;
        overlay.addEventListener('click', onClick);
        /* closed some other way (Escape, the Android back button) */
        overlay.onclosed = function () { done(null); };
        UI.openSheet(overlay);
        /* a destructive question starts on the dialog itself, so a stray
           Enter cannot confirm it; otherwise on the primary answer */
        requestAnimationFrame(function () {
          var target = opts.danger ? U.qs('#confirmDialog') : U.qs('#confirmActions .btn');
          if (target) target.focus({ preventScroll: true });
        });
      });
    },

    /* ── formatting ─────────────────────────────────────── */
    countText: function (n) { return String(n); },

    plural: function (n, one, many) { return U.plural(n, one, many); },

    /* avg taps/day, with sensible precision */
    rateText: function (rate) {
      if (!rate) return '0/day';
      if (rate >= 10) return Math.round(rate) + '/day';
      if (rate >= 1) return rate.toFixed(1).replace(/\.0$/, '') + '/day';
      return rate.toFixed(2) + '/day';
    },

    /* first visible character of a name, emoji included */
    initial: function (name) {
      var ch = Array.from(String(name || '?').trim())[0] || '?';
      return ch.toLocaleUpperCase();
    },

    /* ── per-event colour ───────────────────────────────────
       Tonal shades of an event colour for the current theme, as inline
       custom properties. Cached per colour and theme; app.js clears the
       cache when the theme changes. */
    isDark: function () { return document.documentElement.getAttribute('data-theme') === 'dark'; },

    tone: function (color) {
      var dark = UI.isDark();
      var key = color + (dark ? '/d' : '/l');
      if (UI._tones[key]) return UI._tones[key];
      var surface = dark ? V.SURFACE.dark : V.SURFACE.light;
      var c = C.rgb(color) ? color : V.COLORS[0];
      if (dark) c = C.readable(c, surface, 3);          // slate on near-black: lift it
      var soft = C.mix(surface, c, dark ? 0.2 : 0.12);
      /* the fills are translucent, so the glass under them shows through;
         text contrast is still measured against the equivalent solid tint */
      var t = {
        c: c,
        soft: C.rgba(c, dark ? 0.2 : 0.13),
        soft2: C.rgba(c, dark ? 0.29 : 0.2),
        softer: C.rgba(c, dark ? 0.13 : 0.09),
        text: C.readable(c, soft, 4.5),
        ink: C.onColor(c)
      };
      UI._tones[key] = t;
      return t;
    },

    toneStyle: function (color) {
      var t = UI.tone(color);
      return '--c:' + t.c + ';--c-soft:' + t.soft + ';--c-soft-2:' + t.soft2 +
             ';--c-softer:' + t.softer + ';--c-text:' + t.text + ';--c-ink:' + t.ink;
    },

    /* ── the event card ─────────────────────────────────── */
    sparkHTML: function (e) {
      var days = S.recentFor(e, 7);
      var max = Math.max.apply(null, days.map(function (d) { return d.n; }).concat([1]));
      var last = days.length - 1;
      return days.map(function (d, i) {
        var h = d.n ? Math.max(18, Math.round(d.n / max * 100)) : 9;
        var cls = (d.n ? 'on' : '') + (i === last && d.n ? ' today' : '');
        return '<i class="' + cls.trim() + '" style="--h:' + h + '%" title="' +
          U.esc(D.fmtDay(d.iso)) + ': ' + d.n + ' ' + U.plural(d.n, 'tap') + '"></i>';
      }).join('');
    },

    factsHTML: function (e) {
      var first = S.first(e);
      var startDay = D.parseISO(e.start);
      var runningFor = startDay ? D.diffDays(startDay, D.today()) + 1 : 0;
      var facts = [
        fact('Average', UI.rateText(S.perDay(e)), !e.log.length),
        fact('Tracking', runningFor > 0 ? runningFor + ' ' + U.plural(runningFor, 'day') : 'starts ' + D.fmtDay(e.start), runningFor <= 0),
        fact('First tap', first ? shortDay(first) : 'not yet', !first)
      ];
      return facts.join('');

      function fact(label, value, muted) {
        return '<div class="ev-fact' + (muted ? ' is-muted' : '') + '"><span>' + U.esc(label) +
          '</span><b>' + U.esc(value) + '</b></div>';
      }
    },

    cardHTML: function (e, index, cls) {
      var count = S.count(e);
      var id = U.esc(e.id);
      var name = U.esc(e.name);
      return [
        '<article class="ev', cls ? ' ' + cls : '', '" data-id="', id, '" style="', UI.toneStyle(e.color), ';--i:', index, '">',
          '<div class="ev-top">',
            '<span class="ev-chip" aria-hidden="true">', U.esc(UI.initial(e.name)), '</span>',
            '<span class="ev-name" title="', name, '">', name, '</span>',
            '<button class="ev-menu" type="button" data-edit="', id, '" aria-label="Edit ', name, '">',
              '<svg class="ico fill" aria-hidden="true"><use href="#i-more"/></svg>',
            '</button>',
          '</div>',
          '<div class="ev-mid">',
            '<div class="ev-count" aria-live="polite" aria-atomic="true"><b data-count="', id, '">', count, '</b><span>',
              UI.plural(count, 'tap', 'taps'), '</span></div>',
            '<div class="ev-spark" data-spark="', id, '" aria-hidden="true">', UI.sparkHTML(e), '</div>',
          '</div>',
          '<div class="ev-facts" data-facts="', id, '">', UI.factsHTML(e), '</div>',
          '<div class="ev-foot">',
            '<button class="tap-btn" type="button" data-tap="', id, '" aria-label="Log one tap for ', name, '">',
              '<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg>',
              '<span>Tap to count</span>',
            '</button>',
            '<div class="ev-last" data-last="', id, '">', UI.lastLine(S.last(e)), '</div>',
          '</div>',
        '</article>'
      ].join('');
    },

    lastLine: function (last) {
      if (!last) return '<span>Nothing logged yet — tap the button to start</span>';
      return '<span>Last: <b>' + U.esc(D.fmtRelative(last)) + '</b> · ' +
        U.esc(D.fmtDay(D.dayKey(last))) + ' at ' + U.esc(D.fmtTime(last)) + '</span>';
    },

    /* opts.animate: stagger the cards in (first paint, entering the view);
       opts.fresh: the id of a card that has just been created */
    renderCards: function (container, events, opts) {
      opts = opts || {};
      if (!events.length) { container.innerHTML = ''; return false; }
      container.innerHTML = events.map(function (e, i) {
        var cls = e.id === opts.fresh ? 'is-new' : (opts.animate ? 'enter' : '');
        return UI.cardHTML(e, Math.min(i, 8), cls);
      }).join('');
      return true;
    },

    /* ── colour picker state (the form owns the swatch markup) ── */
    setActiveSwatch: function (color) {
      V.app.selectedColor = color;
      U.qsa('#fColor .swatch').forEach(function (b) {
        var on = b.dataset.color === color;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    },

    /* ── one-day entry list ─────────────────────────────── */
    /* a busy day shows its newest taps and a "show all" control, so the
       add-a-tap chips and the year strip are not pushed off the screen */
    DAY_LIMIT: 6,

    dayPanelHTML: function (iso, timeValue, expanded) {
      var entries = S.entriesOnDay(iso);
      var total = entries.length;
      var showAll = expanded || total <= UI.DAY_LIMIT + 2;
      var visible = showAll ? entries : entries.slice(0, UI.DAY_LIMIT);
      var todayISO = D.toISO(D.today());
      var isFuture = iso > todayISO;
      var head = [
        '<div class="day-head">',
          '<h3>', U.esc(D.fmtDayLong(iso)), '</h3>',
          '<span class="day-total">', total, ' ', UI.plural(total, 'tap'), '</span>',
        '</div>'
      ];

      var body;
      if (!total) {
        body = '<div class="day-empty"><svg class="ico" aria-hidden="true"><use href="#i-calendar"/></svg>' +
          'No taps on this day.</div>';
      } else {
        body = '<div class="day-list">' + visible.map(function (row, i) {
          var e = row.event;
          return '<div class="day-row" style="--c:' + U.esc(UI.tone(e.color).c) + ';--i:' + Math.min(i, 12) + '">' +
            '<span class="dot" aria-hidden="true"></span>' +
            '<span class="name">' + U.esc(e.name) + '</span>' +
            '<time datetime="' + U.esc(new Date(row.ts).toISOString()) + '">' + U.esc(D.fmtTime(row.ts)) + '</time>' +
            '<button class="del-btn" type="button" data-untap="' + U.esc(e.id) + '" data-ts="' + row.ts +
              '" aria-label="Remove the ' + U.esc(D.fmtTime(row.ts)) + ' tap for ' + U.esc(e.name) + '">' +
              '<svg class="ico" aria-hidden="true"><use href="#i-x"/></svg>' +
            '</button>' +
          '</div>';
        }).join('') + '</div>' +
        (showAll ? '' : '<button class="day-more" type="button" data-more="1">Show all ' + total + ' taps' +
          '<svg class="ico" aria-hidden="true"><use href="#i-down"/></svg></button>');
      }

      /* Adding: one chip per event, so a past tap lands on the event you
         mean (it used to go to whichever card sorted first), at the time
         shown (it used to say "at 16:37" and log 12:00). Nothing can be
         logged on a day that has not happened yet. */
      var addRow = '';
      if (S.events.length && isFuture) {
        addRow = '<div class="day-note">This day is still ahead — taps can be added once it arrives.</div>';
      } else if (S.events.length) {
        var isToday = iso === todayISO;
        var time = timeValue || (D.fmtTime(Date.now()));
        addRow = '<div class="day-add">' +
          '<div class="day-add-head"><span>' + (isToday ? 'Log a tap now for' : 'Add a tap on this day at') + '</span>' +
            (isToday ? '' : '<input class="time-input" id="dayTime" type="time" value="' + U.esc(time) + '" aria-label="Time of the tap">') +
          '</div>' +
          '<div class="chip-row">' + S.events.slice().sort(function (a, b) {
            return a.name.localeCompare(b.name, 'en');
          }).map(function (e) {
            return '<button class="chip" type="button" data-addon="' + U.esc(iso) + '" data-event="' + U.esc(e.id) +
              '" style="' + UI.toneStyle(e.color) + '" aria-label="' + (isToday ? 'Log a tap now for ' : 'Add a tap on ' + U.esc(D.fmtDay(iso)) + ' for ') + U.esc(e.name) + '">' +
              '<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg><span>' + U.esc(e.name) + '</span></button>';
          }).join('') + '</div>' +
        '</div>';
      }

      return head.join('') + body + addRow;
    }
  };

  /* "19 Aug", with the year only when it is not this year */
  function shortDay(ts) {
    var d = new Date(ts);
    var s = d.getDate() + ' ' + D.MONTHS[d.getMonth()];
    return d.getFullYear() === new Date().getFullYear() ? s : s + ' ' + d.getFullYear();
  }

})(window.V);
