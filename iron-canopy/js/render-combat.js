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
  heliport(g) { g.lineWidth = 1.8; L(g, [-4, -5, -4, 5]); L(g, [4, -5, 4, 5]); L(g, [-4, 0, 4, 0]); }
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
  bmr(g) { g.beginPath(); g.moveTo(0, -4.5); g.lineTo(6.5, 1.5); g.lineTo(6.5, 2.8); g.lineTo(0, 0.5); g.lineTo(-6.5, 2.8); g.lineTo(-6.5, 1.5); g.closePath(); g.fill(); L(g, [0, -5, 0, 4]); },
  dcy(g) { g.setLineDash([1.3, 1.1]); g.beginPath(); g.moveTo(0, -5); g.lineTo(5, 1.5); g.lineTo(0, 0); g.lineTo(-5, 1.5); g.closePath(); g.stroke(); g.setLineDash([]); }
};
const TGLYPH_OF = { owa: 'owa', jdr: 'jdr', lm: 'lm', isr: 'isr', lacm: 'cm', mcm: 'cm', scm: 'scm', glb: 'glb', srbm: 'bal', marv: 'marv', mrbm: 'bal', pen: 'bal', hgv: 'hgv', rkt: 'rkt', arm: 'arm', dcy: 'dcy', ftr: 'ftr', str: 'str', sead: 'sead', ewj: 'ewj', bmr: 'bmr' };
const KLASS_GLYPH = { drone: 'drone', cm: 'cm', ballistic: 'bal', rocket: 'rkt', fighter: 'ftr', bomber: 'bmr', jammer: 'ewj' };
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
  if (S.layers.ground) for (const g of S.gunits) if (g.side === 'us' && inView(g.x, g.y, 300)) drawG(S, g, px, now);
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
        ctx.lineWidth = 1 * px; ctx.setLineDash(IC.ringDash(d, px));
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
  IC.drawUnitSymbol(ctx, u.type, u.x, u.y, px * 1.05, busy ? C.amber : C.friend, { dash: silent, tint: busy ? 'rgba(242,180,65,0.45)' : broken ? 'rgba(255,91,79,0.35)' : null,
    radar: u.emitter && u.state === 'ready' ? (u.radarOn ? 'on' : 'silent') : null, reload: reloadOf(S, u), damaged: broken || u.hp < u.max * 0.5, now });
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

IC.drawCombat = function (S, px, now, light) {
  ctx = RS.ctx; WF = RS.WF;
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
};

})(window.IC);
