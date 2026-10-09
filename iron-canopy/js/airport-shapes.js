/* Iron Canopy — the shapes of an airport and what may not overlap (brief 39).
   Every part has a shape: a runway or a taxiway is a line with a width, a building or an apron a polygon (a
   rectangle, a circle, or any outline in part.poly, in the part's own frame so a part moves and turns as one). Shapes
   are cut into convex pieces once and tested by separating axes, which also says how deep an overlap goes, so parts
   that only touch are fine.
   IC.aptOverlaps(S, ap) lists, in words, everything on and round an airport that overlaps what it should not: roads
   crossing roads with no junction, bridge or tunnel; roads over runways, taxiways or aprons; buildings on buildings,
   roads, taxiways or runways; car parks over roads; landside items on the airfield; the country's roads, lanes,
   streets and railways running through the airfield. Roads carried under the airfield are in W.tunnels. */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- polygons ---------- */
const area = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j].x - P[i].x) * (P[j].y + P[i].y); return s / 2; };
IC.polyArea = P => Math.abs(area(P));
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const isConvex = P => { let sg = 0; for (let i = 0; i < P.length; i++) { const c = cross(P[i], P[(i + 1) % P.length], P[(i + 2) % P.length]); if (Math.abs(c) < 1e-12) continue; if (sg && Math.sign(c) !== sg) return false; sg = Math.sign(c); } return true; };
IC.polyConvex = isConvex;
/* counter-clockwise, without repeated or collinear points (area() is the signed area, positive counter-clockwise:
   the ears below are the vertices that turn left) */
function clean(P) {
  let Q = P.filter((p, i) => U.dist(p, P[(i + 1) % P.length]) > 1e-6);
  if (area(Q) < 0) Q = Q.slice().reverse();
  for (let k = 0; k < 3 && Q.length > 3; k++) Q = Q.filter((p, i) => Math.abs(cross(Q[(i + Q.length - 1) % Q.length], p, Q[(i + 1) % Q.length])) > 1e-9);
  return Q;
}
/* a concave outline cut into convex pieces: ear clipping, then triangles merged back while the result stays convex
   (Hertel–Mehlhorn), so an L-shaped terminal is two pieces, not a fan of slivers */
function convexPieces(P0) {
  const P = clean(P0);
  if (P.length < 3) return [];
  if (isConvex(P)) return [P];
  const idx = P.map((_, i) => i), tris = [];
  // (a vertex on the ear's edge counts as inside: an L's inner corner lies on the diagonal across it)
  const inTri = (p, a, b, c) => cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12 && U.dist(p, a) > 1e-9 && U.dist(p, b) > 1e-9 && U.dist(p, c) > 1e-9;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = P[i0], b = P[i1], c = P[i2];
      if (cross(a, b, c) <= 0) continue;   // (counter-clockwise: an ear turns left)
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(P[j], a, b, c))) continue;
      tris.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.slice());
  // merge neighbours across a shared diagonal while the result stays convex
  const pieces = tris.map(t => t.slice());
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < pieces.length && !changed; i++) for (let j = i + 1; j < pieces.length && !changed; j++) {
      const A = pieces[i], B = pieces[j];
      for (let a = 0; a < A.length && !changed; a++) {
        const u = A[a], v = A[(a + 1) % A.length], b = B.findIndex((x, k) => x === v && B[(k + 1) % B.length] === u);
        if (b < 0) continue;
        const Av = [], Bu = [];
        for (let k = 0; k < A.length; k++) Av.push(A[(a + 1 + k) % A.length]);
        for (let k = 0; k < B.length; k++) Bu.push(B[(b + 1 + k) % B.length]);
        const merged = Av.concat(Bu.slice(1, -1));
        if (isConvex(merged.map(k => P[k]))) { pieces[i] = merged; pieces.splice(j, 1); changed = true; }
      }
    }
  }
  return pieces.map(t => t.map(k => P[k]));
}
IC.convexPieces = convexPieces;
/* how deep two convex polygons overlap (separating axes): ≤ 0 when they are apart or only touch */
function depth(A, B) {
  let m = Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 1e-9) continue;
    const ax = -(q.y - p.y) / L, ay = (q.x - p.x) / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const r of A) { const d = r.x * ax + r.y * ay; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const r of B) { const d = r.x * ax + r.y * ay; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o < m) m = o;
    if (m <= 0) return m;
  }
  return m;
}
IC.polyDepth = depth;
const bbOf = P => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of P) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } return [x0, y0, x1, y1]; };
const bbHit = (a, b, m) => a[0] - m <= b[2] && b[0] - m <= a[2] && a[1] - m <= b[3] && b[1] - m <= a[3];
/* a shape: convex pieces and a bounding box; lines are pieces too, one quad a segment, widened by r */
IC.shapePoly = function (P) { return { poly: P, pieces: convexPieces(P), bb: bbOf(P) }; };
IC.shapeLine = function (pts, r) {
  const pieces = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = U.dist(a, b); if (L < 1e-6) continue;
    const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, nx = -dy * r, ny = dx * r;
    pieces.push([{ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }]);
  }
  const bb = bbOf(pts); bb[0] -= r; bb[1] -= r; bb[2] += r; bb[3] += r;
  return { line: pts, r, pieces, bb };
};
/* how deep two shapes overlap (the deepest pair of pieces) */
IC.shapeDepth = function (A, B) {
  if (!bbHit(A.bb, B.bb, 0)) return -1;
  let m = -Infinity;
  for (const p of A.pieces) for (const q of B.pieces) { const d = depth(p, q); if (d > m) m = d; }
  return m;
};
/* the nearest distance from a point to a shape (0 inside) */
IC.shapeDist = function (A, p) {
  if (A.line) { let m = Infinity; for (let i = 1; i < A.line.length; i++) m = Math.min(m, U.segDist(p.x, p.y, A.line[i - 1].x, A.line[i - 1].y, A.line[i].x, A.line[i].y)); return Math.max(0, m - A.r); }
  const P = A.poly; let inside = false, m = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if (((P[i].y > p.y) !== (P[j].y > p.y)) && (p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) inside = !inside;
    m = Math.min(m, U.segDist(p.x, p.y, P[i].x, P[i].y, P[j].x, P[j].y));
  }
  return inside ? 0 : m;
};

/* the distance from a point to a polygon's edges (inside or out) */
IC.polyEdgeDist = function (P, p) { let m = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) m = Math.min(m, U.segDist(p.x, p.y, P[i].x, P[i].y, P[j].x, P[j].y)); return m; };
/* a convex polygon moved out by d on every side (each edge pushed out along its normal, corners where they meet) */
IC.polyGrow = function (P, d) {
  const n = P.length, sg = area(P) > 0 ? 1 : -1, L = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], len = U.dist(a, b) || 1, nx = -(b.y - a.y) / len * sg, ny = (b.x - a.x) / len * sg; L.push({ a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } }); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = L[(i + n - 1) % n], B = L[i], r1 = { x: A.b.x - A.a.x, y: A.b.y - A.a.y }, r2 = { x: B.b.x - B.a.x, y: B.b.y - B.a.y }, den = r1.x * r2.y - r1.y * r2.x;
    if (Math.abs(den) < 1e-9) { out.push(B.a); continue; }
    const t = ((B.a.x - A.a.x) * r2.y - (B.a.y - A.a.y) * r2.x) / den;
    out.push({ x: A.a.x + r1.x * t, y: A.a.y + r1.y * t });
  }
  return out;
};

/* ---------- the shape of a part ---------- */
/* the outline of an area part in world space: its own polygon (part.poly, local [x, y] pairs), a circle, or its
   rectangle */
IC.partOutline = function (p) {
  const D = IC.APART[p.kind] || {}, a = p.a || 0, c = Math.cos(a), s = Math.sin(a);
  const W = (lx, ly) => ({ x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c });
  if (p.poly && p.poly.length >= 3) return p.poly.map(q => W(q[0], q[1]));
  const r = p.r || (!p.w && D.r);
  if (r) { const o = []; for (let i = 0; i < 12; i++) o.push({ x: p.x + Math.cos(i / 12 * 6.2832) * r, y: p.y + Math.sin(i / 12 * 6.2832) * r }); return o; }
  const w = (p.w || D.w || 0.3) / 2, h = (p.h || D.h || 0.3) / 2;
  return [W(-w, -h), W(w, -h), W(w, h), W(-w, h)];
};
/* the shape of a part, cached until it moves: runways by their pavement, taxiways as lines */
IC.partShape = function (ap, p) {
  if (p.kind === 'taxi') { const pts = p.nodes ? p.nodes.map(id => ap.nodes[id]).filter(Boolean) : p.pts; const k = pts.map(q => q.x.toFixed(3) + q.y.toFixed(3)).join() + p.w; if (p._shk !== k) { p._shk = k; p._sh = IC.shapeLine(pts, (p.w || IC.APART.taxi.w) / 2); } return p._sh; }
  if (p.kind === 'people') { const k = p.pts.map(q => q.x.toFixed(3) + q.y.toFixed(3)).join(); if (p._shk !== k) { p._shk = k; p._sh = IC.shapeLine(p.pts, (p.w || IC.APART.people.w) / 2); } return p._sh; }
  if (p.kind === 'runway') { const k = [p.a.x, p.a.y, p.b.x, p.b.y, p.w].join(); if (p._shk !== k) { p._shk = k; p._sh = IC.shapeLine([p.a, p.b], (p.w || IC.APART.runway.w) / 2); } return p._sh; }
  const k = [p.x, p.y, p.a, p.w, p.h, p.r, p.poly && p.poly.length].join();
  if (p._shk !== k) { p._shk = k; p._sh = IC.shapePoly(IC.partOutline(p)); }
  return p._sh;
};
/* a part's local polygon from world points: the part's frame is the outline's longest edge, x along it */
IC.polyPart = function (kind, pts, o) {
  const P = clean(pts.map(q => ({ x: q.x, y: q.y })));
  let best = 0, a = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], L = U.dist(p, q); if (L > best) { best = L; a = Math.atan2(q.y - p.y, q.x - p.x); } }
  if (o && o.a != null) a = o.a;
  a = ((a % Math.PI) + Math.PI) % Math.PI; if (a > Math.PI / 2) a -= Math.PI;
  const c = Math.cos(-a), s = Math.sin(-a);
  const L0 = P.map(q => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })), bb = bbOf(L0), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  const ca = Math.cos(a), sa = Math.sin(a);
  return Object.assign({ kind, x: cx * ca - cy * sa, y: cx * sa + cy * ca, a, w: bb[2] - bb[0], h: bb[3] - bb[1], poly: L0.map(q => [+(q.x - cx).toFixed(4), +(q.y - cy).toFixed(4)]) }, o || {}, { a });
};
/* area of a part in hectares-free units (100 m squared) */
IC.partArea = p => p.poly ? IC.polyArea(p.poly.map(q => ({ x: q[0], y: q[1] }))) : (p.w || 0) * (p.h || 0);

/* ---------- roads carried under the airfield ---------- */
/* W.tunnels: { pts: [a, b], w, apt, name } — a road inside one is under the ground, not across the pavement */
IC.inTunnel = function (W, x, y) {
  for (const t of W.tunnels || []) if (U.segDist(x, y, t.a.x, t.a.y, t.b.x, t.b.y) < (t.w || 0.2) / 2 + 0.03) return t;
  return null;
};
/* the stretches of a road above ground: its polyline cut where it runs through a tunnel */
IC.openRuns = function (W, pts) {
  if (!(W.tunnels && W.tunnels.length)) return [pts];
  const bb = bbOf(pts);
  const T = W.tunnels.filter(t => bbHit(bb, bbOf([t.a, t.b]), 0.5));
  if (!T.length) return [pts];
  const inT = p => T.some(t => U.segDist(p.x, p.y, t.a.x, t.a.y, t.b.x, t.b.y) < (t.w || 0.2) / 2 + 0.03);
  const runs = []; let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i) { const q = pts[i - 1], n = Math.max(1, Math.ceil(U.dist(p, q) / 0.05)); for (let k = 1; k < n; k++) { const s = { x: q.x + (p.x - q.x) * k / n, y: q.y + (p.y - q.y) * k / n }; if (inT(s)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(s); } }
    if (inT(p)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p);
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
};

/* ---------- the overlap checker ---------- */
const RWY_STRIP = 1.5, TWY_CLEAR = 0.1;
const CLS_WORD = { hw: 'motorway', rd: 'main road', lc: 'local road', sp: 'access road', ramp: 'slip road', ln: 'farm lane', st: 'street', art: 'avenue', ring: 'ring road' };
const LAND_WORD = { kerb: 'kerb road', loop: 'landside road', drive: 'driveway', out: 'road out', ramp: 'ramp', upper: 'departures road', lower: 'arrivals road' };
/* everything on and near an airport, as shapes with a category:
   rwy, twy, apron (pavement), bld (airside building), land (landside building), park (car park and the like),
   road (lv: 0 on the ground, 1 on a bridge or upper deck, -1 in a tunnel), rail */
IC.aptElementOf = function (ap, p, o) {
  if (p.kind === 'ils') return null;
  const sh = IC.partShape(ap, p), name = IC.partName(ap, p);
  if (p.kind === 'runway') return { cat: 'rwy', p, sh, strip: IC.shapeLine([p.a, p.b], RWY_STRIP), name };
  if (p.kind === 'taxi') return { cat: 'twy', p, sh, name: p.name ? `taxiway ${p.name}` : 'a taxiway', lv: p.lv || 0 };
  if (p.kind === 'apron' || (IC.APART[p.kind] && IC.APART[p.kind].pad) || p.kind === 'alert' || p.kind === 'holdbay') return { cat: 'apron', p, sh, name };
  if (p.kind === 'surface') return IC.SURF[p.surf] && IC.SURF[p.surf].park && !(o && o.noSurface) ? { cat: 'park', p, sh, name: 'the car park', surf: true } : null;
  if (p.kind === 'people') return { cat: 'mover', p, sh: IC.shapeLine(p.pts || [], 0.04), name: p.name || 'the people mover', lv: p.lv != null ? p.lv : 1 };
  if (p.kind === 'skybridge') return { cat: 'span', p, sh, name: p.name || 'the passenger bridge', lv: 1, clear: p.clear || 0 };
  return { cat: 'bld', p, sh, name };
};
IC.aptElements = function (S, ap, o) {
  o = o || {};
  const out = [], W = S && S.world;
  const name = p => IC.partName(ap, p);
  for (const p of ap.parts) { const e = IC.aptElementOf(ap, p, o); if (e) out.push(e); }
  const L = ap.land;
  if (L) {
    for (const it of L.items) {
      const sh = IC.shapePoly(IC.partOutline(it)), nm = it.name || `the ${U.lc(IC.LAND[it.kind] ? IC.LAND[it.kind].name : it.kind)}`;
      out.push({ cat: it.kind === 'park' || it.kind === 'taxi' || it.kind === 'stop' ? 'park' : 'land', it, sh, name: nm, own: true });
    }
    for (const r of L.roads) out.push({ cat: 'road', r, sh: IC.shapeLine(r.pts, (r.w || 0.1) / 2), name: `the ${LAND_WORD[r.kind] || (r.kerb ? 'kerb road' : r.out ? 'road out' : 'driveway')}${r.by && ap.parts.find(q => q.id === r.by) ? ' at ' + name(ap.parts.find(q => q.id === r.by)) : ''}`, own: true, lv: r.lv || 0, land: r });
  }
  // the country round it: roads, slip roads, lanes, streets and railways within 3 km of anything here
  if (W && !o.noWorld) {
    let bb = null;
    for (const e of out) bb = bb ? [Math.min(bb[0], e.sh.bb[0]), Math.min(bb[1], e.sh.bb[1]), Math.max(bb[2], e.sh.bb[2]), Math.max(bb[3], e.sh.bb[3])] : e.sh.bb.slice();
    if (bb) {
      bb = [bb[0] - 30, bb[1] - 30, bb[2] + 30, bb[3] + 30];
      const lbb = l => l.bb || (l.bb = bbOf(l.pts));
      const add = (l, cat, word, extra) => {
        if (!l.pts || l.pts.length < 2 || !bbHit(lbb(l), bb, 0)) return;
        for (const run of IC.openRuns(W, l.pts)) out.push(Object.assign({ cat, l, sh: IC.shapeLine(run, (IC.ROAD_W[l.cls] || 0.1) / 2), name: word, world: true, lv: 0 }, extra || {}));
      };
      const place = l => { const m = l.pts[l.pts.length >> 1]; return S.infra ? IC.nearPlace(S, m.x, m.y) : ''; };
      for (const e of W.edges || []) add(e, 'road', `the ${CLS_WORD[e.cls] || 'road'} ${place(e)}`, { edge: e, ownRoad: e.a === ap.id || e.b === ap.id || e.apt === ap.id });
      for (const r of W.ramps || []) add(r, 'road', `a slip road ${place(r)}`, { ramp: true });
      for (const l of W.lanes || []) add(l, 'road', `a farm lane ${place(l)}`, { lane: true });
      for (const c of (W.cities || []).concat(W.villages || [])) if (c.streets && U.dxy(c.x, c.y, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2) < (c.r || 20) * 2 + (bb[2] - bb[0])) for (const l of c.streets) add(l, 'road', `a street of ${c.name}`, { street: c });
      for (const r of W.rails || []) add(Object.assign(r, { cls: r.cls || 'rail' }), 'rail', `the railway ${place(r)}`);
    }
  }
  return out;
};
/* where two roads cross: a point on both centrelines that is not an end of either (ends meeting are junctions) */
function crossing(A, B) {
  const a = A.line, b = B.line;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const t = U.segX(a[i - 1].x, a[i - 1].y, a[i].x, a[i].y, b[j - 1].x, b[j - 1].y, b[j].x, b[j].y);
    if (t < 0) continue;
    const p = { x: a[i - 1].x + (a[i].x - a[i - 1].x) * t, y: a[i - 1].y + (a[i].y - a[i - 1].y) * t };
    const endA = U.dist(p, a[0]) < 0.06 || U.dist(p, a[a.length - 1]) < 0.06, endB = U.dist(p, b[0]) < 0.06 || U.dist(p, b[b.length - 1]) < 0.06;
    if (endA || endB) continue;
    return p;
  }
  return null;
}
/* the point where two shapes meet, for the message and the map */
function meetAt(A, B) {
  let best = null, bd = Infinity;
  const pts = (A.line || A.poly || []).concat(B.line || B.poly || []);
  const S2 = A.line ? B : A;
  for (const p of pts) { const d = IC.shapeDist(S2 === A ? B : A, p); if (d < bd) { bd = d; best = p; } }
  return best || pts[0];
}
/* The words the map puts on an airport at zoom z (brief 45): what each building is (at the middle zoom, the most
   important first, none overlapping another: one that would is left out), and each building site's progress, small,
   on the site, only close enough to see the site, gone when it is built. Each label keeps the thing it names (of)
   and its box in world units; the renderer draws them, the tests check none hangs loose. */
const BLD_TAG = { terminal: 'TERMINAL', cargo: 'CARGO', hangar: 'HANGAR', fuel: 'FUEL FARM', hydrant: 'HYDRANT', fuelpad: 'FUEL STAND', deice: 'DE-ICING', helipad: 'HELIPAD', gaterm: 'GA TERMINAL', tower: 'TOWER', fire: 'FIRE', atc: 'APPROACH RADAR', gradar: 'GROUND RADAR', has: 'SHELTER', ammo: 'MUNITIONS' };
const LBL_RANK = { terminal: 0, cargo: 1, hangar: 2, tower: 3, fire: 4, fuel: 5, deice: 6, fuelpad: 7, atc: 8, gradar: 9, hydrant: 10, has: 11, ammo: 12, support: 13, gaterm: 6, helipad: 9 };
IC.BLD_TAG = BLD_TAG;
IC.aptLabels = function (S, ap, z, o) {
  o = o || {};
  const px = 1 / z, out = [], boxes = [];
  const fits = (x, y, w, h) => { const b = [x - w / 2, y - h, x + w / 2, y + h * 0.3]; if (boxes.some(q => q[0] < b[2] && b[0] < q[2] && q[1] < b[3] && b[1] < q[3])) return false; boxes.push(b); return true; };
  const put = (txt, x, y, size, of, kind) => { const w = txt.length * size * 0.62 * px + 2 * px, h = size * px; if (!fits(x, y, w, h)) return false; out.push({ txt, x, y, size, of, kind, box: boxes[boxes.length - 1] }); return true; };
  // building sites: on the part itself, only when it is big enough on screen to see (more than 20 px)
  if (z > 1.5) for (const w of ap.works || []) {
    if (!w.stages || !w.part || w.part.built) continue;
    const p = w.part, size = p.kind === 'runway' ? IC.rwLen(p) : p.kind === 'taxi' ? IC.partMeasure(ap, p) : Math.max(p.w || 0, p.h || 0, (p.r || 0) * 2);
    if (size * z < 20) continue;
    const c = p.kind === 'runway' ? IC.rwAt(p, 0.5) : p.kind === 'taxi' ? (() => { const a = ap.nodes[p.nodes[p.nodes.length >> 1]], b = ap.nodes[p.nodes[Math.max(0, (p.nodes.length >> 1) - 1)]]; return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a; })() : p;
    if (!c || c.x == null) continue;
    const q = w.wait === 'queued: every crew is busy';
    put(q ? 'QUEUED' : w.wait ? 'WAITING: ' + w.wait.replace(/^waiting for /, '').split(':')[0].toUpperCase() : `BUILDING ${U.pct(w.prog || 0)}`, c.x, c.y, 7, p, q || w.wait ? 'wait' : 'work');
  }
  // what each building is, at the middle zoom; one label for a fuel farm
  if (z > 9 && z < 90 && !o.noNames) {
    const done = [], list = ap.parts.filter(p => p.built && p.x != null && (p.name || BLD_TAG[p.kind])).sort((a, b) => (LBL_RANK[a.kind] != null ? LBL_RANK[a.kind] : 20) - (LBL_RANK[b.kind] != null ? LBL_RANK[b.kind] : 20) || (IC.partArea ? IC.partArea(b) - IC.partArea(a) : 0));
    for (const p of list) {
      const t = p.name ? p.name.replace(/^the /i, '').toUpperCase() : BLD_TAG[p.kind];
      if (done.some(q => q.t === t && U.dist(q, p) < (p.kind === 'fuel' ? 6 : 2))) continue;
      const hh = Math.max(p.h || 0, (p.r || 0) * 2, p.poly ? Math.max(p.w || 0, p.h || 0) * 0.5 : 0) / 2;
      // (a big building has its name on it, a small one just above it)
      const on = (p.w || 0) * z > t.length * 7.5 * 0.7 && (p.h || 0) * z > 14, y = on ? p.y + 3 * px : p.y - hh - 5 * px;
      if (put(t, p.x, y, 7.5, p, 'name')) done.push({ t, x: p.x, y: p.y });
    }
  }
  return out;
};

/* Everything on an airport that should be attached to something and is not (brief 45), in words: a gate whose jet
   bridge does not start at a terminal wall or does not reach the door, a passenger bridge over a taxiway that does
   not join two buildings, a people mover without a station at each end, a kerb road away from its building, a
   service road that ends in the grass. The tests assert none on every preset and blueprint. */
IC.aptUnattached = function (S, ap) {
  const out = [], name = p => p.name || (IC.APART[p.kind] || {}).name || p.kind;
  const wallDist = (t, x, y) => { const P = IC.partOutline(t); let m = 1e9; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length]; m = Math.min(m, U.segDist(x, y, A.x, A.y, B.x, B.y)); } return m; };
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
    const sn = IC.standName(s);
    if (s.contact && !s.bridge) { out.push({ what: 'stand', s, text: `Gate ${sn} has no jet bridge.` }); continue; }
    if (!s.bridge) continue;
    const B = s.bridge, t = ap.parts.find(q => q.id === B.term);
    if (!t || !t.built || wallDist(t, B.wx, B.wy) > 0.01) out.push({ what: 'bridge', s, text: `The jet bridge at gate ${sn} starts off the terminal wall.` });
    else if (U.dxy(B.rx, B.ry, B.dx, B.dy) > IC.BRIDGE_REACH.tunnel + 1e-6 || U.dxy(B.wx, B.wy, B.rx, B.ry) > IC.BRIDGE_REACH.link + 0.05) out.push({ what: 'bridge', s, text: `The jet bridge at gate ${sn} does not reach the door.` });
  }
  for (const p of ap.parts) {
    if (!p.built) continue;
    if (p.kind === 'skybridge' && (p.joins || []).filter(id => { const q = ap.parts.find(x => x.id === id); return q && q.built; }).length < 2) out.push({ what: 'skybridge', p, text: `${name(p)} does not join two buildings.` });
    if (p.kind === 'people' && (p.stops || []).length < 2) out.push({ what: 'people', p, text: `${name(p)} has no station at ${(p.stops || []).length ? 'one end' : 'either end'}.` });
  }
  const L = ap.land;
  if (L && L.roads) for (const r of L.roads) if (r.kind === 'kerb' && r.by) {
    const t = ap.parts.find(q => q.id === r.by); if (!t) { out.push({ what: 'kerb', r, text: 'A kerb road serves a building that is gone.' }); continue; }
    const mid = { x: (r.pts[0].x + r.pts[r.pts.length - 1].x) / 2, y: (r.pts[0].y + r.pts[r.pts.length - 1].y) / 2 };
    if (IC.partDist(ap, t, mid) > 0.35) out.push({ what: 'kerb', r, text: `The kerb road of ${name(t)} is ${Math.round(IC.partDist(ap, t, mid) * 100)} m from its front.` });
  }
  if (IC.svcRoadEnds) for (const e of IC.svcRoadEnds(S, ap)) if (!e.ok) out.push({ what: 'service', e, text: `A service road ends in the grass at ${Math.round((e.x - ap.x) * 100)} m, ${Math.round((e.y - ap.y) * 100)} m from the middle of the airport.` });
  return out;
};

/* rules: which pairs of categories may not overlap, how deep before it counts, and the words */
const HIT = 0.015;
IC.aptOverlaps = function (S, ap, o) {
  o = o || {};
  const E = o.els || IC.aptElements(S, ap, o), out = [], seen = new Set();
  const say = (kind, A, B, text, at) => {
    const k = kind + '|' + A.name + '|' + B.name; if (seen.has(k)) return;
    seen.add(k); out.push({ kind, a: A.name, b: B.name, x: at ? at.x : 0, y: at ? at.y : 0, text, A, B });
  };
  const deep = (A, B, m) => IC.shapeDepth(A.sh, B.sh) > (m == null ? HIT : m);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const air = E.filter(e => e.cat === 'rwy' || e.cat === 'twy' || e.cat === 'apron' || e.cat === 'bld');
  const roads = E.filter(e => e.cat === 'road'), rails = E.filter(e => e.cat === 'rail');
  const bld = E.filter(e => e.cat === 'bld' || e.cat === 'land'), parks = E.filter(e => e.cat === 'park');
  const lands = E.filter(e => e.cat === 'land' || e.cat === 'park');
  const only = o.only;   // check only pairs with this element (the builder's planned part)
  const pair = (A, B) => !only || A === only || B === only || A.p === only || B.p === only;
  // roads crossing roads with no junction, bridge or tunnel: the airport's own roads, and anything inside the airfield
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const A = roads[i], B = roads[j];
    if (!pair(A, B) || (A.lv || 0) !== (B.lv || 0) || !(A.own || B.own) || !bbHit(A.sh.bb, B.sh.bb, 0)) continue;
    if (A.edge && B.edge) continue;
    const p = crossing(A.sh, B.sh);
    if (p && !(ap.land && (ap.land.jn || []).some(q => U.dist(q, p) < 0.08))) say('road', A, B, `${cap(A.name)} crosses ${B.name} with no junction, bridge or tunnel.`, p);
  }
  // roads and railways over the airfield: runway strips (150 m either side of the centreline), taxiways, aprons
  for (const A of roads.concat(rails)) for (const B of air) {
    if (!pair(A, B) || !bbHit(A.sh.bb, (B.strip || B.sh).bb, 0.2)) continue;
    const lv = A.lv || 0, what = A.cat === 'rail' ? 'railway' : 'road';
    // (a road of the layout that runs wholly outside the fence, as a public road passes an airfield, may run beside the
    // strip: only the pavement and 30 m round it are barred)
    if (B.cat === 'rwy') { const strip = A.land && A.land.out ? IC.shapeLine([B.p.a, B.p.b], (B.p.w || IC.APART.runway.w) / 2 + 0.3) : B.strip; if (lv >= 0 && IC.shapeDepth(A.sh, strip) > HIT) say(A.world ? 'world' : 'field', A, B, `${cap(A.name)} crosses ${B.name} with no tunnel${A.world ? ': a ' + what + ' may not run through the airfield' : ''}.`, meetAt(A.sh, strip)); }
    else if (B.cat === 'twy') { if (lv === 0 && (B.lv || 0) === 0 && IC.shapeDepth(A.sh, IC.shapeLine(B.sh.line, B.sh.r + TWY_CLEAR)) > HIT) say(A.world ? 'world' : 'field', A, B, `${cap(A.name)} crosses ${B.name} with no tunnel or bridge.`, meetAt(A.sh, B.sh)); }
    else if (B.cat === 'apron') { if (lv === 0 && deep(A, B)) say(A.world ? 'world' : 'field', A, B, `${cap(A.name)} runs across ${B.name}.`, meetAt(A.sh, B.sh)); }
    else if (lv === 0 && deep(A, B, 0.02) && !(A.land && A.land.by === B.p.id && A.land.kerb)) say(A.world ? 'world' : 'building', A, B, `${cap(B.name)} stands on ${A.name}.`, meetAt(A.sh, B.sh));
  }
  // buildings on buildings, on roads, on taxiways and runways
  for (let i = 0; i < bld.length; i++) {
    const A = bld[i];
    for (let j = i + 1; j < bld.length; j++) { const B = bld[j]; if (pair(A, B) && deep(A, B, 0.02)) say('building', A, B, `${cap(A.name)} overlaps ${B.name}.`, meetAt(A.sh, B.sh)); }
    if (A.cat !== 'land') continue;
    for (const B of roads) if (pair(A, B) && (B.lv || 0) === 0 && deep(A, B, 0.02) && !(B.land && B.land.to === A.it)) say('building', A, B, `${cap(A.name)} stands on ${B.name}.`, meetAt(A.sh, B.sh));
  }
  for (const A of bld) if (A.cat === 'bld') for (const B of air) if ((B.cat === 'rwy' || B.cat === 'twy') && pair(A, B) && (B.lv || 0) === 0 && deep(A, B, 0.02)) say('building', A, B, `${cap(A.name)} stands on ${B.name}.`, meetAt(A.sh, B.sh));
  // car parks over roads (their own driveway stops at the edge)
  for (const A of parks) for (const B of roads) if (pair(A, B) && (B.lv || 0) === 0 && deep(A, B, 0.02) && !(B.land && B.land.to === A.it)) say('park', A, B, `${cap(A.name)} lies across ${B.name}.`, meetAt(A.sh, B.sh));
  for (let i = 0; i < parks.length; i++) for (let j = i + 1; j < parks.length; j++) { const A = parks[i], B = parks[j]; if (pair(A, B) && deep(A, B, 0.02)) say('park', A, B, `${cap(A.name)} overlaps ${B.name}.`, meetAt(A.sh, B.sh)); }
  for (const A of parks) for (const B of bld) if (pair(A, B) && deep(A, B, 0.02)) say('park', A, B, `${cap(A.name)} overlaps ${B.name}.`, meetAt(A.sh, B.sh));
  // passenger bridges span taxiways, never a runway strip, and stand clear of other buildings (their ends meet the
  // buildings they join); people movers ride over or under everything but a runway strip, which they pass under
  const spans = E.filter(e => e.cat === 'span'), movers = E.filter(e => e.cat === 'mover');
  for (const A of spans) for (const B of air) {
    if (!pair(A, B)) continue;
    if (B.cat === 'rwy' && IC.shapeDepth(A.sh, B.strip) > HIT) say('span', A, B, `${cap(A.name)} crosses ${B.name}'s strip: a bridge may span a taxiway, not a runway.`, meetAt(A.sh, B.strip));
    else if (B.cat === 'bld' && !(A.p.joins || []).includes(B.p.id) && deep(A, B, 0.02)) say('span', A, B, `${cap(A.name)} runs into ${B.name}.`, meetAt(A.sh, B.sh));
  }
  for (const A of movers) for (const B of air) if (pair(A, B) && B.cat === 'rwy' && (A.lv || 0) >= 0 && IC.shapeDepth(A.sh, B.strip) > HIT) say('mover', A, B, `${cap(A.name)} crosses ${B.name} above ground: it must pass under the runway in a tunnel.`, meetAt(A.sh, B.strip));
  for (const A of movers) for (const B of air) if (pair(A, B) && B.cat === 'twy' && (A.lv || 0) === 0 && (B.lv || 0) === 0 && deep(A, B)) say('mover', A, B, `${cap(A.name)} crosses ${B.name} at grade: it needs a viaduct or a tunnel.`, meetAt(A.sh, B.sh));
  // the country's roads and railways inside the fence (not in a tunnel): the airport's own road stops at its gate
  const F = !only && IC.aptFence ? IC.aptFence(ap) : null;
  if (F) for (const A of roads.concat(rails)) {
    if (!A.world || A.ownRoad || (A.lv || 0) !== 0 || !bbHit(A.sh.bb, IC.shapePoly(F.poly).bb, 0)) continue;
    const L = A.sh.line;
    let at = null;
    for (let i = 1; i < L.length && !at; i++) { const n = Math.max(1, Math.ceil(U.dist(L[i - 1], L[i]) / 0.2)); for (let k = 0; k <= n && !at; k++) { const q = { x: L[i - 1].x + (L[i].x - L[i - 1].x) * k / n, y: L[i - 1].y + (L[i].y - L[i - 1].y) * k / n }; if (U.inPoly(q.x, q.y, F.hullA) && !F.carveA.some(c => U.inPoly(q.x, q.y, c))) at = q; } }
    if (at) say('fence', A, { name: `the fence of ${ap.name}` }, `${cap(A.name)} runs through the fence of ${ap.name}: roads and railways pass round the airfield or under it.`, at);
  }
  // landside items on the airfield: in a runway strip, on a taxiway or apron, or on an airside building
  for (const A of lands) for (const B of air) {
    if (!A.own || !pair(A, B)) continue;
    const S2 = B.cat === 'rwy' ? B.strip : B.cat === 'twy' ? IC.shapeLine(B.sh.line, B.sh.r + TWY_CLEAR) : B.sh;
    if (IC.shapeDepth(A.sh, S2) > HIT) say('land', A, B, `${cap(A.name)} stands on the airfield (${B.name}).`, meetAt(A.sh, S2));
  }
  return out;
};
/* ---------- a way round the airfield ---------- */
/* the ground roads may not take: runway strips, taxiways and their verges, aprons, buildings, landside items, railways
   (m: extra room), and optionally the land kept for a building's landside (o.envelopes) */
IC.aptKeepOut = function (S, ap, o) {
  o = o || {};
  const E = o.els || IC.aptElements(S, ap, { noWorld: true }), out = [], m = o.m != null ? o.m : 0.08;
  for (const e of E) {
    if (o.skip && o.skip(e)) continue;
    if (e.cat === 'rwy') out.push({ sh: e.strip, pad: m });
    else if (e.cat === 'twy') { if (!(e.lv > 0)) out.push({ sh: e.sh, pad: TWY_CLEAR + m }); }
    else if (e.cat === 'apron' || e.cat === 'bld' || e.cat === 'land' || e.cat === 'park') out.push({ sh: e.sh, pad: m });
  }
  for (const env of o.envelopes || []) out.push({ sh: env, pad: m });
  return out;
};
/* A* on a grid of cells c units across, inside box [x0, y0, x1, y1], from a point to the nearest goal cell
   (goal(x, y) → true), round the blocked shapes; the path is pulled straight where the way is clear */
/* the blocked shapes as a grid of cells c units across inside box: bad[k] = 1 where a cell's centre is within a
   block's pad (a line one segment at a time, so a long diagonal runway strip does not scan its whole box) */
IC.shapeRaster = function (box, c, blocks) {
  const nx = Math.max(2, Math.ceil((box[2] - box[0]) / c)), ny = Math.max(2, Math.ceil((box[3] - box[1]) / c)), N = nx * ny;
  if (N > 4e6) return null;
  const bad = new Uint8Array(N);
  const X = i => box[0] + (i + 0.5) * c, Y = j => box[1] + (j + 0.5) * c;
  const mark = (bb, pad, test) => {
    const i0 = Math.max(0, Math.floor((bb[0] - pad - box[0]) / c)), i1 = Math.min(nx - 1, Math.floor((bb[2] + pad - box[0]) / c));
    const j0 = Math.max(0, Math.floor((bb[1] - pad - box[1]) / c)), j1 = Math.min(ny - 1, Math.floor((bb[3] + pad - box[1]) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!bad[j * nx + i] && test(X(i), Y(j))) bad[j * nx + i] = 1;
  };
  for (const b of blocks) {
    const pad = b.pad + c * 0.71, lim = b.pad + c * 0.5;
    if (b.sh.bb[2] < box[0] - pad || b.sh.bb[0] > box[2] + pad || b.sh.bb[3] < box[1] - pad || b.sh.bb[1] > box[3] + pad) continue;
    if (b.sh.line) { const L = b.sh.line, r = b.sh.r; for (let k = 1; k < L.length; k++) { const a = L[k - 1], q = L[k]; mark([Math.min(a.x, q.x) - r, Math.min(a.y, q.y) - r, Math.max(a.x, q.x) + r, Math.max(a.y, q.y) + r], pad, (x, y) => U.segDist(x, y, a.x, a.y, q.x, q.y) - r < lim); } continue; }
    if (b.inside) { mark(b.sh.bb, 0, (x, y) => U.inPoly(x, y, b.inside) && !(b.carve && b.carve.some(cv => U.inPoly(x, y, cv)))); continue; }
    mark(b.sh.bb, pad, (x, y) => IC.shapeDist(b.sh, { x, y }) < lim && !(b.carve && b.carve.some(cv => U.inPoly(x, y, cv))));
  }
  const cellOf = p => { const i = Math.floor((p.x - box[0]) / c), j = Math.floor((p.y - box[1]) / c); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  return { nx, ny, N, bad, X, Y, cellOf, at: p => { const k = cellOf(p); return k >= 0 && bad[k] === 1; } };
};
IC.gridRoute = function (box, c, blocks, from, goal, o) {
  o = o || {};
  const R = IC.shapeRaster(box, c, blocks); if (!R) return null;
  const { nx, ny, N, bad, X, Y } = R;
  const cellOf = p => { const i = Math.floor((p.x - box[0]) / c), j = Math.floor((p.y - box[1]) / c); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const s0 = cellOf(from); if (s0 < 0) return null;
  // (the start may sit at the edge of what it serves: free a few cells round it)
  if (bad[s0]) { const i = s0 % nx, j = (s0 / nx) | 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const q = (j + dj) * nx + i + di; if (i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < ny) bad[q] = 0; } }
  const g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const H = [], push = (k, f) => { H.push([f, k]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= f) break; [H[i], H[p]] = [H[p], H[i]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { let k = 2 * i + 1; if (k >= H.length) break; if (k + 1 < H.length && H[k + 1][0] < H[k][0]) k++; if (H[k][0] >= H[i][0]) break; [H[i], H[k]] = [H[k], H[i]]; i = k; } } return top; };
  const hx = o.to ? k => U.dxy(X(k % nx), Y((k / nx) | 0), o.to.x, o.to.y) : () => 0;
  g[s0] = 0; push(s0, hx(s0));
  let end = -1, n = 0;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  while (H.length && n++ < N * 2) {
    const [, k] = pop(); if (done[k]) continue; done[k] = 1;
    const i = k % nx, j = (k / nx) | 0;
    if (goal(X(i), Y(j), k)) { end = k; break; }
    for (const [di, dj, w] of D) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii; if (bad[q] || done[q]) continue;
      const ng = g[k] + w * c; if (ng < g[q]) { g[q] = ng; prev[q] = k; push(q, ng + hx(q)); }
    }
  }
  if (end < 0) return null;
  const cells = []; for (let k = end; k >= 0; k = prev[k]) cells.push(k); cells.reverse();
  const P = cells.map(k => ({ x: X(k % nx), y: Y((k / nx) | 0) }));
  P[0] = { x: from.x, y: from.y };
  if (o.snapEnd) P[P.length - 1] = o.snapEnd(P[P.length - 1]);
  // pull the path straight: the furthest point in clear sight, again and again
  const clear = (a, b) => { const L = U.dist(a, b), m = Math.max(1, Math.ceil(L / (c * 0.4))); for (let t = 1; t < m; t++) { const q = cellOf({ x: a.x + (b.x - a.x) * t / m, y: a.y + (b.y - a.y) * t / m }); if (q < 0 || bad[q]) return false; } return true; };
  const out = [P[0]];
  for (let i = 0; i < P.length - 1;) { let j = P.length - 1; while (j > i + 1 && !clear(P[i], P[j])) j--; out.push(P[j]); i = j; }
  return out;
};

/* what a planned part would overlap, before it is committed: buildings on roads, car parks or the landside, pavement
   on the landside. (Pavement over the country's roads is fine: they are carried under it in a tunnel and charged for,
   IC.bldClearance; the airport's own road is moved round to its gate, IC.aptReseat.) The elements round the airport
   are kept until the airport or its landside changes, so a plan dragged over the map stays quick. */
IC.aptPlanOverlaps = function (S, ap, part) {
  const key = ap.parts.length + ':' + ap.nodeN + ':' + (ap.land ? ap.land.ver : 0) + ':' + ((S && S.world && S.world.edges) || []).length + ':' + ((S && S.world && S.world.tunnels) || []).length;
  if (ap._elsKey !== key || !ap._els) { ap._els = IC.aptElements(S, ap).filter(e => !e.p || !e.p._probe); ap._elsKey = key; }
  const me = IC.aptElementOf(ap, part); if (!me) return [];
  me.name = `the new ${U.lc((IC.APART[part.kind] || { name: part.kind }).name)}`;
  const els = ap._els.filter(e => !(e.p && (e.p === part || (part._was && e.p === part._was))) && !e.ownRoad);
  const L = IC.aptOverlaps(S, ap, { els: els.concat([me]), only: me });
  return L.filter(o => !((o.A.world || o.B.world) && (me.cat === 'rwy' || me.cat === 'twy' || me.cat === 'apron')));
};
/* one line for a list of overlaps */
IC.overlapText = L => !L.length ? 'Nothing overlaps.' : L.length === 1 ? L[0].text : `${L[0].text} (and ${L.length - 1} more)`;

})(window.IC);
