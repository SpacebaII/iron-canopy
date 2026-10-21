/* Iron Canopy — the models of models.js seen from above, on the 2D map. Close in, aircraft, launchers, radars and
   lorries are drawn as their own shapes at real size; farther out the map keeps its symbols. Each model is painted
   once from above into a small image per livery (its triangles, lit from the north-west, highest last), and the map
   then draws that image turned to the heading: cheap enough for a busy apron. Rotors are drawn over it, turning. */
(function (IC) {
'use strict';
const M = IC.MODELS;

const cache = new Map();
const HIDE = { gear: 1, ab: 1, win: 1, flap: 1, rotor: 1, prop: 1, spoil: 1, slat: 1, rev: 1, revc: 1 };
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
  const rotors = [], props = [];
  for (const k in me.groups) {
    const G = me.groups[k];
    if (G.kind === 'rotor' && G.axis[2]) rotors.push(G);
    // a propeller seen from above: a line across its disc (its radius from the blades)
    if (G.kind === 'prop') { let R = 0; for (let i = 0; i < G.pos.length; i += 3) R = Math.max(R, Math.hypot(G.pos[i + 1] - G.pivot[1], G.pos[i + 2] - G.pivot[2])); props.push({ x: G.pivot[0], y: G.pivot[1], R }); }
  }
  sp = { cv, sil, s, ox, oy, rotors, props, tint: {} };
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
  // propellers: turning, a grey blur across the disc with a blade flicking through it; parked, one blade at rest
  for (const r of sp.props) {
    const cx = r.x * sp.s, cy = r.y * sp.s, R = r.R * sp.s, w = Math.max(0.35 * sp.s, px * 0.8);
    if (o.now) { g.fillStyle = 'rgba(40,44,48,0.28)'; g.fillRect(cx - w / 2, cy - R, w, 2 * R); const b = Math.cos(o.now * 47 + r.y) * R; g.fillStyle = 'rgba(20,22,24,0.7)'; g.fillRect(cx - w / 2, cy - Math.abs(b), w, 2 * Math.abs(b)); }
    else { const b = R * 0.8; g.fillStyle = 'rgba(20,22,24,0.85)'; g.fillRect(cx - w / 2, cy - b, w, 2 * b); }
  }
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
  for (const r of sp.props) { g.fillStyle = 'rgba(20,22,24,0.85)'; g.fillRect(sp.ox + r.x * sp.s - 0.2 * sp.s, sp.oy + (r.y - r.R * 0.8) * sp.s, 0.4 * sp.s, 1.6 * r.R * sp.s); }
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

/* ---------- life on the ground (civil.js says what stands where) ----------
   A light-aircraft field close in: the club's buildings, its aircraft in a row (covered ones tied down, three pegs
   each), the helicopter pad, the bowser, pilots walking out. The business side of an airport: jets, a visitor and
   the town's light aircraft on the free stands. */
IC.drawFieldLife = function (g, S, f, px) {
  const z = IC.cam ? IC.cam.z : 1;
  if (z < 4) return;
  // the mown parking area along the strip, and the track from it to the runway
  g.save(); g.translate(f.x, f.y); g.rotate(f.a);
  g.fillStyle = 'rgba(160,190,118,0.85)'; g.fillRect(-2.2, 0.5, 3.75, 0.42); g.fillRect(-0.05, 0.15, 0.1, 0.36);
  g.restore();
  for (const o of IC.fieldLife(S, f)) {
    if (o.kind === 'person') { if (z < 20) continue; g.fillStyle = o.walk ? '#f2d14a' : '#d8dde2'; g.beginPath(); g.arc(o.x, o.y, Math.max(0.006, 1.4 * px), 0, 7); g.fill(); continue; }
    IC.modelTop(g, o.key, o.x, o.y, o.h, { livery: o.liv, minPx: o.kind === 'kit' ? 1 : 2, shadow: o.kind === 'plane' ? 0.01 : 0 });
    if (o.tie && z > 12) {
      const T = IC.ACTYPES[o.key], sp = (T ? T.span : 0.1) * 0.42, c = Math.cos(o.h), s2 = Math.sin(o.h);
      g.fillStyle = 'rgba(30,30,28,0.8)';
      for (const [a, b] of [[0, sp], [0, -sp], [-(T ? T.len : 0.08) * 0.48, 0]]) { g.beginPath(); g.arc(o.x + a * c - b * s2, o.y + a * s2 + b * c, Math.max(0.004, 0.9 * px), 0, 7); g.fill(); }
    }
  }
  // (brief 62) the field's own traffic, seen from the clubhouse rather than on radar: taxiing, the take-off and
  // landing runs, and the circuit low over the field
  if (z > 2.5) for (const t of S.threats) {
    if (t.dead || t.type !== 'ga' || t.held || t.alt > 0.4 || Math.abs(t.x - f.x) > 20 || Math.abs(t.y - f.y) > 20) continue;
    const h = Math.atan2(t.vy, t.vx), T = IC.ACTYPES[t.acType];
    IC.drawPlane(g, t.x, t.y, h, t.acType || 'light', t.livery || null, { shadow: t.alt * 6 + 0.01, minPx: 8 });
    if (z > 7 && t.cs) { g.fillStyle = 'rgba(230,240,245,0.8)'; g.font = `500 ${8 * px}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.fillText(t.cs, t.x, t.y + ((T ? T.len : 0.08) + 14 * px)); }
  }
};
IC.drawApronLife = function (g, S, ap, px) {
  const z = IC.cam ? IC.cam.z : 1;
  if (z < 2) return;
  for (const [key, liv, x, y, h] of IC.apronLife(S, ap)) IC.modelTop(g, key, x, y, h, { livery: liv, minPx: 3, shadow: 0.03 });
  if (z > 12 && IC.gaScene) drawGaScene(g, S, ap, px, z);
};
/* (brief 62) the GA ramp close in: chocks and tie-down ropes, the fuel bowser and the business jets' vehicles, the
   marshaller with the wands, pilots and passengers walking between the aircraft and the FBO */
const PERSON = { pilot: '#f2f2ea', pax: '#d8dde2', marshal: '#ff8a2a' };
function drawGaScene(g, S, ap, px, z) {
  for (const o of IC.gaScene(S, ap)) {
    const c = Math.cos(o.h), s = Math.sin(o.h);
    if (o.kind === 'chock') {
      if (z < 40) continue;
      const q = Math.max(0.006, 2.4 * px); g.fillStyle = 'rgba(214,170,40,0.95)';
      for (const sd of [-1, 1]) { const x = o.x - s * o.w * sd, y = o.y + c * o.w * sd; g.fillRect(x + c * 0.012 - q / 2, y + s * 0.012 - q / 2, q, q); g.fillRect(x - c * 0.012 - q / 2, y - s * 0.012 - q / 2, q, q); }
      continue;
    }
    if (o.kind === 'tie') {
      // a rope from each wing and the tail down to its ring in the pavement
      g.strokeStyle = 'rgba(240,236,220,0.8)'; g.lineWidth = Math.max(0.0015, 1 * px); g.fillStyle = 'rgba(30,30,28,0.9)';
      for (const [a, b, a2, b2] of [[-o.len * 0.05, o.span * 0.36, -o.len * 0.05, o.span * 0.46], [-o.len * 0.05, -o.span * 0.36, -o.len * 0.05, -o.span * 0.46], [-o.len * 0.44, 0, -o.len * 0.54, 0]]) {
        const x = o.x + a * c - b * s, y = o.y + a * s + b * c, x2 = o.x + a2 * c - b2 * s, y2 = o.y + a2 * s + b2 * c;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); g.beginPath(); g.arc(x2, y2, Math.max(0.003, 1.6 * px), 0, 7); g.fill();
      }
      continue;
    }
    if (o.kind === 'veh') { IC.modelTop(g, o.key, o.x, o.y, o.h, { minPx: 2, shadow: 0.01 }); continue; }
    if (z < 20) continue;
    const r = Math.max(0.004, 2.4 * px);
    g.fillStyle = PERSON[o.liv] || PERSON.pax; g.strokeStyle = 'rgba(20,24,28,0.8)'; g.lineWidth = Math.max(0.001, 0.8 * px);
    g.beginPath(); g.arc(o.x, o.y, r, 0, 7); g.fill(); g.stroke();
    if (o.kind === 'marshal' && z > 50) { g.strokeStyle = '#ff5a2a'; g.lineWidth = Math.max(0.002, 1 * px); const w = Math.sin(S.time * 3) * 0.6; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(o.x - s * r * sd, o.y + c * r * sd); g.lineTo(o.x - s * r * sd * 3 + Math.cos(o.h + w * sd) * r * 2, o.y + c * r * sd * 3 + Math.sin(o.h + w * sd) * r * 2); g.stroke(); } }
  }
}

})(window.IC);
