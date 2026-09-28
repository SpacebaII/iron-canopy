/* Iron Canopy — call-in teams. A MANPADS team is not bought, moved or supplied: it is an ability. Pick a spot in
   our territory and a helicopter drops a team there in seconds; it fights drones, helicopters and low jets for a
   few minutes with its shoulder-fired missiles, then is lifted out. Charges come back on a timer. Research gives
   more teams, longer stays and better missiles. */
(function (IC) {
'use strict';
const U = IC.U;

IC.CALLIN = { cost: 3, charges: 2, recharge: 900, stay: 480, arrive: 25 };
/* teams can be called once there is a war to fight (and in the Academy and on the test range) */
IC.callInOpen = S => !!(S.enemy && S.enemy.war) || S.mode === 'academy' || !!S.range;

/* what the ability can do now, with the research done */
IC.callInStats = S => ({
  max: IC.CALLIN.charges + (IC.hasTech(S, 'c_teams') ? 1 : 0) + (IC.hasTech(S, 'c_teams2') ? 1 : 0),
  stay: IC.CALLIN.stay * (IC.hasTech(S, 'c_stay') ? 1.75 : 1),
  recharge: IC.CALLIN.recharge * (IC.hasTech(S, 'c_teams2') ? 0.7 : 1),
  mun: IC.hasTech(S, 'c_msl') ? 'IR2' : 'IR'
});
function state(S) {
  if (!S.callin) S.callin = { charges: IC.callInStats(S).max, t: 0, inbound: [], n: 0, used: 0 };
  return S.callin;
}
IC.callInState = state;

/* why a team cannot go to this spot now, or '' if it can */
IC.callInWhy = function (S, x, y) {
  const C = state(S);
  if (S.story && !(S.story.act >= 3)) return 'Call-in teams come with the war';
  if (C.charges < 1) return `No team free: the next is ready in ${U.dur(IC.callInStats(S).recharge - C.t)}`;
  if (S.budget < IC.CALLIN.cost) return `Needs ${U.money(IC.CALLIN.cost)}`;
  if (x == null) return '';
  if (!IC.inHome(x, y)) return 'Only inside our borders';
  if (S.world.inLake && S.world.inLake(x, y)) return 'Not on water';
  return '';
};

IC.callIn = function (S, x, y) {
  const why = IC.callInWhy(S, x, y);
  if (why) { IC.log(S, 'warn', 'CALL-IN', why + '.'); return null; }
  const C = state(S), A = IC.CALLIN;
  C.charges--; C.used++;
  IC.pay(S, 'buyUnits', A.cost);
  const job = { id: IC.nid('ci'), x, y, t: S.time + A.arrive, t0: S.time };
  C.inbound.push(job);
  IC.log(S, 'info', 'CALL-IN', `Missile team on its way to ${IC.nearestPlace(S, x, y)}: in position in ${U.dur(A.arrive)}.`, { x, y });
  IC.sfx && IC.sfx.rotor && IC.sfx.rotor(x, y);
  IC.emit(S, 'callIn', job);
  return job;
};

function arrive(S, job) {
  const C = state(S), K = IC.callInStats(S);
  const u = IC.makeUnit(S, 'manpads', job.x, job.y, { instant: true });
  C.n++;
  u.name = `TEAM ${C.n}`;
  u.callin = true; u.expire = S.time + K.stay; u.stay = K.stay;
  u.mags = [{ mun: K.mun, max: 3, mag: 3, storeMax: 3, store: 3, reload: 30, rl: 0, inc: 0 }];
  u.pri = false;
  IC.log(S, 'info', 'CALL-IN', `${u.name} in position ${IC.nearestPlace(S, u.x, u.y)}. It stays ${U.dur(K.stay)}.`, u);
  IC.emit(S, 'teamIn', u);
}
function dissolve(S, u, why) {
  u.dead = true;
  S.units = S.units.filter(x => x !== u);
  if (S.sel && S.sel.ref === u) S.sel = null;
  S.group = S.group.filter(x => x !== u);
  IC.log(S, 'info', 'CALL-IN', `${u.name} lifted out: ${why}.`, u);
  IC.emit(S, 'teamOut', u);
}

IC.reinforce = function (S, dt) {
  const C = state(S), K = IC.callInStats(S);
  if (C.charges < K.max) { C.t += dt; if (C.t >= K.recharge) { C.t = 0; C.charges++; } } else C.t = 0;
  if (C.inbound.length) {
    const due = C.inbound.filter(j => S.time >= j.t);
    if (due.length) { C.inbound = C.inbound.filter(j => S.time < j.t); for (const j of due) arrive(S, j); }
  }
  for (const u of S.units.slice()) {
    if (!u.callin) continue;
    if (S.time >= u.expire) dissolve(S, u, 'its time is up');
    else if (u.mags.every(m => m.mag + m.store <= 0) && S.time - u.lastFired > 20) dissolve(S, u, 'out of missiles');
  }
};

})(window.IC);
