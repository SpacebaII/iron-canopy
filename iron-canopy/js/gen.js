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
IC.ROAD_W = { hw: 0.42, rd: 0.2, lc: 0.13, sp: 0.11, ring: 0.36, art: 0.4, st: 0.34, ln: 0.07 };
IC.FOREST_T = 0.56;

/* generation runs in stages; each yield names the stage that comes next, so a browser can let the page draw between
   them and show how far it has got (IC.generateSteps). IC.generate runs them all at once */
IC.generate = seed => { const g = worldSteps(seed); for (;;) { const r = g.next(); if (r.done) return r.value; } };
IC.generateSteps = seed => worldSteps(seed);
function* worldSteps(seed) {
  let R = IC.makeRng(seed);
  const WW = IC.WW, WH = IC.WH;
  const NOX = R() * 900, NOY = R() * 900;
  const fbm = (x, y, o) => U.fbm(x + NOX, y + NOY, o);
  const W = { seed };

  /* ---------- names ---------- */
  const used = new Set();
  const uniq = list => { let n, g = 0; do { n = R.pick(list); g++; } while (used.has(n) && g < 50); used.add(n); return n; };
  W.names = { H: uniq(IC.NAMES.home), A: uniq(IC.NAMES.hostileA), B: uniq(IC.NAMES.hostileB), C: uniq(IC.NAMES.neutral), D: uniq(IC.NAMES.neutral) };
  W.full = {
    H: `Republic of ${W.names.H}`, A: `${W.names.A} ${R.pick(IC.NAMES.suffixA)}`, B: `${W.names.B} ${R.pick(IC.NAMES.suffixB)}`,
    C: `${W.names.C} ${R.pick(IC.NAMES.suffixN)}`, D: `${W.names.D} ${R.pick(IC.NAMES.suffixN)}`
  };
  W.side = { H: 'us', A: 'hostile', B: 'hostile', C: 'neutral', D: 'neutral' };
  const placeNames = new Set();
  W.placeName = () => {
    for (let i = 0; i < 120; i++) {
      const n = R.pick(IC.NAMES.pre) + R.pick(IC.NAMES.suf);
      if (!placeNames.has(n) && n.length <= 10) { placeNames.add(n); return n; }
    }
    return 'Novo' + R.int(1, 99);
  };

  /* ---------- nation outline (star-shaped, so inside = radius test) ---------- */
  const cx = (5925 + R.range(-330, 330)) * M, cy = (4870 + R.range(-220, 220)) * M;
  W.cx = cx; W.cy = cy;
  const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
  const amp = [R.range(0.07, 0.13), R.range(0.04, 0.09), R.range(0.03, 0.06), R.range(0.015, 0.03)];
  const shapeR = a => 1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]) + amp[3] * Math.sin(11 * a + ph[3]);
  const RX = 2250 * K, RY = 1650 * K;
  W.borderPt = a => { const r = shapeR(a); return { x: cx + Math.cos(a) * RX * r, y: cy + Math.sin(a) * RY * r }; };
  // the border's distance from the centre by angle, from a table (asked millions of times while generating)
  const NRB = 8192, RB = new Float64Array(NRB + 1);
  for (let i = 0; i <= NRB; i++) { const a = i / NRB * TAU - Math.PI, r = shapeR(a); RB[i] = Math.hypot(Math.cos(a) * RX * r, Math.sin(a) * RY * r); }
  W.radialB = a => { const f = (U.mod(a + Math.PI, TAU)) / TAU * NRB, i = Math.min(NRB - 1, f | 0), u = f - i; return RB[i] + (RB[i + 1] - RB[i]) * u; };
  W.inHome = (x, y) => Math.hypot(x - cx, y - cy) < W.radialB(Math.atan2(y - cy, x - cx));
  W.depthOut = (x, y) => Math.hypot(x - cx, y - cy) - W.radialB(Math.atan2(y - cy, x - cx));
  W.poly = [];
  for (let i = 0; i < 240; i++) { const p = W.borderPt(i / 240 * TAU); W.poly.push([p.x, p.y]); }

  /* ---------- neighbours ---------- */
  const aA = -Math.PI / 2 + R.range(-0.2, 0.2), wA = R.range(1.9, 2.3);
  const east = R() < 0.5, wB = R.range(1.25, 1.6), wC = R.range(1.4, 1.9);
  let secs;
  if (east) { const b0 = aA - wA / 2, b1 = aA + wA / 2, b2 = b1 + wB, b3 = b2 + wC; secs = [{ k: 'A', a0: b0 }, { k: 'B', a0: b1 }, { k: 'C', a0: b2 }, { k: 'D', a0: b3 }]; }
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
  for (const r of ridges) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0 - r.w, y0 - r.w, x1 + r.w, y1 + r.w];
    // each piece of the crest with its own box, so the height grid skips the pieces far away
    r.segs = [];
    for (let i = 0; i + 1 < r.pts.length; i++) { const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1]; r.segs.push([ax, ay, bx, by, Math.min(ax, bx) - r.w, Math.min(ay, by) - r.w, Math.max(ax, bx) + r.w, Math.max(ay, by) + r.w]); }
    r.name = IC.NAMES.ridge[R.int(0, IC.NAMES.ridge.length - 1)];
  }
  W.ridges = ridges;
  const tx = R.range(-1, 1) * 0.00002 / X, ty = R.range(-1, 1) * 0.00002 / X;
  W.height = (x, y) => {
    let h = fbm(x / 2400, y / 2400) * 0.55 + (x - cx) * tx + (y - cy) * ty;
    for (const r of ridges) {
      if (x < r.bb[0] || y < r.bb[1] || x > r.bb[2] || y > r.bb[3]) continue;
      let d = r.w;
      for (const q of r.segs) if (x >= q[4] && y >= q[5] && x <= q[6] && y <= q[7]) d = Math.min(d, U.segDist(x, y, q[0], q[1], q[2], q[3]));
      if (d < r.w) h += r.a * Math.pow(1 - d / r.w, 2) * (0.55 + 0.9 * fbm(x / 390 + 11, y / 390 + 5, 3));
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
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) bl[j * GW + i] -= U.dxy(i * GC, j * GC, cx, cy) * 0.000022 / X;
  const owner = new Int16Array(GW * GH).fill(-1);
  W.rivers = []; W.lakes = [];
  const srcs = [];
  // sources: the highest 18% of ground in and around the country
  const inl = [];
  for (let j = 4; j < GH - 4; j += 3) for (let i = 4; i < GW - 4; i += 3) if (W.depthOut(i * GC, j * GC) < 1050) inl.push(bl[j * GW + i]);
  inl.sort((a, b) => b - a);
  const hiT = inl[Math.floor(inl.length * 0.18)] || 0.5;
  for (let k = 0; k < 30000 && srcs.length < 60; k++) {
    const i = R.int(4, GW - 5), j = R.int(4, GH - 5), x = i * GC, y = j * GC;
    if (bl[j * GW + i] < hiT || W.depthOut(x, y) > 1050) continue;
    if (srcs.some(s => U.dxy(s.x, s.y, x, y) < 1400)) continue;
    srcs.push({ i, j, x, y });
  }
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
    }
    if (pts.length < 20) continue;
    const r = { pts, w: U.clamp(3 + pts.length * GC * 0.0009, 3, 13), name: W.placeName() + ' River' };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0, y0, x1, y1];
    W.rivers.push(r);
    if (end === 'sink' && W.lakes.length < 16) { const [x, y] = pts[pts.length - 1]; if (!W.lakes.some(l => U.dxy(l.x, l.y, x, y) < 1200)) W.lakes.push({ x, y, rx: R.range(100, 220), ry: R.range(60, 130), rot: R.range(0, 3) }); }
  }
  for (let k = 0; k < 2000 && W.lakes.length < 14; k++) {
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
  W.cities = cities.map((c, i) => {
    const pop = i === 0 ? R.int(1600, 2200) : i <= 3 ? R.int(400, 760) : i <= 10 ? R.int(260, 560) : R.int(90, 340);
    return { id: 'c' + i, kind: 'city', name: W.placeName(), x: c.x, y: c.y, pop, capital: i === 0, grid: R.range(0, Math.PI / 2), r: 45 + Math.sqrt(pop) * 1.7 };
  });

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
  for (const c of byPop.slice(0, 3)) {
    // flat ground, with room for a big airport (some 10 km) clear of rivers and lakes
    const p = spot(c, c.r + 90, c.r + 260, (x, y) => W.slopeAt(x, y) < 0.05 && W.riverDist(x, y) > 70 && ![0, 1, 2, 3, 4, 5].some(k => W.inLake(x + Math.cos(k) * 60, y + Math.sin(k) * 60))); if (!p) continue;
    addInfra({ kind: 'airport', name: `${c.name} ${c.capital ? 'International' : 'Airport'}`, x: p.x, y: p.y, rev: c.capital ? 10 : 5, city: c.id });
  }
  const cap = W.cities[0];
  {
    let best = null, bs = 1e9;
    for (const c of cand) {
      const hb = c.hb;
      if (hb < 1200 || hb > 2100 || taken().some(o => U.dxy(o.x, o.y, c.x, c.y) < 375)) continue;
      const s = U.dxy(c.x, c.y, cap.x, cap.y) * 0.6 + Math.abs(hb - 1575);
      if (s < bs) { bs = s; best = c; }
    }
    if (best) addInfra({ id: 'ab_fwd', kind: 'airbase', name: `${W.placeName()} Air Base`, x: best.x, y: best.y });
  }
  {
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
  for (let i = 0; i < 3 && i < rearCities.length; i++) {
    const p = spot(rearCities[i], rearCities[i].r + 60, rearCities[i].r + 200); if (!p) continue;
    addInfra({ kind: 'factory', name: `${rearCities[i].name} ${facNames[i]}`, x: p.x, y: p.y, lines: i === 0 ? 2 : 1, city: rearCities[i].id });
  }
  {
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
  const dp = spot(cap, cap.r + 120, cap.r + 320); W.depotPos = dp || { x: cap.x + 300, y: cap.y + 225 };
  W.garrisons = [];
  for (const c of [cap].concat(W.cities.slice(1, 11))) { const p = spot(c, c.r + 60, c.r + 240); if (p) W.garrisons.push({ x: p.x, y: p.y, name: `${c.name} Garrison` }); }

  IC.cityStyles(W, IC.makeRng((seed * 613 + 29) >>> 0));

  /* ---------- runway headings; the layouts themselves are built per game (airport.js) ---------- */
  for (const b of W.infra) if (b.kind === 'airbase' || b.kind === 'airport') b.rwyA = R.range(0, Math.PI);

  yield 'roads';
  /* ---------- roads and railways (see buildNetwork below) ---------- */
  W.crossings = [];
  for (const k of ['C', 'D']) {
    const [a0, a1] = W.secSpan(k);
    const n = R.int(2, 3);
    for (let i = 0; i < n; i++) {
      // on the border as W.inHome draws it (borderPt's angle is not quite the point's own)
      const a = U.lerp(a0, a1, (i + 1) / (n + 1)) + R.range(-0.08, 0.08), q = W.borderPt(a), qa = Math.atan2(q.y - cy, q.x - cx), qr = W.radialB(qa), p = { x: cx + Math.cos(qa) * qr, y: cy + Math.sin(qa) * qr };
      const r = Math.hypot(p.x - cx, p.y - cy), far = { x: U.clamp(cx + (p.x - cx) * (r + 1350 * SP) / r, 100, WW - 100), y: U.clamp(cy + (p.y - cy) * (r + 1350 * SP) / r, 100, WH - 100) };
      W.crossings.push({ id: 'x' + k + i, x: p.x, y: p.y, k, far });
    }
  }
  buildNetwork(W, IC.makeRng((seed * 7919 + 13) >>> 0), fbm);
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
      if (W.countryAt(x, y) !== k) continue;
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
  // the roads into the cities have become their avenues (cities.js): number the roads again, measure them
  W.edges.forEach((e, i) => { e.id = 'e' + i; e.len = 0; for (let k = 1; k < e.pts.length; k++) e.len += U.dist(e.pts[k - 1], e.pts[k]); });
  for (const k in W.nodes) W.nodes[k].deg = 0;
  for (const e of W.edges) for (const k of [e.a, e.b]) W.nodes[k].deg++;
  /* ---------- bridges where roads cross rivers ---------- */
  riverBridges(W);
  yield 'junctions';
  // the built-up ground: every block with its yard, in 200 m cells (no fields there, and it counts as town);
  // abroad the fields run up to the towns' blocks
  for (const t of W.cities) for (const b of t.blocks) {
    const e = Math.max(b.w, b.h) / 2 + 0.8;
    for (let i = Math.floor((b.x - e) / BC); i <= Math.floor((b.x + e) / BC); i++) for (let j = Math.floor((b.y - e) / BC); j <= Math.floor((b.y + e) / BC); j++) {
      built.add(bkey(i, j));
      const ci = Math.floor(i / BCK), cj = Math.floor(j / BCK); if (ci >= 0 && cj >= 0 && ci < FGW && cj < FGH) builtC[cj * FGW + ci] = 1;
    }
  }
  junctions(W);
  // bounding boxes, so drawing and traffic can skip lines out of view
  const bbox = l => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of l.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } l.bb = [x0, y0, x1, y1]; };
  for (const l of W.edges.concat(W.lanes, W.rails, W.ramps)) bbox(l);
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
          W.bridges.push({ id: 'br' + W.bridges.length, kind: 'bridge', x, y, edge: e.id, cls: e.cls, a: Math.atan2(b.y - a.y, b.x - a.x), river: r.name, name: `${r.name.replace(' River', '')} Bridge` });
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

function costGrid(W, fbm) {
  const GW = Math.ceil(IC.WW / RC), GH = Math.ceil(IC.WH / RC), N = GW * GH;
  const h = new Float32Array(N), base = new Float32Array(N), wet = new Uint8Array(N);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, x = (i + 0.5) * RC, y = (j + 0.5) * RC;
    const out = W.depthOut(x, y);
    if (out > RC * 1.5 || W.inLake(x, y)) { base[k] = -1; continue; }
    h[k] = W.hAt(x, y);
    base[k] = 1 + (W.forestAt(x, y) ? 0.4 : 0) + (out > -RC ? 1.5 : 0) + 0.3 * fbm(x / 260, y / 260, 2);
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

function buildNetwork(W, R, fbm) {
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
  const road = (a, b, cls) => { const p = search(T, cellP(a), cellP(b), HOW[cls]); if (p) lay(T, p, RANK[cls]); return !!p; };
  const spur = (id, cls, alt) => {
    const s = cellP(id); if (T.use[s]) return;
    // (onto a lesser road: nothing joins a motorway but at an interchange)
    const p = search(T, s, -1, HOW[cls], c => T.use[c] > 0 && T.use[c] < RANK.hw, 4000 * SP);
    if (p) lay(T, p, RANK[cls]); else if (alt) road(id, alt, cls);
  };
  const cities = W.cities, cap = cities[0];
  // motorways: the capital and the ten largest cities, each joined to the nearest one already on the network (the
  // four largest straight to the capital), then between big cities when the way round is long
  const big = cities.filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 10);
  const onHw = [cap];
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
  const nodes = {}, nodeAt = new Map();
  for (const pl of places) if (at.get(pl.cell) === pl) { nodes[pl.id] = { id: pl.id, x: pl.x, y: pl.y }; nodeAt.set(pl.cell, pl.id); }
  let nj = 0;
  const junction = c => { const id = 'j' + nj++, p = ctr(c); nodes[id] = { id, x: p.x, y: p.y, jct: true }; nodeAt.set(c, id); return id; };
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
  edges.forEach((e, i) => e.id = 'e' + i);
  // how many roads meet at each node (junction shapes are worked out once the towns are built: junctions())
  for (const e of edges) for (const k of [e.a, e.b]) { const n = nodes[k]; n.cls = n.cls || {}; n.cls[e.cls] = (n.cls[e.cls] || 0) + 1; }
  for (const k in nodes) { const n = nodes[k], c = n.cls || {}; n.deg = (c.hw || 0) + (c.rd || 0) + (c.lc || 0) + (c.sp || 0); delete n.cls; }
  W.nodes = nodes; W.edges = edges;

  /* ---------- railways: the big cities and the factories, on gentle grades ---------- */
  const RT = layer(G); RT.shut = T.shut;
  const stops = cities.slice().sort((a, b) => b.pop - a.pop).slice(0, 12).concat(W.infra.filter(i => i.kind === 'factory'));
  const inT = [stops[0]], rest = stops.slice(1);
  W.rails = [];
  while (rest.length) {
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
  const SB = 50, sbk = new Map();
  for (const e of W.edges) for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], s = [a.x, a.y, b.x, b.y, e.cls];
    for (let bi = Math.floor(Math.min(a.x, b.x) / SB); bi <= Math.floor(Math.max(a.x, b.x) / SB); bi++) for (let bj = Math.floor(Math.min(a.y, b.y) / SB); bj <= Math.floor(Math.max(a.y, b.y) / SB); bj++) { const k = bi * 4096 + bj; if (!sbk.has(k)) sbk.set(k, []); sbk.get(k).push(s); }
  }
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
  for (const v of W.villages) {
    // a village the city has grown over is part of it now
    // (the box test first: a block further than the reach along either axis is further than it in all)
    const vr = v.r * 0.8;
    if (!v.swallowed) for (const c of W.cities) if (U.dist(c, v) < c.r * 1.7 && c.blocks.some(b => Math.abs(b.x - v.x) < vr && Math.abs(b.y - v.y) < vr && U.dist(b, v) < vr)) v.swallowed = c.id;
    if (v.swallowed) { v.blocks = []; continue; }
    const segs = v.home ? segsNear(v.x, v.y, v.r * 1.3).filter(s => s[4] !== 'hw') : [];
    const n = Math.round(24 + v.pop * 2.2);
    v.blocks = [];
    for (let k = 0, g = 0; k < n && g < n * 6; g++) {
      let x, y, a;
      if (segs.length && R() < 0.85) {
        const s = R.pick(segs), t = R(), L = U.dxy(s[0], s[1], s[2], s[3]);
        a = Math.atan2(s[3] - s[1], s[2] - s[0]);
        const side = R() < 0.5 ? 1 : -1, off = R.range(0.7, 1.4) + (R() < 0.25 ? 1.2 : 0);
        x = s[0] + (s[2] - s[0]) * t - Math.sin(a) * off * side; y = s[1] + (s[3] - s[1]) * t + Math.cos(a) * off * side;
        if (U.dxy(x, y, v.x, v.y) > v.r * (0.5 + 0.7 * R()) || L < 1 || !clear(segs, x, y, 0.5)) continue;
      } else { x = v.x + R.gauss() * v.r * 0.3; y = v.y + R.gauss() * v.r * 0.3; a = v.grid + R.range(-0.2, 0.2); }
      if (W.inLake(x, y)) continue;
      const farmYard = R() < 0.1;
      v.blocks.push({ x, y, w: farmYard ? R.range(1.2, 2) : R.range(0.45, 0.9), h: farmYard ? R.range(0.8, 1.4) : R.range(0.4, 0.7), a, seed: R() * 1000, hp: 1 });
      k++;
    }
  }
  // abroad: the enemy's towns are built to their own plan; the neutral neighbours' look like ours
  for (const f of W.foreign) {
    f.style = W.side[f.k] === 'hostile' ? 'east' : W.style === 'us' ? 'us' : 'eu';
    f.tpl = f.style === 'east' ? 'east' : f.style === 'us' ? 'chi' : 'lon';
    f.home = false; f.grid = R.range(0, Math.PI / 2); f.indA = R.range(0, 7);
    IC.buildCity(W, f, R, fbm, [], [], []);
  }
  /* rural lanes: from local and main roads out into the fields, along the lie of the field boundaries */
  W.lanes = [];
  const occ = new Set(), OC = 8, ok = (x, y) => occ.has(Math.floor(x / OC) + ',' + Math.floor(y / OC));
  const mark = (x, y) => occ.add(Math.floor(x / OC) + ',' + Math.floor(y / OC));
  for (const e of W.edges) for (const p of e.pts) mark(p.x, p.y);
  for (const c of W.cities) for (const b of c.blocks) mark(b.x, b.y);
  for (const e of W.edges) {
    if (e.cls !== 'lc' && e.cls !== 'rd') continue;
    for (let i = 2; i < e.pts.length - 2; i += 3) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (W.farmAt(p.x, p.y) < 0.3 || R() > 0.4) continue;
      if (W.cities.some(c => U.dist(c, p) < c.r * 1.2)) continue;
      const fa = W.fieldAng(p.x, p.y), ra = Math.atan2(q.y - p.y, q.x - p.x);
      // of the two field directions, take the one most across the road
      let a = Math.abs(Math.sin(fa - ra)) > Math.abs(Math.cos(fa - ra)) ? fa : fa + Math.PI / 2;
      if (R() < 0.5) a += Math.PI;
      const pts = [{ x: p.x, y: p.y }], L = R.range(40, 160);
      let x = p.x, y = p.y;
      for (let s = 0; s < L; s += 4) {
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
}

/* ---------- junctions ----------
   Where roads meet, the node gets a real shape, drawn from W.junctions and W.ramps (routing still runs through
   the node itself):
   - two motorways: a cloverleaf, a loop and an outer slip road in every quarter between them, one motorway on a
     bridge over the other (with three arms the same in the two quarters there are: a partial cloverleaf);
   - a motorway and a lesser road: a diamond, the lesser road on a bridge and a slip road in each quarter;
   - a motorway ending at other roads, or a busy junction of main roads: a roundabout;
   - anything else: a T or crossroads with curved kerbs.
   Slip roads are cubic curves, so they leave and join the carriageway smoothly. */
function junctions(W) {
  const N = W.nodes, byNode = {};
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
  const at = (n, d, k, p, o) => ({ x: n.x + d.x * k + (p ? p.x * o : 0), y: n.y + d.y * k + (p ? p.y * o : 0) });
  // the unit vector across d that points into the quarter towards q
  const toward = (d, q) => { const px = -d.y, py = d.x; return px * q.x + py * q.y >= 0 ? { x: px, y: py } : { x: -px, y: -py }; };
  W.junctions = []; W.ramps = [];
  for (const k in byNode) {
    const n = N[k], L = byNode[k], deg = L.length;
    if (deg < 3 && !(deg === 2 && L.some(x => x.e.cls === 'hw') && L.some(x => x.e.cls !== 'hw'))) continue;
    if (!n.jct) continue;   // towns and airfields have their own streets
    const dirs = L.map(x => dirOf(x, 3)).sort((p, q) => p.a - q.a);
    const hw = dirs.filter(d => d.cls === 'hw'), minor = dirs.filter(d => d.cls !== 'hw');
    const J = { id: k, x: n.x, y: n.y, dirs, ramps: [] };
    const ramp = (pts, kind) => { const r = { cls: 'ramp', kind, pts, node: k }; W.ramps.push(r); J.ramps.push(r); };
    if (hw.length >= 3) {
      // cloverleaf: the through pair is the two arms closest to opposite
      J.kind = 'mm';
      let best = null, bs = -2;
      for (let i = 0; i < hw.length; i++) for (let j = i + 1; j < hw.length; j++) { const c = -(hw[i].x * hw[j].x + hw[i].y * hw[j].y); if (c > bs) { bs = c; best = [hw[i], hw[j]]; } }
      J.over = hw.filter(d => !best.includes(d)).map(d => d.a);   // the other motorway crosses on a bridge
      const ring = hw.slice().sort((p, q) => p.a - q.a);
      // quarters wide enough for a loop; where motorways merge at a shallow angle, the narrowest of the rest has one
      const gaps = ring.map((a, i) => U.mod(ring[(i + 1) % ring.length].a - a.a, Math.PI * 2)).filter(g => g >= 0.5 && g <= 2.9);
      const loopMax = gaps.some(g => g < 2.4) ? 2.4 : Math.min(...gaps) + 1e-9;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], gap = U.mod(b.a - a.a, Math.PI * 2);
        if (gap > 2.9 || gap < 0.5) continue;   // no quarter here (the far side of a T)
        const na = toward(a, b), nb = toward(b, a), bis = { x: (a.x + b.x), y: (a.y + b.y) }, bl = Math.hypot(bis.x, bis.y) || 1;
        bis.x /= bl; bis.y /= bl;
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
        if (gap < loopMax) ramp(loop, 'loop');   // a wide quarter needs only the outer slip road
        // the outer slip road: leaves the carriageway at a shallow angle and swings round outside the loop (a narrow
        // quarter has room only for the loop)
        const La = 3.2, far = dc + R + 0.55;
        if (gap > 1) ramp(spline([at(n, a, La + 1.2, na, 0.22), at(n, a, La, na, 0.55), at(n, bis, far), at(n, b, La, nb, 0.55), at(n, b, La + 1.2, nb, 0.22)], 8), 'outer');
      }
    } else if (hw.length === 2 && minor.length) {
      // diamond: the lesser road crosses on a bridge; a slip road in each quarter meets it 130 m from the motorway
      J.kind = 'mx';
      const m = hw[0], mo = hw[1];
      J.over = minor.map(d => d.a);
      for (const d of minor) for (const md of [m, mo]) {
        const nm = toward(md, d);
        ramp(bez(at(n, md, 5.5, nm, 0.22), at(n, md, 2.6, nm, 0.55), at(n, d, 1.3, md, 1.2), at(n, d, 1.3, md, 0.18), 20), 'slip');
      }
    } else if (hw.length === 1 || deg >= 4 || (minor.filter(d => d.cls === 'rd').length >= 3)) {
      J.kind = 'rb'; J.r = hw.length || minor.some(d => d.cls === 'rd') ? 0.35 : 0.24;
    } else J.kind = 'tj';
    n.ix = J.kind === 'mm' || J.kind === 'mx';
    W.junctions.push(J);
  }
  W.junctionAt = {}; for (const J of W.junctions) W.junctionAt[J.id] = J;
}
/* roads were built or cut (growth.js): work the junction shapes out again */
IC.buildJunctions = W => junctions(W);

/* the road graph for routing (after bridges are destroyed or repaired, roads cut or built): node indices and, per
   node, its neighbours with the cost of the road between (motorways preferred, local roads less so, blocked roads
   eight times dearer). Routes are searched when asked for (IC.route in world.js): the graph is too big for a table
   of every pair, and cutting a road must not stall the game */
IC.buildRouting = function (W, blocked) {
  const ids = Object.keys(W.nodes), idx = {}; ids.forEach((k, i) => idx[k] = i);
  const adj = ids.map(() => []);
  for (const e of W.edges) {
    const i = idx[e.a], j = idx[e.b]; if (i == null || j == null) continue;
    const cost = e.len * (e.cls === 'hw' ? 0.85 : e.cls === 'lc' ? 1.15 : 1) * (blocked && blocked.has(e.id) ? 8 : 1);
    adj[i].push(j, cost, e); adj[j].push(i, cost, e);
  }
  W.roadIds = ids; W.roadIdx = idx; W.roadAdj = adj; W.blocked = blocked || new Set();
};

})(window.IC);
