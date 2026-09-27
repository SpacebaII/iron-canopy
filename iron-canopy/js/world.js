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

let edgeMap = null, edgeW = null;
function edgeBetween(a, b) {
  if (edgeW !== IC.W) { edgeW = IC.W; edgeMap = {}; for (const e of IC.W.edges) { edgeMap[e.a + '|' + e.b] = e; edgeMap[e.b + '|' + e.a] = e; } }
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

/* a bridge was destroyed or repaired: re-plan the road network */
IC.bridgeChanged = function (S) {
  const blocked = new Set(S.infra.filter(i => i.kind === 'bridge' && i.offline).map(i => i.edge));
  IC.buildRouting(S.world, blocked);
  for (const v of S.vehicles) if (v.route && v.dest) v.route = IC.route(v.x, v.y, v.dest.x, v.dest.y);
};

})(window.IC);
