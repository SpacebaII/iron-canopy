/* Iron Canopy — procedural world generation. Everything here derives from one seed. */
(function (IC) {
'use strict';
const U = IC.U;
const TAU = Math.PI * 2;
const K = 1.5;   // map scale relative to the original 800 km layout

IC.generate = function (seed) {
  const R = IC.makeRng(seed);
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
  const cx = 5925 + R.range(-330, 330), cy = 4870 + R.range(-220, 220);
  W.cx = cx; W.cy = cy;
  const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
  const amp = [R.range(0.07, 0.13), R.range(0.04, 0.09), R.range(0.03, 0.06), R.range(0.015, 0.03)];
  const shapeR = a => 1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]) + amp[3] * Math.sin(11 * a + ph[3]);
  const RX = 2250 * K, RY = 1650 * K;
  W.borderPt = a => { const r = shapeR(a); return { x: cx + Math.cos(a) * RX * r, y: cy + Math.sin(a) * RY * r }; };
  W.radialB = a => { const r = shapeR(a); return Math.hypot(Math.cos(a) * RX * r, Math.sin(a) * RY * r); };
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
  const STEP = 330;
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

  /* ---------- relief ---------- */
  const ridges = [];
  const arc = (a0, a1, off, am, w, n) => {
    const pts = []; n = n || 11;
    for (let i = 0; i <= n; i++) {
      const a = U.lerp(a0, a1, i / n), p = W.borderPt(a), r = Math.hypot(p.x - cx, p.y - cy), o = off + R.range(-135, 135);
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
  {
    let a = R.range(0, TAU), rr = R.range(0.25, 0.5), px = cx + Math.cos(a) * RX * rr, py = cy + Math.sin(a) * RY * rr, h = R.range(0, TAU);
    const pts = [];
    for (let i = 0; i < 8; i++) { pts.push([px, py]); h += R.range(-0.5, 0.5); px += Math.cos(h) * 330; py += Math.sin(h) * 330; }
    ridges.push({ pts, a: R.range(0.28, 0.42), w: 390 });
  }
  for (const r of ridges) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0 - r.w, y0 - r.w, x1 + r.w, y1 + r.w];
    r.name = IC.NAMES.ridge[R.int(0, IC.NAMES.ridge.length - 1)];
  }
  W.ridges = ridges;
  const tx = R.range(-1, 1) * 0.00002, ty = R.range(-1, 1) * 0.00002;
  W.height = (x, y) => {
    let h = fbm(x / 1350, y / 1350) * 0.55 + (x - cx) * tx + (y - cy) * ty;
    for (const r of ridges) {
      if (x < r.bb[0] || y < r.bb[1] || x > r.bb[2] || y > r.bb[3]) continue;
      const d = U.polyDist(x, y, r.pts);
      if (d < r.w) h += r.a * Math.pow(1 - d / r.w, 2) * (0.55 + 0.9 * fbm(x / 390 + 11, y / 390 + 5, 3));
    }
    return h;
  };
  const GC = 25, GW = Math.floor(WW / GC) + 1, GH = Math.floor(WH / GC) + 1;
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

  /* ---------- rivers and lakes ---------- */
  let bl = Float32Array.from(hg);
  for (let pass = 0; pass < 3; pass++) {
    const nb = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      let s = 0, n = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue; s += bl[jj * GW + ii]; n++; }
      nb[j * GW + i] = s / n;
    }
    bl = nb;
  }
  // water drains outward towards the neighbours: a gentle bowl-to-rim tilt
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) bl[j * GW + i] -= U.dxy(i * GC, j * GC, cx, cy) * 0.000022;
  const owner = new Int16Array(GW * GH).fill(-1);
  W.rivers = []; W.lakes = [];
  const srcs = [];
  // sources: the highest 18% of ground in and around the country
  const inl = [];
  for (let j = 4; j < GH - 4; j += 3) for (let i = 4; i < GW - 4; i += 3) if (W.depthOut(i * GC, j * GC) < 1050) inl.push(bl[j * GW + i]);
  inl.sort((a, b) => b - a);
  const hiT = inl[Math.floor(inl.length * 0.18)] || 0.5;
  for (let k = 0; k < 8000 && srcs.length < 14; k++) {
    const i = R.int(4, GW - 5), j = R.int(4, GH - 5), x = i * GC, y = j * GC;
    if (bl[j * GW + i] < hiT || W.depthOut(x, y) > 1050) continue;
    if (srcs.some(s => U.dxy(s.x, s.y, x, y) < 900)) continue;
    srcs.push({ i, j, x, y });
  }
  for (const s of srcs) {
    const id = W.rivers.length, pts = [];
    let i = s.i, j = s.j, end = 'none', climb = 0;
    for (let step = 0; step < 1500; step++) {
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
    if (pts.length < 30) continue;
    const r = { pts, w: U.clamp(3 + pts.length * 0.022, 3, 13), name: W.placeName() + ' River' };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0, y0, x1, y1];
    W.rivers.push(r);
    if (end === 'sink' && W.lakes.length < 6) { const [x, y] = pts[pts.length - 1]; if (!W.lakes.some(l => U.dxy(l.x, l.y, x, y) < 700)) W.lakes.push({ x, y, rx: R.range(100, 220), ry: R.range(60, 130), rot: R.range(0, 3) }); }
  }
  for (let k = 0; k < 500 && W.lakes.length < 5; k++) {
    const x = R.range(cx - 2700, cx + 2700), y = R.range(cy - 1950, cy + 1950);
    if (!W.inHome(x, y) || W.hAt(x, y) > 0.35 || W.depthOut(x, y) > -375) continue;
    W.lakes.push({ x, y, rx: R.range(110, 240), ry: R.range(60, 120), rot: R.range(0, 3) });
  }
  W.inLake = (x, y) => W.lakes.some(l => {
    const c = Math.cos(-l.rot), s = Math.sin(-l.rot), dx = x - l.x, dy = y - l.y;
    const X = dx * c - dy * s, Y = dx * s + dy * c;
    return (X / l.rx) ** 2 + (Y / l.ry) ** 2 < 1;
  });
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
  W.forestAt = (x, y) => { const h = W.hAt(x, y); return h > 0.18 && h < 0.92 && U.fbm(x / 630 + 33 + NOX, y / 630 + 77, 4) > 0.56; };

  /* ---------- cities ---------- */
  const cand = [];
  for (let k = 0; k < 9000; k++) {
    const x = R.range(cx - 4050, cx + 4050), y = R.range(cy - 3000, cy + 3000);
    if (!W.inHome(x, y) || W.inLake(x, y)) continue;
    const h = W.hAt(x, y); if (h > 0.72) continue;
    if (W.depthOut(x, y) > -165) continue;
    const hb = W.hostileBorderDist(x, y);
    const score = (1 - h) + (W.riverDist(x, y) < 240 ? 0.35 : 0) + R() * 0.35 - (hb < 390 ? 0.5 : 0);
    cand.push({ x, y, score, hb });
  }
  cand.sort((a, b) => b.score - a.score);
  const cities = [];
  const capC = cand.filter(c => U.dxy(c.x, c.y, cx, cy) < 1275).sort((a, b) => b.score - a.score)[0] || cand[0];
  cities.push(capC);
  const NCITY = 16;
  for (const c of cand) {
    if (cities.length >= NCITY) break;
    if (cities.every(o => U.dxy(o.x, o.y, c.x, c.y) > 780)) cities.push(c);
  }
  // make sure there are front-line towns on both fronts
  for (const f of W.fronts) {
    const near = c => { let m = 1e9; for (let i = 0; i + 1 < f.pts.length; i++) m = Math.min(m, U.segDist(c.x, c.y, f.pts[i].x, f.pts[i].y, f.pts[i + 1].x, f.pts[i + 1].y)); return m; };
    for (let need = 0; need < 2; need++) {
      if (cities.filter(c => near(c) < 1000).length >= 2) break;
      const b = cand.filter(c => near(c) > 380 && near(c) < 950 && cities.every(o => U.dxy(o.x, o.y, c.x, c.y) > 600))[0];
      if (b) { if (cities.length >= NCITY) cities.pop(); cities.push(b); } else break;
    }
  }
  W.cities = cities.map((c, i) => {
    const pop = i === 0 ? R.int(1600, 2200) : i <= 3 ? R.int(400, 760) : R.int(90, 340);
    return { id: 'c' + i, kind: 'city', name: W.placeName(), x: c.x, y: c.y, pop, capital: i === 0, grid: R.range(0, Math.PI / 2), r: 45 + Math.sqrt(pop) * 1.7 };
  });

  /* ---------- villages (home and abroad) ---------- */
  W.villages = [];
  const allTowns = () => W.cities.concat(W.villages);
  let nHome = 0, nAbroad = 0;
  for (let k = 0; k < 9000 && (nHome < 60 || nAbroad < 45); k++) {
    const home = R() < 0.6;
    const x = home ? R.range(cx - 3700, cx + 3700) : R.range(200, WW - 200), y = home ? R.range(cy - 2700, cy + 2700) : R.range(200, WH - 200);
    if (W.inLake(x, y) || W.hAt(x, y) > 0.8) continue;
    if (home !== W.inHome(x, y)) continue;
    if (home ? nHome >= 60 : nAbroad >= 45) continue;
    if (home && W.depthOut(x, y) > -60) continue;
    if (!home && Math.abs(W.depthOut(x, y)) < 60) continue;
    if (allTowns().some(o => U.dxy(o.x, o.y, x, y) < (o.kind === 'city' ? o.r + 260 : 330))) continue;
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
    const p = spot(c, c.r + 90, c.r + 260, (x, y) => W.slopeAt(x, y) < 0.05); if (!p) continue;
    addInfra({ kind: 'airport', name: `${c.name} ${c.capital ? 'International' : 'Airport'}`, x: p.x, y: p.y, rev: c.capital ? 10 : 5, city: c.id });
  }
  const cap = W.cities[0];
  {
    let best = null, bs = 1e9;
    for (const c of cand) {
      const hb = W.hostileBorderDist(c.x, c.y);
      if (hb < 1200 || hb > 2100 || taken().some(o => U.dxy(o.x, o.y, c.x, c.y) < 375)) continue;
      const s = U.dxy(c.x, c.y, cap.x, cap.y) * 0.6 + Math.abs(hb - 1575);
      if (s < bs) { bs = s; best = c; }
    }
    if (best) addInfra({ id: 'ab_fwd', kind: 'airbase', name: `${W.placeName()} Air Base`, x: best.x, y: best.y });
  }
  {
    let best = null, bs = -1e9;
    for (const c of cand) {
      const hb = W.hostileBorderDist(c.x, c.y), dc = U.dxy(c.x, c.y, cap.x, cap.y);
      if (dc < 675 || dc > 2250 || taken().some(o => U.dxy(o.x, o.y, c.x, c.y) < 375)) continue;
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
    for (const pc of [W.cities[R.int(1, Math.min(4, W.cities.length - 1))], W.cities[R.int(5, W.cities.length - 1)]]) {
      if (!pc) continue;
      const p = spot(pc, pc.r + 80, pc.r + 240); if (p) addInfra({ kind: 'power', name: `${pc.name} Power Station`, x: p.x, y: p.y });
    }
  }
  const dp = spot(cap, cap.r + 120, cap.r + 320); W.depotPos = dp || { x: cap.x + 300, y: cap.y + 225 };
  W.garrisons = [];
  for (const c of [cap].concat(W.cities.slice(1, 5))) { const p = spot(c, c.r + 60, c.r + 240); if (p) W.garrisons.push({ x: p.x, y: p.y, name: `${c.name} Garrison` }); }

  /* ---------- runway headings; the layouts themselves are built per game (airport.js) ---------- */
  for (const b of W.infra) if (b.kind === 'airbase' || b.kind === 'airport') b.rwyA = R.range(0, Math.PI);

  /* ---------- roads and railways (see buildNetwork below) ---------- */
  W.crossings = [];
  for (const k of ['C', 'D']) {
    const [a0, a1] = W.secSpan(k);
    const n = R.int(1, 2);
    for (let i = 0; i < n; i++) {
      const a = U.lerp(a0, a1, (i + 1) / (n + 1)) + R.range(-0.08, 0.08), p = W.borderPt(a);
      const r = Math.hypot(p.x - cx, p.y - cy), far = { x: cx + (p.x - cx) * (r + 1350) / r, y: cy + (p.y - cy) * (r + 1350) / r };
      W.crossings.push({ id: 'x' + k + i, x: p.x, y: p.y, k, far });
    }
  }
  buildNetwork(W, IC.makeRng((seed * 7919 + 13) >>> 0), fbm);
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

  /* ---------- bridges where roads cross rivers ---------- */
  W.bridges = [];
  for (const e of edges) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    for (const r of W.rivers) {
      if (r.bb[0] > x1 || r.bb[2] < x0 || r.bb[1] > y1 || r.bb[3] < y0) continue;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        for (let q = 2; q < r.pts.length; q += 2) {
          const c = r.pts[q - 2], d = r.pts[q];
          const t = U.segX(a.x, a.y, b.x, b.y, c[0], c[1], d[0], d[1]);
          if (t < 0) continue;
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          if (W.bridges.some(o => U.dxy(o.x, o.y, x, y) < 40)) continue;
          W.bridges.push({ id: 'br' + W.bridges.length, kind: 'bridge', x, y, edge: e.id, cls: e.cls, a: Math.atan2(b.y - a.y, b.x - a.x), river: r.name, name: `${r.name.replace(' River', '')} Bridge` });
        }
      }
    }
  }

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
    for (let i = 0; i < (hostile ? 5 : 3); i++) {
      const front = hostile && i < 2;
      const p = radialPt(k, front ? 300 : 1050, front ? 800 : 2700, 700, W.foreign);
      W.foreign.push({ id: 'f' + k + i, kind: 'ftown', k, name: W.placeName(), x: p.x, y: p.y, apt: i === 2 || (!hostile && i === 0), frontier: front, pop: front ? R.int(60, 180) : R.int(120, 600), r: front ? 55 : 70 });
    }
  }

  /* ---------- civil airways ---------- */
  W.airways = [];
  const ports = W.foreign.filter(f => f.apt).map(f => ({ x: f.x, y: f.y, name: f.name, k: f.k }));
  const homeApts = W.infra.filter(i => i.kind === 'airport').map(i => ({ x: i.x, y: i.y, name: i.name, k: 'H', id: i.id }));
  // gateways far off the map edge for long-haul traffic
  const gate = (a) => ({ x: U.clamp(cx + Math.cos(a) * 9000, -600, WW + 600), y: U.clamp(cy + Math.sin(a) * 9000, -600, WH + 600), name: 'long-haul', k: 'X', edge: true });
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
  const SITE = (k, kind, dmin, dmax, extra) => {
    const p = radialPt(k, dmin * K, dmax * K, 330, W.esites.concat(W.foreign));
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
    for (const c of W.cities) if (U.dxy(x, y, c.x, c.y) < c.r * 0.95) return c;
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
  const FGC = 25, FGW = Math.ceil(IC.WW / FGC) + 1, FGH = Math.ceil(IC.WH / FGC) + 1, farm = new Float32Array(FGW * FGH);
  const hv = W.villages.filter(v => v.home);
  const ring = (o, R0, f) => {
    const i0 = Math.max(0, Math.floor((o.x - R0) / FGC)), i1 = Math.min(FGW - 1, Math.ceil((o.x + R0) / FGC));
    const j0 = Math.max(0, Math.floor((o.y - R0) / FGC)), j1 = Math.min(FGH - 1, Math.ceil((o.y + R0) / FGC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * FGW + i, e = Math.hypot(i * FGC - o.x, j * FGC - o.y); if (e < R0 && farm[k] >= 0) farm[k] = f(e, farm[k]); }
  };
  for (const v of hv) ring(v, 260, (e, w) => Math.max(w, 0.75 * (1 - e / 260) + 0.15));
  for (const c of W.cities) ring(c, c.r * 3.6, (e, w) => e < c.r * 0.85 ? -1 : Math.max(w, (0.9 * (1 - e / (c.r * 3.6)) + 0.2) * U.clamp((e - c.r * 0.85) / (c.r * 0.3), 0, 1)));
  W.farmAt = (x, y) => {
    const h = W.hAt(x, y);
    if (h > 0.68 || W.inLake(x, y)) return 0;
    const fx = U.clamp(x / FGC, 0, FGW - 1.001), fy = U.clamp(y / FGC, 0, FGH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    const a = farm[j * FGW + i], b = farm[j * FGW + i + 1], c = farm[(j + 1) * FGW + i], d = farm[(j + 1) * FGW + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) return 0;   // built up, no fields
    const fw = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    // fields thin out up the hillsides
    return Math.min(1, Math.max(fw, h < 0.4 ? 0.3 : 0.12)) * U.clamp((0.68 - h) / 0.14, 0, 1);
  };
  /* ---------- streets, districts and buildings; lanes across the farmland ---------- */
  W.fieldAng = (x, y) => (U.hash(Math.floor(x / 1500) + 900, Math.floor(y / 1500) + 300) - 0.5) * 1.2;
  buildTowns(W, IC.makeRng((seed * 131 + 7) >>> 0), fbm);
  // bounding boxes, so drawing and traffic can skip lines out of view
  const bbox = l => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of l.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } l.bb = [x0, y0, x1, y1]; };
  for (const l of W.edges.concat(W.lanes, W.rails)) bbox(l);
  for (const c of W.cities) for (const l of c.streets) bbox(l);

  return W;
};

/* ---------- road and rail network ----------
   Roads are laid on a coarse cost grid (RC units a cell) by A*. Slopes, forest and river crossings cost more;
   lakes, airfields and foreign soil are closed; running along a road already built is cheap, so a new road
   joins the network instead of running beside it. The grid links the roads use then become the graph: places,
   and cells where three or more links meet, are nodes, and the runs between them are edges. */
const RC = 40;
const RANK = { sp: 1, lc: 2, rd: 3, hw: 4 }, CLS = [null, 'sp', 'lc', 'rd', 'hw'];
// 16 neighbours, so roads can run at gentle angles and not only along the grid and its diagonals
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
const MLEN = MOVES.map(([x, y]) => Math.hypot(x, y) * RC);
// how each class of line prices the ground: slope, river crossings, running next to (not on) a road, reuse by rank
const HOW = {
  hw: { slope: 2.4, bridge: 5, near: 0.5, reuse: [1, 1, 1, 0.75, 0.42], hk: 0.4 },
  rd: { slope: 1.2, bridge: 4, near: 0.6, reuse: [1, 0.55, 0.45, 0.4, 0.42], hk: 0.38 },
  lc: { slope: 0.8, bridge: 3, near: 0.4, reuse: [1, 0.45, 0.38, 0.36, 0.4], hk: 0 },
  sp: { slope: 0.6, bridge: 3, near: 0.2, reuse: [1, 0.4, 0.36, 0.36, 0.4], hk: 0 },
  rail: { slope: 5, bridge: 2, near: 0, reuse: [1, 0.3, 0.3, 0.3, 0.3], hk: 0.3 }
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
    g: new Float64Array(G.N), par: new Int32Array(G.N), seen: new Uint32Array(G.N), gen: 0, hf: [], hv: [] };
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
  const closed = new Set();
  while (n) {
    const a = pop();
    if (closed.has(a)) continue;
    closed.add(a);
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
      if (G.base[b] < 0 || (T.shut[b] && b !== t) || closed.has(b)) continue;
      const L = MLEN[m], r = T.link.get(lkey(a, b, N));
      let c;
      if (r) c = L * o.reuse[r];
      else {
        if (m >= 4 && cuts(T, ax, ay, bx, by)) continue;
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
  const place = (id, p) => { const c = cellOf(p), pl = { id, x: p.x, y: p.y, cell: c }; if (at.has(c)) twins.push([id, at.get(c).id]); else at.set(c, pl); places.push(pl); return pl; };
  for (const c of W.cities) place(c.id, c);
  for (const x of W.crossings) place(x.id, x);
  for (const v of W.villages) if (v.home) place(v.id, v);
  for (const i of W.infra) place(i.id, i);
  place('depot', W.depotPos);
  W.garrisons.forEach((g, i) => place('g' + i, g));
  const cellP = id => places.find(p => p.id === id).cell;
  const road = (a, b, cls) => { const p = search(T, cellP(a), cellP(b), HOW[cls]); if (p) lay(T, p, RANK[cls]); return !!p; };
  const spur = (id, cls, alt) => {
    const s = cellP(id); if (T.use[s]) return;
    const p = search(T, s, -1, HOW[cls], c => T.use[c] > 0, 4000);
    if (p) lay(T, p, RANK[cls]); else if (alt) road(id, alt, cls);
  };
  const cities = W.cities, cap = cities[0];
  // motorways: the capital to the four largest cities, then between big cities when the way round is long
  const big = cities.filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 4).sort((a, b) => U.dist(a, cap) - U.dist(b, cap));
  for (const c of big) road(cap.id, c.id, 'hw');
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const a = big[i], b = big[j], d = U.dist(a, b);
    if (d < 2600 && d * 1.6 < U.dist(a, cap) + U.dist(cap, b)) road(a.id, b.id, 'hw');
  }
  // main roads: every pair of neighbouring cities (a Gabriel graph, so no long road runs past a nearer town)
  const pairs = [];
  for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) {
    const a = cities[i], b = cities[j], d = U.dist(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (d > 2700 || cities.some(c => c !== a && c !== b && U.dxy(c.x, c.y, mx, my) < d / 2)) continue;
    pairs.push([a, b, d]);
  }
  pairs.sort((p, q) => p[2] - q[2]);
  for (const [a, b] of pairs) road(a.id, b.id, 'rd');
  for (const x of W.crossings) road(x.id, cities.slice().sort((p, q) => U.dist(p, x) - U.dist(q, x))[0].id, 'rd');
  // local roads: villages join the nearest road, and some join a neighbour so the road runs on through
  const vs = W.villages.filter(v => v.home).sort((a, b) => U.dist(a, cap) - U.dist(b, cap));
  for (const v of vs) spur(v.id, 'lc', cities.slice().sort((p, q) => U.dist(p, v) - U.dist(q, v))[0].id);
  for (const v of vs) {
    const o = vs.filter(w => w !== v && U.dist(w, v) < 700).sort((p, q) => U.dist(p, v) - U.dist(q, v))[0];
    if (o && R() < 0.5) road(v.id, o.id, 'lc');
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
  // interchanges: junctions where a motorway meets another road
  for (const e of edges) for (const k of [e.a, e.b]) { const n = nodes[k]; n.cls = n.cls || {}; n.cls[e.cls] = (n.cls[e.cls] || 0) + 1; }
  for (const k in nodes) { const n = nodes[k], c = n.cls || {}; n.deg = (c.hw || 0) + (c.rd || 0) + (c.lc || 0) + (c.sp || 0); n.ix = !!c.hw && n.deg > 2 && !!n.jct; delete n.cls; }
  for (const e of edges) if (e.cls === 'hw') { const n = nodes[e.a], q = e.pts[Math.min(2, e.pts.length - 1)]; if (n.ix && n.ixA == null) n.ixA = Math.atan2(q.y - n.y, q.x - n.x); const m = nodes[e.b], r = e.pts[Math.max(0, e.pts.length - 3)]; if (m.ix && m.ixA == null) m.ixA = Math.atan2(r.y - m.y, r.x - m.x); }
  W.nodes = nodes; W.edges = edges;

  /* ---------- railways: the big cities and the factories, on gentle grades ---------- */
  const RT = layer(G); RT.shut = T.shut;
  const stops = cities.slice().sort((a, b) => b.pop - a.pop).slice(0, 6).concat(W.infra.filter(i => i.kind === 'factory'));
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
   A city is a dense centre on a street grid, residential districts whose streets bend with the ground, an
   industrial quarter towards the railway or motorway, and suburbs that thin out along the roads in. Big cities
   get a ring road. Each block is one entry in city.blocks (damage and night lights work on blocks). */
function buildTowns(W, R, fbm) {
  const segsNear = (x, y, rad) => {
    const out = [];
    for (const e of W.edges) for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      if (U.segDist(x, y, a.x, a.y, b.x, b.y) < rad) out.push([a.x, a.y, b.x, b.y, e.cls]);
    }
    return out;
  };
  const clear = (segs, x, y, d) => { for (const s of segs) if (U.segDist(x, y, s[0], s[1], s[2], s[3]) < d + (s[4] === 'hw' ? 1.2 : 0)) return false; return true; };
  const fields = W.infra.filter(i => i.kind === 'airport' || i.kind === 'airbase' || i.kind === 'factory' || i.kind === 'power');
  const freeGround = (x, y, pad) => !W.inLake(x, y) && W.riverDist(x, y) > 4 + pad && !fields.some(f => U.dxy(f.x, f.y, x, y) < (f.kind === 'factory' || f.kind === 'power' ? 20 : 48));
  for (const c of W.cities) {
    const r = c.r, ca = Math.cos(c.grid), sa = Math.sin(c.grid);
    // the town edge wanders: some sectors reach out further than others
    const ph1 = R.range(0, 7), ph2 = R.range(0, 7);
    const reach = a => r * (1 + 0.16 * Math.sin(2 * a + ph1) + 0.1 * Math.sin(3 * a + ph2));
    const segs = segsNear(c.x, c.y, r * 1.5);
    // industry faces the railway if there is one, else the busiest road out
    let ia = R.range(0, 7);
    const rail = W.rails.find(l => l.a === c || l.b === c);
    if (rail) { const p = rail.a === c ? rail.pts[Math.min(8, rail.pts.length - 1)] : rail.pts[Math.max(0, rail.pts.length - 9)]; ia = Math.atan2(p.y - c.y, p.x - c.x); }
    else { const e = W.edges.filter(e => e.a === c.id || e.b === c.id).sort((p, q) => (q.cls === 'hw') - (p.cls === 'hw'))[0]; if (e) { const p = e.a === c.id ? e.pts[Math.min(6, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 7)]; ia = Math.atan2(p.y - c.y, p.x - c.x) + 0.5; } }
    c.indA = ia;
    const SP = c.pop > 1000 ? 5 : 5.5, n = Math.ceil(r * 1.25 / SP);
    // gentle warp so outer streets follow the lie of the land instead of a ruler
    const warp = (u, v) => { const d = Math.hypot(u, v) / r, k = U.clamp((d - 0.35) / 0.6, 0, 1) * SP * 0.9; return [u + k * (fbm(u / 40 + c.x, v / 40, 2) - 0.5) * 2, v + k * (fbm(u / 40, v / 40 + c.y, 2) - 0.5) * 2]; };
    const toW = (u, v) => { const [p, q] = warp(u, v); return { x: c.x + p * ca - q * sa, y: c.y + p * sa + q * ca }; };
    const inside = (u, v, k) => { const a = Math.atan2(u * sa + v * ca, u * ca - v * sa); return Math.hypot(u, v) < reach(a) * k; };
    const districtOf = (u, v) => {
      const d = Math.hypot(u, v) / r, a = Math.atan2(u * sa + v * ca, u * ca - v * sa);
      if (d < 0.36) return 'centre';
      if (d < 1.1 && Math.abs(U.angWrap(a - ia)) < 0.45 && d > 0.42) return 'ind';
      return d < 0.8 ? 'res' : 'sub';
    };
    c.streets = []; c.blocks = []; c.parks = [];
    // avenues radiate from the centre where no road already comes in
    if (c.pop > 150) {
      const ins = W.edges.filter(e => e.a === c.id || e.b === c.id).map(e => { const p = e.a === c.id ? e.pts[Math.min(3, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 4)]; return Math.atan2(p.y - c.y, p.x - c.x); });
      const nA = c.pop > 1000 ? 8 : 5, a0 = R.range(0, 7);
      for (let k = 0; k < nA; k++) {
        const a = a0 + k * Math.PI * 2 / nA + R.range(-0.2, 0.2);
        if (ins.some(b => Math.abs(U.angWrap(a - b)) < 0.4)) continue;
        const pts = [];
        for (let d = 0; d <= reach(a) * 0.85; d += SP / 2) {
          const x = c.x + Math.cos(a) * d + Math.sin(a) * 2 * Math.sin(d / 30), y = c.y + Math.sin(a) * d - Math.cos(a) * 2 * Math.sin(d / 30);
          if (!freeGround(x, y, 0)) break;
          pts.push({ x, y });
        }
        if (pts.length < 4) continue;
        c.streets.push({ cls: 'art', pts });
        for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 'art']);
      }
    }
    // blocks sit in the cells of the street grid; the nearest cells fill first
    const target = Math.round(U.clamp(c.pop / 2.6, 50, 800));
    const cand = [];
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const u = (i + 0.5) * SP, v = (j + 0.5) * SP, d = Math.hypot(u, v) / r;
      if (!inside(u, v, 1.05)) continue;
      const dist = districtOf(u, v), p = toW(u, v);
      const fill = dist === 'centre' ? 1 : dist === 'ind' ? 0.85 : dist === 'res' ? 0.95 - d * 0.3 : 0.5 * (1.1 - d);
      if (R() > fill || !freeGround(p.x, p.y, 1) || !clear(segs, p.x, p.y, 2.6)) continue;
      cand.push({ p, dist, d: d + R() * 0.12, i, j });
    }
    cand.sort((a, b) => a.d - b.d);
    const used = new Set();
    for (const k of cand.slice(0, target)) {
      const { p, dist } = k;
      used.add(k.i + ',' + k.j);
      if (dist === 'res' && R() < 0.05) { c.parks.push({ x: p.x, y: p.y, rx: SP * 0.45, ry: SP * 0.4, a: c.grid }); continue; }
      const core = dist === 'centre', ind = dist === 'ind', sub = dist === 'sub';
      const bw = core ? SP - 1.1 : ind ? SP - 1 : sub ? R.range(1.8, 3.2) : R.range(SP - 2.2, SP - 1.3);
      const bh = core ? SP - 1.1 : ind ? SP - 1.4 : sub ? R.range(1.6, 2.8) : R.range(SP - 2.4, SP - 1.4);
      c.blocks.push({ x: p.x, y: p.y, w: bw, h: bh, a: c.grid, core, ind, sub, seed: R() * 1000, hp: 1 });
    }
    // streets run between built cells: a grid line is kept where a block lies on either side of it
    const has = (i, j) => used.has(i + ',' + j);
    for (let axis = 0; axis < 2; axis++) for (let k = -n; k <= n; k++) {
      let run = [];
      const flush = () => { if (run.length > 1) c.streets.push({ cls: k === 0 ? 'art' : 'st', pts: run }); run = []; };
      for (let m = -n; m <= n; m++) {
        // the piece of line k between grid nodes m and m+1 borders cells (k-1, m) and (k, m)
        const on = axis ? has(m, k - 1) || has(m, k) : has(k - 1, m) || has(k, m);
        const u0 = axis ? m * SP : k * SP, v0 = axis ? k * SP : m * SP;
        if (on) {
          for (let q = run.length ? 1 : 0; q <= 2; q++) {
            const p = toW(axis ? u0 + q * SP / 2 : u0, axis ? v0 : v0 + q * SP / 2);
            if (W.inLake(p.x, p.y)) { flush(); break; }
            run.push(p);
          }
        } else flush();
      }
      flush();
    }
    // ring roads for the big cities: one round the centre, and round the capital's built-up edge a motorway ring
    if (c.pop > 400) {
      const ext = c.blocks.reduce((m, b) => Math.max(m, U.dist(b, c)), 0);
      const ring = (k, cls) => {
        const pts = [];
        for (let i = 0; i <= 90; i++) {
          const a = i / 90 * Math.PI * 2, rr = Math.min(ext * k, reach(a) * k) * (1 + 0.04 * Math.sin(5 * a + ph2));
          pts.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr });
        }
        c.streets.push({ cls, pts, ring: true });
      };
      ring(0.45, 'art');
      if (c.capital) ring(0.98, 'ring');
    }
    // suburbs strung along the main roads just outside town
    for (const s of segs) {
      if (s[4] === 'sp') continue;
      const L = U.dxy(s[0], s[1], s[2], s[3]), a = Math.atan2(s[3] - s[1], s[2] - s[0]);
      for (let t = 0; t < L; t += 3.2) {
        const x = s[0] + (s[2] - s[0]) * t / L, y = s[1] + (s[3] - s[1]) * t / L, d = U.dxy(x, y, c.x, c.y) / r;
        if (d < 0.9 || d > 1.45 || R() > 0.55 * (1.5 - d)) continue;
        const side = R() < 0.5 ? 1 : -1, off = (s[4] === 'hw' ? 4 : 2.2) + R.range(0, 1.2);
        const bx = x - Math.sin(a) * off * side, by = y + Math.cos(a) * off * side;
        if (!freeGround(bx, by, 1) || !clear(segs, bx, by, 1.4)) continue;
        c.blocks.push({ x: bx, y: by, w: R.range(1.6, 2.8), h: R.range(1.4, 2.4), a, sub: true, seed: R() * 1000, hp: 1 });
      }
    }
  }
  // villages: houses along the roads through them
  for (const v of W.villages) {
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
  for (const f of W.foreign) {
    const n = Math.round(f.pop / 4);
    f.blocks = [];
    for (let k = 0; k < n; k++) {
      const x = f.x + R.gauss() * f.r * 0.45, y = f.y + R.gauss() * f.r * 0.45;
      if (W.inLake(x, y)) continue;
      f.blocks.push({ x, y, w: R.range(2.5, 6), h: R.range(2, 4.5), a: R.range(0, 0.4), seed: R() * 1000, hp: 1 });
    }
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

/* recompute road routing (after bridges are destroyed or repaired) */
IC.buildRouting = function (W, blocked) {
  const nodes = W.nodes, edges = W.edges;
  const ids = Object.keys(nodes), idx = {}; ids.forEach((k, i) => idx[k] = i);
  const n = ids.length;
  const D = Array.from({ length: n }, () => new Float64Array(n).fill(1e12));
  const NX = Array.from({ length: n }, () => new Int32Array(n).fill(-1));
  for (let i = 0; i < n; i++) { D[i][i] = 0; NX[i][i] = i; }
  for (const e of edges) {
    const i = idx[e.a], j = idx[e.b];
    const cost = e.len * (e.cls === 'hw' ? 0.85 : e.cls === 'lc' ? 1.15 : 1) * (blocked && blocked.has(e.id) ? 8 : 1);
    if (cost < D[i][j]) { D[i][j] = D[j][i] = cost; NX[i][j] = j; NX[j][i] = i; }
  }
  for (let k = 0; k < n; k++) { const Dk = D[k]; for (let i = 0; i < n; i++) { const Di = D[i], dik = Di[k]; if (dik >= 1e12) continue; const NXi = NX[i]; for (let j = 0; j < n; j++) { const v = dik + Dk[j]; if (v < Di[j]) { Di[j] = v; NXi[j] = NXi[k]; } } } }
  W.roadIds = ids; W.roadIdx = idx; W.roadD = D; W.roadNX = NX; W.blocked = blocked || new Set();
};

})(window.IC);
