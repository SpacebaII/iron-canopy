/* Iron Canopy — map imagery. A low-resolution base covers the whole region; as the camera zooms in,
   detail tiles are painted on demand (fields, forest canopy, buildings, rail, road markings) and damage
   (craters, scorch, rubble) is stamped into every layer that shows it. */
(function (IC) {
'use strict';
const U = IC.U;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/* bare ground by height: lowland meadow, drier grass up the slopes, heath and rock, pale rock on the tops */
function ramp(h) {
  if (h < 0.3) return mix([82, 104, 64], [92, 110, 68], Math.max(0, h) / 0.3);
  if (h < 0.55) return mix([92, 110, 68], [112, 114, 78], (h - 0.3) / 0.25);
  if (h < 0.8) return mix([112, 114, 78], [128, 120, 96], (h - 0.55) / 0.25);
  return mix([128, 120, 96], [184, 180, 172], Math.min(1, (h - 0.8) / 0.3));
}
/* crops and grass, with how common each is: cereal, young crop, ripe wheat, ploughed, pasture, hay, rapeseed, maize, stubble */
const FIELDS = [[106, 124, 72], [120, 134, 80], [158, 148, 98], [122, 108, 80], [98, 118, 72], [138, 138, 94], [170, 164, 90], [90, 110, 64], [148, 140, 106]];
const FIELD_W = [3, 2, 2.5, 2, 3, 1.5, 0.35, 1.2, 1.4];
const FIELD_CUM = FIELD_W.map((w, i) => FIELD_W.slice(0, i + 1).reduce((s, v) => s + v, 0) / FIELD_W.reduce((s, v) => s + v, 0));
const crop = h => { for (let i = 0; i < FIELD_CUM.length; i++) if (h < FIELD_CUM[i]) return i; return 0; };
// small tiles, so painting one never stalls a frame for long. Level 0 covers the regional zoom between the base
// image (too coarse there on a map this size) and level 1: the base's picture with roads and towns drawn sharp
const LOD0 = { k: 0, ppu: 0.2, size: 1600, max: 130 };
const LODS = [
  { k: 1, ppu: 0.8, size: 240, max: 200 },
  { k: 2, ppu: 2.4, size: 100, max: 130 },
  { k: 3, ppu: 8, size: 32, max: 200 },
  { k: 4, ppu: 32, size: 8, max: 160 }
];
IC.LODS = LODS;
const LOD = lod => lod ? LODS[lod - 1] : LOD0;
// lines on the base image are drawn this much wider than on level 0 tiles, as it has fewer pixels to a km
const BASE_WK = 0.2 / IC.TS;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const LIGHT = [-0.55, -0.62, 0.56];   // sun from the north-west, fairly high

/* farm blocks: a jittered grid of plots between hedges and tracks (neighbours share corners), each cut into fields
   lying the way the land and the nearest road run (W.fieldAng) */
const FB = 16;
const fbCorner = (i, j) => [i * FB + (U.hash(i * 3 + 1, j * 5 + 7) - 0.5) * FB * 0.32, j * FB + (U.hash(j * 7 + 2, i * 11 + 5) - 0.5) * FB * 0.32];

IC.buildTerrain = function (W) {
  const TS = IC.TS, CW = Math.round(IC.WW * TS), CH = Math.round(IC.WH * TS);
  const BW = 1500, BH = Math.round(BW * IC.WH / IC.WW), cellX = IC.WW / BW, cellY = IC.WH / BH;
  // forest density on a 20-unit grid, shared by the detail tiles (which add a finer noise); worked out a chunk at a
  // time where the tiles first need it, as the whole map would take seconds and hundreds of megabytes
  const FC = 64, FU = FC * 20, FGW = Math.ceil(IC.WW / FU), FGH = Math.ceil(IC.WH / FU), FDc = new Map();
  const chunk = (ci, cj) => {
    const key = cj * FGW + ci; let c = FDc.get(key);
    if (!c) { c = new Float32Array((FC + 1) * (FC + 1)); for (let j = 0; j <= FC; j++) for (let i = 0; i <= FC; i++) c[j * (FC + 1) + i] = W.forestD(ci * FU + i * 20, cj * FU + j * 20); FDc.set(key, c); }
    return c;
  };
  const fdAt = (x, y) => {
    const fx = U.clamp(x / 20, 0, IC.WW / 20 - 0.001), fy = U.clamp(y / 20, 0, IC.WH / 20 - 0.001), ci = Math.floor(fx / FC), cj = Math.floor(fy / FC);
    const c = chunk(ci, cj), lx = fx - ci * FC, ly = fy - cj * FC, i = lx | 0, j = ly | 0, u = lx - i, v = ly - j, k = j * (FC + 1) + i;
    return c[k] * (1 - u) * (1 - v) + c[k + 1] * u * (1 - v) + c[k + FC + 1] * (1 - u) * v + c[k + FC + 2] * u * v;
  };
  const fd = (x, y) => fdAt(x, y) + 0.09 * (U.vnoise(x / 2.3 + 71, y / 2.3) - 0.5) + 0.05 * (U.vnoise(x / 0.7, y / 0.7 + 13) - 0.5);
  const T = { W, fd, fdc: fdAt, forest: (x, y) => fd(x, y) > IC.FOREST_T, tiles: new Map(), frame: 0 };
  // the same region again (the start screen's, now played): its images are the same, only the base is copied, as
  // the game draws airfields and marks on it
  const K = lastBuilt;
  if (K && K.seed === W.seed && K.CW === CW) {
    Object.assign(T, { ground: K.ground, shadeD: K.shadeD, shadeL: K.shadeL, far: K.far, grain: K.grain });
    const cv = mk(CW, CH); cv.getContext('2d').drawImage(K.base0, 0, 0); T.base = cv;
    for (const c of W.cities) IC.cityLights(c);
    return T;
  }

  // three images: the ground's colour (tiles start from it), its hillshade, and the two combined for the far view
  const alb = mk(BW, BH), ag = alb.getContext('2d'), ai = ag.createImageData(BW, BH), ad = ai.data;
  const sd = new Uint8ClampedArray(BW * BH * 4);
  const tmp = mk(BW, BH), tg = tmp.getContext('2d'), img = tg.createImageData(BW, BH), d = img.data;
  const hs = (x, y, e, k) => {
    const hx = (W.hAt(x + e, y) - W.hAt(x - e, y)) * k / (2 * e), hy = (W.hAt(x, y + e) - W.hAt(x, y - e)) * k / (2 * e);
    return (LIGHT[0] * -hx + LIGHT[1] * -hy + LIGHT[2]) / Math.sqrt(hx * hx + hy * hy + 1) - LIGHT[2];
  };
  // which country a pixel is in (outside our border) and how wooded it is, worked out on 2 × 2 pixel blocks: the
  // neighbours' jagged borders and the forest's noise take a while to ask about, and a pixel is 4 km here
  const KB = new Array(Math.ceil(BW / 2) * Math.ceil(BH / 2)), KW = Math.ceil(BW / 2);
  const FB2 = new Float32Array(KB.length).fill(NaN);
  const forestOf = (x, y) => { const q = (y >> 1) * KW + (x >> 1); let v = FB2[q]; if (v !== v) v = FB2[q] = W.forestD(((x & ~1) + 1) * cellX, ((y & ~1) + 1) * cellY); return v; };
  const countryOf = (x, y, wx, wy) => { if (W.inHome(wx, wy)) return 'H'; const q = (y >> 1) * KW + (x >> 1); return KB[q] || (KB[q] = W.countryAt(((x & ~1) + 1) * cellX, ((y & ~1) + 1) * cellY)); };
  for (let y = 0; y < BH; y++) {
    const wy = (y + 0.5) * cellY;
    for (let x = 0; x < BW; x++) {
      const wx = (x + 0.5) * cellX;
      const h = W.hAt(wx, wy);
      // soft light from the fine slope, and a broader one so ridges still read on the whole-country map
      // hill country gets folds and gullies of its own, too small for the height grid (shading only)
      const hill = U.clamp((h - 0.3) / 0.35, 0, 1);
      const fx = hill ? (U.fbm((wx + 8) / 150 + 3, wy / 150, 3) - U.fbm((wx - 8) / 150 + 3, wy / 150, 3)) / 16 : 0, fy = hill ? (U.fbm(wx / 150 + 3, (wy + 8) / 150, 3) - U.fbm(wx / 150 + 3, (wy - 8) / 150, 3)) / 16 : 0;
      const shade = U.clamp(1 + hs(wx, wy, 40, 110) * 1.3 + hs(wx, wy, 200, 220) * 0.6 - (LIGHT[0] * fx + LIGHT[1] * fy) * 90 * hill, 0.45, 1.5);
      let k = countryOf(x, y, wx, wy); if (k === 'H' && !W.inHome(wx, wy)) k = W.countryAt(wx, wy);
      let c = ramp(h + (U.vnoise(wx / 90, wy / 90) - 0.5) * 0.08);
      const hsh = U.hash(x, y);
      // damp ground along the rivers is greener
      const rd = W.riverDist(wx, wy); if (rd < 40) c = mix(c, [70, 98, 60], 0.35 * (1 - rd / 40));
      const fw = W.farmAt(wx, wy) * 0.8;
      if (fw > 0.02) {
        const i = Math.floor(wx / FB), j = Math.floor(wy / FB);
        c = mix(c, FIELDS[crop(U.hash(i * 31 + 7, j * 17 + 3))], fw * (0.55 + 0.45 * U.hash(i + 5, j * 3)));
      }
      const fo = forestOf(x, y) - IC.FOREST_T;
      if (fo > -0.03) c = mix(c, U.vnoise(wx / 7, wy / 7) > 0.5 ? [40, 62, 40] : [50, 74, 46], U.clamp((fo + 0.03) / 0.05, 0, 1) * 0.9);
      let r = c[0], g = c[1], b = c[2];
      if (k !== 'H') {
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        r = (r + (lum - r) * 0.5) * 0.74; g = (g + (lum - g) * 0.5) * 0.74; b = (b + (lum - b) * 0.5) * 0.74;
        if (W.side[k] === 'hostile') { r *= 1.12; g *= 0.92; b *= 0.9; }
      }
      const n = (hsh - 0.5) * 5, i4 = (y * BW + x) * 4;
      ad[i4] = r + n; ad[i4 + 1] = g + n; ad[i4 + 2] = b + n; ad[i4 + 3] = 255;
      // the hillshade for the tiles: shadow (multiplied: white leaves the colour alone) and light (screened: black
      // leaves it alone), so dark forest shows the hills as well as pale fields do
      sd[i4] = U.clamp(shade, 0, 1) * 255; sd[i4 + 1] = U.clamp((shade - 1) * 0.7, 0, 1) * 255; sd[i4 + 2] = 0; sd[i4 + 3] = 255;
      d[i4] = (r + n) * shade; d[i4 + 1] = (g + n) * shade; d[i4 + 2] = (b + n) * shade; d[i4 + 3] = 255;
    }
  }
  ag.putImageData(ai, 0, 0); tg.putImageData(img, 0, 0);
  // split the two channels of the hillshade into grey images
  const split = ch => { const c = mk(BW, BH), cg = c.getContext('2d'), im = cg.createImageData(BW, BH), o = im.data; for (let q = 0; q < o.length; q += 4) { o[q] = o[q + 1] = o[q + 2] = sd[q + ch]; o[q + 3] = 255; } cg.putImageData(im, 0, 0); return c; };
  const shadeD = split(0), shadeL = split(1);
  // our border and the map grid go on the far view only
  tg.save(); tg.scale(BW / IC.WW, BH / IC.WH); tg.lineCap = 'round'; tg.lineJoin = 'round';
  const outline = () => { tg.beginPath(); W.poly.forEach(([x, y], i) => i ? tg.lineTo(x, y) : tg.moveTo(x, y)); tg.closePath(); };
  for (const [w, a] of [[70, 0.04], [34, 0.07], [12, 0.16]]) { tg.strokeStyle = `rgba(140,215,255,${a})`; tg.lineWidth = w; outline(); tg.stroke(); }
  tg.strokeStyle = 'rgba(210,215,220,0.2)'; tg.lineWidth = 7; tg.setLineDash([27, 36]);
  W.secs.forEach((s, i) => {
    tg.beginPath(); let first = true;
    for (let dd = 0; dd < IC.WW; dd += 60) {
      const a0 = s.a0 + W.jag(i, W.radialB(s.a0) + dd, dd), D = W.radialB(s.a0) + dd;
      const x = W.cx + Math.cos(a0) * D, y = W.cy + Math.sin(a0) * D;
      if (x < -80 || y < -80 || x > IC.WW + 80 || y > IC.WH + 80) break;
      if (first) { tg.moveTo(x, y); first = false; } else tg.lineTo(x, y);
    }
    tg.stroke();
  });
  tg.setLineDash([]);
  // the map squares of IC.gridRef
  tg.strokeStyle = 'rgba(200,225,235,0.035)'; tg.lineWidth = 12;
  const GR = IC.WW / 26;
  for (let x = GR; x < IC.WW; x += GR) { tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x, IC.WH); tg.stroke(); }
  for (let y = GR; y < IC.WH; y += GR) { tg.beginPath(); tg.moveTo(0, y); tg.lineTo(IC.WW, y); tg.stroke(); }
  tg.restore();
  T.ground = alb; T.shadeD = shadeD; T.shadeL = shadeL; T.far = tmp;
  const cv = mk(CW, CH), g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, CW, CH);
  g.save(); g.scale(TS, TS); g.lineCap = 'round'; g.lineJoin = 'round';
  vectors(g, W, 0, 0, IC.WW, IC.WH, 0, 0, BASE_WK);
  g.restore();
  T.base = cv;
  T.grain = grain();
  const base0 = mk(CW, CH); base0.getContext('2d').drawImage(cv, 0, 0);
  lastBuilt = { seed: W.seed, CW, ground: alb, shadeD, shadeL, far: tmp, grain: T.grain, base0 };
  for (const c of W.cities) IC.cityLights(c);
  return T;
};
let lastBuilt = null;

/* redraw a box of the far view (world changed, a mark went) */
function repaintBase(T, S, x0, y0, x1, y1) {
  const g = T.base.getContext('2d'), TS = IC.TS, fs = T.far.width / IC.WW;
  x0 = Math.max(0, Math.floor(x0 - 2)); y0 = Math.max(0, Math.floor(y0 - 2)); x1 = Math.min(IC.WW, Math.ceil(x1 + 2)); y1 = Math.min(IC.WH, Math.ceil(y1 + 2));
  if (x1 <= x0 || y1 <= y0) return;
  g.save(); g.beginPath(); g.rect(x0 * TS, y0 * TS, (x1 - x0) * TS, (y1 - y0) * TS); g.clip();
  g.drawImage(T.far, x0 * fs, y0 * fs, (x1 - x0) * fs, (y1 - y0) * fs, x0 * TS, y0 * TS, (x1 - x0) * TS, (y1 - y0) * TS);
  g.scale(TS, TS); g.lineCap = 'round'; g.lineJoin = 'round';
  if (S) airfields(g, S, x0, y0, x1, y1, 0);
  vectors(g, T.W, x0 - 60, y0 - 60, x1 + 60, y1 + 60, 0, 0, BASE_WK);
  g.restore();
}
/* tiles over a box are painted again when the frame budget allows; until then the old one shows */
function dirtyBox(T, x0, y0, x1, y1) {
  for (const t of T.tiles.values()) {
    const L = LOD(t.lod), tx0 = t.tx * L.size, ty0 = t.ty * L.size;
    if (x1 < tx0 || x0 > tx0 + L.size || y1 < ty0 || y0 > ty0 + L.size) continue;
    t.dirty = true;
  }
}

/* the ground of an airfield: rough grass inside the perimeter instead of crops, mown grass along everything paved */
function airfields(g, S, x0, y0, x1, y1, lod) {
  for (const ap of IC.bases(S)) {
    if (!ap.parts || ap.x + ap.radius < x0 || ap.x - ap.radius > x1 || ap.y + ap.radius < y0 || ap.y - ap.radius > y1) continue;
    const paved = ap.parts.filter(p => p.built !== false && (p.kind === 'runway' || p.kind === 'taxi' || (p.w && p.h)));
    // a runway or taxiway is a line of its width; an apron or building a rotated rectangle
    const shape = p => {
      g.beginPath();
      if (p.kind === 'runway') { const a = IC.rwAt(p, 0), b = IC.rwAt(p, 1); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); return p.w; }
      if (p.kind === 'taxi') { p.nodes.forEach((id, i) => { const n = ap.nodes[id]; if (n) i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y); }); return 0.25; }
      const c = Math.cos(p.a || 0), s = Math.sin(p.a || 0), w = (p.w || 1) / 2, h = (p.h || 1) / 2;
      [[-w, -h], [w, -h], [w, h], [-w, h]].forEach(([u, v], i) => g[i ? 'lineTo' : 'moveTo'](p.x + u * c - v * s, p.y + u * s + v * c));
      g.closePath(); return 0;
    };
    const layer = (grow, col) => { g.strokeStyle = g.fillStyle = col; for (const p of paved) { const w = shape(p); g.lineWidth = w + grow; g.stroke(); if (!w && p.kind !== 'taxi') g.fill(); } };
    g.lineCap = 'round'; g.lineJoin = 'round';
    // cleared ground reaches some 800 m out from the paving: meadow, not crops
    layer(16, 'rgba(98,116,72,0.5)'); layer(10, 'rgba(102,120,74,0.85)');
    // mown: the runway strip 150 m either side, 40 m along taxiways and round aprons
    g.strokeStyle = g.fillStyle = 'rgba(120,140,86,0.9)';
    for (const p of paved) { const w = shape(p); g.lineWidth = w + (p.kind === 'runway' ? 3 : 0.8); g.stroke(); if (!w && p.kind !== 'taxi') g.fill(); }
    if (lod >= 3) {
      // mowing lines along the runway strip
      g.strokeStyle = 'rgba(146,166,102,0.35)'; g.lineWidth = 0.18;
      for (const p of paved) if (p.kind === 'runway') for (const off of [-1.2, -0.8, 0.8, 1.2]) {
        const a = IC.rwAt(p, 0), b = IC.rwAt(p, 1), L = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, o = off + Math.sign(off) * p.w / 2;
        g.beginPath(); g.moveTo(a.x + nx * o, a.y + ny * o); g.lineTo(b.x + nx * o, b.y + ny * o); g.stroke();
      }
    }
  }
}
IC.aptSig = S => IC.bases(S).map(b => b.parts ? b.parts.filter(p => p.built).length + ':' + b.parts.length : '').join('|');

/* fields: each farm block cut into strips and plots of different crops, margins between them, hedges round the block */
function fields(g, T, lod, x0, y0, x1, y1) {
  const W = T.W, i0 = Math.floor(x0 / FB) - 1, i1 = Math.ceil(x1 / FB), j0 = Math.floor(y0 / FB) - 1, j1 = Math.ceil(y1 / FB);
  const byCol = FIELDS.map(() => []), furrows = [], hedges = [], tracks = [], htrees = [];
  const inset = [0.35, 0.12, 0.06, 0.05][lod - 1];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c00 = fbCorner(i, j), c10 = fbCorner(i + 1, j), c11 = fbCorner(i + 1, j + 1), c01 = fbCorner(i, j + 1);
    const cx = (c00[0] + c10[0] + c11[0] + c01[0]) / 4, cy = (c00[1] + c10[1] + c11[1] + c01[1]) / 4;
    const fw = W.farmAt(cx, cy);
    if (fw < 0.12) continue;
    const hb = U.hash(i * 13 + 5, j * 29 + 1);
    const th = W.fieldAng(cx, cy) + (hb - 0.5) * 0.14, ca = Math.cos(th), sa = Math.sin(th);
    const sw = 2.2 + U.hash(i, j + 77) * 2.6, R = FB * 0.9;
    const list = [];
    for (let u = -R + (hb * sw) % sw; u < R; u += sw) {
      const sl = lod === 1 ? 3.5 + U.hash(Math.round(u * 10) + i, j) * 14 : 3.5 + U.hash(Math.round(u * 10) + i, j) * 6, vo = U.hash(i + 3, Math.round(u * 10) + j) * sl;
      for (let v = -R - vo; v < R; v += sl) {
        const mx = cx + (u + sw / 2) * ca - (v + sl / 2) * sa, my = cy + (u + sw / 2) * sa + (v + sl / 2) * ca;
        const hf = U.hash(Math.round(mx * 7), Math.round(my * 7));
        const w = W.farmAt(mx, my);
        if (w < 0.1 || hf > w * 2.4 + 0.3 || (lod > 1 ? T.fd(mx, my) > IC.FOREST_T - 0.02 || W.riverDist(mx, my) < 4 : T.fdc(mx, my) > IC.FOREST_T + 0.04)) continue;
        list.push([u + inset, v + inset, sw - 2 * inset, sl - 2 * inset, crop(hf), hf]);
      }
    }
    if (list.length < 3) continue;
    const quad = () => { g.beginPath(); g.moveTo(c00[0], c00[1]); g.lineTo(c10[0], c10[1]); g.lineTo(c11[0], c11[1]); g.lineTo(c01[0], c01[1]); g.closePath(); };
    const rect = (path, u, v, w, h) => {
      const ax = cx + u * ca - v * sa, ay = cy + u * sa + v * ca;
      path.push(ax, ay, ax + w * ca, ay + w * sa, ax + w * ca - h * sa, ay + w * sa + h * ca, ax - h * sa, ay + h * ca);
    };
    if (lod >= 2) {
      // each block is clipped to its own outline so plots end at the hedge
      g.save(); quad(); g.clip();
      const cols = FIELDS.map(() => []);
      for (const f of list) rect(cols[f[4]], f[0], f[1], f[2], f[3]);
      cols.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(FIELDS[k], 0.9)); });
      if (lod >= 3) for (const f of list) if (f[4] === 0 || f[4] === 2 || f[4] === 3 || f[4] === 7) for (let q = 0.18; q < f[2]; q += 0.24) { const u = f[0] + q; furrows.push(cx + u * ca - f[1] * sa, cy + u * sa + f[1] * ca, cx + u * ca - (f[1] + f[3]) * sa, cy + u * sa + (f[1] + f[3]) * ca); }
      g.restore();
    } else for (const f of list) rect(byCol[f[4]], f[0], f[1], f[2], f[3]);
    // hedges on most block edges, a farm track on some
    const edges = [[c00, c10, i * 7 + 1, j], [c10, c11, i + 1, j * 5 + 3], [c11, c01, i * 7 + 1, j + 1], [c01, c00, i, j * 5 + 3]];
    for (const [p, q, a, b] of edges) {
      const e = U.hash(a * 3 + 11, b * 5 + 17);
      (e < 0.22 ? tracks : e < 0.9 ? hedges : []).push(p[0], p[1], q[0], q[1]);
      if (lod >= 3 && e >= 0.22 && e < 0.9) for (let t = 0.05; t < 1; t += 0.07 + U.hash(a + Math.round(t * 99), b) * 0.08) if (U.hash(a * 5 + Math.round(t * 100), b * 3) < 0.55) htrees.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
    }
  }
  if (lod === 1) byCol.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(FIELDS[k], 0.6)); });
  if (lod >= 2) {
    lines(g, tracks, 'rgba(176,160,122,0.7)', lod >= 3 ? 0.07 : 0.14);
    lines(g, hedges, 'rgba(46,64,36,0.75)', lod >= 3 ? 0.1 : 0.16);
    lines(g, furrows, 'rgba(60,50,30,0.14)', 0.04);
    if (htrees.length) trees(g, htrees, lod >= 4 ? 0.09 : 0.11, 0.05);
  }
}
const colour = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/* quads, filled in batches: one huge path is far slower to fill than several small ones */
function polyFill(g, pl, col) {
  g.fillStyle = col;
  for (let k0 = 0; k0 < pl.length; k0 += 8 * 64) {
    g.beginPath();
    for (let k = k0; k < Math.min(pl.length, k0 + 8 * 64); k += 8) { g.moveTo(pl[k], pl[k + 1]); g.lineTo(pl[k + 2], pl[k + 3]); g.lineTo(pl[k + 4], pl[k + 5]); g.lineTo(pl[k + 6], pl[k + 7]); g.closePath(); }
    g.fill();
  }
}
function lines(g, L, col, w) {
  g.strokeStyle = col; g.lineWidth = w;
  for (let k0 = 0; k0 < L.length; k0 += 1024) { g.beginPath(); for (let k = k0; k < Math.min(L.length, k0 + 1024); k += 4) { g.moveTo(L[k], L[k + 1]); g.lineTo(L[k + 2], L[k + 3]); } g.stroke(); }
}
/* lone trees: a shadow to the south-east, the crown, a lit side to the north-west */
function trees(g, P, r0, rv, home) {
  const R = []; for (let k = 0; k < P.length; k += 2) R.push(r0 + U.hash(Math.round(P[k] * 50), Math.round(P[k + 1] * 50)) * rv);
  const pass = (dx, dy, k, col) => {
    g.fillStyle = col;
    for (let n0 = 0; n0 < R.length; n0 += 256) { g.beginPath(); for (let n = n0; n < Math.min(R.length, n0 + 256); n++) { const r = R[n] * k, x = P[n * 2] + dx * R[n], y = P[n * 2 + 1] + dy * R[n]; g.moveTo(x + r, y); g.arc(x, y, r, 0, 7); } g.fill(); }
  };
  pass(0.55, 0.45, 1, 'rgba(12,20,10,0.45)');
  pass(0, 0, 1, home === false ? 'rgb(62,70,56)' : 'rgb(46,72,42)');
  pass(-0.3, -0.3, 0.5, 'rgba(140,170,96,0.3)');
}

/* forest: a canopy of crowns in light and shadow; at the edge the canopy breaks up into single trees */
function forest(g, T, lod, x0, y0, x1, y1) {
  const W = T.W, cs = [2.8, 1.1, 0.42, 0.3][lod - 1], rr = [[1.9, 2.6], [0.7, 1.05], [0.2, 0.32], [0.14, 0.24]][lod - 1];
  const nx = Math.ceil((x1 - x0) / cs) + 2, ny = Math.ceil((y1 - y0) / cs) + 2, gx0 = Math.floor(x0 / cs) - 1, gy0 = Math.floor(y0 / cs) - 1;
  const inF = new Uint8Array(nx * ny);
  let any = false;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (gx0 + i + 0.5) * cs, y = (gy0 + j + 0.5) * cs; if (T.fd(x, y) > IC.FOREST_T) { inF[j * nx + i] = 1; any = true; } }
  if (!any) return;
  const home = [], away = [], cols = [[], [], [], []];
  const floor = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, gi = gx0 + i, gj = gy0 + j;
    const edge = i > 0 && j > 0 && i < nx - 1 && j < ny - 1 ? !inF[k - 1] || !inF[k + 1] || !inF[k - nx] || !inF[k + nx] : false;
    const h = U.hash(gi * 7 + 3, gj * 13 + 1), h2 = U.hash(gj * 5 + 9, gi * 3 + 2);
    if (!inF[k]) {
      // a few trees stand out beyond the edge
      const near = i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && (inF[k - 1] || inF[k + 1] || inF[k - nx] || inF[k + nx]);
      if (!near || h > 0.3) continue;
    } else if (edge && h < 0.35) continue;
    const x = (gi + 0.2 + h * 0.6) * cs, y = (gj + 0.2 + h2 * 0.6) * cs;
    if (inF[k] && !edge) floor.push(x - cs * 0.5, y - cs * 0.5);
    (W.inHome(x, y) ? home : away).push(x, y);
    cols[Math.floor(U.hash(gi + 101, gj + 57) * 4)].push(x, y);
  }
  // the floor under the canopy is dark, so gaps between crowns read as shade
  g.fillStyle = 'rgba(28,44,28,0.85)';
  for (let k0 = 0; k0 < floor.length; k0 += 512) { g.beginPath(); for (let k = k0; k < Math.min(floor.length, k0 + 512); k += 2) g.rect(floor[k] - cs * 0.15, floor[k + 1] - cs * 0.15, cs * 1.3, cs * 1.3); g.fill(); }
  const R = (x, y) => rr[0] + U.hash(Math.round(x * 31), Math.round(y * 17)) * (rr[1] - rr[0]);
  const pass = (P, dx, dy, k, col) => {
    g.fillStyle = col;
    for (let n0 = 0; n0 < P.length; n0 += 512) {
      g.beginPath();
      for (let n = n0; n < Math.min(P.length, n0 + 512); n += 2) { const r = R(P[n], P[n + 1]), x = P[n] + dx * r, y = P[n + 1] + dy * r; g.moveTo(x + r * k, y); g.arc(x, y, r * k, 0, 7); }
      g.fill();
    }
  };
  const all = home.concat(away);
  pass(all, 0.45, 0.4, 1, 'rgba(8,14,8,0.5)');
  const CROWN = ['rgb(40,64,38)', 'rgb(48,74,42)', 'rgb(36,58,36)', 'rgb(56,80,46)'];
  cols.forEach((P, k) => pass(P, 0, 0, 1, CROWN[k]));
  if (away.length) pass(away, 0, 0, 1.01, 'rgba(70,70,64,0.55)');
  pass(all, -0.28, -0.3, 0.55, 'rgba(120,152,86,0.28)');
}
/* vector layers shared by the base (lod 0) and the detail tiles */
/* wk widens lines drawn far out (lod 0) for a coarser image, so they keep their width on screen */
function vectors(g, W, x0, y0, x1, y1, lod, pad, wk) {
  const K0 = lod ? 1 : wk || 1;
  const inb = (bx0, by0, bx1, by1) => !(bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1);
  // the tile itself, without the margin wide strokes need: blocks and buildings are drawn only where they show
  const p = pad || 0, inT = (bx0, by0, bx1, by1) => !(bx1 < x0 + p || bx0 > x1 - p || by1 < y0 + p || by0 > y1 - p);
  const smooth = (pts) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  // water: rivers at about their real width close in (wider far out so they read), reedy banks, lakes with a shore
  const rk = [1, 0.7, 0.45, 0.3, 0.3][lod];
  for (const r of W.rivers) {
    if (!inb(r.bb[0] - 40, r.bb[1] - 40, r.bb[2] + 40, r.bb[3] + 40)) continue;
    const pts = r.pts.filter((_, i) => i % 2 === 0 || i === r.pts.length - 1), w = r.w * rk * K0;
    if (lod) { g.strokeStyle = 'rgba(52,72,44,0.45)'; g.lineWidth = w + 3; smooth(pts); g.stroke(); }
    g.strokeStyle = 'rgba(92,100,78,0.9)'; g.lineWidth = w + (lod ? 0.6 : 3 * K0); smooth(pts); g.stroke();
    g.strokeStyle = 'rgb(46,78,90)'; g.lineWidth = w; smooth(pts); g.stroke();
    g.strokeStyle = 'rgba(96,136,150,0.4)'; g.lineWidth = w * 0.4; smooth(pts); g.stroke();
  }
  for (const l of W.lakes) {
    if (!inb(l.x - l.rx, l.y - l.rx, l.x + l.rx, l.y + l.rx)) continue;
    g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
    const shore = k => { g.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, n = 1 + 0.05 * Math.sin(a * 5 + l.x) + 0.03 * Math.sin(a * 11 + l.y); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * (l.rx * n - k), Math.sin(a) * (l.ry * n - k)); } g.closePath(); };
    shore(-3); g.fillStyle = 'rgba(52,72,44,0.5)'; g.fill();
    shore(0); g.fillStyle = 'rgb(92,100,78)'; g.fill();
    shore(1.2); g.fillStyle = 'rgb(40,72,86)'; g.fill();
    shore(8); g.fillStyle = 'rgba(30,58,72,0.6)'; g.fill();
    g.restore();
  }
  // rail
  for (const r of W.rails) {
    if (!inb(r.bb[0] - 10, r.bb[1] - 10, r.bb[2] + 10, r.bb[3] + 10)) continue;
    const line = () => { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
    g.strokeStyle = 'rgba(30,28,26,0.55)'; g.lineWidth = [4 * K0, 1.6, 0.7, 0.4, 0.3][lod]; line(); g.stroke();
    if (lod >= 2) { g.strokeStyle = 'rgba(170,160,140,0.55)'; g.lineWidth = 0.4; g.setLineDash([0.3, 0.9]); line(); g.stroke(); g.setLineDash([]); }
  }
  // settlements: the built-up ground (paving in the centre, gardens in the suburbs, yards by the factories), so a
  // town is one piece of fabric following its own ragged shape, then parks and squares
  const towns = W.cities.concat(W.foreign);
  const tIn = t => inb(t.x - t.r * 1.7, t.y - t.r * 1.7, t.x + t.r * 1.7, t.y + t.r * 1.7);
  for (const c of towns) {
    if (!tIn(c)) continue;
    const Q = { old: [], biz: [], dense: [], sub: [], ind: [], log: [], rail: [] };
    const e0 = lod ? 0.5 : 1.4 * K0;
    for (const b of c.blocks) {
      if (!inT(b.x - 5, b.y - 5, b.x + 5, b.y + 5)) continue;
      const e = distOf(b) === 'sub' ? e0 * 0.6 : e0, ca = Math.cos(b.a), sa = Math.sin(b.a), w = b.w / 2 + e, h = b.h / 2 + e;
      Q[distOf(b)].push(b.x - w * ca + h * sa, b.y - w * sa - h * ca, b.x + w * ca + h * sa, b.y + w * sa - h * ca, b.x + w * ca - h * sa, b.y + w * sa + h * ca, b.x - w * ca - h * sa, b.y - w * sa + h * ca);
    }
    const a = lod ? 1 : 0.55;
    polyFill(g, Q.sub, `rgba(112,122,92,${0.6 * a})`); polyFill(g, Q.dense, `rgba(110,114,100,${a})`); polyFill(g, Q.ind.concat(Q.log, Q.rail), `rgba(122,122,116,${a})`); polyFill(g, Q.old.concat(Q.biz), `rgba(124,122,114,${a})`);
    for (const p of c.parks || []) {
      g.fillStyle = 'rgba(62,94,60,0.85)'; g.beginPath();
      // (a park of whole blocks is a rectangle, with paths across it)
      if (p.rect) { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.rect(-p.rx, -p.ry, p.rx * 2, p.ry * 2); g.fill(); if (lod >= 2) { g.strokeStyle = 'rgba(190,180,150,0.5)'; g.lineWidth = 0.08; g.beginPath(); g.moveTo(-p.rx, -p.ry * 0.3); g.bezierCurveTo(-p.rx * 0.2, 0, p.rx * 0.2, -p.ry * 0.5, p.rx, p.ry * 0.2); g.moveTo(-p.rx * 0.5, -p.ry); g.bezierCurveTo(0, -p.ry * 0.2, -p.rx * 0.4, p.ry * 0.4, p.rx * 0.3, p.ry); g.stroke(); } g.restore(); }
      else { g.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, 7); g.fill(); }
      if (lod >= 3) trees(g, [p.x + p.rx * 0.5, p.y, p.x - p.rx * 0.4, p.y + p.ry * 0.3, p.x, p.y - p.ry * 0.5, p.x + p.rx * 0.1, p.y + p.ry * 0.6], 0.25, 0.1); }
    if (lod >= 2) for (const q of c.squares || []) {
      g.save(); g.translate(q.x, q.y); g.rotate(q.a);
      g.fillStyle = 'rgb(168,158,140)';
      if (q.round) { g.beginPath(); g.arc(0, 0, q.w / 2, 0, 7); g.fill(); if (lod >= 3) { g.fillStyle = 'rgba(62,94,60,0.8)'; g.beginPath(); g.arc(0, 0, q.w * 0.22, 0, 7); g.fill(); } g.restore(); continue; }
      g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      if (lod >= 3) { g.strokeStyle = 'rgba(120,110,96,0.6)'; g.lineWidth = 0.02; g.strokeRect(-q.w * 0.3, -q.h * 0.3, q.w * 0.6, q.h * 0.6); g.fillStyle = 'rgb(120,120,126)'; g.beginPath(); g.arc(0, 0, 0.06, 0, 7); g.fill(); }
      g.restore();
    }
  }
  // roads: lod 0 and 1 bake them all in at a readable width; closer in, city streets and lanes are baked (at
  // about real width) and render.js draws the road network live
  {
    const RW = [{ hw: 11, rd: 6.5, lc: 3.4, sp: 3 }, { hw: 3.6, rd: 2.2, lc: 1.3, sp: 1.1, ln: 0.6, art: 0.9, st: 0.5, ring: 2.4, ramp: 1 },
      { ln: 0.3, art: 0.7, st: 0.5, ring: 0.9 }, { ln: 0.12, art: 0.4, st: 0.34, ring: 0.36 }, { ln: 0.07, art: 0.4, st: 0.34, ring: 0.36 }][lod];
    const FILL = { ramp: 'rgba(230,184,124,0.85)', hw: 'rgba(238,176,104,0.92)', rd: 'rgba(222,204,156,0.75)', lc: 'rgba(196,184,150,0.5)', sp: 'rgba(196,184,150,0.5)', ln: 'rgba(160,140,100,0.55)', art: 'rgba(178,174,164,0.75)', st: 'rgba(148,146,140,0.6)', ring: 'rgba(232,190,130,0.85)' };
    if (lod >= 2) { FILL.art = 'rgb(150,148,142)'; FILL.st = 'rgb(128,127,122)'; FILL.ring = 'rgb(128,127,122)'; FILL.ln = 'rgba(140,122,90,0.8)'; }
    // close in, city streets are asphalt between pavements
    if (lod >= 3) { FILL.art = 'rgb(70,71,72)'; FILL.st = 'rgb(84,85,86)'; FILL.ring = 'rgb(66,67,68)'; }
    const layers = [];
    // (the national roads through a city are its avenues: far out drawn as the roads they are, close in as avenues)
    const aves = lod >= 2 ? W.edges.filter(e => e.city) : [];
    if (lod) { layers.push(['ln', W.lanes]); for (const c of towns) if (c.streets && tIn(c)) for (const cls of ['st', 'art', 'ring']) layers.push([cls, c.streets.filter(l => l.cls === cls)]); layers.push(['art', aves.filter(e => e.ccls !== 'ring')], ['ring', aves.filter(e => e.ccls === 'ring')]); }
    if (lod < 2) { for (const cls of ['sp', 'lc', 'rd']) layers.push([cls, W.edges.filter(e => e.cls === cls)]); if (lod) layers.push(['ramp', W.ramps]); layers.push(['hw', W.edges.filter(e => e.cls === 'hw')]); }
    for (const pass of [0, 1]) for (const [cls, list] of layers) {
      const w = RW[cls] * K0; if (!w) continue;
      g.beginPath();
      for (const l of list) { if (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3])) continue; l.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); }
      // close in, streets have pavements either side; far out, roads a dark edge
      const pave = lod >= 3 && (cls === 'st' || cls === 'art' || cls === 'ring');
      if (pass === 0) { g.strokeStyle = pave ? 'rgb(152,150,142)' : cls === 'ln' ? 'rgba(40,34,24,0.2)' : 'rgba(20,18,14,0.45)'; g.lineWidth = w + (pave ? 0.1 : [3 * K0, 1.2, 0.3, 0.1, 0.06][lod]); }
      else { g.strokeStyle = FILL[cls]; g.lineWidth = w; }
      g.stroke();
    }
    if (lod >= 4) for (const c of towns) {
      if (!c.streets || !tIn(c)) continue;
      g.beginPath();
      for (const l of c.streets.concat(aves.filter(e => e.city === c.id))) { if ((l.cls !== 'art' && l.cls !== 'ring' && !l.city) || (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3]))) continue; l.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); }
      g.strokeStyle = 'rgba(236,236,226,0.7)'; g.lineWidth = 0.012; g.setLineDash([0.06, 0.09]); g.stroke(); g.setLineDash([]);
    }
    if (lod >= 3) for (const c of towns) {
      if (!c.streets || !tIn(c)) continue;
      const P = [];
      for (const l of c.streets.concat(aves.filter(e => e.city === c.id))) {
        if ((l.cls !== 'art' && !l.city) || (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3]))) continue;
        for (let i = 1; i < l.pts.length; i++) {
          const a = l.pts[i - 1], b = l.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 0.01) continue;
          const nx = -(b.y - a.y) / L * 0.25, ny = (b.x - a.x) / L * 0.25;
          for (let t = 0.1; t < L; t += 0.16) { const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L; if (inb(x - 1, y - 1, x + 1, y + 1)) P.push(x + nx, y + ny, x - nx, y - ny); }
        }
      }
      if (P.length) trees(g, P, 0.05, 0.03);
    }
  }
  g.strokeStyle = 'rgba(200,186,150,0.22)'; g.lineWidth = lod ? 2 : 6 * K0;
  for (const x of W.crossings) { g.beginPath(); g.moveTo(x.x, x.y); g.lineTo(x.far.x, x.far.y); g.stroke(); }
  g.strokeStyle = 'rgba(170,140,120,0.35)'; g.lineWidth = lod ? 2 : 6 * K0;
  for (const r of W.eroads) { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
  for (const c of towns) if (tIn(c)) for (const b of c.blocks) if (inT(b.x - 5, b.y - 5, b.x + 5, b.y + 5)) block(g, b, lod, c.kind === 'ftown', true);
  for (const v of W.villages) {
    if (!inb(v.x - 90, v.y - 90, v.x + 90, v.y + 90)) continue;
    const foreign = v.kind === 'ftown' || !v.home;
    for (const b of v.blocks) if (inT(b.x - 2, b.y - 2, b.x + 2, b.y + 2)) block(g, b, lod, foreign);
  }
}
const ROOFS = [[178, 110, 86], [164, 98, 78], [196, 190, 176], [140, 136, 128], [120, 118, 116]];
// roofs by district and style: tiles in the old town, shingles and flat roofs further out, glass downtown
const ROOF_OLD = [[176, 104, 80], [160, 92, 70], [186, 124, 92], [150, 100, 84], [196, 178, 150]];
const ROOF_SUB = [[120, 116, 112], [150, 110, 90], [170, 160, 146], [104, 98, 96], [178, 110, 86]];
const FLAT = [[184, 184, 178], [168, 170, 168], [200, 198, 190], [150, 152, 150]];
/* the built-up ground under a block, by district, far out: what a town looks like from 20 km up */
const LOT = { old: 'rgb(132,124,112)', biz: 'rgb(128,130,132)', dense: 'rgb(118,120,108)', sub: 'rgb(110,122,90)', ind: 'rgb(128,126,118)', log: 'rgb(134,134,128)', rail: 'rgb(112,106,96)' };
const FAR = { old: [206, 176, 150], biz: [196, 204, 212], dense: [190, 180, 164], sub: [168, 170, 140], ind: [176, 176, 180], log: [196, 196, 196], rail: [150, 140, 128] };
const distOf = b => b.d || (b.core ? 'biz' : b.ind ? 'ind' : b.sub ? 'sub' : 'dense');
function block(g, b, lod, foreign, town) {
  g.save(); g.translate(b.x, b.y); g.rotate(b.a);
  if (b.hp <= 0) { rubble(g, b, lod); g.restore(); return; }
  const sd = Math.floor(b.seed), d = distOf(b);
  if (!town) {
    // village houses and farmyards
    if (lod < 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-b.w / 2 + (lod ? 0.5 : 1.5), -b.h / 2 + (lod ? 0.5 : 1.5), b.w, b.h); }
    const c = foreign ? [150, 146, 136] : ROOFS[sd % 3];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    if (lod >= 2) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * 0.45); }
  } else if (lod < 2) {
    const c = FAR[d], v = (sd % 16) - 8;
    g.fillStyle = `rgba(${c[0] + v},${c[1] + v},${c[2] + v},${d === 'sub' ? 0.55 : 0.85})`;
    if (d === 'sub') { g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); }
    else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-b.w / 2 + 0.4, -b.h / 2 + 0.4, b.w, b.h); g.fillStyle = `rgba(${c[0] + v},${c[1] + v},${c[2] + v},0.9)`; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); }
  } else {
    // the lot: pavements, yards, car parks, gardens
    g.fillStyle = LOT[d]; g.fillRect(-b.w / 2 - 0.15, -b.h / 2 - 0.15, b.w + 0.3, b.h + 0.3);
    formBlock(g, b, sd, lod);
  }
  if (b.hp < 1) scorchBlock(g, b);
  g.restore();
}
/* convex hull of a few points (monotone chain) */
function hull(P) {
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/* a block as it really is, by its form. lod 2 draws the big masses, lod 3 buildings, lod 4 their details.
   Shadows fall to the south-east whatever way the block turns, longer for taller buildings */
function formBlock(g, b, sd, lod) {
  const W2 = b.w / 2, H2 = b.h / 2, h = (i, j) => U.hash(sd * 3 + i, j * 7 + 1), fine = lod >= 4, mid = lod >= 3;
  const ca = Math.cos(-b.a), sa = Math.sin(-b.a), shx = ca - sa * 0.8, shy = sa + ca * 0.8;
  const rgb = (c, v) => `rgb(${c[0] + (v || 0) | 0},${c[1] + (v || 0) | 0},${c[2] + (v || 0) | 0})`;
  const box = (x, y, w, hh, col, ht, pitched) => {
    // at the middle detail small buildings are a roof and nothing else: they are a pixel or two across
    if (!fine && ht < 0.06) { g.fillStyle = col; g.fillRect(x, y, w, hh); return; }
    if (ht > 0.15) {
      // a tall building casts its whole outline along the sun: the roof and its offset joined up
      const dx = shx * ht, dy = shy * ht, P = [];
      for (const [u, v] of [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]) P.push([u, v], [u + dx, v + dy]);
      g.fillStyle = 'rgba(0,0,0,0.34)'; g.beginPath(); hull(P).forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.fill();
    } else if (ht > 0) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x + shx * ht, y + shy * ht, w, hh); }
    g.fillStyle = col; g.fillRect(x, y, w, hh);
    if (pitched && mid) { g.fillStyle = 'rgba(0,0,0,0.13)'; if (w > hh) g.fillRect(x, y + hh / 2, w, hh / 2); else g.fillRect(x + w / 2, y, w / 2, hh); }
    else if (fine && ht > 0.1) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + w * 0.1, y + hh * 0.1, w * 0.8, hh * 0.8); }
  };
  const grass = (x, y, w, hh, c) => { g.fillStyle = c || 'rgb(98,116,76)'; g.fillRect(x, y, w, hh); };
  // a car park: rows of bays, each row one dashed line (the dashes are the white lines between the bays)
  const park = (x, y, w, hh, col) => {
    g.fillStyle = col || 'rgb(88,90,90)'; g.fillRect(x, y, w, hh);
    if (!fine) return;
    g.strokeStyle = 'rgba(230,230,220,0.35)'; g.lineWidth = 0.05; g.setLineDash([0.006, 0.02]); g.beginPath();
    for (let r = y + 0.045; r < y + hh - 0.03; r += 0.12) { g.moveTo(x + 0.03, r); g.lineTo(x + w - 0.03, r); }
    g.stroke(); g.setLineDash([]);
  };
  const tp = [];   // trees
  const subdiv = (S, st) => { const n = Math.max(1, Math.round(b.w / S)), m = Math.max(1, Math.round(b.h / S)); return { n, m, cw: b.w / n, ch: b.h / m, st }; };
  const lanes = (G) => { g.fillStyle = 'rgb(96,96,94)'; for (let i = 1; i < G.n; i++) g.fillRect(-W2 + i * G.cw - G.st / 2, -H2, G.st, b.h); for (let j = 1; j < G.m; j++) g.fillRect(-W2, -H2 + j * G.ch - G.st / 2, b.w, G.st); };
  switch (b.f) {
    case 'old': case 'court': {
      // perimeter blocks round courtyards; the old town's plots smaller and less regular, with a church here and there
      const old = b.f === 'old', G = subdiv(old ? 0.75 : 1.25, old ? 0.07 : 0.11), pal = old ? ROOF_OLD : ROOFS;
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw + G.st / 2, y = -H2 + j * G.ch + G.st / 2, w = G.cw - G.st, hh = G.ch - G.st, k = h(i, j);
        if (!old && k < 0.06) { grass(x, y, w, hh); tp.push(x + w / 2, y + hh / 2); continue; }   // a square with trees
        if (old && k > 0.93 && mid) {   // a church: nave and tower on its own little square
          g.fillStyle = 'rgb(150,142,128)'; g.fillRect(x, y, w, hh);
          box(x + w * 0.2, y + hh * 0.38, w * 0.62, hh * 0.24, 'rgb(120,104,92)', 0.12, true); box(x + w * 0.74, y + hh * 0.36, w * 0.14, hh * 0.28, 'rgb(140,132,120)', 0.3); continue;
        }
        if (!mid) { box(x, y, w, hh, rgb(pal[Math.floor(k * pal.length)], 0), 0.08); continue; }
        const t = Math.min(w, hh) * (old ? 0.36 : 0.27);
        g.fillStyle = old ? 'rgb(118,112,100)' : 'rgb(104,110,96)'; g.fillRect(x, y, w, hh);
        const segs = old ? 2 + Math.floor(h(i + 5, j) * 3) : 3 + (fine ? 2 : 0);
        for (let q = 0; q < segs; q++) {
          const c = pal[Math.floor(h(q + i * 5, j + 11) * pal.length)], v = h(q, i + j) * 22 - 11, col = rgb(c, v), ht = (old ? 0.04 : 0.07) + h(q, j) * 0.05;
          box(x + q * w / segs, y, w / segs - 0.012, t, col, ht, true); box(x + q * w / segs, y + hh - t, w / segs - 0.012, t, col, ht, true);
          box(x, y + t + q * (hh - 2 * t) / segs, t, (hh - 2 * t) / segs - 0.012, col, ht, true); box(x + w - t, y + t + q * (hh - 2 * t) / segs, t, (hh - 2 * t) / segs - 0.012, col, ht, true);
        }
        if (!old && h(i + 9, j) > 0.8) tp.push(x + w / 2, y + hh / 2);
      }
      if (mid) lanes(G);
      break;
    }
    case 'tower': {
      // downtown: towers on plazas, a car park or two, long shadows
      const G = subdiv(1.3, 0.14);
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw + G.st / 2, y = -H2 + j * G.ch + G.st / 2, w = G.cw - G.st, hh = G.ch - G.st, k = h(i, j);
        g.fillStyle = 'rgb(146,146,140)'; g.fillRect(x, y, w, hh);
        if (k < 0.12) { park(x, y, w, hh); continue; }
        const nT = k > 0.7 ? 1 : 2;
        for (let q = 0; q < nT; q++) {
          const tw = w * (nT === 1 ? 0.55 + h(q, i) * 0.3 : 0.4), th = hh * (nT === 1 ? 0.5 + h(j, q) * 0.35 : 0.42), tx = x + (nT === 1 ? (w - tw) / 2 : q * w * 0.52 + w * 0.04), ty = y + (hh - th) * h(q + 3, j + i);
          const ht = 0.25 + h(q + 7, i * 3 + j) * 0.9, glass = h(q, j + 2) < 0.6;
          box(tx, ty, tw, th, glass ? rgb([120, 146, 170], h(q, i + 4) * 30) : rgb(FLAT[q % FLAT.length]), ht);
          if (fine && glass) { g.fillStyle = 'rgba(220,236,255,0.18)'; g.fillRect(tx, ty, tw * 0.45, th); }
        }
      }
      if (mid) lanes(G);
      break;
    }
    case 'office': {
      // a business park: low office buildings, big car parks, lawns and trees
      grass(-W2, -H2, b.w, b.h, 'rgb(104,122,80)');
      const G = subdiv(1.6, 0.12);
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw + 0.15, y = -H2 + j * G.ch + 0.15, w = G.cw - 0.3, hh = G.ch - 0.3;
        park(x, y + hh * 0.55, w, hh * 0.45);
        box(x + w * 0.1, y + hh * 0.08, w * 0.8, hh * 0.36, rgb(FLAT[(i + j) % 4]), 0.08);
        tp.push(x + w * 0.05, y + hh * 0.5, x + w * 0.95, y + hh * 0.5);
      }
      break;
    }
    case 'slab': {
      // post-war estate: long slabs of flats in green space, set at right angles
      grass(-W2, -H2, b.w, b.h, 'rgb(100,118,78)');
      const G = subdiv(1.9, 0.1);
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw, y = -H2 + j * G.ch, w = G.cw, hh = G.ch, k = h(i, j), c = rgb(FLAT[Math.floor(k * 4)], 6);
        if (k < 0.5) for (let q = 0; q < 3; q++) box(x + w * 0.12, y + hh * (0.12 + q * 0.3), w * 0.76, 0.16, c, 0.14);
        else { box(x + w * 0.1, y + hh * 0.1, 0.16, hh * 0.8, c, 0.14); box(x + w * 0.5, y + hh * 0.1, 0.16, hh * 0.8, c, 0.14); if (k > 0.8) box(x + w * 0.78, y + hh * 0.35, 0.3, 0.3, c, 0.35); }
        if (mid) for (let q = 0; q < 4; q++) tp.push(x + w * h(q, i + 9), y + hh * h(j + 9, q));
      }
      break;
    }
    case 'row': {
      // terraces: long rows of houses along the lanes, narrow gardens behind
      grass(-W2, -H2, b.w, b.h, 'rgb(96,112,74)');
      const nl = Math.max(1, Math.round(b.h / 0.62)), lh = b.h / nl;
      g.fillStyle = 'rgb(112,112,108)';
      for (let r = 0; r < nl; r++) g.fillRect(-W2, -H2 + r * lh - 0.03, b.w, 0.06);
      for (let r = 0; r < nl; r++) for (const side of [0, 1]) {
        const y = -H2 + r * lh + (side ? lh - 0.15 - 0.05 : 0.05), c = (side ? ROOF_OLD : ROOFS)[(sd + r) % 5];
        for (let x = -W2 + 0.08; x < W2 - 0.3; x += 1.1 + h(r, side) * 0.4) { const w = Math.min(0.9 + h(x * 10 | 0, r) * 0.2, W2 - x - 0.08); box(x, y, w, 0.15, rgb(c, h(r, x * 7 | 0) * 16 - 8), 0.05, true); }
      }
      break;
    }
    case 'cul': {
      // cul-de-sacs: a loop road with short dead ends, houses round the turning circles
      grass(-W2, -H2, b.w, b.h, 'rgb(104,120,80)');
      if (!mid) { g.fillStyle = 'rgba(150,146,140,0.6)'; for (let q = 0; q < 12; q++) g.fillRect(-W2 + h(q, 1) * b.w * 0.9, -H2 + h(1, q) * b.h * 0.9, 0.3, 0.25); break; }
      // every estate is laid out a little differently: the loop's size and place, how many closes, which way in
      const rx = W2 * (0.45 + h(1, 2) * 0.25), ry = H2 * (0.45 + h(2, 1) * 0.25), ox = (h(3, 3) - 0.5) * (W2 - rx) * 0.8, oy = (h(4, 4) - 0.5) * (H2 - ry) * 0.8, rw = 0.08, nC = 5 + Math.floor(h(5, 5) * 5);
      const inA = Math.floor(h(6, 6) * 4) * Math.PI / 2;
      g.save(); g.translate(ox, oy);
      g.strokeStyle = 'rgb(118,118,114)'; g.lineWidth = rw; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7);
      g.moveTo(Math.cos(inA) * rx, Math.sin(inA) * ry); g.lineTo(Math.cos(inA) * (W2 + 0.3), Math.sin(inA) * (H2 + 0.3)); g.stroke();
      const houses = [], bulbs = [];
      for (let q = 0; q < nC; q++) {
        const a = q / nC * Math.PI * 2 + h(q, 3) * 0.5, out = h(q, 5) < 0.55, L = out ? 0.45 + h(q, 6) * 0.4 : Math.min(rx, ry) * 0.55;
        const x0 = Math.cos(a) * rx, y0 = Math.sin(a) * ry, x1 = x0 + Math.cos(a) * L * (out ? 1 : -1), y1 = y0 + Math.sin(a) * L * (out ? 1 : -1);
        if (Math.abs(x1 + ox) > W2 - 0.2 || Math.abs(y1 + oy) > H2 - 0.2 || Math.abs(U.angWrap(a - inA)) < 0.4) continue;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); bulbs.push(x1, y1);
        for (let t = 0.35; t <= 1.01; t += 0.3) for (const s of [-1, 1]) houses.push(x0 + (x1 - x0) * t - Math.sin(a) * 0.14 * s, y0 + (y1 - y0) * t + Math.cos(a) * 0.14 * s, a);
      }
      for (let q = 0; q < 26; q++) { const a = q / 26 * Math.PI * 2; for (const k of [0.8, 1.22]) houses.push(Math.cos(a) * rx * k, Math.sin(a) * ry * k, a + Math.PI / 2); }
      g.fillStyle = 'rgb(118,118,114)'; g.beginPath(); for (let q = 0; q < bulbs.length; q += 2) { g.moveTo(bulbs[q] + 0.1, bulbs[q + 1]); g.arc(bulbs[q], bulbs[q + 1], 0.1, 0, 7); } g.fill();
      for (let q = 0; q < houses.length; q += 3) {
        const x = houses[q], y = houses[q + 1], k = h(q, 11); if (k < 0.12 || Math.abs(x + ox) > W2 - 0.1 || Math.abs(y + oy) > H2 - 0.1) continue;
        box(x - 0.055, y - 0.055, 0.11, 0.11, rgb(ROOF_SUB[Math.floor(k * 5)]), 0.025, true);
        if (k > 0.6) tp.push(x * 1.1 + ox, y * 1.1 + oy);
      }
      g.restore();
      break;
    }
    case 'mall': {
      // a strip mall: a big box, a row of shops, and the car park in front of them
      park(-W2, -H2, b.w, b.h, 'rgb(84,86,86)');
      box(-W2 + 0.2, -H2 + 0.2, b.w * 0.5, b.h * 0.3, 'rgb(196,194,186)', 0.08);
      box(-W2 + 0.2 + b.w * 0.55, -H2 + 0.2, b.w * 0.35, b.h * 0.14, 'rgb(170,160,150)', 0.05);
      box(W2 - 1.1, H2 - 0.8, 0.5, 0.35, 'rgb(180,120,90)', 0.04);
      tp.push(-W2 + 0.3, H2 - 0.3, 0, H2 - 0.3, W2 - 0.3, -H2 + 0.3);
      break;
    }
    case 'shed': {
      // factories: sheds with ribbed roofs, tanks, stacks and yards
      const G = subdiv(1.5, 0.12);
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw + 0.08, y = -H2 + j * G.ch + 0.08, w = G.cw - 0.16, hh = G.ch - 0.16, k = h(i, j);
        if (k < 0.22) { // tanks
          for (let q = 0; q < 3; q++) { const cx = x + w * (0.2 + q * 0.3), cy = y + hh * 0.5, rr = Math.min(w, hh) * 0.13; g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + shx * 0.05, cy + shy * 0.05, rr, 0, 7); g.fill(); g.fillStyle = 'rgb(206,206,200)'; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill(); }
          continue;
        }
        const sw = w * (0.6 + k * 0.35), sh = hh * (0.55 + h(j, i) * 0.4), col = k < 0.6 ? 'rgb(168,172,176)' : k < 0.85 ? 'rgb(140,150,160)' : 'rgb(150,120,100)';
        box(x, y, sw, sh, col, 0.08);
        if (fine) { g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.01; g.beginPath(); for (let q = 0.05; q < sw; q += 0.05) { g.moveTo(x + q, y); g.lineTo(x + q, y + sh); } g.stroke(); }
        if (k > 0.9 && mid) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + sw + 0.05 + shx * 0.5, y + 0.05 + shy * 0.5, 0.06, 0.06); g.fillStyle = 'rgb(160,90,70)'; g.fillRect(x + sw + 0.05, y + 0.05, 0.06, 0.06); }
      }
      break;
    }
    case 'ware': {
      // warehouses: long white sheds, docks along one side, trailers waiting in the yard
      const G = subdiv(2.2, 0.14);
      for (let i = 0; i < G.n; i++) for (let j = 0; j < G.m; j++) {
        const x = -W2 + i * G.cw + 0.12, y = -H2 + j * G.ch + 0.12, w = G.cw - 0.24, hh = G.ch - 0.24;
        g.fillStyle = 'rgb(116,116,112)'; g.fillRect(x, y, w, hh);
        box(x, y, w, hh * 0.55, h(i, j) < 0.7 ? 'rgb(214,214,210)' : 'rgb(170,176,184)', 0.08);
        if (mid) { g.fillStyle = h(j, i) < 0.5 ? 'rgb(230,230,226)' : 'rgb(186,76,60)'; for (let q = x + 0.1; q < x + w - 0.1; q += fine ? 0.08 : 0.16) if (h(q * 50 | 0, j) < 0.65) g.fillRect(q, y + hh * 0.6, 0.04, 0.16); }
      }
      break;
    }
    case 'yard': {
      // a rail yard: tracks fanning out along the line, wagons standing on them
      g.fillStyle = 'rgb(104,98,90)'; g.fillRect(-W2, -H2, b.w, b.h);
      const nT = Math.max(3, Math.round(b.h / 0.09));
      g.strokeStyle = 'rgba(60,54,48,0.9)'; g.lineWidth = 0.025; g.beginPath();
      for (let q = 0; q < nT; q++) { const y = -H2 + (q + 0.5) * b.h / nT, e = Math.abs(y) / H2 * 0.8; g.moveTo(-W2 + e, y); g.lineTo(W2 - e, y); }
      g.stroke();
      if (mid) for (let q = 0; q < nT; q++) {
        const y = -H2 + (q + 0.5) * b.h / nT;
        for (let x = -W2 + 0.9, k = 0; x < W2 - 0.9; x += 0.17, k++) if (h(q, k >> 3) < 0.55) { g.fillStyle = ['rgb(120,70,56)', 'rgb(90,96,100)', 'rgb(150,140,120)'][(q + (k >> 3)) % 3]; g.fillRect(x, y - 0.025, 0.15, 0.05); }
      }
      break;
    }
    default: {
      // houses along lanes, gardens behind, trees between
      grass(-W2, -H2, b.w, b.h, b.sub ? 'rgb(104,120,80)' : 'rgb(98,114,76)');
      if (!mid) { const n = 10 + (sd % 8); for (let q = 0; q < n; q++) { const c = ROOF_SUB[q % 5]; g.fillStyle = rgb(c); g.fillRect(-W2 + h(q, 2) * (b.w - 0.3), -H2 + h(2, q) * (b.h - 0.3), 0.3, 0.22); } break; }
      const nl = Math.max(1, Math.round(b.h / 1.2)), lh = b.h / nl;
      g.fillStyle = 'rgb(118,118,114)';
      for (let r = 0; r < nl; r++) g.fillRect(-W2, -H2 + (r + 0.5) * lh - 0.035, b.w, 0.07);
      if (!fine) {
        // a pixel a house: each side of a lane is a broken row of roofs
        for (let r = 0; r < nl; r++) for (const side of [-1, 1]) {
          const yl = -H2 + (r + 0.5) * lh, y = side < 0 ? yl - 0.18 : yl + 0.07;
          for (let x = -W2 + 0.05, k = 0; x < W2 - 0.2; k++) { const L = 0.25 + h(k, r + side) * 0.5; if (h(r * 7 + k, side + 5) > 0.25) { g.fillStyle = rgb(ROOF_SUB[(k + r) % 5], -10); g.fillRect(x, y, Math.min(L, W2 - 0.05 - x), 0.11); } x += L + 0.08; }
          tp.push(-W2 + h(r, side + 9) * b.w, yl + side * 0.35);
        }
        break;
      }
      for (let r = 0; r < nl; r++) for (const side of [-1, 1]) for (let x = -W2 + 0.04, k = 0; x < W2 - 0.12; x += 0.17 + h(k, r) * 0.08, k++) {
        const s2 = h(k + r * 50, side + 3); if (s2 < (b.sub ? 0.3 : 0.08)) continue;
        const w = 0.1 + s2 * 0.05, hh = 0.08 + h(k, side) * 0.04, yl = -H2 + (r + 0.5) * lh, y = side < 0 ? yl - 0.07 - hh : yl + 0.07;
        box(x, y, w, hh, rgb(ROOF_SUB[Math.floor(s2 * 10) % 5]), 0.025, true);
        if (s2 > 0.55) tp.push(x + w / 2 + (h(k, 9) - 0.5) * 0.1, y + (side < 0 ? -0.18 : hh + 0.18));
      }
    }
  }
  // garden trees only when they are more than a pixel across
  if (tp.length && fine) trees(g, tp, 0.035, 0.03);
}

/* a destroyed block: burnt-out shells round heaps of rubble on ash-dark ground */
function rubble(g, b, lod) {
  const sd = Math.floor(b.seed);
  g.fillStyle = 'rgba(30,26,22,0.8)'; g.fillRect(-b.w / 2 - 0.25, -b.h / 2 - 0.25, b.w + 0.5, b.h + 0.5);
  if (lod >= 3) {
    // close in: every building a heap of rubble or a roofless shell, a few still standing scorched
    const c = lod >= 4 ? 0.26 : 0.5, heaps = [], shells = [], left = [];
    for (let x = -b.w / 2; x < b.w / 2 - c * 0.3; x += c) for (let y = -b.h / 2; y < b.h / 2 - c * 0.3; y += c) {
      const k = U.hash(sd + Math.round(x * 50), Math.round(y * 50) + 3), w = c * (0.55 + U.hash(Math.round(x * 30), sd) * 0.35);
      (k < 0.45 ? heaps : k < 0.8 ? shells : k < 0.9 ? left : []).push(x + (c - w) / 2, y + (c - w) / 2, w);
    }
    g.fillStyle = 'rgb(96,88,80)'; g.beginPath(); for (let i = 0; i < heaps.length; i += 3) { const r = heaps[i + 2] / 2; g.moveTo(heaps[i] + r * 2, heaps[i + 1] + r); g.ellipse(heaps[i] + r, heaps[i + 1] + r, r, r * 0.8, 0, 0, 7); } g.fill();
    g.fillStyle = 'rgb(128,120,108)'; g.beginPath(); for (let i = 0; i < heaps.length; i += 3) { const r = heaps[i + 2] / 4; g.moveTo(heaps[i] + r * 3, heaps[i + 1] + r * 1.5); g.arc(heaps[i] + r * 1.6, heaps[i + 1] + r * 1.5, r, 0, 7); } g.fill();
    g.strokeStyle = 'rgba(14,12,10,0.95)'; g.lineWidth = c * 0.09; g.beginPath(); for (let i = 0; i < shells.length; i += 3) g.rect(shells[i], shells[i + 1], shells[i + 2], shells[i + 2] * 0.8); g.stroke();
    g.fillStyle = 'rgb(70,62,56)'; for (let i = 0; i < left.length; i += 3) g.fillRect(left[i], left[i + 1], left[i + 2], left[i + 2] * 0.8);
    return;
  }
  const n = Math.max(2, Math.min(8, Math.round(b.w * b.h / 3)));
  for (let i = 0; i < n; i++) {
    const s = U.hash(sd + i, 91), x = -b.w / 2 + U.hash(i, sd) * b.w * 0.7, y = -b.h / 2 + U.hash(sd, i + 5) * b.h * 0.7, w = b.w * (0.2 + s * 0.2), h = b.h * (0.2 + U.hash(i + 3, sd) * 0.2);
    g.fillStyle = s < 0.5 ? 'rgba(104,96,86,0.95)' : 'rgba(70,64,58,0.95)'; g.fillRect(x, y, w, h);
    // the walls that still stand: a shell with no roof
    if (lod >= 2 && s > 0.35) { g.strokeStyle = 'rgba(18,16,14,0.9)'; g.lineWidth = Math.min(w, h) * 0.12; g.strokeRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8); }
  }
}
/* a damaged block: scorched roofs and holes, more the worse it is hit */
function scorchBlock(g, b) {
  const sd = Math.floor(b.seed), k = 1 - b.hp;
  for (let i = 0; i < 1 + Math.round(k * 4); i++) {
    const x = (U.hash(sd + i, 17) - 0.5) * b.w * 0.8, y = (U.hash(i, sd + 3) - 0.5) * b.h * 0.8, r = Math.min(b.w, b.h) * (0.12 + k * 0.2) * (0.6 + U.hash(i, 5) * 0.6);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(14,10,8,0.9)'); gr.addColorStop(0.5, 'rgba(40,30,22,0.6)'); gr.addColorStop(1, 'rgba(40,30,22,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}

/* ---------- detail tiles ---------- */
function paintTile(T, lod, tx, ty, S) {
  const L = LOD(lod), W = T.W;
  const px = Math.round(L.size * L.ppu), x0 = tx * L.size, y0 = ty * L.size, x1 = x0 + L.size, y1 = y0 + L.size;
  const cv = mk(px, px), g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  const gs = T.ground.width / IC.WW;
  if (!lod) {
    // the far view's picture, with airfields, water, roads and towns drawn at this scale
    g.drawImage(T.far, x0 * gs, y0 * gs, L.size * gs, L.size * gs, 0, 0, px, px);
    g.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu); g.lineCap = 'round'; g.lineJoin = 'round';
    if (S) airfields(g, S, x0 - 20, y0 - 20, x1 + 20, y1 + 20, 0);
    vectors(g, W, x0 - 60, y0 - 60, x1 + 60, y1 + 60, 0, 60);
    if (S && S.marks) for (const k of S.marks) if (k.r > 3 && k.x + k.r > x0 && k.x - k.r < x1 && k.y + k.r > y0 && k.y - k.r < y1) mark(g, k, S.time, 0);
    return cv;
  }
  g.drawImage(T.ground, x0 * gs, y0 * gs, L.size * gs, L.size * gs, 0, 0, px, px);
  // fine grain so the upscaled ground does not look smeared, offset per tile so it never lines up
  g.globalAlpha = 0.28; g.globalCompositeOperation = 'overlay';
  const pat = g.createPattern(T.grain, 'repeat'); pat.setTransform(new DOMMatrix().translate(-U.hash(tx, ty + lod) * 256, -U.hash(ty, tx + lod) * 256));
  g.fillStyle = pat; g.fillRect(0, 0, px, px);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const m = [6, 2, 1, 0.5][lod - 1];
  fields(g, T, lod, x0 - m, y0 - m, x1 + m, y1 + m);
  if (S) airfields(g, S, x0 - m, y0 - m, x1 + m, y1 + m, lod);
  forest(g, T, lod, x0 - m, y0 - m, x1 + m, y1 + m);
  // hills: the hillshade laid over everything on the ground
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(T.shadeD, x0 * gs, y0 * gs, L.size * gs, L.size * gs, 0, 0, px, px);
  g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.7;
  g.drawImage(T.shadeL, x0 * gs, y0 * gs, L.size * gs, L.size * gs, 0, 0, px, px);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu);
  vectors(g, W, x0 - 60, y0 - 60, x1 + 60, y1 + 60, lod, 60);
  if (S && S.marks) for (const k of S.marks) if (k.x + k.r > x0 && k.x - k.r < x1 && k.y + k.r > y0 && k.y - k.r < y1) mark(g, k, S.time, lod);
  return cv;
}

/* ---------- marks: craters, scorch, patches ----------
   A mark fades in four steps over its life (state.js says how long), so a tile is repainted at most four times. */
const fadeOf = (m, now) => m.life ? Math.max(0, Math.ceil((1 - (now - m.t) / m.life) * 4) / 4) : 1;
function mark(g, m, now, lod) {
  const f = fadeOf(m, now); if (f <= 0) return;
  const blot = (r, col, n) => {
    // an uneven scorch: a few overlapping blobs, not a disc
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < n; i++) { const a = U.hash(Math.round(m.seed || 1) + i, 7) * 6.28, d = r * 0.35 * U.hash(i, Math.round(m.seed || 1)), rr = r * (0.55 + 0.35 * U.hash(i + 9, 3)); g.moveTo(m.x + Math.cos(a) * d + rr, m.y + Math.sin(a) * d); g.arc(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, rr, 0, 7); }
    g.fill();
  };
  if (m.kind === 'road') {
    if (m.fixed) { g.fillStyle = `rgba(38,38,40,${0.75 * f})`; g.beginPath(); g.arc(m.x, m.y, m.cr * 1.25, 0, 7); g.fill(); return; }
    blot(m.r, 'rgba(20,16,12,0.35)', 4);
    crater(g, m.x, m.y, m.cr, 1);
    return;
  }
  if (m.kind === 'paving' || m.kind === 'scorch') { blot(m.r, `rgba(14,10,8,${0.45 * f * f})`, 5); return; }
  // fields and forest: burnt ground round the crater fades first, the crater itself last
  blot(m.r, `rgba(${m.kind === 'forest' ? '26,22,18' : '34,26,18'},${0.6 * f * f})`, 6);
  if (m.kind === 'forest' && lod >= 3) {
    g.strokeStyle = `rgba(30,26,20,${0.8 * f})`; g.lineWidth = 0.025; g.beginPath();
    for (let i = 0; i < 14; i++) { const a = U.hash(i, 5) * 6.28, d = m.r * U.hash(i, 9) * 0.8, x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d, b = a + (U.hash(i, 2) - 0.5); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * 0.12, y + Math.sin(b) * 0.12); }
    g.stroke();
  }
  if (m.cr) crater(g, m.x, m.y, m.cr, Math.sqrt(f));
}
/* a crater: thrown-out soil round a dark pit */
function crater(g, x, y, r, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
  gr.addColorStop(0, `rgba(12,10,8,${0.85 * a})`); gr.addColorStop(0.4, `rgba(40,32,24,${0.7 * a})`); gr.addColorStop(0.5, `rgba(132,114,90,${0.55 * a})`); gr.addColorStop(1, 'rgba(110,96,76,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
}
IC.drawMark = (g, m, now, lod) => mark(g, m, now, lod == null ? 3 : lod);

/* stamp a new mark on the tiles that show it now; a changed or faded mark repaints them later */
IC.bakeMark = function (S, m, redraw) {
  const T = S.terrain; if (!T || !T.base) return;
  if (redraw) { dirtyBox(T, m.x - m.r * 2, m.y - m.r * 2, m.x + m.r * 2, m.y + m.r * 2); if (m.r > 3) repaintBase(T, S, m.x - m.r * 2, m.y - m.r * 2, m.x + m.r * 2, m.y + m.r * 2); return; }
  m._st = fadeOf(m, S.time);
  for (const t of T.tiles.values()) {
    const L = LOD(t.lod), x0 = t.tx * L.size, y0 = t.ty * L.size;
    if (m.x + m.r * 2 < x0 || m.x - m.r * 2 > x0 + L.size || m.y + m.r * 2 < y0 || m.y - m.r * 2 > y0 + L.size) continue;
    const tg = t.cv.getContext('2d');
    tg.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu); mark(tg, m, S.time, t.lod); tg.setTransform(1, 0, 0, 1, 0, 0);
  }
};
/* a block was hit: draw it again, damaged, on the base and on every tile that shows it */
IC.bakeBlock = function (S, b) {
  const T = S.terrain; if (!T || !T.base) return;
  const r = Math.max(b.w, b.h), W = S.world;
  // city blocks, village houses and foreign towns are drawn differently
  const fo = W.foreign.some(f => f.blocks.includes(b)), town = fo || W.cities.some(c => c.blocks.includes(b)), foreign = fo;
  const g = T.base.getContext('2d');
  g.save(); g.scale(IC.TS, IC.TS); block(g, b, 0, foreign, town); g.restore();
  for (const t of T.tiles.values()) {
    const L = LOD(t.lod), x0 = t.tx * L.size, y0 = t.ty * L.size;
    if (b.x + r < x0 || b.x - r > x0 + L.size || b.y + r < y0 || b.y - r > y0 + L.size) continue;
    const tg = t.cv.getContext('2d');
    tg.setTransform(L.ppu, 0, 0, L.ppu, -x0 * L.ppu, -y0 * L.ppu); block(tg, b, t.lod, foreign, town); tg.setTransform(1, 0, 0, 1, 0, 0);
  }
};

/* draw the terrain for the current camera: base, then detail tiles where the zoom calls for them */
IC.drawTerrain = function (ctx, T, cam, dpr, budgetMs, S) {
  const zx = cam.z * dpr;
  if (S) keepUp(T, S);
  ctx.drawImage(T.base, 0, 0, IC.WW, IC.WH);
  if (!T.base || zx < 0.16) return 0;
  const lodWanted = zx >= 16 ? 4 : zx >= 4 ? 3 : zx >= 1.3 ? 2 : zx >= 0.42 ? 1 : 0;
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cam.vw / cam.z, vy1 = cam.y + cam.vh / cam.z;
  T.frame++;
  const t0 = performance.now();
  let made = 0;
  const draw = (lod, only) => {
    const L = LOD(lod);
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
      if (!only && performance.now() - t0 < budgetMs && (!t || t.dirty)) {
        const cv = paintTile(T, lod, tx, ty, S);
        if (t) { t.cv = cv; t.dirty = false; } else { t = { cv, lod, tx, ty, used: 0 }; T.tiles.set(key, t); }
        made++;
      }
      if (!t) { missing++; continue; }
      t.used = T.frame;
      ctx.drawImage(t.cv, tx * L.size, ty * L.size, L.size, L.size);
    }
    // evict the least recently used
    const mine = [...T.tiles.entries()].filter(([, t]) => t.lod === lod);
    if (mine.length > L.max) { mine.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < mine.length - L.max; i++) T.tiles.delete(mine[i][0]); }
    return missing;
  };
  if (lodWanted === 4) { draw(3, true); draw(4, false); }
  else if (lodWanted === 3) { draw(2, true); draw(3, false); }
  else if (lodWanted === 2) { draw(1, true); draw(2, false); }
  else if (lodWanted === 1) { draw(0, true); draw(1, false); }
  else draw(0, false);
  return made;
};
/* the world changed (IC.worldChanged), airports were built on, marks faded: repaint what shows it */
function keepUp(T, S) {
  // the boxes stay in S.worldDirty (builder.js counts them); this remembers how many have been drawn
  if (S.worldDirty && S.worldDirty.length > (T.dirtyN || 0)) {
    for (const b of S.worldDirty.slice(T.dirtyN || 0)) {
      const x0 = b.x0 != null ? b.x0 : b.x - (b.r || 10), y0 = b.y0 != null ? b.y0 : b.y - (b.r || 10), x1 = b.x1 != null ? b.x1 : b.x + (b.r || 10), y1 = b.y1 != null ? b.y1 : b.y + (b.r || 10);
      repaintBase(T, S, x0, y0, x1, y1); dirtyBox(T, x0 - 1, y0 - 1, x1 + 1, y1 + 1);
      for (const c of S.world.cities) if (c.x + c.r * 2 > x0 && c.x - c.r * 2 < x1 && c.y + c.r * 2 > y0 && c.y - c.r * 2 < y1) IC.cityLights(c);
    }
    T.dirtyN = S.worldDirty.length;
    IC.buildJunctions(S.world);
  }
  if (T.frame % 30 === 0) {
    const sig = IC.aptSig(S);
    if (sig !== T.aptSig) {
      const first = T.aptSig == null; T.aptSig = sig;
      // the far view just gets the airfield grass laid over it (cheap); tiles close in are painted again
      const g = T.base.getContext('2d'); g.save(); g.scale(IC.TS, IC.TS); airfields(g, S, 0, 0, IC.WW, IC.WH, 0); g.restore();
      if (!first) for (const b of IC.bases(S)) if (b.parts) { const r = b.radius + 20; dirtyBox(T, b.x - r, b.y - r, b.x + r, b.y + r); }
    }
    // marks fade in steps; each step repaints the tiles under the mark
    if (S.marks) for (const m of S.marks) if (m.life) { const st = fadeOf(m, S.time); if (st !== m._st) { m._st = st; dirtyBox(T, m.x - m.r * 2, m.y - m.r * 2, m.x + m.r * 2, m.y + m.r * 2); } }
  }
}

/* night lights for a city, redrawn when blocks are destroyed */
IC.cityLights = function (c) {
  if (typeof document === 'undefined' || !c.blocks) return;
  const LS = 0.5, size = Math.max(c.r * 4, (c.ext || 0) * 2 + 10), px = Math.ceil(size * LS);
  const lc = c.light && c.light.cv.width === px ? c.light.cv : mk(px, px);
  const lg = lc.getContext('2d');
  lg.clearRect(0, 0, px, px);
  // the glow follows the city's own shape: a soft pool over every block, brighter in the centre and the yards
  lg.globalCompositeOperation = 'lighter';
  const gl = lg.createRadialGradient(0, 0, 0, 0, 0, 1);
  gl.addColorStop(0, 'rgba(255,160,80,0.06)'); gl.addColorStop(1, 'rgba(255,160,80,0)');
  lg.fillStyle = gl;
  for (const b of c.blocks) {
    if (b.hp <= 0 || b.empty) continue;
    const d = b.d || '', k = d === 'sub' ? 0.6 : d === 'old' || d === 'biz' ? 1.3 : 1, r = (Math.max(b.w, b.h) * 0.9 + 1.5) * LS * k;
    lg.setTransform(r, 0, 0, r, (b.x - c.x + size / 2) * LS, (b.y - c.y + size / 2) * LS); lg.fillRect(-1, -1, 2, 2);
  }
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over';
  for (const b of c.blocks) {
    if (b.hp <= 0 || b.empty) continue;
    const lx = (b.x - c.x + size / 2) * LS, ly = (b.y - c.y + size / 2) * LS;
    lg.fillStyle = b.ind ? 'rgba(210,225,255,0.8)' : (b.seed % 10) < 2 ? 'rgba(200,225,255,0.9)' : 'rgba(255,210,140,0.9)';
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
