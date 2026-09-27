/* Iron Canopy — map imagery. A low-resolution base covers the whole region; as the camera zooms in,
   detail tiles are painted on demand (fields, forest canopy, buildings, rail, road markings) and damage
   (craters, scorch, rubble) is stamped into every layer that shows it. */
(function (IC) {
'use strict';
const U = IC.U;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(h) {
  if (h < 0.28) return mix([64, 84, 60], [80, 94, 66], Math.max(0, h) / 0.28);
  if (h < 0.55) return mix([80, 94, 66], [102, 100, 78], (h - 0.28) / 0.27);
  if (h < 0.8) return mix([102, 100, 78], [126, 116, 96], (h - 0.55) / 0.25);
  return mix([126, 116, 96], [196, 192, 186], Math.min(1, (h - 0.8) / 0.28));
}
const FIELDS = [[104, 112, 70], [122, 114, 74], [88, 104, 62], [114, 122, 86], [96, 92, 60], [132, 126, 90], [140, 128, 84], [92, 110, 72], [118, 104, 70]];
const LODS = [
  { k: 1, ppu: 0.8, size: 480, max: 72 },
  { k: 2, ppu: 2.4, size: 200, max: 40 },
  { k: 3, ppu: 8, size: 64, max: 60 }
];
IC.LODS = LODS;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

IC.buildTerrain = function (W) {
  const TS = IC.TS, CW = Math.round(IC.WW * TS), CH = Math.round(IC.WH * TS);
  const BW = 1200, BH = 900, cellX = IC.WW / BW, cellY = IC.WH / BH;
  // forest mask on a 20-unit grid, shared by the base and the detail tiles
  const FGW = Math.ceil(IC.WW / 20), FGH = Math.ceil(IC.WH / 20);
  const FG = new Uint8Array(FGW * FGH);
  for (let j = 0; j < FGH; j++) for (let i = 0; i < FGW; i++) FG[j * FGW + i] = W.forestAt(i * 20 + 10, j * 20 + 10) ? 1 : 0;
  const forest = (x, y) => { const i = Math.floor(x / 20), j = Math.floor(y / 20); return i >= 0 && j >= 0 && i < FGW && j < FGH && FG[j * FGW + i] === 1; };
  const T = { W, FG, forest, tiles: new Map(), scars: [], queue: [], gen: 0, frame: 0 };

  const tmp = mk(BW, BH);
  const tg = tmp.getContext('2d'), img = tg.createImageData(BW, BH), d = img.data;
  for (let y = 0; y < BH; y++) {
    const wy = (y + 0.5) * cellY;
    for (let x = 0; x < BW; x++) {
      const wx = (x + 0.5) * cellX;
      const h = W.hAt(wx, wy);
      const hx = W.hAt(wx + 15, wy) - W.hAt(wx - 15, wy), hy = W.hAt(wx, wy + 15) - W.hAt(wx, wy - 15);
      const shade = U.clamp(1 - (hx + hy) * 6.5, 0.55, 1.5);
      const k = W.countryAt(wx, wy);
      let c = ramp(h);
      const hsh = U.hash(x, y);
      const fw = W.farmAt(wx, wy) * 0.65;
      if (fw > 0.02) {
        const ca = 0.5, rx = wx * Math.cos(ca) - wy * Math.sin(ca), ry = wx * Math.sin(ca) + wy * Math.cos(ca);
        c = mix(c, FIELDS[Math.floor(U.hash(Math.floor(rx / 60), Math.floor(ry / 44)) * FIELDS.length)], fw);
      }
      if (forest(wx + (hsh - 0.5) * 30, wy + (U.hash(y, x) - 0.5) * 30)) c = mix(c, hsh > 0.5 ? [40, 60, 42] : [48, 70, 48], 0.78);
      let r = c[0], g = c[1], b = c[2];
      if (k !== 'H') {
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        r = (r + (lum - r) * 0.5) * 0.74; g = (g + (lum - g) * 0.5) * 0.74; b = (b + (lum - b) * 0.5) * 0.74;
        if (W.side[k] === 'hostile') { r *= 1.12; g *= 0.92; b *= 0.9; }
      }
      const n = (hsh - 0.5) * 9, i4 = (y * BW + x) * 4;
      d[i4] = (r * shade + n) * 0.86; d[i4 + 1] = (g * shade + n) * 0.86; d[i4 + 2] = (b * shade + n) * 0.86; d[i4 + 3] = 255;
    }
  }
  tg.putImageData(img, 0, 0);
  // the ground: relief, fields and forest, our border and the map grid. Detail tiles start from it, so they
  // do not inherit the wide roads baked into the base below
  tg.save(); tg.scale(BW / IC.WW, BH / IC.WH); tg.lineCap = 'round'; tg.lineJoin = 'round';
  const outline = () => { tg.beginPath(); W.poly.forEach(([x, y], i) => i ? tg.lineTo(x, y) : tg.moveTo(x, y)); tg.closePath(); };
  for (const [w, a] of [[70, 0.04], [34, 0.07], [12, 0.16]]) { tg.strokeStyle = `rgba(140,215,255,${a})`; tg.lineWidth = w; outline(); tg.stroke(); }
  tg.strokeStyle = 'rgba(210,215,220,0.2)'; tg.lineWidth = 7; tg.setLineDash([27, 36]);
  W.secs.forEach((s, i) => {
    tg.beginPath(); let first = true;
    for (let dd = 0; dd < 13500; dd += 60) {
      const a0 = s.a0 + W.jag(i, W.radialB(s.a0) + dd, dd), D = W.radialB(s.a0) + dd;
      const x = W.cx + Math.cos(a0) * D, y = W.cy + Math.sin(a0) * D;
      if (x < -80 || y < -80 || x > IC.WW + 80 || y > IC.WH + 80) break;
      if (first) { tg.moveTo(x, y); first = false; } else tg.lineTo(x, y);
    }
    tg.stroke();
  });
  tg.setLineDash([]);
  tg.strokeStyle = 'rgba(200,225,235,0.035)'; tg.lineWidth = 4;
  for (let x = 500; x < IC.WW; x += 500) { tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x, IC.WH); tg.stroke(); }
  for (let y = 500; y < IC.WH; y += 500) { tg.beginPath(); tg.moveTo(0, y); tg.lineTo(IC.WW, y); tg.stroke(); }
  tg.restore();
  T.ground = tmp;
  const cv = mk(CW, CH), g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, CW, CH);
  g.save(); g.scale(TS, TS); g.lineCap = 'round'; g.lineJoin = 'round';
  vectors(g, W, 0, 0, IC.WW, IC.WH, 0);
  g.restore();
  T.base = cv;
  T.grain = grain();
  for (const c of W.cities) IC.cityLights(c);
  return T;
};

/* vector layers shared by the base (lod 0) and the detail tiles */
function vectors(g, W, x0, y0, x1, y1, lod) {
  const inb = (bx0, by0, bx1, by1) => !(bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1);
  const smooth = (pts) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  // water
  for (const r of W.rivers) {
    if (!inb(r.bb[0] - 40, r.bb[1] - 40, r.bb[2] + 40, r.bb[3] + 40)) continue;
    const pts = r.pts.filter((_, i) => i % 2 === 0 || i === r.pts.length - 1);
    if (lod) { g.strokeStyle = 'rgba(70,80,52,0.5)'; g.lineWidth = r.w + 10; smooth(pts); g.stroke(); }
    g.strokeStyle = 'rgba(28,52,64,0.9)'; g.lineWidth = r.w + 4; smooth(pts); g.stroke();
    g.strokeStyle = 'rgba(58,106,132,1)'; g.lineWidth = r.w; smooth(pts); g.stroke();
    g.strokeStyle = 'rgba(130,180,205,0.35)'; g.lineWidth = r.w * 0.35; smooth(pts); g.stroke();
  }
  for (const l of W.lakes) {
    if (!inb(l.x - l.rx, l.y - l.rx, l.x + l.rx, l.y + l.rx)) continue;
    g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
    g.fillStyle = 'rgba(34,64,82,1)'; g.strokeStyle = 'rgba(28,48,58,1)'; g.lineWidth = 8;
    g.beginPath(); g.ellipse(0, 0, l.rx, l.ry, 0, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(140,190,215,0.3)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, l.rx - 6, l.ry - 6, 0, 0, 7); g.stroke();
    g.restore();
  }
  // rail
  for (const r of W.rails) {
    if (!inb(r.bb[0] - 10, r.bb[1] - 10, r.bb[2] + 10, r.bb[3] + 10)) continue;
    const line = () => { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
    g.strokeStyle = 'rgba(30,28,26,0.55)'; g.lineWidth = [4, 1.6, 0.7, 0.4][lod]; line(); g.stroke();
    if (lod >= 2) { g.strokeStyle = 'rgba(170,160,140,0.55)'; g.lineWidth = 0.4; g.setLineDash([0.3, 0.9]); line(); g.stroke(); g.setLineDash([]); }
  }
  // settlements: a grey wash under each city, parks, blocks
  for (const c of W.cities) {
    if (!inb(c.x - c.r * 2, c.y - c.r * 2, c.x + c.r * 2, c.y + c.r * 2)) continue;
    const wash = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 1.3);
    wash.addColorStop(0, 'rgba(120,118,110,0.4)'); wash.addColorStop(0.6, 'rgba(120,118,110,0.22)'); wash.addColorStop(1, 'rgba(120,118,110,0)');
    g.fillStyle = wash; g.beginPath(); g.arc(c.x, c.y, c.r * 1.3, 0, 7); g.fill();
    for (const p of c.parks) { g.fillStyle = 'rgba(62,94,60,0.75)'; g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, 7); g.fill(); }
  }
  // roads: lod 0 and 1 bake them all in at a readable width; closer in, city streets and lanes are baked (at
  // about real width) and render.js draws the road network live
  {
    const RW = [{ hw: 11, rd: 6.5, lc: 3.4, sp: 3 }, { hw: 3.6, rd: 2.2, lc: 1.3, sp: 1.1, ln: 0.6, art: 0.9, st: 0.5, ring: 2.4 },
      { ln: 0.3, art: 0.7, st: 0.5, ring: 0.9 }, { ln: 0.12, art: 0.4, st: 0.34, ring: 0.36 }][lod];
    const FILL = { hw: 'rgba(238,176,104,0.92)', rd: 'rgba(222,204,156,0.75)', lc: 'rgba(196,184,150,0.5)', sp: 'rgba(196,184,150,0.5)', ln: 'rgba(160,140,100,0.55)', art: 'rgba(178,174,164,0.75)', st: 'rgba(148,146,140,0.6)', ring: 'rgba(232,190,130,0.85)' };
    if (lod >= 2) { FILL.art = 'rgb(150,148,142)'; FILL.st = 'rgb(128,127,122)'; FILL.ring = 'rgb(128,127,122)'; FILL.ln = 'rgba(140,122,90,0.8)'; }
    const layers = [];
    if (lod) { layers.push(['ln', W.lanes]); for (const c of W.cities) if (inb(c.x - c.r * 1.5, c.y - c.r * 1.5, c.x + c.r * 1.5, c.y + c.r * 1.5)) for (const cls of ['st', 'art', 'ring']) layers.push([cls, c.streets.filter(l => l.cls === cls)]); }
    if (lod < 2) for (const cls of ['sp', 'lc', 'rd', 'hw']) layers.push([cls, W.edges.filter(e => e.cls === cls)]);
    for (const pass of [0, 1]) for (const [cls, list] of layers) {
      const w = RW[cls]; if (!w) continue;
      g.beginPath();
      for (const l of list) { if (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3])) continue; l.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); }
      if (pass === 0) { g.strokeStyle = cls === 'ln' ? 'rgba(40,34,24,0.2)' : 'rgba(20,18,14,0.45)'; g.lineWidth = w + [3, 1.2, 0.3, 0.1][lod]; }
      else { g.strokeStyle = FILL[cls]; g.lineWidth = w; }
      g.stroke();
    }
    if (lod === 1) for (const k in W.nodes) { const n = W.nodes[k]; if (n.ix && inb(n.x - 9, n.y - 9, n.x + 9, n.y + 9)) interchange(g, n, RW.lc, FILL.rd); }
  }
  g.strokeStyle = 'rgba(200,186,150,0.22)'; g.lineWidth = lod ? 2 : 6;
  for (const x of W.crossings) { g.beginPath(); g.moveTo(x.x, x.y); g.lineTo(x.far.x, x.far.y); g.stroke(); }
  g.strokeStyle = 'rgba(170,140,120,0.35)'; g.lineWidth = lod ? 2 : 6;
  for (const r of W.eroads) { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
  for (const c of W.cities) if (inb(c.x - c.r * 2, c.y - c.r * 2, c.x + c.r * 2, c.y + c.r * 2)) for (const b of c.blocks) block(g, b, lod, false, true);
  for (const v of W.villages.concat(W.foreign)) {
    if (!inb(v.x - 90, v.y - 90, v.x + 90, v.y + 90)) continue;
    const foreign = v.kind === 'ftown' || !v.home;
    for (const b of v.blocks) block(g, b, lod, foreign);
  }
}
/* cloverleaf ramps where a motorway meets another road */
function interchange(g, n, w, fill) {
  g.lineWidth = w; g.strokeStyle = fill;
  for (let k = 0; k < 4; k++) { const a = n.ixA + Math.PI / 4 + k * Math.PI / 2; g.beginPath(); g.arc(n.x + Math.cos(a) * 3.2, n.y + Math.sin(a) * 3.2, 2.2, 0, 7); g.stroke(); }
}
IC.interchange = interchange;
const ROOFS = [[178, 110, 86], [164, 98, 78], [196, 190, 176], [140, 136, 128], [120, 118, 116]];
function block(g, b, lod, foreign, town) {
  g.save(); g.translate(b.x, b.y); g.rotate(b.a);
  if (b.hp <= 0) { rubble(g, b); g.restore(); return; }
  const sd = Math.floor(b.seed);
  // the paved lot: pavements, yards and car parks between the buildings
  if (town && lod) { g.fillStyle = b.sub ? 'rgba(112,114,98,0.45)' : 'rgba(104,102,96,0.7)'; g.fillRect(-b.w / 2 - 0.2, -b.h / 2 - 0.2, b.w + 0.4, b.h + 0.4); }
  if (lod < 2) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-b.w / 2 + (lod ? 0.5 : 1.5), -b.h / 2 + (lod ? 0.5 : 1.5), b.w, b.h);
    g.fillStyle = foreign ? 'rgba(150,146,136,0.7)' : b.core ? 'rgba(204,200,188,0.92)' : b.ind ? 'rgba(170,170,176,0.85)' : `rgba(${168 + (b.seed % 20)},${160 + (b.seed % 16)},${146 + (b.seed % 12)},0.82)`;
    g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  } else if (lod === 3 && town && b.core) {
    // city centre: perimeter blocks of different buildings round a courtyard, with the odd tower
    const t = Math.min(b.w, b.h) * 0.3;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-b.w / 2 + 0.15, -b.h / 2 + 0.15, b.w, b.h);
    g.fillStyle = 'rgb(120,124,108)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    const seg = (x, y, w, h, k) => { const c = ROOFS[(sd + k) % ROOFS.length], v = U.hash(sd, k) * 24 - 12; g.fillStyle = `rgb(${c[0] + v | 0},${c[1] + v | 0},${c[2] + v | 0})`; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, w, h * 0.4); };
    const nS = 4, sw = b.w / nS, sh2 = (b.h - 2 * t) / 2;
    for (let k = 0; k < nS; k++) { seg(-b.w / 2 + k * sw + 0.02, -b.h / 2, sw - 0.04, t, k); seg(-b.w / 2 + k * sw + 0.02, b.h / 2 - t, sw - 0.04, t, k + 5); }
    for (let k = 0; k < 2; k++) { seg(-b.w / 2, -b.h / 2 + t + k * sh2 + 0.02, t, sh2 - 0.04, k + 9); seg(b.w / 2 - t, -b.h / 2 + t + k * sh2 + 0.02, t, sh2 - 0.04, k + 11); }
    if (sd % 3 === 0) { const tw = t * 1.5; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-b.w / 2 + 0.5, -b.h / 2 + 0.5, tw, tw); g.fillStyle = 'rgb(150,168,184)'; g.fillRect(-b.w / 2, -b.h / 2, tw, tw); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-b.w / 2, -b.h / 2, tw, tw * 0.3); }
  } else if (lod === 3 && town && b.ind) {
    // sheds with ribbed roofs
    for (let k = 0; k < 2; k++) {
      const x = -b.w / 2 + 0.2 + k * b.w / 2, w = b.w / 2 - 0.4, h = b.h * (0.55 + U.hash(sd, k) * 0.35);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 0.2, -b.h / 2 + 0.3, w, h);
      g.fillStyle = k ? 'rgb(150,158,166)' : 'rgb(176,178,180)'; g.fillRect(x, -b.h / 2 + 0.1, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.03;
      for (let q = 0.2; q < w; q += 0.25) { g.beginPath(); g.moveTo(x + q, -b.h / 2 + 0.1); g.lineTo(x + q, -b.h / 2 + 0.1 + h); g.stroke(); }
    }
  } else if (lod === 3 && town) {
    // houses in two rows facing the streets, gardens behind
    g.fillStyle = 'rgba(78,98,62,0.8)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    const lot = 0.75, n = Math.max(1, Math.floor(b.w / lot));
    for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
      const s = U.hash(sd + i * 13, row * 7 + 3); if (s < 0.1) continue;
      const hw = lot * (0.55 + s * 0.25), hh = 0.4 + U.hash(i, sd + row) * 0.15;
      const x = -b.w / 2 + i * lot + (lot - hw) / 2, y = row ? b.h / 2 - hh - 0.1 : -b.h / 2 + 0.1;
      const c = ROOFS[Math.floor(s * 10) % ROOFS.length];
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 0.08, y + 0.08, hw, hh);
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, y, hw, hh);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, y, hw, hh * 0.45);
      if (s > 0.8) { g.fillStyle = 'rgba(40,70,40,0.9)'; g.beginPath(); g.arc(x + lot / 2, row ? y - 0.45 : y + hh + 0.45, 0.25, 0, 7); g.fill(); }
    }
  } else {
    // subdivide the block into individual buildings with roofs and shadows
    const n = b.ind ? 2 : 2 + Math.floor((b.seed * 7) % 4), m = b.ind ? 1 : 2;
    const cw = b.w / n, ch = b.h / m, sh = lod === 3 ? 0.12 : 0.45;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const s = U.hash(sd + i * 13, j * 7 + 3);
      if (s < 0.12 && !b.core) continue;
      const bw = cw * (0.62 + s * 0.3), bh = ch * (0.6 + U.hash(i, sd) * 0.3);
      const x = -b.w / 2 + i * cw + (cw - bw) / 2, y = -b.h / 2 + j * ch + (ch - bh) / 2;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + sh, y + sh, bw, bh);
      const roof = foreign ? [150, 146, 136] : b.ind ? [158, 162, 168] : s < 0.4 ? [178, 110, 86] : s < 0.7 ? [196, 190, 176] : [140, 136, 128];
      g.fillStyle = `rgb(${roof[0]},${roof[1]},${roof[2]})`; g.fillRect(x, y, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, bw, bh * 0.45);
    }
  }
  g.restore();
}
function rubble(g, b) {
  g.fillStyle = 'rgba(20,16,12,0.55)'; g.fillRect(-b.w / 2 - 0.6, -b.h / 2 - 0.6, b.w + 1.2, b.h + 1.2);
  for (let i = 0; i < 6; i++) {
    const s = U.hash(Math.floor(b.seed) + i, 91);
    g.fillStyle = s < 0.5 ? 'rgba(92,84,76,0.9)' : 'rgba(60,54,50,0.9)';
    g.fillRect(-b.w / 2 + s * b.w * 0.8, -b.h / 2 + U.hash(i, Math.floor(b.seed)) * b.h * 0.8, b.w * 0.25, b.h * 0.25);
  }
}

/* ---------- detail tiles ---------- */
function paintTile(T, lod, tx, ty) {
  const L = LODS[lod - 1], W = T.W;
  const px = Math.round(L.size * L.ppu), x0 = tx * L.size, y0 = ty * L.size, x1 = x0 + L.size, y1 = y0 + L.size;
  const cv = mk(px, px), g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  const gs = T.ground.width / IC.WW;
  g.drawImage(T.ground, x0 * gs, y0 * gs, L.size * gs, L.size * gs, 0, 0, px, px);
  // fine grain so the upscaled base does not look smeared
  g.globalAlpha = lod >= 2 ? 0.5 : 0.35; g.globalCompositeOperation = 'overlay';
  const pat = g.createPattern(T.grain, 'repeat'); g.fillStyle = pat; g.fillRect(0, 0, px, px);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // fields in a slightly rotated patchwork that changes direction from district to district
  const FS = lod >= 2 ? [9, 6] : [10, 7];
  for (let dy = Math.floor(y0 / 1500); dy <= Math.floor(y1 / 1500); dy++) for (let dx = Math.floor(x0 / 1500); dx <= Math.floor(x1 / 1500); dx++) {
    const ang = (U.hash(dx + 900, dy + 300) - 0.5) * 1.2, ca = Math.cos(ang), sa = Math.sin(ang);
    const bx0 = Math.max(x0, dx * 1500), by0 = Math.max(y0, dy * 1500), bx1 = Math.min(x1, dx * 1500 + 1500), by1 = Math.min(y1, dy * 1500 + 1500);
    if (bx1 <= bx0 || by1 <= by0) continue;
    // rotated grid covering the box
    const corners = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]].map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca]);
    const u0 = Math.floor(Math.min(...corners.map(c => c[0])) / FS[0]), u1 = Math.ceil(Math.max(...corners.map(c => c[0])) / FS[0]);
    const v0 = Math.floor(Math.min(...corners.map(c => c[1])) / FS[1]), v1 = Math.ceil(Math.max(...corners.map(c => c[1])) / FS[1]);
    g.save(); g.beginPath(); g.rect(bx0, by0, bx1 - bx0, by1 - by0); g.clip();
    g.rotate(ang);
    for (let v = v0; v < v1; v++) for (let u = u0; u < u1; u++) {
      const cxu = (u + 0.5) * FS[0], cyv = (v + 0.5) * FS[1];
      const wx = cxu * ca - cyv * sa, wy = cxu * sa + cyv * ca;
      if (wx < bx0 - 10 || wx > bx1 + 10 || wy < by0 - 10 || wy > by1 + 10) continue;
      const fw = W.farmAt(wx, wy);
      const h = U.hash(u * 7 + dx * 1000, v * 11 + dy * 1000);
      if (fw < 0.15 || h > fw * 1.3 || T.forest(wx, wy)) continue;
      const home = W.inHome(wx, wy);
      const c = FIELDS[Math.floor(U.hash(u + 3, v + 5) * FIELDS.length)];
      const k = home ? 1 : 0.72;
      g.fillStyle = `rgba(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0},${0.35 + fw * 0.35})`;
      const sw = U.hash(u, v + 1) < 0.25 ? 0.5 : 1;
      g.fillRect(u * FS[0] + 0.3, v * FS[1] + 0.3, FS[0] * (sw < 1 && u % 2 ? 1 : 1) - 0.6, FS[1] * sw - 0.6);
      if (lod >= 2) {
        g.strokeStyle = 'rgba(42,54,32,0.45)'; g.lineWidth = 0.35; g.strokeRect(u * FS[0] + 0.3, v * FS[1] + 0.3, FS[0] - 0.6, FS[1] - 0.6);
        if (h < 0.3) { g.strokeStyle = 'rgba(80,70,40,0.25)'; g.lineWidth = 0.2; for (let q = 1; q < 5; q++) { g.beginPath(); g.moveTo(u * FS[0] + 0.5, v * FS[1] + q * FS[1] / 5); g.lineTo(u * FS[0] + FS[0] - 0.5, v * FS[1] + q * FS[1] / 5); g.stroke(); } }
      }
    }
    g.restore();
  }
  // forest canopy
  const step = [5, 5, 2.2, 1.1][lod], rad = lod === 3 ? [0.45, 0.8] : lod === 2 ? [0.9, 1.5] : [2.4, 3.4];
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
    const hx = U.hash(Math.round(x * 3.1), Math.round(y * 2.7));
    const jx = x + (hx - 0.5) * step, jy = y + (U.hash(Math.round(y * 5.3), Math.round(x * 1.9)) - 0.5) * step;
    if (!T.forest(jx, jy)) continue;
    const r = rad[0] + hx * (rad[1] - rad[0]);
    const home = W.inHome(jx, jy);
    g.fillStyle = home ? 'rgba(18,30,20,0.45)' : 'rgba(18,24,20,0.4)'; g.beginPath(); g.arc(jx + r * 0.35, jy + r * 0.35, r, 0, 7); g.fill();
    g.fillStyle = home ? (hx < 0.5 ? 'rgba(44,72,44,0.95)' : 'rgba(56,84,50,0.95)') : 'rgba(58,66,54,0.9)'; g.beginPath(); g.arc(jx, jy, r, 0, 7); g.fill();
    if (lod >= 2) { g.fillStyle = 'rgba(120,150,90,0.25)'; g.beginPath(); g.arc(jx - r * 0.3, jy - r * 0.3, r * 0.45, 0, 7); g.fill(); }
  }
  vectors(g, W, x0 - 60, y0 - 60, x1 + 60, y1 + 60, lod);
  for (const s of T.scars) if (s.x + s.r > x0 && s.x - s.r < x1 && s.y + s.r > y0 && s.y - s.r < y1) scar(g, s);
  return cv;
}

function scar(g, s) {
  if (s.kind === 'crater') {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 1.8);
    gr.addColorStop(0, 'rgba(10,8,6,0.75)'); gr.addColorStop(0.35, 'rgba(30,22,16,0.55)'); gr.addColorStop(0.55, 'rgba(120,104,84,0.25)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r * 1.8, 0, 7); g.fill();
  } else if (s.kind === 'burn') {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gr.addColorStop(0, 'rgba(8,6,4,0.6)'); gr.addColorStop(1, 'rgba(8,6,4,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
  } else if (s.kind === 'block') rubbleAt(g, s.b);
}
IC.drawScar = scar;
function rubbleAt(g, b) { g.save(); g.translate(b.x, b.y); g.rotate(b.a); rubble(g, b); g.restore(); }

/* stamp new damage everywhere it is visible: base, and any cached tiles */
IC.addScar = function (S, s) {
  const T = S.terrain; if (!T || !T.base) return;
  T.scars.push(s);
  if (T.scars.length > 4000) T.scars.splice(0, 500);
  const g = T.base.getContext('2d');
  g.save(); g.scale(IC.TS, IC.TS); scar(g, s); g.restore();
  for (const t of T.tiles.values()) {
    const L = LODS[t.lod - 1], x0 = t.tx * L.size, y0 = t.ty * L.size;
    if (s.x + s.r * 2 < x0 || s.x - s.r * 2 > x0 + L.size || s.y + s.r * 2 < y0 || s.y - s.r * 2 > y0 + L.size) continue;
    const tg = t.cv.getContext('2d');
    tg.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu); scar(tg, s); tg.setTransform(1, 0, 0, 1, 0, 0);
  }
};
IC.crater = function (S, x, y, r) { IC.addScar(S, { kind: 'crater', x, y, r }); };

/* draw the terrain for the current camera: base, then detail tiles where the zoom calls for them */
IC.drawTerrain = function (ctx, T, cam, dpr, budgetMs) {
  const zx = cam.z * dpr;
  ctx.drawImage(T.base, 0, 0, IC.WW, IC.WH);
  if (!T.base || zx < 0.42) return 0;
  const lodWanted = zx >= 4 ? 3 : zx >= 1.3 ? 2 : 1;
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cam.vw / cam.z, vy1 = cam.y + cam.vh / cam.z;
  T.frame++;
  const t0 = performance.now();
  let made = 0;
  const draw = (lod, only) => {
    const L = LODS[lod - 1];
    const cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2;
    const list = [];
    for (let ty = Math.floor(vy0 / L.size); ty <= Math.floor(vy1 / L.size); ty++) for (let tx = Math.floor(vx0 / L.size); tx <= Math.floor(vx1 / L.size); tx++) {
      if (tx < 0 || ty < 0 || tx * L.size >= IC.WW || ty * L.size >= IC.WH) continue;
      list.push([tx, ty, U.dxy((tx + 0.5) * L.size, (ty + 0.5) * L.size, cx, cy)]);
    }
    list.sort((a, b) => a[2] - b[2]);
    let missing = 0;
    for (const [tx, ty] of list) {
      const key = lod + ':' + tx + ':' + ty;
      let t = T.tiles.get(key);
      if (!t && !only && performance.now() - t0 < budgetMs) { t = { cv: paintTile(T, lod, tx, ty), lod, tx, ty, used: 0 }; T.tiles.set(key, t); made++; }
      if (!t) { missing++; continue; }
      t.used = T.frame;
      ctx.drawImage(t.cv, tx * L.size, ty * L.size, L.size, L.size);
    }
    // evict the least recently used
    const mine = [...T.tiles.entries()].filter(([, t]) => t.lod === lod);
    if (mine.length > L.max) { mine.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < mine.length - L.max; i++) T.tiles.delete(mine[i][0]); }
    return missing;
  };
  if (lodWanted === 3) { draw(2, true); draw(3, false); }
  else if (lodWanted === 2) { draw(1, true); draw(2, false); }
  else draw(1, false);
  return made;
};

/* night lights for a city, redrawn when blocks are destroyed */
IC.cityLights = function (c) {
  if (typeof document === 'undefined' || !c.blocks) return;
  const LS = 0.5, size = c.r * 4, px = Math.ceil(size * LS);
  const lc = c.light && c.light.cv.width === px ? c.light.cv : mk(px, px);
  const lg = lc.getContext('2d');
  lg.clearRect(0, 0, px, px);
  const alive = c.blocks.filter(b => b.hp > 0).length / Math.max(1, c.blocks.length);
  const glow = lg.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  glow.addColorStop(0, `rgba(255,170,90,${0.35 * alive})`); glow.addColorStop(0.45, `rgba(255,150,70,${0.12 * alive})`); glow.addColorStop(1, 'rgba(255,150,70,0)');
  lg.fillStyle = glow; lg.fillRect(0, 0, px, px);
  for (const b of c.blocks) {
    if (b.hp <= 0) continue;
    const lx = (b.x - c.x + size / 2) * LS, ly = (b.y - c.y + size / 2) * LS;
    lg.fillStyle = (b.seed % 10) < 2 ? 'rgba(200,225,255,0.9)' : 'rgba(255,210,140,0.9)';
    lg.fillRect(lx, ly, b.core ? 1.8 : 1.2, b.core ? 1.8 : 1.2);
  }
  c.light = { cv: lc, size };
};

function grain() {
  const N = 128, cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) { const v = 128 + (U.hash(i, 17) - 0.5) * 90 + (U.hash(i >> 2, 5) - 0.5) * 40; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return cv;
}

/* tileable cloud texture */
IC.buildClouds = function () {
  const N = 256, out = {};
  for (const [name, col, lo, span] of [['white', [236, 240, 244], 0.42, 0.3], ['dark', [8, 12, 18], 0.45, 0.2], ['heavy', [120, 128, 138], 0.3, 0.4]]) {
    const cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = U.pfbm(x / 32 + (name === 'heavy' ? 3.7 : 0), y / 32, 8);
      const a = U.clamp((v - lo) / span, 0, 1), i = (y * N + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a * a * (3 - 2 * a) * 255;
    }
    g.putImageData(img, 0, 0);
    out[name] = cv;
  }
  return out;
};

})(window.IC);
