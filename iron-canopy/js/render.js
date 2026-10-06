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
const cam = IC.cam = { x: IC.WW / 3, y: IC.WH / 3, z: 0.05, vw: 800, vh: 600 };
let ctx, cv, dpr = 1, hatchR = null;
// airborne early warning discs, drawn over the whole map at COVK pixels a unit
const cov = document.createElement('canvas'); cov.width = 600; cov.height = Math.round(600 * IC.WH / IC.WW);
const COVK = 600 / IC.WW;
const cx2 = cov.getContext('2d');
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const inView = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
/* 0 on the strategic map, 1 close in: effects drawn big for readability far out shrink to their real size near */
let WF = 0;
/* shared with the other render-*.js files: the canvas, the view and the label helpers */
const RS = IC.rs = { inView: (x, y, m) => inView(x, y, m), label: (...a) => label(...a), brackets: (...a) => brackets(...a), shadow: (...a) => shadow(...a) };
IC.initRender = function (canvas) {
  cv = canvas; ctx = cv.getContext('2d'); dpr = Math.min(2, window.devicePixelRatio || 1);
  const mk = (col) => { const h = document.createElement('canvas'); h.width = 14; h.height = 14; const g = h.getContext('2d'); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 14); g.lineTo(14, 0); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(10, 18); g.lineTo(18, 10); g.stroke(); return ctx.createPattern(h, 'repeat'); };
  hatchR = mk('rgba(255,90,70,0.35)');
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
/* show the box x0..x1, y0..y1 (world units) with a margin, at once or by flying there */
IC.frameZoom = (x0, y0, x1, y1, m) => Math.min(cam.vw / ((x1 - x0) * (m || 1.15) + 1), cam.vh / ((y1 - y0) * (m || 1.15) + 1));
IC.frame = function (x0, y0, x1, y1, fly, m) {
  const z = U.clamp(IC.frameZoom(x0, y0, x1, y1, m), IC.minZoom(), IC.MAXZ);
  if (fly) IC.flyTo((x0 + x1) / 2, (y0 + y1) / 2, z); else { cam.z = z; IC.centerOn((x0 + x1) / 2, (y0 + y1) / 2); }
};
/* the home country's box, for framing the whole country */
IC.homeBox = W => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of W.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
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
/* ---------- main draw ---------- */
IC.render = function (S, now) {
  const z = cam.z, px = 1 / z;
  IC.frameN = (IC.frameN || 0) + 1;
  WF = U.clamp((z - 0.8) / 4, 0, 1);
  let sx = 0, sy = 0;
  if (S.shake > 0.3) { sx = (Math.random() - 0.5) * S.shake; sy = (Math.random() - 0.5) * S.shake; }
  S.shake *= 0.88;
  view = { x0: cam.x, y0: cam.y, x1: cam.x + cam.vw / z, y1: cam.y + cam.vh / z };
  RS.ctx = ctx; RS.view = view; RS.WF = WF;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#04080c'; ctx.fillRect(0, 0, cam.vw, cam.vh);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, (-cam.x * z + sx) * dpr, (-cam.y * z + sy) * dpr);
  ctx.imageSmoothingEnabled = true;
  if (S.flat) IC.drawFlat(ctx, S, view, px); else IC.drawTerrain(ctx, S.terrain, cam, dpr, S.paused ? 14 : 7, S);
  if (z * dpr >= 1.3) IC.drawRoads(ctx, S, px, view);
  const wx = IC.wx(S), light = IC.daylight(S.time);

  // cloud shadows drift with the wind
  if (S.layers.weather && S.clouds) {
    const k = 22, ox = (S.time * S.wind.x * 0.8) % (256 * k), oy = (S.time * S.wind.y * 0.8) % (256 * k);
    const pat = ctx.createPattern(S.clouds.dark, 'repeat');
    pat.setTransform(new DOMMatrix().translate(ox, oy).scale(k));
    ctx.globalAlpha = (0.12 + 0.5 * wx.cloud) * (0.4 + 0.6 * light); ctx.fillStyle = pat; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); ctx.globalAlpha = 1;
  }
  // night, dusk and dawn
  if (light < 1) {
    // airports darken their own field (render-airport.js), so the night here leaves those boxes out
    ctx.fillStyle = `rgba(3,8,24,${0.62 * (1 - light)})`; ctx.beginPath(); ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    if (z >= 0.3) for (const b of IC.bases(S)) {
      const k = b._box; if (!k || !k.poly || !b.parts || !inView(b.x, b.y, b.radius + 20)) continue;
      IC.aptFencePath(ctx, k);
    }
    ctx.fill('evenodd');
  }
  const h = (S.time % 86400) / 3600;
  const golden = h > 5 && h < 8.5 ? 1 - Math.abs(h - 6.8) / 1.7 : h > 17 && h < 20.5 ? 1 - Math.abs(h - 18.8) / 1.7 : 0;
  if (golden > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(255,140,60,${0.35 * golden})`; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); ctx.globalCompositeOperation = 'source-over'; }
  if (light < 0.9) drawLights(S, px, now, light);

  if (S.layers.coverage) drawCoverage(S);
  drawAirways(S, px, now);
  drawFronts(S, px);
  IC.drawRoadBridges(ctx, S, px, view);
  if (S.layers.civil && z > 0.12) IC.drawTraffic(ctx, S, px, view, light, now);
  drawBases(S, px, now, light);
  drawZones(S, px, now);
  drawFields(S, px);
  drawInfra(S, px, now);
  IC.drawForces(S, px, now);
  if (S.layers.logistics) IC.drawConvoys(ctx, S, px);
  IC.drawCombat(S, px, now, light);
  if (IC.drawWarnings) IC.drawWarnings(ctx, S, px, now);
  IC.drawHeightLadders(ctx, S, px, view);
  // the build bar's info view over the airport being built on (render-infoview.js)
  if (IC.bb && IC.bb.view && IC.drawInfoView) IC.drawInfoView(ctx, S, px, now);


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
  if (IC.drawWarnHud) IC.drawWarnHud(ctx, S, now);
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
  if (cam.z > 5) IC.streetLights(ctx, S, view, light, pf);
  ctx.globalAlpha = (1 - light) * 0.8;
  // village houses, ours bright and foreign dim, in one path each; far out a village is a few pixels, so one light
  const far = cam.z < 0.15, d = 1.4 * Math.max(px, 0.5);
  for (const home of [true, false]) {
    ctx.fillStyle = `rgba(255,200,120,${home ? 0.5 : 0.2})`; ctx.beginPath();
    for (const v of S.world.villages) {
      if (v.home !== home || !inView(v.x, v.y, 60) || !v.blocks.length) continue;
      if (far) { const r = Math.max(d, Math.sqrt(v.blocks.length) * 0.35); ctx.rect(v.x - r / 2, v.y - r / 2, r, r); continue; }
      for (const b of v.blocks) if (b.hp > 0 && (b.seed % 3) < 2) ctx.rect(b.x, b.y, d, d);
    }
    ctx.fill();
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
  // our military radars go into the same image: blue, deeper where they see lower, with holes behind hills
  const M = IC.milCov(S);
  if (covImg && covImg.v === C.v && covImg.seed === S.seed && covImg.C === C && covImg.M === M) return covImg.cv;
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
    const m = M.g[k]; if (m === Infinity) continue;
    // laid over the controllers' colours (the image is drawn at half strength, hence the doubled alpha)
    const ma = (m < 0.5 ? 140 : m < 1.5 ? 84 : m < 3.5 ? 44 : 20) / 255, da = d[o + 3] / 255, oa = ma + da * (1 - ma);
    d[o] = (92 * ma + d[o] * da * (1 - ma)) / oa; d[o + 1] = (200 * ma + d[o + 1] * da * (1 - ma)) / oa; d[o + 2] = (255 * ma + d[o + 2] * da * (1 - ma)) / oa; d[o + 3] = oa * 255;
  }
  g2.putImageData(img, 0, 0);
  covImg = { v: C.v, seed: S.seed, C, M, cv: cv2, home };
  return cv2;
}
function drawCoverage(S) {
  const cc = covCanvas(S);
  if (cc) { ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true; ctx.drawImage(cc, 0, 0, cc.width * IC.ASP.CS, cc.height * IC.ASP.CS); ctx.globalAlpha = 1; }
  // airborne early warning looks down from above the hills: a plain disc
  cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.clearRect(0, 0, cov.width, cov.height); cx2.setTransform(COVK, 0, 0, COVK, 0, 0);
  let any = false;
  for (const s of S.sensors) {
    if (!s.air || s.air.kind !== 'aew') continue;
    any = true;
    cx2.fillStyle = 'rgba(150,160,255,0.55)';
    cx2.beginPath(); cx2.arc(s.x, s.y, s.R * (s.jamF || 1), 0, 7); cx2.fill();
  }
  if (any) { ctx.globalAlpha = 0.055; ctx.drawImage(cov, 0, 0, IC.WW, IC.WH); ctx.globalAlpha = 1; }
}
/* the airspace: control zones, the player's fixes and airways (teal where radar sees cruising traffic, amber
   where it does not), where airways cross, each airport's way onto the network, and the selected flight's route */
function drawAirways(S, px, now) {
  const N = S.asp, m = S.mode2, edit = m && m.kind === 'airway', show = S.layers.airways || edit || (m && m.kind === 'asp') || (IC.ui.aptTab === 'asp' && S.sel && S.sel.kind === 'infra');
  const sel = S.sel, z = cam.z;
  if (N) IC.drawAirspace(ctx, S, px, view, S.layers.labels, show);
  if (N && show) {
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
      // an entry and exit point on the border wears a ring
      if (f.gate) { ctx.strokeStyle = on ? '#ffffff' : C.airway; ctx.lineWidth = 1.4 * px; ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.7, 0, 7); ctx.stroke(); }
      if (on) brackets(f.x, f.y, 11 * px, px);
      if (S.layers.labels || edit) label(f.gate ? `${f.name} · ENTRY` : f.name, f.x, f.y + 16 * px, px, on ? '#ffffff' : C.airway, 9, 'center', 700);
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
    if (IC.drawFieldLife) IC.drawFieldLife(ctx, S, f, px);
    if (cam.z < 3) {
      ctx.strokeStyle = C.light; ctx.lineWidth = 1.4 * px;
      ctx.beginPath(); ctx.arc(f.x, f.y, 5 * px, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x - Math.cos(f.a) * 8 * px, f.y - Math.sin(f.a) * 8 * px); ctx.lineTo(f.x + Math.cos(f.a) * 8 * px, f.y + Math.sin(f.a) * 8 * px); ctx.stroke();
    }
    if (f === sel) brackets(f.x, f.y, 12 * px, px);
    if (S.layers.labels && cam.z > 0.12) label(f.name, f.x, f.y + 17 * px, px, C.light, 9, 'center', 600);
  }
}

function drawFronts(S, px) {
  for (const f of S.world.fronts) {
    const P = f.pts;
    ctx.strokeStyle = 'rgba(255,110,90,0.35)'; ctx.lineWidth = 2 * px; ctx.setLineDash([10 * px, 8 * px]);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
  }
}
/* airports and air bases, drawn part by part at real scale (render-airport.js) */
function drawBases(S, px, now, light) {
  for (const b of IC.bases(S)) {
    if (!b.parts || !inView(b.x, b.y, b.radius + 20) || cam.z < 0.3) continue;
    IC.drawAirport(ctx, S, b, px, now, light);
    if (IC.drawApronLife && b.kind === 'airport') IC.drawApronLife(ctx, S, b, px);
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
      if (i.alert > 0) { const p = (now * 0.6) % 1; ctx.strokeStyle = `rgba(255,91,79,${0.7 * (1 - p)})`; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(i.x, i.y, i.r * 0.7 + (6 + p * 34) * px, 0, 7); ctx.stroke(); }
      const nm = i.name.toUpperCase();
      const big = i.capital ? 14 : i.pop > 350 ? 12 : 10.5;
      // far out, only the big cities are named, so the names stay readable
      if ((S.layers.labels && (cam.z > 0.035 || i.pop > 150)) || i.pop > 350) {
        label(nm, i.x, i.y - Math.max(i.r * 0.9, 10 * px) - 4 * px, px, '#f2f5f7', big, 'center', i.capital ? 700 : 600);
        if (cam.z > 0.14) label(`${i.pop}k${i.alert > 0 ? ' · SIRENS' : ''}`, i.x, i.y - Math.max(i.r * 0.9, 10 * px) + 9 * px, px, i.alert > 0 ? C.hostile : C.muted, 9);
      }
      if (i.capital) { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(i.x, i.y, 3 * px, 0, 7); ctx.fill(); }
    } else {
      if (i.parts && cam.z > 0.3) { /* drawn part by part */ }
      else {
        const s = px, col = i.offline ? '#6a7880' : C.friend;
        ctx.fillStyle = 'rgba(6,14,20,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.arc(i.x, i.y, 9 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = `700 ${7.5 * s}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
        ctx.fillText({ airport: '✈', airbase: 'AB', factory: 'IND', power: 'ϟ' }[i.kind], i.x, i.y + 2.6 * s); ctx.textAlign = 'left';
        if (S.layers.labels && cam.z > 0.1) label(i.name, i.x, i.y + 20 * px, px, i.offline ? '#8a8f94' : C.muted, 9.5);
      }
      if (i.parts) {
        const st = IC.baseStatus(S, i);
        if (!st.runway && !i.locked && IC.rwyState(S, i).closed) label('RUNWAY CLOSED', i.x, i.y - 16 * px - (cam.z > 0.3 ? 12 : 0), px, C.hostile, 9, 'center', 700);
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
  if (cam.z < 0.16 && S.layers.labels && !S.flat) {
    for (const f of S.world.foreign) if (inView(f.x, f.y, 100)) label(f.taken ? f.name + ' (ours)' : f.name, f.x, f.y + f.r + 14 * px, px, f.taken ? C.friend : 'rgba(210,205,190,0.55)', 9, 'center', 500);
    const W = S.world;
    for (const k of ['A', 'B', 'C', 'D']) {
      const [a0, a1] = W.secSpan(k), a = (a0 + a1) / 2, p = W.borderPt(a), r = Math.hypot(p.x - W.cx, p.y - W.cy);
      const x = U.clamp(W.cx + (p.x - W.cx) * (r + 4000) / r, 2800, IC.WW - 2800), y = U.clamp(W.cy + (p.y - W.cy) * (r + 4000) / r, 900, IC.WH - 800);
      label(W.full[k].toUpperCase(), x, y, px, W.side[k] === 'hostile' ? 'rgba(255,150,130,0.4)' : 'rgba(200,210,220,0.3)', 18, 'center', 600);
    }
  }
}

function drawGhost(S, px) {
  const m = S.mode2, h = S.hover;
  if (!m || !h) return;
  if (m.kind === 'deploy') {
    const ok = IC.canPlace(S, m.type, h.x, h.y) && ((S.reserve[m.type] || 0) > 0 || !IC.buyBlock(S, m.type));
    const d = IC.UNITS[m.type];
    const rng = IC.typeRange(m.type);
    ctx.strokeStyle = ok ? 'rgba(111,210,255,0.8)' : 'rgba(255,91,79,0.8)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([7 * px, 5 * px]);
    if (rng) { ctx.beginPath(); ctx.arc(h.x, h.y, rng, 0, 7); ctx.stroke(); }
    if (d.sensor && d.sensor.nctrR) { ctx.strokeStyle = 'rgba(127,232,176,0.5)'; ctx.beginPath(); ctx.arc(h.x, h.y, d.sensor.nctrR, 0, 7); ctx.stroke(); }
    if (d.logi && d.logi.reach) { ctx.strokeStyle = 'rgba(224,180,88,0.5)'; ctx.beginPath(); ctx.arc(h.x, h.y, d.logi.reach, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85; IC.drawUnitSymbol(ctx, m.type, h.x, h.y, px, ok ? C.friend : C.hostile, { tint: ok ? null : 'rgba(255,91,79,0.4)' }); ctx.globalAlpha = 1;
    if (d.sensor && d.sensor.mast && !d.sensor.passive) label(`low-flier horizon ~${U.km(U.horizon(d.sensor.mast, 0.05))}`, h.x, h.y + 26 * px, px, C.muted, 9);
    if (ok) IC.drawDeployEta(ctx, S, px, m.type, h);
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
    // snow drifts down slowly as flakes; rain falls in streaks
    if (wx.snow) {
      ctx.fillStyle = `rgba(235,242,250,${0.35 + 0.2 * light})`;
      for (let i = 0; i < n; i++) { const d = drops[i], y = (d.y + now * 0.12 * d.s) % 1, x = (d.x + now * vx * 0.05 + Math.sin(now + i) * 0.004 + 1) % 1; ctx.fillRect(x * cam.vw, y * cam.vh, 2 * d.s, 2 * d.s); }
    } else {
    ctx.strokeStyle = `rgba(190,210,230,${0.18 + 0.12 * light})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = drops[i]; const y = (d.y + now * 0.9 * d.s) % 1, x = (d.x + now * vx * 0.1) % 1;
      const X = x * cam.vw, Y = y * cam.vh;
      ctx.moveTo(X, Y); ctx.lineTo(X - vx * len, Y + len * d.s);
    }
    ctx.stroke();
    }
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
  if (!miniThumb) { miniThumb = document.createElement('canvas'); miniThumb.width = 400; miniThumb.height = 300; const mg = miniThumb.getContext('2d'); if (S.terrain && S.terrain.base) mg.drawImage(S.terrain.base, 0, 0, 400, 300); else { mg.fillStyle = '#1d2622'; mg.fillRect(0, 0, 200, 300); mg.fillStyle = '#2a1e1c'; mg.fillRect(200, 0, 200, 300); } }
  g.drawImage(miniThumb, 0, 0, mw, mh);
  const k = mw / IC.WW;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, mw, mh);
  for (const i of IC.cities(S)) { const d = i.capital ? 3.5 : i.pop > 350 ? 2.5 : 1.5; g.fillStyle = '#f0e6d4'; g.fillRect(i.x * k - d / 2, i.y * k - d / 2, d, d); }
  g.fillStyle = C.friend; for (const u of S.units) g.fillRect(u.x * k - 1, u.y * k - 1, 2, 2);
  for (const t of S.threats) if (t.det && !t.dead && !t.border) { g.fillStyle = IC.AIRCOL[t.aff] || C.unknown; g.fillRect(t.px * k - 1, t.py * k - 1, 2.5, 2.5); }
  for (const s of S.esites) if (s.pk === 2 && !s.destroyed) { g.fillStyle = C.hostile; g.fillRect(s.x * k - 1.5, s.y * k - 1.5, 3, 3); }
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
  g.strokeRect(cam.x * k, cam.y * k, cam.vw / cam.z * k, cam.vh / cam.z * k);
};
IC.resetMini = () => { miniThumb = null; };

})(window.IC);
