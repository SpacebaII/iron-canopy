/* The fringe of a city (brief 54): what lies between its last block and the fields. Ribbon development along each
   road out of town (house plots fronting the road, thinning out, a petrol station, a car dealer or a garden centre
   among them), an outer ring of the things a town keeps at its edge (allotments, playing fields, a cemetery, a
   sewage works, a water tower, a scrapyard, a riding school), a retail park beside the busiest road out of a big
   city, and an outlying estate or two (a close of houses off a road out). Houses, the retail park and the estates are
   blocks of the city (d 'sub' or 'biz', fr: true), so they count for traffic and can be hit; the rest is c.fringe.items,
   painted in the tiles (terrain.js). Headless geometry; units: 1 = 100 m. */
(function (IC) {
const U = IC.U;

/* what a town keeps at its edge: size in units, and where it goes */
const ITEMS = {
  allot: { w: [1.2, 2.0], h: [0.8, 1.4], n: 1.6 },     // allotments: strips of gardens with sheds
  pitch: { w: [1.6, 2.6], h: [1.0, 1.8], n: 1.4 },     // playing fields: pitches with a pavilion
  cem: { w: [1.0, 1.8], h: [0.8, 1.4], n: 1.0 },       // a cemetery: rows of graves, a chapel, yews
  sewage: { w: [1.2, 2.0], h: [0.9, 1.5], n: 1.0, river: true },   // a sewage works, by the river where there is one
  water: { w: [0.3, 0.3], h: [0.3, 0.3], n: 0.8, high: true },     // a water tower on the high ground
  scrap: { w: [0.7, 1.2], h: [0.5, 0.9], n: 0.7 },     // a scrapyard
  riding: { w: [1.0, 1.6], h: [0.8, 1.2], n: 0.6 }     // a riding school: a sand school and a paddock
};
IC.FRINGE_ITEMS = ITEMS;

IC.buildFringe = function (W, c, R, segs, vils) {
  segs = segs.map(s => s[5] ? [s[0], s[1], s[2], s[3], 'art'] : s);   // (an avenue is wider than the road it carries on)
  const F = c.fringe = { plots: 0, items: [], estates: 0 };
  const blocks = c.blocks;
  // the town's reach by direction (36 bins): a block's distance plus half its size, so the fringe starts past it
  const NB = 36, ext = new Float32Array(NB);
  for (const b of blocks) { const k = ((Math.floor(Math.atan2(b.y - c.y, b.x - c.x) / (2 * Math.PI) * NB) % NB) + NB) % NB, d = U.dist(b, c) + Math.max(b.w, b.h) / 2; for (const dk of [-1, 0, 1]) { const q = (k + dk + NB) % NB; if (d > ext[q]) ext[q] = d; } }
  const extAt = a => ext[((Math.floor(a / (2 * Math.PI) * NB) % NB) + NB) % NB];
  // what stands already: the city's blocks on a grid, the villages' plots and houses
  const G = 4, grid = new Map(), gk = (i, j) => i * 65536 + j;
  const put = (q, pad) => { const m = Math.max(q.w, q.h) / 2 + (pad || 0); for (let j = Math.floor((q.y - m) / G); j <= Math.floor((q.y + m) / G); j++) for (let i = Math.floor((q.x - m) / G); i <= Math.floor((q.x + m) / G); i++) { const k = gk(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(q); } };
  for (const b of blocks) put(b);
  for (const v of vils) { if (U.dist(v, c) > c.r * 2.6) continue; for (const b of v.blocks) put(b); if (v.plan) { for (const q of v.plan.plots) put(q); for (const q of v.plan.yards) put(q); } }
  // (two rectangles apart, judged in the new one's frame; one turned from it counts by its longer side)
  const free = (x, y, w, h, a, pad) => {
    const ca = Math.cos(a), sa = Math.sin(a), m = Math.max(w, h) / 2 + pad + 2;
    for (let j = Math.floor((y - m) / G); j <= Math.floor((y + m) / G); j++) for (let i = Math.floor((x - m) / G); i <= Math.floor((x + m) / G); i++) {
      const l = grid.get(gk(i, j)); if (!l) continue;
      for (const q of l) {
        const dx = q.x - x, dy = q.y - y, du = Math.abs(dx * ca + dy * sa), dv = Math.abs(-dx * sa + dy * ca);
        const turned = Math.abs(U.angWrap((q.a || 0) - a)) > 0.35, qw = turned ? Math.max(q.w, q.h) : q.w, qh = turned ? Math.max(q.w, q.h) : q.h;
        if (du < (w + qw) / 2 + pad && dv < (h + qh) / 2 + pad) return false;
      }
    }
    return true;
  };
  const rs = [];
  for (const r of W.rivers || []) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(c.x, c.y, a.x, a.y, b.x, b.y) < c.r * 3) rs.push([a.x, a.y, b.x, b.y, (r.w || 2) * 0.15 + 0.6]); }
  const wet = (x, y, pad) => W.inLake(x, y) || rs.some(s => U.segDist(x, y, s[0], s[1], s[2], s[3]) < s[4] + (pad || 0));
  const onRoad = (x, y, d, skip) => segs.some(s => s !== skip && U.segDist(x, y, s[0], s[1], s[2], s[3]) < d + (s[4] === 'hw' ? 1.2 : s[4] === 'rail' ? 0.4 : 0));
  // (rd: how close a road may come to the centre; a plot beside its road is checked by its depth, not its frontage)
  // (an interchange keeps its footprint: brief 56)
  const ground = (x, y, w, h, a, pad, rd) => W.inHome(x, y) && !wet(x, y, pad) && !W.forestAt(x, y) && W.hAt(x, y) < 0.75 && !(IC.ixClear && IC.ixClear(W, x, y, Math.max(w, h) / 2)) && !onRoad(x, y, (rd != null ? rd : Math.max(w, h) / 2) + 0.1) && !IC.blockOnRoad({ x, y, w, h, a }, segsAt(x, y), 0.02) && free(x, y, w, h, a, pad);
  // (the road pieces near a point, from 16-unit buckets, for the footprint test)
  const SG = 16, sgm = new Map(); for (const s of segs) for (let j = Math.floor(Math.min(s[1], s[3]) / SG); j <= Math.floor(Math.max(s[1], s[3]) / SG); j++) for (let i = Math.floor(Math.min(s[0], s[2]) / SG); i <= Math.floor(Math.max(s[0], s[2]) / SG); i++) { const k = i * 65536 + j; let l = sgm.get(k); if (!l) sgm.set(k, l = []); l.push(s); }
  const segsAt = (x, y) => { const out = []; for (let j = Math.floor(y / SG) - 1; j <= Math.floor(y / SG) + 1; j++) for (let i = Math.floor(x / SG) - 1; i <= Math.floor(x / SG) + 1; i++) { const l = sgm.get(i * 65536 + j); if (l) for (const s of l) out.push(s); } return out; };
  const rotXY = (x, y, a, u, w) => ({ x: x + Math.cos(a) * u - Math.sin(a) * w, y: y + Math.sin(a) * u + Math.cos(a) * w });
  const mk = (x, y, w, h, a, d, f) => { const b = { x, y, w, h, a, d, f, core: false, ind: false, sub: d === 'sub', seed: R() * 1000, hp: 1, fr: true }; blocks.push(b); put(b); return b; };
  const big = c.pop > 300, size = U.clamp(c.pop / 400, 0.5, 1.5);

  /* 1. ribbon development along the roads out (not the motorways): plots fronting the road for 500–1,500 m past the
     last block, nine in ten at first and one in three at the end */
  // (a road out starts at one of the city's gates, or at a junction just outside it, as where a motorway rings the
  // town and the local roads leave from its junctions)
  const gate = id => typeof id === 'string' && id.startsWith(c.id + ':');
  const nearTown = p => U.dist(p, c) < extAt(Math.atan2(p.y - c.y, p.x - c.x)) + 8;
  const fromA = e => gate(e.a) || (!gate(e.b) && nearTown(e.pts[0]) && !nearTown(e.pts[e.pts.length - 1]));
  const outs = W.edges.filter(e => !e.city && e.cls !== 'hw' && e.cls !== 'ramp' && (gate(e.a) || gate(e.b) || nearTown(e.pts[0]) !== nearTown(e.pts[e.pts.length - 1])));
  let ribbon = 0, best = null; const ribbonL = new Map();   // (how far each road's ribbon ran)
  for (const e of outs) {
    const P = fromA(e) ? e.pts : e.pts.slice().reverse(), L = R.range(5, 15) * size, side0 = R() < 0.5 ? 1 : -1;
    let s = 0.6, n = 0, items = 0;
    const along = (t) => { let d = t; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], l = U.dist(a, b); if (d <= l) { const k = l ? d / l : 0; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x) }; } d -= l; } return null; };
    const half = (IC.ROAD_W && IC.ROAD_W[e.cls]) || 0.13;
    while (s < L) {
      const fw = R.range(0.3, 0.5), p = along(s + fw / 2); if (!p) break;
      const far = s / L, dens = 0.9 - 0.6 * far;
      // (clear of the town itself, of a junction, of another road)
      if (U.dist(p, c) < extAt(Math.atan2(p.y - c.y, p.x - c.x)) + 0.5 || (IC.ixClear && IC.ixClear(W, p.x, p.y, 0.6))) { s += fw; continue; }
      for (const side of [side0, -side0]) {
        if (R() > dens) continue;
        // among the houses, now and then, a petrol station, a car dealer or a garden centre
        const item = n > 4 && items < 2 && R() < 0.07, w = item ? R.range(0.7, 1.1) : fw * 0.9, h = item ? R.range(0.5, 0.8) : R.range(0.6, 0.95);
        const q = rotXY(p.x, p.y, p.a, item ? w / 2 - fw / 2 : 0, side * (half + 0.08 + h / 2));
        if (!ground(q.x, q.y, w, h, p.a, 0.05, h / 2 - 0.05)) continue;
        mk(q.x, q.y, w, h, p.a, item ? 'biz' : 'sub', item ? ['petrol', 'dealer', 'garden'][R.int(0, 2)] : 'plot');
        if (item) items++; else { n++; ribbon++; }
      }
      s += fw + (R() < 0.2 ? R.range(0.3, 1.2) : 0.05);
    }
    F.plots += n; ribbonL.set(e, L);
    if (!best || (IC.ROAD_RANK ? (IC.ROAD_RANK[e.cls] || 0) > (IC.ROAD_RANK[best.e.cls] || 0) : false)) best = { e, P, L };
  }

  /* 2. the outer ring: placed in the open ground past the town's reach, where nothing stands */
  const want = Math.round((3 + size * 4) * (big ? 1.3 : 1));
  // (most of them stand off a road out, a little way past the ribbon, the rest anywhere round the town near a road)
  const kinds = Object.keys(ITEMS), tried = {};
  const alongP = (P, t) => { let d = t; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], l = U.dist(a, b); if (d <= l) { const k = l ? d / l : 0; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x) }; } d -= l; } return null; };
  for (let k = 0, tries = 0; k < want && tries < want * 12; tries++) {
    const kind = kinds[Math.floor(R() * kinds.length)], I = ITEMS[kind]; if ((tried[kind] || 0) >= I.n) continue;
    const w = R.range(I.w[0], I.w[1]), h = R.range(I.h[0], I.h[1]);
    let x, y, ang;
    if (outs.length && R() < 0.7) {
      const e = outs[R.int(0, outs.length - 1)], P = fromA(e) ? e.pts : e.pts.slice().reverse();
      const p = alongP(P, (ribbonL.get(e) || 0) + R.range(1, 8) * size); if (!p) continue;
      const q = rotXY(p.x, p.y, p.a, 0, (R() < 0.5 ? 1 : -1) * (0.3 + Math.max(w, h) / 2 + R.range(0.1, 1.2)));
      x = q.x; y = q.y; ang = p.a + (R() < 0.5 ? 0 : Math.PI / 2);
      if (U.dist(q, c) < extAt(Math.atan2(q.y - c.y, q.x - c.x)) + 1) continue;
    } else {
      const a = R.range(0, Math.PI * 2), d = extAt(a) + R.range(1.5, 6); x = c.x + Math.cos(a) * d; y = c.y + Math.sin(a) * d; ang = R.range(0, Math.PI);
    }
    if (I.river && rs.length && !rs.some(s => U.segDist(x, y, s[0], s[1], s[2], s[3]) < 6)) continue;
    if (I.high && (W.hAt(x, y) < W.hAt(c.x, c.y) + 0.02 || W.slopeAt(x, y) > 0.06)) continue;
    if (!ground(x, y, w, h, ang, 0.5)) continue;
    // (by a road, so it can be reached: within 300 m of one, and the ribbon's houses do not reach it)
    if (!onRoad(x, y, Math.max(w, h) / 2 + 3)) continue;
    const it = { kind, x, y, w, h, a: ang, seed: R() * 1000 };
    F.items.push(it); put(it, 0.3); tried[kind] = (tried[kind] || 0) + 1; k++;
  }

  /* 3. a retail park beside the busiest road out of a big city, past the ribbon: sheds round a car park */
  // (further out along the road, then the other roads out, until there is room)
  if (big && best) {
    const rank = e => IC.ROAD_RANK ? (IC.ROAD_RANK[e.cls] || 0) : 0;
    const roads = [best].concat(outs.filter(e => e !== best.e).sort((p, q) => rank(q) - rank(p)).map(e => ({ e, P: fromA(e) ? e.pts : e.pts.slice().reverse(), L: ribbonL.get(e) || 0 })));
    retail: for (const { P, L } of roads) {
      let d = 0; for (let i = 1; i < P.length; i++) d += U.dist(P[i - 1], P[i]);
      for (let t = 0; t < 8; t++) {
        const s = L + 1 + t * 1.5 + R.range(0, 1); if (s > d - 2) break;
        const p = alongP(P, s); if (!p) break;
        const w = R.range(2.6, 3.4), h = R.range(1.8, 2.4), side0 = R() < 0.5 ? 1 : -1;
        for (const side of [side0, -side0]) {
          const q = rotXY(p.x, p.y, p.a, 0, side * (0.3 + h / 2));
          if (!ground(q.x, q.y, w, h, p.a, 0.3, h / 2)) continue;
          mk(q.x, q.y, w, h, p.a, 'biz', 'retail'); F.retail = true; break retail;
        }
      }
    }
  }

  /* 4. outlying estates: a close of houses off a road out, past the ribbon */
  const nE = c.pop > 150 ? R.int(1, 2) : 0;
  for (let k = 0, tries = 0; k < nE && tries < 12 && outs.length; tries++) {
    const e = outs[Math.floor(R() * outs.length)], P = fromA(e) ? e.pts : e.pts.slice().reverse();
    let d = 0; for (let i = 1; i < P.length; i++) d += U.dist(P[i - 1], P[i]);
    const s = R.range(6, 18) * size; if (s > d - 2) continue;
    let q = s, p = null; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], l = U.dist(a, b); if (q <= l) { const kk = l ? q / l : 0; p = { x: a.x + (b.x - a.x) * kk, y: a.y + (b.y - a.y) * kk, a: Math.atan2(b.y - a.y, b.x - a.x) }; break; } q -= l; }
    if (!p) continue;
    const w = R.range(2.4, 3.2), h = R.range(2.2, 3.0), side = R() < 0.5 ? 1 : -1, o = rotXY(p.x, p.y, p.a, 0, side * (0.4 + h / 2));
    if (!ground(o.x, o.y, w, h, p.a, 0.4, h / 2 + 0.1)) continue;
    const b = mk(o.x, o.y, w, h, p.a, 'sub', 'cul');
    b.a = p.a - side * Math.PI / 2 - IC.culPlan(b).inA;   // (turned so its way in faces the road)
    // (turned, a long block can reach the road: then not here)
    if (IC.blockOnRoad(b, segsAt(b.x, b.y), 0.02)) { blocks.pop(); continue; }
    F.estates++; k++;
  }
  if (F.estates) IC.closeStreets(c, blocks.filter(b => b.fr && b.f === 'cul'), segs.filter(s => s[4] !== 'hw' && s[4] !== 'rail'));
  // the town reaches further now
  // (c.ext stays the town's own reach: the fringe lies beyond it)
  return F;
};

})(window.IC);
