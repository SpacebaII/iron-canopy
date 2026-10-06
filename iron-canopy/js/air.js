/* Iron Canopy — the air wing. Flights of aircraft with loadouts; standing tasks (the air tasking order) are
   filled automatically and relieved before their fuel runs out, and the player can fly any mission by hand:
   intercept and identify, hold, escort, reconnaissance, strike.

   An intercept: IC.interceptPlan(S, who, track) says where and when a flight meets a track, the fuel it has left
   after, its weapons and its kill chance; IC.commitIntercept(S, who, track) sends it. who is a roster flight on the
   ground or an aircraft in the air. The flight flies to the predicted meeting point (recomputed as the track moves),
   identifies it by sight if nobody knows what it is, and fires when the rules allow and the target is in reach.
   Missile reach depends on both heights and on the target's aspect (IC.aamReach), from task 20's reach tables. */
(function (IC) {
'use strict';
const U = IC.U;
const SORTIE_COST = IC.SORTIE_COST = { ftr: 3, ucav: 0.6, aew: 5, tkr: 4, isr: 0.5, heli: 0.6, cargo: 2 };
const NAMES = { ftr: 'VIPER', ucav: 'HAWK', aew: 'SENTRY', tkr: 'TEXACO', isr: 'REAPER', heli: 'HOOK', cargo: 'ATLAS' };
IC.AIRKIND_TYPE.tkr = IC.AIRKIND_TYPE.tkr || 'heavy';

IC.newFlight = (S, kind, name, base) => ({ id: IC.nid('r'), kind, name, base, st: 'ready', t: 0, ent: null, n: IC.AIR_KIND[kind].n, nMax: IC.AIR_KIND[kind].n,
  load: kind === 'ftr' ? 'aa' : null, slot: null, roe: 'auto', alert: 30, fat: 0, back: [], rec: { kills: 0, fired: 0, defeated: 0 } });

IC.airInit = function (S, sandbox, academy, story) {
  const fwd = S.byId.ab_fwd ? 'ab_fwd' : 'ab_rear', rear = S.byId.ab_rear ? 'ab_rear' : fwd;
  const add = (kind, name, base) => S.roster.push(IC.newFlight(S, kind, name, base));
  S.pilots = { spare: IC.AIR_LOSS.pilots, trainT: IC.AIR_LOSS.train, rescue: [] };
  if (!academy && !story) {
    add('ftr', 'VIPER 1', fwd); add('ftr', 'VIPER 2', fwd); add('isr', 'REAPER 1', fwd); add('heli', 'HOOK 1', fwd);
    add('ftr', 'LANCE 1', rear); add('ftr', 'LANCE 2', rear); add('aew', 'SENTRY 1', fwd); add('tkr', 'TEXACO 1', rear); add('isr', 'REAPER 2', rear); add('cargo', 'ATLAS 1', rear); add('heli', 'HOOK 2', rear); add('ucav', 'HAWK 1', rear);
  }
  for (const b of IC.bases(S)) IC.assignSlots(S, b);
  if (sandbox) {
    const cap = IC.cap(S), fA = S.world.fronts.find(f => f.key === 'A');
    // over the forward air base: the capital is beyond the fighters' reach for a standing patrol
    const fb = IC.baseOf(S, fwd) || cap;
    IC.addTask(S, 'cap', { x: fb.x, y: fb.y });
    if (fA) { const p = fA.pts[Math.floor(fA.pts.length / 2)]; IC.addTask(S, 'aew', { x: p.x + p.nx * 1300, y: p.y + p.ny * 1300 }); }
  }
};
IC.techAir = function (S, id) {
  const fwd = S.byId.ab_fwd ? 'ab_fwd' : 'ab_rear', rear = S.byId.ab_rear ? 'ab_rear' : fwd;
  const add = (kind, name, base) => { S.roster.push(IC.newFlight(S, kind, name, base)); IC.assignSlots(S, IC.baseOf(S, base)); };
  if (id === 'x_isr') add('isr', 'REAPER 3', rear);
  if (id === 'f_aew') add('aew', 'SENTRY 2', fwd);
  if (id === 'f_ucav') { add('ucav', 'HAWK 2', rear); add('ucav', 'HAWK 3', rear); }
};

/* ---------- alert states and crews ---------- */
IC.alertOf = r => IC.ALERT[r.alert] ? r.alert : r.qra ? 5 : 30;
/* engine start for a flight: base is the base's own time for where it is parked */
IC.alertStartT = function (r, base) {
  const A = IC.ALERT[IC.alertOf(r)];
  const t = A.start != null ? Math.min(A.start, base) : base * A.k;
  return t * ((r.fat || 0) > IC.FATIGUE.tired ? 1.3 : 1);
};
IC.setAlert = function (S, r, lv) {
  if (r.kind !== 'ftr' || !IC.ALERT[lv]) return false;
  if (lv < 30 && (r.fat || 0) >= IC.FATIGUE.spent - 0.05) { IC.log(S, 'warn', 'AIR', `${r.name}: the crews are exhausted and must rest before going on alert.`); return false; }
  r.alert = lv; r.qra = lv === 5;
  IC.log(S, 'info', 'AIR', `${r.name} on ${IC.ALERT[lv].name} alert.`);
  return true;
};
function crews(S, dt) {
  const h = dt / 3600;
  for (const r of S.roster) {
    if (r.st === 'lost' || r.kind === 'isr' || r.kind === 'ucav') continue;
    const A = IC.ALERT[IC.alertOf(r)];
    const rate = r.st === 'air' ? IC.FATIGUE.fly : A.fat;
    r.fat = U.clamp((r.fat || 0) + rate * h, 0, 1);
    if (r.fat >= IC.FATIGUE.spent && IC.alertOf(r) < 30 && r.st !== 'air') {
      r.alert = 30; r.qra = false;
      IC.log(S, 'warn', 'AIR', `${r.name}: crews exhausted after long hours on alert. Stood down to 30-minute alert to rest (about ${U.dur(3600 * 0.6 / -IC.ALERT[30].fat)}).`);
    }
  }
}
/* losses: repairs and replacements come back over time; pilots are picked up and trained */
function losses(S, dt) {
  const P = S.pilots || (S.pilots = { spare: IC.AIR_LOSS.pilots, trainT: IC.AIR_LOSS.train, rescue: [] });
  P.trainT -= dt;
  if (P.trainT <= 0) { P.trainT = IC.AIR_LOSS.train; if (P.spare < 8) P.spare++; }
  if (P.rescue.length && P.rescue[0] <= S.time) { P.rescue.shift(); P.spare++; IC.log(S, 'info', 'AIR', 'A pilot who ejected has been picked up and is fit to fly again.'); }
  for (const r of S.roster) {
    if (!r.back || !r.back.length) continue;
    const due = r.back[0];
    if (due.t > S.time) continue;
    if (due.why === 'new' && P.spare <= 0) { due.t = S.time + 3600; continue; }
    r.back.shift();
    if (due.why === 'new') P.spare--;
    if (r.st === 'air') { r.pend = (r.pend || 0) + 1; continue; }
    r.n = Math.min(r.nMax || IC.AIR_KIND[r.kind].n, (r.n || 0) + 1);
    if (r.st === 'lost') { r.st = 'turn'; r.t = 600; }
    IC.log(S, 'info', 'AIR', `${r.name}: ${due.why === 'new' ? 'a replacement aircraft has arrived' : 'a repaired aircraft is back'} (${r.n} of ${r.nMax || r.n}).`);
  }
}
/* order what a flight is missing: repairs for the damaged, and new aircraft for the lost when money allows */
function orderBack(S, r, lost, damaged) {
  const K = IC.AIR_KIND[r.kind];
  r.back = r.back || [];
  for (let i = 0; i < damaged; i++) r.back.push({ t: S.time + IC.AIR_LOSS.repair, why: 'repair' });
  const cost = K.buy / K.n * IC.AIR_LOSS.replaceK;
  for (let i = 0; i < lost; i++) {
    if (S.budget < cost + 50) { IC.log(S, 'warn', 'AIR', `${r.name}: no money for a replacement aircraft (${U.money(cost)}).`); break; }
    IC.pay(S, 'buyUnits', cost);
    r.back.push({ t: S.time + IC.AIR_LOSS.replace, why: 'new' });
  }
  r.back.sort((a, b) => a.t - b.t);
}
IC.flightBackText = (S, r) => (r.back || []).map(b => `${b.why === 'new' ? 'a replacement' : 'one in repair'} in ${U.dur(Math.max(0, b.t - S.time))}`).join(', ');

/* ---------- missiles and reach ---------- */
/* how far a missile reaches from a shooter at altKm against a target: its row of IC.REACH at the target's height, and
   whether it comes at the shooter (head-on) or flies away (a tail chase). w: 'mrm' or 'srm' (ours), or an entry of
   IC.AAMS / IC.EAAMS. World units */
IC.aamReach = function (w, shooterAlt, t, shooter) {
  const W = typeof w === 'string' ? IC.AAMS[w] : w;
  const talt = t.alt || 0;
  // (below the table's lowest row the reach falls off, never to nothing)
  const lo = IC.REACH[W.reach][0];
  const R = talt < lo[0] ? lo[1] * 10 * Math.max(0.3, talt / lo[0]) : IC.reachAt(W.reach, talt);
  const high = 0.55 + 0.45 * U.clamp((shooterAlt || 0) / 10, 0, 1);
  let asp = 1;
  if (shooter) {
    const sp = Math.hypot(t.vx || 0, t.vy || 0);
    if (sp > 0.05) { const c = ((shooter.x - t.x) * t.vx + (shooter.y - t.y) * t.vy) / (sp * (U.dist(shooter, t) || 1)); asp = 0.45 + 0.55 * (1 + c) / 2; }
  }
  return R * high * asp;
};
/* one missile's kill chance at range r */
function shotPk(S, w, a, t, r, R) {
  const W = IC.AAMS[w], cls = IC.classOf ? IC.classOf(t) : t.d.cls;
  let pk = W.pk * (IC.MUN.AAM.vs[cls] != null ? IC.MUN.AAM.vs[cls] : 0.8) * (1 - 0.2 * Math.pow(U.clamp(r / (R || 1), 0, 1), 2));
  if (a && a.r && (a.r.fat || 0) > IC.FATIGUE.tired) pk *= 0.85;
  if (IC.hasTech(S, 'f_aam')) pk += 0.08;
  return U.clamp(pk, 0.05, 0.95);
}
/* a fighter's missile: launched at the fighter's own speed and height, it flies the energy model (flight.js) */
IC.launchAAM = function (S, a, t, W, o) {
  const R = IC.aamReach(W, a.alt, t, a), sp = Math.hypot(a.vx || 0, a.vy || 0);
  const m = IC.newMissile(S, Object.assign({ mun: W.short === 'SRM' ? 'SRM' : W === IC.AAMS.mrm ? 'AAM' : W.short, M: W, x: a.x, y: a.y, alt: a.alt || 0, a0: a.alt || 0, loft: W.seeker === 'IR' ? 0 : Math.min(3, U.dist(a, t) / 10 * 0.04),
    a: Math.atan2(t.y - a.y, t.x - a.x), spd: W.spd, target: t, src: a.name, by: a, ir: W.seeker === 'IR' }, o), Math.max(R, U.dist(a, t) * 1.05), sp);
  // a fighter's radar locking on is heard at once; an active seeker or a heat-seeker only close in (flight.js)
  m.launchSeen = W.seeker === 'ARH' && U.dist(a, t) < 250;
  return m;
};
function fireAAM(S, a, t, w) {
  const W = IC.AAMS[w], r = U.dist(a, t), R = IC.aamReach(w, a.alt, t, a);
  if (w === 'mrm') a.aam--; else a.srm--;
  a.cool = w === 'srm' ? 6 : 10; t.inbound++; S.stats.fired++;
  const m = IC.launchAAM(S, a, t, W, { pk: shotPk(S, w, a, t, r, R), side: 'us', tr: IC.newTrail(S, 'aam') });
  S.missiles.push(m);
  IC.sfx && IC.sfx.launch(a.x, a.y, 0.6);
  IC.emit(S, 'aamLaunch', { a, t, mun: m.mun, m });
}

/* ---------- intercept geometry ---------- */
/* where a pursuer at p flying at speed s meets a target at q moving at v: the time, or null if it cannot */
function meet(p, s, q, vx, vy) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const A = vx * vx + vy * vy - s * s, B = 2 * (dx * vx + dy * vy), C = dx * dx + dy * dy;
  let t;
  if (Math.abs(A) < 1e-9) t = B < 0 ? -C / B : null;
  else {
    const D = B * B - 4 * A * C;
    if (D < 0) return null;
    const r1 = (-B - Math.sqrt(D)) / (2 * A), r2 = (-B + Math.sqrt(D)) / (2 * A);
    t = Math.min(r1 > 0 ? r1 : Infinity, r2 > 0 ? r2 : Infinity);
    if (!isFinite(t)) return null;
  }
  return t != null && t >= 0 ? t : null;
}
IC.meetTime = meet;
const trackPos = t => ({ x: t.held ? t.px : t.x, y: t.held ? t.py : t.y });
const trackVel = t => ({ vx: t.svx != null ? t.svx : t.vx || 0, vy: t.svy != null ? t.svy : t.vy || 0 });
/* the time until a flight on the ground can be airborne */
IC.launchDelay = function (S, r) {
  const b = IC.baseOf(S, r.base);
  if (!b) return Infinity;
  let start = 300;
  if (b.parts) { const sn = IC.milStartNode(S, b, r); if (sn) start = sn.startT; }
  return (r.st === 'turn' ? r.t : 0) + IC.alertStartT(r, start) + (b.parts ? 150 : 30);
};
const flightOf = who => who && who.r && who.kind ? { a: who, r: who.r } : { a: who && who.st === 'air' && who.ent ? who.ent : null, r: who };
/* what an intercept would look like, before committing it */
IC.interceptPlan = function (S, who, t) {
  const { a, r } = flightOf(who);
  const K = IC.AIR_KIND[(a || r).kind];
  const P = { ok: false, why: '', t, grp: t.grp, n: t.grp ? t.grp.n : 1 };
  if (!K || (a || r).kind !== 'ftr') { P.why = 'Only fighters intercept'; return P; }
  if (!t.held || t.dead) { P.why = 'The track is lost'; return P; }
  let from, delay, fuel, aam, srm, alt, base = IC.baseOf(S, r.base);
  if (a) { from = { x: a.x, y: a.y }; delay = a.gnd ? 120 : 0; fuel = a.fuel; aam = a.aam; srm = a.srm || 0; alt = a.alt; }
  else {
    const why = IC.missionOk(S, r, 'intercept');
    if (why && r.st !== 'turn') { P.why = why; return P; }
    if (!base) { P.why = 'Base unavailable'; return P; }
    const L = IC.LOADOUTS[r.load || 'aa'];
    from = { x: base.x, y: base.y }; delay = IC.launchDelay(S, r); fuel = K.endur;
    aam = (IC.hasTech(S, 'f_aam') && r.load === 'aa' ? 6 : L.aam) * r.n; srm = (L.srm || 0) * r.n; alt = K.alt;
  }
  const q = trackPos(t), v = trackVel(t);
  const q0 = { x: q.x + v.vx * delay, y: q.y + v.vy * delay };
  const tau = meet(from, K.dash, q0, v.vx, v.vy);
  if (tau == null) { P.why = 'It is faster than our fighters and flying away: they cannot catch it'; return P; }
  P.x = q0.x + v.vx * tau; P.y = q0.y + v.vy * tau; P.delay = delay; P.tau = tau; P.T = delay + tau;
  P.fuelAt = fuel - tau * IC.DASH_BURN;
  P.fuelBack = base ? P.fuelAt - 400 - U.dxy(P.x, P.y, base.x, base.y) / K.spd * 1.1 : P.fuelAt;
  P.aam = aam; P.srm = srm;
  P.reach = IC.aamReach('mrm', alt, { alt: t.alt || 0, vx: v.vx, vy: v.vy, x: P.x, y: P.y }, from);
  const R = IC.aamReach('mrm', alt, { alt: t.alt || 0, vx: 0, vy: 0 }, null);
  P.reachWords = R > 0 ? `${U.km(R)} at its height${t.altKnown ? '' : ' (height guessed)'}` : 'out of reach at its height';
  // two missiles a target, while they last
  const p1 = shotPk(S, 'mrm', a || { r }, t, R * 0.6, R), p2 = 1 - (1 - p1) * (1 - p1);
  const shots = Math.floor((aam + srm) / 2);
  P.pk = R > 0 ? p2 : 0; P.kills = Math.min(P.n, shots) * P.pk;
  P.enough = shots >= P.n;
  P.late = t.tt && isFinite(t.tt.t) && t.tt.t < P.T ? t.tt.to : '';
  P.idFirst = t.aff !== 'H';
  P.weapons = (a ? (a.roe && a.roe !== 'auto' ? a.roe : S.ad.roe) : (r.roe && r.roe !== 'auto' ? r.roe : S.ad.roe));
  P.ok = P.fuelAt > 300;
  if (!P.ok) P.why = 'Not enough fuel to get there';
  return P;
};
IC.commitIntercept = function (S, who, t) {
  const { a, r } = flightOf(who);
  const P = IC.interceptPlan(S, who, t);
  if (!P.ok) { IC.log(S, 'warn', 'AIR', `${(a || r).name} cannot intercept TN ${t.tn}: ${P.why.toLowerCase()}.`); return null; }
  const mission = { type: 'intercept', track: t, grp: !!t.grp, x: P.x, y: P.y, orderT: S.time };
  let x = a;
  if (a) { a.task = null; a.mission = mission; a.state = 'out'; a.tgt = null; a.refuel = null; }
  else x = IC.launchAir(S, r, mission);
  if (!x) return null;
  const what = t.grp ? `group of ${t.grp.n} led by TN ${t.tn}` : `TN ${t.tn}`;
  IC.log(S, 'info', 'AIR', `${x.name} committed on ${what}: meets it in about ${U.dur(P.T)} ${IC.nearPlace(S, P.x, P.y)}.`, t);
  IC.emit(S, 'commit', { a: x, t });
  return x;
};
/* the flight that meets a track soonest: fighters in the air not already busy, then flights ready on the ground */
IC.bestInterceptor = function (S, t) {
  let best = null, bt = Infinity;
  const cand = S.air.filter(a => a.kind === 'ftr' && a.r && !a.dead && a.state !== 'rtb' && a.state !== 'engage' && (a.aam > 0 || a.srm > 0) && !(a.mission && a.mission.type === 'intercept' && a.mission.track && !a.mission.track.dead && a.mission.track !== t))
    .concat(S.roster.filter(r => r.kind === 'ftr' && r.st === 'ready'));
  for (const w of cand) { const P = IC.interceptPlan(S, w, t); if (P.ok && P.T < bt) { bt = P.T; best = w; } }
  return best;
};
/* hold where it is, or at a point: a racetrack orbit until told otherwise or short of fuel */
IC.holdAir = function (S, a, p) {
  if (!a || a.dead || a.job) return;
  a.task = null; a.tgt = null; a.refuel = null;
  a.mission = { type: 'hold', x: p ? p.x : a.x, y: p ? p.y : a.y };
  a.state = 'out';
  IC.log(S, 'info', 'AIR', `${a.name} holding ${IC.nearPlace(S, a.mission.x, a.mission.y)}.`);
};
IC.escortAir = function (S, a, who) {
  if (!a || a.dead || a.kind !== 'ftr' || !who || who === a) return false;
  a.task = null; a.tgt = null; a.mission = { type: 'escort', who }; a.state = 'out';
  IC.log(S, 'info', 'AIR', `${a.name} escorting ${who.name}.`);
  return true;
};

/* ---------- air tasking order ---------- */
IC.addTask = function (S, type, o) {
  const K = IC.TASK_KIND[type];
  const t = Object.assign({ id: IC.nid('task'), type, want: 1, pri: S.ato.length }, o);
  t.name = `${K.name} · ${IC.nearestPlace(S, t.x, t.y)}`;
  S.ato.push(t);
  IC.log(S, 'info', 'ATO', `Standing task added: ${t.name}.`);
  IC.emit(S, 'task', t);
  return t;
};
IC.removeTask = function (S, t) {
  S.ato = S.ato.filter(x => x !== t);
  for (const a of S.air) if (a.task === t) { a.task = null; IC.recallAir(S, a); }
};
const bingo = (a, base, K) => U.dist(a, base) / K.spd * 1.25 + 300;
/* how long an aircraft can stay at point p before it must head home */
IC.leaveIn = function (S, a, p) {
  const K = IC.AIR_KIND[a.kind], base = a.r ? IC.baseOf(S, a.r.base) : null;
  if (!base) return a.fuel;
  const get = a.state === 'station' ? 0 : U.dist(a, p) / K.spd;
  return a.fuel - get - U.dist(p, base) / K.spd * 1.25 - 300;
};
const canCover = (A, d) => A.endur - d / A.spd * 2.25 - 300 >= 600;
function reliefFor(S, task) {
  const K = IC.TASK_KIND[task.type];
  let best = null, bs = 1e12;
  for (const r of S.roster) {
    if (r.st !== 'ready' && r.st !== 'turn' || !K.roles.includes(r.kind) || !IC.canLaunch(S, r)) continue;
    if (task.type === 'cap' && r.load === 'strike') continue;
    if (r.st === 'ready' && IC.missionOk(S, r, 'cap')) continue;
    const b = IC.baseOf(S, r.base), A = IC.AIR_KIND[r.kind], d = U.dist(b, task);
    if (A.reach && d > A.reach) continue;
    // one that would have to turn home within 10 minutes of getting there is no cover
    if (!canCover(A, d)) continue;
    const lead = IC.launchDelay(S, r) + d / A.spd;
    const pref = (task.type === 'isr' ? { isr: 0, ucav: 400 }[r.kind] : 0) + (r.fat || 0) * 600;
    if (lead + pref < bs) { bs = lead + pref; best = { r, lead }; }
  }
  return best;
}
/* what a standing task looks like: who is on it, how long they can stay, when the relief must go */
IC.taskStatus = function (S, task) {
  const on = S.air.filter(a => a.task === task && !a.dead && a.state !== 'rtb').map(a => ({ a, left: IC.leaveIn(S, a, task) }));
  const rel = reliefFor(S, task);
  const lead = rel ? rel.lead : 0;
  const soonest = on.length ? Math.min(...on.map(o => o.left)) : 0;
  // no flight of the right kind can reach the station and stay there
  const K = IC.TASK_KIND[task.type], far = !rel && !S.roster.some(r => K.roles.includes(r.kind) && r.st !== 'lost' && canCover(IC.AIR_KIND[r.kind], U.dist(IC.baseOf(S, r.base), task)));
  return { on, relief: rel && rel.r, lead, launchIn: rel ? Math.max(0, soonest - lead - 300) : null, emptyIn: soonest, far };
};
function dispatch(S) {
  for (const task of S.ato) {
    const on = S.air.filter(a => a.task === task && !a.dead && a.state !== 'rtb');
    const rel = reliefFor(S, task);
    if (!rel || rel.r.st !== 'ready') continue;
    // an aircraft counts as cover only if it can stay until a relief could be there, with 5 minutes to spare
    const covering = on.filter(a => IC.leaveIn(S, a, task) > rel.lead + 300).length;
    if (covering >= task.want) continue;
    const mission = { cap: { type: 'cap', x: task.x, y: task.y }, aew: { type: 'orbit', x: task.x, y: task.y }, isr: { type: 'isr', x: task.x, y: task.y }, tanker: { type: 'tanker', x: task.x, y: task.y } }[task.type];
    const a = IC.launchAir(S, rel.r, mission, true);
    if (a) { a.task = task; if (on.length) a.relieving = true; }
  }
  // once the relief is on station, the one with the least fuel goes home
  for (const task of S.ato) {
    const st = S.air.filter(a => a.task === task && !a.dead && a.state === 'station');
    if (st.length <= task.want) continue;
    st.sort((p, q) => p.fuel - q.fuel);
    const old = st[0], nu = st.find(a => a.relieving) || st[st.length - 1];
    nu.relieving = false;
    old.state = 'rtb'; old.task = null;
    IC.log(S, 'info', 'ATO', `${old.name} relieved on ${task.name} by ${nu.name}; returning with ${U.dur(old.fuel)} of fuel.`);
  }
}

IC.missionOk = function (S, r, type) {
  const K = IC.AIR_KIND[r.kind];
  if (type === 'strike' && r.kind === 'ftr' && r.load !== 'strike') return 'Needs the strike loadout';
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
    fuel: K.endur, aam: r.kind === 'ftr' ? aamPer * n : 0, srm: r.kind === 'ftr' && L ? (L.srm || 0) * n : 0, gbu: L ? L.gbu * n : r.kind === 'ucav' ? 2 : 0, hp: n, n, dmg: 0,
    cm: Math.round((K.cm || 0) * n * (IC.hasTech(S, 'f_cm') ? 1.5 : 1)), cool: 0, oa: Math.random() * 6, scan: 0, notchT: 0, mslIn: null, def: null, defT: 0, cmT: 0, defended: 0, lockBy: null, lockT: -1e9,
    alt: K.alt || 8, roe: r.roe, give: K.give || 0 };
  if (mission && mission.orderT == null) mission.orderT = S.time;
  // jets taxi out along the base's own taxiways before they are airborne
  if (b.parts && !IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]].vtol) {
    if (!IC.milDepart(S, b, a)) return null;
  }
  r.st = 'air'; r.ent = a;
  S.air.push(a);
  IC.pay(S, 'upAir', SORTIE_COST[r.kind] || 0);
  const what = { cap: `patrol ${IC.nearPlace(S, mission.x, mission.y)}`, intercept: `intercept TN ${mission.track && mission.track.tn}`,
    strike: `strike on ${mission.site && mission.site.name}`, orbit: `early-warning orbit`, tanker: `tanker track ${IC.nearPlace(S, mission.x, mission.y)}`,
    isr: `reconnaissance ${IC.nearPlace(S, mission.x, mission.y)}`, escort: `escort for ${mission.who && mission.who.name}` }[mission.type];
  if (what && !auto) IC.log(S, 'info', 'AIR', a.gnd ? `${r.name} starting up (${U.dur(a.ground.t)} to engine start): ${what}.` : `${r.name} airborne: ${what}.`);
  IC.sfx && (r.kind === 'heli' ? IC.sfx.rotor(b.x, b.y) : IC.sfx.jet(b.x, b.y));
  IC.emit(S, 'sortie', a);
  return a;
};
IC.recallAir = function (S, a) { if (a && !a.dead && a.state !== 'rtb' && !a.job) { a.state = 'rtb'; a.tgt = null; a.refuel = null; } };

IC.buyAircraft = function (S, kind, baseId) {
  const K = IC.AIR_KIND[kind];
  if (S.budget < K.buy) return false;
  IC.pay(S, 'buyUnits', K.buy);
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
  const r = a.r, dmg = Math.min(a.dmg || 0, a.hp);
  r.n = a.hp - dmg + (r.pend || 0); r.pend = 0; r.ent = null;
  if (dmg) { orderBack(S, r, 0, dmg); IC.log(S, 'info', 'AIR', `${r.name}: ${dmg} damaged aircraft in repair for ${U.dur(IC.AIR_LOSS.repair)}.`); }
  if (r.n <= 0) { r.st = 'lost'; return; }
  r.base = base.id;
  r.st = 'turn';
  r.t = K.turn * (base.parts ? IC.baseStatus(S, base).turn : 1) * (r.n < (r.nMax || K.n) ? 1.3 : 1);
  if (base.parts) { IC.assignSlots(S, base); if (base.parts && !IC.ACTYPES[IC.AIRKIND_TYPE[a.kind]].vtol) IC.aptTakeFuel(base, IC.ACTYPES[IC.AIRKIND_TYPE[a.kind]].fuel * (r.n || 1)); }
  IC.emit(S, 'landed', a);
}
IC.airLand = land;
function lostOne(S, a, why) {
  a.hp--;
  S.stats.acLost++;
  IC.explode(S, a.x, a.y, 1.1, 'air');
  // the crew: an ejection over our side is a pilot saved; over theirs, a prisoner
  if (a.r && S.pilots && Math.random() < IC.AIR_LOSS.eject) {
    if (IC.inHostile(a.x, a.y)) IC.news(S, `${S.world.names.A} claims to have captured one of our pilots.`);
    else { S.pilots.rescue.push(S.time + IC.AIR_LOSS.rescue); S.pilots.rescue.sort((p, q) => p - q); }
  }
  if (a.r) orderBack(S, a.r, 1, 0);
  if (a.hp > 0) { IC.log(S, 'leak', 'AIR', `${a.name} lost an aircraft to ${why}; ${a.hp} left.`, a); IC.emit(S, 'acLost', a); return; }
  a.dead = true;
  if (a.r) { a.r.st = 'lost'; a.r.ent = null; a.r.n = 0; a.r.alert = 30; }
  if (a.job) IC.failJob(S, a.job);
  IC.log(S, 'leak', 'LOST', `${a.name} shot down${why ? ' by ' + why : ''}.`, a);
  IC.news(S, `${S.world.names.H} ${IC.AIR_KIND[a.kind].name.toLowerCase()} lost ${IC.inHostile(a.x, a.y) ? 'over enemy territory' : 'in combat'}.`);
  IC.emit(S, 'acLost', a);
}
IC.airLostOne = lostOne;

/* ---------- fighters ---------- */
function fighterRoe(S, a) { return a.roe && a.roe !== 'auto' ? a.roe : S.ad.roe; }
function mayShoot(S, a, t) {
  const roe = fighterRoe(S, a);
  if (roe === 'hold' || t.aff === 'N' || t.aff === 'A' || t.decoyKnown) return false;
  // a track the fighter was sent to identify is never shot before someone knows what it is, unless ordered
  if (a.mission && a.mission.track === t && t.aff !== 'H' && !(roe === 'free' && a.tgt === t)) return false;
  return t.aff === 'H' || (roe === 'free' && t.aff === 'S');
}
function airTargets(S, a, cx, cy, R, only) {
  let best = null, bd = 1e9;
  for (const t of only || S.threats) {
    if (t.dead || !t.det || t.spoofed || t.decoyKnown) continue;
    if (!mayShoot(S, a, t)) continue;
    const c = IC.classOf(t);
    if (!(c === 'air' || c === 'drone' || c === 'cm' || c === 'heli')) continue;
    if (U.dxy(t.x, t.y, cx, cy) > R) continue;
    if (t.home && t.border && IC.inHostile(t.x, t.y)) continue;
    const r = U.dist(a, t) - (c === 'air' ? 150 : 0);
    if (r < bd) { bd = r; best = t; }
  }
  return best;
}
function orbit(a, cx, cy, R, spd, dt) { a.oa += dt * spd / R; return { x: cx + Math.cos(a.oa) * R, y: cy + Math.sin(a.oa) * R }; }
/* the nearest tanker on station with fuel to give */
function tankerNear(S, a, maxD) {
  let best = null, bd = maxD;
  for (const k of S.air) if (k.kind === 'tkr' && !k.dead && !k.gnd && k.state === 'station' && k.give > 600) { const d = U.dist(a, k); if (d < bd) { bd = d; best = k; } }
  return best;
}
/* fly to the tanker, take fuel for three minutes, go back to the job */
function refuel(S, a, K, dt) {
  const k = a.refuel;
  if (!k || k.dead || k.give <= 0) { a.refuel = null; return null; }
  const d = U.dist(a, k);
  if (d > 25) { a.state = 'refuel'; a.refT = 0; return { x: k.x, y: k.y, spd: K.spd }; }
  a.refT = (a.refT || 0) + dt;
  a.state = 'refuel';
  if (a.refT >= 180) {
    const take = Math.min(K.endur - a.fuel, k.give);
    a.fuel += take; k.give -= take; a.refuel = null; a.refT = 0; a.state = 'out';
    IC.log(S, 'info', 'AIR', `${a.name} took ${U.dur(take)} of fuel from ${k.name}.`, a);
    return null;
  }
  return { x: k.x + Math.cos(k.h) * 4, y: k.y + Math.sin(k.h) * 4, spd: Math.hypot(k.vx, k.vy) || K.spd };
}
/* an intercept: fly to the predicted meeting point, look if nobody knows what it is, engage if allowed */
function intercept(S, a, K, m, dt) {
  const t = m.track;
  if (!t || t.dead || !t.held) {
    // contact lost: go to where it was going and hold there
    if (t && !t.dead && m.x != null) { IC.log(S, 'warn', 'AIR', `${a.name} lost TN ${t.tn}; holding at its last predicted position.`, a); }
    a.mission = { type: 'hold', x: m.x != null ? m.x : a.x, y: m.y != null ? m.y : a.y };
    return null;
  }
  // what we see with our own eyes settles it
  if ((t.aff === 'N' || t.aff === 'A') && t.vis && !m.vidDone) {
    m.vidDone = true;
    const off = t.plan ? IC.offRoute(t) : 0;
    IC.log(S, 'info', 'VID', `${a.name} has eyes on TN ${t.tn}: ${t.d.civil ? (t.type === 'ga' ? 'a light civil aircraft' : `airliner ${t.cs}, a passenger jet${off > 100 ? `, ${U.km(off)} off its route` : ''}`) : 'friendly'}. Not a threat: weapons stay cold.`, t);
    t.vidT = S.time;
    IC.emit(S, 'vid', { a, t, civil: true });
    a.mission = { type: 'hold', x: a.x, y: a.y };
    return null;
  }
  if (t.aff === 'H' && t.vis && !m.vidDone && m.idWanted) {
    m.vidDone = true;
    IC.log(S, 'warn', 'VID', `${a.name} has eyes on TN ${t.tn}: ${(IC.KLASS[t.klass] || t.d.name).toLowerCase()}${t.sq ? ` squawking ${t.sq}` : ', no transponder'}. HOSTILE.`, t);
    IC.emit(S, 'vid', { a, t, civil: false });
  }
  if (m.idWanted == null) m.idWanted = t.aff !== 'H';
  // steer for the meeting point, recomputed as the track moves
  m.upT = (m.upT || 0) - dt;
  if (m.upT <= 0) {
    m.upT = 2;
    const q = trackPos(t), v = trackVel(t), tau = meet(a, K.dash, q, v.vx, v.vy);
    if (tau != null) { m.x = q.x + v.vx * tau; m.y = q.y + v.vy * tau; m.tau = tau; }
    else { m.x = q.x; m.y = q.y; m.tau = U.dist(a, q) / K.dash; }
  }
  // close in: the target itself
  const q = trackPos(t);
  const near = U.dist(a, q) < 250;
  if (t.aff !== 'H' && !(a.tgt === t && fighterRoe(S, a) === 'free')) {
    a.state = 'vid';
    if (!m.vidLog && U.dist(a, q) < 60) { m.vidLog = true; IC.log(S, 'info', 'VID', `${a.name} closing on TN ${t.tn} for a visual identification.`, t); }
    return { x: near ? q.x : m.x, y: near ? q.y : m.y, spd: K.dash };
  }
  // hostile: fight it (or its group) when the rules allow; otherwise shadow it
  if (!mayShoot(S, a, t)) { a.state = 'escort'; const d = U.dist(a, q); return { x: q.x - (t.svx || 0) * 8, y: q.y - (t.svy || 0) * 8, spd: d > 40 ? K.dash : Math.max(K.spd * 0.6, Math.hypot(t.svx || 0, t.svy || 0)) }; }
  if (!a.tgt || a.tgt.dead) a.tgt = m.grp && t.grp ? airTargets(S, a, a.x, a.y, 1e9, t.grp.members) || (t.det ? t : null) : t.det ? t : null;
  a.state = 'out';
  return { x: near ? q.x : m.x, y: near ? q.y : m.y, spd: K.dash, fight: true };
}
/* choose and fire a missile at the current target when it is in reach */
function shoot(S, a) {
  const t = a.tgt;
  if (!t || a.cool > 0 || t.inbound >= 1 || !mayShoot(S, a, t)) return;
  const r = U.dist(a, t);
  if (a.srm > 0 && r <= IC.aamReach('srm', a.alt, t, a) * 0.9) fireAAM(S, a, t, 'srm');
  else if (a.aam > 0 && r <= IC.aamReach('mrm', a.alt, t, a) * 0.85) fireAAM(S, a, t, 'mrm');
}

IC.updateAir = function (S, dt) {
  for (const r of S.roster) if (r.st === 'turn') { r.t -= dt; if (r.t <= 0) r.st = 'ready'; }
  crews(S, dt);
  losses(S, dt);
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
    let tx = a.x, ty = a.y, spd = K.spd;
    const m = a.mission || {};
    // bingo: enough fuel to get home, or a tanker close enough to top up
    if (base && a.state !== 'rtb' && !a.job && !a.refuel && a.fuel < bingo(a, base, K) + (a.kind === 'ftr' ? 900 : 0)) {
      const k = a.kind === 'ftr' && a.state !== 'engage' && tankerNear(S, a, Math.min(2500, (a.fuel - 300) * K.spd * 0.5));
      if (k) { a.refuel = k; IC.log(S, 'info', 'AIR', `${a.name} going to ${k.name} for fuel.`, a); }
      else if (a.fuel < bingo(a, base, K)) { a.state = 'rtb'; if (a.task) a.task = null; }
    }
    if (a.kind === 'heli' && !wx.heli && a.state !== 'rtb' && !a.allied) { a.state = 'rtb'; IC.log(S, 'warn', 'AIR', `${a.name} returning: weather grounds helicopters.`, a); }

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
    } else if (a.refuel) {
      const g = refuel(S, a, K, dt);
      if (g) { tx = g.x; ty = g.y; spd = g.spd; }
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
    } else if (a.kind === 'ftr') {
      a.cool -= dt; a.scan -= dt;
      let go = m.type === 'intercept' ? intercept(S, a, K, m, dt) : null;
      const mm = a.mission || {}, hunting = mm.type !== 'intercept';
      if (a.tgt && (a.tgt.dead || !a.tgt.det)) a.tgt = null;
      // on patrol, on hold or escorting: look for trade inside the area
      const w = mm.type === 'escort' ? mm.who : null;
      const cx = w ? w.x : mm.type === 'cap' || mm.type === 'hold' ? mm.x : a.x, cy = w ? w.y : mm.type === 'cap' || mm.type === 'hold' ? mm.y : a.y;
      if (hunting && !a.tgt && a.scan <= 0 && (a.aam > 0 || a.srm > 0)) { a.scan = 10; a.tgt = airTargets(S, a, cx, cy, w ? 450 : 700); }
      if (a.tgt && (hunting || (go && go.fight))) {
        if (hunting || U.dist(a, a.tgt) < IC.aamReach('mrm', a.alt, a.tgt, a) * 1.2) { a.state = 'engage'; spd = K.dash; tx = a.tgt.x; ty = a.tgt.y; go = null; }
        shoot(S, a);
        if (a.aam <= 0 && a.srm <= 0) { a.state = 'rtb'; a.task = null; }
      }
      if (go) { tx = go.x; ty = go.y; spd = go.spd; }
      else if (a.state !== 'engage' && a.state !== 'rtb') {
        if (mm.type === 'cap' || mm.type === 'hold') {
          if (U.dxy(a.x, a.y, mm.x, mm.y) > 230) { a.state = 'out'; tx = mm.x; ty = mm.y; }
          else { a.state = 'station'; const o = orbit(a, mm.x, mm.y, 200, spd, dt); tx = o.x; ty = o.y; }
        } else if (mm.type === 'escort') {
          if (!w || w.dead) { a.mission = { type: 'hold', x: a.x, y: a.y }; IC.log(S, 'info', 'AIR', `${a.name}: escort ended, holding.`, a); }
          else if (U.dist(a, w) > 60) { a.state = 'out'; tx = w.x; ty = w.y; spd = K.dash; }
          else { a.state = 'escort'; const o = orbit(a, w.x, w.y, 40, spd, dt); tx = o.x; ty = o.y; }
        }
      }
      // fly at a height that suits the fight: a little above the target, otherwise cruise
      const altWant = a.tgt && a.tgt.alt != null ? U.clamp(a.tgt.alt + 1.5, 1, 13) : K.alt;
      a.alt += U.clamp(altWant - a.alt, -0.12 * dt, 0.12 * dt);
    } else if (a.kind === 'aew' || a.kind === 'isr' || a.kind === 'ucav' || a.kind === 'tkr') {
      const R = a.kind === 'aew' ? 180 : a.kind === 'tkr' ? 250 : 330;
      if (m.type === 'hold' || m.x != null) {
        if (U.dxy(a.x, a.y, m.x, m.y) > R + 20) { a.state = 'out'; tx = m.x; ty = m.y; }
        else { a.state = 'station'; const o = orbit(a, m.x, m.y, R, spd, dt); tx = o.x; ty = o.y; }
      }
      if (a.kind === 'isr' || a.kind === 'ucav') { a.scan -= dt; if (a.scan <= 0) { a.scan = 20; isrScan(S, a); } }
    }
    if (spd > K.spd * 1.05) a.fuel -= dt * (IC.DASH_BURN - 1);
    // a missile coming for it: the crew defends (flight.js): cranks, turns side-on and dives, drops chaff or flares,
    // turns away to run it out of energy, and turns back in when it is spent
    let want = Math.atan2(ty - a.y, tx - a.x);
    const D = a.mslIn || a.def ? IC.defendPlan(S, a, dt, a.kind === 'ftr' ? 0.75 : 0.5) : null;
    let turn = a.kind === 'heli' ? 1 : a.kind === 'ftr' ? 0.08 : 0.04;
    if (D && D.h != null) { want = D.h; turn = Math.max(turn, a.kind === 'ftr' ? IC.DEF.turn : 0.06); spd = Math.max(spd, K.dash || spd); }
    if (D && D.alt != null) a.alt = Math.max(D.alt, a.alt - 0.15 * dt);
    const dd = U.dxy(a.x, a.y, tx, ty);
    if (dd > 1e-6) a.h = a.h + U.clamp(U.angWrap(want - a.h), -turn * dt, turn * dt);
    const v = a.state === 'refuel' ? Math.min(spd, dd / dt) : spd;
    a.vx = Math.cos(a.h) * v; a.vy = Math.sin(a.h) * v;
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.alt > 6 && Math.random() < 0.3) { if (!a.con) a.con = IC.newTrail(S, 'con'); a.con.pts.push({ x: a.x, y: a.y, t: S.time }); if (a.con.pts.length > 40) a.con.pts.shift(); }
  }
  S.air = S.air.filter(a => !a.dead);

  // enemy missiles chasing our aircraft: they fly the same energy model, and our crews defend (above)
  for (const m of S.eaam) {
    const t = m.target; m.life -= dt;
    if (t.dead || m.life <= 0) { m.dead = true; continue; }
    if (!m.tr) m.tr = IC.newTrail(S, 'eaam');
    const res = IC.mslFly(S, m, dt);
    m.trT = (m.trT || 0) - dt; if (m.trT <= 0) { m.trT = 0.6; m.tr.pts.push({ x: m.x, y: m.y, t: S.time }); }
    if (!res) continue;
    m.dead = true; m.end = res;
    if (res.end === 'fuse' && Math.random() < IC.fusePk(m, res.d)) {
      IC.emit(S, 'mstat', { m, t, what: 'hit', text: 'HIT' });
      // some come home damaged
      if (t.r && Math.random() < IC.AIR_LOSS.damaged && (t.dmg || 0) < t.hp) { t.dmg = (t.dmg || 0) + 1; IC.text(S, m.x, m.y, 'DAMAGED', '#ffd08a'); IC.log(S, 'warn', 'AIR', `${t.name} hit: one aircraft damaged, returning to base.`, t); if (!t.job) { t.state = 'rtb'; t.task = null; } }
      else lostOne(S, t, m.ir ? 'a heat-seeking missile' : 'an enemy fighter');
    } else {
      const why = res.end === 'fuse' ? 'EVADED' : res.why;
      t.defended = (t.defended || 0) + 1;
      IC.text(S, m.x, m.y, why, '#9fe0ff'); IC.emit(S, 'mstat', { m, t, what: 'miss', text: why }); IC.emit(S, 'mslDefeated', { m, t, why });
    }
  }
  S.eaam = S.eaam.filter(m => !m.dead);
};

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
