/* ============================================================
   Virulenter · app.js — bootstrap, routing, interaction wiring.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store, UI = V.ui, Views = V.views,
      Stats = V.stats, Codec = V.codec, C = V.color;

  var COLOR_NAMES = ['Blue', 'Teal', 'Orange', 'Red', 'Violet', 'Green', 'Magenta', 'Slate'];
  var THEME_LABELS = { system: 'Auto theme', light: 'Light theme', dark: 'Dark theme' };

  var App = {
    view: 'home',
    editingId: null,
    sortOrder: ['recent', 'name', 'count', 'oldest'],
    selectedColor: null,
    installEvent: null,
    resolvedTheme: null,

    /* ══════════ start ══════════ */
    start: function () {
      App.formOverlay = U.qs('#formOverlay');
      App.dataOverlay = U.qs('#dataOverlay');
      App.lookOverlay = U.qs('#lookOverlay');
      App.jumpOverlay = U.qs('#jumpOverlay');
      App.confirmOverlay = U.qs('#confirmOverlay');

      S.load();
      Views.init();
      Stats.init();
      /* before the first render: card tints depend on the resolved theme */
      App.applyLook(S.look);
      App.bindAll();

      Views.renderSort();
      /* the manifest shortcuts deep-link with #view=… */
      var deep = /(?:^|[#&?])view=([a-z]+)/.exec(location.hash || '');
      var startView = deep && ['home', 'calendar', 'stats'].indexOf(deep[1]) >= 0 ? deep[1] : 'home';
      App.view = startView;
      Views.toggleTab(startView);
      Views.renderHome({ animate: true });
      UI.setActiveSwatch(S.events.length ? S.events[0].color : V.COLORS[0]);

      /* Normalise the address bar once, so the link in the bar is always the
         canonical shareable one. Store.syncUrl() does not run again until the
         user actually changes something. */
      if (S.events.length) S.syncUrl();

      App.watchTheme();
      App.watchScroll();
      App.startClock();
      App.initInstall();
      App.initServiceWorker();

      App.ready = true;
      document.documentElement.classList.add('ready');
    },

    /* ══════════ routing ══════════ */
    bindAll: function () {
      U.qsa('.tab').forEach(function (t) {
        t.addEventListener('click', function () {
          var v = t.dataset.view;
          if (v === 'settings') { App.openDataSheet(); return; }
          if (v === App.view) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
          Views.toggleTab(v);
        });
      });
      U.qs('#btnAddTop').addEventListener('click', function () { App.openForm(null); });
      U.qs('#btnAddEmpty').addEventListener('click', function () { App.openForm(null); });
      U.qs('#notice').addEventListener('click', function (ev) {
        if (ev.target.closest('[data-notice-close]')) Views.dismissNotice();
      });

      /* events list */
      var list = U.qs('#eventList');
      list.addEventListener('pointerdown', function (ev) {
        var tap = ev.target.closest('[data-tap]');
        if (tap) App.ripple(tap, ev);
      });
      list.addEventListener('click', function (ev) {
        var tap = ev.target.closest('[data-tap]');
        if (tap) { App.handleTap(tap, ev); return; }
        var edit = ev.target.closest('[data-edit]');
        if (edit) { App.openForm(edit.dataset.edit); return; }
      });

      var search = U.qs('#searchInput');
      search.addEventListener('input', U.throttle(function () {
        S.query = search.value;
        U.qs('#searchClear').hidden = !search.value;
        Views.renderHome();
      }, 120));
      U.qs('#searchClear').addEventListener('click', function () {
        search.value = ''; S.query = ''; this.hidden = true;
        Views.renderHome(); search.focus();
      });
      U.qs('#btnSort').addEventListener('click', function () {
        var i = App.sortOrder.indexOf(S.sort);
        S.sort = App.sortOrder[(i + 1) % App.sortOrder.length];
        Views.renderSort(true);
        Views.renderHome({ animate: true });
      });

      App.bindCalendar();
      App.bindJump();

      /* sheets (the confirmation dialog wires its own buttons) */
      [App.formOverlay, App.dataOverlay, App.lookOverlay, App.jumpOverlay].forEach(UI.bindSheetClose);
      App.dataOverlay.onclosed = function () { Views.markTab(App.view); };
      document.addEventListener('keydown', App.onKey);

      App.bindForm();
      App.bindLook();
      App.bindDataSheet();
    },

    /* Escape closes the sheet on top; Tab stays inside it */
    onKey: function (ev) {
      var top = UI.topOverlay();
      if (!top) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        UI.closeSheet(top);
        return;
      }
      if (ev.key !== 'Tab') return;
      var panel = top.querySelector('.sheet, .dialog');
      var items = U.qsa('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])', panel)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      var at = document.activeElement;
      if (ev.shiftKey && (at === first || at === panel || !panel.contains(at))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (at === last || !panel.contains(at))) { ev.preventDefault(); first.focus(); }
    },

    /* ══════════ calendar ══════════ */
    bindCalendar: function () {
      U.qs('#calPrev').addEventListener('click', function () { Views.shiftMonth(-1); });
      U.qs('#calNext').addEventListener('click', function () { Views.shiftMonth(1); });
      U.qs('#calPrevYear').addEventListener('click', function () { Views.shiftYear(-1); });
      U.qs('#calNextYear').addEventListener('click', function () { Views.shiftYear(1); });
      U.qs('#calToday').addEventListener('click', function () { Views.goToday(); });
      U.qs('#calTitle').addEventListener('click', function () { App.openJump(); });

      /* swipe the month grid sideways to change month */
      var grid = U.qs('#calGrid');
      var swipe = null, swiped = false;
      grid.addEventListener('pointerdown', function (ev) {
        swiped = false;
        swipe = ev.pointerType === 'mouse' ? null : { x: ev.clientX, y: ev.clientY, t: Date.now() };
      });
      grid.addEventListener('pointerup', function (ev) {
        if (!swipe) return;
        var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipe.t < 700) {
          swiped = true;
          Views.shiftMonth(dx < 0 ? 1 : -1);
        }
        swipe = null;
      });
      grid.addEventListener('pointercancel', function () { swipe = null; });
      grid.addEventListener('click', function (ev) {
        if (swiped) { swiped = false; return; }
        var cell = ev.target.closest('.cal-cell');
        if (cell) Views.setSelectedDay(cell.dataset.date);
      });

      /* the year strip jumps the calendar to the day you pick */
      U.qs('#calYearGrid').addEventListener('click', function (ev) {
        var hc = ev.target.closest('.hc[data-date]');
        if (!hc) return;
        var d = D.parseISO(hc.dataset.date);
        if (!d) return;
        Views.goTo(d.getFullYear(), d.getMonth(), hc.dataset.date);
        var card = U.qs('.cal-card');
        if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      /* …and so does the statistics heat grid, switching views */
      U.qs('#statHeat').addEventListener('click', function (ev) {
        var hc = ev.target.closest('.hc[data-date]');
        if (!hc) return;
        var d = D.parseISO(hc.dataset.date);
        if (!d) return;
        Views.cal.y = d.getFullYear();
        Views.cal.m = d.getMonth();
        Views.cal.sel = hc.dataset.date;
        Views.scrollMem.calendar = 0;
        Views.toggleTab('calendar');
      });

      var panel = U.qs('#dayPanel');
      panel.addEventListener('click', function (ev) {
        var del = ev.target.closest('[data-untap]');
        if (del) { App.removeTap(del.dataset.untap, Number(del.dataset.ts)); return; }
        var add = ev.target.closest('[data-addon]');
        if (add) { App.addOnDay(add.dataset.addon, add.dataset.event); return; }
        if (ev.target.closest('[data-more]')) Views.expandDay();
      });
      panel.addEventListener('input', function (ev) {
        if (ev.target.id === 'dayTime') Views.dayTime = ev.target.value;
      });
    },

    /* ══════════ month / year jump picker ══════════ */
    bindJump: function () {
      U.qs('#jumpPrevYear').addEventListener('click', function () { App.jumpYear -= 1; App.renderJump(); });
      U.qs('#jumpNextYear').addEventListener('click', function () { App.jumpYear += 1; App.renderJump(); });
      U.qs('#jumpToday').addEventListener('click', function () {
        UI.closeSheet(App.jumpOverlay);
        Views.goToday();
      });
      U.qs('#jumpMonths').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-month]');
        if (!b) return;
        UI.closeSheet(App.jumpOverlay);
        Views.goTo(App.jumpYear, Number(b.dataset.month));
      });
      U.qs('#jumpYearList').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-year]');
        if (!b) return;
        App.jumpYear = Number(b.dataset.year);
        App.renderJump();
      });
    },

    openJump: function () {
      App.jumpYear = Views.cal.y;
      App.renderJump();
      UI.openSheet(App.jumpOverlay);
    },

    renderJump: function () {
      var y = App.jumpYear;
      U.qs('#jumpYearLabel').textContent = y;
      var months = S.byMonth(y);
      var max = Math.max.apply(null, months.concat([1]));
      U.qs('#jumpMonths').innerHTML = D.MONTHS_LONG.map(function (name, i) {
        var n = months[i];
        var on = (y === Views.cal.y && i === Views.cal.m);
        return '<button class="jump-month' + (on ? ' is-on' : '') + '" type="button" data-month="' + i + '"' +
          ' aria-label="' + name + ' ' + y + (n ? ', ' + n + ' ' + U.plural(n, 'tap') : '') + '">' +
          '<span>' + name + '</span>' + (n ? '<span class="mbadge">' + n + '</span>' : '') +
          '<span class="mbar"><i style="--w:' + Math.round(n / max * 100) + '%"></i></span></button>';
      }).join('');

      /* years that actually contain taps, newest first; falling back to the
         current year when there is no data yet */
      var withData = S.years().filter(function (yy) {
        return S.byMonth(yy).some(function (n) { return n > 0; });
      });
      if (!withData.length) withData = [new Date().getFullYear()];
      U.qs('#jumpYearList').innerHTML = withData.map(function (yy) {
        var total = S.byMonth(yy).reduce(function (a, b) { return a + b; }, 0);
        return '<button type="button" data-year="' + yy + '"' + (yy === y ? ' class="is-on"' : '') + '>' +
          yy + (total ? ' · ' + total : '') + '</button>';
      }).join('');
    },

    /* ══════════ the core action ══════════ */
    buzz: function () {
      if (App._noVibrate) return;
      var nav = navigator;
      if (typeof nav.vibrate !== 'function') return;
      if (nav.userActivation && nav.userActivation.isActive === false) return;
      try {
        var r = nav.vibrate(12);
        if (r === false) App._noVibrate = true;
      } catch (e) { App._noVibrate = true; }
    },

    /* ink spreading from the finger, on press rather than release */
    ripple: function (btn, ev) {
      var r = btn.getBoundingClientRect();
      var size = Math.hypot(r.width, r.height) * 2;
      var x = (ev && ev.clientX ? ev.clientX - r.left : r.width / 2) - size / 2;
      var y = (ev && ev.clientY ? ev.clientY - r.top : r.height / 2) - size / 2;
      var s = U.el('span', 'ripple');
      s.style.width = s.style.height = size + 'px';
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      btn.appendChild(s);
      var gone = function () { s.remove(); };
      s.addEventListener('animationend', gone);
      setTimeout(gone, 900);
    },

    /* a "+1" that rises from where the button was pressed */
    plusOne: function (btn, ev) {
      var foot = btn.parentElement;
      var fr = foot.getBoundingClientRect();
      var x = ev && ev.clientX ? ev.clientX - fr.left : btn.offsetWidth / 2;
      var s = U.el('span', 'plus-one', '+1');
      s.setAttribute('aria-hidden', 'true');
      s.style.left = Math.round(Math.max(16, Math.min(fr.width - 16, x))) + 'px';
      foot.appendChild(s);
      var gone = function () { s.remove(); };
      s.addEventListener('animationend', gone);
      setTimeout(gone, 1200);
    },

    handleTap: function (btn, ev) {
      var id = btn.dataset.tap;
      var e = S.get(id);
      if (!e) return;
      var ts = S.logTap(id);
      if (!ts) return;

      App.buzz();
      App.persist();

      /* update in place — no full re-render, so the button keeps focus and
         the list order does not jump under the finger */
      Views.updateCard(e);
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
      App.plusOne(btn, ev);

      Views.renderStats(S.stats(), true);
      Views.renderBrandSub();

      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
    },

    /* everything that shows the log, after the log changed */
    refreshLog: function () {
      Views.renderHome();
      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
    },

    removeTap: function (id, ts) {
      var e = S.get(id);
      if (!e || !S.removeEntry(id, ts)) return;
      App.persist();
      App.refreshLog();
      U.toast('Tap removed', {
        action: 'Undo',
        onAction: function () {
          if (!S.get(id)) return;
          S.logTap(id, ts);
          App.persist();
          App.refreshLog();
        }
      });
    },

    addOnDay: function (iso, eventId) {
      var e = S.get(eventId) || S.events[0];
      if (!e) { U.toast('Create an event first'); return; }
      var ts = App.timestampForDay(iso, Views.dayTime);
      if (ts === null) { U.toast('That day has not happened yet'); return; }
      S.logTap(e.id, ts);
      App.persist();
      App.refreshLog();
      var today = iso === D.toISO(D.today());
      U.toast(today ? 'Logged “' + e.name + '”' : 'Logged “' + e.name + '” on ' + D.fmtDay(iso) + ' at ' + D.fmtTime(ts), {
        action: 'Undo',
        onAction: function () {
          if (!S.removeEntry(e.id, ts)) return;
          App.persist();
          App.refreshLog();
        }
      });
    },

    /* Today: now. A past day: the time shown in the panel (default: the
       current time of day), so the button does what it says. A future day:
       null — there is nothing to log yet. */
    timestampForDay: function (iso, hhmm) {
      var now = new Date();
      var todayISO = D.toISO(now);
      if (iso === todayISO) return now.getTime();
      if (iso > todayISO) return null;
      var d = D.parseISO(iso);
      if (!d) return now.getTime();
      var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
      d.setHours(m ? Math.min(23, +m[1]) : now.getHours(), m ? Math.min(59, +m[2]) : now.getMinutes(), 0, 0);
      return d.getTime();
    },

    persist: function () {
      var ok = S.syncUrl();
      if (!ok && S.events.length) Views.renderNotice();
      return ok;
    },

    /* ══════════ appearance ══════════ */
    systemDark: function () {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },

    /* Resolve the theme, then derive every accent-dependent token for it.
       Tints are mixed against the active theme's surface, so a custom
       colour carries through the calendar and heat grids in both themes. */
    applyLook: function (look) {
      look = look || S.look || V.DEFAULTS;
      var mode = look.theme || 'system';
      var dark = mode === 'dark' || (mode === 'system' && App.systemDark());
      var resolved = dark ? 'dark' : 'light';
      var themeChanged = App.resolvedTheme !== null && App.resolvedTheme !== resolved;
      App.resolvedTheme = resolved;

      var root = document.documentElement;
      root.setAttribute('data-theme', resolved);
      root.style.colorScheme = resolved;

      var t = Codec.accentTints(Codec.accentValue(look), dark);
      var st = root.style;
      st.setProperty('--accent', t.value);
      st.setProperty('--accent-ink', t.ink);
      st.setProperty('--accent-soft', t.soft);
      st.setProperty('--accent-hover', t.hover);
      st.setProperty('--accent-text', t.text);
      st.setProperty('--accent-light', t.light);
      st.setProperty('--accent-shadow', C.rgba(t.value, dark ? 0.55 : 0.42));
      st.setProperty('--glow', C.rgba(t.value, dark ? 0.16 : 0.1));
      st.setProperty('--font', Codec.fontStack(look.font));

      /* heat ramp: from the empty cell's shade up to the accent */
      var from = dark ? '#20242c' : '#ffffff';
      [0.28, 0.52, 0.76, 1].forEach(function (k, i) {
        var c = k === 1 ? t.value : C.mix(from, t.value, k);
        st.setProperty('--lv' + (i + 1), c);
        st.setProperty('--lv' + (i + 1) + '-ink', C.onColor(c));
      });

      if (look.custom) st.setProperty('--custom-accent', look.custom);
      else st.removeProperty('--custom-accent');

      var meta = U.qs('#metaTheme');
      if (meta) meta.setAttribute('content', dark ? '#0b0d12' : '#f4f5f8');

      UI._tones = {};
      if (themeChanged && App.ready) Views.renderAll(App.view);
    },

    /* follow the device when the theme is "system" */
    watchTheme: function () {
      if (!window.matchMedia) return;
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if ((S.look.theme || 'system') === 'system') App.applyLook(S.look);
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    },

    lookSummary: function () {
      var look = S.look;
      var accent = look.custom ? 'Custom ' + look.custom
        : ((V.ACCENTS.filter(function (a) { return a.id === look.accent; })[0] || V.ACCENTS[0]).label);
      var font = (V.FONTS.filter(function (f) { return f.id === look.font; })[0] || V.FONTS[0]).label;
      return accent + ' · ' + font + ' font · ' + THEME_LABELS[look.theme || 'system'];
    },

    bindLook: function () {
      U.qs('#lookTheme').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-mode]');
        if (!b) return;
        S.setTheme(b.dataset.mode);
        App.lookChanged();
      });

      var wrap = U.qs('#lookAccent');
      wrap.innerHTML = V.ACCENTS.map(function (a) {
        var light = C.onColor(a.value) !== '#ffffff';
        return '<button class="swatch' + (light ? ' light' : '') + '" type="button" role="radio" aria-checked="false" data-accent="' + a.id +
          '" style="--c:' + a.value + '" aria-label="' + U.esc(a.label) + '" title="' + U.esc(a.label) + '"></button>';
      }).join('');
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-accent]');
        if (!b) return;
        S.setAccent(b.dataset.accent);
        App.lookChanged();
      });

      var custom = U.qs('#lookCustom');
      var hex = U.qs('#lookCustomHex');
      custom.addEventListener('input', function () {
        hex.value = custom.value;
        S.setCustomAccent(custom.value);
        App.lookChanged();
      });
      U.qs('#lookCustomApply').addEventListener('click', function () {
        var v = hex.value.trim();
        if (!/^#?[0-9a-f]{6}$/i.test(v)) { U.toast('Enter six hex digits, e.g. #2f6bff'); return; }
        v = v[0] === '#' ? v : '#' + v;
        custom.value = v;
        S.setCustomAccent(v);
        App.lookChanged();
        U.toast('Accent applied');
      });
      hex.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); U.qs('#lookCustomApply').click(); }
      });

      var fonts = U.qs('#lookFont');
      fonts.innerHTML = V.FONTS.map(function (f) {
        return '<button class="font-opt" type="button" role="radio" aria-checked="false" data-font="' + f.id + '">' +
          '<span><span class="fo-name" style="font-family:' + f.stack.replace(/"/g, '&quot;') + '">' +
            U.esc(f.label) + '</span><br><span class="fo-meta">' + U.esc(firstFamily(f.stack)) + '</span></span>' +
          '<span class="fo-check" aria-hidden="true"><svg class="ico"><use href="#i-check"/></svg></span>' +
        '</button>';
      }).join('');
      fonts.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-font]');
        if (!b) return;
        S.setFont(b.dataset.font);
        App.lookChanged();
      });

      U.qs('#lookReset').addEventListener('click', function () {
        S.resetLook();
        App.lookChanged();
        U.toast('Appearance reset');
      });
    },

    lookChanged: function () {
      App.applyLook(S.look);
      App.renderLook();
      App.persist();
    },

    renderLook: function () {
      var look = S.look;
      var mode = look.theme || 'system';
      U.qsa('#lookTheme [data-mode]').forEach(function (b) {
        var on = b.dataset.mode === mode;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      U.qsa('#lookAccent .swatch').forEach(function (b) {
        var on = !look.custom && b.dataset.accent === look.accent;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      U.qs('#lookCustom').value = look.custom || Codec.accentValue(look);
      U.qs('#lookCustomHex').value = look.custom || '';
      U.qsa('#lookFont .font-opt').forEach(function (b) {
        var on = b.dataset.font === look.font;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      U.qs('#lookReset').disabled = S.isDefaultLook(look);
      U.qs('#lookSummary').textContent = App.lookSummary();
    },

    openLook: function () {
      App.renderLook();
      UI.openSheet(App.lookOverlay);
    },

    /* ══════════ new / edit event ══════════ */
    bindForm: function () {
      var wrap = U.qs('#fColor');
      wrap.innerHTML = V.COLORS.map(function (c, i) {
        return '<button class="swatch" type="button" role="radio" aria-checked="false" data-color="' + c +
          '" style="--c:' + c + '" aria-label="' + (COLOR_NAMES[i] || c) + '" title="' + (COLOR_NAMES[i] || c) + '"></button>';
      }).join('');
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('.swatch');
        if (!b) return;
        UI.setActiveSwatch(b.dataset.color);
        App.renderFormPreview();
      });
      U.qs('#fName').addEventListener('input', App.renderFormPreview);

      U.qs('#eventForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        App.submitForm();
      });
      U.qs('#btnLogNow').addEventListener('click', function () {
        var e = App.editingId && S.get(App.editingId);
        if (!e) return;
        S.logTap(e.id);
        App.persist();
        App.refreshFormLog();
        App.refreshLog();
        U.toast('Logged “' + e.name + '”');
      });
      U.qs('#btnClearLog').addEventListener('click', function () {
        var e = App.editingId && S.get(App.editingId);
        if (!e || !e.log.length) { U.toast('Nothing to clear'); return; }
        var saved = e.log.slice();
        UI.confirm({
          title: 'Clear all taps?',
          messageHTML: 'All <b>' + saved.length + '</b> ' + U.plural(saved.length, 'tap') + ' recorded for “' +
            U.esc(e.name) + '” will be removed. The event itself stays.',
          danger: true,
          icon: 'trash',
          actions: [{ label: 'Clear ' + saved.length + ' ' + U.plural(saved.length, 'tap'), value: 'clear', kind: 'danger' }]
        }).then(function (choice) {
          if (choice !== 'clear' || !S.get(e.id)) return;
          S.clearLog(e.id);
          App.persist();
          App.refreshFormLog();
          App.refreshLog();
          U.toast('All taps cleared', {
            action: 'Undo',
            onAction: function () {
              var cur = S.get(e.id);
              if (!cur) return;
              var seen = {};
              cur.log = saved.concat(cur.log).filter(function (t) { return seen[t] ? false : (seen[t] = true); })
                .sort(function (a, b) { return a - b; });
              S.dirty = true;
              App.persist();
              App.refreshFormLog();
              App.refreshLog();
            }
          });
        });
      });
      U.qs('#btnDeleteEvent').addEventListener('click', function () {
        var e = App.editingId && S.get(App.editingId);
        if (e) App.confirmDelete(e);
      });
    },

    renderFormPreview: function () {
      var name = U.qs('#fName').value.trim() || (App.editingId ? 'Untitled' : 'New event');
      U.qs('#formPreview').setAttribute('style', UI.toneStyle(App.selectedColor || V.COLORS[0]));
      U.qs('#formChip').textContent = UI.initial(name);
      U.qs('#formPreviewName').textContent = name;
    },

    refreshFormLog: function () {
      var e = App.editingId ? S.get(App.editingId) : null;
      U.qs('#logCount').textContent = e ? e.log.length : 0;
    },

    openForm: function (id) {
      var e = id ? S.get(id) : null;
      App.editingId = e ? e.id : null;
      U.qs('#formTitle').textContent = e ? 'Edit event' : 'New event';
      U.qs('#fName').value = e ? e.name : '';
      U.qs('#fStart').value = e ? e.start : D.toISO(D.today());
      UI.setActiveSwatch(e ? e.color : V.COLORS[S.events.length % V.COLORS.length]);
      U.qs('#rowLog').hidden = !e;
      U.qs('#rowDelete').hidden = !e;
      App.refreshFormLog();
      App.renderFormPreview();
      UI.openSheet(App.formOverlay);
      if (!e) setTimeout(function () { U.qs('#fName').focus({ preventScroll: true }); }, 260);
    },

    submitForm: function () {
      var name = U.qs('#fName').value.trim();
      var start = U.qs('#fStart').value;
      if (!name) { U.toast('Give the event a name'); U.qs('#fName').focus(); return; }
      if (!D.parseISO(start)) { U.toast('Pick a valid start date'); return; }
      if (start < V.MIN_START) { U.toast('Pick a start date in 2020 or later'); return; }

      var wasEditing = !!App.editingId;
      var data = { name: name, color: App.selectedColor || V.COLORS[0], start: start };
      var e = wasEditing ? S.update(App.editingId, data) : S.create(data);
      if (!e) { U.toast('Could not save'); return; }

      App.persist();
      App.editingId = null;
      UI.closeSheet(App.formOverlay);
      if (!wasEditing && App.view !== 'home') Views.toggleTab('home');
      Views.renderHome(wasEditing ? {} : { fresh: e.id });
      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
      if (!wasEditing) {
        var card = U.qs('.ev' + Views.sel('data-id', e.id));
        if (card) setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
      }
      U.toast(wasEditing ? 'Saved' : '“' + e.name + '” created — tap its button to log');
    },

    confirmDelete: function (e) {
      var n = e.log.length;
      UI.confirm({
        title: 'Delete “' + e.name + '”?',
        messageHTML: n
          ? 'The event and its <b>' + n + '</b> recorded ' + U.plural(n, 'tap') + ' will be deleted.'
          : 'The event will be deleted. It has no taps yet.',
        danger: true,
        icon: 'trash',
        actions: [{ label: 'Delete event', value: 'delete', kind: 'danger' }]
      }).then(function (choice) {
        if (choice !== 'delete') return;
        var index = S.events.indexOf(e);
        if (index < 0 || !S.remove(e.id)) return;
        App.persist();
        UI.closeSheet(App.formOverlay);
        App.editingId = null;
        App.refreshLog();
        U.toast('Deleted “' + e.name + '”', {
          action: 'Undo',
          onAction: function () {
            if (S.get(e.id)) return;
            S.events.splice(Math.min(index, S.events.length), 0, e);
            S.dirty = true;
            App.persist();
            App.refreshLog();
          }
        });
      });
    },

    /* ══════════ install (PWA) ══════════ */
    isInstalled: function () {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             window.navigator.standalone === true;
    },

    initInstall: function () {
      var row = U.qs('#installRow');
      var hint = U.qs('#installHint');
      var label = U.qs('#installLabel');
      var btnRow = U.qs('#btnInstallRow');

      if (App.isInstalled()) { row.hidden = true; return; }

      window.addEventListener('beforeinstallprompt', function (ev) {
        ev.preventDefault();
        App.installEvent = ev;
        U.qs('#btnInstall').hidden = false;
        label.textContent = 'Install as an app';
        hint.textContent = 'Adds Virulenter to your home screen and runs it offline.';
      });

      window.addEventListener('appinstalled', function () {
        App.installEvent = null;
        U.qs('#btnInstall').hidden = true;
        row.hidden = true;
        U.toast('Installed');
      });

      /* Phrase the hint for the context we are really in.

         Adding to the home screen and getting an offline app are two different
         things: a browser will only register a service worker (offline) on a
         secure origin, but iOS will still create a home-screen icon from a
         plain-http or LAN address. Claiming "install is unavailable" there
         would be wrong, so the copy separates the two. */
      var secure = window.isSecureContext === true;
      var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var offlineNote = secure
        ? 'Works offline once added.'
        : 'Offline support needs https or http://localhost, so this copy will need the network.';

      if (location.protocol === 'file:') {
        label.textContent = 'Not available from a local file';
        btnRow.disabled = true;
        hint.textContent = 'Browsers will not install a page opened straight from a file — everything else still ' +
          'works. Serve the app folder over http (see “Installing on a phone” in the README) to add it to a home screen.';
      } else if (isIOS) {
        hint.textContent = 'In Safari, tap Share, then “Add to Home Screen”. ' + offlineNote;
      } else {
        hint.textContent = 'Use your browser’s Install action — the icon in the address bar, or ' +
          'the menu → “Install app”. ' + offlineNote;
      }

      var go = function () { App.promptInstall(); };
      U.qs('#btnInstall').addEventListener('click', go);
      btnRow.addEventListener('click', go);
    },

    promptInstall: function () {
      if (!App.installEvent) {
        if (location.protocol === 'file:') {
          U.toast('Opened from a file, so it cannot be installed — serve the folder over http first');
          return;
        }
        var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
        U.toast(isIOS ? 'Safari: Share → Add to Home Screen' : 'Use the browser’s Install action');
        return;
      }
      App.installEvent.prompt();
      App.installEvent.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') U.toast('Installing…');
        App.installEvent = null;
      });
    },

    initServiceWorker: function () {
      /* only over http(s): a file:// page cannot host a service worker, and the
         single-file build is meant to run straight off disk */
      if (!('serviceWorker' in navigator)) return;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      var register = function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline extras are optional */ });
      };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register);
    },

    /* ══════════ living details ══════════ */

    /* "Last: 3 mins ago" goes stale without a clock; and at midnight every
       "today" figure moves. Tick while the page is visible. */
    startClock: function () {
      App._day = D.toISO(D.today());
      var tick = function () {
        if (document.hidden) return;
        var day = D.toISO(D.today());
        if (day !== App._day) {
          if (Views.cal.sel === App._day) {
            var t = D.today();
            Views.cal.sel = day;
            Views.cal.y = t.getFullYear();
            Views.cal.m = t.getMonth();
          }
          App._day = day;
          Views.renderAll(App.view);
        } else {
          Views.refreshLastLines();
        }
      };
      setInterval(tick, 30000);
      document.addEventListener('visibilitychange', tick);
    },

    /* a hairline under the top bar once the page scrolls beneath it */
    watchScroll: function () {
      var bar = U.qs('#topbar');
      var on = false, raf = 0;
      var update = function () {
        raf = 0;
        var scrolled = window.scrollY > 4;
        if (scrolled !== on) { on = scrolled; bar.classList.toggle('is-scrolled', scrolled); }
      };
      window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
      update();
    },

    /* ══════════ settings, export and import ══════════ */
    bindDataSheet: function () {
      U.qs('#btnAppearance').addEventListener('click', function () { App.openLook(); });

      U.qs('#btnCopyLink').addEventListener('click', function () {
        var text = U.qs('#dataLink').value;
        if (!text) { U.toast('Nothing to copy yet'); return; }
        U.copy(text).then(function (ok) { U.toast(ok ? 'Link copied' : 'Copy failed — select the text manually'); });
      });
      U.qs('#btnOpenLink').addEventListener('click', function () {
        var text = U.qs('#dataLink').value;
        if (text) window.open(text, '_blank', 'noopener');
      });

      U.qs('#btnExportCsv').addEventListener('click', function () {
        if (!S.stats().total) { U.toast('Nothing to export yet'); return; }
        U.download('virulenter-taps-' + D.toISO(D.today()) + '.csv', S.toCSV(), 'text/csv');
        U.toast('Exported every tap as CSV');
      });
      U.qs('#btnExportSummary').addEventListener('click', function () {
        if (!S.events.length) { U.toast('Nothing to export yet'); return; }
        U.download('virulenter-summary-' + D.toISO(D.today()) + '.csv', S.toSummaryCSV(), 'text/csv');
        U.toast('Exported the summary as CSV');
      });
      /* Sharing needs either the Android bridge or the Web Share API with file
         support; hide the buttons rather than offering a dead action. */
      var canShare = U.canShareFiles() ||
        (navigator.canShare && typeof File !== 'undefined' &&
         navigator.canShare({ files: [new File(['x'], 'x.csv', { type: 'text/csv' })] }));
      U.qs('#btnShareCsv').hidden = !canShare;
      U.qs('#btnShareJson').hidden = !canShare;

      U.qs('#btnShareCsv').addEventListener('click', function () {
        if (!S.stats().total) { U.toast('Nothing to share yet'); return; }
        App.shareFile('virulenter-taps-' + D.toISO(D.today()) + '.csv', S.toCSV(), 'text/csv');
      });
      U.qs('#btnShareJson').addEventListener('click', function () {
        if (!S.events.length) { U.toast('Nothing to share yet'); return; }
        App.shareFile('virulenter-' + D.toISO(D.today()) + '.json', S.serialize(), 'application/json');
      });

      U.qs('#btnDownload').addEventListener('click', function () {
        var name = 'virulenter-' + D.toISO(D.today()) + '.json';
        U.download(name, S.serialize());
        U.toast('Downloaded ' + name);
      });
      U.qs('#btnPickFile').addEventListener('click', function () { U.qs('#fileInput').click(); });
      U.qs('#fileInput').addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        var reader = new FileReader();
        var input = this;
        reader.onload = function () { App.loadPayload(String(reader.result), 'file'); input.value = ''; };
        reader.onerror = function () { U.toast('Could not read that file'); input.value = ''; };
        reader.readAsText(file, 'utf-8');
      });
      U.qs('#btnLoadPaste').addEventListener('click', function () {
        var text = U.qs('#dataPaste').value.trim();
        if (!text) { U.toast('Paste a link or JSON first'); return; }
        App.loadPayload(text, 'paste');
      });
      U.qs('#btnWipe').addEventListener('click', function () {
        if (!S.events.length) { U.toast('Nothing to erase'); return; }
        var n = S.events.length, taps = S.stats().total;
        UI.confirm({
          title: 'Erase everything?',
          messageHTML: 'All <b>' + n + '</b> ' + U.plural(n, 'event') + ' and <b>' + taps + '</b> ' + U.plural(taps, 'tap') +
            ' will be removed. Save a backup first if you might want them back.',
          danger: true,
          icon: 'trash',
          actions: [{ label: 'Erase everything', value: 'erase', kind: 'danger' }]
        }).then(function (choice) {
          if (choice !== 'erase') return;
          S.events = [];
          S.dirty = true;
          S.urlOk = true;
          /* keep a non-default look in the link; otherwise leave a clean URL */
          if (S.isDefaultLook()) S.clearUrl();
          else S.syncUrl();
          UI.closeSheet(App.dataOverlay);
          App.refreshLog();
          U.toast('Everything erased');
        });
      });
    },

    /* Hand a generated file to another app: the Android bridge where present,
       otherwise the Web Share API, otherwise fall back to a download. */
    shareFile: function (name, text, mime) {
      if (U.share(name, text, mime)) return;
      if (navigator.canShare) {
        try {
          var file = new File([text], name, { type: mime });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: name }).catch(function () {});
            return;
          }
        } catch (e) { /* fall through */ }
      }
      U.download(name, text, mime);
      U.toast('Sharing is unavailable here — downloaded instead');
    },

    /* A link (any number of d= payloads) or a JSON backup. With data already
       here, ask: merge, replace, or — and this is what Cancel now means —
       leave everything as it is. (Cancel used to mean "replace everything",
       and inside the Android app the question was never even shown.) */
    loadPayload: function (text, source) {
      var state = Codec.decode(text);
      if (!state) {
        U.toast(source === 'file' ? 'That file has no Virulenter data' : 'Could not read that data');
        return Promise.resolve(false);
      }
      if (!state.events.length) { U.toast('That data contains no events'); return Promise.resolve(false); }
      var incoming = state.events.length;
      var taps = state.events.reduce(function (n, e) { return n + e.log.length; }, 0);

      var ask = S.events.length
        ? UI.confirm({
            title: 'Load ' + incoming + ' ' + U.plural(incoming, 'event') + '?',
            messageHTML: 'Found <b>' + incoming + '</b> ' + U.plural(incoming, 'event') + ' with <b>' + taps + '</b> ' +
              U.plural(taps, 'tap') + '. <b>Merge</b> adds them to your current ' + S.events.length + ' ' +
              U.plural(S.events.length, 'event') + '; <b>Replace</b> discards what is here now.',
            icon: 'merge',
            actions: [
              { label: 'Merge with current data', value: 'merge', kind: 'primary' },
              { label: 'Replace everything', value: 'replace', kind: 'danger' }
            ]
          })
        : Promise.resolve('replace');

      return ask.then(function (mode) {
        if (!mode) return false;
        S.apply(state, mode);
        S.decodeFailed = false;
        S.partialFailure = false;
        App.applyLook(S.look);
        App.persist();
        App.refreshLog();
        if (source === 'paste') U.qs('#dataPaste').value = '';
        U.toast(mode === 'merge' ? 'Merged ' + incoming + ' ' + U.plural(incoming, 'event') : 'Data loaded');
        return true;
      });
    },

    openDataSheet: function () {
      var url = '';
      try { url = Codec.urlFor(S.snapshot()); } catch (e) { url = ''; }
      var total = S.stats().total;

      U.qs('#dataLink').value = url;
      U.qs('#dataProse').innerHTML =
        '<div class="privacy-ic"><svg class="ico" aria-hidden="true"><use href="#i-shield"/></svg></div>' +
        '<div><b>Your data stays with you</b>' +
          '<p>No account, no cookies, nothing stored in this browser — your whole log lives in the link below. ' +
          'Open it on any device to see exactly the same data.</p>' +
          '<div class="privacy-stats">' +
            '<span><b>' + S.events.length + '</b> ' + U.plural(S.events.length, 'event') + '</span>' +
            '<span><b>' + total + '</b> ' + U.plural(total, 'tap') + '</span>' +
            '<span><b>' + url.length.toLocaleString('en') + '</b> link characters</span>' +
          '</div></div>';

      U.qs('#linkHint').textContent = !S.urlOk
        ? 'Too long for the address bar: new taps are only kept in this tab. Save a backup now.'
        : url.length > Codec.MAX_URL
          ? 'Longer than ' + Codec.MAX_URL.toLocaleString('en') + ' characters. It still saves everything, ' +
            'but chat apps and email may cut it short — to move your data, use a backup file instead.'
          : 'Bookmark it or send it to yourself: the link is the save file.';

      U.qs('#dataPaste').value = '';
      U.qs('#lookSummary').textContent = App.lookSummary();
      Views.markTab('settings');
      UI.openSheet(App.dataOverlay);
    }
  };

  /* ── helpers ─────────────────────────────────────────── */

  function firstFamily(stack) {
    var first = String(stack).split(',')[0].trim().replace(/^["']|["']$/g, '');
    return first || 'system';
  }

  V.app = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.start(); });
  } else {
    App.start();
  }

})(window.V);
