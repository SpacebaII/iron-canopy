/* Iron Canopy — buildings with depth (brief 55): the plan of a city block, headless, in the block's own frame
   (units of 100 m from its centre, x along its width, y along its height), from the block's seed and its city's
   roof tones. The map paints the plan from above (terrain.js) and the 3D view builds it (models.js
   IC.blockBoxes), so they agree on every building. A plan is cached on the block (b._plan: not saved).

   P.ground   what the open ground of the block is: 'pave', 'grass', 'lawn', 'yard', 'ballast'
   P.lots     [{ x, y, w, h, k }] open ground of a kind: 'court', 'green', 'plaza', 'park' (cars), 'garden', 'yard',
              'pitch', 'platform', 'heli', 'play'
   P.lanes    [[x0, y0, x1, y1, w, k]] lanes, paths and sidings inside the block ('lane', 'path', 'rail', 'loop')
   P.bld      [{ x, y, w, h, ht, c, r, k }] buildings: centre, size, height (units), roof colour, roof kind ('pitch',
              'hip', 'flat', 'glass', 'rib', 'round', 'oval', 'spire', 'dome'), kind ('house', 'flats', 'corner',
              'tower', 'podium', 'office', 'church', 'school', 'shed', 'tank', 'wagon', 'station', 'bowl', ...)
   P.trees    [x, y, ...]

   Landmarks (IC.placeLandmarks, from cities.js): a block gets b.land ('station', 'cathedral', 'stadium', 'hospital',
   'university', 'ministry') and its plan is that building; the station's platforms run along the railway (b.ra),
   its forecourt faces the centre (b.face). A factory or warehouse block beside the railway gets a siding (b.sid). */
(function (IC) {
'use strict';
const U = IC.U;

/* roof tones by style: a city picks four of its style's and keeps them (with an odd one out now and then), so one
   town is terracotta and slate and the next brown and tar */
const TONES = {
  eu: [[178, 110, 86], [164, 98, 78], [186, 124, 92], [150, 100, 84], [120, 112, 108], [96, 100, 104], [196, 178, 150], [140, 92, 72]],
  us: [[120, 116, 112], [104, 98, 96], [150, 110, 90], [170, 160, 146], [88, 90, 92], [178, 110, 86], [132, 128, 120], [160, 150, 130]],
  new: [[184, 184, 178], [168, 170, 168], [200, 198, 190], [150, 152, 150], [176, 150, 120], [120, 130, 140], [190, 180, 160], [140, 136, 128]],
  ind: [[110, 104, 100], [128, 118, 108], [150, 100, 84], [96, 92, 90], [140, 136, 128], [164, 98, 78], [120, 118, 116], [100, 96, 96]],
  east: [[128, 124, 120], [112, 108, 104], [150, 110, 90], [140, 136, 128], [100, 96, 96], [160, 150, 130], [118, 114, 110], [136, 100, 80]]
};
const FLAT = [[184, 184, 178], [168, 170, 168], [200, 198, 190], [150, 152, 150]];
const GLASS = [120, 146, 170];
IC.ROOF_TONES = TONES;
/* a city's roof tones: four of its style's by its seed, in order (the first is the common one) */
IC.cityTones = function (c) {
  if (c && c._tones) return c._tones;
  const st = c && TONES[c.style] ? c.style : 'eu', L = TONES[st], id = c ? (c.id || 0) * 7919 + (c.name ? c.name.length : 0) : 1;
  const idx = [], all = L.map((_, i) => i);
  for (let k = 0; k < 4; k++) { const i = Math.floor(U.hash(id + k, 31) * all.length); idx.push(all.splice(i, 1)[0]); }
  const T = { roof: idx.map(i => L[i]), odd: L, id };
  if (c) c._tones = T;
  return T;
};
const tint = (c, v) => [Math.max(0, Math.min(255, c[0] + v)) | 0, Math.max(0, Math.min(255, c[1] + v)) | 0, Math.max(0, Math.min(255, c[2] + v)) | 0];
/* a roof colour from the tones: mostly the first, the others less, one in twelve an odd one out, each a little
   lighter or darker */
function roofOf(T, h1, h2) {
  const L = h1 < 0.08 ? T.odd : T.roof, w = h1 < 0.08 ? h1 / 0.08 : (h1 - 0.08) / 0.92;
  const i = L === T.roof ? (w < 0.45 ? 0 : w < 0.7 ? 1 : w < 0.88 ? 2 : 3) : Math.floor(w * L.length);
  return tint(L[i], (h2 - 0.5) * 24);
}
/* a length cut into parcels between lo and hi wide (the last one takes what is left, never under lo) */
function parcels(len, lo, hi, h, salt) {
  const out = []; let at = 0, k = 0;
  while (len - at > lo * 1.5) { const w = Math.min(lo + h(salt + k, 3) * (hi - lo), len - at); out.push(w); at += w; k++; }
  if (len - at > 0.01) { if (out.length) out[out.length - 1] += len - at; else out.push(len - at); }
  return out;
}

/* a perimeter block: parcels of different widths and depths round a courtyard, the corner buildings a floor taller
   with a flat or hipped roof, now and then a gap (a passage into the court). W2, H2 half sizes; the sides along x
   own the corners. o: { lo, hi } parcel widths, { d0, d1 } depths, { f0, f1 } floors, pitched share, pass share */
function perimeter(P, cx, cy, W2, H2, h, salt, T, o) {
  const dep = (s, i) => Math.min(o.d0 + h(salt + s * 50 + i, 5) * (o.d1 - o.d0), Math.min(W2, H2) * 0.8);
  // (brief 65: floors from the real samples of the form, lower away from the centre by the density gradient)
  const floors = (s, i) => o.real ? U.clamp(Math.round(IC.realFloors(o.real, h(salt + s * 70 + i, 9), [o.f0, o.f0, o.f1, o.f1, o.f1]) * (P.g || 1)), 2, o.f1) : o.f0 + Math.floor(h(salt + s * 70 + i, 9) * (o.f1 - o.f0 + 1));
  const put = (x, y, w, hh, s, i, corner) => {
    const fl = floors(s, i) + (corner ? 1 : 0), pitched = !corner && h(salt + s * 90 + i, 11) < o.pitched;
    const c = o.cols ? tint(o.cols[Math.floor(h(salt + s * 110 + i, 13) * o.cols.length)], (h(salt + s * 130 + i, 17) - 0.5) * 20) : roofOf(T, h(salt + s * 110 + i, 13), h(salt + s * 130 + i, 17));
    P.bld.push({ x: cx + x, y: cy + y, w, h: hh, ht: fl * (o.fh || 0.03) + (pitched ? 0.015 : 0.006), c: corner ? tint(c, -14) : c, r: pitched ? 'pitch' : corner && !o.cols && h(salt + i, 19) < 0.5 ? 'hip' : o.cols && h(salt + s * 150 + i, 21) < o.glass ? 'glass' : 'flat', k: o.cols ? 'office' : corner ? 'corner' : 'flats' });
  };
  const dT = dep(0, 0), dB = dep(1, 0), dL = dep(2, 0), dR = dep(3, 0);
  // along x: the top and bottom sides, corners included
  for (const [s, y0, d] of [[0, -H2, dT], [1, H2 - dB, dB]]) {
    const ws = parcels(W2 * 2, o.lo, o.hi, h, salt + s * 7); let x = -W2;
    ws.forEach((w, i) => { const corner = i === 0 || i === ws.length - 1, gap = !corner && ws.length > 3 && h(salt + s * 33 + i, 23) < o.pass; if (!gap) put(x + w / 2, y0 + d / 2, w - 0.008, d, s, i, corner); x += w; });
  }
  // along y: between the corners
  for (const [s, x0, d] of [[2, -W2, dL], [3, W2 - dR, dR]]) {
    const len = H2 * 2 - dT - dB; if (len < o.lo * 0.8) continue;
    const ws = parcels(len, o.lo, o.hi, h, salt + s * 7); let y = -H2 + dT;
    ws.forEach((w, i) => { const gap = ws.length > 3 && h(salt + s * 33 + i, 23) < o.pass; if (!gap) put(x0 + d / 2, y + w / 2, d, w - 0.008, s, i, false); y += w; });
  }
  // the court: paved in the old town, a garden with a tree or two elsewhere
  const cw = W2 * 2 - dL - dR, ch = H2 * 2 - dT - dB;
  if (cw > 0.04 && ch > 0.04) {
    P.lots.push({ x: cx + (dL - dR) / 2, y: cy + (dT - dB) / 2, w: cw, h: ch, k: o.court });
    if (o.court === 'green' && cw > 0.1 && ch > 0.1) P.trees.push(cx + (dL - dR) / 2 + (h(salt, 29) - 0.5) * cw * 0.5, cy + (dT - dB) / 2 + (h(salt, 31) - 0.5) * ch * 0.5);
  }
}
/* the block cut into cells by lanes (a face the streets left large), each cell planned on its own */
function cells(b, S, st, fn) {
  const n = Math.max(1, Math.round(b.w / S)), m = Math.max(1, Math.round(b.h / S)), cw = b.w / n, ch = b.h / m, W2 = b.w / 2, H2 = b.h / 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) fn(-W2 + (i + 0.5) * cw, -H2 + (j + 0.5) * ch, (cw - st) / 2, (ch - st) / 2, i, j);
  return { n, m, cw, ch };
}
function laneGrid(P, b, G, st, k) {
  const W2 = b.w / 2, H2 = b.h / 2;
  for (let i = 1; i < G.n; i++) P.lanes.push([-W2 + i * G.cw, -H2, -W2 + i * G.cw, H2, st, k || 'lane']);
  for (let j = 1; j < G.m; j++) P.lanes.push([-W2, -H2 + j * G.ch, W2, -H2 + j * G.ch, st, k || 'lane']);
}
const box = (P, x, y, w, h, ht, c, r, k) => { P.bld.push({ x, y, w, h, ht, c, r: r || 'flat', k: k || 'bld' }); };
const lot = (P, x, y, w, h, k) => { P.lots.push({ x, y, w, h, k }); };

/* ---------- the forms ---------- */
const FORMS = {};
FORMS.old = (P, b, h, T) => {
  // the old town: small parcels, three or four floors, tiled roofs, paved courts; a church on its own in some
  const W2 = b.w / 2, H2 = b.h / 2, small = Math.min(b.w, b.h);
  if (small > 0.45 && small < 1.0 && h(1, 41) < 0.07) return FORMS.church(P, b, h, T);
  P.ground = 'pave';
  const o = { lo: 0.07, hi: 0.17, d0: 0.08, d1: 0.14, f0: 3, f1: 7, real: 'old', pitched: 0.9, pass: 0.08, court: 'court' };
  if (small < 0.5) { perimeter(P, 0, 0, W2, H2, h, 1, T, o); return; }
  const G = cells(b, 0.6, 0.05, (cx, cy, w2, h2, i, j) => perimeter(P, cx, cy, w2, h2, h, 1 + i * 13 + j * 101, T, o));
  laneGrid(P, b, G, 0.05);
};
FORMS.court = (P, b, h, T) => {
  // perimeter blocks of flats: bigger parcels, four to six floors, gardens in the courts
  const W2 = b.w / 2, H2 = b.h / 2, small = Math.min(b.w, b.h);
  if (small > 0.8 && h(1, 43) < 0.04) return FORMS.school(P, b, h, T);
  P.ground = 'pave';
  const o = { lo: 0.12, hi: 0.3, d0: 0.11, d1: 0.17, f0: 4, f1: 8, real: 'court', pitched: 0.65, pass: 0.06, court: 'green' };
  if (small < 1.0) { perimeter(P, 0, 0, W2, H2, h, 2, T, o); return; }
  const G = cells(b, 0.9, 0.08, (cx, cy, w2, h2, i, j) => perimeter(P, cx, cy, w2, h2, h, 2 + i * 13 + j * 101, T, o));
  laneGrid(P, b, G, 0.08);
};
FORMS.church = (P, b, h) => {
  // a parish church in its yard: the nave along the block, the tower at its west end, a paved close round it
  const W2 = b.w / 2, H2 = b.h / 2, along = b.w >= b.h, L = Math.min(along ? b.w : b.h, 0.6) * 0.7, Wd = Math.min(along ? b.h : b.w, 0.4) * 0.45;
  P.ground = 'pave'; lot(P, 0, 0, b.w, b.h, 'green');
  if (along) { box(P, 0.03, 0, L, Wd, 0.14, [120, 104, 92], 'pitch', 'church'); box(P, -L / 2 + 0.03, 0, Wd * 0.45, Wd * 0.45, 0.32, [140, 132, 120], 'spire', 'tower'); }
  else { box(P, 0, 0.03, Wd, L, 0.14, [120, 104, 92], 'pitch', 'church'); box(P, 0, -L / 2 + 0.03, Wd * 0.45, Wd * 0.45, 0.32, [140, 132, 120], 'spire', 'tower'); }
  for (let q = 0; q < 4; q++) P.trees.push((h(q, 7) - 0.5) * (b.w - 0.1), (q < 2 ? -1 : 1) * (H2 - 0.06));
  void W2;
};
FORMS.school = (P, b, h, T) => {
  // a school: two long low buildings, a paved playground, a pitch
  const W2 = b.w / 2, H2 = b.h / 2;
  P.ground = 'lawn';
  const c = roofOf(T, 0.5, h(3, 3));
  box(P, -W2 + 0.2, -H2 + 0.12, 0.36, 0.09, 0.07, c, 'flat', 'school'); box(P, -W2 + 0.2, -H2 + 0.3, 0.36, 0.09, 0.07, c, 'flat', 'school');
  lot(P, -W2 + 0.2, H2 - 0.2, 0.36, 0.3, 'play');
  if (b.w > 0.9) lot(P, W2 - 0.3, 0, 0.5, Math.min(0.8, b.h - 0.1), 'pitch');
  P.trees.push(-W2 + 0.05, 0, W2 - 0.05, -H2 + 0.1);
};
/* office stone, brick, concrete and dark glass for a downtown street (brief 68) */
const OFFICE = [[196, 188, 172], [178, 170, 158], [160, 104, 84], [206, 204, 198], [120, 128, 136], [150, 146, 138], [188, 176, 150], [96, 106, 118]];
/* a tower in tiers (brief 68): a base, one or two set-back storeys of it, a crown; each tier stands on the one below
   (q.on, its index), so the map draws it on that roof and the 3D view builds it */
function tiers(P, x, y, w, hh, fl, c, glass, h, salt) {
  const n = fl > 30 ? 3 : fl > 14 ? 2 : 1;
  let base = -1, z = 0, k = 1;
  for (let t = 0; t < n; t++) {
    const top = fl * (t === n - 1 ? 1 : 0.45 + t * 0.3 + h(salt + t, 5) * 0.1), ht = top * 0.034;
    if (t) k *= 0.72 + h(salt + t, 6) * 0.14;
    const q = { x, y, w: w * k, h: hh * k, ht, c: t ? tint(c, 8 * t) : c, r: glass ? 'glass' : 'flat', k: 'tower' };
    if (base >= 0) { q.on = base; q.z0 = z; }
    base = P.bld.length; P.bld.push(q); z = ht;
  }
  // the crown: a plant storey, a spire on the tallest
  const top = P.bld[base], cr = { x, y, w: top.w * 0.4, h: top.h * 0.4, ht: z + 0.035, c: tint(c, -20), r: 'flat', k: 'tower', on: base, z0: z };
  P.bld.push(cr);
  if (fl > 40 && h(salt, 9) < 0.5) P.bld.push({ x, y, w: 0.012, h: 0.012, ht: z + 0.035 + 0.12, c: [200, 200, 200], r: 'flat', k: 'mast', on: P.bld.length - 1, z0: z + 0.035 });
}
FORMS.tower = (P, b, h, T) => {
  // downtown (brief 68): each plot is a street wall of offices of six to fourteen floors round a court, the corners
  // a floor or two taller, and in most a tower rising out of the court in tiers; now and then a plaza, a
  // multi-storey car park or a tower standing on its own plaza
  P.ground = 'pave';
  const one = Math.round(b.w / 1.3) <= 1 && Math.round(b.h / 1.3) <= 1;   // (a block of one plot always builds on it)
  const gt = P.gt || 1, f1 = Math.round(8 + 8 * gt);
  const G = cells(b, 1.3, 0.14, (cx, cy, w2, h2, i, j) => {
    const k = one || (i === 0 && j === 0) ? 0.16 + h(i, j) * 0.84 : h(i, j), salt = 3 + i * 17 + j * 131;
    if (k < 0.08) { box(P, cx, cy, w2 * 1.8, h2 * 1.8, 0.12, [138, 138, 134], 'flat', 'carpark'); lot(P, cx, cy, w2 * 2, h2 * 2, 'plaza'); return; }
    if (k < 0.16) { lot(P, cx, cy, w2 * 2, h2 * 2, 'plaza'); for (let q = 0; q < 5; q++) P.trees.push(cx + (h(q, i + 3) - 0.5) * w2 * 1.6, cy + (h(q + 9, j) - 0.5) * h2 * 1.6); return; }
    const fl = Math.max(10, IC.realFloors('tower', h(salt, 7), [7, 14, 30, 43, 67]) * gt), glass = h(salt, 8) < 0.6;
    const col = glass ? tint(GLASS, h(salt, 10) * 30 - 10) : tint(OFFICE[Math.floor(h(salt, 11) * OFFICE.length)], 0);
    if (k > 0.86) {
      // a tower on its own plaza, set back from the street
      lot(P, cx, cy, w2 * 2, h2 * 2, 'plaza');
      tiers(P, cx, cy, w2 * (1.1 + h(salt, 12) * 0.4), h2 * (1.1 + h(salt, 13) * 0.4), fl * 1.2, col, glass, h, salt);
      for (let q = 0; q < 6; q++) P.trees.push(cx + (q % 2 ? -1 : 1) * w2 * 0.85, cy + (q / 6 - 0.4) * h2 * 1.8);
      return;
    }
    perimeter(P, cx, cy, w2, h2, h, salt, T, { lo: 0.18, hi: 0.42, d0: 0.16, d1: 0.26, f0: 6, f1, fh: 0.034, pitched: 0, pass: 0.04, court: 'court', cols: OFFICE, glass: 0.2 });
    // the tower out of the court, when the court is big enough to hold one
    if (k > 0.3 && w2 > 0.32 && h2 > 0.32) tiers(P, cx + (h(salt, 14) - 0.5) * w2 * 0.3, cy + (h(salt, 15) - 0.5) * h2 * 0.3, (w2 - 0.24) * 1.6, (h2 - 0.24) * 1.6, fl, col, glass, h, salt);
  });
  laneGrid(P, b, G, 0.14);
};
FORMS.office = (P, b, h, T) => {
  // a business park: low offices on lawns, each with its car park
  P.ground = 'lawn';
  cells(b, 1.6, 0.3, (cx, cy, w2, h2, i, j) => {
    lot(P, cx, cy + h2 * 0.55, w2 * 2, h2 * 0.9, 'park');
    box(P, cx, cy - h2 * 0.5, w2 * 1.6, h2 * 0.7, Math.max(2, IC.realFloors('office', h(i, j), [1, 2, 3, 5, 7])) * 0.034, tint(FLAT[(i + j) % 4], 0), 'flat', 'office');
    P.trees.push(cx - w2 * 0.9, cy, cx + w2 * 0.9, cy, cx, cy - h2 * 0.95);
  });
  void T;
};
FORMS.slab = (P, b, h, T) => {
  // a post-war estate: long slabs of flats in green space, set at right angles, a point block here and there
  P.ground = 'grass';
  const G = cells(b, 1.9, 0.1, (cx, cy, w2, h2, i, j) => {
    const k = h(i, j), c = tint(FLAT[Math.floor(k * 4)], 6);
    // (floors from the real estates, Marzahn to Petrzalka: slabs of five to eleven, a point block of twelve to eighteen)
    const fl = u => Math.round(IC.realFloors('slab', u, [2, 6, 10, 13, 18])) * 0.029;
    if (k < 0.5) for (let q = 0; q < 3; q++) box(P, cx, cy - h2 + h2 * 2 * (0.2 + q * 0.3), w2 * 1.5, 0.16, fl(0.4 + h(q, i) * 0.4), c, 'flat', 'flats');
    else { const f0 = fl(0.4 + h(i, j + 5) * 0.4); box(P, cx - w2 * 0.6, cy, 0.16, h2 * 1.6, f0, c, 'flat', 'flats'); box(P, cx + w2 * 0.1, cy, 0.16, h2 * 1.6, f0, c, 'flat', 'flats'); if (k > 0.8) box(P, cx + w2 * 0.65, cy - h2 * 0.2, 0.3, 0.3, fl(0.85 + h(j, i + 3) * 0.15), c, 'flat', 'tower'); }
    for (let q = 0; q < 4; q++) P.trees.push(cx - w2 + w2 * 2 * h(q, i + 9), cy - h2 + h2 * 2 * h(j + 9, q));
    P.lanes.push([cx - w2, cy + h2 * 0.95, cx + w2, cy + h2 * 0.95, 0.03, 'path']);
  });
  laneGrid(P, b, G, 0.1, 'path');
  void T;
};
/* the streets of a housing block (brief 68), in its own frame: along its longer side, one every 100 m between
   houses or 62 m between terraces, each from edge to edge (cities.js makes them streets of the city, run on to the
   street round the block, so every front door is on a street a car can drive); a block too narrow for one faces
   its houses out to the streets round it. rows: the lines of plots, each a front line v0 along the street, the way
   into the plot s (±1) and the plot's depth */
IC.resLanes = function (b) {
  const sw = b.h > b.w * 1.15, Lw = sw ? b.h : b.w, Lh = sw ? b.w : b.h, step = b.f === 'row' ? 0.62 : 1.0, F0 = IC.ROAD_SPEC.st.w / 2 + 0.02;
  const nl = Lh < step * 0.9 ? 0 : Math.max(1, Math.round(Lh / step)), lh = nl ? Lh / nl : Lh, lanes = [], rows = [];
  for (let r = 0; r < nl; r++) {
    const v = -Lh / 2 + (r + 0.5) * lh;
    lanes.push(sw ? [v, -Lw / 2, v, Lw / 2] : [-Lw / 2, v, Lw / 2, v]);
    rows.push({ v0: v - F0, s: -1, d: lh / 2 - F0, r: r * 2 }, { v0: v + F0, s: 1, d: lh / 2 - F0, r: r * 2 + 1 });
  }
  if (!nl) rows.push({ v0: -Lh / 2, s: 1, d: Lh / 2, r: 0 }, { v0: Lh / 2, s: -1, d: Lh / 2, r: 1 });
  return { sw, Lw, Lh, nl, lh, lanes, rows };
};
/* a housing form's plots along its rows, in (u along the street, v across) turned into the block's frame */
function resFrame(P, b) {
  const R = IC.resLanes(b), sw = R.sw;
  R.box = (u, v, wu, wv, ht, c, r, k) => box(P, sw ? v : u, sw ? u : v, sw ? wv : wu, sw ? wu : wv, ht, c, r, k);
  R.lot = (u, v, wu, wv, k) => lot(P, sw ? v : u, sw ? u : v, sw ? wv : wu, sw ? wu : wv, k);
  R.line = (u0, v0, u1, v1, w, k) => P.lanes.push(sw ? [v0, u0, v1, u1, w, k] : [u0, v0, u1, v1, w, k]);
  R.tree = (u, v) => P.trees.push(sw ? v : u, sw ? u : v);
  // the streets themselves, run on past the block's edge to the street round it (the tiles paint blocks over streets)
  for (const L of R.lanes) P.lanes.push(sw ? [L[0], L[1] - 0.16, L[2], L[3] + 0.16, IC.ROAD_SPEC.st.w, 'street'] : [L[0] - 0.16, L[1], L[2] + 0.16, L[3], IC.ROAD_SPEC.st.w, 'street']);
  return R;
}
FORMS.row = (P, b, h, T) => {
  // terraces: runs of four to nine houses in one tone along the street, small front yards, a back extension on
  // some, long narrow gardens behind with a fence between each
  P.ground = 'grass';
  const R = resFrame(P, b), L2 = R.Lw / 2;
  for (const w of R.rows) {
    const ws = parcels(R.Lw - 0.06, 0.05, 0.075, h, w.r * 9 + 1), fy = 0.012 + h(w.r, 3) * 0.02, dep = 0.085 + h(w.r, 4) * 0.025;
    let u = -L2 + 0.03, run = 0, c = null, gap = false;
    ws.forEach((pw, i) => {
      if (run <= 0) { run = 4 + Math.floor(h(w.r + i, 7) * 6); c = roofOf(T, h(w.r * 3 + i, 5), h(i, w.r)); gap = i > 0 && h(w.r * 5 + i, 13) < 0.5; }
      const uc = u + pw / 2, vh = w.v0 + w.s * (fy + dep / 2), back = w.d - fy - dep;
      if (gap) { R.line(u, w.v0, u, w.v0 + w.s * w.d, 0.012, 'path'); gap = false; }   // (a path between runs to the backs)
      else if (back > -0.01) {
        R.box(uc, vh, pw - 0.003, back > 0 ? dep : dep + back, 0.078 + h(i, w.r) * 0.012, c, 'pitch', 'house');
        if (back > 0.08 && h(i + w.r * 31, 17) < 0.55) R.box(u + pw * 0.3, w.v0 + w.s * (fy + dep + 0.025), pw * 0.45, 0.05, 0.05, tint(c, -8), 'pitch', 'house');
        if (back > 0.01) R.lot(uc, w.v0 + w.s * (w.d - back / 2), pw - 0.004, back - 0.004, 'garden');
        R.line(u, w.v0 + w.s * (fy + dep), u, w.v0 + w.s * w.d, 0.004, 'fence');
        if (h(i, w.r + 21) < 0.2) R.tree(uc, w.v0 + w.s * (w.d - back * 0.4));
      }
      run--; u += pw;
    });
    R.line(-L2 + 0.03, w.v0 + w.s * w.d, L2 - 0.03, w.v0 + w.s * w.d, 0.004, 'fence');
  }
};
FORMS.house = (P, b, h, T) => {
  // detached houses on their plots: a front garden, a drive to the garage beside the house, a back garden with a
  // shed, a tree or a pool (in the bigger suburbs), fences between the plots
  P.ground = 'grass';
  const R = resFrame(P, b), L2 = R.Lw / 2, big = b.sub, lo = big ? 0.16 : 0.12, hi = big ? 0.26 : 0.2;
  for (const w of R.rows) {
    const ws = parcels(R.Lw - 0.04, lo, hi, h, w.r * 9 + 2);
    let u = -L2 + 0.02;
    ws.forEach((pw, i) => {
      const k = h(i + w.r * 50, 3), uc = u + pw / 2, fg = 0.035 + h(i, w.r + 1) * 0.04, D = Math.min(w.d, 0.6);
      const hw = Math.min(pw - 0.06, 0.09 + h(i, w.r + 2) * 0.06), hd = 0.08 + h(i, w.r + 3) * 0.04, side = h(i, w.r + 4) < 0.5 ? -1 : 1;
      R.line(u, w.v0, u, w.v0 + w.s * D, 0.004, 'fence');
      if (k < (big ? 0.12 : 0.04) || D < fg + hd + 0.04) { R.lot(uc, w.v0 + w.s * D / 2, pw - 0.004, D - 0.004, 'garden'); u += pw; return; }   // (a garden with no house yet)
      const c = roofOf(T, h(w.r * 3 + i, 5), h(i, w.r + 6)), hu = uc - side * (pw - hw) * 0.22, vh = w.v0 + w.s * (fg + hd / 2), back = D - fg - hd;
      R.box(hu, vh, hw, hd, 0.055 + h(i, w.r + 7) * 0.025, c, h(i + w.r, 8) < 0.65 ? 'pitch' : 'hip', 'house');
      // a wing at the back now and then (an L), lower than the house
      if (h(i, w.r + 9) < 0.3) R.box(hu + side * hw * 0.2, vh + w.s * (hd / 2 + 0.025), hw * 0.5, 0.05, 0.045, tint(c, -6), 'hip', 'house');
      // the garage beside the house, its drive from the street; or a drive to a pad at the side
      const gu = hu + side * (hw / 2 + 0.03);
      if (Math.abs(gu - uc) + 0.03 < pw / 2) {
        if (h(i, w.r + 10) < 0.6) R.box(gu, w.v0 + w.s * (fg + 0.03), 0.05, 0.06, 0.03, tint(c, -16), 'flat', 'garage');
        R.lot(gu, w.v0 + w.s * fg / 2, 0.04, fg, 'drive');
      }
      if (back > 0.06) {
        R.lot(uc, w.v0 + w.s * (D - back / 2), pw - 0.004, back - 0.004, 'garden');
        if (big && h(i, w.r + 11) < 0.2 && back > 0.16) R.lot(uc + side * 0.02, w.v0 + w.s * (fg + hd + 0.06), 0.06, 0.035, 'pool');
        else if (h(i, w.r + 12) < 0.35 && back > 0.12) R.box(uc - side * (pw / 2 - 0.035), w.v0 + w.s * (D - 0.04), 0.03, 0.03, 0.025, [140, 128, 110], 'pitch', 'shed');
        R.tree(uc + (h(i, 13) - 0.5) * pw * 0.6, w.v0 + w.s * (D - back * (0.3 + h(i, 14) * 0.3)));
        if (h(i, w.r + 15) < 0.4) R.tree(uc + (h(i, 16) - 0.5) * pw * 0.7, w.v0 + w.s * (D - 0.025));
      }
      if (h(i, w.r + 17) < 0.25) R.tree(uc - side * pw * 0.3, w.v0 + w.s * fg * 0.5);
      u += pw;
    });
    R.line(-L2 + 0.02, w.v0 + w.s * Math.min(w.d, 0.6), L2 - 0.02, w.v0 + w.s * Math.min(w.d, 0.6), 0.004, 'fence');
  }
};
FORMS.cul = (P, b, h, T) => {
  // an estate of closes (brief 54, IC.culPlan): the loop, the way in and the closes with their turning heads, and
  // the houses facing them on their plots (brief 68), each turned to its street, a garden behind, a drive in front
  P.ground = 'grass';
  const C = IC.culPlan(b), sw = IC.ROAD_SPEC.st.w, rd = (L) => { for (let q = 1; q < L.length; q++) P.lanes.push([L[q - 1][0], L[q - 1][1], L[q][0], L[q][1], sw, 'street']); };
  if (C.ring) rd(C.ring);
  rd([[C.entry[0], C.entry[1]], [C.entry[2], C.entry[3]]]);
  for (const c of C.closes) rd([[c[0], c[1]], [c[2], c[3]]]);
  P.heads = C.heads.map(([x, y]) => [x, y, sw * 0.9]);
  // a big loop has a green in the middle: a path round it, a playground, trees
  if (C.ring && C.rx > 0.6 && C.ry > 0.6) {
    const gw = (C.rx - 0.38) * 2, gh = (C.ry - 0.38) * 2;
    lot(P, C.ox, C.oy, gw, gh, 'green'); lot(P, C.ox + gw * 0.25, C.oy - gh * 0.2, 0.08, 0.06, 'play');
    P.lanes.push([C.ox - gw / 2 + 0.03, C.oy, C.ox + gw / 2 - 0.03, C.oy, 0.012, 'path'], [C.ox, C.oy - gh / 2 + 0.03, C.ox, C.oy + gh / 2 - 0.03, 0.012, 'path']);
    for (let q = 0; q < Math.min(14, gw * gh * 10); q++) P.trees.push(C.ox + (h(q, 31) - 0.5) * gw * 0.9, C.oy + (h(q, 33) - 0.5) * gh * 0.9);
  }
  for (const o of IC.culHouses(b)) {
    const k = h(o.k, 11); if (k < 0.08) continue;
    const ca = Math.cos(o.a), sa = Math.sin(o.a), off = (d, u) => [o.x - sa * d + ca * (u || 0), o.y + ca * d + sa * (u || 0)];   // (d: away from the street)
    const c = roofOf(T, h(o.k, 5), h(o.k, 6)), hw = 0.1 + h(o.k, 7) * 0.04, hd = 0.08 + h(o.k, 8) * 0.03;
    const [gx, gy] = off(0.08); P.lots.push({ x: gx, y: gy, w: 0.19, h: 0.16, a: o.a, k: 'garden' });
    const [dx, dy] = off(-0.075, hw / 2 + 0.01); P.lots.push({ x: dx, y: dy, w: 0.035, h: 0.05, a: o.a, k: 'drive' });
    P.bld.push({ x: o.x, y: o.y, w: hw, h: hd, a: o.a, ht: 0.055 + h(o.k, 9) * 0.025, c, r: h(o.k, 10) < 0.6 ? 'pitch' : 'hip', k: 'house' });
    if (k > 0.55) { const [tx, ty] = off(0.14, (h(o.k, 12) - 0.5) * 0.12); P.trees.push(tx, ty); }
  }
};
FORMS.shed = (P, b, h) => {
  // factories: sheds with ribbed roofs, tanks, stacks and yards; a siding from the railway where there is one
  P.ground = 'yard';
  cells(b, 1.5, 0.16, (cx, cy, w2, h2, i, j) => {
    const k = h(i, j);
    if (k < 0.22) { for (let q = 0; q < 3; q++) box(P, cx - w2 + w2 * 2 * (0.2 + q * 0.3), cy, Math.min(w2, h2) * 0.26, Math.min(w2, h2) * 0.26, 0.09, [206, 206, 200], 'round', 'tank'); return; }
    const sw = w2 * 2 * (0.6 + k * 0.35), sh = h2 * 2 * (0.55 + h(j, i) * 0.4), col = k < 0.6 ? [168, 172, 176] : k < 0.85 ? [140, 150, 160] : [150, 120, 100];
    box(P, cx - w2 + sw / 2, cy - h2 + sh / 2, sw, sh, 0.08 + h(i, j + 1) * 0.04, col, 'rib', 'shed');
    if (k > 0.9) box(P, cx - w2 + sw + 0.04, cy - h2 + 0.04, 0.05, 0.05, 0.3, [160, 90, 70], 'round', 'stack');
  });
  siding(P, b);
};
FORMS.ware = (P, b, h) => {
  // warehouses: long white sheds, docks along one side, trailers waiting in the yard
  P.ground = 'yard';
  cells(b, 2.2, 0.24, (cx, cy, w2, h2, i, j) => {
    lot(P, cx, cy, w2 * 2, h2 * 2, 'yard');
    box(P, cx, cy - h2 * 0.45, w2 * 2, h2 * 1.1, 0.1, h(i, j) < 0.7 ? [214, 214, 210] : [170, 176, 184], 'flat', 'ware');
    for (let q = -w2 + 0.1, n = 0; q < w2 - 0.1; q += 0.16, n++) if (h(q * 50 | 0, j) < 0.65) box(P, cx + q, cy + h2 * 0.3, 0.025, 0.14, 0.035, h(j, i + n) < 0.5 ? [230, 230, 226] : [186, 76, 60], 'flat', 'trailer');
  });
  siding(P, b);
};
FORMS.yard = (P, b, h) => {
  // a goods yard: tracks fanning out along the line, wagons standing on them, a goods shed
  P.ground = 'ballast';
  const W2 = b.w / 2, H2 = b.h / 2, nT = Math.max(3, Math.round(b.h / 0.09)), ca = b.ra != null ? b.ra : 0;
  for (let q = 0; q < nT; q++) {
    const y = -H2 + (q + 0.5) * b.h / nT, e = Math.abs(y) / H2 * 0.8;
    P.lanes.push([-W2 + e, y, W2 - e, y, 0.045, 'rail']);
    for (let x = -W2 + Math.min(0.9, W2 * 0.4), k = 0; x < W2 - Math.min(0.9, W2 * 0.4) - 0.15; x += 0.17, k++) if (h(q, k >> 3) < 0.55) box(P, x + 0.075, y, 0.15, 0.05, 0.035, [[120, 70, 56], [90, 96, 100], [150, 140, 120]][(q + (k >> 3)) % 3], 'flat', 'wagon');
  }
  // the goods shed at one end, with its own track beside it
  const gw = Math.min(0.6, b.w * 0.3), gh = Math.min(0.2, b.h * 0.3);
  box(P, W2 - gw / 2 - 0.04, 0, gw, gh, 0.08, [150, 140, 126], 'rib', 'shed');
  void ca;
};
FORMS.mall = (P, b, h) => {
  // a strip mall: a big box, a row of shops, a pad at the corner, the car park in front
  const W2 = b.w / 2, H2 = b.h / 2;
  P.ground = 'pave'; lot(P, 0, 0, b.w, b.h, 'park');
  box(P, -W2 + 0.2 + b.w * 0.25, -H2 + 0.2 + b.h * 0.15, b.w * 0.5, b.h * 0.3, 0.09, [196, 194, 186], 'flat', 'mall');
  box(P, -W2 + 0.2 + b.w * 0.55 + b.w * 0.175, -H2 + 0.2 + b.h * 0.07, b.w * 0.35, b.h * 0.14, 0.05, [170, 160, 150], 'flat', 'shops');
  box(P, W2 - 0.85, H2 - 0.62, 0.5, 0.35, 0.04, [180, 120, 90], 'flat', 'pad');
  P.trees.push(-W2 + 0.3, H2 - 0.3, 0, H2 - 0.3, W2 - 0.3, -H2 + 0.3);
  void h;
};
/* a siding: a turnout off the main line, a curve across the corridor to the yard's edge, then a track along the
   yard parallel to the line, with a wagon or two on it */
function siding(P, b) {
  if (!b.sid) return;
  const W2 = b.w / 2, H2 = b.h / 2, a = b.sid.a, dx = Math.cos(a), dy = Math.sin(a), px = b.sid.px, py = b.sid.py;
  // which way along the line the siding leaves: towards the block's middle
  const sg = (-px * dx - py * dy) >= 0 ? 1 : -1, cl = (x, y) => [U.clamp(x, -W2 + 0.15, W2 - 0.15), U.clamp(y, -H2 + 0.15, H2 - 0.15)];
  // the corridor's width, the block's reach along the line; the turnout and the curve each take some of that reach
  const g = Math.hypot(px - U.clamp(px, -W2, W2), py - U.clamp(py, -H2, H2)), ext = Math.abs(dx) * W2 + Math.abs(dy) * H2, run = Math.min(Math.max(0.3, g * 1.5), ext * 0.25), diag = Math.min(g * 1.5, ext * 0.25);
  const tx = px + dx * sg * run, ty = py + dy * sg * run, E = cl(tx + dx * sg * diag, ty + dy * sg * diag), F = cl(E[0] + dx * sg * ext, E[1] + dy * sg * ext);
  const L = Math.hypot(F[0] - E[0], F[1] - E[1]); if (L < 0.3) return;   // (no room for a track along the yard)
  P.lanes.push([px, py, tx, ty, 0.045, 'rail'], [tx, ty, E[0], E[1], 0.045, 'rail'], [E[0], E[1], F[0], F[1], 0.045, 'rail']);
  for (let q = 0.2; q < L - 0.15; q += 0.2) if (U.hash(Math.round(q * 20) + Math.floor(b.seed), 5) < 0.4) P.bld.push({ x: E[0] + dx * sg * q, y: E[1] + dy * sg * q, w: 0.15, h: 0.05, a, ht: 0.035, c: [120, 70, 56], r: 'flat', k: 'wagon' });
}
/* ---------- landmarks ---------- */
const LAND = {};
LAND.station = (P, b, h) => {
  // platforms along the railway, the tracks between them, the station building on the side towards the centre with
  // a forecourt (a bus loop, taxis, trees) and a car park beyond it
  // (the platforms take the block's whole reach along the line)
  const W2 = b.w / 2, H2 = b.h / 2, a = b.ra || 0, ca = Math.cos(a), sa = Math.sin(a), L = Math.min(2.4, (Math.abs(ca) * b.w + Math.abs(sa) * b.h) * 0.85);
  const f = b.face != null ? b.face : a + Math.PI / 2, fx = Math.cos(f), fy = Math.sin(f);
  // the forecourt is on the centre's side of the tracks: the tracks sit a little the other way
  const off = -0.05, tx = fx * off, ty = fy * off, nx = -sa, ny = ca, sgn = (nx * fx + ny * fy) >= 0 ? 1 : -1;
  P.ground = 'pave';
  for (let q = -1; q <= 1; q++) { const o = q * 0.04; P.lanes.push([tx - ca * L / 2 + nx * o, ty - sa * L / 2 + ny * o, tx + ca * L / 2 + nx * o, ty + sa * L / 2 + ny * o, 0.02, 'rail']); }
  for (const o of [-0.06, 0.06]) P.lots.push({ x: tx + nx * o, y: ty + ny * o, w: L * 0.8, h: 0.025, a, k: 'platform' });
  const sx = tx + nx * sgn * 0.12, sy = ty + ny * sgn * 0.12;
  P.bld.push({ x: sx, y: sy, w: L * 0.45, h: 0.09, a, ht: 0.14, c: [150, 142, 128], r: 'hip', k: 'station' });
  P.bld.push({ x: sx + ca * L * 0.3, y: sy + sa * L * 0.3, w: L * 0.12, h: 0.06, a, ht: 0.06, c: [160, 152, 140], r: 'flat', k: 'kiosk' });
  P.bld.push({ x: tx, y: ty, w: L * 0.7, h: 0.17, a, ht: 0.07, c: [120, 124, 128], r: 'flat', k: 'canopy' });
  const px = tx + nx * sgn * 0.26, py = ty + ny * sgn * 0.26;
  P.lots.push({ x: px, y: py, w: L * 0.7, h: 0.18, a, k: 'plaza' });
  P.lanes.push([px - ca * L * 0.2, py - sa * L * 0.2, px + ca * L * 0.2, py + sa * L * 0.2, 0.05, 'loop']);
  for (let q = -2; q <= 2; q++) P.trees.push(px + ca * q * L * 0.12 + nx * sgn * 0.07, py + sa * q * L * 0.12 + ny * sgn * 0.07);
  P.lots.push({ x: tx + nx * sgn * 0.4, y: ty + ny * sgn * 0.4, w: L * 0.5, h: 0.1, a, k: 'park' });
  void W2; void H2; void h;
};
LAND.cathedral = (P, b, h) => {
  // a cathedral: a cross-shaped nave with two west towers, in a paved close with trees
  // (it takes most of its block: a close of pale stone round a pale lead roof)
  const along = b.w >= b.h, L = Math.min(along ? b.w : b.h, 1.2) * 0.84, Wd = Math.min(along ? b.h : b.w, 0.8) * 0.5;
  P.ground = 'pave'; lot(P, 0, 0, b.w, b.h, 'plaza');
  const nave = along ? [0.02, 0, L, Wd * 0.6] : [0, 0.02, Wd * 0.6, L], tr = along ? [L * 0.2, 0, Wd * 0.35, Wd * 1.7] : [0, L * 0.2, Wd * 1.7, Wd * 0.35];
  box(P, nave[0], nave[1], nave[2], nave[3], 0.28, [168, 164, 156], 'pitch', 'church'); box(P, tr[0], tr[1], tr[2], tr[3], 0.26, [168, 164, 156], 'pitch', 'church');
  for (const s of [-1, 1]) { const t = along ? [-L / 2 + 0.07, s * Wd * 0.22] : [s * Wd * 0.22, -L / 2 + 0.07]; box(P, t[0], t[1], Wd * 0.3, Wd * 0.3, 0.6, [150, 146, 138], 'spire', 'tower'); }
  for (let q = 0; q < 6; q++) P.trees.push((h(q, 7) - 0.5) * (b.w - 0.12), (q < 3 ? -1 : 1) * (b.h / 2 - 0.07));
};
LAND.stadium = (P, b, h) => {
  // a stadium: the bowl round its pitch, car parks about it
  const W2 = b.w / 2, H2 = b.h / 2, rx = Math.min(W2 * 0.55, 0.9), ry = Math.min(H2 * 0.55, 0.7);
  P.ground = 'pave'; lot(P, 0, 0, b.w, b.h, 'park');
  P.bld.push({ x: 0, y: 0, w: rx * 2, h: ry * 2, ht: 0.3, c: [160, 164, 170], r: 'oval', k: 'bowl' });
  lot(P, 0, 0, rx * 1.1, ry * 1.1, 'pitch');
  // the turnstiles and a club shop at the gates
  for (const s of [-1, 1]) box(P, s * (rx + 0.12), 0, 0.1, 0.16, 0.05, [170, 170, 166], 'flat', 'gate');
  box(P, 0, ry + 0.1, 0.24, 0.08, 0.06, [160, 150, 140], 'flat', 'shop');
  for (let q = 0; q < 8; q++) P.trees.push((h(q, 5) - 0.5) * (b.w - 0.1), (h(q, 9) < 0.5 ? -1 : 1) * (H2 - 0.06));
};
LAND.hospital = (P, b, h) => {
  // a hospital: a tall main block with low wings, a helipad, ambulance bays, a car park
  const W2 = b.w / 2, H2 = b.h / 2;
  P.ground = 'lawn';
  const mw = Math.min(0.9, b.w * 0.6), md = Math.min(0.22, b.h * 0.18), wl = Math.min(0.5, b.h * 0.42);
  box(P, -W2 * 0.25, -H2 * 0.35, mw, md, 0.3, [206, 204, 198], 'flat', 'hospital');
  for (let q = 0; q < 4; q++) box(P, -W2 * 0.25 + (q - 1.5) * mw * 0.28, -H2 * 0.35 + md / 2 + wl / 2, 0.1, wl, 0.12, [196, 194, 188], 'flat', 'wing');
  lot(P, W2 * 0.62, -H2 * 0.55, 0.16, 0.16, 'heli');
  lot(P, W2 * 0.6, H2 * 0.3, Math.min(0.6, b.w * 0.34), Math.min(0.7, b.h * 0.5), 'park');
  lot(P, -W2 * 0.25, H2 * 0.8, mw * 0.6, 0.08, 'plaza');   // the ambulance bays
  for (let q = 0; q < 5; q++) P.trees.push(-W2 + 0.06 + h(q, 3) * (b.w - 0.12), -H2 + 0.06);
};
LAND.university = (P, b, h) => {
  // a campus: a quad of long buildings round a green with paths across it, a library tower at one corner
  const W2 = b.w / 2, H2 = b.h / 2, qw = Math.min(W2 * 0.8, 0.9), qh = Math.min(H2 * 0.8, 0.7);
  P.ground = 'lawn';
  lot(P, 0, 0, qw * 2, qh * 2, 'green');
  for (const [x, y, w, hh] of [[0, -qh, qw * 2, 0.12], [0, qh, qw * 2, 0.12], [-qw, 0, 0.12, qh * 2 - 0.12], [qw, 0, 0.12, qh * 2 - 0.12]]) box(P, x, y, w, hh, 0.12 + h(x * 10 | 0, y * 10 | 0) * 0.04, [184, 168, 148], 'pitch', 'college');
  box(P, qw + 0.1, -qh - 0.1, 0.2, 0.2, 0.4, [150, 146, 140], 'flat', 'tower');
  P.lanes.push([-qw, -qh, qw, qh, 0.02, 'path'], [-qw, qh, qw, -qh, 0.02, 'path']);
  for (let q = 0; q < 6; q++) P.trees.push((h(q, 3) - 0.5) * qw * 1.6, (h(q, 5) - 0.5) * qh * 1.6);
};
LAND.ministry = (P, b, h) => {
  // the Ministry: a long symmetrical building with a dome, on a paved forecourt with flags and a lawn
  const W2 = b.w / 2, H2 = b.h / 2, L = Math.min(b.w * 0.86, 1.6), D = Math.min(0.26, b.h * 0.22);
  P.ground = 'pave'; lot(P, 0, H2 * 0.45, L, H2 * 0.8, 'plaza'); lot(P, 0, -H2 * 0.75, L, H2 * 0.3, 'green');
  box(P, 0, -H2 * 0.15, L, D, 0.24, [200, 192, 176], 'flat', 'ministry');
  for (const s of [-1, 1]) box(P, s * (L / 2 - 0.1), -H2 * 0.15, 0.2, D * 1.3, 0.28, [200, 192, 176], 'hip', 'ministry');
  box(P, 0, -H2 * 0.15, D * 0.8, D * 0.8, 0.4, [120, 140, 130], 'dome', 'dome');
  for (let q = 0; q < 6; q++) P.trees.push((h(q, 3) - 0.5) * L, H2 * 0.85);
  void W2;
};

/* a real old town's block (brief 65, cities.js realBlocks): its own buildings, footprints from the map of a real
   town (b.rb, in the block's frame). Each keeps its outline (q.pg) for the map and stands as its smallest enclosing
   rectangle in the 3D view; floors from the real old towns' (three to seven, lower away from the middle), roofs
   mostly pitched; a footprint over 1,500 m² is a church or a hall, taller, with a hipped roof */
FORMS.real = (P, b, h, T) => {
  P.ground = 'pave';
  (b.rb || []).forEach((F, k) => {
    const n = F.length / 2; if (n < 3) return;
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { const x0 = F[i * 2], y0 = F[i * 2 + 1], x1 = F[(i + 1) % n * 2], y1 = F[(i + 1) % n * 2 + 1], k2 = x0 * y1 - x1 * y0; A += k2; cx += (x0 + x1) * k2; cy += (y0 + y1) * k2; }
    if (Math.abs(A) < 1e-7) return;
    cx /= 3 * A; cy /= 3 * A; A = Math.abs(A) / 2;
    // the smallest rectangle round it, along one of its edges
    let best = null;
    for (let i = 0; i < n; i++) {
      const ex = F[(i + 1) % n * 2] - F[i * 2], ey = F[(i + 1) % n * 2 + 1] - F[i * 2 + 1], L = Math.hypot(ex, ey); if (L < 1e-4) continue;
      const ux = ex / L, uy = ey / L; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let j = 0; j < n; j++) { const dx = F[j * 2] - cx, dy = F[j * 2 + 1] - cy, u = dx * ux + dy * uy, v = -dx * uy + dy * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const ar = (u1 - u0) * (v1 - v0);
      if (!best || ar < best.ar) best = { ar, a: Math.atan2(uy, ux), w: u1 - u0, h: v1 - v0, x: cx + ux * (u0 + u1) / 2 - uy * (v0 + v1) / 2, y: cy + uy * (u0 + u1) / 2 + ux * (v0 + v1) / 2 };
    }
    if (!best) return;
    const big = A > 0.15, u = h(k, 41);
    const fl = big ? 0 : U.clamp(Math.round(IC.realFloors('old', u, [3, 5, 6, 6, 8]) * (P.g || 1)), 2, 7), pitched = !big && h(k, 43) < 0.85;
    const c = big ? tint([120, 104, 92], (h(k, 45) - 0.5) * 20) : roofOf(T, h(k, 47), h(k, 49));
    P.bld.push({ x: best.x, y: best.y, w: Math.max(0.01, best.w), h: Math.max(0.01, best.h), a: best.a || 1e-6, pg: F, ht: big ? 0.16 + h(k, 51) * 0.1 : fl * 0.03 + (pitched ? 0.015 : 0.006), c, r: big ? 'hip' : pitched ? 'pitch' : 'flat', k: big ? 'church' : 'flats' });
  });
  infill(P, b, h, T);
};
/* an old town's street fronts the real map left open (brief 68): where no mapped building stands along the block's
   edge, narrow houses of three to five floors fill the frontage, as a town of that age would have them, so the
   old town reads as built up and not as paving with houses on it */
function infill(P, b, h, T) {
  const G = b.pg; if (!G || G.length < 6) return;
  const n = G.length / 2, C = 0.02, occ = new Set(), key = (x, y) => Math.floor(x / C) * 4096 + Math.floor(y / C);
  const pip = (F, x, y) => { let ins = false; for (let i = 0, j = F.length / 2 - 1; i < F.length / 2; j = i++) { const ax = F[i * 2], ay = F[i * 2 + 1], bx = F[j * 2], by = F[j * 2 + 1]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) ins = !ins; } return ins; };
  const mark = F => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < F.length; i += 2) { x0 = Math.min(x0, F[i]); x1 = Math.max(x1, F[i]); y0 = Math.min(y0, F[i + 1]); y1 = Math.max(y1, F[i + 1]); }
    for (let x = Math.floor(x0 / C) * C; x <= x1 + C; x += C) for (let y = Math.floor(y0 / C) * C; y <= y1 + C; y += C) if (pip(F, x + C / 2, y + C / 2) || pip(F, x, y)) occ.add(key(x + C / 2, y + C / 2)); };
  for (const F of b.rb || []) mark(F);
  let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += G[i * 2] * G[j * 2 + 1] - G[j * 2] * G[i * 2 + 1]; }
  const sg = A > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = G[i * 2], ay = G[i * 2 + 1], ex = G[j * 2] - ax, ey = G[j * 2 + 1] - ay, L = Math.hypot(ex, ey);
    if (L < 0.12) continue;
    const ux = ex / L, uy = ey / L, nx = -uy * sg, ny = ux * sg, a = Math.atan2(uy, ux);
    let t = 0.015;
    for (const w of parcels(L - 0.03, 0.06, 0.13, h, 300 + i * 17)) {
      const d = 0.08 + h(i * 31 + Math.round(t * 100), 61) * 0.06, cx = ax + ux * (t + w / 2) + nx * (d / 2 + 0.004), cy = ay + uy * (t + w / 2) + ny * (d / 2 + 0.004);
      const R = []; for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.push(cx + ux * p * w / 2 + nx * q * d / 2, cy + uy * p * w / 2 + ny * q * d / 2);
      let ok = true;
      for (let p = -0.4; p <= 0.41 && ok; p += 0.2) for (let q = -0.4; q <= 0.41 && ok; q += 0.4) { const x = cx + ux * p * w + nx * q * d, y = cy + uy * p * w + ny * q * d; if (!pip(G, x, y) || occ.has(key(x, y)) || (b.rd && b.rd.some(r => U.segDist(x, y, r[0], r[1], r[2], r[3]) < r[4]))) ok = false; }
      if (ok) {
        const k = 900 + i * 50 + Math.round(t * 100), fl = U.clamp(Math.round(IC.realFloors('old', h(k, 41), [3, 4, 5, 5, 6]) * (P.g || 1)), 2, 6), pitched = h(k, 43) < 0.85;
        P.bld.push({ x: cx, y: cy, w: w - 0.004, h: d, a: a || 1e-6, ht: fl * 0.03 + (pitched ? 0.015 : 0.006), c: roofOf(T, h(k, 47), h(k, 49)), r: pitched ? 'pitch' : 'flat', k: 'flats' });
        mark(R);
      }
      t += w;
    }
  }
}

/* ---------- the plan ---------- */
IC.blockPlan = function (b, c) {
  if (b._plan) return b._plan;
  const sd = Math.floor(b.seed || 0), h = (i, j) => U.hash(sd * 3 + i, j * 7 + 1), T = IC.cityTones(c);
  const P = { ground: 'grass', lots: [], lanes: [], bld: [], trees: [] };
  // the density gradient (brief 65): flats a little lower and towers much lower away from the middle of town
  // (a map may raise or lower a city's skyline against the measured one, brief 73: c.tall)
  if (c) { const gr = IC.realGrad(U.dist(b, c) / 10), tall = c.tall || 1; P.g = U.clamp(Math.sqrt(gr) * tall, 0.6, 1.4); P.gt = U.clamp(Math.pow(gr, 0.8) * tall, 0.35, 1.6); }
  const fn = (b.land && LAND[b.land]) || FORMS[b.f];
  if (fn) fn(P, b, h, T);
  else box(P, 0, 0, b.w * 0.7, b.h * 0.7, 0.08, [170, 166, 158], 'flat', 'bld');
  // nothing past the block's edge: a building that would stick out is pulled in
  const W2 = b.w / 2, H2 = b.h / 2;
  for (const q of P.bld) { if (q.a || q.pg) continue; if (q.w > b.w) q.w = b.w; if (q.h > b.h) q.h = b.h; q.x = U.clamp(q.x, -W2 + q.w / 2, W2 - q.w / 2); q.y = U.clamp(q.y, -H2 + q.h / 2, H2 - q.h / 2); }
  P.trees = P.trees.filter((v, i, A) => i % 2 ? Math.abs(A[i - 1]) <= W2 && Math.abs(v) <= H2 : Math.abs(v) <= W2 && Math.abs(A[i + 1]) <= H2);
  return b._plan = P;
};
IC.BLOCK_FORMS = FORMS; IC.LANDMARKS = LAND;

/* ---------- landmarks placed (cities.js, after the blocks) ----------
   roads: [x0, y0, x1, y1, cls] pieces near the city, 'rail' among them. One landmark a block, none on the fringe. */
IC.placeLandmarks = function (W, c, roads) {
  const B = c.blocks.filter(b => !b.fr && b.hp > 0 && b.f !== 'real'), small = b => Math.min(b.w, b.h), far = b => U.dist(b, c), ext = c.ext || c.r || 20;
  const frame = (b, x, y) => { const dx = x - b.x, dy = y - b.y; return Math.atan2(dy, dx) - b.a; };
  const rails = (roads || []).filter(s => s[4] === 'rail');
  const railNear = b => { let bd = 1e9, bs = null; for (const s of rails) { const d = U.segDist(b.x, b.y, s[0], s[1], s[2], s[3]); if (d < bd) { bd = d; bs = s; } } return { d: bd, s: bs }; };
  const taken = new Set(), pick = (list, kind, fn) => { const b = list.find(q => !taken.has(q)); if (!b) return null; taken.add(b); b.land = kind; if (fn) fn(b); return b; };
  // the station: the yard nearest the centre, else any block the railway runs by, near the centre
  if (rails.length) {
    // (a yard's cells lie within a cell of the line; any other block must touch it)
    const near = B.map(b => ({ b, r: railNear(b) })).filter(o => o.r.d < (o.b.d === 'rail' ? 5 : Math.max(0.6, small(o.b) * 0.5 + 0.5)) && o.b.f !== 'cul' && o.b.f !== 'house');
    const yards = near.filter(o => o.b.d === 'rail').sort((p, q) => far(p.b) - far(q.b)), others = near.filter(o => o.b.d !== 'rail' && small(o.b) >= 0.6).sort((p, q) => far(p.b) - far(q.b));
    const o = yards[0] || others[0];
    if (o) pick([o.b], 'station', b => { const s = o.r.s; b.ra = U.angWrap(Math.atan2(s[3] - s[1], s[2] - s[0]) - b.a); b.face = frame(b, c.x, c.y); });
  }
  const o = c.fld && c.fld.old ? c.fld.old : c;
  // (a map names the landmarks a city must have, or must not: brief 73)
  const M = c.marks || [], want = k => M.includes(k), not = k => M.includes('!' + k);
  if ((c.pop >= 250 || want('cathedral')) && !not('cathedral')) pick(B.filter(b => b.f === 'old' && small(b) >= 0.45).sort((p, q) => U.dxy(p.x, p.y, o.x, o.y) - U.dxy(q.x, q.y, o.x, o.y)), 'cathedral');
  if ((c.capital || want('ministry')) && !not('ministry')) pick(B.filter(b => b.d === 'biz' && small(b) >= 0.8).sort((p, q) => far(p) - far(q)), 'ministry');
  if ((c.pop >= 200 || want('hospital')) && !not('hospital')) pick(B.filter(b => (b.d === 'dense' || b.d === 'sub') && small(b) >= 1.0).sort((p, q) => Math.abs(far(p) - ext * 0.45) - Math.abs(far(q) - ext * 0.45)), 'hospital');
  if ((c.pop >= 400 || want('university')) && !not('university')) pick(B.filter(b => (b.d === 'dense' || b.d === 'biz') && small(b) >= 1.2).sort((p, q) => Math.abs(far(p) - ext * 0.35) - Math.abs(far(q) - ext * 0.35)), 'university');
  if ((c.pop >= 300 || want('stadium')) && !not('stadium')) pick(B.filter(b => b.d !== 'old' && b.d !== 'biz' && b.d !== 'rail' && small(b) >= 1.4).sort((p, q) => Math.abs(far(p) - ext * 0.7) - Math.abs(far(q) - ext * 0.7)), 'stadium');
  // sidings into the factories and warehouses beside the line
  if (rails.length) {
    // (the blocks keep a corridor off the line, so the siding runs across the gap from the line to the yard)
    for (const b of B) {
      if ((b.f !== 'shed' && b.f !== 'ware') || b.land) continue;
      const r = railNear(b); if (r.d > small(b) * 0.5 + 1.5) continue;
      // (the line's nearest point, in the block's frame)
      const s = r.s, vx = s[2] - s[0], vy = s[3] - s[1], LL = vx * vx + vy * vy || 1, t = U.clamp(((b.x - s[0]) * vx + (b.y - s[1]) * vy) / LL, 0, 1);
      const nx = s[0] + vx * t - b.x, ny = s[1] + vy * t - b.y, ca = Math.cos(-b.a), sa = Math.sin(-b.a);
      b.sid = { a: U.angWrap(Math.atan2(vy, vx) - b.a), px: nx * ca - ny * sa, py: nx * sa + ny * ca };
      delete b._plan;
    }
  }
  for (const b of taken) delete b._plan;
  return [...taken];
};

/* ---------- buildings standing up (brief 65) ----------
   A block's buildings as prisms in world units, for the map's buildings with height (render-buildings.js): each its
   outline (x, y pairs), its height, its roof's colour and its walls'. The map is drawn from straight above but the
   buildings lean back: a roof is drawn IC.LEAN of its height to the north, so a street's south side shows its walls
   and the buildings in front hide what is behind them. Headless, cached on the block until its plan changes. */
IC.LEAN = 0.6;
const WALLS = [[214, 196, 166], [200, 182, 150], [222, 210, 186], [196, 168, 140], [206, 192, 176], [184, 170, 150]];
IC.blockPrisms = function (b, c) {
  // (only the forms with a plan: the map paints the fringe's and the estates' own pictures, flat)
  if (b.hp <= 0 || !((b.land && LAND[b.land]) || FORMS[b.f])) return [];
  const P = IC.blockPlan(b, c);
  if (b._pr && b._pr.plan === P) return b._pr.list;
  const ca = Math.cos(b.a || 0), sa = Math.sin(b.a || 0), sd = Math.floor(b.seed || 0), list = [];
  const wx = (u, v) => b.x + u * ca - v * sa, wy = (u, v) => b.y + u * sa + v * ca, byIdx = [];
  P.bld.forEach((q, k) => {
    if (!(q.ht > 0.012)) return;
    let F;
    if (q.pg) F = q.pg;
    else {
      // a rectangle (turned in the block by q.a), or a round or oval building as a dozen sides
      const qa = q.a || 0, qc = Math.cos(qa), qs = Math.sin(qa), L = [];
      if (q.r === 'round' || q.r === 'dome' || q.r === 'oval') for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, u = Math.cos(t) * q.w / 2, v = Math.sin(t) * q.h / 2; L.push(q.x + u * qc - v * qs, q.y + u * qs + v * qc); }
      else for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = u * q.w / 2, y = v * q.h / 2; L.push(q.x + x * qc - y * qs, q.y + x * qs + y * qc); }
      F = L;
    }
    const p = new Array(F.length); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < F.length; i += 2) { const x = wx(F[i], F[i + 1]), y = wy(F[i], F[i + 1]); p[i] = x; p[i + 1] = y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const h = U.hash(sd * 5 + k, 77), tiled = q.r === 'pitch' || q.r === 'hip';
    const w = q.r === 'glass' ? [112, 140, 162] : q.r === 'spire' || q.k === 'church' ? [178, 168, 150] : tiled ? WALLS[Math.floor(h * WALLS.length)] : tint(q.c, 6);
    const pr = { p, z0: q.z0 || 0, ht: q.ht, c: tiled ? q.c : tint(q.c, (h - 0.5) * 18), w, r: q.r, x0, y0, x1, y1, fl: q.k === 'tower' || q.r === 'glass' || q.ht > 0.15 };
    // (a tier stands on the building below it: drawn after it, on its roof, brief 68)
    if (q.on != null && byIdx[q.on]) { const R = byIdx[q.on].root; let t = R; while (t.kid) t = t.kid; t.kid = pr; R.top = Math.max(R.top, q.ht); byIdx[k] = { root: R }; return; }
    byIdx[k] = { root: pr }; pr.top = q.ht;
    list.push(pr);
    if (q.pg || F.length !== 8) return;
    // on a rectangle's roof: the shaded slope of a pitched roof, a plant room on a tall flat one
    const at = (u, v) => [wx(q.x + u * Math.cos(q.a || 0) - v * Math.sin(q.a || 0), q.y + u * Math.sin(q.a || 0) + v * Math.cos(q.a || 0)), wy(q.x + u * Math.cos(q.a || 0) - v * Math.sin(q.a || 0), q.y + u * Math.sin(q.a || 0) + v * Math.cos(q.a || 0))];
    const W2 = q.w / 2, H2 = q.h / 2;
    if (q.r === 'pitch') pr.half = [].concat(...(q.w > q.h ? [at(-W2, 0), at(W2, 0), at(W2, H2), at(-W2, H2)] : [at(0, -H2), at(W2, -H2), at(W2, H2), at(0, H2)]));
    else if (q.r === 'flat' && q.ht > 0.12 && q.w > 0.12 && q.h > 0.12 && !P.bld.some(o => o.on === k)) {
      const u = (h - 0.5) * W2 * 0.6, v = (U.hash(sd * 5 + k, 79) - 0.5) * H2 * 0.6, rw = q.w * 0.18, rh = q.h * 0.18, P2 = [].concat(at(u - rw, v - rh), at(u + rw, v - rh), at(u + rw, v + rh), at(u - rw, v + rh));
      let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; for (let i = 0; i < 8; i += 2) { a0 = Math.min(a0, P2[i]); a1 = Math.max(a1, P2[i]); b0 = Math.min(b0, P2[i + 1]); b1 = Math.max(b1, P2[i + 1]); }
      pr.kid = { p: P2, z0: q.ht, ht: q.ht + 0.03, c: tint(q.c, -22), w: tint(q.c, -10), r: 'flat', x0: a0, y0: b0, x1: a1, y1: b1 };
    }
  });
  b._pr = { plan: P, list };
  return list;
};

})(window.IC);
