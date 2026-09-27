/* Iron Canopy — ground operations. Every aircraft that uses one of our airports taxis along the network the player
   built: pushback, taxi, hold short, line up, take-off roll; approach, landing roll, exit, taxi in, park.
   One runway is used by one aircraft at a time; a taxiway carries traffic one way at a time. Layouts without exits,
   parallel taxiways or enough stands show up as delays, backtracking and gridlock. */
(function (IC) {
'use strict';
const U = IC.U;
const RWTAXI = 0.12, TOUCH = 0.75, LIFT = 0.8, SPACING = 0.55, FAF = 60, FORCE = 150;

const G = ap => IC.aptGraph(ap);
const runways = ap => ap.parts.filter(p => p.kind === 'runway' && p.built && p.hp > p.max * 0.25);
const rwById = (ap, id) => ap.parts.find(p => p.id === id);
/* take off and land into the wind */
IC.rwWindDir = (S, rw) => { const d = IC.rwDir(rw); return d.x * S.wind.x + d.y * S.wind.y > 0 ? -1 : 1; };

function nodeT(g, id, rw) {
  const n = g.N.get(id); if (!n) return null;
  if (n.kind === 'rwyEnd') return n.ref.part === rw.id ? n.ref.t : null;
  if (n.kind === 'taxi' && n.ref.on && n.ref.on.kind === 'rwy' && n.ref.on.part === rw.id) return n.ref.on.t;
  return null;
}
/* the runway a node sits on, if any */
function rwOfNode(ap, id) {
  const n = G(ap).N.get(id); if (!n) return null;
  if (n.kind === 'rwyEnd') return n.ref.part;
  if (n.kind === 'taxi' && n.ref.on && n.ref.on.kind === 'rwy') return n.ref.on.part;
  return null;
}
function rwNodes(ap, rw) {
  const g = G(ap), out = [];
  for (const id of g.N.keys()) { const t = nodeT(g, id, rw); if (t == null) continue; out.push({ id, t, s: t * IC.rwLen(rw), exit: g.adj.get(id).some(e => e.kind !== 'rwy') }); }
  return out.sort((a, b) => a.t - b.t);
}
function clearRun(rw, s0, s1) {
  const L = IC.rwLen(rw), a = Math.min(s0, s1), b = Math.max(s0, s1);
  if (a < -0.01 || b > L + 0.01) return false;
  return !rw.craters.some(c => c.t * L + c.r > a && c.t * L - c.r < b);
}

/* ---------- runway locks ---------- */
const lockOf = (ap, id) => (ap.rl = ap.rl || {})[id] || (ap.rl[id] = { by: null, next: 0 });
function canTake(S, ap, rwId, m) {
  const L = lockOf(ap, rwId);
  if (L.by === m.id) return true;
  if (L.by || S.time < L.next) return false;
  // arrivals have priority over departures, unless a departure has waited a long time
  if (m.kind === 'dep' && (ap.arrWait || 0) > 0 && m.waitT < 300) return false;
  return true;
}
function take(ap, rwId, m) { lockOf(ap, rwId).by = m.id; (m.locks = m.locks || {})[rwId] = true; }
function release(S, ap, rwId, m, sep) {
  const L = lockOf(ap, rwId);
  if (L.by === m.id) { L.by = null; L.next = Math.max(L.next, S.time + (sep || 0)); }
  if (m.locks) delete m.locks[rwId];
}
const sepOf = ap => IC.aptSep(ap.st || {});
IC.rwBusy = (S, ap, rwId) => { const L = lockOf(ap, rwId); return !!L.by || S.time < L.next; };

/* ---------- taxiway occupancy ---------- */
function occList(ap, key) { ap.eo = ap.eo || new Map(); if (!ap.eo.has(key)) ap.eo.set(key, []); return ap.eo.get(key); }
function dirOf(st) { return st.from < st.to ? 1 : -1; }
function enterOk(ap, m, st, e) {
  if (e.kind === 'apron') return true;
  const d = dirOf(st);
  for (const o of occList(ap, e.key)) {
    if (o.m === m || o.m.dead) continue;
    if (o.d !== d) return false;
    if (o.m.s < SPACING + 0.05) return false;
  }
  return true;
}
function occupy(ap, m, st, e) { if (e.kind !== 'apron') occList(ap, e.key).push({ m, d: dirOf(st) }); m.edgeKey = e.kind !== 'apron' ? e.key : null; }
function vacate(ap, m) { if (!m.edgeKey) return; const L = occList(ap, m.edgeKey), i = L.findIndex(o => o.m === m); if (i >= 0) L.splice(i, 1); m.edgeKey = null; }
function leader(ap, m, st, e) {
  if (e.kind === 'apron') return null;
  const d = dirOf(st); let best = null;
  for (const o of occList(ap, e.key)) if (o.m !== m && o.d === d && o.m.s > m.s && (best == null || o.m.s < best)) best = o.m.s;
  return best;
}
/* the live edge for a planned step (the network may have changed since) */
function edgeNow(ap, st) { const L = G(ap).adj.get(st.from); return L ? L.find(e => e.to === st.to && e.kind === st.e.kind) : null; }
/* entering this edge puts the aircraft on (or across) a runway */
function rwNeed(ap, st, e) { if (e.kind === 'rwy') return e.part; return rwOfNode(ap, st.to); }

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
function planDeparture(S, ap, m) {
  let best = null;
  for (const rw of runways(ap)) {
    const L = IC.rwLen(rw), dir = IC.rwWindDir(S, rw), need = m.T.rwy * 1.05 + 1;
    if (IC.rwUsable(rw) < m.T.rwy) continue;
    for (const n of rwNodes(ap, rw)) {
      const room = dir > 0 ? L - n.s : n.s;
      if (room < need || !clearRun(rw, n.s, n.s + dir * need)) continue;
      const p = n.id === m.node ? { cost: 0, steps: [] } : IC.aptPath(ap, m.node, n.id);
      if (!p) continue;
      const cost = p.cost + (room < L * 0.6 ? 25 : 0);
      if (!best || cost < best.cost) best = { cost, p, rw, dir, start: n };
    }
  }
  return best;
}
/* o: { type, node (start node id), stand, startT, contact, onAir(m), onDead(m), who, mil } */
IC.gopsDepart = function (S, ap, o) {
  const m = newMove(S, ap, Object.assign({ kind: 'dep' }, o));
  m.phase = 'start'; m.t = o.startT || 0;
  const n = G(ap).N.get(o.node); if (n) { m.x = n.x; m.y = n.y; }
  if (o.stand) { m.x = o.stand.x; m.y = o.stand.y; m.h = o.stand.a; }
  if (o.door) { m.x = o.door.x; m.y = o.door.y; }
  const plan = planDeparture(S, ap, m);
  if (!plan) { ap.moves = ap.moves.filter(x => x !== m); return null; }
  m.plan = plan;
  return m;
};
IC.gopsCanDepart = function (S, ap, type, node) { const m = { T: IC.ACTYPES[type], node }; return !!planDeparture(S, ap, m); };

/* ---------- arrivals ---------- */
function planArrival(S, ap, T, target) {
  let best = null;
  for (const rw of runways(ap)) {
    const L = IC.rwLen(rw), dir = IC.rwWindDir(S, rw), need = T.rwy;
    const nodes = rwNodes(ap, rw).filter(n => n.exit);
    for (const [s0, s1] of IC.rwStrips(rw)) {
      if (s1 - s0 < need) continue;
      const touch = dir > 0 ? s0 + 1.5 : s1 - 1.5, stop = touch + dir * need * 0.5;
      const inStrip = nodes.filter(n => n.s >= s0 - 0.01 && n.s <= s1 + 0.01);
      const ahead = inStrip.filter(n => (n.s - stop) * dir >= 0).sort((a, b) => (a.s - b.s) * dir);
      const behind = inStrip.filter(n => (n.s - stop) * dir < 0).sort((a, b) => (b.s - a.s) * dir);
      for (const n of ahead.slice(0, 3).concat(behind.slice(0, 2))) {
        const p = IC.aptPath(ap, n.id, target, true);
        if (!p) continue;
        const back = (n.s - stop) * dir < 0;
        // turning round on the runway to go back to an exit is slow
        const rwTime = Math.abs(n.s - stop) / RWTAXI + (back ? 60 : 0);
        const cost = rwTime * 2 + p.cost;
        if (!best || cost < best.cost) best = { cost, rw, dir, touch, stop, exit: n, back, p, rwTime };
      }
    }
  }
  return best;
}
/* where an arriving aircraft should start its final approach */
IC.gopsFaf = function (S, ap, type) {
  const rw = runways(ap).filter(r => IC.rwUsable(r) >= IC.ACTYPES[type].rwy).sort((a, b) => IC.rwLen(b) - IC.rwLen(a))[0];
  if (!rw) return null;
  const dir = IC.rwWindDir(S, rw), d = IC.rwDir(rw), th = dir > 0 ? rw.a : rw.b;
  return { x: th.x - d.x * dir * FAF, y: th.y - d.y * dir * FAF, rw };
};
/* an aircraft at the approach fix asks to land. o: { type, target (node id), stand, onPark(m), onDead(m), who, mil }.
   Returns the move when cleared, 'hold' when it must wait, or 'divert' when it can never land here. */
IC.gopsLand = function (S, ap, o) {
  const T = IC.ACTYPES[o.type];
  if (!ap.st || (ap.st.longest || 0) < T.rwy) return 'divert';
  const plan = planArrival(S, ap, T, o.target);
  if (!plan) return 'divert';
  const probe = { id: 'probe', kind: 'arr', waitT: 0 };
  if (!canTake(S, ap, plan.rw.id, probe)) { ap.arrWaitN = (ap.arrWaitN || 0) + 1; return 'hold'; }
  const m = newMove(S, ap, Object.assign({ kind: 'arr' }, o));
  take(ap, plan.rw.id, m);
  m.plan = plan; m.phase = 'final';
  const d = IC.rwDir(plan.rw), dir = plan.dir, th = IC.rwAt(plan.rw, plan.touch / IC.rwLen(plan.rw));
  m.fx = th.x - d.x * dir * FAF; m.fy = th.y - d.y * dir * FAF; m.tx = th.x; m.ty = th.y;
  m.x = m.fx; m.y = m.fy; m.h = Math.atan2(d.y * dir, d.x * dir); m.t = 0; m.alt = 0.6;
  return m;
};

/* ---------- per-tick movement ---------- */
function stepTaxi(S, ap, m, dt) {
  let budget = dt;
  const g = G(ap);
  while (budget > 1e-6 && m.path && m.pi < m.path.length) {
    const st = m.path[m.pi];
    let e = edgeNow(ap, st);
    if (!e) { replan(S, ap, m); m.waitT += budget; return; }
    if (!m.onEdge) {
      const rwId = rwNeed(ap, st, e);
      if (rwId && !(m.locks && m.locks[rwId])) {
        if (!canTake(S, ap, rwId, m)) { m.waitT += budget; m.holding = 'runway'; if (m.kind === 'dep') ap.depWait = (ap.depWait || 0) + 1; return; }
        take(ap, rwId, m);
      }
      if (!enterOk(ap, m, st, e)) {
        m.blockT += budget; m.waitT += budget; m.holding = 'traffic';
        if (m.blockT < FORCE) return;
        gridlock(S, ap, m);
      }
      occupy(ap, m, st, e); m.onEdge = true; m.blockT = 0; m.holding = null;
    }
    const spd = e.spd;
    const lead = leader(ap, m, st, e);
    let adv = spd * budget;
    if (lead != null) adv = Math.max(0, Math.min(adv, lead - SPACING - m.s));
    if (adv <= 1e-6) { m.waitT += budget; m.blockT += budget; if (m.blockT > FORCE * 2) { gridlock(S, ap, m); m.s = Math.min(e.len, m.s + 0.3); } return; }
    m.blockT = 0;
    const rem = e.len - m.s;
    if (adv >= rem) {
      budget -= rem / spd; m.taxiT += rem / spd;
      if (e.kind === 'rwy') m.rwT += rem / spd;
      vacate(ap, m); m.onEdge = false; m.s = 0; m.node = st.to; m.pi++;
      // leaving the runway frees it for the next aircraft
      if (m.locks) for (const id in m.locks) {
        const onIt = rwOfNode(ap, m.node) === id;
        const next = m.path[m.pi], nextOn = next && (next.e.kind === 'rwy' && next.e.part === id);
        const keep = onIt || nextOn || (m.kind === 'dep' && m.pi >= m.path.length && m.plan && m.plan.rw.id === id);
        if (!keep) release(S, ap, id, m, m.kind === 'arr' && !m.crossed ? sepOf(ap) * 0.5 : 5), m.crossed = true;
      }
    } else { m.s += adv; budget = 0; m.taxiT += adv / spd; if (e.kind === 'rwy') m.rwT += adv / spd; }
  }
  place(ap, m);
}
function gridlock(S, ap, m) {
  m.waitT += 120;
  if (!ap.gridT || S.time - ap.gridT > 1800) {
    ap.gridT = S.time;
    IC.log(S, 'warn', 'GROUND', `${ap.name}: aircraft nose to nose on a taxiway; one had to be towed clear. A parallel taxiway or a second connection would stop this.`, m);
    IC.emit(S, 'gridlock', { ap, m });
  }
  ap.kpi.grid = (ap.kpi.grid || 0) + 1;
}
function replan(S, ap, m) {
  const goal = m.path[m.path.length - 1].to;
  const p = IC.aptPath(ap, m.node, goal, m.kind === 'arr');
  if (p) { m.path = p.steps; m.pi = 0; m.s = 0; m.onEdge = false; vacate(ap, m); m.stuck = false; return; }
  if (!m.stuck) { m.stuck = true; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'an aircraft'} is stranded: the taxiway ahead is cut.`, m); }
}

function kill(S, ap, m) { vacate(ap, m); if (m.locks) for (const id in m.locks) release(S, ap, id, m, 0); }

IC.gops = function (S, dt) {
  for (const ap of IC.bases(S)) {
    if (!ap.parts || !ap.moves) continue;
    ap.kpi = ap.kpi || { taxi: 0, wait: 0, n: 0, grid: 0, div: 0, hold: 0 };
    ap.arrWait = ap.arrWaitN || 0; ap.arrWaitN = 0; ap.depWait = 0;
    for (const m of ap.moves) {
      if (m.dead) continue;
      if (m.destroyed) { kill(S, ap, m); m.dead = true; m.onDead && m.onDead(m); continue; }
      step(S, ap, m, dt);
    }
    if (ap.moves.some(m => m.dead)) ap.moves = ap.moves.filter(m => !m.dead);
    // a crashed or stuck aircraft on a runway still blocks it; a lock without a live owner does not
    if (ap.rl) for (const id in ap.rl) { const L = ap.rl[id]; if (L.by && !ap.moves.some(m => m.id === L.by)) L.by = null; }
  }
};
function step(S, ap, m, dt) {
  const g = G(ap);
  switch (m.phase) {
    case 'start': {
      m.t -= dt;
      if (m.t > 0) return;
      if (m.stand && m.stand.contact) { m.phase = 'push'; m.t = 60; return; }
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
          const rw = m.plan.rw;
          if (!(m.locks && m.locks[rw.id])) { if (!canTake(S, ap, rw.id, m)) { m.waitT += dt; m.path = []; m.pi = 0; m.phase = 'hold'; return; } take(ap, rw.id, m); }
          lineUp(S, ap, m);
        } else arriveAt(S, ap, m);
      }
      return;
    }
    case 'hold': {
      const rw = m.plan.rw;
      if (!canTake(S, ap, rw.id, m)) { m.waitT += dt; ap.depWait = (ap.depWait || 0) + 1; return; }
      take(ap, rw.id, m); lineUp(S, ap, m); return;
    }
    case 'lineup': {
      m.t -= dt;
      const d = IC.rwDir(m.plan.rw);
      const want = Math.atan2(d.y * m.plan.dir, d.x * m.plan.dir);
      m.h += U.clamp(U.angWrap(want - m.h), -dt * 0.2, dt * 0.2);
      if (m.t <= 0) { m.phase = 'roll'; m.h = want; m.spd = 0; m.rolled = 0; }
      return;
    }
    case 'roll': {
      const need = m.T.rwy * 0.6, acc = LIFT * LIFT / (2 * need);
      m.spd = Math.min(LIFT * 1.1, m.spd + acc * dt);
      m.rolled += m.spd * dt; m.rwT += dt;
      m.x += Math.cos(m.h) * m.spd * dt; m.y += Math.sin(m.h) * m.spd * dt;
      if (m.rolled >= need) {
        m.dead = true; kill(S, ap, m);
        release(S, ap, m.plan.rw.id, m, sepOf(ap));
        ap.kpi.n++; ap.kpi.taxi = ap.kpi.taxi * 0.9 + m.taxiT * 0.1; ap.kpi.wait = ap.kpi.wait * 0.9 + m.waitT * 0.1;
        m.onAir && m.onAir(m);
      }
      return;
    }
    case 'final': {
      const tot = FAF / 0.95;
      m.t += dt;
      const f = U.clamp(m.t / tot, 0, 1);
      m.x = U.lerp(m.fx, m.tx, f); m.y = U.lerp(m.fy, m.ty, f); m.alt = 0.6 * (1 - f);
      if (f >= 1) { m.phase = 'land'; m.spd = TOUCH; m.s0 = m.plan.touch; m.pos = m.plan.touch; m.alt = 0; }
      return;
    }
    case 'land': {
      const P = m.plan, dist = Math.abs(P.stop - P.touch), dec = (TOUCH * TOUCH - RWTAXI * RWTAXI) / (2 * Math.max(1, dist));
      m.spd = Math.max(RWTAXI, m.spd - dec * dt);
      m.pos += P.dir * m.spd * dt; m.rwT += dt;
      setRwPos(ap, m);
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
          const p = IC.aptPath(ap, m.node, m.target, true);
          if (!p) { m.stuck = true; m.phase = 'stranded'; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'an arrival'} cannot reach its stand and is blocking the runway.`, m); return; }
          m.path = p.steps; m.pi = 0; m.s = 0; m.phase = 'taxi';
          if (!m.path.length) { release(S, ap, m.plan.rw.id, m, sepOf(ap) * 0.5); arriveAt(S, ap, m); }
          return;
        }
      } else m.pos += Math.sign(d) * stp;
      setRwPos(ap, m, Math.sign(d));
      return;
    }
    case 'stranded': {
      m.t += dt; m.waitT += dt;
      const p = IC.aptPath(ap, m.plan ? m.plan.exit.id : m.node, m.target, true);
      if (p) { m.path = p.steps; m.pi = 0; m.s = 0; m.phase = 'taxi'; m.node = m.plan.exit.id; return; }
      if (m.t > 1800) { m.dead = true; kill(S, ap, m); ap.kpi.div++; m.onDead && m.onDead(m, 'towed'); }
      return;
    }
    case 'parkin': {
      m.t -= dt;
      const f = 1 - U.clamp(m.t / 20, 0, 1);
      if (m.stand) { m.x = U.lerp(m.stand.fx, m.stand.x, f); m.y = U.lerp(m.stand.fy, m.stand.y, f); m.h = m.stand.a; }
      if (m.t <= 0) {
        m.dead = true; kill(S, ap, m);
        ap.kpi.n++; ap.kpi.taxi = ap.kpi.taxi * 0.9 + m.taxiT * 0.1; ap.kpi.wait = ap.kpi.wait * 0.9 + m.waitT * 0.1;
        m.onPark && m.onPark(m);
      }
      return;
    }
  }
}
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
    if (!m.noRouteLog) { m.noRouteLog = true; IC.log(S, 'warn', 'GROUND', `${ap.name}: ${m.who || 'a departure'} has no route to a usable runway.`, m); IC.emit(S, 'noRoute', { ap, m }); }
    if (m.waitT > 3600) { m.dead = true; kill(S, ap, m); m.onDead && m.onDead(m, 'cancelled'); }
    return;
  }
  m.plan = plan; m.path = plan.p.steps; m.pi = 0; m.s = 0; m.phase = 'taxi'; m.onEdge = false;
  if (m.stand) { m.stand.occ = null; m.stand.res = null; m.stand = null; }
  m.left = true;
  m.onLeave && m.onLeave(m);
}
function lineUp(S, ap, m) {
  m.phase = 'lineup'; m.t = m.T.mil ? 10 : 25;
  const n = G(ap).N.get(m.plan.start.id);
  if (n) { m.x = n.x; m.y = n.y; }
}
function arriveAt(S, ap, m) {
  if (m.stand) { m.phase = 'parkin'; m.t = 20; return; }
  m.dead = true; kill(S, ap, m);
  ap.kpi.n++; ap.kpi.taxi = ap.kpi.taxi * 0.9 + m.taxiT * 0.1; ap.kpi.wait = ap.kpi.wait * 0.9 + m.waitT * 0.1;
  m.onPark && m.onPark(m);
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
  if (!IC.gopsCanDepart(S, b, IC.AIRKIND_TYPE[r.kind], sn.node)) return 'No taxi route to a usable runway';
  return '';
};
/* returns true when the aircraft has been handed to ground ops (it appears in the air when it lifts off) */
IC.milDepart = function (S, b, a) {
  const r = a.r, sn = IC.milStartNode(S, b, r);
  if (!sn) return false;
  const type = IC.AIRKIND_TYPE[r.kind];
  const m = IC.gopsDepart(S, b, { type, node: sn.node, door: sn.door, stand: sn.stand ? Object.assign({}, sn.stand, { contact: false }) : null, startT: sn.startT * (r.qra ? 0.5 : 1), mil: true, who: r.name, flight: a, n: a.n,
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
  const faf = IC.gopsFaf(S, b, type);
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
  const m = IC.gopsLand(S, b, { type, target: sn.node, stand: null, mil: true, who: a.name, flight: a, n: a.hp,
    onPark: () => { a.gnd = false; IC.airLand(S, a, b); },
    onDead: () => { if (!a.dead) { a.dead = true; if (a.r) { a.r.st = 'lost'; a.r.ent = null; } } } });
  if (m === 'divert') return 'divert';
  if (m === 'hold') { a.holdT = (a.holdT || 0) + dt; return { x: faf.x + Math.cos(S.time * 0.02) * 12, y: faf.y + Math.sin(S.time * 0.02) * 12, hold: true }; }
  a.gnd = true; a.ground = m;
  return true;
};

})(window.IC);
