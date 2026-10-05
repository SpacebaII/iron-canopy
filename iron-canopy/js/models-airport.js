/* Iron Canopy — airport buildings drawn as outlines, in 3D (brief 39): terminals and concourses, cargo sheds, hangars
   and support buildings extruded from their real outlines (cut into convex pieces, so an L-shaped terminal keeps its
   shape), with the roofs that are looks only: the tent roof's white peaks on their masts, a garage's top deck, the
   saucer on crossed arches. Passenger bridges ride at their clearance over the taxiway; people movers on a viaduct
   on piers. Built once into the airport's mesh by replay3d.js (aptBuildings), in metres about the airport's middle;
   nothing here runs per frame. */
(function (IC) {
'use strict';

/* a prism from an outline in local metres [[x, y], ...], from z0 up h */
function prism(MB, B, P, z0, h, col) {
  for (const piece of IC.convexPieces(P.map(q => ({ x: q[0], y: q[1] })))) MB.plate(B, piece.map(q => [q.x, q.y]), z0 + h / 2, h, col);
}
const rectP = p => { const w = (p.w || 0.1) * 50, h = (p.h || 0.1) * 50; return [[-w, -h], [w, -h], [w, h], [-w, h]]; };
const HEIGHT = { terminal: 16, cargo: 14, hangar: 20, support: 9, fire: 9, tower: 40, skybridge: 5 };
const COL = { terminal: '#c8ccd0', cargo: '#a89e86', hangar: '#8a9096', support: '#a6a8a8', fire: '#b04638', tower: '#c4c6cc', skybridge: '#d6d8dc' };

/* the massing of one part; false leaves it to replay3d.js's own boxes (parts without an outline) */
IC.aptMass3d = function (MB, B, p, b) {
  if (p.kind === 'people') { mover(MB, B, p, b); return true; }
  if (!p.poly && p.kind !== 'skybridge') return false;
  // (the tower and fire stations keep replay3d.js's own models, sized to their outline's rectangle)
  if (p.kind === 'tower' || p.kind === 'fire' || (!HEIGHT[p.kind] && !p.roof)) return false;
  const x = (p.x - b.x) * 100, y = (p.y - b.y) * 100, a = p.a || 0, ca = Math.cos(a), sa = Math.sin(a);
  const P = p.poly ? p.poly.map(q => [q[0] * 100, q[1] * 100]) : rectP(p);
  const lv = p.lvls ? p.lvls * 4.2 : HEIGHT[p.kind] || 9, col = COL[p.kind] || COL.support;
  B.with(q => [x + q[0] * ca - q[1] * sa, y + q[0] * sa + q[1] * ca, q[2]], () => {
    if (p.hp <= 0) { prism(MB, B, P, 0, 2.4, '#3a3430'); return; }
    if (p.kind === 'skybridge') {
      // the walkway at its clearance, glazed both sides; the taxiway runs under it
      const z = p.clear || 14;
      prism(MB, B, P, z, 1.2, '#b8bcc0'); B.group('win', { kind: 'win' }); prism(MB, B, P, z + 1.2, 3, 'WIN'); B.group('main'); prism(MB, B, P, z + 4.2, 0.8, col);
      return;
    }
    if (p.roof === 'saucer') { saucer(MB, B, p); return; }
    if (p.roof === 'deck') { prism(MB, B, P, 0, lv, '#9a9a96'); prism(MB, B, P, lv, 1.1, '#8a8a86'); return; }
    // walls, a glass band on terminals, then the roof
    if (p.kind === 'terminal') { prism(MB, B, P, 0, 3, '#9ea4aa'); B.group('win', { kind: 'win' }); prism(MB, B, P, 3, lv - 5, 'WIN'); B.group('main'); prism(MB, B, P, lv - 2, 2, col); }
    else prism(MB, B, P, 0, lv, col);
    if (p.roof === 'tent') tent(MB, B, p, lv);
    else if (p.roof === 'glass') { B.group('win', { kind: 'win' }); prism(MB, B, P, lv, 0.6, 'WIN'); B.group('main'); }
    else prism(MB, B, P, lv, 0.8, '#9ea4aa');
  });
  return true;
};
/* the tent roof: rows of white peaks, each a cone of fabric on its mast (the same rows as the map draws) */
function tent(MB, B, p, z) {
  const W = p.w * 100, H = p.h * 100, long = W >= H, L = long ? W : H, D = long ? H : W;
  const rows = p.rows || (D > 90 ? 2 : 1), n = p.peaks || Math.max(2, Math.round(L / 55)), dx = L / n, r = Math.min(dx, D / rows) * 0.62;
  const inside = IC.partOutline ? IC.partShape(null, Object.assign({}, p, { x: 0, y: 0, a: 0 })) : null;
  for (let k = 0; k < rows; k++) for (let i = 0; i < n; i++) {
    const u = -L / 2 + dx * (i + 0.5), v = rows === 1 ? 0 : (k - (rows - 1) / 2) * D / rows, lx = long ? u : v, ly = long ? v : u;
    if (inside && IC.shapeDist(inside, { x: lx / 100, y: ly / 100 }) > 0) continue;
    // (the peak rises about 1.6 times its radius: Denver's masts stand some 20 m over the roof deck)
    const h = Math.min(28, r * 1.6);
    MB.lathe(B, [[0, r], [h * 0.4, r * 0.62], [h * 0.8, r * 0.22], [h, 0.3]], '#f4f4ee', { axis: 'z', at: [lx, ly, z], segs: 10, cap0: '#e6e6e0' });
    MB.cyl(B, [lx, ly, z + h * 1.1], h * 0.3, 0.25, '#8a8e94', 'z', { segs: 4 });
  }
}
/* the saucer on four crossed parabolic legs: two arches over the middle, the round restaurant under them */
function saucer(MB, B, p) {
  const W = p.w * 100, H = p.h * 100, R = Math.min(W, H) / 2;
  for (const t of [0.2, Math.PI / 2 + 0.2]) {
    const cx = Math.cos(t), cy = Math.sin(t), span = Math.max(W, H) * 0.5, top = 41;
    // (each arch is a chain of boxes laid along the parabola, each tilted to its slope)
    for (let i = 0; i < 12; i++) {
      const s0 = -1 + i / 6, s1 = s0 + 1 / 6, z0 = top * (1 - s0 * s0), z1 = top * (1 - s1 * s1), m = (s0 + s1) / 2;
      const run = (s1 - s0) * span, rise = z1 - z0, len = Math.hypot(run, rise) + 1;
      MB.box(B, cx * m * span, cy * m * span, (z0 + z1) / 2, len, 3, 3, '#e8e6de', { yaw: t, pitch: Math.atan2(rise, run) });
    }
  }
  MB.lathe(B, [[14, R * 0.2], [15, R * 0.42], [19, R * 0.42], [20, R * 0.2]], '#eeeeea', { axis: 'z', segs: 16, cap0: '#e2e2de', cap1: '#e2e2de' });
  MB.cyl(B, [0, 0, 7], 14, R * 0.08, '#dcdcd8', 'z', { segs: 8 });
}
/* a people mover on its viaduct: the deck 8 m up on piers every 30 m (underground: nothing to see) */
function mover(MB, B, p, b) {
  if ((p.lv || 0) < 0 || !p.pts) return;
  const P = p.pts.map(q => [(q.x - b.x) * 100, (q.y - b.y) * 100]);
  B.with(q => q, () => {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], c = P[i], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.5) continue;
      const yaw = Math.atan2(c[1] - a[1], c[0] - a[0]);
      MB.box(B, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 8.5, L + 1, 8, 1.4, '#c8c8c4', { yaw });
      for (let s = 0; s < L; s += 30) MB.box(B, a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L, 4, 1.6, 1.6, 8, '#b0b0ac');
    }
  });
}

})(window.IC);
