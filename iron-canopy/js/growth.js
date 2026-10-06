/* Iron Canopy — growth, trade and roads. Cities fly as much as their size, wealth and air service allow; good
   service and good roads make them grow, and growth adds real blocks and streets. Industries, some far from any
   city, sell at home by road and abroad by air cargo or lorry, and pay trade taxes. Roads are links between
   places: the player builds them, weapons cut them, and every change re-times the trips between cities, which
   trade, growth, airport catchments, fuel deliveries and convoys all follow. Money is booked into a monthly
   statement and a yearly review, with loans for the big projects. */
(function (IC) {
'use strict';
const U = IC.U;
const DAY = 86400, WEEK = 7 * DAY, TICK = 300;
const OPS_DAY = 17 * 3600; // airliners fly 06:00–23:00; freighters round the clock

/* ---------- tuning, in plain units ---------- */
IC.GROWTH = {
  flyRate: 28,        // passengers a day per thousand people, at full prosperity and perfect air service
  cargoRate: 0.1,     // tonnes of air cargo a day per thousand people in an average city
  catch: [0.5, 2.5],  // hours by road to the airport: everyone flies within half an hour, nobody beyond 2½ h
  freqDeps: 60,       // departures a day at which frequency is about two-thirds of the way to "fly any time"
  dests: 6,           // places served at which choice is about two-thirds of the way to "fly anywhere"
  airGrowth: 0.5,     // % a day a city grows with perfect air service
  roadGrowth: 1.5,    // % a day for each 100% better road links than at the start
  drift: -0.08,       // % a day with nothing going for a city: people move to where the connections are
  tradeTax: 0.15,     // share of industry sales paid in trade taxes
  // the Career runs on the calendar: cities grow by the year, so one with good service can double in a decade
  airYear: 7,         // % a year with perfect air service
  roadYear: 20,       // % a year for each 100% better road links than at the start
  driftYear: -1,      // % a year with nothing going for a city
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
/* loans: in the Career they run for years with interest by the month; a Quick war runs on the live clock, in days */
IC.LOANS = [{ amt: 300, mo: 12 }, { amt: 800, mo: 24 }, { amt: 2000, mo: 48 }];
IC.LOANS_LIVE = [{ amt: 100, days: 5 }, { amt: 300, days: 10 }, { amt: 800, days: 20 }];
IC.LOAN_RATE_MO = 0.01;  // Career: interest a month on what is still owed
IC.LOAN_RATE = 0.004;    // on the live clock: interest a game day

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
    tt: {}, ti: {}, book: {}, days: [], lastBudget: S.budget, day: U.day(S.time), mb: {}, months: [], mT: S.time };
  E.mStart = null;
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
    if (E.inds.length >= 14) break;
    if (E.inds.some(i => U.dist(i, v) < 1000)) continue;
    const h = W.hAt(v.x, v.y), forest = [0, 1, 2, 3].filter(k => W.forestAt(v.x + Math.cos(k * 1.57) * 40, v.y + Math.sin(k * 1.57) * 40)).length;
    let kind = h > 0.5 ? 'mine' : forest >= 2 ? 'timber' : W.farmAt(v.x, v.y) > 0.25 ? 'farm' : 'quarry';
    if (kinds.filter(k => k === kind).length >= 2) kind = ['farm', 'quarry', 'timber', 'mine'].find(k => !kinds.includes(k)) || kind;
    kinds.push(kind);
    const K = IC.INDUSTRY[kind];
    E.inds.push({ id: v.id, kind, name: `${v.name} ${K.name}`, place: v.name, x: v.x, y: v.y, cap: K.cap * R.range(0.8, 1.25), out: 0, f: {} });
  }
  IC.supplyInit(S);
  refreshRoads(S);
  airService(S);
  for (const c of IC.cities(S)) c.rc0 = c.rcI;
  for (const i of E.inds) indOutput(S, i);
};

/* ---------- where things are on the road network ---------- */
// (an airport or industry is not a road node: its nearest one is found once and kept until the roads change;
// the scan over every node was a fifth of the step when time runs fast)
const NEAR = new WeakMap();
const nodeOf = (S, p) => {
  if (S.world.nodes[p.id]) return { id: p.id, t: 0 };
  const v = S.econ ? S.econ.roadVer || 0 : -1, c = NEAR.get(p);
  if (c && c.v === v && c.x === p.x && c.y === p.y) return c.n;
  const n = IC.nodeNear(S.world, p.x, p.y);
  NEAR.set(p, { v, x: p.x, y: p.y, n });
  return n;
};
/* seconds by road from a source (a city or an industry, with its Dijkstra tree) to any place */
function timeTo(S, T, p) { if (!T) return Infinity; const n = nodeOf(S, p), v = T.t[n.id]; return v == null ? Infinity : v + n.t; }
IC.econTime = (S, from, to, intact) => timeTo(S, (intact ? S.econ.ti : S.econ.tt)[from.id], to);
/* a place's trade reach: the people it can trade with, the nearer (in time) the more */
const reachOf = (S, T, self) => { let s = 0; for (const d of IC.cities(S)) if (d !== self && d.owner === 'us') s += d.pop * Math.exp(-timeTo(S, T, d) / 7200); return s; };

/* the travel-time trees from every city and industry (a load rebuilds them rather than saving them) */
IC.econTrees = function (S) {
  const E = S.econ, W = S.world;
  E.tt = {}; E.ti = {};
  for (const p of IC.cities(S).concat(E.inds)) { const n = nodeOf(S, p).id; E.tt[p.id] = IC.travelFrom(W, n, false); E.ti[p.id] = IC.travelFrom(W, n, true); }
};
function refreshRoads(S) {
  const E = S.econ, W = S.world;
  E.roadsDirty = false; E.roadVer = (E.roadVer || 0) + 1;
  IC.econTrees(S);
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
  for (const ap of ourAirports(S)) ap.svc = { deps: 0, seats: 0, cargoT: 0, fr: 0, dests: new Set(), delay: 0, q: 0, demand: 0, lf: 0.8, cargoDem: 0 };
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
  // what each city's districts want (cities.js): offices fly on business and want frequent flights, big housing
  // estates go on holiday and look at places served and fares, industry and warehouses ship air cargo. The shares
  // are measured against the country's average city, so they move demand between cities, not the national total.
  const ours = IC.cities(S).filter(c => c.owner === 'us');
  const Z = IC.seasonOf(S);
  const dem = new Map(ours.map(c => [c, IC.cityDemand && c.mix ? IC.cityDemand(c) : { pax: 1, cargo: 1, bizShare: 0.5 }]));
  const popT = ours.reduce((s, c) => s + c.pop, 0) || 1;
  const paxN = ours.reduce((s, c) => s + c.pop * dem.get(c).pax, 0) / popT || 1, cargoN = ours.reduce((s, c) => s + c.pop * dem.get(c).cargo, 0) / popT || 1;
  // each city sends its flyers to the airports within reach, in proportion to how good they are for it
  for (const c of IC.cities(S)) {
    const T = S.econ.tt[c.id];
    c.air = { score: 0, demand: 0, best: null, bestT: Infinity, pot: 0, cargo: 0 };
    if (c.owner !== 'us') continue;
    const D = dem.get(c), b = D.bizShare, opts = [], cargoTo = [];
    for (const ap of ourAirports(S)) {
      const v = ap.svc, t = timeTo(S, T, ap);
      const q = ap.offline ? 0 : ((0.3 + 0.4 * b) * v.freqF + (0.7 - 0.4 * b) * v.destF) * v.relF * Math.pow(v.fareF, 1.5 - b);
      const w = catchF(t / 3600) * q;
      if (t < c.air.bestT) { c.air.bestT = t; c.air.near = ap.id; }
      if (w > 0) opts.push([ap, w, t]);
      const wc = catchCargo(t); if (wc > 0 && !ap.offline) cargoTo.push([ap, wc]);
    }
    // a second airport within reach helps, less than the first
    const tot = opts.reduce((s, o) => s + o[1], 0);
    c.air.score = 1 - opts.reduce((p, o) => p * (1 - o[1]), 1);
    // (the season: holidays fly in summer and at Christmas, business thins out in August)
    c.air.pot = c.pop * G.flyRate * c.prosp * D.pax / paxN * ((1 - b) * Z.leisure + b * Z.biz);
    c.air.demand = c.air.pot * c.air.score;
    c.air.bizShare = b;
    const best = opts.sort((a, b2) => b2[1] - a[1])[0];
    if (best) { c.air.best = best[0].id; c.air.bestT = best[2]; }
    for (const [ap, w] of opts) ap.svc.demand += c.air.demand * w / tot;
    // air cargo goes to the airports within a lorry's reach, the nearest taking most
    c.air.cargo = c.pop * G.cargoRate * c.prosp * D.cargo / cargoN;
    const ct = cargoTo.reduce((s, o) => s + o[1], 0);
    for (const [ap, w] of cargoTo) ap.svc.cargoDem += c.air.cargo * w / ct;
  }
  for (const ap of ourAirports(S)) { const v = ap.svc; v.lf = v.seats > 0 ? U.clamp(v.demand / v.seats, 0.35, 0.97) : 0.8; }
}
/* share of seats airlines fill at this airport */
IC.loadFactor = (S, ap) => ap && ap.svc ? ap.svc.lf : 0.78;
IC.cargoLoad = (S, ap) => ap && ap.svc ? U.clamp(0.45 + ((ap.svc.exportT || 0) + (ap.svc.cargoDem || 0)) / Math.max(1, ap.svc.cargoT), 0.45, 1) : 0.7;
/* how much cargo airlines want more flights here: cargo waiting for room over the room offered */
IC.cargoPull = (S, ap) => ap && ap.svc ? ((ap.svc.exportT || 0) + (ap.svc.cargoDem || 0)) / Math.max(20, ap.svc.cargoT) : 0;
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
    // (on the live clock rates are % a day; in the Career % a year, and war damage, which is live, counts its days)
    const yr = S.mode === 'story', dy = yr ? 12 * IC.dpm(S) : 1;
    const g = {
      air: (yr ? G.airYear : G.airGrowth) * c.air.score,
      road: (yr ? G.roadYear : G.roadGrowth) * U.clamp(c.rc / Math.max(1, c.rc0) - 1, -0.6, 0.6),
      war: (-(1 - alive) * 3 - (war ? 0.1 : 0)) * dy,
      base: yr ? G.driftYear : G.drift
    };
    g.tot = U.clamp(g.air + g.road + g.war + g.base, -2 * dy, 2 * dy);
    c.gr = g;
    const k = dt / (yr ? IC.YR(S) : DAY) / 100;
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
  IC.pay(S, 'repair', c); e.rush = true;
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

/* ---------- where the country's roads meet an airport ---------- */
/* An airport's own road comes in to a gate on its landside, round the airfield, never across it. Other roads that
   pass under its runways, taxiways or aprons go in a tunnel (W.tunnels); farm lanes that ran across the field stop
   at its edge, and streets under it are closed. Railways pass in a tunnel too. Called when an airport is laid out. */
IC.aptGate = function (S, ap) {
  // a landside laid out from data: the road end nearest the towns it serves
  if (ap.land && ap.land.fixed && ap.exits && ap.exits.length) { const c = ap.cityRef || (S && IC.cap && IC.cap(S)) || ap; return ap.exits.slice().sort((a, b) => U.dist(a, c) - U.dist(b, c))[0]; }
  const terms = ap.parts.filter(p => p.kind === 'terminal').sort((a, b) => IC.partArea(b) - IC.partArea(a));
  const E = IC.aptKeepOut(S, ap, { m: 0.2 });
  const F = IC.aptFence(ap), hull = F ? IC.shapePoly(F.poly) : null;
  const clear = p => !E.some(b => IC.shapeDist(b.sh, p) < b.pad + 0.4) && !(hull && IC.shapeDist(hull, p) < 0.5 && !F.carveA.some(cv => U.inPoly(p.x, p.y, cv)));
  if (terms.length) {
    const t = terms[0], sd = IC.landSide(ap, t);
    for (let d = IC.LAND_DEPTH + 0.6; d < 30; d += 0.5) { const g = IC.rectWorld(t, 0, sd * (t.h / 2 + d)); if (clear(g)) return g; }
  }
  // no terminal: out from the side where the buildings are (an air base's gate is by its hangars and tower)
  const loc = p => IC.rectLocal({ x: ap.x, y: ap.y, a: ap.rwyA || 0 }, p);
  const blds = ap.parts.filter(p => p.x != null && p.kind !== 'ils' && p.kind !== 'apron' && p.kind !== 'surface');
  const my = blds.reduce((s, p) => s + loc(p).y, 0) / Math.max(1, blds.length), mx = blds.reduce((s, p) => s + loc(p).x, 0) / Math.max(1, blds.length);
  const sd = my < 0 ? -1 : 1;
  for (let d = 2; d < 60; d += 0.5) { const g = IC.aptLocal(ap, mx, my + sd * d); if (clear(g)) return g; }
  return null;
};
IC.aptSeatRoads = function (S, ap) {
  const W = S.world; if (!W || !W.edges || !ap.parts || !ap.parts.length) return false;
  // (what the roads were before: the answer is whether anything changed)
  const sig = () => { let h = 0; for (const e of W.edges) if (e.a === ap.id || e.b === ap.id || e.apt === ap.id) for (const q of e.pts) h = (h * 31 + Math.round(q.x * 10) + Math.round(q.y * 10) * 7) % 1e9; for (const t of W.tunnels || []) if (t.apt === ap.id) h = (h * 31 + Math.round(t.a.x * 10) + Math.round(t.b.y * 10)) % 1e9; return h + ':' + W.lanes.length + ':' + (W.cities || []).reduce((n, c) => n + (c.streets ? c.streets.length : 0), 0); };
  const before = sig();
  W.tunnels = (W.tunnels || []).filter(t => t.apt !== ap.id);
  const els = IC.aptElements(S, ap, { noWorld: true });
  const terms = ap.parts.filter(p => p.kind === 'terminal' || p.kind === 'cargo');
  const env = ap.land && ap.land.fixed ? [] : terms.map(t => IC.landEnvelope(ap, t));
  const fence = IC.aptFence(ap), keep = IC.aptKeepOut(S, ap, { els, m: 0.3, envelopes: env });
  // (the fence itself, less the landside: the road comes up to the gate outside it)
  if (fence) keep.push({ sh: IC.shapePoly(fence.poly), pad: 0.15, fence: true });
  const airOnly = IC.aptKeepOut(S, ap, { els, m: 0, skip: e => e.cat === 'land' || e.cat === 'park' });
  const near = (p, pad) => keep.some(b => IC.shapeDist(b.sh, p) < b.pad + pad);
  const box = pts => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return [x0, y0, x1, y1]; };
  const abox = box(els.flatMap(e => e.sh.poly || e.sh.line || []));
  const inFence = p => fence && U.inPoly(p.x, p.y, fence.hullA) && !fence.carveA.some(c => U.inPoly(p.x, p.y, c));
  // the airport's own roads: the one generation gave it (its node), and roads built for it (e.apt), each by the end
  // nearer the airfield; kept as far as the approach to the airfield, then round it to the gate
  const own = W.edges.filter(e => e.a === ap.id || e.b === ap.id || e.apt === ap.id);
  const G = own.length ? IC.aptGate(S, ap) : null;
  // (a landside laid out from data: the road comes to its end without crossing its other roads on the way)
  if (G && ap.land && ap.land.fixed) for (const r of ap.land.roads) {
    if ((r.lv || 0) < 0) continue;
    let run = [];
    const flush = () => { if (run.length > 1) keep.push({ sh: IC.shapeLine(run, (r.w || 0.1) / 2), pad: 0.1 }); run = []; };
    for (const q of r.pts) { if (U.dist(q, G) < 0.6) flush(); else run.push(q); }
    flush();
  }
  const moved = new Map();
  if (G) for (const e of own) {
    const endA = e.a === ap.id || (e.b !== ap.id && U.dist(e.pts[0], ap) < U.dist(e.pts[e.pts.length - 1], ap));
    const pts = endA ? e.pts.slice().reverse() : e.pts.slice(), endId = endA ? e.a : e.b;
    // (a layout with a road out at each end: each country road comes to the end on its own side)
    let Ge = G;
    if (ap.land && ap.land.fixed && ap.exits && ap.exits.length > 1) { const far = pts[Math.max(0, pts.findIndex(p => near(p, 3)) - 1)] || pts[0]; Ge = ap.exits.slice().sort((a, b) => U.dist(a, far) - U.dist(b, far))[0]; }
    // (already at the gate and clear of the airfield: nothing to do)
    if (U.dist(pts[pts.length - 1], Ge) < 0.35 && !pts.slice(0, -1).some(p => near(p, 0))) continue;
    let k = pts.findIndex(p => near(p, 3));
    if (k < 0) k = pts.length - 1;
    const start = pts[Math.max(0, k - 1)] || pts[0];
    const bb = box([start, Ge]), R = [Math.min(bb[0], abox[0]) - 8, Math.min(bb[1], abox[1]) - 8, Math.max(bb[2], abox[2]) + 8, Math.max(bb[3], abox[3]) + 8];
    const path = IC.gridRoute(R, 0.25, keep, start, (x, y) => U.dxy(x, y, Ge.x, Ge.y) < 0.3, { to: Ge, snapEnd: () => ({ x: Ge.x, y: Ge.y }) });
    if (!path) continue;
    const np = pts.slice(0, Math.max(0, k - 1)).concat(path);
    e.pts = endA ? np.reverse() : np;
    e.len = 0; for (let i = 1; i < e.pts.length; i++) e.len += U.dist(e.pts[i - 1], e.pts[i]);
    edgeBB(e); e.cum = null; moved.set(endId, Ge);
  }
  for (const [id, g] of moved) { const n = W.nodes[id]; if (n) { n.x = g.x; n.y = g.y; n.gate = ap.id; } }
  if (moved.size && ap.land && ap.land.access) { const e = own.find(x => x.apt === ap.id); if (e) ap.land.access.pts = e.pts.map(p => ({ x: p.x, y: p.y })); }
  // everything else that runs across the field or inside the fence: lanes stop short, streets close, roads and
  // railways go under
  // (one raster of the airfield and the fence, 20 m cells, so each road is tested cell by cell)
  const rb = [abox[0] - 3, abox[1] - 3, abox[2] + 3, abox[3] + 3];
  // (and a landside laid out from data: a country road does not cross its car parks and buildings, it goes under)
  const landF = ap.land && ap.land.fixed ? els.filter(e => (e.cat === 'land' || e.cat === 'park') && e.own).map(e => ({ sh: e.sh, pad: 0.05 })) : [];
  const RA = IC.shapeRaster(rb, 0.2, airOnly.map(b => ({ sh: b.sh, pad: b.pad + 0.12 })).concat(landF, fence ? [{ sh: IC.shapePoly(fence.poly), pad: 0, inside: fence.hullA, carve: fence.carveA }] : []));
  const bad = s => RA ? RA.at(s) : inFence(s) || airOnly.some(b => IC.shapeDist(b.sh, s) < b.pad + 0.12);
  const hits = pts => { const runs = []; let cur = null; for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = i ? pts[i - 1] : p, n = i ? Math.max(1, Math.ceil(U.dist(p, q) / 0.1)) : 1; for (let j = 1; j <= n; j++) { const s = { x: q.x + (p.x - q.x) * j / n, y: q.y + (p.y - q.y) * j / n }; if (bad(s) && !cur) { cur = [s, s]; runs.push(cur); } else if (bad(s)) cur[1] = s; else cur = null; } } return runs; };
  const inBox = l => { const b = l.bb || box(l.pts); return b[0] < abox[2] + 2 && b[2] > abox[0] - 2 && b[1] < abox[3] + 2 && b[3] > abox[1] - 2; };
  const tunnel = (l, cls, what) => { for (const [a, b] of hits(l.pts)) { const L = U.dist(a, b) || 0.01, dx = (b.x - a.x) / L, dy = (b.y - a.y) / L; W.tunnels.push({ a: { x: a.x - dx * 0.3, y: a.y - dy * 0.3 }, b: { x: b.x + dx * 0.3, y: b.y + dy * 0.3 }, w: (IC.ROAD_W[cls] || 0.2) + 0.06, apt: ap.id, what }); } };
  for (const e of W.edges) if (!own.includes(e) && inBox(e)) tunnel(e, e.cls, 'road');
  for (const r of W.rails || []) if (inBox(r)) tunnel(r, 'rd', 'rail');
  for (const r of W.ramps || []) if (inBox(r)) tunnel(r, 'lc', 'road');
  W.lanes = W.lanes.filter(l => {
    if (!inBox(l)) return true;
    const k = l.pts.findIndex(p => near(p, 0.25) || bad(p));
    if (k < 0) return true;
    l.pts = l.pts.slice(0, Math.max(0, k - 1)); l.bb = null;
    return l.pts.length >= 3;
  });
  for (const c of (W.cities || []).concat(W.villages || [])) if (c.streets && U.dist(c, ap) < (c.r || 20) * 2 + 120) c.streets = c.streets.filter(l => !(inBox(l) && hits(l.pts).length));
  // a mapped landside's roads meet the country's roads where they cross at the same level: a junction
  if (ap.land && ap.land.fixed) {
    const L = ap.land; L.jn = (L.jn || []).filter(q => !q.world);
    const lines = W.edges.filter(e => !own.includes(e) && inBox(e)).map(e => e.pts).concat((W.lanes || []).filter(inBox).map(l => l.pts));
    for (const r of L.roads) if ((r.lv || 0) === 0) for (const pts of lines) for (let i = 1; i < r.pts.length; i++) for (let j = 1; j < pts.length; j++) {
      const a = r.pts[i - 1], b = r.pts[i], c = pts[j - 1], d = pts[j], t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
      if (t < 0) continue;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, world: true };
      if (!IC.inTunnel(W, q.x, q.y)) L.jn.push(q);
    }
  }
  ap._seatKey = seatKey(ap);
  const changed = sig() !== before;
  if (changed && IC.buildRouting) IC.buildRouting(W, W.blocked);
  return changed;
};
/* lay an airport out again (a template in place of what it had) and seat the roads round it */
IC.aptRelayout = function (S, ap, template, a) {
  if (ap.land) ap.land.fixed = false;
  IC.layoutAirport(ap, template, a != null ? a : ap.rwyA || 0);
  // (a layout from data brings its own landside; a code layout grows one)
  if (ap.land && !ap.land.fixed) { ap.land.items = []; ap.land.roads = []; ap.land.kerbN = null; ap.land.ver++; }
  ap._seatKey = null; IC.aptReseat(S, ap);
  // (a setup step: the travel times are worked out now, not in the next step of play)
  if (S.econ && S.econ.roadsDirty) refreshRoads(S);
  IC.aptStats(S, ap);
  return ap;
};
/* a road, lane, railway or street within 1 km of a part */
function roadNear(S, ap, part) {
  const W = S.world, sh = IC.partShape(ap, part), bb = sh.bb, m = 10;
  const hit = l => { const b = l.bb || (l.bb = [Math.min(...l.pts.map(p => p.x)), Math.min(...l.pts.map(p => p.y)), Math.max(...l.pts.map(p => p.x)), Math.max(...l.pts.map(p => p.y))]); if (b[2] < bb[0] - m || b[0] > bb[2] + m || b[3] < bb[1] - m || b[1] > bb[3] + m) return false; for (const p of l.pts) if (p.x > bb[0] - m && p.x < bb[2] + m && p.y > bb[1] - m && p.y < bb[3] + m) return true; for (let i = 1; i < l.pts.length; i++) if (U.segDist((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y) < m + Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2) return true; return false; };
  if (W.edges.some(hit) || (W.rails || []).some(hit) || (W.lanes || []).some(hit) || (W.ramps || []).some(hit)) return true;
  for (const c of (W.cities || []).concat(W.villages || [])) if (c.streets && U.dist(c, part.a && part.a.x != null ? part.a : part) < (c.r || 20) * 2 + 100 && c.streets.some(hit)) return true;
  return false;
}
/* what the roads were seated for: the parts and the landside (re-seat when it changes) */
const seatKey = ap => ap.parts.length + ':' + ap.nodeN + ':' + ap.parts.reduce((s, p) => s + (p.x || 0) + (p.a && p.a.x || 0), 0).toFixed(2);
/* after the airfield grows: seat the roads again if anything changed (the builder calls it when a plan is made) */
IC.aptReseat = function (S, ap, part) {
  if (!ap || !ap.parts || ap._seatKey === seatKey(ap)) return false;
  // (a new part far from every road changes nothing now; the landside's ten-minute tick seats the rest)
  if (part && !roadNear(S, ap, part)) return false;
  if (!IC.aptSeatRoads(S, ap)) return false;
  if (ap.land && ap.land.kerbN != null && IC.landKerbs) IC.landKerbs(S, ap, ap.parts.filter(p => (p.kind === 'terminal' || p.kind === 'cargo') && p.built && p.hp > p.max * 0.25));
  if (IC.roadsChanged) IC.roadsChanged(S);
  if (IC.worldChanged) { const r = (ap.radius || 30) + 10; IC.worldChanged(S, { x0: ap.x - r, y0: ap.y - r, x1: ap.x + r, y1: ap.y + r }); }
  return true;
};

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
  const e = { id: 'ep' + (E.nid++), a, b, cls: w.cls, pts, built: S.time, player: true, apt: w.apt || null };
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
  if (ap && ap.parts) { ap._seatKey = null; IC.aptReseat(S, ap); }
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

/* ---------- money: loans, the monthly statement and the yearly review ---------- */
const career = S => S.mode === 'story';
IC.loanOffers = S => career(S) ? IC.LOANS : IC.LOANS_LIVE;
/* a loan's term in game seconds, and its interest a game second on what is left */
IC.loanTerm = (S, o) => o.mo ? IC.MO(S, o.mo) : o.days * DAY;
const rateS = (S, l) => l.mo ? IC.LOAN_RATE_MO / IC.MO(S) : IC.LOAN_RATE / DAY;
IC.loanRateText = S => career(S) ? `${(IC.LOAN_RATE_MO * 100).toFixed(1)}% a month` : `${(IC.LOAN_RATE * 100).toFixed(1)}% a day`;
IC.loanTermText = (S, o) => o.mo ? (o.mo % 12 ? `${o.mo} months` : `${o.mo / 12} year${o.mo > 12 ? 's' : ''}`) : `${o.days} days`;
/* the banks lend about four months of income in the Career (ten days of it on the live clock) */
IC.loanLimit = S => {
  const E = S.econ, m = E && E.months && E.months[E.months.length - 1];
  const perDay = m && m.days ? statement(m.book).income / m.days : 0;
  return Math.max(300, Math.round(perDay * (career(S) ? 4 * IC.dpm(S) : 10.5) / 50) * 50);
};
IC.loanOwed = S => S.econ ? S.econ.loans.reduce((s, l) => s + l.left, 0) : 0;
IC.takeLoan = function (S, i) {
  const O = IC.loanOffers(S)[i], E = S.econ;
  if (!O || !E) return false;
  if (IC.loanOwed(S) + O.amt > IC.loanLimit(S)) { IC.log(S, 'warn', 'TREASURY', `The banks will not lend more: ${U.money(IC.loanOwed(S))} is already owed, the limit is ${U.money(IC.loanLimit(S))}.`); return false; }
  const l = { id: 'ln' + (E.nid++), amt: O.amt, left: O.amt, mo: O.mo || 0, days: O.days || 0, term: IC.loanTerm(S, O), t0: S.time };
  E.loans.push(l);
  S.budget += O.amt; book(S, 'loanIn', O.amt);
  const per = career(S) ? `${U.money(IC.loanPay(S, l) * IC.MO(S) / 3600)} a month` : `${U.money(IC.loanPay(S, l) * 24)} a day`;
  IC.log(S, 'info', 'TREASURY', `Borrowed ${U.money(O.amt)} over ${IC.loanTermText(S, O)} at ${IC.loanRateText(S)}: about ${per} to repay at first.`);
  IC.emit(S, 'loan', l);
  return l;
};
/* ₭M an hour: principal spread over the term plus interest on what is left */
IC.loanPay = (S, l) => (l.amt / (l.term || l.days * DAY) + l.left * rateS(S, l)) * 3600;
IC.loanRate = S => S.econ ? S.econ.loans.reduce((s, l) => s + IC.loanPay(S, l), 0) : 0;
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
  for (const l of E.loans) l.left = Math.max(0, l.left - l.amt / (l.term || l.days * DAY) * dt);
  for (const l of E.loans.filter(x => x.left <= 0.001)) IC.log(S, 'info', 'TREASURY', `Loan of ${U.money(l.amt)} repaid.`);
  E.loans = E.loans.filter(x => x.left > 0.001);
}
/* money booked by kind: + comes in, − goes out */
// (each line goes into the day's book and the month's: the statement is the month's, the review sums the months)
function book(S, k, v) { const E = S.econ; if (!E || !v) return; E.book[k] = (E.book[k] || 0) + v; const M = E.mb || (E.mb = {}); M[k] = (M[k] || 0) + v; E.booked = (E.booked || 0) + v; }
IC.econBook = book;
/* pay for something now and book it by kind (the kinds are in IC.STATEMENT) */
IC.pay = function (S, k, v) { S.budget -= v; book(S, k, -v); };
IC.STATEMENT = {
  base: 'Grant from the Ministry', tax: 'Taxes from the cities', trade: 'Trade taxes', apt: 'Airport revenue', aid: 'Allied support',
  fee_land: 'Airline fees: landing', fee_pax: 'Airline fees: passengers', fee_cargo: 'Airline fees: cargo', fee_over: 'Overflight fees',
  oneoff: 'Grants, aid and war bonds', refund: 'Equipment dismantled', loanIn: 'Loans taken',
  upAD: 'Running costs: air defence', upAir: 'Running costs: air force', upApt: 'Running costs: airports', upStaff: 'Staff',
  penalty: 'Deal penalties and compensation', loan: 'Loan repayments and interest', loanOut: 'Loans paid off early',
  buyUnits: 'Equipment bought', buyMun: 'Missiles and supplies bought', buyLogi: 'Truck companies', research: 'Research', repair: 'Repairs',
  other: 'Building works and other spending'
};
/* the money view: what comes in and goes out an hour right now, line by line, each with its reason */
IC.money = function (S) {
  const L = S.ledger || {}, A = S.av, r = A && A.rate || {};
  const inc = [['base', L.base], ['av', L.av || 0], ['tax', L.tax], ['trade', L.trade], ['apt', L.apt], ['aid', L.aid]].filter(([, v]) => v > 0.005);
  const out = [['upAD', L.upAD], ['upAir', L.upAir], ['upApt', L.upApt], ['upStaff', L.upStaff], ['loan', L.loan]].filter(([, v]) => v > 0.005);
  // (before the war the only "air defence" the player runs is civil radar: call it that)
  const civilOnly = S.units.every(u => u.d.civil || u.type === 'ssr');
  // (before any airport opens the airlines pay only to fly over us: say so)
  const name = k => k === 'av' ? ((r.land || 0) + (r.pax || 0) + (r.cargo || 0) > 0.005 ? 'Airline fees' : 'Overflight fees') : k === 'upAD' && civilOnly ? 'Running costs: radars' : IC.STATEMENT[k];
  const line = ([k, v]) => ({ k, name: name(k), v, why: IC.moneyWhy(S, k, r) });
  const I = inc.map(line).sort((a, b) => b.v - a.v), O = out.map(line).sort((a, b) => b.v - a.v);
  const inH = I.reduce((s, l) => s + l.v, 0), outH = O.reduce((s, l) => s + l.v, 0), net = inH - outH;
  const left = net < 0 ? S.budget / -net : Infinity;
  // (in the Career the calendar is the measure: a month is a few days and nights)
  const moH = IC.MO(S) / 3600, cal = S.mode === 'story';
  const forecast = net >= 0 ? (cal ? `Growing by about ${U.money(net * moH)} a month at this rate.` : `Growing by about ${U.money(net * 24)} a day at this rate.`) : S.budget <= 0 ? 'The treasury is empty.' : `Money runs out in about ${cal && left > moH ? U.months(left * 3600) : left > 48 ? `${Math.round(left / 24)} days` : U.dur(left * 3600)} at this rate.`;
  return { inc: I, out: O, inH, outH, net, left, forecast };
};
const n = (a, one, many) => `${a} ${a === 1 ? one : many || one + 's'}`;
IC.moneyWhy = function (S, k, r) {
  const L = S.ledger || {}, mob = IC.MOBIL[S.mobil], st = S.story;
  const mobTxt = S.mobil ? ` ${mob.name} ${k.startsWith('up') ? `adds ${U.pct(mob.up - 1)}` : `takes ${U.pct(1 - mob.tax)}`}.` : '';
  switch (k) {
    case 'base': return st ? `The Ministry pays ${U.money(L.base)} an hour to run your office. It rises with each act.` : `The government's defence budget: ${U.money(L.base)} an hour.`;
    case 'av': { const f = ['land', 'pax', 'cargo', 'over'].filter(x => r[x] > 0.005).map(x => `${{ land: 'landings', pax: 'passengers', cargo: 'cargo', over: 'overflights' }[x]} ${U.money(r[x])}`); return `Paid by the airlines for landings and passengers at our airports, and for flying over the country, over the last hour: ${f.join(', ') || 'no flights yet'}. More routes, more passengers and higher charges (airport panel) raise it; charges that are too high drive airlines away.`; }
    case 'tax': { const cs = IC.cities(S).filter(c => c.owner === 'us'); return `${n(cs.length, 'city', 'cities')} pay taxes by size, prosperity and morale.${st && st.act < 4 ? ` In Act ${['', 'I', 'II', 'III'][st.act]} you get ${IC.STORY_TAX[st.act] ? U.pct(IC.STORY_TAX[st.act]) + ' of them' : 'none: they go to the Treasury'}.` : S.mode === 'campaign' ? ` The air defence gets ${U.pct(IC.QW_TAX_SHARE)} of them; the rest runs the country.` : ''}${mobTxt}`; }
    case 'trade': return `15% of what ${n(S.econ ? S.econ.inds.length : 0, 'remote industry', 'remote industries')} sell. Fast roads to a city and air cargo within ${IC.GROWTH.indCatch} h sell more.${st && st.act < 4 ? ' In the Career this grows with the acts, like taxes.' : ''}`;
    case 'apt': return 'Airports earn a fixed amount when no airlines are modelled.';
    case 'aid': return `Our allies pay more the more they support us (support ${Math.round(S.support)}).`;
    case 'upAD': { const us = S.units.filter(u => !u.dead), by = {}; for (const u of us) by[u.d.name] = (by[u.d.name] || 0) + u.d.up; const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nm, v]) => `${nm} ${U.money(v)}`); return `${n(us.length, 'unit')} on the map, crews and fuel: ${top.join(', ')}.${L.crowd > 0.05 ? ` Radars sharing a frequency band cost ${U.money(L.crowd)} more to keep apart.` : ''} Units in the reserve cost nothing.${mobTxt}`; }
    case 'upAir': { const f = S.roster.filter(x => x.st !== 'lost').length; return `${n(f, 'flight')} of aircraft at ₭0.6M an hour each; every sortie costs extra.${mobTxt}`; }
    case 'upApt': { let v = 0; for (const b of IC.bases(S)) if (b.parts && b.owner === 'us' && !b.locked) for (const p of b.parts) if (p.built) v += IC.partCost(b, p); const ctl = S.asp && S.asp.secs ? S.asp.secs.reduce((n, x) => n + x.staff, 0) : 0; return `0.12% an hour of what the airports' runways, taxiways and buildings cost (${U.money(v)}), and ${ctl} air traffic controllers at ${U.money(IC.ASP.ctlCost)} an hour each. Bigger airports cost more to keep.`; }
    case 'upStaff': return 'The delegates you hired (Staff room). Let one go to save the cost.';
    case 'loan': return `${n(S.econ ? S.econ.loans.length : 0, 'loan')}: each is repaid evenly over its term, with ${IC.loanRateText(S)} interest on what is still owed.`;
  }
  return '';
};
function closeBooks(S) {
  // what the treasury did that nobody booked: building, buying, research
  const E = S.econ, d = S.budget - E.lastBudget - (E.booked || 0);
  if (Math.abs(d) > 1e-6) { const k = d < 0 ? 'other' : 'oneoff', M = E.mb || (E.mb = {}); E.book[k] = (E.book[k] || 0) + d; M[k] = (M[k] || 0) + d; }
  E.lastBudget = S.budget; E.booked = 0;
}
function sumBooks(list) { const o = {}; for (const b of list) for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; }
/* statement lines from a book: income first, then spending */
function statement(b, S) {
  // (before the war the only "air defence" the player runs is civil radar: call it that)
  const civil = S && S.units.every(u => u.d.civil || u.type === 'ssr');
  const lines = Object.keys(b).filter(k => Math.abs(b[k]) >= 0.05).sort((p, q) => b[q] - b[p]).map(k => ({ k, name: k === 'upAD' && civil ? 'Running costs: radars' : IC.STATEMENT[k] || k, v: b[k] }));
  const income = lines.filter(l => l.v > 0 && l.k !== 'loanIn').reduce((s, l) => s + l.v, 0);
  const spend = lines.filter(l => l.v < 0).reduce((s, l) => s + l.v, 0);
  return { lines, income, spend, net: income + spend + (b.loanIn || 0) };
}
/* what the country and the airports look like at a month's end, for the review */
function snapshot(S) {
  const A = S.av, aps = ourAirports(S);
  return { budget: S.budget, pop: IC.cities(S).reduce((s, c) => s + c.pop, 0), airports: aps.length, stands: aps.reduce((s, ap) => s + IC.aptStands(ap).length, 0),
    airlines: A ? A.airlines.filter(a => !a.gone).length : 0, routes: A ? A.routes.filter(r => r.st === 'active').length : 0, deals: A ? A.deals.filter(d => d.st === 'active').length : 0,
    fees: A ? A.feeTotal || 0 : 0, pax: A ? A.paxTotal || 0 : 0 };
}
/* a city's tally of why it grew: by the week on the live clock, by the month in the Career */
function newWeek(S) { for (const c of IC.cities(S)) { c.wkLast = c.wk; c.wk = { pop0: c.pop, air: 0, road: 0, war: 0 }; } }
IC.onMonth(S => { if (S.mode === 'story' && S.econ) newWeek(S); });
/* the month turns: close its book (the statement) and keep three years of them */
IC.onMonth((S, was) => {
  const E = S.econ; if (!E) return;
  closeBooks(S);
  const days = Math.max(0.01, Math.min(IC.dpm(S), (S.time - (E.mT != null ? E.mT : E.t0)) / DAY));
  E.months = E.months || [];
  E.months.push({ m: was, days, book: E.mb || {}, end: snapshot(S), start: E.mStart || null });
  if (E.months.length > 36) E.months.shift();
  E.mb = {}; E.mT = S.time; E.mStart = snapshot(S);
  const st = statement(E.months[E.months.length - 1].book);
  if (S.mode === 'story') IC.log(S, st.net >= 0 ? 'info' : 'warn', 'TREASURY', `${IC.MONTHS[was % 12]} closed: ${U.money(st.income)} came in, ${U.money(-st.spend)} went out, ${st.net >= 0 ? '+' : '−'}${U.money(Math.abs(st.net)).replace('−', '')} in all. The statement is in the Economy room.`);
  if (S.mode === 'story' && (was + 1) % 12 === 0 && IC.card) { const R = IC.yearReview(S, Math.floor(was / 12) + 1); if (R) IC.card(S, `Year ${R.y} in review`, U.clock(S.time, S), R.text, 'report'); }
});
/* the statement for this month so far (ago=0) or a finished month (ago=1: last month, 2: the one before) */
IC.monthStatement = function (S, ago) {
  const E = S.econ; if (!E) return null;
  let b, m, days;
  if (!ago) { closeBooks(S); b = E.mb || {}; m = S.cal ? S.cal.m : 0; days = Math.min(IC.dpm(S), (S.time - (E.mT != null ? E.mT : E.t0)) / DAY); }
  else { const M = E.months && E.months[E.months.length - ago]; if (!M) return null; b = M.book; m = M.m; days = M.days; }
  return Object.assign({ m, name: `${IC.MONTHS[m % 12]}, Year ${Math.floor(m / 12) + 1}`, days, whole: !!ago }, statement(b, S));
};
/* the year in review: money by line over the year's months, and what changed from its first month to its last */
IC.yearReview = function (S, y) {
  const E = S.econ; if (!E || !E.months) return null;
  const Ms = E.months.filter(M => Math.floor(M.m / 12) + 1 === y);
  if (!Ms.length) return null;
  const b = {}; for (const M of Ms) for (const k in M.book) b[k] = (b[k] || 0) + M.book[k];
  const st = statement(b, S), a = Ms[0].start || Ms[0].end, z = Ms[Ms.length - 1].end;
  const ch = (x, y2, f) => x === y2 ? `${f(y2)}` : `${f(x)} → ${f(y2)}`;
  const n = v => String(Math.round(v));
  const rows = [
    ['Came in', U.money(st.income)], ['Went out', U.money(-st.spend)], ['Treasury', ch(a.budget, z.budget, U.money)],
    ['People', `${(z.pop / 1000).toFixed(1)} million (${pct1(z.pop / Math.max(1, a.pop) - 1)})`],
    ['Airports', ch(a.airports, z.airports, n)], ['Stands', ch(a.stands, z.stands, n)], ['Airlines', ch(a.airlines, z.airlines, n)],
    ['Routes flown', ch(a.routes, z.routes, n)], ['Deals running', ch(a.deals, z.deals, n)]
  ];
  if (z.pax > a.pax) rows.push(['Passengers', Math.round(z.pax - a.pax).toLocaleString('en-US')]);
  if (z.fees > a.fees) rows.push(['Airline fees', U.money(z.fees - a.fees)]);
  const top = st.lines.filter(l => l.v > 0 && l.k !== 'loanIn').slice(0, 2).map(l => `${l.name.toLowerCase()} (${U.money(l.v)})`);
  const big = st.lines.filter(l => l.v < 0).slice(-2).reverse().map(l => `${l.name.toLowerCase()} (${U.money(-l.v)})`);
  const text = `Year ${y}: ${U.money(st.income)} came in, most of it ${top.join(' and ') || 'nothing yet'}; ${U.money(-st.spend)} went out, most on ${big.join(' and ') || 'nothing'}. The treasury went from ${U.money(a.budget)} to ${U.money(z.budget)}. ${z.airlines} airline${z.airlines === 1 ? '' : 's'} fly ${z.routes} route${z.routes === 1 ? '' : 's'} from ${z.airports} airport${z.airports === 1 ? '' : 's'}; the country has ${(z.pop / 1000).toFixed(1)} million people (${pct1(z.pop / Math.max(1, a.pop) - 1)}).`;
  return Object.assign({ y, rows, text, months: Ms.length }, st);
};

/* ---------- a national network that grows by demand ----------
   A city asks for an airport of its own when enough of its people want to fly and none of our airports is within
   reach: its unserved demand (flyers a day it would send, times the share no airport serves). The size it asks for
   follows that demand: a regional field for turboprops first, jets once the demand is large. */
IC.NETWORK = { ask: 9000, jets: 15000, hubPax: 2500 };
IC.cityUnserved = c => c.air ? c.air.pot * (1 - c.air.score) : 0;
/* the city with the strongest case for an airport, or null; the hub must be carrying people first, since a
   regional airport lives on connections to it */
IC.cityAsks = function (S, minKm) {
  const A = S.av, N = IC.NETWORK;
  const hubPax = A ? Math.max(A.day.pax, A.yesterday ? A.yesterday.pax : 0) : 0;
  if (hubPax < N.hubPax) return null;
  const aps = ourAirports(S);
  const L = IC.cities(S).filter(c => c.owner === 'us' && !c.capital && c.air && IC.cityUnserved(c) >= N.ask && !aps.some(ap => U.dist(ap, c) < (minKm || 150) * 10));
  L.sort((a, b) => IC.cityUnserved(b) - IC.cityUnserved(a));
  const c = L[0];
  return c ? { city: c, unserved: IC.cityUnserved(c), size: IC.cityUnserved(c) >= N.jets ? 'jets' : 'turbo' } : null;
};
/* why a site is no place for a new airport because of the airports already there: under the approach or departure
   paths (the runway line, 30 km out from each end), or under an airway where it runs low near an airport; '' if fine */
IC.siteConflict = function (S, x, y) {
  for (const ap of ourAirports(S)) {
    const rws = ap.parts.filter(p => p.kind === 'runway');
    const lines = rws.length ? rws.map(rw => ({ c: { x: (rw.a.x + rw.b.x) / 2, y: (rw.a.y + rw.b.y) / 2 }, d: IC.rwDir(rw), h: IC.rwLen(rw) / 2 })) : ap.rwyA != null ? [{ c: ap, d: { x: Math.cos(ap.rwyA), y: Math.sin(ap.rwyA) }, h: 15 }] : [];
    for (const L of lines) {
      const dx = x - L.c.x, dy = y - L.c.y, along = Math.abs(dx * L.d.x + dy * L.d.y) - L.h, side = Math.abs(dx * L.d.y - dy * L.d.x);
      // a corridor that widens from 3 km at the runway end to 8 km at 30 km out
      if (along > 0 && along < 300 && side < 30 + along / 6) return `Under the approach and departure paths of ${ap.name}: aircraft fly low over this ground. Pick a site off the runway line.`;
    }
  }
  if (S.asp) for (const w of S.asp.ways) {
    const [a, b] = IC.aspWayEnds(S, w); if (!a || !b) continue;
    if (U.segDist(x, y, a.x, a.y, b.x, b.y) > 30) continue;
    const low = ourAirports(S).find(ap => U.dist(ap, { x, y }) < 800);
    if (low) return `Under a busy airway close to ${low.name}, where airliners are still climbing and descending. Pick a site away from it.`;
  }
  return '';
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
      const fresh = S.av ? S.av.routes.filter(r => r.st === 'active' && r.since > E.t0 + 1 && S.time - r.since < (S.mode === 'story' ? IC.MO(S) : WEEK) && (aps.includes(r.a) || (r.b.apt && aps.includes(r.b.apt)))) : [];
      const to = [...new Set(fresh.map(r => shortName(aps.includes(r.a) ? IC.avEnd(S, r.b).name : S.byId[r.a].name)))];
      why = to.length ? `mostly from new routes to ${to.slice(0, 3).join(', ')}${to.length > 3 ? ' and more' : ''}` : 'mostly from its air service';
    } else if (top[0] === 'road') why = top[2] > 0 ? 'mostly from better road links' : 'mostly from cut roads';
    else if (top[0] === 'war') why = 'mostly from war damage';
  }
  const lack = [c.air.score < 0.05 ? 'no air service within reach' : '', c.rc <= c.rc0 * 1.01 ? 'no new road links' : ''].filter(Boolean).join(' and ');
  const per = S.mode === 'story' ? 'month' : 'week', unit = S.mode === 'story' ? 'a year' : 'a day';
  R.growth = Math.abs(g) < 0.0005 ? `Unchanged this ${per}${lack ? `: ${lack}` : ''}.` : `${g >= 0 ? 'Grew' : 'Shrank'} ${Math.abs(g * 100).toFixed(1)}% this ${per}, ${why || (lack ? `with ${lack}` : 'as people move to better-connected cities')}.`;
  R.rate = `${pct1(c.gr.tot / 100)} ${unit} now (air ${pct1(c.gr.air / 100)}, roads ${pct1(c.gr.road / 100)}${c.gr.war < -0.01 ? `, war ${pct1(c.gr.war / 100)}` : ''}, drift ${pct1(c.gr.base / 100)}).`;
  const best = c.air.best && S.byId[c.air.best];
  if (best) R.air = `${shortName(best.name)}, ${hm(c.air.bestT)} by road: ${Math.round(best.svc.deps)} departures a day to ${best.svc.dests.size} places.`;
  else if (c.air.near) R.air = `No airline service within ${IC.GROWTH.catch[1]} h. The nearest airport, ${shortName(S.byId[c.air.near].name)}, is ${hm(c.air.bestT)} away${S.byId[c.air.near].svc && !S.byId[c.air.near].svc.deps ? ' and has no flights' : ''}.`;
  else R.air = 'No airport.';
  const b = c.air.bizShare || 0.5, want = b > 0.58 ? ' Mostly business travel: frequent flights matter most.' : b < 0.42 ? ' Mostly holidays: places served and fares matter most.' : '';
  R.demand = `${Math.round(c.air.demand).toLocaleString('en-US')} passengers a day of ${Math.round(c.air.pot).toLocaleString('en-US')} who would fly with perfect service.${want} ${Math.round(c.air.cargo || 0)} t of air cargo a day.`;
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
  // day book: close it at midnight (the month's book fills alongside it)
  const day = U.day(S.time);
  if (day !== E.day) {
    closeBooks(S);
    E.days.push({ day: E.day, book: E.book, pop: IC.cities(S).reduce((s, c) => s + c.pop, 0), demand: IC.cities(S).reduce((s, c) => s + (c.air ? c.air.demand : 0), 0) });
    if (E.days.length > 21) E.days.shift();
    E.book = {}; E.day = day;
    if (S.mode !== 'story' && (day - 1) % 7 === 0) newWeek(S);
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
