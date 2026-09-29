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

/* ---------- reading ---------- */
function csv(text) {
  const rows = [], lines = text.split(/\r?\n/).filter(Boolean);
  const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const head = split(lines[0]);
  for (const l of lines.slice(1)) { const v = split(l), r = {}; head.forEach((h, i) => { r[h] = v[i]; }); rows.push(r); }
  return rows;
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
const r1 = v => Math.round(v * 1000) / 1000;   // 0.1 m
const flat = P => P.flatMap(p => [r1(p.x), r1(p.y)]);
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

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
  if (!L.runways.length) for (const w of osmRwy) {
    const pts = wayPts(w), a = pts[0], b = pts[pts.length - 1], ref = (tag(w, 'ref') || '').split('/');
    L.runways.push({ a: [r1(a.x), r1(a.y)], b: [r1(b.x), r1(b.y)], w: r1(num(tag(w, 'width'), 45) / 100), ends: [ref[0] || 'A', ref[1] || 'B'], hdg: null, disp: [0, 0], ils: [] });
  }
  const rwLines = L.runways.map(r => ({ a: { x: r.a[0], y: r.a[1] }, b: { x: r.b[0], y: r.b[1] }, w: r.w }));

  // --- the aerodrome's outline (the fence runs round it): roads inside it are airside
  const aero = areas(t => t.aeroway === 'aerodrome').sort((p, q) => area(q.pts) - area(p.pts))[0];
  const airside = p => aero ? inPoly(p, aero.pts) : true;

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
    if (t.aeroway === 'terminal' || t.building === 'terminal' || /concourse|terminal/i.test(t.name || '')) return 'terminal';
    if (t.aeroway === 'control_tower' || t['tower:type'] === 'airport_control' || /control tower|atct/i.test(s)) return 'tower';
    if (t.amenity === 'fire_station' || /fire station|arff|crash fire/i.test(s)) return 'fire';
    if (t.aeroway === 'hangar' || t.building === 'hangar') return 'hangar';
    if (/cargo|freight/i.test(s) || (t.building === 'warehouse')) return 'cargo';
    if (t.man_made === 'storage_tank' && /fuel|oil|jet/i.test([t.content, t.substance, s].join(' '))) return 'fuel';
    return 'support';
  };
  const tanks = [];
  for (const B of BLD) {
    if (B.tags['building:part'] && !B.tags.building) continue;
    const pts = simplify(B.pts.concat([B.pts[0]]), 0.01).slice(0, -1); if (pts.length < 3) continue;
    const a = area(pts), c = centroid(pts), k = kindOf(B.tags);
    if (!aero || !airside(c)) { if (!(k === 'terminal' || /parking|garage|hotel|station/i.test([B.tags.name, B.tags.building, B.tags.amenity].join(' ')))) continue; }
    if (k === 'support' && a < 0.04) continue;   // (sheds under 400 m² are left out)
    if (k === 'fuel') { tanks.push({ c, r: Math.sqrt(a / Math.PI) }); continue; }
    const roof = (C.roofs || []).find(([re]) => re.test(B.tags.name || '')), lv = num(B.tags['building:levels'], 0);
    const parking = B.tags.amenity === 'parking' || B.tags.parking === 'multi-storey' || B.tags.building === 'parking';
    if (parking) continue;   // (garages come in with the car parks)
    L.blds.push({ kind: k, poly: flat(pts), name: B.tags.name || undefined, roof: roof ? roof[1] : undefined, lvls: lv || undefined, noApron: k === 'terminal' || undefined, _p: pts, _a: a });
  }
  for (const n of O.N.values()) if (n.tags && n.tags.man_made === 'storage_tank' && /fuel|oil|jet/i.test([n.tags.content, n.tags.substance, n.tags.name].join(' '))) tanks.push({ c: proj(n.lat, n.lon), r: 0.13 });
  for (const n of O.N.values()) if (n.tags && (n.tags.aeroway === 'control_tower' || n.tags['tower:type'] === 'airport_control') && !L.blds.some(b => b.kind === 'tower' && polyDist(proj(n.lat, n.lon), b._p) < 0.2)) { const c = proj(n.lat, n.lon); L.blds.push({ kind: 'tower', poly: flat([{ x: c.x - 0.07, y: c.y - 0.07 }, { x: c.x + 0.07, y: c.y - 0.07 }, { x: c.x + 0.07, y: c.y + 0.07 }, { x: c.x - 0.07, y: c.y + 0.07 }]), name: n.tags.name, _p: [] }); }
  for (const t of tanks) L.blds.push({ kind: 'fuel', c: [r1(t.c.x), r1(t.c.y)], r: r1(Math.max(0.06, t.r)) });

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
  const bldsNear = PP.length ? L.blds.filter(b => b._p && b._p.length && (b.kind === 'terminal' || b.kind === 'cargo' || b.kind === 'support' || b.kind === 'hangar')) : [];
  for (const S of PP) {
    // the apron it stands on
    let ai = L.aprons.findIndex(A => inPoly(S.p, A._p));
    if (ai < 0) { let bd = 0.3; L.aprons.forEach((A, i) => { const d = polyDist(S.p, A._p); if (d < bd) { bd = d; ai = i; } }); }
    if (ai < 0) { notes.push(`stand ${S.tags.ref || ''} at ${r1(S.p.x)}, ${r1(S.p.y)} is on no apron: left out`); continue; }
    // nose to the nearest building edge when the data gives no lead-in
    let h = S.h;
    if (h == null) { let bd = 1.5, best = null; for (const b of bldsNear) { const P2 = b._p; for (let i = 0, j = P2.length - 1; i < P2.length; j = i++) { const a = P2[j], c = P2[i], dx = c.x - a.x, dy = c.y - a.y, LL = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((S.p.x - a.x) * dx + (S.p.y - a.y) * dy) / LL)), q = { x: a.x + dx * f, y: a.y + dy * f }, d = dist(q, S.p); if (d < bd) { bd = d; best = q; } } } h = best ? Math.atan2(best.y - S.p.y, best.x - S.p.x) : 0; }
    // its gate number: the tag, else the gate node nearest the stand
    let ref = S.tags.ref || S.tags.name;
    if (!ref) { let bd = 0.8; for (const g of gates) { const d = dist(g.p, S.p); if (d < bd) { bd = d; ref = g.ref; } } }
    S.ai = ai; S.hh = h; S.ref = ref;
  }
  const standsOk = PP.filter(S => S.ai != null);
  for (const S of standsOk) {
    // the size from the room it has: the gap to the stands either side, across its heading
    let gap = 1e9;
    for (const T of standsOk) { if (T === S) continue; const dx = T.p.x - S.p.x, dy = T.p.y - S.p.y, along = Math.abs(dx * Math.cos(S.hh) + dy * Math.sin(S.hh)), across = Math.abs(-dx * Math.sin(S.hh) + dy * Math.cos(S.hh)); if (along < 0.35 && across < gap) gap = across; }
    const size = /heavy|wide|[ABCDEF]\b/.test(S.tags['aircraft:size'] || '') ? null : gap >= 0.7 ? 'l' : gap >= 0.44 ? 'm' : 's';
    // the stand's own point is where the nose wheel stops; the game's stand is the aircraft's middle
    const back = { l: 0.4, m: 0.25, s: 0.18 }[size || 'm'];
    const c = { x: S.p.x - Math.cos(S.hh) * back, y: S.p.y - Math.sin(S.hh) * back };
    // the lead-in: the taxi node behind the stand, nearest along its line
    let via = null, bv = 1.6;
    L.nodes.forEach((q, i) => { const d = Math.hypot(q[0] - c.x, q[1] - c.y), behind = -((q[0] - c.x) * Math.cos(S.hh) + (q[1] - c.y) * Math.sin(S.hh)); if (behind > back && d < bv) { bv = d; via = i; } });
    L.stands.push({ ap: S.ai, x: r1(c.x), y: r1(c.y), h: Math.round(S.hh * 1000) / 1000, size: size || 'm', via: via != null ? via : undefined, ref: S.ref || undefined });
  }

  // --- passenger bridges over taxiways: footways, corridors or buildings mapped as bridges that cross one
  const TWshape = L.taxi.map(t => t.n.map(i => ({ x: L.nodes[i][0], y: L.nodes[i][1] })));
  const crossesTaxi = pts => TWshape.some(T => pts.some((p, i) => i && T.some((q, j) => j && segX(pts[i - 1], p, T[j - 1], q))));
  for (const w of O.W.values()) {
    const t = w.tags || {}; if (!(t.bridge && t.bridge !== 'no') || !(/footway|corridor|pedestrian|steps/.test(t.highway || '') || t.indoor || t.building || t['building:part'] || t.man_made === 'bridge')) continue;
    const pts = wayPts(w); if (pts.length < 2 || !crossesTaxi(pts)) continue;
    const width = num(t.width, 20) / 100, a = pts[0], b = pts[pts.length - 1], L0 = dist(a, b) || 1, nx = -(b.y - a.y) / L0 * width / 2, ny = (b.x - a.x) / L0 * width / 2;
    const poly = w.nodes[0] === w.nodes[w.nodes.length - 1] ? pts.slice(0, -1) : [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    // the clearance: the bridge's own min_height, the taxiway's maxheight under it, or the config; else unknown
    const under = L.taxi.filter(x => x.maxht && pts.some((p, i) => i && x.n.some((k, j) => j && segX(pts[i - 1], p, { x: L.nodes[x.n[j - 1]][0], y: L.nodes[x.n[j - 1]][1] }, { x: L.nodes[k][0], y: L.nodes[k][1] }))));
    const clear = num(t.min_height, 0) || (under[0] && under[0].maxht) || C.bridgeClear || 0;
    if (!clear) notes.push(`${t.name || 'a passenger bridge'} over a taxiway has no clearance in the data (min_height or maxheight): left without a height limit`);
    const joins = L.blds.map((B, i) => B._p && B._p.length && (polyDist(a, B._p) < 0.3 || polyDist(b, B._p) < 0.3) ? i : -1).filter(i => i >= 0);
    L.bridges.push({ poly: flat(poly), clear: clear || undefined, name: t.name || undefined, joins });
  }

  // --- people movers and trains: light rail, subway, monorail; their stations join the terminals
  for (const w of O.W.values()) {
    const t = w.tags || {}; if (!/^(light_rail|subway|monorail|funicular|rail|narrow_gauge)$/.test(t.railway || '')) continue;
    const pts = simplify(wayPts(w), 0.02); if (pts.length < 2) continue;
    const lv = t.tunnel && t.tunnel !== 'no' ? -1 : (t.bridge && t.bridge !== 'no') || +t.layer > 0 ? 1 : 0;
    const mover = /people mover|apm|automated|train|guideway|skylink|landside access/i.test([t.name, t.service, t.usage, t.description].join(' ')) || t.railway === 'monorail' || (t.railway === 'subway' && airside(centroid(pts)));
    if (mover) L.movers.push({ pts: flat(pts), lv, name: t.name || undefined });
    else L.rails.push({ pts: flat(pts), lv, name: t.name || undefined, cls: t.railway });
  }
  for (const M of L.movers) { const pts = []; for (let i = 0; i < M.pts.length; i += 2) pts.push({ x: M.pts[i], y: M.pts[i + 1] }); M.stops = L.blds.map((B, i) => B.kind === 'terminal' && B._p.some(() => true) && pts.some(p => polyDist(p, B._p) < 0.5) ? i : -1).filter(i => i >= 0); }

  // --- roads: public roads and the landside's own, on their levels; airside service roads apart
  const PUB = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)(_link)?$/;
  const lanesOf = (t, cls) => num(t.lanes, /motorway|trunk/.test(cls) ? 4 : /primary|secondary/.test(cls) ? 3 : 2);
  const roadEnds = new Map();
  for (const w of O.W.values()) {
    const t = w.tags || {}; const cls = t.highway; if (!cls || !(PUB.test(cls) || cls === 'service')) continue;
    if (t.area === 'yes') continue;
    const pts = simplify(wayPts(w), 0.01); if (pts.length < 2) continue;
    const lv = t.tunnel && t.tunnel !== 'no' ? -1 : (t.bridge && t.bridge !== 'no') ? Math.max(1, +t.layer || 1) : +t.layer > 0 ? +t.layer : +t.layer < 0 ? -1 : 0;
    const mid = pts[pts.length >> 1];
    if (cls === 'service' && aero && airside(mid) && !inPoly(mid, (L.blds.find(b => b.kind === 'terminal') || { _p: [] })._p)) { L.service.push({ pts: flat(pts) }); continue; }
    const lanes = lanesOf(t, cls), oneway = t.oneway === 'yes' || /motorway|_link/.test(cls) && t.oneway !== 'no' ? 1 : t.oneway === '-1' ? -1 : 0;
    L.roads.push({ pts: flat(pts), w: r1(Math.min(0.3, lanes * 3.5 / 100 + 0.02)), lv: lv || undefined, oneway: oneway || undefined, lanes, name: t.name || undefined, cls, kind: lv > 0 ? 'upper' : 'road' });
    for (const id of [w.nodes[0], w.nodes[w.nodes.length - 1]]) roadEnds.set(id, (roadEnds.get(id) || 0) + 1);
  }
  // junctions where roads share a node at the same level; road ends that lead out of the extract are its exits
  const onRoads = new Map();
  for (const w of O.W.values()) { const t = w.tags || {}; if (!t.highway || !(PUB.test(t.highway) || t.highway === 'service')) continue; for (const id of w.nodes) onRoads.set(id, (onRoads.get(id) || 0) + 1); }
  for (const [id, n] of onRoads) if (n > 1) { const p = P(id); if (p) L.junctions.push([r1(p.x), r1(p.y)]); }
  const bbox = [...O.N.values()].reduce((b, n) => { const p = proj(n.lat, n.lon); return [Math.min(b[0], p.x), Math.min(b[1], p.y), Math.max(b[2], p.x), Math.max(b[3], p.y)]; }, [1e9, 1e9, -1e9, -1e9]);
  for (const [id, n] of roadEnds) { if (n !== 1 || (onRoads.get(id) || 0) > 1) continue; const p = P(id); if (p && Math.min(p.x - bbox[0], bbox[2] - p.x, p.y - bbox[1], bbox[3] - p.y) < 2) L.exits.push([r1(p.x), r1(p.y)]); }

  // --- car parks and garages
  for (const A of areas(t => t.amenity === 'parking' || t.parking === 'multi-storey' || t.building === 'parking')) {
    const pts = simplify(A.pts.concat([A.pts[0]]), 0.01).slice(0, -1); if (pts.length < 3 || area(pts) < 0.02) continue;
    if (aero && airside(centroid(pts)) && !/public|customer/.test(A.tags.access || 'public')) continue;
    const garage = A.tags.parking === 'multi-storey' || A.tags.building === 'parking' || A.tags.building === 'garage' || +A.tags['building:levels'] > 1;
    L.parks.push({ kind: garage ? 'garage' : /rental|taxi/i.test(A.tags.name || '') ? 'taxi' : 'park', poly: flat(pts), lvls: num(A.tags['building:levels'], garage ? 4 : 0) || undefined, name: A.tags.name || undefined });
  }

  // tidy: drop the working fields
  for (const k of ['aprons', 'blds']) for (const x of L[k]) { delete x._p; delete x._a; }
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

module.exports = { importAirport, readOsm, projector, csv, write };

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
}
