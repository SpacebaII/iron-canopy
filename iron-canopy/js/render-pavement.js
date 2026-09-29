/* Iron Canopy — an airport's pavement painted as one surface (brief 44): textures by material, shoulders, the fillets
   (pavement.js), edge lines, centrelines, hold lines, runway and stand markings, blast pads, approach lights and the
   perimeter road. It is painted once into the airport's own tiles (at seven resolutions, from the regional zoom to
   the gate) and drawn from them each frame; it is painted again only when the pavement changes. The 3D view lays the
   same painting on its ground (IC.paveCanvas). What changes by the minute (craters, closures, lights, aircraft) is
   drawn over it by render-airport.js. */
(function (IC) {
'use strict';
const U = IC.U;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };

/* ---------- textures: one palette, so a runway, its taxiways and its aprons look like one airport ----------
   rep: the ground one texture repeat covers (units); slabs are 5 m, joints sealed dark */
const PAL = {
  conc: { rgb: [146, 147, 141], v: 6, rep: 0.4, kind: 'slab' },
  rconc: { rgb: [158, 160, 157], v: 5, rep: 0.4, kind: 'slab' },
  asph: { rgb: [60, 62, 64], v: 9, rep: 0.6, kind: 'asph' },
  shoulder: { rgb: [100, 101, 98], v: 8, rep: 0.6, kind: 'asph' },
  grass: { rgb: [98, 122, 70], v: 16, rep: 0.4, kind: 'grass' },
  gravel: { rgb: [150, 142, 122], v: 20, rep: 0.3, kind: 'gravel' }
};
IC.PAVE_PAL = PAL;
const TEX = {};
const SZ = 512;
function texture(mat) {
  if (TEX[mat]) return TEX[mat];
  const P = PAL[mat], c = mk(SZ), g = c.getContext('2d'), im = g.createImageData(SZ, SZ), d = im.data;
  const seed = mat.length * 97 + mat.charCodeAt(0);
  const slab = SZ / 8;   // 5 m slabs in a 40 m repeat
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    let k = 0;
    const fine = (U.hash(x + seed, y * 3 + seed) - 0.5) * 2;
    if (P.kind === 'slab') {
      const si = Math.floor(x / slab), sj = Math.floor(y / slab);
      k = (U.hash(si + seed * 7, sj + 13) - 0.5) * 2 * P.v + (U.pfbm(x / 64, y / 64, 8) - 0.5) * 10 + fine * 3.5;
      // aggregate: a few darker and lighter grains
      const a = U.hash(x * 7 + 1, y * 5 + seed); if (a > 0.985) k -= 14; else if (a < 0.01) k += 10;
    } else if (P.kind === 'asph') {
      k = fine * P.v * 0.8 + (U.pfbm(x / 48, y / 48, 11) - 0.5) * 12;
      const a = U.hash(x * 3 + seed, y * 11 + 5); if (a > 0.97) k += 16; else if (a < 0.02) k -= 10;
    } else if (P.kind === 'grass') {
      k = (U.pfbm(x / 40, y / 40, 13) - 0.5) * 2.2 * P.v + fine * 9;
    } else {
      k = fine * P.v + (U.pfbm(x / 30, y / 30, 17) - 0.5) * 14;
    }
    const i = (y * SZ + x) * 4, gr = P.kind === 'grass' ? 1.25 : 1;
    d[i] = P.rgb[0] + k; d[i + 1] = P.rgb[1] + k * gr; d[i + 2] = P.rgb[2] + k * (P.kind === 'grass' ? 0.6 : 1); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const rnd = (i, j) => U.hash(i * 131 + seed, j * 71 + 3);
  // draw a mark at x, y and again where it wraps, so the texture tiles seamlessly
  const wrap = (x, y, w, h, fn) => { for (const ox of [0, -SZ, SZ]) for (const oy of [0, -SZ, SZ]) if (x + ox + w > 0 && x + ox < SZ && y + oy + h > 0 && y + oy < SZ) fn(x + ox, y + oy); };
  if (P.kind === 'slab') {
    // oil stains and tyre scuffs on a few slabs, cracks in fewer
    for (let n = 0; n < 3; n++) {
      const x = rnd(n, 1) * SZ, y = rnd(n, 2) * SZ, r = 10 + rnd(n, 3) * 20;
      wrap(x - r, y - r, 2 * r, 2 * r, (X, Y) => { const gr = g.createRadialGradient(X + r, Y + r, 0, X + r, Y + r, r); gr.addColorStop(0, 'rgba(40,38,34,0.1)'); gr.addColorStop(1, 'rgba(40,38,34,0)'); g.fillStyle = gr; g.fillRect(X, Y, 2 * r, 2 * r); });
    }
    g.strokeStyle = 'rgba(70,70,64,0.5)'; g.lineWidth = 0.8;
    for (let n = 0; n < 5; n++) {
      const si = Math.floor(rnd(n, 7) * 8), sj = Math.floor(rnd(n, 8) * 8);
      let x = si * slab + rnd(n, 9) * slab, y = sj * slab + 2; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rnd(n, s + 10) - 0.5) * 14; y += slab / 6; g.lineTo(Math.min(Math.max(x, si * slab + 2), si * slab + slab - 2), Math.min(y, sj * slab + slab - 2)); }
      g.stroke();
    }
    // the joints: a dark sealed line on every slab edge, a lighter lip beside it
    g.fillStyle = 'rgba(58,58,54,0.55)';
    for (let i = 0; i < 8; i++) { g.fillRect(i * slab, 0, 2, SZ); g.fillRect(0, i * slab, SZ, 2); }
    g.fillStyle = 'rgba(255,255,250,0.07)';
    for (let i = 0; i < 8; i++) { g.fillRect(i * slab + 2, 0, 1, SZ); g.fillRect(0, i * slab + 2, SZ, 1); }
  } else if (P.kind === 'asph') {
    // patch repairs: squares of newer (darker) or older (greyer) asphalt with sealed edges, and sealed cracks
    for (let n = 0; n < 6; n++) {
      const w = 30 + rnd(n, 4) * 90, h = 24 + rnd(n, 5) * 60, x = rnd(n, 6) * SZ, y = rnd(n, 7) * SZ, dk = rnd(n, 8) > 0.45;
      wrap(x, y, w, h, (X, Y) => { g.fillStyle = dk ? 'rgba(20,20,22,0.22)' : 'rgba(150,150,150,0.08)'; g.fillRect(X, Y, w, h); g.strokeStyle = 'rgba(14,14,16,0.45)'; g.lineWidth = 1.5; g.strokeRect(X, Y, w, h); });
    }
    g.strokeStyle = 'rgba(12,12,14,0.45)'; g.lineWidth = 1.6;
    for (let n = 0; n < 9; n++) {
      let x = rnd(n, 20) * SZ, y = rnd(n, 21) * SZ; const a = rnd(n, 22) * 6.28, L = 40 + rnd(n, 23) * 140;
      const pts = [[x, y]]; for (let s = 0; s < 12; s++) { x += Math.cos(a + (rnd(n, s + 30) - 0.5) * 1.4) * L / 12; y += Math.sin(a + (rnd(n, s + 40) - 0.5) * 1.4) * L / 12; pts.push([x, y]); }
      wrap(Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), L, L, (X, Y) => { const dx = X - Math.min(...pts.map(q => q[0])), dy = Y - Math.min(...pts.map(q => q[1])); g.beginPath(); pts.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q[0] + dx, q[1] + dy)); g.stroke(); });
    }
  } else if (P.kind === 'grass') {
    // tufts and clover: small darker and lighter flecks
    for (let n = 0; n < 900; n++) { g.fillStyle = rnd(n, 50) > 0.5 ? 'rgba(60,84,40,0.35)' : 'rgba(150,170,100,0.25)'; g.fillRect(rnd(n, 51) * SZ, rnd(n, 52) * SZ, 2 + rnd(n, 53) * 3, 2 + rnd(n, 54) * 3); }
  } else {
    for (let n = 0; n < 1400; n++) { g.fillStyle = rnd(n, 60) > 0.5 ? 'rgba(90,82,70,0.5)' : 'rgba(210,204,190,0.45)'; g.fillRect(rnd(n, 61) * SZ, rnd(n, 62) * SZ, 2 + rnd(n, 63) * 2, 2 + rnd(n, 64) * 2); }
  }
  // a chain of smaller copies, so a texture seen from far is its average tone and not a shimmer
  const mips = [c];
  while (mips[mips.length - 1].width > 8) { const s = mips[mips.length - 1], h = mk(s.width / 2); const hg = h.getContext('2d'); hg.imageSmoothingQuality = 'high'; hg.drawImage(s, 0, 0, h.width, h.height); mips.push(h); }
  const last = mips[mips.length - 1].getContext('2d').getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0; for (let i = 0; i < last.length; i += 4) { r += last[i]; gg += last[i + 1]; b += last[i + 2]; }
  const n = last.length / 4;
  TEX[mat] = { mips, flat: `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})` };
  return TEX[mat];
}
IC.paveTexture = texture;
/* a fill for a material, its slabs lying along angle a from the point ox, oy (world units), for a picture at ppu
   pixels a unit */
function paveFill(g, mat, ppu, ox, oy, a) {
  const P = PAL[mat] || PAL.conc, T = texture(PAL[mat] ? mat : 'conc'), want = P.rep * ppu;
  if (want < 5) return T.flat;
  let m = T.mips[0]; for (const q of T.mips) if (q.width >= want) m = q;
  const pat = g.createPattern(m, 'repeat');
  pat.setTransform(new DOMMatrix().translate(ox, oy).rotate(a * 180 / Math.PI).scale(P.rep / m.width));
  return pat;
}
IC.paveFill = paveFill;

/* ---------- colours of the paint ---------- */
const YEL = 'rgb(232,188,52)', WHITE = 'rgb(238,238,230)', RED = 'rgb(196,52,44)';

/* the paths of the pieces */
function rwPath(g, r, grow, ext) {
  const ex = r.d.x * (ext || 0), ey = r.d.y * (ext || 0), nx = -r.d.y * (r.w / 2 + grow), ny = r.d.x * (r.w / 2 + grow);
  g.moveTo(r.a.x - ex + nx, r.a.y - ey + ny); g.lineTo(r.b.x + ex + nx, r.b.y + ey + ny); g.lineTo(r.b.x + ex - nx, r.b.y + ey - ny); g.lineTo(r.a.x - ex - nx, r.a.y - ey - ny); g.closePath();
}
function polyPath(g, P) { P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); }
function linePath(g, P) { P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); }
const bbOf = (P, m) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of P) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m }; };
const hit = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);

/* what the painter keeps per geometry: bounding boxes, the runway ends and their lights, the blast pads */
function prep(ap, G) {
  if (G._prep) return G._prep;
  const R = { rw: [], tw: [], ar: [], fil: [], ends: [], road: null };
  for (const r of G.rw) {
    const sh = r.w >= 0.4 ? 0.075 : r.w >= 0.3 ? 0.05 : 0.03;
    R.rw.push({ r, sh, bb: bbOf([r.a, r.b], r.w + 0.4) });
    for (const [e, sg] of [[r.a, -1], [r.b, 1]]) {
      // a blast pad beyond each end (only where the runway is long enough to carry jets), and the approach lights
      const ils = ap.parts.some(p => p.kind === 'ils' && p.built && p.rw === r.p.id && p.end === (sg < 0 ? 'a' : 'b'));
      const pad = r.L >= 15 && r.mat !== 'grass' ? (r.w >= 0.4 ? 0.6 : 0.3) : 0;
      const lights = r.mat === 'grass' ? 0 : ils ? 7.3 : r.L >= 15 ? 4.3 : 0;
      R.ends.push({ r, e, ux: r.d.x * sg, uy: r.d.y * sg, pad, lights, ils, bb: bbOf([e, { x: e.x + r.d.x * sg * (lights + 0.5), y: e.y + r.d.y * sg * (lights + 0.5) }], 0.6) });
    }
  }
  for (const t of G.tw) R.tw.push({ t, sh: t.lane ? 0 : IC.paveDesign(t.w).sh, bb: bbOf(t.pts, t.w + 0.3) });
  for (const a of G.ar) R.ar.push({ a, bb: bbOf(a.poly, 0.3) });
  for (const f of G.fil) R.fil.push({ f, bb: bbOf(f.poly, 0.3) });
  G._prep = R;
  return R;
}

/* ---------- the painting ----------
   g is in world units (its transform maps them to pixels at ppu); box is what needs painting */
IC.pavePaint = function (g, S, ap, ppu, box, o) {
  o = o || {};
  const G = IC.paveGeom(ap), R = prep(ap, G), px = 1 / ppu;
  const V = r => hit(r.bb, box);
  const rws = R.rw.filter(V), tws = R.tw.filter(V), ars = R.ar.filter(V), fils = R.fil.filter(V), ends = R.ends.filter(V);
  g.lineJoin = 'round';
  // the perimeter road, inside the fence
  if (!o.noSurround) perimeter(g, ap, ppu, box);
  // approach lights on their gravel track, over the grass beyond each end
  if (!o.noSurround) for (const E of ends) if (E.lights) approach(g, E, ppu);
  // shoulders: a lighter asphalt beyond the edge line (not load-bearing), then blast pads
  for (const { r, sh } of rws) { g.fillStyle = paveFill(g, 'shoulder', ppu, r.a.x, r.a.y, Math.atan2(r.d.y, r.d.x)); g.beginPath(); rwPath(g, r, sh, 0); g.fill(); }
  g.lineCap = 'round';
  for (const { t, sh } of tws) if (sh) { g.strokeStyle = paveFill(g, 'shoulder', ppu, t.pts[0].x, t.pts[0].y, 0); g.lineWidth = t.w + 2 * sh; g.beginPath(); linePath(g, t.pts); g.stroke(); }
  if (tws.length) for (const f of IC.paveFillets(ap, 0.1)) if (hit(bbOf(f.poly, 0), box)) { g.fillStyle = paveFill(g, 'shoulder', ppu, f.f.N.x, f.f.N.y, 0); g.beginPath(); polyPath(g, f.poly); g.fill(); }
  for (const E of ends) if (E.pad) { const r = E.r; g.fillStyle = paveFill(g, 'shoulder', ppu, E.e.x, E.e.y, Math.atan2(E.uy, E.ux)); g.beginPath(); padPath(g, E, r.w / 2 + R.rw.find(q => q.r === r).sh); g.fill(); }
  // the pavement: aprons and forecourts, then fillets and taxiways, runways last (their slabs run through)
  for (const { a } of ars) { g.fillStyle = paveFill(g, a.mat, ppu, a.p.x || a.poly[0].x, a.p.y || a.poly[0].y, a.a); g.beginPath(); polyPath(g, a.poly); g.fill(); }
  for (const { f } of fils) { g.fillStyle = paveFill(g, f.mat, ppu, f.f.N.x, f.f.N.y, f.th); g.beginPath(); polyPath(g, f.poly); g.fill(); }
  for (const { t } of tws) for (let i = 1; i < t.pts.length; i++) {
    const A = t.pts[i - 1], B = t.pts[i];
    g.strokeStyle = paveFill(g, t.mat, ppu, A.x, A.y, Math.atan2(B.y - A.y, B.x - A.x)); g.lineWidth = t.w;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
  }
  for (const { r } of rws) { g.fillStyle = paveFill(g, r.mat, ppu, r.a.x, r.a.y, Math.atan2(r.d.y, r.d.x)); g.beginPath(); rwPath(g, r, 0, 0); g.fill(); }
  // wear: rubber in the touchdown zones, tyre tracks down the taxiway centrelines, stains where aircraft stand
  if (ppu >= 3) grime(g, ap, G, rws, tws, ars, ppu);
  // blast pads: yellow chevrons pointing at the runway
  for (const E of ends) if (E.pad) chevrons(g, E, ppu);
  // edge lines round the taxiways, fillets and aprons (not along the runway: its edges are white)
  if (ppu >= 40 && (tws.length || ars.length)) edgeLines(g, ap, G, R, ppu, box, o);
  // runway markings
  for (const { r } of rws) runwayPaint(g, r, ppu);
  // centrelines, lead-on and lead-off lines, taxilanes; hold lines; one-way arrows
  if (ppu >= 16) {
    g.strokeStyle = YEL; g.lineCap = 'butt'; g.globalAlpha = U.clamp((ppu - 8) / 40, 0.4, 1);
    for (const c of G.cl) {
      if (!hit(c._bb || (c._bb = bbOf(c.pts, 0.1)), box)) continue;
      g.lineWidth = Math.max(0.0035, (c.lane ? 0.7 : 0.9) * px); g.beginPath(); linePath(g, c.pts); g.stroke();
    }
    g.lineCap = 'round'; g.globalAlpha = 1;
    if (ppu >= 8) holdLines(g, ap, ppu, box);
    if (ppu >= 8) for (const { t } of tws) if (t.p.oneway || t.p.flow) oneWay(g, t, ppu);
  }
  // stands: lead-in lines, stop bars, safety lines, numbers; the service road along the terminal
  if (ppu >= 8) for (const { a } of ars) standsPaint(g, ap, a, ppu, box);
  if (ppu >= 8) for (const { a } of ars) if (a.fore) forecourt(g, ap, a, ppu);
};

/* a blast pad beyond the runway end: as wide as the runway and its shoulders */
function padPath(g, E, hw) {
  const nx = -E.uy * hw, ny = E.ux * hw, L = E.pad;
  g.moveTo(E.e.x + nx, E.e.y + ny); g.lineTo(E.e.x + E.ux * L + nx, E.e.y + E.uy * L + ny); g.lineTo(E.e.x + E.ux * L - nx, E.e.y + E.uy * L - ny); g.lineTo(E.e.x - nx, E.e.y - ny); g.closePath();
}
function chevrons(g, E, ppu) {
  const hw = E.r.w / 2, px = 1 / ppu;
  g.save(); g.translate(E.e.x, E.e.y); g.rotate(Math.atan2(E.uy, E.ux));
  g.fillStyle = paveFill(g, 'asph', ppu, 0, 0, 0); g.fillRect(0, -hw, E.pad, 2 * hw);
  g.strokeStyle = YEL; g.lineWidth = Math.max(0.009, 0.9 * px); g.lineCap = 'butt';
  g.beginPath();
  for (let s = 0.15; s < E.pad; s += 0.3) { g.moveTo(s + hw, -hw); g.lineTo(s, 0); g.lineTo(s + hw, hw); }
  g.save(); g.beginPath(); g.rect(0, -hw, E.pad, 2 * hw); g.clip(); g.beginPath();
  for (let s = 0.15; s < E.pad + hw; s += 0.3) { g.moveTo(s + hw, -hw); g.lineTo(s, 0); g.lineTo(s + hw, hw); }
  g.stroke(); g.restore();
  g.restore();
}
/* approach lights: a bar every 30 m out along the centreline (a crossbar at 300 m), on a gravel track; an ILS end
   gets the full 730 m system with side rows near the threshold */
function approach(g, E, ppu) {
  const px = 1 / ppu;
  g.save(); g.translate(E.e.x, E.e.y); g.rotate(Math.atan2(E.uy, E.ux));
  g.globalAlpha = 0.55; g.fillStyle = ppu >= 5 ? paveFill(g, 'gravel', ppu, 0, 0, 0) : 'rgb(150,142,122)';
  g.fillRect(E.pad || 0.05, -0.03, E.lights - (E.pad || 0.05) + 0.1, 0.06); g.globalAlpha = 1;
  if (ppu >= 6) {
    g.fillStyle = 'rgb(58,60,60)';
    const bw = Math.max(0.006, 1.1 * px);
    for (let s = 0.3; s <= E.lights + 1e-6; s += 0.3) {
      const half = Math.abs(s - 3) < 0.01 ? 0.15 : 0.021;
      g.fillRect(s - bw / 2, -half, bw, 2 * half);
      if (E.ils && s <= 3 + 1e-6 && s > 0.1) { g.fillRect(s - bw / 2, -0.11, bw, 0.03); g.fillRect(s - bw / 2, 0.08, bw, 0.03); }
    }
    if (ppu >= 25) { g.fillStyle = 'rgba(250,250,240,0.9)'; const d = Math.max(0.002, 0.8 * px); for (let s = 0.3; s <= E.lights + 1e-6; s += 0.3) for (let k = -2; k <= 2; k++) g.fillRect(s - d / 2, k * 0.01 - d / 2, d, d); }
  }
  g.restore();
}
/* the perimeter road: a narrow service road just inside the fence (not across the landside) */
function perimeter(g, ap, ppu, box) {
  const b = IC.aptFence(ap); if (!b || !b.poly || ppu < 3) return;
  const P = IC.polyGrow(b.poly, -0.14);
  if (!hit(bbOf(P, 0.2), box)) return;
  g.save();
  if (b.carve.length) { g.beginPath(); g.rect(-1e6, -1e6, 2e6, 2e6); for (const cv of b.carve) polyPath(g, IC.polyGrow(cv, 0.1)); g.clip('evenodd'); }
  g.lineCap = 'round'; g.strokeStyle = paveFill(g, 'shoulder', ppu, 0, 0, 0); g.lineWidth = 0.05;
  g.beginPath(); polyPath(g, P); g.stroke();
  g.restore();
}
/* rubber and tyre marks: dark streaks where the main gear touches down (150 to 900 m in), a faint track down every
   taxiway centreline, stains under the engines at each stand */
function grime(g, ap, G, rws, tws, ars, ppu) {
  for (const { r } of rws) {
    if (r.mat === 'grass') continue;
    g.save(); g.translate(r.a.x, r.a.y); g.rotate(Math.atan2(r.d.y, r.d.x));
    const seed = Math.round(r.a.x * 13 + r.a.y * 7);
    for (const [s0, sg] of [[0, 1], [r.L, -1]]) {
      for (let i = 0; i < 70; i++) {
        const h = U.hash(seed + i, sg > 0 ? 3 : 5), t = 1.2 + Math.pow(U.hash(i, seed), 1.6) * 8, len = 0.4 + U.hash(i + 7, seed) * 2.2;
        const y = (U.hash(seed, i + 11) - 0.5) * r.w * 0.5 + (h > 0.5 ? 1 : -1) * r.w * 0.12;
        g.fillStyle = `rgba(22,20,18,${0.05 + 0.1 * U.hash(i, 99) * (1 - t / 11)})`;
        g.fillRect(s0 + sg * t - (sg < 0 ? len : 0), y, len, Math.max(0.01, 0.018 + U.hash(i, 5) * 0.03));
      }
      // the heaviest rubber is right at the touchdown point
      const gr = g.createLinearGradient(s0 + sg * 1.2, 0, s0 + sg * 9, 0);
      gr.addColorStop(0, 'rgba(20,18,16,0)'); gr.addColorStop(0.25, 'rgba(20,18,16,0.2)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr; g.fillRect(Math.min(s0 + sg * 1.2, s0 + sg * 9), -r.w * 0.22, 7.8, r.w * 0.44);
    }
    g.restore();
  }
  // tyre tracks: the nose and main gear follow the line
  if (ppu >= 8) {
    g.strokeStyle = 'rgba(20,18,16,0.07)'; g.lineWidth = 0.09; g.lineCap = 'round';
    for (const c of G.cl) { g.beginPath(); linePath(g, c.pts); g.stroke(); }
  }
  // stands: a dark patch where the nose and engines stop
  if (ppu >= 10) for (const { a } of ars) for (const s of a.p.stands || []) {
    const S0 = IC.STAND[s.size] || IC.STAND.m, cx = s.x + Math.cos(s.a) * S0.d * 0.12, cy = s.y + Math.sin(s.a) * S0.d * 0.12, r = S0.w * 0.28;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(30,28,24,0.09)'); gr.addColorStop(1, 'rgba(30,28,24,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
}
/* the edge lines: a continuous yellow line (two, close in) along the edge of the full-strength pavement, where it meets
   the shoulder or grass. Painted on a layer: the pavement's outline less the pavement shrunk by the line's width,
   less the runways and aprons it runs into */
let LAY = null;
function layer(w, h) { if (!LAY || LAY.width < w || LAY.height < h) LAY = mk(Math.max(w, LAY ? LAY.width : 0), Math.max(h, LAY ? LAY.height : 0)); return LAY; }
function edgeLines(g, ap, G, R, ppu, box, o) {
  const T = g.getTransform(), W = g.canvas.width, H = g.canvas.height, L = layer(W, H), lg = L.getContext('2d');
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, W, H); lg.setTransform(T);
  const px = 1 / ppu, lw = Math.max(0.0015, 0.9 * px), gap = Math.max(0.0015, 0.9 * px), dbl = ppu >= 150;
  const tws = R.tw.filter(q => !q.t.lane && hit(q.bb, box));
  const band = (e, op) => {
    lg.globalCompositeOperation = op; lg.fillStyle = lg.strokeStyle = '#000'; lg.lineCap = 'round'; lg.lineJoin = 'round';
    for (const { t } of tws) { lg.lineWidth = Math.max(0.001, t.w - 2 * e); lg.beginPath(); linePath(lg, t.pts); lg.stroke(); }
    for (const f of IC.paveFillets(ap, -e)) if (hit(bbOf(f.poly, 0), box)) { lg.beginPath(); polyPath(lg, f.poly); lg.fill(); }
  };
  band(0, 'source-over'); band(lw, 'destination-out');
  if (dbl) { band(lw + gap, 'source-over'); band(2 * lw + gap, 'destination-out'); }
  // not across a runway, an apron, a pad or a taxilane
  lg.globalCompositeOperation = 'destination-out';
  for (const { r, bb } of R.rw) if (hit(bb, box)) { lg.beginPath(); rwPath(lg, r, 0.004, 0); lg.fill(); }
  for (const { a, bb } of R.ar) if (hit(bb, box)) { lg.beginPath(); polyPath(lg, a.poly); lg.fill(); }
  // the aprons' own edge: inside their outline, cut where a taxiway comes in
  lg.globalCompositeOperation = 'source-over';
  for (const { a, bb } of R.ar) if (!a.fore && hit(bb, box)) {
    lg.save(); lg.beginPath(); polyPath(lg, a.poly); lg.clip();
    lg.lineWidth = 2 * lw; lg.beginPath(); polyPath(lg, a.poly); lg.stroke();
    if (dbl) { lg.lineWidth = 2 * (2 * lw + gap); lg.stroke(); lg.globalCompositeOperation = 'destination-out'; lg.lineWidth = 2 * (lw + gap); lg.stroke(); lg.globalCompositeOperation = 'source-over'; lg.lineWidth = 2 * lw; lg.stroke(); }
    lg.restore();
  }
  lg.globalCompositeOperation = 'destination-out';
  for (const { t } of tws) { lg.lineWidth = t.w * 0.98; lg.beginPath(); linePath(lg, t.pts); lg.stroke(); }
  for (const { f, bb } of R.fil) if (hit(bb, box)) { lg.beginPath(); polyPath(lg, f.poly); lg.fill(); }
  for (const { r, bb } of R.rw) if (hit(bb, box)) { lg.beginPath(); rwPath(lg, r, 0.004, 0); lg.fill(); }
  // tint the mask yellow and lay it on
  lg.globalCompositeOperation = 'source-in'; lg.setTransform(1, 0, 0, 1, 0, 0); lg.fillStyle = YEL; lg.fillRect(0, 0, W, H);
  lg.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = o.edgeAlpha || 0.92; g.drawImage(L, 0, 0, W, H, 0, 0, W, H); g.restore();
}
/* hold lines: four yellow lines across the taxiway, the two on the taxiway side solid, the two on the runway side
   dashed (a pilot may cross them leaving the runway, never entering) */
function holdLines(g, ap, ppu, box) {
  const px = 1 / ppu, lw = Math.max(0.003, 0.9 * px), st = Math.max(0.006, 1.8 * px);
  for (const b of IC.aptHoldBars(ap)) {
    if (b.x < box.x0 - 1 || b.x > box.x1 + 1 || b.y < box.y0 - 1 || b.y > box.y1 + 1) continue;
    g.save(); g.translate(b.x, b.y); g.rotate(Math.atan2(b.uy, b.ux));   // x away from the runway
    const hw = b.w / 2;
    g.fillStyle = YEL;
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * st;
      if (x > 0) { g.fillRect(x - lw / 2, -hw, lw, 2 * hw); continue; }
      // dashed: 1 m dashes and gaps
      const d = Math.max(0.01, 3 * px); for (let y = -hw; y < hw; y += 2 * d) g.fillRect(x - lw / 2, y, lw, Math.min(d, hw - y));
    }
    g.restore();
  }
}
/* one-way taxiways: arrows along the centreline; a preferred flow fainter */
function oneWay(g, t, ppu) {
  const dir = t.p.oneway || t.p.flow, px = 1 / ppu;
  g.strokeStyle = t.p.oneway ? YEL : 'rgba(232,188,52,0.5)'; g.lineWidth = Math.max(0.006, 1 * px); g.lineCap = 'butt';
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1], b = t.pts[i], L = U.dist(a, b); if (L < 0.3) continue;
    const ux = (b.x - a.x) / L * dir, uy = (b.y - a.y) / L * dir, k = 0.06;
    for (let s = 0.6; s < L - 0.3; s += 1.2) {
      const cx = a.x + (b.x - a.x) * s / L, cy = a.y + (b.y - a.y) * s / L;
      g.beginPath(); g.moveTo(cx - ux * k - uy * k, cy - uy * k + ux * k); g.lineTo(cx, cy); g.lineTo(cx - ux * k + uy * k, cy - uy * k - ux * k); g.stroke();
    }
  }
}
/* the stands on an apron: the lead-in line curving in from the taxilane, the stop bar, the red safety line round the
   stand (where nothing may stand while an aircraft moves), the stand's number painted at the lead-in */
function standsPaint(g, ap, a, ppu, box) {
  const px = 1 / ppu;
  for (const s of a.p.stands || []) {
    if (s.x < box.x0 - 1.2 || s.x > box.x1 + 1.2 || s.y < box.y0 - 1.2 || s.y > box.y1 + 1.2) continue;
    const S0 = IC.STAND[s.size] || IC.STAND.m;
    // the lead-in from the taxilane node, joining the stand's own line behind it
    const n = s.via && ap.nodes[s.via];
    g.strokeStyle = YEL; g.lineWidth = Math.max(0.003, 0.9 * px); g.lineCap = 'butt';
    if (n) { const hx = Math.cos(s.a), hy = Math.sin(s.a), c = { x: s.fx - hx * 0.25, y: s.fy - hy * 0.25 }; g.beginPath(); g.moveTo(n.x, n.y); g.quadraticCurveTo(c.x, c.y, s.fx, s.fy); g.stroke(); }
    g.save(); g.translate(s.x, s.y); g.rotate(s.a);
    g.beginPath(); g.moveTo(-S0.d / 2 - 0.08, 0); g.lineTo(s.drive ? S0.d / 2 + 0.08 : S0.d * 0.36, 0); g.stroke();
    // stop bar across the line, and marks for the smaller types short of it
    g.fillStyle = YEL; g.fillRect(S0.d * 0.36, -0.035, Math.max(0.006, 1.4 * px), 0.07);
    if (ppu >= 60) for (const k of [0.3, 0.24]) g.fillRect(S0.d * k, -0.018, Math.max(0.004, 1 * px), 0.036);
    // the safety line: red, broken where the aircraft comes in
    if (ppu >= 20) {
      g.strokeStyle = RED; g.lineWidth = Math.max(0.003, 0.8 * px);
      const x0 = -S0.d / 2 + 0.02, x1 = S0.d / 2 - 0.02, y0 = -S0.w / 2 + 0.02, y1 = S0.w / 2 - 0.02;
      g.beginPath(); g.moveTo(x0 + 0.12, y0); g.lineTo(x1, y0); g.lineTo(x1, y1); g.lineTo(x0 + 0.12, y1); g.stroke();
      // the equipment line behind the wingtips: red and white
      if (ppu >= 40) { g.setLineDash([0.02, 0.02]); g.strokeStyle = WHITE; g.beginPath(); g.moveTo(x1 - 0.06, y0 + 0.02); g.lineTo(x1 - 0.06, y1 - 0.02); g.stroke(); g.setLineDash([]); }
    }
    g.restore();
    // the number, painted on the pavement at the lead-in: black box, yellow figures
    if (ppu >= 30) {
      const t = String(s.name || s.id.split('s').pop()).slice(0, 4), fx = s.fx, fy = s.fy;
      g.save(); g.translate(fx, fy); g.rotate(s.a + Math.PI / 2);
      const h = 0.05, w = h * 0.62 * t.length + 0.02;
      g.fillStyle = 'rgba(16,16,16,0.85)'; g.fillRect(-w / 2, -h * 0.6 - 0.1, w, h * 1.2);
      g.font = `700 ${h}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = YEL; g.fillText(t, 0, -0.1);
      g.restore();
    }
  }
}
/* the service road along a terminal or shed, on its forecourt: a white line at the head of the stands, a dashed
   centreline, and zebra crossings where people walk out to aircraft on stands without a bridge */
function forecourt(g, ap, a, ppu) {
  const b = IC.aptFence(ap), p = a.p, px = 1 / ppu;
  g.save();
  if (b && b.carve.length) { g.beginPath(); g.rect(-1e6, -1e6, 2e6, 2e6); for (const cv of b.carve) polyPath(g, cv); g.clip('evenodd'); }
  const outline = p.poly ? IC.partOutline(p) : IC.partOutline(Object.assign({}, p, { poly: null }));
  const at = d => (p.poly ? IC.polyGrow(outline, d) : IC.partOutline(Object.assign({}, p, { poly: null, w: p.w + 2 * d, h: p.h + 2 * d })));
  g.strokeStyle = WHITE; g.lineWidth = Math.max(0.003, 0.8 * px);
  g.beginPath(); polyPath(g, at(0.145)); g.stroke();
  if (ppu >= 20) { g.setLineDash([0.03, 0.03]); g.beginPath(); polyPath(g, at(0.075)); g.stroke(); g.setLineDash([]); }
  if (ppu >= 30) for (const q of ap.parts) if (q.kind === 'apron' && q.built) for (const s of q.stands || []) {
    if (s.contact || IC.partDist(ap, p, s) > 0.9) continue;
    // a zebra across the road, facing the stand
    const e = at(0.075), N = nearestOn(e, s); if (!N) continue;
    g.save(); g.translate(N.x, N.y); g.rotate(Math.atan2(N.uy, N.ux)); g.fillStyle = WHITE;
    for (let k = -3; k <= 3; k++) g.fillRect(k * 0.012 - 0.004, -0.06, 0.008, 0.12);
    g.restore();
  }
  g.restore();
}
function nearestOn(P, q) {
  let best = null, bd = 1e9;
  for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], L = U.dist(A, B) || 1, ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, t = U.clamp((q.x - A.x) * ux + (q.y - A.y) * uy, 0.05, L - 0.05), x = A.x + ux * t, y = A.y + uy * t, d = U.dxy(x, y, q.x, q.y); if (d < bd) { bd = d; best = { x, y, ux, uy }; } }
  return best;
}
/* runway markings (render-airport.js draws them to the FAA's standard): in the runway's own frame */
function runwayPaint(g, r, ppu) {
  const p = r.p, L = r.L;
  g.save(); g.translate((r.a.x + r.b.x) / 2, (r.a.y + r.b.y) / 2); g.rotate(Math.atan2(r.d.y, r.d.x));
  if (p.wear > 0.2) { g.fillStyle = 'rgba(20,18,16,0.45)'; const n = Math.round(p.wear * 40); for (let i = 0; i < n; i++) { const hx = (U.hash(i, 7) - 0.5) * L * 0.9, hy = (U.hash(7, i) - 0.5) * r.w * 0.8; g.fillRect(hx, hy, 0.25 + U.hash(i, i) * 0.4, 0.04 + U.hash(i, 3) * 0.08); } }
  if (ppu >= 3) IC.runwayMarks(g, p, L, ppu >= 16, 1 / ppu);
  else { g.fillStyle = 'rgba(236,236,226,0.5)'; g.fillRect(-L / 2 + 0.5, -0.5 / ppu, L - 1, 1 / ppu); }
  g.restore();
}

/* ---------- the tiles ----------
   Seven levels, each 2.5 times the last, from the regional zoom to the gate. A frame draws the level that is at least
   as sharp as the screen, from tiles painted within a time budget; where one is missing, the next coarser level
   shows until it is painted. */
const LEVELS = [1.6, 4, 10, 25, 64, 160, 400], TPX = 512, MAXT = 90;
const TILES = new Map();
let tick = 0, spent = 0, spentT = 0;
IC.paveLevels = LEVELS;
IC.paveTilesDrop = ap => { for (const k of [...TILES.keys()]) if (!ap || k.startsWith(ap.id + ':')) TILES.delete(k); };
function paintTile(S, ap, li, tx, ty) {
  const ppu = LEVELS[li], T = TPX / ppu, cv = mk(TPX), g = cv.getContext('2d');
  const x0 = tx * T, y0 = ty * T;
  g.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
  IC.pavePaint(g, S, ap, ppu, { x0: x0 - 0.5, y0: y0 - 0.5, x1: x0 + T + 0.5, y1: y0 + T + 0.5 });
  return cv;
}
/* draw an airport's pavement for the camera; budget is in ms per frame; returns the tiles painted */
IC.drawPaveTiles = function (g, S, ap, z, dpr, budget) {
  const G = IC.paveGeom(ap); if (!G.bb) return 0;
  if (ap._ptSig !== G.sig) { IC.paveTilesDrop(ap); ap._ptSig = G.sig; }
  const now = performance.now();
  if (now - spentT > 12) { spent = 0; spentT = now; }
  tick++;
  const want = z * dpr;
  let li = LEVELS.findIndex(l => l >= want * 0.92); if (li < 0) li = LEVELS.length - 1;
  const V = IC.rs.view, bb = { x0: G.bb.x0 - 2, y0: G.bb.y0 - 2, x1: G.bb.x1 + 2, y1: G.bb.y1 + 2 };
  const vx0 = Math.max(V.x0, bb.x0), vy0 = Math.max(V.y0, bb.y0), vx1 = Math.min(V.x1, bb.x1), vy1 = Math.min(V.y1, bb.y1);
  if (vx1 <= vx0 || vy1 <= vy0) return 0;
  let made = 0;
  const draw = (li, paint) => {
    const T = TPX / LEVELS[li], ov = 0.5 / want; let missing = 0;
    const list = [];
    for (let ty = Math.floor(vy0 / T); ty <= Math.floor(vy1 / T); ty++) for (let tx = Math.floor(vx0 / T); tx <= Math.floor(vx1 / T); tx++) list.push([tx, ty]);
    const cx = (vx0 + vx1) / 2 / T, cy = (vy0 + vy1) / 2 / T;
    list.sort((a, b) => U.dxy(a[0] + 0.5, a[1] + 0.5, cx, cy) - U.dxy(b[0] + 0.5, b[1] + 0.5, cx, cy));
    for (const [tx, ty] of list) {
      const key = ap.id + ':' + li + ':' + tx + ':' + ty;
      let t = TILES.get(key);
      if (!t && paint && spent < budget) { const t0 = performance.now(); t = { cv: paintTile(S, ap, li, tx, ty), used: 0 }; TILES.set(key, t); spent += performance.now() - t0; made++; }
      if (!t) { missing++; continue; }
      // (half a pixel over each neighbour, so no seam shows between tiles)
      t.used = tick; g.drawImage(t.cv, tx * T - ov, ty * T - ov, T + 2 * ov, T + 2 * ov);
    }
    return missing;
  };
  // the coarser level under it first, while this one is still being painted
  const has = (l) => { const T = TPX / LEVELS[l]; for (let ty = Math.floor(vy0 / T); ty <= Math.floor(vy1 / T); ty++) for (let tx = Math.floor(vx0 / T); tx <= Math.floor(vx1 / T); tx++) if (!TILES.has(ap.id + ':' + l + ':' + tx + ':' + ty)) return false; return true; };
  if (!has(li)) { for (let l = li - 1; l >= 0; l--) if (has(l) || l === 0) { draw(l, l === 0); break; } }
  draw(li, true);
  if (TILES.size > MAXT) { const all = [...TILES.entries()].sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < all.length - MAXT; i++) TILES.delete(all[i][0]); }
  return made;
};
/* the whole pavement on one canvas at ppu pixels a unit (the 3D view's ground); cached until it changes */
IC.paveCanvas = function (S, ap, ppu) {
  const G = IC.paveGeom(ap); if (!G.bb) return null;
  if (ap._pcv && ap._pcv.sig === G.sig && ap._pcv.ppu === ppu) return ap._pcv;
  const bb = { x0: G.bb.x0 - 1, y0: G.bb.y0 - 1, x1: G.bb.x1 + 1, y1: G.bb.y1 + 1 };
  let k = ppu; while ((bb.x1 - bb.x0) * k > 4096 || (bb.y1 - bb.y0) * k > 4096) k *= 0.8;
  const cv = mk(Math.ceil((bb.x1 - bb.x0) * k), Math.ceil((bb.y1 - bb.y0) * k)), g = cv.getContext('2d');
  g.setTransform(k, 0, 0, k, -bb.x0 * k, -bb.y0 * k);
  IC.pavePaint(g, S, ap, k, bb, { noSurround: false });
  ap._pcv = { sig: G.sig, ppu, cv, bb, k };
  return ap._pcv;
};
})(window.IC);
