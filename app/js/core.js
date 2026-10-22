/* ============================================================
   Virulenter · core.js — helpers and date arithmetic.
   No dependencies. Everything is local-timezone based.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  V.APP_NAME = 'Virulenter';
  V.FORMAT = 2;   // bumped when the appearance settings joined the payload

  var U = V.util = {
    MS_DAY: 86400000,

    qs: function (sel, root) { return (root || document).querySelector(sel); },
    qsa: function (sel, root) {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    },

    el: function (tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    },

    uid: function () {
      return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    pad2: function (n) { return n < 10 ? '0' + n : '' + n; },

    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /* English pluralisation for the handful of words the UI counts */
    plural: function (n, one, many) { return n === 1 ? one : (many || one + 's'); },

    throttle: function (fn, wait) {
      var last = 0, timer = null, args = null;
      return function () {
        var now = Date.now(), ctx = this;
        args = arguments;
        if (now - last >= wait) { last = now; fn.apply(ctx, args); }
        else if (!timer) {
          timer = setTimeout(function () {
            timer = null; last = Date.now(); fn.apply(ctx, args);
          }, wait - (now - last));
        }
      };
    },

    toast: function (msg) {
      var wrap = U.qs('#toastWrap');
      if (!wrap) return;
      var t = U.el('div', 'toast', U.esc(msg));
      wrap.appendChild(t);
      setTimeout(function () {
        t.classList.add('out');
        setTimeout(function () { t.remove(); }, 220);
      }, 1700);
    },

    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; },
                                                        function () { return fallback(); });
      }
      return Promise.resolve(fallback());
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          ta.remove();
          return ok;
        } catch (e) { return false; }
      }
    },

    /* Hand a generated file to the platform.
       In a browser that means a Blob object URL and an <a download>. Inside the
       Android wrapper there is no download manager listening, so an injected
       bridge object receives the bytes and writes them to the Downloads folder
       or a share sheet.

       The bridge has to be looked up per call: Android injects it asynchronously,
       so it may not exist yet while this module is evaluating.
       Detect it by capability rather than by user agent. */
    nativeSave: function () {
      var b = (typeof window !== 'undefined') ? window.VirulenterNative : null;
      return (b && typeof b.saveBase64 === 'function') ? b : null;
    },

    canShareFiles: function () {
      var b = U.nativeSave();
      return !!(b && typeof b.canShare === 'function' && b.canShare());
    },

    download: function (filename, text, mime) {
      var type = (mime || 'application/json') + ';charset=utf-8';
      var bridge = U.nativeSave();

      if (bridge) {
        try {
          bridge.saveBase64(filename, type, U.base64Utf8(text), false);
          return;
        } catch (e) { /* fall through to the browser path */ }
      }

      var blob = new Blob([text], { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    },

    /* same file, but offered to other apps instead of saved */
    share: function (filename, text, mime) {
      var type = (mime || 'application/json') + ';charset=utf-8';
      var bridge = U.nativeSave();
      if (!bridge) return false;
      try {
        bridge.saveBase64(filename, type, U.base64Utf8(text), true);
        return true;
      } catch (e) { return false; }
    },

    /* UTF-8 safe base64, so non-ASCII event names survive the bridge */
    base64Utf8: function (text) {
      var bytes = new TextEncoder().encode(String(text));
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
  };

  /* ── dates ────────────────────────────────────────────── */
  var D = V.date = {
    stripTime: function (d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    },

    diffDays: function (a, b) {
      return Math.round((D.stripTime(b) - D.stripTime(a)) / U.MS_DAY);
    },

    addDays: function (d, n) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() + n);
      return x;
    },

    addMonths: function (d, n) {
      var day = d.getDate();
      var x = new Date(d.getFullYear(), d.getMonth() + n, 1);
      var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
      x.setDate(Math.min(day, last));
      return x;
    },

    daysInMonth: function (y, m) { return new Date(y, m + 1, 0).getDate(); },

    /* Absolute day number for a local calendar date. Deliberately NOT
       Date.UTC(...)/86400000: that mixes a UTC epoch with a local midnight,
       so the division does not land on a whole day and every date drifts by
       one outside UTC. Counting ordinal days keeps local dates exact. */
    toEpochDay: function (d) {
      var y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
      var a = Math.floor((14 - (m + 1)) / 12);
      var yy = y + 4800 - a;
      var mm = (m + 1) + 12 * a - 3;
      return day + Math.floor((153 * mm + 2) / 5) + 365 * yy +
             Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    },

    fromEpochDay: function (n) {
      var a = n + 32044;
      var b = Math.floor((4 * a + 3) / 146097);
      var c = a - Math.floor(146097 * b / 4);
      var dd = Math.floor((4 * c + 3) / 1461);
      var e = c - Math.floor(1461 * dd / 4);
      var mm = Math.floor((5 * e + 2) / 153);
      var day = e - Math.floor((153 * mm + 2) / 5) + 1;
      var month = mm + 3 - 12 * Math.floor(mm / 10);
      var year = 100 * b + dd - 4800 + Math.floor(mm / 10);
      return new Date(year, month - 1, day);
    },

    today: function () {
      var n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    },

    /* local YYYY-MM-DD — never toISOString, which would shift the day across timezones */
    toISO: function (d) {
      return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
    },

    /* strict parse: JS would silently roll 2026-02-30 into 03-02, so read it back */
    parseISO: function (iso) {
      if (!iso) return null;
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
      if (!m) return null;
      var y = +m[1], mo = +m[2], d = +m[3];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      var date = new Date(y, mo - 1, d);
      if (isNaN(date.getTime())) return null;
      if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
      return date;
    },

    dayKey: function (ts) { return D.toISO(dFromTs(ts)); },

    /* 2026-03-04 → Wed 4 Mar */
    fmtDay: function (iso) {
      var d = D.parseISO(iso);
      if (!d) return '—';
      return D.WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + D.MONTHS[d.getMonth()];
    },

    fmtDayLong: function (iso) {
      var d = D.parseISO(iso);
      if (!d) return '—';
      return D.WEEKDAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' ' + D.MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear();
    },

    fmtMonth: function (y, m) { return D.MONTHS_LONG[m] + ' ' + y; },

    /* 14:05 */
    fmtTime: function (ts) {
      var d = new Date(ts);
      return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
    },

    /* relative, human: "3 min ago" / "Yesterday 14:05" */
    fmtRelative: function (ts) {
      if (!ts) return '';
      var now = Date.now(), diff = now - ts;
      if (diff < 0) return D.fmtTime(ts);
      var min = Math.floor(diff / 60000);
      if (min < 1) return 'just now';
      if (min < 60) return min + (min === 1 ? ' min ago' : ' mins ago');
      var hrs = Math.floor(min / 60);
      if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
      var days = Math.floor(hrs / 24);
      if (days === 1) return 'yesterday ' + D.fmtTime(ts);
      if (days < 7) return days + ' days ago';
      return D.fmtDay(D.dayKey(ts));
    },

    WEEKDAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    WEEKDAYS_LONG: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    MONTHS_LONG: ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']
  };

  function dFromTs(ts) {
    var d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  V.date.fromTs = dFromTs;

  /* ── colours for new events ───────────────────────────── */
  V.COLORS = ['#2f6bff', '#0ea5a0', '#f0872b', '#d92d4b',
              '#7c4dff', '#0f9d58', '#c2185b', '#5b6472'];

})(window.V);
