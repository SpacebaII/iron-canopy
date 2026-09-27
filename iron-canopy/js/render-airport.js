/* Iron Canopy — drawing airports at real scale: asphalt and concrete, markings, buildings, damage, lights at
   night, and every aircraft on the ground in its airline's colours. Detail fades in as the camera closes. */
(function (IC) {
'use strict';
const U = IC.U;
const ASPH = 'rgb(46,48,50)', ASPH2 = 'rgb(56,58,60)', CONC = 'rgb(118,120,118)', CONC2 = 'rgb(132,134,130)', PAINT = 'rgba(236,236,226,0.92)', YEL = 'rgba(236,196,60,0.95)';

function lbl(g, txt, x, y, px, col, size, align, weight) {
  g.font = `${weight || 600} ${(size || 10) * px}px "IBM Plex Mono", monospace`;
  g.textAlign = align || 'center';
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillText(txt, x + 0.9 * px, y + 0.9 * px);
  g.fillStyle = col; g.fillText(txt, x, y);
  g.textAlign = 'left';
}
const rect = (g, p, w, h, fill) => { g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0); g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h); g.restore(); };

/* ---------- aircraft seen from above, at their real size ---------- */
IC.drawPlane = function (g, x, y, h, type, livery, o) {
  o = o || {};
  const T = IC.ACTYPES[type] || IC.ACTYPES.narrow;
  const z = IC.cam.z;
  let L = T.len, Sp = T.span;
  // too small to see: scale up to a readable glyph
  const k = Math.max(1, (o.minPx || 7) / (L * z));
  L *= k; Sp *= k;
  const body = o.body || (T.mil ? 'rgb(150,160,168)' : 'rgb(238,240,242)');
  const c1 = livery ? livery[0] : T.mil ? 'rgb(110,120,128)' : 'rgb(80,110,150)', c2 = livery ? livery[1] : 'rgb(60,66,72)';
  g.save(); g.translate(x, y); g.rotate(h);
  g.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.shadow) { g.save(); g.translate(o.shadow, o.shadow * 0.6); g.globalAlpha *= 0.35; drawShape(g, T, type, L, Sp, 'rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)'); g.restore(); }
  drawShape(g, T, type, L, Sp, body, c1, c2);
  g.restore();
};
function drawShape(g, T, type, L, Sp, body, c1, c2) {
  const f = L * (type === 'fighter' ? 0.14 : type === 'turbo' ? 0.09 : 0.1);
  if (type === 'fighter') {
    g.fillStyle = body; g.beginPath();
    g.moveTo(L * 0.5, 0); g.lineTo(L * 0.1, -f * 0.6); g.lineTo(-L * 0.12, -Sp * 0.5); g.lineTo(-L * 0.26, -Sp * 0.5); g.lineTo(-L * 0.22, -f * 0.7);
    g.lineTo(-L * 0.42, -Sp * 0.28); g.lineTo(-L * 0.5, -Sp * 0.28); g.lineTo(-L * 0.46, 0); g.lineTo(-L * 0.5, Sp * 0.28); g.lineTo(-L * 0.42, Sp * 0.28);
    g.lineTo(-L * 0.22, f * 0.7); g.lineTo(-L * 0.26, Sp * 0.5); g.lineTo(-L * 0.12, Sp * 0.5); g.lineTo(L * 0.1, f * 0.6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(40,60,80,0.9)'; g.beginPath(); g.ellipse(L * 0.26, 0, L * 0.09, f * 0.3, 0, 0, 7); g.fill();
    return;
  }
  if (type === 'heli') {
    g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, L * 0.3, L * 0.14, 0, 0, 7); g.fill();
    g.fillRect(-L * 0.62, -L * 0.03, L * 0.4, L * 0.06);
    g.strokeStyle = 'rgba(30,34,38,0.5)'; g.lineWidth = L * 0.03; g.beginPath(); g.arc(0, 0, Sp * 0.5, 0, 7); g.stroke();
    return;
  }
  if (type === 'drone') {
    g.fillStyle = body; g.fillRect(-L * 0.5, -f * 0.7, L, f * 1.4);
    g.fillRect(-L * 0.05, -Sp * 0.5, L * 0.16, Sp);
    g.fillRect(-L * 0.5, -Sp * 0.14, L * 0.1, Sp * 0.28);
    return;
  }
  // wings
  g.fillStyle = 'rgb(196,200,204)';
  g.beginPath();
  if (type === 'turbo' || type === 'heavy') {
    g.moveTo(L * 0.1, -Sp * 0.5); g.lineTo(L * 0.1, Sp * 0.5); g.lineTo(-L * 0.04, Sp * 0.5); g.lineTo(-L * 0.04, -Sp * 0.5); g.closePath();
  } else {
    g.moveTo(L * 0.1, -f * 0.5); g.lineTo(-L * 0.14, -Sp * 0.5); g.lineTo(-L * 0.2, -Sp * 0.5); g.lineTo(-L * 0.13, -f * 0.5);
    g.lineTo(-L * 0.13, f * 0.5); g.lineTo(-L * 0.2, Sp * 0.5); g.lineTo(-L * 0.14, Sp * 0.5); g.lineTo(L * 0.1, f * 0.5); g.closePath();
  }
  g.fill();
  // tailplane
  g.beginPath();
  g.moveTo(-L * 0.36, -f * 0.4); g.lineTo(-L * 0.47, -Sp * 0.17); g.lineTo(-L * 0.5, -Sp * 0.17); g.lineTo(-L * 0.46, 0); g.lineTo(-L * 0.5, Sp * 0.17); g.lineTo(-L * 0.47, Sp * 0.17); g.lineTo(-L * 0.36, f * 0.4); g.closePath(); g.fill();
  // engines or propellers
  g.fillStyle = c2;
  const eng = type === 'cargo' || type === 'heavy' ? [0.22, 0.38] : type === 'turbo' ? [0.2] : [0.3];
  for (const e of eng) for (const s of [-1, 1]) {
    const ey = s * Sp * e, ex = type === 'turbo' || type === 'heavy' ? L * 0.1 : L * 0.1 - (Sp * e) * 0.55;
    if (type === 'turbo') { g.fillRect(ex - L * 0.1, ey - f * 0.22, L * 0.14, f * 0.44); g.fillStyle = 'rgba(40,40,40,0.35)'; g.fillRect(ex + L * 0.04, ey - Sp * 0.09, L * 0.012, Sp * 0.18); g.fillStyle = c2; }
    else g.fillRect(ex - L * 0.07, ey - f * 0.26, L * 0.11, f * 0.52);
  }
  // fuselage
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(L * 0.5, 0); g.quadraticCurveTo(L * 0.47, -f * 0.5, L * 0.38, -f * 0.5); g.lineTo(-L * 0.42, -f * 0.36); g.lineTo(-L * 0.5, -f * 0.1); g.lineTo(-L * 0.5, f * 0.1); g.lineTo(-L * 0.42, f * 0.36); g.lineTo(L * 0.38, f * 0.5); g.quadraticCurveTo(L * 0.47, f * 0.5, L * 0.5, 0);
  g.fill();
  // livery: fin and cheatline, cockpit
  g.fillStyle = c1; g.fillRect(-L * 0.5, -f * 0.12, L * 0.2, f * 0.24);
  g.fillRect(-L * 0.3, -f * 0.1, L * 0.62, f * 0.2);
  if (type === 'heavy') { g.fillStyle = 'rgb(70,76,82)'; g.beginPath(); g.ellipse(-L * 0.08, 0, L * 0.1, L * 0.1, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(30,44,60,0.85)'; g.fillRect(L * 0.42, -f * 0.28, L * 0.03, f * 0.56);
}

/* ---------- the airport ---------- */
IC.drawAirport = function (g, S, ap, px, now, light) {
  const z = IC.cam.z;
  const full = z >= 1.2, marks = z >= 4, fine = z >= 9;
  const night = light < 0.55;
  const parts = ap.parts;
  const by = k => parts.filter(p => p.kind === k);
  // the airfield: cleared, mown ground around everything built, and a perimeter fence
  const box = fieldBox(ap);
  if (box) {
    g.save(); g.translate(box.x, box.y); g.rotate(box.a);
    g.fillStyle = 'rgba(98,108,78,0.9)'; g.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
    if (z > 1.5) { g.fillStyle = 'rgba(118,128,92,0.3)'; for (let x = -box.w / 2; x < box.w / 2; x += 0.6) g.fillRect(x, -box.h / 2, 0.3, box.h); }
    if (z > 2) { g.strokeStyle = 'rgba(40,44,40,0.7)'; g.lineWidth = Math.max(0.02, 0.8 * px); g.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h); }
    g.restore();
  }
  for (const rw of by('runway')) {
    const L = IC.rwLen(rw), d = IC.rwDir(rw), c = IC.rwAt(rw, 0.5);
    rect(g, { x: c.x, y: c.y, a: Math.atan2(d.y, d.x) }, L + 3, 3.2, 'rgba(146,158,112,0.35)');
  }
  // aprons and other paved areas
  for (const p of by('apron')) drawArea(g, p, p.built ? CONC : null, px, p);
  for (const p of by('alert')) drawArea(g, p, p.built ? CONC2 : null, px, p);
  // taxiways
  for (const p of by('taxi')) drawTaxi(g, ap, p, px, z, full, marks, night);
  // runways
  for (const rw of by('runway')) drawRunway(g, S, ap, rw, px, z, marks, fine, night, now);
  // stands
  if (full) for (const p of by('apron')) if (p.built) for (const s of p.stands || []) drawStand(g, s, px, z, marks, fine);
  // buildings
  for (const p of parts) {
    if (['runway', 'taxi', 'apron'].includes(p.kind)) continue;
    drawBuilding(g, S, ap, p, px, z, full, now, night);
  }
  // aircraft parked
  if (z >= 0.8) drawParked(g, S, ap, px, z, light);
  // aircraft moving
  if (z >= 0.5) for (const m of ap.moves) {
    if (m.dead) continue;
    const air = m.phase === 'final';
    IC.drawPlane(g, m.x, m.y, m.h, m.type, m.livery || null, { shadow: air ? (m.alt || 0) * 6 : 0.04, minPx: m.mil ? 6 : 8 });
  }
  // the airport sits under the same night as everything else; its lights do not
  if (light < 1 && box) { g.save(); g.translate(box.x, box.y); g.rotate(box.a); g.fillStyle = `rgba(3,8,24,${0.62 * (1 - light)})`; g.fillRect(-box.w / 2 - 0.05, -box.h / 2 - 0.05, box.w + 0.1, box.h + 0.1); g.restore(); }
  if (night && z > 0.6) drawLights(g, ap, px, z, light, now);
  if (z >= 0.5) for (const m of ap.moves) {
    if (m.dead) continue;
    if (night && z > 3) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,60,60,0.9)'; g.beginPath(); g.arc(m.x, m.y, Math.max(0.01, 1.2 * px), 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    if (z > 5 && m.holding) lbl(g, m.holding === 'runway' ? 'HOLD' : 'WAIT', m.x, m.y - 12 * px, px, IC.C.amber, 8, 'center', 700);
    if (z > 7 && m.who) lbl(g, m.who, m.x, m.y + 14 * px, px, 'rgba(230,240,245,0.8)', 8, 'center', 500);
  }
  // construction and repairs
  for (const w of ap.works) {
    const at = w.part && w.part.x != null ? w.part : w.it && w.it.crater ? IC.rwAt(w.it.part, w.it.crater.t) : w.part && w.part.kind === 'taxi' ? ap.nodes[w.part.nodes[Math.floor(w.part.nodes.length / 2)]] : w.it && w.it.part && w.it.part.x != null ? w.it.part : ap;
    if (!at) continue;
    g.strokeStyle = IC.C.amber; g.lineWidth = 2 * px; g.beginPath(); g.arc(at.x, at.y, 9 * px, -Math.PI / 2, -Math.PI / 2 + w.prog * 6.283); g.stroke();
    if (z > 3 && Math.random() < 0.08) IC.part(S, { x: at.x + U.rand(-0.3, 0.3), y: at.y + U.rand(-0.3, 0.3), vy: -3, life: 1, size: 2, grow: 3, col: '200,180,140', a: 0.3 });
  }
  if (z < 3 && S.layers.labels) lbl(g, ap.name, ap.x, ap.y + Math.min(ap.radius, 60 * px) + 12 * px, px, IC.C.muted, 9.5);
};

/* the rectangle, aligned with the main runway, that holds everything the airport has */
function fieldBox(ap) {
  const key = ap.parts.length + ':' + ap.nodeN;
  if (ap._box && ap._boxKey === key) return ap._box;
  const a = ap.rwyA || 0, c = Math.cos(-a), s = Math.sin(-a);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = (p, m) => { const dx = p.x - ap.x, dy = p.y - ap.y, lx = dx * c - dy * s, ly = dx * s + dy * c; x0 = Math.min(x0, lx - m); x1 = Math.max(x1, lx + m); y0 = Math.min(y0, ly - m); y1 = Math.max(y1, ly + m); };
  for (const p of ap.parts) {
    if (p.kind === 'runway') { grow(p.a, 1.2); grow(p.b, 1.2); }
    else if (p.kind === 'taxi') for (const id of p.nodes) { if (ap.nodes[id]) grow(ap.nodes[id], 0.5); }
    else grow(p, Math.max(p.w || 0, p.h || 0, (p.r || 0) * 2) * 0.75 + 0.3);
  }
  if (x0 > x1) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  ap._box = { x: ap.x + cx * Math.cos(a) - cy * Math.sin(a), y: ap.y + cx * Math.sin(a) + cy * Math.cos(a), w: x1 - x0, h: y1 - y0, a };
  ap._boxKey = key;
  return ap._box;
}
function drawArea(g, p, fill, px, part) {
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  const w = p.w, h = p.h;
  if (!part.built) {
    g.strokeStyle = 'rgba(242,180,65,0.9)'; g.setLineDash([4 * px, 3 * px]); g.lineWidth = 1.2 * px; g.strokeRect(-w / 2, -h / 2, w, h); g.setLineDash([]);
    g.fillStyle = 'rgba(242,180,65,0.14)'; g.fillRect(-w / 2, -h / 2, w * (part.prog || 0), h);
  } else {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (IC.cam.z > 9) { g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.004; g.beginPath(); for (let x = -w / 2; x < w / 2; x += 0.075) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); } for (let y = -h / 2; y < h / 2; y += 0.075) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); } g.stroke(); }
  }
  g.restore();
  // hits leave scorch marks where they landed, not across the whole slab
  for (const s of part.scorch || []) {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gr.addColorStop(0, 'rgba(14,10,8,0.85)'); gr.addColorStop(0.5, 'rgba(30,22,16,0.5)'); gr.addColorStop(1, 'rgba(30,22,16,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
  }
}
function drawTaxi(g, ap, p, px, z, full, marks, night) {
  const pts = p.nodes.map(id => ap.nodes[id]).filter(Boolean);
  if (pts.length < 2) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!p.built) {
    g.strokeStyle = 'rgba(242,180,65,0.85)'; g.setLineDash([5 * px, 4 * px]); g.lineWidth = Math.max(p.w, 1.5 * px);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
    g.lineCap = 'butt'; return;
  }
  g.strokeStyle = ASPH2; g.lineWidth = Math.max(p.w + 0.08, 1.2 * px);
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.stroke();
  g.strokeStyle = ASPH; g.lineWidth = Math.max(p.w, 1 * px); g.stroke();
  if (marks) { g.strokeStyle = YEL; g.lineWidth = Math.max(0.015, 0.9 * px); g.stroke(); }
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  // cut segments
  for (const i in p.cut) {
    const a = ap.nodes[p.nodes[i - 1]], b = ap.nodes[p.nodes[i]]; if (!a || !b) continue;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    crater(g, m.x, m.y, 0.22, px);
    if (z < 6) { g.strokeStyle = IC.C.hostile; g.lineWidth = 2 * px; g.beginPath(); g.moveTo(m.x - 5 * px, m.y - 5 * px); g.lineTo(m.x + 5 * px, m.y + 5 * px); g.moveTo(m.x + 5 * px, m.y - 5 * px); g.lineTo(m.x - 5 * px, m.y + 5 * px); g.stroke(); }
  }
}
function crater(g, x, y, r, px) {
  g.fillStyle = 'rgba(70,56,44,0.95)'; g.beginPath(); g.arc(x, y, Math.max(r * 1.25, 2 * px), 0, 7); g.fill();
  g.fillStyle = 'rgba(22,16,12,0.95)'; g.beginPath(); g.arc(x, y, Math.max(r * 0.8, 1.4 * px), 0, 7); g.fill();
}
function drawRunway(g, S, ap, rw, px, z, marks, fine, night, now) {
  const L = IC.rwLen(rw), d = IC.rwDir(rw), c = IC.rwAt(rw, 0.5), a = Math.atan2(d.y, d.x);
  g.save(); g.translate(c.x, c.y); g.rotate(a);
  if (!rw.built) {
    g.strokeStyle = 'rgba(242,180,65,0.9)'; g.setLineDash([5 * px, 4 * px]); g.lineWidth = 1.4 * px; g.strokeRect(-L / 2, -rw.w / 2, L, rw.w); g.setLineDash([]);
    g.fillStyle = 'rgba(242,180,65,0.18)'; g.fillRect(-L / 2, -rw.w / 2, L * (rw.prog || 0), rw.w);
    g.restore(); return;
  }
  const W = Math.max(rw.w, 2 * px);
  g.fillStyle = 'rgba(90,94,88,0.9)'; g.fillRect(-L / 2 - 0.3, -W / 2 - 0.08, L + 0.6, W + 0.16);
  g.fillStyle = ASPH; g.fillRect(-L / 2, -W / 2, L, W);
  if (marks) {
    g.fillStyle = PAINT;
    // edge stripes
    g.fillRect(-L / 2, -rw.w / 2 + 0.01, L, 0.009); g.fillRect(-L / 2, rw.w / 2 - 0.019, L, 0.009);
    // threshold piano keys and designators
    for (const e of [-1, 1]) {
      const x0 = e * (L / 2 - 0.06);
      for (let k = 0; k < 8; k++) { const y = -rw.w / 2 + 0.035 + k * (rw.w - 0.07) / 7.5; g.fillRect(x0 - (e > 0 ? 0.3 : 0), y, 0.3, 0.018); }
      // aiming point and touchdown zone
      g.fillRect(e * (L / 2 - 4) - 0.225, -0.1, 0.45, 0.05); g.fillRect(e * (L / 2 - 4) - 0.225, 0.05, 0.45, 0.05);
      for (const t of [1.5, 3, 6, 7.5]) { g.fillRect(e * (L / 2 - t) - 0.11, -0.12, 0.22, 0.018); g.fillRect(e * (L / 2 - t) - 0.11, 0.1, 0.22, 0.018); }
    }
    // centreline
    g.fillStyle = 'rgba(236,236,226,0.8)';
    for (let x = -L / 2 + 1.2; x < L / 2 - 1.2; x += 0.5) g.fillRect(x, -0.0045, 0.3, 0.009);
    if (fine && rw.name) {
      const m = rw.name.match(/(\d\d)\/(\d\d)/);
      if (m) for (const [e, num] of [[-1, m[1]], [1, m[2]]]) { g.save(); g.translate(e * (L / 2 - 0.62), 0); g.rotate(e > 0 ? -Math.PI / 2 : Math.PI / 2); g.font = '700 0.16px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillStyle = PAINT; g.fillText(num, 0, 0.06); g.restore(); }
    }
  } else if (z > 0.8) { g.fillStyle = 'rgba(236,236,226,0.35)'; g.fillRect(-L / 2 + 0.5, -Math.max(0.01, 0.4 * px), L - 1, Math.max(0.02, 0.8 * px)); }
  g.restore();
  for (const cr of rw.craters) { const p = IC.rwAt(rw, cr.t); crater(g, p.x, p.y, cr.r, px); }
  if (rw.craters.length && z < 3) { const p = IC.rwAt(rw, rw.craters[0].t); g.strokeStyle = IC.C.hostile; g.lineWidth = 2 * px; g.beginPath(); g.arc(p.x, p.y, 7 * px, 0, 7); g.stroke(); }
}
function drawStand(g, s, px, z, marks, fine) {
  if (!marks) return;
  const S0 = IC.STAND[s.size];
  g.save(); g.translate(s.x, s.y); g.rotate(s.a);
  if (s.hp <= 0) { crater(g, 0, 0, 0.14, px); g.restore(); return; }
  g.strokeStyle = 'rgba(236,236,226,0.35)'; g.lineWidth = Math.max(0.006, 0.6 * px);
  g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w);
  g.strokeStyle = YEL; g.lineWidth = Math.max(0.01, 0.8 * px);
  g.beginPath(); g.moveTo(-S0.d / 2 - 0.08, 0); g.lineTo(S0.d * 0.35, 0); g.stroke();
  g.fillStyle = YEL; g.fillRect(S0.d * 0.35, -0.04, 0.012, 0.08);
  if (s.linked === false) { g.strokeStyle = 'rgba(255,91,79,0.8)'; g.setLineDash([3 * px, 3 * px]); g.lineWidth = 1 * px; g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.setLineDash([]); }
  g.restore();
  if (z > 22) lbl(g, s.id.split('s').pop(), s.fx, s.fy, px, 'rgba(236,196,60,0.8)', 7, 'center', 700);
}
function drawBuilding(g, S, ap, p, px, z, full, now, night) {
  const D = IC.APART[p.kind];
  const hp = p.hp / p.max, dead = hp <= 0.25;
  if (!p.built) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
    g.strokeStyle = 'rgba(242,180,65,0.9)'; g.setLineDash([4 * px, 3 * px]); g.lineWidth = 1.2 * px;
    if (p.r) { g.beginPath(); g.arc(0, 0, p.r, 0, 7); g.stroke(); } else g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
    g.setLineDash([]);
    g.fillStyle = 'rgba(242,180,65,0.2)';
    if (p.r) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, p.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * (p.prog || 0)); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w * (p.prog || 0), p.h);
    g.restore();
    return;
  }
  const col = { terminal: [176, 180, 186], cargo: [150, 140, 118], hangar: [128, 134, 140], has: [150, 146, 132], alert: [140, 140, 132], tower: [190, 190, 196], fire: [176, 70, 56], atc: [200, 204, 208], ammo: [96, 116, 84], fuel: [226, 224, 212] }[p.kind] || [150, 150, 150];
  const k = dead ? 0.3 : 0.6 + 0.4 * hp;
  const fill = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`;
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  const w = p.w || (p.r || 0.1) * 2, h = p.h || (p.r || 0.1) * 2;
  // shadow
  if (full && !dead) { g.fillStyle = 'rgba(0,0,0,0.35)'; if (p.r) { g.beginPath(); g.arc(0.03, 0.03, p.r, 0, 7); g.fill(); } else g.fillRect(-w / 2 + 0.03, -h / 2 + 0.03, w, h); }
  if (p.kind === 'fuel') {
    if (full) { g.fillStyle = 'rgba(80,84,70,0.8)'; g.fillRect(-p.r * 1.35, -p.r * 1.35, p.r * 2.7, p.r * 2.7); g.fillStyle = 'rgba(120,128,104,0.9)'; g.fillRect(-p.r * 1.25, -p.r * 1.25, p.r * 2.5, p.r * 2.5); }
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, Math.max(p.r, 1.5 * px), 0, 7); g.fill();
    if (full && !dead) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.008; g.beginPath(); g.arc(0, 0, p.r * 0.7, 0, 7); g.stroke(); g.fillStyle = `rgba(90,110,130,${0.5 * (1 - (p.stock || 0) / D.cap)})`; g.beginPath(); g.arc(0, 0, p.r * 0.3, 0, 7); g.fill(); }
  } else if (p.kind === 'has') {
    g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); g.fill();
    if (full && !dead) { g.fillStyle = 'rgba(40,40,36,0.8)'; g.fillRect(-w * 0.25, (p.doorSide || -1) * h / 2 - 0.01, w * 0.5, 0.02); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(-w * 0.1, -h * 0.1, w * 0.3, h * 0.25, 0, 0, 7); g.fill(); }
  } else if (p.kind === 'hangar') {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead) { g.fillStyle = 'rgba(255,255,255,0.1)'; for (let x = -w / 2; x < w / 2; x += 0.06) g.fillRect(x, -h / 2, 0.02, h); g.fillStyle = 'rgba(30,34,38,0.9)'; g.fillRect(-w * 0.45, (p.doorSide || -1) * h / 2 - 0.012, w * 0.9, 0.024); }
  } else if (p.kind === 'tower') {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead) { g.fillStyle = 'rgba(40,70,90,0.95)'; g.beginPath(); g.arc(0, 0, w * 0.34, 0, 7); g.fill(); g.fillStyle = night ? 'rgba(170,230,255,0.9)' : 'rgba(150,200,220,0.6)'; g.beginPath(); g.arc(0, 0, w * 0.22, 0, 7); g.fill(); }
  } else if (p.kind === 'atc') {
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, Math.max(w / 2, 1.5 * px), 0, 7); g.fill();
    if (!dead && full) { const a = now * 1.3; g.strokeStyle = 'rgba(30,34,40,0.9)'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-Math.cos(a) * w * 0.8, -Math.sin(a) * w * 0.8); g.lineTo(Math.cos(a) * w * 0.8, Math.sin(a) * w * 0.8); g.stroke(); }
  } else {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead && (p.kind === 'terminal' || p.kind === 'cargo')) {
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-w / 2, -h / 2, w, h * 0.3);
      g.fillStyle = night ? 'rgba(255,220,150,0.55)' : 'rgba(60,90,110,0.5)';
      for (let x = -w / 2 + 0.05; x < w / 2 - 0.05; x += 0.12) g.fillRect(x, -h / 2 - 0.004, 0.08, 0.012), g.fillRect(x, h / 2 - 0.008, 0.08, 0.012);
    }
    if (full && !dead && p.kind === 'fire') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-w * 0.08, -h * 0.3, w * 0.16, h * 0.6); g.fillRect(-w * 0.25, -h * 0.08, w * 0.5, h * 0.16); }
    if (full && !dead && p.kind === 'ammo') { g.fillStyle = 'rgba(60,80,52,0.9)'; for (let i = -1; i <= 1; i++) g.fillRect(i * w * 0.3 - w * 0.12, -h * 0.35, w * 0.24, h * 0.7); }
    if (full && !dead && p.kind === 'alert') { g.fillStyle = 'rgba(96,98,94,0.95)'; g.fillRect(-w * 0.3, -h * 0.35, w * 0.6, h * 0.7); }
  }
  // damage
  if (dead) {
    g.fillStyle = 'rgba(24,18,14,0.85)'; if (p.r) { g.beginPath(); g.arc(0, 0, p.r * 1.1, 0, 7); g.fill(); } else g.fillRect(-w / 2, -h / 2, w, h);
    if (full) { g.fillStyle = 'rgba(110,96,80,0.9)'; for (let i = 0; i < 6; i++) { const hx = U.hash(i, p.x * 100 | 0) - 0.5, hy = U.hash(p.y * 100 | 0, i) - 0.5; g.fillRect(hx * w * 0.8, hy * h * 0.8, w * 0.12, h * 0.1); } }
  } else if (hp < 0.6 && full) { g.fillStyle = 'rgba(20,14,10,0.5)'; g.beginPath(); g.arc(w * 0.15, -h * 0.1, Math.min(w, h) * 0.35, 0, 7); g.fill(); }
  if (hp < 0.5 && z > 0.8 && z < 6) { g.strokeStyle = dead ? IC.C.hostile : IC.C.amber; g.lineWidth = 1.2 * px; if (p.r) { g.beginPath(); g.arc(0, 0, p.r + 3 * px, 0, 7); g.stroke(); } else g.strokeRect(-w / 2 - 2 * px, -h / 2 - 2 * px, w + 4 * px, h + 4 * px); }
  g.restore();
  if (p.linked === false && (p.kind === 'hangar' || p.kind === 'has' || p.kind === 'alert') && z > 2) lbl(g, 'NO TAXIWAY', p.x, p.y - (h / 2) - 6 * px, px, IC.C.amber, 7.5, 'center', 700);
}
function drawLights(g, ap, px, z, light, now) {
  const k = U.clamp((0.55 - light) / 0.4, 0, 1);
  g.globalCompositeOperation = 'lighter';
  const dot = (x, y, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(r, 1.1 * px), 0, 7); g.fill(); };
  for (const rw of ap.parts.filter(p => p.kind === 'runway' && p.built)) {
    const L = IC.rwLen(rw), d = IC.rwDir(rw), n = { x: -d.y, y: d.x };
    const step = z > 3 ? 0.6 : 1.8;
    for (let s = 0; s <= L; s += step) {
      const p = IC.rwAt(rw, s / L);
      for (const e of [-1, 1]) dot(p.x + n.x * e * rw.w / 2, p.y + n.y * e * rw.w / 2, `rgba(255,244,220,${0.8 * k})`, 0.02);
    }
    // thresholds green, ends red, approach lights
    for (const [t, sgn] of [[0, -1], [1, 1]]) {
      const p = IC.rwAt(rw, t);
      for (let i = -3; i <= 3; i++) dot(p.x + n.x * i * rw.w / 7, p.y + n.y * i * rw.w / 7, `rgba(90,255,140,${0.9 * k})`, 0.025);
      for (let s = 0.6; s < 9; s += 0.6) { const q = { x: p.x + d.x * sgn * s, y: p.y + d.y * sgn * s }; const fl = (now * 2 + s * 0.1) % 1 < 0.08 ? 1.6 : 1; dot(q.x, q.y, `rgba(255,250,230,${0.7 * k * fl})`, 0.03); }
    }
  }
  if (z > 1.5) for (const p of ap.parts.filter(q => q.kind === 'taxi' && q.built)) {
    for (let i = 1; i < p.nodes.length; i++) {
      const a = ap.nodes[p.nodes[i - 1]], b = ap.nodes[p.nodes[i]]; if (!a || !b) continue;
      const L = U.dist(a, b), nx = -(b.y - a.y) / (L || 1), ny = (b.x - a.x) / (L || 1);
      for (let s = 0; s <= L; s += z > 4 ? 0.3 : 0.9) { const x = a.x + (b.x - a.x) * s / L, y = a.y + (b.y - a.y) * s / L; dot(x + nx * 0.13, y + ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); dot(x - nx * 0.13, y - ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); }
    }
  }
  for (const p of ap.parts.filter(q => (q.kind === 'apron' || q.kind === 'terminal') && q.built && q.hp > q.max * 0.25)) {
    const r = Math.max(p.w, p.h) * 0.7, gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255,214,150,${0.16 * k})`); gr.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}
function drawParked(g, S, ap, px, z, light) {
  const tails = S.av ? S.av.tailById || (S.av.tailById = new Map()) : null;
  if (tails && S.av.tailMapT !== S.time) { tails.clear(); for (const t of S.av.tails) tails.set(t.id, t); S.av.tailMapT = S.time; }
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
    if (!s.occ) continue;
    const t = tails && tails.get(s.occ);
    if (!t || t.where !== 'stand') continue;
    const al = IC.avAirline(S, t.al);
    IC.drawPlane(g, s.x, s.y, s.a, t.type, al ? al.livery : null, { shadow: 0.03, minPx: 7 });
    // turnaround: service vehicles
    if (z > 8 && t.t > 0) { g.fillStyle = 'rgba(242,200,60,0.95)'; const c = Math.cos(s.a), sn = Math.sin(s.a); g.fillRect(s.x - sn * 0.12 - 0.02, s.y + c * 0.12 - 0.012, 0.04, 0.024); g.fillStyle = 'rgba(230,230,230,0.95)'; g.fillRect(s.x + sn * 0.1 - 0.025, s.y - c * 0.1 - 0.012, 0.05, 0.024); }
  }
  // the air wing
  for (const r of S.roster) {
    if (r.base !== ap.id || r.st === 'lost' || r.st === 'air') continue;
    const pp = IC.parkPos(S, ap, r);
    const type = IC.AIRKIND_TYPE[r.kind];
    const n = r.n || 1;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (IC.ACTYPES[type].span * 1.3);
      const h = pp.a != null ? pp.a : ap.rwyA;
      const x = pp.x - Math.sin(h) * off, y = pp.y + Math.cos(h) * off;
      IC.drawPlane(g, x, y, h, type, null, { alpha: pp.inside ? 0.35 : 1, shadow: pp.inside ? 0 : 0.02, minPx: 6, body: r.st === 'turn' ? 'rgb(200,170,110)' : null });
    }
  }
}

/* ---------- the builder: what is about to be placed ---------- */
IC.drawBuildGhost = function (g, S, px) {
  const m = S.mode2, hv = S.hover;
  if (!m || m.kind !== 'build' || !hv) return;
  const ap = m.ap, D = IC.APART[m.part];
  const tol = Math.max(0.12, 8 * px);
  const snap = IC.aptSnap(ap, hv, tol);
  const col = 'rgba(111,210,255,0.9)';
  g.lineWidth = 1.5 * px;
  // snap marker
  const mark = s => { g.strokeStyle = s.kind === 'free' ? 'rgba(200,210,220,0.7)' : s.kind === 'rwy' ? 'rgba(255,240,200,0.95)' : IC.C.ok; g.beginPath(); g.arc(s.x, s.y, 5 * px, 0, 7); g.stroke(); };
  if (m.part === 'taxi' || m.part === 'runway') {
    const pts = (m.pts || []).concat([snap]);
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = Math.max(D.w, 2 * px); g.globalAlpha = 0.6;
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.globalAlpha = 1; g.lineCap = 'butt';
    for (const p of pts) mark(p);
    let len = 0; for (let i = 1; i < pts.length; i++) len += U.dist(pts[i - 1], pts[i]);
    if (pts.length > 1) {
      const txt = `${U.km(len)} · ${U.money(D.cost * len)}${m.part === 'runway' ? ' · ' + runwayFits(len) : ''}`;
      lbl(g, txt, snap.x, snap.y - 12 * px, px, IC.C.text, 9.5, 'center', 600);
    }
    if (snap.kind !== 'free') lbl(g, { node: 'joins', rwy: 'onto runway', taxi: 'joins taxiway', apron: 'joins apron' }[snap.kind], snap.x, snap.y + 16 * px, px, IC.C.ok, 8.5, 'center', 600);
    return;
  }
  // areas and buildings
  const a = m.rot != null ? m.rot : ap.rwyA || 0;
  let w = D.w || (D.r || 0.1) * 2, h = D.h || (D.r || 0.1) * 2;
  if (D.area) { if (m.drag) { const l = IC.rectLocal({ x: m.drag.x, y: m.drag.y, a }, hv); w = Math.max(0.3, Math.abs(l.x)); h = Math.max(0.3, Math.abs(l.y)); } else { w = m.w || 1.5; h = m.h || 0.95; } }
  const c = m.drag && D.area ? IC.rectWorld({ x: m.drag.x, y: m.drag.y, a }, (IC.rectLocal({ x: m.drag.x, y: m.drag.y, a }, hv).x) / 2, (IC.rectLocal({ x: m.drag.x, y: m.drag.y, a }, hv).y) / 2) : hv;
  const part = { kind: m.part, x: c.x, y: c.y, a, w, h, r: D.r };
  const ok = IC.aptCanPlace(S, ap, part);
  g.save(); g.translate(c.x, c.y); g.rotate(a);
  g.strokeStyle = ok ? col : IC.C.hostile; g.fillStyle = ok ? 'rgba(111,210,255,0.18)' : 'rgba(255,91,79,0.2)';
  if (D.r) { g.beginPath(); g.arc(0, 0, D.r, 0, 7); g.fill(); g.stroke(); } else { g.fillRect(-w / 2, -h / 2, w, h); g.strokeRect(-w / 2, -h / 2, w, h); }
  g.restore();
  const meas = D.area ? w * h : 1;
  let extra = '';
  if (m.part === 'apron') { const dep = h * 0.64; const sz = dep >= 0.8 ? 'large' : dep >= 0.5 ? 'medium' : dep >= 0.36 ? 'small' : null; const S0 = sz ? IC.STAND[sz[0]] : null; extra = sz ? ` · ${Math.floor(w / S0.w)} ${sz} stands` : ' · too shallow for stands'; }
  if (m.part === 'terminal') extra = ` · ${Math.round(D.pax * w * h).toLocaleString('en-US')} pax/h`;
  if (m.part === 'fuel') { const near = ap.parts.filter(p => p.kind === 'fuel' && U.dist(p, c) < 1.4).length; if (near) extra = ` · ${near} tank${near > 1 ? 's' : ''} within 140 m`; }
  lbl(g, `${D.name} · ${U.money(D.cost * meas)}${extra}`, c.x, c.y - Math.max(h, D.r || 0) / 2 - 10 * px, px, ok ? IC.C.text : IC.C.hostile, 9.5, 'center', 600);
};
function runwayFits(len) {
  const t = Object.entries(IC.ACTYPES).filter(([k, T]) => !T.mil && T.rwy <= len).map(([k, T]) => T.short);
  return t.length ? 'fits ' + t.join(', ') : 'too short for airliners';
}

})(window.IC);
