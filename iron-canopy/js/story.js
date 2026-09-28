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

IC.ACTS = {
  1: { name: 'Act I', title: 'The Director', role: 'Director of Civil Aviation', grant: 5 },
  // from Act II the military budget grows with the job, for a country of sixty cities: from Act II a share of the
  // city taxes comes on top (IC.STORY_TAX)
  2: { name: 'Act II', title: 'Quiet Skies', role: 'Director of Airspace Security', grant: 30 },
  3: { name: 'Act III', title: 'The Shield', role: 'Commander, Air Defence Command', grant: 80 },
  4: { name: 'Act IV', title: 'The Storm', role: 'Chief of the Air Force', grant: 40 }
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
IC.staffCost = S => { const st = S.story; if (!st) return 0; let v = 0; for (const k in st.del) if (st.del[k]) v += IC.DELEGATES[k].cost; return v; };

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
IC.CAREER_START = 1100;   // the national airport (about ₭700M in concrete) and running money: the airways of a large country need several radars
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
    st.cap = apts.find(a => a.template === 'intl').id;
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
function card(S, title, sub, text, kind) { IC.card(S, title, sub, text, kind); }
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
  return G;
}
const avgSat = S => { const L = S.av.airlines.filter(a => !a.gone); return L.length ? L.reduce((s, a) => s + a.sat, 0) / L.length : 50; };
IC.avgSat = avgSat;

/* ---------- Act I: the chapters ----------
   Each opens with an event (the first two with the story itself) and brings its goals. The next opens when enough
   goals are done and the chapter has run its minimum time, or anyway after its fallback time, so a thoughtful
   player is never rushed and a stuck one is never stuck for ever. min and max are game hours. */
const H = 3600;
IC.CHAPTERS = [
  { title: 'The national airport', min: 0, max: 0, need: 6 },
  { title: 'The capital’s airport', min: 12, max: 36, need: 5 },
  { title: 'The airspace', min: 12, max: 36, need: 4 },
  { title: 'Light aircraft', min: 10, max: 30, need: 2 },
  { title: 'A second city', min: 16, max: 48, need: 3 },
  { title: 'The economy', min: 16, max: 40, need: 2 }
];
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
const quietFor = (S, since) => S.time - Math.max(since || 0, S.story.chT);

function chapterGoals(S, ch) {
  const st = S.story, cc = IC.cap(S), G = [];
  const A = () => capApt(S), nm = () => A() ? short(A().name) : 'the airport';
  const refA = { get ref() { return A() || cc; } };
  // goals point at the capital's airport until they name their own place (getters stay live)
  const g = o => { const x = Object.create(refA); Object.defineProperties(x, Object.getOwnPropertyDescriptors(o)); G.push(x); return x; };
  if (ch === 0) {
    g({ id: 'found', text: `Found the national airport within 60 km of ${cc.name}`, ref: cc,
      how: `Open the Aviation room (V) and press “Found a new airport”. Click flat, open ground 15–40 km from ${cc.name}: close enough for passengers, far enough that jets do not fly low over homes. Move the mouse to turn the runway, into the prevailing wind if you can, and click again. The survey shows the cost before you commit.`,
      check: () => !!st.cap });
    g({ id: 'runway', text: 'Build a runway at least 2.1 km long', check: () => ((A() && A().st.longest) || 0) >= IC.ACTYPES.narrow.rwy, prog: () => building(A(), 'runway'),
      how: `Select ${nm()} and open its Build tab. Pick Runway, click where one end goes, then the other end, then click it again to build. 2.5–3 km of concrete takes every airliner and costs ₭15M per 100 m. Asphalt is 30% cheaper, but heavy jets break it up within days.` });
    g({ id: 'apron', text: 'Build an apron with a taxiway to the runway', check: () => stands(A(), 'm') > 0, prog: () => building(A(), 'apron') || building(A(), 'taxi'),
      how: 'Pick Apron and click two corners beside the runway, about 400 m long and 120 m deep: deep enough for medium stands. Then pick Taxiway and click from the runway to the apron and again on the last point: an aircraft needs a way off the runway to its stand.' });
    g({ id: 'terminal', text: 'Build a terminal beside the apron', check: () => built(A(), 'terminal'), prog: () => building(A(), 'terminal'),
      how: 'Pick Terminal and place it along the back of the apron: passengers walk from it to the stands. Stands next to it turn aircraft round faster.' });
    g({ id: 'services', text: 'Build a fire station near the runway, and a fuel tank', check: () => !!(A() && A().st.fire) && built(A(), 'fuel'), prog: () => building(A(), 'fire') || building(A(), 'fuel'),
      how: 'Airliners may not use a runway without fire cover: put the Fire station close to the middle of the runway. Put a Fuel tank near the apron but away from the terminal: burning fuel spreads to anything close.' });
    g({ id: 'first', text: 'Welcome the first airliner', check: () => st.cnt.parked > 0, prog: () => st.opened ? 'the first flights are on their way' : 'airlines come when the airport can take them',
      how: 'Building goes in stages and materials come by lorry: the Works tab shows each job and why it waits. One engineer crew works one job at a time; + Crew in the Works tab adds another. Speed time up (keys 1–6) while you wait. When the airport can take a jet, the first airlines send their flights: zoom in to watch one land and taxi to its stand.' });
  } else if (ch === 1) {
    g({ id: 'approve', text: 'Approve an airline’s route request (Aviation room)', check: () => st.cnt.approve >= 1,
      how: 'Airlines ask for routes in the Aviation room (V). Approve what the airport can take: each new route brings fees, and more aircraft on your stands and runway.' });
    g({ id: 'tower', text: 'Build a control tower', check: () => built(A(), 'tower'), prog: () => building(A(), 'tower'),
      how: 'Without a tower, arrivals and departures are kept 8 minutes apart. With one, 2 minutes: the tower is the cheapest capacity there is.' });
    g({ id: 'ends', text: 'Stop the backtracking: a taxiway to a runway end', check: () => { const r = A() && A().st.rwy && A().st.rwy[0]; return !!(r && r.threshold); },
      how: 'An aircraft that has to taxi along the runway to line up blocks it for minutes. A taxiway that reaches the runway end lets it wait beside the runway instead.' });
    g({ id: 'ils', text: 'Install a landing system (ILS) on the runway end arrivals use most', check: () => built(A(), 'ils'), prog: () => building(A(), 'ils'),
      how: 'In fog and low cloud, every arrival diverts from a runway end without a landing system. Place it at the end aircraft land toward in the prevailing west wind; the airport panel warns when one is missing.' });
    g({ id: 'stands', text: 'Grow to 8 stands joined to the runway', check: () => stands(A()) >= 8, prog: () => `${stands(A())} now` });
    g({ id: 'pax', text: 'Carry 4,000 passengers in a day', check: () => dayPax(S) >= 4000, prog: () => `${Math.round(S.av.day.pax).toLocaleString('en-US')} today` });
    g({ id: 'happy', text: 'Three airlines, satisfied: average 70%', check: () => S.av.airlines.length >= 3 && avgSat(S) >= 70, prog: () => `${S.av.airlines.length} airlines, ${Math.round(avgSat(S))}% now` });
  } else if (ch === 2) {
    g({ id: 'gates', text: 'Place three entry points on the border, each on an airway', check: () => gatesOn(S) >= 3, prog: () => `${gatesOn(S)} of 3`,
      how: 'Aviation room → Draw airways. Click on the border where traffic from abroad comes in: a fix within 25 km of the border is an entry point (a ringed triangle). Click on toward the capital to lay an airway; right-click ends it. Faint dashed lines show where the traffic wants to go.' });
    g({ id: 'link', text: `Join ${nm()} to the airways, with routes to two foreign airports`, check: () => portsOnNet(S) >= 2, prog: () => `${portsOnNet(S)} foreign airports reachable on airways`,
      how: 'An airport joins the airways at the nearest fix within 120 km. Lay airways from it to the entry points: airliners then fly them in and out, and controllers know where to look.' });
    g({ id: 'radar', text: 'Put up a civil radar that sees 80% of the airways', check: () => wayCover(S) >= 0.8, prog: () => `${U.pct(wayCover(S))} of the airways seen at cruise height`,
      how: 'Pick the Secondary Surveillance Radar (bottom left) and place it between the airways, on open high ground if you can: it sees 400 km at cruise height, less behind hills. Amber stretches of airway are ones it cannot see.' });
    g({ id: 'over', text: 'Bring 15 overflights a day onto our airways', check: () => recent(st.cnt.overT, 86400, S.time) >= 15, prog: () => `${recent(st.cnt.overT, 86400, S.time)} in the last day`,
      how: 'Traffic crossing the country pays route charges: twice as much when it flies our airways, because controllers give it a service. Airways between entry points on opposite borders catch it.' });
    g({ id: 'calm', text: 'Twelve hours without a loss of separation', check: () => quietFor(S, st.cnt.losT) >= 12 * H, prog: () => `${U.dur(quietFor(S, st.cnt.losT))} so far` });
  } else if (ch === 3) {
    const k = st.contract;
    g({ id: 'field', get text() { const c = st.contract, t = c && S.byId[c.town]; return !c ? 'A light-aircraft field' : c.refused ? `Field at ${t.name}: declined` : c.late ? `Field at ${t.name}: too late` : `Build the light-aircraft field at ${t.name}${c.grant ? ` (grant ${U.money(c.grant)})` : ''}`; },
      get ref() { const c = st.contract; return c ? S.byId[c.town] : cc; },
      check: () => !!(st.contract && (st.contract.done || st.contract.refused || st.contract.late)), fail: () => !!(st.contract && (st.contract.refused || st.contract.late)), prog: () => st.contract && !st.contract.done && !st.contract.refused ? `${U.dur(Math.max(0, st.contract.due - S.time))} left` : '',
      how: 'Aviation room → Light-aircraft field, then click open ground within 15 km of the town. Flying clubs fly from the nearest field; one far from town is one they drive to and grumble about.' });
    g({ id: 'clubs', text: 'Keep the flying clubs content: average mood 65%', check: () => clubMood(S) >= 65, prog: () => `${Math.round(clubMood(S))}% now` });
    g({ id: 'quiet', text: 'Fewer than 3 light aircraft straying into a control zone in a day', check: () => S.time - st.chT >= 12 * H && recent(st.cnt.infT, 86400, S.time) < 3, prog: () => `${recent(st.cnt.infT, 86400, S.time)} in the last day${S.time - st.chT < 12 * H ? `; judged after ${U.dur(12 * H - (S.time - st.chT))}` : ''}`,
      how: 'Careless pilots fly straight through control zones. Call them on the radio (select the track), and a field of their own away from the airport keeps them out of it.' });
  } else if (ch === 4) {
    const c2 = S.byId[st.city2], a2 = () => st.apt2 && S.byId[st.apt2];
    g({ id: 'found2', text: `Found an airport within 60 km of ${c2.name}`, ref: c2, check: () => !!a2(),
      how: `Aviation room → Found a new airport, near ${c2.name}. The same rules as the first: flat ground, the runway into the wind, few homes under the approach.` });
    g({ id: 'open2', text: `Open ${c2.name}’s airport: runway, apron, terminal and fuel`, get ref() { return a2() || c2; }, check: () => openTo(S, a2(), 'turbo'),
      prog: () => a2() ? (IC.aptCanTake(S, a2(), IC.ACTYPES.turbo) || (!built(a2(), 'terminal') ? 'no terminal yet' : !built(a2(), 'fuel') ? 'no fuel tank yet' : '')) : '',
      how: 'A regional airport can start small: 1.5 km of runway takes turboprops, which need no fire station. Jets need 2.1 km and fire cover.' });
    g({ id: 'route2', text: `A regional airline flies ${short(capApt(S).name)} – ${c2.name}`, check: () => !!st.apt2 && S.av.routes.some(r => r.st === 'active' && r.flown > 0 && ((r.a === st.cap && r.b.apt === st.apt2) || (r.a === st.apt2 && r.b.apt === st.cap))) });
  } else if (ch === 5) {
    g({ id: 'cargo', text: 'Fly freight: a freighter route flown', check: () => S.av.routes.some(r => r.type === 'cargo' && r.st === 'active' && r.flown > 0),
      prog: () => { const ap = A(), T = IC.ACTYPES.cargo; return ap ? IC.aptCanTake(S, ap, T) || (built(ap, 'cargo') ? '' : 'no cargo terminal yet') : ''; },
      how: 'A freighter needs 2.9 km of runway and a large stand on an apron beside a cargo terminal (the cargo zone). Freight flies at night and pays more per landing.' });
    g({ id: 'fees', text: 'Earn ₭120M in airline fees in a day', check: () => feesDay(S) >= 120, prog: () => `${U.money(feesDay(S))} in the last day`,
      how: 'Fees come per landing and per passenger. Charges are set per airport (its Operations): higher charges earn more per flight and drive airlines away if they are too high.' });
    g({ id: 'served', text: 'Air service for 4 cities within 2½ hours’ drive', check: () => served(S) >= 4, prog: () => `${served(S)} cities now`,
      how: 'People fly from the airports they can reach by road. The Economy room shows each city’s demand; a road link to an airport (select the airport, Roads) widens its reach.' });
  }
  return G;
}

/* ---------- chapter openers: the leader or the regions ask, and the player chooses how ---------- */
function startChapter(S, n, quiet) {
  const st = S.story, C = IC.CHAPTERS[n], W = S.world;
  if (st.goals.length && st.chLog.length) { st.past.push(...st.goals); st.cp += 1; }
  st.ch = n; st.chT = S.time; st.asking = false; st.waitT = 0; st.hurry = false;
  st.chLog.push({ ch: n, t: S.time });
  st.goals = chapterGoals(S, n);
  S.camp.chapter = `Act I · ${C.title}`;
  const sub = `Day ${U.day(S.time)} · ${U.hhmm(S.time)}`, ap = capApt(S);
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
    card(S, `Chapter 5 · ${C.title}`, sub, `${S.byId[st.city2].name} wants its own airport. A second airport means a second runway to keep open, a second terminal to staff, and a domestic route the capital has never had.`, 'chapter');
  } else if (n === 5) {
    card(S, `Chapter 6 · ${C.title}`, sub, `Air service grows cities and carries their trade. The Treasury wants civil aviation to pay its own way: freight, fees and passengers from every city within reach.`, 'chapter');
    say(S, 'FIN', `Karl Ostrow, Finance. The Economy room shows what every city wants from the air and what every line of your budget does. Cargo pays best: a freighter carries 110 tonnes and flies at night when your runway is quiet.`);
    newAirline(S, 'cargo', 0);
  }
  IC.emit(S, 'storyChapter', n);
}
IC.storyStartChapter = startChapter;
/* a new airline comes, and asks for its first route */
function newAirline(S, kind, delay, hub, to) {
  const ap = hub || capApt(S); if (!ap) return null;
  const ports = IC.avPorts(S), have = new Set(S.av.airlines.filter(a => a.K.foreign).map(a => a.country));
  let extra;
  if (kind === 'foreign') { const p = ports.find(q => !have.has(q.k)); if (!p) return null; extra = { country: p.k }; }
  const al = IC.avAddAirline(S, kind, ap, extra), T = { cargo: 'cargo', regional: 'turbo' }[kind] || 'narrow';
  const dest = to || (kind === 'foreign' ? ports.find(p => p.k === al.country) : U.pick(ports));
  IC.avRequest(S, al, ap, dest.apt ? dest : dest, T, kind === 'cargo' ? 1 : 2, kind === 'cargo' ? 'wants to start freight flights' : `wants to start flying to ${ap.name.replace(/ (International|Airport)$/, '')}`, 10 * H);
  say(S, 'APT', `${al.name}, ${al.K.style}, ${kind === 'cargo' ? 'wants to fly freight from' : 'wants to fly to'} ${short(ap.name)}. Their request is in the Aviation room.${kind === 'cargo' && IC.aptCanTake(S, ap, IC.ACTYPES.cargo) ? ` ${short(ap.name)} cannot take a freighter yet: ${IC.aptCanTake(S, ap, IC.ACTYPES.cargo)}.` : ''}`);
  return al;
}
const later = (S, h) => { const st = S.story; st.asking = false; st.waitT = S.time + h * H; };
const OPEN = {
  2: S => {
    const st = S.story, ap = capApt(S), hurry = st.hurry;
    event(S, { title: 'A sky with a plan', who: IC.ADVISORS.MIN.name, text: `${hurry ? 'After what happened over the capital, the airlines have written to the Prime Minister. ' : 'The airlines have written to the Prime Minister. '}Flights wander into ${S.world.names.H} anywhere, departures sit waiting for a gap, and the controllers are at the end of their tether. I want proper airspace: entry points on the border, airways, radar. It is your job, Director.`,
      opts: [
        { t: 'Design it yourself', tip: 'The airway editor and civil radar open. Nothing is drawn for you.', fx: () => startChapter(S, 2) },
        { t: 'Hire consultants: ₭60M', tip: 'They draw three entry points and airways to the capital. You still need radar, and can change what they drew.', fx: () => { IC.pay(S, 'other', 60); consultants(S); startChapter(S, 2); } },
        { t: 'Not yet: the airport comes first', tip: 'Minister −4. She asks again in 8 hours.', fx: () => { st.standing -= 4; later(S, 8); } }
      ] });
  },
  3: S => {
    const st = S.story, ap = capApt(S);
    const towns = IC.cities(S).filter(c => c.owner === 'us' && !c.capital && c.pop >= 120 && !S.asp.fields.some(f => U.dist(f, c) < 300)).sort((a, b) => U.dist(a, ap) - U.dist(b, ap));
    const t = towns[0] || IC.cities(S).filter(c => !c.capital)[0];
    const grant = U.pick([0, 0, 5, 8]);
    event(S, { title: `A field for ${t.name}`, who: `${t.name} town council`, text: `${t.name}’s flying club has lost its old strip to a housing estate. The council asks you to build a light-aircraft field within 15 km of the town in the next day${grant ? `, and offers ${U.money(grant)} towards it` : ', though it has no money to offer'}. A field costs ${U.money(IC.ASP.FIELD_COST)}.`,
      opts: [
        { t: 'Accept the contract', tip: `${grant ? `${U.money(grant)} now. ` : ''}Build it within 24 h: done well, Minister +3 and the clubs’ mood rises; late, Minister −6.`, fx: () => { st.contract = { town: t.id, grant, due: S.time + 24 * H }; if (grant) { S.budget += grant; IC.econBook(S, 'oneoff', grant); } startChapter(S, 3); } },
        { t: 'Decline', tip: 'Minister −3. Every flying club’s mood −10.', fx: () => { st.contract = { town: t.id, grant: 0, refused: true }; st.standing -= 3; for (const f of S.asp.fields) f.mood = Math.max(0, f.mood - 10); startChapter(S, 3); } }
      ] });
  },
  4: S => {
    const st = S.story, ap = capApt(S);
    const c2 = IC.cities(S).filter(c => c.owner === 'us' && !c.capital && U.dist(c, ap) > 1500).sort((a, b) => b.pop - a.pop)[0] || IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop)[0];
    st.city2 = c2.id;
    const grant = U.pick([0, 150, 250]);
    event(S, { title: `An airport for ${c2.name}`, who: IC.ADVISORS.GOV.name, text: `${c2.name} is ${U.km(U.dist(c2, ap))} from ${short(ap.name)}: over ${Math.round(IC.U.dist(c2, ap) / 10 / 90 + 0.5)} hours by road. Its people want an airport of their own${grant ? `, and the region will put ${U.money(grant)} towards it` : ', and the region has no money to put towards it'}.`,
      opts: [
        { t: 'Agree', tip: `${grant ? `${U.money(grant)} now. ` : ''}Founding opens again in the Aviation room.`, fx: () => { if (grant) { S.budget += grant; IC.econBook(S, 'oneoff', grant); } startChapter(S, 4); } },
        { t: 'Ask the region for more money', tip: `${U.money(grant + 100)} instead. The Governor gives it, and tells the Minister you haggled: Minister −4.`, fx: () => { S.budget += grant + 100; IC.econBook(S, 'oneoff', grant + 100); st.standing -= 4; startChapter(S, 4); } },
        { t: 'Not yet', tip: `Minister −2 and ${c2.name}’s morale −5. The Governor asks again in 12 hours.`, fx: () => { st.standing -= 2; c2.morale = Math.max(0, c2.morale - 5); st.city2 = null; later(S, 12); } }
      ] });
  },
  5: S => {
    const st = S.story;
    event(S, { title: 'Pay your own way', who: IC.ADVISORS.FIN.name, text: `The Treasury built you an airport; it will not run it for ever. From today your grant is halved, to ${U.money(IC.ACTS[1].grant / 2)} an hour, unless you give me a reason.`,
      opts: [
        { t: 'Accept the cut', tip: 'Grant halved. Minister +3: she likes a director who does not complain.', fx: () => { st.grantCut = 0.5; st.standing += 3; startChapter(S, 5); } },
        { t: 'Raise airport charges by 15% instead', tip: 'The grant stays. Every airport’s charges ×1.15; every airline −6 satisfaction.', fx: () => { for (const b of IC.bases(S)) if (b.kind === 'airport') IC.avSetFee(S, b, (b.feeLevel || 1) * 1.15); for (const al of S.av.airlines) al.sat -= 6; startChapter(S, 5); } },
        { t: 'Argue for a year’s grace', tip: 'Minister −5. The grant stays for a day, then is halved anyway.', fx: () => { st.standing -= 5; st.grantCutT = S.time + 24 * H; startChapter(S, 5); } }
      ] });
  }
};
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
  const C = IC.CHAPTERS[st.ch], age = (S.time - st.chT) / H;
  // a near miss or overloaded controllers force the airspace question early
  const forced = st.ch === 1 && st.hurry && age >= 10;
  if (!forced && !((doneCount(S) >= C.need && age >= C.min) || age >= C.max)) return;
  st.asking = true;
  OPEN[st.ch + 1](S);
}
/* how far the current chapter is: for the goals panel */
IC.storyChapterInfo = function (S) {
  const st = S.story; if (!st || st.act !== 1) return null;
  const C = IC.CHAPTERS[st.ch], age = (S.time - st.chT) / H;
  return { n: st.ch, title: C.title, age, of: IC.CHAPTERS.length, next: st.ch === 0 ? 'The first airliner opens the next chapter.' : st.ch >= 5 ? '' : doneCount(S) >= C.need ? (age >= C.min ? 'Something new is coming.' : `Something new comes in about ${U.dur((C.min - age) * H)}.`) : `${C.need - doneCount(S)} more goal${C.need - doneCount(S) > 1 ? 's' : ''} open${C.need - doneCount(S) > 1 ? '' : 's'} the next chapter. It comes anyway in ${U.dur(Math.max(0, C.max - age) * H)}.` };
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
  airways: [2, 'The airway editor opens when the Minister asks you to design the airspace (Chapter 3).'],
  radar: [2, 'Civil radar comes with the airspace chapter (Chapter 3).'],
  coverage: [2, 'Radar cover comes with the airspace chapter (Chapter 3).'],
  fields: [3, 'Light-aircraft fields come with Chapter 4.'],
  zones: [9, 'Prohibited zones come with Act II, when there is something to keep airliners away from.']
};
IC.storyLock = function (S, key) {
  const st = S.story; if (!st || !st.fresh || st.act > 1) return '';
  if (key === 'found') return !st.cap || (st.ch >= 4 && st.city2) ? '' : st.ch < 4 ? 'A second airport comes later: the regions will ask for one (Chapter 5).' : '';
  const L = LOCKS[key]; return L && st.ch < L[0] ? L[1] : '';
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
      card(S, `${A.name} · ${A.title}`, `Day 1 · ${U.hhmm(S.time)}`, `You have just been appointed ${A.role} of ${W.full.H}. The country has no airport worth the name: airliners cross its sky and nobody lands. The Treasury has set aside the money for a national airport near ${cc.name}. Next door, ${W.full.A} has been quiet for years.`, 'chapter');
      say(S, 'MIN', `Welcome, Director. Aviation is how a country earns its living and talks to the world, and we have none. Build the national airport near ${cc.name}, get the airlines in, and grow it. The money in the treasury is most of what you will get: spend it well. I judge you on the airlines and the passengers.`);
      say(S, 'APT', `Lena Okafor, airports. I will walk you through the first one: the steps are in the goals panel, top left. Nothing waits for you to follow them, and you can hide the tips.`);
    } else {
      card(S, `${A.name} · ${A.title}`, `Day 1 · ${U.hhmm(S.time)}`, `You have just been appointed ${A.role} of ${W.full.H}. Three airports, a handful of airlines, and a Minister who wants the sector to grow. Next door, ${W.full.A} has been quiet for years.`, 'chapter');
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
    card(S, `${A.name} · ${A.title}`, U.clock(S.time), `Blood has been spilled over ${W.full.H}. The cabinet has made you ${A.role}. Missiles, radars and depots are yours, and the equipment is in the reserve. ${W.names.A} has not declared war. It does not need to.`, 'chapter');
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
    card(S, `${A.name} · ${A.title}`, U.clock(S.time), `${W.full.A} has attacked. The government has made you ${A.role}, and the air defence of the whole country is yours. Everything you built now has to hold.`, 'chapter');
    say(S, 'CDS', `This is war. Missiles, drones and aircraft will come in raids. You decide where the air goes and what we defend.`);
  }
}
IC.storyStartAct = startAct;

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
    B.push({ id: 'budget', need: () => st.ch >= 1, gap: [3600, 7200], run: () => newAirline(S, 'budget') });
    B.push({ id: 'foreign2', need: () => st.ch >= 2 || (st.ch === 1 && inCh() > 14 * H), gap: [3600, 9000], run: () => newAirline(S, 'foreign') });
    B.push({ id: 'regional', need: () => st.ch >= 4 && st.apt2 && openTo(S, S.byId[st.apt2], 'turbo'), gap: [900, 2400], run: () => newAirline(S, 'regional', 0, S.byId[st.apt2], { apt: st.cap }) });
    // the Minister asks after the airport while it is not open
    B.push({ id: 'nudge', need: () => !st.opened && inAct(S) > 10 * H, gap: [0, 1800], repeat: [10 * H, 14 * H], run: () => {
      if (st.opened) return;
      st.standing -= 3;
      say(S, 'MIN', st.cap ? `The Treasury asks when ${short(apName(S, st.cap))} opens. Every day it stands empty is money spent and nothing earned. What is it waiting for? (The goals panel says what is missing.)` : `Director, the cabinet asks where the national airport is. There is not even a site yet. Aviation room, Found a new airport.`);
    } });
    B.push({ id: 'ghost', need: () => st.ch >= 5 && inCh() > 8 * H, gap: [1800, 3600], run: () => {
      const ap = S.infra.filter(i => i.kind === 'airport').sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
      const p = border(S, ap || IC.cap(S));
      droneFrom(S, p, 120, 1800);
      say(S, 'ATC', `Odd one. A glider pilot near the ${S.world.names.A} border reports a slow grey aircraft with no lights, low, heading our way. None of our radars saw it: it carries no transponder, and civil radar only hears transponders. Probably nothing.`);
    } });
    B.push({ id: 'collision', need: () => st.ch >= 5 && st.beats.find(b => b.id === 'ghost').done && ((doneCount(S) >= IC.CHAPTERS[5].need && inCh() > IC.CHAPTERS[5].min * H) || inCh() > IC.CHAPTERS[5].max * H), gap: [2400, 4800], run: () => collision(S) });
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
  // goals
  for (const g of st.goals) {
    if (g.done || !g.check()) continue;
    g.done = true; g.doneT = S.time;
    // a goal that ends badly (a contract declined or missed) counts for moving on, and earns nothing
    if (g.fail && g.fail()) { g.failed = true; continue; }
    // in Act I command points come with each chapter; later, with each goal
    if (st.act > 1) st.cp += 1;
    st.standing = Math.min(100, st.standing + (st.act > 1 ? 3 : 2));
    IC.log(S, 'kill', 'GOAL', `${g.text.replace(/\s*\(.*\)$/, '')}: done.${st.act > 1 ? ' +1 command point.' : ''}`);
    IC.sfx && IC.sfx.ui('ok');
    IC.emit(S, 'goal', g);
    if (st.act === 1 && st.ch === 0 && g.id === 'first') startChapter(S, 1);
  }
  if (st.act === 1) actOneTick(S);
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
    const drift = st.act >= 4 ? (IC.nationalMorale(S) - 45) * 0.01 + (S.enemy.will < 60 ? 0.2 : 0) : (sat - 58) * 0.006;
    // before the first airliner there are no airlines to judge you by: the Minister waits
    const judge = st.act > 1 || st.opened;
    // in debt (not merely spent to the last ₭M on works that wait for money) the Minister notices
    st.standing += (judge ? drift : 0) + (S.budget < -1 ? -0.3 : 0) + (st.events.length > 2 ? -0.3 : 0) + (st.standing > 80 ? -0.15 : 0);
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
    if (S.enemy.will < 20 && !S.over) IC.victory(S, `${S.world.full.A} has asked for a ceasefire. You held.`);
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
    card(S, 'Open for business', `Day ${U.day(S.time)} · ${U.hhmm(S.time)}`, `${ap.name} can take its first jets. ${S.av.airlines.map(a => a.name).join(' and ')} are sending their first flights: watch the Aviation room, and the runway.`, 'chapter');
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
      st.cap = ap.id; ap.template = 'intl'; ap.name = `${cc.name} International`; S.asp.zs = null;
      say(S, 'APT', `${ap.name}: a site, a survey and a runway heading. Now the runway itself. The airport is selected: open its Build tab.`);
    } else say(S, 'MIN', `${ap.name} is ${U.km(U.dist(ap, cc))} from ${cc.name}. The national airport has to be within 60 km of the capital, where the passengers are. Found it closer in; that one can wait.`);
  } else if (st.city2 && !st.apt2 && U.dist(ap, S.byId[st.city2]) <= 600) st.apt2 = ap.id;
}

/* reactions: the staff and the Minister notice what happens */
IC.on((S, type, d) => {
  if (!S.story) return;
  const st = S.story;
  switch (type) {
    case 'approve': st.cnt.approve++; break;
    case 'tailParked': st.cnt.parked++; break;
    case 'founded': foundedHere(S, d); break;
    case 'overflight': if (d.net) { st.cnt.overT.push(S.time); if (st.cnt.overT.length > 200) st.cnt.overT = st.cnt.overT.filter(t => S.time - t < 86400); } break;
    case 'lossSep': case 'nearMiss':
      st.cnt.losT = S.time;
      // before the airspace is the player's to design, a near miss is the controllers' old procedures failing: it
      // brings the question forward instead of costing confidence
      if (st.act === 1 && st.ch < 2) st.hurry = true;
      else if (type === 'nearMiss' && IC.tipOnce(S, 'nearMissConf', 3 * H)) st.standing -= 2;
      break;
    case 'overload': if (st.act === 1 && st.ch === 1) st.hurry = true; break;
    case 'infringement': st.cnt.infT.push(S.time); if (st.cnt.infT.length > 100) st.cnt.infT = st.cnt.infT.filter(t => S.time - t < 86400); break;
    case 'aptBuilt': if (d.part.kind === 'apron') st.cnt.apron++; break;
    case 'zone': st.cnt.zone++; break;
    // a bad evening of diversions costs at most 2.4 an hour
    case 'divert': if (S.time - (st.divT || -1e9) >= 600) { st.divT = S.time; st.standing -= 0.4; } break;
    case 'routeCut': st.standing -= 1.5; if (IC.tipOnce(S, 'cut', 3 * 3600)) say(S, 'MIN', `${d.al.name} is cutting flights and telling the papers why. Fix what they complain about.`); break;
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
