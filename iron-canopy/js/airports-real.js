/* Iron Canopy — airports laid out from real data (brief 39).
   A layout is data, made by tools/airport-import.js from OpenStreetMap and OurAirports and shipped in
   airports-real-data.js (IC.REAL_APT[key]). IC.aptFromLayout(ap, L, o) builds it into an airport as ordinary parts:
   runways, taxiways and taxilanes as node chains, aprons and buildings as outlines, stands where the data puts them,
   passenger bridges, people movers, and the landside (roads on their levels, car parks and garages), fixed as mapped.

   Coordinates in a layout are world units (100 m) east (x) and south (y) of the airport reference point, rounded to
   0.1 m. Outlines are flat lists [x0, y0, x1, y1, ...]. Everything is placed at o.x, o.y turned by o.rot (radians,
   clockwise on the map), so a blueprint can be put down anywhere and turned. */
(function (IC) {
'use strict';
const U = IC.U;
IC.REAL_APT = IC.REAL_APT || {};

const pairs = F => { const o = []; for (let i = 0; i + 1 < F.length; i += 2) o.push({ x: F[i], y: F[i + 1] }); return o; };
IC.layoutPairs = pairs;
/* a layout point to the world */
IC.layoutXf = function (o) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), x0 = o.x || 0, y0 = o.y || 0;
  return (x, y) => ({ x: x0 + x * c - y * s, y: y0 + x * s + y * c });
};
/* the name of a runway end after turning by rot: each end keeps the offset between its real name and its true
   heading (magnetic variation, and Denver's 16/17 split), so a turned blueprint is renumbered the way the real one
   would be */
function endName(real, trueDeg, rot) {
  const m = /^(\d+)([LCR]?)$/.exec(real); if (!m) return real;
  if (!rot) return real;
  const off = +m[1] * 10 - trueDeg, h = trueDeg + rot * 180 / Math.PI + off, n = ((Math.round(h / 10) % 36) + 36) % 36 || 36;
  return String(n).padStart(2, '0') + m[2];
}
/* build the layout into the airport; returns the airport */
IC.aptFromLayout = function (ap, L, o) {
  o = Object.assign({ x: ap.x, y: ap.y, rot: 0 }, o || {});
  IC.initAirport(ap);
  const X = IC.layoutXf(o), P = F => pairs(F).map(q => X(q.x, q.y)), rot = o.rot || 0;
  const add = (part, built) => IC.aptAddPart(ap, part, built !== false);
  // runways first: nodes on their centrelines join them
  for (const r of L.runways || []) {
    const a = X(r.a[0], r.a[1]), b = X(r.b[0], r.b[1]);
    const brg = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI, h0 = ((r.hdg != null ? r.hdg : brg - rot * 180 / Math.PI) + 360) % 360;
    const rw = add({ kind: 'runway', a, b, w: r.w, real: true, ends: { a: endName(r.ends[0], h0, rot), b: endName(r.ends[1], (h0 + 180) % 360, rot) }, disp: r.disp || null, mat: r.mat || 'conc' });
    rw.custom = true; rw.name = `Runway ${rw.ends.a}/${rw.ends.b}`;
    for (const e of r.ils || []) add({ kind: 'ils', rw: rw.id, end: e });
  }
  // aprons, as outlines; stands where the data has them
  const aprons = (L.aprons || []).map(A => {
    const part = add(Object.assign(IC.polyPart('apron', P(A.poly)), { zone: A.zone || undefined, ramp: true, free: [], mat: A.mat || 'conc', name: A.name || undefined }));
    return part;
  });
  // taxiway nodes: every point shared by two ways is one node
  const nid = (L.nodes || []).map(q => { const w = X(q[0], q[1]); return IC.aptNode(ap, w.x, w.y); });
  for (const t of L.taxi || []) {
    if (!t.n || t.n.length < 2) continue;
    add({ kind: 'taxi', nodes: t.n.map(i => nid[i]), w: t.w || IC.APART.taxi.w, name: t.name || undefined, lane: t.lane ? 1 : 0, oneway: t.oneway || 0, lv: t.lv || 0, mat: t.mat || 'conc' });
  }
  // stands on their aprons, noses the way the data says, with a lead-in from a taxilane node
  for (const s of L.stands || []) {
    const A = aprons[s.ap]; if (!A) continue;
    const c = X(s.x, s.y), l = IC.rectLocal(A, c);
    A.free.push({ lx: l.x, ly: l.y, rot: U.angWrap(s.h + rot - A.a), size: s.size || 'm', via: s.via != null ? nid[s.via] : null, name: s.ref || null, zone: s.zone || undefined, gate: s.gate ? 1 : undefined, k: A.free.length });
  }
  // buildings: terminals and concourses, cargo sheds, hangars, the tower and fire stations, fuel, support
  const blds = (L.blds || []).map(B => {
    const kind = IC.APART[B.kind] ? B.kind : 'support';
    if (IC.APART[kind].r && B.c) { const c = X(B.c[0], B.c[1]); return add({ kind, x: c.x, y: c.y, a: rot, r: B.r || IC.APART[kind].r, name: B.name || undefined }); }
    const part = IC.polyPart(kind, P(B.poly));
    return add(Object.assign(part, { name: B.name || undefined, roof: B.roof || undefined, rows: B.rows || undefined, peaks: B.peaks || undefined, lvls: B.lvls || undefined, noApron: B.noApron || undefined, zone: B.zone || undefined }));
  });
  // passenger bridges over taxiways, with the height a tail must clear
  for (const B of L.bridges || []) add(Object.assign(IC.polyPart('skybridge', P(B.poly)), { clear: B.clear, name: B.name || undefined, joins: (B.joins || []).map(i => blds[i] && blds[i].id).filter(Boolean) }));
  // people movers between the terminals, on a viaduct (lv 1) or underground (lv -1)
  for (const M of L.movers || []) add({ kind: 'people', pts: P(M.pts), lv: M.lv != null ? M.lv : 1, name: M.name || undefined, stops: (M.stops || []).map(i => blds[i] && blds[i].id).filter(Boolean), w: M.w || IC.APART.people.w });
  // the landside, fixed as mapped: roads on their levels, car parks and garages
  const land = IC.landInit(ap);
  land.fixed = true; land.items = []; land.roads = []; land.jn = []; land.road = true;
  // (a road under a terminal is its kerb road: the building may stand over it)
  for (const R of L.roads || []) land.roads.push({ pts: P(R.pts), w: R.w || 0.1, lv: R.lv || 0, oneway: R.oneway || 0, lanes: R.lanes || 0, name: R.name || undefined, kind: R.kind || 'loop', cls: R.cls || 'service', kerb: R.kerb != null || undefined, by: R.kerb != null && blds[R.kerb] ? blds[R.kerb].id : undefined, out: R.out || undefined });
  for (const K of L.parks || []) {
    const kind = K.kind === 'garage' ? 'garage' : K.kind === 'taxi' ? 'taxi' : 'park', D = IC.LAND[kind], it = IC.polyPart(kind, P(K.poly));
    const ha = IC.partArea(it);
    land.items.push(Object.assign(it, { cap: Math.round(kind === 'garage' ? ha * 400 * (K.lvls || 4) : ha * 350), t0: 0, name: K.name || undefined, lvls: K.lvls || undefined, by: null, fixed: true, use: 0.5 }));
  }
  for (const J of L.junctions || []) land.jn.push(X(J[0], J[1]));
  // where the country's roads come in: the layout's road ends at the edge of the map it came from, else any road end
  // no other road meets
  if (L.exits && L.exits.length) ap.exits = L.exits.map(e => X(e[0], e[1]));
  else {
    const ends = []; for (const r of land.roads) if ((r.lv || 0) === 0) ends.push(r.pts[0], r.pts[r.pts.length - 1]);
    const touches = e => land.roads.filter(r => r.pts.some((q, i) => U.dist(q, e) < 0.05 || (i && U.segDist(e.x, e.y, r.pts[i - 1].x, r.pts[i - 1].y, q.x, q.y) < 0.03))).length;
    ap.exits = ends.filter(e => touches(e) === 1);
  }
  land.ver++;
  IC.resolveNodes(ap);
  ap.dirty = true; ap.template = L.key || 'real'; ap.real = L.key || null;
  ap.rwyA = (() => { const r = ap.parts.find(p => p.kind === 'runway'); return r ? Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x) : rot; })();
  const r0 = ap.parts.filter(p => p.kind === 'runway').sort((a, b) => IC.rwLen(b) - IC.rwLen(a))[0];
  ap.rwyL = r0 ? IC.rwLen(r0) : 20;
  // service roads airside, as mapped (the builder's automatic links are for buildings placed by hand)
  ap.svcRoads = (L.service || []).map(R => ({ pts: P(R.pts), w: R.w || 0.06 }));
  IC.aptExtent(ap);
  ap.buildR = Math.max(ap.buildR || 0, ap.radius + 5);
  return ap;
};

/* how far a layout reaches from its reference point (units) */
IC.layoutRadius = function (L) {
  let r = 0;
  const see = F => { for (let i = 0; i + 1 < F.length; i += 2) r = Math.max(r, Math.hypot(F[i], F[i + 1])); };
  for (const R of L.runways || []) see(R.a.concat(R.b));
  for (const q of L.nodes || []) see(q);
  for (const k of ['aprons', 'blds', 'bridges', 'parks']) for (const x of L[k] || []) if (x.poly) see(x.poly);
  for (const k of ['roads', 'movers', 'service']) for (const x of L[k] || []) see(x.pts);
  return r;
};
/* a flat, dry, empty site for a layout: within reach of the capital by road, clear of towns, villages, lakes, rivers
   and other airfields, the ground level over the whole of it. The nearest such site wins. */
IC.realSite = function (S, L, near) {
  const W = S.world, R = IC.layoutRadius(L) + 4, others = S.infra.filter(i => (i.kind === 'airport' || i.kind === 'airbase') && i !== near.ap);
  // (rivers by their lines, not the coarse distance grid: no river within the layout and 300 m round it)
  const wet = (x, y) => { for (const r of W.rivers || []) { const bb = r.bb || [-1e9, -1e9, 1e9, 1e9], m = R + (r.w || 1) + 3; if (x < bb[0] - m || x > bb[2] + m || y < bb[1] - m || y > bb[3] + m) continue; const P = r.pts || []; for (let i = 1; i < P.length; i++) if (U.segDist(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]) < m) return true; } return false; };
  const fits = (x, y) => {
    if (others.some(b => U.dxy(b.x, b.y, x, y) < R + 60)) return false;
    if (wet(x, y)) return false;
    for (const c of W.cities) if (U.dxy(c.x, c.y, x, y) < R + (c.r || 20) * 1.3) return false;
    for (const v of W.villages || []) if (U.dxy(v.x, v.y, x, y) < R + 4) return false;
    // (no road or railway of the country across it: the landside is laid out as mapped, so nothing is moved round it)
    const across = l => { if (!l.pts || l.pts.length < 2) return false; const b = l.bb || (l.bb = [Math.min(...l.pts.map(q => q.x)), Math.min(...l.pts.map(q => q.y)), Math.max(...l.pts.map(q => q.x)), Math.max(...l.pts.map(q => q.y))]); if (x < b[0] - R || x > b[2] + R || y < b[1] - R || y > b[3] + R) return false; for (let i = 1; i < l.pts.length; i++) if (U.segDist(x, y, l.pts[i - 1].x, l.pts[i - 1].y, l.pts[i].x, l.pts[i].y) < R) return true; return false; };
    if (W.edges.some(e => (e.a !== near.ap.id && e.b !== near.ap.id) && across(e)) || (W.rails || []).some(across)) return false;
    for (let j = -R; j <= R; j += R / 6) for (let i = -R; i <= R; i += R / 6) {
      if (i * i + j * j > R * R) continue;
      const px = x + i, py = y + j;
      if (!IC.inHome(px, py) || W.inLake(px, py) || (W.riverDist && W.riverDist(px, py) < 3) || W.slopeAt(px, py) > 0.05) return false;
    }
    return true;
  };
  let best = null, bs = Infinity;
  for (let d = R + 40; d < R + 900 && !best; d += 25) for (let k = 0; k < 32; k++) {
    const a = k / 32 * Math.PI * 2, x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d;
    if (!fits(x, y)) continue;
    // (flatter first, then nearer a road)
    let road = 1e9; for (const e of W.edges) { if (e.bb && (x < e.bb[0] - R - 50 || x > e.bb[2] + R + 50 || y < e.bb[1] - R - 50 || y > e.bb[3] + R + 50)) continue; for (const q of e.pts) road = Math.min(road, U.dxy(q.x, q.y, x, y)); }
    const sc = d + Math.max(0, road - R) * 0.5 + W.slopeAt(x, y) * 4000;
    if (sc < bs) { bs = sc; best = { x, y }; }
  }
  return best;
};
/* The airport showcase: the capital's airport becomes the real one, at real scale on a flat site near the capital,
   named as the game names it ("after Denver International"). The country's road is brought to its own road's end. */
IC.showcaseSetup = function (S, key) {
  const L = IC.REAL_APT[key]; if (!L) return null;
  const W = S.world, cap = W.cities[0];
  const ap = S.infra.find(i => i.kind === 'airport' && i.city === cap.id) || S.infra.find(i => i.kind === 'airport');
  if (!ap) return null;
  const site = IC.realSite(S, L, { x: cap.x, y: cap.y, ap }) || { x: ap.x, y: ap.y };
  // the road that served the old site: cut back to the point nearest the new one (the rest is laid round the field)
  for (const e of W.edges) {
    if (e.a !== ap.id && e.b !== ap.id) continue;
    const pts = e.a === ap.id ? e.pts.slice().reverse() : e.pts.slice();
    let k = 0, bd = Infinity; pts.forEach((q, i) => { const d = U.dist(q, site); if (d < bd) { bd = d; k = i; } });
    const np = pts.slice(0, Math.max(2, k + 1));
    e.pts = e.a === ap.id ? np.reverse() : np; e.bb = null; e.cum = null;
    e.len = 0; for (let i = 1; i < e.pts.length; i++) e.len += U.dist(e.pts[i - 1], e.pts[i]);
  }
  ap.x = site.x; ap.y = site.y;
  if (W.nodes[ap.id]) { W.nodes[ap.id].x = site.x; W.nodes[ap.id].y = site.y; }
  IC.aptFromLayout(ap, L, { x: site.x, y: site.y, rot: 0 });
  ap.name = L.name; ap.after = L.after; ap.showcase = key; ap.cityRef = { x: cap.x, y: cap.y };
  ap.crews = 1; ap.works = []; ap.autoRepair = true;
  S.showcase = key;
  return ap;
};

/* ---------- blueprints: a real airport planned into one of ours ---------- */
/* the layout at x, y turned by rot, built into a scratch airport so it can be measured and checked */
function scratch(ap, L, x, y, rot) {
  const t = { id: ap.id + 'bp', kind: 'airport', x, y, name: ap.name };
  IC.aptFromLayout(t, L, { x, y, rot });
  return t;
}
/* can the blueprint go here: in the country, on dry land, clear of other airfields and of what the airport already
   has; what it costs and what must be in hand to start */
IC.bldBlueprintCheck = function (S, ap, key, x, y, rot) {
  const L = IC.REAL_APT[key]; if (!L) return { ok: false, why: 'No such blueprint.' };
  const t = scratch(ap, L, x, y, rot), out = { ok: true, why: '', t, cost: 0, hit: null, parts: t.parts.length };
  const no = (why, hit) => Object.assign(out, { ok: false, why, hit: hit || null });
  const W = S.world;
  // the ground: every runway end, node and outline corner in the country and out of the water; runways off rivers
  const pts = [];
  for (const p of t.parts) { if (p.kind === 'runway') pts.push(p.a, p.b); else if (p.pts) pts.push(...p.pts); else if (p.x != null) pts.push(...IC.partOutline(p)); }
  for (const n of Object.values(t.nodes)) pts.push(n);
  for (const q of pts) { if (!IC.inHome(q.x, q.y)) return no('It crosses the border.'); if (W.inLake(q.x, q.y)) return no('Part of it stands in a lake.'); }
  for (const rw of t.parts.filter(p => p.kind === 'runway')) { const n = Math.ceil(IC.rwLen(rw) / 0.5); for (let k = 0; k <= n; k++) { const q = IC.rwAt(rw, k / n); if (IC.onRiver && IC.onRiver(q.x, q.y)) return no(`${rw.name} would cross a river: turn it or move it.`); } }
  // other airfields: their circuits
  for (const b of IC.bases(S)) if (b !== ap && b.parts && b.parts.length && U.dist(b, { x, y }) < (b.radius || 20) + t.radius + 30) return no(`Too close to ${b.name}: their circuits would overlap.`, b);
  // what this airport already has
  const mine = ap.parts.filter(p => p.kind !== 'ils').map(p => IC.aptElementOf(ap, p)).filter(Boolean);
  for (const p of t.parts) {
    const e = IC.aptElementOf(t, p); if (!e) continue;
    for (const q of mine) if (IC.shapeDepth(e.sh, q.sh) > 0.01) return no(`It overlaps ${q.name}: move it clear, or bulldoze that first.`, q.p);
  }
  for (const p of t.parts) out.cost += IC.partCost(t, p);
  out.start = out.cost * 0.1;
  if (S.budget < out.start) return no(`Not enough money to start: ${U.money(out.start)} of ${U.money(out.cost)} needed now, the rest as the work runs.`);
  return out;
};
/* plan it: every part the layout has, planned as works like any other (paid for as they run), the landside as mapped */
IC.bldBlueprint = function (S, ap, key, x, y, rot) {
  const C = IC.bldBlueprintCheck(S, ap, key, x, y, rot);
  if (!C.ok) { IC.log(S, 'warn', 'BUILD', C.why); return null; }
  const t = C.t, L = IC.REAL_APT[key], nid = {}, pid = {};
  for (const n of Object.values(t.nodes)) { const id = ap.id + 'n' + (ap.nodeN++); nid[n.id] = id; ap.nodes[id] = { id, x: n.x, y: n.y, on: null }; }
  const made = [];
  for (const p0 of t.parts) {
    const part = Object.assign({}, p0);
    for (const k of ['id', 'hp', 'max', 'built', 'prog', 'stands', '_sh', '_shk', 'door']) delete part[k];
    if (part.nodes) part.nodes = part.nodes.map(i => nid[i]);
    if (part.free) part.free = part.free.map(f => Object.assign({}, f, { via: f.via ? nid[f.via] : null }));
    if (part.craters) part.craters = [];
    if (part.cut) part.cut = {};
    IC.aptAddPart(ap, part, false);
    pid[p0.id] = part.id; made.push(part);
  }
  for (const part of made) {
    if (part.rw) part.rw = pid[part.rw] || part.rw;
    if (part.joins) part.joins = part.joins.map(i => pid[i] || i);
    if (part.stops) part.stops = part.stops.map(i => pid[i] || i);
  }
  IC.resolveNodes(ap);
  for (const part of made) { const pv = IC.bldPreview(S, ap, part); const w = IC.bldStart(S, ap, part, pv); ap.works.push(w); }
  // one step to undo, like any plan of several parts
  ap.undo = ap.undo || []; ap.undo.splice(ap.undo.length - made.length, made.length, made.map(p => p.id));
  // the landside as mapped, and where the country's roads come in
  const land = IC.landInit(ap);
  Object.assign(land, { fixed: true, items: t.land.items, roads: t.land.roads, jn: t.land.jn, road: true }); land.ver++;
  ap.exits = t.exits; ap.svcRoads = (ap.svcRoads || []).concat(t.svcRoads || []);
  ap.real = key; ap.after = L.after;
  ap.dirty = true; IC.aptExtent(ap); ap.buildR = Math.max(ap.buildR || 0, ap.radius + 5);
  ap._seatKey = null; IC.aptReseat(S, ap);
  IC.aptStats(S, ap);
  IC.log(S, 'info', 'BUILD', `${ap.name}: the ${L.name} blueprint (${L.after}) is planned: ${made.length} parts, ${U.money(C.cost)} paid as the work runs, ${U.money(C.start)} of it now. More crews build it sooner (the Works tab).`, ap);
  IC.emit(S, 'aptPlan', { ap, part: made[0], blueprint: key });
  return made;
};

/* The showcase's day: aircraft in proportion to the airport's stands (about four for every five stands: the gates
   stay busy all day, and the step stays within its budget at a 300-stand airport), by stand size: wide-bodies for the large stands, narrow-bodies for the medium, regional jets and
   turboprops for the small; freighters for the cargo stands. Flag, low-cost, regional, cargo and foreign airlines, to
   the foreign ports and the country's other airports. */
IC.showcaseTraffic = function (S, ap, o) {
  ap.dirty = true; IC.aptGraph(ap); IC.aptStats(S, ap);
  const st = IC.aptStands(ap).filter(s => s.linked && s.hp > 0);
  const n = { l: 0, m: 0, s: 0, cargo: 0 };
  for (const s of st) { if (s.zone === 'mil' || s.zone === 'light') continue; if (s.cargo || s.zone === 'cargo') n.cargo++; else n[s.size === 'xl' ? 'l' : s.size]++; }
  const P = o.ports.length ? o.ports : [{ apt: o.second.id }];
  const dom = [o.second, o.third].filter(x => x && x !== ap).map(x => ({ apt: x.id }));
  const al = { flag: o.mk('flag', ap), budget: o.mk('budget', ap), regional: o.mk('regional', ap), cargo: o.mk('cargo', ap) };
  // fleets: [airline, type, share of the stands of that size, destinations]
  const plan = [
    [al.flag, 'widel', n.l * 0.35, P], [al.flag, 'wide', n.l * 0.3, P], [al.flag, 'jumbo', n.l * 0.1, P],
    [al.flag, 'narrow', n.m * 0.45, P.concat(dom)], [al.budget, 'narrow', n.m * 0.55, P.concat(dom)],
    [al.regional, 'rj', n.s * 0.6, dom.concat(P)], [al.regional, 'turbo', n.s * 0.5, dom.length ? dom : P],
    [al.cargo, 'cargo', n.cargo * 0.9, P], [al.cargo, 'cargoprop', n.cargo * 0.3, dom.length ? dom : P]
  ];
  for (const f of o.foreign) plan.push([f, U.pick(['wide', 'widel', 'narrow']), Math.max(1, n.l * 0.08), P.filter(p => p.k === f.country).concat(P)]);
  let k = 0;
  for (const [a, type, share, dest] of plan) {
    let left = Math.round(share * 0.8);
    // (spread over the destinations, a few aircraft to each route)
    while (left > 0 && dest.length) { const m = Math.min(left, 3); o.add(a, ap, dest[k++ % dest.length], type, m); left -= m; }
  }
  return S.av.tails.length;
};

/* The fence of an airport laid out from data: the airside and its clearances (runway strips, taxiways and their
   verges, aprons, airside buildings) on a 20 m grid, gaps under 300 m closed, the mapped landside (its roads, car
   parks, garages and the terminals' landside faces) taken out, and the outline traced and straightened. Concave:
   it runs round the landside the way a real perimeter fence does. */
IC.aptTraceFence = function (ap) {
  const E = IC.aptElements(null, ap, { noWorld: true });
  const air = [], land = [];
  for (const e of E) {
    if (e.cat === 'rwy') air.push({ sh: e.strip, pad: 0.3 });
    else if (e.cat === 'twy') air.push({ sh: e.sh, pad: 0.5 });
    else if (e.cat === 'apron') air.push({ sh: e.sh, pad: 0.3 });
    else if (e.cat === 'bld' && e.p.kind !== 'terminal') air.push({ sh: e.sh, pad: 0.2 });
    else if (e.cat === 'road' && e.own && (e.lv || 0) >= 0) land.push({ sh: e.sh, pad: 0.35 });
    else if ((e.cat === 'park' || e.cat === 'land') && e.own) land.push({ sh: e.sh, pad: 0.2 });
  }
  if (!air.length) return null;
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const b of air) { const q = b.sh.bb; bb = [Math.min(bb[0], q[0]), Math.min(bb[1], q[1]), Math.max(bb[2], q[2]), Math.max(bb[3], q[3])]; }
  // (cells of 20 m, coarser on a big airport: about 400 across)
  const R = 5, M = R + 2, c = Math.max(0.2, Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 400), box = [bb[0] - M, bb[1] - M, bb[2] + M, bb[3] + M];
  const A = IC.shapeRaster(box, c, air), Lr = IC.shapeRaster(box, c, land);
  if (!A) return null;
  const { nx, ny } = A;
  // close the gaps up to 1 km: grow by R (units), then shrink by R, each by a two-pass distance transform
  const dt = (src, val) => {
    const D = new Float32Array(src.length).fill(1e9), s2 = Math.SQRT2;
    for (let k = 0; k < src.length; k++) if (src[k] === val) D[k] = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; let d = D[k]; if (i) d = Math.min(d, D[k - 1] + 1); if (j) { d = Math.min(d, D[k - nx] + 1); if (i) d = Math.min(d, D[k - nx - 1] + s2); if (i < nx - 1) d = Math.min(d, D[k - nx + 1] + s2); } D[k] = d; }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let d = D[k]; if (i < nx - 1) d = Math.min(d, D[k + 1] + 1); if (j < ny - 1) { d = Math.min(d, D[k + nx] + 1); if (i < nx - 1) d = Math.min(d, D[k + nx + 1] + s2); if (i) d = Math.min(d, D[k + nx - 1] + s2); } D[k] = d; }
    return D;
  };
  const r = R / c, D1 = dt(A.bad, 1), G = new Uint8Array(A.bad.length);
  for (let k = 0; k < G.length; k++) G[k] = D1[k] <= r ? 1 : 0;
  const D2 = dt(G, 0), F = new Uint8Array(G.length);
  for (let k = 0; k < F.length; k++) F[k] = D2[k] > r ? 1 : 0;
  for (let k = 0; k < F.length; k++) if (A.bad[k]) F[k] = 1;
  // the landside is outside, and so is anything it cuts off from the airside
  for (let k = 0; k < F.length; k++) if (Lr.bad[k] && !A.bad[k]) F[k] = 0;
  // the largest piece only
  const lab = new Int32Array(F.length).fill(-1); let best = -1, bn = 0;
  for (let k0 = 0, id = 0; k0 < F.length; k0++) { if (!F[k0] || lab[k0] >= 0) continue; let n = 0; const Q = [k0]; lab[k0] = id; while (Q.length) { const k = Q.pop(); n++; const i = k % nx, j = (k / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const q = jj * nx + ii; if (F[q] && lab[q] < 0) { lab[q] = id; Q.push(q); } } } if (n > bn) { bn = n; best = id; } id++; }
  for (let k = 0; k < F.length; k++) F[k] = lab[k] === best ? 1 : 0;
  // trace the outline: walk the boundary edges of the filled cells, then straighten it (Douglas–Peucker, 15 m)
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && F[j * nx + i] === 1;
  let si = -1, sj = -1; for (let k = 0; k < F.length && si < 0; k++) if (F[k]) { si = k % nx; sj = (k / nx) | 0; }
  if (si < 0) return null;
  // follow the boundary along the cell corners, the filled cells on the right, from the top-left corner of the first
  const pts = []; let x = si, y = sj, d = 0; const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  for (let n = 0; n < 4 * (nx + ny) * 8; n++) {
    pts.push({ x: box[0] + x * c, y: box[1] + y * c });
    // try turning left, straight, right, back: the first move with a filled cell on the right and an empty one on the left
    let moved = false;
    for (const t of [3, 0, 1, 2]) {
      const nd = (d + t) % 4, ahead = { x: x + DX[nd], y: y + DY[nd] };
      // the cell to the right of the step from (x, y) heading nd, and the one to its left
      const rc = nd === 0 ? [x, y] : nd === 1 ? [x - 1, y] : nd === 2 ? [x - 1, y - 1] : [x, y - 1];
      const lc = nd === 0 ? [x, y - 1] : nd === 1 ? [x, y] : nd === 2 ? [x - 1, y] : [x - 1, y - 1];
      if (at(rc[0], rc[1]) && !at(lc[0], lc[1])) { x = ahead.x; y = ahead.y; d = nd; moved = true; break; }
    }
    if (!moved || (x === si && y === sj)) break;
  }
  const simp = (P, tol) => { if (P.length < 4) return P; const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]]; while (st.length) { const [a, b] = st.pop(); let m = -1, mi = -1; for (let i = a + 1; i < b; i++) { const dd = U.segDist(P[i].x, P[i].y, P[a].x, P[a].y, P[b].x, P[b].y); if (dd > m) { m = dd; mi = i; } } if (m > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } } return P.filter((_, i) => keep[i]); };
  // (the grid's steps straightened out: the fence runs in straight lengths between posts)
  const poly = simp(pts, Math.max(0.3, c * 1.5));
  if (poly.length < 3) return null;
  const a = ap.rwyA || 0, cs = Math.cos(-a), sn = Math.sin(-a);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of poly) { const dx = q.x - ap.x, dy = q.y - ap.y, lx = dx * cs - dy * sn, ly = dx * sn + dy * cs; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: ap.x + cx * Math.cos(a) - cy * Math.sin(a), y: ap.y + cx * Math.sin(a) + cy * Math.cos(a), w: x1 - x0, h: y1 - y0, a, poly, carve: [], hullA: poly.map(q => [q.x, q.y]), carveA: [], traced: true };
};

})(window.IC);
