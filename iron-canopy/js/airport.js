/* Iron Canopy — airports as built places, at real scale (1 unit = 100 m).
   Runways, taxiways, aprons, terminals, hangars, shelters, fuel, tower, fire station and radar are separate parts.
   The taxi network is built from how the parts touch; aircraft move along it, so bad layouts cost time, capacity and
   money, and a strike damages exactly what it lands on. Every part and stand belongs to a zone (passenger, cargo,
   light aircraft, military); taxiways can be one-way or carry a preferred flow. */
(function (IC) {
'use strict';
const U = IC.U;
const SNAP_RWY = 0.2, SNAP_APRON = 0.16;

/* airport items the Career opens by research (logistics.js holds the research itself); elsewhere all are open */
IC.APT_TECH = { rconc: 'p_rconc', hydrant: 'p_hydrant', gradar: 'p_gradar', bridge: 'p_bridge', ils3: 'p_ils3' };
IC.aptTechOk = (S, item) => !S || !S.story || !IC.APT_TECH[item] || !IC.hasTech || IC.hasTech(S, IC.APT_TECH[item]);
/* why a part (in a pavement) cannot be built yet: '' or "Needs research: …" */
IC.aptLockWhy = function (S, kind, mat) {
  const k = mat === 'rconc' && IC.PAVED && IC.PAVED[kind] ? 'rconc' : kind;
  if (IC.aptTechOk(S, k)) return '';
  const t = IC.TECH && IC.TECH.find(x => x.id === IC.APT_TECH[k]);
  return `Needs research: ${t ? t.name.toLowerCase() : k} (Research room).`;
};
/* service pads: aircraft taxi onto them to be de-iced or refuelled, like into a hangar (airport-life parts) */
IC.APART.deice = { name: 'De-icing pad', w: 0.9, h: 0.7, cost: 30, build: 900, hp: 30, pad: true, desc: 'A pad by the runway where aircraft are sprayed before take-off on frosty mornings. Without one they are de-iced at the stand, which takes longer.' };
IC.APART.fuelpad = { name: 'Fuel stand', w: 0.5, h: 0.4, cost: 12, build: 500, hp: 20, pad: true, desc: 'A paved stand by the fuel farm: small aircraft and those on remote stands taxi here to refuel instead of waiting for a truck.' };
/* a holding bay: a slab beside a runway end, on which departures wait on separate painted tracks, each with its own
   holding position, so one that is ready passes one still waiting for its release (builder.js lays it out) */
IC.APART.holdbay = { name: 'Holding bay', area: true, cost: 12, build: 150, hp: 60, over: true, desc: 'A slab of concrete beside a runway end with two to four painted tracks onto the runway, each with its own holding position. A departure still waiting for its release waits on one; one that is ready taxis past it on another.' };
/* ground surfaces the player paints: for looks, and for cheap areas like car parks; aircraft never use them */
IC.APART.surface = { name: 'Surface', area: true, cost: 1, build: 60, hp: 30, desc: 'Paint the ground: grass, gravel, concrete, asphalt or landscaping. Asphalt outside the airfield is a car park. Aircraft do not use it.' };
IC.SURF = { grass: { name: 'Grass', k: 0.5 }, gravel: { name: 'Gravel', k: 1.5 }, green: { name: 'Landscaping', k: 3 }, asph: { name: 'Asphalt', k: 4, park: 350 }, conc: { name: 'Concrete', k: 6 } };
if (!IC.APART_ORDER.includes('surface')) IC.APART_ORDER.push('surface');
if (!IC.APART_ORDER.includes('deice')) IC.APART_ORDER.splice(IC.APART_ORDER.indexOf('hydrant') + 1, 0, 'fuelpad', 'deice');
if (!IC.APART_ORDER.includes('skybridge')) IC.APART_ORDER.splice(IC.APART_ORDER.indexOf('cargo') + 1, 0, 'skybridge', 'people');
/* parts aircraft taxi into through a door: shelters, hangars and service pads */
const DOOR = k => k === 'hangar' || k === 'has' || k === 'alert' || !!(IC.APART[k] && IC.APART[k].pad);
IC.aptDoor = DOOR;

/* ---------- geometry ---------- */
const rwLen = rw => U.dist(rw.a, rw.b);
const rwDir = rw => { const L = rwLen(rw) || 1; return { x: (rw.b.x - rw.a.x) / L, y: (rw.b.y - rw.a.y) / L }; };
const rwT = (rw, p) => { const d = rwDir(rw), L = rwLen(rw); return ((p.x - rw.a.x) * d.x + (p.y - rw.a.y) * d.y) / L; };
const rwAt = (rw, t) => ({ x: rw.a.x + (rw.b.x - rw.a.x) * t, y: rw.a.y + (rw.b.y - rw.a.y) * t });
const rwOff = (rw, p) => { const d = rwDir(rw); return (p.x - rw.a.x) * -d.y + (p.y - rw.a.y) * d.x; };
IC.rwLen = rwLen; IC.rwAt = rwAt; IC.rwT = rwT; IC.rwDir = rwDir;
function toLocal(r, p) { const c = Math.cos(-r.a), s = Math.sin(-r.a), dx = p.x - r.x, dy = p.y - r.y; return { x: dx * c - dy * s, y: dx * s + dy * c }; }
function toWorld(r, lx, ly) { const c = Math.cos(r.a), s = Math.sin(r.a); return { x: r.x + lx * c - ly * s, y: r.y + lx * s + ly * c }; }
IC.rectLocal = toLocal; IC.rectWorld = toWorld;
function rectDist(r, p) { const l = toLocal(r, p), dx = Math.max(0, Math.abs(l.x) - r.w / 2), dy = Math.max(0, Math.abs(l.y) - r.h / 2); return Math.hypot(dx, dy); }
function partDist(ap, part, p) {
  if (part.kind === 'runway') { const t = U.clamp(rwT(part, p), 0, 1); return Math.max(0, U.dist(rwAt(part, t), p) - part.w / 2); }
  if (part.kind === 'taxi') { let m = 1e9; for (let i = 1; i < part.nodes.length; i++) { const a = ap.nodes[part.nodes[i - 1]], b = ap.nodes[part.nodes[i]]; m = Math.min(m, U.segDist(p.x, p.y, a.x, a.y, b.x, b.y)); } return Math.max(0, m - part.w / 2); }
  if (part.r) return Math.max(0, U.dist(part, p) - part.r);
  // (a part drawn as any outline: by its shape)
  if (part.poly) return IC.shapeDist(IC.partShape(ap, part), p);
  return rectDist(part, p);
}
IC.partDist = partDist;
/* the gap between two rotated rectangles (0 when they touch or overlap): the nearest corner of one to the other */
function rectGap(A, B) {
  if (A.poly || B.poly) { const a = IC.partShape(null, A), b = IC.partShape(null, B); if (IC.shapeDepth(a, b) > 0) return 0; let m = 1e9; for (const c of a.poly) m = Math.min(m, IC.shapeDist(b, c)); for (const c of b.poly) m = Math.min(m, IC.shapeDist(a, c)); return m; }
  if (rectsOverlap(A, B, 0)) return 0;
  const cs = R => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toWorld(R, sx * R.w / 2, sy * R.h / 2));
  let m = 1e9;
  for (const c of cs(A)) m = Math.min(m, rectDist(B, c));
  for (const c of cs(B)) m = Math.min(m, rectDist(A, c));
  return m;
}
IC.rectGap = rectGap;
IC.partAt = function (ap, p, pad) { let best = null, bd = pad || 0.05; for (const q of ap.parts) { const d = partDist(ap, q, p); if (d < bd) { bd = d; best = q; } } return best; };
/* the fuel farm, fire station and tower inside their footprints, in the part's own frame (x along w, y along h),
   for the map and the 3D view alike. front: the side (±1 in y) that faces the pavement, where its road leaves */
const frontOf = p => { if (p.link && p.link[0]) { const l = toLocal({ x: p.x, y: p.y, a: p.a || 0 }, p.link[0]); if (Math.abs(l.y) > 1e-3) return Math.sign(l.y); } return -1; };
IC.bldLayout = function (p) {
  const w = p.w || 0.3, h = p.h || 0.3, f = frontOf(p);
  if (p.kind === 'fuel') {
    // the tanks in a row inside their bund, the loading rack and the lorry park at the end nearest the road
    const n = IC.fuelTanks(p), bx1 = w / 2 - Math.min(0.4, w * 0.27), r = Math.min(0.15, (bx1 + w / 2 - 0.08) / n / 2 - 0.02, h * 0.3);
    const tanks = []; for (let i = 0; i < n; i++) tanks.push({ x: -w / 2 + 0.04 + (bx1 + w / 2 - 0.08) * (i + 0.5) / n, y: -f * h * 0.08, r });
    return { f, tanks, bund: { x0: -w / 2 + 0.02, y0: -h / 2 + 0.02, x1: bx1, y1: h / 2 - 0.02 },
      rack: { x: (bx1 + w / 2) / 2, y: f * h * 0.25, w: w / 2 - bx1 - 0.06, h: h * 0.3 }, park: { x: (bx1 + w / 2) / 2, y: -f * h * 0.2, w: w / 2 - bx1 - 0.06, h: h * 0.4 } };
  }
  if (p.kind === 'fire') {
    // the hall of bays at the back, its apron in front to the road, the training ground at one end
    const gw = Math.min(0.35, w * 0.35), hw = w - gw, bays = IC.APART.fire.bays || 4;
    return { f, bays, hall: { x: -w / 2 + hw / 2, y: -f * h * 0.22, w: hw - 0.04, h: h * 0.5 }, apron: { x: -w / 2 + hw / 2, y: f * h * 0.28, w: hw - 0.04, h: h * 0.42 }, ground: { x: w / 2 - gw / 2, y: 0, w: gw - 0.02, h: h - 0.04 } };
  }
  if (p.kind === 'tower') { const s = Math.min(w, h); return { f, ht: IC.bldHeight ? IC.bldHeight(p) : 60, base: { w: w * 0.9, h: h * 0.9 }, shaft: s * 0.16, cab: s * 0.36 }; }
  return null;
};

/* ---------- the model ---------- */
IC.initAirport = function (ap) {
  ap.parts = []; ap.nodes = {}; ap.nodeN = 0; ap.partN = 0; ap.works = []; ap.crews = ap.kind === 'airbase' ? 2 : 1; ap.autoRepair = true;
  ap.moves = []; ap.st = {}; ap.dirty = true; ap.feeLevel = 1; ap.curfew = true; ap.rl = {}; ap.kpi = { taxi: 0, wait: 0, n: 0, grid: 0, div: 0, hold: 0, back: 0 };
  ap.gver = 0; ap.cfg = null; ap.res = null; ap.eo = null; ap.rwMode = ap.rwMode || 'auto';
  ap.radius = 20; ap.buildR = 65;
};
IC.aptNode = function (ap, x, y) { const id = ap.id + 'n' + (ap.nodeN++); ap.nodes[id] = { id, x, y, on: null }; resolveNode(ap, ap.nodes[id]); return id; };
function resolveNode(ap, n) {
  n.on = null;
  for (const p of ap.parts) {
    if (p.kind === 'runway') { const t = rwT(p, n), off = Math.abs(rwOff(p, n)); if (t >= -0.01 && t <= 1.01 && off < SNAP_RWY) { n.on = { kind: 'rwy', part: p.id, t: U.clamp(t, 0, 1) }; return; } }
  }
  // (a node on the edges of two aprons facing each other across a taxiway joins both: also lists the others)
  n.also = null;
  for (const p of ap.parts) {
    if ((p.kind === 'apron' || p.kind === 'alert') && onApron(p, n)) { if (!n.on) n.on = { kind: 'apron', part: p.id }; else (n.also = n.also || []).push(p.id); }
  }
}
/* a node joins this apron: it is on it, or on its edge as well as another's */
const onAp = (n, id) => !!n.on && (n.on.part === id || (!!n.also && n.also.includes(id)));
IC.resolveNodes = ap => { for (const n of Object.values(ap.nodes)) resolveNode(ap, n); };
/* a new runway or apron only changes the nodes it touches (a runway wins over an apron) */
function onRunway(p, n) { const t = rwT(p, n), off = Math.abs(rwOff(p, n)); return t >= -0.01 && t <= 1.01 && off < SNAP_RWY ? { kind: 'rwy', part: p.id, t: U.clamp(t, 0, 1) } : null; }
function onApron(p, n) {
  // an outline: on its edge, inside or just outside it
  if (p.poly) {
    if (U.dxy(p.x, p.y, n.x, n.y) > Math.max(p.w, p.h) / 2 + SNAP_APRON) return null;
    const P = IC.partShape(null, p).poly;
    if (IC.polyEdgeDist(P, n) < SNAP_APRON) return { kind: 'apron', part: p.id };
    // (a taxilane's node well inside the apron: stands lead in from it)
    return U.inPoly(n.x, n.y, P.map(v => [v.x, v.y])) ? { kind: 'apron', part: p.id, inside: true } : null;
  }
  const l = toLocal(p, n); return Math.abs(l.x) <= p.w / 2 + SNAP_APRON && Math.abs(l.y) <= p.h / 2 + SNAP_APRON && (Math.abs(Math.abs(l.x) - p.w / 2) < SNAP_APRON || Math.abs(Math.abs(l.y) - p.h / 2) < SNAP_APRON) ? { kind: 'apron', part: p.id } : null; }
function resolveFor(ap, p) {
  for (const n of Object.values(ap.nodes)) {
    if (p.kind === 'runway') { if (n.on && n.on.kind === 'rwy') continue; const o = onRunway(p, n); if (o) n.on = o; }
    else if (!n.on) n.on = onApron(p, n);
    else if (n.on.kind === 'apron' && n.on.part !== p.id && !(n.also && n.also.includes(p.id)) && onApron(p, n)) (n.also = n.also || []).push(p.id);
  }
}
IC.aptAddPart = function (ap, part, built) {
  const D = IC.APART[part.kind];
  part.id = ap.id + 'p' + (ap.partN++);
  // (a round part, a real airport's fuel tank, keeps its radius and no rectangle)
  if (part.r == null) { part.w = part.w != null ? part.w : D.w; if (part.kind !== 'taxi' && part.kind !== 'runway' && !D.area && D.h) part.h = part.h != null ? part.h : D.h; }
  if (D.r && part.r == null && part.w == null) part.r = D.r;
  part.max = D.hp; part.hp = D.hp;
  part.built = !!built; part.prog = built ? 1 : 0;
  if (part.kind === 'runway') part.craters = part.craters || [];
  if (part.kind === 'taxi') part.cut = part.cut || {};
  if (part.kind === 'fuel') part.stock = built ? IC.fuelCap(part) * 0.8 : 0;
  if (part.kind === 'ils') placeILS(ap, part);
  ap.parts.push(part);
  if (part.kind === 'runway' || part.kind === 'apron' || part.kind === 'alert') resolveFor(ap, part);
  ap.dirty = true;
  return part;
};
/* a landing system sits beyond the far end of the runway it serves, on the centreline */
function placeILS(ap, part) {
  const rw = ap.parts.find(p => p.id === part.rw); if (!rw) return;
  const d = rwDir(rw), far = part.end === 'a' ? rw.b : rw.a, s = part.end === 'a' ? 1 : -1;
  part.x = far.x + d.x * s * 3; part.y = far.y + d.y * s * 3; part.a = Math.atan2(d.y, d.x) + Math.PI / 2;
}
/* how big a part is, for costs and build time */
IC.partMeasure = function (ap, p) {
  const D = IC.APART[p.kind];
  if (p.kind === 'runway') return rwLen(p);
  if (p.kind === 'taxi' || p.kind === 'people') { const pts = p.nodes ? p.nodes.map(id => ap.nodes[id]) : p.pts; let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); return L; }
  if (D.area) return p.poly ? IC.partArea(p) : p.w * p.h;
  return 1;
};
/* paved parts cost and take as long as their material says (concrete is the price list) */
const paveK = (p, k) => IC.PAVED && IC.PAVED[p.kind] ? IC.PAVE[IC.paveOf(p)][k] : 1;
/* runways and taxiways cost by their width (against the standard one), and a tenth less without edge lights */
const lineK = p => (p.kind === 'runway' || p.kind === 'taxi') ? (p.w || IC.APART[p.kind].w) / IC.APART[p.kind].w * (p.lit === false ? 0.9 : 1) : 1;
IC.partCost = (ap, p) => IC.APART[p.kind].cost * IC.partMeasure(ap, p) * paveK(p, 'cost') * lineK(p) * (p.kind === 'surface' ? (IC.SURF[p.surf] || IC.SURF.grass).k : 1);
IC.partBuildTime = (ap, p) => IC.APART[p.kind].build * Math.max(0.5, IC.partMeasure(ap, p)) * paveK(p, 'build');

/* stands laid out along an apron's back edge; the back is the side facing a terminal, or away from the taxiways */
function standsFor(ap, p) {
  // stands placed by hand: any size, turned any way, nose-in (pushed back by a tug) or drive-through; a stand whose
  // nose reaches a terminal is a gate, one whose nose reaches a cargo shed a cargo stand
  if (p.ramp) return (p.free || []).map((f, i) => {
    const S0 = IC.STAND[f.size], a = p.a + (f.rot || 0), hx = Math.cos(a), hy = Math.sin(a), c = toWorld(p, f.lx, f.ly), back = S0.d / 2 + 0.06;
    const id = p.id + 's' + (f.k != null ? f.k : i), old = p.stands && p.stands.find(x => x.id === id);
    const nose = { x: c.x + hx * (S0.d / 2 + 0.04), y: c.y + hy * (S0.d / 2 + 0.04) };
    // (a stand the data marks as a gate has its jet bridge: the terminal may be a bridge's length away)
    let term = null, td = f.gate ? 0.8 : 0.12;
    for (const q of ap.parts) { if ((q.kind !== 'terminal' && q.kind !== 'cargo') || !q.built) continue; const d = partDist(ap, q, nose); if (d < td) { td = d; term = q; } }
    return { id, x: c.x, y: c.y, fx: c.x - hx * back, fy: c.y - hy * back, ox: c.x + hx * back, oy: c.y + hy * back, a, size: f.size, apron: p.id,
      contact: !!(term && term.kind === 'terminal'), cargo: !!(term && term.kind === 'cargo'), drive: !!f.drive, hp: old ? old.hp : 1, occ: old ? old.occ : null, ramp: true, zoneOwn: f.zone, via: f.via || null, name: f.name || null };
  });
  if (p.poly) return polyStands(ap, p);
  const depth = p.h * 0.64;
  const size = IC.apronStandSize(p);
  if (!size) return [];
  const S = IC.STAND[size], n = Math.floor(p.w / S.w);
  let back = 1;
  const term = ap.parts.find(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.built && rectGap(q, p) < 0.3);
  if (term) back = toLocal(p, term).y >= 0 ? 1 : -1;
  else { const at = Object.values(ap.nodes).filter(nd => onAp(nd, p.id)); if (at.length) back = at.reduce((s, nd) => s + toLocal(p, nd).y, 0) > 0 ? -1 : 1; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const lx = -p.w / 2 + S.w * (i + 0.5), ly = back * (p.h / 2 - S.d / 2);
    const c = toWorld(p, lx, ly), f = toWorld(p, lx, back * (p.h / 2 - S.d - 0.08));
    // a gate only where the terminal is right behind the stand (an apron may run on past the building's end)
    const contact = !!(term && term.kind === 'terminal' && rectDist(term, toWorld(p, lx, back * (p.h / 2 + 0.02))) < 0.4);
    const old = p.stands && p.stands.find(x => x.id === p.id + 's' + i);
    out.push({ id: p.id + 's' + i, x: c.x, y: c.y, fx: f.x, fy: f.y, a: p.a + (back > 0 ? Math.PI / 2 : -Math.PI / 2), size, apron: p.id, contact, hp: old ? old.hp : 1, occ: old ? old.occ : null, cargo: term && term.kind === 'cargo' });
  }
  return out;
}

/* stands along the edges of an apron drawn as an outline: every edge that a terminal or cargo shed stands behind gets
   a row, noses to the building, as big as fit inside the outline (up to the apron's largest size) */
function polyStands(ap, p) {
  const sh = IC.partShape(ap, p), P = sh.poly, out = [], inside = q => U.inPoly(q.x, q.y, P.map(v => [v.x, v.y]));
  const ccw = IC.polyArea ? P.reduce((s, v, i) => { const w = P[(i + 1) % P.length]; return s + (v.x * w.y - w.x * v.y); }, 0) > 0 : true;
  const sizes = ['l', 'm', 's'].filter(k => !p.smax || 'sml'.indexOf(k) <= 'sml'.indexOf(p.smax));
  let k = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = U.dist(a, b); if (L < IC.STAND.s.w) continue;
    const ex = (b.x - a.x) / L, ey = (b.y - a.y) / L, nx = ccw ? ey : -ey, ny = ccw ? -ex : ex;   // (n: outward)
    const mid = { x: (a.x + b.x) / 2 + nx * 0.05, y: (a.y + b.y) / 2 + ny * 0.05 };
    const term = ap.parts.find(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.built && partDist(ap, q, mid) < 0.3);
    if (!term) continue;
    const size = sizes.find(z => { const S0 = IC.STAND[z], c = { x: mid.x - nx * (S0.d + 0.1), y: mid.y - ny * (S0.d + 0.1) }; return inside(c); });
    if (!size) continue;
    const S0 = IC.STAND[size], n = Math.floor(L / S0.w);
    for (let j = 0; j < n; j++) {
      const t = (L - n * S0.w) / 2 + S0.w * (j + 0.5), e = { x: a.x + ex * t, y: a.y + ey * t };
      const c = { x: e.x - nx * S0.d / 2, y: e.y - ny * S0.d / 2 }, f = { x: e.x - nx * (S0.d + 0.08), y: e.y - ny * (S0.d + 0.08) };
      if (!inside(c) || !inside(f)) continue;
      const id = p.id + 's' + (k++), old = p.stands && p.stands.find(x => x.id === id);
      const contact = term.kind === 'terminal' && partDist(ap, term, { x: e.x + nx * 0.02, y: e.y + ny * 0.02 }) < 0.4;
      out.push({ id, x: c.x, y: c.y, fx: f.x, fy: f.y, a: Math.atan2(ny, nx), size, apron: p.id, contact, hp: old ? old.hp : 1, occ: old ? old.occ : null, cargo: term.kind === 'cargo' });
    }
  }
  return out;
}

/* A stand's jet bridge, in world points: from the wall of a terminal or pier (w), by a fixed link where the wall is
   set back, to the rotunda (r) on its column, and the telescopic tunnel to the cab at the front door (d). null when
   no wall is near enough in front of the aircraft's nose: that stand is remote, with stairs, whatever it touches. */
IC.BRIDGE_REACH = { link: 0.3, tunnel: 0.42 };
IC.standBridge = function (ap, s) {
  const S0 = IC.STAND[s.size] || IC.STAND.m, c = Math.cos(s.a), sn = Math.sin(s.a);
  const W = (lx, ly) => ({ x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c });
  const door = W(S0.d * 0.26, -0.034), Q = W(S0.d / 2 + 0.05, -S0.w * 0.16);
  let best = null, bd = 1e9;
  for (const q of ap.parts) {
    if (q.kind !== 'terminal' || !q.built || q.x == null) continue;
    if (U.dist(q, Q) > Math.max(q.w || 0, q.h || 0, (q.r || 0) * 2) + 2) continue;
    const P = IC.partOutline(q);
    for (let i = 0; i < P.length; i++) {
      const A = P[i], B = P[(i + 1) % P.length], L = U.dist(A, B) || 1e-9, t = U.clamp(((Q.x - A.x) * (B.x - A.x) + (Q.y - A.y) * (B.y - A.y)) / (L * L), 0, 1);
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, d = U.dxy(x, y, Q.x, Q.y);
      if (d < bd) { bd = d; best = { x, y, q }; }
    }
  }
  if (!best || bd > IC.BRIDGE_REACH.link + 0.05) return null;
  // (the wall must be ahead of the nose, not beside the wing)
  if ((best.x - s.x) * c + (best.y - s.y) * sn < S0.d * 0.3) return null;
  const out = bd > 1e-4 ? { x: (Q.x - best.x) / bd, y: (Q.y - best.y) / bd } : { x: -c, y: -sn };
  const r = bd < 0.08 ? { x: best.x + out.x * 0.025, y: best.y + out.y * 0.025 } : Q;
  if (U.dist(r, door) > IC.BRIDGE_REACH.tunnel) return null;
  return { wx: best.x, wy: best.y, rx: r.x, ry: r.y, dx: door.x, dy: door.y, link: bd >= 0.08, term: best.q.id };
};

/* ---------- runway names and groups ---------- */
/* the designator of a runway end: the landing heading in tens of degrees, with L, C or R for parallels */
IC.rwEnd = (rw, dir) => (rw.ends ? rw.ends[dir > 0 ? 'a' : 'b'] : '') || (dir > 0 ? 'A' : 'B');
// (as on a chart: the lower number first, "Runway 08/26")
const rwName = rw => `Runway ${parseInt(rw.ends.a) <= parseInt(rw.ends.b) ? `${rw.ends.a}/${rw.ends.b}` : `${rw.ends.b}/${rw.ends.a}`}`;
function nameRunways(ap) {
  // (runways laid out from real data keep their real names: airports-real.js)
  const rws = ap.parts.filter(p => p.kind === 'runway' && !p.real);
  const num = (rw, dir) => { const d = rwDir(rw), n = Math.round(IC.bearing(Math.atan2(d.y * dir, d.x * dir)) / 10) || 36; return String(n > 36 ? n - 36 : n).padStart(2, '0'); };
  for (const rw of rws) rw.ends = { a: num(rw, 1), b: num(rw, -1) };
  // more than three parallels: the right-hand half take the next number, as at Denver (16/34 and 17/35)
  const lat = (rw, dir) => { const d = rwDir(rw), c = rwAt(rw, 0.5); return c.x * d.y * dir - c.y * d.x * dir; };
  const same = {};
  for (const rw of rws) (same[rw.ends.a] = same[rw.ends.a] || []).push(rw);
  for (const k in same) {
    const L = same[k]; if (L.length < 4) continue;
    L.sort((p, q) => lat(q, 1) - lat(p, 1));
    const bump = n => String((+n % 36) + 1).padStart(2, '0');
    for (const rw of L.slice(Math.ceil(L.length / 2))) rw.ends = { a: bump(rw.ends.a), b: bump(rw.ends.b) };
  }
  // parallels share a number: left, centre and right as seen when landing
  for (const e of ['a', 'b']) {
    const byNum = {};
    for (const rw of rws) (byNum[rw.ends[e]] = byNum[rw.ends[e]] || []).push(rw);
    for (const k in byNum) {
      const L = byNum[k]; if (L.length < 2) continue;
      const r0 = L[0], d = rwDir(r0), dir = e === 'a' ? 1 : -1, lx = d.y * dir, ly = -d.x * dir;
      L.sort((p, q) => { const cp = rwAt(p, 0.5), cq = rwAt(q, 0.5); return (cq.x * lx + cq.y * ly) - (cp.x * lx + cp.y * ly); });
      const suf = L.length === 2 ? ['L', 'R'] : L.length === 3 ? ['L', 'C', 'R'] : L.map((_, i) => 'LCR'[Math.min(2, i)]);
      L.forEach((rw, i) => { rw.ends[e] = k + suf[i]; });
    }
  }
  for (const rw of rws) if (!rw.custom) rw.name = rwName(rw);
  // (work already queued on a runway goes by its new name)
  for (const w of ap.works || []) if (w.kind === 'build' && w.part && w.part.kind === 'runway') w.label = `Build ${w.part.name}`;
}
IC.aptNameRunways = nameRunways;
/* runways that cannot be used independently: they cross, or they are parallel and closer than 760 m (a close pair
   is not cleared as one: the configuration lands on one and departs on the other, as Los Angeles does) */
IC.RWY_INDEP = 7.6;
function segX(a, b, c, d) { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); }
IC.rwDependent = function (p, q) {
  if (segX(p.a, p.b, q.a, q.b)) return 'cross';
  const dp = rwDir(p), dq = rwDir(q), par = Math.abs(dp.x * dq.y - dp.y * dq.x) < 0.17;
  if (par) {
    const lat = Math.abs(rwOff(p, rwAt(q, 0.5))), t0 = rwT(p, q.a), t1 = rwT(p, q.b);
    if (lat < IC.RWY_INDEP && Math.max(t0, t1) > -0.2 && Math.min(t0, t1) < 1.2) return 'close';
    return '';
  }
  // runways that meet end to end, or nearly touch, are also used together
  const near = Math.min(U.segDist(q.a.x, q.a.y, p.a.x, p.a.y, p.b.x, p.b.y), U.segDist(q.b.x, q.b.y, p.a.x, p.a.y, p.b.x, p.b.y), U.segDist(p.a.x, p.a.y, q.a.x, q.a.y, q.b.x, q.b.y), U.segDist(p.b.x, p.b.y, q.a.x, q.a.y, q.b.x, q.b.y));
  return near < 3 ? 'cross' : '';
};

/* ---------- the taxi network ---------- */
/* zone of a part: set by the player, or taken from what it serves */
IC.partZone = function (ap, p) {
  if (p.zone) return p.zone;
  if (ap.kind === 'airbase') return 'mil';
  if (IC.APART[p.kind] && IC.APART[p.kind].mil) return 'mil';
  if (p.kind === 'cargo') return 'cargo';
  if (p.kind === 'apron') {
    const near = ap.parts.filter(q => (q.kind === 'terminal' || q.kind === 'cargo' || q.kind === 'has') && q.w && rectGap(q, p) < 0.3);
    if (near.some(q => q.kind === 'cargo')) return 'cargo';
    if (near.some(q => q.kind === 'has')) return 'mil';
  }
  return 'civil';
};
IC.aptSetZone = function (S, ap, part, zone) { if (!IC.ZONES[zone]) return false; part.zone = zone; ap.dirty = true; IC.aptStats(S, ap); return true; };
/* one-way (dir 1 follows the drawn order, -1 the reverse) and a preferred flow that aircraft follow when they can */
IC.aptSetTaxiDir = function (S, ap, part, oneway, flow) { part.oneway = oneway || 0; part.flow = flow != null ? flow : part.flow || 0; ap.dirty = true; IC.aptStats(S, ap); return true; };
// (asked a thousand times a step at a busy airport: the check is kept apart from the build, whose closures would
// otherwise allocate a context on every call)
IC.aptGraph = ap => !ap.dirty && ap.G ? ap.G : buildGraph(ap);
function buildGraph(ap) {
  const N = new Map(), adj = new Map(), radj = new Map();
  // (i: the node's place in N, which route searches index their arrays by)
  const node = (id, x, y, kind, ref, rw) => { if (!N.has(id)) { N.set(id, { id, x, y, kind, ref, rw: rw || null, i: N.size }); adj.set(id, []); radj.set(id, []); } return N.get(id); };
  // one: the edge runs only from a to b; flow: +1 a to b is preferred, -1 the reverse
  const edge = (a, b, kind, part, seg, spd, one, flow) => {
    const A = N.get(a), B = N.get(b); if (!A || !B || a === b) return;
    const len = Math.max(0.01, U.dist(A, B)), w = len * (kind === 'apron' ? 1.2 : 1), key = (a < b ? a + '|' + b : b + '|' + a);
    const ab = { from: a, to: b, len, w: w * (flow > 0 ? 0.85 : flow < 0 ? 1.6 : 1), kind, part, seg, spd, key, d: a < b ? 1 : -1, clear: 0, fi: A.i, ti: B.i };
    const ba = { from: b, to: a, len, w: w * (flow < 0 ? 0.85 : flow > 0 ? 1.6 : 1), kind, part, seg, spd, key, d: b < a ? 1 : -1, clear: 0, fi: B.i, ti: A.i };
    if (one >= 0) { adj.get(a).push(ab); radj.get(b).push(ab); }
    if (one <= 0) { adj.get(b).push(ba); radj.get(a).push(ba); }
  };
  nameRunways(ap);
  const onPart = new Map();
  for (const n of Object.values(ap.nodes)) {
    node(n.id, n.x, n.y, 'taxi', n, n.on && n.on.kind === 'rwy' ? n.on.part : null);
    if (n.on) { if (!onPart.has(n.on.part)) onPart.set(n.on.part, []); onPart.get(n.on.part).push(n); }
    if (n.also) for (const id of n.also) { if (!onPart.has(id)) onPart.set(id, []); onPart.get(id).push(n); }
  }
  const parts = ap.parts.filter(p => p.built && !(p.shut && p.kind !== 'runway'));
  const rwn = new Map();
  // passenger bridges over taxiways: the edges under them carry the height a tail must clear (m)
  const spans = ap.parts.filter(p => p.kind === 'skybridge' && p.clear).map(p => ({ p, sh: IC.partShape(ap, p) }));
  const under = (a, b) => { let c = 0; for (const x of spans) if (IC.shapeDepth(x.sh, IC.shapeLine([a, b], 0.05)) > 0) c = c ? Math.min(c, x.p.clear) : x.p.clear; return c; };
  for (const p of parts) {
    if (p.kind === 'taxi') for (let i = 1; i < p.nodes.length; i++) {
      if (p.cut[i]) continue;
      edge(p.nodes[i - 1], p.nodes[i], 'taxi', p.id, i, IC.GOPS.TAXI, p.oneway || 0, p.flow || 0);
      const c = spans.length ? under(ap.nodes[p.nodes[i - 1]], ap.nodes[p.nodes[i]]) : 0;
      if (c) for (const e of adj.get(p.nodes[i - 1]).concat(adj.get(p.nodes[i]))) if (e.part === p.id && e.seg === i) e.clear = c;
    }
    else if (p.kind === 'runway') {
      node(p.id + ':a', p.a.x, p.a.y, 'rwyEnd', { part: p.id, t: 0 }, p.id); node(p.id + ':b', p.b.x, p.b.y, 'rwyEnd', { part: p.id, t: 1 }, p.id);
      const on = [{ id: p.id + ':a', t: 0 }, { id: p.id + ':b', t: 1 }].concat((onPart.get(p.id) || []).map(n => ({ id: n.id, t: n.on.t })));
      on.sort((x, y) => x.t - y.t);
      for (let i = 1; i < on.length; i++) {
        const t0 = on[i - 1].t, t1 = on[i].t;
        if (t1 - t0 < 1e-4) { edge(on[i - 1].id, on[i].id, 'rwy', p.id, 0, IC.GOPS.RWTAXI, 0, 0); continue; }
        if (p.craters.some(c => c.t > t0 - c.r / rwLen(p) && c.t < t1 + c.r / rwLen(p))) continue;
        edge(on[i - 1].id, on[i].id, 'rwy', p.id, 0, IC.GOPS.RWTAXI, 0, 0);
      }
      rwn.set(p.id, on);
    }
  }
  // aprons that touch are one paved area: aircraft cross from one to the other, so a stand is reached from wherever
  // a taxiway meets any of them
  const aprons = parts.filter(p => p.kind === 'apron'), gi = new Map(aprons.map((p, i) => [p, i]));
  const up = aprons.map((_, i) => i), root = i => up[i] === i ? i : (up[i] = root(up[i]));
  for (let i = 0; i < aprons.length; i++) for (let j = i + 1; j < aprons.length; j++) if (U.dist(aprons[i], aprons[j]) < (Math.max(aprons[i].w, aprons[i].h) + Math.max(aprons[j].w, aprons[j].h)) / 2 + 0.1 && rectGap(aprons[i], aprons[j]) < 0.05) up[root(i)] = root(j);
  const groupAt = new Map();
  for (const p of aprons) { const r = root(gi.get(p)); if (!groupAt.has(r)) groupAt.set(r, []); for (const n of onPart.get(p.id) || []) if (n.on.kind === 'apron') groupAt.get(r).push(n); }
  for (const p of aprons) {
    p.stands = standsFor(ap, p);
    // a gate only where its bridge reaches a wall: the rest are remote stands with stairs, and say why
    for (const s of p.stands) { const want = s.contact; s.bridge = want ? IC.standBridge(ap, s) : null; s.contact = !!s.bridge; s.noBridge = want && !s.bridge; }
    const z = IC.partZone(ap, p);
    const hyd = parts.some(h => h.kind === 'hydrant' && h.hp > h.max * 0.25 && U.dist(h, p) < IC.APART.hydrant.reach);
    const at = groupAt.get(root(gi.get(p)));
    for (const s of p.stands) {
      s.zone = s.zoneOwn || z; s.hyd = hyd; node(s.id, s.fx, s.fy, 'stand', s);
      // (an outline apron, or a stand with its own lead-in: from the nearest nodes only, as a lead-in line runs)
      const lead = s.via && N.has(s.via) ? [N.get(s.via)] : p.poly ? at.slice().sort((u, v) => U.dxy(u.x, u.y, s.fx, s.fy) - U.dxy(v.x, v.y, s.fx, s.fy)).slice(0, 2) : at;
      for (const a of lead) edge(s.id, a.id, 'apron', p.id, 0, 0.04, 0, 0);
      // a drive-through stand is left by its nose: no tug, no pushback
      if (s.drive) { node(s.id + 'o', s.ox, s.oy, 'standOut', s); edge(s.id, s.id + 'o', 'apron', p.id, 0, 0.04, 1, 0); for (const a of at) edge(s.id + 'o', a.id, 'apron', p.id, 0, 0.04, 1, 0); }
    }
  }
  // across the apron between its edge nodes (a taxilane's nodes inside it are joined by the taxilane)
  for (const at of groupAt.values()) { const E = at.filter(n => !n.on.inside); for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) edge(E[i].id, E[j].id, 'apron', E[i].on.part, 0, 0.05, 0, 0); }
  // shelters join the network through the nearest taxi point in front of their doors
  const allN = Object.values(ap.nodes);
  for (const p of parts) {
    if (!DOOR(p.kind)) continue;
    if (!p.door) {
      // the doors face whichever side has taxiway nearby
      const sides = [toWorld(p, 0, -p.h / 2 - 0.05), toWorld(p, 0, p.h / 2 + 0.05)];
      const near = q => { let m = 1e9; for (const n of allN) m = Math.min(m, U.dist(n, q)); return m; };
      p.door = near(sides[0]) <= near(sides[1]) ? sides[0] : sides[1];
      p.doorSide = p.door === sides[0] ? -1 : 1;
    }
    const nid = p.id + ':d'; node(nid, p.door.x, p.door.y, 'shelter', p);
    let best = null, bd = 0.55;
    for (const n of allN) { if (!adj.get(n.id).length && !(n.on && n.on.part === p.id)) continue; const d = U.dist(n, p.door); if (d < bd) { bd = d; best = n; } }
    if (p.kind === 'alert') for (const n of onPart.get(p.id) || []) edge(nid, n.id, 'apron', p.id, 0, 0.06, 0, 0);
    if (best) edge(nid, best.id, 'apron', p.id, 0, 0.05, 0, 0);
    // a door that opens straight onto an apron: in through the apron's taxiway joins
    else for (const a of parts) if (a.kind === 'apron' && rectDist(a, p.door) < 0.12) for (const n of onPart.get(a.id) || []) if (n.on.kind === 'apron') edge(nid, n.id, 'apron', a.id, 0, 0.05, 0, 0);
  }
  // taxiways that end in the grass, joined to nothing at their far end (brief 47: built wrong, they are allowed):
  // pruned leaf by leaf, they are no way off or onto a runway
  const nb = new Map();
  for (const [id, L] of adj) for (const e of L) if (e.kind !== 'rwy') { (nb.get(id) || nb.set(id, new Set()).get(id)).add(e.to); (nb.get(e.to) || nb.set(e.to, new Set()).get(e.to)).add(id); }
  const anchor = n => n.kind !== 'taxi' || !!n.rw || !!(n.ref && n.ref.on), dead = new Set(), leaf = [];
  for (const [id, s] of nb) if (s.size <= 1 && !anchor(N.get(id))) leaf.push(id);
  while (leaf.length) { const id = leaf.pop(); if (dead.has(id)) continue; dead.add(id); for (const o of nb.get(id)) { const s = nb.get(o); s.delete(id); if (s.size <= 1 && !dead.has(o) && !anchor(N.get(o))) leaf.push(o); } }
  // each runway's nodes in order: where aircraft can get off (exit) and on (entry)
  for (const [id, on] of rwn) {
    const L = rwLen(ap.parts.find(p => p.id === id));
    rwn.set(id, on.map(o => ({ id: o.id, t: o.t, s: o.t * L, exit: adj.get(o.id).some(e => e.kind !== 'rwy' && !dead.has(e.to)), entry: radj.get(o.id).some(e => e.kind !== 'rwy' && !dead.has(e.from)) })));
  }
  // runways that depend on each other share one clearance
  const rws = parts.filter(p => p.kind === 'runway'), grp = {};
  for (const r of rws) grp[r.id] = r.id;
  const find = id => grp[id] === id ? id : (grp[id] = find(grp[id]));
  // (close parallels keep their own clearances: one lands while the other departs, as the configuration pairs them)
  for (let i = 0; i < rws.length; i++) for (let j = i + 1; j < rws.length; j++) { const d = IC.rwDependent(rws[i], rws[j]); if (d && d !== 'close') { const a = find(rws[i].id), b = find(rws[j].id); if (a !== b) grp[a < b ? b : a] = a < b ? a : b; } }
  for (const r of rws) grp[r.id] = find(r.id);
  ap.gver = (ap.gver || 0) + 1;
  ap.G = { N, adj, radj, rwn, grp, dead, ver: ap.gver, trees: new Map(), bays: new Set(parts.filter(p => p.bay && p.built).map(p => p.id)) };
  ap.dirty = false;
  return ap.G;
}
/* ---------- route search: Dijkstra on a binary heap ---------- */
function Heap() { this.k = []; this.v = []; }
Heap.prototype.push = function (v, k) {
  const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
  while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
  K[i] = k; V[i] = v;
};
Heap.prototype.pop = function () {
  const K = this.k, V = this.v, top = V[0], tk = K[0], lk = K.pop(), lv = V.pop(), n = K.length;
  if (n) {
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; }
    K[i] = lk; V[i] = lv;
  }
  this.top = tk;
  return top;
};
/* o: { to (stop there), rev (search backwards: cost from every node to src), avoidRwy, res: { m, t0 } (wait for taxiways
   booked the other way), h(node) (a heuristic for A*), stop(u, cost, key) (true: settle nothing more, from node u on) }. Runway edges cost double (they block the runway), triple for arrivals; stepping onto a runway
   from a taxiway costs a hold. Returns { dist, prev, time }. */
/* the graph as arrays by node index, for the searches (built once per graph; a loaded game's graph gets it again) */
function gIndex(G) {
  if (G._x) return G._x;
  const n = G.N.size, ids = new Array(n), nodes = new Array(n), adj = new Array(n), radj = new Array(n), ix = new Map();
  let i = 0;
  for (const [id, nd] of G.N) { nd.i = i; ix.set(id, i); ids[i] = id; nodes[i] = nd; adj[i] = G.adj.get(id); radj[i] = G.radj.get(id); i++; }
  for (const L of adj) for (const e of L) { e.fi = ix.get(e.from); e.ti = ix.get(e.to); }
  return (G._x = { n, ids, nodes, adj, radj, ix });
}
/* a search's results by node id, read like the Maps they replace: dist (cost from the source), prev (the edge into
   each node), time (when the aircraft gets there, with reservations); an array slot holding `none` was never reached */
function ByNode(X, a, none) { this.X = X; this.a = a; this.none = none; }
ByNode.prototype.has = function (id) { const i = this.X.ix.get(id); return i !== undefined && !Object.is(this.a[i], this.none); };
ByNode.prototype.get = function (id) { return this.has(id) ? this.a[this.X.ix.get(id)] : undefined; };
IC.aptSearch = function (ap, src, o) {
  o = o || {};
  const G = IC.aptGraph(ap), X = gIndex(G), A = o.rev ? X.radj : X.adj, NA = X.nodes, n = X.n;
  // (arrays by node index: a search over a big airport's 2,500 nodes fills four arrays, not thousands of Map entries)
  const dist = new Float64Array(n).fill(Infinity), prev = new Array(n).fill(null), time = o.res ? new Float64Array(n).fill(NaN) : null, done = new Uint8Array(n);
  const out = { dist: new ByNode(X, dist, Infinity), prev: new ByNode(X, prev, null), time: time ? new ByNode(X, time, NaN) : null };
  const s = X.ix.get(src);
  if (s === undefined) return out;
  dist[s] = 0; if (time) time[s] = o.res.t0;
  // (with a goal, A*: the heap is ordered by cost so far plus the straight-line time to the goal at the fastest
  // taxi speed, times 0.85 for a taxiway's preferred flow, which never overstates it, so a big airport's search stays
  // near the line between the two)
  const goal = o.to && !o.rev ? G.N.get(o.to) : null, to = o.to != null && X.ix.has(o.to) ? X.ix.get(o.to) : -1;
  const avoid = o.avoid != null && X.ix.has(o.avoid) ? X.ix.get(o.avoid) : -1;
  if (goal && G.vmax == null) { G.vmax = 0.01; for (const L of G.adj.values()) for (const e of L) G.vmax = Math.max(G.vmax, e.spd || 0); }
  const gx = goal ? goal.x : 0, gy = goal ? goal.y : 0;
  // (o.h: a heuristic of the caller's own, by node)
  const hf = o.h || null;
  const H = new Heap(); H.push(s, goal ? U.dxy(NA[s].x, NA[s].y, gx, gy) * 0.85 / G.vmax : hf ? hf(NA[s]) : 0);
  const rwK = o.avoidRwy ? 6 : 2, ht = o.ht || (o.res && o.res.m && o.res.m.T && o.res.m.T.ht) || 0, rev = !!o.rev;
  const cfg = ap.cfg, rm = o.res ? o.res.m : null, resWait = IC.gopsResWait;
  while (H.k.length) {
    const u = H.pop();
    if (done[u]) continue;
    const du = dist[u];
    // (stop: the caller has what it needs once nodes this far out cannot matter; u is left unsettled)
    if (o.stop && o.stop(X.ids[u], du, H.top)) break;
    done[u] = 1;
    if (u === to) break;
    const L = A[u];
    for (let j = 0; j < L.length; j++) {
      const e = L[j], v = rev ? e.fi : e.ti;
      if (done[v] || v === avoid) continue;
      // (a tail too tall for the bridge over this taxiway goes round)
      if (e.clear && ht > e.clear - 1) continue;
      let w = e.w / e.spd * (e.kind === 'rwy' ? rwK : 1), tv = 0;
      // a taxiway onto a runway means a hold at the line, a long one if the runway is in use
      const B = NA[e.ti];
      if (e.kind !== 'rwy' && B.rw) { const c = cfg && cfg.rw[B.rw]; w += c && c.role !== 'spare' ? 60 : 20; }
      if (time) { const tu = time[u], wait = rm ? resWait(ap, e, tu, rm) : 0; w += wait * 1.5; tv = tu + wait + e.len / e.spd; }
      const nd = du + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = e; if (time) time[v] = tv; H.push(v, goal ? nd + U.dxy(NA[v].x, NA[v].y, gx, gy) * 0.85 / G.vmax : hf ? nd + hf(NA[v]) : nd); }
    }
  }
  return out;
};
/* the steps of the route found by a search, from src to a node */
IC.aptSteps = function (tree, src, to) {
  const out = []; let c = to;
  while (c !== src) { const e = tree.prev.get(c); if (!e) return null; out.push({ from: e.from, to: e.to, e, _g: null, _le: null, _gn: null, _A: null, _B: null }); c = e.from === c ? e.to : e.from; }
  out.reverse();
  return out;
};
/* cached route trees (without reservations) until the network changes */
IC.aptTree = function (ap, src, rev, ht) {
  const G = IC.aptGraph(ap);
  // (where a bridge spans a taxiway, the tall tails have trees of their own: 1 m of margin under the span)
  if (G.lowSpan == null) { G.lowSpan = 0; for (const L of G.adj.values()) for (const e of L) if (e.clear) G.lowSpan = G.lowSpan ? Math.min(G.lowSpan, e.clear) : e.clear; }
  const tall = G.lowSpan && ht && ht > G.lowSpan - 1 ? Math.ceil(ht) : 0, key = src + (rev ? '<' : '>') + (tall ? 'h' + tall : '');
  let t = G.trees.get(key);
  if (!t) { if (G.trees.size > 400) G.trees.clear(); t = IC.aptSearch(ap, src, { rev, avoidRwy: rev, ht: tall }); G.trees.set(key, t); }
  return t;
};
/* cheapest path in seconds; runway edges cost extra because using one blocks the runway */
IC.aptPath = function (ap, from, to, avoidRwy, ht) {
  const G = IC.aptGraph(ap);
  if (!G.N.has(from) || !G.N.has(to)) return null;
  const t = IC.aptSearch(ap, from, { to, avoidRwy, ht });
  if (!t.dist.has(to)) return null;
  return { cost: t.dist.get(to), steps: IC.aptSteps(t, from, to) };
};
/* all nodes reachable from a start (for connectivity checks), ignoring one-way rules */
function reach(ap, start, noSpan) {
  const G = IC.aptGraph(ap), seen = new Set([start]), Q = [start];
  while (Q.length) { const u = Q.pop(); for (const e of G.adj.get(u) || []) if (!seen.has(e.to) && !(noSpan && e.clear)) { seen.add(e.to); Q.push(e.to); } for (const e of G.radj.get(u) || []) if (!seen.has(e.from) && !(noSpan && e.clear)) { seen.add(e.from); Q.push(e.from); } }
  return seen;
}

/* ---------- runways: usable strips between craters ---------- */
IC.rwStrips = function (rw) {
  const L = rwLen(rw);
  const cs = rw.craters.map(c => [c.t * L - c.r, c.t * L + c.r]).sort((a, b) => a[0] - b[0]);
  const out = []; let s = 0;
  for (const [a, b] of cs) { if (a > s) out.push([s, Math.min(a, L)]); s = Math.max(s, b); }
  if (s < L) out.push([s, L]);
  return out.filter(x => x[1] - x[0] > 0.5);
};
IC.rwUsable = rw => rw.built && rw.hp > 0 && !rw.shut && !(rw.wear >= 1) ? Math.max(0, ...IC.rwStrips(rw).map(x => x[1] - x[0])) : 0;

/* spacing between runway movements: a tower and an approach radar let controllers pack them tighter. A runway the
   tower cannot see (st.unseen, by its id) is worked as if there were no tower */
IC.aptSep = (st, rwId) => (!st.tower || (rwId && st.unseen && st.unseen[rwId]) ? 480 : st.radar ? 60 : 110) * (st.lvp ? 1.6 : 1);

/* ---------- what the tower sees, and how fast the fire trucks come ---------- */
IC.TOWER_VIEW = 80;   // 8 km: beyond it controllers in the cab cannot follow aircraft on a runway
IC.FIRE_STD = 180;    // fire trucks must reach any point of a runway within 3 minutes for heavy jets to use it
const BLD_HT = { terminal: 16, cargo: 14, hangar: 20, has: 9, alert: 6, support: 9, fire: 9, atc: 12, gradar: 14, fuel: 14, ammo: 4, hydrant: 4, skybridge: 18 };
IC.bldHeight = p => p.kind === 'tower' ? p.ht || IC.APART.tower.ht : p.lvls ? p.lvls * 4.2 + 2 : BLD_HT[p.kind] || 0;
/* '' when a tower sees the whole runway (both ends and the middle), else why not, in words */
IC.towerSees = function (ap, towers, rw) {
  let why = '';
  for (const t of towers) {
    const ht = IC.bldHeight(t); let bad = '';
    for (const f of [0, 0.5, 1]) {
      const P = rwAt(rw, f), D = U.dist(t, P);
      if (D > IC.TOWER_VIEW) { bad = `its ${f === 0.5 ? 'middle' : 'end'} is ${U.km(D)} from the tower`; break; }
      for (const q of ap.parts) {
        const hb = q.built && q !== t && q.x != null ? IC.bldHeight(q) : 0; if (!hb || U.dist(t, q) > D) continue;
        // where the sight line passes the building: on it, and the roof stands above the line from the cab down
        // to the runway there (by its far side: the roof hides the ground beyond it)
        const s0 = U.clamp(((q.x - t.x) * (P.x - t.x) + (q.y - t.y) * (P.y - t.y)) / (D * D), 0, 1), c = { x: t.x + (P.x - t.x) * s0, y: t.y + (P.y - t.y) * s0 };
        if (partDist(ap, q, c) > 0.01) continue;
        const far = Math.min(D, s0 * D + Math.hypot(q.w || 0.2, q.h || 0.2) / 2);
        if (hb > ht * (1 - far / D)) { bad = `the ${U.lc(IC.APART[q.kind].name)} hides its ${f === 0.5 ? 'middle' : 'end'} from the cab`; break; }
      }
      if (bad) break;
    }
    if (!bad) return '';
    why = why || bad;
  }
  return why;
};
/* heavy jets may land on a runway only where the fire trucks reach every point of it in 3 minutes */
IC.rwFireOk = (ap, rw, T) => T.mil || T.stand !== 'l' || !ap.st || !ap.st.rescueRw || (ap.st.rescueRw[rw.id] || 0) <= IC.FIRE_STD;
/* the fire trucks drive out, lights on, to an accident or a drill: what the map draws and the panel says */
IC.fireRun = function (S, ap, at, kind) {
  const st = ap.parts.filter(f => f.kind === 'fire' && f.built && f.hp > f.max * 0.25).sort((a, b) => U.dist(a, at) - U.dist(b, at))[0];
  if (!st) return null;
  const dur = IC.fireTime(st, at);
  ap.fireRun = { kind, from: st.id, x: at.x, y: at.y, t0: S.time, dur, home: S.time + dur + (kind === 'crash' ? 3600 : 600) };
  return ap.fireRun;
};
/* what the tower, the fire stations and the fuel farm do for the airport, in numbers, one line each (the airport
   panel and the buildings' own panels) */
/* a time to the second, for the fire trucks: "2 min 40 s" */
IC.mmss = t => { t = Math.round(t); return t < 60 ? `${t} s` : `${Math.floor(t / 60)} min${t % 60 ? ` ${t % 60} s` : ''}`; };
IC.aptServiceLines = function (S, ap) {
  const st = ap.st || {}, rws = (st.rwy || []), out = {};
  const mv = (ap.mvLog || []).length, blind = rws.filter(r => st.unseen && st.unseen[r.id]);
  out.tower = !st.tower ? `No tower: one movement every ${U.dur(IC.aptSep(Object.assign({}, st, { tower: false })))} on a runway. A tower that sees the runways clears one every ${U.dur(IC.aptSep(Object.assign({}, st, { tower: true, unseen: null })))}.`
    : `Handling ${mv} movement${mv === 1 ? '' : 's'} in the last hour, one every ${U.dur(IC.aptSep(st))} on a runway (rated ${st.movesPerHour || 0} an hour).` + (blind.length ? ` It cannot see ${blind.map(r => r.name).join(', ')}: one movement every ${U.dur(IC.aptSep(st, blind[0].id))} there.` : '');
  const R = ap.fireRun, drill = R && R.kind === 'drill' && S.time >= R.t0 + R.dur ? ` Last drill: there in ${IC.mmss(R.dur)}.` : '';
  out.fire = !st.fire ? 'No fire station within 1.5 km of a runway: only turboprops may use the airport.'
    : rws.map(r => { const t = (st.rescueRw || {})[r.id] || 0; return `Fire trucks reach ${r.name} in ${IC.mmss(t)}${t > IC.FIRE_STD ? ': heavy jets may not land on it' : ''}`; }).join('. ') + '.' + drill;
  const fd = ap.fuelDay && ap.fuelDay.d === Math.floor(S.time / 86400) ? ap.fuelDay : null;
  out.fuel = !st.tanks ? 'No fuel farm: departures cannot refuel here.'
    : (st.hydrant ? `${st.tanks} tank${st.tanks > 1 ? 's' : ''} feed the hydrant system: no trucks to wait for.` : `${st.tanks} tank${st.tanks > 1 ? 's' : ''}, ${st.tanks * 2} fuel trucks: they refuel ${st.trucks} aircraft an hour (one tank's trucks serve ${IC.FUEL_TRUCKS}).`)
      + (fd && fd.s ? ` Departures waited ${U.dur(fd.s)} for fuel today.` : '');
  return out;
};
/* the gap between two fuel parts' outlines (a single tank by its circle's square) */
IC.fuelGap = (a, b) => { const R = t => t.r ? { x: t.x, y: t.y, a: 0, w: t.r * 2, h: t.r * 2 } : { x: t.x, y: t.y, a: t.a || 0, w: t.w || IC.APART.fuel.w, h: t.h || IC.APART.fuel.h }; return rectGap(R(a), R(b)); };
/* fuel waits today, for the panel: aircraft that waited and the minutes they lost */
IC.aptFuelWait = function (S, ap, sec) {
  const d = Math.floor(S.time / 86400), w = ap.fuelDay && ap.fuelDay.d === d ? ap.fuelDay : (ap.fuelDay = { d, s: 0, n: 0 });
  w.s += sec; w.n++;
};

/* ---------- runway capacity under the tower's rules ---------- */
/* arrivals and departures an hour that the runways can take under a set of rules (ops: the airport's by default),
   for the aircraft mix in st. The same timings as ground operations (groundops.js): an arrival holds its runways
   from the approach fix until it has turned off, and the next may start its final a separation later; departures
   follow one another a wake-turbulence gap apart; between two arrivals, a departure needs the next arrival to be at
   least the arrival gap out when it starts its take-off run. */
IC.opsCapacity = function (S, ap, st, ops) {
  ops = ops || IC.opsOf(ap);
  const O = IC.OPS_T, FAF = IC.GOPS.FAF;
  const mix = st.mix || {}, keys = Object.keys(mix), mixN = keys.reduce((a, k) => a + mix[k], 0) || 1;
  const byId = new Map(ap.parts.map(p => [p.id, p]));
  const groups = {};
  for (const r of st.rwy) (groups[r.grp] = groups[r.grp] || []).push(r);
  const out = { arr: 0, dep: 0, per: {} };
  for (const g in groups) {
    const L = groups[g], role = L[0].role;
    if (role === 'spare') continue;
    // (a group with a runway the tower cannot see is worked without the tower)
    const blind = L.find(r => st.unseen && st.unseen[r.id]), towered = st.tower && !blind;
    const sep = IC.aptSep(st, blind ? blind.id : null), sepA = sep * 0.5, sepD = sep;
    // per type in the mix: the best runway of the group for landing, and for taking off, and the cycle times
    let land = 0, depC = 0, pair = 0, okL = 0, okD = 0;
    for (const k of keys.length ? keys : [st.refType]) {
      const T = IC.ACTYPES[k], w = keys.length ? mix[k] : 1;
      let bl = 1e9, bd = null, R = null;
      for (const r of L) {
        const rw = byId.get(r.id); if (!rw) continue;
        const RR = IC.opsRules(ap, r.id, ops), o = IC.rwOcc(S, ap, rw, r.dir, T, RR);
        bl = Math.min(bl, o.land);
        if (o.dep < 1e8 && (!bd || o.dep < bd.dep)) { bd = o; R = RR; }
      }
      if (bl < 1e8) { land += bl * w; okL += w; }
      if (!bd) continue;
      const luaw = IC.opsEnter(S, R, k, T) === 'luaw', lineW = T.mil ? 10 : O.LINE;
      // a queue of departures, one after another
      depC += (luaw ? Math.max(bd.E + lineW, O.CREW + bd.roll + sepD) : sepD + bd.E + bd.line + O.CREW + bd.roll) * w;
      // an arrival, then a departure, then the next arrival once the departure has the gap it needs
      const dv = luaw ? (sepA <= bd.E + bd.line ? bd.E + bd.line : Math.max(bd.E + lineW, sepA)) : sepA + bd.E + bd.line;
      const after = Math.max(0, (R.gap * 10 - FAF) / O.ARR_V, bd.roll - (FAF - O.GO) / O.ARR_V, towered ? 0 : bd.roll + sepD);
      pair += ((bl < 1e8 ? bl : 300) + dv + O.CREW + after) * w;
      okD += w;
    }
    land = okL ? land / okL : 1e9; depC = okD ? depC / okD : 1e9; pair = okD ? pair / okD : 1e9;
    let a = 0, d = 0;
    if (role === 'arr' && land < 1e8) a = 3600 / (land + sepA);
    else if (role === 'dep' && depC < 1e8) d = 3600 / depC;
    else if (role === 'mixed') {
      if (land < 1e8 && pair < 1e8) { a = 3600 / pair; d = a; }
      else if (land < 1e8) a = 3600 / (land + sepA); else if (depC < 1e8) d = 3600 / depC;
    }
    out.per[g] = Math.round(a + d);
    out.arr += a; out.dep += d;
  }
  out.arr = Math.round(out.arr); out.dep = Math.round(out.dep);
  return out;
};

/* ---------- what the airport can do, and what is wrong with it ---------- */
/* the aircraft the numbers are worked out for: the largest civil jet the runways take, or a fighter at an air base */
function refType(ap, best) { if (ap.kind === 'airbase') return 'fighter'; return best >= 21 ? 'narrow' : best >= 13 ? 'turbo' : 'light'; }
/* water within 2 km of a runway brings birds */
function waterNear(S, ap, rws) {
  const key = rws.map(r => r.id).join(',');
  if (ap.water && ap.water.key === key) return ap.water;
  const W = S && S.world, out = { key, near: false, d: 1e9, what: '' };
  if (W) {
    for (const rw of rws) {
      for (const l of W.lakes || []) {
        const d = Math.max(0, U.segDist(l.x, l.y, rw.a.x, rw.a.y, rw.b.x, rw.b.y) - Math.max(l.rx || 0, l.ry || 0));
        if (d < out.d) { out.d = d; out.what = 'lake'; }
      }
      for (const r of W.rivers || []) {
        if (r.bb && (rw.a.x < r.bb[0] - 40 && rw.b.x < r.bb[0] - 40 || rw.a.x > r.bb[2] + 40 && rw.b.x > r.bb[2] + 40 || rw.a.y < r.bb[1] - 40 && rw.b.y < r.bb[1] - 40 || rw.a.y > r.bb[3] + 40 && rw.b.y > r.bb[3] + 40)) continue;
        for (const q of r.pts || []) { const x = q.x != null ? q.x : q[0], y = q.y != null ? q.y : q[1]; const d = Math.max(0, U.segDist(x, y, rw.a.x, rw.a.y, rw.b.x, rw.b.y) - (r.w || 0) / 2); if (d < out.d) { out.d = d; out.what = 'river'; } }
      }
    }
  }
  out.near = out.d < 20;
  ap.water = out;
  return out;
}
IC.aptStats = function (S, ap) {
  const G = IC.aptGraph(ap);
  const alive = k => ap.parts.filter(p => p.kind === k && p.built && p.hp > p.max * 0.25);
  const rws = alive('runway');
  const st = { rwy: [], stands: { s: 0, m: 0, l: 0, xl: 0 }, standsFree: { s: 0, m: 0, l: 0, xl: 0 }, warn: [], pax: 0, cargo: 0, fuelCap: 0, shelters: 0, zones: {}, arrPerHour: 0, depPerHour: 0 };
  const stands = [];
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) stands.push(s);
  // which stands can actually reach a runway
  // (kept on the graph for the runways open now: a big airport's network is walked only when one of them changes)
  const rk = rws.map(r => r.id).join('|');
  if (!G._reach || G._reach.key !== rk) {
    let reachAny = null;
    if (rws.length) { const r = reach(ap, rws[0].id + ':a'); for (const rw of rws.slice(1)) if (!r.has(rw.id + ':a')) for (const x of reach(ap, rw.id + ':a')) r.add(x); reachAny = r; }
    // stands reached only under a passenger bridge take tails up to its clearance (less a metre to spare)
    let tall = null, low = 0;
    for (const L of G.adj.values()) for (const e of L) if (e.clear) low = low ? Math.min(low, e.clear) : e.clear;
    if (low && rws.length) { tall = new Set(); for (const rw of rws) if (!tall.has(rw.id + ':a')) for (const x of reach(ap, rw.id + ':a', true)) tall.add(x); }
    G._reach = { key: rk, reachAny, tall, low };
  }
  const { reachAny, tall, low } = G._reach;
  for (const s of stands) {
    const ok = reachAny && reachAny.has(s.id) && s.hp > 0;
    s.linked = ok; s.maxHt = ok && tall && !tall.has(s.id) ? low - 1 : 0;
    if (!ok) continue;
    st.stands[s.size]++;
    if (!s.occ) st.standsFree[s.size]++;
    const z = st.zones[s.zone || 'civil'] = st.zones[s.zone || 'civil'] || { s: 0, m: 0, l: 0, xl: 0, contact: 0, remote: 0, free: 0 };
    z[s.size]++; z[s.contact ? 'contact' : 'remote']++; if (!s.occ) z.free++;
  }
  // runways and taxiways closed for works, and pavement breaking up under aircraft too heavy for it
  for (const p of ap.parts) {
    if (!p.built) continue;
    const w = p.shut && ap.works.find(x => x.id === p.shut);
    if (w) st.warn.push(`${p.name || IC.APART[p.kind].name} closed for works (${w.kind === 'upgrade' ? 'new pavement' : U.lc(w.label)}) for about ${U.dur(Math.max(60, (1 - w.prog) * w.dur))}.`);
    if (p.wear >= 1) st.warn.push(`${p.name || IC.APART[p.kind].name}: the ${IC.PAVE[IC.paveOf(p)].name.toLowerCase()} is worn out; closed until resurfaced.`);
    else if (p.wear >= 0.5) st.warn.push(`${p.name || IC.APART[p.kind].name}: ${U.pct(p.wear)} worn. Aircraft heavier than ${IC.PAVE[IC.paveOf(p)].t} t break up ${IC.PAVE[IC.paveOf(p)].name.toLowerCase()}.`);
    if (p.lit === false && p.kind === 'runway') st.warn.push(`${p.name || 'A runway'} has no edge lights: it closes from dusk to dawn. Upgrade it on the build bar to light it.`);
  }
  const unlinked = stands.filter(s => !s.linked && s.hp > 0).length;
  if (unlinked) st.warn.push(`${unlinked} stand${unlinked > 1 ? 's are' : ' is'} not connected to a runway: no aircraft can reach ${unlinked > 1 ? 'them' : 'it'}. Draw a taxiway from ${unlinked > 1 ? 'their' : 'its'} apron to the network.`);
  // (brief 47) taxiways that end in the grass: built, but no aircraft goes down them
  const deadT = G.dead ? ap.parts.filter(p => p.kind === 'taxi' && p.built && !p.cut[1] && p.nodes.some(id => G.dead.has(id))).length : 0;
  if (deadT) st.warn.push(`${deadT} taxiway${deadT > 1 ? 's end' : ' ends'} in the grass, joined to nothing: no aircraft uses ${deadT > 1 ? 'them' : 'it'}. Join ${deadT > 1 ? 'them' : 'it'} to a taxiway, an apron or a runway (rapid exits lead onto a parallel taxiway).`);
  for (const p of ap.parts) if (DOOR(p.kind) && p.built) { p.linked = !!(reachAny && reachAny.has(p.id + ':d')); if (p.hp > p.max * 0.25 && p.linked) st.shelters += IC.APART[p.kind].holds || 0; else if (!p.linked && p.hp > 0) st.warn.push(`${IC.APART[p.kind].name} is not connected to the taxiways: no aircraft can use it. Draw a taxiway to its door.`); }
  const towers = alive('tower'), tower = towers.length > 0;
  // the cab must see each runway it works: within 8 km and over the roofs in between
  st.unseen = {};
  if (tower) for (const rw of rws) { const why = IC.towerSees(ap, towers, rw); if (why) { st.unseen[rw.id] = why; st.warn.push(`${rw.name}: the tower cannot see it (${why}). It is worked as with no tower, one movement every 8 min. A tower with a clear view of it fixes this.`); } }
  const radar = alive('atc').length > 0 || !!(S && S.units.some(u => u.radarOn && u.d.sensor && !u.d.sensor.passive && U.dist(u, ap) < 900));
  st.tower = tower; st.radar = radar;
  // in fog, low-visibility procedures space every movement wider, unless a runway end has a CAT III landing system
  // (landing systems built before that research are CAT I; those in the starting layouts are CAT III)
  st.cat3 = ap.parts.some(p => p.kind === 'ils' && p.built && p.hp > p.max * 0.25 && (p.cat || 3) >= 3);
  st.lvp = !!(S && S.weather && IC.needILS(S) && !st.cat3 && ap.kind !== 'airbase');
  if (st.lvp) st.warn.push('Fog: low-visibility procedures space every movement 60% wider. A CAT III landing system (research) keeps them tight.');
  const sep = IC.aptSep(st);
  ap.st = st;
  const cfg = S && S.wind ? IC.aptConfig(S, ap) : null;
  st.cfg = cfg;
  let best = 0;
  for (const rw of rws) best = Math.max(best, IC.rwUsable(rw));
  const T = IC.ACTYPES[refType(ap, best)];
  st.refType = refType(ap, best);
  // capacity is worked out for the aircraft that actually use the airport (the last hour's mix), or a typical one
  const mix = {};
  for (const x of ap.mvLog || []) if (x.type && IC.ACTYPES[x.type] && !IC.ACTYPES[x.type].vtol) mix[x.type] = (mix[x.type] || 0) + 1;
  if (!Object.keys(mix).length) mix[st.refType] = 1;
  const mixN = Object.values(mix).reduce((a, b) => a + b, 0);
  st.mix = mix; st.refT = T;
  const occMix = (rw, dir) => { let land = 0, dep = 0; for (const k in mix) { const o = IC.rwOcc(S, ap, rw, dir, IC.ACTYPES[k]); if (o.land >= 1e8 || o.dep >= 1e8) { const r = IC.rwOcc(S, ap, rw, dir, T); land += r.land * mix[k]; dep += r.dep * mix[k]; } else { land += o.land * mix[k]; dep += o.dep * mix[k]; } } return { land: land / mixN, dep: dep / mixN }; };
  // each runway: how long a landing and a departure hold it, the way the wind has it used now
  let crossings = 0;
  for (const rw of rws) {
    const L = rwLen(rw), usable = IC.rwUsable(rw), nodes = G.rwn.get(rw.id) || [];
    const exits = nodes.filter(n => n.exit), entries = nodes.filter(n => n.entry);
    const c = cfg && cfg.rw[rw.id], dir = c ? c.dir : 1;
    const o = IC.rwOcc(S, ap, rw, dir, T), oBack = IC.rwOcc(S, ap, rw, -dir, T);
    const threshold = entries.some(n => n.s < 1.2 || n.s > L - 1.2);
    const om = occMix(rw, dir);
    const r = { id: rw.id, name: rw.name, end: IC.rwEnd(rw, dir), len: L, usable, exits: exits.length, land: om.land, dep: om.dep, threshold, dir, role: c ? c.role : 'mixed', grp: G.grp[rw.id],
      head: c ? c.head : 0, cross: c ? c.cross : 0, ils: { a: IC.rwHasILS(ap, rw, 1), b: IC.rwHasILS(ap, rw, -1) } };
    st.rwy.push(r);
    const flat = FAF_T();
    if (!exits.length) st.warn.push(`${rw.name}: no taxiway reaches it.`);
    else {
      const slow = [[dir, o], [-dir, oBack]].filter(([d, x]) => x.land - flat > 150);
      if (slow.length === 2) st.warn.push(`${rw.name}: no exit near where aircraft stop; every landing backtracks along the runway (${U.dur(Math.min(o.land, oBack.land) - flat)} on the runway).`);
      else if (slow.length === 1) st.warn.push(`${rw.name}: landings on ${IC.rwEnd(rw, slow[0][0])} find no exit ahead and backtrack along the runway (${U.dur(slow[0][1].land - flat)} on the runway).`);
    }
    if (exits.length && !threshold) st.warn.push(`${rw.name}: no taxiway to either end; every departure backtracks along the runway.`);
    if (usable < L - 1) st.warn.push(`${rw.name}: ${rw.craters.some(k => k.wreck) ? 'wreckage on the runway' : 'cratered'}, ${U.km(usable)} usable.`);
    // runway crossings: a runway node with taxiways on both sides
    for (const n of nodes) {
      const sides = new Set();
      for (const e of G.adj.get(n.id)) if (e.kind !== 'rwy') { const q = G.N.get(e.to); const off = rwOff(rw, q); if (Math.abs(off) > 0.3) sides.add(Math.sign(off)); }
      if (sides.size === 2) crossings++;
    }
  }
  st.longest = best;
  st.crossings = crossings;
  st.complex = rws.length >= 2 && crossings > 0;
  st.gradar = alive('gradar').length > 0;
  if (st.complex && !st.gradar && ap.kind !== 'airbase') st.warn.push(`Taxiing aircraft cross runways here and there is no ground radar: at night or in fog one could stray onto a runway in use.`);
  // capacity: one clearance per group of dependent runways, used the way the configuration says, under the tower's rules
  const cap = IC.opsCapacity(S, ap, st);
  st.arrPerHour = cap.arr; st.depPerHour = cap.dep;
  for (const r of st.rwy) r.perHour = cap.per[r.grp] || 0;
  st.movesPerHour = st.arrPerHour + st.depPerHour;
  // the wind: which aircraft no runway can take right now
  if (cfg && S) {
    st.windOut = [];
    for (const k of ['light', 'turbo', 'narrow', 'wide']) {
      const TT = IC.ACTYPES[k];
      if (!rws.some(rw => IC.rwUsable(rw) >= TT.rwy)) continue;
      const why = rws.filter(rw => IC.rwUsable(rw) >= TT.rwy).map(rw => cfg.rw[rw.id] && IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, TT));
      if (why.every(Boolean)) st.windOut.push({ type: k, why: why[0] });
    }
    const out = st.windOut.filter(w => w.type !== 'light');
    if (out.length && ap.kind !== 'airbase') st.warn.push(`Wind ${IC.windText(S)}: ${out.map(w => IC.ACTYPES[w.type].name.toLowerCase() + 's').join(' and ')} cannot use any runway (${out[0].why}). A runway pointing into this wind would keep them flying.`);
    // gusts across the runways in use, beyond what some crews may land in: those landings are risky
    const gusty = ['turbo', 'narrow', 'wide'].filter(k => !out.some(w => w.type === k) && rws.some(rw => IC.rwUsable(rw) >= IC.ACTYPES[k].rwy) && rws.every(rw => !cfg.rw[rw.id] || IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, IC.ACTYPES[k]) || IC.windOn(S, IC.rwHdg(rw, cfg.rw[rw.id].dir)).gCross > IC.ACTYPES[k].xw));
    st.gusty = gusty;
    if (gusty.length && ap.kind !== 'airbase') st.warn.push(`Gusts up to ${Math.round(S.wind.gust)} kt across the runways: ${gusty.map(k => IC.ACTYPES[k].name.toLowerCase() + 's').join(' and ')} are landing beyond their limits. A crash is possible.`);
  }
  // fog and low cloud
  st.ilsEnds = rws.reduce((n, rw) => n + (IC.rwHasILS(ap, rw, 1) ? 1 : 0) + (IC.rwHasILS(ap, rw, -1) ? 1 : 0), 0);
  if (!st.ilsEnds && rws.length && ap.kind !== 'airbase') st.warn.push('No landing system (ILS): in fog and low cloud every arrival diverts.');
  // fire and rescue: how long the trucks take to reach the far end of each runway
  const fires = alive('fire');
  const fireSt = fires.filter(f => rws.some(rw => U.dist(f, rwAt(rw, 0.5)) < 15));
  st.fire = fireSt.length > 0;
  st.rescue = 0; st.rescueRw = {};
  for (const rw of rws) { let r = 0; for (const t of [0, 0.5, 1]) r = Math.max(r, IC.aptRescue(ap, rwAt(rw, t))); st.rescueRw[rw.id] = r; st.rescue = Math.max(st.rescue, r); }
  // heavy jets need a runway long enough for them that the trucks reach in 3 minutes
  st.heavyOk = rws.some(rw => IC.rwUsable(rw) >= IC.ACTYPES.wide.rwy && st.rescueRw[rw.id] <= IC.FIRE_STD);
  if (!tower) st.warn.push('No control tower: one movement every 8 min. A tower that sees the runways allows one every 2 min.');
  if (!st.fire) st.warn.push('No fire station near the runway: only turboprops may use it. Build one within 1.5 km of the runway.');
  else for (const rw of rws) if (st.rescueRw[rw.id] > IC.FIRE_STD) st.warn.push(`Fire trucks reach ${rw.name} in ${IC.mmss(st.rescueRw[rw.id])}: heavy jets may not land on it, and more people die in a crash there. A fire station closer to its far end brings it under 3 min.`);
  if (rws.length) { const w = waterNear(S, ap, rws); if (w.near && ap.kind !== 'airbase') st.warn.push(`A ${w.what} ${U.km(w.d)} from the runway attracts birds: now and then one hits an aircraft.`); }
  for (const t of alive('terminal')) st.pax += IC.APART.terminal.pax * t.w * t.h;
  for (const t of alive('cargo')) st.cargo += 60 * t.w * t.h;
  // fuel: stock in the tanks, resupply by road or pipeline, and how many aircraft the trucks can refuel an hour
  const tanks = alive('fuel');
  st.hydrant = alive('hydrant').length > 0;
  const nTank = tanks.reduce((s, t) => s + IC.fuelTanks(t), 0);
  st.tanks = nTank;
  st.fuelCap = tanks.reduce((s, t) => s + IC.fuelCap(t), 0);
  st.fuel = tanks.reduce((s, t) => s + (t.stock || 0), 0);
  st.fuelIn = nTank ? nTank * IC.FUEL_IN + (st.hydrant ? IC.APART.hydrant.pipe : 0) : 0;
  st.trucks = st.hydrant ? Infinity : nTank * IC.FUEL_TRUCKS;
  st.fuelDeps = Math.round(Math.min(st.trucks, st.fuelIn / (T.fuel || 1)));
  if (tanks.length && st.fuelDeps < st.depPerHour * 0.8 && ap.kind !== 'airbase') st.warn.push(`Fuel for about ${st.fuelDeps} departures an hour, fewer than the runways can launch (${st.depPerHour}). ${st.hydrant ? 'More tanks' : 'More tanks or a hydrant system'} would help.`);
  for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) if (IC.fuelGap(tanks[i], tanks[j]) < 1) { st.warn.push(`Fuel ${tanks[i].r ? 'tanks' : 'farms'} stand within 100 m of each other: one fire could take them all. Keep them further apart.`); i = tanks.length; break; }
  const links = rws.map(rw => (G.rwn.get(rw.id) || []).filter(n => n.exit).length).reduce((s, v) => s + v, 0);
  if (links === 1) st.warn.push('Only one taxiway connects the runway: a single hit strands every aircraft.');
  const ammo = alive('ammo');
  if (ammo.some(a => ap.parts.some(q => q.kind !== 'ammo' && q.built && q.kind !== 'runway' && q.kind !== 'taxi' && partDist(ap, q, a) < 1.5))) st.warn.push('The munitions store is close to other buildings: if it goes up, so do they.');
  st.maxType = !rws.length ? null : !st.fire ? 'turbo' : best >= 29 && st.heavyOk ? 'cargo' : best >= 27 && st.heavyOk ? 'wide' : best >= 21 ? 'narrow' : best >= 13 ? 'turbo' : null;
  ap.st = st;
  return st;
};
const FAF_T = () => IC.GOPS.FAF / 0.95 + IC.GOPS.CLEAR / IC.GOPS.TAXI + 30;
IC.FUEL_IN = 45;
/* why an arrival of this type cannot land here right now (wind, fog), or '' */
IC.aptLandWhy = function (S, ap, T) {
  const cfg = IC.aptConfig(S, ap), rws = ap.parts.filter(p => p.kind === 'runway' && p.built && p.hp > p.max * 0.25 && IC.rwUsable(p) >= T.rwy);
  if (!rws.length) return '';
  const wind = rws.map(rw => cfg.rw[rw.id] && IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, T));
  if (wind.every(Boolean)) return wind[0];
  if (IC.needILS(S) && !T.mil && !rws.some((rw, i) => !wind[i] && IC.rwHasILS(ap, rw, cfg.rw[rw.id].dir))) return 'fog or low cloud, and no landing system (ILS) on a runway it can use';
  if (!rws.some((rw, i) => !wind[i] && IC.rwFireOk(ap, rw, T))) return 'the fire trucks need over 3 min to reach the runway: heavy jets may not land';
  return '';
};
/* can this aircraft type use the airport right now (runway, stands, fire cover) */
IC.aptFits = function (ap, type) {
  const T = IC.ACTYPES[type], st = ap.st || {};
  if (!T.vtol && (st.longest || 0) < T.rwy) return false;
  if (!T.mil && !st.fire && type !== 'turbo') return false;
  if (!T.mil && T.stand === 'l' && st.heavyOk === false) return false;
  return true;
};

/* what the airport offers airlines, in numbers (task 24 decides what each airline asks for; this only measures).
   Built, working parts only. Stable field names:
   rwy (longest usable runway, units of 100 m), maxType (largest civil type it takes, or null), tower, fire, gradar,
   ils (runway ends with a landing system), stands { s, m, l, xl } (civil, cargo and light zones), gates (contact
   stands with a jet bridge), remote (stands served by bus), cargoStands, pax (terminal passengers an hour), cargo
   (cargo shed capacity), hangar (aircraft the hangars hold), hangarFree, fuel ('hydrant' | 'trucks' | 'none'),
   fuelDeps (refuellings an hour), deice (de-icing pads), road (a road reaches it), parking (car park spaces),
   transit (a bus or rail stop), hotel (hotel rooms), moves (runway movements an hour) */
IC.aptProvides = function (ap) {
  const st = ap.st || {}, ok = p => p.built && p.hp > p.max * 0.25;
  const out = { rwy: st.longest || 0, maxType: st.maxType || null, tower: !!st.tower, fire: !!st.fire, gradar: !!st.gradar, ils: st.ilsEnds || 0,
    stands: { s: 0, m: 0, l: 0, xl: 0 }, gates: 0, remote: 0, cargoStands: 0, pax: Math.round(st.pax || 0), cargo: Math.round(st.cargo || 0),
    hangar: 0, hangarFree: 0, fuel: st.hydrant ? 'hydrant' : st.fuelCap ? 'trucks' : 'none', fuelDeps: st.fuelDeps || 0, deice: 0,
    road: !!(ap.land && ap.land.road), parking: 0, transit: false, hotel: 0, moves: st.movesPerHour || 0 };
  for (const p of ap.parts) {
    if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
      if (s.hp <= 0 || s.linked === false || s.zone === 'mil') continue;
      out.stands[s.size]++;
      if (s.zone === 'cargo' || s.cargo) out.cargoStands++;
      else if (s.contact) out.gates++; else out.remote++;
    }
    if (p.kind === 'hangar' && ok(p) && p.linked !== false) { out.hangar += IC.APART.hangar.holds; out.hangarFree += Math.max(0, IC.APART.hangar.holds - (p.inside || []).length); }
    if (p.kind === 'deice' && ok(p)) out.deice++;
  }
  for (const p of ap.parts) if (p.kind === 'surface' && p.built && IC.SURF[p.surf] && IC.SURF[p.surf].park) out.parking += Math.round(IC.SURF[p.surf].park * p.w * p.h);
  for (const f of (ap.land && ap.land.items) || []) { if (f.kind === 'park' || f.kind === 'garage') out.parking += f.cap || 0; if (f.kind === 'stop') out.transit = true; if (f.kind === 'hotel') out.hotel += f.cap || 0; }
  return out;
};

/* who may park on a stand: civil aircraft never in the military zone, and the reverse */
IC.standZoneOk = function (s, T) {
  const z = s.zone || 'civil';
  if (T.mil) return z === 'mil';
  if (z === 'mil') return false;
  if (T.cargo) return z === 'cargo' || z === 'civil';
  if (T.zone === 'light') return z === 'light' || z === 'civil';
  return z === 'civil';
};

/* ---------- compatibility with the rest of the game ---------- */
IC.baseStatus = function (S, b) {
  if (!b || !b.parts) return { runway: true, turn: 1, cap: 99 };
  const st = b.st && b.st.rwy ? b.st : IC.aptStats(S, b);
  let turn = 1;
  if (!st.fuel || st.fuel < 5) turn *= 1.6;
  if (b.kind === 'airbase' && !b.parts.some(p => p.kind === 'ammo' && p.built && p.hp > p.max * 0.25)) turn *= 1.3;
  return { runway: (st.longest || 0) >= 10 && st.rwy.some(r => r.exits > 0), rwyLen: st.longest || 0, turn, cap: st.shelters, off: b.offline || b.owner === 'enemy', st };
};
/* the runway in a word: open, being built (before any runway has opened, so it is no emergency), closed, or none */
/* the stand size an apron lays out: the deepest that fits, but no larger than the size the player picked (p.smax) */
IC.apronStandSize = p => {
  const depth = p.h * 0.64, cap = { s: 0, m: 1, l: 2, xl: 2 }[p.smax] ?? 2;
  return ['l', 'm', 's'].find((k, i) => 2 - i <= cap && depth >= IC.STAND[k].d) || null;
};
IC.rwyState = function (S, b) {
  if (!b || !b.parts) return { open: true, word: 'Runway open' };
  if (!b.parts.some(p => p.kind === 'runway')) return { none: true, word: 'No runway' };
  if (IC.baseStatus(S, b).runway) return { open: true, word: 'Runway open' };
  const w = !b.parts.some(p => p.kind === 'runway' && p.built) && (b.works || []).find(x => x.part && x.part.kind === 'runway');
  if (w) return { building: true, word: `Runway being built · ${U.pct(w.prog || 0)}`, prog: w.prog || 0 };
  return { closed: true, word: 'Runway closed' };
};
IC.canLaunch = function (S, r) {
  const b = IC.baseOf(S, r.base);
  if (!b || b.dead || b.owner === 'enemy' || (b.state !== undefined && b.state !== 'ready')) return false;
  if (b.parts) {
    const T = IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]];
    if (!T.vtol && (b.st.longest || 0) < T.rwy) return false;
    if (!T.vtol && r.slot && !IC.slotPath(S, b, r)) return false;
  }
  return true;
};
IC.baseUsable = IC.canLaunch;
IC.slotPath = function (S, b, r) {
  const from = IC.slotNode(b, r); if (!from) return true;
  const rws = b.parts.filter(p => p.kind === 'runway' && p.built && p.hp > 0);
  return rws.some(rw => reach(b, from).has(rw.id + ':a') || reach(b, from).has(rw.id + ':b') || Object.values(b.nodes).some(n => n.on && n.on.part === rw.id && reach(b, from).has(n.id)));
};
IC.slotNode = (b, r) => { if (!r.slot) return null; const p = b.parts.find(x => x.id === r.slot); if (p) return p.id + ':d'; for (const a of b.parts) if (a.stands) { const s = a.stands.find(x => x.id === r.slot); if (s) return s.id; } return null; };
IC.fallbackBase = function (S, r) {
  const T = IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]];
  const opts = IC.bases(S).filter(b => b.owner === 'us' && (b.kind === 'airbase' || S.story && S.story.act >= 3) && b.active !== false && (T.vtol || (b.st.longest || 0) >= T.rwy))
    .concat(T.vtol ? S.units.filter(u => u.type === 'heliport' && u.state === 'ready') : []);
  const here = IC.baseOf(S, r.base) || (r.ent ? r.ent : IC.cap(S));
  opts.sort((a, b) => U.dist(a, here) - U.dist(b, here));
  return opts[0] ? opts[0].id : r.base;
};
/* put each flight based here into a shelter (shelters, alert pads, hangars, then stands) */
IC.assignSlots = function (S, b) {
  if (!b || !b.parts) return;
  const flights = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
  const shel = b.parts.filter(p => (p.kind === 'has' || p.kind === 'alert' || p.kind === 'hangar') && p.built && p.hp > p.max * 0.25);
  const slots = [];
  for (const p of shel) for (let i = 0; i < IC.APART[p.kind].holds; i++) slots.push({ id: p.id, kind: p.kind, i });
  const stands = [];
  IC.aptGraph(b);
  for (const a of b.parts) if (a.kind === 'apron' && a.built) for (const s of a.stands || []) if (s.hp > 0 && (s.zone || 'mil') === 'mil' && !s.occ) stands.push({ id: s.id, kind: 'stand', size: s.size });
  const pref = r => r.park === 'open' ? ['stand', 'hangar', 'has', 'alert'] : r.kind === 'ftr' ? ['alert', 'has', 'hangar', 'stand'] : r.kind === 'aew' || r.kind === 'cargo' ? ['stand', 'hangar'] : ['hangar', 'has', 'stand'];
  const used = new Map();
  const take = (r, s) => { r.slot = s.id; used.set(s.id + ':' + (s.i || 0), r); };
  for (const r of flights) r.slot = null;
  for (const r of flights) {
    for (const k of pref(r)) {
      const pool = k === 'stand' ? stands.filter(s => IC.STAND_FITS[s.size].includes(IC.ACTYPES[r.type || IC.AIRKIND_TYPE[r.kind]].stand)) : slots.filter(s => s.kind === k);
      const s = pool.find(x => !used.has(x.id + ':' + (x.i || 0)) && !(k === 'stand' && [...used.keys()].some(u => u.startsWith(x.id))));
      if (s) { take(r, s); break; }
    }
  }
};
IC.parkPos = function (S, b, r) {
  if (!r.slot) return { x: b.x, y: b.y, inside: false };
  const p = b.parts.find(x => x.id === r.slot);
  if (p) { const i = S.roster.filter(x => x.base === b.id && x.slot === r.slot).indexOf(r); const q = toWorld(p, (i - 0.5) * 0.18 * (IC.APART[p.kind].holds > 1 ? 1 : 0), 0); return { x: q.x, y: q.y, inside: true, fac: p, a: p.a + Math.PI / 2 }; }
  for (const a of b.parts) if (a.stands) { const s = a.stands.find(x => x.id === r.slot); if (s) return { x: s.x, y: s.y, inside: false, a: s.a, stand: s }; }
  return { x: b.x, y: b.y, inside: false };
};

/* ---------- damage by location ---------- */
IC.aptHit = IC.baseHit = function (S, ap, x, y, dmg, src) {
  const rb = 0.3 + dmg * 0.006, p = { x, y };
  const hitNames = [], notes = [], hitRw = [];
  let acLost = 0, sheltered = 0;
  for (const part of ap.parts) {
    if (!part.built && part.prog <= 0) continue;
    if (part.kind === 'runway') {
      const off = Math.abs(rwOff(part, p)), t = rwT(part, p);
      if (off < part.w / 2 + rb * 0.5 && t > -0.01 && t < 1.01) {
        // pavement worn with age breaks up wider (brief 25: a runway paved in Year 2 is weaker by Year 9)
        const r = Math.max(0.35, rb * 0.7) * paveK(part, 'crater') * (1 + 0.5 * (part.wear || 0));
        part.craters.push({ t: U.clamp(t, 0, 1), r, id: IC.nid('cr') });
        part.hp = Math.max(1, part.hp - 5);
        hitNames.push(`${part.name || 'runway'} cratered`);
        if (!hitRw.includes(part)) { hitRw.push(part); const w = craterWords(part, r); if (w) notes.push(w); }
        ap.dirty = true;
      }
      continue;
    }
    if (part.kind === 'taxi') {
      for (let i = 1; i < part.nodes.length; i++) {
        const a = ap.nodes[part.nodes[i - 1]], b = ap.nodes[part.nodes[i]];
        if (U.segDist(x, y, a.x, a.y, b.x, b.y) < part.w / 2 + rb * 0.4 && !part.cut[i]) { part.cut[i] = true; ap.dirty = true; hitNames.push('taxiway cut'); }
      }
      continue;
    }
    if (part.kind === 'surface') continue;
    if (part.kind === 'apron') {
      for (const s of part.stands || []) if (U.dxy(s.x, s.y, x, y) < rb + 0.2 && s.hp > 0) { s.hp = 0; hitNames.push('stand destroyed'); }
      if (rectDist(part, p) < rb) { part.hp = Math.max(0, part.hp - dmg * 0.3); (part.scorch = part.scorch || []).push({ x, y, r: rb * 0.9 }); if (part.scorch.length > 16) part.scorch.shift(); }
      continue;
    }
    const d = partDist(ap, part, p);
    if (d > rb) continue;
    const was = part.hp, inside = part.kind === 'hangar' ? (part.inside || []).length : 0;
    const hard = part.kind === 'has' ? 0.35 : part.kind === 'alert' ? 0.7 : 1;
    part.hp = Math.max(0, part.hp - dmg * (1 - d / rb * 0.5) * hard);
    if (was > part.max * 0.25 && part.hp <= part.max * 0.25) {
      hitNames.push(`${U.lc(IC.APART[part.kind].name)} destroyed`);
      IC.addScar(S, { kind: 'burn', x: part.x, y: part.y, r: Math.max(part.w || part.r * 2, part.h || 0) * 1.4 });
      if (part.kind === 'fuel') { part.burning = 5400; part.stock = 0; IC.explode(S, part.x, part.y, 1.8, 'ground', { big: 0.6 }); IC.addFire(S, part.x, part.y, 1.8, 9000); }
      else if (part.kind === 'ammo') { IC.explode(S, part.x, part.y, 2, 'ground', { big: 0.8 }); IC.addFire(S, part.x, part.y, 1.2, 6000); IC.later(S, 2, 'aptSecondary', S, ap, part.x + 0.05, part.y + 0.05); }
      else IC.addFire(S, part.x, part.y, 0.8, 4000);
      // airliners in a hangar that falls are lost with it
      if (part.kind === 'hangar') for (const x of part.inside || []) { IC.emit(S, 'tailLost', { ap, tail: x.tl, why: 'destroyed in the hangar' }); acLost++; }
      if (part.kind === 'hangar') part.inside = [];
      ap.dirty = true;
    } else if (inside) notes.push(`The hangar stood: the ${inside > 1 ? `${inside} airliners` : 'airliner'} inside came through a blast ${Math.round(d * 100)} m away. On an open stand that close, three in four are lost.`);
  }
  // aircraft on the ground
  for (const r of S.roster) {
    if (r.base !== ap.id || r.st === 'lost' || r.st === 'air') continue;
    const pp = IC.parkPos(S, ap, r);
    const d = U.dxy(x, y, pp.x, pp.y);
    if (d > rb + 0.25) continue;
    const shel = pp.fac;
    const chance = shel ? (shel.kind === 'has' ? (shel.hp > shel.max * 0.25 ? 0.1 : 0.6) : shel.kind === 'alert' ? 0.45 : (shel.hp > shel.max * 0.25 ? 0.4 : 0.9)) : 0.8;
    if (Math.random() >= chance) { if (shel && chance < 0.8) sheltered++; }
    else { r.st = 'lost'; r.ent = null; acLost++; S.stats.acLost++; S.wrecks.push({ x: pp.x, y: pp.y, type: 'aircraft', t: S.time, h: pp.a || 0 }); IC.addFire(S, pp.x, pp.y, 0.6, 2400); }
  }
  for (const m of ap.moves) if (!m.dead && !m.destroyed && U.dist(m, p) < rb + m.T.span / 2) { m.destroyed = true; acLost++; S.wrecks.push({ x: m.x, y: m.y, type: m.T.mil ? 'aircraft' : 'airliner', t: S.time, h: m.h }); IC.addFire(S, m.x, m.y, 0.8, 3000); }
  // airliners parked at their stands
  for (const a of ap.parts) if (a.stands) for (const s of a.stands) {
    if (!s.occ || U.dxy(s.x, s.y, x, y) > rb + 0.3) continue;
    if (Math.random() < 0.75) { IC.emit(S, 'tailLost', { ap, tail: s.occ, why: 'destroyed at the gate' }); S.wrecks.push({ x: s.x, y: s.y, type: 'airliner', t: S.time, h: s.a }); IC.addFire(S, s.x, s.y, 0.8, 3000); s.occ = null; acLost++; }
  }
  ap.dirty = true;
  IC.aptStats(S, ap);
  if (ap.kind === 'airbase') IC.assignSlots(S, ap);
  const st = IC.baseStatus(S, ap);
  if (sheltered) notes.push(`${sheltered} aircraft in ${sheltered > 1 ? 'shelters and hangars' : 'a shelter'} came through: in the open, four in five are lost that close.`);
  if (hitRw.length) { const w = runwayWords(ap, hitRw); if (w) notes.push(w); }
  const uniq = [...new Set(hitNames)];
  const head = [uniq.join(', '), acLost ? `${acLost} aircraft destroyed on the ground` : '', !st.runway ? 'RUNWAY CLOSED' : ''].filter(Boolean).join('; ');
  if (uniq.length || acLost || notes.length) IC.log(S, 'leak', 'AIRPORT', `${ap.name}: ${head ? head + '.' : 'hit.'}${notes.length ? ' ' + notes.join(' ') : ''}`, { x, y });
  IC.emit(S, 'baseHit', { base: ap, acLost, runway: st.runway, notes, sheltered });
  if (ap.autoRepair) autoQueue(S, ap);
};
/* what the pavement made of the hole (brief 25): reinforced concrete halves it, age widens it */
function craterWords(rw, r) {
  const m = Math.round(r * 200), mat = IC.paveOf(rw), K = IC.PAVE[mat], worn = rw.wear || 0;
  const asph = Math.round(r * 200 / K.crater / (1 + 0.5 * worn));
  if (mat === 'rconc') return `Reinforced concrete: the crater is ${m} m across, about half what asphalt would take (${asph} m), and it is filled in ${U.dur(700 * K.patch)}.`;
  if (worn >= 0.3) return `${rw.name || 'The runway'} was ${U.pct(worn)} worn with age: it broke up wider, a crater ${m} m across where new pavement would take ${Math.round(r * 200 / (1 + 0.5 * worn))} m.`;
  return '';
}
/* one runway or several: what the hit leaves for jets (a narrow-body needs IC.ACTYPES.narrow.rwy) */
function runwayWords(ap, hit) {
  const rws = ap.parts.filter(q => q.kind === 'runway' && q.built), need = IC.ACTYPES[ap.kind === 'airbase' ? 'fighter' : 'narrow'].rwy;
  const ok = rws.filter(q => IC.rwUsable(q) >= need), left = Math.max(0, ...hit.map(IC.rwUsable));
  const what = ap.kind === 'airbase' ? 'fighters' : 'airliners';
  if (hit.every(q => IC.rwUsable(q) >= need)) return '';
  if (ok.length && ok.some(q => !hit.includes(q))) return `${ok.filter(q => !hit.includes(q)).map(q => q.name || 'Another runway').join(' and ')} ${ok.length > 1 ? 'are' : 'is'} still whole: ${ap.name.replace(/ (International|Airport)$/, '')} keeps flying.`;
  if (ok.length) return '';
  return `${rws.length === 1 ? 'With one runway, one crater closes it' : 'No runway is left long enough'} to ${what}: the longest stretch left is ${U.km(left)}, and they need ${U.km(need)}. ${rws.length === 1 ? 'A second runway would have kept it open.' : ''}`.trim();
}
IC.H.aptSecondary = (S, ap, x, y) => () => IC.aptHit(S, ap, x, y, 90, { d: { code: 'secondary explosion' } });

/* ---------- engineering: repairs and construction ---------- */
function workFor(ap, key) { return ap.works.find(w => w.key === key); }
IC.aptRepairList = function (ap) {
  const L = [];
  for (const p of ap.parts) {
    if (!p.built) continue;
    if (p.kind === 'runway') for (const c of p.craters) L.push(c.wreck ? { key: 'cr:' + c.id, label: `Clear wreckage from ${p.name || 'the runway'}`, cost: 6, dur: 2400, part: p, crater: c } : { key: 'cr:' + c.id, label: `Fill crater on ${p.name || 'the runway'}`, cost: 10, dur: 700 * paveK(p, 'patch'), part: p, crater: c });
    if (p.wear >= 0.3) L.push({ key: 'rs:' + p.id, label: `Resurface ${p.name || U.lc(IC.APART[p.kind].name)} (${U.pct(p.wear)} worn)`, cost: Math.max(3, IC.partCost(ap, p) * 0.3 * p.wear), dur: Math.max(600, IC.partBuildTime(ap, p) * 0.3 * p.wear), part: p, wear: true });
    else if (p.kind === 'taxi') for (const i in p.cut) L.push({ key: 'tx:' + p.id + ':' + i, label: 'Repair taxiway', cost: 4, dur: 420, part: p, seg: +i });
    else if (p.kind === 'apron') {
      for (const s of p.stands || []) if (s.hp <= 0) L.push({ key: 'st:' + s.id, label: 'Repair stand', cost: 5, dur: 500, part: p, stand: s });
      if (p.hp < p.max * 0.8) L.push({ key: 'pt:' + p.id, label: 'Resurface apron', cost: Math.max(3, IC.partCost(ap, p) * 0.3), dur: 900, part: p });
    }
    else if (p.hp < p.max && (!p.aged || p.hp < p.max * 0.8)) { const f = 1 - p.hp / p.max; L.push({ key: 'pt:' + p.id, label: `${p.hp <= p.max * 0.25 ? 'Rebuild' : p.aged ? 'Renew' : 'Repair'} ${U.lc(IC.APART[p.kind].name)}${p.aged ? ` (${U.pct(p.hp / p.max)} condition)` : ''}`, cost: Math.max(2, IC.partCost(ap, p) * f * 0.6), dur: Math.max(300, IC.partBuildTime(ap, p) * f * 0.7), part: p }); }
  }
  return L;
};
IC.aptQueue = function (S, ap, key) {
  const it = IC.aptRepairList(ap).find(x => x.key === key);
  if (!it || workFor(ap, key) || S.budget < it.cost) return false;
  IC.pay(S, 'repair', it.cost);
  const rrr = IC.hasTech(S, 'l_rrr') && (key.startsWith('cr:') || key.startsWith('tx:')) ? 0.5 : 1;
  const w = { id: IC.nid('w'), key, kind: 'repair', label: it.label, prog: 0, dur: it.dur * rrr, it };
  ap.works.push(w);
  // resurfacing closes the part while it runs
  if (it.wear) { it.part.shut = w.id; ap.dirty = true; ap.cfg = null; }
  IC.emit(S, 'baseWork', { b: ap, key });
  return true;
};
/* old interface kept for the Academy and the inspector buttons */
IC.baseWork = function (S, b, action, arg) {
  if (action === 'crew') { if (S.budget < 20) return false; IC.pay(S, 'repair', 20); b.crews++; IC.log(S, 'info', 'ENG', `${b.name}: another engineer crew assigned.`); return true; }
  if (action === 'repair') { const it = IC.aptRepairList(b).find(x => x.key === arg || (x.part && x.part.id === arg && x.key.startsWith('pt:'))); return it ? IC.aptQueue(S, b, it.key) : false; }
  if (action === 'build') return !!IC.autoPlace(S, b, arg);
  return false;
};
IC.cancelWork = function (S, b, id) {
  const w = b.works.find(x => x.id === id); if (!w) return;
  b.works = b.works.filter(x => x !== w);
  IC.bldRelease(b, w);
  // money already spent on a stage is gone; the rest was never paid
  if (w.kind === 'build') { IC.aptRemove(S, b, w.part.id); if (w.spent) IC.log(S, 'info', 'BUILD', `${b.name}: ${U.lc(w.label)} cancelled; ${U.money(w.spent)} already spent.`); }
};
function autoQueue(S, ap) {
  // runway craters and cut taxiways always; with a Chief Engineer on duty, everything else too
  const all = S.story && S.story.del && S.story.del.eng;
  // resurfacing closes the part, so it is the player's call, unless the pavement is already worn out and closed
  for (const it of IC.aptRepairList(ap)) if ((all || it.key.startsWith('cr:') || it.key.startsWith('tx:')) && !(it.wear && it.part.wear < 1) && !workFor(ap, it.key)) IC.aptQueue(S, ap, it.key);
}
IC.aptAutoQueue = autoQueue;
/* plan a new part: the engineers build it in stages, and each stage is paid for as it runs (builder.js) */
IC.aptPlan = function (S, ap, part, o) {
  o = o || {};
  // a runway's or taxiway's width, its edge lights, a one-way taxiway (the build bar's options)
  if (part.kind === 'taxi' || part.kind === 'runway') { if (o.w) part.w = o.w; if (o.lit === false) part.lit = false; if (o.oneway && part.kind === 'taxi') part.oneway = o.oneway; }
  if (IC.PAVED[part.kind]) part.mat = part.mat || o.mat || 'conc';
  const lock = IC.aptLockWhy(S, part.kind, part.mat);
  if (lock) { IC.log(S, 'warn', 'BUILD', lock); return null; }
  if (o.zone && part.kind !== 'taxi') part.zone = o.zone;
  if (part.kind === 'skybridge') { part.clear = part.clear || o.clear || IC.BRIDGE_CLEAR || 14; part.joins = ap.parts.filter(q => (q.kind === 'terminal' || q.kind === 'cargo') && IC.shapeDepth(IC.partShape(ap, part), IC.partShape(ap, q)) > -0.05).map(q => q.id); }
  if (o.ramp) { part.ramp = true; part.free = part.free || []; }
  if (o.smax && part.kind === 'apron' && !o.ramp) part.smax = o.smax;
  if (part.kind === 'ils') part.cat = IC.aptTechOk(S, 'ils3') ? 3 : 1;
  if (part.kind === 'surface') part.surf = part.surf || o.surf || 'grass';
  const pv = IC.bldPreview(S, ap, part);
  // enough to pay for the survey and a start on the ground: the rest is paid as the work runs
  const start = pv.cost * 0.1;
  if (S.budget < start) { IC.log(S, 'warn', 'BUILD', `Not enough money to start: ${U.money(start)} of ${U.money(pv.cost)} needed now, the rest as the work runs.`); return null; }
  IC.aptAddPart(ap, part, false);
  const w = IC.bldStart(S, ap, part, pv);
  ap.works.push(w);
  IC.aptExtent(ap);
  IC.log(S, 'info', 'BUILD', `${ap.name}: ${U.lc(IC.APART[part.kind].name)} planned (${U.money(pv.cost)} paid as the work runs, about ${U.dur(w.dur)} of engineer work).`);
  IC.emit(S, 'aptPlan', { ap, part });
  // the country's roads keep off the new pavement: the airport's own road goes round to its gate, others under
  if (S.world && IC.aptReseat) IC.aptReseat(S, ap, part);
  return part;
};
/* place a building automatically next to others of its kind (used by quick buttons and the Academy) */
IC.autoPlace = function (S, ap, kind) {
  const D = IC.APART[kind];
  const same = ap.parts.filter(p => p.kind === kind);
  const rw = ap.parts.find(p => p.kind === 'runway');
  const a = rw ? Math.atan2(rw.b.y - rw.a.y, rw.b.x - rw.a.x) : 0;
  const base = same.length ? same[same.length - 1] : ap.parts.find(p => p.kind === 'hangar') || ap;
  for (let k = 1; k < 40; k++) {
    const off = (D.w || 0.3) + 0.12;
    const cand = { x: base.x + Math.cos(a) * off * k * (k % 2 ? 1 : -1) * 0.5, y: base.y + Math.sin(a) * off * k * (k % 2 ? 1 : -1) * 0.5 };
    const part = { kind, x: cand.x, y: cand.y, a: base.a != null ? base.a : a };
    if (!IC.aptCanPlace(S, ap, part)) continue;
    return IC.aptPlan(S, ap, part);
  }
  return null;
};
/* the site has no fixed size: it reaches 6.5 km from the airport's reference point, and 4 km beyond anything built or
   planned, so an airport grows as far as the player builds it out; never nearer another airfield than this one */
IC.SITE_GROW = 40;
IC.aptInSite = function (S, ap, p) {
  const d0 = U.dist(p, ap);
  if (S) for (const b of IC.bases(S)) if (b !== ap && b.parts && U.dist(b, p) < d0) { let db = U.dist(b, p); for (const q of b.parts) db = Math.min(db, partDist(b, q, p)); if (db < 30) return false; }
  if (d0 <= ap.buildR) return true;
  for (const q of ap.parts) if (partDist(ap, q, p) <= IC.SITE_GROW) return true;
  return false;
};
/* on the pavement or a building of an airport: runways keep a 120 m strip clear either side of their edges */
IC.aptOnPart = function (ap, p, pad) {
  for (const q of ap.parts) { const r = q.kind === 'runway' ? 1.2 : q.kind === 'taxi' ? 0.3 : pad == null ? 0.2 : pad; if (partDist(ap, q, p) < r) return q; }
  return null;
};
/* inside the fence: within the airside's outline and not on a terminal's landside */
IC.aptInFence = function (ap, p) {
  const b = IC.aptFence(ap); if (!b) return false;
  return U.inPoly(p.x, p.y, b.hullA) && !b.carveA.some(c => U.inPoly(p.x, p.y, c));
};
/* the perimeter fence: round everything airside with room to spare (the convex hull of it), less the landside in front
   of each terminal and cargo shed, which the public reaches by road. b.poly is the hull, b.carve the landside cut out
   of it; x, y, w, h, a the rectangle along the main runway that holds it all. */
IC.aptFence = function (ap) {
  const key = ap.parts.length + ':' + ap.nodeN + ':' + (ap.land ? ap.land.ver : 0) + ':' + ap.parts.reduce((s, p) => s + (p.x || 0), 0).toFixed(2);
  if (ap._box && ap._boxKey === key) return ap._box;
  // (a landside laid out from data: the fence follows the airside closely, round the landside, IC.aptTraceFence)
  // (and any airport with a landside and a runway: traced, the fence runs round the landside cleanly instead of
  // cutting a rectangle out of a hull)
  if (IC.aptTraceFence && ((ap.land && ap.land.fixed) || (ap.kind === 'airport' && ap.parts.some(p => p.kind === 'runway' && p.built)))) { ap._box = IC.aptTraceFence(ap); ap._boxKey = key; if (ap._box) return ap._box; }
  const pts = [], sq = (q, m) => { pts.push({ x: q.x - m, y: q.y - m }, { x: q.x + m, y: q.y - m }, { x: q.x + m, y: q.y + m }, { x: q.x - m, y: q.y + m }); };
  const fronts = ap.parts.filter(p => (p.kind === 'terminal' || p.kind === 'cargo') && p.w && IC.landEnvelope);
  const carve = [];
  for (const t of fronts) { if (t.kind === 'cargo' && !(ap.land && ap.land.items.some(it => it.by === t.id))) continue; const env = IC.landEnvelope(ap, t); if (IC.landClear && !IC.landClear(ap, t, env)) continue; carve.push(env.poly); }
  const inCarve = p => carve.some(c => U.inPoly(p.x, p.y, c.map(q => [q.x, q.y])));
  for (const p of ap.parts) {
    if (p.kind === 'runway') { const d = rwDir(p), n = { x: -d.y, y: d.x }; for (const e of [p.a, p.b]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) pts.push({ x: e.x + d.x * s1 * 1.2 + n.x * s2 * 1.6, y: e.y + d.y * s1 * 1.2 + n.y * s2 * 1.6 }); }
    else if (p.kind === 'taxi') { for (const id of p.nodes) if (ap.nodes[id]) sq(ap.nodes[id], 0.45); }
    else if (p.kind === 'ils') continue;
    else if (p.x != null) {
      if (p.kind !== 'terminal' && p.kind !== 'cargo' && inCarve(p)) continue;
      const m = p.kind === 'terminal' || p.kind === 'cargo' ? 0 : 0.3;
      for (const c of IC.partOutline ? IC.partOutline(p) : [p]) sq(c, m);
    }
  }
  if (!pts.length) return null;
  // the convex hull (monotone chain)
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  const a = ap.rwyA || 0, c = Math.cos(-a), s = Math.sin(-a);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of hull) { const dx = q.x - ap.x, dy = q.y - ap.y, lx = dx * c - dy * s, ly = dx * s + dy * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  ap._box = { x: ap.x + cx * Math.cos(a) - cy * Math.sin(a), y: ap.y + cx * Math.sin(a) + cy * Math.cos(a), w: x1 - x0, h: y1 - y0, a,
    poly: hull, carve, hullA: hull.map(q => [q.x, q.y]), carveA: carve.map(cv => cv.map(q => [q.x, q.y])) };
  ap._boxKey = key;
  return ap._box;
};
/* the fence line: the hull where it is not landside, and the edges of the landside inside the hull */
IC.aptFenceStroke = function (g, b) {
  g.save(); g.beginPath(); g.rect(-1e6, -1e6, 2e6, 2e6); for (const cv of b.carve) { cv.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); } g.clip('evenodd');
  g.beginPath(); b.poly.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); g.stroke(); g.restore();
  if (!b.carve.length) return;
  g.save(); g.beginPath(); b.poly.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); g.clip();
  g.beginPath(); for (const cv of b.carve) { cv.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); } g.stroke(); g.restore();
};
/* the fence as a canvas path: the hull, and the landside cut out of it (fill with 'evenodd') */
IC.aptFencePath = function (g, b, pad) {
  const P = pad ? IC.polyGrow(b.poly, pad) : b.poly;
  P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath();
  for (const cv of b.carve) { cv.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); }
};

/* inside the country and the site, and not on top of another part (touching is fine) */
IC.aptCanPlace = function (S, ap, part) {
  const pts = part.kind === 'runway' ? [part.a, part.b] : part.kind === 'taxi' || part.kind === 'people' ? part.pts : [part];
  // why not, in words, for the builder (IC.aptPlaceWhy)
  const no = (why, q) => { IC.aptPlaceWhy = why; IC.aptPlaceHit = q || null; return false; };
  IC.aptPlaceWhy = ''; IC.aptPlaceHit = null;
  for (const p of pts) {
    if (!IC.inHome(p.x, p.y)) return no('It crosses the border.');
    if (IC.inLake(p.x, p.y)) return no('It stands in a lake.');
    if (!IC.aptInSite(S, ap, p)) return no(`It leaves ${ap.name}'s site (the green area): keep it inside, or found the airport bigger.`);
  }
  // no part in a river: sample along lines, and the corners of areas
  const wet = p => IC.onRiver && IC.onRiver(p.x, p.y);
  if (part.kind === 'runway' || part.kind === 'taxi') { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(U.dist(a, b) / 0.5); for (let k = 0; k <= n; k++) if (wet({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })) return no('It crosses a river.'); } }
  // taxiways join aprons and buildings at their edge; they do not run through them, nor a new part over a taxiway
  const cover = q => q.kind !== 'taxi' && q.kind !== 'runway' && q.kind !== 'ils' && q.kind !== 'surface' && q.x != null;
  if (part.kind === 'taxi') {
    for (const q of ap.parts) if (cover(q) && taxiThrough(pts, q)) return no(`It runs through ${IC.partName(ap, q)}: a taxiway joins an apron or a building at its edge.`, q);
    return true;
  }
  if (cover(part) && !(IC.APART[part.kind] || {}).over) for (const q of ap.parts) if (q.kind === 'taxi' && q !== part && taxiThrough(q.nodes.map(id => ap.nodes[id]).filter(Boolean), part)) return no(`It covers a taxiway: taxiways meet ${part.kind === 'apron' ? 'aprons' : 'buildings'} at the edge. Plan it beside the taxiway.`, q);
  const D = IC.APART[part.kind];
  // a people mover rides over or under the airport: only its own rules (not across a runway above ground)
  if (part.kind === 'people') { const L = IC.aptPlanOverlaps(S, ap, part); return L.length ? no(`${L[0].text}`, L[0].B.p || null) : true; }
  const probe = Object.assign({ w: D.w, h: D.h, r: D.r }, part);
  const shape = q => q.kind === 'runway' ? { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2, a: Math.atan2(q.b.y - q.a.y, q.b.x - q.a.x), w: rwLen(q), h: q.w || IC.APART.runway.w } : q.r ? { x: q.x, y: q.y, a: 0, w: q.r * 2, h: q.r * 2 } : q;
  const A = shape(probe);
  if (part.kind !== 'runway') for (const [sx, sy] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) if (wet(toWorld(A, sx * A.w / 2, sy * A.h / 2))) return no('It stands in a river.');
  // (by their real shapes: an L-shaped terminal or a round tank is not its bounding box)
  const mine = IC.partShape ? IC.partShape(ap, probe) : null;
  for (const q of ap.parts) {
    if (q === part || q.kind === 'ils' || q.kind === 'surface' || probe.kind === 'surface') continue;
    // runways cross runways; everything else keeps off them
    if (q.kind === 'runway' && probe.kind === 'runway') continue;
    // a building may not stand on a taxiway (aprons and pads meet taxiways at their edges)
    if (q.kind === 'people' || (D.over && (q.kind === 'terminal' || q.kind === 'cargo'))) continue;
    if (q.kind === 'taxi') { if (mine && !IC.PAVED[probe.kind] && !D.pad && !D.over && IC.shapeDepth(mine, IC.partShape(ap, q)) > 0.02) return no(`It stands on ${q.name ? 'taxiway ' + q.name : 'a taxiway'}: move it clear of the pavement.`, q); continue; }
    if (mine ? IC.shapeDepth(mine, IC.partShape(ap, q)) > 0.01 : rectsOverlap(A, shape(q), 0.01)) return no(`It overlaps ${IC.partName(ap, q)}${q.built ? '' : ' (being built)'}: move it, or bulldoze that first.`, q);
  }
  // roads, car parks and the landside round the airport
  if (S && S.world && IC.aptPlanOverlaps) { const L = IC.aptPlanOverlaps(S, ap, Object.assign({ _probe: true }, probe)); if (L.length) { const o = L[0], other = o.A.name === `the new ${U.lc(D.name)}` ? o.B : o.A; return no(`${o.text} Move it clear.`, other.p || other.it || other.r || other.l || null); } }
  return true;
};
/* a taxiway line runs more than 8 m inside a part (a round tank by its radius) */
function taxiThrough(pts, q) {
  const D = IC.APART[q.kind] || {}, r = q.r || D.r, w = q.w || D.w, h = q.h || D.h, R = r || Math.hypot(w || 0, h || 0) / 2;
  if (!R) return false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (U.segDist(q.x, q.y, a.x, a.y, b.x, b.y) > R) continue;
    const n = Math.max(1, Math.ceil(U.dist(a, b) / 0.05));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n };
      if (r ? U.dist(p, q) < r - 0.08 : (l => Math.abs(l.x) < w / 2 - 0.08 && Math.abs(l.y) < h / 2 - 0.08)(toLocal({ x: q.x, y: q.y, a: q.a || 0 }, p))) return true;
    }
  }
  return false;
}
/* a part in words: a runway by its name, the rest by kind, numbered when there are several ("Apron 2") */
IC.partName = function (ap, q) {
  if (q.kind === 'runway') return q.name || 'the runway';
  if (q.name && q.kind !== 'taxi') return q.name;   // (a building named in the data, or by the player)
  const D = IC.APART[q.kind] || { name: q.kind }, same = ap.parts.filter(p => p.kind === q.kind), i = same.indexOf(q);
  return same.length > 1 && i >= 0 ? `${D.name} ${i + 1}` : `the ${U.lc(D.name)}`;
};
/* two rotated rectangles overlap by more than a margin (separating axis test) */
function rectsOverlap(A, B, m) {
  const corners = R => { const c = Math.cos(R.a || 0), s = Math.sin(R.a || 0), hw = R.w / 2 - m, hh = R.h / 2 - m; return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: R.x + x * c - y * s, y: R.y + x * s + y * c })); };
  const ca = corners(A), cb = corners(B);
  for (const R of [A, B]) for (const ang of [R.a || 0, (R.a || 0) + Math.PI / 2]) {
    const ax = Math.cos(ang), ay = Math.sin(ang);
    const pa = ca.map(p => p.x * ax + p.y * ay), pb = cb.map(p => p.x * ax + p.y * ay);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}
IC.rectsOverlap = rectsOverlap;

IC.updateBases = function (S, dt) {
  if (S.later) { const due = S.later.filter(l => l.t <= S.time); S.later = S.later.filter(l => l.t > S.time); for (const l of due) l.fn(); }
  for (const b of IC.bases(S)) {
    if (!b.parts || b.owner !== 'us') continue;
    IC.bldTick(S, b, dt);
    // each crew takes the next job it can work on: builds wait for money, materials or night without holding a crew
    let n = 0;
    for (const w of b.works) {
      if (n >= b.crews) { if (w.stages) w.wait = 'queued: every crew is busy'; continue; }
      if (w.stages) { if (!IC.bldAdvance(S, b, w, dt)) continue; }
      else w.prog += dt / w.dur;
      n++;
      if (w.prog < 1) continue;
      w.done = true;
      IC.bldRelease(b, w);
      if (w.kind === 'upgrade') { if (w.mat) w.part.mat = w.mat; if (w.w) w.part.w = w.w; if (w.lit != null) w.part.lit = w.lit; w.part.wear = 0; w.part.hp = w.part.max; IC.log(S, 'info', 'BUILD', `${b.name}: ${U.lc(w.label)} done; open again.`, w.part.x != null ? w.part : b); }
      else if (w.kind === 'build') {
        const before = IC.bldSnapStats(b);
        w.part.built = true; w.part.prog = 1; w.part.stage = null;
        if (w.part.kind === 'runway' || w.part.kind === 'apron' || w.part.kind === 'alert') resolveFor(b, w.part);
        if (w.part.kind === 'apron' || DOOR(w.part.kind)) IC.aptAutoJoin(b, w.part);
        if (w.part.kind === 'taxi') for (const q of b.parts) if (q.built && (q.kind === 'apron' || DOOR(q.kind))) IC.aptAutoJoin(b, q);
        IC.aptExtent(b); IC.log(S, 'info', 'BUILD', `${b.name}: ${w.part.kind === 'runway' ? w.part.name || 'runway' : U.lc(IC.APART[w.part.kind].name)} complete.`, w.part.x != null ? w.part : b); IC.emit(S, 'aptBuilt', { ap: b, part: w.part });
        b.dirty = true; IC.bldOpened(S, b, w, before); }
      else {
        const it = w.it;
        if (it.wear) it.part.wear = 0;
        else if (it.crater) it.part.craters = it.part.craters.filter(c => c !== it.crater);
        else if (it.seg != null) delete it.part.cut[it.seg];
        else if (it.stand) it.stand.hp = 1;
        else { it.part.hp = it.part.max; it.part.burning = 0; it.part.scorch = null; }
        IC.emit(S, 'baseWorkDone', { b, w });
      }
      b.dirty = true;
    }
    for (const w of b.works) if (w.kind === 'build' && !w.done) w.part.prog = w.prog;
    if (b.works.some(w => w.done)) { b.works = b.works.filter(w => !w.done); b.dirty = true; IC.aptStats(S, b); if (b.kind === 'airbase') IC.assignSlots(S, b); }
    // burning fuel spreads to whatever stands close by
    for (const p of b.parts) {
      if (!(p.burning > 0)) continue;
      p.burning -= dt;
      for (const q of b.parts) {
        if (q === p || !q.built || q.kind === 'runway' || q.kind === 'taxi' || q.kind === 'apron') continue;
        const d = partDist(b, q, p);
        if (d > 1.6) continue;
        const was = q.hp;
        // (by its size: a fuel farm of three tanks burns down as fast as one tank did)
        q.hp = Math.max(0, q.hp - dt / 60 * (q.kind === 'fuel' ? q.max * 0.225 : 4) * (1 - d / 1.6));
        if (was > q.max * 0.25 && q.hp <= q.max * 0.25) {
          IC.log(S, 'leak', 'FIRE', `${b.name}: fire spreads to the ${U.lc(IC.APART[q.kind].name)}.`, q);
          if (q.kind === 'fuel') { q.burning = 5400; q.stock = 0; IC.explode(S, q.x, q.y, 1.6, 'ground'); IC.addFire(S, q.x, q.y, 1.6, 8000); }
          b.dirty = true;
        }
      }
    }
    // fuel arrives by road and pipeline: each tank at its own rate, and a hydrant system's pipeline shares out more
    // (one pass over the parts: a big airport has hundreds, and this runs every step)
    let nT = 0, pipe = 0;
    const tank = p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25;
    for (const p of b.parts) { if (tank(p)) nT += IC.fuelTanks(p); else if (p.kind === 'hydrant' && p.built && p.hp > p.max * 0.25) pipe = IC.APART.hydrant.pipe; }
    if (nT) for (const t of b.parts) if (tank(t)) t.stock = Math.min(IC.fuelCap(t), (t.stock || 0) + (IC.FUEL_IN + (nT ? pipe / nT : 0)) * IC.fuelTanks(t) * dt / 3600);
    // a fire drill each morning from 10:00: the trucks run to a runway end and back, and the panel times them
    const day = Math.floor(S.time / 86400);
    if (b.drillD !== day && (S.time % 86400) >= 36000 && !(b.fireRun && S.time < b.fireRun.home)) {
      b.drillD = day;
      const rw = b.parts.find(p => p.kind === 'runway' && p.built && p.hp > 0);
      if (rw) IC.fireRun(S, b, rwAt(rw, U.hash(day, 7) < 0.5 ? 0 : 1), 'drill');
    }
    if (IC.landsideTick) IC.landsideTick(S, b, dt);
    b.statT = (b.statT || 0) - dt;
    if (b.statT <= 0 || b.dirty) { b.statT = 60; IC.aptStats(S, b); }
    // engineers come back to jobs that could not be paid for at the time
    b.aqT = (b.aqT || 0) - dt;
    if (b.aqT <= 0) { b.aqT = 180; if (b.autoRepair && !b.locked) autoQueue(S, b); }
    let tot = 0, cur = 0;
    for (const p of b.parts) { tot += p.built ? p.max : 0; cur += p.built ? p.hp : 0; }
    b.hp = b.max * (tot ? cur / tot : 1);
    b.offline = b.kind === 'airport' && !IC.baseStatus(S, b).runway;
  }
};
/* fuel for one departure; false when the tanks are empty or, without a hydrant system, every fuel truck is busy */
IC.aptTakeFuel = function (ap, n, S) {
  const tanks = ap.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25 && p.stock > 0).sort((a, b) => b.stock - a.stock);
  if (tanks.reduce((s, t) => s + t.stock, 0) < n) return false;
  // military bowsers are the air wing's own; airline refuelling waits for the airport's trucks
  const now = S && S.time;
  if (S && !(ap.st && ap.st.hydrant)) {
    const L = ap.trucks = (ap.trucks || []).filter(t => now - t < 3600);
    const cap = ap.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25).reduce((s, t) => s + IC.fuelTanks(t), 0) * IC.FUEL_TRUCKS;
    // every truck busy: with a fuel stand the aircraft taxis there on its way out (groundops.js); without, it waits
    if (L.length >= cap) {
      if (!ap.parts.some(p => p.kind === 'fuelpad' && p.built && p.hp > p.max * 0.25 && p.linked !== false)) { ap.truckWait = now; return false; }
      ap.padNext = now;
    } else L.push(now);
  }
  let need = n;
  for (const t of tanks) { const q = Math.min(need, t.stock); t.stock -= q; need -= q; if (need <= 0) break; }
  return need <= 0;
};

/* ---------- the editor: snapping and planning ---------- */
/* airport-local coordinates (x along the main runway) to world */
IC.aptLocal = (ap, lx, ly) => { const a = ap.rwyA || 0, c = Math.cos(a), s = Math.sin(a); return { x: ap.x + lx * c - ly * s, y: ap.y + lx * s + ly * c }; };
/* where a click lands on the network: an existing node, a runway, an apron edge, a taxiway segment, or open ground */
IC.aptSnap = function (ap, p, tol) {
  // the click tolerance follows the zoom, but never reaches further than a few tens of metres
  tol = Math.min(tol || 0.12, 0.35);
  let best = null, bd = tol;
  for (const n of Object.values(ap.nodes)) { const d = U.dist(n, p); if (d < bd) { bd = d; best = { kind: 'node', node: n.id, x: n.x, y: n.y }; } }
  if (best) return best;
  for (const q of ap.parts) {
    if (q.kind !== 'runway') continue;
    const L = rwLen(q), t = rwT(q, p), off = Math.abs(rwOff(q, p));
    if (t < -0.02 || t > 1.02 || off > q.w / 2 + Math.min(tol, 0.1)) continue;
    // runway ends snap exactly
    const tt = t * L < 0.6 ? 0 : (1 - t) * L < 0.6 ? 1 : U.clamp(t, 0, 1);
    const c = rwAt(q, tt);
    return { kind: 'rwy', part: q.id, t: tt, x: c.x, y: c.y };
  }
  for (const q of ap.parts) {
    if (q.kind !== 'taxi') continue;
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]];
      const d = U.segDist(p.x, p.y, a.x, a.y, b.x, b.y);
      if (d < q.w / 2 + Math.min(tol * 0.6, 0.15)) {
        const L = U.dist(a, b) || 1, f = U.clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L), 0.05, 0.95);
        return { kind: 'taxi', part: q.id, seg: i, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
  }
  for (const q of ap.parts) {
    if (q.kind !== 'apron' && q.kind !== 'alert') continue;
    const l = toLocal(q, p), et = Math.min(tol, 0.2);
    if (Math.abs(l.x) > q.w / 2 + et || Math.abs(l.y) > q.h / 2 + et) continue;
    // only near an edge: a click in the middle of an apron is not a connection
    if (Math.abs(l.x) < q.w / 2 - et && Math.abs(l.y) < q.h / 2 - et) continue;
    // project onto the nearest edge
    const dx = q.w / 2 - Math.abs(l.x), dy = q.h / 2 - Math.abs(l.y);
    const e = dx < dy ? toWorld(q, Math.sign(l.x || 1) * q.w / 2, U.clamp(l.y, -q.h / 2, q.h / 2)) : toWorld(q, U.clamp(l.x, -q.w / 2, q.w / 2), Math.sign(l.y || 1) * q.h / 2);
    return { kind: 'apron', part: q.id, x: e.x, y: e.y };
  }
  return { kind: 'free', x: p.x, y: p.y };
};
/* turn a snap into a node id, splitting a taxiway if the point lands on one */
function nodeFor(ap, s) {
  if (s.kind === 'node') return s.node;
  const id = IC.aptNode(ap, s.x, s.y);
  if (s.kind === 'taxi') {
    const q = ap.parts.find(x => x.id === s.part);
    const cut = {}; for (const k in q.cut) cut[+k >= s.seg ? +k + 1 : +k] = true;
    if (q.cut[s.seg]) cut[s.seg] = true;
    q.nodes.splice(s.seg, 0, id); q.cut = cut;
    ap.dirty = true;
  }
  return id;
}
/* an apron or shelter built beside an existing taxiway joins it where they touch */
IC.aptAutoJoin = function (ap, part) {
  const shelter = part.kind === 'hangar' || part.kind === 'has' || !!IC.APART[part.kind].pad;
  const door = shelter ? [toWorld(part, 0, -part.h / 2 - 0.05), toWorld(part, 0, part.h / 2 + 0.05)] : null;
  for (const q of ap.parts) {
    if (q.kind !== 'taxi' || q === part) continue;
    const splits = [];
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]], L = U.dist(a, b);
      if (L < 0.2) continue;
      if (shelter) {
        // already reachable from an existing node?
        if (door.some(d => Object.values(ap.nodes).some(n => U.dist(n, d) < 0.5))) return;
        for (const d of door) {
          const f = U.clamp(((d.x - a.x) * (b.x - a.x) + (d.y - a.y) * (b.y - a.y)) / (L * L), 0.03, 0.97);
          const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
          if (U.dist(p, d) < 0.45) { splits.push({ seg: i, f, x: p.x, y: p.y }); break; }
        }
        continue;
      }
      // aprons: find stretches of the segment that run along the apron edge
      const K = Math.max(4, Math.ceil(L / 0.25)), run = [];
      for (let k = 0; k <= K; k++) { const f = 0.03 + 0.94 * k / K, p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; if (rectDist(part, p) < 0.14) run.push(f); }
      if (!run.length) continue;
      if (onAp(a, part.id) || onAp(b, part.id)) continue;
      const fs = run.length * (L / K) > 3 ? [run[0], run[run.length - 1]] : [run[Math.floor(run.length / 2)]];
      for (const f of fs) splits.push({ seg: i, f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    // split from the end backwards so segment numbers stay valid
    splits.sort((p, r) => r.seg - p.seg || r.f - p.f);
    for (const s of splits) nodeFor(ap, { kind: 'taxi', part: q.id, seg: s.seg, x: s.x, y: s.y });
  }
  IC.resolveNodes(ap);
  ap.dirty = true;
};
/* plan a taxiway through a list of world points (each is snapped) */
IC.aptPlanTaxi = function (S, ap, pts, tol, o) {
  if (pts.length < 2) return null;
  const snaps = pts.map(p => IC.aptSnap(ap, p, o && o.exact ? 0.03 : tol)).filter((s, i, L) => i === 0 || U.dist(s, L[i - 1]) > 0.05);
  if (snaps.length < 2) return null;
  for (const s of snaps) if (!IC.inHome(s.x, s.y) || IC.inLake(s.x, s.y) || !IC.aptInSite(S, ap, s)) { IC.log(S, 'warn', 'BUILD', 'That taxiway leaves the airport site.'); return null; }
  const probe = { kind: 'taxi', pts: snaps, mat: o && o.mat, w: o && o.w, lit: o && o.lit };
  if (S.budget < IC.partCost(ap, probe) * 0.1) { IC.log(S, 'warn', 'BUILD', `Not enough money to start: ${U.money(IC.partCost(ap, probe) * 0.1)} needed now.`); return null; }
  const ids = snaps.map(s => nodeFor(ap, s));
  const clean = ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
  if (clean.length < 2) return null;
  return IC.aptPlan(S, ap, { kind: 'taxi', nodes: clean }, o);
};
/* plan a runway from a to b */
IC.aptPlanRunway = function (S, ap, a, b, name, o) {
  const part = { kind: 'runway', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, name: name || `Runway ${ap.parts.filter(p => p.kind === 'runway').length + 1}` };
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', 'A runway cannot go there: it leaves the site or runs into a building.'); return null; }
  const r = IC.aptPlan(S, ap, part, o);
  if (r && !name) { nameRunways(ap); r.name = rwName(r); }
  return r;
};
/* plan a people mover along points; lv −1 in a tunnel, 1 on a viaduct */
IC.aptPlanMover = function (S, ap, pts, lv, o) {
  const part = { kind: 'people', pts: pts.map(q => ({ x: q.x, y: q.y })), lv: lv == null ? 1 : lv, w: IC.APART.people.w };
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', IC.aptPlaceWhy || 'The people mover cannot go there.'); return null; }
  part.stops = ap.parts.filter(q => q.kind === 'terminal' && [part.pts[0], part.pts[part.pts.length - 1]].some(e => partDist(ap, q, e) < 0.5)).map(q => q.id);
  return IC.aptPlan(S, ap, part, o);
};
/* plan an area or building; area parts take w and h */
IC.aptPlanPart = function (S, ap, kind, x, y, a, w, h, o) {
  const D = IC.APART[kind];
  const part = { kind, x, y, a: a != null ? a : ap.rwyA || 0 };
  if (D.area) { part.w = w; part.h = h; }
  // a landing system serves the runway end nearest the click
  if (kind === 'ils') {
    let bd = 1e9;
    for (const rw of ap.parts.filter(q => q.kind === 'runway')) for (const e of ['a', 'b']) { const d = U.dist(rw[e], { x, y }); if (d < bd) { bd = d; part.rw = rw.id; part.end = e; } }
    if (!part.rw || bd > 12) { IC.log(S, 'warn', 'BUILD', 'Place a landing system near the runway end it should serve.'); return null; }
    if (ap.parts.some(q => q.kind === 'ils' && q.rw === part.rw && q.end === part.end)) { IC.log(S, 'warn', 'BUILD', 'That runway end already has a landing system.'); return null; }
    placeILS(ap, part);
    return IC.aptPlan(S, ap, part, o);
  }
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', `The ${U.lc(D.name)} does not fit there: it overlaps another part or leaves the site.`); return null; }
  return IC.aptPlan(S, ap, part, o);
};
/* why a part cannot be bulldozed now: aircraft parked on an apron or inside a hangar would be left nowhere */
IC.aptRemoveBlock = function (S, ap, p) {
  const parked = IC.aptStands ? IC.aptStands(ap).filter(s => s.apron === p.id && s.occ).length : 0;
  if (parked) return `${parked} aircraft ${parked > 1 ? 'are' : 'is'} parked on it. Close its stands or wait until they leave, then bulldoze it.`;
  if (p.kind === 'hangar' && ((p.inside || []).length || p.coming)) return 'An aircraft is in it for maintenance, or being towed in. Bulldoze it once the hangar is empty.';
  return '';
};
/* bulldoze: remove a part (refund part of an unbuilt one); a runway takes its landing systems with it */
IC.aptRemove = function (S, ap, id) {
  const p = ap.parts.find(x => x.id === id); if (!p) return false;
  const why = p.built ? IC.aptRemoveBlock(S, ap, p) : '';
  if (why) { IC.log(S, 'warn', 'BUILD', `${ap.name}: the ${(IC.APART[p.kind] || {}).name ? U.lc(IC.APART[p.kind].name) : p.kind} cannot be bulldozed yet. ${why}`, ap); return false; }
  const gone = ap.parts.filter(x => x === p || (p.kind === 'runway' && x.kind === 'ils' && x.rw === p.id));
  for (const w of ap.works.filter(x => gone.includes(x.part) || (x.it && gone.includes(x.it.part)))) { ap.works = ap.works.filter(x => x !== w); IC.bldRelease(ap, w); }
  ap.parts = ap.parts.filter(x => !gone.includes(x));
  if (p.kind === 'runway' || p.kind === 'apron' || p.kind === 'alert') IC.resolveNodes(ap);
  // drop nodes nothing uses any more
  const used = new Set(); for (const q of ap.parts) if (q.kind === 'taxi') for (const n of q.nodes) used.add(n);
  for (const id2 of Object.keys(ap.nodes)) if (!used.has(id2)) delete ap.nodes[id2];
  ap.dirty = true; IC.aptStats(S, ap);
  return true;
};

/* ---------- new airports ---------- */
IC.FOUND_COST = 80;
IC.foundCheck = function (S, x, y) {
  if (!IC.inHome(x, y) || IC.inLake(x, y)) return 'Outside the country.';
  if (S.world.slopeAt && S.world.slopeAt(x, y) > 0.08) return 'Too hilly for a runway.';
  const near = IC.bases(S).find(b => U.dist(b, { x, y }) < 120);
  if (near) return `Too close to ${near.name}: their circuits would overlap (12 km at least).`;
  // at the edge of a town is fine, with homes to clear; not in the middle of it
  const c = IC.cities(S).find(c => U.dist(c, { x, y }) < c.r * 0.5);
  if (c) return `In the middle of ${c.name}: pick a site at the edge of town or beyond.`;
  // not under another airport's approach and departure paths, nor under its busy airways (growth.js)
  const clash = IC.siteConflict && IC.siteConflict(S, x, y);
  if (clash) return clash;
  if (S.budget < IC.FOUND_COST) return `Needs ${U.money(IC.FOUND_COST)}.`;
  return '';
};
/* a new airport at x, y with its main runway at heading a (world radians), after a site survey */
IC.foundAirport = function (S, x, y, a) {
  const why = IC.foundCheck(S, x, y);
  if (why) { IC.log(S, 'warn', 'BUILD', why); IC.text(S, x, y, why.toUpperCase().replace(/\.$/, ''), IC.C.hostile); return null; }
  const sv = IC.foundSurvey(S, x, y, a != null ? a : IC.PREVAIL);
  if (S.budget < sv.cost) { IC.log(S, 'warn', 'BUILD', `The site costs ${U.money(sv.cost)} with land and levelling.`); return null; }
  if (sv.river) { IC.log(S, 'warn', 'BUILD', 'A river crosses the runway line: turn the runway or pick another site.'); IC.text(S, x, y, 'A RIVER CROSSES THE RUNWAY LINE', IC.C.hostile); return null; }
  S.budget -= sv.cost;
  const city = IC.cities(S).slice().sort((a, b) => U.dist(a, { x, y }) - U.dist(b, { x, y }))[0];
  const n = S.infra.filter(i => i.kind === 'airport').length;
  const ap = { id: 'apt' + n + IC.nid(''), kind: 'airport', name: `${city ? city.name : 'New'} ${S.infra.some(i => i.name === (city ? city.name : 'New') + ' Airport') ? 'Field' : 'Airport'}`, x, y, owner: 'us', infra: true, r: 50, max: 150, hp: 150, city: city && city.id, inv: {}, inc: {} };
  ap.rwyA = sv.a;
  IC.initAirport(ap);
  ap.template = 'new'; ap.crews = 1; ap.works = []; ap.autoRepair = true; ap.survey = sv; ap.mat = { asph: 0, conc: 0, steel: 0 };
  S.infra.push(ap); S.byId[ap.id] = ap;
  IC.aptStats(S, ap);
  // (the story names it before anyone else mentions it: the national airport is the capital's International)
  IC.emit(S, 'naming', ap);
  // noise: towns under the flight paths object, the more homes the louder
  for (const [name, n] of Object.entries(sv.noise)) {
    const c = IC.cities(S).find(q => q.name === name);
    S.support = Math.max(0, S.support - Math.min(5, 0.5 + n * 0.03));
    if (c) c.morale = Math.max(0, c.morale - Math.min(8, 1 + n * 0.05));
    IC.log(S, 'warn', 'AVIATION', `Residents of ${name} protest: ${n} blocks lie under the flight paths of runway ${sv.name}.`, c || ap);
  }
  IC.log(S, 'info', 'AVIATION', `${ap.name} founded (${U.money(sv.cost)} with land and levelling), runway heading ${sv.name}. Lay a runway, a taxiway, an apron and a terminal before airlines will come.`, ap);
  IC.emit(S, 'founded', ap);
  return ap;
};

/* ---------- starting layouts ---------- */
IC.layoutAirport = function (ap, template, a) {
  IC.initAirport(ap);
  const ca = Math.cos(a), sa = Math.sin(a);
  const W = (lx, ly) => ({ x: ap.x + lx * ca - ly * sa, y: ap.y + lx * sa + ly * ca });
  const N = (lx, ly) => nodeFor(ap, IC.aptSnap(ap, W(lx, ly), 0.03));
  const rw = (x0, x1, ly, name) => typeof name === 'number' ? IC.aptAddPart(ap, { kind: 'runway', a: W(x0, x1), b: W(ly, name) }, true) : IC.aptAddPart(ap, { kind: 'runway', a: W(x0, ly), b: W(x1, ly), name }, true);
  const tx = pts => IC.aptAddPart(ap, { kind: 'taxi', nodes: pts.map(([x, y]) => N(x, y)) }, true);
  const rect = (kind, lx, ly, w, h) => { const c = W(lx, ly); return IC.aptAddPart(ap, { kind, x: c.x, y: c.y, w, h, a }, true); };
  const bld = (kind, lx, ly, rot) => { const c = W(lx, ly); return IC.aptAddPart(ap, { kind, x: c.x, y: c.y, a: a + (rot || 0) }, true); };
  // (an air base keeps single tanks, spread out or, on a run-down base, clustered)
  const tank = (lx, ly) => { const c = W(lx, ly); return IC.aptAddPart(ap, { kind: 'fuel', x: c.x, y: c.y, a, r: 0.13 }, true); };
  const ils = (r, ends) => { for (const e of ends) IC.aptAddPart(ap, { kind: 'ils', rw: r.id, end: e }, true); };
  const zone = (p, z) => { p.zone = z; return p; };
  const nm = (i) => { const h = Math.round(((a * 180 / Math.PI + 360) % 180) / 10) || 18; const x = String(h).padStart(2, '0'), y = String((h + 18) % 36 || 36).padStart(2, '0'); return `Runway ${x}/${y}${i ? ' ' + 'LR'[i - 1] : ''}`; };
  if (template === 'intl') {
    ils(rw(-17, 17, 0, nm()), ['a', 'b']);
    tx([[-16.8, 1.8], [-12, 1.8], [-8, 1.8], [-4, 1.8], [0, 1.8], [4, 1.8], [8, 1.8], [12, 1.8], [16.8, 1.8]]);
    for (const x of [-16.8, -8, 0, 8, 16.8]) tx([[x, 0], [x, 1.8]]);
    tx([[-4, 1.8], [-4, 2.75]]); tx([[4, 1.8], [4, 2.8]]); tx([[12, 1.8], [12, 2.75]]);
    rect('apron', -3.5, 3.4, 6, 1.3); rect('apron', 5, 3.28, 8, 0.96); rect('apron', 13.5, 3.4, 3, 1.3);
    rect('terminal', 1, 4.7, 12, 1.0); rect('cargo', 13.5, 4.6, 3, 0.8);
    // a remote apron for overnight parking, south of the runway
    tx([[-12, 0], [-12, -1.6]]); rect('apron', -12, -2.1, 4.6, 0.96);
    bld('fuel', -11.8, 4.9);
    bld('tower', 3.5, 5.7); bld('fire', 0, -3.2); bld('atc', -8, -3.2);
    bld('hangar', -9.2, 3.6); bld('hangar', -8.3, 3.6);
    tx([[-8, 1.8], [-8.75, 3.25]]);
  } else if (template === 'regional_bad') {
    // one stub in the middle of the runway: every departure backtracks, every landing blocks the runway for minutes
    rw(-12, 12, 0, nm());
    tx([[2, 0], [2, 1.75]]);
    rect('apron', 2, 2.22, 1.5, 0.95);
    rect('terminal', 2, 3.05, 1.8, 0.55);
    bld('fuel', 4.2, 2.8); bld('tower', 0.6, 2.7); bld('fire', 0, -1.2);
  } else if (template === 'regional_ok') {
    ils(rw(-13, 13, 0, nm()), ['a']);
    tx([[-12.8, 1.7], [-6, 1.7], [0, 1.7], [6, 1.7]]);
    tx([[-12.8, 0], [-12.8, 1.7]]); tx([[6, 0], [6, 1.7]]); tx([[0, 1.7], [0, 2.25]]); tx([[-6, 1.7], [-6, 2.25]]);
    rect('apron', 0, 2.72, 3.2, 0.95); rect('terminal', 0, 3.6, 3.2, 0.7);
    bld('fuel', 4.6, 3.6); bld('tower', -2.4, 3.1); bld('fire', -3, -1.2); bld('hangar', -6, 2.6);
  } else if (template === 'mil_mothball') {
    // a half-closed base: a parallel taxiway to one end only, clustered fuel, no shelters, no alert pad
    rw(-13, 13, 0, nm());
    tx([[-12.8, 0], [-12.8, -1.6], [-9, -1.6], [-6, -1.6], [-3, -1.6], [0, -1.6], [0, 0]]);
    tx([[-6, -1.6], [-6, -2.6]]); tx([[-9, -1.6], [-9, -2.12]]);
    rect('apron', -9, -2.55, 2.5, 0.86);
    bld('hangar', -6.4, -2.95); bld('hangar', -5.6, -2.95);
    tank(-10.3, -3.8); tank(-10.0, -4.15);
    bld('tower', -2.2, -2.8); bld('fire', 1.2, -1.3);
  } else if (template === 'mil_full') {
    rw(-15, 15, 0, nm());
    tx([[-14.8, 0], [-14.8, -1.7], [-10, -1.7], [-5, -1.7], [0, -1.7], [5, -1.7], [10, -1.7], [14.8, -1.7], [14.8, 0]]);
    tx([[0, -1.7], [0, 0]]); tx([[-7.5, -1.7], [-7.5, -3.2]]); tx([[7.5, -1.7], [7.5, -3.2]]);
    for (const x of [-9, -6, 6, 9]) { tx([[x, -1.7], [x, -2.6]]); bld('has', x, -2.8); }
    rect('apron', -7.5, -3.62, 2.5, 0.86); rect('apron', 7.5, -3.62, 2.5, 0.86);
    bld('hangar', -2.5, -3.2); bld('hangar', 2.5, -3.2);
    tx([[-2.5, -1.7], [-2.5, -2.9]]); tx([[2.5, -1.7], [2.5, -2.9]]);
    rect('alert', -15.6, -1.0, 0.42, 0.3);
    tank(-12, -4.5); tank(-4, -5.2); tank(11, -4.6);
    bld('ammo', 0, -7); bld('tower', 1.2, -3.8); bld('fire', -1.2, 1.3);
    tx([[-14.8, -1.7], [-15.6, -1.15]]);
  } else if (template === 'kden' || template === 'kden6') {
    // the real Denver (airports-real-data.js), turned so its first runway lies along a; 'kden6' is the six-runway
    // layout built in code, kept for the engine's capacity test (the real one's outer runways cross the inner ones)
    const L = template === 'kden' && IC.REAL_APT && IC.REAL_APT.kden;
    if (L) { const r0 = L.runways[0], la = Math.atan2(r0.b[1] - r0.a[1], r0.b[0] - r0.a[0]); IC.aptFromLayout(ap, L, { x: ap.x, y: ap.y, rot: a - la }); ap.template = 'kden'; return; }
    layoutKden(ap, { rw, tx, rect, bld, ils, zone });
  }
  IC.resolveNodes(ap);
  for (const p of ap.parts) if (p.kind === 'apron' || p.kind === 'hangar' || p.kind === 'has' || p.kind === 'alert') IC.aptAutoJoin(ap, p);
  ap.dirty = true;
  ap.template = template;
  const r0 = ap.parts.find(p => p.kind === 'runway');
  ap.rwyA = a; ap.rwyL = r0 ? IC.rwLen(r0) : 20;
  if (IC.aptAutoLinks) IC.aptAutoLinks(ap);
  IC.aptExtent(ap);
};
/* A Denver-sized airport drawn in code: six runways in a pinwheel round three concourses, end-around taxiways, one-way
   lanes between the concourses, cargo, light-aircraft and military ramps. Superseded by the real Denver from map data
   (IC.REAL_APT.kden, brief 39); kept only for a build without the data file. Local x runs along the first runway. */
function layoutKden(ap, L) {
  const { rw, tx, rect, bld, ils, zone } = L;
  ap.buildR = Math.max(ap.buildR, 62);
  const R = [rw(6, 42, -26), rw(-42, -6, 26), rw(-30, -36, -30, 0), rw(-20, -36, -20, 0), rw(20, 0, 20, 36), rw(30, 0, 30, 48)];
  for (const r of R) ils(r, ['a', 'b']);
  const ys = (y0, y1, step) => { const o = []; for (let y = y0; y <= y1 + 1e-6; y += step) o.push(y); return o; };
  const line = (x0, y0, x1, y1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; };
  // west pair: a full-length parallel taxiway for each, crossings of the inner runway and an end-around taxiway
  tx(line(-17, -36, -17, 0, 6)); tx(line(-25, -36, -25, 0, 6));
  for (const y of ys(-36, 0, 6)) { tx([[-17, y], [-20, y]]); tx([[-25, y], [-30, y]]); }
  for (const y of [-30, -12]) tx([[-25, y], [-20, y]]);
  tx([[-25, 0], [-25, 3], [-17, 3], [-17, 0]]);
  // east pair, the same the other way round
  tx(line(17, 0, 17, 36, 6)); tx(line(25, 0, 25, 48, 8));
  for (const y of ys(0, 36, 6)) tx([[17, y], [20, y]]);
  for (const y of ys(0, 48, 6)) tx([[25, y], [30, y]]);
  for (const y of [12, 30]) tx([[25, y], [20, y]]);
  tx([[25, 0], [25, -3], [17, -3], [17, 0]]);
  // the east-west runways: north-east and south-west
  tx(line(-17, -23, 42, -23, 10)); for (const x of ys(6, 42, 6)) tx([[x, -23], [x, -26]]);
  tx(line(-42, 23, 17, 23, 10)); for (const x of ys(-42, -6, 6)) tx([[x, 23], [x, 26]]);
  // perimeter taxiways round the terminal complex, and links out to the runways
  tx(line(-11, -23, -11, 23, 8)); tx(line(11, -23, 11, 23, 8));
  for (const y of [-18, -6, 0]) tx([[-17, y], [-11, y]]);
  for (const y of [-3, 6, 18]) tx([[11, y], [17, y]]);
  // three concourses with aprons both sides; the lanes between them run one way each
  const con = [{ y: -8, n: 0.85, s: 0.85 }, { y: -2, n: 1.3, s: 0.85 }, { y: 4, n: 1.3, s: 1.3 }];
  const lanes = [];
  for (const c of con) {
    rect('terminal', 0, c.y, 14, 0.5);
    rect('apron', 0, c.y - 0.25 - c.n / 2, 14, c.n); rect('apron', 0, c.y + 0.25 + c.s / 2, 14, c.s);
    lanes.push(c.y - 0.25 - c.n - 0.05, c.y + 0.25 + c.s + 0.05);
  }
  const laneX = [-11, -7, -3.5, 0, 3.5, 7, 11];
  lanes.forEach((y, i) => {
    const t = tx(laneX.map(x => [x, y]));
    // inner lanes pair up: eastbound on the north side of each gap, westbound on the south
    if (i > 0 && i < lanes.length - 1) t.oneway = i % 2 ? 1 : -1;
  });
  rect('terminal', 0, -14, 12, 3);
  // remote stands, served by bus
  tx(laneX.map(x => [x, 9.3])); rect('apron', 0, 10, 14, 1.3);
  // cargo, military and light aircraft ramps
  tx([[22, -23], [22, -21.6]]); tx([[30, -23], [30, -21.6]]);
  rect('apron', 26, -20.9, 10, 1.3); rect('cargo', 26, -19.55, 10, 1.4);
  tx([[36, -23], [36, -21.6]]); zone(rect('apron', 37, -21.15, 4, 0.85), 'mil');
  tx([[-26, 23], [-26, 21.6]]); zone(rect('apron', -26, 21.3, 3, 0.6), 'light');
  // fuel farm with a hydrant system, fire stations within three minutes of every runway end, tower and radars
  bld('fuel', -9.4, 17); bld('fuel', -12, 17); bld('fuel', -14.6, 17);
  bld('hydrant', 2, 17);
  bld('fire', -22.5, -18); bld('fire', 22.5, 24); bld('fire', -24, 19.5); bld('fire', 23.2, -24.6);
  bld('tower', 8, -14); bld('atc', 4, 20); bld('gradar', -9.5, 12);
}
/* how far the airport reaches from its reference point (for strikes, picking and drawing) */
IC.aptExtent = function (ap) {
  let r = 5;
  for (const p of ap.parts) {
    if (p.kind === 'runway') r = Math.max(r, U.dist(ap, p.a), U.dist(ap, p.b));
    else if (p.kind === 'taxi') for (const id of p.nodes) r = Math.max(r, U.dist(ap, ap.nodes[id]));
    else if (p.pts) for (const q of p.pts) r = Math.max(r, U.dist(ap, q));
    else if (p.x != null) r = Math.max(r, U.dist(ap, p) + Math.max(p.w || 0, p.h || 0, p.r || 0));
  }
  ap.radius = r + 1;
  return ap.radius;
};

})(window.IC);
