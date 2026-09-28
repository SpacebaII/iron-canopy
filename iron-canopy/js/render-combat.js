/* Iron Canopy — combat drawing: unit and threat symbols, our units and their ranges, the enemy we know about,
   tracks and aircraft, missiles, explosions, smoke, debris and wrecks. render.js calls IC.drawForces and IC.drawCombat. */
(function (IC) {
'use strict';
const U = IC.U, C = IC.C, cam = IC.cam, RS = IC.rs;
let ctx = null, WF = 0;
const inView = (x, y, m) => RS.inView(x, y, m);
const label = (...a) => RS.label(...a), brackets = (...a) => RS.brackets(...a), shadow = (...a) => RS.shadow(...a);


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
/* ---------- unit symbols: a shape language by role ----------
   The frame says what kind of system it is, the glyph inside says which one:
   search radar ○ · fire-control radar ○ with a reticle · passive sensor ○ dashed · launchers ⌂ growing from short to
   long range with one, two or three missiles · ballistic missile defence ⬡ · guns and point defence ▢ · electronic
   warfare ⯃ · strike ▷ · logistics ▭. The same drawing serves the map, the arsenal and the panels. */
const ROLE_NAME = { search: 'search radar', fc: 'fire-control radar', passive: 'passive sensor', sr: 'short-range launcher', mr: 'medium-range launcher', lr: 'long-range launcher', bmd: 'ballistic missile defence', gun: 'gun or point defence', ew: 'electronic warfare', strike: 'strike', logi: 'logistics' };
IC.ROLE_NAME = ROLE_NAME;
IC.unitRole = function (d) {
  if (!d) return 'logi';
  if (d.symRole) return d.symRole;
  if (d.logi) return 'logi';
  if (d.weapon === 'strike') return 'strike';
  if (d.weapon === 'ecm' || d.weapon === 'decoy' || d.ew) return 'ew';
  if (d.weapon === 'gun' || d.weapon === 'laser' || d.weapon === 'hpm') return 'gun';
  if (d.weapon === 'sam') {
    const M = d.mags && d.mags[0] && IC.MUN[d.mags[0].mun];
    if ((d.fc && d.fc.bmdOnly) || (M && M.seeker === 'HTK' && !(M.vs && M.vs.air))) return 'bmd';
    const R = M ? M.range : 0;
    return R >= 800 ? 'lr' : R >= 250 ? 'mr' : 'sr';
  }
  if (d.sensor) return d.sensor.passive ? 'passive' : d.sensor.rktOnly || d.sensor.bmdOnly || d.fcOnly ? 'fc' : 'search';
  return 'logi';
};
// range rings: each role draws its reach in its own dash
const RING = { search: [10, 6], fc: [4, 3], passive: [1.5, 6], sr: [1.5, 4], mr: [9, 5], lr: [], bmd: [14, 4, 2, 4], gun: [1.5, 3], ew: [2, 5, 6, 5], strike: [2, 5], logi: [8, 6] };
IC.ringDash = (d, px) => (RING[IC.unitRole(d)] || [6, 6]).map(v => v * px);

function framePath(g, role) {
  g.beginPath();
  switch (role) {
    case 'search': case 'fc': case 'passive': g.arc(0, 0, 9.5, 0, 7); break;
    case 'sr': case 'mr': case 'lr': {
      const w = role === 'sr' ? 8.5 : role === 'mr' ? 10.5 : 12.5, h = role === 'sr' ? 8 : role === 'mr' ? 9 : 10;
      g.moveTo(-w, h); g.lineTo(w, h); g.lineTo(w, -h * 0.25); g.lineTo(0, -h - 1.5); g.lineTo(-w, -h * 0.25); g.closePath(); break;
    }
    case 'bmd': g.moveTo(0, -12); g.lineTo(10, -6); g.lineTo(10, 6); g.lineTo(0, 12); g.lineTo(-10, 6); g.lineTo(-10, -6); g.closePath(); break;
    case 'gun': g.roundRect ? g.roundRect(-8.5, -8.5, 17, 17, 3.5) : g.rect(-8.5, -8.5, 17, 17); break;
    case 'ew': g.moveTo(-8, -7.5); g.lineTo(8, -7.5); g.lineTo(11.5, -3.5); g.lineTo(11.5, 3.5); g.lineTo(8, 7.5); g.lineTo(-8, 7.5); g.lineTo(-11.5, 3.5); g.lineTo(-11.5, -3.5); g.closePath(); break;
    case 'strike': g.moveTo(-11, -7.5); g.lineTo(5, -7.5); g.lineTo(12, 0); g.lineTo(5, 7.5); g.lineTo(-11, 7.5); g.closePath(); break;
    default: g.rect(-11, -6.5, 22, 13);
  }
}
const FRAME_H = { search: 9.5, fc: 9.5, passive: 9.5, sr: 8, mr: 9, lr: 10, bmd: 12, gun: 8.5, ew: 7.5, strike: 7.5, logi: 6.5 };
IC.symHalfH = type => FRAME_H[IC.unitRole(IC.UNITS[type])] || 8;

/* small drawing words for glyphs, in symbol units (a frame is about 20 across) */
function L(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); }
function dish(g, x, y, r, a) { g.beginPath(); g.arc(x, y, r, a - 1.1, a + 1.1); g.stroke(); L(g, [x, y, x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05]); }
function missile(g, x, y, len, a, w) {
  const c = Math.cos(a), s = Math.sin(a), n = -s, m = c; w = w || 1.1;
  g.beginPath(); g.moveTo(x + c * len, y + s * len); g.lineTo(x + c * (len - 2) + n * w, y + s * (len - 2) + m * w); g.lineTo(x + n * w, y + m * w);
  g.lineTo(x - c * 0.8 + n * w * 2, y - s * 0.8 + m * w * 2); g.lineTo(x - c * 0.8 - n * w * 2, y - s * 0.8 - m * w * 2);
  g.lineTo(x - n * w, y - m * w); g.lineTo(x + c * (len - 2) - n * w, y + s * (len - 2) - m * w); g.closePath(); g.fill();
}
function arcs(g, x, y, n, r0, dr, a0, a1) { for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x, y, r0 + i * dr, a0, a1); g.stroke(); } }
function zig(g, x0, x1, y, amp, n) { g.beginPath(); for (let i = 0; i <= n; i++) g[i ? 'lineTo' : 'moveTo'](x0 + (x1 - x0) * i / n, y + (i % 2 ? -amp : amp)); g.stroke(); }
const UP = -Math.PI / 2;

/* one glyph per type; unknown types fall back to their role */
const GLYPH = {
  acou(g) { g.beginPath(); g.arc(-5, 0, 1.6, 0, 7); g.fill(); arcs(g, -5, 0, 3, 3.6, 2.8, -0.8, 0.8); },
  ssr(g) { g.lineWidth = 1.8; L(g, [-6, -3, 6, -3]); g.lineWidth = 1.2; L(g, [0, -3, 0, 5]); L(g, [-3, 5, 3, 5]); L(g, [-6, -5.5, -6, -0.5]); L(g, [6, -5.5, 6, -0.5]); },
  vhf(g) { L(g, [-7, 0, 7, 0]); for (const x of [-5, -1.7, 1.7, 5]) L(g, [x, -5, x, 5]); },
  lr3d(g) { dish(g, -2, 1, 6.5, UP + 0.35); for (const k of [-1, 0, 1]) L(g, [3, -2 + k * 2.6, 7.5, -3.5 + k * 3]); },
  mr3d(g) { dish(g, -1, 0, 5, UP + 0.4); L(g, [-6, 5, 5, 5]); g.beginPath(); g.arc(-4, 6.8, 1.2, 0, 7); g.arc(3, 6.8, 1.2, 0, 7); g.fill(); },
  gf(g) { dish(g, 0, -3.5, 4.2, UP + 0.4); L(g, [0, -3.5, 0, 7]); L(g, [-3, 7, 3, 7]); },
  esm(g) { L(g, [0, -7, 0, 6]); L(g, [-2.5, 6, 2.5, 6]); g.setLineDash([1.4, 1.2]); arcs(g, 0, -2, 2, 3.5, 2.6, -2.5, -0.64); arcs(g, 0, -2, 2, 3.5, 2.6, 0.64 - Math.PI, 2.5 - Math.PI); g.setLineDash([]); },
  cbr(g) { dish(g, -4, 3, 4.5, UP + 0.6); g.setLineDash([1.6, 1.3]); g.beginPath(); g.moveTo(-1, 3); g.quadraticCurveTo(3, -9, 7.5, 3); g.stroke(); g.setLineDash([]); },
  aero(g) { g.beginPath(); g.ellipse(0, -2.5, 6.5, 3.4, 0, 0, 7); g.stroke(); L(g, [-6.5, -2.5, -8.5, -5.5]); L(g, [-6.5, -2.5, -8.5, 0.5]); g.setLineDash([1.3, 1.2]); L(g, [0, 1, 0, 7.5]); g.setLineDash([]); },
  bmd(g) { g.save(); g.rotate(-0.35); g.fillRect(-2.2, -6.5, 4.4, 11); g.restore(); g.lineWidth = 0.9; L(g, [3.5, -6, 7.5, -8.5]); L(g, [4, -3, 8, -4.5]); },
  manpads(g) { missile(g, -5, 5, 10, -0.9, 0.9); g.beginPath(); g.arc(-4, 6, 1.5, 0, 7); g.stroke(); },
  spaag(g) { g.beginPath(); g.arc(0, 3, 4, Math.PI, 0); g.closePath(); g.fill(); g.lineWidth = 1.5; L(g, [-1.2, 0, 3.2, -6.5]); L(g, [1.4, 0.8, 5.8, -5.7]); },
  cram(g) { g.beginPath(); g.arc(-1, 2.5, 3.6, 0, 7); g.fill(); g.lineWidth = 1; for (const k of [-1, 0, 1]) L(g, [0.5 + k * 1.2, 0, 5 + k * 1.2, -6.5]); },
  shorad(g) { missile(g, 0, 4.5, 10, UP, 1.2); L(g, [-5, 6, 5, 6]); },
  mrsam(g) { missile(g, -3.5, 5.5, 11, UP - 0.25, 1.15); missile(g, 3.5, 5.5, 11, UP + 0.25, 1.15); L(g, [-7, 7, 7, 7]); },
  lrsam(g) { for (const x of [-6, -2, 2, 6]) g.fillRect(x - 1.4, -5.5, 2.8, 11); L(g, [-9, 7.5, 9, 7.5]); g.fillStyle = C.friendFill; for (const x of [-6, -2, 2, 6]) g.fillRect(x - 0.6, -4.7, 1.2, 1.4); },
  hatd(g) { missile(g, 0, 7, 11, UP, 1.25); g.lineWidth = 1.5; L(g, [-6.5, -6, 0, -9.5, 6.5, -6]); },
  exo(g) { missile(g, -1, 7.5, 10, UP, 1.15); g.beginPath(); g.ellipse(0, -6.5, 7, 2.4, -0.25, 0, 7); g.stroke(); g.beginPath(); g.arc(5.5, -8, 1.3, 0, 7); g.fill(); },
  laser(g) { g.beginPath(); g.moveTo(-6, 3); g.lineTo(-3, 0); g.lineTo(-6, -3); g.lineTo(-9, 0); g.closePath(); g.fill(); g.lineWidth = 1.8; L(g, [-3, 0, 7, -6]); g.lineWidth = 0.8; L(g, [-3, 0, 7, -6.2]); },
  hpm(g) { dish(g, -3, 1, 4.5, 0); for (const r of [4, 6.5]) { g.beginPath(); g.arc(-3, 1, r + 1.5, -0.6, 0.6); g.stroke(); } },
  gnss(g) { g.fillRect(-2, -2, 4, 4); L(g, [-7, -3, -3, 0, -7, 3]); L(g, [7, -3, 3, 0, 7, 3]); zig(g, -6, 6, 5.5, 1.3, 6); },
  decoy(g) { g.setLineDash([1.6, 1.3]); dish(g, 0, 1, 5.5, UP + 0.3); g.setLineDash([]); g.beginPath(); g.arc(0, 1, 1.2, 0, 7); g.fill(); },
  mlrs(g) { g.save(); g.rotate(-0.4); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(-4 + i * 3.6, -2 + j * 3.6, 1.35, 0, 7); g.stroke(); } g.restore(); },
  glcm(g) { missile(g, -8, 0, 14, 0, 1); g.lineWidth = 1.3; L(g, [-2, 0, -4, -4.5]); L(g, [-2, 0, -4, 4.5]); },
  tbml(g) { missile(g, -6, 5, 14, -0.8, 1.3); L(g, [-9, 6.5, 6, 6.5]); },
  depot(g) { g.strokeRect(-6, -3, 5.5, 5.5); g.strokeRect(0.5, -3, 5.5, 5.5); g.strokeRect(-2.75, -8.5, 5.5, 5.5); },
  heliport(g) { g.lineWidth = 1.8; L(g, [-4, -5, -4, 5]); L(g, [4, -5, 4, 5]); L(g, [-4, 0, 4, 0]); },
  // a broadcast mast whose signal bounces back: the passive radar
  pcl(g) { L(g, [-4, 6.5, -4, -6]); L(g, [-6.5, 6.5, -1.5, 6.5]); L(g, [-6.5, -3, -4, -6, -1.5, -3]); g.setLineDash([1.3, 1.2]); arcs(g, 1, 1, 2, 2.5, 2.6, -0.9, 0.9); g.setLineDash([]); g.beginPath(); g.arc(6.5, -5, 1.2, 0, 7); g.fill(); },
  // two small heat-seekers side by side with the thermal sight's eye
  vshorad(g) { missile(g, -2.8, 5, 8.5, UP, 0.9); missile(g, 2.8, 5, 8.5, UP, 0.9); g.beginPath(); g.ellipse(0, -5.8, 2, 1.1, 0, 0, 7); g.stroke(); },
  // one short barrel and the airburst it throws
  dgun(g) { g.beginPath(); g.arc(-2, 3, 3, Math.PI, 0); g.closePath(); g.fill(); g.lineWidth = 1.5; L(g, [-1, 1, 3, -4]); g.lineWidth = 1; for (const [x, y] of [[5.5, -6.5], [3.5, -7.5], [6.5, -4]]) { g.beginPath(); g.arc(x, y, 0.8, 0, 7); g.fill(); } },
  // a rack of small interceptor drones
  idl(g) { for (const [x, y] of [[-3.3, -0.5], [3.3, -0.5], [0, 4]]) { g.beginPath(); g.moveTo(x, y - 2.4); g.lineTo(x + 2.6, y + 1.7); g.lineTo(x, y + 0.8); g.lineTo(x - 2.6, y + 1.7); g.closePath(); g.fill(); } L(g, [-6.5, 7, 6.5, 7]); },
  // a missile on a truck, with the arrow of a unit that moves after it fires
  mrmob(g) { missile(g, -6.5, 2, 11, -0.55, 1.1); L(g, [-8, 4, 3, 4]); g.lineWidth = 1.3; L(g, [2.5, 6.5, 8, 6.5]); L(g, [6, 4.8, 8, 6.5, 6, 8.2]); },
  // the command post: a flag, with datalink lines to the batteries it links
  cp(g) { L(g, [-5, 5, -5, -5]); g.beginPath(); g.moveTo(-5, -5); g.lineTo(1, -3); g.lineTo(-5, -1); g.closePath(); g.fill(); g.setLineDash([1.4, 1.1]); L(g, [-1, 3, 7, -1]); L(g, [-1, 3, 7, 5]); g.setLineDash([]); for (const y of [-1, 5]) { g.beginPath(); g.arc(7.5, y, 1.1, 0, 7); g.fill(); } },
  // a small laser turret: the big one's diamond, shorter beam
  mlaser(g) { g.beginPath(); g.moveTo(-4.5, 4); g.lineTo(-2, 1.5); g.lineTo(-4.5, -1); g.lineTo(-7, 1.5); g.closePath(); g.fill(); g.lineWidth = 0.9; L(g, [-2, 1.5, 4, -3.5]); L(g, [-2, 1.9, 4.2, -3.1]); g.lineWidth = 1; for (const a of [0, 1.6, 3.2, 4.8]) L(g, [4 + Math.cos(a) * 1.3, -3.5 + Math.sin(a) * 1.3, 4 + Math.cos(a) * 3, -3.5 + Math.sin(a) * 3]); L(g, [-7, 6.5, 0, 6.5]); }
};
const ROLE_GLYPH = { search: 'lr3d', fc: 'cbr', passive: 'esm', sr: 'shorad', mr: 'mrsam', lr: 'lrsam', bmd: 'hatd', gun: 'spaag', ew: 'gnss', strike: 'mlrs', logi: 'depot' };

/* opts: aff, tint (wash over the frame), dash (silent: dashed frame), radar ('on' | 'silent'), reload (0..1 while every
   magazine is empty), damaged, now (seconds, animates the radar waves) */
IC.drawUnitSymbol = function (g, type, x, y, s, col, opts) {
  const d = IC.UNITS[type]; if (!d) return;
  opts = opts || {};
  const role = IC.unitRole(d), civil = d.civil;
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
  framePath(g, role);
  g.fillStyle = civil ? '#b8f5d2' : C.friendFill; g.fill();
  if (opts.tint) { g.fillStyle = opts.tint; g.fill(); }
  g.strokeStyle = C.ink; g.lineWidth = 1.4;
  if (opts.dash || role === 'passive') g.setLineDash(opts.dash ? [2.2, 1.8] : [3, 1.6]);
  g.stroke(); g.setLineDash([]);
  if (role === 'fc') { g.lineWidth = 1.3; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), sn = Math.sin(a); L(g, [c * 9.5, sn * 9.5, c * 12.5, sn * 12.5]); } }
  if (role === 'lr') { g.lineWidth = 1; L(g, [-10, -1.2, 0, -8.6, 10, -1.2]); }
  g.strokeStyle = C.ink; g.fillStyle = C.ink; g.lineWidth = 1.2; g.lineCap = 'round';
  (GLYPH[type] || GLYPH[ROLE_GLYPH[role]] || GLYPH.depot)(g);
  g.lineCap = 'butt';
  const hh = FRAME_H[role] || 8;
  // mobility under the frame: wheels for semi-mobile, a track for mobile
  g.strokeStyle = col || C.friend; g.lineWidth = 1;
  if (d.mob === 'mobile') { g.beginPath(); g.ellipse(0, hh + 3, 7, 1.6, 0, 0, 7); g.stroke(); }
  else if (d.mob === 'semi') { g.beginPath(); g.arc(-4.5, hh + 3, 1.6, 0, 7); g.moveTo(6.1, hh + 3); g.arc(4.5, hh + 3, 1.6, 0, 7); g.stroke(); }
  // state marks, top right: radar waves when transmitting, a slash when silent
  if (opts.radar) {
    const ox = role === 'gun' ? 7.5 : role === 'bmd' ? 7 : 8.5, oy = -hh + (role === 'bmd' ? 3 : 0.5);
    if (opts.radar === 'on') {
      const p = opts.now != null ? (opts.now * 1.4) % 1 : 0.6;
      g.lineWidth = 1.2;
      for (const k of [0, 1]) { const r = 2.5 + ((p + k * 0.5) % 1) * 5; g.strokeStyle = `rgba(160,230,255,${0.95 * (1 - ((p + k * 0.5) % 1))})`; g.beginPath(); g.arc(ox, oy, r, -1.45, -0.15); g.stroke(); }
    } else { g.strokeStyle = 'rgba(154,176,191,0.9)'; g.lineWidth = 1.1; g.beginPath(); g.arc(ox, oy, 3.5, -1.45, -0.15); g.stroke(); L(g, [ox - 1, oy + 1, ox + 5, oy - 5]); }
  }
  if (opts.reload != null) { g.strokeStyle = C.amber; g.lineWidth = 1.8; g.beginPath(); g.arc(-10, -hh + 1, 3, -Math.PI / 2, -Math.PI / 2 + 6.283 * opts.reload); g.stroke(); }
  if (opts.damaged) { g.strokeStyle = C.hostile; g.lineWidth = 1.5; L(g, [-3, -hh - 1, -1, -hh + 3, -3.5, -hh + 5.5, -1.5, -hh + 8]); }
  g.restore();
};

/* ---------- threat symbols ----------
   Hostile and suspect tracks keep the peaked frame; once the type is known a glyph inside says what it is. */
const TGLYPH = {
  drone(g) { g.beginPath(); g.moveTo(0, -3.5); g.lineTo(4.5, 2.5); g.lineTo(0, 1); g.lineTo(-4.5, 2.5); g.closePath(); g.fill(); },
  owa(g) { TGLYPH.drone(g); g.lineWidth = 1.4; L(g, [-2.2, 3.6, 2.2, 3.6]); },
  jdr(g) { g.beginPath(); g.moveTo(0, -4); g.lineTo(3, 2.5); g.lineTo(0, 1.5); g.lineTo(-3, 2.5); g.closePath(); g.fill(); L(g, [-1, 3, -1, 5]); L(g, [1, 3, 1, 5]); },
  isr(g) { TGLYPH.drone(g); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -0.6, 0.9, 0, 7); g.fill(); },
  lm(g) { TGLYPH.drone(g); g.beginPath(); g.arc(0, -0.5, 5.5, 3.6, 5.8); g.stroke(); },
  cm(g) { g.fillRect(-5.5, -0.7, 10, 1.4); L(g, [5.5, 0, 4.2, -0.9]); L(g, [-1, 0, -3, -3]); L(g, [-1, 0, -3, 3]); L(g, [-5.5, 0, -6.5, -2]); },
  scm(g) { TGLYPH.cm(g); L(g, [6.5, -2.5, 8, 0, 6.5, 2.5]); },
  glb(g) { g.fillRect(-4, -0.9, 8, 1.8); L(g, [-2, -3.5, 2, 3.5]); },
  bal(g) { L(g, [0, -5, 0, 3]); g.beginPath(); g.moveTo(0, 5); g.lineTo(2.3, 1.5); g.lineTo(-2.3, 1.5); g.closePath(); g.fill(); L(g, [-2, -5, 0, -3, 2, -5]); },
  marv(g) { TGLYPH.bal(g); L(g, [3.5, -2, 5, 0, 3.5, 2]); },
  hgv(g) { g.lineWidth = 1.6; L(g, [-5, -2, 0, 2.5, 5, -2]); g.lineWidth = 1; L(g, [-5, -4.5, 0, 0, 5, -4.5]); },
  rkt(g) { L(g, [0, -4, 0, 3]); g.beginPath(); g.arc(0, 3.5, 1.2, 0, 7); g.fill(); },
  arm(g) { missile(g, -5, 1.5, 9, -0.2, 0.8); arcs(g, 5.5, 0, 2, 1.8, 1.8, -0.9, 0.9); },
  ftr(g) { g.beginPath(); g.moveTo(0, -5); g.lineTo(1, -1); g.lineTo(5, 1.5); g.lineTo(1, 1); g.lineTo(1.5, 4); g.lineTo(0, 3.2); g.lineTo(-1.5, 4); g.lineTo(-1, 1); g.lineTo(-5, 1.5); g.lineTo(-1, -1); g.closePath(); g.fill(); },
  str(g) { TGLYPH.ftr(g); g.beginPath(); g.arc(-3, 3, 0.9, 0, 7); g.arc(3, 3, 0.9, 0, 7); g.fill(); },
  sead(g) { TGLYPH.ftr(g); arcs(g, 0, -4.5, 1, 2.5, 0, -2.4, -0.7); },
  ewj(g) { g.lineWidth = 1.5; zig(g, -5.5, 5.5, 0, 2.6, 5); },
  heli(g) { g.beginPath(); g.ellipse(0, 1, 2.2, 3.2, 0, 0, 7); g.fill(); g.lineWidth = 1.3; L(g, [-5.5, -2.5, 5.5, -2.5]); L(g, [0, 4, 0, 6.5]); },
  esj(g) { TGLYPH.drone(g); g.lineWidth = 1; zig(g, -5, 5, -5, 1.1, 4); },
  bmr(g) { g.beginPath(); g.moveTo(0, -4.5); g.lineTo(6.5, 1.5); g.lineTo(6.5, 2.8); g.lineTo(0, 0.5); g.lineTo(-6.5, 2.8); g.lineTo(-6.5, 1.5); g.closePath(); g.fill(); L(g, [0, -5, 0, 4]); },
  // enemy installations and launchers
  runway(g) { g.lineWidth = 2.2; L(g, [-5, 4, 5, -4]); g.lineWidth = 0.8; L(g, [-3.5, -1, -1, 2]); L(g, [1, -2, 3.5, 1]); },
  crate(g) { g.strokeRect(-4.5, -3.5, 9, 7); L(g, [-4.5, -3.5, 4.5, 3.5]); },
  flag(g) { L(g, [-3, 5, -3, -5]); g.beginPath(); g.moveTo(-3, -5); g.lineTo(4, -3); g.lineTo(-3, -0.5); g.closePath(); g.fill(); },
  tubes(g) { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(-3 + i * 3, -1.5 + j * 3, 1.1, 0, 7); g.stroke(); } },
  tel(g) { missile(g, -5, 4, 10, -0.9, 1); L(g, [-6, 5, 5, 5]); },
  dcy(g) { g.setLineDash([1.3, 1.1]); g.beginPath(); g.moveTo(0, -5); g.lineTo(5, 1.5); g.lineTo(0, 0); g.lineTo(-5, 1.5); g.closePath(); g.stroke(); g.setLineDash([]); }
};
const SITE_GLYPH = { airbase: 'runway', drone: 'drone', cm: 'cm', bm: 'bal', mrbm: 'bal', hgv: 'hgv', rkt: 'tubes', supply: 'crate', staging: 'flag' };
const TGLYPH_OF = { owa: 'owa', jdr: 'jdr', lm: 'lm', isr: 'isr', lacm: 'cm', mcm: 'cm', scm: 'scm', glb: 'glb', srbm: 'bal', marv: 'marv', mrbm: 'bal', pen: 'bal', hgv: 'hgv', rkt: 'rkt', arm: 'arm', dcy: 'dcy', ftr: 'ftr', str: 'str', sead: 'sead', ewj: 'ewj', esj: 'esj', ahe: 'heli', bmr: 'bmr' };
const KLASS_GLYPH = { heli: 'heli', drone: 'drone', cm: 'cm', ballistic: 'bal', rocket: 'rkt', fighter: 'ftr', bomber: 'bmr', jammer: 'ewj' };
IC.threatGlyph = (type, klass) => TGLYPH_OF[type] || KLASS_GLYPH[klass] || KLASS_GLYPH[IC.THR[type] && IC.THR[type].klass];
function threatGlyph(g, key, x, y, s, col) {
  const f = TGLYPH[key]; if (!f) return;
  g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.1; g.lineCap = 'round'; g.lineJoin = 'round';
  f(g); g.restore();
}
/* the reference list and panels: a hostile frame with the type's glyph */
IC.drawThreatSymbol = function (g, type, x, y, s) {
  airFrame(g, 'H', x, y, s);
  threatGlyph(g, IC.threatGlyph(type), x, y - 2.4 * s, s * 1.15, '#ffe1dc');
};
/* air track frames: friend dome, hostile/suspect peak, unknown clover, civil box */
const AIRCOL = IC.AIRCOL = { F: C.friend, H: C.hostile, S: C.suspect, U: C.unknown, A: C.civil, N: C.civil, D: C.decoy };
function airFrame(g, aff, x, y, s) {
  const col = AIRCOL[aff] || C.unknown;
  g.strokeStyle = col; g.lineWidth = 1.6 * s;
  g.fillStyle = { H: 'rgba(120,24,16,0.72)', S: 'rgba(120,64,16,0.7)', U: 'rgba(242,209,74,0.22)', A: 'rgba(127,232,176,0.12)', N: 'rgba(127,232,176,0.18)', D: 'rgba(143,163,176,0.1)', F: 'rgba(111,210,255,0.25)' }[aff];
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

/* our units, the enemy we know about, and their ranges: drawn under the air picture */
IC.drawForces = function (S, px, now) {
  ctx = RS.ctx; WF = RS.WF;
  if (S.layers.intel) drawEnemy(S, px, now);
  drawRanges(S, px, now);
  for (const u of S.units) if (inView(u.x, u.y, 200)) drawUnit(S, u, px, now);
};

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
    threatGlyph(ctx, SITE_GLYPH[s.kind] || 'crate', s.x, s.y, px * (s.kind === 'mrbm' ? 1.25 : 1.05), ink);
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
    threatGlyph(ctx, t.kind === 'rkt' ? 'tubes' : 'tel', t.kx, t.ky, px * 0.95, ink);
    label(`${U.dur(age)} ago`, t.kx, t.ky - 13 * px, px, 'rgba(255,170,160,0.9)', 9);
    ctx.globalAlpha = 1;
    if (S.sel && S.sel.ref === t) brackets(t.kx, t.ky, 12 * px, px);
  }
}

function drawRanges(S, px, now) {
  for (const u of S.units) {
    const sel = (S.sel && S.sel.ref === u) || S.group.includes(u);
    if (u.state !== 'ready' && !sel) continue;
    const d = u.d;
    if (d.sensor && !d.sensor.passive) {
      if (sel || (S.layers.rings && d.sensor.R > 1200 && u.radarOn && cam.z > 0.08)) {
        const R = d.sensor.R;
        ctx.strokeStyle = u.radarOn ? (u.jamF < 0.97 ? 'rgba(242,180,65,0.4)' : 'rgba(92,200,255,0.2)') : 'rgba(125,149,165,0.25)';
        ctx.lineWidth = 1 * px; ctx.setLineDash(IC.ringDash(d, px));
        ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        if (sel && d.sensor.nctrR) { ctx.strokeStyle = 'rgba(127,232,176,0.35)'; ctx.setLineDash([2 * px, 5 * px]); ctx.beginPath(); ctx.arc(u.x, u.y, d.sensor.nctrR * (IC.hasTech(S, 's_nctr') ? 1.5 : 1), 0, 7); ctx.stroke(); ctx.setLineDash([]); label('type recognition', u.x, u.y - d.sensor.nctrR - 4 * px, px, 'rgba(127,232,176,0.7)', 9); }
      }
      const fxMode = S.cfg.radarFx || 'subtle';
      if (u.radarOn && d.sensor.rot && fxMode !== 'off' && inView(u.x, u.y, d.sensor.R)) {
        const a = (u.phase || 0) + Math.PI * 2 * S.time / d.sensor.per;
        if (fxMode === 'full') {
          const R = Math.min(d.sensor.R, 2400);
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
    }
    const rng = IC.maxRange(S, u);
    if (rng && (sel || (S.layers.rings && (d.weapon === 'sam' || d.weapon === 'ecm') && cam.z * rng > 8))) {
      ctx.strokeStyle = sel ? 'rgba(242,180,65,0.75)' : d.weapon === 'ecm' ? 'rgba(160,220,255,0.18)' : 'rgba(92,200,255,0.2)';
      ctx.lineWidth = (sel ? 1.5 : 1) * px;
      ctx.setLineDash(IC.ringDash(d, px));
      ctx.beginPath(); ctx.arc(u.x, u.y, rng, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (IC.unitRole(d) === 'lr') { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(u.x, u.y, rng - 3 * px, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (u.type === 'depot' && (sel || S.layers.logistics && cam.z > 0.12) && !u.central) { ctx.strokeStyle = 'rgba(224,180,88,0.22)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([8 * px, 6 * px]); ctx.beginPath(); ctx.arc(u.x, u.y, u.reach || 1400, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
}

/* vehicles laid out around a unit's symbol when zoomed in */
function vehicles(S, u, px, now) {
  const d = u.d, n = d.weapon === 'sam' ? (u.mags[0] ? Math.min(6, Math.max(2, Math.ceil(u.mags[0].max / 2))) : 2) : d.sensor ? 1 : d.gun || d.weapon === 'strike' ? 2 : d.logi ? 3 : 1;
  // drawn large enough to see from afar; close in (an airfield's zoom) they close up to their real spacing and size
  const k = U.clamp(1.1 / cam.z, 0.035, 1), s = 0.9 * k;
  // from the regional zoom in, the unit stands as its own vehicles: launchers round the site, the radar vehicle beside them
  if (IC.modelTop && cam.z > 1.6) {
    const model = IC.modelOfUnit(u.type), nv = IC.unitVehicles(d), fixed = d.mob === 'fixed';
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * 6.283 + (u.id.charCodeAt(1) % 7), r = nv > 1 ? 4.5 * k : 0;
      IC.modelTop(ctx, model, u.x + Math.cos(a) * r + 6 * k, u.y + Math.sin(a) * r + 5 * k, fixed ? 0 : a + 1.2, { minPx: 14, shadow: 0.03, now: u.radarOn ? now : 0 });
    }
    if (d.weapon === 'sam' && !fixed && d.fc && !d.fc.passive) IC.modelTop(ctx, 'mr3d', u.x - 6 * k, u.y + 5 * k, 2.4, { minPx: 14, shadow: 0.03, now: u.radarOn ? now : 0 });
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (u.id.charCodeAt(1) % 7), r = n > 1 ? 4.5 * k : 0;
    const x = u.x + Math.cos(a) * r + 6 * k, y = u.y + Math.sin(a) * r + 5 * k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-1.4 * s + 0.3, -0.7 * s + 0.3, 2.8 * s, 1.4 * s);
    ctx.fillStyle = u.state === 'ready' ? 'rgb(78,92,70)' : 'rgb(110,100,70)'; ctx.fillRect(-1.4 * s, -0.7 * s, 2.8 * s, 1.4 * s);
    if (d.weapon === 'sam' || d.weapon === 'strike') { ctx.fillStyle = 'rgb(160,168,150)'; ctx.fillRect(-0.9 * s, -0.45 * s, 1.8 * s, 0.9 * s); }
    ctx.restore();
  }
  if (d.sensor && !d.sensor.passive || d.fc && !d.fc.passive) {
    const a = u.radarOn ? now * (d.sensor && d.sensor.rot ? 6.283 / Math.max(0.6, d.sensor.per / 10) : 3) : 0;
    ctx.save(); ctx.translate(u.x - 6 * k, u.y + 5 * k); ctx.rotate(a);
    ctx.fillStyle = 'rgb(200,205,210)'; ctx.fillRect(-1.8 * k, -0.25 * k, 3.6 * k, 0.5 * k);
    ctx.restore();
  }
}

/* while every magazine is empty but reloads are in the store: how far the next round is */
function reloadOf(S, u) {
  if (!u.mags.length || u.state !== 'ready') return null;
  let best = null;
  for (const m of IC.activeMags(S, u)) { if (m.mag > 0) return null; if (m.store > 0) best = Math.max(best || 0, m.rl / m.reload); }
  return best;
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
  const broken = Object.values(u.comp).some(v => v < 0.35);
  // close in the unit itself is on show: its symbol shrinks and fades to a marker above it
  const close = U.clamp((cam.z - 8) / 16, 0, 1);
  ctx.globalAlpha = 1 - close * 0.55;
  IC.drawUnitSymbol(ctx, u.type, u.x, u.y - close * 14 * px, px * 1.05 * (1 - close * 0.4), busy ? C.amber : C.friend, { dash: silent, tint: busy ? 'rgba(242,180,65,0.45)' : broken ? 'rgba(255,91,79,0.35)' : null,
    radar: u.emitter && u.state === 'ready' ? (u.radarOn ? 'on' : 'silent') : null, reload: reloadOf(S, u), damaged: broken || u.hp < u.max * 0.5, now });
  ctx.globalAlpha = 1;
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
    const P = tr.pts; if (P.length < 2 || tr._fx) continue;
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
  if (!t.held) {
    const gone = S.time - (t.pt || 0) - IC.coastT(t);
    if (t.tn && gone < IC.TRACK.lostShow && !t.d.civil) {
      ctx.globalAlpha = 0.45 * (1 - gone / IC.TRACK.lostShow); ctx.strokeStyle = C.muted; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 3 * px]);
      ctx.strokeRect(t.px - 5 * px, t.py - 5 * px, 10 * px, 10 * px); ctx.setLineDash([]);
      label(`${t.tn} LOST`, t.px + 8 * px, t.py - 6 * px, px, C.muted, 9, 'left');
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (!inView(t.px, t.py, 80)) return;
  if (t.border && !(S.sel && S.sel.ref === t) && cam.z < 0.1) return;
  const aff = t.decoyKnown ? 'D' : t.aff || 'U';
  // a track between plots, or coasting after contact is lost, stays steady: dimmer, with its uncertainty drawn
  const coasting = !t.det;
  const blink = coasting ? 0.6 : 1;
  const x = t.px, y = t.py;
  if (t.trail && t.trail.length > 1) {
    const rgb = t.type === 'ga' && aff !== 'H' && aff !== 'S' ? '201,176,255' : { H: '255,120,100', S: '255,170,90', A: '127,232,176', N: '127,232,176' }[aff] || '242,209,74';
    for (let i = 0; i < t.trail.length; i++) { const p = t.trail[i]; ctx.fillStyle = `rgba(${rgb},${0.08 + i * 0.05})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 * px, 0, 7); ctx.fill(); }
  }
  if (coasting && IC.drawTrackUnc) IC.drawTrackUnc(ctx, S, t, aff, px);
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
  const s = px * (t.d.cls === 'air' ? 1.3 : 1.05);
  let col;
  const mk = close && cam.z > 2.5 && IC.modelTop ? IC.modelOfThreat(t) : null;
  if (mk) {
    // close in, a track we can class is drawn as what it is; an unknown or suspect one keeps its identity colour as an outline
    col = AIRCOL[aff];
    IC.modelTop(ctx, mk, x, y, Math.atan2(t.pvy || t.vy, t.pvx || t.vx), { livery: t.livery, shadow: Math.min(3, t.alt * 0.25), minPx: 12, outline: aff === 'S' || aff === 'U' ? col : null, now });
  } else if (close && t.acType && cam.z > 2.5 && (aff === 'A' || aff === 'N')) {
    col = AIRCOL[aff];
    IC.drawPlane(ctx, x, y, Math.atan2(t.pvy || t.vy, t.pvx || t.vx), t.acType, t.livery, { shadow: Math.min(3, t.alt * 0.25), minPx: 12 });
  } else if (close) {
    col = AIRCOL[aff];
    const kind = t.klass === 'heli' ? 'heli' : t.type === 'esj' ? 'drone' : t.klass === 'bomber' || t.klass === 'jammer' ? 'bomber' : t.klass === 'airliner' ? 'airliner' : t.klass === 'light' ? 'light' : t.klass === 'drone' ? 'drone' : t.klass === 'cm' ? 'cm' : 'fighter';
    silhouette(ctx, kind, x, y, Math.atan2(t.pvy || t.vy, t.pvx || t.vx), Math.max(0.35 * (kind === 'airliner' || kind === 'bomber' ? 1.6 : 1), px * 1.3), col, 'rgba(0,0,0,0.7)');
  } else if (t.type === 'ga' && aff !== 'H' && aff !== 'S') {
    // light aircraft: a small lilac cross, never the airliner frame
    col = C.light; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * px;
    ctx.beginPath(); ctx.arc(x, y, 2.6 * px, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6.5 * px, y); ctx.lineTo(x + 6.5 * px, y); ctx.moveTo(x, y + 2.6 * px); ctx.lineTo(x, y + 6 * px); ctx.moveTo(x - 2.5 * px, y + 6 * px); ctx.lineTo(x + 2.5 * px, y + 6 * px); ctx.stroke();
  } else {
    col = airFrame(ctx, aff, x, y, s);
    // what it is, once we know: the type for a hostile, the class from type recognition, the arc for a ballistic missile
    const gk = aff === 'D' ? null : aff === 'H' ? IC.threatGlyph(t.type) : t.klass ? IC.threatGlyph(null, t.klass) : t.d.cls === 'bal' || t.d.cls === 'hgv' ? IC.threatGlyph(t.type) : null;
    if (gk) threatGlyph(ctx, gk, x, y - 2.4 * s, s * 1.1, aff === 'H' ? '#ffe1dc' : '#ffe8c4');
    if (t.d.jam && t.jamming) { const p = (now * 2 + t.seed) % 1; ctx.strokeStyle = `rgba(200,150,255,${1 - p})`; ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.arc(x, y, (9 + p * 12) * px, 0, 7); ctx.stroke(); }
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
  // a raid carries one label, its leader's (render-air.js boxes the group)
  if (show && S.layers.labels && !(t.grp && t.grp.lead !== t && !selT)) {
    const code = t.type === 'ga' && (aff === 'N' || aff === 'A' || aff === 'U') ? `${t.cs} light${t.sq ? '' : ' · no transponder'}` : aff === 'N' || aff === 'A' ? t.cs : aff === 'H' ? t.d.code : aff === 'S' ? (t.sq ? t.cs + '?' : 'SUSP') : 'UNK';
    const altS = alt == null ? '---' : IC.tagAlt(t);
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
  shadow(a.x, a.y, a.alt, px, a.kind === 'aew' || a.kind === 'cargo' || a.kind === 'tkr' ? 6 : 4);
  if (cam.z > 0.9) {
    const kind = a.kind === 'ftr' ? 'fighter' : a.kind === 'aew' || a.kind === 'cargo' || a.kind === 'tkr' ? 'transport' : a.kind === 'heli' || a.kind === 'atk' ? 'heli' : 'drone';
    const model = cam.z > 2.5 && IC.modelTop ? IC.modelOfAir(a) : null;
    for (let i = 0; i < (a.hp || 1); i++) {
      const ox = i ? -Math.cos(h) * 10 * px - Math.sin(h) * 8 * px : 0, oy = i ? -Math.sin(h) * 10 * px + Math.cos(h) * 8 * px : 0;
      if (model) { IC.modelTop(ctx, model, a.x + ox, a.y + oy, h, { minPx: 12, shadow: Math.min(3, a.alt * 0.25), now }); continue; }
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
    const extra = a.kind === 'ftr' ? ` ${a.aam + (a.srm || 0)}×AAM${a.gbu ? ' ' + a.gbu + '×GBU' : ''}` : a.runs && a.kind !== 'heli' ? ` ${a.runs} runs` : a.job ? ` ${a.job.short}` : '';
    label(a.name + extra + (a.state === 'rtb' ? ' RTB' : a.state === 'vid' ? ' VID' : a.state === 'refuel' ? ' AAR' : a.mission && a.mission.type === 'hold' ? ' HOLD' : ''), a.x + 12 * px, a.y + 14 * px, px, col, 9.5, 'left', 600);
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

/* ---------- combat effects ----------
   Drawing only: the simulation owns missiles, threats and damage; this watches them from frame to frame and adds the
   flash, the dust, the booster, the smoke that lingers and drifts, the loft, the staging, the hit or the miss.
   Particles live in a fixed pool of typed arrays and draw as pre-rendered sprites, so a big raid stays cheap.
   Sizes follow the map's rule: a size in screen pixels far out, a real size close in, whichever is larger. */
const FX = IC.cfx = { on: true };
const NP = 4500;
const P = { x: new Float32Array(NP), y: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), t: new Float32Array(NP), life: new Float32Array(NP),
  rw: new Float32Array(NP), rp: new Float32Array(NP), grow: new Float32Array(NP), a: new Float32Array(NP), drag: new Float32Array(NP), k: new Uint8Array(NP), f: new Uint8Array(NP) };
let np = 0;
FX.count = () => np;
// kinds: sprites, the first ones drawn normally, from GLOW on added as light
const SMOKE = 0, SOOT = 1, DUST = 2, STEAM = 3, DEBRIS = 4, GLOW = 5, HOT = 6, BLUE = 7, SPARK = 8, EMBER = 9;
// flags: aged in game time (else real time), drift with the wind, fall under gravity, leave smoke behind
const GT = 1, WIND = 2, FALL = 4, SMOKY = 8;
function emit(k, x, y, vx, vy, life, rw, rp, grow, a, f, drag) {
  if (np >= NP) return;
  const i = np++;
  P.k[i] = k; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.t[i] = 0; P.life[i] = life; P.rw[i] = rw; P.rp[i] = rp; P.grow[i] = grow; P.a[i] = a; P.f[i] = f || 0; P.drag[i] = drag == null ? 1.2 : drag;
}
function kill(i) {
  const j = --np; if (i === j) return;
  for (const key in P) P[key][i] = P[key][j];
}

const SPR = [];
function sprite(stops, n) {
  const c = document.createElement('canvas'); c.width = c.height = n || 64;
  const g = c.getContext('2d'), h = c.width / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.width);
  return c;
}
function sprites() {
  SPR[SMOKE] = sprite([[0, 'rgba(236,238,240,0.9)'], [0.45, 'rgba(214,218,222,0.55)'], [1, 'rgba(200,205,210,0)']]);
  SPR[SOOT] = sprite([[0, 'rgba(58,55,54,0.85)'], [0.35, 'rgba(64,61,60,0.6)'], [0.7, 'rgba(70,68,68,0.22)'], [1, 'rgba(74,72,72,0)']]);
  SPR[DUST] = sprite([[0, 'rgba(150,128,98,0.9)'], [0.5, 'rgba(140,120,92,0.5)'], [1, 'rgba(130,112,88,0)']]);
  SPR[STEAM] = sprite([[0, 'rgba(250,250,252,0.95)'], [0.5, 'rgba(240,242,246,0.5)'], [1, 'rgba(235,238,242,0)']]);
  SPR[DEBRIS] = sprite([[0, 'rgba(26,22,20,1)'], [0.55, 'rgba(26,22,20,1)'], [0.7, 'rgba(26,22,20,0)']], 16);
  SPR[GLOW] = sprite([[0, 'rgba(255,236,190,1)'], [0.2, 'rgba(255,190,100,0.75)'], [0.5, 'rgba(255,120,40,0.25)'], [1, 'rgba(255,80,20,0)']]);
  SPR[HOT] = sprite([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,246,220,0.85)'], [0.6, 'rgba(255,200,130,0.2)'], [1, 'rgba(255,160,80,0)']]);
  SPR[BLUE] = sprite([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(200,236,255,0.8)'], [0.6, 'rgba(120,190,255,0.2)'], [1, 'rgba(90,160,255,0)']]);
  SPR[SPARK] = sprite([[0, 'rgba(255,250,220,1)'], [0.35, 'rgba(255,210,120,0.8)'], [1, 'rgba(255,150,60,0)']], 16);
  SPR[EMBER] = sprite([[0, 'rgba(255,200,120,1)'], [0.4, 'rgba(255,120,40,0.6)'], [1, 'rgba(255,80,20,0)']], 16);
}
/* the old flat particles from the simulation, as soft sprites cached by colour */
const colSpr = new Map();
function colSprite(col) {
  let c = colSpr.get(col);
  if (!c) { c = sprite([[0, `rgba(${col},1)`], [0.5, `rgba(${col},0.6)`], [1, `rgba(${col},0)`]], 32); colSpr.set(col, c); }
  return c;
}

/* ---------- how each missile flies and looks ----------
   burn: booster seconds (game time); stage: when a spent booster drops; loft: peak height over the flight as a share of
   its length (drawn as a lift up the screen, the way aircraft shadows fall below them); flash, dust: launch size;
   smoke: trail width; glow: the motor's colour. */
const CLS = {
  ir:  { burn: 3, loft: 0, flash: 0.6, dust: 0.4, smoke: 0.7, glow: HOT, len: 5 },
  sr:  { burn: 4, loft: 0.03, flash: 0.8, dust: 0.6, smoke: 0.9, glow: HOT, len: 6 },
  mr:  { burn: 7, loft: 0.12, flash: 1, dust: 1, smoke: 1.1, glow: HOT, len: 8 },
  lr:  { burn: 12, stage: 5, loft: 0.24, flash: 1.4, dust: 1.5, smoke: 1.4, glow: GLOW, len: 10 },
  bmd: { burn: 6, loft: 0.3, flash: 1.3, dust: 1.2, smoke: 1.3, glow: BLUE, len: 10, steep: true },
  hat: { burn: 10, stage: 4, loft: 0.45, flash: 1.7, dust: 1.8, smoke: 1.6, glow: BLUE, len: 12, steep: true },
  exo: { burn: 14, stage: 5, loft: 0.6, flash: 2, dust: 2.2, smoke: 1.8, glow: BLUE, len: 13, steep: true },
  aam: { burn: 4, loft: 0.02, flash: 0.35, dust: 0, smoke: 0.7, glow: HOT, len: 5 },
  eaam:{ burn: 4, loft: 0.02, flash: 0.3, dust: 0, smoke: 0.6, glow: GLOW, len: 5, red: true }
};
const MUN_CLS = { IR: 'ir', SR: 'sr', MR: 'mr', LR: 'lr', TBD: 'bmd', HAT: 'hat', EXO: 'exo', AAM: 'aam' };
FX.cls = m => MUN_CLS[m.mun] || (m.M && m.M.range > 1500 ? 'hat' : m.M && m.M.range > 300 ? 'mr' : 'sr');

const vis = FX.vis = new Map();   // missile id → what we draw for it
const eaamV = new WeakMap();    // enemy air-to-air missiles have no id
const trails = [];              // smoke trails, kept after their missile is gone
const rings = [];               // shock rings
const rounds = [];              // gun tracer rounds in flight
const later = [];               // secondary explosions waiting their turn
const booms = [];               // recent explosions from the simulation, to tell hits from misses
const balV = new Map();         // ballistic threats: launch seen, boost and re-entry
let lastNow = 0, lastTime = 0, dtR = 0, gdt = 0, curS = null, curPx = 1, curLight = 1;

function newTrail(w, red) { const tr = { pts: [], w, red, done: false, last: 0 }; if (trails.length > 160) trails.shift(); trails.push(tr); return tr; }
function trailPush(tr, x, y, t, w) { const P2 = tr.pts; P2.push(x, y, t, w); if (P2.length > 4 * 220) P2.splice(0, 4); }

/* the lift that draws a missile's loft: 0 at launch and at the target, highest in between */
function lift(V, m) {
  if (!V.peak) return 0;
  const rem = Math.hypot(m.target.x - m.x, m.target.y - m.y), f = V.dist / Math.max(1, V.dist + rem);
  // steep climbers go up fast and come down on the target late
  const g = V.steep ? Math.sin(Math.PI * Math.pow(f, 0.6)) : 4 * f * (1 - f);
  return V.peak * g;
}

function launch(S, V, x, y) {
  const c = CLS[V.cls], px = curPx, night = curLight < 0.5 ? 1.5 : 1;
  if (!inViewR(x, y, 300)) return;
  emit(HOT, x, y, 0, 0, 0.22, 1.5 * c.flash, 16 * c.flash * night, 1.2, 1, 0);
  emit(GLOW, x, y, 0, 0, 0.5, 3 * c.flash, 26 * c.flash * night, 0.8, 0.8, 0);
  if (curLight < 0.5) emit(GLOW, x, y, 0, 0, 0.9, 12 * c.flash, 70 * c.flash, 0.3, 0.35, 0);
  // the dust thrown out across the ground, and the white cloud the missile leaves at the launcher
  const nd = Math.round(10 * c.dust);
  for (let i = 0; i < nd; i++) { const a = Math.random() * 6.283, v = (22 + Math.random() * 30) * px * c.dust; emit(DUST, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7, 2 + Math.random() * 2, 0.6 * c.dust, 5.5 * c.dust, 1.8, 0.8, WIND, 1.8); }
  for (let i = 0; i < Math.round(7 * c.smoke); i++) emit(STEAM, x + (Math.random() - 0.5) * 6 * px, y - Math.random() * 8 * px, (Math.random() - 0.5) * 10 * px, -(2 + Math.random() * 10) * px, 5 + Math.random() * 6, 0.7 * c.smoke, 6.5 * c.smoke, 1.6, 0.7, WIND, 0.7);
  if (c.flash >= 1.3 && S.cfg.shake) IC.shake(S, 1 + c.flash, x, y);
}
FX.launch = launch;

/* a hit: the flash, sparks, the target breaking up. kind 'air' (target killed), 'us' (our warhead), 'ground', 'sec' */
FX.boom = function (S, x, y, s, kind) {
  if (!inViewR(x, y, 400)) return;
  const px = curPx, night = curLight < 0.5, nk = night ? 1.5 : 1, gnd = kind === 'ground' || kind === 'sec';
  const blue = kind === 'us';
  emit(blue ? BLUE : HOT, x, y, 0, 0, 0.2 + s * 0.08, 2 * s, 20 * s * nk, 1.5, 0.9, 0);
  // the fireball swells and fades; what burns on glows a little longer
  emit(GLOW, x, y, 0, 0, 0.6 + s * 0.4, (gnd ? 4.5 : 3) * s, (gnd ? 34 : 28) * s * nk, 1.3, 0.9, 0);
  if (!blue) { emit(GLOW, x, y, 0, 0, 1.4 + s * 0.6, (gnd ? 3.5 : 2) * s, (gnd ? 24 : 16) * s * nk, 0.5, 0.8, 0); emit(HOT, x, y, 0, 0, 0.45, 1.5 * s, 14 * s * nk, 1, 0.8, 0); }
  if (night) emit(GLOW, x, y, 0, 0, 0.6 + s * 0.4, 18 * s, 90 * s, 0.4, 0.4, 0);
  rings.push({ x, y, t: 0, life: 0.45 + s * 0.25, rw: (gnd ? 18 : 10) * s, rp: (gnd ? 60 : 36) * s, col: blue ? '190,230,255' : '255,238,210' });
  if (rings.length > 60) rings.shift();
  // sparks fly out fast and fade; heavier pieces arc down trailing smoke
  const ns = Math.round((blue ? 10 : 16) * Math.min(2, s + 0.3));
  for (let i = 0; i < ns; i++) { const a = Math.random() * 6.283, v = (40 + Math.random() * 90) * px * (0.6 + s * 0.5); emit(SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v - 20 * px, 0.3 + Math.random() * 0.6, 0.15, 1.6 + Math.random(), 0, 1, FALL, 2.2); }
  const nd = kind === 'us' ? 3 : Math.round(5 + s * 5);
  for (let i = 0; i < nd; i++) { const a = Math.random() * 6.283, v = (20 + Math.random() * 55) * px * (0.6 + s * 0.4); emit(gnd ? DEBRIS : EMBER, x, y, Math.cos(a) * v, Math.sin(a) * v - (25 + Math.random() * 40) * px, 0.9 + Math.random() * 1.4, 0.12, gnd ? 1.4 : 1.8, 0, 1, FALL | SMOKY, 0.8); }
  // smoke: grey for things blown up in the air, black and rising for the ground; dust ring on the ground
  // smoke: grey puffs for things blown up in the air; on the ground a dark column that climbs and leans with the wind
  const nm = Math.round((gnd ? 10 : 4) * Math.min(2.2, s + 0.4));
  for (let i = 0; i < nm; i++) { const up = gnd ? 4 + Math.random() * 16 : Math.random() * 4; emit(gnd ? SOOT : SMOKE, x + (Math.random() - 0.5) * 7 * px * s, y + (Math.random() - 0.5) * 7 * px * s, (Math.random() - 0.5) * 8 * px, -up * px, (gnd ? 6 : 3) + Math.random() * 5 * s, (gnd ? 2.2 : 1) * s, (gnd ? 8 : 6) * s, 2.6, gnd ? 0.6 : 0.45, WIND, 0.35); }
  if (gnd) for (let i = 0; i < 10 * s; i++) { const a = Math.random() * 6.283, v = (30 + Math.random() * 30) * px * s; emit(DUST, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7, 1.2 + Math.random(), 0.8 * s, 5 * s, 1.8, 0.45, WIND, 2.6); }
};
function inViewR(x, y, m) { return inView(x, y, m * curPx + 50); }

/* explosions from the simulation draw here instead of in the old flat rings; sound, shake and slow motion stay */
function hookSim() {
  if (hookSim.done || !IC.explode) return; hookSim.done = true;
  const explode = IC.explode;
  IC.explode = function (S, x, y, s, kind, o) {
    const F = S.fx, nb = F.booms.length, nf = F.flashes.length, ns = F.shocks.length, npart = F.parts.length;
    explode.call(this, S, x, y, s, kind, o);
    if (!FX.on) return;
    F.booms.length = nb; F.flashes.length = nf; F.shocks.length = ns; F.parts.length = npart;
    booms.push({ x, y, t: S.time, kind }); if (booms.length > 40) booms.shift();
    FX.boom(S, x, y, s, kind);
  };
  // burning fuel and munitions cook off: a few secondary blasts over the next seconds
  const addFire = IC.addFire;
  IC.addFire = function (S, x, y, size, life) {
    addFire.call(this, S, x, y, size, life);
    if (FX.on && size >= 0.6) secondaries(x, y, size, Math.round(2 + size * 2.5));
  };
  IC.on((S, type, d) => { if (type === 'unitLost' && d && d.mags && d.mags.length) secondaries(d.x, d.y, 0.8, 4); });
}
function secondaries(x, y, size, n) {
  if (!inViewR(x, y, 300)) return;
  for (let i = 0; i < n; i++) later.push({ at: lastNow + 0.25 + Math.random() * (1 + size * 2), x: x + (Math.random() - 0.5) * (4 + size * 6), y: y + (Math.random() - 0.5) * (4 + size * 6), s: 0.3 + Math.random() * 0.35 * (1 + size) });
}

/* frame by frame: new missiles launch, gone ones hit or miss, trails grow, particles move */
function track(S) {
  const seen = new Set();
  const byUnit = new Map();
  for (const m of S.missiles) {
    seen.add(m.id);
    let V = vis.get(m.id);
    if (!V) {
      const cls = FX.cls(m), c = CLS[cls], air = cls === 'aam';
      const D0 = Math.hypot(m.target.x - m.x, m.target.y - m.y);
      // a salvo ripples: the second missile from the same launcher this frame shows a moment later
      const k = byUnit.get(m.unit || m.src) || 0; byUnit.set(m.unit || m.src, k + 1);
      if (m.tr) m.tr._fx = true;
      const x0 = m.unit && !air ? m.unit.x : m.x, y0 = m.unit && !air ? m.unit.y : m.y;
      V = { cls, x0, y0, born: S.time, bornR: lastNow, delay: k * 0.35, dist: 0, lx: m.x, ly: m.y, peak: c.loft * D0, steep: c.steep, tr: newTrail(c.smoke), staged: false, lastT: S.time, hx: m.x, hy: m.y, hl: 0, shown: false, air };
      vis.set(m.id, V); trailPush(V.tr, x0, y0, S.time, 1);
      IC.sfx && IC.sfx.claimLaunch && IC.sfx.claimLaunch(m.x, m.y, cls, V.delay);
    }
    V.dist += Math.hypot(m.x - V.lx, m.y - V.ly); V.lx = m.x; V.ly = m.y;
    V.m = m; V.hl = lift(V, m); V.hx = m.x; V.hy = m.y - V.hl;
    if (!V.shown && lastNow - V.bornR >= V.delay) { V.shown = true; if (!V.air) launch(S, V, V.x0, V.y0); else emit(HOT, V.x0, V.y0, 0, 0, 0.15, 0.4, 8, 1, 0.8, 0); }
    if (V.shown) grow(S, V);
  }
  for (const [id, V] of vis) {
    if (seen.has(id)) continue;
    vis.delete(id);
    V.tr.done = true;
    if (!V.m) continue;
    const t = V.m.target;
    const hit = t.dead || booms.some(b => S.time - b.t < 3 && Math.abs(b.x - t.x) + Math.abs(b.y - t.y) < 25);
    if (hit) { const big = t.d && (t.d.cls === 'bal' || t.d.cls === 'hgv'); IC.sfx && IC.sfx.intercept && IC.sfx.intercept(t.x, t.y, big); if (big) balKill(S, t); }
    else if (V.shown) ghosts.push({ x: V.hx, y: V.hy, vx: Math.cos(V.m.a), vy: Math.sin(V.m.a), spd: V.m.spd, t: 0, cls: V.cls, tr: V.tr });
  }
  // enemy air-to-air missiles
  for (const m of S.eaam) {
    let V = eaamV.get(m);
    if (!V) { if (m.tr) m.tr._fx = true; V = { cls: 'eaam', x0: m.x, y0: m.y, born: S.time, bornR: lastNow, dist: 0, lx: m.x, ly: m.y, peak: 0, tr: newTrail(CLS.eaam.smoke, true), lastT: S.time, hx: m.x, hy: m.y, shown: true, air: true }; eaamV.set(m, V); }
    V.m = m; V.hx = m.x; V.hy = m.y; grow(S, V);
    if (m.dead) V.tr.done = true;
  }
  // gun bursts become rounds that fly
  for (const tr of S.fx.tracers) if (!tr._fx) {
    tr._fx = true;
    const n = tr.msl ? 1 : 4;
    for (let i = 0; i < n; i++) rounds.push({ x1: tr.x1, y1: tr.y1, x2: tr.x2 + (Math.random() - 0.5) * 3, y2: tr.y2 + (Math.random() - 0.5) * 3, t: -i * 0.05, life: tr.msl ? 0.5 : 0.28, msl: tr.msl });
    if (!tr.msl) emit(HOT, tr.x1, tr.y1, 0, 0, 0.08, 0.3, 5, 0.5, 0.9, 0);
  }
  if (rounds.length > 300) rounds.splice(0, rounds.length - 300);
  // ballistic missiles: the launch if we see it, the boost, the re-entry glow
  for (const t of S.threats) {
    if (t.d.move !== 'bal' && t.d.cls !== 'hgv') continue;
    let B = balV.get(t);
    if (!B) { B = { seen: false }; balV.set(t, B); }
    if (!t.det || t.dead) continue;
    if (!B.seen) {
      B.seen = true;
      if (t.x0 != null && t.age < 60) launch(S, { cls: t.d.cls === 'rkt' ? 'sr' : 'hat' }, t.x0, t.y0);
    }
  }
}
const ghosts = [];   // missiles that missed fly on for a moment, then destroy themselves
const burnsAt = (V, c, age) => age < c.burn || lastNow - V.bornR - (V.delay || 0) < 0.9 + c.burn * 0.1;
function grow(S, V) {
  const c = CLS[V.cls], age = S.time - V.born, burning = burnsAt(V, c, age);
  const staging = c.stage && age >= c.stage && age < c.stage + 0.6;
  if (c.stage && !V.staged && age >= c.stage) {
    V.staged = true;
    // the spent booster tumbles away, a puff marks the separation
    emit(DEBRIS, V.hx, V.hy, (Math.random() - 0.5) * 20 * curPx, -10 * curPx, 2.2, 0.15, 2.2, 0, 1, FALL | SMOKY, 0.4);
    emit(SMOKE, V.hx, V.hy, 0, 0, 3, 0.8, 6, 1.5, 0.6, WIND | GT, 0.5);
    emit(HOT, V.hx, V.hy, 0, 0, 0.15, 0.5, 8, 1, 0.9, 0);
  }
  // a point every quarter second of flight, and one for each frame when the view is close
  const spacing = Math.max(0.35, 3 * curPx);
  const P2 = V.tr.pts, n = P2.length;
  if (!n || (Math.abs(P2[n - 4] - V.hx) + Math.abs(P2[n - 3] - V.hy) > spacing)) {
    const w = staging ? 0 : burning ? 1 : Math.max(0.25, 0.6 - (age - c.burn) * 0.03);
    trailPush(V.tr, V.hx, V.hy, S.time, w);
  }
  V.burning = burning;
  // billows along the boost give the trail body
  if (burning && !staging && (V.puffT = (V.puffT || 0) - dtR) <= 0 && inView(V.hx, V.hy, 60 * curPx)) { V.puffT = 0.1; emit(SMOKE, V.hx, V.hy, 0, 0, 16 + Math.random() * 14, 0.35 * c.smoke, 3 * c.smoke, 2.4, 0.4, GT | WIND, 0); }
}

function update(S, now) {
  hookSim();
  dtR = lastNow ? Math.min(0.1, Math.max(0, now - lastNow)) : 0; lastNow = now;
  gdt = lastTime ? Math.max(0, Math.min(60, S.time - lastTime)) : 0; lastTime = S.time;
  if (curS !== S) { curS = S; np = 0; vis.clear(); trails.length = 0; rings.length = 0; rounds.length = 0; later.length = 0; ghosts.length = 0; booms.length = 0; balV.clear(); }
  if (!SPR.length) sprites();
  track(S);
  // lock tones for the selected battery
  const u = S.sel && S.sel.kind === 'unit' && S.sel.ref;
  if (u && u.d && u.d.weapon === 'sam' && !S.paused && IC.sfx && IC.sfx.lock) {
    let guiding = false; for (const [, V] of vis) if (V.m && V.m.unit === u) { guiding = true; break; }
    IC.sfx.lock(guiding ? 'guiding' : /^(Tracking|Engaging)/.test(u.why || '') && u.radarOn ? 'tracking' : null);
  }
  for (let i = later.length - 1; i >= 0; i--) if (lastNow >= later[i].at) { const L2 = later[i]; later.splice(i, 1); FX.boom(S, L2.x, L2.y, L2.s, 'sec'); IC.sfx && IC.sfx.boom(L2.x, L2.y, L2.s * 0.7); }
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const G = ghosts[i]; G.t += dtR;
    const step = G.spd * gdt; G.x += G.vx * step; G.y += G.vy * step;
    if (G.t < 1.2) { if (G.tr.pts.length < 4 * 220) trailPush(G.tr, G.x, G.y, S.time, 0.35); }
    else { ghosts.splice(i, 1); emit(HOT, G.x, G.y, 0, 0, 0.14, 0.5, 9, 1.3, 0.9, 0); emit(SMOKE, G.x, G.y, 0, 0, 2.5, 0.6, 5, 1.6, 0.5, WIND, 0.5); for (let k = 0; k < 6; k++) { const a = Math.random() * 6.283, v = 40 * curPx; emit(SPARK, G.x, G.y, Math.cos(a) * v, Math.sin(a) * v, 0.4, 0.1, 1.4, 0, 1, FALL, 2); } }
  }
  for (const r of rings) r.t += dtR;
  while (rings.length && rings[0].t > rings[0].life) rings.shift();
  for (const r of rounds) r.t += dtR;
  for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].t > rounds[i].life) rounds.splice(i, 1);
  for (let i = trails.length - 1; i >= 0; i--) { const tr = trails[i], P2 = tr.pts; if (tr.done && (!P2.length || S.time - P2[P2.length - 2] > 260 || S.time < P2[P2.length - 2])) trails.splice(i, 1); }
  // particles
  const wx = S.wind.x * 0.6 * gdt, wy = S.wind.y * 0.6 * gdt, grav = 90 * curPx * dtR;
  for (let i = np - 1; i >= 0; i--) {
    const f = P.f[i];
    P.t[i] += f & GT ? gdt : dtR;
    if (P.t[i] >= P.life[i]) { kill(i); continue; }
    const k = Math.max(0, 1 - P.drag[i] * dtR);
    P.vx[i] *= k; P.vy[i] *= k;
    if (f & FALL) P.vy[i] += grav;
    P.x[i] += P.vx[i] * dtR; P.y[i] += P.vy[i] * dtR;
    if (f & WIND) { P.x[i] += wx; P.y[i] += wy; }
    if (f & SMOKY && Math.random() < dtR * 8) emit(P.k[i] === DEBRIS ? SOOT : SMOKE, P.x[i], P.y[i], 0, -3 * curPx, 1.4 + Math.random(), 0.2, 2.2, 1.5, 0.35, WIND, 0.5);
  }
}

/* smoke trails: wide and soft, drifting with the wind as they age; the young part near the missile is brighter */
function drawTrails2(S, px, light) {
  const life = 240, night = light < 0.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const base = night ? '150,158,170' : '228,232,236';
  for (const tr of trails) {
    const A = tr.pts, n = A.length / 4; if (n < 2) continue;
    if (!inView(A[A.length - 4], A[A.length - 3], 1500) && !inView(A[0], A[1], 1500)) continue;
    const col = tr.red ? '235,200,190' : base;
    // groups of a few segments share one stroke
    for (let i = 1; i < n; i += 3) {
      const j = Math.min(n - 1, i + 2), o = i * 4, age = S.time - A[o + 2];
      if (age > life) continue;
      const w = A[o + 3]; if (w <= 0) continue;
      const kk = 1 - age / life, da = age * 0.6;
      const wide = tr.w * w * (1 + (1 - kk) * 3);
      ctx.beginPath(); ctx.moveTo(A[o - 4] + S.wind.x * da, A[o - 3] + S.wind.y * da);
      for (let q = i; q <= j; q++) { const a2 = (S.time - A[q * 4 + 2]) * 0.6; ctx.lineTo(A[q * 4] + S.wind.x * a2, A[q * 4 + 1] + S.wind.y * a2); }
      ctx.strokeStyle = `rgba(${col},${(night ? 0.3 : 0.42) * kk * kk * (0.5 + 0.5 * w)})`;
      ctx.lineWidth = Math.max(3.4 * wide * px, 0.4 * wide * (1 + (1 - kk) * 3));
      ctx.stroke();
      if (age < 25) { ctx.strokeStyle = `rgba(${night ? '215,220,230' : '250,251,252'},${0.55 * (1 - age / 25) * w})`; ctx.lineWidth = Math.max(1.2 * px, 0.12); ctx.stroke(); }
    }
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

function drawSprites(add, px, light) {
  const shrink = 1 - WF * 0.6;
  for (let i = 0; i < np; i++) {
    const kd = P.k[i]; if ((kd >= GLOW) !== add) continue;
    const x = P.x[i], y = P.y[i]; if (!inView(x, y, 200)) continue;
    const f = P.t[i] / P.life[i], G = 1 + P.grow[i] * f;
    const r = Math.max(P.rw[i] * G, P.rp[i] * G * px * shrink);
    if (r < 0.7 * px) continue;   // under a pixel and a half across: not worth a draw
    let a = P.a[i] * (kd >= GLOW ? (1 - f) * (1 - f) : kd === DEBRIS ? 1 - f * f : (1 - f) * Math.min(1, f * 6 + 0.3));
    if (!add && light < 0.5 && kd !== DEBRIS) a *= 0.55 + light;
    if (a < 0.01) continue;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(SPR[kd], x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/* missiles: a booster flame and its glow while it burns, a small dark body after; a thin line to the ground under a
   lofted missile shows where it really is */
function drawMissiles(S, px, light) {
  const night = light < 0.5, nk = night ? 1.6 : 1;
  const one = (V, m, red) => {
    if (!V.shown) return;
    const c = CLS[V.cls], x = V.hx, y = V.hy;
    if (!inView(x, y, 120)) return;
    const burning = V.burning;
    // heading on screen, including the climb
    const A = V.tr.pts, n = A.length;
    let hx = Math.cos(m.a || 0), hy = Math.sin(m.a || 0);
    if (n >= 8) { const dx = x - A[n - 8], dy = y - A[n - 7], d = Math.hypot(dx, dy); if (d > 1e-3) { hx = dx / d; hy = dy / d; } }
    if (burning) {
      const flick = 0.8 + Math.random() * 0.4, L2 = c.len * 1.7 * px * flick * (V.staged ? 0.7 : 1), gr = (6 + c.len) * px * nk * flick;
      ctx.drawImage(SPR[c.glow], x - gr, y - gr, gr * 2, gr * 2);
      ctx.strokeStyle = red ? 'rgba(255,170,130,0.9)' : 'rgba(255,236,190,0.95)'; ctx.lineWidth = 2.2 * px;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - hx * L2, y - hy * L2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 1 * px;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - hx * L2 * 0.45, y - hy * L2 * 0.45); ctx.stroke();
    } else {
      ctx.drawImage(SPR[red ? GLOW : BLUE], x - 3.5 * px * nk, y - 3.5 * px * nk, 7 * px * nk, 7 * px * nk);
    }
    ctx.fillStyle = red ? 'rgba(255,190,170,1)' : 'rgba(245,250,255,1)';
    ctx.beginPath(); ctx.arc(x, y, 1.5 * px, 0, 7); ctx.fill();
    if (V.hl > 25 * px && cam.z > 0.5) { ctx.strokeStyle = 'rgba(200,230,255,0.18)'; ctx.lineWidth = 1 * px; ctx.setLineDash([2 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.setLineDash([]); }
  };
  for (const [, V] of vis) one(V, V.m);
  for (const m of S.eaam) { const V = eaamV.get(m); if (V) one(V, m, true); }
  for (const G of ghosts) { const k = 1 - G.t / 1.2; ctx.globalAlpha = Math.max(0, k); ctx.drawImage(SPR[HOT], G.x - 4 * px, G.y - 4 * px, 8 * px, 8 * px); ctx.globalAlpha = 1; }
}

/* ballistic missiles and glide vehicles: a flame on the way up, a white-hot streak coming down */
function drawBallistic(S, px, now, light) {
  const nk = light < 0.5 ? 1.6 : 1;
  for (const t of S.threats) {
    if (t.dead || !t.det || (t.d.move !== 'bal' && t.d.cls !== 'hgv') || !inView(t.px, t.py, 200)) continue;
    const x = t.px, y = t.py, sp = Math.hypot(t.pvx || t.vx, t.pvy || t.vy) || 1, ux = (t.pvx || t.vx) / sp, uy = (t.pvy || t.vy) / sp;
    const f = t.T ? U.clamp(t.age / t.T, 0, 1) : 0.5;
    const hgv = t.d.cls === 'hgv', rkt = t.d.cls === 'rkt';
    // hot on the way up, dark in space, heating again as it falls back into the air
    let heat = hgv ? 0.8 : f < 0.12 ? 1 - f / 0.12 : f > 0.5 ? 0.25 + 0.75 * Math.pow((f - 0.5) / 0.5, 1.5) : 0;
    if (rkt) heat *= 0.5;
    if (heat <= 0.02) continue;
    const L2 = (rkt ? 16 : 34 + 40 * heat) * px, flick = 0.85 + 0.3 * Math.random();
    const up = f < 0.12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = up ? `rgba(255,170,90,${0.35 * heat})` : `rgba(255,150,80,${0.35 * heat})`; ctx.lineWidth = 7 * px * heat * nk;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L2, y - uy * L2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,240,210,${0.9 * heat})`; ctx.lineWidth = 2.2 * px * heat;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L2 * 0.6, y - uy * L2 * 0.6); ctx.stroke();
    ctx.lineCap = 'butt';
    const r = (10 + 10 * heat) * px * nk * flick;
    ctx.globalAlpha = Math.min(1, heat + 0.2); ctx.drawImage(SPR[HOT], x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
    // ionised air left behind on the way down
    if (!up && Math.random() < 0.5) emit(STEAM, x - ux * L2 * 0.4, y - uy * L2 * 0.4, 0, 0, 2.5, 0.5, 3.5 * heat, 1.8, 0.35 * heat, GT | WIND, 0.2);
  }
}
/* a warhead killed high up: a bright burst and pieces that burn as they fall */
function balKill(S, t) {
  const x = t.px, y = t.py;
  emit(HOT, x, y, 0, 0, 0.35, 3, 46, 1.4, 1, 0);
  emit(BLUE, x, y, 0, 0, 0.25, 2, 30, 1.2, 1, 0);
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, v = (40 + Math.random() * 80) * curPx; emit(EMBER, x, y, Math.cos(a) * v + (t.vx || 0) * 3, Math.sin(a) * v - 30 * curPx, 1.4 + Math.random() * 1.6, 0.15, 2, 0, 1, FALL | SMOKY, 0.6); }
  rings.push({ x, y, t: 0, life: 0.8, rw: 30, rp: 80, col: '220,240,255' });
}

function drawRings(px) {
  for (const r of rings) {
    const k = r.t / r.life; if (k >= 1) continue;
    const R = Math.max(r.rw * (1 - WF * 0.85), r.rp * px) * (0.15 + Math.sqrt(k));
    ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = `rgb(${r.col})`; ctx.lineWidth = (3 * (1 - k) + 0.6) * px;
    ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawRounds(px) {
  ctx.lineCap = 'round';
  for (const r of rounds) {
    if (r.t < 0) continue;
    const f = r.t / r.life, f0 = Math.max(0, f - (r.msl ? 0.25 : 0.14));
    ctx.strokeStyle = r.msl ? 'rgba(255,225,170,0.95)' : 'rgba(255,170,70,0.95)'; ctx.lineWidth = (r.msl ? 1.8 : 1.4) * px;
    ctx.beginPath(); ctx.moveTo(r.x1 + (r.x2 - r.x1) * f0, r.y1 + (r.y2 - r.y1) * f0); ctx.lineTo(r.x1 + (r.x2 - r.x1) * f, r.y1 + (r.y2 - r.y1) * f); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
/* the simulation's flat particles and fires, drawn as sprites */
function drawSimParts(S, px, add) {
  for (const p of S.fx.parts) {
    if (p.add !== add) continue;
    const k = 1 - p.t / p.life, r = Math.max(0.2, p.size * px * 1.3);
    ctx.globalAlpha = Math.min(1, p.a * k); ctx.drawImage(colSprite(p.col), p.x + p.ox * px - r, p.y + p.oy * px - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}
function drawFires(S, px, now, light) {
  for (const f of S.fx.fires) {
    if (!inView(f.x, f.y, 100)) continue;
    const fl = 0.75 + 0.25 * Math.sin(now * 9 + f.seed) * Math.sin(now * 5.3 + f.seed * 2);
    const k = Math.min(1, (f.life - f.t) / 300) * fl * (1.4 - light * 0.6);
    const r = Math.max(5 * px, f.size * U.lerp(16, 1.1, WF));
    ctx.globalAlpha = Math.min(1, 0.8 * k); ctx.drawImage(SPR[GLOW], f.x - r, f.y - r, r * 2, r * 2);
    if (light < 0.5) { const R2 = r * 4; ctx.globalAlpha = 0.18 * k * (1 - light * 2); ctx.drawImage(SPR[GLOW], f.x - R2, f.y - R2, R2 * 2, R2 * 2); }
  }
  ctx.globalAlpha = 1;
}

IC.drawCombat = function (S, px, now, light) {
  ctx = RS.ctx; WF = RS.WF; curPx = px; curLight = light;
  if (FX.on) update(S, now);
  drawWrecks(S, px, now);
  drawTrails(S, px);
  drawPlumes(S, px, now, light);
  if (!FX.no || !FX.no.trails) drawTrails2(S, px, light);
  if (!FX.no || !FX.no.low) drawSprites(false, px, light);
  if (!FX.no || !FX.no.sim) drawSimParts(S, px, false);
  drawImpacts(S, px, now);
  for (const t of S.threats) drawTrack(S, t, px, now);
  if (IC.drawDefense) IC.drawDefense(ctx, S, px, now);
  if (IC.drawAirWar) IC.drawAirWar(ctx, S, px, now);
  for (const a of S.air) drawAir(S, a, px, now);
  for (const s of S.strikes) if (!s.pending) drawStrike(s, px);
  drawChaff(S, px);

  ctx.globalCompositeOperation = 'lighter';
  drawFires(S, px, now, light);
  for (const f of S.fx.flashes) {
    const k = 1 - f.t / 0.35; if (k <= 0) continue;
    const r = Math.max(f.r * px, (f.wr || 0) * (1 - WF * 0.9)) * (0.6 + f.t * 2);
    ctx.globalAlpha = 0.7 * k; ctx.drawImage(SPR[GLOW], f.x - r, f.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  for (const u of S.units) if (u.beam && !u.beam.dead) {
    const t = u.beam, fl = 0.7 + 0.3 * Math.random();
    ctx.strokeStyle = `rgba(92,200,255,${0.25 * fl})`; ctx.lineWidth = 6 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.strokeStyle = `rgba(225,248,255,${0.9 * fl})`; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(t.x, t.y); ctx.stroke();
  }
  drawRounds(px);
  drawBallistic(S, px, now, light);
  if (!FX.no || !FX.no.miss) drawMissiles(S, px, light);
  drawSimParts(S, px, true);
  if (!FX.no || !FX.no.high) drawSprites(true, px, light);
  drawRings(px);
  for (const r of S.fx.rings) { const k = r.t; ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = `rgb(${r.color})`; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(r.x, r.y, (r.px ? r.r * px : r.r) * Math.sqrt(k), 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
};

})(window.IC);
