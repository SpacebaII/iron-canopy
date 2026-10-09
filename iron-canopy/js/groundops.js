/* Iron Canopy — ground operations. Every aircraft that uses one of our airports taxis along the network the player
   built: pushback, taxi, hold short, line up, take-off roll; approach, landing roll, exit, taxi in, park.
   The wind picks a runway configuration: which runways are in use, which way, for arrivals, departures or both.
   Runways that cross are cleared as one; parallels closer than 760 m land on one and depart on the other.
   Taxi routes are planned ahead with time reservations so aircraft do not meet nose to nose on a single taxiway.
   Crashes are rare and always have a cause the player can see: gusts beyond a crew's limit, a wet runway too short
   for the landing, an aircraft straying onto a runway in use where there is no ground radar, birds near water. */
(function (IC) {
'use strict';
const U = IC.U;
/* speeds in world units (100 m) a second, times in seconds */
const RWTAXI = 0.12, TOUCH = 0.75, LIFT = 0.8, SPACING = 0.55, FAF = 40, FORCE = 240, HOLD = 0.75, CLEAR = 0.9, TAXI = 0.09, MARGIN = 8;
IC.GOPS = { RWTAXI, TOUCH, LIFT, FAF, HOLD, CLEAR, TAXI };

const G = ap => IC.aptGraph(ap);
const runways = ap => ap.parts.filter(p => p.kind === 'runway' && p.built && p.hp > p.max * 0.25);
/* the landing or take-off heading on a runway in a direction (+1: from end a towards b) */
const hdgOf = (rw, dir) => { const d = IC.rwDir(rw); return Math.atan2(d.y * dir, d.x * dir); };
IC.rwHdg = hdgOf;

/* ---------- the runway configuration: chosen by the wind, refreshed when it shifts ---------- */
/* what stops this type using this runway in this direction right now: '' when it can */
IC.rwWindBlock = function (S, rw, dir, T) {
  if (T.vtol) return '';
  const w = IC.windOn(S, hdgOf(rw, dir));
  if (w.cross > T.xw) return `crosswind ${Math.round(w.cross)} kt, limit ${T.xw} kt`;
  if (-w.head > T.tw) return `tailwind ${Math.round(-w.head)} kt, limit ${T.tw} kt`;
  return '';
};
/* the landing end in a direction: +1 lands from end a */
const endOf = dir => dir > 0 ? 'a' : 'b';
IC.rwHasILS = (ap, rw, dir) => ap.parts.some(p => p.kind === 'ils' && p.rw === rw.id && p.end === endOf(dir) && p.built && p.hp > p.max * 0.25);
IC.aptConfig = function (S, ap) {
  const g = G(ap), W = S.wind, old = ap.cfg;
  // keep the configuration while the wind holds steady: controllers do not swap runways every few minutes
  // (a runway without lights is closed from dusk to dawn)
  const hr = ((S.time % 86400) + 86400) % 86400 / 3600, dark = hr < 5.5 || hr > 20.5;
  if (old && old.dark === dark && old.ver === g.ver && S.time - old.t < 900 && Math.abs(W.kt - old.kt) < 5 && Math.abs(U.angWrap(W.dir - old.dir)) < 0.35 && old.ils === IC.needILS(S) && old.mode === (ap.rwMode || 'auto')) return old;
  const imc = IC.needILS(S), rws = runways(ap).filter(rw => IC.rwUsable(rw) >= 6 && !(dark && rw.lit === false));
  const cfg = { dark, ver: g.ver, t: S.time, kt: W.kt, dir: W.dir, ils: imc, mode: ap.rwMode || 'auto', rw: {}, arr: [], dep: [], name: '', text: '' };
  // each runway is used into the wind; a tailwind of a few knots is accepted to keep the current direction,
  // or to land on the end that has an instrument landing system in fog
  for (const rw of rws) {
    const hA = IC.windOn(S, hdgOf(rw, 1)).head;
    let dir = hA >= 0 ? 1 : -1;
    const prev = old && old.rw[rw.id];
    if (prev && -IC.windOn(S, hdgOf(rw, prev.dir)).head <= 3) dir = prev.dir;
    if (imc && !IC.rwHasILS(ap, rw, dir) && IC.rwHasILS(ap, rw, -dir) && -IC.windOn(S, hdgOf(rw, -dir)).head <= 7) dir = -dir;
    const w = IC.windOn(S, hdgOf(rw, dir));
    cfg.rw[rw.id] = { dir, role: 'mixed', head: w.head, cross: w.cross, ils: IC.rwHasILS(ap, rw, dir), name: IC.rwEnd(rw, dir), grp: g.grp[rw.id] };
  }
  // runways fit for jets in this wind take the traffic; the rest are kept for whoever can still use them
  const ok = rws.filter(rw => cfg.rw[rw.id].cross <= 25);
  const best = ok.length ? Math.max(...ok.map(rw => cfg.rw[rw.id].head)) : 0;
  const lead = ok.filter(rw => cfg.rw[rw.id].head >= best - 6);
  const grpsOf = L => [...new Set(L.map(rw => g.grp[rw.id]))];
  const lg = grpsOf(lead), og = grpsOf(ok).filter(k => !lg.includes(k));
  if (cfg.mode !== 'mixed' && lg.length + og.length >= 2) {
    // segregated: arrivals on half of the runways best aligned with the wind (those with a landing system first in
    // poor visibility), departures on the rest
    const ilsG = k => rws.some(rw => g.grp[rw.id] === k && cfg.rw[rw.id].ils) ? 1 : 0;
    const len = k => Math.max(...rws.filter(rw => g.grp[rw.id] === k).map(rw => IC.rwUsable(rw)));
    const L = lg.slice().sort((a, b) => (imc ? ilsG(b) - ilsG(a) : 0) || len(b) - len(a) || (a < b ? -1 : 1));
    // runways with only a light crosswind can take arrivals too, so arrivals and departures are about even
    const xw = k => Math.max(...rws.filter(rw => g.grp[rw.id] === k).map(rw => cfg.rw[rw.id].cross));
    const O = og.filter(k => xw(k) <= 15 && (!imc || ilsG(k))).sort((a, b) => xw(a) - xw(b));
    const n = lg.length + og.length, nArr = Math.max(1, Math.floor(n / 2));
    const arr = L.concat(O).slice(0, nArr);
    const roleOf = {};
    for (const k of lg.concat(og)) roleOf[k] = arr.includes(k) ? 'arr' : 'dep';
    // a single well-aligned runway with only crosswind runways beside it lands and departs both
    if (lg.length === 1 && !og.length) roleOf[lg[0]] = 'mixed';
    // parallels closer than 760 m are used as a pair: departures on the longer, arrivals on the shorter (the outer
    // runway lands, the inner departs, as at Los Angeles), never both landing side by side
    for (let i = 0; i < rws.length; i++) for (let j = i + 1; j < rws.length; j++) {
      const a = rws[i], b = rws[j], ka = g.grp[a.id], kb = g.grp[b.id];
      if (ka === kb || IC.rwDependent(a, b) !== 'close' || !roleOf[ka] || !roleOf[kb] || roleOf[ka] !== roleOf[kb] || roleOf[ka] === 'mixed') continue;
      const [lng, sht] = IC.rwUsable(a) >= IC.rwUsable(b) ? [ka, kb] : [kb, ka];
      roleOf[lng] = 'dep'; roleOf[sht] = 'arr';
    }
    for (const rw of rws) cfg.rw[rw.id].role = roleOf[g.grp[rw.id]] || 'spare';
  } else for (const rw of rws) cfg.rw[rw.id].role = ok.includes(rw) || !ok.length ? 'mixed' : 'spare';
  for (const rw of rws) { const r = cfg.rw[rw.id]; if (r.role === 'arr' || r.role === 'mixed') cfg.arr.push(rw.id); if (r.role === 'dep' || r.role === 'mixed') cfg.dep.push(rw.id); }
  // name the flow after the landing heading of the main runways
  const main = rws.filter(rw => cfg.arr.includes(rw.id))[0] || rws[0];
  if (main) {
    const b = IC.bearing(hdgOf(main, cfg.rw[main.id].dir));
    cfg.name = `${['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'][Math.round(b / 45) % 8]} flow`;
    const nm = ids => ids.map(id => cfg.rw[id].name).join(', ');
    const mixed = cfg.arr.filter(id => cfg.dep.includes(id));
    cfg.text = mixed.length === cfg.arr.length && mixed.length === cfg.dep.length ? `${nm(mixed)} for arrivals and departures` : `Arrivals ${nm(cfg.arr) || 'none'} · departures ${nm(cfg.dep) || 'none'}`;
  }
  ap.cfg = cfg;
  return cfg;
};
const cfgOf = (S, ap) => IC.aptConfig(S, ap);

/* ---------- the tower's rules: when an aircraft may go onto a runway ---------- */
/* the player sets them per airport (ap.ops), with an optional preset per runway. By kind of aircraft, how a
   departure goes onto the runway; how far out the next arrival must be; crossings; intersection departures. */
IC.OPS_KINDS = [['light', 'Light and club aircraft'], ['turbo', 'Turboprops and regional jets'], ['jet', 'Airliners'], ['heavy', 'Heavies'], ['mil', 'Military']];
const KIND_OF = { light: 'light', turbo: 'turbo', narrow: 'jet', wide: 'heavy', cargo: 'heavy' };
IC.opsKind = (type, T) => { T = T || IC.ACTYPES[type]; return T.mil ? 'mil' : KIND_OF[type] || T.ops || (T.ga ? 'light' : 'jet'); };
IC.OPS_ENTER = {
  hold: { name: 'Only when cleared for take-off', text: 'The aircraft waits at the hold-short line until the runway is empty and the next arrival is beyond the gap, then goes straight into its take-off. Safest; a queue of departures moves about 25 s slower each.' },
  luaw: { name: 'Line up and wait', text: 'The aircraft goes onto the runway behind a departure that is still rolling, lines up and waits there to be cleared for take-off. It saves the line-up time; in the dark, an aircraft waiting on the runway is easy for the tower to lose.' },
  luawDay: { name: 'Line up and wait by day', text: 'Line up and wait by day in good visibility; at night and in fog, wait at the hold-short line.' }
};
IC.OPS_GAPS = [4, 6, 8, 10];
IC.OPS_CROSS = { gap: { name: 'When no arrival is within the gap', text: 'Aircraft cross a runway only when the next arrival is at least the gap away.' },
  radar: { name: 'Only a ground radar may shorten it', text: 'As above; at night and in fog, where no ground radar watches the runways, crossings wait for twice the gap.' } };
IC.OPS_INTER = { none: { name: 'Never', text: 'Every departure starts from the runway end: the longest take-off run, and more taxiing.' },
  small: { name: 'Small aircraft', text: 'Light aircraft, turboprops and fighters may start from a taxiway part way down the runway when enough runway is left for them. This saves taxi time.' },
  all: { name: 'Every aircraft', text: 'Any aircraft may start part way down the runway when enough runway is left for its type. Less taxiing, less margin.' } };
IC.OPS_PRESETS = {
  cautious: { name: 'Cautious', text: 'Everyone but light aircraft holds short until cleared; a 10 km gap; no intersection departures.',
    r: { enter: { light: 'luawDay', turbo: 'hold', jet: 'hold', heavy: 'hold', mil: 'hold' }, gap: 10, cross: 'radar', inter: 'none' } },
  standard: { name: 'Standard', text: 'Light aircraft and military line up and wait, turboprops by day; airliners and heavies hold short until cleared; an 8 km gap.',
    r: { enter: { light: 'luaw', turbo: 'luawDay', jet: 'hold', heavy: 'hold', mil: 'luaw' }, gap: 8, cross: 'gap', inter: 'small' } },
  busy: { name: 'Busy hub', text: 'Everyone lines up and waits by day; a 6 km gap; intersection departures for every aircraft.',
    r: { enter: { light: 'luaw', turbo: 'luawDay', jet: 'luawDay', heavy: 'luawDay', mil: 'luaw' }, gap: 6, cross: 'gap', inter: 'all' } }
};
const cloneR = r => ({ enter: Object.assign({}, r.enter), gap: r.gap, cross: r.cross, inter: r.inter });
/* the airport's rules (a copy may be edited in the panel before it is applied) */
IC.opsOf = ap => ap.ops || (ap.ops = { preset: 'standard', r: cloneR(IC.OPS_PRESETS.standard.r), rw: {} });
IC.opsPreset = (ops, name) => { const P = IC.OPS_PRESETS[name]; if (P) { ops.preset = name; ops.r = cloneR(P.r); } return ops; };
IC.opsClone = ops => ({ preset: ops.preset, r: cloneR(ops.r), rw: Object.assign({}, ops.rw) });
/* the rules on one runway: its own preset if it has one, else the airport's */
const rulesOf = (ops, rwId) => { const p = ops && ops.rw && rwId && ops.rw[rwId]; return p && IC.OPS_PRESETS[p] ? IC.OPS_PRESETS[p].r : ops ? ops.r : IC.OPS_PRESETS.standard.r; };
IC.opsRules = (ap, rwId, ops) => rulesOf(ops || IC.opsOf(ap), rwId);
const dark = S => { const h = ((S.time % 86400) + 86400) % 86400 / 3600; return h < 5.5 || h > 20.5; };
IC.opsDark = S => dark(S) || IC.needILS(S);
/* how this aircraft goes onto its runway right now: 'hold' (only when cleared for take-off) or 'luaw' */
IC.opsEnter = (S, R, type, T) => { const e = R.enter[IC.opsKind(type, T)] || 'hold'; return e === 'luawDay' ? (S && IC.opsDark(S) ? 'hold' : 'luaw') : e; };
const smallT = T => T.rwy <= 13;
IC.opsInterOk = (R, T) => R.inter === 'all' || (R.inter === 'small' && smallT(T));
/* timings: 1 km out an arrival needs the runway empty or it goes around; it flies the final at ARR_V; a departure
   cleared for take-off from the hold-short line turns onto the runway and rolls (ROLLING s), one that lines up and
   waits stops there (LINE s); crews take CREW s on average to start the roll once cleared */
const GO = 10, ARR_V = 0.95, ROLLING = 12, LINE = 25, CREW = 5, PATIENCE = 120;
IC.OPS_T = { GO, ARR_V, ROLLING, LINE, CREW, PATIENCE };

/* ---------- runway locks: one per group of runways that depend on each other ---------- */
const keyOf = (ap, rwId) => G(ap).grp[rwId] || rwId;
/* by: the aircraft on (or cleared onto) the runways, with: others sharing them (a crossing, a departure lining up
   behind one rolling); next: the earliest a departure may roll (wake turbulence); fin: the arrival on final;
   nextA: the earliest the next arrival may start its final; gapFor: a departure the tower holds arrivals for */
const lockOf = (ap, k) => (ap.rl = ap.rl || {})[k] || (ap.rl[k] = { by: null, next: 0, nextA: 0, fin: null });
/* who goes first when several want the same runways: scrambles, then arrivals (military first), then departures */
const prioOf = m => m.scramble ? 4 : m.kind === 'arr' ? (m.mil ? 3 : 2) : m.mil ? 1 : 0;
// (by id, through a map rebuilt when the list changes: ap.moves only ever grows by push or is replaced by a filter,
// so the list and its length say when; a scan here ran for every aircraft against every other, every step)
const moveOf = (ap, id) => {
  if (ap._mvA !== ap.moves || ap._mvN !== ap.moves.length) {
    const M = ap._mv || (ap._mv = new Map()); M.clear();
    for (const x of ap.moves) if (!M.has(x.id)) M.set(x.id, x);
    ap._mvA = ap.moves; ap._mvN = ap.moves.length;
  }
  return ap._mv.get(id) || null;
};
/* cross: the hold line an aircraft crossing the runway waits at. Aircraft at the same line cross together, and a
   crossing needs no wake-turbulence gap (the next take-off still waits for it). luaw: a departure may go on behind
   one that is rolling, and before the wake gap has passed. */
function canTake(S, ap, k, m, cross, luaw) {
  const L = lockOf(ap, k);
  if (L.by === m.id || (L.with && L.with.has(m.id))) return true;
  if (L.by) {
    if (cross) return L.cross === cross && S.time < L.xT;
    if (!luaw || (L.with && L.with.size)) return false;
    const o = moveOf(ap, L.by);
    if (!o || o.kind !== 'dep' || o.phase !== 'roll') return false;
  }
  if (!cross && !luaw && S.time < L.next) return false;
  if (ap.closedT && S.time < ap.closedT && !m.mil) return false;
  // someone more urgent is waiting for these runways, unless we have waited a long time
  const w = ap.want && ap.want[k];
  if (w && S.time - w.t < 8 && w.p > prioOf(m) && (m.waitT || 0) < PATIENCE) return false;
  return true;
}
function wantIt(S, ap, k, m) { const W = ap.want = ap.want || {}, w = W[k], p = prioOf(m); if (!w || S.time - w.t >= 8 || p >= w.p) W[k] = { p, t: S.time }; }
function take(ap, k, m, cross, now) {
  const L = lockOf(ap, k);
  if (L.by && L.by !== m.id) (L.with = L.with || new Set()).add(m.id);
  else if (!L.by) { L.by = m.id; L.cross = cross || null; L.xT = (now || 0) + 30; L.with = null; }
  (m.locks = m.locks || {})[k] = true;
}
/* after an arrival the next may follow once it has cleared; after a departure, wake turbulence needs a full gap */
const sepOf = (ap, m) => IC.aptSep(ap.st || {}, m.plan && m.plan.rw && m.plan.rw.id) * (m.kind === 'arr' ? 0.5 : 1);
/* sepA: the gap before the next arrival may start its final (none after a take-off where a tower watches) */
function release(S, ap, k, m, sep, sepA) {
  const L = lockOf(ap, k);
  if (L.with && L.with.has(m.id)) L.with.delete(m.id);
  else if (L.by === m.id) {
    if (L.with && L.with.size) { const n = L.with.values().next().value; L.with.delete(n); L.by = n; }
    else { L.by = null; L.cross = null; }
    L.next = Math.max(L.next, S.time + (sep || 0));
    L.nextA = Math.max(L.nextA || 0, S.time + (sepA || 0));
  }
  if (L.gapFor === m.id) L.gapFor = null;
  if (m.locks) delete m.locks[k];
}
IC.rwBusy = (S, ap, rwId) => { const L = lockOf(ap, keyOf(ap, rwId)); return !!L.by || !!L.fin || S.time < L.next; };

/* ---------- the next arrivals, as the tower sees them ---------- */
/* every arrival coming to these runways: its distance from touchdown now (world units), and whether it is waiting
   at the approach fix (it then starts its final when the tower clears it) */
/* the closest any arrival will be in t seconds (holders counted as starting their final now, unless held).
   (Asked for every aircraft waiting for a runway, every step: it allocates nothing) */
function arrNear(S, ap, k, t, heldToo) {
  let best = 1e9;
  const vt = ARR_V * t;
  for (const m of ap.moves) if (m.kind === 'arr' && m.phase === 'final' && m.finK === k) best = Math.min(best, Math.max(0, FAF * (1 - m.t / (FAF / ARR_V))) - vt);
  const q = ap.fafQ; if (!q) return best;
  for (const x of q) {
    if (x.done || S.time - x.t > 1800 || keyOf(ap, x.rw) !== k) continue;
    if (x.backT > S.time) best = Math.min(best, FAF + (x.backT - S.time) * ARR_V - vt);
    else if (x.askT && S.time - x.askT < 12) { if (heldToo && !(x.jamT && S.time - x.jamT < 12)) best = Math.min(best, FAF - vt); }
    else if (x.o && !x.o.dead && x.fx != null) {
      // one circling at the fix without asking (no stand for it yet) is not coming in
      const d = U.dxy(x.o.x, x.o.y, x.fx, x.fy);
      if (d > 20 || !x.askT) best = Math.min(best, FAF + d - vt);
    }
  }
  return best;
}
/* the closest an arrival already on its final will be in t seconds */
function finNear(ap, k, t) { let best = 1e9; for (const m of ap.moves) if (m.kind === 'arr' && m.phase === 'final' && m.finK === k) best = Math.min(best, FAF * (1 - m.t / (FAF / ARR_V)) - ARR_V * t); return best; }
/* how long until an aircraft on the runways is off them, as the tower expects it */
function clearIn(S, ap, o, k) {
  if (o.kind === 'arr') return 1e9;
  if (o.cross) return 25;
  const R = rollT(o.T), L = lockOf(ap, k);
  if (o.phase === 'roll') return Math.max(0, (o.delay || 0)) + Math.max(0, R * (1 - (o.rolled || 0) / (o.T.rwy * 0.6)));
  const line = o.phase === 'lineup' ? Math.max(0, o.t) : o.phase === 'wait' ? 0 : ROLLING + 8;
  return Math.max(line, L.next - S.time) + CREW + R;
}
const rollT = T => 2 * T.rwy * 0.6 / LIFT;
/* what a set of rules will cost at this airport, in plain sentences (the Operations tab shows them before applying) */
IC.opsNotes = function (S, ap, st, ops) {
  const out = [];
  const types = Object.keys(st.mix || {}).filter(k => IC.ACTYPES[k] && !IC.ACTYPES[k].vtol);
  // where arrivals and departures share a runway: who is too slow off the runway for the gap
  const shared = (st.rwy || []).filter(r => r.role === 'mixed');
  if (shared.length) {
    const R = IC.opsRules(ap, shared[0].id, ops), room = (R.gap * 10 - GO) / ARR_V;
    const slow = [...new Set(types.filter(k => rollT(IC.ACTYPES[k]) + CREW > room).map(k => IC.opsKind(k)))];
    if (slow.length) out.push(`With a ${R.gap} km gap, ${slow.map(k => IC.OPS_KINDS.find(x => x[0] === k)[1].toLowerCase()).join(' and ')} are often still on the runway when the next arrival is 1 km out: expect go-arounds.`);
  }
  // only the kinds of civil aircraft that fly here count
  const kinds = [...new Set(types.filter(k => !IC.ACTYPES[k].mil).map(k => IC.opsKind(k)))];
  const luawIn = r => kinds.some(k => r.enter[k] === 'luaw');
  const R0 = ops.r, anyLuaw = luawIn(R0) || Object.values(ops.rw || {}).some(p => IC.OPS_PRESETS[p] && luawIn(IC.OPS_PRESETS[p].r));
  if (anyLuaw && !st.gradar && ap.kind !== 'airbase') out.push('Aircraft line up and wait at night too, and there is no ground radar: one waiting on the runway in the dark can be forgotten. "By day" or a ground radar removes this risk.');
  if (st.complex && !st.gradar && R0.gap <= 6 && R0.cross === 'gap') out.push(`Crossings with arrivals only ${R0.gap} km out, and no ground radar: more runway incursions at night.`);
  return out;
};

/* ---------- time reservations on taxiways ---------- */
function resList(ap, key) { ap.res = ap.res || new Map(); let L = ap.res.get(key); if (!L) { L = []; ap.res.set(key, L); } return L; }
/* how long an aircraft entering this edge at t0 must wait for traffic booked the other way */
function resWait(ap, e, t0, m) {
  if (e.kind !== 'taxi' || !ap.res) return 0;
  const L = ap.res.get(e.key); if (!L) return 0;
  const t1 = t0 + e.len / e.spd;
  let wait = 0;
  for (const r of L) {
    if (r.m === m || r.m.dead || r.d === e.d) continue;
    if (r.t0 < t1 + wait + MARGIN && r.t1 > t0 + wait - MARGIN) wait = Math.max(wait, r.t1 + MARGIN - t0);
  }
  return wait;
}
IC.gopsResWait = resWait;
function unreserve(ap, m) {
  if (!m.resv || !ap.res) { m.resv = null; return; }
  for (const k of m.resv) { const L = ap.res.get(k); if (L) { const i = L.findIndex(r => r.m === m); if (i >= 0) L.splice(i, 1); } }
  m.resv = null;
}
/* book each taxiway on the route for the time the aircraft expects to be on it */
function reserve(S, ap, m, steps, t0) {
  unreserve(ap, m);
  m.resv = [];
  let t = t0;
  for (let i = 0; i < steps.length; i++) {
    const e = steps[i].e;
    t += resWait(ap, e, t, m);
    const t1 = t + e.len / e.spd;
    if (e.kind === 'taxi') {
      // the taxiway up to a runway is where aircraft queue for it: book it for longer
      const slack = 6 + (t1 - S.time) * 0.12, toRw = !!G(ap).N.get(e.to).rw;
      resList(ap, e.key).push({ m, d: e.d, t0: t - slack * 0.5, t1: t1 + slack + (toRw ? 600 : 0), i, path: steps });
      m.resv.push(e.key);
    }
    t = t1 + (e.kind === 'rwy' ? 20 : 0);
  }
}
/* seconds until an aircraft reaches step i of its route */
function etaTo(S, m, r) {
  if (m.path !== r.path || m.phase !== 'taxi') return Math.max(0, r.t0 - S.time);
  if (m.pi > r.i) return 1e9;
  let d = -m.s;
  for (let k = m.pi; k < r.i; k++) d += m.path[k].e.len;
  return Math.max(0, d) / TAXI;
}

/* ---------- taxiway occupancy ---------- */
function occList(ap, key) { ap.eo = ap.eo || new Map(); if (!ap.eo.has(key)) ap.eo.set(key, []); return ap.eo.get(key); }
/* '' when the aircraft may enter this edge now; otherwise why not: oncoming traffic on it, a queue at its start,
   or traffic booked the other way that will get there first */
function enterWhy(S, ap, m, st, e) {
  if (e.kind === 'apron') return '';
  const d = e.d;
  for (const o of occList(ap, e.key)) {
    if (o.m === m || o.m.dead) continue;
    if (o.d !== d) return 'opp';
    if (o.m.s < SPACING + 0.05 && o.m.edgeKey === e.key) return 'queue';
  }
  // someone kept waiting at the other end by traffic this way gets the next turn
  const c = ap.claim && ap.claim.get(e.key);
  if (c && c.m !== m && !c.m.dead && c.d !== d && S.time - c.t < 5 && m.preKey !== e.key) return 'claim';
  // traffic booked the other way earlier has the right of way if it will reach this taxiway before we are off it,
  // unless it has kept us waiting for two minutes already
  if (e.kind === 'taxi' && ap.res && (m.resT || 0) < 120 && m.preKey !== e.key) {
    const L = ap.res.get(e.key);
    if (L) {
      const mine = L.find(r => r.m === m), my0 = mine ? mine.t0 : Infinity, need = e.len / e.spd + MARGIN;
      for (const r of L) {
        if (r.m === m || r.m.dead || r.d === d) continue;
        if (r.t0 > my0 || (r.t0 === my0 && r.m.id > m.id)) continue;
        if (etaTo(S, r.m, r) < need) return 'res';
      }
    }
  }
  return '';
}
function occupy(ap, m, st, e) { unclaim(ap, m); if (e.kind !== 'apron') occList(ap, e.key).push({ m, d: e.d }); m.edgeKey = e.kind !== 'apron' ? e.key : null; }
/* a crossing aircraft holds the taxiway it will leave the runway by, so nobody drives into it head on */
function preOccupy(ap, m, e) { unclaim(ap, m); occList(ap, e.key).push({ m, d: e.d, pre: true }); m.preKey = e.key; }
function unclaim(ap, m) {
  if (m.preKey) { const L = occList(ap, m.preKey), i = L.findIndex(o => o.m === m && o.pre); if (i >= 0) L.splice(i, 1); m.preKey = null; }
  if (m.claimKey && ap.claim) { const c = ap.claim.get(m.claimKey); if (c && c.m === m) ap.claim.delete(m.claimKey); m.claimKey = null; }
}
function vacate(ap, m) {
  if (!m.edgeKey) return;
  const L = occList(ap, m.edgeKey), i = L.findIndex(o => o.m === m); if (i >= 0) L.splice(i, 1);
  if (ap.res && m.resv) { const R = ap.res.get(m.edgeKey); if (R) { const j = R.findIndex(r => r.m === m); if (j >= 0) R.splice(j, 1); } }
  m.edgeKey = null;
}
function leader(ap, m, st, e) {
  if (e.kind === 'apron') return null;
  const d = e.d; let best = null;
  for (const o of occList(ap, e.key)) if (o.m !== m && !o.pre && o.d === d && o.m.s > m.s && (best == null || o.m.s < best)) best = o.m.s;
  return best;
}
/* the live edge for a planned step (the network may have changed since) */
// (kept on the step until the network is rebuilt: an aircraft asks every step, and an apron node has many edges)
function edgeNow(ap, st) {
  const g = G(ap);
  if (st._g === g) return st._le;
  let le = null; const L = g.adj.get(st.from);
  if (L) for (const e of L) if (e.to === st.to && e.kind === st.e.kind) { le = e; break; }
  st._g = g; st._le = le;
  return le;
}
/* entering this edge puts the aircraft on (or across) a runway */
function rwNeed(ap, st, e) {
  if (e.kind === 'rwy') return e.part;
  const g = G(ap); stepNodes(g, st);
  return st._B ? st._B.rw : null;
}
/* the nodes at either end of a planned step, kept on it until the network is rebuilt */
function stepNodes(g, st) { if (st._gn !== g) { st._gn = g; st._A = g.N.get(st.from) || null; st._B = g.N.get(st.to) || null; } }

/* ---------- moves ---------- */
/* every field a move ever gets is declared when it is made (what the caller passes is then assigned onto it): the
   checks each step read moves of every kind side by side, and objects of one shape keep that fast */
function newMove(S, ap, o) {
  const u = undefined;
  const m = Object.assign({ id: IC.nid('mv'), ap: ap.id, phase: 'start', t: 0, x: ap.x, y: ap.y, h: ap.rwyA || 0, spd: 0, path: null, pi: 0, s: 0, waitT: 0, taxiT: 0, blockT: 0, rwT: 0, born: S.time,
    // what the caller says
    kind: u, type: u, node: u, target: u, stand: u, startT: u, readyT: u, faf: u, door: u, who: u, tail: u, livery: u, mil: u, scramble: u, flight: u, n: u, spdK: u, contact: u,
    onAir: u, onDead: u, onPark: u, onGoAround: u, onLeave: u,
    // the plan, taxiing and holding
    T: u, plan: u, via: u, svcIn: u, gm: u, gmLog: u, onEdge: u, edgeKey: u, preKey: u, claimKey: u, resv: u, resT: u, oppT: u, holding: u, holdWhy: u, holdLog: u, advT: u, bayPick: u,
    // the runway
    luawOk: u, luaw: u, locks: u, crossBlk: u, xing: u, rolled: u, delay: u, finK: u, fx: u, fy: u, tx: u, ty: u, alt: u, inPath: u, onRw: u, s0: u, pos: u, goals: u, turned: u, backLog: u, crossed: u,
    // trouble
    stuck: u, noRouteLog: u, left: u, dead: u, destroyed: u, why: u, crash: u, hitOn: u, forgot: u }, o);
  m.T = IC.ACTYPES[m.type];
  ap.moves.push(m);
  return m;
}
function place(ap, m) {
  const st = m.path && m.path[m.pi];
  if (!st) { const n = G(ap).N.get(m.node); if (n) { m.x = n.x; m.y = n.y; } return; }
  stepNodes(G(ap), st);
  const A = st._A, B = st._B; if (!A || !B) return;
  const L = st.e.len || U.dist(A, B), f = U.clamp(m.s / L, 0, 1);
  m.x = A.x + (B.x - A.x) * f; m.y = A.y + (B.y - A.y) * f;
  if (L > 0.01) m.h = Math.atan2(B.y - A.y, B.x - A.x);
}
function finishPath(m) { m.path = null; m.pi = 0; m.s = 0; }

/* ---------- departures ---------- */
/* the best runway entry for this aircraft: into the wind, on a departure runway, with enough runway ahead */
function planDeparture(S, ap, m, dry) {
  const g = G(ap), cfg = cfgOf(S, ap), T = m.T;
  // every place the take-off could start, with what it costs besides the taxi there
  const C = [];
  for (const rw of runways(ap)) {
    const c = cfg.rw[rw.id]; if (!c) continue;
    const L = IC.rwLen(rw), dir = c.dir, need = toNeed(T);
    if (IC.rwUsable(rw) < T.rwy || IC.rwWindBlock(S, rw, dir, T)) continue;
    // departures belong on departure runways; an arrival runway is used only when nothing else fits;
    // and they spread over the departure runways by the queue each already has
    const role = (c.role === 'dep' || c.role === 'mixed' ? 0 : c.role === 'arr' ? 3000 : 5000) + depQueue(ap, keyOf(ap, rw.id)) * 120;
    // any point on the runway will do as a start, even one reached by backtracking along it from a taxiway; part way
    // down the runway (an intersection departure) only where the rules allow it for this type
    const full = IC.opsInterOk(IC.opsRules(ap, rw.id), T) ? 0 : fullRoom(rw, g, dir, need) - 3;
    for (const n of g.rwn.get(rw.id) || []) {
      const room = dir > 0 ? L - n.s : n.s;
      if (room < need || room < full || !clearRun(rw, n.s, n.s + dir * need)) continue;
      // (an entry where a departure is waiting for its release is taken only if there is no other: a holding bay's
      // other tracks let a ready aircraft pass it)
      const waiting = ap.moves.some(x => x !== m && x.kind === 'dep' && !x.dead && x.readyT > S.time && x.plan && x.plan.start && x.plan.start.id === n.id && x.phase !== 'start' && x.phase !== 'push');
      C.push({ rw, dir, n, role, pen: (room < L * 0.6 ? 25 : 0), wait: waiting ? 900 : 0 });
    }
  }
  let tree;
  if (dry) tree = IC.aptTree(ap, m.node, false, T.ht);
  else {
    // the search with reservations heads for the runways (A*: the straight-line taxi time to each runway plus twice
    // what a start there costs besides the taxi, which never overstates a start's doubled total, less a margin for
    // nodes a little off the centre line), and stops once no start still unreached could beat the best one reached:
    // a big airport's whole taxi graph is not searched for each departure
    const ext = new Map(), rwX = new Map(); let top = Infinity;
    for (const c of C) {
      const x = c.role + c.pen + c.wait, v = ext.get(c.n.id); if (v == null || x < v) ext.set(c.n.id, x);
      const r = rwX.get(c.rw); if (r == null || x < r) rwX.set(c.rw, x);
    }
    if (g.vmax == null) { g.vmax = 0.01; for (const L of g.adj.values()) for (const e of L) g.vmax = Math.max(g.vmax, e.spd || 0); }
    const R = [...rwX].map(([rw, x]) => [rw.a.x, rw.a.y, rw.b.x, rw.b.y, 2 * x]), hk = 0.85 / g.vmax;
    const h = n => { let b = Infinity; for (const r of R) { const v = U.segDist(n.x, n.y, r[0], r[1], r[2], r[3]) * hk + r[4]; if (v < b) b = v; } return b < Infinity ? Math.max(0, b - 2) : 0; };
    tree = IC.aptSearch(ap, m.node, { res: { m, t0: S.time + (m.t > 0 ? m.t : 0) }, h, stop: (u, du, f) => {
      if (f > 2 * top + 1e-6) return true;
      const x = ext.get(u); if (x != null && du * 0.5 + x < top) top = du * 0.5 + x;
      return false;
    } });
  }
  let best = null;
  for (const c of C) {
    const n = c.n, cost = n.id === m.node ? 0 : tree.dist.get(n.id);
    if (cost == null) continue;
    // the tower balances the departure runways: a longer taxi is worth it to skip a queue
    const total = cost * 0.5 + c.role + c.pen + c.wait;
    if (!best || total < best.cost) best = { cost: total, rw: c.rw, dir: c.dir, start: n };
  }
  if (best) best.p = { cost: best.cost, steps: best.start.id === m.node ? [] : IC.aptSteps(tree, m.node, best.start.id) };
  return best;
}
/* (round 5b) the runway a take-off needs is the type's runway length, the same number every check uses (airport
   stats, deals, founding). It was 5% and 100 m more: a 3 km runway took freighters in and never let them out */
const toNeed = T => T.rwy;
IC.toNeed = toNeed;
/* the longest take-off run any point on this runway offers in this direction */
function fullRoom(rw, g, dir, need) {
  const L = IC.rwLen(rw); let best = 0;
  for (const n of g.rwn.get(rw.id) || []) { const room = dir > 0 ? L - n.s : n.s; if (room > best && clearRun(rw, n.s, n.s + dir * need)) best = room; }
  return best;
}
function depQueue(ap, k) { let n = 0; for (const x of ap.moves) if (x.kind === 'dep' && x.plan && x.phase !== 'start' && x.phase !== 'push' && keyOf(ap, x.plan.rw.id) === k) n++; return n; }
function clearRun(rw, s0, s1) {
  const L = IC.rwLen(rw), a = Math.min(s0, s1), b = Math.max(s0, s1);
  if (a < -0.01 || b > L + 0.01) return false;
  return !rw.craters.some(c => c.t * L + c.r > a && c.t * L - c.r < b);
}
/* o: { type, node (start node id), stand, startT, contact, onAir(m), onDead(m), who, mil, scramble } */
IC.gopsDepart = function (S, ap, o) {
  if (o.stand && o.stand.drive && G(ap).N.has(o.stand.id + 'o')) o = Object.assign({}, o, { node: o.stand.id + 'o' });
  const m = newMove(S, ap, Object.assign({ kind: 'dep' }, o));
  m.phase = 'start'; m.t = o.startT || 0;
  // (taxiing out ahead of its release: it may not take off before then, and waits at the holding position)
  m.readyT = o.readyT || 0;
  const n = G(ap).N.get(o.node); if (n) { m.x = n.x; m.y = n.y; }
  if (o.stand) { m.x = o.stand.x; m.y = o.stand.y; m.h = o.stand.a; }
  if (o.door) { m.x = o.door.x; m.y = o.door.y; }
  const plan = planDeparture(S, ap, m, true);
  if (!plan) { ap.moves = ap.moves.filter(x => x !== m); return null; }
  m.plan = plan;
  if (o.tail && !o.mil) m.via = serviceStops(S, ap, m);
  return m;
};
IC.gopsCanDepart = function (S, ap, type, node) { const m = { T: IC.ACTYPES[type], node, t: 0 }; return !!planDeparture(S, ap, m, true); };
/* (round 5b) why a departure from this stand cannot be planned, in words: the runway, the wind or the taxiways */
IC.gopsDepartWhy = function (S, ap, type, node) {
  const T = IC.ACTYPES[type], rws = runways(ap), cfg = cfgOf(S, ap);
  if (!rws.length) return { k: 'rwy', why: 'no runway is open' };
  const long = rws.filter(rw => IC.rwUsable(rw) >= toNeed(T));
  if (!long.length) return { k: 'rwy', why: `no open runway is long enough to take off: a ${T.name} needs ${U.km(toNeed(T))}, the longest open has ${U.km(Math.max(0, ...rws.map(IC.rwUsable)))}` };
  const wind = long.map(rw => cfg.rw[rw.id] ? IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, T) : 'closed');
  if (wind.every(Boolean)) return { k: 'wind', why: `the wind: ${wind.find(w => w !== 'closed') || 'every runway long enough is closed'}` };
  return { k: 'route', why: 'no taxiway leads from its stand to a runway it can take off from' };
};

/* ---------- arrivals ---------- */
/* touchdown, the point where the landing roll slows to taxi speed, and the exit taken */
function landPlan(ap, rw, dir, T, strip, exits) {
  const [s0, s1] = strip;
  const touch = dir > 0 ? s0 + 1.5 : s1 - 1.5, stop = touch + dir * T.rwy * 0.5;
  const inStrip = exits.filter(n => n.s >= s0 - 0.01 && n.s <= s1 + 0.01);
  const ahead = inStrip.filter(n => (n.s - stop) * dir >= 0).sort((a, b) => (a.s - b.s) * dir);
  const behind = inStrip.filter(n => (n.s - stop) * dir < 0).sort((a, b) => (b.s - a.s) * dir);
  return { touch, stop, cands: ahead.slice(0, 3).concat(behind.slice(0, 2)) };
}
const rollTime = (T) => 2 * T.rwy * 0.5 / (TOUCH + RWTAXI);
/* how long an arrival or a departure holds its runways, for this type, in seconds (the panel shows the same).
   R: the rules to judge by (the runway's own by default). dep: from the hold-short line to lift-off, cleared for
   take-off; E: the part of it spent getting to the start of the take-off (with any backtracking); roll: the run. */
IC.rwOcc = function (S, ap, rw, dir, T, R) {
  const g = G(ap), L = IC.rwLen(rw), nodes = g.rwn.get(rw.id) || [];
  let land = 1e9;
  for (const strip of IC.rwStrips(rw)) {
    if (strip[1] - strip[0] < T.rwy) continue;
    const P = landPlan(ap, rw, dir, T, strip, nodes.filter(n => n.exit));
    for (const n of P.cands) {
      const back = (n.s - P.stop) * dir < 0;
      const t = FAF / ARR_V + rollTime(T) + Math.abs(n.s - P.stop) / RWTAXI + (back ? 60 : 0) + CLEAR / TAXI;
      land = Math.min(land, t);
    }
  }
  R = R || IC.opsRules(ap, rw.id);
  let E = 1e9;
  const need = toNeed(T), entries = nodes.filter(n => n.entry), full = IC.opsInterOk(R, T) ? 0 : fullRoom(rw, g, dir, need) - 3;
  for (const n of nodes) {
    const room = dir > 0 ? L - n.s : n.s;
    if (!entries.length || room < need || room < full || !clearRun(rw, n.s, n.s + dir * need)) continue;
    // with no taxiway to where the take-off starts, it backtracks along the runway from the nearest entry
    const back = n.entry ? 0 : Math.min(...entries.map(x => Math.abs(x.s - n.s))) / RWTAXI + 30;
    E = Math.min(E, HOLD / TAXI + back);
  }
  const roll = rollT(T), line = T.mil ? ROLLING / 2 : ROLLING;
  return { land, dep: E < 1e8 ? E + line + CREW + roll : 1e9, E, roll, line };
};
function planArrival(S, ap, T, target, pref, mil) {
  const g = G(ap), cfg = cfgOf(S, ap), imc = IC.needILS(S) && !mil;
  const back = IC.aptTree(ap, target, true, T.ht);
  let best = null;
  for (const rw of runways(ap)) {
    const c = cfg.rw[rw.id]; if (!c) continue;
    const dir = c.dir;
    if (IC.rwWindBlock(S, rw, dir, T)) continue;
    // in fog and low cloud only an end with an instrument landing system will do
    if (imc && !IC.rwHasILS(ap, rw, dir)) continue;
    // the runway the aircraft was sequenced to; another means a long detour in the air
    const role = rw.id === pref || !pref ? (c.role === 'arr' || c.role === 'mixed' ? 0 : c.role === 'dep' ? 500 : 900) : 3000;
    const exits = (g.rwn.get(rw.id) || []).filter(n => n.exit);
    for (const strip of IC.rwStrips(rw)) {
      if (strip[1] - strip[0] < T.rwy) continue;
      const P = landPlan(ap, rw, dir, T, strip, exits);
      for (const n of P.cands) {
        const pc = back.dist.get(n.id);
        if (pc == null) continue;
        const bk = (n.s - P.stop) * dir < 0;
        // turning round on the runway to go back to an exit is slow
        const rwTime = Math.abs(n.s - P.stop) / RWTAXI + (bk ? 60 : 0);
        // an exit where aircraft are queued the other way for the runway would block us on it
        const out = back.prev.get(n.id), jam = out && resWait(ap, out, S.time + FAF / 0.95 + rollTime(T) + rwTime, null) > 0 ? 300 : 0;
        const cost = rwTime * 2 + pc + role + jam;
        if (!best || cost < best.cost) best = { cost, rw, dir, touch: P.touch, stop: P.stop, exit: n, back: bk, rwTime, strip, out };
      }
    }
  }
  return best;
}
/* where an arriving aircraft should start its final approach. Like an arrival manager: each aircraft goes to the
   arrival runway that will have it on the ground soonest, given the aircraft already sent there. */
IC.gopsFaf = function (S, ap, type, who) {
  const T = IC.ACTYPES[type], cfg = cfgOf(S, ap), imc = IC.needILS(S) && !T.mil, g = G(ap);
  const fit = runways(ap).filter(r => cfg.rw[r.id] && IC.rwUsable(r) >= T.rwy && !IC.rwWindBlock(S, r, cfg.rw[r.id].dir, T) && (!imc || IC.rwHasILS(ap, r, cfg.rw[r.id].dir)) && IC.rwFireOk(ap, r, T));
  if (!fit.length) return null;
  const q = ap.fafQ = (ap.fafQ || []).filter(x => !x.done && S.time - x.t < 1800);
  const occ = (rw, TT) => { const k = rw.id + '|' + cfg.rw[rw.id].dir + '|' + TT.short; let v = g.occ && g.occ.get(k); if (v == null) { const o = IC.rwOcc(S, ap, rw, cfg.rw[rw.id].dir, TT).land; v = (o < 1e8 ? o : 300) + IC.aptSep(ap.st || {}, rw.id) * 0.5; (g.occ = g.occ || new Map()).set(k, v); } return v; };
  const when = rw => { const L = lockOf(ap, keyOf(ap, rw.id)); let t = Math.max(0, L.next - S.time) + (L.by ? 60 : 0); for (const x of q) if (x.rw === rw.id) t += occ(rw, IC.ACTYPES[x.type]); return t + occ(rw, T); };
  const role = r => cfg.rw[r.id].role === 'arr' || cfg.rw[r.id].role === 'mixed' ? 0 : 1e5;
  fit.sort((a, b) => (role(a) + when(a)) - (role(b) + when(b)));
  const rw = fit[0];
  const dir = cfg.rw[rw.id].dir, d = IC.rwDir(rw), th = dir > 0 ? rw.a : rw.b;
  // the tower follows the aircraft (who) in to the fix, to know how far out the next arrival is
  const entry = { t: S.time, rw: rw.id, type, o: who || null, fx: th.x - d.x * dir * FAF, fy: th.y - d.y * dir * FAF };
  q.push(entry);
  return { x: entry.fx, y: entry.fy, rw, rwId: rw.id, q: entry };
};
/* an aircraft at the approach fix asks to land. o: { type, target (node id), stand, faf, onPark(m), onDead(m),
   onGoAround(m), who, mil }. Returns the move when cleared, 'hold' when it must wait, or 'divert' when it can never
   land here. The runway itself is taken 1 km out; if it is still occupied then, the arrival goes around. */
IC.gopsLand = function (S, ap, o) {
  const T = IC.ACTYPES[o.type];
  if (!ap.st || (ap.st.longest || 0) < T.rwy) return 'divert';
  const plan = planArrival(S, ap, T, o.target, o.faf && o.faf.rwId, o.mil);
  if (!plan) return 'divert';
  const k = keyOf(ap, plan.rw.id), q = o.faf && o.faf.q;
  // an aircraft arriving straight in is on a continuous approach; one that has been told to hold is cleared again
  // only when the runway will be free for it
  const straight = !(q && q.askT);
  if (q) q.askT = S.time;
  const probe = { id: 'probe', kind: 'arr', mil: o.mil, waitT: 0 };
  // not while an aircraft sits in the exit it will need, waiting to come the other way onto the runway
  // (departures do not wait for it meanwhile: they are what it waits for)
  if (plan.out && plan.out.kind !== 'apron' && occList(ap, plan.out.key).some(x => x.d !== plan.out.d && !x.m.dead)) { if (q) q.jamT = S.time; return 'hold'; }
  if (!arrClear(S, ap, k, probe, straight)) { wantIt(S, ap, k, probe); return 'hold'; }
  const m = newMove(S, ap, Object.assign({ kind: 'arr' }, o));
  lockOf(ap, k).fin = m.id; m.finK = k;
  if (q) q.done = true;
  m.plan = plan; m.phase = 'final';
  const d = IC.rwDir(plan.rw), dir = plan.dir, th = IC.rwAt(plan.rw, plan.touch / IC.rwLen(plan.rw));
  m.fx = th.x - d.x * dir * FAF; m.fy = th.y - d.y * dir * FAF; m.tx = th.x; m.ty = th.y;
  m.x = m.fx; m.y = m.fy; m.h = Math.atan2(d.y * dir, d.x * dir); m.t = 0; m.alt = 0.6;
  // plan the taxi in now, so taxiways are booked for when it turns off
  const tIn = S.time + FAF / ARR_V + rollTime(T) + plan.rwTime;
  const p = IC.aptSearch(ap, plan.exit.id, { to: o.target, avoidRwy: true, res: { m, t0: tIn } });
  if (p.dist.has(o.target)) { m.inPath = IC.aptSteps(p, plan.exit.id, o.target); reserve(S, ap, m, m.inPath, tIn); }
  // and it keeps its exit clear of oncoming traffic until it is through
  const ex = m.inPath && m.inPath[0] ? edgeNow(ap, m.inPath[0]) : plan.out;
  if (ex && ex.kind !== 'apron') preOccupy(ap, m, ex);
  return m;
};
/* may an arrival start its final approach now? One arrival on final at a time, spaced after the last; one that has
   been holding also waits until whoever is on the runway will be off it before it is 1 km out */
function arrClear(S, ap, k, m, straight) {
  const L = lockOf(ap, k);
  if (ap.closedT && S.time < ap.closedT && !m.mil) return false;
  if (L.fin && moveOf(ap, L.fin)) return false;
  if (S.time < (L.nextA || 0)) return false;
  const w = ap.want && ap.want[k];
  if (w && S.time - w.t < 8 && w.p > prioOf(m)) return false;
  const on = L.by ? [L.by].concat(L.with ? [...L.with] : []) : [];
  const tGo = (FAF - GO) / ARR_V;
  for (const id of on) {
    const x = moveOf(ap, id); if (!x) continue;
    if (x.kind === 'arr') return false;
    // behind a departure already on its take-off run the gap rule below decides (a tight gap can send it round)
    if (!straight && x.phase !== 'roll' && clearIn(S, ap, x, k) > tGo) return false;
  }
  // a departure the tower has promised a gap to goes first: arrivals reaching the fix are held for it
  if (L.gapFor && moveOf(ap, L.gapFor)) return false;
  // none starts its final sooner than if it had been the gap away when the last departure started its run
  if (L.runT && S.time < L.runT + Math.max(0, (L.runGap || 0) - FAF) / ARR_V) return false;
  return true;
}

/* ---------- per-tick movement ---------- */
function stepTaxi(S, ap, m, dt) {
  let budget = dt;
  while (budget > 1e-6 && m.path && m.pi < m.path.length) {
    const st = m.path[m.pi];
    const e = edgeNow(ap, st);
    if (!e) { replan(S, ap, m); m.waitT += budget; return; }
    const rwId = rwNeed(ap, st, e), k = rwId && keyOf(ap, rwId);
    const needLock = k && !(m.locks && m.locks[k]);
    if (!m.onEdge && m.kind === 'dep' && !m.bayPick && G(ap).bays && G(ap).bays.has(e.part)) {
      // at the mouth of a holding bay: the tower picks the track, past anyone still waiting for a release
      m.bayPick = true;
      const p = planDeparture(S, ap, m);
      if (p && p.rw === m.plan.rw && p.start.id !== m.plan.start.id && p.p.steps && p.p.steps.length) { unreserve(ap, m); m.plan = p; m.path = p.p.steps; m.pi = 0; m.s = 0; reserve(S, ap, m, m.path, S.time); continue; }
    }
    if (!m.onEdge) {
      // a runway edge needs the runway before we move at all; the approach to a runway stops at the hold-short line
      if (needLock && (e.kind === 'rwy' || e.len <= HOLD + 0.05)) {
        if (!holdShort(S, ap, m, k, budget, crossKey(m, st, e), rwId)) return;
      }
      const why = enterWhy(S, ap, m, st, e);
      if (why) {
        m.waitT += budget; m.holding = why === 'queue' || why === 'claim' ? 'queue' : 'traffic';
        if (why === 'res') m.resT = (m.resT || 0) + budget;
        // after a while, traffic from the other end stops coming until we are through
        if (why === 'opp' || why === 'res') m.oppT = (m.oppT || 0) + budget;
        if (m.oppT > 45) { const C = ap.claim = ap.claim || new Map(), c = C.get(e.key); if (!c || c.m === m || c.m.dead || S.time - c.t >= 5) { C.set(e.key, { m, d: e.d, t: S.time }); m.claimKey = e.key; } }
        // only oncoming traffic that has stopped is a jam (nose to nose): a tug tows one aircraft out of the way
        if (why !== 'opp') return;
        if (occList(ap, e.key).some(o => o.m !== m && o.d !== e.d && S.time - (o.m.advT || 0) < 10)) return;
        m.blockT += budget;
        if (m.blockT < FORCE) return;
        gridlock(S, ap, m);
      }
      occupy(ap, m, st, e); m.onEdge = true; m.blockT = 0; m.resT = 0; m.oppT = 0; m.holding = null;
    }
    const spd = e.spd * (m.spdK || 1);
    let lim = e.len;
    if (k && !(m.locks && m.locks[k]) && e.kind !== 'rwy') lim = Math.max(0, e.len - HOLD);
    const lead = leader(ap, m, st, e);
    let adv = spd * budget;
    if (lead != null) adv = Math.max(0, Math.min(adv, lead - SPACING - m.s));
    adv = Math.min(adv, Math.max(0, lim - m.s));
    if (adv <= 1e-6) {
      if (m.s >= lim - 1e-6 && lim < e.len) {
        // at the hold-short line: wait for the runway, then go
        if (!holdShort(S, ap, m, k, budget, crossKey(m, st, e), rwId)) return;
        continue;
      }
      // a hair short of the edge's end (the aircraft ahead let it advance to within rounding of it): the edge is
      // done, on to the next; queueing here instead would never end
      if (m.s >= e.len - 1e-6) { vacate(ap, m); m.onEdge = false; m.s = 0; m.node = st.to; m.pi++; if (m.locks) freeBehind(S, ap, m, null); continue; }
      // queueing behind the aircraft ahead
      m.waitT += budget; m.holding = 'queue';
      return;
    }
    m.blockT = 0; m.holding = null; m.advT = S.time;
    const rem = e.len - m.s;
    if (adv >= rem - 1e-9) {
      budget -= rem / spd; m.taxiT += rem / spd;
      if (e.kind === 'rwy') m.rwT += rem / spd;
      vacate(ap, m); m.onEdge = false; m.s = 0; m.node = st.to; m.pi++;
      if (m.locks) freeBehind(S, ap, m, null);
    } else {
      m.s += adv; budget -= adv / spd; m.taxiT += adv / spd; if (e.kind === 'rwy') m.rwT += adv / spd;
      // far enough off the runway to free it for the next aircraft
      if (m.locks && e.kind !== 'rwy' && m.s > CLEAR && m.s - adv <= CLEAR) freeBehind(S, ap, m, st);
    }
  }
  place(ap, m);
}
/* a crossing: onto the runway and straight off the other side (not a departure lining up) */
function crossKey(m, st, e) { const nx = m.path[m.pi + 1]; return e.kind !== 'rwy' && nx && nx.e.kind !== 'rwy' ? e.key : null; }
/* the step by which an aircraft about to go onto a runway will leave it again (none for a departure) */
function exitStep(m) { let j = m.pi + 1; while (m.path[j] && m.path[j].e.kind === 'rwy') j++; return m.path[j] || null; }
/* waiting at the hold-short line for a runway; true once cleared onto it */
function holdShort(S, ap, m, k, dt, cross, rwId) {
  // never go onto a runway unless the way off it is clear of oncoming traffic
  const ex = exitStep(m), e2 = ex && edgeNow(ap, ex);
  let why = '';
  if (e2 && e2.kind !== 'apron') {
    const w2 = enterWhy(S, ap, m, ex, e2);
    if (w2 === 'opp' || w2 === 'claim') {
      why = 'traffic on the far side'; m.crossBlk = (m.crossBlk || 0) + dt;
      // kept waiting: find another way round
      if (m.crossBlk > 90) { m.crossBlk = 0; replan(S, ap, m, ex.from); return false; }
    }
  }
  const own = !cross && m.kind === 'dep' && m.plan && keyOf(ap, m.plan.rw.id) === k;
  if (!why && own && m.readyT > S.time) { m.waitT += dt; m.holding = 'release'; m.holdWhy = `waiting for its release, ${Math.ceil(m.readyT - S.time)} s`; place(ap, m); return false; }
  if (!why) why = mayEnter(S, ap, m, k, cross, rwId);
  if (!why) {
    take(ap, k, m, cross, S.time); m.holding = null; m.holdWhy = null; m.holdLog = false; m.crossBlk = 0;
    if (cross) m.xing = k;
    if (e2 && e2.kind !== 'apron') preOccupy(ap, m, e2);
    return true;
  }
  wantIt(S, ap, k, m);
  m.waitT += dt; m.holding = 'runway'; m.holdWhy = why;
  if (m.kind === 'dep') ap.depWait = (ap.depWait || 0) + 1;
  if (!m.holdLog) { m.holdLog = true; incursion(S, ap, m, k); }
  place(ap, m);
  return false;
}
/* the runway whose rules apply to this aircraft going onto the runways k */
const ruleRw = (ap, m, k, rwId) => rwId || (m.plan && m.plan.rw && keyOf(ap, m.plan.rw.id) === k ? m.plan.rw.id : null);
const kmTxt = d => `${Math.max(0, Math.round(d / 10))} km`;
/* '' when the rules let this aircraft go onto the runways k now; otherwise why not, in a few words */
function mayEnter(S, ap, m, k, cross, rwId) {
  const R = IC.opsRules(ap, ruleRw(ap, m, k, rwId)), L = lockOf(ap, k);
  const own = !cross && m.kind === 'dep' && m.plan && keyOf(ap, m.plan.rw.id) === k;
  const luaw = own && (m.scramble || IC.opsEnter(S, R, m.type, m.T) === 'luaw');
  if (own) m.luawOk = luaw;
  if (!canTake(S, ap, k, m, cross, luaw)) return busyWhy(S, ap, k, m);
  // the next arrival must be beyond the gap when the take-off starts (for a crossing: now). A scramble only waits
  // for arrivals close in; one kept waiting a long time gets a gap: the tower holds arrivals at the fix for it.
  let gap = R.gap * 10;
  if (cross && R.cross === 'radar' && IC.opsDark(S) && !(ap.st && ap.st.gradar)) gap *= 2;
  if (m.scramble) gap = Math.min(gap, FAF);
  const t = own ? rollStart(S, ap, m, k, luaw) : 0, held = m.scramble || L.gapFor === m.id;
  if ((held ? finNear(ap, k, t) : arrNear(S, ap, k, t, true)) >= gap) return '';
  // kept waiting two minutes: the approach controller makes a gap, holding the next arrivals at the fix (one
  // departure for each arrival that lands, so neither queue starves)
  if (!held && (m.waitT || 0) >= PATIENCE && (L.gapOk !== false || S.time - L.gapT > 300) && !(L.gapFor && moveOf(ap, L.gapFor))) { L.gapFor = m.id; L.gapT = S.time; L.gapOk = false; }
  return `arrival ${kmTxt(held ? finNear(ap, k, 0) : arrNear(S, ap, k, 0, true))} out`;
}
function busyWhy(S, ap, k, m) {
  const L = lockOf(ap, k);
  if (ap.closedT && S.time < ap.closedT && !m.mil) return 'runway closed';
  const o = L.by && moveOf(ap, L.by);
  if (o) return o.kind === 'arr' ? 'arrival on the runway' : o.xing ? 'aircraft crossing' : o.phase === 'roll' ? 'departure rolling' : 'departure on the runway';
  if (S.time < L.next) return `wake gap ${Math.ceil(L.next - S.time)} s`;
  const w = ap.want && ap.want[k];
  return w && w.p === 4 ? 'a scramble goes first' : 'arrivals go first';
}
/* seconds until this departure would start its take-off run if it went onto the runway now */
function rollStart(S, ap, m, k, luaw) {
  const L = lockOf(ap, k), E = entryT(m), mil = m.T.mil;
  const line = mil ? ROLLING / 2 : ROLLING, lineW = mil ? 10 : LINE, wake = Math.max(0, L.next - S.time);
  const o = L.by && L.by !== m.id ? moveOf(ap, L.by) : null;
  if (o) return Math.max(E + lineW, clearIn(S, ap, o, k) + sepOf(ap, o)) + CREW;
  return (luaw && wake > E + line ? Math.max(E + lineW, wake) : Math.max(E + line, wake)) + CREW;
}
/* seconds of taxiing left to where the take-off starts */
function entryT(m) {
  if (!m.path || m.phase !== 'taxi') return 0;
  let t = -m.s / TAXI;
  for (let j = m.pi; j < m.path.length; j++) t += m.path[j].e.len / (m.path[j].e.kind === 'rwy' ? RWTAXI : TAXI);
  return Math.max(0, t);
}
/* a departure lined up: '' when it may start its take-off run now */
function takeoffWhy(S, ap, m, k) {
  const L = lockOf(ap, k);
  if (L.by !== m.id) return 'departure ahead';
  if (S.time < L.next) return `wake gap ${Math.ceil(L.next - S.time)} s`;
  // the tower clears it if it will be airborne before the next arrival is 1 km out
  const d = arrNear(S, ap, k, CREW + rollT(m.T), false);
  if (d < GO && !m.scramble) return `arrival ${kmTxt(arrNear(S, ap, k, 0, false))} out`;
  return '';
}
/* release runways we are no longer on or about to use; cur is the taxiway we are leaving them by */
function freeBehind(S, ap, m, cur) {
  const g = G(ap);
  const inK = (id, k) => { const n = g.N.get(id); return n && n.rw && keyOf(ap, n.rw) === k; };
  for (const k in m.locks) {
    let keep;
    if (cur) keep = m.s <= CLEAR || inK(cur.to, k);
    else { const nx = m.path && m.path[m.pi]; keep = inK(m.node, k) || !!(nx && ((nx.e.kind === 'rwy' && keyOf(ap, nx.e.part) === k) || (inK(nx.to, k) && nx.e.len <= HOLD + 0.05))); }
    if (m.kind === 'dep' && m.plan && keyOf(ap, m.plan.rw.id) === k && (!m.path || m.pi >= m.path.length)) keep = true;
    if (!keep) { const sp = m.kind === 'arr' && !m.crossed ? sepOf(ap, m) : 5; release(S, ap, k, m, sp, sp === 5 ? 0 : sp); if (m.xing === k) m.xing = null; if (m.kind === 'arr') m.crossed = true; }
  }
}
function gridlock(S, ap, m) {
  m.waitT += 120;
  if (!ap.gridT || S.time - ap.gridT > 1800) {
    ap.gridT = S.time;
    IC.log(S, 'warn', 'GROUND', `${ap.name}: aircraft nose to nose on a taxiway; one had to be towed clear. A parallel taxiway, a one-way flow or a second connection would stop this.`, m);
    IC.emit(S, 'gridlock', { ap, m });
  }
  ap.kpi.grid = (ap.kpi.grid || 0) + 1;
}
/* a new route from the last node passed; avoid: a node the old route went through that is now to be kept clear of */
function replan(S, ap, m, avoid) {
  const goal = m.path[m.path.length - 1].to;
  unreserve(ap, m); unclaim(ap, m);
  const p = IC.aptSearch(ap, m.node, { to: goal, avoidRwy: m.kind === 'arr', res: { m, t0: S.time }, avoid });
  vacate(ap, m); m.onEdge = false;
  if (p.dist.has(goal)) { m.path = IC.aptSteps(p, m.node, goal); m.pi = 0; m.s = 0; m.stuck = false; reserve(S, ap, m, m.path, S.time); return; }
  if (!m.stuck) { m.stuck = true; ap.kpi.stuck = (ap.kpi.stuck || 0) + 1; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'an aircraft'} is stranded: the taxiway ahead is cut.`, m); }
}

function kill(S, ap, m) {
  vacate(ap, m); unclaim(ap, m); unreserve(ap, m);
  if (m.locks) for (const k in m.locks) release(S, ap, k, m, 0);
  if (m.finK) { const L = lockOf(ap, m.finK); if (L.fin === m.id) L.fin = null; }
  for (const k in ap.rl || {}) if (ap.rl[k].gapFor === m.id) ap.rl[k].gapFor = null;
}
function done(ap, m) { ap.kpi.n++; ap.kpi.taxi = ap.kpi.taxi * 0.9 + m.taxiT * 0.1; ap.kpi.wait = ap.kpi.wait * 0.9 + m.waitT * 0.1; }

IC.gops = function (S, dt) {
  S.svcT = (S.svcT || 0) - dt;
  if (S.svcT <= 0) { S.svcT = 20; for (const ap of IC.bases(S)) if (ap.parts && ap.owner === 'us') servicesTick(S, ap); }
  for (const ap of IC.bases(S)) {
    if (!ap.parts || !ap.moves) continue;
    ap.kpi = ap.kpi || { taxi: 0, wait: 0, n: 0, grid: 0, div: 0, hold: 0 };
    ap.depWait = 0;
    if (!ap.moves.length) continue;
    for (const m of ap.moves) {
      if (m.dead) continue;
      if (m.destroyed) { kill(S, ap, m); m.dead = true; m.onDead && m.onDead(m, m.why); continue; }
      step(S, ap, m, dt);
    }
    if (ap.moves.some(m => m.dead)) ap.moves = ap.moves.filter(m => !m.dead);
    // a lock without a live owner does not block anyone
    if (ap.rl) for (const k in ap.rl) {
      const L = ap.rl[k];
      if (L.with) for (const id of L.with) if (!moveOf(ap, id)) L.with.delete(id);
      if (L.by && !moveOf(ap, L.by)) { if (L.with && L.with.size) { const n = L.with.values().next().value; L.with.delete(n); L.by = n; } else L.by = null; }
      if (L.fin && !moveOf(ap, L.fin)) L.fin = null;
      if (L.gapFor && (S.time - L.gapT > 240 || !moveOf(ap, L.gapFor))) L.gapFor = null;
    }
  }
};
function step(S, ap, m, dt) {
  switch (m.phase) {
    case 'start': {
      m.t -= dt;
      if (m.t > 0) return;
      // nose-in stands: a tug pushes the aircraft back (a movement of its own); drive-through stands are left forwards
      if (m.stand && !m.stand.drive) { if (!pushOk(S, ap, m)) { m.waitT += dt; return; } m.phase = 'push'; m.t = 60; m.stand.pushT = S.time + 60; countGround(S, ap, m, 'push'); return; }
      beginTaxi(S, ap, m); return;
    }
    case 'push': {
      m.t -= dt;
      const f = 1 - U.clamp(m.t / 60, 0, 1);
      m.x = U.lerp(m.stand.x, m.stand.fx, f); m.y = U.lerp(m.stand.y, m.stand.fy, f);
      if (m.t <= 0) beginTaxi(S, ap, m);
      return;
    }
    case 'taxi': {
      stepTaxi(S, ap, m, dt);
      if (m.path && m.pi >= m.path.length) {
        finishPath(m);
        if (m.kind === 'dep' && m.via && m.via.length && m.node === m.via[0].node) { m.phase = 'svc'; m.t = m.via[0].t; m.svcIn = 0; return; }
        if (m.kind === 'dep') {
          // at the runway: line up once we hold it
          const k = keyOf(ap, m.plan.rw.id);
          if (!(m.locks && m.locks[k])) { const why = m.readyT > S.time ? 'release' : mayEnter(S, ap, m, k, null); if (why) { if (why !== 'release') wantIt(S, ap, k, m); m.waitT += dt; m.path = []; m.pi = 0; m.phase = 'hold'; m.holding = 'runway'; m.holdWhy = why; return; } take(ap, k, m, null, S.time); }
          lineUp(S, ap, m);
        } else arriveAt(S, ap, m);
      }
      return;
    }
    case 'svc': {
      // on the pad (one aircraft at a time): in, serviced, out again, then on to the runway
      const v = m.via[0], pad = v.part, busy = pad.busy && pad.busy !== m.id && ap.moves.some(x => x.id === pad.busy && !x.dead);
      if (busy) { m.waitT += dt; m.holding = 'queue'; return; }
      if (pad.busy !== m.id) { pad.busy = m.id; countGround(S, ap, m, v.what); }
      m.holding = null;
      m.svcIn += dt; m.t -= dt;
      const door = G(ap).N.get(v.node), k2 = U.clamp(Math.min(m.svcIn, m.t) / 20, 0, 1);
      if (door) { m.x = U.lerp(door.x, pad.x, k2); m.y = U.lerp(door.y, pad.y, k2); if (m.svcIn < 1) m.h = Math.atan2(pad.y - door.y, pad.x - door.x); }
      if (m.t > 0) return;
      pad.busy = null; pad.served = (pad.served || []).filter(t => S.time - t < 86400); pad.served.push(S.time);
      if (door) { m.x = door.x; m.y = door.y; }
      m.via.shift();
      beginTaxi(S, ap, m);
      return;
    }
    case 'hold': {
      if (m.readyT > S.time) { m.waitT += dt; m.holding = 'release'; m.holdWhy = `waiting for its release, ${Math.ceil(m.readyT - S.time)} s`; return; }
      const k = keyOf(ap, m.plan.rw.id), why = mayEnter(S, ap, m, k, null);
      if (why) { wantIt(S, ap, k, m); m.waitT += dt; ap.depWait = (ap.depWait || 0) + 1; m.holding = 'runway'; m.holdWhy = why; return; }
      take(ap, k, m, null, S.time); m.holding = null; m.holdWhy = null; lineUp(S, ap, m); return;
    }
    case 'lineup': {
      m.t -= dt;
      const want = hdgOf(m.plan.rw, m.plan.dir);
      m.h += U.clamp(U.angWrap(want - m.h), -dt * 0.2, dt * 0.2);
      if (m.t <= 0) { m.h = want; if (m.luaw) { m.phase = 'wait'; return; } startRoll(S, ap, m); }
      return;
    }
    case 'wait': {
      // lined up on the runway, waiting for take-off clearance
      const why = takeoffWhy(S, ap, m, keyOf(ap, m.plan.rw.id));
      if (why) { m.waitT += dt; m.holding = 'lined'; m.holdWhy = why; return; }
      m.holding = null; m.holdWhy = null; startRoll(S, ap, m);
      return;
    }
    case 'roll': {
      if (m.delay > 0) { m.delay -= dt; return; }
      const need = m.T.rwy * 0.6, acc = LIFT * LIFT / (2 * need);
      m.spd = Math.min(LIFT * 1.1, m.spd + acc * dt);
      m.rolled += m.spd * dt; m.rwT += dt;
      m.x += Math.cos(m.h) * m.spd * dt; m.y += Math.sin(m.h) * m.spd * dt;
      if (m.rolled >= need) {
        // wake turbulence: the next may go only after the gap
        release(S, ap, keyOf(ap, m.plan.rw.id), m, sepOf(ap, m), ap.st && ap.st.tower && !(ap.st.unseen && ap.st.unseen[m.plan.rw.id]) ? 0 : sepOf(ap, m));
        m.dead = true; kill(S, ap, m);
        done(ap, m); countMove(S, ap, 'dep', m.type, m.plan.rw);
        m.onAir && m.onAir(m);
      }
      return;
    }
    case 'final': {
      const tot = FAF / ARR_V;
      m.t += dt;
      const f = U.clamp(m.t / tot, 0, 1);
      m.x = U.lerp(m.fx, m.tx, f); m.y = U.lerp(m.fy, m.ty, f); m.alt = 0.6 * (1 - f);
      // 1 km out: the runway must be empty, or the arrival goes around
      if (!m.onRw && m.t >= (FAF - GO) / ARR_V && !landCheck(S, ap, m)) return;
      if (f >= 1) {
        m.phase = 'land'; m.spd = TOUCH; m.s0 = m.plan.touch; m.pos = m.plan.touch; m.alt = 0;
        if (m.hitOn) { collide(S, ap, m); return; }
        risky(S, ap, m, 'arr');
      }
      return;
    }
    case 'land': {
      const P = m.plan, dist = Math.abs(P.stop - P.touch), dec = (TOUCH * TOUCH - RWTAXI * RWTAXI) / (2 * Math.max(1, dist));
      m.spd = Math.max(RWTAXI, m.spd - dec * dt);
      m.pos += P.dir * m.spd * dt; m.rwT += dt;
      setRwPos(ap, m);
      if (m.crash) { crashNow(S, ap, m); return; }
      if ((m.pos - P.stop) * P.dir >= 0 || m.spd <= RWTAXI + 1e-3) {
        m.phase = 'rollout'; m.t = 0;
        m.goals = [P.exit.s];
      }
      return;
    }
    case 'rollout': {
      // taxi along the runway to the exit, turning round at the far end if there is no exit ahead
      const goal = m.goals[0];
      const d = goal - m.pos, stp = RWTAXI * dt;
      m.rwT += dt;
      if (m.plan.back && !m.turned) { m.t += dt; if (m.t < 60) return; m.turned = true; if (!m.backLog) { m.backLog = true; ap.kpi.back = (ap.kpi.back || 0) + 1; } }
      if (Math.abs(d) <= stp) {
        m.pos = goal; m.goals.shift();
        if (!m.goals.length) {
          setRwPos(ap, m);
          m.node = m.plan.exit.id;
          countMove(S, ap, 'arr', m.type, m.plan.rw);
          let steps = m.inPath && m.inPath.length && m.inPath[0].from === m.node && m.inPath.every(s => edgeNow(ap, s)) ? m.inPath : null;
          if (!steps) {
            const p = IC.aptSearch(ap, m.node, { to: m.target, avoidRwy: true, res: { m, t0: S.time } });
            if (!p.dist.has(m.target)) { m.stuck = true; m.phase = 'stranded'; ap.kpi.stuck = (ap.kpi.stuck || 0) + 1; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'an arrival'} cannot reach its stand and is blocking the runway.`, m); return; }
            steps = IC.aptSteps(p, m.node, m.target); reserve(S, ap, m, steps, S.time);
          }
          m.path = steps; m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false;
          if (!m.path.length) { release(S, ap, keyOf(ap, m.plan.rw.id), m, sepOf(ap, m), sepOf(ap, m)); arriveAt(S, ap, m); }
          return;
        }
      } else m.pos += Math.sign(d) * stp;
      setRwPos(ap, m, Math.sign(d));
      return;
    }
    case 'stranded': {
      m.t += dt; m.waitT += dt;
      const p = IC.aptSearch(ap, m.plan ? m.plan.exit.id : m.node, { to: m.target, avoidRwy: true });
      if (p.dist.has(m.target)) { m.node = m.plan.exit.id; m.path = IC.aptSteps(p, m.node, m.target); m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false; reserve(S, ap, m, m.path, S.time); return; }
      if (m.t > 1800) { m.dead = true; kill(S, ap, m); ap.kpi.div++; m.onDead && m.onDead(m, 'towed'); }
      return;
    }
    case 'parkin': {
      // a pushback next door blocks the way in for a minute
      if (m.stand && !parkOk(S, ap, m)) { m.waitT += dt; return; }
      m.t -= dt;
      const f = 1 - U.clamp(m.t / 20, 0, 1);
      if (m.stand) { m.x = U.lerp(m.stand.fx, m.stand.x, f); m.y = U.lerp(m.stand.fy, m.stand.y, f); m.h = m.stand.a; }
      if (m.t <= 0) {
        m.dead = true; kill(S, ap, m);
        if (m.kind !== 'tow') done(ap, m);
        m.onPark && m.onPark(m);
      }
      return;
    }
  }
}
/* ground movements besides taxiing to and from the runway: pushbacks, tows, and taxiing to a service (fuel,
   de-icing, a hangar); counted per aircraft (m.gm) and per airport over the last hour */
function countGround(S, ap, m, what) { m.gm = (m.gm || 0) + 1; (m.gmLog = m.gmLog || []).push(what); const L = ap.gmLog = ap.gmLog || []; L.push({ t: S.time, what }); if (L.length > 400) L.splice(0, L.length - 400); }
IC.gopsCountGround = countGround;
/* movements per hour, counted as they happen (the panel compares them with the rated capacity) */
function countMove(S, ap, k, type, rw) { const L = ap.mvLog = ap.mvLog || []; L.push({ t: S.time, k, type, rw: rw && (rw.id || rw) }); while (L.length && S.time - L[0].t > 3600) L.shift(); ap.kpi[k] = (ap.kpi[k] || 0) + 1; IC.emit(S, 'rwMove', { ap, k, type, rw }); }
/* pushbacks block only the stands either side, and only one pushes back from a row at a time */
function standNb(ap, s) { const a = ap.parts.find(p => p.id === s.apron), i = a && a.stands ? a.stands.indexOf(s) : -1; return i < 0 ? [] : [a.stands[i - 1], a.stands[i + 1]].filter(Boolean); }
function pushOk(S, ap, m) { return !standNb(ap, m.stand).some(n => n.pushT > S.time); }
function parkOk(S, ap, m) { return !(m.stand.pushT > S.time) && !standNb(ap, m.stand).some(n => n.pushT > S.time + 30); }
function setRwPos(ap, m, sgn) {
  const rw = m.plan.rw, p = IC.rwAt(rw, U.clamp(m.pos / IC.rwLen(rw), 0, 1)), d = IC.rwDir(rw);
  m.x = p.x; m.y = p.y;
  const s = sgn || m.plan.dir;
  m.h = Math.atan2(d.y * s, d.x * s);
}
function beginTaxi(S, ap, m) {
  // a stop on the way: the fuel stand or the de-icing pad, then the runway
  if (m.via && m.via.length) {
    const v = m.via[0], p = v.node === m.node ? null : IC.aptSearch(ap, m.node, { to: v.node, avoidRwy: true, res: { m, t0: S.time } });
    if (v.node === m.node || (p && p.dist.has(v.node))) {
      m.path = v.node === m.node ? [] : IC.aptSteps(p, m.node, v.node); m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false;
      if (m.path.length) reserve(S, ap, m, m.path, S.time);
      leaveStand(m);
      return;
    }
    m.via.shift();
  }
  const plan = planDeparture(S, ap, m);
  if (!plan) {
    m.phase = 'start'; m.t = 60; m.waitT += 60;
    if (!m.noRouteLog) { m.noRouteLog = true; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'a departure'} has no route to a runway it can use${IC.depBlockWhy(S, ap, m.T)}.`, m); IC.emit(S, 'noRoute', { ap, m }); }
    if (m.waitT > 3600) { m.dead = true; kill(S, ap, m); m.onDead && m.onDead(m, 'cancelled'); }
    return;
  }
  m.plan = plan; m.path = plan.p.steps; m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false;
  reserve(S, ap, m, m.path, S.time);
  leaveStand(m);
}
function leaveStand(m) {
  if (m.stand) { m.stand.occ = null; m.stand.res = null; m.stand = null; }
  if (!m.left) { m.left = true; m.onLeave && m.onLeave(m); }
}
/* why no runway will do, in plain words */
IC.depBlockWhy = function (S, ap, T) {
  const cfg = cfgOf(S, ap), why = runways(ap).map(rw => cfg.rw[rw.id] && IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, T)).filter(Boolean);
  return why.length && why.length === runways(ap).length ? ` (${why[0]})` : '';
};
/* on the runway: cleared for take-off it turns and goes; otherwise it lines up and waits */
function lineUp(S, ap, m) {
  const k = keyOf(ap, m.plan.rw.id);
  // one cleared for take-off goes; one told to line up and wait stops on the runway until the tower clears it
  const why = takeoffWhy(S, ap, m, k);
  m.luaw = m.luawOk ? !!why : why === 'departure ahead' || /^wake/.test(why);
  m.phase = 'lineup'; m.t = m.luaw ? (m.T.mil ? 10 : LINE) : (m.T.mil ? ROLLING / 2 : ROLLING);
  const n = G(ap).N.get(m.plan.start.id);
  if (n) { m.x = n.x; m.y = n.y; }
  if (m.luaw) risky(S, ap, m, 'wait');
}
/* cleared for take-off: the crew take a few seconds (now and then many more) to start the run */
function startRoll(S, ap, m) {
  m.phase = 'roll'; m.h = hdgOf(m.plan.rw, m.plan.dir); m.spd = 0; m.rolled = 0;
  m.delay = m.T.mil ? 1 : U.rand(0, 6) + (Math.random() < 0.15 ? U.rand(6, 18) : 0);
  const L = lockOf(ap, keyOf(ap, m.plan.rw.id)); if (L.gapFor === m.id) L.gapFor = null;
  L.runT = S.time + m.delay; L.runGap = IC.opsRules(ap, m.plan.rw.id).gap * 10;
  risky(S, ap, m, 'dep');
}
/* 1 km out: take the runway if it is empty; if not, go around (or, where the tower lost track of an aircraft
   waiting on the runway in the dark, land on top of it) */
function landCheck(S, ap, m) {
  const k = m.finK, L = lockOf(ap, k);
  const ids = L.by ? [L.by].concat(L.with ? [...L.with] : []).filter(id => id !== m.id) : [];
  const on = ids.map(id => moveOf(ap, id)).filter(Boolean);
  if (on.length) {
    const lost = on.find(o => o.forgot && o.phase === 'wait');
    if (!lost) { goAround(S, ap, m, on[0]); return false; }
    m.hitOn = lost;
  }
  take(ap, k, m, null, S.time); m.onRw = true; L.gapOk = true;
  if (L.fin === m.id) L.fin = null;
  return true;
}
/* the arrival climbs away, flies a circuit and joins the approach again */
function goAround(S, ap, m, o) {
  const L = lockOf(ap, m.finK);
  if (L.fin === m.id) L.fin = null;
  L.nextA = Math.max(L.nextA || 0, S.time + 30);
  ap.kpi.ga = (ap.kpi.ga || 0) + 1;
  const G2 = ap.gaLog = ap.gaLog || []; G2.push(S.time); while (G2.length && S.time - G2[0] > 3600) G2.shift();
  const why = !o ? 'the runway was not clear' : o.kind === 'arr' ? `${o.who || 'the aircraft ahead'} was still on the runway` : o.xing ? `${o.who || 'an aircraft'} was crossing it` : o.phase === 'roll' ? `${o.who || 'a departure'} was still on its take-off run` : `${o.who || 'a departure'} was still lined up on it`;
  if (IC.radioGoAround) IC.radioGoAround(S, ap, m, o, why);
  IC.emit(S, 'goAround', { ap, m, other: o, why });
  // climbing away close behind a departure: the tighter the gap, the likelier the two come too close
  const r = IC.gopsRisk(S, ap, m, 'ga');
  if (r.p && Math.random() < r.p) lostSep(S, ap, m, o, r.why[0]);
  m.dead = true; kill(S, ap, m);
  if (m.onGoAround) m.onGoAround(m, why);
}
function arriveAt(S, ap, m) {
  if (m.stand) { m.phase = 'parkin'; m.t = 20; return; }
  m.dead = true; kill(S, ap, m);
  if (m.kind !== 'tow') done(ap, m);
  m.onPark && m.onPark(m);
}

/* ---------- services: what happens to an airliner on the ground between landing and take-off ---------- */
/* frost on clear and foggy mornings: departures are de-iced, on a pad if there is one, else at the stand */
IC.aptFrost = S => { const h = ((S.time % 86400) + 86400) % 86400 / 3600, k = S.weather && S.weather.kind; return h >= 4 && h < 8.5 && (k === 'clear' || k === 'fog'); };
const padOf = (ap, kind, from) => {
  const G0 = G(ap), a = G0.N.get(from); let best = null, bd = 1e9;
  for (const p of ap.parts) if (p.kind === kind && p.built && p.hp > p.max * 0.25 && p.linked !== false && G0.N.has(p.id + ':d')) { const d = a ? U.dist(a, p) : 0; if (d < bd) { bd = d; best = p; } }
  return best;
};
/* the stops a departure makes on its way to the runway: fuel (where the trucks could not come, or for small
   aircraft that always self-serve) and de-icing */
function serviceStops(S, ap, m) {
  const via = [], T = m.T;
  const fuelPad = padOf(ap, 'fuelpad', m.node);
  if (fuelPad && (ap.padNext === S.time || T.rwy <= 13)) via.push({ node: fuelPad.id + ':d', part: fuelPad, what: 'fuel', t: 180 + (T.fuel || 1) * 25 });
  if (IC.aptFrost(S)) {
    const pad = padOf(ap, 'deice', m.node);
    if (pad) via.push({ node: pad.id + ':d', part: pad, what: 'de-icing', t: 240 + T.span * 400 });
    else { m.t += 480 + T.span * 800; (m.gmLog = m.gmLog || []).push('de-iced at the stand'); }
  }
  return via;
}
/* what serves an aircraft on its stand: a jet bridge or passengers walking at a gate, buses at a remote stand,
   lorries at a cargo stand; a fuel truck or the hydrant. The drawing follows these (render-airport.js). */
IC.standService = function (S, ap, s, tl) {
  const st = ap.st || {}, T = tl.T;
  const kind = T.cargo ? 'cargo' : s.contact ? (IC.aptTechOk(S, 'bridge') ? 'bridge' : 'walk') : 'bus';
  return { t0: S.time, dur: tl.t, kind, n: kind === 'bus' ? Math.max(1, Math.ceil((T.seats || 0) / 80)) : kind === 'cargo' ? Math.max(2, Math.round((T.cargo || 40) / 25)) : 0,
    fuel: s.hyd && st.hydrant ? 'hydrant' : 'truck', tail: tl.id };
};
IC.on((S, type, d) => {
  if (type !== 'tailParked' || !d.ap || !d.ap.parts) return;
  const tl = d.tl, ap = d.ap, s = IC.aptStands(ap).find(x => x.id === tl.stand);
  if (!s) return;
  s.svc = IC.standService(S, ap, s, tl);
  // passengers walking out to the aircraft board slower than through a jet bridge
  if (s.svc.kind === 'walk') { tl.t *= 1.08; s.svc.dur = tl.t; }
  // every dozen or so landings an aircraft is due in the hangar for maintenance, where there is room
  tl.legs = (tl.legs || 0) + 1;
  tl.mxDue = tl.mxDue || U.randi(10, 16);
  if (tl.legs >= tl.mxDue && !tl.mx) { const h = hangarFor(ap); if (h) tl.mx = { ap: ap.id, h: h.id, at: S.time + 1200 }; }
});
/* a hangar with room for one more */
function hangarFor(ap) { return ap.parts.find(p => p.kind === 'hangar' && p.built && p.hp > p.max * 0.25 && p.linked !== false && (p.inside || []).length + (p.coming || 0) < IC.APART.hangar.holds); }
IC.aptHangarFor = hangarFor;
/* a tug tows an aircraft from one node to another (to a stand: it parks there) */
function tow(S, ap, tl, from, to, stand, onPark) {
  const al = IC.avAirline && IC.avAirline(S, tl.al);
  const m = newMove(S, ap, { kind: 'tow', type: tl.type, node: from, who: `${tl.cs} (tow)`, tail: tl, livery: al && al.livery, stand, spdK: 0.5, onPark, onDead: () => IC.emit(S, 'tailLost', { ap, tail: tl.id, why: 'destroyed under tow' }) });
  const n = G(ap).N.get(from); if (n) { m.x = n.x; m.y = n.y; }
  const p = IC.aptSearch(ap, from, { to, avoidRwy: true, res: { m, t0: S.time } });
  if (!p.dist.has(to)) { ap.moves = ap.moves.filter(x => x !== m); return null; }
  m.path = IC.aptSteps(p, from, to); m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false; m.target = to;
  reserve(S, ap, m, m.path, S.time);
  countGround(S, ap, m, 'tow');
  return m;
}
function tailOf(S, id) { return S.av && S.av.tails.find(t => t.id === id); }
function servicesTick(S, ap) {
  if (!S.av) return;
  // due for maintenance and turned round: towed from the stand to the hangar
  for (const tl of S.av.tails) {
    if (!tl.mx || tl.mx.ap !== ap.id || tl.where !== 'stand' || S.time < tl.mx.at) continue;
    const h = ap.parts.find(p => p.id === tl.mx.h), s = IC.aptStands(ap).find(x => x.id === tl.stand);
    if (!h || !s || !h.built || h.hp <= h.max * 0.25 || (h.inside || []).length >= IC.APART.hangar.holds) { tl.mx = null; continue; }
    h.coming = (h.coming || 0) + 1;
    const m = tow(S, ap, tl, s.id, h.id + ':d', null, () => {
      h.coming = Math.max(0, (h.coming || 1) - 1);
      (h.inside = h.inside || []).push({ tl: tl.id, until: S.time + U.rand(1, 2.5) * 86400, why: 'maintenance' });
      tl.where = 'hangar'; tl.at = ap.id;
      IC.emit(S, 'hangarIn', { ap, tl, h });
    });
    if (!m) { h.coming--; tl.mx.at = S.time + 3600; continue; }
    s.occ = null; tl.stand = null; tl.where = 'tow'; tl.mv = m; tl.mx = null; tl.legs = 0; tl.mxDue = null;
  }
  // maintenance done: towed out to a free stand, then back to flying
  for (const h of ap.parts) {
    if (h.kind !== 'hangar' || !(h.inside || []).length) continue;
    for (const x of h.inside.slice()) {
      const tl = tailOf(S, x.tl);
      if (!tl || tl.where === 'lost') { h.inside = h.inside.filter(y => y !== x); continue; }
      if (S.time < x.until || x.out) continue;
      const s = IC.avFreeStand && IC.avFreeStand(S, ap, tl.T);
      if (!s) continue;
      s.occ = tl.id;
      const m = tow(S, ap, tl, h.id + ':d', s.id, s, () => { tl.where = 'stand'; tl.stand = s.id; tl.at = ap.id; tl.mv = null; tl.t = 1800; });
      if (!m) { s.occ = null; continue; }
      x.out = true; h.inside = h.inside.filter(y => y !== x);
      tl.where = 'tow'; tl.mv = m;
    }
  }
}
IC.gopsServicesTick = servicesTick;
/* what a building is doing right now, with numbers, for its panel */
IC.partNow = function (S, ap, p) {
  const st = ap.st || {}, tails = S.av ? S.av.tails.filter(t => t.at === ap.id) : [], stands = IC.aptStands(ap);
  const onStand = tails.filter(t => t.where === 'stand');
  const svcNow = k => stands.filter(s => s.occ && s.svc && s.svc.kind === k && onStand.some(t => t.id === s.occ && t.t > 0)).length;
  const hourN = x => (x || []).filter(t => S.time - t < 3600).length;
  if (!p.built) return '';
  if (p.kind === 'fuel') {
    const wait = onStand.filter(t => t.held && (t.held.k === 'fuel' || t.held.k === 'truck')), avg = wait.length ? wait.reduce((a, t) => a + S.time - t.held.t0, 0) / wait.length : 0;
    return `${p.r ? 'Fuel tank' : `Fuel farm: ${IC.fuelTanks(p)} tanks`}, ${Math.round(p.stock || 0)} of ${IC.fuelCap(p)} (${U.pct((p.stock || 0) / IC.fuelCap(p))} full). ${IC.aptServiceLines(S, ap).fuel}${wait.length ? ` ${wait.length} aircraft waiting now, ${U.dur(avg)} on average.` : ''}`;
  }
  if (p.kind === 'helipad') { const on = IC.gavOn(S, ap, p.id); return `Helipad: ${on || 'free. A helicopter lands here instead of on the runway.'}`; }
  if (p.kind === 'gaterm') { const g = IC.gavSummary(S, ap); return `General aviation terminal: ${g.visitors} visiting aircraft now, ${g.moves} light-aircraft movements in the last day. Business jets come to airports with one, and each visitor pays ${U.money(IC.GAV.handling)} for handling.`; }
  if (p.kind === 'fuelpad') return `Fuel stand: ${hourN(p.served)} aircraft refuelled in the last hour${p.busy ? '; one refuelling now' : ''}.`;
  if (p.kind === 'deice') return IC.aptFrost(S) ? `Frost this morning: departures stop here to be de-iced (${hourN(p.served)} in the last hour).` : `No frost now. On clear and foggy mornings departures stop here to be de-iced; without a pad it is done at the stand and takes longer.`;
  if (p.kind === 'hangar') {
    const x = (p.inside || []).map(y => { const t = tails.find(q => q.id === y.tl) || (S.av && S.av.tails.find(q => q.id === y.tl)); return t ? `${t.cs} (${t.T.short}, maintenance, ${U.dur(Math.max(0, y.until - S.time))} left)` : null; }).filter(Boolean);
    return `Hangar: ${x.length} of ${IC.APART.hangar.holds} places in use${x.length ? ': ' + x.join('; ') : ''}${p.coming ? `; ${p.coming} on the way in` : ''}.`;
  }
  if (p.kind === 'terminal') {
    const gates = stands.filter(s => s.contact && s.linked !== false).length, remote = stands.filter(s => !s.contact && !s.cargo && s.zone === 'civil' && s.linked !== false).length;
    const load = st.pax ? (ap.paxRate || 0) / st.pax : 0;
    return `Terminal: ${Math.round(ap.paxRate || 0).toLocaleString('en-US')} of ${Math.round(st.pax || 0).toLocaleString('en-US')} passengers an hour (${U.pct(load)} full${load > 0.8 ? ': boarding slows down' : ''}). ${gates} gate${gates === 1 ? '' : 's'} ${IC.aptTechOk(S, 'bridge') ? 'with jet bridges' : '(passengers walk out: jet bridges need research)'}, ${remote} remote stands. Now: ${svcNow('bridge') + svcNow('walk')} aircraft at gates, ${svcNow('bus')} served by bus.`;
  }
  if (p.kind === 'cargo') { const n = svcNow('cargo'); return `Cargo shed: ${n} freighter${n === 1 ? '' : 's'} loading now${n ? `, ${stands.filter(s => s.occ && s.svc && s.svc.kind === 'cargo').reduce((a, s) => a + s.svc.n, 0)} lorries on the apron` : ''}; handles ${Math.round(st.cargo || 0)} t an hour.`; }
  if (p.kind === 'tower') { const g = (ap.gmLog || []).filter(x => S.time - x.t < 3600).length; const tw = IC.aptServiceLines(S, ap).tower; return `Tower: ${tw[0].toLowerCase() + tw.slice(1)} On the ground: ${g} pushback${g === 1 ? '' : 's'}, tows and service stops.`; }
  if (p.kind === 'fire') { const R = ap.fireRun, out = R && R.from === p.id && S.time < R.home; return `Fire station: ${out ? `the trucks are out on ${R.kind === 'drill' ? 'a drill' : 'a call'}${S.time < R.t0 + R.dur ? `, ${IC.mmss(S.time - R.t0)} so far` : `, there in ${IC.mmss(R.dur)}`}. ` : ''}${((f) => out ? f : f[0].toLowerCase() + f.slice(1))(IC.aptServiceLines(S, ap).fire)}`; }
  if (p.kind === 'apron') { const L = p.stands || []; return `Apron: ${L.filter(s => s.occ).length} of ${L.length} stands in use.`; }
  return '';
};

/* ---------- crashes and incidents: rare, and always with a cause ---------- */
/* the chance that this landing or take-off ends in an accident, and why. Zero in normal operations. */
IC.gopsRisk = function (S, ap, m, what) {
  const T = m.T, P = m.plan, out = [];
  if (!P || !P.rw || T.vtol) return { p: 0, why: out };
  const sum = () => ({ p: out.reduce((s, x) => s + x.p, 0), why: out });
  const R = IC.opsRules(ap, P.rw.id);
  if (what === 'wait') {
    // lined up and waiting on the runway in the dark or in fog, with no ground radar: the tower can lose track of it
    // and clear an arrival to land on top of it
    if (IC.opsDark(S) && !(ap.st && ap.st.gradar) && !m.mil) out.push({ cause: 'collision', p: IC.LUAW_RISK, text: `${m.who || 'a departure'} was lined up and waiting on the runway in ${IC.needILS(S) ? 'fog' : 'the dark'}; with no ground radar the tower lost track of it and cleared an arrival to land`, rule: `line up and wait for ${kindName(m)} at night and in fog, with no ground radar` });
    return sum();
  }
  if (what === 'ga') {
    // a go-around climbs out behind the departure that was on the runway: the tighter the gap, the closer they are
    out.push({ cause: 'sep', p: ({ 4: 0.03, 6: 0.012, 8: 0.004, 10: 0.002 })[R.gap] || 0.004, text: `it went around behind a departure with only a ${R.gap} km arrival gap`, rule: `a ${R.gap} km arrival gap` });
    return sum();
  }
  const w = IC.windOn(S, hdgOf(P.rw, P.dir)), k = what === 'arr' ? 1 : 0.5;
  // gusts beyond what the crew are allowed to land in (well beyond, and they go round and try elsewhere)
  if (w.gCross > T.xw) out.push({ cause: 'gust', p: 0.0008 * Math.min(6, w.gCross - T.xw) * k, text: `a gust of ${Math.round(w.gCross)} kt across the runway, beyond the ${T.xw} kt the crew may land in` });
  if (-w.gHead > T.tw) out.push({ cause: 'tailwind', p: 0.0006 * Math.min(6, -w.gHead - T.tw) * k, text: `a tailwind gust of ${Math.round(-w.gHead)} kt` });
  // a wet runway and a tailwind lengthen the landing roll; a runway only just long enough runs out
  if (what === 'arr') {
    const sky = IC.sky(S), need = T.rwy * (sky.wet ? 1.15 : 1) * (1 + Math.max(0, -w.head) * 0.02);
    const strip = P.strip || [0, IC.rwLen(P.rw)], avail = strip[1] - strip[0];
    if (avail < need) out.push({ cause: 'overrun', p: Math.min(0.05, 0.25 * (1 - avail / need)), text: `${sky.wet ? 'a wet runway' : 'a tailwind'} and only ${U.km(avail)} of runway where ${U.km(need)} was needed` });
  }
  // birds gather over water near the runway
  // (a bird-control team, deck.js, keeps three in four away)
  if (ap.water && ap.water.near) out.push({ cause: 'bird', p: ap.birdCtl ? 0.000075 : 0.0003, text: `birds from the ${ap.water.what} ${U.km(ap.water.d)} from the runway` });
  return sum();
};
IC.LUAW_RISK = 0.004;
const kindName = m => (IC.OPS_KINDS.find(k => k[0] === IC.opsKind(m.type, m.T)) || ['', 'aircraft'])[1].toLowerCase();
function risky(S, ap, m, what) {
  const r = IC.gopsRisk(S, ap, m, what);
  ap.kpi.risk = (ap.kpi.risk || 0) + r.p;
  if (!r.p || Math.random() >= r.p) return false;
  const c = U.wpick(r.why.map(x => [x, x.p]));
  if (what === 'wait') { m.forgot = c; return false; }
  // a bird strike is usually survived: the crew stop or come back round
  if (c.cause === 'bird' && Math.random() < 0.75) { IC.log(S, 'warn', 'AIRPORT', `${ap.name}: ${m.who || 'an aircraft'} hit birds ${what === 'arr' ? 'on landing' : 'on take-off'}. It came back safely with a damaged engine. The cause: ${c.text}.`, m); ap.kpi.inc = (ap.kpi.inc || 0) + 1; return false; }
  m.crash = c;
  if (what === 'dep') { crashNow(S, ap, m); return true; }
  return false;
}
/* an aircraft straying onto a runway in use: only at night or in poor visibility, where there is no ground radar */
IC.INCURSION = 0.004;
function incursion(S, ap, m, k) {
  const st = ap.st || {};
  if (st.gradar || m.mil || !st.complex) return;
  if (!(IC.needILS(S) || dark(S))) return;
  // crossings allowed close ahead of arrivals make it likelier (a crew in a hurry, a tower stretched)
  const R = IC.opsRules(ap, ruleRw(ap, m, k)), f = U.clamp(8 / R.gap, 0.8, 2) * (R.cross === 'radar' ? 0.5 : 1);
  if (Math.random() >= IC.INCURSION * f) return;
  const L = lockOf(ap, k), other = ap.moves.find(x => x.id === L.by);
  ap.kpi.inc = (ap.kpi.inc || 0) + 1;
  if (!other || (other.phase !== 'land' && other.phase !== 'roll')) {
    IC.log(S, 'warn', 'AIRPORT', `${ap.name}: ${m.who || 'an aircraft'} crossed the hold-short line without clearance. Nobody was hurt. A ground radar would have warned the tower.`, m);
    return;
  }
  const c = { cause: 'incursion', text: `${m.who || 'a taxiing aircraft'} strayed onto the runway in ${IC.needILS(S) ? 'fog' : 'the dark'}, and the tower had no ground radar to see it`, rule: `crossings with the next arrival ${R.gap} km out${R.cross === 'radar' ? '' : ', even at night with no ground radar'}` };
  other.crash = c;
  if (other.phase === 'roll') crashNow(S, ap, other);
  m.destroyed = true; m.why = 'destroyed in a runway collision';
}
/* fire and rescue: seconds until the first truck reaches a point */
/* a crash tender's time from its station to a point: a minute to turn out, then 100 km/h across the airfield */
IC.fireTime = (f, p) => 60 + U.dist(f, p) / 0.28;
IC.aptRescue = function (ap, p) {
  let best = 1e9;
  for (const f of ap.parts) if (f.kind === 'fire' && f.built && f.hp > f.max * 0.25) best = Math.min(best, IC.fireTime(f, p));
  return best;
};
/* the arrival lands on a departure the tower forgot on the runway */
function collide(S, ap, m) {
  const o = m.hitOn, c = Object.assign({}, o.forgot, { cause: 'collision', text: `${o.forgot.text}. ${m.who || 'The arrival'} landed into ${o.who || 'it'}` });
  if (!o.dead) { o.destroyed = true; o.why = 'destroyed in a runway collision'; }
  m.crash = c; crashNow(S, ap, m);
}
/* a go-around that came too close to the departure climbing out ahead: an incident, reported with its cause */
function lostSep(S, ap, m, o, c) {
  ap.kpi.inc = (ap.kpi.inc || 0) + 1; ap.kpi.lossSep = (ap.kpi.lossSep || 0) + 1;
  IC.log(S, 'warn', 'AIRPORT', `${ap.name}: ${m.who || 'an arrival'} went around and came within 300 m of ${o && o.who ? o.who : 'the departure'} climbing out ahead. The cause: ${c.text}. A longer gap in the Operations tab leaves more room.`, m);
  IC.emit(S, 'lossSep', { ap, m, other: o });
}
function crashNow(S, ap, m) {
  const c = m.crash, T = m.T, rw = m.plan.rw;
  const on = T.mil ? (T.crew || 1) * (m.n || 1) : Math.round((T.seats || 2) * 0.82) + (T.seats ? 6 : 3);
  const rescue = IC.aptRescue(ap, m);
  IC.fireRun(S, ap, m, 'crash');
  const base = { overrun: 0.08, gust: 0.25, tailwind: 0.2, incursion: 0.45, bird: 0.35, collision: 0.6 }[c.cause] || 0.3;
  // survival depends on how fast the fire trucks arrive: three minutes is the standard
  const late = rescue >= 1e8 ? 3 : U.clamp(rescue / 180, 0.6, 3);
  const dead = Math.min(on, Math.round(on * U.clamp(base * late * U.rand(0.6, 1.4), 0, 1)));
  // the wreck closes the runway where it lies until engineers clear it
  const t = U.clamp(IC.rwT(rw, m), 0, 1);
  rw.craters.push({ t, r: 0.9, id: IC.nid('cr'), wreck: true });
  ap.dirty = true;
  IC.addFire(S, m.x, m.y, 0.9, 3600);
  S.wrecks.push({ x: m.x, y: m.y, type: T.mil ? 'aircraft' : 'airliner', t: S.time, h: m.h });
  ap.kpi.crash = (ap.kpi.crash || 0) + 1;
  S.stats.crashes = (S.stats.crashes || 0) + 1;
  const what = `${m.who || 'An aircraft'}, a ${T.name.toLowerCase()}`;
  const phase = m.kind === 'arr' ? 'landing' : 'taking off';
  const resc = rescue >= 1e8 ? 'No fire station covers the runway: the town brigade took a quarter of an hour.' : rescue > 180 ? `Fire trucks took ${U.dur(rescue)} to arrive, longer than the three minutes that saves lives.` : `Fire trucks were there in ${U.dur(rescue)}.`;
  IC.log(S, 'leak', 'CRASH', `${ap.name}: ${what}, crashed ${phase} on ${IC.rwEnd(rw, m.plan.dir)}. ${dead} of ${on} on board killed. The runway is closed.`, m);
  IC.news(S, `${dead ? `${dead} killed as` : 'No deaths as'} ${m.who || 'an aircraft'} crashes ${phase} at ${ap.name}.`);
  IC.sfx && IC.sfx.klaxon && IC.sfx.klaxon();
  const text = `${what}, crashed ${phase} on runway ${IC.rwEnd(rw, m.plan.dir)} at ${ap.name}. ${dead} of the ${on} people on board died. The cause: ${c.text}.${c.rule ? ` The tower's rule that allowed it: ${c.rule}.` : ''} ${resc}`;
  const fix = { gust: 'A runway pointing into the wind (a crosswind runway) would have kept it inside its limits.', tailwind: 'A runway pointing into the wind would have avoided the tailwind.', overrun: 'A longer runway, or one without craters, leaves a margin when it is wet.', incursion: 'A ground radar shows the tower every aircraft on the ground, day and night.', bird: 'Airports away from lakes and rivers see far fewer birds.', collision: 'A ground radar shows the tower every aircraft on the runway; without one, keep departures at the hold-short line after dark (Operations tab).' }[c.cause] || '';
  if (S.camp) {
    IC.later(S, 1800, 'gopsReport', S, ap, `${text} ${fix}`);
  }
  // on top of the loss of the aircraft itself (the Minister already counts that): the deaths and the headlines
  if (S.story) S.story.standing = U.clamp(S.story.standing - Math.min(15, 2 + dead / 20), 0, 100);
  IC.emit(S, 'crash', { ap, m, cause: c.cause, dead, on, rescue });
  m.destroyed = true; m.why = `crashed ${phase}`;
  // the aircraft is gone: tell its owner now, not as an ordinary loss
  kill(S, ap, m); m.dead = true;
  m.onDead && m.onDead(m, `crashed ${phase}`);
}

/* ---------- military flights through ground ops ---------- */
const STARTUP = { alert: 90, has: 300, hangar: 420, stand: 240 };
IC.milStartNode = function (S, b, r) {
  if (!b.parts) return null;
  const T = IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]];
  if (T.vtol) return null;
  const pp = IC.parkPos(S, b, r);
  if (pp.fac) return { node: pp.fac.id + ':d', door: pp.fac.door, startT: STARTUP[pp.fac.kind] || 300, where: pp.fac.kind };
  if (pp.stand) return { node: pp.stand.id, stand: pp.stand, startT: STARTUP.stand, where: 'stand' };
  // parked on grass by the runway: towed onto the nearest taxiway first
  const g = G(b); let best = null, bd = 1e9;
  for (const [id, n] of g.N) { if (!g.adj.get(id).length) continue; const d = U.dxy(n.x, n.y, b.x, b.y); if (d < bd) { bd = d; best = id; } }
  return best ? { node: best, startT: 600, where: 'open' } : null;
};
IC.milLaunchBlock = function (S, b, r) {
  const sn = IC.milStartNode(S, b, r);
  if (!sn) return '';
  const type = IC.AIRKIND_TYPE[r.kind];
  if (!IC.gopsCanDepart(S, b, type, sn.node)) return 'No taxi route to a usable runway' + IC.depBlockWhy(S, b, IC.ACTYPES[type]);
  return '';
};
IC.H.gopsReport = (S, ap, text) => () => { if (S.camp) IC.card(S, 'Accident report', `${ap.name} · ${U.clock(S.time, S)}`, text, 'alarm'); };
IC.H.milAirborne = (S, a) => mm => { a.gnd = false; a.x = mm.x; a.y = mm.y; a.h = mm.h; a.ground = null; a.tookOffT = S.time; IC.emit(S, 'airborne', a); };
IC.H.milParked = (S, a, b) => () => { a.gnd = false; a.faf = null; IC.airLand(S, a, b); };
IC.H.milGoAround = (S, a) => mm => { a.gnd = false; a.ground = null; a.x = mm.x; a.y = mm.y; a.h = mm.h; a.faf = null; a.nextTry = S.time + 90; };
IC.H.milTaxiLost = a => () => { if (!a.dead) { a.dead = true; if (a.r) { a.r.st = 'lost'; a.r.ent = null; } } };
/* returns true when the aircraft has been handed to ground ops (it appears in the air when it lifts off) */
IC.milDepart = function (S, b, a) {
  const r = a.r, sn = IC.milStartNode(S, b, r);
  if (!sn) return false;
  const type = IC.AIRKIND_TYPE[r.kind];
  const m = IC.gopsDepart(S, b, { type, node: sn.node, door: sn.door, stand: sn.stand ? Object.assign({}, sn.stand, { contact: false, drive: true }) : null, startT: IC.alertStartT ? IC.alertStartT(r, sn.startT) : sn.startT, mil: true, scramble: IC.alertOf ? IC.alertOf(r) < 30 : !!r.qra, who: r.name, flight: a, n: a.n,
    onAir: IC.hfn('milAirborne', S, a), onDead: IC.hfn('milTaxiLost', a) });
  if (!m) return false;
  a.gnd = true; a.ground = m;
  a.x = m.x; a.y = m.y;
  return true;
};
/* an aircraft coming home: fly to the approach fix, ask for the runway, then land and taxi to its shelter */
IC.milApproach = function (S, b, a, dt) {
  if (!b.parts || a.gnd) return false;
  const type = IC.AIRKIND_TYPE[a.kind], T = IC.ACTYPES[type];
  if (T.vtol) return false;
  // keep the same approach fix while it still serves, so the aircraft does not chase a moving point
  if (!a.faf || a.fafBase !== b.id || S.time - a.fafT > 600) { a.faf = IC.gopsFaf(S, b, type, a); a.fafBase = b.id; a.fafT = S.time; }
  const faf = a.faf;
  if (!faf) return 'divert';
  const d = U.dxy(a.x, a.y, faf.x, faf.y);
  if (d > 12) return { x: faf.x, y: faf.y };
  const r = a.r;
  const holdPt = { x: faf.x + Math.cos(S.time * 0.02) * 12, y: faf.y + Math.sin(S.time * 0.02) * 12, hold: true };
  if (S.time < (a.nextTry || 0)) { a.holdT = (a.holdT || 0) + dt; return holdPt; }
  a.nextTry = S.time + 5;
  IC.assignSlots(S, b);
  const sn = IC.milStartNode(S, b, r) || {};
  if (!sn.node) return 'divert';
  const m = IC.gopsLand(S, b, { type, target: sn.node, stand: null, mil: true, who: a.name, flight: a, n: a.hp, faf,
    onPark: IC.hfn('milParked', S, a, b), onGoAround: IC.hfn('milGoAround', S, a), onDead: IC.hfn('milTaxiLost', a) });
  if (m === 'divert') { a.faf = null; return 'divert'; }
  if (m === 'hold') { a.holdT = (a.holdT || 0) + dt; return holdPt; }
  a.gnd = true; a.ground = m;
  return true;
};

})(window.IC);
