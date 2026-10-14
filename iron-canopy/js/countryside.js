/* ---------- the countryside (brief 57) ----------
   The farmland planned block by block, headless, by the lie of the land; terrain.js paints the plan.
   The farm grid is 1.6 km (IC.FB) with jittered corners (neighbours share them). Each block has a character from
   the terrain (IC.landKind): the plain's open fields, long strips between ditches and a hedge here and there, whole
   blocks under one crop; enclosed country where a smooth noise says so, smaller fields and hedges with trees on
   every edge; the hills, each block cut into two or three smaller holdings with their own slant, short plots along
   the contour, hedges and trees round every one; the meadows along a river, pasture with few fences, scattered
   trees and a pond; the uplands, rough grazing between walls. Across the pattern: farmsteads (a house, a barn and
   a shed round a yard, a track to the block's edge) where no village is near, copses, orchards near the villages,
   ponds. Everything is picked by hashes of the block, so a save keeps it and two tiles agree on their shared edge. */
(function () {
const U = IC.U;
const FB = 16;
IC.FB = FB;
// a block corner, jittered: the same point for the four blocks that meet there
IC.fbCorner = (i, j) => [i * FB + (U.hash(i * 3 + 1, j * 5 + 7) - 0.5) * FB * 0.32, j * FB + (U.hash(j * 7 + 2, i * 11 + 5) - 0.5) * FB * 0.32];

IC.CTRY = {
  hillSlope: 0.0075, hillH: 0.42, uplandH: 0.55, meadowR: 15, meadowSlope: 0.006,   // what makes a block hill, upland or meadow
  enclosed: 0.53,                 // the smooth noise above which the plain is enclosed country (hedged fields)
  farmP: { plain: 0.3, enc: 0.35, hill: 0.3, meadow: 0.25, upland: 0.12 },   // share of blocks with a farmstead
  copseP: { plain: 0.05, enc: 0.12, hill: 0.14, meadow: 0.1, upland: 0.06 },
  orchardR: 40, orchardP: 0.35,   // within 4 km of a village, a third of the blocks have an orchard plot
  pondP: { plain: 0.06, enc: 0.1, hill: 0.05, meadow: 0.3, upland: 0.04 },
  villageClear: 14                 // no farmstead within 1.4 km of a village
};

/* the character of the land at a point */
IC.landKind = function (W, x, y) {
  const h = W.hAt(x, y);
  if (h > IC.CTRY.uplandH) return 'upland';
  const s = W.slopeAt(x, y);
  if (W.riverDist(x, y) < IC.CTRY.meadowR && s < IC.CTRY.meadowSlope) return 'meadow';
  if (s > IC.CTRY.hillSlope || h > IC.CTRY.hillH) return 'hill';
  return U.fbm(x / 1800 + 7.3, y / 1800 + 2.1, 3) > IC.CTRY.enclosed ? 'enc' : 'plain';
};

// the roads and lanes in buckets, for "is there a road within d of here" (built once a world, the save skips it)
function segIndex(W) {
  if (W._csegs && W._csegs.n === W.edges.length + (W.lanes ? W.lanes.length : 0)) return W._csegs;
  const B = 10, m = new Map(), key = (x, y) => Math.floor(x / B) * 65536 + Math.floor(y / B);
  const add = pts => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const x0 = Math.floor(Math.min(a.x, b.x) / B), x1 = Math.floor(Math.max(a.x, b.x) / B), y0 = Math.floor(Math.min(a.y, b.y) / B), y1 = Math.floor(Math.max(a.y, b.y) / B); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x * 65536 + y; let l = m.get(k); if (!l) m.set(k, l = []); l.push(a.x, a.y, b.x, b.y); } } };
  for (const e of W.edges) add(e.pts);
  for (const l of W.lanes || []) add(l.pts);
  const near = (x, y, d) => {
    const gx = Math.floor(x / B), gy = Math.floor(y / B), r = Math.ceil(d / B);
    let best = Infinity;
    for (let i = gx - r; i <= gx + r; i++) for (let j = gy - r; j <= gy + r; j++) { const l = m.get(i * 65536 + j); if (!l) continue; for (let k = 0; k < l.length; k += 4) { const q = U.segDist(x, y, l[k], l[k + 1], l[k + 2], l[k + 3]); if (q < best) best = q; } }
    return best;
  };
  return (W._csegs = { n: W.edges.length + (W.lanes ? W.lanes.length : 0), near });
}
// the villages in buckets, for "how far is the nearest village"
function villageIndex(W) {
  if (W._cvill) return W._cvill;
  const B = 64, m = new Map();
  for (const v of W.villages) { const k = Math.floor(v.x / B) * 65536 + Math.floor(v.y / B); let l = m.get(k); if (!l) m.set(k, l = []); l.push(v); }
  const near = (x, y) => { let best = Infinity; const gx = Math.floor(x / B), gy = Math.floor(y / B); for (let i = gx - 1; i <= gx + 1; i++) for (let j = gy - 1; j <= gy + 1; j++) for (const v of m.get(i * 65536 + j) || []) best = Math.min(best, U.dxy(x, y, v.x, v.y)); return best; };
  return (W._cvill = { near });
}

// is the point inside the quad (convex, either winding)?
function inQuad(q, x, y) {
  let sgn = 0;
  for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4], cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (cr === 0) continue; if (!sgn) sgn = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sgn) return false; }
  return true;
}
/* the plan of farm block i, j (null where there is no farmland): its kind, its holdings (cells, one for a plain
   block, several in the hills) each with a centre, a slant and plots [u, v, w, h, crop hash, kind] in its own frame,
   the edges round the block and between holdings with what runs along them, and the features */
IC.farmBlock = function (W, i, j) {
  const C = W._fbc || (W._fbc = new Map()), key = i * 65536 + j;
  let P = C.get(key); if (P !== undefined) return P;
  if (C.size > 6000) C.clear();
  P = planBlock(W, i, j); C.set(key, P);
  return P;
};
function planBlock(W, i, j) {
  const c00 = IC.fbCorner(i, j), c10 = IC.fbCorner(i + 1, j), c11 = IC.fbCorner(i + 1, j + 1), c01 = IC.fbCorner(i, j + 1);
  const cx = (c00[0] + c10[0] + c11[0] + c01[0]) / 4, cy = (c00[1] + c10[1] + c11[1] + c01[1]) / 4;
  const fw = W.farmAt(cx, cy);
  if (fw < 0.12) return null;
  const kind = IC.landKind(W, cx, cy), L = IC.CTRY;
  const hb = U.hash(i * 13 + 5, j * 29 + 1), h2 = U.hash(i * 17 + 3, j * 23 + 9), h3 = U.hash(i * 31 + 7, j * 19 + 11);
  const th0 = W.fieldAng(cx, cy);
  // a point of the block by its bilinear coordinates
  const at = (s, t) => [c00[0] + (c10[0] - c00[0]) * s + (c01[0] - c00[0]) * t + (c00[0] - c10[0] - c01[0] + c11[0]) * s * t, c00[1] + (c10[1] - c00[1]) * s + (c01[1] - c00[1]) * t + (c00[1] - c10[1] - c01[1] + c11[1]) * s * t];
  // holdings: one on the plain and the meadows, two or three a side in the hills (and enclosed country now and then)
  const n = kind === 'hill' ? (h2 < 0.5 ? 2 : 3) : kind === 'enc' && h2 < 0.3 ? 2 : 1;
  const cells = [], inner = [];   // inner: the edges between holdings
  const grid = [];
  for (let b = 0; b <= n; b++) { grid.push([]); for (let a = 0; a <= n; a++) {
    const jit = a > 0 && a < n ? (U.hash(i * 7 + a, j * 5 + b + 41) - 0.5) * 0.5 / n : 0, jt = b > 0 && b < n ? (U.hash(j * 7 + b, i * 5 + a + 43) - 0.5) * 0.5 / n : 0;
    grid[b].push(a === 0 ? c00 && at(0, b / n + (b > 0 && b < n ? jt : 0)) : a === n ? at(1, b / n + (b > 0 && b < n ? jt : 0)) : at(a / n + jit, b / n + (b > 0 && b < n ? jt : 0)));
  } }
  // (the outer corners are the shared ones)
  grid[0][0] = c00; grid[0][n] = c10; grid[n][n] = c11; grid[n][0] = c01;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const q = [grid[b][a], grid[b][a + 1], grid[b + 1][a + 1], grid[b + 1][a]];
    const ccx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, ccy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const hc = U.hash(i * 11 + a * 3 + 1, j * 13 + b * 5 + 2);
    const th = th0 + (hb - 0.5) * 0.14 + (n > 1 ? (hc - 0.5) * 0.5 : 0);
    cells.push({ q, cx: ccx, cy: ccy, th, R: FB * 0.9 / n + 1, plots: [], base: U.hash(i * 3 + a, j * 7 + b + 101), seed: hc });
    if (a > 0) inner.push([grid[b][a], grid[b + 1][a]]);
    if (b > 0) inner.push([grid[b][a], grid[b][a + 1]]);
  }
  // plots in each holding: width across the slant, length along it, by the kind
  const [sw0, swv, sl0, slv] = kind === 'plain' ? [3.2, 2.6, 7, 12] : kind === 'enc' ? [2.2, 1.8, 4, 6] : kind === 'hill' ? [1.6, 1.4, 2.5, 4] : kind === 'meadow' ? [4, 3, 6, 8] : [5, 4, 8, 10];
  const one = kind === 'plain' && h3 < 0.15;   // a whole block under one crop, a prairie field
  for (const c of cells) {
    const sw = one ? c.R * 2 : sw0 + U.hash(i + c.seed * 97, j + 77) * swv, R = c.R;
    for (let u = -R + (hb * sw) % sw; u < R; u += sw) {
      const sl = one ? R * 2 : sl0 + U.hash(Math.round(u * 10) + i, j + c.seed * 31) * slv, vo = U.hash(i + 3, Math.round(u * 10) + j) * sl;
      for (let v = -R - vo; v < R; v += sl) {
        const hf = U.hash(Math.round((c.cx + u) * 7), Math.round((c.cy + v) * 7));
        // a farm grows mostly one thing: half the plots take the holding's crop
        const cr = kind === 'meadow' || kind === 'upland' ? 0.6 + hf * 0.1 : hf < 0.5 ? c.base : hf;
        // (in a block of several holdings, a plot belongs to the holding its centre is in)
        if (n > 1) { const px = c.cx + (u + sw / 2) * Math.cos(c.th) - (v + sl / 2) * Math.sin(c.th), py = c.cy + (u + sw / 2) * Math.sin(c.th) + (v + sl / 2) * Math.cos(c.th); if (!inQuad(c.q, px, py)) continue; }
        c.plots.push([u, v, sw, sl, cr, hf, kind === 'meadow' ? 'pasture' : kind === 'upland' ? 'rough' : 'crop']);
      }
    }
  }
  // the edges round the block: what runs along each, by the kind of country
  const edges = [];
  const outer = [[c00, c10, i * 7 + 1, j], [c10, c11, i + 1, j * 5 + 3], [c11, c01, i * 7 + 1, j + 1], [c01, c00, i, j * 5 + 3]];
  const pick = (e, k) => {
    // e in [0,1): track first, then the kind's own boundaries
    if (e < 0.18) return 'track';
    if (k === 'plain') return e < 0.45 ? 'hedge' : e < 0.9 ? 'ditch' : null;
    if (k === 'enc' || k === 'hill') return e < 0.95 ? 'hedge' : 'ditch';
    if (k === 'meadow') return e < 0.5 ? 'hedge' : e < 0.85 ? 'fence' : null;
    return e < 0.9 ? 'wall' : null;
  };
  for (const [p, q, a, b] of outer) { const e = U.hash(a * 3 + 11, b * 5 + 17), t = pick(e, kind); if (t) edges.push({ a: p, b: q, t, trees: t === 'hedge' && (kind !== 'plain' || e < 0.3), ha: a, hb: b }); }
  inner.forEach((pq, k) => { const e = U.hash(i * 5 + k * 3, j * 7 + 19); edges.push({ a: pq[0], b: pq[1], t: e < 0.1 ? 'track' : kind === 'upland' ? 'wall' : 'hedge', trees: kind !== 'upland', ha: i * 5 + k, hb: j * 9 + k }); });
  // features
  const feats = [], segs = segIndex(W), vill = villageIndex(W);
  const free = (x, y, d) => W.farmAt(x, y) >= 0.25 && !W.builtAt(x, y) && !W.inLake(x, y) && W.forestD(x, y) < IC.FOREST_T - 0.06 && W.riverDist(x, y) > 3 && segs.near(x, y, d) > d;
  const spot = (k, s0, s1) => { const s = s0 + U.hash(i * 41 + k, j * 43 + k) * (s1 - s0), t = s0 + U.hash(j * 47 + k, i * 53 + k) * (s1 - s0); return at(s, t); };
  // a farmstead, where no village is near: the yard faces the holding's slant, a track runs to the nearest edge
  if (U.hash(i * 61 + 1, j * 67 + 2) < L.farmP[kind]) {
    const p = spot(1, 0.25, 0.75);
    if (vill.near(p[0], p[1]) > L.villageClear && free(p[0], p[1], 1.2)) {
      const a = th0 + Math.PI / 2 * Math.round((U.hash(i, j + 5) - 0.5) * 2), ca = Math.cos(a), sa = Math.sin(a);
      const pt = (u, v) => ({ x: p[0] + u * ca - v * sa, y: p[1] + u * sa + v * ca });
      const big = U.hash(i * 3, j * 5 + 9) < 0.4;
      // round the yard: the house across the top, the barn down one side, a shed and a silo or a muck heap
      const bld = [{ k: 'house', ...pt(0, -0.42), w: 0.15, h: 0.09, a }, { k: 'barn', ...pt(-0.36, 0.02), w: 0.11, h: 0.28, a }, { k: 'shed', ...pt(0.3, 0.1), w: 0.1, h: 0.16, a }];
      if (big) bld.push({ k: 'barn', ...pt(0.05, 0.42), w: 0.3, h: 0.12, a }, { k: 'silo', ...pt(0.4, -0.3), w: 0.05, h: 0.05, a });
      // the track: to the nearest block edge, straight
      let best = null;
      for (const [q0, q1] of outer) { const mx = (q0[0] + q1[0]) / 2, my = (q0[1] + q1[1]) / 2, d = U.dxy(p[0], p[1], mx, my); if (!best || d < best.d) best = { d, x: mx, y: my }; }
      feats.push({ k: 'farm', x: p[0], y: p[1], a, bld, yard: { w: 0.7, h: 0.75 }, track: [[p[0], p[1]], [best.x, best.y]], big });
    }
  }
  // a copse: a clump of trees in a field
  if (U.hash(i * 71 + 3, j * 73 + 4) < L.copseP[kind]) {
    const p = spot(2, 0.15, 0.85), r = 0.5 + U.hash(i * 79, j * 83) * 0.9;
    if (free(p[0], p[1], r + 0.3) && !feats.some(f => U.dxy(f.x, f.y, p[0], p[1]) < r + 1)) {
      // its outline: a wobbly ring
      const pts = []; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = r * (0.7 + U.hash(i * 89 + k, j * 97) * 0.6); pts.push([p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr]); }
      feats.push({ k: 'copse', x: p[0], y: p[1], r, pts });
    }
  }
  // an orchard near a village: one plot of the first holding in rows of trees
  if (vill.near(cx, cy) < L.orchardR && U.hash(i * 101 + 5, j * 103 + 6) < L.orchardP && kind !== 'upland') {
    const c = cells[0], cand = c.plots.filter(pl => pl[2] < 6.5 && pl[3] < 12 && Math.abs(pl[0]) < c.R * 0.6 && Math.abs(pl[1]) < c.R * 0.6);
    if (cand.length) { const pl = cand[Math.floor(U.hash(i * 107, j * 109) * cand.length)]; pl[6] = 'orchard'; feats.push({ k: 'orchard', cell: 0, plot: c.plots.indexOf(pl) }); }
  }
  // a pond
  if (U.hash(i * 113 + 7, j * 127 + 8) < L.pondP[kind]) {
    const p = spot(3, 0.2, 0.8), rx = 0.18 + U.hash(i * 131, j * 137) * 0.25, ry = rx * (0.6 + U.hash(i * 139, j * 149) * 0.4);
    if (free(p[0], p[1], rx + 0.4) && !feats.some(f => f.x !== undefined && U.dxy(f.x, f.y, p[0], p[1]) < (f.r || 0.8) + rx + 0.3)) feats.push({ k: 'pond', x: p[0], y: p[1], rx, ry, a: U.hash(i * 151, j * 157) * Math.PI });
  }
  return { i, j, kind, fw, corners: [c00, c10, c11, c01], cx, cy, cells, edges, feats, one };
}

/* the farm blocks a box touches, planned */
IC.farmBlocks = function (W, x0, y0, x1, y1) {
  const out = [], i0 = Math.floor(x0 / FB) - 1, i1 = Math.ceil(x1 / FB), j0 = Math.floor(y0 / FB) - 1, j1 = Math.ceil(y1 / FB);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const P = IC.farmBlock(W, i, j); if (P) out.push(P); }
  return out;
};
})();
