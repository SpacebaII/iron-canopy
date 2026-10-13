/* Iron Canopy — launchers, radars and missiles in detail (brief 61): models that hold a close-up in the 3D view, in
   the same terms as models.js (metres, x forward, y to starboard, z up; built at two levels of detail, q 1 close and
   q 0 far). They replace that file's simpler launchers and missiles of the same keys.

   What moves, in groups render3d-arms.js turns from the record (brief 62):
   - slew: a turntable or turret, about z; its children ride on it (parent 'slew')
   - launch: the launcher frame that elevates, about y (up: its firing angle); face: which way it points at rest
     (0 forward, π back), so the view can turn the turntable to a bearing
   - gun: a gun cradle that elevates; radar: an antenna that spins; aim: an array that faces the threat
   - cap0…: the cover over each canister's mouth, blown off as its round leaves; rnd0…: the round inside, seen until it goes
   - erect: the enemy launcher's erector arm, raised to vertical before a launch (up π/2)
   Nothing here touches three.js: the tests build every model headless. */
(function (IC) {
'use strict';
const MB = IC.MB, { box, lathe, cyl, wing, plan, FOIL, P } = MB;
const M = IC.MODELS;
const def = (key, name, group, len, span, build) => { M[key] = { key, name, group, len, span, build }; };

/* ---------- colours: military paint, lifted so the shape still shows in low light ---------- */
const OL = '#5f6a49', OL2 = '#525c3f', OLD = '#363c2c', MET = '#5c605a', RUB = '#1d1f1e', GL = P.glass, CAN = '#69714f', CAP = '#8f8d6a';
const EN = '#59614a', EN2 = '#4a5140', END = '#30342a';   // the enemy's darker green
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };

/* ---------- missiles ----------
   A round body along x centred at `at`: an ogive (or cone, or a glass dome) nose, the body in sections with a darker
   band at each joint, a boat-tail and a nozzle bell, a cable raceway along the top, fins with thickness. o: col,
   nose, noseCol, noseL, bands (fractions of the body from the tail), tailR, fins { span, c, sw, rot, col, x },
   mid (the same, mid-body), wings { span, c, x, sw, col }, intake, raceway (false: none) */
function rocket(B, at, len, d, o) {
  o = o || {};
  const q = B.q, r = d / 2, col = o.col || P.missile, nl = o.noseL || Math.min(len * 0.22, d * 3), x0 = -len / 2, xb = len / 2 - nl;
  if (!q) {   // far away: the old pencil, cheap
    MB.missileBody(B, at, len, d, col, { noseL: nl, nose: o.noseCol, fins: o.fins && o.fins.span, finC: o.fins && o.fins.c, finRot: o.fins && o.fins.rot, finSw: o.fins && o.fins.sw, tailR: o.tailR, wings: o.wings && o.wings.span, wingX: o.wings && o.wings.x, wingC: o.wings && o.wings.c });
    return;
  }
  const pts = [], cols = [], band = shade(col, 0.72), push = (x, rr, c) => { pts.push([x, rr]); cols.push(c); };
  const tr = r * (o.tailR || 0.9);
  push(x0, tr, col); push(x0 + d * 0.5, r, col);
  for (const f of o.bands || []) { const x = x0 + (xb - x0) * f; push(x - 0.025, r, col); push(x - 0.02, r * 1.015, band); push(x + 0.02, r * 1.015, band); push(x + 0.025, r, col); }
  push(xb, r, col);
  const nc = o.noseCol || col;
  if (o.nose === 'dome') {
    // a hemispherical seeker window, set in a short collar
    push(xb + r * 0.15, r * 0.98, nc);
    for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; push(xb + r * 0.15 + Math.sin(a) * r * 0.95, Math.max(0.002, Math.cos(a) * r * 0.95), GL); }
  } else for (const k of [0.1, 0.24, 0.4, 0.56, 0.72, 0.86, 0.96, 1]) push(xb + nl * k, Math.max(0.002, r * (o.nose === 'cone' ? 1 - k : Math.sqrt(Math.max(0, 1 - k * k)))), nc);
  lathe(B, pts, col, { at, segs: 16, cap0: '#2a2826', col: i => cols[i + 1] });
  // the nozzle bell, dark and flared, open at the back
  lathe(B, [[x0 + 0.01, tr * 0.7], [x0 - d * 0.18, tr * 0.74], [x0 - d * 0.32, tr * 0.86]], '#2e2c28', { at, segs: 12, cap1: '#120f0d' });
  if (o.raceway !== false) box(B, at[0] + (x0 + xb) / 2 + len * 0.04, at[1], at[2] + r * 0.98, (xb - x0) * 0.62, d * 0.13, d * 0.09, shade(col, 0.82));
  const fin = (f, rot0, fc) => {
    for (let i = 0; i < 4; i++) {
      const a = rot0 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      B.with(p => { const yy = p[1] - at[1], zz = p[2] - at[2]; return [p[0], at[1] + yy * ca - zz * sa, at[2] + yy * sa + zz * ca]; },
        () => wing(B, plan(at[0] + f.x, at[1] + r * 0.92, at[2], f.span, f.c, f.c * (f.tip || 0.4), f.sw || 45, 0, 0.07, 0.05), fc || f.col || col, { foil: FOIL.flat, root: true }));
    }
  };
  if (o.fins) fin(Object.assign({ x: x0 + o.fins.c + d * 0.1 }, o.fins), o.fins.rot || 0, o.fins.col);
  if (o.mid) fin(o.mid, o.mid.rot || 0, o.mid.col);
  if (o.wings) wing(B, plan(at[0] + o.wings.x, 0, at[2] + (o.wings.z || 0), o.wings.span / 2, o.wings.c, o.wings.c * 0.62, o.wings.sw || 6, 0, 0.09, 0.07), o.wings.col || shade(col, 0.92), { mirror: true, foil: FOIL.hi });
  if (o.intake) {
    MB.loft(B, [{ x: at[0] - len * 0.02, w: r * 0.45, h: r * 0.32, z: at[2] - r * 0.95 }, { x: at[0] - len * 0.2, w: r * 0.5, h: r * 0.36, z: at[2] - r * 0.9 }, { x: at[0] - len * 0.3, w: r * 0.2, h: r * 0.15, z: at[2] - r * 0.6 }], MB.ANG.mid, () => shade(col, 0.85), { cap1: P.intake });
  }
}
IC.MB.rocket = rocket;

const SAM = { col: '#e2e2dc', nose: 'ogive', noseCol: '#f0eee6', bands: [0.18, 0.55, 0.82], fins: { span: 0.42, c: 0.75, sw: 50, tip: 0.35 } };
def('sam', 'Interceptor', 'Missiles', 5.3, 0.9, B => { rocket(B, [0, 0, 0], 5.3, 0.41, SAM); if (B.q) cyl(B, [1.25, 0, 0], 0.16, 0.209, '#b02a30', 'x', { segs: 16 }); });
def('bm', 'Ballistic missile', 'Enemy weapons', 7.3, 1.9, B => {
  rocket(B, [0, 0, 0], 7.3, 0.92, { col: '#7b8068', noseCol: '#3e4236', noseL: 2.4, bands: [0.28, 0.62], fins: { span: 0.42, c: 0.95, sw: 25, tip: 0.6 } });
  if (B.q) for (const y of [-1, 1]) box(B, -1.2, y * 0.47, 0, 1.6, 0.02, 0.18, '#3a3d33');   // the handling rails
});
def('cm', 'Cruise missile', 'Enemy weapons', 6.2, 2.6, B => rocket(B, [0, 0, 0], 6.2, 0.52, { col: '#646c72', noseCol: '#4a5056', noseL: 0.9, bands: [0.35, 0.7], raceway: false,
  wings: { span: 2.6, c: 0.5, x: 0.65, sw: 4, z: 0.16 }, fins: { span: 0.42, c: 0.5, rot: Math.PI / 4, sw: 40, tip: 0.5 }, intake: true }));

/* ---------- wheels, cabs, chassis ---------- */
/* a military tyre with a deep tread band and a hub, on the outside at y */
function tyre(B, x, y, r, w, hub) {
  const s = Math.sign(y) || 1;
  lathe(B, [[-w / 2, r * 0.6], [-w / 2, r * 0.88], [-w * 0.42, r], [w * 0.42, r], [w / 2, r * 0.88], [w / 2, r * 0.6]], RUB, { at: [x, y, r], axis: 'y', segs: B.q ? 16 : 6, cap0: RUB, cap1: RUB, smooth: false });
  if (B.q) { cyl(B, [x, y + s * (w / 2 + 0.015), r], 0.03, r * 0.52, hub || OL2, 'y', { segs: 10 }); cyl(B, [x, y + s * (w / 2 + 0.05), r], 0.06, r * 0.2, OLD, 'y', { segs: 6 }); }
}
function axle(B, x, track, r, w, hub, guard, gz) {
  for (const s of [-1, 1]) {
    tyre(B, x, s * track / 2, r, w, hub);
    if (guard) box(B, x, s * track / 2, gz || r * 2 + 0.08, r * 2.3, w + 0.12, 0.06, guard, { top: [0.85, 1] });
  }
}
/* a forward-control military cab, its front at x = xf, floor z0 */
function cab(B, xf, w, z0, col, o) {
  o = o || {};
  const L = o.L || 2.5, H = o.H || 2.0, q = B.q;
  box(B, xf - L / 2, 0, z0 + H / 2, L, w, H, col, { top: [0.86, 0.97], shift: -L * 0.07 });
  // the windscreen in two panes, the side windows, the doors
  for (const s of [-1, 1]) box(B, xf - L * 0.1, s * w * 0.235, z0 + H * 0.72, 0.05, w * 0.43, H * 0.34, GL, { pitch: -0.22 });
  for (const s of [-1, 1]) box(B, xf - L * 0.42, s * (w / 2 + 0.006), z0 + H * 0.7, L * 0.42, 0.02, H * 0.3, GL);
  if (!q) return;
  for (const s of [-1, 1]) { box(B, xf - L * 0.66, s * (w / 2 + 0.008), z0 + H * 0.5, 0.03, 0.01, H * 0.88, OLD); box(B, xf - L * 0.12, s * (w / 2 + 0.008), z0 + H * 0.5, 0.03, 0.01, H * 0.88, OLD); }
  // grille with its bars, bumper, lights, mirrors on their arms, the roof hatch, steps under the doors
  box(B, xf + 0.02, 0, z0 + H * 0.24, 0.05, w * 0.66, H * 0.34, OLD);
  for (let i = 0; i < 5; i++) box(B, xf + 0.05, 0, z0 + H * 0.1 + i * H * 0.065, 0.02, w * 0.62, 0.025, MET);
  box(B, xf + 0.16, 0, z0 - 0.12, 0.28, w * 1.03, 0.28, OLD);
  for (const s of [-1, 1]) { box(B, xf + 0.04, s * w * 0.4, z0 + H * 0.26, 0.05, 0.26, 0.17, '#d6d2bd'); box(B, xf + 0.06, s * w * 0.4, z0 + H * 0.26, 0.04, 0.34, 0.03, OLD); }
  for (const s of [-1, 1]) { box(B, xf - 0.35, s * (w / 2 + 0.22), z0 + H * 0.78, 0.05, 0.44, 0.04, OLD); box(B, xf - 0.35, s * (w / 2 + 0.44), z0 + H * 0.66, 0.07, 0.05, 0.42, OLD); }
  cyl(B, [xf - L * 0.55, -w * 0.18, z0 + H + 0.02], 0.08, 0.36, shade(col, 0.88), 'z', { segs: 10 });
  for (const s of [-1, 1]) for (const k of [0.25, 0.55]) box(B, xf - L * 0.4, s * (w / 2 + 0.06), z0 - 0.2 - k * 0.5, 0.5, 0.18, 0.04, OLD);
  // the exhaust stack behind the cab, and an antenna whip
  cyl(B, [xf - L - 0.14, w * 0.38, z0 + H * 0.7], H * 1.45, 0.08, '#2c2e2a', 'z', { segs: 8 });
  cyl(B, [xf - L * 0.85, -w * 0.42, z0 + H + 1.4], 2.8, 0.012, OLD, 'z', { segs: 4 });
}
/* the frame rails and a fuel tank and stowage boxes along the side */
function frame(B, x0, x1, w, z, col) {
  for (const s of [-1, 1]) box(B, (x0 + x1) / 2, s * w * 0.32, z, x1 - x0, 0.16, 0.34, OLD);
  for (let x = x0 + 0.6; x < x1; x += 1.4) box(B, x, 0, z, 0.12, w * 0.64, 0.24, OLD);
  if (!B.q) return;
  cyl(B, [x1 - 3.4, w * 0.44, z - 0.05], 1.4, 0.3, col, 'x', { segs: 12 });
  box(B, x1 - 3.4, -w * 0.44, z, 1.2, 0.45, 0.5, shade(col, 0.9));
}
/* outrigger jacks, down when the launcher is emplaced */
function jacks(B, pts, z) { for (const [x, y] of pts) { box(B, x, y * 0.82, z, 0.2, Math.abs(y) * 0.36, 0.16, OLD); cyl(B, [x, y, z / 2], z, 0.08, MET, 'z', { segs: 8 }); cyl(B, [x, y, 0.04], 0.08, 0.28, OLD, 'z', { segs: 10 }); } }

/* ---------- launchers ----------
   A pack of canisters on a hinge, pointing along dir (1 forward, -1 back) from the hinge at x, z; a turntable under it
   when it slews. n canisters 2 wide; each with a cover and its round's nose in the mouth. */
function pack(B, o) {
  const n = o.n, cols = n <= 2 ? n : 2, rows = Math.ceil(n / cols), d = o.d, L = o.len, dir = o.dir, g = d * 1.06, hx = o.x, hz = o.z;
  if (o.slew) {
    B.group('slew', { kind: 'slew', pivot: [o.slew, 0, o.tz], axis: [0, 0, 1], face: dir > 0 ? 0 : Math.PI });
    cyl(B, [o.slew, 0, o.tz + 0.12], 0.24, o.tr || 1.1, OL2, 'z', { segs: B.q ? 16 : 8 });
    cyl(B, [o.slew, 0, o.tz - 0.02], 0.08, (o.tr || 1.1) * 1.08, OLD, 'z', { segs: B.q ? 16 : 8 });
    // the cradle's two side frames up to the hinge, and the elevation ram
    for (const s of [-1, 1]) box(B, (o.slew + hx) / 2, s * (cols * g / 2 + 0.12), (o.tz + hz) / 2 + 0.05, Math.abs(hx - o.slew) + 0.6, 0.14, hz - o.tz + 0.3, OL);
    B.home = 'slew';
  }
  B.group('launch', { kind: 'launch', pivot: [hx, 0, hz], axis: [0, dir > 0 ? -1 : 1, 0], up: o.up, face: dir > 0 ? 0 : Math.PI });
  const xc = hx + dir * L / 2, w = cols * g, h = rows * g;
  // the canisters, their stiffening ribs and the frame round them
  for (let rI = 0; rI < rows; rI++) for (let c = 0; c < cols; c++) {
    const y = (c - (cols - 1) / 2) * g, z = hz + d / 2 + 0.06 + rI * g;
    const front = dir > 0 ? 0 : 1, fc = [CAN, CAN, CAN, CAN, CAN, CAN]; fc[front] = '#151612';
    if (o.round) cyl(B, [xc, y, z], L, d / 2, CAN, 'x', { segs: B.q ? 14 : 6, cap0: dir > 0 ? CAN : '#151612', cap1: dir > 0 ? '#151612' : CAN });
    else box(B, xc, y, z, L, d, d, CAN, { col: fc });
  }
  const ribs = B.q ? Math.max(3, Math.round(L / 1.3)) : 2;
  for (let i = 0; i < ribs; i++) box(B, hx + dir * (0.15 + i * (L - 0.3) / (ribs - 1)), 0, hz + h / 2 + 0.06, 0.1, w + 0.08, h + 0.08, OL2);
  if (B.q) box(B, xc, 0, hz + 0.02, L, w + 0.1, 0.08, OLD);
  // each canister's cover and the nose of the round behind it
  const mouth = hx + dir * L;
  B.home = 'launch';
  for (let rI = 0, i = 0; rI < rows; rI++) for (let c = 0; c < cols && i < n; c++, i++) {
    const y = (c - (cols - 1) / 2) * g, z = hz + d / 2 + 0.06 + rI * g;
    B.group('rnd' + i, { kind: 'rnd', pivot: [mouth, y, z], axis: [0, 0, 1], i });
    lathe(B, [[-dir * 0.5, d * 0.32], [-dir * 0.3, d * 0.3], [-dir * 0.12, d * 0.18], [-dir * 0.02, 0.01]].map(([a, rr]) => [a, rr]), o.rcol || '#e2e2dc', { at: [mouth, y, z], segs: B.q ? 10 : 5 });
    B.group('cap' + i, { kind: 'cap', pivot: [mouth, y, z], axis: [0, 0, 1], i });
    box(B, mouth + dir * 0.03, y, z, 0.05, d * 0.94, d * 0.94, CAP);
    if (B.q) box(B, mouth + dir * 0.065, y, z, 0.02, d * 0.98, 0.05, shade(CAP, 0.7));
  }
  B.home = null; B.group('main');
}

/* Bastion: a long-range launcher on a semi-trailer behind a four-axle tractor, four canisters on a turntable */
def('lrsam', 'Bastion', 'Our units', 17.6, 3.2, B => {
  const q = B.q;
  // the tractor
  frame(B, 0.4, 8.0, 2.5, 1.0, OL);
  cab(B, 8.6, 2.5, 1.3, OL, { L: 2.4, H: 1.95 });
  for (const x of [7.5, 6.1, 2.6, 1.3]) axle(B, x, 2.1, 0.62, 0.42, OL2, OL, 1.45);
  box(B, 4.4, 0, 1.75, 3.2, 2.3, 1.1, OL2, { top: [0.96, 0.92] });   // the crane and stowage behind the cab
  if (q) { box(B, 4.9, 0.7, 2.45, 1.4, 0.7, 0.3, OLD); cyl(B, [3.6, -0.75, 2.3], 0.5, 0.55, RUB, 'y', { segs: 12 }); }
  // the trailer: a gooseneck over the fifth wheel, the deck, two axles, the generator, jacks down
  box(B, 1.9, 0, 1.75, 2.8, 2.2, 0.5, OL);
  box(B, -3.6, 0, 1.2, 10.2, 2.5, 0.42, OL, { top: [1, 0.98] });
  for (const x of [-6.6, -7.8]) axle(B, x, 2.15, 0.55, 0.38, OL2, OL, 1.3);
  box(B, 1.6, 0, 2.55, 1.9, 2.1, 1.1, OL2, { top: [0.95, 0.95] });
  if (q) { for (let i = 0; i < 5; i++) box(B, 2.56, -0.4 + i * 0.2, 2.55, 0.02, 0.08, 0.8, OLD); box(B, 0.4, 0.9, 1.75, 0.8, 0.5, 0.6, OLD); }
  jacks(B, [[-0.6, 1.5], [-0.6, -1.5], [-8.4, 1.5], [-8.4, -1.5]], 1.1);
  pack(B, { n: 4, d: 0.95, len: 5.6, dir: -1, x: -2.0, z: 2.0, tz: 1.45, slew: -3.6, tr: 1.15, up: 0.66 });
});
/* Aegir: a medium-range launcher on a three-axle truck, four canisters slewing over the bed */
def('mrsam', 'Aegir', 'Our units', 10.5, 3.0, B => {
  frame(B, -4.6, 4.4, 2.5, 1.0, OL);
  cab(B, 5.3, 2.5, 1.3, OL, { L: 2.3, H: 1.9 });
  for (const x of [4.2, 0.2, -1.2]) axle(B, x, 2.05, 0.58, 0.4, OL2, OL, 1.38);
  box(B, -1.9, 0, 1.38, 5.6, 2.5, 0.36, OL);
  box(B, 2.2, 0, 1.9, 1.4, 2.3, 1.2, OL2);
  if (B.q) { for (let i = 0; i < 4; i++) box(B, 2.92, -0.3 + i * 0.2, 1.9, 0.02, 0.08, 0.9, OLD); }
  jacks(B, [[1.4, 1.45], [1.4, -1.45], [-4.4, 1.45], [-4.4, -1.45]], 1.05);
  pack(B, { n: 4, d: 0.62, len: 4.4, dir: -1, x: -0.4, z: 1.95, tz: 1.56, slew: -1.6, tr: 0.95, up: 1.0, round: true });
});
/* the tracked hull: road wheels, track runs and side skirts, the glacis, hatches */
function tracked(B, len, w, col) {
  const q = B.q, x1 = len / 2;
  box(B, 0, 0, 1.0, len * 0.92, w - 1.1, 0.9, shade(col, 0.92));
  box(B, -0.1, 0, 1.68, len * 0.96, w, 0.55, col, { top: [0.96, 0.9] });
  box(B, x1 - 0.45, 0, 1.25, 0.9, w - 1.0, 0.75, col, { pitch: 0.75 });
  for (const s of [-1, 1]) {
    const y = s * (w / 2 - 0.33);
    box(B, -0.05, y, 0.55, len * 0.86, 0.56, 0.18, RUB); box(B, -0.05, y, 1.0, len * 0.84, 0.56, 0.12, RUB);
    const nW = q ? 6 : 3;
    for (let i = 0; i < nW; i++) cyl(B, [-len * 0.36 + i * len * 0.72 / (nW - 1), y, 0.42], 0.5, 0.34, OL2, 'y', { segs: q ? 12 : 6, cap0: OLD, cap1: OLD });
    cyl(B, [x1 - 0.55, y, 0.78], 0.5, 0.3, OLD, 'y', { segs: q ? 12 : 6 }); cyl(B, [-x1 + 0.5, y, 0.72], 0.5, 0.3, OLD, 'y', { segs: q ? 12 : 6 });
    box(B, -0.05, s * (w / 2 + 0.01), 1.05, len * 0.84, 0.04, 0.42, col);   // the skirt
  }
  if (!q) return;
  cyl(B, [x1 - 1.3, w * 0.22, 1.98], 0.1, 0.32, shade(col, 0.85), 'z', { segs: 10 });
  for (let i = -1; i <= 1; i++) box(B, x1 - 1.0, w * 0.22 + i * 0.16, 2.0, 0.08, 0.1, 0.12, GL);
  box(B, -x1 + 1.2, 0, 1.97, 1.8, w * 0.6, 0.05, OLD);
  for (let i = 0; i < 6; i++) box(B, -x1 + 0.5 + i * 0.28, 0, 2.0, 0.04, w * 0.58, 0.03, MET);
  for (const s of [-1, 1]) box(B, x1 - 0.2, s * w * 0.36, 1.55, 0.2, 0.3, 0.2, '#d6d2bd');
}
/* Vixen: tracked short-range launcher, a turret with two pods of two rounds and a search radar that spins */
def('shorad', 'Vixen', 'Our units', 7.6, 3.6, B => {
  tracked(B, 7.6, 3.2, OL);
  B.group('slew', { kind: 'slew', pivot: [-0.6, 0, 1.95], axis: [0, 0, 1], face: 0 });
  lathe(B, [[0, 1.2], [0.6, 1.1], [0.9, 0.85]], OL, { at: [-0.6, 0, 1.95], axis: 'z', segs: B.q ? 16 : 8, cap1: OL });
  box(B, -0.4, 0, 3.15, 1.6, 1.0, 0.6, OL2, { top: [0.9, 0.9] });
  if (B.q) { box(B, 0.45, 0, 3.15, 0.1, 0.6, 0.4, GL); cyl(B, [-1.2, 0.5, 3.1], 0.1, 0.3, OLD, 'z', { segs: 8 }); }
  B.home = 'slew';
  B.group('radar', { kind: 'radar', pivot: [-1.3, 0, 3.5], axis: [0, 0, 1] });
  cyl(B, [-1.3, 0, 3.6], 0.3, 0.1, OLD, 'z', { segs: 6 });
  box(B, -1.3, 0, 4.0, 0.16, 1.9, 0.55, P.radar, { pitch: -0.25, col: [P.lgrey, '#8a8e86'] });
  // the pods on their trunnions, either side of the turret
  B.group('launch', { kind: 'launch', pivot: [-0.9, 0, 2.95], axis: [0, -1, 0], up: 0.4, face: 0 });
  for (const s of [-1, 1]) {
    box(B, -0.9, s * 1.05, 2.95, 0.3, 0.5, 0.3, OLD);
    for (const k of [0, 1]) { const y = s * (1.25 + k * 0.32), z = 3.05; cyl(B, [-0.1, y, z], 2.2, 0.15, CAN, 'x', { segs: B.q ? 10 : 5, cap0: CAN, cap1: '#151612' }); }
  }
  B.home = 'launch';
  let i = 0;
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const y = s * (1.25 + k * 0.32), z = 3.05;
    B.group('rnd' + i, { kind: 'rnd', pivot: [1.0, y, z], axis: [0, 0, 1], i }); lathe(B, [[-0.3, 0.1], [-0.12, 0.08], [-0.02, 0.01]], '#e2e2dc', { at: [1.0, y, z], segs: B.q ? 8 : 4 });
    B.group('cap' + i, { kind: 'cap', pivot: [1.0, y, z], axis: [0, 0, 1], i }); cyl(B, [1.02, y, z], 0.04, 0.15, CAP, 'x', { segs: B.q ? 10 : 5 });
    i++;
  }
  B.home = null; B.group('main');
});
/* Buzzsaw: the gun tank: a turret with two cannon that elevate, a search radar on the back, a tracker on the front */
def('spaag', 'Buzzsaw', 'Our units', 8.2, 3.6, B => {
  tracked(B, 7.5, 3.2, OL);
  B.group('slew', { kind: 'slew', pivot: [-0.5, 0, 1.95], axis: [0, 0, 1], face: 0 });
  box(B, -0.5, 0, 2.5, 2.8, 2.3, 1.1, OL, { top: [0.86, 0.84] });
  box(B, 0.95, 0, 2.5, 0.3, 2.0, 0.9, OL2, { pitch: 0.4 });
  if (B.q) { cyl(B, [-0.8, 0.5, 3.1], 0.1, 0.3, OLD, 'z', { segs: 8 }); box(B, 0.6, 0.6, 3.1, 0.1, 0.3, 0.15, GL); }
  // the tracking radar's dish at the front
  lathe(B, [[0, 0.02], [0.18, 0.5], [0.24, 0.55]], P.radar, { at: [1.1, 0, 3.3], segs: B.q ? 14 : 6, cap1: '#9aa09a' });
  B.home = 'slew';
  B.group('radar', { kind: 'radar', pivot: [-1.6, 0, 3.05], axis: [0, 0, 1] });
  cyl(B, [-1.6, 0, 3.25], 0.4, 0.1, OLD, 'z', { segs: 6 });
  box(B, -1.6, 0, 3.6, 0.18, 1.8, 0.5, P.radar, { pitch: -0.2, col: [P.lgrey, '#8a8e86'] });
  B.group('gun', { kind: 'gun', pivot: [-0.1, 0, 2.55], axis: [0, -1, 0], up: 0.5 });
  for (const s of [-1, 1]) {
    box(B, 0.1, s * 1.4, 2.55, 1.6, 0.5, 0.6, OL2);
    cyl(B, [2.0, s * 1.4, 2.6], 3.2, 0.06, '#2a2c2a', 'x', { segs: B.q ? 8 : 4 });
    cyl(B, [3.55, s * 1.4, 2.6], 0.2, 0.1, '#2a2c2a', 'x', { segs: B.q ? 8 : 4 });
  }
  B.home = null; B.group('main');
});

/* ---------- the enemy's launchers (brief 62 puts them where their weapons start) ---------- */
/* a ballistic missile's transporter-erector-launcher: eight wheels, two cabs either side of the round's nose, the
   erector that lifts the round to vertical over the launch table at the back */
def('etel', 'Missile launcher', 'Enemy launchers', 13.5, 3.0, B => {
  const q = B.q;
  frame(B, -6.2, 6.2, 2.8, 1.05, EN);
  cab(B, 6.7, 2.9, 1.25, EN, { L: 2.2, H: 1.7 });
  // two cabs, really: a dark gap between them where the round's nose lies
  box(B, 5.6, 0, 2.2, 2.3, 0.5, 1.6, END);
  for (const x of [5.0, 3.4, -2.6, -4.2]) axle(B, x, 2.4, 0.78, 0.5, EN2, EN, 1.7);
  box(B, 0.2, 0, 1.55, 11.8, 2.9, 0.5, EN, { top: [1, 0.97] });
  for (const s of [-1, 1]) box(B, 0.4, s * 1.05, 2.05, 5.6, 0.7, 0.55, EN2);   // stowage and the hydraulics
  if (q) { cyl(B, [1.0, -1.42, 1.3], 1.6, 0.32, EN, 'x', { segs: 12 }); box(B, -0.9, 1.42, 1.3, 1.2, 0.3, 0.6, EN2); }
  jacks(B, [[-5.8, 1.55], [-5.8, -1.55]], 1.3);
  // the launch table it stands on, folded down at the back
  box(B, -6.35, 0, 1.1, 0.5, 1.6, 0.25, END);
  // the erector: two beams and cradles, hinged at the back, carrying the round nose forward
  B.group('erect', { kind: 'erect', pivot: [-5.9, 0, 2.0], axis: [0, -1, 0], up: Math.PI / 2 });
  for (const s of [-1, 1]) box(B, -1.6, s * 0.62, 2.2, 8.6, 0.16, 0.24, EN2);
  for (const x of [-4.8, -1.8, 1.2]) box(B, x, 0, 2.3, 0.3, 1.4, 0.2, EN2);
  B.home = 'erect';
  B.group('rnd0', { kind: 'rnd', pivot: [-5.9, 0, 2.0], axis: [0, 0, 1], i: 0 });
  rocket(B, [-2.0, 0, 2.95], 7.3, 0.92, { col: '#7b8068', noseCol: '#3e4236', noseL: 2.4, bands: [0.28, 0.62], fins: { span: 0.42, c: 0.95, sw: 25, tip: 0.6 } });
  B.home = null; B.group('main');
});
/* the cruise missile launcher: a four-axle truck with two canisters that elevate over the back */
def('ecml', 'Cruise missile launcher', 'Enemy launchers', 11.4, 2.8, B => {
  frame(B, -5.0, 5.2, 2.6, 1.0, EN);
  cab(B, 5.8, 2.6, 1.3, EN, { L: 2.5, H: 1.9 });
  for (const x of [4.7, 3.3, -2.0, -3.4]) axle(B, x, 2.2, 0.66, 0.44, EN2, EN, 1.5);
  box(B, -0.2, 0, 1.45, 9.6, 2.6, 0.42, EN);
  box(B, 2.6, 0, 2.0, 1.2, 2.4, 1.1, EN2);
  jacks(B, [[-4.8, 1.45], [-4.8, -1.45]], 1.2);
  pack(B, { n: 2, d: 0.85, len: 7.0, dir: 1, x: -4.6, z: 1.8, up: 0.62, rcol: '#646c72' });
});

/* ---------- radars ---------- */
/* Sentinel: a fire-control radar on a trailer, its array tiled, facing the threat rather than spinning */
def('lr3d', 'Sentinel', 'Our units', 8.5, 3.0, B => {
  frame(B, -1.6, 4.6, 2.5, 1.0, OL);
  cab(B, 5.2, 2.5, 1.3, OL, { L: 2.3, H: 1.9 });
  for (const x of [4.1, -0.4, -1.6]) axle(B, x, 2.05, 0.58, 0.4, OL2, OL, 1.38);
  box(B, -1.0, 0, 2.1, 4.6, 2.5, 1.7, OL, { top: [0.98, 0.98] });
  jacks(B, [[1.0, 1.45], [1.0, -1.45], [-3.0, 1.45], [-3.0, -1.45]], 1.05);
  B.group('aim', { kind: 'aim', pivot: [-1.6, 0, 3.0], axis: [0, 0, 1], face: Math.PI });
  cyl(B, [-1.6, 0, 3.05], 0.2, 0.7, OLD, 'z', { segs: B.q ? 12 : 6 });
  // the array: a frame tilted back, its face in tiles
  const ax = -2.3, az = 4.4, tilt = 0.42;
  box(B, ax, 0, az, 0.35, 3.0, 2.6, OL, { pitch: -tilt });
  if (B.q) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const yy = -1.1 + i * 0.73, zz = -0.95 + j * 0.63;
    box(B, ax - 0.19 - zz * Math.sin(tilt), yy, az + zz * Math.cos(tilt), 0.03, 0.66, 0.57, j % 2 === i % 2 ? '#7d8670' : '#737c66', { pitch: -tilt });
  }
  B.group('main');
});

IC.MODEL_GROUPS.push('Enemy launchers');
})(window.IC);
