/* Iron Canopy — cities: their street plans, districts and blocks.
   A city grows out from its centre over a cost field: flat, dry, open ground is cheap, hills, forest and rivers
   are dear, and the roads out of town are cheapest of all, so the built-up area reaches out in fingers along the
   roads and valleys, leaves gaps on steep or wet ground and swallows the villages close by. Its streets are a
   lattice bent by a smooth warp, so they curve with the land and districts turn against each other while every
   block still sits between streets. A style (European, American, planned new town, industrial town, and the
   enemy's own) sets the lattice, the districts and the buildings. Every block has a district; the city keeps
   the mix, which the economy reads for its passenger and cargo demand. */
(function (IC) {
'use strict';
const U = IC.U;

/* districts: what a block is used for, and the old flags the rest of the game reads */
IC.DISTRICTS = {
  old: { name: 'old town', core: true }, biz: { name: 'business district', core: true }, dense: { name: 'dense housing' },
  sub: { name: 'suburbs', sub: true }, ind: { name: 'industry', ind: true }, log: { name: 'warehouses', ind: true }, rail: { name: 'rail yards', ind: true }
};
/* styles. SP: street lattice spacing (units); warp: how much streets bend (outer: extra bend in the suburbs);
   wl: the bend's wavelength; old: share of the city in the old town; art: every how many streets an avenue;
   shares of business, dense housing, industry and warehouses; yard: rail yard cells at most; cul: share of
   suburbs built as cul-de-sacs; mall: share of suburban cells on avenues that are strip malls and car parks */
const STYLE = {
  eu: { name: 'European', SP: 4.6, warp: 0.1, wl: 44, old: 0.045, ring: true, radials: 5, art: 4, biz: 0.05, dense: 0.38, ind: 0.12, log: 0.05, yard: 4, cul: 0.08, mall: 0.05, parks: 2 },
  us: { name: 'American', SP: 5.6, warp: 0, outer: 0.08, wl: 70, old: 0, art: 3, biz: 0.05, dense: 0.14, ind: 0.09, log: 0.1, yard: 3, cul: 0.72, mall: 0.4, parks: 1, loop: true },
  new: { name: 'planned new town', SP: 5.2, warp: 0.12, wl: 95, old: 0, art: 2, biz: 0.06, dense: 0.44, ind: 0.12, log: 0.07, yard: 2, cul: 0.45, mall: 0.2, parks: 3 },
  ind: { name: 'industrial town', SP: 4.8, warp: 0.07, wl: 40, old: 0.05, art: 4, biz: 0.02, dense: 0.36, ind: 0.3, log: 0.08, yard: 6, cul: 0.05, mall: 0.05, parks: 1 },
  east: { name: 'eastern', SP: 6, warp: 0.03, wl: 60, old: 0.04, art: 2, biz: 0.03, dense: 0.6, ind: 0.2, log: 0.03, yard: 3, cul: 0, mall: 0, parks: 1 }
};
IC.CITY_STYLES = STYLE;

/* ---------- the street plan: lattice (u, v) → world, bent by a smooth warp ---------- */
IC.cityFrame = function (c) {
  const L = c.lat;
  if (c._fr && c._fr.L === L) return c._fr;
  const ca = Math.cos(L.a), sa = Math.sin(L.a), wl = L.wl, s = L.s, SP = L.SP;
  // the bend fades out towards the centre, so the roads into town still meet at the city's node
  const disp = (u, v) => {
    const d = Math.hypot(u, v), k = U.smooth(U.clamp(d / (3 * SP), 0, 1)) * (L.k + L.kOut * U.clamp((d / L.r0 - 0.35) / 0.4, 0, 1));
    if (!k) return [0, 0];
    return [k * (U.vnoise(u / wl + s, v / wl) - 0.5) * 2, k * (U.vnoise(u / wl + 41, v / wl + s) - 0.5) * 2];
  };
  const toW = (u, v) => { const d = disp(u, v), p = u + d[0], q = v + d[1]; return { x: c.x + p * ca - q * sa, y: c.y + p * sa + q * ca }; };
  // the old town's lanes wind on a much shorter wavelength
  const toWold = (u, v) => { const p = toW(u, v), du = (U.vnoise(u / 6 + s, v / 6) - 0.5) * 1.6, dv = (U.vnoise(u / 6, v / 6 + s + 9) - 0.5) * 1.6; return { x: p.x + du * ca - dv * sa, y: p.y + du * sa + dv * ca }; };
  const toG = (x, y) => {
    const u0 = (x - c.x) * ca + (y - c.y) * sa, v0 = -(x - c.x) * sa + (y - c.y) * ca;
    let u = u0, v = v0;
    for (let i = 0; i < 4; i++) { const d = disp(u, v); u = u0 - d[0]; v = v0 - d[1]; }
    return [u, v];
  };
  // the old town's edge (where the walls were, and now a ring boulevard), in lattice coordinates
  const rho = a => L.rho * (1 + 0.16 * Math.sin(2 * a + L.p1) + 0.1 * Math.sin(3 * a + L.p2) + 0.05 * Math.sin(5 * a + L.p1 * 3));
  const inOld = (u, v, m) => L.rho > 0 && Math.hypot(u, v) < rho(Math.atan2(v, u)) + (m || 0);
  c._fr = { L, SP, toW, toWold, toG, rho, inOld, ca, sa };
  return c._fr;
};

/* segments in square buckets, for "what road is near here" */
function buckets(B) {
  const m = new Map();
  const key = (i, j) => (i + 4096) * 8192 + j + 4096;
  return {
    add(s) {
      const i0 = Math.floor(Math.min(s[0], s[2]) / B), i1 = Math.floor(Math.max(s[0], s[2]) / B), j0 = Math.floor(Math.min(s[1], s[3]) / B), j1 = Math.floor(Math.max(s[1], s[3]) / B);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let l = m.get(k); if (!l) m.set(k, l = []); l.push(s); }
    },
    near(x, y, r, fn) {
      const i0 = Math.floor((x - r) / B), i1 = Math.floor((x + r) / B), j0 = Math.floor((y - r) / B), j1 = Math.floor((y + r) / B);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = m.get(key(i, j)); if (l) for (const s of l) fn(s); }
    }
  };
}
/* nearest segment to x, y within r: { d, x, y, s } (d is to the centreline) */
function nearest(Bk, x, y, r, skip) {
  let best = { d: 1e9 };
  Bk.near(x, y, r, s => {
    if (skip && skip(s)) return;
    const vx = s[2] - s[0], vy = s[3] - s[1], L = vx * vx + vy * vy, t = L ? U.clamp(((x - s[0]) * vx + (y - s[1]) * vy) / L, 0, 1) : 0;
    const px = s[0] + vx * t, py = s[1] + vy * t, d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, x: px, y: py, s };
  });
  return best;
}
const HALF = { hw: 0.35, rd: 0.14, lc: 0.1, sp: 0.08, rail: 0.35, art: 0.24, ring: 0.3, st: 0.2 };

/* ---------- styles for the country's cities ---------- */
IC.cityStyles = function (W, R) {
  const base = R() < 0.5 ? 'eu' : 'us', other = base === 'eu' ? 'us' : 'eu';
  W.style = base;
  const rest = W.cities.filter(c => !c.capital);
  for (const c of W.cities) c.style = base;
  // industrial towns: small cities with an arms works or the railway; a planned new town; the rest mixed
  const fac = new Set(W.infra.filter(i => i.kind === 'factory').map(i => i.city));
  const small = rest.filter(c => c.pop < 420).sort((a, b) => (fac.has(b.id) - fac.has(a.id)) || (a.pop - b.pop));
  for (const c of small.slice(0, R.int(1, 2))) c.style = 'ind';
  const nt = rest.filter(c => c.style === base && c.pop > 140 && c.pop < 520);
  if (nt.length && R() < 0.75) R.pick(nt).style = 'new';
  const mixed = rest.filter(c => c.style === base);
  let n = 0;
  for (const c of mixed) if (R() < 0.35 || n < 2) { c.style = other; n++; }
};

/* ---------- one city ----------
   roads: [x0, y0, x1, y1, cls] pieces of the national roads and railways near the city.
   fields: airfields and plants the city must keep off. villages: villages it may swallow. */
IC.buildCity = function (W, c, R, fbm, roads, fields, villages) {
  const st = STYLE[c.style] || STYLE.eu, SP = st.SP, r = c.r, RMAX = r * 1.55;
  const target = Math.round(U.clamp(c.pop / 2.4, 30, 850));
  // the lattice turns with the main road in (an American grid lines up with it)
  if (c.style === 'us' || c.style === 'new') {
    const e = roads.filter(s => s[4] === 'hw' || s[4] === 'rd').sort((a, b) => U.segDist(c.x, c.y, a[0], a[1], a[2], a[3]) - U.segDist(c.x, c.y, b[0], b[1], b[2], b[3]))[0];
    if (e) c.grid = U.mod(Math.atan2(e[3] - e[1], e[2] - e[0]), Math.PI / 2);
  }
  const nOld = st.old * target >= 5 ? st.old * target : 0;
  c.lat = { SP, a: c.grid, k: st.warp * st.wl, kOut: (st.outer || 0) * st.wl, wl: st.wl, s: R.range(0, 500), r0: r, rho: nOld ? Math.sqrt(nOld * SP * SP / Math.PI) + SP * 0.3 : 0, p1: R.range(0, 7), p2: R.range(0, 7) };
  const F = IC.cityFrame(c);
  const Bk = buckets(4);
  for (const s of roads) Bk.add(s);
  const hwNear = (x, y, d) => nearest(Bk, x, y, d, s => s[4] !== 'hw').d < d;

  /* the cost field on the lattice */
  const n = Math.ceil(RMAX / SP) + 1, D = 2 * n, N = D * D;
  const idx = (i, j) => (j + n) * D + (i + n);
  const P = new Array(N), cost = new Float32Array(N), wet = new Uint8Array(N), nr = new Array(N);
  const RF = { hw: 0.35, rd: 0.25, lc: 0.35, sp: 0.6, rail: 0.6 }, nzL = U.clamp(SP * Math.sqrt(target / Math.PI) * 0.45, 8, 40);
  for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
    const k = idx(i, j), u = (i + 0.5) * SP, v = (j + 0.5) * SP;
    if (Math.hypot(u, v) > RMAX) { cost[k] = -1; continue; }
    const p = F.toW(u, v); P[k] = p;
    if (W.inLake(p.x, p.y) || W.inHome(p.x, p.y) !== (c.home !== false) || W.hAt(p.x, p.y) > 0.86 || fields.some(f => U.dxy(f.x, f.y, p.x, p.y) < f.r)) { cost[k] = -1; continue; }
    const rd = W.riverDist(p.x, p.y);
    if (rd < 3.2) { wet[k] = 1; cost[k] = 9; continue; }
    const sl = W.slopeAt(p.x, p.y) / 0.012, fo = W.forestD(p.x, p.y) > IC.FOREST_T;
    // a coarse noise makes some directions much dearer than others, so even open ground gives a ragged edge
    const nz = fbm(p.x / nzL + 5, p.y / nzL + 3, 3);
    let f = (1 + Math.min(4, sl * sl) + (fo ? 0.8 : 0)) * Math.exp(5 * (nz - 0.5));
    const q = nearest(Bk, p.x, p.y, 3);
    nr[k] = q;
    if (q.d < 3) f *= RF[q.s[4]] || 1;
    cost[k] = f;
  }
  // a typical cost per unit, so the villages and parks start growing when the city's edge comes near them
  let cs = 0, cn = 0; for (let k = 0; k < N; k++) if (cost[k] > 0 && !wet[k]) { cs += cost[k]; cn++; }
  const mc = cn ? cs / cn : 1;
  /* grow from the centre, the villages close by and a business or logistics park by a motorway */
  const g = new Float32Array(N).fill(1e9), src = new Int16Array(N).fill(-1), seeds = [];
  const seedAt = (x, y, g0, label) => { const [u, v] = F.toG(x, y), i = Math.floor(u / SP), j = Math.floor(v / SP); if (i < -n || j < -n || i >= n || j >= n) return; const k = idx(i, j); if (cost[k] <= 0 || wet[k]) return; if (g0 < g[k]) { g[k] = g0; src[k] = label; seeds.push(k); } };
  for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const k = idx(a, b); if (cost[k] > 0) { g[k] = 0; src[k] = 0; seeds.push(k); } }
  // a centre on bad ground (a hilltop, a marsh) grows from the nearest good cell instead
  if (!seeds.length) { let bk = -1, bd = 1e9; for (let k = 0; k < N; k++) if (cost[k] > 0 && !wet[k]) { const d = U.dist(P[k], c); if (d < bd) { bd = d; bk = k; } } if (bk >= 0) { g[bk] = 0; src[bk] = 0; seeds.push(bk); } }
  const vill = villages.filter(v => U.dist(v, c) < RMAX * 0.9);
  vill.forEach((v, i) => seedAt(v.x, v.y, U.dist(v, c) * mc * 0.75, 10 + i));
  const parks = [];
  if (c.style !== 'east' && c.pop > 180) {
    const want = c.style === 'us' ? 2 : 1;
    for (const s of roads) {
      if (parks.length >= want || s[4] !== 'hw') continue;
      const x = (s[0] + s[2]) / 2, y = (s[1] + s[3]) / 2, d = U.dxy(x, y, c.x, c.y);
      if (d < r * 0.9 || d > r * 1.35 || parks.some(p => U.dxy(p.x, p.y, x, y) < r * 0.8) || R() < 0.7) continue;
      const a = Math.atan2(s[3] - s[1], s[2] - s[0]) + Math.PI / 2 * (R() < 0.5 ? 1 : -1);
      const p = { x: x + Math.cos(a) * SP * 1.2, y: y + Math.sin(a) * SP * 1.2 };
      parks.push(p); seedAt(p.x, p.y, d * mc * 0.9, 1 + parks.length);
    }
  }
  // Dijkstra over the lattice, eight ways
  const heap = [], hk = [];
  const push = (f, k) => { let i = heap.length; heap.push(f); hk.push(k); while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= f) break; heap[i] = heap[p]; hk[i] = hk[p]; i = p; } heap[i] = f; hk[i] = k; };
  const pop = () => { const k = hk[0], lf = heap.pop(), lk = hk.pop(); if (heap.length) { let i = 0; for (;;) { let ch = 2 * i + 1; if (ch >= heap.length) break; if (ch + 1 < heap.length && heap[ch + 1] < heap[ch]) ch++; if (heap[ch] >= lf) break; heap[i] = heap[ch]; hk[i] = hk[ch]; i = ch; } heap[i] = lf; hk[i] = lk; } return k; };
  for (const k of seeds) push(g[k], k);
  const done = new Uint8Array(N);
  const M8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const k = pop(); if (done[k]) continue; done[k] = 1;
    const i = k % D - n, j = Math.floor(k / D) - n;
    for (const [di, dj, L] of M8) {
      const a = i + di, b = j + dj; if (a < -n || b < -n || a >= n || b >= n) continue;
      const q = idx(a, b); if (cost[q] <= 0 || done[q]) continue;
      const ng = g[k] + (cost[k] + cost[q]) * 0.5 * L * SP;
      if (ng < g[q]) { g[q] = ng; src[q] = src[k]; push(ng, q); }
    }
  }
  /* the cells the city fills: the cheapest to reach, and all of the old town */
  const cand = [];
  for (let k = 0; k < N; k++) if (done[k] && !wet[k] && cost[k] > 0) cand.push(k);
  const ij = k => [k % D - n, Math.floor(k / D) - n];
  const uvOf = k => { const [i, j] = ij(k); return [(i + 0.5) * SP, (j + 0.5) * SP]; };
  cand.sort((a, b) => g[a] - g[b]);
  const cells = [];
  for (const k of cand) {
    const [u, v] = uvOf(k), old = F.inOld(u, v, SP * 0.3);
    if (cells.length >= target && !old) continue;
    cells.push({ k, i: ij(k)[0], j: ij(k)[1], u, v, p: P[k], g: g[k], src: src[k], old, near: nr[k] });
  }
  cells.forEach((x, rank) => x.q = rank / cells.length);
  const isCell = new Map(); for (const x of cells) isCell.set(x.k, x);
  const R2 = cells.length ? cells.reduce((m, x) => Math.max(m, U.dist(x.p, c)), 0) : r;

  /* districts */
  const railD = x => { const q = nearest(Bk, x.p.x, x.p.y, 6, s => s[4] !== 'rail'); return q.d; };
  const hwD = x => { const q = nearest(Bk, x.p.x, x.p.y, 8, s => s[4] !== 'hw'); return q.d; };
  // what the city lives on shifts its districts: the capital's offices, a manufacturing or distribution town
  c.role = c.capital ? 'biz' : c.style === 'ind' || c.home === false ? 'mix' : R.pick(['res', 'res', 'ind', 'log', 'biz', 'mix']);
  const RM = { biz: { biz: 2.2, ind: 0.7 }, ind: { ind: 1.8, log: 1.2, biz: 0.6 }, log: { log: 2.6, ind: 0.8 }, res: { dense: 1.15, ind: 0.55, log: 0.5 }, mix: {} }[c.role];
  const sh = k => st[k] * (RM[k] || 1);
  const vary = () => R.range(0.8, 1.2), T = cells.length;
  for (const x of cells) if (x.old) x.d = 'old';
  for (const x of cells) if (x.src >= 10) { const v = vill[x.src - 10]; if (v && U.dist(x.p, v) < SP * 1.3) { x.d = c.style === 'us' || c.style === 'east' ? 'dense' : 'old'; x.vil = true; v.swallowed = c.id; } }
  // business and logistics parks by the motorway
  for (const x of cells) if (!x.d && x.src >= 1 && x.src < 10) x.d = x.src === 1 && (c.style === 'us' || c.style === 'new') ? 'biz' : 'log', x.park = true;
  const free = () => cells.filter(x => !x.d);
  const take = (list, n, d) => { for (const x of list.slice(0, Math.max(0, Math.round(n)))) x.d = d; };
  // rail yards beside the line, near the centre
  take(free().map(x => ({ x, d: railD(x) })).filter(o => o.d < SP * 0.8 && o.x.q > 0.12 && o.x.q < 0.7 && hwD(o.x) > SP).sort((a, b) => a.x.q - b.x.q).map(o => o.x), st.yard, 'rail');
  // industry in a sector towards the railway or the busiest road out, logistics by the motorway
  const ia = c.indA;
  take(free().filter(x => x.q > 0.1).map(x => { const a = Math.atan2(x.p.y - c.y, x.p.x - c.x); return { x, s: Math.cos(U.angWrap(a - ia)) * 1.2 - x.q * 0.4 + (railD(x) < SP * 2 ? 0.5 : 0) + R() * 0.3 }; }).sort((a, b) => b.s - a.s).map(o => o.x), sh('ind') * T * vary(), 'ind');
  take(free().filter(x => x.q > 0.3).map(x => ({ x, s: -hwD(x) / SP + x.q + R() * 0.8 })).sort((a, b) => b.s - a.s).map(o => o.x), sh('log') * T * vary(), 'log');
  const byQ = () => free().sort((a, b) => a.q - b.q);
  take(byQ(), sh('biz') * T * vary(), 'biz');
  take(byQ(), sh('dense') * T, 'dense');
  for (const x of cells) if (!x.d) x.d = 'sub';

  /* the old town's ring boulevard, the avenues out and (in a big city) the ring road */
  const streets = [], parksL = [], squares = [];
  const extra = [];   // road-like lines the blocks keep clear of
  if (c.lat.rho && st.ring) {
    const pts = [];
    for (let q = 0; q <= 64; q++) { const a = q / 64 * Math.PI * 2, rr = F.rho(a); pts.push(F.toW(Math.cos(a) * rr, Math.sin(a) * rr)); }
    streets.push({ cls: 'art', pts, ring: true, boul: true });
  }
  // how far the city reaches in each direction, smoothed
  const NS = 24, sect = new Float32Array(NS);
  for (const x of cells) { const a = Math.atan2(x.p.y - c.y, x.p.x - c.x), s = Math.floor(U.mod(a, Math.PI * 2) / (Math.PI * 2) * NS) % NS; sect[s] = Math.max(sect[s], U.dist(x.p, c)); }
  for (let pass = 0; pass < 2; pass++) { const o = sect.slice(); for (let s = 0; s < NS; s++) sect[s] = (o[(s + NS - 1) % NS] + 2 * o[s] + o[(s + 1) % NS]) / 4; }
  const ext = a => { const f = U.mod(a, Math.PI * 2) / (Math.PI * 2) * NS, s = Math.floor(f) % NS, t = f - Math.floor(f); return sect[s] * (1 - t) + sect[(s + 1) % NS] * t; };
  if (st.radials && c.pop > 150) {
    const ins = roads.filter(s => s[4] !== 'rail' && U.segDist(c.x, c.y, s[0], s[1], s[2], s[3]) < SP).map(s => { const far = U.dxy(s[0], s[1], c.x, c.y) > U.dxy(s[2], s[3], c.x, c.y) ? [s[0], s[1]] : [s[2], s[3]]; return Math.atan2(far[1] - c.y, far[0] - c.x); });
    const a0 = R.range(0, 7);
    for (let q = 0; q < st.radials; q++) {
      const a = a0 + q * Math.PI * 2 / st.radials + R.range(-0.2, 0.2);
      if (ins.some(b => Math.abs(U.angWrap(a - b)) < 0.45)) continue;
      const pts = [], d0 = c.lat.rho ? F.rho(a) * 0.98 : SP;
      for (let d = d0; d <= ext(a) * 0.9; d += SP / 2) {
        const x = c.x + Math.cos(a) * d + Math.sin(a) * 1.5 * Math.sin(d / 25), y = c.y + Math.sin(a) * d - Math.cos(a) * 1.5 * Math.sin(d / 25);
        if (W.inLake(x, y) || W.riverDist(x, y) < 3 || hwNear(x, y, 1) || fields.some(f => U.dxy(f.x, f.y, x, y) < f.r)) break;
        pts.push({ x, y });
      }
      if (pts.length >= 4) { streets.push({ cls: 'art', pts, radial: true }); extra.push(pts); }
    }
  }
  if ((c.capital && c.style !== 'east') || (st.loop && c.pop > 380) || (c.style === 'eu' && c.pop > 700)) {
    let pts = [];
    const flush = () => { if (pts.length > 4) { streets.push({ cls: 'ring', pts, ring: pts.length > 90 }); extra.push(pts); } pts = []; };
    for (let q = 0; q <= 96; q++) {
      const a = q / 96 * Math.PI * 2, rr = ext(a) * (c.style === 'us' ? 0.62 : 0.72) * (1 + 0.04 * Math.sin(5 * a + c.lat.p2));
      const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
      if (W.inLake(x, y) || fields.some(f => U.dxy(f.x, f.y, x, y) < f.r)) { flush(); continue; }
      pts.push({ x, y });
    }
    flush();
  }
  for (const l of streets) for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, l.cls]);

  /* blocks: one to a lattice cell, kept clear of the roads through it; the old town is cut finer */
  const blocks = [], used = new Set(), fineUsed = new Set();
  const key = (i, j) => (i + 4096) * 8192 + j + 4096;
  const formOf = x => formFor(c, st, x);
  const place = (x, rc, fine) => {
    // a road through the cell: the block steps back from it and is built smaller rather than left out
    const q = nearest(Bk, rc.x, rc.y, SP, s => s[4] === 'st');
    let px = rc.x, py = rc.y, f = 1;
    if (q.d < 1e8) {
      const half = HALF[q.s[4]] || 0.2, need = Math.max(rc.w, rc.h) * 0.5 + half + 0.25;
      if (q.d < need) {
        const ux = (rc.x - q.x) / (q.d || 1), uy = (rc.y - q.y) / (q.d || 1), sh = Math.min(need - q.d, Math.max(rc.w, rc.h) * 0.35);
        px += ux * sh; py += uy * sh;
        f = Math.min(1, (q.d + sh - half - 0.2) * 2 / Math.max(rc.w, rc.h));
        if (f * Math.min(rc.w, rc.h) < 0.8) return null;
      }
    }
    if (W.inLake(px, py) || W.riverDist(px, py) < 2.5 + Math.max(rc.w, rc.h) * 0.3 * f) return null;
    return { x: px, y: py, w: rc.w * f, h: rc.h * f, a: rc.a };
  };
  const mkBlock = (x, rc, form, extraP) => {
    const D2 = IC.DISTRICTS[x.d];
    const b = Object.assign({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a, d: x.d, f: form, core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i: x.i, j: x.j }, extraP || {});
    blocks.push(b); return b;
  };
  let parksLeft = st.parks + (c.capital ? 2 : 0) + Math.round(c.pop / 600);
  for (const x of cells) {
    if (x.d === 'old' && !x.vil) continue;
    if (x.d === 'rail') {
      // tracks fan out along the line
      const q = nearest(Bk, x.p.x, x.p.y, SP * 1.5, s => s[4] !== 'rail'); if (q.d > SP) { x.d = 'ind'; } else {
        const a = Math.atan2(q.s[3] - q.s[1], q.s[2] - q.s[0]);
        mkBlock(x, { x: q.x, y: q.y, w: SP * 1.25, h: SP * 0.55, a }, 'yard'); used.add(key(x.i, x.j)); continue;
      }
    }
    const A = F.toW(x.i * SP, x.j * SP), B = F.toW((x.i + 1) * SP, x.j * SP), C2 = F.toW(x.i * SP, (x.j + 1) * SP), Dd = F.toW((x.i + 1) * SP, (x.j + 1) * SP);
    const rc = rectOf(A, B, C2, Dd, 0.7), pl = place(x, rc);
    if (!pl) continue;
    used.add(key(x.i, x.j));
    const h = U.hash(x.i * 31 + 7, x.j * 17 + 1);
    if ((x.d === 'dense' || x.d === 'sub') && parksLeft > 0 && h < 0.06) { parksL.push({ x: pl.x, y: pl.y, rx: pl.w * 0.48, ry: pl.h * 0.46, a: pl.a }); parksLeft--; continue; }
    mkBlock(x, pl, formOf(x));
  }
  // the old town: four plots to a cell, lanes between them winding round a square
  if (c.lat.rho) {
    const inner = [];
    for (let fj = -2 * n; fj < 2 * n; fj++) for (let fi = -2 * n; fi < 2 * n; fi++) {
      const u = (fi + 0.5) * SP / 2, v = (fj + 0.5) * SP / 2;
      if (!F.inOld(u, v, -SP * 0.2)) continue;
      const x = isCell.get(idx(Math.floor(fi / 2), Math.floor(fj / 2)));
      if (!x) continue;
      inner.push({ fi, fj, u, v, x });
    }
    inner.sort((a, b) => Math.hypot(a.u, a.v) - Math.hypot(b.u, b.v));
    inner.forEach((o, q) => {
      const h2 = SP / 2, A = F.toWold(o.fi * h2, o.fj * h2), B = F.toWold((o.fi + 1) * h2, o.fj * h2), C2 = F.toWold(o.fi * h2, (o.fj + 1) * h2), Dd = F.toWold((o.fi + 1) * h2, (o.fj + 1) * h2);
      const rc = rectOf(A, B, C2, Dd, 0.42);
      if (q === 1) { squares.push(rc); fineUsed.add(key(o.fi, o.fj)); return; }   // the market square
      const pl = place({ x: o.x }, rc, true); if (!pl) return;
      fineUsed.add(key(o.fi, o.fj));
      mkBlock({ d: 'old', i: o.x.i, j: o.x.j }, pl, 'old', { fine: true });
    });
  }
  /* streets run between built cells: a lattice line is kept where a block lies on either side of it */
  const blockedAt = (p, old) => W.inLake(p.x, p.y) || W.riverDist(p.x, p.y) < 1.4 || hwNear(p.x, p.y, 0.9) || (old ? false : c.lat.rho && F.inOld(...F.toG(p.x, p.y), -0.1));
  const lines = (has, lo, hi, step, toW, cls, old) => {
    for (let axis = 0; axis < 2; axis++) for (let k = lo; k <= hi; k++) {
      let run = [];
      const flush = () => { if (run.length > 1) streets.push({ cls: cls(k), pts: run, old }); run = []; };
      for (let m = lo; m <= hi; m++) {
        const on = axis ? has(m, k - 1) || has(m, k) : has(k - 1, m) || has(k, m);
        const u0 = axis ? m * step : k * step, v0 = axis ? k * step : m * step;
        if (!on) { flush(); continue; }
        for (let q = run.length ? 1 : 0; q <= 2; q++) {
          const p = toW(axis ? u0 + q * step / 2 : u0, axis ? v0 : v0 + q * step / 2);
          if (old ? !F.inOld(...F.toG(p.x, p.y), -0.05) || blockedAt(p, true) : blockedAt(p)) { flush(); if (q === 0) break; continue; }
          run.push(p);
        }
      }
      flush();
    }
  };
  lines((i, j) => used.has(key(i, j)), -n, n, SP, F.toW, k => U.mod(k, st.art) === 0 ? 'art' : 'st', false);
  if (c.lat.rho) lines((i, j) => fineUsed.has(key(i, j)), -2 * n, 2 * n, SP / 2, F.toWold, () => 'st', true);
  c.streets = streets; c.blocks = blocks; c.parks = parksL; c.squares = squares;
  tieStreets(c, roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'), SP);
  // what could not be tied is a stub: take it away
  c.streets = c.streets.filter(l => !l.deadEnd || l.ring);
  for (const l of c.streets) if (l.deadEnd) delete l.deadEnd;
  dropIslands(c, roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'));
  c.ext = blocks.reduce((m, b) => Math.max(m, U.dist(b, c) + Math.max(b.w, b.h) / 2), 0);
  c.mix = IC.cityMix(c);
  return c;
};

/* the building form of a lattice cell, by district and style */
function formFor(c, st, x) {
  const h = U.hash(x.i * 7 + 3, x.j * 13 + 5), d = x.d, s = c.style;
  // a cell at the crossing of two avenues
  const onArt = (U.mod(x.i, st.art) === 0 || U.mod(x.i + 1, st.art) === 0) && (U.mod(x.j, st.art) === 0 || U.mod(x.j + 1, st.art) === 0);
  if (d === 'old') return 'old';
  if (d === 'ind') return 'shed';
  if (d === 'log') return 'ware';
  if (d === 'rail') return 'yard';
  if (d === 'biz') return x.park ? 'office' : s === 'us' || s === 'east' ? 'tower' : s === 'new' ? (x.q < 0.03 ? 'mall' : 'office') : h < 0.35 ? 'tower' : 'court';
  if (d === 'dense') return s === 'east' || s === 'new' ? (h < 0.8 ? 'slab' : 'row') : s === 'ind' ? 'row' : s === 'us' ? (h < 0.5 ? 'row' : 'court') : x.q < 0.3 ? 'court' : h < 0.6 ? 'slab' : 'row';
  if (onArt && h < st.mall) return 'mall';
  return h < st.cul ? 'cul' : s === 'eu' && h > 0.8 ? 'row' : 'house';
}
/* a street plan's cell as a rectangle: its bent corners averaged */
function rectOf(A, B, C2, Dd, gap) {
  const cx = (A.x + B.x + C2.x + Dd.x) / 4, cy = (A.y + B.y + C2.y + Dd.y) / 4;
  const ux = (B.x - A.x + Dd.x - C2.x) / 2, uy = (B.y - A.y + Dd.y - C2.y) / 2, vx = (C2.x - A.x + Dd.x - B.x) / 2, vy = (C2.y - A.y + Dd.y - B.y) / 2;
  return { x: cx, y: cy, a: Math.atan2(uy, ux), w: Math.hypot(ux, uy) - gap, h: Math.hypot(vx, vy) - gap };
}
/* growth (growth.js): a new block in cell i, j of a city's plan, with its district and building, and the streets
   along the sides that face open ground (open(di, dj) says whether the neighbour that way is unbuilt) */
IC.cityGrowCell = function (c, i, j, d, q, R, open) {
  const st = STYLE[c.style] || STYLE.eu, F = IC.cityFrame(c), SP = F.SP;
  const P = [F.toW(i * SP, j * SP), F.toW((i + 1) * SP, j * SP), F.toW(i * SP, (j + 1) * SP), F.toW((i + 1) * SP, (j + 1) * SP)];
  const rc = rectOf(P[0], P[1], P[2], P[3], 0.7), D2 = IC.DISTRICTS[d];
  const b = { x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a, d, f: formFor(c, st, { i, j, d, q }), core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i, j };
  const streets = [];
  for (const [di, dj, e0, e1] of [[1, 0, [1, 0], [1, 1]], [-1, 0, [0, 0], [0, 1]], [0, 1, [0, 1], [1, 1]], [0, -1, [0, 0], [1, 0]]]) {
    if (!open(di, dj)) continue;
    const u0 = (i + e0[0]) * SP, v0 = (j + e0[1]) * SP, u1 = (i + e1[0]) * SP, v1 = (j + e1[1]) * SP, line = di ? i + e0[0] : j + e0[1];
    streets.push({ cls: U.mod(line, st.art) === 0 ? 'art' : 'st', pts: [F.toW(u0, v0), F.toW((u0 + u1) / 2, (v0 + v1) / 2), F.toW(u1, v1)], grown: true });
  }
  return { b, streets };
};

/* city streets end on another street or road: a loose end runs on to the next street it meets ahead, or turns to
   the nearest one close by; only a street with nothing near stays a cul-de-sac */
function tieStreets(c, roadSegs, SP) {
  const Bk = buckets(3);
  c.streets.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) Bk.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]); });
  for (const r of roadSegs) Bk.add([r[0], r[1], r[2], r[3], -1]);
  c.streets.forEach((l, li) => {
    if (l.ring || l.pts.length < 2) return;
    for (const end of [0, 1]) {
      const P = l.pts, e = end ? P[P.length - 1] : P[0], q = end ? P[P.length - 2] : P[1];
      let near = false;
      Bk.near(e.x, e.y, 0.5, sg => { if (!near && sg[4] !== li && U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]) < 0.4) near = true; });
      if (near) continue;
      const L = Math.hypot(e.x - q.x, e.y - q.y) || 1, dx = (e.x - q.x) / L, dy = (e.y - q.y) / L, reach = SP * 1.6;
      let hit = null, bt = 1;
      Bk.near(e.x + dx * reach / 2, e.y + dy * reach / 2, reach / 2 + 1, sg => {
        if (sg[4] === li) return;
        const t = U.segX(e.x, e.y, e.x + dx * reach, e.y + dy * reach, sg[0], sg[1], sg[2], sg[3]);
        if (t > 0 && t < bt) { bt = t; hit = { x: e.x + dx * reach * t, y: e.y + dy * reach * t }; }
      });
      if (!hit) {
        let bd = SP * 1.1;
        Bk.near(e.x, e.y, bd, sg => {
          if (sg[4] === li) return;
          const vx = sg[2] - sg[0], vy = sg[3] - sg[1], LL = vx * vx + vy * vy, t = LL ? U.clamp(((e.x - sg[0]) * vx + (e.y - sg[1]) * vy) / LL, 0, 1) : 0;
          const x = sg[0] + vx * t, y = sg[1] + vy * t, d = Math.hypot(x - e.x, y - e.y);
          if (d < bd) { bd = d; hit = { x, y }; }
        });
      }
      if (hit) { if (end) P.push(hit); else P.unshift(hit); }
      else l.deadEnd = (l.deadEnd || 0) + 1;
    }
  });
}

/* streets that ended up tied only to each other, off the rest of the city (a stub or two between a river and a
   motorway): keep the pieces that reach a road or belong to the city's main network */
function dropIslands(c, roadSegs) {
  const L = c.streets, n = L.length; if (n < 2) return;
  const up = L.map((_, i) => i), find = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; }, join = (a, b) => { a = find(a); b = find(b); if (a !== b) up[a] = b; };
  const Bk = buckets(3), at = new Map();
  L.forEach((l, li) => {
    for (let i = 1; i < l.pts.length; i++) Bk.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]);
    for (const p of l.pts) { const k = Math.round(p.x * 50) + ',' + Math.round(p.y * 50), o = at.get(k); if (o != null) join(o, li); else at.set(k, li); }
  });
  for (const r of roadSegs) Bk.add([r[0], r[1], r[2], r[3], -1]);
  const rooted = new Set();
  L.forEach((l, li) => {
    for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) Bk.near(e.x, e.y, 0.5, sg => { if (sg[4] !== li && U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]) < 0.4) { if (sg[4] < 0) rooted.add(li); else join(li, sg[4]); } });
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i];
      Bk.near((a.x + b.x) / 2, (a.y + b.y) / 2, U.dist(a, b) / 2 + 0.5, sg => { if (sg[4] < 0 && U.segX(a.x, a.y, b.x, b.y, sg[0], sg[1], sg[2], sg[3]) >= 0) rooted.add(li); });
    }
  });
  const size = new Map(); for (let i = 0; i < n; i++) size.set(find(i), (size.get(find(i)) || 0) + 1);
  let main = -1, mx = 0; for (const [r, k] of size) if (k > mx) { mx = k; main = r; }
  const keep = new Set([main]); for (const i of rooted) keep.add(find(i));
  c.streets = L.filter((l, i) => keep.has(find(i)));
}

/* ---------- what a city is: its districts, and the flights they want ---------- */
IC.cityMix = function (c) {
  const m = { old: 0, biz: 0, dense: 0, sub: 0, ind: 0, log: 0, rail: 0 };
  let tot = 0;
  for (const b of c.blocks) { if (b.empty) continue; const a = b.w * b.h; m[b.d || (b.core ? 'biz' : b.ind ? 'ind' : b.sub ? 'sub' : 'dense')] += a; tot += a; }
  for (const k in m) m[k] = tot ? m[k] / tot : 0;
  return m;
};
/* how much each kind of air travel a city wants, per head, against an average city (1 each):
   industry and warehouses ship cargo, offices fly on business, big residential areas go on holiday */
IC.cityDemand = function (c) {
  const m = c.mix || IC.cityMix(c), work = m.ind + m.log * 1.3 + m.rail * 0.8;
  const cargo = U.clamp(0.3 + work * 3.5, 0.3, 2.5), biz = U.clamp(0.45 + m.biz * 7 + m.old * 2.5, 0.4, 2.2), leisure = U.clamp(0.4 + (m.dense + m.sub) * 0.85, 0.4, 1.4);
  return { cargo, biz, leisure, pax: (biz + leisure) / 2, bizShare: biz / (biz + leisure) };
};
/* in plain words: "industrial town. Most demand is cargo." */
IC.cityCharacter = function (c) {
  const m = c.mix || IC.cityMix(c), d = IC.cityDemand(c), st = STYLE[c.style] || STYLE.eu, work = m.ind + m.log + m.rail;
  let kind, why;
  if (d.cargo > 1.25 && work > 0.28) { kind = 'industrial town'; why = 'Most demand is cargo: factories and warehouses ship by air freight.'; }
  else if (d.bizShare > 0.55 || c.capital) { kind = c.capital ? 'capital and business centre' : 'business city'; why = 'Offices want frequent flights to many places; cargo from its warehouses too.'; }
  else if (m.sub > 0.5) { kind = 'sprawling commuter city'; why = 'Most demand is holiday travel from its big suburbs; little cargo.'; }
  else if (m.log > 0.12) { kind = 'distribution hub'; why = 'Warehouses by the motorway: air cargo and passengers in equal measure.'; }
  else { kind = 'mixed city'; why = 'Passengers on business and on holiday, and some cargo.'; }
  const style = c.style === 'ind' ? '' : c.style === 'new' ? 'planned new town, ' : `${st.name} plan, `;
  const pct = k => Math.round(m[k] * 100);
  return { kind, why, style: st.name, text: `${kind}. ${why}`, parts: `${style}${pct('biz') + pct('old')}% centre and offices, ${pct('dense') + pct('sub')}% housing, ${pct('ind') + pct('log') + pct('rail')}% industry and warehouses` };
};

})(window.IC);
