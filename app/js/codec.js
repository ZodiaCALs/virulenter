/* ============================================================
   Virulenter · codec.js
   The whole session — events, taps and appearance — is carried in the
   URL. Nothing is written to localStorage / cookies / IndexedDB, so the
   same link opens identically in any browser on any machine.

   Wire format, base64url over a packed binary payload:

     byte 0     version (2)
     varint     event count
     per event:
       varint   name byte length, then UTF-8 name
       1 byte   colour index into V.COLORS
       varint   start day, ordinal days since EPOCH_DAY
       varint   tap count
       per tap:
         varint minute of day (0..1439)
         varint day offset from the event start, biased by DAY_BIAS
     1 byte     settings flags:
                  bit 0  a non-default accent or font is set
                  bit 1  the accent is a custom RGB colour
     [1 byte]   accent index (high nibble) and font index (low nibble)
                (only when bit 0)
     [3 bytes]  custom accent, R G B          (only when bit 1)

   Taps store (day offset, minute of day) rather than a raw epoch value:
   logged taps sit within a few hours of local midnight, so the minute part
   stays under 1440 and costs two bytes. That is ~6.6 base64 characters per
   tap instead of ~17 for a JSON timestamp.
   ============================================================ */
window.V = window.V || {};
(function (V) {
  'use strict';

  var U = V.util, D = V.date;

  var EPOCH_DAY = 2458850;      // ordinal day number of 2020-01-01
  var DAY_BIAS = 30000;         // keeps the day offset positive for the varint
  var MINUTES_MAX = 1439;

  /* font stacks. Only families that ship with, or are very likely present on,
     the viewer's device — a missing font silently falls back, so offering
     arbitrary names would produce unpredictable results. */
  V.FONTS = [
    { id: 'system', label: 'System', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
    { id: 'humanist', label: 'Humanist', stack: 'Optima, Candara, "Gill Sans", "Segoe UI", "Trebuchet MS", sans-serif' },
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Iowan Old Style", "Times New Roman", "Songti SC", serif' },
    { id: 'rounded', label: 'Rounded', stack: '"SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Segoe UI", ui-rounded, system-ui, sans-serif' },
    { id: 'mono', label: 'Mono', stack: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace' }
  ];

  /* accent presets — value, plus the two derived tints the stylesheet needs */
  V.ACCENTS = [
    { id: 'blue', label: 'Blue', value: '#2f6bff' },
    { id: 'indigo', label: 'Indigo', value: '#4f46e5' },
    { id: 'violet', label: 'Violet', value: '#7c3aed' },
    { id: 'magenta', label: 'Magenta', value: '#c026d3' },
    { id: 'rose', label: 'Rose', value: '#e11d48' },
    { id: 'orange', label: 'Orange', value: '#ea580c' },
    { id: 'green', label: 'Green', value: '#0f9d58' },
    { id: 'teal', label: 'Teal', value: '#0d9488' },
    { id: 'slate', label: 'Slate', value: '#475569' },
    { id: 'ink', label: 'Ink', value: '#111827' }
  ];

  V.DEFAULTS = { accent: 'blue', font: 'system', custom: null };

  var Codec = V.codec = {
    MAX_URL: 2000,        // conservative: chat apps and mail clients truncate beyond this
    WARN_URL: 1500,

    /* ── base64url over bytes ───────────────────────────── */
    bytesToB64: function (bytes) {
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    b64ToBytes: function (str) {
      var s = String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
      while (s.length % 4) s += '=';
      var bin = atob(s);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },

    encodeBytes: function (json) {
      return Codec.bytesToB64(new TextEncoder().encode(json));
    },

    decodeBytes: function (str) {
      return new TextDecoder().decode(Codec.b64ToBytes(str));
    },

    /* ── varints ────────────────────────────────────────── */
    writeVarint: function (out, value) {
      var v = Math.max(0, Math.round(value) || 0);
      while (v >= 128) {
        out.push((v & 127) | 128);
        v = Math.floor(v / 128);
      }
      out.push(v);
    },

    readVarint: function (bytes, pos) {
      var result = 0, shift = 0, b;
      do {
        if (pos.i >= bytes.length) throw new Error('truncated payload');
        b = bytes[pos.i++];
        result += (b & 127) * Math.pow(2, shift);
        shift += 7;
      } while (b & 128);
      return result;
    },

    /* ── hex ↔ bytes ────────────────────────────────────── */
    hexToRgb: function (hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return null;
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    rgbToHex: function (rgb) {
      return '#' + rgb.map(function (v) {
        var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
        return s.length === 1 ? '0' + s : s;
      }).join('');
    },

    /* ── state → binary ─────────────────────────────────── */
    packBytes: function (state) {
      var out = [V.FORMAT];
      var events = state.events || [];
      Codec.writeVarint(out, events.length);

      events.forEach(function (e) {
        var nameBytes = new TextEncoder().encode(String(e.name || 'Untitled').slice(0, 48));
        Codec.writeVarint(out, nameBytes.length);
        for (var i = 0; i < nameBytes.length; i++) out.push(nameBytes[i]);

        var ci = -1;
        for (var c = 0; c < V.COLORS.length; c++) {
          if (V.COLORS[c].toLowerCase() === String(e.color || '').toLowerCase()) { ci = c; break; }
        }
        out.push(ci < 0 ? 0 : ci);

        var startDate = D.parseISO(e.start) || D.today();
        var startDay = D.toEpochDay(startDate) - EPOCH_DAY;
        Codec.writeVarint(out, startDay);

        var taps = (e.log || []).slice().sort(function (a, b) { return a - b; });
        Codec.writeVarint(out, taps.length);
        taps.forEach(function (ts) {
          var d = new Date(ts);
          var dayOff = D.toEpochDay(d) - (startDay + EPOCH_DAY);
          /* floor, not round: rounding 12:03:41 up to 12:04 would decode to a
             time later than the tap that was actually recorded */
          var mins = Math.floor((ts - D.stripTime(d)) / 60000);
          if (mins < 0) mins = 0;
          if (mins > MINUTES_MAX) mins = MINUTES_MAX;
          if (dayOff < -DAY_BIAS) dayOff = -DAY_BIAS;
          if (dayOff > 32767) dayOff = 32767;
          Codec.writeVarint(out, mins);
          Codec.writeVarint(out, dayOff + DAY_BIAS);
        });
      });

      /* appearance. The accent index and the font index share one byte so a
         non-default look costs two bytes, and a default look costs one. */
      var look = state.look || V.DEFAULTS;
      var custom = look.custom ? Codec.hexToRgb(look.custom) : null;
      var accentIdx = 0;
      for (var a = 0; a < V.ACCENTS.length; a++) if (V.ACCENTS[a].id === look.accent) accentIdx = a;
      var fontIdx = 0;
      for (var f = 0; f < V.FONTS.length; f++) if (V.FONTS[f].id === look.font) fontIdx = f;

      var nonDefault = accentIdx > 0 || fontIdx > 0;
      var flags = (nonDefault ? 1 : 0) | (custom ? 2 : 0);
      out.push(flags);
      if (nonDefault) out.push(((accentIdx & 15) << 4) | (fontIdx & 15));
      if (custom) out.push(custom[0], custom[1], custom[2]);

      return new Uint8Array(out);
    },

    unpackBytes: function (bytes) {
      if (!bytes || bytes.length < 3) return null;
      var pos = { i: 0 };
      var version = bytes[pos.i++];
      if (version !== V.FORMAT) return null;

      var count = Codec.readVarint(bytes, pos);
      if (count > 2000) return null;

      var events = [];
      for (var n = 0; n < count; n++) {
        var nameLen = Codec.readVarint(bytes, pos);
        if (nameLen > 400 || pos.i + nameLen > bytes.length) return null;
        var name = new TextDecoder().decode(bytes.subarray(pos.i, pos.i + nameLen));
        pos.i += nameLen;

        var colorIdx = bytes[pos.i++];
        var startDay = Codec.readVarint(bytes, pos);
        var tapCount = Codec.readVarint(bytes, pos);
        if (tapCount > 200000) return null;

        var log = [];
        for (var t = 0; t < tapCount; t++) {
          var mins = Codec.readVarint(bytes, pos);
          var dayOff = Codec.readVarint(bytes, pos) - DAY_BIAS;
          var day = D.fromEpochDay(EPOCH_DAY + startDay + dayOff);
          log.push(day.getTime() + mins * 60000);
        }
        log.sort(function (a, b) { return a - b; });

        events.push({
          id: U.uid(),
          name: (name || 'Untitled').slice(0, 48),
          color: V.COLORS[colorIdx] || V.COLORS[0],
          start: D.toISO(D.fromEpochDay(EPOCH_DAY + startDay)),
          log: log
        });
      }

      /* appearance is optional: a payload that ends here still loads */
      var look = { accent: V.DEFAULTS.accent, font: V.DEFAULTS.font, custom: null };
      if (pos.i < bytes.length) {
        var flags = bytes[pos.i++];
        if ((flags & 1) && pos.i < bytes.length) {
          var packed = bytes[pos.i++];
          look.accent = (V.ACCENTS[packed >> 4] || V.ACCENTS[0]).id;
          look.font = (V.FONTS[packed & 15] || V.FONTS[0]).id;
        }
        if ((flags & 2) && pos.i + 3 <= bytes.length) {
          look.custom = Codec.rgbToHex([bytes[pos.i], bytes[pos.i + 1], bytes[pos.i + 2]]);
          pos.i += 3;
        }
      }

      return { v: V.FORMAT, events: events, look: look };
    },

    /* ── state ↔ string ─────────────────────────────────── */
    encode: function (state) {
      return Codec.bytesToB64(Codec.packBytes(state));
    },

    decode: function (str) {
      if (!str) return null;
      var text = String(str).trim();

      var hash = text.indexOf('#') >= 0 ? text.slice(text.indexOf('#') + 1) : text;
      if (/^[?&]/.test(hash)) hash = hash.slice(1);
      var m = /(?:^|[?&])d=([A-Za-z0-9\-_]+)/.exec(hash);
      if (m) {
        try { return Codec.unpackBytes(Codec.b64ToBytes(m[1])); } catch (e) { /* fall through */ }
      }
      if (/^[A-Za-z0-9\-_]+$/.test(hash) && hash.length > 4) {
        try { return Codec.unpackBytes(Codec.b64ToBytes(hash)); } catch (e) { /* fall through */ }
      }

      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return Codec.unpackBytes(Codec.packBytes({ events: parsed }));
        if (parsed && Array.isArray(parsed.events)) return Codec.unpackBytes(Codec.packBytes(parsed));
      } catch (e) { /* not JSON either */ }
      return null;
    },

    /* ── URL helpers ────────────────────────────────────── */
    baseUrl: function () {
      return location.origin && location.origin !== 'null'
        ? location.origin + location.pathname
        : location.href.split('#')[0].split('?')[0];
    },

    /* Short sessions ride in the fragment. Longer ones go in ?d=, which
       browsers accept far more of, and which can be repeated to merge links. */
    urlFor: function (state) {
      var payload;
      try { payload = Codec.encode(state); } catch (e) { return Codec.baseUrl(); }
      var short = Codec.baseUrl() + '#d=' + payload;
      if (short.length <= Codec.MAX_URL) return short;
      return Codec.baseUrl() + '?d=' + payload;
    },

    payloadsFromQuery: function () {
      var q = location.search || '';
      if (!q) return [];
      var out = [];
      q.replace(/^\?/, '').split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        var key = eq < 0 ? pair : pair.slice(0, eq);
        if (key !== 'd') return;
        var val = eq < 0 ? '' : pair.slice(eq + 1);
        try { out.push(decodeURIComponent(val)); } catch (e) { out.push(val); }
      });
      return out;
    },

    payloadFromHash: function () {
      var h = (location.hash || '').replace(/^#/, '');
      if (!h) return null;
      var m = /(?:^|[?&])d=([A-Za-z0-9\-_]+)/.exec(h);
      if (m) return m[1];
      if (/^d=/.test(h)) return h.slice(2);
      return null;
    },

    /* ── appearance helpers ─────────────────────────────── */
    accentValue: function (look) {
      if (look && look.custom) return look.custom;
      var id = (look && look.accent) || V.DEFAULTS.accent;
      for (var i = 0; i < V.ACCENTS.length; i++) if (V.ACCENTS[i].id === id) return V.ACCENTS[i].value;
      return V.ACCENTS[0].value;
    },

    /* derive the tints the stylesheet needs from any accent colour, so a
       custom pick gets the same treatment as a preset */
    accentTints: function (hex) {
      var rgb = Codec.hexToRgb(hex) || Codec.hexToRgb(V.ACCENTS[0].value);
      /* soft: the accent washed onto white at ~11% */
      var soft = rgb.map(function (v) { return Math.round(255 - (255 - v) * 0.11); });
      /* ink: readable text on top of the accent */
      var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      return {
        value: Codec.rgbToHex(rgb),
        soft: Codec.rgbToHex(soft),
        ink: lum > 0.62 ? '#111827' : '#ffffff'
      };
    },

    fontStack: function (id) {
      for (var i = 0; i < V.FONTS.length; i++) if (V.FONTS[i].id === id) return V.FONTS[i].stack;
      return V.FONTS[0].stack;
    }
  };

})(window.V);
