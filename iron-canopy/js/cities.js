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
  const flat = !L.k && !L.kOut, Z = [0, 0];
  const disp = (u, v) => {
    if (flat) return Z;
    const d = Math.hypot(u, v), k = U.smooth(U.clamp(d / (3 * SP), 0, 1)) * (L.k + L.kOut * U.clamp((d / L.r0 - 0.35) / 0.4, 0, 1));
    if (!k) return Z;
    return [k * (U.vnoise(u / wl + s, v / wl) - 0.5) * 2, k * (U.vnoise(u / wl + 41, v / wl + s) - 0.5) * 2];
  };
  // (a stretched lattice: ax along, ay across, so blocks can be long between avenues)
  const toW = (u, v) => { const d = disp(u, v), p = u * ax + d[0], q = v * ay + d[1]; return { x: c.x + p * ca - q * sa, y: c.y + p * sa + q * ca }; };
  // the old town's lanes wind on a much shorter wavelength
  const toWold = (u, v) => { const p = toW(u, v), du = (U.vnoise(u / 6 + s, v / 6) - 0.5) * 1.6, dv = (U.vnoise(u / 6, v / 6 + s + 9) - 0.5) * 1.6; return { x: p.x + du * ca - dv * sa, y: p.y + du * sa + dv * ca }; };
  const toG = (x, y) => {
    const u0 = (x - c.x) * ca + (y - c.y) * sa, v0 = -(x - c.x) * sa + (y - c.y) * ca;
    let u = u0 / ax, v = v0 / ay;
    if (!flat) for (let i = 0; i < 4; i++) { const d = disp(u, v); u = (u0 - d[0]) / ax; v = (v0 - d[1]) / ay; }
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
/* does the segment come within p of the polygon F (flat x, y pairs), or run inside it? */
function polyNear(F, x0, y0, x1, y1, p) {
  const n = F.length / 2;
  let ins = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = F[i * 2], ay = F[i * 2 + 1], bx = F[j * 2], by = F[j * 2 + 1];
    if ((ay > y0) !== (by > y0) && x0 < (bx - ax) * (y0 - ay) / (by - ay) + ax) ins = !ins;
    if (U.segDist(ax, ay, x0, y0, x1, y1) < p || U.segX(ax, ay, bx, by, x0, y0, x1, y1) > 0) return true;
  }
  return ins;
}
function rectHit(Bk, b, pad, skip) {
  const ca = Math.cos(b.a), sa = Math.sin(b.a); let hit = false;
  Bk.near(b.x, b.y, Math.hypot(b.w, b.h) / 2 + 1, s => {
    if (hit || s[4] === 'st' || s[4] === 'col' || s[4] === skip) return;
    const p = (HALF[s[4]] || 0.2) + pad, ax = s[0] - b.x, ay = s[1] - b.y, bx = s[2] - b.x, by = s[3] - b.y;
    const x0 = ax * ca + ay * sa, y0 = -ax * sa + ay * ca, x1 = bx * ca + by * sa, y1 = -bx * sa + by * ca;
    if (!segBox(x0, y0, x1, y1, b.w / 2 + p, b.h / 2 + p)) return;
    // (a real old town's block is its own outline, b.pg, not its box: brief 65)
    if (!b.pg || polyNear(b.pg, x0, y0, x1, y1, p)) hit = true;
  });
  return hit;
}
/* a real old town (city-cores.js, brief 65) read from its packed text: streets [{ c: class, p: [x, y, ...] }] and
   building footprints [[x, y, ...]], in metres round its centre, x east and y south */
IC.unpackCore = function (core) {
  if (core._u) return core._u;
  const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', V = new Int8Array(128);
  for (let i = 0; i < 64; i++) V[AB.charCodeAt(i)] = i;
  const read = s => { const out = []; let z = 0, m = 1; for (let i = 0; i < s.length; i++) { const v = V[s.charCodeAt(i)]; if (v >= 32) { z += (v - 32) * m; m *= 32; } else { z += v * m; out.push(z & 1 ? -(z + 1) / 2 : z / 2); z = 0; m = 1; } } return out; };
  const pts = (N, i, k) => { const n = N[i], p = []; let x = 0, y = 0; for (let q = 0; q < n; q++) { x += N[i + 1 + q * 2]; y += N[i + 2 + q * 2]; p.push(x / k, y / k); } return p; };
  const S = read(core.streets), B = read(core.bld), streets = [], bld = [];
  for (let i = 0; i < S.length;) { const c = S[i], n = S[i + 1]; streets.push({ c, p: pts(S, i + 1, 1) }); i += 2 + n * 2; }
  for (let i = 0; i < B.length;) { const n = B[i]; bld.push(pts(B, i, 2)); i += 1 + n * 2; }
  // each footprint's middle, so a town laid on the sample skips what lies outside its old town unturned
  const mid = new Float64Array(bld.length * 2);
  bld.forEach((fp, k) => { let mx = 0, my = 0; for (let i = 0; i < fp.length; i += 2) { mx += fp[i]; my += fp[i + 1]; } mid[k * 2] = mx * 2 / fp.length; mid[k * 2 + 1] = my * 2 / fp.length; });
  return core._u = { streets, bld, mid };
};
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
const HALF = { hw: 0.35, rd: 0.14, lc: 0.1, sp: 0.08, rail: 0.35, art: 0.15, ring: 0.3, col: 0.11, st: 0.1, sq: 0.8 };

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
  let ixs = null;   // (the interchanges this town must keep out of, listed once the roads in, and a linear city's spine, are laid)
  fields = fields.filter(f => U.dxy(f.x, f.y, c.x, c.y) < RMAX * 2.5 + f.r);   // (only the airfields and plants this town can reach)
  const target = Math.round(U.clamp(c.pop / 2.4, 30, 850));
  // the lattice turns with the main road in (a grid lines up with it)
  if (!st.radial && c.tpl !== 'east') {
    const e = roads.filter(s => s[4] === 'hw' || s[4] === 'rd').sort((a, b) => U.segDist(c.x, c.y, a[0], a[1], a[2], a[3]) - U.segDist(c.x, c.y, b[0], b[1], b[2], b[3]))[0];
    if (e) c.grid = U.mod(Math.atan2(e[3] - e[1], e[2] - e[0]), Math.PI / 2);
  }
  const nOld = st.old * target >= 5 ? st.old * target : 0;
  // (the lattice is only the city's cells now: the streets follow the field, brief 53, so it is not bent)
  c.lat = { SP, a: c.grid, k: 0, kOut: 0, wl: st.wl, s: R.range(0, 500), r0: r, rho: nOld ? Math.sqrt(nOld * SP * SP / Math.PI) + SP * 0.3 : 0, p1: R.range(0, 7), p2: R.range(0, 7), ax: 1, ay: 1 };
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
  if (W.edges) {
    const nearCell = (p, m) => { const [u, v] = F.toG(p.x, p.y), i = Math.floor(u / SP), j = Math.floor(v / SP); for (let a = i - m; a <= i + m; a++) for (let b = j - m; b <= j + m; b++) if (a >= -n && b >= -n && a < n && b < n && isCell.has(idx(a, b))) return true; return false; };
    // (the avenues in are traced on the field of the roads as they stand; the field is made again once they are in)
    const mine = ave = joinRoads(W, c, F, st, a => ext(a) + SP * 0.8, ext, fields, st.radial || null, nearCell, R2, fieldOf(W, c, roads, RMAX));
    if (IC.ixNear) ixs = IC.ixNear(W, c.x, c.y, RMAX * 2.2);
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
  take(free().filter(x => x.q > 0.1).map(x => { const a = Math.atan2(x.p.y - c.y, x.p.x - c.x); return { x, s: Math.cos(U.angWrap(a - ia)) * 1.2 - x.q * 0.4 + (railD(x) < SP * 2 ? 0.5 : 0) + R() * 0.3 }; }).sort((a, b) => b.s - a.s).map(o => o.x), Math.max(3, sh('ind') * T * vary()), 'ind');   // (every town has a works or two)
  take(free().filter(x => x.q > 0.3).map(x => ({ x, s: -hwD(x) / SP + x.q + R() * 0.8 })).sort((a, b) => b.s - a.s).map(o => o.x), sh('log') * T * vary(), 'log');
  const byQ = () => free().sort((a, b) => a.q - b.q);
  // offices along the diagonal (New York), by the highway (Dubai), else in the middle
  const bizQ = bw ? () => free().filter(x => x.q < 0.6).sort((a, b) => bwD(a) / SP + a.q * 3 - bwD(b) / SP - b.q * 3)
    : st.linear ? () => free().sort((a, b) => Math.abs(a.v) / SP + a.q * 2 - Math.abs(b.v) / SP - b.q * 2) : byQ;
  take(bizQ(), sh('biz') * T * vary(), 'biz');
  take(byQ(), sh('dense') * T, 'dense');
  for (const x of cells) if (!x.d) x.d = 'sub';

  /* ---------- the fabric (brief 53, cityfabric.js): the field is complete now that the avenues are in ---------- */
  const FL = fieldOf(W, c, roads, RMAX);
  const sizeK = (IC.FABRIC.styleK[c.style] || 1), SZ = IC.FABRIC.size;
  const cellAt = (u, v) => { const i = Math.floor(u / SP), j = Math.floor(v / SP); return i >= -n && j >= -n && i < n && j < n ? isCell.get(idx(i, j)) : null; };
  const cellXY = (x, y) => { const [u, v] = F.toG(x, y); return cellAt(u, v); };
  const inTown = (x, y) => !!cellXY(x, y);
  // water, by the rivers' own lines (W.riverDist is a 5 km grid): how far inside the water a point is, or less than 0
  const rivSegs = [];
  for (const r of W.rivers) { if (r.bb[0] > c.x + RMAX * 1.4 || r.bb[2] < c.x - RMAX * 1.4 || r.bb[1] > c.y + RMAX * 1.4 || r.bb[3] < c.y - RMAX * 1.4) continue; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(c.x, c.y, a[0], a[1], b[0], b[1]) < RMAX * 1.4) rivSegs.push([a[0], a[1], b[0], b[1], r.w * 0.15]); } }
  const RB = buckets(6); for (const s of rivSegs) RB.add(s);
  const rivW = rivSegs.reduce((m, s) => Math.max(m, s[4]), 0);
  const wetBy = (x, y) => { let m = -1e9; RB.near(x, y, 4, s => { const d = s[4] - U.segDist(x, y, s[0], s[1], s[2], s[3]); if (d > m) m = d; }); return m; };
  const squaresAt = [], parkRects = [];
  const inRect = (q, x, y, m) => { const ca = Math.cos(q.a), sa = Math.sin(q.a), lx = (x - q.x) * ca + (y - q.y) * sa, ly = -(x - q.x) * sa + (y - q.y) * ca; return Math.abs(lx) < q.w / 2 + m && Math.abs(ly) < q.h / 2 + m; };
  // what is at x, y: 0 free, 2 outside the city, else what is in the way; kept on a 50 m raster as it is asked
  const WHY = [0, 0, 2, 'water', 'hw', 'field', 'sq'];
  const HB = buckets(4); for (const s of roads) if (s[4] === 'hw') HB.add(s);
  const hwAt = (x, y) => { let hit = false; HB.near(x, y, 1, s => { if (!hit && U.segDist(x, y, s[0], s[1], s[2], s[3]) < 0.9) hit = true; }); return hit; };
  const blockedRaw = (x, y) => {
    if (!inTown(x, y)) return 2;
    if (hwAt(x, y) || (IC.ixClear && IC.ixClear(W, x, y, 1.0, ixs))) return 4;
    if (W.inLake(x, y) || wetBy(x, y) > -1.0) return 3;
    if (core && core.inCore(x, y)) return 6;   // (a real old town has its own streets: brief 65)
    for (const f of fields) if (U.dxy(f.x, f.y, x, y) < f.r) return 5;
    for (const q of squaresAt) if (inRect(q, x, y, 0.25)) return 6;
    for (const q of parkRects) if (inRect(q, x, y, 0.25)) return 6;
    return 1;
  };
  const RES = 0.5, rx0 = c.x - RMAX * 1.35, ry0 = c.y - RMAX * 1.35, rn = Math.ceil(RMAX * 2.7 / RES) + 1, ras = new Uint8Array(rn * rn), rasD = new Uint8Array(rn * rn);
  const DK = ['sub', 'old', 'biz', 'dense', 'sub', 'ind', 'log', 'rail'], DI = { old: 1, biz: 2, dense: 3, sub: 4, ind: 5, log: 6, rail: 7 };
  const rasAt = (x, y) => {
    const i = Math.round((x - rx0) / RES), j = Math.round((y - ry0) / RES); if (i < 0 || j < 0 || i >= rn || j >= rn) return -1;
    const k = j * rn + i; if (!ras[k]) { const px = rx0 + i * RES, py = ry0 + j * RES; ras[k] = blockedRaw(px, py); const cl = cellXY(px, py); rasD[k] = cl ? DI[cl.d] || 4 : 4; }
    return k;
  };
  const blocked = (x, y) => { const k = rasAt(x, y); return k < 0 ? 2 : WHY[ras[k]]; };
  const rasClear = q => { const m = Math.max(q.w, q.h) / 2 + 0.5, i0 = Math.max(0, Math.floor((q.x - m - rx0) / RES)), i1 = Math.min(rn - 1, Math.ceil((q.x + m - rx0) / RES)), j0 = Math.max(0, Math.floor((q.y - m - ry0) / RES)), j1 = Math.min(rn - 1, Math.ceil((q.y + m - ry0) / RES)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ras[j * rn + i] = 0; };
  // (a district may space its two families apart: the downtown's long blocks and short ones, brief 65)
  const szOf = (d, fam) => { const s = SZ[d] || SZ.sub; return typeof s === 'number' ? s : s[fam ? 1 : 0]; };
  const sizeAt = (x, y, fam) => { const k = rasAt(x, y); return szOf(k < 0 ? 'sub' : DK[rasD[k]], fam) * sizeK * (fam ? (st.ax || 1) : (st.ay || 1)); };
  const square = (x, y, w, h, a, round) => { const q = { x, y, w, h, a, round }; squares.push(q); squaresAt.push(q); rasClear(q); Bk.add([x, y, x, y, 'sq']); };
  /* the template's own lines: the old town's boulevard on the wall line, a grid's old diagonal, diagonal avenues,
     the stars' boulevards; each a line of the field too, so the blocks beside it front it */
  const streets = [], parksL = [], squares = [];
  const bkAdd = l => { for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, l.cls]); };
  const addSt = (l, kind) => { streets.push(l); bkAdd(l); if (kind) { for (let q = 1; q < l.pts.length; q++) c.fld.lines.push([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, kind]); } };
  if (c.lat.rho && st.ring) {
    const pts = [];
    for (let q = 0; q <= 64; q++) { const a = q / 64 * Math.PI * 2, rr = F.rho(a); pts.push(F.toW(F.ou + Math.cos(a) * rr, F.ov + Math.sin(a) * rr)); }
    addSt({ cls: 'art', pts, ring: true, boul: true }, 'wall');
  }
  /* a European town's old town is a real one (brief 65, city-cores.js): one of five, picked, turned and mirrored by
     the town, at its real scale, inside where its walls were. Its streets are laid now, so the field follows them
     and the traced streets outside run on to meet them; its lanes on foot are drawn and not driven; its buildings
     go to the blocks between its streets once the faces are found (below) */
  let core = null;
  if (c.lat.rho && (c.style === 'eu' || c.style === 'ind') && IC.CITY_CORES && IC.CITY_CORES.length) {
    const hn = [...(c.name || "")].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 100003, 7), hc = k => U.hash(hn, k * 13 + 1), CR = IC.CITY_CORES[Math.floor(hc(1) * IC.CITY_CORES.length)], u = IC.unpackCore(CR);
    const o = F.toW(F.ou, F.ov), wall = [];
    for (let q = 0; q < 48; q++) { const a = q / 48 * Math.PI * 2, rr = F.rho(a); wall.push(F.toW(F.ou + Math.cos(a) * rr, F.ov + Math.sin(a) * rr)); }
    // (the real one's own edge, a little inside it, where its data thins out)
    const rr = CR.r * 10 * 0.96, th = hc(2) * Math.PI * 2, mir = hc(3) < 0.5 ? -1 : 1, ct = Math.cos(th), sn = Math.sin(th);
    const tf = (x, y) => { const X = x * mir / 100, Y = y / 100; return { x: o.x + X * ct - Y * sn, y: o.y + X * sn + Y * ct }; };
    const pip = (P, x, y) => { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; };
    const inCore = (x, y) => U.dxy(x, y, o.x, o.y) < rr && pip(wall, x, y);
    core = { CR, u, o, rr, tf, inCore, walks: [], m: [mir / 100, ct, sn] };
    for (const s of u.streets) {
      let run = [];
      const flush = () => { if (run.length >= 2) { if (s.c === 0) core.walks.push(run); else addSt({ cls: 'st', pts: run, core: true, stop: 3, pad: 0.05 }, 'st'); } run = []; };
      for (let i = 0; i < s.p.length; i += 2) {
        if (Math.hypot(s.p[i], s.p[i + 1]) >= rr * 100) { flush(); continue; }   // (tf keeps distances from the middle, in 1/100)
        const p = tf(s.p[i], s.p[i + 1]); if (inCore(p.x, p.y) && !W.inLake(p.x, p.y)) run.push(p); else flush();
      }
      flush();
    }
  }
  const clearAt = (x, y) => !blocked(x, y);   // (in town and nothing in the way)
  if (bw) {
    // the diagonal, across the whole grid; squares where it crosses the avenues near the middle
    let run = [], best = [];
    for (let v = -n * SP; v <= n * SP; v += SP / 2) {
      const u = bw.u0 + (v - bw.v0) * bw.sl, p = F.toW(u, v);
      if (cellAt(u, v) && clearAt(p.x, p.y)) run.push(p); else { if (run.length > best.length) best = run; run = []; }
    }
    if (run.length > best.length) best = run;
    if (best.length >= 8) {
      addSt({ cls: 'art', pts: best, radial: true, diag: true }, 'diag');
      const X = [];
      for (let q = 1; q < best.length - 1; q += 3) { const p = best[q]; if (U.dist(p, c) < R2 * 0.55) X.push(p); }
      X.sort((a, b) => U.dist(a, c) - U.dist(b, c));
      const picked = [];
      for (const p of X) { if (picked.length >= 5) break; if (picked.some(o => U.dist(o, p) < SP * 2.5)) continue; picked.push(p); square(p.x, p.y, 1.5, 1.1, FL.ang(p.x, p.y)); }
    }
  }
  if (st.diag) {
    // diagonal avenues out from the centre, where no road already runs on one
    const used2 = (ave && ave.diag) || [];
    const dirs = R.shuffle([0, 1, 2, 3].map(k => c.grid + Math.PI / 4 + k * Math.PI / 2 + R.range(-0.12, 0.12)));
    for (const a of dirs) {
      if (used2.length >= st.diag) break;
      if (used2.some(b => Math.abs(U.angWrap(a - b)) < 0.6)) continue;
      const pts = [];
      for (let d = SP * 2.6; d < R2; d += SP / 2) { const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!inTown(x, y) || !clearAt(x, y)) break; pts.push({ x, y }); }
      if (pts.length >= 6) { addSt({ cls: 'art', pts, radial: true, diag: true }, 'diag'); used2.push(a); }
    }
  }
  if (st.stars && T > 200) {
    // stars: squares out in the city where five boulevards meet
    const got = [];
    for (let t = 0; t < 80 && got.length < (T > 450 ? st.stars : 1); t++) {
      const a = R.range(0, 7), d = ext(a) * R.range(0.55, 0.75), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (!inTown(x, y) || !clearAt(x, y) || F.inOld(...F.toG(x, y), SP) || got.some(g => U.dxy(g.x, g.y, x, y) < ext(a) * 0.5)) continue;
      if (nearest(Bk, x, y, SP).d < SP * 0.8) continue;
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
        if (pts.length >= 3) addSt({ cls: 'art', pts, radial: true, star: true }, 'art');
      }
      square(x, y, 2.2, 2.2, 0, true);
    }
  }
  /* a long park of whole blocks (New York), a great square in the middle (the enemy's towns), the market square */
  const openCells = (i0, j0, w, h, keep) => {
    const L = []; for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) { const x = i >= -n && j >= -n && i < n && j < n && isCell.get(idx(i, j)); if (!x || x.old || x.d === 'rail') return false; L.push(x); }
    const rc = rectOf(F.toW(i0 * SP, j0 * SP), F.toW((i0 + w) * SP, j0 * SP), F.toW(i0 * SP, (j0 + h) * SP), F.toW((i0 + w) * SP, (j0 + h) * SP), 0.7);
    keep(rc); return true;
  };
  if (st.cpark && T > 150) {
    const len = U.clamp(Math.round(T / 90), 3, 7), sg = F.ov > 0 ? -1 : 1;
    for (let t = 0; t < 12; t++) {
      const i0 = R.int(-2, 1), j0 = sg > 0 ? R.int(1, 3) : -R.int(1, 3) - len + 1;
      if (openCells(i0, j0, 2, len, rc => { parksL.push({ x: rc.x, y: rc.y, rx: rc.w / 2, ry: rc.h / 2, a: rc.a, rect: true }); parkRects.push(rc); rasClear(rc); })) break;
    }
  }
  if (st.square) openCells(-1, -1, 2, 2, rc => square(rc.x, rc.y, rc.w, rc.h, rc.a));
  if (c.lat.rho && !core) { const o = F.toW(F.ou, F.ov); if (inTown(o.x, o.y) && !blocked(o.x, o.y)) square(o.x, o.y, 1.3, 1.0, FL.ang(o.x, o.y)); }
  FL.n = -1;   // (the field's lines changed)
  const FLD = IC.cityField(c);
  /* the ring road, a grid's downtown loop and a boulevard city's ring boulevard, traced on the field: a loop of
     avenues with square corners in a grid city, a ring in a radial one; the radial high roads out */
  const bypass = W.edges && W.edges.some(e => e.bypass === c.id);
  const bridges = { n: 0, cap: c.pop > 500 ? 4 : c.pop > 200 ? 3 : 2 };
  const ringAt = (rad, cls, flags, gapOk) => {
    const seeds = []; for (let q = 0; q < 12; q++) { const a = q / 12 * Math.PI * 2 + 0.1, rr = rad(a); seeds.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr }); }
    const L = IC.fabricRound(FLD, c, { seeds, rad, blocked: (x, y) => { const b = blocked(x, y); return b === 'water' && gapOk ? 0 : b === 2 && U.dxy(x, y, c.x, c.y) < SP * 3 ? 0 : b; }, run: SP * 0.7, hyst: 0.02 });
    for (const l of L) if (l.pts.length > 6) addSt(Object.assign({ cls, pts: l.pts, ring: l.closed }, flags), cls === 'ring' ? 'ring' : 'art');
    return L.length;
  };
  if ((c.capital && c.style !== 'east') || (st.loop && c.pop > 380) || (c.style === 'eu' && c.pop > 700) || (st.ring2 && c.pop > 300) || (st.peri && c.pop > 300 && !bypass)) {
    // (the ring motorway of a boulevard city runs at its edge, over the old fortifications)
    const kr = st.peri ? 0.9 : c.style === 'us' ? 0.62 : 0.72;
    ringAt(a => ext(a) * kr, 'ring', {}, false);
  }
  if (st.loop && T > 150) { const L = (T > 400 ? 2.2 : 1.3) * SP; ringAt(() => L, 'art', { loop: true }, false); }
  if (st.blvd && T > 120) { const extS = a => { let t = 0; for (let k = -3; k <= 3; k++) t += ext(a + k * 0.22); return t / 7; }; ringAt(a => Math.max(extS(a) * 0.5, c.lat.rho ? F.rho(a) + SP * 1.5 : 0), 'art', { blvd: true }, false); }
  if (st.radials && c.pop > 150) {
    // high roads out, where no road already comes in that way
    const ins = roads.filter(s => s[4] !== 'rail' && U.segDist(c.x, c.y, s[0], s[1], s[2], s[3]) < SP).map(s => { const far = U.dxy(s[0], s[1], c.x, c.y) > U.dxy(s[2], s[3], c.x, c.y) ? [s[0], s[1]] : [s[2], s[3]]; return Math.atan2(far[1] - c.y, far[0] - c.x); });
    const a0 = R.range(0, 7), seeds = [];
    for (let q = 0; q < st.radials; q++) {
      const a = a0 + q * Math.PI * 2 / st.radials + R.range(-0.2, 0.2);
      if (ins.some(b => Math.abs(U.angWrap(a - b)) < 0.45)) continue;
      const d0 = c.lat.rho ? F.rho(a) * 0.98 : SP;
      seeds.push({ x: c.x + Math.cos(a) * d0, y: c.y + Math.sin(a) * d0 });
    }
    const L = IC.fabricRound(FLD, c, { seeds, radial: true, rad: a => ext(a) * 0.92, blocked, run: SP, hyst: 0.3, join: 1.2, meet: (x, y) => { const q = nearest(Bk, x, y, 0.5, s => s[4] !== 'art' && s[4] !== 'ring'); return q.d < 0.5 ? q : null; } });
    for (const l of L) if (l.pts.length >= 4) addSt({ cls: 'art', pts: l.pts, radial: true }, 'art');
  }
  /* parks: cells of housing that stay green */
  const parkCells = new Set();
  let parksLeft = st.parks + (c.capital ? 2 : 0) + Math.round(c.pop / 600);
  for (const x of cells) { if (parksLeft <= 0) break; if ((x.d === 'dense' || x.d === 'sub') && !x.old && U.hash(x.i * 31 + 7, x.j * 17 + 1) < (st.parks > 4 ? 0.1 : 0.06)) { parkCells.add(x.k); parksLeft--; } }
  /* the streets: the arterials first, then the side streets between them, both families, traced on the field */
  // (the avenues are among the road pieces now, as 'art')
  const roadLines = roads.filter(s => s[4] !== 'rail').map(s => ({ pts: [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }], seed: s[4] === 'art' }));
  const cross = (x, y, dx, dy, fam) => {
    // a bridge: an arterial crosses the river where the far bank is near, up to the city's few
    if (bridges.n >= bridges.cap) return null;
    const pts = []; let L = 0;
    for (let d = 0.5; d < 14; d += 0.5) { const px = x + dx * d, py = y + dy * d; pts.push({ x: px, y: py }); L = d; if (wetBy(px, py) <= -1.0 && !W.inLake(px, py)) { if (blocked(px, py)) return null; bridges.n++; return pts; } }
    return null;
  };
  // (seeds at the centre and in a ring round it, so a town whose centre is a square, with no road or ring to seed
  // from, is still traced)
  const seeds0 = [{ x: c.x, y: c.y, fam: 0 }, { x: c.x, y: c.y, fam: 1 }];
  for (let k = 0; k < 8; k++) for (const rr of [SP * 2.5, c.r * 0.5]) { const a = k / 8 * Math.PI * 2 + c.grid; seeds0.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, fam: 0 }, { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, fam: 1 }); }
  for (const l of streets) if (l.ring || l.radial) { const m = l.pts[l.pts.length >> 1]; seeds0.push({ x: m.x, y: m.y, fam: 0 }, { x: m.x, y: m.y, fam: 1 }); }
  const base = { fld: FLD, blocked, cross, box: [rx0, ry0, rx0 + rn * RES, ry0 + rn * RES] };
  const arts = IC.fabricTrace(Object.assign({}, base, { lines: streets.map(l => ({ pts: l.pts, seed: true })).concat(roadLines), seeds: seeds0, dsep: (x, y, fam) => sizeAt(x, y, fam) * IC.FABRIC.art, maxLen: 200, cell: 4, step: 0.6 }));
  for (const l of arts) streets.push({ cls: 'art', pts: l.pts, ends: l.ends, br: l.br });
  // the collectors (brief 66): a wider street with a centre line midway between two arterials, gathering the side
  // streets' traffic for them, as in a real town's hierarchy (arterial, collector, local street)
  const cols = IC.fabricTrace(Object.assign({}, base, { lines: streets.map(l => ({ pts: l.pts, seed: true })).concat(roadLines), seeds: seeds0, dsep: (x, y, fam) => sizeAt(x, y, fam) * IC.FABRIC.col, maxLen: 120, cell: 2, cross: null }));
  for (const l of cols) if (U.dist(l.pts[0], l.pts[l.pts.length - 1]) > sizeAt(l.pts[0].x, l.pts[0].y, 0) * 2.5) streets.push({ cls: 'col', pts: l.pts, ends: l.ends });
  const locals = IC.fabricTrace(Object.assign({}, base, { lines: streets.map(l => ({ pts: l.pts, seed: true })).concat(roadLines), seeds: seeds0, dsep: sizeAt, maxLen: 60, cross: null, cell: 1 }));
  for (const l of locals) streets.push({ cls: 'st', pts: l.pts, ends: l.ends });
  // a street that met nothing ends in a turning head; one run across the water carries a bridge
  // (a bridge is kept as the two banks it joins, so the street's points may change under it)
  for (const l of streets) {
    if (l.ends) { const hd = l.ends.map(e => HEAD_AT[e.to] ? 1 : 0), sp = l.ends.map(e => STOP_AT[e.to] ? 1 : 0); if (hd[0] || hd[1]) l.head = hd[0] + hd[1] * 2; if (sp[0] || sp[1]) l.stop = sp[0] + sp[1] * 2; l.ring = l.ends[1].to === 'loop' || l.ring; }
    if (l.br) { l.br = l.br.map(([a, b]) => [l.pts[a].x, l.pts[a].y, l.pts[b].x, l.pts[b].y]); if (!l.br.length) delete l.br; }
  }
  /* the blocks: the faces of the net (streets, avenues, roads, and the city's edge, the banks and the shores as
     lines nothing draws), each with the rectangle that fits it, set back from the kerbs */
  const faceLines = [], SW = IC.ROAD_SPEC;
  // (streets and avenues set back to the real corridor from building line to building line, brief 65)
  const RFab = IC.REAL_FABRIC, stPad = Math.max(SW.st.w / 2 + 0.03, RFab.corSt / 2), artPad = Math.max(SW.art.w / 2 + 0.03, RFab.corArt / 2);
  const hw2 = { hw: 1.25, rd: SW.rd.w / 2 + 0.2, lc: SW.lc.w / 2 + 0.2, sp: SW.sp.w / 2 + 0.15, art: artPad, col: stPad + (SW.col.w - SW.st.w) / 2, rail: 0.6, ring: SW.ring.w / 2 + 0.3 };
  for (const l of streets) {
    const pts = l.pts.slice();
    // the virtual tail of a street to what stopped it, so the face closes
    if (l.ends) for (const end of [0, 1]) {
      const e = l.ends[end], p = end ? pts[pts.length - 1] : pts[0], q = end ? pts[pts.length - 2] : pts[1]; if (!q || e.to === 'line' || e.to === 'loop') continue;
      const L = U.dist(p, q) || 1, ux = (p.x - q.x) / L, uy = (p.y - q.y) / L;
      let ex = e.to === 'hw' ? 1.6 : e.to === 'water' ? rivW + 2.5 : e.to === 'field' ? 1.5 : 0.6;
      // (at the city's edge: just past the side of the last cell, wherever the line leaves it)
      if (e.to === 'edge' || e.to === 'turn' || e.to === 'long') { const [u0, v0] = F.toG(p.x, p.y), i0 = Math.floor(u0 / SP), j0 = Math.floor(v0 / SP); ex = 0.3; for (let d = 0.1; d <= 2.5; d += 0.1) { const [u, v] = F.toG(p.x + ux * d, p.y + uy * d); if (Math.floor(u / SP) !== i0 || Math.floor(v / SP) !== j0) { ex = d + 0.08; break; } } }
      const t = { x: p.x + ux * ex, y: p.y + uy * ex }; if (end) pts.push(t); else pts.unshift(t);
    }
    faceLines.push({ pts, w: l.pad || hw2[l.cls] || stPad, l });
  }
  for (const s of roads) faceLines.push({ pts: [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }], w: hw2[s[4]] || 0.4, road: s[4] });
  for (const s of rivSegs) faceLines.push({ pts: [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }], w: s[4] + 1.2, virt: true });
  for (const f of fields) { const pts = []; for (let q = 0; q <= 24; q++) pts.push({ x: f.x + Math.cos(q / 24 * Math.PI * 2) * f.r, y: f.y + Math.sin(q / 24 * Math.PI * 2) * f.r }); faceLines.push({ pts, w: 0.5, virt: true }); }
  for (const l of W.lakes) { if (U.dxy(l.x, l.y, c.x, c.y) > RMAX * 1.4 + Math.max(l.rx, l.ry)) continue; const pts = []; for (let q = 0; q <= 32; q++) { const a = q / 32 * Math.PI * 2, X = Math.cos(a) * l.rx, Y = Math.sin(a) * l.ry; pts.push({ x: l.x + X * Math.cos(l.rot) - Y * Math.sin(l.rot), y: l.y + X * Math.sin(l.rot) + Y * Math.cos(l.rot) }); } faceLines.push({ pts, w: 1, virt: true }); }
  const rectPoly = q => { const ca = Math.cos(q.a), sa = Math.sin(q.a), P = []; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) P.push({ x: q.x + u * q.w / 2 * ca - v * q.h / 2 * sa, y: q.y + u * q.w / 2 * sa + v * q.h / 2 * ca }); return P; };
  for (const q of squaresAt) faceLines.push({ pts: rectPoly(q), w: 0.15, virt: true });
  for (const q of parkRects) faceLines.push({ pts: rectPoly(q), w: 0.2, virt: true });
  // the city's edge: the sides of its cells with nothing built beyond them
  for (const x of cells) for (const [di, dj, e0, e1] of [[1, 0, [1, 0], [1, 1]], [-1, 0, [0, 0], [0, 1]], [0, 1, [0, 1], [1, 1]], [0, -1, [0, 0], [1, 0]]]) {
    if (cellAt((x.i + di + 0.5) * SP, (x.j + dj + 0.5) * SP)) continue;
    faceLines.push({ pts: [F.toW((x.i + e0[0]) * SP, (x.j + e0[1]) * SP), F.toW((x.i + e1[0]) * SP, (x.j + e1[1]) * SP)], w: 0.25, virt: true });
  }
  const faces = IC.fabricFaces(faceLines);
  const blocks = [];
  const mkBlock = (x, rc, form, extraP) => {
    const D2 = IC.DISTRICTS[x.d];
    const b = Object.assign({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a, d: x.d, f: form, core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i: x.i, j: x.j }, extraP || {});
    // (an interchange keeps its footprint: brief 56)
    if (IC.ixClear && IC.ixClear(W, rc.x, rc.y, Math.max(rc.w, rc.h) * 0.35, ixs)) return null;
    blocks.push(b); return b;
  };
  const realFaces = [];
  for (const fc of faces) {
    if (core && core.inCore(fc.x, fc.y)) { realFaces.push(fc); continue; }
    const x = cellXY(fc.x, fc.y);
    if (!x || fc.area < 0.4) continue;
    if (squaresAt.some(q => inRect(q, fc.x, fc.y, 0)) || parkRects.some(q => inRect(q, fc.x, fc.y, 0))) continue;
    if (W.inLake(fc.x, fc.y) || wetBy(fc.x, fc.y) > -0.5) continue;
    const old = x.d === 'old', sz = Math.max(szOf(x.d, 0), szOf(x.d, 1)) * sizeK;
    const rc = IC.fabricRect(fc, old ? 0.4 : x.d === 'biz' || x.d === 'dense' ? 0.5 : 0.65);
    if (!rc) continue;
    if (parkCells.has(x.k)) { parksL.push({ x: rc.x, y: rc.y, rx: rc.w * 0.48, ry: rc.h * 0.46, a: rc.a }); continue; }
    // a face the streets left too large is several blocks with lanes between
    const parts = rc.w > sz * 1.8 || rc.h > sz * 1.8 ? IC.fabricSplit(rc, sz, 0.3) : [rc];
    let art = false; for (const li of fc.lines) { const fl = faceLines[li]; if ((fl.l && fl.l.cls === 'art') || fl.road === 'art' || fl.road === 'rd') { art = true; break; } }
    for (const p of parts) {
      if (x.d === 'rail') { mkBlock(x, p, 'yard'); continue; }
      mkBlock(x, p, old ? 'old' : formFor(c, st, { i: x.i, j: x.j, d: x.d, q: x.q, park: x.park, art }), old ? { fine: true } : null);
    }
  }
  if (core) realBlocks(c, core, realFaces, cellXY, mkBlock, parksL, squares, roads);
  c.streets = streets; c.blocks = blocks; c.parks = parksL; c.squares = squares;
  if (core) c.walks = core.walks; else delete c.walks;
  closeStreets(c, blocks);
  houseStreets(c, blocks);
  // what could not be tied, and has no head of its own, is a stub: take it away, and tie again, since an end that
  // stood on it is loose now (a few rounds settle it)
  const tieSegs = roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'), hwSegs = roads.filter(s => s[4] === 'hw');
  for (let round = 0; round < 4; round++) {
    const n = c.streets.length;
    for (const l of c.streets) delete l.deadEnd;
    tieStreets(c, tieSegs, SP, hwSegs);
    c.streets = c.streets.filter(l => !l.deadEnd || l.ring || l.head || l.stop);
    if (c.streets.length === n) break;
  }
  // a street that strays into an interchange's footprint (a ring street laid across it) is cut at its edge (brief 56)
  if (IC.ixClear) {
    const out = [];
    for (const l of c.streets) {
      if (l.cls === 'art' || l.cul || !l.pts.some(p => IC.ixClear(W, p.x, p.y, 0.3, ixs))) { out.push(l); continue; }   // (a close stays whole: its estate keeps out by itself)
      const headP = l.head ? l.pts[l.head & 1 ? 0 : l.pts.length - 1] : null;
      let run = [], cutA = false;   // (the end a cut makes stops at the interchange's edge, like one at a bank)
      const flush = cutB => { if (run.length >= 2) { const m = Object.assign({}, l, { pts: run, cut: true }); if (headP && !run.includes(headP)) delete m.head; const sp = (cutA ? 1 : 0) + (cutB ? 2 : 0); if (sp) m.stop = (m.stop || 0) | sp; out.push(m); } run = []; cutA = true; };
      for (const p of l.pts) { if (IC.ixClear(W, p.x, p.y, 0.3, ixs)) flush(true); else run.push(p); }
      flush(false);
    }
    c.streets = out;
  }
  for (const l of c.streets) { if (l.deadEnd) delete l.deadEnd; delete l.ends; }
  tidyStreets(c, roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'));
  roundCorners(c, roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'));
  dropIslands(c, roads.filter(s => s[4] !== 'hw' && s[4] !== 'rail'));
  // an end the passes left a few metres short of a street or road is run on to meet it, square onto it; one that meets
  // nothing turns round in a head of its own, so a car is never left in the grass (a motorway or a railway is not
  // met at grade: an end beside one turns round too)
  {
    const Bk = buckets(3); c.streets.forEach((l, li) => { for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, li]); });
    for (const r of roads) Bk.add([r[0], r[1], r[2], r[3], r[4] === 'hw' || r[4] === 'rail' ? -2 : -1]);
    c.streets.forEach((l, li) => { if (l.ring) return; for (const end of [0, 1]) {
      // (a turning head or an end at a bank or a square stays, unless a street is right there after all)
      const meant = (l.head & (end + 1)) || (l.stop & (end + 1)), R = meant ? 0.15 : 0.4;
      const e = l.pts[end ? l.pts.length - 1 : 0]; let best = null, bd = R;
      Bk.near(e.x, e.y, R, s => { if (s[4] === li) return; const d = U.segDist(e.x, e.y, s[0], s[1], s[2], s[3]); if (d < bd) { bd = d; best = s; } });
      if (best && bd < 0.003) continue;
      if (best && best[4] !== -2) {
        const vx = best[2] - best[0], vy = best[3] - best[1], LL = vx * vx + vy * vy, t = LL ? U.clamp(((e.x - best[0]) * vx + (e.y - best[1]) * vy) / LL, 0, 1) : 0;
        let q = { x: best[0] + vx * t, y: best[1] + vy * t };
        // (straight on along its own line where that meets it soon, rather than a sharp turn onto it)
        const f = l.pts[end ? l.pts.length - 2 : 1];
        if (f) {
          const dx = e.x - f.x, dy = e.y - f.y, dl = Math.hypot(dx, dy) || 1, den = (dx / dl) * vy - (dy / dl) * vx;
          if (Math.abs(den) > 1e-6) {
            const s = ((best[0] - e.x) * vy - (best[1] - e.y) * vx) / den, u = ((best[0] - e.x) * (dy / dl) - (best[1] - e.y) * (dx / dl)) / den;
            if (s > 0 && s < 0.5 && u >= 0 && u <= 1) q = { x: e.x + dx / dl * s, y: e.y + dy / dl * s };
          }
        }
        // (onto a corner or crossing within 12 m rather than a few metres beside it, too short a piece for two cars)
        for (const k of [0, 2]) if (U.dxy(q.x, q.y, best[k], best[k + 1]) < 0.12) q = { x: best[k], y: best[k + 1] };
        if (end) l.pts.push(q); else l.pts.unshift(q);
        if (l.head & (end + 1)) l.head &= ~(end + 1);
        if (l.stop & (end + 1)) l.stop &= ~(end + 1);
        continue;
      }
      if (!meant) l.head = (l.head || 0) | (end + 1);
    } });
  }
  c.ext = blocks.reduce((m, b) => Math.max(m, U.dist(b, c) + Math.max(b.w, b.h) / 2), 0);
  // river parks (brief 55): the housing blocks on the banks of a bigger town stay green, a park along the water
  if (c.pop >= 250) {
    let left = 10;
    c.blocks = c.blocks.filter(b => { if (left <= 0 || b.fr || (b.d !== 'dense' && b.d !== 'sub') || b.land || b.close || b.res || wetBy(b.x, b.y) < -(Math.max(b.w, b.h) / 2 + 0.4)) return true; parksL.push({ x: b.x, y: b.y, rx: b.w * 0.48, ry: b.h * 0.46, a: b.a, river: true }); left--; return false; });
  }
  // landmarks (brief 55, buildings.js): the station on the railway, the cathedral, the hospital, the stadium...
  IC.placeLandmarks(W, c, roads);
  c.mix = IC.cityMix(c);
  return c;
};

/* the blocks of a real old town (brief 65): every face of its streets that has buildings in it is a block of its
   own shape (b.pg, the face set back from its streets, in the block's frame) holding those buildings (b.rb, their
   footprints in the block's frame); a small face with none is a square, a larger one a garden */
function realBlocks(c, core, faces, cellXY, mkBlock, parksL, squares, roads) {
  const B = 2, cellsF = new Map(), key = (i, j) => i * 100000 + j, RB = buckets(2);
  for (const r of roads) if (r[4] !== 'st' && r[4] !== 'col' && r[4] !== 'rail') RB.add(r);
  faces.forEach((f, k) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of f.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    f.bl = []; f.bb = [x0, y0, x1, y1];
    for (let i = Math.floor(x0 / B); i <= Math.floor(x1 / B); i++) for (let j = Math.floor(y0 / B); j <= Math.floor(y1 / B); j++) { const q = key(i, j); let L = cellsF.get(q); if (!L) cellsF.set(q, L = []); L.push(k); }
  });
  const pip = (P, x, y) => { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; };
  const bld = core.u.bld, mid = core.u.mid, R2 = (core.rr * 100) ** 2, TM = core.m;
  for (let q = 0; q < bld.length; q++) {
    // (the middle first: most of a sample's buildings lie outside the town's old town and are never turned)
    const fp = bld[q], mx = mid[q * 2], my = mid[q * 2 + 1];
    if (mx * mx + my * my >= R2) continue;
    const X = mx * TM[0], Y = my / 100, cx = core.o.x + X * TM[1] - Y * TM[2], cy = core.o.y + X * TM[2] + Y * TM[1];
    const L = cellsF.get(key(Math.floor(cx / B), Math.floor(cy / B))); if (!L || !core.inCore(cx, cy)) continue;
    for (const k of L) if (cx >= faces[k].bb[0] && cx <= faces[k].bb[2] && cy >= faces[k].bb[1] && cy <= faces[k].bb[3] && pip(faces[k].poly, cx, cy)) { const P = []; for (let i = 0; i < fp.length; i += 2) P.push(core.tf(fp[i], fp[i + 1])); faces[k].bl.push(P); break; }
  }
  // a polygon set back from each edge by its own distance (the street's half width and pavement)
  const inset = (P, pads) => {
    let A = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; A += p.x * q.y - q.x * p.y; }
    const s = A > 0 ? 1 : -1, n = P.length, L = [];
    for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], d = U.dist(p, q) || 1e-6, nx = -(q.y - p.y) / d * s, ny = (q.x - p.x) / d * s, w = Math.min(pads[i] || 0, 0.12); L.push([p.x + nx * w, p.y + ny * w, (q.x - p.x) / d, (q.y - p.y) / d]); }
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = L[(i + n - 1) % n], b = L[i], den = a[2] * b[3] - a[3] * b[2];
      if (Math.abs(den) < 0.05) { out.push({ x: b[0], y: b[1] }); continue; }
      const t = ((b[0] - a[0]) * b[3] - (b[1] - a[1]) * b[2]) / den;
      out.push(Math.abs(t) > 0.6 ? { x: b[0], y: b[1] } : { x: a[0] + a[2] * t, y: a[1] + a[3] * t });
    }
    return out;
  };
  for (const f of faces) {
    if (!f.bl.length) {
      // (an open face: a paved square if it is small, a garden if not)
      if (f.area < 0.03) continue;
      const rc = IC.fabricRect(f, 0.1); if (!rc) continue;
      if (f.area < 0.3) squares.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, a: rc.a }); else parksL.push({ x: rc.x, y: rc.y, rx: rc.w * 0.48, ry: rc.h * 0.46, a: rc.a });
      continue;
    }
    // the block's frame: along the face's longest edge, its box round the face
    let a = 0, bl = -1; for (let i = 0; i < f.poly.length; i++) { const p = f.poly[i], q = f.poly[(i + 1) % f.poly.length], d = U.dist(p, q); if (d > bl) { bl = d; a = Math.atan2(q.y - p.y, q.x - p.x); } }
    const G = inset(f.poly, f.pads), ca = Math.cos(a), sa = Math.sin(a), loc = p => [(p.x - f.x) * ca + (p.y - f.y) * sa, -(p.x - f.x) * sa + (p.y - f.y) * ca];
    // (where one of the real town's streets runs close beside a road of ours, the block stands back from the road too)
    for (const q of G) RB.near(q.x, q.y, 0.4, r => {
      const w = Math.max(HALF[r[4]] || 0.2, 0.15) + 0.01, vx = r[2] - r[0], vy = r[3] - r[1], L = vx * vx + vy * vy, t = L ? U.clamp(((q.x - r[0]) * vx + (q.y - r[1]) * vy) / L, 0, 1) : 0;
      const px = r[0] + vx * t, py = r[1] + vy * t, d = Math.hypot(q.x - px, q.y - py);
      if (d >= w) return;
      // (out from the road's line, on the block's side of it: a corner on the line itself goes towards the face's middle)
      let nx = q.x - px, ny = q.y - py;
      if (d < 1e-4) { const l = Math.sqrt(L) || 1; nx = -vy / l; ny = vx / l; if (nx * (f.x - px) + ny * (f.y - py) < 0) { nx = -nx; ny = -ny; } } else { nx /= d; ny /= d; }
      q.x = px + nx * w; q.y = py + ny * w;
    });
    // (a face a road runs right through, where the real town's streets did not close round it, is left empty; one a
    // road only runs close beside keeps its buildings clear of the road, brief 68)
    let cross = false; const near = [];
    const edgeD = (x, y) => { let m = 1e9; for (let i = 0; i < G.length; i++) { const p = G[i], q = G[(i + 1) % G.length]; m = Math.min(m, U.segDist(x, y, p.x, p.y, q.x, q.y)); } return m; };
    let gx0 = 1e9, gy0 = 1e9, gx1 = -1e9, gy1 = -1e9; for (const p of G) { gx0 = Math.min(gx0, p.x); gy0 = Math.min(gy0, p.y); gx1 = Math.max(gx1, p.x); gy1 = Math.max(gy1, p.y); }
    RB.near((gx0 + gx1) / 2, (gy0 + gy1) / 2, Math.max(gx1 - gx0, gy1 - gy0) / 2 + 0.3, r => {
      if (cross || near.includes(r)) return;
      const w = Math.max(HALF[r[4]] || 0.2, 0.15);
      if (U.segDist((gx0 + gx1) / 2, (gy0 + gy1) / 2, r[0], r[1], r[2], r[3]) > Math.max(gx1 - gx0, gy1 - gy0) * 0.75 + w) return;
      near.push(r);
      for (const t of [0, 0.5, 1]) { const x = r[0] + (r[2] - r[0]) * t, y = r[1] + (r[3] - r[1]) * t; if (pip(G, x, y) && edgeD(x, y) > w + 0.05) { cross = true; return; } }
    });
    if (cross) continue;
    // (a building the face's own streets run through is left out: the real town's street was where this one is not;
    // so is one on a road of ours beside it)
    const inG = q => q.x >= gx0 && q.x <= gx1 && q.y >= gy0 && q.y <= gy1 && pip(G, q.x, q.y);
    const onRoad = q => near.some(r => U.segDist(q.x, q.y, r[0], r[1], r[2], r[3]) < Math.max(HALF[r[4]] || 0.2, 0.15) + 0.01);
    f.bl = f.bl.filter(P => { const need = Math.ceil(P.length * 0.5 - 1e-9); let k = 0; for (let i = 0; i < P.length && k < need && k + P.length - i >= need; i++) if (inG(P[i])) k++; return k >= need && !P.some(onRoad); });
    if (!f.bl.length) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of G.concat(...f.bl)) { const [u, v] = loc(p); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, X = f.x + mx * ca - my * sa, Y = f.y + mx * sa + my * ca;
    const fr = p => { const [u, v] = loc(p); return [Math.round((u - mx) * 1000) / 1000, Math.round((v - my) * 1000) / 1000]; };
    const x = cellXY(f.x, f.y) || { d: 'old', i: 0, j: 0 };
    const ex = { fine: true, pg: [].concat(...G.map(fr)), rb: f.bl.map(P => [].concat(...P.map(fr))) };
    // (the outline still reaching onto a road beside it: left empty, as before brief 68)
    if (near.length) { const Bk = buckets(4); for (const r of near) Bk.add(r); if (rectHit(Bk, Object.assign({ x: X, y: Y, w: x1 - x0, h: y1 - y0, a }, ex), -0.05)) continue; }
    if (near.length) ex.rd = near.map(r => [...fr({ x: r[0], y: r[1] }), ...fr({ x: r[2], y: r[3] }), Math.round((Math.max(HALF[r[4]] || 0.2, 0.15) + 0.01) * 1000) / 1000]);
    mkBlock(Object.assign({}, x, { d: 'old' }), { x: X, y: Y, w: x1 - x0, h: y1 - y0, a }, 'real', ex);
  }
}

/* the field of a city (cityfabric.js): its grid and radial by style, bent by the style's warp, following the roads,
   avenues and railways near it and its river's banks. c.fld is plain data, so a save keeps it. */
function fieldOf(W, c, roads, RMAX) {
  const st = styleOf(c), F = IC.cityFrame(c);
  const grid = { eu: 0.45, us: 1.2, new: 0.9, ind: 0.8, east: 1.2 }[c.style] || 0.6, tplG = { chi: 1.3, ny: 1.3, dxb: 1.2, lon: 0.3, par: 0.5 }[c.tpl];
  const wr = c.tpl === 'lon' ? 1.2 : c.tpl === 'par' ? 1.0 : c.style === 'eu' ? 0.7 : 0;
  const o = F.L.rho ? F.toW(F.ou, F.ov) : null;
  const lines = [];
  for (const s of roads) lines.push([s[0], s[1], s[2], s[3], s[4]]);
  for (const r of W.rivers) { if (r.bb[0] > c.x + RMAX * 1.4 || r.bb[2] < c.x - RMAX * 1.4 || r.bb[1] > c.y + RMAX * 1.4 || r.bb[3] < c.y - RMAX * 1.4) continue; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(c.x, c.y, a[0], a[1], b[0], b[1]) < RMAX * 1.3) lines.push([a[0], a[1], b[0], b[1], 'river']); } }
  c.fld = { x: c.x, y: c.y, a: c.grid || 0, wg: tplG || grid, wr, wr1: 0.45, ext: Math.max(RMAX, 10), warp: st.warp * 1.2 + (st.outer || 0) * 0.5, wl: st.wl, s: F.L.s, old: o ? { x: o.x, y: o.y, r: F.L.rho } : null, lines };
  delete c._fld;
  return IC.cityField(c);
}

/* ---------- where the country's roads meet a city ----------
   A national road that reaches into the built-up area stops at the city's edge (a gate) and goes on as one of the
   city's own streets: along the lattice line of an avenue (grid plans) or a radial high road or boulevard (radial
   plans), to the centre, where the routing graph keeps the city's node. Roads that come in close together share a
   gate; avenues that meet on the way in join there. A motorway stops short of the town: where two or more reach it,
   a bypass joins them round the edge, and each meets its avenue at an interchange just off the bypass. Villages and
   plants swallowed by the city are tied to it the same way. Roads that only graze the edge are left alone (the
   blocks there give way). Returns the pieces of road near the city, as segments for the street plan. */
const KEY = (i, j) => i * 65536 + j;
function joinRoads(W, c, F, st, bnd, ext, fields, radial, nearCell, R2, FL) {
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
    // an outer piece that would be a stub (under 800 m): its outside node joins the city directly
    const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + U.dist(P[i - 1], P[i]));
    for (const r of dr) { if (r[0] > 0 && cum[r[0]] < 8) r[0] = 0; if (r[1] < n - 1 && cum[n - 1] - cum[r[1]] < 8) r[1] = n - 1; }
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
        if (W.inLake(p.x, p.y) || W.inHome(p.x, p.y) !== (c.home !== false) || fields.some(f => U.dist(f, p) < f.r + 4)) { ok = false; break; }
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
  /* the avenues in: each traced on the field from its gate towards the centre (brief 53: along the grid, turning
     once where it must, straight down a boulevard, round a bend of the river front), laid one by one, each stopping
     where it meets one laid before, so they join as a tree at the centre */
  const pos = new Map(), adj = new Map(), nodeKey = new Map();
  const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { let s = adj.get(p); if (!s) adj.set(p, s = new Set()); s.add(q); } };
  const unlink = (a, b) => { adj.get(a).delete(b); adj.get(b).delete(a); };
  const O = KEY(0, 0); pos.set(O, { x: c.x, y: c.y }); nodeKey.set(O, c.id);
  let rk = 0;
  const newKey = p => { const k = -2e9 - rk++; pos.set(k, { x: p.x, y: p.y }); return k; };
  const laid = [], SM = IC.fabricSamples(2), diagKeys = new Set();
  const lay = (id, p, pts0) => {
    const path = pts0 ? { pts: pts0, hit: 'to' } : IC.fabricPath(FL, p, c, { near: 0.5, run: SP * 0.8, meet: (x, y) => {
      const q = SM.near(x, y, -1, 0.45, -1); if (!q) return null;
      const L = laid[q.id], nn = IC.fabricNearestOn(L.pts, x, y); return { x: nn.x, y: nn.y, ave: q.id, i: nn.i };
    } });
    const k0 = newKey(p); nodeKey.set(k0, id);
    const keys = [k0], P = path.pts, last = P.length - 1;
    let prev = k0;
    for (let i = 1; i < last; i++) { const k = newKey(P[i]); link(prev, k); keys.push(k); prev = k; }
    const h = path.hit;
    if (h === 'to') { link(prev, O); keys.push(O); }
    else if (h && h.ave != null) {
      // it met an avenue laid before: joined to the nearest of its points, or at a new one on it
      const L = laid[h.ave], kA = L.keys[h.i - 1], kB = L.keys[h.i], m = P[last];
      let km;
      if (U.dist(pos.get(kA), m) < 0.3) km = kA; else if (U.dist(pos.get(kB), m) < 0.3) km = kB;
      else { km = newKey(m); unlink(kA, kB); link(kA, km); link(km, kB); L.keys.splice(h.i, 0, km); L.pts.splice(h.i, 0, { x: m.x, y: m.y }); }
      link(prev, km); keys.push(km);
    }
    if (pts0) for (const k of keys) diagKeys.add(k);
    const L = { keys, pts: P.map(q => ({ x: q.x, y: q.y })) }, li = laid.length;
    laid.push(L);
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], n = Math.max(1, Math.ceil(U.dist(a, b) / 0.3)); for (let q = 0; q < n; q++) SM.add(a.x + (b.x - a.x) * q / n, a.y + (b.y - a.y) * q / n, 0, li); }
  };
  const straight = p => { const L = dist(p), n = Math.max(2, Math.ceil(L / (SP / 2))), out = []; for (let q = 0; q <= n; q++) { const t = 1 - q / n; out.push({ x: c.x + (p.x - c.x) * t, y: c.y + (p.y - c.y) * t }); } return out; };
  const ends = plain.map(g => ({ id: g.id, x: g.x, y: g.y, rank: g.rank || 1 }));
  // places the city has swallowed, and junctions still joined to roads outside
  for (const id of new Set(places)) if (id !== c.id && W.nodes[id] && (!W.nodes[id].jct || touch(id))) ends.push({ id, x: W.nodes[id].x, y: W.nodes[id].y, rank: 0 });
  ends.sort((a, b) => b.rank - a.rank || dist(a) - dist(b));
  // (a grid city with diagonal avenues takes a road coming in at a slant straight along one, up to its number of them)
  const diag = [];
  const slant = g => { const [u, v] = F.toG(g.x, g.y), a = Math.abs(Math.atan2(v * F.ay, u * F.ax)) % (Math.PI / 2); return a > 0.4 && a < 1.17; };
  ends.forEach(g => {
    const dg = !radial && st.diag && diag.length < st.diag && g.rank > 0 && slant(g) && !diag.some(b => Math.abs(U.angWrap(b - ang(g))) < 0.6);
    if (dg) diag.push(ang(g));
    lay(g.id, { x: g.x, y: g.y }, dg ? straight(g) : null);
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
      if (!radial && keys.some(q => diagKeys.has(q))) e.diag = true;   // (a diagonal avenue across the grid)
      W.edges.push(e); mine.push(e);
    }
  }
  /* the linear city's spine (brief 56): a motorway along its axis from one side of town to the other, ending on
     the national roads it meets out there (a roundabout each), with an interchange where an avenue crosses it
     every 2 km or so; the other avenues go over it on bridges (W.roadX) */
  if (st.linear) {
    // (beside the centre line, not through the centre: the great road along the axis runs next to it as its
    // frontage road, and the avenues meet the centre at grade as before)
    const o = F.toW(0, SP * 0.6), q1 = F.toW(1, SP * 0.6), dl = Math.hypot(q1.x - o.x, q1.y - o.y) || 1, ux = (q1.x - o.x) / dl, uy = (q1.y - o.y) / dl;
    const ray = t => ({ x: o.x + ux * t, y: o.y + uy * t });
    const split = (e, i, P) => { const id = newNode(P); W.edges.push(Object.assign({}, e, { a: id, b: e.b, pts: [P].concat(e.pts.slice(i)) })); e.pts = e.pts.slice(0, i).concat([P]); e.b = id; return id; };
    // each end: on the national road nearest the end of the axis out there (the road out along the axis, usually),
    // reached by a last leg bending to it
    const endOf = (sg, not) => {
      const t0 = ext(Math.atan2(uy * sg, ux * sg)) + SP * 1.5, A = ray(t0 * sg);
      // a gate on the axis: the road out there carries on as the spine
      const axA = Math.atan2(uy * sg, ux * sg);
      const g = plain.filter(g => !g.hw && Math.abs(U.angWrap(g.a - axA)) < 0.6 && W.nodes[g.id] && !(not && g.id === not.id)).sort((p, q) => Math.abs(U.angWrap(p.a - axA)) - Math.abs(U.angWrap(q.a - axA)))[0];
      // (800 m out along the road, past a gate, so the avenue in from the gate keeps its own line)
      const outAlong = gid => {
        const e = W.edges.find(q => !q.city && q.cls !== 'hw' && !q.spine && (q.a === gid || q.b === gid));
        if (!e) return null;
        const P = e.a === gid ? e.pts : e.pts.slice().reverse(); let s = 0;
        for (let i = 1; i < P.length; i++) {
          s += U.dist(P[i - 1], P[i]);
          if (s >= 8) { const Q = { x: P[i].x, y: P[i].y }, t = (Q.x - o.x) * ux + (Q.y - o.y) * uy; if (i === P.length - 1) return { id: e.a === gid ? e.b : e.a, t, P: Q }; return { id: split(e, e.a === gid ? i : P.length - i, Q), t, P: Q }; }
        }
        const far = e.a === gid ? e.b : e.a, Q = W.nodes[far]; return Q ? { id: far, t: (Q.x - o.x) * ux + (Q.y - o.y) * uy, P: { x: Q.x, y: Q.y } } : null;
      };
      const isGate = id => W.edges.some(q => q.city && (q.a === id || q.b === id));
      if (g) return outAlong(g.id) || { id: g.id, t: ((g.x - o.x) * ux + (g.y - o.y) * uy), P: { x: g.x, y: g.y } };
      // else a national road passing within 3 km of the axis's end: the last leg bends off the axis to it; else
      // the spine ends out there at a roundabout and a link road runs from it to the nearest national road
      const nearest = (Q, lim) => {
        let best = null;
        for (const e of W.edges) {
          if (e.city || e.cls === 'hw' || e.spine || (not && (e.a === not.id || e.b === not.id || e.a === not.linkTo || e.b === not.linkTo))) continue;
          for (let i = 1; i < e.pts.length; i++) {
            const a = e.pts[i - 1], b = e.pts[i], d = U.segDist(Q.x, Q.y, a.x, a.y, b.x, b.y);
            if (d < lim && (!best || d < best.d)) { const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, k = L2 ? U.clamp(((Q.x - a.x) * (b.x - a.x) + (Q.y - a.y) * (b.y - a.y)) / L2, 0, 1) : 0; best = { d, e, i, P: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } }; }
          }
        }
        return best;
      };
      const nodeAt = b => { for (const k of [b.e.a, b.e.b]) if (U.dist(b.P, W.nodes[k]) < 2) return (isGate(k) && outAlong(k)) || { id: k, P: { x: W.nodes[k].x, y: W.nodes[k].y } }; return { id: split(b.e, b.i, b.P), P: b.P }; };
      const near = nearest(A, 30);
      if (near) { const n = nodeAt(near); return { id: n.id, t: t0 * sg, P: n.P }; }
      const endId = newNode(A), far = nearest(A, 120);
      // (the other end does not link to the same road: it finds another, or runs out and stops)
      if (far) { const n = nodeAt(far); W.edges.push({ a: endId, b: n.id, cls: 'rd', pts: [{ x: A.x, y: A.y }, n.P], link: c.id }); return { id: endId, t: t0 * sg, P: A, linkTo: n.id }; }
      return { id: endId, t: t0 * sg, P: A };
    };
    // (a town with one road in: the other end runs out into the country and stops)
    const E0 = endOf(-1), E1 = endOf(1, E0);
    // the avenues across it: an interchange at one in every two kilometres, the rest on bridges
    const cuts = [];
    for (const e of mine) for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], t = U.segX(ray(E0.t).x, ray(E0.t).y, ray(E1.t).x, ray(E1.t).y, a.x, a.y, b.x, b.y);
      if (t >= 0) cuts.push({ t: E0.t + (E1.t - E0.t) * t, e, i });
    }
    cuts.sort((p, q) => p.t - q.t);
    const nodes = [{ id: E0.id, t: E0.t }];
    // (not where the avenue runs from the spine's own end node: that would lay two roads between the same places)
    for (const k of cuts) { if (k.t - nodes[nodes.length - 1].t < 16 || E1.t - k.t < 8 || nodes.some(q => q.id === k.e.a || q.id === k.e.b) || k.e.a === E1.id || k.e.b === E1.id) continue; const P = ray(k.t); nodes.push({ id: split(k.e, k.i, P), t: k.t }); }
    nodes.push({ id: E1.id, t: E1.t });
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i], pts = [], n = Math.max(1, Math.ceil((B.t - A.t) / SP));
      for (let k = 0; k <= n; k++) pts.push(ray(A.t + (B.t - A.t) * k / n));
      // (the ends bend off the axis to the road they end on)
      if (i === 1 && E0.P) pts[0] = { x: E0.P.x, y: E0.P.y };
      if (i === nodes.length - 1 && E1.P) pts[n] = { x: E1.P.x, y: E1.P.y };
      // (a short town whose far end lands on the road its link road reached: the spine takes the link road's place)
      const dup = W.edges.findIndex(e => (e.a === A.id && e.b === B.id) || (e.a === B.id && e.b === A.id));
      if (dup >= 0) { if (W.edges[dup].link !== c.id) continue; W.edges.splice(dup, 1); }
      W.edges.push({ a: A.id, b: B.id, cls: 'hw', pts, spine: c.id });
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
/* a cul-de-sac block's layout (brief 54), in the block's own frame (metres from its centre, x along its width): the
   loop road, the way in, the closes off the loop (each ending in a turning head) and the houses round them; the
   same plan makes the close's streets (closeStreets) and paints its houses (terrain.js), so they agree */
IC.culPlan = function (b) {
  if (b._cp && b._cp.w === b.w && b._cp.h === b.h) return b._cp.P;
  const sd = Math.floor(b.seed), h = (i, j) => U.hash(sd * 3 + i, j * 7 + 1), W2 = b.w / 2, H2 = b.h / 2;
  // (the loop runs a plot and a half in from the block's edge, so the houses outside it back onto the streets round
  // the block and nothing is left as an empty lawn: brief 68)
  const rx = Math.max(W2 * 0.45, W2 - 0.34 - h(1, 2) * 0.08), ry = Math.max(H2 * 0.45, H2 - 0.34 - h(2, 1) * 0.08), ox = (h(3, 3) - 0.5) * (W2 - rx) * 0.6, oy = (h(4, 4) - 0.5) * (H2 - ry) * 0.6, nC = 5 + Math.floor(h(5, 5) * 5);
  const inA = Math.floor(h(6, 6) * 4) * Math.PI / 2, ci = Math.cos(inA), si = Math.sin(inA);
  // (brief 68) the loop is no oval: a rounded box the shape of its block, squarer or rounder by the estate, with a
  // slow wobble, so no two estates are drawn with the same compass
  const sq = 2.2 + h(7, 7) * 2.4, w1 = h(8, 8) * 6.3, w2 = h(9, 9) * 6.3, ring = [];
  const at = t => { const c = Math.cos(t), sn = Math.sin(t), k = 1 + 0.05 * Math.sin(2 * t + w1) + 0.035 * Math.sin(3 * t + w2); return [ox + Math.sign(c) * Math.pow(Math.abs(c), 2 / sq) * rx * k, oy + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / sq) * ry * k]; };
  for (let q = 0; q < 32; q++) ring.push(at(q / 32 * Math.PI * 2));
  ring.push(ring[0].slice());
  const P = { ox, oy, rx, ry, inA, ring, entry: [...at(inA), ox + ci * (W2 + 0.3), oy + si * (H2 + 0.3)], closes: [], houses: null };
  for (let q = 0; q < nC; q++) {
    const a = q / nC * Math.PI * 2 + h(q, 3) * 0.5, out = h(q, 5) < 0.55, L = out ? 0.45 + h(q, 6) * 0.4 : Math.min(rx, ry) * 0.55;
    const [x0, y0] = at(a), x1 = x0 + Math.cos(a) * L * (out ? 1 : -1), y1 = y0 + Math.sin(a) * L * (out ? 1 : -1);
    // (a close is long enough to turn a car round in and to have houses along it: 35 m at least, brief 67)
    if (L < 0.35 || Math.abs(x1) > W2 - 0.2 || Math.abs(y1) > H2 - 0.2 || Math.abs(U.angWrap(a - inA)) < 0.4) continue;
    if (P.closes.some(c => U.segDist(x1, y1, c[0], c[1], c[2], c[3]) < 0.3 || U.segDist(c[2], c[3], x0, y0, x1, y1) < 0.3)) continue;
    P.closes.push([x0, y0, x1, y1, a, out]);
  }
  P.heads = P.closes.map(c => [c[2], c[3]]);
  // a small block has no room for a loop: one close in from the street to a head at its middle
  if (Math.min(b.w, b.h) < 1.7) { P.small = true; P.closes = []; P.ring = null; P.entry = [0, 0, ci * (W2 + 0.3), si * (H2 + 0.3)]; P.heads = [[0, 0]]; }
  b._cp = { w: b.w, h: b.h, P };
  return P;
};
/* the houses of an estate (brief 68): one every 20 m along each street, either side, facing it, none on another
   street, over another house or past the block's edge; five round each turning head. Only the map and the 3D view
   need them, so they are laid out when first drawn */
IC.culHouses = function (b) {
  const P = IC.culPlan(b); if (P.houses) return P.houses;
  const sd = Math.floor(b.seed), h = (i, j) => U.hash(sd * 3 + i, j * 7 + 1), W2 = b.w / 2, H2 = b.h / 2;
  P.houses = [];
  const segs = [], HO = 0.17;
  const lineSegs = L => { for (let q = 1; q < L.length; q++) segs.push([L[q - 1][0], L[q - 1][1], L[q][0], L[q][1]]); };
  if (P.ring) lineSegs(P.ring);
  lineSegs([[P.entry[0], P.entry[1]], [P.entry[2], P.entry[3]]]);
  for (const c of P.closes) lineSegs([[c[0], c[1]], [c[2], c[3]]]);
  const clear = (x, y, r) => Math.abs(x) < W2 - 0.08 && Math.abs(y) < H2 - 0.08 && segs.every(g => U.segDist(x, y, g[0], g[1], g[2], g[3]) > r) && P.heads.every(([hx, hy]) => Math.hypot(x - hx, y - hy) > 0.13) && !P.houses.some(o => Math.hypot(o.x - x, o.y - y) < 0.13);
  const put = (x, y, a, k) => { if (clear(x, y, HO - 0.03)) P.houses.push({ x, y, a, k }); };
  const along = (L, skip) => {
    let carry = 0.1;
    for (let q = 1; q < L.length; q++) {
      const [x0, y0] = L[q - 1], [x1, y1] = L[q], len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      for (let t = carry; t < len; t += 0.2) { const x = x0 + (x1 - x0) * t / len, y = y0 + (y1 - y0) * t / len; if (t / len > skip || q > 1) for (const sg of [-1, 1]) put(x + nx * HO * sg, y + ny * HO * sg, a + (sg > 0 ? 0 : Math.PI), P.houses.length); }
      carry = (carry - len) % 0.2; if (carry < 0) carry += 0.2;
    }
  };
  for (const [hx, hy] of P.heads) for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2 + h(q, 21); put(hx + Math.cos(a) * 0.2, hy + Math.sin(a) * 0.2, a - Math.PI / 2, P.houses.length); }
  if (P.ring) along(P.ring, 0);
  for (const c of P.closes) along([[c[0], c[1]], [c[2], c[3]]], 0.25);
  along([[P.entry[2], P.entry[3]], [P.entry[0], P.entry[1]]], 0.3);
  return P.houses;
};
/* a suburb's closes as streets of the city (brief 54): the loop, its way in from the block's street and each close
   with its turning head, so the traffic drives them and the junctions are drawn like any other */
function closeStreets(c, blocks, roads) {
  const Bk = buckets(3); for (const l of c.streets) for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, l.cls]);
  for (const s of roads || []) Bk.add(s);   // (an outlying estate's way in is from a road)
  for (const b of blocks) {
    if (b.f !== 'cul' || b.w < 1.1 || b.h < 1.1) continue;
    const P = IC.culPlan(b), ca = Math.cos(b.a), sa = Math.sin(b.a), wp = (x, y) => ({ x: b.x + x * ca - y * sa, y: b.y + x * sa + y * ca });
    // the way in meets the nearest street past the block's edge; without one the block keeps its own picture
    const E = wp(P.entry[2], P.entry[3]); let near = null, nd = 1.2;
    Bk.near(E.x, E.y, 1.5, sg => { if (sg[4] === 'sq' || sg[4] === 'hw' || sg[4] === 'rail') return; const d = U.segDist(E.x, E.y, sg[0], sg[1], sg[2], sg[3]); if (d < nd) { nd = d; near = sg; } });
    if (!near) continue;
    const vx = near[2] - near[0], vy = near[3] - near[1], LL = vx * vx + vy * vy || 1, t = U.clamp(((E.x - near[0]) * vx + (E.y - near[1]) * vy) / LL, 0, 1), M = { x: near[0] + vx * t, y: near[1] + vy * t };
    b.close = true;
    if (P.small) { c.streets.push({ cls: 'st', pts: [M, wp(0, 0)], head: 2, cul: true }); continue; }
    const ring = P.ring.map(([x, y]) => wp(x, y));
    // the way in and the closes start on the loop as it is drawn (its chords), each a point of it, so a car meets one
    // junction there and not a crossing a few metres on (brief 67)
    const onRing = p => { let bi = 1, bd = 1e9, bq = p; for (let i = 1; i < ring.length; i++) { const a = ring[i - 1], b2 = ring[i], vx = b2.x - a.x, vy = b2.y - a.y, LL = vx * vx + vy * vy || 1, t = U.clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / LL, 0, 1), q = { x: a.x + vx * t, y: a.y + vy * t }, d = U.dist(p, q); if (d < bd) { bd = d; bi = i; bq = q; } }
      if (U.dist(bq, ring[bi - 1]) < 0.02) return ring[bi - 1]; if (U.dist(bq, ring[bi]) < 0.02) return ring[bi];
      ring.splice(bi, 0, bq); return bq; };
    const ent = onRing(wp(P.entry[0], P.entry[1]));
    c.streets.push({ cls: 'st', pts: [M, { x: ent.x, y: ent.y }], cul: true });
    const cl = P.closes.map(([x0, y0, x1, y1]) => [onRing(wp(x0, y0)), wp(x1, y1)]);
    c.streets.push({ cls: 'st', pts: ring, ring: true, cul: true });
    for (const [p0, p1] of cl) c.streets.push({ cls: 'st', pts: [{ x: p0.x, y: p0.y }, p1], head: 2, cul: true });
  }
}
IC.closeStreets = closeStreets;
/* a housing block's streets as streets of the city (brief 68, IC.resLanes): each runs on from the block's edge to the
   street round it, so the traffic drives to every front door and the junctions are drawn like any other; an end with
   no street ahead of it within 80 m ends in a turning head */
function houseStreets(c, blocks) {
  const Bk = buckets(3); for (const l of c.streets) for (let q = 1; q < l.pts.length; q++) Bk.add([l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y, l.cls]);
  for (const b of blocks) {
    if (b.f !== 'house' && b.f !== 'row') continue;
    const R = IC.resLanes(b); if (!R.nl) continue;
    const ca = Math.cos(b.a), sa = Math.sin(b.a), wp = (x, y) => ({ x: b.x + x * ca - y * sa, y: b.y + x * sa + y * ca });
    for (const L of R.lanes) {
      const A = wp(L[0], L[1]), B = wp(L[2], L[3]), len = U.dist(A, B), ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
      // ahead of each end, the nearest street it would meet
      const reach = (P, sx, sy) => { const E = { x: P.x + sx * 0.8, y: P.y + sy * 0.8 }; let bt = 2, bq = null;
        Bk.near(P.x, P.y, 1, sg => { if (sg[4] === 'hw' || sg[4] === 'rail' || sg[4] === 'sq') return; const t = U.segX(P.x, P.y, E.x, E.y, sg[0], sg[1], sg[2], sg[3]); if (t >= 0 && t < bt) { bt = t; bq = { x: P.x + sx * 0.8 * t, y: P.y + sy * 0.8 * t }; } });
        return bq; };
      const a = reach(A, -ux, -uy), z = reach(B, ux, uy);
      if (!a && !z) continue;
      const l = { cls: 'st', pts: [a || A, b2(A, B, 0.33), b2(A, B, 0.67), z || B], res: true }, hd = (a ? 0 : 1) | (z ? 0 : 2);
      if (hd) l.head = hd;
      c.streets.push(l);
      b.res = true;
    }
  }
}
const b2 = (A, B, t) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
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
/* growth (growth.js): new blocks in cell i, j of a city's plan, with their district and buildings, and the streets
   of the field traced through the cell against the streets already there (open(di, dj) says whether the neighbour
   that way is unbuilt) */
IC.cityGrowCell = function (c, i, j, d, q, R, open) {
  const st = styleOf(c), F = IC.cityFrame(c), SP = F.SP, W = IC.W, FLD = IC.cityField(c);
  const ixs = IC.ixNear ? IC.ixNear(W, c.x, c.y, c.r * 3.5) : null;
  const P = [F.toW(i * SP, j * SP), F.toW((i + 1) * SP, j * SP), F.toW((i + 1) * SP, (j + 1) * SP), F.toW(i * SP, (j + 1) * SP)];
  const rc = rectOf(P[0], P[1], P[3], P[2], 0), sz = (IC.FABRIC.size[d] || IC.FABRIC.size.sub) * (IC.FABRIC.styleK[c.style] || 1);
  const inRect = (x, y, m) => { const ca = Math.cos(rc.a), sa = Math.sin(rc.a), lx = (x - rc.x) * ca + (y - rc.y) * sa, ly = -(x - rc.x) * sa + (y - rc.y) * ca; return Math.abs(lx) < rc.w / 2 + m && Math.abs(ly) < rc.h / 2 + m; };
  // the streets near by, for the new ones to end on and the faces to close with
  const box = [rc.x - SP * 1.6, rc.y - SP * 1.6, rc.x + SP * 1.6, rc.y + SP * 1.6];
  const near = [];
  for (const l of c.streets) if (!l.bb || !(l.bb[2] < box[0] || l.bb[0] > box[2] || l.bb[3] < box[1] || l.bb[1] > box[3])) near.push({ pts: l.pts, w: (HALF[l.cls] || 0.2) + 0.15 });
  for (const e of W.edges) { if (e.bb && (e.bb[2] < box[0] || e.bb[0] > box[2] || e.bb[3] < box[1] || e.bb[1] > box[3])) continue; for (let k = 1; k < e.pts.length; k++) { const a = e.pts[k - 1], b = e.pts[k]; if (U.segDist(rc.x, rc.y, a.x, a.y, b.x, b.y) < SP * 1.6) near.push({ pts: [a, b], w: e.city ? HALF.art + 0.15 : e.cls === 'hw' ? 1.25 : (HALF[e.cls] || 0.2) + 0.2, hw: e.cls === 'hw' && !e.city }); } }
  const hwNear = (x, y) => near.some(l => l.hw && U.segDist(x, y, l.pts[0].x, l.pts[0].y, l.pts[1].x, l.pts[1].y) < 0.9);
  // inside: the cell, and a little way into the built neighbours (so a street runs on to meet theirs)
  const inside = (x, y) => { if (inRect(x, y, 0)) return true; const [u, v] = F.toG(x, y), di = Math.floor(u / SP) - i, dj = Math.floor(v / SP) - j; return inRect(x, y, sz * 0.6) && (di || dj) && !open(Math.sign(di), Math.sign(dj)); };
  const blocked = (x, y) => !inside(x, y) ? 2 : W.inLake(x, y) ? 'water' : W.riverDist(x, y) < 2 ? 'water' : hwNear(x, y) ? 'hw' : 0;
  const lines = IC.fabricTrace({ fld: FLD, blocked, lines: near, seeds: [{ x: rc.x, y: rc.y, fam: 0 }, { x: rc.x, y: rc.y, fam: 1 }], dsep: () => sz, maxLen: SP * 3 });
  const streets = lines.map(l => { const hd = l.ends.map(e => HEAD_AT[e.to] ? 1 : 0), sp = l.ends.map(e => STOP_AT[e.to] ? 1 : 0); const s = { cls: 'st', pts: l.pts, grown: true }; if (hd[0] || hd[1]) s.head = hd[0] + hd[1] * 2; if (sp[0] || sp[1]) s.stop = sp[0] + sp[1] * 2; return s; });
  // the faces of the cell: its new streets, the ones near by, and its own edges
  const faceLines = near.map(l => ({ pts: l.pts, w: l.w })).concat(lines.map(l => ({ pts: l.pts, w: HALF.st + 0.15 })), [{ pts: P.concat([P[0]]), w: 0.25, virt: true }]);
  const blocks = [], D2 = IC.DISTRICTS[d];
  for (const fc of IC.fabricFaces(faceLines)) {
    if (!inRect(fc.x, fc.y, 0) || fc.area < 0.4 || blocked(fc.x, fc.y)) continue;   // (outside the cell counts as blocked)
    const r = IC.fabricRect(fc, 0.75); if (!r) continue;
    for (const p of (r.w > sz * 1.8 || r.h > sz * 1.8 ? IC.fabricSplit(r, sz, 0.3) : [r])) if (!(IC.ixClear && IC.ixClear(W, p.x, p.y, Math.max(p.w, p.h) * 0.35, ixs))) blocks.push({ x: p.x, y: p.y, w: p.w, h: p.h, a: p.a, d, f: formFor(c, st, { i, j, d, q }), core: !!D2.core, ind: !!D2.ind, sub: !!D2.sub, seed: R() * 1000, hp: 1, i, j });
  }
  return { blocks, streets };
};

/* where a street that met nothing ends in a turning head: at the city's edge, short of a motorway or an airfield (at a
   bank or a square it simply ends) */
const HEAD_AT = { edge: 1, hw: 1, field: 1, turn: 1, long: 1 }, STOP_AT = { water: 1, sq: 1 };
/* city streets end on another street or road: a loose end runs on to the next street it meets ahead, or turns to
   the nearest one close by; only a street with nothing near stays a cul-de-sac */
function tieStreets(c, roadSegs, SP, hwSegs) {
  const Bk = buckets(3), HB = buckets(4); for (const s of hwSegs || []) HB.add(s);
  // (a street is never run on across a motorway)
  const overHw = (a, b) => { let x = false; HB.near((a.x + b.x) / 2, (a.y + b.y) / 2, U.dist(a, b) / 2 + 1, s => { if (!x && U.segX(a.x, a.y, b.x, b.y, s[0], s[1], s[2], s[3]) >= 0) x = true; }); return x; };
  c.streets.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) Bk.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]); });
  for (const r of roadSegs) Bk.add([r[0], r[1], r[2], r[3], -1]);
  c.streets.forEach((l, li) => {
    if (l.ring || l.pts.length < 2) return;
    for (const end of [0, 1]) {
      if (l.stop & (end + 1)) continue;   // (it ends at a bank or a square)
      const hd = l.head & (end + 1);   // (a turning head: it ends where it is, unless a street is right there after all)
      if (hd && l.cul) continue;   // (an estate's close ends at its head, however near the loop runs: brief 66)
      const P = l.pts, e = end ? P[P.length - 1] : P[0], q = end ? P[P.length - 2] : P[1];
      // (an end that stops just short of a street or road is run on to meet it)
      // (a corner where two streets end together counts as tied, but still meets a road or street that passes by it)
      let near = null, nd = 0.4, cor = false, onT = false;
      Bk.near(e.x, e.y, 0.5, sg => {
        if (sg[4] === li) return;
        if ((Math.abs(sg[0] - e.x) < 1e-6 && Math.abs(sg[1] - e.y) < 1e-6) || (Math.abs(sg[2] - e.x) < 1e-6 && Math.abs(sg[3] - e.y) < 1e-6)) {
          cor = true;
          // (on a point in the middle of another street it is a T, tied for good: brief 67)
          const o = sg[4] >= 0 && c.streets[sg[4]], f = o && o.pts[0], g = o && o.pts[o.pts.length - 1];
          if (o && !(Math.abs(f.x - e.x) < 1e-6 && Math.abs(f.y - e.y) < 1e-6) && !(Math.abs(g.x - e.x) < 1e-6 && Math.abs(g.y - e.y) < 1e-6)) onT = true;
          return;
        }
        const d = U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]); if (d < nd) { nd = d; near = sg; }
      });
      if (onT) { if (hd) l.head -= hd; continue; }
      if (near || cor) {
        if (hd) l.head -= hd;
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
      if (hit && overHw(e, hit)) hit = null;
      if (!hit && !hd) {   // (a head is kept rather than bent sideways to a neighbour)
        let bd = SP * 1.1;
        Bk.near(e.x, e.y, bd, sg => {
          if (sg[4] === li) return;
          const vx = sg[2] - sg[0], vy = sg[3] - sg[1], LL = vx * vx + vy * vy, t = LL ? U.clamp(((e.x - sg[0]) * vx + (e.y - sg[1]) * vy) / LL, 0, 1) : 0;
          const x = sg[0] + vx * t, y = sg[1] + vy * t, d = Math.hypot(x - e.x, y - e.y);
          if (d < bd && !overHw(e, { x, y })) { bd = d; hit = { x, y }; }
        });
      }
      if (hit) { if (end) P.push(hit); else P.unshift(hit); if (hd) l.head -= hd; }
      else if (!hd) l.deadEnd = (l.deadEnd || 0) + 1;
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
    for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) Bk.near(e.x, e.y, 0.5, sg => { if (sg[4] !== li && U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]) < 0.02) { if (sg[4] < 0) rooted.add(li); else join(li, sg[4]); } });
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

/* the streets as a car drives them (brief 67): every end either meets a street or a road, or is a turning head long
   enough to turn in. Ends that meet a street a few metres from another junction on it are moved onto that junction,
   so two T junctions side by side become one crossroads; an end that stops just short of a street runs on to it; a
   piece left dangling past the last junction (an old town's street cut at its wall, a stub between two blocks) is
   taken back to that junction. A close (cul) is the estate's own and keeps its shape. */
const WELD = 0.12, REACH = 0.12, HEAD_MIN = 0.3;
function tidyStreets(c, roadSegs) {
  // (the roads in pieces of 200 m at most: a long diagonal piece would sit in every cell of its box)
  const rs = [];
  for (const r of roadSegs) { const n = Math.ceil(Math.hypot(r[2] - r[0], r[3] - r[1]) / 2) || 1; for (let k = 0; k < n; k++) rs.push([r[0] + (r[2] - r[0]) * k / n, r[1] + (r[3] - r[1]) * k / n, r[0] + (r[2] - r[0]) * (k + 1) / n, r[1] + (r[3] - r[1]) * (k + 1) / n]); }
  roadSegs = rs;
  for (let round = 0; round < 3; round++) {
    const L = c.streets, Bk = buckets(2);
    L.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) Bk.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li, i]); });
    for (const r of roadSegs) Bk.add([r[0], r[1], r[2], r[3], -1, 0]);
    const cum = L.map(l => { const a = [0]; for (let i = 1; i < l.pts.length; i++) a.push(a[i - 1] + U.dist(l.pts[i - 1], l.pts[i])); return a; });
    const onLine = (p, li, tol) => { let hit = null; Bk.near(p.x, p.y, tol + 0.01, sg => { if (hit || sg[4] === li) return; if (U.segDist(p.x, p.y, sg[0], sg[1], sg[2], sg[3]) < tol) hit = sg; }); return hit; };
    // the junction points on a line: where others cross it or end on it, and where it ends on another (arc length along
    // it, and the point), on the lines as they stood when the round began; near a point only, or all of them
    const P0 = L.map(l => l.pts.slice()), Ek = buckets(1);
    L.forEach((l, li) => { for (const end of [0, 1]) { const p = end ? l.pts[l.pts.length - 1] : l.pts[0]; Ek.add([p.x, p.y, p.x, p.y, li, end]); } });
    let stamp = 0;
    const junctions = (hi, at, s0 = 0, s1 = Infinity) => {
      const Q = P0[hi], cu = cum[hi], T = [], r = at ? WELD + 0.01 : 0;
      if (at) {
        // (near a point: the pieces round it, the line's own against the others)
        const own = [], other = []; stamp++;
        Bk.near(at.x, at.y, r, sg => { if (sg[6] === stamp) return; sg[6] = stamp; if (U.segDist(at.x, at.y, sg[0], sg[1], sg[2], sg[3]) > r) return; (sg[4] === hi ? own : other).push(sg); });
        for (const a of own) for (const sg of other) {
          const t = U.segX(a[0], a[1], a[2], a[3], sg[0], sg[1], sg[2], sg[3]); if (t < 0) continue;
          const p = { x: a[0] + (a[2] - a[0]) * t, y: a[1] + (a[3] - a[1]) * t }; T.push({ s: cu[a[5] - 1] + U.dist(Q[a[5] - 1], p), p, by: sg[4] });
        }
        Ek.near(at.x, at.y, r, en => { if (en[4] !== hi && own.some(a => U.segDist(en[0], en[1], a[0], a[1], a[2], a[3]) < 0.004)) { const p = { x: en[0], y: en[1] }; T.push({ s: 0, p, end: [en[4], en[5]], by: en[4] }); } });
        for (const end of [0, 1]) { const e = end ? Q[Q.length - 1] : Q[0]; if (U.dist(e, at) > r) continue; for (const sg of other) if (U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]) < 0.004) T.push({ s: end ? cu[cu.length - 1] : 0, p: e, by: sg[4] }); }
        return T;
      }
      for (let i = 1; i < Q.length; i++) {
        if (cu[i] < s0 || cu[i - 1] > s1) continue;
        const a = Q[i - 1], b = Q[i], h = U.dist(a, b) / 2 + 0.01, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        stamp++;
        Bk.near(mx, my, h, sg => {
          if (sg[6] === stamp || sg[4] === hi) return; sg[6] = stamp;   // (a piece in several cells is looked at once)
          if (Math.max(sg[0], sg[2]) < x0 || Math.min(sg[0], sg[2]) > x1 || Math.max(sg[1], sg[3]) < y0 || Math.min(sg[1], sg[3]) > y1) return;
          const t = U.segX(a.x, a.y, b.x, b.y, sg[0], sg[1], sg[2], sg[3]); if (t < 0) return;
          T.push({ s: cu[i - 1] + t * 2 * (h - 0.01), p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, by: sg[4] });
        });
        Ek.near(mx, my, h, en => {
          if (en[4] === hi || U.segDist(en[0], en[1], a.x, a.y, b.x, b.y) >= 0.004) return;
          const p = { x: en[0], y: en[1] }; T.push({ s: cu[i - 1] + U.dist(a, p), p, end: [en[4], en[5]], by: en[4] });
        });
      }
      for (const end of [0, 1]) {
        const e = end ? Q[Q.length - 1] : Q[0];
        Bk.near(e.x, e.y, 0.02, sg => { if (sg[4] !== hi && U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]) < 0.004) T.push({ s: end ? cu[cu.length - 1] : 0, p: e, by: sg[4] }); });
      }
      return T;
    };
    const all = new Map(), touchOf = li => all.get(li) || (all.set(li, junctions(li)), all.get(li));
    let changed = 0;
    const kill = new Set();
    L.forEach((l, li) => {
      if (kill.has(li) || l.ring) return;
      for (const end of [0, 1]) {
        const P = l.pts, e = end ? P[P.length - 1] : P[0], len = cum[li][cum[li].length - 1], sEnd = end ? len : 0;
        const host = onLine(e, li, 0.004);
        if (host) {
          // a T: onto the nearest other junction on the street it meets, if there is one within a few metres
          if (host[4] < 0 || l.cul) continue;
          let best = null, bd = WELD;
          for (const t of junctions(host[4], e)) { if (t.end && t.end[0] === li) continue; const d = U.dist(t.p, e); if (d > 0.004 && d < bd) { bd = d; best = t; } }
          if (!best) continue;
          if (best.by === li) {
            // it crosses the street it ends on just before: it ends at the crossing
            const own = touchOf(li).find(t => t.by === host[4] && U.dist(t.p, best.p) < 1e-6); if (!own) continue;
            l.pts = end ? cutAt(P, cum[li], 0, own.s) : cutAt(P, cum[li], own.s, len); changed++; break;
          }
          if (len > bd + 0.05) { const q = { x: best.p.x, y: best.p.y }; if (end) P[P.length - 1] = q; else P[0] = q; changed++; }
          continue;
        }
        if (l.cul) continue;
        // the junctions along this street, nearest this end first
        const designed = (l.head | l.stop) & (end + 1) && !l.core;
        // (a turning head long enough to turn in: only the junctions that near its end matter)
        if (designed && !junctions(li, null, sEnd - HEAD_MIN, sEnd + HEAD_MIN).some(t => Math.abs(t.s - sEnd) > 0.004 && Math.abs(t.s - sEnd) < HEAD_MIN)) continue;
        const inner = touchOf(li).filter(t => Math.abs(t.s - sEnd) > 0.004).map(t => Math.abs(t.s - sEnd));
        const dangle = inner.length ? Math.min(...inner) : len;
        // just short of a street or road: run on to it
        let near = null, nd = REACH;
        Bk.near(e.x, e.y, REACH, sg => { if (sg[4] === li) return; const d = U.segDist(e.x, e.y, sg[0], sg[1], sg[2], sg[3]); if (d < nd) { nd = d; near = sg; } });
        if (near && !designed) {
          const vx = near[2] - near[0], vy = near[3] - near[1], LL = vx * vx + vy * vy || 1, t = U.clamp(((e.x - near[0]) * vx + (e.y - near[1]) * vy) / LL, 0, 1), q = { x: near[0] + vx * t, y: near[1] + vy * t };
          if (end) P.push(q); else P.unshift(q);
          changed++; continue;
        }
        // left dangling: back to the last junction, or gone if it meets nothing at all
        if (!inner.length) { kill.add(li); changed++; break; }
        const sCut = end ? len - dangle : dangle;
        l.pts = cutAt(P, cum[li], end ? 0 : sCut, end ? sCut : len);
        if (designed) { l.head &= ~(end + 1); l.stop &= ~(end + 1); }
        changed++; break;   // (its arc lengths are stale now: the other end next round)
      }
    });
    c.streets = L.filter((l, i) => !kill.has(i) && l.pts.length >= 2 && U.dist(l.pts[0], l.pts[l.pts.length - 1]) + (l.pts.length > 2 ? 1 : 0) > 0.02);
    if (!changed) break;
  }
}
/* a street's bends as a car drives them: a corner that is not a junction becomes an arc of about 15 m radius (less
   where the pieces either side are short), a street folding back on itself loses the fold. A corner another street
   ends on, or a bridge's end, keeps its point. */
const ROUND_R = 0.15;
function roundCorners(c, roadSegs) {
  weldEnds(c, roadSegs);
  unOverlap(c);
  joinEnds(c, roadSegs);
  const ends = buckets(1), segs = buckets(2);
  c.streets.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) segs.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]); });
  for (const r of roadSegs) segs.add([r[0], r[1], r[2], r[3], -1]);
  const meets = (p, li) => { let hit = false; segs.near(p.x, p.y, 0.01, g => { if (!hit && g[4] !== li && U.segDist(p.x, p.y, g[0], g[1], g[2], g[3]) < 0.004) hit = true; }); return hit; };
  c.streets.forEach((l, li) => { for (const p of [l.pts[0], l.pts[l.pts.length - 1]]) ends.add([p.x, p.y, p.x, p.y, li]); });
  const ang = (a, b, q) => U.angWrap(Math.atan2(q.y - b.y, q.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
  c.streets.forEach((l, li) => {
    const P = l.pts, n = P.length; if (n < 3) return;
    const fixed = p => (l.br || []).some(r => (Math.abs(r[0] - p.x) < 1e-6 && Math.abs(r[1] - p.y) < 1e-6) || (Math.abs(r[2] - p.x) < 1e-6 && Math.abs(r[3] - p.y) < 1e-6));
    const out = [P[0]];
    for (let i = 1; i < n - 1; i++) {
      const a = out[out.length - 1], b = P[i], q = P[i + 1], t = ang(a, b, q), at = Math.abs(t);
      if (at < 0.45 || fixed(b)) { out.push(b); continue; }
      if (at > 2.7) {   // folds back on itself: it runs straight past, or at an end where only the tip meets a street, it ends there
        // (unless another street ends on the fold where the straight line past it would leave it)
        let held = false;
        ends.near(b.x, b.y, U.dist(a, b) + U.dist(b, q), g => { if (!held && g[4] !== li && Math.min(U.segDist(g[0], g[1], a.x, a.y, b.x, b.y), U.segDist(g[0], g[1], b.x, b.y, q.x, q.y)) < 0.004 && U.segDist(g[0], g[1], a.x, a.y, q.x, q.y) > 0.004) held = true; });
        if (held) { out.push(b); continue; }
        const e = i === 1 ? P[0] : i === n - 2 ? P[n - 1] : null;
        if (e && meets(b, li)) { if (meets(e, li)) { out.push(b); continue; } if (i === 1) { out[0] = b; continue; } out.push(b); l.pts = out; return; }
        continue;
      }
      const la = U.dist(a, b), lq = U.dist(b, q);
      const d = Math.min(ROUND_R * Math.tan(at / 2), la * (i === 1 ? 0.85 : 0.45), lq * (i === n - 2 ? 0.85 : 0.45));
      let busy = false;
      ends.near(b.x, b.y, d + 0.02, e => { if (!busy && e[4] !== li && Math.hypot(e[0] - b.x, e[1] - b.y) < d + 0.02) busy = true; });
      if (busy || d < 0.01) { out.push(b); continue; }
      const p1 = { x: b.x + (a.x - b.x) * d / la, y: b.y + (a.y - b.y) * d / la }, p2 = { x: b.x + (q.x - b.x) * d / lq, y: b.y + (q.y - b.y) * d / lq };
      const k = Math.ceil(at / 0.35);
      for (let j = 0; j <= k; j++) { const s = j / k, u = 1 - s; out.push({ x: u * u * p1.x + 2 * u * s * b.x + s * s * p2.x, y: u * u * p1.y + 2 * u * s * b.y + s * s * p2.y }); }
    }
    out.push(P[n - 1]);
    l.pts = out;
  });
  c.streets = c.streets.filter(l => l.pts.some(p => U.dist(p, l.pts[0]) > 0.01));   // (an out-and-back with nothing at its tip is gone)
}
/* street ends a few metres apart are one junction (an old town's mapped ways stop a metre or two short of each
   other): they all move to one point, on the street or road they meet if one of them sits on one */
const WELD_ENDS = 0.06;
function weldEnds(c, roadSegs) {
  const L = c.streets, E = [], pb = buckets(1), segs = buckets(2);
  L.forEach((l, li) => { if (l.ring) return; for (const end of [0, 1]) { const p = end ? l.pts[l.pts.length - 1] : l.pts[0]; E.push({ li, end, p }); pb.add([p.x, p.y, p.x, p.y, E.length - 1]); } });
  L.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) segs.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]); });
  for (const r of roadSegs) segs.add([r[0], r[1], r[2], r[3], -1]);
  const up = E.map((_, i) => i), find = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  E.forEach((e, i) => pb.near(e.p.x, e.p.y, WELD_ENDS, g => { if (g[4] !== i && Math.hypot(g[0] - e.p.x, g[1] - e.p.y) < WELD_ENDS) up[find(g[4])] = find(i); }));
  const groups = new Map(); E.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
  for (const G of groups.values()) {
    if (G.length < 2) continue;
    const mine = new Set(G.map(e => e.li));
    // (the point to meet at: an end that rests on a line that is not one of these streets, else the middle)
    let to = null;
    for (const e of G) { segs.near(e.p.x, e.p.y, 0.01, g => { if (!to && !mine.has(g[4]) && U.segDist(e.p.x, e.p.y, g[0], g[1], g[2], g[3]) < 0.004) to = e.p; }); if (to) break; }
    if (!to) { const x = G.reduce((s, e) => s + e.p.x, 0) / G.length, y = G.reduce((s, e) => s + e.p.y, 0) / G.length; to = { x, y }; }
    for (const e of G) { const P = L[e.li].pts; if (L[e.li].cul && P.length < 3) continue; if (e.end) P[P.length - 1] = { x: to.x, y: to.y }; else P[0] = { x: to.x, y: to.y }; }
  }
  c.streets = L.filter(l => l.pts.some(p => U.dist(p, l.pts[0]) > 0.01));
}
/* a street whose last piece runs on top of another street (two mapped ways sharing a few metres) ends where it meets
   it instead, so the two do not make two junctions a car's length apart */
function unOverlap(c) {
  const L = c.streets, segs = buckets(1), gone = L.map(() => new Set());
  L.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) segs.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li, l.pts[i - 1], l.pts[i]]); });
  const onOther = (p, li) => { const on = new Set(); segs.near(p.x, p.y, 0.01, g => { if (g[4] !== li && !gone[g[4]].has(g[5]) && !gone[g[4]].has(g[6]) && U.segDist(p.x, p.y, g[0], g[1], g[2], g[3]) < 0.004) on.add(g[4]); }); return on; };
  L.forEach((l, li) => {
    if (l.ring) return;
    for (const end of [0, 1]) {
      const P = l.pts;
      while (P.length > 2) {
        const e = end ? P[P.length - 1] : P[0], q = end ? P[P.length - 2] : P[1];
        const A = onOther(e, li), B = onOther(q, li), M = onOther({ x: (e.x + q.x) / 2, y: (e.y + q.y) / 2 }, li);
        if (![...A].some(k => B.has(k) && M.has(k))) break;   // (the whole piece on one other street)
        gone[li].add(e); if (end) P.pop(); else P.shift();
      }
    }
  });
}
/* two streets of a kind that meet end to end with nothing else there are one street round the corner (an old town's
   streets come as the pieces they were mapped in) */
function joinEnds(c, roadSegs) {
  const key = p => Math.round(p.x * 500) + ':' + Math.round(p.y * 500), at = new Map(), segs = buckets(2);
  const L = c.streets;
  L.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) segs.add([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y, li]); });
  for (const r of roadSegs) segs.add([r[0], r[1], r[2], r[3], -1]);
  L.forEach((l, li) => { if (l.ring || l.cul || l.br || U.dist(l.pts[0], l.pts[l.pts.length - 1]) < 0.01) return; for (const end of [0, 1]) { const k = key(end ? l.pts[l.pts.length - 1] : l.pts[0]); if (!at.has(k)) at.set(k, []); at.get(k).push([li, end]); } });
  const gone = new Set();
  for (const [, E] of at) {
    if (E.length !== 2) continue;
    let [[i, ei], [j, ej]] = E;
    if (i === j || gone.has(i) || gone.has(j)) continue;
    const A = L[i], B = L[j];
    const p = ei ? A.pts[A.pts.length - 1] : A.pts[0];
    let other = false; segs.near(p.x, p.y, 0.01, g => { if (!other && g[4] !== i && g[4] !== j && U.segDist(p.x, p.y, g[0], g[1], g[2], g[3]) < 0.004) other = true; });
    if (other) continue;
    if (A.cls !== B.cls || !!A.core !== !!B.core) {
      // a street that changes class at the corner stays two streets, the corner rounded between them
      const a = ei ? A.pts[A.pts.length - 2] : A.pts[1], q = ej ? B.pts[B.pts.length - 2] : B.pts[1];
      const t = Math.abs(U.angWrap(Math.atan2(q.y - p.y, q.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x)));
      if (t < 0.45 || t > 2.7) continue;
      const la = U.dist(a, p), lq = U.dist(p, q), d = Math.min(ROUND_R * Math.tan(t / 2), la * (A.pts.length > 2 ? 0.45 : 0.85), lq * (B.pts.length > 2 ? 0.45 : 0.85));
      if (d < 0.01) continue;
      const p1 = { x: p.x + (a.x - p.x) * d / la, y: p.y + (a.y - p.y) * d / la }, p2 = { x: p.x + (q.x - p.x) * d / lq, y: p.y + (q.y - p.y) * d / lq };
      const k = Math.ceil(t / 0.35), arc = [];
      for (let m = 0; m <= k; m++) { const s = m / k, u = 1 - s; arc.push({ x: u * u * p1.x + 2 * u * s * p.x + s * s * p2.x, y: u * u * p1.y + 2 * u * s * p.y + s * s * p2.y }); }
      if (ei) A.pts.splice(A.pts.length - 1, 1, ...arc); else A.pts.splice(0, 1, ...arc.reverse());
      if (ej) B.pts[B.pts.length - 1] = p2; else B.pts[0] = p2;
      continue;
    }
    const pa = ei ? A.pts : A.pts.slice().reverse(), pb = ej ? B.pts.slice().reverse() : B.pts;
    // (the flags of the ends kept: A's far end is the new start, B's far end the new end)
    const fa = ei ? 0 : 1, fb = ej ? 0 : 1;
    const head = (A.head & (fa + 1) ? 1 : 0) | (B.head & (fb + 1) ? 2 : 0), stop = (A.stop & (fa + 1) ? 1 : 0) | (B.stop & (fb + 1) ? 2 : 0);
    A.pts = pa.concat(pb.slice(1));
    if (head) A.head = head; else delete A.head;
    if (stop) A.stop = stop; else delete A.stop;
    gone.add(j);
    // B's far end now belongs to A
    const kb = key(fb ? B.pts[B.pts.length - 1] : B.pts[0]), eb = at.get(kb);
    if (eb) for (const e of eb) if (e[0] === j) { e[0] = i; e[1] = 1; }
    const ea = at.get(key(pa[0]));
    if (ea) for (const e of ea) if (e[0] === i) e[1] = 0;
  }
  if (gone.size) c.streets = L.filter((l, k) => !gone.has(k));
}
/* the piece of a polyline from arc length s0 to s1 */
function cutAt(P, cum, s0, s1) {
  const at = s => { let i = 1; while (i < P.length - 1 && cum[i] < s) i++; const a = P[i - 1], b = P[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return { i, p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }; };
  const A = at(s0), B = at(s1), out = [A.p];
  for (let i = A.i; i < B.i; i++) if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) out.push(P[i]);
  out.push(B.p);
  return out;
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
