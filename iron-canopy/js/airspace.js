/* Iron Canopy — the airspace. The player places fixes (named points) and joins them into airways; each airport
   joins the network by a departure and arrival route to its nearest fix, and airliners fly the shortest way along it.
   Radar sees less the lower an aircraft flies: the curve of the earth and high ground hide it. Controllers keep apart
   the flights they can see; outside radar cover or off the airways they fall back on wide procedural spacing, and
   crossings they cannot see go wrong. Control zones around airports keep light aircraft out unless they are cleared. */
(function (IC) {
'use strict';
const U = IC.U;

const A = IC.ASP = {
  sep: 90, vsep: 0.3,      // radar separation: 9 km (5 NM) apart, or 300 m (1,000 ft) above or below
  near: 30,                // closer than 3 km at the same level is a near miss
  gaNear: 15, gaVsep: 0.15, // a light aircraft and an airliner within 1.5 km and 150 m
  link: 1200,              // an airport joins the network at a fix within 120 km
  gap: 60,                 // departures the same way: 1 min apart with radar and airways
  gate: 250,               // a fix within 25 km of the border is an entry and exit point
  ctl: 40,                 // flights the area controllers can watch at once (a flight on an airway, on radar, counts 0.6):
                           // the centres of a country 3,000 km across
  gaRwy: 150,              // a light aircraft holds a big airport's runway as long as two airliners (s)
  tmaFloor: 1.2, tmaTop: 7,
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
/* cruise levels by direction, 600 m apart: eastbound and westbound traffic on one airway never meet level */
IC.aspLevel = function (base, from, to) {
  const off = to.x >= from.x ? 0 : 0.3;
  return off + Math.round((base - off) / 0.6) * 0.6;
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
  const busy = Math.max(1, S.asp.work || 0);
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

/* control zones round our airports: a zone from the ground up (15 km across the runway), and at the bigger
   airports a terminal area above 1,200 m out to 45 km where airliners climb and descend */
IC.aspZones = function (S) {
  const N = S.asp, bs = IC.bases(S).filter(b => b.owner === 'us');
  if (N.zs && N.zs.n === bs.length) return N.zs.L;
  const L = bs.map(b => ({ ap: b, x: b.x, y: b.y, ctr: b.kind === 'airbase' ? 180 : b.template === 'intl' ? 150 : 110, tma: b.kind === 'airbase' ? 0 : b.template === 'intl' ? 450 : 300 }));
  N.zs = { n: bs.length, L };
  return L;
};
IC.aspZoneAt = function (S, x, y, alt) {
  for (const z of IC.aspZones(S)) {
    const d = U.dxy(x, y, z.x, z.y);
    if (d < z.ctr && alt < A.tmaTop) return { z, kind: 'ctr' };
    if (d < z.tma && alt >= A.tmaFloor && alt < A.tmaTop) return { z, kind: 'tma' };
  }
  return null;
};

IC.airspace = function (S, dt) {
  const N = S.asp; if (!N) return;
  N.hourT += dt;
  if (N.hourT >= 3600) { N.hourT -= 3600; clubs(S); if (((S.time % 86400) + 86400) % 86400 < 3600) N.day = { los: 0, near: 0, inf: 0 }; }
  N.scanT -= dt; if (N.scanT > 0) return;
  N.scanT = 2;
  N.radars = IC.aspRadars(S);
  IC.aspCov(S);
  if (S.mode === 'academy') return;
  for (const k in N.pairs) if (S.time - N.pairs[k].t > 900) delete N.pairs[k];
  const F = S.threats.filter(t => !t.dead && t.d.civil && !t.hostileCiv && t.alt > 0.2 && IC.inHome(t.x, t.y));
  workload(S, F);
  for (let i = 0; i < F.length; i++) {
    const a = F[i];
    if (a.type === 'ga') infringe(S, a);
    for (let j = i + 1; j < F.length; j++) {
      const b = F[j];
      if (a.type === 'ga' && b.type === 'ga') continue;
      if (Math.abs(a.x - b.x) > 700 || Math.abs(a.y - b.y) > 700) continue;
      if (a.appr && b.appr) continue; // arrivals in the approach are sequenced by the tower
      pair(S, a, b);
    }
  }
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
      const sa = seen(S, a), sb = seen(S, b);
      // with both on radar they solve it; by timing alone at a known crossing, most of the time. Unseen and off the
      // airways, procedural control (a level and a time slot for each flight) works while the sky is quiet and
      // fails as it fills; overloaded controllers miss even what they can see
      const w = N.work || 0, proc = ga ? 0 : U.clamp(0.9 * (1 - w), 0, 0.8);
      const can = sa && sb ? 1 / Math.max(1, w * w) : Math.max(!ga && a.net && b.net ? 0.6 : 0, proc);
      P = N.pairs[key] = { t: S.time, ok: Math.random() < can, sa, sb };
      if (P.ok) { N.stats.solved++; solve(a, b); }
    }
  }
  if (P && P.ok) return;
  const lost = ga ? d < A.gaNear && dz < A.gaVsep : d < A.sep && dz < A.vsep;
  if (!lost) return;
  P = N.pairs[key] || (N.pairs[key] = { t: S.time, sa: seen(S, a), sb: seen(S, b) });
  // report the loss once, and again if it gets as close as a near miss
  const near = ga || d < A.near;
  if (P.lost && (P.near || !near)) return;
  if (!P.lost) N.day.los++, N.stats.los++;
  P.lost = S.time; P.near = near; P.t = S.time;
  lossOfSeparation(S, a, b, d, dz, near, P);
}
/* how busy the area controllers are: each airliner over the country takes their attention, less on an airway and
   more where no radar sees it. An approach radar at an airport takes its arrivals and departures off their hands.
   Over capacity they space departures wider and miss conflicts: the growing pain of a sky without a plan */
function workload(S, F) {
  const N = S.asp;
  let load = 0;
  for (const t of F) if (t.type !== 'ga') load += (t.net ? 0.6 : 1) * (seen(S, t) ? 1 : 1.5);
  const atc = IC.bases(S).filter(b => b.owner === 'us' && b.kind === 'airport' && (b.parts || []).some(p => p.kind === 'atc' && p.built)).length;
  N.load = load; N.cap = A.ctl + 4 * atc; N.work = load / N.cap;
  if (N.work > 1.1 && S.time - (N.overT || -1e9) > 3 * 3600) {
    N.overT = S.time;
    const off = F.filter(t => t.type !== 'ga' && !t.net).length;
    IC.log(S, 'warn', 'AIRSPACE', `Controllers are overloaded: ${Math.round(load)} flights' worth of work for a team that handles ${N.cap}. They hold departures longer and can miss a conflict. ${off ? `${off} flights are off the airways. ` : ''}Airways, entry points and radar make each flight easier to watch.`);
    IC.emit(S, 'overload', { load, cap: N.cap });
  }
}
IC.aspWork = S => S.asp ? { load: S.asp.load, cap: S.asp.cap, work: S.asp.work } : null;
/* the controller moves one of them up or down 600 m for a few minutes */
function solve(a, b) {
  const t = a.type === 'ga' ? b : b.type === 'ga' ? a : (a.cruise && a.alt >= a.cruise - 0.1 ? a : b);
  t.aspDz = t.alt < (t === a ? b : a).alt ? -0.6 : 0.6; t.aspDzT = 240;
  if (t.type === 'ga' || t.aspDz < 0 && t.alt < 2) t.aspDz = 0.6;
}
function lossOfSeparation(S, a, b, d, dz, near, P) {
  const N = S.asp, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, where = IC.nearestPlace(S, x, y);
  const ga = a.type === 'ga' ? a : b.type === 'ga' ? b : null, ifr = ga === a ? b : a;
  const why = ga && !ga.sq ? `${ga.cs} is a light aircraft flying without a transponder, so the civil radar could not see it. An approach radar sees aircraft without transponders`
    : ga && ga.infT ? `${ga.cs} is a light aircraft that flew into controlled airspace without clearance`
    : !P.sa && !P.sb ? 'Controllers could not see either of them: no radar covers them at that height. A radar that covers this area, or airways that keep crossing traffic apart, would have prevented it'
    : !P.sa || !P.sb ? `Controllers could not see ${(!P.sa ? a : b).cs}: no radar covers it at that height`
    : 'Both were outside radar cover on airways, and controllers kept them apart by timing alone at the crossing';
  const gap = `${U.km(d)} and ${Math.round(dz * 1000)} m apart`;
  if (near) { N.stats.near++; N.day.near++; }
  const txt = near ? `${a.cs} and ${b.cs} passed ${gap} near ${where}` : `${a.cs} and ${b.cs} lost separation near ${where}: ${gap}`;
  if (near && S.inc) for (const it of S.inc.list) if (it.kind === 'separation' && (it.ref === a || it.ref === b)) it.done = true;
  IC.incidentAdd(S, near ? 'nearmiss' : 'separation', ifr, txt, near ? 'alarm' : 'warn');
  IC.log(S, 'warn', 'AIRSPACE', `${near ? 'Near miss: ' : ''}${txt}. ${why}.`, { x, y });
  for (const t of [a, b]) if (t.tail && S.av) { const al = IC.avAirline(S, t.tail.al); if (al) al.sat = Math.max(0, al.sat - (near ? 8 : 2)); }
  if (near) {
    S.support = Math.max(0, S.support - 1);
    IC.news(S, `Near miss over ${where}: ${a.cs} and ${b.cs} came within ${U.km(d)} of each other.`);
    if (S.camp && IC.card) IC.card(S, 'Near miss', `${U.clock(S.time)} · near ${where}`, `${a.cs} and ${b.cs} passed ${gap}. ${why}. The Prime Minister's office wants to know how it happened.`, 'event');
  }
  IC.emit(S, near ? 'nearMiss' : 'lossSep', { a, b, d, dz, x, y, why });
}
/* light aircraft inside a control zone they were not cleared into (careful pilots route round them) */
function infringe(S, t) {
  if (!t.careless) return;
  const z = IC.aspZoneAt(S, t.x, t.y, t.alt);
  if (!z || (t.cleared || []).includes(z.z.ap.id)) { if (!z) t.infFlag = false; return; }
  if (t.infFlag) return;
  t.infT = S.time;
  if (!t.det) return; // nobody sees it
  t.infFlag = true;
  const N = S.asp; N.stats.inf++; N.day.inf++;
  const area = z.kind === 'ctr' ? 'control zone' : 'terminal area';
  IC.incidentAdd(S, 'infringe', t, `${t.cs}, a light aircraft, is in the ${short(z.z.ap.name)} ${area} without clearance. Call it on the radio`, 'warn');
  IC.log(S, 'info', 'AIRSPACE', `${t.cs}, a light aircraft, flew into the ${short(z.z.ap.name)} ${area} without clearance. Airliners climb and descend there. Call it on the radio to send it out.`);
  IC.emit(S, 'infringement', { t, ap: z.z.ap, kind: z.kind });
}

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
/* a light aircraft's way from a to b: round the control zones it is not cleared into and the prohibited zones */
IC.gaPath = function (S, a, b, cleared, careless) {
  const pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  if (careless) return pts;
  const C = IC.aspZones(S).filter(z => !cleared.includes(z.ap.id)).map(z => ({ x: z.x, y: z.y, r: z.ctr * 1.15 }));
  if (S.av) for (const z of S.av.zones) C.push({ x: z.x, y: z.y, r: z.r * 1.05 });
  return IC.bendPath(pts, C);
};
/* the height a light aircraft may fly at here: under the terminal areas it is not cleared into (starting down 15 km out) */
IC.gaCeiling = function (S, t) {
  if (t.careless) return 99;
  for (const z of IC.aspZones(S)) if (z.tma && U.dxy(t.x, t.y, z.x, z.y) < z.tma + 150 && !(t.cleared || []).includes(z.ap.id)) return A.tmaFloor - 0.2;
  return 99;
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
