/* Iron Canopy — map rendering. Symbols keep a readable screen size; the world underneath gains detail as the
   camera closes in: vehicles around their symbols, aircraft silhouettes with ground shadows showing altitude,
   base layouts, smoke that drifts for hours. */
(function (IC) {
'use strict';
const U = IC.U;
const C = IC.C = {
  friend: '#6fd2ff', friendFill: '#80e0ff', hostile: '#ff5b4f', hostileFill: '#ff8a80', suspect: '#ff9a3c', suspectFill: '#ffc080',
  unknown: '#f2d14a', unknownFill: '#ffff80', civil: '#7fe8b0', decoy: '#8fa3b0', amber: '#f2b441', text: '#e4edf2', muted: '#9ab0bf', ink: '#0a1620', ok: '#58d39a', supply: '#e0b458',
  light: '#c9b0ff', airway: '#8fd8ff'
};
const cam = IC.cam = { x: 3000, y: 2250, z: 0.2, vw: 800, vh: 600 };
let ctx, cv, dpr = 1, hatchR = null, hatchB = null;
const cov = document.createElement('canvas'); cov.width = 600; cov.height = 450;
const cx2 = cov.getContext('2d');
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const inView = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
let closeTex = null;
/* 0 on the strategic map, 1 close in: effects drawn big for readability far out shrink to their real size near */
let WF = 0;
/* grass, soil and stones at a few metres per pixel, tileable */
function makeCloseTex() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = U.pfbm(x / 16, y / 16, 16), f = U.hash(x, y);
    const v = 110 + (n - 0.5) * 120 + (f - 0.5) * 50, i = (y * N + x) * 4;
    d[i] = v * 0.95; d[i + 1] = v; d[i + 2] = v * 0.85; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

IC.initRender = function (canvas) {
  cv = canvas; ctx = cv.getContext('2d'); dpr = Math.min(2, window.devicePixelRatio || 1);
  const mk = (col) => { const h = document.createElement('canvas'); h.width = 14; h.height = 14; const g = h.getContext('2d'); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 14); g.lineTo(14, 0); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(10, 18); g.lineTo(18, 10); g.stroke(); return ctx.createPattern(h, 'repeat'); };
  hatchR = mk('rgba(255,90,70,0.35)'); hatchB = mk('rgba(110,200,255,0.25)');
};
IC.dpr = () => dpr;
IC.resizeRender = function (w, h) { cam.vw = w; cam.vh = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); IC.clampCam(); };
IC.minZoom = () => Math.min(cam.vw / IC.WW, cam.vh / IC.WH) * 0.95;
IC.clampCam = function () {
  cam.z = U.clamp(cam.z, IC.minZoom(), IC.MAXZ);
  const w = cam.vw / cam.z, h = cam.vh / cam.z;
  cam.x = w >= IC.WW ? (IC.WW - w) / 2 : U.clamp(cam.x, -w * 0.2, IC.WW - w * 0.8);
  cam.y = h >= IC.WH ? (IC.WH - h) / 2 : U.clamp(cam.y, -h * 0.2, IC.WH - h * 0.8);
};
IC.zoomAt = function (sx, sy, f) {
  const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
  cam.z = U.clamp(cam.z * f, IC.minZoom(), IC.MAXZ);
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; IC.clampCam(); cam.fly = null;
};
IC.centerOn = function (x, y) { cam.x = x - cam.vw / cam.z / 2; cam.y = y - cam.vh / cam.z / 2; IC.clampCam(); };
/* smooth camera moves for jumps and cinematic moments */
IC.flyTo = function (x, y, z) { cam.fly = { x, y, z: z || cam.z, t: 0 }; };
IC.camStep = function (dt) {
  const f = cam.fly; if (!f) return;
  const k = 1 - Math.exp(-dt * 5);
  const cxw = cam.x + cam.vw / cam.z / 2, cyw = cam.y + cam.vh / cam.z / 2;
  cam.z = cam.z + (f.z - cam.z) * k;
  const nx = cxw + (f.x - cxw) * k, ny = cyw + (f.y - cyw) * k;
  IC.centerOn(nx, ny);
  if (Math.abs(nx - f.x) < 2 && Math.abs(ny - f.y) < 2 && Math.abs(cam.z - f.z) < 0.002) cam.fly = null;
};
IC.toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });
IC.toScreen = (x, y) => ({ x: (x - cam.x) * cam.z, y: (y - cam.y) * cam.z });
IC.daylight = function (t) {
  const h = (t % 86400) / 3600;
  if (h < 5 || h > 20.5) return 0;
  if (h < 7.5) return (h - 5) / 2.5;
  if (h > 18) return 1 - (h - 18) / 2.5;
  return 1;
};

/* ---------- NATO APP-6 style symbols ---------- */
const AFF = { f: [C.friendFill, C.ink], h: [C.hostileFill, '#1a0806'], u: [C.unknownFill, '#1a1606'], n: ['#aaffaa', '#061a0b'] };
function frame(g, aff, x, y, s) {
  const [fill, ink] = AFF[aff];
  g.fillStyle = fill; g.strokeStyle = ink; g.lineWidth = 1.3 * s;
  g.beginPath();
  if (aff === 'f') g.rect(x - 11 * s, y - 7.5 * s, 22 * s, 15 * s);
  else if (aff === 'h') { g.moveTo(x, y - 11 * s); g.lineTo(x + 11 * s, y); g.lineTo(x, y + 11 * s); g.lineTo(x - 11 * s, y); g.closePath(); }
  else { g.arc(x - 4 * s, y, 6 * s, Math.PI * 0.5, Math.PI * 1.5); g.arc(x, y - 4 * s, 6 * s, Math.PI, 0); g.arc(x + 4 * s, y, 6 * s, -Math.PI * 0.5, Math.PI * 0.5); g.arc(x, y + 4 * s, 6 * s, 0, Math.PI); g.closePath(); }
  g.fill(); g.stroke();
  return ink;
}
function groundIcon(g, sym, x, y, s, ink, aff) {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1.2 * s;
  const w = aff === 'h' ? 6 * s : 10 * s, h = aff === 'h' ? 6 * s : 6.5 * s;
  const X = () => { g.beginPath(); g.moveTo(x - w, y - h); g.lineTo(x + w, y + h); g.moveTo(x - w, y + h); g.lineTo(x + w, y - h); g.stroke(); };
  const O = () => { g.beginPath(); g.ellipse(x, y, w * 0.62, h * 0.55, 0, 0, 7); g.stroke(); };
  if (sym === 'inf') X();
  else if (sym === 'armor') O();
  else if (sym === 'mech') { X(); O(); }
  else if (sym === 'arty') { g.beginPath(); g.arc(x, y, 2.4 * s, 0, 7); g.fill(); }
}
const ORDER_ICON = { hold: '▬', dig: '⛉', attack: '➤', defend: '⌂', reserve: 'R', refit: '✚', staging: '', reserveE: '' };
IC.drawGround = function (g, u, x, y, s, alpha) {
  const aff = u.side === 'us' ? 'f' : 'h';
  g.globalAlpha = alpha == null ? 1 : alpha;
  const ink = frame(g, aff, x, y, s);
  groundIcon(g, u.g.sym, x, y, s, ink, aff);
  g.fillStyle = aff === 'f' ? C.friend : C.hostile;
  g.font = `700 ${8 * s}px "IBM Plex Mono", monospace`; g.textAlign = 'center';
  g.fillText(u.g.ech, x, y - (aff === 'h' ? 13 : 10) * s);
  g.textAlign = 'left'; g.globalAlpha = 1;
};
function unitIcon(g, d, x, y, s, ink) {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1.2 * s;
  if (d.weapon === 'sam' || d.weapon === 'gun' || d.weapon === 'laser' || d.weapon === 'hpm') { g.beginPath(); g.arc(x, y + 7.5 * s, 8 * s, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  else if (d.sensor && !d.sensor.passive) { g.beginPath(); g.arc(x - 6 * s, y + 2 * s, 3.5 * s, -1.9, 0.3); g.stroke(); }
  else if (d.logi) { g.beginPath(); g.moveTo(x - 11 * s, y + 3.5 * s); g.lineTo(x + 11 * s, y + 3.5 * s); g.stroke(); }
  g.font = `700 ${(d.nato.length > 2 ? 5.6 : 6.6) * s}px "IBM Plex Mono", monospace`; g.textAlign = 'center';
  g.fillText(d.nato, x + (d.sensor && !d.sensor.passive ? 2 * s : 0), y + (d.logi ? 1.5 : 1) * s);
  g.textAlign = 'left';
}
IC.drawUnitSymbol = function (g, type, x, y, s, col, opts) {
  const d = IC.UNITS[type];
  opts = opts || {};
  const ink = frame(g, opts.aff || 'f', x, y, s);
  if (opts.tint) { g.fillStyle = opts.tint; g.fillRect(x - 11 * s, y - 7.5 * s, 22 * s, 15 * s); }
  if (opts.dash) { g.strokeStyle = C.ink; g.setLineDash([2 * s, 2 * s]); g.lineWidth = 1.6 * s; g.strokeRect(x - 11 * s, y - 7.5 * s, 22 * s, 15 * s); g.setLineDash([]); }
  unitIcon(g, d, x, y, s, ink);
  g.strokeStyle = col || C.friend; g.lineWidth = 1 * s;
  if (d.mob === 'mobile') { g.beginPath(); g.ellipse(x, y + 10.5 * s, 8 * s, 1.8 * s, 0, 0, 7); g.stroke(); }
  else if (d.mob === 'semi') { g.beginPath(); g.arc(x - 5 * s, y + 10.5 * s, 1.8 * s, 0, 7); g.arc(x + 5 * s, y + 10.5 * s, 1.8 * s, 0, 7); g.stroke(); }
};
/* air track frames: friend dome, hostile/suspect peak, unknown clover, civil box */
const AIRCOL = { F: C.friend, H: C.hostile, S: C.suspect, U: C.unknown, A: C.civil, N: C.civil, D: C.decoy };
function airFrame(g, aff, x, y, s) {
  const col = AIRCOL[aff] || C.unknown;
  g.strokeStyle = col; g.lineWidth = 1.6 * s;
  g.fillStyle = { H: 'rgba(255,91,79,0.25)', S: 'rgba(255,154,60,0.25)', U: 'rgba(242,209,74,0.22)', A: 'rgba(127,232,176,0.12)', N: 'rgba(127,232,176,0.18)', D: 'rgba(143,163,176,0.1)', F: 'rgba(111,210,255,0.25)' }[aff];
  g.beginPath();
  if (aff === 'H' || aff === 'S' || aff === 'D') { g.moveTo(x - 7 * s, y + 3 * s); g.lineTo(x - 7 * s, y - 1 * s); g.lineTo(x, y - 8 * s); g.lineTo(x + 7 * s, y - 1 * s); g.lineTo(x + 7 * s, y + 3 * s); }
  else if (aff === 'U') { g.arc(x - 4.5 * s, y, 3.5 * s, Math.PI, Math.PI * 1.6); g.arc(x, y - 3.5 * s, 3.8 * s, Math.PI * 1.15, Math.PI * 1.85); g.arc(x + 4.5 * s, y, 3.5 * s, Math.PI * 1.4, 0); g.lineTo(x + 8 * s, y + 3 * s); g.lineTo(x - 8 * s, y + 3 * s); g.closePath(); }
  else if (aff === 'A' || aff === 'N') { g.moveTo(x - 7 * s, y + 3 * s); g.lineTo(x - 7 * s, y - 6 * s); g.lineTo(x + 7 * s, y - 6 * s); g.lineTo(x + 7 * s, y + 3 * s); }
  else g.arc(x, y + 3 * s, 7.5 * s, Math.PI, 0);
  if (aff === 'D' || aff === 'A' || aff === 'S') g.setLineDash([2.5 * s, 2 * s]);
  g.fill(); g.stroke(); g.setLineDash([]);
  return col;
}
IC.airFrame = airFrame;
/* top-down silhouettes for the close zoom */
function silhouette(g, kind, x, y, h, s, fill, stroke) {
  g.save(); g.translate(x, y); g.rotate(h); g.scale(s, s);
  g.fillStyle = fill; g.strokeStyle = stroke || 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6;
  g.beginPath();
  if (kind === 'fighter') { g.moveTo(9, 0); g.lineTo(2, -1.2); g.lineTo(-2, -7); g.lineTo(-4, -7); g.lineTo(-3, -1.5); g.lineTo(-7, -3.5); g.lineTo(-8, -3.5); g.lineTo(-7, 0); g.lineTo(-8, 3.5); g.lineTo(-7, 3.5); g.lineTo(-3, 1.5); g.lineTo(-4, 7); g.lineTo(-2, 7); g.lineTo(2, 1.2); g.closePath(); }
  else if (kind === 'bomber' || kind === 'airliner' || kind === 'transport' || kind === 'jammer') { const L = kind === 'airliner' ? 1 : 1.1; g.moveTo(10 * L, 0); g.lineTo(8 * L, -1); g.lineTo(1, -1); g.lineTo(-2, -10); g.lineTo(-4, -10); g.lineTo(-2, -1); g.lineTo(-7, -1); g.lineTo(-9, -4); g.lineTo(-10, -4); g.lineTo(-9, 0); g.lineTo(-10, 4); g.lineTo(-9, 4); g.lineTo(-7, 1); g.lineTo(-2, 1); g.lineTo(-4, 10); g.lineTo(-2, 10); g.lineTo(1, 1); g.lineTo(8 * L, 1); g.closePath(); }
  else if (kind === 'light') { g.moveTo(5, 0); g.lineTo(1, -0.6); g.lineTo(1, -6); g.lineTo(-0.5, -6); g.lineTo(-0.5, -0.6); g.lineTo(-4, -0.4); g.lineTo(-5, -2); g.lineTo(-5.5, 0); g.lineTo(-5, 2); g.lineTo(-4, 0.4); g.lineTo(-0.5, 0.6); g.lineTo(-0.5, 6); g.lineTo(1, 6); g.lineTo(1, 0.6); g.closePath(); }
  else if (kind === 'drone') { g.moveTo(4, 0); g.lineTo(-3, -5); g.lineTo(-2, 0); g.lineTo(-3, 5); g.closePath(); }
  else if (kind === 'cm') { g.moveTo(5, 0); g.lineTo(-4, -0.7); g.lineTo(-4, -2.5); g.lineTo(-5, -2.5); g.lineTo(-5, 2.5); g.lineTo(-4, 2.5); g.lineTo(-4, 0.7); g.closePath(); }
  else if (kind === 'heli') { g.ellipse(0, 0, 3.5, 1.8, 0, 0, 7); g.moveTo(-3, 0); g.lineTo(-9, 0); }
  else { g.arc(0, 0, 2, 0, 7); }
  g.fill(); g.stroke();
  g.restore();
}

/* ---------- main draw ---------- */
IC.render = function (S, now) {
  const z = cam.z, px = 1 / z;
  WF = U.clamp((z - 0.8) / 4, 0, 1);
  let sx = 0, sy = 0;
  if (S.shake > 0.3) { sx = (Math.random() - 0.5) * S.shake; sy = (Math.random() - 0.5) * S.shake; }
  S.shake *= 0.88;
  view = { x0: cam.x, y0: cam.y, x1: cam.x + cam.vw / z, y1: cam.y + cam.vh / z };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#04080c'; ctx.fillRect(0, 0, cam.vw, cam.vh);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, (-cam.x * z + sx) * dpr, (-cam.y * z + sy) * dpr);
  ctx.imageSmoothingEnabled = true;
  IC.drawTerrain(ctx, S.terrain, cam, dpr, S.paused ? 14 : 7);
  if (z * dpr >= 1.3) drawRoads(S, px);
  // very close in, the ground gets texture of its own so the terrain does not look smeared
  if (z > 3) {
    if (!closeTex) closeTex = makeCloseTex();
    const pat = ctx.createPattern(closeTex, 'repeat');
    pat.setTransform(new DOMMatrix().scale(2 / 256));
    ctx.globalAlpha = U.clamp((z - 3) / 6, 0, 0.55); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = pat; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  const wx = IC.wx(S), light = IC.daylight(S.time);

  // cloud shadows drift with the wind
  if (S.layers.weather && S.clouds) {
    const k = 22, ox = (S.time * S.wind.x * 0.8) % (256 * k), oy = (S.time * S.wind.y * 0.8) % (256 * k);
    const pat = ctx.createPattern(S.clouds.dark, 'repeat');
    pat.setTransform(new DOMMatrix().translate(ox, oy).scale(k));
    ctx.globalAlpha = (0.12 + 0.5 * wx.cloud) * (0.4 + 0.6 * light); ctx.fillStyle = pat; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); ctx.globalAlpha = 1;
  }
  // night, dusk and dawn
  if (light < 1) { ctx.fillStyle = `rgba(3,8,24,${0.62 * (1 - light)})`; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
  const h = (S.time % 86400) / 3600;
  const golden = h > 5 && h < 8.5 ? 1 - Math.abs(h - 6.8) / 1.7 : h > 17 && h < 20.5 ? 1 - Math.abs(h - 18.8) / 1.7 : 0;
  if (golden > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(255,140,60,${0.35 * golden})`; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); ctx.globalCompositeOperation = 'source-over'; }
  if (light < 0.9) drawLights(S, px, now, light);

  if (S.layers.coverage) drawCoverage(S);
  drawAirways(S, px, now);
  drawFronts(S, px, now);
  drawBridges(S, px);
  if (S.layers.civil && z > 0.12) drawTraffic(S, px, light, now);
  drawBases(S, px, now, light);
  drawZones(S, px, now);
  drawFields(S, px);
  drawInfra(S, px, now);
  if (S.layers.intel) drawEnemy(S, px, now);
  drawRanges(S, px, now);
  if (S.layers.ground) for (const g of S.gunits) if (g.side === 'us' && inView(g.x, g.y, 300)) drawG(S, g, px, now);
  for (const u of S.units) if (inView(u.x, u.y, 200)) drawUnit(S, u, px, now);
  if (S.layers.logistics) drawConvoys(S, px);
  drawWrecks(S, px, now);
  drawTrails(S, px);
  drawPlumes(S, px, now, light);
  drawImpacts(S, px, now);
  for (const t of S.threats) drawTrack(S, t, px, now);
  for (const a of S.air) drawAir(S, a, px, now);
  for (const s of S.strikes) if (!s.pending) drawStrike(s, px);
  drawChaff(S, px);

  ctx.globalCompositeOperation = 'lighter';
  for (const f of S.fx.fires) {
    if (!inView(f.x, f.y, 100)) continue;
    const fl = 0.75 + 0.25 * Math.sin(now * 9 + f.seed) * Math.sin(now * 5.3 + f.seed * 2);
    const k = Math.min(1, (f.life - f.t) / 300) * fl * (1.4 - light * 0.6);
    const r = Math.max(5 * px, f.size * U.lerp(16, 1.1, WF));
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    gr.addColorStop(0, `rgba(255,190,90,${0.65 * k})`); gr.addColorStop(0.4, `rgba(255,110,40,${0.3 * k})`); gr.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
    if (light < 0.5) { const R2 = r * 4; const g2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R2); g2.addColorStop(0, `rgba(255,120,40,${0.12 * k * (1 - light * 2)})`); g2.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(f.x, f.y, R2, 0, 7); ctx.fill(); }
  }
  for (const f of S.fx.flashes) {
    const k = 1 - f.t / 0.35; if (k <= 0) continue;
    const r = Math.max(f.r * px, (f.wr || 0) * (1 - WF * 0.9)) * (0.6 + f.t * 2);
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    gr.addColorStop(0, `rgba(255,236,190,${0.6 * k})`); gr.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
  }
  for (const tr of S.fx.tracers) { ctx.strokeStyle = tr.msl ? 'rgba(255,230,180,0.9)' : 'rgba(255,196,90,0.9)'; ctx.lineWidth = (tr.msl ? 1.6 : 1.1) * px; ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke(); }
  for (const u of S.units) if (u.beam && !u.beam.dead) {
    const t = u.beam, fl = 0.7 + 0.3 * Math.random();
    ctx.strokeStyle = `rgba(92,200,255,${0.25 * fl})`; ctx.lineWidth = 6 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.strokeStyle = `rgba(225,248,255,${0.9 * fl})`; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(t.x, t.y); ctx.stroke();
  }
  for (const m of S.missiles) {
    const col = m.M.range > 1500 ? '255,236,190' : '225,246,255';
    ctx.fillStyle = `rgba(${col},0.35)`; ctx.beginPath(); ctx.arc(m.x, m.y, 5 * px, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(${col},1)`; ctx.beginPath(); ctx.arc(m.x, m.y, 1.8 * px, 0, 7); ctx.fill();
  }
  for (const m of S.eaam) { ctx.fillStyle = 'rgba(255,160,140,0.9)'; ctx.beginPath(); ctx.arc(m.x, m.y, 1.8 * px, 0, 7); ctx.fill(); }
  for (const p of S.fx.parts) { if (!p.add) continue; const k = 1 - p.t / p.life; ctx.fillStyle = `rgba(${p.col},${p.a * k})`; ctx.beginPath(); ctx.arc(p.x + p.ox * px, p.y + p.oy * px, p.size * px, 0, 7); ctx.fill(); }
  for (const b of S.fx.booms) {
    const k = b.t / 0.8, wm = (b.wmax || 0) * (1 - WF * 0.92), r = Math.max(b.max * px, wm) * Math.sqrt(k);
    ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = b.color; ctx.lineWidth = (2.5 * (1 - k) + 0.5) * px;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.stroke();
    if (k < 0.3) { ctx.globalAlpha = (1 - k * 3.3) * 0.75; const fr = Math.max(b.max * 0.4 * px, wm * 0.45) * (0.7 + k); const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, fr); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(0.5, 'rgba(255,170,70,0.8)'); gr.addColorStop(1, 'rgba(255,90,30,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, 7); ctx.fill(); }
  }
  for (const s of S.fx.shocks) { const k = s.t / 0.9; if (k >= 1) continue; ctx.globalAlpha = (1 - k) * 0.5; ctx.strokeStyle = 'rgba(255,240,220,1)'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(s.r * px, s.wr * (1 - WF * 0.92)) * (0.2 + k * 1.2), 0, 7); ctx.stroke(); }
  for (const r of S.fx.rings) { const k = r.t; ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = `rgb(${r.color})`; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(r.x, r.y, (r.px ? r.r * px : r.r) * Math.sqrt(k), 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (const p of S.fx.parts) { if (p.add) continue; const k = 1 - p.t / p.life; ctx.fillStyle = `rgba(${p.col},${p.a * k})`; ctx.beginPath(); ctx.arc(p.x + p.ox * px, p.y + p.oy * px, p.size * px, 0, 7); ctx.fill(); }

  ctx.font = `600 ${12 * px}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
  for (const x of S.fx.texts) { ctx.globalAlpha = Math.max(0, 1 - x.t / 1.8); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(x.s, x.x + px, x.y - (8 + x.t * 16) * px + px); ctx.fillStyle = x.color; ctx.fillText(x.s, x.x, x.y - (8 + x.t * 16) * px); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  if (S.layers.weather && S.clouds && wx.cloud > 0.4 && z < 0.5) {
    const k = 30, ox = (S.time * S.wind.x * 1.2) % (256 * k), oy = (S.time * S.wind.y * 1.2) % (256 * k);
    const pat = ctx.createPattern(S.clouds.white, 'repeat');
    pat.setTransform(new DOMMatrix().translate(ox + 900, oy + 400).scale(k));
    ctx.globalAlpha = (wx.cloud - 0.4) * 0.32 * (0.3 + 0.7 * light) * U.clamp((0.5 - z) / 0.3, 0, 1); ctx.fillStyle = pat; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); ctx.globalAlpha = 1;
  }
  drawIncidents(S, px, now);
  drawGhost(S, px);
  IC.drawBuildGhost(ctx, S, px);
  drawHints(S, px, now);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWeather(S, wx, now, light);
  // an alarm washes the screen edges red for a moment
  if (S.alarmFx > 0) {
    const k = S.alarmFx * (0.6 + 0.4 * Math.sin(now * 10));
    const ag = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.35, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.75);
    ag.addColorStop(0, 'rgba(255,40,30,0)'); ag.addColorStop(1, `rgba(255,40,30,${0.35 * k})`);
    ctx.fillStyle = ag; ctx.fillRect(0, 0, cam.vw, cam.vh);
  }
  if (S.box) { ctx.strokeStyle = 'rgba(111,210,255,0.9)'; ctx.fillStyle = 'rgba(111,210,255,0.08)'; ctx.lineWidth = 1; const b = S.box; ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); }
  const vg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.45, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,3,8,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cam.vw, cam.vh);
  if (IC.cine && IC.cine.bars > 0) { const bh = cam.vh * 0.08 * IC.cine.bars; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cam.vw, bh); ctx.fillRect(0, cam.vh - bh, cam.vw, bh); }
};

function label(txt, x, y, px, col, size, align, weight) {
  ctx.font = `${weight || 500} ${(size || 10) * px}px "IBM Plex Mono", monospace`;
  ctx.textAlign = align || 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(txt, x + 0.9 * px, y + 0.9 * px);
  ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}
function brackets(x, y, r, px, col) {
  const l = Math.min(r * 0.5, 7 * px);
  ctx.strokeStyle = col || C.amber; ctx.lineWidth = 1.8 * px; ctx.beginPath();
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x + a * r, y + b * (r - l)); ctx.lineTo(x + a * r, y + b * r); ctx.lineTo(x + a * (r - l), y + b * r); }
  ctx.stroke();
}
/* altitude shadow: the higher it flies, the further its shadow falls */
function shadow(x, y, alt, px, r) {
  if (!(alt > 0.05)) return { x, y };
  const off = Math.min(34, alt * 2.4 * U.clamp(cam.z * 3, 0.7, 2.6)) * px;
  const sx = x + off * 0.7, sy = y + off;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(sx, sy, (r || 4) * px, (r || 4) * 0.55 * px, 0, 0, 7); ctx.fill();
  if (off > 8 * px) { ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 3 * px]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]); }
  return { x: sx, y: sy };
}

function drawLights(S, px, now, light) {
  ctx.globalCompositeOperation = 'lighter';
  const pf = IC.powerFactor(S);
  for (const c of IC.cities(S)) {
    if (!c.light || !inView(c.x, c.y, c.light.size)) continue;
    const plant = c.plant && S.byId[c.plant];
    const black = plant && plant.offline ? 0.12 : 1;
    const a = (1 - light) * 0.95 * (c.hp / c.max) * pf * black * (c.owner === 'us' ? 1 : 0.35) * (c.alert > 0 && Math.sin(now * 0.7) > 0.6 ? 0.75 : 1);
    // far out the city is one glow; close in, lit streets and windows take over
    const near = U.clamp((cam.z - 1.5) / 2.5, 0, 1);
    ctx.globalAlpha = a * (1 - near * 0.85);
    ctx.drawImage(c.light.cv, c.x - c.light.size / 2, c.y - c.light.size / 2, c.light.size, c.light.size);
    if (near > 0 && c.streets) {
      ctx.globalAlpha = a * near;
      ctx.strokeStyle = 'rgba(255,190,110,0.16)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const l of c.streets) { if (l.bb[2] < view.x0 || l.bb[0] > view.x1 || l.bb[3] < view.y0 || l.bb[1] > view.y1) continue; const P = l.pts; ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); }
      ctx.stroke();
      const q = 0.14;
      for (const b of c.blocks) {
        if (b.hp <= 0 || !inView(b.x, b.y, 6)) continue;
        const ca = Math.cos(b.a), sa = Math.sin(b.a), sd = Math.floor(b.seed), n = b.core ? 10 : b.ind ? 3 : 6;
        for (let k = 0; k < n; k++) {
          const h = U.hash(sd, k); if (h < 0.35) continue;
          const u = (U.hash(k, sd) - 0.5) * b.w * 0.9, v = (U.hash(sd + 7, k) - 0.5) * b.h * 0.9;
          ctx.fillStyle = h > 0.85 ? 'rgba(200,225,255,0.9)' : 'rgba(255,208,140,0.9)';
          ctx.fillRect(b.x + u * ca - v * sa - q / 2, b.y + u * sa + v * ca - q / 2, q, q);
        }
      }
    }
  }
  ctx.globalAlpha = (1 - light) * 0.8;
  for (const v of S.world.villages) {
    if (!inView(v.x, v.y, 60)) continue;
    const a = v.home ? 1 : 0.4;
    ctx.fillStyle = `rgba(255,200,120,${0.5 * a})`;
    for (const b of v.blocks) if (b.hp > 0 && (b.seed % 3) < 2) ctx.fillRect(b.x, b.y, 1.4 * Math.max(px, 0.5), 1.4 * Math.max(px, 0.5));
  }
  for (const t of S.world.foreign) { if (!inView(t.x, t.y, 200)) continue; const gr = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * 1.4); gr.addColorStop(0, 'rgba(255,170,100,0.18)'); gr.addColorStop(1, 'rgba(255,170,100,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 1.4, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* radar cover for air traffic control, by the lowest height seen: bright where radar sees low, faint where it
   sees only high traffic, red over our country where it sees nothing at all (airspace.js) */
const BAND_RGB = ['70,225,190', '80,195,235', '105,150,245', '150,120,235', '170,110,205'];
IC.BAND_RGB = BAND_RGB;
let covImg = null;
function covCanvas(S) {
  const C = S.asp && S.asp.cov;
  if (!C) return null;
  if (covImg && covImg.v === C.v && covImg.seed === S.seed && covImg.C === C) return covImg.cv;
  const cv2 = covImg && covImg.cv && covImg.cv.width === C.gw ? covImg.cv : Object.assign(document.createElement('canvas'), { width: C.gw, height: C.gh });
  const g2 = cv2.getContext('2d'), img = g2.createImageData(C.gw, C.gh), d = img.data;
  const home = covImg && covImg.seed === S.seed && covImg.home ? covImg.home : (() => { const h = new Uint8Array(C.gw * C.gh); for (let j = 0; j < C.gh; j++) for (let i = 0; i < C.gw; i++) h[j * C.gw + i] = IC.inHome((i + 0.5) * IC.ASP.CS, (j + 0.5) * IC.ASP.CS) ? 1 : 0; return h; })();
  const B = IC.ASP_BANDS, A = [150, 120, 95, 70, 45];
  for (let k = 0; k < C.g.length; k++) {
    const a = C.g[k]; let b = -1;
    for (let i = 0; i < B.length; i++) if (a < B[i][0]) { b = i; break; }
    const o = k * 4;
    if (b >= 0) { const c = BAND_RGB[b].split(','); d[o] = +c[0]; d[o + 1] = +c[1]; d[o + 2] = +c[2]; d[o + 3] = A[b]; }
    else if (home[k]) { d[o] = 255; d[o + 1] = 90; d[o + 2] = 70; d[o + 3] = 70; }
  }
  g2.putImageData(img, 0, 0);
  covImg = { v: C.v, seed: S.seed, C, cv: cv2, home };
  return cv2;
}
function drawCoverage(S) {
  const cc = covCanvas(S);
  if (cc) { ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true; ctx.drawImage(cc, 0, 0, cc.width * IC.ASP.CS, cc.height * IC.ASP.CS); ctx.globalAlpha = 1; }
  // radars that do not help controllers (they do not read transponders) are shown as plain discs
  cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.clearRect(0, 0, 600, 450); cx2.setTransform(0.05, 0, 0, 0.05, 0, 0);
  let any = false;
  for (const s of S.sensors) {
    if (s.eo || s.acou || s.bmdOnly || s.rktOnly || s.air && s.air.kind !== 'aew') continue;
    if (cc && !s.air && !s.passive && !s.org && (s.ssr || s.idc === 'iff' || s.idc === 'nctr')) continue;
    any = true;
    cx2.fillStyle = s.q === 'fc' ? 'rgba(92,200,255,1)' : 'rgba(150,160,255,0.55)';
    cx2.beginPath(); cx2.arc(s.x, s.y, s.R * (s.jamF || 1) * (s.esm ? 0.5 : 1), 0, 7); cx2.fill();
  }
  if (any) { ctx.globalAlpha = 0.055; ctx.drawImage(cov, 0, 0, IC.WW, IC.WH); ctx.globalAlpha = 1; }
}
/* the airspace: control zones, the player's fixes and airways (teal where radar sees cruising traffic, amber
   where it does not), where airways cross, each airport's way onto the network, and the selected flight's route */
function drawAirways(S, px, now) {
  const N = S.asp, m = S.mode2, edit = m && m.kind === 'airway', show = S.layers.airways || edit;
  const sel = S.sel, z = cam.z;
  if (N && show) {
    for (const c of IC.aspZones(S)) {
      if (!inView(c.x, c.y, c.tma || c.ctr)) continue;
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'rgba(140,180,255,0.4)'; ctx.fillStyle = 'rgba(140,180,255,0.05)';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.ctr, 0, 7); ctx.fill(); ctx.stroke();
      if (c.tma) { ctx.setLineDash([6 * px, 6 * px]); ctx.strokeStyle = 'rgba(140,180,255,0.25)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.tma, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (S.layers.labels && z > 0.18) { label('CONTROL ZONE', c.x, c.y - c.ctr - 5 * px, px, 'rgba(160,190,255,0.7)', 8.5, 'center', 600); if (c.tma && z > 0.18) label('TERMINAL AREA ABOVE 1,200 M', c.x, c.y - c.tma - 5 * px, px, 'rgba(160,190,255,0.55)', 8.5, 'center', 600); }
    }
    // in the editor, the traffic that wants to fly, faintly, so airways can be drawn where it goes
    if (edit) {
      ctx.lineWidth = 1 * px; ctx.setLineDash([10 * px, 8 * px]);
      for (const w of S.world.airways) { if (w.kind === 'hostile') continue; ctx.strokeStyle = 'rgba(200,220,210,0.12)'; ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // each airport's departure and arrival route onto the network
    ctx.lineWidth = 1.2 * px; ctx.setLineDash([2 * px, 4 * px]); ctx.strokeStyle = 'rgba(143,216,255,0.55)';
    for (const b of IC.bases(S)) { if (b.kind !== 'airport' || b.owner !== 'us') continue; const f = IC.aspLink(S, b); if (f) { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(f.x, f.y); ctx.stroke(); } }
    ctx.setLineDash([]);
    for (const w of N.ways) {
      const [a, b] = IC.aspWayEnds(S, w), hot = sel && sel.kind === 'airway' && sel.ref === w;
      if (!inView((a.x + b.x) / 2, (a.y + b.y) / 2, U.dist(a, b) / 2 + 50)) continue;
      if (hot) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 7 * px; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.lineWidth = 2 * px;
      for (let i = 0; i < 10; i++) {
        const x0 = a.x + (b.x - a.x) * i / 10, y0 = a.y + (b.y - a.y) * i / 10, x1 = a.x + (b.x - a.x) * (i + 1) / 10, y1 = a.y + (b.y - a.y) * (i + 1) / 10;
        const seen = IC.aspCovAlt(S, (x0 + x1) / 2, (y0 + y1) / 2) <= 9;
        ctx.strokeStyle = seen ? 'rgba(143,216,255,0.85)' : 'rgba(242,180,65,0.85)';
        if (!seen) ctx.setLineDash([6 * px, 4 * px]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const c of IC.aspCrossings(S)) {
      if (!inView(c.x, c.y, 20)) continue;
      ctx.strokeStyle = 'rgba(255,154,60,0.95)'; ctx.lineWidth = 1.6 * px;
      ctx.beginPath(); ctx.arc(c.x, c.y, 6 * px, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x - 4 * px, c.y - 4 * px); ctx.lineTo(c.x + 4 * px, c.y + 4 * px); ctx.moveTo(c.x + 4 * px, c.y - 4 * px); ctx.lineTo(c.x - 4 * px, c.y + 4 * px); ctx.stroke();
    }
    if (edit && m.from && S.hover) { const f = IC.aspFix(S, m.from); if (f) { ctx.strokeStyle = 'rgba(143,216,255,0.6)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([5 * px, 5 * px]); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(S.hover.x, S.hover.y); ctx.stroke(); ctx.setLineDash([]); } }
    for (const f of N.fixes) {
      if (!inView(f.x, f.y, 30)) continue;
      const on = (sel && sel.kind === 'fix' && sel.ref === f) || (edit && m.from === f.id), r = 6 * px;
      ctx.fillStyle = on ? '#ffffff' : C.airway; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.2 * px;
      ctx.beginPath(); ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x + r * 0.9, f.y + r * 0.6); ctx.lineTo(f.x - r * 0.9, f.y + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (on) brackets(f.x, f.y, 11 * px, px);
      if (S.layers.labels || edit) label(f.name, f.x, f.y + 16 * px, px, on ? '#ffffff' : C.airway, 9, 'center', 700);
    }
  }
  // the selected flight's filed route
  const t = sel && sel.kind === 'track' ? sel.ref : null;
  if (t && t.plan && t.plan.pts) {
    ctx.strokeStyle = 'rgba(127,232,176,0.7)'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([10 * px, 8 * px]);
    const P = t.plan.pts; ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (const p of P) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    for (const p of P) if (p.name && p.fix) label(p.name, p.x, p.y - 8 * px, px, 'rgba(127,232,176,0.9)', 8.5, 'center', 600);
  } else if (t && t.wps && t.type === 'ga') {
    ctx.strokeStyle = 'rgba(201,176,255,0.6)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([4 * px, 6 * px]);
    ctx.beginPath(); ctx.moveTo(t.x, t.y); for (const p of t.wps) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
  }
}
/* light-aircraft fields: grass strips at real size, and a mark with a name further out */
function drawFields(S, px) {
  if (!S.asp || cam.z < 0.05) return;
  const sel = S.sel && S.sel.kind === 'field' ? S.sel.ref : null;
  for (const f of S.asp.fields) {
    if (!inView(f.x, f.y, 40)) continue;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
    ctx.fillStyle = 'rgba(128,170,96,0.95)'; ctx.fillRect(-4.5, -0.15, 9, 0.3);
    ctx.restore();
    if (cam.z < 3) {
      ctx.strokeStyle = C.light; ctx.lineWidth = 1.4 * px;
      ctx.beginPath(); ctx.arc(f.x, f.y, 5 * px, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x - Math.cos(f.a) * 8 * px, f.y - Math.sin(f.a) * 8 * px); ctx.lineTo(f.x + Math.cos(f.a) * 8 * px, f.y + Math.sin(f.a) * 8 * px); ctx.stroke();
    }
    if (f === sel) brackets(f.x, f.y, 12 * px, px);
    if (S.layers.labels && cam.z > 0.12) label(f.name, f.x, f.y + 17 * px, px, C.light, 9, 'center', 600);
  }
}

function drawFronts(S, px, now) {
  for (const f of S.fronts) {
    const P = f.pts, L = P.map((p, i) => IC.linePt(f, i));
    if (!f.active) {
      ctx.strokeStyle = 'rgba(255,110,90,0.35)'; ctx.lineWidth = 2 * px; ctx.setLineDash([10 * px, 8 * px]);
      ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], la = L[i], lb = L[i + 1];
      const lost = a.d > 2 || b.d > 2, won = a.d < -2 || b.d < -2;
      if (!lost && !won) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(lb.x, lb.y); ctx.lineTo(la.x, la.y); ctx.closePath();
      ctx.fillStyle = lost ? 'rgba(255,70,50,0.10)' : 'rgba(90,190,255,0.10)'; ctx.fill();
      const pat = lost ? hatchR : hatchB; pat.setTransform(new DOMMatrix().scale(px)); ctx.fillStyle = pat; ctx.fill();
    }
    const path = () => { ctx.beginPath(); L.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
    path(); ctx.strokeStyle = 'rgba(10,6,4,0.7)'; ctx.lineWidth = 7 * px; ctx.stroke();
    path(); ctx.strokeStyle = '#ff6a50'; ctx.lineWidth = 2.8 * px; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(111,210,255,0.7)'; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 6 * px]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff6a50';
    for (let i = 0; i + 1 < L.length; i++) {
      const a = L[i], b = L[i + 1], seg = U.dist(a, b), n = Math.max(1, Math.floor(seg * cam.z / 22));
      const nx = -(P[i].nx + P[i + 1].nx) / 2, ny = -(P[i].ny + P[i + 1].ny) / 2;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const tx = (b.x - a.x) / seg, ty = (b.y - a.y) / seg;
        ctx.beginPath(); ctx.moveTo(x - tx * 3 * px, y - ty * 3 * px); ctx.lineTo(x + nx * 5 * px, y + ny * 5 * px); ctx.lineTo(x + tx * 3 * px, y + ty * 3 * px); ctx.fill();
      }
    }
    f.sectors.forEach((s, i) => {
      const G = IC.secGeom(f, i);
      if (s.eAttack) arrow(G.x - G.nx * 360, G.y - G.ny * 360, G.x + G.nx * (120 + 30 * Math.sin(now * 2)), G.y + G.ny * (120 + 30 * Math.sin(now * 2)), s.probe ? 'rgba(255,150,120,0.7)' : '#ff5b4f', px, s.probe ? 2.5 : s.main ? 6 : 4);
      if (s.usAttack) arrow(G.x + G.nx * 360, G.y + G.ny * 360, G.x - G.nx * 120, G.y - G.ny * 120, '#6fd2ff', px, 4.5);
      if (cam.z > 0.09) {
        const r = s.F / Math.max(0.01, s.E);
        label(`${s.name} ${r >= 10 ? '10+' : r.toFixed(1)}:1${s.main && s.eAttack ? ' ⚠' : ''}`, G.x + G.nx * 50, G.y + G.ny * 50, px, r >= 1.2 ? C.friend : r >= 0.8 ? C.amber : C.hostile, 10, 'center', 600);
      }
    });
    if (cam.z < 0.14) { const m = L[Math.floor(L.length / 2)], p = P[Math.floor(P.length / 2)]; label(f.name.toUpperCase(), m.x + p.nx * 280, m.y + p.ny * 280, px, 'rgba(255,190,170,0.9)', 12, 'center', 700); }
  }
}
function arrow(x0, y0, x1, y1, col, px, w) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = (w || 4) * px; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + Math.sin(a) * 60, (y0 + y1) / 2 - Math.cos(a) * 60, x1, y1); ctx.stroke();
  const hs = 5 + (w || 4) * 2;
  ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * hs * px, y1 + Math.sin(a) * hs * px); ctx.lineTo(x1 + Math.cos(a + 2.5) * hs * 1.2 * px, y1 + Math.sin(a + 2.5) * hs * 1.2 * px); ctx.lineTo(x1 + Math.cos(a - 2.5) * hs * 1.2 * px, y1 + Math.sin(a - 2.5) * hs * 1.2 * px); ctx.fill();
  ctx.globalAlpha = 1;
}

/* roads close in: drawn live, at real width once that is wider than a few pixels; lane markings when close */
const ROAD = {
  // real width (world units), smallest on screen (px), fill colour
  hw: [0.42, 4.6, [238, 176, 104]], ring: [0.36, 3.6, [232, 190, 130]], rd: [0.2, 3.2, [214, 198, 158]], art: [0.4, 2.2, [178, 174, 164]],
  lc: [0.13, 2.2, [198, 186, 154]], sp: [0.11, 1.9, [198, 186, 154]], st: [0.34, 1.4, [148, 146, 140]], ln: [0.07, 1.1, [160, 140, 100]]
};
IC.roadWidth = (k, z) => Math.max(ROAD[k][0], ROAD[k][1] / z * (1 - U.clamp((z - 3) / 6, 0, 1) * 0.6));
function drawRoads(S, px) {
  const W = S.world, z = cam.z, t = U.clamp((z - 3) / 6, 0, 1), m = 5;
  const vis = l => l.bb[2] > view.x0 - m && l.bb[0] < view.x1 + m && l.bb[3] > view.y0 - m && l.bb[1] < view.y1 + m;
  const groups = { sp: [], lc: [], rd: [], hw: [] };
  for (const e of W.edges) if (vis(e)) groups[e.cls].push(e);
  // only the stretches in view go into the path
  const path = list => {
    ctx.beginPath();
    for (const l of list) {
      const P = l.pts; let on = false;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        if (Math.max(a.x, b.x) < view.x0 - m || Math.min(a.x, b.x) > view.x1 + m || Math.max(a.y, b.y) < view.y0 - m || Math.min(a.y, b.y) > view.y1 + m) { on = false; continue; }
        if (!on) { ctx.moveTo(a.x, a.y); on = true; }
        ctx.lineTo(b.x, b.y);
      }
    }
  };
  const width = k => IC.roadWidth(k, z);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const order = ['sp', 'lc', 'rd', 'hw'];
  for (const k of order) { if (!groups[k].length) continue; path(groups[k]); ctx.strokeStyle = 'rgba(22,20,16,0.55)'; ctx.lineWidth = width(k) * 1.45 + px * 0.8; ctx.stroke(); }
  for (const k of order) {
    if (!groups[k].length) continue;
    // far out roads are drawn in map colours; close in they turn to asphalt
    const c = ROAD[k][2], a = [92, 92, 90];
    ctx.strokeStyle = `rgb(${c[0] + (a[0] - c[0]) * t | 0},${c[1] + (a[1] - c[1]) * t | 0},${c[2] + (a[2] - c[2]) * t | 0})`;
    path(groups[k]); ctx.lineWidth = width(k); ctx.stroke();
  }
  for (const k in W.nodes) { const n = W.nodes[k]; if (n.ix && inView(n.x, n.y, 10)) IC.interchange(ctx, n, width('lc'), `rgb(${ROAD.rd[2].join(',')})`); }
  if (z > 5) {
    // motorways: two carriageways either side of a grass reservation, with lane lines; main roads: a dashed centre line
    const w = width('hw');
    if (groups.hw.length) {
      path(groups.hw);
      ctx.strokeStyle = 'rgba(235,235,225,0.55)'; ctx.lineWidth = w * 0.62; ctx.setLineDash([0.06, 0.12]); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgb(92,92,90)'; ctx.lineWidth = w * 0.58; ctx.stroke();
      ctx.strokeStyle = 'rgba(80,104,62,1)'; ctx.lineWidth = w * 0.1; ctx.stroke();
    }
    if (groups.rd.length) { path(groups.rd); ctx.strokeStyle = 'rgba(235,235,225,0.6)'; ctx.lineWidth = 0.012; ctx.setLineDash([0.08, 0.1]); ctx.stroke(); ctx.setLineDash([]); }
  }
  // craters and scorch on the roads
  const T = S.terrain;
  if (T && T.scars) for (const s of T.scars) if (s.kind !== 'block' && inView(s.x, s.y, s.r * 2)) IC.drawScar(ctx, s);
}

function drawBridges(S, px) {
  if (cam.z < 0.2) return;
  for (const b of S.infra) {
    if (b.kind !== 'bridge' || !inView(b.x, b.y, 30)) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    const w = Math.max(IC.roadWidth(b.cls, cam.z) * 1.3, b.cls === 'hw' ? 0.6 : 0.3);
    if (b.offline) {
      ctx.fillStyle = 'rgba(40,36,30,0.95)'; ctx.fillRect(-6, -w / 2, 4, w); ctx.fillRect(2, -w / 2, 4, w);
      ctx.strokeStyle = C.hostile; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(-2, -w); ctx.lineTo(2, w); ctx.moveTo(2, -w); ctx.lineTo(-2, w); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(220,210,190,0.95)'; ctx.fillRect(-6, -w / 2, 12, w);
      ctx.strokeStyle = 'rgba(40,36,30,0.9)'; ctx.lineWidth = Math.min(0.5, w * 0.15); ctx.strokeRect(-6, -w / 2, 12, w);
    }
    ctx.restore();
    if (b.offline && cam.z > 0.4) label('BRIDGE DOWN', b.x, b.y - 10 * px, px, C.hostile, 8.5, 'center', 700);
  }
}
/* traffic: far out, the flow along each road; close in, the vehicles themselves (headlights at night) */
function drawTraffic(S, px, light, now) {
  const z = cam.z, night = light < 0.35;
  if (z < 1.3) {
    // moving dashes along the roads; brighter and longer where the road is full, warm streaks at night
    const classes = z < 0.3 ? { hw: 1 } : z < 0.6 ? { hw: 1, rd: 1, ring: 1 } : { hw: 1, rd: 1, ring: 1, art: 1, lc: 1 };
    ctx.lineCap = 'butt';
    IC.trafficFlows(S, view, classes, (l, load, ph, cls) => {
      const a = (0.35 + 0.65 * Math.min(1, load)) * (night ? 0.9 : 0.8) * (cls === 'hw' ? 1 : 0.75);
      ctx.strokeStyle = night ? `rgba(255,220,160,${a})` : load > 0.95 ? `rgba(255,200,120,${a})` : `rgba(255,252,240,${a})`;
      ctx.lineWidth = (cls === 'hw' ? 1.6 : 1.1) * px;
      // dashes close up as the road fills; they crawl along with the traffic
      const gapPx = 18 - Math.min(1, load) * 12;
      ctx.setLineDash([3 * px, gapPx * px]); ctx.lineDashOffset = -ph;
      ctx.beginPath(); const P = l.pts; ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
  } else {
    // real size is 4.5 m for a car, 16 m for a lorry; never smaller than a couple of pixels
    const s = Math.max(0.045, 2.2 * px), gap = Math.max(0.3, 7 * px), side = k => Math.max(IC.roadWidth(k, z) * 0.24, 0);
    const cars = [], lorries = [];
    IC.trafficVisible(S, view, gap, (x, y, h, lorry, k) => { const o = side(k), c = Math.cos(h), n = Math.sin(h); (lorry ? lorries : cars).push(x - n * o, y + c * o, c, n); }, z < 2.5 ? { st: 1, ln: 1 } : null);
    const quad = (list, L, Wd, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i < list.length; i += 4) {
        const x = list[i], y = list[i + 1], c = list[i + 2], n = list[i + 3], lx = c * L, ly = n * L, wx = -n * Wd, wy = c * Wd;
        ctx.moveTo(x - lx - wx, y - ly - wy); ctx.lineTo(x + lx - wx, y + ly - wy); ctx.lineTo(x + lx + wx, y + ly + wy); ctx.lineTo(x - lx + wx, y - ly + wy); ctx.closePath();
      }
      ctx.fill();
    };
    if (night) {
      ctx.globalCompositeOperation = 'lighter';
      const hl = (list, L) => { ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { const x = list[i] + list[i + 2] * L, y = list[i + 1] + list[i + 3] * L; ctx.moveTo(x + s * 0.9, y); ctx.arc(x, y, s * 0.9, 0, 7); } ctx.fill(); };
      const tl = (list, L) => { ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { const x = list[i] - list[i + 2] * L, y = list[i + 1] - list[i + 3] * L; ctx.moveTo(x + s * 0.5, y); ctx.arc(x, y, s * 0.5, 0, 7); } ctx.fill(); };
      ctx.fillStyle = 'rgba(255,236,190,0.85)'; hl(cars, s); hl(lorries, s * 2.4);
      ctx.fillStyle = 'rgba(255,60,40,0.7)'; tl(cars, s); tl(lorries, s * 2.4);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      if (z > 8) { quad(cars, s, s * 0.45, 'rgba(0,0,0,0.3)'); for (let i = 0; i < cars.length; i += 4) { cars[i] -= s * 0.3; cars[i + 1] -= s * 0.3; } }
      quad(cars, s, s * 0.45, 'rgba(232,234,238,0.95)');
      quad(lorries, s * 2.4, s * 0.55, 'rgba(210,200,176,0.95)');
    }
    // buses and coaches: longer, in the national red
    const bs = [];
    for (const b of S.buses) { const p = IC.busPos(b); if (!inView(p.x, p.y, 2)) continue; const h = p.h + (b.dir < 0 ? Math.PI : 0), c = Math.cos(h), n = Math.sin(h), o = side(b.coach ? 'rd' : 'art'); bs.push(p.x - n * o, p.y + c * o, c, n); }
    if (night) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,236,190,0.8)'; ctx.beginPath(); for (let i = 0; i < bs.length; i += 4) { const x = bs[i] + bs[i + 2] * s * 3, y = bs[i + 1] + bs[i + 3] * s * 3; ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, 7); } ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    quad(bs, s * 2.2, s * 0.5, night ? 'rgba(120,50,40,0.9)' : 'rgba(214,72,52,0.95)');
  }
  // trains: real length is about 25 m a carriage
  const tl = Math.max(0.25, 5 * px);
  for (const t of S.trains) {
    for (let k = 0; k < t.cars; k++) {
      const p = IC.trainPos({ r: t.r, s: t.s - t.dir * k * tl * 1.1 });
      if (!inView(p.x, p.y, 10)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h);
      ctx.fillStyle = night ? (k === 0 ? 'rgba(255,230,170,0.95)' : 'rgba(255,210,140,0.55)') : k === 0 ? 'rgba(210,90,60,0.95)' : 'rgba(120,110,100,0.95)'; ctx.fillRect(-tl / 2, -tl * 0.2, tl, tl * 0.4);
      ctx.restore();
    }
  }
}

/* airports and air bases, drawn part by part at real scale (render-airport.js) */
function drawBases(S, px, now, light) {
  for (const b of IC.bases(S)) {
    if (!b.parts || !inView(b.x, b.y, b.radius + 20) || cam.z < 0.3) continue;
    IC.drawAirport(ctx, S, b, px, now, light);
    if (b.locked && cam.z < 4) label(S.story && S.story.act < 2 ? 'AIR FORCE · NOT UNDER YOUR COMMAND' : 'AIR FORCE', b.x, b.y - b.radius * 0.4 - 12 * px, px, C.muted, 8.5, 'center', 600);
  }
}
/* prohibited zones: civil routes fly around them */
function drawZones(S, px, now) {
  if (!S.av) return;
  for (const z of S.av.zones) {
    if (!inView(z.x, z.y, z.r)) continue;
    ctx.strokeStyle = 'rgba(255,120,100,0.55)'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([8 * px, 5 * px]);
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (hatchR) { ctx.globalAlpha = 0.35; ctx.fillStyle = hatchR; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (S.layers.labels) label(z.name.toUpperCase(), z.x, z.y - z.r - 6 * px, px, 'rgba(255,160,140,0.85)', 9, 'center', 700);
  }
  if (S.jam && S.jamKnown !== false) {
    const p = 0.5 + 0.5 * Math.sin(now * 1.5);
    ctx.strokeStyle = `rgba(190,120,255,${0.25 + 0.2 * p})`; ctx.lineWidth = 1.2 * px; ctx.setLineDash([3 * px, 6 * px]);
    ctx.beginPath(); ctx.arc(S.jam.x, S.jam.y, S.jam.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    label('GPS JAMMING', S.jam.x, S.jam.y, px, 'rgba(200,150,255,0.8)', 10, 'center', 700);
  }
}
/* incidents pulse on the map until they are dealt with */
function drawIncidents(S, px, now) {
  for (const it of IC.activeIncidents(S)) {
    if (!inView(it.x, it.y, 200)) continue;
    const alarm = it.level === 'alarm', p = (now * (alarm ? 1.4 : 0.9)) % 1;
    ctx.strokeStyle = alarm ? `rgba(255,70,60,${0.9 * (1 - p)})` : `rgba(242,180,65,${0.9 * (1 - p)})`;
    ctx.lineWidth = (alarm ? 3 : 2) * px;
    ctx.beginPath(); ctx.arc(it.x, it.y, (14 + p * 40) * px, 0, 7); ctx.stroke();
  }
}

function drawInfra(S, px, now) {
  for (const i of S.infra) {
    if (i.kind === 'bridge' || !inView(i.x, i.y, 300)) continue;
    const sel = S.sel && S.sel.ref === i;
    if (i.kind === 'city') {
      if (i.owner === 'enemy') { ctx.fillStyle = 'rgba(255,60,40,0.16)'; ctx.beginPath(); ctx.arc(i.x, i.y, i.r * 1.2, 0, 7); ctx.fill(); }
      if (i.besieged) { ctx.strokeStyle = `rgba(255,154,60,${0.5 + 0.3 * Math.sin(now * 3)})`; ctx.lineWidth = 3 * px; ctx.setLineDash([6 * px, 4 * px]); ctx.beginPath(); ctx.arc(i.x, i.y, i.r * 1.1, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (i.alert > 0) { const p = (now * 0.6) % 1; ctx.strokeStyle = `rgba(255,91,79,${0.7 * (1 - p)})`; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(i.x, i.y, i.r * 0.7 + (6 + p * 34) * px, 0, 7); ctx.stroke(); }
      const nm = i.name.toUpperCase();
      const big = i.capital ? 14 : i.pop > 350 ? 12 : 10.5;
      if (S.layers.labels || i.pop > 350) {
        label(nm, i.x, i.y - Math.max(i.r * 0.9, 10 * px) - 4 * px, px, i.owner === 'enemy' ? '#ffb0a6' : '#f2f5f7', big, 'center', i.capital ? 700 : 600);
        if (cam.z > 0.14) label(`${i.pop}k${i.owner === 'enemy' ? ' · OCCUPIED' : i.besieged ? ' · SURROUNDED' : i.alert > 0 ? ' · SIRENS' : ''}`, i.x, i.y - Math.max(i.r * 0.9, 10 * px) + 9 * px, px, i.owner === 'enemy' || i.alert > 0 ? C.hostile : C.muted, 9);
      }
      if (i.capital) { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(i.x, i.y, 3 * px, 0, 7); ctx.fill(); }
    } else {
      if (i.parts && cam.z > 0.3) { /* drawn part by part */ }
      else {
        const s = px, col = i.owner === 'enemy' ? C.hostile : i.offline ? '#6a7880' : C.friend;
        ctx.fillStyle = 'rgba(6,14,20,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.arc(i.x, i.y, 9 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = `700 ${7.5 * s}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
        ctx.fillText({ airport: '✈', airbase: 'AB', factory: 'IND', power: 'ϟ' }[i.kind], i.x, i.y + 2.6 * s); ctx.textAlign = 'left';
        if (S.layers.labels && cam.z > 0.1) label(i.name, i.x, i.y + 20 * px, px, i.offline ? '#8a8f94' : C.muted, 9.5);
      }
      if (i.parts) {
        const st = IC.baseStatus(S, i);
        if (!st.runway && !i.locked && i.parts.some(p => p.kind === 'runway')) label('RUNWAY CLOSED', i.x, i.y - 16 * px - (cam.z > 0.3 ? 12 : 0), px, C.hostile, 9, 'center', 700);
        else if (cam.z <= 0.3 && i.st && i.st.warn && i.st.warn.length && !i.locked && i.owner === 'us') { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(i.x + 8 * px, i.y - 8 * px, 3 * px, 0, 7); ctx.fill(); }
        const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === i.id).length;
        if (hold && cam.z > 0.08) label(`${hold} HOLDING`, i.x, i.y + (cam.z > 0.3 ? -26 : -16) * px, px, C.amber, 8.5, 'center', 700);
      }
    }
    if (i.hp < i.max && !i.offline && i.owner === 'us' && i.kind !== 'city' && !(i.parts && cam.z > 0.3)) {
      const w = 28 * px, y = i.y + 13 * px;
      ctx.fillStyle = 'rgba(10,20,28,0.8)'; ctx.fillRect(i.x - w / 2, y, w, 3 * px);
      const f = i.hp / i.max; ctx.fillStyle = f > 0.5 ? C.ok : f > 0.25 ? C.amber : C.hostile; ctx.fillRect(i.x - w / 2, y, w * f, 3 * px);
    }
    if (sel) brackets(i.x, i.y, (i.kind === 'city' ? Math.max(i.r * 0.7, 12 * px) : i.parts && cam.z > 0.3 ? Math.max(i.radius * 0.75, 12 * px) : 12 * px) + 4 * px, px);
  }
  if (cam.z < 0.16 && S.layers.labels) {
    for (const f of S.world.foreign) if (inView(f.x, f.y, 100)) label(f.taken ? f.name + ' (ours)' : f.name, f.x, f.y + f.r + 14 * px, px, f.taken ? C.friend : 'rgba(210,205,190,0.55)', 9, 'center', 500);
    const W = S.world;
    for (const k of ['A', 'B', 'C', 'D']) {
      const [a0, a1] = W.secSpan(k), a = (a0 + a1) / 2, p = W.borderPt(a), r = Math.hypot(p.x - W.cx, p.y - W.cy);
      const x = U.clamp(W.cx + (p.x - W.cx) * (r + 1300) / r, 900, IC.WW - 900), y = U.clamp(W.cy + (p.y - W.cy) * (r + 1300) / r, 300, IC.WH - 250);
      label(W.full[k].toUpperCase(), x, y, px, W.side[k] === 'hostile' ? 'rgba(255,150,130,0.4)' : 'rgba(200,210,220,0.3)', 18, 'center', 600);
    }
  }
}

function drawEnemy(S, px, now) {
  for (const s of S.esites) {
    if (s.pk === 0 || !inView(s.x, s.y, 250)) continue;
    if (s.pk === 1) {
      ctx.strokeStyle = 'rgba(255,91,79,0.5)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([4 * px, 4 * px]);
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 180, 120, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      label('? ' + s.name, s.x, s.y + 4 * px, px, 'rgba(255,160,150,0.85)', 9.5);
      continue;
    }
    ctx.globalAlpha = s.destroyed ? 0.45 : 1;
    const ink = frame(ctx, 'h', s.x, s.y, px * 1.1);
    ctx.fillStyle = ink; ctx.font = `700 ${6.5 * px}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText({ airbase: 'AB', drone: 'UAV', cm: 'CM', bm: 'BM', mrbm: 'MRB', hgv: 'HGV', rkt: 'RKT', supply: 'SUP', staging: 'HQ' }[s.kind], s.x, s.y + 2.3 * px);
    ctx.textAlign = 'left';
    if (s.destroyed) { ctx.strokeStyle = '#1a0806'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(s.x - 9 * px, s.y - 9 * px); ctx.lineTo(s.x + 9 * px, s.y + 9 * px); ctx.moveTo(s.x + 9 * px, s.y - 9 * px); ctx.lineTo(s.x - 9 * px, s.y + 9 * px); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (cam.z > 0.1) label(s.name, s.x, s.y + 20 * px, px, 'rgba(255,170,160,0.9)', 9.5);
    if (S.sel && S.sel.ref === s) brackets(s.x, s.y, 15 * px, px);
  }
  for (const t of S.tels) {
    if (t.dead || !t.known) continue;
    const age = S.time - t.kt, fade = U.clamp(1 - age / 7200, 0.25, 1);
    ctx.globalAlpha = fade;
    const ink = frame(ctx, 'h', t.kx, t.ky, px * 0.9);
    ctx.fillStyle = ink; ctx.font = `700 ${5.5 * px}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText(t.kind === 'rkt' ? 'MLRS' : 'TEL', t.kx, t.ky + 2 * px); ctx.textAlign = 'left';
    label(`${U.dur(age)} ago`, t.kx, t.ky - 13 * px, px, 'rgba(255,170,160,0.9)', 9);
    ctx.globalAlpha = 1;
    if (S.sel && S.sel.ref === t) brackets(t.kx, t.ky, 12 * px, px);
  }
  if (S.layers.ground) for (const g of S.gunits) {
    if (g.side !== 'them' || !g.known) continue;
    const age = S.time - g.kt;
    const s = px * 1.35;
    IC.drawGround(ctx, g, g.kx, g.ky, s, U.clamp(1 - age / 5400, 0.3, 1));
    if (cam.z > 0.14) label(`${g.name} ~${Math.round(g.str / 10) * 10}%`, g.kx, g.ky + 22 * px, px, 'rgba(255,170,160,0.95)', 9.5);
    if (g.order === 'attack' && !g.moving && age < 900) { const p = IC.gTargetPos(S, g); arrowSmall(g.kx, g.ky, g.kx + (p.x - g.kx) * 0.001 + Math.cos(g.h || 0) * 40, g.ky + Math.sin(g.h || 0) * 40, '#ff5b4f', px); }
    if (S.sel && S.sel.ref === g) brackets(g.kx, g.ky, 20 * px, px);
  }
  for (const v of S.evehicles) {
    if (v.dead || !v.known) continue;
    column(v.kx, v.ky, v.h, v.trucks, px, '#ff7a6a', '#2a0c08');
    if (S.sel && S.sel.ref === v) brackets(v.kx, v.ky, 14 * px, px);
  }
}
function arrowSmall() {}

function drawRanges(S, px, now) {
  for (const u of S.units) {
    const sel = (S.sel && S.sel.ref === u) || S.group.includes(u);
    if (u.state !== 'ready' && !sel) continue;
    const d = u.d;
    if (d.sensor && !d.sensor.passive) {
      if (sel || (S.layers.rings && d.sensor.R > 1200 && u.radarOn && cam.z > 0.08)) {
        const R = d.sensor.R * (u.jamF || 1);
        ctx.strokeStyle = u.radarOn ? (u.jamF < 0.97 ? 'rgba(242,180,65,0.4)' : 'rgba(92,200,255,0.2)') : 'rgba(125,149,165,0.25)';
        ctx.lineWidth = 1 * px; ctx.setLineDash([6 * px, 7 * px]);
        ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        if (sel && d.sensor.nctrR) { ctx.strokeStyle = 'rgba(127,232,176,0.35)'; ctx.setLineDash([2 * px, 5 * px]); ctx.beginPath(); ctx.arc(u.x, u.y, d.sensor.nctrR * (IC.hasTech(S, 's_nctr') ? 1.5 : 1), 0, 7); ctx.stroke(); ctx.setLineDash([]); label('type recognition', u.x, u.y - d.sensor.nctrR - 4 * px, px, 'rgba(127,232,176,0.7)', 9); }
      }
      const fxMode = S.cfg.radarFx || 'subtle';
      if (u.radarOn && d.sensor.rot && fxMode !== 'off' && inView(u.x, u.y, d.sensor.R)) {
        const a = (u.phase || 0) + Math.PI * 2 * S.time / d.sensor.per;
        if (fxMode === 'full') {
          const R = Math.min(d.sensor.R, 2400) * (u.jamF || 1);
          const grd = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, R);
          grd.addColorStop(0, 'rgba(92,200,255,0.02)'); grd.addColorStop(1, 'rgba(92,200,255,0.11)');
          ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, R, a - 0.4, a); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(140,220,255,0.35)'; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x + Math.cos(a) * R, u.y + Math.sin(a) * R); ctx.stroke();
        } else {
          // subtle: a small rotating hand at the radar itself, nothing sweeping across the screen
          const r = 20 * px;
          ctx.strokeStyle = 'rgba(140,220,255,0.28)'; ctx.lineWidth = 1 * px;
          ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, 7); ctx.stroke();
          ctx.strokeStyle = 'rgba(160,230,255,0.6)'; ctx.lineWidth = 1.4 * px;
          ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r); ctx.stroke();
        }
      }
      if (u.jammers) for (const j of u.jammers) {
        ctx.strokeStyle = `rgba(242,180,65,${0.12 + Math.random() * 0.2})`; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y);
        for (let i = 1; i <= 12; i++) { const f = i / 12; ctx.lineTo(u.x + (j.x - u.x) * f + U.rand(-10, 10), u.y + (j.y - u.y) * f + U.rand(-10, 10)); }
        ctx.stroke();
      }
    }
    const rng = IC.maxRange(S, u);
    if (rng && (sel || (S.layers.rings && (d.weapon === 'sam' || d.weapon === 'ecm') && cam.z * rng > 8))) {
      ctx.strokeStyle = sel ? 'rgba(242,180,65,0.75)' : d.weapon === 'ecm' ? 'rgba(160,220,255,0.18)' : 'rgba(92,200,255,0.2)';
      ctx.lineWidth = (sel ? 1.5 : 1) * px;
      if (d.weapon === 'ecm' || d.weapon === 'strike') ctx.setLineDash([2 * px, 5 * px]);
      ctx.beginPath(); ctx.arc(u.x, u.y, rng, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    if (u.type === 'depot' && (sel || S.layers.logistics && cam.z > 0.12) && !u.central) { ctx.strokeStyle = 'rgba(224,180,88,0.22)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([8 * px, 6 * px]); ctx.beginPath(); ctx.arc(u.x, u.y, u.reach || 1400, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
}

/* vehicles laid out around a unit's symbol when zoomed in */
function vehicles(S, u, px, now) {
  const d = u.d, n = d.weapon === 'sam' ? (u.mags[0] ? Math.min(6, Math.max(2, Math.ceil(u.mags[0].max / 2))) : 2) : d.sensor ? 1 : d.gun || d.weapon === 'strike' ? 2 : d.logi ? 3 : 1;
  const s = 0.9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (u.id.charCodeAt(1) % 7), r = n > 1 ? 4.5 : 0;
    const x = u.x + Math.cos(a) * r + 6, y = u.y + Math.sin(a) * r + 5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-1.4 * s + 0.3, -0.7 * s + 0.3, 2.8 * s, 1.4 * s);
    ctx.fillStyle = u.state === 'ready' ? 'rgb(78,92,70)' : 'rgb(110,100,70)'; ctx.fillRect(-1.4 * s, -0.7 * s, 2.8 * s, 1.4 * s);
    if (d.weapon === 'sam' || d.weapon === 'strike') { ctx.fillStyle = 'rgb(160,168,150)'; ctx.fillRect(-0.9 * s, -0.45 * s, 1.8 * s, 0.9 * s); }
    ctx.restore();
  }
  if (d.sensor && !d.sensor.passive || d.fc && !d.fc.passive) {
    const a = u.radarOn ? now * (d.sensor && d.sensor.rot ? 6.283 / Math.max(0.6, d.sensor.per / 10) : 3) : 0;
    ctx.save(); ctx.translate(u.x - 6, u.y + 5); ctx.rotate(a);
    ctx.fillStyle = 'rgb(200,205,210)'; ctx.fillRect(-1.8, -0.25, 3.6, 0.5);
    ctx.restore();
  }
}

function drawUnit(S, u, px, now) {
  const busy = u.state !== 'ready';
  const silent = u.emitter && !u.radarOn && u.state === 'ready';
  if (u.state === 'transit' && u.dest) {
    ctx.strokeStyle = 'rgba(242,180,65,0.4)'; ctx.lineWidth = 1 * px; ctx.setLineDash([4 * px, 5 * px]);
    ctx.beginPath(); ctx.moveTo(u.x, u.y); for (const p of u.route || []) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeRect(u.dest.x - 5 * px, u.dest.y - 5 * px, 10 * px, 10 * px);
  }
  if (cam.z > 1.1) vehicles(S, u, px, now);
  const hurt = u.hp < u.max * 0.7;
  if (hurt && Math.random() < 0.08) IC.part(S, { x: u.x, y: u.y, ox: U.rand(-3, 3), oy: U.rand(-3, 3), vx: S.wind.x * 8, vy: S.wind.y * 8 - 6, life: U.rand(1.5, 3), size: U.rand(2, 4), grow: 5, col: '60,60,62', a: 0.45 });
  IC.drawUnitSymbol(ctx, u.type, u.x, u.y, px * 1.05, busy ? C.amber : C.friend, { dash: silent, tint: busy ? 'rgba(242,180,65,0.45)' : Object.values(u.comp).some(v => v < 0.35) ? 'rgba(255,91,79,0.35)' : null });
  if (u.radarOn && u.emitter) {
    ctx.strokeStyle = 'rgba(160,230,255,0.85)'; ctx.lineWidth = 1 * px;
    for (const r of [3, 5.5]) { ctx.beginPath(); ctx.arc(u.x + 11.5 * px, u.y - 8 * px, r * px, -1.4, -0.2); ctx.stroke(); }
  }
  if (u.state === 'building' || u.state === 'setup' || u.state === 'packing') {
    const f = 1 - u.stT / u.stMax;
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.arc(u.x, u.y, 17 * px, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
  }
  if (u.mags.length && u.state === 'ready') {
    let tot = 0, have = 0; for (const x of IC.activeMags(S, u)) { tot += x.max + x.storeMax; have += x.mag + x.store; }
    if (tot) { const w = 23 * px; ctx.fillStyle = 'rgba(10,20,28,0.85)'; ctx.fillRect(u.x - w / 2, u.y + 14 * px, w, 3 * px); ctx.fillStyle = have / tot > 0.3 ? C.friend : C.hostile; ctx.fillRect(u.x - w / 2, u.y + 14 * px, w * have / tot, 3 * px); }
  }
  if (u.hp < u.max) { ctx.fillStyle = C.hostile; ctx.fillRect(u.x - 11.5 * px, u.y + 18 * px, 23 * px * u.hp / u.max, 2 * px); }
  if (u.fat > 70 && u.state === 'ready') label('z', u.x - 13 * px, u.y - 7 * px, px, C.amber, 10, 'center', 700);
  const sel = (S.sel && S.sel.ref === u) || S.group.includes(u);
  if (cam.z > 0.2 || sel) {
    const tag = { building: 'BUILD', setup: 'SETUP', packing: 'PACK', transit: 'MOVE' }[u.state] || (silent ? (u.emcon === 'ambush' ? 'AMBUSH' : 'SILENT') : '');
    label(u.name + (tag ? ' · ' + tag : ''), u.x, u.y - 13 * px, px, busy ? C.amber : C.muted, 9.5);
  }
  if (sel) brackets(u.x, u.y, 17 * px, px);
  if (u.prio && !u.prio.dead && u.prio.det) { ctx.strokeStyle = 'rgba(242,180,65,0.5)'; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.prio.px, u.prio.py); ctx.stroke(); ctx.setLineDash([]); }
}
function drawG(S, g, px, now) {
  const s = px * 1.5;
  if (g.fort > 0.2 && !g.moving) { ctx.strokeStyle = `rgba(160,140,100,${0.3 + g.fort * 0.5})`; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(g.x, g.y, 22 * px, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  IC.drawGround(ctx, g, g.x, g.y, s, g.order === 'refit' ? 0.7 : 1);
  const w = 33 * px, y = g.y + 14 * px;
  ctx.fillStyle = 'rgba(10,20,28,0.85)'; ctx.fillRect(g.x - w / 2, y, w, 7 * px);
  ctx.fillStyle = g.str > 60 ? C.ok : g.str > 30 ? C.amber : C.hostile; ctx.fillRect(g.x - w / 2, y + 0.5 * px, w * g.str / 100, 2.8 * px);
  ctx.fillStyle = g.sup > 40 ? C.supply : C.hostile; ctx.fillRect(g.x - w / 2, y + 3.8 * px, w * g.sup / 100, 2.6 * px);
  // order badge
  const ic = ORDER_ICON[g.order] || '';
  if (ic) { ctx.fillStyle = 'rgba(6,14,20,0.9)'; ctx.beginPath(); ctx.arc(g.x + 18 * px, g.y - 10 * px, 6.5 * px, 0, 7); ctx.fill(); label(ic, g.x + 18 * px, g.y - 7 * px, px, g.order === 'attack' ? C.friend : g.order === 'dig' ? C.supply : C.text, 9, 'center', 700); }
  if (g.kit.atgm >= 1 && cam.z > 0.2) label(`AT ${Math.round(g.kit.atgm)}`, g.x - 21 * px, g.y - 7 * px, px, g.kit.atgm < 4 ? C.amber : C.muted, 8, 'center', 600);
  if (g.lift) label('✈', g.x + 18 * px, g.y + 8 * px, px, C.friend, 9, 'center', 700);
  const sel = (S.sel && S.sel.ref === g) || S.group.includes(g);
  if (cam.z > 0.13 || sel) label(g.name + (g.manual ? ' ◆' : ''), g.x, g.y + 32 * px, px, C.text, 10, 'center', 600);
  if (sel) { brackets(g.x, g.y, 22 * px, px); const p = IC.gTargetPos(S, g); if (U.dist(p, g) > 60) { ctx.strokeStyle = 'rgba(111,210,255,0.5)'; ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); } }
}
function column(x, y, h, n, px, col, ink) {
  const c = Math.cos(h || 0), s = Math.sin(h || 0);
  const k = Math.max(1, Math.min(2.2, cam.z * 2.5));
  for (let i = 0; i < n; i++) {
    const ox = x - c * i * 10 * px * k, oy = y - s * i * 10 * px * k;
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(h || 0); ctx.scale(k, k);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-4 * px + px, -2.5 * px + px, 8 * px, 5 * px);
    ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 0.9 * px;
    ctx.fillRect(-4 * px, -2.5 * px, 8 * px, 5 * px); ctx.strokeRect(-4 * px, -2.5 * px, 8 * px, 5 * px);
    ctx.fillStyle = ink; ctx.fillRect(2.2 * px, -2.5 * px, 1.8 * px, 5 * px);
    ctx.restore();
  }
}
function drawConvoys(S, px) {
  for (const v of S.vehicles) {
    if (v.state === 'idle' && cam.z < 0.4) continue;
    // trucks parked at an airport or factory sit out of the way when zoomed in
    if (v.state === 'idle' && v.home && v.home.parts && cam.z > 1.2) continue;
    if (!inView(v.x, v.y, 40)) continue;
    column(v.x, v.y, v.h, v.trucks, px, v.job ? C.supply : '#a08a5c', '#1b1307');
    const sel = S.sel && S.sel.ref === v;
    if (v.job && (cam.z > 0.18 || sel)) {
      const txt = `${v.job.short} ${v.job.qty}${v.job.kind === 'ground' ? '' : '×' + v.job.mun}`;
      ctx.font = `700 ${8.5 * px}px "IBM Plex Mono", monospace`;
      const w = ctx.measureText(txt).width + 7 * px;
      ctx.fillStyle = 'rgba(30,22,8,0.88)'; ctx.fillRect(v.x - w / 2, v.y - 19 * px, w, 12 * px);
      ctx.fillStyle = C.supply; ctx.textAlign = 'center'; ctx.fillText(txt, v.x, v.y - 10 * px); ctx.textAlign = 'left';
    }
    if (sel) {
      brackets(v.x, v.y, 15 * px, px);
      if (v.route) { ctx.strokeStyle = 'rgba(224,180,88,0.6)'; ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(v.x, v.y); for (const p of v.route) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); }
    }
  }
}
function drawWrecks(S, px, now) {
  for (const w of S.wrecks) {
    if (!inView(w.x, w.y, 20)) continue;
    const age = S.time - w.t, k = Math.max(0.35, 1 - age / 21600);
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.h + 0.6);
    const s = Math.max(px * (1 - WF * 0.6), 0.35 * (1 - WF * 0.95));
    ctx.fillStyle = `rgba(14,12,10,${0.8 * k})`;
    if ((w.type === 'aircraft' || w.type === 'airliner') && cam.z > 3) { ctx.restore(); IC.drawPlane(ctx, w.x, w.y, w.h || 0, w.type === 'airliner' ? 'narrow' : 'fighter', ['rgb(30,26,22)', 'rgb(20,18,16)'], { body: `rgba(34,30,26,${0.95 * k})`, minPx: 5 }); ctx.save(); ctx.translate(w.x, w.y); }
    else if (w.type === 'aircraft') silhouette(ctx, 'fighter', 0, 0, 0, Math.max(0.12, px * 0.9), `rgba(24,20,18,${0.9 * k})`, 'rgba(0,0,0,0.5)');
    else { ctx.fillRect(-5 * s, -3 * s, 10 * s, 6 * s); ctx.fillStyle = `rgba(60,48,40,${0.8 * k})`; ctx.fillRect(-2 * s, -1.5 * s, 4 * s, 3 * s); }
    ctx.restore();
    if (age < 900) { ctx.fillStyle = `rgba(255,120,40,${(0.4 + 0.3 * Math.sin(now * 8 + w.x)) * (1 - age / 900)})`; ctx.beginPath(); ctx.arc(w.x, w.y, 2.5 * px, 0, 7); ctx.fill(); }
  }
}
/* smoke trails that linger and drift */
function drawTrails(S, px) {
  ctx.lineCap = 'round';
  for (const tr of S.fx.trails) {
    const P = tr.pts; if (P.length < 2) continue;
    const last = P[P.length - 1]; if (!inView(last.x, last.y, 900)) continue;
    const wBase = tr.kind === 'big' || tr.kind === 'bal' ? 2.6 : tr.kind === 'con' ? 1.4 : tr.kind === 'eaam' ? 1.2 : 1.6;
    const col = tr.kind === 'con' ? '235,240,245' : tr.kind === 'eaam' ? '230,205,195' : '205,210,215';
    const life = tr.kind === 'con' ? 140 : 240;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], age = S.time - b.t;
      if (age > life) continue;
      const k = 1 - age / life;
      const da = (S.time - a.t) * 0.6, db = age * 0.6;
      ctx.strokeStyle = `rgba(${col},${0.42 * k * k})`;
      ctx.lineWidth = Math.max(wBase * px * (1 + (1 - k) * 2.5), wBase * 0.4 * (1 + (1 - k) * 4));
      ctx.beginPath(); ctx.moveTo(a.x + S.wind.x * da, a.y + S.wind.y * da); ctx.lineTo(b.x + S.wind.x * db, b.y + S.wind.y * db); ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}
/* smoke columns from burning sites: they rise, lean with the wind and stay for hours */
function drawPlumes(S, px, now, light) {
  for (const p of S.fx.plumes) {
    if (!inView(p.x, p.y, 400)) continue;
    const life = p.life, age = p.t;
    const k = Math.min(1, age / 120) * Math.min(1, (life - age) / 1800);
    if (k <= 0) continue;
    const zk = U.lerp(1, 0.1, WF), H = (60 + p.size * 90) * zk;
    for (let i = 0; i < 14; i++) {
      const f = ((i / 14) + now * 0.02 + p.seed) % 1;
      const x = p.x + S.wind.x * f * H * 1.6 + Math.sin(f * 6 + p.seed) * 4 * f;
      const y = p.y + S.wind.y * f * H * 1.6 - f * H * 0.35;
      const r = (4 + f * 26) * (0.6 + p.size * 0.5) * zk;
      const a = k * (1 - f) * 0.26;
      const shade = light < 0.4 && f < 0.3 ? '90,60,40' : '52,52,56';
      ctx.fillStyle = `rgba(${shade},${a})`; ctx.beginPath(); ctx.arc(x, y, Math.max(r, 3 * px), 0, 7); ctx.fill();
    }
  }
}
function drawImpacts(S, px, now) {
  for (const t of S.threats) {
    if (!t.det || t.dead || t.aff !== 'H' || t.d.pen) continue;
    let ix, iy;
    if (t.d.move === 'bal') { ix = t.x1; iy = t.y1; } else if (t.type === 'arm' || t.d.cls === 'hgv') { ix = t.aim.x; iy = t.aim.y; } else continue;
    const p = 0.5 + 0.5 * Math.sin(now * 6);
    ctx.strokeStyle = `rgba(255,91,79,${0.35 + 0.4 * p})`; ctx.lineWidth = 1.6 * px;
    ctx.beginPath(); ctx.ellipse(ix, iy, 16 * px + 25, 10 * px + 15, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([4 * px, 5 * px]); ctx.strokeStyle = 'rgba(255,91,79,0.3)';
    ctx.beginPath(); ctx.moveTo(t.px, t.py); ctx.lineTo(ix, iy); ctx.stroke(); ctx.setLineDash([]);
    if (cam.z > 0.15) label(`IMPACT ${U.dur(IC.timeToImpact(t))}`, ix, iy - 16 * px - 16, px, C.hostile, 9, 'center', 700);
  }
}

function drawTrack(S, t, px, now) {
  if (t.dead) return;
  if (!t.det) {
    if (t.tn && t.lost < 300 && !t.d.civil) {
      ctx.globalAlpha = 0.45 * (1 - t.lost / 300); ctx.strokeStyle = C.muted; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 3 * px]);
      ctx.strokeRect(t.px - 5 * px, t.py - 5 * px, 10 * px, 10 * px); ctx.setLineDash([]);
      label(`${t.tn} LOST`, t.px + 8 * px, t.py - 6 * px, px, C.muted, 9, 'left');
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (!inView(t.px, t.py, 80)) return;
  if (t.border && !(S.sel && S.sel.ref === t) && cam.z < 0.1) return;
  const aff = t.decoyKnown ? 'D' : t.aff || 'U';
  const age = S.time - t.pt;
  const coasting = age > 2.6 && !t.fc;
  const blink = coasting ? 0.45 + 0.55 * (Math.sin(now * 7 + t.seed) * 0.5 + 0.5) : 1;
  const x = t.px, y = t.py;
  if (t.trail && t.trail.length > 1) {
    const rgb = t.type === 'ga' && aff !== 'H' && aff !== 'S' ? '201,176,255' : { H: '255,120,100', S: '255,170,90', A: '127,232,176', N: '127,232,176' }[aff] || '242,209,74';
    for (let i = 0; i < t.trail.length; i++) { const p = t.trail[i]; ctx.fillStyle = `rgba(${rgb},${0.08 + i * 0.05})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 * px, 0, 7); ctx.fill(); }
  }
  if (coasting) {
    const sp = Math.hypot(t.pvx || 0, t.pvy || 0);
    const r = Math.min(400, (t.perr || 0) + sp * age);
    if (r * cam.z > 6) { ctx.strokeStyle = aff === 'H' ? 'rgba(255,91,79,0.3)' : 'rgba(242,209,74,0.3)'; ctx.setLineDash([2 * px, 4 * px]); ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
  if (t.blip > 0 && S.cfg.radarFx !== 'off') { const full = S.cfg.radarFx === 'full'; ctx.fillStyle = `rgba(160,230,255,${t.blip * (full ? 0.35 : 0.12)})`; ctx.beginPath(); ctx.arc(x, y, (full ? 6 + 10 * (1 - t.blip) : 5 + 3 * (1 - t.blip)) * px, 0, 7); ctx.fill(); }
  const alt = t.altKnown ? t.alt : null;
  if (alt != null && t.d.cls !== 'bal') shadow(x, y, t.alt, px, t.d.cls === 'air' ? 5 : 3);
  // an airliner off its route, or in an emergency, flashes until someone deals with it
  if (t.offFlag || t.emergency) {
    const p = (now * 1.2 + t.seed) % 1, em = t.emergency || t.sq === '7700';
    ctx.strokeStyle = em ? `rgba(255,70,60,${1 - p})` : `rgba(242,180,65,${1 - p})`; ctx.lineWidth = 2.5 * px;
    ctx.beginPath(); ctx.arc(x, y, (10 + p * 26) * px, 0, 7); ctx.stroke();
    if (cam.z > 0.06) label(em ? 'MAYDAY' : t.jammed ? 'OFF ROUTE · GPS' : 'OFF ROUTE', x, y + 20 * px, px, em ? C.hostile : C.amber, 8.5, 'center', 700);
  }
  ctx.globalAlpha = blink;
  const close = cam.z > 0.9 && t.klass && t.d.cls !== 'bal' && t.d.cls !== 'rkt';
  const s = px * (t.d.cls === 'air' ? 1.1 : 0.85);
  let col;
  if (close && t.acType && cam.z > 2.5 && (aff === 'A' || aff === 'N')) {
    col = AIRCOL[aff];
    IC.drawPlane(ctx, x, y, Math.atan2(t.pvy || t.vy, t.pvx || t.vx), t.acType, t.livery, { shadow: Math.min(3, t.alt * 0.25), minPx: 12 });
  } else if (close) {
    col = AIRCOL[aff];
    const kind = t.klass === 'bomber' || t.klass === 'jammer' ? 'bomber' : t.klass === 'airliner' ? 'airliner' : t.klass === 'light' ? 'light' : t.klass === 'drone' ? 'drone' : t.klass === 'cm' ? 'cm' : 'fighter';
    silhouette(ctx, kind, x, y, Math.atan2(t.pvy || t.vy, t.pvx || t.vx), Math.max(0.35 * (kind === 'airliner' || kind === 'bomber' ? 1.6 : 1), px * 1.3), col, 'rgba(0,0,0,0.7)');
  } else if (t.type === 'ga' && aff !== 'H' && aff !== 'S') {
    // light aircraft: a small lilac cross, never the airliner frame
    col = C.light; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * px;
    ctx.beginPath(); ctx.arc(x, y, 2.6 * px, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6.5 * px, y); ctx.lineTo(x + 6.5 * px, y); ctx.moveTo(x, y + 2.6 * px); ctx.lineTo(x, y + 6 * px); ctx.moveTo(x - 2.5 * px, y + 6 * px); ctx.lineTo(x + 2.5 * px, y + 6 * px); ctx.stroke();
  } else {
    col = airFrame(ctx, aff, x, y, s);
    if (t.d.cls === 'bal' && aff !== 'D') { ctx.beginPath(); ctx.moveTo(x, y - 12 * s); ctx.lineTo(x, y + 6 * s); ctx.stroke(); }
    if (t.d.cls === 'hgv') { ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 11 * s); ctx.lineTo(x, y - 14 * s); ctx.lineTo(x + 6 * s, y - 11 * s); ctx.stroke(); }
    if (t.d.jam && t.jamming) { ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 2 * s); ctx.lineTo(x - 1.5 * s, y - 4.5 * s); ctx.lineTo(x + 1.5 * s, y + 0.5 * s); ctx.lineTo(x + 4 * s, y - 2 * s); ctx.stroke(); }
  }
  const sp = Math.hypot(t.pvx || t.vx, t.pvy || t.vy) || 1;
  const Ld = Math.min(55 * px, sp * 140);
  ctx.strokeStyle = col; ctx.lineWidth = 1.4 * px;
  ctx.globalAlpha = 0.6 * blink; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (t.pvx || t.vx) / sp * Ld, y + (t.pvy || t.vy) / sp * Ld); ctx.stroke();
  ctx.globalAlpha = 1;
  if (t.spoofed) { ctx.strokeStyle = 'rgba(92,200,255,0.7)'; ctx.setLineDash([2 * px, 3 * px]); ctx.beginPath(); ctx.arc(x, y, 12 * px, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  if (t.satOnly) { ctx.strokeStyle = 'rgba(242,209,74,0.5)'; ctx.beginPath(); ctx.arc(x, y, 14 * px, 0, 7); ctx.stroke(); }
  if (t.notchT > 0 && t.det && cam.z > 0.25) label('NOTCH', x, y + 16 * px, px, C.suspect, 8, 'center', 700);
  const selT = S.sel && S.sel.ref === t;
  const show = selT || cam.z > 0.28 || (t.d.cls !== 'drone' && t.d.cls !== 'rkt' && t.d.cls !== 'ga' && !t.border && !(t.d.civil && cam.z < 0.12)) || (t.d.cls === 'drone' && cam.z > 0.15);
  if (show && S.layers.labels) {
    const code = t.type === 'ga' && (aff === 'N' || aff === 'A' || aff === 'U') ? `${t.cs} light${t.sq ? '' : ' · no transponder'}` : aff === 'N' || aff === 'A' ? t.cs : aff === 'H' ? t.d.code : aff === 'S' ? (t.sq ? t.cs + '?' : 'SUSP') : 'UNK';
    const altS = alt == null ? '---' : alt >= 1 ? (t.type === 'ga' ? alt.toFixed(1) : Math.round(alt)) + 'k' : Math.round(alt * 1000) + 'm';
    label(`${t.tn} ${code} ${altS}${t.inbound ? ' ▸' + t.inbound : ''}`, x + 11 * px, y - 8 * px, px, col, 9.5, 'left', 600);
  }
  if (selT) {
    brackets(x, y, 14 * px, px);
    if (t.route && t.aff === 'H') { ctx.setLineDash([3 * px, 5 * px]); ctx.strokeStyle = 'rgba(255,91,79,0.35)'; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.moveTo(x, y); for (const p of t.route) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); }
  }
}

function drawAir(S, a, px, now) {
  if (a.gnd || !inView(a.x, a.y, 120)) return;
  const h = a.h || 0;
  const col = a.allied ? C.civil : C.friend;
  shadow(a.x, a.y, a.alt, px, a.kind === 'aew' || a.kind === 'cargo' ? 6 : 4);
  if (cam.z > 0.9) {
    const kind = a.kind === 'ftr' ? 'fighter' : a.kind === 'aew' || a.kind === 'cargo' ? 'transport' : a.kind === 'heli' || a.kind === 'atk' ? 'heli' : 'drone';
    for (let i = 0; i < (a.hp || 1); i++) {
      const ox = i ? -Math.cos(h) * 10 * px - Math.sin(h) * 8 * px : 0, oy = i ? -Math.sin(h) * 10 * px + Math.cos(h) * 8 * px : 0;
      silhouette(ctx, kind, a.x + ox, a.y + oy, h, Math.max(0.3 * (kind === 'transport' ? 1.6 : 1), px * 1.3), 'rgba(170,225,255,0.95)', 'rgba(0,20,30,0.8)');
      if (kind === 'heli') { ctx.save(); ctx.translate(a.x + ox, a.y + oy); ctx.rotate(now * 20); ctx.strokeStyle = 'rgba(220,240,255,0.5)'; ctx.lineWidth = 0.6 * px; ctx.beginPath(); ctx.moveTo(-8 * px, 0); ctx.lineTo(8 * px, 0); ctx.moveTo(0, -8 * px); ctx.lineTo(0, 8 * px); ctx.stroke(); ctx.restore(); }
    }
  } else {
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(h);
    ctx.strokeStyle = col; ctx.fillStyle = 'rgba(111,210,255,0.3)'; ctx.lineWidth = 1.4 * px;
    if (a.kind === 'ftr') {
      for (const [ox, oy] of (a.hp > 1 ? [[0, 0], [-8, 8]] : [[0, 0]])) { ctx.beginPath(); ctx.moveTo((ox + 7) * px, oy * px); ctx.lineTo((ox - 5) * px, (oy - 5) * px); ctx.lineTo((ox - 2.5) * px, oy * px); ctx.lineTo((ox - 5) * px, (oy + 5) * px); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    } else if (a.kind === 'heli' || a.kind === 'atk') {
      for (const [ox, oy] of (a.hp > 1 ? [[0, 0], [-7, 7]] : [[0, 0]])) {
        ctx.beginPath(); ctx.ellipse(ox * px, oy * px, 3.5 * px, 2 * px, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(ox * px, oy * px); ctx.rotate(now * 20); ctx.beginPath(); ctx.moveTo(-7 * px, 0); ctx.lineTo(7 * px, 0); ctx.moveTo(0, -7 * px); ctx.lineTo(0, 7 * px); ctx.stroke(); ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(9 * px, 0); ctx.lineTo(-8 * px, 0); ctx.moveTo(1 * px, -8 * px); ctx.lineTo(-1 * px, 8 * px); ctx.moveTo(-7 * px, -3 * px); ctx.lineTo(-7 * px, 3 * px); ctx.stroke();
      if (a.kind === 'aew') { ctx.beginPath(); ctx.ellipse(-1 * px, 0, 5 * px, 2 * px, 0, 0, 7); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (a.kind === 'aew' && (S.layers.rings || (S.sel && S.sel.ref === a))) {
    ctx.strokeStyle = 'rgba(92,200,255,0.18)'; ctx.setLineDash([6 * px, 6 * px]); ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.arc(a.x, a.y, 3200, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  if (cam.z > 0.12 || (S.sel && S.sel.ref === a)) {
    const extra = a.kind === 'ftr' ? ` ${a.aam}×AAM${a.gbu ? ' ' + a.gbu + '×GBU' : ''}` : a.runs && a.kind !== 'heli' ? ` ${a.runs} runs` : a.job ? ` ${a.job.short}` : '';
    label(a.name + extra + (a.state === 'rtb' ? ' RTB' : a.state === 'vid' ? ' VID' : ''), a.x + 12 * px, a.y + 14 * px, px, col, 9.5, 'left', 600);
  }
  if (S.sel && S.sel.ref === a) brackets(a.x, a.y, 14 * px, px);
}
function drawStrike(s, px) {
  ctx.fillStyle = 'rgba(160,230,255,0.95)';
  ctx.beginPath(); ctx.arc(s.x, s.y, 2.3 * px, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(140,220,255,0.22)'; ctx.setLineDash([3 * px, 5 * px]); ctx.lineWidth = 1 * px;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.aim.x, s.aim.y); ctx.stroke(); ctx.setLineDash([]);
}
function drawChaff(S, px) {
  for (const c of S.fx.chaff) {
    const k = 1 - c.t / c.life; if (k <= 0) continue;
    if (c.kind === 'flare') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,236,190,${k})`; ctx.beginPath(); ctx.arc(c.x, c.y, (1.6 + k) * px, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,170,90,${0.3 * k})`; ctx.beginPath(); ctx.arc(c.x, c.y, 5 * px, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = `rgba(210,215,225,${0.35 * k})`;
      for (let i = 0; i < 3; i++) ctx.fillRect(c.x + (U.hash(i, c.life * 100 | 0) - 0.5) * 8 * px * (1 + c.t), c.y + (U.hash(c.life * 100 | 0, i) - 0.5) * 8 * px * (1 + c.t), 1.2 * px, 1.2 * px);
    }
  }
}

function drawGhost(S, px) {
  const m = S.mode2, h = S.hover;
  if (!m || !h) return;
  if (m.kind === 'deploy') {
    const ok = IC.canPlace(S, m.type, h.x, h.y) && (S.reserve[m.type] || 0) > 0;
    const d = IC.UNITS[m.type];
    const rng = IC.typeRange(m.type);
    ctx.strokeStyle = ok ? 'rgba(111,210,255,0.8)' : 'rgba(255,91,79,0.8)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([7 * px, 5 * px]);
    if (rng) { ctx.beginPath(); ctx.arc(h.x, h.y, rng, 0, 7); ctx.stroke(); }
    if (d.sensor && d.sensor.nctrR) { ctx.strokeStyle = 'rgba(127,232,176,0.5)'; ctx.beginPath(); ctx.arc(h.x, h.y, d.sensor.nctrR, 0, 7); ctx.stroke(); }
    if (d.logi && d.logi.reach) { ctx.strokeStyle = 'rgba(224,180,88,0.5)'; ctx.beginPath(); ctx.arc(h.x, h.y, d.logi.reach, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85; IC.drawUnitSymbol(ctx, m.type, h.x, h.y, px, ok ? C.friend : C.hostile, { tint: ok ? null : 'rgba(255,91,79,0.4)' }); ctx.globalAlpha = 1;
    if (d.sensor && d.sensor.mast && !d.sensor.passive) label(`low-flier horizon ~${U.km(U.horizon(d.sensor.mast, 0.05))}`, h.x, h.y + 26 * px, px, C.muted, 9);
  } else if (m.kind === 'airPoint') {
    const R = m.mission === 'aew' ? 3200 : m.mission === 'isr' ? 450 : 550;
    ctx.strokeStyle = 'rgba(111,210,255,0.7)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([6 * px, 5 * px]);
    ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawHints(S, px, now) {
  const hint = IC.stepHint && IC.stepHint(S);
  if (!hint) return;
  let p = null;
  if (hint.at) p = hint.at(S);
  if (hint.track) { const t = hint.track(S); if (t && t.det) p = { x: t.px, y: t.py }; }
  if (!p) return;
  const k = (now * 0.8) % 1;
  ctx.strokeStyle = `rgba(242,180,65,${0.9 * (1 - k)})`; ctx.lineWidth = 3 * px;
  ctx.beginPath(); ctx.arc(p.x, p.y, (18 + k * 40) * px, 0, 7); ctx.stroke();
}
/* rain, storms and fog over the whole view */
let drops = null, flashT = 0;
function drawWeather(S, wx, now, light) {
  if (!S.layers.weather) return;
  if (wx.fog > 0.02) { ctx.fillStyle = `rgba(190,196,204,${wx.fog * 0.35 * (0.4 + 0.6 * light)})`; ctx.fillRect(0, 0, cam.vw, cam.vh); }
  if (wx.precip > 0.05) {
    if (!drops) { drops = []; for (let i = 0; i < 260; i++) drops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }); }
    const n = Math.round(260 * wx.precip), vx = S.wind.x * 0.3, len = 14;
    ctx.strokeStyle = `rgba(190,210,230,${0.18 + 0.12 * light})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = drops[i]; const y = (d.y + now * 0.9 * d.s) % 1, x = (d.x + now * vx * 0.1) % 1;
      const X = x * cam.vw, Y = y * cam.vh;
      ctx.moveTo(X, Y); ctx.lineTo(X - vx * len, Y + len * d.s);
    }
    ctx.stroke();
  }
  if (wx.precip > 0.9 && !S.paused) {
    if (flashT <= 0 && Math.random() < 0.004) { flashT = 0.25; IC.sfx && IC.sfx.thunder && IC.sfx.thunder(); }
    if (flashT > 0) { ctx.fillStyle = `rgba(230,236,255,${flashT * 0.8})`; ctx.fillRect(0, 0, cam.vw, cam.vh); flashT -= 0.03; }
  }
}

/* ---------- minimap ---------- */
let miniThumb = null;
IC.renderMini = function (S, mc, mw, mh) {
  const g = mc.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!miniThumb) { miniThumb = document.createElement('canvas'); miniThumb.width = 400; miniThumb.height = 300; miniThumb.getContext('2d').drawImage(S.terrain.base, 0, 0, 400, 300); }
  g.drawImage(miniThumb, 0, 0, mw, mh);
  const k = mw / IC.WW;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, mw, mh);
  for (const f of S.fronts) if (f.active) { g.strokeStyle = '#ff6a50'; g.lineWidth = 1.5; g.beginPath(); f.pts.forEach((p, i) => { const q = IC.linePt(f, i); i ? g.lineTo(q.x * k, q.y * k) : g.moveTo(q.x * k, q.y * k); }); g.stroke(); }
  for (const i of IC.cities(S)) { g.fillStyle = i.owner === 'enemy' ? C.hostile : '#f0e6d4'; g.fillRect(i.x * k - 1.5, i.y * k - 1.5, 3, 3); }
  g.fillStyle = C.friend; for (const u of S.units) g.fillRect(u.x * k - 1, u.y * k - 1, 2, 2);
  for (const t of S.threats) if (t.det && !t.dead && !t.border) { g.fillStyle = AIRCOL[t.aff] || C.unknown; g.fillRect(t.px * k - 1, t.py * k - 1, 2.5, 2.5); }
  for (const s of S.esites) if (s.pk === 2 && !s.destroyed) { g.fillStyle = C.hostile; g.fillRect(s.x * k - 1.5, s.y * k - 1.5, 3, 3); }
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
  g.strokeRect(cam.x * k, cam.y * k, cam.vw / cam.z * k, cam.vh / cam.z * k);
};
IC.resetMini = () => { miniThumb = null; };

})(window.IC);
