/* Iron Canopy — core constants and helpers. Everything hangs off window.IC. */
window.IC = window.IC || {};
(function (IC) {
'use strict';

IC.WW = 57000;         // world width in units (1 unit = 100 m → 5,700 km)
IC.WH = 43000;         // world height (4,300 km)
IC.GS = 10;            // game seconds per real second at 1× speed
IC.TS = 0.06;          // base terrain canvas scale (px per world unit); closer in, tiles take over
IC.MAX_STEP = 0.25;    // largest simulation step, in game seconds
IC.MAXZ = 80;          // closest zoom (screen px per world unit): 80 px per 100 m shows aircraft at the gate
IC.SPEEDS = [1, 2, 4, 8, 16, 32];

let nid = 1;
IC.nid = p => (p || 'e') + (nid++);

/* seeded generator for world generation (mulberry32) */
IC.makeRng = function (seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += f(); return (s - 2) / 0.58; };
  return f;
};

const U = IC.U = {
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  gauss: () => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) / 0.58; },
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  smooth: t => t * t * (3 - 2 * t),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  dxy: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  pick: a => a[Math.floor(Math.random() * a.length)],
  wpick(list) {
    let tot = 0; for (const [, w] of list) tot += w;
    if (tot <= 0) return null;
    let r = Math.random() * tot;
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  },
  angWrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; },
  mod: (a, n) => ((a % n) + n) % n,
  inPoly(x, y, p) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  },
  segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  },
  polyDist(px, py, pts) {
    let m = 1e9;
    for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, U.segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return m;
  },
  /* segment intersection: returns t along a→b or -1 */
  segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy;
    const den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return -1;
    const t = ((cx - ax) * s2 - (cy - ay) * s1) / den, u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
  },
  // radar horizon in world units: 4.12·(√h_radar + √h_target) km
  horizon(mastM, altKm) { return 41.2 * (Math.sqrt(Math.max(1, mastM)) + Math.sqrt(Math.max(1, altKm * 1000))); },
  compass(a) { return ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; },
  hhmm(t) {
    const s = ((t % 86400) + 86400) % 86400, h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },
  day: t => Math.floor(t / 86400) + 1,
  clock: t => `Day ${U.day(t)} · ${U.hhmm(t)}`,
  money(v) {
    const a = Math.abs(v);
    const s = a < 10 && a % 1 ? a.toFixed(1) : Math.round(a).toLocaleString('en-US');
    return (v < 0 ? '−' : '') + '₭' + s + 'M';
  },
  km: u => (u / 10 < 10 ? (u / 10).toFixed(1) : Math.round(u / 10)) + ' km',
  alt: km => km == null ? '—' : km >= 1 ? km.toFixed(km >= 10 ? 0 : 1) + ' km' : Math.round(km * 1000) + ' m',
  kmh: spd => Math.round(spd * 360) + ' km/h',
  /* game seconds → friendly duration */
  dur(gs) {
    if (gs < 90) return Math.max(0, Math.ceil(gs)) + ' s';
    if (gs < 5400) return Math.ceil(gs / 60) + ' min';
    return (gs / 3600).toFixed(1) + ' h';
  },
  /* game seconds → real seconds at 1× (for the "about a minute" style hints) */
  realDur(gs) { const r = gs / IC.GS; return r < 60 ? Math.ceil(r) + ' s' : Math.round(r / 60) + ' min'; },
  pct: f => Math.round(f * 100) + '%',
  esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
};

/* value noise */
function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
U.hash = hash;
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
U.vnoise = vnoise;
U.fbm = (x, y, oct) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 5); i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s; };
/* periodic value noise for tileable textures (period p lattice cells) */
function pnoise(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const X0 = U.mod(xi, p), X1 = U.mod(xi + 1, p), Y0 = U.mod(yi, p), Y1 = U.mod(yi + 1, p);
  const a = hash(X0, Y0), b = hash(X1, Y0), c = hash(X0, Y1), d = hash(X1, Y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
U.pfbm = (x, y, p) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * pnoise(x * f, y * f, p * f); f *= 2; a *= 0.5; } return s; };

/* ---------- event bus: campaign, academy, UI and audio listen here ---------- */
const subs = [];
IC.on = fn => subs.push(fn);
IC.emit = function (S, type, data) { for (const fn of subs) fn(S, type, data); };
IC.campaignEvent = IC.emit;

})(window.IC);
