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

IC.campaignInit = function (S) {
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: '', objs: [], goal: '', sched: [], cool: {}, day: snap(S) };
  const E = S.enemy, W = S.world;
  if (S.mode === 'sandbox') {
    S.camp.sched = [
      { t: 7 * 3600, fn: () => { E.escalBase = 0.8; IC.enemyOpening(S); chapter(S, 'Open War', `${W.full.A} has attacked.`); } },
      { t: 9 * 3600, fn: () => IC.activateFront(S, 'A') },
      { t: 30 * 3600, fn: () => { for (const s of S.esites) s.dormant = false; IC.activateFront(S, 'B'); } }
    ];
    S.camp.chapter = 'Open War';
    say(S, 'CDS', `${W.full.A} will strike at dawn. Most of our equipment is deployed and the nation is partly mobilized. Good luck.`);
    return;
  }
  E.allow = new Set(['recon']);
  for (const s of S.esites) if (s.nat === 'B') s.dormant = true;
  const war = S.time + U.rand(3, 4.5) * 3600, frontA = war + U.rand(1.5, 2.5) * 3600, frontB = war + U.rand(20, 30) * 3600;
  S.camp.sched = [
    { t: S.time + U.rand(0.6, 1) * 3600, fn: () => { IC.enemyForceOp(S, 'recon', nearTown(S)); say(S, 'INT', `An unidentified slow track has crossed from ${W.names.A}. Probably a reconnaissance drone photographing our positions. Shooting it down now would be legal, but it would also tell them where our batteries are.`); } },
    { t: S.time + U.rand(1.6, 2.2) * 3600, fn: () => { E.allow.add('rkt'); const t = nearTown(S); IC.enemyForceOp(S, 'rkt', t); say(S, 'INT', `Rocket fire on ${t.name}! A ${W.names.A} battery is shelling across the border. Our counter-battery radar or a reconnaissance drone could find the launcher.`); E.allow.delete('rkt'); } },
    { t: war - 1500, fn: () => say(S, 'INT', `Signals intelligence: heavy radio traffic at ${W.names.A} missile brigades and air bases. Something is coming within the hour.`) },
    { t: war, fn: () => { E.allow = null; E.escalBase = 0.6; IC.enemyOpening(S); chapter(S, 'The First Strike', `${W.full.A} has opened fire. Missiles and drones are in the air.`); say(S, 'CDS', `This is war. ${W.names.A} is striking our air bases and power grid. Their ground forces will follow.`); } },
    { t: frontA, fn: () => { IC.activateFront(S, 'A'); chapter(S, 'The Storm Breaks', `${W.names.A} armour is crossing the border.`); } },
    { t: frontB, fn: () => { for (const s of S.esites) s.dormant = false; IC.activateFront(S, 'B'); chapter(S, 'Two Fronts', `${W.full.B} has joined the war.`); } }
  ];
  card(S, 'Tension', `Day 1 · ${U.hhmm(S.time)}`, `${W.full.A} has closed the border and its forces are massing. We are not on a war footing: good equipment, much of it still in the depots, and thin magazines. Use the time.`, 'chapter');
  S.camp.chapter = 'Tension';
  say(S, 'CDS', `${W.full.A} is massing on the border. We have hours, not days. Get equipment out of the reserve, fill the magazines, and decide what we protect first.`);
  say(S, 'ADA', 'Our radars give us a picture, but only the 3D radars can tell airliners from bombers. The sky is full of civil traffic: keep weapons Tight until something is identified hostile.');
  say(S, 'LOG', 'Depots are low. Order munitions at the factories or buy abroad, and put a forward depot near the northern front so convoys have short runs.');
};
function nearTown(S) {
  const fA = S.fronts.find(f => f.key === 'A');
  const c = IC.cities(S).filter(x => !x.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0] || IC.cap(S);
  return { x: c.x, y: c.y, ref: c, name: c.name };
}
function snap(S) { return { kills: S.stats.kills, leak: S.stats.leakers, fired: S.stats.fired, lost: S.stats.unitsLost + S.stats.acLost, budget: S.budget, will: S.enemy ? S.enemy.will : 100, civ: S.stats.civLost }; }

IC.campaignTick = function (S, dt) {
  const C = S.camp;
  for (const e of C.sched) if (!e.done && S.time >= e.t) { e.done = true; e.fn(); }
  C.sugT = (C.sugT || 0) - dt;
  if (C.sugT <= 0) { C.sugT = 10; C.objs = suggestions(S); }
  const h = (S.time % 86400) / 3600, day = U.day(S.time);
  if (day > 1 && h >= 6 && C.briefDay !== day) { C.briefDay = day; briefing(S); }
  if (h >= 21 && C.reportDay !== day && S.enemy.war) { C.reportDay = day; report(S); }
  if (S.enemy.war && day >= 4 && C.chapter !== 'Attrition' && S.enemy.will > 50 && C.chapter !== 'The Turning Point') chapter(S, 'Attrition', 'Neither side can land a knockout. Stocks, crews and morale decide it now.');
  if (S.enemy.will < 50 && !C.turn) { C.turn = true; chapter(S, 'The Turning Point', `${S.world.names.A}'s will is cracking. Keep the pressure on.`); }
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
  lines.push(`Enemy will to fight: ${Math.round(E.will)}%. Our national morale: ${Math.round(IC.nationalMorale(S))}%.`);
  if (P) lines.push(`Their air force appears to be trying to ${P.label} (${P.obj.name}).`);
  const lost = IC.cities(S).filter(c => c.owner === 'enemy');
  if (lost.length) lines.push(`Occupied: ${lost.map(c => c.name).join(', ')}.`);
  const low = S.units.filter(u => u.mags.length && IC.fill(S, u) < 0.3).length;
  if (low) lines.push(`${low} batteries are below a third of their missiles.`);
  lines.push(`Weather: ${IC.WEATHER[S.weather.kind].name.toLowerCase()}, turning ${IC.WEATHER[S.weather.forecast].name.toLowerCase()}.`);
  card(S, `Morning Briefing · Day ${day}`, U.clock(S.time), lines.join(' '), 'briefing');
  S.camp.day = snap(S);
}
function report(S) {
  const d = S.camp.day, n = snap(S);
  const text = `Threats destroyed: ${n.kills - d.kills}. Leakers: ${n.leak - d.leak}. Interceptors fired: ${n.fired - d.fired}. Our losses: ${n.lost - d.lost}. Treasury ${U.money(n.budget)} (${n.budget >= d.budget ? '+' : '−'}${U.money(Math.abs(n.budget - d.budget)).replace('₭', '₭')}). Enemy will ${Math.round(d.will)}% → ${Math.round(n.will)}%.${n.civ > d.civ ? ' Civil aircraft lost: ' + (n.civ - d.civ) + '.' : ''}`;
  card(S, `Day ${U.day(S.time)} Report`, U.clock(S.time), text, 'report');
}

/* what could be done right now, most urgent first */
function suggestions(S) {
  const L = [];
  const add = (pri, text, ref, kind) => L.push({ pri, text, ref, kind });
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && !IC.baseStatus(S, b).runway && !b.works.some(w => w.key && w.key.startsWith('cr:'))) add(9, `Repair the runway at ${b.name}`, b, 'infra');
  for (const b of IC.bases(S)) if (b.kind === 'airbase' && b.owner === 'us' && b.parts && S.roster.filter(r => r.base === b.id && r.st !== 'lost' && !r.slot).length && !b.works.some(w => w.kind === 'build')) add(4, `Aircraft at ${b.name} are parked in the open: build hangars or shelters`, b, 'infra');
  for (const c of IC.cities(S)) if (c.besieged) add(8, `${c.name} is surrounded: fly supply in to its garrison`, c, 'infra');
  for (const g of S.gunits) if (g.side === 'us' && g.sup < 30 && !g.lift) add(7, `${g.name} is short of supply (${Math.round(g.sup)}%)`, g, 'gunit');
  for (const g of S.gunits) if (g.side === 'us' && g.str < 45 && g.order !== 'refit') add(5, `${g.name} is at ${Math.round(g.str)}% strength: refit or fly in replacements`, g, 'gunit');
  for (const f of S.fronts) f.sectors.forEach((s, i) => { if (s.main && s.eAttack) add(8, `Major assault on ${s.name}: reinforce it, dig in, or hit the armor from the air`, IC.secGeom(f, i), 'point'); });
  for (const u of S.units) if (u.state === 'ready' && u.d.weapon === 'sam' && IC.activeMags(S, u).every(m => m.mag + m.store + m.inc === 0)) add(8, `${u.name} is out of missiles`, u, 'unit');
  for (const u of S.units) if (u.state === 'ready' && Object.values(u.comp).some(v => v < 0.35) && !u.repairing) add(6, `${u.name} is damaged: send a repair crew`, u, 'unit');
  for (const t of S.tels) if (t.known && !t.dead && S.time - t.kt < 900) add(7, `${t.name} located: strike it before it moves`, t, 'tel');
  for (const t of S.threats) if (t.det && !t.dead && t.aff === 'S' && t.d.cls === 'air' && IC.inHome(t.x, t.y)) { add(7, `TN ${t.tn} is suspect: send a fighter to look`, t, 'track'); break; }
  const res = Object.entries(S.reserve).filter(([, n]) => n > 0);
  if (res.length) add(4, `${res.reduce((s, [, n]) => s + n, 0)} systems waiting in the reserve: deploy them`, null, 'arsenal');
  if (S.enemy.war && S.airspace === 'open') add(5, 'Civil airliners are still flying through a war zone: restrict the airspace', null, 'airspace');
  const freeSlots = S.tech.slots.filter(x => !x).length;
  if (freeSlots && S.budget > 150) add(2, `${freeSlots} research slot${freeSlots > 1 ? 's' : ''} idle`, null, 'tech');
  if (S.orders.length < IC.slots(S) && S.budget > 250) add(2, 'Production has spare capacity: order equipment', null, 'arsenal');
  const tired = S.units.filter(u => u.fat > 80 && u.radarOn);
  if (tired.length) add(4, `${tired[0].name}${tired.length > 1 ? ` and ${tired.length - 1} more` : ''}: crews exhausted`, tired[0], 'unit');
  L.sort((a, b) => b.pri - a.pri);
  S.camp.goal = S.enemy.war ? `Break ${S.world.names.A}'s will to fight (${Math.round(S.enemy.will)}%)` : 'Prepare the defense';
  return L.slice(0, 5);
}
IC.suggestions = suggestions;

/* the staff react to what happens */
IC.on((S, type, d) => {
  if (!S.camp || S.mode === 'academy') return;
  const once = (k, cool) => tip(S, k, cool == null ? 1e12 : cool);
  switch (type) {
    case 'ballistic': if (once('bal')) say(S, 'ADA', 'Ballistic missile inbound. Only batteries with hit-to-kill rounds and the high-altitude tier can stop these. The impact point is marked; get what you can out of the way.'); break;
    case 'arm': if (once('arm')) say(S, 'ADA', `Anti-radiation missile inbound on ${d.target ? d.target.name : 'one of our radars'}. Switch it to Silent and the missile loses its lock. Anything its radar was guiding will miss too.`); break;
    case 'baseHit': if (!d.runway && once('rwy')) say(S, 'ENG', `The runway at ${d.base.name} is cratered. Jets there cannot fly and returning flights will divert. My crews start on the runway automatically; select the base to add crews or rebuild hangars.`); if (d.acLost && once('acg', 3600)) say(S, 'AIR', `We lost ${d.acLost} aircraft on the ground at ${d.base.name}. Hardened shelters would have saved most of them.`); break;
    case 'unmasked': say(S, 'INT', `TN ${d.tn} was squawking as airliner ${d.cs}. It is a bomber. They will try that again: watch for airliners that leave their routes.`); break;
    case 'assault': if (once('assault' + d.f.key, 7200)) say(S, d.f.cmd.name, `${d.f.cmd.name}, ${d.f.name}: they are massing armor against ${d.f.sectors[d.si].name}. I need that sector dug in, anti-tank kits, and helicopters on their armor.`); break;
    case 'assaultStalled': if (once('stall' + d.f.key, 7200)) say(S, d.f.cmd.name, `The attack on ${d.f.sectors[d.si].name} has stalled. If we hit them now, before they regroup, we could take ground back.`); break;
    case 'frontActive': say(S, d.cmd.name, `${d.cmd.name} commanding the ${d.name}. I will run the brigades, but you set the stance and priorities, and you can take any brigade under your own orders.`); break;
    case 'capture': if (d.kind === 'city') say(S, 'CDS', `${d.name} has fallen. Every town we lose costs us taxes, industry and morale. A brigade told to Defend a town will hold it even if the line flows past.`); break;
    case 'convoyLost': if (once('convoy')) say(S, 'LOG', `We lost ${d.name}. Loitering munitions hunt the supply roads near the front. Short-range air defense along the route, or a depot further back, keeps them alive.`); break;
    case 'unitLost': if (once('unitLost')) say(S, 'ADA', `${d.name} is gone. The enemy found it: radiating, firing and sitting near the border all give positions away. Move batteries after they fire when you can.`); break;
    case 'enemyStrike': if (Math.random() < 0.5 + (IC.hasTech(S, 's_esm') ? 0.3 : 0)) say(S, 'INT', `Heavy activity at ${S.world.names.A} launch sites and air bases. Expect a major strike on ${d.obj.name} within the hour.`); break;
    case 'hstrike': say(S, 'AIR', `${d.a.name}: ${d.rep.hits} attack runs on ${d.g.name}. It is down to about ${Math.round(d.g.str)}% strength.`); break;
    case 'lift': if (once('lift' + d.cargo, 3600)) say(S, 'LOG', `${IC.HLIFT[d.cargo].name} delivered to ${d.g.name}.`); break;
    case 'civilKill': say(S, 'CDS', `We shot down a civilian aircraft. This will cost us allies. Check identities before firing: an airliner on its filed route is civil until proven otherwise.`); break;
    case 'takeTown': say(S, 'CDS', `We hold ${d.name} inside ${S.world.names[d.k]}. That will hurt them.`); break;
    case 'weather': if (!IC.WEATHER[d].heli && once('wx', 21600)) say(S, 'AIR', 'Weather has grounded the helicopters. Jets can still fly.'); break;
    case 'delivered': if (once('delivered')) say(S, 'LOG', 'The first new equipment is in the reserve. Pick it in the arsenal and click the map to deploy it.'); break;
  }
});

})(window.IC);
