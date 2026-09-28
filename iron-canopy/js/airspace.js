/* Iron Canopy — the airspace. The player places fixes (named points) and joins them into airways; each airport
   joins the network by a departure and arrival route to its nearest fix, and airliners fly the shortest way along it.
   Radar sees less the lower an aircraft flies: the curve of the earth and high ground hide it. Controllers keep apart
   the flights they can see; outside radar cover or off the airways they fall back on wide procedural spacing, and
   crossings they cannot see go wrong. Control zones around airports keep light aircraft out unless they are cleared. */
(function (IC) {
'use strict';
const U = IC.U;

const A = IC.ASP = {
  sep: 90, vsep: 0.3048,   // radar separation: 9 km (5 NM) apart, or 1,000 ft above or below
  near: 30,                // closer than 3 km at the same level is a near miss
  gaNear: 15, gaVsep: 0.15, // a light aircraft and an airliner within 1.5 km and 150 m
  link: 1200,              // an airport joins the network at a fix within 120 km
  gap: 60,                 // departures the same way: 1 min apart with radar and airways
  gate: 250,               // a fix within 25 km of the border is an entry and exit point
  ctl: 40,                 // flights the area controllers can watch at once (a flight on an airway, on radar, counts 0.6):
                           // the centres of a country 3,000 km across
  gaRwy: 150,              // a light aircraft holds a big airport's runway as long as two airliners (s)
  CS: 50,                  // coverage map cell: 5 km
  NB: 120, STEP: 40,       // radar horizon profiles: 3° sectors, 4 km steps
  FIELD_COST: 12
};
IC.ASP_BANDS = [[0.5, 'below 500 m'], [1.5, '500 m – 1.5 km'], [3.5, '1.5 – 3.5 km'], [7, '3.5 – 7 km'], [99, 'above 7 km']];
const RE = 8495; // effective earth radius in km: radar waves bend a little, so 4/3 of the real one
const short = n => n.replace(/ (International|Airport|Air Base)$/, '');

IC.aspInit = function (S) {
  S.asp = { fixes: [], ways: [], ver: 1, scanT: 0, dep: {}, pairs: {}, fields: makeFields(S), load: 0, work: 0, cap: A.ctl,
    stats: { los: 0, near: 0, inf: 0, solved: 0, held: 0 }, day: { los: 0, near: 0, inf: 0 }, hourT: 0 };
};

/* ---------- radar cover: terrain and the earth's curve ---------- */
IC.elevKm = (x, y) => Math.max(0, IC.W.hAt(x, y) - 0.25) * 2;
/* for each 3° sector and each step out from the radar (4 km, finer for short-range radars), the lowest height
   (above sea level) it can see */
function profile(x, y, mastM, R) {
  const NB = A.NB, ST = U.clamp(R / 30, 8, A.STEP), NS = Math.ceil(R / ST) + 1, g0 = IC.elevKm(x, y), h0 = g0 + mastM / 1000, m = new Float32Array(NB * NS);
  for (let b = 0; b < NB; b++) {
    const a = b / NB * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    let sig = -1e9;
    for (let k = 0; k < NS; k++) {
      const d = (k + 1) * ST, dk = d / 10, px = x + c * d, py = y + s * d;
      const hg = IC.elevKm(U.clamp(px, 0, IC.WW), U.clamp(py, 0, IC.WH)), cu = dk * dk / (2 * RE);
      m[b * NS + k] = Math.max(hg + 0.03, h0 + sig * dk + cu);
      sig = Math.max(sig, (hg - h0 - cu) / dk);
    }
  }
  return { m, NS, ST, x, y, mast: mastM, R };
}
function profAlt(P, x, y) {
  const dx = x - P.x, dy = y - P.y, k = Math.ceil(Math.hypot(dx, dy) / P.ST) - 1;
  if (k < 0) return 0;
  if (k >= P.NS) return Infinity;
  const b = U.mod(Math.round(Math.atan2(dy, dx) / (Math.PI * 2) * A.NB), A.NB);
  return P.m[b * P.NS + k];
}
/* one profile per radar position, mast and reach, kept on the unit or airport part that carries the radar */
function profOf(s) {
  const o = s.unit || s.part || s, R = s.unit ? Math.max(s.R, (s.unit.d.sensor || s.unit.d.fc).R) : Math.max(s.R, 450);
  const c = o._hp || (o._hp = []);
  for (const P of c) if (P.x === s.x && P.y === s.y && P.mast === s.mast && P.R >= s.R) return P;
  if (c.length && (c[0].x !== s.x || c[0].y !== s.y)) c.length = 0;
  const P = profile(s.x, s.y, s.mast, R); c.push(P);
  return P;
}
/* ground radars cannot see an aircraft hidden by high ground or below the curve of the earth (sensors.js asks) */
IC.aspHidden = (s, t) => IC.elevKm(t.x, t.y) + t.alt < profAlt(profOf(s), t.x, t.y);
/* the lowest height above the ground a radar sees at a point (Infinity outside its reach) */
IC.radarFloor = (s, x, y) => U.dxy(x, y, s.x, s.y) > s.R ? Infinity : Math.max(0, profAlt(profOf(s), x, y) - IC.elevKm(x, y));
/* is the straight line from a mast (height in m above the ground at a) to a point b at altKm above the ground
   clear of hills and the earth's curve? For planning, where no radar profile exists yet */
IC.losClear = function (ax, ay, mastM, bx, by, altKm) {
  const D = U.dxy(ax, ay, bx, by), n = Math.ceil(D / 20);
  const h0 = IC.elevKm(ax, ay) + mastM / 1000, h1 = IC.elevKm(bx, by) + altKm, Dk = D / 10;
  for (let i = 1; i < n; i++) {
    const f = i / n, dk = Dk * f, line = h0 + (h1 - h0) * f - dk * (Dk - dk) / (2 * RE);
    if (IC.elevKm(ax + (bx - ax) * f, ay + (by - ay) * f) > line) return false;
  }
  return true;
};

/* radars that give controllers a picture: ours, on the ground, reading transponders */
const atcRadar = s => !s.passive && !s.air && !s.org && !s.bmdOnly && !s.rktOnly && !s.eo && (s.ssr || s.idc === 'iff' || s.idc === 'nctr');
IC.aspRadars = S => S.sensors.filter(atcRadar);
/* the lowest height above ground that controllers see, on a 5 km grid */
IC.aspCov = function (S) {
  const L = IC.aspRadars(S), N = S.asp;
  const key = L.map(s => `${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.R / 20)}`).join(';');
  if (N.cov && N.cov.key === key) return N.cov;
  const CS = A.CS, gw = Math.ceil(IC.WW / CS), gh = Math.ceil(IC.WH / CS), g = new Float32Array(gw * gh).fill(Infinity);
  const gnd = N.gnd || (N.gnd = (() => { const e = new Float32Array(gw * gh); for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) e[j * gw + i] = IC.elevKm((i + 0.5) * CS, (j + 0.5) * CS); return e; })());
  for (const s of L) {
    const P = profOf(s);
    const i0 = Math.max(0, Math.floor((s.x - s.R) / CS)), i1 = Math.min(gw - 1, Math.floor((s.x + s.R) / CS));
    const j0 = Math.max(0, Math.floor((s.y - s.R) / CS)), j1 = Math.min(gh - 1, Math.floor((s.y + s.R) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CS, y = (j + 0.5) * CS;
      if (U.dxy(x, y, s.x, s.y) > s.R) continue;
      const k = j * gw + i, a = Math.max(0, profAlt(P, x, y) - gnd[k]);
      if (a < g[k]) g[k] = a;
    }
  }
  return (N.cov = { key, g, gw, gh, v: (N.cov ? N.cov.v : 0) + 1 });
};
/* the same for our military radars (search and fire control): a low flier is safe in the holes the hills leave */
const milRadar = s => !!s.unit && s.emits && !s.ssr && !s.eo && !s.acou && !s.esm && !s.bmdOnly && !s.rktOnly;
IC.milCov = function (S) {
  const L = S.sensors.filter(milRadar), N = S.asp;
  const key = L.map(s => `${Math.round(s.x)},${Math.round(s.y)},${s.mast},${Math.round(s.R / 20)}`).join(';');
  if (N.mcov && N.mcov.key === key) return N.mcov;
  const CS = A.CS, gw = Math.ceil(IC.WW / CS), gh = Math.ceil(IC.WH / CS), g = new Float32Array(gw * gh).fill(Infinity);
  for (const s of L) {
    const i0 = Math.max(0, Math.floor((s.x - s.R) / CS)), i1 = Math.min(gw - 1, Math.floor((s.x + s.R) / CS));
    const j0 = Math.max(0, Math.floor((s.y - s.R) / CS)), j1 = Math.min(gh - 1, Math.floor((s.y + s.R) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * gw + i, a = IC.radarFloor(s, (i + 0.5) * CS, (j + 0.5) * CS);
      if (a < g[k]) g[k] = a;
    }
  }
  return (N.mcov = { key, g, gw, gh, v: (N.mcov ? N.mcov.v : 0) + 1 });
};
IC.aspCovAlt = function (S, x, y) {
  const C = IC.aspCov(S), i = Math.floor(x / A.CS), j = Math.floor(y / A.CS);
  return i < 0 || j < 0 || i >= C.gw || j >= C.gh ? Infinity : C.g[j * C.gw + i];
};
/* share of our country that controllers see at a height */
IC.aspCovShare = function (S, alt) {
  const C = IC.aspCov(S), N = S.asp;
  if (!N.home) { N.home = []; for (let j = 0; j < C.gh; j++) for (let i = 0; i < C.gw; i++) if (IC.inHome((i + 0.5) * A.CS, (j + 0.5) * A.CS)) N.home.push(j * C.gw + i); }
  let n = 0; for (const k of N.home) if (C.g[k] <= alt) n++;
  return n / Math.max(1, N.home.length);
};
/* does air traffic control see this aircraft right now? */
function seen(S, t) {
  if (t._seenT === S.time) return t._seen;
  let v = false;
  for (const s of S.asp.radars || []) if (IC.detects(s, t)) { v = true; break; }
  t._seenT = S.time; t._seen = v;
  return v;
}
IC.aspSeen = seen;

/* ---------- fixes and airways ---------- */
const CONS = 'BDGKLMNPRSTVZ', VOW = 'AEIOU';
function fixName(S) {
  for (let g = 0; g < 60; g++) {
    const n = U.pick(CONS) + U.pick(VOW) + U.pick(CONS) + U.pick(VOW) + U.pick(CONS);
    if (!S.asp.fixes.some(f => f.name === n)) return n;
  }
  return 'FX' + S.asp.fixes.length;
}
const changed = S => { S.asp.ver++; S.asp.rc = null; };
IC.aspFix = (S, id) => S.asp.fixes.find(f => f.id === id);
IC.aspWay = (S, id) => S.asp.ways.find(w => w.id === id);
/* where a fix may go: over our country or just outside it, where traffic joins */
IC.aspFixWhy = (S, x, y) => x < 0 || y < 0 || x > IC.WW || y > IC.WH ? 'OFF THE MAP' : !IC.inHome(x, y) && !nearHome(x, y) ? 'OUTSIDE OUR AIRSPACE' : '';
function nearHome(x, y) { for (let a = 0; a < 6.28; a += 0.8) if (IC.inHome(x + Math.cos(a) * 300, y + Math.sin(a) * 300)) return true; return false; }
/* entry and exit points: fixes on the border, either side, where international traffic enters and leaves */
IC.aspIsGate = (S, x, y) => Math.abs(S.world.depthOut(x, y)) < A.gate;
IC.aspGates = S => S.asp.fixes.filter(f => f.gate);
IC.aspAddFix = function (S, x, y) {
  if (IC.aspFixWhy(S, x, y)) return null;
  const f = { id: IC.nid('fx'), x, y, name: fixName(S), gate: IC.aspIsGate(S, x, y) };
  S.asp.fixes.push(f); changed(S);
  IC.emit(S, 'fixAdded', f);
  return f;
};
IC.aspMoveFix = function (S, f, x, y) {
  if (IC.aspFixWhy(S, x, y)) return false;
  f.x = x; f.y = y; f.gate = IC.aspIsGate(S, x, y); changed(S);
  return true;
};
IC.aspDelFix = function (S, id) {
  const N = S.asp;
  N.fixes = N.fixes.filter(f => f.id !== id);
  N.ways = N.ways.filter(w => w.a !== id && w.b !== id);
  changed(S);
};
IC.aspAddWay = function (S, a, b) {
  const N = S.asp;
  if (!a || !b || a === b || !IC.aspFix(S, a) || !IC.aspFix(S, b)) return null;
  if (N.ways.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
  const w = { id: IC.nid('aw'), a, b };
  N.ways.push(w); changed(S);
  IC.emit(S, 'airwayAdded', w);
  return w;
};
IC.aspDelWay = function (S, id) { S.asp.ways = S.asp.ways.filter(w => w.id !== id); changed(S); };
/* a new fix on an airway splits it in two */
IC.aspSplitWay = function (S, id, x, y) {
  const w = IC.aspWay(S, id); if (!w) return null;
  const f = IC.aspAddFix(S, x, y); if (!f) return null;
  IC.aspDelWay(S, id); IC.aspAddWay(S, w.a, f.id); IC.aspAddWay(S, f.id, w.b);
  return f;
};
IC.aspWayEnds = (S, w) => [IC.aspFix(S, w.a), IC.aspFix(S, w.b)];
IC.aspFixAt = function (S, p, r) { let best = null, bd = r; for (const f of S.asp.fixes) { const d = U.dist(f, p); if (d < bd) { bd = d; best = f; } } return best; };
IC.aspWayAt = function (S, p, r) {
  let best = null, bd = r;
  for (const w of S.asp.ways) { const [a, b] = IC.aspWayEnds(S, w); const d = U.segDist(p.x, p.y, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = w; } }
  return best;
};
/* the fix an airport's departure and arrival routes join: the nearest one on an airway */
IC.aspLink = function (S, ap) {
  const N = S.asp;
  if (!N.links || N.links.ver !== N.ver) N.links = { ver: N.ver };
  if (ap.id in N.links) return N.links[ap.id];
  let best = null, bd = A.link;
  for (const f of N.fixes) { const d = U.dist(f, ap); if (d < bd && N.ways.some(w => w.a === f.id || w.b === f.id)) { bd = d; best = f; } }
  return (N.links[ap.id] = best);
};
/* where airways cross: conflict points that controllers must watch */
IC.aspCrossings = function (S) {
  const N = S.asp;
  if (N.xs && N.xs.ver === N.ver) return N.xs.L;
  const L = [];
  for (let i = 0; i < N.ways.length; i++) for (let j = i + 1; j < N.ways.length; j++) {
    const w = N.ways[i], v = N.ways[j];
    if (w.a === v.a || w.a === v.b || w.b === v.a || w.b === v.b) continue;
    const [a, b] = IC.aspWayEnds(S, w), [c, d] = IC.aspWayEnds(S, v);
    const t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
    if (t >= 0) L.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: w.id, v: v.id });
  }
  N.xs = { ver: N.ver, L };
  return L;
};
/* what an airway passes over: towns, bases and prohibited zones within 20 km */
IC.aspOverflies = function (S, w) {
  const [a, b] = IC.aspWayEnds(S, w), L = [];
  const near = (p, r) => U.segDist(p.x, p.y, a.x, a.y, b.x, b.y) < r;
  for (const c of IC.cities(S)) if (c.owner === 'us' && c.pop > 150 && near(c, c.r + 200)) L.push(c.name);
  for (const bs of S.infra) if (bs.kind === 'airbase' && near(bs, 200)) L.push(bs.name);
  if (S.av) for (const z of S.av.zones) if (near(z, z.r)) L.push(`prohibited zone ${z.name}`);
  return L;
};
/* share of an airway that radar sees at a height */
IC.aspWayCover = function (S, w, alt) {
  const [a, b] = IC.aspWayEnds(S, w); let n = 0;
  for (let i = 0; i <= 10; i++) if (IC.aspCovAlt(S, a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10) <= alt) n++;
  return n / 11;
};

/* ---------- routing over the network ---------- */
/* how long it is to fly from an outside end to a fix, counting the part over our country three times:
   foreign traffic should join the airways where it enters our airspace, not cut across it */
function joinCost(p, f) {
  const L = U.dist(p, f); let inside = 0;
  for (let i = 0; i < 8; i++) if (IC.inHome(p.x + (f.x - p.x) * (i + 0.5) / 8, p.y + (f.y - p.y) * (i + 0.5) / 8)) inside++;
  return L * (1 + 2 * inside / 8);
}
/* the airway route from a to b: [a, fixes…, b], or null to fly direct */
IC.aspRoute = function (S, a, b) {
  const N = S.asp;
  if (!N || !N.ways.length) return null;
  const rc = N.rc || (N.rc = new Map()), key = `${Math.round(a.x)},${Math.round(a.y)},${a.apt || ''}>${Math.round(b.x)},${Math.round(b.y)},${b.apt || ''}`;
  if (rc.has(key)) return rc.get(key);
  let res = null;
  const la = a.apt ? IC.aspLink(S, S.byId[a.apt] || a) : null, lb = b.apt ? IC.aspLink(S, S.byId[b.apt] || b) : null;
  const overUs = a.apt || b.apt || IC.crossesHome({ a, b });
  if (overUs && (!a.apt || la) && (!b.apt || lb)) {
    const F = N.fixes, n = F.length, idx = new Map(F.map((f, i) => [f.id, i]));
    const adj = F.map(() => []);
    for (const w of N.ways) { const i = idx.get(w.a), j = idx.get(w.b), L = U.dist(F[i], F[j]); adj[i].push([j, L]); adj[j].push([i, L]); }
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    // once there are entry points, traffic from abroad joins the airways only there
    const gated = F.some((f, i) => f.gate && adj[i].length), entry = f => !gated || f.gate;
    for (let i = 0; i < n; i++) if (adj[i].length) dist[i] = a.apt ? (F[i] === la ? U.dist(a, la) : Infinity) : entry(F[i]) ? joinCost(a, F[i]) : Infinity;
    for (;;) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const [v, L] of adj[u]) if (dist[u] + L < dist[v]) { dist[v] = dist[u] + L; prev[v] = u; }
    }
    let end = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (dist[i] < Infinity) { const c = dist[i] + (b.apt ? (F[i] === lb ? U.dist(lb, b) : Infinity) : entry(F[i]) ? joinCost(b, F[i]) : Infinity); if (c < best) { best = c; end = i; } }
    if (end >= 0) {
      const path = []; for (let i = end; i >= 0; i = prev[i]) path.unshift(F[i]);
      const pts = [{ x: a.x, y: a.y }].concat(path.map(f => ({ x: f.x, y: f.y, fix: f.id, name: f.name })), [{ x: b.x, y: b.y }]);
      let len = 0; for (let i = 1; i < pts.length; i++) len += U.dist(pts[i - 1], pts[i]);
      // an airway network that sends a flight far out of its way is not used: controllers clear it direct
      if (len < U.dist(a, b) * 1.6 + 300) res = { pts, len, fixes: path.map(f => f.id) };
    }
  }
  rc.set(key, res);
  return res;
};
/* bend a route round circles (prohibited zones, control zones) */
IC.bendPath = function (pts, circles, passes) {
  for (let pass = 0; pass < (passes || 8); pass++) {
    let hit = null;
    for (let i = 1; i < pts.length && !hit; i++) for (const z of circles) {
      if (U.dist(pts[i - 1], z) < z.r * 1.02 || U.dist(pts[i], z) < z.r * 1.02) continue;
      if (U.segDist(z.x, z.y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) < z.r) { hit = { i, z }; break; }
    }
    if (!hit) break;
    const P = pts[hit.i - 1], Q = pts[hit.i], z = hit.z;
    const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const side = ((z.x - P.x) * nx + (z.y - P.y) * ny) > 0 ? -1 : 1;
    const R = z.r * 1.3, c = { x: z.x + nx * side * R, y: z.y + ny * side * R };
    pts.splice(hit.i, 0, { x: c.x - dx / L * R * 0.8, y: c.y - dy / L * R * 0.8 }, { x: c.x + dx / L * R * 0.8, y: c.y + dy / L * R * 0.8 });
  }
  return pts;
};
/* a point part way along a route, and the waypoints still ahead of it */
IC.pathAt = function (pts, f) {
  let tot = 0; for (let i = 1; i < pts.length; i++) tot += U.dist(pts[i - 1], pts[i]);
  let s = tot * U.clamp(f, 0, 1);
  for (let i = 1; i < pts.length; i++) {
    const L = U.dist(pts[i - 1], pts[i]);
    if (s <= L || i === pts.length - 1) { const k = L ? U.clamp(s / L, 0, 1) : 1; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, ahead: pts.slice(i) }; }
    s -= L;
  }
  return { x: pts[0].x, y: pts[0].y, ahead: pts.slice(1) };
};
/* cruise levels by direction: eastbound flights at odd thousands of feet (FL310, 330…), westbound at even ones
   (FL320, 340…), so traffic the opposite way on one airway is always 1,000 ft above or below */
IC.aspLevel = function (base, from, to) {
  const off = to.x >= from.x ? 10 : 0;
  return IC.flKm(off + Math.round((IC.flOf(base) - off) / 20) * 20);
};

/* ---------- controllers: releases and separation ---------- */
/* how long a departure (or an entry from abroad) waits before controllers release it. Departures the same way
   are spaced 1 min apart with radar and airways, twice that off the airways and four times that outside radar */
IC.aspGap = function (S, from, to) {
  const net = !!IC.aspRoute(S, from, to);
  let p = from;
  if (!from.apt) { for (let i = 1; i <= 12; i++) { const q = { x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }; if (IC.inHome(q.x, q.y)) { p = q; break; } } }
  const covered = IC.aspCovAlt(S, p.x, p.y) <= (from.apt ? 1.5 : 9);
  // overloaded controllers space departures wider still
  const sec = from.apt && S.asp.secs ? IC.aspSectorAt(S, from.x, from.y, 0.5) : null;
  const busy = Math.max(1, S.asp.work || 0, sec ? sec.work : 0) * (sec ? sec.rules.space : 1);
  return { gap: A.gap * (net ? 1 : 2) * (covered ? 1 : 4) * busy, net, covered, busy };
};
IC.aspRelease = function (S, from, to) {
  const N = S.asp; if (!N) return 0;
  const key = from.apt || from.name || `${Math.round(from.x)},${Math.round(from.y)}`;
  const hd = Math.atan2(to.y - from.y, to.x - from.x), g = IC.aspGap(S, from, to).gap;
  const L = N.dep[key] = (N.dep[key] || []).filter(d => S.time - d.t < 1800);
  let wait = 0;
  for (const d of L) if (Math.abs(U.angWrap(d.hd - hd)) < 0.8) wait = Math.max(wait, d.t + g - S.time);
  if (wait > 0) { N.stats.held++; return Math.ceil(wait); }
  L.push({ t: S.time, hd });
  return 0;
};

/* ---------- airspace classes ----------
   Each airport's controlled airspace is a set of volumes the player shapes: a control zone from the ground up and
   the shelves of a terminal area above it, each ring with its own floor and ceiling (an upside-down wedding cake).
   Airways are corridors: class A above FL195, E below. Military areas close a height band. Everything else is G.
   Heights are above the ground, in km, like every t.alt. */
IC.ASP_CLS = {
  A: { name: 'Class A', col: '120,140,255', ctl: 1, vfr: 'no', sepVfr: 1, radar: 1,
    who: 'Every flight needs a clearance. Light aircraft flying by sight may not enter.', sep: 'Controllers keep every flight apart.', need: 'Radar and radio.' },
  B: { name: 'Class B', col: '80,140,255', ctl: 1, vfr: 'clr', sepVfr: 1, radar: 1, kt: 250,
    who: 'Every flight needs a clearance, light aircraft too.', sep: 'Controllers keep every flight apart, light aircraft too.', need: 'Radar, radio and a transponder. 250 kt below FL100.' },
  C: { name: 'Class C', col: '205,110,235', ctl: 1, vfr: 'clr', sepVfr: 1, radar: 1, kt: 250,
    who: 'Every flight needs a clearance, light aircraft too.', sep: 'Airliners are kept apart from everything; light aircraft are only told about each other.', need: 'Radar, radio and a transponder. 250 kt below FL100.' },
  D: { name: 'Class D', col: '110,175,255', ctl: 1, vfr: 'call', sepVfr: 0, radar: 0, kt: 250,
    who: 'Airliners need a clearance; light aircraft must call the tower before they come in.', sep: 'Airliners are kept apart from each other; light aircraft are only told where the airliners are.', need: 'Radio. 250 kt below FL100.' },
  E: { name: 'Class E', col: '120,200,185', ctl: 1, vfr: 'free', sepVfr: 0, radar: 0, kt: 250,
    who: 'Airliners need a clearance; light aircraft flying by sight do not.', sep: 'Airliners are kept apart from each other only.', need: 'Radio for airliners.' },
  G: { name: 'Class G', col: '160,170,170', ctl: 0, vfr: 'free', sepVfr: 0, radar: 0, kt: 250,
    who: 'Nobody needs a clearance.', sep: 'Nobody is kept apart: pilots look out, and controllers only pass on what they see.', need: 'Nothing.' },
  R: { name: 'Restricted area', col: '255,110,90', mil: 1, vfr: 'no',
    who: 'Nobody may fly in its height band without the military\'s clearance.', sep: 'Controllers send civil flights above or below it.', need: '' },
  Q: { name: 'Danger area', col: '255,175,80', mil: 1, vfr: 'free',
    who: 'Firing or military flying: airliners are kept out of its band; light aircraft enter at their own risk.', sep: 'Controllers send airliners above or below it.', need: '' },
  X: { name: 'Air defence zone', col: '255,70,70', mil: 1, vfr: 'no',
    who: 'Anything in its height band without clearance is treated as suspect.', sep: 'Civil flights are kept above or below it, so an airway can pass over it.', need: '' }
};
const RANK = 'RXQABCDEG';
const needsClr = c => { const C = IC.ASP_CLS[c]; return C.vfr === 'no' || C.vfr === 'clr' || C.vfr === 'call'; };
IC.aspNeedsClr = needsClr;
A.aFloor = IC.flKm(195);     // airways are class A from FL195 up, class E below down to their floor
A.wayLo = IC.flKm(60);
A.wayW = 90;                 // an airway is 9 km (5 NM) either side of its centre line
A.glide = 160;               // arrivals come down 1 km every 16 km (about 3.5°)
A.climb = 90;                // departures go up 1 km every 9 km
A.ctlCost = 0.08;            // ₭M an hour per controller
A.per = { twr: 5, app: 7 };  // flights' worth of work one controller handles (area: ctl / 4)
A.seq = 1500;                // arrivals are put in sequence 150 km out
A.stackR = 350;              // holding stacks 35 km out
A.holdR = 45;                // one lap of a hold: about 4 minutes
A.maxSpd = 0.2;              // speed control takes up to a fifth of the time left; vectors do more
/* the height an arrival passes at d units from the runway, and a departure */
IC.aspDescent = d => 0.2 + Math.max(0, d) / A.glide;
IC.aspClimbAt = d => 0.3 + Math.max(0, d) / A.climb;

IC.ASP_PRESETS = {
  field: { name: 'Small field', words: 'A class D control zone to 2,500 ft, 9 km across the runway. Nothing above it is controlled.',
    vols: [{ kind: 'ctr', cls: 'D', r0: 0, r1: 90, lo: 0, hi: IC.flKm(25) }], staff: { twr: 1, app: 0 } },
  regional: { name: 'Regional', words: 'A class D zone to 2,500 ft with two class C shelves above it, out to 40 km and up to FL100.',
    vols: [{ kind: 'ctr', cls: 'D', r0: 0, r1: 110, lo: 0, hi: IC.flKm(25) }, { kind: 'shelf', cls: 'C', r0: 0, r1: 250, lo: IC.flKm(25), hi: IC.flKm(100) }, { kind: 'shelf', cls: 'C', r0: 250, r1: 400, lo: IC.flKm(50), hi: IC.flKm(100) }], staff: { twr: 1, app: 1 } },
  hub: { name: 'Capital hub', words: 'Class B from the ground to FL150 in the middle, with shelves stepping up to 3,000, 5,000 and 7,000 ft out to 60 km: an upside-down wedding cake.',
    vols: [{ kind: 'ctr', cls: 'B', r0: 0, r1: 150, lo: 0, hi: IC.flKm(150) }, { kind: 'shelf', cls: 'B', r0: 150, r1: 300, lo: IC.flKm(30), hi: IC.flKm(150) }, { kind: 'shelf', cls: 'B', r0: 300, r1: 450, lo: IC.flKm(50), hi: IC.flKm(150) }, { kind: 'shelf', cls: 'B', r0: 450, r1: 600, lo: IC.flKm(70), hi: IC.flKm(150) }], staff: { twr: 2, app: 3 } },
  base: { name: 'Air base', words: 'A class D military control zone to 5,000 ft, 18 km across.',
    vols: [{ kind: 'ctr', cls: 'D', r0: 0, r1: 180, lo: 0, hi: IC.flKm(50) }], staff: { twr: 1, app: 0 } }
};
IC.aspPresetFor = ap => ap.kind === 'airbase' ? 'base' : ap.template === 'intl' || ap.template === 'kden' ? 'hub' : /regional/.test(ap.template || '') ? 'regional' : 'field';
const volsChanged = S => { S.asp.volVer = (S.asp.volVer || 0) + 1; S.asp.vi = null; S.asp.zs = null; };
/* every airport of ours has its airspace: the preset for its size until the player changes it */
function ensureVols(S) {
  const N = S.asp; N.vols = N.vols || []; N.secs = N.secs || [];
  for (const ap of IC.bases(S)) {
    if (ap.owner !== 'us') { if (N.vols.some(v => v.ap === ap.id)) { N.vols = N.vols.filter(v => v.ap !== ap.id); N.secs = N.secs.filter(s => s.ap !== ap.id); volsChanged(S); } continue; }
    const k = IC.aspPresetFor(ap);
    if (!ap.asp || (ap.asp.auto && ap.asp.preset !== k)) IC.aspPreset(S, ap, k, true);
  }
  if (!N.secs.some(s => s.kind === 'acc')) {
    const c = IC.cap(S) || { x: IC.WW / 2, y: IC.WH / 2 };
    N.secs.push(newSector('acc', null, 'National area', 4, c.x, c.y));
  }
}
function newSector(kind, ap, name, staff, x, y) { return { id: IC.nid('sec'), kind, ap: ap ? ap.id : null, name, staff, x, y, rules: { space: 1, depBelow: true, stack: 6, lanes: true }, load: 0, cap: 1, work: 0, peak: 0, hand: 0 }; }
/* the final approach fixes of an airport's runways (both ends): the control zone must hold them */
IC.aspFafs = function (ap) {
  const L = [];
  for (const rw of (ap.parts || []).filter(p => p.kind === 'runway')) {
    const d = IC.rwDir(rw);
    L.push({ x: rw.a.x - d.x * IC.GOPS.FAF, y: rw.a.y - d.y * IC.GOPS.FAF, rw, end: IC.rwEnd(rw, 1) }, { x: rw.b.x + d.x * IC.GOPS.FAF, y: rw.b.y + d.y * IC.GOPS.FAF, rw, end: IC.rwEnd(rw, -1) });
  }
  return L;
};
IC.aspPreset = function (S, ap, key, auto) {
  const P = IC.ASP_PRESETS[key]; if (!P) return false;
  const N = S.asp; N.vols = (N.vols || []).filter(v => v.ap !== ap.id);
  // a big layout stretches the preset so that every final approach starts inside the control zone
  const ext = Math.max(0, ...IC.aspFafs(ap).map(f => U.dist(f, ap))) + 25, k = Math.max(1, ext / P.vols[0].r1);
  P.vols.forEach((v, i) => N.vols.push(Object.assign({ id: IC.nid('av'), ap: ap.id, x: ap.x, y: ap.y, name: v.kind === 'ctr' ? 'Control zone' : `Shelf ${i}` }, v, { r0: v.r0 * k, r1: v.r1 * k })));
  ap.asp = { preset: key, auto: !!auto };
  N.secs = (N.secs || []).filter(s => s.ap !== ap.id);
  const nm = short(ap.name);
  N.secs.push(newSector('twr', ap, `${nm} Tower`, P.staff.twr, ap.x, ap.y));
  if (P.vols.some(v => v.kind === 'shelf')) N.secs.push(newSector('app', ap, `${nm} Approach`, Math.max(1, P.staff.app), ap.x, ap.y));
  volsChanged(S);
  return true;
};
IC.aspVols = (S, ap) => (S.asp.vols || []).filter(v => !ap || v.ap === ap.id);
IC.aspVol = (S, id) => (S.asp.vols || []).find(v => v.id === id);
/* the player reshapes a volume: radii in world units, floor and ceiling in km */
IC.aspSetVol = function (S, v, o) {
  if (o.cls && IC.ASP_CLS[o.cls]) v.cls = o.cls;
  if (o.r1 != null) v.r1 = U.clamp(o.r1, v.r0 + 20, 1500);
  if (o.r0 != null) v.r0 = U.clamp(o.r0, 0, v.r1 - 20);
  if (o.lo != null) v.lo = U.clamp(o.lo, 0, v.hi - 0.15);
  if (o.hi != null) v.hi = U.clamp(o.hi, v.lo + 0.15, 20);
  const ap = v.ap && S.byId[v.ap]; if (ap && ap.asp) ap.asp.auto = false;
  volsChanged(S);
};
/* a new shelf outside the airport's outermost ring, a step higher */
IC.aspAddShelf = function (S, ap, r1) {
  const L = IC.aspVols(S, ap), out = L.reduce((m, v) => v.r1 > m.r1 ? v : m, { r1: 0, lo: 0, hi: IC.flKm(100), cls: 'C' });
  const r0 = out.r1, lo = Math.max(IC.flKm(30), out.lo + IC.flKm(20)), hi = Math.max(lo + 0.6, out.hi);
  const v = { id: IC.nid('av'), ap: ap.id, x: ap.x, y: ap.y, kind: 'shelf', cls: out.kind === 'ctr' ? (out.cls === 'B' ? 'B' : 'C') : out.cls, r0, r1: Math.max(r0 + 60, r1 || r0 + 150), lo, hi, name: `Shelf ${L.length}` };
  S.asp.vols.push(v);
  if (!S.asp.secs.some(s => s.ap === ap.id && s.kind === 'app')) S.asp.secs.push(newSector('app', ap, `${short(ap.name)} Approach`, 1, ap.x, ap.y));
  if (ap.asp) ap.asp.auto = false;
  volsChanged(S);
  return v;
};
IC.aspDelVol = function (S, v) {
  S.asp.vols = S.asp.vols.filter(x => x !== v);
  const ap = v.ap && S.byId[v.ap];
  if (ap) { if (ap.asp) ap.asp.auto = false; if (!IC.aspVols(S, ap).some(x => x.kind === 'shelf')) S.asp.secs = S.asp.secs.filter(s => !(s.ap === ap.id && s.kind === 'app')); }
  volsChanged(S);
};
/* military areas: restricted (R), danger (Q) or air defence zone (X), each a circle over a height band */
IC.aspAddMil = function (S, x, y, r, lo, hi, cls, name) {
  const v = { id: IC.nid('av'), ap: null, kind: 'mil', cls: cls || 'X', x, y, r0: 0, r1: r, lo, hi, name: name || `${IC.ASP_CLS[cls || 'X'].name} ${IC.nearestPlace(S, x, y)}` };
  S.asp.vols.push(v); volsChanged(S);
  IC.log(S, 'info', 'AIRSPACE', `${v.name} published: ${U.km(r)} radius, ${IC.flText(lo)} to ${IC.flText(hi)}. ${IC.ASP_CLS[v.cls].sep}`, v);
  return v;
};
/* the volumes over a point, found through a coarse grid */
function volIndex(S) {
  const N = S.asp;
  if (N.vi && N.vi.ver === N.volVer) return N.vi;
  const CS = 1000, m = new Map();
  for (const v of N.vols) for (let i = Math.floor((v.x - v.r1) / CS); i <= Math.floor((v.x + v.r1) / CS); i++) for (let j = Math.floor((v.y - v.r1) / CS); j <= Math.floor((v.y + v.r1) / CS); j++) { const k = i * 4096 + j; (m.get(k) || m.set(k, []).get(k)).push(v); }
  return (N.vi = { ver: N.volVer, m, CS });
}
IC.aspVolsAt = function (S, x, y, alt) {
  const I = volIndex(S), L = I.m.get(Math.floor(x / I.CS) * 4096 + Math.floor(y / I.CS)), out = [];
  if (L) for (const v of L) { if (alt != null && (alt < v.lo || alt >= v.hi)) continue; const d = U.dxy(x, y, v.x, v.y); if (d >= v.r0 && d < v.r1) out.push(v); }
  return out;
};
/* the airway corridor a point is in, if any */
IC.aspWayNear = function (S, x, y) {
  for (const w of S.asp.ways) { const [a, b] = IC.aspWayEnds(S, w); if (U.segDist(x, y, a.x, a.y, b.x, b.y) < A.wayW) return w; }
  return null;
};
/* the class here: the strictest volume, else the airway's (A above FL195, E below), else G */
IC.aspClassAt = function (S, x, y, alt) {
  let best = null;
  for (const v of IC.aspVolsAt(S, x, y, alt)) if (!best || RANK.indexOf(v.cls) < RANK.indexOf(best.cls)) best = v;
  if (best && (IC.ASP_CLS[best.cls].mil || RANK.indexOf(best.cls) <= 1)) return { cls: best.cls, vol: best };
  if (alt >= A.wayLo) { const w = IC.aspWayNear(S, x, y); if (w) { const c = alt >= A.aFloor ? 'A' : 'E'; if (!best || RANK.indexOf(c) < RANK.indexOf(best.cls)) return { cls: c, way: w }; } }
  return best ? { cls: best.cls, vol: best } : { cls: 'G' };
};
/* compatibility: the control zone or terminal area a flight is in that needs a clearance (as { z: { ap }, kind }) */
IC.aspZoneAt = function (S, x, y, alt) {
  for (const v of IC.aspVolsAt(S, x, y, alt)) if (v.ap && needsClr(v.cls)) return { z: { ap: S.byId[v.ap] }, kind: v.kind === 'ctr' ? 'ctr' : 'tma', vol: v };
  return null;
};
/* each airport's airspace as circles, for drawing and the old callers */
IC.aspZones = function (S) {
  const N = S.asp; if (!N.vols) ensureVols(S);
  if (N.zs && N.zs.ver === N.volVer) return N.zs.L;
  const L = [];
  for (const ap of IC.bases(S)) { const V = IC.aspVols(S, ap); if (!V.length) continue; const c = V.find(v => v.kind === 'ctr'); L.push({ ap, x: ap.x, y: ap.y, ctr: c ? c.r1 : 0, tma: Math.max(0, ...V.filter(v => v.kind === 'shelf').map(v => v.r1)) }); }
  N.zs = { ver: N.volVer, L };
  return L;
};
IC.aspTop = (S, ap) => Math.max(0, ...IC.aspVols(S, ap).map(v => v.hi));
IC.aspOuter = (S, ap) => Math.max(0, ...IC.aspVols(S, ap).map(v => v.r1));

/* ---------- the design: what is wrong with an airport's airspace, in plain words ---------- */
IC.aspCheck = function (S, ap) {
  const V = IC.aspVols(S, ap), W = [];
  if (!V.length) return ['No controlled airspace: airliners and light aircraft mix here with nobody keeping them apart.'];
  const outer = IC.aspOuter(S, ap), top = IC.aspTop(S, ap);
  // arrivals must stay inside on the way down: find where the descent leaves every volume
  let gap = null;
  for (let r = 45; r < outer; r += 10) {
    const a = IC.aspDescent(r);
    if (a > top) break;
    const inside = V.some(v => r >= v.r0 && r < v.r1 && a >= v.lo && a < v.hi);
    if (!inside) { if (!gap) gap = { r0: r - 5, a }; gap.r1 = r + 5; }
    else if (gap) break;
  }
  if (gap) {
    const v = V.find(v => gap.r0 + 5 >= v.r0 && gap.r0 + 5 < v.r1 && v.lo > gap.a);
    W.push(`Arrivals leave controlled airspace ${Math.round(gap.r0 / 10)}–${Math.round(gap.r1 / 10)} km out: they pass there at about ${IC.flText(gap.a)}${v ? `, under the floor of ${v.name.toLowerCase()} (${IC.flText(v.lo)})` : ', above the ceiling'}. ${v ? 'Lower that floor' : 'Raise the ceiling'} so they stay inside.`);
  }
  const out = IC.aspFafs(ap).filter(f => !V.some(v => { const d = U.dist(f, v); return d >= v.r0 && d < v.r1 && v.lo <= 0.45 && v.hi > 0.45; }));
  if (out.length) W.push(`The final approach to runway ${out.map(f => f.end).join(', ')} starts outside controlled airspace: make the control zone at least ${Math.ceil(Math.max(...IC.aspFafs(ap).map(f => U.dist(f, ap))) / 10 + 2)} km across the middle.`);
  if (top < IC.aspDescent(outer) - 0.2) W.push(`The terminal area's ceiling (${IC.flText(top)}) is below where arrivals start down at its edge (${IC.flText(IC.aspDescent(outer))}): they come in from above, uncontrolled until they reach it.`);
  // radar: classes B and C need it
  const need = V.filter(v => IC.ASP_CLS[v.cls].radar);
  if (need.length) {
    let n = 0, seen = 0;
    for (const v of need) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, r = (v.r0 + v.r1) / 2, x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r; n++; if (IC.aspCovAlt(S, x, y) <= Math.max(v.lo, 0.3)) seen++; }
    if (seen / n < 0.8) W.push(`Class ${need[0].cls} needs radar, but radar sees only ${Math.round(seen / n * 100)}% of it at its floor. An approach radar at the airport, or a radar nearby, would cover it.`);
  }
  // the controllers: the traffic the terminal area holds at once
  const st = ap.st || {}, mv = st.movesPerHour || 0;
  for (const s of IC.aspSectors(S).filter(s => s.ap === ap.id)) {
    const est = s.kind === 'app' ? mv * (outer / 18) / 3600 * 1.3 : mv * 90 / 3600, cap = sectorCap(S, s);
    if (Math.max(est, s.peak) > cap * 1.05) W.push(`${s.name}: about ${Math.round(Math.max(est, s.peak))} flights' work at the busiest for ${s.staff} controller${s.staff > 1 ? 's' : ''} (they handle ${Math.round(cap)}). ${s.kind === 'app' ? 'Add a controller, or make the terminal area smaller.' : 'Add a controller.'}`);
  }
  if (ap.kind === 'airport' && V.some(v => v.cls === 'D') && mv > 30) W.push('A busy airport with class D: light aircraft only call the tower and are not kept apart from airliners. Class C or B keeps them apart.');
  const low = V.find(v => v.kind === 'shelf' && v.lo < 0.45 && v.r1 > 200);
  if (low) W.push(`${low.name} starts only ${IC.flText(low.lo)} up out to ${Math.round(low.r1 / 10)} km: light aircraft have no room to pass under it and must fly round.`);
  return W;
};

/* ---------- sectors and controllers ---------- */
IC.aspSectors = S => { if (!S.asp.secs) ensureVols(S); return S.asp.secs; };
IC.aspSector = (S, id) => IC.aspSectors(S).find(s => s.id === id);
function sectorCap(S, s) {
  const per = s.kind === 'acc' ? A.ctl / 4 : A.per[s.kind];
  const ap = s.ap && S.byId[s.ap], radar = ap && (ap.parts || []).some(p => p.kind === 'atc' && p.built && p.hp > 0);
  return s.staff * per + (radar && s.kind !== 'acc' ? 4 : 0);
}
IC.aspSectorCap = sectorCap;
IC.aspSetStaff = function (S, s, n) { s.staff = U.clamp(Math.round(n), s.kind === 'acc' ? 1 : 0, 12); };
/* a new area sector centred here: the country is split between area sectors by whichever centre is nearest */
IC.aspAddSector = function (S, x, y) {
  const n = IC.aspSectors(S).filter(s => s.kind === 'acc').length;
  const s = newSector('acc', null, `${IC.nearestPlace(S, x, y).replace(/^(near|over) /, '')} area`, 2, x, y);
  S.asp.secs.push(s);
  IC.log(S, 'info', 'AIRSPACE', `A new area sector (${n + 1} in all) takes the flights nearest ${s.name.replace(/ area$/, '')} off the others' hands, with ${s.staff} controllers.`);
  return s;
};
IC.aspDelSector = function (S, s) { if (s.kind !== 'acc' || IC.aspSectors(S).filter(x => x.kind === 'acc').length < 2) return false; S.asp.secs = S.asp.secs.filter(x => x !== s); return true; };
/* which sector a flight is in: the tower in a control zone, approach in a terminal area, else the nearest area */
IC.aspSectorAt = function (S, x, y, alt) {
  const L = IC.aspSectors(S);
  for (const v of IC.aspVolsAt(S, x, y, alt)) if (v.ap) {
    const want = v.kind === 'ctr' ? 'twr' : 'app';
    const s = L.find(s => s.ap === v.ap && s.kind === want) || L.find(s => s.ap === v.ap);
    if (s && s.staff > 0) return s;
  }
  let best = null, bd = Infinity;
  for (const s of L) if (s.kind === 'acc') { const d = U.dxy(x, y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
  return best;
};
IC.aspStaffCost = S => IC.aspSectors(S).reduce((a, s) => a + s.staff, 0) * A.ctlCost;

IC.airspace = function (S, dt) {
  const N = S.asp; if (!N) return;
  if (!N.vols || !N.secs) ensureVols(S);
  N.hourT += dt;
  if (N.hourT >= 3600) { N.hourT -= 3600; clubs(S); ensureVols(S); for (const s of N.secs) s.peak *= 0.5; if (((S.time % 86400) + 86400) % 86400 < 3600) N.day = { los: 0, near: 0, inf: 0 }; }
  N.scanT -= dt; if (N.scanT > 0) return;
  N.scanT = 2;
  N.radars = IC.aspRadars(S);
  IC.aspCov(S);
  if (S.mode === 'academy') return;
  for (const k in N.pairs) if (S.time - N.pairs[k].t > 900) delete N.pairs[k];
  const F = [];
  for (const t of S.threats) if (!t.dead && t.d.civil && !t.hostileCiv && t.alt > 0.2 && IC.inHome(t.x, t.y)) F.push(t);
  workload(S, F);
  // pairs through a grid of 70 km cells: only neighbours are compared
  const CS = 700, G = new Map();
  for (const t of F) { const k = Math.floor(t.x / CS) * 4096 + Math.floor(t.y / CS); (G.get(k) || G.set(k, []).get(k)).push(t); }
  for (const a of F) {
    if (a.type === 'ga') infringe(S, a); else levels(S, a);
    const ci = Math.floor(a.x / CS), cj = Math.floor(a.y / CS);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const L = G.get(i * 4096 + j); if (!L) continue;
      for (const b of L) {
        if (b.id <= a.id) continue;
        if (a.type === 'ga' && b.type === 'ga') continue;
        if (Math.abs(a.x - b.x) > 700 || Math.abs(a.y - b.y) > 700) continue;
        if (a.appr && b.appr) continue; // arrivals in the approach are sequenced by the tower
        pair(S, a, b);
      }
    }
  }
};
/* the spacing two flights need here, and whether they have lost it: 1,000 ft above or below, or 5 NM apart where
   radar sees both (twice that where it does not) */
IC.aspSpacing = function (S, a, b) {
  const ga = a.type === 'ga' || b.type === 'ga', both = seen(S, a) && seen(S, b);
  const need = ga ? A.gaNear : both ? A.sep : A.sep * 2, vneed = ga ? A.gaVsep : A.vsep;
  const d = U.dist(a, b), dz = Math.abs(a.alt - b.alt);
  return { d, dz, need, vneed, lost: d < need && dz < vneed - 1e-6, near: d < (ga ? A.gaNear : A.near) && dz < vneed - 1e-6 };
};
function pair(S, a, b) {
  const N = S.asp, ga = a.type === 'ga' || b.type === 'ga';
  const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
  const d = U.dist(a, b), dz = Math.abs(a.alt - b.alt);
  let P = N.pairs[key];
  // look 2½ min ahead: controllers act on conflicts they can see
  if (!P || S.time - P.t > 300) {
    const rx = b.x - a.x, ry = b.y - a.y, vx = (b.vx || 0) - (a.vx || 0), vy = (b.vy || 0) - (a.vy || 0), v2 = vx * vx + vy * vy;
    const tc = U.clamp(v2 ? -(rx * vx + ry * vy) / v2 : 0, 0, 150), miss = Math.hypot(rx + vx * tc, ry + vy * tc);
    const need = ga ? A.gaNear * 2 : A.sep, vneed = ga ? A.gaVsep * 2 : A.vsep;
    if (miss < need && dz < vneed + 0.3) {
      const sa = seen(S, a), sb = seen(S, b), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, alt = Math.min(a.alt, b.alt);
      const C = IC.ASP_CLS[IC.aspClassAt(S, mid.x, mid.y, alt).cls], sec = IC.aspSectorAt(S, mid.x, mid.y, alt);
      // with both on radar they solve it; by timing alone at a known crossing, most of the time. Unseen and off the
      // airways, procedural control (a level and a time slot for each flight) works while the sky is quiet and
      // fails as it fills; overloaded controllers miss even what they can see. A light aircraft is kept apart only
      // where its class says so (B and C); elsewhere its pilot is told and looks out
      const w = Math.max(sec ? sec.work : 0, 0), proc = ga ? 0 : U.clamp(0.9 * (1 - w), 0, 0.8);
      let can = sa && sb ? 1 / Math.max(1, w * w) : Math.max(!ga && a.net && b.net ? 0.6 : 0, proc);
      if (ga && !C.sepVfr) can *= sa && sb ? 0.6 : 0.3;
      if (sec && sec.rules.space > 1) can = Math.min(1, can * 1.15);
      const man = a.pCmd || b.pCmd;
      P = N.pairs[key] = { t: S.time, ok: !man && Math.random() < can, sa, sb, w, cls: C, sec: sec && sec.name, man };
      if (P.ok) { N.stats.solved++; solve(a, b); }
    }
  }
  if (P && P.ok) return;
  const sp = IC.aspSpacing(S, a, b);
  if (!sp.lost) return;
  P = N.pairs[key] || (N.pairs[key] = { t: S.time, sa: seen(S, a), sb: seen(S, b), w: 0 });
  // report the loss once, and again if it gets as close as a near miss
  const near = sp.near;
  if (P.lost && (P.near || !near)) return;
  if (!P.lost) N.day.los++, N.stats.los++;
  P.lost = S.time; P.near = near; P.t = S.time;
  lossOfSeparation(S, a, b, d, dz, near, P);
}
/* how busy each sector's controllers are: each flight takes their attention, less on an airway and more where no
   radar sees it, more climbing, descending or holding, and for each handover. Light aircraft count where their class
   has controllers talk to them. Over capacity a sector spaces departures wider and misses conflicts */
function workload(S, F) {
  const N = S.asp, L = IC.aspSectors(S);
  for (const s of L) { s.load = 0; s.hand = 0; }
  for (const t of F) {
    const s = IC.aspSectorAt(S, t.x, t.y, t.alt); if (!s) continue;
    if (t.sec !== s.id) { if (t.sec) { s.hand++; N.stats.hand = (N.stats.hand || 0) + 1; } t.sec = s.id; }
    let w;
    if (t.type === 'ga') { const c = IC.aspClassAt(S, t.x, t.y, t.alt).cls; w = c === 'B' || c === 'C' ? 0.5 : c === 'D' ? 0.3 : 0; }
    else w = (t.net ? 0.6 : 1) * (seen(S, t) ? 1 : 1.5) * (t.stk ? 1.5 : Math.abs((t.lvl != null ? t.lvl : t.alt) - t.alt) > 0.3 ? 1.3 : 1);
    s.load += w;
  }
  let load = 0, cap = 0;
  for (const s of L) {
    s.load += s.hand * 0.3; s.cap = Math.max(0.5, sectorCap(S, s)); s.work = s.load / s.cap; s.peak = Math.max(s.peak, s.load);
    load += s.load; cap += s.cap;
    if (s.work > 1.1 && S.time - (s.overT || -1e9) > 3 * 3600) {
      s.overT = S.time;
      IC.log(S, 'warn', 'AIRSPACE', `${s.name} is overloaded: ${Math.round(s.load)} flights' worth of work for ${s.staff} controller${s.staff === 1 ? '' : 's'}, who handle ${Math.round(s.cap)}. They hold departures longer and can miss a conflict. Add a controller${s.kind === 'acc' ? ', split the area into another sector,' : ''} or put flights on airways under radar.`, s.ap ? S.byId[s.ap] : null);
      IC.emit(S, 'overload', { load: s.load, cap: s.cap, sec: s });
    }
  }
  N.load = load; N.cap = cap; N.work = load / Math.max(1, cap);
  // the whole country's team: kept for the top bar and older callers
  if (N.work > 1.1 && S.time - (N.overT || -1e9) > 3 * 3600) { N.overT = S.time; IC.emit(S, 'overload', { load, cap }); }
}
IC.aspWork = S => S.asp ? { load: S.asp.load, cap: S.asp.cap, work: S.asp.work, secs: S.asp.secs } : null;
/* the controller moves one of them up or down 2,000 ft for a few minutes */
function solve(a, b) {
  const t = a.type === 'ga' ? b : b.type === 'ga' ? a : a.stk ? b : b.stk ? a : (a.cruise && a.alt >= a.cruise - 0.1 ? a : b);
  t.aspDz = t.alt < (t === a ? b : a).alt ? -0.61 : 0.61; t.aspDzT = 240;
  if (t.type === 'ga' || t.aspDz < 0 && t.alt < 2) t.aspDz = 0.61;
}
/* ---------- levels: step climbs out of the terminal area, military bands kept clear ---------- */
function levels(S, t) {
  if (t.pCmd && t.clr != null) return;
  // departures stay under the arrivals until they leave the terminal area, then climb in steps to cruise
  if (t.clr != null && t.clr < (t.cruise || 11) - 0.05 && !t.stk && S.time >= (t.clrT || 0)) {
    const o = t.orig && t.orig.apt && S.byId[t.orig.apt];
    if (!o || U.dist(t, o) > IC.aspOuter(S, o)) { t.clr = Math.min(t.cruise, t.clr + 0.61); t.clrT = S.time + 60 * Math.max(1, IC.aspSectorAt(S, t.x, t.y, t.alt).work || 0); if (t.clr >= t.cruise - 0.05) t.clr = null; }
  }
  // a military band ahead: over it if the aircraft can, else under it
  for (const v of S.asp.vols) {
    if (v.kind !== 'mil') continue;
    const d = U.dist(t, v); if (d > v.r1 + 250) continue;
    const want = t.clr != null ? t.clr : t.cruise || t.alt;
    if (want < v.lo - 0.15 || want > v.hi + 0.15) continue;
    t.clr = v.hi + 0.61 <= 12.8 ? v.hi + 0.61 : Math.max(0.6, v.lo - 0.61); t.clrT = S.time + 600; t.milV = v.id;
  }
  if (t.milV) { const v = IC.aspVol(S, t.milV); if (!v || U.dist(t, v) > v.r1 + 300) { t.milV = null; if (!t.pCmd) t.clr = null; } }
}
function lossOfSeparation(S, a, b, d, dz, near, P) {
  const N = S.asp, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, where = IC.nearestPlace(S, x, y);
  const ga = a.type === 'ga' ? a : b.type === 'ga' ? b : null, ifr = ga === a ? b : a;
  const C = P.cls || IC.ASP_CLS[IC.aspClassAt(S, x, y, Math.min(a.alt, b.alt)).cls];
  const [cause, why] = P.man ? ['player', `${(a.pCmd ? a : b).cs} was flying the level or heading you gave it, and the controllers left it to you`]
    : ga && !ga.sq ? ['unseen', `${ga.cs} is a light aircraft flying without a transponder, so the civil radar could not see it. An approach radar sees aircraft without transponders`]
    : ga && ga.infT ? ['infringe', `${ga.cs} is a light aircraft that flew into controlled airspace without clearance`]
    : ga && !C.sepVfr ? ['class', `In ${C.name.toLowerCase()} controllers only tell airliners about light aircraft; they do not keep them apart. Class C or B would`]
    : !P.sa && !P.sb ? ['radar', 'Controllers could not see either of them: no radar covers them at that height. A radar that covers this area, or airways that keep crossing traffic apart, would have prevented it']
    : !P.sa || !P.sb ? ['radar', `Controllers could not see ${(!P.sa ? a : b).cs}: no radar covers it at that height`]
    : P.w > 1 ? ['staff', `${P.sec || 'The sector'} was overloaded (${Math.round(P.w * 100)}% of what its controllers can handle) and missed it. Another controller would have caught it`]
    : ['timing', 'Both were outside radar cover on airways, and controllers kept them apart by timing alone at the crossing'];
  N.causes = N.causes || {}; N.causes[cause] = (N.causes[cause] || 0) + 1;
  const gap = `${U.km(d)} apart and ${Math.round(dz * IC.FT / 100) * 100} ft above or below`;
  if (near) { N.stats.near++; N.day.near++; }
  const txt = near ? `${a.cs} and ${b.cs} passed ${gap} near ${where}` : `${a.cs} and ${b.cs} lost spacing near ${where}: ${gap}`;
  if (near && S.inc) for (const it of S.inc.list) if (it.kind === 'separation' && (it.ref === a || it.ref === b)) it.done = true;
  IC.incidentAdd(S, near ? 'nearmiss' : 'separation', ifr, txt, near ? 'alarm' : 'warn');
  IC.log(S, 'warn', 'AIRSPACE', `${near ? 'Near miss: ' : ''}${txt}. ${why}.`, { x, y });
  for (const t of [a, b]) if (t.tail && S.av) { const al = IC.avAirline(S, t.tail.al); if (al) al.sat = Math.max(0, al.sat - (near ? 8 : 2)); }
  if (near) {
    S.support = Math.max(0, S.support - 1);
    IC.news(S, `Near miss over ${where}: ${a.cs} and ${b.cs} came within ${U.km(d)} of each other.`);
    if (S.camp && IC.card) IC.card(S, 'Near miss', `${U.clock(S.time)} · near ${where}`, `${a.cs} and ${b.cs} passed ${gap}. ${why}. The Prime Minister's office wants to know how it happened.`, 'event');
  }
  IC.emit(S, near ? 'nearMiss' : 'lossSep', { a, b, d, dz, x, y, why, cause });
}
/* light aircraft inside airspace they were not cleared into (careful pilots fly round or under it) */
function infringe(S, t) {
  if (!t.careless) return;
  const v = IC.aspVolsAt(S, t.x, t.y, t.alt).find(v => needsClr(v.cls) && !(v.ap && (t.cleared || []).includes(v.ap)));
  if (!v) { t.infFlag = false; return; }
  if (t.infFlag) return;
  t.infT = S.time;
  if (!t.det) return; // nobody sees it
  t.infFlag = true;
  const N = S.asp; N.stats.inf++; N.day.inf++;
  const ap = v.ap && S.byId[v.ap], area = v.kind === 'ctr' ? 'control zone' : v.kind === 'mil' ? IC.ASP_CLS[v.cls].name.toLowerCase() : 'terminal area';
  const where = ap ? `the ${short(ap.name)} ${area}` : v.name;
  IC.incidentAdd(S, 'infringe', t, `${t.cs}, a light aircraft, is in ${where} without clearance. Call it on the radio`, 'warn');
  IC.log(S, 'info', 'AIRSPACE', `${t.cs}, a light aircraft, flew into ${where} (${IC.ASP_CLS[v.cls].name}, ${IC.flText(v.lo)}–${IC.flText(v.hi)}) without clearance. ${v.kind === 'mil' ? 'It is in a military height band.' : 'Airliners climb and descend there.'} Call it on the radio to send it out.`);
  if (v.cls === 'X' && IC.setAff && t.aff !== 'S' && t.aff !== 'H') IC.setAff(S, t, 'S', 'in the air defence zone without clearance');
  IC.emit(S, 'infringement', { t, ap, kind: v.kind === 'ctr' ? 'ctr' : v.kind === 'mil' ? 'mil' : 'tma', vol: v });
}

/* ---------- arrivals: sequence, speed, vectors and holding stacks ----------
   150 km out each arrival gets a landing slot, one runway gap after the last (the gap comes from the runways and the
   tower's rules, airport.js). A small delay is flown off by slowing down, a bigger one by a dog-leg on a heading;
   beyond that the arrival joins a holding stack 35 km out, at the lowest free level, 1,000 ft above the one below.
   The bottom aircraft leaves when its slot comes, and everyone above steps down a level. */
const STACKS = [['NE', -Math.PI / 4], ['SE', Math.PI / 4], ['SW', 3 * Math.PI / 4], ['NW', -3 * Math.PI / 4]];
IC.atcArr = function (S, ap) { const N = S.asp, M = N.arr || (N.arr = {}); return M[ap.id] || (M[ap.id] = { last: 0, stacks: {}, logT: -1e9, n: 0 }); };
IC.atcGap = function (S, ap) {
  const st = ap.st || {}, s = IC.aspSectors(S).find(x => x.ap === ap.id && x.kind === 'app') || IC.aspSectors(S).find(x => x.ap === ap.id);
  return (st.arrPerHour > 0 ? 3600 / st.arrPerHour : IC.aptSep(st)) * (s ? s.rules.space : 1);
};
IC.atcStackPos = function (S, ap, k) { const a = STACKS.find(s => s[0] === k)[1]; return { x: ap.x + Math.cos(a) * A.stackR, y: ap.y + Math.sin(a) * A.stackR, name: `${short(ap.name)} ${k}` }; };
const stackBase = () => IC.flKm(Math.ceil(IC.flOf(IC.aspDescent(A.stackR)) / 10) * 10);
IC.atcStackLevel = i => stackBase() + i * IC.flKm(10);
/* the stacks at an airport: { k, x, y, name, lv: [flights, bottom first] } */
IC.atcStacks = function (S, ap) {
  const R = IC.atcArr(S, ap), out = [];
  for (const [k] of STACKS) { const s = R.stacks[k]; if (!s || !s.lv.length) continue; const byId = new Map(S.threats.map(t => [t.id, t])); out.push(Object.assign(IC.atcStackPos(S, ap, k), { k, lv: s.lv.map(id => byId.get(id)).filter(Boolean) })); }
  return out;
};
IC.atcSequence = function (S, t, ap, remain) {
  const R = IC.atcArr(S, ap), gap = IC.atcGap(S, ap), fly = remain / t.spd, eta = S.time + fly;
  const slot = Math.max(eta, R.last + gap), delay = slot - eta;
  t.seq = true; t.slot = slot; R.last = slot; R.n++;
  if (delay <= fly * A.maxSpd) { t.spdF = fly / (fly + delay); return 'speed'; }
  // a dog-leg 40° off course and back: each extra minute costs about four minutes on the heading
  if (delay <= fly * A.maxSpd + 240) {
    t.spdF = 1 / (1 + A.maxSpd);
    const extra = delay - fly * A.maxSpd, c = 1 - Math.cos(0.7), L = extra * t.spd * t.spdF / (2 * c);
    t.vector = Math.atan2(t.dest.y - t.y, t.dest.x - t.x) + (Math.random() < 0.5 ? 0.7 : -0.7); t.vectorT = L / (t.spd * t.spdF); t.seqVec = true;
    return 'vector';
  }
  IC.atcJoin(S, ap, t);
  return 'hold';
};
IC.atcJoin = function (S, ap, t) {
  const R = IC.atcArr(S, ap), a = Math.atan2(t.y - ap.y, t.x - ap.x);
  let best = STACKS[0], bd = 9;
  for (const s of STACKS) { const d = Math.abs(U.angWrap(s[1] - a)); if (d < bd) { bd = d; best = s; } }
  const k = best[0], st = R.stacks[k] || (R.stacks[k] = { lv: [] });
  const sec = IC.aspSectors(S).find(x => x.ap === ap.id && x.kind === 'app'), max = sec ? sec.rules.stack : 6;
  st.lv.push(t.id); t.stk = { ap: ap.id, k }; t.holdT = t.holdT || 0; t.spdF = 1;
  if (st.lv.length > max && S.time - (R.fullT || -1e9) > 3600) { R.fullT = S.time; IC.log(S, 'warn', 'AIRSPACE', `${short(ap.name)} ${k} stack is full: ${st.lv.length} aircraft for ${max} levels. The newest holds above the stack, outside the levels the approach controllers planned. The runways take one arrival every ${U.dur(IC.atcGap(S, ap))}.`, ap); }
  else if (st.lv.length >= 3 && S.time - R.logT > 3600) { R.logT = S.time; IC.log(S, 'info', 'AIRSPACE', `${short(ap.name)} Approach: ${st.lv.length} arrivals holding in the ${k} stack, ${IC.flText(IC.atcStackLevel(0))} to ${IC.flText(IC.atcStackLevel(st.lv.length - 1))}. The runways take one every ${U.dur(IC.atcGap(S, ap))}.`, ap); }
  IC.emit(S, 'stackJoin', { t, ap, k, n: st.lv.length });
};
IC.atcLeave = function (S, t) {
  if (!t.stk) return;
  const ap = S.byId[t.stk.ap], st = ap && IC.atcArr(S, ap).stacks[t.stk.k];
  if (st) st.lv = st.lv.filter(id => id !== t.id);
  t.stk = null;
};
IC.atcStackIndex = function (S, t) { const ap = S.byId[t.stk.ap], st = IC.atcArr(S, ap).stacks[t.stk.k]; return st ? st.lv.indexOf(t.id) : 0; };
/* fly the hold: to the fix, round it at the level given; the bottom one leaves when its slot comes */
IC.atcHold = function (S, t, dt) {
  const ap = S.byId[t.stk.ap], fix = IC.atcStackPos(S, ap, t.stk.k), i = IC.atcStackIndex(S, t), lvl = IC.atcStackLevel(Math.max(0, i));
  t.lvl = lvl; t.holdT = (t.holdT || 0) + dt;
  const spd = Math.min(t.spd, 1.3), d = U.dist(t, fix);
  let hd;
  if (d > A.holdR * 1.4 && !t.inHold) hd = Math.atan2(fix.y - t.y, fix.x - t.x);
  else { t.inHold = true; t.hoa = (t.hoa == null ? Math.atan2(t.y - fix.y, t.x - fix.x) : t.hoa) + dt * spd / A.holdR; hd = Math.atan2(fix.y + Math.sin(t.hoa) * A.holdR - t.y, fix.x + Math.cos(t.hoa) * A.holdR - t.x); }
  t.vx = Math.cos(hd) * spd; t.vy = Math.sin(hd) * spd; t.x += t.vx * dt; t.y += t.vy * dt; t.flown += spd * dt;
  t.alt += U.clamp(lvl - t.alt, -0.012 * dt, 0.012 * dt);
  if (i <= 0 && S.time >= (t.slot || 0) - U.dist(fix, ap) / t.spd) { IC.atcLeave(S, t); t.inHold = false; t.hoa = null; return 'go'; }
  return t.holdT > 2400 ? 'divert' : 'hold';
};
/* ---------- standard arrival and departure lanes ----------
   For the runway direction the wind has chosen: arrivals fly from their stack to a gate 15 km out on the extended
   centre line of the main arrival runway, then straight in; departures fly the runway heading for 15 km before they
   turn onto their route. With lanes off, everyone flies direct: shorter, but crossing each other's paths */
A.laneOut = 150;
IC.atcLanes = function (S, ap) {
  const sec = IC.aspSectors(S).find(x => x.ap === ap.id && x.kind === 'app') || IC.aspSectors(S).find(x => x.ap === ap.id);
  if (!sec || sec.rules.lanes === false || !ap.parts) return null;
  const cfg = IC.aptConfig(S, ap); if (!cfg || !cfg.arr.length) return null;
  const N = S.asp, L = N.lanes || (N.lanes = {}), key = `${cfg.t}|${cfg.arr.join()}|${cfg.dep.join()}|${N.volVer}`;
  if (L[ap.id] && L[ap.id].key === key) return L[ap.id];
  const rw = id => ap.parts.find(p => p.id === id);
  const main = rw(cfg.arr[0]); if (!main) return null;
  const d = IC.rwDir(main), dir = cfg.rw[main.id].dir, th = dir > 0 ? main.a : main.b;
  const gate = { x: th.x - d.x * dir * A.laneOut, y: th.y - d.y * dir * A.laneOut, name: `${IC.rwEnd(main, dir)} gate` };
  const out = { key, gate, rw: IC.rwEnd(main, dir), arr: STACKS.map(([k]) => ({ k, pts: [IC.atcStackPos(S, ap, k), gate, { x: th.x, y: th.y }] })), dep: [] };
  for (const id of cfg.dep) {
    const r = rw(id); if (!r) continue;
    const dd = cfg.rw[id].dir, e = IC.rwDir(r), st = dd > 0 ? r.a : r.b, end = dd > 0 ? r.b : r.a;
    out.dep.push({ rw: IC.rwEnd(r, dd), pts: [{ x: st.x, y: st.y }, { x: end.x + e.x * dd * A.laneOut, y: end.y + e.y * dd * A.laneOut }] });
  }
  return (L[ap.id] = out);
};
/* where a departure off this airport goes first: the end of its lane */
IC.atcDepLane = function (S, ap, x, y) {
  const Ln = IC.atcLanes(S, ap); if (!Ln || !Ln.dep.length) return null;
  let best = null, bd = Infinity;
  for (const l of Ln.dep) { const d = U.dxy(x, y, l.pts[0].x, l.pts[0].y); if (d < bd) { bd = d; best = l; } }
  return best.pts[1];
};

/* the player on the radio: a level (km), a heading (radians), a hold where it is, clearance into an airport's
   airspace for a light aircraft, or back to the controllers */
IC.atcCmd = function (S, t, c) {
  if (!t || t.dead || !t.d.civil) return false;
  const say = m => IC.log(S, 'info', 'RADIO', `${t.cs}: "${m}"`, t);
  if (c.lvl != null) { t.clr = U.clamp(c.lvl, t.type === 'ga' ? 0.3 : 0.9, t.type === 'ga' ? 3.5 : 12.8); t.pCmd = true; if (t.type === 'ga') t.gaAlt = t.clr; say(`${t.clr > t.alt ? 'Climbing' : 'Descending'} to ${IC.flText(t.clr)}.`); }
  if (c.hdg != null) { t.vector = c.hdg; t.vectorT = c.for || 600; t.pCmd = true; say(`Heading ${String(Math.round(U.mod(c.hdg * 180 / Math.PI + 90, 360))).padStart(3, '0')} for ${Math.round((c.for || 600) / 60)} minutes.`); }
  if (c.hold) { t.phold = { x: t.x, y: t.y }; t.pCmd = true; say('Holding here.'); }
  if (c.clear) { t.cleared = (t.cleared || []).concat(c.clear); if (t.type === 'ga' && !t.careless) IC.gaReplan(S, t); say(`Cleared into ${short(S.byId[c.clear].name)} airspace.`); }
  if (c.resume) { t.pCmd = false; t.clr = null; t.vector = null; t.phold = null; t.hoa = null; if (t.tail || t.plan) { t.wps = IC.avRejoin(t); t.dest = t.wps[0]; } say('Resuming our route with the controllers.'); }
  IC.emit(S, 'atcCmd', { t, c });
  return true;
};
/* fly a hold the player asked for, round where it was */
IC.atcPlayerHold = function (S, t, dt) {
  const f = t.phold, spd = Math.min(t.spd, t.type === 'ga' ? t.spd : 1.3), R = t.type === 'ga' ? 15 : A.holdR;
  t.hoa = (t.hoa == null ? 0 : t.hoa) + dt * spd / R;
  const hd = Math.atan2(f.y + Math.sin(t.hoa) * R - t.y, f.x + Math.cos(t.hoa) * R - t.x);
  t.vx = Math.cos(hd) * spd; t.vy = Math.sin(hd) * spd; t.x += t.vx * dt; t.y += t.vy * dt;
  if (t.clr != null) t.alt += U.clamp(t.clr - t.alt, -0.012 * dt, 0.012 * dt);
};
/* 250 kt below FL100 in classes B, C and D (and E and G): 1.29 units a second */
IC.aspSpeedCap = function (S, t) {
  if (t.alt >= IC.flKm(100)) return Infinity;
  const c = IC.ASP_CLS[IC.aspClassAt(S, t.x, t.y, t.alt).cls];
  return c.kt ? c.kt * 1.852 / 360 : Infinity;
};

/* ---------- light aircraft: fields, clubs, routes ---------- */
function makeFields(S) {
  const W = S.world, R = IC.makeRng((S.seed ^ 0x5eed) >>> 0), L = [];
  const bases = IC.bases(S), towns = W.cities.concat(W.villages).filter(c => IC.inHome(c.x, c.y) && !c.capital);
  const order = towns.map(c => [c, R()]).sort((p, q) => p[1] - q[1]).map(p => p[0]);
  for (const c of order) {
    if (L.length >= 20) break;   // some twenty clubs across the country
    const a = R.range(0, Math.PI * 2), x = c.x + Math.cos(a) * ((c.r || 20) + 40), y = c.y + Math.sin(a) * ((c.r || 20) + 40);
    if (!IC.inHome(x, y) || W.hAt(x, y) > 0.7 || (W.inLake && W.inLake(x, y)) || IC.hostileBorderDist(x, y) < 500) continue;
    if (bases.some(b => U.dxy(x, y, b.x, b.y) < 350) || L.some(f => U.dxy(x, y, f.x, f.y) < 500)) continue;
    L.push(newField(c, x, y, R.range(0, Math.PI)));
  }
  return L;
}
function newField(c, x, y, a) { return { id: IC.nid('gf'), name: `${c.name} airfield`, club: `${c.name} Flying Club`, town: c.id || c.name, x, y, a, mood: 62, moves: 0, today: 0 }; }
/* a light-aircraft field of our own, for the clubs that now fly from a big airport */
IC.aspFieldWhy = function (S, x, y) {
  if (!IC.inHome(x, y)) return 'OUTSIDE THE COUNTRY';
  if (S.world.townAt && S.world.townAt(x, y)) return 'INSIDE A TOWN';
  if (IC.bases(S).some(b => U.dxy(x, y, b.x, b.y) < 180)) return 'TOO CLOSE TO AN AIRPORT';
  if (S.asp.fields.some(f => U.dxy(x, y, f.x, f.y) < 250)) return 'TOO CLOSE TO ANOTHER FIELD';
  if (S.world.hAt(x, y) > 0.7) return 'TOO HILLY';
  if (S.budget < A.FIELD_COST) return 'NOT ENOUGH MONEY';
  return '';
};
IC.aspFoundField = function (S, x, y) {
  if (IC.aspFieldWhy(S, x, y)) return null;
  const c = IC.cities(S).filter(t => t.owner === 'us').sort((p, q) => U.dxy(x, y, p.x, p.y) - U.dxy(x, y, q.x, q.y))[0];
  const f = newField(c || { name: IC.nearestPlace(S, x, y) }, x, y, Math.random() * Math.PI);
  f.mood = 75; f.built = true;
  S.budget -= A.FIELD_COST;
  S.asp.fields.push(f);
  IC.log(S, 'info', 'AIRSPACE', `${f.name} opens (${U.money(A.FIELD_COST)}). Light aircraft from ${c ? c.name : 'nearby'} will fly from here instead of the airport.`, f);
  IC.emit(S, 'fieldOpened', f);
  return f;
};
/* where a town's light aircraft fly from: the nearest field within 40 km, else one of our airports */
IC.gaBase = function (S, town) {
  let best = null, bd = 400;
  for (const f of S.asp.fields) { const d = U.dist(f, town); if (d < bd) { bd = d; best = { x: f.x, y: f.y, name: f.name, field: f.id }; } }
  if (best) return best;
  for (const ap of IC.bases(S)) if (ap.kind === 'airport' && ap.owner === 'us' && !ap.offline) { const d = U.dist(ap, town); if (d < bd) { bd = d; best = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }; } }
  return best;
};
/* light aircraft fly by sight: daylight, and cloud and visibility good enough */
IC.gaWeatherOk = function (S) {
  const h = ((S.time % 86400) + 86400) % 86400 / 3600, wx = IC.wx(S);
  return h >= 7 && h < 19 && wx.eo >= 0.7 && !(wx.fog > 0.08) && !(wx.precip > 0.1);
};
/* airspace a light aircraft may not enter without a clearance: controlled volumes of airports it is not cleared
   into, and military bands */
const barred = (S, v, cleared) => needsClr(v.cls) && !(v.ap && cleared.includes(v.ap));
/* a light aircraft's way from a to b: round the volumes that reach down to the ground it is not cleared into
   (it flies under the shelves) and round the prohibited zones */
IC.gaPath = function (S, a, b, cleared, careless) {
  const pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  if (careless) return pts;
  if (!S.asp.vols) ensureVols(S);
  const C = S.asp.vols.filter(v => v.lo < 0.45 && v.r0 < 20 && barred(S, v, cleared)).map(v => ({ x: v.x, y: v.y, r: v.r1 * 1.15 }));
  if (S.av) for (const z of S.av.zones) C.push({ x: z.x, y: z.y, r: z.r * 1.05 });
  return IC.bendPath(pts, C);
};
/* the height a light aircraft may fly at here: under the shelves it is not cleared into (starting down 15 km out) */
IC.gaCeiling = function (S, t) {
  if (t.careless) return 99;
  let cap = 99;
  for (const v of S.asp.vols || []) {
    if (v.lo < 0.45 && v.r0 < 20 || !barred(S, v, t.cleared || [])) continue;
    const d = U.dxy(t.x, t.y, v.x, v.y);
    if (d < v.r1 + 150 && d > v.r0 - 150) cap = Math.min(cap, v.lo - 0.15);
  }
  return Math.max(0.3, cap);
};
/* a light aircraft on a big airport's runway holds it as long as two airliners */
IC.gaRunway = function (S, ap) {
  ap.gaUntil = Math.max(S.time, ap.gaUntil || 0) + A.gaRwy;
  ap.gaMoves = (ap.gaMoves || []).filter(x => S.time - x < 3600); ap.gaMoves.push(S.time);
  S.budget += 0.02;
};
IC.gaBusy = (S, ap) => (ap.gaUntil || 0) > S.time;
/* say so once the delays add up: 15 min of airliner waiting, at most every 6 hours */
IC.gaDelayNote = function (S, ap, wait) {
  ap.gaWait = (ap.gaWait || 0) + (wait || 6);
  if (ap.gaWait < 900 || (ap.gaNoteT && S.time - ap.gaNoteT < 6 * 3600)) return;
  ap.gaNoteT = S.time; ap.gaWait = 0;
  IC.log(S, 'warn', 'AIRSPACE', `${ap.name}: airliners wait while light aircraft use the runway. Each slow light aircraft holds it as long as two airliners. A light-aircraft field nearby would take them away.`, ap);
};
IC.gaArrive = function (S, t) {
  const b = t.gaTo; if (!b) return;
  if (b.apt && S.byId[b.apt]) IC.gaRunway(S, S.byId[b.apt]);
  const f = b.field && S.asp.fields.find(x => x.id === b.field);
  if (f) { f.moves++; f.today++; S.budget += 0.01; }
};
/* a radio call sends a light aircraft back out of controlled airspace */
IC.gaReplan = function (S, t) {
  t.careless = false;
  const pts = IC.gaPath(S, t, t.gaTo || t.dest, t.cleared || [], false);
  t.wps = pts.slice(1); t.dest = t.wps[0];
};
/* flying clubs: a little money and a lot of voices. Grounded clubs complain */
function clubs(S) {
  const N = S.asp, grounded = S.airspace !== 'open';
  let sum = 0;
  for (const f of N.fields) { f.mood = U.clamp(f.mood + (grounded ? -3 : f.today > 0 ? 0.5 : -0.2), 0, 100); sum += f.mood; }
  if (!N.fields.length) return;
  const m = sum / N.fields.length;
  if (m < 35) { S.support = Math.max(0, S.support - 0.3); if (!N.clubT || S.time - N.clubT > 6 * 3600) { N.clubT = S.time; IC.log(S, 'warn', 'AIRSPACE', 'Flying clubs complain to their members of parliament: they have been kept on the ground for too long.'); IC.news(S, 'Flying clubs protest: "The skies belong to everyone."'); } }
  else if (m > 70) S.support = Math.min(100, S.support + 0.05);
}

})(window.IC);
