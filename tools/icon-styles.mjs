/**
 * icon-styles.mjs — the candidate Virulenter app icons.
 *
 * Each style draws on a 512 canvas, centred on (256, 256), in two layers so
 * every platform's icon can be composed from it:
 *
 *   plate(p)   the background. Drawn over a 1024 square (-256…768) so it
 *              still fills an Android adaptive layer's bleed when that layer
 *              is shrunk to place the 512 tile inside the launcher mask.
 *   glyph(p)   the mark itself, inside a centred circle of radius ~175, the
 *              part every mask (squircle, circle, teardrop) keeps.
 *   mono()     the glyph as one white silhouette (alpha only): the layer
 *              Android 13+ tints for themed icons.
 *
 * `p` prefixes every id, so several icons can share one HTML page.
 * Gradients, masks and filters only: no bitmaps, no dependencies.
 */

const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
/* a point on a circle; 0deg points east, angles grow clockwise (y is down) */
const at = (cx, cy, r, deg) => [f(cx + r * Math.cos(rad(deg))), f(cy + r * Math.sin(rad(deg)))];
const BLEED = 'x="-256" y="-256" width="1024" height="1024"';

/* a colour between stops, for gradients SVG cannot draw (along an arc) */
function hex(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function mixStops(stops, t) {
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), k = t * n - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, '0')).join('');
}
/* an arc as a path, from a0 to a1 degrees (clockwise) */
function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = at(cx, cy, r, a0), [x1, y1] = at(cx, cy, r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/* ════════════════════════════════════════════════════════════════
   1 · Fluent Tally — after Microsoft's Fluent 2 app icons
   Four strokes and the strike that closes a group of five: the oldest
   way to count. Built Fluent-style from simple rounded geometry, lit from
   above, each layer a luminous gradient with soft depth between layers,
   on a light plate.
   ════════════════════════════════════════════════════════════════ */
const fluentBars = [
  { x: 157, top: '#4FD8FF', bot: '#1590E0' },
  { x: 223, top: '#5AA8FF', bot: '#2460E6' },
  { x: 289, top: '#8B8CFF', bot: '#4A43DE' },
  { x: 355, top: '#B784FF', bot: '#7136D8' }
];
const STRIKE = 'translate(256 262) rotate(-26)';
const fluent = {
  id: 'fluent',
  name: 'Fluent Tally',
  family: 'Microsoft · Fluent 2',
  idea: 'The tally: four strokes and the strike that closes a five. Layered luminous gradients, soft depth, a light plate.',
  plate: (p) => `
    <defs>
      <linearGradient id="${p}pl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EEF8"/>
      </linearGradient>
      <radialGradient id="${p}pg" gradientUnits="userSpaceOnUse" cx="256" cy="300" r="250">
        <stop offset="0" stop-color="#7C8CFF" stop-opacity=".22"/><stop offset="1" stop-color="#7C8CFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect ${BLEED} fill="url(#${p}pl)"/>
    <rect ${BLEED} fill="url(#${p}pg)"/>`,
  glyph: (p) => `
    <defs>
      ${fluentBars.map((b, i) => `
      <linearGradient id="${p}b${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${b.top}"/><stop offset="1" stop-color="${b.bot}"/>
      </linearGradient>`).join('')}
      <linearGradient id="${p}st" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FFB15C"/><stop offset=".5" stop-color="#FF6F61"/><stop offset="1" stop-color="#F23F86"/>
      </linearGradient>
      <linearGradient id="${p}lit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${p}slit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <filter id="${p}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="${p}tight" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <!-- depth: the strokes stand on the plate, the strike floats above them -->
    <g fill="#24307A" opacity=".2" filter="url(#${p}soft)">
      ${fluentBars.map((b) => `<rect x="${b.x - 23}" y="164" width="46" height="212" rx="23"/>`).join('')}
    </g>
    ${fluentBars.map((b, i) => `
    <rect x="${b.x - 23}" y="150" width="46" height="212" rx="23" fill="url(#${p}b${i})"/>
    <rect x="${b.x - 23}" y="150" width="46" height="212" rx="23" fill="url(#${p}lit)"/>`).join('')}
    <g transform="${STRIKE}">
      <rect x="-166" y="-10" width="332" height="50" rx="25" fill="#1E1A6B" opacity=".34" filter="url(#${p}tight)"/>
      <rect x="-166" y="-25" width="332" height="50" rx="25" fill="url(#${p}st)"/>
      <rect x="-166" y="-25" width="332" height="50" rx="25" fill="url(#${p}slit)"/>
      <rect x="-150" y="-19" width="300" height="5" rx="2.5" fill="#fff" opacity=".5"/>
    </g>`,
  mono: () => `
    <defs>
      <mask id="mono-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <g transform="${STRIKE}"><rect x="-180" y="-39" width="360" height="78" rx="39" fill="#000"/></g>
      </mask>
    </defs>
    <g mask="url(#mono-cut)" fill="#fff">
      ${fluentBars.map((b) => `<rect x="${b.x - 23}" y="150" width="46" height="212" rx="23"/>`).join('')}
    </g>
    <g transform="${STRIKE}"><rect x="-166" y="-25" width="332" height="50" rx="25" fill="#fff"/></g>`
};

/* ════════════════════════════════════════════════════════════════
   2 · Material Heat — after Google's Material 3 (Expressive)
   The calendar's heat grid in one tonal palette, light to deep, ending in
   the day being counted: M3's full (circle) shape with a plus, raised like
   a FAB. Flat tonal colour, the M3 corner scale, and a themed icon that
   keeps the tonal steps as alpha.
   ════════════════════════════════════════════════════════════════ */
const M3 = { plate: '#E4F4E9', t90: '#C4ECD1', t80: '#9EDDB5', t70: '#74C996', t60: '#4CB17A', t50: '#2C9764', t30: '#00552F', t20: '#003920' };
const CELL = 92, GAP = 18, G0 = 256 - (3 * CELL + 2 * GAP) / 2;
const cellXY = (c, r) => [G0 + c * (CELL + GAP), G0 + r * (CELL + GAP)];
const HEAT = [
  ['t90', 't80', 't70'],
  ['t80', 't70', 't60'],
  ['t70', 't50', null]
];
const [CKX, CKY] = cellXY(2, 2).map((v) => v + CELL / 2);
const FAB_R = 50;
const plus = (cx, cy, len, w) =>
  `<rect x="${cx - len / 2}" y="${cy - w / 2}" width="${len}" height="${w}" rx="${w / 2}"/>` +
  `<rect x="${cx - w / 2}" y="${cy - len / 2}" width="${w}" height="${len}" rx="${w / 2}"/>`;
const material = {
  id: 'material',
  name: 'Material Heat',
  family: 'Google · Material 3',
  idea: 'The heat grid in one tonal palette, ending in the day being counted: a raised circle with a plus. Flat, tonal, themed-icon ready.',
  plate: () => `<rect ${BLEED} fill="${M3.plate}"/>`,
  glyph: (p) => `
    <defs><filter id="${p}fab" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="${M3.t20}" flood-opacity=".3"/></filter></defs>
    ${HEAT.map((row, r) => row.map((tone, c) => {
      if (!tone) return '';
      const [x, y] = cellXY(c, r);
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="28" fill="${M3[tone]}"/>`;
    }).join('')).join('')}
    <circle cx="${CKX}" cy="${CKY}" r="${FAB_R}" fill="${M3.t30}" filter="url(#${p}fab)"/>
    <g fill="#fff">${plus(CKX, CKY, 44, 12)}</g>`,
  mono: () => `
    <defs>
      <mask id="mono-plus" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/><g fill="#000">${plus(CKX, CKY, 44, 12)}</g>
      </mask>
    </defs>
    ${HEAT.map((row, r) => row.map((tone, c) => {
      if (!tone) return '';
      const [x, y] = cellXY(c, r);
      const alpha = { t90: .3, t80: .45, t70: .6, t60: .72, t50: .85 }[tone];
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="28" fill="#fff" fill-opacity="${alpha}"/>`;
    }).join('')).join('')}
    <circle cx="${CKX}" cy="${CKY}" r="${FAB_R}" fill="#fff" mask="url(#mono-plus)"/>`
};

/* ════════════════════════════════════════════════════════════════
   3 · Liquid Ring — after Apple's Liquid Glass (iOS 26)
   A ring of clear glass, three-quarters full of light: the day's count
   filling toward a goal. The tube refracts the field behind it (a
   magnified, brightened copy), carries specular light on the edge facing
   the source and a darker far edge; the liquid glows inside it.
   ════════════════════════════════════════════════════════════════ */
const RING = { r: 124, t: 72 };            // centreline radius, tube thickness
const FILL = { a0: -90, a1: 180 };          // the liquid: from 12 o'clock, clockwise to 9
const LIQUID = ['#FFFFFF', '#C9F4FF', '#7FE0FF', '#5BB8FF'];
const liquidRing = {
  id: 'liquid',
  name: 'Liquid Ring',
  family: 'Apple · Liquid Glass',
  idea: 'A ring of clear glass three-quarters full of light: the count filling toward a goal. Refraction, specular edges, liquid glow.',
  plate: (p) => `
    <defs>
      <linearGradient id="${p}pl" gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="392" y2="512">
        <stop offset="0" stop-color="#4F7BFF"/><stop offset=".52" stop-color="#6A4BF2"/><stop offset="1" stop-color="#B23FD6"/>
      </linearGradient>
      <radialGradient id="${p}pc" gradientUnits="userSpaceOnUse" cx="96" cy="70" r="270">
        <stop offset="0" stop-color="#67E6FF" stop-opacity=".75"/><stop offset="1" stop-color="#67E6FF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${p}pp" gradientUnits="userSpaceOnUse" cx="440" cy="470" r="300">
        <stop offset="0" stop-color="#FF7AB0" stop-opacity=".85"/><stop offset="1" stop-color="#FF7AB0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect ${BLEED} fill="url(#${p}pl)"/>
    <rect ${BLEED} fill="url(#${p}pc)"/>
    <rect ${BLEED} fill="url(#${p}pp)"/>`,
  glyph: (p, plate) => {
    const { r, t } = RING, ro = r + t / 2, ri = r - t / 2;
    const segs = 72, span = FILL.a1 - FILL.a0;
    let liquid = '';
    for (let i = 0; i < segs; i++) {
      const a = FILL.a0 + (span * i) / segs, b = FILL.a0 + (span * (i + 1)) / segs + 0.6;
      liquid += `<path d="${arc(256, 256, r, a, Math.min(b, FILL.a1))}" stroke="${mixStops(LIQUID, i / (segs - 1))}"/>`;
    }
    const [hx, hy] = at(256, 256, r, FILL.a1);
    const [sx, sy] = at(256, 256, r, FILL.a0);
    return `
    <defs>
      <mask id="${p}tube" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-width="${t}"/>
      </mask>
      <linearGradient id="${p}veil" gradientUnits="userSpaceOnUse" x1="140" y1="120" x2="380" y2="400">
        <stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/>
      </linearGradient>
      <linearGradient id="${p}spec" gradientUnits="userSpaceOnUse" x1="120" y1="120" x2="300" y2="300">
        <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${p}far" gradientUnits="userSpaceOnUse" x1="260" y1="260" x2="400" y2="400">
        <stop offset="0" stop-color="#1A0B52" stop-opacity="0"/><stop offset="1" stop-color="#1A0B52" stop-opacity=".45"/>
      </linearGradient>
      <radialGradient id="${p}bead" cx=".38" cy=".34" r=".7">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#E4F8FF"/><stop offset="1" stop-color="#8FD9FF"/>
      </radialGradient>
      <filter id="${p}lens" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="3"/>
        <feComponentTransfer><feFuncR type="linear" slope="1.15" intercept=".08"/><feFuncG type="linear" slope="1.15" intercept=".08"/><feFuncB type="linear" slope="1.1" intercept=".08"/></feComponentTransfer>
      </filter>
      <filter id="${p}blur14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="${p}blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="${p}blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
    </defs>
    <!-- shadow and caustic on the field beneath -->
    <circle cx="256" cy="272" r="${r}" fill="none" stroke="#1C0A50" stroke-opacity=".38" stroke-width="${t}" filter="url(#${p}blur14)"/>
    <!-- the tube: the field refracted, magnified about the centre, then a veil -->
    <g mask="url(#${p}tube)">
      <g transform="translate(256 256) scale(1.22) translate(-256 -256)" filter="url(#${p}lens)">${plate}</g>
      <rect width="512" height="512" fill="url(#${p}veil)"/>
      <rect width="512" height="512" fill="url(#${p}far)"/>
    </g>
    <!-- the liquid, glowing inside the glass -->
    <g fill="none" stroke-linecap="butt" stroke-width="40" opacity=".55" filter="url(#${p}blur8)">${liquid}</g>
    <g fill="none" stroke-linecap="butt" stroke-width="34">${liquid}</g>
    <circle cx="${sx}" cy="${sy}" r="17" fill="${LIQUID[0]}"/>
    <path d="${arc(256, 256, r - 9, FILL.a0 + 6, FILL.a1 - 14)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
    <!-- rims: lit near edge, thin far line -->
    <path d="${arc(256, 256, ro - 2, 180, 300)}" fill="none" stroke="url(#${p}spec)" stroke-width="4" stroke-linecap="round"/>
    <path d="${arc(256, 256, ri + 2, 0, 110)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="${ro - 1}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
    <circle cx="256" cy="256" r="${ri + 1}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>
    <path d="${arc(256, 256, ro - 1.5, 10, 120)}" fill="none" stroke="#24105C" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>
    <!-- the head of the count: a glass bead -->
    <circle cx="${hx}" cy="${hy + 6}" r="27" fill="#1C0A50" opacity=".35" filter="url(#${p}blur8)"/>
    <circle cx="${hx}" cy="${hy}" r="26" fill="url(#${p}bead)"/>
    <ellipse cx="${hx - 8}" cy="${hy - 10}" rx="9" ry="5.5" fill="#fff" opacity=".95" transform="rotate(-30 ${hx - 8} ${hy - 10})" filter="url(#${p}blur2)"/>`;
  },
  mono: () => {
    const { r, t } = RING;
    return `
    <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="${t}"/>
    <path d="${arc(256, 256, r, FILL.a0, FILL.a1)}" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/>
    <circle cx="${at(256, 256, r, FILL.a1)[0]}" cy="${at(256, 256, r, FILL.a1)[1]}" r="26" fill="#fff"/>`;
  }
};

/* ════════════════════════════════════════════════════════════════
   4 · Chrono Neon — futuristic
   A chronograph bezel of sixty ticks on obsidian glass; the count sweeps
   round it in light, cyan to violet, and a hand marks the latest tap.
   Time and tally in one: the mark of the reminder and live-timer
   notifications.
   ════════════════════════════════════════════════════════════════ */
const TICKS = 60, LIT = 44;
const NEON = ['#3CF4FF', '#4F8BFF', '#9B5CFF', '#E04CFF'];
const neonTicks = (filterLit) => {
  let dim = '', lit = '';
  for (let i = 0; i < TICKS; i++) {
    const a = -90 + i * 6, major = i % 5 === 0;
    const [x0, y0] = at(256, 256, major ? 128 : 140, a), [x1, y1] = at(256, 256, 164, a);
    const line = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"`;
    if (i < LIT) lit += `${line} stroke="${filterLit ? '#fff' : mixStops(NEON, i / (LIT - 1))}" stroke-width="${major ? 7 : 5.5}"/>`;
    else dim += `${line} stroke-width="${major ? 6 : 4.5}"/>`;
  }
  return { dim, lit };
};
const chrono = {
  id: 'chrono',
  name: 'Chrono Neon',
  family: 'Futuristic',
  idea: 'A chronograph bezel on obsidian glass; the count sweeps round it in light. Ties to the timer and reminder notifications.',
  plate: (p) => `
    <defs>
      <radialGradient id="${p}pl" gradientUnits="userSpaceOnUse" cx="256" cy="226" r="330">
        <stop offset="0" stop-color="#18203A"/><stop offset=".6" stop-color="#0B0F1C"/><stop offset="1" stop-color="#05070D"/>
      </radialGradient>
      <pattern id="${p}grid" width="32" height="32" patternUnits="userSpaceOnUse" x="0" y="0">
        <path d="M32 0H0V32" fill="none" stroke="#9DB7FF" stroke-opacity=".07" stroke-width="1.5"/>
      </pattern>
      <radialGradient id="${p}fade" gradientUnits="userSpaceOnUse" cx="256" cy="256" r="300">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <mask id="${p}gm" maskUnits="userSpaceOnUse" ${BLEED}><rect ${BLEED} fill="url(#${p}fade)"/></mask>
      <radialGradient id="${p}aura" gradientUnits="userSpaceOnUse" cx="256" cy="256" r="230">
        <stop offset=".55" stop-color="#5A4BFF" stop-opacity=".0"/><stop offset=".78" stop-color="#5A4BFF" stop-opacity=".22"/><stop offset="1" stop-color="#5A4BFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect ${BLEED} fill="url(#${p}pl)"/>
    <rect ${BLEED} fill="url(#${p}grid)" mask="url(#${p}gm)"/>
    <rect ${BLEED} fill="url(#${p}aura)"/>`,
  glyph: (p) => {
    const { dim, lit } = neonTicks(false);
    const head = -90 + (LIT - 1) * 6;
    const [hx, hy] = at(256, 256, 152, head);
    const [ex, ey] = at(256, 256, 104, head);
    return `
    <defs>
      <filter id="${p}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="${p}glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
      <linearGradient id="${p}hand" gradientUnits="userSpaceOnUse" x1="256" y1="256" x2="${ex}" y2="${ey}">
        <stop offset="0" stop-color="#E04CFF" stop-opacity=".1"/><stop offset="1" stop-color="#F3B8FF"/>
      </linearGradient>
      <radialGradient id="${p}core">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#BFF8FF"/><stop offset="1" stop-color="#3CF4FF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="256" cy="256" r="112" fill="none" stroke="#9DB7FF" stroke-opacity=".16" stroke-width="2"/>
    <path d="${arc(256, 256, 112, -90, head)}" fill="none" stroke="#7F6BFF" stroke-opacity=".55" stroke-width="2.5"/>
    <g stroke="#9DB7FF" stroke-opacity=".17" stroke-linecap="round">${dim}</g>
    <g stroke-linecap="round" opacity=".9" filter="url(#${p}glow)">${lit}</g>
    <g stroke-linecap="round">${lit}</g>
    <line x1="256" y1="256" x2="${ex}" y2="${ey}" stroke="url(#${p}hand)" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${hx}" cy="${hy}" r="14" fill="#F2A8FF" opacity=".9" filter="url(#${p}glow)"/>
    <circle cx="${hx}" cy="${hy}" r="7.5" fill="#fff"/>
    <circle cx="256" cy="256" r="34" fill="url(#${p}core)" opacity=".85" filter="url(#${p}glow2)"/>
    <circle cx="256" cy="256" r="11" fill="#fff"/>
    <circle cx="256" cy="256" r="24" fill="none" stroke="#3CF4FF" stroke-opacity=".55" stroke-width="2"/>`;
  },
  mono: () => {
    const { dim, lit } = neonTicks(true);
    const head = -90 + (LIT - 1) * 6;
    const [ex, ey] = at(256, 256, 104, head);
    return `
    <g stroke="#fff" stroke-opacity=".4" stroke-linecap="round">${dim}</g>
    <g stroke-linecap="round">${lit}</g>
    <line x1="256" y1="256" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="16" fill="#fff"/>`;
  }
};

/* ════════════════════════════════════════════════════════════════
   5 · Abacus Mono — Swiss / Braun minimal
   Three rods, four beads each; the counted beads step up from one to
   three, a quiet bar chart, and the newest is the one orange bead.
   Graphite on warm white: nothing that is not needed.
   ════════════════════════════════════════════════════════════════ */
const RODS = [
  { y: 186, left: [146, 196, 246], right: [366], hot: 366 },
  { y: 256, left: [146, 196], right: [316, 366] },
  { y: 326, left: [146], right: [266, 316, 366] }
];
const abacus = {
  id: 'abacus',
  name: 'Abacus Mono',
  family: 'Swiss · Braun minimal',
  idea: 'Three rods of beads; the counted beads step up like a bar chart, the newest one in orange. Graphite on warm white.',
  plate: (p) => `
    <defs>
      <linearGradient id="${p}pl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">
        <stop offset="0" stop-color="#F6F4EF"/><stop offset="1" stop-color="#E7E3DA"/>
      </linearGradient>
    </defs>
    <rect ${BLEED} fill="url(#${p}pl)"/>`,
  glyph: (p) => `
    <defs>
      <radialGradient id="${p}bd" cx=".36" cy=".32" r=".75">
        <stop offset="0" stop-color="#4A4A4A"/><stop offset="1" stop-color="#151515"/>
      </radialGradient>
      <radialGradient id="${p}hot" cx=".36" cy=".32" r=".75">
        <stop offset="0" stop-color="#FF8A4C"/><stop offset="1" stop-color="#F0480F"/>
      </radialGradient>
      <filter id="${p}sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>
    </defs>
    <rect x="111" y="150" width="6" height="212" rx="3" fill="#1A1A1A"/>
    <rect x="395" y="150" width="6" height="212" rx="3" fill="#1A1A1A"/>
    ${RODS.map((r) => `<rect x="114" y="${r.y - 2.5}" width="284" height="5" rx="2.5" fill="#1A1A1A"/>`).join('')}
    <g fill="#000" opacity=".22" filter="url(#${p}sh)">
      ${RODS.map((r) => [...r.left, ...r.right].map((x) => `<circle cx="${x}" cy="${r.y + 5}" r="23"/>`).join('')).join('')}
    </g>
    ${RODS.map((r) => [...r.left, ...r.right].map((x) =>
      `<circle cx="${x}" cy="${r.y}" r="23" fill="url(#${p}${x === r.hot ? 'hot' : 'bd'})"/>`).join('')).join('')}`,
  mono: () => `
    <rect x="110" y="150" width="8" height="212" rx="4" fill="#fff"/>
    <rect x="394" y="150" width="8" height="212" rx="4" fill="#fff"/>
    ${RODS.map((r) => `<rect x="114" y="${r.y - 2.5}" width="284" height="5" rx="2.5" fill="#fff"/>`).join('')}
    ${RODS.map((r) => [...r.left, ...r.right].map((x) => `<circle cx="${x}" cy="${r.y}" r="23" fill="#fff"/>`).join('')).join('')}`
};

export const STYLES = [chrono, liquidRing, fluent, material, abacus];
/* the style applied when none is named; change it here to switch for good */
export const DEFAULT_STYLE = 'chrono';
export function styleById(id) {
  const s = STYLES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown icon style "${id}" — one of: ${STYLES.map((x) => x.id).join(', ')}`);
  return s;
}
