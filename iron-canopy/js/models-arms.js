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
   A round body along x centred at `at`: an ogive (or cone, or a glass dome, or a ramjet's inlet) nose, the body in
   sections with a darker band at each joint, a boat-tail and a nozzle bell, a cable raceway along the top, fins with
   thickness. o: col, nose, noseCol, noseL, bands (fractions of the body from the tail), tailR, fins { span, c, sw,
   rot, col, x }, mid (the same, mid-body), can (canards, the same near the nose), wings { span, c, x, sw, col },
   intake, raceway (false: none), steps [{ x, r, len }] (a stage that ends x m from the tail, the body ahead of it
   r times as thick, an interstage len long), paint [{ x0, x1, col }] (stripes of paint, metres from the tail) */
function rocket(B, at, len, d, o) {
  o = o || {};
  const q = B.q, r = d / 2, col = o.col || P.missile, nl = o.noseL || Math.min(len * 0.22, d * 3), x0 = -len / 2, xb = len / 2 - nl;
  if (!q) {   // far away: the old pencil, cheap
    MB.missileBody(B, at, len, d * (o.steps ? Math.sqrt(o.steps[o.steps.length - 1].r) : 1), col, { noseL: nl, nose: o.noseCol, fins: o.fins && o.fins.span, finC: o.fins && o.fins.c, finRot: o.fins && o.fins.rot, finSw: o.fins && o.fins.sw, tailR: o.tailR, wings: o.wings && o.wings.span, wingX: o.wings && o.wings.x, wingC: o.wings && o.wings.c, stripe: o.paint && o.paint.length ? o.paint[0].col : null });
    return;
  }
  const pts = [], cols = [], band = shade(col, 0.72), push = (x, rr, c) => { pts.push([x, rr]); cols.push(c); };
  const paintAt = x => { for (const p of o.paint || []) if (x - x0 >= p.x0 - 1e-6 && x - x0 < p.x1 - 1e-6) return p.col; return col; };
  const tr = r * (o.tailR || 0.9);
  // the body from the tail forward: its radius steps down at each stage; bands and stripes of paint are joints in it
  const ev = [];
  for (const f of o.bands || []) ev.push({ x: x0 + (xb - x0) * f, band: true });
  for (const st of o.steps || []) ev.push({ x: x0 + st.x, step: st });
  for (const p of o.paint || []) { ev.push({ x: x0 + p.x0 }); ev.push({ x: x0 + p.x1 }); }
  ev.sort((a, b) => a.x - b.x);
  let rc = r;
  push(x0, tr, paintAt(x0)); push(x0 + Math.min(d * 0.5, len * 0.08), r, paintAt(x0 + 0.01));
  for (const e of ev) {
    if (e.x <= x0 + 0.02 || e.x >= xb) continue;
    if (e.band) { const c = paintAt(e.x); push(e.x - 0.025, rc, c); push(e.x - 0.02, rc * 1.015, shade(c, 0.72)); push(e.x + 0.02, rc * 1.015, shade(c, 0.72)); push(e.x + 0.025, rc, c); }
    else if (e.step) { push(e.x, rc, shade(paintAt(e.x - 0.01), 0.8)); rc = r * e.step.r; push(e.x + (e.step.len || rc), rc, paintAt(e.x + 0.01)); }
    else { push(e.x - 0.002, rc, paintAt(e.x - 0.01)); push(e.x + 0.002, rc, paintAt(e.x + 0.01)); }
  }
  push(xb, rc, paintAt(xb - 0.01));
  const nc = o.noseCol || col;
  if (o.nose === 'dome') {
    // a hemispherical seeker window, set in a short collar
    push(xb + rc * 0.15, rc * 0.98, nc);
    for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; push(xb + rc * 0.15 + Math.sin(a) * rc * 0.95, Math.max(0.002, Math.cos(a) * rc * 0.95), GL); }
  } else if (o.nose === 'inlet') {
    // a ramjet's open mouth: a lip, the dark throat, and the centre-body cone standing out of it
    push(xb + nl * 0.7, rc * 0.92, nc); push(xb + nl, rc * 0.84, nc); push(xb + nl, rc * 0.74, '#16181a');
    lathe(B, [[xb - 0.4, rc * 0.5], [xb + nl * 0.6, rc * 0.42], [xb + nl * 1.45, 0.004]], o.spikeCol || '#3c4044', { at, segs: 12 });
  } else for (const k of [0.1, 0.24, 0.4, 0.56, 0.72, 0.86, 0.96, 1]) push(xb + nl * k, Math.max(0.002, rc * (o.nose === 'cone' ? 1 - k : Math.sqrt(Math.max(0, 1 - k * k)))), nc);
  lathe(B, pts, col, { at, segs: 16, cap0: '#2a2826', cap1: o.nose === 'inlet' ? '#16181a' : undefined, col: i => cols[i + 1] });
  // the nozzle bell, dark and flared, open at the back
  lathe(B, [[x0 + 0.01, tr * 0.7], [x0 - d * 0.18, tr * 0.74], [x0 - d * 0.32, tr * 0.86]], '#2e2c28', { at, segs: 12, cap1: '#120f0d' });
  if (o.raceway !== false) box(B, at[0] + (x0 + xb) / 2 + len * 0.04, at[1], at[2] + r * 0.98, (xb - x0) * 0.62, d * 0.13, d * 0.09, shade(col, 0.82));
  const fin = (f, rot0, fc, rr) => {
    for (let i = 0; i < 4; i++) {
      const a = rot0 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      B.with(p => { const yy = p[1] - at[1], zz = p[2] - at[2]; return [p[0], at[1] + yy * ca - zz * sa, at[2] + yy * sa + zz * ca]; },
        () => wing(B, plan(at[0] + f.x, at[1] + (rr || r) * 0.92, at[2], f.span, f.c, f.c * (f.tip || 0.4), f.sw || 45, 0, 0.07, 0.05), fc || f.col || col, { foil: FOIL.flat, root: true }));
    }
  };
  // the radius of the body at x (from the centre), for fins that sit on a later stage
  const rAt = x => { let rr = r; for (const st of o.steps || []) if (x > x0 + st.x) rr = r * st.r; return rr; };
  if (o.fins) { const f = Object.assign({ x: x0 + o.fins.c + d * 0.1 }, o.fins); fin(f, o.fins.rot || 0, o.fins.col, rAt(f.x - f.c)); }
  if (o.mid) fin(o.mid, o.mid.rot || 0, o.mid.col, rAt(o.mid.x - o.mid.c));
  if (o.can) fin(o.can, o.can.rot || 0, o.can.col, rAt(o.can.x - o.can.c));
  if (o.wings) wing(B, plan(at[0] + o.wings.x, 0, at[2] + (o.wings.z || 0), o.wings.span / 2, o.wings.c, o.wings.c * 0.62, o.wings.sw || 6, 0, 0.09, 0.07), o.wings.col || shade(col, 0.92), { mirror: true, foil: FOIL.hi });
  if (o.intake) {
    MB.loft(B, [{ x: at[0] - len * 0.02, w: r * 0.45, h: r * 0.32, z: at[2] - r * 0.95 }, { x: at[0] - len * 0.2, w: r * 0.5, h: r * 0.36, z: at[2] - r * 0.9 }, { x: at[0] - len * 0.3, w: r * 0.2, h: r * 0.15, z: at[2] - r * 0.6 }], MB.ANG.mid, () => shade(col, 0.85), { cap1: P.intake });
  }
}
IC.MB.rocket = rocket;

/* Every weapon in the air reads at a glance from what it is, at the distance a camera holds it:
   - ours are white, with a band of colour by family (yellow heat-seekers, blue short range, orange medium range, red
     long range and ballistic-missile defence, black hit-to-kill noses) and the shape of their class: canards and a glass
     dome on the small ones, mid-body wings on the medium, boosters and stages on the big ones;
   - theirs wear their side's dull paint, greens, greys and charcoal, with a rust band at the tail, and each family its
     own outline: a delta drone with a propeller, a jet drone with its engine on its back, a faceted stealthy missile,
     a ramjet's open mouth, a bomb under a wing kit, a stage and a cone for the big ballistic ones. */
const WH = '#e4e4de', WN = '#f0eee6', BAND = { ir: '#e0b020', sr: '#2a62b8', mr: '#e07b1a', lr: '#b02a30', bmd: '#b02a30', aam: '#c89a2a', strike: '#2a62b8' };
const RUST = '#a4441c', EGR = '#6b6f66', EOL = '#5b6448', ECH = '#3a3e42', ESA = '#8a8470';
const ring = (B, x, d, col, w) => { if (B.q) cyl(B, [x, 0, 0], w || 0.06, d / 2 * 1.02, col, 'x', { segs: 16 }); };
const p = (x0, x1, col) => ({ x0, x1, col });

// our interceptors, by IC.MUN key (IC.modelOfMissile)
def('sam', 'Long-range interceptor', 'Missiles', 5.3, 0.9, B => rocket(B, [0, 0, 0], 5.3, 0.41, { col: WH, noseCol: WN, bands: [0.18, 0.55, 0.82], paint: [p(3.5, 3.72, BAND.lr)], fins: { span: 0.42, c: 0.75, sw: 50, tip: 0.35 } }));
def('irm', 'Heat-seeking missile', 'Missiles', 2.0, 0.34, B => rocket(B, [0, 0, 0], 2.0, 0.11, { col: WH, nose: 'dome', noseL: 0.08, bands: [0.5], paint: [p(1.45, 1.6, BAND.ir)], raceway: false,
  can: { x: 0.68, span: 0.07, c: 0.09, sw: 30, tip: 0.6 }, fins: { span: 0.1, c: 0.12, sw: 20, tip: 0.7, rot: Math.PI / 4 } }));
def('srm', 'Short-range missile', 'Missiles', 3.0, 0.62, B => rocket(B, [0, 0, 0], 3.0, 0.165, { col: WH, noseCol: WN, noseL: 0.45, bands: [0.3, 0.7], paint: [p(1.9, 2.05, BAND.sr)],
  can: { x: 0.95, span: 0.11, c: 0.16, sw: 35, tip: 0.5 }, fins: { span: 0.2, c: 0.3, sw: 40, tip: 0.5 } }));
def('mrm', 'Medium-range missile', 'Missiles', 3.9, 0.74, B => rocket(B, [0, 0, 0], 3.9, 0.24, { col: WH, noseCol: '#d8d6cc', noseL: 0.62, bands: [0.25, 0.6], paint: [p(2.5, 2.68, BAND.mr)],
  mid: { x: 0.35, span: 0.2, c: 0.62, sw: 55, tip: 0.2 }, fins: { span: 0.25, c: 0.34, sw: 35, tip: 0.45 } }));
def('lre', 'Extended-range interceptor', 'Missiles', 6.4, 1.0, B => rocket(B, [0, 0, 0], 6.4, 0.5, { col: WH, noseCol: WN, noseL: 1.25, steps: [{ x: 1.7, r: 0.82, len: 0.25 }],
  bands: [0.5, 0.82], paint: [p(0, 1.7, '#cfcfc8'), p(4.1, 4.32, BAND.lr), p(4.42, 4.5, BAND.lr)], fins: { span: 0.5, c: 0.85, sw: 45, tip: 0.4 } }));
def('vlr', 'Very-long-range interceptor', 'Missiles', 7.6, 1.5, B => {
  rocket(B, [0, 0, 0], 7.6, 0.56, { col: WH, noseCol: '#d8d6cc', noseL: 1.5, steps: [{ x: 3.0, r: 0.68, len: 0.4 }], bands: [0.7],
    paint: [p(0, 3.0, '#d2d2ca'), p(5.0, 5.25, BAND.lr)], fins: { span: 0.62, c: 1.15, sw: 30, tip: 0.55 }, mid: { x: 0.8, span: 0.1, c: 1.4, sw: 70, tip: 0.1 } });
  ring(B, -0.85, 0.56, '#2a2c2e', 0.08);
});
def('tbd', 'Hit-to-kill missile', 'Missiles', 5.2, 0.62, B => {
  rocket(B, [0, 0, 0], 5.2, 0.255, { col: WH, noseCol: '#2e3134', noseL: 0.7, bands: [0.22, 0.56], paint: [p(3.6, 3.75, BAND.bmd)], fins: { span: 0.2, c: 0.52, sw: 20, tip: 0.6 }, mid: { x: 0.2, span: 0.06, c: 0.5, sw: 60, tip: 0.2, rot: Math.PI / 4 } });
  // the ring of small steering motors behind the seeker: what turns it onto the warhead in the last second
  if (B.q) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(B, 1.75, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.12, 0.035, 0.035, '#3a3d40'); }
});
def('hatm', 'High-altitude interceptor', 'Missiles', 6.2, 0.62, B => {
  // no fins: a flared skirt steadies it, and the kill vehicle rides under a black shroud on the nose
  rocket(B, [0, 0, 0], 6.2, 0.34, { col: WH, noseCol: '#202224', nose: 'cone', noseL: 1.3, tailR: 1.7, bands: [0.35, 0.68], paint: [p(3.9, 4.1, BAND.bmd)], raceway: true });
  if (B.q) lathe(B, [[-3.1, 0.29], [-2.55, 0.18]], '#c8c8c0', { segs: 16 });
  ring(B, 1.75, 0.34, '#2a2c2e', 0.12);
});
def('exom', 'Exo-atmospheric interceptor', 'Missiles', 6.7, 1.3, B => {
  // three stages, each thinner than the last, under a shroud that opens in space
  rocket(B, [0, 0, 0], 6.7, 0.53, { col: WH, noseCol: '#202224', nose: 'cone', noseL: 0.95, steps: [{ x: 2.8, r: 0.66, len: 0.3 }, { x: 4.9, r: 0.58, len: 0.12 }],
    paint: [p(0, 2.8, '#d0d0c8'), p(4.4, 4.6, BAND.bmd)], fins: { span: 0.55, c: 0.75, sw: 25, tip: 0.6 }, mid: { x: 0.1, span: 0.07, c: 2.0, sw: 80, tip: 0.1 } });
  ring(B, -0.55, 0.36, '#2a2c2e', 0.06); ring(B, 1.55, 0.31, '#2a2c2e', 0.05);
});
def('aam', 'Air-to-air missile', 'Missiles', 3.66, 0.63, B => rocket(B, [0, 0, 0], 3.66, 0.178, { col: '#d6d8d4', noseCol: '#c4c6c2', noseL: 0.55, bands: [0.3, 0.62], paint: [p(2.4, 2.52, BAND.aam), p(2.6, 2.66, BAND.aam)],
  mid: { x: 0.2, span: 0.2, c: 0.5, sw: 55, tip: 0.2 }, fins: { span: 0.22, c: 0.36, sw: 40, tip: 0.4 } }));
def('intd', 'Interceptor drone', 'Missiles', 1.2, 0.8, B => {
  rocket(B, [0, 0, 0.3], 1.2, 0.16, { col: '#8c9496', nose: 'dome', noseL: 0.06, paint: [p(0.62, 0.7, BAND.ir)], raceway: false, can: { x: 0.1, span: 0.32, c: 0.16, sw: 15, tip: 0.6, rot: Math.PI / 4 } });
  MB.prop(B, 'prop', -0.72, 0, 0.3, 0.36, 2, P.dark, { axis: [-1, 0, 0], spin: '#5c605a' });
});
def('gbu', 'Guided bomb', 'Missiles', 3.8, 0.8, B => rocket(B, [0, 0, 0], 3.8, 0.46, { col: P.olive, noseCol: '#6a7656', noseL: 1.0, bands: [0.5], raceway: false, paint: [p(2.5, 2.6, '#d8b030')],
  fins: { span: 0.32, c: 0.55, sw: 30, tip: 0.6, rot: Math.PI / 4 }, can: { x: 1.0, span: 0.12, c: 0.4, sw: 45, tip: 0.3, rot: Math.PI / 4 } }));
// ours for striking back, by IC.MUN key (IC.modelOfStrike)
def('crs', 'Our cruise missile', 'Missiles', 5.6, 2.5, B => rocket(B, [0, 0, 0], 5.6, 0.52, { col: '#b6bcc2', noseCol: '#9ca2a8', noseL: 0.8, bands: [0.35, 0.7], raceway: false, paint: [p(3.6, 3.8, BAND.strike)],
  wings: { span: 2.5, c: 0.45, x: 0.5, sw: 6, z: 0.18 }, fins: { span: 0.4, c: 0.45, rot: Math.PI / 4, sw: 40, tip: 0.5 }, intake: true }));
def('tbmu', 'Our tactical ballistic missile', 'Missiles', 4.0, 1.1, B => rocket(B, [0, 0, 0], 4.0, 0.61, { col: WH, noseCol: '#d8d6cc', noseL: 1.3, bands: [0.4], paint: [p(0.6, 0.9, '#2a2c2e'), p(2.2, 2.4, BAND.strike)],
  fins: { span: 0.25, c: 0.6, sw: 15, tip: 0.7, rot: Math.PI / 4 } }));
def('grk', 'Our guided rocket', 'Missiles', 3.9, 0.6, B => rocket(B, [0, 0, 0], 3.9, 0.227, { col: '#6b7350', noseCol: '#5a6144', noseL: 0.6, bands: [0.4], paint: [p(2.6, 2.75, BAND.strike)],
  can: { x: 1.15, span: 0.09, c: 0.16, sw: 30, tip: 0.6 }, fins: { span: 0.16, c: 0.28, sw: 10, tip: 0.9, rot: Math.PI / 4 } }));

// the enemy's weapons, by IC.THR key (THR_MODEL in models.js)
def('owa', 'One-way attack drone', 'Enemy weapons', 3.5, 2.5, B => {
  // a cranked delta with fins up and down at the tips, the warhead in the nose and a piston engine pushing at the back
  const q = B.q;
  MB.slimBody(B, 3.5, 0.45, 0.6, EGR, { nose: 0.75, tail: 0.35 });
  if (q) { lathe(B, [[1.75, 0.003], [1.55, 0.12], [1.3, 0.2], [1.12, 0.22]], '#2a2c2e', { at: [0, 0, 0.6], segs: 12 }); cyl(B, [-0.6, 0, 0.6], 0.12, 0.23, RUST, 'x', { segs: 12 }); }
  wing(B, [{ x: 1.15, y: 0.18, z: 0.5, c: 2.6, t: 0.07 }, { x: 0.2, y: 0.55, z: 0.52, c: 1.65, t: 0.06 }, { x: -1.15, y: 1.25, z: 0.55, c: 0.55, t: 0.05 }], EGR, { mirror: true });
  for (const sg of [1, -1]) wing(B, [{ x: -1.05, y: sg * 1.25, z: 0.22, c: 0.7, t: 0.05 }, { x: -1.35, y: sg * 1.25, z: 0.98, c: 0.38, t: 0.05 }], shade(EGR, 0.85), { thick: [0, 1, 0] });
  if (q) { box(B, -1.32, 0, 0.6, 0.38, 0.4, 0.36, '#3e4044'); for (let i = 0; i < 4; i++) box(B, -1.25 + i * 0.07, 0, 0.8, 0.03, 0.42, 0.04, '#26282a'); }
  MB.prop(B, 'prop', -1.85, 0, 0.6, 0.75, 2, '#1e2022', { axis: [-1, 0, 0], spin: '#3e4044' });
});
def('jdr', 'Jet attack drone', 'Enemy weapons', 3.6, 3.0, B => {
  // the same kind of delta in charcoal, a small turbojet on its back instead of a propeller
  MB.slimBody(B, 3.6, 0.5, 0.6, ECH, { nose: 0.9, tail: 0.4 });
  if (B.q) cyl(B, [0.85, 0, 0.6], 0.12, 0.255, RUST, 'x', { segs: 12 });
  wing(B, [{ x: 0.95, y: 0.2, z: 0.55, c: 2.4, t: 0.06 }, { x: -1.15, y: 1.5, z: 0.55, c: 0.5, t: 0.05 }], ECH, { mirror: true });
  for (const sg of [1, -1]) wing(B, [{ x: -1.05, y: sg * 1.5, z: 0.3, c: 0.6, t: 0.05 }, { x: -1.3, y: sg * 1.5, z: 1.0, c: 0.32, t: 0.05 }], shade(ECH, 0.8), { thick: [0, 1, 0] });
  lathe(B, [[0.85, 0.15], [0.7, 0.2], [-0.5, 0.2], [-0.85, 0.15]], '#55595e', { at: [-1.0, 0, 0.98], cap0: P.intake, cap1: P.nozzle, segs: B.q ? 12 : 6 });
  if (B.q) box(B, -0.7, 0, 0.82, 0.8, 0.08, 0.2, ECH);
});
def('lm', 'Loitering munition', 'Enemy weapons', 1.7, 1.1, B => {
  // a tube with two crosses of wings that spring out after launch, a camera under the nose, a propeller behind
  rocket(B, [0, 0, 0.5], 1.7, 0.16, { col: EOL, noseCol: '#3e4436', noseL: 0.28, paint: [p(0.25, 0.32, RUST)], raceway: false,
    can: { x: 0.55, span: 0.42, c: 0.17, sw: 0, tip: 1 }, fins: { span: 0.38, c: 0.16, sw: 0, tip: 1, rot: Math.PI / 4 } });
  if (B.q) lathe(B, [[0.07, 0.003], [0.035, 0.05], [-0.035, 0.05]], GL, { at: [0.55, 0, 0.4], axis: 'z', segs: 10 });
  MB.prop(B, 'prop', -0.92, 0, 0.5, 0.38, 2, '#1e2022', { axis: [-1, 0, 0], spin: '#3e4044' });
});
def('cm', 'Cruise missile', 'Enemy weapons', 6.2, 2.6, B => rocket(B, [0, 0, 0], 6.2, 0.52, { col: '#646c72', noseCol: '#4a5056', noseL: 0.9, bands: [0.35, 0.7], raceway: false, paint: [p(0.5, 0.68, RUST)],
  wings: { span: 2.6, c: 0.5, x: 0.65, sw: 4, z: 0.16 }, fins: { span: 0.42, c: 0.5, rot: Math.PI / 4, sw: 40, tip: 0.5 }, intake: true }));
def('mcm', 'Manoeuvring cruise missile', 'Enemy weapons', 6.4, 2.4, B => {
  // faceted to hide from radar: a flat-sided body that narrows to a chisel nose, swept wings and a V of tail fins
  const st = [{ x: 3.2, w: 0.02, h: 0.02, z: 0 }, { x: 2.4, w: 0.36, h: 0.16, z: 0 }, { x: 1.4, w: 0.58, h: 0.27, z: 0.01 }, { x: -2.2, w: 0.62, h: 0.3, z: 0.02 }, { x: -3.2, w: 0.38, h: 0.2, z: 0.04 }];
  MB.loft(B, st.slice().sort((a, b) => a.x - b.x), MB.ANG.lo, (x, a) => (a > 100 && a < 260 ? '#3c4248' : x > 2.2 ? '#3c4248' : '#4c535a'), { cap0: P.nozzle, smooth: false });
  if (B.q) MB.loft(B, [{ x: -1.25, w: 0.64, h: 0.31, z: 0.02 }, { x: -1.1, w: 0.64, h: 0.31, z: 0.02 }], MB.ANG.lo, () => RUST, { smooth: false });
  wing(B, plan(0.5, 0.25, 0.08, 1.0, 0.7, 0.28, 35, 0, 0.05, 0.04), '#454c53', { mirror: true, foil: FOIL.flat });
  for (const sg of [1, -1]) wing(B, plan(-2.6, sg * 0.18, 0.15, 0.5, 0.5, 0.22, 45, 90 - sg * 50, 0.05, 0.04), '#454c53', { foil: FOIL.flat });
  if (B.q) MB.loft(B, [{ x: -0.2, w: 0.2, h: 0.06, z: 0.31 }, { x: 0.6, w: 0.24, h: 0.08, z: 0.31 }], MB.ANG.lo, () => P.intake, { cap1: P.intake, smooth: false });
});
def('scm', 'Supersonic cruise missile', 'Enemy weapons', 8.4, 1.7, B => rocket(B, [0, 0, 0], 8.4, 0.67, { col: '#4e5660', noseCol: '#5a626c', nose: 'inlet', noseL: 0.5, bands: [0.25, 0.55, 0.8], paint: [p(0.6, 0.85, RUST)],
  mid: { x: 1.4, span: 0.12, c: 3.2, sw: 80, tip: 0.1, rot: Math.PI / 4 }, fins: { span: 0.45, c: 0.85, rot: Math.PI / 4, sw: 45, tip: 0.35 } }));
def('glb', 'Glide bomb', 'Enemy weapons', 3.5, 2.6, B => {
  // an old bomb with a wing kit strapped on: long straight wings on a saddle over its back, a tail kit behind
  rocket(B, [0, 0, 0], 3.5, 0.45, { col: '#55603f', noseCol: '#4a5436', noseL: 0.95, bands: [0.4], raceway: false, paint: [p(2.15, 2.3, '#d8b030'), p(0.3, 0.42, RUST)], fins: { span: 0.3, c: 0.5, rot: Math.PI / 4, sw: 30, tip: 0.6 } });
  box(B, 0.2, 0, 0.26, 1.1, 0.24, 0.12, '#3a3e36');
  wing(B, plan(0.4, 0.1, 0.34, 1.25, 0.24, 0.2, 2, 2, 0.07, 0.07), '#5c6066', { mirror: true, foil: FOIL.flat });
  if (B.q) for (const sg of [1, -1]) box(B, 0.2, sg * 0.18, 0.18, 0.06, 0.04, 0.2, '#2a2c2a');
});
const BM = { col: '#7b8068', noseCol: '#3e4236', noseL: 2.4, bands: [0.28, 0.62], paint: [p(0.55, 0.85, RUST)], fins: { span: 0.42, c: 0.95, sw: 25, tip: 0.6 } };
def('bm', 'Ballistic missile', 'Enemy weapons', 7.3, 1.9, B => {
  rocket(B, [0, 0, 0], 7.3, 0.92, BM);
  if (B.q) for (const y of [-1, 1]) box(B, -1.2, y * 0.47, 0, 1.6, 0.02, 0.18, '#3a3d33');   // the handling rails
});
def('marv', 'Manoeuvring-warhead missile', 'Enemy weapons', 7.6, 1.9, B => {
  // the warhead steers on its way down: a darker cone with four small fins of its own
  rocket(B, [0, 0, 0], 7.6, 0.92, Object.assign({}, BM, { noseCol: '#2c2e2a', noseL: 2.7, bands: [0.3, 0.62] }));
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a); B.with(q => [q[0], q[1] * ca - q[2] * sa, q[1] * sa + q[2] * ca], () => wing(B, plan(1.95, 0.32, 0, 0.18, 0.4, 0.22, 35, 0, 0.05, 0.04), '#2c2e2a', { foil: FOIL.flat, root: true })); }
});
def('mrbm', 'Medium-range ballistic missile', 'Enemy weapons', 12.0, 2.4, B => {
  // two stages; the warhead's cone rides on top of the second
  rocket(B, [0, 0, 0], 12.0, 1.2, { col: '#6f765e', noseCol: '#2c2e2a', nose: 'cone', noseL: 2.3, steps: [{ x: 6.2, r: 0.85, len: 0.5 }], bands: [0.3, 0.75], paint: [p(0.8, 1.2, RUST), p(6.2, 6.7, '#54594a')], fins: { span: 0.55, c: 1.3, sw: 20, tip: 0.6 } });
  ring(B, 3.7, 1.02, '#3a3e34', 0.1);
});
def('rv', 'Warhead or decoy', 'Enemy weapons', 2.0, 0.6, B => {
  // what comes down at the end: a dark blunt cone, warhead and decoy alike
  lathe(B, B.q ? [[-1.0, 0.003], [-1.0, 0.3], [-0.9, 0.3], [0.8, 0.06], [0.92, 0.04], [1.0, 0.003]] : [[-1.0, 0.3], [1.0, 0.03]], '#2e302c', { segs: B.q ? 16 : 6, cap0: '#1a1b19', col: i => i === 1 ? RUST : '#2e302c' });
});
def('hgv', 'Hypersonic glide vehicle', 'Enemy weapons', 5.5, 2.2, B => {
  // a flat wedge in heat-scorched carbon, a sharp nose, two fins canted out and flaps under its tail
  const st = [{ x: 2.75, w: 0.02, h: 0.02, z: 0.4 }, { x: 1.5, w: 0.4, h: 0.18, z: 0.4, n: 3 }, { x: -1, w: 0.9, h: 0.3, z: 0.4, n: 3 }, { x: -2.75, w: 1.1, h: 0.35, z: 0.42, n: 3 }];
  st.sort((a, b) => a.x - b.x);
  MB.loft(B, st, MB.ANG.mid, (x, a) => (a > 90 && a < 270 ? '#1c1d1e' : x > 1.6 ? '#6a5a4a' : '#3c3e40'), { cap0: P.nozzle, smooth: false });
  for (const sg of [1, -1]) wing(B, plan(-1.8, sg * 0.95, 0.65, 0.6, 0.9, 0.4, 45, 90 - sg * 20, 0.06, 0.06), '#3c3e40', {});
  if (B.q) { for (const sg of [1, -1]) box(B, -2.85, sg * 0.4, 0.15, 0.4, 0.55, 0.04, '#1c1d1e', { pitch: 0.25 }); box(B, -0.9, 0, 0.71, 1.2, 0.5, 0.02, RUST); }
});
def('rkt', 'Guided rocket', 'Enemy weapons', 3.9, 0.6, B => rocket(B, [0, 0, 0], 3.9, 0.23, { col: EOL, noseCol: '#3e4436', noseL: 0.62, bands: [0.45], paint: [p(0.35, 0.5, RUST)],
  can: { x: 1.15, span: 0.08, c: 0.15, sw: 30, tip: 0.6, rot: Math.PI / 4 }, fins: { span: 0.17, c: 0.3, sw: 8, tip: 0.9 } }));
def('arm', 'Anti-radiation missile', 'Enemy weapons', 4.2, 1.1, B => rocket(B, [0, 0, 0], 4.2, 0.25, { col: '#5e646c', noseCol: '#b8bcc0', noseL: 0.7, bands: [0.3, 0.62], paint: [p(0.3, 0.45, RUST)],
  mid: { x: 0.45, span: 0.36, c: 0.9, sw: 50, tip: 0.25 }, fins: { span: 0.3, c: 0.35, sw: 40, tip: 0.45 } }));
def('dcy', 'Air-launched decoy', 'Enemy weapons', 2.8, 1.7, B => {
  // a box of a body with wings that unfold from under it and a canted pair of tail fins; it looks like a fighter to radar
  const st = [{ x: 1.4, w: 0.05, h: 0.05, z: 0 }, { x: 1.0, w: 0.26, h: 0.2, z: 0 }, { x: -1.1, w: 0.3, h: 0.24, z: 0 }, { x: -1.4, w: 0.2, h: 0.16, z: 0.02 }];
  MB.loft(B, st.slice().sort((a, b) => a.x - b.x), MB.ANG.lo, (x, a) => (x > 1.1 ? '#4a5056' : '#7b8088'), { cap0: P.nozzle, smooth: false });
  if (B.q) cyl(B, [-0.9, 0, 0], 0.14, 0.255, RUST, 'x', { segs: 8 });
  wing(B, plan(0.15, 0.1, -0.2, 0.85, 0.3, 0.2, 28, 0, 0.06, 0.05), '#6a7078', { mirror: true, foil: FOIL.flat });
  for (const sg of [1, -1]) wing(B, plan(-1.0, sg * 0.15, 0.2, 0.4, 0.4, 0.2, 40, 90 - sg * 35, 0.05, 0.04), '#6a7078', { foil: FOIL.flat });
});
// the enemy's fighters fire these at ours
def('eirm', 'Their heat-seeking missile', 'Enemy weapons', 2.9, 0.6, B => rocket(B, [0, 0, 0], 2.9, 0.17, { col: '#9aa0a2', nose: 'dome', noseL: 0.1, bands: [0.5], paint: [p(0.4, 0.55, RUST)], raceway: false,
  can: { x: 1.05, span: 0.16, c: 0.2, sw: 45, tip: 0.3 }, fins: { span: 0.2, c: 0.3, sw: 35, tip: 0.4 } }));
def('eaam', 'Their radar missile', 'Enemy weapons', 3.6, 0.7, B => rocket(B, [0, 0, 0], 3.6, 0.2, { col: '#9aa0a2', noseCol: '#7a8084', noseL: 0.55, bands: [0.3, 0.62], paint: [p(0.4, 0.55, RUST)],
  mid: { x: 0.3, span: 0.06, c: 1.6, sw: 80, tip: 0.1 }, fins: { span: 0.3, c: 0.25, sw: 0, tip: 1 } }));

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
  rocket(B, [-2.0, 0, 2.95], 7.3, 0.92, BM);
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
