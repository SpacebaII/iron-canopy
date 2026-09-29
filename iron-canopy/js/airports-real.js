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
    A.free.push({ lx: l.x, ly: l.y, rot: U.angWrap(s.h + rot - A.a), size: s.size || 'm', via: s.via != null ? nid[s.via] : null, name: s.ref || null, zone: s.zone || undefined, k: A.free.length });
  }
  // buildings: terminals and concourses, cargo sheds, hangars, the tower and fire stations, fuel, support
  const blds = (L.blds || []).map(B => {
    const kind = IC.APART[B.kind] ? B.kind : 'support';
    if (IC.APART[kind].r && B.c) { const c = X(B.c[0], B.c[1]); return add({ kind, x: c.x, y: c.y, a: rot, r: B.r || IC.APART[kind].r, name: B.name || undefined }); }
    const part = IC.polyPart(kind, P(B.poly));
    return add(Object.assign(part, { name: B.name || undefined, roof: B.roof || undefined, lvls: B.lvls || undefined, noApron: B.noApron || undefined, zone: B.zone || undefined }));
  });
  // passenger bridges over taxiways, with the height a tail must clear
  for (const B of L.bridges || []) add(Object.assign(IC.polyPart('bridge', P(B.poly)), { clear: B.clear, name: B.name || undefined, joins: (B.joins || []).map(i => blds[i] && blds[i].id).filter(Boolean) }));
  // people movers between the terminals, on a viaduct (lv 1) or underground (lv -1)
  for (const M of L.movers || []) add({ kind: 'people', pts: P(M.pts), lv: M.lv != null ? M.lv : 1, name: M.name || undefined, stops: (M.stops || []).map(i => blds[i] && blds[i].id).filter(Boolean), w: M.w || IC.APART.people.w });
  // the landside, fixed as mapped: roads on their levels, car parks and garages
  const land = IC.landInit(ap);
  land.fixed = true; land.items = []; land.roads = []; land.jn = []; land.road = true;
  for (const R of L.roads || []) land.roads.push({ pts: P(R.pts), w: R.w || 0.1, lv: R.lv || 0, oneway: R.oneway || 0, lanes: R.lanes || 0, name: R.name || undefined, kind: R.kind || 'loop', cls: R.cls || 'service' });
  for (const K of L.parks || []) {
    const kind = K.kind === 'garage' ? 'garage' : K.kind === 'taxi' ? 'taxi' : 'park', D = IC.LAND[kind], it = IC.polyPart(kind, P(K.poly));
    const ha = IC.partArea(it);
    land.items.push(Object.assign(it, { cap: Math.round(kind === 'garage' ? ha * 400 * (K.lvls || 4) : ha * 350), t0: 0, name: K.name || undefined, lvls: K.lvls || undefined, by: null, fixed: true, use: 0.5 }));
  }
  for (const J of L.junctions || []) land.jn.push(X(J[0], J[1]));
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

})(window.IC);
