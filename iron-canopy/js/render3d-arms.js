/* Iron Canopy — launchers that move, in the 3D view (brief 62). Loaded with the 3D view; replay3d.js calls it
   through a few hooks (IC.arms3d) and lends it its helpers (IC.R3D). Everything follows the record at the view's
   time t, so the film's held clock gets the same picture every run:
   - our launchers turn to the bearing of each round they fire (the first seconds of its recorded path) and hold it
     while it goes, the canister's cover blows off and the round's nose leaves the mouth, the launcher kicks back;
     an empty canister stays empty until it is loaded again (two minutes before it fires next);
   - a turret, a gun or a fire-control radar between launches follows the nearest hostile weapon in reach;
   - a round leaves from its canister's mouth along the launcher, not from the middle of the vehicle;
   - the enemy's launchers (`etel`, `ecml`, models-arms.js) stand where their weapons start: the erector lifts the
     round to vertical in the minutes before, then lowers and the launcher drives off. */
(function (IC) {
'use strict';
const U = IC.U;
const A3 = IC.arms3d = {};
const CFG = IC.ARMS3D = { slew: 0.6, lead: 12, hold: 5, reload: 120, reach: 0.25, raise: [180, 120], lower: [20, 80], leave: 150 };
let T = null, H = null;
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

A3.scene = function (v) {
  H = IC.R3D; T = H.THREE();
  v.arms = { pads: null, n: 0, Q: new T.Quaternion(), V: new T.Vector3(), V2: new T.Vector3() };
};

/* ---------- our launchers ---------- */
/* a unit's mover: its moving parts on their parents (a launcher frame on its turntable, covers on the frame) */
A3.mover = function (v, m) {
  if (m.tr.kind !== 'unit' || !m.body || !m.anims.length) return;
  const by = new Map(m.anims.map(A => [A.a.name, A])), X = m.arms = { caps: [], rnds: [], slew: null, launch: null, gun: null, aim: null, az: null, el: null, tl: null, at: -1 };
  for (const A of m.anims) {
    A.base = A.node.position.clone();
    if (A.a.parent && by.has(A.a.parent)) { const P = by.get(A.a.parent); P.node.add(A.node); A.node.position.set(A.a.pivot[0] - P.a.pivot[0], A.a.pivot[1] - P.a.pivot[1], A.a.pivot[2] - P.a.pivot[2]); A.base = A.node.position.clone(); }
    const k = A.a.kind;
    if (k === 'cap') X.caps.push(A); else if (k === 'rnd') X.rnds.push(A); else if (k === 'slew' || k === 'launch' || k === 'gun' || k === 'aim') X[k] = A;
  }
  X.n = Math.max(X.caps.length, X.rnds.length);
  X.face = X.slew ? (IC.modelMesh(m.tr.model, 1).groups[X.slew.a.name].face || 0) : X.aim ? (IC.modelMesh(m.tr.model, 1).groups[X.aim.a.name].face || 0) : 0;
  X.dir = X.launch && IC.modelMesh(m.tr.model, 1).groups[X.launch.a.name].face ? -1 : 1;
};
/* the rounds a unit fired, in order: when, which canister, the bearing of its first leg */
function launches(v, m) {
  const X = m.arms, R = v.S.rec;
  if (X.tl && X.tlN === R.tracks.length) return X.tl;
  const out = [];
  for (const tr of R.tracks) {
    if (tr.kind !== 'missile' || tr.meta.uref !== m.tr.ref) continue;
    const t0 = IC.recFirstT(tr), a = IC.recAt(tr, t0, {}), b = IC.recAt(tr, Math.min(tr.t1, t0 + 4), {});
    if (!a || !b) continue;
    out.push({ t: t0, tr, az: Math.atan2(b.y - a.y, b.x - a.x), el: Math.atan2((b.alt - a.alt) * 10, Math.hypot(b.x - a.x, b.y - a.y) || 1e-3) });
  }
  out.sort((p, q) => p.t - q.t);
  out.forEach((L, i) => { L.i = X.n ? i % X.n : 0; });
  X.tl = out; X.tlN = R.tracks.length;
  return out;
}
/* where the turntable wants to point at t: at the next round's bearing from a few seconds before it, at the last one
   for a while after, else at the nearest hostile weapon in reach, else where it was */
function wantAz(v, m, t, L) {
  for (const l of L) if (t >= l.t - CFG.lead && t <= l.t + CFG.hold) return l.az;
  let best = null, bd = CFG.reach * 1000;
  const p = IC.recAt(m.tr, t, m.ust); if (!p) return null;
  for (const mv of v.movers) {
    if (mv.tr.kind !== 'threat' || !mv.vis || mv.tr.side !== 'enemy') continue;
    const s = mv.st, d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) { m.arms.elW = Math.atan2(best.alt * 10, bd); return Math.atan2(best.y - p.y, best.x - p.x); }
  return null;
}
/* each moving part's angle this frame; true when it is handled here */
A3.anim = function (v, m, A, st, t, dt) {
  const X = m.arms; if (!X) return false;
  if (X.at !== t) frameUnit(v, m, st, t, dt);
  const k = A.a.kind, ax = A.axis;
  if (k === 'slew' || k === 'aim') { A.node.quaternion.setFromAxisAngle(ax, -X.psi); return true; }
  if (k === 'launch') { A.node.quaternion.setFromAxisAngle(ax, -(X.up + X.kick)); return true; }
  if (k === 'gun') { A.node.quaternion.setFromAxisAngle(ax, -U.clamp(X.el, 0.05, 1.2)); return true; }
  if (k === 'cap' || k === 'rnd') {
    const i = A.a.i != null ? A.a.i : +A.a.name.slice(3), s = X.can[i] || 0;
    // the round is in its canister until it leaves; the cover is on until then, then flies off and falls
    if (k === 'rnd') { A.node.visible = s >= 0; return true; }
    if (s >= 0) { A.node.visible = true; A.node.position.copy(A.base); A.node.quaternion.identity(); return true; }
    const a = -s;
    A.node.visible = a < 2.5;
    if (A.node.visible) { const d = X.dir; A.node.position.set(A.base.x + d * 0.12 * a, A.base.y + 0.06 * a - 0.05 * a * a, A.base.z + (i % 2 ? 1 : -1) * 0.02 * a); A.node.quaternion.setFromAxisAngle(v.arms.V.set(0.3, 0.2, 1).normalize(), a * 7); }
    return true;
  }
  return false;
};
function frameUnit(v, m, st, t, dt) {
  const X = m.arms, L = launches(v, m);
  X.at = t;
  let az = wantAz(v, m, t, L);
  const rest = st.h || 0;
  if (az == null) az = X.az != null ? X.az : rest + X.face;
  // the turntable turns at its own pace; a scrub jumps
  if (X.az == null || dt > 2) X.az = az; else X.az += U.clamp(wrap(az - X.az), -CFG.slew * dt, CFG.slew * dt);
  X.psi = wrap(X.az - rest - X.face);
  const elW = X.elW != null ? X.elW + 0.05 : 0.3; X.el = X.el == null || dt > 2 ? elW : X.el + U.clamp(elW - X.el, -0.4 * dt, 0.4 * dt);
  // the launcher frame: up when emplaced, a kick back as each round goes
  // up when emplaced, and always for a launch (a shot opened at the launch sees it already up)
  let upK = m.launchK != null ? m.launchK : 1;
  for (const l of L) upK = Math.max(upK, ease((t - l.t + 30) / 8) * (1 - ease((t - l.t - 40) / 8)));
  const up = X.launch ? (IC.modelMesh(m.tr.model, 1).groups[X.launch.a.name].up || 0) : 0;
  let kick = 0;
  X.can = X.can || []; for (let i = 0; i < X.n; i++) X.can[i] = 0;
  for (let j = 0; j < L.length; j++) {
    const l = L[j], a = t - l.t;
    if (a >= 0 && a < 1.5) kick += 0.05 * Math.exp(-a * 3) * Math.sin(a * 22);
    if (a < 0) continue;
    // empty from its launch until it is loaded for the next round from the same canister
    let next = null; for (let k = j + 1; k < L.length; k++) if (L[k].i === l.i) { next = L[k]; break; }
    if (!next || t < next.t - CFG.reload) X.can[l.i] = -a;
  }
  X.up = up * upK; X.kick = kick;
}
/* the mouth a round leaves from: the canister's cover pivot at rest and the way the canister points, in the scene
   (P, D); false when its launcher is not drawn */
A3.mouth = function (v, m, P, D) {
  if (m.tr.kind !== 'missile' || !m.tr.meta.uref) return false;
  const u = H.moverOfRef(v, m.tr.meta.uref); if (!u || !u.arms || !u.vis || !u.grp.visible) return false;
  const L = launches(v, u), l = L.find(q => q.tr === m.tr); if (!l) return false;
  const cap = u.arms.caps.find(A => (A.a.i != null ? A.a.i : +A.a.name.slice(3)) === l.i) || u.arms.rnds.find(A => A.a.i === l.i);
  if (!cap) return false;
  u.grp.updateMatrixWorld(true);
  const par = cap.node.parent; P.copy(cap.base); par.localToWorld(P);
  par.getWorldQuaternion(v.arms.Q); D.set(u.arms.dir, 0, 0).applyQuaternion(v.arms.Q);
  return true;
};
/* a round's first seconds (brief 67). The simulation starts a round at full speed on its launcher; drawn, it leaves
   from rest: its recorded path is flown on a clock (tau) that starts still and runs up to the real one, a third
   faster than real two thirds of the way and then exactly on time at the recorded speed when the window ends, so
   nothing jumps. For the first part it goes along its canister, nose first out of the mouth, and bends onto that
   path (the pitch-over); the model points the way it is drawn moving, so the nose never snaps round. The smoke
   (render3d-war.js) is laid from the same places. */
const LA = { win: 2.6, min: 0.6 };
const tau = (a, A) => { const u = a / A; return a - a * (1 - u) * (1 - u); };
// a short flight (a point-defence round) gets a shorter run-up: the hit stays where and when it was
// (one still flying, in the live view, gets the longest)
const winOf = m => m.tr.live ? LA.win : U.clamp(Math.min(LA.win, (m.tr.t1 - m.tL) * 0.35), LA.min, LA.win);
const LP = {}, LQ = {};
/* where a round is drawn at time tp of its launch window (into out, in the scene); false outside it */
A3.launchAt = function (v, m, tp, out) {
  const tr = m.tr; if (tr.kind !== 'missile' || !v.arms || m.tL == null) return false;
  const a = tp - m.tL, A = m._lw && !m._lwLive ? m._lw : (m._lw = winOf(m));
  m._lwLive = m.tr.live;
  if (a < 0 || a >= A) return false;
  // the mouth and the canister's axis, once a frame (they move with the launcher's kick); without a launcher drawn,
  // the first recorded point and the way it went
  const mo = m._mo || (m._mo = { P: new T.Vector3(), D: new T.Vector3(), at: NaN, ok: false });
  if (mo.at !== v.t) {
    mo.at = v.t;
    if (A3.mouth(v, m, mo.P, mo.D)) { mo.ok = true; mo.P.addScaledVector(mo.D, -(m.MP ? m.MP.len : 0.05) * 0.45); }   // its nose at the mouth
    else {
      const p = IC.recAt(tr, m.tL, LP), q = IC.recAt(tr, Math.min(tr.t1, m.tL + 0.5), LQ);
      mo.ok = !!(p && q);
      if (mo.ok) {
        mo.P.set(p.x - v.cx, H.hT(v, p.x, p.y) * v.hk + p.alt * H.KM * v.hk, p.y - v.cy);
        mo.D.set(q.x - p.x, (q.alt - p.alt) * H.KM * v.hk, q.y - p.y); if (mo.D.lengthSq() < 1e-12) mo.D.set(0, 1, 0); mo.D.normalize();
      }
    }
  }
  if (!mo.ok) return false;
  const r = IC.recAt(tr, m.tL + tau(a, A), LP); if (!r) return false;
  const r0 = IC.recAt(tr, m.tL, LQ);
  const rx = r.x - v.cx, ry = H.hT(v, r.x, r.y) * v.hk + r.alt * H.KM * v.hk, rz = r.y - v.cy;
  const d = Math.hypot(r.x - r0.x, r.y - r0.y, (r.alt - r0.alt) * H.KM * v.hk), k = ease(a / (A * 0.8));
  // along the canister as far as it has come along its path, bending onto the path
  out.x = mo.P.x + mo.D.x * d; out.y = mo.P.y + mo.D.y * d; out.z = mo.P.z + mo.D.z * d;
  out.x += (rx - out.x) * k; out.y += (ry - out.y) * k; out.z += (rz - out.z) * k;
  return true;
};
const FP = { x: 0, y: 0, z: 0 }, FQ = { x: 0, y: 0, z: 0 };
A3.fix = function (v, m, st, t) {
  if (!A3.launchAt(v, m, t, FP)) return;
  const A = m._lw, a = t - m.tL, mo = m._mo, rh = -m.grp.rotation.y, rp = m.grp.rotation.z;   // (the recorded attitude, as shown)
  m.grp.position.set(FP.x, FP.y, FP.z);
  // the nose the way it moves (looking a moment ahead, so the start is not a standstill), turning onto the recorded
  // attitude over the last quarter of the window
  let dx = mo.D.x, dy = mo.D.y, dz = mo.D.z;
  if (A3.launchAt(v, m, Math.min(t + 0.05, m.tL + A - 1e-3), FQ)) { const ex = FQ.x - FP.x, ey = FQ.y - FP.y, ez = FQ.z - FP.z; if (ex * ex + ey * ey + ez * ez > 1e-14) { dx = ex; dy = ey; dz = ez; } }
  let h = Math.atan2(dz, dx), p = Math.atan2(dy, Math.hypot(dx, dz));
  const e = ease((a - A * 0.75) / (A * 0.25));
  if (e > 0) { h += wrap(rh - h) * e; p += (rp - p) * e; }
  m.grp.rotation.set(0, -h, p, 'YZX');
};
A3.ease = ease;

/* ---------- the enemy's launchers ---------- */
/* every hostile weapon that starts on the ground gets a launcher there; weapons from one place share it */
function pads(v) {
  const R = v.S.rec, W = v.arms;
  if (W.pads && W.padsN === R.tracks.length) return W.pads;
  const out = W.pads || [];
  for (const tr of R.tracks) {
    if (tr.kind !== 'threat' || tr.side !== 'enemy' || !tr.ref || !tr.ref.d) continue;
    const cls = tr.ref.d.cls, key = cls === 'bal' || cls === 'hgv' ? 'etel' : cls === 'cm' ? 'ecml' : null;
    if (!key || out.some(p => p.trs.includes(tr))) continue;
    const t0 = IC.recFirstT(tr), a = IC.recAt(tr, t0, {}), b = IC.recAt(tr, Math.min(tr.t1, t0 + 20), {});
    if (!a || !b || a.alt > 0.05) continue;
    const az = Math.atan2(b.y - a.y, b.x - a.x);
    // a launcher for each place a weapon leaves from (a ballistic battery's launchers stand metres apart)
    let p = out.find(q => q.key === key && Math.hypot(q.x - a.x, q.y - a.y) < (key === 'etel' ? 0.01 : 0.05));
    if (!p) out.push(p = { key, x: a.x, y: a.y, az, trs: [], t0: [], obj: null });
    p.trs.push(tr); p.t0.push(t0);
  }
  W.pads = out; W.padsN = R.tracks.length;
  return out;
}
/* a model in the scene that is not a track: its body, its moving parts on their parents */
function standalone(v, key) {
  const MP = H.modelParts(key, null, null), grp = new T.Group(), body = new T.Group(); grp.add(body);
  body.add(new T.Mesh(MP.solid, MP.mat || H.solidMat()));
  const anims = new Map();
  for (const a of MP.anim) { const node = new T.Group(); node.position.set(a.pivot[0], a.pivot[1], a.pivot[2]); node.add(new T.Mesh(a.geom, MP.mat || H.solidMat())); anims.set(a.name, { a, node, base: null, axis: new T.Vector3(a.axis[0], a.axis[1], a.axis[2]).normalize() }); }
  for (const A of anims.values()) {
    const P = A.a.parent && anims.get(A.a.parent);
    if (P) { P.node.add(A.node); A.node.position.set(A.a.pivot[0] - P.a.pivot[0], A.a.pivot[1] - P.a.pivot[1], A.a.pivot[2] - P.a.pivot[2]); } else body.add(A.node);
    A.base = A.node.position.clone();
  }
  grp.scale.setScalar(1); v.scene.add(grp);
  return { grp, anims, MP };
}
A3.frame = function (v, t) {
  if (!v.arms || !v.S.rec) return;
  for (const p of pads(v)) {
    const first = Math.min(...p.t0), last = Math.max(...p.t0);
    const on = t > first - CFG.raise[0] - 30 && t < last + CFG.leave + 60;
    if (!on) { if (p.obj) p.obj.grp.visible = false; continue; }
    const h = p.key === 'etel' ? p.az + Math.PI : p.az;
    if (!p.obj) {
      p.obj = standalone(v, p.key);
      // where the vehicle stands: its round, erected, over the point the weapon leaves from (measured on the model once)
      const R = p.obj.anims.get('rnd0'), E = p.obj.anims.get('erect'), q = v.arms.V;
      p.ox = p.oy = 0;
      if (R) {
        p.obj.grp.position.set(0, 0, 0); p.obj.grp.rotation.set(0, -h, 0, 'YZX');
        if (E) E.node.quaternion.setFromAxisAngle(E.axis, -E.a.up);
        // (a point on the round's axis: its pivot is the erector's hinge, 0.95 m below the axis)
        p.obj.grp.updateMatrixWorld(true); q.set(0, 0.0095, 0); R.node.localToWorld(q);
        p.ox = -q.x; p.oy = -q.z;
        if (E) E.node.quaternion.identity();
      }
    }
    const O = p.obj, g = O.grp; g.visible = true;
    // it drives off a while after its last round, along its heading
    const go = Math.max(0, t - last - CFG.leave), dist = go < 0 ? 0 : 0.083 * go * Math.min(1, go / 10) / 2;   // 30 km/h, pulling away
    const x = p.x + p.ox + Math.cos(h) * dist, y = p.y + p.oy + Math.sin(h) * dist;
    g.position.set(x - v.cx, H.hT(v, x, y) * v.hk, y - v.cy); g.rotation.set(0, -h, 0, 'YZX');
    for (const A of O.anims.values()) {
      const k = A.a.kind;
      if (k === 'erect') {
        // up to vertical over a minute, three minutes before; down again after its round has gone
        const r = ease((t - (first - CFG.raise[0])) / (CFG.raise[0] - CFG.raise[1])), d = ease((t - (last + CFG.lower[0])) / CFG.lower[1]);
        A.node.quaternion.setFromAxisAngle(A.axis, -A.a.up * r * (1 - d));
      } else if (k === 'launch') {
        const r = ease((t - (first - 90)) / 40), d = ease((t - (last + 30)) / 40);
        A.node.quaternion.setFromAxisAngle(A.axis, -A.a.up * r * (1 - d));
      } else if (k === 'rnd' || k === 'cap') {
        // canisters fire in turn; a ballistic launcher's one round leaves with its first launch
        const i = A.a.i || 0, tl = p.t0.filter((_, j) => j % Math.max(1, p.key === 'etel' ? 1 : 2) === i % 2).sort((a, b) => a - b)[0];
        const gone = tl != null && t >= tl;
        if (k === 'rnd') A.node.visible = !gone;
        else { const a = gone ? t - tl : -1; A.node.visible = a < 2.5; if (a > 0) A.node.position.set(A.base.x + 0.12 * a, A.base.y + 0.06 * a - 0.05 * a * a, A.base.z); else A.node.position.copy(A.base); }
      }
    }
  }
};
A3.stats = v => v.arms ? { pads: (v.arms.pads || []).length } : null;

})(window.IC);
