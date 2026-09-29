/* Iron Canopy — the models of models.js seen from above, on the 2D map. Close in, aircraft, launchers, radars and
   lorries are drawn as their own shapes at real size; farther out the map keeps its symbols. Each model is painted
   once from above into a small image per livery (its triangles, lit from the north-west, highest last), and the map
   then draws that image turned to the heading: cheap enough for a busy apron. Rotors are drawn over it, turning. */
(function (IC) {
'use strict';
const M = IC.MODELS;

const cache = new Map();
const HIDE = { gear: 1, ab: 1, win: 1, flap: 1, rotor: 1 };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, (n >> 16) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`; };
/* the model painted from above: { cv, s (pixels a metre), ox, oy (the origin in the image), sil (its silhouette) } */
function sprite(key, livery, body) {
  const ck = key + '|' + (livery ? livery.join() : '') + '|' + (body || '');
  let sp = cache.get(ck); if (sp) return sp;
  const me = IC.modelMesh(key, 1), b = me.box, cols = IC.liveryCols(livery, body);
  const s = Math.min(10, 300 / Math.max(1, b[3] - b[0], b[4] - b[1])), pad = 2;
  const cv = document.createElement('canvas'); cv.width = Math.ceil((b[3] - b[0]) * s) + pad * 2; cv.height = Math.ceil((b[4] - b[1]) * s) + pad * 2;
  const ox = pad - b[0] * s, oy = pad - b[1] * s, g = cv.getContext('2d');
  // every upward-facing triangle, lowest first, lit from the north-west (the map's light)
  const tris = [], L = [-0.35, -0.45, 0.82];
  for (const k in me.groups) {
    const G = me.groups[k]; if (HIDE[G.kind]) continue;
    const p = G.pos, n = G.nor;
    for (let i = 0; i < p.length; i += 9) {
      const nz = (n[i + 2] + n[i + 5] + n[i + 8]) / 3; if (nz < -0.05) continue;
      const nx = (n[i] + n[i + 3] + n[i + 6]) / 3, ny = (n[i + 1] + n[i + 4] + n[i + 7]) / 3;
      const c = me.slots[G.col[i / 3]], hex = cols[c] || c, k2 = 0.62 + 0.5 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      tris.push([Math.max(p[i + 2], p[i + 5], p[i + 8]) + (p[i + 2] + p[i + 5] + p[i + 8]) / 3, p[i], p[i + 1], p[i + 3], p[i + 4], p[i + 6], p[i + 7], shade(hex, k2)]);
    }
  }
  tris.sort((a, c) => a[0] - c[0]);
  g.lineJoin = 'round'; g.lineWidth = 0.6;
  for (const t of tris) { g.fillStyle = g.strokeStyle = t[7]; g.beginPath(); g.moveTo(ox + t[1] * s, oy + t[2] * s); g.lineTo(ox + t[3] * s, oy + t[4] * s); g.lineTo(ox + t[5] * s, oy + t[6] * s); g.closePath(); g.fill(); g.stroke(); }
  const sil = document.createElement('canvas'); sil.width = cv.width; sil.height = cv.height;
  const sg = sil.getContext('2d'); sg.drawImage(cv, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, sil.width, sil.height);
  const rotors = [];
  for (const k in me.groups) if (me.groups[k].kind === 'rotor' && me.groups[k].axis[2]) rotors.push(me.groups[k]);
  sp = { cv, sil, s, ox, oy, rotors, tint: {} };
  cache.set(ck, sp);
  return sp;
}
IC.modelSprite = sprite;
function tint(sp, col) {
  let c = sp.tint[col]; if (c) return c;
  c = document.createElement('canvas'); c.width = sp.sil.width; c.height = sp.sil.height;
  const g = c.getContext('2d'); g.drawImage(sp.sil, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return (sp.tint[col] = c);
}

/* draw model `key` at world (x, y) heading h. o: livery [c1, c2], body colour, minPx (never smaller on screen),
   alpha, shadow (offset in world units), outline colour, now (seconds, turns rotors), scale */
IC.modelTop = function (g, key, x, y, h, o) {
  if (!M[key]) return false;
  o = o || {};
  const z = IC.cam ? IC.cam.z : 1;
  const Lw = IC.modelSize(key) / 100;
  const k = Math.max(1, (o.minPx || 7) / (Lw * z)) * (o.scale || 1), sc = k / 100;   // world units a metre
  const sp = sprite(key, o.livery, o.body), q = sc / sp.s;                           // world units an image pixel
  g.save();
  if (o.alpha != null) g.globalAlpha = o.alpha;
  if (o.shadow) { g.save(); g.translate(x + o.shadow, y + o.shadow * 0.6); g.rotate(h); g.scale(q, q); g.globalAlpha *= 0.35; g.drawImage(sp.sil, -sp.ox, -sp.oy); g.restore(); }
  g.translate(x, y); g.rotate(h); g.scale(q, q);
  // an outline reads at small sizes: the silhouette a pixel down and right in a dark tone, or all round in the
  // colour asked for (an unidentified track's)
  const px = 1 / (z * q);
  if (o.outline) { const im = tint(sp, o.outline); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(im, -sp.ox + dx * px * 1.2, -sp.oy + dy * px * 1.2); }
  else if (Lw * z * k > 10) { g.save(); g.globalAlpha *= 0.55; g.drawImage(sp.sil, -sp.ox + px * 0.6, -sp.oy + px * 0.6); g.restore(); }
  g.drawImage(sp.cv, -sp.ox, -sp.oy);
  // rotors: a faint disc and two blades turning
  for (const r of sp.rotors) {
    const cx = r.pivot[0] * sp.s, cy = r.pivot[1] * sp.s, R = r.R * sp.s;
    g.fillStyle = 'rgba(30,34,38,0.22)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    const a = o.now ? o.now * 30 * (r.rpm || 1) : 0.6;
    g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = 'rgba(40,44,48,0.8)'; g.fillRect(-R, -R * 0.03, 2 * R, R * 0.06); g.rotate(Math.PI / 2); g.fillRect(-R, -R * 0.03, 2 * R, R * 0.06); g.restore();
  }
  g.restore();
  return true;
};

/* a model drawn into its own canvas, for galleries and badges: w × h pixels, nose up, fitted with a margin */
IC.modelTopCanvas = function (key, w, h, o) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  if (!M[key]) return c;
  o = o || {};
  const g = c.getContext('2d'), sp = sprite(key, o.livery, o.body);
  const k = Math.min(w, h) * 0.86 / Math.max(sp.cv.width, sp.cv.height);
  g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.scale(k, k);
  g.translate(-sp.cv.width / 2, -sp.cv.height / 2);
  g.globalAlpha = 0.35; g.drawImage(sp.sil, 2 / k, 2 / k); g.globalAlpha = 1;
  g.drawImage(sp.cv, 0, 0);
  for (const r of sp.rotors) { g.fillStyle = 'rgba(30,34,38,0.25)'; g.beginPath(); g.arc(sp.ox + r.pivot[0] * sp.s, sp.oy + r.pivot[1] * sp.s, r.R * sp.s, 0, 7); g.fill(); }
  return c;
};

/* the model from above and from the side, each inside a dashed box of the real thing's size (length × span, length
   × height), for the gallery: does the model keep the proportions of what it stands for */
IC.modelRefCanvas = function (key, w, h, o) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const d = M[key]; if (!d) return c;
  o = o || {};
  const g = c.getContext('2d'), me = IC.modelMesh(key, 1), b = me.box, cols = IC.liveryCols(o.livery, o.body);
  const L = d.len, Sp = d.span, H = d.h || (b[5] - b[2]), half = w / 2, pad = 18;
  const k = Math.min((half - pad * 1.5) / Math.max(L, Sp * 0.2), (h - pad * 2) / Math.max(Sp, H, 1));
  // from above: the painted image, nose to the right
  const sp = sprite(key, o.livery, o.body), cx = half / 2, cy = h / 2 - 4;
  g.save(); g.translate(cx, cy); g.scale(k / sp.s, k / sp.s); g.drawImage(sp.cv, -sp.ox, -sp.oy); g.restore();
  // from the side: the triangles facing the viewer, shaded, the lowest first
  const tris = [];
  for (const n in me.groups) { const G = me.groups[n]; if (HIDE[G.kind] && G.kind !== 'gear' && G.kind !== 'rotor') continue; const p = G.pos, q = G.nor; for (let i = 0; i < p.length; i += 9) { const ny = (q[i + 1] + q[i + 4] + q[i + 7]) / 3; if (ny < -0.05) continue; const s2 = me.slots[G.col[i / 3]], hex = cols[s2] || s2; tris.push([(p[i + 1] + p[i + 4] + p[i + 7]) / 3, p[i], p[i + 2], p[i + 3], p[i + 5], p[i + 6], p[i + 8], shade(hex, 0.6 + 0.45 * Math.max(0, ny))]); } }
  tris.sort((a, e) => a[0] - e[0]);
  const sx = half + half / 2, sy = h / 2 + 10 + (H * k) / 2 - 4;
  g.lineWidth = 0.5;
  for (const t of tris) { g.fillStyle = g.strokeStyle = t[7]; g.beginPath(); g.moveTo(sx + t[1] * k, sy - t[2] * k); g.lineTo(sx + t[3] * k, sy - t[4] * k); g.lineTo(sx + t[5] * k, sy - t[6] * k); g.closePath(); g.fill(); g.stroke(); }
  // the real sizes
  g.setLineDash([4, 3]); g.strokeStyle = 'rgba(242,209,74,0.85)'; g.lineWidth = 1;
  g.strokeRect(cx - L * k / 2, cy - Sp * k / 2, L * k, Sp * k);
  g.strokeRect(sx - L * k / 2, sy - H * k, L * k, H * k);
  g.setLineDash([]); g.fillStyle = 'rgba(242,209,74,0.95)'; g.font = '11px monospace'; g.textAlign = 'center';
  g.fillText(`${L.toFixed(1)} × ${Sp.toFixed(1)} m`, cx, h - 3); g.fillText(`height ${H.toFixed(1)} m`, sx, h - 3);
  return c;
};

})(window.IC);
