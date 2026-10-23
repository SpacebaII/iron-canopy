/* Iron Canopy — procedural world generation. Everything here derives from one seed. */
(function (IC) {
'use strict';
const U = IC.U;
const TAU = Math.PI * 2;
const X = 3.17;  // Wave 5 made the map ten times larger by area (3.17 each way)
const M = 1.5 * X;   // distances across the country, relative to wave 3's map (wave 4 made it 1.5 each way)
const K = 1.5 * M;   // map scale relative to the original 800 km layout
const SP = 1.45;     // spacing between towns: with ten times the land and three to four times the towns
/* real width of each class of road (world units): motorway, main, local, access, city ring, avenue, street, lane */
IC.ROAD_W = { hw: 0.42, rd: 0.2, lc: 0.13, sp: 0.11, ring: 0.36, art: 0.2, col: 0.14, st: 0.11, ln: 0.07 };
IC.FOREST_T = 0.56;

/* generation runs in stages; each yield names the stage that comes next, so a browser can let the page draw between
   them and show how far it has got (IC.generateSteps). IC.generate runs them all at once */
IC.generate = (seed, map) => { const g = worldSteps(seed, map); for (;;) { const r = g.next(); if (r.done) return r.value; } };
IC.generateSteps = (seed, map) => worldSteps(seed, map);
/* Authored maps (brief 71): a map file registers a spec in IC.MAPS (js/map-homeland.js). With one, the generator takes
   what the spec gives at each stage (the border, the ridges, the rivers' sources, every city, the motorways...) and
   generates only what it leaves open (villages, fields, forest, streets, lanes, junctions). The seed is the map's name
   and version, so saves regenerate the same world. IC.mapAuthored(W) says whether a world came from a map */
IC.MAPS = IC.MAPS || {};
IC.CAREER_MAP = 'homeland';
IC.mapSeed = A => { let h = 2166136261; for (const ch of `${A.name}@${A.version}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
IC.mapAuthored = W => !!(W && W.map);
// point in polygon ([[x, y], ...]), with a box test first
const inPoly = (x, y, P, bb) => {
  if (bb && (x < bb[0] || y < bb[1] || x > bb[2] || y > bb[3])) return false;
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
};
const polyBox = P => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
IC.inPoly = inPoly; IC.polyBox = polyBox;
/* a polygon as a grid of flags (cell units): 1 inside, 0 outside, 2 on the edge (ask the polygon itself there), so the
   terrain and the height grid can ask about a big shape millions of times */
function polyMask(P, cell) {
  const bb = polyBox(P), i0 = Math.max(0, Math.floor(bb[0] / cell) - 1), j0 = Math.max(0, Math.floor(bb[1] / cell) - 1);
  const nx = Math.ceil(bb[2] / cell) + 2 - i0, ny = Math.ceil(bb[3] / cell) + 2 - j0, m = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = (j0 + j + 0.5) * cell, xs = [];
    for (let i = 0, k = P.length - 1; i < P.length; k = i++) { const [xi, yi] = P[i], [xk, yk] = P[k]; if ((yi > y) !== (yk > y)) xs.push((xk - xi) * (y - yi) / (yk - yi) + xi); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.floor(xs[q] / cell) - i0; i <= Math.floor(xs[q + 1] / cell) - i0; i++) if (i >= 0 && i < nx) m[j * nx + i] = 1;
  }
  // cells the outline passes through are asked exactly
  for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
    const [ax, ay] = P[i], [bx, by] = P[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) / cell * 2) + 1;
    for (let t = 0; t <= n; t++) { const x = ax + (bx - ax) * t / n, y = ay + (by - ay) * t / n, ci = Math.floor(x / cell) - i0, cj = Math.floor(y / cell) - j0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = ci + di, jj = cj + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) m[jj * nx + ii] = 2; } }
  }
  return (x, y) => { if (x < bb[0] || y < bb[1] || x > bb[2] || y > bb[3]) return false; const i = Math.floor(x / cell) - i0, j = Math.floor(y / cell) - j0; if (i < 0 || j < 0 || i >= nx || j >= ny) return false; const v = m[j * nx + i]; return v === 2 ? inPoly(x, y, P, bb) : v === 1; };
}
IC.polyMask = polyMask;
// distance from a point inside a polygon to its edge (0 outside)
const polyIn = (x, y, P, bb) => inPoly(x, y, P, bb) ? U.polyDist(x, y, P.concat([P[0]])) : 0;
function* worldSteps(seed, map) {
  const A = typeof map === 'string' ? IC.MAPS[map] : map || null;
  if (map && !A) throw new Error(`No map called ${map}`);
  if (A) seed = IC.mapSeed(A);
  let R = IC.makeRng(seed);
  const WW = IC.WW, WH = IC.WH;
  const NOX = R() * 900, NOY = R() * 900;
  const fbm = (x, y, o) => U.fbm(x + NOX, y + NOY, o);
  const W = { seed, map: A ? A.name : null, mapVersion: A ? A.version : 0 };
  const byName = (list, n) => list.find(o => o.name === n);
  W.warnings = [];   // what the map asked for that could not be done as asked (the editor shows them)

  /* ---------- names ---------- */
  const used = new Set();
  const uniq = list => { let n, g = 0; do { n = R.pick(list); g++; } while (used.has(n) && g < 50); used.add(n); return n; };
  W.names = A && A.names ? Object.assign({}, A.names) : { H: uniq(IC.NAMES.home), A: uniq(IC.NAMES.hostileA), B: uniq(IC.NAMES.hostileB), C: uniq(IC.NAMES.neutral), D: uniq(IC.NAMES.neutral) };
  W.full = A && A.full ? Object.assign({}, A.full) : {
    H: `Republic of ${W.names.H}`, A: `${W.names.A} ${R.pick(IC.NAMES.suffixA)}`, B: `${W.names.B} ${R.pick(IC.NAMES.suffixB)}`,
    C: `${W.names.C} ${R.pick(IC.NAMES.suffixN)}`, D: `${W.names.D} ${R.pick(IC.NAMES.suffixN)}`
  };
  W.side = { H: 'us', A: 'hostile', B: 'hostile', C: 'neutral', D: 'neutral', S: 'sea' };   // (S: the sea, on an authored map with a coast)
  const placeNames = new Set();
  W.placeName = () => {
    for (let i = 0; i < 120; i++) {
      const n = R.pick(IC.NAMES.pre) + R.pick(IC.NAMES.suf);
      if (!placeNames.has(n) && n.length <= 10) { placeNames.add(n); return n; }
    }
    return 'Novo' + R.int(1, 99);
  };

  /* ---------- nation outline (star-shaped, so inside = radius test) ---------- */
  const cx = A && A.centre ? A.centre[0] : (5925 + R.range(-330, 330)) * M, cy = A && A.centre ? A.centre[1] : (4870 + R.range(-220, 220)) * M;
  W.cx = cx; W.cy = cy;
  const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
  const amp = [R.range(0.07, 0.13), R.range(0.04, 0.09), R.range(0.03, 0.06), R.range(0.015, 0.03)];
  const shapeR = a => 1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]) + amp[3] * Math.sin(11 * a + ph[3]);
  const RX = 2250 * K, RY = 1650 * K;
  // the border's distance from the centre by angle, from a table (asked millions of times while generating). An
  // authored border is a polygon, star-shaped round the centre: a ray from the centre meets it once
  const NRB = 8192, RB = new Float64Array(NRB + 1);
  const rayPoly = (P, a) => {
    const dx = Math.cos(a), dy = Math.sin(a); let best = 0;
    for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
      const [ax, ay] = P[k], [bx, by] = P[i], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - cx) * ey - (ay - cy) * ex) / den, u = ((ax - cx) * dy - (ay - cy) * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    return best;
  };
  /* a drawn border is a smooth polygon; a real one follows streams and surveyed lines, so it is cut in and out by
     noise along its normals (brief 72: up to 20 km over 100 km or so, with a finer grain), except along the coast (the shore
     is the border there, below), and every drawn town, site and place stays at least 6 km inside */
  const roughBorder = P => {
    const pts = [];
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 150)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const N = pts.length, onCoast = p => { const deg = Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI; return (A.coast || []).some(([d0, d1]) => ((deg - d0) % 360 + 360) % 360 <= d1 - d0 + 1); };
    return pts.map((p, i) => {
      if (onCoast(p)) return p;
      const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const d = 420 * (fbm(p[0] / 1400, p[1] / 1400, 4) - 0.5) + 90 * (fbm(p[0] / 250 + 11, p[1] / 250 + 5, 2) - 0.5);
      return [p[0] - ey / L * d, p[1] + ex / L * d];
    });
  };
  if (A && A.border) {
    const P = roughBorder(A.border);
    for (let i = 0; i <= NRB; i++) RB[i] = rayPoly(P, i / NRB * TAU - Math.PI);
    for (const o of (A.cities || []).concat(A.infra || [], A.places || [], A.villages || [])) {
      const d = Math.hypot(o.x - cx, o.y - cy) + 60, f = U.mod(Math.atan2(o.y - cy, o.x - cx) + Math.PI, TAU) / TAU * NRB;
      for (let k = -24; k <= 24; k++) { const i = (Math.round(f) + k + NRB) % NRB, w = 1 - Math.abs(k) / 25; if (RB[i] < d) RB[i] = RB[i] + (d - RB[i]) * w; }
      RB[NRB] = RB[0];
    }
  }
  else for (let i = 0; i <= NRB; i++) { const a = i / NRB * TAU - Math.PI, r = shapeR(a); RB[i] = Math.hypot(Math.cos(a) * RX * r, Math.sin(a) * RY * r); }
  W.borderPt = a => { if (A && A.border) { const r = W.radialB(a); return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; } const r = shapeR(a); return { x: cx + Math.cos(a) * RX * r, y: cy + Math.sin(a) * RY * r }; };
  W.radialB = a => { const f = (U.mod(a + Math.PI, TAU)) / TAU * NRB, i = Math.min(NRB - 1, f | 0), u = f - i; return RB[i] + (RB[i + 1] - RB[i]) * u; };
  W.inHome = (x, y) => Math.hypot(x - cx, y - cy) < W.radialB(Math.atan2(y - cy, x - cx));
  W.depthOut = (x, y) => Math.hypot(x - cx, y - cy) - W.radialB(Math.atan2(y - cy, x - cx));
  W.poly = [];
  for (let i = 0; i < 240; i++) { const p = W.borderPt(i / 240 * TAU); W.poly.push([p.x, p.y]); }

  /* ---------- neighbours ---------- */
  const aA = -Math.PI / 2 + R.range(-0.2, 0.2), wA = R.range(1.9, 2.3);
  const east = A && A.secs ? !!A.east : R() < 0.5, wB = R.range(1.25, 1.6), wC = R.range(1.4, 1.9);
  let secs;
  if (A && A.secs) secs = A.secs.map(s => ({ k: s.k, a0: s.deg * Math.PI / 180 }));
  else if (east) { const b0 = aA - wA / 2, b1 = aA + wA / 2, b2 = b1 + wB, b3 = b2 + wC; secs = [{ k: 'A', a0: b0 }, { k: 'B', a0: b1 }, { k: 'C', a0: b2 }, { k: 'D', a0: b3 }]; }
  else { const b0 = aA - wA / 2, b1 = aA + wA / 2, b2 = b1 + wC, bB = b0 - wB; secs = [{ k: 'B', a0: bB }, { k: 'A', a0: b0 }, { k: 'C', a0: b1 }, { k: 'D', a0: b2 }]; }
  W.secs = secs; W.eastB = east;
  const jph = secs.map(() => [R.range(0, TAU), R.range(0, TAU)]);
  const jag = (i, d, out) => (0.10 * Math.sin(d / (650 * K) + jph[i][0]) + 0.05 * Math.sin(d / (210 * K) + jph[i][1])) * U.clamp(out / (500 * K), 0, 1);
  W.jag = jag;
  W.countryAt = function (x, y) {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
    const rb = W.radialB(a);
    if (d < rb) return 'H';
    const out = d - rb, n = secs.length;
    for (let i = 0; i < n; i++) {
      const s0 = secs[i].a0 + jag(i, d, out), s1 = secs[(i + 1) % n].a0 + jag((i + 1) % n, d, out);
      if (U.mod(a - s0, TAU) < U.mod(s1 - s0, TAU)) return secs[i].k;
    }
    return secs[0].k;
  };
  W.secSpan = k => { const i = secs.findIndex(s => s.k === k); const a0 = secs[i].a0, a1 = secs[(i + 1) % secs.length].a0; return [a0, a0 + U.mod(a1 - a0, TAU)]; };
  W.inHostile = (x, y) => { const c = W.countryAt(x, y); return c === 'A' || c === 'B'; };

  /* ---------- fronts: border stretches facing hostile neighbours ---------- */
  const samples = [];
  for (let i = 0; i < 2400; i++) { const a = i / 2400 * TAU, p = W.borderPt(a); samples.push({ a, x: p.x, y: p.y, k: null }); }
  for (const s of samples) {
    for (let i = 0; i < secs.length; i++) {
      const a0 = secs[i].a0, a1 = secs[(i + 1) % secs.length].a0;
      if (U.mod(s.a - a0, TAU) < U.mod(a1 - a0, TAU)) { s.k = secs[i].k; break; }
    }
  }
  W.fronts = [];
  const STEP = 330 * M;
  for (const k of ['A', 'B']) {
    let start = -1;
    for (let i = 0; i < samples.length; i++) if (samples[i].k === k && samples[(i - 1 + samples.length) % samples.length].k !== k) { start = i; break; }
    if (start < 0) continue;
    const run = [];
    for (let j = 0; j < samples.length; j++) { const s = samples[(start + j) % samples.length]; if (s.k !== k) break; run.push(s); }
    run.splice(0, 16); run.splice(run.length - 16, 16);   // keep clear of the three-country corners
    const pts = [];
    let acc = STEP, prev = run[0];
    for (const s of run) { acc += U.dist(prev, s); prev = s; if (acc >= STEP) { acc = 0; pts.push({ x: s.x, y: s.y }); } }
    if (pts.length > 4) { pts.shift(); pts.pop(); }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      if ((cx - p.x) * nx + (cy - p.y) * ny < 0) { nx = -nx; ny = -ny; }   // inward
      p.nx = nx; p.ny = ny; p.d = 0;
    }
    const N = U.clamp(Math.round((pts.length - 1) / 3.4), 3, k === 'A' ? 6 : 5);
    const sectors = [];
    for (let i = 0; i < N; i++) sectors.push({ i0: Math.round(i * (pts.length - 1) / N), i1: Math.round((i + 1) * (pts.length - 1) / N) });
    W.fronts.push({ key: k, pts, sectors });
  }
  const hsegs = [];
  for (const f of W.fronts) for (let i = 0; i + 1 < f.pts.length; i++) hsegs.push([f.pts[i].x, f.pts[i].y, f.pts[i + 1].x, f.pts[i + 1].y]);
  W.hostileBorderDist = (x, y) => { let m = 1e9; for (const s of hsegs) m = Math.min(m, U.segDist(x, y, s[0], s[1], s[2], s[3])); return m; };

  // the seas (authored maps): polygons of water beyond the coast, and the coast itself is the border there
  W.seas = []; W.coast = [];
  // the drawn coast is a few straight edges; the real one is cut in and out by noise (headlands and coves of 5 to
  // 20 km, with a finer grain) along the edges that run on the border, never on the open sea's edges
  const roughCoast = P => {
    const near = p => W.depthOut(p[0], p[1]) < 80, M = P.length;   // the shore and anything cut into the land, not the open sea
    // room: how far a point may move before it meets another part of the shore (a sound's two sides must not cross)
    const room = (x, y, i) => { let m = 1e9; for (let j = 0; j < M; j++) { if (j === i || j === (i + 1) % M || j === (i + M - 1) % M) continue; const a = P[j], b = P[(j + 1) % M]; m = Math.min(m, U.segDist(x, y, a[0], a[1], b[0], b[1])); } return m; };
    // 1. the drawn edges cut into 3 km pieces along the coast
    const pts = [], on = [], edge = [];
    for (let i = 0; i < M; i++) {
      const a = P[i], b = P[(i + 1) % M], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, c = near(a) && near(b), n = c ? Math.max(1, Math.ceil(L / 30)) : 1;
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); on.push(c); edge.push(i); }
    }
    // 2. each point pushed in or out along the shore's own normal there, less near a sharp corner (the head of a
    //    sound) so the two sides never cross, and never farther than a third of the way to another shore
    const N = pts.length, turn = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (!on[i]) continue;
      const a = pts[(i + N - 1) % N], p = pts[i], b = pts[(i + 1) % N];
      turn[i] = Math.abs(U.mod(Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]) + Math.PI, TAU) - Math.PI);
    }
    const out = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i]; if (!on[i]) { out.push(p); continue; }
      let taper = 1; for (let j = -10; j <= 10; j++) taper = Math.min(taper, 1 - Math.min(1, turn[(i + j + N) % N] / (Math.PI / 2)));
      const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1, nx = -ey / L, ny = ex / L;
      let d = (320 * (fbm(p[0] / 700, p[1] / 700, 4) - 0.5) + 70 * (fbm(p[0] / 140 + 7, p[1] / 140 + 3, 2) - 0.5)) * taper;
      const lim = 0.35 * room(p[0], p[1], edge[i]); d = U.clamp(d, -lim, lim);
      out.push([p[0] + nx * d, p[1] + ny * d]);
    }
    // 3. the shore is a curve, not a chain of straight edges: two rounds of corner cutting along the coast
    let Q = out, C = on;
    for (let r = 0; r < 2; r++) {
      const nq = [], nc = [];
      for (let i = 0; i < Q.length; i++) {
        const p = Q[i], q = Q[(i + 1) % Q.length];
        if (!C[i] || !C[(i + 1) % Q.length]) { nq.push(p); nc.push(C[i]); continue; }
        nq.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); nc.push(true, true);
      }
      Q = nq; C = nc;
    }
    return { poly: Q, coast: Q.filter((p, i) => C[i]) };
  };
  if (A && A.seas) for (const sp of A.seas) { const { poly: P, coast } = roughCoast(sp.poly); W.seas.push({ name: sp.name || 'the sea', poly: P, bb: polyBox(P), mask: polyMask(P, 20) }); if (coast.length) W.coast.push(coast); }
  W.inSea = (x, y) => { for (const s of W.seas) if (s.mask(x, y)) return true; return false; };
  // along the coast the border is the shore itself: the radial table follows the roughened coast (its farthest
  // crossing, so a headland is home and a cove is sea, never a sliver of abroad between the two)
  if (W.coast.length && A.coast) {
    const rayLine = (P, a) => {
      const dx = Math.cos(a), dy = Math.sin(a); let best = 0;
      for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1], [bx, by] = P[i], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - cx) * ey - (ay - cy) * ex) / den, u = ((ax - cx) * dy - (ay - cy) * dx) / den;
        if (t > best && u >= 0 && u <= 1) best = t;
      }
      return best;
    };
    for (let i = 0; i <= NRB; i++) {
      const a = i / NRB * TAU - Math.PI, deg = a * 180 / Math.PI;
      if (!A.coast.some(([d0, d1]) => ((deg - d0) % 360 + 360) % 360 <= d1 - d0 + 1 || ((deg - d0) % 360 + 360) % 360 >= 359)) continue;
      let best = 0; for (const C of W.coast) best = Math.max(best, rayLine(C, a));
      if (best > 0) RB[i] = best;
    }
  }
  W.plateaus = (A && A.plateaus || []).map(p => { const P = p.poly.map(q => [q[0], q[1]]); return { name: p.name, h: p.h, edge: p.edge || 250, poly: P, bb: polyBox(P) }; });
  W.biomeRegions = (A && A.biomes || []).map(b => { const P = b.poly.map(q => [q[0], q[1]]); return { biome: b.biome, poly: P, bb: polyBox(P) }; });
  yield 'relief';
  /* ---------- relief ---------- */
  const ridges = [];
  const arc = (a0, a1, off, am, w, n) => {
    const pts = []; n = n || 24; w *= 1.6;   // bigger ranges on a bigger map
    for (let i = 0; i <= n; i++) {
      const a = U.lerp(a0, a1, i / n), p = W.borderPt(a), r = Math.hypot(p.x - cx, p.y - cy), o = (off + R.range(-135, 135)) * M;
      pts.push([cx + (p.x - cx) * (r + o) / r, cy + (p.y - cy) * (r + o) / r]);
    }
    return { pts, a: am, w };
  };
  const [A0, A1] = W.secSpan('A'), [B0, B1] = W.secSpan('B'), [C0, C1] = W.secSpan('C'), [D0, D1] = W.secSpan('D');
  if (A && A.ridges) {
    // authored: the crest as points, its height a, its width w, a style for the terrain's painter (rocky, old,
    // volcano: one point, w its radius), and gaps where a pass cuts the crest down
    for (const r of A.ridges) ridges.push({ pts: r.pts.map(p => [p[0], p[1]]), a: r.a, w: r.w, name: r.name, style: r.style || 'old', core: r.core, gaps: (r.gaps || []).map(g => [g[0], g[1], g[2] || 120]) });
  } else {
  ridges.push(arc(A0 + 0.12, A1 - 0.12, R.range(180, 480), R.range(0.55, 0.8), R.range(450, 630)));
  if (R() < 0.8) ridges.push(arc(B0 + 0.1, B1 - 0.1, R.range(90, 390), R.range(0.4, 0.6), 420));
  ridges.push(arc(C0 + 0.2, C1 - 0.2, R.range(600, 1350), R.range(0.3, 0.5), 450));
  ridges.push(arc(D0 + 0.2, D1 - 0.2, R.range(450, 1200), R.range(0.25, 0.45), 420));
  ridges.push(arc(A0 + 0.3, A1 - 0.3, R.range(1500, 1950), R.range(0.35, 0.55), 500));
  // hill country inside: a few ranges wandering across the interior
  for (let q = 0; q < 3; q++) {
    let a = R.range(0, TAU), rr = R.range(0.2, 0.6), px = cx + Math.cos(a) * RX * rr, py = cy + Math.sin(a) * RY * rr, h = R.range(0, TAU);
    const pts = [];
    for (let i = 0; i < 10; i++) { pts.push([px, py]); h += R.range(-0.5, 0.5); px += Math.cos(h) * 170 * M; py += Math.sin(h) * 170 * M; }
    ridges.push({ pts, a: R.range(0.28, 0.42), w: R.range(420, 640) });
  }
  }
  for (const r of ridges) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0 - r.w, y0 - r.w, x1 + r.w, y1 + r.w];
    // each piece of the crest with its own box, so the height grid skips the pieces far away
    r.segs = [];
    for (let i = 0; i + 1 < r.pts.length; i++) { const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1]; r.segs.push([ax, ay, bx, by, Math.min(ax, bx) - r.w, Math.min(ay, by) - r.w, Math.max(ax, bx) + r.w, Math.max(ay, by) + r.w]); }
    // (a single point: a lone peak)
    if (r.pts.length === 1) { const [ax, ay] = r.pts[0]; r.segs.push([ax, ay, ax, ay, ax - r.w, ay - r.w, ax + r.w, ay + r.w]); }
    if (!r.name) r.name = IC.NAMES.ridge[R.int(0, IC.NAMES.ridge.length - 1)];
  }
  W.ridges = ridges;
  const tx = R.range(-1, 1) * 0.00002 / X, ty = R.range(-1, 1) * 0.00002 / X;
  const plateaus = W.plateaus, seas = W.seas;
  W.height = (x, y) => {
    let h = fbm(x / 2400, y / 2400) * 0.55 + (x - cx) * tx + (y - cy) * ty;
    for (const r of ridges) {
      if (x < r.bb[0] || y < r.bb[1] || x > r.bb[2] || y > r.bb[3]) continue;
      let d = r.w;
      for (const q of r.segs) if (x >= q[4] && y >= q[5] && x <= q[6] && y <= q[7]) d = Math.min(d, U.segDist(x, y, q[0], q[1], q[2], q[3]));
      if (d < r.w) {
        let k = 1;
        // a pass: the crest drops to a third of its height over the gap's radius
        if (r.gaps) for (const g of r.gaps) { const e = U.dxy(x, y, g[0], g[1]); if (e < g[2]) k = Math.min(k, 0.33 + 0.67 * (e / g[2]) * (e / g[2])); }
        h += r.a * k * Math.pow(1 - d / r.w, 2) * (0.55 + 0.9 * fbm(x / 390 + 11, y / 390 + 5, 3));
      }
    }
    // high ground as a whole (authored): a plateau rises over its edge and stays up
    for (const p of plateaus) { const d = polyIn(x, y, p.poly, p.bb); if (d > 0) h += p.h * Math.min(1, d / p.edge); }
    // the sea bed, falling away from the shore
    if (seas.length && W.inSea(x, y)) {
      // (the shore is where the distance matters; 200 units out every neighbour is sea and the bed is at its depth)
      let near = false; for (let q = 0; q < 8 && !near; q++) near = !W.inSea(x + Math.cos(q * TAU / 8) * 200, y + Math.sin(q * TAU / 8) * 200);
      let d = 200; if (near) { d = 1e9; for (const s of seas) if (s.mask(x, y)) d = Math.min(d, U.polyDist(x, y, s.poly.concat([s.poly[0]]))); }
      h = -0.08 - 0.3 * Math.min(1, d / 200);
    }
    return h;
  };
  const GC = 40, GW = Math.floor(WW / GC) + 1, GH = Math.floor(WH / GC) + 1;
  const hg = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) hg[j * GW + i] = W.height(i * GC, j * GC);
  W.hg = hg; W.GW = GW; W.GH = GH; W.GC = GC;
  W.hAt = (x, y) => {
    const fx = U.clamp(x / GC, 0, GW - 1.001), fy = U.clamp(y / GC, 0, GH - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const a = hg[j * GW + i], b = hg[j * GW + i + 1], c = hg[(j + 1) * GW + i], d = hg[(j + 1) * GW + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  W.slopeAt = (x, y) => Math.hypot(W.hAt(x + 20, y) - W.hAt(x - 20, y), W.hAt(x, y + 20) - W.hAt(x, y - 20));

  yield 'rivers';
  /* ---------- rivers and lakes ---------- */
  let bl = Float32Array.from(hg);
  for (let pass = 0; pass < 3; pass++) bl = blur5(bl, GW, GH);
  // water drains outward towards the neighbours: a gentle bowl-to-rim tilt
  // (an authored map drains towards its sea instead: W.drain is a point in it)
  const drain = A && A.drain ? { x: A.drain[0], y: A.drain[1] } : null;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) bl[j * GW + i] -= drain ? U.dxy(i * GC, j * GC, drain.x, drain.y) * 0.000014 / X : U.dxy(i * GC, j * GC, cx, cy) * 0.000022 / X;
  const owner = new Int16Array(GW * GH).fill(-1);
  W.rivers = []; W.lakes = [];
  const srcs = [];
  // sources: the highest 18% of ground in and around the country
  const inl = [];
  for (let j = 4; j < GH - 4; j += 3) for (let i = 4; i < GW - 4; i += 3) if (W.depthOut(i * GC, j * GC) < 1050) inl.push(bl[j * GW + i]);
  inl.sort((a, b) => b - a);
  const hiT = inl[Math.floor(inl.length * 0.18)] || 0.5;
  // authored rivers: each rises where the map says and runs downhill from there like any other, under its own name;
  // one given as points runs where it is drawn
  /* an authored river drawn as a run of points (via): between each pair it finds its own way over the ground, downhill
     where it can and along the low ground where it must, so it bends with the valleys the ridges make; the last point
     may lie in the sea or on another river. The rest of a river's dice (its width, a lake at a sink) are the same */
  /* a routed river runs nearly straight over a plain; a real one meanders. Each point is pushed across the river's
     line by two slow waves (periods about 90 and 35 km, up to 20 km), only where the ground is flat (in a valley the
     river stays on its floor), not near the points the map drew (the river still runs where it was put, through its
     towns), and never onto another river, into the sea or off the map */
  const meander = (pts, via, id) => {
    const n = pts.length; if (n < 8) return;
    const ph = (id * 2.399) % 6.283, out = [];
    let s = 0;
    for (let q = 0; q < n; q++) {
      const p = pts[q], a = pts[Math.max(0, q - 2)], b = pts[Math.min(n - 1, q + 2)];
      if (q) s += U.dxy(pts[q - 1][0], pts[q - 1][1], p[0], p[1]);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const ci = U.clamp(Math.round(p[0] / GC), 1, GW - 2), cj = U.clamp(Math.round(p[1] / GC), 1, GH - 2);
      const gx = (bl[cj * GW + ci + 1] - bl[cj * GW + ci - 1]) / 2, gy = (bl[(cj + 1) * GW + ci] - bl[(cj - 1) * GW + ci]) / 2;
      const flat = U.clamp(1 - Math.hypot(gx, gy) * 25, 0, 1);
      let near = 1e9; for (const v of via) near = Math.min(near, U.dxy(v[0], v[1], p[0], p[1]));
      const k = flat * U.clamp(near / 300, 0, 1) * (q < 3 || q > n - 4 ? 0 : 1);
      const d = k * (140 * Math.sin(s / 143 + ph) + 60 * Math.sin(s / 56 + ph * 1.7));
      out.push([p[0] + nx * d, p[1] + ny * d]);
    }
    for (let q = 0; q < n; q++) {
      const [x, y] = out[q], c = U.clamp(Math.round(y / GC), 0, GH - 1) * GW + U.clamp(Math.round(x / GC), 0, GW - 1);
      if (x < GC || y < GC || x > WW - GC || y > WH - GC || (owner[c] >= 0 && owner[c] !== id) || (seas.length && W.inSea(x, y))) continue;
      pts[q][0] = x; pts[q][1] = y;
    }
  };
  const wander = c => (((c * 2654435761 + 0x9e3779b9) >>> 0) % 1024) / 1024;
  const riverWay = (a, b) => {
    const ca = [U.clamp(Math.round(a[0] / GC), 1, GW - 2), U.clamp(Math.round(a[1] / GC), 1, GH - 2)], cb = [U.clamp(Math.round(b[0] / GC), 1, GW - 2), U.clamp(Math.round(b[1] / GC), 1, GH - 2)];
    const t = cb[1] * GW + cb[0], s0 = ca[1] * GW + ca[0], g = new Map(), par = new Map(), hf = [], hv = [];
    const push = (f, v) => { let i = hf.length; hf.push(f); hv.push(v); while (i > 0) { const q = (i - 1) >> 1; if (hf[q] <= hf[i]) break; [hf[q], hf[i]] = [hf[i], hf[q]]; [hv[q], hv[i]] = [hv[i], hv[q]]; i = q; } };
    const pop = () => { const v = hv[0], lf = hf.pop(), lv = hv.pop(); if (hf.length) { hf[0] = lf; hv[0] = lv; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hf.length) break; if (c + 1 < hf.length && hf[c + 1] < hf[c]) c++; if (hf[c] >= hf[i]) break; [hf[c], hf[i]] = [hf[i], hf[c]]; [hv[c], hv[i]] = [hv[i], hv[c]]; i = c; } } return v; };
    const hx = c => Math.hypot((c % GW) - cb[0], ((c / GW) | 0) - cb[1]) * GC;
    g.set(s0, 0); push(hx(s0), s0);
    const done = new Set();
    for (let n = 0; hf.length && n < 400000; n++) {
      const c = pop(); if (c === t) break; if (done.has(c)) continue; done.add(c);
      const ci = c % GW, cj = (c / GW) | 0, hc = bl[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ii = ci + di, jj = cj + dj; if (ii < 1 || jj < 1 || ii >= GW - 1 || jj >= GH - 1) continue;
        const d = jj * GW + ii, L = Math.hypot(di, dj) * GC, dh = bl[d] - hc;
        // flat and low is cheap, climbing dear: the way keeps to the valley floor; a grain of noise per cell so a
        // river on a plain wanders like one that found its own way instead of running straight between two points
        const v = g.get(c) + L * (1 + 2.5 * Math.max(0, bl[d]) + 0.9 * wander(d)) + 3000 * Math.max(0, dh) + 150 * Math.max(0, -dh);
        if (v < (g.has(d) ? g.get(d) : Infinity)) { g.set(d, v); par.set(d, c); push(v + hx(d), d); }
      }
    }
    if (!par.has(t) && t !== s0) return null;
    const cells = []; for (let c = t; c !== undefined; c = par.get(c)) { cells.push(c); if (c === s0) break; }
    return cells.reverse();
  };
  if (A && A.rivers) for (const r of A.rivers) {
    if (r.via) {
      const id = W.rivers.length, pts = []; let end = 'end';
      for (let q = 0; q + 1 < r.via.length && end === 'end'; q++) {
        const cells = riverWay(r.via[q], r.via[q + 1]);
        if (!cells) { W.warnings.push(`${r.name}: no way from point ${q + 1} to point ${q + 2}`); break; }
        for (let k = q ? 1 : 0; k < cells.length; k++) {
          const c = cells[k], x = (c % GW) * GC, y = ((c / GW) | 0) * GC, o = owner[c];
          pts.push([x, y]);
          if (o >= 0 && o !== id) { end = 'join'; break; }
          if (seas.length && W.inSea(x, y)) { end = 'sea'; break; }
          owner[c] = id;
        }
      }
      if (pts.length < 4) continue;
      // drawn to end beside another river: it joins it there
      if (end === 'end') { const [ex, ey] = pts[pts.length - 1]; let best = null, bd = GC * 3.5; for (const o of W.rivers) for (const p of o.pts) { const d = U.dxy(p[0], p[1], ex, ey); if (d < bd) { bd = d; best = p; } } if (best) { pts.push([best[0], best[1]]); end = 'join'; } }
      meander(pts, r.via, id);
      let L = 0; for (let q = 1; q < pts.length; q++) L += U.dxy(pts[q - 1][0], pts[q - 1][1], pts[q][0], pts[q][1]);
      W.rivers.push({ pts, w: r.w || U.clamp(3 + L * 0.0009, 3, 13), name: r.name, end });
      continue;
    }
    if (r.pts) { const pts = r.pts.map(p => [p[0], p[1]]); let L = 0; for (let q = 1; q < pts.length; q++) L += U.dist({ x: pts[q - 1][0], y: pts[q - 1][1] }, { x: pts[q][0], y: pts[q][1] }); W.rivers.push({ pts, w: r.w || U.clamp(3 + L * 0.0009, 3, 13), name: r.name, fixed: true }); continue; }
    const i = U.clamp(Math.round(r.src[0] / GC), 4, GW - 5), j = U.clamp(Math.round(r.src[1] / GC), 4, GH - 5);
    srcs.push({ i, j, x: i * GC, y: j * GC, name: r.name });
  }
  else for (let k = 0; k < 30000 && srcs.length < 60; k++) {
    const i = R.int(4, GW - 5), j = R.int(4, GH - 5), x = i * GC, y = j * GC;
    if (bl[j * GW + i] < hiT || W.depthOut(x, y) > 1050) continue;
    if (srcs.some(s => U.dxy(s.x, s.y, x, y) < 1400)) continue;
    srcs.push({ i, j, x, y });
  }
  for (const r of W.rivers) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } r.bb = [x0, y0, x1, y1]; }
  for (const s of srcs) {
    const id = W.rivers.length, pts = [];
    let i = s.i, j = s.j, end = 'none', climb = 0;
    for (let step = 0; step < 5000; step++) {
      pts.push([i * GC, j * GC]);
      owner[j * GW + i] = id;
      let best = null, bh = bl[j * GW + i], lo = null, lh = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) { best = 'out'; break; }
        if (owner[jj * GW + ii] === id) continue;
        const h = bl[jj * GW + ii] + R() * 0.0012;
        if (h < bh) { bh = h; best = [ii, jj]; }
        if (h < lh) { lh = h; lo = [ii, jj]; }
      }
      if (best === 'out') { end = 'out'; break; }
      if (!best) {
        // breach small depressions instead of stopping in every hollow
        climb += lh - bl[j * GW + i];
        if (!lo || climb > 0.05) { end = 'sink'; break; }
        best = lo;
      }
      [i, j] = best;
      const o = owner[j * GW + i];
      if (o >= 0 && o !== id) { pts.push([i * GC, j * GC]); end = 'join'; break; }
      // the sea: the river ends a little way into it
      if (seas.length && W.inSea(i * GC, j * GC)) { pts.push([i * GC, j * GC]); end = 'sea'; break; }
    }
    if (pts.length < (s.name ? 6 : 20)) { if (s.name) W.warnings.push(`${s.name} runs only ${(pts.length * GC / 10).toFixed(0)} km from its source and was dropped`); continue; }
    const r = { pts, w: U.clamp(3 + pts.length * GC * 0.0009, 3, 13), name: s.name || W.placeName() + ' River', end };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0, y0, x1, y1];
    W.rivers.push(r);
    if (end === 'sink' && W.lakes.length < 16 && !(A && A.lakes)) { const [x, y] = pts[pts.length - 1]; if (!W.lakes.some(l => U.dxy(l.x, l.y, x, y) < 1200)) W.lakes.push({ x, y, rx: R.range(100, 220), ry: R.range(60, 130), rot: R.range(0, 3) }); }
  }
  if (A && A.lakes) for (const l of A.lakes) W.lakes.push({ x: l.x, y: l.y, rx: l.rx, ry: l.ry, rot: l.rot || 0, name: l.name });
  else for (let k = 0; k < 2000 && W.lakes.length < 14; k++) {
    const x = R.range(cx - 2700 * M, cx + 2700 * M), y = R.range(cy - 1950 * M, cy + 1950 * M);
    if (!W.inHome(x, y) || W.hAt(x, y) > 0.35 || W.depthOut(x, y) > -375) continue;
    W.lakes.push({ x, y, rx: R.range(110, 240), ry: R.range(60, 120), rot: R.range(0, 3) });
  }
  // the terrain asks this for every field it draws: a box test first, the rotation worked out once per lake. The lakes
  // are kept in plain number arrays: with objects, the browser's compiler threw its code for this away some twenty
  // thousand times while drawing the map (it found no type feedback for the property reads), costing seconds
  const NL = W.lakes.length, LK = new Float64Array(NL * 7);
  W.lakes.forEach((l, i) => LK.set([l.x, l.y, Math.cos(-l.rot), Math.sin(-l.rot), Math.max(l.rx, l.ry), l.rx, l.ry], i * 7));
  W.inLake = (x, y) => {
    if (seas.length && W.inSea(x, y)) return true;
    for (let i = 0; i < NL * 7; i += 7) {
      const dx = x - LK[i], dy = y - LK[i + 1], R = LK[i + 4];
      if (dx > R || dx < -R || dy > R || dy < -R) continue;
      const c = LK[i + 2], s = LK[i + 3], X = dx * c - dy * s, Y = dx * s + dy * c;
      if ((X / LK[i + 5]) ** 2 + (Y / LK[i + 6]) ** 2 < 1) return true;
    }
    return false;
  };
  // coarse river-distance grid (50 units) for terrain queries
  const RG = 50, RGW = Math.ceil(WW / RG), RGH = Math.ceil(WH / RG);
  const rdist = new Float32Array(RGW * RGH).fill(1e4);
  for (const r of W.rivers) for (let q = 0; q < r.pts.length; q++) {
    const [x, y] = r.pts[q], gi = Math.floor(x / RG), gj = Math.floor(y / RG);
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const ii = gi + di, jj = gj + dj; if (ii < 0 || jj < 0 || ii >= RGW || jj >= RGH) continue;
      const d = U.dxy(x, y, (ii + 0.5) * RG, (jj + 0.5) * RG);
      if (d < rdist[jj * RGW + ii]) rdist[jj * RGW + ii] = d;
    }
  }
  W.riverDist = (x, y) => { const i = U.clamp(Math.floor(x / RG), 0, RGW - 1), j = U.clamp(Math.floor(y / RG), 0, RGH - 1); return rdist[j * RGW + i]; };
  /* forest: thick on slopes and hill country, in strips along rivers, thin on the flat farmland, none above the
     tree line; a finer noise breaks the edges and opens clearings. forestD is a density, forest where it passes
     IC.FOREST_T (about a fifth of the country) */
  W.forestD = (x, y) => {
    const h = W.hAt(x, y);
    if (h < 0.1 || h > 1.02) return 0;
    const sl = U.clamp(W.slopeAt(x, y) / 0.05, 0, 1), rd = W.riverDist(x, y);
    return U.fbm(x / 630 + 33 + NOX, y / 630 + 77, 3) + 0.2 * sl + (rd < 30 ? 0.18 * (1 - rd / 30) : 0)
      + 0.1 * U.clamp((h - 0.4) / 0.3, 0, 1) - 0.1 * U.clamp((0.32 - h) / 0.15, 0, 1) - 0.4 * U.clamp((h - 0.88) / 0.14, 0, 1)
      + 0.16 * (U.fbm(x / 110 + NOY, y / 110 + 9, 2) - 0.5);
  };
  W.forestAt = (x, y) => W.forestD(x, y) > IC.FOREST_T;

  yield 'cities';
  /* ---------- cities ---------- */
  const cand = [];
  for (let k = 0; k < 24000; k++) {
    const x = R.range(cx - 4050 * M, cx + 4050 * M), y = R.range(cy - 3000 * M, cy + 3000 * M);
    if (!W.inHome(x, y) || W.inLake(x, y)) continue;
    const h = W.hAt(x, y); if (h > 0.72) continue;
    if (W.depthOut(x, y) > -165) continue;
    const hb = W.hostileBorderDist(x, y);
    const score = (1 - h) + (W.riverDist(x, y) < 240 ? 0.35 : 0) + R() * 0.35 - (hb < 390 ? 0.5 : 0);
    cand.push({ x, y, score, hb });
  }
  cand.sort((a, b) => b.score - a.score);
  const cities = [];
  // dry, low ground near a point: the map's cities and places are moved there when they were drawn in the water or on a peak
  const dryNear = (x, y, reach) => {
    const ok = (px, py) => W.inHome(px, py) && !W.inLake(px, py) && W.hAt(px, py) < 0.72 && W.depthOut(px, py) < -60;
    if (ok(x, y)) return null;
    for (let d = 20; d <= (reach || 400); d += 20) for (let q = 0; q < 16; q++) { const a = q / 16 * TAU, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (ok(px, py)) return { x: px, y: py }; }
    return null;
  };
  W.dryNear = dryNear;
  if (A && A.cities) {
    for (const c of A.cities) {
      let x = c.x, y = c.y;
      // a city drawn on a river sits on its bank: the nearest point of that river (or of any)
      if (c.onRiver) { let best = null, bd = 900; for (const r of W.rivers) { if (typeof c.onRiver === 'string' && r.name !== c.onRiver) continue; for (const p of r.pts) { const d = U.dxy(p[0], p[1], x, y); if (d < bd) { bd = d; best = p; } } } if (best) { x = best[0]; y = best[1]; } else W.warnings.push(`${c.name}: no river within 90 km to stand on`); }
      const m = dryNear(x, y, 600); if (m) { W.warnings.push(`${c.name} was moved ${(U.dxy(m.x, m.y, x, y) / 10).toFixed(0)} km onto dry ground`); x = m.x; y = m.y; }
      cities.push({ x, y, score: 1, hb: W.hostileBorderDist(x, y), spec: c });
    }
    if (!cities.length) throw new Error('The map has no cities');
  } else {
  const capC = cand.filter(c => U.dxy(c.x, c.y, cx, cy) < 1275 * M).sort((a, b) => b.score - a.score)[0] || cand[0];
  cities.push(capC);
  // the rest by the lie of the land, but spread out: a candidate far from every city picked so far scores higher, so
  // the lowlands do not take them all and leave the uplands empty
  const NCITY = 60, SPREAD = 3400;
  for (const c of cand) c.dn = U.dist(c, capC);
  while (cities.length < NCITY) {
    let best = null, bs = -1e9;
    for (const c of cand) { if (c.dn < 1170 * SP) continue; const v = c.score + 0.9 * Math.min(1, c.dn / SPREAD); if (v > bs) { bs = v; best = c; } }
    if (!best) break;
    cities.push(best);
    for (const c of cand) { const d = U.dist(c, best); if (d < c.dn) c.dn = d; }
  }
  // make sure there are front-line towns on both fronts
  for (const f of W.fronts) {
    const nk = 'nf' + f.key, near = c => c[nk] != null ? c[nk] : c[nk] = nearF(c);
    const nearF = c => { let m = 1e9; for (let i = 0; i + 1 < f.pts.length; i++) m = Math.min(m, U.segDist(c.x, c.y, f.pts[i].x, f.pts[i].y, f.pts[i + 1].x, f.pts[i + 1].y)); return m; };
    for (let need = 0; need < 2; need++) {
      if (cities.filter(c => near(c) < 1000).length >= 2) break;
      const b = cand.filter(c => near(c) > 380 && near(c) < 950 && cities.every(o => U.dxy(o.x, o.y, c.x, c.y) > 600))[0];
      if (b) { if (cities.length >= NCITY) cities.pop(); cities.push(b); } else break;
    }
  }
  }
  W.cities = cities.map((c, i) => {
    const sp = c.spec;
    const pop = sp && sp.pop ? sp.pop : i === 0 ? R.int(1600, 2200) : i <= 3 ? R.int(400, 760) : i <= 10 ? R.int(260, 560) : R.int(90, 340);
    const name = sp ? sp.name : W.placeName(), grid = R.range(0, Math.PI / 2);
    if (sp) placeNames.add(name);
    return { id: 'c' + i, kind: 'city', name, x: c.x, y: c.y, pop, capital: i === 0, grid: sp && sp.grid != null ? sp.grid : grid, r: 45 + Math.sqrt(pop) * 1.7, region: sp ? sp.region : undefined, role: sp ? sp.role : undefined };
  });
  // the story's places (authored): landmarks by id with a role, where events and cutscenes can point
  W.places = (A && A.places || []).map(p => { const m = p.dry === false ? null : dryNear(p.x, p.y, 300); return { id: p.id, name: p.name, x: m ? m.x : p.x, y: m ? m.y : p.y, role: p.role, desc: p.desc, region: p.region }; });

  /* ---------- villages (home and abroad) ---------- */
  W.villages = [];
  const allTowns = () => W.cities.concat(W.villages);
  // villages just outside the bigger cities, which the city grows round and swallows
  for (const c of W.cities) {
    if (c.pop < 250) continue;
    for (let t = 0, got = 0; t < 40 && got < (c.pop > 900 ? 3 : 1); t++) {
      const a = R.range(0, TAU), d = c.r * R.range(0.85, 1.3), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (!W.inHome(x, y) || W.inLake(x, y) || W.hAt(x, y) > 0.7 || W.depthOut(x, y) > -60 || W.riverDist(x, y) < 8) continue;
      if (W.villages.some(o => U.dxy(o.x, o.y, x, y) < c.r * 0.6)) continue;
      W.villages.push({ id: 'v' + W.villages.length, kind: 'village', name: W.placeName(), x, y, pop: R.int(4, 25), home: true, k: 'H', r: R.range(14, 22), grid: R.range(0, Math.PI / 2), near: c.id });
      got++;
    }
  }
  // villages the map names (the story's), then the rest
  if (A && A.villages) for (const v of A.villages) {
    const m = dryNear(v.x, v.y, 300), x = m ? m.x : v.x, y = m ? m.y : v.y;
    placeNames.add(v.name);
    W.villages.push({ id: 'v' + W.villages.length, kind: 'village', name: v.name, x, y, pop: v.pop || R.int(10, 40), home: true, k: 'H', r: v.r || R.range(16, 26), grid: R.range(0, Math.PI / 2), role: v.role });
  }
  let nHome = W.villages.length, nAbroad = 0;
  const NV = 300, NA = 160;
  for (let k = 0; k < 60000 && (nHome < NV || nAbroad < NA); k++) {
    const home = R() < 0.6;
    const x = home ? R.range(cx - 3700 * M, cx + 3700 * M) : R.range(200, WW - 200), y = home ? R.range(cy - 2700 * M, cy + 2700 * M) : R.range(200, WH - 200);
    if (W.inLake(x, y) || W.hAt(x, y) > 0.8) continue;
    if (home !== W.inHome(x, y)) continue;
    if (home ? nHome >= NV : nAbroad >= NA) continue;
    if (home && W.depthOut(x, y) > -60) continue;
    if (!home && Math.abs(W.depthOut(x, y)) < 60) continue;
    if (allTowns().some(o => U.dxy(o.x, o.y, x, y) < (o.kind === 'city' ? o.r + 260 * SP : 330 * SP))) continue;
    W.villages.push({ id: 'v' + W.villages.length, kind: 'village', name: W.placeName(), x, y, pop: R.int(4, 40), home, k: W.countryAt(x, y), r: R.range(14, 26), grid: R.range(0, Math.PI / 2) });
    if (home) nHome++; else nAbroad++;
  }
  // a clearing round every village (brief 54): its people felled the forest to its hedges, so a village in the woods
  // stands in a field of its own and the trees are not painted over its houses
  // (the forest is asked about millions of times while the cities grow: a flat grid of flags says at once whether any
  // village is near, and only then are the few villages of that cell looked up)
  { const base = W.forestD, VG = 64, NX = Math.ceil(IC.WW / VG) + 1, NY = Math.ceil(IC.WH / VG) + 1, flag = new Uint8Array(NX * NY), vg = new Map(), vk = (i, j) => j * NX + i;
    for (const v of W.villages) { const rr = v.r * 1.5; for (let j = Math.max(0, Math.floor((v.y - rr) / VG)); j <= Math.min(NY - 1, Math.floor((v.y + rr) / VG)); j++) for (let i = Math.max(0, Math.floor((v.x - rr) / VG)); i <= Math.min(NX - 1, Math.floor((v.x + rr) / VG)); i++) { const k = vk(i, j); flag[k] = 1; let l = vg.get(k); if (!l) vg.set(k, l = []); l.push(v); } }
    W.forestD = (x, y) => {
      let d = base(x, y); if (d <= 0) return d;
      const i = Math.floor(x / VG), j = Math.floor(y / VG); if (i < 0 || j < 0 || i >= NX || j >= NY || !flag[vk(i, j)]) return d;
      for (const v of vg.get(vk(i, j))) { const t = 1 - U.dxy(x, y, v.x, v.y) / (v.r * 1.5); if (t > 0) d -= 0.5 * Math.min(1, t * 2.5); }
      return d;
    };
    W.forestAt = (x, y) => W.forestD(x, y) > IC.FOREST_T; }

  /* ---------- infrastructure ---------- */
  W.infra = [];
  const taken = () => W.cities.concat(W.infra);
  const spot = (near, dmin, dmax, test) => {
    for (let t = 0; t < 240; t++) {
      const a = R.range(0, TAU), d = R.range(dmin, dmax), x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d;
      if (!W.inHome(x, y) || W.inLake(x, y) || W.hAt(x, y) > 0.7 || W.depthOut(x, y) > -180) continue;
      if (taken().some(o => U.dxy(o.x, o.y, x, y) < (o.kind === 'city' ? o.r + 70 : 160))) continue;
      if (test && !test(x, y)) continue;
      return { x, y };
    }
    return null;
  };
  const byPop = W.cities.slice().sort((a, b) => b.pop - a.pop);
  const addInfra = (o) => { if (o.x == null) return null; o.id = o.id || ('i' + W.infra.length); W.infra.push(o); return o; };
  // the map's own sites (airports, air bases, plants, power stations, the dam), by kind: a kind it gives is not placed
  // by the dice as well
  const AI = A && A.infra || [], given = kind => AI.some(i => i.kind === kind);
  for (const i of AI) {
    const city = i.city ? byName(W.cities, i.city) : null;
    if (i.city && !city) { W.warnings.push(`${i.name || i.kind}: no city called ${i.city}`); }
    const m = dryNear(i.x, i.y, 300), x = m ? m.x : i.x, y = m ? m.y : i.y;
    if (m) W.warnings.push(`${i.name || i.kind} was moved ${(U.dxy(m.x, m.y, i.x, i.y) / 10).toFixed(0)} km onto dry ground`);
    const o = { id: i.id, kind: i.kind, name: i.name || (city ? `${city.name} ${i.kind === 'airport' ? (city.capital ? 'International' : 'Airport') : i.kind === 'factory' ? 'Works' : i.kind === 'power' ? 'Power Station' : 'Air Base'}` : W.placeName()), x, y };
    if (city) o.city = city.id;
    if (i.kind === 'airport') o.rev = city && city.capital ? 10 : 5;
    if (i.kind === 'factory') o.lines = i.lines || 1;
    if (i.kind === 'airbase' && i.ac) o.ac = i.ac;
    addInfra(o);
  }
  if (!given('airport')) for (const c of byPop.slice(0, 3)) {
    // flat ground, with room for a big airport (some 10 km) clear of rivers and lakes
    const p = spot(c, c.r + 90, c.r + 260, (x, y) => W.slopeAt(x, y) < 0.05 && W.riverDist(x, y) > 70 && ![0, 1, 2, 3, 4, 5].some(k => W.inLake(x + Math.cos(k) * 60, y + Math.sin(k) * 60))); if (!p) continue;
    addInfra({ kind: 'airport', name: `${c.name} ${c.capital ? 'International' : 'Airport'}`, x: p.x, y: p.y, rev: c.capital ? 10 : 5, city: c.id });
  }
  const cap = W.cities[0];
  if (!W.infra.some(i => i.id === 'ab_fwd')) {
    let best = null, bs = 1e9;
    for (const c of cand) {
      const hb = c.hb;
      if (hb < 1200 || hb > 2100 || taken().some(o => U.dxy(o.x, o.y, c.x, c.y) < 375)) continue;
      const s = U.dxy(c.x, c.y, cap.x, cap.y) * 0.6 + Math.abs(hb - 1575);
      if (s < bs) { bs = s; best = c; }
    }
    if (best) addInfra({ id: 'ab_fwd', kind: 'airbase', name: `${W.placeName()} Air Base`, x: best.x, y: best.y });
  }
  if (!W.infra.some(i => i.id === 'ab_rear')) {
    let best = null, bs = -1e9;
    for (const c of cand) {
      const hb = c.hb, dc = U.dxy(c.x, c.y, cap.x, cap.y);
      if (dc < 675 || dc > 2250 * M || taken().some(o => U.dxy(o.x, o.y, c.x, c.y) < 375)) continue;
      if (hb > bs) { bs = hb; best = c; }
    }
    if (best) addInfra({ id: 'ab_rear', kind: 'airbase', name: `${W.placeName()} Air Base`, x: best.x, y: best.y });
  }
  const rearCities = W.cities.slice(1).sort((a, b) => W.hostileBorderDist(b.x, b.y) - W.hostileBorderDist(a.x, a.y));
  const facNames = ['Arms Works', 'Munitions', 'Motor Works'];
  if (!given('factory')) for (let i = 0; i < 3 && i < rearCities.length; i++) {
    const p = spot(rearCities[i], rearCities[i].r + 60, rearCities[i].r + 200); if (!p) continue;
    addInfra({ kind: 'factory', name: `${rearCities[i].name} ${facNames[i]}`, x: p.x, y: p.y, lines: i === 0 ? 2 : 1, city: rearCities[i].id });
  }
  if (!given('power')) {
    let dam = null;
    for (const r of W.rivers) for (const [x, y] of r.pts) {
      if (!W.inHome(x, y) || W.hAt(x, y) < 0.42 || W.depthOut(x, y) > -375 || W.hostileBorderDist(x, y) < 750) continue;
      if (taken().some(o => U.dxy(o.x, o.y, x, y) < 225)) continue;
      dam = { x, y }; break;
    }
    const nc = c => W.cities.slice().sort((a, b) => U.dxy(a.x, a.y, c.x, c.y) - U.dxy(b.x, b.y, c.x, c.y))[0];
    if (dam) addInfra({ kind: 'power', name: `${nc(dam).name} Hydro Dam`, x: dam.x, y: dam.y });
    // a power station for every dozen or so cities, spread over the country
    const pcs = [W.cities[R.int(1, Math.min(4, W.cities.length - 1))]];
    for (let i = 5; i < W.cities.length; i += 12) pcs.push(W.cities[R.int(i, Math.min(i + 11, W.cities.length - 1))]);
    for (const pc of pcs) {
      if (!pc || W.infra.some(o => o.kind === 'power' && U.dist(o, pc) < 1500)) continue;
      const p = spot(pc, pc.r + 80, pc.r + 240); if (p) addInfra({ kind: 'power', name: `${pc.name} Power Station`, x: p.x, y: p.y });
    }
  }
  const dp = A && A.depot ? { x: A.depot[0], y: A.depot[1] } : spot(cap, cap.r + 120, cap.r + 320); W.depotPos = dp || { x: cap.x + 300, y: cap.y + 225 };
  W.garrisons = [];
  for (const c of [cap].concat(W.cities.slice(1, 11))) { const p = spot(c, c.r + 60, c.r + 240); if (p) W.garrisons.push({ x: p.x, y: p.y, name: `${c.name} Garrison` }); }

  IC.cityStyles(W, IC.makeRng((seed * 613 + 29) >>> 0));
  // the map's own word on a city's look: its style (eu, us, new, ind) and its plan (par, lon, ny, chi, dxb)
  if (A && A.cities) for (const c of W.cities) { const sp = byName(A.cities, c.name); if (!sp) continue; if (sp.style) c.style = sp.style; if (sp.tpl) c.tpl = sp.tpl; if (sp.core) c.core = sp.core; }

  /* ---------- runway headings; the layouts themselves are built per game (airport.js) ---------- */
  for (const b of W.infra) if (b.kind === 'airbase' || b.kind === 'airport') b.rwyA = R.range(0, Math.PI);

  yield 'roads';
  /* ---------- roads and railways (see buildNetwork below) ---------- */
  W.crossings = [];
  const crossingAt = (k, i, a) => {
    // on the border as W.inHome draws it (borderPt's angle is not quite the point's own)
    const q = W.borderPt(a), qa = Math.atan2(q.y - cy, q.x - cx), qr = W.radialB(qa), p = { x: cx + Math.cos(qa) * qr, y: cy + Math.sin(qa) * qr };
    const r = Math.hypot(p.x - cx, p.y - cy), far = { x: U.clamp(cx + (p.x - cx) * (r + 1350 * SP) / r, 100, WW - 100), y: U.clamp(cy + (p.y - cy) * (r + 1350 * SP) / r, 100, WH - 100) };
    W.crossings.push({ id: 'x' + k + i, x: p.x, y: p.y, k, far });
  };
  if (A && A.crossings) A.crossings.forEach((x, i) => { const c = crossingAt(x.k, i, x.deg * Math.PI / 180); W.crossings[W.crossings.length - 1].name = x.name; });
  else for (const k of ['C', 'D']) {
    const [a0, a1] = W.secSpan(k);
    const n = R.int(2, 3);
    for (let i = 0; i < n; i++) crossingAt(k, i, U.lerp(a0, a1, (i + 1) / (n + 1)) + R.range(-0.08, 0.08));
  }
  buildNetwork(W, IC.makeRng((seed * 7919 + 13) >>> 0), fbm, A);
  // what follows (foreign places, airways, enemy sites) draws from its own stream, so changes to the roads and
  // towns above never move them
  R = IC.makeRng((seed * 2654435761 + 97) >>> 0);
  const edges = W.edges;
  const wiggle = (A, B, amp) => {
    const L = U.dist(A, B);
    const n = Math.max(2, Math.ceil(L / 240)), am = Math.min(amp, L * 0.06), f1 = R.range(1, 3), p1 = R.range(0, TAU);
    const nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = Math.sin(Math.PI * t) * am * Math.sin(t * Math.PI * f1 + p1);
      pts.push({ x: A.x + (B.x - A.x) * t + nx * o, y: A.y + (B.y - A.y) * t + ny * o });
    }
    return pts;
  };

  // (the bridges are found once the roads into the cities have become their avenues, after the towns)
  yield 'bridges';
  /* ---------- foreign places ---------- */
  const radialPt = (k, dmin, dmax, spacing, others) => {
    const [a0, a1] = W.secSpan(k);
    for (let shrink = 1; shrink > 0.2; shrink *= 0.75) for (let t = 0; t < 90; t++) {
      const a = R.range(a0 + 0.1, a1 - 0.1), dep = R.range(dmin, dmax) * shrink, p = W.borderPt(a), r = Math.hypot(p.x - cx, p.y - cy);
      const x = cx + (p.x - cx) * (r + dep) / r, y = cy + (p.y - cy) * (r + dep) / r;
      if (x < 120 || x > WW - 120 || y < 90 || y > WH - 120) continue;
      if (W.countryAt(x, y) !== k || W.inLake(x, y)) continue;
      if (others && others.some(o => U.dxy(o.x, o.y, x, y) < spacing)) continue;
      return { x, y };
    }
    const p = W.borderPt((a0 + a1) / 2);
    return { x: U.clamp(p.x + (p.x - cx) * 0.2, 120, WW - 120), y: U.clamp(p.y + (p.y - cy) * 0.2, 90, WH - 120) };
  };
  W.foreign = [];
  for (const k of ['A', 'B', 'C', 'D']) {
    const hostile = W.side[k] === 'hostile';
    for (let i = 0; i < (hostile ? 9 : 6); i++) {
      const front = hostile && i < 4;
      // the towns and airports abroad lie a few hundred kilometres past the border, not out at the map's edge
      const p = radialPt(k, front ? 300 : 1050 * 1.5 * SP, front ? 800 : 2700 * 1.5 * SP, 700 * SP, W.foreign);
      W.foreign.push({ id: 'f' + k + i, kind: 'ftown', k, name: W.placeName(), x: p.x, y: p.y, apt: i === 4 || (!hostile && i === 0), frontier: front, pop: front ? R.int(60, 180) : R.int(120, 600), r: front ? 55 : 70 });
    }
  }

  /* ---------- civil airways ---------- */
  W.airways = [];
  const ports = W.foreign.filter(f => f.apt).map(f => ({ x: f.x, y: f.y, name: f.name, k: f.k }));
  const homeApts = W.infra.filter(i => i.kind === 'airport').map(i => ({ x: i.x, y: i.y, name: i.name, k: 'H', id: i.id }));
  // gateways far off the map edge for long-haul traffic
  const gate = (a) => ({ x: U.clamp(cx + Math.cos(a) * 9000 * M, -600, WW + 600), y: U.clamp(cy + Math.sin(a) * 9000 * M, -600, WH + 600), name: 'long-haul', k: 'X', edge: true });
  const neutral = ports.filter(p => W.side[p.k] === 'neutral'), hostileP = ports.filter(p => W.side[p.k] === 'hostile');
  for (const a of neutral) for (const b of neutral) if (a !== b && a.k !== b.k) W.airways.push({ a, b, kind: 'over' });
  for (const h of homeApts) { for (const n of neutral) W.airways.push({ a: h, b: n, kind: 'intl' }); }
  for (let i = 0; i < homeApts.length; i++) for (let j = i + 1; j < homeApts.length; j++) W.airways.push({ a: homeApts[i], b: homeApts[j], kind: 'dom' });
  for (const n of neutral) W.airways.push({ a: n, b: gate(Math.atan2(n.y - cy, n.x - cx) + R.range(-0.6, 0.6)), kind: 'long' });
  for (const h of homeApts) W.airways.push({ a: h, b: gate(W.secSpan(R.pick(['C', 'D'])).reduce((s, v) => s + v, 0) / 2), kind: 'long' });
  const hp = hostileP.concat(W.foreign.filter(f => W.side[f.k] === 'hostile' && !f.frontier).map(f => ({ x: f.x, y: f.y, name: f.name, k: f.k })));
  for (let i = 0; i < hp.length; i++) for (let j = i + 1; j < hp.length; j++) if (hp[i].k === hp[j].k) W.airways.push({ a: hp[i], b: hp[j], kind: 'hostile' });
  for (const h of hostileP) W.airways.push({ a: h, b: gate(Math.atan2(h.y - cy, h.x - cx)), kind: 'hostile' });
  for (const w of W.airways) w.len = U.dist(w.a, w.b);

  /* ---------- enemy installations ---------- */
  W.esites = [];
  // weapon ranges are real: short-range sites keep their distances from the border; bases and missile brigades sit
  // further back in the larger country behind it
  const BACK = { airbase: 2, cm: 2, bm: 1.6, mrbm: 2.5, hgv: 2.5, drone: 1.4, staging: 1.3 };
  const SITE = (k, kind, dmin, dmax, extra) => {
    const b = 1.5 * (BACK[kind] || 1), p = radialPt(k, dmin * b, dmax * b, 330, W.esites.concat(W.foreign));
    const s = Object.assign({ id: 'es' + W.esites.length, k, kind, x: p.x, y: p.y }, extra || {});
    W.esites.push(s); return s;
  };
  const nB = W.names.B;
  SITE('A', 'airbase', 900, 1600, { name: `${W.placeName()} Air Base`, ac: { ftr: 8, str: 6, sead: 4, ewj: 2, bmr: 0 } });
  SITE('A', 'airbase', 900, 1600, { name: `${W.placeName()} Air Base`, ac: { ftr: 6, str: 4, sead: 2, ewj: 1, bmr: 3 } });
  SITE('B', 'airbase', 800, 1500, { name: `${W.placeName()} Air Base`, ac: { ftr: 6, str: 4, sead: 2, ewj: 1, bmr: 1 } });
  SITE('A', 'drone', 450, 1200, { name: `Drone Site ${W.placeName()}`, inv: { owa: 45, isr: 4, jdr: 4, lm: 10 }, regen: { owa: 5, isr: 0.3, jdr: 0.6, lm: 1.5 } });
  SITE('A', 'drone', 450, 1200, { name: `Drone Site ${W.placeName()}`, inv: { owa: 40, isr: 3, jdr: 2, lm: 8 }, regen: { owa: 5, isr: 0.3, jdr: 0.5, lm: 1.2 } });
  SITE('B', 'drone', 450, 1100, { name: `Drone Site ${W.placeName()}`, inv: { owa: 35, isr: 3, jdr: 2, lm: 6 }, regen: { owa: 4, isr: 0.3, jdr: 0.4, lm: 1 } });
  SITE('A', 'cm', 1300, 2200, { name: `Cruise Missile Bde ${R.int(10, 40)}`, inv: { lacm: 16, mcm: 0 }, regen: { lacm: 0.6, mcm: 0.2 } });
  SITE('B', 'cm', 1100, 2000, { name: `Missile Regiment ${R.int(50, 90)}`, inv: { lacm: 10, scm: 6 }, regen: { lacm: 0.4, scm: 0.25 } });
  SITE('A', 'bm', 1100, 1900, { name: `Missile Brigade ${R.int(2, 9)}`, tels: 3, inv: { srbm: 18, marv: 0 }, regen: { srbm: 0.5, marv: 0.15 } });
  SITE('B', 'bm', 900, 1700, { name: `${nB} Rocket Forces`, tels: 2, inv: { srbm: 10 }, regen: { srbm: 0.3 } });
  SITE('A', 'mrbm', 1900, 3000, { name: 'Strategic Missile Base', tels: 2, inv: { mrbm: 8, pen: 24 }, regen: { mrbm: 0.08, pen: 0.3 } });
  SITE('A', 'hgv', 1800, 2800, { name: 'Hypersonic Test Range', inv: { hgv: 4 }, regen: { hgv: 0.04 } });
  SITE('A', 'rkt', 220, 420, { name: `Rocket Artillery Bn ${R.int(30, 60)}`, tels: 2, inv: { rkt: 120 }, regen: { rkt: 18 } });
  SITE('A', 'rkt', 220, 420, { name: `Rocket Artillery Bn ${R.int(61, 90)}`, tels: 2, inv: { rkt: 120 }, regen: { rkt: 18 } });
  SITE('B', 'rkt', 220, 420, { name: `${nB} Artillery Group`, tels: 2, inv: { rkt: 90 }, regen: { rkt: 14 } });
  for (const k of ['A', 'B']) {
    SITE(k, 'staging', 800, 1300, { name: `${W.placeName()} Staging Area` });
    SITE(k, 'supply', 330, 650, { name: `Supply Depot ${W.placeName()}` });
    SITE(k, 'supply', 330, 650, { name: `Supply Depot ${W.placeName()}` });
  }
  // enemy road network: staging → depots, bases, towns
  W.eroads = [];
  for (const k of ['A', 'B']) {
    const pts = W.esites.filter(s => s.k === k && s.kind !== 'hgv' && s.kind !== 'mrbm').concat(W.foreign.filter(f => f.k === k));
    const inT = [pts.find(s => s.kind === 'staging')];
    const rest = pts.filter(p => p !== inT[0]);
    while (rest.length) {
      let best = null, bd = 1e12;
      for (const a of inT) for (const b of rest) { const d = U.dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
      W.eroads.push({ a: best[0], b: best[1], pts: wiggle(best[0], best[1], 120) });
      inT.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
    }
  }

  // the neighbours' own roads (brief 57), from a stream of their own so the home dice stay as they were
  foreignNetwork(W, IC.makeRng((seed * 104729 + 17) >>> 0), fbm);

  /* ---------- terrain for ground combat ---------- */
  W.townAt = (x, y) => {
    if (W.builtAt(x, y)) for (const c of W.cities) if (U.dxy(x, y, c.x, c.y) < c.r * 1.6) return c;
    for (const v of W.villages) if (U.dxy(x, y, v.x, v.y) < v.r + 25) return v;
    for (const f of W.foreign) if (U.dxy(x, y, f.x, f.y) < f.r) return f;
    return null;
  };
  W.terrainAt = (x, y) => {
    if (W.townAt(x, y)) return 'urban';
    if (W.riverDist(x, y) < 70) return 'river';
    if (W.forestAt(x, y)) return 'forest';
    if (W.hAt(x, y) > 0.55) return 'hills';
    return 'open';
  };
  // farmland weight for detail rendering
  // farmland rings every town: a coarse grid of how farmed the land is (0 inside built-up areas)
  const FGC = 40, FGW = Math.ceil(IC.WW / FGC) + 1, FGH = Math.ceil(IC.WH / FGC) + 1, farm = new Float32Array(FGW * FGH);
  const hv = W.villages.filter(v => v.home);
  const ring = (o, R0, f) => {
    const i0 = Math.max(0, Math.floor((o.x - R0) / FGC)), i1 = Math.min(FGW - 1, Math.ceil((o.x + R0) / FGC));
    const j0 = Math.max(0, Math.floor((o.y - R0) / FGC)), j1 = Math.min(FGH - 1, Math.ceil((o.y + R0) / FGC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * FGW + i, e = Math.hypot(i * FGC - o.x, j * FGC - o.y); if (e < R0 && farm[k] >= 0) farm[k] = f(e, farm[k]); }
  };
  for (const v of hv) ring(v, 260, (e, w) => Math.max(w, 0.75 * (1 - e / 260) + 0.15));
  // farmland rings every city too, right up to its edge: the built-up ground itself is W.builtAt (after the towns)
  for (const c of W.cities) ring(c, c.r * 3.6, (e, w) => Math.max(w, 0.9 * (1 - e / (c.r * 3.6)) + 0.2));
  const built = new Set(), BC = 2, bkey = (i, j) => i * 32768 + j;
  // which cells of the farm grid have any built ground at all: most of the map has none, and the set is slow to ask
  const builtC = new Uint8Array(FGW * FGH), BCK = FGC / BC;
  const mayBuild = (x, y) => { const i = Math.floor(x / FGC), j = Math.floor(y / FGC); return i < 0 || j < 0 || i >= FGW || j >= FGH || builtC[j * FGW + i] === 1; };
  W.builtAt = (x, y) => built.has(bkey(Math.floor(x / BC), Math.floor(y / BC)));
  W.farmAt = (x, y) => {
    const h = W.hAt(x, y);
    if (h > 0.68 || W.inLake(x, y) || (mayBuild(x, y) && built.has(bkey(Math.floor(x / BC), Math.floor(y / BC))))) return 0;
    const fx = U.clamp(x / FGC, 0, FGW - 1.001), fy = U.clamp(y / FGC, 0, FGH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    const a = farm[j * FGW + i], b = farm[j * FGW + i + 1], c = farm[(j + 1) * FGW + i], d = farm[(j + 1) * FGW + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) return 0;   // built up, no fields
    const fw = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    // fields thin out up the hillsides
    return Math.min(1, Math.max(fw, h < 0.4 ? 0.3 : 0.12)) * U.clamp((0.68 - h) / 0.14, 0, 1);
  };
  yield 'towns';
  /* ---------- streets, districts and buildings; lanes across the farmland ---------- */
  fieldGrid(W, fbm);
  buildTowns(W, IC.makeRng((seed * 131 + 7) >>> 0), fbm);
  // a gate laid on a junction leaves a road piece of no length between the two nodes: the gate becomes that
  // junction (its other roads move over), or the junction stage would make a roundabout out of a point
  for (const e of W.edges.slice()) {
    if (e.pts.length >= 2 && e.pts.some(p => U.dist(p, e.pts[0]) > 1e-6)) continue;
    const from = e.a, to = e.b; if (from === to) { W.edges.splice(W.edges.indexOf(e), 1); continue; }
    W.edges.splice(W.edges.indexOf(e), 1);
    for (const o of W.edges) { if (o.a === from) o.a = to; if (o.b === from) o.b = to; }
    delete W.nodes[from];
  }
  // the roads into the cities have become their avenues (cities.js): number the roads again, measure them
  W.edges.forEach((e, i) => { e.id = 'e' + i; e.len = 0; for (let k = 1; k < e.pts.length; k++) e.len += U.dist(e.pts[k - 1], e.pts[k]); });
  for (const k in W.nodes) W.nodes[k].deg = 0;
  for (const e of W.edges) for (const k of [e.a, e.b]) W.nodes[k].deg++;
  /* ---------- bridges where roads cross rivers ---------- */
  riverBridges(W);
  yield 'junctions';
  // the built-up ground: every block with its yard, in 200 m cells (no fields there, and it counts as town);
  // abroad the fields run up to the towns' blocks
  const markBuilt = (b, pad) => {
    const e = Math.max(b.w, b.h) / 2 + pad;
    for (let i = Math.floor((b.x - e) / BC); i <= Math.floor((b.x + e) / BC); i++) for (let j = Math.floor((b.y - e) / BC); j <= Math.floor((b.y + e) / BC); j++) {
      built.add(bkey(i, j));
      const ci = Math.floor(i / BCK), cj = Math.floor(j / BCK); if (ci >= 0 && cj >= 0 && ci < FGW && cj < FGH) builtC[cj * FGW + ci] = 1;
    }
  };
  for (const t of W.cities) for (const b of t.blocks) markBuilt(b, 0.8);
  // a village's gardens, yards and green are not fields either (brief 54)
  for (const v of W.villages) if (v.plan && v.home) { for (const q of v.plan.plots) markBuilt(q, 0.2); for (const q of v.plan.yards) markBuilt(q, 0.2); if (v.plan.green) markBuilt({ x: v.plan.green.x, y: v.plan.green.y, w: v.plan.green.rx * 2, h: v.plan.green.ry * 2 }, 0.2); }
  for (const c of W.cities) if (c.fringe) for (const it of c.fringe.items) markBuilt(it, 0.3);
  junctions(W);
  // bounding boxes, so drawing and traffic can skip lines out of view
  const bbox = l => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of l.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } l.bb = [x0, y0, x1, y1]; };
  for (const l of W.edges.concat(W.lanes, W.rails, W.ramps)) bbox(l);
  roadBridges(W);
  // where a road crosses a railway it goes over it on a bridge
  W.railX = [];
  for (const r of W.rails) for (const e of W.edges) {
    if (e.bb[0] > r.bb[2] || e.bb[2] < r.bb[0] || e.bb[1] > r.bb[3] || e.bb[3] < r.bb[1]) continue;
    for (let i = 1; i < e.pts.length; i++) for (let q = 1; q < r.pts.length; q++) {
      const a = e.pts[i - 1], b = e.pts[i], c = r.pts[q - 1], d = r.pts[q];
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.min(a.x, b.x) > Math.max(c.x, d.x) || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.min(a.y, b.y) > Math.max(c.y, d.y)) continue;
      const t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
      if (t < 0) continue;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (!W.railX.some(o => U.dxy(o.x, o.y, x, y) < 2)) W.railX.push({ x, y, a: Math.atan2(b.y - a.y, b.x - a.x), cls: e.cls });
    }
  }
  for (const c of W.cities.concat(W.foreign)) for (const l of c.streets) bbox(l);

  return W;
}

/* bridges where roads cross rivers */
function riverBridges(W) {
  W.bridges = [];
  for (const e of W.edges) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    for (const r of W.rivers) {
      if (r.bb[0] > x1 || r.bb[2] < x0 || r.bb[1] > y1 || r.bb[3] < y0) continue;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x), sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);
        if (sx1 < r.bb[0] || sx0 > r.bb[2] || sy1 < r.bb[1] || sy0 > r.bb[3]) continue;
        for (let q = 2; q < r.pts.length; q += 2) {
          const c = r.pts[q - 2], d = r.pts[q];
          if (Math.max(c[0], d[0]) < sx0 || Math.min(c[0], d[0]) > sx1 || Math.max(c[1], d[1]) < sy0 || Math.min(c[1], d[1]) > sy1) continue;
          const t = U.segX(a.x, a.y, b.x, b.y, c[0], c[1], d[0], d[1]);
          if (t < 0) continue;
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          // (in town every avenue over the river has its own bridge)
          if (W.bridges.some(o => U.dxy(o.x, o.y, x, y) < (e.city ? 6 : 40))) continue;
          W.bridges.push({ id: 'br' + W.bridges.length, kind: 'bridge', x, y, edge: e.id, cls: e.cls, a: Math.atan2(b.y - a.y, b.x - a.x), river: r.name, name: `${r.name.replace(' River', '')} Bridge`, abroad: e.abroad || undefined });
        }
      }
    }
  }
}

/* a 5 × 5 box blur (edges average what they have), as a row pass then a column pass; kept out of IC.generate so
   the engine optimises the loops */
function blur5(bl, GW, GH) {
  const rs = new Float64Array(GW * GH), nb = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0; for (let ii = Math.max(0, i - 2); ii <= Math.min(GW - 1, i + 2); ii++) s += bl[j * GW + ii]; rs[j * GW + i] = s; }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    let s = 0; const j0 = Math.max(0, j - 2), j1 = Math.min(GH - 1, j + 2);
    for (let jj = j0; jj <= j1; jj++) s += rs[jj * GW + i];
    nb[j * GW + i] = s / ((Math.min(GW - 1, i + 2) - Math.max(0, i - 2) + 1) * (j1 - j0 + 1));
  }
  return nb;
}

/* ---------- which way the fields lie ----------
   Fields line up with the road beside them; away from roads they follow the contour of a slope, and on open flat
   land they drift slowly from district to district. Directions are kept modulo 90° (a field grid looks the same
   turned a quarter), blended as vectors at four times the angle and smoothed, so nothing changes abruptly. */
function fieldGrid(W, fbm) {
  const FC = 100, gw = Math.ceil(IC.WW / FC) + 1, gh = Math.ceil(IC.WH / FC) + 1;
  let vx = new Float32Array(gw * gh), vy = new Float32Array(gw * gh);
  // road segments in 100-unit buckets
  const BK = 100, bw = Math.ceil(IC.WW / BK), buckets = new Map();
  for (const e of W.edges) if (e.cls !== 'hw') for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], k = Math.floor((a.y + b.y) / 2 / BK) * bw + Math.floor((a.x + b.x) / 2 / BK);
    if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push([a.x, a.y, b.x, b.y]);
  }
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * FC, y = j * FC, bi = Math.floor(x / BK), bj = Math.floor(y / BK);
    let sx = 0, sy = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const q of buckets.get((bj + dj) * bw + bi + di) || []) {
      const d = U.segDist(x, y, q[0], q[1], q[2], q[3]); if (d > 120) continue;
      const a = Math.atan2(q[3] - q[1], q[2] - q[0]) * 4, w = (1 - d / 120) * 2;
      sx += Math.cos(a) * w; sy += Math.sin(a) * w;
    }
    const hx = W.hAt(x + 20, y) - W.hAt(x - 20, y), hy = W.hAt(x, y + 20) - W.hAt(x, y - 20), g = Math.hypot(hx, hy);
    if (g > 1e-4) { const a = (Math.atan2(hy, hx) + Math.PI / 2) * 4, w = U.clamp(g / 0.03, 0, 1) * 0.8; sx += Math.cos(a) * w; sy += Math.sin(a) * w; }
    const a = fbm(x / 2600 + 51, y / 2600 + 13, 2) * Math.PI * 8; sx += Math.cos(a) * 0.25; sy += Math.sin(a) * 0.25;
    vx[j * gw + i] = sx; vy[j * gw + i] = sy;
  }
  for (let pass = 0; pass < 2; pass++) {
    const nx = new Float32Array(gw * gh), ny = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      let sx = 0, sy = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = U.clamp(i + di, 0, gw - 1), jj = U.clamp(j + dj, 0, gh - 1), k = jj * gw + ii, w = di || dj ? 1 : 2; sx += vx[k] * w; sy += vy[k] * w; }
      nx[j * gw + i] = sx; ny[j * gw + i] = sy;
    }
    vx = nx; vy = ny;
  }
  W.fieldAng = (x, y) => {
    const fx = U.clamp(x / FC, 0, gw - 1.001), fy = U.clamp(y / FC, 0, gh - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * gw + i;
    const X = vx[k] * (1 - u) * (1 - v) + vx[k + 1] * u * (1 - v) + vx[k + gw] * (1 - u) * v + vx[k + gw + 1] * u * v;
    const Y = vy[k] * (1 - u) * (1 - v) + vy[k + 1] * u * (1 - v) + vy[k + gw] * (1 - u) * v + vy[k + gw + 1] * u * v;
    return Math.atan2(Y, X) / 4;
  };
}

/* ---------- road and rail network ----------
   Roads are laid on a coarse cost grid (RC units a cell) by A*. Slopes, forest and river crossings cost more;
   lakes, airfields and foreign soil are closed; running along a road already built is cheap, so a new road
   joins the network instead of running beside it. The grid links the roads use then become the graph: places,
   and cells where three or more links meet, are nodes, and the runs between them are edges. */
const RC = 60;
const RANK = { sp: 1, lc: 2, rd: 3, hw: 4 }, CLS = [null, 'sp', 'lc', 'rd', 'hw'];
// 16 neighbours, so roads can run at gentle angles and not only along the grid and its diagonals
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
const MLEN = MOVES.map(([x, y]) => Math.hypot(x, y) * RC);
// how each class of line prices the ground: slope, river crossings, running next to (not on) a road, reuse by rank
const HOW = {
  hw: { slope: 2.4, bridge: 5, near: 0.5, reuse: [1, 1, 1, 0.75, 0.42], hk: 0.5, byVil: true },   // (round villages, not through them)
  rd: { slope: 1.2, bridge: 4, near: 0.6, reuse: [1, 0.55, 0.45, 0.4, 0.42], hk: 0.5 },
  // (local and access roads do not run along motorways: they would join them at grade)
  lc: { slope: 0.8, bridge: 3, near: 0.4, reuse: [1, 0.45, 0.38, 0.36, 6], hk: 0.35 },
  sp: { slope: 0.6, bridge: 3, near: 0.2, reuse: [1, 0.4, 0.36, 0.36, 6], hk: 0 },
  rail: { slope: 5, bridge: 2, near: 0, reuse: [1, 0.3, 0.3, 0.3, 0.3], hk: 0.5 },
  // a main road out of a town the motorways reach, on its own line (city streets join only lesser roads)
  rdOwn: { slope: 1.2, bridge: 4, near: 0.6, reuse: [1, 0.55, 0.45, 0.4, 6], hk: 0 }
};

function costGrid(W, fbm, soil) {
  const GW = Math.ceil(IC.WW / RC), GH = Math.ceil(IC.WH / RC), N = GW * GH;
  const h = new Float32Array(N), base = new Float32Array(N), wet = new Uint8Array(N);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, x = (i + 0.5) * RC, y = (j + 0.5) * RC;
    const out = W.depthOut(x, y);
    // (our soil, a cell and a half short of the border; or the soil a neighbour's roads are laid on, brief 57)
    if ((soil ? !soil(x, y) : out > RC * 1.5) || W.inLake(x, y)) { base[k] = -1; continue; }
    h[k] = W.hAt(x, y);
    base[k] = 1 + (W.forestAt(x, y) ? 0.4 : 0) + (Math.abs(out) < RC ? 1.5 : 0) + 0.3 * fbm(x / 260, y / 260, 2);
    wet[k] = W.riverDist(x, y) < RC * 0.55 ? 1 : 0;
  }
  return { GW, GH, N, h, base, wet };
}
function layer(G) {
  return { G, link: new Map(), adj: new Map(), use: new Uint8Array(G.N), near: new Uint8Array(G.N), shut: new Uint8Array(G.N),
    g: new Float64Array(G.N), par: new Int32Array(G.N), seen: new Uint32Array(G.N), shut2: new Uint32Array(G.N), gen: 0, hf: [], hv: [] };
}
const lkey = (a, b, N) => a < b ? a * N + b : b * N + a;
/* would the straight move a→b cut through a link already laid (roads must meet at junctions, not pass through each other)? */
function cuts(T, ax, ay, bx, by) {
  const GW = T.G.GW;
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
    const c = y * GW + x; if (!T.use[c] || (x === ax && y === ay) || (x === bx && y === by)) continue;
    for (const d of T.adj.get(c)) {
      const dx = d % GW, dy = (d / GW) | 0;
      if ((dx === ax && dy === ay) || (dx === bx && dy === by)) continue;
      const t = U.segX(ax, ay, bx, by, x, y, dx, dy);
      if (t > 1e-6 && t < 1 - 1e-6) return true;
    }
  }
  return false;
}
/* cheapest path from cell s to cell t (or to the first cell where done(cell) holds); returns cells or null */
function search(T, s, t, o, done, maxCost) {
  const G = T.G, GW = G.GW, GH = G.GH, N = G.N, gen = ++T.gen, g = T.g, par = T.par, seen = T.seen, hf = T.hf, hv = T.hv;
  const tx = t >= 0 ? t % GW : 0, ty = t >= 0 ? (t / GW) | 0 : 0;
  const hk = t >= 0 ? o.hk : 0;
  let n = 0;
  const push = (f, v) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hv[i] = hv[p]; i = p; } hf[i] = f; hv[i] = v; };
  const pop = () => {
    const v = hv[0], lf = hf[--n], lv = hv[n]; let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[i] = hf[c]; hv[i] = hv[c]; i = c; }
    hf[i] = lf; hv[i] = lv; return v;
  };
  g[s] = 0; par[s] = -1; seen[s] = gen; push(0, s);
  const closed = T.shut2;   // closed cells carry this search's number
  while (n) {
    const a = pop();
    if (closed[a] === gen) continue;
    closed[a] = gen;
    if (a === t || (done && a !== s && done(a))) {
      const out = []; for (let c = a; c >= 0; c = par[c]) out.push(c);
      return out.reverse();
    }
    if (maxCost && g[a] > maxCost) return null;
    const ax = a % GW, ay = (a / GW) | 0;
    for (let m = 0; m < 16; m++) {
      const bx = ax + MOVES[m][0], by = ay + MOVES[m][1];
      if (bx < 0 || by < 0 || bx >= GW || by >= GH) continue;
      const b = by * GW + bx;
      if (G.base[b] < 0 || (T.shut[b] && b !== t) || closed[b] === gen || (o.byVil && T.vil && T.vil[b] && b !== t)) continue;
      const L = MLEN[m], r = T.use[a] && T.use[b] ? T.link.get(lkey(a, b, N)) : 0;
      let c;
      if (r) c = L * o.reuse[r];
      else {
        // (a road cell between them would be next to one end, so both ends clear of roads means nothing to cut)
        if (m >= 4 && (T.near[a] || T.near[b]) && cuts(T, ax, ay, bx, by)) continue;
        const gr = Math.abs(G.h[b] - G.h[a]) / L / 0.0012;
        c = L * (G.base[a] + G.base[b]) * 0.5 * (1 + o.slope * Math.min(gr * gr, 40));
        if (G.wet[b] !== G.wet[a]) c += o.bridge * RC * 0.5;
        if (!T.use[b] && T.near[b]) c += o.near * RC;
      }
      const ng = g[a] + c;
      if (seen[b] === gen && ng >= g[b]) continue;
      seen[b] = gen; g[b] = ng; par[b] = a;
      push(ng + (hk ? Math.hypot(bx - tx, by - ty) * RC * hk : 0), b);
    }
  }
  return null;
}
function lay(T, path, rank) {
  const N = T.G.N, GW = T.G.GW;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], k = lkey(a, b, N), was = T.link.get(k) || 0;
    if (!was) { for (const [p, q] of [[a, b], [b, a]]) { if (!T.adj.has(p)) T.adj.set(p, []); T.adj.get(p).push(q); } }
    T.link.set(k, Math.max(was, rank));
  }
  for (const c of path) {
    T.use[c] = Math.max(T.use[c], rank);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = c + dy * GW + dx; if (q >= 0 && q < N) T.near[q] = 1; }
  }
}
/* soften a grid path: a few rounds of neighbour averaging, then corner cutting; the ends stay put */
function smoothLine(pts, rounds) {
  let P = pts;
  for (let r = 0; r < rounds; r++) {
    const Q = [P[0]];
    for (let i = 1; i < P.length - 1; i++) Q.push({ x: (P[i - 1].x + 2 * P[i].x + P[i + 1].x) / 4, y: (P[i - 1].y + 2 * P[i].y + P[i + 1].y) / 4 });
    Q.push(P[P.length - 1]); P = Q;
  }
  if (P.length < 3) return P;
  const Q = [P[0]];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (i > 0) Q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    if (i < P.length - 2) Q.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  Q.push(P[P.length - 1]);
  return Q;
}

/* ---------- the roads' lines on the ground (brief 52) ----------
   The grid above decides which places a road joins and where roads meet; on a 6 km grid that left every road a
   chain of 6–13 km straights, and a village road one straight line to the main road. So each road's own line is
   drawn again between its two nodes, on a fine grid (FC units a cell) inside a corridor round its grid route: it
   follows the ground (slopes, forest, a noise that makes it wander), keeps off the roads already drawn (so roads
   still meet only at their nodes), pays for every river crossing and crosses squarely, keeps off airfields and, a
   motorway, off villages, and leaves each node straight for its junction. Then it is smoothed by class: a motorway
   bends over kilometres, a lane over a few hundred metres. A road the corridor cannot take keeps its grid line. */
const FC = 8;
// by class: the corridor's half-width (units), how far the line wanders from the grid route and over what length
// (amp, wave), slope and crossing prices, a noise on the ground's price, how hard the line is held to its wandering
// centre, rounds of smoothing
const FINE = {
  hw: { half: 14, amp: 14, wave: 120, slope: 2.4, bridge: 5, noise: 0.1, pull: 0.3, rounds: 2, lead: 16 },
  rd: { half: 12, amp: 14, wave: 60, slope: 1.2, bridge: 4, noise: 0.2, pull: 0.3, rounds: 2, lead: 12 },
  lc: { half: 10, amp: 12, wave: 40, slope: 0.8, bridge: 3, noise: 0.3, pull: 0.3, rounds: 1, lead: 10 },
  sp: { half: 7, amp: 5, wave: 25, slope: 0.6, bridge: 3, noise: 0.3, pull: 0.3, rounds: 1, lead: 6 }
};
const F8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], F8L = F8.map(([x, y]) => Math.hypot(x, y) * FC);
// one set of working arrays for every road's corridor, grown to the largest (a thousand roads would otherwise each
// allocate their own, and the collector would take longer than the search)
let FB = null;
function fineBuffers(n) {
  if (!FB || FB.n < n) FB = { n, dc: new Float32Array(n), shut: new Uint8Array(n), hgt: new Float32Array(n), base: new Float32Array(n), wet: new Uint8Array(n), nz: new Float32Array(n), g: new Float64Array(n), par: new Int32Array(n), closed: new Uint8Array(n) };
  const B = FB;
  B.dc.fill(1e9, 0, n); B.shut.fill(0, 0, n); B.base.fill(0, 0, n); B.g.fill(Infinity, 0, n); B.par.fill(-1, 0, n); B.closed.fill(0, 0, n);
  return B;
}
/* corner cutting (Chaikin), the ends kept */
function chaikin(P, rounds) {
  for (let r = 0; r < rounds && P.length > 2; r++) {
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (i > 0) Q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      if (i < P.length - 2) Q.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    Q.push(P[P.length - 1]); P = Q;
  }
  return P;
}
/* fewer points: drop any within tol of the line between the kept ones round it (Douglas–Peucker) */
function simplify(P, tol) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const stack = [[0, P.length - 1]];
  while (stack.length) {
    const [s, t] = stack.pop(); let far = 0, fi = -1;
    for (let i = s + 1; i < t; i++) { const d = U.segDist(P[i].x, P[i].y, P[s].x, P[s].y, P[t].x, P[t].y); if (d > far) { far = d; fi = i; } }
    if (far > tol) { keep[fi] = 1; stack.push([s, fi], [fi, t]); }
  }
  return P.filter((p, i) => keep[i]);
}
IC.simplifyLine = simplify;
/* a line resampled every step units and swung from side to side by a slow noise; lead: a straight length kept at
   each end */
function wander(C, o, fbm, k, step, lead) {
  const out = [], ld = lead || 0;
  let L = 0; for (let i = 1; i < C.length; i++) L += U.dist(C[i - 1], C[i]);
  if (L < Math.max(ld * 3, step * 2)) return C;
  // (one walk along the line, the cursor carried from sample to sample)
  let i = 1, acc = 0, a = C[0], b = C[1], sl = U.dist(a, b);
  for (let s = 0; s < L; s += step) {
    while (acc + sl < s && i < C.length - 1) { acc += sl; i++; a = C[i - 1]; b = C[i]; sl = U.dist(a, b); }
    const ux = sl > 1e-9 ? (b.x - a.x) / sl : 1, uy = sl > 1e-9 ? (b.y - a.y) / sl : 0, d = Math.min(s - acc, sl);
    // (nothing at the ends, which are the nodes, and the sway comes in over most of a wave)
    const env = U.clamp(Math.min(s, L - s) / (0.75 * o.wave), 0, 1) * (ld ? U.clamp(Math.min(s, L - s) / ld - 1, 0, 1) : 1);
    const w = env * o.amp * U.clamp((fbm(s / o.wave, k * 7.13, 2) - 0.35) * 6, -1, 1);   // (the noise runs 0 to 0.7, mostly 0.25 to 0.5)
    out.push({ x: a.x + ux * d - uy * w, y: a.y + uy * d + ux * w });
  }
  out.push(C[C.length - 1]);
  return out;
}
/* one road's line between its two ends A and B (points), round the centre line C, for class cls: taken(k) says a
   fine cell k is another road's, fields are the airfields to keep off (not one the road serves), kn seeds its sway,
   wide (a factor) opens the corridor and drops the sway, leads ({ a, b }: unit vectors out of each end) the
   directions the road leaves its nodes in. The line, or null when the corridor is shut */
// the country whose soil the line being traced may use (null: ours), set by refineRoads for a road abroad (brief 57);
// outAt is how far a point is off that soil (at or below 0: on it), as W.depthOut says it for ours
let fineSoil = null;
const outAt = (W, x, y) => { const d = W.depthOut(x, y); if (!fineSoil) return d; return d <= 0 ? -d : W.countryAt(x, y) === fineSoil ? -d : 1e9; };
function fineLine(W, cls, C, A, B, taken, fields, kn, wide, leads) {
  const o0 = FINE[cls] || FINE.lc, o = wide ? Object.assign({}, o0, { half: o0.half * wide, amp: 0 }) : o0, fbm = W.fbm, half = o.half;
  const FW = Math.ceil(IC.WW / FC), FH = Math.ceil(IC.WH / FC);
  const cellOf = p => U.clamp(Math.floor(p.y / FC), 0, FH - 1) * FW + U.clamp(Math.floor(p.x / FC), 0, FW - 1);
  C = wander(C, o, fbm, kn, FC * 2, o.lead * 1.5);
  // the first and last stretch are straight (a junction's shape is laid along them, and a road through a junction
  // keeps its line): out of the node along the direction given, else the grid route's own, as far as the ground
  // and the other roads allow
  const lead = (P, v, next) => {
    const dx = v ? v.x : next.x - P.x, dy = v ? v.y : next.y - P.y, d = Math.hypot(dx, dy) || 1, own = cellOf(P);
    let s = 0;
    for (let t = FC * 0.5; t <= Math.min(o.lead, U.dist(A, B) / 3); t += FC * 0.5) {
      const x = P.x + dx / d * t, y = P.y + dy / d * t, k = cellOf({ x, y });
      if ((k !== own && taken(k)) || W.inLake(x, y) || outAt(W, x, y) > 0) break;
      s = t;
    }
    return s < FC ? P : { x: P.x + dx / d * s, y: P.y + dy / d * s };
  };
  const A1 = lead(A, leads && leads.a, C[1]), B1 = lead(B, leads && leads.b, C[C.length - 2]);
  C = [A, A1].concat(C.slice(1, -1), [B1, B]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of C) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const i0 = Math.max(0, Math.floor((x0 - half) / FC)), j0 = Math.max(0, Math.floor((y0 - half) / FC));
  const i1 = Math.min(FW - 1, Math.floor((x1 + half) / FC)), j1 = Math.min(FH - 1, Math.floor((y1 + half) / FC));
  const cw = i1 - i0 + 1, ch = j1 - j0 + 1, n = cw * ch;
  if (n > 600000) return null;
  const { dc, shut, hgt, base, wet, nz, g, par, closed } = fineBuffers(n);
  // the corridor: how far each cell is from the centre line (cells beyond half are out)
  for (let s = 1; s < C.length; s++) {
    const a = C[s - 1], b = C[s], ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1;
    const u0 = Math.max(i0, Math.floor((Math.min(a.x, b.x) - half) / FC)), u1 = Math.min(i1, Math.floor((Math.max(a.x, b.x) + half) / FC));
    const v0 = Math.max(j0, Math.floor((Math.min(a.y, b.y) - half) / FC)), v1 = Math.min(j1, Math.floor((Math.max(a.y, b.y) + half) / FC));
    for (let v = v0; v <= v1; v++) {
      const y = (v + 0.5) * FC; let q = (v - j0) * cw + (u0 - i0);
      for (let u = u0; u <= u1; u++, q++) {
        const x = (u + 0.5) * FC, t = U.clamp(((x - a.x) * ex + (y - a.y) * ey) / L2, 0, 1), dx = x - a.x - ex * t, dy = y - a.y - ey * t, d = dx * dx + dy * dy;
        if (d < dc[q]) dc[q] = d;
      }
    }
  }
  // (kept squared until here)
  const h2 = half * half;
  const sK = cellOf(A1), tK = cellOf(B1), qs = ((sK / FW) | 0) - j0, qsi = sK % FW - i0, qt = ((tK / FW) | 0) - j0, qti = tK % FW - i0;
  const QS = qs * cw + qsi, QT = qt * cw + qti;
  // the ground under the corridor's cells, and what a cell may not be: water, abroad, another road's (but the two
  // ends' own cells, where roads meet), an airfield's
  for (let q = 0; q < n; q++) {
    if (dc[q] > h2) { shut[q] = 1; continue; }
    dc[q] = Math.sqrt(dc[q]);
    if (q !== QS && q !== QT && taken((((q / cw) | 0) + j0) * FW + q % cw + i0)) shut[q] = 1;
  }
  // (the ground is read when the search first reaches a cell: it visits a part of the corridor)
  const read = q => {
    if (base[q]) return base[q] > 0;
    const i = q % cw + i0, j = ((q / cw) | 0) + j0, x = (i + 0.5) * FC, y = (j + 0.5) * FC, out = outAt(W, x, y);
    if (out > FC * 2 || W.inLake(x, y)) { base[q] = -1; shut[q] = 1; return false; }
    const f = fbm(x / 120, y / 120, 2);   // (0 to 0.7)
    hgt[q] = W.hAt(x, y); wet[q] = W.riverDist(x, y) < FC * 0.8 ? 1 : 0; nz[q] = f * 1.4;
    base[q] = 1 + (W.forestAt(x, y) ? 0.4 : 0) + (out > -FC * 2 ? 1.5 : 0) + 0.3 * f;
    return true;
  };
  const stamp = (p, r) => { for (let j = Math.max(j0, Math.floor((p.y - r) / FC)); j <= Math.min(j1, Math.floor((p.y + r) / FC)); j++) for (let i = Math.max(i0, Math.floor((p.x - r) / FC)); i <= Math.min(i1, Math.floor((p.x + r) / FC)); i++) { const q = (j - j0) * cw + (i - i0); if (q !== QS && q !== QT && U.dxy((i + 0.5) * FC, (j + 0.5) * FC, p.x, p.y) < r) shut[q] = 1; } };
  for (const f of fields) if (f.x > x0 - half - f.r && f.x < x1 + half + f.r && f.y > y0 - half - f.r && f.y < y1 + half + f.r) stamp(f, f.r);
  if (shut[QS] || shut[QT] || !read(QS) || !read(QT)) return null;
  const hf = [], hv = [];
  let hn = 0;
  const push = (f, v) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hv[i] = hv[p]; i = p; } hf[i] = f; hv[i] = v; };
  const pop = () => { const v = hv[0], lf = hf[--hn], lv = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[i] = hf[c]; hv[i] = hv[c]; i = c; } hf[i] = lf; hv[i] = lv; return v; };
  g[QS] = 0; push(0, QS);
  let found = false;
  while (hn) {
    const a = pop();
    if (closed[a]) continue;
    closed[a] = 1;
    if (a === QT) { found = true; break; }
    const ai = a % cw, aj = (a / cw) | 0;
    for (let m = 0; m < 8; m++) {
      const bi = ai + F8[m][0], bj = aj + F8[m][1];
      if (bi < 0 || bj < 0 || bi >= cw || bj >= ch) continue;
      const b = bj * cw + bi;
      if (shut[b] || closed[b] || !read(b)) continue;
      // (no slipping between two shut cells on the diagonal: that would cross another road)
      if (m >= 4 && shut[aj * cw + bi] && shut[bj * cw + ai]) continue;
      const L = F8L[m], gr = Math.abs(hgt[b] - hgt[a]) / L / 0.0012;
      let c = L * (base[a] + base[b]) * 0.5 * (1 + o.slope * Math.min(gr * gr, 40)) * (1 + o.noise * nz[b]) + L * o.pull * 3 * Math.pow(dc[b] / half, 2);
      if (wet[b] !== wet[a]) c += o.bridge * FC * (m >= 4 ? 2.2 : 1.5);
      const ng = g[a] + c;
      if (ng >= g[b]) continue;
      g[b] = ng; par[b] = a;
      push(ng + Math.hypot(bi - qti, bj - qt) * FC * 0.8, b);
    }
  }
  if (!found) return null;
  const cells = []; for (let q = QT; q >= 0; q = par[q]) cells.push((((q / cw) | 0) + j0) * FW + (q % cw + i0));
  cells.reverse();
  let P = cells.map(k => ({ x: (k % FW + 0.5) * FC, y: (((k / FW) | 0) + 0.5) * FC }));
  P[0] = { x: A1.x, y: A1.y }; P[P.length - 1] = { x: B1.x, y: B1.y };
  // (the leads' cells are the road's too)
  for (const [P0, P1] of [[A, A1], [B, B1]]) for (let t = 0, L = U.dist(P0, P1); t < L; t += FC * 0.5) cells.push(cellOf({ x: P0.x + (P1.x - P0.x) * t / L, y: P0.y + (P1.y - P0.y) * t / L }));
  if (A1 !== A) P.unshift({ x: A.x, y: A.y });
  if (B1 !== B) P.push({ x: B.x, y: B.y });
  // (the first and last legs stay straight: the leads, or the first cells)
  if (P.length > 3) P = [P[0]].concat(chaikin(P.slice(1, -1), o.rounds), [P[P.length - 1]]);
  // a lattice path runs straight between its turns: a second, smaller sway (under half a cell, so it meets nothing
  // new) bends those stretches too, with the junction leads left alone
  return { pts: simplify(wander(P, { amp: Math.min(o.amp * 0.4, 3.5), wave: o.wave * 0.6 }, fbm, kn + 0.5, FC * 0.75, o.lead * 1.5), 0.4), cells };
}
function refineRoads(W, only) {
  const FW = Math.ceil(IC.WW / FC), FH = Math.ceil(IC.WH / FC);
  const own = new Map();   // fine cell → the road laid on it, or the node whose cell it is
  // (only: the roads to trace now; the others keep their line and only take their cells, brief 57)
  if (only) for (const e of W.edges) if (!only.has(e)) for (let i = 1; i < e.pts.length; i++) { const a = e.pts[i - 1], b = e.pts[i], L = U.dist(a, b), m = Math.max(1, Math.ceil(L / (FC * 0.5))); for (let q = 0; q <= m; q++) { const x = a.x + (b.x - a.x) * q / m, y = a.y + (b.y - a.y) * q / m; own.set(U.clamp(Math.floor(y / FC), 0, FH - 1) * FW + U.clamp(Math.floor(x / FC), 0, FW - 1), e); } }
  const cellOf = p => U.clamp(Math.floor(p.y / FC), 0, FH - 1) * FW + U.clamp(Math.floor(p.x / FC), 0, FW - 1);
  const fields = W.infra.filter(b => b.kind === 'airport' || b.kind === 'airbase').map(f => ({ id: f.id, x: f.x, y: f.y, r: 45 }));
  const vils = W.villages.map(v => ({ x: v.x, y: v.y, r: 9 }));
  // every node's cell, and the eight round it, are for the roads that end there (a motorway may not run through a
  // village's, and a road passing a junction leaves room for the lanes that join it)
  for (const k in W.nodes) { const c = cellOf(W.nodes[k]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) own.set(c + dy * FW + dx, k); }
  // a road through a junction keeps its line: the two roads of the highest class there (the pairs most nearly
  // opposite at a crossroads) leave it along one direction, between their grid routes' own
  const leads = new Map(), at = {};
  for (const e of W.edges) if (FINE[e.cls]) for (const end of [0, 1]) { const k = end ? e.b : e.a; (at[k] = at[k] || []).push({ e, end }); }
  const dirOf = a => { const P = a.e.pts, p = a.end ? P[P.length - 1] : P[0], q = a.end ? P[P.length - 2] : P[1], d = U.dist(p, q) || 1; return { x: (q.x - p.x) / d, y: (q.y - p.y) / d }; };
  for (const k in at) {
    const top = Math.max(...at[k].map(a => RANK[a.e.cls])), T = at[k].filter(a => RANK[a.e.cls] === top), used = new Set();
    for (const a of T) {
      if (used.has(a)) continue;
      const da = dirOf(a); let best = null, bo = 0.3;
      for (const b of T) { if (b === a || used.has(b)) continue; const db = dirOf(b), opp = -(da.x * db.x + da.y * db.y); if (opp > bo) { bo = opp; best = b; } }
      if (!best) continue;
      used.add(a); used.add(best);
      const db = dirOf(best), vx = da.x - db.x, vy = da.y - db.y, L = Math.hypot(vx, vy) || 1;
      (leads.get(a.e) || leads.set(a.e, {}).get(a.e))[a.end ? 'b' : 'a'] = { x: vx / L, y: vy / L };
      (leads.get(best.e) || leads.set(best.e, {}).get(best.e))[best.end ? 'b' : 'a'] = { x: -vx / L, y: -vy / L };
    }
  }
  // the most important and the longest first: a lane keeps off the main road, not the reverse
  const order = W.edges.slice().sort((a, b) => (RANK[b.cls] - RANK[a.cls]) || (b.len - a.len));
  const t0 = Date.now();
  order.forEach((e, ei) => {
    if (!FINE[e.cls] || (only && !only.has(e))) return;
    const taken = k => { const v = own.get(k); return v !== undefined && v !== e && v !== e.a && v !== e.b; };
    const keepOff = fields.filter(f => f.id !== e.a && f.id !== e.b).concat(e.cls === 'hw' ? vils : []);
    // (a corridor the other roads shut: once more, twice as wide and without the sway, before the grid line stays)
    const ld = leads.get(e);
    fineSoil = e.abroad || null;
    const r = fineLine(W, e.cls, e.pts, W.nodes[e.a], W.nodes[e.b], taken, keepOff, ei, 0, ld) || fineLine(W, e.cls, e.pts, W.nodes[e.a], W.nodes[e.b], taken, keepOff, ei, 2, ld);
    fineSoil = null;
    if (!r) return;
    for (const k of r.cells) if (!own.has(k)) own.set(k, e);
    e.pts = r.pts;
    e.len = 0; for (let i = 1; i < e.pts.length; i++) e.len += U.dist(e.pts[i - 1], e.pts[i]);
  });
  W._refineMs = Date.now() - t0;
}
/* the line a road built later takes (growth.js: an airport's access road, the player's roads) between the points
   given, bending like the country's roads and keeping off them; apt is the airport it serves (or where one is to
   be founded: { x, y }). The points come back as they were where no line could be found */
IC.roadLine = function (W, cls, pts, apt) {
  if (!W.fbm || pts.length < 2) return pts;
  const FW = Math.ceil(IC.WW / FC), FH = Math.ceil(IC.WH / FC), half = (FINE[cls] || FINE.lc).half;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  x0 -= half * 2; y0 -= half * 2; x1 += half * 2; y1 += half * 2;
  // the roads already there, as the fine cells they pass through
  const occ = new Set();
  for (const e of W.edges) for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i];
    if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 || Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) continue;
    const L = U.dist(a, b), n = Math.max(1, Math.ceil(L / (FC * 0.5)));
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; occ.add(U.clamp(Math.floor(y / FC), 0, FH - 1) * FW + U.clamp(Math.floor(x / FC), 0, FW - 1)); }
  }
  const fields = W.infra.filter(b => (b.kind === 'airport' || b.kind === 'airbase') && b !== apt && (!apt || (b.id !== apt.id && U.dist(b, apt) > 1))).map(f => ({ id: f.id, x: f.x, y: f.y, r: (f.radius || 50) * 0.8 }));
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const r = fineLine(W, cls, [pts[i - 1], pts[i]], pts[i - 1], pts[i], k => occ.has(k), fields, 1000 + i + pts[0].x * 0.001);
    const P = r ? r.pts : [pts[i - 1], pts[i]];
    for (let k = 1; k < P.length; k++) out.push(P[k]);
  }
  return out;
};

/* the links a layer laid, as a graph: places, and cells where three or more links meet, are nodes (jp prefixes a
   junction's id), the runs between them edges; two runs between one pair of nodes get a junction in the middle */
function graphOf(T, places, at, twins, ctr, N, jp) {
  const nodes = {}, nodeAt = new Map();
  for (const pl of places) if (at.get(pl.cell) === pl) { nodes[pl.id] = { id: pl.id, x: pl.x, y: pl.y }; nodeAt.set(pl.cell, pl.id); }
  let nj = 0;
  const junction = c => { const id = jp + nj++, p = ctr(c); nodes[id] = { id, x: p.x, y: p.y, jct: true }; nodeAt.set(c, id); return id; };
  for (const [c, nb] of T.adj) if (!nodeAt.has(c) && nb.length !== 2) junction(c);
  const done = new Set(), chains = [];
  for (const [c, id] of nodeAt) for (const d of T.adj.get(c) || []) {
    if (done.has(lkey(c, d, N))) continue;
    const cells = [c]; let prev = c, cur = d, rank = 0;
    for (;;) {
      const k = lkey(prev, cur, N); done.add(k); rank = Math.max(rank, T.link.get(k)); cells.push(cur);
      if (nodeAt.has(cur)) break;
      const nb = T.adj.get(cur), nx = nb[0] === prev ? nb[1] : nb[0];
      prev = cur; cur = nx;
    }
    chains.push({ cells, rank });
  }
  // two runs between the same pair of nodes (or a loop) get a junction in the middle so every edge is unique
  chains.sort((p, q) => p.cells.length - q.cells.length);
  const pairSeen = new Set(), runs = [];
  const cut = (ch, at) => { const cells = ch.cells; junction(cells[at]); return [{ cells: cells.slice(0, at + 1), rank: ch.rank }, { cells: cells.slice(at), rank: ch.rank }]; };
  for (const ch of chains) {
    const a = nodeAt.get(ch.cells[0]), b = nodeAt.get(ch.cells[ch.cells.length - 1]), L = ch.cells.length;
    if (a === b) { if (L < 4) continue; const [p, q] = cut(ch, Math.floor(L / 3)); runs.push(p, ...cut(q, Math.floor(q.cells.length / 2))); }
    else if (pairSeen.has(a < b ? a + '|' + b : b + '|' + a)) { if (L >= 3) runs.push(...cut(ch, Math.floor(L / 2))); }
    else { pairSeen.add(a < b ? a + '|' + b : b + '|' + a); runs.push(ch); }
  }
  const edges = [];
  const ROUNDS = { hw: 6, rd: 4, lc: 3, sp: 2 };
  for (const ch of runs) {
    const a = nodeAt.get(ch.cells[0]), b = nodeAt.get(ch.cells[ch.cells.length - 1]), cls = CLS[ch.rank];
    const pts = ch.cells.map(ctr); pts[0] = { x: nodes[a].x, y: nodes[a].y }; pts[pts.length - 1] = { x: nodes[b].x, y: nodes[b].y };
    edges.push({ a, b, cls, pts: smoothLine(pts, ROUNDS[cls]) });
  }
  for (const [p, q] of twins) edges.push({ a: p, b: q, cls: 'sp', pts: [{ x: nodes[q].x, y: nodes[q].y }] });
  for (const [p, q] of twins) { const pl = places.find(x => x.id === p); nodes[p] = { id: p, x: pl.x, y: pl.y }; }
  for (const e of edges) {
    if (e.pts.length === 1) e.pts.unshift({ x: nodes[e.a].x, y: nodes[e.a].y });
    e.len = 0; for (let i = 1; i < e.pts.length; i++) e.len += U.dist(e.pts[i - 1], e.pts[i]);
  }
  return { nodes, edges };
}
/* the roads abroad (brief 57): each neighbour's towns joined by main roads (a Gabriel graph, as ours), a motorway
   between its two biggest towns, its villages on local roads, and the roads from the border crossings carried on
   to the nearest town; laid on that country's soil only, and flagged abroad, so our routing, the travel times, the
   bridges we hold and the enemy's target lists never count them */
function foreignNetwork(W, R, fbm) {
  const nodes = W.nodes, edges = W.edges, n0 = edges.length;
  // one grid of the soil over the border; each country shuts the others' cells in its own layer
  const G = costGrid(W, fbm, (x, y) => W.depthOut(x, y) > RC * 1.5), GW = G.GW, N = G.N;
  const KS = ['A', 'B', 'C', 'D'], soil = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (G.base[c] >= 0) soil[c] = KS.indexOf(W.countryAt((c % GW + 0.5) * RC, (((c / GW) | 0) + 0.5) * RC)) + 1;
  for (const k of KS) {
    const towns = W.foreign.filter(f => f.k === k), vils = W.villages.filter(v => !v.home && v.k === k);
    if (!towns.length) continue;
    const T = layer(G), kn = KS.indexOf(k) + 1;
    for (let c = 0; c < N; c++) if (G.base[c] >= 0 && soil[c] !== kn) T.shut[c] = 1;
    const cellOf = p => U.clamp(Math.floor(p.y / RC), 0, G.GH - 1) * GW + U.clamp(Math.floor(p.x / RC), 0, GW - 1);
    const ctr = c => ({ x: (c % GW + 0.5) * RC, y: (((c / GW) | 0) + 0.5) * RC });
    const places = [], at = new Map(), twins = [];
    const place = (id, p) => { const c = cellOf(p), pl = { id, x: p.x, y: p.y, cell: c }; if (at.has(c)) twins.push([id, at.get(c).id]); else at.set(c, pl); places.push(pl); return pl; };
    for (const t of towns) place(t.id, t);
    for (const v of vils) place(v.id, v);
    // a border crossing's road carries on from a point just over the border, where this soil is open
    const xs = [];
    for (const x of W.crossings) {
      if (x.k !== k) continue;
      const d = Math.hypot(x.x - W.cx, x.y - W.cy), ux = (x.x - W.cx) / d, uy = (x.y - W.cy) / d;
      let m = 2; while (m < 30 && !(W.depthOut(x.x + ux * RC * m, x.y + uy * RC * m) > RC * 1.5 && W.countryAt(x.x + ux * RC * m, x.y + uy * RC * m) === k)) m++;
      if (m >= 30) continue;
      xs.push(place(x.id + 'o', { x: x.x + ux * RC * m, y: x.y + uy * RC * m }));
    }
    for (const pl of places) if (G.base[pl.cell] < 0) G.base[pl.cell] = 2;
    T.vil = new Uint8Array(N); for (const v of vils) T.vil[cellOf(v)] = 1;
    const cellP = id => places.find(p => p.id === id).cell;
    const road = (a, b, cls) => { const p = search(T, cellP(a), cellP(b), HOW[cls]); if (p) lay(T, p, RANK[cls]); return !!p; };
    const spur = (id, cls, alt) => {
      const s = cellP(id); if (T.use[s]) return;
      const onto = c => T.use[c] > 0 && T.use[c] < RANK.hw;
      const plain = c => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = c + dy * GW + dx; if (q >= 0 && q < N && (T.adj.get(q) || []).length > 2) return false; } return true; };
      const p = search(T, s, -1, HOW[cls], c => onto(c) && plain(c), 4000 * SP) || search(T, s, -1, HOW[cls], onto, 4000 * SP);
      if (p) lay(T, p, RANK[cls]); else if (alt) road(id, alt, cls);
    };
    const nearestTown = p => towns.slice().sort((a, b) => U.dist(a, p) - U.dist(b, p))[0];
    // a motorway between the two biggest towns, and on to the third, when they are not too far apart
    const big = towns.slice().sort((a, b) => b.pop - a.pop);
    if (big.length >= 2 && U.dist(big[0], big[1]) < 5000) road(big[0].id, big[1].id, 'hw');
    if (big.length >= 3 && U.dist(big[0], big[2]) < 4000 && U.dist(big[1], big[2]) > 1500) road(big[0].id, big[2].id, 'hw');
    // main roads: neighbouring towns, and each crossing to the nearest town
    const pairs = [];
    for (let i = 0; i < towns.length; i++) for (let j = i + 1; j < towns.length; j++) {
      const a = towns[i], b = towns[j], d = U.dist(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (d > 6000 || towns.some(c => c !== a && c !== b && U.dxy(c.x, c.y, mx, my) < d / 2)) continue;
      pairs.push([a, b, d]);
    }
    pairs.sort((p, q) => p[2] - q[2]);
    for (const [a, b] of pairs) road(a.id, b.id, 'rd');
    for (const x of xs) road(x.id, nearestTown(x).id, 'rd');
    // villages: a local road to the nearest road, and some on to a neighbour
    const vs = vils.slice().sort((a, b) => U.dist(a, big[0]) - U.dist(b, big[0]));
    for (const v of vs) spur(v.id, 'lc', nearestTown(v).id);
    for (const v of vs) {
      const o = vs.filter(w => w !== v && U.dist(w, v) < 700 * SP).sort((p, q) => U.dist(p, v) - U.dist(q, v))[0];
      if (o && R() < 0.5 && T.use[cellP(v.id)] < RANK.hw && T.use[cellP(o.id)] < RANK.hw) road(v.id, o.id, 'lc');
    }
    const g = graphOf(T, places, at, twins, ctr, N, 'fj' + k);
    for (const id in g.nodes) nodes[id] = g.nodes[id];
    for (const e of g.edges) { e.abroad = k; edges.push(e); }
    // the crossing itself: the road over the border, from our last node to theirs
    for (const x of xs) {
      const h = x.id.slice(0, -1); if (!nodes[h] || !nodes[x.id]) continue;
      const pts = [{ x: nodes[h].x, y: nodes[h].y }, { x: nodes[x.id].x, y: nodes[x.id].y }];
      edges.push({ a: h, b: x.id, cls: 'rd', pts, len: U.dist(pts[0], pts[1]), abroad: k, crossing: true });
    }
  }
  const fresh = new Set(edges.slice(n0));
  // (ids and degrees as buildNetwork gives them; the home end of a crossing counts its new road too)
  for (const e of fresh) { e.id = 'e' + edges.indexOf(e); for (const k of [e.a, e.b]) { const n = nodes[k]; if (n) n.deg = (n.deg || 0) + 1; } }
  refineRoads(W, fresh);
}
function buildNetwork(W, R, fbm, A) {
  const G = costGrid(W, fbm), GW = G.GW, N = G.N;
  const T = layer(G);
  const cellOf = p => U.clamp(Math.floor(p.y / RC), 0, G.GH - 1) * GW + U.clamp(Math.floor(p.x / RC), 0, GW - 1);
  const ctr = c => ({ x: (c % GW + 0.5) * RC, y: (((c / GW) | 0) + 0.5) * RC });
  // no through roads across airfields
  for (const b of W.infra) if (b.kind === 'airport' || b.kind === 'airbase') {
    const c0 = cellOf(b);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = c0 + dy * GW + dx; if (U.dxy(ctr(q).x, ctr(q).y, b.x, b.y) < 50 || q === c0) T.shut[q] = 1; }
  }
  const places = [], at = new Map(), twins = [];
  const place = (id, p, at2) => { const c = cellOf(at2 || p), pl = { id, x: p.x, y: p.y, cell: c }; if (at.has(c)) twins.push([id, at.get(c).id]); else at.set(c, pl); places.push(pl); return pl; };
  for (const c of W.cities) place(c.id, c);
  // a border crossing's road starts a little inside the border, where the grid is open
  for (const x of W.crossings) { const d = Math.hypot(x.x - W.cx, x.y - W.cy); let k = 0; while (k < 30 && W.depthOut(x.x + (W.cx - x.x) / d * RC * k, x.y + (W.cy - x.y) / d * RC * k) > -RC) k++; place(x.id, x, { x: x.x + (W.cx - x.x) / d * RC * k, y: x.y + (W.cy - x.y) / d * RC * k }); }
  for (const v of W.villages) if (v.home) place(v.id, v);
  for (const i of W.infra) place(i.id, i);
  place('depot', W.depotPos);
  W.garrisons.forEach((g, i) => place('g' + i, g));
  const cellP = id => places.find(p => p.id === id).cell;
  // a place always stands on open ground, even where its cell's centre is in a lake (or a search would never end)
  for (const pl of places) if (G.base[pl.cell] < 0) G.base[pl.cell] = 2;
  // motorways pass villages by (a village on one would meet its local roads at grade)
  T.vil = new Uint8Array(N); for (const v of W.villages) if (v.home) T.vil[cellOf(v)] = 1;
  for (const g of W.garrisons.concat([W.depotPos])) T.vil[cellOf(g)] = 1;   // (nor through a garrison or the depot)
  const road = (a, b, cls) => { const p = search(T, cellP(a), cellP(b), HOW[cls]); if (p) lay(T, p, RANK[cls]); return !!p; };
  /* the map's roads (authored): each a run of places by name, or points, in order; between each pair the road is
     found over the ground like any other, so it bends with the hills and crosses the rivers where that is cheap.
     A place named that is not on the map is a warning, and the road goes on without it */
  const viaCell = v => {
    if (Array.isArray(v)) {
      let c = cellOf({ x: v[0], y: v[1] });
      // (not through a village: a drawn point on one moves to the open cell beside it farthest from any town, so a
      // ring road keeps outside)
      if (T.vil[c]) {
        let best = -1, bd = -1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const q = c + dy * GW + dx; if (q < 0 || q >= N || !(dx || dy) || T.vil[q] || G.base[q] < 0) continue;
          const o = ctr(q), d = Math.min(...W.cities.map(t => U.dxy(t.x, t.y, o.x, o.y))); if (d > bd) { bd = d; best = q; }
        }
        if (best >= 0) c = best;
      }
      if (G.base[c] < 0) G.base[c] = 2; return c;
    }
    const o = W.cities.find(c => c.name === v) || W.infra.find(i => i.name === v || i.id === v) || W.villages.find(x => x.name === v) || W.crossings.find(x => x.name === v || x.id === v) || (W.places || []).find(p => p.id === v || p.name === v);
    if (!o) { W.warnings.push(`Road via "${v}": no such place`); return -1; }
    const pl = places.find(p => p.id === o.id); if (pl) return pl.cell;
    const c = cellOf(o); if (G.base[c] < 0) G.base[c] = 2; return c;
  };
  // a drawn road that starts or ends on a motorway already laid (a radial on a ring road) leaves it at the drawn
  // point, two cells out along its line, rather than riding the cheap motorway round to wherever it would rather
  // leave
  const lead = (c, to) => {
    const dx = to % GW - c % GW, dy = ((to / GW) | 0) - ((c / GW) | 0), d = Math.hypot(dx, dy); if (d < 5) return -1;
    const q = c + Math.round(dy / d * 2) * GW + Math.round(dx / d * 2);
    return q >= 0 && q < N && G.base[q] >= 0 && !T.shut[q] && !T.vil[q] && !T.use[q] ? q : -1;
  };
  const authoredLine = (T2, via, how, rank, name) => {
    const cells = via.map(viaCell).filter(c => c >= 0), out = [];
    if (rank === RANK.hw) for (let i = 0; i + 1 < cells.length; i++) {
      const a = cells[i], b = cells[i + 1];
      if (T2.use[a] >= RANK.hw && !(T2.use[b] >= RANK.hw)) { const q = lead(a, b); if (q >= 0) cells.splice(++i, 0, q); }
      else if (T2.use[b] >= RANK.hw && !(T2.use[a] >= RANK.hw)) { const q = lead(b, a); if (q >= 0) cells.splice(++i, 0, q); }
    }
    for (let i = 0; i + 1 < cells.length; i++) {
      const p = search(T2, cells[i], cells[i + 1], how);
      if (p) { lay(T2, p, rank); out.push(p); } else W.warnings.push(`${name || 'A road'}: no way from stop ${i + 1} to stop ${i + 2}`);
    }
    return out;
  };
  const AR = A && A.roads || [];
  for (const r of AR) if (r.cls === 'hw') authoredLine(T, r.via, HOW.hw, RANK.hw, r.name);
  const spur = (id, cls, alt) => {
    const s = cellP(id); if (T.use[s]) return;
    // (onto a lesser road: nothing joins a motorway but at an interchange)
    // (onto a plain stretch of road where it can, clear of any junction, so the lanes of several villages do not
    // all meet at one)
    const onto = c => T.use[c] > 0 && T.use[c] < RANK.hw;
    const plain = c => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = c + dy * GW + dx; if (q >= 0 && q < N && (T.adj.get(q) || []).length > 2) return false; } return true; };
    const p = search(T, s, -1, HOW[cls], c => onto(c) && plain(c), 4000 * SP) || search(T, s, -1, HOW[cls], onto, 4000 * SP);
    if (p) lay(T, p, RANK[cls]); else if (alt) road(id, alt, cls);
  };
  const cities = W.cities, cap = cities[0];
  // motorways: the capital and the ten largest cities, each joined to the nearest one already on the network (the
  // four largest straight to the capital), then between big cities when the way round is long
  const big = cities.filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 10);
  const onHw = [cap];
  if (!AR.some(r => r.cls === 'hw')) {
  for (const c of big.slice(0, 4).sort((a, b) => U.dist(a, cap) - U.dist(b, cap))) { road(cap.id, c.id, 'hw'); onHw.push(c); }
  for (let rest = big.slice(4); rest.length;) {
    let best = null, bd = 1e12;
    for (const a of onHw) for (const b of rest) { const d = U.dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
    road(best[0].id, best[1].id, 'hw'); onHw.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
  }
  for (let i = 1; i < onHw.length; i++) for (let j = i + 1; j < onHw.length; j++) {
    const a = onHw[i], b = onHw[j], d = U.dist(a, b);
    if (d < 5000 && d * 1.6 < U.dist(a, cap) + U.dist(cap, b)) road(a.id, b.id, 'hw');
  }
  }
  // the map's main roads come before the mesh, so the mesh runs along them
  for (const r of AR) if (r.cls === 'rd') authoredLine(T, r.via, HOW.rd, RANK.rd, r.name);
  // main roads: every pair of neighbouring cities (a Gabriel graph, so no long road runs past a nearer town)
  const pairs = [];
  for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) {
    const a = cities[i], b = cities[j], d = U.dist(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (d > 6000 || cities.some(c => c !== a && c !== b && U.dxy(c.x, c.y, mx, my) < d / 2)) continue;
    pairs.push([a, b, d]);
  }
  pairs.sort((p, q) => p[2] - q[2]);
  for (const [a, b] of pairs) road(a.id, b.id, 'rd');
  for (const x of W.crossings) road(x.id, cities.slice().sort((p, q) => U.dist(p, x) - U.dist(q, x))[0].id, 'rd');
  // local roads: villages join the nearest road, and some join a neighbour so the road runs on through
  const vs = W.villages.filter(v => v.home).sort((a, b) => U.dist(a, cap) - U.dist(b, cap));
  for (const v of vs) spur(v.id, 'lc', cities.slice().sort((p, q) => U.dist(p, v) - U.dist(q, v))[0].id);
  for (const v of vs) {
    const o = vs.filter(w => w !== v && U.dist(w, v) < 700 * SP).sort((p, q) => U.dist(p, v) - U.dist(q, v))[0];
    if (o && R() < 0.5 && T.use[cellP(v.id)] < RANK.hw && T.use[cellP(o.id)] < RANK.hw) road(v.id, o.id, 'lc');   // (not at grade onto a motorway)
  }
  // a town on the motorways only also gets a main road of its own, to the nearest other road
  for (const c of cities) {
    const s = cellP(c.id), nb = T.adj.get(s) || [];
    if (!nb.length || nb.some(d => T.link.get(lkey(s, d, N)) < RANK.hw)) continue;
    const p = search(T, s, -1, HOW.rdOwn, q => T.use[q] > 0 && T.use[q] < RANK.hw && U.dxy(ctr(q).x, ctr(q).y, c.x, c.y) > c.r, 4000 * SP);
    if (p) lay(T, p, RANK.rd);
  }
  // access roads to airports, bases, plants, the depot and the garrisons
  for (const i of W.infra) spur(i.id, 'sp');
  spur('depot', 'sp');
  W.garrisons.forEach((g, i) => spur('g' + i, 'sp'));

  /* ---------- the graph ---------- */
  const { nodes, edges } = graphOf(T, places, at, twins, ctr, N, 'j');
  edges.forEach((e, i) => e.id = 'e' + i);
  // how many roads meet at each node (junction shapes are worked out once the towns are built: junctions())
  for (const e of edges) for (const k of [e.a, e.b]) { const n = nodes[k]; n.cls = n.cls || {}; n.cls[e.cls] = (n.cls[e.cls] || 0) + 1; }
  for (const k in nodes) { const n = nodes[k], c = n.cls || {}; n.deg = (c.hw || 0) + (c.rd || 0) + (c.lc || 0) + (c.sp || 0); delete n.cls; }
  W.nodes = nodes; W.edges = edges;
  W.fbm = fbm;
  refineRoads(W);

  /* ---------- railways: the big cities and the factories, on gentle grades ---------- */
  const RT = layer(G); RT.shut = T.shut;
  const stops = cities.slice().sort((a, b) => b.pop - a.pop).slice(0, 12).concat(W.infra.filter(i => i.kind === 'factory'));
  const inT = [stops[0]], rest = stops.slice(1);
  W.rails = [];
  // the map's railways: a line from stop to stop, each stop a city, a plant or a point
  if (A && A.rails) for (const line of A.rails) {
    const objs = line.via.map(v => Array.isArray(v) ? { x: v[0], y: v[1] } : W.cities.find(c => c.name === v) || W.infra.find(i => i.name === v || i.id === v) || W.villages.find(x => x.name === v) || null);
    for (let i = 0; i + 1 < objs.length; i++) {
      const a = objs[i], b = objs[i + 1]; if (!a || !b) { W.warnings.push(`${line.name || 'A railway'}: a stop is not on the map`); continue; }
      const p = search(RT, cellOf(a), cellOf(b), HOW.rail);
      if (!p) { W.warnings.push(`${line.name || 'A railway'}: no way between two of its stops`); continue; }
      lay(RT, p, 1);
      const pts = p.map(ctr); pts[0] = { x: a.x, y: a.y }; pts[pts.length - 1] = { x: b.x, y: b.y };
      W.rails.push({ a, b, pts: smoothLine(pts, 6), line: line.name });
    }
  }
  if (!(A && A.rails)) while (rest.length) {
    let best = null, bd = 1e12;
    for (const a of inT) for (const b of rest) { const d = U.dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
    const [a, b] = best;
    const p = search(RT, cellOf(a), cellOf(b), HOW.rail);
    if (p) {
      lay(RT, p, 1);
      const pts = p.map(ctr); pts[0] = { x: a.x, y: a.y }; pts[pts.length - 1] = { x: b.x, y: b.y };
      W.rails.push({ a, b, pts: smoothLine(pts, 6) });
    }
    inT.push(b); rest.splice(rest.indexOf(b), 1);
  }
}

/* ---------- towns ----------
   Cities are built in cities.js (street plan, districts, blocks); here they get the roads and railways near them.
   Villages are houses along their roads; the enemy's and neutral towns are small cities of their own style.
   Each block is one entry in town.blocks (damage and night lights work on blocks). */
function buildTowns(W, R, fbm) {
  // road pieces in 50-unit buckets, for "which roads run near this town"
  const SB = 50; let sbk;
  const indexSegs = () => {
    sbk = new Map();
    for (const e of W.edges) for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], s = [a.x, a.y, b.x, b.y, e.cls, !!e.city];   // (the sixth: an avenue, wider than the road it carries on, for the fringe)
      for (let bi = Math.floor(Math.min(a.x, b.x) / SB); bi <= Math.floor(Math.max(a.x, b.x) / SB); bi++) for (let bj = Math.floor(Math.min(a.y, b.y) / SB); bj <= Math.floor(Math.max(a.y, b.y) / SB); bj++) { const k = bi * 4096 + bj; if (!sbk.has(k)) sbk.set(k, []); sbk.get(k).push(s); }
    }
  };
  indexSegs();
  const segsNear = (x, y, rad) => {
    const out = new Set();
    for (let bi = Math.floor((x - rad) / SB); bi <= Math.floor((x + rad) / SB); bi++) for (let bj = Math.floor((y - rad) / SB); bj <= Math.floor((y + rad) / SB); bj++)
      for (const s of sbk.get(bi * 4096 + bj) || []) if (!out.has(s) && U.segDist(x, y, s[0], s[1], s[2], s[3]) < rad) out.add(s);
    return [...out];
  };
  const clear = (segs, x, y, d) => { for (const s of segs) if (U.segDist(x, y, s[0], s[1], s[2], s[3]) < d + (s[4] === 'hw' ? 1.2 : 0)) return false; return true; };
  const fields = W.infra.filter(i => i.kind === 'airport' || i.kind === 'airbase' || i.kind === 'factory' || i.kind === 'power');
  const freeGround = (x, y, pad) => !W.inLake(x, y) && W.riverDist(x, y) > 4 + pad && !fields.some(f => U.dxy(f.x, f.y, x, y) < (f.kind === 'factory' || f.kind === 'power' ? 20 : 48));
  // industry faces the railway if there is one, else the busiest road out
  const railSegs = [];
  for (const l of W.rails) for (let i = 1; i < l.pts.length; i++) railSegs.push([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, 'rail']);
  const fieldR = fields.map(f => ({ x: f.x, y: f.y, r: f.kind === 'factory' || f.kind === 'power' ? 20 : 50 }));
  for (const c of W.cities) {
    let ia = R.range(0, 7);
    const rail = W.rails.find(l => l.a === c || l.b === c);
    if (rail) { const p = rail.a === c ? rail.pts[Math.min(8, rail.pts.length - 1)] : rail.pts[Math.max(0, rail.pts.length - 9)]; ia = Math.atan2(p.y - c.y, p.x - c.x); }
    else { const e = W.edges.filter(e => e.a === c.id || e.b === c.id).sort((p, q) => (q.cls === 'hw') - (p.cls === 'hw'))[0]; if (e) { const p = e.a === c.id ? e.pts[Math.min(6, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 7)]; ia = Math.atan2(p.y - c.y, p.x - c.x) + 0.5; } }
    c.indA = ia;
    const rad = c.r * 1.7, segs = segsNear(c.x, c.y, rad).concat(railSegs.filter(s => Math.min(s[0], s[2]) < c.x + rad && Math.max(s[0], s[2]) > c.x - rad && Math.min(s[1], s[3]) < c.y + rad && Math.max(s[1], s[3]) > c.y - rad && U.segDist(c.x, c.y, s[0], s[1], s[2], s[3]) < rad));
    IC.buildCity(W, c, R, fbm, segs, fieldR, W.villages.filter(v => v.home));
  }
  // villages: houses along the roads through them
  // (the roads as they are now: the cities have cut them at their gates and laid new pieces round their edge)
  indexSegs();
  for (const v of W.villages) {
    // a village the city has grown over is part of it now
    // (the box test first: a block further than the reach along either axis is further than it in all)
    const vr = v.r * 0.8;
    if (!v.swallowed) for (const c of W.cities) if (U.dist(c, v) < c.r * 1.7 && c.blocks.some(b => Math.abs(b.x - v.x) < vr && Math.abs(b.y - v.y) < vr && U.dist(b, v) < vr)) v.swallowed = c.id;
    if (v.swallowed) { v.blocks = []; continue; }
    // (brief 54: a plan, village.js; abroad the same plan on whatever roads there are)
    const segs = segsNear(v.x, v.y, v.r * 1.3 + 8);   // (room for the street of the biggest, 1.4 km)
    IC.buildVillage(W, v, R, segs);
  }
  // the fringe of every city (brief 54, fringe.js): ribbon houses along the roads out, the outer ring, a retail park
  for (const c of W.cities) IC.buildFringe(W, c, R, segsNear(c.x, c.y, c.r * 2.6 + 20).concat(railSegs.filter(s => U.segDist(c.x, c.y, s[0], s[1], s[2], s[3]) < c.r * 2.6 + 20)), W.villages.filter(v => v.home && !v.swallowed));
  // abroad: the enemy's towns are built to their own plan; the neutral neighbours' look like ours
  // (brief 57: on their own roads, which they take in as ours do, with a fringe)
  const abroadVils = W.villages.filter(v => !v.home && !v.swallowed);
  for (const f of W.foreign) {
    f.style = W.side[f.k] === 'hostile' ? 'east' : W.style === 'us' ? 'us' : 'eu';
    f.tpl = f.style === 'east' ? 'east' : f.style === 'us' ? 'chi' : 'lon';
    f.home = false; f.grid = R.range(0, Math.PI / 2); f.indA = R.range(0, 7);
    IC.buildCity(W, f, R, fbm, segsNear(f.x, f.y, f.r * 1.7), fieldR, abroadVils);
  }
  indexSegs();
  for (const f of W.foreign) IC.buildFringe(W, f, R, segsNear(f.x, f.y, f.r * 2.6 + 20), abroadVils);
  // every road piece abroad, the towns' own included, is flagged: not ours to drive or to hold
  for (const e of W.edges) if (!e.abroad) { const m = e.pts[e.pts.length >> 1]; if (!W.inHome(m.x, m.y)) e.abroad = W.countryAt(m.x, m.y); }
  /* rural lanes: from local and main roads out into the fields, along the lie of the field boundaries */
  W.lanes = [];
  const occ = new Set(), OC = 8, ok = (x, y) => occ.has(Math.floor(x / OC) + ',' + Math.floor(y / OC));
  const mark = (x, y) => occ.add(Math.floor(x / OC) + ',' + Math.floor(y / OC));
  for (const e of W.edges) for (const p of e.pts) mark(p.x, p.y);
  for (const c of W.cities) for (const b of c.blocks) mark(b.x, b.y);
  // the villages' own lanes first (village.js)
  for (const v of W.villages) if (v.plan) for (const l of v.plan.lanes) { W.lanes.push(l); for (const p of l.pts) mark(p.x, p.y); }
  // (a lane never crosses a motorway: it stops short of one, brief 56)
  const HG = new Map(), HC = 8, hk = (x, y) => Math.floor(x / HC) + ',' + Math.floor(y / HC);
  for (const e of W.edges) if (e.cls === 'hw') for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i];
    for (let gx = Math.floor(Math.min(a.x, b.x) / HC); gx <= Math.floor(Math.max(a.x, b.x) / HC); gx++) for (let gy = Math.floor(Math.min(a.y, b.y) / HC); gy <= Math.floor(Math.max(a.y, b.y) / HC); gy++) { const k = gx + ',' + gy; let l = HG.get(k); if (!l) HG.set(k, l = []); l.push([a, b]); }
  }
  const hitsHw = (x0, y0, x1, y1) => {
    for (let gx = Math.floor(Math.min(x0, x1) / HC); gx <= Math.floor(Math.max(x0, x1) / HC); gx++) for (let gy = Math.floor(Math.min(y0, y1) / HC); gy <= Math.floor(Math.max(y0, y1) / HC); gy++) {
      const l = HG.get(gx + ',' + gy); if (!l) continue;
      for (const [a, b] of l) if (U.segX(x0, y0, x1, y1, a.x, a.y, b.x, b.y) >= 0) return true;
    }
    return false;
  };
  for (const e of W.edges) {
    if (e.cls !== 'lc' && e.cls !== 'rd') continue;
    // (a chance of a lane every 12 km or so of road, however many points the road has)
    let run = 45;
    for (let i = 1; i < e.pts.length - 2; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      run += U.dist(e.pts[i - 1], p); if (run < 120) continue;
      run = 0;
      if (W.farmAt(p.x, p.y) < 0.3 || R() > 0.4) continue;
      if (W.cities.some(c => U.dist(c, p) < c.r * 1.2)) continue;
      const fa = W.fieldAng(p.x, p.y), ra = Math.atan2(q.y - p.y, q.x - p.x);
      // of the two field directions, take the one most across the road
      let a = Math.abs(Math.sin(fa - ra)) > Math.abs(Math.cos(fa - ra)) ? fa : fa + Math.PI / 2;
      if (R() < 0.5) a += Math.PI;
      const pts = [{ x: p.x, y: p.y }], L = R.range(40, 160);
      let x = p.x, y = p.y;
      for (let s = 0; s < L; s += 4) {
        if (hitsHw(x, y, x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5)) break;
        x += Math.cos(a) * 4; y += Math.sin(a) * 4;
        if (s > 8 && ok(x, y)) { pts.push({ x, y }); break; }
        if (!W.inHome(x, y) || W.inLake(x, y) || W.riverDist(x, y) < 6 || W.forestAt(x, y) || W.hAt(x, y) > 0.62) break;
        pts.push({ x, y });
        if (R() < 0.05) a += (R() < 0.5 ? 1 : -1) * Math.PI / 2 * (R() < 0.5 ? 1 : 0.15);
      }
      if (pts.length < 5) continue;
      for (const p2 of pts.slice(2)) mark(p2.x, p2.y);
      W.lanes.push({ cls: 'ln', pts });
    }
  }
  // (a lane abroad, a village's or one off a neighbour's road, is flagged like the roads there: drawn, not driven)
  for (const l of W.lanes) if (!l.abroad) { const m = l.pts[l.pts.length >> 1]; if (!W.inHome(m.x, m.y)) l.abroad = W.countryAt(m.x, m.y); }
}

/* ---------- junctions ----------
   Where roads meet, the node gets a real shape, drawn from W.junctions and W.ramps (routing still runs through
   the node itself):
   - two motorways: a cloverleaf, a loop and an outer slip road in every quarter between them, one motorway on a
     bridge over the other; a motorway ending on another: a trumpet (one loop, two sweeping slip roads in the other
     quarter) or a partial cloverleaf (brief 56: J.shape);
   - a motorway and a lesser road: a diamond, the lesser road on a bridge and a slip road in each quarter; on a main
     road, half of them a dumbbell (the slip roads end on two roundabouts either side of the bridge, J.rbs); on a
     local road now and then a half diamond, slip roads on one side only;
   - a motorway ending at other roads, or a busy junction of main roads: a roundabout, sized by the roads meeting
     (J.r, J.lanes; a mini roundabout where only local roads cross) and with an island of its own (J.isle: grass,
     planting, trees, a monument in town);
   - anything else: a T or crossroads with curved kerbs.
   Slip roads are cubic curves, so they leave and join the carriageway smoothly. Interchanges have a footprint the
   towns keep out of (IC.ixClear). */
function junctions(W) {
  const N = W.nodes, byNode = {};
  // the map may name the shape of a junction (brief 72): the nearest drawn one within 6 km, where the roads there
  // allow it (a trumpet needs a motorway ending on another, a stack two crossing)
  const AJ = W.map && IC.MAPS[W.map] && IC.MAPS[W.map].junctions || [];
  const wanted = (x, y) => { let best = null, bd = 60; for (const j of AJ) { const d = U.dxy(j.x, j.y, x, y); if (d < bd) { bd = d; best = j; } } return best && best.shape; };
  for (const e of W.edges) for (const [k, end] of [[e.a, 0], [e.b, 1]]) (byNode[k] = byNode[k] || []).push({ e, end });
  // direction of an edge leaving a node, measured some way along it so the smoothing near the node does not skew it
  const dirOf = ({ e, end }, D) => {
    const P = end ? e.pts.slice().reverse() : e.pts; let s = 0, q = P[P.length - 1];
    for (let i = 1; i < P.length; i++) { s += U.dist(P[i - 1], P[i]); if (s >= D) { q = P[i]; break; } }
    const a = Math.atan2(q.y - P[0].y, q.x - P[0].x); return { x: Math.cos(a), y: Math.sin(a), a, cls: e.cls, e };
  };
  const bez = (p0, p1, p2, p3, n) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }); } return out; };
  // a smooth curve through points (Catmull-Rom), so slip roads have no kinks
  const spline = (P, m) => {
    const out = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let q = 1; q <= m; q++) {
        const t = q / m, t2 = t * t, t3 = t2 * t;
        out.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) });
      }
    }
    return out;
  };
  // a flyover's curve eased where it bends hard (roads meeting at odd angles), its leads kept
  const ease = P => {
    const tight = () => P.some((p, i) => i > 1 && Math.abs(U.angWrap(Math.atan2(p.y - P[i - 1].y, p.x - P[i - 1].x) - Math.atan2(P[i - 1].y - P[i - 2].y, P[i - 1].x - P[i - 2].x))) > 0.4);
    for (let k = 0; k < 40 && tight(); k++) for (let i = 3; i < P.length - 3; i++) P[i] = { x: P[i].x * 0.5 + (P[i - 1].x + P[i + 1].x) * 0.25, y: P[i].y * 0.5 + (P[i - 1].y + P[i + 1].y) * 0.25 };
    return P;
  };
  const at = (n, d, k, p, o) => ({ x: n.x + d.x * k + (p ? p.x * o : 0), y: n.y + d.y * k + (p ? p.y * o : 0) });
  // the unit vector across d that points into the quarter towards q
  const toward = (d, q) => { const px = -d.y, py = d.x; return px * q.x + py * q.y >= 0 ? { x: px, y: py } : { x: -px, y: -py }; };
  W.junctions = []; W.ramps = [];
  const townNear = (x, y) => W.cities.some(c => U.dxy(c.x, c.y, x, y) < (c.ext || c.r * 1.5) + 4);
  // (a big town within 4 km of its edge: the interchanges round a city are the big ones, brief 66)
  const cityNear = (x, y) => W.cities.some(c => c.pop >= 300 && U.dxy(c.x, c.y, x, y) < (c.ext || c.r * 1.5) + 40);
  // a loop in the quarter from arm a round to arm b: traffic leaves heading out along a, goes three quarters of the
  // way round a circle of radius R touching both and joins b heading in (l0, l1: where its straight leads start and
  // end, as shares of the way to the circle)
  const loopOf = (n, a, b, R, off, l0 = 0.2, l1 = 0.6) => {
    const gap = U.mod(b.a - a.a, Math.PI * 2), na = toward(a, b), nb = toward(b, a), bis = { x: a.x + b.x, y: a.y + b.y }, bl = Math.hypot(bis.x, bis.y) || 1;
    bis.x /= bl; bis.y /= bl;
    const dc = R / Math.sin(gap / 2), C = at(n, bis, dc), fa = dc * Math.cos(gap / 2);
    const Fa = at(n, a, fa, na, off), Fb = at(n, b, fa, nb, off), r = R - off;
    const ta = Math.atan2(Fa.y - C.y, Fa.x - C.x), tb = Math.atan2(Fb.y - C.y, Fb.x - C.x);
    const dir = (-Math.sin(ta) * a.x + Math.cos(ta) * a.y) > 0 ? 1 : -1;   // turning so that it starts heading out
    const sweep = dir * U.mod(dir * (tb - ta), Math.PI * 2);
    const loop = [at(n, a, fa * l0, na, off), at(n, a, fa * l1, na, off)];
    for (let q = 0; q <= 40; q++) { const t = ta + sweep * q / 40; loop.push({ x: C.x + Math.cos(t) * r, y: C.y + Math.sin(t) * r }); }
    loop.push(at(n, b, fa * l1, nb, off), at(n, b, fa * l0, nb, off));
    return { pts: loop, dc, fa };
  };
  for (const k in byNode) {
    const n = N[k], L = byNode[k], deg = L.length;
    if (deg < 3 && !(deg === 2 && L.some(x => x.e.cls === 'hw') && L.some(x => x.e.cls !== 'hw'))) continue;
    if (!n.jct) continue;   // towns and airfields have their own streets
    const dirs = L.map(x => dirOf(x, 3)).sort((p, q) => p.a - q.a);
    const hw = dirs.filter(d => d.cls === 'hw'), minor = dirs.filter(d => d.cls !== 'hw');
    const J = { id: k, x: n.x, y: n.y, dirs, ramps: [] }, hz = U.hash(Math.round(n.x * 3), Math.round(n.y * 3));
    const ramp = (pts, kind) => { const r = { cls: 'ramp', kind, pts, node: k }; W.ramps.push(r); J.ramps.push(r); };
    if (hw.length >= 3) {
      // cloverleaf: the through pair is the two arms closest to opposite
      J.kind = 'mm';
      let best = null, bs = -2;
      for (let i = 0; i < hw.length; i++) for (let j = i + 1; j < hw.length; j++) { const c = -(hw[i].x * hw[j].x + hw[i].y * hw[j].y); if (c > bs) { bs = c; best = [hw[i], hw[j]]; } }
      J.over = hw.filter(d => !best.includes(d)).map(d => d.a);   // the other motorway crosses on a bridge
      const ring = hw.slice().sort((p, q) => p.a - q.a);
      // a motorway ending on another: a trumpet (one loop, and two slip roads sweeping round in the other quarter)
      // for most of them, the rest partial cloverleaves
      const ending = hw.length === 3 ? hw.find(d => !best.includes(d)) : null;
      // (a trumpet needs room on both sides of the ending arm: a motorway merging at a shallow angle stays a cloverleaf)
      const gapOf = i => U.mod(ring[(i + 1) % ring.length].a - ring[i].a, Math.PI * 2);
      const qs = ending ? ring.map((a, i) => i).filter(i => ring[i] === ending || ring[(i + 1) % ring.length] === ending) : [];
      J.shape = ending && hz < 0.7 && qs.length === 2 && qs.every(i => gapOf(i) > 0.9 && gapOf(i) < 2.3) ? 'trumpet' : 'clover';
      // (brief 66: two motorways crossing by a big city are a stack, every left turn on a flyover over the middle, or
      // a turbine, the left turns sweeping round it; a cloverleaf's weaving loops are for the open country)
      if (hw.length === 4 && !ending && ring.every((a, i) => gapOf(i) > 0.9 && gapOf(i) < 2.3) && cityNear(n.x, n.y)) J.shape = hz < 0.55 ? 'stack' : 'turbine';
      // (and a motorway ending on another by a big city is a directional T: the two left turns cross each other on
      // flyovers over the through road, no loop)
      if (J.shape === 'trumpet' && cityNear(n.x, n.y) && !hw.some(d => d.e.city)) J.shape = 'dirT';   // (not where it is a town's avenue)
      const w = wanted(n.x, n.y);
      if (w === 'clover' || ((w === 'trumpet' || w === 'dirT') && ending) || ((w === 'stack' || w === 'turbine') && hw.length === 4 && !ending)) J.shape = w;
      const fly = J.shape === 'stack' || J.shape === 'turbine';
      if (J.shape === 'dirT') {
        // (which way each slip road runs the drive graph reads from the carriageway side it joins, traffic.js)
        const [t1, t2] = best, e = ending, La = 3.2, side = (d, q, k) => { const t = toward(d, q); return { x: t.x * k, y: t.y * k }; };
        const f1 = side(t1, e, -1), f2 = side(t2, e, -1), s1 = toward(e, t1), s2 = toward(e, t2), tn1 = toward(t1, e), tn2 = toward(t2, e);
        // the right turns sweep round the two quarters beside the stem
        for (const [a, b, na, nb] of [[e, t1, s1, tn1], [e, t2, s2, tn2]]) {
          const bis = { x: a.x + b.x, y: a.y + b.y }, bl = Math.hypot(bis.x, bis.y) || 1, gap = U.mod(b.a - a.a, Math.PI * 2), g2 = Math.min(gap, Math.PI * 2 - gap);
          ramp(spline([at(n, a, La + 1.2, na, 0.22), at(n, a, La, na, 0.55), at(n, { x: bis.x / bl, y: bis.y / bl }, 1.05 / Math.sin(g2 / 2) + 1.6), at(n, b, La, nb, 0.55), at(n, b, La + 1.2, nb, 0.22)], 8), 'outer');
        }
        // the left turns: from the far side of one through arm over the road into the stem, and from the stem over
        // the road to the far side of the other, crossing each other above the stem
        const mid = (t, k) => ({ x: n.x + t.x * 1.5 + e.x * k, y: n.y + t.y * 1.5 + e.y * k });
        ramp(ease(spline([at(n, t1, La + 1.2, f1, 0.22), at(n, t1, La, f1, 0.55), mid(t1, -0.35), mid(t1, 1.4), at(n, e, La + 0.6, s2, 0.55), at(n, e, La + 1.8, s2, 0.22)], 10)), 'fly');
        ramp(ease(spline([at(n, e, La + 1.8, s1, 0.22), at(n, e, La + 0.6, s1, 0.55), mid(t2, 1.4), mid(t2, -0.35), at(n, t2, La, f2, 0.55), at(n, t2, La + 1.2, f2, 0.22)], 10)), 'fly');
      }
      let loopQ = -1, sweepQ = -1;
      if (J.shape === 'trumpet') { loopQ = qs[hz < 0.35 ? 0 : 1]; sweepQ = qs[hz < 0.35 ? 1 : 0]; }
      // quarters wide enough for a loop; where motorways merge at a shallow angle, the narrowest of the rest has one
      const gaps = ring.map((a, i) => U.mod(ring[(i + 1) % ring.length].a - a.a, Math.PI * 2)).filter(g => g >= 0.5 && g <= 2.9);
      const loopMax = gaps.some(g => g < 2.4) ? 2.4 : Math.min(...gaps) + 1e-9;
      for (let i = 0; J.shape !== 'dirT' && i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], gap = U.mod(b.a - a.a, Math.PI * 2);
        if (gap > 2.9 || gap < 0.5) continue;   // no quarter here (the far side of a T)
        const na = toward(a, b), nb = toward(b, a), bis = { x: (a.x + b.x), y: (a.y + b.y) }, bl = Math.hypot(bis.x, bis.y) || 1;
        bis.x /= bl; bis.y /= bl;
        const trumpetLoop = i === loopQ, trumpetSweep = i === sweepQ;   // (the far side of the T, between the through arms, gets neither)
        // the loop, for turning left: traffic that has come through the junction leaves heading out along one arm,
        // goes three quarters of the way round a circle touching both carriageways and joins the other heading in
        const R = 1.05, dc = R / Math.sin(gap / 2), C = at(n, bis, dc), fa = dc * Math.cos(gap / 2);
        const Fa = at(n, a, fa, na, 0.15), Fb = at(n, b, fa, nb, 0.15), r = R - 0.15;
        const ta = Math.atan2(Fa.y - C.y, Fa.x - C.x), tb = Math.atan2(Fb.y - C.y, Fb.x - C.x);
        const dir = (-Math.sin(ta) * a.x + Math.cos(ta) * a.y) > 0 ? 1 : -1;   // turning so that it starts heading out
        const sweep = dir * U.mod(dir * (tb - ta), Math.PI * 2);
        const loop = [at(n, a, fa * 0.2, na, 0.15), at(n, a, fa * 0.6, na, 0.15)];
        for (let q = 0; q <= 40; q++) { const t = ta + sweep * q / 40; loop.push({ x: C.x + Math.cos(t) * r, y: C.y + Math.sin(t) * r }); }
        loop.push(at(n, b, fa * 0.6, nb, 0.15), at(n, b, fa * 0.2, nb, 0.15));
        if ((gap < loopMax || trumpetLoop) && !trumpetSweep && !fly) ramp(loop, 'loop');   // a wide quarter needs only the outer slip road
        // the outer slip road: leaves the carriageway at a shallow angle and swings round outside the loop (a narrow
        // quarter has room only for the loop); a trumpet's other quarter has two, one sweeping round the other
        const La = 3.2, far = dc + R + 0.55;
        if (gap > 1 || trumpetSweep) ramp(spline([at(n, a, La + 1.2, na, 0.22), at(n, a, La, na, 0.55), at(n, bis, far), at(n, b, La, nb, 0.55), at(n, b, La + 1.2, nb, 0.22)], 8), 'outer');
        if (trumpetSweep) ramp(spline([at(n, a, La + 3.4, na, 0.22), at(n, a, La + 2.2, na, 0.7), at(n, bis, far + 1.3), at(n, b, La + 2.2, nb, 0.7), at(n, b, La + 3.4, nb, 0.22)], 8), 'outer');
        if (fly) {
          // the left turn this quarter's loop would carry, on a flyover: traffic coming in along the arm opposite a
          // (heading the way a points) leaves on its right before the middle and joins the arm opposite b heading out
          const ao = ring[(i + 2) % 4], bo = ring[(i + 3) % 4], sa = toward(a, b), sb = toward(b, a);
          const S0 = at(n, ao, La + 1.2, sa, 0.22), S1 = at(n, ao, La, sa, 0.5), E1 = at(n, bo, La, sb, 0.5), E0 = at(n, bo, La + 1.2, sb, 0.22);
          // a stack's crosses near the middle, high over the rest; a turbine's sweeps round through the quarter beyond
          const mid = J.shape === 'stack' ? [{ x: n.x + (a.x - b.x) * 0.35 + (sa.x + sb.x) * 0.25, y: n.y + (a.y - b.y) * 0.35 + (sa.y + sb.y) * 0.25 }]
            : (() => { const qx = ao.x + bo.x, qy = ao.y + bo.y, ql = Math.hypot(qx, qy) || 1; return [{ x: n.x + qx / ql * 2.1, y: n.y + qy / ql * 2.1 }]; })();
          ramp(ease(spline([S0, S1].concat(mid, [E1, E0]), 10)), 'fly');
        }
      }
    } else if (hw.length === 2 && minor.length) {
      // diamond: the lesser road crosses on a bridge; a slip road in each quarter meets it 130 m from the motorway.
      // On a main road, half of them end on a roundabout either side instead (a dumbbell); on a local road, one in
      // three has slip roads on one side of the motorway only (a half diamond)
      J.kind = 'mx';
      const m = hw[0], mo = hw[1], main = minor.some(d => d.cls === 'rd');
      J.over = minor.map(d => d.a);
      J.shape = minor.length === 2 && main && hz < 0.5 ? 'dumbbell' : minor.length <= 2 && !main && hz < 0.33 ? 'half' : 'diamond';
      // (brief 66: by a big town a main road's diamond is a single-point interchange, its four slip roads meeting at
      // one junction on the bridge; out in the country some are partial cloverleaves, folded to one side of the road)
      if (minor.length === 2 && main && hz >= 0.25 && cityNear(n.x, n.y)) J.shape = 'spui';
      else if (minor.length === 2 && hz >= 0.72) {
        // (only where the road crosses near square: a loop in a wide quarter would hardly turn)
        const sq = md => Math.max(...minor.map(d => { const g = U.mod(d.a - md.a, Math.PI * 2); return Math.abs(Math.min(g, Math.PI * 2 - g) - Math.PI / 2); }));
        if (Math.max(sq(m), sq(mo)) < 0.7) J.shape = 'parclo';
      }
      const w = wanted(n.x, n.y);
      if (w === 'diamond' || (w === 'half' && minor.length <= 2) || ((w === 'dumbbell' || w === 'spui' || w === 'parclo') && minor.length === 2)) J.shape = w;
      // (the roundabouts sit on the road itself, where it bends)
      if (J.shape === 'dumbbell') J.rbs = minor.map(d => { const q = IC.PL.near(d.e.pts, at(n, d, 1.3)); return { x: q ? q.x : n.x + d.x * 1.3, y: q ? q.y : n.y + d.y * 1.3, a: d.a, r: 0.2 }; });
      const sides = J.shape === 'half' ? [hz < 0.16 ? m : mo] : [m, mo];
      if (J.shape === 'parclo') {
        // both quarters on one side of the road, one either side of the motorway: a loop and a slip road in each, so
        // nothing stands on the road's other side
        const md = sides[hz < 0.86 ? 0 : 1];
        for (const d of minor) {
          const nm = toward(md, d), gap = U.mod(d.a - md.a, Math.PI * 2);
          // (the leads start 750 m out, clear of the bridge and of the motorway's own junction)
          ramp(loopOf(n, gap < Math.PI ? md : d, gap < Math.PI ? d : md, 1, 0.15, 0.75, 0.9).pts, 'loop');
          ramp(bez(at(n, md, 5.5, nm, 0.22), at(n, md, 2.9, nm, 0.55), at(n, d, 2.2, md, 1.1), at(n, d, 2.2, md, 0.18), 20), 'slip');
        }
      } else for (const d of minor) for (const md of sides) {
        const nm = toward(md, d);
        if (J.shape === 'dumbbell') { const q = J.rbs[minor.indexOf(d)]; ramp(bez(at(n, md, 5.5, nm, 0.22), at(n, md, 2.6, nm, 0.55), { x: q.x + md.x * 0.8, y: q.y + md.y * 0.8 }, { x: q.x, y: q.y }, 20), 'slip'); }
        else if (J.shape === 'spui') ramp(bez(at(n, md, 5.5, nm, 0.22), at(n, md, 2.6, nm, 0.5), at(n, d, 0.9, md, 0.7), at(n, d, 0.32, md, 0.05), 20), 'slip');
        else ramp(bez(at(n, md, 5.5, nm, 0.22), at(n, md, 2.6, nm, 0.55), at(n, d, 1.3, md, 1.2), at(n, d, 1.3, md, 0.18), 20), 'slip');
      }
    } else if (hw.length === 1 || deg >= 4 || (minor.filter(d => d.cls === 'rd').length >= 3)) {
      // a roundabout sized by the roads meeting: a motorway's end 90 m across with two lanes, main roads 60 m (80 m
      // with two lanes by a town), local roads a mini roundabout; the island planted by where it is
      J.kind = 'rb';
      const town = townNear(n.x, n.y), rd = minor.some(d => d.cls === 'rd');
      if (hw.length) { J.r = 0.45; J.lanes = 2; J.isle = hz < 0.5 ? 'trees' : 'grass'; }
      else if (rd) { J.r = town ? 0.4 : 0.3; J.lanes = town ? 2 : 1; J.isle = town ? (hz < 0.5 ? 'monument' : 'planting') : (hz < 0.4 ? 'grass' : hz < 0.75 ? 'planting' : 'trees'); }
      else { J.r = 0.14; J.lanes = 1; J.isle = 'mini'; }
    } else J.kind = 'tj';
    n.ix = J.kind === 'mm' || J.kind === 'mx';
    W.junctions.push(J);
  }
  W.junctionAt = {}; for (const J of W.junctions) W.junctionAt[J.id] = J;
}
/* where a motorway crosses a lesser road, a lane or a city avenue it does not meet (a bypass over a local road,
   the linear city's avenues over its spine), the lesser one rides a bridge over it (brief 56): W.roadX */
function roadBridges(W) {
  W.roadX = [];
  const minors = W.edges.filter(e => e.cls !== 'hw').concat(W.lanes);
  for (const h of W.edges) {
    if (h.cls !== 'hw') continue;
    for (const m of minors) {
      if (m.a && (m.a === h.a || m.a === h.b || m.b === h.a || m.b === h.b)) continue;
      if (!m.bb || m.bb[0] > h.bb[2] || m.bb[2] < h.bb[0] || m.bb[1] > h.bb[3] || m.bb[3] < h.bb[1]) continue;
      for (let i = 1; i < h.pts.length; i++) for (let q = 1; q < m.pts.length; q++) {
        const a = h.pts[i - 1], b = h.pts[i], c = m.pts[q - 1], d = m.pts[q];
        if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.min(a.x, b.x) > Math.max(c.x, d.x) || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.min(a.y, b.y) > Math.max(c.y, d.y)) continue;
        const t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y); if (t < 0) continue;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        // (not at an interchange: its own bridge is there)
        if (W.junctions.some(j => j.over && U.dxy(j.x, j.y, x, y) < 2)) continue;
        W.roadX.push({ x, y, a: Math.atan2(d.y - c.y, d.x - c.x), cls: m.city ? 'art' : m.cls });
      }
    }
  }
}
IC.buildRoadBridges = W => roadBridges(W);
/* roads were built or cut (growth.js): work the junction shapes out again */
IC.buildJunctions = W => junctions(W);
/* the interchanges' footprints (brief 56): a diamond 700 m across, a cloverleaf or trumpet 900 m, measured from
   the node, that a town's blocks and roadside plots keep out of. The interchanges are read from the roads, so a
   city being built sees the ones its own bypass made before the junctions are shaped */
IC.ixFoot = { mx: 2.4, mm: 5, along: 6, beside: 1.5 };
IC.ixList = function (W) {
  // (a cheap signature over the motorways alone: this is asked for by every town, which adds streets and avenues
  // but no motorway unless it lays a spine; counting the nodes' keys each time cost 20 s a world. A motorway
  // added or split adds an edge, and one replaced changes the last one)
  let nh = 0, last = null; for (const e of W.edges) if (e.cls === 'hw') { nh++; last = e; }
  const sig = nh + ':' + (last ? last.a + '-' + last.b : '');
  if (W._ixs && W._ixs.sig === sig) return W._ixs.list;
  const hwN = {}, degN = {}, dirs = {};
  for (const e of W.edges) for (const [k, end] of [[e.a, 0], [e.b, 1]]) {
    degN[k] = (degN[k] || 0) + 1;
    if (e.cls !== 'hw') continue;
    hwN[k] = (hwN[k] || 0) + 1;
    // the way the motorway leaves the node, measured 300 m along it
    const P = end ? e.pts.slice().reverse() : e.pts; let s = 0, q = P[P.length - 1];
    for (let i = 1; i < P.length; i++) { s += U.dist(P[i - 1], P[i]); if (s >= 3) { q = P[i]; break; } }
    const l = U.dist(P[0], q) || 1; (dirs[k] = dirs[k] || []).push({ x: (q.x - P[0].x) / l, y: (q.y - P[0].y) / l });
  }
  const list = [];
  for (const k in hwN) { const n = W.nodes[k]; if (!n || !n.jct || hwN[k] < 2 || degN[k] < 3) continue; list.push({ x: n.x, y: n.y, r: hwN[k] >= 3 ? IC.ixFoot.mm : IC.ixFoot.mx, dirs: hwN[k] >= 3 ? [] : dirs[k] }); }
  W._ixs = { sig, list };
  return list;
};
/* the interchanges within reach of a point, for a town's many asks (IC.ixClear's list) */
IC.ixNear = function (W, x, y, r) { const R = r + IC.ixFoot.along + 2; return IC.ixList(W).filter(q => Math.abs(q.x - x) < R && Math.abs(q.y - y) < R); };
/* is x, y (grown by pad) inside an interchange's footprint: the circle round the node and, at a diamond, the
   strips along the motorway where the slip roads run? */
IC.ixClear = function (W, x, y, pad, list) {
  pad = pad || 0;
  for (const q of list || IC.ixList(W)) {
    const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy);
    if (d < q.r + pad) return q;
    if (d > IC.ixFoot.along + pad) continue;
    for (const v of q.dirs) { const s = dx * v.x + dy * v.y, t = Math.abs(-dx * v.y + dy * v.x); if (s > 0 && s < IC.ixFoot.along + pad && t < IC.ixFoot.beside + pad) return q; }
  }
  return null;
};

/* the road graph for routing (after bridges are destroyed or repaired, roads cut or built): node indices and, per
   node, its neighbours with the cost of the road between (motorways preferred, local roads less so, blocked roads
   eight times dearer). Routes are searched when asked for (IC.route in world.js): the graph is too big for a table
   of every pair, and cutting a road must not stall the game */
IC.buildRouting = function (W, blocked) {
  const ids = Object.keys(W.nodes), idx = {}; ids.forEach((k, i) => idx[k] = i);
  const adj = ids.map(() => []);
  for (const e of W.edges) {
    if (e.abroad) continue;   // (a neighbour's roads are not ours to drive, brief 57)
    const i = idx[e.a], j = idx[e.b]; if (i == null || j == null) continue;
    const cost = e.len * (e.cls === 'hw' ? 0.85 : e.cls === 'lc' ? 1.15 : 1) * (blocked && blocked.has(e.id) ? 8 : 1);
    adj[i].push(j, cost, e); adj[j].push(i, cost, e);
  }
  W.roadIds = ids; W.roadIdx = idx; W.roadAdj = adj; W.blocked = blocked || new Set();
};

})(window.IC);
