/* Iron Canopy — drawing supply: convoys on the road. Moved out of render.js so supply drawing can change on its
   own. */
(function (IC) {
'use strict';
const cam = IC.cam, C = IC.C;
let g = null;
const inView = (x, y, m) => x > cam.x - m && x < cam.x + cam.vw / cam.z + m && y > cam.y - m && y < cam.y + cam.vh / cam.z + m;
function brackets(x, y, r, px, col) {
  const l = Math.min(r * 0.5, 7 * px);
  g.strokeStyle = col || C.amber; g.lineWidth = 1.8 * px; g.beginPath();
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(x + a * r, y + b * (r - l)); g.lineTo(x + a * r, y + b * r); g.lineTo(x + a * (r - l), y + b * r); }
  g.stroke();
}
function column(x, y, h, n, px, col, ink) {
  const c = Math.cos(h || 0), s = Math.sin(h || 0);
  const k = Math.max(1, Math.min(2.2, cam.z * 2.5));
  for (let i = 0; i < n; i++) {
    const ox = x - c * i * 10 * px * k, oy = y - s * i * 10 * px * k;
    g.save(); g.translate(ox, oy); g.rotate(h || 0); g.scale(k, k);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-4 * px + px, -2.5 * px + px, 8 * px, 5 * px);
    g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = 0.9 * px;
    g.fillRect(-4 * px, -2.5 * px, 8 * px, 5 * px); g.strokeRect(-4 * px, -2.5 * px, 8 * px, 5 * px);
    g.fillStyle = ink; g.fillRect(2.2 * px, -2.5 * px, 1.8 * px, 5 * px);
    g.restore();
  }
}
IC.drawConvoys = function (ctx, S, px) {
  g = ctx;
  for (const v of S.vehicles) {
    if (v.state === 'idle' && cam.z < 0.4) continue;
    // trucks parked at an airport or factory sit out of the way when zoomed in
    if (v.state === 'idle' && v.home && v.home.parts && cam.z > 1.2) continue;
    if (!inView(v.x, v.y, 40)) continue;
    column(v.x, v.y, v.h, v.trucks, px, v.job ? C.supply : '#a08a5c', '#1b1307');
    const sel = S.sel && S.sel.ref === v;
    if (v.job && (cam.z > 0.18 || sel)) {
      const txt = `${v.job.short} ${v.job.qty}${v.job.kind === 'ground' ? '' : '×' + v.job.mun}`;
      g.font = `700 ${8.5 * px}px "IBM Plex Mono", monospace`;
      const w = g.measureText(txt).width + 7 * px;
      g.fillStyle = 'rgba(30,22,8,0.88)'; g.fillRect(v.x - w / 2, v.y - 19 * px, w, 12 * px);
      g.fillStyle = C.supply; g.textAlign = 'center'; g.fillText(txt, v.x, v.y - 10 * px); g.textAlign = 'left';
    }
    if (sel) {
      brackets(v.x, v.y, 15 * px, px);
      if (v.route) { g.strokeStyle = 'rgba(224,180,88,0.6)'; g.setLineDash([4 * px, 4 * px]); g.lineWidth = 1.2 * px; g.beginPath(); g.moveTo(v.x, v.y); for (const p of v.route) g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]); }
    }
  }
};

})(window.IC);
