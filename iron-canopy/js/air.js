/* Iron Canopy — the air wing. Flights of aircraft with loadouts; standing tasks (the air tasking order) are
   filled automatically, and the player can fly any mission by hand: intercept and identify, strike, close air
   support, helicopter attacks on enemy brigades and helicopter lifts to our own. */
(function (IC) {
'use strict';
const U = IC.U;
const SORTIE_COST = { ftr: 3, atk: 1.5, ucav: 0.6, aew: 5, isr: 0.5, heli: 0.6, cargo: 2 };
const RUNS = { ftr: 4, atk: 3, ucav: 4 };
const CAS_POW = { ftr: 1.2, atk: 1.6, ucav: 0.7 };
const NAMES = { ftr: 'VIPER', atk: 'TALON', ucav: 'HAWK', aew: 'SENTRY', isr: 'REAPER', heli: 'HOOK', cargo: 'ATLAS' };

IC.newFlight = (S, kind, name, base) => ({ id: IC.nid('r'), kind, name, base, st: 'ready', t: 0, ent: null, n: IC.AIR_KIND[kind].n, load: kind === 'ftr' ? 'aa' : null, slot: null, roe: 'auto' });

IC.airInit = function (S, sandbox, academy, story) {
  const fwd = S.byId.ab_fwd ? 'ab_fwd' : 'ab_rear', rear = S.byId.ab_rear ? 'ab_rear' : fwd;
  const add = (kind, name, base) => S.roster.push(IC.newFlight(S, kind, name, base));
  if (!academy && !story) {
    add('ftr', 'VIPER 1', fwd); add('ftr', 'VIPER 2', fwd); add('atk', 'TALON 1', fwd); add('isr', 'REAPER 1', fwd); add('heli', 'HOOK 1', fwd);
    add('ftr', 'LANCE 1', rear); add('ftr', 'LANCE 2', rear); add('aew', 'SENTRY 1', rear); add('isr', 'REAPER 2', rear); add('cargo', 'ATLAS 1', rear); add('heli', 'HOOK 2', rear); add('ucav', 'HAWK 1', rear); add('atk', 'TALON 2', rear);
  }
  for (const b of IC.bases(S)) IC.assignSlots(S, b);
  if (sandbox) {
    const cap = IC.cap(S), fA = S.fronts.find(f => f.key === 'A');
    IC.addTask(S, 'cap', { x: cap.x, y: cap.y });
    if (fA) { const p = fA.pts[Math.floor(fA.pts.length / 2)]; IC.addTask(S, 'aew', { x: p.x + p.nx * 1300, y: p.y + p.ny * 1300 }); IC.addTask(S, 'cas', { front: fA }); }
  }
};
IC.techAir = function (S, id) {
  const fwd = S.byId.ab_fwd ? 'ab_fwd' : 'ab_rear', rear = S.byId.ab_rear ? 'ab_rear' : fwd;
  const add = (kind, name, base) => { S.roster.push(IC.newFlight(S, kind, name, base)); IC.assignSlots(S, IC.baseOf(S, base)); };
  if (id === 'x_isr') add('isr', 'REAPER 3', rear);
  if (id === 'f_aew') add('aew', 'SENTRY 2', fwd);
  if (id === 'f_atk') add('atk', 'TALON 3', fwd);
  if (id === 'f_ucav') { add('ucav', 'HAWK 2', rear); add('ucav', 'HAWK 3', rear); }
};

/* ---------- air tasking order ---------- */
IC.addTask = function (S, type, o) {
  const K = IC.TASK_KIND[type];
  const t = Object.assign({ id: IC.nid('task'), type, want: 1, pri: S.ato.length }, o);
  t.name = K.front ? `${K.name} · ${t.front.name}` : `${K.name} · ${IC.nearestPlace(S, t.x, t.y)}`;
  S.ato.push(t);
  IC.log(S, 'info', 'ATO', `Standing task added: ${t.name}.`);
  IC.emit(S, 'task', t);
  return t;
};
IC.removeTask = function (S, t) {
  S.ato = S.ato.filter(x => x !== t);
  for (const a of S.air) if (a.task === t) { a.task = null; IC.recallAir(S, a); }
};
function taskPoint(S, task) {
  if (!IC.TASK_KIND[task.type].front) return { x: task.x, y: task.y };
  const f = task.front;
  const si = bestSector(S, f);
  const G = IC.secGeom(f, si);
  const off = task.type === 'interdict' ? -900 : -160;
  return { x: G.x + G.nx * off, y: G.y + G.ny * off, si };
}
IC.taskPoint = taskPoint;
function bestSector(S, f) {
  let best = 0, bs = -1e9;
  f.sectors.forEach((s, i) => { const sc = (s.eAttack ? 3 : 0) + s.E - s.F * 0.3 + (s.usAttack ? 1 : 0); if (sc > bs) { bs = sc; best = i; } });
  return best;
}
function effWant(task) {
  if (!IC.TASK_KIND[task.type].front) return task.want;
  const s = task.front.airShare;
  return Math.max(0, task.want + (s >= 0.65 ? 1 : 0) + (s >= 0.85 ? 1 : 0) - (s <= 0.25 ? 1 : 0));
}
function dispatch(S) {
  const order = S.ato.slice().sort((a, b) => (IC.TASK_KIND[b.type].front ? b.front.airShare : 0.5) - (IC.TASK_KIND[a.type].front ? a.front.airShare : 0.5));
  const wx = IC.wx(S);
  for (const task of order) {
    const K = IC.TASK_KIND[task.type];
    if (K.front && !task.front.active) continue;
    const p = taskPoint(S, task);
    const covering = S.air.filter(a => a.task === task && !a.dead && a.state !== 'rtb' && a.fuel > U.dist(a, p) / IC.AIR_KIND[a.kind].spd * 1.3 + 600).length;
    if (covering >= effWant(task)) continue;
    let best = null, bs = 1e12;
    for (const r of S.roster) {
      if (r.st !== 'ready' || !K.roles.includes(r.kind) || !IC.canLaunch(S, r)) continue;
      if (r.kind === 'atk' && !wx.heli) continue;
      if (task.type === 'cap' && r.load === 'strike') continue;
      const b = IC.baseOf(S, r.base), d = U.dist(b, p), A = IC.AIR_KIND[r.kind];
      if (A.reach && d > A.reach) continue;
      const pref = task.type === 'cas' ? { atk: 0, ucav: 500, ftr: 900 }[r.kind] : task.type === 'isr' ? { isr: 0, ucav: 400 }[r.kind] : 0;
      if (d + pref < bs) { bs = d + pref; best = r; }
    }
    if (!best) continue;
    const mission = { cap: { type: 'cap', x: p.x, y: p.y }, aew: { type: 'orbit', x: p.x, y: p.y }, isr: { type: 'isr', x: p.x, y: p.y }, cas: { type: 'cas', front: task.front }, interdict: { type: 'interdict', front: task.front } }[task.type];
    const a = IC.launchAir(S, best, mission, true);
    if (a) a.task = task;
  }
}

IC.missionOk = function (S, r, type) {
  const K = IC.AIR_KIND[r.kind];
  if (type === 'strike' && r.kind === 'ftr' && r.load !== 'strike') return 'Needs the strike loadout';
  if ((type === 'hstrike' || type === 'hlift') && !IC.wx(S).heli && (r.kind === 'atk' || r.kind === 'heli')) return 'Weather grounds helicopters';
  const b = IC.baseOf(S, r.base);
  if (!IC.canLaunch(S, r)) return b && b.parts && !IC.baseStatus(S, b).runway ? 'Runway closed' : b && b.parts ? IC.milLaunchBlock(S, b, r) || 'Runway too short' : 'Base unavailable';
  if (r.st !== 'ready') return r.st === 'turn' ? 'Rearming' : r.st === 'air' ? (r.ent && r.ent.gnd ? 'Taxiing' : 'Airborne') : 'Lost';
  if (b && b.parts) { const why = IC.milLaunchBlock(S, b, r); if (why) return why; }
  return K ? '' : 'Unknown aircraft';
};

IC.launchAir = function (S, r, mission, auto) {
  const b = IC.baseOf(S, r.base);
  if (!b || r.st !== 'ready' || !IC.canLaunch(S, r)) return null;
  const K = IC.AIR_KIND[r.kind];
  const n = r.n || K.n, L = r.load ? IC.LOADOUTS[r.load] : null;
  const aamPer = L ? (IC.hasTech(S, 'f_aam') && r.load === 'aa' ? 6 : L.aam) : 0;
  const a = { id: IC.nid('a'), kind: r.kind, r, name: r.name, x: b.x, y: b.y, vx: 0, vy: 0, h: b.rwyA != null ? b.rwyA : -Math.PI / 2, state: 'out', mission,
    fuel: K.endur, aam: r.kind === 'ftr' ? aamPer * n : 0, gbu: L ? L.gbu * n : r.kind === 'ucav' ? 2 : 0, runs: RUNS[r.kind] || 0, hp: n, n,
    cm: Math.round((K.cm || 0) * n * (IC.hasTech(S, 'f_cm') ? 1.5 : 1)), cool: 0, oa: Math.random() * 6, scan: 0, notchT: 0,
    alt: r.kind === 'heli' || r.kind === 'atk' ? 0.15 : r.kind === 'ucav' || r.kind === 'isr' ? 5 : 8, roe: r.roe };
  // jets taxi out along the base's own taxiways before they are airborne
  if (b.parts && !IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]].vtol) {
    if (!IC.milDepart(S, b, a)) return null;
  }
  r.st = 'air'; r.ent = a;
  S.air.push(a);
  S.budget -= SORTIE_COST[r.kind] || 0;
  const what = { cap: `patrol over ${IC.nearestPlace(S, mission.x, mission.y)}`, intercept: `intercept TN ${mission.track && mission.track.tn}`,
    strike: `strike on ${mission.site && mission.site.name}`, orbit: `early-warning orbit`, isr: `reconnaissance near ${IC.nearestPlace(S, mission.x, mission.y)}`,
    cas: `close air support, ${mission.front && mission.front.name}`, interdict: `interdiction behind the ${mission.front && mission.front.name}`,
    hstrike: `attack on ${mission.g && mission.g.name}`, hlift: `${mission.cargo && IC.HLIFT[mission.cargo].name.toLowerCase()} for ${mission.to && mission.to.name}` }[mission.type];
  if (what && !auto) IC.log(S, 'info', 'AIR', a.gnd ? `${r.name} starting up (${U.dur(a.ground.t)} to engine start): ${what}.` : `${r.name} airborne: ${what}.`);
  IC.sfx && (r.kind === 'heli' || r.kind === 'atk' ? IC.sfx.rotor(b.x, b.y) : IC.sfx.jet(b.x, b.y));
  IC.emit(S, 'sortie', a);
  return a;
};
IC.recallAir = function (S, a) { if (a && !a.dead && a.state !== 'rtb' && !a.job) { a.state = 'rtb'; a.tgt = null; } };

IC.buyAircraft = function (S, kind, baseId) {
  const K = IC.AIR_KIND[kind];
  if (S.budget < K.buy) return false;
  S.budget -= K.buy;
  const n = S.roster.filter(r => r.kind === kind).length + 1;
  const r = IC.newFlight(S, kind, `${NAMES[kind]} ${n}`, baseId);
  r.st = 'turn'; r.t = 1800;
  S.roster.push(r);
  IC.assignSlots(S, IC.baseOf(S, baseId));
  IC.log(S, 'info', 'AIR', `${K.name} ordered for ${IC.baseOf(S, baseId).name}; ready in about ${U.dur(1800)}.`);
  return true;
};
IC.setLoadout = function (S, r, load) {
  if (r.kind !== 'ftr' || r.load === load || r.st === 'air' || r.st === 'lost') return false;
  r.load = load;
  r.st = 'turn'; r.t = Math.max(r.t || 0, 600);
  IC.log(S, 'info', 'AIR', `${r.name} re-arming with the ${IC.LOADOUTS[load].name.toLowerCase()} loadout.`);
  return true;
};

function land(S, a, base) {
  a.dead = true;
  const K = IC.AIR_KIND[a.kind];
  if (!a.r) return;
  a.r.n = a.hp; a.r.ent = null;
  if (a.hp <= 0) { a.r.st = 'lost'; return; }
  a.r.base = base.id;
  a.r.st = 'turn';
  a.r.t = K.turn * (base.parts ? IC.baseStatus(S, base).turn : 1) * (a.r.n < K.n ? 1.3 : 1);
  if (base.parts) { IC.assignSlots(S, base); if (base.parts && !IC.ACTYPES[IC.AIRKIND_TYPE[a.kind]].vtol) IC.aptTakeFuel(base, IC.ACTYPES[IC.AIRKIND_TYPE[a.kind]].fuel * (a.r.n || 1)); }
  IC.emit(S, 'landed', a);
}
IC.airLand = land;
function lostOne(S, a, why) {
  a.hp--;
  S.stats.acLost++;
  IC.explode(S, a.x, a.y, 1.1, 'air');
  if (a.hp > 0) { IC.log(S, 'leak', 'AIR', `${a.name} lost an aircraft to ${why}; ${a.hp} left.`, a); IC.emit(S, 'acLost', a); return; }
  a.dead = true;
  if (a.r) { a.r.st = 'lost'; a.r.ent = null; a.r.n = 0; }
  if (a.job) IC.failJob(S, a.job);
  IC.log(S, 'leak', 'LOST', `${a.name} shot down${why ? ' by ' + why : ''}.`, a);
  IC.news(S, `${S.world.names.H} ${IC.AIR_KIND[a.kind].name.toLowerCase()} lost ${IC.inHostile(a.x, a.y) ? 'over enemy territory' : 'in combat'}.`);
  IC.emit(S, 'acLost', a);
}
IC.airLostOne = lostOne;

function fighterRoe(S, a) { return a.roe && a.roe !== 'auto' ? a.roe : S.ad.roe; }
function airTargets(S, a, cx, cy, R) {
  let best = null, bd = 1e9;
  const roe = fighterRoe(S, a);
  for (const t of S.threats) {
    if (t.dead || !t.det || t.spoofed || t.decoyKnown) continue;
    if (t.aff === 'N' || t.aff === 'A') continue;
    if (!(t.aff === 'H' || (roe === 'free' && t.aff === 'S'))) continue;
    if (roe === 'hold') continue;
    const c = IC.classOf(t);
    if (!(c === 'air' || c === 'drone' || c === 'cm')) continue;
    if (U.dxy(t.x, t.y, cx, cy) > R) continue;
    if (t.home && t.border && IC.inHostile(t.x, t.y)) continue;
    const r = U.dist(a, t) - (c === 'air' ? 150 : 0);
    if (r < bd) { bd = r; best = t; }
  }
  return best;
}
function orbit(a, cx, cy, R, spd, dt) { a.oa += dt * spd / R; return { x: cx + Math.cos(a.oa) * R, y: cy + Math.sin(a.oa) * R }; }
function fireAAM(S, a, t) {
  a.aam--; a.cool = 25; t.inbound++; S.stats.fired++;
  const M = IC.MUN.AAM;
  S.missiles.push({ id: IC.nid('m'), mun: 'AAM', M, x: a.x, y: a.y, a: Math.atan2(t.y - a.y, t.x - a.x), spd: M.spd, target: t, life: 60, src: a.name, pk: M.pk * (1 - 0.4 * Math.pow(U.dist(a, t) / M.range, 2)), trailT: 0, side: 'us', tr: IC.newTrail(S, 'aam') });
  IC.sfx && IC.sfx.launch(a.x, a.y, 0.6);
}

IC.updateAir = function (S, dt) {
  for (const r of S.roster) if (r.st === 'turn') { r.t -= dt; if (r.t <= 0) r.st = 'ready'; }
  S.atoT = (S.atoT || 0) - dt;
  if (S.atoT <= 0) { S.atoT = 30; dispatch(S); }
  const wx = IC.wx(S);
  for (const a of S.air) {
    if (a.dead) continue;
    if (a.gnd) { if (a.ground && a.ground.dead && !a.dead && a.gnd) { a.gnd = false; } else { if (a.ground) { a.x = a.ground.x; a.y = a.ground.y; a.h = a.ground.h; } continue; } }
    const K = a.allied ? { spd: 1.7 } : IC.AIR_KIND[a.kind];
    let base = a.r ? IC.baseOf(S, a.r.base) : null;
    a.fuel -= dt;
    if (a.notchT > 0) a.notchT -= dt;
    if (base && a.state !== 'rtb' && !a.job && a.fuel < U.dist(a, base) / K.spd * 1.25 + 300) a.state = 'rtb';
    if ((a.kind === 'atk' || a.kind === 'heli') && !wx.heli && a.state !== 'rtb' && !a.allied) { a.state = 'rtb'; IC.log(S, 'warn', 'AIR', `${a.name} returning: weather grounds helicopters.`, a); }
    let tx = a.x, ty = a.y, spd = K.spd;
    const m = a.mission || {};

    if (a.route && a.route.length) {
      tx = a.route[0].x; ty = a.route[0].y;
      if (U.dxy(a.x, a.y, tx, ty) < spd * dt + 3) { a.x = tx; a.y = ty; a.route.shift(); if (!a.route.length) IC.airJobStep(S, a); continue; }
    } else if (a.wait > 0) { a.wait -= dt; if (a.wait <= 0) IC.airJobStep(S, a); continue; }
    else if (a.state === 'rtb') {
      if (!base) { a.dead = true; continue; }
      const AT = IC.ACTYPES[IC.AIRKIND_TYPE[a.kind]];
      if (base.parts && !AT.vtol && ((base.st.longest || 0) < AT.rwy || !IC.baseStatus(S, base).runway || a.holdT > 1200)) {
        const nb = IC.fallbackBase(S, a.r);
        if (nb !== a.r.base) { a.r.base = nb; IC.log(S, 'warn', 'AIR', `${a.name} diverting to ${IC.baseOf(S, nb).name}: ${a.holdT > 1200 ? 'held too long waiting for the runway' : 'runway closed'} at ${base.name}.`, a); base = IC.baseOf(S, nb); a.holdT = 0; }
        else if (U.dist(a, base) < 60 && (a.holdT > 1200 || a.fuel < 0)) {
          // nowhere else to go: an emergency landing on whatever is left of the runway
          if (Math.random() < 0.35) lostOne(S, a, 'an emergency landing');
          if (!a.dead) land(S, a, base);
          continue;
        }
      }
      tx = base.x; ty = base.y;
      if (base.parts && !AT.vtol && U.dxy(a.x, a.y, base.x, base.y) < 400) {
        const ap = IC.milApproach(S, base, a, dt);
        if (ap === true) continue;
        if (ap === 'divert') a.holdT = 1e4;
        else if (ap && ap.x != null) { tx = ap.x; ty = ap.y; if (ap.hold) spd = K.spd * 0.6; }
      } else if (U.dxy(a.x, a.y, tx, ty) < spd * dt + 5) { land(S, a, base); continue; }
    } else if (m.type === 'strike') {
      const s = m.site;
      if (!s || s.dead || s.destroyed || a.gbu <= 0) { a.state = 'rtb'; continue; }
      const aim = IC.aimOf(s);
      const dir = Math.atan2(aim.y - base.y, aim.x - base.x);
      const rp = { x: aim.x - Math.cos(dir) * 350, y: aim.y - Math.sin(dir) * 350 };
      tx = rp.x; ty = rp.y;
      if (U.dxy(a.x, a.y, rp.x, rp.y) < spd * dt + 10) {
        const rep = { id: IC.nid('bda'), target: s, what: 'guided bombs', by: a.name, n: a.gbu, hits: 0, dmg: 0, t: S.time, open: true };
        for (let i = 0; i < a.gbu; i++) S.strikes.push({ id: IC.nid('s'), mun: 'GBU', M: IC.GBU, x: a.x, y: a.y, aim: { x: aim.x + U.rand(-6, 6), y: aim.y + U.rand(-6, 6) }, target: s, src: a.name, age: -i * 6, side: 'us', rep, tr: null });
        IC.log(S, 'warn', 'STRIKE', `${a.name} released ${a.gbu} bombs on ${s.name}.`);
        a.gbu = 0;
        S.enemy.retaliate = Math.max(S.enemy.retaliate, 0.5);
        a.state = 'rtb';
      }
    } else if (m.type === 'cas' || m.type === 'interdict') {
      const f = m.front;
      if (!f.active) { a.state = 'rtb'; continue; }
      a.retaskT = (a.retaskT || 0) - dt;
      if (!a.st || a.retaskT <= 0) { a.retaskT = 900; a.st = taskPoint(S, { type: m.type, front: f }); }
      const R = a.kind === 'atk' ? 90 : 160;
      if (U.dxy(a.x, a.y, a.st.x, a.st.y) > R + 40) { a.state = 'out'; tx = a.st.x; ty = a.st.y; }
      else {
        a.state = 'station';
        const o = orbit(a, a.st.x, a.st.y, R, spd, dt); tx = o.x; ty = o.y;
        a.cool -= dt;
        if (a.cool <= 0 && a.runs > 0) {
          a.cool = a.kind === 'atk' ? 90 : a.kind === 'ucav' ? 200 : 120;
          a.runs--;
          if (m.type === 'cas') IC.casStrike(S, f, a.st.si, CAS_POW[a.kind] * a.hp / (a.n || 1), a.name);
          else interdictRun(S, a, f);
          if ((a.kind === 'atk' || a.kind === 'ftr') && groundFire(S, a, 0.02)) { if (a.dead) continue; }
          if (a.runs <= 0) a.state = 'rtb';
        }
      }
    } else if (m.type === 'hstrike') {
      // attack helicopters (or a strike drone) hunting an enemy brigade
      const g = m.g;
      if (!g || g.dead || a.runs <= 0) { a.state = 'rtb'; if (m.rep) IC.bdaReport(S, m.rep); continue; }
      const aim = a.found ? { x: g.x, y: g.y } : { x: g.kx, y: g.ky };
      const d = U.dxy(a.x, a.y, aim.x, aim.y);
      if (d > 45) { a.state = 'out'; tx = aim.x; ty = aim.y; if (!a.found && U.dist(a, g) < 180) { a.found = true; g.known = true; g.kx = g.x; g.ky = g.y; g.kt = S.time; } if (!a.found && d < 60) { a.found = U.dist(a, g) < 250; if (!a.found) { IC.log(S, 'info', 'AIR', `${a.name}: ${g.name} is not where it was reported. Returning.`, a); a.state = 'rtb'; continue; } } }
      else {
        a.state = 'station';
        const o = orbit(a, aim.x, aim.y, 35, spd, dt); tx = o.x; ty = o.y;
        a.cool -= dt;
        if (a.cool <= 0) {
          a.cool = 45; a.runs--;
          const armor = g.g.armor ? 1.5 : g.type === 'mech' ? 1.2 : 0.9;
          const pow = (a.kind === 'atk' ? 5.5 : 2.5) * armor * Math.max(0.5, a.hp / (a.n || 1));
          g.str -= pow; g.mor -= pow * 0.8; g.known = true; g.kx = g.x; g.ky = g.y; g.kt = S.time;
          if (!m.rep) m.rep = { id: IC.nid('bda'), target: g, what: 'helicopter attack', by: a.name, n: 0, hits: 0, dmg: 0, t: S.time, open: true };
          m.rep.n++; m.rep.hits++; m.rep.dmg += pow;
          for (let i = 0; i < 4; i++) S.fx.tracers.push({ x1: a.x, y1: a.y, x2: g.x + U.rand(-10, 10), y2: g.y + U.rand(-10, 10), t: 0, msl: true });
          IC.explode(S, g.x + U.rand(-12, 12), g.y + U.rand(-12, 12), 0.7, 'us');
          IC.explode(S, g.x + U.rand(-12, 12), g.y + U.rand(-12, 12), 0.5, 'us');
          IC.sfx && IC.sfx.launch(a.x, a.y, 0.5);
          if (groundFire(S, a, 0.06 * (g.ad || 1))) { if (a.dead) { if (m.rep) IC.bdaReport(S, m.rep); continue; } }
          if (a.runs <= 0) { a.state = 'rtb'; IC.bdaReport(S, m.rep); IC.emit(S, 'hstrike', { a, g, rep: m.rep }); }
        }
      }
    } else if (a.kind === 'ftr') {
      a.cool -= dt; a.scan -= dt;
      const cx = m.type === 'cap' ? m.x : a.x, cy = m.type === 'cap' ? m.y : a.y;
      if (m.type === 'intercept') {
        const t = m.track;
        if (!t || t.dead || (!t.det && !t.inView)) { m.type = 'cap'; m.x = a.x; m.y = a.y; m.track = null; }
        else if (t.aff === 'N' || t.aff === 'A' && t.vis) {
          IC.log(S, 'info', 'VID', `${a.name}: TN ${t.tn} is ${t.d.civil ? (t.type === 'ga' ? 'a light civil aircraft' : 'airliner ' + t.cs) : 'friendly'}. Resuming patrol.`, t);
          m.type = 'cap'; m.x = a.x; m.y = a.y; m.track = null;
        } else if (t.aff === 'H') a.tgt = t;
        else { a.state = 'vid'; spd = K.dash; tx = t.x; ty = t.y; if (!m.vidLog && U.dist(a, t) < 60) { m.vidLog = true; IC.log(S, 'info', 'VID', `${a.name} closing on TN ${t.tn} for a visual identification.`, t); } }
      }
      if (a.tgt && (a.tgt.dead || !a.tgt.det)) a.tgt = null;
      if (!a.tgt && a.scan <= 0 && a.aam > 0 && a.state !== 'vid') { a.scan = 10; a.tgt = airTargets(S, a, cx, cy, 700); }
      if (a.tgt) {
        a.state = 'engage'; spd = K.dash; tx = a.tgt.x; ty = a.tgt.y;
        const r = U.dist(a, a.tgt);
        if (r < IC.MUN.AAM.range * 0.85 && a.cool <= 0 && a.aam > 0 && a.tgt.inbound < 1 && fighterRoe(S, a) !== 'hold') fireAAM(S, a, a.tgt);
        if (a.aam <= 0) a.state = 'rtb';
      } else if (a.state !== 'vid' && m.type === 'cap') {
        if (U.dxy(a.x, a.y, m.x, m.y) > 230) { a.state = 'out'; tx = m.x; ty = m.y; }
        else { a.state = 'station'; const o = orbit(a, m.x, m.y, 200, spd, dt); tx = o.x; ty = o.y; }
      }
    } else if (a.kind === 'aew' || a.kind === 'isr' || a.kind === 'ucav') {
      const R = a.kind === 'aew' ? 180 : 330;
      if (U.dxy(a.x, a.y, m.x, m.y) > R + 20) { a.state = 'out'; tx = m.x; ty = m.y; }
      else { a.state = 'station'; const o = orbit(a, m.x, m.y, R, spd, dt); tx = o.x; ty = o.y; }
      if (a.kind !== 'aew') { a.scan -= dt; if (a.scan <= 0) { a.scan = 20; isrScan(S, a); } }
    }
    // a notching aircraft turns side-on to whatever is chasing it
    let want = Math.atan2(ty - a.y, tx - a.x);
    if (a.notchT > 0 && a.threatA != null) want = a.threatA + Math.PI / 2;
    const turn = a.kind === 'heli' || a.kind === 'atk' ? 1 : a.kind === 'ftr' ? 0.08 : 0.04;
    a.h = a.h + U.clamp(U.angWrap(want - a.h), -turn * dt, turn * dt);
    a.vx = Math.cos(a.h) * spd; a.vy = Math.sin(a.h) * spd;
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.alt > 6 && Math.random() < 0.3) { if (!a.con) a.con = IC.newTrail(S, 'con'); a.con.pts.push({ x: a.x, y: a.y, t: S.time }); if (a.con.pts.length > 40) a.con.pts.shift(); }
  }
  S.air = S.air.filter(a => !a.dead);

  // enemy missiles chasing our aircraft: our crews use flares, chaff and notching too
  for (const m of S.eaam) {
    const t = m.target; m.life -= dt;
    if (t.dead || m.life <= 0) { m.dead = true; continue; }
    const r = U.dist(m, t);
    m.a += U.clamp(U.angWrap(Math.atan2(t.y - m.y, t.x - m.x) - m.a), -dt, dt);
    m.x += Math.cos(m.a) * m.spd * dt; m.y += Math.sin(m.a) * m.spd * dt;
    if (!m.tr) m.tr = IC.newTrail(S, 'eaam');
    m.trT = (m.trT || 0) - dt; if (m.trT <= 0) { m.trT = 0.6; m.tr.pts.push({ x: m.x, y: m.y, t: S.time }); }
    if (r / m.spd < 5 && !m.cmDone) {
      m.cmDone = true;
      t.threatA = Math.atan2(m.y - t.y, m.x - t.x);
      if (t.kind === 'ftr' && !m.ir) { t.notchT = 12; m.pk *= 0.7; }
      if (t.cm > 0) { t.cm--; m.pk *= m.ir ? 0.5 : 0.7; if (m.ir) IC.flares(S, t); else IC.chaffFx(S, t); }
    }
    if (r < 8) {
      m.dead = true;
      if (Math.random() < m.pk) lostOne(S, t, m.ir ? 'a shoulder-fired missile' : 'an enemy fighter');
      else IC.text(S, m.x, m.y, 'EVADED', '#9fe0ff');
    }
  }
  S.eaam = S.eaam.filter(m => !m.dead);
};

/* low-level flights over the front take fire from enemy air defenses */
function groundFire(S, a, base) {
  let risk = base * IC.wx(S).ir;
  const nearAD = S.gunits.filter(g => g.side === 'them' && !g.dead && U.dist(g, a) < 260).reduce((s, g) => s + (g.ad || 1), 0);
  risk *= 0.5 + Math.min(2, nearAD * 0.5);
  if (Math.random() >= risk) return false;
  // an IR missile or gunfire comes up; flares help
  if (a.cm > 0) { a.cm--; IC.flares(S, a); if (Math.random() < 0.55) { IC.text(S, a.x, a.y, 'FLARES', '#ffd08a'); return false; } }
  lostOne(S, a, 'ground fire');
  return true;
}
IC.groundFire = groundFire;

function interdictRun(S, a, f) {
  const cv = S.evehicles.filter(v => !v.dead && v.known && U.dist(v, a) < 600);
  if (cv.length) { const v = U.pick(cv); IC.explode(S, v.x, v.y, 0.8, 'us'); IC.enemyConvoyHit(S, v, a.name); return; }
  const dep = S.esites.filter(s => s.nat === f.key && (s.kind === 'supply' || s.kind === 'staging') && !s.destroyed).sort((p, q) => U.dist(p, a) - U.dist(q, a))[0];
  if (dep && U.dist(dep, a) < 1300) { if (dep.pk < 2) { dep.pk = 2; IC.log(S, 'warn', 'ISR', `${a.name} found ${dep.name}.`, dep); } IC.siteDamaged(S, dep, 14, a.name); }
}

function isrScan(S, a) {
  const R = (a.kind === 'isr' && IC.hasTech(S, 'x_isr') ? 600 : 450) * IC.wx(S).eo;
  for (const s of S.esites) {
    if (U.dist(a, s) > R) continue;
    if (s.pk < 2) { s.pk = 2; IC.log(S, 'warn', 'ISR', `${a.name} located ${s.name}.`, s); IC.emit(S, 'siteFound', s); }
  }
  for (const tel of S.tels) {
    if (tel.dead || U.dist(a, tel) > R) continue;
    if (tel.state === 'hidden' || tel.state === 'reload') { if (Math.random() < 0.15) IC.revealLauncher(S, tel, `${a.name} (camouflaged)`); continue; }
    IC.revealLauncher(S, tel, a.name);
  }
}

})(window.IC);
