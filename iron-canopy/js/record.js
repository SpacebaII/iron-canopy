/* Iron Canopy — the recorder. Every step it notes where everything that moves is (position, height, heading,
   speed, whether radar saw it) in ring buffers that hold the last 15 game minutes, and keeps the events of that
   time from the event bus. The replay window (replay3d.js) reads them back; nothing here touches the DOM, and the
   recorder only reads what the state holds, so it keeps working however the movers come to move. */
(function (IC) {
'use strict';
const U = IC.U;

const REC = IC.REC = { span: 900, dt: 0.5, purgeEvery: 30 };
const F = 8;                 // floats a sample: t x y alt h spd det aff
const AFF = { U: 0, F: 1, A: 1, N: 2, S: 3, H: 4, D: 5 };
IC.REC_AFF = ['U', 'F', 'N', 'S', 'H', 'D'];
const CAP = Math.ceil(REC.span / REC.dt) + 2;

/* the recorder lives on the state but stays out of any save: it is derived data */
function recOf(S) {
  if (S.rec) return S.rec;
  const R = { t0: S.time, next: S.time, tracks: [], of: new WeakMap(), ev: [], evN: 0, purgeT: S.time, ms: 0, n: 0 };
  Object.defineProperty(S, 'rec', { value: R, enumerable: false, configurable: true, writable: true });
  return R;
}
IC.recOf = recOf;

/* ---------- ring buffers ---------- */
function newTrack(R, ref, kind, model, name, side, meta) {
  const tr = { id: ref.id || IC.nid('rec'), ref, kind, model, name, side, meta: meta || {}, buf: new Float32Array(32 * F), cap: 32, n: 0, head: 0, t0: 0, t1: 0, live: true, seen: 0 };
  R.tracks.push(tr); R.of.set(ref, tr);
  return tr;
}
function push(tr, t, x, y, alt, h, spd, det, aff) {
  if (tr.n === tr.cap && tr.cap < CAP) {
    // grow, keeping the samples in order
    const cap = Math.min(CAP, tr.cap * 2), nb = new Float32Array(cap * F);
    for (let i = 0; i < tr.n; i++) { const s = ((tr.head + i) % tr.cap) * F; for (let f = 0; f < F; f++) nb[i * F + f] = tr.buf[s + f]; }
    tr.buf = nb; tr.cap = cap; tr.head = 0;
  }
  let at;
  if (tr.n < tr.cap) { at = ((tr.head + tr.n) % tr.cap) * F; tr.n++; } else { at = tr.head * F; tr.head = (tr.head + 1) % tr.cap; }
  const b = tr.buf;
  b[at] = t; b[at + 1] = x; b[at + 2] = y; b[at + 3] = alt; b[at + 4] = h; b[at + 5] = spd; b[at + 6] = det; b[at + 7] = aff;
  if (tr.n === 1) tr.t0 = t;
  tr.t1 = t;
}
const at = (tr, i, f) => tr.buf[((tr.head + i) % tr.cap) * F + f];
IC.recGet = at;
/* the first sample still held */
IC.recFirstT = tr => tr.n ? at(tr, 0, 0) : 0;
/* the sample index at or before time t (binary search over the ring) */
function indexAt(tr, t) {
  let lo = 0, hi = tr.n - 1;
  if (hi < 0 || t < at(tr, 0, 0)) return -1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (at(tr, mid, 0) <= t) lo = mid; else hi = mid - 1; }
  return lo;
}
const lerpA = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
/* the state of a track at time t, interpolated; null when it was not there then */
IC.recAt = function (tr, t, out) {
  const i = indexAt(tr, t);
  if (i < 0) return null;
  const o = out || {};
  if (i === tr.n - 1 || t <= at(tr, i, 0)) {
    // past the last sample: still there for one interval after it
    if (i === tr.n - 1 && t > at(tr, i, 0) + REC.dt * 2.5) return null;
    o.x = at(tr, i, 1); o.y = at(tr, i, 2); o.alt = at(tr, i, 3); o.h = at(tr, i, 4); o.spd = at(tr, i, 5); o.det = at(tr, i, 6); o.aff = at(tr, i, 7); o.t = at(tr, i, 0);
    return o;
  }
  const ta = at(tr, i, 0), tb = at(tr, i + 1, 0), k = tb > ta ? (t - ta) / (tb - ta) : 0;
  o.t = t; o.x = U.lerp(at(tr, i, 1), at(tr, i + 1, 1), k); o.y = U.lerp(at(tr, i, 2), at(tr, i + 1, 2), k); o.alt = U.lerp(at(tr, i, 3), at(tr, i + 1, 3), k);
  o.h = lerpA(at(tr, i, 4), at(tr, i + 1, 4), k); o.spd = U.lerp(at(tr, i, 5), at(tr, i + 1, 5), k); o.det = at(tr, i, 6); o.aff = at(tr, i, 7);
  return o;
};
/* the samples between t0 and t1 as [x, y, alt, t, ...] pushed into out (for trails) */
IC.recPath = function (tr, t0, t1, out) {
  out = out || [];
  let i = indexAt(tr, t0); if (i < 0) i = 0;
  for (; i < tr.n; i++) { const t = at(tr, i, 0); if (t > t1) break; if (t >= t0 - REC.dt) out.push(at(tr, i, 1), at(tr, i, 2), at(tr, i, 3), t); }
  return out;
};
/* did the track come within r of (x, y) between t0 and t1? */
IC.recNear = function (tr, x, y, r, t0, t1) {
  let i = indexAt(tr, t0); if (i < 0) i = 0;
  const r2 = r * r;
  for (; i < tr.n; i++) { const t = at(tr, i, 0); if (t > t1) break; const dx = at(tr, i, 1) - x, dy = at(tr, i, 2) - y; if (dx * dx + dy * dy < r2) return true; }
  return false;
};
/* what can be replayed: from the oldest sample still held to now */
IC.recRange = function (S) {
  const R = recOf(S);
  return { t0: Math.max(R.t0, S.time - REC.span), t1: S.time };
};
IC.recTracks = S => recOf(S).tracks;
IC.recEvents = (S, t0, t1) => recOf(S).ev.filter(e => e.t >= t0 && e.t <= t1);

/* ---------- sampling ---------- */
const spdOf = (o, tr) => o.spd != null && o.vx == null ? o.spd : Math.hypot(o.vx || 0, o.vy || 0);
const hdgOf = (o, tr, fb) => o.h != null ? o.h : o.a != null ? o.a : (o.vx || o.vy) ? Math.atan2(o.vy, o.vx) : fb;
const lastH = tr => tr.n ? at(tr, tr.n - 1, 4) : 0;
/* a missile flying at an aircraft climbs to it as it closes (the state keeps no height for those) */
function missileAlt(m, tr) {
  if (m.alt) return m.alt;
  const t = m.target; if (!t || t.alt == null) return 0;
  const d = U.dxy(m.x, m.y, t.x, t.y);
  if (tr.meta.d0 == null) tr.meta.d0 = Math.max(d, 1);
  return t.alt * U.clamp(1 - d / tr.meta.d0, 0, 1);
}
function sampleThreat(S, R, t, now) {
  let tr = R.of.get(t);
  if (!tr) {
    const civ = !!t.d.civil, name = t.tn ? `TN ${t.tn}` : t.cs || IC.fullName(t.d);
    tr = newTrack(R, t, 'threat', IC.modelOfThreat(t, true), name, civ ? 'civil' : 'enemy', { type: t.type, klass: t.d.klass, cs: t.cs, livery: t.livery || null, civil: civ });
  }
  if (t.tn && !tr.meta.tn) { tr.meta.tn = t.tn; tr.name = `TN ${t.tn}${t.cs ? ' · ' + t.cs : ''}`; }
  tr.meta.klass = t.klass || tr.meta.klass;
  const aff = t.decoyKnown ? 'D' : t.aff || 'U';
  push(tr, now, t.x, t.y, t.alt || 0, hdgOf(t, tr, lastH(tr)), spdOf(t), t.det ? 1 : 0, AFF[aff] || 0);
  tr.seen = now;
}
function sampleSimple(R, o, now, kind, model, name, side, alt, meta) {
  let tr = R.of.get(o);
  if (!tr) tr = newTrack(R, o, kind, model, name, side, meta);
  const spd = kind === 'veh' || kind === 'unit' ? (tr.n ? U.dxy(o.x, o.y, at(tr, tr.n - 1, 1), at(tr, tr.n - 1, 2)) / Math.max(1e-3, now - tr.t1) : 0) : spdOf(o);
  push(tr, now, o.x, o.y, alt, hdgOf(o, tr, lastH(tr)), spd, o.radarOn ? 1 : 0, o.side === 'us' || side === 'us' ? 1 : 4);
  tr.seen = now;
}

/* the step: a sample of everything that moves every REC.dt game seconds */
IC.record = function (S, dt) {
  const R = recOf(S);
  if (S.time < R.next) return;
  R.next = S.time + REC.dt;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const now = S.time;
  for (const t of S.threats) if (!t.dead) sampleThreat(S, R, t, now);
  for (const m of S.missiles) if (!m.dead) { let tr = R.of.get(m); if (!tr) tr = newTrack(R, m, 'missile', IC.modelOfMissile(m), `${m.mun} from ${m.src || 'a battery'}`, 'us', { mun: m.mun }); push(tr, now, m.x, m.y, missileAlt(m, tr), hdgOf(m, tr, lastH(tr)), m.spd || 0, 1, 1); tr.seen = now; }
  for (const m of S.eaam) { let tr = R.of.get(m); if (!tr) tr = newTrack(R, m, 'missile', 'aam', 'Air-to-air missile', 'enemy', {}); push(tr, now, m.x, m.y, missileAlt(m, tr), hdgOf(m, tr, lastH(tr)), m.spd || 0, 1, 4); tr.seen = now; }
  for (const s of S.strikes) { let tr = R.of.get(s); if (!tr) tr = newTrack(R, s, 'missile', s.mun === 'GBU' ? 'gbu' : 'cm', `${s.mun} from ${s.src || 'a launcher'}`, s.side === 'us' ? 'us' : 'enemy', { mun: s.mun }); push(tr, now, s.x, s.y, s.alt || 0, hdgOf(s, tr, lastH(tr)), s.spd || 0, 1, s.side === 'us' ? 1 : 4); tr.seen = now; }
  for (const a of S.air) if (!a.dead && !a.gnd) sampleSimple(R, a, now, 'air', IC.modelOfAir(a), a.name, 'us', a.alt || 0, { kind: a.kind, n: a.n });
  for (const b of S.infra) if (b.parts && b.moves) for (const m of b.moves) if (!m.dead && m.phase !== 'start') sampleSimple(R, m, now, 'gnd', IC.modelOfType(m.type), m.who || m.T.name, m.mil ? 'us' : 'civil', m.alt || 0, { type: m.type, livery: m.livery || null, ap: b.id });
  for (const v of S.vehicles) if (!v.dead) sampleSimple(R, v, now, 'veh', v.kind === 'truck' ? 'truck' : 'truck', v.name, 'us', 0, { trucks: v.trucks });
  for (const u of S.units) if (!u.dead) sampleSimple(R, u, now, 'unit', IC.modelOfUnit(u.type), u.name, 'us', 0, { type: u.type, n: IC.unitVehicles(u.d) });
  // what is gone stays in the record until its last sample ages out
  if (now - R.purgeT > REC.purgeEvery) {
    R.purgeT = now;
    const old = now - REC.span;
    R.tracks = R.tracks.filter(tr => { if (tr.seen < now - REC.dt * 1.5) tr.live = false; return tr.t1 > old; });
    R.ev = R.ev.filter(e => e.t > old);
    if (R.t0 < old) R.t0 = old;
  }
  if (t0) { R.ms += performance.now() - t0; R.n++; }
};

/* ---------- events ---------- */
function damaged(S, x, y) {
  const out = [];
  const g = IC.groundAt ? IC.groundAt(S, x, y) : null;
  if (g && g.kind === 'block' && g.b) out.push({ kind: 'block', b: g.b });
  for (const b of S.infra) if (b.parts && U.dxy(x, y, b.x, b.y) < (b.radius || 60)) for (const p of b.parts) {
    if (!p.built || p.kind === 'runway' || p.kind === 'taxi' || p.kind === 'apron') continue;
    const d = p.w != null && p.a != null ? Math.hypot(Math.max(0, Math.abs(IC.rectLocal(p, { x, y }).x) - p.w / 2), Math.max(0, Math.abs(IC.rectLocal(p, { x, y }).y) - (p.h || p.w) / 2)) : U.dxy(x, y, p.x, p.y) - (p.r || 0.1);
    if (d < 1.2) out.push({ kind: 'part', p, ap: b });
  }
  return out;
}
IC.on(function (S, type, d) {
  if (!S || !S.rec) return;
  const R = S.rec, ev = { id: ++R.evN, t: S.time, kind: type };
  switch (type) {
    case 'impact': Object.assign(ev, { x: d.x, y: d.y, alt: 0, sz: d.src && d.src.d ? Math.min(2, 0.6 + d.src.d.dmg / 100) : 1, name: d.hit ? d.hit.name : 'open ground', text: `${d.hit ? d.hit.name : 'Open ground'} hit by ${d.src && d.src.d ? IC.fullName(d.src.d) : 'a weapon'}`, dmg: damaged(S, d.x, d.y) }); break;
    case 'kill': Object.assign(ev, { x: d.x, y: d.y, alt: d.alt || 0, sz: 0.6, name: d.tn ? `TN ${d.tn}` : IC.fullName(d.d), text: `${d.tn ? 'TN ' + d.tn + ' (' + IC.fullName(d.d) + ')' : IC.fullName(d.d)} shot down` }); break;
    case 'intercept': Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.alt || d.t.alt || 0, sz: 0.8, name: d.t.tn ? `TN ${d.t.tn}` : 'warhead', text: `Intercept ${d.alt ? U.alt(d.alt) + ' up' : ''}` }); break;
    case 'launch': Object.assign(ev, { x: d.u.x, y: d.u.y, alt: 0, sz: 0.3, name: d.u.name, text: `${d.u.name} fires at TN ${d.t.tn || '?'}`, quiet: true }); break;
    case 'fire': Object.assign(ev, { x: d.x, y: d.y, alt: 0, sz: 0.3, name: d.name, text: `${d.name} fires`, quiet: true }); break;
    case 'crash': Object.assign(ev, { x: d.m.x, y: d.m.y, alt: 0, sz: 1, name: d.m.who || 'aircraft', text: `Crash at ${d.ap.name}: ${d.cause || ''}`, dmg: [] }); break;
    case 'collision': Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.t.alt || 0, sz: 1, name: d.t.cs || 'aircraft', text: 'Collision' }); break;
    default: return;
  }
  R.ev.push(ev);
  if (R.ev.length > 600) R.ev.shift();
});

/* the mean time a recorder call took, in ms (tests and the performance tool) */
IC.recCost = S => { const R = S.rec; return R && R.n ? R.ms / R.n : 0; };

})(window.IC);
