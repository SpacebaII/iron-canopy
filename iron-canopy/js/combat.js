/* Iron Canopy — combat you can see (brief 43). What is coming at us and when it lands, what an enemy radar has locked
   on, the clock easing to a watchable speed while weapons fly (combat time), the running tally of a raid and its
   result card, the day's summary, the streak of raids held, and a record for every battery and flight. Headless:
   the map's warnings (render-warn.js) and the main loop only read what is kept here.
     IC.inbound(S)              hostile weapons we track and enemy missiles in the air, soonest first:
                                { o, kind: 'weapon' | 'drone' | 'missile', aim {x, y}, tgt (ours, or null), tti s }
     IC.lockedOn(S, x)          is one of our units or aircraft painted by an enemy radar (or homed on) now?
     IC.combatTime(S, box)      the fastest the clock should run while weapons fly near box (Infinity: no limit)
     IC.raidTally(S)            the raid in the air: { R, n, stopped, through, air }
     IC.raidResult(S, R, ops, success)  the result card's numbers when a raid ends (enemy.js calls it)
     IC.combat(S, dt)           the step: locks, warnings, sounds, records */
(function (IC) {
'use strict';
const U = IC.U;

/* how much quicker the clock may run than the next thing that happens: 30 game seconds of warning at 1×, so the
   next impact or intercept is always a few real seconds away; the last seconds of an intercept at half speed */
IC.COMBAT = { lead: 30, last: 8, slow: 0.5, margin: 600 };

/* ---------- what is coming ---------- */
/* hostile, or a weapon by its kind (a missile, a drone, a warhead) that nobody has called friendly or civil */
const WPN = { cm: 1, arm: 1, bal: 1, hgv: 1, rkt: 1, drone: 1 };
const hostile = t => !t.dead && t.held && !t.d.civil && t.aff !== 'N' && t.aff !== 'A' && t.aff !== 'F' && !t.decoyKnown && (t.aff === 'H' || t.fromHostile || WPN[t.d.cls]) && !(t.border && (t.mission === 'patrol' || t.mission === 'rtb'));
const isWeapon = t => t.d.dmg > 0 && t.d.cls !== 'air' && t.d.cls !== 'heli';
function aimOf(t) {
  if (t.d.move === 'bal' || t.d.move === 'hgv') return { x: t.x1 != null ? t.x1 : t.aim.x, y: t.y1 != null ? t.y1 : t.aim.y };
  if (t.prey && !t.prey.dead) return { x: t.prey.x, y: t.prey.y };
  return t.aim ? { x: t.aim.x, y: t.aim.y } : null;
}
IC.inbound = function (S) {
  const C = S._inb;
  if (C && C.t === S.time) return C.list;
  const list = [];
  for (const t of S.threats) {
    if (!hostile(t) || !isWeapon(t)) continue;
    const tti = t.prey ? U.dist(t, t.prey) / Math.max(0.1, t.spd * 1.4) : IC.timeToImpact(t);
    if (!(tti < 1e8)) continue;
    const tgt = t.target && t.target.x != null && (t.target.side === 'us' || S.units.includes(t.target)) ? t.target : t.prey || null;
    list.push({ o: t, kind: t.d.cls === 'drone' ? 'drone' : 'weapon', aim: aimOf(t), tgt, tti });
  }
  for (const m of S.eaam) if (!m.dead && m.target) list.push({ o: m, kind: 'missile', aim: { x: m.target.x, y: m.target.y }, tgt: m.target, tti: isFinite(m.tti) ? m.tti : U.dist(m, m.target) / Math.max(1, m.v || m.spd || 1) });
  list.sort((a, b) => a.tti - b.tti);
  S._inb = { t: S.time, list };
  return list;
};
IC.lockedOn = (S, x) => !!x && x.lockT != null && S.time - x.lockT < 3;

/* ---------- combat time ----------
   While hostile weapons fly near what the player is looking at, the clock runs no faster than keeps the next event
   (an impact, a missile reaching its target, a weapon entering our reach) a few real seconds away; it eases back
   up when they are gone. box: the view in world units, or null for the whole map */
IC.combatTime = function (S, box) {
  const C = IC.COMBAT;
  let soon = Infinity, close = false;
  const near = (x, y) => !box || (x > box.x0 - C.margin && x < box.x1 + C.margin && y > box.y0 - C.margin && y < box.y1 + C.margin);
  for (const it of IC.inbound(S)) {
    const o = it.o;
    if (!near(o.x, o.y) && !(it.aim && near(it.aim.x, it.aim.y))) continue;
    soon = Math.min(soon, it.tti);
    if (it.kind === 'missile' && it.tti < C.last) close = true;
  }
  for (const t of S.threats) if (hostile(t) && !isWeapon(t) && (t.d.cls === 'air' || t.d.cls === 'heli') && IC.inHome(t.x, t.y) && near(t.x, t.y)) soon = Math.min(soon, 120);
  for (const m of S.missiles) {
    if (m.dead || !near(m.x, m.y)) continue;
    const tti = m.pip ? m.pip.T - S.time : m.tti;
    if (!isFinite(tti)) { soon = Math.min(soon, 60); continue; }
    soon = Math.min(soon, tti);
    if (tti < C.last) close = true;
  }
  if (close) return C.slow;
  if (!isFinite(soon)) return Infinity;
  return Math.max(1, soon / C.lead);
};

/* ---------- the raid in the air ---------- */
const acDown = R => (R.ml || 0) + (R.escLost || 0) + (R.jamLost || 0);
IC.raidTally = function (S) {
  const E = S.enemy, R = E && E.cycle && E.cycle.phase === 'raid' ? E.cycle.R : null;
  if (!R) return null;
  const ops = E.ops.filter(o => o.raid === R);
  // (weapons count as launched; aircraft shot down are counted apart)
  const ac = acDown(R), n = ops.reduce((s, o) => s + o.launched, 0), stopped = Math.min(n, Math.max(0, ops.reduce((s, o) => s + o.lost, 0) - ac));
  const through = R.leaks.length, air = Math.max(0, n - stopped - through);
  return { R, n, stopped, through, air, ac };
};
/* the result card: what came, what we stopped, what got through and why, what it cost against what it saved, and a
   grade. Money spent is the interceptors fired; damage prevented what the weapons we stopped would have done */
const GRADE = [[0.9, 'A'], [0.75, 'B'], [0.6, 'C'], [0.4, 'D'], [-Infinity, 'F']];
IC.raidResult = function (S, R, ops, success) {
  // what came: every weapon in the air and every aircraft of the raid (enemy.js counts them), and at least what we
  // saw shot down or come through
  const came = Object.assign({}, R.came), seen = {};
  for (const L of R.leaks) seen[L.cls] = (seen[L.cls] || 0) + 1;
  for (const [cls, n] of Object.entries(R.downCls || {})) seen[cls] = (seen[cls] || 0) + n;
  for (const [cls, n] of Object.entries(seen)) came[cls] = Math.max(came[cls] || 0, n);
  // (weapons: what was launched, or what came if that is more, as with the jamming drones that fly with a raid)
  const wpn = Object.entries(came).reduce((s, [c, k]) => s + (c === 'air' || c === 'heli' ? 0 : k), 0);
  const ac = acDown(R), n = Math.max(wpn, ops.reduce((s, o) => s + o.launched, 0)), stopped = Math.min(n, Math.max(0, ops.reduce((s, o) => s + o.lost, 0) - ac)), hits = R.hits || 0;
  const stop = n ? Math.min(1, stopped / n) : 1, score = stop - Math.min(0.4, hits * 0.06) - (success ? 0.25 : 0);
  const grade = GRADE.find(([v]) => score >= v)[1];
  const held = !success && (stop >= 0.6 || hits <= 1);
  return { n, stopped, ac, through: R.leaks.length, hits, came, spent: R.spent || 0, rounds: R.rounds || 0, prevented: Math.round(R.prevented || 0), grade, held, success,
    why: [...new Set(R.leaks.map(L => L.why))].slice(0, 3) };
};
IC.RAID_WORDS = { drone: ['drone', 'drones'], cm: ['cruise missile', 'cruise missiles'], bal: ['ballistic missile', 'ballistic missiles'], hgv: ['glider', 'gliders'], arm: ['anti-radiation missile', 'anti-radiation missiles'], rkt: ['rocket', 'rockets'], air: ['aircraft', 'aircraft'], heli: ['helicopter', 'helicopters'] };
IC.raidCameText = res => Object.entries(res.came).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${k} ${(IC.RAID_WORDS[c] || ['weapon', 'weapons'])[k > 1 ? 1 : 0]}`).join(', ') || 'nothing';

/* what a weapon we stopped would have done (₭M): its warhead against what it was aimed at */
const worth = t => (t.d.dmg || 0) * (t.d.cls === 'bal' || t.d.cls === 'hgv' ? 2.2 : 1.4);

function rec(o) { return o.rec || (o.rec = { kills: 0, fired: 0, defeated: 0 }); }
const unitByName = (S, n) => S.units.find(u => u.name === n) || null;
const flightByName = (S, n) => S.roster.find(r => r.name === n) || null;

IC.on((S, type, d) => {
  const E = S.enemy;
  const R = E && E.cycle && E.cycle.phase === 'raid' ? E.cycle.R : E && E.raid;
  switch (type) {
    case 'launch': case 'aamLaunch': {
      // our missiles: what they cost, and the shooter's record
      const M = d.m && d.m.M, by = d.u || (d.a && d.a.r);
      if (by) rec(by).fired++;
      if (R && M) { R.spent = (R.spent || 0) + (M.cost || 0); R.rounds = (R.rounds || 0) + 1; }
      break;
    }
    case 'kill': {
      const t = d;
      if (t.op && t.op.raid) { const Q = t.op.raid; Q.prevented = (Q.prevented || 0) + worth(t); (Q.downCls || (Q.downCls = {}))[t.d.cls] = (Q.downCls[t.d.cls] || 0) + 1; }
      const who = t.killer && (unitByName(S, t.killer) || flightByName(S, t.killer));
      if (who) rec(who).kills++;
      // kill confirmation on the map: a burst and the word
      if (t.det || t.held) { IC.text(S, t.x, t.y, 'SPLASH', '#ffd27a'); (S.fx.splash || (S.fx.splash = [])).push({ x: t.x, y: t.y, t: S.time, tn: t.tn, type: t.type }); if (S.fx.splash.length > 40) S.fx.splash.shift(); }
      break;
    }
    case 'mslDefeated': {
      // one of ours beat a missile: the crew's record
      const t = d.t;
      if (t && t.r) rec(t.r).defeated++;
      break;
    }
    case 'raidStart': if (d) { d.pm0 = S.pm; d.morale0 = IC.nationalMorale ? IC.nationalMorale(S) : null; } break;
    case 'raidResult': {
      const res = d.res, C = S.combat || (S.combat = { streak: 0, best: 0, held: 0, raids: 0, day: null });
      C.raids++;
      if (res.held) { C.streak++; C.held++; C.best = Math.max(C.best, C.streak); } else C.streak = 0;
      C.last = { name: d.R.name, obj: d.R.obj.name, grade: res.grade, held: res.held, t: S.time };
      if (res.held) {
        // a held raid lifts the cities that watched it
        for (const c of IC.cities(S)) if (U.dist(c, d.R.obj) < 2500) c.morale = Math.min(100, c.morale + 1.5);
        if (C.streak >= 2) IC.log(S, 'kill', 'HELD', `${C.streak} raids held in a row.`);
      }
      break;
    }
    case 'raidOver': {
      // the Prime Minister's confidence after it, said out loud (campaign.js has just weighed the raid)
      if (d.pm0 != null && S.pm != null) { const dv = Math.round(S.pm - d.pm0); if (dv >= 1) IC.log(S, 'kill', 'PM', `The Prime Minister's confidence rises to ${Math.round(S.pm)} (+${dv}) after the ${d.name} on ${d.obj.name}.`); }
      break;
    }
  }
});

/* ---------- the step ---------- */
IC.combat = function (S, dt) {
  const C = S.combat || (S.combat = { streak: 0, best: 0, held: 0, raids: 0, day: null });
  C.t = (C.t || 0) - dt;
  if (C.t > 0) return;
  C.t = 1;
  // locks: an enemy radar on our aircraft (enemy.js marks a fighter's target), an anti-radiation missile homing on a
  // radar, a loitering munition diving on a vehicle; a missile in the air at one of ours is its own warning
  for (const t of S.threats) {
    if (t.dead) continue;
    if (t.type === 'arm' && t.target && !t.blind) lock(S, t.target, t);
    else if (t.prey && !t.prey.dead) lock(S, t.prey, t);
  }
  for (const m of S.eaam) if (!m.dead && m.target) {
    lock(S, m.target, m.src || m);
    if (!m.warned) { m.warned = true; IC.sfx && IC.sfx.mslWarn && IC.sfx.mslWarn(m.target.x, m.target.y); IC.emit(S, 'mslWarn', { m, a: m.target }); }
  }
  // a day's summary, once the raids are over for the day (Quick war's evening report says the rest)
  const day = U.day(S.time);
  if (C.day == null) C.day = day;
  if (day !== C.day) { const prev = C.day; C.day = day; summary(S, C, prev); }
};
const lock = IC.combatLock = function (S, x, by) {
  const fresh = !IC.lockedOn(S, x);
  x.lockT = S.time; x.lockBy = by;
  if (fresh) { IC.sfx && IC.sfx.lockTone && IC.sfx.lockTone(x.x, x.y); IC.emit(S, 'locked', { x, by }); }
};
function summary(S, C, day) {
  const raids = (S.raids || []).filter(r => r.day === day);
  if (!raids.length) return;
  const n = raids.reduce((s, r) => s + r.threats, 0), down = raids.reduce((s, r) => s + r.kills, 0), hits = raids.reduce((s, r) => s + r.hits, 0);
  const held = raids.filter(r => r.held).length;
  C.days = C.days || [];
  C.days.push({ day, raids: raids.length, held, n, down, hits, streak: C.streak });
  IC.log(S, held === raids.length ? 'kill' : 'info', 'DAY', `Day ${day}: ${raids.length} raid${raids.length > 1 ? 's' : ''}, ${held} held. ${down} of ${n} weapons and aircraft stopped, ${hits} hit something.${C.streak >= 2 ? ` ${C.streak} raids held in a row.` : ''}`);
}

})(window.IC);
