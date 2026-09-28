/* Iron Canopy — low-poly models built in code. One set of definitions serves twice: render-models.js draws them
   from above on the 2D map close in, replay3d.js builds them as 3D meshes for the replay window.

   A model is a list of parts in metres. Axes: x forward (the nose), y to starboard, z up. Every part is
   [shape, x, y, z, sx, sy, sz, colour, opts]:
     box     sx sy sz are the sides
     cyl     a cylinder, axis along x (opts.axis 'y' or 'z' turns it); sx length, sy diameter
     cone    axis along x, apex towards +x (opts.axis 'z': apex up); sx length, sy base diameter
     sphere  an ellipsoid with diameters sx sy sz
     poly    a flat polygon at height z, opts.pts = [[x, y], ...], sz thick (wings, fins seen from above)
     fin     a vertical polygon at y, opts.pts = [[x, z], ...], sy thick (tail fins)
     disc    a translucent rotor disc at z, sy diameter (drawn as a ring from above)
   opts.pitch tilts the part nose-up (radians) about y, opts.yaw turns it about z.
   Colours 'L1' and 'L2' are the operator's livery; 'BODY' is the airframe colour. Nothing here touches the DOM. */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- palette ---------- */
const P = {
  white: '#e6e8ea', grey: '#aeb4ba', dark: '#3a4046', black: '#1a1c1e', glass: '#28405a', steel: '#8c949c',
  green: '#5a6b4c', green2: '#485840', tan: '#9c9070', radar: '#c4c8cc', rubber: '#202224', canvas: '#6c7a5c',
  red: '#c8323c', orange: '#e07b1a', enemy: '#6f7a86', enemy2: '#56606c', missile: '#d8d8d4', warhead: '#404448', flame: '#ffb060',
  civil: '#f0f0ee', fuel: '#e2e0d4', concrete: '#b0b0a8'
};
IC.MODEL_PAL = P;

/* ---------- builders shared by several models ---------- */
/* a fuselage along x from the tail (x0) to the nose (x1), with a rounded nose and a tapered tail */
function fuselage(x0, x1, d, z, col, o) {
  o = o || {};
  const L = x1 - x0, nose = o.nose || d * 1.6, tail = o.tail || d * 2.2;
  return [
    ['cyl', x0 + tail + (L - tail - nose) / 2, 0, z, L - tail - nose, d, d, col],
    ['cone', x1 - nose / 2, 0, z, nose, d, d, col],
    ['cone', x0 + tail / 2, 0, z + d * 0.18, tail, d, d * 0.7, col, { flip: true }]
  ];
}
/* a pair of wings: root at x (leading edge), span, root chord c0, tip chord c1, sweep back s (metres at the tip) */
function wings(x, span, c0, c1, s, z, col, th) {
  const h = span / 2, pts = [];
  for (const k of [1, -1]) pts.push([[x, 0], [x - s, k * h], [x - s - c1, k * h], [x - c0, 0]]);
  return [['poly', 0, 0, z, 0, 0, th || 0.3, col, { pts: pts[0] }], ['poly', 0, 0, z, 0, 0, th || 0.3, col, { pts: pts[1] }]];
}
function fin(x, z0, h, c0, c1, s, col, y, th, down) { const k = down ? -1 : 1; return ['fin', 0, y || 0, 0, 0, th || 0.25, 0, col, { pts: [[x, z0], [x - s, z0 + k * h], [x - s - c1, z0 + k * h], [x - c0, z0]] }]; }
function engine(x, y, z, len, d, col) { return ['cyl', x, y, z, len, d, d, col || P.dark]; }

/* airliners in three sizes, turboprops, freighters and the large military aircraft share one plan */
function airliner(len, span, o) {
  o = o || {};
  const d = o.d || len * 0.11, z = d * 0.55 + (o.gear || 1.2), x1 = len / 2, x0 = -len / 2;
  const body = o.body || 'BODY';
  const parts = fuselage(x0, x1, d, z, body);
  const wx = x1 - len * 0.42, c0 = len * 0.2, c1 = len * 0.06;
  parts.push(...wings(wx, span, c0, c1, o.sweep == null ? span * 0.2 : o.sweep, z - d * 0.35, P.grey, d * 0.12));
  // tailplane and fin
  parts.push(...wings(x0 + len * 0.13, span * 0.36, len * 0.08, len * 0.035, span * 0.06, o.ttail ? z + d * 1.6 : z, P.grey, d * 0.08));
  parts.push(fin(x0 + len * 0.14, z + d * 0.3, d * 1.9, len * 0.13, len * 0.05, len * 0.08, 'L1'));
  // cheatline
  parts.push(['box', (x0 + x1) / 2, 0, z + d * 0.12, len * 0.62, d * 1.02, d * 0.16, 'L1']);
  parts.push(['box', x1 - len * 0.08, 0, z + d * 0.2, len * 0.03, d * 0.9, d * 0.3, P.glass]);
  // engines under the wings (o.eng: how many a side) or propellers on the leading edge
  const n = o.eng == null ? 1 : o.eng;
  for (const k of [-1, 1]) for (let i = 0; i < n; i++) {
    const f = (i + 1) / (n + 1) * 0.72 + 0.1, ey = k * span / 2 * f;
    if (o.prop) { parts.push(engine(wx - c0 * 0.5 + len * 0.06, ey, z - d * 0.2, len * 0.14, d * 0.55, 'L2')); parts.push(['disc', wx + len * 0.07, ey, z - d * 0.2, 0, d * 2.2, 0, P.dark, { axis: 'x' }]); }
    else parts.push(engine(wx - c0 * 0.45 - Math.abs(ey) * 0.25, ey, z - d * 0.72, len * 0.11, d * 0.62, 'L2'));
  }
  if (o.tailEng) parts.push(engine(x0 + len * 0.2, 0, z + d * 0.9, len * 0.12, d * 0.6, 'L2'));
  if (o.hump) parts.push(['sphere', x1 - len * 0.32, 0, z + d * 0.45, len * 0.36, d * 0.95, d * 0.9, body]);
  if (o.rotodome) { parts.push(['cyl', 0, 0, z + d * 2.2, 0, 0.35, 0, P.grey, { axis: 'z', len: d * 1.4 }]); parts.push(['cyl', 0, 0, z + d * 3, 0, len * 0.22, 0, P.radar, { axis: 'z', len: d * 0.22 }]); }
  return parts;
}
/* a fighter: pointed nose, cockpit, swept or delta wings, one or two fins */
function fighter(len, span, o) {
  o = o || {};
  const d = len * 0.1, z = d * 0.5 + 1.2, x1 = len / 2, x0 = -len / 2, body = o.body || P.steel, wing = o.wing || body;
  const parts = [
    ['box', -len * 0.05, 0, z, len * 0.6, d * 1.6, d * 0.9, body],
    ['cone', x1 - len * 0.17, 0, z, len * 0.34, d * 1.2, d * 0.9, body],
    ['box', x1 - len * 0.3, 0, z + d * 0.55, len * 0.18, d * 0.7, d * 0.5, P.glass],
    ['box', -len * 0.42, 0, z, len * 0.18, d * 1.3, d * 0.8, body]
  ];
  parts.push(...wings(len * 0.1, span, len * 0.42, len * 0.1, span * 0.32, z - d * 0.2, wing, d * 0.16));
  parts.push(...wings(x0 + len * 0.16, span * 0.5, len * 0.12, len * 0.05, span * 0.1, z, wing, d * 0.12));
  if (o.twin) { parts.push(fin(x0 + len * 0.2, z + d * 0.3, d * 2.1, len * 0.16, len * 0.06, len * 0.12, body, d * 0.55)); parts.push(fin(x0 + len * 0.2, z + d * 0.3, d * 2.1, len * 0.16, len * 0.06, len * 0.12, body, -d * 0.55)); }
  else parts.push(fin(x0 + len * 0.2, z + d * 0.3, d * 2.4, len * 0.18, len * 0.06, len * 0.14, body));
  for (const k of [-1, 1]) parts.push(['box', -len * 0.02, k * d * 1.05, z - d * 0.1, len * 0.28, d * 0.5, d * 0.7, P.dark]);   // intakes
  parts.push(['cyl', x0 + len * 0.02, 0, z, len * 0.06, d * 0.9, d * 0.9, P.black]);
  if (o.stores) for (const k of [-1, 1]) parts.push(['cyl', 0, k * span * 0.28, z - d * 0.55, len * 0.22, d * 0.28, d * 0.28, P.missile]);
  return parts;
}
/* a helicopter: cabin, boom, rotor disc, tail rotor, skids or wheels */
function heli(len, rotor, o) {
  o = o || {};
  const body = o.body || P.green2, z = 1.4, d = len * 0.16;
  const parts = [
    ['box', len * 0.12, 0, z + d * 0.5, len * 0.42, d * 1.2, d, body],
    ['sphere', len * 0.36, 0, z + d * 0.45, len * 0.2, d * 1.1, d * 0.9, body],
    ['box', len * 0.34, 0, z + d * 0.75, len * 0.16, d * 0.9, d * 0.5, P.glass],
    ['cyl', -len * 0.22, 0, z + d * 0.7, len * 0.5, d * 0.35, d * 0.35, body],
    fin(-len * 0.44, z + d * 0.6, d * 1.2, len * 0.1, len * 0.05, len * 0.05, body),
    ['cyl', len * 0.1, 0, z + d * 1.2, 0, d * 0.25, 0, P.dark, { axis: 'z', len: d * 0.5 }],
    ['disc', len * 0.1, 0, z + d * 1.45, 0, rotor, 0, P.dark],
    ['disc', -len * 0.46, d * 0.3, z + d * 1.1, 0, rotor * 0.2, 0, P.dark, { axis: 'y' }]
  ];
  if (o.gun) parts.push(['cyl', len * 0.5, 0, z, len * 0.12, 0.25, 0.25, P.black]);
  if (o.stubs) for (const k of [-1, 1]) { parts.push(['box', len * 0.05, k * len * 0.15, z + d * 0.3, len * 0.1, len * 0.14, 0.2, body]); parts.push(['cyl', len * 0.05, k * len * 0.2, z + d * 0.05, len * 0.18, 0.5, 0.5, P.dark]); }
  for (const k of [-1, 1]) parts.push(['cyl', len * 0.12, k * d * 0.6, 0.35, len * 0.3, 0.15, 0.15, P.black]);
  return parts;
}
/* fixed-wing drones: a slim body, long straight wings, a V or inverted-V tail */
function drone(len, span, o) {
  o = o || {};
  const body = o.body || P.grey, d = len * 0.09, z = d * 0.6 + 0.8;
  const parts = fuselage(-len / 2, len / 2, d, z, body, { nose: d * 2, tail: d * 1.4 });
  parts.push(...wings(len * 0.08, span, len * 0.12, len * 0.08, o.sweep || 0, z, body, d * 0.2));
  parts.push(fin(-len * 0.38, z, d * 1.4, len * 0.1, len * 0.05, len * 0.05, body, d * 0.5));
  parts.push(fin(-len * 0.38, z, d * 1.4, len * 0.1, len * 0.05, len * 0.05, body, -d * 0.5));
  if (o.bulge) parts.push(['sphere', len * 0.3, 0, z + d * 0.4, len * 0.2, d * 1.2, d * 0.9, body]);
  if (o.prop) parts.push(['disc', -len / 2 - 0.1, 0, z, 0, len * 0.14, 0, P.dark, { axis: 'x' }]);
  return parts;
}
/* a missile: body, nose, tail fins; wings for a cruise missile */
function missile(len, d, o) {
  o = o || {};
  const body = o.body || P.missile, z = 0;
  const parts = [['cyl', -len * 0.08, 0, z, len * 0.84, d, d, body], ['cone', len * 0.42, 0, z, len * 0.16, d, d, o.nose || body]];
  const fs = o.finSpan || d * 2.6, fc = len * 0.1;
  for (const y of [1, -1]) parts.push(['poly', 0, 0, z, 0, 0, d * 0.15, body, { pts: [[-len * 0.5 + fc, 0], [-len * 0.5, y * fs / 2], [-len * 0.5, y * fs / 2 * 0.6], [-len * 0.5 + fc * 0.5, 0]] }]);
  parts.push(fin(-len * 0.5 + fc, z, fs / 2, fc, fc * 0.4, fc * 0.3, body, 0, d * 0.15));
  parts.push(fin(-len * 0.5 + fc, z, fs / 2, fc, fc * 0.4, fc * 0.3, body, 0, d * 0.15, true));
  if (o.wings) parts.push(...wings(len * 0.08, o.wings, len * 0.12, len * 0.08, 0, z - d * 0.3, body, d * 0.15));
  if (o.intake) parts.push(['box', -len * 0.2, 0, z - d * 0.6, len * 0.18, d * 0.6, d * 0.4, P.dark]);
  if (o.warhead) parts.push(['cone', len * 0.42, 0, z, len * 0.16, d, d, P.warhead]);
  if (o.stripes) parts.push(['box', 0, 0, z, len * 0.04, d * 1.02, d * 1.02, P.red]);
  return parts;
}

/* ---------- vehicles ---------- */
/* a lorry chassis: cab at the front, wheels on n axles, a flat bed. len and w in metres */
function lorry(len, w, axles, col, o) {
  o = o || {};
  const cabL = o.cabL || 2.3, h = o.h || 1.1, cabH = o.cabH || 2.3;
  const parts = [
    ['box', 0, 0, h, len, w, 0.4, P.dark],
    ['box', len / 2 - cabL / 2, 0, h + cabH / 2, cabL, w, cabH, col],
    ['box', len / 2 - cabL * 0.15, 0, h + cabH * 0.7, cabL * 0.3, w * 0.9, cabH * 0.42, P.glass]
  ];
  for (let i = 0; i < axles; i++) {
    const x = axles === 1 ? 0 : -len / 2 + 1.1 + i * ((len - 2.2) / (axles - 1));
    for (const k of [-1, 1]) parts.push(['cyl', x, k * (w / 2 - 0.2), 0.55, 0.6, 1.1, 1.1, P.rubber, { axis: 'y' }]);
  }
  if (o.bed) parts.push(['box', -cabL / 2 - 0.2, 0, h + o.bed / 2 + 0.2, len - cabL - 0.6, w, o.bed, o.bedCol || col]);
  return parts;
}
/* missile canisters on a raised launcher, pitched up when the unit is deployed */
function canisters(x, z, n, len, d, col, pitch, gap) {
  const parts = [], across = n <= 2 ? n : Math.ceil(n / 2), rows = n <= 2 ? 1 : 2, g = gap || d * 1.15;
  parts.push(['box', x - len * 0.15, 0, z - d * 0.5, len * 0.5, across * g + 0.2, 0.3, P.dark, { pitch }]);
  for (let r = 0; r < rows; r++) for (let i = 0; i < across; i++) parts.push(['cyl', x, (i - (across - 1) / 2) * g, z + r * g, len, d, d, col || P.canvas, { pitch }]);
  return parts;
}
/* a planar radar array on a mast, tilted back */
function array(x, z, w, h, col, tilt, yaw) { return [['cyl', x, 0, z / 2 + 0.6, 0, 0.35, 0, P.dark, { axis: 'z', len: z - 0.6 }], ['box', x, 0, z + h / 2, 0.25, w, h, col || P.radar, { pitch: tilt == null ? -0.25 : tilt, yaw: yaw || 0 }]]; }
/* a rotating dish or bar antenna on a mast */
function dish(x, z, w, h, col) { return [['cyl', x, 0, z / 2 + 0.6, 0, 0.3, 0, P.dark, { axis: 'z', len: z - 0.6 }], ['box', x, 0, z + h / 2, 0.4, w, h, col || P.radar, { pitch: -0.3, spin: true }]]; }
/* a tracked or eight-wheeled armoured hull with a turret */
function hull(len, w, col) {
  const parts = [['box', 0, 0, 1.4, len, w, 1.2, col]];
  for (const k of [-1, 1]) parts.push(['box', 0, k * (w / 2 - 0.35), 0.55, len * 0.92, 0.7, 1.1, P.rubber]);
  return parts;
}
function turret(x, z, d, col, barrels, blen) {
  const parts = [['cyl', x, 0, z + 0.4, 0, d, 0, col, { axis: 'z', len: 0.8 }]];
  const bs = barrels || 0;
  for (let i = 0; i < bs; i++) parts.push(['cyl', x + d / 2 + blen / 2, (i - (bs - 1) / 2) * 0.35, z + 0.55, blen, 0.16, 0.16, P.black, { pitch: 0.3 }]);
  return parts;
}
/* a shelter box on a lorry, with a mast */
function shelterTruck(col, mast) {
  const parts = lorry(9, 2.5, 3, col, { bed: 2.2, bedCol: col });
  if (mast) parts.push(['cyl', -3, 0.6, 3.2 + mast / 2, 0, 0.2, 0, P.dark, { axis: 'z', len: mast }], ['box', -3, 0.6, 3.4 + mast, 0.6, 0.6, 0.3, P.radar]);
  return parts;
}
/* a wheeled TEL with n canisters, raised for firing */
function tel(n, len, d, col, o) {
  o = o || {};
  const L = o.len || 12, parts = lorry(L, 3, o.axles || 4, col || P.green, { cabL: 2.4 });
  parts.push(...canisters(-L * 0.12, 3.3, n, len, d, o.can || P.canvas, o.pitch == null ? 1.2 : o.pitch, o.gap));
  return parts;
}
/* a trailer with a mast (radars that take an hour to set up) */
function trailer(len, w, col) {
  const parts = [['box', 0, 0, 1, len, w, 0.4, col]];
  for (const k of [-1, 1]) for (const x of [-len * 0.3, -len * 0.1]) parts.push(['cyl', x, k * (w / 2 - 0.2), 0.5, 0.5, 1, 1, P.rubber, { axis: 'y' }]);
  parts.push(['box', len / 2 - 0.4, 0, 0.6, 0.8, 0.3, 0.8, P.dark]);
  return parts;
}
/* a small building on a slab: fixed sites */
function hut(w, l, h, col) { return [['box', 0, 0, 0.1, l + 4, w + 4, 0.2, P.concrete], ['box', 0, 0, 0.2 + h / 2, l, w, h, col || P.tan]]; }

/* ---------- the catalogue ---------- */
const M = {};
const def = (key, name, group, len, span, parts, o) => { M[key] = Object.assign({ key, name, group, len, span, parts }, o || {}); };

// aircraft, by IC.ACTYPES key
def('light', 'Light aircraft', 'Civil aircraft', 8, 11, (() => {
  const p = fuselage(-4, 4, 1.2, 1.4, 'BODY', { nose: 1.4, tail: 3 });
  p.push(...wings(1.2, 11, 1.5, 1.1, 0, 2.1, 'BODY', 0.2), ...wings(-3.2, 3.4, 0.8, 0.5, 0.2, 1.4, 'BODY', 0.12), fin(-3.2, 1.6, 1.3, 1, 0.5, 0.4, 'L1'));
  p.push(['box', 1.6, 0, 2.2, 1.4, 1, 0.5, P.glass], ['disc', 4.1, 0, 1.4, 0, 1.9, 0, P.dark, { axis: 'x' }], ['box', -0.5, 0, 1.5, 3.6, 1.22, 0.2, 'L1']);
  for (const [x, y] of [[0.6, -1.2], [0.6, 1.2], [3.2, 0]]) p.push(['cyl', x, y, 0.35, 0.5, 0.5, 0.5, P.black, { axis: 'y' }]);
  return p;
})());
def('turbo', 'Regional turboprop', 'Civil aircraft', 27, 27, airliner(27, 27, { prop: true, sweep: 0, ttail: true, d: 2.7 }));
def('narrow', 'Narrow-body jet', 'Civil aircraft', 38, 36, airliner(38, 36, { d: 3.9 }));
def('wide', 'Wide-body jet', 'Civil aircraft', 64, 62, airliner(64, 62, { eng: 1, d: 6 }));
def('cargo', 'Freighter', 'Civil aircraft', 70, 64, airliner(70, 64, { eng: 2, d: 6.6, hump: true }));
def('fighter', 'Fighter', 'Our air wing', 16, 11, fighter(16, 11, { twin: true, stores: true, body: P.steel }));
def('heavy', 'Large military aircraft', 'Our air wing', 46, 42, airliner(46, 42, { eng: 2, d: 4.6, body: P.grey, sweep: 4, rotodome: true }));
def('drone', 'Drone', 'Our air wing', 10, 20, drone(10, 20, { bulge: true, prop: true }));
def('heli', 'Helicopter', 'Our air wing', 18, 16, heli(18, 16));
// our missiles in flight
def('sam', 'Interceptor', 'Missiles', 5, 1, missile(5, 0.35, { stripes: true }));
def('aam', 'Air-to-air missile', 'Missiles', 3.6, 0.6, missile(3.6, 0.2, { finSpan: 0.7 }));
def('gbu', 'Guided bomb', 'Missiles', 3, 0.5, missile(3, 0.45, { body: P.green2, finSpan: 1 }));

// the enemy's tokens, by IC.THR key (airliners and light aircraft use the civil models above)
def('owa', 'One-way attack drone', 'Enemy weapons', 3.5, 2.5, (() => { const p = [['box', 0, 0, 0.3, 3, 0.4, 0.35, P.enemy]]; p.push(['poly', 0, 0, 0.3, 0, 0, 0.1, P.enemy, { pts: [[1.4, 0], [-1.4, 1.25], [-1.7, 1.25], [-1.7, 0]] }], ['poly', 0, 0, 0.3, 0, 0, 0.1, P.enemy, { pts: [[1.4, 0], [-1.4, -1.25], [-1.7, -1.25], [-1.7, 0]] }], fin(-1.5, 0.3, 0.5, 0.4, 0.2, 0.1, P.enemy, 1.1), fin(-1.5, 0.3, 0.5, 0.4, 0.2, 0.1, P.enemy, -1.1), ['disc', -1.8, 0, 0.3, 0, 0.9, 0, P.dark, { axis: 'x' }]); return p; })());
def('jdr', 'Jet attack drone', 'Enemy weapons', 6, 3.6, (() => { const p = fuselage(-3, 3, 0.7, 0.4, P.enemy, { nose: 1.4, tail: 0.8 }); p.push(...wings(0.6, 3.6, 1.2, 0.5, 0.8, 0.3, P.enemy, 0.1), fin(-2.4, 0.5, 0.7, 0.6, 0.3, 0.3, P.enemy, 0.35), fin(-2.4, 0.5, 0.7, 0.6, 0.3, 0.3, P.enemy, -0.35), ['box', -1.2, 0, 0.9, 1.2, 0.5, 0.4, P.dark]); return p; })());
def('lm', 'Loitering munition', 'Enemy weapons', 2.5, 3, (() => { const p = [['cyl', 0, 0, 0, 2.2, 0.3, 0.3, P.enemy], ['cone', 1.25, 0, 0, 0.5, 0.3, 0.3, P.warhead]]; p.push(...wings(0.3, 3, 0.3, 0.25, 0, 0.1, P.enemy, 0.06), ...wings(-1, 1.2, 0.25, 0.2, 0, 0, P.enemy, 0.05), ['disc', -1.2, 0, 0, 0, 0.6, 0, P.dark, { axis: 'x' }]); return p; })());
def('isr', 'Reconnaissance drone', 'Enemy weapons', 11, 20, drone(11, 20, { body: P.enemy, bulge: true, prop: true }));
def('cm', 'Cruise missile', 'Enemy weapons', 6, 3, missile(6, 0.52, { wings: 3, intake: true, warhead: true, body: P.enemy }));
def('scm', 'Supersonic cruise missile', 'Enemy weapons', 8.5, 1.7, missile(8.5, 0.7, { wings: 1.7, intake: true, body: P.enemy2 }));
def('glb', 'Glide bomb', 'Enemy weapons', 3.5, 2.6, missile(3.5, 0.6, { wings: 2.6, body: P.green2, finSpan: 1 }));
def('bm', 'Ballistic missile', 'Enemy weapons', 12, 1.2, missile(12, 1, { finSpan: 2.4, warhead: true, body: P.enemy }));
def('hgv', 'Hypersonic glide vehicle', 'Enemy weapons', 6, 2.4, [['poly', 0, 0, 0, 0, 0, 0.5, P.warhead, { pts: [[3, 0], [-3, 1.2], [-3, -1.2]] }], ['box', -1.5, 0, 0.45, 2.5, 0.8, 0.4, P.enemy2], fin(-2.9, 0.4, 0.6, 0.8, 0.3, 0.3, P.enemy2, 0.9), fin(-2.9, 0.4, 0.6, 0.8, 0.3, 0.3, P.enemy2, -0.9)]);
def('rkt', 'Guided rocket', 'Enemy weapons', 4, 0.6, missile(4, 0.3, { finSpan: 0.7, body: P.enemy }));
def('arm', 'Anti-radiation missile', 'Enemy weapons', 4.2, 1, missile(4.2, 0.28, { finSpan: 1, body: P.enemy }));
def('dcy', 'Air-launched decoy', 'Enemy weapons', 3, 1.8, missile(3, 0.35, { wings: 1.8, body: P.enemy, finSpan: 0.6 }));
def('ahe', 'Attack helicopter', 'Enemy weapons', 17, 15, heli(17, 15, { body: P.enemy2, gun: true, stubs: true }));
def('ftr_e', 'Fighter', 'Enemy weapons', 19, 13, fighter(19, 13, { twin: true, stores: true, body: P.enemy, wing: P.enemy2 }));
def('str', 'Strike aircraft', 'Enemy weapons', 17, 12, fighter(17, 12, { stores: true, body: P.enemy2 }));
def('ewj', 'Stand-off jammer', 'Enemy weapons', 22, 20, (() => { const p = airliner(22, 20, { body: P.enemy, eng: 0, tailEng: false, ttail: true, d: 2.4 }); p.push(engine(-3, 1.7, 3.4, 3.5, 1.3, P.enemy2), engine(-3, -1.7, 3.4, 3.5, 1.3, P.enemy2), ['box', 3, 0, 1.2, 7, 1.2, 0.6, P.enemy2]); return p; })());
def('esj', 'Escort jammer drone', 'Enemy weapons', 7, 5, drone(7, 5, { body: P.enemy, sweep: 1 }));
def('bmr', 'Missile-carrier bomber', 'Enemy weapons', 47, 50, (() => { const p = airliner(47, 50, { body: P.enemy, eng: 0, d: 4.2, sweep: 14 }); for (const k of [-1, 1]) { p.push(engine(-8, k * 2.8, 2.6, 6, 1.6, P.enemy2)); p.push(['cyl', -2, k * 12, 1.6, 7, 0.6, 0.6, P.missile]); p.push(['cyl', -3, k * 17, 1.6, 7, 0.6, 0.6, P.missile]); } return p; })());

// our launchers and radars, by IC.UNITS key
const G = P.green, G2 = P.green2;
def('acou', 'Whisper', 'Our units', 6, 6, [...hut(2, 2, 1.6, P.tan), ['cyl', 0, 0, 3.5, 0, 0.12, 0, P.dark, { axis: 'z', len: 3.4 }], ['sphere', 0, 0, 5.4, 0.8, 0.8, 0.8, P.radar]]);
def('ssr', 'Beacon', 'Our units', 8, 8, [...hut(4, 5, 3, P.concrete), ...dish(0, 6, 7, 1.2, P.radar)]);
def('vhf', 'Longwave', 'Our units', 12, 14, [...lorry(10, 2.6, 3, G, { bed: 1.6 }), ['cyl', -2.5, 0, 6, 0, 0.3, 0, P.dark, { axis: 'z', len: 4 }], ['box', -2.5, 0, 8.5, 0.5, 13, 3, P.radar, { spin: true }]]);
def('lr3d', 'Sentinel', 'Our units', 12, 9, [...lorry(11, 2.8, 4, G, { bed: 1.8 }), ...array(-2.5, 4.5, 8, 4, P.radar, -0.35)]);
def('mr3d', 'Kestrel', 'Our units', 9, 6, [...lorry(9, 2.5, 3, G, { bed: 1.6 }), ...array(-2.2, 4, 5, 2.6, P.radar, -0.3)]);
def('gf', 'Lowwatch', 'Our units', 8, 4, [...lorry(8, 2.5, 3, G, { bed: 1.6 }), ['cyl', -2, 0, 9, 0, 0.35, 0, P.dark, { axis: 'z', len: 12 }], ['box', -2, 0, 15.6, 0.4, 3, 1.2, P.radar, { spin: true }]]);
def('esm', 'Harker', 'Our units', 9, 4, [...shelterTruck(G, 9), ['cyl', -3, 0.6, 12.8, 0, 2.4, 0, P.radar, { axis: 'z', len: 0.4 }]]);
def('pcl', 'Echo', 'Our units', 9, 4, [...shelterTruck(G, 6), ['box', -3, 0.6, 9.6, 0.3, 4, 1.6, P.radar]]);
def('cbr', 'Backtrack', 'Our units', 8, 4, [...lorry(8, 2.5, 3, G, { bed: 1.4 }), ...array(-2, 3.6, 3.6, 2.4, P.radar, -0.5)]);
def('aero', 'Skyhook', 'Our units', 12, 12, [...lorry(10, 2.6, 3, G, { bed: 1.4 }), ['cyl', -2, 0, 3.4, 0, 2.4, 0, P.dark, { axis: 'z', len: 1 }], ['cyl', -2, 0, 18, 0, 0.08, 0, P.steel, { axis: 'z', len: 28 }], ['sphere', -2, 0, 34, 14, 10, 8, P.white]]);
def('bmd', 'Farsight', 'Our units', 16, 16, [...hut(10, 10, 5, P.concrete), ['box', 0, 0, 10, 8, 9, 10, P.radar, { pitch: -0.5 }]]);
def('manpads', 'Nettle', 'Our units', 3, 3, [['box', 0, -0.5, 0.9, 0.5, 0.5, 1.8, G2], ['box', 0.2, 0.5, 0.9, 0.5, 0.5, 1.8, G2], ['cyl', 0.2, -0.5, 1.8, 1.7, 0.16, 0.16, G, { pitch: 0.5 }], ['box', -1.5, 0, 0.5, 1.2, 1, 1, P.tan]]);
def('spaag', 'Buzzsaw', 'Our units', 8, 3, [...hull(7.5, 3.2, G), ...turret(-0.5, 2, 2.4, G, 2, 3.5), ['box', -1.6, 0, 3.2, 0.3, 1.6, 1, P.radar, { pitch: -0.4 }]]);
def('cram', 'Hailstorm', 'Our units', 6, 4, [['box', 0, 0, 0.3, 6, 4, 0.6, P.concrete], ['cyl', -0.5, 0, 1.6, 0, 2, 0, P.white, { axis: 'z', len: 2 }], ['cyl', 1.2, 0, 2.5, 2.6, 0.45, 0.45, P.black, { pitch: 0.7 }], ['sphere', -0.5, 0, 3.4, 1.8, 1.8, 1.4, P.white]]);
def('shorad', 'Vixen', 'Our units', 9, 3, [...hull(8.5, 3.2, G), ...turret(-0.3, 2, 2.2, G, 0), ...canisters(-0.3, 3.2, 4, 3, 0.4, P.canvas, 0.6, 0.55), ['box', -1.2, 0, 4, 0.3, 1.4, 1, P.radar, { pitch: -0.4 }]]);
def('vshorad', 'Thistle', 'Our units', 6, 2.5, [...lorry(5.5, 2.2, 2, G, { cabL: 1.8, bed: 0.8 }), ...turret(-1.5, 1.8, 1.2, G, 0), ...canisters(-1.5, 2.6, 4, 1.8, 0.2, P.canvas, 0.5, 0.3), ['sphere', -1.5, 0, 3.2, 0.7, 0.7, 0.5, P.radar]]);
def('mrsam', 'Aegir', 'Our units', 12, 3, tel(4, 5.5, 0.55, G, { pitch: 1.1 }));
def('mrmob', 'Rover', 'Our units', 10, 3, [...hull(9, 3.2, G), ...canisters(-1.5, 3, 4, 4.5, 0.45, P.canvas, 0.9, 0.55), ['box', 2.5, 0, 2.6, 0.3, 1.6, 1.2, P.radar, { pitch: -0.4 }]]);
def('lrsam', 'Bastion', 'Our units', 13, 3, tel(4, 7.5, 0.75, G, { pitch: 1.35, len: 13 }));
def('hatd', 'Highwall', 'Our units', 13, 3, tel(8, 6.5, 0.5, G, { pitch: 0.55, len: 13, gap: 0.62 }));
def('exo', 'Zenith', 'Our units', 8, 8, [['box', 0, 0, 0.3, 10, 10, 0.6, P.concrete], ...canisters(0, 2, 4, 9, 1.1, P.steel, 1.5, 1.6)]);
def('dgun', 'Rattler', 'Our units', 6, 2.4, [...lorry(5.8, 2.3, 2, G, { cabL: 1.8, bed: 0.6 }), ...turret(-1.6, 1.7, 1.4, G2, 1, 2.2), ['box', -2.4, 0, 3, 0.2, 1, 0.8, P.radar, { pitch: -0.3 }]]);
def('idl', 'Swift', 'Our units', 8, 3, [...lorry(8, 2.5, 3, G, { bed: 1.6 }), ['box', -2.2, 0, 3.9, 3, 2.2, 1.2, G2], ['box', -2.2, 0.8, 4.7, 1, 0.5, 0.4, P.dark], ['box', -2.2, -0.8, 4.7, 1, 0.5, 0.4, P.dark], ['box', -2.2, 0, 4.7, 1, 0.5, 0.4, P.dark]]);
def('cp', 'Keystone', 'Our units', 9, 4, [...shelterTruck(G, 7), ['box', 1, 0, 3.6, 2, 2.5, 0.2, P.tan]]);
def('laser', 'Sunspear', 'Our units', 8, 6, [['box', 0, 0, 0.3, 8, 6, 0.6, P.concrete], ['box', -1, 0, 1.6, 5, 4, 2, P.tan], ...turret(0.5, 2.6, 2, P.steel, 0), ['box', 0.9, 0, 3.6, 1.4, 1.2, 1, P.white, { pitch: 0.6 }], ['cyl', 1.6, 0, 3.9, 0.6, 0.7, 0.7, P.glass, { pitch: 0.6 }]]);
def('mlaser', 'Glint', 'Our units', 9, 3, [...hull(8.5, 3.2, G), ...turret(-0.5, 2, 2, G2, 0), ['box', -0.3, 0, 3.4, 1.2, 1.1, 1, P.white, { pitch: 0.6 }], ['cyl', 0.3, 0, 3.7, 0.5, 0.6, 0.6, P.glass, { pitch: 0.6 }]]);
def('hpm', 'Static', 'Our units', 9, 5, [['box', 0, 0, 0.3, 9, 5, 0.6, P.concrete], ['box', -2, 0, 1.6, 4, 3, 2, P.tan], ['cyl', 1, 0, 2.6, 0, 0.5, 0, P.dark, { axis: 'z', len: 2.4 }], ['box', 1.4, 0, 4.4, 0.8, 4.4, 3.4, P.radar, { pitch: -0.3 }]]);
def('gnss', 'Mirage', 'Our units', 9, 4, [...shelterTruck(G, 8), ['box', -3, 0.6, 11.4, 0.6, 2.4, 0.5, P.radar], ['cyl', -3, -0.6, 10, 0, 0.3, 0, P.radar, { axis: 'z', len: 1.6 }]]);
def('decoy', 'Phantom', 'Our units', 9, 4, [...lorry(7, 2.5, 2, P.tan, { bed: 1.8 }), ...array(-1.8, 3.6, 5, 2.6, P.tan, -0.3)]);
def('mlrs', 'Rainmaker', 'Our units', 8, 3, [...hull(7.5, 3, G), ['box', -1, 0, 3.2, 4.2, 2.6, 1.6, G2, { pitch: 0.7 }]]);
def('glcm', 'Harrow', 'Our units', 12, 3, tel(4, 6.5, 0.6, G, { pitch: 0.9, can: G2 }));
def('tbml', 'Spire', 'Our units', 13, 3, tel(1, 9, 1, G, { pitch: 1.45, len: 13, can: P.steel }));
def('depot', 'Forward Depot', 'Our units', 16, 12, [['box', 0, 0, 0.1, 22, 16, 0.2, P.concrete], ['box', -5, -4, 1.4, 6, 2.5, 2.6, P.canvas], ['box', -5, 0, 1.4, 6, 2.5, 2.6, P.canvas], ['box', -5, 4, 1.4, 6, 2.5, 2.6, P.canvas], ['box', 4, -3, 1.6, 10, 5, 3.2, P.tan], ['box', 5, 4, 0.9, 6, 3, 1.4, G2]]);
def('heliport', 'Forward Heliport', 'Our units', 20, 20, [['cyl', 0, 0, 0.1, 0, 22, 0, P.concrete, { axis: 'z', len: 0.2 }], ['box', 0, 0, 0.25, 8, 1.2, 0.1, P.white], ['box', 0, 0, 0.25, 1.2, 6, 0.1, P.white], ['box', 12, 0, 1.4, 5, 4, 2.6, P.tan], ['cyl', 12, 3, 1, 0, 1.6, 0, P.fuel, { axis: 'z', len: 2 }]]);

// lorries on the roads
def('truck', 'Lorry', 'Vehicles', 10, 2.5, lorry(10, 2.5, 3, G, { bed: 2.2, bedCol: P.canvas }));
def('tanker', 'Fuel lorry', 'Vehicles', 10, 2.5, [...lorry(10, 2.5, 3, P.fuel, { cabL: 2.3 }), ['cyl', -1.5, 0, 2.2, 6.5, 2.2, 2.2, P.fuel]]);
def('car', 'Car', 'Vehicles', 4.5, 1.8, [['box', 0, 0, 0.7, 4.5, 1.8, 0.6, P.grey], ['box', -0.2, 0, 1.2, 2.2, 1.6, 0.5, P.glass], ['cyl', 1.4, 0.8, 0.3, 0.3, 0.6, 0.6, P.rubber, { axis: 'y' }], ['cyl', 1.4, -0.8, 0.3, 0.3, 0.6, 0.6, P.rubber, { axis: 'y' }], ['cyl', -1.4, 0.8, 0.3, 0.3, 0.6, 0.6, P.rubber, { axis: 'y' }], ['cyl', -1.4, -0.8, 0.3, 0.3, 0.6, 0.6, P.rubber, { axis: 'y' }]]);

IC.MODELS = M;
IC.MODEL_GROUPS = ['Civil aircraft', 'Our air wing', 'Missiles', 'Enemy weapons', 'Our units', 'Vehicles'];

/* ---------- which model an object uses ---------- */
const THR_MODEL = { owa: 'owa', jdr: 'jdr', lm: 'lm', isr: 'isr', lacm: 'cm', mcm: 'cm', scm: 'scm', glb: 'glb', srbm: 'bm', marv: 'bm', mrbm: 'bm', pen: 'bm', hgv: 'hgv', rkt: 'rkt', arm: 'arm', dcy: 'dcy', ahe: 'ahe', ftr: 'ftr_e', str: 'str', sead: 'ftr_e', ewj: 'ewj', esj: 'esj', bmr: 'bmr', ga: 'light' };
const KLASS_MODEL = { drone: 'drone', cm: 'cm', ballistic: 'bm', rocket: 'rkt', heli: 'ahe', fighter: 'ftr_e', bomber: 'bmr', jammer: 'ewj', airliner: 'narrow', light: 'light' };
/* an aircraft type (IC.ACTYPES key) */
IC.modelOfType = type => M[type] ? type : 'narrow';
/* a hostile or civil track: its real type when known (or when we are looking at the truth), else its class */
IC.modelOfThreat = function (t, truth) {
  if (t.acType && M[t.acType]) return t.acType;
  if (truth || t.aff === 'H' || t.d.civil) return THR_MODEL[t.type] || 'cm';
  return t.klass ? KLASS_MODEL[t.klass] || 'cm' : null;
};
/* one of our flights (S.air) */
IC.modelOfAir = a => IC.modelOfType(IC.AIRKIND_TYPE[a.kind] || 'fighter');
/* one of our units: the model shares the unit type's key */
IC.modelOfUnit = type => M[type] ? type : 'truck';
/* a missile in flight, ours or theirs */
IC.modelOfMissile = m => m.mun === 'AAM' ? 'aam' : m.mun === 'GBU' ? 'gbu' : 'sam';
/* how many vehicles a unit stands as on the ground (launchers, a radar, its lorries) */
IC.unitVehicles = function (d) {
  if (d.weapon === 'sam') return d.mob === 'fixed' ? 1 : d.mags && d.mags[0] && d.mags[0].ln ? Math.min(6, Math.max(1, d.mags[0].ln)) : 2;
  if (d.gun || d.weapon === 'strike' || d.weapon === 'laser') return d.mob === 'fixed' ? 1 : 2;
  return 1;
};

/* the model's extent from above, in metres: the longest reach of any part from the origin (for min-size scaling) */
IC.modelSize = function (key) {
  const m = M[key];
  if (!m) return 10;
  if (m._size) return m._size;
  let r = 0;
  for (const p of m.parts) {
    if (p[0] === 'poly') for (const q of p[8].pts) r = Math.max(r, Math.hypot(q[0], q[1]));
    else if (p[0] === 'fin') for (const q of p[8].pts) r = Math.max(r, Math.abs(q[0]));
    else r = Math.max(r, Math.hypot(Math.abs(p[1]) + p[4] / 2, Math.abs(p[2]) + (p[5] || 0) / 2));
  }
  return m._size = r * 2;
};

/* ---------- city blocks as buildings ----------
   The boxes a block is built of, in the block's own frame (world units, x along the block, y across, ht up):
   the same forms terrain.js draws from above, so the 3D view and the map agree on where the tall buildings are. */
IC.blockBoxes = function (b, town) {
  const sd = Math.floor(b.seed || 0), h = (i, j) => U.hash(sd * 3 + i, j * 7 + 1), W2 = b.w / 2, H2 = b.h / 2, out = [];
  const box = (x, y, w, hh, ht, col) => out.push({ x: x + w / 2, y: y + hh / 2, w, h: hh, ht, col });
  const grid = (S, st, fn) => {
    const n = Math.max(1, Math.round(b.w / S)), m = Math.max(1, Math.round(b.h / S)), cw = b.w / n, ch = b.h / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) fn(-W2 + i * cw + st / 2, -H2 + j * ch + st / 2, cw - st, ch - st, i, j);
  };
  if (!town) { box(-W2 + b.w * 0.1, -H2 + b.h * 0.1, b.w * 0.8, b.h * 0.8, 0.06 + h(1, 1) * 0.03, [150, 140, 126]); return out; }
  switch (b.f) {
    case 'old': case 'court': {
      const old = b.f === 'old';
      grid(old ? 0.75 : 1.25, old ? 0.07 : 0.11, (x, y, w, hh, i, j) => {
        const k = h(i, j);
        if (!old && k < 0.06) return;
        if (old && k > 0.93) { box(x + w * 0.2, y + hh * 0.38, w * 0.62, hh * 0.24, 0.12, [120, 104, 92]); box(x + w * 0.74, y + hh * 0.36, w * 0.14, hh * 0.28, 0.3, [140, 132, 120]); return; }
        const t = Math.min(w, hh) * (old ? 0.36 : 0.27), ht = (old ? 0.05 : 0.08) + h(i + 3, j) * 0.05, c = old ? [176, 120, 96] : [168, 160, 148];
        box(x, y, w, t, ht, c); box(x, y + hh - t, w, t, ht, c); box(x, y + t, t, hh - 2 * t, ht, c); box(x + w - t, y + t, t, hh - 2 * t, ht, c);
      });
      break;
    }
    case 'tower':
      grid(1.3, 0.14, (x, y, w, hh, i, j) => {
        const k = h(i, j); if (k < 0.12) return;
        const nT = k > 0.7 ? 1 : 2;
        for (let q = 0; q < nT; q++) {
          const tw = w * (nT === 1 ? 0.55 + h(q, i) * 0.3 : 0.4), th = hh * (nT === 1 ? 0.5 + h(j, q) * 0.35 : 0.42), tx = x + (nT === 1 ? (w - tw) / 2 : q * w * 0.52 + w * 0.04), ty = y + (hh - th) * h(q + 3, j + i);
          const glass = h(q, j + 2) < 0.6;
          box(tx, ty, tw, th, 0.25 + h(q + 7, i * 3 + j) * 0.9, glass ? [110, 140, 170] : [178, 176, 168]);
        }
      });
      break;
    case 'office':
      grid(1.4, 0.16, (x, y, w, hh, i, j) => { const k = h(i, j); if (k < 0.3) return; box(x + w * 0.15, y + hh * 0.15, w * 0.6, hh * 0.5, 0.1 + h(i, j + 4) * 0.08, [190, 190, 184]); });
      break;
    case 'slab':
      grid(1.2, 0.12, (x, y, w, hh, i, j) => { const along = h(i, j) < 0.5; if (along) box(x + w * 0.1, y + hh * 0.3, w * 0.8, hh * 0.22, 0.2 + h(i + 2, j) * 0.15, [182, 178, 170]); else box(x + w * 0.3, y + hh * 0.1, w * 0.22, hh * 0.8, 0.2 + h(i + 2, j) * 0.15, [182, 178, 170]); });
      break;
    case 'row':
      grid(0.9, 0.09, (x, y, w, hh, i, j) => { for (let q = 0; q < 3; q++) box(x + q * w / 3 + w * 0.02, y + hh * 0.15, w / 3 - w * 0.06, hh * 0.3, 0.07 + h(q, i + j) * 0.02, [172, 132, 108]); for (let q = 0; q < 3; q++) box(x + q * w / 3 + w * 0.02, y + hh * 0.55, w / 3 - w * 0.06, hh * 0.3, 0.07 + h(q + 4, i + j) * 0.02, [172, 132, 108]); });
      break;
    case 'cul':
      grid(0.6, 0.06, (x, y, w, hh, i, j) => { if (h(i, j) < 0.25) return; box(x + w * 0.25, y + hh * 0.25, w * 0.45, hh * 0.45, 0.05 + h(i, j + 1) * 0.02, [190, 160, 140]); });
      break;
    case 'mall':
      box(-W2 + b.w * 0.3, -H2 + b.h * 0.15, b.w * 0.6, b.h * 0.7, 0.1, [200, 196, 188]);
      break;
    case 'shed': case 'ware':
      grid(1.6, 0.18, (x, y, w, hh, i, j) => { if (h(i, j) < 0.15) return; box(x + w * 0.05, y + hh * 0.1, w * 0.9, hh * 0.7, b.f === 'ware' ? 0.12 : 0.09, b.f === 'ware' ? [150, 150, 158] : [160, 158, 150]); });
      break;
    case 'yard':
      grid(1.5, 0.15, (x, y, w, hh, i, j) => { if (h(i, j) < 0.5) return; box(x + w * 0.1, y + hh * 0.2, w * 0.5, hh * 0.5, 0.08, [140, 136, 130]); });
      break;
    default:
      box(-W2 + b.w * 0.15, -H2 + b.h * 0.15, b.w * 0.7, b.h * 0.7, 0.08, [170, 166, 158]);
  }
  return out;
};

})(window.IC);
