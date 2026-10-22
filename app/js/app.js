/* ============================================================
   Virulenter · app.js — bootstrap, routing, interaction wiring.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date, S = V.store, UI = V.ui, Views = V.views,
      Stats = V.stats, Codec = V.codec;

  var App = {
    view: 'home',
    editingId: null,
    sortOrder: ['recent', 'name', 'count', 'oldest'],
    selectedColor: null,
    installEvent: null,

    /* ══════════ start ══════════ */
    start: function () {
      App.formOverlay = U.qs('#formOverlay');
      App.dataOverlay = U.qs('#dataOverlay');
      App.lookOverlay = U.qs('#lookOverlay');
      App.jumpOverlay = U.qs('#jumpOverlay');

      S.load();
      Views.init();
      Stats.init();
      App.bindAll();

      Views.renderSort();
      /* the manifest shortcuts deep-link with #view=… */
      var deep = /(?:^|[#&?])view=([a-z]+)/.exec(location.hash || '');
      var startView = deep && ['home', 'calendar', 'stats'].indexOf(deep[1]) >= 0 ? deep[1] : 'home';
      App.view = startView;
      Views.toggleTab(startView);
      Views.renderHome();
      UI.setActiveSwatch(S.events.length ? S.events[0].color : V.COLORS[0]);
      App.applyLook(S.look);

      /* Normalise the address bar once, so the link in the bar is always the
         canonical shareable one. Store.syncUrl() does not run again until the
         user actually changes something. */
      if (S.events.length) S.syncUrl();

      App.initInstall();
      App.initServiceWorker();

      App.ready = true;
      document.documentElement.classList.add('ready');
    },

    /* ══════════ routing ══════════ */
    bindAll: function () {
      U.qsa('.tab').forEach(function (t) {
        t.addEventListener('click', function () {
          App.view = t.dataset.view;
          Views.toggleTab(App.view);
        });
      });
      U.qs('#fab').addEventListener('click', function () { App.openForm(null); });
      U.qs('#btnAddTop').addEventListener('click', function () { App.openForm(null); });
      U.qs('#btnAddEmpty').addEventListener('click', function () { App.openForm(null); });
      U.qs('#notice').addEventListener('click', function (ev) {
        if (ev.target.dataset && ev.target.dataset.noticeClose) U.qs('#notice').hidden = true;
      });

      /* events list */
      var list = U.qs('#eventList');
      list.addEventListener('click', function (ev) {
        var tap = ev.target.closest('[data-tap]');
        if (tap) { App.handleTap(tap); return; }
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
        Views.renderSort();
        Views.renderHome();
      });

      App.bindCalendar();
      App.bindJump();

      /* sheets */
      [App.formOverlay, App.dataOverlay, App.lookOverlay, App.jumpOverlay].forEach(UI.bindSheetClose);
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        [App.jumpOverlay, App.lookOverlay, App.formOverlay, App.dataOverlay].some(function (ov) {
          if (!ov.hidden) { UI.closeSheet(ov); return true; }
          return false;
        });
      });

      App.bindForm();
      App.bindLook();
      App.bindDataSheet();
    },

    /* ══════════ calendar ══════════ */
    bindCalendar: function () {
      U.qs('#calPrev').addEventListener('click', function () { Views.shiftMonth(-1); });
      U.qs('#calNext').addEventListener('click', function () { Views.shiftMonth(1); });
      U.qs('#calPrevYear').addEventListener('click', function () { Views.shiftYear(-1); });
      U.qs('#calNextYear').addEventListener('click', function () { Views.shiftYear(1); });
      U.qs('#calToday').addEventListener('click', function () { Views.goToday(); });
      U.qs('#calTitle').addEventListener('click', function () { App.openJump(); });
      U.qs('#calGrid').addEventListener('click', function (ev) {
        var cell = ev.target.closest('.cal-cell');
        if (cell) Views.setSelectedDay(cell.dataset.date);
      });

      /* both heat grids jump the calendar to the clicked day */
      U.qs('#view-calendar').addEventListener('click', function (ev) {
        var hc = ev.target.closest('.heat-grid .hc[data-date]');
        if (!hc) return;
        var d = D.parseISO(hc.dataset.date);
        if (d) Views.goTo(d.getFullYear(), d.getMonth(), hc.dataset.date);
      });

      U.qs('#dayPanel').addEventListener('click', function (ev) {
        var del = ev.target.closest('[data-untap]');
        if (del) {
          S.removeEntry(del.dataset.untap, Number(del.dataset.ts));
          App.persist();
          Views.renderCalendar();
          Views.refreshLastLines();
          Views.renderStats(S.stats());
          U.toast('Tap removed');
          return;
        }
        var add = ev.target.closest('[data-addon]');
        if (add) App.addOnDay(add.dataset.addon);
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
      U.qs('#jumpMonths').innerHTML = D.MONTHS_LONG.map(function (name, i) {
        var n = months[i];
        var on = (y === Views.cal.y && i === Views.cal.m);
        return '<button class="jump-month' + (on ? ' is-on' : '') + '" type="button" data-month="' + i + '">' +
          name + (n ? '<span class="mbadge">' + n + '</span>' : '') + '</button>';
      }).join('');

      /* years that actually contain taps, newest first; falling back to a
         window around the current year when there is no data yet */
      var withData = S.years().filter(function (yy) {
        return S.byMonth(yy).some(function (n) { return n > 0; });
      });
      if (!withData.length) {
        withData = [new Date().getFullYear()];
      }
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

    handleTap: function (btn) {
      var id = btn.dataset.tap;
      var e = S.get(id);
      if (!e) return;
      var ts = S.logTap(id);
      if (!ts) return;

      App.buzz();
      App.persist();

      /* update in place — no full re-render, so the button keeps focus and
         the list order does not jump under the finger */
      var countNode = U.qs('[data-count="' + id + '"]');
      if (countNode) {
        countNode.textContent = S.count(e);
        var wrap = countNode.parentElement;
        if (wrap) {
          var unit = wrap.querySelector('span');
          if (unit) unit.textContent = UI.plural(S.count(e), 'tap', 'taps');
        }
      }
      var lastNode = U.qs('[data-last="' + id + '"]');
      if (lastNode) lastNode.innerHTML = UI.lastLine(ts);

      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');

      Views.renderStats(S.stats());
      Views.renderBrandSub();

      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
    },

    addOnDay: function (iso) {
      if (!S.events.length) { U.toast('Create an event first'); return; }
      var e = S.list()[0] || S.events[0];
      S.logTap(e.id, App.timestampForDay(iso));
      App.persist();
      Views.renderCalendar();
      Views.renderHome();
      U.toast('Logged on ' + D.fmtDay(iso) + ' for “' + e.name + '”');
    },

    timestampForDay: function (iso) {
      var now = new Date();
      if (iso === D.toISO(now)) return now.getTime();
      var d = D.parseISO(iso);
      if (!d) return now.getTime();
      d.setHours(12, 0, 0, 0);
      return d.getTime() > now.getTime() ? now.getTime() : d.getTime();
    },

    persist: function () {
      var ok = S.syncUrl();
      if (!ok && S.events.length) Views.renderNotice();
      return ok;
    },

    /* ══════════ appearance ══════════ */
    applyLook: function (look) {
      look = look || S.look || V.DEFAULTS;
      var tints = Codec.accentTints(Codec.accentValue(look));
      var root = document.documentElement.style;
      root.setProperty('--accent', tints.value);
      root.setProperty('--accent-soft', tints.soft);
      root.setProperty('--accent-ink', tints.ink);
      root.setProperty('--accent-hover', shade(tints.value, -0.16));
      root.setProperty('--font', Codec.fontStack(look.font));

      /* re-tint the activity ramp from the accent so a custom colour carries
         through the calendar and heat grids, not just the buttons */
      var rgb = Codec.hexToRgb(tints.value);
      var wash = function (t) { return Codec.rgbToHex(rgb.map(function (v) { return 255 - (255 - v) * t; })); };
      root.setProperty('--lv1', wash(0.28));
      root.setProperty('--lv2', wash(0.56));
      root.setProperty('--lv3', wash(0.80));
      root.setProperty('--lv4', tints.value);

      if (look.custom) root.setProperty('--custom-accent', look.custom);
      else root.removeProperty('--custom-accent');
    },

    bindLook: function () {
      var wrap = U.qs('#lookAccent');
      wrap.innerHTML = V.ACCENTS.map(function (a) {
        return '<button class="swatch" type="button" data-accent="' + a.id + '" style="--c:' + a.value +
          '" aria-label="' + U.esc(a.label) + '" title="' + U.esc(a.label) + '"></button>';
      }).join('');
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-accent]');
        if (!b) return;
        S.setAccent(b.dataset.accent);
        App.applyLook(S.look);
        App.renderLook();
        App.persist();
      });

      var custom = U.qs('#lookCustom');
      var hex = U.qs('#lookCustomHex');
      custom.addEventListener('input', function () {
        hex.value = custom.value;
        S.setCustomAccent(custom.value);
        App.applyLook(S.look);
        App.renderLook();
        App.persist();
      });
      U.qs('#lookCustomApply').addEventListener('click', function () {
        var v = hex.value.trim();
        if (!/^#?[0-9a-f]{6}$/i.test(v)) { U.toast('Enter six hex digits, e.g. #2f6bff'); return; }
        v = v[0] === '#' ? v : '#' + v;
        custom.value = v;
        S.setCustomAccent(v);
        App.applyLook(S.look);
        App.renderLook();
        App.persist();
        U.toast('Accent applied');
      });
      hex.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); U.qs('#lookCustomApply').click(); }
      });

      var fonts = U.qs('#lookFont');
      fonts.innerHTML = V.FONTS.map(function (f) {
        return '<button class="font-opt" type="button" data-font="' + f.id + '">' +
          '<span><span class="fo-name" style="font-family:' + f.stack.replace(/"/g, '&quot;') + '">' +
            U.esc(f.label) + '</span><br><span class="fo-meta">' + U.esc(firstFamily(f.stack)) + '</span></span>' +
          '<span class="fo-check">✓</span>' +
        '</button>';
      }).join('');
      fonts.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-font]');
        if (!b) return;
        S.setFont(b.dataset.font);
        App.applyLook(S.look);
        App.renderLook();
        App.persist();
      });

      U.qs('#lookReset').addEventListener('click', function () {
        Store_resetLook();
        App.applyLook(S.look);
        App.renderLook();
        App.persist();
        U.toast('Appearance reset');
      });
    },

    renderLook: function () {
      var look = S.look;
      var active = Codec.accentValue(look);
      U.qsa('#lookAccent .swatch').forEach(function (b) {
        b.classList.toggle('is-on', !look.custom && b.dataset.accent === look.accent);
      });
      U.qs('#lookCustom').value = look.custom || active;
      U.qs('#lookCustomHex').value = look.custom || '';
      U.qsa('#lookFont .font-opt').forEach(function (b) {
        b.classList.toggle('is-on', b.dataset.font === look.font);
      });
      /* the preview reads the live custom properties, so nothing extra to do */
      U.qs('#lookReset').disabled = (look.accent === V.DEFAULTS.accent && look.font === V.DEFAULTS.font && !look.custom);
    },

    openLook: function () {
      App.renderLook();
      UI.openSheet(App.lookOverlay);
    },

    /* ══════════ new / edit event ══════════ */
    bindForm: function () {
      var wrap = U.qs('#fColor');
      wrap.innerHTML = V.COLORS.map(function (c) {
        return '<button class="swatch" type="button" data-color="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>';
      }).join('');
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('.swatch');
        if (b) UI.setActiveSwatch(b.dataset.color);
      });

      U.qs('#eventForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        App.submitForm();
      });
      U.qs('#btnLogNow').addEventListener('click', function () {
        if (!App.editingId) return;
        S.logTap(App.editingId);
        App.persist();
        App.refreshFormLog();
        Views.renderHome();
      });
      U.qs('#btnClearLog').addEventListener('click', function () {
        if (!App.editingId) return;
        var e = S.get(App.editingId);
        if (!e || !e.log.length) { U.toast('Nothing to clear'); return; }
        S.clearLog(App.editingId);
        App.persist();
        App.refreshFormLog();
        Views.renderHome();
        U.toast('All taps cleared');
      });
      U.qs('#btnDeleteEvent').addEventListener('click', function () {
        if (!App.editingId) return;
        var e = S.get(App.editingId);
        if (e) App.confirmDelete(e);
      });
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
      UI.openSheet(App.formOverlay);
      if (!e) setTimeout(function () { U.qs('#fName').focus({ preventScroll: true }); }, 220);
    },

    submitForm: function () {
      var name = U.qs('#fName').value.trim();
      var start = U.qs('#fStart').value;
      if (!name) { U.toast('Give the event a name'); U.qs('#fName').focus(); return; }
      if (!D.parseISO(start)) { U.toast('Pick a valid start date'); return; }

      var data = { name: name, color: App.selectedColor || V.COLORS[0], start: start };
      var e = App.editingId ? S.update(App.editingId, data) : S.create(data);
      if (!e) { U.toast('Could not save'); return; }

      App.persist();
      UI.closeSheet(App.formOverlay);
      Views.renderHome();
      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
      U.toast(App.editingId ? 'Saved' : '“' + e.name + '” created — tap its button to log');
      App.editingId = null;
    },

    confirmDelete: function (e) {
      var n = e.log.length;
      if (window.confirm('Delete “' + e.name + '” and its ' + n + ' recorded ' +
                         UI.plural(n, 'tap') + '? This cannot be undone.')) {
        S.remove(e.id);
        App.persist();
        UI.closeSheet(App.formOverlay);
        Views.renderHome();
        if (App.view === 'calendar') Views.renderCalendar();
        if (App.view === 'stats') Stats.render();
        U.toast('Deleted');
        App.editingId = null;
      }
    },

    /* ══════════ install (PWA) ══════════ */
    isInstalled: function () {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             window.navigator.standalone === true;
    },

    initInstall: function () {
      var row = U.qs('#installRow');
      var hint = U.qs('#installHint');
      var btnRow = U.qs('#btnInstallRow');

      if (App.isInstalled()) { row.hidden = true; return; }

      window.addEventListener('beforeinstallprompt', function (ev) {
        ev.preventDefault();
        App.installEvent = ev;
        U.qs('#btnInstall').hidden = false;
        btnRow.textContent = 'Install as an app';
        hint.textContent = 'Adds Virulenter to your home screen and runs it offline.';
      });

      window.addEventListener('appinstalled', function () {
        App.installEvent = null;
        U.qs('#btnInstall').hidden = true;
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
        btnRow.textContent = 'Not available from a local file';
        btnRow.disabled = true;
        hint.textContent = 'This copy was opened straight from a file, which browsers will not ' +
          'install — everything else still works. To put it on your home screen, serve the app ' +
          'folder over http (see “Installing as an app” in the README) and open that address.';
      } else if (isIOS) {
        hint.textContent = 'On iPhone or iPad: open this page in Safari, tap Share, then ' +
          '“Add to Home Screen”. ' + offlineNote;
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
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline extras are optional */ });
      });
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
        if (window.confirm('Erase all ' + S.events.length + ' events and every recorded tap? This cannot be undone.')) {
          S.events = [];
          S.dirty = true;
          S.clearUrl();
          Views.renderHome();
          if (App.view === 'calendar') Views.renderCalendar();
          if (App.view === 'stats') Stats.render();
          UI.closeSheet(App.dataOverlay);
          U.toast('Everything erased');
        }
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

    loadPayload: function (text, source) {
      var state = Codec.decode(text);
      if (!state) {
        U.toast(source === 'file' ? 'That file has no Virulenter data' : 'Could not read that data');
        return;
      }
      if (!state.events.length) { U.toast('That data contains no events'); return; }
      var incoming = state.events.length;
      var taps = state.events.reduce(function (n, e) { return n + e.log.length; }, 0);

      var mode = 'replace';
      if (S.events.length) {
        mode = window.confirm(
          'Found ' + incoming + ' ' + UI.plural(incoming, 'event') + ' with ' + taps + ' ' +
          UI.plural(taps, 'tap') + '.\n\nOK = merge with what you already have\nCancel = replace everything'
        ) ? 'merge' : 'replace';
      }

      if (mode === 'replace') {
        S.events = state.events;
        S.look = state.look;
      } else {
        var target = { events: S.events, look: S.look };
        S.mergeInto(target, [state]);
        S.events = target.events;
      }
      S.dirty = true;
      S.decodeFailed = false;
      App.applyLook(S.look);
      App.persist();
      Views.renderHome();
      if (App.view === 'calendar') Views.renderCalendar();
      if (App.view === 'stats') Stats.render();
      U.toast(mode === 'merge' ? 'Merged ' + incoming + ' ' + UI.plural(incoming, 'event') : 'Data loaded');
    },

    openDataSheet: function () {
      var url = '';
      try { url = Codec.urlFor(S.snapshot()); } catch (e) { url = ''; }
      var total = S.stats().total;
      var tooLong = url.length > Codec.MAX_URL;

      U.qs('#dataLink').value = url;
      U.qs('#dataProse').innerHTML =
        'Virulenter never writes to this browser — no cookies, no localStorage. ' +
        'Your log lives in the link below, so opening that link on another device or browser shows exactly the same data.<br><br>' +
        '<b>' + S.events.length + '</b> ' + UI.plural(S.events.length, 'event') + ' · <b>' + total + '</b> ' +
        UI.plural(total, 'tap') + ' · link length <b>' + url.length + '</b> characters.' +
        (tooLong
          ? '<br><br><b>This link is longer than ' + Codec.MAX_URL + ' characters</b> and may not survive chat apps or email. ' +
            'Export a CSV or the JSON backup instead, or split the log by exporting, erasing, and exporting again — then paste both links with ' +
            '<span class="mono">?d=</span> to merge them.'
          : '');

      U.qs('#dataPaste').value = '';
      UI.openSheet(App.dataOverlay);
    }
  };

  /* ── helpers ─────────────────────────────────────────── */

  function shade(hex, amount) {
    var rgb = Codec.hexToRgb(hex);
    if (!rgb) return hex;
    return Codec.rgbToHex(rgb.map(function (v) {
      return amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    }));
  }

  function firstFamily(stack) {
    var first = String(stack).split(',')[0].trim().replace(/^["']|["']$/g, '');
    return first || 'system';
  }

  function Store_resetLook() {
    S.look = { accent: V.DEFAULTS.accent, font: V.DEFAULTS.font, custom: null };
    S.dirty = true;
  }

  V.app = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.start(); });
  } else {
    App.start();
  }

})(window.V);
