/* Iron Canopy — world queries over the generated map (IC.W): countries, roads, routing. */
(function (IC) {
'use strict';
const U = IC.U;

IC.countryAt = (x, y) => IC.W.countryAt(x, y);
IC.inHome = (x, y) => IC.W.inHome(x, y);
IC.inHostile = (x, y) => IC.W.inHostile(x, y);
IC.inLake = (x, y) => IC.W.inLake(x, y);
IC.hostileBorderDist = (x, y) => IC.W.hostileBorderDist(x, y);
IC.borderDist = (x, y) => -IC.W.depthOut(x, y);
IC.gridRef = (x, y) => `${String.fromCharCode(65 + U.clamp(Math.floor(x / 500), 0, 25))}${U.clamp(Math.floor(y / 500), 0, 99) + 1}`;

let edgeMap = null, edgeW = null, edgeN = 0;
function edgeBetween(a, b) {
  // rebuilt when the world changes or roads are added or split
  if (edgeW !== IC.W || edgeN !== IC.W.edges.length) { edgeW = IC.W; edgeN = IC.W.edges.length; edgeMap = {}; for (const e of IC.W.edges) { edgeMap[e.a + '|' + e.b] = e; edgeMap[e.b + '|' + e.a] = e; } }
  return edgeMap[a + '|' + b];
}
IC.edgeBetween = edgeBetween;
function nearestNode(x, y) {
  const W = IC.W; let best = null, bd = 1e12;
  for (const k of W.roadIds) { const n = W.nodes[k], d = U.dxy(x, y, n.x, n.y); if (d < bd) { bd = d; best = k; } }
  return best;
}
/* Route along the road network. Returns [{x,y,road}] — road=true means the segment ending here is paved. */
IC.route = function (ax, ay, bx, by) {
  const W = IC.W, N = W.nodes;
  const na = nearestNode(ax, ay), nb = nearestNode(bx, by);
  const i = W.roadIdx[na], j = W.roadIdx[nb];
  const road = W.roadD[i][j];
  const direct = U.dxy(ax, ay, bx, by) * 2.2;
  const via = (U.dxy(ax, ay, N[na].x, N[na].y) + U.dxy(bx, by, N[nb].x, N[nb].y)) * 2.2 + road;
  if (na === nb || road > 1e11 || direct <= via) return [{ x: bx, y: by, road: false }];
  const pts = [{ x: N[na].x, y: N[na].y, road: false }];
  let k = i;
  for (let guard = 0; k !== j && guard < 300; guard++) {
    const nk = W.roadNX[k][j]; if (nk < 0) break;
    const e = edgeBetween(W.roadIds[k], W.roadIds[nk]);
    const seq = e.a === W.roadIds[k] ? e.pts : e.pts.slice().reverse();
    // a blown bridge means a slow detour to the nearest ford
    const slow = W.blocked && W.blocked.has(e.id);
    for (let s = 1; s < seq.length; s++) pts.push({ x: seq[s].x, y: seq[s].y, road: !slow });
    k = nk;
  }
  pts.push({ x: bx, y: by, road: false });
  return pts;
};
/* Advance an entity along its route. Returns true on arrival. */
IC.followRoute = function (e, dt, vRoad, vOff) {
  let left = dt;
  while (left > 0 && e.route && e.route.length) {
    const p = e.route[0], v = p.road ? vRoad : vOff;
    const dx = p.x - e.x, dy = p.y - e.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) { e.route.shift(); continue; }
    e.h = Math.atan2(dy, dx);
    const step = v * left;
    if (step >= L) { e.x = p.x; e.y = p.y; left -= L / v; e.route.shift(); }
    else { e.x += dx / L * step; e.y += dy / L * step; left = 0; }
  }
  return !e.route || !e.route.length;
};
IC.routeLength = r => { let s = 0; for (let i = 1; i < r.length; i++) s += U.dist(r[i - 1], r[i]); return s; };
IC.routeTime = (from, r, vr, vo) => { let t = 0, p = from; for (const q of r) { t += U.dist(p, q) / (q.road ? vr : vo); p = q; } return t; };

/* world data changed (roads built or cut, blocks added or emptied): whoever draws the world redraws what lies in
   the box {x0, y0, x1, y1}; until then the boxes wait in S.worldDirty */
IC.worldChanged = function (S, box) { (S.worldDirty = S.worldDirty || []).push(box); };

/* a bridge fell or was repaired, a road was cut or reopened, or a new road opened: re-plan the road network.
   Convoys and brigades re-route; trade, growth and airport catchments re-read the travel times. */
IC.roadsChanged = function (S) {
  const W = S.world;
  const blocked = new Set(S.infra.filter(i => i.kind === 'bridge' && i.offline).map(i => i.edge));
  for (const e of W.edges) if (e.cut) blocked.add(e.id);
  IC.buildRouting(W, blocked);
  edgeW = null;
  for (const v of S.vehicles) if (v.route && v.dest) v.route = IC.route(v.x, v.y, v.dest.x, v.dest.y);
  if (S.econ) S.econ.roadsDirty = true;
};
IC.bridgeChanged = IC.roadsChanged;

/* ---------- travel times by road, at the level of places (not cars) ---------- */
IC.ROAD_KMH = { hw: 100, rd: 75, lc: 55, sp: 40 };
IC.CUT_SLOW = 6;     // a cut road or a fallen bridge: a detour on farm tracks and fords, six times slower
IC.OFFROAD_KMH = 25; // from the nearest road to a place off the network
// seconds to drive an edge (1 unit = 100 m)
IC.edgeTime = (e, cut) => e.len * 360 / IC.ROAD_KMH[e.cls] * (cut ? IC.CUT_SLOW : 1);
let adjW = null, adjN = -1, adj = null;
function adjacency(W) {
  if (adjW === W && adjN === W.edges.length) return adj;
  adjW = W; adjN = W.edges.length; adj = {};
  for (const e of W.edges) { (adj[e.a] = adj[e.a] || []).push([e.b, e]); (adj[e.b] = adj[e.b] || []).push([e.a, e]); }
  return adj;
}
/* Dijkstra from one node. cut(e) says whether an edge is cut; with intact=true every road counts as open.
   Returns { t: {node: seconds}, via: {node: edge used to arrive} } */
IC.travelFrom = function (W, from, intact) {
  const A = adjacency(W), t = {}, via = {}, done = new Set();
  const heap = [[0, from]]; t[from] = 0;
  const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop();
    if (done.has(k)) continue;
    done.add(k);
    for (const [n, e] of A[k] || []) {
      const v = d + IC.edgeTime(e, !intact && (e.cut || (W.blocked && W.blocked.has(e.id))));
      if (v < (t[n] == null ? Infinity : t[n])) { t[n] = v; via[n] = e; push(v, n); }
    }
  }
  return { t, via };
};
/* the nearest road node to a point, and the off-road time to reach it */
IC.nodeNear = function (W, x, y) {
  let best = null, bd = 1e12;
  for (const k in W.nodes) { const n = W.nodes[k], d = U.dxy(x, y, n.x, n.y); if (d < bd) { bd = d; best = k; } }
  return { id: best, t: bd * 360 / IC.OFFROAD_KMH };
};
/* the edges crossed on the way from a Dijkstra source to a node (last first) */
IC.travelPath = function (T, to) { const L = []; let k = to; for (let g = 0; g < 400 && T.via[k]; g++) { const e = T.via[k]; L.push(e); k = e.a === k ? e.b : e.a; } return L; };

/* world data changed inside a box { x0, y0, x1, y1 } (blocks, roads, nodes): record it, and the drawing redraws
   that box (terrain.js). Tasks that change the world call this; they never draw. */
IC.worldChanged = function (S, box) { (S.worldDirty = S.worldDirty || []).push(box); };

})(window.IC);
