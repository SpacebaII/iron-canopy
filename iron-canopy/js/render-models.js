/* Iron Canopy — the models of models.js seen from above, on the 2D map. Close in, aircraft, launchers, radars and
   lorries are drawn as their own shapes at real size; farther out the map keeps its symbols. */
(function (IC) {
'use strict';
const U = IC.U, P = IC.MODEL_PAL;
const M = IC.MODELS;

/* a cylinder's or cone's length, diameter and axis, whichever way the part wrote them */
const cylDims = p => { const o = p[8] || {}, axis = o.axis || 'x'; return { axis, len: axis === 'z' ? (o.len || p[6]) : p[4], dia: p[5] }; };
IC.modelCyl = cylDims;

/* parts sorted so what is higher is drawn later (the painter's order from above) */
function ordered(m) {
  if (m._top) return m._top;
  const top = p => p[0] === 'fin' ? Math.max(...p[8].pts.map(q => q[1])) : p[0] === 'poly' || p[0] === 'disc' ? p[3] + 0.01 : p[3] + (p[6] || p[5] || 0) / 2;
  return m._top = m.parts.slice().sort((a, b) => top(a) - top(b));
}
const darker = (hex, k) => { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) * k | 0, g = ((n >> 8) & 255) * k | 0, b = (n & 255) * k | 0; return `rgb(${r},${g},${b})`; };
const colCache = new Map();
function colOf(c, o) {
  if (c === 'BODY') return o.body || P.civil;
  if (c === 'L1') return o.livery ? o.livery[0] : o.body ? o.body : P.steel;
  if (c === 'L2') return o.livery ? o.livery[1] : P.dark;
  return c;
}

/* one part's footprint, in metres, in the model's frame */
function footprint(g, p, col, o) {
  const [shape, x, y, z, sx, sy, sz] = p, op = p[8] || {};
  const pitch = op.pitch || 0, yaw = op.yaw || 0;
  g.fillStyle = col;
  if (shape === 'poly') { const pts = op.pts; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); return; }
  if (shape === 'fin') { const xs = op.pts.map(q => q[0]); const x0 = Math.min(...xs), x1 = Math.max(...xs); g.fillStyle = darker(col, 0.8); g.fillRect(x0, y - sy / 2, x1 - x0, sy); return; }
  if (shape === 'disc') {
    const d = cylDims(p);
    if (d.axis === 'x') { g.fillRect(x - 0.08, y - sy / 2, 0.16, sy); return; }
    if (d.axis === 'y') { g.fillRect(x - sy / 2, y - 0.08, sy, 0.16); return; }
    g.save(); g.globalAlpha *= 0.28; g.beginPath(); g.arc(x, y, sy / 2, 0, 7); g.fill(); g.restore();
    const a = o.now ? o.now * 30 : 0.6; g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-sy / 2, -sy * 0.02, sy, sy * 0.04); g.rotate(Math.PI / 2); g.fillRect(-sy / 2, -sy * 0.02, sy, sy * 0.04); g.restore();
    return;
  }
  if (shape === 'sphere') { g.beginPath(); g.ellipse(x, y, sx / 2, sy / 2, 0, 0, 7); g.fill(); return; }
  if (shape === 'cone') {
    const d = cylDims(p);
    if (d.axis === 'z') { g.beginPath(); g.arc(x, y, d.dia / 2, 0, 7); g.fill(); return; }
    const k = op.flip ? -1 : 1, L = d.len * Math.cos(pitch);
    g.beginPath(); g.moveTo(x + k * L / 2, y); g.lineTo(x - k * L / 2, y - d.dia / 2); g.lineTo(x - k * L / 2, y + d.dia / 2); g.closePath(); g.fill(); return;
  }
  if (shape === 'cyl') {
    const d = cylDims(p);
    if (d.axis === 'z') { g.beginPath(); g.arc(x, y, d.dia / 2, 0, 7); g.fill(); return; }
    if (yaw) { g.save(); g.translate(x, y); g.rotate(yaw); g.fillRect(-d.len / 2, -d.dia / 2, d.len, d.dia); g.restore(); return; }
    const L = d.len * Math.abs(Math.cos(pitch)) + d.dia * Math.abs(Math.sin(pitch));
    if (d.axis === 'y') g.fillRect(x - d.dia / 2, y - d.len / 2, d.dia, d.len); else g.fillRect(x - L / 2, y - d.dia / 2, L, d.dia);
    return;
  }
  // box
  const L = sx * Math.abs(Math.cos(pitch)) + sz * Math.abs(Math.sin(pitch));
  if (yaw) { g.save(); g.translate(x, y); g.rotate(yaw); g.fillRect(-L / 2, -sy / 2, L, sy); g.restore(); }
  else g.fillRect(x - L / 2, y - sy / 2, L, sy);
}

/* draw model `key` at world (x, y) heading h. o: livery [c1, c2], body colour, minPx (never smaller on screen),
   alpha, shadow (offset in world units), outline colour, now (seconds, turns rotors), scale */
IC.modelTop = function (g, key, x, y, h, o) {
  const m = M[key]; if (!m) return false;
  o = o || {};
  const z = IC.cam ? IC.cam.z : 1;
  const Lw = IC.modelSize(key) / 100;
  const k = Math.max(1, (o.minPx || 7) / (Lw * z)) * (o.scale || 1), s = k / 100;
  const parts = ordered(m);
  g.save();
  if (o.alpha != null) g.globalAlpha = o.alpha;
  if (o.shadow) {
    g.save(); g.translate(x + o.shadow, y + o.shadow * 0.6); g.rotate(h); g.scale(s, s); g.globalAlpha *= 0.35;
    for (const p of parts) if (p[0] !== 'disc') footprint(g, p, '#000', o);
    g.restore();
  }
  g.translate(x, y); g.rotate(h); g.scale(s, s);
  // an outline reads at small sizes: the whole footprint a little bigger, in a dark tone
  const pxM = 1 / (z * s);   // metres per screen pixel
  if (Lw * z * k > 10) { g.save(); g.translate(0.6 * pxM, 0.6 * pxM); for (const p of parts) if (p[0] !== 'disc') footprint(g, p, o.outline || 'rgba(0,0,0,0.55)', o); g.restore(); }
  for (const p of parts) footprint(g, p, colOf(p[7], o), o);
  g.restore();
  return true;
};

/* a model drawn into its own canvas, for galleries and badges: w × h pixels, fitted with a margin */
IC.modelTopCanvas = function (key, w, h, o) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const m = M[key]; if (!m) return c;
  const size = IC.modelSize(key), s = Math.min(w, h) * 0.82 / size;
  const parts = ordered(m);
  g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.scale(s, s);
  g.save(); g.translate(size * 0.02, size * 0.02); g.globalAlpha = 0.35; for (const p of parts) if (p[0] !== 'disc') footprint(g, p, '#000', o || {}); g.restore();
  g.save(); g.translate(0.8 / s, 0.8 / s); for (const p of parts) if (p[0] !== 'disc') footprint(g, p, 'rgba(0,0,0,0.6)', o || {}); g.restore();
  for (const p of parts) footprint(g, p, colOf(p[7], o || {}), o || {});
  return c;
};

})(window.IC);
