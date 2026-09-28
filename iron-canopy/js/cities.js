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
/* templates: every city's street plan is a variant of one of five real ones, picked by its style, size and ground.
   They override the style's lattice (SP, warp, wl, outer, old) and add their own features:
   ax, ay: how the lattice stretches along and across (long blocks between avenues); artU, artV: every how many
   lines an avenue, across and along; diag: diagonal avenues; bway: one old diagonal across the grid, with squares
   where it crosses the avenues; cpark: a long park of whole blocks; tip: the old town at the end towards the water;
   loop: a ring of avenues round the downtown; radial: the roads come in as radial high roads ('lon', winding) or
   boulevards ('par', straight); ring2: an outer ring road; stars: squares where boulevards meet; blvd: a ring
   boulevard half way out; peri: the motorway bypass goes all the way round; linear: the city strung along its
   highway; square: a big square in the centre */
const TPL = {
  ny: { name: 'grid on the water', sketch: 'New York', plan: 'a grid of long blocks by the water, crossed by one old diagonal street', SP: 5.2, ax: 1.5, ay: 0.64, artU: 1, artV: 6, warp: 0, outer: 0, old: 0.025, bway: true, cpark: true, tip: true, mall: 0.2 },
  chi: { name: 'grid with diagonal avenues', sketch: 'Chicago', plan: 'a square grid with diagonal avenues and a downtown loop', SP: 5, artU: 4, artV: 4, warp: 0, outer: 0.03, old: 0, diag: 3, loop: true },
  lon: { name: 'old city of high streets', sketch: 'London', plan: 'an old town with winding high roads out and ring roads round it', warp: 0.15, wl: 30, old: 0.07, radial: 'lon', radials: 6, ring: true, ring2: true, parks: 6 },
  par: { name: 'boulevards and stars', sketch: 'Paris', plan: 'straight boulevards meeting at star squares, inside ring boulevards', warp: 0.06, wl: 60, old: 0.05, radial: 'par', radials: 6, ring: true, stars: 2, blvd: true, peri: true },
  dxb: { name: 'linear city on its highway', sketch: 'Dubai', plan: 'a long strip of superblocks along its highway', SP: 8, artU: 1, artV: 1, warp: 0.02, outer: 0.04, old: 0, linear: true, cul: 0.7 },
  east: { name: 'prospects and microdistricts', sketch: 'Soviet new town', plan: 'wide prospects and blocks of flats round a great square', artU: 2, artV: 2, square: true }
};
IC.CITY_TEMPLATES = TPL;
const styleOf = c => Object.assign({}, STYLE[c.style] || STYLE.eu, TPL[c.tpl] || {});
IC.cityStyleOf = styleOf;

/* ---------- the street plan: lattice (u, v) → world, bent by a smooth warp ---------- */
IC.cityFrame = function (c) {
  const L = c.lat;
  if (c._fr && c._fr.L === L) return c._fr;
  const ca = Math.cos(L.a), sa = Math.sin(L.a), wl = L.wl, s = L.s, SP = L.SP, ax = L.ax || 1, ay = L.ay || 1, ou = L.ou || 0, ov = L.ov || 0;
  // the bend fades out towards the centre, so the roads into town still meet at the city's node
  const disp = (u, v) => {
    const d = Math.hypot(u, v), k = U.smooth(U.clamp(d / (3 * SP), 0, 1)) * (L.k + L.kOut * U.clamp((d / L.r0 - 0.35) / 0.4, 0, 1));
    if (!k) return [0, 0];
    return [k * (U.vnoise(u / wl + s, v / wl) - 0.5) * 2, k * (U.vnoise(u / wl + 41, v / wl + s) - 0.5) * 2];
  };
  // (a stretched lattice: ax along, ay across, so blocks can be long between avenues)
  const toW = (u, v) => { const d = disp(u, v), p = u * ax + d[0], q = v * ay + d[1]; return { x: c.x + p * ca - q * sa, y: c.y + p * sa + q * ca }; };
  // the old town's lanes wind on a much shorter wavelength
  const toWold = (u, v) => { const p = toW(u, v), du = (U.vnoise(u / 6 + s, v / 6) - 0.5) * 1.6, dv = (U.vnoise(u / 6, v / 6 + s + 9) - 0.5) * 1.6; return { x: p.x + du * ca - dv * sa, y: p.y + du * sa + dv * ca }; };
  const toG = (x, y) => {
    const u0 = (x - c.x) * ca + (y - c.y) * sa, v0 = -(x - c.x) * sa + (y - c.y) * ca;
    let u = u0 / ax, v = v0 / ay;
    for (let i = 0; i < 4; i++) { const d = disp(u, v); u = (u0 - d[0]) / ax; v = (v0 - d[1]) / ay; }
    return [u, v];
  };
  // the old town's edge (where the walls were, and now a ring boulevard), in lattice coordinates
  const rho = a => L.rho * (1 + 0.16 * Math.sin(2 * a + L.p1) + 0.1 * Math.sin(3 * a + L.p2) + 0.05 * Math.sin(5 * a + L.p1 * 3));
  // (it may lie off the centre: where a grid city began, at its tip by the water)
  const inOld = (u, v, m) => L.rho > 0 && Math.hypot(u - ou, v - ov) < rho(Math.atan2(v - ov, u - ou)) + (m || 0);
  c._fr = { L, SP, toW, toWold, toG, rho, inOld, ca, sa, ou, ov, ax, ay };
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
/* does a segment cross a box centred on 0, 0 (half sizes W, H)? (Liang–Barsky) */
function segBox(x0, y0, x1, y1, W, H) {
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 + W], [dx, W - x0], [-dy, y0 + H], [dy, H - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
/* does any road (not a side street) run over block b, with pad to spare beyond its half width? */
function rectHit(Bk, b, pad, skip) {
  const ca = Math.cos(b.a), sa = Math.sin(b.a); let hit = false;
  Bk.near(b.x, b.y, Math.hypot(b.w, b.h) / 2 + 1, s => {
    if (hit || s[4] === 'st' || s[4] === skip) return;
    const p = (HALF[s[4]] || 0.2) + pad, ax = s[0] - b.x, ay = s[1] - b.y, bx = s[2] - b.x, by = s[3] - b.y;
    if (segBox(ax * ca + ay * sa, -ax * sa + ay * ca, bx * ca + by * sa, -bx * sa + by * ca, b.w / 2 + p, b.h / 2 + p)) hit = true;
  });
  return hit;
}
IC.blockOnRoad = (b, segs, pad) => { const Bk = buckets(4); for (const s of segs) Bk.add(s); return rectHit(Bk, b, pad || 0); };
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
const HALF = { hw: 0.35, rd: 0.14, lc: 0.1, sp: 0.08, rail: 0.35, art: 0.24, ring: 0.3, st: 0.2, sq: 0.8 };

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
  for (let k = 0; k < 2 && nt.length; k++) nt.splice(nt.indexOf(R.pick(nt)), 1)[0].style = 'new';
  const mixed = rest.filter(c => c.style === base);
  let n = 0;
  for (const c of mixed) if (R() < 0.35 || n < 2) { c.style = other; n++; }
  /* the template: an American city on a river or lake is laid out like New York, else like Chicago; a European one
     like London, or like Paris if it is the capital or large (by chance); new towns like Dubai. Each of the five
     is on every map */
  const wet = c => { let m = W.riverDist(c.x, c.y); for (let a = 0; a < 6.28; a += 0.8) if (W.inLake(c.x + Math.cos(a) * c.r * 0.9, c.y + Math.sin(a) * c.r * 0.9)) m = 0; return m; };
  for (const c of W.cities) {
    const s = c.style === 'ind' ? base : c.style;
    c.tpl = s === 'new' ? 'dxb' : s === 'us' ? (wet(c) < c.r * 0.5 && (c.pop > 320 || R() < 0.4) ? 'ny' : 'chi') : (c.capital || c.pop > 480) && R() < 0.6 ? 'par' : 'lon';
  }
  const fam = (t, ok) => W.cities.filter(c => ok(c)).sort((a, b) => b.pop - a.pop);
  const ensure = (t, list) => { if (!W.cities.some(c => c.tpl === t) && list.length) list[0].tpl = t; };
  // (the other of a family goes to a city that is not the only one of its own template)
  const spare = (t2, list) => list.filter(c => W.cities.filter(o => o.tpl === c.tpl).length > 1);
  ensure('ny', spare('ny', fam('ny', c => c.style === 'us' && c.tpl === 'chi')).sort((a, b) => wet(a) - wet(b)));
  ensure('chi', spare('chi', fam('chi', c => c.style === 'us' && c.tpl === 'ny')).reverse());
  ensure('par', spare('par', fam('par', c => c.style === 'eu' && c.tpl === 'lon')));
  ensure('lon', spare('lon', fam('lon', c => c.style === 'eu' && c.tpl === 'par')).reverse());
  ensure('dxb', fam('dxb', c => !c.capital && c.pop < 600 && W.cities.filter(o => o.tpl === c.tpl).length > 1).reverse());
};

/* ---------- one city ----------
   roads: [x0, y0, x1, y1, cls] pieces of the national roads and railways near the city.
   fields: airfields and plants the city must keep off. villages: villages it may swallow. */
IC.buildCity = function (W, c, R, fbm, roads, fields, villages) {
  const st = styleOf(c), SP = st.SP, r = c.r, RMAX = r * 1.55, artU = st.artU || st.art, artV = st.artV || st.art;
  const target = Math.round(U.clamp(c.pop / 2.4, 30, 850));
  // the lattice turns with the main road in (a grid lines up with it)
  if (!st.radial && c.tpl !== 'east') {
    const e = roads.filter(s => s[4] === 'hw' || s[4] === 'rd').sort((a, b) => U.segDist(c.x, c.y, a[0], a[1], a[2], a[3]) - U.segDist(c.x, c.y, b[0], b[1], b[2], b[3]))[0];
    if (e) c.grid = U.mod(Math.atan2(e[3] - e[1], e[2] - e[0]), Math.PI / 2);
  }
  const nOld = st.old * target >= 5 ? st.old * target : 0;
  c.lat = { SP, a: c.grid, k: st.warp * st.wl, kOut: (st.outer || 0) * st.wl, wl: st.wl, s: R.range(0, 500), r0: r, rho: nOld ? Math.sqrt(nOld * SP * SP / Math.PI) + SP * 0.3 : 0, p1: R.range(0, 7), p2: R.range(0, 7), ax: st.ax || 1, ay: st.ay || 1 };
  // a grid city began at its tip by the water: the old town is there, not in the middle
  if (st.tip && c.lat.rho) {
    let best = null, bd = 1e9;
    for (let q = 0; q < 16; q++) { const a = q / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r * 0.7, y = c.y + Math.sin(a) * r * 0.7, d = W.inLake(x, y) ? 0 : W.riverDist(x, y); if (d < bd) { bd = d; best = a; } }
    const x = Math.cos(best) * r * 0.4, y = Math.sin(best) * r * 0.4, ca = Math.cos(c.grid), sa = Math.sin(c.grid);
    c.lat.ou = (x * ca + y * sa) / c.lat.ax; c.lat.ov = (-x * sa + y * ca) / c.lat.ay;
  }
  const F = IC.cityFrame(c);
  let Bk = buckets(4);
  for (const s of roads) Bk.add(s);
  const hwNear = (x, y, d) => nearest(Bk, x, y, d, s => s[4] !== 'hw').d < d;

  /* the cost field on the lattice */
  const n = Math.ceil(RMAX / (SP * Math.min(F.ax, F.ay))) + 1, D = 2 * n, N = D * D;
  const idx = (i, j) => (j + n) * D + (i + n);
  const P = new Array(N), cost = new Float32Array(N), wet = new Uint8Array(N), nr = new Array(N), have = new Uint8Array(N);
  const RF = { hw: 0.35, rd: 0.25, lc: 0.35, sp: 0.6, rail: 0.6 }, nzL = U.clamp(SP * Math.sqrt(target / Math.PI) * 0.45, 8, 40);
  // worked out only for the cells the growth reaches (the growth stops once the city is full)
  const costAt = k => {
    if (have[k]) return cost[k];
    have[k] = 1;
    const i = k % D - n, j = Math.floor(k / D) - n, u = (i + 0.5) * SP, v = (j + 0.5) * SP;
    if (Math.hypot(u * F.ax, v * F.ay) > RMAX) return (cost[k] = -1);
    const p = F.toW(u, v); P[k] = p;
    if (W.inLake(p.x, p.y) || W.inHome(p.x, p.y) !== (c.home !== false) || W.hAt(p.x, p.y) > 0.86 || fields.some(f => U.dxy(f.x, f.y, p.x, p.y) < f.r)) return (cost[k] = -1);
    const rd = W.riverDist(p.x, p.y);
    if (rd < 3.2) { wet[k] = 1; return (cost[k] = 9); }
    const sl = W.slopeAt(p.x, p.y) / 0.012, fo = W.forestD(p.x, p.y) > IC.FOREST_T;
    // a coarse noise makes some directions much dearer than others, so even open ground gives a ragged edge
    const nz = fbm(p.x / nzL + 5, p.y / nzL + 3, 3);
    let f = (1 + Math.min(4, sl * sl) + (fo ? 0.8 : 0)) * Math.exp(5 * (nz - 0.5));
    // a linear city keeps close to its highway
    if (st.linear) f *= 1 + (v * F.ay / (SP * 1.7)) ** 2;
    const q = nearest(Bk, p.x, p.y, 3);
    nr[k] = q;
    if (q.d < 3) f *= RF[q.s[4]] || 1;
    return (cost[k] = f);
  };
  // a typical cost per unit (from every third cell each way), so the villages and parks start growing when the
  // city's edge comes near them
  let cs = 0, cn = 0; for (let j = -n; j < n; j += 3) for (let i = -n; i < n; i += 3) { const k = idx(i, j), f = costAt(k); if (f > 0 && !wet[k]) { cs += f; cn++; } }
  const mc = cn ? cs / cn : 1;
  /* grow from the centre, the villages close by and a business or logistics park by a motorway */
  const g = new Float32Array(N).fill(1e9), src = new Int16Array(N).fill(-1), seeds = [];
  const seedAt = (x, y, g0, label) => { const [u, v] = F.toG(x, y), i = Math.floor(u / SP), j = Math.floor(v / SP); if (i < -n || j < -n || i >= n || j >= n) return; const k = idx(i, j); if (costAt(k) <= 0 || wet[k]) return; if (g0 < g[k]) { g[k] = g0; src[k] = label; seeds.push(k); } };
  for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const k = idx(a, b); if (costAt(k) > 0) { g[k] = 0; src[k] = 0; seeds.push(k); } }
  // a centre on bad ground (a hilltop, a marsh) grows from the nearest good cell instead
  if (!seeds.length) { let bk = -1, bd = 1e9; for (let k = 0; k < N; k++) if (costAt(k) > 0 && !wet[k]) { const d = U.dist(P[k], c); if (d < bd) { bd = d; bk = k; } } if (bk >= 0) { g[bk] = 0; src[bk] = 0; seeds.push(bk); } }
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
  // the growth can stop once the city has its cells and every cell of the old town has been reached
  let oldLeft = 0, got = 0;
  const oldCell = k => { const i = k % D - n, j = Math.floor(k / D) - n; return F.inOld((i + 0.5) * SP, (j + 0.5) * SP, SP * 0.3); };
  if (c.lat.rho) for (let k = 0; k < N; k++) if (oldCell(k) && costAt(k) > 0 && !wet[k]) oldLeft++;
  while (heap.length && (got < target || oldLeft > 0)) {
    const k = pop(); if (done[k]) continue; done[k] = 1;
    if (!wet[k]) { got++; if (c.lat.rho && oldCell(k)) oldLeft--; }
    const i = k % D - n, j = Math.floor(k / D) - n;
    for (const [di, dj, L] of M8) {
      const a = i + di, b = j + dj; if (a < -n || b < -n || a >= n || b >= n) continue;
      const q = idx(a, b); if (done[q] || costAt(q) <= 0) continue;
      const ng = g[k] + (cost[k] + cost[q]) * 0.5 * L * SP;
      if (ng < g[q]) { g[q] = ng; src[q] = src[k]; push(ng, q); }
    }
  }
  /* the cells the city fills: the cheapest to reach, and all of the old town */
  const cand = [];
  for (let k = 0; k < N; k++) if (done[k] && !wet[k] && have[k] && cost[k] > 0) cand.push(k);
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
  // how far the city reaches in each direction, smoothed
  const NS = 24, sect = new Float32Array(NS);
  for (const x of cells) { const a = Math.atan2(x.p.y - c.y, x.p.x - c.x), s = Math.floor(U.mod(a, Math.PI * 2) / (Math.PI * 2) * NS) % NS; sect[s] = Math.max(sect[s], U.dist(x.p, c)); }
  for (let pass = 0; pass < 2; pass++) { const o = sect.slice(); for (let s = 0; s < NS; s++) sect[s] = (o[(s + NS - 1) % NS] + 2 * o[s] + o[(s + 1) % NS]) / 4; }
  const ext = a => { const f = U.mod(a, Math.PI * 2) / (Math.PI * 2) * NS, s = Math.floor(f) % NS, t = f - Math.floor(f); return sect[s] * (1 - t) + sect[(s + 1) % NS] * t; };
  /* the country's roads join the street plan: from here on the pieces near the city are the new ones */
  let ave = null;
  if (c.home !== false && W.edges) {
    const nearCell = (p, m) => { const [u, v] = F.toG(p.x, p.y), i = Math.floor(u / SP), j = Math.floor(v / SP); for (let a = i - m; a <= i + m; a++) for (let b = j - m; b <= j + m; b++) if (a >= -n && b >= -n && a < n && b < n && isCell.has(idx(a, b))) return true; return false; };
    const mine = ave = joinRoads(W, c, F, st, a => ext(a) + SP * 0.8, ext, fields, st.radial || null, nearCell, R2);
    // the highway of a linear city is its great road, drawn and driven as one
    if (mine && st.linear) for (const e of mine) if (e.pts.filter(p => Math.abs(F.toG(p.x, p.y)[1]) < SP * 0.3).length >= e.pts.length * 0.8) e.ccls = 'ring';
    if (mine) {
      roads = roads.filter(s => s[4] === 'rail');
      const B0 = RMAX * 1.3;
      for (const e of W.edges) {
        const k = e.city === c.id ? 'art' : e.cls;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of e.pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        if (x0 > c.x + B0 || x1 < c.x - B0 || y0 > c.y + B0 || y1 < c.y - B0) continue;
        for (let i = 1; i < e.pts.length; i++) { const a = e.pts[i - 1], b = e.pts[i]; if (U.segDist(c.x, c.y, a.x, a.y, b.x, b.y) < RMAX * 1.3) roads.push([a.x, a.y, b.x, b.y, k]); }
      }
      Bk = buckets(4); for (const s of roads) Bk.add(s);
    }
  }

  /* the old diagonal across a grid (like Broadway): from the old town at the tip, slanting across the avenues */
  let bw = null;
  if (st.bway && cells.length > 60) bw = { u0: F.ou, v0: F.ov, sl: (R() < 0.5 ? 1 : -1) * R.range(0.22, 0.34) };
  const bwD = x => bw ? Math.abs(x.u - (bw.u0 + (x.v - bw.v0) * bw.sl)) / Math.hypot(1, bw.sl) : 0;
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
  // offices along the diagonal (New York), by the highway (Dubai), else in the middle
  const bizQ = bw ? () => free().filter(x => x.q < 0.6).sort((a, b) => bwD(a) / SP + a.q * 3 - bwD(b) / SP - b.q * 3)
    : st.linear ? () => free().sort((a, b) => Math.abs(a.v) / SP + a.q * 2 - Math.abs(b.v) / SP - b.q * 2) : byQ;
  take(bizQ(), sh('biz') * T * vary(), 'biz');
  take(byQ(), sh('dense') * T, 'dense');
  for (const x of cells) if (!x.d) x.d = 'sub';

  /* the old town's ring boulevard, the avenues out and (in a big city) the ring road */
  const streets = [], parksL = [], squares = [];
  const extra = [];   // road-like lines the blocks keep clear of
  if (c.lat.rho && st.ring) {
    const pts = [];
    for (let q = 0; q <= 64; q++) { const a = q / 64 * Math.PI * 2, rr = F.rho(a); pts.push(F.toW(F.ou + Math.cos(a) * rr, F.ov + Math.sin(a) * rr)); }
    streets.push({ cls: 'art', pts, ring: true, boul: true });
  }
  if (st.radials && c.pop > 150) {
    const ins = roads.filter(s => s[4] !== 'rail' && U.segDist(c.x, c.y, s[0], s[1], s[2], s[3]) < SP).map(s => { const far = U.dxy(s[0], s[1], c.x, c.y) > U.dxy(s[2], s[3], c.x, c.y) ? [s[0], s[1]] : [s[2], s[3]]; return Math.atan2(far[1] - c.y, far[0] - c.x); });
    const a0 = R.range(0, 7);
    for (let q = 0; q < st.radials; q++) {
      const a = a0 + q * Math.PI * 2 / st.radials + R.range(-0.2, 0.2);
      if (ins.some(b => Math.abs(U.angWrap(a - b)) < 0.45)) continue;
      const pts = [], d0 = c.lat.rho ? F.rho(a) * 0.98 : SP;
      for (let d = d0; d <= ext(a) * 0.9; d += SP / 2) {
        // (a boulevard runs dead straight; a high road winds a little)
        const wv = st.radial === 'par' ? 0 : 1.5 * Math.sin(d / 25), x = c.x + Math.cos(a) * d + Math.sin(a) * wv, y = c.y + Math.sin(a) * d - Math.cos(a) * wv;
        if (W.inLake(x, y) || W.riverDist(x, y) < 3 || hwNear(x, y, 1) || fields.some(f => U.dxy(f.x, f.y, x, y) < f.r)) break;
        pts.push({ x, y });
      }
      if (pts.length >= 4) { streets.push({ cls: 'art', pts, radial: true }); extra.push(pts); }
    }
  }
  const bypass = W.edges && W.edges.some(e => e.bypass === c.id);
  if ((c.capital && c.style !== 'east') || (st.loop && c.pop > 380) || (c.style === 'eu' && c.pop > 700) || (st.ring2 && c.pop > 300) || (st.peri && c.pop > 300 && !bypass)) {
    let pts = [];
    // (the ring motorway of a boulevard city runs at its edge, over the old fortifications)
    const kr = st.peri ? 0.9 : c.style === 'us' ? 0.62 : 0.72;
    const flush = () => { if (pts.length > 4) { streets.push({ cls: 'ring', pts, ring: pts.length > 90 }); extra.push(pts); } pts = []; };
    for (let q = 0; q <= 96; q++) {
      const a = q / 96 * Math.PI * 2, rr = ext(a) * kr * (1 + 0.04 * Math.sin(5 * a + c.lat.p2));
      const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
      if (W.inLake(x, y) || fields.some(f => U.dxy(f.x, f.y, x, y) < f.r)) { flush(); continue; }
      pts.push({ x, y });
    }
    flush();
  }
  /* the template's own streets */
  const over = (ave || []).slice();   // lines that replace the lattice streets under them
  const cellAt = (u, v) => { const i = Math.floor(u / SP), j = Math.floor(v / SP); return i >= -n && j >= -n && i < n && j < n ? isCell.get(idx(i, j)) : null; };
  const inTown = (x, y) => { const [u, v] = F.toG(x, y); return !!cellAt(u, v); };
  const clearAt = (x, y) => !W.inLake(x, y) && W.riverDist(x, y) > 1.6 && !hwNear(x, y, 1) && !fields.some(f => U.dxy(f.x, f.y, x, y) < f.r);
  const square = (x, y, w, h, a, round) => { squares.push({ x, y, w, h, a, round }); Bk.add([x, y, x, y, 'sq']); };
  if (bw) {
    // the diagonal, across the whole grid; squares where it crosses the avenues near the middle
    let run = [], best = [];
    for (let v = -n * SP; v <= n * SP; v += SP / 2) {
      const u = bw.u0 + (v - bw.v0) * bw.sl, p = F.toW(u, v);
      if (cellAt(u, v) && clearAt(p.x, p.y)) run.push(p); else { if (run.length > best.length) best = run; run = []; }
    }
    if (run.length > best.length) best = run;
    if (best.length >= 8) {
      streets.push({ cls: 'art', pts: best, radial: true, diag: true }); extra.push(best);
      const X = [];
      for (let i = -n; i <= n; i++) { const v = bw.v0 + (i * SP - bw.u0) / bw.sl, p = F.toW(i * SP, v); if (cellAt(i * SP, v) && U.dist(p, c) < R2 * 0.55) X.push(p); }
      X.sort((a, b) => U.dist(a, c) - U.dist(b, c));
      for (const p of X.slice(0, 5)) square(p.x, p.y, 1.5, 1.1, c.grid + Math.PI / 2);
    }
  }
  if (st.loop && T > 150) {
    // the downtown loop: a ring of avenues two blocks out
    const L = T > 400 ? 2 : 1, pts = [];
    for (const [a0, b0, da, db] of [[-L, -L, 1, 0], [L, -L, 0, 1], [L, L, -1, 0], [-L, L, 0, -1]]) for (let q = 0; q < 4 * L; q++) pts.push(F.toW((a0 + da * q / 2) * SP, (b0 + db * q / 2) * SP));
    pts.push(pts[0]);
    if (pts.every(p => inTown(p.x, p.y) || U.dist(p, c) < SP * 3)) { streets.push({ cls: 'art', pts, ring: true, loop: true }); over.push({ pts }); }
  }
  if (st.diag) {
    // diagonal avenues out from the centre, where no road already runs on one
    const used2 = (ave && ave.diag) || [];
    const dirs = [0, 1, 2, 3].map(k => c.grid + Math.PI / 4 + k * Math.PI / 2 + R.range(-0.12, 0.12)).sort(() => R() - 0.5);
    for (const a of dirs) {
      if (used2.length >= st.diag) break;
      if (used2.some(b => Math.abs(U.angWrap(a - b)) < 0.6)) continue;
      const pts = [];
      for (let d = SP * 2.6; d < R2; d += SP / 2) { const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!inTown(x, y) || !clearAt(x, y)) break; pts.push({ x, y }); }
      if (pts.length >= 6) { streets.push({ cls: 'art', pts, radial: true, diag: true }); extra.push(pts); used2.push(a); }
    }
  }
  if (st.stars && T > 200) {
    // stars: squares out in the city where six boulevards meet
    const got = [];
    for (let t = 0; t < 40 && got.length < (T > 450 ? st.stars : 1); t++) {
      const a = R.range(0, 7), d = ext(a) * R.range(0.4, 0.62), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (!inTown(x, y) || !clearAt(x, y) || F.inOld(...F.toG(x, y), SP) || got.some(g => U.dxy(g.x, g.y, x, y) < ext(a) * 0.5)) continue;
      if (nearest(Bk, x, y, SP * 1.2).d < SP * 1.2) continue;
      got.push({ x, y });
      const a0 = R.range(0, 7);
      for (let k = 0; k < 5; k++) {
        // each boulevard runs on until it meets another avenue
        const b = a0 + k * Math.PI * 2 / 5 + R.range(-0.15, 0.15), pts = [{ x: x + Math.cos(b) * 1.2, y: y + Math.sin(b) * 1.2 }];
        for (let q = 1.2 + SP / 2; q < SP * 3.5; q += SP / 2) {
          const px = x + Math.cos(b) * q, py = y + Math.sin(b) * q; if (!inTown(px, py) || !clearAt(px, py)) break;
          pts.push({ x: px, y: py });
          if (nearest(Bk, px, py, 0.6, s => s[4] !== 'art' && s[4] !== 'ring').d < 0.6) break;
        }
        if (pts.length >= 3) { streets.push({ cls: 'art', pts, radial: true, star: true }); extra.push(pts); }
      }
      square(x, y, 2.2, 2.2, 0, true);
    }
  }
  if (st.blvd && T > 120) {
    // a ring boulevard half way out, on the line of the later walls
    let pts = [];
    const flush = () => { if (pts.length > 6) streets.push({ cls: 'art', pts, ring: pts.length > 60, blvd: true }); pts = []; };
    for (let q = 0; q <= 72; q++) {
      const a = q / 72 * Math.PI * 2, rr = Math.max(ext(a) * 0.5, c.lat.rho ? F.rho(a) + SP * 1.5 : 0), x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
      if (!clearAt(x, y) || !inTown(x, y)) { flush(); continue; }
      pts.push({ x, y });
    }
    flush();
  }
  for (const l of streets) for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, l.cls]);
  /* a long park of whole blocks (New York), a great square in the middle (the enemy's towns) */
  const skip = new Set();
  const openCells = (i0, j0, w, h, keep) => {
    const L = []; for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) { const x = i >= -n && j >= -n && i < n && j < n && isCell.get(idx(i, j)); if (!x || x.old || x.d === 'rail') return false; L.push(x); }
    for (const x of L) skip.add(x.k);
    const rc = rectOf(F.toW(i0 * SP, j0 * SP), F.toW((i0 + w) * SP, j0 * SP), F.toW(i0 * SP, (j0 + h) * SP), F.toW((i0 + w) * SP, (j0 + h) * SP), 0.7);
    keep(rc); return true;
  };
  if (st.cpark && T > 150) {
    const len = U.clamp(Math.round(T / 90), 3, 7), sg = F.ov > 0 ? -1 : 1;
    for (let t = 0; t < 12; t++) {
      const i0 = R.int(-2, 1), j0 = sg > 0 ? R.int(1, 3) : -R.int(1, 3) - len + 1;
      if (openCells(i0, j0, 2, len, rc => parksL.push({ x: rc.x, y: rc.y, rx: rc.w / 2, ry: rc.h / 2, a: rc.a, rect: true }))) break;
    }
  }
  if (st.square) openCells(-1, -1, 2, 2, rc => squares.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a }));

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
    // no road over a block: what still touches one is built on the half (or the quarter) of the lot clear of it,
    // or smaller, or not at all
    const b = { x: px, y: py, w: rc.w * f, h: rc.h * f, a: rc.a };
    if (!rectHit(Bk, b, 0.1)) return b;
    if (!fine) {
      const ca = Math.cos(rc.a), sa = Math.sin(rc.a), part = (fu, fv, ou, ov) => ({ x: rc.x + ou * rc.w * ca - ov * rc.h * sa, y: rc.y + ou * rc.w * sa + ov * rc.h * ca, w: rc.w * fu - 0.35, h: rc.h * fv - 0.35, a: rc.a });
      let best = null;
      for (const q of [part(0.5, 1, -0.25, 0), part(0.5, 1, 0.25, 0), part(1, 0.5, 0, -0.25), part(1, 0.5, 0, 0.25)]) if (Math.min(q.w, q.h) >= 0.8 && !rectHit(Bk, q, 0.1) && (!best || q.w * q.h > best.w * best.h)) best = q;
      if (!best) for (const [ou, ov] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const q = part(0.5, 0.5, ou, ov); if (Math.min(q.w, q.h) >= 0.8 && !rectHit(Bk, q, 0.1)) { best = q; break; } }
      if (best) return best;
    }
    for (let k = 0; k < 3; k++) { b.w *= 0.72; b.h *= 0.72; if (Math.min(b.w, b.h) < 0.8) return null; if (!rectHit(Bk, b, 0.1)) return b; }
    return null;
  };
  const mkBlock = (x, rc, form, extraP) => {
    const D2 = IC.DISTRICTS[x.d];
    const b = Object.assign({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a, d: x.d, f: form, core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i: x.i, j: x.j }, extraP || {});
    blocks.push(b); return b;
  };
  let parksLeft = st.parks + (c.capital ? 2 : 0) + Math.round(c.pop / 600);
  for (const x of cells) {
    if ((x.d === 'old' && !x.vil) || skip.has(x.k)) continue;
    if (x.d === 'rail') {
      // tracks fan out along the line
      const q = nearest(Bk, x.p.x, x.p.y, SP * 1.5, s => s[4] !== 'rail'); if (q.d > SP) { x.d = 'ind'; } else {
        const a = Math.atan2(q.s[3] - q.s[1], q.s[2] - q.s[0]);
        const yd = { x: q.x, y: q.y, w: SP * 1.25, h: SP * 0.55, a };
        if (!rectHit(Bk, yd, 0.1, 'rail')) { mkBlock(x, yd, 'yard'); used.add(key(x.i, x.j)); continue; }
        x.d = 'ind';
      }
    }
    const A = F.toW(x.i * SP, x.j * SP), B = F.toW((x.i + 1) * SP, x.j * SP), C2 = F.toW(x.i * SP, (x.j + 1) * SP), Dd = F.toW((x.i + 1) * SP, (x.j + 1) * SP);
    const rc = rectOf(A, B, C2, Dd, 0.7), pl = place(x, rc);
    if (!pl) continue;
    used.add(key(x.i, x.j));
    const h = U.hash(x.i * 31 + 7, x.j * 17 + 1);
    if ((x.d === 'dense' || x.d === 'sub') && parksLeft > 0 && h < (st.parks > 4 ? 0.1 : 0.06)) { parksL.push({ x: pl.x, y: pl.y, rx: pl.w * 0.48, ry: pl.h * 0.46, a: pl.a }); parksLeft--; continue; }
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
      const flush = () => { if (run.length > 1) streets.push({ cls: cls(k, axis), pts: run, old }); run = []; };
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
  lines((i, j) => used.has(key(i, j)), -n, n, SP, F.toW, (k, axis) => U.mod(k, axis ? artV : artU) === 0 ? 'art' : 'st', false);
  if (c.lat.rho) lines((i, j) => fineUsed.has(key(i, j)), -2 * n, 2 * n, SP / 2, F.toWold, () => 'st', true);
  // where a national road now runs along a lattice line, it is that street: the street's own piece goes
  if (over.length) {
    const Bm = buckets(3); for (const e of over) for (let i = 1; i < e.pts.length; i++) Bm.add([e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y]);
    const onA = p => { let d = 1e9; Bm.near(p.x, p.y, 0.5, s => { d = Math.min(d, U.segDist(p.x, p.y, s[0], s[1], s[2], s[3])); }); return d < 0.3; };
    const out = [];
    for (const l of streets) {
      if (l.ring || l.radial || l.old) { out.push(l); continue; }
      let run = [l.pts[0]];
      for (let i = 1; i < l.pts.length; i++) {
        const a = l.pts[i - 1], b = l.pts[i];
        if (onA(a) && onA(b) && onA({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) { if (run.length > 1) out.push(Object.assign({}, l, { pts: run })); run = [b]; }
        else run.push(b);
      }
      if (run.length > 1) out.push(Object.assign({}, l, { pts: run }));
    }
    streets.length = 0; streets.push(...out);
  }
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

/* ---------- where the country's roads meet a city ----------
   A national road that reaches into the built-up area stops at the city's edge (a gate) and goes on as one of the
   city's own streets: along the lattice line of an avenue (grid plans) or a radial high road or boulevard (radial
   plans), to the centre, where the routing graph keeps the city's node. Roads that come in close together share a
   gate; avenues that meet on the way in join there. A motorway stops short of the town: where two or more reach it,
   a bypass joins them round the edge, and each meets its avenue at an interchange just off the bypass. Villages and
   plants swallowed by the city are tied to it the same way. Roads that only graze the edge are left alone (the
   blocks there give way). Returns the pieces of road near the city, as segments for the street plan. */
const KEY = (i, j) => i * 65536 + j;
function joinRoads(W, c, F, st, bnd, ext, fields, radial, nearCell, R2) {
  const SP = F.SP, far = Math.max(...Array.from({ length: 24 }, (_, q) => bnd(q / 24 * Math.PI * 2))) + SP * 4;
  const ang = p => Math.atan2(p.y - c.y, p.x - c.x), dist = p => Math.hypot(p.x - c.x, p.y - c.y);
  // (the bypass keeps clear of the town on either side as well, not only straight out)
  const ringR = a => Math.max(bnd(a - 0.35), bnd(a), bnd(a + 0.35)) + SP * 1.3;
  // (within the outline, or next to a built cell of a ragged town)
  const inside = (p, hw) => dist(p) < (hw ? ringR(ang(p)) : bnd(ang(p))) || (dist(p) < R2 + SP * 3 && nearCell(p, hw ? 2 : 1));
  const deep = p => dist(p) < Math.max(2 * SP, ext(ang(p)) * 0.5, R2 * 0.5 + SP);
  let ng = 0;
  const newNode = p => { const id = c.id + ':' + ng++; W.nodes[id] = { id, x: p.x, y: p.y, jct: true }; return id; };
  const gates = [], places = [], gone = new Set(), fresh = [];
  const near = (a, b) => U.segDist(c.x, c.y, a.x, a.y, b.x, b.y) < far;
  for (const e of W.edges) {
    if (e.city) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of e.pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    if (x0 > c.x + far || x1 < c.x - far || y0 > c.y + far || y1 < c.y - far) continue;
    // finer points near the city, so the gate falls on its edge (the pieces left outside keep only their own)
    const P = [e.pts[0]], own = [1];
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], L = U.dist(a, b);
      if (L > 1.5 && near(a, b)) for (let k = 1, n = Math.ceil(L / 1.5); k < n; k++) { P.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); own.push(0); }
      P.push(b); own.push(1);
    }
    const piece = (s, t) => P.slice(s, t).filter((p, k) => own[s + k] || k === 0 || k === t - s - 1);
    const hw = e.cls === 'hw', n = P.length, inn = P.map(p => inside(p, hw));
    inn[0] = inn[0] || e.a === c.id; inn[n - 1] = inn[n - 1] || e.b === c.id;
    const runs = [];
    for (let i = 0; i < n; i++) if (inn[i]) { let j = i; while (j + 1 < n && inn[j + 1]) j++; runs.push([i, j]); i = j; }
    // a run that reaches the middle of town, or ends at the city itself
    const dr = runs.filter(([i, j]) => (i === 0 && e.a === c.id) || (j === n - 1 && e.b === c.id) || P.slice(i, j + 1).some(deep));
    if (!dr.length) continue;
    // an outer piece that would be a stub: its outside node joins the city directly
    for (const r of dr) { if (r[0] > 0 && r[0] < 3) r[0] = 0; if (r[1] < n - 1 && r[1] > n - 4) r[1] = n - 1; }
    gone.add(e);
    let s = 0, from = e.a;
    const gate = (p, q) => { const id = newNode(p); gates.push({ id, x: p.x, y: p.y, a: ang(p), hw, rank: RANK[e.cls] || 1, dir: Math.atan2(p.y - q.y, p.x - q.x) }); return id; };
    for (const [i, j] of dr) {
      if (i > s) { const g = gate(P[i - 1], P[i]); fresh.push({ a: from, b: g, cls: e.cls, pts: piece(s, i) }); }
      else if (i === 0) places.push(e.a);
      if (j < n - 1) { from = gate(P[j + 1], P[j]); s = j + 1; } else { places.push(e.b); s = n; }
    }
    if (s < n) fresh.push({ a: from, b: e.b, cls: e.cls, pts: piece(s, n) });
  }
  if (!gone.size) return null;
  W.edges = W.edges.filter(e => !gone.has(e)).concat(fresh);
  const touch = id => W.edges.some(e => e.a === id || e.b === id);
  // the pieces are the city's now: gates close together share one (the busier road keeps its line)
  const pieceAt = id => W.edges.find(e => (e.a === id || e.b === id) && !e.city);
  const merge = (keep, g) => {
    for (let e; (e = pieceAt(g.id));) {
      const o = e.a === g.id ? e.b : e.a;
      // (a second road to the same place, or a piece between the two gates, is not needed)
      if (o === keep.id || W.edges.some(q => q !== e && ((q.a === keep.id && q.b === o) || (q.b === keep.id && q.a === o)))) W.edges.splice(W.edges.indexOf(e), 1);
      else if (e.a === g.id) { e.a = keep.id; e.pts.unshift({ x: keep.x, y: keep.y }); } else { e.b = keep.id; e.pts.push({ x: keep.x, y: keep.y }); }
    }
    delete W.nodes[g.id];
  };
  const minSep = a => Math.max(0.3, SP * 3 / Math.max(SP, ext(a)));
  const byA = gates.slice().sort((p, q) => p.a - q.a), kept = [];
  for (const g of byA) {
    const k = kept.find(o => o.hw === g.hw && Math.abs(U.angWrap(o.a - g.a)) < minSep(g.a));
    if (!k) { kept.push(g); continue; }
    if (g.rank > k.rank) { kept[kept.indexOf(k)] = g; merge(g, k); } else merge(k, g);
  }
  const plain = kept.filter(g => !g.hw), hws = kept.filter(g => g.hw).sort((p, q) => p.a - q.a);
  /* the bypass: arcs between the motorway gates, round the edge of town (all the way round a ring-road plan) */
  const arcs = [];
  if (hws.length >= 2) {
    const gaps = hws.map((g, i) => ({ g, h: hws[(i + 1) % hws.length], gap: U.mod(hws[(i + 1) % hws.length].a - g.a, Math.PI * 2) }));
    const big = gaps.reduce((m, x) => x.gap > m.gap ? x : m, gaps[0]);
    for (const x of gaps) {
      if ((x === big && !st.peri) || (hws.length === 2 && x.gap > Math.PI * 1.25)) continue;
      const d0 = dist(x.g), d1 = dist(x.h), N = Math.max(4, Math.ceil(x.gap * (d0 + d1) / 2 / 4)), pts = [];
      let ok = true;
      for (let q = 0; q <= N; q++) {
        const t = q / N, a = x.g.a + x.gap * t, r = ringR(a) + (1 - t) * (d0 - ringR(x.g.a)) + t * (d1 - ringR(x.h.a));
        const p = q === 0 ? { x: x.g.x, y: x.g.y } : q === N ? { x: x.h.x, y: x.h.y } : { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
        if (W.inLake(p.x, p.y) || !W.inHome(p.x, p.y) || fields.some(f => U.dist(f, p) < f.r + 4)) { ok = false; break; }
        pts.push(p);
      }
      if (ok) { const e = { a: x.g.id, b: x.h.id, cls: 'hw', pts, bypass: c.id }; W.edges.push(e); arcs.push(e); }
    }
  }
  // each motorway meets its avenue at an interchange on the bypass, a little way along from where it joins it
  for (const g of hws) {
    const e = arcs.find(q => q.a === g.id) || arcs.find(q => q.b === g.id);
    if (!e) { plain.push(g); continue; }
    const P = e.a === g.id ? e.pts : e.pts.slice().reverse();
    let s = 0, i = 1; for (; i < P.length - 2; i++) { s += U.dist(P[i - 1], P[i]); if (s > SP * 1.8) break; }
    if (i >= P.length - 2) { plain.push(g); continue; }
    const id = newNode(P[i]), A = P.slice(0, i + 1), B = P.slice(i);
    const other = e.a === g.id ? e.b : e.a;
    e.a = g.id; e.b = id; e.pts = A;
    W.edges.push({ a: id, b: other, cls: 'hw', pts: B, bypass: c.id });
    plain.push({ id, x: P[i].x, y: P[i].y, a: ang(P[i]), rank: 4 });
  }
  /* the avenues in: paths of lattice points (or of points along a radial), laid one by one, each stopping where it
     meets one laid before, so they join as a tree at the centre */
  const pos = new Map(), adj = new Map(), nodeKey = new Map();
  const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { let s = adj.get(p); if (!s) adj.set(p, s = new Set()); s.add(q); } };
  const O = KEY(0, 0); pos.set(O, { x: c.x, y: c.y }); nodeKey.set(O, c.id);
  const lat = (i, j) => F.toW(i * SP / 2, j * SP / 2);   // half-steps of the lattice, as the streets are drawn
  let rk = 0;
  const lay = (id, p, keys) => {
    const k0 = -2e9 - rk++; pos.set(k0, p); nodeKey.set(k0, id);
    let prev = k0;
    for (const [k, q] of keys) {
      const was = adj.has(k) || k === O;
      if (!pos.has(k)) pos.set(k, q);
      if (k !== prev) link(prev, k);
      if (was) break;
      prev = k;
    }
  };
  const gridKeys = p => {
    const [u, v] = F.toG(p.x, p.y), alongU = Math.abs(u * F.ax) >= Math.abs(v * F.ay), A = ((alongU ? st.artV : st.artU) || st.art) * 2;
    const off = Math.round((alongU ? v : u) / SP * 2 / A) * A, su = Math.sign(alongU ? u : v) || 1;
    // out along the line to the city's edge, then back in to the centre line, then along it to the centre
    let m = 0; while (m < 400 && inside(alongU ? lat(su * m, off) : lat(off, su * m))) m += 2;
    const out = [];
    for (let q = m; q >= 0; q--) out.push(alongU ? [su * q, off] : [off, su * q]);
    for (let q = Math.abs(off) - 1; q >= 0; q--) out.push(alongU ? [0, Math.sign(off) * q] : [Math.sign(off) * q, 0]);
    return out.map(([i, j]) => [KEY(i, j), lat(i, j)]);
  };
  const radialKeys = (p, idx) => {
    const L = dist(p), n = Math.max(2, Math.ceil(L / (SP / 2))), nx = -(p.y - c.y) / L, ny = (p.x - c.x) / L;
    const amp = radial === 'lon' ? Math.min(SP * 0.9, L * 0.06) : 0, f = 1 + (idx % 3) * 0.5, ph = idx * 1.7;
    const out = [];
    for (let q = 1; q <= n; q++) {
      const t = 1 - q / n, o = Math.sin(Math.PI * t) * amp * Math.sin(t * Math.PI * 2 * f + ph);
      out.push([q === n ? O : 1e9 + idx * 4096 + q, { x: c.x + (p.x - c.x) * t + nx * o, y: c.y + (p.y - c.y) * t + ny * o }]);
    }
    return out;
  };
  const ends = plain.map(g => ({ id: g.id, x: g.x, y: g.y, rank: g.rank || 1 }));
  // places the city has swallowed, and junctions still joined to roads outside
  for (const id of new Set(places)) if (id !== c.id && W.nodes[id] && (!W.nodes[id].jct || touch(id))) ends.push({ id, x: W.nodes[id].x, y: W.nodes[id].y, rank: 0 });
  ends.sort((a, b) => b.rank - a.rank || dist(a) - dist(b));
  // (a grid city with diagonal avenues takes a road coming in at a slant along one, up to its number of them)
  const diag = [];
  const slant = g => { const [u, v] = F.toG(g.x, g.y), a = Math.abs(Math.atan2(v * F.ay, u * F.ax)) % (Math.PI / 2); return a > 0.4 && a < 1.17; };
  ends.forEach((g, idx) => {
    const dg = !radial && st.diag && diag.length < st.diag && g.rank > 0 && slant(g) && !diag.some(b => Math.abs(U.angWrap(b - ang(g))) < 0.6);
    if (dg) diag.push(ang(g));
    lay(g.id, { x: g.x, y: g.y }, radial || dg ? radialKeys(g, idx) : gridKeys(g));
  });
  // chains between the ends, the centre and every point where avenues join become the city's arterial edges
  const isNode = k => nodeKey.has(k) || (adj.get(k) || new Set()).size !== 2;
  const seen = new Set(), mine = [];
  for (const [k] of adj) {
    if (!isNode(k)) continue;
    for (const k1 of adj.get(k)) {
      if (seen.has(k + '>' + k1)) continue;
      const keys = [k]; let prev = k, cur = k1;
      for (let g = 0; g < 5000; g++) { seen.add(prev + '>' + cur); seen.add(cur + '>' + prev); keys.push(cur); if (isNode(cur)) break; const nx = [...adj.get(cur)].find(q => q !== prev); prev = cur; cur = nx; }
      const idOf = q => { if (!nodeKey.has(q)) nodeKey.set(q, newNode(pos.get(q))); return nodeKey.get(q); };
      const a = idOf(keys[0]), b = idOf(keys[keys.length - 1]);
      if (a === b) continue;
      const e = { a, b, cls: 'rd', pts: keys.map(q => ({ x: pos.get(q).x, y: pos.get(q).y })), city: c.id, ccls: 'art' };
      if (!radial && keys.some(q => q >= 1e9)) e.diag = true;   // (a diagonal avenue across the grid)
      W.edges.push(e); mine.push(e);
    }
  }
  // junctions inside the city that nothing uses any more
  const usedN = new Set(); for (const e of W.edges) { usedN.add(e.a); usedN.add(e.b); }
  for (const k in W.nodes) if (k !== c.id && W.nodes[k].jct && !usedN.has(k) && U.dist(W.nodes[k], c) < far) delete W.nodes[k];
  mine.diag = diag;
  return mine;
}
const RANK = { sp: 1, lc: 2, rd: 3, hw: 4 };

/* the building form of a lattice cell, by district and style */
function formFor(c, st, x) {
  const h = U.hash(x.i * 7 + 3, x.j * 13 + 5), d = x.d, s = c.style;
  // a cell at the crossing of two avenues
  const aU = st.artU || st.art, aV = st.artV || st.art, onArt = (U.mod(x.i, aU) === 0 || U.mod(x.i + 1, aU) === 0) && (U.mod(x.j, aV) === 0 || U.mod(x.j + 1, aV) === 0);
  if (d === 'old') return 'old';
  if (d === 'ind') return 'shed';
  if (d === 'log') return 'ware';
  if (d === 'rail') return 'yard';
  if (d === 'biz') return c.tpl === 'dxb' ? 'tower' : x.park ? 'office' : s === 'us' || s === 'east' ? 'tower' : s === 'new' ? (x.q < 0.03 ? 'mall' : 'office') : h < 0.35 ? 'tower' : 'court';
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
  const st = styleOf(c), F = IC.cityFrame(c), SP = F.SP;
  const P = [F.toW(i * SP, j * SP), F.toW((i + 1) * SP, j * SP), F.toW(i * SP, (j + 1) * SP), F.toW((i + 1) * SP, (j + 1) * SP)];
  const rc = rectOf(P[0], P[1], P[2], P[3], 0.7), D2 = IC.DISTRICTS[d];
  const b = { x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a, d, f: formFor(c, st, { i, j, d, q }), core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i, j };
  const streets = [];
  for (const [di, dj, e0, e1] of [[1, 0, [1, 0], [1, 1]], [-1, 0, [0, 0], [0, 1]], [0, 1, [0, 1], [1, 1]], [0, -1, [0, 0], [1, 0]]]) {
    if (!open(di, dj)) continue;
    const u0 = (i + e0[0]) * SP, v0 = (j + e0[1]) * SP, u1 = (i + e1[0]) * SP, v1 = (j + e1[1]) * SP, line = di ? i + e0[0] : j + e0[1];
    streets.push({ cls: U.mod(line, (di ? st.artU : st.artV) || st.art) === 0 ? 'art' : 'st', pts: [F.toW(u0, v0), F.toW((u0 + u1) / 2, (v0 + v1) / 2), F.toW(u1, v1)], grown: true });
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
      // (an end that stops just short of a street or road is run on to meet it)
      // (a corner where two streets end together counts as tied, but still meets a road or street that passes by it)
      let near = null, nd = 0.4, cor = false;
      Bk.near(e.x, e.y, 0.5, sg => {
        if (sg[4] === li) return;
        if ((Math.abs(sg[0] - e.x) < 1e-6 && Math.abs(sg[1] - e.y) < 1e-6) || (Math.abs(sg[2] - e.x) < 1e-6 && Math.abs(sg[3] - e.y) < 1e-6)) { cor = true; return; }
        const d = U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]); if (d < nd) { nd = d; near = sg; }
      });
      if (near || cor) {
        if (near && nd > 1e-3) { const vx = near[2] - near[0], vy = near[3] - near[1], LL = vx * vx + vy * vy, t = LL ? U.clamp(((e.x - near[0]) * vx + (e.y - near[1]) * vy) / LL, 0, 1) : 0, p = { x: near[0] + vx * t, y: near[1] + vy * t }; if (end) P.push(p); else P.unshift(p); }
        continue;
      }
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
  // the street plan, in words: "laid out as a square grid with diagonal avenues and a downtown loop; "
  const style = TPL[c.tpl] ? `laid out as ${TPL[c.tpl].plan}; ` : c.style === 'ind' ? '' : c.style === 'new' ? 'planned new town, ' : `${st.name} plan, `;
  const pct = k => Math.round(m[k] * 100);
  return { kind, why, style: st.name, text: `${kind}. ${why}`, parts: `${style}${pct('biz') + pct('old')}% centre and offices, ${pct('dense') + pct('sub')}% housing, ${pct('ind') + pct('log') + pct('rail')}% industry and warehouses` };
};

})(window.IC);
