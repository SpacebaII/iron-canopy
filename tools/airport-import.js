/* Turns an OpenStreetMap extract of an airport (Overpass JSON, tools/airports/<key>.osm.json) and OurAirports'
   runway ends (tools/airports/ourairports-runways.csv) into a layout the game builds (IC.aptFromLayout in
   airports-real.js), and writes the shipped data file iron-canopy/js/airports-real-data.js. (brief 39)

     node tools/airport-import.js [key ...]        default: every airport in tools/airports/config.js with an extract
     node tools/airport-import.js --check          print the accuracy check only (runway ends, gates, footprints)

   The extract is what Overpass returns for a query like (around the airport, with a margin for its roads):
     [out:json][timeout:180];
     ( nwr["aeroway"](bbox); nwr["building"](bbox); nwr["highway"](bbox); nwr["amenity"~"parking|fire_station"](bbox);
       nwr["railway"](bbox); nwr["public_transport"](bbox); nwr["man_made"~"storage_tank|tower"](bbox); );
     (._; >;); out body qt;
   (tools/airports/fetch.sh has the queries.) Ways may also come with `out geom` geometry.

   Everything is measured, nothing guessed: runways from OurAirports (ends within a few metres of the survey), the rest
   from the map, in metres round the airport reference point, then world units (100 m), x east and y south, rounded
   to 0.1 m. What the data does not have is left out and listed at the end, not made up. */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'airports');
const CFG = require('./airports/config.js');
/* a parking position this close to a terminal's wall (units) is a gate, jet bridge or not: the game and the check count it the same */
const GATE_D = 0.5;
/* an unnamed outline tagged as a terminal under this many hectares is a shelter or a link, not a terminal */
const TERM_HA = 0.5;

/* ---------- reading ---------- */
function csv(text) {
  const rows = [], lines = text.split(/\r?\n/).filter(Boolean);
  const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const head = split(lines[0]);
  for (const l of lines.slice(1)) { const v = split(l), r = {}; head.forEach((h, i) => { r[h] = v[i]; }); rows.push(r); }
  return rows;
}
/* a passenger terminal or concourse in the map: tagged as one, or named as one, but not a cargo terminal (FedEx's
   shed at Los Angeles is tagged aeroway=terminal), a station on the people mover, or a building site */
function isTerminal(t) {
  if (!t || t.building === 'train_station' || t.railway === 'station' || t.building === 'construction') return false;
  if (/cargo|freight|fdx|fedex|ups\b|dhl/i.test([t.name, t.operator].join(' '))) return false;
  return t.aeroway === 'terminal' || t.building === 'terminal' || /concourse|terminal/i.test(t.name || '');
}
/* the extract: nodes by id, ways with their points, multipolygon relations joined into rings */
function readOsm(file) {
  const J = JSON.parse(fs.readFileSync(file, 'utf8')), E = J.elements || [];
  const N = new Map(), W = new Map(), R = [];
  for (const e of E) if (e.type === 'node') N.set(e.id, e);
  for (const e of E) if (e.type === 'way') {
    if (e.geometry && e.nodes) e.geometry.forEach((g, i) => { if (g && !N.has(e.nodes[i])) N.set(e.nodes[i], { id: e.nodes[i], lat: g.lat, lon: g.lon }); });
    W.set(e.id, e);
  }
  for (const e of E) if (e.type === 'relation') R.push(e);
  return { N, W, R };
}
/* the rings of a multipolygon relation: its outer ways joined end to end */
function rings(O, rel, role) {
  const parts = rel.members.filter(m => m.type === 'way' && (m.role || 'outer') === role).map(m => O.W.get(m.ref)).filter(Boolean).map(w => w.nodes.slice());
  const out = [];
  while (parts.length) {
    let r = parts.shift();
    for (let k = 0; k < 1000 && r[0] !== r[r.length - 1] && parts.length; k++) {
      const i = parts.findIndex(p => p[0] === r[r.length - 1] || p[p.length - 1] === r[r.length - 1]);
      if (i < 0) break;
      const p = parts.splice(i, 1)[0];
      r = r.concat(p[0] === r[r.length - 1] ? p.slice(1) : p.slice().reverse().slice(1));
    }
    out.push(r);
  }
  return out;
}

/* ---------- geometry ---------- */
/* metres per degree at a latitude (WGS84), for a local flat projection round the reference point: under 1 m of
   error within 10 km */
function projector(lat0, lon0) {
  const f = lat0 * Math.PI / 180;
  const mLat = 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f);
  const mLon = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f);
  return (lat, lon) => ({ x: (lon - lon0) * mLon / 100, y: -(lat - lat0) * mLat / 100 });
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
const area = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j].x - P[i].x) * (P[j].y + P[i].y); return Math.abs(s / 2); };
const centroid = P => { let x = 0, y = 0; for (const p of P) { x += p.x; y += p.y; } return { x: x / P.length, y: y / P.length }; };
const convexHull = P => { const Q = P.slice().sort((a, b) => a.x - b.x || a.y - b.y), cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); const lo = [], up = []; for (const q of Q) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of Q.reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i].y > p.y) !== (P[j].y > p.y) && p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) c = !c; return c; };
const polyDist = (p, P) => { let m = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) m = Math.min(m, segDist(p, P[j], P[i])); return inPoly(p, P) ? 0 : m; };
/* Douglas–Peucker, keeping the points that must stay (shared nodes, ends) */
function simplify(P, tol, keep) {
  if (P.length < 3) return P.slice();
  const mark = new Uint8Array(P.length); mark[0] = mark[P.length - 1] = 1;
  if (keep) P.forEach((p, i) => { if (keep(p, i)) mark[i] = 1; });
  const idx = []; mark.forEach((m, i) => { if (m) idx.push(i); });
  for (let k = 1; k < idx.length; k++) {
    const st = [[idx[k - 1], idx[k]]];
    while (st.length) {
      const [a, b] = st.pop(); let m = -1, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = segDist(P[i], P[a], P[b]); if (d > m) { m = d; mi = i; } }
      if (m > tol) { mark[mi] = 1; st.push([a, mi], [mi, b]); }
    }
  }
  return P.filter((_, i) => mark[i]);
}
/* the polyline with a point every step along it */
const densify = (P, step) => { const out = []; P.forEach((p, i) => { if (i) { const a = P[i - 1], n = Math.ceil(dist(a, p) / step); for (let k = 1; k < n; k++) out.push({ x: a.x + (p.x - a.x) * k / n, y: a.y + (p.y - a.y) * k / n }); } out.push(p); }); return out; };
const r1 = v => Math.round(v * 1000) / 1000;   // 0.1 m
const flat = P => P.flatMap(p => [r1(p.x), r1(p.y)]);
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

/* the game's own geometry (headless.js), for the checks that match its overlap checker */
const game = () => global.IC || (global.IC = require('../headless.js'));

/* ---------- the import ---------- */
function importAirport(key, o) {
  o = o || {};
  const C = CFG[key]; if (!C) throw new Error(`no airport ${key} in tools/airports/config.js`);
  const file = path.join(DIR, C.osm);
  if (!fs.existsSync(file)) return { key, missing: file };
  const O = readOsm(file), notes = [];
  // the reference point: OurAirports' airport, else the middle of the aerodrome in the extract
  const ap = C.ident ? csv(fs.readFileSync(path.join(DIR, 'ourairports-airports.csv'), 'utf8')).find(r => r.ident === C.ident) : null;
  let lat0, lon0;
  if (ap) { lat0 = +ap.latitude_deg; lon0 = +ap.longitude_deg; }
  else { const ns = [...O.N.values()]; lat0 = ns.reduce((s, n) => s + n.lat, 0) / ns.length; lon0 = ns.reduce((s, n) => s + n.lon, 0) / ns.length; }
  const proj = projector(lat0, lon0), P = id => { const n = O.N.get(id); return n ? proj(n.lat, n.lon) : null; };
  const wayPts = w => w.nodes.map(P).filter(Boolean);
  const tag = (e, k) => e.tags && e.tags[k];
  // areas: closed ways and multipolygons with a tag test
  const areas = test => {
    const out = [];
    for (const w of O.W.values()) if (w.tags && test(w.tags) && w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1]) out.push({ tags: w.tags, pts: wayPts(w).slice(0, -1), id: 'w' + w.id });
    for (const r of O.R) if (r.tags && test(r.tags) && /multipolygon/.test(r.tags.type || '')) for (const ring of rings(O, r, 'outer')) if (ring.length > 3) out.push({ tags: r.tags, pts: ring.map(P).filter(Boolean).slice(0, -1), id: 'r' + r.id });
    return out;
  };
  const L = { key, name: C.name, after: C.after, icao: C.ident, ref: [lat0, lon0], runways: [], nodes: [], taxi: [], aprons: [], stands: [], blds: [], bridges: [], movers: [], roads: [], parks: [], service: [], rails: [], junctions: [], exits: [] };

  // --- runways: OurAirports ends; the map's runway ways only to check them against
  const rwyRows = C.ident ? csv(fs.readFileSync(path.join(DIR, 'ourairports-runways.csv'), 'utf8')).filter(r => r.airport_ident === C.ident && r.closed !== '1') : [];
  for (const r of rwyRows) {
    const a = proj(+r.le_latitude_deg, +r.le_longitude_deg), b = proj(+r.he_latitude_deg, +r.he_longitude_deg);
    const pad = id => /^\d[LCR]?$/.test(id) ? '0' + id : id, e1 = pad(r.le_ident), e2 = pad(r.he_ident);
    L.runways.push({ a: [r1(a.x), r1(a.y)], b: [r1(b.x), r1(b.y)], w: r1(+r.width_ft * 0.3048 / 100), ends: [e1, e2], hdg: num(r.le_heading_degT, null), disp: [num(r.le_displaced_threshold_ft, 0) * 0.3048, num(r.he_displaced_threshold_ft, 0) * 0.3048], lenFt: +r.length_ft,
      ils: [(C.ils || []).includes(e1) ? 'a' : null, (C.ils || []).includes(e2) ? 'b' : null].filter(Boolean) });
  }
  const osmRwy = [...O.W.values()].filter(w => tag(w, 'aeroway') === 'runway' && w.nodes[0] !== w.nodes[w.nodes.length - 1]);
  // OurAirports gives some airports to 0.001° (about 50 m); the map's runway line is surveyed from imagery to a metre
  // or two and the taxiways are drawn to it. Where the two disagree, each runway lies on the map's line, with
  // OurAirports' ends carried along it (its lengths are the published ones)
  for (const r of L.runways) {
    const a = { x: r.a[0], y: r.a[1] }, b = { x: r.b[0], y: r.b[1] };
    const m = osmRwy.map(w => { const pts = wayPts(w); return { pts, d: Math.min(dist(pts[0], a) + dist(pts[pts.length - 1], b), dist(pts[0], b) + dist(pts[pts.length - 1], a)) }; }).filter(x => x.pts.length > 1 && x.d < 3).sort((x, y) => x.d - y.d)[0];
    if (!m) continue;
    const p0 = m.pts[0], p1 = m.pts[m.pts.length - 1], L0 = dist(p0, p1) || 1, ux = (p1.x - p0.x) / L0, uy = (p1.y - p0.y) / L0;
    const on = q => { const t = (q.x - p0.x) * ux + (q.y - p0.y) * uy; return { x: p0.x + ux * t, y: p0.y + uy * t }; };
    const a2 = on(a), b2 = on(b), moved = Math.max(dist(a, a2), dist(b, b2));
    if (moved > 0.02) notes.push(`runway ${r.ends.join('/')}: OurAirports' ends lie ${Math.round(moved * 100)} m across the map's runway line: moved onto it`);
    r.a = [r1(a2.x), r1(a2.y)]; r.b = [r1(b2.x), r1(b2.y)];
  }
  if (!L.runways.length) for (const w of osmRwy) {
    const pts = wayPts(w), a = pts[0], b = pts[pts.length - 1], ref = (tag(w, 'ref') || '').split('/');
    L.runways.push({ a: [r1(a.x), r1(a.y)], b: [r1(b.x), r1(b.y)], w: r1(num(tag(w, 'width'), 45) / 100), ends: [ref[0] || 'A', ref[1] || 'B'], hdg: null, disp: [0, 0], ils: [] });
  }
  const rwLines = L.runways.map(r => ({ a: { x: r.a[0], y: r.a[1] }, b: { x: r.b[0], y: r.b[1] }, w: r.w }));

  // --- the aerodrome's outline (the fence runs round it): roads inside it are airside. The landside the game ships
  // is what lies within C.margin of it (the terminal kerbs, car parks, hotels and the airport's own roads), plus the
  // approach roads named in C.approach with their interchanges: the extract reaches further, into the towns round
  // the airport, and that is left out
  const aero = areas(t => t.aeroway === 'aerodrome').sort((p, q) => area(q.pts) - area(p.pts))[0];
  const airside = p => aero ? inPoly(p, aero.pts) : true;
  const margin = C.margin != null ? C.margin : 1.5;
  const near = p => !aero || polyDist(p, aero.pts) <= margin;
  const nearAny = pts => pts.some(near);
  /* the runs of a polyline within the margin, each cut where it leaves (the last point moved back to the edge) */
  const clipNear = pts => {
    if (!aero) return [pts];
    const edge = (a, b) => { let lo = 0, hi = 1; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2, q = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m }; if (near(q)) lo = m; else hi = m; } return { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo }; };
    const runs = []; let run = null;
    pts.forEach((p, i) => {
      if (near(p)) { if (!run) { run = []; if (i) run.push(edge(p, pts[i - 1])); } run.push(p); }
      else if (run) { run.push(edge(pts[i - 1], p)); runs.push(run); run = null; }
    });
    if (run) runs.push(run);
    return runs.filter(r => r.length > 1);
  };

  // --- taxiways and taxilanes: a node for every point two ways share, every end, and every bend that matters
  const TW = [...O.W.values()].filter(w => /^(taxiway|taxilane)$/.test(tag(w, 'aeroway') || '') && w.nodes.length >= 2 && tag(w, 'area') !== 'yes');
  const use = new Map(), bump = id => use.set(id, (use.get(id) || 0) + 1);
  for (const w of TW) { w.nodes.forEach(bump); bump(w.nodes[0]); bump(w.nodes[w.nodes.length - 1]); }
  for (const w of osmRwy) w.nodes.forEach(bump);
  const holds = new Set([...O.N.values()].filter(n => tag(n, 'aeroway') === 'holding_position').map(n => n.id));
  const nodeIx = new Map();
  const nodeOf = id => { if (!nodeIx.has(id)) { const p = P(id); nodeIx.set(id, L.nodes.length); L.nodes.push([r1(p.x), r1(p.y)]); } return nodeIx.get(id); };
  for (const w of TW) {
    const ids = w.nodes.filter(id => O.N.has(id)); if (ids.length < 2) continue;
    const pts = ids.map(P);
    const kept = simplify(pts.map((p, i) => Object.assign({ id: ids[i] }, p)), 0.02, (p, i) => use.get(ids[i]) > 1 || holds.has(ids[i]));
    const n = kept.map(p => nodeOf(p.id)).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    if (n.length < 2) continue;
    const lane = tag(w, 'aeroway') === 'taxilane';
    L.taxi.push({ name: tag(w, 'ref') || undefined, n, w: r1(num(tag(w, 'width'), lane ? 15 : 23) / 100), lane: lane ? 1 : undefined, lv: tag(w, 'bridge') === 'yes' || +tag(w, 'layer') > 0 ? 1 : undefined, oneway: tag(w, 'oneway') === 'yes' ? 1 : tag(w, 'oneway') === '-1' ? -1 : undefined, maxht: num(tag(w, 'maxheight'), 0) || undefined, osm: w.id });
  }

  // where two taxiways at the same level cross with no node in common (the map drawn a little loosely), or a taxiway
  // crosses a runway with no node on it, they meet: a node is put in at the crossing
  {
    const segs = [], cell = 1, grid = new Map(), key = (i, j) => i * 100003 + j;
    const pt = i => ({ x: L.nodes[i][0], y: L.nodes[i][1] });
    L.taxi.forEach((t, ti) => { for (let k = 1; k < t.n.length; k++) segs.push({ ti, k, a: t.n[k - 1], b: t.n[k], lv: t.lv || 0 }); });
    rwLines.forEach((r, ri) => segs.push({ rw: ri, a: r.a, b: r.b, lv: 0 }));
    const P2 = s => s.rw != null ? [s.a, s.b] : [pt(s.a), pt(s.b)];
    segs.forEach((s, si) => { const [a, b] = P2(s); for (let i = Math.floor(Math.min(a.x, b.x) / cell); i <= Math.floor(Math.max(a.x, b.x) / cell); i++) for (let j = Math.floor(Math.min(a.y, b.y) / cell); j <= Math.floor(Math.max(a.y, b.y) / cell); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(si); } });
    const cuts = new Map(), seen = new Set();   // taxi index → [{ k, t, node }]
    let added = 0;
    for (const list of grid.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]), pk = i + ':' + j; if (seen.has(pk)) continue; seen.add(pk);
      const A = segs[i], B = segs[j]; if (A.lv !== B.lv || (A.rw != null && B.rw != null)) continue;
      if (A.rw == null && B.rw == null && (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b)) continue;
      const [a, b] = P2(A), [c, d] = P2(B);
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x); if (Math.abs(den) < 1e-9) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) continue;
      // (a taxiway ending on the runway centreline already joins it: the game links nodes within 20 m)
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (A.rw != null || B.rw != null) { const T = A.rw != null ? B : A, [p0, p1] = P2(T); if (dist(p0, q) < 0.2 || dist(p1, q) < 0.2) continue; }
      const id = L.nodes.length; L.nodes.push([r1(q.x), r1(q.y)]); added++;
      for (const [S0, f] of [[A, t], [B, u]]) if (S0.rw == null) { if (!cuts.has(S0.ti)) cuts.set(S0.ti, []); cuts.get(S0.ti).push({ k: S0.k, f, node: id }); }
    }
    for (const [ti, L2] of cuts) { const t = L.taxi[ti]; L2.sort((p, q) => q.k - p.k || q.f - p.f); for (const c of L2) t.n.splice(c.k, 0, c.node); }
    if (added) notes.push(`${added} crossing${added > 1 ? 's' : ''} of taxiways (with each other or a runway) had no node in the map: one was put in at each`);
  }

  // the taxiways as lines, for what crosses them (nodes put in later lie on these lines)
  const TWshape = L.taxi.map(t => t.n.map(i => ({ x: L.nodes[i][0], y: L.nodes[i][1] })));
  const crossesTaxi = pts => TWshape.some(T => pts.some((p, i) => i && T.some((q, j) => j && segX(pts[i - 1], p, T[j - 1], q))));

  // --- aprons (de-icing pads apart), simplified to 1.5 m
  const APR = areas(t => t.aeroway === 'apron');
  const isDeice = t => /de-?icing/i.test([t.apron, t.name, t.description, t.usage].join(' ')) || t.deicing === 'yes';
  for (const A of APR) {
    const pts = simplify(A.pts.concat([A.pts[0]]), 0.015).slice(0, -1);
    if (pts.length < 3 || area(pts) < 0.05) continue;
    if (isDeice(A.tags)) { L.blds.push({ kind: 'deice', poly: flat(pts), name: A.tags.name || 'De-icing pad' }); continue; }
    const zone = /cargo|freight/i.test([A.tags.name, A.tags.apron, A.tags.operator].join(' ')) ? 'cargo' : /general|fbo|ga\b/i.test([A.tags.name, A.tags.apron].join(' ')) ? 'light' : /military/i.test(A.tags.apron || '') ? 'mil' : undefined;
    L.aprons.push({ poly: flat(pts), zone, name: A.tags.name || undefined, _p: pts });
  }

  // --- buildings: terminals and concourses, cargo, hangars, the tower, fire stations, fuel tanks, the rest
  const BLD = areas(t => t.building || t.aeroway === 'terminal' || t.aeroway === 'hangar' || t['building:part']);
  const kindOf = t => {
    const s = [t.name, t.operator, t.description].join(' ');
    if (isTerminal(t)) return 'terminal';
    if (t.building === 'train_station' || t.railway === 'station' || t.public_transport === 'station') return 'support';
    if (/tracon|approach control|radar facility/i.test(s)) return 'atc';
    if (t.aeroway === 'control_tower' || t.aeroway === 'tower' || /^(airport|aircraft)_control$/.test(t['tower:type'] || '') || t['building:part'] === 'control_tower' || /control tower|atct/i.test(s)) return 'tower';
    if (t.amenity === 'fire_station' || /fire station|arff|crash fire/i.test(s)) return 'fire';
    if (t.aeroway === 'hangar' || t.building === 'hangar') return 'hangar';
    if (/cargo|freight|fdx|fedex|ups\b|dhl/i.test(s) || (t.building === 'warehouse') || t.aeroway === 'terminal') return 'cargo';
    // (a storage tank inside the aerodrome is fuel unless the map says it holds water: the map rarely says)
    if (t.man_made === 'storage_tank' && !/water|sewage/i.test([t.content, t.substance, s].join(' '))) return 'fuel';
    return 'support';
  };
  const tanks = [];
  for (const B of BLD) {
    if (B.tags['building:part'] && !B.tags.building && kindOf(B.tags) !== 'tower') continue;
    const pts = simplify(B.pts.concat([B.pts[0]]), 0.01).slice(0, -1); if (pts.length < 3) continue;
    const a = area(pts), c = centroid(pts); let k = kindOf(B.tags);
    if (aero && !airside(c)) { if (!near(c) || (k === 'support' && !/parking|garage|hotel|station/i.test([B.tags.name, B.tags.building, B.tags.amenity].join(' ')))) continue; }
    if (k === 'support' && a < 0.04) continue;   // (sheds under 400 m² are left out)
    if (k === 'fuel') { tanks.push({ c, r: Math.sqrt(a / Math.PI) }); continue; }
    const roof = (C.roofs || []).find(([re]) => re.test(B.tags.name || '')), lv = num(B.tags['building:levels'], 0);
    const parking = B.tags.amenity === 'parking' || B.tags.parking === 'multi-storey' || /^(parking|garage)$/.test(B.tags.building || '') || /garage|parking/i.test(B.tags.name || '');
    if (parking) continue;   // (garages come in with the car parks)
    // (a scrap of terminal with no name is no terminal: a bridge landing, a link drawn as its own outline, or a bus
    // shelter at a remote pad, which stays as a support building)
    if (k === 'terminal' && !B.tags.name && a < TERM_HA) { if (a < 0.04) continue; k = 'support'; }
    L.blds.push({ kind: k, poly: flat(pts), name: B.tags.name || undefined, roof: roof ? roof[1] : undefined, lvls: lv || undefined, noApron: k === 'terminal' || undefined, _p: pts, _a: a, _lv: +B.tags.layer || 0 });
  }
  // buildings drawn over one another in the map (an outline and its parts, a shed inside a bigger one): the lesser
  // one goes. Terminals first, then the buildings the airport works by, then support buildings; the larger on a tie
  {
    const IC = game(), rank = b => b.kind === 'terminal' ? 3 : b.kind === 'support' ? 1 : 2;
    const sh = L.blds.map(b => b._p && b._p.length ? IC.shapePoly(b._p) : null), drop = new Set();
    for (let i = 0; i < L.blds.length; i++) for (let j = i + 1; j < L.blds.length; j++) {
      if (!sh[i] || !sh[j] || drop.has(i) || drop.has(j)) continue;
      const A = L.blds[i], B = L.blds[j]; if (A._lv !== B._lv && (A.kind === 'terminal' || B.kind === 'terminal')) { /* (a concourse over a road or a link on another level) */ }
      const bi = sh[i].bb, bj = sh[j].bb; if (bi[2] < bj[0] || bj[2] < bi[0] || bi[3] < bj[1] || bj[3] < bi[1]) continue;
      if (IC.shapeDepth(sh[i], sh[j]) <= 0.02) continue;
      const lose = rank(A) !== rank(B) ? (rank(A) < rank(B) ? i : j) : (A._a < B._a ? i : j);
      drop.add(lose);
    }
    if (drop.size) { notes.push(`${drop.size} buildings drawn over another in the map are left out`); L.blds = L.blds.filter((_, i) => !drop.has(i)); }
  }
  // buildings on a taxiway or a runway (the map draws some under a bridge or over a tunnel): left out
  {
    const IC = game(), tw = L.taxi.map(t => IC.shapeLine(t.n.map(i => ({ x: L.nodes[i][0], y: L.nodes[i][1] })), (t.w || 0.23) / 2)), rw = rwLines.map(r => IC.shapeLine([r.a, r.b], r.w / 2));
    const on = b => { if (!b._p || !b._p.length) return false; const sh = IC.shapePoly(b._p); return tw.concat(rw).some(x => !(x.bb[2] < sh.bb[0] || sh.bb[2] < x.bb[0] || x.bb[3] < sh.bb[1] || sh.bb[3] < x.bb[1]) && IC.shapeDepth(sh, x) > 0.02); };
    const n0 = L.blds.length; L.blds = L.blds.filter(b => b.kind === 'terminal' || !on(b));
    if (L.blds.length < n0) notes.push(`${n0 - L.blds.length} buildings stand on a taxiway or runway in the map: left out`);
  }
  const ptTanks = [];
  for (const n of O.N.values()) if (n.tags && n.tags.man_made === 'storage_tank' && !/water|sewage/i.test([n.tags.content, n.tags.substance, n.tags.name].join(' ')) && airside(proj(n.lat, n.lon))) ptTanks.push({ c: proj(n.lat, n.lon), r: 0.13 });
  // (a tank mapped as a point is as big as the room to its neighbours allows, up to the standard tank)
  for (const t of ptTanks) { let nn = 1e9; for (const u of ptTanks.concat(tanks)) if (u !== t) nn = Math.min(nn, dist(t.c, u.c)); t.r = Math.max(0.03, Math.min(0.13, nn / 2 - 0.02)); }
  tanks.push(...ptTanks);
  // radars the map does not show (a ground radar, an approach radar where no approach control is mapped): by the
  // tower, on the first clear ground round it, when the config says the airport has them
  for (const kind of C.radars || []) {
    if (kind === 'atc' && L.blds.some(b => b.kind === 'atc')) continue;
    const tower = L.blds.find(b => b.kind === 'tower' && b._p && b._p.length); if (!tower) { notes.push(`no tower in the map to put the ${kind} by`); continue; }
    const c = centroid(tower._p), size = kind === 'atc' ? 0.12 : 0.1, clear = q => !L.blds.some(b => b._p && b._p.length && polyDist(q, b._p) < size) && !L.aprons.some(A => polyDist(q, A._p) < size) && !L.taxi.some(t => t.n.some((i, k) => k && segDist(q, { x: L.nodes[t.n[k - 1]][0], y: L.nodes[t.n[k - 1]][1] }, { x: L.nodes[i][0], y: L.nodes[i][1] }) < size + t.w / 2)) && !rwLines.some(r => segDist(q, r.a, r.b) < 1.5 + size);
    let spot = null;
    for (let d = 0.25; d < 1.5 && !spot; d += 0.1) for (let k = 0; k < 16 && !spot; k++) { const q = { x: c.x + Math.cos(k / 16 * Math.PI * 2) * d, y: c.y + Math.sin(k / 16 * Math.PI * 2) * d }; if (clear(q)) spot = q; }
    if (!spot) { notes.push(`no clear ground by the tower for the ${kind}`); continue; }
    const h = size / 2;
    L.blds.push({ kind, poly: flat([{ x: spot.x - h, y: spot.y - h }, { x: spot.x + h, y: spot.y - h }, { x: spot.x + h, y: spot.y + h }, { x: spot.x - h, y: spot.y + h }]), _p: [{ x: spot.x - h, y: spot.y - h }, { x: spot.x + h, y: spot.y - h }, { x: spot.x + h, y: spot.y + h }, { x: spot.x - h, y: spot.y + h }], _a: size * size });
    notes.push(`${kind === 'atc' ? 'approach radar' : 'ground radar'} placed by the tower (the map does not show it)`);
  }
  for (const n of O.N.values()) if (n.tags && (n.tags.aeroway === 'control_tower' || n.tags['tower:type'] === 'airport_control') && !L.blds.some(b => b.kind === 'tower' && polyDist(proj(n.lat, n.lon), b._p) < 0.2)) { const c = proj(n.lat, n.lon); L.blds.push({ kind: 'tower', poly: flat([{ x: c.x - 0.07, y: c.y - 0.07 }, { x: c.x + 0.07, y: c.y - 0.07 }, { x: c.x + 0.07, y: c.y + 0.07 }, { x: c.x - 0.07, y: c.y + 0.07 }]), name: n.tags.name, _p: [] }); }
  // tanks drawn over one another are one tank, the biggest; tanks touching are pulled apart, each keeping its share
  // of the gap
  tanks.sort((a, b) => b.r - a.r);
  { const kept = []; for (const t of tanks) if (!kept.some(u => dist(u.c, t.c) < Math.max(u.r, t.r))) kept.push(t); tanks.length = 0; tanks.push(...kept); }
  for (let k = 0; k < 4; k++) for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) { const a = tanks[i], b = tanks[j], d = dist(a.c, b.c); if (d < a.r + b.r + 0.03) { const f = Math.max(0.02, d - 0.03) / (a.r + b.r); a.r *= f; b.r *= f; } }
  for (const t of tanks) if (t.r >= 0.03) L.blds.push({ kind: 'fuel', c: [r1(t.c.x), r1(t.c.y)], r: r1(t.r) });

  // --- roads: public roads and the landside's own, on their levels; airside service roads apart. Kept: what lies
  // within the margin (cut where it leaves), the approach roads by name in full, and the roads that meet them
  // (their slip roads and the motorway they leave) for 500 m from the meeting point
  const PUB = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)(_link)?$/;
  const isRoad = w => { const t = w.tags || {}; return t.highway && (PUB.test(t.highway) || t.highway === 'service') && t.area !== 'yes'; };
  const lanesOf = (t, cls) => num(t.lanes, /motorway|trunk/.test(cls) ? 4 : /primary|secondary/.test(cls) ? 3 : 2);
  const approach = w => C.approach && isRoad(w) && C.approach.test(w.tags.name || w.tags.ref || '');
  const reach = C.reach != null ? C.reach : 30;
  const nodePts = w => w.nodes.map(id => ({ id, p: P(id) })).filter(x => x.p);
  const keptWays = new Map();   // way → its runs of points (projected)
  const addRuns = (w, runs) => { runs = runs.filter(r => r.length > 1); if (runs.length) keptWays.set(w, (keptWays.get(w) || []).concat(runs)); };
  const runsWhere = (pts, ok) => { const runs = []; let run = []; for (const p of pts) { if (ok(p)) run.push(p); else { if (run.length > 1) runs.push(run); run = []; } } if (run.length > 1) runs.push(run); return runs; };
  // hop 1: the approach roads out to C.reach; hop 2: the slip roads that leave them (whole) and the roads they meet
  // for 500 m; hop 3: the motorway those slip roads join, for 600 m either side
  const hop1 = [...O.W.values()].filter(approach);
  const seen = new Set(hop1);
  for (const w of hop1) addRuns(w, runsWhere(nodePts(w).map(x => x.p), p => polyDist(p, aero ? aero.pts : []) <= reach));
  const meet = ways => { const ids = new Set(); for (const w of ways) if (keptWays.has(w)) for (const x of nodePts(w)) if (keptWays.get(w).some(r => r.includes(x.p))) ids.add(x.id); return ids; };
  const hop = (from, r, whole) => {
    const ids = meet(from), out = [];
    for (const w of O.W.values()) {
      if (seen.has(w) || !isRoad(w)) continue;
      const np = nodePts(w), m = np.filter(x => ids.has(x.id)).map(x => x.p); if (!m.length) continue;
      seen.add(w); out.push(w);
      const pts = np.map(x => x.p);
      addRuns(w, whole && /_link$/.test(w.tags.highway) ? [pts] : runsWhere(pts, p => m.some(q => dist(p, q) <= r)));
    }
    return out;
  };
  const hop2 = hop(hop1, 5, true);
  hop(hop2, 6, false);
  // everything else within the margin, cut where it leaves
  for (const w of O.W.values()) { if (seen.has(w) || !isRoad(w)) continue; const pts = nodePts(w).map(x => x.p); if (pts.length > 1 && nearAny(pts)) addRuns(w, clipNear(pts)); }
  const cutEnds = [];
  for (const [w, runs] of keptWays) for (const pts0 of runs) {
    const t = w.tags, cls = t.highway;
    const pts = simplify(pts0, 0.01); if (pts.length < 2) continue;
    let lv = t.tunnel && t.tunnel !== 'no' ? -1 : (t.bridge && t.bridge !== 'no') ? Math.max(1, +t.layer || 1) : +t.layer > 0 ? +t.layer : +t.layer < 0 ? -1 : 0;
    const mid = pts[pts.length >> 1], dense = densify(pts, 0.05);
    // airside: a road that crosses a taxiway or enters an apron, or a service road or a closed road (access=no,
    // private) inside the aerodrome; the roads under a terminal (the kerbs and the tunnel under the concourse) are
    // its own
    const wHalf = Math.min(0.3, lanesOf(t, cls) * 3.5 / 100 + 0.02) / 2 + 0.02;
    const termAt = L.blds.findIndex(b => b.kind === 'terminal' && b._p.length && dense.some(q => polyDist(q, b._p) < wHalf));
    const nearTaxi = pts => TWshape.some(T => T.some((q, j) => j && pts.some(p => segDist(p, T[j - 1], q) < 0.25)));
    const onField = crossesTaxi(pts) || dense.some(q => L.aprons.some(A => inPoly(q, A._p)));
    const airRoad = onField || (termAt < 0 && aero && airside(mid) && (cls === 'service' || /^(no|private)$/.test(t.access || '')));
    if (airRoad && !/^(motorway|trunk|primary|secondary)/.test(cls)) { L.service.push({ pts: flat(pts) }); continue; }
    // (a main road with a height limit that crosses the field passes under it: the map's tunnel tag is on another piece)
    if (!lv && t.maxheight && (onField || nearTaxi(dense))) lv = -1;
    if (cls === 'service' && /parking_aisle|driveway/.test(t.service || '')) continue;   // (the car parks are areas)
    const lanes = lanesOf(t, cls), oneway = t.oneway === 'yes' || /motorway|_link/.test(cls) && t.oneway !== 'no' ? 1 : t.oneway === '-1' ? -1 : 0;
    L.roads.push({ pts: flat(pts), w: r1(Math.min(0.3, lanes * 3.5 / 100 + 0.02)), lv: lv || undefined, oneway: oneway || undefined, lanes, name: t.name || undefined, cls, kind: lv > 0 ? 'upper' : 'road', kerb: termAt >= 0 ? termAt : undefined, out: aero && !dense.some(airside) ? 1 : undefined, _pts: pts, _osm: w.id, _svc: t.service });
    // a run cut short of the way's own end leads on out of the layout
    const first = P(w.nodes[0]), last = P(w.nodes[w.nodes.length - 1]);
    for (const e of [pts[0], pts[pts.length - 1]]) if (!lv && /^(motorway|trunk|primary|secondary)$/.test(cls) && (approach(w) || (dist(e, first) > 0.02 && dist(e, last) > 0.02))) cutEnds.push({ e, w });
  }
  // junctions where kept roads share a node; the exits are the cut ends of the main roads (the country's road comes
  // to the one nearest the towns it serves)
  const onRoads = new Map();
  for (const [w] of keptWays) for (const id of w.nodes) onRoads.set(id, (onRoads.get(id) || 0) + 1);
  for (const [id, n] of onRoads) if (n > 1) { const p = P(id); if (p) L.junctions.push([r1(p.x), r1(p.y)]); }
  {
    let fixed = 0;
    const R = L.roads.map(r => ({ r, pts: r._pts, lv: r.lv || 0, bb: r._pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [1e9, 1e9, -1e9, -1e9]) }));
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const A = R[i], B = R[j]; if (A.lv !== B.lv || A.bb[2] < B.bb[0] || B.bb[2] < A.bb[0] || A.bb[3] < B.bb[1] || B.bb[3] < A.bb[1]) continue;
      for (let a = 1; a < A.pts.length; a++) for (let b = 1; b < B.pts.length; b++) {
        if (!segX(A.pts[a - 1], A.pts[a], B.pts[b - 1], B.pts[b])) continue;
        const p0 = A.pts[a - 1], p1 = A.pts[a], q0 = B.pts[b - 1], q1 = B.pts[b], den = (p1.x - p0.x) * (q1.y - q0.y) - (p1.y - p0.y) * (q1.x - q0.x); if (!den) continue;
        const t = ((q0.x - p0.x) * (q1.y - q0.y) - (q0.y - p0.y) * (q1.x - q0.x)) / den, q = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
        if (!L.junctions.some(J => Math.hypot(J[0] - q.x, J[1] - q.y) < 0.08)) { L.junctions.push([r1(q.x), r1(q.y)]); fixed++; }
      }
    }
    if (fixed) notes.push(`${fixed} roads cross another with no node in the map (a slip road, or a bridge with no layer): a junction is put at each`);
  }
  // (an approach road's own far end counts when no other kept road goes on from it)
  const loose = ({ e, w }) => !approach(w) || ![...keptWays.keys()].some(v => v !== w && v.nodes.some(id => { const p = P(id); return p && dist(p, e) < 0.02; }));
  for (const c of cutEnds) if (loose(c) && !L.exits.some(x => Math.hypot(x[0] - c.e.x, x[1] - c.e.y) < 0.5)) L.exits.push([r1(c.e.x), r1(c.e.y)]);

  // --- stands: parking positions (a node, or a lead-in way ending at the stand), their gate numbers and sizes
  const gates = [...O.N.values()].filter(n => tag(n, 'aeroway') === 'gate').map(n => ({ p: proj(n.lat, n.lon), ref: tag(n, 'ref') || tag(n, 'name') }));
  const PP = [];
  for (const n of O.N.values()) if (tag(n, 'aeroway') === 'parking_position') PP.push({ p: proj(n.lat, n.lon), tags: n.tags, h: null });
  for (const w of O.W.values()) if (tag(w, 'aeroway') === 'parking_position' && w.nodes.length >= 2) {
    const pts = wayPts(w); if (pts.length < 2) continue;
    // the stand is the end nearer a terminal; the way is its lead-in line
    const term = L.blds.filter(b => b.kind === 'terminal' || b.kind === 'cargo');
    const d = q => Math.min(...term.map(b => polyDist(q, b._p)).concat([1e9]));
    const [s, t0] = d(pts[pts.length - 1]) <= d(pts[0]) ? [pts[pts.length - 1], pts[pts.length - 2]] : [pts[0], pts[1]];
    PP.push({ p: s, tags: w.tags, h: Math.atan2(s.y - t0.y, s.x - t0.x) });
  }
  const termPolys = L.blds.filter(b => b.kind === 'terminal' && b._p && b._p.length > 2).map(b => b._p);
  const bldsNear = PP.length ? L.blds.filter(b => b._p && b._p.length && (b.kind === 'terminal' || b.kind === 'cargo' || b.kind === 'support' || b.kind === 'hangar')) : [];
  // a jet bridge in the map (aeroway=jet_bridge) or a gate node near the stand makes it a gate
  const jetPts = []; for (const w of O.W.values()) if (tag(w, 'aeroway') === 'jet_bridge') for (const q of wayPts(w)) jetPts.push(q);
  for (const S of PP) {
    // nose to the nearest building edge when the data gives no lead-in
    let h = S.h;
    if (h == null) { let bd = 1.5, best = null; for (const b of bldsNear) { const P2 = b._p; for (let i = 0, j = P2.length - 1; i < P2.length; j = i++) { const a = P2[j], c = P2[i], dx = c.x - a.x, dy = c.y - a.y, LL = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((S.p.x - a.x) * dx + (S.p.y - a.y) * dy) / LL)), q = { x: a.x + dx * f, y: a.y + dy * f }, d = dist(q, S.p); if (d < bd) { bd = d; best = q; } } } h = best ? Math.atan2(best.y - S.p.y, best.x - S.p.x) : 0; }
    // its gate number: the tag, else the gate node nearest the stand
    let ref = S.tags.ref || S.tags.name;
    if (!ref) { let bd = 0.8; for (const g of gates) { const d = dist(g.p, S.p); if (d < bd) { bd = d; ref = g.ref; } } }
    S.hh = h; S.ref = ref;
    // (a jet bridge drawn to the stand, or a gate marked at it: a gate node further off marks a bus gate)
    // (or drawn up to a terminal's wall: a ground-loaded gate, boarded by stairs; the accuracy check counts the same)
    S.gate = jetPts.some(q => dist(q, S.p) < 0.4) || gates.some(g => dist(g.p, S.p) < 0.3) || termPolys.some(T => polyDist(S.p, T) < GATE_D);
  }
  // two positions on the same spot (a gate and its wide-body alternative, drawn twice) are one stand: the plain
  // number wins, then the one with a lead-in
  PP.sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0) || (a.ref || '').length - (b.ref || '').length || (b.h != null) - (a.h != null));
  const standsOk = [];
  for (const S of PP) { if (standsOk.some(T => dist(T.p, S.p) < 0.1)) continue; standsOk.push(S); }
  if (standsOk.length < PP.length) notes.push(`${PP.length - standsOk.length} parking positions lie on another's spot: one stand each`);
  for (const S of standsOk) {
    // the size from the room it has: the gap to the stands either side, across its heading
    let gap = 1e9;
    for (const T of standsOk) { if (T === S) continue; const dx = T.p.x - S.p.x, dy = T.p.y - S.p.y, along = Math.abs(dx * Math.cos(S.hh) + dy * Math.sin(S.hh)), across = Math.abs(-dx * Math.sin(S.hh) + dy * Math.cos(S.hh)); if (along < 0.35 && across < gap) gap = across; }
    const size = /heavy|wide|[DEF]\b/.test(S.tags['aircraft:size'] || '') ? 'l' : gap >= 0.6 ? 'l' : gap >= 0.4 ? 'm' : 's';
    // the stand's own point is where the nose wheel stops; the game's stand is the aircraft's middle
    const back = { l: 0.4, m: 0.25, s: 0.18 }[size];
    S.size = size; S.c = { x: S.p.x - Math.cos(S.hh) * back, y: S.p.y - Math.sin(S.hh) * back }; S.back = back;
  }
  // the lead-in: the nearest point on a taxilane or taxiway behind the stand (within 250 m), where a node is put in
  // if there is none, as a lead-in line meets the lane
  const viaOf = S => {
    let best = null;
    const hx = Math.cos(S.hh), hy = Math.sin(S.hh);
    L.taxi.forEach((t, ti) => {
      for (let k = 1; k < t.n.length; k++) {
        const a = L.nodes[t.n[k - 1]], b = L.nodes[t.n[k]], dx = b[0] - a[0], dy = b[1] - a[1], LL = dx * dx + dy * dy || 1;
        const f = Math.max(0, Math.min(1, ((S.c.x - a[0]) * dx + (S.c.y - a[1]) * dy) / LL)), q = { x: a[0] + dx * f, y: a[1] + dy * f };
        const d = dist(q, S.c), behind = -((q.x - S.c.x) * hx + (q.y - S.c.y) * hy);
        if (behind < S.back * 0.8 || d > 2.5) continue;
        const score = d + (t.lane ? 0 : 0.3);   // (a taxilane on the apron before the taxiway beyond it)
        if (!best || score < best.score) best = { score, ti, k, f, q, a, b };
      }
    });
    if (!best) return null;
    const t = L.taxi[best.ti];
    if (dist(best.q, { x: best.a[0], y: best.a[1] }) < 0.05) return t.n[best.k - 1];
    if (dist(best.q, { x: best.b[0], y: best.b[1] }) < 0.05) return t.n[best.k];
    const id = L.nodes.length; L.nodes.push([r1(best.q.x), r1(best.q.y)]); t.n.splice(best.k, 0, id);
    return id;
  };
  // the apron each stand is on; stands on pavement the map has no apron for (a terminal being rebuilt, a remote
  // ramp drawn as taxiways only) get one laid under them, round their outlines and lead-ins
  for (const S of standsOk) {
    let ai = L.aprons.findIndex(A => inPoly(S.p, A._p));
    if (ai < 0) { let bd = 0.3; L.aprons.forEach((A, i) => { const d = polyDist(S.p, A._p); if (d < bd) { bd = d; ai = i; } }); }
    S.ai = ai >= 0 ? ai : null;
  }
  const orphans = standsOk.filter(S => S.ai == null);
  if (orphans.length) {
    // clusters within 150 m of each other
    const cl = orphans.map((_, i) => i), root = i => cl[i] === i ? i : (cl[i] = root(cl[i]));
    for (let i = 0; i < orphans.length; i++) for (let j = i + 1; j < orphans.length; j++) if (dist(orphans[i].c, orphans[j].c) < 0.7) cl[root(i)] = root(j);
    const groups = new Map(); orphans.forEach((S, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(S); });
    for (const G of groups.values()) {
      const pts = [];
      for (const S of G) {
        const W0 = { l: 0.76, m: 0.46, s: 0.32 }[S.size] / 2 + 0.1, D0 = { l: 0.8, m: 0.5, s: 0.36 }[S.size] / 2 + 0.15, hx = Math.cos(S.hh), hy = Math.sin(S.hh);
        for (const [u, v] of [[-W0, -D0], [W0, -D0], [W0, D0], [-W0, D0]]) pts.push({ x: S.c.x - hy * u + hx * v, y: S.c.y + hx * u + hy * v });
        const via = viaOf(S); if (via != null) { S.via = via; const q = L.nodes[via], dq = Math.min(0.6, dist({ x: q[0], y: q[1] }, S.c)), ux = (q[0] - S.c.x) / (dist({ x: q[0], y: q[1] }, S.c) || 1), uy = (q[1] - S.c.y) / (dist({ x: q[0], y: q[1] }, S.c) || 1); pts.push({ x: S.c.x + ux * dq, y: S.c.y + uy * dq }); }
      }
      const hull = convexHull(pts), c = centroid(hull), poly = hull.map(q => { const d = dist(q, c) || 1; return { x: q.x + (q.x - c.x) / d * 0.15, y: q.y + (q.y - c.y) / d * 0.15 }; });
      L.aprons.push({ poly: flat(poly), name: undefined, _p: poly, implied: 1 });
      for (const S of G) S.ai = L.aprons.length - 1;
      notes.push(`${G.length} stands (${G.map(S => S.ref).filter(Boolean).slice(0, 4).join(', ')}${G.length > 4 ? ', …' : ''}) stand on pavement the map has no apron for: one is laid under them`);
    }
  }
  // (a position the map puts on a public road or a terminal's kerb is no stand)
  {
    const roads = L.roads.filter(r => (r.lv || 0) === 0 && (/^(motorway|trunk|primary|secondary|tertiary)/.test(r.cls) || r.kerb != null));
    const onRoad = S => roads.some(r => r._pts.some((q, i) => i && segDist(S.c, r._pts[i - 1], q) < r.w / 2 + 0.3));
    const n0 = standsOk.length; for (let i = standsOk.length - 1; i >= 0; i--) if (onRoad(standsOk[i])) standsOk.splice(i, 1);
    if (standsOk.length < n0) notes.push(`${n0 - standsOk.length} parking positions lie on a public road in the map: left out`);
  }
  for (const S of standsOk) {
    if (S.via === undefined) S.via = viaOf(S);
    if (S.via == null) notes.push(`stand ${S.ref || ''} at ${r1(S.p.x)}, ${r1(S.p.y)} has no taxiway within 250 m behind it`);
    L.stands.push({ ap: S.ai, x: r1(S.c.x), y: r1(S.c.y), h: Math.round(S.hh * 1000) / 1000, size: S.size, via: S.via != null ? S.via : undefined, ref: S.ref || undefined, gate: S.gate ? 1 : undefined });
  }

  // --- a taxiway that runs between a terminal's piers is a taxilane, no wider than the room the piers leave it
  {
    const terms = L.blds.filter(b => b.kind === 'terminal' && b._p && b._p.length), IC = game(), tsh = terms.map(b => IC.shapePoly(b._p));
    let narrowed = 0;
    for (const t of L.taxi) {
      const pts = t.n.map(i => ({ x: L.nodes[i][0], y: L.nodes[i][1] }));
      let room = 1e9;
      const dense = densify(pts, 0.1);
      for (let k = 0; k < tsh.length; k++) { const sh = tsh[k]; for (const q of dense) if (q.x > sh.bb[0] - 0.3 && q.x < sh.bb[2] + 0.3 && q.y > sh.bb[1] - 0.3 && q.y < sh.bb[3] + 0.3) room = Math.min(room, IC.shapeDist(sh, q)); }
      if (room < t.w / 2 + 0.03) { t.w = r1(Math.max(0.1, 2 * (room - 0.03))); t.lane = 1; narrowed++; }
    }
    if (narrowed) notes.push(`${narrowed} taxiways run within their width of a terminal: made taxilanes as wide as the room allows`);
  }

  // --- hangars: the game links a hangar by the door in the middle of its long side; where no taxiway comes within
  // 50 m of either side, a taxilane is laid from the nearer side to the nearest taxiway
  {
    const IC = game();
    let laid = 0;
    for (const B of L.blds) {
      if (B.kind !== 'hangar' || !B._p || !B._p.length) continue;
      const part = IC.polyPart('hangar', B._p), c = Math.cos(part.a), sn = Math.sin(part.a);
      const sides = [-1, 1].map(sg => ({ x: part.x - sn * sg * (part.h / 2 + 0.12), y: part.y + c * sg * (part.h / 2 + 0.12) }));
      const nearest = q => { let best = null; L.taxi.forEach(t => { for (let k = 1; k < t.n.length; k++) { const a = L.nodes[t.n[k - 1]], b = L.nodes[t.n[k]], dx = b[0] - a[0], dy = b[1] - a[1], LL = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((q.x - a[0]) * dx + (q.y - a[1]) * dy) / LL)), pt = { x: a[0] + dx * f, y: a[1] + dy * f }, d = dist(pt, q); if (!best || d < best.d) best = { d, t, k, pt, a, b }; } }); return best; };
      const near2 = sides.map(nearest).filter(Boolean);
      if (!near2.length || near2.some(n => n.d < 0.5)) continue;
      const si = near2[0].d <= near2[1].d ? 0 : 1, n = near2[si], door = sides[si];
      // (the lane must not run through the hangar: its door side faces the taxiway)
      if (inPoly({ x: (door.x + n.pt.x) / 2, y: (door.y + n.pt.y) / 2 }, B._p)) continue;
      let at;
      if (dist(n.pt, { x: n.a[0], y: n.a[1] }) < 0.05) at = n.t.n[n.k - 1];
      else if (dist(n.pt, { x: n.b[0], y: n.b[1] }) < 0.05) at = n.t.n[n.k];
      else { at = L.nodes.length; L.nodes.push([r1(n.pt.x), r1(n.pt.y)]); n.t.n.splice(n.k, 0, at); }
      const d = L.nodes.length; L.nodes.push([r1(door.x), r1(door.y)]);
      L.taxi.push({ n: [at, d], w: 0.15, lane: 1 });
      laid++;
    }
    if (laid) notes.push(`${laid} hangars had no taxiway within 50 m of their doors: a taxilane is laid to each`);
  }

  // --- a taxiway drawn into a hangar (the map takes the lane inside) stops at the wall, a lane's half-width short
  {
    const H = L.blds.filter(b => b.kind === 'hangar' && b._p && b._p.length).map(b => b._p);
    const outside = (p, m) => !H.some(P2 => polyDist(p, P2) < m);
    const edge = (a, b, m) => { let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const f = (lo + hi) / 2, q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; if (outside(q, m)) lo = f; else hi = f; } return { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo }; };
    const more = [];
    let cut = 0;
    for (const t of L.taxi) {
      const m = t.w / 2 + 0.03, ids = t.n.slice(), pts = ids.map(i => ({ x: L.nodes[i][0], y: L.nodes[i][1] }));
      // (the way sampled every 5 m, each sample knowing the node it is, if any)
      const smp = []; pts.forEach((p, i) => { if (i) { const a = pts[i - 1], n = Math.ceil(dist(a, p) / 0.05); for (let k = 1; k < n; k++) smp.push({ x: a.x + (p.x - a.x) * k / n, y: a.y + (p.y - a.y) * k / n, id: null }); } smp.push({ x: p.x, y: p.y, id: ids[i] }); });
      if (smp.every(p => outside(p, m))) continue;
      const newNode = q => { const id = L.nodes.length; L.nodes.push([r1(q.x), r1(q.y)]); return id; };
      const runs = []; let run = null;
      smp.forEach((p, i) => {
        if (outside(p, m)) { if (!run) { run = []; if (i) run.push(newNode(edge(p, smp[i - 1], m))); } if (p.id != null) run.push(p.id); }
        else if (run) { run.push(newNode(edge(smp[i - 1], p, m))); runs.push(run); run = null; }
      });
      if (run) runs.push(run);
      const good = runs.filter(r => r.length > 1);
      if (!good.length) { t.n = []; cut++; continue; }
      t.n = good[0]; for (const r of good.slice(1)) more.push(Object.assign({}, t, { n: r }));
      cut++;
    }
    L.taxi = L.taxi.filter(t => t.n.length > 1).concat(more);
    if (cut) notes.push(`${cut} taxiways run into a hangar in the map: each stops at the wall`);
  }

  // --- passenger bridges over taxiways: footways, corridors or buildings mapped as bridges that cross one
  for (const w of O.W.values()) {
    const t = w.tags || {}; if (!(t.bridge && t.bridge !== 'no') || !(/footway|corridor|pedestrian|steps/.test(t.highway || '') || t.indoor || t.building || t['building:part'] || t.man_made === 'bridge')) continue;
    const pts = wayPts(w); if (pts.length < 2 || !crossesTaxi(pts)) continue;
    const width = num(t.width, 20) / 100, a = pts[0], b = pts[pts.length - 1], L0 = dist(a, b) || 1, nx = -(b.y - a.y) / L0 * width / 2, ny = (b.x - a.x) / L0 * width / 2;
    const poly = w.nodes[0] === w.nodes[w.nodes.length - 1] ? pts.slice(0, -1) : [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    // the clearance: the bridge's own min_height, the taxiway's maxheight under it, or the config; else unknown
    const under = L.taxi.filter(x => x.maxht && pts.some((p, i) => i && x.n.some((k, j) => j && segX(pts[i - 1], p, { x: L.nodes[x.n[j - 1]][0], y: L.nodes[x.n[j - 1]][1] }, { x: L.nodes[k][0], y: L.nodes[k][1] }))));
    const clear = num(t.min_height, 0) || (under[0] && under[0].maxht) || C.bridgeClear || 0;
    if (!clear) notes.push(`${t.name || 'a passenger bridge'} over a taxiway has no clearance in the data (min_height or maxheight): left without a height limit`);
    const joins = L.blds.map((B, i) => B._p && B._p.length && poly.some(q => polyDist(q, B._p) < 0.3) ? i : -1).filter(i => i >= 0);
    L.bridges.push({ poly: flat(poly), clear: clear || undefined, name: t.name || undefined, joins });
  }

  // --- people movers and trains: light rail, subway, monorail; their stations join the terminals
  for (const w of O.W.values()) {
    const t = w.tags || {}; if (!/^(light_rail|subway|monorail|funicular|rail|narrow_gauge)$/.test(t.railway || t['construction:railway'] || '')) continue;
    const pts = simplify(wayPts(w), 0.02); if (pts.length < 2) continue;
    const lv = t.tunnel && t.tunnel !== 'no' ? -1 : (t.bridge && t.bridge !== 'no') || +t.layer > 0 ? 1 : 0;
    const mover = /people mover|apm|automated|train|guideway|skylink|landside access/i.test([t.name, t.service, t.usage, t.description, t.network].join(' ')) || t.railway === 'monorail' || (t.railway === 'subway' && airside(centroid(pts)));
    if (!mover && !nearAny(pts)) continue;
    if (mover) L.movers.push({ pts: flat(pts), lv, name: t.name || undefined });
    else L.rails.push({ pts: flat(pts), lv, name: t.name || undefined, cls: t.railway });
  }
  for (const M of L.movers) { const pts = []; for (let i = 0; i < M.pts.length; i += 2) pts.push({ x: M.pts[i], y: M.pts[i + 1] }); M.stops = L.blds.map((B, i) => B.kind === 'terminal' && B._p.some(() => true) && pts.some(p => polyDist(p, B._p) < 0.5) ? i : -1).filter(i => i >= 0); }

  // --- an apron drawn over a public road or a terminal's kerb (the map's outline reaches a little too far) gives way:
  // its outline is pushed off the road, a road's half-width and 3 m clear
  {
    const roads = L.roads.filter(r => (r.lv || 0) === 0 && (/^(motorway|trunk|primary|secondary|tertiary)/.test(r.cls) || r.kerb != null)).map(r => ({ pts: r._pts, m: r.w / 2 + 0.03, bb: r._pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [1e9, 1e9, -1e9, -1e9]) }));
    let pushed = 0;
    for (const A of L.aprons) {
      const bb = A._p.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [1e9, 1e9, -1e9, -1e9]);
      const R = roads.filter(r => !(r.bb[2] + r.m < bb[0] || bb[2] < r.bb[0] - r.m || r.bb[3] + r.m < bb[1] || bb[3] < r.bb[1] - r.m));
      if (!R.length) continue;
      // the nearest road point to q, and how far
      const nearest = q => { let best = null; for (const r of R) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / LL)), c = { x: a.x + dx * f, y: a.y + dy * f }, d = dist(c, q); if (!best || d < best.d) best = { d, c, m: r.m }; } return best; };
      const dense = densify(A._p.concat([A._p[0]]), 0.05).slice(0, -1);
      let moved = false;
      const out = dense.map(q => { const n = nearest(q); if (!n || n.d >= n.m) return q; moved = true; const d = n.d || 1e-6, ux = (q.x - n.c.x) / d, uy = (q.y - n.c.y) / d; return { x: n.c.x + ux * (n.m + 0.005), y: n.c.y + uy * (n.m + 0.005) }; });
      let P2 = simplify(out.concat([out[0]]), 0.005).slice(0, -1);
      // a road that runs through the apron cuts it: the side with the apron's centre stays (Sutherland–Hodgman
      // against the road's edge, one segment at a time)
      for (const r of R) for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!inPoly(a, P2) && !inPoly(b, P2) && !inPoly(mid, P2)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, LL = Math.hypot(dx, dy) || 1, nx = -dy / LL, ny = dx / LL, c = centroid(P2);
        const side = Math.sign((c.x - a.x) * nx + (c.y - a.y) * ny) || 1;   // the centre's side of the road
        const f = q => (q.x - a.x) * nx * side + (q.y - a.y) * ny * side - r.m;   // > 0: clear of the road, on the kept side
        const clipped = [];
        for (let k = 0; k < P2.length; k++) {
          const p = P2[k], q = P2[(k + 1) % P2.length], fp = f(p), fq = f(q);
          if (fp >= 0) clipped.push(p);
          if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); clipped.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
        }
        if (clipped.length >= 3 && area(clipped) > 0.05) { P2 = clipped; moved = true; }
      }
      if (!moved) continue;
      if (P2.length >= 3 && area(P2) > 0.05) { A._p = P2; A.poly = flat(P2); pushed++; }
    }
    if (pushed) notes.push(`${pushed} aprons reached over a public road in the map: their outlines are pushed off it`);
  }

  // --- car parks and garages
  for (const A of areas(t => t.amenity === 'parking' || t.parking === 'multi-storey' || t.building === 'parking')) {
    const pts = simplify(A.pts.concat([A.pts[0]]), 0.01).slice(0, -1); if (pts.length < 3 || area(pts) < 0.02) continue;
    if (!near(centroid(pts))) continue;
    if (aero && airside(centroid(pts)) && !/public|customer/.test(A.tags.access || 'public')) continue;
    const garage = A.tags.parking === 'multi-storey' || A.tags.building === 'parking' || A.tags.building === 'garage' || +A.tags['building:levels'] > 1;
    L.parks.push({ kind: garage ? 'garage' : /rental|taxi/i.test(A.tags.name || '') ? 'taxi' : 'park', poly: flat(pts), lvls: num(A.tags['building:levels'], garage ? 4 : 0) || undefined, name: A.tags.name || undefined, _p: pts, _a: area(pts), _air: aero && airside(centroid(pts)) });
  }
  {
    // a lot drawn round its sections, or round a garage, is the same car park twice: the whole goes, the parts stay
    // (a garage before a lot on the same outline)
    const IC = game(), drop = new Set(), sh = L.parks.map(k => IC.shapePoly(k._p));
    for (let i = 0; i < L.parks.length; i++) for (let j = 0; j < L.parks.length; j++) {
      if (i === j || drop.has(i) || drop.has(j)) continue;
      const A = L.parks[i], B = L.parks[j]; if (!inPoly(centroid(B._p), A._p)) continue;
      const both = inPoly(centroid(A._p), B._p);
      if (both) { if (A.kind === 'garage' && B.kind !== 'garage') drop.add(j); else if (B.kind === 'garage' && A.kind !== 'garage') drop.add(i); else drop.add(A._a >= B._a ? i : j); }
      else drop.add(i);
    }
    // car parks over an airside building or an apron (the map's lots reach under sheds and onto ramps): left out
    const bsh = L.blds.map(b => b._p && b._p.length ? IC.shapePoly(b._p) : null), ash = L.aprons.map(a => IC.shapePoly(a._p));
    for (let i = 0; i < L.parks.length; i++) {
      if (drop.has(i)) continue;
      const over = x => x && !(x.bb[2] < sh[i].bb[0] || sh[i].bb[2] < x.bb[0] || x.bb[3] < sh[i].bb[1] || sh[i].bb[3] < x.bb[1]) && IC.shapeDepth(sh[i], x) > 0.02;
      if (ash.some(over)) { drop.add(i); continue; }
      for (let bi = bsh.findIndex(over); bi >= 0 && !drop.has(i); bi = bsh.findIndex(over)) { if (L.blds[bi].kind === 'support' && L.parks[i]._air) { L.blds.splice(bi, 1); bsh.splice(bi, 1); } else drop.add(i); }
    }
    if (drop.size) { notes.push(`${drop.size} car parks drawn over another, a building or an apron are left out`); L.parks = L.parks.filter((_, i) => !drop.has(i)); }
    // the landside's roads stop at a car park's or a building's edge (the lot is an area, its aisles are not drawn;
    // the road into a garage or a loading dock ends at the wall), checked every 5 m along them
    const out = [], polys = L.parks.map(k => k._p).concat(L.blds.filter(b => b._p && b._p.length && b.kind !== 'terminal').map(b => b._p));
    const pbb = polys.map(P2 => P2.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [1e9, 1e9, -1e9, -1e9]));
    for (const R of L.roads) {
      if ((R.lv || 0) !== 0) { out.push(R); continue; }
      const m = R.w / 2 + 0.02, inside = p => polys.some((P2, i) => p.x > pbb[i][0] - m && p.x < pbb[i][2] + m && p.y > pbb[i][1] - m && p.y < pbb[i][3] + m && polyDist(p, P2) < m);
      const dense = densify(R._pts, 0.05);
      if (!dense.some(inside)) { out.push(R); continue; }
      let run = []; const flush = () => { const r = simplify(run, 0.01); if (r.length > 1) out.push(Object.assign({}, R, { pts: flat(r), _pts: r })); run = []; };
      for (const p of dense) { if (inside(p)) flush(); else run.push(p); }
      flush();
    }
    L.roads = out;
  }

  // tidy: drop the working fields
  if (!o.debug) for (const k of ['aprons', 'blds', 'parks', 'roads']) for (const x of L[k]) for (const f of Object.keys(x)) if (f.charAt(0) === '_') delete x[f];
  L.notes = notes;
  // the check against the map's own runway ways, where it has them
  L.check = { osmRunways: osmRwy.map(w => { const pts = wayPts(w); return { ref: tag(w, 'ref'), a: pts[0], b: pts[pts.length - 1] }; }) };
  return L;
}
/* do two segments cross (strictly) */
function segX(a, b, c, d) { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0; }

/* ---------- writing ---------- */
function write(layouts) {
  const out = path.join(__dirname, '../iron-canopy/js/airports-real-data.js');
  const body = layouts.map(L => { const c = Object.assign({}, L); delete c.check; delete c.notes; return `IC.REAL_APT.${L.key} = ${JSON.stringify(c)};`; }).join('\n');
  fs.writeFileSync(out, `/* Iron Canopy — airports from real data, made by tools/airport-import.js: do not edit by hand.
   Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL); runway ends from
   OurAirports (public domain). */
(function (IC) {
'use strict';
IC.REAL_APT = IC.REAL_APT || {};
${body}
})(window.IC);
`);
  return out;
}

/* ---------- the accuracy check (brief 39): the airport as the game builds it, against the sources ---------- */
/* runway ends against OurAirports (and the map's runway lines, where it has them) in metres; gates numbered against
   the extract's parking positions and gates; each terminal's footprint against its outline in the map. Needs the
   game loaded (headless.js) for IC.aptFromLayout. */
function accuracy(key, L0) {
  const IC = global.IC || require('../headless.js');
  const C = CFG[key], L = L0 || IC.REAL_APT[key] || importAirport(key);
  if (!L || L.missing) return null;
  const ap = { id: 'chk' + key, kind: 'airport', x: 0, y: 0, name: L.name };
  IC.aptFromLayout(ap, L, { x: 0, y: 0, rot: 0 });
  const out = { key, name: L.name, runways: [], gates: null, terminals: [] };
  // runway ends: the source is OurAirports' latitude and longitude, projected the same way
  const rows = C.ident ? csv(fs.readFileSync(path.join(DIR, 'ourairports-runways.csv'), 'utf8')).filter(r => r.airport_ident === C.ident && r.closed !== '1') : [];
  const proj = projector(L.ref[0], L.ref[1]);
  const O = C.osm && fs.existsSync(path.join(DIR, C.osm)) ? readOsm(path.join(DIR, C.osm)) : null;
  const osmRw = O ? [...O.W.values()].filter(w => w.tags && w.tags.aeroway === 'runway' && w.nodes[0] !== w.nodes[w.nodes.length - 1]).map(w => ({ ref: w.tags.ref || '', pts: w.nodes.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon)) })) : [];
  for (const rw of ap.parts.filter(p => p.kind === 'runway')) {
    const r = { name: rw.name, len: Math.round(IC.rwLen(rw) * 100), w: Math.round(rw.w * 100) };
    const row = rows.find(q => [q.le_ident, q.he_ident].some(e => rw.ends.a.replace(/^0/, '') === e.replace(/^0/, '')));
    if (row) {
      const a = proj(+row.le_latitude_deg, +row.le_longitude_deg), b = proj(+row.he_latitude_deg, +row.he_longitude_deg);
      const same = rw.ends.a.replace(/^0/, '') === row.le_ident.replace(/^0/, '');
      r.ourairports = Math.round(Math.max(dist(same ? a : b, rw.a), dist(same ? b : a, rw.b)) * 100 * 10) / 10;
      r.lenSrc = Math.round(+row.length_ft * 0.3048);
      // (half a unit in the last decimal place the source gives, in metres, on both axes: some rows are given to
      // 0.001°, and come through single-precision floats, so a value counts as d decimals when it lies within a
      // float's rounding of such a number)
      const dec = v => { for (let d = 1; d <= 6; d++) if (Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-5 * Math.pow(10, d)) return d; return 7; };
      const d = Math.min(...[row.le_latitude_deg, row.le_longitude_deg, row.he_latitude_deg, row.he_longitude_deg].map(v => dec(+v)));
      r.prec = Math.round(0.5 * Math.pow(10, -d) * 111320 * Math.SQRT2);
      r.decimals = d;
    }
    // the map's runway line nearest this runway: the distance of each end from it, along and across
    const m = osmRw.map(o => ({ o, d: Math.min(dist(o.pts[0], rw.a) + dist(o.pts[o.pts.length - 1], rw.b), dist(o.pts[0], rw.b) + dist(o.pts[o.pts.length - 1], rw.a)) })).sort((x, y) => x.d - y.d)[0];
    // (across the map's line: the map's ends are drawn to the pavement or the threshold as the mapper saw them)
    if (m) { const e = m.o.pts, a = e[0], b = e[e.length - 1], L0 = dist(a, b) || 1, off = q => Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / L0; r.osm = Math.round(Math.max(off(rw.a), off(rw.b)) * 100 * 10) / 10; }
    out.runways.push(r);
  }
  // gates: stands with a gate number in the game, against the map's numbered parking positions (or gates)
  IC.aptGraph(ap);
  const st = IC.aptStands ? IC.aptStands(ap) : [];
  // (distinct gate numbers: a gate the map draws twice, for two aircraft sizes, is one gate)
  const inGame = new Set(ap.parts.filter(p => p.kind === 'apron').flatMap(p => (p.stands || []).filter(s => s.name && s.contact).map(s => s.name))).size;
  const area = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j].x - P[i].x) * (P[j].y + P[i].y); return Math.abs(s / 2); };
  let src = null;
  if (O) {
    // the map's gates, counted as the importer counts stands: parking positions (a node, or a lead-in way ending at
    // the stand) numbered by their tag or by the gate node nearest them, one per spot (a gate drawn twice, for two
    // aircraft sizes, is one gate), at a terminal when a jet bridge is drawn to them or they stand within GATE_D of a
    // terminal's wall (a gate node alone marks a bus gate at a remote pad)
    const termP = [...O.W.values()].filter(w => isTerminal(w.tags) && w.nodes[0] === w.nodes[w.nodes.length - 1]).map(w => ({ t: w.tags, P: w.nodes.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon)) }));
    for (const rel of O.R) if (isTerminal(rel.tags) && /multipolygon/.test(rel.tags.type || '')) for (const ring of rings(O, rel, 'outer')) termP.push({ t: rel.tags, P: ring.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon)) });
    // (as the importer: an unnamed scrap under TERM_HA is no terminal)
    const termQ = termP.filter(x => x.t.name || area(x.P) >= TERM_HA).map(x => x.P);
    const gn = []; for (const n of O.N.values()) if (n.tags && n.tags.aeroway === 'gate') gn.push({ p: proj(n.lat, n.lon), ref: n.tags.ref || n.tags.name });
    const refOf = (t, p) => { if (t.ref || t.name) return t.ref || t.name; let bd = 0.8, ref = null; for (const g of gn) { const d = dist(g.p, p); if (d < bd) { bd = d; ref = g.ref; } } return ref; };
    const pp = []; for (const n of O.N.values()) if (n.tags && n.tags.aeroway === 'parking_position') { const p = proj(n.lat, n.lon); pp.push({ ref: refOf(n.tags, p), p }); }
    for (const w of O.W.values()) if (w.tags && w.tags.aeroway === 'parking_position') { const pts = w.nodes.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon)); if (pts.length) pp.push({ ref: refOf(w.tags, pts[pts.length - 1]), p: pts[pts.length - 1], q: pts[0] }); }
    const jet = []; for (const w of O.W.values()) if (w.tags && w.tags.aeroway === 'jet_bridge') for (const n of w.nodes) { const x = O.N.get(n); if (x) jet.push(proj(x.lat, x.lon)); }
    const at = s => jet.some(j => dist(j, s.p) < 0.4 || (s.q && dist(j, s.q) < 0.4)) || termQ.some(T => T.length > 2 && (polyDist(s.p, T) < GATE_D || (s.q && polyDist(s.q, T) < GATE_D)));
    const one = [];
    for (const s of pp.filter(x => x.ref).sort((a, b) => a.ref.length - b.ref.length)) if (!one.some(t => dist(t.p, s.p) < 0.1)) one.push(s);
    const refs = new Set(one.map(s => s.ref)), gates = new Set(one.filter(at).map(s => s.ref));
    src = { parking: refs.size, gates: gates.size };
  }
  out.gates = { game: inGame, stands: st.length, src };
  // terminal footprints: the part's area in the game against the outline's area in the map
  const srcT = O ? [...O.W.values()].filter(w => isTerminal(w.tags) && w.nodes[0] === w.nodes[w.nodes.length - 1]).map(w => ({ name: w.tags.name, a: area(w.nodes.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon))) })) : [];
  if (O) for (const rel of O.R) if (isTerminal(rel.tags) && /multipolygon/.test(rel.tags.type || '')) for (const ring of rings(O, rel, 'outer')) srcT.push({ name: rel.tags.name, a: area(ring.map(id => O.N.get(id)).filter(Boolean).map(n => proj(n.lat, n.lon))) });
  for (const t of ap.parts.filter(p => p.kind === 'terminal')) {
    const a = IC.partArea(t), s0 = srcT.filter(x => x.name && x.name === t.name).sort((x, y) => Math.abs(x.a - a) - Math.abs(y.a - a))[0];
    out.terminals.push({ name: t.name || 'terminal', ha: Math.round(a * 100) / 100, src: s0 ? Math.round(s0.a * 100) / 100 : null, off: s0 ? Math.round((a / s0.a - 1) * 1000) / 10 : null });
  }
  return out;
}
/* the check in words, one line a thing */
function accuracyText(A) {
  const L = [`${A.name}:`];
  for (const r of A.runways) L.push(`  ${r.name}: ${r.len} m × ${r.w} m${r.lenSrc ? ` (source ${r.lenSrc} m)` : ''}; ends within ${r.ourairports != null ? r.ourairports + ' m of OurAirports' + (r.prec > 30 ? ` (given to ${r.decimals} decimals, about ${r.prec} m)` : '') : '—'}${r.osm != null ? `, ${r.osm} m across the map's runway line` : ''}`);
  const g = A.gates;
  L.push(`  gates: ${g.game} numbered gates (${g.stands} stands in all)${g.src ? `; the map has ${g.src.parking} numbered parking positions, ${g.src.gates} of them at a terminal` : ''}`);
  for (const t of A.terminals) L.push(`  ${t.name}: ${t.ha} ha${t.src != null ? ` (map ${t.src} ha, ${t.off > 0 ? '+' : ''}${t.off}%)` : ''}`);
  return L.join('\n');
}

module.exports = { importAirport, readOsm, projector, csv, write, accuracy, accuracyText };

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const keys = args.length ? args : Object.keys(CFG).filter(k => k !== 'mini');
  const done = [];
  for (const k of keys) {
    const L = importAirport(k);
    if (L.missing) { console.log(`${k}: no extract at ${path.relative(process.cwd(), L.missing)}: fetch it first (tools/airports/fetch.sh)`); continue; }
    console.log(`${k}: ${L.runways.length} runways, ${L.nodes.length} taxi nodes in ${L.taxi.length} taxiways, ${L.aprons.length} aprons, ${L.stands.length} stands, ${L.blds.length} buildings, ${L.bridges.length} bridges, ${L.movers.length} people movers, ${L.roads.length} roads, ${L.parks.length} car parks`);
    for (const n of L.notes) console.log('   note: ' + n);
    done.push(L);
  }
  if (done.length && !process.argv.includes('--check')) console.log('wrote ' + path.relative(process.cwd(), write(done)));
  if (process.argv.includes('--check')) for (const L of done) console.log(accuracyText(accuracy(L.key, L)));
}
