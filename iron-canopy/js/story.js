/* Iron Canopy — the career. You start as Director of Civil Aviation and end as Chief of the Air Force.
   Each act has goals (achievements) that move it along, a slow build-up of strange and then hostile incidents,
   and a triggering event that hands you the next job. Decisions arrive as event cards with consequences. The
   Minister's confidence in you is your life: lose it and you are replaced. */
(function (IC) {
'use strict';
const U = IC.U;

IC.ACTS = {
  1: { name: 'Act I', title: 'The Director', role: 'Director of Civil Aviation', grant: 5 },
  2: { name: 'Act II', title: 'Quiet Skies', role: 'Director of Airspace Security', grant: 16 },
  3: { name: 'Act III', title: 'The Shield', role: 'Commander, Air Defence Command', grant: 45 },
  4: { name: 'Act IV', title: 'The Storm', role: 'Chief of the Air Force', grant: 25 }
};
/* delegates take routine work off your hands once your rank allows it */
IC.DELEGATES = {
  routes: { name: 'Route Planning Office', act: 1, cost: 0.4, cp: 1, desc: 'Approves airline requests that our airports can handle and that pay their way.' },
  eng: { name: 'Chief Engineer', act: 1, cost: 0.3, cp: 0, desc: 'Repairs craters, cut taxiways and damaged buildings at every airport without being asked.' },
  qra: { name: 'QRA Commander', act: 2, cost: 1, cp: 1, desc: 'Scrambles the alert fighters at unknown aircraft entering our airspace, and calls airliners that drift off their routes.' },
  emcon: { name: 'Sector Air Defence Commander', act: 3, cost: 1, cp: 1, desc: 'Rests exhausted radar crews when another radar covers for them, and wakes them when threats come.' },
  logi: { name: 'Logistics Office', act: 3, cost: 0.8, cp: 1, desc: 'Keeps a forward depot stocked and buys munitions when stocks run low.' }
};
/* things command points can buy */
IC.REQUESTS = [
  { id: 'wing2', name: 'A second fighter flight', act: 2, cp: 2, cost: 60, desc: 'The Air Force releases LANCE flight to your base.', fn: S => addFlight(S, 'ftr', 'LANCE 1', 'ab_fwd') },
  { id: 'isr', name: 'A reconnaissance drone', act: 2, cp: 1, cost: 40, desc: 'REAPER 1 watches the border and finds what the radars miss.', fn: S => addFlight(S, 'isr', 'REAPER 1', 'ab_fwd') },
  { id: 'spectrum', name: 'National spectrum plan', act: 2, cp: 1, cost: 30, desc: 'Radars on the same band interfere far less with each other.', fn: S => { S.flags.spectrum = true; } },
  { id: 'aew', name: 'Airborne early warning', act: 3, cp: 3, cost: 120, desc: 'SENTRY 1 sees low fliers 300 km out from its orbit.', fn: S => addFlight(S, 'aew', 'SENTRY 1', 'ab_rear') },
  { id: 'wing3', name: 'A third fighter flight', act: 3, cp: 2, cost: 80, desc: 'VIPER 2 joins the wing.', fn: S => addFlight(S, 'ftr', 'VIPER 2', 'ab_fwd') },
  { id: 'helo', name: 'Transport helicopters', act: 3, cp: 1, cost: 40, desc: 'HOOK 1 can lift missiles and supplies anywhere.', fn: S => addFlight(S, 'heli', 'HOOK 1', 'ab_fwd') }
];
function addFlight(S, kind, name, base) {
  const b = S.byId[base] ? base : 'ab_fwd';
  const r = IC.newFlight(S, kind, name, b);
  r.st = 'turn'; r.t = 900;
  S.roster.push(r); IC.assignSlots(S, S.byId[b]);
  IC.log(S, 'kill', 'AIR', `${name} (${IC.AIR_KIND[kind].name.toLowerCase()}) assigned to ${S.byId[b].name}.`);
  return r;
}

/* ---------- what each act lets you use ---------- */
IC.storyAllows = function (S, type) {
  const st = S.story; if (!st) return true;
  const d = IC.UNITS[type];
  if (type === 'ssr') return true;
  if (st.act >= 4) return true;
  if (st.act >= 3) return d.cat !== 'strike';
  if (st.act >= 2) return ['gf', 'mr3d', 'acou'].includes(type) || (type === 'spaag' && st.doc.cheapGuns);
  return false;
};
IC.roomAllowed = function (S, room) {
  const st = S.story; if (!st) return room !== 'aviation' || !!S.av;
  const need = { air: 2, intel: 2, research: 3, logi: 3, industry: 3, army: 4 }[room];
  return !need || st.act >= need;
};
IC.staffCost = S => { const st = S.story; if (!st) return 0; let v = 0; for (const k in st.del) if (st.del[k]) v += IC.DELEGATES[k].cost; return v; };

/* ---------- start ---------- */
IC.storyForces = function (S) {
  const W = S.world;
  // three civil radars: one at each airport
  for (const ap of S.infra.filter(i => i.kind === 'airport')) {
    const p = IC.findSpot(S, 'ssr', ap.x, ap.y, ap.radius + 20, ap.radius + 120);
    if (p) { const u = IC.makeUnit(S, 'ssr', p.x, p.y, { instant: true }); u.name = `${ap.name.replace(/ (International|Airport)$/, '')} SSR`; }
  }
  S.reserve = {};
  S.budget = 220;
  S.airspace = 'open';
};
IC.storyInit = function (S) {
  const W = S.world;
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: '', objs: [], goal: '', sched: [], cool: {}, day: null };
  S.tension = 0;
  const st = S.story = { act: 1, standing: 62, cp: 0, grant: IC.ACTS[1].grant, goals: [], done: new Set(), events: [], doc: {}, del: { routes: false, eng: true, qra: false, emcon: false, logi: false }, bought: new Set(),
    beats: [], beatT: S.time + 900, cnt: { approve: 0, apron: 0, vid: 0, quickest: 1e9, zone: 0, calls: 0, taxi: 0 }, actT: S.time, log: [], growth: 0, fired: false };
  const E = S.enemy;
  E.allow = new Set();
  for (const s of S.esites) s.dormant = true;
  // in peacetime nobody fires without an order
  S.ad.roe = 'hold';
  // the military bases are not ours yet
  for (const b of S.infra.filter(i => i.kind === 'airbase')) b.locked = true;
  const apts = S.infra.filter(i => i.kind === 'airport');
  st.cap = apts.find(a => a.template === 'intl').id;
  st.bad = (apts.find(a => a.template === 'regional_bad') || apts[1]).id;
  st.reg = (apts.find(a => a.template === 'regional_ok') || apts[1]).id;
  startAct(S, 1);
};

function say(S, who, text) { IC.say(S, who, text); }
function card(S, title, sub, text, kind) { IC.card(S, title, sub, text, kind); }
const apName = (S, id) => S.byId[id].name;
const short = n => n.replace(/ (International|Airport|Air Base)$/, '');

/* ---------- goals ---------- */
function goalsFor(S, act) {
  const st = S.story, bad = S.byId[st.bad], cap = S.byId[st.cap];
  const G = [];
  if (act === 1) {
    G.push({ id: 'approve', text: 'Approve an airline’s route request (Aviation room)', check: () => st.cnt.approve >= 1 });
    G.push({ id: 'backtrack', text: `Stop the backtracking at ${short(bad.name)}: a taxiway to a runway end`, ref: bad, check: () => { const r = bad.st.rwy && bad.st.rwy[0]; return !!(r && r.threshold); } });
    G.push({ id: 'stands', text: `Give ${short(bad.name)} more stands: build an apron`, ref: bad, check: () => IC.aptStands(bad).filter(s => s.linked !== false).length >= 6 });
    G.push({ id: 'pax', get text() { return st.paxGoal ? `Grow traffic to ${st.paxGoal.toLocaleString('en-US')} passengers an hour` : 'Grow passenger traffic by a third (measuring today’s traffic…)'; }, check: () => st.paxGoal && S.av.paxHour >= st.paxGoal, prog: () => `${Math.round(S.av.paxHour || 0).toLocaleString('en-US')} an hour now` });
    G.push({ id: 'happy', text: 'Make the airlines happy: average satisfaction 72%', check: () => avgSat(S) >= 72, prog: () => `${Math.round(avgSat(S))}% now` });
  } else if (act === 2) {
    const fb = S.byId.ab_fwd;
    G.push({ id: 'alert', text: `Build an alert pad at ${short(fb.name)} near a runway end`, ref: fb, check: () => fb.parts.some(p => p.kind === 'alert' && p.built && p.linked !== false) });
    G.push({ id: 'qra', text: 'Get fighters airborne within 5 minutes of a scramble order', check: () => st.cnt.quickest <= 300, prog: () => st.cnt.quickest < 1e8 ? `best ${U.dur(st.cnt.quickest)}` : 'no scramble yet' });
    G.push({ id: 'vid', text: 'Identify 3 intruders by sight with a fighter', check: () => st.cnt.vid >= 3, prog: () => `${st.cnt.vid} of 3` });
    G.push({ id: 'milradar', text: 'Put a military radar near the border (it sees what civil radar cannot)', check: () => S.units.some(u => (u.type === 'gf' || u.type === 'mr3d') && u.state === 'ready' && IC.hostileBorderDist(u.x, u.y) < 900) });
    G.push({ id: 'zone', text: `Publish a prohibited zone to keep airliners away from ${short(fb.name)} or the capital`, check: () => S.av.zones.some(z => U.dist(z, fb) < z.r + 40 || U.dist(z, IC.cap(S)) < z.r + 40) });
  } else if (act === 3) {
    const cap = IC.cap(S);
    G.push({ id: 'layers', text: `Cover ${cap.name} with at least two layers of missiles`, ref: cap, check: () => new Set(S.units.filter(u => u.state === 'ready' && u.d.weapon === 'sam' && U.dist(u, cap) < 600).map(u => u.type)).size >= 2 });
    G.push({ id: 'basecover', text: `Defend ${short(S.byId.ab_fwd.name)} against drones and cruise missiles`, ref: S.byId.ab_fwd, check: () => S.units.some(u => u.state === 'ready' && (u.d.weapon === 'sam' || u.d.weapon === 'gun') && U.dist(u, S.byId.ab_fwd) < 300) });
    G.push({ id: 'kills', text: 'Shoot down 10 hostile drones or missiles', check: () => S.stats.kills >= (st.killBase || 0) + 10, prog: () => `${S.stats.kills - (st.killBase || 0)} of 10` });
    G.push({ id: 'depot', text: 'Set up a forward depot so batteries are resupplied', check: () => IC.depots(S).some(d => !d.central) });
    G.push({ id: 'civil', text: 'Keep civil aviation alive: 2,500 passengers in a day', check: () => S.av.day.pax >= 2500 || (S.av.yesterday && S.av.yesterday.pax >= 2500), prog: () => `${Math.round(S.av.day.pax).toLocaleString('en-US')} today` });
  } else {
    G.push({ id: 'will', text: `Break ${S.world.names.A}’s will to fight`, check: () => S.enemy.will < 25, prog: () => `${Math.round(S.enemy.will)}%` });
    G.push({ id: 'hold', text: 'Keep every city in our hands', check: () => false, prog: () => `${IC.cities(S).filter(c => c.owner === 'enemy').length} lost` });
  }
  return G;
}
const avgSat = S => { const L = S.av.airlines.filter(a => !a.gone); return L.length ? L.reduce((s, a) => s + a.sat, 0) / L.length : 50; };
IC.avgSat = avgSat;

/* ---------- acts ---------- */
function startAct(S, n) {
  const st = S.story, W = S.world, A = IC.ACTS[n];
  st.act = n; st.actT = S.time; st.grant = A.grant; st.role = A.role;
  st.goals = goalsFor(S, n);
  st.beats = beatsFor(S, n);
  st.beatT = 60;
  S.camp.chapter = `${A.name}: ${A.title}`;
  IC.emit(S, 'act', n);
  if (n === 1) {
    card(S, `${A.name} · ${A.title}`, `Day 1 · ${U.hhmm(S.time)}`, `You have just been appointed ${A.role} of ${W.full.H}. Three airports, a handful of airlines, and a Minister who wants the sector to grow. Next door, ${W.full.A} has been quiet for years.`, 'chapter');
    say(S, 'MIN', `Welcome, Director. Aviation is how this country earns its living and how it talks to the world. Grow it: more routes, more passengers, airlines that want to be here. I judge you on that.`);
    say(S, 'APT', `${short(apName(S, st.bad))} is my headache: one taxiway stub in the middle of the runway. Every departure backtracks along the runway and every landing blocks it for minutes. Select the airport to see it, and build a taxiway to a runway end.`);
    say(S, 'ATC', `Airline requests come to the Aviation room. Approve what our airports can handle. Zoom in on any airport and you can watch every aircraft taxi.`);
  } else if (n === 2) {
    const fb = S.byId.ab_fwd;
    fb.locked = false;
    addFlight(S, 'ftr', 'VIPER 1', 'ab_fwd').st = 'ready';
    S.budget += 150;
    S.enemy.allow = new Set(['recon']);
    st.cp += 1;
    card(S, `${A.name} · ${A.title}`, U.clock(S.time), `After the collision the Prime Minister has made you ${A.role}: civil and military air traffic under one roof. You inherit ${fb.name}, mothballed for years, and VIPER flight: two fighters. Someone is testing our skies.`, 'chapter');
    say(S, 'PM', `Director, I want to know what flies over this country and who flies it. The Air Force has given you ${short(fb.name)} and two jets. Make them count, and keep the airliners flying. Panic costs more than drones.`);
    say(S, 'AIR', `Col. Reyes, air operations. ${short(fb.name)} is a mess: the taxiway only reaches one runway end, fuel tanks stand side by side, no shelters, no alert pad. An alert pad at a runway end gets jets airborne in minutes. From a hangar it takes much longer.`);
    say(S, 'INT', `Our civil radars only hear transponders. A drone with its transponder off is invisible to them. A military radar near the border would change that.`);
  } else if (n === 3) {
    st.killBase = S.stats.kills;
    S.ad.roe = 'tight';
    for (const b of S.infra.filter(i => i.kind === 'airbase')) b.locked = false;
    for (const s of S.esites) if (s.nat === 'A') s.dormant = false;
    S.enemy.allow = new Set(['recon', 'rkt']);
    S.budget += 450;
    st.cp += 2;
    // the defence ministry hands over what it has in the depots
    const dep = IC.makeUnit(S, 'depot', W.depotPos.x, W.depotPos.y, { instant: true });
    dep.name = 'Central Depot'; dep.central = true; dep.d_cap = 3000; dep.hp = dep.max = 300; dep.reach = 1e9;
    Object.assign(dep.inv, { IR: 10, SR: 12, MR: 6, LR: 2, RKT: 0, ATG: 0, SUP: 80 });
    IC.addTruck(S, dep); IC.addTruck(S, dep);
    S.reserve = { mrsam: 1, shorad: 2, spaag: 1, manpads: 3, lr3d: 1, mr3d: 1, depot: 1 };
    addFlight(S, 'ftr', 'LANCE 2', 'ab_rear').st = 'ready';
    addFlight(S, 'isr', 'REAPER 2', 'ab_rear').st = 'ready';
    for (const b of IC.bases(S)) IC.assignSlots(S, b);
    card(S, `${A.name} · ${A.title}`, U.clock(S.time), `Blood has been spilled over ${W.full.H}. The cabinet has made you ${A.role}. Missiles, radars and depots are yours, and the equipment is in the reserve. ${W.names.A} has not declared war. It does not need to.`, 'chapter');
    say(S, 'CDS', `Gen. Voss. You have the air defences now. The equipment in the reserve is what the depots had: deploy it. Protect the capital and ${short(S.byId.ab_fwd.name)} first, and do not let the airliners stop.`);
    say(S, 'ADA', `Every radar you switch on is seen from across the border, and radars on the same band crowded together blind each other. More is not always better. Put them where they add something.`);
  } else if (n === 4) {
    S.enemy.allow = null;
    for (const s of S.esites) s.dormant = false;
    S.budget += 600;
    st.cp += 2;
    st.grant = A.grant;
    S.mobil = Math.max(S.mobil, 1);
    // the whole air force: the rear base's flights come under command
    const fwd = 'ab_fwd', rear = S.byId.ab_rear ? 'ab_rear' : 'ab_fwd';
    for (const [k, nm, b] of [['atk', 'TALON 1', fwd], ['heli', 'HOOK 2', rear], ['cargo', 'ATLAS 1', rear], ['ucav', 'HAWK 1', rear], ['aew', 'SENTRY 2', rear]]) if (!S.roster.some(r => r.name === nm)) addFlight(S, k, nm, b).st = 'ready';
    for (const b of IC.bases(S)) IC.assignSlots(S, b);
    card(S, `${A.name} · ${A.title}`, U.clock(S.time), `${W.full.A} has attacked. The government has made you ${A.role}, with the army's fronts under your air command. Everything you built now has to hold.`, 'chapter');
    say(S, 'CDS', `This is war. Their armour will cross within hours. The front commanders run the brigades; you decide where the air goes and what we defend.`);
    S.camp.sched = [
      { t: S.time + U.rand(1.5, 2.5) * 3600, fn: () => { IC.activateFront(S, 'A'); } },
      { t: S.time + U.rand(20, 30) * 3600, fn: () => { IC.activateFront(S, 'B'); } }
    ];
  }
}
IC.storyStartAct = startAct;

/* ---------- beats: the slow build-up ---------- */
function border(S, near) {
  // a point on our side of the hostile border, near a place
  const W = S.world;
  const fA = S.fronts.find(f => f.key === 'A');
  if (!fA) return { x: W.cx, y: W.cy };
  let best = fA.pts[Math.floor(fA.pts.length / 2)];
  if (near) { let bd = 1e9; for (const p of fA.pts) { const d = U.dist(p, near); if (d < bd) { bd = d; best = p; } } }
  return best;
}
function droneFrom(S, p, depth, loiter, extra) {
  const site = S.esites.find(s => s.kind === 'drone' && s.nat === 'A') || S.esites[0];
  const area = { x: p.x + p.nx * depth, y: p.y + p.ny * depth };
  const start = { x: p.x - p.nx * 300, y: p.y - p.ny * 300 };
  return IC.spawnThreat(S, 'isr', start.x, start.y, Object.assign({ phase: 'out', area, loiterT: loiter, home: { x: start.x - p.nx * 200, y: start.y - p.ny * 200 }, site: null, gray: true, fromHostile: true }, extra || {}));
}
function beatsFor(S, act) {
  const st = S.story, W = S.world;
  const B = [];
  const bad = S.byId[st.bad];
  if (act === 1) {
    B.push({ id: 'req', gap: [600, 900], run: () => { S.av.reqT = 0; } });
    B.push({ id: 'skyhop', gap: [2400, 4200], run: () => {
      const al = S.av.airlines.find(a => a.kind === 'budget');
      if (goalDone(S, 'backtrack')) {
        // already fixed: they notice, and want to come
        al.sat += 6;
        say(S, 'APT', `${al.name} noticed the new taxiway at ${short(bad.name)}. They want to fly there: check the Aviation room.`);
        S.av.requests.push({ id: IC.nid('rq'), al: al.id, a: bad.id, b: { apt: st.cap }, type: 'narrow', n: 2, t: S.time, exp: S.time + 8 * 3600, why: `wants to base aircraft at ${short(bad.name)} and fly to the capital`, value: 30 });
        return;
      }
      event(S, { title: `${al.name} wants ${short(bad.name)}`, who: al.name, text: `${al.name}'s chief executive wants to base aircraft at ${short(bad.name)}, but says the airport is "a runway with a car park": aircraft backtrack along the runway and there are only a few stands. They want a date for improvements.`,
        opts: [
          { t: 'Promise a taxiway and more stands', tip: `${al.name} +8 satisfaction. The Minister expects it done.`, fx: () => { al.sat += 8; st.promise = S.time; } },
          { t: 'Offer a 20% fee discount there instead', tip: `${short(bad.name)} fees drop to 80%. ${al.name} +12 satisfaction.`, fx: () => { bad.feeLevel = 0.8; al.sat += 12; } },
          { t: 'Tell them to fly from the capital', tip: `${al.name} −10 satisfaction.`, fx: () => { al.sat -= 10; } }
        ] });
    } });
    B.push({ id: 'ghost', need: () => (doneCount(S) >= 3 && inAct(S) > 3 * 3600) || inAct(S) > 9 * 3600, gap: [1800, 3600], run: () => {
      const ap = S.infra.filter(i => i.kind === 'airport').sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
      const p = border(S, ap);
      droneFrom(S, p, 120, 1800);
      say(S, 'ATC', `Odd one. The approach radar at ${short(ap.name)} painted a slow contact near the border, no transponder, no flight plan. The civil radars never saw it. Probably a weather balloon.`);
    } });
    B.push({ id: 'collision', need: () => (doneCount(S) >= 4 && inAct(S) > 4.5 * 3600) || inAct(S) > 15 * 3600, gap: [2400, 4800], run: () => collision(S) });
  } else if (act === 2) {
    B.push({ id: 'survey', gap: [1800, 3000], repeat: [5400, 9000], run: () => {
      const p = border(S, U.pick(IC.cities(S)));
      droneFrom(S, p, U.rand(60, 260), U.rand(1200, 2400));
      if (!st.surveyTold) { st.surveyTold = true; say(S, 'INT', `A slow contact is crossing the border without a transponder. Probably a survey drone mapping our radars and bases. Send a fighter to look at it. Whether we shoot is your call: it is in our airspace.`); }
    } });
    B.push({ id: 'jam', need: () => (doneCount(S) >= 1 && inAct(S) > 3 * 3600) || inAct(S) > 6 * 3600, gap: [3600, 6000], run: () => jamming(S) });
    B.push({ id: 'shadow', need: () => (doneCount(S) >= 2 && inAct(S) > 6 * 3600) || inAct(S) > 10 * 3600, gap: [3600, 5400], run: () => shadow(S) });
    B.push({ id: 'aptdrones', need: () => inAct(S) > 9 * 3600, gap: [3600, 5400], run: () => airportDrones(S) });
    B.push({ id: 'dilemma', need: () => (doneCount(S) >= 3 && inAct(S) > 11 * 3600) || inAct(S) > 18 * 3600, gap: [3600, 7200], run: () => dilemma(S) });
    B.push({ id: 'firstblood', need: () => st.dilemmaDone, gap: [3600, 7200], run: () => firstBlood(S) });
  } else if (act === 3) {
    B.push({ id: 'probe', gap: [3600, 5400], repeat: [7200, 12600], run: () => grayStrike(S) });
    B.push({ id: 'rkt', gap: [7200, 10800], repeat: [10800, 18000], run: () => { const t = nearTown(S); IC.enemyForceOp(S, 'rkt', t); say(S, 'INT', `Rocket fire on ${t.name} from across the border. They deny it, of course.`); raise(S, 4); } });
    B.push({ id: 'embassy', need: () => (doneCount(S) >= 3 && inAct(S) > 14 * 3600) || inAct(S) > 26 * 3600, gap: [3600, 7200], run: () => { say(S, 'INT', `${W.names.A}'s embassy is burning documents. Their airline has cancelled every flight to us from tomorrow.`); raise(S, 8); for (const al of S.av.airlines) if (al.K.foreign) al.sat -= 10; } });
    B.push({ id: 'massing', need: () => st.beats.find(b => b.id === 'embassy').done, gap: [3600, 7200], run: () => { say(S, 'INT', `Satellite pictures: launchers leaving their garrisons, aircraft dispersed to forward fields. This is it. Hours, not days.`); card(S, 'The Eve', U.clock(S.time), `Everything points one way. Whatever is not ready now will not be ready.`, 'chapter'); raise(S, 15); } });
    B.push({ id: 'war', need: () => st.beats.find(b => b.id === 'massing').done, gap: [3600, 5400], run: () => { S.enemy.escalBase = 0.5; IC.enemyOpening(S); startAct(S, 4); } });
  }
  return B;
}
const doneCount = S => S.story.goals.filter(g => g.done).length;
const goalDone = (S, id) => { const g = S.story.goals.find(x => x.id === id); return !!(g && g.done); };
const inAct = S => S.time - S.story.actT;
function raise(S, v) { S.tension = U.clamp((S.tension || 0) + v, 0, 100); }
IC.storyRaise = raise;
function nearTown(S) {
  const c = IC.cities(S).filter(x => !x.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0] || IC.cap(S);
  return { x: c.x, y: c.y, ref: c, name: c.name };
}

/* the collision that ends Act I: a drone nobody could see and a regional airliner */
function collision(S) {
  const st = S.story;
  const cand = S.threats.filter(t => t.tail && !t.dead && !t.appr && t.alt > 3 && IC.inHome(t.x, t.y)).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y));
  const t = cand[0];
  if (!t) { const b = st.beats.find(x => x.id === 'collision'); b.done = false; b.at = S.time + 600; return; }
  const place = IC.nearestPlace(S, t.x, t.y);
  IC.explode(S, t.x, t.y, 0.7, 'air');
  for (let i = 0; i < 10; i++) IC.part(S, { x: t.x, y: t.y, vx: U.rand(-30, 30), vy: U.rand(-30, 30), life: U.rand(1, 2.5), size: 1.2, col: '255,170,90', add: true, drag: 0.6 });
  S.wrecks.push({ x: t.x + U.rand(-8, 8), y: t.y + U.rand(-8, 8), type: 'drone', t: S.time, h: 0 });
  // the airliner survives with a damaged engine and comes down at the nearest airport
  const ap = S.infra.filter(i => i.kind === 'airport' && !IC.aptCanTake(S, i, t.tail.T)).sort((a, b) => U.dist(a, t) - U.dist(b, t))[0];
  t.emergency = true; t.sq = '7700';
  if (ap) { t.toApt = ap.id; t.wps = [{ x: ap.x, y: ap.y }]; t.dest = t.wps[0]; t.plan = { a: { x: t.x, y: t.y }, b: t.dest, cs: t.cs, pts: [{ x: t.x, y: t.y }, t.dest] }; }
  IC.emit(S, 'collision', { t, place });
  IC.log(S, 'leak', 'MAYDAY', `${t.cs} reports a mid-air collision ${place} and is squawking 7700. Diverting to ${ap ? ap.name : 'the nearest airport'}.`, t);
  IC.news(S, `Airliner ${t.cs} collides with an unidentified drone ${place}; emergency landing under way.`);
  IC.sfx && IC.sfx.klaxon();
  card(S, 'Mayday', U.clock(S.time), `${t.cs}, ${t.pax} people on board, has hit something ${place} at ${Math.round(t.alt * 1000).toLocaleString('en-US')} m. The crew report a drone. None of our radars saw it.`, 'alarm');
  (S.later = S.later || []).push({ t: S.time + 900, fn: () => {
    event(S, { title: 'The drone', who: 'Accident investigators', text: `The wreckage is military: a ${S.world.names.A} survey drone, flying without a transponder along our border. ${t.cs} landed safely with one engine. The press wants to know why nobody saw it coming.`,
      opts: [
        { t: `Name ${S.world.names.A} publicly`, tip: 'Minister +6. Tension +10.', fx: () => { S.story.standing += 6; raise(S, 10); S.story.doc.transparency = true; } },
        { t: 'Say only that an investigation is under way', tip: 'Minister −4. Tension unchanged.', fx: () => { S.story.standing -= 4; S.story.doc.quiet = true; } },
        { t: 'Ask the Air Force to watch the border', tip: '+1 command point. Tension +4.', fx: () => { S.story.cp += 1; raise(S, 4); } }
      ], after: () => startAct(S, 2) });
  } });
}

/* GPS jamming along the border pushes airliners off their routes */
function jamming(S) {
  const st = S.story, W = S.world;
  const p = border(S, IC.cap(S));
  S.jam = { x: p.x - p.nx * 120, y: p.y - p.ny * 120, r: 1500, until: S.time + 3 * 3600 };
  say(S, 'ATC', `Airliners near the border are reporting GPS errors. Some are drifting off their routes. Watch for flashing tracks: call them back, or they will wander.`);
  (S.later = S.later || []).push({ t: S.time + 1800, fn: () => event(S, { title: 'Jamming', who: 'Air traffic control', text: `Someone across the border is jamming satellite navigation. Airliners near it drift; one came within 20 km of the border before its crew noticed. Airlines are asking what we intend to do.`,
    opts: [
      { t: 'Move the airways back from the border', tip: 'A prohibited zone is drawn along the border. Airlines fly further. Foreign carriers −5.', fx: () => { const q = border(S, IC.cap(S)); IC.avAddZone(S, q.x - q.nx * 250, q.y - q.ny * 250, 600, 'Border buffer'); for (const al of S.av.airlines) if (al.K.foreign) al.sat -= 5; } },
      { t: 'Warn crews and keep the routes', tip: 'Nothing changes. Incidents continue while the jamming lasts.', fx: () => {} },
      { t: `Protest to ${W.names.A}`, tip: 'Tension +6. The jamming stops sooner.', fx: () => { raise(S, 6); if (S.jam) S.jam.until = S.time + 1800; } }
    ] }) });
}
/* enemy fighters shadow one of our airliners and cross into our airspace */
function shadow(S) {
  const st = S.story, W = S.world;
  const t = S.threats.filter(x => x.tail && !x.dead && x.alt > 5 && IC.inHome(x.x, x.y)).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
  const b = S.esites.find(s => s.kind === 'airbase' && s.nat === 'A');
  if (!t || !b) return;
  for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'ftr', b.x + i * 20, b.y, { home: b, mission: 'shadow', shadow: t, route: [{ x: t.x, y: t.y }], gray: true, noFire: true });
  say(S, 'INT', `Two ${W.names.A} fighters have taken off and are heading for ${t.cs}. They will probably fly alongside it to make a point. If they cross the border, we should meet them.`);
  st.shadowT = S.time;
}
/* drones over the capital airport */
function airportDrones(S) {
  const st = S.story, ap = S.byId[st.cap];
  for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'isr', ap.x + U.rand(-60, 60), ap.y + U.rand(-60, 60), { phase: 'loiter', area: { x: ap.x, y: ap.y }, loiterT: 1500, oa: U.rand(0, 6), home: { x: ap.x + 3000, y: ap.y }, gray: true, small: true, spd: 0.25, alt: 0.3, rcs: 0.02 });
  ap.droneClose = S.time + 1500;
  IC.log(S, 'leak', 'AIRPORT', `Drones reported over ${ap.name}. Arrivals are holding.`, ap);
  event(S, { title: `Drones over ${short(ap.name)}`, who: 'Airport police', text: `Two small drones are circling ${short(ap.name)}. Pilots can see them. Nobody knows who is flying them. Every minute the runway stays shut costs money and patience.`,
    opts: [
      { t: 'Close the runway until they are gone', tip: 'Safe. Arrivals hold and some divert.', fx: () => { ap.closedT = S.time + 1500; } },
      { t: 'Keep operating and watch them', tip: 'Airlines stay happy. If one hits an airliner, it is on you.', fx: () => { st.riskDrones = true; } },
      { t: 'Buy anti-aircraft guns for the airports', tip: 'Gun vehicles become available at 30% off. Minister −3 for the cost.', fx: () => { st.doc.cheapGuns = true; S.story.standing -= 3; } }
    ] });
}
/* the "shoot first?" moment: an aircraft squawking as an airliner leaves its route toward our base */
function dilemma(S) {
  const st = S.story, W = S.world;
  const fb = S.byId.ab_fwd;
  const ports = W.airways.filter(w => w.kind === 'hostile').map(w => w.a);
  const p = border(S, fb);
  const start = { x: p.x - p.nx * 500, y: p.y - p.ny * 500 };
  const mid = { x: p.x + p.nx * 200 + p.ny * 300, y: p.y + p.ny * 200 - p.nx * 300 };
  const far = { x: p.x + p.nx * 2500, y: p.y + p.ny * 2500 };
  const cs = `${W.names.A.slice(0, 3).toUpperCase()} ${U.randi(200, 899)}`;
  const t = IC.spawnThreat(S, 'bmr', start.x, start.y, { disguise: true, cs, sq: IC.squawk(), plan: { a: start, b: far, cs, pts: [start, far] }, route: [mid, { x: fb.x, y: fb.y }, start], mission: 'spy', gray: true, noFire: true, klass0: 'airliner', home: { x: start.x, y: start.y }, alt: 10 });
  t.spy = true; t.d = Object.assign({}, t.d, { name: 'Electronic intelligence aircraft', code: 'ELINT' });
  st.spy = t;
  (S.later = S.later || []).push({ t: S.time + 900, fn: () => {
    if (t.dead) return;
    say(S, 'INT', `${cs} filed a plan across our north and has just turned off it, heading for ${short(fb.name)}. It does not answer. It could be an airliner in trouble. It could be something else. Look before you shoot.`);
    IC.emit(S, 'incident', { kind: 'offroute', t, text: `${cs} left its route toward ${short(fb.name)}` });
  } });
  st.dilemmaT = S.time;
  S.later.push({ t: S.time + 5400, fn: () => { if (!st.dilemmaDone) { st.dilemmaDone = true; if (!st.fired) say(S, 'INT', `${cs} has gone home. They have photographed ${short(fb.name)} from end to end, and we let them. Some will call that restraint.`); } } });
}
IC.on((S, type, d) => {
  if (!S.story) return;
  const st = S.story;
  if (type === 'kill' && d.spy) {
    st.fired = true; st.dilemmaDone = true;
    event(S, { title: 'We fired first', who: 'Prime Minister', text: `The aircraft that left its route was a ${S.world.names.A} intelligence jet with a borrowed airline callsign. It is at the bottom of a lake. They are calling it murder; our people are calling you decisive.`,
      opts: [
        { t: 'Publish the evidence', tip: 'Minister +5. Tension +20.', fx: () => { st.standing += 5; raise(S, 20); } },
        { t: 'Stay silent and let them talk', tip: 'Minister −6. Tension +15.', fx: () => { st.standing -= 6; raise(S, 15); } }
      ], after: () => { st.beats.forEach(b => { if (b.id === 'firstblood') b.fast = true; }); } });
  }
  if (type === 'aff' && d.spy && d.aff === 'H' && d.affWhy === 'visual identification' && !st.spyVid) {
    st.spyVid = true;
    say(S, 'AIR', `Visual on ${d.cs}: not an airliner. A ${S.world.names.A} military jet with sensor pods, squawking a civil code. Escort it out, or bring it down. It is not attacking anyone.`);
  }
  if (type === 'act' || !st.spy) return;
});
/* first blood ends Act II: they shoot, or they answer our shot */
function firstBlood(S) {
  const st = S.story, W = S.world;
  const fb = S.byId.ab_fwd;
  const ours = S.air.find(a => !a.dead && !a.gnd && a.kind === 'ftr');
  const b = S.esites.find(s => s.kind === 'airbase' && s.nat === 'A');
  if (ours && !st.fired && b) {
    // their fighters ambush one of ours near the border
    for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'ftr', ours.x + (ours.x - fb.x) * 0.2 + U.rand(-40, 40), ours.y + (ours.y - fb.y) * 0.2 + U.rand(-40, 40), { home: b, mission: 'patrol', st: { x: ours.x, y: ours.y }, route: [{ x: ours.x, y: ours.y }], border: false, gray: true, aam: 2 });
    say(S, 'AIR', `Hostile fighters closing on ${ours.name}! They have radar lock!`);
  } else {
    // missiles fired at the forward base from across the border
    for (const s of S.esites) if (s.nat === 'A' && (s.kind === 'cm' || s.kind === 'drone')) s.dormant = false;
    IC.enemyForceOp(S, 'cm', { x: fb.x, y: fb.y, ref: fb, name: fb.name }, { n: 2 });
    IC.enemyForceOp(S, 'drones', { x: fb.x, y: fb.y, ref: fb, name: fb.name }, { n: 4 });
    say(S, 'INT', `Launches across the border! Cruise missiles and drones inbound on ${short(fb.name)}. ${st.fired ? 'This is their answer.' : 'They have decided to stop pretending.'}`);
  }
  raise(S, 20);
  (S.later = S.later || []).push({ t: S.time + 2400, fn: () => startAct(S, 3) });
}
/* Act III: the enemy tests the defences without declaring war */
function grayStrike(S) {
  const st = S.story;
  const r = Math.random();
  const radars = S.units.filter(u => u.d.sensor && !u.d.civil && u.state === 'ready' && IC.hostileBorderDist(u.x, u.y) < 1400);
  if (r < 0.4 && radars.length) { const u = U.pick(radars); IC.enemyForceOp(S, 'drones', { x: u.x, y: u.y, ref: u, name: u.name }, { n: U.randi(3, 6) }); say(S, 'INT', `Drones crossing toward ${u.name}. They are hunting our radars.`); }
  else if (r < 0.7) { const fb = S.byId.ab_fwd; IC.enemyForceOp(S, 'cm', { x: fb.x, y: fb.y, ref: fb, name: fb.name }, { n: U.randi(2, 3) }); say(S, 'INT', `Cruise missile launches: ${short(fb.name)} again.`); }
  else { IC.enemyForceOp(S, 'disguise', IC.cap(S)); }
  raise(S, 3);
}

/* ---------- event cards ---------- */
function event(S, e) {
  const st = S.story;
  e.id = IC.nid('ev'); e.t = S.time;
  st.events.push(e);
  IC.sfx && IC.sfx.ui('chapter');
  IC.emit(S, 'event', e);
}
IC.storyEvent = event;
IC.storyChoose = function (S, id, i) {
  const st = S.story, e = st.events.find(x => x.id === id);
  if (!e) return;
  const o = e.opts[i] || e.opts[0];
  o.fx && o.fx();
  st.events = st.events.filter(x => x !== e);
  st.log.push({ t: S.time, title: e.title, choice: o.t });
  IC.log(S, 'info', 'DECISION', `${e.title}: ${o.t}.`);
  e.after && e.after();
  st.standing = U.clamp(st.standing, 0, 100);
};

/* ---------- delegates and requests ---------- */
IC.storyDelegate = function (S, k, on) {
  const st = S.story, D = IC.DELEGATES[k];
  if (!D || st.act < D.act) return false;
  if (on && !st.hired) st.hired = new Set();
  if (on && !st.hired.has(k)) { if (st.cp < D.cp) return false; st.cp -= D.cp; st.hired.add(k); }
  st.del[k] = on;
  if (k === 'eng') for (const b of IC.bases(S)) b.autoRepair = on;
  return true;
};
IC.storyRequest = function (S, id) {
  const st = S.story, R = IC.REQUESTS.find(x => x.id === id);
  if (!R || st.bought.has(id) || st.act < R.act || st.cp < R.cp || S.budget < R.cost) return false;
  st.cp -= R.cp; S.budget -= R.cost; st.bought.add(id);
  R.fn(S);
  return true;
};
function delegates(S, dt) {
  const st = S.story;
  if (st.del.routes) for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q) && q.value > 4) { IC.avDecide(S, q.id, true); IC.log(S, 'info', 'ROUTES', `Route Planning Office approved ${IC.avAirline(S, q.al).name}'s request.`); }
  if (st.del.qra) {
    for (const t of S.threats) {
      if (t.dead || !t.det || t.border || t.d.civil && !t.offFlag) continue;
      if (t.offFlag && t.tail && !t.called) { IC.callAircraft(S, t); continue; }
      if (!(t.aff === 'U' || t.aff === 'S') || !IC.inHome(t.x, t.y) || t.d.cls === 'bal' || t.d.cls === 'cm') continue;
      if (S.air.some(a => a.mission && a.mission.track === t)) continue;
      const r = S.roster.filter(x => x.kind === 'ftr' && x.st === 'ready' && !IC.missionOk(S, x, 'intercept')).sort((p, q) => U.dist(IC.baseOf(S, p.base), t) - U.dist(IC.baseOf(S, q.base), t))[0];
      if (r) { IC.launchAir(S, r, { type: 'intercept', track: t, x: t.x, y: t.y }); IC.log(S, 'info', 'QRA', `QRA Commander scrambled ${r.name} at TN ${t.tn}.`, t); }
    }
  }
  if (st.del.emcon) {
    for (const u of S.units) {
      if (!u.emitter || u.state !== 'ready' || !u.d.sensor) continue;
      const covered = S.units.some(o => o !== u && o.d.sensor && o.radarOn && o.state === 'ready' && U.dist(o, u) < (o.d.sensor.R * 0.5));
      if (u.emcon === 'on' && u.fat > 78 && covered) { u.emcon = 'off'; u.restByDel = true; }
      else if (u.restByDel && (u.fat < 30 || !covered)) { u.emcon = 'on'; u.restByDel = false; }
    }
  }
}

/* ---------- the tick ---------- */
IC.storyTick = function (S, dt) {
  const st = S.story, C = S.camp;
  for (const e of C.sched) if (!e.done && S.time >= e.t) { e.done = true; e.fn(); }
  if (st.act === 1 && !st.paxGoal && inAct(S) > 2 * 3600) st.paxGoal = Math.max(1000, Math.round(S.av.paxHour * 1.33 / 100) * 100);
  // promises are remembered
  if (st.promise && st.act === 1) {
    if (goalDone(S, 'backtrack') && goalDone(S, 'stands')) { st.promise = null; const al = S.av.airlines.find(a => a.kind === 'budget'); if (al) { al.sat += 6; say(S, 'MIN', `You kept your word to ${al.name}. They noticed, and so did I.`); st.standing += 3; } }
    else if (S.time - st.promise > 10 * 3600) { st.promise = null; st.standing -= 6; const al = S.av.airlines.find(a => a.kind === 'budget'); if (al) al.sat -= 10; say(S, 'MIN', `You promised ${al ? al.name : 'that airline'} a taxiway and stands. Nothing has happened. They are telling the newspapers.`); }
  }
  // goals
  for (const g of st.goals) {
    if (g.done || !g.check()) continue;
    g.done = true; st.cp += 1; st.standing = Math.min(100, st.standing + 3);
    IC.log(S, 'kill', 'GOAL', `${g.text.replace(/\s*\(.*\)$/, '')}: done. +1 command point.`);
    IC.sfx && IC.sfx.ui('ok');
    IC.emit(S, 'goal', g);
  }
  // beats: each has its own clock, started when its condition is met
  st.beatT -= dt;
  if (st.beatT <= 0) {
    st.beatT = 20;
    const frac = doneCount(S) / Math.max(1, st.goals.length);
    for (const b of st.beats) {
      if (b.done) continue;
      if (b.at == null) { if (b.need && !b.need()) continue; b.at = S.time + U.rand(b.gap[0], b.gap[1]) * (1 - 0.3 * frac) * (b.fast ? 0.4 : 1); }
      if (b.fast && b.at > S.time + 1800) b.at = S.time + 1800;
      if (S.time < b.at) continue;
      b.n = (b.n || 0) + 1;
      if (b.repeat) b.at = S.time + U.rand(b.repeat[0], b.repeat[1]); else b.done = true;
      b.run();
    }
  }
  // the minister's confidence drifts with how the sector is doing
  st.standT = (st.standT || 0) - dt;
  if (st.standT <= 0) {
    st.standT = 600;
    const sat = avgSat(S);
    // in peacetime the airlines are the measure of you; in war, the country is
    const drift = st.act >= 4 ? (IC.nationalMorale(S) - 45) * 0.01 + (S.enemy.will < 60 ? 0.2 : 0) : (sat - 62) * 0.006;
    st.standing += drift + (S.budget < 0 ? -0.6 : 0) + (st.events.length > 2 ? -0.3 : 0) + (st.standing > 80 ? -0.15 : 0);
    st.standing = U.clamp(st.standing, 0, 100);
    if (st.standing <= 0) IC.gameOver(S, `The Prime Minister has lost confidence in you. You have been replaced.`);
  }
  // unanswered event cards resolve themselves after a while
  for (const e of st.events.slice()) if (S.time - e.t > 3 * 3600) IC.storyChoose(S, e.id, 0);
  delegates(S, dt);
  // jamming and airport closures
  if (S.jam && S.time > S.jam.until) { S.jam = null; say(S, 'ATC', 'The GPS jamming has stopped. For now.'); }
  if (S.jam) for (const t of S.threats) {
    if (t.dead || !t.d.civil || t.called && S.time - t.called < 1200) continue;
    const inJam = U.dist(t, S.jam) < S.jam.r;
    if (inJam && !t.drift && Math.random() < dt / 900) { t.drift = U.pick([-1, 1]) * U.rand(0.18, 0.35); t.jammed = true; }
    if (!inJam && t.drift && t.jammed && Math.random() < dt / 600) { t.drift = 0; t.jammed = false; if (t.tail) { t.wps = t.wps; } }
  }
  for (const ap of IC.bases(S)) if (ap.closedT && S.time > ap.closedT) { ap.closedT = 0; }
  // Act IV: the war runs as the campaign did
  if (st.act >= 4) {
    C.sugT = (C.sugT || 0) - dt;
    if (C.sugT <= 0) { C.sugT = 10; C.objs = IC.suggestions(S); }
    if (S.enemy.will < 20 && !S.over) IC.victory(S, `${S.world.full.A} has asked for a ceasefire. You held.`);
  }
  S.camp.goal = `${IC.ACTS[st.act].name}: ${IC.ACTS[st.act].title}`;
};

/* reactions: the staff and the Minister notice what happens */
IC.on((S, type, d) => {
  if (!S.story) return;
  const st = S.story;
  switch (type) {
    case 'approve': st.cnt.approve++; break;
    case 'aptBuilt': if (d.part.kind === 'apron') st.cnt.apron++; break;
    case 'zone': st.cnt.zone++; break;
    case 'divert': st.standing -= 0.4; break;
    case 'routeCut': st.standing -= 3; if (IC.tipOnce(S, 'cut', 3 * 3600)) say(S, 'MIN', `${d.al.name} is cutting flights and telling the papers why. Fix what they complain about.`); break;
    case 'tailDestroyed': st.standing -= st.act >= 4 ? 2 : 10; break;
    case 'civilKill': st.standing -= 35; if (d.tail || d.d.civil) IC.news(S, `The Director of ${IC.ACTS[st.act].role.includes('Civil') ? 'Civil Aviation' : 'Airspace Security'} faces calls to resign.`); break;
    case 'gridlock': if (IC.tipOnce(S, 'grid', 3 * 3600)) say(S, 'APT', `${d.ap.name}: two aircraft met nose to nose on a single taxiway. Parallel taxiways let traffic flow both ways.`); break;
    case 'sortie': d.orderT = S.time; break;
    case 'airborne': if (d.mission && (d.mission.type === 'intercept' || d.mission.type === 'cap') && d.orderT != null) { const dt = S.time - d.orderT; st.cnt.quickest = Math.min(st.cnt.quickest, dt); if (IC.tipOnce(S, 'qra1')) say(S, 'AIR', `${d.name} airborne ${U.dur(dt)} after the order. ${dt > 420 ? 'Too slow. An alert pad at the runway end and a short taxi would halve that.' : 'Good.'}`); } break;
    case 'aff': if (d.affWhy === 'visual identification' && !d.d.civil && IC.inHome(d.x, d.y)) st.cnt.vid++; break;
    case 'kill': if (d.gray && st.act === 2 && !d.spy) { raise(S, 8); if (IC.tipOnce(S, 'grayKill', 3600)) say(S, 'INT', `We shot down their ${d.d.name.toLowerCase()}. They will say it was over their side of the border. They will remember it.`); } break;
    case 'acLost': st.standing -= 3; break;
    case 'unmasked': st.standing += 2; break;
    case 'incident': break;
  }
});
IC.tipOnce = function (S, key, cool) {
  const c = S.camp.cool;
  if (c[key] != null && (cool == null || S.time - c[key] < cool)) return false;
  c[key] = S.time; return true;
};

})(window.IC);
