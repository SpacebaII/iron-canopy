/* Iron Canopy — the airside service roads (brief 45): the roads the tugs, buses, fuel trucks, caterers and fire
   tenders drive on, laid out by themselves for every airport and again whenever it changes. Headless: the pavement
   painter draws them (render-pavement.js), the service vehicles get the network (IC.svcNetwork).
   - the equipment road round each terminal and cargo shed, on its forecourt, behind the stands' noses;
   - the apron edge road along the sides of each apron that no taxiway runs along;
   - the perimeter road inside the fence;
   - a spur to each fuel farm, cargo shed, fire station, hangar, tower and radar, from the nearest of those roads,
     never across a runway;
   - and the roads the player draws (ap.svcRoads).
   Where a road crosses a taxiway it keeps to the ground: a zebra where it crosses a taxilane, a stop line and STOP
   painted on the road at a taxiway's edge (IC.svcNet(ap).cross). */
(function (IC) {
'use strict';
const U = IC.U;
const W = 0.075;   // a service road is 7.5 m wide: two lanes of airside vehicles
IC.SVC_ROAD_W = W;
const SPUR = { fuel: 1, cargo: 1, fire: 1, hangar: 1, tower: 1, atc: 1, gradar: 1, hydrant: 1, deice: 1, ammo: 1, has: 1 };

/* what the network depends on: the pavement, the buildings it serves, the fence and the roads drawn by hand */
function sig(ap) {
  let s = (IC.paveSig ? IC.paveSig(ap) : '') + '|' + (ap.svcRoads || []).length;
  for (const p of ap.parts) if (p.built && SPUR[p.kind]) s += p.id + (p.x + p.y).toFixed(2);
  const F = IC.aptFence(ap); if (F) s += F.poly.length + (F.poly[0].x + F.poly[0].y).toFixed(2);
  return s;
}
const segHit = (A, B, C, D) => U.segX(A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y) >= 0;
function polyLine(P, closed) { return closed ? P.concat([P[0]]) : P; }

/* The network, cached until the airport changes: { roads: [{ pts, w, kind, closed }], cross: [{ x, y, a, lane, w }] }.
   kind: 'equip', 'edge', 'perim', 'spur' or 'drawn' */
IC.svcNet = function (ap) {
  if (!ap.parts || !ap.parts.length) return { roads: [], cross: [] };
  const k = sig(ap);
  if (ap._svc && ap._svc.sig === k) return ap._svc;
  const roads = [], rws = ap.parts.filter(p => p.kind === 'runway' && p.built);
  const blds = ap.parts.filter(p => p.built && p.x != null && !IC.PAVED[p.kind] && p.kind !== 'ils' && p.kind !== 'surface' && p.kind !== 'skybridge');
  // (a road never runs over a runway or its shoulders, nor through a building it does not serve)
  const onRunway = (A, B) => rws.some(r => { const d = IC.rwDir(r), n = { x: -d.y, y: d.x }, h = r.w / 2 + 0.25, P = [{ x: r.a.x + n.x * h, y: r.a.y + n.y * h }, { x: r.b.x + n.x * h, y: r.b.y + n.y * h }, { x: r.b.x - n.x * h, y: r.b.y - n.y * h }, { x: r.a.x - n.x * h, y: r.a.y - n.y * h }]; for (let i = 0; i < 4; i++) if (segHit(A, B, P[i], P[(i + 1) % 4])) return true; return U.inPoly(A.x, A.y, P.map(q => [q.x, q.y])); });
  const throughBld = (A, B, skip) => blds.some(q => { if (q === skip || (skip && skip.kind === 'fuel' && q.kind === 'fuel')) return false; const P = IC.partOutline(q); for (let i = 0; i < P.length; i++) if (segHit(A, B, P[i], P[(i + 1) % P.length])) return true; return false; });
  // the equipment road round each terminal and shed, on its forecourt (where the painter already marks it)
  for (const t of ap.parts) if (t.built && (t.kind === 'terminal' || t.kind === 'cargo') && t.x != null && !t.noApron) {
    const P = t.poly ? IC.polyGrow(IC.partOutline(t), 0.075) : IC.partOutline(Object.assign({}, t, { poly: null, w: t.w + 0.15, h: t.h + 0.15 }));
    roads.push({ pts: P, w: W, kind: 'equip', closed: true, by: t.id });
  }
  // the apron edge road: along each side of an apron that no taxiway runs along and no building stands against
  const tws = ap.parts.filter(p => p.kind === 'taxi' && p.built).map(p => p.nodes.map(id => ap.nodes[id]).filter(Boolean));
  for (const a of ap.parts) if (a.kind === 'apron' && a.built && a.x != null) {
    const P = IC.partOutline(a), cw = IC.polyArea ? (P.reduce((s, v, i) => { const w2 = P[(i + 1) % P.length]; return s + (v.x * w2.y - w2.x * v.y); }, 0) > 0 ? 1 : -1) : 1;
    for (let i = 0; i < P.length; i++) {
      const A = P[i], B = P[(i + 1) % P.length], L = U.dist(A, B); if (L < 0.4) continue;
      const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, nx = uy * cw, ny = -ux * cw, off = 0.08;
      const mid = { x: (A.x + B.x) / 2 + nx * off, y: (A.y + B.y) / 2 + ny * off };
      // a taxiway along it (a taxilane on its front), or a building against it: no road there
      if (tws.some(pts => pts.some((q, j) => j && U.segDist(mid.x, mid.y, pts[j - 1].x, pts[j - 1].y, q.x, q.y) < 0.35 && Math.abs(((q.x - pts[j - 1].x) * ux + (q.y - pts[j - 1].y) * uy) / (U.dist(q, pts[j - 1]) || 1)) > 0.9))) continue;
      if (blds.concat(ap.parts.filter(p => p.kind === 'apron' && p !== a && p.built)).some(q => IC.partDist(ap, q, mid) < 0.12)) continue;
      const a0 = { x: A.x + nx * off - ux * off, y: A.y + ny * off - uy * off }, b0 = { x: B.x + nx * off + ux * off, y: B.y + ny * off + uy * off };
      if (onRunway(a0, b0) || throughBld(a0, b0)) continue;
      roads.push({ pts: [a0, b0], w: W, kind: 'edge', by: a.id });
    }
  }
  // the perimeter road, just inside the fence
  const F = IC.aptFence(ap);
  if (F && F.poly && F.poly.length > 2) roads.push({ pts: IC.polyGrow(F.poly, -0.14), w: 0.05, kind: 'perim', closed: true });
  // spurs: from each building that needs vehicles to the nearest road (fuel tanks as one farm)
  const served = [], farm = ap.parts.filter(p => p.built && p.kind === 'fuel');
  if (farm.length) { const c = { x: farm.reduce((s, p) => s + p.x, 0) / farm.length, y: farm.reduce((s, p) => s + p.y, 0) / farm.length }; served.push({ p: farm.sort((a, b) => U.dist(a, c) - U.dist(b, c))[0], farm }); }
  for (const p of ap.parts) if (p.built && SPUR[p.kind] && p.kind !== 'fuel' && p.x != null) served.push({ p });
  const nearestOn = (q) => {
    const out = [];
    for (const r of roads) {
      const P = polyLine(r.pts, r.closed);
      for (let i = 1; i < P.length; i++) {
        const A = P[i - 1], B = P[i], L2 = U.dxy(A.x, A.y, B.x, B.y) ** 2 || 1e-9, t = U.clamp(((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / L2, 0, 1);
        const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t; out.push({ x, y, d: U.dxy(x, y, q.x, q.y), r });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  };
  const axis = ap.rwyA || 0, ax = { x: Math.cos(axis), y: Math.sin(axis) };
  for (const { p, farm: fm } of served) {
    // (already on a road: the equipment road or the apron edge passes its door)
    if (roads.some(r => r.kind !== 'perim' && polyLine(r.pts, r.closed).some((q, i, P) => i && U.segDist(p.x, p.y, P[i - 1].x, P[i - 1].y, q.x, q.y) < Math.max(p.w || 0, p.h || 0, (p.r || 0.1) * 2) / 2 + 0.12))) continue;
    let made = null;
    for (const c of nearestOn(p).slice(0, 40)) {
      if (c.d > 12) break;
      // from the building's edge towards the road: straight, or in two legs square to the airport's axis
      const e0 = edgeToward(p, c), paths = [[e0, c]];
      const t = (c.x - e0.x) * ax.x + (c.y - e0.y) * ax.y;
      paths.push([e0, { x: e0.x + ax.x * t, y: e0.y + ax.y * t }, c], [e0, { x: c.x - ax.x * t, y: c.y - ax.y * t }, c]);
      for (const P of paths) {
        let ok = true;
        for (let i = 1; i < P.length && ok; i++) if (onRunway(P[i - 1], P[i]) || throughBld(P[i - 1], P[i], p)) ok = false;
        if (ok) { made = P; break; }
      }
      if (made) break;
    }
    // (boxed in by runways: round their ends on the grid)
    if (!made) made = gridRoute(ap, roads, edgeToward(p, nearestOn(p)[0] || ap), rws, blds, p);
    if (made) roads.push({ pts: made, w: W, kind: 'spur', by: p.id });
  }
  // one network: a group of roads that touches no other (an apron's edge roads, a shed's forecourt) is linked to the
  // nearest road of the rest, never across a runway
  const touch = (r1, r2) => { const P = polyLine(r1.pts, r1.closed), Q = polyLine(r2.pts, r2.closed); for (let i = 1; i < P.length; i++) for (let j = 1; j < Q.length; j++) { if (segHit(P[i - 1], P[i], Q[j - 1], Q[j])) return true; } for (const q of [P[0], P[P.length - 1]]) for (let j = 1; j < Q.length; j++) if (U.segDist(q.x, q.y, Q[j - 1].x, Q[j - 1].y, Q[j].x, Q[j].y) < 0.03) return true; for (const q of [Q[0], Q[Q.length - 1]]) for (let i = 1; i < P.length; i++) if (U.segDist(q.x, q.y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y) < 0.03) return true; return false; };
  for (let guard = 0; guard < 30; guard++) {
    const comp = new Array(roads.length).fill(-1); let n = 0;
    for (let i = 0; i < roads.length; i++) { if (comp[i] >= 0) continue; const st = [i]; comp[i] = n; while (st.length) { const a = st.pop(); for (let j = 0; j < roads.length; j++) if (comp[j] < 0 && touch(roads[a], roads[j])) { comp[j] = n; st.push(j); } } n++; }
    if (n <= 1) break;
    const main = comp[roads.findIndex(r => r.kind === 'perim')] != null && roads.some(r => r.kind === 'perim') ? comp[roads.findIndex(r => r.kind === 'perim')] : 0;
    // the nearest pair of points between a stray group and the main network, tried in order until one is clear
    let linked = false;
    const pairs = [];
    for (let i = 0; i < roads.length; i++) if (comp[i] !== main) for (const q of polyLine(roads[i].pts, roads[i].closed)) for (let j = 0; j < roads.length; j++) if (comp[j] === main) {
      const P = polyLine(roads[j].pts, roads[j].closed);
      for (let k2 = 1; k2 < P.length; k2++) { const A = P[k2 - 1], B = P[k2], L2 = U.dxy(A.x, A.y, B.x, B.y) ** 2 || 1e-9, t = U.clamp(((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / L2, 0, 1), c = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; pairs.push({ q, c, d: U.dist(q, c), g: comp[i] }); }
    }
    pairs.sort((a, b) => a.d - b.d);
    const tried = new Set();
    for (const pr of pairs.slice(0, 400)) {
      if (tried.has(pr.g + ':' + pr.q.x.toFixed(2))) continue; tried.add(pr.g + ':' + pr.q.x.toFixed(2));
      const t = (pr.c.x - pr.q.x) * ax.x + (pr.c.y - pr.q.y) * ax.y;
      for (const P of [[pr.q, pr.c], [pr.q, { x: pr.q.x + ax.x * t, y: pr.q.y + ax.y * t }, pr.c], [pr.q, { x: pr.c.x - ax.x * t, y: pr.c.y - ax.y * t }, pr.c]]) {
        let ok = true; for (let i = 1; i < P.length && ok; i++) if (onRunway(P[i - 1], P[i]) || throughBld(P[i - 1], P[i])) ok = false;
        if (ok) { roads.push({ pts: P, w: W, kind: 'link' }); linked = true; break; }
      }
      if (linked) break;
    }
    if (!linked) break;
  }
  // the roads the player drew
  for (const r of ap.svcRoads || []) roads.push({ pts: r.pts, w: r.w || W, kind: 'drawn' });
  // where the roads cross taxiways: a zebra on a taxilane, a stop line and STOP on the road at a taxiway
  const cross = [];
  for (const r of roads) {
    const P = polyLine(r.pts, r.closed);
    for (const t of ap.parts) if (t.kind === 'taxi' && t.built) {
      const Q = t.nodes.map(id => ap.nodes[id]).filter(Boolean);
      for (let i = 1; i < P.length; i++) for (let j = 1; j < Q.length; j++) {
        const s = U.segX(P[i - 1].x, P[i - 1].y, P[i].x, P[i].y, Q[j - 1].x, Q[j - 1].y, Q[j].x, Q[j].y); if (s < 0) continue;
        const x = P[i - 1].x + (P[i].x - P[i - 1].x) * s, y = P[i - 1].y + (P[i].y - P[i - 1].y) * s;
        const ra = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x), ta = Math.atan2(Q[j].y - Q[j - 1].y, Q[j].x - Q[j - 1].x);
        cross.push({ x, y, a: ra, ta, lane: !!t.lane, w: t.w || IC.APART.taxi.w, rw: r.w });
      }
    }
  }
  ap._svc = { sig: k, roads, cross };
  return ap._svc;
};
/* a road from a point to the nearest of the roads already laid, on a 50 m grid round runways (and their strips) and
   buildings, straightened where it can be; null when there is no way */
function gridRoute(ap, roads, from, rws, blds, skip) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of roads) for (const q of r.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  x0 = Math.min(x0, from.x) - 1; y0 = Math.min(y0, from.y) - 1; x1 = Math.max(x1, from.x) + 1; y1 = Math.max(y1, from.y) + 1;
  const c = 0.5, nx = Math.ceil((x1 - x0) / c) + 1, ny = Math.ceil((y1 - y0) / c) + 1;
  if (nx * ny > 250000) return null;
  const block = new Uint8Array(nx * ny), goal = new Uint8Array(nx * ny), at = (i, j) => ({ x: x0 + i * c, y: y0 + j * c });
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = at(i, j), k = j * nx + i;
    if (rws.some(r => IC.partDist(ap, r, q) < 0.4)) { block[k] = 1; continue; }
    if (blds.some(b => b !== skip && IC.partDist(ap, b, q) < 0.05)) { block[k] = 1; continue; }
    if (roads.some(r => { const P = r.closed ? r.pts.concat([r.pts[0]]) : r.pts; return P.some((a, n) => n && U.segDist(q.x, q.y, P[n - 1].x, P[n - 1].y, a.x, a.y) < c * 0.6); })) goal[k] = 1;
  }
  const si = U.clamp(Math.round((from.x - x0) / c), 0, nx - 1), sj = U.clamp(Math.round((from.y - y0) / c), 0, ny - 1), s0 = sj * nx + si;
  const dist = new Float32Array(nx * ny).fill(1e9), prev = new Int32Array(nx * ny).fill(-1), Q = [[0, s0]];
  dist[s0] = 0; block[s0] = 0;
  let end = -1;
  while (Q.length) {
    // (a small binary heap would do better; the grids are small)
    let bi = 0; for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[bi][0]) bi = i;
    const [d, k] = Q[bi]; Q[bi] = Q[Q.length - 1]; Q.pop();
    if (d > dist[k]) continue;
    if (goal[k]) { end = k; break; }
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii; if (block[q]) continue;
      const nd = d + w; if (nd < dist[q]) { dist[q] = nd; prev[q] = k; Q.push([nd, q]); }
    }
  }
  if (end < 0) return null;
  const P = []; for (let k = end; k >= 0; k = prev[k]) P.push(at(k % nx, (k / nx) | 0));
  P.reverse(); P[0] = from;
  // (onto the road it reached, exactly)
  const e = P[P.length - 1]; let best = null, bd = 1e9;
  for (const r of roads) { const R = r.closed ? r.pts.concat([r.pts[0]]) : r.pts; for (let n = 1; n < R.length; n++) { const A = R[n - 1], B = R[n], L2 = U.dxy(A.x, A.y, B.x, B.y) ** 2 || 1e-9, t = U.clamp(((e.x - A.x) * (B.x - A.x) + (e.y - A.y) * (B.y - A.y)) / L2, 0, 1), x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, d = U.dxy(x, y, e.x, e.y); if (d < bd) { bd = d; best = { x, y }; } } }
  if (best) P.push(best);
  // straighten: keep a point only where going straight past it would cut a blocked cell
  const clear = (A, B) => { const n = Math.ceil(U.dist(A, B) / (c * 0.5)); for (let t = 1; t < n; t++) { const q = { x: A.x + (B.x - A.x) * t / n, y: A.y + (B.y - A.y) * t / n }, i = Math.round((q.x - x0) / c), j = Math.round((q.y - y0) / c); if (block[j * nx + i]) return false; } return true; };
  const out = [P[0]]; let a = 0;
  while (a < P.length - 1) { let b = P.length - 1; while (b > a + 1 && !clear(P[a], P[b])) b--; out.push(P[b]); a = b; }
  return out;
}
/* the point on a building's outline facing q, a little out from its wall */
function edgeToward(p, q) {
  const P = IC.partOutline(p); let best = null, bd = 1e9;
  for (let i = 0; i < P.length; i++) {
    const A = P[i], B = P[(i + 1) % P.length], L2 = U.dxy(A.x, A.y, B.x, B.y) ** 2 || 1e-9, t = U.clamp(((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / L2, 0, 1);
    const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, d = U.dxy(x, y, q.x, q.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  const d = U.dist(best, q) || 1;
  return { x: best.x + (q.x - best.x) / d * 0.03, y: best.y + (q.y - best.y) / d * 0.03 };
}
/* the network for the service vehicles: every road as a polyline (closed ones end where they start) */
IC.svcNetwork = ap => IC.svcNet(ap).roads.map(r => ({ pts: polyLine(r.pts, r.closed), w: r.w, kind: r.kind }));
/* the ends of roads: joined (on another road, or at a building or pavement) or left in the grass */
IC.svcRoadEnds = function (S, ap) {
  const N = IC.svcNet(ap), out = [];
  const onRoad = (q, self) => N.roads.some(r => r !== self && polyLine(r.pts, r.closed).some((a, i, P) => i && U.segDist(q.x, q.y, P[i - 1].x, P[i - 1].y, a.x, a.y) < 0.03));
  const atThing = q => ap.parts.some(p => p.built && p.kind !== 'ils' && p.kind !== 'runway' && IC.partDist(ap, p, q) < 0.12);
  for (const r of N.roads) if (!r.closed) for (const q of [r.pts[0], r.pts[r.pts.length - 1]]) out.push({ x: q.x, y: q.y, kind: r.kind, ok: onRoad(q, r) || atThing(q) });
  return out;
};

})(window.IC);
