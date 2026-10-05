/* Iron Canopy — drawing airports at real scale: asphalt and concrete, markings, buildings, damage, lights at
   night, and every aircraft on the ground in its airline's colours. Detail fades in as the camera closes. */
(function (IC) {
'use strict';
const U = IC.U;
const ASPH = 'rgb(46,48,50)', ASPH2 = 'rgb(56,58,60)', CONC = 'rgb(118,120,118)', CONC2 = 'rgb(132,134,130)', PAINT = 'rgba(236,236,226,0.92)', YEL = 'rgba(236,196,60,0.95)';

/* (no words in a picture for the 3D view: its labels are text on the screen, never letters lying on the ground) */
let NOLBL = false;
function lbl(g, txt, x, y, px, col, size, align, weight) {
  if (NOLBL) return;
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
/* a part's outline as a path in its own frame (after translate and rotate): its polygon, or its rectangle */
function partPath(g, p, w, h, grow) {
  g.beginPath();
  if (p.poly) { const P = grow ? IC.polyGrow(p.poly.map(q => ({ x: q[0], y: q[1] })), grow) : null; (P ? P.map(q => [q.x, q.y]) : p.poly).forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q[0], q[1])); g.closePath(); }
  else { const e = grow || 0; g.rect(-w / 2 - e, -h / 2 - e, w + 2 * e, h + 2 * e); }
}
IC.partPath = partPath;
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
IC.drawAirport = function (g, S, ap, px, now, light, o) {
  NOLBL = !!(o && o.pad);
  const z = IC.cam.z;
  const full = z >= 1.2, marks = z >= 4, fine = z >= 9;
  const night = light < 0.55;
  const parts = ap.parts;
  const by = k => parts.filter(p => p.kind === k);
  // the airfield's grass is part of the terrain (terrain.js); here only the perimeter fence
  const box = fieldBox(ap);
  // inside the fence the ground is mown grass: no trees or crops on an airfield, stripes where the mowers went
  if (box && z > 2) drawField(g, box, px, z);
  // roads and railways that pass under the airfield: the tunnel's line, and a portal at each end
  if (z > 1.5 && S.world.tunnels) for (const t of S.world.tunnels) if (t.apt === ap.id) drawTunnel(g, t, px, z);
  // service roads across the airside (from the map data): grey, with a white edge close in
  // (the airside service roads, laid out or drawn, are painted with the pavement: svcroads.js, render-pavement.js)
  // painted surfaces, under everything else
  for (const p of by('surface')) drawSurface(g, p, px, z);
  // the landside: kerb roads, car parks, garages, hotels, offices, warehouses (landside.js)
  if (ap.land && ap.land.items && z > 1.2) drawLandside(g, S, ap, px, z, night);
  // the pavement: close in, one painted surface from the airport's tiles (render-pavement.js); far out, flat shapes
  const tiles = z * IC.dpr() >= 1;
  if (tiles && o && o.pad) IC.pavePaint(g, S, ap, z, IC.rs.view);
  else if (tiles) {
    IC.drawPaveTiles(g, S, ap, z, IC.dpr(), S.paused ? 16 : 6);
    // where its tiles are still being painted, the flat shapes of the far view, sharp
    if (ap._gap) {
      g.save(); g.beginPath(); for (const [x, y, T] of ap._gap) g.rect(x, y, T, T); g.clip();
      for (const p of parts) if (p.built && (p.kind === 'apron' || p.kind === 'alert' || p.kind === 'holdbay')) drawArea(g, p, p.kind === 'apron' ? ZONE_FILL[IC.partZone(ap, p)] || CONC : p.kind === 'alert' ? CONC2 : CONC, px, Object.create(p, { scorch: { value: null } }), false);
      for (const p of by('taxi')) if (p.built) drawTaxi(g, ap, p, px, z, full, false, night, false);
      for (const rw of by('runway')) if (rw.built && !rw.shut) drawRunway(g, S, ap, rw, px, z, false, false, night, now, false);
      g.restore();
    }
  }
  if (box && z > 2) { g.strokeStyle = 'rgba(40,44,40,0.7)'; g.lineWidth = Math.max(0.02, 0.8 * px); IC.aptFenceStroke(g, box); }
  // a terminal or shed still being built stands on bare ground
  if (full) for (const p of parts) if ((p.kind === 'terminal' || p.kind === 'cargo') && p.x != null && !p.noApron && !p.built) {
    if (!p.poly) { rect(g, p, p.w + 0.3, p.h + 0.3, 'rgba(120,110,90,0.4)'); continue; }
    g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0); g.fillStyle = 'rgba(120,110,90,0.4)'; partPath(g, p, p.w, p.h, 0.15); g.fill(); g.restore();
  }
  // aprons and other paved areas: being built, or far out; hits leave scorch marks
  for (const p of by('apron')) drawArea(g, p, p.built ? ZONE_FILL[IC.partZone(ap, p)] || CONC : null, px, p, tiles);
  for (const p of by('alert')) drawArea(g, p, p.built ? CONC2 : null, px, p, tiles);
  for (const p of by('holdbay')) drawArea(g, p, p.built ? CONC : null, px, p, tiles);
  // taxiways and runways: being built or far out drawn here; on the tiles only what changes (closures, craters)
  for (const p of by('taxi')) drawTaxi(g, ap, p, px, z, full, false, night, tiles);
  for (const rw of by('runway')) drawRunway(g, S, ap, rw, px, z, false, false, night, now, tiles);
  if (z > 2.5) for (const p of by('apron')) if (p.built && ap.kind !== 'airbase') { const zn = IC.partZone(ap, p); if (zn !== 'civil') lbl(g, IC.ZONES[zn].short, p.x, p.y + 3 * px, px, 'rgba(236,236,226,0.55)', 8, 'center', 700); }
  // stands
  if (full) for (const p of by('apron')) if (p.built) for (const s of p.stands || []) { if (!tiles && marks && s.via) drawLeadIn(g, ap, s, px); drawStand(g, s, px, z, marks, fine, tiles); }
  // service roads from buildings to the pavement they face
  if (z > 1.5) { g.lineCap = 'round'; for (const p of parts) if (p.link && p.built) { g.strokeStyle = 'rgb(88,90,88)'; g.lineWidth = Math.max(0.07, 1.2 * px); g.beginPath(); g.moveTo(p.link[0].x, p.link[0].y); g.lineTo(p.link[1].x, p.link[1].y); g.stroke(); } g.lineCap = 'butt'; }
  // buildings: every shadow first, so none falls across a roof
  if (full) for (const p of parts) if (p.built && p.hp > p.max * 0.25 && !['runway', 'taxi', 'apron', 'holdbay', 'surface', 'skybridge', 'people', 'deice', 'fuelpad'].includes(p.kind)) shadowOf(g, S, p);
  for (const p of parts) {
    if (['runway', 'taxi', 'apron', 'holdbay', 'surface', 'skybridge', 'people'].includes(p.kind)) continue;
    drawBuilding(g, S, ap, p, px, z, full, now, night);
  }
  // what stands on the grass: glide-path lights, windsocks, glide-slope masts, a VOR, blast fences
  if (z > 3 && !(o && o.pad)) drawFurniture(g, S, ap, px, z, now, night);
  // people movers below ground: the line on the map, faint and dashed
  for (const p of by('people')) if ((p.lv || 0) < 0) drawMover(g, p, px, z, night, now);
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
  // above the aircraft that taxi under them: passenger bridges, and people movers on their viaducts
  for (const p of by('skybridge')) drawSpan(g, ap, p, px, z, night);
  for (const p of by('people')) if ((p.lv || 0) >= 0) drawMover(g, p, px, z, night, now);
  // the airport sits under the same night as everything else; its lights do not
  if (light < 1 && box) { g.beginPath(); IC.aptFencePath(g, box); g.fillStyle = `rgba(3,8,24,${0.62 * (1 - light)})`; g.fill('evenodd'); }
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
  // the words on the airport: each building site's progress, on the site, and what each building is at the middle
  // zoom, the most important first and none over another (IC.aptLabels)
  for (const L of IC.aptLabels(S, ap, z, { noNames: !S.layers.labels })) lbl(g, L.txt, L.x, L.y, px, L.kind === 'wait' ? 'rgba(242,180,65,0.95)' : L.kind === 'work' ? 'rgba(236,236,226,0.9)' : 'rgba(236,236,226,0.75)', L.size, 'center', 700);
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
IC.aptHoldBars = holdBars;
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
    if (z < 12 && !waiting) continue;
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
/* the airfield's grass: a flat mown colour over the terrain inside the fence, and mowing stripes close in */
function drawField(g, box, px, z) {
  const k = U.clamp((z - 3) / 30, 0, 1);
  g.save(); g.beginPath(); IC.aptFencePath(g, box); g.clip('evenodd');
  // (the grass itself is on the map's tiles, terrain.js)
  if (z > 12) {
    // only the stripes in view, along the main runway
    g.translate(box.x, box.y); g.rotate(box.a);
    const V = IC.rs && IC.rs.view, st = 0.3;
    let y0 = -box.h / 2, y1 = box.h / 2;
    if (V) { const c = Math.cos(-box.a), sn = Math.sin(-box.a), ys = [[V.x0, V.y0], [V.x1, V.y0], [V.x1, V.y1], [V.x0, V.y1]].map(([x, y]) => (x - box.x) * sn + (y - box.y) * c); y0 = Math.max(y0, Math.min(...ys)); y1 = Math.min(y1, Math.max(...ys)); }
    g.fillStyle = `rgba(150,170,110,${0.07 * k * U.clamp((z - 12) / 12, 0, 1)})`;
    for (let y = Math.floor(y0 / (2 * st)) * 2 * st; y < y1; y += 2 * st) g.fillRect(-box.w / 2, y, box.w, st);
  }
  g.restore();
}
function drawArea(g, p, fill, px, part, tiles) {
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  const w = p.w, h = p.h;
  if (!part.built) stageRect(g, part, w, h, px, paveCol2(part));
  else if (!tiles) {
    g.fillStyle = IC.paveOf(part) === 'asph' ? 'rgb(64,66,68)' : IC.paveOf(part) === 'grass' ? PAVE_COL.grass : fill; partPath(g, p, w, h); g.fill();
    // the painted edge of the apron
    if (IC.cam.z > 4) { g.strokeStyle = 'rgba(236,196,60,0.5)'; g.lineWidth = Math.max(0.006, 0.6 * px); if (p.poly) { partPath(g, p, w, h, -0.02); g.stroke(); } else g.strokeRect(-w / 2 + 0.02, -h / 2 + 0.02, w - 0.04, h - 0.04); }
    // the joints between the slabs (7.5 m), inside the outline
    if (IC.cam.z > 9) { g.save(); if (p.poly) { partPath(g, p, w, h); g.clip(); } g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.004; g.beginPath(); for (let x = -w / 2; x < w / 2; x += 0.075) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); } for (let y = -h / 2; y < h / 2; y += 0.075) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); } g.stroke(); g.restore(); }
  }
  g.restore();
  // hits leave scorch marks where they landed, not across the whole slab
  for (const s of part.scorch || []) {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gr.addColorStop(0, 'rgba(14,10,8,0.85)'); gr.addColorStop(0.5, 'rgba(30,22,16,0.5)'); gr.addColorStop(1, 'rgba(30,22,16,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
  }
}
function drawTaxi(g, ap, p, px, z, full, marks, night, tiles) {
  const pts = p.nodes.map(id => ap.nodes[id]).filter(Boolean);
  if (pts.length < 2) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!p.built) { stageLine(g, pts, p.w, p, px); g.lineCap = 'butt'; g.lineJoin = 'miter'; return; }
  if (tiles) {
    // closed for works: a darker, dusty surface with yellow crosses at each end
    if (p.shut) { g.strokeStyle = 'rgba(96,84,60,0.55)'; g.lineWidth = p.w; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.stroke(); }
    g.lineCap = 'butt'; g.lineJoin = 'miter';
  } else {
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
function drawRunway(g, S, ap, rw, px, z, marks, fine, night, now, tiles) {
  const L = IC.rwLen(rw), d = IC.rwDir(rw), c = IC.rwAt(rw, 0.5), a = Math.atan2(d.y, d.x);
  g.save(); g.translate(c.x, c.y); g.rotate(a);
  if (!rw.built) { stageRect(g, rw, L, Math.max(rw.w, 2 * px), px, paveCol(rw), true); g.restore(); return; }
  const W = Math.max(rw.w, 2 * px);
  if (!tiles) {
  g.fillStyle = 'rgba(90,94,88,0.9)'; g.fillRect(-L / 2 - 0.3, -W / 2 - 0.08, L + 0.6, W + 0.16);
  g.fillStyle = paveCol(rw); g.fillRect(-L / 2, -W / 2, L, W);
  // worn pavement: patches and cracks where heavy aircraft have broken it up
  if (rw.wear > 0.2 && z > 1.5) { g.fillStyle = 'rgba(20,18,16,0.55)'; const n = Math.round(rw.wear * 40); for (let i = 0; i < n; i++) { const hx = (U.hash(i, 7) - 0.5) * L * 0.9, hy = (U.hash(7, i) - 0.5) * W * 0.8; g.fillRect(hx, hy, 0.25 + U.hash(i, i) * 0.4, 0.04 + U.hash(i, 3) * 0.08); } }
  if (marks) { runwayMarks(g, rw, L, fine);
  } else if (z > 0.8) { g.fillStyle = 'rgba(236,236,226,0.35)'; g.fillRect(-L / 2 + 0.5, -Math.max(0.01, 0.4 * px), L - 1, Math.max(0.02, 0.8 * px)); }
  }
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
/* Runway markings to the FAA's standard for a precision runway (AC 150/5340-1), in metres (1 unit = 100 m): edge
   stripes; at each end the threshold stripes (by the runway's width: 12 on 45 m, 16 on 60 m, 45 m long, from 6 m in),
   the designator 18 m tall, touchdown-zone bars in groups of 3, 2, 2, 1, 1 at 150 m steps, the aiming point 300 m in;
   a centreline of 36 m stripes and 24 m gaps. A displaced threshold (rw.disp, m) is a white bar across the runway
   with arrows leading up to it along the centreline. The frame is the runway's: x along it from −L/2 (end a). */
IC.runwayMarks = runwayMarks;
function runwayMarks(g, rw, L, fine) {
  const M = 0.01, W = rw.w, hw = W / 2;
  g.fillStyle = PAINT;
  g.fillRect(-L / 2, -hw + 0.4 * M, L, 0.9 * M); g.fillRect(-L / 2, hw - 1.3 * M, L, 0.9 * M);
  const n = W >= 0.58 ? 16 : W >= 0.43 ? 12 : W >= 0.28 ? 8 : 4, sw = 1.75 * M, gap = (W - 2 * 3 * M - n * sw) / (n + 1);
  const disp = rw.disp || [0, 0];
  let c0 = -L / 2 + 1.2, c1 = L / 2 - 1.2;
  for (const [e, dm] of [[-1, disp[0] || 0], [1, disp[1] || 0]]) {
    const D = dm * M, t0 = L / 2 - D;   // (the landing threshold, from the middle)
    const at = (d, len, y, h) => g.fillRect(e * (t0 - d) - (e > 0 ? len : 0), y, len, h);
    // the displaced part: a threshold bar and arrows up to it
    if (D > 0.05) {
      g.fillRect(e * t0 - (e > 0 ? 3 * M : 0), -hw + 1.5 * M, 3 * M, W - 3 * M);
      // (arrows point the way aircraft land: towards the threshold)
      for (let d = 0.25; d < D - 0.1; d += 0.6) {
        const tip = e * (t0 + d), tail = tip + e * 0.3, dir = -e;
        g.fillRect(Math.min(tip, tail), -0.45 * M, 0.3, 0.9 * M);
        g.beginPath(); g.moveTo(tip + dir * 0.05, 0); g.lineTo(tip - dir * 0.04, -2.2 * M); g.lineTo(tip - dir * 0.04, 2.2 * M); g.closePath(); g.fill();
      }
    }
    // threshold stripes, either side of the centreline, then the designator
    for (let k = 0; k < n; k++) { const y = -hw + 3 * M + gap * (k + 1) + sw * k + (k >= n / 2 ? gap * 0.6 : 0) - gap * 0.3; at(6 * M, 45 * M, y, sw); }
    // touchdown zone and aiming point (runways over 1,300 m)
    if (L > 13) {
      const bars = (d, k) => { for (let i = 0; i < k; i++) { const y = 11 * M + i * 3.3 * M; at(d, 22.5 * M, y, 1.8 * M); at(d, 22.5 * M, -y - 1.8 * M, 1.8 * M); } };
      bars(150 * M, 3); at(300 * M, 45 * M, 11 * M, 9 * M); at(300 * M, 45 * M, -20 * M, 9 * M);
      if (L > 20) { bars(450 * M, 2); bars(600 * M, 2); bars(750 * M, 1); bars(900 * M, 1); }
    }
    if (e < 0) c0 = -t0 + 1.2; else c1 = t0 - 1.2;
  }
  g.fillStyle = 'rgba(236,236,226,0.8)';
  for (let x = c0; x < c1 - 0.3; x += 0.61) g.fillRect(x, -0.45 * M, 0.366, 0.9 * M);
  if (fine && rw.ends) for (const [e, num, dm] of [[-1, rw.ends.a, disp[0] || 0], [1, rw.ends.b, disp[1] || 0]]) {
    if (!num) continue;
    const m = /^(\d+)([LCR]?)$/.exec(num); if (!m) continue;
    g.save(); g.translate(e * (L / 2 - dm * M - 0.72), 0); g.rotate(e > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.font = '700 0.18px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillStyle = PAINT;
    g.fillText(m[1], 0, 0.06); if (m[2]) g.fillText(m[2], 0, -0.16);
    g.restore();
  }
}
function drawStand(g, s, px, z, marks, fine, tiles) {
  if (!marks) return;
  const S0 = IC.STAND[s.size];
  g.save(); g.translate(s.x, s.y); g.rotate(s.a);
  if (s.hp <= 0) { crater(g, 0, 0, 0.14, px); g.restore(); return; }
  // (the markings are on the tiles: here the jet bridge, and a stand no taxiway reaches)
  if (tiles) {
    if (s.contact) jetBridge(g, s, S0, px, z);
    if (s.linked === false) { g.strokeStyle = 'rgba(255,91,79,0.8)'; g.setLineDash([3 * px, 3 * px]); g.lineWidth = 1 * px; g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.setLineDash([]); }
    g.restore(); return;
  }
  g.strokeStyle = 'rgba(236,236,226,0.35)'; g.lineWidth = Math.max(0.006, 0.6 * px);
  g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w);
  g.strokeStyle = YEL; g.lineWidth = Math.max(0.01, 0.8 * px);
  // the lead-in line; a drive-through stand's runs on out through the nose
  g.beginPath(); g.moveTo(-S0.d / 2 - 0.08, 0); g.lineTo(s.drive ? S0.d / 2 + 0.08 : S0.d * 0.35, 0); g.stroke();
  // safety line round the stand, and the stop bar or arrow
  if (fine) { g.strokeStyle = 'rgba(214,60,50,0.55)'; g.lineWidth = Math.max(0.004, 0.5 * px); g.strokeRect(-S0.d / 2 + 0.02, -S0.w / 2 + 0.02, S0.d - 0.04, S0.w - 0.04); }
  // a jet bridge from the terminal to the front door
  if (s.contact) jetBridge(g, s, S0, px, z);
  g.fillStyle = YEL; g.fillRect(S0.d * 0.35, -0.04, 0.012, 0.08);
  if (s.linked === false) { g.strokeStyle = 'rgba(255,91,79,0.8)'; g.setLineDash([3 * px, 3 * px]); g.lineWidth = 1 * px; g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.setLineDash([]); }
  g.restore();
  if (z > 22) lbl(g, s.name || s.id.split('s').pop(), s.fx, s.fy, px, 'rgba(236,196,60,0.8)', 7, 'center', 700);
}
/* a jet bridge in the stand's frame (x along the aircraft, nose ahead): the rotunda at the terminal, the telescopic
   tunnel on its drive wheels, the cab turned to the front door; a shadow on the pavement below */
function jetBridge(g, s, S0, px, z) {
  const B = s.bridge; if (!B) return;
  const c = Math.cos(-s.a), sn = Math.sin(-s.a), L = (x, y) => ({ x: (x - s.x) * c - (y - s.y) * sn, y: (x - s.x) * sn + (y - s.y) * c });
  const Wl = L(B.wx, B.wy), R = L(B.rx, B.ry), D = L(B.dx, B.dy), len = U.dist(R, D), a = Math.atan2(D.y - R.y, D.x - R.x), w = 0.028;
  // the fixed link from the wall to the rotunda, where the wall is set back from the stand
  if (B.link) {
    const la = Math.atan2(R.y - Wl.y, R.x - Wl.x), ll = U.dist(Wl, R);
    g.save(); g.translate(Wl.x, Wl.y); g.rotate(la);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0.01, -w / 2 + 0.016, ll, w);
    g.fillStyle = 'rgb(196,200,206)'; g.fillRect(0, -w / 2, ll, w);
    if (z > 40) { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, -w / 2, ll, w * 0.2); }
    g.restore();
  }
  g.save(); g.translate(0.02, 0.016); g.fillStyle = 'rgba(0,0,0,0.28)';
  g.save(); g.translate(R.x, R.y); g.rotate(a); g.fillRect(0, -w / 2, len, w); g.restore(); g.beginPath(); g.arc(R.x, R.y, 0.024, 0, 7); g.fill(); g.restore();
  g.save(); g.translate(R.x, R.y); g.rotate(a);
  // two telescoping sections, the outer a shade darker, and the wheels near the cab
  g.fillStyle = 'rgb(186,190,196)'; g.fillRect(0, -w / 2, len * 0.55, w);
  g.fillStyle = 'rgb(168,172,178)'; g.fillRect(len * 0.5, -w / 2 * 0.9, len * 0.5, w * 0.9);
  if (z > 40) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, -w / 2, len, w * 0.18); g.fillStyle = 'rgba(40,44,50,0.9)'; g.fillRect(len * 0.72, -w / 2 - 0.006, 0.012, w + 0.012); }
  // the cab at the door, square to the fuselage
  g.translate(len, 0); g.rotate(-a);
  g.fillStyle = 'rgb(150,154,160)'; g.fillRect(-0.02, -0.018, 0.034, 0.03);
  g.fillStyle = 'rgba(40,50,60,0.8)'; if (z > 40) g.fillRect(-0.02, 0.008, 0.034, 0.004);
  g.restore();
  // the rotunda on its column, on the wall or at the end of the link
  g.fillStyle = 'rgb(200,202,206)'; g.beginPath(); g.arc(R.x, R.y, 0.022, 0, 7); g.fill();
  g.strokeStyle = 'rgba(60,64,70,0.6)'; g.lineWidth = Math.max(0.002, 0.5 * px); g.stroke();
}
/* a stand's lead-in line from the taxilane: a curve from the node it leaves to the line behind the stand */
function drawLeadIn(g, ap, s, px) {
  const n = s.via && ap.nodes[s.via]; if (!n) return;
  const hx = Math.cos(s.a), hy = Math.sin(s.a), c = { x: s.fx - hx * 0.25, y: s.fy - hy * 0.25 };
  g.strokeStyle = YEL; g.lineWidth = Math.max(0.008, 0.7 * px);
  g.beginPath(); g.moveTo(n.x, n.y); g.quadraticCurveTo(c.x, c.y, s.fx, s.fy); g.stroke();
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
  if (p.kind === 'fuel') {
    if (full) { g.fillStyle = 'rgba(80,84,70,0.8)'; g.fillRect(-p.r * 1.35, -p.r * 1.35, p.r * 2.7, p.r * 2.7); g.fillStyle = 'rgba(120,128,104,0.9)'; g.fillRect(-p.r * 1.25, -p.r * 1.25, p.r * 2.5, p.r * 2.5); }
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, Math.max(p.r, 1.5 * px), 0, 7); g.fill();
    if (full && !dead) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.008; g.beginPath(); g.arc(0, 0, p.r * 0.7, 0, 7); g.stroke(); g.fillStyle = `rgba(90,110,130,${0.5 * (1 - (p.stock || 0) / D.cap)})`; g.beginPath(); g.arc(0, 0, p.r * 0.3, 0, 7); g.fill(); }
  } else if (p.kind === 'has') {
    g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); g.fill();
    if (full && !dead) { g.fillStyle = 'rgba(40,40,36,0.8)'; g.fillRect(-w * 0.25, (p.doorSide || -1) * h / 2 - 0.01, w * 0.5, 0.02); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(-w * 0.1, -h * 0.1, w * 0.3, h * 0.25, 0, 0, 7); g.fill(); }
  } else if (p.kind === 'hangar') {
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    // a barrel roof: light on the side facing the sun, falling off to the other
    if (full && !dead) { const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h); }
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
    g.fillStyle = p.roof && ROOF_FILL[p.roof] && !dead ? ROOF_FILL[p.roof] : fill; partPath(g, p, w, h); g.fill();
    if (full && !dead && (p.roof || p.kind === 'terminal' || p.kind === 'cargo')) { g.save(); if (p.poly) { partPath(g, p, w, h); g.clip(); } (ROOFS[p.roof] || roof)(g, p, w, h, px, z, night); g.restore(); }
    if (full && !dead && p.kind === 'fire') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-w * 0.08, -h * 0.3, w * 0.16, h * 0.6); g.fillRect(-w * 0.25, -h * 0.08, w * 0.5, h * 0.16); }
    if (full && !dead && p.kind === 'ammo') { g.fillStyle = 'rgba(60,80,52,0.9)'; for (let i = -1; i <= 1; i++) g.fillRect(i * w * 0.3 - w * 0.12, -h * 0.35, w * 0.24, h * 0.7); }
    if (full && !dead && p.kind === 'alert') { g.fillStyle = 'rgba(96,98,94,0.95)'; g.fillRect(-w * 0.3, -h * 0.35, w * 0.6, h * 0.7); }
  }
  // an outline, so buildings read against pavement and grass
  if (full && !dead && !p.r && p.kind !== 'ils') { g.strokeStyle = 'rgba(16,20,24,0.55)'; g.lineWidth = Math.max(0.006, 0.8 * px); partPath(g, p, w, h); g.stroke(); }
  // damage
  if (dead) {
    g.fillStyle = 'rgba(24,18,14,0.85)'; if (p.r) { g.beginPath(); g.arc(0, 0, p.r * 1.1, 0, 7); g.fill(); } else { partPath(g, p, w, h); g.fill(); }
    if (full) { g.fillStyle = 'rgba(110,96,80,0.9)'; for (let i = 0; i < 6; i++) { const hx = U.hash(i, p.x * 100 | 0) - 0.5, hy = U.hash(p.y * 100 | 0, i) - 0.5; g.fillRect(hx * w * 0.8, hy * h * 0.8, w * 0.12, h * 0.1); } }
  } else if (hp < 0.6 && full) { g.fillStyle = 'rgba(20,14,10,0.5)'; g.beginPath(); g.arc(w * 0.15, -h * 0.1, Math.min(w, h) * 0.35, 0, 7); g.fill(); }
  if (hp < 0.5 && z > 0.8 && z < 6) { g.strokeStyle = dead ? IC.C.hostile : IC.C.amber; g.lineWidth = 1.2 * px; if (p.r) { g.beginPath(); g.arc(0, 0, p.r + 3 * px, 0, 7); g.stroke(); } else g.strokeRect(-w / 2 - 2 * px, -h / 2 - 2 * px, w + 4 * px, h + 4 * px); }
  g.restore();
  if (p.linked === false && IC.aptDoor(p.kind) && z > 2) lbl(g, 'NO TAXIWAY', p.x, p.y - (h / 2) - 6 * px, px, IC.C.amber, 7.5, 'center', 700);
}
/* ---------- shadows ----------
   The sun climbs from the east to the south at noon and sets in the west; a building of height h throws a shadow
   h / tan(elevation) long, away from the sun. Two fills, the second a little longer and fainter, soften its edge. */
const BLD_H = { terminal: 16, cargo: 14, hangar: 20, has: 9, alert: 6, support: 9, fire: 9, tower: 40, atc: 12, gradar: 14, fuel: 14, ammo: 4, hydrant: 4, ils: 3, skybridge: 18 };
IC.sunNow = function (S) {
  const h = (S.time % 86400) / 3600, day = U.clamp((h - 6) / 12, 0, 1);
  const el = Math.max(0.12, Math.sin(day * Math.PI) * 1.05), az = Math.PI / 2 + day * Math.PI;   // east, south, west
  // (the map: x east, y south; the shadow falls away from the sun)
  const L = 1 / 100 / Math.tan(el);
  return { dx: -Math.sin(az) * L, dy: Math.cos(az) * L, a: U.clamp(IC.daylight(S.time) * 0.34, 0.05, 0.34), el, az };
};
function hull(P) {
  P = P.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/* the furniture on the grass (IC.aptFurniture), a little larger than life so it reads from the usual zoom */
function drawFurniture(g, S, ap, px, z, now, night) {
  const V = IC.rs && IC.rs.view, wind = S.wind || { x: 0, y: 0 }, wa = Math.atan2(wind.y || 0, wind.x || 0), wk = U.clamp((S.wind && S.wind.kt || 0) / 15, 0.25, 1);
  const lw = Math.max(0.004, 0.8 * px);
  for (const f of IC.aptFurniture(ap)) {
    if (V && (f.x < V.x0 - 1 || f.x > V.x1 + 1 || f.y < V.y0 - 1 || f.y > V.y1 + 1)) continue;
    g.save(); g.translate(f.x, f.y); g.rotate(f.a || 0);
    if (f.k === 'papi') {
      // four light boxes in a row, square to the runway; at night two white, two red
      const b = Math.max(0.07, 5 * px), sp = b * 1.6;
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * sp;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - b / 2 + b * 0.25, -b / 2 + b * 0.25, b, b * 0.7);
        g.fillStyle = 'rgb(214,214,206)'; g.fillRect(x - b / 2, -b / 2, b, b * 0.7);
        g.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = lw; g.strokeRect(x - b / 2, -b / 2, b, b * 0.7);
        if (night) { g.fillStyle = i < 2 ? 'rgba(255,250,230,0.95)' : 'rgba(255,60,50,0.95)'; g.beginPath(); g.arc(x, 0, b * 0.35, 0, 7); g.fill(); }
      }
    } else if (f.k === 'gs') {
      // the glide-slope mast and its shelter, on a gravel pad
      const s = Math.max(0.1, 7 * px);
      g.fillStyle = 'rgba(150,146,134,0.8)'; g.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
      g.fillStyle = 'rgb(226,226,220)'; g.fillRect(-s * 0.8, -s * 0.5, s * 0.8, s * 0.7);
      g.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = lw; g.strokeRect(-s * 0.8, -s * 0.5, s * 0.8, s * 0.7);
      g.fillStyle = 'rgb(210,60,50)'; g.beginPath(); g.arc(s * 0.5, 0, s * 0.28, 0, 7); g.fill();
      g.fillStyle = 'rgb(240,240,236)'; g.beginPath(); g.arc(s * 0.5, 0, s * 0.13, 0, 7); g.fill();
    } else if (f.k === 'sock') {
      // the white ring round the mast, and the orange-and-white sock blowing downwind (fuller in a stronger wind)
      const R = Math.max(0.22, 12 * px);
      g.strokeStyle = 'rgba(236,236,228,0.85)'; g.lineWidth = Math.max(0.012, 1.4 * px); g.setLineDash([R * 0.5, R * 0.3]);
      g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke(); g.setLineDash([]);
      g.rotate(wa + Math.sin(now * 3 + f.x) * 0.12 * (1.2 - wk));
      const l = R * 0.9, w0 = R * 0.22, w1 = w0 * (0.35 + 0.4 * wk);
      for (let i = 0; i < 5; i++) {
        const a = l * i / 5, b = l * (i + 1) / 5, wa0 = w0 + (w1 - w0) * i / 5, wb = w0 + (w1 - w0) * (i + 1) / 5;
        g.fillStyle = i & 1 ? 'rgb(240,238,230)' : 'rgb(236,112,36)';
        g.beginPath(); g.moveTo(a, -wa0 / 2); g.lineTo(b, -wb / 2); g.lineTo(b, wb / 2); g.lineTo(a, wa0 / 2); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgb(60,60,60)'; g.beginPath(); g.arc(0, 0, Math.max(0.01, 1.3 * px), 0, 7); g.fill();
    } else if (f.k === 'vor') {
      // a VOR: the round counterpoise on its legs, the ring of antennas at its rim, the hut in the middle
      const R = 0.3;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(R * 0.15, R * 0.15, R, 0, 7); g.fill();
      g.fillStyle = 'rgb(206,208,204)'; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,64,64,0.8)'; g.lineWidth = lw; g.stroke();
      if (z > 10) { g.fillStyle = 'rgb(90,94,96)'; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, Math.max(0.004, 0.6 * px), 0, 7); g.fill(); } }
      g.fillStyle = 'rgb(236,236,230)'; g.fillRect(-R * 0.3, -R * 0.3, R * 0.6, R * 0.6); g.strokeRect(-R * 0.3, -R * 0.3, R * 0.6, R * 0.6);
      g.fillStyle = 'rgb(210,60,50)'; g.beginPath(); g.arc(0, 0, R * 0.12, 0, 7); g.fill();
    } else if (f.k === 'blast') {
      // a blast fence: slatted steel, leaning away from the engines, with its shadow on the grass
      const L = f.len, t = Math.max(0.03, 2.5 * px);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(-L / 2 + t * 0.4, -t / 2 + t * 0.9, L, t);
      g.fillStyle = 'rgb(128,134,136)'; g.fillRect(-L / 2, -t / 2, L, t);
      if (z > 8) { g.strokeStyle = 'rgba(60,64,66,0.8)'; g.lineWidth = lw; g.beginPath(); for (let x = -L / 2; x <= L / 2; x += Math.max(0.03, 3 * px)) { g.moveTo(x, -t / 2); g.lineTo(x, t / 2); } g.stroke(); }
      g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = lw; g.strokeRect(-L / 2, -t / 2, L, t);
    }
    g.restore();
  }
}
function shadowOf(g, S, p) {
  const H = p.lvls ? p.lvls * 4.2 : BLD_H[p.kind] || 8; if (!H) return;
  const sun = IC.sunNow(S), key = `${p.x},${p.y},${p.a},${p.w},${p.h},${Math.round(sun.dx * 400)},${Math.round(sun.dy * 400)}`;
  if (p._shdK !== key) {
    const O = IC.partOutline(p), mk = f => hull(O.concat(O.map(q => ({ x: q.x + sun.dx * H * f, y: q.y + sun.dy * H * f }))));
    // (a concave outline casts its own shape, moved along; its hull would fill the courtyard)
    p._shd = p.poly && p.poly.length > 4 ? [1, 1.12].map(f => O.map(q => ({ x: q.x + sun.dx * H * f, y: q.y + sun.dy * H * f }))) : [mk(1), mk(1.12)];
    p._shdO = O; p._shdK = key;
  }
  const poly = P => { g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); };
  g.fillStyle = `rgba(8,12,18,${sun.a * 0.45})`; poly(p._shd[1]); g.fill();
  g.fillStyle = `rgba(8,12,18,${sun.a})`; poly(p._shd[0]); g.fill();
  if (p.poly && p.poly.length > 4) { const n = 6; for (let i = 1; i < n; i++) { g.fillStyle = `rgba(8,12,18,${sun.a / n})`; poly(p._shdO.map(q => ({ x: q.x + sun.dx * H * i / n, y: q.y + sun.dy * H * i / n }))); g.fill(); } }
}
/* a blueprint's ghost: runways and taxiways at their width, aprons and buildings as outlines */
function drawBlueprint(g, t, col, fill, px) {
  g.save(); g.lineCap = 'round';
  for (const p of t.parts) {
    if (p.kind === 'runway') { g.strokeStyle = fill; g.lineWidth = Math.max(p.w, 2 * px); g.beginPath(); g.moveTo(p.a.x, p.a.y); g.lineTo(p.b.x, p.b.y); g.stroke(); g.strokeStyle = col; g.lineWidth = Math.max(0.01, px); g.stroke(); }
    else if (p.kind === 'taxi') { g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = Math.max(p.w * 0.5, px); g.beginPath(); p.nodes.forEach((id, i) => { const n = t.nodes[id]; g[i ? 'lineTo' : 'moveTo'](n.x, n.y); }); g.stroke(); g.globalAlpha = 1; }
    else if (p.kind === 'people') { g.setLineDash([4 * px, 4 * px]); g.strokeStyle = col; g.lineWidth = px; g.beginPath(); p.pts.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.stroke(); g.setLineDash([]); }
    else if (p.x != null && p.kind !== 'ils') { const P = IC.partOutline(p); g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = col; g.lineWidth = Math.max(0.005, px); g.stroke(); }
  }
  g.restore();
}
/* a tunnel under the airfield: its line faint and dashed, and at each end the portal: a dark mouth in a concrete
   headwall, wing walls splayed along the cutting */
function drawTunnel(g, t, px, z) {
  const L = U.dist(t.a, t.b) || 0.01, dx = (t.b.x - t.a.x) / L, dy = (t.b.y - t.a.y) / L, w = t.w;
  g.setLineDash([5 * px, 4 * px]); g.strokeStyle = t.what === 'rail' ? 'rgba(170,150,130,0.4)' : 'rgba(150,150,142,0.4)'; g.lineWidth = Math.max(w * 0.5, 1.2 * px);
  g.beginPath(); g.moveTo(t.a.x, t.a.y); g.lineTo(t.b.x, t.b.y); g.stroke(); g.setLineDash([]);
  for (const [e, s] of [[t.a, 1], [t.b, -1]]) {
    g.save(); g.translate(e.x, e.y); g.rotate(Math.atan2(dy * s, dx * s));
    // the cutting down to the portal, the mouth and its headwall
    g.fillStyle = 'rgba(110,104,92,0.9)'; g.beginPath(); g.moveTo(-0.3, -w * 0.9); g.lineTo(0, -w * 0.6); g.lineTo(0, w * 0.6); g.lineTo(-0.3, w * 0.9); g.closePath(); g.fill();
    g.fillStyle = 'rgb(18,18,20)'; g.fillRect(0, -w * 0.5, 0.06, w);
    g.fillStyle = 'rgb(176,176,170)'; g.fillRect(0.04, -w * 0.62, Math.max(0.03, 1.5 * px), w * 1.24);
    g.restore();
  }
}
/* a passenger bridge over a taxiway: a glazed walkway on piers, its shadow on the pavement below, the clearance
   painted on the taxiway either side (so a pilot can read it) */
function drawSpan(g, ap, p, px, z, night) {
  const w = p.w, h = p.h;
  g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
  if (!p.built) { stageRect(g, p, w, h, px, 'rgb(150,150,146)', false, true); g.restore(); return; }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.save(); g.translate(0.08, 0.08); partPath(g, p, w, h); g.fill(); g.restore();
  g.fillStyle = 'rgb(214,216,220)'; partPath(g, p, w, h); g.fill();
  if (z > 3) {
    const long = w >= h, L = long ? w : h, D = long ? h : w;
    if (!long) g.rotate(Math.PI / 2);
    g.fillStyle = night ? 'rgba(255,226,160,0.85)' : 'rgba(110,150,180,0.8)'; g.fillRect(-L / 2, -D * 0.3, L, D * 0.6);
    g.strokeStyle = 'rgba(40,44,50,0.6)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.beginPath(); for (let x = -L / 2; x <= L / 2; x += 0.05) { g.moveTo(x, -D * 0.3); g.lineTo(x, D * 0.3); } g.stroke();
  }
  g.restore();
  if (z > 6 && p.clear) lbl(g, `${Math.round(p.clear)} m`, p.x, p.y + Math.max(w, h) * 0.0 + 10 * px, px, 'rgba(236,196,60,0.9)', 7.5, 'center', 700);
}
/* a people mover: the guideway on its viaduct (two running tracks) with the trains on it; underground only the line */
function drawMover(g, p, px, z, night, now) {
  const P = p.pts; if (!P || P.length < 2) return;
  const under = (p.lv || 0) < 0;
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y));
  if (under) { g.setLineDash([6 * px, 5 * px]); g.strokeStyle = 'rgba(120,200,255,0.55)'; g.lineWidth = Math.max(0.02, 1.4 * px); g.stroke(); g.setLineDash([]); }
  else {
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(0.1, 2 * px); g.save(); g.translate(0.06, 0.06); g.stroke(); g.restore();
    g.strokeStyle = 'rgb(200,200,196)'; g.lineWidth = Math.max(0.08, 1.8 * px); g.stroke();
    if (z > 4) { g.strokeStyle = 'rgba(90,92,96,0.8)'; g.lineWidth = Math.max(0.004, 0.5 * px); g.stroke(); }
  }
  g.lineCap = 'butt';
  // the trains: two or three cars, shuttling
  if (z > 1.5 && p.built !== false) {
    let L = 0; const cum = [0]; for (let i = 1; i < P.length; i++) { L += U.dist(P[i - 1], P[i]); cum.push(L); }
    const at = d => { for (let i = 1; i < P.length; i++) if (d <= cum[i]) { const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f, h: Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x) }; } return { x: P[P.length - 1].x, y: P[P.length - 1].y, h: 0 }; };
    const n = Math.max(1, Math.round(L / 12));
    for (let k = 0; k < n; k++) {
      const ph = ((now * 0.9 / Math.max(1, L)) + k / n) % 2, d = (ph < 1 ? ph : 2 - ph) * L, q = at(d);
      g.save(); g.translate(q.x, q.y); g.rotate(q.h);
      g.fillStyle = under ? 'rgba(160,220,255,0.7)' : night ? 'rgb(255,236,190)' : 'rgb(236,238,240)'; g.fillRect(-0.18, -0.018, 0.36, 0.036);
      g.restore();
    }
  }
}
/* Roofs that are looks only (brief 39): part.roof picks one. They never change what a building does.
   tent: white fabric on masts, rows of peaks (lightest at each mast, the fabric sagging between);
   deck: the top deck of a parking garage, bays painted in rows, cars, a ramp at each end;
   saucer: a round restaurant on four crossed arches;
   glass: a glazed roof with mullions. */
const ROOF_FILL = { tent: 'rgb(236,234,226)', deck: 'rgb(142,142,138)', saucer: 'rgb(226,226,220)', glass: 'rgb(120,150,170)', dome: 'rgb(198,202,206)', arc: 'rgb(186,190,196)' };
const ROOFS = {
  /* dome: a round building's roof, rings of panels shading from the sunny side, ribs to a glazed oculus */
  dome(g, p, w, h, px, z, night) {
    const A = p.arc || { x: 0, y: 0, r1: Math.min(w, h) / 2 }, R = A.r1;
    const gr = g.createRadialGradient(A.x - R * 0.35, A.y - R * 0.35, R * 0.1, A.x, A.y, R);
    gr.addColorStop(0, night ? 'rgba(255,236,200,0.35)' : 'rgba(255,255,255,0.45)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr; g.beginPath(); g.arc(A.x, A.y, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,96,104,0.35)'; g.lineWidth = Math.max(0.003, 0.5 * px);
    for (let r = R * 0.25; r < R - 0.01; r += Math.max(0.06, R / 7)) { g.beginPath(); g.arc(A.x, A.y, r, 0, 7); g.stroke(); }
    if (z > 3) { g.beginPath(); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.moveTo(A.x + Math.cos(a) * R * 0.25, A.y + Math.sin(a) * R * 0.25); g.lineTo(A.x + Math.cos(a) * R * 0.97, A.y + Math.sin(a) * R * 0.97); } g.stroke(); }
    g.fillStyle = night ? 'rgba(255,214,140,0.8)' : 'rgba(130,178,210,0.85)'; g.beginPath(); g.arc(A.x, A.y, R * 0.22, 0, 7); g.fill();
    if (z > 6) { g.strokeStyle = 'rgba(40,50,60,0.5)'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.moveTo(A.x, A.y); g.lineTo(A.x + Math.cos(a) * R * 0.22, A.y + Math.sin(a) * R * 0.22); } g.stroke(); }
    // plant on the roof between the rings
    if (z > 5) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3, q = { x: A.x + Math.cos(a) * R * 0.62, y: A.y + Math.sin(a) * R * 0.62 }; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(q.x - 0.015, q.y - 0.008, 0.036, 0.022); g.fillStyle = 'rgb(160,164,168)'; g.fillRect(q.x - 0.018, q.y - 0.012, 0.036, 0.022); }
  },
  /* arc: a curved building's roof, panels square to the curve, a glazed spine along its middle */
  arc(g, p, w, h, px, z, night) {
    const A = p.arc; if (!A) return;
    const rm = (A.r0 + A.r1) / 2, a0 = Math.min(A.a0, A.a1), a1 = Math.max(A.a0, A.a1);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = (A.r1 - A.r0) * 0.46; g.beginPath(); g.arc(A.x, A.y, (A.r1 + rm) / 2, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(A.x, A.y, (A.r0 + rm) / 2, a0, a1); g.stroke();
    g.strokeStyle = night ? 'rgba(255,214,140,0.75)' : 'rgba(130,178,210,0.8)'; g.lineWidth = (A.r1 - A.r0) * 0.14; g.beginPath(); g.arc(A.x, A.y, rm, a0 + 0.01, a1 - 0.01); g.stroke();
    if (z > 3) { g.strokeStyle = 'rgba(90,96,104,0.35)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.beginPath(); const n = Math.ceil((a1 - a0) * rm / 0.06); for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; g.moveTo(A.x + Math.cos(a) * A.r0, A.y + Math.sin(a) * A.r0); g.lineTo(A.x + Math.cos(a) * A.r1, A.y + Math.sin(a) * A.r1); } g.stroke(); }
    if (z > 5) for (let a = a0 + 0.08; a < a1 - 0.05; a += 0.3) { const q = { x: A.x + Math.cos(a) * (A.r0 + (A.r1 - A.r0) * 0.25), y: A.y + Math.sin(a) * (A.r0 + (A.r1 - A.r0) * 0.25) }; g.fillStyle = 'rgb(160,164,168)'; g.fillRect(q.x - 0.016, q.y - 0.011, 0.032, 0.022); }
  },
  tent(g, p, w, h, px, z, night) {
    const long = w >= h, L = long ? w : h, D = long ? h : w;
    g.save(); if (!long) g.rotate(Math.PI / 2);
    const rows = p.rows || (D > 0.9 ? 2 : 1), n = p.peaks || Math.max(2, Math.round(L / 0.55)), dx = L / n;
    for (let r = 0; r < rows; r++) {
      const y = rows === 1 ? 0 : (r - (rows - 1) / 2) * D / rows;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + dx * (i + 0.5), rr = Math.max(dx, D / rows) * 0.62;
        const gr = g.createRadialGradient(x - rr * 0.15, y - rr * 0.15, 0, x, y, rr);
        gr.addColorStop(0, night ? 'rgba(255,244,214,1)' : 'rgba(255,255,255,1)'); gr.addColorStop(0.55, night ? 'rgba(214,200,170,0.9)' : 'rgba(226,226,220,0.9)'); gr.addColorStop(1, night ? 'rgba(150,140,120,0.5)' : 'rgba(178,180,180,0.55)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, y - D / rows / 2); g.lineTo(x + dx / 2, y); g.lineTo(x, y + D / rows / 2); g.lineTo(x - dx / 2, y); g.closePath(); g.fill();
        if (z > 3) { g.strokeStyle = 'rgba(120,120,116,0.35)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.beginPath(); g.moveTo(x - dx / 2, y); g.lineTo(x + dx / 2, y); g.moveTo(x, y - D / rows / 2); g.lineTo(x, y + D / rows / 2); g.stroke(); }
        // the mast at the peak
        if (z > 6) { g.fillStyle = 'rgba(90,92,96,0.9)'; g.beginPath(); g.arc(x, y, Math.max(0.006, 0.9 * px), 0, 7); g.fill(); }
      }
    }
    g.restore();
  },
  deck(g, p, w, h, px, z) {
    const long = w >= h, L = long ? w : h, D = long ? h : w;
    g.save(); if (!long) g.rotate(Math.PI / 2);
    if (z > 3) {
      // bays in rows across the deck, 2.5 m wide, 5 m deep, with a 7 m aisle between each pair of rows
      g.strokeStyle = 'rgba(240,240,236,0.55)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath();
      for (let y = -D / 2 + 0.02; y + 0.17 < D / 2; y += 0.17) { g.moveTo(-L / 2 + 0.06, y + 0.05); g.lineTo(L / 2 - 0.06, y + 0.05); if (z > 8) for (let x = -L / 2 + 0.06; x < L / 2 - 0.06; x += 0.025) { g.moveTo(x, y); g.lineTo(x, y + 0.05); g.moveTo(x, y + 0.05); g.lineTo(x, y + 0.1); } }
      g.stroke();
      if (z > 6) { let i = 0; for (let y = -D / 2 + 0.02; y + 0.17 < D / 2; y += 0.17) for (let x = -L / 2 + 0.07; x < L / 2 - 0.07; x += 0.025) { i++; if (U.hash(i, (p.x * 37) | 0) > 0.7) continue; g.fillStyle = CAR_COL[i % CAR_COL.length]; g.fillRect(x + 0.003, y + 0.004 + (i % 2) * 0.05, 0.018, 0.04); } }
      // ramps at the ends
      g.fillStyle = 'rgba(96,96,94,0.9)'; g.fillRect(-L / 2 + 0.02, -D / 2 + 0.02, 0.1, D * 0.3); g.fillRect(L / 2 - 0.12, D / 2 - 0.02 - D * 0.3, 0.1, D * 0.3);
    }
    g.restore();
  },
  saucer(g, p, w, h, px, z, night) {
    const R = Math.min(w, h) / 2;
    // two parabolic arches crossing, seen from above as two long legs, and the restaurant in the middle
    g.strokeStyle = night ? 'rgba(200,180,255,0.9)' : 'rgba(250,250,246,0.95)'; g.lineWidth = Math.max(0.01, R * 0.12); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-w / 2, -h / 2 * 0.2); g.lineTo(w / 2, h / 2 * 0.2); g.moveTo(-w / 2 * 0.2, -h / 2); g.lineTo(w / 2 * 0.2, h / 2); g.stroke(); g.lineCap = 'butt';
    g.fillStyle = night ? 'rgba(170,140,255,0.9)' : 'rgb(246,246,242)'; g.beginPath(); g.arc(0, 0, R * 0.45, 0, 7); g.fill();
    g.strokeStyle = 'rgba(80,90,100,0.6)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.beginPath(); g.arc(0, 0, R * 0.3, 0, 7); g.stroke();
  },
  glass(g, p, w, h, px, z, night) {
    g.fillStyle = night ? 'rgba(255,220,150,0.35)' : 'rgba(170,200,220,0.35)'; g.fillRect(-w / 2, -h / 2, w, h * 0.5);
    if (z > 5) { g.strokeStyle = 'rgba(40,50,60,0.35)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath(); for (let x = -w / 2; x < w / 2; x += 0.06) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); } g.stroke(); }
  }
};
const CAR_COL = ['rgb(200,202,206)', 'rgb(40,44,50)', 'rgb(150,30,36)', 'rgb(230,230,226)', 'rgb(60,80,120)', 'rgb(120,124,128)'];
/* a terminal or shed roof: parapet, roof panels, skylights along the spine, plant on the roof, glass on the long
   sides; a cargo shed gets loading doors instead */
function roof(g, p, w, h, px, z, night) {
  const long = w >= h, L = long ? w : h, D = long ? h : w, seed = Math.round(p.x * 37 + p.y * 11);
  g.save(); if (!long) g.rotate(Math.PI / 2);
  // the sunny half of a pitched roof a shade lighter; the parapet round the edge
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-L / 2, -D / 2, L, D * 0.5);
  if (z > 4) { g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(0.003, 0.6 * px); g.strokeRect(-L / 2 + 0.008, -D / 2 + 0.008, L - 0.016, D - 0.016); }
  if (z > 6) {
    // membrane strips, laid across the roof
    g.fillStyle = 'rgba(0,0,0,0.035)';
    for (let x = -L / 2, i = 0; x < L / 2; x += 0.05, i++) if (i % 2) g.fillRect(x, -D / 2, 0.05, D);
    g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = Math.max(0.002, 0.4 * px); g.beginPath();
    for (let x = -L / 2 + 0.25; x < L / 2; x += 0.25) { g.moveTo(x, -D / 2); g.lineTo(x, D / 2); }
    g.stroke();
    const glass = night ? 'rgba(255,226,160,0.85)' : 'rgba(120,168,200,0.85)';
    if (p.kind === 'terminal') {
      // a glazed spine: skylights in bays along the middle, their frames showing close in
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.15; x += 0.5) {
        const gr = g.createLinearGradient(0, -D * 0.07, 0, D * 0.07); gr.addColorStop(0, glass); gr.addColorStop(1, night ? 'rgba(255,200,120,0.7)' : 'rgba(80,120,150,0.85)');
        g.fillStyle = gr; g.fillRect(x, -D * 0.07, 0.34, D * 0.14);
        if (z > 25) { g.strokeStyle = 'rgba(40,50,60,0.5)'; g.lineWidth = Math.max(0.001, 0.4 * px); g.beginPath(); for (let k = 0.034; k < 0.34; k += 0.034) { g.moveTo(x + k, -D * 0.07); g.lineTo(x + k, D * 0.07); } g.stroke(); }
      }
      plant(g, L, D, seed, px, z, Math.floor(L / 0.9), 0.28);
    } else {
      // a shed: rows of square rooflights, a few fans; the loading doors along the landside wall
      g.fillStyle = night ? 'rgba(255,226,160,0.35)' : 'rgba(170,196,214,0.55)';
      for (let x = -L / 2 + 0.08; x < L / 2 - 0.08; x += 0.14) for (let y = -D / 2 + 0.1; y < D / 2 - 0.1; y += 0.16) g.fillRect(x, y, 0.035, 0.035);
      plant(g, L, D, seed, px, z, Math.floor(L / 2), 0.36);
      g.fillStyle = 'rgba(60,64,70,0.9)';
      for (let x = -L / 2 + 0.1; x < L / 2 - 0.1; x += 0.16) g.fillRect(x, D / 2 - 0.012, 0.1, 0.012);
    }
  }
  // glass on both long sides (lit at night)
  g.fillStyle = night ? 'rgba(255,220,150,0.7)' : 'rgba(70,110,140,0.75)';
  if (p.kind === 'terminal') { g.fillRect(-L / 2, -D / 2, L, Math.max(0.01, 0.9 * px)); g.fillRect(-L / 2, D / 2 - Math.max(0.01, 0.9 * px), L, Math.max(0.01, 0.9 * px)); }
  g.restore();
}
/* air-conditioning plant on a roof: units in pairs, each with its fans, casting a small shadow */
function plant(g, L, D, seed, px, z, n, off) {
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * L / n + (U.hash(i, seed) - 0.5) * 0.2, y = (U.hash(seed, i) > 0.5 ? 1 : -1) * D * off, uw = 0.07 + U.hash(i, 7) * 0.05, uh = 0.035;
    for (const k of [0, 1]) {
      const yy = y + k * (uh + 0.012) * (y > 0 ? -1 : 1);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - uw / 2 + 0.006, yy - uh / 2 + 0.006, uw, uh);
      g.fillStyle = 'rgb(150,154,158)'; g.fillRect(x - uw / 2, yy - uh / 2, uw, uh);
      if (z > 30) { g.fillStyle = 'rgb(70,74,80)'; const r = uh * 0.32; for (let f = -uw / 2 + r * 1.4; f < uw / 2 - r; f += r * 2.6) { g.beginPath(); g.arc(x + f, yy, r, 0, 7); g.fill(); } }
    }
  }
}
function drawLights(g, ap, px, z, light, now) {
  const k = U.clamp((0.55 - light) / 0.4, 0, 1);
  g.globalCompositeOperation = 'lighter';
  const dot = (x, y, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(r, 1.1 * px), 0, 7); g.fill(); };
  for (const rw of ap.parts.filter(p => p.kind === 'runway' && p.built && p.lit !== false)) {
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
  if (z > 1.5) for (const p of ap.parts.filter(q => q.kind === 'taxi' && q.built && !q.lane && q.lit !== false)) {
    for (let i = 1; i < p.nodes.length; i++) {
      const a = ap.nodes[p.nodes[i - 1]], b = ap.nodes[p.nodes[i]]; if (!a || !b) continue;
      const L = U.dist(a, b), nx = -(b.y - a.y) / (L || 1), ny = (b.x - a.x) / (L || 1);
      // edge lights 30 m apart close in; further out, fewer, so they read as dots and not a solid line
      for (let s = 0; s <= L; s += Math.max(0.3, 12 * px)) { const x = a.x + (b.x - a.x) * s / L, y = a.y + (b.y - a.y) * s / L; dot(x + nx * 0.13, y + ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); dot(x - nx * 0.13, y - ny * 0.13, `rgba(90,150,255,${0.8 * k})`, 0.012); }
    }
  }
  // floodlights along aprons and terminals: pools of light spaced along the building, not one glow for a whole concourse
  for (const p of ap.parts.filter(q => (q.kind === 'apron' || q.kind === 'terminal') && q.built && q.hp > q.max * 0.25)) {
    // an outline apron: high masts on a grid over the paving (kept until it moves)
    if (p.poly) {
      if (!p._masts || p._mk !== p.x + ',' + p.y + ',' + p.a) { p._mk = p.x + ',' + p.y + ',' + p.a; const P = IC.partShape(ap, p).poly.map(q => [q.x, q.y]), st = p.kind === 'terminal' ? 1.4 : 1.1; p._masts = []; for (let v = -p.h / 2 + st / 2; v < p.h / 2; v += st) for (let u = -p.w / 2 + st / 2; u < p.w / 2; u += st) { const c = IC.rectWorld(p, u, v); if (U.inPoly(c.x, c.y, P)) p._masts.push(c); } }
      for (const c of p._masts) { const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 0.8); gr.addColorStop(0, `rgba(255,214,150,${0.13 * k})`); gr.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, 0.8, 0, 7); g.fill(); }
      continue;
    }
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
  // roads first: dark asphalt with a pale edge, a centre line close in; roads in a tunnel only as a faint line,
  // upper decks after the buildings (below)
  g.lineCap = 'round'; g.lineJoin = 'round';
  landRoads(g, S, ap, L, px, z);
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  for (const it of L.items) {
    if (!vis(it)) continue;
    g.save(); g.translate(it.x, it.y); g.rotate(it.a || 0);
    const w = it.w, h = it.h, k = it.kind, use = it.use == null ? 0.5 : it.use;
    if (it.poly) { partPath(g, it, w, h); g.save(); g.clip(); }
    if (k === 'park' || k === 'taxi') {
      g.fillStyle = 'rgb(62,64,66)'; g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(150,150,142,0.9)'; g.lineWidth = Math.max(0.006, 0.7 * px); if (!it.poly) g.strokeRect(-w / 2, -h / 2, w, h);
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
        // trees: round the edge, and a planted strip down the middle of each double row
        if (k === 'park') {
          const T = [];
          for (let x = -w / 2 + 0.04; x < w / 2 - 0.02; x += 0.13) T.push(x, -h / 2 + 0.018, x + 0.06, h / 2 - 0.018);
          for (const y of rows) for (let x = -w / 2 + 0.08 + (U.hash(y * 100 | 0, 3) * 0.06); x < w / 2 - 0.06; x += 0.24) T.push(x, y + depth);
          const rad = i => 0.022 + 0.01 * U.hash(i, 9);
          g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); for (let i = 0; i < T.length; i += 2) { const r = rad(i); g.moveTo(T[i] + r + 0.012, T[i + 1] + 0.014); g.arc(T[i] + 0.012, T[i + 1] + 0.014, r, 0, 7); } g.fill();
          for (let i = 0; i < T.length; i += 2) { const r = rad(i); g.fillStyle = ['rgb(58,90,48)', 'rgb(70,102,54)', 'rgb(50,80,44)'][i % 3]; g.beginPath(); g.arc(T[i], T[i + 1], r, 0, 7); g.fill(); g.fillStyle = 'rgba(150,180,110,0.25)'; g.beginPath(); g.arc(T[i] - r * 0.3, T[i + 1] - r * 0.3, r * 0.5, 0, 7); g.fill(); }
        }
      }
      if (k === 'taxi') { g.fillStyle = 'rgb(200,196,186)'; g.fillRect(w / 2 - 0.16, -h / 2, 0.16, 0.12); }
    } else if (k === 'garage' && it.poly) {
      g.fillStyle = ROOF_FILL.deck; g.fillRect(-w / 2, -h / 2, w, h); ROOFS.deck(g, it, w, h, px, z, night);
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
    if (it.poly) { g.restore(); g.strokeStyle = k === 'park' || k === 'taxi' ? 'rgba(150,150,142,0.9)' : 'rgba(16,20,24,0.5)'; g.lineWidth = Math.max(0.005, 0.7 * px); partPath(g, it, w, h); g.stroke(); }
    else if (k !== 'park' && k !== 'taxi') { g.strokeStyle = 'rgba(16,20,24,0.5)'; g.lineWidth = Math.max(0.005, 0.7 * px); g.strokeRect(-w / 2, -h / 2, w, h); }
    g.restore();
    if (z > 30 && IC.cam.z < 200) lbl(g, (it.name || IC.LAND[k].name).toUpperCase(), it.x, it.y + 3 * px, px, 'rgba(236,236,226,0.7)', 7, 'center', 700);
  }
  // the upper decks: their shadow on the road below, concrete parapets, then the road on top
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of L.roads || []) if ((r.lv || 0) > 0) landRoad(g, r, px, z);
  g.lineCap = 'butt'; g.lineJoin = 'miter';
}
/* one landside road at its level: a tunnel as a faint dashed line, the ground as asphalt with a pale kerb, an upper
   deck with its shadow and parapets; lanes and arrows close in */
function landRoad(g, r, px, z) {
  const lv = r.lv || 0, path = () => { g.beginPath(); r.pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); };
  if (lv < 0) { path(); g.setLineDash([5 * px, 4 * px]); g.strokeStyle = 'rgba(150,150,142,0.45)'; g.lineWidth = Math.max(r.w * 0.6, 1.2 * px); g.stroke(); g.setLineDash([]); return; }
  if (lv > 0) { g.save(); g.translate(0.05 * lv, 0.06 * lv); path(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(r.w + 0.06, 2.6 * px); g.stroke(); g.restore(); }
  path();
  g.strokeStyle = lv > 0 ? 'rgb(196,196,190)' : 'rgb(150,150,142)'; g.lineWidth = Math.max(r.w + (lv > 0 ? 0.05 : 0.03), 2 * px); g.stroke();
  g.strokeStyle = lv > 0 ? 'rgb(70,72,74)' : 'rgb(58,60,62)'; g.lineWidth = Math.max(r.w, 1.4 * px); g.stroke();
  if (z > 25 && r.w > 0.1) {
    const lanes = r.lanes || (r.w > 0.2 ? 3 : 2), lw = r.w / lanes;
    g.strokeStyle = 'rgba(236,236,226,0.8)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.setLineDash([0.03, 0.03]);
    for (let k = 1; k < lanes; k++) { const off = -r.w / 2 + lw * k; g.beginPath(); r.pts.forEach((q, i) => { const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)], L = U.dist(a, b) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L; i ? g.lineTo(q.x + nx * off, q.y + ny * off) : g.moveTo(q.x + nx * off, q.y + ny * off); }); g.stroke(); }
    g.setLineDash([]);
    // one way: arrows along it
    if (r.oneway && z > 40) { g.fillStyle = 'rgba(236,236,226,0.8)'; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], L = U.dist(a, b), h = Math.atan2(b.y - a.y, b.x - a.x) + (r.oneway < 0 ? Math.PI : 0); for (let d = 0.2; d < L; d += 0.4) { const x = a.x + (b.x - a.x) * d / L, y = a.y + (b.y - a.y) * d / L; g.save(); g.translate(x, y); g.rotate(h); g.beginPath(); g.moveTo(0.025, 0); g.lineTo(-0.015, -0.012); g.lineTo(-0.015, 0.012); g.fill(); g.restore(); } } }
  }
}

/* the landside's roads on the ground (brief 46): kerbs, asphalt, the corners and T junctions as one surface with curb
   returns (roadgeom.js IC.landJoins), lanes and one-way arrows, and along the terminal the kerb: a drop-off lane
   and zebra crossings to the doors */
function landRoads(g, S, ap, L, px, z) {
  const R = (L.roads || []).filter(r => (r.lv || 0) === 0), J = z > 6 && IC.landJoins ? IC.landJoins(ap) : [];
  for (const r of L.roads || []) if ((r.lv || 0) < 0) landRoad(g, r, px, z);
  const path = r => { g.beginPath(); r.pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); };
  const poly = P => { g.beginPath(); P.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath(); };
  const G = J.map(j => IC.joinGeom(j, () => 0.06));
  g.lineCap = 'butt'; g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = 'rgb(150,150,142)';
  for (const r of R) { path(r); g.lineWidth = Math.max(r.w + 0.03, 2 * px); g.stroke(); }
  for (const q of G) { poly(q.surf); g.lineWidth = 0.03; g.stroke(); g.fill(); }
  const ASP = 'rgb(58,60,62)';
  g.strokeStyle = g.fillStyle = ASP;
  for (const r of R) { path(r); g.lineWidth = Math.max(r.w, 1.4 * px); g.stroke(); }
  for (const q of G) { poly(q.surf); g.fill(); }
  if (z > 25) {
    for (const r of R) if (r.w > 0.1) {
      const lanes = r.lanes || (r.w > 0.2 ? 3 : 2), lw = r.w / lanes;
      g.strokeStyle = 'rgba(236,236,226,0.8)'; g.lineWidth = Math.max(0.003, 0.5 * px); g.setLineDash([0.03, 0.03]);
      for (let k = 1; k < lanes; k++) { g.beginPath(); IC.PL.offset(r.pts, -r.w / 2 + lw * k).forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke(); }
      g.setLineDash([]);
    }
    // the junctions over the lane lines, with their kerbs
    g.fillStyle = ASP; for (const q of G) { poly(q.surf); g.fill(); }
    g.strokeStyle = 'rgba(200,200,192,0.9)'; g.lineWidth = Math.max(0.004, 0.8 * px);
    for (const q of G) for (const f of q.fil) if (f) { g.beginPath(); f.arc.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    // one way: arrows along it
    for (const r of R) if (r.oneway) {
      g.fillStyle = 'rgba(236,236,226,0.85)';
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i], LL = U.dist(a, b), hd = Math.atan2(b.y - a.y, b.x - a.x) + (r.oneway < 0 ? Math.PI : 0);
        for (let d = 0.25; d < LL - 0.15; d += 0.45) for (const o of r.kerb ? [-r.w / 6, r.w / 6] : [0]) {
          const x = a.x + (b.x - a.x) * d / LL, y = a.y + (b.y - a.y) * d / LL;
          g.save(); g.translate(x - Math.sin(hd) * o, y + Math.cos(hd) * o); g.rotate(hd);
          g.beginPath(); g.moveTo(0.03, 0); g.lineTo(0.008, -0.011); g.lineTo(0.008, -0.004); g.lineTo(-0.03, -0.004); g.lineTo(-0.03, 0.004); g.lineTo(0.008, 0.004); g.lineTo(0.008, 0.011); g.closePath(); g.fill();
          g.restore();
        }
      }
    }
    // the kerb along a terminal: the drop-off lane beside the building, bays marked in it, zebras to the doors
    for (const r of R) if (r.kerb) {
      const t = ap.parts.find(p => p.id === r.by); if (!t) continue;
      const a = r.pts[0], b = r.pts[r.pts.length - 1], LL = U.dist(a, b) || 1, ux = (b.x - a.x) / LL, uy = (b.y - a.y) / LL;
      const sd = Math.sign((t.x - a.x) * -uy + (t.y - a.y) * ux) || 1, nx = -uy * sd, ny = ux * sd, lane = r.w / 3;
      const P = (s, o) => ({ x: a.x + ux * s + nx * o, y: a.y + uy * s + ny * o });
      g.strokeStyle = 'rgba(236,236,226,0.85)'; g.lineWidth = Math.max(0.003, 0.6 * px);
      g.beginPath(); const p0 = P(0.2, r.w / 2 - lane), p1 = P(LL - 0.2, r.w / 2 - lane); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      if (z > 60) { g.beginPath(); for (let s0 = 0.2; s0 < LL - 0.2; s0 += 0.065) { const q0 = P(s0, r.w / 2 - lane), q1 = P(s0, r.w / 2 - 0.004); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); } g.stroke(); }
      // zebras across to the terminal's doors
      g.fillStyle = 'rgba(240,240,232,0.9)';
      for (let s0 = 0.5; s0 < LL - 0.4; s0 += 0.9) {
        const n = 9, st = (r.w + 0.02) / n; g.beginPath();
        for (let i = 0; i < n; i += 2) { const o0 = -r.w / 2 - 0.01 + i * st, Q = [P(s0, o0), P(s0, o0 + st), P(s0 + 0.035, o0 + st), P(s0 + 0.035, o0)]; g.moveTo(Q[0].x, Q[0].y); for (const q of Q.slice(1)) g.lineTo(q.x, q.y); g.closePath(); }
        if (st * z > 1.2) g.fill(); else { g.globalAlpha = 0.5; poly([P(s0, -r.w / 2), P(s0, r.w / 2), P(s0 + 0.035, r.w / 2), P(s0 + 0.035, -r.w / 2)]); g.fill(); g.globalAlpha = 1; }
      }
    }
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
  // the front: where the grading, paving, painting or wiring has got to; the inspection drives up and down
  const front = st.k === 'open' ? 0.5 + 0.4 * Math.sin(now * 0.3 + p.x) : f;
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
  if (m.kind === 'bulldoze' || m.kind === 'upgrade' || m.kind === 'bpick') { drawToolHover(g, S, m, hv, px); return; }
  if (m.kind === 'bmove') {
    const p = m.part, probe = Object.assign({}, p, { x: hv.x, y: hv.y, a: m.rot });
    m.ap.parts = m.ap.parts.filter(q => q !== p); const ok = IC.aptCanPlace(S, m.ap, probe), why = IC.aptPlaceWhy; m.ap.parts.push(p);
    const P = IC.partOutline(probe); g.beginPath(); P.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](c.x, c.y)); g.closePath(); g.fillStyle = ok ? OKF : NOF; g.fill(); g.strokeStyle = ok ? OKC : NOC; g.lineWidth = 1.5 * px; g.stroke();
    g.setLineDash([4 * px, 4 * px]); g.strokeStyle = 'rgba(236,240,244,0.5)'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(hv.x, hv.y); g.stroke(); g.setLineDash([]);
    pill(g, ok ? (m.cost ? `put up here: ${U.money(m.cost)}` : 'moves here: free') : (why || 'does not fit here').replace(/\.$/, ''), hv.x, hv.y - 18 * px, px, ok ? '#b4f5c6' : '#ffb0a8');
    return;
  }
  if (m.kind !== 'build') return;
  const ap = m.ap, tol = Math.max(0.12, 8 * px);
  // the plan is worked out again only when the cursor or the plan changes
  const free = !!IC.bldFree;
  const key = `${m.part}|${hv.x.toFixed(2)},${hv.y.toFixed(2)}|${m.pts.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(';')}|${m.mat}|${m.size}|${m.rot}|${m.fillet}|${ap.parts.length}|${ap.nodeN}|${Math.round(S.budget)}|${free}|${tol.toFixed(2)}`;
  if (key !== ghostKey) { ghostKey = key; ghostPlan = IC.bldPlanOf(S, m, hv, tol, free); }
  const plan = ghostPlan, ok = plan.ok;
  const col = ok ? 'rgba(110,230,140,0.95)' : 'rgba(255,91,79,0.95)', fill = ok ? 'rgba(110,230,140,0.2)' : 'rgba(255,91,79,0.2)';
  // homes that would come down
  for (const b of plan.blocks || []) { g.save(); g.translate(b.x, b.y); g.rotate(b.a || 0); g.strokeStyle = IC.C.hostile; g.lineWidth = 1.4 * px; g.fillStyle = 'rgba(255,91,79,0.3)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore(); }
  // the part in the way of a plan that cannot be built
  if (!ok && plan.hit) drawHit(g, m.ap, plan.hit, px);
  // a blueprint: the whole airport where it would go
  if (plan.bp && plan.bp.t) drawBlueprint(g, plan.bp.t, col, fill, px);
  // a runway that paving next to would close
  if (plan.near) { const rw = plan.near, c = IC.rwAt(rw, 0.5), d = IC.rwDir(rw); g.save(); g.translate(c.x, c.y); g.rotate(Math.atan2(d.y, d.x)); g.fillStyle = 'rgba(242,180,65,0.25)'; g.fillRect(-IC.rwLen(rw) / 2, -rw.w, IC.rwLen(rw), rw.w * 2); g.restore(); }
  for (const sp of plan.specs) {
    const D = IC.APART[sp.kind];
    g.strokeStyle = col; g.fillStyle = fill; g.lineWidth = 1.5 * px;
    if (sp.kind === 'taxi' || sp.kind === 'runway' || sp.kind === 'svcroad') {
      const pts = sp.kind === 'runway' ? [sp.a, sp.b] : sp.pts;
      g.lineCap = sp.kind === 'runway' ? 'butt' : 'round'; g.lineJoin = 'round'; g.globalAlpha = 0.55;
      g.strokeStyle = ok ? (sp.kind === 'runway' ? 'rgba(190,240,200,0.9)' : 'rgba(110,230,140,0.9)') : 'rgba(255,91,79,0.9)'; g.lineWidth = Math.max(sp.w || (D ? D.w : IC.SVC_ROAD_W), 2 * px);
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
  // the guides the point locked onto, and the straight line from the last point
  const sn = plan.snap;
  if (sn) drawGuides(g, m, sn, px);
  // the snap target
  if (sn) {
    const c2 = sn.kind === 'free' ? 'rgba(200,210,220,0.8)' : sn.kind === 'rwy' ? 'rgba(255,240,200,0.95)' : IC.C.ok;
    g.strokeStyle = c2; g.lineWidth = 1.5 * px; g.beginPath();
    if (sn.kind === 'free') { g.moveTo(sn.x - 5 * px, sn.y); g.lineTo(sn.x + 5 * px, sn.y); g.moveTo(sn.x, sn.y - 5 * px); g.lineTo(sn.x, sn.y + 5 * px); } else g.arc(sn.x, sn.y, 5 * px, 0, 7);
    g.stroke();
    const tag = [{ node: 'joins', rwy: 'onto runway', taxi: 'joins taxiway', apron: 'joins apron', corner: `corner of the ${sn.what || 'part'}`, edge: sn.what ? (sn.face ? 'faces the ' : 'flush with the ') + sn.what : 'edge' }[sn.kind], sn.lock, sn.guides && !sn.lock ? 'on the ' + sn.guides.map(q => q.what).join(' and ') : ''].filter(Boolean).join(' · ');
    const dist = (plan.marks || []).find(k => k.cursor);
    let y = sn.y + 17 * px;
    if (tag) { pill(g, tag, sn.x, y, px, sn.kind === 'free' && !sn.lock && !sn.guides ? IC.C.muted : GUIDE_T); y += 15 * px; }
    if (dist) pill(g, dist.t, sn.x, y, px, 'rgba(200,215,228,0.95)');
  }
  // lengths on their legs, an area's sides beside them
  for (const k of plan.marks || []) if (!k.cursor) pill(g, k.t, k.x + (k.n ? k.n.x * 14 * px : 0), k.y + (k.n ? k.n.y * 14 * px : 0), px, GUIDE_T, k.n && !k.leg ? k.n : null);
  // cost and what it does, beside the cursor on a dark card; a part far bigger than needed says so in amber
  const lines = [];
  const add = (t, c, b) => { for (const w of wrap(t, 62)) { lines.push({ t: w, c, b }); b = false; } };
  if (ok) add(plan.text[0] || '', IC.C.text, true); else add(plan.why, IC.C.hostile, true);
  if (plan.size) add(plan.size, IC.C.amber, true);
  for (const t of plan.text.slice(ok ? 1 : 0, ok ? 3 : 1)) add(t, 'rgba(210,225,235,0.85)', false);
  const sc = IC.toScreen(hv.x, hv.y), left = sc.x > IC.cam.vw - (IC.ui.mapRight || 0) - 480;
  g.font = `500 ${9.5 * px}px "IBM Plex Mono", monospace`;
  const W = Math.max(...lines.map(l => g.measureText(l.t).width)) + 12 * px, H = lines.length * 13 * px + 8 * px;
  // (kept clear of the panels over the map: the goals on the left, the airport panel on the right)
  const lo = IC.cam.x + (IC.ui.mapLeft || 0) / IC.cam.z, hi = IC.cam.x + (IC.cam.vw - (IC.ui.mapRight || 0)) / IC.cam.z - W;
  const x0 = U.clamp(left ? hv.x - 20 * px - W : hv.x + 20 * px, lo, Math.max(lo, hi)), y0 = hv.y - 44 * px - H / 2 + 12 * px;
  g.fillStyle = 'rgba(12,18,24,0.74)'; g.fillRect(x0, y0, W, H);
  if (!ok) { g.fillStyle = IC.C.hostile; g.fillRect(x0, y0, 2 * px, H); }
  lines.forEach((l, i) => { g.font = `${l.b ? 700 : 500} ${9.5 * px}px "IBM Plex Mono", monospace`; g.fillStyle = l.c; g.fillText(l.t, x0 + 6 * px, y0 + 14 * px + i * 13 * px); });
  const need = IC.bldIsLine(m.part) || IC.bldIsArea(m.part) ? 2 : 1;
  if (ok && pts.length >= need && m.part !== 'stand') { const q = m.part === 'parallel' ? hv : pts[pts.length - 1]; lbl(g, 'click again to build', q.x, q.y + 28 * px, px, IC.C.ok, 8.5, 'center', 700); }
};
/* words broken into lines of at most n characters */
function wrap(t, n) { const out = []; let cur = ''; for (const w of String(t).split(' ')) { if (cur && cur.length + w.length + 1 > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out; }
/* guides: dashed lines from the edge or centreline a point locked onto, through the point and a little beyond; a
   locked line runs on from the last point so the player sees it is straight */
const GUIDE = 'rgba(150,215,255,0.55)', GUIDE_T = 'rgba(170,225,255,0.95)';
function drawGuides(g, m, sn, px) {
  g.save(); g.strokeStyle = GUIDE; g.lineWidth = Math.max(0.004, 1 * px); g.setLineDash([6 * px, 5 * px]);
  for (const q of sn.guides || []) {
    // from the nearer end of what the guide comes from
    const ta = (q.a.x - sn.x) * q.ux + (q.a.y - sn.y) * q.uy, tb = (q.b.x - sn.x) * q.ux + (q.b.y - sn.y) * q.uy;
    const from = Math.abs(ta) < Math.abs(tb) ? ta : tb, lo = Math.min(from, 0) - 60 * px, hi = Math.max(from, 0) + 60 * px;
    if (ta * tb < 0) continue;   // the point is on the part itself: nothing to extend
    g.beginPath(); g.moveTo(sn.x + q.ux * lo, sn.y + q.uy * lo); g.lineTo(sn.x + q.ux * hi, sn.y + q.uy * hi); g.stroke();
  }
  const prev = IC.bldFrom(m);
  if (sn.lock && prev) {
    const L = U.dist(prev, sn) || 1, ux = (sn.x - prev.x) / L, uy = (sn.y - prev.y) / L;
    g.strokeStyle = 'rgba(150,215,255,0.35)'; g.beginPath(); g.moveTo(sn.x, sn.y); g.lineTo(sn.x + ux * 90 * px, sn.y + uy * 90 * px); g.stroke();
    // the angle at the last point: the reference line, and a square corner or an arc
    if (sn.lockRef != null) {
      const r = 16 * px, rx = Math.cos(sn.lockRef), ry = Math.sin(sn.lockRef), side = Math.sign(rx * uy - ry * ux) || 1;
      g.setLineDash([]); g.strokeStyle = GUIDE_T; g.lineWidth = Math.max(0.004, 1.1 * px);
      g.beginPath(); g.moveTo(prev.x - rx * r * 1.6, prev.y - ry * r * 1.6); g.lineTo(prev.x + rx * r * 1.6, prev.y + ry * r * 1.6); g.stroke();
      if (sn.lockK === 2) { const q = r * 0.55; g.beginPath(); g.moveTo(prev.x + rx * q, prev.y + ry * q); g.lineTo(prev.x + rx * q + ux * q, prev.y + ry * q + uy * q); g.lineTo(prev.x + ux * q, prev.y + uy * q); g.stroke(); }
      else if (sn.lockK) { const a0 = sn.lockRef, a1 = Math.atan2(uy, ux); g.beginPath(); g.arc(prev.x, prev.y, r * 0.8, a0, a1, side < 0); g.stroke(); }
    }
  }
  g.restore();
  // where two guides cross, a small square
  if (sn.guides && sn.guides.length > 1) { g.strokeStyle = GUIDE_T; g.lineWidth = 1.2 * px; g.strokeRect(sn.x - 3.5 * px, sn.y - 3.5 * px, 7 * px, 7 * px); }
}
/* the part a refused plan runs into, outlined in red */
function drawHit(g, ap, q, px, col, fill) {
  g.save(); g.strokeStyle = col || IC.C.hostile; g.lineWidth = 2 * px; g.setLineDash([4 * px, 3 * px]); g.fillStyle = fill || 'rgba(255,91,79,0.12)';
  if (q.kind === 'runway') { const c = IC.rwAt(q, 0.5), d = IC.rwDir(q), L = IC.rwLen(q); g.translate(c.x, c.y); g.rotate(Math.atan2(d.y, d.x)); g.fillRect(-L / 2, -q.w / 2, L, q.w); g.strokeRect(-L / 2, -q.w / 2, L, q.w); }
  else if (q.kind === 'taxi') { g.lineWidth = Math.max(q.w, 3 * px); g.strokeStyle = fill ? col : 'rgba(255,91,79,0.45)'; g.globalAlpha = fill ? 0.5 : 1; g.beginPath(); q.nodes.forEach((id, i) => { const n = ap.nodes[id]; if (n) i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y); }); g.stroke(); }
  else if (q.x != null) { const P = IC.partOutline(q); g.beginPath(); P.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](c.x, c.y)); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
/* the build bar's tools under the cursor: the part they would act on, outlined, and what it would cost or return */
const OKC = 'rgba(110,230,140,0.95)', OKF = 'rgba(110,230,140,0.16)', NOC = 'rgba(255,91,79,0.95)', NOF = 'rgba(255,91,79,0.16)';
function drawToolHover(g, S, m, hv, px) {
  const part = IC.partAt(m.ap, hv, 6 * px);
  if (!part) { pill(g, m.kind === 'bulldoze' ? 'click a part to remove it' : m.kind === 'upgrade' ? 'click a runway, taxiway or apron' : 'click a building to move it', hv.x, hv.y - 16 * px, px, 'rgba(236,240,244,0.9)'); return; }
  let t = '', ok = true;
  if (m.kind === 'bulldoze') { const q = IC.bldRefund(S, m.ap, part); ok = !q.why; t = q.why ? q.why.split(':')[0].split('.')[0] : q.refund ? `remove: ${U.money(q.refund)} back` : 'remove: nothing back'; }
  else if (m.kind === 'upgrade') { const q = IC.bldUpgradeCost(S, m.ap, part, { mat: m.mat, lit: m.lit !== false, w: part.kind === 'runway' ? m.rwid : part.kind === 'taxi' ? m.twid : null }); ok = !q.why; t = q.why ? q.why.replace(/\.$/, '') : `${q.what.join(', ')}: ${q.cost ? '+' + U.money(q.cost) : 'no charge'} · ${U.dur(q.dur)}`; }
  else { const q = IC.bldRelocateCost(S, m.ap, part); ok = !q.why; t = q.why ? q.why.split(':')[0].replace(/\.$/, '') : q.cost ? `move: ${U.money(q.cost)}, rebuilt at half price` : 'move: free until its earthworks start'; }
  const bad = m.kind === 'bulldoze' ? ok : !ok;
  drawHit(g, m.ap, part, px, bad ? NOC : OKC, bad ? NOF : OKF);
  pill(g, `${part.name || IC.APART[part.kind].name}: ${t}`, hv.x, hv.y - 16 * px, px, ok ? (m.kind === 'bulldoze' ? '#ffb0a8' : '#b4f5c6') : '#ffb0a8');
}
/* a measurement on a dark pill, readable on grass and on concrete; with a side (n), set off that way from the point */
function pill(g, t, x, y, px, col, n) {
  g.font = `600 ${9 * px}px "IBM Plex Mono", monospace`;
  const w = g.measureText(t).width + 8 * px, h = 13 * px;
  if (n) { x += n.x * (w / 2 - 6 * px); y += n.y * (h / 2 - 2 * px); }
  g.fillStyle = 'rgba(12,18,24,0.72)'; g.fillRect(x - w / 2, y - h / 2, w, h);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 0.5 * px); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
}
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
