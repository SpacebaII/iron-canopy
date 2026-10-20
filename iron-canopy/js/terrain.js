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

/* farm blocks: planned in countryside.js (IC.farmBlock), painted by fields() below */

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
        const i = Math.floor(wx / IC.FB), j = Math.floor(wy / IC.FB);
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
  dirtyUp(x0, y0, x1, y1);
}
// the buildings standing up (render-buildings.js) are in tiles of their own, and a roof leans up to 2 km north
function dirtyUp(x0, y0, x1, y1) {
  if (IC.bldTiles) for (const t of IC.bldTiles.tiles.values()) {
    const L = LOD(t.lod), tx0 = t.tx * L.size, ty0 = t.ty * L.size;
    if (!(x1 < tx0 || x0 > tx0 + L.size || y1 < ty0 || y0 - 2 > ty0 + L.size)) t.dirty = true;
  }
}

/* the ground of an airfield: meadow round the fence, mown grass inside it (no crops or trees on an airfield), the
   graded strip along each runway a lighter green, mown verges along the taxiways and round the aprons */
function airfields(g, S, x0, y0, x1, y1, lod) {
  const poly = P => { g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); };
  for (const ap of IC.bases(S)) {
    if (!ap.parts || ap.x + ap.radius < x0 || ap.x - ap.radius > x1 || ap.y + ap.radius < y0 || ap.y - ap.radius > y1) continue;
    const b = IC.aptFence && IC.aptFence(ap);
    if (b && b.poly && b.poly.length > 2) {
      g.fillStyle = 'rgba(96,112,70,0.3)'; poly(IC.polyGrow(b.poly, 2.5)); g.fill();
      g.fillStyle = 'rgba(88,106,62,0.85)'; poly(IC.polyGrow(b.poly, 0.2)); g.fill();
      // (close in, the same grass as the airport's own tiles: tufts and mottling)
      if (lod >= 2 && IC.paveFill) { g.globalAlpha = 0.6; g.fillStyle = IC.paveFill(g, 'grass', LOD(lod).ppu, 0, 0, 0); g.fill(); g.globalAlpha = 1; }
    }
    const paved = ap.parts.filter(p => p.built !== false && (p.kind === 'runway' || p.kind === 'taxi' || p.kind === 'apron' || p.kind === 'alert'));
    // mown: 40 m along taxiways and round aprons
    g.strokeStyle = g.fillStyle = 'rgba(104,122,72,0.5)'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const p of paved) {
      if (p.kind === 'taxi') { g.lineWidth = (p.w || 0.23) + 0.8; g.beginPath(); p.nodes.forEach((id, i) => { const n = ap.nodes[id]; if (n) i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y); }); g.stroke(); }
      else if (p.kind !== 'runway' && IC.partOutline) { const P = IC.partOutline(p); g.lineWidth = 0.8; poly(P); g.fill(); g.stroke(); }
    }
    // the graded strip: 150 m either side of the runway and 60 m beyond its ends, kept short
    for (const p of paved) if (p.kind === 'runway') {
      const a = IC.rwAt(p, 0), c = IC.rwAt(p, 1), L = Math.hypot(c.x - a.x, c.y - a.y) || 1, ux = (c.x - a.x) / L, uy = (c.y - a.y) / L, h = p.w / 2 + 1.5, e = 0.6;
      const strip = () => poly([{ x: a.x - ux * e - uy * h, y: a.y - uy * e + ux * h }, { x: c.x + ux * e - uy * h, y: c.y + uy * e + ux * h }, { x: c.x + ux * e + uy * h, y: c.y + uy * e - ux * h }, { x: a.x - ux * e + uy * h, y: a.y - uy * e - ux * h }]);
      g.fillStyle = 'rgba(116,138,80,0.9)'; strip(); g.fill();
      if (lod >= 2) {
        // the mowers' passes along it, 15 m wide, lighter and darker by the way the grass lies
        g.save(); g.clip();
        for (let o = -h, i = 0; o < h; o += 0.15, i++) {
          g.fillStyle = i & 1 ? 'rgba(150,172,104,0.2)' : 'rgba(78,98,56,0.1)';
          poly([{ x: a.x - ux * e - uy * o, y: a.y - uy * e + ux * o }, { x: c.x + ux * e - uy * o, y: c.y + uy * e + ux * o }, { x: c.x + ux * e - uy * (o + 0.15), y: c.y + uy * e + ux * (o + 0.15) }, { x: a.x - ux * e - uy * (o + 0.15), y: a.y - uy * e + ux * (o + 0.15) }]); g.fill();
        }
        g.restore();
        // a clean edge where the short grass meets the longer
        g.strokeStyle = 'rgba(62,80,44,0.45)'; g.lineWidth = Math.max(0.04, 1.2 / LOD(lod).ppu); strip(); g.stroke();
      }
    }
  }
}
IC.aptSig = S => IC.bases(S).map(b => b.parts ? b.parts.filter(p => p.built).length + ':' + b.parts.length : '').join('|');

/* fields (brief 57; countryside.js plans them): each farm block's holdings cut into plots of crops, pasture or
   rough grazing, the boundaries by the kind of country (hedges, ditches, fences, walls, farm tracks), and across
   the pattern the farmsteads, copses, orchards and ponds */
const PASTURE = [[104, 128, 70], [116, 136, 76]], ROUGH = [[142, 140, 96], [130, 132, 90]], ORCH = [96, 120, 66];
const FARMB = { house: [172, 108, 84], barn: [118, 100, 84], shed: [142, 140, 132], silo: [180, 182, 180] };
function fields(g, T, lod, x0, y0, x1, y1) {
  const W = T.W, blocks = IC.farmBlocks(W, x0, y0, x1, y1);
  const byCol = FIELDS.map(() => []), pasture = [[], []], rough = [[], []], orch = [], furrows = [], lines4 = { track: [], hedge: [], ditch: [], fence: [], wall: [] }, htrees = [], ptrees = [], feats = [];
  const inset = [0.35, 0.12, 0.06, 0.05][lod - 1];
  const rect = (path, c, u, v, w, h) => {
    const ax = c.cx + u * c.ca - v * c.sa, ay = c.cy + u * c.sa + v * c.ca;
    path.push(ax, ay, ax + w * c.ca, ay + w * c.sa, ax + w * c.ca - h * c.sa, ay + w * c.sa + h * c.ca, ax - h * c.sa, ay + h * c.ca);
  };
  const bucket = f => f[6] === 'pasture' ? pasture[f[5] < 0.5 ? 0 : 1] : f[6] === 'rough' ? rough[f[5] < 0.5 ? 0 : 1] : f[6] === 'orchard' ? orch : byCol[crop(f[4])];
  for (const P of blocks) {
    const list = [];
    for (const c of P.cells) {
      if (c.ca === undefined) { c.ca = Math.cos(c.th); c.sa = Math.sin(c.th); }
      for (const f of c.plots) {
        const mx = c.cx + (f[0] + f[2] / 2) * c.ca - (f[1] + f[3] / 2) * c.sa, my = c.cy + (f[0] + f[2] / 2) * c.sa + (f[1] + f[3] / 2) * c.ca;
        const w = W.farmAt(mx, my);
        // fewer plots where the farmland thins out, none in the forest or the river
        if (w < 0.1 || f[5] > w * 2.4 + 0.3 || (lod > 1 ? T.fd(mx, my) > IC.FOREST_T - 0.02 || W.riverDist(mx, my) < 4 : T.fdc(mx, my) > IC.FOREST_T + 0.04)) continue;
        list.push([f, c]);
      }
    }
    if (list.length < (P.one ? 1 : 3)) continue;
    const [c00, c10, c11, c01] = P.corners;
    const quad = () => { g.beginPath(); g.moveTo(c00[0], c00[1]); g.lineTo(c10[0], c10[1]); g.lineTo(c11[0], c11[1]); g.lineTo(c01[0], c01[1]); g.closePath(); };
    if (lod >= 2) {
      // each holding is clipped to its own outline so plots end at the hedge
      for (const c of P.cells) {
        g.save(); g.beginPath(); c.q.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.clip();
        const cols = FIELDS.map(() => []), pa = [[], []], ro = [[], []], or = [];
        for (const [f, cc] of list) if (cc === c) rect(f[6] === 'pasture' ? pa[f[5] < 0.5 ? 0 : 1] : f[6] === 'rough' ? ro[f[5] < 0.5 ? 0 : 1] : f[6] === 'orchard' ? or : cols[crop(f[4])], c, f[0] + inset, f[1] + inset, f[2] - 2 * inset, f[3] - 2 * inset);
        cols.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(FIELDS[k], 0.9)); });
        pa.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(PASTURE[k], 0.9)); });
        ro.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(ROUGH[k], 0.85)); });
        if (or.length) polyFill(g, or, colour(ORCH, 0.9));
        g.restore();
      }
      g.save(); quad(); g.clip();
      for (const [f, c] of list) {
        const k = crop(f[4]);
        if (lod >= 3 && f[6] === 'crop' && (k === 0 || k === 2 || k === 3 || k === 7)) for (let q = 0.18; q < f[2]; q += 0.24) { const u = f[0] + q; furrows.push(c.cx + u * c.ca - f[1] * c.sa, c.cy + u * c.sa + f[1] * c.ca, c.cx + u * c.ca - (f[1] + f[3]) * c.sa, c.cy + u * c.sa + (f[1] + f[3]) * c.ca); }
        // pasture: a tree or two standing in the field
        if (lod >= 3 && f[6] === 'pasture') for (let t = 0; t < 3; t++) { const hu = U.hash(Math.round((c.cx + f[0]) * 9) + t, Math.round((c.cy + f[1]) * 9)); if (hu > 0.5) continue; const u = f[0] + 0.3 + hu * (f[2] - 0.6), v = f[1] + 0.3 + U.hash(t + 7, Math.round((c.cx + f[1]) * 9)) * (f[3] - 0.6); ptrees.push(c.cx + u * c.ca - v * c.sa, c.cy + u * c.sa + v * c.ca); }
        // an orchard: rows of small trees
        if (f[6] === 'orchard' && lod >= 2) { const sp = lod >= 3 ? 0.09 : 0.2; for (let u = f[0] + inset + 0.06; u < f[0] + f[2] - inset; u += sp) for (let v = f[1] + inset + 0.06; v < f[1] + f[3] - inset; v += sp) ptrees.push(c.cx + u * c.ca - v * c.sa, c.cy + u * c.sa + v * c.ca); }
      }
      g.restore();
    } else {
      for (const c of P.cells) { const base = P.kind === 'meadow' ? pasture[0] : P.kind === 'upland' ? rough[0] : byCol[crop(c.base)]; base.push(c.q[0][0], c.q[0][1], c.q[1][0], c.q[1][1], c.q[2][0], c.q[2][1], c.q[3][0], c.q[3][1]); }
      for (const [f, c] of list) if (f[2] * f[3] > 24 || f[6] === 'orchard') rect(bucket(f), c, f[0] + inset, f[1] + inset, f[2] - 2 * inset, f[3] - 2 * inset);
    }
    // what runs along the edges
    for (const e of P.edges) {
      if (lod < 2 && e.t !== 'track') continue;
      lines4[e.t].push(e.a[0], e.a[1], e.b[0], e.b[1]);
      if (lod >= 3 && e.trees) for (let t = 0.05; t < 1; t += 0.07 + U.hash(e.ha + Math.round(t * 99), e.hb) * 0.08) if (U.hash(e.ha * 5 + Math.round(t * 100), e.hb * 3) < 0.55) htrees.push(e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t);
    }
    for (const f of P.feats) { if (f.k === 'farm') lines4.track.push(f.track[0][0], f.track[0][1], f.track[1][0], f.track[1][1]); if (f.k !== 'orchard') feats.push(f); }
  }
  if (lod === 1) {
    // (muted from far out: the quilt should read as country, not as camouflage)
    byCol.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(FIELDS[k], 0.42)); });
    pasture.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(PASTURE[k], 0.5)); });
    rough.forEach((pl, k) => { if (pl.length) polyFill(g, pl, colour(ROUGH[k], 0.5)); });
    if (orch.length) polyFill(g, orch, colour(ORCH, 0.5));
  }
  if (lod >= 2) {
    lines(g, lines4.ditch, 'rgba(70,84,60,0.6)', lod >= 3 ? 0.05 : 0.1);
    lines(g, lines4.fence, 'rgba(120,112,90,0.5)', lod >= 3 ? 0.035 : 0.08);
    lines(g, lines4.wall, 'rgba(156,152,140,0.85)', lod >= 3 ? 0.06 : 0.12);
    lines(g, lines4.track, 'rgba(176,160,122,0.7)', lod >= 3 ? 0.07 : 0.14);
    lines(g, lines4.hedge, 'rgba(46,64,36,0.75)', lod >= 3 ? 0.1 : 0.16);
    lines(g, furrows, 'rgba(60,50,30,0.14)', 0.04);
  }
  features(g, feats, lod);
  if (lod >= 2 && ptrees.length) trees(g, ptrees, lod >= 4 ? 0.06 : 0.08, 0.04);
  if (lod >= 2 && htrees.length) trees(g, htrees, lod >= 4 ? 0.09 : 0.11, 0.05);
}
/* the countryside's features: farmsteads, copses and ponds */
function features(g, feats, lod) {
  for (const f of feats) {
    if (f.k === 'copse') {
      g.beginPath(); f.pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
      g.fillStyle = 'rgba(12,20,10,0.4)'; g.save(); g.translate(0.12, 0.1); g.fill(); g.restore();
      g.fillStyle = lod >= 2 ? 'rgb(44,68,40)' : 'rgb(50,74,44)'; g.fill();
      if (lod >= 3) { const P = []; const n = Math.round(f.r * f.r * 40); for (let k = 0; k < n; k++) { const a = U.hash(Math.round(f.x * 3) + k, Math.round(f.y * 3)) * Math.PI * 2, rr = Math.sqrt(U.hash(k, Math.round(f.x * 5))) * f.r * 0.8; P.push(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr); } trees(g, P, lod >= 4 ? 0.1 : 0.13, 0.08); }
    } else if (f.k === 'pond') {
      if (lod < 2) continue;
      g.save(); g.translate(f.x, f.y); g.rotate(f.a);
      g.fillStyle = 'rgba(96,120,80,0.7)'; g.beginPath(); g.ellipse(0, 0, f.rx + 0.08, f.ry + 0.08, 0, 0, 7); g.fill();   // the wet margin
      g.fillStyle = 'rgb(72,98,112)'; g.beginPath(); g.ellipse(0, 0, f.rx, f.ry, 0, 0, 7); g.fill();
      g.restore();
    } else if (f.k === 'farm') {
      g.save(); g.translate(f.x, f.y); g.rotate(f.a);
      if (lod < 2) { g.fillStyle = 'rgba(150,130,100,0.9)'; g.fillRect(-0.25, -0.25, 0.5, 0.5); g.restore(); continue; }
      g.fillStyle = 'rgba(166,150,118,0.8)'; g.fillRect(-f.yard.w / 2, -f.yard.h / 2, f.yard.w, f.yard.h);   // the yard
      g.restore();
      for (const b of f.bld) {
        g.save(); g.translate(b.x, b.y); g.rotate(b.a);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-b.w / 2 + 0.03, -b.h / 2 + 0.03, b.w, b.h);
        const c = FARMB[b.k]; g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        if (b.k === 'silo') { g.beginPath(); g.arc(0, 0, b.w / 2, 0, 7); g.fill(); }
        else { g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); if (lod >= 3) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * 0.45); } }
        g.restore();
      }
      if (lod >= 3) { const P = []; for (let k = 0; k < 4; k++) { const a = U.hash(Math.round(f.x * 7) + k, Math.round(f.y * 7)) * Math.PI * 2; P.push(f.x + Math.cos(a) * 0.55, f.y + Math.sin(a) * 0.55); } trees(g, P, 0.1, 0.05); }
    }
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
    // far out a dark line; close in the ballast bed at its real width (the rails and sleepers are drawn live closer)
    if (lod < 3) { g.strokeStyle = 'rgba(30,28,26,0.55)'; g.lineWidth = [4 * K0, 1.6, 0.7][lod]; line(); g.stroke(); }
    if (lod === 2) { g.strokeStyle = 'rgba(170,160,140,0.55)'; g.lineWidth = 0.4; g.setLineDash([0.3, 0.9]); line(); g.stroke(); g.setLineDash([]); }
    if (lod >= 3) {
      g.strokeStyle = 'rgba(40,36,30,0.45)'; g.lineWidth = lod === 3 ? 0.16 : 0.075; line(); g.stroke();
      g.strokeStyle = 'rgb(126,118,104)'; g.lineWidth = lod === 3 ? 0.12 : 0.055; line(); g.stroke();
      g.strokeStyle = 'rgba(52,46,40,0.8)'; g.lineWidth = lod === 3 ? 0.05 : 0.022; line(); g.stroke();
    }
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
    // (cl: a suburb's closes, brief 54, thinner than a side street until the street zoom, so an estate's loop is a line
    // and not a ring from the town zoom)
    const RW = [{ hw: 11, rd: 6.5, lc: 3.4, sp: 3 }, { hw: 3.6, rd: 2.2, lc: 1.3, sp: 1.1, ln: 0.6, art: 0.9, st: 0.5, cl: 0.3, ring: 2.4, ramp: 1 },
      { ln: 0.3, art: 0.7, st: 0.5, cl: 0.3, ring: 0.9 }, { ln: 0.12, art: 0.2, st: 0.11, cl: 0.11, ring: 0.36 }, { ln: 0.07, art: 0.2, st: 0.11, cl: 0.11, ring: 0.36 }][lod];
    // (the same tones as the live drawing far out: roadgeom.js IC.ROAD_TONE)
    const T = IC.ROAD_TONE, tc = (k, a) => `rgba(${T[k][0]},${T[k][1]},${T[k][2]},${a})`;
    const FILL = { ramp: tc('ramp', 0.85), hw: tc('hw', 0.92), rd: tc('rd', 0.8), lc: tc('lc', 0.6), sp: tc('sp', 0.6), ln: tc('ln', 0.55), art: tc('art', 0.75), st: tc('st', 0.6), ring: tc('ring', 0.85) };
    if (lod >= 2) { FILL.art = 'rgb(150,148,142)'; FILL.st = 'rgb(128,127,122)'; FILL.ring = 'rgb(128,127,122)'; FILL.ln = 'rgba(140,122,90,0.8)'; }
    // close in, city streets are asphalt between pavements
    if (lod >= 3 && IC.STREET_ASP) { FILL.art = IC.STREET_ASP.art; FILL.st = IC.STREET_ASP.st; FILL.ring = IC.STREET_ASP.ring; }
    FILL.cl = FILL.st;
    const layers = [];
    // (the national roads through a city are its avenues: far out drawn as the roads they are, close in as avenues)
    const aves = lod >= 2 ? W.edges.filter(e => e.city) : [];
    if (lod) { layers.push(['ln', W.lanes]); for (const c of towns) if (c.streets && tIn(c)) { layers.push(['cl', c.streets.filter(l => l.cul)]); for (const cls of ['st', 'art', 'ring']) layers.push([cls, c.streets.filter(l => l.cls === cls && !l.cul)]); } layers.push(['art', aves.filter(e => e.ccls !== 'ring')], ['ring', aves.filter(e => e.ccls === 'ring')]); }
    if (lod < 2) { for (const cls of ['sp', 'lc', 'rd']) layers.push([cls, W.edges.filter(e => e.cls === cls)]); if (lod) layers.push(['ramp', W.ramps]); layers.push(['hw', W.edges.filter(e => e.cls === 'hw')]); }
    for (const pass of [0, 1]) for (const [cls, list] of layers) {
      const w = RW[cls] * K0; if (!w) continue;
      g.beginPath();
      for (const l of list) { if (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3])) continue; for (const P of IC.roadRuns ? IC.roadRuns(W, l) : [l.pts]) P.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); }
      // close in, streets have pavements either side; far out, roads a dark edge
      const pave = (lod >= 3 && (cls === 'st' || cls === 'art' || cls === 'ring')) || (lod >= 4 && cls === 'cl');
      if (pass === 0) { g.strokeStyle = pave ? 'rgb(152,150,142)' : cls === 'ln' ? 'rgba(40,34,24,0.2)' : 'rgba(20,18,14,0.45)'; g.lineWidth = w + (pave ? 0.1 : [3 * K0, 1.2, 0.3, 0.1, 0.06][lod]); }
      else { g.strokeStyle = FILL[cls]; g.lineWidth = w; }
      g.stroke();
    }
    // a street that met nothing ends in a turning head; one that crosses the river rides a bridge (a deck between
    // parapets, like the roads' in render-roads.js)
    if (lod >= 2) for (const c of towns) {
      if (!c.streets || !tIn(c)) continue;
      for (const l of c.streets) {
        if (!l.head || (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3]))) continue;
        const w = RW[l.cul ? 'cl' : l.cls] * K0, r = w * (l.cul ? 0.65 : 1.15);   // (a close's head is a small one)
        if (l.cul && lod < 3) continue;
        for (const end of [0, 1]) {
          if (!(l.head & (end + 1))) continue;
          const e = l.pts[end ? l.pts.length - 1 : 0];
          g.fillStyle = lod >= 3 ? 'rgb(152,150,142)' : 'rgba(20,18,14,0.45)'; g.beginPath(); g.arc(e.x, e.y, r + (lod >= 3 ? 0.05 : 0.03), 0, 7); g.fill();
          g.fillStyle = FILL[l.cls]; g.beginPath(); g.arc(e.x, e.y, r, 0, 7); g.fill();
        }
      }
      for (const l of c.streets) {
        if (!l.br || (l.bb && !inb(l.bb[0], l.bb[1], l.bb[2], l.bb[3]))) continue;
        const w = RW[l.cls] * K0;
        for (const [x0b, y0b, x1b, y1b] of l.br) {
          g.lineCap = 'butt';
          g.beginPath(); g.moveTo(x0b, y0b); g.lineTo(x1b, y1b);
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = w + 0.12; g.save(); g.translate(0.05, 0.07); g.stroke(); g.restore();
          g.strokeStyle = 'rgb(168,166,160)'; g.lineWidth = w + 0.1; g.stroke();
          g.strokeStyle = 'rgb(74,75,76)'; g.lineWidth = w; g.stroke();
          g.lineCap = 'round';
        }
      }
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
          const nx = -(b.y - a.y) / L * 0.13, ny = (b.x - a.x) / L * 0.13;   // (in the pavement beside the avenue)
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
  if (lod) for (const c of towns) if (c.fringe && tIn(c)) for (const it of c.fringe.items) if (inT(it.x - 3, it.y - 3, it.x + 3, it.y + 3)) fringeItem(g, it, lod);
  // a real old town's footpaths and passages (brief 65), paved, under its blocks
  if (lod >= 2) for (const c of towns) if (c.walks && tIn(c)) {
    g.beginPath();
    for (const r of c.walks) r.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
    g.strokeStyle = 'rgb(168,160,146)'; g.lineWidth = 0.05; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.lineCap = 'butt';
  }
  for (const c of towns) if (tIn(c)) for (const b of c.blocks) if (inT(b.x - 5, b.y - 5, b.x + 5, b.y + 5)) block(g, b, lod, c.kind === 'ftown', true, c);
  // close in, the streets cross at kerbed corners (render-roads.js; the same code draws them live over the avenues)
  if (lod >= 3 && IC.paintStreetJoins) for (const c of towns) if (tIn(c)) IC.paintStreetJoins(g, W, c, x0 + p, y0 + p, x1 - p, y1 - p, lod, 1 / LOD(lod).ppu);
  for (const v of W.villages) {
    if (!inb(v.x - 90, v.y - 90, v.x + 90, v.y + 90)) continue;
    const foreign = v.kind === 'ftown' || !v.home;
    if (v.plan && lod >= 1) villageGround(g, v.plan, lod);
    for (const b of v.blocks) if (inT(b.x - 2, b.y - 2, b.x + 2, b.y + 2)) block(g, b, lod, foreign);
  }
}
/* what a town keeps at its edge (brief 54, fringe.js): allotments, playing fields, a cemetery, a sewage works, a
   water tower, a scrapyard, a riding school; a wash from the region zoom, their own look close in */
function fringeItem(g, it, lod) {
  const W2 = it.w / 2, H2 = it.h / 2, h = (i, j) => U.hash(Math.floor(it.seed) * 3 + i, j * 7 + 1), mid = lod >= 3, fine = lod >= 4;
  g.save(); g.translate(it.x, it.y); g.rotate(it.a);
  const box = (x, y, w, hh, col, ht) => { if (ht && mid) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + ht, y + ht * 0.8, w, hh); } g.fillStyle = col; g.fillRect(x, y, w, hh); };
  switch (it.kind) {
    case 'allot': {   // strips of gardens, a path between the rows, a shed on most
      g.fillStyle = 'rgb(108,118,74)'; g.fillRect(-W2, -H2, it.w, it.h);
      g.strokeStyle = 'rgba(70,90,50,0.6)'; g.lineWidth = 0.02; g.strokeRect(-W2, -H2, it.w, it.h);
      if (!mid) break;
      const rows = Math.max(2, Math.round(it.h / 0.3)), rh = it.h / rows, cols = Math.max(3, Math.round(it.w / 0.12));
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const x = -W2 + k * it.w / cols + 0.01, y = -H2 + r * rh + 0.02, v = h(r, k);
        g.fillStyle = v < 0.3 ? 'rgb(96,110,60)' : v < 0.6 ? 'rgb(126,118,72)' : v < 0.8 ? 'rgb(112,126,70)' : 'rgb(138,124,86)'; g.fillRect(x, y, it.w / cols - 0.02, rh - 0.06);
        if (fine && v > 0.4) box(x + 0.01, y + rh - 0.09, 0.03, 0.025, 'rgb(110,96,80)', 0.01);
      }
      g.fillStyle = 'rgba(170,160,130,0.6)'; for (let r = 1; r < rows; r++) g.fillRect(-W2, -H2 + r * rh - 0.02, it.w, 0.03);
      break;
    }
    case 'pitch': {   // mown grass, the pitches' lines close in, a pavilion and a car park at one end
      g.fillStyle = 'rgb(92,132,70)'; g.fillRect(-W2, -H2, it.w, it.h);
      if (mid) {
        g.strokeStyle = 'rgba(240,240,230,0.7)'; g.lineWidth = 0.012;
        const pw = 1.0, ph = 0.64, n = Math.max(1, Math.floor((it.w - 0.5) / (pw + 0.1)));
        for (let k = 0; k < n; k++) { const x = -W2 + 0.4 + k * (pw + 0.1), y = -H2 + (it.h - ph) / 2; g.strokeRect(x, y, pw, ph); g.beginPath(); g.moveTo(x + pw / 2, y); g.lineTo(x + pw / 2, y + ph); g.stroke(); g.beginPath(); g.arc(x + pw / 2, y + ph / 2, 0.09, 0, 7); g.stroke(); }
        g.fillStyle = 'rgb(96,98,98)'; g.fillRect(-W2 + 0.04, -H2 + 0.05, 0.3, it.h - 0.1);   // the car park
        box(-W2 + 0.05, -0.1, 0.2, 0.2, 'rgb(190,180,160)', 0.02);   // the pavilion
      }
      break;
    }
    case 'cem': {   // rows of graves under yews, a chapel by the gate
      g.fillStyle = 'rgb(104,124,80)'; g.fillRect(-W2, -H2, it.w, it.h);
      g.strokeStyle = 'rgba(90,90,86,0.8)'; g.lineWidth = 0.02; g.strokeRect(-W2, -H2, it.w, it.h);
      if (mid) {
        g.fillStyle = 'rgba(200,200,196,0.75)';
        for (let y = -H2 + 0.12; y < H2 - 0.1; y += 0.1) for (let x = -W2 + 0.1; x < W2 - 0.1; x += 0.05) if (h(Math.round(x * 20), Math.round(y * 20)) > 0.2) g.fillRect(x, y, 0.02, 0.03);
        g.fillStyle = 'rgba(190,180,160,0.8)'; g.fillRect(-W2, -0.02, it.w, 0.04); g.fillRect(-0.02, -H2, 0.04, it.h);   // the paths
        box(-W2 + 0.08, -H2 + 0.08, 0.16, 0.1, 'rgb(150,140,128)', 0.03);   // the chapel
        const T = []; for (let k = 0; k < 10; k++) T.push(-W2 + h(k, 4) * it.w, -H2 + (h(4, k) < 0.5 ? 0.04 : it.h - 0.04)); trees(g, T, 0.05, 0.02);
      }
      break;
    }
    case 'sewage': {   // round tanks and beds in a fenced yard
      g.fillStyle = 'rgb(118,118,104)'; g.fillRect(-W2, -H2, it.w, it.h);
      const n = Math.max(2, Math.round(it.w / 0.45)), r = Math.min(0.2, it.h * 0.22);
      for (let k = 0; k < n; k++) { const x = -W2 + (k + 0.5) * it.w / n, y = -H2 + it.h * 0.3; g.fillStyle = 'rgb(80,84,84)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (mid) { g.fillStyle = 'rgb(60,74,70)'; g.beginPath(); g.arc(x, y, r * 0.8, 0, 7); g.fill(); } }
      g.fillStyle = 'rgb(96,104,88)'; for (let k = 0; k < Math.max(2, Math.round(it.w / 0.3)); k++) g.fillRect(-W2 + 0.05 + k * 0.3, H2 - it.h * 0.4, 0.22, it.h * 0.34);
      if (mid) box(W2 - 0.3, -H2 + 0.05, 0.22, 0.12, 'rgb(170,166,156)', 0.03);
      break;
    }
    case 'water': {   // a tower: a round tank on its shadow
      if (mid) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0.12, 0.1, 0.1, 0.08, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgb(176,172,164)'; g.beginPath(); g.arc(0, 0, 0.08, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(-0.02, -0.02, 0.04, 0, 7); g.fill();
      break;
    }
    case 'scrap': {   // a yard of wrecks and heaps, rust and oil
      g.fillStyle = 'rgb(112,100,84)'; g.fillRect(-W2, -H2, it.w, it.h);
      if (mid) { for (let k = 0; k < 40; k++) { const x = -W2 + 0.05 + h(k, 9) * (it.w - 0.12), y = -H2 + 0.05 + h(9, k) * (it.h - 0.1), v = h(k, 2); g.fillStyle = v < 0.4 ? 'rgb(140,96,60)' : v < 0.7 ? 'rgb(90,90,94)' : 'rgb(120,112,96)'; g.fillRect(x, y, 0.045, 0.025); } box(-W2 + 0.05, -H2 + 0.05, 0.2, 0.12, 'rgb(150,146,136)', 0.03); }
      break;
    }
    case 'riding': {   // a sand school, a paddock and the stables
      g.fillStyle = 'rgb(104,128,72)'; g.fillRect(-W2, -H2, it.w, it.h);
      g.strokeStyle = 'rgba(120,100,70,0.7)'; g.lineWidth = 0.015; g.strokeRect(-W2, -H2, it.w, it.h);
      g.fillStyle = 'rgb(190,172,130)'; g.fillRect(-W2 + 0.1, -H2 + 0.1, Math.min(0.6, it.w * 0.45), Math.min(0.4, it.h * 0.5));   // the sand school
      if (mid) { box(W2 - 0.4, H2 - 0.24, 0.32, 0.12, 'rgb(150,130,100)', 0.03); g.beginPath(); g.moveTo(0, -H2); g.lineTo(0, H2); g.stroke(); }
      break;
    }
  }
  g.restore();
}
/* a village's ground (brief 54): hedged gardens behind the houses, farmyards, the green and the churchyard */
function villageGround(g, plan, lod) {
  const rect = (q, inset) => { g.save(); g.translate(q.x, q.y); g.rotate(q.a); g.fillRect(-q.w / 2 + inset, -q.h / 2 + inset, q.w - 2 * inset, q.h - 2 * inset); g.restore(); };
  for (const q of plan.plots) {
    g.fillStyle = 'rgba(78,104,58,0.55)'; rect(q, 0);   // the hedge round the garden
    // (from the town zoom the gardens are the warm built ground a village reads as; close in they are green)
    g.fillStyle = lod >= 3 ? 'rgba(112,138,80,0.9)' : 'rgba(134,134,104,0.9)'; rect(q, 0.03);
    if (lod >= 3) { g.fillStyle = 'rgba(150,140,110,0.5)'; g.save(); g.translate(q.x, q.y); g.rotate(q.a); g.fillRect(-q.w / 2 + 0.06, -q.h / 2 + 0.03, 0.04, q.h * 0.5); g.restore(); }   // a drive
    // the hedge itself close in (brief 55): a bushy line round the garden, a tree or two at the back
    if (lod >= 4) {
      const ca = Math.cos(q.a), sa = Math.sin(q.a), P = [], W2 = q.w / 2, H2 = q.h / 2;
      for (let t = -W2 + 0.02; t < W2; t += 0.035) P.push(q.x + t * ca - H2 * sa, q.y + t * sa + H2 * ca, q.x + t * ca + H2 * sa, q.y + t * sa - H2 * ca);
      for (let t = -H2 + 0.02; t < H2; t += 0.035) P.push(q.x - W2 * ca - t * sa, q.y - W2 * sa + t * ca, q.x + W2 * ca - t * sa, q.y + W2 * sa + t * ca);
      g.fillStyle = 'rgb(56,84,44)'; g.beginPath(); for (let i = 0; i < P.length; i += 2) { g.moveTo(P[i] + 0.016, P[i + 1]); g.arc(P[i], P[i + 1], 0.016, 0, 7); } g.fill();
      if (U.hash(Math.round(q.x * 10), Math.round(q.y * 10)) < 0.5) trees(g, [q.x + (U.hash(Math.round(q.x * 7), 3) - 0.5) * q.w * 0.6 * ca + H2 * 0.6 * sa, q.y + (U.hash(Math.round(q.x * 7), 3) - 0.5) * q.w * 0.6 * sa - H2 * 0.6 * ca], 0.035, 0.03);
    }
  }
  for (const y of plan.yards) { g.fillStyle = 'rgb(150,136,108)'; rect(y, 0); if (lod >= 3) { g.fillStyle = 'rgba(120,108,84,0.5)'; rect(y, 0.08); } }
  if (plan.green) {
    const G = plan.green; g.fillStyle = 'rgb(92,132,68)'; g.beginPath(); g.ellipse(G.x, G.y, G.rx, G.ry, G.a, 0, 7); g.fill();
    if (lod >= 3) trees(g, [G.x + G.rx * 0.4, G.y, G.x - G.rx * 0.35, G.y + G.ry * 0.2, G.x, G.y - G.ry * 0.4], 0.12, 0.06);
  }
  if (plan.church) { const c = plan.church; g.fillStyle = 'rgba(140,150,120,0.8)'; rect({ x: c.x, y: c.y, w: 0.5, h: 0.4, a: c.a }, 0); }
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
function block(g, b, lod, foreign, town, c) {
  g.save(); g.translate(b.x, b.y); g.rotate(b.a);
  if (b.hp <= 0) { rubble(g, b, lod); g.restore(); return; }
  const sd = Math.floor(b.seed), d = distOf(b);
  if (!town) {
    // village houses and farmyards
    if (lod < 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-b.w / 2 + (lod ? 0.5 : 1.5), -b.h / 2 + (lod ? 0.5 : 1.5), b.w, b.h); }
    else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-b.w / 2 + 0.025, -b.h / 2 + 0.025, b.w, b.h); }   // a shadow, so a house reads on the green
    const c = b.kind === 'church' ? [128, 118, 104] : b.kind === 'farm' || b.kind === 'shed' ? [132, 124, 110] : foreign ? [150, 146, 136] : ROOFS[sd % 3];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    if (lod >= 2) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * 0.45); }
    if (b.kind === 'church' && lod >= 2) { g.fillStyle = 'rgb(118,110,100)'; g.fillRect(b.w / 2 - 0.08, -0.05, 0.08, 0.1); }   // the tower
  } else if (lod < 2) {
    const c = FAR[d], v = (sd % 16) - 8;
    g.fillStyle = `rgba(${c[0] + v},${c[1] + v},${c[2] + v},${d === 'sub' ? 0.55 : 0.85})`;
    if (d === 'sub') {
      // a suburb from far out (brief 54): roofs and gardens as one warm built ground, so the outer town reads as
      // houses and not as fields with lines on them (the town zoom, lod 2, adds the rows of roofs: formBlock)
      g.fillStyle = `rgba(${c[0] + v - 6},${c[1] + v - 10},${c[2] + v - 16},0.92)`; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    } else if (b.pg) { g.beginPath(); poly(g, b.pg); g.fillStyle = `rgba(${c[0] + v},${c[1] + v},${c[2] + v},0.9)`; g.fill(); }
    else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-b.w / 2 + 0.4, -b.h / 2 + 0.4, b.w, b.h); g.fillStyle = `rgba(${c[0] + v},${c[1] + v},${c[2] + v},0.9)`; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); }
  } else {
    // the lot: pavements, yards, car parks, gardens
    // (brief 55: pavements with a kerb in the centre, verges in the suburbs and the estates)
    // (a real old town's block, brief 65, is its own outline between its lanes, b.pg; the rest a rectangle and its pavement)
    if (b.pg) { g.beginPath(); poly(g, b.pg); g.fillStyle = LOT[d]; g.fill(); if (lod >= 3) { g.strokeStyle = 'rgba(190,186,176,0.7)'; g.lineWidth = lod >= 4 ? 0.01 : 0.025; g.stroke(); } }
    else {
      g.fillStyle = LOT[d]; g.fillRect(-b.w / 2 - 0.15, -b.h / 2 - 0.15, b.w + 0.3, b.h + 0.3);
      if (lod >= 3 && (d === 'old' || d === 'biz' || d === 'dense')) { g.strokeStyle = 'rgba(190,186,176,0.7)'; g.lineWidth = lod >= 4 ? 0.012 : 0.03; g.strokeRect(-b.w / 2 - 0.15, -b.h / 2 - 0.15, b.w + 0.3, b.h + 0.3); }
    }
    formBlock(g, b, sd, lod, c);
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
const poly = (g, F, dx, dy) => { dx = dx || 0; dy = dy || 0; for (let i = 0; i < F.length; i += 2) i ? g.lineTo(F[i] + dx, F[i + 1] + dy) : g.moveTo(F[i] + dx, F[i + 1] + dy); g.closePath(); };
function formBlock(g, b, sd, lod, c) {
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
  // brief 55: the forms with a plan (buildings.js) are painted from it, so the 3D view agrees; the fringe's and
  // the estates' pictures stay their own
  if ((b.land && IC.LANDMARKS[b.land]) || IC.BLOCK_FORMS[b.f]) {
    if (!mid && (b.f === 'row' || b.f === 'house') && !b.land) { grass(-W2, -H2, b.w, b.h, 'rgb(100,116,78)'); roofRows(g, b, h, b.f === 'row' ? 1.1 : 1.2); return; }
    paintPlan(g, b, IC.blockPlan(b, c), lod, { box, park, grass, tp, shx, shy, h });
    if (tp.length && fine) trees(g, tp, 0.035, 0.03);
    return;
  }
  switch (b.f) {
    case 'cul': {
      // cul-de-sacs: a loop road with short dead ends, houses round the turning circles
      grass(-W2, -H2, b.w, b.h, 'rgb(104,120,80)');
      if (!mid) { roofRows(g, b, h, 1.1); break; }
      // every estate is laid out a little differently: the loop's size and place, how many closes, which way in
      // (IC.culPlan; where the closes are streets of the city, b.close, the tiles draw them with the streets)
      // (the block's own picture of its roads: where they are streets of the city, the same ones over its grass, as
      // the tiles paint the blocks after the streets; the real streets are what the traffic drives)
      const P = IC.culPlan(b), houses = P.houses, real = b.close, w = real ? (fine ? IC.ROAD_SPEC.st.w : 0.22) : 0.08;
      const roads = () => { g.beginPath(); if (!P.small) g.ellipse(P.ox, P.oy, P.rx, P.ry, 0, 0, 7); g.moveTo(P.entry[0], P.entry[1]); g.lineTo(P.entry[2], P.entry[3]); for (const [x0, y0, x1, y1] of P.closes) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke(); };
      g.lineCap = 'butt';
      if (real && fine) { g.strokeStyle = 'rgb(152,150,142)'; g.lineWidth = w + 0.1; roads(); }   // the pavements
      g.strokeStyle = real ? (IC.STREET_ASP ? IC.STREET_ASP.st : 'rgb(80,81,82)') : 'rgb(118,118,114)'; g.lineWidth = w; roads();
      const hr = real ? w * 0.65 : 0.1;   // (a close's turning head is a small one, 20 m across)
      if (real && fine) { g.fillStyle = 'rgb(152,150,142)'; g.beginPath(); for (const [x1, y1] of P.heads) { g.moveTo(x1 + hr + 0.05, y1); g.arc(x1, y1, hr + 0.05, 0, 7); } g.fill(); }
      g.fillStyle = g.strokeStyle; g.beginPath(); for (const [x1, y1] of P.heads) { g.moveTo(x1 + hr, y1); g.arc(x1, y1, hr, 0, 7); } g.fill();
      for (let q = 0; q < houses.length; q += 3) {
        const x = houses[q], y = houses[q + 1], k = h(q, 11); if (k < 0.12 || Math.abs(x) > W2 - 0.1 || Math.abs(y) > H2 - 0.1) continue;
        box(x - 0.055, y - 0.055, 0.11, 0.11, rgb(ROOF_SUB[Math.floor(k * 5)]), 0.025, true);
        if (k > 0.6) tp.push(x + (x - P.ox) * 0.1, y + (y - P.oy) * 0.1);
      }
      break;
    }
    case 'plot': {   // a house on its plot by the road out (brief 54): a hedged garden, the house at the front, a drive
      g.fillStyle = 'rgba(78,104,58,0.6)'; g.fillRect(-W2, -H2, b.w, b.h);
      g.fillStyle = mid ? 'rgb(112,138,80)' : 'rgb(134,134,104)'; g.fillRect(-W2 + 0.03, -H2 + 0.03, b.w - 0.06, b.h - 0.06);
      const hw = Math.min(0.24, b.w * 0.6), hh = 0.1 + h(1, 1) * 0.03;
      if (mid) g.fillStyle = 'rgba(150,140,110,0.6)', g.fillRect(W2 - 0.1, -H2 + 0.03, 0.045, b.h * 0.45);   // the drive
      box(-hw / 2 + (h(2, 2) - 0.5) * 0.05, -H2 + 0.12, hw, hh, rgb(ROOF_SUB[sd % 5]), 0.03, true);
      if (fine) { if (h(3, 3) > 0.5) box(W2 - 0.14, H2 - 0.14, 0.06, 0.05, 'rgb(120,110,96)', 0.015); tp.push(-W2 + 0.1 + h(4, 4) * (b.w - 0.2), H2 - 0.12); }
      break;
    }
    case 'petrol': {   // a filling station: a canopy over the pumps, a shop, the forecourt
      park(-W2, -H2, b.w, b.h, 'rgb(96,98,98)');
      box(-W2 + 0.1, -H2 + 0.1, b.w * 0.5, b.h * 0.4, 'rgb(220,215,200)', 0.06);
      if (mid) { g.fillStyle = 'rgb(200,60,50)'; g.fillRect(-W2 + 0.1, -H2 + 0.1, b.w * 0.5, 0.03); }
      box(W2 - 0.3, H2 - 0.24, 0.24, 0.16, 'rgb(190,186,176)', 0.04);
      break;
    }
    case 'dealer': {   // a car dealer: a glass showroom and rows of cars on the forecourt
      park(-W2, -H2, b.w, b.h, 'rgb(104,106,106)');
      box(-W2 + 0.1, H2 - 0.36, b.w * 0.5, 0.28, 'rgb(170,190,200)', 0.05);
      if (fine) for (let k = 0; k < 16; k++) { const x = -W2 + 0.1 + (k % 8) * 0.1, y = -H2 + 0.08 + Math.floor(k / 8) * 0.08; if (x > W2 - 0.1) continue; const v = h(k, 5); g.fillStyle = v < 0.4 ? 'rgb(200,200,200)' : v < 0.7 ? 'rgb(60,60,70)' : 'rgb(160,40,40)'; g.fillRect(x, y, 0.045, 0.02); }
      break;
    }
    case 'garden': {   // a garden centre: glasshouses, a yard of plants, a car park
      grass(-W2, -H2, b.w, b.h, 'rgb(104,124,80)');
      park(-W2 + 0.05, H2 - 0.3, b.w * 0.5, 0.25, 'rgb(104,106,106)');
      for (let k = 0; k < 3; k++) box(-W2 + 0.1 + k * 0.22, -H2 + 0.08, 0.18, b.h * 0.45, 'rgb(190,205,210)', 0.03);
      if (mid) { g.fillStyle = 'rgb(86,116,66)'; for (let k = 0; k < 6; k++) g.fillRect(W2 - 0.4 + (k % 3) * 0.12, -H2 + 0.08 + Math.floor(k / 3) * 0.12, 0.1, 0.1); }
      break;
    }
    case 'retail': {   // a retail park at the edge of town: big sheds round one car park, a drive-through at the corner
      park(-W2, -H2, b.w, b.h, 'rgb(90,92,92)');
      const n = Math.max(3, Math.round(b.w / 0.7));
      for (let k = 0; k < n; k++) { const w = b.w / n - 0.1, x = -W2 + 0.05 + k * b.w / n; box(x, -H2 + 0.1, w, b.h * 0.42, rgb(FLAT[(k + sd) % 4], 10), 0.1); if (mid) { g.fillStyle = 'rgba(40,40,40,0.25)'; g.fillRect(x, -H2 + 0.1 + b.h * 0.42, w, 0.04); } }
      box(-W2 + 0.1, H2 - 0.5, b.w * 0.35, 0.4, rgb(FLAT[sd % 4], -6), 0.1);
      box(W2 - 0.5, H2 - 0.4, 0.3, 0.26, 'rgb(190,150,110)', 0.05);
      if (mid) tp.push(-W2 + 0.3, 0, W2 - 0.3, 0.1);
      break;
    }
  }
  // garden trees only when they are more than a pixel across
  if (tp.length && fine) trees(g, tp, 0.035, 0.03);
}

/* a block painted from its plan (brief 55, buildings.js): the ground, the lots, the lanes and sidings, then the
   buildings from the lowest up, each with its shadow and its roof, and the trees */
const GROUND = { grass: 'rgb(98,116,76)', lawn: 'rgb(104,122,80)', yard: 'rgb(116,116,112)', ballast: 'rgb(104,98,90)' };
const LOTC = { court: 'rgb(118,112,100)', green: 'rgb(96,118,70)', plaza: 'rgb(150,148,142)', garden: 'rgb(104,124,78)', yard: 'rgb(116,116,112)', pitch: 'rgb(88,128,66)', platform: 'rgb(172,168,158)', play: 'rgb(140,136,126)', heli: 'rgb(130,130,128)' };
const LANEC = { lane: 'rgb(96,96,94)', path: 'rgba(176,164,132,0.8)', loop: 'rgb(90,91,92)', rail: 'rgb(126,118,104)' };
function paintPlan(g, b, P, lod, H) {
  const W2 = b.w / 2, H2 = b.h / 2, fine = lod >= 4, mid = lod >= 3, h = H.h;
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  if (GROUND[P.ground]) { g.fillStyle = GROUND[P.ground]; g.fillRect(-W2, -H2, b.w, b.h); }
  const at = (q, fn) => { if (q.a) { g.save(); g.translate(q.x, q.y); g.rotate(q.a); fn(-q.w / 2, -q.h / 2); g.restore(); } else fn(q.x - q.w / 2, q.y - q.h / 2); };
  for (const q of P.lots) at(q, (x, y) => {
    if (q.k === 'park') { H.park(x, y, q.w, q.h); return; }
    g.fillStyle = LOTC[q.k] || 'rgb(120,120,116)'; g.fillRect(x, y, q.w, q.h);
    if (!fine) return;
    if (q.k === 'pitch') { g.strokeStyle = 'rgba(240,240,230,0.6)'; g.lineWidth = 0.006; g.strokeRect(x + q.w * 0.08, y + q.h * 0.1, q.w * 0.84, q.h * 0.8); g.beginPath(); g.moveTo(x + q.w / 2, y + q.h * 0.1); g.lineTo(x + q.w / 2, y + q.h * 0.9); g.stroke(); }
    else if (q.k === 'heli') { g.strokeStyle = 'rgba(240,240,230,0.8)'; g.lineWidth = 0.008; g.beginPath(); g.arc(x + q.w / 2, y + q.h / 2, Math.min(q.w, q.h) * 0.4, 0, 7); g.stroke(); g.fillStyle = 'rgba(240,240,230,0.8)'; g.fillRect(x + q.w / 2 - 0.004, y + q.h / 2 - 0.03, 0.008, 0.06); }
    else if (q.k === 'platform') { g.fillStyle = 'rgba(230,200,60,0.6)'; g.fillRect(x, y, q.w, 0.004); g.fillRect(x, y + q.h - 0.004, q.w, 0.004); }
    else if (q.k === 'plaza') { g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 0.004; g.beginPath(); for (let u = x + 0.06; u < x + q.w; u += 0.06) { g.moveTo(u, y); g.lineTo(u, y + q.h); } for (let v = y + 0.06; v < y + q.h; v += 0.06) { g.moveTo(x, v); g.lineTo(x + q.w, v); } g.stroke(); }
  });
  if (mid) for (const l of P.lanes) {
    g.lineCap = 'butt';
    // a siding gets the main line's dark edge, so its bed reads against the yard
    if (l[5] === 'rail') { g.strokeStyle = 'rgba(40,36,30,0.5)'; g.lineWidth = l[4] + 0.02; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }
    g.strokeStyle = LANEC[l[5]] || LANEC.lane; g.lineWidth = l[4]; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke();
    if (l[5] === 'rail' && mid) { g.strokeStyle = 'rgb(150,150,150)'; g.lineWidth = fine ? 0.004 : 0.012; const dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.0072, ny = dx / L * 0.0072; g.beginPath(); g.moveTo(l[0] + nx, l[1] + ny); g.lineTo(l[2] + nx, l[3] + ny); g.moveTo(l[0] - nx, l[1] - ny); g.lineTo(l[2] - nx, l[3] - ny); g.stroke(); }
  }
  // the buildings, the lowest first so a tall one's shadow lies over its neighbours' roofs
  const B = P.bld.slice().sort((p, q) => p.ht - q.ht);
  for (const q of B) {
    const col = rgb(q.c);
    if (q.pg) {
      // a real town's building keeps its own outline: its shadow, its roof, the line where it meets its neighbour
      if (mid) { g.fillStyle = 'rgba(0,0,0,0.36)'; g.beginPath(); poly(g, q.pg, H.shx * q.ht, H.shy * q.ht); g.fill(); }
      g.fillStyle = col; g.beginPath(); poly(g, q.pg); g.fill();
      if (mid) { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = fine ? 0.004 : 0.01; g.stroke(); }
      continue;
    }
    if (!mid) { if (q.ht >= 0.05 || b.f === 'old') { g.fillStyle = col; at(q, (x, y) => g.fillRect(x, y, q.w, q.h)); } continue; }
    at(q, (x, y) => {
      const w = q.w, hh = q.h, ht = q.ht;
      if (q.r === 'round' || q.r === 'dome') {
        const r = Math.min(w, hh) / 2, cx = x + w / 2, cy = y + hh / 2;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + H.shx * ht * 0.5, cy + H.shy * ht * 0.5, r, 0, 7); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
        if (fine) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, 7); g.fill(); }
        return;
      }
      if (q.r === 'oval') {
        const cx = x + w / 2, cy = y + hh / 2;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(cx + H.shx * ht * 0.6, cy + H.shy * ht * 0.6, w / 2, hh / 2, 0, 0, 7); g.fill();
        g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, w / 2, hh / 2, 0, 0, 7); g.fill();
        g.fillStyle = 'rgb(88,128,66)'; g.beginPath(); g.ellipse(cx, cy, w * 0.32, hh * 0.32, 0, 0, 7); g.fill();
        if (fine) { g.strokeStyle = 'rgba(240,240,230,0.6)'; g.lineWidth = 0.006; g.strokeRect(cx - w * 0.22, cy - hh * 0.14, w * 0.44, hh * 0.28); }
        return;
      }
      H.box(x, y, w, hh, col, Math.min(ht, q.k === 'tower' ? 0.6 : q.r === 'spire' ? 0.18 : 0.3), q.r === 'pitch');   // (a spire's shadow would cross the street)
      if (!fine) return;
      if (q.r === 'hip') { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); if (w > hh) { g.moveTo(x, y); g.lineTo(x + hh / 2, y + hh / 2); g.lineTo(x + w - hh / 2, y + hh / 2); g.lineTo(x + w, y); g.closePath(); g.moveTo(x, y + hh); g.lineTo(x + hh / 2, y + hh / 2); g.lineTo(x + w - hh / 2, y + hh / 2); g.lineTo(x + w, y + hh); g.closePath(); } else { g.moveTo(x, y); g.lineTo(x + w / 2, y + w / 2); g.lineTo(x + w / 2, y + hh - w / 2); g.lineTo(x, y + hh); g.closePath(); g.moveTo(x + w, y); g.lineTo(x + w / 2, y + w / 2); g.lineTo(x + w / 2, y + hh - w / 2); g.lineTo(x + w, y + hh); g.closePath(); } g.fill('evenodd'); }
      else if (q.r === 'glass') { g.fillStyle = 'rgba(220,236,255,0.18)'; g.fillRect(x, y, w * 0.45, hh); }
      else if (q.r === 'rib') { g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.01; g.beginPath(); for (let u = 0.05; u < w; u += 0.05) { g.moveTo(x + u, y); g.lineTo(x + u, y + hh); } g.stroke(); }
      else if (q.r === 'spire') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + hh); g.moveTo(x + w, y); g.lineTo(x, y + hh); g.lineWidth = 0.006; g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke(); }
      else if (q.r === 'flat' && ht > 0.15) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x + w * 0.3, y + hh * 0.3, w * 0.2, hh * 0.2); }   // a plant room
    });
  }
  if (fine) for (let i = 0; i < P.trees.length; i += 2) H.tp.push(P.trees[i], P.trees[i + 1]);
  void h;
}
/* a suburb block at the town zoom (brief 54): a 300 m block is seven pixels across there, so its houses are rows of
   roofs along its lanes, broken here and there, over a warm ground of gardens; it reads as housing from 10 km up */
function roofRows(g, b, h, lane) {
  const W2 = b.w / 2, H2 = b.h / 2, nl = Math.max(1, Math.round(b.h / lane)), lh = b.h / nl;
  g.fillStyle = 'rgba(132,126,100,0.75)'; g.fillRect(-W2, -H2, b.w, b.h);
  for (let r = 0; r < nl; r++) {
    const y = -H2 + (r + 0.5) * lh, c = ROOF_SUB[r % 5];
    for (let x = -W2 + 0.1, k = 0; x < W2 - 0.3; k++) { const L = 0.6 + h(k, r) * 0.9; if (h(r * 5 + k, 7) > 0.2) { g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, y - 0.42, Math.min(L, W2 - 0.1 - x), 0.36); g.fillRect(x + 0.2, y + 0.08, Math.min(L * 0.8, W2 - 0.3 - x), 0.36); } x += L + 0.15; }
  }
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
  forest(g, T, lod, x0 - m, y0 - m, x1 + m, y1 + m);
  if (S) airfields(g, S, x0 - m, y0 - m, x1 + m, y1 + m, lod);
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
  const fo = W.foreign.some(f => f.blocks.includes(b)), city = W.cities.find(c => c.blocks.includes(b)), town = fo || !!city, foreign = fo;
  const g = T.base.getContext('2d');
  g.save(); g.scale(IC.TS, IC.TS); block(g, b, 0, foreign, town, city); g.restore();
  dirtyUp(b.x - r, b.y - r, b.x + r, b.y + r);
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
  if (!T.base || zx < 0.16) { ctx.drawImage(T.base, 0, 0, IC.WW, IC.WH); return 0; }
  const lodWanted = zx >= 16 ? 4 : zx >= 4 ? 3 : zx >= 1.3 ? 2 : zx >= 0.42 ? 1 : 0;
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cam.vw / cam.z, vy1 = cam.y + cam.vh / cam.z;
  T.frame++;
  const t0 = performance.now();
  let made = 0;
  // the tiles of a level over the view, nearest the middle first, painted (within the budget) where missing or stale
  const paint = lod => {
    const L = LOD(lod);
    const cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2;
    const list = [];
    for (let ty = Math.floor(vy0 / L.size); ty <= Math.floor(vy1 / L.size); ty++) for (let tx = Math.floor(vx0 / L.size); tx <= Math.floor(vx1 / L.size); tx++) {
      if (tx < 0 || ty < 0 || tx * L.size >= IC.WW || ty * L.size >= IC.WH) continue;
      list.push([tx, ty, U.dxy((tx + 0.5) * L.size, (ty + 0.5) * L.size, cx, cy)]);
    }
    list.sort((a, b) => a[2] - b[2]);
    let missing = 0;
    const got = [];
    for (const [tx, ty] of list) {
      const key = lod + ':' + tx + ':' + ty;
      let t = T.tiles.get(key);
      if (performance.now() - t0 < budgetMs && (!t || t.dirty)) {
        const cv = paintTile(T, lod, tx, ty, S);
        if (t) { t.cv = cv; t.dirty = false; } else { t = { cv, lod, tx, ty, used: 0 }; T.tiles.set(key, t); }
        made++;
      }
      if (!t) { missing++; continue; }
      got.push(t);
    }
    return { L, got, missing };
  };
  // (a tile is drawn half a pixel over its neighbours, so no seam shows where nothing is drawn under it)
  const ov = 0.5 / zx;
  const draw = P => {
    for (const t of P.got) { t.used = T.frame; ctx.drawImage(t.cv, t.tx * P.L.size - ov, t.ty * P.L.size - ov, P.L.size + 2 * ov, P.L.size + 2 * ov); }
    // evict the least recently used
    const lod = P.L.k, mine = [...T.tiles.entries()].filter(([, t]) => t.lod === lod);
    if (mine.length > P.L.max) { mine.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < mine.length - P.L.max; i++) T.tiles.delete(mine[i][0]); }
  };
  // the level under it is painted first (ten to sixteen times fewer tiles): where a tile is still missing it shows the same
  // tone, where the base image alone would show a darker rectangle. Once the level wanted covers the view, it alone
  // is drawn: the screen is filled once, not three times
  const under = lodWanted ? paint(lodWanted - 1) : null, top = paint(lodWanted);
  if (top.missing) {
    if (!under || under.missing) ctx.drawImage(T.base, 0, 0, IC.WW, IC.WH);
    if (under) draw(under);
  }
  draw(top);
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
