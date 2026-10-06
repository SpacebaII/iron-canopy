/* Iron Canopy — the landside of an airport, generated. A new airport gets an access road to the road network, paid
   for and shown like any road works (growth.js builds it). As passengers and cargo grow, the airport fills in by
   itself on the side of the terminal away from the aprons: a kerb road, car parks and then parking garages, a taxi
   and rental area, a bus stop (a rail station when it is busy and a railway runs close), hotels and offices; cargo
   warehouses beside the cargo sheds. They cost nothing to build and pay a small income. Drawn in render-airport.js. */
(function (IC) {
'use strict';
const U = IC.U;

/* what each item is, how big (units: 100 m), what it holds and earns (₭M an hour at full use) */
IC.LAND = {
  park:      { name: 'Car park', w: 1.2, h: 0.8, cap: 400, earn: 0.08, what: 'spaces' },
  garage:    { name: 'Parking garage', w: 0.8, h: 0.6, cap: 1500, earn: 0.3, what: 'spaces' },
  taxi:      { name: 'Taxi and rental cars', w: 0.8, h: 0.4, cap: 120, earn: 0.05, what: 'cars' },
  stop:      { name: 'Bus and coach stop', w: 0.6, h: 0.3, cap: 1, earn: 0.02, what: '' },
  hotel:     { name: 'Hotel', w: 0.5, h: 0.4, cap: 250, earn: 0.15, what: 'rooms' },
  office:    { name: 'Offices', w: 0.6, h: 0.5, cap: 800, earn: 0.1, what: 'desks' },
  warehouse: { name: 'Cargo warehouse', w: 1.0, h: 0.6, cap: 40, earn: 0.1, what: 't an hour' }
};
IC.STATEMENT.landside = 'Airport car parks, hotels and rents';

/* the side of a terminal or shed away from its aprons: +1 or −1 along its local y */
function landSide(ap, t) {
  let s = 0;
  for (const q of ap.parts) if (q.kind === 'apron' && q.w && IC.rectGap(q, t) < 0.6) s += IC.rectLocal(t, q).y > 0 ? -1 : 1;
  if (s) return Math.sign(s);
  const c = ap.cityRef;
  return c ? (IC.rectLocal(t, c).y >= 0 ? 1 : -1) : 1;
}
IC.landSide = landSide;
/* The landside of a building is laid out in rows, like a real terminal front: the kerb road along the building, then
   bands of car parks, garages and hotels, with a road beyond each band, the rows joined at both ends into one loop.
   Items front onto the road on the building's side of their band, so no driveway crosses anything. BANDS are the
   distances of each band from the building's face (units: 100 m). */
const BANDS = [[0.34, 1.0], [1.22, 2.08], [2.3, 3.16], [3.38, 4.24]];
const ROW = k => BANDS[k][1] + 0.11, KERB = 0.2;
const BAND_OF = { stop: [0], taxi: [0], garage: [0, 1, 2], park: [1, 2, 3, 0], hotel: [2, 3, 1], office: [3, 2, 1], warehouse: [0, 1] };
IC.LAND_DEPTH = ROW(3) + 0.12;
const depthOf = t => t.kind === 'cargo' ? ROW(1) + 0.12 : IC.LAND_DEPTH;
const halfLen = t => Math.max(t.w / 2 + 1.2, 3.2);
/* the ground a building's landside may take, in its frame: the whole loop at its full size */
IC.landEnvelope = function (ap, t, side) {
  const sd = side || landSide(ap, t), X = halfLen(t) + 0.3, D = depthOf(t);
  const c = IC.rectWorld(t, 0, sd * (t.h / 2 + D / 2));
  return IC.shapePoly(IC.partOutline({ x: c.x, y: c.y, a: t.a || 0, w: 2 * X, h: D }));
};
/* the envelope keeps off the airfield: no runway strip, taxiway or apron in it (buildings in it stand on the landside) */
IC.landClear = function (ap, t, env) {
  for (const e of IC.aptElements(null, ap, { noWorld: true })) {
    const sh = e.cat === 'rwy' ? e.strip : e.cat === 'twy' ? IC.shapeLine(e.sh.line, e.sh.r + 0.1) : e.cat === 'apron' ? e.sh : null;
    if (sh && IC.shapeDepth(sh, env) > 0.01) return false;
  }
  return true;
};
/* candidate plots for an item in a building's bands, nearest band first, each band spreading from the middle */
function plots(t, side, kind) {
  const out = [], D = IC.LAND[kind], X = halfLen(t);
  for (const k of BAND_OF[kind] || [1]) {
    if (D.h > BANDS[k][1] - BANDS[k][0] + 1e-6 || ROW(k) > depthOf(t)) continue;
    for (let i = 0; i < 40; i++) {
      const n = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), x = n * (D.w + 0.12) / 2;
      if (Math.abs(x) + D.w / 2 > X) continue;
      out.push(Object.assign(IC.rectWorld(t, x, side * (t.h / 2 + BANDS[k][0] + D.h / 2)), { band: k }));
    }
  }
  return out;
}
/* what the landside must keep off: the airfield, other buildings, the country's roads and other buildings' landside */
function blockers(S, ap, by) {
  const E = IC.aptElements(S, ap), L = ap.land, out = [];
  for (const e of E) {
    if (e.cat === 'rwy') out.push(e.strip);
    else if (e.cat === 'twy') out.push(IC.shapeLine(e.sh.line, e.sh.r + 0.12));
    else if (e.cat === 'apron' || e.cat === 'bld' || e.cat === 'rail') out.push(e.sh);
    else if (e.cat === 'road' && (e.world || (e.land && e.land.by !== by))) out.push(e.sh);
    else if ((e.cat === 'land' || e.cat === 'park') && e.own) out.push(e.sh);
  }
  void L;
  return out;
}
/* a plot is free when it keeps off all that, water, the country's edge and towns */
function free(S, ap, r, B) {
  const W = S.world;
  if (!IC.inHome(r.x, r.y) || (W.inLake && W.inLake(r.x, r.y)) || (IC.onRiver && IC.onRiver(r.x, r.y))) return false;
  const sh = IC.shapePoly(IC.partOutline({ x: r.x, y: r.y, a: r.a, w: r.w + 0.04, h: r.h + 0.04 }));
  for (const b of B) if (IC.shapeDepth(sh, b) > 0.005) return false;
  for (const c of IC.cities(S)) { if (U.dist(c, r) > (c.r || 20) * 1.6 + 5) continue; for (const b of c.blocks || []) if (b.hp > 0 && U.dxy(b.x, b.y, r.x, r.y) < Math.max(r.w, r.h) / 2 + Math.max(b.w, b.h) * 0.4) return false; }
  return true;
}
function place(S, ap, kind, near) {
  const D = IC.LAND[kind];
  for (const t of near) {
    const side = landSide(ap, t), B = blockers(S, ap, t.id);
    // (a building whose loop road cannot be laid gets no landside)
    if (!loopFits(S, ap, t, side, B)) continue;
    for (const c of plots(t, side, kind)) {
      const r = { kind, x: c.x, y: c.y, a: t.a, w: D.w, h: D.h, cap: D.cap, t0: null, by: t.id, band: c.band };
      if (free(S, ap, r, B)) return r;
    }
  }
  return null;
}
/* the loop at its full size keeps off the airfield and the other buildings */
function loopFits(S, ap, t, side, B) {
  const X = halfLen(t) + 0.15, D = t.h / 2 + depthOf(t) - 0.12;
  const pts = [IC.rectWorld(t, -X, side * (t.h / 2 + KERB)), IC.rectWorld(t, X, side * (t.h / 2 + KERB)), IC.rectWorld(t, X, side * D), IC.rectWorld(t, -X, side * D)];
  const sh = IC.shapeLine(pts.concat([pts[0]]), 0.07);
  return !B.some(b => IC.shapeDepth(sh, b) > 0.005);
}
IC.landInit = ap => ap.land || (ap.land = { items: [], pax: 0, cargo: 0, ver: 0, road: false, roads: [], t: 0 });

/* every ten game minutes: follow the passengers and cargo, add what is missing, and pay the income */
IC.landsideTick = function (S, ap, dt) {
  if (ap.kind !== 'airport' || ap.owner !== 'us') return;
  const L = IC.landInit(ap);
  L.t -= dt;
  if (L.t > 0) return;
  L.t = 600;
  IC.aptReseat(S, ap);
  // passengers and cargo, averaged over some hours so a busy hour does not build a hotel
  const cargoH = (ap.mvLog || []).filter(x => x.type === 'cargo' && x.k === 'arr').length * 60;
  L.pax += ((ap.paxRate || 0) - L.pax) * 0.05; L.cargo += (cargoH - L.cargo) * 0.05;
  if (!L.road) L.road = hasRoad(S, ap);
  const terms = ap.parts.filter(p => p.kind === 'terminal' && p.built && p.hp > p.max * 0.25);
  const sheds = ap.parts.filter(p => p.kind === 'cargo' && p.built && p.hp > p.max * 0.25);
  const want = IC.landWant(L, terms.length, sheds.length, railNear(S, ap));
  const have = k => L.items.filter(x => x.kind === k).length;
  let added = null;
  // (a landside laid out from real data is kept as it is: it only earns)
  if (!L.fixed) for (const [k, n] of want) {
    if (have(k) >= n) continue;
    const it = place(S, ap, k, k === 'warehouse' ? sheds : terms);
    if (!it) continue;
    it.t0 = S.time; if (k === 'stop' && L.pax > 2500 && railNear(S, ap)) { it.rail = true; it.name = 'Rail station'; }
    L.items.push(it); L.ver++; added = it;
    break;   // one at a time: the landside grows over hours, not in a moment
  }
  if (!L.fixed && (added || L.kerbN !== terms.length + sheds.length)) kerbs(S, ap, terms.concat(sheds));
  if (added) { ap._box = null; IC.worldChanged && IC.worldChanged(S, { x0: added.x - 2, y0: added.y - 2, x1: added.x + 2, y1: added.y + 2 }); if (added.kind !== 'park' || have('park') === 1) IC.log(S, 'info', 'AVIATION', `${ap.name}: ${added.name || IC.LAND[added.kind].name.toLowerCase()} ${/s$/.test(IC.LAND[added.kind].name) ? 'open' : 'opens'} by the ${added.kind === 'warehouse' ? 'cargo sheds' : 'terminal'}, built by private money: it pays the airport rent.`, S.story ? added : null); }
  // use and income: parking and hotels fill with passengers, warehouses with cargo
  let v = 0;
  for (const it of L.items) { it.use = IC.landUse(L, it); v += IC.LAND[it.kind].earn * it.use; }
  L.earn = v;
  if (v > 0) { S.budget += v * 600 / 3600; IC.econBook(S, 'landside', v * 600 / 3600); }
};
/* what the landside should have for its traffic: [kind, how many] in the order they appear */
IC.landWant = function (L, terms, sheds, rail) {
  const p = L.pax, out = [];
  if (!terms) return sheds && L.cargo > 5 ? [['warehouse', Math.ceil(L.cargo / 40)]] : [];
  if (p > 20) out.push(['park', 1]);
  if (p > 80) out.push(['stop', 1]);
  if (p > 150) out.push(['taxi', 1]);
  const spaces = p * 2.2, garages = p > 900 ? Math.floor((spaces - 1200) / 1500) : 0;
  out.push(['park', Math.min(6, Math.ceil(spaces / 400))]);
  if (garages > 0) out.push(['garage', Math.min(4, garages)]);
  if (p > 600) out.push(['hotel', Math.min(5, Math.floor(p / 600))]);
  if (p > 1500) out.push(['office', Math.min(4, Math.floor(p / 1500))]);
  if (sheds && L.cargo > 5) out.push(['warehouse', Math.min(6, Math.ceil(L.cargo / 40))]);
  return out;
};
/* how full an item is, 0..1 */
IC.landUse = function (L, it) {
  const p = L.pax;
  if (it.kind === 'warehouse') return U.clamp(L.cargo / 40 / Math.max(1, L.items.filter(x => x.kind === 'warehouse').length), 0.2, 1);
  if (it.kind === 'park' || it.kind === 'garage') { const cap = L.items.filter(x => x.kind === 'park' || x.kind === 'garage').reduce((a, x) => a + x.cap, 0); return U.clamp(p * 2.2 / Math.max(1, cap), 0.1, 1); }
  return U.clamp(p / 1500, 0.3, 1);
};
/* the roads of each building's landside: the kerb, a road beyond each band in use, the two ends joining them into a
   loop, and the road out to the country's network (or the access road), round the airfield */
function kerbs(S, ap, bl) {
  const L = ap.land; if (L.fixed) return; L.kerbN = bl.length; L.roads = L.roads.filter(r => r.keep); L.jn = [];
  const outs = [];
  for (const t of bl) {
    const sd = landSide(ap, t), mine = L.items.filter(it => it.by === t.id);
    if (!mine.length && t.kind === 'cargo') continue;
    // (a concourse with aprons on both sides, or hemmed in, has no landside: passengers come by the terminal)
    if (!mine.length && !loopFits(S, ap, t, sd, blockers(S, ap, t.id))) continue;
    const nb = Math.max(1, ...mine.map(it => (it.band != null ? it.band : 0) + 1)), y = d => sd * (t.h / 2 + d);
    // the loop is as long as what it serves: the building's front, or the items beyond it
    const X = Math.max(t.w / 2 + 0.4, ...mine.map(it => Math.abs(IC.rectLocal(t, it).x) + it.w / 2 + 0.15));
    const road = (x0, d0, x1, d1, kind, w) => { const r = { pts: [IC.rectWorld(t, x0, y(d0)), IC.rectWorld(t, x1, y(d1))], w, kind, by: t.id }; L.roads.push(r); return r; };
    const k = road(-X, KERB, X, KERB, 'kerb', 0.14); k.kerb = true; k.oneway = 1;
    for (let i = 0; i < nb; i++) road(-X, ROW(i), X, ROW(i), 'loop', 0.12);
    road(-X, KERB, -X, ROW(nb - 1), 'loop', 0.12); road(X, KERB, X, ROW(nb - 1), 'loop', 0.12);
    outs.push({ t, from: IC.rectWorld(t, 0, y(ROW(nb - 1))), n: IC.rectWorld(t, 0, y(ROW(nb - 1) + 0.3)) });
  }
  // out to the network: the nearest road outside the airfield, the airport's gate or the access road, or another
  // building's landside, found round everything in the way
  const B = [];
  for (const e of IC.aptElements(S, ap, { noWorld: true })) {
    if (e.cat === 'rwy') B.push({ sh: e.strip, pad: 0.05 }); else if (e.cat === 'twy') B.push({ sh: e.sh, pad: 0.18 });
    else if (e.cat === 'apron' || e.cat === 'bld') B.push({ sh: e.sh, pad: 0.06 });
    else if ((e.cat === 'land' || e.cat === 'park') && e.own) B.push({ sh: e.sh, pad: 0.04 });
  }
  const F = IC.aptFence(ap); if (F) B.push({ sh: IC.shapePoly(F.poly), pad: 0.05, carve: F.carveA });
  for (const o of outs) {
    const lines = [];
    const W = S.world, R = 30, box = r => [o.from.x - r, o.from.y - r, o.from.x + r, o.from.y + r], bb = box(R);
    if (L.access) lines.push(L.access.pts);
    for (const e of W.edges || []) { if (e.bb && (e.bb[2] < bb[0] || e.bb[0] > bb[2] || e.bb[3] < bb[1] || e.bb[1] > bb[3])) continue; for (const run of IC.openRuns(W, e.pts)) lines.push(run); }
    for (const q of outs) if (q !== o) for (const r of L.roads) if (r.by === q.t.id && r.kind === 'loop') lines.push(r.pts);
    // the rows of this loop are in the way of the road out, the loop's own ends are not
    const own = L.roads.filter(r => r.by === o.t.id).map(r => ({ sh: IC.shapeLine(r.pts, 0.02), pad: 0.03 }));
    const near = (x, y) => { for (const l of lines) for (let i = 1; i < l.length; i++) if (U.segDist(x, y, l[i - 1].x, l[i - 1].y, l[i].x, l[i].y) < 0.1) return true; return false; };
    const snap = p => { let best = p, bd = Infinity; for (const l of lines) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy || 1, f = U.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / LL, 0, 1), q = { x: a.x + dx * f, y: a.y + dy * f }, d = U.dist(p, q); if (d < bd) { bd = d; best = q; } } return best; };
    if (!lines.length) continue;
    // step off the loop first, straight out
    // (a small search first: the network is usually close)
    const path = IC.gridRoute(box(8), 0.1, B.concat(own), o.n, near, { snapEnd: snap }) || IC.gridRoute(bb, 0.1, B.concat(own), o.n, near, { snapEnd: snap });
    if (!path) continue;
    const pts = [o.from].concat(path);
    L.roads.push({ pts, w: 0.12, out: true, kind: 'out', by: o.t.id });
    L.jn.push(pts[pts.length - 1]);
  }
  // wherever the airport's roads meet another at grade, that is a junction
  const own = L.roads.filter(r => r.kind === 'out');
  for (const r of own) {
    for (const e of IC.aptElements(S, ap).filter(e => e.cat === 'road' && e.world)) for (let i = 1; i < r.pts.length; i++) for (let j = 1; j < e.sh.line.length; j++) {
      const a = r.pts[i - 1], b = r.pts[i], c = e.sh.line[j - 1], d = e.sh.line[j], t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
      if (t >= 0) L.jn.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  L.ver++;
}
IC.landKerbs = kerbs;
/* a road reaches the airport: any road node or road within 3 km of it */
function hasRoad(S, ap) {
  const W = S.world, R = 30;
  for (const k in W.nodes) { const n = W.nodes[k]; if (U.dxy(n.x, n.y, ap.x, ap.y) < R) return true; }
  for (const e of W.edges) { if (e.bb && (ap.x < e.bb[0] - R || ap.x > e.bb[2] + R || ap.y < e.bb[1] - R || ap.y > e.bb[3] + R)) continue; for (const q of e.pts) if (U.dxy(q.x, q.y, ap.x, ap.y) < R) return true; }
  return (S.econ && S.econ.works || []).some(w => w.apt === ap.id);
}
function railNear(S, ap) {
  const W = S.world;
  for (const r of W.rails || W.railways || []) for (const q of r.pts || []) { const x = q.x != null ? q.x : q[0], y = q.x != null ? q.y : q[1]; if (U.dxy(x, y, ap.x, ap.y) < 50) return true; }
  return false;
}

/* ---------- the access road a new airport gets ---------- */
/* from the landside of the site (the side towards the nearest city) to the nearest road, or straight into town */
/* the access road a site at x, y with its runway at a would get: { P (the road plan), pts, snaps, city, end }, or
   null. The site survey prices it before Found (playtest 1: a 20 km road was a hidden ₭48M) */
IC.landAccessPlan = function (S, x, y, a) {
  const W = S.world;
  if (!IC.roadPlan || !IC.roadFinish || !W.edges) return null;
  const at = { x, y };
  const city = IC.cities(S).filter(c => c.owner !== 'enemy').sort((p, q) => U.dist(p, at) - U.dist(q, at))[0];
  if (!city) return null;
  // leave the site at right angles to the runway, on the city's side, 500 m out
  const nx = -Math.sin(a || 0), ny = Math.cos(a || 0), side = ((city.x - x) * nx + (city.y - y) * ny) >= 0 ? 1 : -1;
  const start = { x: x + nx * side * 5, y: y + ny * side * 5 };
  // the nearest road, within 25 km; failing that, the city's own junction
  let end = null;
  for (const r of [15, 60, 250]) { const sn = IC.roadSnap(S, start.x, start.y, r); if (sn.node || sn.edge) { end = sn; break; } }
  if (!end && W.nodes[city.id]) end = { x: city.x, y: city.y, node: city.id };
  if (!end) return null;
  const pts = [start, { x: end.x, y: end.y }], snaps = [{ x: start.x, y: start.y }, end];
  let P = IC.roadPlan(S, 'lc', pts, snaps);
  if (P.why && W.nodes[city.id] && !end.node) { const e2 = { x: city.x, y: city.y, node: city.id }; const P2 = IC.roadPlan(S, 'lc', [start, e2], [snaps[0], e2]); if (!P2.why) { P = P2; pts[1] = e2; snaps[1] = e2; end = e2; } }
  return { P, pts, snaps, city, end };
};
IC.landAccessRoad = function (S, ap) {
  const W = S.world;
  const A = IC.landAccessPlan(S, ap.x, ap.y, ap.rwyA || 0); if (!A) return null;
  const { P, pts, snaps, city, end } = A, start = pts[0];
  ap.cityRef = { x: city.x, y: city.y };
  if (P.why) { IC.log(S, 'warn', 'ROADS', `${ap.name}: no access road could be laid automatically (${P.why.replace(/\.$/, '').toLowerCase()}). Build one with the road tool in the airport panel.`, ap); return null; }

  const w = IC.roadFinish(S, { cls: 'lc', pts, snaps });
  if (!w) return null;
  const L = IC.landInit(ap); L.road = true; L.access = { pts: pts.map(p => ({ x: p.x, y: p.y })), cost: P.cost, km: P.km, work: w.id };
  // (the road works log their own line; a card says the rest, so the line is only for games without cards)
  if (!(S.camp && IC.card)) IC.log(S, 'info', 'ROADS', `${ap.name}: an access road to ${city.name} is laid automatically: ${P.km.toFixed(1)} km for ${U.money(P.cost)}, open in about ${U.dur(P.hours * 3600)}. The road tool builds more.`, start);
  if (S.camp && IC.card) IC.card(S, 'Access road', ap.name, `An airport needs a road. A ${P.km.toFixed(1)} km access road from ${ap.name} to ${end.node === city.id ? city.name : `the road to ${city.name}`} has been laid out and paid for (${U.money(P.cost)}); the works take about ${U.dur(P.hours * 3600)}. Better roads bring more passengers: the road tool in the airport panel builds link roads and motorway spurs.`, 'info');
  return w;
};
IC.on((S, type, d) => { if (type === 'founded' && d && d.parts) IC.landAccessRoad(S, d); });

})(window.IC);
