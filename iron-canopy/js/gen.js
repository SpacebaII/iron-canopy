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

  /* ---------- roads ---------- */
  const nodes = {};
  const addNode = (id, x, y) => { nodes[id] = { id, x, y }; return nodes[id]; };
  for (const c of W.cities) addNode(c.id, c.x, c.y);
  const edges = [];
  const edgeKey = new Set();
  const has = (a, b) => edgeKey.has(a + '|' + b) || edgeKey.has(b + '|' + a);
  const addEdge = (a, b, cls) => { if (a === b || has(a, b)) return; edges.push({ a, b, cls }); edgeKey.add(a + '|' + b); };
  {
    const inT = new Set([W.cities[0].id]);
    while (inT.size < W.cities.length) {
      let best = null, bd = 1e12;
      for (const a of W.cities) if (inT.has(a.id)) for (const b of W.cities) if (!inT.has(b.id)) { const d = U.dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
      inT.add(best[1].id);
      addEdge(best[0].id, best[1].id, (best[0].pop > 350 && best[1].pop > 350) || best[0].capital || best[1].capital ? 'hw' : 'rd');
    }
  }
  for (const a of W.cities) {
    const near = W.cities.filter(b => b !== a).sort((p, q) => U.dist(a, p) - U.dist(a, q)).slice(0, 2);
    for (const b of near) {
      if (U.dist(a, b) > 2250 || has(a.id, b.id)) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const clash = edges.some(e => {
        const o = e.a === a.id ? nodes[e.b] : e.b === a.id ? nodes[e.a] : null;
        return o && Math.abs(U.angWrap(Math.atan2(o.y - a.y, o.x - a.x) - ang)) < 0.45;
      });
      if (!clash) addEdge(a.id, b.id, 'rd');
    }
  }
  for (const v of W.villages) {
    if (!v.home) continue;
    addNode(v.id, v.x, v.y);
    const near = Object.values(nodes).filter(n => n.id !== v.id).sort((p, q) => U.dist(v, p) - U.dist(v, q)).slice(0, 2);
    addEdge(v.id, near[0].id, 'lc');
    if (near[1] && U.dist(v, near[1]) < 700 && R() < 0.5) addEdge(v.id, near[1].id, 'lc');
  }
  W.crossings = [];
  for (const k of ['C', 'D']) {
    const [a0, a1] = W.secSpan(k);
    const n = R.int(1, 2);
    for (let i = 0; i < n; i++) {
      const a = U.lerp(a0, a1, (i + 1) / (n + 1)) + R.range(-0.08, 0.08), p = W.borderPt(a);
      const id = 'x' + k + i; addNode(id, p.x, p.y);
      const r = Math.hypot(p.x - cx, p.y - cy), far = { x: cx + (p.x - cx) * (r + 1350) / r, y: cy + (p.y - cy) * (r + 1350) / r };
      W.crossings.push({ id, x: p.x, y: p.y, k, far });
      const c = W.cities.slice().sort((q, s) => U.dist(q, p) - U.dist(s, p))[0];
      addEdge(id, c.id, 'rd');
    }
  }
  for (const inf of W.infra) {
    addNode(inf.id, inf.x, inf.y);
    const c = W.cities.slice().sort((q, s) => U.dist(q, inf) - U.dist(s, inf))[0];
    addEdge(inf.id, c.id, 'sp');
  }
  addNode('depot', W.depotPos.x, W.depotPos.y); addEdge('depot', W.cities[0].id, 'sp');
  W.garrisons.forEach((g, i) => { addNode('g' + i, g.x, g.y); const c = W.cities.slice().sort((q, s) => U.dist(q, g) - U.dist(s, g))[0]; addEdge('g' + i, c.id, 'sp'); });
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
  for (const e of edges) {
    e.pts = wiggle(nodes[e.a], nodes[e.b], e.cls === 'lc' ? 60 : 165);
    e.len = 0; for (let i = 1; i < e.pts.length; i++) e.len += U.dist(e.pts[i - 1], e.pts[i]);
    e.id = 'e' + edges.indexOf(e);
  }
  W.nodes = nodes; W.edges = edges;

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

  /* ---------- railways between the big cities and the factories ---------- */
  W.rails = [];
  {
    const stops = byPop.slice(0, 6).concat(W.infra.filter(i => i.kind === 'factory'));
    const inT = [stops[0]];
    const rest = stops.slice(1);
    while (rest.length) {
      let best = null, bd = 1e12;
      for (const a of inT) for (const b of rest) { const d = U.dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
      W.rails.push({ a: best[0], b: best[1], pts: wiggle(best[0], best[1], 90) });
      inT.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
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
  W.farmAt = (x, y) => {
    const h = W.hAt(x, y);
    if (h > 0.62 || W.inLake(x, y)) return 0;
    let fw = h < 0.4 ? 0.3 : 0.1;
    for (const c of W.cities) { const rf = c.r * 3.6, e = U.dxy(c.x, c.y, x, y); if (e < rf) fw = Math.max(fw, 0.9 * (1 - e / rf) + 0.2); }
    return Math.min(1, fw);
  };
  return W;
};

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
