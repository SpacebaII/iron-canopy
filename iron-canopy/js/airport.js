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
/* ground surfaces the player paints: for looks, and for cheap areas like car parks; aircraft never use them */
IC.APART.surface = { name: 'Surface', area: true, cost: 1, build: 60, hp: 30, desc: 'Paint the ground: grass, gravel, concrete, asphalt or landscaping. Asphalt outside the airfield is a car park. Aircraft do not use it.' };
IC.SURF = { grass: { name: 'Grass', k: 0.5 }, gravel: { name: 'Gravel', k: 1.5 }, green: { name: 'Landscaping', k: 3 }, asph: { name: 'Asphalt', k: 4, park: 350 }, conc: { name: 'Concrete', k: 6 } };
if (!IC.APART_ORDER.includes('surface')) IC.APART_ORDER.push('surface');
if (!IC.APART_ORDER.includes('deice')) IC.APART_ORDER.splice(IC.APART_ORDER.indexOf('hydrant') + 1, 0, 'fuelpad', 'deice');
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
  return rectDist(part, p);
}
IC.partDist = partDist;
/* the gap between two rotated rectangles (0 when they touch or overlap): the nearest corner of one to the other */
function rectGap(A, B) {
  if (rectsOverlap(A, B, 0)) return 0;
  const cs = R => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toWorld(R, sx * R.w / 2, sy * R.h / 2));
  let m = 1e9;
  for (const c of cs(A)) m = Math.min(m, rectDist(B, c));
  for (const c of cs(B)) m = Math.min(m, rectDist(A, c));
  return m;
}
IC.rectGap = rectGap;
IC.partAt = function (ap, p, pad) { let best = null, bd = pad || 0.05; for (const q of ap.parts) { const d = partDist(ap, q, p); if (d < bd) { bd = d; best = q; } } return best; };

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
  for (const p of ap.parts) {
    if (p.kind === 'apron' || p.kind === 'alert') { const l = toLocal(p, n); if (Math.abs(l.x) <= p.w / 2 + SNAP_APRON && Math.abs(l.y) <= p.h / 2 + SNAP_APRON && (Math.abs(Math.abs(l.x) - p.w / 2) < SNAP_APRON || Math.abs(Math.abs(l.y) - p.h / 2) < SNAP_APRON)) { n.on = { kind: 'apron', part: p.id }; return; } }
  }
}
IC.resolveNodes = ap => { for (const n of Object.values(ap.nodes)) resolveNode(ap, n); };
/* a new runway or apron only changes the nodes it touches (a runway wins over an apron) */
function onRunway(p, n) { const t = rwT(p, n), off = Math.abs(rwOff(p, n)); return t >= -0.01 && t <= 1.01 && off < SNAP_RWY ? { kind: 'rwy', part: p.id, t: U.clamp(t, 0, 1) } : null; }
function onApron(p, n) { const l = toLocal(p, n); return Math.abs(l.x) <= p.w / 2 + SNAP_APRON && Math.abs(l.y) <= p.h / 2 + SNAP_APRON && (Math.abs(Math.abs(l.x) - p.w / 2) < SNAP_APRON || Math.abs(Math.abs(l.y) - p.h / 2) < SNAP_APRON) ? { kind: 'apron', part: p.id } : null; }
function resolveFor(ap, p) {
  for (const n of Object.values(ap.nodes)) {
    if (p.kind === 'runway') { if (n.on && n.on.kind === 'rwy') continue; const o = onRunway(p, n); if (o) n.on = o; }
    else if (!n.on) n.on = onApron(p, n);
  }
}
IC.aptAddPart = function (ap, part, built) {
  const D = IC.APART[part.kind];
  part.id = ap.id + 'p' + (ap.partN++);
  part.w = part.w != null ? part.w : D.w;
  if (part.kind !== 'taxi' && part.kind !== 'runway' && !D.area && D.h) part.h = part.h != null ? part.h : D.h;
  if (D.r && part.r == null) part.r = D.r;
  part.max = D.hp; part.hp = D.hp;
  part.built = !!built; part.prog = built ? 1 : 0;
  if (part.kind === 'runway') part.craters = part.craters || [];
  if (part.kind === 'taxi') part.cut = part.cut || {};
  if (part.kind === 'fuel') part.stock = built ? IC.APART.fuel.cap * 0.8 : 0;
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
  if (p.kind === 'taxi') { const pts = p.nodes ? p.nodes.map(id => ap.nodes[id]) : p.pts; let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); return L; }
  if (D.area) return p.w * p.h;
  return 1;
};
/* paved parts cost and take as long as their material says (concrete is the price list) */
const paveK = (p, k) => IC.PAVED && IC.PAVED[p.kind] ? IC.PAVE[IC.paveOf(p)][k] : 1;
IC.partCost = (ap, p) => IC.APART[p.kind].cost * IC.partMeasure(ap, p) * paveK(p, 'cost') * (p.kind === 'surface' ? (IC.SURF[p.surf] || IC.SURF.grass).k : 1);
IC.partBuildTime = (ap, p) => IC.APART[p.kind].build * Math.max(0.5, IC.partMeasure(ap, p)) * paveK(p, 'build');

/* stands laid out along an apron's back edge; the back is the side facing a terminal, or away from the taxiways */
function standsFor(ap, p) {
  // stands placed by hand: any size, turned any way, nose-in (pushed back by a tug) or drive-through; a stand whose
  // nose reaches a terminal is a gate, one whose nose reaches a cargo shed a cargo stand
  if (p.ramp) return (p.free || []).map((f, i) => {
    const S0 = IC.STAND[f.size], a = p.a + (f.rot || 0), hx = Math.cos(a), hy = Math.sin(a), c = toWorld(p, f.lx, f.ly), back = S0.d / 2 + 0.06;
    const id = p.id + 's' + (f.k != null ? f.k : i), old = p.stands && p.stands.find(x => x.id === id);
    const nose = { x: c.x + hx * (S0.d / 2 + 0.04), y: c.y + hy * (S0.d / 2 + 0.04) };
    const term = ap.parts.find(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.built && rectDist(q, nose) < 0.12);
    return { id, x: c.x, y: c.y, fx: c.x - hx * back, fy: c.y - hy * back, ox: c.x + hx * back, oy: c.y + hy * back, a, size: f.size, apron: p.id,
      contact: !!(term && term.kind === 'terminal'), cargo: !!(term && term.kind === 'cargo'), drive: !!f.drive, hp: old ? old.hp : 1, occ: old ? old.occ : null, ramp: true, zoneOwn: f.zone };
  });
  const depth = p.h * 0.64;
  const size = depth >= IC.STAND.l.d ? 'l' : depth >= IC.STAND.m.d ? 'm' : depth >= IC.STAND.s.d ? 's' : null;
  if (!size) return [];
  const S = IC.STAND[size], n = Math.floor(p.w / S.w);
  let back = 1;
  const term = ap.parts.find(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.built && rectGap(q, p) < 0.3);
  if (term) back = toLocal(p, term).y >= 0 ? 1 : -1;
  else { const at = Object.values(ap.nodes).filter(nd => nd.on && nd.on.part === p.id); if (at.length) back = at.reduce((s, nd) => s + toLocal(p, nd).y, 0) > 0 ? -1 : 1; }
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

/* ---------- runway names and groups ---------- */
/* the designator of a runway end: the landing heading in tens of degrees, with L, C or R for parallels */
IC.rwEnd = (rw, dir) => (rw.ends ? rw.ends[dir > 0 ? 'a' : 'b'] : '') || (dir > 0 ? 'A' : 'B');
function nameRunways(ap) {
  const rws = ap.parts.filter(p => p.kind === 'runway');
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
  for (const rw of rws) if (!rw.custom) rw.name = `Runway ${rw.ends.a}/${rw.ends.b}`;
}
IC.aptNameRunways = nameRunways;
/* runways that cannot be used independently: they cross, or they are parallel and closer than 760 m */
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
IC.aptGraph = function (ap) {
  if (!ap.dirty && ap.G) return ap.G;
  const N = new Map(), adj = new Map(), radj = new Map();
  const node = (id, x, y, kind, ref, rw) => { if (!N.has(id)) { N.set(id, { id, x, y, kind, ref, rw: rw || null }); adj.set(id, []); radj.set(id, []); } return N.get(id); };
  // one: the edge runs only from a to b; flow: +1 a to b is preferred, -1 the reverse
  const edge = (a, b, kind, part, seg, spd, one, flow) => {
    const A = N.get(a), B = N.get(b); if (!A || !B || a === b) return;
    const len = Math.max(0.01, U.dist(A, B)), w = len * (kind === 'apron' ? 1.2 : 1), key = (a < b ? a + '|' + b : b + '|' + a);
    const ab = { from: a, to: b, len, w: w * (flow > 0 ? 0.85 : flow < 0 ? 1.6 : 1), kind, part, seg, spd, key, d: a < b ? 1 : -1 };
    const ba = { from: b, to: a, len, w: w * (flow < 0 ? 0.85 : flow > 0 ? 1.6 : 1), kind, part, seg, spd, key, d: b < a ? 1 : -1 };
    if (one >= 0) { adj.get(a).push(ab); radj.get(b).push(ab); }
    if (one <= 0) { adj.get(b).push(ba); radj.get(a).push(ba); }
  };
  nameRunways(ap);
  const onPart = new Map();
  for (const n of Object.values(ap.nodes)) {
    node(n.id, n.x, n.y, 'taxi', n, n.on && n.on.kind === 'rwy' ? n.on.part : null);
    if (n.on) { if (!onPart.has(n.on.part)) onPart.set(n.on.part, []); onPart.get(n.on.part).push(n); }
  }
  const parts = ap.parts.filter(p => p.built && !(p.shut && p.kind !== 'runway'));
  const rwn = new Map();
  for (const p of parts) {
    if (p.kind === 'taxi') for (let i = 1; i < p.nodes.length; i++) { if (!p.cut[i]) edge(p.nodes[i - 1], p.nodes[i], 'taxi', p.id, i, IC.GOPS.TAXI, p.oneway || 0, p.flow || 0); }
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
    const z = IC.partZone(ap, p);
    const hyd = parts.some(h => h.kind === 'hydrant' && h.hp > h.max * 0.25 && U.dist(h, p) < IC.APART.hydrant.reach);
    const at = groupAt.get(root(gi.get(p)));
    for (const s of p.stands) {
      s.zone = s.zoneOwn || z; s.hyd = hyd; node(s.id, s.fx, s.fy, 'stand', s); for (const a of at) edge(s.id, a.id, 'apron', p.id, 0, 0.04, 0, 0);
      // a drive-through stand is left by its nose: no tug, no pushback
      if (s.drive) { node(s.id + 'o', s.ox, s.oy, 'standOut', s); edge(s.id, s.id + 'o', 'apron', p.id, 0, 0.04, 1, 0); for (const a of at) edge(s.id + 'o', a.id, 'apron', p.id, 0, 0.04, 1, 0); }
    }
  }
  for (const at of groupAt.values()) for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) edge(at[i].id, at[j].id, 'apron', at[i].on.part, 0, 0.05, 0, 0);
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
  // each runway's nodes in order: where aircraft can get off (exit) and on (entry)
  for (const [id, on] of rwn) {
    const L = rwLen(ap.parts.find(p => p.id === id));
    rwn.set(id, on.map(o => ({ id: o.id, t: o.t, s: o.t * L, exit: adj.get(o.id).some(e => e.kind !== 'rwy'), entry: radj.get(o.id).some(e => e.kind !== 'rwy') })));
  }
  // runways that depend on each other share one clearance
  const rws = parts.filter(p => p.kind === 'runway'), grp = {};
  for (const r of rws) grp[r.id] = r.id;
  const find = id => grp[id] === id ? id : (grp[id] = find(grp[id]));
  for (let i = 0; i < rws.length; i++) for (let j = i + 1; j < rws.length; j++) if (IC.rwDependent(rws[i], rws[j])) { const a = find(rws[i].id), b = find(rws[j].id); if (a !== b) grp[a < b ? b : a] = a < b ? a : b; }
  for (const r of rws) grp[r.id] = find(r.id);
  ap.gver = (ap.gver || 0) + 1;
  ap.G = { N, adj, radj, rwn, grp, ver: ap.gver, trees: new Map() };
  ap.dirty = false;
  return ap.G;
};
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
   booked the other way) }. Runway edges cost double (they block the runway), triple for arrivals; stepping onto a runway
   from a taxiway costs a hold. Returns { dist, prev, time }. */
IC.aptSearch = function (ap, src, o) {
  o = o || {};
  const G = IC.aptGraph(ap), A = o.rev ? G.radj : G.adj;
  const dist = new Map(), prev = new Map(), time = o.res ? new Map() : null, done = new Set();
  if (!G.N.has(src)) return { dist, prev, time };
  dist.set(src, 0); if (time) time.set(src, o.res.t0);
  const H = new Heap(); H.push(src, 0);
  const rwK = o.avoidRwy ? 6 : 2;
  while (H.k.length) {
    const u = H.pop();
    if (done.has(u)) continue; done.add(u);
    if (u === o.to) break;
    const du = dist.get(u);
    for (const e of A.get(u)) {
      const v = o.rev ? e.from : e.to;
      if (done.has(v) || v === o.avoid) continue;
      let w = e.w / e.spd * (e.kind === 'rwy' ? rwK : 1), tv;
      // a taxiway onto a runway means a hold at the line, a long one if the runway is in use
      const B = G.N.get(e.to);
      if (e.kind !== 'rwy' && B.rw) { const c = ap.cfg && ap.cfg.rw[B.rw]; w += c && c.role !== 'spare' ? 60 : 20; }
      if (time) { const tu = time.get(u), wait = o.res.m ? IC.gopsResWait(ap, e, tu, o.res.m) : 0; w += wait * 1.5; tv = tu + wait + e.len / e.spd; }
      const nd = du + w;
      if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, e); if (time) time.set(v, tv); H.push(v, nd); }
    }
  }
  return { dist, prev, time };
};
/* the steps of the route found by a search, from src to a node */
IC.aptSteps = function (tree, src, to) {
  const out = []; let c = to;
  while (c !== src) { const e = tree.prev.get(c); if (!e) return null; out.push({ from: e.from, to: e.to, e }); c = e.from === c ? e.to : e.from; }
  out.reverse();
  return out;
};
/* cached route trees (without reservations) until the network changes */
IC.aptTree = function (ap, src, rev) {
  const G = IC.aptGraph(ap), key = src + (rev ? '<' : '>');
  let t = G.trees.get(key);
  if (!t) { if (G.trees.size > 400) G.trees.clear(); t = IC.aptSearch(ap, src, { rev, avoidRwy: rev }); G.trees.set(key, t); }
  return t;
};
/* cheapest path in seconds; runway edges cost extra because using one blocks the runway */
IC.aptPath = function (ap, from, to, avoidRwy) {
  const G = IC.aptGraph(ap);
  if (!G.N.has(from) || !G.N.has(to)) return null;
  const t = IC.aptSearch(ap, from, { to, avoidRwy });
  if (!t.dist.has(to)) return null;
  return { cost: t.dist.get(to), steps: IC.aptSteps(t, from, to) };
};
/* all nodes reachable from a start (for connectivity checks), ignoring one-way rules */
function reach(ap, start) {
  const G = IC.aptGraph(ap), seen = new Set([start]), Q = [start];
  while (Q.length) { const u = Q.pop(); for (const e of G.adj.get(u) || []) if (!seen.has(e.to)) { seen.add(e.to); Q.push(e.to); } for (const e of G.radj.get(u) || []) if (!seen.has(e.from)) { seen.add(e.from); Q.push(e.from); } }
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

/* spacing between runway movements: a tower and an approach radar let controllers pack them tighter */
IC.aptSep = st => (!st.tower ? 480 : st.radar ? 60 : 110) * (st.lvp ? 1.6 : 1);

/* ---------- runway capacity under the tower's rules ---------- */
/* arrivals and departures an hour that the runways can take under a set of rules (ops: the airport's by default),
   for the aircraft mix in st. The same timings as ground operations (groundops.js): an arrival holds its runways
   from the approach fix until it has turned off, and the next may start its final a separation later; departures
   follow one another a wake-turbulence gap apart; between two arrivals, a departure needs the next arrival to be at
   least the arrival gap out when it starts its take-off run. */
IC.opsCapacity = function (S, ap, st, ops) {
  ops = ops || IC.opsOf(ap);
  const O = IC.OPS_T, FAF = IC.GOPS.FAF, sep = IC.aptSep(st), sepA = sep * 0.5, sepD = sep;
  const mix = st.mix || {}, keys = Object.keys(mix), mixN = keys.reduce((a, k) => a + mix[k], 0) || 1;
  const byId = new Map(ap.parts.map(p => [p.id, p]));
  const groups = {};
  for (const r of st.rwy) (groups[r.grp] = groups[r.grp] || []).push(r);
  const out = { arr: 0, dep: 0, per: {} };
  for (const g in groups) {
    const L = groups[g], role = L[0].role;
    if (role === 'spare') continue;
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
      const after = Math.max(0, (R.gap * 10 - FAF) / O.ARR_V, bd.roll - (FAF - O.GO) / O.ARR_V, st.tower ? 0 : bd.roll + sepD);
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
  let reachAny = null;
  if (rws.length) { const r = reach(ap, rws[0].id + ':a'); for (const rw of rws.slice(1)) if (!r.has(rw.id + ':a')) for (const x of reach(ap, rw.id + ':a')) r.add(x); reachAny = r; }
  for (const s of stands) {
    const ok = reachAny && reachAny.has(s.id) && s.hp > 0;
    s.linked = ok;
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
    if (w) st.warn.push(`${p.name || IC.APART[p.kind].name} closed for works (${w.kind === 'upgrade' ? 'new pavement' : w.label.toLowerCase()}) for about ${U.dur(Math.max(60, (1 - w.prog) * w.dur))}.`);
    if (p.wear >= 1) st.warn.push(`${p.name || IC.APART[p.kind].name}: the ${IC.PAVE[IC.paveOf(p)].name.toLowerCase()} is worn out; closed until resurfaced.`);
    else if (p.wear >= 0.5) st.warn.push(`${p.name || IC.APART[p.kind].name}: ${U.pct(p.wear)} worn. Aircraft heavier than ${IC.PAVE[IC.paveOf(p)].t} t break up ${IC.PAVE[IC.paveOf(p)].name.toLowerCase()}.`);
  }
  const unlinked = stands.filter(s => !s.linked && s.hp > 0).length;
  if (unlinked) st.warn.push(`${unlinked} stand${unlinked > 1 ? 's are' : ' is'} not connected to a runway.`);
  for (const p of ap.parts) if (DOOR(p.kind) && p.built) { p.linked = !!(reachAny && reachAny.has(p.id + ':d')); if (p.hp > p.max * 0.25 && p.linked) st.shelters += IC.APART[p.kind].holds || 0; else if (!p.linked && p.hp > 0) st.warn.push(`${IC.APART[p.kind].name} is not connected to the taxiways.`); }
  const tower = alive('tower').length > 0;
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
  st.rescue = 0;
  for (const rw of rws) for (const t of [0, 0.5, 1]) st.rescue = Math.max(st.rescue, IC.aptRescue(ap, rwAt(rw, t)));
  if (!tower) st.warn.push('No control tower: only a few movements an hour.');
  if (!st.fire) st.warn.push('No fire station near the runway: only turboprops may use it.');
  else if (st.rescue > 180) { const far = rws.find(rw => [0, 0.5, 1].some(t => IC.aptRescue(ap, rwAt(rw, t)) > 180)); st.warn.push(`Fire trucks need ${U.dur(st.rescue)} to reach the far end of ${far ? far.name : 'a runway'}; three minutes is the standard. More people die in a crash there.`); }
  if (rws.length) { const w = waterNear(S, ap, rws); if (w.near && ap.kind !== 'airbase') st.warn.push(`A ${w.what} ${U.km(w.d)} from the runway attracts birds: now and then one hits an aircraft.`); }
  for (const t of alive('terminal')) st.pax += IC.APART.terminal.pax * t.w * t.h;
  for (const t of alive('cargo')) st.cargo += 60 * t.w * t.h;
  // fuel: stock in the tanks, resupply by road or pipeline, and how many aircraft the trucks can refuel an hour
  const tanks = alive('fuel');
  st.hydrant = alive('hydrant').length > 0;
  st.fuelCap = tanks.length * IC.APART.fuel.cap;
  st.fuel = tanks.reduce((s, t) => s + (t.stock || 0), 0);
  st.fuelIn = tanks.length ? tanks.length * IC.FUEL_IN + (st.hydrant ? IC.APART.hydrant.pipe : 0) : 0;
  st.trucks = st.hydrant ? Infinity : tanks.length * IC.FUEL_TRUCKS;
  st.fuelDeps = Math.round(Math.min(st.trucks, st.fuelIn / (T.fuel || 1)));
  if (tanks.length && st.fuelDeps < st.depPerHour * 0.8 && ap.kind !== 'airbase') st.warn.push(`Fuel for about ${st.fuelDeps} departures an hour, fewer than the runways can launch (${st.depPerHour}). ${st.hydrant ? 'More tanks' : 'More tanks or a hydrant system'} would help.`);
  for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) if (U.dist(tanks[i], tanks[j]) < 1.4) { st.warn.push('Fuel tanks stand within 140 m of each other: one fire could take them all.'); i = tanks.length; break; }
  const links = rws.map(rw => (G.rwn.get(rw.id) || []).filter(n => n.exit).length).reduce((s, v) => s + v, 0);
  if (links === 1) st.warn.push('Only one taxiway connects the runway: a single hit strands every aircraft.');
  const ammo = alive('ammo');
  if (ammo.some(a => ap.parts.some(q => q.kind !== 'ammo' && q.built && q.kind !== 'runway' && q.kind !== 'taxi' && partDist(ap, q, a) < 1.5))) st.warn.push('The munitions store is close to other buildings: if it goes up, so do they.');
  st.maxType = !rws.length ? null : !st.fire ? 'turbo' : best >= 29 ? 'cargo' : best >= 27 ? 'wide' : best >= 21 ? 'narrow' : best >= 13 ? 'turbo' : null;
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
  return '';
};
/* can this aircraft type use the airport right now (runway, stands, fire cover) */
IC.aptFits = function (ap, type) {
  const T = IC.ACTYPES[type], st = ap.st || {};
  if (!T.vtol && (st.longest || 0) < T.rwy) return false;
  if (!T.mil && !st.fire && type !== 'turbo') return false;
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
  const hitNames = [];
  let acLost = 0;
  for (const part of ap.parts) {
    if (!part.built && part.prog <= 0) continue;
    if (part.kind === 'runway') {
      const off = Math.abs(rwOff(part, p)), t = rwT(part, p);
      if (off < part.w / 2 + rb * 0.5 && t > -0.01 && t < 1.01) {
        part.craters.push({ t: U.clamp(t, 0, 1), r: Math.max(0.35, rb * 0.7) * paveK(part, 'crater'), id: IC.nid('cr') });
        part.hp = Math.max(1, part.hp - 5);
        hitNames.push(`${part.name || 'runway'} cratered`);
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
    const was = part.hp;
    const hard = part.kind === 'has' ? 0.35 : part.kind === 'alert' ? 0.7 : 1;
    part.hp = Math.max(0, part.hp - dmg * (1 - d / rb * 0.5) * hard);
    if (was > part.max * 0.25 && part.hp <= part.max * 0.25) {
      hitNames.push(`${IC.APART[part.kind].name.toLowerCase()} destroyed`);
      IC.addScar(S, { kind: 'burn', x: part.x, y: part.y, r: Math.max(part.w || part.r * 2, part.h || 0) * 1.4 });
      if (part.kind === 'fuel') { part.burning = 5400; part.stock = 0; IC.explode(S, part.x, part.y, 1.8, 'ground', { big: 0.6 }); IC.addFire(S, part.x, part.y, 1.8, 9000); }
      else if (part.kind === 'ammo') { IC.explode(S, part.x, part.y, 2, 'ground', { big: 0.8 }); IC.addFire(S, part.x, part.y, 1.2, 6000); setTimeout0(S, () => IC.aptHit(S, ap, part.x + 0.05, part.y + 0.05, 90, { d: { code: 'secondary explosion' } })); }
      else IC.addFire(S, part.x, part.y, 0.8, 4000);
      // airliners in a hangar that falls are lost with it
      if (part.kind === 'hangar') for (const x of part.inside || []) { IC.emit(S, 'tailLost', { ap, tail: x.tl, why: 'destroyed in the hangar' }); acLost++; }
      if (part.kind === 'hangar') part.inside = [];
      ap.dirty = true;
    }
  }
  // aircraft on the ground
  for (const r of S.roster) {
    if (r.base !== ap.id || r.st === 'lost' || r.st === 'air') continue;
    const pp = IC.parkPos(S, ap, r);
    const d = U.dxy(x, y, pp.x, pp.y);
    if (d > rb + 0.25) continue;
    const shel = pp.fac;
    const chance = shel ? (shel.kind === 'has' ? (shel.hp > shel.max * 0.25 ? 0.1 : 0.6) : shel.kind === 'alert' ? 0.45 : (shel.hp > shel.max * 0.25 ? 0.4 : 0.9)) : 0.8;
    if (Math.random() < chance) { r.st = 'lost'; r.ent = null; acLost++; S.stats.acLost++; S.wrecks.push({ x: pp.x, y: pp.y, type: 'aircraft', t: S.time, h: pp.a || 0 }); IC.addFire(S, pp.x, pp.y, 0.6, 2400); }
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
  const uniq = [...new Set(hitNames)];
  if (uniq.length || acLost) IC.log(S, 'leak', 'AIRPORT', `${ap.name}: ${uniq.join(', ')}${acLost ? `${uniq.length ? '; ' : ''}${acLost} aircraft destroyed on the ground` : ''}${!st.runway ? '; RUNWAY CLOSED' : ''}.`, { x, y });
  IC.emit(S, 'baseHit', { base: ap, acLost, runway: st.runway });
  if (ap.autoRepair) autoQueue(S, ap);
};
function setTimeout0(S, fn) { (S.later = S.later || []).push({ t: S.time + 2, fn }); }

/* ---------- engineering: repairs and construction ---------- */
function workFor(ap, key) { return ap.works.find(w => w.key === key); }
IC.aptRepairList = function (ap) {
  const L = [];
  for (const p of ap.parts) {
    if (!p.built) continue;
    if (p.kind === 'runway') for (const c of p.craters) L.push(c.wreck ? { key: 'cr:' + c.id, label: `Clear wreckage from ${p.name || 'the runway'}`, cost: 6, dur: 2400, part: p, crater: c } : { key: 'cr:' + c.id, label: `Fill crater on ${p.name || 'the runway'}`, cost: 10, dur: 700 * paveK(p, 'patch'), part: p, crater: c });
    if (p.wear >= 0.3) L.push({ key: 'rs:' + p.id, label: `Resurface ${p.name || IC.APART[p.kind].name.toLowerCase()} (${U.pct(p.wear)} worn)`, cost: Math.max(3, IC.partCost(ap, p) * 0.3 * p.wear), dur: Math.max(600, IC.partBuildTime(ap, p) * 0.3 * p.wear), part: p, wear: true });
    else if (p.kind === 'taxi') for (const i in p.cut) L.push({ key: 'tx:' + p.id + ':' + i, label: 'Repair taxiway', cost: 4, dur: 420, part: p, seg: +i });
    else if (p.kind === 'apron') {
      for (const s of p.stands || []) if (s.hp <= 0) L.push({ key: 'st:' + s.id, label: 'Repair stand', cost: 5, dur: 500, part: p, stand: s });
      if (p.hp < p.max * 0.8) L.push({ key: 'pt:' + p.id, label: 'Resurface apron', cost: Math.max(3, IC.partCost(ap, p) * 0.3), dur: 900, part: p });
    }
    else if (p.hp < p.max) { const f = 1 - p.hp / p.max; L.push({ key: 'pt:' + p.id, label: `${p.hp <= p.max * 0.25 ? 'Rebuild' : 'Repair'} ${IC.APART[p.kind].name.toLowerCase()}`, cost: Math.max(2, IC.partCost(ap, p) * f * 0.6), dur: Math.max(300, IC.partBuildTime(ap, p) * f * 0.7), part: p }); }
  }
  return L;
};
IC.aptQueue = function (S, ap, key) {
  const it = IC.aptRepairList(ap).find(x => x.key === key);
  if (!it || workFor(ap, key) || S.budget < it.cost) return false;
  S.budget -= it.cost;
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
  if (action === 'crew') { if (S.budget < 20) return false; S.budget -= 20; b.crews++; IC.log(S, 'info', 'ENG', `${b.name}: another engineer crew assigned.`); return true; }
  if (action === 'repair') { const it = IC.aptRepairList(b).find(x => x.key === arg || (x.part && x.part.id === arg && x.key.startsWith('pt:'))); return it ? IC.aptQueue(S, b, it.key) : false; }
  if (action === 'build') return !!IC.autoPlace(S, b, arg);
  return false;
};
IC.cancelWork = function (S, b, id) {
  const w = b.works.find(x => x.id === id); if (!w) return;
  b.works = b.works.filter(x => x !== w);
  IC.bldRelease(b, w);
  // money already spent on a stage is gone; the rest was never paid
  if (w.kind === 'build') { IC.aptRemove(S, b, w.part.id); if (w.spent) IC.log(S, 'info', 'BUILD', `${b.name}: ${w.label.toLowerCase()} cancelled; ${U.money(w.spent)} already spent.`); }
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
  if (IC.PAVED[part.kind]) part.mat = part.mat || o.mat || 'conc';
  const lock = IC.aptLockWhy(S, part.kind, part.mat);
  if (lock) { IC.log(S, 'warn', 'BUILD', lock); return null; }
  if (o.zone && part.kind !== 'taxi') part.zone = o.zone;
  if (o.ramp) { part.ramp = true; part.free = part.free || []; }
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
  IC.log(S, 'info', 'BUILD', `${ap.name}: ${IC.APART[part.kind].name.toLowerCase()} planned (${U.money(pv.cost)} paid as the work runs, about ${U.dur(w.dur)} of engineer work).`);
  IC.emit(S, 'aptPlan', { ap, part });
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
/* inside the fence: within the rectangle that holds everything built */
IC.aptInFence = function (ap, p) {
  const b = IC.aptFence(ap); if (!b) return false;
  const l = toLocal(b, p); return Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2;
};
/* the perimeter fence: a rectangle along the main runway round everything the airport has, with room to spare */
IC.aptFence = function (ap) {
  const key = ap.parts.length + ':' + ap.nodeN + ':' + (ap.land ? ap.land.ver : 0);
  if (ap._box && ap._boxKey === key) return ap._box;
  const a = ap.rwyA || 0, c = Math.cos(-a), s = Math.sin(-a);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = (p, m) => { const dx = p.x - ap.x, dy = p.y - ap.y, lx = dx * c - dy * s, ly = dx * s + dy * c; x0 = Math.min(x0, lx - m); x1 = Math.max(x1, lx + m); y0 = Math.min(y0, ly - m); y1 = Math.max(y1, ly + m); };
  for (const p of ap.parts) {
    if (p.kind === 'runway') { grow(p.a, 1.2); grow(p.b, 1.2); }
    else if (p.kind === 'taxi') for (const id of p.nodes) { if (ap.nodes[id]) grow(ap.nodes[id], 0.5); }
    else grow(p, Math.max(p.w || 0, p.h || 0, (p.r || 0) * 2) * 0.75 + 0.3);
  }
  if (x0 > x1) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  ap._box = { x: ap.x + cx * Math.cos(a) - cy * Math.sin(a), y: ap.y + cx * Math.sin(a) + cy * Math.cos(a), w: x1 - x0, h: y1 - y0, a };
  ap._boxKey = key;
  return ap._box;
};

/* inside the country and the site, and not on top of another part (touching is fine) */
IC.aptCanPlace = function (S, ap, part) {
  const pts = part.kind === 'runway' ? [part.a, part.b] : part.kind === 'taxi' ? part.pts : [part];
  for (const p of pts) { if (!IC.inHome(p.x, p.y) || IC.inLake(p.x, p.y)) return false; if (!IC.aptInSite(S, ap, p)) return false; }
  // no part in a river: sample along lines, and the corners of areas
  const wet = p => IC.onRiver && IC.onRiver(p.x, p.y);
  if (part.kind === 'runway' || part.kind === 'taxi') { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(U.dist(a, b) / 0.5); for (let k = 0; k <= n; k++) if (wet({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })) return false; } }
  if (part.kind === 'taxi') return true;
  const D = IC.APART[part.kind];
  const probe = Object.assign({ w: D.w, h: D.h, r: D.r }, part);
  const shape = q => q.kind === 'runway' ? { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2, a: Math.atan2(q.b.y - q.a.y, q.b.x - q.a.x), w: rwLen(q), h: q.w || IC.APART.runway.w } : q.r ? { x: q.x, y: q.y, a: 0, w: q.r * 2, h: q.r * 2 } : q;
  const A = shape(probe);
  if (part.kind !== 'runway') for (const [sx, sy] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) if (wet(toWorld(A, sx * A.w / 2, sy * A.h / 2))) return false;
  for (const q of ap.parts) {
    if (q.kind === 'taxi' || q === part || q.kind === 'ils' || q.kind === 'surface' || probe.kind === 'surface') continue;
    // runways cross runways; everything else keeps off them
    if (q.kind === 'runway' && probe.kind === 'runway') continue;
    if (rectsOverlap(A, shape(q), 0.01)) return false;
  }
  return true;
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
      if (w.kind === 'upgrade') { w.part.mat = w.mat; w.part.wear = 0; w.part.hp = w.part.max; IC.log(S, 'info', 'BUILD', `${b.name}: ${w.label.toLowerCase()} done; open again.`, w.part.x != null ? w.part : b); }
      else if (w.kind === 'build') {
        const before = IC.bldSnapStats(b);
        w.part.built = true; w.part.prog = 1; w.part.stage = null;
        if (w.part.kind === 'runway' || w.part.kind === 'apron' || w.part.kind === 'alert') resolveFor(b, w.part);
        if (w.part.kind === 'apron' || DOOR(w.part.kind)) IC.aptAutoJoin(b, w.part);
        if (w.part.kind === 'taxi') for (const q of b.parts) if (q.built && (q.kind === 'apron' || DOOR(q.kind))) IC.aptAutoJoin(b, q);
        IC.aptExtent(b); IC.log(S, 'info', 'BUILD', `${b.name}: ${w.part.kind === 'runway' ? w.part.name || 'runway' : IC.APART[w.part.kind].name.toLowerCase()} complete.`, w.part.x != null ? w.part : b); IC.emit(S, 'aptBuilt', { ap: b, part: w.part });
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
        q.hp = Math.max(0, q.hp - dt / 60 * (q.kind === 'fuel' ? 9 : 4) * (1 - d / 1.6));
        if (was > q.max * 0.25 && q.hp <= q.max * 0.25) {
          IC.log(S, 'leak', 'FIRE', `${b.name}: fire spreads to the ${IC.APART[q.kind].name.toLowerCase()}.`, q);
          if (q.kind === 'fuel') { q.burning = 5400; q.stock = 0; IC.explode(S, q.x, q.y, 1.6, 'ground'); IC.addFire(S, q.x, q.y, 1.6, 8000); }
          b.dirty = true;
        }
      }
    }
    // fuel arrives by road and pipeline: each tank at its own rate, and a hydrant system's pipeline shares out more
    const tanks = b.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25);
    const pipe = b.parts.some(p => p.kind === 'hydrant' && p.built && p.hp > p.max * 0.25) ? IC.APART.hydrant.pipe : 0;
    const inflow = (IC.FUEL_IN + (tanks.length ? pipe / tanks.length : 0)) * dt / 3600;
    for (const t of tanks) t.stock = Math.min(IC.APART.fuel.cap, (t.stock || 0) + inflow);
    if (IC.landsideTick) IC.landsideTick(S, b, dt);
    b.statT = (b.statT || 0) - dt;
    if (b.statT <= 0 || b.dirty) { b.statT = 60; IC.aptStats(S, b); }
    // engineers come back to jobs that could not be paid for at the time
    b.aqT = (b.aqT || 0) - dt;
    if (b.aqT <= 0) { b.aqT = 180; if (b.autoRepair && !b.locked) autoQueue(S, b); }
    const tot = b.parts.reduce((s, p) => s + (p.built ? p.max : 0), 0), cur = b.parts.reduce((s, p) => s + (p.built ? p.hp : 0), 0);
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
    const cap = ap.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25).length * IC.FUEL_TRUCKS;
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
      if (a.on && a.on.part === part.id || b.on && b.on.part === part.id) continue;
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
  const probe = { kind: 'taxi', pts: snaps, mat: o && o.mat };
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
  if (r && !name) { nameRunways(ap); r.name = `Runway ${r.ends.a}/${r.ends.b}`; }
  return r;
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
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', `The ${D.name.toLowerCase()} does not fit there: it overlaps another part or leaves the site.`); return null; }
  return IC.aptPlan(S, ap, part, o);
};
/* bulldoze: remove a part (refund part of an unbuilt one) */
IC.aptRemove = function (S, ap, id) {
  const p = ap.parts.find(x => x.id === id); if (!p) return false;
  for (const w of ap.works.filter(x => x.part === p || (x.it && x.it.part === p))) { ap.works = ap.works.filter(x => x !== w); IC.bldRelease(ap, w); }
  ap.parts = ap.parts.filter(x => x !== p && !(p.kind === 'runway' && x.kind === 'ils' && x.rw === p.id));
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
    bld('fuel', -12, 4.6); bld('fuel', -11.55, 5.05); bld('fuel', -12.5, 5.15); bld('fuel', -11.1, 4.6);
    bld('tower', 3.5, 5.7); bld('fire', 0, -1.5); bld('atc', -8, -3.2);
    bld('hangar', -9.2, 3.6); bld('hangar', -8.3, 3.6);
    tx([[-8, 1.8], [-8.75, 3.25]]);
  } else if (template === 'regional_bad') {
    // one stub in the middle of the runway: every departure backtracks, every landing blocks the runway for minutes
    rw(-12, 12, 0, nm());
    tx([[2, 0], [2, 1.75]]);
    rect('apron', 2, 2.22, 1.5, 0.95);
    rect('terminal', 2, 3.05, 1.8, 0.55);
    bld('fuel', 3.6, 2.6); bld('tower', 0.6, 2.7); bld('fire', 0, -1.2);
  } else if (template === 'regional_ok') {
    ils(rw(-13, 13, 0, nm()), ['a']);
    tx([[-12.8, 1.7], [-6, 1.7], [0, 1.7], [6, 1.7]]);
    tx([[-12.8, 0], [-12.8, 1.7]]); tx([[6, 0], [6, 1.7]]); tx([[0, 1.7], [0, 2.25]]); tx([[-6, 1.7], [-6, 2.25]]);
    rect('apron', 0, 2.72, 3.2, 0.95); rect('terminal', 0, 3.6, 3.2, 0.7);
    bld('fuel', 3.8, 3.4); bld('fuel', 5.2, 3.5); bld('tower', -2.4, 3.1); bld('fire', -3, -1.2); bld('hangar', -6, 2.6);
  } else if (template === 'mil_mothball') {
    // a half-closed base: a parallel taxiway to one end only, clustered fuel, no shelters, no alert pad
    rw(-13, 13, 0, nm());
    tx([[-12.8, 0], [-12.8, -1.6], [-9, -1.6], [-6, -1.6], [-3, -1.6], [0, -1.6], [0, 0]]);
    tx([[-6, -1.6], [-6, -2.6]]); tx([[-9, -1.6], [-9, -2.12]]);
    rect('apron', -9, -2.55, 2.5, 0.86);
    bld('hangar', -6.4, -2.95); bld('hangar', -5.6, -2.95);
    bld('fuel', -10.3, -3.8); bld('fuel', -10.0, -4.15);
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
    bld('fuel', -12, -4.5); bld('fuel', -4, -5.2); bld('fuel', 11, -4.6);
    bld('ammo', 0, -7); bld('tower', 1.2, -3.8); bld('fire', -1.2, 1.3);
    tx([[-14.8, -1.7], [-15.6, -1.15]]);
  } else if (template === 'kden') layoutKden(ap, { rw, tx, rect, bld, ils, zone });
  IC.resolveNodes(ap);
  for (const p of ap.parts) if (p.kind === 'apron' || p.kind === 'hangar' || p.kind === 'has' || p.kind === 'alert') IC.aptAutoJoin(ap, p);
  ap.dirty = true;
  ap.template = template;
  const r0 = ap.parts.find(p => p.kind === 'runway');
  ap.rwyA = a; ap.rwyL = r0 ? IC.rwLen(r0) : 20;
  if (IC.aptAutoLinks) IC.aptAutoLinks(ap);
  IC.aptExtent(ap);
};
/* A Denver-sized airport: six runways in a pinwheel round three concourses (well over a hundred gates), end-around
   taxiways, one-way lanes between the concourses, cargo, light-aircraft and military ramps. Proof that the model
   scales, and the test for it. Local x runs along the first runway, y across it; 1 unit = 100 m. */
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
  for (const x of [-8, -6, -4, -2]) { bld('fuel', x, 16); bld('fuel', x, 18); }
  bld('hydrant', 2, 17);
  bld('fire', -22.5, -18); bld('fire', 22.5, 24); bld('fire', -24, 19.5); bld('fire', 24, -24.5);
  bld('tower', 8, -14); bld('atc', 4, 20); bld('gradar', -9.5, 12);
}
/* how far the airport reaches from its reference point (for strikes, picking and drawing) */
IC.aptExtent = function (ap) {
  let r = 5;
  for (const p of ap.parts) {
    if (p.kind === 'runway') r = Math.max(r, U.dist(ap, p.a), U.dist(ap, p.b));
    else if (p.kind === 'taxi') for (const id of p.nodes) r = Math.max(r, U.dist(ap, ap.nodes[id]));
    else r = Math.max(r, U.dist(ap, p) + Math.max(p.w || 0, p.h || 0, p.r || 0));
  }
  ap.radius = r + 1;
  return ap.radius;
};

})(window.IC);
