/* Iron Canopy — the career. You start as Director of Civil Aviation and end as Chief of the Air Force.
   Each act has goals (achievements) that move it along, a slow build-up of strange and then hostile incidents,
   and a triggering event that hands you the next job. Decisions arrive as event cards with consequences. Act I is
   a civil aviation game of its own, in chapters: build the national airport, run it, design the airspace, light
   aircraft, a second city's airport, the economy. Each chapter opens with an event and shows its goals two at a
   time; systems the player has not reached stay hidden. The Minister's confidence is your standing: it costs you
   money when it is low, and from Act III, a full day at zero and you are replaced. */
(function (IC) {
'use strict';
const U = IC.U;

/* grants are ₭M a live hour; the Career runs for years, so a month (72 live hours at three days a month) of the
   Act I grant is about ₭70M: running money, not building money. Building money comes from the airlines, and the
   ₭5.5 billion at the start dwindles for a player who builds more than they use. */
IC.ACTS = {
  1: { name: 'Act I', title: 'The Director', role: 'Director of Civil Aviation', grant: 1 },
  // from Act II the military budget grows with the job, for a country of sixty cities: from Act III a share of the
  // city taxes comes on top (IC.STORY_TAX)
  2: { name: 'Act II', title: 'Quiet Skies', role: 'Director of Airspace Security', grant: 4 },
  3: { name: 'Act III', title: 'The Shield', role: 'Commander, Air Defence Command', grant: 60 },
  4: { name: 'Act IV', title: 'The Storm', role: 'Chief of the Air Force', grant: 40 }
};
/* delegates take routine work off your hands once your rank allows it */
IC.DELEGATES = {
  routes: { name: 'Route Planning Office', act: 1, cost: 0.4, cp: 1, desc: 'Signs airline deals our airports can carry and that pay their way, at list charges.' },
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
  if (type === 'ssr') return !IC.storyLock(S, 'radar');
  if (st.act >= 4) return true;
  if (st.act >= 3) return d.cat !== 'strike';
  if (st.act >= 2) return ['gf', 'mr3d', 'acou'].includes(type) || (type === 'spaag' && st.doc.cheapGuns);
  return false;
};
IC.roomAllowed = function (S, room) {
  const st = S.story; if (!st) return room !== 'aviation' || !!S.av;
  const need = { air: 2, intel: 2, research: 3, logi: 3, industry: 3 }[room];
  return !need || st.act >= need;
};
IC.staffCost = S => { const st = S.story; if (!st) return 0; let v = st.extraUp || 0; for (const k in st.del) if (st.del[k]) v += IC.DELEGATES[k].cost; return v; };

/* ---------- start ---------- */
IC.storyForces = function (S) {
  const W = S.world, apts = S.infra.filter(i => i.kind === 'airport');
  // a civil radar at each airport there is (the Career starts with none: the player builds the first)
  for (const ap of apts) {
    const p = IC.findSpot(S, 'ssr', ap.x, ap.y, ap.radius + 20, ap.radius + 120);
    if (p) { const u = IC.makeUnit(S, 'ssr', p.x, p.y, { instant: true }); u.name = `${ap.name.replace(/ (International|Airport)$/, '')} SSR`; }
  }
  S.reserve = {};
  // the Treasury's budget for the national airport, and running money
  S.budget = apts.length ? 220 : IC.CAREER_START;
  S.airspace = 'open';
};
IC.CAREER_START = 5500;   // the owner's ₭5.5 billion: a big national airport that becomes the income engine, the radars the airways need, and room for mistakes
IC.storyInit = function (S) {
  const W = S.world;
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: '', objs: [], goal: '', sched: [], cool: {}, day: null };
  S.tension = 0;
  const st = S.story = { act: 1, standing: 62, cp: 0, grant: IC.ACTS[1].grant, goals: [], done: new Set(), events: [], doc: {}, del: { routes: false, eng: true, qra: false, emcon: false, logi: false }, bought: new Set(),
    beats: [], beatT: S.time + 900, cnt: { approve: 0, apron: 0, vid: 0, quickest: 1e9, zone: 0, calls: 0, taxi: 0, parked: 0, overT: [], losT: 0, infT: [] }, actT: S.time, log: [], growth: 0, fired: false,
    ch: 0, chT: S.time, chLog: [], past: [], tut: true, grant0: IC.ACTS[1].grant, feeHist: [] };
  const E = S.enemy;
  E.allow = new Set();
  for (const s of S.esites) s.dormant = true;
  // in peacetime nobody fires without an order
  S.ad.roe = 'hold';
  // the military bases are not ours yet
  for (const b of S.infra.filter(i => i.kind === 'airbase')) b.locked = true;
  const apts = S.infra.filter(i => i.kind === 'airport');
  // the Career builds its airports; the 'network' preset starts with three, the first chapter behind it
  st.fresh = !apts.length;
  if (apts.length) {
    st.cap = (apts.find(a => a.template === 'intl' || a.showcase) || apts[0]).id;
    st.bad = (apts.find(a => a.template === 'regional_bad') || apts[1]).id;
    st.reg = (apts.find(a => a.template === 'regional_ok') || apts[1]).id;
    st.opened = true;
  }
  const cc = IC.cap(S);
  S.camp.focus = { x: cc.x, y: cc.y, z: 0.5 };
  if (st.fresh) Object.assign(S.layers, { coverage: false, airways: false, rings: false });
  startAct(S, 1);
};

function say(S, who, text) { IC.say(S, who, text); }
function card(S, title, sub, text, kind, x) { IC.card(S, title, sub, text, kind, x); }
const apName = (S, id) => S.byId[id].name;
const short = n => n.replace(/ (International|Airport|Air Base)$/, '');

/* ---------- goals ---------- */
function goalsFor(S, act) {
  const st = S.story, bad = S.byId[st.bad], cap = S.byId[st.cap];
  const G = [];
  if (act === 1) return chapterGoals(S, st.ch);
  if (act === 2) {
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
  }
  for (const x of G) IC.remake(x, 'storyGoal', S, 'act', act, x.id);
  return G;
}
/* a saved goal takes its check() and texts from a fresh one (save.js) */
IC.REMAKE.storyGoal = (S, kind, n, id) => (kind === 'ch' ? chapterGoals(S, n) : goalsFor(S, n)).find(g => g.id === id);
const avgSat = S => { const L = S.av.airlines.filter(a => !a.gone); return L.length ? L.reduce((s, a) => s + a.sat, 0) / L.length : 50; };
IC.avgSat = avgSat;

/* ---------- Act I: the chapters ----------
   Each opens with an event (the first two with the story itself) and brings its goals. The next opens when enough
   goals are done and the chapter has run its minimum time, or anyway after its fallback time, so a thoughtful
   player is never rushed and a stuck one is never stuck for ever. min and max are calendar months: the airlines
   come an offer at a time, a month or two apart, and cities grow by the year, so a chapter takes seasons. */
const H = 3600;
const MO = (S, n) => IC.MO(S, n);
IC.ACT1_MIN_MO_F = 12;  // (round 4) with the chapters moving on their goals: the scripted player's Act I takes at least a year
IC.ACT1_MIN_MO = 36;  // calendar months a good player needs for Act I: three years (the tests hold the scripted player to it)
IC.CHAPTERS = [
  { title: 'The national airport', min: 0, max: 0, need: 6 },
  { title: 'The capital’s airport', min: 10, max: 15, need: 7, wait: 'more airlines have seen the airport work' },
  { title: 'The airspace', min: 10, max: 14, need: 4, wait: 'the airways have carried a season of traffic' },
  { title: 'Light aircraft', min: 8, max: 11, need: 2, wait: 'the flying clubs have settled in' },
  { title: 'A second city', min: 15, max: 20, need: 3, wait: 'the new airport has found its passengers' },
  { title: 'The economy', min: 14, max: 16, need: 3, wait: 'the Treasury has seen the figures' }
];
/* (round 4, IC.FOCUS.progress) the chapters move on when their goals are done, not after so many months: each needs
   its goals (fneed: all of them, or all but one where one may be out of reach for a while), the calendar still turns, and only the last chapter
   keeps a few months before the story's turn to Act II (fmin). max stays as the safety net for a stuck player. */
const CH_FOCUS = [{ fmin: 0, fneed: 7 }, { fmin: 0, fneed: 7 }, { fmin: 0, fneed: 4 }, { fmin: 0, fneed: 3 }, { fmin: 0, fneed: 3 }, { fmin: 6, fneed: 3 }];
const chMin = n => IC.FOCUS.progress ? CH_FOCUS[n].fmin : IC.CHAPTERS[n].min;
const chNeed = n => IC.FOCUS.progress ? CH_FOCUS[n].fneed : IC.CHAPTERS[n].need;
IC.storyChMin = chMin;
const capApt = S => S.story.cap ? S.byId[S.story.cap] : null;
const built = (ap, k) => !!ap && ap.parts.some(p => p.kind === k && p.built && p.hp > 0);
const stands = (ap, size) => ap ? IC.aptStands(ap).filter(s => s.linked !== false && s.hp > 0 && (!size || IC.STAND_FITS[s.size].includes(size))).length : 0;
/* open to airliners of a type: runway, stand, fire cover, a terminal and fuel */
const openTo = (S, ap, type) => !!ap && !IC.aptCanTake(S, ap, IC.ACTYPES[type]) && built(ap, 'terminal') && built(ap, 'fuel');
IC.storyOpenTo = openTo;
function building(ap, kind) {
  const w = ap && ap.works.find(x => x.part && x.part.kind === kind);
  return w ? `being built: ${U.pct(w.prog || 0)}${w.wait ? ` · ${w.wait}` : ''}` : '';
}
const recent = (L, span, now) => L.filter(t => now - t < span).length;
const gatesOn = S => IC.aspGates(S).filter(f => S.asp.ways.some(w => w.a === f.id || w.b === f.id)).length;
function portsOnNet(S) {
  const ap = capApt(S); if (!ap) return 0;
  return IC.avPorts(S).filter(p => IC.aspRoute(S, { x: ap.x, y: ap.y, apt: ap.id }, { x: p.x, y: p.y })).length;
}
function wayCover(S) {
  let L = 0, c = 0;
  for (const w of S.asp.ways) { const [a, b] = IC.aspWayEnds(S, w), l = U.dist(a, b); L += l; c += l * IC.aspWayCover(S, w, 9); }
  return L ? c / L : 0;
}
const clubMood = S => { const F = S.asp.fields; return F.length ? F.reduce((s, f) => s + f.mood, 0) / F.length : 50; };
const dayPax = S => Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0);
/* airline fees over the last day, from hourly snapshots of the fee ledger */
function feesDay(S) {
  const st = S.story, now = S.av.feeTotal || 0;
  const old = st.feeHist.find(h => S.time - h.t <= 86400 + 60);
  return old ? now - old.v : 0;
}
const served = S => IC.cities(S).filter(c => c.owner === 'us' && c.air && c.air.score >= 0.1).length;
const dealsOn = S => S.av.deals.filter(d => d.st === 'active').length;
const dealsDone = S => S.av.deals.filter(d => d.clean).length;
const hangarNeed = S => { const ap = capApt(S); if (!ap) return { need: 0, have: 0 }; return { need: IC.aptNeeds(S, ap).hangar, have: IC.aptProvides(ap).hangar }; };
const quietFor = (S, since) => S.time - Math.max(since || 0, S.story.chT);

function chapterGoals(S, ch) {
  const st = S.story, cc = IC.cap(S), G = [];
  const A = () => capApt(S), nm = () => A() ? short(A().name) : 'the airport';
  const refA = { get ref() { return A() || cc; } };
  // goals point at the capital's airport until they name their own place (getters stay live)
  const g = o => { const x = Object.create(refA); Object.defineProperties(x, Object.getOwnPropertyDescriptors(o)); G.push(x); return x; };
  if (ch === 0) {
    g({ id: 'found', text: `Found the national airport within 60 km of ${cc.name}`, ref: cc,
      how: `Open the Aviation room (V) and press “Found a new airport”. Click flat, open ground 15–40 km from ${cc.name}: close enough for passengers, far enough that jets do not fly low over homes. The runway starts into the prevailing wind; turn it with R or by dragging along it, and click elsewhere to move the site. The survey shows the cost; Found (or Enter) commits.`,
      check: () => !!st.cap, gives: 'the survey, and its runway placed' });
    g({ id: 'runway', text: 'Build a runway at least 2.1 km long', gives: 'room for jets', check: () => ((A() && A().st.longest) || 0) >= IC.ACTYPES.narrow.rwy, prog: () => building(A(), 'runway'),
      how: `After Found, the surveyed runway waits on the map with its taxiways and landing systems: press Build beside it (or Enter). Or open Blueprints on the build bar (B) and pick the Starter airport: runway, taxiways, a terminal with eight stands, tower, fire station and fuel, as one plan at one price. 3 km of concrete takes every airliner and costs ₭15M per 100 m.` });
    g({ id: 'apron', text: 'Build an apron with a taxiway to the runway', gives: 'stands for airliners', check: () => stands(A(), 'm') > 0, prog: () => building(A(), 'apron') || building(A(), 'taxi'),
      how: 'Under Airport pieces pick Terminal with apron and click beside the parallel taxiway: the terminal, its apron, its stands and the taxilane come as one piece, turned to face the runway and joined to the taxiway. (Detail has the apron and the taxiway one by one.)' });
    g({ id: 'terminal', text: 'Build a terminal beside the apron', gives: 'passengers', check: () => built(A(), 'terminal'), prog: () => building(A(), 'terminal'),
      how: 'The Terminal with apron piece brings it. Stands next to a terminal get a jet bridge and turn aircraft round faster.' });
    g({ id: 'services', text: 'Build a fire station near the runway, and a fuel farm', gives: 'jets may land and refuel', check: () => !!(A() && A().st.fire) && built(A(), 'fuel'), prog: () => building(A(), 'fire') || building(A(), 'fuel'),
      how: 'Under Airport pieces pick Services and click beside the runway: a tower, a fire station whose trucks reach the runway in under 3 minutes (airliners need one), and fuel, set outside the runway strip.' });
    // (round 1: no rule punishes before it is taught: the first winter's fog and snow divert every arrival without one)
    g({ id: 'ils0', text: 'Put a landing system (ILS) on the runway: fog and snow close it without one', gives: 'flights in fog and snow', check: () => built(A(), 'ils'), prog: () => building(A(), 'ils'),
      how: 'In fog, low cloud or snow a pilot cannot see the runway until the last moment: without a landing system every arrival diverts to another country, and the airline is paid back. Winter has fog most mornings. The Runway with taxiways piece comes with one at each end; on its own it is under Navaids (₭25M), placed at the end aircraft land toward.' });
    g({ id: 'first', text: 'Welcome the first airliner', gives: 'Chapter 2: airlines and deals', check: () => st.cnt.parked > 0, prog: () => st.opened ? 'the first flights are on their way' : 'airlines come when the airport can take them',
      how: IC.FOCUS.hands ? 'Building goes in stages and materials come by lorry: the airport\'s panel lists each job under Building, and Finish now runs time on until they are done. Speed time up' : 'Building goes in stages and materials come by lorry: the Works tab shows each job and why it waits. One engineer crew works one job at a time; + Crew in the Works tab adds another. Speed time up (keys 1–6) while you wait. When the airport can take a jet, the first airlines send their flights: zoom in to watch one land and taxi to its stand.' });
  } else if (ch === 1 && IC.FOCUS.progress) {
    // (round 4) one thread, each a few minutes of play, none of them a wait; the Starter ticks none of them
    const flag = () => S.av.airlines.find(a => a.kind === 'flag'), fn = () => flag() ? flag().name : 'The flag carrier';
    g({ id: 'hangar', get text() { return `Build a hangar for ${fn()}’s based aircraft`; }, gives: 'keeps its first deal', check: () => { const h = hangarNeed(S); return h.have > 0 && h.have >= h.need; }, prog: () => { const h = hangarNeed(S); return building(A(), 'hangar') || `${h.have} of ${Math.max(1, h.need)} spaces`; },
      get how() { return `${fn()} bases its aircraft here and services them between flights: its first deal gives you a month to build a hangar, then warns, then walks out. The marker at the apron places one (₭60M, it holds two aircraft): beside a taxiway, away from the runway.`; } });
    g({ id: 'approve', text: 'Sign a new deal: offers show on the map at the airport', gives: '+₭30M from the Ministry', pay: 30, check: () => st.cnt.approve >= 1,
      how: 'An airline\'s offer shows as a green marker at the airport and in the airport\'s panel: click it to read its card. It offers so many flights a day for so many months, at your charges, if the airport has what they need. Each line under the offer is a facility they check: build what is missing, then sign.' });
    g({ id: 'pax1', text: 'Carry 2,000 passengers in a day', gives: 'opens the Terminal with a pier', check: () => dayPax(S) >= 2000, prog: () => `${Math.round(dayPax(S)).toLocaleString('en-US')} a day now`,
      how: 'Every flight brings and takes its passengers through the terminal. More deals, more flights: sign what the airlines offer.' });
    g({ id: 'stands', get text() { return `Grow to ${(st.s0 || 8) + 6} stands`; }, gives: '+₭40M from the Ministry', pay: 40, check: () => stands(A()) >= (st.s0 || 8) + 6, prog: () => `${stands(A())} of ${(st.s0 || 8) + 6}`,
      how: 'Under Airport pieces: Terminal with apron (six stands with jet bridges) or, once it opens, the Terminal with a pier. Click beside the parallel taxiway; it joins the taxiways by itself.' });
    g({ id: 'deals3', text: 'Sign three new deals', gives: '+₭50M from the Ministry', pay: 50, check: () => st.cnt.approve >= 3, prog: () => `${Math.min(3, st.cnt.approve)} of 3` });
    g({ id: 'happy', text: 'Three airlines, satisfied: average 65%', gives: 'the Minister’s confidence +5', conf: 5, check: () => S.av.airlines.length >= 3 && avgSat(S) >= 65, prog: () => `${S.av.airlines.length} airlines, ${Math.round(avgSat(S))}% now`,
      how: 'Airlines judge every visit: a short taxi, a free stand, a jet bridge, fuel on time, no delays. The airport panel lists what is wrong.' });
    g({ id: 'pax3', text: 'Carry 6,000 passengers in a day', gives: 'opens a second runway, and +₭60M', pay: 60, check: () => dayPax(S) >= 6000, prog: () => `${Math.round(dayPax(S)).toLocaleString('en-US')} a day now` });
    g({ id: 'deals', text: 'Six deals running at once', gives: 'Chapter 3: the airspace', check: () => dealsOn(S) >= 6, prog: () => `${dealsOn(S)} of 6` });
  } else if (ch === 1) {
    g({ id: 'approve', text: IC.FOCUS.hands ? 'Sign a deal with an airline: its offer shows on the map at the airport' : 'Sign a deal with an airline (Aviation room → Deals)', check: () => st.cnt.approve >= 1,
      how: (IC.FOCUS.hands ? 'An airline\'s offer shows as a green marker at the airport and in the airport\'s panel: click it to read its card. It offers ' : 'Airlines offer deals in the Aviation room (V): ') + 'so many flights a day for so many months, at your charges, if the airport has what they need. Each line under the offer is a facility they check: build what is missing, then sign. Ask for more and the contract is shorter; give a little and it is longer.' });
    g({ id: 'hangar', text: 'Hangar space for the aircraft based here', check: () => { const h = hangarNeed(S); return h.have > 0 && h.have >= h.need; }, prog: () => { const h = hangarNeed(S); return building(A(), 'hangar') || `${h.have} of ${Math.max(1, h.need)} spaces`; },
      how: `${S.av.airlines[0] ? S.av.airlines[0].name : 'The flag carrier'} bases its aircraft here and must service them: its deal gives you a day to build a hangar. A hangar holds two aircraft; put it beside a taxiway, away from the runway.` });
    g({ id: 'tower', text: 'Build a control tower', check: () => built(A(), 'tower'), prog: () => building(A(), 'tower'),
      how: 'Without a tower, arrivals and departures are kept 8 minutes apart. With one, 2 minutes: the tower is the cheapest capacity there is.' });
    g({ id: 'ends', text: 'Stop the backtracking: a taxiway to a runway end', check: () => { const r = A() && A().st.rwy && A().st.rwy[0]; return !!(r && r.threshold); },
      how: 'An aircraft that has to taxi along the runway to line up blocks it for minutes. A taxiway that reaches the runway end lets it wait beside the runway instead.' });
    g({ id: 'ils', text: 'Install a landing system (ILS) on the runway end arrivals use most', check: () => built(A(), 'ils'), prog: () => building(A(), 'ils'),
      how: 'In fog and low cloud, every arrival diverts from a runway end without a landing system. Place it at the end aircraft land toward in the prevailing west wind; the airport panel warns when one is missing.' });
    g({ id: 'stands', text: 'Grow to 10 stands joined to the runway', check: () => stands(A()) >= 10, prog: () => `${stands(A())} now` });
    g({ id: 'deals', text: 'Five deals running at once', check: () => dealsOn(S) >= 5, prog: () => `${dealsOn(S)} now` });
    g({ id: 'honour', text: 'See a deal through to its end with no bad days', check: () => dealsDone(S) >= 1, prog: () => `${dealsOn(S)} running`,
      how: 'A deal ends well when its flights leave and land on time: an airline counts a day with a quarter of its flights late (over 20 minutes) or cancelled as a bad day. Honoured deals raise the airport’s name, and a better name brings offers sooner.' });
    g({ id: 'pax', text: 'Carry 6,000 passengers in a day', check: () => dayPax(S) >= 6000, prog: () => `${Math.round(S.av.day.pax).toLocaleString('en-US')} today` });
    g({ id: 'happy', text: 'Three airlines, satisfied: average 70%', check: () => S.av.airlines.length >= 3 && avgSat(S) >= 70, prog: () => `${S.av.airlines.length} airlines, ${Math.round(avgSat(S))}% now` });
  } else if (ch === 2) {
    g({ id: 'gates', text: 'Place three entry points on the border, each on an airway', gives: '+₭40M from the Ministry', pay: 40, check: () => gatesOn(S) >= 3, prog: () => `${gatesOn(S)} of 3`,
      how: 'Aviation room → Draw airways. Click on the border where traffic from abroad comes in: a fix within 25 km of the border is an entry point (a ringed triangle). Click on toward the capital to lay an airway; right-click ends it. Faint dashed lines show where the traffic wants to go.' });
    g({ id: 'link', text: `Join ${nm()} to the airways, with routes to two foreign airports`, gives: '+₭40M from the Ministry', pay: 40, check: () => portsOnNet(S) >= 2, prog: () => `${portsOnNet(S)} foreign airports reachable on airways`,
      how: 'An airport joins the airways at the nearest fix within 120 km. Lay airways from it to the entry points: airliners then fly them in and out, and controllers know where to look.' });
    g({ id: 'radar', text: 'Put up a civil radar that sees 80% of the airways', gives: 'controllers see every airliner', check: () => wayCover(S) >= 0.8, prog: () => `${U.pct(wayCover(S))} of the airways seen at cruise height`,
      how: 'Pick the Secondary Surveillance Radar (bottom left) and place it between the airways, on open high ground if you can: it sees 400 km at cruise height, less behind hills. Amber stretches of airway are ones it cannot see.' });
    g({ id: 'over', text: 'Bring 15 overflights a day onto our airways', gives: '₭0.5M for each of them', check: () => recent(st.cnt.overT, 86400, S.time) >= 15, prog: () => `${recent(st.cnt.overT, 86400, S.time)} in the last day`,
      how: 'Traffic crossing the country pays route charges: twice as much when it flies our airways, because controllers give it a service. Airways between entry points on opposite borders catch it.' });
    if (IC.FOCUS.progress) g({ id: 'appr', text: `Build an approach radar at ${nm()}`, gives: '60 s between arrivals', check: () => built(A(), 'atc'), prog: () => building(A(), 'atc'),
      how: 'Detail → Navaids → Approach radar (₭110M), beside the runway outside its strip. It sees 45 km round the airport, transponder or not, and lets the tower space arrivals a minute apart instead of two.' });
    else g({ id: 'calm', text: 'Twelve hours without a loss of separation', check: () => quietFor(S, st.cnt.losT) >= 12 * H, prog: () => `${U.dur(quietFor(S, st.cnt.losT))} so far` });
  } else if (ch === 3) {
    const k = st.contract;
    g({ id: 'field', get gives() { const c = st.contract; return c && c.grant ? 'the Minister’s confidence +3, and the grant' : 'the Minister’s confidence +3'; }, get text() { const c = st.contract, t = c && S.byId[c.town]; return !c ? 'A light-aircraft field' : c.refused ? `Field at ${t.name}: declined` : c.late ? `Field at ${t.name}: too late` : `Build the light-aircraft field at ${t.name}${c.grant ? ` (grant ${U.money(c.grant)})` : ''}`; },
      get ref() { const c = st.contract; return c ? S.byId[c.town] : cc; },
      check: () => !!(st.contract && (st.contract.done || st.contract.refused || st.contract.late)), fail: () => !!(st.contract && (st.contract.refused || st.contract.late)), prog: () => st.contract && !st.contract.done && !st.contract.refused ? `${U.dur(Math.max(0, st.contract.due - S.time))} left` : '',
      how: 'Aviation room → Light-aircraft field, then click open ground within 15 km of the town. Flying clubs fly from the nearest field; one far from town is one they drive to and grumble about.' });
    g({ id: 'clubs', text: 'Keep the flying clubs content: average mood 65%', gives: '+₭30M from the Ministry', pay: 30, check: () => clubMood(S) >= 65, prog: () => `${Math.round(clubMood(S))}% now` });
    g({ id: 'quiet', text: 'Fewer than 3 light aircraft straying into a control zone in a day', gives: 'Chapter 5: a second city', check: () => S.time - st.chT >= 12 * H && recent(st.cnt.infT, 86400, S.time) < 3, prog: () => `${recent(st.cnt.infT, 86400, S.time)} in the last day${S.time - st.chT < 12 * H ? `; judged after ${U.dur(12 * H - (S.time - st.chT))}` : ''}`,
      how: 'Careless pilots fly straight through control zones. Call them on the radio (select the track), and a field of their own away from the airport keeps them out of it.' });
  } else if (ch === 4) {
    const c2 = S.byId[st.city2], a2 = () => st.apt2 && S.byId[st.apt2];
    g({ id: 'found2', text: `Found an airport within 60 km of ${c2.name}`, gives: 'a second airport', ref: c2, check: () => !!a2(),
      how: `Aviation room → Found a new airport, near ${c2.name}. The same rules as the first: flat ground, the runway into the wind, few homes under the approach.` });
    g({ id: 'open2', text: `Open ${c2.name}’s airport: runway, apron, terminal and fuel`, gives: '+₭80M from the region', pay: 80, get ref() { return a2() || c2; }, check: () => openTo(S, a2(), st.size2 === 'jets' ? 'narrow' : 'turbo'),
      prog: () => a2() ? (IC.aptCanTake(S, a2(), IC.ACTYPES.turbo) || (!built(a2(), 'terminal') ? 'no terminal yet' : !built(a2(), 'fuel') ? 'no fuel farm yet' : '')) : '',
      how: st.size2 === 'jets' ? `${c2.name} wants jets: 2.1 km of runway, fire cover and medium stands. The demand is there to fill them.` : 'A regional airport can start small: 1.5 km of runway takes turboprops, which need no fire station. Jets need 2.1 km and fire cover; build for them when the demand comes.' });
    g({ id: 'route2', text: `A regional airline flies ${short(capApt(S).name)} – ${c2.name}`, gives: 'Chapter 6: the economy', check: () => !!st.apt2 && S.av.routes.some(r => r.st === 'active' && r.flown > 0 && ((r.a === st.cap && r.b.apt === st.apt2) || (r.a === st.apt2 && r.b.apt === st.cap))) });
  } else if (ch === 5) {
    g({ id: 'cargo', text: 'Fly freight: sign a cargo deal and see it flown', gives: 'freight fees, at night', check: () => S.av.routes.some(r => r.type === 'cargo' && r.st === 'active' && r.flown > 0),
      prog: () => { const ap = A(), T = IC.ACTYPES.cargo; return ap ? IC.aptCanTake(S, ap, T) || (built(ap, 'cargo') ? '' : 'no cargo terminal yet') : ''; },
      how: 'A freighter needs 2.9 km of runway, a large stand in the cargo zone and a cargo terminal that can handle its tonnes: the cargo airline’s offer lists each. Freight flies at night and pays more per landing.' });
    if (IC.FOCUS.progress) g({ id: 'pax10', text: 'Carry 15,000 passengers in a day', gives: 'opens the Round terminal', check: () => dayPax(S) >= 15000, prog: () => `${Math.round(dayPax(S)).toLocaleString('en-US')} a day now`,
      how: 'A hub carries fifteen thousand a day: more gates (the pier), more deals, and a second runway (it opens at 6,000).' });
    else g({ id: 'name', text: 'Raise the national airport’s name to 70', check: () => !!A() && IC.aptRep(A()) >= 70, prog: () => A() ? `${Math.round(IC.aptRep(A()))} now` : '',
      how: 'Every deal honoured to its end raises the airport’s name; a broken one costs more than a good one earns. The Aviation room shows it.' });
    g({ id: 'fees', text: 'Earn ₭150M in airline fees in a day', gives: '+₭80M from the Ministry', pay: 80, check: () => feesDay(S) >= 150, prog: () => `${U.money(feesDay(S))} in the last day`,
      how: 'Fees come per landing and per passenger. Charges are set per airport (its Operations): higher charges earn more per flight and drive airlines away if they are too high.' });
    g({ id: 'served', text: 'Air service for 4 cities within 2½ hours’ drive', gives: 'the cities grow faster', check: () => served(S) >= 4, prog: () => `${served(S)} cities now`,
      how: 'People fly from the airports they can reach by road. The Economy room shows each city’s demand; a road link to an airport (select the airport, Roads) widens its reach.' });
  }
  for (const x of G) IC.remake(x, 'storyGoal', S, 'ch', ch, x.id);
  return G;
}

/* ---------- chapter openers: the leader or the regions ask, and the player chooses how ---------- */
function startChapter(S, n, quiet) {
  const st = S.story, C = IC.CHAPTERS[n], W = S.world;
  if (st.goals.length && st.chLog.length) { st.past.push(...st.goals); st.cp += 1; }
  st.ch = n; st.chT = S.time; st.asking = false; st.waitT = 0; st.hurry = false;
  st.chLog.push({ ch: n, t: S.time });
  if (n === 1) st.s0 = stands(capApt(S));
  st.goals = chapterGoals(S, n);
  S.camp.chapter = `Act I · ${C.title}`;
  // (round 4) a goal already met as the chapter opens is ticked as a moment of its own, not found ticked later
  if (IC.FOCUS.progress) for (const g of st.goals) if (n > 0 && g.check()) { g.done = g.pre = true; g.doneT = S.time; goalPaid(S, g); IC.log(S, 'kill', 'GOAL', `Already done: ${g.text.replace(/\s*\(.*\)$/, '')}.${g.gives ? ` ${goalGives(g)}.` : ''}`); }
  const sub = U.clock(S.time, S), ap = capApt(S);
  if (n === 0) card(S, `Chapter 1 · ${C.title}`, sub, `Pick a site near ${IC.cap(S).name}, lay a runway, an apron, a terminal and the services an airliner needs, and bring in the first flight. The goals panel shows what to do next and why.`, 'chapter');
  else if (n === 1) {
    if (!quiet) card(S, `Chapter 2 · ${C.title}`, sub, `The first airliner is on its stand. Now make the airport work: airlines judge every visit by the taxi, the delays and the fees, and they bring more flights where they are happy.`, 'chapter');
    say(S, 'APT', `Every minute an aircraft spends on the runway is a minute nobody else can use it. A control tower lets flights follow each other in two minutes instead of eight; a taxiway to the runway end stops departures backtracking along it.`);
    say(S, 'ATC', `Ivo Marsh, air traffic control. For now my people work the old way: every flight direct, kept apart by time. It holds while the sky is quiet. Tell me when it is not.`);
  } else if (n === 2) {
    Object.assign(S.layers, { coverage: true, airways: true, rings: true });
    card(S, `Chapter 3 · ${C.title}`, sub, `Airliners cross ${W.names.H} wherever they like and controllers keep them apart by timing alone. The Minister wants a proper airspace: entry points on the border, airways between them and the airport, and radar that sees it all.`, 'chapter');
    say(S, 'ATC', `The airway editor is yours now (Aviation room → Draw airways). Entry points first: fixes on the border where traffic from abroad comes in. Then airways from them to ${ap ? short(ap.name) : 'the airport'}. Flights on airways need half the attention, and I can release them a minute apart.`);
    say(S, 'ATC', `Civil radar is in the build list too. My controllers keep apart what they can see; the rest they space by the clock, and the clock is slow.`);
  } else if (n === 3) {
    card(S, `Chapter 4 · ${C.title}`, sub, `Light aircraft fly low and slow, by sight, and not always with a transponder. The flying clubs want room; the airliners want them out of the way. Fields of their own do both.`, 'chapter');
    say(S, 'ATC', `Light-aircraft fields are open to you now (Aviation room). A club flies from the nearest field within 40 km; with none, from our airport, where each one holds the runway as long as two airliners.`);
  } else if (n === 4) {
    card(S, `Chapter 5 · ${C.title}`, sub, `${S.byId[st.city2].name} wants its own airport. A second airport means a second runway to keep open, a second terminal to staff, and a domestic route the capital has never had. Keep it off ${short(ap.name)}’s approach paths and away from its busy airways.`, 'chapter');
    say(S, 'FIN', `Karl Ostrow, Finance. The national airport has cost the treasury a great deal. The banks will lend now (Economy room): borrow for a runway that pays for itself, not for running costs.`);
  } else if (n === 5) {
    card(S, `Chapter 6 · ${C.title}`, sub, `Air service grows cities and carries their trade. The Treasury wants civil aviation to pay its own way: freight, fees and passengers from every city within reach.`, 'chapter');
    say(S, 'FIN', `Karl Ostrow, Finance. The Economy room shows what every city wants from the air and what every line of your budget does. Cargo pays best: a freighter carries 110 tonnes and flies at night when your runway is quiet.`);
    newAirline(S, 'cargo', 0);
  }
  IC.emit(S, 'storyChapter', n);
}
IC.storyStartChapter = startChapter;
IC.storyNewAirline = (...a) => newAirline(...a);
/* a new airline comes, and asks for its first route */
function newAirline(S, kind, delay, hub, to) {
  const ap = hub || capApt(S); if (!ap) return null;
  const ports = IC.avPorts(S), have = new Set(S.av.airlines.filter(a => a.K.foreign).map(a => a.country));
  let extra;
  if (kind === 'foreign') { const p = ports.find(q => !have.has(q.k)); if (!p) return null; extra = { country: p.k }; }
  const al = IC.avAddAirline(S, kind, ap, extra), T = { cargo: 'cargo', regional: 'turbo' }[kind] || 'narrow';
  const dest = to || (kind === 'foreign' ? ports.find(p => p.k === al.country) : U.pick(ports));
  IC.avRequest(S, al, ap, dest.apt ? dest : dest, T, kind === 'cargo' ? 1 : 2, kind === 'cargo' ? 'wants to start freight flights' : `wants to start flying to ${ap.name.replace(/ (International|Airport)$/, '')}`, MO(S, 1));
  say(S, 'APT', `${al.name}, ${al.K.style.toLowerCase()}, ${kind === 'cargo' ? 'wants to fly freight from' : 'wants to fly to'} ${short(ap.name)}. Their offer is in the Aviation room, with what they need from us.${kind === 'cargo' && IC.aptCanTake(S, ap, IC.ACTYPES.cargo) ? ` ${short(ap.name)} cannot take a freighter yet: ${IC.aptCanTake(S, ap, IC.ACTYPES.cargo)}.` : ''}`);
  return al;
}
// (the opener asks again after so many months)
const later = (S, mo) => { const st = S.story; st.asking = false; st.waitT = S.time + MO(S, mo); };
/* the chapter openers: each picks what it needs and asks with an event card (EV below) */
const OPEN = {
  2: S => event(S, 'airspace', S.story.hurry),
  3: S => {
    const ap = capApt(S);
    const towns = IC.cities(S).filter(c => c.owner === 'us' && !c.capital && c.pop >= 120 && !S.asp.fields.some(f => U.dist(f, c) < 300)).sort((a, b) => U.dist(a, ap) - U.dist(b, ap));
    event(S, 'field', towns[0] || IC.cities(S).filter(c => !c.capital)[0], U.pick([0, 0, 5, 8]));
  },
  4: S => {
    const st = S.story, ap = capApt(S);
    // a city asks only when its demand is there (growth.js): people who want to fly and no airport within reach.
    // Until then the chapter waits; long after its fallback time, the largest unserved city asks anyway.
    const ask = IC.cityAsks(S, 150), age = (S.time - st.chT) / MO(S);
    if (!ask && age < IC.CHAPTERS[3].max + 6) { later(S, 0.1); return; }
    const c2 = ask ? ask.city : IC.cities(S).filter(c => c.owner === 'us' && !c.capital && U.dist(c, ap) > 1500).sort((a, b) => IC.cityUnserved(b) - IC.cityUnserved(a))[0];
    st.city2 = c2.id; st.size2 = ask ? ask.size : 'turbo';
    event(S, 'city2', c2, U.pick([0, 150, 250]), Math.round(IC.cityUnserved(c2) / 100) * 100, st.size2);
  },
  5: S => event(S, 'grant')
};
/* Event cards, by name: each makes the card from what it is given, so a saved card gets its choices back (save.js).
   Anything random is picked before, by the caller. */
const EV = {
  airspace: (S, hurry) => {
    const st = S.story;
    return { title: 'A sky with a plan', who: IC.ADVISORS.MIN.name, text: `${hurry ? 'After what happened over the capital, the airlines have written to the Prime Minister. ' : 'The airlines have written to the Prime Minister. '}Flights wander into ${S.world.names.H} anywhere, departures sit waiting for a gap, and the controllers are at the end of their tether. I want proper airspace: entry points on the border, airways, radar. It is your job, Director.`,
      opts: [
        { t: 'Design it yourself', tip: 'The airway editor and civil radar open. Nothing is drawn for you.', fx: () => startChapter(S, 2) },
        { t: 'Hire consultants: ₭60M', tip: 'They draw three entry points and airways to the capital. You still need radar, and can change what they drew.', fx: () => { IC.pay(S, 'other', 60); consultants(S); startChapter(S, 2); } },
        { t: 'Not yet: the airport comes first', tip: 'Minister −4. She asks again in two months.', fx: () => { st.standing -= 4; later(S, 2); } }
      ] };
  },
  field: (S, t, grant) => {
    const st = S.story;
    return { title: `A field for ${t.name}`, who: `${t.name} town council`, text: `${t.name}’s flying club has lost its old strip to a housing estate. The council asks you to build a light-aircraft field within 15 km of the town within a month${grant ? `, and offers ${U.money(grant)} towards it` : ', though it has no money to offer'}. A field costs ${U.money(IC.ASP.FIELD_COST)}.`,
      opts: [
        { t: 'Accept the contract', tip: `${grant ? `${U.money(grant)} now. ` : ''}Build it within a month: done well, Minister +3 and the clubs’ mood rises; late, Minister −6.`, fx: () => { st.contract = { town: t.id, grant, due: S.time + MO(S, 1) }; if (grant) { S.budget += grant; IC.econBook(S, 'oneoff', grant); } startChapter(S, 3); } },
        { t: 'Decline', tip: 'Minister −3. Every flying club’s mood −10.', fx: () => { st.contract = { town: t.id, grant: 0, refused: true }; st.standing -= 3; for (const f of S.asp.fields) f.mood = Math.max(0, f.mood - 10); startChapter(S, 3); } }
      ] };
  },
  city2: (S, c2, grant, want, size2) => {
    const st = S.story, ap = capApt(S);
    return { title: `An airport for ${c2.name}`, who: IC.ADVISORS.GOV.name, text: `${c2.name} is ${U.km(U.dist(c2, ap))} from ${short(ap.name)}: over ${Math.round(IC.U.dist(c2, ap) / 10 / 90 + 0.5)} hours by road, too far to fly from it. Some ${want.toLocaleString('en-US')} of its people would fly every day if they could. ${size2 === 'jets' ? 'That is enough for jets from the start.' : 'A regional field for turboprops would do to begin with; it can grow when they fill it.'} The region wants an airport of its own${grant ? `, and will put ${U.money(grant)} towards it` : ', and has no money to put towards it'}.`,
      opts: [
        { t: 'Agree', tip: `${grant ? `${U.money(grant)} now. ` : ''}Founding opens again in the Aviation room.`, fx: () => { if (grant) { S.budget += grant; IC.econBook(S, 'oneoff', grant); } startChapter(S, 4); } },
        { t: 'Ask the region for more money', tip: `${U.money(grant + 100)} instead. The Governor gives it, and tells the Minister you haggled: Minister −4.`, fx: () => { S.budget += grant + 100; IC.econBook(S, 'oneoff', grant + 100); st.standing -= 4; startChapter(S, 4); } },
        { t: 'Not yet', tip: `Minister −2 and ${c2.name}’s morale −5. The Governor asks again in three months.`, fx: () => { st.standing -= 2; c2.morale = Math.max(0, c2.morale - 5); st.city2 = null; later(S, 3); } }
      ] };
  },
  grant: S => {
    const st = S.story;
    return { title: 'Pay your own way', who: IC.ADVISORS.FIN.name, text: `The Treasury built you an airport; it will not run it for ever. From today your grant is halved, to ${U.money(IC.ACTS[1].grant / 2)} an hour, unless you give me a reason.`,
      opts: [
        { t: 'Accept the cut', tip: 'Grant halved. Minister +3: she likes a director who does not complain.', fx: () => { st.grantCut = 0.5; st.standing += 3; startChapter(S, 5); } },
        { t: 'Raise airport charges by 15% instead', tip: 'The grant stays. Every airport’s charges ×1.15; every airline −6 satisfaction.', fx: () => { for (const b of IC.bases(S)) if (b.kind === 'airport') IC.avSetFee(S, b, (b.feeLevel || 1) * 1.15); for (const al of S.av.airlines) al.sat -= 6; startChapter(S, 5); } },
        { t: 'Argue for a season’s grace', tip: 'Minister −5. The grant stays for three months, then is halved anyway.', fx: () => { st.standing -= 5; st.grantCutT = S.time + MO(S, 3); startChapter(S, 5); } }
      ] };
  },
  drone: (S, t) => ({ title: 'The drone', who: 'Accident investigators', text: `The wreckage is military: a ${S.world.names.A} survey drone, flying without a transponder along our border. ${t.cs} landed safely with one engine. The press wants to know why nobody saw it coming.`,
    opts: [
      { t: `Name ${S.world.names.A} publicly`, tip: 'Minister +6. Tension +10.', fx: () => { S.story.standing += 6; raise(S, 10); S.story.doc.transparency = true; } },
      { t: 'Say only that an investigation is under way', tip: 'Minister −4. Tension unchanged.', fx: () => { S.story.standing -= 4; S.story.doc.quiet = true; } },
      { t: 'Ask the Air Force to watch the border', tip: '+1 command point. Tension +4.', fx: () => { S.story.cp += 1; raise(S, 4); } }
    ], after: () => startAct(S, 2) }),
  jam: S => ({ title: 'Jamming', who: 'Air traffic control', text: `Someone across the border is jamming satellite navigation. Airliners near it drift; one came within 20 km of the border before its crew noticed. Airlines are asking what we intend to do.`,
    opts: [
      { t: 'Move the airways back from the border', tip: 'A prohibited zone is drawn along the border. Airlines fly further. Foreign carriers −5.', fx: () => { const q = border(S, IC.cap(S)); IC.avAddZone(S, q.x - q.nx * 250, q.y - q.ny * 250, 600, 'Border buffer'); for (const al of S.av.airlines) if (al.K.foreign) al.sat -= 5; } },
      { t: 'Warn crews and keep the routes', tip: 'Nothing changes. Incidents continue while the jamming lasts.', fx: () => {} },
      { t: `Protest to ${S.world.names.A}`, tip: 'Tension +6. The jamming stops sooner.', fx: () => { raise(S, 6); if (S.jam) S.jam.until = S.time + 1800; } }
    ] }),
  aptDrones: (S, ap) => {
    const st = S.story;
    return { title: `Drones over ${short(ap.name)}`, who: 'Airport police', text: `Two small drones are circling ${short(ap.name)}. Pilots can see them. Nobody knows who is flying them. Every minute the runway stays shut costs money and patience.`,
      opts: [
        { t: 'Close the runway until they are gone', tip: 'Safe. Arrivals hold and some divert.', fx: () => { ap.closedT = S.time + 1500; } },
        { t: 'Keep operating and watch them', tip: 'Airlines stay happy. If one hits an airliner, it is on you.', fx: () => { st.riskDrones = true; } },
        { t: 'Buy anti-aircraft guns for the airports', tip: 'Gun vehicles become available at 30% off. Minister −3 for the cost.', fx: () => { st.doc.cheapGuns = true; S.story.standing -= 3; } }
      ] };
  },
  fired: S => {
    const st = S.story;
    return { title: 'We fired first', who: 'Prime Minister', text: `The aircraft that left its route was a ${S.world.names.A} intelligence jet with a borrowed airline callsign. It is at the bottom of a lake. They are calling it murder; our people are calling you decisive.`,
      opts: [
        { t: 'Publish the evidence', tip: 'Minister +5. Tension +20.', fx: () => { st.standing += 5; raise(S, 20); } },
        { t: 'Stay silent and let them talk', tip: 'Minister −6. Tension +15.', fx: () => { st.standing -= 6; raise(S, 15); } }
      ], after: () => { st.beats.forEach(b => { if (b.id === 'firstblood') b.fast = true; }); } };
  }
};
EV.jets = (S, ap, c, lf) => {
  const st = S.story;
  return { title: `Jets for ${c.name}`, who: IC.ADVISORS.GOV.name, text: `${short(ap.name)}’s turboprops fly ${U.pct(lf)} full and people are turned away. The region asks you to take jets there: 2.1 km of runway, fire cover and medium stands. Airlines will bring bigger aircraft when it can take them.`,
    opts: [
      { t: 'Agree: jets within six months', tip: 'Done in time: Minister +3 and the city grows faster. Late: Minister −4.', fx: () => { st.grow2 = { due: S.time + MO(S, 6) }; } },
      { t: 'Not yet', tip: `Minister −2. ${c.name}’s morale −5.`, fx: () => { st.standing -= 2; c.morale = Math.max(0, c.morale - 5); } }
    ] };
};
EV.city3 = (S, c, unserved, size) => {
  const st = S.story;
  return { title: `${c.name} wants to fly`, who: `${c.name} city council`, text: `${c.name} is beyond the reach of every airport we have, and some ${unserved.toLocaleString('en-US')} of its people a day would fly if they could. The council asks for ${size === 'jets' ? 'an airport that takes jets' : 'a regional field for turboprops'}, open within nine months. It will not be the capital’s rival: a regional airport lives on flights to the hub.`,
    opts: [
      { t: 'Accept', tip: 'Founding opens again. Open within nine months: Minister +3. Late: Minister −4.', fx: () => { st.contract3 = { due: S.time + MO(S, 9), size }; } },
      { t: 'Decline', tip: `Minister −2. ${c.name}’s morale −8.`, fx: () => { st.standing -= 2; c.morale = Math.max(0, c.morale - 8); st.city3 = null; st.city3No = true; } }
    ] };
};
IC.REMAKE.storyEvent = (name, S, ...args) => EV[name](S, ...args);
IC.EV = EV;   // (round 4) the peacetime deck adds its cards here (deck.js), made and saved by name like the rest
/* what the consultants draw: an entry point where the way to each of the three nearest foreign airports crosses
   the border, a fix near the airport, and airways between them */
function consultants(S) {
  const ap = capApt(S); if (!ap) return;
  const ports = IC.avPorts(S).slice().sort((a, b) => U.dist(a, ap) - U.dist(b, ap)).slice(0, 3);
  let hub = null;
  for (const p of ports) {
    let q = null;
    for (let i = 1; i <= 60; i++) { const x = ap.x + (p.x - ap.x) * i / 60, y = ap.y + (p.y - ap.y) * i / 60; if (!IC.inHome(x, y)) { q = { x, y }; break; } }
    if (!q) continue;
    if (!hub) { const d = U.dist(ap, p), k = Math.min(1, 500 / d); hub = IC.aspAddFix(S, ap.x + (p.x - ap.x) * k * 0.5, ap.y + (p.y - ap.y) * k * 0.5); }
    const f = IC.aspAddFix(S, q.x, q.y);
    if (f && hub) IC.aspAddWay(S, hub.id, f.id);
  }
  IC.log(S, 'info', 'AIRSPACE', `The consultants have drawn ${IC.aspGates(S).length} entry points and airways to ${short(ap.name)}.`);
}
/* the chapter clock: when the next opener comes */
function chapterTick(S) {
  const st = S.story;
  if (st.act !== 1 || st.ch === 0 || st.ch >= 5 || st.asking || !capApt(S)) return;
  if (st.waitT && S.time < st.waitT) return;
  const C = IC.CHAPTERS[st.ch], age = (S.time - st.chT) / MO(S);
  // a near miss or overloaded controllers force the airspace question early
  const forced = st.ch === 1 && st.hurry && age >= chMin(st.ch) * 0.75 && !IC.FOCUS.progress;
  if (!forced && !((doneCount(S) >= chNeed(st.ch) && age >= chMin(st.ch)) || age >= C.max)) return;
  st.asking = true;
  OPEN[st.ch + 1](S);
}
/* how far the current chapter is: for the goals panel */
IC.storyChapterInfo = function (S) {
  const st = S.story; if (!st || st.act !== 1) return null;
  const C = IC.CHAPTERS[st.ch], age = (S.time - st.chT) / MO(S);
  const waitCity = st.ch === 3 && doneCount(S) >= chNeed(st.ch) && age >= chMin(st.ch) && !IC.cityAsks(S, 150);
  if (IC.FOCUS.progress) {
    // (round 4) what opens the next chapter, said as something to do: never "in about N months"
    const left = chNeed(st.ch) - doneCount(S), hub = IC.NETWORK.hubPax, pax = Math.round(dayPax(S));
    const next = st.ch === 0 ? 'The first airliner opens the next chapter.' : st.ch >= 5 ? (left > 0 ? `${left} more goal${left > 1 ? 's' : ''} and the Act is done.` : 'Every goal of Act I is done. Keep the airports growing: the story moves on.')
      : waitCity ? (pax < hub ? `The next chapter comes when a city beyond the capital’s reach wants to fly: carry ${hub.toLocaleString('en-US')} passengers a day through the capital (${pax.toLocaleString('en-US')} now) and the regions will ask.` : 'The next chapter comes when a city beyond the capital’s reach has enough people who want to fly: cities grow with the air service you give them.')
      : left > 0 ? `${left} more goal${left > 1 ? 's' : ''} open${left > 1 ? '' : 's'} the next chapter.` : 'The next chapter is opening.';
    return { n: st.ch, title: C.title, age, of: IC.CHAPTERS.length, next };
  }
  return { n: st.ch, title: C.title, age, of: IC.CHAPTERS.length, next: st.ch === 0 ? 'The first airliner opens the next chapter.' : st.ch >= 5 ? '' : waitCity ? `The next chapter comes when a city beyond the capital’s reach wants to fly: ${IC.NETWORK.hubPax.toLocaleString('en-US')} passengers a day through the capital show the country that flying works.` : doneCount(S) >= C.need ? (age >= C.min ? 'Something new is coming.' : `Something new comes in about ${U.months((C.min - age) * MO(S))}, when ${C.wait || 'the sector has grown into what you built'}.`) : `${C.need - doneCount(S)} more goal${C.need - doneCount(S) > 1 ? 's' : ''} open${C.need - doneCount(S) > 1 ? '' : 's'} the next chapter. It comes anyway in ${U.months(Math.max(0, C.max - age) * MO(S))}.` };
};
/* the goals to show: at most two open ones, in order */
IC.storyShown = function (S) {
  const st = S.story; if (!st) return [];
  if (st.act !== 1) return st.goals.map((g, i) => ({ g, i }));
  const L = []; let open = 0;
  st.goals.forEach((g, i) => { if (g.done) L.push({ g, i }); else if (open < 2) { open++; L.push({ g, i }); } });
  return L;
};
/* the tutorial's prompt: how to do the first open goal, and where (for the goals panel or a hint layer); null
   when the player has hidden the tips or there is nothing to explain */
IC.storyTip = function (S) {
  const st = S.story; if (!st || st.act !== 1 || !st.tut) return null;
  const g = st.goals.find(x => !x.done && x.how);
  return g ? { id: g.id, text: g.how, ref: g.ref || null } : null;
};
/* what is hidden until the story reaches it: '' when open, else why not */
const LOCKS = {
  airways: [2, 'The airway editor opens when the Minister asks you to design the airspace (Chapter 3).', 'The airway editor'],
  airspace: [2, 'Airspace design comes with the airspace chapter (Chapter 3).', 'Airspace design'],
  radar: [2, 'Civil radar comes with the airspace chapter (Chapter 3).', 'Civil radar'],
  coverage: [2, 'Radar cover comes with the airspace chapter (Chapter 3).', 'Radar cover'],
  fields: [3, 'Light-aircraft fields come with Chapter 4.', 'Light-aircraft fields'],
  zones: [9, 'Prohibited zones come with Act II, when there is something to keep airliners away from.'],
  // the economy opens a lever at a time, each with its lesson (the Economy room)
  charges: [1, 'Airport charges open in Chapter 2, once the airlines are flying.', 'Airport charges'],
  statement: [2, 'The weekly statement opens with Chapter 3.', 'The monthly statement'],
  loans: [4, 'The banks lend from Chapter 5, when a second airport is on the table.', 'Loans from the banks'],
  roads: [4, 'Roads to your airports open with Chapter 5.', 'Roads to your airports'],
  trade: [5, 'Cities, growth and trade open with the economy (Chapter 6).', 'Cities, growth and trade']
};
IC.storyLock = function (S, key) {
  const st = S.story; if (!st || !st.fresh || st.act > 1) return '';
  if (key === 'found') return !st.cap || (st.ch >= 4 && st.city2) || st.contract3 ? '' : st.ch < 4 ? 'A second airport comes later, when a city far from the capital wants to fly (Chapter 5).' : '';
  const L = LOCKS[key]; if (!L || st.ch >= L[0]) return '';
  if (!IC.FOCUS.progress || L[0] > 5) return L[1];
  // (round 4) what opens it, in one line: the chapter it comes with, and the goals between here and there
  const left = Math.max(0, chNeed(st.ch) - doneCount(S)), g = st.goals.find(x => !x.done && !x.failed);
  return `${L[2]}: opens with Chapter ${L[0] + 1} (${U.lc(IC.CHAPTERS[L[0]].title)}), ${st.ch === L[0] - 1 ? `after ${left} more goal${left === 1 ? '' : 's'} here${g ? ` (next: ${g.text.replace(/\s*\(.*\)$/, '')})` : ''}` : `${L[0] - st.ch} chapters on; each opens when the one before has its goals done`}.`;
};
/* ---------- the Guide: lessons the player has reached ----------
   Each lesson opens at a point in the Career (act, and in Act I the chapter). The Guide shows the ones reached, the
   current chapter's first; outside the Career it shows them all. */
IC.GUIDE = [
  { id: 'airport', act: 1, ch: 0, t: 'Airports are built part by part', d: 'Runways, taxiways, aprons, terminals, hangars, fuel farms, tower and fire station are separate parts at real size. Aircraft taxi along the network you build: a runway with no exit near where aircraft stop blocks it for minutes, a runway with no taxiway to its ends makes every departure backtrack, and a single taxiway carries traffic one way at a time. The airport panel lists what is wrong.' },
  { id: 'buildbar', act: 1, ch: 0, t: 'The build bar', d: 'Select one of your airports and the build bar opens along the bottom of the screen (B, or Build in the top bar). It opens on whole pieces (Shift+1): a runway with its taxiways, terminals with their apron and stands, services, a cargo area; Blueprints (Shift+2) has a whole starter airport. Each is placed with a click, turned with R and built with Build or Enter. Detail has the parts one by one, with their pavement, width, lights, stand size and zone. Then click the map: a green ghost is buildable, a red one says why not, and the tag by the cursor gives the price and the work time. Upgrade (U) relays a runway, taxiway or apron for the difference in price, Move (M) picks a building up, Bulldoze (Del) shows what comes back before you click, Ctrl+Z undoes, and Info views (I) show taxi congestion, stand use, how far passengers walk, fuel and fire cover, noise over the towns and what each runway can take.' },
  { id: 'building', act: 1, ch: 0, t: 'Building takes time, money and materials', d: 'Engineers build in stages: survey, earthworks, paving, markings and lights, then the opening. Each stage is paid as it runs, and paving uses concrete, asphalt and steel that lorries bring from the nearest town with industry: when the site runs out, work stops and the panel says why. Paving next to a runway closes it, unless you set the job to night work. Homes in the way are bought and cleared; their town will not thank you.' },
  { id: 'pavement', act: 1, ch: 0, t: 'Pavement', d: 'Asphalt is cheap and quick but heavy aircraft break it up; concrete carries every airliner; reinforced concrete craters less and is patched faster. Grass is for light aircraft only. A worn runway closes until it is resurfaced.' },
  { id: 'time', act: 1, ch: 0, t: 'Months and years', d: 'Two clocks run. The live one is the day and night you watch: aircraft, weather and building take their real minutes and hours. The calendar in the top bar counts months: each is three days and nights, so the Career runs for years. Airlines make offers every month or two, deals run for months and years, research takes months and cities grow by the year. When there is nothing to do but wait for money, press Wait (7) and pick what you are saving for: time runs fast and stops when you can afford it, when the month turns, or when something needs you.' },
  { id: 'money1', act: 1, ch: 0, t: 'Money in, money out', d: 'At first the money comes from the Treasury: a large sum to build the national airport, and a small grant an hour. Once airlines fly, they pay a landing fee for every aircraft and a charge for every passenger. What you build costs a little every hour to keep (0.12% of its price), so build what the airlines will use. The Economy room (E) shows both sides.' },
  { id: 'deals', act: 1, ch: 1, t: 'Airline deals', d: 'Airlines offer deals: an aircraft type, so many flights a day for so many months, at your charges. Under each offer is what they need from the airport: stands of the right size, gates at the terminal, hangar space for aircraft they base here, cargo handling, fuel and room in the terminal. They sign only when every line is met. Ask for higher charges and the contract is shorter; give a discount and it is longer. A deal can be exclusive when the airline asks: it pays more and no rival gets the route. Once signed, keep your side: a day with a quarter of its flights late or cancelled is a bad day, and three end the deal (a month of good days forgives one). A broken deal costs compensation and the airport’s name, and a poor name brings fewer offers.' },
  { id: 'runway', act: 1, ch: 1, t: 'Runway capacity', d: 'Without a tower, arrivals and departures are kept 8 minutes apart; with one, 2 minutes; an approach radar tightens it further. A taxiway to each runway end stops departures backtracking, and exits where landing aircraft slow down free the runway sooner.' },
  { id: 'weather', act: 1, ch: 1, t: 'Wind and fog', d: 'Aircraft take off and land into the wind; each type has a crosswind limit, so a runway across the prevailing wind closes in a gale. In fog and low cloud arrivals need a landing system (ILS) on the end they land on, or they divert.' },
  { id: 'charges', act: 1, ch: 1, t: 'Charges and stands', d: 'Each airport has list charges (its panel, or the Economy room). Higher charges earn more per flight and make new deals harder to sign; low-cost airlines leave first. A stand earns its keep by turning aircraft round: the Economy room shows what each earned in the last day, and a stand that earned nothing was built too early.' },
  { id: 'airspace', act: 1, ch: 2, t: 'Airspace', d: 'Entry points are fixes within 25 km of the border: once there are any, traffic from abroad joins the airways only there. Controllers keep apart the flights they see on radar. Off the airways, or where radar does not reach, they space flights by time alone: fewer flights an hour, longer delays, and crossings that can go wrong. Radar sees less the lower an aircraft flies: hills and the curve of the earth hide it.' },
  { id: 'radio', act: 1, ch: 2, t: 'Radio and routes', d: 'Every airliner flies a filed route. One that leaves it flashes on the map: call it on the radio. A real airliner answers and turns back; something pretending to be one does not.' },
  { id: 'over', act: 1, ch: 2, t: 'Route charges', d: 'Traffic crossing the country without landing pays route charges: twice as much on our airways, where controllers give it a service. Airways between entry points on opposite borders catch it.' },
  { id: 'light', act: 1, ch: 3, t: 'Light aircraft', d: 'Flying clubs fly slow and low, by sight, from grass fields and from our airports. On a big airport’s runway each one takes as long as two airliners, so a field near the capital frees the runway. They must stay out of control zones unless cleared: call strays on the radio.' },
  { id: 'network', act: 1, ch: 4, t: 'A national network', d: 'People fly from airports within two and a half hours’ drive. A city beyond that asks for an airport of its own when enough of its people want to fly; its size follows that demand: a regional field for turboprops first, jets when they fill it. Keep a new airport off the approach and departure paths of the others and away from their busy airways.' },
  { id: 'loans', act: 1, ch: 4, t: 'Loans and roads', d: 'The banks lend for big projects over one to four years, repaid evenly with 1% interest a month: borrow for a runway or a road that brings in more than it costs, never for running costs. A road link to an airport brings more people within reach of it.' },
  { id: 'growth', act: 1, ch: 5, t: 'Growth, trade and cargo', d: 'Air service grows cities and carries their trade. Remote industries sell more with a fast road to a city and air cargo within four hours; freighters need a cargo terminal and fly at night. Cities pay taxes later in the Career.' },
  { id: 'money', act: 2, ch: 0, t: 'Money', d: IC.MONEY_GUIDE },
  { id: 'detect', act: 2, ch: 0, t: 'Detect, classify, identify', d: 'VHF radars see far but only give positions. Radars with IFF read transponders and check them against filed flight plans. Type recognition (NCTR) tells a bomber from an airliner, but only inside a shorter range. A fighter flying up to look settles it. Weapons Tight fires only on identified hostiles.' },
  { id: 'sweep', act: 2, ch: 0, t: 'Sweeps and coasting tracks', d: 'A rotating radar updates a track only when its beam passes. Between paints the track glides on its last speed and heading. With no paint for a while it keeps coasting, still selectable, inside a dashed ellipse of where the aircraft could be; after two and a half minutes (less for missiles) it is lost. Aircraft flying together show as one raid, in a box with their number.' },
  { id: 'intercept', act: 2, ch: 0, t: 'Intercepts', d: 'Select a fighter flight (on the map, or Select in the Air room) and click a track: the map shows where they would meet, how long it takes, the fuel left after, the missiles and the kill chance. Enter commits. The fighters fly to the meeting point, not after the symbol. The air picture on the left lists every track that is not a known friend, the most dangerous first; Tab steps through the hostiles.' },
  { id: 'alert', act: 2, ch: 0, t: 'Alert, patrols, tankers, early warning', d: 'A flight on 5-minute alert is airborne within five minutes, but its crews tire; on 30-minute alert they rest. A standing combat air patrol sends the relief before the aircraft on station must go home. A tanker on its track tops fighters up. An early-warning aircraft sees cruise missiles over hills and across the border, and fighters under it can fire on them; a fighter\'s own radar sees low fliers only close in. A fighter sent to look at an unknown settles what it is: an airliner off its route, or a hostile.' },
  { id: 'spectrum', act: 2, ch: 0, t: 'Radar spectrum', d: 'Radars on the same band close together blind each other, and every extra radar on a crowded band costs more to keep. Spread them out, mix bands, or buy a spectrum plan.' },
  { id: 'damage', act: 2, ch: 0, t: 'Damage lands where it lands', d: 'A crater splits a runway into shorter strips; landing needs a strip long enough. A cut taxiway strands whatever is behind it. Burning fuel tanks set fire to tanks close by: spread them out. Aircraft in a hardened shelter usually survive; aircraft on an open stand usually do not.' },
  { id: 'envelope', act: 3, ch: 0, t: 'Missile envelopes', d: 'Reach is longest head-on and shrinks against crossing or receding targets and down low. Semi-active and command-guided missiles need the battery radar on until impact. Aircraft fight back with chaff, flares and notching.' },
  { id: 'holdfire', act: 3, ch: 0, t: 'Why a battery holds fire', d: 'A battery with hostiles near that is not firing says why under its symbol and in its panel: weapons status, identity, radar silent, below its horizon, masked by a hill, jammed on that bearing, out of its missiles\' height band or reach, or everything in reach already has interceptors on the way.' },
  { id: 'fatigue', act: 3, ch: 0, t: 'Crew fatigue', d: 'Radars that radiate for hours while raids come in wear their crews out: slower reactions, slower reloads, more misses. Stand some down while others cover.' },
  { id: 'gaps', act: 3, ch: 0, t: 'Routes and gaps', d: 'Cruise missiles and drones fly low, where a radar only sees as far as its horizon and not behind hills. The enemy plans them through the holes in the cover it knows about. Gap fillers, overlapping radars and moving batteries after they have been seen close the holes.' },
  { id: 'jamming', act: 3, ch: 0, t: 'Jamming', d: 'A jammer floods a radar along its own bearing: there the radar only sees what is close enough to burn through, about a third of the way to the jammer. The amber wedge on the map is its strobe: a direction, not a range. Two radars far apart put their strobes across each other and locate it. MR and LR missiles can home on a jammer without a track. Radars with better ECCM suffer less.' },
  { id: 'supply', act: 3, ch: 0, t: 'Supply', d: IC.SUPPLY_GUIDE + ' Helicopters fly emergency loads to empty batteries.' },
  { id: 'callin', act: 3, ch: 0, t: 'Call-in teams', d: 'Press G and click anywhere in our territory: a helicopter drops a shoulder-fired missile team there in seconds. It fights drones, helicopters and low jets for a few minutes, then is lifted out. Charges come back on a timer.' },
  { id: 'raids', act: 4, ch: 0, t: 'Raids', d: 'The enemy raids in cycles. A build-up first: an intelligence warning about an hour out, a reconnaissance drone, drones probing the flanks, then a jammer taking station. Then the raid: drones and decoys a few minutes early to soak up missiles, cruise and ballistic missiles at the peak, stragglers after. Then a calm of a few hours: repair, reload, move batteries. Each raid ends with a report of what got through and why.' },
  { id: 'campaign', act: 4, ch: 0, t: 'The enemy\'s campaign', d: 'The enemy commander has an aim (to coerce the government, break morale, strangle trade, or ground our air power) and picks targets that serve it: power stations and cities, bridges and roads, airports and factories, fuel, our radars and batteries, the air bases, the government. It keeps an aim for days and changes it when its raids keep failing. The war comes in four acts. First probes: drones and single missiles to see what fires. Then limited strikes on soft targets, while it saves its big missiles. Then the shock: one large strike on several targets at once, paid for with what it saved, followed by a lull. Then a campaign against our air power: radars first, then batteries it has seen fire a lot, then supply, then the air base. It moves on when our defence has been winning for a while; a strong defence brings the campaign sooner. Intelligence sees the saving (in the Intel room): strikes on those sites and their launchers set it back.' },
  { id: 'ballistic', act: 4, ch: 0, t: 'Ballistic missiles', d: 'Only hit-to-kill rounds stop warheads. The upper tier (High-Altitude BMD) meets them 40 to 150 km up; BMD rounds in the LRSAM meet them below 35 km. A battery waits, then fires two interceptors at the point where they will meet the warhead; whatever the upper tier misses, the lower tier still gets a shot at.' },
  { id: 'towns', act: 4, ch: 0, t: 'Towns', d: 'Towns pay taxes and power industry. Sirens and damage lower their morale.' }
];
/* the lessons reached: { now, past }, the current stage's lessons first; everything outside the Career */
IC.guideFor = function (S) {
  const st = S.story;
  if (!st) return { now: [], past: IC.GUIDE.slice() };
  const at = g => g.act < st.act || (g.act === st.act && (st.act > 1 || g.ch <= st.ch));
  const cur = g => g.act === st.act && (st.act > 1 || g.ch === st.ch);
  const L = IC.GUIDE.filter(at), now = L.filter(cur), w = IC.storyMeanwhile(S);
  if (w) now.unshift(w);
  return { now, past: L.filter(g => !cur(g)).reverse() };
};
/* while a chapter waits on time rather than on the player: what is worth doing meanwhile, from what is open */
IC.storyMeanwhile = function (S) {
  const st = S.story; if (!st || st.act !== 1 || st.ch === 0 || st.ch >= 5) return null;
  const C = IC.CHAPTERS[st.ch], age = (S.time - st.chT) / MO(S);
  if (IC.FOCUS.progress || doneCount(S) < C.need || age >= C.min) return null;
  const tips = [];
  const free = S.tech.slots.some(x => !x), open = IC.TECH.filter(t => t.cat === 'apt' && !S.tech.done.has(t.id) && !IC.researching(S, t.id) && t.req.every(r => S.tech.done.has(r)));
  if (free && open.length) tips.push(`Research: ${open.slice(0, 2).map(t => `${t.name.toLowerCase()} (${IC.techDur(S, t)})`).join(' or ')} in the Research room.`);
  if (S.av.requests.length) tips.push(`An airline offer is waiting in the Aviation room.`);
  const ap = capApt(S), warn = ap && ap.st && ap.st.warn && ap.st.warn[0];
  if (warn) tips.push(`${short(ap.name)}: ${typeof warn === 'string' ? warn : warn.text || ''}`.trim());
  tips.push('Build what the next offers will need: stands, gates, hangar space. Then let the money come in: Wait (W) runs time fast until you can afford what you pick.');
  return { id: 'meanwhile', act: 1, ch: st.ch, t: `Meanwhile: ${U.months((C.min - age) * MO(S))} until ${C.wait}`, d: tips.join(' ') };
};
/* military on the airport (hooks for a later task): from Act II an airport can be guarded by air defence placed
   on or beside it; the airborne assault that tests it is not written yet */
IC.aptGuardOk = S => !S.story || S.story.act >= 2;
IC.aptGuard = (S, ap) => S.units.filter(u => !u.dead && u.state === 'ready' && (u.d.weapon === 'sam' || u.d.weapon === 'gun') && U.dist(u, ap) < (ap.radius || 50) + 60);
/* map layers the story has reached: radar cover and airways with the airspace, supply and intelligence later */
IC.layerAllowed = function (S, k) {
  const st = S.story; if (!st) return true;
  if (k === 'coverage' || k === 'airways' || k === 'rings') return !IC.storyLock(S, k === 'airways' ? 'airways' : 'coverage');
  if (k === 'intel') return st.act >= 2;
  if (k === 'logistics') return st.act >= 3;
  return true;
};
/* how close the player is to being replaced: never before Act III, where a full day at zero confidence ends it */
IC.DISMISS_AFTER = 86400;
IC.storyDismissal = function (S) {
  const st = S.story; if (!st) return null;
  if (st.act < 3) return { can: false, text: `You cannot be replaced before Act III. Low confidence costs money instead: the Ministry pays ${U.pct(grantK(st))} of your grant.` };
  const left = st.zeroT != null ? IC.DISMISS_AFTER - (S.time - st.zeroT) : IC.DISMISS_AFTER;
  return { can: true, left, text: st.zeroT != null ? `At zero: you are replaced in ${U.dur(left)} unless confidence recovers.` : 'A full day at zero confidence and you are replaced.' };
};
/* the grant follows the Minister's confidence: full at 60 and above, half at 10 */
const grantK = st => U.clamp(0.4 + st.standing / 100, 0.5, 1);
/* before the war confidence settles towards what the airlines say over about this many months (the old steady drift
   was set for an Act I of 80 live hours; over years it ran to the floor or the ceiling), and the small pushes
   (in debt, cards unanswered, above 80) come at this share of their old pace */
IC.CONF_MO = 2;
IC.CONF_PACE = 0.2;

/* ---------- acts ---------- */
function startAct(S, n) {
  const st = S.story, W = S.world, A = IC.ACTS[n];
  st.act = n; st.actT = S.time; st.grant = A.grant; st.role = A.role;
  st.grant0 = A.grant; st.grantCut = null;
  if (n > 1 && st.goals.length) st.past.push(...st.goals);
  st.goals = goalsFor(S, n);
  st.beats = beatsFor(S, n);
  st.beatT = 60;
  S.camp.chapter = `${A.name}: ${A.title}`;
  IC.emit(S, 'act', n);
  if (n === 1) {
    const cc = IC.cap(S);
    if (st.fresh) {
      card(S, `${A.name} · ${A.title}`, U.clock(S.time, S), `You have just been appointed ${A.role} of the ${W.full.H}. The country has no airport worth the name: airliners cross its sky and nobody lands. The Treasury has set aside the money for a national airport near ${cc.name}. Next door, the ${W.full.A} has been quiet for years.`, 'chapter');
      say(S, 'MIN', `Welcome, Director. Aviation is how a country earns its living and talks to the world, and we have none. Build the national airport near ${cc.name}, get the airlines in, and grow it. The Treasury has given you ${U.money(IC.CAREER_START)}: build big enough that the airlines want to come, because that airport will pay for everything else. I judge you on the airlines and the passengers.`);
      say(S, 'APT', `Lena Okafor, airports. I will walk you through the first one: the steps are in the goals panel, top left. Nothing waits for you to follow them, and you can hide the tips.`);
    } else {
      card(S, `${A.name} · ${A.title}`, U.clock(S.time, S), `You have just been appointed ${A.role} of the ${W.full.H}. Three airports, a handful of airlines, and a Minister who wants the sector to grow. Next door, the ${W.full.A} has been quiet for years.`, 'chapter');
      say(S, 'MIN', `Welcome, Director. Aviation is how this country earns its living and how it talks to the world. Grow it: more routes, more passengers, airlines that want to be here. I judge you on that.`);
    }
    startChapter(S, st.fresh ? 0 : 1, true);
  } else if (n === 2) {
    const fb = S.byId.ab_fwd;
    fb.locked = false;
    addFlight(S, 'ftr', 'VIPER 1', 'ab_fwd').st = 'ready';
    S.budget += 300;
    S.enemy.allow = new Set(['recon']);
    st.cp += 1;
    card(S, `${A.name} · ${A.title}`, U.clock(S.time, S), `After the collision the Prime Minister has made you ${A.role}: civil and military air traffic under one roof. You inherit ${fb.name}, mothballed for years, and VIPER flight: two fighters. Someone is testing our skies.`, 'chapter');
    say(S, 'PM', `Director, I want to know what flies over this country and who flies it. The Air Force has given you ${short(fb.name)} and two jets. Make them count, and keep the airliners flying. Panic costs more than drones.`);
    say(S, 'AIR', `Col. Reyes, air operations. ${short(fb.name)} is a mess: the taxiway only reaches one runway end, fuel tanks stand side by side, no shelters, no alert pad. An alert pad at a runway end gets jets airborne in minutes. From a hangar it takes much longer.`);
    say(S, 'INT', `Our civil radars only hear transponders. A drone with its transponder off is invisible to them. A military radar near the border would change that.`);
  } else if (n === 3) {
    st.killBase = S.stats.kills;
    S.ad.roe = 'tight';
    for (const b of S.infra.filter(i => i.kind === 'airbase')) b.locked = false;
    for (const s of S.esites) if (s.nat === 'A') s.dormant = false;
    S.enemy.allow = new Set(['recon', 'rkt']);
    S.budget += 900;
    st.cp += 2;
    // the defence ministry hands over what it has in the depots
    const dep = IC.makeUnit(S, 'depot', W.depotPos.x, W.depotPos.y, { instant: true });
    dep.name = 'Central Depot'; dep.central = true; dep.d_cap = 3000; dep.hp = dep.max = 300; dep.reach = 1e9;
    Object.assign(dep.inv, { IR: 10, SR: 12, MR: 6, LR: 2, RKT: 0 });
    IC.addTruck(S, dep); IC.addTruck(S, dep);
    S.reserve = { mrsam: 1, shorad: 2, spaag: 1, lr3d: 1, mr3d: 1, depot: 1 };
    addFlight(S, 'ftr', 'LANCE 2', 'ab_rear').st = 'ready';
    addFlight(S, 'isr', 'REAPER 2', 'ab_rear').st = 'ready';
    for (const b of IC.bases(S)) IC.assignSlots(S, b);
    card(S, `${A.name} · ${A.title}`, U.clock(S.time, S), `Blood has been spilled over the ${W.full.H}. The cabinet has made you ${A.role}. Missiles, radars and depots are yours, and the equipment is in the reserve. ${W.names.A} has not declared war. It does not need to.`, 'chapter');
    say(S, 'CDS', `Gen. Voss. You have the air defences now. The equipment in the reserve is what the depots had: deploy it. Protect the capital and ${short(S.byId.ab_fwd.name)} first, and do not let the airliners stop.`);
    say(S, 'ADA', `Every radar you switch on is seen from across the border, and radars on the same band crowded together blind each other. More is not always better. Put them where they add something.`);
  } else if (n === 4) {
    S.enemy.allow = null;
    for (const s of S.esites) s.dormant = false;
    S.budget += 1000;
    st.cp += 2;
    st.grant = A.grant;
    S.mobil = Math.max(S.mobil, 1);
    // the whole air force: the rear base's flights come under command
    const fwd = 'ab_fwd', rear = S.byId.ab_rear ? 'ab_rear' : 'ab_fwd';
    for (const [k, nm, b] of [['heli', 'HOOK 2', rear], ['cargo', 'ATLAS 1', rear], ['ucav', 'HAWK 1', rear], ['aew', 'SENTRY 2', rear]]) if (!S.roster.some(r => r.name === nm)) addFlight(S, k, nm, b).st = 'ready';
    for (const b of IC.bases(S)) IC.assignSlots(S, b);
    const led = IC.peaceLedger(S);
    card(S, `${A.name} · ${A.title}`, U.clock(S.time, S), `The ${W.full.A} has attacked. The government has made you ${A.role}, and the air defence of the whole country is yours. Everything you built now has to hold.${led.length ? ' What the quiet years left you: ' + led.join(' ') : ''}`, 'chapter');
    say(S, 'CDS', `This is war. Missiles, drones and aircraft will come in raids. You decide where the air goes and what we defend.`);
  }
}
IC.storyStartAct = startAct;
/* what the quiet years built, in the words the war will judge it by (brief 25): a sentence for each link */
IC.peaceLedger = function (S) {
  const L = [], aps = IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us' && b.parts && b.parts.some(p => p.kind === 'runway' && p.built));
  const ssr = S.units.filter(u => u.d.civil && u.d.sensor && u.state === 'ready').length;
  const appr = aps.filter(a => a.parts.some(p => p.kind === 'atc' && p.built && p.hp > p.max * 0.25)).length;
  if (ssr || appr) L.push(`${ssr ? `${ssr} civil radar${ssr > 1 ? 's' : ''} name${ssr > 1 ? '' : 's'} every airliner by its transponder` : ''}${ssr && appr ? ', and ' : ''}${appr ? `${appr} approach radar${appr > 1 ? 's' : ''} see${appr > 1 ? '' : 's'} anything within 45 km of ${appr > 1 ? 'their airports' : 'its airport'}` : ''}: they feed the air picture, and they are targets.`);
  const one = aps.filter(a => a.parts.filter(p => p.kind === 'runway' && p.built).length === 1), two = aps.length - one.length;
  if (aps.length) L.push(`${two ? `${two} airport${two > 1 ? 's have' : ' has'} two runways or more and keep${two > 1 ? '' : 's'} flying after one crater` : 'No airport has a second runway'}${one.length ? `; ${one.length > 2 ? `${one.length} airports` : one.map(a => a.name).join(' and ')} ${one.length > 1 ? 'are' : 'is'} one crater from closed to jets` : ''}.`);
  const rws = aps.flatMap(a => a.parts.filter(p => p.kind === 'runway' && p.built));
  const rc = rws.filter(p => IC.paveOf(p) === 'rconc').length, worn = rws.filter(p => (p.wear || 0) >= 0.4);
  if (rc) L.push(`${rc} runway${rc > 1 ? 's are' : ' is'} reinforced concrete: a bomb leaves half the crater, filled in half the time.`);
  if (worn.length) L.push(`${worn.length} runway${worn.length > 1 ? 's are' : ' is'} worn with age (${U.pct(Math.max(...worn.map(p => p.wear)))} at worst): worn pavement breaks up wider when hit.`);
  const hg = aps.reduce((n, a) => n + a.parts.filter(p => p.kind === 'hangar' && p.built).length * IC.APART.hangar.holds, 0);
  if (hg) L.push(`Hangar room for ${hg} airliners: inside, they come through a near miss that burns them on an open stand.`);
  if (S.av) {
    const deals = S.av.deals.filter(d => d.st === 'active');
    const rep = aps.length ? Math.round(Math.max(...aps.map(IC.aptRep))) : 0;
    if (deals.length) L.push(`${deals.length} airline contract${deals.length > 1 ? 's' : ''} worth ${U.money(deals.reduce((s, d) => s + d.value, 0))} a day, and a name of ${rep}: close the airspace and they stay on the ground; after ${IC.SHUT.walk} hours an airline ends its deal, and remembers it for ${IC.dealLen(S, IC.SHUT.memo)}.`);
  }
  return L;
};

/* ---------- beats: the slow build-up ---------- */
function border(S, near) {
  // a point on our side of the hostile border, near a place
  const W = S.world;
  const fA = S.world.fronts.find(f => f.key === 'A');
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
    const inCh = () => S.time - st.chT;
    // new airlines arrive as the airport shows it can take them
    const P = IC.FOCUS.progress ? 0.25 : 1;
    B.push({ id: 'budget', need: () => st.ch >= 1, gap: [MO(S, 1 * P), MO(S, 2 * P)], run: () => newAirline(S, 'budget') });
    B.push({ id: 'foreign2', need: () => st.ch >= 2 || (st.ch === 1 && inCh() > MO(S, 4 * P)), gap: [MO(S, 1 * P), MO(S, 3 * P)], run: () => newAirline(S, 'foreign') });
    B.push({ id: 'regional', need: () => st.ch >= 4 && st.apt2 && openTo(S, S.byId[st.apt2], 'turbo'), gap: [900, 2400], run: () => newAirline(S, 'regional', 0, S.byId[st.apt2], { apt: st.cap }) });
    B.push({ id: 'regional3', need: () => st.apt3 && openTo(S, S.byId[st.apt3], 'turbo'), gap: [900, 2400], run: () => { const al = S.av.airlines.find(a => a.kind === 'regional'); if (al) IC.avRequest(S, al, S.byId[st.apt3], { apt: st.cap }, 'turbo', 2, `wants to fly ${short(S.byId[st.apt3].name)} – ${short(capApt(S).name)}`, MO(S, 1)); else newAirline(S, 'regional', 0, S.byId[st.apt3], { apt: st.cap }); } });
    // the Minister asks after the airport while it is not open
    B.push({ id: 'nudge', need: () => !st.opened && inAct(S) > MO(S, 1), gap: [0, 1800], repeat: [MO(S, 1), MO(S, 1.5)], run: () => {
      if (st.opened) return;
      st.standing -= 3;
      say(S, 'MIN', st.cap ? `The Treasury asks when ${short(apName(S, st.cap))} opens. Every day it stands empty is money spent and nothing earned. What is it waiting for? (The goals panel says what is missing.)` : `Director, the cabinet asks where the national airport is. There is not even a site yet. Aviation room, Found a new airport.`);
    } });
    // the network grows by demand: a regional airport whose turboprops fly full asks for jets; another city beyond
    // reach asks for a field of its own once enough of its people want to fly
    B.push({ id: 'jets2', need: () => st.ch >= 4 && st.apt2 && openTo(S, S.byId[st.apt2], 'turbo') && !openTo(S, S.byId[st.apt2], 'narrow') && IC.demandPull(S, S.byId[st.apt2]) > 1.05, gap: [MO(S, 0.5), MO(S, 1.5)], run: () => growAsk(S) });
    B.push({ id: 'city3', need: () => st.ch >= 5 && inCh() > MO(S, 3) && !!IC.cityAsks(S, 150), gap: [MO(S, 0.5), MO(S, 2)], run: () => cityAsk(S) });
    B.push({ id: 'ghost', need: () => st.ch >= 5 && inCh() > MO(S, chMin(5) - 2), gap: [1800, 3600], run: () => {
      const ap = S.infra.filter(i => i.kind === 'airport').sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
      const p = border(S, ap || IC.cap(S));
      droneFrom(S, p, 120, 1800);
      say(S, 'ATC', `Odd one. A glider pilot near the ${S.world.names.A} border reports a slow grey aircraft with no lights, low, heading our way. None of our radars saw it: it carries no transponder, and civil radar only hears transponders. Probably nothing.`);
    } });
    B.push({ id: 'collision', need: () => st.ch >= 5 && st.beats.find(b => b.id === 'ghost').done && ((doneCount(S) >= chNeed(5) && inCh() > MO(S, chMin(5))) || inCh() > MO(S, IC.CHAPTERS[5].max)), gap: [2400, 4800], run: () => collision(S) });
  } else if (act === 2) {
    // Act II runs over two or three years: a survey drone every month or so, and the incidents months apart
    B.push({ id: 'survey', gap: [1800, 3000], repeat: [MO(S, 0.6), MO(S, 1.4)], run: () => {
      const p = border(S, U.pick(IC.cities(S)));
      droneFrom(S, p, U.rand(60, 260), U.rand(1200, 2400));
      if (!st.surveyTold) { st.surveyTold = true; say(S, 'INT', `A slow contact is crossing the border without a transponder. Probably a survey drone mapping our radars and bases. Send a fighter to look at it. Whether we shoot is your call: it is in our airspace.`); }
    } });
    B.push({ id: 'jam', need: () => (doneCount(S) >= 1 && inAct(S) > MO(S, 5)) || inAct(S) > MO(S, 9), gap: [3600, 6000], run: () => jamming(S) });
    B.push({ id: 'shadow', need: () => (doneCount(S) >= 2 && inAct(S) > MO(S, 11)) || inAct(S) > MO(S, 17), gap: [3600, 5400], run: () => shadow(S) });
    B.push({ id: 'aptdrones', need: () => inAct(S) > MO(S, 18), gap: [3600, 5400], run: () => airportDrones(S) });
    B.push({ id: 'dilemma', need: () => (doneCount(S) >= 3 && inAct(S) > MO(S, 30)) || inAct(S) > MO(S, 36), gap: [3600, 7200], run: () => dilemma(S) });
    B.push({ id: 'firstblood', need: () => st.dilemmaDone, gap: [3600, 7200], run: () => firstBlood(S) });
  } else if (act === 3) {
    // the gray zone rises month by month: probes and rockets come closer together as the act goes on
    const rise = () => U.clamp(1 - inAct(S) / MO(S, 24), 0.3, 1);
    B.push({ id: 'probe', gap: [3600, 5400], repeat: [MO(S, 1), MO(S, 1.8)], rise, run: () => grayStrike(S) });
    B.push({ id: 'rkt', gap: [MO(S, 1), MO(S, 2)], repeat: [MO(S, 1.5), MO(S, 3)], rise, run: () => { const t = nearTown(S); IC.enemyForceOp(S, 'rkt', t); say(S, 'INT', `Rocket fire on ${t.name} from across the border. They deny it, of course.`); raise(S, 4); } });
    B.push({ id: 'embassy', need: () => (doneCount(S) >= 3 && inAct(S) > MO(S, 24)) || inAct(S) > MO(S, 28), gap: [MO(S, 0.3), MO(S, 0.6)], run: () => { say(S, 'INT', `${W.names.A}'s embassy is burning documents. Their airline has cancelled every flight to us from tomorrow.`); raise(S, 8); for (const al of S.av.airlines) if (al.K.foreign) al.sat -= 10; } });
    B.push({ id: 'massing', need: () => st.beats.find(b => b.id === 'embassy').done, gap: [3600, 7200], run: () => { say(S, 'INT', `Satellite pictures: launchers leaving their garrisons, aircraft dispersed to forward fields. This is it. Hours, not days.`); card(S, 'The Eve', U.clock(S.time, S), `Everything points one way. Whatever is not ready now will not be ready.`, 'chapter'); raise(S, 15); } });
    B.push({ id: 'war', need: () => st.beats.find(b => b.id === 'massing').done, gap: [3600, 5400], run: () => {
      // a strong Act III was their probing: the war starts at their limited strikes, with some of the winning done
      const done = doneCount(S);
      IC.enemyOpening(S, done >= 4 ? { act: 2, winH: 4 } : { head: done * 1.5 });
      startAct(S, 4);
    } });
  }
  for (const b of B) IC.remake(b, 'storyBeat', S, act, b.id);
  return B;
}
IC.REMAKE.storyBeat = (S, act, id) => beatsFor(S, act).find(b => b.id === id);
const doneCount = S => S.story.goals.filter(g => g.done).length;
const goalDone = (S, id) => { const g = S.story.goals.find(x => x.id === id); return !!(g && g.done); };
const inAct = S => S.time - S.story.actT;
function raise(S, v) { S.tension = U.clamp((S.tension || 0) + v, 0, 100); }
IC.storyRaise = raise;
function nearTown(S) {
  const c = IC.cities(S).filter(x => !x.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0] || IC.cap(S);
  return { x: c.x, y: c.y, ref: c, name: c.name };
}

/* the regional airport has outgrown its turboprops: the region asks for jets */
function growAsk(S) {
  const st = S.story, ap = S.byId[st.apt2], c = S.byId[st.city2];
  if (!ap || !c) return;
  event(S, 'jets', ap, c, Math.min(1, IC.loadFactor(S, ap)));
}
/* a third city asks for an airport of its own */
function cityAsk(S) {
  const st = S.story, ask = IC.cityAsks(S, 150); if (!ask || st.city3 || st.city3No || ask.city.id === st.city2) return;
  const c = ask.city;
  st.city3 = c.id;
  event(S, 'city3', c, Math.round(ask.unserved / 100) * 100, ask.size);
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
  card(S, 'Mayday', U.clock(S.time, S), `${t.cs}, ${t.pax} people on board, has hit something ${place} at ${Math.round(t.alt * 1000).toLocaleString('en-US')} m. The crew report a drone. None of our radars saw it.`, 'alarm');
  IC.later(S, 900, 'storyEvent', S, 'drone', t);
}

/* GPS jamming along the border pushes airliners off their routes */
function jamming(S) {
  const st = S.story, W = S.world;
  const p = border(S, IC.cap(S));
  S.jam = { x: p.x - p.nx * 120, y: p.y - p.ny * 120, r: 1500, until: S.time + 3 * 3600 };
  say(S, 'ATC', `Airliners near the border are reporting GPS errors. Some are drifting off their routes. Watch for flashing tracks: call them back, or they will wander.`);
  IC.later(S, 1800, 'storyEvent', S, 'jam');
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
  event(S, 'aptDrones', ap);
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
  IC.later(S, 900, 'storySpyTurns', S, t, fb);
  st.dilemmaT = S.time;
  IC.later(S, 5400, 'storySpyHome', S, cs, fb);
}
IC.H.storySpyTurns = (S, t, fb) => () => {
  if (t.dead) return;
  say(S, 'INT', `${t.cs} filed a plan across our north and has just turned off it, heading for ${short(fb.name)}. It does not answer. It could be an airliner in trouble. It could be something else. Look before you shoot.`);
  IC.emit(S, 'incident', { kind: 'offroute', t, text: `${t.cs} left its route toward ${short(fb.name)}` });
};
IC.H.storySpyHome = (S, cs, fb) => () => { const st = S.story; if (!st.dilemmaDone) { st.dilemmaDone = true; if (!st.fired) say(S, 'INT', `${cs} has gone home. They have photographed ${short(fb.name)} from end to end, and we let them. Some will call that restraint.`); } };
IC.on((S, type, d) => {
  if (!S.story) return;
  const st = S.story;
  if (type === 'kill' && d.spy) {
    st.fired = true; st.dilemmaDone = true;
    event(S, 'fired');
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
  IC.later(S, 2400, 'storyAct', S, 3);
}
/* Act III: the enemy tests the defences without declaring war. The commander picks what to probe from its agenda
   (a radar, a bridge, a power station, an airport), so the probes follow what it wants, not one favourite base */
function grayStrike(S) {
  if (Math.random() < 0.15) IC.enemyForceOp(S, 'disguise', IC.cap(S));
  else { const p = IC.enemyProbe(S); if (p) say(S, 'INT', `${p.words} ${S.world.names.A} denies everything.`); }
  raise(S, 3);
}

/* ---------- event cards ---------- */
function event(S, name, ...args) {
  const st = S.story, e = IC.remake(EV[name](S, ...args), 'storyEvent', name, S, ...args);
  e.id = IC.nid('ev'); e.t = S.time;
  st.events.push(e);
  IC.sfx && IC.sfx.ui('chapter');
  IC.emit(S, 'event', e);
}
IC.storyEvent = event;
IC.H.storyEvent = (S, name, ...args) => () => event(S, name, ...args);
IC.H.storyAct = (S, n) => () => startAct(S, n);
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
  if (st.del.routes) for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q) && q.value > 4) { IC.avDecide(S, q.id, true); IC.log(S, 'info', 'ROUTES', `Route Planning Office signed ${IC.avAirline(S, q.al).name}'s deal.`); }
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

/* (round 4) what a goal gives, paid as it is done: the Ministry's reward (booked as such), confidence, or what
   opens (the milestones open their pieces themselves, deck.js) */
function goalPaid(S, g) {
  if (!IC.FOCUS.progress) return;
  if (g.pay) { S.budget += g.pay; IC.econBook(S, 'bonus', g.pay); }
  if (g.conf) S.story.standing = Math.min(100, S.story.standing + g.conf);
}
const goalGives = g => /^[+−]/.test(g.gives) ? g.gives.charAt(0).toUpperCase() + g.gives.slice(1) : `It gives ${g.gives}`;
IC.goalGives = g => g && g.gives ? `→ ${g.gives}` : '';

/* ---------- the tick ---------- */
IC.storyTick = function (S, dt) {
  // (the airport showcase has no story: only the airport at work)
  if (S.showcase) return;
  const st = S.story, C = S.camp;
  for (const e of C.sched) if (!e.done && S.time >= e.t) { e.done = true; e.fn(); }
  if (!S.first && IC.firstLandingTick) IC.firstLandingTick(S);
  // goals
  for (const g of st.goals) {
    if (g.done || !g.check()) continue;
    g.done = true; g.doneT = S.time;
    // a goal that ends badly (a contract declined or missed) counts for moving on, and earns nothing
    if (g.fail && g.fail()) { g.failed = true; continue; }
    // in Act I command points come with each chapter; later, with each goal
    if (st.act > 1) st.cp += 1;
    st.standing = Math.min(100, st.standing + (st.act > 1 ? 3 : 2));
    goalPaid(S, g);
    IC.log(S, 'kill', 'GOAL', `${g.text.replace(/\s*\(.*\)$/, '')}: done.${st.act > 1 ? ' +1 command point.' : ''}${IC.FOCUS.progress && g.gives ? ` ${goalGives(g)}.` : ''}`);
    IC.sfx && IC.sfx.ui('ok');
    IC.emit(S, 'goal', g);
    if (st.act === 1 && st.ch === 0 && g.id === 'first') startChapter(S, 1);
  }
  if (st.act === 1) actOneTick(S);
  // (round 4) the player's clock, the milestones and the peacetime deck (deck.js)
  if (IC.deckTick) IC.deckTick(S, dt);
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
      if (b.repeat) b.at = S.time + U.rand(b.repeat[0], b.repeat[1]) * (b.rise ? b.rise() : 1); else b.done = true;
      b.run();
    }
  }
  // the minister's confidence drifts with how the sector is doing
  st.standT = (st.standT || 0) - dt;
  if (st.standT <= 0) {
    st.standT = 600;
    const sat = avgSat(S);
    // in peacetime the airlines are the measure of you; in war, the country is
    // (before the war the Career runs for years: confidence settles over a couple of months towards what the
    // airlines' satisfaction says, 60 at the old neutral 58, so it reflects how the sector is doing lately; goals
    // and decisions push it, and the push fades)
    const drift = st.act >= 4 ? (IC.nationalMorale(S) - 45) * 0.01 + (S.enemy.will < 60 ? 0.2 : 0) : (U.clamp(60 + (sat - 58) * 1.5, 10, 95) - st.standing) * 600 / IC.MO(S, IC.CONF_MO);
    // before the first airliner there are no airlines to judge you by: the Minister waits
    const judge = st.act > 1 || st.opened;
    // in debt (not merely spent to the last ₭M on works that wait for money) the Minister notices
    const k = st.act >= 4 ? 1 : IC.CONF_PACE;
    st.standing += (judge ? drift : 0) + ((S.budget < -1 ? -0.3 : 0) + (st.events.length > 2 ? -0.3 : 0) + (st.standing > 80 ? -0.15 : 0)) * k;
    confidence(S);
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
    if (S.enemy.will < 20 && !S.over) IC.victory(S, `The ${S.world.full.A} has asked for a ceasefire. You held.`);
  }
  S.camp.goal = `${IC.ACTS[st.act].name}: ${IC.ACTS[st.act].title}`;
};

/* confidence: before Act III it cannot fall below 5 and costs money instead (the grant); from Act III a full day
   at zero and you are replaced */
function confidence(S) {
  const st = S.story;
  st.standing = U.clamp(st.standing, st.act < 3 ? 5 : 0, 100);
  if (st.act < 3) {
    const cut = st.grantCut && (!st.grantCutT || S.time > st.grantCutT) && st.act === 1 ? st.grantCut : 1;
    st.grant = st.grant0 * grantK(st) * cut;
    const band = st.standing < 15 ? 2 : st.standing < 30 ? 1 : 0;
    if (band > (st.warnBand || 0) && IC.tipOnce(S, 'lowConf' + band, 12 * H)) say(S, st.act === 1 ? 'MIN' : 'PM', band === 2 ? `I am close to giving up on you, Director. The Ministry now pays ${U.pct(grantK(st))} of your grant, and the airlines know it.` : `My confidence in you is wearing thin. The Ministry has cut your grant to ${U.pct(grantK(st))} until things improve.`);
    st.warnBand = band;
    return;
  }
  // the clock stops only once confidence has really recovered, not at the first good hour
  if (st.standing >= 10) { if (st.zeroT != null) say(S, 'PM', 'You have bought yourself some time, Director. Do not waste it.'); st.zeroT = null; return; }
  if (st.standing >= 1 && st.zeroT == null) return;
  if (st.zeroT == null) { st.zeroT = S.time; say(S, 'PM', `I have lost confidence in you. Unless that changes within a day, you will be replaced.`); IC.news(S, `The Prime Minister is said to be looking for a new head of air defence.`); }
  else if (S.time - st.zeroT >= IC.DISMISS_AFTER) IC.gameOver(S, `The Prime Minister has lost confidence in you. You have been replaced.`);
}
/* Act I's own clock: the airport opening, contracts, the chapter openers, the fee record */
function actOneTick(S) {
  const st = S.story, ap = capApt(S);
  if (ap && !st.opened && openTo(S, ap, 'narrow')) {
    st.opened = true;
    IC.avCareerStart(S, ap);
    const noIls = !ap.parts.some(p => p.kind === 'ils');
    card(S, 'Open for business', U.clock(S.time, S), `${ap.name} can take its first jets. ${S.av.airlines.map(a => a.name).join(' and ')} are sending their first flights: watch the Aviation room, and the runway.${noIls ? ' There is no landing system (ILS) yet: in fog or snow they will divert. One costs ₭25M.' : ''}`, 'chapter', noIls ? { fix: { label: 'Build a landing system', v: 'ils' }, ap: ap.id } : null);
    say(S, 'ATC', `First arrivals inbound to ${short(ap.name)}. They fly direct and my controllers space them by time: no airways, no radar. Fine while there are few of them.`);
  }
  const c = st.contract;
  if (c && !c.done && !c.refused && !c.late) {
    const t = S.byId[c.town], f = S.asp.fields.find(q => q.built && U.dist(q, t) < 300);
    if (f) {
      c.done = true;
      if (U.dist(f, t) < 150 + (t.r || 0)) { st.standing += 3; for (const q of S.asp.fields) if (U.dist(q, t) < 400) q.mood = Math.min(100, q.mood + 10); say(S, 'MIN', `${t.name}’s council is delighted with its field. So am I.`); }
      else { st.standing += 1; f.mood = Math.max(0, f.mood - 10); say(S, 'MIN', `${t.name} has its field, ${U.km(U.dist(f, t))} out of town. The club calls it “the long drive”. It will do.`); }
    } else if (S.time > c.due) {
      c.late = true; st.standing -= 6;
      for (const q of S.asp.fields) q.mood = Math.max(0, q.mood - 15);
      say(S, 'MIN', `${t.name} never got its field. The council has gone to the papers, and every flying club in the country has read it.`);
    }
  }
  // the network's contracts: jets at the regional airport, a third city's field
  const g2 = st.grow2, a2 = st.apt2 && S.byId[st.apt2];
  if (g2 && !g2.done && a2 && openTo(S, a2, 'narrow')) { g2.done = true; st.standing += 3; say(S, 'MIN', `${short(a2.name)} takes jets now. The region is pleased, and so am I.`); }
  else if (g2 && !g2.done && !g2.late && S.time > g2.due) { g2.late = true; st.standing -= 4; say(S, 'MIN', `${short(a2 ? a2.name : 'The regional airport')} still cannot take jets. The Governor has stopped asking me politely.`); }
  const c3 = st.contract3, a3 = st.apt3 && S.byId[st.apt3];
  if (c3 && !c3.done && a3 && openTo(S, a3, c3.size === 'jets' ? 'narrow' : 'turbo')) { c3.done = true; st.standing += 3; say(S, 'MIN', `${short(a3.name)} is open. A country with more than one airport worth the name: well done.`); }
  else if (c3 && !c3.done && !c3.late && S.time > c3.due) { c3.late = true; st.standing -= 4; }
  if (!st.feeHist.length || S.time - st.feeHist[st.feeHist.length - 1].t >= H) {
    st.feeHist.push({ t: S.time, v: S.av.feeTotal || 0 });
    if (st.feeHist.length > 30) st.feeHist.shift();
  }
  chapterTick(S);
}
function foundedHere(S, ap) {
  const st = S.story, cc = IC.cap(S);
  if (!st.cap) {
    if (U.dist(ap, cc) <= 600) {
      st.cap = ap.id; ap.template = 'intl'; S.asp.zs = null;
      say(S, 'APT', `${ap.name}: a site, a survey and a runway heading. Now the runway itself. The airport is selected, and its build bar is open along the bottom of the screen: pick Runway under Runways.`);
    } else say(S, 'MIN', `${ap.name} is ${U.km(U.dist(ap, cc))} from ${cc.name}. The national airport has to be within 60 km of the capital, where the passengers are. Found it closer in; that one can wait.`);
  } else if (st.city2 && !st.apt2 && U.dist(ap, S.byId[st.city2]) <= 600) st.apt2 = ap.id;
  else if (st.city3 && !st.apt3 && U.dist(ap, S.byId[st.city3]) <= 600) st.apt3 = ap.id;
}

/* reactions: the staff and the Minister notice what happens */
IC.on((S, type, d) => {
  if (!S.story) return;
  const st = S.story;
  // (things that happen again and again on the live clock push confidence at the Career's pace before the war:
  // over a month of live days the old pushes ran it to the floor; one-off disasters keep their full weight)
  const again = v => { st.standing += v * (st.act < 4 ? IC.CONF_PACE : 1); };
  switch (type) {
    case 'approve': st.cnt.approve++; break;
    case 'dealBroken': again(d.byUs ? -2 : -4); if (st.act === 1 && IC.tipOnce(S, 'dealBroken', 6 * H)) say(S, 'MIN', `${d.al.name} ${d.byUs ? 'lost its deal' : 'walked out'}, and the papers have it. Airlines talk to each other: fewer offers will come until our name recovers.`); break;
    case 'dealDone': if (!d.d.strikes) again(0.5); break;
    case 'dealWarn': if (st.act === 1 && IC.tipOnce(S, 'dealWarn', 3 * H)) say(S, 'APT', `${d.al.name} has written about its deal: ${d.text}. They give us 12 hours.`); break;
    case 'tailParked': st.cnt.parked++; break;
    case 'naming': if (!st.cap && U.dist(d, IC.cap(S)) <= 600) d.name = `${IC.cap(S).name} International`; break;
    case 'founded': foundedHere(S, d); break;
    case 'overflight': if (d.net) { st.cnt.overT.push(S.time); if (st.cnt.overT.length > 200) st.cnt.overT = st.cnt.overT.filter(t => S.time - t < 86400); } break;
    case 'lossSep': case 'nearMiss':
      st.cnt.losT = S.time;
      // before the airspace is the player's to design, a near miss is the controllers' old procedures failing: it
      // brings the question forward instead of costing confidence
      if (st.act === 1 && st.ch < 2) st.hurry = true;
      else if (type === 'nearMiss' && IC.tipOnce(S, 'nearMissConf', 3 * H)) again(-2);
      break;
    case 'overload': if (st.act === 1 && st.ch === 1) st.hurry = true; break;
    case 'infringement': st.cnt.infT.push(S.time); if (st.cnt.infT.length > 100) st.cnt.infT = st.cnt.infT.filter(t => S.time - t < 86400); break;
    case 'aptBuilt': if (d.part.kind === 'apron') st.cnt.apron++; if (st.act < 4) peaceHint(S, d.ap, d.part); break;
    case 'ready': if (st.act < 4 && d.d.civil && d.d.sensor && IC.tipOnce(S, 'hintSSR')) say(S, 'ATC', `${d.name} is for the controllers. If it ever comes to war, the military will see what it sees, and so will anyone across the border looking for targets.`); break;
    case 'zone': st.cnt.zone++; break;
    // a bad evening of diversions costs at most 2.4 an hour
    case 'divert': if (S.time - (st.divT || -1e9) >= 600) { st.divT = S.time; again(-0.4); } break;
    case 'routeCut': again(-1.5); if (IC.tipOnce(S, 'cut', 3 * 3600)) say(S, 'MIN', `${d.al.name} is cutting flights and telling the papers why. Fix what they complain about.`); break;
    case 'tailDestroyed': st.standing -= st.act >= 4 ? 2 : 10; break;
    case 'civilKill': st.standing -= 35; if (d.tail || d.d.civil) IC.news(S, `The Director of ${IC.ACTS[st.act].role.includes('Civil') ? 'Civil Aviation' : 'Airspace Security'} faces calls to resign.`); break;
    case 'gridlock': if (IC.tipOnce(S, 'grid', 3 * 3600)) say(S, 'APT', `${d.ap.name}: two aircraft met nose to nose on a single taxiway. Parallel taxiways let traffic flow both ways.`); break;
    case 'sortie': d.orderT = S.time; break;
    case 'airborne': if (d.mission && (d.mission.type === 'intercept' || d.mission.type === 'cap') && d.orderT != null) { const dt = S.time - d.orderT; st.cnt.quickest = Math.min(st.cnt.quickest, dt); if (IC.tipOnce(S, 'qra1')) say(S, 'AIR', `${d.name} airborne ${U.dur(dt)} after the order. ${dt > 420 ? 'Too slow. An alert pad at the runway end and a short taxi would halve that.' : 'Good.'}`); } break;
    case 'aff': if (d.affWhy === 'visual identification' && !d.d.civil && IC.inHome(d.x, d.y)) st.cnt.vid++; break;
    case 'kill': if (d.gray && st.act === 2 && !d.spy) { raise(S, 8); if (IC.tipOnce(S, 'grayKill', 3600)) say(S, 'INT', `We shot down their ${d.d.name.toLowerCase()}. They will say it was over their side of the border. They will remember it.`); } break;
    case 'acLost': again(-3); break;
    case 'unmasked': again(2); break;
    case 'incident': break;
  }
});
/* Act I to III: once each, what a choice will mean if war comes (brief 25) */
function peaceHint(S, ap, p) {
  if (!ap || ap.kind !== 'airport') return;
  if (p.kind === 'hangar' && IC.tipOnce(S, 'hintHangar')) say(S, 'APT', `The hangar at ${ap.name} is for maintenance. Should war come, an airliner inside it survives a blast that would burn it on an open stand.`);
  else if (p.kind === 'runway' && IC.paveOf(p) === 'rconc' && IC.tipOnce(S, 'hintRconc')) say(S, 'APT', `${p.name || 'The runway'} at ${ap.name} is reinforced concrete: it cost 60% more than concrete. A bomb would leave a crater half the size, filled in half the time.`);
  else if (p.kind === 'runway' && ap.parts.filter(q => q.kind === 'runway' && q.built).length === 2 && IC.tipOnce(S, 'hintTwoRw')) say(S, 'APT', `${ap.name} has two runways now. More traffic, and should it ever come to it, one crater no longer closes the airport.`);
}
IC.tipOnce = function (S, key, cool) {
  const c = S.camp.cool;
  if (c[key] != null && (cool == null || S.time - c[key] < cool)) return false;
  c[key] = S.time; return true;
};

})(window.IC);
