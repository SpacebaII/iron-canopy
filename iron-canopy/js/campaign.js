/* Iron Canopy — the campaign. Nothing here is scripted step by step: the crisis escalates on its own clock and
   the enemy commander plays for real. The staff react to what happens, a list of suggestions shows what could be
   done next, and each day opens with a briefing and closes with a report. */
(function (IC) {
'use strict';
const U = IC.U;

function say(S, who, text) {
  if (!S.camp) return;
  const a = IC.ADVISORS[who] || { name: who, role: 'Front commander', tag: 'CMD' };
  S.camp.comms.push({ who, name: a.name, role: a.role, tag: a.tag, text, t: S.time });
  IC.log(S, 'info', a.tag, text);
  IC.sfx && IC.sfx.radio();
}
IC.say = say;
function card(S, title, sub, text, kind) { S.camp.cards.push({ title, sub, text, kind: kind || 'chapter', t: S.time }); IC.sfx && IC.sfx.ui('chapter'); }
IC.card = card;
function chapter(S, name, text) { if (S.camp.chapter === name) return; S.camp.chapter = name; card(S, name, `Day ${U.day(S.time)} · ${U.hhmm(S.time)}`, text, 'chapter'); IC.emit(S, 'chapter', name); }

/* Quick war is won by holding: this many days of war with the country still working and the Prime Minister still
   behind you. It is lost when the Prime Minister's confidence runs out, or national morale collapses. */
IC.HOLD_DAYS = 3;
IC.campaignInit = function (S) {
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: '', objs: [], goal: '', sched: [], cool: {}, day: snap(S) };
  S.pm = 70;
  const E = S.enemy, W = S.world;
  if (S.mode === 'sandbox') {
    S.camp.sched = [{ t: 7 * 3600, fn: IC.hfn('qwSandboxWar', S) }, { t: 30 * 3600, fn: IC.hfn('qwWake', S) }];
    S.camp.chapter = 'Open War';
    say(S, 'CDS', `${W.full.A} will strike at dawn. Most of our equipment is deployed and the nation is partly mobilized. Good luck.`);
    return;
  }
  E.allow = new Set(['recon']);
  for (const s of S.esites) if (s.nat === 'B') s.dormant = true;
  const war = S.time + U.rand(3, 4.5) * 3600, second = war + U.rand(20, 30) * 3600;
  S.camp.sched = ['qwRecon', 'qwRockets', 'qwSigint', 'qwWar', 'qwSecond'].map((h, i) => ({ t: [S.time + U.rand(0.6, 1) * 3600, S.time + U.rand(1.6, 2.2) * 3600, war - 1500, war, second][i], fn: IC.hfn(h, S) }));
  card(S, 'Tension', `Day 1 · ${U.hhmm(S.time)}`, `The ${W.full.A} has closed the border and its forces are massing. Our layers are up over the capital, the main air base and the two largest cities, but more equipment waits in the reserve and the spare missiles at each site are only half stocked. Use the time.`, 'chapter');
  S.camp.chapter = 'Tension';
  say(S, 'CDS', `The ${W.full.A} is massing on the border. We have hours, not days. Deploy what is still in the reserve, top up the stores, and decide what else we protect.`);
  say(S, 'ADA', 'Our radars give us a picture, but only the 3D radars can tell airliners from bombers. The sky is full of civil traffic: keep weapons Tight until something is identified hostile.');
  say(S, 'LOG', `Launchers are loaded, but the spare missiles at each site are only half stocked. Order more from the arms plants or abroad in the Supply room (L). The Forward Depot near the border supplies whatever you deploy up there.`);
};
/* the Quick war's timetable (S.camp.sched) */
const H = IC.H;
H.qwSandboxWar = S => () => { IC.enemyOpening(S, { act: 2 }); chapter(S, 'Open War', `${S.world.full.A} has attacked.`); };
H.qwWake = S => () => { for (const s of S.esites) s.dormant = false; };
H.qwRecon = S => () => { IC.enemyForceOp(S, 'recon', nearTown(S)); say(S, 'INT', `An unidentified slow track has crossed from ${S.world.names.A}. Probably a reconnaissance drone photographing our positions. Shooting it down now would be legal, but it would also tell them where our batteries are.`); };
H.qwRockets = S => () => { const E = S.enemy; E.allow.add('rkt'); const t = nearTown(S); IC.enemyForceOp(S, 'rkt', t); say(S, 'INT', `Rocket fire on ${t.name}! A ${S.world.names.A} battery is shelling across the border. Our counter-battery radar or a reconnaissance drone could find the launcher.`); E.allow.delete('rkt'); };
H.qwSigint = S => () => say(S, 'INT', `Signals intelligence: heavy radio traffic at ${S.world.names.A} missile brigades and air bases. Something is coming within the hour.`);
H.qwWar = S => () => {
  // a defence that is ready when the war comes cuts their probing short: up to four hours
  const W = S.world; S.enemy.allow = null; IC.enemyOpening(S, { head: 4 * readiness(S) });
  chapter(S, 'The First Strike', `${W.full.A} has opened fire. Drones and a few missiles are in the air.`);
  say(S, 'CDS', `This is war. The first strikes are probes: drones and single missiles along the border. They want to see what fires and from where. They have far more than this: they are holding it back.`);
};
H.qwSecond = S => () => { for (const s of S.esites) s.dormant = false; chapter(S, 'Two Fronts', `${S.world.full.B} has joined the war.`); };
/* how ready the defence is when the war comes: the share of the capital, the main air base and the two largest
   cities with a battery set up over them */
function readiness(S) {
  const big = IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 2), P = [IC.cap(S), IC.mainBase(S)].concat(big).filter(Boolean);
  return P.filter(p => S.units.some(u => u.state === 'ready' && u.d.weapon === 'sam' && U.dist(u, p) < IC.maxRange(S, u) * 0.8)).length / Math.max(1, P.length);
}
IC.warReadiness = readiness;
function nearTown(S) {
  const c = IC.cities(S).filter(x => !x.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0] || IC.cap(S);
  return { x: c.x, y: c.y, ref: c, name: c.name };
}
/* how much of the country still works: power and homes in the cities, factories, open runways, airlines flying */
IC.working = function (S) {
  let cp = 0, c = 0;
  for (const x of IC.cities(S)) { const pl = x.plant && S.byId[x.plant]; const alive = x.blocks ? x.blocks.filter(b => b.hp > 0).length / Math.max(1, x.blocks.length) : x.hp / x.max; cp += x.pop; c += x.pop * alive * (pl && pl.offline ? 0.6 : 1); }
  const fac = S.infra.filter(i => i.kind === 'factory'), apt = IC.bases(S).filter(b => b.owner === 'us' && b.parts);
  const f = fac.length ? fac.filter(i => !i.offline).length / fac.length : 1;
  const a = apt.length ? apt.filter(b => IC.baseStatus(S, b).runway).length / apt.length : 1;
  const al = S.av ? S.av.airlines.filter(x => !x.gone) : [];
  const sat = al.length ? Math.min(1, al.reduce((s2, x) => s2 + x.sat, 0) / al.length / 60) : 1;
  return (cp ? c / cp : 1) * 0.45 + f * 0.2 + a * 0.2 + sat * 0.15;
};
IC.warDays = S => S.enemy && S.enemy.war ? (S.time - S.enemy.warT) / 86400 : 0;
const pmHit = (S, v, why) => { if (S.pm == null || S.story) return; S.pm = U.clamp(S.pm + v, 0, 100); if (v <= -4 && why) IC.log(S, 'warn', 'PM', `The Prime Minister: ${why}`); };
IC.pmHit = pmHit;
/* what a raid breaks costs the Prime Minister's confidence hit by hit, but at most IC.PM_RAID_CAP over one raid: the
   raid is judged as a whole in its after-action, so one bad night alone does not end the war */
IC.PM_RAID_CAP = 10;
const hitPm = (S, v, why) => {
  const E = S.enemy, R = E && E.raid && E.cycle && E.cycle.phase === 'raid' ? E.raid : null;
  if (R && v < 0) { const took = R.pmTook || 0; v = Math.max(v, took - IC.PM_RAID_CAP); R.pmTook = took - v; }
  pmHit(S, v, why);
};

function snap(S) { return { kills: S.stats.kills, leak: S.stats.leakers, fired: S.stats.fired, lost: S.stats.unitsLost + S.stats.acLost, budget: S.budget, will: S.enemy ? S.enemy.will : 100, civ: S.stats.civLost }; }

IC.campaignTick = function (S, dt) {
  const C = S.camp;
  for (const e of C.sched) if (!e.done && S.time >= e.t) { e.done = true; e.fn(); }
  C.sugT = (C.sugT || 0) - dt;
  if (C.sugT <= 0) { C.sugT = 10; C.objs = suggestions(S); }
  const h = (S.time % 86400) / 3600, day = U.day(S.time);
  if (day > 1 && h >= 6 && C.briefDay !== day) { C.briefDay = day; briefing(S); }
  if (h >= 21 && C.reportDay !== day && S.enemy.war) { C.reportDay = day; report(S); }
  if (S.pm != null && S.pm < 25 && tip(S, 'pmLow', 7200)) say(S, 'CDS', `The Prime Minister's confidence is down to ${Math.round(S.pm)}. Protect what keeps the country working: power, the cities, the airports.`);
  // the Prime Minister's confidence: it drains while the country is failing, and recovers in the calm
  C.pmT = (C.pmT || 0) - dt;
  if (C.pmT <= 0 && S.pm != null) {
    C.pmT = 60;
    const w = C.work = IC.working(S), m = IC.nationalMorale(S);
    pmHit(S, ((w - 0.85) * 1.5 + (m < 40 ? -0.6 : 0)) / 60);
    if (S.pm < 1) IC.gameOver(S, `The Prime Minister has lost confidence in the air defence and asked ${S.world.names.A} for a ceasefire on its terms.`);
    else if (S.enemy.war && IC.warDays(S) >= IC.HOLD_DAYS) IC.victory(S, `You held for ${IC.HOLD_DAYS} days. ${S.world.full.A} has agreed to talks: its raids did not break the country (${U.pct(w)} still working).`);
  }
  // tired crews
  C.fatT = (C.fatT || 0) - dt;
  if (C.fatT <= 0) {
    C.fatT = 1200;
    const t = S.units.filter(u => u.fat > 80 && u.radarOn);
    if (t.length && tip(S, 'fatigue', 6 * 3600)) say(S, 'ADA', `${t.slice(0, 3).map(u => u.name).join(', ')} ${t.length > 1 ? 'have' : 'has'} been radiating for hours and the crews are exhausted: slower to react, slower to reload, more misses. Stand some down (Silent) where another radar covers them, and let them rest.`);
  }
};
function tip(S, key, cool) {
  const c = S.camp.cool;
  if (c[key] != null && (cool == null || S.time - c[key] < cool)) return false;
  c[key] = S.time; return true;
}

function briefing(S) {
  const E = S.enemy, P = E.plan, day = U.day(S.time);
  const lines = [];
  lines.push(`The Prime Minister's confidence: ${Math.round(S.pm)}. Country working: ${U.pct(IC.working(S))}. National morale: ${Math.round(IC.nationalMorale(S))}%.`);
  if (E.war) lines.push(`Hold for ${U.dur(Math.max(0, IC.HOLD_DAYS - IC.warDays(S)) * 86400)} more.`);
  if (P) lines.push(`Their air force appears to be trying to ${P.label} (${P.obj.name}).`);
  const low = S.units.filter(u => u.mags.length && IC.fill(S, u) < 0.3).length;
  if (low) lines.push(`${low} batteries are below a third of their missiles.`);
  lines.push(`Weather: ${IC.WEATHER[S.weather.kind].name.toLowerCase()}, turning ${IC.WEATHER[S.weather.forecast].name.toLowerCase()}.`);
  card(S, `Morning Briefing · Day ${day}`, U.clock(S.time), lines.join(' '), 'briefing');
  S.camp.day = snap(S);
}
function report(S) {
  const d = S.camp.day, n = snap(S);
  const text = `Threats destroyed: ${n.kills - d.kills}. Leakers: ${n.leak - d.leak}. Interceptors fired: ${n.fired - d.fired}. Our losses: ${n.lost - d.lost}. Treasury ${U.money(n.budget)} (${n.budget >= d.budget ? '+' : '−'}${U.money(Math.abs(n.budget - d.budget)).replace('₭', '₭')}). Raids today: ${(S.raids || []).filter(r => U.day(r.t) === U.day(S.time)).length}.${n.civ > d.civ ? ' Civil aircraft lost: ' + (n.civ - d.civ) + '.' : ''}`;
  card(S, `Day ${U.day(S.time)} Report`, U.clock(S.time), text, 'report');
}

/* what could be done right now, most urgent first */
function suggestions(S) {
  const L = [];
  const add = (pri, text, ref, kind) => L.push({ pri, text, ref, kind });
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && !IC.baseStatus(S, b).runway && !b.works.some(w => w.key && w.key.startsWith('cr:'))) add(9, `Repair the runway at ${b.name}`, b, 'infra');
  for (const b of IC.bases(S)) if (b.kind === 'airbase' && b.owner === 'us' && b.parts && S.roster.filter(r => r.base === b.id && r.st !== 'lost' && !r.slot).length && !b.works.some(w => w.kind === 'build')) add(4, `Aircraft at ${b.name} are parked in the open: build hangars or shelters`, b, 'infra');
  for (const u of S.units) if (u.state === 'ready' && u.d.weapon === 'sam' && IC.activeMags(S, u).every(m => m.mag + m.store + m.inc === 0)) add(8, `${u.name} is out of missiles`, u, 'unit');
  for (const u of S.units) if (u.state === 'ready' && Object.values(u.comp).some(v => v < 0.35) && !u.repairing) add(6, `${u.name} is damaged: send a repair crew`, u, 'unit');
  for (const t of S.tels) if (t.known && !t.dead && S.time - t.kt < 900) add(7, `${t.name} located: strike it before it moves`, t, 'tel');
  for (const t of S.threats) if (t.det && !t.dead && t.aff === 'S' && t.d.cls === 'air' && IC.inHome(t.x, t.y)) { add(7, `TN ${t.tn} is suspect: send a fighter to look`, t, 'track'); break; }
  const res = Object.entries(S.reserve).filter(([, n]) => n > 0);
  if (res.length) add(4, `${res.reduce((s, [, n]) => s + n, 0)} systems waiting in the reserve: deploy them`, null, 'arsenal');
  if (S.enemy.war && S.airspace === 'open') add(5, 'Civil airliners are still flying through a war zone: restrict the airspace', null, 'airspace');
  const freeSlots = S.tech.slots.filter(x => !x).length;
  if (freeSlots && S.budget > 150) add(2, `${freeSlots} research slot${freeSlots > 1 ? 's' : ''} idle`, null, 'tech');
  if (S.budget > 400) add(2, 'Money in hand: buy equipment from the arsenal; it arrives in minutes', null, 'arsenal');
  const tired = S.units.filter(u => u.fat > 80 && u.radarOn);
  if (tired.length) add(4, `${tired[0].name}${tired.length > 1 ? ` and ${tired.length - 1} more` : ''}: crews exhausted; set some Silent to rest them`, tired[0], 'unit');
  L.sort((a, b) => b.pri - a.pri);
  S.camp.goal = S.enemy.war ? `Hold for ${IC.HOLD_DAYS} days: ${U.dur(Math.max(0, IC.HOLD_DAYS - IC.warDays(S)) * 86400)} to go, country ${U.pct(S.camp.work || IC.working(S))} working` : 'Prepare the defence';
  return L.slice(0, 5);
}
IC.suggestions = suggestions;

/* the first ballistic launch of a Quick war: the allies fly in ballistic missile defence at once, so the
   player never has to face salvoes with nothing that can stop them */
function bmdAid(S) {
  if (S.story || S.flags.bmdAid) return;
  S.flags.bmdAid = true;
  S.tech.done.add('a_pac3'); S.tech.done.add('a_hatd');
  S.reserve.hatd = (S.reserve.hatd || 0) + 1;
  for (const u of S.units) for (const m of u.mags) if (m.mun === 'TBD') { m.mag = m.max; m.store = Math.max(m.store, Math.ceil(m.storeMax / 2)); }
  const dep = IC.depots(S).find(d => d.central);
  if (dep) { dep.inv.TBD = (dep.inv.TBD || 0) + 16; dep.inv.HAT = (dep.inv.HAT || 0) + 8; }
  say(S, 'CDS', 'The allies are flying in ballistic missile defence tonight: BMD rounds for every LRSAM battery, and a High-Altitude BMD battery waiting in the reserve. Deploy it near what they aim at: air bases and the capital.');
}
IC.bmdAid = bmdAid;

/* the staff react to what happens */
IC.on((S, type, d) => {
  if (!S.camp || S.mode === 'academy') return;
  const once = (k, cool) => tip(S, k, cool == null ? 1e12 : cool);
  switch (type) {
    case 'ballistic': if (once('bal')) { say(S, 'ADA', 'Ballistic missile inbound. Only hit-to-kill rounds can stop these: the upper tier meets warheads 40–150 km up, BMD rounds in the LRSAM meet them below 35 km. The red ellipse is where it will land.'); bmdAid(S); } break;
    case 'arm': if (once('arm')) say(S, 'ADA', `Anti-radiation missile inbound on ${d.target ? d.target.name : 'one of our radars'}. Switch it to Silent and the missile loses its lock. Anything its radar was guiding will miss too.`); break;
    case 'baseHit': if (!d.runway && once('rwy')) say(S, 'ENG', `The runway at ${d.base.name} is cratered. Jets there cannot fly and returning flights will divert. My crews start on the runway automatically; select the base to add crews or rebuild hangars.`); if (d.acLost && once('acg', 3600)) say(S, 'AIR', `We lost ${d.acLost} aircraft on the ground at ${d.base.name}. Hardened shelters would have saved most of them.`); break;
    case 'unmasked': say(S, 'INT', `TN ${d.tn} was squawking as airliner ${d.cs}. It is a bomber. They will try that again: watch for airliners that leave their routes.`); break;
    case 'convoyLost': if (once('convoy')) say(S, 'LOG', `We lost ${d.name}. Loitering munitions hunt the supply roads near the front. Short-range air defense along the route, or a depot further back, keeps them alive.`); break;
    case 'unitLost': if (once('unitLost')) say(S, 'ADA', `${d.name} is gone. The enemy found it: radiating, firing and sitting near the border all give positions away. Move batteries after they fire when you can.`); break;
    // the enemy's acts: a chapter in Quick war, a card in the Career
    case 'enemyAct': {
      const T = { 2: ['Limited Strikes', 'The probing is over. Small raids on power, bridges and depots, to learn where our defence is. Their big missiles are being held back.'], 3: ['The Shock', 'The strike they saved for has come and gone. Now they are quiet, and thinking.'], 4: ['No More Playing Around', 'A planned campaign against our air power: radars, batteries, supply, then the air base. Every loss will have a cause we could have countered.'] }[d.act];
      if (!T) break;
      if (S.story) card(S, T[0], U.clock(S.time), T[1], 'chapter'); else chapter(S, T[0], T[1]);
      break;
    }
    case 'enemyStrike': if (Math.random() < 0.5 + (IC.hasTech(S, 's_esm') ? 0.3 : 0)) say(S, 'INT', `Heavy activity at ${S.world.names.A} launch sites and air bases. Expect a major strike on ${d.obj.name} within the hour.`); break;
    case 'cityHit': hitPm(S, -0.5 - (d.lost || 0) * 1.2); break;
    case 'infraLost': hitPm(S, d.kind === 'bridge' ? -1 : -4, `${d.name} is out. People are asking why we could not protect it.`); break;
    case 'tailLost': hitPm(S, -3, 'An airliner destroyed on the ground. The airlines are talking about leaving.'); break;
    // after each raid the Prime Minister weighs what got through and what it hit
    // (a small raid counts for less: a drone that gets through is not a failed defence)
    case 'raidOver': { const r = d.res; if (!r || !r.threats) break; const f = r.leaks / r.threats; pmHit(S, 8 * (0.35 - f) * Math.min(1, r.threats / 12) - Math.min(6, r.hits * 0.15), f > 0.5 ? `Most of that raid got through: ${r.hits} hits on ${r.obj}.` : f < 0.15 ? '' : ''); if (f < 0.15) IC.log(S, 'kill', 'PM', `The Prime Minister thanks the air defence: the ${r.name} on ${r.obj} was stopped.`); break; }
    case 'civilKill': pmHit(S, -15); say(S, 'CDS', `We shot down a civilian aircraft. This will cost us allies. Check identities before firing: an airliner on its filed route is civil until proven otherwise.`); break;
    case 'weather': if (!IC.WEATHER[d].heli && once('wx', 21600)) say(S, 'AIR', 'Weather has grounded the helicopters. Jets can still fly.'); break;
    case 'delivered': if (once('delivered')) say(S, 'LOG', 'The first new equipment is in the reserve. Pick it in the arsenal and click the map to deploy it.'); break;
  }
});

})(window.IC);
