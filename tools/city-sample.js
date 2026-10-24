/* Measures real urban fabric from OpenStreetMap and writes the game's data file iron-canopy/js/city-samples.js
   (brief 65). Run once by hand; the game and the tests only read the file it writes, never the network.

     node tools/city-sample.js            fetch what is not cached (tools/cities/raw/, not committed), measure, write
     node tools/city-sample.js --print    measure the cache and print a table, write nothing

   Each patch of tools/cities/config.js is fetched from the OpenStreetMap API (api.openstreetmap.org/api/0.6/map, a
   bounding box, one request a patch, a second apart) and measured in metres round its centre:
   - streets: the drivable and pedestrian street graph (highway = motorway … living_street, pedestrian; not service
     roads or footpaths). Junctions closer than 12 m are one junction (a dual carriageway's two crossings). Junctions
     a km² and the share of three-way ones and of dead ends; street km a km²; the orientation entropy and order φ of
     Boeing (2019, "Urban spatial order", Applied Network Science 4:67: 18 bins of 10° over 0–180°, length-weighted,
     φ = 1 − ((H − ln 2) / (ln 18 − ln 2))², 1 for a perfect grid, 0 for no order); the spacing of streets along the
     dominant direction and across it, by counting the streets crossed by lines laid across the patch.
   - buildings: closed ways tagged building (multipolygon relations are left out, so a few large downtown buildings
     are missing and coverage there is a little low); coverage (footprint share of the ground), buildings a hectare,
     footprint areas and depths (2 × area / perimeter, the short side of a long building), floors from
     building:levels or height / 3.2 m where they are tagged, and the share tagged. Only buildings and junctions in
     the inner 80% of the patch count, so streets cut by the patch's edge are not dead ends.
   Nothing is filled in: where the data has no floors the file says how few were tagged. */
'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('./cities/config.js');
const RAW = path.join(__dirname, 'cities', 'raw');
const OUT = path.join(__dirname, '..', 'iron-canopy', 'js', 'city-samples.js');
const PRINT = process.argv.includes('--print');
const MVT = require('./cities/mvt.js');

const STREET = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);

/* a patch's bounding box: km a side round lat, lon */
function bbox(lat, lon, km) {
  const dLat = km / 2 / 110.574, dLon = km / 2 / (111.320 * Math.cos(lat * Math.PI / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}
/* the point km along a compass heading from lat, lon */
function along(lat, lon, km, hdg) {
  const a = hdg * Math.PI / 180;
  return [lat + km * Math.cos(a) / 110.574, lon + km * Math.sin(a) / (111.320 * Math.cos(lat * Math.PI / 180))];
}
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPatch(key, bb) {
  const file = path.join(RAW, key + '.osm');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (PRINT) return null;
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bb.map(v => v.toFixed(6)).join(',')}`;
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IronCanopy-city-sample/1.0 (a game; one request per patch, run by hand)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      fs.mkdirSync(RAW, { recursive: true }); fs.writeFileSync(file, t);
      await sleep(1000);
      return t;
    } catch (e) { console.error(key, e.message, '(retrying)'); await sleep(2000 * (k + 1)); }
  }
  throw new Error('could not fetch ' + key);
}

/* the OSM XML's nodes and ways (tags only on ways; nodes as lat, lon) */
function parse(xml) {
  const nodes = new Map(), ways = [];
  const reN = /<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g;
  let m;
  while ((m = reN.exec(xml))) nodes.set(m[1], [+m[2], +m[3]]);
  const reW = /<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g;
  while ((m = reW.exec(xml))) {
    const body = m[2], nd = [], tags = {};
    for (const q of body.matchAll(/<nd ref="(\d+)"\/>/g)) nd.push(q[1]);
    for (const q of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) tags[q[1]] = q[2];
    ways.push({ id: m[1], nd, tags });
  }
  return { nodes, ways };
}
const q = (arr, p) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const r1 = v => v == null ? null : Math.round(v * 10) / 10, r2 = v => v == null ? null : Math.round(v * 100) / 100, r3 = v => v == null ? null : Math.round(v * 1000) / 1000;

function measure(xml, lat0, lon0, km) {
  const { nodes, ways } = parse(xml);
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const P = id => { const n = nodes.get(id); return n ? [(n[1] - lon0) * kx, (lat0 - n[0]) * ky] : null; };   // metres, x east, y south
  const half = km * 500, inner = half * 0.8, inIn = p => Math.abs(p[0]) < inner && Math.abs(p[1]) < inner, inAll = p => Math.abs(p[0]) < half && Math.abs(p[1]) < half;
  const innerKm2 = (inner * 2 / 1000) ** 2, innerHa = innerKm2 * 100;
  /* streets */
  const deg = new Map(), segs = [];
  for (const w of ways) {
    if (!STREET.has(w.tags.highway) || w.tags.area === 'yes') continue;
    const pts = w.nd.map(P);
    for (let i = 0; i < w.nd.length; i++) {
      if (!pts[i]) continue;
      const d = (i > 0 && pts[i - 1] ? 1 : 0) + (i < w.nd.length - 1 && pts[i + 1] ? 1 : 0);
      deg.set(w.nd[i], (deg.get(w.nd[i]) || 0) + d);
      if (i > 0 && pts[i - 1]) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    }
  }
  // junctions (degree 3 or more) and dead ends, the junctions within 12 m merged
  const J = [], dead = [];
  for (const [id, d] of deg) { const p = P(id); if (!p || !inIn(p)) continue; if (d >= 3) J.push({ p, d }); else if (d === 1) dead.push(p); }
  const merged = [];
  for (const j of J) {
    const near = merged.find(m => Math.hypot(m.p[0] - j.p[0], m.p[1] - j.p[1]) < 12);
    if (near) { near.d = Math.max(near.d, j.d) + 1; near.n++; } else merged.push({ p: j.p, d: j.d, n: 1 });
  }
  // a merged pair of three-way crossings of a dual carriageway is a four-way junction
  const n3 = merged.filter(m => m.n === 1 && m.d === 3).length, nJ = merged.length;
  // dead ends: only those not the end of a street that runs on out of the data (none inside the inner box do)
  let len = 0; const bins = new Array(18).fill(0);
  let C2 = 0, S2 = 0;
  for (const s of segs) {
    const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2; if (!inAll([mx, my])) continue;
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (L < 0.5) continue;
    len += L;
    let a = Math.atan2(-(s[3] - s[1]), s[2] - s[0]); a = ((a % Math.PI) + Math.PI) % Math.PI;   // 0..π, from east, anticlockwise
    bins[Math.min(17, Math.floor(a / (Math.PI / 18)))] += L;
    C2 += L * Math.cos(2 * a); S2 += L * Math.sin(2 * a);
  }
  const tot = bins.reduce((a, b) => a + b, 0) || 1;
  let H = 0; for (const b of bins) if (b > 0) { const p = b / tot; H -= p * Math.log(p); }
  const Hg = Math.log(2), Hm = Math.log(18), phi = 1 - ((H - Hg) / (Hm - Hg)) ** 2;
  const a0 = 0.5 * Math.atan2(S2, C2);   // the dominant direction (radians from east, anticlockwise)
  // street spacing: lines across the patch at right angles to a family, counting the streets of that family they cross
  const spacing = fam => {
    const ax = fam ? a0 + Math.PI / 2 : a0, dx = Math.cos(ax), dy = -Math.sin(ax), nx = -dy, ny = dx;   // streets run along (dx, dy)
    let cross = 0, run = 0;
    for (let k = -8; k <= 8; k++) {
      const o = k / 8 * inner * 0.9, x0 = dx * o - nx * inner, y0 = dy * o - ny * inner, x1 = dx * o + nx * inner, y1 = dy * o + ny * inner;
      run += inner * 2;
      for (const s of segs) {
        const sx = s[2] - s[0], sy = s[3] - s[1], L = Math.hypot(sx, sy); if (L < 0.5) continue;
        if (Math.abs((sx * dx + sy * dy) / L) < 0.7071) continue;            // not of this family
        const den = (x1 - x0) * sy - (y1 - y0) * sx; if (Math.abs(den) < 1e-9) continue;
        const t = ((s[0] - x0) * sy - (s[1] - y0) * sx) / den, u = ((s[0] - x0) * (y1 - y0) - (s[1] - y0) * (x1 - x0)) / den;
        if (t >= 0 && t < 1 && u >= 0 && u < 1) cross++;
      }
    }
    return cross ? run / cross : null;
  };
  const sp = [spacing(0), spacing(1)].sort((a, b) => (a || 1e9) - (b || 1e9));
  /* buildings */
  const areas = [], depth = [], lv = [], lvA = [];
  let cov = 0, nB = 0, tagged = 0, flA = 0;
  for (const w of ways) {
    const bt = w.tags.building; if (!bt || bt === 'no' || w.nd.length < 4 || w.nd[0] !== w.nd[w.nd.length - 1]) continue;
    const pts = w.nd.map(P); if (pts.some(p => !p)) continue;
    let A = 0, per = 0, cx = 0, cy = 0;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const cr = a[0] * b[1] - b[0] * a[1]; A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    A /= 2; if (Math.abs(A) < 8) continue;
    cx /= 6 * A; cy /= 6 * A; A = Math.abs(A);
    if (!inIn([cx, cy])) continue;
    nB++; cov += A; areas.push(A); depth.push(2 * A / per);
    let f = parseFloat(w.tags['building:levels']);
    if (!(f > 0)) { const h = parseFloat(w.tags.height); if (h > 0) f = Math.max(1, Math.round(h / 3.2)); }
    if (f > 0 && f < 200) { tagged++; lv.push(f); lvA.push(A); flA += A * f; }
  }
  const tagA = lvA.reduce((a, b) => a + b, 0);
  /* the street corridor: from the building line on one side to the building line on the other, measured square to
     each street at the middle of its pieces (main roads and minor streets apart), where both sides are built within 60 m */
  const G = 20, edges = new Map(), gk = (i, j) => i * 100000 + j;
  for (const w of ways) {
    const bt = w.tags.building; if (!bt || bt === 'no' || w.nd.length < 4) continue;
    const pts = w.nd.map(P); if (pts.some(p => !p)) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / G); y <= Math.floor(Math.max(a[1], b[1]) / G); y++) { const k = gk(x, y); let L = edges.get(k); if (!L) edges.set(k, L = []); L.push(a[0], a[1], b[0], b[1]); }
    }
  }
  const ray = (x, y, dx, dy, max) => {
    let best = max;
    for (let s = 0; s <= max; s += G) {
      const cx = Math.floor((x + dx * s) / G), cy = Math.floor((y + dy * s) / G);
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
        const L = edges.get(gk(i, j)); if (!L) continue;
        for (let q = 0; q < L.length; q += 4) {
          const sx = L[q + 2] - L[q], sy = L[q + 3] - L[q + 1], den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) continue;
          const t = ((L[q] - x) * sy - (L[q + 1] - y) * sx) / den, u = ((L[q] - x) * dy - (L[q + 1] - y) * dx) / den;
          if (t > 0.5 && t < best && u >= 0 && u <= 1) best = t;
        }
      }
      if (best < s) break;
    }
    return best < max ? best : null;
  };
  const corr = { main: [], minor: [] }, wTag = { main: [], minor: [] };
  for (const w of ways) {
    const hw = w.tags.highway; if (!STREET.has(hw) || w.tags.area === 'yes' || hw === 'pedestrian') continue;
    const k = /^(primary|secondary|tertiary|trunk)/.test(hw) ? 'main' : /^(residential|unclassified|living_street)$/.test(hw) ? 'minor' : null; if (!k) continue;
    const wd = parseFloat(w.tags.width); if (wd > 2 && wd < 60) wTag[k].push(wd);
    const pts = w.nd.map(P);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; if (!a || !b) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 20) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if (!inIn([mx, my])) continue;
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, l = ray(mx, my, nx, ny, 60), r = ray(mx, my, -nx, -ny, 60);
      if (l != null && r != null) corr[k].push(l + r);
    }
  }
  // floors weighted by footprint (a tower counts for its floor plate, a garden shed for little)
  const wq = p => { if (!lv.length) return null; const o = lv.map((f, i) => [f, lvA[i]]).sort((a, b) => a[0] - b[0]); let acc = 0; for (const [f, a] of o) { acc += a; if (acc >= p * tagA) return f; } return o[o.length - 1][0]; };
  return {
    st: { jkm2: r1(nJ / innerKm2), j3: r2(nJ ? n3 / nJ : 0), dead: r1(dead.length / innerKm2), kmkm2: r1(len / 1000 / ((half * 2 / 1000) ** 2)), H: r3(H), phi: r3(phi), sp: sp.map(r1), a0: r3(a0) },
    bd: { cov: r3(cov / (innerKm2 * 1e6)), ha: r1(nB / innerHa), area: [q(areas, 0.25), q(areas, 0.5), q(areas, 0.75), q(areas, 0.9)].map(v => v == null ? null : Math.round(v)),
      depth: [q(depth, 0.25), q(depth, 0.5), q(depth, 0.75)].map(r1), fl: [wq(0.25), wq(0.5), wq(0.75), wq(0.9), lv.length ? Math.max(...lv) : null], tagged: r2(nB ? tagged / nB : 0),
      far: r2(tagA > 0 ? cov / (innerKm2 * 1e6) * flA / tagA : null) },
    cor: { main: r1(q(corr.main, 0.5)), minor: r1(q(corr.minor, 0.5)), nMain: corr.main.length, nMinor: corr.minor.length, wMain: r1(q(wTag.main, 0.5)), wMinor: r1(q(wTag.minor, 0.5)) }
  };
}


/* ---------- old towns taken whole ----------
   From the OpenStreetMap vector tiles (vector.openstreetmap.org, the Shortbread schema, zoom 14, about 1.5 km a tile):
   the streets as one graph (pieces joined where they meet, chains between junctions), each with its class (2 a main
   street, 1 a street, 0 a pedestrian lane), and the buildings' footprints simplified to 0.6 m, in metres round the
   centre (x east, y south). Courtyards inside a footprint are left out (the footprint is filled). */
async function fetchTile(key, z, x, y) {
  const file = path.join(RAW, `${key}-${z}-${x}-${y}.mvt`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (PRINT) return null;
  const url = `https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IronCanopy-city-sample/1.0 (a game; a few tiles, run by hand)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(RAW, { recursive: true }); fs.writeFileSync(file, b);
      await sleep(300);
      return b;
    } catch (e) { console.error(key, e.message, '(retrying)'); await sleep(2000 * (k + 1)); }
  }
  throw new Error('could not fetch tile ' + url);
}
const CORE_KIND = { primary: 2, secondary: 2, tertiary: 2, trunk: 2, residential: 1, unclassified: 1, living_street: 1, pedestrian: 0 };
function dp(P, eps) {   // Douglas-Peucker on a closed ring (first point repeated at the end)
  if (P.length < 5) return P;
  const keep = new Array(P.length).fill(false); keep[0] = keep[P.length - 1] = true;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const vx = P[b][0] - P[a][0], vy = P[b][1] - P[a][1], L = Math.hypot(vx, vy) || 1e-9;
      const d = L > 1e-6 ? Math.abs((P[i][0] - P[a][0]) * vy - (P[i][1] - P[a][1]) * vx) / L : Math.hypot(P[i][0] - P[a][0], P[i][1] - P[a][1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = true; st.push([a, mi], [mi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
const area2 = R => { let A = 0; for (let i = 1; i < R.length; i++) A += R[i - 1][0] * R[i][1] - R[i][0] * R[i - 1][1]; return A / 2; };
async function measureCore(c) {
  const z = 14, n = 2 ** z, lat0 = c.at[0], lon0 = c.at[1], R = c.r * 1000;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const tx = lon => (lon + 180) / 360 * n, ty = lat => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const lonOf = x => x / n * 360 - 180, latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const bb = bbox(lat0, lon0, (c.r + 0.25) * 2);
  const x0 = Math.floor(tx(bb[0])), x1 = Math.floor(tx(bb[2])), y0 = Math.floor(ty(bb[3])), y1 = Math.floor(ty(bb[1]));
  const segs = [], blds = [];
  for (let X = x0; X <= x1; X++) for (let Y = y0; Y <= y1; Y++) {
    const buf = await fetchTile('core-' + c.key, z, X, Y); if (!buf) continue;
    const L = MVT(buf);
    const toM = (ext, p) => [(lonOf(X + p[0] / ext) - lon0) * kx, (lat0 - latOf(Y + p[1] / ext)) * ky];
    if (L.streets) {
      const ext = L.streets.extent;
      for (const f of L.streets.features) {
        const k = CORE_KIND[f.props.kind]; if (k == null || f.type !== 2 || f.props.tunnel || f.props.rail) continue;
        for (const ring of f.rings) for (let i = 1; i < ring.length; i++) {
          // each tile keeps only its own part of a street (the tiles overlap by a buffer)
          let [ax, ay] = ring[i - 1], [bx, by] = ring[i], t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay; let ok = true;
          for (const [p, q] of [[-dx, ax], [dx, ext - ax], [-dy, ay], [dy, ext - ay]]) { if (p === 0) { if (q < 0) ok = false; continue; } const r = q / p; if (p < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; } else { if (r < t0) ok = false; else if (r < t1) t1 = r; } }
          if (!ok || t1 - t0 < 1e-9) continue;
          segs.push([toM(ext, [ax + dx * t0, ay + dy * t0]), toM(ext, [ax + dx * t1, ay + dy * t1]), k]);
        }
      }
    }
    if (L.buildings) {
      const ext = L.buildings.extent;
      for (const f of L.buildings.features) for (const ring of f.rings) {
        if (ring.length < 4 || area2(ring) <= 0) continue;   // (outer rings run clockwise in tile coordinates, y down: a positive area; holes are left out)
        let cx = 0, cy = 0; for (const p of ring) { cx += p[0]; cy += p[1]; } cx /= ring.length; cy /= ring.length;
        if (cx < 0 || cy < 0 || cx >= ext || cy >= ext) continue;   // (a building on the seam is kept by the tile its middle is in)
        blds.push(ring.map(p => toM(ext, p)));
      }
    }
  }
  /* streets: one graph, chains between junctions and ends */
  const key = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), V = new Map(), adj = new Map();
  const node = p => { const k = key(p); if (!V.has(k)) { V.set(k, p); adj.set(k, []); } return k; };
  const seen = new Set();
  for (const [a, b, k] of segs) {
    if (Math.hypot(a[0], a[1]) > R + 150 && Math.hypot(b[0], b[1]) > R + 150) continue;
    const ka = node(a), kb = node(b); if (ka === kb) continue;
    const ek = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (seen.has(ek)) continue; seen.add(ek);
    adj.get(ka).push([kb, k]); adj.get(kb).push([ka, k]);
  }
  const used = new Set(), chains = [];
  const walk = (s, first) => {
    const pts = [V.get(s)]; let prev = s, cur = first[0], cls = first[1];
    used.add(s < cur ? s + '|' + cur : cur + '|' + s);
    for (;;) {
      pts.push(V.get(cur));
      const nb = adj.get(cur); if (nb.length !== 2) break;
      const nx = nb[0][0] === prev ? nb[1] : nb[0]; if (nx[1] !== cls) break;   // (a change of class is a new street)
      const ek = cur < nx[0] ? cur + '|' + nx[0] : nx[0] + '|' + cur; if (used.has(ek)) break; used.add(ek);
      prev = cur; cur = nx[0];
    }
    return { cls, pts };
  };
  for (const [k, nb] of adj) if (nb.length !== 2) for (const e of nb) { const ek = k < e[0] ? k + '|' + e[0] : e[0] + '|' + k; if (!used.has(ek)) chains.push(walk(k, e)); }
  for (const [k, nb] of adj) for (const e of nb) { const ek = k < e[0] ? k + '|' + e[0] : e[0] + '|' + k; if (!used.has(ek)) chains.push(walk(k, e)); }   // (loops)
  // straight runs thinned to 1 m, and the class kept
  const streets = chains.map(ch => { const P = dp(ch.pts.concat([ch.pts[0]]), 0.5).slice(0, -1); if (P[P.length - 1] !== ch.pts[ch.pts.length - 1]) P.push(ch.pts[ch.pts.length - 1]); return { c: ch.cls, p: P }; })
    .filter(s => s.p.length >= 2);
  /* buildings */
  const B = [];
  for (const ring of blds) {
    let P = dp(ring, 0.8); if (P.length < 4) continue;
    const A = Math.abs(area2(P)); if (A < 25) continue;
    let cx = 0, cy = 0; for (const p of P.slice(0, -1)) { cx += p[0]; cy += p[1]; } cx /= P.length - 1; cy /= P.length - 1;
    if (Math.hypot(cx, cy) > R) continue;
    B.push(P.slice(0, -1));
  }
  // packed as text (IC.unpackCore in cities.js reads it): every number a zigzag varint in a 64-letter alphabet, the
  // letters of the first half ending a number. Streets: class, point count, then the points; buildings: point count,
  // then the points; each point the step from the one before (the first from the centre), metres for streets and
  // half metres for buildings
  const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const num = v => { let z = v < 0 ? -2 * v - 1 : 2 * v, o = ''; while (z >= 32) { o += AB[32 + (z & 31)]; z = Math.floor(z / 32); } return o + AB[z]; };
  const enc = (P, k) => { let o = num(P.length), px = 0, py = 0; for (const p of P) { const x = Math.round(p[0] * k), y = Math.round(p[1] * k); o += num(x - px) + num(y - py); px = x; py = y; } return o; };
  const sm = streets.map(s => num(s.c) + enc(s.p, 1)).join('');
  const bm = B.map(P => enc(P, 2)).join('');
  const cov = B.reduce((a, P) => a + Math.abs(area2(P.concat([P[0]]))), 0) / (Math.PI * R * R);
  console.error(`${c.name}: ${streets.length} streets (${streets.filter(s => s.c === 0).length} lanes on foot), ${B.length} buildings, coverage ${(cov * 100).toFixed(0)}%, ${((sm.length + bm.length) / 1024).toFixed(0)} KB`);
  return { key: c.key, name: c.name, at: c.at, r: c.r, cov: r3(cov), streets: sm, bld: bm };
}

/* the medians of the patches of one form: what the game uses */
function summary(list) {
  const med = f => { const v = list.map(f).filter(x => x != null); return v.length ? q(v, 0.5) : null; };
  return {
    jkm2: r1(med(s => s.st.jkm2)), j3: r2(med(s => s.st.j3)), dead: r1(med(s => s.st.dead)), phi: r2(med(s => s.st.phi)),
    sp: [r1(med(s => s.st.sp[0])), r1(med(s => s.st.sp[1]))], cov: r3(med(s => s.bd.cov)), ha: r1(med(s => s.bd.ha)),
    area: [0, 1, 2, 3].map(i => Math.round(med(s => s.bd.area[i]))), depth: [0, 1, 2].map(i => r1(med(s => s.bd.depth[i]))),
    // floors only from patches where at least a fifth of the buildings say how tall they are
    fl: [0, 1, 2, 3, 4].map(i => { const v = list.filter(s => s.bd.tagged >= 0.2).map(s => s.bd.fl[i]).filter(x => x != null); return v.length ? r1(q(v, 0.5)) : null; }),
    flN: list.filter(s => s.bd.tagged >= 0.2).length,
    // building line to building line across a street, metres (main roads, minor streets), from patches with 20 or more measures
    cor: [r1(med(s => s.cor.nMain >= 20 ? s.cor.main : null)), r1(med(s => s.cor.nMinor >= 20 ? s.cor.minor : null))]
  };
}

(async () => {
  const out = { forms: {}, samples: [], transects: [] }, cores = [];
  for (const c of CFG.cores || []) { const m = await measureCore(c); if (m) cores.push(m); }
  for (const [form, list] of Object.entries(CFG.forms)) {
    const got = [];
    for (const p of list) {
      const key = form + '-' + slug(p.name), xml = await fetchPatch(key, bbox(p.at[0], p.at[1], p.km));
      if (!xml) continue;
      const m = measure(xml, p.at[0], p.at[1], p.km);
      got.push(m); out.samples.push(Object.assign({ form, name: p.name, at: p.at, km: p.km }, m));
    }
    if (got.length) out.forms[form] = summary(got);
  }
  for (const t of CFG.transects) {
    const T = { name: t.name, at: t.at, hdg: t.hdg, km: t.steps.slice(), pts: [] };
    for (const d of t.steps) {
      const [la, lo] = along(t.at[0], t.at[1], d, t.hdg), key = 'tr-' + slug(t.name).split('-')[0] + '-' + String(d).replace('.', 'p');
      const xml = await fetchPatch(key, bbox(la, lo, t.km));
      if (!xml) { T.pts.push(null); continue; }
      const m = measure(xml, la, lo, t.km);
      T.pts.push({ cov: m.bd.cov, fl: m.bd.fl[1], tagged: m.bd.tagged, far: m.bd.far, jkm2: m.st.jkm2, ha: m.bd.ha });
    }
    out.transects.push(T);
  }
  if (PRINT) {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(pad('form', 7) + pad('place', 34) + pad('j/km²', 7) + pad('3-way', 6) + pad('dead', 6) + pad('φ', 6) + pad('spacing m', 13) + pad('cover', 7) + pad('bld/ha', 7) + pad('area m² p50', 12) + pad('depth', 7) + pad('floors p25-p90 (tagged)', 26) + pad('corridor main/minor m', 22) + 'width tag m');
    for (const s of out.samples) console.log(pad(s.form, 7) + pad(s.name, 34) + pad(s.st.jkm2, 7) + pad(s.st.j3, 6) + pad(s.st.dead, 6) + pad(s.st.phi, 6) + pad(s.st.sp.join('×'), 13) + pad(s.bd.cov, 7) + pad(s.bd.ha, 7) + pad(s.bd.area[1], 12) + pad(s.bd.depth[1], 7) + pad(s.bd.fl.slice(0, 4).join(' ') + ' (' + Math.round(s.bd.tagged * 100) + '%)', 26) + pad(s.cor.main + '/' + s.cor.minor + ' (' + s.cor.nMain + '/' + s.cor.nMinor + ')', 22) + (s.cor.wMain || '-') + '/' + (s.cor.wMinor || '-'));
    console.log();
    for (const [f, s] of Object.entries(out.forms)) console.log(pad(f, 7), JSON.stringify(s));
    console.log();
    for (const t of out.transects) console.log(pad(t.name, 36), t.pts.map((p, i) => p ? `${t.km[i]}km cov ${p.cov} fl ${p.fl} (${Math.round(p.tagged * 100)}%)` : '-').join(' | '));
    return;
  }
  const head = `/* Iron Canopy — real urban fabric, measured by tools/city-sample.js from OpenStreetMap (brief 65): do not edit by hand.
   Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Measured ${new Date().toISOString().slice(0, 10)}.
   IC.CITY_SAMPLES.forms[form]: the medians of the patches of one kind of fabric (the block forms of buildings.js):
     jkm2 junctions a km², j3 share of three-way junctions, dead dead ends a km², phi orientation order (Boeing 2019),
     sp street spacing in metres [the closer family, the wider], cov building coverage, ha buildings a hectare,
     area footprint m² [p25, p50, p75, p90], depth building depth m [p25, p50, p75], fl floors weighted by footprint
     [p25, p50, p75, p90, max] from the patches with heights (flN of them), null where too few buildings are tagged.
   .samples: every patch; .transects: coverage and floors from a centre outwards (km), the density gradient. */
(function (IC) {
'use strict';
IC.CITY_SAMPLES = ${JSON.stringify(out)};
})(window.IC = window.IC || {});
`;
  fs.writeFileSync(OUT, head);
  console.log('wrote', OUT, (head.length / 1024).toFixed(1) + ' KB');
  const cHead = `/* Iron Canopy — real old towns, taken whole by tools/city-sample.js from the OpenStreetMap vector tiles (brief 65): do
   not edit by hand. Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).
   IC.CITY_CORES[i] = { key, name, at, r (km), cov (building coverage), streets, bld }: the streets (class 2 a main
   street, 1 a street, 0 a lane on foot) and the buildings' footprints round the centre, x east and y south, packed as
   text (tools/city-sample.js says how; IC.unpackCore in cities.js reads it). */
(function (IC) {
'use strict';
IC.CITY_CORES = ${JSON.stringify(cores)};
})(window.IC = window.IC || {});
`;
  const COUT = OUT.replace('city-samples.js', 'city-cores.js');
  fs.writeFileSync(COUT, cHead);
  console.log('wrote', COUT, (cHead.length / 1024).toFixed(1) + ' KB');
})().catch(e => { console.error(e); process.exit(1); });
