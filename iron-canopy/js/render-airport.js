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
/* pavement by material: fresh asphalt is near black, concrete lighter, grass is grass */
const PAVE_COL = { grass: 'rgb(86,110,62)', asph: 'rgb(38,40,42)', conc: 'rgb(70,72,70)', rconc: 'rgb(82,86,88)' };
const PAVE_COL2 = { grass: 'rgb(96,120,70)', asph: 'rgb(50,52,54)', conc: 'rgb(84,86,84)', rconc: 'rgb(96,100,102)' };
const DIRT = 'rgba(122,94,62,0.9)', DIRT2 = 'rgba(96,74,50,0.9)', STAKE = 'rgba(242,180,65,0.95)';
const paveCol = p => PAVE_COL[IC.paveOf(p)], paveCol2 = p => PAVE_COL2[IC.paveOf(p)];
const ZONE_FILL = { civil: CONC, cargo: 'rgb(128,120,104)', light: 'rgb(112,122,128)', mil: 'rgb(104,112,96)' };
const ROLE_COL = { arr: 'rgba(127,232,176,0.95)', dep: 'rgba(128,224,255,0.95)', mixed: 'rgba(236,236,226,0.95)' };
const ROLE_TXT = { arr: 'ARR', dep: 'DEP', mixed: 'ARR/DEP' };
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
  // the model catalogue draws the real shape; the old outline stays as the fallback
  if (IC.modelTop && IC.modelTop(g, IC.modelOfType(type), x, y, h, { livery, body: o.body, minPx: o.minPx || 7, alpha: o.alpha, shadow: o.shadow })) return;
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
  // the airfield's grass is part of the terrain (terrain.js); here only the perimeter fence
  const box = fieldBox(ap);
  if (box) {
    g.save(); g.translate(box.x, box.y); g.rotate(box.a);
    if (z > 2) { g.strokeStyle = 'rgba(40,44,40,0.7)'; g.lineWidth = Math.max(0.02, 0.8 * px); g.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h); }
    g.restore();
  }
  // inside the fence the ground is mown grass: no trees or crops on an airfield, stripes where the mowers went
  if (box && z > 2) drawField(g, box, px, z);
  for (const rw of by('runway')) {
    const L = IC.rwLen(rw), d = IC.rwDir(rw), c = IC.rwAt(rw, 0.5);
    rect(g, { x: c.x, y: c.y, a: Math.atan2(d.y, d.x) }, L + 3, 3.2, 'rgba(146,158,112,0.35)');
  }
  // paved surrounds: terminals and sheds stand on a forecourt that meets the apron, hangars open onto a ramp
  if (full) for (const p of parts) if ((p.kind === 'terminal' || p.kind === 'cargo') && p.x != null) rect(g, p, p.w + 0.3, p.h + 0.3, p.built ? CONC : 'rgba(120,110,90,0.4)');
  // painted surfaces, under everything else
  for (const p of by('surface')) drawSurface(g, p, px, z);
  // the landside: kerb roads, car parks, garages, hotels, offices, warehouses (landside.js)
  if (ap.land && ap.land.items && z > 1.2) drawLandside(g, S, ap, px, z, night);
  // aprons and other paved areas, tinted by zone
  for (const p of by('apron')) drawArea(g, p, p.built ? ZONE_FILL[IC.partZone(ap, p)] || CONC : null, px, p);
  for (const p of by('alert')) drawArea(g, p, p.built ? CONC2 : null, px, p);
  // fillets: where taxiways meet each other, a runway or an apron, the pavement widens so the wheels stay on it
  if (full) drawFillets(g, ap, px);
  // taxiways
  for (const p of by('taxi')) drawTaxi(g, ap, p, px, z, full, marks, night);
  // runways
  for (const rw of by('runway')) drawRunway(g, S, ap, rw, px, z, marks, fine, night, now);
  if (z > 2.5) for (const p of by('apron')) if (p.built && ap.kind !== 'airbase') { const zn = IC.partZone(ap, p); if (zn !== 'civil') lbl(g, IC.ZONES[zn].short, p.x, p.y + 3 * px, px, 'rgba(236,236,226,0.55)', 8, 'center', 700); }
  // stands
  if (full) for (const p of by('apron')) if (p.built) for (const s of p.stands || []) drawStand(g, s, px, z, marks, fine);
  // service roads from buildings to the pavement they face
  if (z > 1.5) { g.lineCap = 'round'; for (const p of parts) if (p.link && p.built) { g.strokeStyle = 'rgb(88,90,88)'; g.lineWidth = Math.max(0.07, 1.2 * px); g.beginPath(); g.moveTo(p.link[0].x, p.link[0].y); g.lineTo(p.link[1].x, p.link[1].y); g.stroke(); } g.lineCap = 'butt'; }
  // buildings
  for (const p of parts) {
    if (['runway', 'taxi', 'apron', 'surface'].includes(p.kind)) continue;
    drawBuilding(g, S, ap, p, px, z, full, now, night);
  }
  // what each building is, in small letters at the middle zoom (one label for a cluster of fuel tanks)
  if (z > 9 && z < 90 && S.layers.labels) {
    const done = [];
    for (const p of parts) {
      const t = BLD_TAG[p.kind]; if (!t || !p.built || p.x == null) continue;
      if (done.some(q => q.t === t && U.dist(q, p) < 2)) continue;
      done.push({ t, x: p.x, y: p.y });
      lbl(g, t, p.x, p.y - Math.max(p.h || 0, (p.r || 0) * 2) / 2 - 5 * px, px, 'rgba(236,236,226,0.75)', 7.5, 'center', 700);
    }
  }
  // aircraft parked
  if (z >= 0.8) drawParked(g, S, ap, px, z, light);
  // aircraft moving
  if (z >= 0.5) for (const m of ap.moves) {
    if (m.dead) continue;
    const air = m.phase === 'final';
    IC.drawPlane(g, m.x, m.y, m.h, m.type, m.livery || null, { shadow: air ? (m.alt || 0) * 6 : 0.04, minPx: m.mil ? 6 : 8 });
    // a tug at the nose: pushing back, or towing to and from the hangar
    if (z > 5 && (m.phase === 'push' || m.kind === 'tow')) { const L = m.T.len * 0.5 + 0.03; veh(g, m.x + Math.cos(m.h) * L, m.y + Math.sin(m.h) * L, m.h, 0.06, 0.03, 'rgb(236,196,60)', px); }
  }
  // the airport sits under the same night as everything else; its lights do not
  if (light < 1 && box) { g.save(); g.translate(box.x, box.y); g.rotate(box.a); g.fillStyle = `rgba(3,8,24,${0.62 * (1 - light)})`; g.fillRect(-box.w / 2 - 0.05, -box.h / 2 - 0.05, box.w + 0.1, box.h + 0.1); g.restore(); }
  if (night && z > 0.6) drawLights(g, ap, px, z, light, now);
  // stop bars at the hold-short lines: red until the tower lets the aircraft on, then green lights lead it on
  if (z > 2.5) drawStopBars(g, ap, px, z, light);
  // which way each runway is in use, and for what (above the night, it is information)
  if (z > 0.35) drawConfig(g, S, ap, px, z);
  const tags = [];
  if (z >= 0.5) for (const m of ap.moves) {
    if (m.dead) continue;
    if (night && z > 3) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,60,60,0.9)'; g.beginPath(); g.arc(m.x, m.y, Math.max(0.01, 1.2 * px), 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    // why it waits, in a few words: "holding: arrival 5 km out"
    // one tag where aircraft stand nose to tail: the first one's
    const free = !tags.some(t => Math.abs(t.x - m.x) < 70 * px && Math.abs(t.y - m.y) < 14 * px);
    if (z > 5 && m.holding && (m.holding !== 'queue' || z > 24) && free && tags.push(m)) lbl(g, m.holding === 'runway' ? `holding: ${m.holdWhy || 'runway in use'}` : m.holding === 'lined' ? `lined up, waiting: ${m.holdWhy || ''}` : 'in queue', m.x, m.y - 12 * px, px, m.holding === 'queue' ? 'rgba(236,196,60,0.7)' : IC.C.amber, m.holding === 'queue' ? 7.5 : 8.5, 'center', 700);
    if (z > 7 && m.who) lbl(g, m.who, m.x, m.y + 14 * px, px, 'rgba(230,240,245,0.8)', 8, 'center', 500);
  }
  // construction: crews and machines on site, lorries on the road in
  if (z > 0.25) drawConvoys(g, S, ap, px, z);
  // only jobs a crew is on: the rest of the queue is just its outline
  for (const w of ap.works) if (w.stages && z > 1.5 && w.wait !== 'queued: every crew is busy') drawCrew(g, S, ap, w, px, now);
  // repairs
  for (const w of ap.works) {
    if (w.stages) continue;
    const at = w.part && w.part.x != null ? w.part : w.it && w.it.crater ? IC.rwAt(w.it.part, w.it.crater.t) : w.part && w.part.kind === 'taxi' ? ap.nodes[w.part.nodes[Math.floor(w.part.nodes.length / 2)]] : w.it && w.it.part && w.it.part.x != null ? w.it.part : ap;
    if (!at) continue;
    g.strokeStyle = IC.C.amber; g.lineWidth = 2 * px; g.beginPath(); g.arc(at.x, at.y, 9 * px, -Math.PI / 2, -Math.PI / 2 + w.prog * 6.283); g.stroke();
    if (z > 3 && Math.random() < 0.08) IC.part(S, { x: at.x + U.rand(-0.3, 0.3), y: at.y + U.rand(-0.3, 0.3), vy: -3, life: 1, size: 2, grow: 3, col: '200,180,140', a: 0.3 });
  }
  if (z < 3 && S.layers.labels) lbl(g, ap.name, ap.x, ap.y + Math.min(ap.radius, 60 * px) + 12 * px, px, IC.C.muted, 9.5);
};

/* stop bars: a row of red lights across the taxiway at every hold-short line; when an aircraft is cleared onto the
   runway, the bar goes out and green lead-on lights show it the way to the centreline */
function holdBars(ap) {
  const G = IC.aptGraph(ap);
  if (ap._bars && ap._barsV === G.ver) return ap._bars;
  const out = [];
  for (const [, L] of G.adj) for (const e of L) {
    const B = G.N.get(e.to), A = G.N.get(e.from);
    if (e.kind !== 'taxi' || !B || !B.rw || (A && A.rw) || e.len < IC.GOPS.HOLD + 0.1) continue;
    const ux = (A.x - B.x) / e.len, uy = (A.y - B.y) / e.len, part = ap.parts.find(p => p.id === e.part);
    out.push({ key: e.key, d: e.d, rw: B.rw, x: B.x + ux * IC.GOPS.HOLD, y: B.y + uy * IC.GOPS.HOLD, bx: B.x, by: B.y, ux, uy, w: part ? part.w : 0.23 });
  }
  ap._bars = out; ap._barsV = G.ver;
  return out;
}
function drawStopBars(g, ap, px, z, light) {
  const bars = holdBars(ap); if (!bars.length) return;
  const on = new Map();
  for (const m of ap.moves) if (!m.dead && m.edgeKey && m.phase === 'taxi') on.set(m.edgeKey, m);
  const k = U.clamp((0.9 - light) / 0.5, 0.6, 1), G = IC.aptGraph(ap), night = light < 0.55;
  // lights are a few pixels wide at any zoom, with a halo at night
  const dot = (x, y, col, r, halo) => {
    const R = Math.max(r, 1.6 * px);
    if (night && halo) { g.globalCompositeOperation = 'lighter'; g.fillStyle = halo; g.beginPath(); g.arc(x, y, R * 2.6, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = col; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
  };
  for (const b of bars) {
    const m = on.get(b.key), grp = G.grp[b.rw] || b.rw;
    const cleared = m && m.locks && m.locks[grp], waiting = m && !cleared && m.holding === 'runway';
    if (cleared) {
      // lead-on lights, alternating green and yellow as they cross the runway's protected area
      for (let s = 0; s <= IC.GOPS.HOLD + 0.01; s += 0.15) dot(b.x - b.ux * s, b.y - b.uy * s, s < 0.3 ? `rgba(255,214,80,${k})` : `rgba(70,255,130,${k})`, 0.02, 'rgba(60,255,120,0.18)');
      continue;
    }
    if (z < 5 && !waiting) continue;
    // a dark housing so the bar reads by day too
    if (!night) { g.strokeStyle = 'rgba(20,20,20,0.8)'; g.lineWidth = Math.max(0.03, 3.4 * px); g.beginPath(); g.moveTo(b.x - b.uy * b.w * 0.6, b.y + b.ux * b.w * 0.6); g.lineTo(b.x + b.uy * b.w * 0.6, b.y - b.ux * b.w * 0.6); g.stroke(); }
    const n = 7, a = waiting ? 1 : 0.75;
    for (let i = 0; i < n; i++) { const f = (i / (n - 1) - 0.5) * b.w * 1.1; dot(b.x - b.uy * f, b.y + b.ux * f, `rgba(255,${waiting ? 40 : 70},30,${a * k})`, 0.018, waiting ? 'rgba(255,40,30,0.22)' : 'rgba(255,40,30,0.12)'); }
  }
  g.globalCompositeOperation = 'source-over';
}
/* departures waiting for each runway: at the hold-short line, queued behind, or lined up on it */
function depQueue(ap, rwId) {
  const G = IC.aptGraph(ap), k = G.grp[rwId] || rwId; let n = 0;
  for (const m of ap.moves) if (m.kind === 'dep' && m.plan && !m.dead && (G.grp[m.plan.rw.id] || m.plan.rw.id) === k && (m.holding || m.phase === 'hold' || m.phase === 'wait')) n++;
  return n;
}
/* the runway configuration: an arrow at the threshold of each runway in use, green for arrivals, blue for departures */
function drawConfig(g, S, ap, px, z) {
  const cfg = ap.cfg; if (!cfg) return;
  for (const rw of ap.parts) {
    const c = cfg.rw[rw.id]; if (!c || c.role === 'spare' || !rw.built) continue;
    const d = IC.rwDir(rw), dir = c.dir, th = dir > 0 ? rw.a : rw.b, col = ROLE_COL[c.role];
    const ux = d.x * dir, uy = d.y * dir, L = Math.max(1.2, 22 * px), W = Math.max(0.35, 7 * px);
    // an arrow on the approach, pointing down the runway the way it is used
    const bx = th.x - ux * (L + 0.6), by = th.y - uy * (L + 0.6), tx = th.x - ux * 0.4, ty = th.y - uy * 0.4;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(0.03, 2 * px);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
    g.beginPath(); g.moveTo(tx + ux * W * 0.2, ty + uy * W * 0.2); g.lineTo(tx - ux * W - uy * W * 0.6, ty - uy * W + ux * W * 0.6); g.lineTo(tx - ux * W + uy * W * 0.6, ty - uy * W - ux * W * 0.6); g.closePath(); g.fill();
    const q = c.role !== 'arr' ? depQueue(ap, rw.id) : 0;
    if (z > 1) lbl(g, `${c.name} ${ROLE_TXT[c.role]}${c.ils && IC.needILS(S) ? ' ILS' : ''}${q ? ` · ${q} waiting` : ''}`, bx - ux * 12 * px, by - uy * 12 * px + 3 * px, px, col, 8.5, 'center', 700);
  }
}
/* the rectangle, aligned with the main runway, that holds everything the airport has */
const fieldBox = ap => IC.aptFence(ap);
const BLD_TAG = { terminal: 'TERMINAL', cargo: 'CARGO', hangar: 'HANGAR', fuel: 'FUEL FARM', hydrant: 'HYDRANT', fuelpad: 'FUEL STAND', deice: 'DE-ICING', tower: 'TOWER', fire: 'FIRE', atc: 'APPROACH RADAR', gradar: 'GROUND RADAR', has: 'SHELTER', ammo: 'MUNITIONS' };
/* the airfield's grass: a flat mown colour over the terrain inside the fence, and mowing stripes close in */
function drawField(g, box, px, z) {
  const k = U.clamp((z - 3) / 30, 0, 1);
  g.save(); g.translate(box.x, box.y); g.rotate(box.a);
  g.fillStyle = `rgba(98,124,86,${0.25 + 0.65 * k})`; g.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
  if (z > 12) {
    // only the stripes in view
    const V = IC.rs && IC.rs.view, st = 0.3;
    let y0 = -box.h / 2, y1 = box.h / 2;
    if (V) { const c = Math.cos(-box.a), sn = Math.sin(-box.a), ys = [[V.x0, V.y0], [V.x1, V.y0], [V.x1, V.y1], [V.x0, V.y1]].map(([x, y]) => (x - box.x) * sn + (y - box.y) * c); y0 = Math.max(y0, Math.min(...ys)); y1 = Math.min(y1, Math.max(...ys)); }
    g.fillStyle = `rgba(150,170,110,${0.12 * U.clamp((z - 12) / 12, 0, 1)})`;
    for (let y = Math.floor(y0 / (2 * st)) * 2 * st; y < y1; y += 2 * st) g.fillRect(-box.w / 2, y, box.w, st);
  }
  g.restore();
}
function drawArea(g, p, fill, px, part) {
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  const w = p.w, h = p.h;
  if (!part.built) stageRect(g, part, w, h, px, paveCol2(part));
  else {
    g.fillStyle = IC.paveOf(part) === 'asph' ? 'rgb(64,66,68)' : IC.paveOf(part) === 'grass' ? PAVE_COL.grass : fill; g.fillRect(-w / 2, -h / 2, w, h);
    // the painted edge of the apron
    if (IC.cam.z > 4) { g.strokeStyle = 'rgba(236,196,60,0.5)'; g.lineWidth = Math.max(0.006, 0.6 * px); g.strokeRect(-w / 2 + 0.02, -h / 2 + 0.02, w - 0.04, h - 0.04); }
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
function fillets(ap) {
  const key = ap.parts.length + ':' + ap.nodeN + ':' + ap.parts.filter(q => q.built).length;
  if (ap._fil && ap._filKey === key) return ap._fil;
  const deg = new Map(), mat = new Map();
  for (const q of ap.parts) if (q.kind === 'taxi' && q.built) q.nodes.forEach((id, i) => { const d = (i === 0 || i === q.nodes.length - 1) ? 1 : 2; deg.set(id, (deg.get(id) || 0) + d); mat.set(id, q); });
  const out = [];
  for (const [id, d] of deg) { const n = ap.nodes[id]; if (n && (d >= 3 || (n.on && d >= 1))) out.push({ x: n.x, y: n.y, p: mat.get(id), r: n.on && n.on.kind === 'rwy' ? 0.18 : 0.16 }); }
  ap._fil = out; ap._filKey = key;
  return out;
}
function drawFillets(g, ap, px) {
  for (const f of fillets(ap)) { g.fillStyle = paveCol2(f.p); g.beginPath(); g.arc(f.x, f.y, f.r + 0.04, 0, 7); g.fill(); g.fillStyle = paveCol(f.p); g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill(); }
}
function drawTaxi(g, ap, p, px, z, full, marks, night) {
  const pts = p.nodes.map(id => ap.nodes[id]).filter(Boolean);
  if (pts.length < 2) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!p.built) { stageLine(g, pts, p.w, p, px); g.lineCap = 'butt'; g.lineJoin = 'miter'; return; }
  g.strokeStyle = paveCol2(p); g.lineWidth = Math.max(p.w + 0.08, 1.2 * px);
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.stroke();
  g.strokeStyle = p.shut ? 'rgb(90,80,60)' : paveCol(p); g.lineWidth = Math.max(p.w, 1 * px); g.stroke();
  if (marks) { g.strokeStyle = YEL; g.lineWidth = Math.max(0.015, 0.9 * px); g.stroke(); }
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  if (marks) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = U.dist(a, b); if (L < 0.05) continue;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    // hold-short lines 75 m before a runway
    for (const [n, sg] of [[a, 1], [b, -1]]) {
      if (!(n.on && n.on.kind === 'rwy') || L < IC.GOPS.HOLD + 0.1) continue;
      const hx = n.x + ux * sg * IC.GOPS.HOLD, hy = n.y + uy * sg * IC.GOPS.HOLD;
      g.strokeStyle = YEL; g.lineWidth = Math.max(0.008, 0.7 * px);
      for (const o of [0, 0.03]) { g.beginPath(); g.moveTo(hx + ux * sg * o - uy * p.w / 2, hy + uy * sg * o + ux * p.w / 2); g.lineTo(hx + ux * sg * o + uy * p.w / 2, hy + uy * sg * o - ux * p.w / 2); g.stroke(); }
    }
    // one-way taxiways and a preferred flow: chevrons pointing the way to go
    const dir = p.oneway || p.flow;
    if (dir) {
      g.strokeStyle = p.oneway ? 'rgba(236,196,60,0.9)' : 'rgba(236,196,60,0.45)'; g.lineWidth = Math.max(0.01, 1 * px);
      const k = 0.07, dx = ux * dir, dy = uy * dir;
      for (let t = 0.6; t < L - 0.3; t += 1.2) {
        const cx = a.x + ux * t, cy = a.y + uy * t;
        g.beginPath(); g.moveTo(cx - dx * k - dy * k, cy - dy * k + dx * k); g.lineTo(cx, cy); g.lineTo(cx - dx * k + dy * k, cy - dy * k - dx * k); g.stroke();
      }
    }
  }
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
  if (!rw.built) { stageRect(g, rw, L, Math.max(rw.w, 2 * px), px, paveCol(rw), true); g.restore(); return; }
  const W = Math.max(rw.w, 2 * px);
  g.fillStyle = 'rgba(90,94,88,0.9)'; g.fillRect(-L / 2 - 0.3, -W / 2 - 0.08, L + 0.6, W + 0.16);
  g.fillStyle = paveCol(rw); g.fillRect(-L / 2, -W / 2, L, W);
  // worn pavement: patches and cracks where heavy aircraft have broken it up
  if (rw.wear > 0.2 && z > 1.5) { g.fillStyle = 'rgba(20,18,16,0.55)'; const n = Math.round(rw.wear * 40); for (let i = 0; i < n; i++) { const hx = (U.hash(i, 7) - 0.5) * L * 0.9, hy = (U.hash(7, i) - 0.5) * W * 0.8; g.fillRect(hx, hy, 0.25 + U.hash(i, i) * 0.4, 0.04 + U.hash(i, 3) * 0.08); } }
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
      const m = rw.name.match(/(\d\d[LCR]?)\/(\d\d[LCR]?)/);
      if (m) for (const [e, num] of [[-1, m[1]], [1, m[2]]]) { g.save(); g.translate(e * (L / 2 - 0.62), 0); g.rotate(e > 0 ? -Math.PI / 2 : Math.PI / 2); g.font = '700 0.16px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillStyle = PAINT; g.fillText(num, 0, 0.06); g.restore(); }
    }
  } else if (z > 0.8) { g.fillStyle = 'rgba(236,236,226,0.35)'; g.fillRect(-L / 2 + 0.5, -Math.max(0.01, 0.4 * px), L - 1, Math.max(0.02, 0.8 * px)); }
  // closed for works or worn out: yellow crosses on the runway, as pilots see them
  if (rw.shut || rw.wear >= 1) {
    g.strokeStyle = 'rgba(242,200,60,0.95)'; g.lineWidth = Math.max(W * 0.12, 1.5 * px);
    const k = Math.max(W * 0.45, 5 * px);
    for (const x of [-L / 2 + 2, 0, L / 2 - 2]) { g.beginPath(); g.moveTo(x - k, -k); g.lineTo(x + k, k); g.moveTo(x + k, -k); g.lineTo(x - k, k); g.stroke(); }
  }
  g.restore();
  if ((rw.shut || rw.wear >= 1) && z < 6) lbl(g, rw.wear >= 1 ? 'CLOSED: WORN OUT' : 'CLOSED: WORKS', c.x, c.y - 10 * px, px, IC.C.amber, 8.5, 'center', 700);
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
  // the lead-in line; a drive-through stand's runs on out through the nose
  g.beginPath(); g.moveTo(-S0.d / 2 - 0.08, 0); g.lineTo(s.drive ? S0.d / 2 + 0.08 : S0.d * 0.35, 0); g.stroke();
  // safety line round the stand, and the stop bar or arrow
  if (fine) { g.strokeStyle = 'rgba(214,60,50,0.55)'; g.lineWidth = Math.max(0.004, 0.5 * px); g.strokeRect(-S0.d / 2 + 0.02, -S0.w / 2 + 0.02, S0.d - 0.04, S0.w - 0.04); }
  // a jet bridge from the terminal to the front door
  if (s.contact) { g.fillStyle = 'rgba(176,180,186,0.95)'; g.fillRect(S0.d * 0.22, -S0.w * 0.2 - 0.012, S0.d * 0.3, 0.024); g.fillRect(S0.d * 0.22 - 0.02, -S0.w * 0.2 - 0.02, 0.04, 0.04); }
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
    const w = p.w || p.r * 2, h = p.h || p.r * 2;
    stageRect(g, p, w, h, px, 'rgb(150,150,146)', false, true);
    g.restore();
    return;
  }
  const col = { deice: [150, 152, 148], fuelpad: [150, 152, 148], terminal: [176, 180, 186], cargo: [150, 140, 118], hangar: [128, 134, 140], has: [150, 146, 132], alert: [140, 140, 132], tower: [190, 190, 196], fire: [176, 70, 56], atc: [200, 204, 208], ammo: [96, 116, 84], fuel: [226, 224, 212], ils: [220, 130, 60], gradar: [200, 204, 208], hydrant: [120, 136, 150] }[p.kind] || [150, 150, 150];
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
  } else if (IC.APART[p.kind].pad) {
    // a service pad: concrete with its markings, a pump or the de-icing rigs
    g.fillStyle = CONC2; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead) {
      g.strokeStyle = p.kind === 'deice' ? 'rgba(90,200,140,0.9)' : YEL; g.lineWidth = Math.max(0.008, 0.7 * px); g.strokeRect(-w / 2 + 0.03, -h / 2 + 0.03, w - 0.06, h - 0.06);
      g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(0, h * 0.2); g.stroke();
      if (p.kind === 'deice') { g.fillStyle = 'rgb(236,120,40)'; for (const sx of [-1, 1]) g.fillRect(sx * w * 0.42 - 0.03, -0.03, 0.06, 0.06); }
      else { g.fillStyle = 'rgb(200,60,50)'; g.fillRect(w * 0.3, h * 0.25, 0.05, 0.04); }
    }
  } else if (p.kind === 'tower') {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead) { g.fillStyle = 'rgba(40,70,90,0.95)'; g.beginPath(); g.arc(0, 0, w * 0.34, 0, 7); g.fill(); g.fillStyle = night ? 'rgba(170,230,255,0.9)' : 'rgba(150,200,220,0.6)'; g.beginPath(); g.arc(0, 0, w * 0.22, 0, 7); g.fill(); }
  } else if (p.kind === 'ils') {
    // the localizer: a row of antennas across the centreline
    g.fillStyle = 'rgba(40,40,40,0.5)'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = fill; for (let i = 0; i < 8; i++) g.fillRect(-w / 2 + i * w / 7.5, -h * 0.3, Math.max(0.012, 0.8 * px), h * 0.6);
  } else if (p.kind === 'gradar') {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (!dead && full) { const a = now * 3; g.strokeStyle = 'rgba(30,34,40,0.9)'; g.lineWidth = 0.015; g.beginPath(); g.moveTo(-Math.cos(a) * w * 0.9, -Math.sin(a) * w * 0.9); g.lineTo(Math.cos(a) * w * 0.9, Math.sin(a) * w * 0.9); g.stroke(); }
  } else if (p.kind === 'atc') {
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, Math.max(w / 2, 1.5 * px), 0, 7); g.fill();
    if (!dead && full) { const a = now * 1.3; g.strokeStyle = 'rgba(30,34,40,0.9)'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-Math.cos(a) * w * 0.8, -Math.sin(a) * w * 0.8); g.lineTo(Math.cos(a) * w * 0.8, Math.sin(a) * w * 0.8); g.stroke(); }
  } else {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    if (full && !dead && (p.kind === 'terminal' || p.kind === 'cargo')) roof(g, p, w, h, px, z, night);
    if (full && !dead && p.kind === 'fire') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-w * 0.08, -h * 0.3, w * 0.16, h * 0.6); g.fillRect(-w * 0.25, -h * 0.08, w * 0.5, h * 0.16); }
    if (full && !dead && p.kind === 'ammo') { g.fillStyle = 'rgba(60,80,52,0.9)'; for (let i = -1; i <= 1; i++) g.fillRect(i * w * 0.3 - w * 0.12, -h * 0.35, w * 0.24, h * 0.7); }
    if (full && !dead && p.kind === 'alert') { g.fillStyle = 'rgba(96,98,94,0.95)'; g.fillRect(-w * 0.3, -h * 0.35, w * 0.6, h * 0.7); }
  }
  // an outline, so buildings read against pavement and grass
  if (full && !dead && !p.r && p.kind !== 'ils') { g.strokeStyle = 'rgba(16,20,24,0.55)'; g.lineWidth = Math.max(0.006, 0.8 * px); g.strokeRect(-w / 2, -h / 2, w, h); }
  // damage
  if (dead) {
    g.fillStyle = 'rgba(24,18,14,0.85)'; if (p.r) { g.beginPath(); g.arc(0, 0, p.r * 1.1, 0, 7); g.fill(); } else g.fillRect(-w / 2, -h / 2, w, h);
    if (full) { g.fillStyle = 'rgba(110,96,80,0.9)'; for (let i = 0; i < 6; i++) { const hx = U.hash(i, p.x * 100 | 0) - 0.5, hy = U.hash(p.y * 100 | 0, i) - 0.5; g.fillRect(hx * w * 0.8, hy * h * 0.8, w * 0.12, h * 0.1); } }
  } else if (hp < 0.6 && full) { g.fillStyle = 'rgba(20,14,10,0.5)'; g.beginPath(); g.arc(w * 0.15, -h * 0.1, Math.min(w, h) * 0.35, 0, 7); g.fill(); }
  if (hp < 0.5 && z > 0.8 && z < 6) { g.strokeStyle = dead ? IC.C.hostile : IC.C.amber; g.lineWidth = 1.2 * px; if (p.r) { g.beginPath(); g.arc(0, 0, p.r + 3 * px, 0, 7); g.stroke(); } else g.strokeRect(-w / 2 - 2 * px, -h / 2 - 2 * px, w + 4 * px, h + 4 * px); }
  g.restore();
  if (p.linked === false && IC.aptDoor(p.kind) && z > 2) lbl(g, 'NO TAXIWAY', p.x, p.y - (h / 2) - 6 * px, px, IC.C.amber, 7.5, 'center', 700);
}
/* a terminal or shed roof: parapet, roof panels, skylights along the spine, plant on the roof, glass on the long
   sides; a cargo shed gets loading doors instead */
function roof(g, p, w, h, px, z, night) {
  const long = w >= h, L = long ? w : h, D = long ? h : w;
  g.save(); if (!long) g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(-L / 2, -D / 2, L, D * 0.5);
  if (z > 6) {
    // roof panels
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.beginPath();
    for (let x = -L / 2 + 0.25; x < L / 2; x += 0.25) { g.moveTo(x, -D / 2); g.lineTo(x, D / 2); }
    g.stroke();
    if (p.kind === 'terminal') {
      // skylights along the spine, and air-conditioning plant
      g.fillStyle = night ? 'rgba(255,226,160,0.8)' : 'rgba(150,190,215,0.8)';
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.15; x += 0.5) g.fillRect(x, -D * 0.06, 0.32, D * 0.12);
      g.fillStyle = 'rgba(96,100,106,0.9)';
      for (let i = 0; i < Math.floor(L / 1.2); i++) { const x = -L / 2 + 0.6 + i * 1.2 + (U.hash(i, 3) - 0.5) * 0.3, y = (U.hash(i, 9) > 0.5 ? 1 : -1) * D * 0.28; g.fillRect(x - 0.05, y - 0.03, 0.1, 0.06); }
    } else {
      g.fillStyle = 'rgba(60,64,70,0.9)';
      for (let x = -L / 2 + 0.1; x < L / 2 - 0.1; x += 0.16) g.fillRect(x, D / 2 - 0.012, 0.1, 0.012);
    }
  }
  // glass on both long sides (lit at night)
  g.fillStyle = night ? 'rgba(255,220,150,0.7)' : 'rgba(70,110,140,0.75)';
  if (p.kind === 'terminal') { g.fillRect(-L / 2, -D / 2, L, Math.max(0.01, 0.9 * px)); g.fillRect(-L / 2, D / 2 - Math.max(0.01, 0.9 * px), L, Math.max(0.01, 0.9 * px)); }
  g.restore();
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
      // edge lights 30 m apart close in; further out, fewer, so they read as dots and not a solid line
      for (let s = 0; s <= L; s += Math.max(0.3, 12 * px)) { const x = a.x + (b.x - a.x) * s / L, y = a.y + (b.y - a.y) * s / L; dot(x + nx * 0.13, y + ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); dot(x - nx * 0.13, y - ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); }
    }
  }
  // floodlights along aprons and terminals: pools of light spaced along the building, not one glow for a whole concourse
  for (const p of ap.parts.filter(q => (q.kind === 'apron' || q.kind === 'terminal') && q.built && q.hp > q.max * 0.25)) {
    const long = Math.max(p.w, p.h), r = U.clamp(Math.min(p.w, p.h) * 0.9, 0.5, 1.6), n = Math.max(1, Math.round(long / (r * 1.6)));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5, c = IC.rectWorld(p, p.w >= p.h ? f * p.w : 0, p.w >= p.h ? 0 : f * p.h);
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      gr.addColorStop(0, `rgba(255,214,150,${0.14 * k})`); gr.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, 7); g.fill();
    }
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
    // turnaround: jet bridge or buses, fuel, baggage and cargo
    if (z > 5 && t.t > 0 && s.svc && s.svc.tail === t.id) drawTurn(g, S, ap, s, t, px, z);
  }
  // aircraft in the hangars, seen through the open doors
  for (const h of ap.parts) if (h.kind === 'hangar' && (h.inside || []).length) h.inside.forEach((x, i) => {
    const t = tails && tails.get(x.tl); if (!t) return;
    const q = IC.rectWorld(h, (i - 0.5) * h.w * 0.48, 0), al = IC.avAirline(S, t.al);
    IC.drawPlane(g, q.x, q.y, h.a + Math.PI / 2 * (h.doorSide || -1) * -1, t.type, al ? al.livery : null, { alpha: 0.55, minPx: 5 });
  });
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

/* ---------- surfaces the player paints ---------- */
const SURF_COL = { grass: 'rgb(104,132,84)', gravel: 'rgb(150,140,120)', green: 'rgb(92,128,78)', asph: 'rgb(60,62,64)', conc: 'rgb(128,130,126)' };
function drawSurface(g, p, px, z) {
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  const w = p.w, h = p.h, k = p.surf || 'grass';
  if (!p.built) { stageRect(g, p, w, h, px, SURF_COL[k]); g.restore(); return; }
  g.fillStyle = SURF_COL[k]; g.fillRect(-w / 2, -h / 2, w, h);
  if (z > 10) {
    const n = Math.min(400, Math.round(w * h * 60));
    if (k === 'gravel') { for (let i = 0; i < n; i++) { g.fillStyle = U.hash(i, 7) > 0.5 ? 'rgba(90,84,70,0.35)' : 'rgba(210,200,180,0.35)'; g.fillRect((U.hash(i, 1) - 0.5) * w, (U.hash(1, i) - 0.5) * h, 0.012, 0.012); } }
    else if (k === 'grass') { g.fillStyle = 'rgba(160,180,120,0.12)'; for (let y = -h / 2; y < h / 2; y += 0.12) g.fillRect(-w / 2, y, w, 0.06); }
    else if (k === 'green') {
      // lawns, shrubs, trees and a flower bed or two
      for (let i = 0; i < n / 3; i++) { const x = (U.hash(i, 3) - 0.5) * w * 0.9, y = (U.hash(3, i) - 0.5) * h * 0.9, r = 0.02 + U.hash(i, i) * 0.035; g.fillStyle = 'rgba(40,70,36,0.85)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(90,130,70,0.8)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(200,90,110,0.7)'; g.fillRect(-w * 0.2, -h * 0.05, w * 0.12, h * 0.1);
    } else if (k === 'asph') {
      // a car park: bays in rows
      g.strokeStyle = 'rgba(236,236,226,0.4)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath();
      for (let y = -h / 2 + 0.03; y + 0.1 < h / 2; y += 0.17) for (let x = -w / 2 + 0.03; x < w / 2 - 0.03; x += 0.026) { g.moveTo(x, y); g.lineTo(x, y + 0.1); }
      g.stroke();
    } else if (k === 'conc') { g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath(); for (let x = -w / 2; x < w / 2; x += 0.06) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); } for (let y = -h / 2; y < h / 2; y += 0.06) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); } g.stroke(); }
  }
  g.restore();
}

/* ---------- the landside ---------- */
const CARS = ['rgb(200,202,206)', 'rgb(40,44,50)', 'rgb(150,30,36)', 'rgb(230,230,226)', 'rgb(60,80,120)', 'rgb(120,124,128)', 'rgb(180,160,120)'];
function drawLandside(g, S, ap, px, z, night) {
  const L = ap.land, V = IC.rs && IC.rs.view;
  const vis = it => !V || (it.x > V.x0 - 2 && it.x < V.x1 + 2 && it.y > V.y0 - 2 && it.y < V.y1 + 2);
  // roads first: dark asphalt with a pale edge, a centre line close in
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of L.roads || []) {
    g.strokeStyle = 'rgb(150,150,142)'; g.lineWidth = Math.max(r.w + 0.03, 2 * px); g.beginPath(); r.pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke();
    g.strokeStyle = 'rgb(58,60,62)'; g.lineWidth = Math.max(r.w, 1.4 * px); g.stroke();
    if (z > 25 && r.w > 0.1) { g.strokeStyle = 'rgba(236,236,226,0.8)'; g.lineWidth = Math.max(0.004, 0.5 * px); g.setLineDash([0.03, 0.03]); g.stroke(); g.setLineDash([]); }
  }
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  for (const it of L.items) {
    if (!vis(it)) continue;
    g.save(); g.translate(it.x, it.y); g.rotate(it.a || 0);
    const w = it.w, h = it.h, k = it.kind, use = it.use == null ? 0.5 : it.use;
    if (k === 'park' || k === 'taxi') {
      g.fillStyle = 'rgb(62,64,66)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(150,150,142,0.9)'; g.lineWidth = Math.max(0.006, 0.7 * px); g.strokeRect(-w / 2, -h / 2, w, h);
      if (z > 12) {
        // rows of bays either side of the aisles, and cars in them as full as the car park is
        const bay = 0.026, depth = 0.05, rows = [];
        for (let y = -h / 2 + 0.03; y + 2 * depth < h / 2 - 0.02; y += 2 * depth + 0.07) rows.push(y);
        g.strokeStyle = 'rgba(236,236,226,0.45)'; g.lineWidth = Math.max(0.002, 0.4 * px);
        // cars batched by colour: one fill per colour, not one per car
        let i = 0; const paths = CARS.map(() => new Path2D()), taxiP = new Path2D();
        if (z > 40) { g.beginPath(); for (const y of rows) for (let x = -w / 2 + 0.03; x < w / 2 - 0.03; x += bay) { g.moveTo(x, y); g.lineTo(x, y + 2 * depth); } g.stroke(); }
        for (const y of rows) for (let x = -w / 2 + 0.03; x < w / 2 - 0.03 - bay; x += bay) for (const yy of [y, y + depth]) {
          i++;
          if (U.hash(i, it.x * 10 | 0) > (k === 'taxi' ? 0.7 : use)) continue;
          (k === 'taxi' && U.hash(i, 5) < 0.6 ? taxiP : paths[(U.hash(i, 11) * CARS.length) | 0]).rect(x + bay * 0.15, yy + depth * 0.12, bay * 0.7, depth * 0.76);
        }
        paths.forEach((P, c) => { g.fillStyle = CARS[c]; g.fill(P); }); g.fillStyle = 'rgb(236,196,50)'; g.fill(taxiP);
      }
      if (k === 'taxi') { g.fillStyle = 'rgb(200,196,186)'; g.fillRect(w / 2 - 0.16, -h / 2, 0.16, 0.12); }
    } else if (k === 'garage') {
      g.fillStyle = 'rgb(150,150,146)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgb(120,120,116)'; g.fillRect(-w / 2 + 0.03, -h / 2 + 0.03, w - 0.06, h - 0.06);
      // the top deck: bays and cars, the ramp tower in a corner
      if (z > 12) for (let i = 0, x = -w / 2 + 0.06; x < w / 2 - 0.08; x += 0.026) for (const y of [-h * 0.3, h * 0.15]) { i++; if (U.hash(i, 3) < use) { g.fillStyle = CARS[(U.hash(i, 17) * CARS.length) | 0]; g.fillRect(x, y, 0.018, 0.04); } }
      g.fillStyle = 'rgb(96,96,92)'; g.beginPath(); g.arc(w / 2 - 0.08, h / 2 - 0.08, 0.06, 0, 7); g.fill();
    } else if (k === 'stop') {
      g.fillStyle = 'rgb(70,72,74)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgb(226,228,230)'; g.fillRect(-w / 2 + 0.04, -h / 2 + 0.02, w - 0.08, 0.05);
      if (it.rail) { g.fillStyle = 'rgb(110,100,90)'; g.fillRect(-w / 2, h / 2 - 0.08, w, 0.05); g.fillStyle = 'rgb(180,60,50)'; g.fillRect(-0.2, h / 2 - 0.075, 0.4, 0.04); }
      else for (let i = 0; i < 3; i++) if (U.hash(i, (S.time / 300) | 0) < 0.6) { g.fillStyle = i % 2 ? 'rgb(236,236,230)' : 'rgb(70,120,170)'; g.fillRect(-w / 2 + 0.08 + i * 0.16, -0.02, 0.12, 0.03); }
    } else if (k === 'hotel') {
      g.fillStyle = 'rgb(118,150,98)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgb(198,186,168)'; g.fillRect(-w / 2 + 0.04, -h / 2 + 0.04, w * 0.7, h * 0.35); g.fillRect(-w / 2 + 0.04, -h / 2 + 0.04, w * 0.22, h - 0.08);
      g.fillStyle = 'rgb(70,170,200)'; g.fillRect(w * 0.08, h * 0.08, w * 0.24, h * 0.18);
      if (night) { g.fillStyle = 'rgba(255,220,150,0.7)'; for (let x = -w / 2 + 0.06; x < w * 0.2 - 0.02; x += 0.04) g.fillRect(x, -h / 2 + 0.05, 0.02, 0.01); }
    } else if (k === 'office') {
      g.fillStyle = 'rgb(128,150,98)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgb(96,120,140)'; g.fillRect(-w / 2 + 0.05, -h / 2 + 0.05, w - 0.1, h * 0.55);
      g.strokeStyle = 'rgba(200,220,236,0.35)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath(); for (let x = -w / 2 + 0.05; x < w / 2 - 0.05; x += 0.05) { g.moveTo(x, -h / 2 + 0.05); g.lineTo(x, -h / 2 + 0.05 + h * 0.55); } g.stroke();
      g.fillStyle = 'rgb(62,64,66)'; g.fillRect(-w / 2 + 0.05, h * 0.15, w - 0.1, h * 0.25);
    } else if (k === 'warehouse') {
      g.fillStyle = 'rgb(62,64,66)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgb(168,164,150)'; g.fillRect(-w / 2 + 0.03, -h / 2 + 0.03, w - 0.06, h * 0.62);
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = -w / 2 + 0.03; x < w / 2 - 0.03; x += 0.06) g.fillRect(x, -h / 2 + 0.03, 0.01, h * 0.62);
      for (let i = 0, x = -w / 2 + 0.08; x < w / 2 - 0.08; x += 0.1, i++) if (U.hash(i, it.x | 0) < use) { g.fillStyle = 'rgb(210,120,50)'; g.fillRect(x, -h / 2 + 0.03 + h * 0.62, 0.035, 0.14); }
    }
    if (k !== 'park' && k !== 'taxi') { g.strokeStyle = 'rgba(16,20,24,0.5)'; g.lineWidth = Math.max(0.005, 0.7 * px); g.strokeRect(-w / 2, -h / 2, w, h); }
    g.restore();
    if (z > 30 && IC.cam.z < 200) lbl(g, (it.name || IC.LAND[k].name).toUpperCase(), it.x, it.y + 3 * px, px, 'rgba(236,236,226,0.7)', 7, 'center', 700);
  }
}

/* ---------- ground services, drawn from the state of each turnaround ---------- */
/* a vehicle from above, at its real size (a few pixels at least) */
function veh(g, x, y, h, L, W, col, px, roof) {
  const k = Math.max(1, 3 * px / L);
  g.save(); g.translate(x, y); g.rotate(h);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-L * k / 2 + 0.006, -W * k / 2 + 0.006, L * k, W * k);
  g.fillStyle = col; g.fillRect(-L * k / 2, -W * k / 2, L * k, W * k);
  if (roof) { g.fillStyle = roof; g.fillRect(L * k * 0.18, -W * k / 2, L * k * 0.3, W * k); }
  g.restore();
}
const lerpP = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: Math.atan2(b.y - a.y, b.x - a.x) });
/* the nearest point on the nearest building of a kind: where buses, lorries and trucks come from */
function kerb(ap, kinds, p) {
  let best = null, bd = 1e9;
  for (const q of ap.parts) if (kinds.includes(q.kind) && q.built && q.hp > q.max * 0.25) {
    const w = q.w || (q.r || 0.1) * 2, h = q.h || (q.r || 0.1) * 2, l = IC.rectLocal(q, p), c = IC.rectWorld(q, U.clamp(l.x, -w / 2, w / 2), U.clamp(l.y, -h / 2, h / 2)), d = U.dist(c, p);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
IC.aptKerb = kerb;
/* one turnaround: f runs 0 → 1 from arrival on the stand to departure */
function drawTurn(g, S, ap, s, t, px, z) {
  const sv = s.svc, f = U.clamp((S.time - sv.t0) / Math.max(60, sv.dur), 0, 1), T = t.T;
  const hx = Math.cos(s.a), hy = Math.sin(s.a), nx = -hy, ny = hx;
  const door = { x: s.x + hx * T.len * 0.3 + nx * T.span * 0.06, y: s.y + hy * T.len * 0.3 + ny * T.span * 0.06 };
  const aft = { x: s.x - hx * T.len * 0.3 - nx * T.span * 0.06, y: s.y - hy * T.len * 0.3 - ny * T.span * 0.06 };
  if (sv.kind === 'bridge') {
    // the bridge swings out from the terminal to the front door while passengers are on the move
    const k = kerb(ap, ['terminal'], door); if (k) { g.strokeStyle = 'rgba(176,180,186,0.97)'; g.lineWidth = Math.max(0.035, 2.4 * px); g.lineCap = 'butt'; g.beginPath(); g.moveTo(k.x, k.y); g.lineTo(door.x, door.y); g.stroke(); g.fillStyle = 'rgb(120,124,130)'; g.beginPath(); g.arc(door.x, door.y, Math.max(0.025, 1.6 * px), 0, 7); g.fill(); }
  } else if (sv.kind === 'walk') {
    // stairs, and passengers walking across the apron to the gate
    veh(g, door.x + nx * 0.03, door.y + ny * 0.03, s.a + Math.PI / 2, 0.07, 0.025, 'rgb(220,220,210)', px);
    const k = kerb(ap, ['terminal'], door);
    if (k && (f < 0.2 || (f > 0.6 && f < 0.85)) && z > 20) { g.fillStyle = 'rgba(250,240,200,0.9)'; for (let i = 0; i < 8; i++) { const q = lerpP(door, k, ((S.time * 0.02 + i / 8) % 1)); g.fillRect(q.x - 0.005, q.y - 0.005, 0.01, 0.01); } }
  } else if (sv.kind === 'bus') {
    // buses shuttle between the terminal and the stand: off the aircraft first, then out again to board
    const k = kerb(ap, ['terminal'], door);
    if (k) for (let i = 0; i < sv.n; i++) {
      const lag = i * 0.03, deb = (f - lag) / 0.18, brd = (f - 0.62 - lag) / 0.2;
      let q = null;
      if (deb > 0 && deb < 1) q = deb < 0.25 ? lerpP(door, door, 0) : lerpP(door, k, (deb - 0.25) / 0.75);
      else if (brd > 0 && brd < 1) q = brd < 0.7 ? lerpP(k, door, brd / 0.7) : lerpP(door, door, 0);
      if (!q) continue;
      const side = (i % 2 ? 1 : -1) * 0.05 * (1 + (i >> 1));
      veh(g, q.x + nx * side, q.y + ny * side, q.h || s.a, 0.14, 0.03, 'rgb(236,236,230)', px, 'rgba(60,110,150,0.9)');
    }
  } else if (sv.kind === 'cargo') {
    // lorries between the cargo shed and the freighter's nose door
    const k = kerb(ap, ['cargo'], door) || kerb(ap, ['terminal'], door);
    if (k) for (let i = 0; i < sv.n; i++) { const ph = (f * 6 + i / sv.n) % 1, q = ph < 0.5 ? lerpP(k, door, ph * 2) : lerpP(door, k, (ph - 0.5) * 2); veh(g, q.x + nx * 0.04, q.y + ny * 0.04, q.h, 0.12, 0.028, 'rgb(210,120,50)', px, 'rgb(90,90,90)'); }
  }
  // baggage carts at the hold while passengers are on and off
  if (sv.kind !== 'cargo' && (f < 0.25 || f > 0.6) && f < 0.9) for (let i = 0; i < 3; i++) veh(g, aft.x - hx * i * 0.045 + nx * 0.06, aft.y - hy * i * 0.045 + ny * 0.06, s.a, 0.035, 0.018, 'rgb(90,96,104)', px);
  // fuel: a truck from the fuel farm, or a small dispenser on the hydrant
  if (f > 0.5 && f < 0.85) {
    const wing = { x: s.x + nx * T.span * 0.28, y: s.y + ny * T.span * 0.28 };
    if (sv.fuel === 'hydrant') veh(g, wing.x, wing.y, s.a, 0.05, 0.025, 'rgb(200,200,196)', px);
    else { const k = kerb(ap, ['fuel'], wing), ph = (f - 0.5) / 0.35, q = k && ph < 0.2 ? lerpP(k, wing, ph / 0.2) : k && ph > 0.85 ? lerpP(wing, k, (ph - 0.85) / 0.15) : { x: wing.x, y: wing.y, h: s.a }; veh(g, q.x, q.y, q.h, 0.1, 0.03, 'rgb(236,236,236)', px, 'rgb(200,60,50)'); }
  }
}

/* ---------- construction you can watch ---------- */
/* a part under construction in local coordinates (centred, rotated): survey stakes, bare earth, paving or the
   structure rising from one end, then the finished surface waiting for its markings */
const STAGE_I = { demo: 0, survey: 1, earth: 2, pave: 3, mark: 4, fit: 4, lights: 5, open: 6 };
const LAMP = 'rgba(255,236,170,0.95)', LAMP_OFF = 'rgba(120,120,110,0.8)', TLAMP = 'rgba(90,220,120,0.95)', ELAMP = 'rgba(90,150,255,0.95)';
/* runway edge lights along both sides, lit up to share f (the rest still dark) */
function edgeLights(g, w, h, px, f, on) {
  const st = Math.max(0.3, 12 * px), r = Math.max(0.012, 1.8 * px);
  for (let x = -w / 2, i = 0; x <= w / 2 + 1e-6; x += st, i++) {
    const lit = (x + w / 2) / w <= f;
    for (const y of [-h / 2, h / 2]) {
      if (lit) { g.fillStyle = on ? 'rgba(255,236,170,0.22)' : 'rgba(255,236,170,0.14)'; g.beginPath(); g.arc(x, y, r * 3.5, 0, 7); g.fill(); }
      g.fillStyle = lit ? LAMP : LAMP_OFF; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
}
function stageRect(g, part, w, h, px, fill, runway, building) {
  const k = STAGE_I[part.stage || 'survey'], f = part.stageF || 0;
  if (k >= 2) { g.fillStyle = DIRT; g.fillRect(-w / 2, -h / 2, w, h); }
  // earthworks: graded strips spread from one end
  if (k === 2) { g.fillStyle = DIRT2; for (let x = -w / 2; x < w / 2 * (2 * f - 1) + 1e-6; x += Math.max(0.08, 3 * px)) g.fillRect(x, -h / 2, Math.max(0.03, 1.2 * px), h); }
  if (k === 3) { g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w * f, h); if (building) { g.strokeStyle = 'rgba(60,60,60,0.8)'; g.lineWidth = Math.max(0.01, px); for (let x = -w / 2; x < -w / 2 + w * f; x += Math.max(0.1, 4 * px)) { g.beginPath(); g.moveTo(x, -h / 2); g.lineTo(x, h / 2); g.stroke(); } } }
  if (k >= 4) { g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h); }
  // markings: the centreline is painted from one end, then the threshold bars
  if (runway && k >= 4) {
    const m = k === 4 ? f : 1, dash = Math.max(0.3, 9 * px);
    g.fillStyle = PAINT;
    for (let x = -w / 2 + 0.4; x < -w / 2 + (w - 0.4) * m; x += dash * 2) g.fillRect(x, -0.005, Math.min(dash, -w / 2 + (w - 0.4) * m - x), 0.01);
    if (m > 0.6) for (const e of [-1, 1]) for (let i = -3; i <= 3; i++) if (i) g.fillRect(e * (w / 2 - 0.25) - 0.1, i * h / 9 - 0.006, 0.2, 0.012);
  }
  // lights: edge lights come on one by one; at the inspection they all burn
  if (runway && k >= 5) edgeLights(g, w, h, px, k === 5 ? f : 1, k === 6);
  // aprons and pads: the yellow edge line painted round, then floodlights along the long sides switched on in turn
  if (!runway && !building && k >= 4) {
    g.strokeStyle = YEL; g.lineWidth = Math.max(0.006, 0.8 * px);
    const m = k === 4 ? f : 1; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(-w / 2 + w * m, -h / 2); g.moveTo(-w / 2, h / 2); g.lineTo(-w / 2 + w * m, h / 2); g.stroke();
    if (k >= 5) { const st = Math.max(0.6, 18 * px), r = Math.max(0.02, 1.4 * px), on = k === 5 ? f : 1; for (let x = -w / 2 + st / 2; x < w / 2; x += st) { const lit = (x + w / 2) / w <= on; g.fillStyle = lit ? LAMP : LAMP_OFF; for (const y of [-h / 2 - 0.03, h / 2 + 0.03]) { g.beginPath(); g.arc(x, y, lit ? r * 1.5 : r, 0, 7); g.fill(); if (lit) { g.fillStyle = 'rgba(255,236,170,0.12)'; g.beginPath(); g.arc(x, y, r * 6, 0, 7); g.fill(); g.fillStyle = LAMP; } } } }
  }
  if (building && k === 5) { g.fillStyle = `rgba(255,236,170,${0.25 + 0.5 * f})`; const n = Math.max(1, Math.round(w / Math.max(0.1, 6 * px))); for (let i = 0; i < n * f; i++) g.fillRect(-w / 2 + (i + 0.3) * w / n, -h / 2 + h * 0.3, w / n * 0.4, h * 0.4); }
  if (k <= 1) { g.fillStyle = k === 0 ? 'rgba(160,110,90,0.35)' : 'rgba(242,180,65,0.1)'; g.fillRect(-w / 2, -h / 2, w, h); }
  // the outline stays dashed until it opens
  g.strokeStyle = STAKE; g.setLineDash([4 * px, 3 * px]); g.lineWidth = 1.2 * px; g.strokeRect(-w / 2, -h / 2, w, h); g.setLineDash([]);
  // survey: pegs go in round the outline as the surveyors walk it
  if (k <= 1) { g.fillStyle = STAKE; const st = Math.max(0.3, 14 * px), n = Math.ceil((w / st + 1) * (k === 1 ? f : 1)); let i = 0; for (let x = -w / 2; x <= w / 2 + 1e-6 && i < n; x += st, i++) for (const y of [-h / 2, h / 2]) g.fillRect(x - 1 * px, y - 1 * px, 2 * px, 2 * px); }
}
function stageLine(g, pts, w, part, px) {
  const k = STAGE_I[part.stage || 'survey'], f = part.stageF || 0;
  const path = (upto) => { let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); let left = L * upto; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length && left > 0; i++) { const d = U.dist(pts[i - 1], pts[i]), t = Math.min(1, left / (d || 1)); g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t); left -= d; } };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (k >= 2) { g.strokeStyle = DIRT; g.lineWidth = Math.max(w + 0.1, 1.5 * px); path(1); g.stroke(); }
  if (k === 3) { g.strokeStyle = paveCol(part); g.lineWidth = Math.max(w, 1.2 * px); path(f); g.stroke(); }
  if (k >= 4) { g.strokeStyle = paveCol(part); g.lineWidth = Math.max(w, 1.2 * px); path(1); g.stroke(); }
  // the yellow centreline, painted along; then its green lights come on
  if (k >= 4) { g.strokeStyle = YEL; g.lineWidth = Math.max(0.006, 0.8 * px); path(k === 4 ? f : 1); g.stroke(); }
  if (k >= 5) { g.strokeStyle = TLAMP; g.lineWidth = Math.max(0.01, (k === 6 ? 2 : 1.4) * px); g.setLineDash([1 * px, 7 * px]); path(k === 5 ? f : 1); g.stroke(); g.setLineDash([]); }
  if (k <= 1 || k >= 4) { g.strokeStyle = STAKE; g.setLineDash([5 * px, 4 * px]); g.lineWidth = Math.max(k <= 1 ? w : 0.01, 1.5 * px); g.globalAlpha = k <= 1 ? 0.6 : 0.8; path(k === 1 ? Math.max(0.05, f) : 1); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
}
/* where on a part the work is happening now: the front of the paving, or somewhere along it */
function workAt(ap, p, f) {
  if (p.kind === 'runway') return IC.rwAt(p, f);
  if (p.kind === 'taxi') { const pts = p.nodes.map(id => ap.nodes[id]).filter(Boolean); let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); let left = L * f; for (let i = 1; i < pts.length; i++) { const d = U.dist(pts[i - 1], pts[i]); if (left <= d) return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * left / (d || 1), y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * left / (d || 1), h: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) }; left -= d; } return pts[pts.length - 1]; }
  const w = p.w || 0.3; return IC.rectWorld(p, -w / 2 + w * f, 0);
}
/* the machines of each stage (colour, length and width in units; 'truck' ones shuttle along the site) */
const MACHINE = {
  demo: [['#c8a040', 1], ['#6a6a6a', 1]],
  survey: [['#f0f0f0', 0.8], ['#e07b1a', 0.4]],
  earth: [['#e8b820', 1.2], ['#e8b820', 1], ['#d88a20', 1, 'truck'], ['#d88a20', 1, 'truck']],
  pave: [['#303030', 1.3], ['#e8b820', 0.9], ['#d0d0d0', 0.8], ['#d88a20', 1, 'truck']],
  mark: [['#f0f0f0', 1], ['#f2d14a', 0.6]],
  fit: [['#f0f0f0', 1], ['#e07b1a', 0.8]],
  lights: [['#e07b1a', 0.9], ['#f0f0f0', 0.8]],
  open: [['#f0f0f0', 0.7]]
};
/* an engineer crew: machines at the working front, moving while they work, parked while they wait; dump and
   concrete lorries shuttle between the front and the site gate */
function drawCrew(g, S, ap, w, px, now) {
  const p = w.part, st = w.stages[Math.min(w.si, w.stages.length - 1)], f = w.t / st.dur;
  const busy = !w.wait, cols = MACHINE[st.k] || MACHINE.fit;
  // a stalled site: the machines stand idle at the front, marked amber
  if (!busy && !(w.si > 0 || w.t > 0)) return;
  // the front: where the paving, painting or wiring has got to; the earthworks and inspection move up and down
  const front = st.k === 'pave' || st.k === 'demo' || st.k === 'mark' || st.k === 'lights' || st.k === 'survey' ? f : 0.5 + 0.4 * Math.sin(now * 0.3 + p.x);
  const at = workAt(ap, p, U.clamp(front, 0, 1)), h = at.h != null ? at.h : p.kind === 'runway' ? Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x) : p.a || 0;
  const mw = Math.max(0.1, 7 * px), mh = mw * 0.55;
  const box = (x, y, hd, c, L) => { g.save(); g.translate(x, y); g.rotate(hd); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-mw * L / 2 + 0.01, -mh / 2 + 0.01, mw * L, mh); g.fillStyle = c; g.fillRect(-mw * L / 2, -mh / 2, mw * L, mh); g.restore(); };
  let fixed = 0;
  cols.forEach(([c, L, kind], i) => {
    if (kind === 'truck') {
      // back and forth between the gate (the part's start) and the front, loaded one way
      const ph = ((now * (busy ? 0.08 : 0) + i * 0.37) % 1), t = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      const q = workAt(ap, p, U.clamp(t * Math.max(0.05, front), 0, 1)), qh = (q.h != null ? q.h : h) + (ph < 0.5 ? 0 : Math.PI);
      box(q.x - Math.sin(h) * mh * 1.4, q.y + Math.cos(h) * mh * 1.4, qh, c, L);
      return;
    }
    const jig = busy ? Math.sin(now * 1.7 + i * 2.1) * 0.08 : 0, off = (fixed - (cols.length - 1) / 2) * mw * 1.6;
    const x = at.x + Math.cos(h) * (jig - fixed * mw * 0.6) - Math.sin(h) * off, y = at.y + Math.sin(h) * (jig - fixed * mw * 0.6) + Math.cos(h) * off;
    fixed++;
    box(x, y, h, c, L);
  });
  if (busy && st.k === 'earth' && Math.random() < 0.15) IC.part(S, { x: at.x + U.rand(-0.1, 0.1), y: at.y + U.rand(-0.1, 0.1), vy: -2, life: 1.4, size: 2.5, grow: 4, col: '170,140,100', a: 0.35 });
  if (busy && st.k === 'pave' && Math.random() < 0.06) IC.part(S, { x: at.x, y: at.y, vy: -1.5, life: 1.6, size: 2, grow: 3, col: '120,120,120', a: 0.25 });
  // the electricians' test: a light blinks at the front
  if (busy && st.k === 'lights' && Math.sin(now * 6) > 0) { g.fillStyle = LAMP; g.beginPath(); g.arc(at.x, at.y, 2.5 * px, 0, 7); g.fill(); }
  if (w.wait) { g.fillStyle = IC.C.amber; g.beginPath(); g.arc(at.x, at.y - 9 * px, 3 * px, 0, 7); g.fill(); if (IC.cam.z > 30) lbl(g, w.wait.split(':')[0].toUpperCase(), at.x, at.y - 15 * px, px, IC.C.amber, 7.5, 'center', 700); }
  else if (IC.cam.z > 14) lbl(g, st.name.toUpperCase(), at.x, at.y - 10 * px, px, 'rgba(236,236,226,0.8)', 7.5, 'center', 700);
}
/* material lorries on their way in from the supplier, on the last stretch of road */
function drawConvoys(g, S, ap, px, z) {
  const sp = ap.supply; if (!sp || !sp.route || !ap.convoys || !ap.convoys.length) return;
  const pts = [{ x: sp.x, y: sp.y }].concat(sp.route);
  if (!sp.cum) { sp.cum = [0]; for (let i = 1; i < pts.length; i++) sp.cum.push(sp.cum[i - 1] + U.dist(pts[i - 1], pts[i])); }
  const L = sp.cum[sp.cum.length - 1];
  const at = d => { let i = 1; while (i < pts.length - 1 && sp.cum[i] < d) i++; const a = pts[i - 1], b = pts[i], t = U.clamp((d - sp.cum[i - 1]) / ((sp.cum[i] - sp.cum[i - 1]) || 1), 0, 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) }; };
  const s = Math.max(0.06, 2.4 * px), gap = Math.max(0.4, 7 * px);
  for (const c of ap.convoys) {
    const f = U.clamp((S.time - c.t0) / Math.max(1, c.arr - c.t0), 0, 1);
    for (let i = 0; i < Math.min(c.n, 8); i++) {
      const q = at(Math.max(0, f * L - i * gap));
      g.save(); g.translate(q.x, q.y); g.rotate(q.h); g.fillStyle = 'rgba(230,180,60,0.95)'; g.fillRect(-s, -s * 0.4, s * 2, s * 0.8); g.fillStyle = 'rgba(60,60,60,0.9)'; g.fillRect(s * 0.6, -s * 0.4, s * 0.5, s * 0.8); g.restore();
    }
    if (z < 2) { const q = at(f * L); lbl(g, `${Math.round(Object.values(c.loads).reduce((a, b) => a + b, 0))} loads`, q.x, q.y - 9 * px, px, 'rgba(230,180,60,0.9)', 7.5, 'center', 600); }
  }
}

/* ---------- the builder: what is about to be placed ---------- */
let ghostKey = '', ghostPlan = null;
IC.drawBuildGhost = function (g, S, px) {
  const m = S.mode2, hv = S.hover;
  if (!m || !hv) return;
  if (m.kind === 'found') { drawFoundGhost(g, S, m, hv, px); return; }
  if (m.kind === 'bmove') { const p = m.part, ok = IC.aptCanPlace(S, m.ap, Object.assign({}, p, { x: hv.x, y: hv.y, a: m.rot })); g.save(); g.translate(hv.x, hv.y); g.rotate(m.rot); g.strokeStyle = ok ? 'rgba(111,210,255,0.9)' : IC.C.hostile; g.lineWidth = 1.5 * px; const w = p.w || p.r * 2, h = p.h || p.r * 2; g.strokeRect(-w / 2, -h / 2, w, h); g.restore(); return; }
  if (m.kind !== 'build') return;
  const ap = m.ap, tol = Math.max(0.12, 8 * px);
  // the plan is worked out again only when the cursor or the plan changes
  const key = `${m.part}|${hv.x.toFixed(2)},${hv.y.toFixed(2)}|${m.pts.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(';')}|${m.mat}|${m.size}|${m.rot}|${m.fillet}|${ap.parts.length}|${ap.nodeN}|${Math.round(S.budget)}`;
  if (key !== ghostKey) { ghostKey = key; ghostPlan = IC.bldPlanOf(S, m, hv, tol); }
  const plan = ghostPlan, ok = plan.ok;
  const col = ok ? 'rgba(111,210,255,0.9)' : 'rgba(255,91,79,0.95)', fill = ok ? 'rgba(111,210,255,0.2)' : 'rgba(255,91,79,0.2)';
  // homes that would come down
  for (const b of plan.blocks || []) { g.save(); g.translate(b.x, b.y); g.rotate(b.a || 0); g.strokeStyle = IC.C.hostile; g.lineWidth = 1.4 * px; g.fillStyle = 'rgba(255,91,79,0.3)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore(); }
  // a runway that paving next to would close
  if (plan.near) { const rw = plan.near, c = IC.rwAt(rw, 0.5), d = IC.rwDir(rw); g.save(); g.translate(c.x, c.y); g.rotate(Math.atan2(d.y, d.x)); g.fillStyle = 'rgba(242,180,65,0.25)'; g.fillRect(-IC.rwLen(rw) / 2, -rw.w, IC.rwLen(rw), rw.w * 2); g.restore(); }
  for (const sp of plan.specs) {
    const D = IC.APART[sp.kind];
    g.strokeStyle = col; g.fillStyle = fill; g.lineWidth = 1.5 * px;
    if (sp.kind === 'taxi' || sp.kind === 'runway') {
      const pts = sp.kind === 'runway' ? [sp.a, sp.b] : sp.pts;
      g.lineCap = sp.kind === 'runway' ? 'butt' : 'round'; g.lineJoin = 'round'; g.globalAlpha = 0.55;
      g.strokeStyle = ok ? (sp.kind === 'runway' ? 'rgba(200,220,235,0.9)' : 'rgba(111,210,255,0.9)') : 'rgba(255,91,79,0.9)'; g.lineWidth = Math.max(D.w, 2 * px);
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.globalAlpha = 1; g.lineCap = 'butt';
      g.strokeStyle = col; g.lineWidth = Math.max(0.01, 1 * px); g.setLineDash([5 * px, 4 * px]); g.stroke(); g.setLineDash([]);
    } else {
      const w = sp.w || D.w || (D.r || 0.1) * 2, h = sp.h || D.h || (D.r || 0.1) * 2;
      g.save(); g.translate(sp.x, sp.y); g.rotate(sp.a || 0);
      if (D.r) { g.beginPath(); g.arc(0, 0, D.r, 0, 7); g.fill(); g.stroke(); } else { g.fillRect(-w / 2, -h / 2, w, h); g.strokeRect(-w / 2, -h / 2, w, h); }
      // the stands the apron will get
      if (sp.kind === 'apron' && !sp.ramp) { const dep = h * 0.64, sz = dep >= IC.STAND.l.d ? 'l' : dep >= IC.STAND.m.d ? 'm' : dep >= IC.STAND.s.d ? 's' : null; if (sz) { const S0 = IC.STAND[sz]; g.strokeStyle = 'rgba(236,236,226,0.5)'; g.lineWidth = Math.max(0.005, 0.6 * px); for (let i = 0; i < Math.floor(w / S0.w); i++) { const x = -w / 2 + S0.w * i; g.strokeRect(x, -h / 2, S0.w, S0.d); g.strokeRect(x, h / 2 - S0.d, S0.w, S0.d); } } }
      g.restore();
    }
  }
  // a ramp stand
  if (plan.stand) {
    const st = plan.stand, rm = st.remove, S0 = IC.STAND[rm ? rm.size : st.size], c = rm || IC.rectWorld(st.apron, st.lx, st.ly), a = rm ? rm.a : st.apron.a + st.rot;
    g.save(); g.translate(c.x, c.y); g.rotate(a); g.strokeStyle = rm ? IC.C.hostile : col; g.fillStyle = rm ? 'rgba(255,91,79,0.25)' : fill; g.lineWidth = 1.5 * px;
    g.fillRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w);
    // the nose, and the way in and out
    if (!rm) { g.beginPath(); g.moveTo(S0.d / 2, 0); g.lineTo(S0.d / 2 - 0.08, -0.05); g.lineTo(S0.d / 2 - 0.08, 0.05); g.closePath(); g.fillStyle = col; g.fill(); g.setLineDash([3 * px, 3 * px]); g.beginPath(); g.moveTo(-S0.d / 2 - 0.1, 0); g.lineTo(st.drive ? S0.d / 2 + 0.1 : S0.d * 0.3, 0); g.stroke(); g.setLineDash([]); }
    g.restore();
    if (!rm && ghostPlan) IC.drawPlane(g, c.x, c.y, a, { s: 'turbo', m: 'narrow', l: 'wide', xl: 'heavy' }[st.size], null, { alpha: 0.35, minPx: 6 });
  }
  // the points placed so far; the last one pulses: click it again to build
  const pts = m.pts, now = performance.now() / 1000;
  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    g.strokeStyle = last ? IC.C.ok : 'rgba(236,236,226,0.9)'; g.lineWidth = 1.5 * px;
    g.beginPath(); g.arc(p.x, p.y, (last ? 6 + 2 * Math.sin(now * 6) : 4) * px, 0, 7); g.stroke();
  });
  // the snap target
  const sn = plan.snap;
  if (sn) {
    const c2 = sn.kind === 'free' ? 'rgba(200,210,220,0.8)' : sn.kind === 'rwy' ? 'rgba(255,240,200,0.95)' : IC.C.ok;
    g.strokeStyle = c2; g.lineWidth = 1.5 * px; g.beginPath();
    if (sn.kind === 'free') { g.moveTo(sn.x - 5 * px, sn.y); g.lineTo(sn.x + 5 * px, sn.y); g.moveTo(sn.x, sn.y - 5 * px); g.lineTo(sn.x, sn.y + 5 * px); } else g.arc(sn.x, sn.y, 5 * px, 0, 7);
    g.stroke();
    const tag = { node: 'joins', rwy: 'onto runway', taxi: 'joins taxiway', apron: 'joins apron', corner: 'corner', edge: sn.what ? 'against the ' + sn.what : 'edge' }[sn.kind] || (sn.ang != null ? `${(sn.ang + 360) % 180}° to the runway` : '');
    if (tag) lbl(g, tag, sn.x, sn.y + 16 * px, px, sn.kind === 'free' ? IC.C.muted : IC.C.ok, 8.5, 'center', 600);
  }
  // cost and what it does, beside the cursor
  const lines = ok ? plan.text.slice(0, 3) : [plan.why].concat(plan.text.slice(0, 1));
  const at = hv;
  lines.forEach((t, i) => lbl(g, t, at.x + 18 * px, at.y - 40 * px + i * 13 * px, px, i === 0 ? (ok ? IC.C.text : IC.C.hostile) : 'rgba(210,225,235,0.85)', i === 0 ? 10 : 9, 'left', i === 0 ? 700 : 500));
  const need = IC.bldIsLine(m.part) || IC.bldIsArea(m.part) ? 2 : 1;
  if (ok && pts.length >= need && m.part !== 'stand') { const q = m.part === 'parallel' ? hv : pts[pts.length - 1]; lbl(g, 'click again to build', q.x, q.y + 28 * px, px, IC.C.ok, 8.5, 'center', 700); }
};
/* founding: the site, the runway turned by the cursor, the noise footprint and what the survey found */
function drawFoundGhost(g, S, m, hv, px) {
  if (!m.site) {
    const why = IC.foundCheck(S, hv.x, hv.y);
    g.strokeStyle = why ? IC.C.hostile : 'rgba(111,210,255,0.9)'; g.lineWidth = 1.5 * px; g.beginPath(); g.arc(hv.x, hv.y, 15, 0, 7); g.stroke();
    lbl(g, why || 'click to survey this site', hv.x, hv.y - 18 - 8 * px, px, why ? IC.C.hostile : IC.C.text, 9.5, 'center', 600);
    return;
  }
  const a = IC.foundAngle(m.site, hv), sv = IC.foundSurvey(S, m.site.x, m.site.y, a), d = { x: Math.cos(a), y: Math.sin(a) };
  // the noise footprint under the approach and departure paths
  g.save(); g.translate(m.site.x, m.site.y); g.rotate(a);
  g.fillStyle = sv.homes ? 'rgba(255,150,80,0.12)' : 'rgba(111,210,255,0.08)'; g.strokeStyle = sv.homes ? 'rgba(255,150,80,0.6)' : 'rgba(111,210,255,0.5)'; g.lineWidth = 1.2 * px;
  g.beginPath(); const E = 15 + 80;
  g.moveTo(-E, -15); g.lineTo(-60, -6); g.lineTo(60, -6); g.lineTo(E, -15); g.lineTo(E, 15); g.lineTo(60, 6); g.lineTo(-60, 6); g.lineTo(-E, 15); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(210,215,220,0.95)'; g.fillRect(-15, -0.6, 30, 1.2);
  g.restore();
  // the prevailing wind
  const wa = IC.PREVAIL, wx = m.site.x + Math.cos(wa) * 40, wy = m.site.y + Math.sin(wa) * 40;
  g.strokeStyle = 'rgba(127,232,176,0.9)'; g.lineWidth = 2 * px; g.beginPath(); g.moveTo(wx, wy); g.lineTo(m.site.x + Math.cos(wa) * 20, m.site.y + Math.sin(wa) * 20); g.stroke();
  lbl(g, 'prevailing wind', wx, wy - 8 * px, px, 'rgba(127,232,176,0.9)', 8.5, 'center', 600);
  // the runway's name at each end; the full survey is in the hint below
  const ends = sv.name.split('/');
  lbl(g, ends[0], m.site.x - d.x * 19, m.site.y - d.y * 19 + 4 * px, px, IC.C.text, 11, 'center', 700);
  lbl(g, ends[1], m.site.x + d.x * 19, m.site.y + d.y * 19 + 4 * px, px, IC.C.text, 11, 'center', 700);
  if (sv.homes) lbl(g, `noise over ${sv.homes} city blocks`, m.site.x + d.x * 70, m.site.y + d.y * 70 - 14 * px, px, 'rgba(255,170,110,0.95)', 9.5, 'center', 700);
}

})(window.IC);
