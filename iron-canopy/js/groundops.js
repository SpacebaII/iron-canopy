/* Iron Canopy — ground operations. Every aircraft that uses one of our airports taxis along the network the player
   built: pushback, taxi, hold short, line up, take-off roll; approach, landing roll, exit, taxi in, park.
   The wind picks a runway configuration: which runways are in use, which way, for arrivals, departures or both.
   Runways that depend on each other (crossing, or parallel and closer than 760 m) are cleared as one.
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
  if (old && old.ver === g.ver && S.time - old.t < 900 && Math.abs(W.kt - old.kt) < 5 && Math.abs(U.angWrap(W.dir - old.dir)) < 0.35 && old.ils === IC.needILS(S) && old.mode === (ap.rwMode || 'auto')) return old;
  const imc = IC.needILS(S), rws = runways(ap).filter(rw => IC.rwUsable(rw) >= 6);
  const cfg = { ver: g.ver, t: S.time, kt: W.kt, dir: W.dir, ils: imc, mode: ap.rwMode || 'auto', rw: {}, arr: [], dep: [], name: '', text: '' };
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

/* ---------- runway locks: one per group of runways that depend on each other ---------- */
const keyOf = (ap, rwId) => G(ap).grp[rwId] || rwId;
const lockOf = (ap, k) => (ap.rl = ap.rl || {})[k] || (ap.rl[k] = { by: null, next: 0 });
/* who goes first when several want the same runways: scrambles, then arrivals (military first), then departures */
const prioOf = m => m.scramble ? 4 : m.kind === 'arr' ? (m.mil ? 3 : 2) : m.mil ? 1 : 0;
/* cross: the hold line an aircraft crossing the runway waits at. Aircraft at the same line cross together, and a
   crossing needs no wake-turbulence gap (the next take-off or landing still waits for it). */
function canTake(S, ap, k, m, cross) {
  const L = lockOf(ap, k);
  if (L.by === m.id || (L.with && L.with.has(m.id))) return true;
  if (L.by) return !!(cross && L.cross === cross && S.time < L.xT);
  if (!cross && S.time < L.next) return false;
  if (ap.closedT && S.time < ap.closedT && !m.mil) return false;
  // someone more urgent is waiting for these runways, unless we have waited a long time
  const w = ap.want && ap.want[k];
  if (w && S.time - w.t < 8 && w.p > prioOf(m) && (m.waitT || 0) < 300) return false;
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
const sepOf = (ap, m) => IC.aptSep(ap.st || {}) * (m.kind === 'arr' ? 0.5 : 1);
function release(S, ap, k, m, sep) {
  const L = lockOf(ap, k);
  if (L.with && L.with.has(m.id)) L.with.delete(m.id);
  else if (L.by === m.id) {
    if (L.with && L.with.size) { const n = L.with.values().next().value; L.with.delete(n); L.by = n; }
    else { L.by = null; L.cross = null; }
    L.next = Math.max(L.next, S.time + (sep || 0));
  }
  if (m.locks) delete m.locks[k];
}
IC.rwBusy = (S, ap, rwId) => { const L = lockOf(ap, keyOf(ap, rwId)); return !!L.by || S.time < L.next; };

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
function edgeNow(ap, st) { const L = G(ap).adj.get(st.from); if (!L) return null; for (const e of L) if (e.to === st.to && e.kind === st.e.kind) return e; return null; }
/* entering this edge puts the aircraft on (or across) a runway */
function rwNeed(ap, st, e) { if (e.kind === 'rwy') return e.part; const n = G(ap).N.get(st.to); return n ? n.rw : null; }

/* ---------- moves ---------- */
function newMove(S, ap, o) {
  const m = Object.assign({ id: IC.nid('mv'), ap: ap.id, phase: 'start', t: 0, x: ap.x, y: ap.y, h: ap.rwyA || 0, spd: 0, path: null, pi: 0, s: 0, waitT: 0, taxiT: 0, blockT: 0, rwT: 0, born: S.time }, o);
  m.T = IC.ACTYPES[m.type];
  ap.moves.push(m);
  return m;
}
function place(ap, m) {
  const st = m.path && m.path[m.pi];
  if (!st) { const n = G(ap).N.get(m.node); if (n) { m.x = n.x; m.y = n.y; } return; }
  const A = G(ap).N.get(st.from), B = G(ap).N.get(st.to); if (!A || !B) return;
  const L = st.e.len || U.dist(A, B), f = U.clamp(m.s / L, 0, 1);
  m.x = A.x + (B.x - A.x) * f; m.y = A.y + (B.y - A.y) * f;
  if (L > 0.01) m.h = Math.atan2(B.y - A.y, B.x - A.x);
}
function finishPath(m) { m.path = null; m.pi = 0; m.s = 0; }

/* ---------- departures ---------- */
/* the best runway entry for this aircraft: into the wind, on a departure runway, with enough runway ahead */
function planDeparture(S, ap, m, dry) {
  const g = G(ap), cfg = cfgOf(S, ap), T = m.T;
  const tree = dry ? IC.aptTree(ap, m.node) : IC.aptSearch(ap, m.node, { res: { m, t0: S.time + (m.t > 0 ? m.t : 0) } });
  let best = null;
  for (const rw of runways(ap)) {
    const c = cfg.rw[rw.id]; if (!c) continue;
    const L = IC.rwLen(rw), dir = c.dir, need = T.rwy * 1.05 + 1;
    if (IC.rwUsable(rw) < T.rwy || IC.rwWindBlock(S, rw, dir, T)) continue;
    // departures belong on departure runways; an arrival runway is used only when nothing else fits;
    // and they spread over the departure runways by the queue each already has
    const role = (c.role === 'dep' || c.role === 'mixed' ? 0 : c.role === 'arr' ? 3000 : 5000) + depQueue(ap, keyOf(ap, rw.id)) * 120;
    // any point on the runway will do as a start, even one reached by backtracking along it from a taxiway
    for (const n of g.rwn.get(rw.id) || []) {
      const room = dir > 0 ? L - n.s : n.s;
      if (room < need || !clearRun(rw, n.s, n.s + dir * need)) continue;
      const cost = n.id === m.node ? 0 : tree.dist.get(n.id);
      if (cost == null) continue;
      // the tower balances the departure runways: a longer taxi is worth it to skip a queue
      const total = cost * 0.5 + role + (room < L * 0.6 ? 25 : 0);
      if (!best || total < best.cost) best = { cost: total, rw, dir, start: n };
    }
  }
  if (best) best.p = { cost: best.cost, steps: best.start.id === m.node ? [] : IC.aptSteps(tree, m.node, best.start.id) };
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
  const m = newMove(S, ap, Object.assign({ kind: 'dep' }, o));
  m.phase = 'start'; m.t = o.startT || 0;
  const n = G(ap).N.get(o.node); if (n) { m.x = n.x; m.y = n.y; }
  if (o.stand) { m.x = o.stand.x; m.y = o.stand.y; m.h = o.stand.a; }
  if (o.door) { m.x = o.door.x; m.y = o.door.y; }
  const plan = planDeparture(S, ap, m, true);
  if (!plan) { ap.moves = ap.moves.filter(x => x !== m); return null; }
  m.plan = plan;
  return m;
};
IC.gopsCanDepart = function (S, ap, type, node) { const m = { T: IC.ACTYPES[type], node, t: 0 }; return !!planDeparture(S, ap, m, true); };

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
/* how long an arrival or a departure holds its runways, for this type, in seconds (the panel shows the same) */
IC.rwOcc = function (S, ap, rw, dir, T) {
  const g = G(ap), L = IC.rwLen(rw), nodes = g.rwn.get(rw.id) || [];
  let land = 1e9;
  for (const strip of IC.rwStrips(rw)) {
    if (strip[1] - strip[0] < T.rwy) continue;
    const P = landPlan(ap, rw, dir, T, strip, nodes.filter(n => n.exit));
    for (const n of P.cands) {
      const back = (n.s - P.stop) * dir < 0;
      const t = FAF / 0.95 + rollTime(T) + Math.abs(n.s - P.stop) / RWTAXI + (back ? 60 : 0) + CLEAR / TAXI;
      land = Math.min(land, t);
    }
  }
  let dep = 1e9;
  const need = T.rwy * 1.05 + 1, entries = nodes.filter(n => n.entry), roll = HOLD / TAXI + (T.mil ? 10 : 25) + 2 * T.rwy * 0.6 / LIFT;
  for (const n of nodes) {
    const room = dir > 0 ? L - n.s : n.s;
    if (!entries.length || room < need || !clearRun(rw, n.s, n.s + dir * need)) continue;
    // with no taxiway to where the take-off starts, it backtracks along the runway from the nearest entry
    const back = n.entry ? 0 : Math.min(...entries.map(x => Math.abs(x.s - n.s))) / RWTAXI + 30;
    dep = Math.min(dep, roll + back);
  }
  return { land, dep };
};
function planArrival(S, ap, T, target, pref, mil) {
  const g = G(ap), cfg = cfgOf(S, ap), imc = IC.needILS(S) && !mil;
  const back = IC.aptTree(ap, target, true);
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
IC.gopsFaf = function (S, ap, type) {
  const T = IC.ACTYPES[type], cfg = cfgOf(S, ap), imc = IC.needILS(S) && !T.mil, g = G(ap);
  const fit = runways(ap).filter(r => cfg.rw[r.id] && IC.rwUsable(r) >= T.rwy && !IC.rwWindBlock(S, r, cfg.rw[r.id].dir, T) && (!imc || IC.rwHasILS(ap, r, cfg.rw[r.id].dir)));
  if (!fit.length) return null;
  const q = ap.fafQ = (ap.fafQ || []).filter(x => !x.done && S.time - x.t < 1800);
  const occ = (rw, TT) => { const k = rw.id + '|' + cfg.rw[rw.id].dir + '|' + TT.short; let v = g.occ && g.occ.get(k); if (v == null) { const o = IC.rwOcc(S, ap, rw, cfg.rw[rw.id].dir, TT).land; v = (o < 1e8 ? o : 300) + IC.aptSep(ap.st || {}) * 0.5; (g.occ = g.occ || new Map()).set(k, v); } return v; };
  const when = rw => { const L = lockOf(ap, keyOf(ap, rw.id)); let t = Math.max(0, L.next - S.time) + (L.by ? 60 : 0); for (const x of q) if (x.rw === rw.id) t += occ(rw, IC.ACTYPES[x.type]); return t + occ(rw, T); };
  const role = r => cfg.rw[r.id].role === 'arr' || cfg.rw[r.id].role === 'mixed' ? 0 : 1e5;
  fit.sort((a, b) => (role(a) + when(a)) - (role(b) + when(b)));
  const rw = fit[0];
  const entry = { t: S.time, rw: rw.id, type };
  q.push(entry);
  const dir = cfg.rw[rw.id].dir, d = IC.rwDir(rw), th = dir > 0 ? rw.a : rw.b;
  return { x: th.x - d.x * dir * FAF, y: th.y - d.y * dir * FAF, rw, rwId: rw.id, q: entry };
};
/* an aircraft at the approach fix asks to land. o: { type, target (node id), stand, faf, onPark(m), onDead(m), who, mil }.
   Returns the move when cleared, 'hold' when it must wait, or 'divert' when it can never land here. */
IC.gopsLand = function (S, ap, o) {
  const T = IC.ACTYPES[o.type];
  if (!ap.st || (ap.st.longest || 0) < T.rwy) return 'divert';
  const plan = planArrival(S, ap, T, o.target, o.faf && o.faf.rwId, o.mil);
  if (!plan) return 'divert';
  const k = keyOf(ap, plan.rw.id);
  const probe = { id: 'probe', kind: 'arr', mil: o.mil, waitT: 0 };
  // not while an aircraft sits in the exit it will need, waiting to come the other way onto the runway
  if (plan.out && plan.out.kind !== 'apron' && occList(ap, plan.out.key).some(x => x.d !== plan.out.d && !x.m.dead)) return 'hold';
  if (!canTake(S, ap, k, probe)) { wantIt(S, ap, k, probe); return 'hold'; }
  const m = newMove(S, ap, Object.assign({ kind: 'arr' }, o));
  take(ap, k, m, null, S.time);
  if (o.faf && o.faf.q) o.faf.q.done = true;
  m.plan = plan; m.phase = 'final';
  const d = IC.rwDir(plan.rw), dir = plan.dir, th = IC.rwAt(plan.rw, plan.touch / IC.rwLen(plan.rw));
  m.fx = th.x - d.x * dir * FAF; m.fy = th.y - d.y * dir * FAF; m.tx = th.x; m.ty = th.y;
  m.x = m.fx; m.y = m.fy; m.h = Math.atan2(d.y * dir, d.x * dir); m.t = 0; m.alt = 0.6;
  // plan the taxi in now, so taxiways are booked for when it turns off
  const tIn = S.time + FAF / 0.95 + rollTime(T) + plan.rwTime;
  const p = IC.aptSearch(ap, plan.exit.id, { to: o.target, avoidRwy: true, res: { m, t0: tIn } });
  if (p.dist.has(o.target)) { m.inPath = IC.aptSteps(p, plan.exit.id, o.target); reserve(S, ap, m, m.inPath, tIn); }
  // and it keeps its exit clear of oncoming traffic until it is through
  const ex = m.inPath && m.inPath[0] ? edgeNow(ap, m.inPath[0]) : plan.out;
  if (ex && ex.kind !== 'apron') preOccupy(ap, m, ex);
  return m;
};

/* ---------- per-tick movement ---------- */
function stepTaxi(S, ap, m, dt) {
  let budget = dt;
  while (budget > 1e-6 && m.path && m.pi < m.path.length) {
    const st = m.path[m.pi];
    const e = edgeNow(ap, st);
    if (!e) { replan(S, ap, m); m.waitT += budget; return; }
    const rwId = rwNeed(ap, st, e), k = rwId && keyOf(ap, rwId);
    const needLock = k && !(m.locks && m.locks[k]);
    if (!m.onEdge) {
      // a runway edge needs the runway before we move at all; the approach to a runway stops at the hold-short line
      if (needLock && (e.kind === 'rwy' || e.len <= HOLD + 0.05)) {
        if (!holdShort(S, ap, m, k, budget, crossKey(m, st, e))) return;
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
    const spd = e.spd;
    let lim = e.len;
    if (k && !(m.locks && m.locks[k]) && e.kind !== 'rwy') lim = Math.max(0, e.len - HOLD);
    const lead = leader(ap, m, st, e);
    let adv = spd * budget;
    if (lead != null) adv = Math.max(0, Math.min(adv, lead - SPACING - m.s));
    adv = Math.min(adv, Math.max(0, lim - m.s));
    if (adv <= 1e-6) {
      if (m.s >= lim - 1e-6 && lim < e.len) {
        // at the hold-short line: wait for the runway, then go
        if (!holdShort(S, ap, m, k, budget, crossKey(m, st, e))) return;
        continue;
      }
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
function holdShort(S, ap, m, k, dt, cross) {
  // never go onto a runway unless the way off it is clear of oncoming traffic
  const ex = exitStep(m), e2 = ex && edgeNow(ap, ex);
  let clear = true;
  if (e2 && e2.kind !== 'apron') {
    const w2 = enterWhy(S, ap, m, ex, e2);
    if (w2 === 'opp' || w2 === 'claim') {
      clear = false; m.crossBlk = (m.crossBlk || 0) + dt;
      // kept waiting: find another way round
      if (m.crossBlk > 90) { m.crossBlk = 0; replan(S, ap, m, ex.from); return false; }
    }
  }
  if (clear && canTake(S, ap, k, m, cross)) {
    take(ap, k, m, cross, S.time); m.holding = null; m.holdLog = false; m.crossBlk = 0;
    if (e2 && e2.kind !== 'apron') preOccupy(ap, m, e2);
    return true;
  }
  wantIt(S, ap, k, m);
  m.waitT += dt; m.holding = 'runway';
  if (m.kind === 'dep') ap.depWait = (ap.depWait || 0) + 1;
  if (!m.holdLog) { m.holdLog = true; incursion(S, ap, m, k); }
  place(ap, m);
  return false;
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
    if (!keep) { release(S, ap, k, m, m.kind === 'arr' && !m.crossed ? sepOf(ap, m) : 5); if (m.kind === 'arr') m.crossed = true; }
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

function kill(S, ap, m) { vacate(ap, m); unclaim(ap, m); unreserve(ap, m); if (m.locks) for (const k in m.locks) release(S, ap, k, m, 0); }
function done(ap, m) { ap.kpi.n++; ap.kpi.taxi = ap.kpi.taxi * 0.9 + m.taxiT * 0.1; ap.kpi.wait = ap.kpi.wait * 0.9 + m.waitT * 0.1; }

IC.gops = function (S, dt) {
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
      if (L.with) for (const id of L.with) if (!ap.moves.some(m => m.id === id)) L.with.delete(id);
      if (L.by && !ap.moves.some(m => m.id === L.by)) { if (L.with && L.with.size) { const n = L.with.values().next().value; L.with.delete(n); L.by = n; } else L.by = null; }
    }
  }
};
function step(S, ap, m, dt) {
  switch (m.phase) {
    case 'start': {
      m.t -= dt;
      if (m.t > 0) return;
      if (m.stand && m.stand.contact) { if (!pushOk(S, ap, m)) { m.waitT += dt; return; } m.phase = 'push'; m.t = 60; m.stand.pushT = S.time + 60; return; }
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
        if (m.kind === 'dep') {
          // at the runway: line up once we hold it
          const k = keyOf(ap, m.plan.rw.id);
          if (!(m.locks && m.locks[k])) { if (!canTake(S, ap, k, m)) { wantIt(S, ap, k, m); m.waitT += dt; m.path = []; m.pi = 0; m.phase = 'hold'; return; } take(ap, k, m, null, S.time); }
          lineUp(S, ap, m);
        } else arriveAt(S, ap, m);
      }
      return;
    }
    case 'hold': {
      const k = keyOf(ap, m.plan.rw.id);
      if (!canTake(S, ap, k, m)) { wantIt(S, ap, k, m); m.waitT += dt; ap.depWait = (ap.depWait || 0) + 1; m.holding = 'runway'; return; }
      take(ap, k, m, null, S.time); m.holding = null; lineUp(S, ap, m); return;
    }
    case 'lineup': {
      m.t -= dt;
      const want = hdgOf(m.plan.rw, m.plan.dir);
      m.h += U.clamp(U.angWrap(want - m.h), -dt * 0.2, dt * 0.2);
      if (m.t <= 0) {
        m.phase = 'roll'; m.h = want; m.spd = 0; m.rolled = 0;
        if (risky(S, ap, m, 'dep')) return;
      }
      return;
    }
    case 'roll': {
      const need = m.T.rwy * 0.6, acc = LIFT * LIFT / (2 * need);
      m.spd = Math.min(LIFT * 1.1, m.spd + acc * dt);
      m.rolled += m.spd * dt; m.rwT += dt;
      m.x += Math.cos(m.h) * m.spd * dt; m.y += Math.sin(m.h) * m.spd * dt;
      if (m.rolled >= need) {
        // wake turbulence: the next may go only after the gap
        release(S, ap, keyOf(ap, m.plan.rw.id), m, sepOf(ap, m));
        m.dead = true; kill(S, ap, m);
        done(ap, m); countMove(S, ap, 'dep', m.type, m.plan.rw);
        m.onAir && m.onAir(m);
      }
      return;
    }
    case 'final': {
      const tot = FAF / 0.95;
      m.t += dt;
      const f = U.clamp(m.t / tot, 0, 1);
      m.x = U.lerp(m.fx, m.tx, f); m.y = U.lerp(m.fy, m.ty, f); m.alt = 0.6 * (1 - f);
      if (f >= 1) {
        m.phase = 'land'; m.spd = TOUCH; m.s0 = m.plan.touch; m.pos = m.plan.touch; m.alt = 0;
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
          if (!m.path.length) { release(S, ap, keyOf(ap, m.plan.rw.id), m, sepOf(ap, m)); arriveAt(S, ap, m); }
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
        done(ap, m);
        m.onPark && m.onPark(m);
      }
      return;
    }
  }
}
/* movements per hour, counted as they happen (the panel compares them with the rated capacity) */
function countMove(S, ap, k, type, rw) { const L = ap.mvLog = ap.mvLog || []; L.push({ t: S.time, k, type }); while (L.length && S.time - L[0].t > 3600) L.shift(); ap.kpi[k] = (ap.kpi[k] || 0) + 1; IC.emit(S, 'rwMove', { ap, k, type, rw }); }
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
  const plan = planDeparture(S, ap, m);
  if (!plan) {
    m.phase = 'start'; m.t = 60; m.waitT += 60;
    if (!m.noRouteLog) { m.noRouteLog = true; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'a departure'} has no route to a runway it can use${IC.depBlockWhy(S, ap, m.T)}.`, m); IC.emit(S, 'noRoute', { ap, m }); }
    if (m.waitT > 3600) { m.dead = true; kill(S, ap, m); m.onDead && m.onDead(m, 'cancelled'); }
    return;
  }
  m.plan = plan; m.path = plan.p.steps; m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false;
  reserve(S, ap, m, m.path, S.time);
  if (m.stand) { m.stand.occ = null; m.stand.res = null; m.stand = null; }
  m.left = true;
  m.onLeave && m.onLeave(m);
}
/* why no runway will do, in plain words */
IC.depBlockWhy = function (S, ap, T) {
  const cfg = cfgOf(S, ap), why = runways(ap).map(rw => cfg.rw[rw.id] && IC.rwWindBlock(S, rw, cfg.rw[rw.id].dir, T)).filter(Boolean);
  return why.length && why.length === runways(ap).length ? ` (${why[0]})` : '';
};
function lineUp(S, ap, m) {
  m.phase = 'lineup'; m.t = m.T.mil ? 10 : 25;
  const n = G(ap).N.get(m.plan.start.id);
  if (n) { m.x = n.x; m.y = n.y; }
}
function arriveAt(S, ap, m) {
  if (m.stand) { m.phase = 'parkin'; m.t = 20; return; }
  m.dead = true; kill(S, ap, m);
  done(ap, m);
  m.onPark && m.onPark(m);
}

/* ---------- crashes and incidents: rare, and always with a cause ---------- */
/* the chance that this landing or take-off ends in an accident, and why. Zero in normal operations. */
IC.gopsRisk = function (S, ap, m, what) {
  const T = m.T, P = m.plan, out = [];
  if (!P || !P.rw || T.vtol) return { p: 0, why: out };
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
  if (ap.water && ap.water.near) out.push({ cause: 'bird', p: 0.0003, text: `birds from the ${ap.water.what} ${U.km(ap.water.d)} from the runway` });
  return { p: out.reduce((s, x) => s + x.p, 0), why: out };
};
function risky(S, ap, m, what) {
  const r = IC.gopsRisk(S, ap, m, what);
  ap.kpi.risk = (ap.kpi.risk || 0) + r.p;
  if (!r.p || Math.random() >= r.p) return false;
  const c = U.wpick(r.why.map(x => [x, x.p]));
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
  if (Math.random() >= IC.INCURSION) return;
  const L = lockOf(ap, k), other = ap.moves.find(x => x.id === L.by);
  ap.kpi.inc = (ap.kpi.inc || 0) + 1;
  if (!other || (other.phase !== 'land' && other.phase !== 'roll')) {
    IC.log(S, 'warn', 'AIRPORT', `${ap.name}: ${m.who || 'an aircraft'} crossed the hold-short line without clearance. Nobody was hurt. A ground radar would have warned the tower.`, m);
    return;
  }
  const c = { cause: 'incursion', text: `${m.who || 'a taxiing aircraft'} strayed onto the runway in ${IC.needILS(S) ? 'fog' : 'the dark'}, and the tower had no ground radar to see it` };
  other.crash = c;
  if (other.phase === 'roll') crashNow(S, ap, other);
  m.destroyed = true; m.why = 'destroyed in a runway collision';
}
const dark = S => { const h = ((S.time % 86400) + 86400) % 86400 / 3600; return h < 5.5 || h > 20.5; };
/* fire and rescue: seconds until the first truck reaches a point */
IC.aptRescue = function (ap, p) {
  let best = 1e9;
  for (const f of ap.parts) if (f.kind === 'fire' && f.built && f.hp > f.max * 0.25) best = Math.min(best, 60 + U.dist(f, p) / 0.25);
  return best;
};
function crashNow(S, ap, m) {
  const c = m.crash, T = m.T, rw = m.plan.rw;
  const on = T.mil ? (T.crew || 1) * (m.n || 1) : Math.round((T.seats || 2) * 0.82) + (T.seats ? 6 : 3);
  const rescue = IC.aptRescue(ap, m);
  const base = { overrun: 0.08, gust: 0.25, tailwind: 0.2, incursion: 0.45, bird: 0.35 }[c.cause] || 0.3;
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
  const text = `${what}, crashed ${phase} on runway ${IC.rwEnd(rw, m.plan.dir)} at ${ap.name}. ${dead} of the ${on} people on board died. The cause: ${c.text}. ${resc}`;
  const fix = { gust: 'A runway pointing into the wind (a crosswind runway) would have kept it inside its limits.', tailwind: 'A runway pointing into the wind would have avoided the tailwind.', overrun: 'A longer runway, or one without craters, leaves a margin when it is wet.', incursion: 'A ground radar shows the tower every aircraft on the ground, day and night.', bird: 'Airports away from lakes and rivers see far fewer birds.' }[c.cause] || '';
  if (S.camp) {
    (S.later = S.later || []).push({ t: S.time + 1800, fn: () => { if (S.camp) IC.card(S, 'Accident report', `${ap.name} · ${U.hhmm(S.time)}`, `${text} ${fix}`, 'alarm'); } });
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
/* returns true when the aircraft has been handed to ground ops (it appears in the air when it lifts off) */
IC.milDepart = function (S, b, a) {
  const r = a.r, sn = IC.milStartNode(S, b, r);
  if (!sn) return false;
  const type = IC.AIRKIND_TYPE[r.kind];
  const m = IC.gopsDepart(S, b, { type, node: sn.node, door: sn.door, stand: sn.stand ? Object.assign({}, sn.stand, { contact: false }) : null, startT: sn.startT * (r.qra ? 0.5 : 1), mil: true, scramble: !!r.qra, who: r.name, flight: a, n: a.n,
    onAir: mm => { a.gnd = false; a.x = mm.x; a.y = mm.y; a.h = mm.h; a.ground = null; a.tookOffT = S.time; IC.emit(S, 'airborne', a); },
    onDead: () => { if (!a.dead) { a.dead = true; if (a.r) { a.r.st = 'lost'; a.r.ent = null; } } } });
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
  if (!a.faf || a.fafBase !== b.id || S.time - a.fafT > 600) { a.faf = IC.gopsFaf(S, b, type); a.fafBase = b.id; a.fafT = S.time; }
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
    onPark: () => { a.gnd = false; a.faf = null; IC.airLand(S, a, b); },
    onDead: () => { if (!a.dead) { a.dead = true; if (a.r) { a.r.st = 'lost'; a.r.ent = null; } } } });
  if (m === 'divert') { a.faf = null; return 'divert'; }
  if (m === 'hold') { a.holdT = (a.holdT || 0) + dt; return holdPt; }
  a.gnd = true; a.ground = m;
  return true;
};

})(window.IC);
