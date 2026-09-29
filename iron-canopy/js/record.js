/* Iron Canopy — the recorder. Every half second it notes where everything that moves is (position, height,
   heading, speed, whether radar saw it, and for a missile how it is guided) in ring buffers that hold the last 15
   game minutes; while missiles fly, they and their targets are noted every step, so turns and breaks read. It keeps
   the events of that time from the event bus: launches, hits, chaff and flares, lost locks, decoys and misses.
   The replay and the live view (replay3d.js) read them back, smoothed, with bank, pitch and g (IC.recAttitude).
   An aircraft keeps one track from pushback through take-off, the flight and the landing to its stand: the ground
   move and the flight are joined by their tail (or air wing flight), each sample carries the ground phase, and
   IC.recPose turns that into how the model sits: attitude, gear, flaps, the crab into a crosswind, the flare.
   Nothing here touches the DOM, and the recorder only reads what the state holds. */
(function (IC) {
'use strict';
const U = IC.U;

const REC = IC.REC = { span: 900, dt: 0.5, fine: 0.25, purgeEvery: 30 };
const F = 9;                 // floats a sample: t x y alt h spd det aff ph (a missile's guidance, a target's notch)
const AFF = { U: 0, F: 1, A: 1, N: 2, S: 3, H: 4, D: 5 };
IC.REC_AFF = ['U', 'F', 'N', 'S', 'H', 'D'];
const CAP = Math.ceil(REC.span / REC.fine) + 2;

/* how a missile is guided at a moment, as the replay colours its lock line. The simulation today knows the seeker
   and whether the lock was lost or a decoy took it; the phase a missile keeps itself (m.phase) wins when it has one */
const GUIDE = IC.GUIDANCE = [
  null,
  { k: 'mid', name: 'Midcourse', brief: 'flying on the launcher\'s data towards where the target will be', col: '#8fb8ff' },
  { k: 'sarh', name: 'Semi-active', brief: 'homing on the battery\'s radar reflected off the target: the radar must stay on it', col: '#ffd24a' },
  { k: 'arh', name: 'Active', brief: 'its own radar has the target: it no longer needs the launcher', col: '#ff8a3c' },
  { k: 'ir', name: 'Heat-seeking', brief: 'its seeker sees the target\'s heat: flares can pull it off', col: '#ff6fd0' },
  { k: 'cmd', name: 'Command', brief: 'steered by the battery\'s radar, which watches both the missile and the target', col: '#6fd2ff' },
  { k: 'term', name: 'Terminal', brief: 'its seeker closes on the target for a direct hit', col: '#ffffff' },
  { k: 'lost', name: 'Lost lock', brief: 'nothing guides it any more: it flies on and misses', col: '#8fa3b0' },
  { k: 'decoy', name: 'Decoyed', brief: 'its seeker took a flare or a chaff cloud for the target', col: '#b48cff' }
];
const PH = {}; GUIDE.forEach((g, i) => { if (g) PH[g.k] = i; });
/* an aircraft's phase, in the sample's last field (times two; the low bit is the notch): on the ground from
   groundops.js, and in the air the approach */
const GPH = IC.REC_PHASE = { air: 0, push: 1, taxi: 2, hold: 3, roll: 4, final: 5, land: 6, rollout: 7, park: 8, appr: 9 };
const GOPS_PH = { push: 1, taxi: 2, hold: 3, lineup: 3, wait: 3, svc: 3, roll: 4, final: 5, land: 6, rollout: 7, parkin: 8, stranded: 8 };
IC.GUIDANCE_ACTIVE_R = 150;   // an active seeker goes on its own in the last 15 km
function phaseOf(S, m, enemy) {
  if (m.phase && PH[m.phase]) return PH[m.phase];
  if (m.lostLock) return PH.lost;
  if (m.fooled) return PH.decoy;
  const sk = enemy ? (m.ir ? 'IR' : 'ARH') : m.M && m.M.seeker, t = m.target, r = t ? U.dxy(m.x, m.y, t.x, t.y) : 1e9;
  switch (sk) {
    case 'SARH': return PH.sarh;
    case 'CMD': return PH.cmd;
    case 'IR': return PH.ir;
    case 'ARH': return r < IC.GUIDANCE_ACTIVE_R ? PH.arh : PH.mid;
    case 'HTK': return (m.pip ? m.pip.T - S.time < 6 : r < 80) ? PH.term : PH.mid;
    default: return PH.mid;
  }
}
IC.recPhaseOf = phaseOf;

/* the recorder lives on the state but stays out of any save: it is derived data */
function recOf(S) {
  if (S.rec) return S.rec;
  const R = { t0: S.time, next: S.time, nextFine: S.time, tracks: [], of: new WeakMap(), link: new WeakMap(), ev: [], evN: 0, purgeT: S.time, ms: 0, n: 0 };
  Object.defineProperty(S, 'rec', { value: R, enumerable: false, configurable: true, writable: true });
  return R;
}
IC.recOf = recOf;

/* ---------- ring buffers ---------- */
function newTrack(R, ref, kind, model, name, side, meta) {
  const tr = { id: ref.id || IC.nid('rec'), ref, kind, model, name, side, meta: meta || {}, buf: new Float32Array(32 * F), cap: 32, n: 0, head: 0, t0: 0, t1: 0, live: true, seen: 0, marks: [] };
  R.tracks.push(tr); R.of.set(ref, tr);
  return tr;
}
function push(tr, t, x, y, alt, h, spd, det, aff, ph) {
  if (tr.n === tr.cap && tr.cap < CAP) {
    // grow, keeping the samples in order
    const cap = Math.min(CAP, tr.cap * 2), nb = new Float32Array(cap * F);
    for (let i = 0; i < tr.n; i++) { const s = ((tr.head + i) % tr.cap) * F; for (let f = 0; f < F; f++) nb[i * F + f] = tr.buf[s + f]; }
    tr.buf = nb; tr.cap = cap; tr.head = 0;
  }
  let at;
  if (tr.n < tr.cap) { at = ((tr.head + tr.n) % tr.cap) * F; tr.n++; } else { at = tr.head * F; tr.head = (tr.head + 1) % tr.cap; }
  const b = tr.buf;
  b[at] = t; b[at + 1] = x; b[at + 2] = y; b[at + 3] = alt; b[at + 4] = h; b[at + 5] = spd; b[at + 6] = det; b[at + 7] = aff; b[at + 8] = ph || 0;
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
/* a cubic through the samples either side (Hermite, with slopes from the neighbours over their real time gaps), so a
   path sampled every half second flies as a curve and not as a string of straight pieces */
function herm(p0, p1, p2, p3, t0, t1, t2, t3, k) {
  const h = t2 - t1, m1 = (p2 - p0) / Math.max(1e-6, t2 - t0), m2 = (p3 - p1) / Math.max(1e-6, t3 - t1), k2 = k * k, k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * p1 + (k3 - 2 * k2 + k) * h * m1 + (3 * k2 - 2 * k3) * p2 + (k3 - k2) * h * m2;
}
IC.recHerm = herm;
/* the state of a track at time t, smoothed (raw: straight between samples); null when it was not there then */
IC.recAt = function (tr, t, out, raw) {
  const i = indexAt(tr, t);
  if (i < 0) return null;
  const o = out || {};
  if (i === tr.n - 1 || t <= at(tr, i, 0)) {
    // past the last sample: still there for one interval after it
    if (i === tr.n - 1 && t > at(tr, i, 0) + REC.dt * 2.5) return null;
    o.x = at(tr, i, 1); o.y = at(tr, i, 2); o.alt = at(tr, i, 3); o.h = at(tr, i, 4); o.spd = at(tr, i, 5); o.det = at(tr, i, 6); o.aff = at(tr, i, 7); o.ph = at(tr, i, 8); o.t = at(tr, i, 0);
    return o;
  }
  const ta = at(tr, i, 0), tb = at(tr, i + 1, 0), k = tb > ta ? (t - ta) / (tb - ta) : 0;
  o.t = t; o.h = lerpA(at(tr, i, 4), at(tr, i + 1, 4), k); o.spd = U.lerp(at(tr, i, 5), at(tr, i + 1, 5), k); o.det = at(tr, i, 6); o.aff = at(tr, i, 7); o.ph = at(tr, i, 8);
  if (raw || tb - ta > 3) { o.x = U.lerp(at(tr, i, 1), at(tr, i + 1, 1), k); o.y = U.lerp(at(tr, i, 2), at(tr, i + 1, 2), k); o.alt = U.lerp(at(tr, i, 3), at(tr, i + 1, 3), k); return o; }
  const i0 = i > 0 ? i - 1 : i, i3 = i + 2 < tr.n ? i + 2 : i + 1, t0 = at(tr, i0, 0), t3 = at(tr, i3, 0);
  for (const [f, key] of [[1, 'x'], [2, 'y'], [3, 'alt']]) o[key] = herm(at(tr, i0, f), at(tr, i, f), at(tr, i + 1, f), at(tr, i3, f), i0 === i ? ta - (tb - ta) : t0, ta, tb, i3 === i + 1 ? tb + (tb - ta) : t3, k);
  if (o.alt < 0) o.alt = 0;
  return o;
};
/* bank, pitch and g at time t, from how fast the heading and the climb change over a second: a coordinated turn
   banks by atan(v·ω / g). Missiles steer without banking (they skid), so their roll stays level but their g counts */
const G0 = 9.81, aA = {}, aB = {}, aC = {};
IC.recAttitude = function (tr, t, out) {
  const o = out || {};
  o.roll = 0; o.pitch = 0; o.g = 1; o.turn = 0;
  const c = IC.recAt(tr, t, aC); if (!c) return o;
  const a = IC.recAt(tr, t - 0.5, aA) || c, b = IC.recAt(tr, t + 0.5, aB) || c;
  const ground = tr.kind === 'veh' || tr.kind === 'unit' || (tr.kind === 'gnd' && c.alt < 0.005);
  if (ground || b.t - a.t < 0.2 || c.spd < 0.05) return o;
  const v = c.spd * 100;   // m/s
  let dh = b.h - a.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const w = dh / (b.t - a.t), lat = v * w;
  const gam = (p, q) => Math.atan2((q.alt - p.alt) * 1000, Math.max(1, U.dxy(p.x, p.y, q.x, q.y) * 100));
  const g1 = gam(a, c), g2 = gam(c, b), vert = v * (g2 - g1) / Math.max(0.1, (b.t - a.t) / 2);
  o.pitch = (g1 + g2) / 2; o.turn = w;
  o.g = Math.min(60, Math.hypot(lat, G0 * Math.cos(o.pitch) + vert) / G0);
  if (tr.kind !== 'missile') o.roll = U.clamp(Math.atan2(lat, G0), -1.45, 1.45);
  return o;
};
/* ---------- how a model sits: IC.recPose ----------
   From the track at time t: where it is, the height shown (the climb-out rises from the runway instead of starting
   at the flight's first sample), where the nose points (the heading on the ground; into the wind on final), bank
   from the turn rate over two seconds (capped by what the aircraft does: 30° for an airliner), pitch from the
   climb plus the angle the wing flies at (more when slow), the rotation at the end of the take-off roll and the
   flare before touchdown, and the gear and flaps the phase calls for (1 down, 0 up). wind: S.wind, for the crab. */
const RD = Math.PI / 180, PP = {}, PQ = {}, PR = {};
const BANK = { civil: 30 * RD, fighter: 75 * RD, heli: 30 * RD, drone: 35 * RD, missile: 0 };
/* the height shown after lift-off, rising from the runway until it meets the flight's own: km/s once climbing
   (an airliner about 2,500 ft a minute; the simulation puts a fighter at its patrol height at once) */
const CLIMB = { civil: 0.013, fighter: 0.06, drone: 0.005, heli: 0.008, missile: 1 };
const climbOut = (dt, v) => dt < 3 ? v / 6 * dt * dt : v * 1.5 + v * (dt - 3);
function mark(tr, kind, t, within) { for (let i = tr.marks.length - 1; i >= 0; i--) { const m = tr.marks[i]; if (m[1] === kind && m[0] <= t) return t - m[0] < within ? m : null; } return null; }
const markAt = (tr, kind, t, within) => { const m = mark(tr, kind, t, within); return m ? m[0] : null; };
function visAlt(tr, t, st, cls) {
  const code = (st.ph | 0) >> 1;
  if (code === GPH.final) { const f = mark(tr, 'fin', t, 300); return f ? st.alt * f[2] : st.alt; }
  const to = markAt(tr, 'to', t, 900);
  return to != null ? Math.min(st.alt, climbOut(t - to, CLIMB[cls] || 0.013)) : st.alt;
}
/* what kind of flyer a model is, for its bank, climb and attitude */
const clsCache = {};
function flyer(key) {
  if (clsCache[key]) return clsCache[key];
  const d = IC.MODELS[key], g = d && d.group;
  const c = /^(fighter|ftr_e|str)$/.test(key) ? 'fighter' : /^(heli|ahe)$/.test(key) ? 'heli' : /^(drone|isr|owa|jdr|lm|esj)$/.test(key) ? 'drone'
    : g === 'Missiles' || (g === 'Enemy weapons' && !IC.modelIsAircraft(key)) ? 'missile' : 'civil';
  return (clsCache[key] = c);
}
IC.recFlyer = flyer;
IC.recPose = function (tr, t, out, wind) {
  const o = out || {};
  const c = IC.recAt(tr, t, PP); if (!c) return null;
  const missile = tr.kind === 'missile', ground = tr.kind === 'veh' || tr.kind === 'unit';
  const code = missile || ground ? 0 : (c.ph | 0) >> 1;
  o.x = c.x; o.y = c.y; o.h = c.h; o.spd = c.spd; o.det = c.det; o.aff = c.aff; o.ph = c.ph; o.t = t; o.phase = code;
  o.gnd = ground || (code >= GPH.push && code <= GPH.park && code !== GPH.final);
  const cls = missile ? 'missile' : flyer(tr.model);
  o.alt = o.gnd ? 0 : visAlt(tr, t, c, cls);
  o.roll = 0; o.pitch = 0; o.g = 1; o.gear = 0; o.flap = 0; o.crab = 0; o.lights = 0; o.ab = 0; o.rot = 0;
  if (ground) return o;
  if (o.gnd) {
    // the nose follows the smoothed path round the taxiway's bends (backwards while pushing back); standing, the
    // heading the ground move gives
    const p = IC.recAt(tr, Math.max(IC.recFirstT(tr), t - 0.5), PQ), q = IC.recAt(tr, Math.min(tr.t1, t + 0.5), PR);
    if (p && q && U.dxy(p.x, p.y, q.x, q.y) > 0.01) o.h = Math.atan2(q.y - p.y, q.x - p.x) + (code === GPH.push ? Math.PI : 0);
    o.gear = 1; o.lights = code === GPH.roll || code === GPH.land ? 1 : 0;
    if (code === GPH.roll) {
      // the roll: flaps set, the nose rises through the last few knots before lift-off
      // (in a replay the lift-off is known: the rotation takes the three seconds before it)
      const lo = tr.marks.find(m => m[1] === 'to' && m[0] >= t && m[0] - t < 3);
      o.flap = 0.35; o.rot = Math.max(U.clamp((c.spd - 0.66) / 0.14, 0, 1), lo ? 1 - (lo[0] - t) / 3 : 0); o.pitch = o.rot * 8 * RD; o.ab = cls === 'fighter' ? 1 : 0;
    } else if (code === GPH.land) {
      // touchdown on the main wheels, the nose coming down over three seconds
      const td = markAt(tr, 'td', t, 3); o.flap = 1; o.pitch = td != null ? 5 * RD * (1 - (t - td) / 3) : 0;
    } else if (code === GPH.rollout) o.flap = 0.6;
    return o;
  }
  // in the air: the turn and the climb over two seconds either side, as far as the record goes
  const t0 = Math.max(IC.recFirstT(tr), t - 1), t1 = Math.min(tr.t1, t + 1);
  const a = IC.recAt(tr, t0, PQ) || c, b = IC.recAt(tr, t1, PR) || c, dt = Math.max(0.2, b.t - a.t), v = Math.max(1, c.spd * 100);
  let dh = b.h - a.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const w = b.t - a.t > 0.15 ? dh / dt : 0, lat = v * w;
  const va = visAlt(tr, a.t, a, cls), vb = visAlt(tr, b.t, b, cls), run = Math.max(1, U.dxy(a.x, a.y, b.x, b.y) * 100);
  const gam = b.t - a.t > 0.15 ? Math.atan2((vb - va) * 1000, run) : 0;
  o.g = Math.min(60, Math.hypot(lat, G0) / G0);
  if (cls === 'missile') { o.pitch = gam; return o; }
  // near the ground nothing banks hard
  const bank = Math.min(BANK[cls], 12 * RD + o.alt * 60 * RD);
  o.roll = U.clamp(Math.atan2(lat, G0), -bank, bank);
  const slow = c.spd < 1.2, aoa = cls === 'heli' ? 0 : cls === 'fighter' ? (slow ? 8 : 3) * RD : (slow ? 6 : c.spd < 1.8 ? 4 : 2.2) * RD;
  o.pitch = cls === 'heli' ? U.clamp(-c.spd * 0.12, -0.2, 0.05) : cls === 'civil' ? U.clamp(gam + aoa, -4 * RD, 18 * RD) : gam + aoa;
  const to = markAt(tr, 'to', t, 60);
  if (code === GPH.final) {
    // on final: gear and flaps down, the nose held up for the approach, the flare in the last 15 m
    o.gear = 1; o.flap = 1; o.lights = 1;
    o.pitch = (3 + 3 * U.clamp((0.015 - c.alt) / 0.015, 0, 1)) * RD;
    if (wind && wind.kt > 0.5 && c.alt > 0.01) o.crab = Math.asin(U.clamp(wind.kt * 0.514 * Math.sin(wind.dir - c.h) / v, -0.4, 0.4)) * U.clamp((c.alt - 0.01) / 0.02, 0, 1);
  } else if (code === GPH.appr && c.alt < 1.2) { o.gear = c.alt < 0.9 ? 1 : 0; o.flap = 0.5; o.lights = 1; }
  else if (to != null && t - to < 60) {
    // the initial climb: the nose held high (about 15° for an airliner) for the first half minute
    const d = t - to;
    o.gear = d < 5 ? 1 : 0; o.flap = 0.35; o.lights = 1; o.ab = cls === 'fighter' && d < 25 ? 1 : 0;
    if (cls === 'civil' || cls === 'fighter') o.pitch = Math.max(o.pitch, (d < 4 ? 8 + d * 1.75 : 15 - Math.max(0, d - 20) * 0.4) * RD);
  }
  if (cls === 'fighter' && gam > 0.18) o.ab = 1;
  return o;
};

/* the samples between t0 and t1 as [x, y, alt, t, ...] pushed into out (for trails; the replay smooths them);
   shown: the heights as IC.recPose shows them (the climb-out from the runway, the final) */
const PS2 = {};
IC.recPath = function (tr, t0, t1, out, shown) {
  out = out || [];
  let i = indexAt(tr, t0); if (i < 0) i = 0;
  const cls = shown && tr.kind !== 'missile' && tr.kind !== 'veh' && tr.kind !== 'unit' ? flyer(tr.model) : null;
  for (; i < tr.n; i++) {
    const t = at(tr, i, 0); if (t > t1) break; if (t < t0 - REC.dt) continue;
    let alt = at(tr, i, 3);
    if (cls) { PS2.alt = alt; PS2.ph = at(tr, i, 8); alt = ((PS2.ph | 0) >> 1) >= GPH.push && ((PS2.ph | 0) >> 1) <= GPH.park && ((PS2.ph | 0) >> 1) !== GPH.final ? 0 : visAlt(tr, t, PS2, cls); }
    out.push(at(tr, i, 1), at(tr, i, 2), alt, t);
  }
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
/* the track an aircraft already has from its ground move or its flight, if that ended just now: the same tail or
   air wing flight going on (lift-off) or coming back (the approach handed to the runway) */
function joined(R, key, now) {
  const tr = key && R.link.get(key);
  return tr && tr.t1 >= now - 4 ? tr : null;
}
/* a phase change worth marking on the track: lift-off (the take-off roll went airborne) and touchdown */
function markPhase(tr, now, code, alt) {
  const last = tr.n ? (at(tr, tr.n - 1, 8) | 0) >> 1 : -1;
  if (last === GPH.roll && (code === GPH.air || code === GPH.appr)) tr.marks.push([tr.t1, 'to']);
  if (last === GPH.final && code === GPH.land) tr.marks.push([now, 'td']);
  // handed from the approach to the runway: the final starts a little higher than the approach ended; the view
  // scales the final down so the two meet
  if ((last === GPH.appr || last === GPH.air) && code === GPH.final && alt > 0) tr.marks.push([now, 'fin', Math.min(1, at(tr, tr.n - 1, 3) / alt)]);
}
function sampleThreat(S, R, t, now) {
  let tr = R.of.get(t);
  if (!tr) {
    const civ = !!t.d.civil, name = t.tn ? `TN ${t.tn}` : t.cs || IC.fullName(t.d);
    tr = joined(R, t.tail, now);
    if (tr) R.of.set(t, tr);
    else tr = newTrack(R, t, 'threat', IC.modelOfThreat(t, true), name, civ ? 'civil' : 'enemy', { type: t.type, klass: t.d.klass, cs: t.cs, livery: t.livery || null, civil: civ });
    if (t.tail) R.link.set(t.tail, tr);
  }
  if (t.tn && !tr.meta.tn) { tr.meta.tn = t.tn; tr.name = `TN ${t.tn}${t.cs ? ' · ' + t.cs : ''}`; }
  tr.meta.klass = t.klass || tr.meta.klass;
  const aff = t.decoyKnown ? 'D' : t.aff || 'U', code = t.appr ? GPH.appr : GPH.air;
  markPhase(tr, now, code, t.alt || 0);
  // a flight's heading is where it is going: some keep an h from their take-off that is not kept up
  push(tr, now, t.x, t.y, t.alt || 0, t.vx || t.vy ? Math.atan2(t.vy, t.vx) : hdgOf(t, tr, lastH(tr)), spdOf(t), t.det ? 1 : 0, AFF[aff] || 0, (t.notchT > 0 ? 1 : 0) + 2 * code);
  tr.seen = now;
}
/* key: the tail or air wing flight that joins a ground move to its flight; code: the phase (REC_PHASE) */
function sampleSimple(R, o, now, kind, model, name, side, alt, meta, key, code) {
  let tr = R.of.get(o);
  if (!tr) {
    tr = joined(R, key, now);
    if (tr) R.of.set(o, tr); else tr = newTrack(R, o, kind, model, name, side, meta);
    if (key) R.link.set(key, tr);
  }
  // on the ground the speed is how far it went since the last sample (a move keeps no speed on final)
  const spd = kind === 'veh' || kind === 'unit' || kind === 'gnd' ? (tr.n && now > tr.t1 ? U.dxy(o.x, o.y, at(tr, tr.n - 1, 1), at(tr, tr.n - 1, 2)) / (now - tr.t1) : 0) : spdOf(o);
  if (code != null) markPhase(tr, now, code, alt);
  push(tr, now, o.x, o.y, alt, hdgOf(o, tr, lastH(tr)), spd, o.radarOn ? 1 : 0, o.side === 'us' || side === 'us' ? 1 : 4, (o.notchT > 0 ? 1 : 0) + 2 * (code || 0));
  tr.seen = now;
}
/* a missile, ours or theirs: its guidance goes in the sample, and a change of phase becomes an event */
function sampleMissile(S, R, m, now, enemy) {
  let tr = R.of.get(m);
  if (!tr) {
    const by = m.unit || m.by || (m.src && typeof m.src === 'object' ? m.src : null);
    tr = enemy ? newTrack(R, m, 'missile', m.ir ? 'aam' : 'aam', m.ir ? 'Heat-seeking missile' : 'Radar air-to-air missile', 'enemy', { mun: m.ir ? 'SRM' : 'MRM', tref: m.target, uref: by, seeker: m.ir ? 'IR' : 'ARH' })
      : newTrack(R, m, 'missile', IC.modelOfMissile(m), `${m.mun} from ${m.src || 'a battery'}`, 'us', { mun: m.mun, tref: m.target, uref: by, seeker: m.M && m.M.seeker, name: m.M && m.M.name });
  }
  const ph = phaseOf(S, m, enemy), last = tr.n ? at(tr, tr.n - 1, 8) : 0;
  push(tr, now, m.x, m.y, missileAlt(m, tr), hdgOf(m, tr, lastH(tr)), m.spd || 0, 1, enemy ? 4 : 1, ph);
  tr.seen = now;
  if (ph !== last && ph !== PH.lost && ph !== PH.decoy) addEv(R, { t: now, kind: 'lock', x: m.x, y: m.y, alt: missileAlt(m, tr), ph, mref: m, tref: m.target, quiet: true, text: last ? GUIDE[ph].name.toUpperCase() : `${GUIDE[ph].name} guidance` });
}
/* while missiles fly, they and what they chase are sampled every step */
function sampleFine(S, R, now) {
  for (const m of S.missiles) if (!m.dead) {
    sampleMissile(S, R, m, now, false);
    const t = m.target; if (t && !t.dead && t.x != null && (R.of.get(t) || {}).t1 !== now) { if (t.d && S.threats.includes(t)) sampleThreat(S, R, t, now); else if (t.kind) sampleAir(R, t, now); }
  }
  for (const m of S.eaam) if (!m.dead) {
    sampleMissile(S, R, m, now, true);
    const a = m.target; if (a && !a.dead && (R.of.get(a) || {}).t1 !== now) sampleAir(R, a, now);
  }
}

/* one of our flights in the air, joined to its take-off and landing */
const sampleAir = (R, a, now) => sampleSimple(R, a, now, 'air', IC.modelOfAir(a), a.name, 'us', a.alt || 0, { kind: a.kind, n: a.n }, a, a.faf && (a.alt || 0) < 1.5 ? GPH.appr : GPH.air);
/* an aircraft moving on one of our airports (or on final to it) */
const sampleMove = (R, m, b, now) => sampleSimple(R, m, now, 'gnd', IC.modelOfType(m.type), m.who || m.T.name, m.mil ? 'us' : 'civil', m.alt || 0, { type: m.type, livery: m.livery || null, ap: b.id, civil: !m.mil }, m.tail || m.flight || null, GOPS_PH[m.phase] || GPH.taxi);

/* the step: a sample of everything that moves every REC.dt game seconds */
IC.record = function (S, dt) {
  const R = recOf(S);
  const fine = (S.missiles.length || S.eaam.length) && S.time >= R.nextFine;
  if (S.time < R.next && !fine) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const now = S.time;
  if (fine) { R.nextFine = now + REC.fine - 1e-6; sampleFine(S, R, now); }
  if (now < R.next) { if (t0) { R.ms += performance.now() - t0; R.n++; } return; }
  R.next = now + REC.dt;
  for (const t of S.threats) if (!t.dead && (R.of.get(t) || {}).t1 !== now) sampleThreat(S, R, t, now);
  if (!fine) { for (const m of S.missiles) if (!m.dead) sampleMissile(S, R, m, now, false); for (const m of S.eaam) if (!m.dead) sampleMissile(S, R, m, now, true); }
  for (const s of S.strikes) { let tr = R.of.get(s); if (!tr) tr = newTrack(R, s, 'missile', s.mun === 'GBU' ? 'gbu' : 'cm', `${s.mun} from ${s.src || 'a launcher'}`, s.side === 'us' ? 'us' : 'enemy', { mun: s.mun }); push(tr, now, s.x, s.y, s.alt || 0, hdgOf(s, tr, lastH(tr)), s.spd || 0, 1, s.side === 'us' ? 1 : 4); tr.seen = now; }
  for (const a of S.air) if (!a.dead && !a.gnd && (R.of.get(a) || {}).t1 !== now) sampleAir(R, a, now);
  for (const b of S.infra) if (b.parts && b.moves) for (const m of b.moves) if (!m.dead && m.phase !== 'start') sampleMove(R, m, b, now);
  for (const v of S.vehicles) if (!v.dead) sampleSimple(R, v, now, 'veh', v.kind === 'truck' ? 'truck' : 'truck', v.name, 'us', 0, { trucks: v.trucks });
  for (const u of S.units) if (!u.dead) sampleSimple(R, u, now, 'unit', IC.modelOfUnit(u.type), u.name, 'us', 0, { type: u.type, n: IC.unitVehicles(u.d) });
  // what is gone stays in the record until its last sample ages out
  if (now - R.purgeT > REC.purgeEvery) {
    R.purgeT = now;
    const old = now - REC.span;
    R.tracks = R.tracks.filter(tr => { if (tr.seen < now - REC.dt * 1.5) tr.live = false; while (tr.marks.length && tr.marks[0][0] < old) tr.marks.shift(); return tr.t1 > old; });
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
function addEv(R, ev) {
  ev.id = ++R.evN;
  R.ev.push(ev);
  if (R.ev.length > 1200) R.ev.shift();
  return ev;
}
/* a missile's height as last recorded (the state keeps none for some of them) */
const altOf = (R, m, t) => { const tr = R.of.get(m); return tr && tr.n ? at(tr, tr.n - 1, 3) : m.alt != null ? m.alt : t ? t.alt || 0 : 0; };
IC.on(function (S, type, d) {
  if (!S || !S.rec) return;
  const R = S.rec, ev = { t: S.time, kind: type };
  switch (type) {
    case 'impact': Object.assign(ev, { x: d.x, y: d.y, alt: 0, sz: d.src && d.src.d ? Math.min(2, 0.6 + d.src.d.dmg / 100) : 1, name: d.hit ? d.hit.name : 'open ground', text: `${d.hit ? d.hit.name : 'Open ground'} hit by ${d.src && d.src.d ? IC.fullName(d.src.d) : 'a weapon'}`, dmg: damaged(S, d.x, d.y) }); break;
    case 'kill': Object.assign(ev, { x: d.x, y: d.y, alt: d.alt || 0, sz: 0.6, name: d.tn ? `TN ${d.tn}` : IC.fullName(d.d), text: `${d.tn ? 'TN ' + d.tn + ' (' + IC.fullName(d.d) + ')' : IC.fullName(d.d)} shot down` }); break;
    case 'intercept': Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.alt || d.t.alt || 0, sz: 0.8, name: d.t.tn ? `TN ${d.t.tn}` : 'warhead', text: `Intercept ${d.alt ? U.alt(d.alt) + ' up' : ''}` }); break;
    case 'launch': Object.assign(ev, { x: d.u.x, y: d.u.y, alt: 0, sz: 0.3, name: d.u.name, text: `${d.u.name} fires at TN ${d.t.tn || '?'}`, quiet: true }); break;
    case 'fire': Object.assign(ev, { x: d.x, y: d.y, alt: 0, sz: 0.3, name: d.name, text: `${d.name} fires`, quiet: true }); break;
    case 'crash': Object.assign(ev, { x: d.m.x, y: d.m.y, alt: 0, sz: 1, name: d.m.who || 'aircraft', text: `Crash at ${d.ap.name}: ${d.cause || ''}`, dmg: [] }); break;
    case 'collision': Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.t.alt || 0, sz: 1, name: d.t.cs || 'aircraft', text: 'Collision' }); break;
    // chaff and flares: where the target was and how it moved, so the replay can let them fall away behind it
    case 'cm': Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.t.alt || 0, vx: d.t.vx || 0, vy: d.t.vy || 0, what: d.kind, tref: d.t, name: d.t.tn ? `TN ${d.t.tn}` : d.t.name || 'aircraft', text: d.kind === 'flare' ? 'FLARES' : 'CHAFF', quiet: true }); break;
    // what a missile's seeker did: lost its lock, took a decoy, saw its target notch, missed, hit
    case 'mstat': Object.assign(ev, { x: d.m.x, y: d.m.y, alt: altOf(R, d.m, d.t), what: d.what, text: d.text, mref: d.m, tref: d.t, quiet: true }); if (d.what === 'notch') Object.assign(ev, { x: d.t.x, y: d.t.y, alt: d.t.alt || 0 }); break;
    case 'missHeight': Object.assign(ev, { kind: 'mstat', x: d.m.x, y: d.m.y, alt: d.m.alt || 0, what: 'miss', text: d.dz > 0 ? 'PASSED ABOVE' : 'PASSED BELOW', mref: d.m, tref: d.t, quiet: true }); break;
    default: return;
  }
  addEv(R, ev);
});

/* the mean time a recorder call took, in ms (tests and the performance tool) */
IC.recCost = S => { const R = S.rec; return R && R.n ? R.ms / R.n : 0; };

})(window.IC);
