/* Iron Canopy — the towns' buildings standing up on the map (brief 65). The map is drawn from straight above, so a
   town of ten-storey blocks used to look as flat as a suburb. Close in, every building is drawn again over the
   traffic as a prism leaning back to the north (IC.LEAN of its height): its roof, the walls on its south side, a
   line at each floor on the tall ones, lit windows at night. Buildings in front hide the street behind them, so the
   traffic runs between them. Painted into tiles of their own (the terrain's levels 3 and 4), a few a frame,
   from IC.blockPrisms (buildings.js, headless). */
(function (IC) {
'use strict';
const U = IC.U;
const LV = { 3: { size: 32, ppu: 8, min: 0.06, max: 160 }, 4: { size: 8, ppu: 32, min: 0.02, max: 200 } };
const CELL = 4, FLOOR = 0.034;
const B = { tiles: new Map(), idx: null, n: -1, frame: 0 };
IC.bldTiles = B;   // (terrain.js marks them stale with its own tiles)

/* the blocks by cell, built again when the world changes */
function index(S) {
  const W = S.world, n = (S.worldDirty || []).length;
  if (B.idx && B.n === n && B.w === W) return B.idx;
  const idx = new Map();
  for (const c of W.cities) for (const b of c.blocks) {
    const r = Math.hypot(b.w, b.h) / 2 + 0.3;
    for (let i = Math.floor((b.x - r) / CELL); i <= Math.floor((b.x + r) / CELL); i++) for (let j = Math.floor((b.y - r) / CELL); j <= Math.floor((b.y + r) / CELL); j++) {
      const k = i * 65536 + j; let L = idx.get(k); if (!L) idx.set(k, L = []); L.push(b, c);
    }
  }
  if (B.w !== W) B.tiles.clear();
  B.idx = idx; B.n = n; B.w = W;
  return idx;
}

/* night as the ground gets it (render.js lays rgba(3,8,24, 0.62 × dark) over the map), in five steps */
const nightOf = light => Math.round(U.clamp(1 - light, 0, 1) * 5) / 5;
// (w: the warm light of the windows, at night, where the windows are too small to draw one by one)
const mix = (c, k, d, w) => { w = w || 0; const f = (v, n, l) => ((v * k * (1 - d) + n * d) * (1 - w) + l * w) | 0; return `rgb(${f(c[0], 3, 255)},${f(c[1], 8, 196)},${f(c[2], 24, 120)})`; };

function paint(S, lod, tx, ty, night) {
  const L = LV[lod], px = Math.round(L.size * L.ppu), x0 = tx * L.size, y0 = ty * L.size, x1 = x0 + L.size, y1 = y0 + L.size;
  const idx = index(S), K = IC.LEAN, reach = 3 * K;
  // the blocks whose buildings may show here: the tile, and a strip to the south whose tall roofs lean into it
  const seen = new Set(), P = [];
  for (let i = Math.floor(x0 / CELL) - 1; i <= Math.floor(x1 / CELL) + 1; i++) for (let j = Math.floor(y0 / CELL) - 1; j <= Math.floor((y1 + reach) / CELL) + 1; j++) {
    const Lb = idx.get(i * 65536 + j); if (!Lb) continue;
    for (let q = 0; q < Lb.length; q += 2) {
      const b = Lb[q]; if (seen.has(b)) continue; seen.add(b);
      for (const p of IC.blockPrisms(b, Lb[q + 1])) if (p.ht >= L.min && p.x1 > x0 && p.x0 < x1 && p.y1 > y0 && p.y0 - p.ht * K < y1) P.push(p);
    }
  }
  if (!P.length) return null;
  // the farthest north first, so a building's walls hide the street and the roofs behind it
  P.sort((a, b) => a.y1 - b.y1);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d');
  g.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu);
  g.lineJoin = 'round';
  const fine = lod >= 4, d = 0.62 * night, lit = night > 0.3;
  for (const p0 of P) for (let p = p0; p; p = p === p0 ? p0.kid : null) {
    const F = p.p, n = F.length / 2, dy = -p.ht * K, dz = -p.z0 * K;
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += F[i * 2] * F[j * 2 + 1] - F[j * 2] * F[i * 2 + 1]; }
    const s = A > 0 ? 1 : -1;   // (the outward normal of an edge is its direction turned a quarter, by the winding)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = F[i * 2], ay = F[i * 2 + 1], bx = F[j * 2], by = F[j * 2 + 1], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey);
      if (l < 1e-4) continue;
      const nx = ey / l * s, ny = -ex / l * s;
      if (ny <= 0.02) continue;   // a wall facing north is behind the building
      // the sun is in the north-west: walls facing south are in the building's own shade, east-facing the darkest
      g.fillStyle = mix(p.w, 0.6 - 0.14 * nx, d, fine ? 0 : 0.16 * night);
      g.beginPath(); g.moveTo(ax, ay + dz); g.lineTo(bx, by + dz); g.lineTo(bx, by + dy); g.lineTo(ax, ay + dy); g.closePath(); g.fill();
      if (p.fl && !p.z0 && (fine || p.ht > 0.3)) {
        // a band of windows on every floor (every other one at the middle level, where a floor is a pixel high)
        const st = fine ? FLOOR : FLOOR * 2;
        g.strokeStyle = `rgba(30,40,52,${0.3 * (1 - night)})`; g.lineWidth = st * K * 0.45; g.beginPath();
        for (let h = st * 0.6; h < p.ht - st * 0.4; h += st) { g.moveTo(ax, ay - h * K); g.lineTo(bx, by - h * K); }
        g.stroke();
      }
      if (lit && fine && p.ht > 0.05 && !p.z0) {
        // windows lit at night: a few on each floor, more in the evening than late at night (the hash keeps them still)
        g.fillStyle = `rgba(255,212,140,${0.45 + 0.4 * night})`;
        const ws = 0.045, wn = Math.floor(l / ws), seed = Math.round(ax * 97 + ay * 31);
        for (let h = FLOOR * 0.5; h < p.ht - FLOOR * 0.5; h += FLOOR) for (let k = 0; k < wn; k++) {
          if (U.hash(seed + k, Math.round(h * 300)) > 0.32) continue;
          const t = (k + 0.5) / wn; g.fillRect(ax + ex * t - 0.008, ay + ey * t - h * K - 0.006, 0.016, 0.012);
        }
      }
    }
    // the roof
    g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(F[i * 2], F[i * 2 + 1] + dy) : g.moveTo(F[0], F[1] + dy); g.closePath();
    g.fillStyle = mix(p.c, 1, d, 0.05 * night); g.fill();
    // (a pale parapet line round a flat roof, a dark one round a pitched roof's eaves)
    g.strokeStyle = p.r === 'pitch' || p.r === 'hip' ? 'rgba(0,0,0,0.25)' : `rgba(255,255,255,${0.22 * (1 - night)})`; g.lineWidth = fine ? 0.006 : 0.014; g.stroke();
    if (p.half) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.beginPath(); for (let i = 0; i < 8; i += 2) i ? g.lineTo(p.half[i], p.half[i + 1] + dy) : g.moveTo(p.half[0], p.half[1] + dy); g.fill(); }
  }
  return cv;
}

/* draw the buildings over the view; called by render.js after the traffic */
IC.drawBuildingsUp = function (ctx, S, cam, dpr, light, budgetMs) {
  const zx = cam.z * dpr;
  if (zx < 6 || S.flat) return;
  const lod = zx >= 16 ? 4 : 3, L = LV[lod], night = nightOf(light);
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cam.vw / cam.z, vy1 = cam.y + cam.vh / cam.z, cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2;
  const list = [];
  for (let ty = Math.floor(vy0 / L.size); ty <= Math.floor(vy1 / L.size); ty++) for (let tx = Math.floor(vx0 / L.size); tx <= Math.floor(vx1 / L.size); tx++) list.push([tx, ty, U.dxy((tx + 0.5) * L.size, (ty + 0.5) * L.size, cx, cy)]);
  list.sort((a, b) => a[2] - b[2]);
  B.frame++;
  const t0 = performance.now(), ov = 0.5 / zx;
  for (const [tx, ty] of list) {
    const key = lod + ':' + tx + ':' + ty;
    let t = B.tiles.get(key);
    if ((!t || t.dirty || t.night !== night) && performance.now() - t0 < budgetMs) {
      const cv = paint(S, lod, tx, ty, night);
      if (t) { t.cv = cv; t.dirty = false; t.night = night; } else B.tiles.set(key, t = { cv, lod, tx, ty, night, used: 0 });
    }
    if (!t) continue;
    t.used = B.frame;
    if (t.cv) ctx.drawImage(t.cv, tx * L.size - ov, ty * L.size - ov, L.size + 2 * ov, L.size + 2 * ov);
  }
  // keep the most recently used
  const mine = [...B.tiles.entries()].filter(([, t]) => t.lod === lod);
  if (mine.length > L.max) { mine.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < mine.length - L.max; i++) B.tiles.delete(mine[i][0]); }
};

})(window.IC);
