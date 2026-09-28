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
// a map square: 26 columns (A–Z) across the map, rows of the same size down it
IC.gridRef = (x, y) => { const G = IC.WW / 26; return `${String.fromCharCode(65 + U.clamp(Math.floor(x / G), 0, 25))}${U.clamp(Math.floor(y / G), 0, 98) + 1}`; };

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
/* cheapest road path between two node indices (Dijkstra with a binary heap, stopping at the goal): the edges in
   order from i, or null if there is no way */
let rq = null;
function roadPath(W, i, j) {
  const n = W.roadIds.length, adj = W.roadAdj;
  if (!rq || rq.d.length < n) rq = { d: new Float64Array(n), via: new Array(n), from: new Int32Array(n), seen: new Uint32Array(n), gen: 0, hk: [], hv: [] };
  const Q = rq, d = Q.d, seen = Q.seen, gen = ++Q.gen, hk = Q.hk, hv = Q.hv;
  let m = 0;
  const push = (k, v) => { let c = m++; while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= k) break; hk[c] = hk[p]; hv[c] = hv[p]; c = p; } hk[c] = k; hv[c] = v; };
  d[i] = 0; seen[i] = gen; Q.from[i] = -1; push(0, i);
  while (m) {
    const k = hk[0], a = hv[0], lk = hk[--m], lv = hv[m];
    let c = 0; for (;;) { let q = 2 * c + 1; if (q >= m) break; if (q + 1 < m && hk[q + 1] < hk[q]) q++; if (hk[q] >= lk) break; hk[c] = hk[q]; hv[c] = hv[q]; c = q; }
    hk[c] = lk; hv[c] = lv;
    if (k > d[a]) continue;
    if (a === j) break;
    const L = adj[a];
    for (let q = 0; q < L.length; q += 3) {
      const b = L[q], v = k + L[q + 1];
      if (seen[b] === gen && v >= d[b]) continue;
      seen[b] = gen; d[b] = v; Q.from[b] = a; Q.via[b] = L[q + 2]; push(v, b);
    }
  }
  if (seen[j] !== gen) return null;
  const out = []; for (let c = j; c !== i; c = Q.from[c]) out.push(Q.via[c]);
  return { cost: d[j], edges: out.reverse() };
}
IC.roadPath = (W, a, b) => roadPath(W, W.roadIdx[a], W.roadIdx[b]);
/* Route along the road network. Returns [{x,y,road}] — road=true means the segment ending here is paved.
   Lorries (roads=true) keep to the roads however far round they go; other vehicles cut across country when
   that is shorter. */
IC.route = function (ax, ay, bx, by, roads) {
  const W = IC.W, N = W.nodes;
  const na = nearestNode(ax, ay), nb = nearestNode(bx, by);
  const P = na === nb ? null : roadPath(W, W.roadIdx[na], W.roadIdx[nb]);
  const direct = U.dxy(ax, ay, bx, by) * 2.2;
  const via = P && (U.dxy(ax, ay, N[na].x, N[na].y) + U.dxy(bx, by, N[nb].x, N[nb].y)) * 2.2 + P.cost;
  if (!P || (direct <= via && !roads)) return [{ x: bx, y: by, road: false }];
  const pts = [{ x: N[na].x, y: N[na].y, road: false }];
  let at = na;
  for (const e of P.edges) {
    const seq = e.a === at ? e.pts : e.pts.slice().reverse();
    // a blown bridge means a slow detour to the nearest ford
    const slow = W.blocked && W.blocked.has(e.id);
    for (let s = 1; s < seq.length; s++) pts.push({ x: seq[s].x, y: seq[s].y, road: !slow, cls: e.cls, cut: slow ? e.id : 0 });
    at = e.a === at ? e.b : e.a;
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
  for (const v of S.vehicles) if (v.route && v.dest) v.route = IC.route(v.x, v.y, v.dest.x, v.dest.y, v.kind === 'truck');
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
IC.travelPath = function (T, to) { const L = []; let k = to; for (let g = 0; g < 5000 && T.via[k]; g++) { const e = T.via[k]; L.push(e); k = e.a === k ? e.b : e.a; } return L; };

})(window.IC);
