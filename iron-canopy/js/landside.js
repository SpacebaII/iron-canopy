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
/* candidate plots along a building's landside, nearest first: rows further out, each row spreading from the middle */
function plots(t, side, kind) {
  const L = Math.max(t.w, 2), out = [], D = IC.LAND[kind];
  const rows = kind === 'stop' || kind === 'taxi' ? [0.45] : kind === 'garage' ? [0.45, 1.2] : kind === 'park' ? [1.2, 2.2, 3.2] : kind === 'warehouse' ? [0.5, 1.4] : [2.3, 3.3, 4.3];
  for (const r of rows) for (let i = 0; i < 24; i++) {
    const k = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), x = k * (D.w + 0.12);
    if (Math.abs(x) > L / 2 + 3) continue;
    out.push(IC.rectWorld(t, x, side * (t.h / 2 + r + D.h / 2)));
  }
  return out;
}
/* a plot is free when it keeps off the airport's parts, the other landside items, water, the country's edge and towns */
function free(S, ap, r) {
  const W = S.world;
  if (!IC.inHome(r.x, r.y) || (W.inLake && W.inLake(r.x, r.y)) || (IC.onRiver && IC.onRiver(r.x, r.y))) return false;
  for (const q of ap.parts) {
    if (q.kind === 'runway') { if (IC.partDist(ap, q, r) < 1.5 + Math.max(r.w, r.h) / 2) return false; continue; }
    if (q.kind === 'taxi') { if (IC.partDist(ap, q, r) < 0.35 + Math.max(r.w, r.h) / 2) return false; continue; }
    const shp = q.r ? { x: q.x, y: q.y, a: 0, w: q.r * 2, h: q.r * 2 } : q.w ? q : null;
    if (shp && IC.rectsOverlap(shp, { x: r.x, y: r.y, a: r.a, w: r.w + 0.2, h: r.h + 0.2 }, 0)) return false;
  }
  for (const it of ap.land.items) if (IC.rectsOverlap(it, { x: r.x, y: r.y, a: r.a, w: r.w + 0.1, h: r.h + 0.1 }, 0)) return false;
  for (const c of IC.cities(S)) { if (U.dist(c, r) > (c.r || 20) * 1.6 + 5) continue; for (const b of c.blocks || []) if (b.hp > 0 && U.dxy(b.x, b.y, r.x, r.y) < Math.max(r.w, r.h) / 2 + Math.max(b.w, b.h) * 0.4) return false; }
  return true;
}
function place(S, ap, kind, near) {
  const D = IC.LAND[kind];
  for (const t of near) {
    const side = landSide(ap, t);
    for (const c of plots(t, side, kind)) {
      const r = { kind, x: c.x, y: c.y, a: t.a, w: D.w, h: D.h, cap: D.cap, t0: null, by: t.id };
      if (free(S, ap, r)) return r;
    }
  }
  return null;
}
IC.landInit = ap => ap.land || (ap.land = { items: [], pax: 0, cargo: 0, ver: 0, road: false, roads: [], t: 0 });

/* every ten game minutes: follow the passengers and cargo, add what is missing, and pay the income */
IC.landsideTick = function (S, ap, dt) {
  if (ap.kind !== 'airport' || ap.owner !== 'us') return;
  const L = IC.landInit(ap);
  L.t -= dt;
  if (L.t > 0) return;
  L.t = 600;
  // passengers and cargo, averaged over some hours so a busy hour does not build a hotel
  const cargoH = (ap.mvLog || []).filter(x => x.type === 'cargo' && x.k === 'arr').length * 60;
  L.pax += ((ap.paxRate || 0) - L.pax) * 0.05; L.cargo += (cargoH - L.cargo) * 0.05;
  if (!L.road) L.road = hasRoad(S, ap);
  const terms = ap.parts.filter(p => p.kind === 'terminal' && p.built && p.hp > p.max * 0.25);
  const sheds = ap.parts.filter(p => p.kind === 'cargo' && p.built && p.hp > p.max * 0.25);
  const want = IC.landWant(L, terms.length, sheds.length, railNear(S, ap));
  const have = k => L.items.filter(x => x.kind === k).length;
  let added = null;
  for (const [k, n] of want) {
    if (have(k) >= n) continue;
    const it = place(S, ap, k, k === 'warehouse' ? sheds : terms);
    if (!it) continue;
    it.t0 = S.time; if (k === 'stop' && L.pax > 2500 && railNear(S, ap)) { it.rail = true; it.name = 'Rail station'; }
    L.items.push(it); L.ver++; added = it;
    break;   // one at a time: the landside grows over hours, not in a moment
  }
  if (added || L.kerbN !== terms.length + sheds.length) kerbs(S, ap, terms.concat(sheds));
  if (added) { ap._box = null; IC.worldChanged && IC.worldChanged(S, { x0: added.x - 2, y0: added.y - 2, x1: added.x + 2, y1: added.y + 2 }); if (added.kind !== 'park' || have('park') === 1) IC.log(S, 'info', 'AVIATION', `${ap.name}: ${added.name || IC.LAND[added.kind].name.toLowerCase()} opens by the ${added.kind === 'warehouse' ? 'cargo sheds' : 'terminal'}, built by private money: it pays the airport rent.`, added); }
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
/* the kerb road along each terminal's and shed's landside, driveways to the items, and the road out to the network */
function kerbs(S, ap, bl) {
  const L = ap.land; L.kerbN = bl.length; L.roads = [];
  for (const t of bl) {
    const sd = landSide(ap, t), y = sd * (t.h / 2 + 0.2);
    L.roads.push({ pts: [IC.rectWorld(t, -t.w / 2 - 0.5, y), IC.rectWorld(t, t.w / 2 + 0.5, y)], w: 0.14, kerb: true, by: t.id });
  }
  for (const it of L.items) {
    const t = ap.parts.find(q => q.id === it.by); if (!t) continue;
    const sd = landSide(ap, t), l = IC.rectLocal(t, it), near = IC.rectWorld(t, l.x, l.y - sd * it.h / 2), ky = sd * (t.h / 2 + 0.2);
    L.roads.push({ pts: [near, IC.rectWorld(t, U.clamp(l.x, -t.w / 2 - 0.5, t.w / 2 + 0.5), ky)], w: 0.07 });
  }
  // out to the nearest road (or the access road's start) from the nearest kerb end, on the landside and without
  // crossing the airfield
  const k0 = L.roads.find(r => r.kerb);
  if (k0) {
    const t = ap.parts.find(q => q.id === k0.by), sd = landSide(ap, t), out = IC.rectWorld(t, 0, sd * (t.h / 2 + 3));
    let tgt = L.access ? L.access.pts[0] : null;
    if (!tgt && IC.roadSnap) { const sn = IC.roadSnap(S, out.x, out.y, 40); if (sn && (sn.node || sn.edge)) tgt = { x: sn.x, y: sn.y }; }
    const ends = L.roads.filter(r => r.kerb).flatMap(r => r.pts);
    const e = tgt && ends.slice().sort((a, b) => U.dist(a, tgt) - U.dist(b, tgt))[0];
    if (e && sd * IC.rectLocal(t, tgt).y > 0 && !crossesField(ap, e, tgt)) L.roads.push({ pts: [e, tgt], w: 0.12, out: true });
  }
  L.ver++;
}
IC.landKerbs = kerbs;
/* a straight road from a to b would cross a runway, taxiway or apron */
function crossesField(ap, a, b) {
  const X = (p, q) => U.segX(a.x, a.y, b.x, b.y, p.x, p.y, q.x, q.y) >= 0;
  for (const q of ap.parts) {
    if (q.kind === 'runway' && X(q.a, q.b)) return true;
    if (q.kind === 'taxi') for (let i = 1; i < q.nodes.length; i++) { const n0 = ap.nodes[q.nodes[i - 1]], n1 = ap.nodes[q.nodes[i]]; if (n0 && n1 && X(n0, n1)) return true; }
    if (q.kind === 'apron') { const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => IC.rectWorld(q, sx * q.w / 2, sy * q.h / 2)); for (let i = 0; i < 4; i++) if (X(c[i], c[(i + 1) % 4])) return true; }
  }
  return false;
}
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
IC.landAccessRoad = function (S, ap) {
  const W = S.world;
  if (!IC.roadPlan || !IC.roadFinish || !W.edges) return null;
  const city = IC.cities(S).filter(c => c.owner !== 'enemy').sort((a, b) => U.dist(a, ap) - U.dist(b, ap))[0];
  if (!city) return null;
  ap.cityRef = { x: city.x, y: city.y };
  // leave the site at right angles to the runway, on the city's side, 500 m out
  const a = ap.rwyA || 0, nx = -Math.sin(a), ny = Math.cos(a), side = ((city.x - ap.x) * nx + (city.y - ap.y) * ny) >= 0 ? 1 : -1;
  const start = { x: ap.x + nx * side * 5, y: ap.y + ny * side * 5 };
  // the nearest road, within 25 km; failing that, the city's own junction
  let end = null;
  for (const r of [15, 60, 250]) { const sn = IC.roadSnap(S, start.x, start.y, r); if (sn.node || sn.edge) { end = sn; break; } }
  if (!end && W.nodes[city.id]) end = { x: city.x, y: city.y, node: city.id };
  if (!end) return null;
  const pts = [start, { x: end.x, y: end.y }], snaps = [{ x: start.x, y: start.y }, end];
  let P = IC.roadPlan(S, 'lc', pts, snaps);
  if (P.why && W.nodes[city.id] && !end.node) { const e2 = { x: city.x, y: city.y, node: city.id }; const P2 = IC.roadPlan(S, 'lc', [start, e2], [snaps[0], e2]); if (!P2.why) { P = P2; pts[1] = e2; snaps[1] = e2; } }
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
