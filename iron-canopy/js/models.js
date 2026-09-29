/* Iron Canopy — low-poly models built in code, from real dimensions. One set of definitions serves twice:
   replay3d.js turns them into meshes for the 3D view, render-models.js draws them from above on the 2D map.

   Axes: x forward (the nose), y to starboard, z up, in metres; the origin is the middle of the length on the ground
   (wheels down). A model is a function of a builder (B below): lofted fuselages from cross-sections, tapered and
   swept wings with dihedral from an aerofoil, lathed nacelles, missiles and wheels, boxes for vehicles. Parts that
   move go in named groups with a pivot and an axis: landing gear (up in flight), flaps, rotors and propellers,
   radars that turn, launchers that elevate, an afterburner, window lights. The builder only makes arrays: nothing
   here touches the DOM or three.js, so the tests can check the models headless.

   Colours are palette hexes or slots the view fills: BODY, BELLY, STRIPE, STRIPE2, FIN, ENG (an airline's livery,
   IC.liveryCols), WING, GLASS. Each model is built at two levels of detail (q 1 close, q 0 far). */
(function (IC) {
'use strict';
const U = IC.U;
const RAD = Math.PI / 180;

/* ---------- palette ---------- */
const P = {
  white: '#e6e8ea', grey: '#aeb4ba', dark: '#3a4046', black: '#1a1c1e', glass: '#1c2c3c', steel: '#8c949c',
  green: '#56663f', green2: '#434f34', tan: '#9c9070', radar: '#c4c8cc', rubber: '#202224', canvas: '#687552',
  red: '#c8323c', orange: '#e07b1a', enemy: '#6f7a86', enemy2: '#56606c', missile: '#dcdcd6', warhead: '#404448', flame: '#ffb060',
  civil: '#f0f0ee', fuel: '#e2e0d4', concrete: '#b0b0a8', wing: '#b4b9be', metal: '#6c7278', nozzle: '#4a4640', intake: '#16181a',
  navy: '#27313f', olive: '#5d6a48', sand: '#b5a47c', lgrey: '#c8ccd0', mgrey: '#8a9098', dgrey: '#50565c', camo1: '#6d7b86', camo2: '#8995a0'
};
IC.MODEL_PAL = P;

/* ---------- the builder ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function Builder(q) {
  const B = { q, groups: {}, slots: [], slotOf: new Map(), lights: [], xf: null, tris: 0 };
  B.group = (name, meta) => { B.g = B.groups[name] || (B.groups[name] = Object.assign({ pos: [], nor: [], col: [] }, meta || {})); return B; };
  B.group('main');
  // B.remap bakes colours into a model that always wears the same paint (the rare visitors)
  B.slot = c => { if (B.remap && B.remap[c]) c = B.remap[c]; let i = B.slotOf.get(c); if (i == null) { i = B.slots.length; B.slots.push(c); B.slotOf.set(c, i); } return i; };
  B.T = p => B.xf ? B.xf(p) : p;
  /* a transform for everything built inside fn: p => p */
  B.with = (xf, fn) => { const old = B.xf; B.xf = old ? p => old(xf(p)) : xf; fn(); B.xf = old; };
  /* one triangle, turned to face away from `inside` (a point within the solid); normals per vertex or flat */
  B.tri = (a, b, c, col, inside, na, nb, nc) => {
    let n = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-9) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    if (inside) { const g = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]]; if (dot(n, g) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; n = [-n[0], -n[1], -n[2]]; } }
    const G = B.g, s = B.slot(col);
    for (const [p, pn] of [[a, na], [b, nb], [c, nc]]) { G.pos.push(p[0], p[1], p[2]); const m = pn || n; G.nor.push(m[0], m[1], m[2]); G.col.push(s); }
    B.tris++;
  };
  B.light = (x, y, z, kind) => B.lights.push({ x, y, z, kind });
  return B;
}

/* rings of points (each a closed loop, all the same count) joined by quads; ctr[i] is a point inside ring i.
   o.col(i, j) gives the colour of the quad between rings i, i+1 and points j, j+1; o.smooth shares normals */
function sweep(B, rings, ctr, o) {
  const nR = rings.length, nP = rings[0].length, smooth = o.smooth !== false, open = o.open;
  const jn = open ? nP - 1 : nP;
  const inside = i => [(ctr[i][0] + ctr[i + 1][0]) / 2, (ctr[i][1] + ctr[i + 1][1]) / 2, (ctr[i][2] + ctr[i + 1][2]) / 2];
  let N = null;
  if (smooth) {
    N = rings.map(r => r.map(() => [0, 0, 0]));
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < jn; j++) {
      const j1 = (j + 1) % nP, a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j1], d = rings[i][j1];
      let n = cross(sub(c, a), sub(d, b)); const I = inside(i), g = [(a[0] + c[0]) / 2 - I[0], (a[1] + c[1]) / 2 - I[1], (a[2] + c[2]) / 2 - I[2]];
      if (dot(n, g) < 0) n = [-n[0], -n[1], -n[2]];
      for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j1], [i, j1]]) { const m = N[ii][jj]; m[0] += n[0]; m[1] += n[1]; m[2] += n[2]; }
    }
    N = N.map(r => r.map(norm));
  }
  for (let i = 0; i < nR - 1; i++) for (let j = 0; j < jn; j++) {
    const j1 = (j + 1) % nP, a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j1], d = rings[i][j1], col = o.col(i, j), I = inside(i);
    if (smooth) { B.tri(a, b, c, col, I, N[i][j], N[i + 1][j], N[i + 1][j1]); B.tri(a, c, d, col, I, N[i][j], N[i + 1][j1], N[i][j1]); }
    else { B.tri(a, b, c, col, I); B.tri(a, c, d, col, I); }
  }
  // caps: a fan across the first and last rings, facing out along the sweep
  for (const [i, k, col] of [[0, 1, o.cap0], [nR - 1, nR - 2, o.cap1]]) {
    if (!col) continue;
    const r = rings[i], c = ctr[i], away = ctr[k];
    const inner = [c[0] + (away[0] - c[0]) * 0.5, c[1] + (away[1] - c[1]) * 0.5, c[2] + (away[2] - c[2]) * 0.5];
    const cc = o.capAt ? o.capAt(i) : c;
    for (let j = 0; j < nP; j++) B.tri(cc, r[j], r[(j + 1) % nP], col, inner);
  }
}
/* a fuselage or body lofted through cross-sections: st = [{ x, w (half-width), h (half-height), z (centre), n (2 an
   ellipse, more a rounded box) }]; ang lists the points round each section in degrees (0 on top, 90 to starboard);
   col(x, a) the colour of the panel at station x and angle a */
function loft(B, st, ang, col, o) {
  o = o || {};
  st.ang = ang;                                 // for marks painted on it later (surf)
  st = st.slice().sort((a, b) => a.x - b.x);   // tail first: cap0 closes the back, cap1 the front
  const rings = [], ctr = [];
  for (const s of st) {
    const r = [], n = s.n || 2;
    for (const a of ang) {
      const t = a * RAD, sn = Math.sin(t), cs = Math.cos(t);
      const k = n === 2 ? 1 : 2 / n, y = Math.sign(sn) * Math.pow(Math.abs(sn), k) * s.w, z = Math.sign(cs) * Math.pow(Math.abs(cs), k) * (cs > 0 && s.ht != null ? s.ht : s.h);
      r.push(B.T([s.x, (s.y || 0) + y, s.z + z]));
    }
    rings.push(r); ctr.push(B.T([s.x, s.y || 0, s.z]));
  }
  sweep(B, rings, ctr, { smooth: o.smooth !== false, cap0: o.cap0, cap1: o.cap1, col: (i, j) => { const a0 = ang[j], a1 = ang[(j + 1) % ang.length]; const am = a1 < a0 ? (a0 + a1 + 360) / 2 % 360 : (a0 + a1) / 2; return col((st[i].x + st[i + 1].x) / 2, am, i); } });
}
/* angles round a section, symmetric: the half from the top (0) to the bottom (180) */
function around(half) { const out = half.slice(); for (let i = half.length - 2; i > 0; i--) out.push(360 - half[i]); return out; }
const ANG = { hi: around([0, 22, 44, 62, 74, 84, 94, 106, 122, 142, 162, 180]), lo: around([0, 50, 90, 130, 180]), mid: around([0, 30, 60, 90, 120, 150, 180]) };

/* an aerofoil, around from the leading edge over the top to the trailing edge and back underneath: [chord, thickness] */
const FOIL = { hi: [[0, 0], [0.03, 0.42], [0.12, 0.78], [0.32, 1], [0.62, 0.72], [1, 0.06], [1, -0.04], [0.62, -0.34], [0.3, -0.5], [0.1, -0.42], [0.03, -0.26]], lo: [[0, 0], [0.3, 1], [1, 0.05], [1, -0.05], [0.3, -0.55]], flat: [[0, 0], [0.2, 1], [0.8, 1], [1, 0], [0.8, -1], [0.2, -1]] };
/* a wing (or fin, or tailplane) through sections along its span: secs = [{ x (leading edge), y, z, c (chord), t (thickness
   ratio) }] from root to tip; o.mirror makes the other side too, o.foil the section shape */
function wing(B, secs, col, o) {
  o = o || {};
  const foil = o.foil || (B.q ? FOIL.hi : FOIL.lo);
  const side = sg => {
    const rings = [], ctr = [];
    secs.forEach((s, i) => {
      const a = secs[Math.max(0, i - 1)], b = secs[Math.min(secs.length - 1, i + 1)];
      const d = norm([0, (b.y - a.y) * sg, b.z - a.z]), tn = o.thick || [0, -d[2], d[1]];   // thickness across the span, in the y-z plane
      const up = tn[2] < 0 || (tn[2] === 0 && tn[1] > 0) ? [-tn[0], -tn[1], -tn[2]] : tn;
      const th = s.c * (s.t || 0.1) / 2, r = [];
      for (const [f, v] of foil) r.push(B.T([s.x - f * s.c, s.y * sg + up[1] * v * th, s.z + up[2] * v * th]));
      rings.push(r); ctr.push(B.T([s.x - 0.35 * s.c, s.y * sg, s.z]));
    });
    sweep(B, rings, ctr, { smooth: !!o.smooth, cap0: o.root ? (o.rootCol || col) : null, cap1: o.tipCol || col, col: typeof col === 'function' ? col : () => col });
  };
  for (const sg of o.sides || (o.mirror ? [1, -1] : [1])) side(sg);
}
/* a planform in a few numbers: root leading edge (x, y, z), half-span, root and tip chords, the leading edge's sweep
   (degrees) and the dihedral (degrees; 90 a vertical fin). kink: { f (fraction of span), c (chord there) } */
function plan(x, y, z, span, c0, c1, sweep, dih, t0, t1, kink) {
  const tS = Math.tan(sweep * RAD), cd = Math.cos(dih * RAD), sd = Math.sin(dih * RAD);
  const at = (f, c, t) => ({ x: x - f * span * tS, y: y + f * span * cd, z: z + f * span * sd, c, t });
  const out = [at(0, c0, t0)];
  if (kink) out.push(at(kink.f, kink.c, (t0 + t1) / 2));
  out.push(at(1, c1, t1));
  return out;
}
/* a body turned round an axis: prof = [[a (along the axis), r], ...]; o.at the centre, o.axis 'x' | 'y' | 'z', o.ry/rz
   squash it, o.col(i) the colour of each band, cap0/cap1 close the ends */
function lathe(B, prof, col, o) {
  o = o || {};
  const n = o.segs || (B.q ? 12 : 6), at = o.at || [0, 0, 0], ax = o.axis || 'x', ry = o.ry || 1, rz = o.rz || 1, rot = o.rot || 0;
  const P3 = (a, u, v) => ax === 'x' ? [at[0] + a, at[1] + u * ry, at[2] + v * rz] : ax === 'y' ? [at[0] + u * ry, at[1] + a, at[2] + v * rz] : [at[0] + u * ry, at[1] + v * rz, at[2] + a];
  const rings = [], ctr = [];
  for (const [a, r] of prof) {
    const ring = [];
    for (let j = 0; j < n; j++) { const t = (j + 0.5) / n * Math.PI * 2 + rot; ring.push(B.T(P3(a, Math.cos(t) * r, Math.sin(t) * r))); }
    rings.push(ring); ctr.push(B.T(P3(a, 0, 0)));
  }
  sweep(B, rings, ctr, { smooth: o.smooth !== false, cap0: o.cap0, cap1: o.cap1, col: o.col ? (i => o.col(i)) : () => col });
}
const cyl = (B, at, len, r, col, axis, o) => lathe(B, [[-len / 2, r], [len / 2, r]], col, Object.assign({ at, axis, cap0: col, cap1: col, smooth: true }, o || {}));
/* a box, centred at (x, y, z), sides sx sy sz; o.pitch (nose up), o.yaw, o.roll turn it about its centre; o.top
   [kx, ky] narrows the top face (a cab, a turret); o.col per face: [+x, -x, +y, -y, +z, -z] */
function box(B, x, y, z, sx, sy, sz, col, o) {
  o = o || {};
  const tp = o.top || [1, 1], hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0), cy = Math.cos(o.yaw || 0), sy2 = Math.sin(o.yaw || 0), cr = Math.cos(o.roll || 0), sr = Math.sin(o.roll || 0);
  const R = (px, py, pz) => {
    let a = px, b = py * cr - pz * sr, c = py * sr + pz * cr;          // roll about x
    let a2 = a * cp - c * sp, c2 = a * sp + c * cp; a = a2; c = c2;      // pitch about y, nose up
    const a3 = a * cy - b * sy2, b3 = a * sy2 + b * cy;                   // yaw about z
    return B.T([x + a3, y + b3, z + c]);
  };
  const v = [];
  for (const k of [-1, 1]) for (const j of [-1, 1]) for (const i of [-1, 1]) { const top = k > 0; v.push(R(i * hx * (top ? tp[0] : 1) + (top && o.shift ? o.shift : 0), j * hy * (top ? tp[1] : 1), k * hz)); }
  const c = B.T([x, y, z]), F = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
  F.forEach((f, i) => { const cl = o.col ? o.col[i] || col : col; B.tri(v[f[0]], v[f[1]], v[f[2]], cl, c); B.tri(v[f[0]], v[f[2]], v[f[3]], cl, c); });
}
/* a flat plate from a polygon in the x-y plane at height z (panels, pads), th thick */
function plate(B, pts, z, th, col) {
  const rings = [pts.map(p => B.T([p[0], p[1], z - th / 2])), pts.map(p => B.T([p[0], p[1], z + th / 2]))];
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  sweep(B, rings, [B.T([cx, cy, z - th / 2]), B.T([cx, cy, z + th / 2])], { smooth: false, cap0: col, cap1: col, col: () => col });
}

/* ---------- landing gear: a leg and wheels in its own group, folding about the top of the leg ---------- */
function gearLeg(B, name, x, y, top, r, wheels, o) {
  o = o || {};
  const fold = o.fold || (y === 0 ? [0, 1, 0] : [1, 0, 0]), up = o.up != null ? o.up : (y === 0 ? -1.5 : (y > 0 ? -1.5 : 1.5));
  B.group(name, { kind: 'gear', pivot: [x, y, top], axis: fold, up });
  const bogie = o.bogie || 1, w = o.w || r * 0.7, gap = o.gap || w * 1.2;
  cyl(B, [x, y, (top + r) / 2], top - r, Math.max(0.08, r * 0.18), P.metal, 'z', { segs: 6 });
  for (let a = 0; a < bogie; a++) {
    const ax = x + (a - (bogie - 1) / 2) * r * 2.3;
    for (let k = 0; k < wheels; k++) { const wy = y + (k - (wheels - 1) / 2) * gap; lathe(B, [[-w / 2, r * 0.55], [-w / 2, r], [w / 2, r], [w / 2, r * 0.55]], P.rubber, { at: [ax, wy, r], axis: 'y', segs: B.q ? 10 : 6, cap0: P.dgrey, cap1: P.dgrey, smooth: false }); }
  }
  if (bogie > 1) box(B, x, y, r, r * 2.3 * (bogie - 1) + r, 0.15, 0.15, P.metal);
  B.group('main');
}
/* a propeller of n blades of diameter dia in its own spinning group, with its spinner */
function prop(B, name, x, y, z, dia, n, col, o) {
  o = o || {};
  B.group(name, { kind: 'prop', pivot: [x, y, z], axis: o.axis || [1, 0, 0], rpm: o.rpm || 1 });
  const L = dia / 2, cw = Math.max(0.1, dia * 0.07);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + (o.rot || 0);
    B.with(p => { const yy = p[1] - y, zz = p[2] - z; return [p[0], y + yy * Math.cos(a) - zz * Math.sin(a), z + yy * Math.sin(a) + zz * Math.cos(a)]; }, () => box(B, x, y, z + L / 2, cw * 0.25, cw, L, col || P.black, { roll: 0.35 }));
  }
  B.group('main');
  lathe(B, [[0.35 * dia * 0.18, 0], [0.1 * dia * 0.18, 0.5 * dia * 0.12], [-0.3 * dia * 0.18, dia * 0.07]], o.spin || P.dgrey, { at: [x + dia * 0.03, y, z], cap1: o.spin || P.dgrey });
}
/* a rotor of n blades about z (or about y for a tail rotor), radius R */
function rotor(B, name, x, y, z, R, n, col, o) {
  o = o || {};
  const axis = o.axis || [0, 0, 1];
  B.group(name, { kind: 'rotor', pivot: [x, y, z], axis, rpm: o.rpm || 1, R });
  const cw = o.chord || R * 0.07;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    if (axis[2]) B.with(p => { const xx = p[0] - x, yy = p[1] - y; return [x + xx * Math.cos(a) - yy * Math.sin(a), y + xx * Math.sin(a) + yy * Math.cos(a), p[2]]; }, () => box(B, x + R / 2 + 0.2, y, z, R - 0.4, cw, cw * 0.12, col || P.dgrey, { roll: 0.08 }));
    else B.with(p => { const xx = p[0] - x, zz = p[2] - z; return [x + xx * Math.cos(a) - zz * Math.sin(a), p[1], z + xx * Math.sin(a) + zz * Math.cos(a)]; }, () => box(B, x + R / 2, y, z, R, cw * 0.12, cw, col || P.dgrey));
  }
  if (axis[2]) { const k = o.hub || 1; lathe(B, [[-0.3 * k, 0.35 * k], [0.3 * k, 0.3 * k], [0.5 * k, 0.1 * k]], P.dgrey, { at: [x, y, z], axis: 'z', cap0: P.dgrey, cap1: P.dgrey }); }
  B.group('main');
}

/* ---------- marks on a lofted skin: windows, doors, registration letters ----------
   A point on a loft's surface (the same sections loft() was given, sorted by x) at station x and angle a (degrees,
   0 on top, 90 to starboard, negative to port), lifted `off` metres off the skin */
function surf(st, x, a, off) {
  let i = 0; while (i < st.length - 2 && st[i + 1].x < x) i++;
  const A = st[i], C = st[i + 1], t = U.clamp((x - A.x) / ((C.x - A.x) || 1), 0, 1), lp = (p, q) => p + (q - p) * t;
  const n = lp(A.n || 2, C.n || 2), k = n <= 2 ? 1 : 2 / n, w = lp(A.w, C.w), yc = lp(A.y || 0, C.y || 0), zc = lp(A.z, C.z);
  const at = d => {
    const r = d * RAD, sn = Math.sin(r), cs = Math.cos(r), h = cs > 0 ? lp(A.ht != null ? A.ht : A.h, C.ht != null ? C.ht : C.h) : lp(A.h, C.h);
    return [Math.sign(sn) * Math.pow(Math.abs(sn), k) * w, Math.sign(cs) * Math.pow(Math.abs(cs), k) * h, h];
  };
  // on the loft's flat facets (st.ang, the angles its rings were made at), not the curve they stand for
  let [py, pz, h] = at(a);
  const G = st.ang;
  if (G) {
    const aa = ((a % 360) + 360) % 360; let j = G.length - 1; while (j > 0 && G[j] > aa) j--;
    const a0 = G[j], a1 = j + 1 < G.length ? G[j + 1] : G[0] + 360, f = (aa - a0) / ((a1 - a0) || 1), p0 = at(a0), p1 = at(a1);
    py = p0[0] + (p1[0] - p0[0]) * f; pz = p0[1] + (p1[1] - p0[1]) * f;
  }
  const nr = norm([0, py / (w * w + 1e-6), pz / (h * h + 1e-6)]);
  return [x, yc + py + nr[1] * off, zc + pz + nr[2] * off];
}
/* a patch of skin from station xa to xb and angle a0 to a1, in colour col, split nx × na so it follows the curve */
function decal(B, st, xa, xb, a0, a1, col, off, nx, na) {
  nx = nx || 1; na = na || 1; off = off || 0.025;
  const G = [];
  for (let i = 0; i <= nx; i++) { const r = []; for (let j = 0; j <= na; j++) r.push(surf(st, xa + (xb - xa) * i / nx, a0 + (a1 - a0) * j / na, off)); G.push(r); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < na; j++) {
    const xm = xa + (xb - xa) * (i + 0.5) / nx, t = surf(st, xm, 0, 0), b = surf(st, xm, 180, 0), c = [xm, (t[1] + b[1]) / 2, (t[2] + b[2]) / 2];   // the section's middle
    B.tri(G[i][j], G[i + 1][j], G[i + 1][j + 1], col, c); B.tri(G[i][j], G[i + 1][j + 1], G[i][j + 1], col, c);
  }
}
/* the angle round a section that is `m` metres of skin on a body of half-height h (for sizing marks) */
const arcDeg = (m, h) => m / Math.max(0.2, h) / RAD;
/* a door's outline: four thin strips round xc (width w metres) from angle e0 down to e1, both sides */
function doorMark(B, st, xc, w, e0, e1, h) {
  const t = arcDeg(0.05, h), hw = w / 2;
  for (const sg of [1, -1]) {
    const E = (a, b) => sg > 0 ? [a, b] : [-b, -a];
    decal(B, st, xc - hw, xc + hw, ...E(e0, e0 + t), 'DOOR', 0.03);
    decal(B, st, xc - hw, xc + hw, ...E(e1 - t, e1), 'DOOR', 0.03);
    decal(B, st, xc - hw, xc - hw + 0.05, ...E(e0, e1), 'DOOR', 0.03, 1, 2);
    decal(B, st, xc + hw - 0.05, xc + hw, ...E(e0, e1), 'DOOR', 0.03, 1, 2);
  }
}
/* registration letters, 3 × 5 pixels each, painted along the skin on both sides: from station x (the back of the
   text) forward, their tops at angle e, letters hL metres tall */
const FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', K: '101110100110101', L: '100100100100111', M: '101111111101101', N: '110101101101101', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '-': '000000111000000' };
const REG_L = 'ABCDEFGHKLMNPRSTUXYZ';
IC.regOf = (seed, pre) => { let s = (pre || 'K') + '-'; for (let i = 0; i < 4; i++) s += REG_L[Math.abs(Math.floor(U.hash(seed * 7 + i, 11 + i) * 1e4)) % REG_L.length]; return s; };
function regMark(B, st, x, e, hL, h, text) {
  const px = hL / 5, de = arcDeg(px, h);
  for (const sg of [1, -1]) {
    // read left to right: from the tail towards the nose on the right side, from the nose towards the tail on the left
    [...text].forEach((ch, ci) => {
      const g = FONT[ch]; if (!g) return;
      const col0 = ci * 4;
      for (let r = 0; r < 5; r++) {
        let c = 0;
        while (c < 3) {
          if (g[r * 3 + c] !== '1') { c++; continue; }
          let c2 = c; while (c2 < 3 && g[r * 3 + c2] === '1') c2++;
          const u0 = (col0 + c) * px, u1 = (col0 + c2) * px, a0 = e + r * de, a1 = e + (r + 1) * de;
          const L = text.length * 4 * px;
          const xa = sg > 0 ? x + u0 : x + L - u1, xb = sg > 0 ? x + u1 : x + L - u0;
          decal(B, st, xa, xb, sg > 0 ? a0 : -a1, sg > 0 ? a1 : -a0, 'REG', 0.035);
          c = c2;
        }
      }
    });
  }
}

/* ---------- airliners and other large aircraft from their real dimensions ----------
   s: L length, D diameter (H its height if not round), zc the fuselage's centre above the ground, nose and tail
   lengths, wing { x root leading edge, span, c0, c1, kink, sweep, dih, z }, tail { hs, hc0, hc1, hsweep, hdih, fh, fc0,
   fc1, fsweep, t (T-tail) }, eng [{ x, y, z, len, d, prop }], gear { nx, mx, track, nr, mr, mw (wheels), bogie },
   winglet, hump, glass (a glazed nose), rotodome */
function airliner(B, s) {
  const q = B.q, L = s.L, D = s.D, H = s.H || D, zc = s.zc, x1 = L / 2, x0 = -L / 2, nose = s.nose || D * 1.7, tail = s.tail || D * 3.2;
  const civil = !s.mil, BODY = s.body || 'BODY', BELLY = s.body ? s.body : 'BELLY';
  // the sections: nose, the parallel body, the tail cone sweeping up to the tail cap; a raised upper deck (hump)
  const st = [], add = (x, kw, kh, dz) => st.push({ x, w: D / 2 * kw, h: H / 2 * kh, z: zc + dz * H });
  const noseF = q ? [[0, 0, -0.13], [0.05, 0.2, -0.12], [0.13, 0.36, -0.1], [0.24, 0.5, -0.07], [0.36, 0.64, -0.05], [0.52, 0.8, -0.03], [0.72, 0.93, -0.01], [1, 1, 0]] : [[0, 0, -0.13], [0.2, 0.5, -0.08], [0.55, 0.85, -0.03], [1, 1, 0]];
  const tailF = q ? [[0, 1, 1, 0], [0.2, 0.96, 0.95, 0.03], [0.42, 0.84, 0.8, 0.1], [0.62, 0.66, 0.6, 0.18], [0.8, 0.44, 0.38, 0.26], [0.94, 0.22, 0.18, 0.32], [1, 0.08, 0.07, 0.34]] : [[0, 1, 1, 0], [0.5, 0.75, 0.7, 0.15], [1, 0.08, 0.07, 0.34]];
  for (const [f, k, dz] of noseF) add(x1 - nose * f, k, k, dz);
  for (const [f, k, kh, dz] of tailF) add(x0 + tail * (1 - f), k, kh, dz * (s.tailUp || 1));
  const hx0 = s.hump ? x1 - s.hump : 1e9, hup = D * 0.36;
  if (s.hump) for (const f of q ? [0, 0.35, 0.7, 1] : [0, 1]) add(hx0 + f * 7, 1, 1, 0);
  const rise = x => x <= hx0 ? 0 : hup * (x >= hx0 + 7 ? 1 : 0.5 - 0.5 * Math.cos((x - hx0) / 7 * Math.PI));
  for (const t of st) { t.ht = t.h + rise(t.x) * Math.min(1, t.w / (D / 2) * 1.2); }
  // panels: livery bands by angle, the cockpit glazing near the nose
  const glassX0 = x1 - nose * 0.62, glassX1 = x1 - nose * 0.3;
  const col = (x, a) => {
    const e = a > 180 ? 360 - a : a;   // 0 top, 180 bottom, both sides alike
    if (s.glass && x > x1 - nose * 0.55 && e > 60) return 'GLASS';
    // (close in the cockpit's panes are painted on below)
    if (!q && x > glassX0 && x < glassX1 && e > 20 && e < 66 && !s.hump) return 'GLASS';
    if (!q && s.hump && x > glassX0 && x < glassX1 && e > 8 && e < 50) return 'GLASS';
    if (e > 116) return BELLY;
    if (civil && e > 92) return 'STRIPE2';
    if (civil && e > 78) return 'STRIPE';
    return BODY;
  };
  loft(B, st, q ? ANG.hi : ANG.lo, col, { cap0: BODY });
  const sts = st.slice().sort((p, r) => p.x - r.x); sts.ang = st.ang;
  // the cockpit: two windscreen panes each side of the centre post and a side window behind them
  if (q && !s.glass) {
    const ck = s.cockpit || [0.36, 0.5, 0.62], dE = s.hump ? -6 : 0;
    for (const sg of [1, -1]) {
      const E = (a, b) => sg > 0 ? [a, b] : [-b, -a];
      decal(B, sts, x1 - nose * ck[1], x1 - nose * ck[0], ...E(3, 26 + dE), 'GLASS', 0.02, 2, 2);
      decal(B, sts, x1 - nose * ck[2], x1 - nose * ck[1] - 0.06, ...E(29 + dE, 52 + dE), 'GLASS', 0.02, 2, 2);
    }
  }
  // windows: a line of panes along both sides (lit at night), broken at the doors; a second deck where there is one
  const Wn = s.win || {}, hh = H / 2;
  const wFront = x1 - nose * (Wn.front || 1.12), wBack = x0 + tail * (Wn.back || 0.86), doors = civil && !s.noWin ? [wFront + 0.1].concat(Wn.rear === false ? [] : [wBack - 0.5]) : [];
  if (q && civil && !s.noWin) {
    B.group('win', { kind: 'win' });
    const gap = Wn.gap || 1.05, ww = Wn.w || 0.26, wh = Wn.h || 0.36;
    for (const row of Wn.rows || [{ e: 74 }]) {
      const dA = arcDeg(wh / 2, hh), xa = row.back != null ? row.back : wBack, xb = row.front != null ? row.front : wFront;
      for (let x = xb - 1.3; x > xa + 0.6; x -= gap) {
        if (row.skip && row.skip.some(([p, r]) => x > p && x < r)) continue;
        for (const sg of [1, -1]) decal(B, sts, x - ww, x, sg > 0 ? row.e - dA : -row.e - dA, sg > 0 ? row.e + dA : -row.e + dA, 'WIN', 0.03);
      }
    }
    B.group('main');
    // door outlines: the front and rear passenger doors
    const eTop = (Wn.rows ? Wn.rows[Wn.rows.length - 1].e : 74) - arcDeg(0.45, hh);
    for (const xd of doors) doorMark(B, sts, xd, Wn.door || 0.85, eTop, eTop + arcDeg(Wn.doorH || 1.85, hh), hh);
  }
  // the main wing, with its belly fairing, winglets and flap track fairings; flaps in their own group
  const w = s.wing, wz = zc + (w.z != null ? w.z : -0.3) * H;
  const secs = plan(w.x, 0, wz, w.span / 2, w.c0, w.c1, w.sweep, w.dih || 5, 0.15, 0.1, w.kink);
  wing(B, secs, s.wingCol || 'WING', { mirror: true });
  if (w.fairing !== false) loft(B, [{ x: w.x + w.c0 * 0.12, w: 0.05, h: 0.05, z: zc - H * 0.34 }, { x: w.x - w.c0 * 0.1, w: D * 0.42, h: H * 0.2, z: zc - H * 0.34 }, { x: w.x - w.c0 * 0.9, w: D * 0.42, h: H * 0.2, z: zc - H * 0.34 }, { x: w.x - w.c0 * 1.2, w: 0.05, h: 0.05, z: zc - H * 0.3 }], ANG.lo, () => BELLY, {});
  const tip = secs[secs.length - 1];
  if (s.winglet && q !== -1) for (const sg of [1, -1]) {
    const h = s.winglet, wl = [{ x: tip.x - tip.c * 0.1, y: tip.y * sg, z: tip.z, c: tip.c * 0.9, t: 0.08 }, { x: tip.x - tip.c * 0.1 - h * 0.7, y: (tip.y + h * 0.18) * sg, z: tip.z + h, c: tip.c * 0.35, t: 0.08 }];
    wing(B, wl, s.wingletCol || 'FIN', { thick: [0, sg, 0] });
  }
  if (q && s.canoes !== false) for (const sg of [1, -1]) for (const f of [0.28, 0.5, 0.72]) {
    const sa = secs[0], sb = secs[secs.length - 1], y = f * sb.y, xl = sa.x + (sb.x - sa.x) * f, c = sa.c + (sb.c - sa.c) * f, z = sa.z + (sb.z - sa.z) * f;
    lathe(B, [[c * 0.1, 0.02], [0, 0.18], [-c * 0.35, 0.2], [-c * 0.55, 0.02]], 'WING', { at: [xl - c * 0.75, y * sg, z - 0.15], segs: 5, rz: 1.4 });
  }
  if (q && civil) {
    // flaps: plates under the trailing edge that swing down about it (the hinge axis runs along the edge, inboard to
    // outboard on the right and outboard to inboard on the left, so one negative angle lowers both)
    const sa = secs[0], sb = secs[secs.length - 1], te = f => { const x = sa.x + (sb.x - sa.x) * f - (sa.c + (sb.c - sa.c) * f), y = sb.y * f, z = sa.z + (sb.z - sa.z) * f; return [x, y, z]; };
    const at = f => { const [x, y, z] = te(f); return { x: x + (sa.c + (sb.c - sa.c) * f) * 0.22, y, z: z - 0.08, c: (sa.c + (sb.c - sa.c) * f) * 0.24, t: 0.07 }; };
    const p0 = te(0.1), p1 = te(0.74), ax = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    for (const sg of [1, -1]) {
      B.group(sg > 0 ? 'flapR' : 'flapL', { kind: 'flap', pivot: [p0[0], sg * p0[1], p0[2]], axis: [ax[0] * sg, ax[1], ax[2] * sg], up: -0.55 });
      wing(B, [at(0.1), at(0.4)], 'WING', { sides: [sg] }); wing(B, [at(0.42), at(0.74)], 'WING', { sides: [sg] });
    }
    B.group('main');
  }
  // the tail: tailplane (or a T-tail on top of the fin) and fin, with a fillet
  const T = s.tail2, ftop = T.fz != null ? T.fz : zc + H * 0.42;
  const fsecs = plan(x0 + tail * 0.9 + T.fc0 * 0.15, 0, ftop - 0.3, T.fh, T.fc0, T.fc1, T.fsweep, 90, 0.12, 0.1);
  wing(B, fsecs, 'FIN', {});
  if (q) wing(B, [{ x: fsecs[0].x + T.fc0 * 0.35, y: 0, z: ftop - 0.3, c: T.fc0 * 0.4, t: 0.12 }, { x: fsecs[0].x - T.fc0 * 0.1, y: 0, z: ftop + T.fh * 0.14, c: T.fc0 * 0.4, t: 0.1 }], 'FIN', { thick: [0, 1, 0] });
  const hz = T.t ? fsecs[1].z - 0.2 : zc + (T.hz || 0.1) * H, hx = T.t ? fsecs[1].x + T.hc0 * 0.1 : x0 + tail * 0.72;
  const hsecs = plan(hx, 0, hz, T.hs / 2, T.hc0, T.hc1, T.hsweep, T.t ? 0 : (T.hdih == null ? 6 : T.hdih), 0.12, 0.1);
  wing(B, hsecs, s.hsCol || 'WING', { mirror: true });
  // fins at the tailplane's tips: a triple tail, or the end plates of an outsize freighter
  if (T.tipFin) { const ht = hsecs[hsecs.length - 1]; for (const sg of [1, -1]) wing(B, plan(ht.x + 0.2, sg * ht.y, ht.z - T.tipFin * 0.35, T.tipFin, ht.c * 1.15, ht.c * 0.7, T.fsweep * 0.6, 90, 0.1, 0.1), 'FIN', {}); }
  // engines on pylons, turbofans or turboprops
  for (const e of s.eng || []) for (const sg of e.y ? [1, -1] : [0]) {
    const ey = e.y * sg, ez = e.z, len = e.len, r = e.d / 2, ex = e.tail ? e.x : w.x - e.y * Math.tan(w.sweep * RAD) + e.dx;
    if (e.prop) {
      lathe(B, [[len * 0.5, r * 0.45], [len * 0.42, r * 0.9], [len * 0.2, r], [-len * 0.2, r * 0.9], [-len * 0.5, r * 0.3]], 'ENG', { at: [ex, ey, ez], rz: 1.25, cap1: 'ENG' });
      B.np = (B.np || 0) + 1; prop(B, 'prop' + B.np, ex + len * 0.55, ey, ez, e.prop, e.blades || 6, P.black, { spin: e.spin || 'ENG' });
      if (e.contra) prop(B, 'propc' + B.np, ex + len * 0.55 + 0.5, ey, ez, e.prop, 4, P.black, { rpm: -1, spin: 'ENG' });
    } else if (e.tail) {
      lathe(B, [[len * 0.5, r * 0.82], [len * 0.44, r], [-len * 0.3, r * 0.92], [-len * 0.5, r * 0.62]], 'ENG', { at: [ex, ey, ez], cap0: P.intake, cap1: P.nozzle });
      box(B, ex, ey * 0.6, ez, len * 0.45, Math.abs(ey) * 0.7, 0.25, 'WING');
    } else {
      // nacelle: the lip, the fan cowl, the core cowl tapering to the nozzle and the exhaust plug; the intake dark
      lathe(B, [[len * 0.5, r * 0.84], [len * 0.47, r * 0.98], [len * 0.36, r], [len * 0.02, r * 0.97], [-len * 0.18, r * 0.8], [-len * 0.36, r * 0.56], [-len * 0.46, r * 0.46]], 'ENG', { at: [ex, ey, ez], cap0: P.intake, cap1: P.nozzle, segs: q ? 14 : 6 });
      if (q) lathe(B, [[len * 0.46, 0], [len * 0.4, r * 0.25], [len * 0.36, r * 0.32]], P.dgrey, { at: [ex, ey, ez], segs: 8 });
      if (q) lathe(B, [[-len * 0.46, r * 0.4], [-len * 0.55, r * 0.26], [-len * 0.66, 0.02]], P.nozzle, { at: [ex, ey, ez], segs: 8 });
      // the pylon up to the wing
      const top = e.wz != null ? e.wz : wz + Math.abs(ey) * Math.tan((w.dih || 5) * RAD);
      wing(B, [{ x: ex + len * 0.3, y: ey, z: ez + r * 0.7, c: len * 0.85, t: 0.1 }, { x: ex + len * 0.05, y: ey, z: top, c: len * 0.95, t: 0.1 }], 'WING', { thick: [0, 1, 0] });
    }
  }
  if (s.rotodome) { box(B, -L * 0.12, 0, zc + H / 2 + 1.1, 3.2, 0.4, 2.2, P.grey, { top: [0.6, 1] }); lathe(B, [[-0.9, 0.2], [-0.8, s.rotodome * 0.46], [0, s.rotodome / 2], [0.8, s.rotodome * 0.46], [0.9, 0.2]], P.lgrey, { at: [-L * 0.12, 0, zc + H / 2 + 3.2], axis: 'z', segs: q ? 20 : 8, cap0: P.lgrey, cap1: P.lgrey }); }
  if (s.probe) cyl(B, [x1 + s.probe / 2 - 0.5, 0, zc + H * 0.35], s.probe, 0.1, P.metal, 'x', { segs: 5 });
  // landing gear (folds away in flight)
  const G = s.gear;
  if (G) {
    const bellyZ = zc - H / 2;
    gearLeg(B, 'gearN', G.nx, 0, bellyZ + 0.2, G.nr, 2, { gap: G.nr * 1.1 });
    for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', G.mx, sg * G.track / 2, (G.mtop || wz) + 0.1, G.mr, G.mw || 2, G.fuse ? { up: -1.5, fold: [0, 1, 0] } : { bogie: G.bogie || 1 });
    if (G.body) for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR2' : 'gearL2', G.mx + G.body, sg * G.track * 0.28, bellyZ + 0.3, G.mr, 2, { bogie: 2, up: -1.5, fold: [0, 1, 0] });
  }
  // lights: red to port, green to starboard at the wingtips, white on the tail; beacons top and bottom; strobes
  B.light(tip.x - tip.c * 0.1, tip.y, tip.z, 'green'); B.light(tip.x - tip.c * 0.1, -tip.y, tip.z, 'red');
  B.light(x0 + 0.2, 0, zc + H * 0.3, 'white');
  B.light(tip.x - tip.c * 0.5, tip.y, tip.z, 'strobe'); B.light(tip.x - tip.c * 0.5, -tip.y, tip.z, 'strobe');
  B.light(w.x - w.c0 * 0.3, 0, zc + H / 2 + 0.1, 'beacon'); B.light(w.x - w.c0 * 0.6, 0, zc - H / 2 - 0.1, 'beacon');
  B.light(w.x - 0.5, D / 2 + 0.5, wz, 'land'); B.light(w.x - 0.5, -D / 2 - 0.5, wz, 'land');
}

/* a jet fighter: blended body, bubble canopy, intakes, wings, stabilators, one or two fins, nozzle and afterburner */
function fighter(B, s) {
  const q = B.q, L = s.L, x1 = L / 2, x0 = -L / 2, zc = s.zc || 2.3, W = s.W, H = s.H, body = s.body, top = s.top || body, und = s.und || body;
  const ang = q ? ANG.hi : ANG.lo;
  const st = [];
  const prof = s.prof || [[0, 0, 0, -0.1], [0.04, 0.12, 0.14, -0.08], [0.12, 0.26, 0.3, -0.04], [0.22, 0.4, 0.46, 0], [0.34, 0.62, 0.6, 0.04], [0.46, 0.92, 0.7, 0.05], [0.6, 1, 0.72, 0.04], [0.78, 1, 0.66, 0.02], [0.9, 0.86, 0.56, 0.02], [1, 0.5, 0.44, 0.02]];
  for (const [f, kw, kh, dz] of prof) st.push({ x: x1 - f * L, w: Math.max(0.02, W / 2 * kw), h: Math.max(0.02, H / 2 * kh), z: zc + dz * H, n: s.boxy && f > 0.3 ? 3 : 2 });
  st.sort((a, b) => a.x - b.x);
  loft(B, st, ang, (x, a) => { const e = a > 180 ? 360 - a : a; if (x > x1 - L * 0.08 && s.radome) return s.radome; return e > 100 ? und : e < 60 ? top : body; }, { cap0: P.nozzle });
  // the canopy: a glass bubble over the cockpit, the frame behind it
  const cx = x1 - L * s.cockpit, cl = L * (s.canL || 0.2);
  loft(B, [{ x: cx + cl * 0.55, w: 0.02, h: 0.02, z: zc + H * 0.3 }, { x: cx + cl * 0.3, w: W * 0.13 * (s.canW || 1), h: H * 0.2, z: zc + H * 0.33 }, { x: cx, w: W * 0.17 * (s.canW || 1), h: H * 0.3, z: zc + H * 0.33 }, { x: cx - cl * 0.4, w: W * 0.14 * (s.canW || 1), h: H * 0.2, z: zc + H * 0.34 }, { x: cx - cl * 0.55, w: 0.03, h: 0.03, z: zc + H * 0.35 }], ang.filter(a => a < 110 || a > 250).length > 4 ? ang : ang, (x, a) => { const e = a > 180 ? 360 - a : a; return e > 95 ? top : 'GLASS'; }, {});
  // intakes: a chin intake, or one each side
  if (s.chin) loft(B, [{ x: x1 - L * 0.36, w: W * 0.26, h: H * 0.2, z: zc - H * 0.46 }, { x: x1 - L * 0.46, w: W * 0.28, h: H * 0.24, z: zc - H * 0.42 }, { x: x1 - L * 0.62, w: W * 0.24, h: H * 0.2, z: zc - H * 0.3 }], ang, () => und, { cap1: P.intake });
  if (s.side) for (const sg of [1, -1]) loft(B, [{ x: x1 - L * s.side, y: sg * W * 0.5, w: W * 0.15, h: H * 0.3, z: zc - H * 0.12, n: 3 }, { x: x1 - L * (s.side + 0.1), y: sg * W * 0.52, w: W * 0.17, h: H * 0.3, z: zc - H * 0.12, n: 3 }, { x: x1 - L * (s.side + 0.3), y: sg * W * 0.42, w: W * 0.14, h: H * 0.26, z: zc - H * 0.1, n: 3 }], ang, () => body, { cap1: P.intake });
  // twin engines in their own nacelles under the body (a Flanker's)
  if (s.nacelles) for (const sg of [1, -1]) loft(B, [{ x: x1 - L * 0.36, y: sg * W * 0.36, w: W * 0.16, h: H * 0.26, z: zc - H * 0.36, n: 3 }, { x: x1 - L * 0.44, y: sg * W * 0.36, w: W * 0.18, h: H * 0.3, z: zc - H * 0.34, n: 3 }, { x: x0 + L * 0.15, y: sg * W * 0.3, w: W * 0.16, h: H * 0.28, z: zc - H * 0.2 }, { x: x0 + L * 0.03, y: sg * W * 0.28, w: W * 0.14, h: H * 0.22, z: zc - H * 0.18 }], ang, () => und, { cap1: P.intake, cap0: P.nozzle });
  // wings, leading-edge extensions, stabilators
  const w = s.wing, secs = plan(w.x, w.y0 || 0, zc + (w.z || 0) * H, w.span / 2 - (w.y0 || 0), w.c0, w.c1, w.sweep, w.dih || 0, 0.06, 0.04);
  wing(B, secs, s.wingCol || body, { mirror: true });
  if (s.lerx) wing(B, [{ x: w.x + s.lerx, y: 0, z: zc + (w.z || 0) * H, c: s.lerx + w.c0 * 0.3, t: 0.04 }, { x: w.x, y: W * 0.62, z: zc + (w.z || 0) * H, c: w.c0 * 0.3, t: 0.04 }], s.wingCol || body, { mirror: true });
  const h = s.stab;
  wing(B, plan(h.x, h.y0 || 0, zc + (h.z || 0) * H, h.span / 2 - (h.y0 || 0), h.c0, h.c1, h.sweep, h.dih || 0, 0.05, 0.04), s.wingCol || body, { mirror: true });
  // fins: one on the spine, or two canted out on the engine booms
  const f = s.fin;
  for (const sg of f.twin ? [1, -1] : [0]) wing(B, plan(f.x, sg * f.y, zc + (f.z || 0.3) * H, f.h, f.c0, f.c1, f.sweep, 90 - (f.cant || 0) * (sg || 1), 0.06, 0.05), s.finCol || top, {});
  if (s.ventral) for (const sg of [1, -1]) wing(B, plan(x0 + L * 0.2, sg * W * 0.3, zc - H * 0.3, 0.8, 1.6, 0.9, 40, -60, 0.05, 0.05), body, {});
  // nozzles and the afterburner's glow (its own group, lit when the pilot pushes the throttles through)
  for (const sg of s.twinEng ? [1, -1] : [0]) {
    const ny = sg * W * (s.nozY || 0.2), nz = zc + (s.nozZ || 0) * H, nr = s.nozR || H * 0.34;
    lathe(B, [[0.5, nr], [-0.2, nr * 0.95], [-0.6, nr * 0.82]], P.nozzle, { at: [x0 + 0.4, ny, nz], cap1: P.black });
    B.group('ab' + (sg + 1), { kind: 'ab' });
    lathe(B, [[0, nr * 0.75], [-nr * 2.2, nr * 0.5], [-nr * 5.5, 0.02]], '#ffb070', { at: [x0 - 0.2, ny, nz], segs: 8, smooth: true });
    B.group('main');
  }
  if (s.stinger) lathe(B, [[0, H * 0.14], [-L * 0.08, H * 0.1], [-L * 0.1, 0.05]], und, { at: [x0 + 0.3, 0, zc], cap1: und });
  // stores: wingtip rails with missiles, weapons under the wings
  const tip = secs[secs.length - 1];
  if (s.tipAam) for (const sg of [1, -1]) missileBody(B, [tip.x - tip.c * 0.3 + 0.4, sg * (tip.y + 0.12), tip.z], 3.0, 0.13, P.missile, { fins: 0.3 });
  for (const [f, len, d, c] of s.stores || []) for (const sg of [1, -1]) { const y = f * (w.span / 2), t = f, xl = secs[0].x + (tip.x - secs[0].x) * t; missileBody(B, [xl - 1.2, sg * y, zc - H * 0.25 - d], len, d, c || P.missile, { fins: d * 1.8 }); box(B, xl - 1.5, sg * y, zc - H * 0.25 - d * 0.4, len * 0.4, 0.12, d * 0.8, s.wingCol || body); }
  // gear
  if (s.gear) {
    const G = s.gear;
    gearLeg(B, 'gearN', G.nx, 0, zc - H * 0.4, G.nr, 1, {});
    for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', G.mx, sg * G.track / 2, zc - H * 0.3, G.mr, 1, {});
  }
  B.light(tip.x - tip.c * 0.3, tip.y, tip.z, 'green'); B.light(tip.x - tip.c * 0.3, -tip.y, tip.z, 'red'); B.light(x0 + L * 0.2, 0, zc + H * 0.5 + f.h * 0.9, 'white');
}
/* a round body with an ogive nose, along x, centred at `at`; o.fins span (radial) of the tail fins, o.wings the
   mid-body wing span, o.nose its colour */
function missileBody(B, at, len, d, col, o) {
  o = o || {};
  const r = d / 2, nl = o.noseL || Math.min(len * 0.22, d * 3), q = B.q;
  const prof = [[len / 2, 0]];
  const nk = q ? [0.1, 0.3, 0.55, 0.8] : [0.4];
  for (const k of nk) prof.push([len / 2 - nl * k, r * Math.sin(Math.acos(1 - k)) ]);
  prof.push([len / 2 - nl, r], [-len / 2 + (o.boat || 0.05) * len, r], [-len / 2, r * (o.tailR || 0.85)]);
  lathe(B, prof, col, { at, segs: q ? 10 : 5, cap1: o.tailCol || P.nozzle, col: i => i < nk.length && o.nose ? o.nose : col });
  if (o.stripe) cyl(B, [at[0] + len * 0.1, at[1], at[2]], len * 0.05, r * 1.03, o.stripe, 'x', { segs: q ? 10 : 5 });
  const fin = (x, span, c0, c1, sw, rot, fc) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      B.with(p => { const yy = p[1] - at[1], zz = p[2] - at[2]; return [p[0], at[1] + yy * ca - zz * sa, at[2] + yy * sa + zz * ca]; },
        () => wing(B, plan(at[0] + x, at[1] + r * 0.8, at[2], span, c0, c1, sw, 0, 0.06, 0.05), fc || col, { foil: FOIL.flat }));
    }
  };
  if (o.fins) fin(-len / 2 + (o.finC || len * 0.1) + 0.02, o.fins, o.finC || len * 0.1, (o.finC || len * 0.1) * 0.45, o.finSw || 45, o.finRot || 0, o.finCol);
  if (o.mid) fin(o.midX != null ? o.midX : len * 0.05, o.mid, o.midC || len * 0.18, (o.midC || len * 0.18) * 0.3, o.midSw || 50, o.finRot || 0, o.finCol);
  if (o.wings) wing(B, plan(at[0] + (o.wingX || 0.4), 0, at[2] + (o.wingZ || 0), o.wings / 2, o.wingC || len * 0.13, (o.wingC || len * 0.13) * 0.7, o.wingSw || 8, 0, 0.1, 0.08), o.wingCol || col, { mirror: true });
  if (o.intake) loft(B, [{ x: at[0] - len * 0.05, w: r * 0.4, h: r * 0.3, z: at[2] - r * 0.9 }, { x: at[0] - len * 0.25, w: r * 0.45, h: r * 0.35, z: at[2] - r * 0.85 }], ANG.lo, () => P.dgrey, { cap1: P.intake });
}

/* ---------- drones and helicopters ---------- */
function slimBody(B, L, D, zc, col, o) {
  o = o || {};
  const x1 = L / 2, x0 = -L / 2, nose = o.nose || D * 1.4, tail = o.tail || L * 0.35, bulge = o.bulge || 0;
  const st = [
    { x: x1, w: 0.02, h: 0.02, z: zc + (o.noseZ || 0) },
    { x: x1 - nose * 0.25, w: D * 0.3, h: D * 0.34 * (1 + bulge * 0.5), z: zc + (o.noseZ || 0) * 0.6 + bulge * D * 0.1 },
    { x: x1 - nose * 0.6, w: D * 0.45, h: D * 0.48 * (1 + bulge), z: zc + bulge * D * 0.25 },
    { x: x1 - nose, w: D / 2, h: D / 2 * (1 + bulge * 0.8), z: zc + bulge * D * 0.2 },
    { x: x0 + tail, w: D / 2, h: D / 2, z: zc },
    { x: x0 + tail * 0.4, w: D * 0.3, h: D * 0.3, z: zc + D * 0.05 },
    { x: x0, w: D * 0.14, h: D * 0.14, z: zc + D * 0.08 }
  ];
  st.sort((a, b) => a.x - b.x);
  loft(B, st, B.q ? ANG.mid : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return o.under && e > 110 ? o.under : col; }, { cap0: P.dgrey });
}
function heli(B, s) {
  const q = B.q, L = s.L, zc = s.zc || 1.9, W = s.W, H = s.H, body = s.body, x1 = s.nose, ang = q ? ANG.hi : ANG.lo;
  // cabin: a rounded box with the nose glazed; the tail boom tapering back to the fin
  const st = s.cabin.map(([x, kw, kh, dz, n]) => ({ x, w: W / 2 * kw, h: H / 2 * kh, z: zc + dz, n: n || 3.2 }));
  const glass = (x, a) => { const e = a > 180 ? 360 - a : a; if (s.glassF(x, e)) return 'GLASS'; return e > 120 ? (s.under || body) : body; };
  loft(B, st, ang, glass, { cap0: body });
  loft(B, s.boom.map(([x, r, z]) => ({ x, w: r, h: r * 1.1, z })), B.q ? ANG.mid : ANG.lo, () => body, { cap0: body });
  // fin, stabiliser, engines, the rotors
  // the fin and the tailplane at the end of the boom (stab.x: its leading edge ahead of the boom's end)
  const bt = s.boom[s.boom.length - 1];
  const fn = s.fin || [1.9, 2.2, 1.1];
  wing(B, plan(bt[0] + fn[0], 0, bt[2] + 0.1, s.finH, fn[1], fn[2], 40, 90, 0.14, 0.12), s.finCol || body, {});
  if (s.stab) wing(B, plan(bt[0] + s.stab.x, 0, bt[2] + (s.stab.z || 0), s.stab.span / 2, s.stab.c || 1.1, (s.stab.c || 1.1) * 0.72, 5, 0, 0.12, 0.1), body, { mirror: true });
  for (const e of s.eng || []) loft(B, [{ x: e[0] + 1.6, y: e[1], w: 0.25, h: 0.25, z: e[2] }, { x: e[0] + 1.2, y: e[1], w: 0.5, h: 0.45, z: e[2] }, { x: e[0] - 1.2, y: e[1], w: 0.55, h: 0.45, z: e[2] }, { x: e[0] - 1.8, y: e[1], w: 0.35, h: 0.3, z: e[2] }], ANG.mid, () => body, { cap1: P.intake, cap0: P.nozzle });
  const mz = s.mast;
  cyl(B, [s.rx, 0, mz - 0.3], 0.8, s.mastR || 0.22, P.dgrey, 'z', { segs: 6 });
  rotor(B, 'rotor', s.rx, 0, mz, s.R, s.blades, P.dgrey, { rpm: 1, chord: s.chord || 0.55, hub: s.hub });
  const tr = s.tr;
  rotor(B, 'trotor', tr[0], tr[1], tr[2], s.TR, s.tblades || 4, P.dgrey, { axis: [0, 1, 0], rpm: 4.5, chord: 0.25 });
  // wheels or skids, weapons on stub wings, a chin gun
  if (s.skids) {
    const K = typeof s.skids === 'object' ? s.skids : { x: 0.3, len: L * 0.32, y: W * 0.55, legs: [1.4, -1], top: 0.9 };
    for (const sg of [1, -1]) { cyl(B, [K.x, sg * K.y, 0.08], K.len, 0.07, P.dgrey, 'x', { segs: 5 }); for (const x of K.legs) box(B, x, sg * K.y * 0.86, K.top / 2 + 0.06, 0.1, 0.1, K.top, P.dgrey, { roll: sg * 0.3 }); }
  }
  if (s.wheels) for (const [x, y, r] of s.wheels) {
    lathe(B, [[-0.14, r * 0.5], [-0.14, r], [0.14, r], [0.14, r * 0.5]], P.rubber, { at: [x, y, r], axis: 'y', segs: q ? 10 : 6, cap0: P.dgrey, cap1: P.dgrey, smooth: false });
    if (y) box(B, x, y * 0.8, r + 0.3, 0.15, Math.abs(y) * 0.5, 0.12, P.dgrey);
    else { const top = s.boom.reduce((a, b2) => Math.abs(b2[0] - x) < Math.abs(a[0] - x) ? b2 : a)[2] - 0.2; box(B, x, 0, (r + top) / 2, 0.14, 0.14, top - r, P.dgrey); }   // a tail wheel on a strut
  }
  if (s.stubs) {
    const S2 = s.stubs;
    wing(B, plan(S2.x, W * 0.4, S2.z, S2.span, 1.4, 1.1, 8, -8, 0.14, 0.12), body, { mirror: true });
    for (const sg of [1, -1]) for (const f of [0.55, 0.95]) {
      const y = sg * (W * 0.4 + S2.span * f);
      if (f < 0.7) { lathe(B, [[1.1, 0.12], [0.9, 0.3], [-0.9, 0.3], [-1.1, 0.2]], P.dgrey, { at: [S2.x - 0.6, y, S2.z - 0.5], segs: 8, cap0: P.black, cap1: P.black }); }
      else { for (const dy of [-0.14, 0.14]) missileBody(B, [S2.x - 0.5, y + dy, S2.z - 0.5], 1.6, 0.13, P.olive, { fins: 0.12 }); }
    }
  }
  if (s.gun) { lathe(B, [[0.3, 0.3], [0, 0.4], [-0.3, 0.3]], P.dgrey, { at: [x1 - 1.2, 0, zc - H * 0.45], axis: 'z', cap0: P.dgrey, cap1: P.dgrey }); cyl(B, [x1 - 0.2, 0, zc - H * 0.5], 1.8, 0.06, P.black, 'x', { segs: 5 }); }
  B.light(0, W / 2 + 0.3, zc + 0.2, 'green'); B.light(0, -W / 2 - 0.3, zc + 0.2, 'red'); B.light(bt[0] + 0.1, 0, bt[2] + 1, 'white'); B.light(s.rx - 1, 0, mz - 0.9, 'beacon');
}

/* ---------- light aircraft ----------
   s: L, W, H (the fuselage's width and height), zc its centre above the ground; prof [[f (0 nose .. 1 tail), kw, kh,
   dz]]; ws [f0, f1] the windscreen, side [[f0, f1, e0, e1]] side windows, bubble { f, l, w, h } a canopy instead;
   wing { f (root leading edge), z, span, c0, c1, sweep, dih, t, strut, tip }, tail { f, fz, fh, fc0, fc1, fsweep, hs,
   hc0, hc1, hz, t (T-tail) }, prop { dia, n } on the nose, twin { f, y, z, len, d, dia, n } on the wings, gear
   { type tri | tail | retract | mono, nf, mf, track, nr, mr, spats }, floats, reg (where the letters go) */
const GA_PROF = [[0, 0.24, 0.24, -0.02], [0.03, 0.56, 0.56, -0.02], [0.1, 0.82, 0.78, -0.02], [0.2, 0.96, 0.92, 0], [0.3, 1, 1, 0.03], [0.45, 0.94, 0.9, 0.05], [0.6, 0.64, 0.58, 0.12], [0.78, 0.38, 0.34, 0.2], [0.92, 0.2, 0.2, 0.25], [1, 0.08, 0.12, 0.27]];
function wheel(B, x, y, r, w, spat) {
  lathe(B, [[-w / 2, r * 0.5], [-w / 2, r * 0.92], [-w * 0.3, r], [w * 0.3, r], [w / 2, r * 0.92], [w / 2, r * 0.5]], P.rubber, { at: [x, y, r], axis: 'y', segs: B.q ? 10 : 6, cap0: P.dgrey, cap1: P.dgrey, smooth: false });
  if (spat) lathe(B, [[r * 1.25, 0.02], [r * 0.9, r * 0.62], [0, r * 0.9], [-r * 1.1, r * 0.6], [-r * 1.6, 0.02]], spat, { at: [x, y, r * 1.02], ry: w * 1.1 / r, rz: 1, segs: B.q ? 10 : 6 });
}
/* a thin strut from p to q (a wing strut, a gear leg), chord c */
function strut(B, p, q, c, col) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  box(B, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, c, L, c * 0.35, col, { roll: Math.atan2(dz, dy), yaw: Math.atan2(dx, Math.hypot(dy, dz)) * -Math.sign(dy || 1) });
}
function gaPlane(B, s) {
  const q = B.q, L = s.L, x1 = L / 2, W = s.W, H = s.H, zc = s.zc, X = f => x1 - f * L;
  const prof = s.prof || GA_PROF, pr = q ? prof : prof.filter((p, i) => i % 2 === 0 || i === prof.length - 1);
  const st = pr.map(([f, kw, kh, dz]) => ({ x: X(f), w: Math.max(0.02, W / 2 * kw), h: Math.max(0.02, H / 2 * kh), z: zc + dz * H, n: s.n || 2.6 })).sort((a, b) => a.x - b.x);
  const nose = st[st.length - 1];
  loft(B, st, q ? ANG.hi : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return e > 150 ? 'BELLY' : e > 112 ? 'STRIPE2' : e > 96 ? 'STRIPE' : x > X(0.08) && e < 150 ? 'ENG' : 'BODY'; }, { cap0: 'BODY' });
  // glazing: windscreen and side windows painted on the skin, or a bubble canopy
  if (s.ws) decal(B, st, X(s.ws[1]), X(s.ws[0]), -(s.wsE || 50), s.wsE || 50, 'GLASS', 0.03, q ? 3 : 1, q ? 6 : 2);
  for (const [f0, f1, e0, e1] of s.side || []) for (const sg of [1, -1]) decal(B, st, X(f1), X(f0), sg > 0 ? e0 : -e1, sg > 0 ? e1 : -e0, 'GLASS', 0.03, q ? 2 : 1, q ? 2 : 1);
  if (s.bubble) {
    const c = s.bubble, cx = X(c.f), cl = c.l, z0 = surf(st, cx, 0, 0)[2] - c.h * 0.35;
    loft(B, [{ x: cx + cl * 0.5, w: 0.02, h: 0.02, z: z0 }, { x: cx + cl * 0.3, w: c.w * 0.8, h: c.h * 0.8, z: z0 }, { x: cx, w: c.w, h: c.h, z: z0 }, { x: cx - cl * 0.3, w: c.w * 0.85, h: c.h * 0.85, z: z0 }, { x: cx - cl * 0.5, w: 0.04, h: 0.04, z: z0 }], q ? ANG.hi : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return e > 95 ? 'BODY' : 'GLASS'; }, {});
  }
  // the wing, struts to it from the lower fuselage, wingtips in the stripe colour
  const w = s.wing, secs = plan(X(w.f), w.y0 || W * 0.3, w.z, w.span / 2 - (w.y0 || W * 0.3), w.c0, w.c1, w.sweep || 0, w.dih || 0, w.t || 0.15, (w.t || 0.15) * 0.8, w.kink);
  wing(B, secs, w.col || 'BODY', { mirror: true, tipCol: 'STRIPE', smooth: q && w.span > 12 });
  if (w.strut) for (const sg of [1, -1]) { const sx = X(w.f) - w.c0 * 0.35, wy = w.span * 0.28; strut(B, [sx, sg * W * 0.45, zc - H * 0.28], [sx, sg * wy, w.z + wy * Math.tan((w.dih || 0) * RAD) - 0.05], 0.12, P.lgrey); }
  const tip = secs[secs.length - 1];
  if (w.tank) for (const sg of [1, -1]) lathe(B, [[w.tank * 0.5, 0.02], [w.tank * 0.3, 0.2], [-w.tank * 0.3, 0.2], [-w.tank * 0.5, 0.04]], 'STRIPE', { at: [tip.x - tip.c * 0.3, sg * tip.y, tip.z], segs: q ? 8 : 5 });
  // the tail: fin and rudder, the tailplane under it or on top (a T-tail)
  const T = s.tail, fx = X(T.f), fz = T.fz;
  const fsecs = plan(fx, 0, fz, T.fh, T.fc0, T.fc1, T.fsweep, 90, 0.1, 0.1);
  wing(B, fsecs, 'FIN', {});
  if (q && T.dorsal) wing(B, [{ x: fx + T.dorsal, y: 0, z: fz - 0.05, c: T.dorsal * 0.9, t: 0.08 }, { x: fx - 0.05, y: 0, z: fz + T.fh * 0.3, c: T.fc0 * 0.3, t: 0.08 }], 'FIN', { thick: [0, 1, 0] });
  const ht = T.t ? fsecs[1] : null;
  wing(B, plan(ht ? ht.x + 0.1 : X(T.hf || T.f + 0.02), 0, ht ? ht.z - 0.05 : T.hz, T.hs / 2, T.hc0, T.hc1, T.hsweep || 4, 0, 0.1, 0.08), 'BODY', { mirror: true, tipCol: 'FIN' });
  // engines: a propeller on the nose, or two nacelles on the wings; a turbine's exhaust stacks
  if (s.prop) prop(B, 'prop', nose.x + 0.08, 0, nose.z, s.prop.dia, s.prop.n || 2, P.black, { spin: s.prop.spin || 'FIN' });
  if (s.turbine) for (const sg of [1, -1]) lathe(B, [[0.15, 0.13], [-0.25, 0.16]], P.nozzle, { at: [X(s.turbine), sg * W * 0.46, zc + H * 0.05], axis: 'y', ry: 1, cap1: P.black, segs: 6 });
  if (s.twin) {
    const e = s.twin;
    for (const sg of [1, -1]) {
      lathe(B, [[e.len * 0.5, e.d * 0.18], [e.len * 0.4, e.d * 0.46], [e.len * 0.1, e.d * 0.5], [-e.len * 0.3, e.d * 0.42], [-e.len * 0.5, e.d * 0.12]], 'ENG', { at: [X(e.f), sg * e.y, e.z], rz: 1.1, cap0: 'ENG', segs: q ? 10 : 6 });
      B.np = (B.np || 0) + 1; prop(B, 'prop' + B.np, X(e.f) + e.len * 0.52, sg * e.y, e.z, e.dia, e.n || 3, P.black, { spin: 'ENG', rpm: sg });
    }
  }
  // gear: fixed (on legs, in wheel fairings or not), retracting (it folds away in flight), or one wheel under a glider
  const G = s.gear, bz = zc - H / 2;
  if (G.type === 'retract') {
    gearLeg(B, 'gearN', X(G.nf), 0, bz + 0.15, G.nr, 1, {});
    for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', X(G.mf), sg * G.track / 2, (G.mtop || w.z) - 0.05, G.mr, 1, {});
  } else if (G.type === 'mono') {
    wheel(B, X(G.mf), 0, G.mr, 0.14, null);
    const tz = surf(st, X(0.95), 180, 0)[2]; box(B, X(0.95), 0, tz - 0.08, 0.35, 0.06, 0.16, P.dgrey);
  } else {
    for (const sg of [1, -1]) { const x = X(G.mf); strut(B, [x, sg * W * 0.35, bz + 0.1], [x, sg * G.track / 2, G.mr], 0.14, G.legCol || P.lgrey); wheel(B, x, sg * G.track / 2, G.mr, 0.16, G.spats ? 'BODY' : null); }
    if (G.type === 'tail') { const x = X(0.94); wheel(B, x, 0, G.nr, 0.08, null); strut(B, [x + 0.3, 0, st[1].z - st[1].h * 0.8], [x, 0, G.nr], 0.06, P.dgrey); }
    else { const x = X(G.nf); cyl(B, [x, 0, (bz + G.nr) / 2 + 0.05], bz - G.nr + 0.1, 0.05, P.metal, 'z', { segs: 5 }); wheel(B, x, 0, G.nr, 0.12, G.spats ? 'BODY' : null); }
  }
  if (s.floats) for (const sg of [1, -1]) {
    const F = s.floats;
    lathe(B, [[F.len * 0.5, 0.05], [F.len * 0.38, F.d * 0.42], [F.len * 0.1, F.d * 0.5], [-F.len * 0.35, F.d * 0.42], [-F.len * 0.5, 0.08]], 'BODY', { at: [X(F.f), sg * F.y, F.d * 0.55], rz: 0.85, segs: q ? 8 : 5 });
    for (const dx of [0.8, -0.9]) strut(B, [X(F.f) + dx, sg * F.y, F.d], [X(F.f) + dx, sg * W * 0.4, bz + 0.1], 0.1, P.lgrey);
  }
  // the registration along the rear fuselage
  if (q && s.reg !== false) { const r = s.reg || [0.5, 84, 0.36], xa = X(r[0] + 0.24); regMark(B, st, xa, r[1], r[2], surf(st, xa, 90, 0)[1], IC.regOf(s.seed || L * 7 + W, s.regPre)); }
  // lights: red to port, green to starboard at the tips, white on the tail, a red beacon on top of the fin, strobes,
  // and a landing light in the wing's leading edge
  B.light(tip.x - tip.c * 0.2, tip.y, tip.z, 'green'); B.light(tip.x - tip.c * 0.2, -tip.y, tip.z, 'red');
  B.light(tip.x - tip.c * 0.6, tip.y, tip.z, 'strobe'); B.light(tip.x - tip.c * 0.6, -tip.y, tip.z, 'strobe');
  B.light(fsecs[1].x - fsecs[1].c * 0.5, 0, fsecs[1].z + 0.05, 'beacon'); B.light(X(1) - 0.05, 0, st[0].z, 'white');
  B.light(secs[0].x + 0.05, -W * 1.2, w.z, 'land');
}

/* ---------- ground vehicles and fixed sites ---------- */
/* a lorry: chassis, a cab with a sloped front and windscreen, wheels on n axles; len and w in metres */
function lorry(B, len, w, axles, col, o) {
  o = o || {};
  const cabL = o.cabL || 2.3, h = o.h || 1.05, cabH = o.cabH || 2.1, x1 = len / 2;
  box(B, 0, 0, h, len - 0.3, w * 0.8, 0.35, P.dark);
  box(B, x1 - cabL / 2, 0, h + 0.25 + cabH / 2, cabL, w, cabH, col, { top: [0.82, 0.96], shift: -cabL * 0.08 });
  // windscreen and side windows as dark panels
  box(B, x1 - cabL * 0.1, 0, h + 0.25 + cabH * 0.68, cabL * 0.2, w * 0.86, cabH * 0.36, P.glass, { pitch: -0.18 });
  for (const sg of [1, -1]) box(B, x1 - cabL * 0.42, sg * (w / 2 + 0.01), h + 0.25 + cabH * 0.68, cabL * 0.4, 0.03, cabH * 0.3, P.glass);
  const r = o.r || 0.55;
  for (let i = 0; i < axles; i++) {
    const x = axles === 1 ? 0 : i === 0 ? x1 - cabL * 0.5 : x1 - cabL - 1.4 - (i - 1) * ((len - cabL - 2.4) / Math.max(1, axles - 1));
    for (const k of [-1, 1]) lathe(B, [[-0.26, r * 0.5], [-0.26, r], [0.26, r], [0.26, r * 0.5]], P.rubber, { at: [x, k * (w / 2 - 0.3), r], axis: 'y', segs: B.q ? 10 : 6, cap0: P.dgrey, cap1: P.dgrey, smooth: false });
  }
  if (o.bed) box(B, -cabL / 2 - 0.2, 0, h + o.bed / 2 + 0.2, len - cabL - 0.6, w, o.bed, o.bedCol || col, { top: o.tilt ? [0.96, 0.9] : [1, 1] });
}
/* converts a part in the older [shape, x, y, z, sx, sy, sz, colour, opts] form (units and sites are written that way) */
function part(B, p) {
  const [shape, x, y, z, sx, sy, sz, col] = p, op = p[8] || {};
  if (shape === 'box') box(B, x, y, z, sx || 0.01, sy || 0.01, sz || 0.01, col, { pitch: op.pitch, yaw: op.yaw, top: op.top });
  else if (shape === 'cyl' || shape === 'cone') {
    const axis = op.axis || 'x', len = axis === 'z' ? (op.len || sz) : sx, r = sy / 2;
    const prof = shape === 'cone' ? (op.flip ? [[-len / 2, 0.01], [len / 2, r]] : [[-len / 2, r], [len / 2, 0.01]]) : [[-len / 2, r], [len / 2, r]];
    const pitch = op.pitch || 0;
    const xf = pitch ? (q => { const dx = q[0] - x, dz = q[2] - z; return [x + dx * Math.cos(pitch) - dz * Math.sin(pitch), q[1], z + dx * Math.sin(pitch) + dz * Math.cos(pitch)]; }) : null;
    const go = () => lathe(B, prof, col, { at: [x, y, z], axis, cap0: col, cap1: col, segs: B.q ? (r > 1 ? 16 : 10) : 6 });
    if (xf) B.with(xf, go); else go();
  } else if (shape === 'sphere') {
    const n = B.q ? 6 : 3, prof = [];
    for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; prof.push([Math.cos(a) * sx / 2, Math.max(0.005, Math.sin(a) * 0.5)]); }
    lathe(B, prof, col, { at: [x, y, z], ry: sy, rz: sz, segs: B.q ? 12 : 6 });
  } else if (shape === 'poly') plate(B, op.pts, z, sz || 0.1, col);
}
/* missile canisters on a raised launcher that elevates about its rear edge when the unit is set up */
function canisters(B, x, z, n, len, d, col, pitch, gap) {
  const across = n <= 2 ? n : Math.ceil(n / 2), rows = n <= 2 ? 1 : 2, g = gap || d * 1.15;
  B.group('launch', { kind: 'launch', pivot: [x - len / 2, 0, z - d * 0.5], axis: [0, -1, 0], up: pitch });
  box(B, x - len * 0.15, 0, z - d * 0.62, len * 0.5, across * g + 0.2, 0.25, P.dark);
  for (let r = 0; r < rows; r++) for (let i = 0; i < across; i++) {
    const y = (i - (across - 1) / 2) * g, zz = z + r * g;
    if (d > 0.45) box(B, x, y, zz, len, d, d, col || P.canvas); else lathe(B, [[-len / 2, d / 2], [len / 2, d / 2]], col || P.canvas, { at: [x, y, zz], cap0: P.dark, cap1: P.dgrey, segs: B.q ? 8 : 5 });
  }
  B.group('main');
}
/* a radar antenna that turns on its mast: a flat array (tilted back) or a bar */
function antenna(B, x, z, w, h, col, tilt, turn) {
  cyl(B, [x, 0, z / 2 + 0.6], z - 0.6, 0.18, P.dark, 'z', { segs: 6 });
  if (turn !== false) B.group('radar', { kind: 'radar', pivot: [x, 0, z], axis: [0, 0, 1] });
  box(B, x, 0, z + h / 2, 0.3, w, h, col || P.radar, { pitch: tilt == null ? -0.3 : tilt, col: [P.lgrey, P.dgrey] });
  B.group('main');
}
function hull(B, len, w, col) {
  box(B, 0, 0, 1.45, len, w, 1.1, col, { top: [0.86, 0.9] });
  box(B, len * 0.44, 0, 1.2, len * 0.14, w * 0.96, 0.7, col, { pitch: 0.5 });
  for (const k of [-1, 1]) { box(B, 0, k * (w / 2 - 0.35), 0.55, len * 0.94, 0.7, 1.0, P.rubber); for (let i = 0; i < 5; i++) lathe(B, [[-0.3, 0.35], [0.3, 0.35]], P.dgrey, { at: [-len * 0.38 + i * len * 0.19, k * (w / 2 - 0.35), 0.45], axis: 'y', segs: 6, cap0: P.dgrey, cap1: P.dgrey }); }
}
function turret(B, x, z, d, col, barrels, blen) {
  lathe(B, [[-0.4, d / 2], [0.4, d * 0.42]], col, { at: [x, 0, z + 0.4], axis: 'z', cap0: col, cap1: col, segs: B.q ? 10 : 6 });
  for (let i = 0; i < (barrels || 0); i++) B.with(p => { const dx = p[0] - x, dz = p[2] - z - 0.55, a = 0.3; return [x + dx * Math.cos(a) - dz * Math.sin(a), p[1], z + 0.55 + dx * Math.sin(a) + dz * Math.cos(a)]; }, () => cyl(B, [x + d / 2 + blen / 2, (i - (barrels - 1) / 2) * 0.4, z + 0.55], blen, 0.09, P.black, 'x', { segs: 5 }));
}
function tel(B, n, clen, d, col, o) {
  o = o || {};
  const L = o.len || 12;
  lorry(B, L, 3, o.axles || 4, col || P.green, { cabL: 2.5 });
  canisters(B, -L * 0.12, 3.3, n, clen, d, o.can || P.canvas, o.pitch == null ? 1.2 : o.pitch, o.gap);
}
function shelterTruck(B, col, mast) {
  lorry(B, 9, 2.5, 3, col, { bed: 2.2, bedCol: col });
  if (mast) cyl(B, [-3, 0.6, 3.2 + mast / 2], mast, 0.12, P.dark, 'z', { segs: 6 });
}
function hut(B, w, l, h, col) { box(B, 0, 0, 0.1, l + 4, w + 4, 0.2, P.concrete); box(B, 0, 0, 0.2 + h / 2, l, w, h, col || P.tan, { top: [0.98, 0.98] }); }

/* ---------- the catalogue ---------- */
const M = {};
/* key, display name, group, length and span in metres, the builder, and what moves */
const def = (key, name, group, len, span, build, o) => { M[key] = Object.assign({ key, name, group, len, span, build }, o || {}); };
const PS = parts => B => { for (const p of parts) part(B, p); };   // a model written as older parts
const G = P.green, G2 = P.green2;

// aircraft, by IC.ACTYPES key
// general aviation: the club's trainers and tourers, private and working aircraft, helicopters, a glider, a microlight
const GA = 'General aviation';
def('light', 'High-wing trainer', GA, 8.28, 11.0, B => gaPlane(B, {
  // a four-seat trainer: boxy cabin under a strut-braced wing, fixed tricycle gear in fairings, a two-blade propeller
  L: 7.85, W: 1.04, H: 1.36, zc: 1.36, ws: [0.19, 0.29], side: [[0.3, 0.43, 36, 84], [0.45, 0.55, 42, 82]],
  wing: { f: 0.27, z: 2.06, span: 11.0, c0: 1.62, c1: 1.12, dih: 1.7, strut: true, y0: 0.3 },
  tail: { f: 0.84, fz: 1.72, fh: 1.0, fc0: 1.5, fc1: 0.75, fsweep: 38, dorsal: 1.0, hs: 3.4, hc0: 1.1, hc1: 0.72, hz: 1.72, hf: 0.87 },
  prop: { dia: 1.9, n: 2 }, gear: { type: 'tri', nf: 0.12, mf: 0.44, track: 2.5, nr: 0.22, mr: 0.28, spats: true }
}));
def('tourer', 'Low-wing tourer', GA, 7.25, 10.67, B => gaPlane(B, {
  L: 6.75, W: 1.08, H: 1.26, zc: 1.26, ws: [0.2, 0.31], wsE: 58, side: [[0.32, 0.47, 30, 80], [0.49, 0.58, 36, 78]],
  wing: { f: 0.33, z: 0.8, span: 10.67, c0: 1.62, c1: 1.1, dih: 7 },
  tail: { f: 0.86, fz: 1.5, fh: 0.74, fc0: 1.3, fc1: 0.6, fsweep: 42, dorsal: 0.8, hs: 3.9, hc0: 0.8, hc1: 0.8, hz: 1.52, hf: 0.9 },
  prop: { dia: 1.88, n: 2 }, gear: { type: 'tri', nf: 0.12, mf: 0.44, track: 3.05, nr: 0.22, mr: 0.26, spats: true }
}));
def('retract', 'Retractable single', GA, 8.38, 10.2, B => gaPlane(B, {
  L: 7.8, W: 1.12, H: 1.3, zc: 1.38, ws: [0.2, 0.31], wsE: 58, side: [[0.32, 0.5, 30, 78], [0.52, 0.6, 36, 76]],
  wing: { f: 0.33, z: 0.92, span: 10.2, c0: 2.0, c1: 1.1, dih: 6 },
  tail: { f: 0.85, fz: 1.6, fh: 1.02, fc0: 1.6, fc1: 0.7, fsweep: 40, dorsal: 0.9, hs: 3.7, hc0: 1.1, hc1: 0.7, hz: 1.6, hf: 0.88 },
  prop: { dia: 2.03, n: 3 }, gear: { type: 'retract', nf: 0.13, mf: 0.44, track: 2.9, nr: 0.22, mr: 0.3, mtop: 0.95 }
}));
def('twin', 'Light twin', GA, 9.09, 11.53, B => gaPlane(B, {
  L: 8.62, W: 1.16, H: 1.32, zc: 1.42, ws: [0.24, 0.34], wsE: 58, side: [[0.35, 0.5, 30, 78], [0.52, 0.62, 34, 76]],
  prof: [[0, 0.08, 0.1, -0.06], [0.05, 0.45, 0.42, -0.05], [0.13, 0.74, 0.7, -0.03], [0.24, 0.96, 0.9, 0], [0.34, 1, 1, 0.03], [0.48, 0.94, 0.9, 0.05], [0.62, 0.62, 0.56, 0.12], [0.8, 0.36, 0.32, 0.2], [0.93, 0.2, 0.2, 0.25], [1, 0.08, 0.12, 0.27]],
  wing: { f: 0.36, z: 0.98, span: 11.53, c0: 2.1, c1: 1.1, dih: 6 },
  tail: { f: 0.84, fz: 1.62, fh: 1.3, fc0: 1.8, fc1: 0.8, fsweep: 42, dorsal: 1.0, hs: 4.9, hc0: 1.2, hc1: 0.8, hz: 1.66, hf: 0.88 },
  twin: { f: 0.3, y: 1.95, z: 1.1, len: 2.7, d: 0.78, dia: 1.93, n: 3 }, gear: { type: 'retract', nf: 0.1, mf: 0.45, track: 3.9, nr: 0.22, mr: 0.32, mtop: 1.0 }
}));
def('taildrag', 'Aerobatic taildragger', GA, 7.12, 8.0, B => gaPlane(B, {
  L: 6.52, W: 0.96, H: 1.1, zc: 1.45, n: 2.2, bubble: { f: 0.42, l: 1.9, w: 0.42, h: 0.42 },
  prof: [[0, 0.3, 0.3, 0], [0.03, 0.66, 0.66, 0], [0.12, 0.92, 0.9, 0], [0.26, 1, 1, 0.02], [0.4, 0.92, 0.9, 0.05], [0.58, 0.6, 0.55, 0.1], [0.76, 0.36, 0.32, 0.14], [0.92, 0.18, 0.2, 0.17], [1, 0.06, 0.1, 0.18]],
  wing: { f: 0.28, z: 1.2, span: 8.0, c0: 1.9, c1: 1.0, dih: 0, t: 0.16 },
  tail: { f: 0.87, fz: 1.6, fh: 1.0, fc0: 1.3, fc1: 0.7, fsweep: 30, hs: 3.2, hc0: 1.0, hc1: 0.7, hz: 1.6, hf: 0.87 },
  prop: { dia: 1.9, n: 3 }, gear: { type: 'tail', mf: 0.2, track: 1.9, nr: 0.12, mr: 0.3, spats: true, legCol: 'BODY' }, reg: [0.46, 82, 0.3]
}));
def('utility', 'Utility turboprop', GA, 12.67, 15.87, B => { gaPlane(B, {
  // a single-engine turboprop workhorse: high strut-braced wing, a cargo pod under the belly
  L: 11.6, W: 1.62, H: 1.8, zc: 2.15, ws: [0.16, 0.25], side: [[0.26, 0.35, 38, 82], [0.37, 0.64, 46, 78]],
  prof: [[0, 0.3, 0.3, -0.02], [0.03, 0.6, 0.58, -0.02], [0.12, 0.84, 0.8, -0.01], [0.2, 0.98, 0.94, 0], [0.3, 1, 1, 0.02], [0.55, 0.98, 0.96, 0.04], [0.68, 0.66, 0.6, 0.12], [0.82, 0.38, 0.34, 0.2], [0.94, 0.2, 0.2, 0.25], [1, 0.08, 0.12, 0.27]],
  wing: { f: 0.25, z: 3.12, span: 15.87, c0: 1.98, c1: 1.3, dih: 3, strut: true, y0: 0.4 },
  tail: { f: 0.86, fz: 2.75, fh: 1.95, fc0: 2.4, fc1: 1.0, fsweep: 38, dorsal: 1.4, hs: 6.2, hc0: 1.6, hc1: 1.0, hz: 2.75, hf: 0.89 },
  prop: { dia: 2.69, n: 3 }, turbine: 0.1, gear: { type: 'tri', nf: 0.1, mf: 0.46, track: 3.56, nr: 0.3, mr: 0.38 }
});
  loft(B, [{ x: 3.6, w: 0.05, h: 0.05, z: 1.15 }, { x: 3.1, w: 0.5, h: 0.3, z: 1.1, n: 3 }, { x: -1.8, w: 0.55, h: 0.32, z: 1.1, n: 3 }, { x: -2.8, w: 0.08, h: 0.08, z: 1.25 }], B.q ? ANG.mid : ANG.lo, () => 'BELLY', {});
});
def('helil', 'Light helicopter', GA, 11.66, 10.06, B => heli(B, {
  L: 11.66, W: 1.28, H: 1.45, zc: 1.3, nose: 3.4, body: 'BODY', under: 'STRIPE', finCol: 'FIN',
  cabin: [[3.4, 0.1, 0.15, -0.1, 2], [3.2, 0.6, 0.62, -0.05, 2.2], [2.6, 0.95, 0.96, 0.02, 2.4], [1.6, 1, 1, 0.05], [0.6, 0.95, 0.95, 0.1], [-0.2, 0.55, 0.55, 0.25], [-0.7, 0.3, 0.3, 0.35]],
  glassF: (x, e) => (x > 1.7 && e < 108) || (x > 0.7 && x < 1.7 && e > 34 && e < 92),
  boom: [[-0.7, 0.16, 1.72], [-3.5, 0.09, 1.85], [-4.95, 0.07, 1.9]],
  finH: 0.8, fin: [0.7, 0.8, 0.45], stab: { x: 0.9, span: 1.3, c: 0.45, z: -0.05 },
  rx: 0.8, mast: 2.95, mastR: 0.1, hub: 0.45, R: 5.03, blades: 2, chord: 0.26, tr: [-5.0, -0.15, 1.95], TR: 0.73, tblades: 2,
  skids: { x: 0.6, len: 2.8, y: 0.95, legs: [1.3, -0.2], top: 0.62 }
}));
def('helim', 'Medium helicopter', GA, 16.66, 13.8, B => heli(B, {
  L: 16.66, W: 2.2, H: 1.9, zc: 1.55, nose: 5.4, body: 'BODY', under: 'STRIPE', finCol: 'FIN',
  cabin: [[5.4, 0.12, 0.18, -0.2, 2], [5.1, 0.55, 0.6, -0.1, 2.4], [4.3, 0.9, 0.9, 0.05], [3.2, 1, 1, 0.1], [-1.2, 1, 1, 0.1], [-2.6, 0.8, 0.8, 0.25], [-3.4, 0.5, 0.5, 0.35]],
  glassF: (x, e) => (x > 3.7 && e < 100 && e > 12) || (x > -0.9 && x < 3 && e > 48 && e < 80 && Math.abs(((x + 0.9) % 1.3) - 0.65) < 0.45),
  boom: [[-3.4, 0.45, 2.0], [-7.2, 0.28, 2.2], [-8.2, 0.2, 2.3]],
  finH: 1.9, fin: [1.4, 1.6, 0.9], stab: { x: 2.2, span: 3.0, c: 0.8, z: 0.2 },
  eng: [[-0.3, 0.5, 2.7], [-0.3, -0.5, 2.7]],
  rx: 1.2, mast: 3.55, mastR: 0.16, hub: 0.8, R: 6.9, blades: 5, chord: 0.45, tr: [-8.1, -0.3, 3.5], TR: 1.35, tblades: 4,
  wheels: [[3.6, 0.25, 0.24], [3.6, -0.25, 0.24], [-1.1, 1.35, 0.34], [-1.1, -1.35, 0.34]]
}));
def('glider', 'Glider', GA, 8.35, 17.0, B => gaPlane(B, {
  // a two-seat trainer glider: slim pod and boom, a long canopy, long thin wings, a T-tail, one wheel
  L: 8.2, W: 0.72, H: 0.92, zc: 0.62, n: 2.1, bubble: { f: 0.2, l: 2.8, w: 0.34, h: 0.36 },
  prof: [[0, 0.2, 0.2, 0], [0.05, 0.62, 0.6, 0], [0.14, 0.9, 0.9, 0.02], [0.26, 1, 1, 0.05], [0.4, 0.8, 0.72, 0.08], [0.55, 0.38, 0.34, 0.18], [0.75, 0.24, 0.24, 0.26], [0.9, 0.18, 0.2, 0.3], [1, 0.1, 0.14, 0.32]],
  wing: { f: 0.36, z: 0.92, span: 17.0, c0: 1.35, c1: 0.45, dih: 4, t: 0.14, y0: 0.25 },
  tail: { f: 0.9, fz: 0.95, fh: 0.62, fc0: 1.0, fc1: 0.6, fsweep: 20, t: true, hs: 3.2, hc0: 0.7, hc1: 0.45 },
  gear: { type: 'mono', mf: 0.38, mr: 0.2 }, reg: [0.5, 80, 0.3]
}));
def('micro', 'Microlight', GA, 4.2, 10.0, B => {
  // a flex-wing trike: a small pod on three wheels, a mast up to a hang-glider wing, a pusher propeller
  const q = B.q;
  loft(B, [{ x: -0.9, w: 0.2, h: 0.25, z: 0.75 }, { x: -0.2, w: 0.42, h: 0.4, z: 0.8 }, { x: 0.7, w: 0.4, h: 0.38, z: 0.78 }, { x: 1.4, w: 0.18, h: 0.18, z: 0.72 }], q ? ANG.mid : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return x > 0.9 && e < 60 ? 'GLASS' : e > 100 ? 'STRIPE' : 'BODY'; }, { cap0: 'BODY', cap1: 'BODY' });
  strut(B, [-0.6, 0, 1.0], [0.05, 0, 3.15], 0.09, P.lgrey); strut(B, [1.2, 0, 0.8], [0.15, 0, 3.15], 0.05, P.lgrey);
  // the wing: a swept delta of sailcloth, drooping at the tips, on a keel
  wing(B, [{ x: 1.5, y: 0, z: 3.25, c: 2.4, t: 0.05 }, { x: -0.5, y: 2.6, z: 3.2, c: 1.5, t: 0.04 }, { x: -1.9, y: 5.0, z: 3.05, c: 0.8, t: 0.03 }], 'STRIPE', { mirror: true, tipCol: 'STRIPE2', foil: FOIL.lo });
  cyl(B, [0, 0, 3.3], 3.0, 0.04, P.metal, 'x', { segs: 4 });
  prop(B, 'prop', -1.05, 0, 1.0, 1.7, 3, P.dark, { axis: [-1, 0, 0], spin: P.dgrey });
  for (const [x, y, r] of [[1.25, 0, 0.18], [-0.4, 0.8, 0.22], [-0.4, -0.8, 0.22]]) { wheel(B, x, y, r, 0.1, null); if (y) strut(B, [-0.4, y * 0.2, 0.55], [-0.4, y, r], 0.05, P.metal); }
  B.light(-1.8, 4.9, 3.05, 'green'); B.light(-1.8, -4.9, 3.05, 'red'); B.light(-0.8, 0, 1.4, 'strobe');
});

// airliners
def('turbo', 'Regional turboprop', 'Civil aircraft', 27.2, 27.1, B => airliner(B, {
  L: 27.2, D: 2.6, H: 2.8, zc: 2.25, nose: 3.6, tail: 8.4, noWin: false,
  wing: { x: 2.4, span: 27.1, c0: 2.6, c1: 1.4, sweep: 3, dih: 1.5, z: 0.52, fairing: false },
  tail2: { hs: 7.3, hc0: 1.9, hc1: 1.0, hsweep: 20, fh: 4.1, fc0: 4.2, fc1: 2.2, fsweep: 36, t: true },
  eng: [{ dx: 0.4, y: 4.1, z: 3.3, len: 5.2, d: 1.15, prop: 3.93, blades: 6 }],
  gear: { nx: 11.0, nr: 0.35, mx: 0.7, track: 4.1, mr: 0.45, mtop: 1.3, fuse: true },
  canoes: false
}));
def('narrow', 'Narrow-body jet', 'Civil aircraft', 37.6, 35.8, B => airliner(B, {
  L: 37.6, D: 3.95, H: 4.14, zc: 3.7, nose: 5.8, tail: 11.2,
  wing: { x: 4.8, span: 34.1, c0: 7.2, c1: 1.6, kink: { f: 0.36, c: 3.9 }, sweep: 27, dih: 5.5 },
  tail2: { hs: 12.45, hc0: 3.6, hc1: 1.4, hsweep: 32, fh: 6.4, fc0: 5.8, fc1: 2.1, fsweep: 36 },
  eng: [{ dx: 0.9, y: 5.75, z: 1.62, len: 4.4, d: 2.1 }],
  gear: { nx: 13.6, nr: 0.38, mx: -0.6, track: 7.6, mr: 0.58 },
  winglet: 2.4
}));
def('wide', 'Wide-body jet', 'Civil aircraft', 63.7, 60.9, B => airliner(B, {
  L: 63.7, D: 6.2, H: 6.4, zc: 4.9, nose: 8.6, tail: 18.5,
  wing: { x: 6.8, span: 60.9, c0: 13.0, c1: 2.4, kink: { f: 0.34, c: 7.5 }, sweep: 31.6, dih: 6 },
  tail2: { hs: 21.5, hc0: 6.2, hc1: 2.2, hsweep: 35, fh: 10.5, fc0: 9.0, fc1: 3.2, fsweep: 40 },
  eng: [{ dx: 1.6, y: 9.6, z: 2.5, len: 7.3, d: 3.4 }],
  gear: { nx: 23.2, nr: 0.64, mx: -2.4, track: 11, mr: 0.72, mw: 2, bogie: 3 }
}));
def('cargo', 'Freighter', 'Civil aircraft', 70.7, 64.4, B => airliner(B, {
  L: 70.7, D: 6.5, H: 6.9, zc: 5.3, nose: 9.5, tail: 18.0, hump: 26, noWin: true,
  wing: { x: 7.6, span: 64.4, c0: 14.5, c1: 4.0, kink: { f: 0.3, c: 9 }, sweep: 40, dih: 7 },
  tail2: { hs: 22.2, hc0: 7.6, hc1: 2.6, hsweep: 38, fh: 11.5, fc0: 11.0, fc1: 3.4, fsweep: 45 },
  eng: [{ dx: 1.5, y: 12.1, z: 3.1, len: 7.0, d: 2.7 }, { dx: 1.5, y: 21.0, z: 4.2, len: 7.0, d: 2.7 }],
  gear: { nx: 25.5, nr: 0.62, mx: -3.2, track: 11, mr: 0.66, bogie: 2, body: -4 },
  winglet: 1.8
}));
def('rj', 'Regional jet', 'Civil aircraft', 31.68, 26.0, B => airliner(B, {
  L: 31.68, D: 3.01, H: 3.35, zc: 2.9, nose: 4.6, tail: 9.0,
  wing: { x: 3.6, span: 26.0, c0: 5.4, c1: 1.3, kink: { f: 0.35, c: 3.4 }, sweep: 25, dih: 5 },
  tail2: { hs: 10.0, hc0: 3.1, hc1: 1.2, hsweep: 32, fh: 5.6, fc0: 5.0, fc1: 2.2, fsweep: 42, t: true },
  eng: [{ dx: 0.6, y: 3.9, z: 1.35, len: 3.4, d: 1.5 }],
  gear: { nx: 11.0, nr: 0.33, mx: -0.8, track: 5.0, mr: 0.5 }, winglet: 1.5, win: { gap: 0.95, w: 0.26, h: 0.34 }
}));
def('widel', 'Large twin-aisle jet', 'Civil aircraft', 73.86, 64.8, B => airliner(B, {
  L: 73.86, D: 6.19, H: 6.19, zc: 4.9, nose: 8.8, tail: 20,
  wing: { x: 8.0, span: 64.8, c0: 14.0, c1: 2.3, kink: { f: 0.33, c: 8.0 }, sweep: 31.6, dih: 6 },
  tail2: { hs: 21.5, hc0: 6.4, hc1: 2.3, hsweep: 35, fh: 11.2, fc0: 9.2, fc1: 3.2, fsweep: 42 },
  eng: [{ dx: 1.8, y: 9.7, z: 2.3, len: 7.8, d: 3.9 }],
  gear: { nx: 26, nr: 0.64, mx: -3.2, track: 11, mr: 0.72, bogie: 3 }
}));
def('jumbo', 'Double-deck giant', 'Civil aircraft', 72.72, 79.75, B => airliner(B, {
  L: 72.72, D: 7.14, H: 8.41, zc: 5.9, nose: 9.5, tail: 20,
  wing: { x: 9.0, span: 79.75, c0: 17.5, c1: 3.0, kink: { f: 0.34, c: 11 }, sweep: 33.5, dih: 5.6 },
  tail2: { hs: 30.4, hc0: 9.0, hc1: 3.0, hsweep: 37, fh: 14.9, fc0: 13, fc1: 4, fsweep: 42 },
  eng: [{ dx: 2.2, y: 14.7, z: 2.9, len: 7.5, d: 3.2 }, { dx: 2.2, y: 25.8, z: 4.3, len: 7.5, d: 3.2 }],
  gear: { nx: 28, nr: 0.64, mx: -4, track: 12.5, mr: 0.72, bogie: 2, body: -3 }, winglet: 2.4,
  win: { rows: [{ e: 42 }, { e: 84 }] }, cockpit: [0.4, 0.54, 0.66]
}));
def('cargoprop', 'Cargo turboprop', 'Civil aircraft', 22.7, 28.7, B => { airliner(B, {
  // a high-wing freighter: the tail sweeps up over a loading ramp, the main wheels sit in fairings on the belly
  L: 22.7, D: 3.3, H: 3.5, zc: 2.6, nose: 3.5, tail: 8.5, tailUp: 2.1, noWin: true,
  wing: { x: 1.8, span: 28.7, c0: 3.4, c1: 1.6, sweep: 2, dih: 1, z: 0.48, fairing: false },
  tail2: { hs: 10.0, hc0: 2.8, hc1: 1.4, hsweep: 10, hdih: 0, hz: 0.62, fh: 5.2, fc0: 5.0, fc1: 2.6, fsweep: 30, fz: 4.4 },
  eng: [{ dx: 0.6, y: 4.8, z: 4.1, len: 5.0, d: 1.25, prop: 4.1, blades: 6 }],
  gear: { nx: 7.8, nr: 0.4, mx: 0.2, track: 3.7, mr: 0.5, mtop: 1.3, fuse: true }, canoes: false
}); for (const sg of [1, -1]) loft(B, [{ x: 3.0, y: sg * 1.55, w: 0.1, h: 0.1, z: 1.4 }, { x: 2.0, y: sg * 1.6, w: 0.55, h: 0.6, z: 1.35 }, { x: -1.8, y: sg * 1.6, w: 0.55, h: 0.6, z: 1.35 }, { x: -3.0, y: sg * 1.55, w: 0.1, h: 0.1, z: 1.5 }], B.q ? ANG.mid : ANG.lo, () => 'BELLY', {}); });

// business aviation: very light jet, mid-size and long-range jets, a business turboprop
const BIZ = 'Business aviation';
def('vlj', 'Very light jet', BIZ, 12.82, 12.3, B => airliner(B, {
  L: 12.82, D: 1.6, H: 1.7, zc: 1.55, nose: 2.4, tail: 4.0,
  wing: { x: 0.8, span: 12.3, c0: 2.3, c1: 1.0, sweep: 12, dih: 4, z: -0.35 },
  tail2: { hs: 5.2, hc0: 1.3, hc1: 0.7, hsweep: 25, fh: 2.35, fc0: 2.4, fc1: 1.1, fsweep: 42, t: true },
  eng: [{ x: -3.5, y: 1.35, z: 2.1, len: 2.1, d: 0.82, tail: true }],
  gear: { nx: 4.6, nr: 0.22, mx: -0.6, track: 3.3, mr: 0.3 }, winglet: 0.5, canoes: false,
  win: { gap: 0.9, w: 0.34, h: 0.4, front: 1.35, back: 1.0, door: 0.7, doorH: 1.3, rear: false }, cockpit: [0.3, 0.48, 0.62]
}));
def('bizjet', 'Mid-size business jet', BIZ, 20.92, 21.0, B => airliner(B, {
  L: 20.92, D: 2.3, H: 2.4, zc: 1.95, nose: 3.0, tail: 5.6,
  wing: { x: 1.4, span: 21.0, c0: 3.6, c1: 1.2, sweep: 27, dih: 3, z: -0.32 },
  tail2: { hs: 7.0, hc0: 1.8, hc1: 0.8, hsweep: 30, fh: 3.4, fc0: 3.2, fc1: 1.6, fsweep: 45, t: true },
  eng: [{ x: -5.6, y: 1.85, z: 2.65, len: 3.3, d: 1.2, tail: true }],
  gear: { nx: 7.5, nr: 0.25, mx: -0.8, track: 3.3, mr: 0.38 }, winglet: 1.2, canoes: false,
  win: { gap: 0.95, w: 0.38, h: 0.44, front: 1.3, back: 1.0, door: 0.8, doorH: 1.6, rear: false }, cockpit: [0.3, 0.48, 0.62]
}));
def('bizlong', 'Long-range business jet', BIZ, 30.41, 30.36, B => airliner(B, {
  L: 30.41, D: 2.6, H: 2.7, zc: 2.3, nose: 3.6, tail: 7.5,
  wing: { x: 2.4, span: 30.36, c0: 5.2, c1: 1.4, sweep: 35, dih: 4, z: -0.32 },
  tail2: { hs: 10.3, hc0: 2.6, hc1: 1.0, hsweep: 28, fh: 4.6, fc0: 4.4, fc1: 2.2, fsweep: 40, t: true },
  eng: [{ x: -8.3, y: 2.35, z: 3.1, len: 4.4, d: 1.55, tail: true }],
  gear: { nx: 11.5, nr: 0.3, mx: -1.8, track: 4.1, mr: 0.45 }, winglet: 1.6, canoes: false,
  win: { gap: 1.05, w: 0.42, h: 0.52, front: 1.3, back: 1.0, door: 0.85, doorH: 1.8, rear: false }, cockpit: [0.3, 0.48, 0.62]
}));
def('bizprop', 'Business turboprop', BIZ, 14.22, 17.65, B => airliner(B, {
  L: 14.22, D: 1.55, H: 1.7, zc: 1.75, nose: 2.6, tail: 4.4,
  wing: { x: 1.4, span: 17.65, c0: 2.6, c1: 1.1, sweep: 3, dih: 6, z: -0.3, fairing: false },
  tail2: { hs: 5.6, hc0: 1.3, hc1: 0.9, hsweep: 25, fh: 2.1, fc0: 2.8, fc1: 1.2, fsweep: 40, t: true },
  eng: [{ dx: 0.6, y: 2.6, z: 1.72, len: 3.4, d: 0.82, prop: 2.67, blades: 4 }],
  gear: { nx: 4.9, nr: 0.22, mx: 0.2, track: 5.2, mr: 0.34, mtop: 1.45 }, winglet: 0.6, canoes: false,
  win: { gap: 0.95, w: 0.32, h: 0.38, front: 1.35, back: 1.0, rear: true, door: 0.7, doorH: 1.3 }, cockpit: [0.3, 0.48, 0.62]
}));

// rare visitors: one of a kind, always in their own paint
const RARE = 'Rare visitors';
const paint = (B, m) => { B.remap = m; };
def('vintage', 'Vintage four-engine airliner', RARE, 34.62, 37.49, B => { paint(B, { BODY: '#e8eae4', BELLY: '#b8bfc6', STRIPE: '#b3202c', STRIPE2: '#e8eae4', FIN: '#e8eae4', ENG: '#b8bfc6', WING: '#b8bfc6', DOOR: '#8a9096', REG: '#b3202c' }); airliner(B, {
  // a piston airliner of the 1950s: a long curved fuselage on tall gear, four radial engines, three fins
  L: 34.62, D: 3.5, H: 3.6, zc: 3.3, nose: 5.4, tail: 10, tailUp: 1.3,
  wing: { x: 3.2, span: 37.49, c0: 5.6, c1: 1.8, sweep: 4, dih: 7, z: -0.3, fairing: false },
  tail2: { hs: 16.0, hc0: 3.4, hc1: 2.0, hsweep: 8, hdih: 8, hz: 0.15, fh: 2.9, fc0: 3.0, fc1: 1.9, fsweep: 20, tipFin: 3.4 },
  eng: [{ dx: 0.9, y: 5.2, z: 2.7, len: 4.0, d: 1.6, prop: 4.6, blades: 3, spin: '#b8bfc6' }, { dx: 0.9, y: 10.2, z: 3.2, len: 4.0, d: 1.6, prop: 4.6, blades: 3, spin: '#b8bfc6' }],
  gear: { nx: 10.5, nr: 0.45, mx: 0.8, track: 8.6, mr: 0.7, mtop: 2.4 }, canoes: false, win: { gap: 1.4, w: 0.36, h: 0.36 }
}); });
def('sst', 'Supersonic airliner', RARE, 61.66, 25.6, B => {
  // a slender needle on long legs under a curved delta wing, four engines in two boxes, no tailplane
  paint(B, { BODY: '#f2f3f1', BELLY: '#e4e6e4', STRIPE: '#f2f3f1', STRIPE2: '#1c3a6c', FIN: '#f2f3f1', ENG: '#d8dcdf', WING: '#eceeed', DOOR: '#a8aeb4' });
  const q = B.q, L = 61.66, x1 = L / 2, zc = 5.2, D = 2.9;
  const prof = [[0, 0.02, 0.02, -0.02], [0.03, 0.14, 0.14, -0.02], [0.08, 0.38, 0.38, -0.01], [0.14, 0.7, 0.7, 0], [0.2, 0.92, 0.94, 0], [0.28, 1, 1, 0], [0.82, 1, 1, 0], [0.92, 0.72, 0.72, 0.05], [1, 0.22, 0.24, 0.1]];
  const st = prof.map(([f, kw, kh, dz]) => ({ x: x1 - f * L, w: D / 2 * kw, h: D / 2 * 1.12 * kh, z: zc + dz * D })).sort((a, b) => a.x - b.x);
  loft(B, st, q ? ANG.hi : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return e > 118 ? 'BELLY' : e > 96 && e < 104 ? 'STRIPE2' : 'BODY'; }, { cap0: 'BODY' });
  if (q) { for (const sg of [1, -1]) { decal(B, st, x1 - 11.2, x1 - 10.1, sg > 0 ? 4 : -34, sg > 0 ? 34 : -4, 'GLASS', 0.02, 2, 2); for (let x = x1 - 14; x > -18; x -= 1.1) { B.group('win', { kind: 'win' }); decal(B, st, x - 0.18, x, sg > 0 ? 70 : -80, sg > 0 ? 80 : -70, 'WIN', 0.03); B.group('main'); } } }
  // the ogival wing: long at the root, curving out to a short tip, drooping at the edges
  const wz = zc - 1.1;
  wing(B, [{ x: 9, y: 0.8, z: wz, c: 30, t: 0.03 }, { x: 0, y: 3.4, z: wz, c: 22.5, t: 0.03 }, { x: -7, y: 6.4, z: wz - 0.1, c: 15, t: 0.028 }, { x: -12.8, y: 9.8, z: wz - 0.25, c: 9.2, t: 0.025 }, { x: -16.8, y: 12.8, z: wz - 0.4, c: 4.4, t: 0.025 }], 'WING', { mirror: true, smooth: true });
  // engine boxes under the wing, intakes dark in front, nozzles behind
  for (const sg of [1, -1]) {
    box(B, -11.5, sg * 4.6, wz - 0.8, 11.5, 2.5, 1.3, 'ENG', { top: [1, 0.96] });
    box(B, -5.6, sg * 4.6, wz - 0.8, 0.3, 2.3, 1.1, P.intake);
    for (const dy of [-0.6, 0.6]) lathe(B, [[0, 0.52], [-1.0, 0.46]], P.nozzle, { at: [-17.3, sg * 4.6 + dy, wz - 0.8], cap1: P.black, segs: q ? 10 : 6 });
  }
  wing(B, plan(-19.2, 0, zc + 1.2, 5.8, 11.0, 3.0, 55, 90, 0.05, 0.05), 'FIN', {});
  gearLeg(B, 'gearN', 20.5, 0, zc - 1.2, 0.4, 2, { gap: 0.5 });
  for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', -7.5, sg * 3.85, wz - 0.1, 0.6, 2, { bogie: 2 });
  B.light(-21, 12.8, wz - 0.4, 'green'); B.light(-21, -12.8, wz - 0.4, 'red'); B.light(-30.6, 0, zc, 'white');
  B.light(-7, 0, zc + 1.6, 'beacon'); B.light(-7, 0, zc - 1.6, 'beacon'); B.light(-20, 12.5, wz - 0.4, 'strobe'); B.light(-20, -12.5, wz - 0.4, 'strobe');
  B.light(6, 1.8, wz, 'land'); B.light(6, -1.8, wz, 'land');
});
def('outsize', 'Outsize freighter', RARE, 63.1, 60.3, B => { paint(B, { BODY: '#f2f3f1', BELLY: '#c8ced4', STRIPE: '#f2f3f1', STRIPE2: '#f2f3f1', FIN: '#1f5fa8', ENG: '#f2f3f1', DOOR: '#a8aeb4' }); airliner(B, {
  // a whale: the airliner's cockpit low at the front, a vast cargo hold above it
  L: 63.1, D: 5.64, H: 5.64, zc: 4.1, nose: 7.2, tail: 16, noWin: true,
  wing: { x: 5.5, span: 60.3, c0: 11.8, c1: 2.4, kink: { f: 0.33, c: 7 }, sweep: 30, dih: 5.5 },
  tail2: { hs: 25.0, hc0: 6.0, hc1: 2.4, hsweep: 32, hz: 0.15, fh: 7.2, fc0: 8.5, fc1: 3.2, fsweep: 40, fz: 11.6, tipFin: 4.2 },
  eng: [{ dx: 1.5, y: 9.2, z: 2.2, len: 6.2, d: 3.0 }],
  gear: { nx: 22, nr: 0.6, mx: -2, track: 10.7, mr: 0.7, bogie: 2 }
});
  const lobe = [{ x: 20.5, w: 0.3, h: 0.3, z: 8.0 }, { x: 18.5, w: 2.9, h: 2.6, z: 8.1 }, { x: 15, w: 4.1, h: 3.8, z: 8.0 }, { x: 9, w: 4.4, h: 4.3, z: 7.9 }, { x: -16, w: 4.4, h: 4.3, z: 7.9 }, { x: -22, w: 3.2, h: 3.2, z: 8.5 }, { x: -28, w: 1.2, h: 1.2, z: 9.6 }];
  loft(B, lobe, B.q ? ANG.hi : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return e > 120 ? 'BELLY' : 'BODY'; }, { cap0: 'BODY' });
  if (B.q) { const ls = lobe.slice().sort((a, b) => a.x - b.x); ls.ang = lobe.ang; for (const sg of [1, -1]) decal(B, ls, 16.2, 17.4, sg > 0 ? 48 : -66, sg > 0 ? 66 : -48, '#1c2430', 0.03, 2, 2); }
});
def('airship', 'Airship', RARE, 75.1, 19.5, B => {
  // a semi-rigid airship: the envelope, a gondola under it, three tail fins, propellers to push and steer
  paint(B, { BODY: '#f1f1ec', STRIPE: '#1f4f9a', FIN: '#1f4f9a' });
  const q = B.q, R = 7.1, zc = 10.3;
  const prof = [[37.5, 0.3], [36.4, 2.6], [34, 4.6], [30, 6.0], [24, 6.8], [15, 7.1], [4, 7.1], [-8, 6.9], [-18, 6.2], [-26, 4.9], [-32, 3.3], [-36, 1.6], [-37.5, 0.3]];
  lathe(B, prof, 'BODY', { at: [0, 0, zc], segs: q ? 20 : 10, col: i => (i === 5 || i === 7) ? 'STRIPE' : 'BODY', cap0: 'BODY', cap1: 'BODY' });
  loft(B, [{ x: 9, w: 0.3, h: 0.3, z: 2.0 }, { x: 7.5, w: 1.2, h: 1.0, z: 2.1, n: 3 }, { x: -3, w: 1.3, h: 1.1, z: 2.2, n: 3 }, { x: -6, w: 0.4, h: 0.4, z: 2.5 }], q ? ANG.mid : ANG.lo, (x, a) => { const e = a > 180 ? 360 - a : a; return x > 5.5 && e < 100 ? 'GLASS' : e < 70 && e > 50 && x > -2.5 ? 'GLASS' : 'BODY'; }, { cap0: 'BODY' });
  wheel(B, 0, 0, 0.35, 0.2, null);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, ca = Math.cos(a), sa = Math.sin(a);
    B.with(p => { const yy = p[1], zz = p[2] - zc; return [p[0], yy * ca - zz * sa, zc + yy * sa + zz * ca]; }, () => wing(B, plan(-24, 0, 4.8, 4.4, 9, 5, 30, 90, 0.08, 0.06), 'FIN', {}));
  }
  for (const sg of [1, -1]) { strut(B, [-3, sg * 5.8, zc - 3.5], [-3, sg * 8.3, zc - 3.5], 0.3, P.lgrey); B.np = (B.np || 0) + 1; prop(B, 'prop' + B.np, -2.4, sg * 8.3, zc - 3.5, 2.6, 4, P.dark, { spin: 'BODY' }); }
  prop(B, 'propT', -37.9, 0, zc, 3.0, 4, P.dark, { axis: [-1, 0, 0], spin: 'BODY' });
  B.light(0, 7.2, zc, 'green'); B.light(0, -7.2, zc, 'red'); B.light(-37.6, 0, zc, 'white'); B.light(0, 0, zc + 7.1, 'strobe'); B.light(4, 0, 1.2, 'beacon');
});
def('amphib', 'Firefighting amphibian', RARE, 19.82, 28.63, B => { paint(B, { BODY: '#e8b820', BELLY: '#c8323c', STRIPE: '#c8323c', STRIPE2: '#c8323c', FIN: '#e8b820', ENG: '#e8b820', REG: '#1c1c1c' }); gaPlane(B, {
  // a flying boat that scoops water: a deep hull, the wing high on top, two turboprops, floats under the tips
  L: 18.55, W: 2.6, H: 3.2, zc: 2.8, n: 2.8, ws: [0.1, 0.17], wsE: 52, side: [[0.17, 0.22, 44, 76]],
  prof: [[0, 0.3, 0.3, -0.1], [0.03, 0.62, 0.6, -0.08], [0.1, 0.88, 0.86, -0.04], [0.2, 1, 1, 0], [0.5, 1, 1, 0], [0.62, 0.8, 0.8, 0.1], [0.78, 0.5, 0.5, 0.25], [0.92, 0.3, 0.3, 0.36], [1, 0.12, 0.16, 0.4]],
  wing: { f: 0.33, z: 4.75, span: 28.63, c0: 3.6, c1: 3.4, dih: 0, t: 0.16, y0: 0.6 },
  tail: { f: 0.84, fz: 4.4, fh: 4.4, fc0: 4.0, fc1: 2.2, fsweep: 28, hs: 10.9, hc0: 2.4, hc1: 1.6, hz: 6.8, hf: 0.9 },
  twin: { f: 0.24, y: 4.9, z: 4.85, len: 5.0, d: 1.2, dia: 3.97, n: 4 }, gear: { type: 'retract', nf: 0.08, mf: 0.5, track: 5.3, nr: 0.35, mr: 0.45, mtop: 2.2 },
  reg: [0.5, 70, 0.6], regPre: 'F'
}); for (const sg of [1, -1]) { lathe(B, [[1.4, 0.05], [0.8, 0.45], [-0.8, 0.4], [-1.6, 0.05]], 'BELLY', { at: [-2.2, sg * 12.4, 3.2], rz: 0.8, segs: B.q ? 8 : 5 }); strut(B, [-2.2, sg * 12.4, 3.5], [-2.2, sg * 12.4, 4.7], 0.3, 'BODY'); } });
def('display', 'Display team jet', RARE, 11.17, 9.39, B => { paint(B, { BODY: '#c8202a', STRIPE: '#f2f2f0', FIN: '#c8202a' }); fighter(B, {
  // a two-seat jet trainer as a display team flies it: red, with a white band
  L: 11.17, W: 1.25, H: 1.45, zc: 1.8, body: 'STRIPE', top: 'BODY', und: 'BODY', wingCol: 'BODY', finCol: 'BODY', cockpit: 0.22, canL: 0.3,
  prof: [[0, 0, 0, -0.06], [0.05, 0.22, 0.24, -0.04], [0.14, 0.5, 0.52, 0], [0.26, 0.8, 0.8, 0.04], [0.4, 1, 0.9, 0.05], [0.58, 1, 0.84, 0.04], [0.76, 0.8, 0.7, 0.03], [0.92, 0.56, 0.52, 0.02], [1, 0.42, 0.42, 0.02]],
  side: 0.34, nozR: 0.3,
  wing: { x: -0.1, y0: 0.5, span: 9.39, c0: 2.9, c1: 1.1, sweep: 26, dih: 2, z: -0.3 },
  stab: { x: -3.9, y0: 0.4, span: 4.4, c0: 1.5, c1: 0.7, sweep: 30, dih: -10, z: 0 },
  fin: { x: -2.8, y: 0, h: 1.9, c0: 2.2, c1: 0.9, sweep: 45, z: 0.3 },
  gear: { nx: 3.4, nr: 0.23, mx: -0.6, track: 3.47, mr: 0.3 }
}); });
def('state', 'State aircraft', RARE, 70.66, 59.64, B => { paint(B, { BODY: '#a8c8e4', BELLY: '#f0f2f3', STRIPE: '#17305e', STRIPE2: '#c9a44a', FIN: '#f0f2f3', ENG: '#a8c8e4', DOOR: '#6f8aa4' }); airliner(B, {
  // the head of state's four-engine jet, with its upper deck
  L: 70.66, D: 6.5, H: 6.9, zc: 5.3, nose: 9.5, tail: 18.0, hump: 16,
  wing: { x: 7.6, span: 59.64, c0: 14.5, c1: 4.0, kink: { f: 0.3, c: 9 }, sweep: 38, dih: 7 },
  tail2: { hs: 22.2, hc0: 7.6, hc1: 2.6, hsweep: 38, fh: 11.5, fc0: 11.0, fc1: 3.4, fsweep: 45 },
  eng: [{ dx: 1.5, y: 12.1, z: 3.1, len: 6.2, d: 2.4 }, { dx: 1.5, y: 21.0, z: 4.2, len: 6.2, d: 2.4 }],
  gear: { nx: 25.5, nr: 0.62, mx: -3.2, track: 11, mr: 0.66, bogie: 2, body: -4 },
  win: { rows: [{ e: 34, front: 35.33 - 9.5 * 1.25, back: 35.33 - 15 }, { e: 74 }] }
}); });
def('fighter', 'Fighter', 'Our air wing', 15.0, 10.0, B => fighter(B, {
  L: 15.0, W: 1.9, H: 1.7, zc: 2.35, body: P.mgrey, top: P.mgrey, und: P.lgrey, radome: P.dgrey, cockpit: 0.3, canL: 0.24,
  prof: [[0, 0, 0, -0.08], [0.04, 0.16, 0.16, -0.06], [0.12, 0.32, 0.34, -0.03], [0.22, 0.46, 0.5, 0], [0.34, 0.66, 0.62, 0.04], [0.48, 1, 0.64, 0.04], [0.66, 1, 0.62, 0.03], [0.82, 0.78, 0.56, 0.02], [0.94, 0.52, 0.48, 0.01], [1, 0.44, 0.42, 0]],
  chin: true, lerx: 3.0,
  wing: { x: 1.5, y0: 0.8, span: 9.4, c0: 4.6, c1: 1.1, sweep: 40, z: -0.05 },
  stab: { x: -4.5, y0: 0.7, span: 5.6, c0: 2.4, c1: 0.9, sweep: 40, dih: -10, z: -0.05 },
  fin: { x: -3.1, y: 0, h: 3.0, c0: 3.4, c1: 1.2, sweep: 47, z: 0.3 },
  ventral: true, tipAam: true, stores: [[0.52, 2.9, 0.18]], nozR: 0.55,
  gear: { nx: 3.6, nr: 0.3, mx: -1.1, track: 2.4, mr: 0.38 }
}));
def('heavy', 'Large military aircraft', 'Our air wing', 46.6, 44.4, B => airliner(B, {
  L: 46.6, D: 3.8, H: 4.1, zc: 3.5, nose: 5.5, tail: 12.5, mil: true, body: P.lgrey, rotodome: 9.1, noWin: true,
  wing: { x: 6.2, span: 44.4, c0: 8.6, c1: 2.0, kink: { f: 0.3, c: 5.2 }, sweep: 35, dih: 7 },
  tail2: { hs: 13.8, hc0: 4.3, hc1: 1.5, hsweep: 37, fh: 7.4, fc0: 6.8, fc1: 2.4, fsweep: 40 },
  eng: [{ dx: 1.0, y: 7.4, z: 2.0, len: 5.0, d: 1.6 }, { dx: 1.0, y: 12.8, z: 2.7, len: 5.0, d: 1.6 }],
  gear: { nx: 16.0, nr: 0.44, mx: -0.8, track: 6.7, mr: 0.6, bogie: 2 }, wingCol: P.lgrey, hsCol: P.lgrey
}));
def('drone', 'Drone', 'Our air wing', 11.0, 20.0, B => {
  // a Reaper-class drone: bulbous nose with no windows, a long straight wing, a Y-tail, a pusher propeller
  slimBody(B, 11, 1.2, 1.6, P.lgrey, { nose: 2.6, tail: 3.6, bulge: 0.35 });
  wing(B, plan(0.8, 0, 1.6, 10, 1.3, 0.55, 3, 2, 0.14, 0.1), P.lgrey, { mirror: true });
  for (const sg of [1, -1]) wing(B, plan(-3.6, sg * 0.1, 1.75, 2.3, 1.2, 0.6, 30, 90 - sg * 45, 0.1, 0.08), P.lgrey, {});
  wing(B, plan(-3.8, 0, 1.3, 0.9, 1.0, 0.5, 30, -90, 0.1, 0.08), P.lgrey, {});
  prop(B, 'prop', -5.7, 0, 1.7, 2.4, 3, P.dgrey, { axis: [-1, 0, 0], spin: P.lgrey });
  lathe(B, [[0.3, 0.02], [0.25, 0.25], [-0.25, 0.25], [-0.3, 0.02]], P.dgrey, { at: [4.1, 0, 0.95], axis: 'z', segs: 10 });
  cyl(B, [4.1, 0, 0.72], 0.3, 0.18, P.glass, 'y', { segs: 8 });
  gearLeg(B, 'gearN', 4.3, 0, 1.1, 0.2, 1, {});
  for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', 0, sg * 1.1, 1.2, 0.26, 1, {});
  B.light(0.2, 10, 1.9, 'green'); B.light(0.2, -10, 1.9, 'red'); B.light(-5.4, 0, 2.2, 'white');
});
def('heli', 'Helicopter', 'Our air wing', 19.8, 16.4, B => heli(B, {
  L: 19.8, W: 2.4, H: 1.9, zc: 1.95, nose: 5.2, body: P.olive, under: P.olive,
  cabin: [[5.2, 0.12, 0.2, -0.2, 2], [4.9, 0.55, 0.62, -0.1, 2.4], [4.2, 0.9, 0.9, 0.05], [3.0, 1, 1, 0.1], [-1.0, 1, 1, 0.1], [-2.3, 0.8, 0.82, 0.25], [-3.0, 0.55, 0.55, 0.35]],
  glassF: (x, e) => x > 3.6 && e < 100 && e > 18,
  boom: [[-3.0, 0.5, 2.3], [-7.5, 0.32, 2.45], [-10.8, 0.22, 2.6]],
  finH: 2.6, stab: { x: 2.6, span: 4.4, z: 0.1 },
  eng: [[-0.2, 0.62, 3.0], [-0.2, -0.62, 3.0]],
  rx: 0.4, mast: 3.55, R: 8.18, blades: 4, chord: 0.53, tr: [-10.6, -0.35, 4.3], TR: 1.7, tblades: 4,
  wheels: [[2.9, 1.3, 0.4], [2.9, -1.3, 0.4], [-8.9, 0, 0.22]]
}));
// our missiles in flight
def('sam', 'Interceptor', 'Missiles', 5.3, 0.9, B => missileBody(B, [0, 0, 0], 5.3, 0.41, P.missile, { fins: 0.42, finC: 0.8, stripe: P.red, nose: P.lgrey, tailR: 0.95 }));
def('aam', 'Air-to-air missile', 'Missiles', 3.66, 0.63, B => missileBody(B, [0, 0, 0], 3.66, 0.18, P.missile, { fins: 0.22, finC: 0.36, mid: 0.2, midX: 0.55, midC: 0.5, nose: P.lgrey, stripe: P.orange }));
def('gbu', 'Guided bomb', 'Missiles', 3.8, 0.8, B => missileBody(B, [0, 0, 0], 3.8, 0.46, P.olive, { noseL: 1.0, fins: 0.32, finC: 0.55, finRot: Math.PI / 4, mid: 0.12, midX: 0.9, midC: 0.9, stripe: P.sand }));

// the enemy's tokens, by IC.THR key (airliners and light aircraft use the civil models above)
def('owa', 'One-way attack drone', 'Enemy weapons', 3.5, 2.5, B => {
  // a delta with fins at the wingtips and a pusher propeller
  slimBody(B, 3.5, 0.45, 0.6, P.enemy, { nose: 0.7, tail: 0.3 });
  wing(B, [{ x: 1.0, y: 0, z: 0.55, c: 2.7, t: 0.06 }, { x: -1.2, y: 1.25, z: 0.55, c: 0.5, t: 0.06 }], P.enemy, { mirror: true });
  for (const sg of [1, -1]) wing(B, [{ x: -1.1, y: sg * 1.25, z: 0.25, c: 0.6, t: 0.05 }, { x: -1.35, y: sg * 1.25, z: 0.95, c: 0.35, t: 0.05 }], P.enemy2, { thick: [0, 1, 0] });
  prop(B, 'prop', -1.85, 0, 0.6, 0.75, 2, P.dark, { axis: [-1, 0, 0], spin: P.enemy2 });
});
def('jdr', 'Jet attack drone', 'Enemy weapons', 3.5, 3.0, B => {
  slimBody(B, 3.5, 0.5, 0.6, P.enemy2, { nose: 0.8, tail: 0.4 });
  wing(B, [{ x: 0.9, y: 0, z: 0.55, c: 2.5, t: 0.06 }, { x: -1.1, y: 1.5, z: 0.55, c: 0.5, t: 0.06 }], P.enemy2, { mirror: true });
  for (const sg of [1, -1]) wing(B, [{ x: -1.0, y: sg * 1.5, z: 0.3, c: 0.55, t: 0.05 }, { x: -1.25, y: sg * 1.5, z: 0.95, c: 0.3, t: 0.05 }], P.enemy, { thick: [0, 1, 0] });
  lathe(B, [[0.8, 0.14], [0.6, 0.2], [-0.6, 0.19], [-0.8, 0.15]], P.dgrey, { at: [-0.9, 0, 0.92], cap0: P.intake, cap1: P.nozzle });
});
def('lm', 'Loitering munition', 'Enemy weapons', 1.65, 1.0, B => {
  // two cruciform sets of wings, front and back, on a slim body
  missileBody(B, [0, 0, 0.5], 1.65, 0.23, P.enemy, { noseL: 0.3, nose: P.warhead });
  for (const [x, sp] of [[0.4, 0.5], [-0.35, 0.5]]) for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; B.with(p => { const yy = p[1], zz = p[2] - 0.5; return [p[0], yy * Math.cos(a) - zz * Math.sin(a), 0.5 + yy * Math.sin(a) + zz * Math.cos(a)]; }, () => wing(B, plan(x, 0.1, 0.5, sp, 0.22, 0.2, 0, 0, 0.06, 0.06), P.enemy2, { foil: FOIL.flat })); }
  prop(B, 'prop', -0.9, 0, 0.5, 0.35, 2, P.dark, { axis: [-1, 0, 0], spin: P.enemy });
});
def('isr', 'Reconnaissance drone', 'Enemy weapons', 9.0, 16.6, B => {
  // twin booms and twin fins, a pusher propeller between them
  slimBody(B, 6.6, 0.95, 1.5, P.enemy, { nose: 1.6, tail: 1.2, bulge: 0.15 });
  wing(B, plan(1.0, 0, 1.75, 8.3, 1.2, 0.6, 2, 2, 0.14, 0.1), P.enemy, { mirror: true });
  for (const sg of [1, -1]) { lathe(B, [[1.0, 0.05], [0.5, 0.13], [-4.8, 0.1], [-5.0, 0.05]], P.enemy, { at: [0, sg * 2.0, 1.75], segs: 6 }); wing(B, plan(-4.2, sg * 2.0, 1.8, 1.1, 1.0, 0.6, 30, 90, 0.1, 0.1), P.enemy2, {}); }
  wing(B, [{ x: -4.3, y: 0, z: 2.6, c: 0.8, t: 0.1 }, { x: -4.3, y: 2.0, z: 2.6, c: 0.8, t: 0.1 }], P.enemy2, { mirror: true });
  prop(B, 'prop', -3.45, 0, 1.55, 1.8, 2, P.dark, { axis: [-1, 0, 0], spin: P.enemy });
  lathe(B, [[0.22, 0.02], [0.2, 0.2], [-0.2, 0.2], [-0.22, 0.02]], P.dgrey, { at: [2.0, 0, 0.95], axis: 'z', segs: 8 });
  gearLeg(B, 'gearN', 2.3, 0, 1.05, 0.2, 1, {}); for (const sg of [1, -1]) gearLeg(B, sg > 0 ? 'gearR' : 'gearL', 0.2, sg * 0.9, 1.2, 0.24, 1, {});
});
def('cm', 'Cruise missile', 'Enemy weapons', 6.2, 2.6, B => missileBody(B, [0, 0, 0], 6.2, 0.52, P.enemy, { noseL: 0.9, nose: P.warhead, wings: 2.6, wingX: 0.6, wingC: 0.55, wingSw: 5, fins: 0.4, finC: 0.5, finRot: Math.PI / 4, intake: true }));
def('scm', 'Supersonic cruise missile', 'Enemy weapons', 8.4, 1.7, B => { missileBody(B, [0, 0, 0], 8.4, 0.67, P.enemy2, { noseL: 1.6, mid: 0.52, midX: 1.2, midC: 1.3, fins: 0.45, finC: 0.8, finRot: Math.PI / 4 }); lathe(B, [[0.3, 0.02], [0, 0.16]], P.dgrey, { at: [4.3, 0, 0], cap1: P.intake }); });
def('glb', 'Glide bomb', 'Enemy weapons', 3.5, 2.6, B => { missileBody(B, [0, 0, 0], 3.5, 0.45, P.olive, { noseL: 0.9, fins: 0.3, finC: 0.5, finRot: Math.PI / 4 }); wing(B, plan(0.5, 0, 0.3, 1.3, 0.45, 0.35, 2, 3, 0.08, 0.08), P.dgrey, { mirror: true }); });
def('bm', 'Ballistic missile', 'Enemy weapons', 7.3, 1.9, B => missileBody(B, [0, 0, 0], 7.3, 0.92, P.enemy, { noseL: 2.4, nose: P.warhead, fins: 0.45, finC: 0.9, finSw: 20, tailR: 1 }));
def('hgv', 'Hypersonic glide vehicle', 'Enemy weapons', 5.5, 2.2, B => {
  // a flat wedge with a sharp nose and two small tail fins
  const st = [{ x: 2.75, w: 0.02, h: 0.02, z: 0.4 }, { x: 1.5, w: 0.4, h: 0.18, z: 0.4, n: 3 }, { x: -1, w: 0.9, h: 0.3, z: 0.4, n: 3 }, { x: -2.75, w: 1.1, h: 0.35, z: 0.42, n: 3 }];
  st.sort((a, b) => a.x - b.x);
  loft(B, st, ANG.mid, (x, a) => (a > 90 && a < 270 ? P.warhead : P.enemy2), { cap0: P.nozzle, smooth: false });
  for (const sg of [1, -1]) wing(B, plan(-1.8, sg * 0.95, 0.65, 0.6, 0.9, 0.4, 45, 90 - sg * 20, 0.06, 0.06), P.enemy2, {});
});
def('rkt', 'Guided rocket', 'Enemy weapons', 3.9, 0.6, B => missileBody(B, [0, 0, 0], 3.9, 0.23, P.enemy, { fins: 0.2, finC: 0.3, finRot: Math.PI / 4, mid: 0.08, midX: 1.3, midC: 0.25, nose: P.warhead }));
def('arm', 'Anti-radiation missile', 'Enemy weapons', 4.2, 1.1, B => missileBody(B, [0, 0, 0], 4.2, 0.25, P.enemy, { mid: 0.36, midX: 0.6, midC: 0.9, fins: 0.3, finC: 0.35, nose: P.lgrey }));
def('dcy', 'Air-launched decoy', 'Enemy weapons', 2.8, 1.7, B => { missileBody(B, [0, 0, 0], 2.8, 0.3, P.enemy, { fins: 0.25, finC: 0.3, finRot: Math.PI / 4 }); wing(B, plan(0.2, 0, 0.1, 0.85, 0.3, 0.22, 25, 0, 0.08, 0.08), P.enemy2, { mirror: true }); });
def('ahe', 'Attack helicopter', 'Enemy weapons', 17.0, 17.2, B => heli(B, {
  L: 17.0, W: 1.9, H: 2.2, zc: 2.0, nose: 5.6, body: P.enemy2, under: P.enemy,
  cabin: [[5.6, 0.1, 0.16, -0.5, 2], [5.3, 0.5, 0.5, -0.3, 2.4], [4.5, 0.8, 0.8, -0.15], [3.2, 0.95, 1.05, 0.1], [0.3, 1, 1.1, 0.2], [-1.6, 0.85, 0.9, 0.3], [-2.6, 0.55, 0.55, 0.45]],
  glassF: (x, e) => (x > 4.0 && x < 5.3 && e < 78 && e > 14) || (x > 2.4 && x < 3.8 && e < 50),
  boom: [[-2.6, 0.45, 2.45], [-7.0, 0.3, 2.6], [-10.2, 0.22, 2.75]],
  finH: 2.8, stab: { x: 2.4, span: 3.0, z: 0.3 },
  eng: [[0.3, 0.75, 3.1], [0.3, -0.75, 3.1]],
  rx: 0.0, mast: 3.8, R: 8.6, blades: 5, chord: 0.6, tr: [-10.0, -0.3, 4.4], TR: 1.9, tblades: 4,
  wheels: [[3.4, 1.1, 0.4], [3.4, -1.1, 0.4], [-9.4, 0, 0.25]], stubs: { x: 0.4, z: 1.9, span: 1.9 }, gun: true
}));
def('ftr_e', 'Fighter', 'Enemy weapons', 21.9, 14.7, B => fighter(B, {
  L: 21.9, W: 1.8, H: 1.9, zc: 2.7, body: P.camo2, top: P.camo1, und: P.lgrey, radome: P.lgrey, cockpit: 0.23, canL: 0.17,
  prof: [[0, 0, 0, -0.14], [0.04, 0.2, 0.2, -0.12], [0.1, 0.36, 0.36, -0.08], [0.18, 0.5, 0.5, -0.02], [0.28, 0.66, 0.6, 0.04], [0.4, 1.2, 0.58, 0.05], [0.56, 1.8, 0.4, 0.04], [0.72, 1.7, 0.34, 0.03], [0.86, 0.9, 0.3, 0.04], [0.96, 0.4, 0.26, 0.04], [1, 0.25, 0.2, 0.04]],
  nacelles: true, lerx: 5.5, twinEng: true, nozY: 0.72, nozZ: -0.3, nozR: 0.6, stinger: true,
  wing: { x: 1.1, y0: 1.2, span: 14.7, c0: 5.4, c1: 1.3, sweep: 42, z: 0.05 },
  stab: { x: -6.8, y0: 1.9, span: 9.9, c0: 2.9, c1: 1.2, sweep: 42, z: -0.1 },
  fin: { twin: true, x: -5.0, y: 2.1, h: 3.3, c0: 3.6, c1: 1.3, sweep: 40, cant: 0, z: 0.1 },
  tipAam: true, stores: [[0.36, 4.0, 0.23], [0.56, 3.6, 0.2]],
  gear: { nx: 6.2, nr: 0.34, mx: -1.8, track: 4.3, mr: 0.52 }
}));
def('str', 'Strike aircraft', 'Enemy weapons', 22.5, 14.0, B => fighter(B, {
  L: 22.5, W: 2.9, H: 2.1, zc: 2.8, body: P.enemy, top: P.olive, und: P.lgrey, radome: P.dgrey, cockpit: 0.22, canL: 0.14, canW: 2.2, boxy: true,
  prof: [[0, 0, 0, -0.08], [0.05, 0.22, 0.22, -0.06], [0.14, 0.44, 0.44, -0.02], [0.24, 0.62, 0.62, 0.02], [0.36, 0.86, 0.66, 0.02], [0.5, 1, 0.64, 0.02], [0.7, 1, 0.6, 0.02], [0.88, 0.9, 0.56, 0.02], [1, 0.8, 0.46, 0.02]],
  side: 0.32, twinEng: true, nozY: 0.24, nozR: 0.52,
  wing: { x: 1.8, y0: 1.2, span: 14.0, c0: 4.2, c1: 1.4, sweep: 45, z: 0.35 },
  stab: { x: -7.0, y0: 1.2, span: 8.0, c0: 3.2, c1: 1.2, sweep: 42, z: 0 },
  fin: { x: -5.4, y: 0, h: 4.5, c0: 4.6, c1: 1.6, sweep: 50, z: 0.3 },
  stores: [[0.3, 4.2, 0.3], [0.5, 3.4, 0.4]],
  gear: { nx: 6.8, nr: 0.35, mx: -1.8, track: 3.3, mr: 0.52 }
}));
def('ewj', 'Stand-off jammer', 'Enemy weapons', 22.0, 20.0, B => { airliner(B, {
  L: 22, D: 2.4, H: 2.5, zc: 2.1, nose: 3.2, tail: 7.0, mil: true, body: P.enemy, noWin: true,
  wing: { x: 1.8, span: 20, c0: 3.8, c1: 1.2, sweep: 28, dih: 4, z: -0.3, fairing: false },
  tail2: { hs: 7.2, hc0: 2.2, hc1: 1.0, hsweep: 32, fh: 3.4, fc0: 3.4, fc1: 1.8, fsweep: 45, t: true },
  eng: [{ x: -5.4, y: 2.0, z: 2.8, len: 3.6, d: 1.3, tail: true }],
  gear: { nx: 8.4, nr: 0.3, mx: -0.6, track: 3.4, mr: 0.4 }, winglet: 1.3, wingletCol: P.enemy2, wingCol: P.enemy, hsCol: P.enemy, canoes: false
}); lathe(B, [[3.4, 0.1], [2.8, 0.55], [-3.4, 0.55], [-3.8, 0.1]], P.enemy2, { at: [1.5, 0, 0.8], ry: 1, rz: 0.7, segs: 8 }); for (const sg of [1, -1]) lathe(B, [[1.2, 0.05], [0.8, 0.28], [-1.2, 0.28], [-1.4, 0.05]], P.enemy2, { at: [-4.2, sg * 10.1, 2.2], segs: 8 }); });
def('esj', 'Escort jammer drone', 'Enemy weapons', 4.0, 2.6, B => { slimBody(B, 4.0, 0.42, 0.6, P.enemy, { nose: 0.8, tail: 0.6 }); wing(B, plan(0.4, 0, 0.55, 1.3, 0.8, 0.35, 35, 0, 0.08, 0.06), P.enemy2, { mirror: true }); for (const sg of [1, -1]) wing(B, plan(-1.3, sg * 0.15, 0.75, 0.5, 0.5, 0.25, 40, 90 - sg * 35, 0.06, 0.06), P.enemy2, {}); lathe(B, [[0.5, 0.1], [0.3, 0.14], [-0.3, 0.12]], P.dgrey, { at: [-0.4, 0, 0.82], cap0: P.intake }); });
def('bmr', 'Missile-carrier bomber', 'Enemy weapons', 46.2, 50.1, B => { airliner(B, {
  L: 46.2, D: 2.9, H: 3.1, zc: 3.6, nose: 5.2, tail: 11.5, mil: true, body: P.lgrey, noWin: true, glass: true, probe: 3.2,
  wing: { x: 4.2, span: 50.1, c0: 7.2, c1: 2.4, sweep: 35, dih: -2, z: 0.2, fairing: false },
  tail2: { hs: 14.8, hc0: 4.4, hc1: 1.6, hsweep: 40, fh: 7.4, fc0: 7.2, fc1: 2.4, fsweep: 45 },
  eng: [{ dx: 1.2, y: 7.6, z: 4.0, len: 6.2, d: 1.6, prop: 5.6, blades: 4, contra: true, spin: P.lgrey }, { dx: 1.2, y: 15.4, z: 3.9, len: 5.8, d: 1.5, prop: 5.6, blades: 4, contra: true, spin: P.lgrey }],
  gear: { nx: 16.5, nr: 0.5, mx: -0.2, track: 12.5, mr: 0.7, bogie: 2, mtop: 3.4 }, wingCol: P.lgrey, hsCol: P.lgrey, canoes: false
}); for (const sg of [1, -1]) for (const y of [11.2, 18.6]) missileBody(B, [-2 - y * 0.3, sg * y, 2.3], 6.0, 0.6, P.enemy2, { fins: 0.35, finC: 0.5, finRot: Math.PI / 4 }); });

// our launchers and radars, by IC.UNITS key
def('acou', 'Whisper', 'Our units', 6, 6, B => { hut(B, 2, 2, 1.6, P.tan); cyl(B, [0, 0, 3.5], 3.4, 0.08, P.dark, 'z', { segs: 5 }); part(B, ['sphere', 0, 0, 5.4, 0.8, 0.8, 0.8, P.radar]); });
def('ssr', 'Beacon', 'Our units', 8, 8, B => { hut(B, 4, 5, 3, P.concrete); antenna(B, 0, 6, 7, 1.2, P.radar, -0.3); });
def('vhf', 'Longwave', 'Our units', 12, 14, B => { lorry(B, 10, 2.6, 3, G, { bed: 1.6 }); cyl(B, [-2.5, 0, 6], 4, 0.15, P.dark, 'z', { segs: 6 }); B.group('radar', { kind: 'radar', pivot: [-2.5, 0, 8.5], axis: [0, 0, 1] }); box(B, -2.5, 0, 8.5, 0.5, 13, 3, P.radar); for (let i = -2; i <= 2; i++) box(B, -2.1, i * 2.6, 8.5, 0.3, 0.15, 3.2, P.dgrey); B.group('main'); });
def('lr3d', 'Sentinel', 'Our units', 12, 9, B => { lorry(B, 11, 2.8, 4, G, { bed: 1.8 }); antenna(B, -2.5, 4.5, 8, 4, P.radar, -0.35); });
def('mr3d', 'Kestrel', 'Our units', 9, 6, B => { lorry(B, 9, 2.5, 3, G, { bed: 1.6 }); antenna(B, -2.2, 4, 5, 2.6, P.radar, -0.3); });
def('gf', 'Lowwatch', 'Our units', 8, 4, B => { lorry(B, 8, 2.5, 3, G, { bed: 1.6 }); cyl(B, [-2, 0, 9], 12, 0.18, P.dark, 'z', { segs: 6 }); B.group('radar', { kind: 'radar', pivot: [-2, 0, 15.6], axis: [0, 0, 1] }); box(B, -2, 0, 15.6, 0.4, 3, 1.2, P.radar); B.group('main'); });
def('esm', 'Harker', 'Our units', 9, 4, B => { shelterTruck(B, G, 9); cyl(B, [-3, 0.6, 12.8], 0.4, 1.2, P.radar, 'z'); });
def('pcl', 'Echo', 'Our units', 9, 4, B => { shelterTruck(B, G, 6); box(B, -3, 0.6, 9.6, 0.3, 4, 1.6, P.radar); });
def('cbr', 'Backtrack', 'Our units', 8, 4, B => { lorry(B, 8, 2.5, 3, G, { bed: 1.4 }); antenna(B, -2, 3.6, 3.6, 2.4, P.radar, -0.5, false); });
def('aero', 'Skyhook', 'Our units', 14, 12, B => { lorry(B, 10, 2.6, 3, G, { bed: 1.4 }); cyl(B, [-2, 0, 3.4], 1, 1.2, P.dark, 'z'); cyl(B, [-2, 0, 18], 28, 0.04, P.steel, 'z', { segs: 4 }); part(B, ['sphere', -2, 0, 34, 14, 10, 8, P.white]); wing(B, plan(-8, 0, 34, 3, 2.5, 1.6, 30, 90, 0.1, 0.1), P.white, {}); });
def('bmd', 'Farsight', 'Our units', 16, 16, B => { hut(B, 10, 10, 5, P.concrete); box(B, 0, 0, 10, 8, 9, 10, P.radar, { pitch: -0.5 }); });
def('manpads', 'Nettle', 'Our units', 3, 3, PS([['box', 0, -0.5, 0.9, 0.5, 0.5, 1.8, G2], ['box', 0.2, 0.5, 0.9, 0.5, 0.5, 1.8, G2], ['cyl', 0.2, -0.5, 1.8, 1.7, 0.16, 0.16, G, { pitch: 0.5 }], ['box', -1.5, 0, 0.5, 1.2, 1, 1, P.tan]]));
def('spaag', 'Buzzsaw', 'Our units', 8, 3.3, B => { hull(B, 7.5, 3.2, G); B.group('radar', { kind: 'turret', pivot: [-0.5, 0, 2], axis: [0, 0, 1] }); turret(B, -0.5, 2, 2.4, G, 2, 3.5); box(B, -1.6, 0, 3.4, 0.3, 1.6, 1, P.radar, { pitch: -0.4 }); B.group('main'); });
def('cram', 'Hailstorm', 'Our units', 6, 4, B => { box(B, 0, 0, 0.3, 6, 4, 0.6, P.concrete); cyl(B, [-0.5, 0, 1.6], 2, 1, P.white, 'z'); B.group('radar', { kind: 'turret', pivot: [-0.5, 0, 2.6], axis: [0, 0, 1] }); part(B, ['cyl', 1.2, 0, 2.5, 2.6, 0.45, 0.45, P.black, { pitch: 0.7 }]); part(B, ['sphere', -0.5, 0, 3.4, 1.8, 1.8, 1.4, P.white]); B.group('main'); });
def('shorad', 'Vixen', 'Our units', 9, 3.3, B => { hull(B, 8.5, 3.2, G); turret(B, -0.3, 2, 2.2, G, 0); canisters(B, -0.3, 3.2, 4, 3, 0.4, P.canvas, 0.6, 0.55); antenna(B, -1.2, 3.4, 1.4, 1, P.radar, -0.4); });
def('vshorad', 'Thistle', 'Our units', 6, 2.5, B => { lorry(B, 5.5, 2.2, 2, G, { cabL: 1.8, bed: 0.8 }); turret(B, -1.5, 1.8, 1.2, G, 0); canisters(B, -1.5, 2.6, 4, 1.8, 0.2, P.canvas, 0.5, 0.3); part(B, ['sphere', -1.5, 0, 3.2, 0.7, 0.7, 0.5, P.radar]); });
def('mrsam', 'Aegir', 'Our units', 12, 3, B => tel(B, 4, 5.5, 0.55, G, { pitch: 1.1 }));
def('mrmob', 'Rover', 'Our units', 10, 3.3, B => { hull(B, 9, 3.2, G); canisters(B, -1.5, 3, 4, 4.5, 0.45, P.canvas, 0.9, 0.55); antenna(B, 2.5, 2.6, 1.6, 1.2, P.radar, -0.4, false); });
def('lrsam', 'Bastion', 'Our units', 13, 3, B => tel(B, 4, 7.5, 0.75, G, { pitch: 1.35, len: 13 }));
def('hatd', 'Highwall', 'Our units', 13, 3, B => tel(B, 8, 6.5, 0.5, G, { pitch: 0.55, len: 13, gap: 0.62 }));
def('exo', 'Zenith', 'Our units', 10, 10, B => { box(B, 0, 0, 0.3, 10, 10, 0.6, P.concrete); canisters(B, 0, 2, 4, 9, 1.1, P.steel, 1.5, 1.6); });
def('dgun', 'Rattler', 'Our units', 6, 2.4, B => { lorry(B, 5.8, 2.3, 2, G, { cabL: 1.8, bed: 0.6 }); B.group('radar', { kind: 'turret', pivot: [-1.6, 0, 1.7], axis: [0, 0, 1] }); turret(B, -1.6, 1.7, 1.4, G2, 1, 2.2); box(B, -2.4, 0, 3, 0.2, 1, 0.8, P.radar, { pitch: -0.3 }); B.group('main'); });
def('idl', 'Swift', 'Our units', 8, 3, B => { lorry(B, 8, 2.5, 3, G, { bed: 1.6 }); box(B, -2.2, 0, 3.9, 3, 2.2, 1.2, G2); for (const y of [0.8, 0, -0.8]) box(B, -2.2, y, 4.7, 1, 0.5, 0.4, P.dark); });
def('cp', 'Keystone', 'Our units', 9, 4, B => { shelterTruck(B, G, 7); box(B, 1, 0, 3.6, 2, 2.5, 0.2, P.tan); cyl(B, [-3, 0.6, 10.4], 0.2, 1.4, P.radar, 'z'); });
def('laser', 'Sunspear', 'Our units', 8, 6, B => { box(B, 0, 0, 0.3, 8, 6, 0.6, P.concrete); box(B, -1, 0, 1.6, 5, 4, 2, P.tan); B.group('radar', { kind: 'turret', pivot: [0.5, 0, 2.6], axis: [0, 0, 1] }); turret(B, 0.5, 2.6, 2, P.steel, 0); box(B, 0.9, 0, 3.6, 1.4, 1.2, 1, P.white, { pitch: 0.6 }); part(B, ['cyl', 1.6, 0, 3.9, 0.6, 0.7, 0.7, P.glass, { pitch: 0.6 }]); B.group('main'); });
def('mlaser', 'Glint', 'Our units', 9, 3.3, B => { hull(B, 8.5, 3.2, G); B.group('radar', { kind: 'turret', pivot: [-0.5, 0, 2], axis: [0, 0, 1] }); turret(B, -0.5, 2, 2, G2, 0); box(B, -0.3, 0, 3.4, 1.2, 1.1, 1, P.white, { pitch: 0.6 }); part(B, ['cyl', 0.3, 0, 3.7, 0.5, 0.6, 0.6, P.glass, { pitch: 0.6 }]); B.group('main'); });
def('hpm', 'Static', 'Our units', 9, 5, B => { box(B, 0, 0, 0.3, 9, 5, 0.6, P.concrete); box(B, -2, 0, 1.6, 4, 3, 2, P.tan); cyl(B, [1, 0, 2.6], 2.4, 0.25, P.dark, 'z'); box(B, 1.4, 0, 4.4, 0.8, 4.4, 3.4, P.radar, { pitch: -0.3 }); });
def('gnss', 'Mirage', 'Our units', 9, 4, B => { shelterTruck(B, G, 8); box(B, -3, 0.6, 11.4, 0.6, 2.4, 0.5, P.radar); cyl(B, [-3, -0.6, 10], 1.6, 0.15, P.radar, 'z'); });
def('decoy', 'Phantom', 'Our units', 9, 4, B => { lorry(B, 7, 2.5, 2, P.tan, { bed: 1.8 }); antenna(B, -1.8, 3.6, 5, 2.6, P.tan, -0.3); });
def('mlrs', 'Rainmaker', 'Our units', 8, 3, B => { hull(B, 7.5, 3, G); B.group('launch', { kind: 'launch', pivot: [-3, 0, 2.4], axis: [0, -1, 0], up: 0.7 }); box(B, -1, 0, 2.9, 4.2, 2.6, 1.6, G2, { col: [P.dark] }); B.group('main'); });
def('glcm', 'Harrow', 'Our units', 12, 3, B => tel(B, 4, 6.5, 0.6, G, { pitch: 0.9, can: G2 }));
def('tbml', 'Spire', 'Our units', 13, 3, B => tel(B, 1, 9, 1, G, { pitch: 1.45, len: 13, can: P.steel }));
def('depot', 'Forward Depot', 'Our units', 22, 16, PS([['box', 0, 0, 0.1, 22, 16, 0.2, P.concrete], ['box', -5, -4, 1.4, 6, 2.5, 2.6, P.canvas], ['box', -5, 0, 1.4, 6, 2.5, 2.6, P.canvas], ['box', -5, 4, 1.4, 6, 2.5, 2.6, P.canvas], ['box', 4, -3, 1.6, 10, 5, 3.2, P.tan], ['box', 5, 4, 0.9, 6, 3, 1.4, G2]]));
def('heliport', 'Forward Heliport', 'Our units', 24, 22, PS([['cyl', 0, 0, 0.1, 0, 22, 0, P.concrete, { axis: 'z', len: 0.2 }], ['box', 0, 0, 0.25, 8, 1.2, 0.1, P.white], ['box', 0, 0, 0.25, 1.2, 6, 0.1, P.white], ['box', 12, 0, 1.4, 5, 4, 2.6, P.tan], ['cyl', 12, 3, 1, 0, 1.6, 0, P.fuel, { axis: 'z', len: 2 }]]));

// lorries on the roads
def('truck', 'Lorry', 'Vehicles', 10, 2.5, B => lorry(B, 10, 2.5, 3, G, { bed: 2.2, bedCol: P.canvas, tilt: true }));
def('tanker', 'Fuel lorry', 'Vehicles', 10, 2.5, B => { lorry(B, 10, 2.5, 3, P.fuel, { cabL: 2.3 }); lathe(B, [[-3.2, 0.9], [-3.3, 1.05], [3.1, 1.05], [3.2, 0.9]], P.fuel, { at: [-1.5, 0, 2.3], rz: 0.95, cap0: P.fuel, cap1: P.fuel }); });
def('car', 'Car', 'Vehicles', 4.5, 1.8, B => { box(B, 0, 0, 0.7, 4.5, 1.8, 0.6, P.grey); box(B, -0.2, 0, 1.25, 2.2, 1.6, 0.5, P.glass, { top: [0.8, 0.9] }); for (const [x, y] of [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]]) cyl(B, [x, y, 0.32], 0.25, 0.32, P.rubber, 'y', { segs: 8 }); });

def('bowser', 'Fuel bowser', 'Vehicles', 6.4, 2.3, B => { lorry(B, 6.4, 2.3, 2, '#e8c33a', { cabL: 1.9, cabH: 1.7, h: 0.8, r: 0.45 }); lathe(B, [[-1.9, 0.72], [-2.0, 0.85], [1.7, 0.85], [1.8, 0.72]], P.fuel, { at: [-1.0, 0, 1.95], rz: 0.9, cap0: P.fuel, cap1: P.fuel }); box(B, -3.1, 0, 1.5, 0.3, 1.6, 0.9, P.dgrey); });
def('person', 'Person', 'Vehicles', 0.5, 0.5, B => {
  // someone walking out to an aircraft: legs, a jacket, a head; colours from the livery slots so people differ
  for (const y of [-0.1, 0.1]) box(B, 0, y, 0.43, 0.16, 0.14, 0.86, P.navy);
  box(B, 0, 0, 1.2, 0.26, 0.42, 0.66, 'STRIPE', { top: [0.9, 0.85] });
  for (const y of [-0.26, 0.26]) box(B, 0, y, 1.18, 0.12, 0.1, 0.6, 'STRIPE');
  lathe(B, [[-0.12, 0.02], [-0.08, 0.1], [0.06, 0.11], [0.12, 0.02]], '#d2a888', { at: [0, 0, 1.64], axis: 'z', segs: B.q ? 8 : 5 });
});
// a flying club's buildings, in the field's own frame (x along the runway): clubhouse, hangar, fuel pump, windsock
def('fieldkit', 'Flying club', 'Airfield', 60, 30, B => {
  box(B, 0, 0, 0.03, 60, 14, 0.06, '#8a8e84');
  box(B, 6, 13, 1.6, 12, 7, 3.2, '#d8d2c2'); box(B, 6, 13, 3.6, 12.6, 7.6, 0.8, '#7a4a3a', { top: [1, 0.2] });
  for (let i = 0; i < 4; i++) box(B, 1.8 + i * 2.8, 9.45, 1.9, 1.6, 0.06, 1.1, P.glass);
  box(B, -16, 16, 3.2, 22, 16, 6.4, '#9aa2a8', { top: [1, 0.55] }); box(B, -16, 7.95, 2.6, 18, 0.08, 5.0, '#6f777e');
  cyl(B, [22, 6, 1.0], 2.0, 0.5, P.fuel, 'z'); box(B, 22, 8, 0.9, 0.6, 0.4, 1.8, '#c8323c');
  cyl(B, [28, 10, 3.0], 6.0, 0.05, P.lgrey, 'z', { segs: 4 }); lathe(B, [[0, 0.45], [-2.4, 0.2]], '#ff7a1a', { at: [27.9, 10, 5.7], segs: 6, cap0: '#ff7a1a' });
});
def('fbo', 'Business terminal', 'Airfield', 36, 18, B => {
  // the business-aviation terminal: a low glass front to the apron, a flat roof, a canopy over the door, cars behind
  box(B, 0, 0, 2.6, 34, 14, 5.2, '#d9dcd8'); box(B, 0, 0, 5.4, 35, 15, 0.4, '#50565c');
  box(B, 0, 7.05, 2.4, 30, 0.1, 3.4, P.glass); box(B, 0, 9, 4.2, 8, 4, 0.3, '#50565c');
  for (const x of [-3.6, 3.6]) cyl(B, [x, 10.6, 2.1], 4.2, 0.12, P.lgrey, 'z', { segs: 5 });
  for (let i = 0; i < 4; i++) box(B, -12 + i * 6, -11, 0.7, 4.4, 1.8, 1.3, ['#2a3a5a', '#8a1c22', '#c8ccd0', '#1a1c1e'][i]);
});
def('helipad', 'Helicopter pad', 'Airfield', 22, 22, B => {
  lathe(B, [[0, 11], [0.08, 11]], '#9a9e98', { at: [0, 0, 0], axis: 'z', segs: B.q ? 20 : 10, cap1: '#9a9e98' });
  lathe(B, [[0.08, 9.4], [0.1, 9.4], [0.1, 8.8], [0.08, 8.8]], '#f0f0ee', { at: [0, 0, 0], axis: 'z', segs: B.q ? 20 : 10 });
  for (const y of [-2.2, 2.2]) box(B, 0, y, 0.1, 6.5, 0.9, 0.04, '#f0f0ee'); box(B, 0, 0, 0.1, 0.9, 4.4, 0.04, '#f0f0ee');
});

// the real aircraft's height, metres (the gallery checks the models against length, span and height)
const REAL_H = { light: 2.72, tourer: 2.22, retract: 2.62, twin: 2.97, taildrag: 2.62, utility: 4.71, helil: 3.28, helim: 4.95, glider: 1.55, micro: 3.5, rj: 9.73, widel: 18.5, jumbo: 24.09, cargoprop: 9.64, vlj: 4.35, bizjet: 6.1, bizlong: 7.82, bizprop: 4.37, vintage: 7.54, sst: 12.2, outsize: 18.9, airship: 17.4, amphib: 8.98, display: 3.98, state: 19.33, turbo: 7.65, narrow: 11.76, wide: 18.5, cargo: 19.4, fighter: 5.1, heavy: 12.6, drone: 3.8, heli: 5.1, ahe: 3.8, ftr_e: 5.9, str: 6.2, ewj: 6.3, bmr: 13.3, isr: 2.9 };
for (const k in REAL_H) M[k].h = REAL_H[k];
IC.MODELS = M;
IC.MODEL_GROUPS = ['Civil aircraft', 'Business aviation', 'General aviation', 'Rare visitors', 'Our air wing', 'Missiles', 'Enemy weapons', 'Our units', 'Vehicles'];

/* ---------- a model as arrays: IC.modelMesh(key, q) ----------
   { groups: { name: { pos, nor (Float32Array, metres), col (Uint8Array slot per vertex), kind, pivot, axis, up } },
     slots (the colour of each slot index), lights [{ x, y, z, kind }], tris, box [x0, y0, z0, x1, y1, z1] } */
const meshCache = new Map();
IC.modelMesh = function (key, q) {
  q = q ? 1 : 0;
  const ck = key + '|' + q;
  let m = meshCache.get(ck); if (m) return m;
  const d = M[key] || M.cm, B = Builder(q);
  d.build(B);
  m = finish(B, d.key);
  meshCache.set(ck, m);
  return m;
};
/* a builder's groups as arrays, with the bounding box */
function finish(B, key) {
  const groups = {}, box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const k in B.groups) {
    const g = B.groups[k]; if (!g.pos.length) continue;
    groups[k] = { pos: Float32Array.from(g.pos), nor: Float32Array.from(g.nor), col: Uint8Array.from(g.col), kind: g.kind || 'main', pivot: g.pivot || [0, 0, 0], axis: g.axis || [0, 0, 1], up: g.up || 0, rpm: g.rpm || 1, R: g.R || 0 };
    for (let i = 0; i < g.pos.length; i += 3) for (let a = 0; a < 3; a++) { box[a] = Math.min(box[a], g.pos[i + a]); box[a + 3] = Math.max(box[a + 3], g.pos[i + a]); }
  }
  return { key, groups, slots: B.slots, lights: B.lights, tris: B.tris, box };
}
/* the builder, for other meshes made the same way (the 3D view's airport buildings): IC.MB.Builder(q), its shapes,
   and IC.MB.finish(B) for the arrays */
IC.MB = { Builder, finish, box, lathe, cyl, loft, wing, plan, plate, around, P };
/* what a model has that moves: its gear, flaps, rotors, propellers, radar, launcher, afterburner */
IC.modelMoves = key => { const m = IC.modelMesh(key, 1), out = {}; for (const k in m.groups) out[m.groups[k].kind] = true; return out; };

/* an airline's colours for the slots, from its livery [primary, secondary]: one of three schemes by the livery, so
   airlines differ at a glance. o.body is the airframe's own colour where there is no livery */
const SCHEME = [
  { BODY: 'W', BELLY: 2, STRIPE: 'W', STRIPE2: 'W', FIN: 1, ENG: 1 },
  { BODY: 'W', BELLY: 'G', STRIPE: 1, STRIPE2: 2, FIN: 1, ENG: 'W' },
  { BODY: 'W', BELLY: 1, STRIPE: 2, STRIPE2: 1, FIN: 2, ENG: 2 }
];
/* a light aircraft's paint: white, with one or two stripe colours and the tail in the first. A fourth entry 'cover'
   puts a canvas cover over the glazing (an aircraft parked for the night) */
const GA_SCHEME = { BODY: 'W', BELLY: 'W', STRIPE: 1, STRIPE2: 2, FIN: 1, ENG: 'W' };
IC.liveryCols = function (livery, body) {
  const out = { WING: P.wing, GLASS: P.glass, WIN: '#303a44', DOOR: '#9ca4ac', REG: '#262b31' };
  if (!livery) { const b = body || P.civil; return Object.assign(out, { BODY: b, BELLY: body ? b : P.lgrey, STRIPE: body ? b : '#4a6a8c', STRIPE2: body ? b : '#9fb0c2', FIN: body || P.steel, ENG: body || P.lgrey }); }
  const sc = livery[2] === 'ga' ? GA_SCHEME : SCHEME[Math.abs(U.hash(parseInt(livery[0].slice(1), 16) & 0xffff, 5) * 3 | 0) % 3];
  for (const k in sc) out[k] = sc[k] === 'W' ? P.civil : sc[k] === 'G' ? P.lgrey : livery[sc[k] - 1];
  if (livery[3] === 'cover') out.GLASS = '#6f8196';
  return out;
};
/* tasteful stripe pairs for light aircraft, and a light aircraft's paint from a number (its registration's hash) */
IC.GA_LIVERY = [['#1f4f8f', '#c8323c'], ['#b0262e', '#2b2f36'], ['#20608a', '#8fb8d8'], ['#2f7a4a', '#d8b64a'], ['#6b2a3a', '#c9a45c'], ['#1c2c4c', '#e07b1a'], ['#8a1c22', '#e0b030'], ['#3c4652', '#9aa6b2'], ['#0f6a70', '#e8e0c8'], ['#5a3c8a', '#b8a0d8'], ['#c05a1a', '#3a2a20'], ['#2a5a8a', '#2a5a8a']];
IC.gaLivery = (n, cover) => { const l = IC.GA_LIVERY[Math.abs(n | 0) % IC.GA_LIVERY.length]; return cover ? [l[0], l[1], 'ga', 'cover'] : [l[0], l[1], 'ga']; };

/* ---------- which model an object uses ---------- */
const THR_MODEL = { civ: 'narrow', owa: 'owa', jdr: 'jdr', lm: 'lm', isr: 'isr', lacm: 'cm', mcm: 'cm', scm: 'scm', glb: 'glb', srbm: 'bm', marv: 'bm', mrbm: 'bm', pen: 'bm', hgv: 'hgv', rkt: 'rkt', arm: 'arm', dcy: 'dcy', ahe: 'ahe', ftr: 'ftr_e', str: 'str', sead: 'ftr_e', ewj: 'ewj', esj: 'esj', bmr: 'bmr', ga: 'light' };
const KLASS_MODEL = { drone: 'drone', cm: 'cm', ballistic: 'bm', rocket: 'rkt', heli: 'ahe', fighter: 'ftr_e', bomber: 'bmr', jammer: 'ewj', airliner: 'narrow', light: 'light' };
/* an aircraft type (IC.ACTYPES key) */
IC.modelOfType = type => M[type] ? type : 'narrow';
/* a hostile or civil track: its real type when known (or when we are looking at the truth), else its class */
IC.modelOfThreat = function (t, truth) {
  if (t.acType && M[t.acType]) return t.acType;
  if (t.tail && t.tail.type && M[t.tail.type]) return t.tail.type;
  if (truth || t.aff === 'H' || t.d.civil) return THR_MODEL[t.type] || 'cm';
  return t.klass ? KLASS_MODEL[t.klass] || 'cm' : null;
};
/* one of our flights (S.air) */
IC.modelOfAir = a => IC.modelOfType(IC.AIRKIND_TYPE[a.kind] || 'fighter');
/* one of our units: the model shares the unit type's key */
IC.modelOfUnit = type => M[type] ? type : 'truck';
/* a missile in flight, ours or theirs */
IC.modelOfMissile = m => m.mun === 'AAM' ? 'aam' : m.mun === 'GBU' ? 'gbu' : 'sam';
/* is this model an aircraft (it has flying attitudes, gear and lights) */
const FLYING = { 'Civil aircraft': 1, 'Business aviation': 1, 'General aviation': 1, 'Rare visitors': 1, 'Our air wing': 1 };
IC.modelIsAircraft = key => { const g = M[key] && M[key].group; return !!FLYING[g] || ['ahe', 'ftr_e', 'str', 'ewj', 'bmr', 'isr', 'esj'].includes(key); };
/* how many vehicles a unit stands as on the ground (launchers, a radar, its lorries) */
IC.unitVehicles = function (d) {
  if (d.weapon === 'sam') return d.mob === 'fixed' ? 1 : d.mags && d.mags[0] && d.mags[0].ln ? Math.min(6, Math.max(1, d.mags[0].ln)) : 2;
  if (d.gun || d.weapon === 'strike' || d.weapon === 'laser') return d.mob === 'fixed' ? 1 : 2;
  return 1;
};

/* the model's extent from above, in metres: twice the longest reach of any point from the origin */
IC.modelSize = function (key) {
  const m = M[key];
  if (!m) return 10;
  if (m._size) return m._size;
  const me = IC.modelMesh(key, 0);
  let r = 0;
  for (const k in me.groups) { const p = me.groups[k].pos; for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i], p[i + 1])); if (me.groups[k].kind === 'rotor') r = Math.max(r, me.groups[k].R + Math.hypot(me.groups[k].pivot[0], me.groups[k].pivot[1])); }
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
