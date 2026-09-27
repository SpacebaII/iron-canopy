/* Iron Canopy — growth, trade and roads. Cities fly as much as their size, wealth and air service allow; good
   service and good roads make them grow, and growth adds real blocks and streets. Industries, some far from any
   city, sell at home by road and abroad by air cargo or lorry, and pay trade taxes. Roads are links between
   places: the player builds them, weapons cut them, and every change re-times the trips between cities, which
   trade, growth, airport catchments, fuel deliveries and convoys all follow. Money is booked into a weekly
   statement, with loans for the big projects. */
(function (IC) {
'use strict';
const U = IC.U;
const DAY = 86400, WEEK = 7 * DAY, TICK = 300;
const OPS_DAY = 17 * 3600; // airliners fly 06:00–23:00; freighters round the clock

/* ---------- tuning, in plain units ---------- */
IC.GROWTH = {
  flyRate: 28,        // passengers a day per thousand people, at full prosperity and perfect air service
  catch: [0.5, 2.5],  // hours by road to the airport: everyone flies within half an hour, nobody beyond 2½ h
  freqDeps: 60,       // departures a day at which frequency is about two-thirds of the way to "fly any time"
  dests: 6,           // places served at which choice is about two-thirds of the way to "fly anywhere"
  airGrowth: 0.5,     // % a day a city grows with perfect air service
  roadGrowth: 1.5,    // % a day for each 100% better road links than at the start
  drift: -0.08,       // % a day with nothing going for a city: people move to where the connections are
  tradeTax: 0.15,     // share of industry sales paid in trade taxes
  indCatch: 4         // hours by road at which an industry's market or airport is out of reach
};
IC.INDUSTRY = {
  mine:   { name: 'copper mine', goods: 'copper ore', cap: 0.9, xs: 0.35 },
  quarry: { name: 'quarry', goods: 'cut stone', cap: 0.5, xs: 0.25 },
  farm:   { name: 'fruit farms', goods: 'fresh fruit', cap: 0.6, xs: 0.5, fresh: true },
  timber: { name: 'sawmill', goods: 'timber', cap: 0.5, xs: 0.3 }
};
// the roads the player may build, all to serve an airport: ₭M per km, ₭M per bridge, km built per game hour.
// Cities build their own streets and the government the national network; the airport authority builds links.
IC.ROADS = {
  lc: { name: 'Access road', short: 'access road', perKm: 2, bridge: 15, kmh: 4, what: 'a two-lane road from the airport to the nearest road' },
  rd: { name: 'Link road', short: 'link road', perKm: 5, bridge: 40, kmh: 2, what: 'a main road from the airport to a town or a main road' },
  hw: { name: 'Motorway link', short: 'motorway link', perKm: 15, bridge: 100, kmh: 1, what: 'a motorway spur from the airport that joins a motorway at a new interchange' }
};
const CLS_NAME = { hw: 'Motorway', rd: 'Main road', lc: 'Local road', sp: 'Access road' };
const HALF = { hw: 0.2, rd: 0.12, lc: 0.08, sp: 0.06 };   // half the road's width, in units
IC.LOANS = [{ amt: 100, days: 5 }, { amt: 300, days: 10 }, { amt: 800, days: 20 }];
IC.LOAN_RATE = 0.004;   // interest per game day on what is still owed

/* "2 h 40" or "55 min" */
const hm = s => { if (!isFinite(s)) return 'no way through'; const m = Math.round(s / 60); return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
IC.hm = hm;
const pct1 = v => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
const shortName = n => n.replace(/ (International|Airport)$/, '');
const rngFor = (S, k) => IC.makeRng((S.seed * 2654435761 + k * 40503) >>> 0);

/* ---------- start ---------- */
IC.econInit = function (S) {
  const W = S.world;
  const E = S.econ = { t0: S.time, tickT: 0, roadsDirty: true, inds: [], works: [], loans: [], nid: 0, damaged: [],
    tt: {}, ti: {}, book: {}, days: [], lastBudget: S.budget, day: U.day(S.time) };
  W.roadWorks = E.works;
  for (const c of IC.cities(S)) {
    c.popF = c.pop; c.pop0 = c.pop;
    const n = c.blocks.length;
    c.bpp = n / Math.max(1, c.pop);   // blocks per thousand people, kept as the city grows
    c.gr = { air: 0, road: 0, war: 0, base: 0, tot: 0 };
    c.wk = { pop0: c.pop, air: 0, road: 0, war: 0 };
    c.grownN = 0;
  }
  // remote industries: villages far from any city, chosen per seed; what they make follows the land
  const R = rngFor(S, 7);
  const cap = IC.cap(S), cities = W.cities;
  // out in the country (30–100 km from the nearest city), the ones furthest from the capital first
  const nearC = v => Math.min(...cities.map(c => U.dist(c, v) - c.r));
  const cand = W.villages.filter(v => v.home && W.nodes[v.id] && nearC(v) > 300 && nearC(v) < 1000 && IC.hostileBorderDist(v.x, v.y) > 500)
    .sort((a, b) => U.dist(b, cap) - U.dist(a, cap));
  const kinds = [];
  for (const v of cand) {
    if (E.inds.length >= 5) break;
    if (E.inds.some(i => U.dist(i, v) < 700)) continue;
    const h = W.hAt(v.x, v.y), forest = [0, 1, 2, 3].filter(k => W.forestAt(v.x + Math.cos(k * 1.57) * 40, v.y + Math.sin(k * 1.57) * 40)).length;
    let kind = h > 0.5 ? 'mine' : forest >= 2 ? 'timber' : W.farmAt(v.x, v.y) > 0.25 ? 'farm' : 'quarry';
    if (kinds.filter(k => k === kind).length >= 2) kind = ['farm', 'quarry', 'timber', 'mine'].find(k => !kinds.includes(k)) || kind;
    kinds.push(kind);
    const K = IC.INDUSTRY[kind];
    E.inds.push({ id: v.id, kind, name: `${v.name} ${K.name}`, place: v.name, x: v.x, y: v.y, cap: K.cap * R.range(0.8, 1.25), out: 0, f: {} });
  }
  refreshRoads(S);
  airService(S);
  for (const c of IC.cities(S)) c.rc0 = c.rcI;
  for (const i of E.inds) indOutput(S, i);
};

/* ---------- where things are on the road network ---------- */
const nodeOf = (S, p) => S.world.nodes[p.id] ? { id: p.id, t: 0 } : IC.nodeNear(S.world, p.x, p.y);
/* seconds by road from a source (a city or an industry, with its Dijkstra tree) to any place */
function timeTo(S, T, p) { if (!T) return Infinity; const n = nodeOf(S, p), v = T.t[n.id]; return v == null ? Infinity : v + n.t; }
IC.econTime = (S, from, to, intact) => timeTo(S, (intact ? S.econ.ti : S.econ.tt)[from.id], to);
/* a place's trade reach: the people it can trade with, the nearer (in time) the more */
const reachOf = (S, T, self) => { let s = 0; for (const d of IC.cities(S)) if (d !== self && d.owner === 'us') s += d.pop * Math.exp(-timeTo(S, T, d) / 7200); return s; };

function refreshRoads(S) {
  const E = S.econ, W = S.world;
  E.roadsDirty = false;
  E.tt = {}; E.ti = {};
  for (const p of IC.cities(S).concat(E.inds)) { const n = nodeOf(S, p).id; E.tt[p.id] = IC.travelFrom(W, n, false); E.ti[p.id] = IC.travelFrom(W, n, true); }
  for (const c of IC.cities(S)) {
    c.rc = reachOf(S, E.tt[c.id], c); c.rcI = reachOf(S, E.ti[c.id], c);
    // trips that now take much longer, and the cut that causes it
    c.cuts = [];
    for (const d of IC.cities(S)) {
      if (d === c) continue;
      const tI = timeTo(S, E.ti[c.id], d), tN = timeTo(S, E.tt[c.id], d);
      if (tI > 4 * 3600 || tN < tI * 1.2 + 600) continue;
      const e = IC.travelPath(E.ti[c.id], nodeOf(S, d).id).find(x => x.cut || (W.blocked && W.blocked.has(x.id)));
      c.cuts.push({ to: d.id, name: d.name, tI, tN, pop: d.pop, why: e ? cutLabel(S, e) : 'Roads cut' });
    }
    c.cuts.sort((a, b) => b.pop * (b.tN - b.tI) - a.pop * (a.tN - a.tI));
  }
  E.fuelF = {};
}
function cutLabel(S, e) {
  if (e.cutName) return e.cutName;
  const br = S.infra.find(i => i.kind === 'bridge' && i.offline && i.edge === e.id);
  return br ? `${br.name} down` : `${CLS_NAME[e.cls]} cut`;
}

/* ---------- air service and passenger demand ---------- */
const ourAirports = S => S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts);
const catchF = h => U.clamp((IC.GROWTH.catch[1] - h) / (IC.GROWTH.catch[1] - IC.GROWTH.catch[0]), 0, 1);
/* what each airport offers: departures a day from the routes flown, seats, cargo room, places served, delays */
function airService(S) {
  const A = S.av, G = IC.GROWTH;
  for (const ap of ourAirports(S)) ap.svc = { deps: 0, seats: 0, cargoT: 0, fr: 0, dests: new Set(), delay: 0, q: 0, demand: 0, lf: 0.8 };
  if (A) for (const r of A.routes) {
    if (r.st !== 'active' || r.n <= 0) continue;
    const a = S.byId[r.a], b = IC.avEnd(S, r.b), T = IC.ACTYPES[r.type];
    const cycle = U.dist(a, b) / T.cruise * 2 + T.turn * 2.5 + 1200;
    const per = r.n * (T.cargo ? DAY : OPS_DAY) / cycle;   // departures a day from each end
    const cargoT = T.cargo || (r.type === 'wide' ? 15 : r.type === 'narrow' ? 2 : 0.5);
    for (const [ap, far] of [[a, b.name]].concat(b.apt ? [[S.byId[b.apt], a.name]] : [])) {
      if (!ap || !ap.svc) continue;
      ap.svc.deps += per; ap.svc.seats += per * 2 * (T.seats || 0); ap.svc.cargoT += per * 2 * cargoT;
      if (T.cargo) ap.svc.fr += per;
      ap.svc.dests.add(shortName(far));
    }
  }
  for (const ap of ourAirports(S)) {
    const v = ap.svc;
    const L = ap.delays = (ap.delays || []).filter(d => S.time - d.t < DAY);
    v.delay = L.length ? L.reduce((s, d) => s + d.w, 0) / L.length / 60 : 0;
    v.freqF = 1 - Math.exp(-v.deps / G.freqDeps);
    v.relF = U.clamp(1 - (v.delay - 5) / 60, 0.4, 1);
    v.fareF = U.clamp(1.3 - 0.3 * (ap.feeLevel || 1), 0.6, 1.15);
    v.destF = 1 - Math.exp(-v.dests.size / G.dests);
    v.q = ap.offline ? 0 : (0.5 * v.freqF + 0.5 * v.destF) * v.relF * v.fareF;
    // room for cargo: freighters, then belly holds; a cargo terminal makes the most of it
    v.cargoF = U.clamp(v.cargoT / 250, 0, 1) * (ap.st && ap.st.cargo ? 1 : 0.6) * (ap.offline ? 0 : 1);
  }
  // each city sends its flyers to the airports within reach, in proportion to how good they are
  for (const c of IC.cities(S)) {
    const T = S.econ.tt[c.id];
    c.air = { score: 0, demand: 0, best: null, bestT: Infinity, pot: 0 };
    if (c.owner !== 'us') continue;
    const opts = [];
    for (const ap of ourAirports(S)) {
      const t = timeTo(S, T, ap), w = catchF(t / 3600) * ap.svc.q;
      if (t < c.air.bestT) { c.air.bestT = t; c.air.near = ap.id; }
      if (w > 0) opts.push([ap, w, t]);
    }
    // a second airport within reach helps, less than the first
    const tot = opts.reduce((s, o) => s + o[1], 0);
    c.air.score = 1 - opts.reduce((p, o) => p * (1 - o[1]), 1);
    c.air.pot = c.pop * G.flyRate * c.prosp;
    c.air.demand = c.air.pot * c.air.score;
    const best = opts.sort((a, b) => b[1] - a[1])[0];
    if (best) { c.air.best = best[0].id; c.air.bestT = best[2]; }
    for (const [ap, w] of opts) ap.svc.demand += c.air.demand * w / tot;
  }
  for (const ap of ourAirports(S)) { const v = ap.svc; v.lf = v.seats > 0 ? U.clamp(v.demand / v.seats, 0.35, 0.97) : 0.8; }
}
/* share of seats airlines fill at this airport */
IC.loadFactor = (S, ap) => ap && ap.svc ? ap.svc.lf : 0.78;
IC.cargoLoad = (S, ap) => ap && ap.svc ? U.clamp(0.45 + (ap.svc.exportT || 0) / Math.max(1, ap.svc.cargoT), 0.45, 1) : 0.7;
/* how much airlines want more flights here: passengers wanting seats over seats offered */
IC.demandPull = (S, ap) => ap && ap.svc && ap.svc.seats > 0 ? ap.svc.demand / ap.svc.seats : 0;

/* ---------- industries and trade ---------- */
function indOutput(S, ind) {
  const K = IC.INDUSTRY[ind.kind], E = S.econ, T = E.tt[ind.id], G = IC.GROWTH;
  // home market: the nearest large city (or the capital) by road
  let mk = null, mt = Infinity;
  for (const c of IC.cities(S)) if (c.owner === 'us' && (c.pop >= 300 || c.capital)) { const t = timeTo(S, T, c); if (t < mt) { mt = t; mk = c; } }
  const road = U.clamp((G.indCatch - mt / 3600) / (G.indCatch - 1), 0.1, 1);
  // exports and imports: air cargo from an airport within reach, or lorries over a neutral border
  let air = 0, ap = null;
  for (const a of ourAirports(S)) { const v = catchCargo(timeTo(S, T, a)) * a.svc.cargoF; if (v > air) { air = v; ap = a; } }
  let lorry = 0;
  if (!(S.enemy && S.enemy.war)) for (const x of S.world.crossings) if (x.k === 'C' || x.k === 'D') lorry = Math.max(lorry, U.clamp(1.1 - timeTo(S, T, x) / 3600 / 5, 0, 1) * 0.3);
  const exp = Math.max(air, lorry);
  const f = 0.15 + (0.85 - K.xs) * road + K.xs * exp;
  const vil = S.world.villages.find(v => v.id === ind.id), hurt = vil && vil.blocks.length ? vil.blocks.filter(b => b.hp > 0).length / vil.blocks.length : 1;
  ind.out = ind.cap * f * hurt;
  ind.f = { road, air, lorry, exp, market: mk ? mk.id : null, mt, ap: ap ? ap.id : null, apT: ap ? timeTo(S, T, ap) : Infinity, hurt };
  if (ap && air >= lorry) ap.svc.exportT = (ap.svc.exportT || 0) + ind.out * K.xs * exp * 40;
}
const catchCargo = t => U.clamp((IC.GROWTH.indCatch - t / 3600) / (IC.GROWTH.indCatch - 1), 0, 1);
IC.indOutput = function (S, ind) { airService(S); for (const i of S.econ.inds) indOutput(S, i); return ind.out; };
/* trade taxes an hour, before the story's share of taxes */
IC.tradeTax = S => S.econ ? S.econ.inds.reduce((s, i) => s + i.out, 0) * IC.GROWTH.tradeTax : 0;
/* why an industry makes what it makes, in words */
IC.indWhy = function (S, ind) {
  const f = ind.f, K = IC.INDUSTRY[ind.kind], L = [];
  const mk = f.market && S.byId[f.market];
  L.push(mk ? `Home market ${mk.name}, ${hm(f.mt)} by road: ${U.pct(f.road)} of its sales there.` : 'No road to a market: it sells almost nothing at home.');
  if (f.air > 0 && f.air >= f.lorry) L.push(`Exports by air cargo from ${shortName(S.byId[f.ap].name)} (${hm(f.apT)} by road): ${U.pct(f.air)}.`);
  else if (f.lorry > 0) L.push(`No air cargo within ${IC.GROWTH.indCatch} h. Exports go by lorry over the border, slowly: ${U.pct(f.lorry)}.`);
  else L.push(`No air cargo link and no open border: exports stopped.`);
  if (K.fresh) L.push('Fresh fruit spoils on long drives: half its value is in exports.');
  if (f.hurt < 1) L.push(`Strike damage: ${U.pct(1 - f.hurt)} of the site is out of action.`);
  return L;
};

/* ---------- city growth ---------- */
function grow(S, dt) {
  const G = IC.GROWTH, war = S.enemy && S.enemy.war;
  for (const c of IC.cities(S)) {
    if (c.owner !== 'us') { c.gr = { air: 0, road: 0, war: 0, base: 0, tot: 0 }; continue; }
    const alive = c.blocks.length ? c.blocks.filter(b => b.hp > 0).length / c.blocks.length : 1;
    const g = {
      air: G.airGrowth * c.air.score,
      road: G.roadGrowth * U.clamp(c.rc / Math.max(1, c.rc0) - 1, -0.6, 0.6),
      war: -(1 - alive) * 3 - (c.besieged ? 1 : 0) - (war ? 0.1 : 0),
      base: G.drift
    };
    g.tot = U.clamp(g.air + g.road + g.war + g.base, -2, 2);
    c.gr = g;
    const k = dt / DAY / 100;
    c.popF *= 1 + g.tot * k;
    c.pop = Math.max(1, Math.round(c.popF));
    for (const f of ['air', 'road', 'war']) c.wk[f] += g[f] * k;
    // prosperity follows the connections, a fifth of the way each day
    const target = U.clamp(0.85 + 0.3 * c.air.score + 0.5 * (c.rc / Math.max(1, c.rcI) - 1) + 0.3 * (c.rc / Math.max(1, c.rc0) - 1), 0.3, 1.4);
    c.prosp = U.clamp(c.prosp + (target - c.prosp) * 0.2 * dt / DAY, 0.3, 1.5);
    c.prospT = target;
    // blocks follow the people: new ones where the city is growing, dark ones where it empties
    const live = c.blocks.filter(b => !b.empty).length, want = c.popF * c.bpp;
    if (want > live + 0.5) growBlocks(S, c, Math.min(6, Math.ceil(want - live)));
    else if (want < live - 1.5) emptyBlocks(S, c, Math.min(6, Math.floor(live - want)));
  }
}
/* new blocks go into the cells of the city's own street plan (cities.js), next to built ones: infill first, then out
   along the roads, towards the railway for industry and towards the motorway for warehouses */
const CELLS = new WeakMap();
function growBlocks(S, c, n) {
  const W = S.world, changed = [];
  // the empty blocks fill up first
  for (const b of c.blocks) { if (n <= 0) break; if (b.empty && b.hp > 0) { b.empty = false; n--; changed.push(b); } }
  if (n > 0 && c.lat) {
    const R = rngFor(S, 1000 + (c.grownN++) * 31 + c.id.length * 7 + c.x | 0);
    const F = IC.cityFrame(c), SP = F.SP;
    const key = (i, j) => (i + 2048) * 4096 + j + 2048;
    let used = CELLS.get(c);
    if (!used) { used = new Set(); for (const b of c.blocks) if (b.i != null) used.add(key(b.i, b.j)); CELLS.set(c, used); }
    // what pulls growth: the roads out of town (a motorway most), the railway for industry, an airport nearby.
    // Road and rail pieces go into 12-unit buckets so each candidate cell only looks at its neighbours.
    const B = 12, bk = new Map(), R2 = c.r * 2.2;
    const put = (s, kind) => {
      const x0 = Math.floor(Math.min(s[0], s[2]) / B), x1 = Math.floor(Math.max(s[0], s[2]) / B), y0 = Math.floor(Math.min(s[1], s[3]) / B), y1 = Math.floor(Math.max(s[1], s[3]) / B);
      if (x1 - x0 > 40 || y1 - y0 > 40) return;
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = i * 4096 + j; if (!bk.has(k)) bk.set(k, []); bk.get(k).push([s, kind]); }
    };
    const inBox = (a, b) => Math.min(a.x, b.x) < c.x + R2 && Math.max(a.x, b.x) > c.x - R2 && Math.min(a.y, b.y) < c.y + R2 && Math.max(a.y, b.y) > c.y - R2;
    for (const e of W.edges) {
      if (e.bb && (e.bb[2] < c.x - R2 || e.bb[0] > c.x + R2 || e.bb[3] < c.y - R2 || e.bb[1] > c.y + R2)) continue;
      for (let i = 1; i < e.pts.length; i++) if (inBox(e.pts[i - 1], e.pts[i])) put([e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y], e.cls);
    }
    for (const l of W.rails) for (let i = 1; i < l.pts.length; i++) if (inBox(l.pts[i - 1], l.pts[i])) put([l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y], 'rail');
    const around = (x, y) => { const i0 = Math.floor(x / B), j0 = Math.floor(y / B), L = []; for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const b = bk.get(i * 4096 + j); if (b) L.push(...b); } return L; };
    const fields = S.infra.filter(f => (f.parts || f.kind === 'factory' || f.kind === 'power') && U.dist(f, c) < c.r * 2.2 + 80);
    const apts = fields.filter(f => f.parts);
    const cand = [], seen = new Set(), ext = Math.max(c.ext || c.r, c.r * 0.6);
    for (const k of used) {
      const i0 = Math.floor(k / 4096) - 2048, j0 = k % 4096 - 2048;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = i0 + di, j = j0 + dj, kk = key(i, j);
        if (used.has(kk) || seen.has(kk)) continue;
        seen.add(kk);
        const p = F.toW((i + 0.5) * SP, (j + 0.5) * SP), d = U.dist(p, c) / ext;
        if (d > 1.6 || W.riverDist(p.x, p.y) < 5) continue;
        let roadD = 1e9, pull = 0, rail = 1e9, hw = 1e9;
        for (const [sg, cls] of around(p.x, p.y)) {
          const sd = U.segDist(p.x, p.y, sg[0], sg[1], sg[2], sg[3]);
          if (cls === 'rail') { rail = Math.min(rail, sd); continue; }
          if (sd < roadD) roadD = sd;
          if (cls === 'hw') hw = Math.min(hw, sd);
          pull = Math.max(pull, cls === 'hw' ? 0.35 : cls === 'rd' ? 0.25 : 0.12);
        }
        if (roadD < 2.6) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => used.has(key(i + a, j + b))).length;
        for (const a of apts) pull = Math.max(pull, 0.3 * U.clamp(1 - U.dist(a, p) / (c.r * 3), 0, 1));
        // infill first, then out along the roads, thinning with distance
        const score = d - pull - (nb >= 2 ? 0.35 : 0) + R() * 0.15;
        cand.push({ p, d, score, i, j, rail, hw });
      }
    }
    cand.sort((a, b) => a.score - b.score);
    // the slower checks only for the best few
    const ok = k => !W.inLake(k.p.x, k.p.y) && IC.inHome(k.p.x, k.p.y) && !fields.some(f => U.dist(f, k.p) < (f.parts ? (f.radius || 48) + 4 : 20));
    const pickd = [];
    for (const k of cand) { if (pickd.length >= n) break; if (ok(k)) pickd.push(k); }
    for (const k of pickd) {
      // warehouses by the motorway, industry by the railway, housing everywhere else (denser nearer the centre)
      const d = k.d > 0.5 && k.hw < 10 ? 'log' : k.d > 0.5 && k.rail < 12 ? 'ind' : k.d < 0.35 ? 'dense' : 'sub';
      const g = IC.cityGrowCell(c, k.i, k.j, d, U.clamp(k.d, 0, 1), R, (di, dj) => !used.has(key(k.i + di, k.j + dj)));
      g.b.grown = S.time;
      c.blocks.push(g.b); changed.push(g.b); used.add(key(k.i, k.j));
      for (const l of g.streets) { c.streets.push(l); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of l.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } l.bb = [x0, y0, x1, y1]; }
      c.r = Math.max(c.r, U.dist(g.b, c) * 1.02 / 1.55);
      c.ext = Math.max(c.ext || 0, U.dist(g.b, c) + Math.max(g.b.w, g.b.h) / 2);
    }
    // (traffic finds the new streets the next time the roads change: they are small, and a re-plan is not)
  }
  if (changed.length) { c.mix = IC.cityMix(c); changedBox(S, changed, c); }
}
function emptyBlocks(S, c, n) {
  // the outer suburbs empty first; ruins stay ruins
  const L = c.blocks.filter(b => !b.empty && b.hp > 0).sort((a, b) => (b.sub - a.sub) || (U.dist(b, c) - U.dist(a, c))).slice(0, n);
  for (const b of L) b.empty = true;
  if (L.length) { c.mix = IC.cityMix(c); changedBox(S, L, c); }
}
function changedBox(S, L, c) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of L) { x0 = Math.min(x0, b.x - 6); y0 = Math.min(y0, b.y - 6); x1 = Math.max(x1, b.x + 6); y1 = Math.max(y1, b.y + 6); }
  IC.worldChanged(S, { x0, y0, x1, y1 });
  if (c && IC.cityLights) IC.cityLights(c);
}

/* ---------- roads: cut by weapons, repaired by engineers ---------- */
function edgeBB(e) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } e.bb = [x0, y0, x1, y1]; }
function edgeDist(e, x, y) { let m = 1e9; for (let i = 1; i < e.pts.length; i++) m = Math.min(m, U.segDist(x, y, e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y)); return m; }
/* a weapon landed at x, y: a crater on a road closes it until engineers fill it */
IC.roadHit = function (S, x, y, dmg) {
  if (!S.econ || dmg < 20) return;
  const R = 0.3 + dmg * 0.004;
  for (const e of S.world.edges) {
    if (!e.bb) edgeBB(e);
    const b = e.bb, m = R + 1;
    if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) continue;
    const d = edgeDist(e, x, y), reach = R + HALF[e.cls];
    if (d > reach) continue;
    e.cond = Math.max(0, (e.cond == null ? 1 : e.cond) - dmg / 120 * (1 - d / reach * 0.5));
    if (!S.econ.damaged.includes(e.id)) S.econ.damaged.push(e.id);
    if (e.cond < 0.6 && !e.cut) cutRoad(S, e, x, y);
  }
};
function cutRoad(S, e, x, y) {
  const near = IC.nearestPlace(S, x, y);
  e.cut = true; e.cutAt = { x, y, t: S.time };
  e.cutName = `${CLS_NAME[e.cls]} cut ${/^\d/.test(near) ? near : 'at ' + near}`;
  const hours = (0.6 - e.cond) / repairRate(e) + 0.5;
  IC.log(S, 'leak', 'ROADS', `${e.cutName}. Traffic detours on farm tracks; engineers need about ${U.dur(hours * 3600)} to fill the crater.`, { x, y });
  IC.news(S, `${e.cutName.replace(' cut', '')} closed after a strike; long detours for lorries and buses.`);
  IC.roadsChanged(S);
  IC.worldChanged(S, { x0: x - 10, y0: y - 10, x1: x + 10, y1: y + 10 });
  IC.emit(S, 'roadCut', e);
}
const repairRate = e => (e.cls === 'hw' ? 0.1 : 0.14) * (e.rush ? 3 : 1);   // condition regained per game hour
/* pay the road engineers to work round the clock: three times as fast */
IC.rushCost = e => Math.round((e.len || 10) / 10 * (e.cls === 'hw' ? 3 : 1.5) + 5);
IC.rushRepair = function (S, id) {
  const e = S.world.edges.find(x => x.id === id); if (!e || !e.cut || e.rush) return false;
  const c = IC.rushCost(e); if (S.budget < c) { IC.log(S, 'warn', 'ROADS', `Rushing the repair needs ${U.money(c)}.`); return false; }
  S.budget -= c; e.rush = true;
  IC.log(S, 'info', 'ROADS', `${e.cutName}: engineers now work round the clock, open in about ${U.dur((0.6 - e.cond) / repairRate(e) * 3600)}.`, e.cutAt);
  return true;
};
function repairRoads(S, dt) {
  const E = S.econ;
  if (!E.damaged.length) return;
  const W = S.world;
  for (const id of E.damaged.slice()) {
    const e = W.edges.find(x => x.id === id);
    if (!e) { E.damaged.splice(E.damaged.indexOf(id), 1); continue; }
    e.cond = Math.min(1, e.cond + repairRate(e) * dt / 3600);
    if (e.cut && e.cond >= 0.6) {
      e.cut = false;
      IC.log(S, 'info', 'ROADS', `${e.cutName.replace(' cut', '')} reopened: the crater is filled.`, e.cutAt);
      IC.roadsChanged(S);
      IC.worldChanged(S, { x0: e.cutAt.x - 10, y0: e.cutAt.y - 10, x1: e.cutAt.x + 10, y1: e.cutAt.y + 10 });
      IC.emit(S, 'roadOpen', e);
    }
    if (e.cond >= 1) { E.damaged.splice(E.damaged.indexOf(id), 1); e.cutName = null; e.cutAt = null; e.rush = false; }
  }
}

/* ---------- roads the player builds ---------- */
/* what a click at x, y joins: a road node, a point on a road (the road is split there), or open ground */
IC.roadSnap = function (S, x, y, r) {
  const W = S.world;
  let best = null, bd = r;
  for (const k in W.nodes) { const n = W.nodes[k], d = U.dxy(x, y, n.x, n.y); if (d < bd) { bd = d; best = { x: n.x, y: n.y, node: k }; } }
  if (best) return best;
  for (const e of W.edges) {
    if (!e.bb) edgeBB(e);
    const b = e.bb; if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], q = e.pts[i], d = U.segDist(x, y, a.x, a.y, q.x, q.y);
      if (d >= bd) continue;
      const L2 = (q.x - a.x) ** 2 + (q.y - a.y) ** 2, t = L2 ? U.clamp(((x - a.x) * (q.x - a.x) + (y - a.y) * (q.y - a.y)) / L2, 0, 1) : 0;
      bd = d; best = { x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t, edge: e.id };
    }
  }
  return best || { x, y };
};
/* the airport a road end serves: one of ours, the end inside its grounds or on its own road node */
const aptAt = (S, p, sn) => S.infra.find(f => f.parts && f.owner === 'us' && (f.kind === 'airport' || f.kind === 'airbase') && ((sn && sn.node === f.id) || U.dxy(f.x, f.y, p.x, p.y) < (f.radius || 50) * 0.9));
IC.roadAirport = aptAt;
/* cost, length, bridges and time for a road along pts; why is '' when it can be built */
IC.roadPlan = function (S, cls, pts, snaps) {
  const W = S.world, K = IC.ROADS[cls];
  const P = { cls, km: 0, cost: 0, hours: 0, bridges: [], why: '' };
  if (pts.length < 2) { P.why = 'Click at least two points.'; return P; }
  // one end at one of our airports; the road may run inside that airport's grounds and nowhere else's
  const sa = (snaps || [])[0], sb = (snaps || [])[1];
  const apA = aptAt(S, pts[0], sa), apB = aptAt(S, pts[pts.length - 1], sb), serve = apA || apB;
  P.apt = serve || null;
  let len = 0, slope = 0, forest = 0, n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = U.dist(a, b);
    len += L;
    for (let s = 0; s <= L; s += 1) {
      const t = L ? s / L : 0, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (W.inLake(x, y)) { P.why = 'The road would cross a lake.'; }
      else if (!IC.inHome(x, y)) { P.why = `The road would leave ${W.names.H}.`; }
      else { const ap = S.infra.find(f => f.parts && f !== serve && U.dxy(f.x, f.y, x, y) < (f.radius || 50) * 0.8); if (ap) P.why = `The road would run through ${ap.name}.`; }
      if (P.why) return P;
      slope += W.slopeAt(x, y); forest += W.forestAt(x, y) ? 1 : 0; n++;
    }
    // bridges where the line crosses a river
    for (const r of W.rivers) {
      if (r.bb && (Math.max(a.x, b.x) < r.bb[0] || Math.min(a.x, b.x) > r.bb[2] || Math.max(a.y, b.y) < r.bb[1] || Math.min(a.y, b.y) > r.bb[3])) continue;
      for (let j = 1; j < r.pts.length; j++) {
        const t = U.segX(a.x, a.y, b.x, b.y, r.pts[j - 1][0], r.pts[j - 1][1], r.pts[j][0], r.pts[j][1]);
        if (t >= 0) P.bridges.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x), river: r.name });
      }
    }
  }
  P.km = len / 10;
  // hills mean cuttings and embankments, forest means clearing
  P.terrain = 1 + Math.min(1.5, slope / Math.max(1, n) * 25) + forest / Math.max(1, n) * 0.2;
  P.cost = Math.round(P.km * K.perKm * P.terrain + P.bridges.length * K.bridge);
  P.hours = 2 + P.km / K.kmh * P.terrain + P.bridges.length * 4;
  // the other end joins the network: any road for an access road, a main road or motorway for a link road, a
  // motorway for a motorway link (where it joins, an interchange is built)
  const far = apA ? sb : sa, farE = far && far.edge ? W.edges.find(e => e.id === far.edge) : null;
  const farCls = farE ? [farE.cls] : far && far.node ? W.edges.filter(e => e.a === far.node || e.b === far.node).map(e => e.cls) : [];
  const town = far && far.node && W.cities.some(c => c.id === far.node);
  if (P.km < 1) P.why = 'Too short: a road needs at least 1 km.';
  else if (!serve) P.why = 'Roads you build must serve one of your airports: start or end the road at an airport. Towns build their own streets.';
  else if (apA && apB) P.why = 'The road must run from the airport to the road network, not to another airport.';
  else if (!far || !(far.node || far.edge)) P.why = `The far end must join a road: click on a road or junction.`;
  else if (cls === 'hw' && !farCls.includes('hw')) P.why = 'A motorway link must end on a motorway, where the interchange is built.';
  else if (cls === 'rd' && !town && !farCls.some(c => c === 'rd' || c === 'hw')) P.why = 'A link road must end in a town or on a main road or motorway.';
  else if (S.budget < P.cost) P.why = `Needs ${U.money(P.cost)}; the treasury has ${U.money(S.budget)}.`;
  if (cls === 'hw' && !P.why) P.cost += 40, P.ix = true;   // the interchange: slip roads and a bridge
  return P;
};
/* the road tool: each click adds a point; the first and last snap to the network */
IC.roadClick = function (S, m, p, r) {
  const sn = IC.roadSnap(S, p.x, p.y, r);
  m.pts.push({ x: sn.x, y: sn.y }); m.snaps.push(sn);
  if (m.pts.length > 2) m.snaps[m.pts.length - 2] = null;   // only the ends join the network
  const P = IC.roadPlan(S, m.cls, m.pts, [m.snaps[0], m.snaps[m.snaps.length - 1]]);
  m.plan = P;
  const ap = aptAt(S, p, sn);
  const msg = m.pts.length < 2 ? (ap ? ap.name.toUpperCase() : sn.node || sn.edge ? 'JOINS THE ROADS' : 'OPEN GROUND') : `${P.km.toFixed(1)} KM · ${U.money(P.cost)} · ${U.dur(P.hours * 3600)}${P.bridges.length ? ` · ${P.bridges.length} BRIDGE${P.bridges.length > 1 ? 'S' : ''}` : ''}${P.ix ? ' · INTERCHANGE' : ''}`;
  const bad = P.why && m.pts.length >= 2 && !/treasury/.test(P.why);
  IC.text(S, sn.x, sn.y, msg, IC.C ? (bad ? IC.C.hostile : IC.C.amber) : '');
  return P;
};
IC.roadUndo = function (S, m, r) {
  m.pts.pop(); m.snaps.pop();
  const n = m.pts.length;
  if (n) { const p = m.pts[n - 1]; m.snaps[n - 1] = IC.roadSnap(S, p.x, p.y, r); }
  m.plan = n >= 2 ? IC.roadPlan(S, m.cls, m.pts, [m.snaps[0], m.snaps[n - 1]]) : null;
};
/* start the works: paid now, open when finished */
IC.roadFinish = function (S, m) {
  const ends = [m.snaps[0], m.snaps[m.snaps.length - 1]];
  const P = IC.roadPlan(S, m.cls, m.pts, ends);
  if (P.why) { IC.log(S, 'warn', 'ROADS', P.why); return false; }
  S.budget -= P.cost;
  const E = S.econ, K = IC.ROADS[m.cls];
  const w = { id: 'rw' + (E.nid++), cls: m.cls, pts: m.pts.map(p => ({ x: p.x, y: p.y })), ends, cost: P.cost, km: P.km, bridges: P.bridges, hours: P.hours, prog: 0, stage: 'Surveying', t0: S.time, apt: P.apt.id };
  if (P.apt.catch0 == null) P.apt.catch0 = IC.aptCatchment(S, P.apt);
  w.name = `${P.apt.name.replace(/ (International|Airport)$/, '')} ${K.short}`;
  E.works.push(w);
  IC.log(S, 'info', 'ROADS', `${w.name}: ${P.km.toFixed(1)} km for ${U.money(P.cost)}${P.bridges.length ? `, ${P.bridges.length} bridge${P.bridges.length > 1 ? 's' : ''}` : ''}. Open in about ${U.dur(P.hours * 3600)}.`, w.pts[0]);
  IC.worldChanged(S, boxOf(w.pts));
  IC.emit(S, 'roadStart', w);
  return w;
};
const boxOf = pts => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x0: x0 - 5, y0: y0 - 5, x1: x1 + 5, y1: y1 + 5 }; };
function works(S, dt) {
  const E = S.econ;
  for (const w of E.works) {
    w.prog = Math.min(1, w.prog + dt / (w.hours * 3600));
    w.stage = w.prog < 0.1 ? 'Surveying' : w.prog < 0.6 ? (w.bridges.length ? 'Earthworks and bridges' : 'Earthworks') : w.prog < 1 ? 'Paving' : 'Open';
    if (w.prog >= 1) openRoad(S, w);
  }
  E.works = E.works.filter(w => w.prog < 1);
  S.world.roadWorks = E.works;
}
/* a node where the road ends: an existing one, a new junction on a road, or a new end on open ground */
function endNode(S, sn) {
  const W = S.world, E = S.econ;
  if (sn.node && W.nodes[sn.node]) return sn.node;
  if (sn.edge) {
    let e = W.edges.find(x => x.id === sn.edge);
    // the road may have been split since: take the piece that passes the point
    if (!e || edgeDist(e, sn.x, sn.y) > 0.5) e = W.edges.filter(x => !x.bb || (sn.x > x.bb[0] - 1 && sn.x < x.bb[2] + 1 && sn.y > x.bb[1] - 1 && sn.y < x.bb[3] + 1)).sort((a, b) => edgeDist(a, sn.x, sn.y) - edgeDist(b, sn.x, sn.y))[0];
    if (e && edgeDist(e, sn.x, sn.y) < 1) return IC.splitRoad(S, e, sn.x, sn.y);
  }
  const id = 'np' + (E.nid++);
  W.nodes[id] = { id, x: sn.x, y: sn.y, jct: true, deg: 0, ix: false };
  return id;
}
/* split a road at the point nearest x, y; returns the new junction */
IC.splitRoad = function (S, e, x, y) {
  const W = S.world, E = S.econ;
  let bi = 1, bd = 1e9, bt = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], d = U.segDist(x, y, a.x, a.y, b.x, b.y);
    if (d < bd) { const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; bd = d; bi = i; bt = L2 ? U.clamp(((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / L2, 0, 1) : 0; }
  }
  const a = e.pts[bi - 1], b = e.pts[bi], P = { x: a.x + (b.x - a.x) * bt, y: a.y + (b.y - a.y) * bt };
  const na = W.nodes[e.a], nb = W.nodes[e.b];
  if (U.dist(P, na) < 3) return e.a;
  if (U.dist(P, nb) < 3) return e.b;
  const id = 'np' + (E.nid++);
  W.nodes[id] = { id, x: P.x, y: P.y, jct: true, deg: 2, ix: false };
  const e2 = { id: 'ep' + (E.nid++), a: id, b: e.b, cls: e.cls, pts: [P].concat(e.pts.slice(bi)), cut: e.cut, cond: e.cond, cutName: e.cutName, cutAt: e.cutAt };
  e.pts = e.pts.slice(0, bi).concat([P]); e.b = id;
  for (const q of [e, e2]) { q.len = 0; for (let i = 1; i < q.pts.length; i++) q.len += U.dist(q.pts[i - 1], q.pts[i]); edgeBB(q); q.cum = null; }
  W.edges.push(e2);
  if (e.cond != null && e.cond < 1) E.damaged.push(e2.id);
  // bridges belong to whichever half they sit on
  for (const br of W.bridges) if (br.edge === e.id && edgeDist(e2, br.x, br.y) < edgeDist(e, br.x, br.y)) br.edge = e2.id;
  if (IC.trafficRoadChanged) { IC.trafficRoadChanged(S, e); IC.trafficRoadChanged(S, e2); }
  return id;
};
function openRoad(S, w) {
  const W = S.world, E = S.econ;
  if (w.apt && S.byId[w.apt]) w.catchB = IC.aptCatchment(S, S.byId[w.apt]);
  // the trip it was built for, timed before and after: between the places nearest its two ends
  const pa = nearestTown(S, w.pts[0]), pb = nearestTown(S, w.pts[w.pts.length - 1]);
  const before = pa && pb && pa !== pb ? tripTime(S, pa, pb) : 0;
  const a = endNode(S, w.ends[0]), b = endNode(S, w.ends[1]);
  const pts = w.pts.map(p => ({ x: p.x, y: p.y }));
  pts[0] = { x: W.nodes[a].x, y: W.nodes[a].y }; pts[pts.length - 1] = { x: W.nodes[b].x, y: W.nodes[b].y };
  const e = { id: 'ep' + (E.nid++), a, b, cls: w.cls, pts, built: S.time, player: true };
  e.len = 0; for (let i = 1; i < pts.length; i++) e.len += U.dist(pts[i - 1], pts[i]);
  edgeBB(e);
  W.edges.push(e);
  W.nodes[a].deg = (W.nodes[a].deg || 0) + 1; W.nodes[b].deg = (W.nodes[b].deg || 0) + 1;
  for (const k of [a, b]) { const n = W.nodes[k]; if (w.cls === 'hw' && n.deg > 2) n.ix = true; }
  for (const bp of w.bridges) {
    const br = { id: 'br' + W.bridges.length + 'p' + E.nid++, kind: 'bridge', x: bp.x, y: bp.y, edge: e.id, cls: w.cls, a: bp.a, river: bp.river, name: `${bp.river.replace(' River', '')} Bridge (new)` };
    W.bridges.push(br);
    Object.assign(br, { infra: true, owner: 'us', r: 8, max: 40, hp: 40, home: true });
    S.infra.push(br); S.byId[br.id] = br;
  }
  // the junctions it makes get their shape (a motorway link its interchange), and traffic finds the new road
  IC.buildJunctions(W);
  if (IC.trafficRoadChanged) IC.trafficRoadChanged(S, e);
  IC.roadsChanged(S);
  refreshRoads(S);
  IC.worldChanged(S, boxOf(pts));
  const after = before ? tripTime(S, pa, pb) : 0;
  let gain = before && after < before - 60 ? ` ${pa.name} to ${pb.name} now takes ${hm(after)} instead of ${hm(before)}.` : '';
  const ap = w.apt && S.byId[w.apt];
  if (ap) { const c1 = IC.aptCatchment(S, ap), c0 = w.catchB != null ? w.catchB : c1; if (c1 > c0 + 4) gain += ` ${ap.name} now reaches ${Math.round(c1 - c0)}k more people within ${IC.GROWTH.catch[1]} h by road.`; }
  IC.log(S, 'kill', 'ROADS', `${w.name} is open.${gain}`, pts[0]);
  IC.news(S, `New ${IC.ROADS[w.cls].short} opens near ${pa ? pa.name : 'the capital'}.`);
  IC.emit(S, 'roadOpen', e);
}
/* people within reach of an airport by road: every city counts in full within half an hour, less out to 2½ h */
IC.aptCatchment = function (S, ap) {
  const E = S.econ; if (!E) return 0;
  let n = 0; for (const c of IC.cities(S)) if (c.owner === 'us') n += c.pop * catchF(timeTo(S, E.tt[c.id], ap) / 3600);
  return Math.round(n);
};
/* what the airport panel says about its roads */
IC.aptRoadReport = function (S, ap) {
  const E = S.econ; if (!E || !ap.parts) return null;
  if (ap.catch0 == null) ap.catch0 = IC.aptCatchment(S, ap);
  const now = IC.aptCatchment(S, ap), d = now - ap.catch0, k = v => v >= 1000 ? `${(v / 1000).toFixed(1)}M` : `${v}k`;
  const links = E.works.filter(w => w.apt === ap.id);
  return {
    catch: now,
    text: `${k(now)} people within ${IC.GROWTH.catch[1]} h by road${Math.abs(d) >= 5 ? ` (${d > 0 ? '+' : '−'}${k(Math.abs(d))} since the start${d > 0 ? ', thanks to new roads' : ', roads cut'})` : ''}.`,
    works: links.map(w => `${w.name}: ${w.stage.toLowerCase()}, open in ${U.dur((1 - w.prog) * w.hours * 3600)}.`)
  };
};
function nearestTown(S, p) {
  let best = null, bd = 1e9;
  for (const c of IC.cities(S)) { const d = U.dist(c, p); if (d < bd) { bd = d; best = c; } }
  for (const i of S.econ.inds) { const d = U.dist(i, p); if (d < bd) { bd = d; best = i; } }
  return best;
}
function tripTime(S, a, b) { const T = IC.travelFrom(S.world, nodeOf(S, a).id, false); return timeTo(S, T, b); }
IC.tripTime = tripTime;

/* ---------- money: loans and the weekly statement ---------- */
IC.loanLimit = S => { const wk = IC.weekStatement(S, 1); const inc = wk ? wk.income : 0; return Math.max(300, Math.round(inc * 1.5 / 50) * 50); };
IC.loanOwed = S => S.econ ? S.econ.loans.reduce((s, l) => s + l.left, 0) : 0;
IC.takeLoan = function (S, i) {
  const O = IC.LOANS[i], E = S.econ;
  if (!O || !E) return false;
  if (IC.loanOwed(S) + O.amt > IC.loanLimit(S)) { IC.log(S, 'warn', 'TREASURY', `The banks will not lend more: ${U.money(IC.loanOwed(S))} is already owed, the limit is ${U.money(IC.loanLimit(S))}.`); return false; }
  const l = { id: 'ln' + (E.nid++), amt: O.amt, left: O.amt, days: O.days, t0: S.time };
  E.loans.push(l);
  S.budget += O.amt; book(S, 'loanIn', O.amt);
  IC.log(S, 'info', 'TREASURY', `Borrowed ${U.money(O.amt)} over ${O.days} days at ${(IC.LOAN_RATE * 100).toFixed(1)}% a day: about ${U.money(IC.loanPay(l) * 24)} a day to repay.`);
  IC.emit(S, 'loan', l);
  return l;
};
/* ₭M an hour: principal spread over the term plus interest on what is left */
IC.loanPay = l => l.amt / l.days / 24 + l.left * IC.LOAN_RATE / 24;
IC.loanRate = S => S.econ ? S.econ.loans.reduce((s, l) => s + IC.loanPay(l), 0) : 0;
IC.repayLoan = function (S, id) {
  const E = S.econ, l = E && E.loans.find(x => x.id === id);
  if (!l || S.budget < l.left) return false;
  S.budget -= l.left; book(S, 'loanOut', -l.left);
  E.loans = E.loans.filter(x => x !== l);
  IC.log(S, 'info', 'TREASURY', `Loan of ${U.money(l.amt)} paid off early.`);
  return true;
};
function loans(S, dt) {
  const E = S.econ;
  for (const l of E.loans) l.left = Math.max(0, l.left - l.amt / l.days / 24 * dt / 3600);
  for (const l of E.loans.filter(x => x.left <= 0.001)) IC.log(S, 'info', 'TREASURY', `Loan of ${U.money(l.amt)} repaid.`);
  E.loans = E.loans.filter(x => x.left > 0.001);
}
/* money booked by kind: + comes in, − goes out */
function book(S, k, v) { const E = S.econ; if (!E || !v) return; E.book[k] = (E.book[k] || 0) + v; E.booked = (E.booked || 0) + v; }
IC.econBook = book;
IC.STATEMENT = {
  base: 'Government grant', tax: 'Taxes', trade: 'Trade taxes', apt: 'Airport revenue', aid: 'Allied support',
  fee_land: 'Landing fees', fee_pax: 'Passenger charges', fee_cargo: 'Cargo charges', fee_over: 'Overflight fees', oneoff: 'Aid, bonds and grants',
  loanIn: 'Loans taken', upApt: 'Airport upkeep', upStaff: 'Staff', upAD: 'Air defence upkeep', upAir: 'Air force upkeep', upG: 'Army upkeep',
  loan: 'Loan repayments and interest', loanOut: 'Loans paid off early', other: 'Construction, orders and research'
};
function closeBooks(S) {
  // what the treasury did that nobody booked: building, buying, research
  const E = S.econ, d = S.budget - E.lastBudget - (E.booked || 0);
  if (Math.abs(d) > 1e-6) E.book[d < 0 ? 'other' : 'oneoff'] = (E.book[d < 0 ? 'other' : 'oneoff'] || 0) + d;
  E.lastBudget = S.budget; E.booked = 0;
}
function sumBooks(list) { const o = {}; for (const b of list) for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; }
/* the statement for this week so far (ago=0) or a finished week (ago=1: last week) */
IC.weekStatement = function (S, ago) {
  const E = S.econ; if (!E) return null;
  const wk = Math.floor((E.day - 1) / 7) - (ago || 0);
  if (wk < 0) return null;
  const days = E.days.filter(d => Math.floor((d.day - 1) / 7) === wk).map(d => d.book);
  if (!ago) { closeBooks(S); days.push(E.book); }
  if (!days.length) return null;
  const b = sumBooks(days);
  const lines = Object.keys(b).filter(k => Math.abs(b[k]) >= 0.05).sort((p, q) => b[q] - b[p]).map(k => ({ k, name: IC.STATEMENT[k] || k, v: b[k] }));
  const income = lines.filter(l => l.v > 0 && l.k !== 'loanIn').reduce((s, l) => s + l.v, 0);
  const spend = lines.filter(l => l.v < 0).reduce((s, l) => s + l.v, 0);
  return { week: wk + 1, from: wk * 7 + 1, to: wk * 7 + 7, days: days.length, lines, income, spend, net: income + spend + (b.loanIn || 0) };
};

/* ---------- what a city panel says ---------- */
IC.cityReport = function (S, c) {
  const E = S.econ; if (!E || !c.air) return null;
  const R = { lines: [] };
  const g = (c.pop / Math.max(1, c.wk.pop0) - 1);
  const parts = [['air', 'air service'], ['road', 'road links'], ['war', 'war damage']].map(([k, n]) => [k, n, c.wk[k]]).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
  let why = '';
  const top = parts[0];
  if (Math.abs(top[2]) > 0.0005) {
    if (top[0] === 'air' && top[2] > 0) {
      const aps = ourAirports(S).filter(a => catchF(timeTo(S, E.tt[c.id], a) / 3600) > 0.3).map(a => a.id);
      const fresh = S.av ? S.av.routes.filter(r => r.st === 'active' && r.since > E.t0 + 1 && S.time - r.since < WEEK && (aps.includes(r.a) || (r.b.apt && aps.includes(r.b.apt)))) : [];
      const to = [...new Set(fresh.map(r => shortName(aps.includes(r.a) ? IC.avEnd(S, r.b).name : S.byId[r.a].name)))];
      why = to.length ? `mostly from new routes to ${to.slice(0, 3).join(', ')}${to.length > 3 ? ' and more' : ''}` : 'mostly from its air service';
    } else if (top[0] === 'road') why = top[2] > 0 ? 'mostly from better road links' : 'mostly from cut roads';
    else if (top[0] === 'war') why = 'mostly from war damage';
  }
  const lack = [c.air.score < 0.05 ? 'no air service within reach' : '', c.rc <= c.rc0 * 1.01 ? 'no new road links' : ''].filter(Boolean).join(' and ');
  R.growth = Math.abs(g) < 0.0005 ? `Unchanged this week${lack ? `: ${lack}` : ''}.` : `${g >= 0 ? 'Grew' : 'Shrank'} ${Math.abs(g * 100).toFixed(1)}% this week, ${why || (lack ? `with ${lack}` : 'as people move to better-connected cities')}.`;
  R.rate = `${pct1(c.gr.tot / 100)} a day now (air ${pct1(c.gr.air / 100)}, roads ${pct1(c.gr.road / 100)}${c.gr.war < -0.01 ? `, war ${pct1(c.gr.war / 100)}` : ''}, drift ${pct1(c.gr.base / 100)}).`;
  const best = c.air.best && S.byId[c.air.best];
  if (best) R.air = `${shortName(best.name)}, ${hm(c.air.bestT)} by road: ${Math.round(best.svc.deps)} departures a day to ${best.svc.dests.size} places.`;
  else if (c.air.near) R.air = `No airline service within ${IC.GROWTH.catch[1]} h. The nearest airport, ${shortName(S.byId[c.air.near].name)}, is ${hm(c.air.bestT)} away${S.byId[c.air.near].svc && !S.byId[c.air.near].svc.deps ? ' and has no flights' : ''}.`;
  else R.air = 'No airport.';
  R.demand = `${Math.round(c.air.demand).toLocaleString('en-US')} passengers a day of ${Math.round(c.air.pot).toLocaleString('en-US')} who would fly with perfect service.`;
  const trade = c.rc / Math.max(1, c.rcI);
  R.cuts = c.cuts.slice(0, 3).map(x => `${x.why}: trips to ${x.name} take ${hm(x.tN)} instead of ${hm(x.tI)}.`);
  R.roads = trade < 0.98 ? `Roads cut: trade with other cities down ${U.pct(1 - trade)} until they are repaired.` : c.rc > c.rc0 * 1.01 ? `New roads: trade reach ${U.pct(c.rc / c.rc0 - 1)} better than at the start.` : 'Road links as at the start.';
  R.inds = E.inds.filter(i => i.f.market === c.id).map(i => `${i.name}: ${U.money(i.out * 24)} a day.`);
  return R;
};

/* re-read everything now (after a change the player should see at once) */
IC.econRefresh = function (S) {
  const E = S.econ; if (!E) return;
  refreshRoads(S); airService(S);
  for (const i of E.inds) indOutput(S, i);
  fuelRoads(S);
};

/* ---------- the tick ---------- */
IC.growth = function (S, dt) {
  const E = S.econ; if (!E) return;
  repairRoads(S, dt);
  works(S, dt);
  loans(S, dt);
  // fuel for the airports comes by lorry: a cut road on the way slows the tankers
  if (E.fuelF) for (const ap of ourAirports(S)) {
    const f = E.fuelF[ap.id]; if (f == null || f >= 1) continue;
    for (const t of ap.parts) if (t.kind === 'fuel' && t.built && t.stock > 0) t.stock = Math.max(0, t.stock - IC.FUEL_IN * (1 - f) * dt / 3600);
  }
  E.tickT -= dt;
  if (E.tickT <= 0) {
    E.tickT = TICK;
    if (E.roadsDirty) refreshRoads(S);
    airService(S);
    for (const i of E.inds) indOutput(S, i);
    fuelRoads(S);
    grow(S, TICK);
  }
  // day book: close it at midnight; the week's figures are sums of days
  const day = U.day(S.time);
  if (day !== E.day) {
    closeBooks(S);
    E.days.push({ day: E.day, book: E.book, pop: IC.cities(S).reduce((s, c) => s + c.pop, 0), demand: IC.cities(S).reduce((s, c) => s + (c.air ? c.air.demand : 0), 0) });
    if (E.days.length > 21) E.days.shift();
    E.book = {}; E.day = day;
    if ((day - 1) % 7 === 0) for (const c of IC.cities(S)) { c.wkLast = c.wk; c.wk = { pop0: c.pop, air: 0, road: 0, war: 0 }; }
  }
};
/* each airport's fuel comes from the nearest city of 300k by road; a detour means fewer tankers an hour */
function fuelRoads(S) {
  const E = S.econ; E.fuelF = {};
  for (const ap of ourAirports(S)) {
    let best = Infinity, bestI = Infinity;
    for (const c of IC.cities(S)) if (c.owner === 'us' && (c.pop >= 300 || c.capital)) { best = Math.min(best, timeTo(S, E.tt[c.id], ap)); bestI = Math.min(bestI, timeTo(S, E.ti[c.id], ap)); }
    E.fuelF[ap.id] = isFinite(best) && best > 0 ? U.clamp(bestI / best, 0.25, 1) : 1;
  }
}

})(window.IC);
