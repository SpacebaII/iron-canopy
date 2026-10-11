/* Iron Canopy — (round 5b) tutorials that wait for the player to do it. A tutorial is a few steps; each points at
   the real thing on screen (el: an anchor or CSS selector, as IC.hint takes, or a list of them, the first on screen
   wins; or at(S): a place on the map) and says what to do, and it moves on only when the game sees it done: a click
   the page reports (IC.emit 'ui' { act, v, n, al } from main.js), a game event (a loan taken, a plan placed: 'bld'
   { act, v } from the builder), the thing it opens being on screen (seen: a selector the page reports visible), or a
   state the game can check (ok(S)). No Next button: a small Skip only.
   IC.TUTORS[id] = { title, guide, when, trig, steps: [{ el | at, title, text, on: [[type, act?, v?]...], seen?, ok? }] }
   when: a story stage ('ch1', 'cards', 'red') or a test of the state; trig: events that make it wanted (it starts
   the next time its step can be shown). A tutorial marked early ticks off steps done before it starts (round 5b's
   four); the others count only what is done while they show, so one piece built does not tick off the next lesson.
   (round 5c) every civil feature has one, met the first time the player comes to it, one at a time.
   The state is S.tutor = { cur, i, done: { id: [step flags] }, over: { id: 1 }, want: { id: 1 } } and saves with the
   game. Headless; the page draws the current step (ui.js). */
(function (IC) {
'use strict';
const U = IC.U;
const civil = S => !!(S && S.mode === 'story' && S.story && S.story.act === 1 && !S.showcase);
const capAp = S => (S.story && S.story.cap && S.byId[S.story.cap]) || null;
const builtRw = ap => !!(ap && ap.parts.some(p => p.kind === 'runway' && p.built));
const capName = S => (IC.cap(S) || { name: 'the capital' }).name;
const ways = S => (S.asp && S.asp.ways ? S.asp.ways.length : 0);
const goalDone = (S, id) => !!(S.story && S.story.goals.some(g => g.id === id && g.done));
const tailAt = S => { const tl = S.first && S.av ? S.av.tails.find(t => t.id === S.first.tl) : null, w = tl && IC.tailWhere(S, tl); return w ? { x: w.x, y: w.y } : null; };
/* a good site for the first airport, as the tutorial suggests it: open, flat ground 20–30 km from the capital */
IC.foundSuggest = function (S) {
  const c = IC.cap(S); if (!c) return null;
  if (S._tutSite && S._tutSite.c === c.id) return S._tutSite.p;
  let p = null;
  for (const d of [250, 220, 280, 200, 300]) { for (let k = 0; k < 24 && !p; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) p = { x, y }; } if (p) break; }
  S._tutSite = { c: c.id, p };
  return p;
};
/* a spot on our border where traffic comes in, for the first entry point: where the way from the capital's airport
   to the nearest foreign airport leaves the country (as the consultants would draw it) */
const borderSpot = S => {
  const k = S.asp ? S.asp.fixes.length : 0;
  if (S._tutBorder && S._tutBorder.k === k) return S._tutBorder.q;
  const ap = capAp(S), P = ap && IC.avPorts ? IC.avPorts(S).slice().sort((a, b) => U.dist(a, ap) - U.dist(b, ap)) : [];
  let q = null;
  // (the first one that is not already an entry point: one more fix there would be refused, too close to it)
  for (const p of P) {
    let c = null; for (let i = 1; i <= 80 && !c; i++) { const x = ap.x + (p.x - ap.x) * i / 80, y = ap.y + (p.y - ap.y) * i / 80; if (!IC.inHome(x, y)) c = { x, y }; }
    if (c && !(S.asp && S.asp.fixes.some(f => U.dist(f, c) < 300))) { q = c; break; }
  }
  S._tutBorder = { k, q };
  return q;
};
IC.TUTORS = {
  // ---------- (round 5c) the civil act: each one the first time the player comes to it ----------
  basics: { title: 'Goals and time', guide: 'time', when: S => civil(S) && !capAp(S), steps: [
    { el: '#brief .goalrow', title: 'The next goal', text: 'One goal at a time, with what it pays in green. Click it and the map shows where.', on: [['ui', 'goal']] },
    { el: '#speed [data-act="speed"][data-v="4"]', title: 'Time', text: 'Building takes game hours. Keys 1–6 set the speed and Space pauses. Try 4×.', on: [['ui', 'speed']] }
  ] },
  found: { title: 'Founding an airport', guide: 'airport', when: S => civil(S) && !capAp(S), steps: [
    { el: '#sys [data-act="bbToggle"]', title: 'The build bar', text: 'Everything is built from the bar along the bottom. Press Build, or B.', on: [['ui', 'bbToggle'], ['bld', 'open']], ok: () => !!(IC.bb && IC.bb.open) },
    { el: '#bbar [data-act="foundMode"]', title: 'Found the airport', text: 'With no airport yet the bar offers one thing. Press Found an airport.', on: [['ui', 'foundMode']], ok: S => !!(S.mode2 && S.mode2.kind === 'found') },
    { at: S => IC.foundSuggest(S), title: 'The site', text: S => `Click flat, open ground 15–40 km from ${capName(S)}: near enough for passengers, far enough that jets do not roar over homes. The ring is a good spot.`, on: [['bld', 'site']], ok: S => !!(S.mode2 && S.mode2.kind === 'found' && S.mode2.site) },
    { el: '#bldgo [data-go="build"]', title: 'Found it', text: 'The runway lies into the prevailing wind; R turns it. The button gives the price of the survey and the land. Press Found, or Enter.', on: [['bld', 'found']] }
  ] },
  starter: { title: 'The Starter airport', guide: 'buildbar', trig: [['bld', 'found']], when: S => civil(S) && !!capAp(S) && !builtRw(capAp(S)) && !capAp(S).works.some(w => w.stages && w.part && w.part.kind === 'terminal'), steps: [
    { get el() { return `#bbar [data-bb="tab"][data-v="${IC.bbStarterTab()}"]`; }, get on() { return [['bld', 'tab', IC.bbStarterTab()]]; }, title: 'A whole airport in one go', text: IC.FOCUS.parts ? 'The surveyed runway is placed, ready to build; the tabs hold every part to build round it one by one. For runway, taxiways, terminal, tower, fire station and fuel at one price, open Blueprints.' : 'The surveyed runway is placed, ready to build. For runway, terminal, tower, fire station and fuel at one price, open Blueprints.', ok: () => !!(IC.bb && IC.bb.open && IC.bb.tab === IC.bbStarterTab()) },
    { el: '#bbar [data-bb="item"][data-v="starter"]', title: 'The Starter airport', text: 'Eight stands at a terminal, a tower, a fire station and a fuel farm, laid on the surveyed runway. Pick it.', on: [['bld', 'pick', 'starter']], ok: S => !!(S.mode2 && S.mode2.part === 'starter') },
    { at: S => capAp(S), title: 'Place it', text: 'Click on the airport: the Starter lines up with the surveyed runway.', on: [['bld', 'placed', 'starter']], ok: S => !!(S.mode2 && S.mode2.part === 'starter' && S.mode2.set) },
    { el: '#bldgo [data-go="build"]', title: 'Build it', text: 'Green fits; red says why. The button gives the price and how long the crews take. Nothing is paid until you press Build, or Enter.', on: [['bld', 'built']] },
    { el: ['#insp [data-act="finishNow"]', '#bbar [data-act="finishNow"]'], title: 'Finish now', text: 'Crews work in stages: survey, earthworks, paving, markings, lights. Finish now runs time fast until they are done, and stops if anything needs you.', on: [['ui', 'finishNow'], ['waitStart']], ok: S => !!(capAp(S) && !capAp(S).works.some(w => w.stages)) }
  ] },
  problems: { title: 'Problems and fixes', guide: 'building', when: S => civil(S) && builtRw(capAp(S)), steps: [
    { el: '#pmarks .pmark:not(.deal) [data-act="pmFix"]', title: 'Where it hurts', text: 'A marker says what is wrong, and where. The button beside it is the fix: press it.', on: [['ui', 'pmFix']] },
    { el: '#bldgo [data-go="build"]', title: 'The fix, placed', text: 'It is placed where it helps. Build it, click elsewhere to move it, or Esc.', on: [['bld', 'built'], ['bld', 'cancel']], ok: S => !(S.mode2 && S.mode2.kind === 'build') }
  ] },
  pieces: IC.FOCUS.parts ? { title: 'Building part by part', guide: 'buildbar', when: S => civil(S) && builtRw(capAp(S)) && (S.story.ch >= 1 || !!S.first), steps: [
    { el: '#bbar [data-bb="tab"][data-v="tw"]', title: 'Part by part', text: 'Each tab holds single parts at real size: runways, taxiways, aprons and stands, terminals and piers, hangars, fuel, fire and the tower. Open Taxiways.', on: [['bld', 'tab', 'tw']], ok: () => !!(IC.bb && IC.bb.open && IC.bb.tab === 'tw') },
    { el: '#bbar .bb-items .bb-it:not([data-lock])', title: 'Pick one', text: 'Hover a part for its price, its building time and what it needs. Click one to pick it up; the chips above set its pavement, width and lights.', on: [['bld', 'pick']], ok: S => !!(S.mode2 && S.mode2.kind === 'build') },
    { at: S => capAp(S), title: 'Place it', text: 'A taxiway: click point by point; its ends snap to the runway, aprons and other taxiways. An apron: two corners. Anything joined to nothing is said on the plan.', on: [['bld', 'placed']], ok: S => !!(S.mode2 && S.mode2.kind === 'build' && (S.mode2.set || S.mode2.pts.length >= 2)) }
  ] } : { title: 'Airport pieces', guide: 'buildbar', when: S => civil(S) && builtRw(capAp(S)) && (S.story.ch >= 1 || !!S.first), steps: [
    { el: '#bbar [data-bb="tab"][data-v="pc"]', title: 'Airport pieces', text: 'Whole pieces, each with what it needs: a runway with its taxiways, terminals with apron and stands, services, cargo. Open Airport pieces.', on: [['bld', 'tab', 'pc']], ok: () => !!(IC.bb && IC.bb.open && IC.bb.tab === 'pc') },
    { el: '#bbar .bb-items .bb-it:not([data-lock])', title: 'Pick one', text: 'Hover a piece for its price, its building time and what it adds. Click one to pick it up.', on: [['bld', 'pick']], ok: S => !!(S.mode2 && S.mode2.kind === 'build') },
    { at: S => capAp(S), title: 'Place it', text: 'Click beside the parallel taxiway. A terminal turns to face the runway and joins the taxiway by itself.', on: [['bld', 'placed']], ok: S => !!(S.mode2 && S.mode2.kind === 'build' && S.mode2.set) }
  ] },
  buildesc: { title: 'Build or Esc', guide: 'building', when: S => civil(S) && builtRw(capAp(S)) && !!(S.mode2 && S.mode2.kind === 'build' && S.mode2.set), steps: [
    { at: S => S.mode2 && S.mode2.kind === 'build' ? S.mode2.at || S.mode2.pts[0] || null : null, title: 'A plan, not a building', text: 'A click elsewhere moves it and R turns it. The button beside it gives the price and how long it takes.', on: [['bld', 'moved'], ['bld', 'placed'], ['bld', 'turn'], ['bld', 'built'], ['bld', 'cancel']] },
    { el: '#bldgo [data-go="build"]', title: 'Build, or Esc', text: 'Build (or Enter) orders it and puts the bar away. Esc or right-click drops the plan; a plan costs nothing.', on: [['bld', 'built'], ['bld', 'cancel']] }
  ] },
  follow: { title: 'Following an aircraft', guide: 'follow', trig: [['firstArrival']], when: S => civil(S) && !!S.first, steps: [
    { el: '#followchip [data-act="followSel"]', at: S => tailAt(S), title: 'Your first airliner', text: 'The camera is following it in. Click the aircraft, or its call sign on the strip below, for its panel.', on: [['select', 'tail'], ['select', 'track']], ok: S => !!(S.sel && (S.sel.kind === 'tail' || (S.sel.kind === 'track' && S.sel.ref.tail))) },
    { el: '#insp .turnsec', title: 'The turnaround', text: 'On the stand the panel lists each service as it works: stairs or bridge, bags, catering, the fuel truck, then the tug. Roll the wheel in to watch them.', on: [['ui', 'zin']], ok: () => !!(IC.cam && IC.cam.z >= 40) },
    { el: '#insp [data-act="follow"]', title: 'Let it go', text: 'Stop following hands the camera back. Follow, on any airliner, picks one up again.', on: [['ui', 'follow'], ['ui', 'followOff']], ok: S => !S.follow }
  ] },
  deals: { title: 'Airline offers', guide: 'deals', trig: [['request']], when: S => civil(S) && !!(S.av && S.av.requests.length), steps: [
    { el: ['#pmarks .pmark.deal [data-act="pmGo"]', '#pmarks [data-act="pmZoom"]'], title: 'An offer', text: 'Offers show as green markers at the airport. Click this one to read it.', on: [['ui', 'pmGo'], ['ui', 'pmFix']], seen: '#insp .dl-needs' },
    { el: ['#insp [data-act="avYes"]:not([disabled])', '#insp .dl-needs'], title: 'Sign, or build first', text: 'Each line is something the airline checks: stands, gates, hangar room, fuel, the terminal. A ✗ must be built before they sign, and the button under the card places it. Then Sign.', on: [['approve'], ['decline'], ['ui', 'avYes'], ['ui', 'avNo'], ['ui', 'pmFix']] }
  ] },
  panel: { title: 'The airport panel', guide: 'airport', when: S => civil(S) && S.story.ch >= 1 && !!capAp(S), steps: [
    { el: '#insp [data-act="aptBack"]', at: S => capAp(S), title: 'Your airport', text: 'Click the airport for its panel: passengers, movements, this month\'s money, and what needs you. Close in, a click picks one building; its panel has a button back to the airport.', on: [['select', 'infra']], ok: S => !!(S.sel && S.sel.kind === 'infra' && S.sel.ref.parts) },
    { el: '#insp [data-act="aptOpen"][data-v="more"]', title: 'The details', text: 'Runways, stands, fuel, fire cover and the tower are folded here. Open them.', on: [['ui', 'aptOpen', 'more']], seen: '#insp canvas.schem' },
    { el: '#insp [data-act="desel"]', title: 'Out of the way', text: '✕ (or Esc) closes the panel when you want the map back.', on: [['ui', 'desel']], ok: S => !S.sel }
  ] },
  milestone: { title: 'Milestones', guide: 'growth1', trig: [['milestone']], when: S => civil(S), steps: [
    { el: '#cine [data-act="buildPick"]', title: IC.FOCUS.parts ? 'Bigger parts' : 'A bigger piece', text: IC.FOCUS.parts ? 'Each milestone opens bigger parts: piers, a second runway, round terminals. Press it to place one now, or find them on the build bar later.' : 'Each milestone opens a bigger piece. Press it to place one now, or leave it on the build bar for later.', on: [['ui', 'buildPick'], ['bld', 'pick']] },
    { el: '#bldgo [data-go="build"]', title: 'Place and build', text: 'Click where it should go, then Build. Esc if not now.', on: [['bld', 'built'], ['bld', 'cancel']] }
  ] },
  deck: { title: 'Decisions', guide: 'events', trig: [['deckCard']], when: S => civil(S), steps: [
    { el: '#evcard .opt', title: 'A decision', text: 'Each answer says what it costs and what it brings. None is free and none is a trap. Pick one.', on: [['ui', 'evChoose']] },
    { el: 'rail-journal', title: 'The journal', text: 'Every card, your answer and what came of it are kept in the Journal (J).', on: [['ui', 'room', 'journal']] }
  ] },
  chain: { title: 'Where the money comes from', guide: 'money1', when: S => civil(S) && S.story.ch >= 1 && !!capAp(S) && (capAp(S).paxRate || 0) > 0, steps: [
    { el: '#insp [data-act="chainTog"]', title: 'The chain', text: 'Show on the map draws it: people by road from the towns, through the terminal, out on flights, and the money back.', on: [['ui', 'chainTog']], ok: () => !!IC.chainOn },
    { el: '[data-act="zfull"]', title: 'Zoom out', text: 'Roll the wheel out, or press Region: the towns that feed the airport, and what each route pays.', on: [['ui', 'zfull']], ok: () => !!(IC.cam && IC.cam.z < 1.2) }
  ] },
  wait: { title: 'Waiting for money', guide: 'time', when: S => civil(S) && S.story.ch >= 1 && !!capAp(S) && !capAp(S).works.length && S.budget < 400 && IC.waitTargets(S).length > 0, steps: [
    { el: '#speed [data-act="waitPick"]', title: 'Short of money?', text: 'Wait runs time fast until you can afford what you pick. Press it.', on: [['ui', 'waitPick']], seen: '.waitbar.pick' },
    { el: '.waitbar.pick [data-act="wait"]', title: 'What you save for', text: 'It stops when the money is there, when the month turns, or when something needs you.', on: [['ui', 'wait'], ['waitStart']] }
  ] },
  airspace: { title: 'Airways', guide: 'airspace', when: S => civil(S) && S.story.ch === 2, steps: [
    { el: ['#warroom [data-act="aspDraw"]', 'rail-aviation'], title: 'The airway editor', text: 'Airways are drawn from the Aviation room (V), on its Airspace page. Open it and press Draw airways.', on: [['ui', 'aspDraw']], ok: S => !!(S.mode2 && S.mode2.kind === 'airway') || ways(S) > 0 },
    { at: S => borderSpot(S), title: 'An entry point', text: 'Click on the border where traffic from abroad comes in: a fix within 25 km of it is an entry point. The ring is one.', on: [['fixAdded']], ok: S => goalDone(S, 'gates') },
    { at: S => capAp(S), title: 'Lay the airway', text: 'Click on toward the capital, a fix every 100–200 km; the airport joins the nearest fix within 120 km. Right-click ends the airway.', on: [['airwayAdded']], ok: S => goalDone(S, 'link') || goalDone(S, 'gates') }
  ] },
  radar: { title: 'Civil radar', guide: 'airspace', when: S => civil(S) && S.story.ch === 2 && ways(S) > 0, steps: [
    { el: '#layers [data-act="layer"][data-v="gaps"]', title: 'Where radar is missing', text: 'Show the gaps marks every stretch of airway no radar sees, in amber. Press it.', on: [['ui', 'layer', 'gaps']], ok: S => !!(S.layers && S.layers.gaps) },
    { el: '#tile-ssr', title: 'The beacon radar', text: 'The Secondary Surveillance Radar sees about 400 km at cruise height, less behind hills. Pick it.', on: [['ui', 'deploy', 'ssr']], ok: S => !!(S.mode2 && S.mode2.kind === 'deploy' && S.mode2.type === 'ssr') },
    { at: S => (IC.radarGap && IC.radarGap(S) || {}).at || null, title: 'The biggest gap', text: 'Place it on the marker. The tag by the cursor says how much of the airways it adds and what crowding the band costs.', on: [['deploy', 'ssr']] }
  ] },
  // ---------- round 5b's four ----------
  dayboard: { title: 'The day board', guide: 'deals', when: 'ch1', early: 1, open: 'day', steps: [
    { el: '[data-act="aptOpen"][data-v="day"]', title: 'The day board', text: 'Open the day board: every airline\'s departures by the hour, against what your runways can take.', on: [['ui', 'aptOpen', 'day']], seen: '.dayb' },
    { el: '.dayb .dcap', title: 'Cap the busy hour', text: 'Where the stack reaches the dashed line, departures queue. Pick a cap: no more than that many leave in any hour; the rest move to the next hour with room.', on: [['ui', 'dayCap']] },
    { el: '.dayb .dbanks', title: 'Move a bank', text: 'Push one airline\'s flights an hour earlier or later with its arrows. Its whole day moves with it.', on: [['ui', 'dayShift']] },
    { el: '.dayb .dnight', title: 'Decide the night', text: 'Open pays and keeps the freighters happy; a quota keeps the town asleep most of the time; a curfew shuts the airport 23:00–06:00. Pick one.', on: [['ui', 'dayNight']] }
  ] },
  scorecards: { title: 'Airline scorecards', guide: 'deals', when: 'cards', early: 1, open: 'score', steps: [
    { el: '[data-act="aptOpen"][data-v="score"]', title: 'What the airlines think', text: 'Open the scorecards: each airline marks this airport on time-keeping, taxiing, gates, fuel, charges and bags.', on: [['ui', 'aptOpen', 'score']], seen: '.t.score' },
    { el: '.t.score [data-act="pmFix"]', title: 'Fix the worst', text: 'Under each airline is what it minds most. This button fixes it: press it.', on: [['ui', 'pmFix']] }
  ] },
  fleet: { title: 'Ground vehicles', guide: 'runway', when: 'ch1', early: 1, open: 'fleet', steps: [
    { el: '[data-act="aptOpen"][data-v="fleet"]', title: 'Your ground fleet', text: 'Open Ground vehicles: the tugs, apron buses and fuel trucks this airport owns.', on: [['ui', 'aptOpen', 'fleet']], seen: '.fleet' },
    { el: '.fleet [data-act="gseAdd"][data-v="tug"][data-n="1"]', title: 'Buy a tug', text: 'Each tug pushes back about ten aircraft an hour. Press + to buy one.', on: [['ui', 'gseAdd', 'tug']] },
    { el: '.fleet [data-act="gseAuto"]', title: 'Or let it run itself', text: 'Keep it matched buys and sells to what the traffic needs. Press it to see it switch; leave it on unless you want to run the fleet by hand.', on: [['ui', 'gseAuto']] }
  ] },
  treasury: { title: 'In the red', guide: 'money1', when: 'red', early: 1, steps: [
    { el: 'rail-economy', title: 'The treasury is below zero', text: 'Nothing new can be built or bought. Open the Economy room to see where the money goes.', on: [['ui', 'room', 'economy']], seen: '#warroom [data-act="redLoan"]' },
    { el: '[data-act="redLoan"]', title: 'The Treasury\'s loan', text: 'Its emergency loan costs 2.5% a month, more than twice the banks. Take it to start building again, or cut running costs and wait.', on: [['ui', 'redLoan'], ['loan'], ['redOut']] }
  ] }
};
const st = S => { const T = S.tutor || (S.tutor = { cur: null, i: 0, done: {}, over: {} }); if (!T.want) T.want = {}; return T; };
const flags = (S, id) => { const T = st(S); return T.done[id] || (T.done[id] = IC.TUTORS[id].steps.map(() => 0)); };
/* does this event do that step? (the act is matched against what the event carries: a click's act, a selection's
   kind, a deployed unit's type) */
const what = d => d == null ? null : typeof d === 'string' ? d : d.act || d.kind || null;
IC.tutorMatch = (step, type, d) => (step.on || []).some(([t, act, v]) => t === type && (!act || what(d) === act) && (v == null || (d && String(d.v) === String(v))));
/* a step's words: fixed, or made from the state (a town's name) */
IC.tutorText = (S, step) => typeof step.text === 'function' ? step.text(S) : step.text;
/* the step now shown: { id, i, n, step } or null */
IC.tutorNow = function (S) {
  const T = S.tutor; if (!T || !T.cur || !IC.TUTORS[T.cur]) return null;
  const F = flags(S, T.cur), i = F.indexOf(0);
  if (i < 0) { T.over[T.cur] = 1; T.cur = null; T.endT = S.time; return null; }
  return { id: T.cur, i, n: F.length, step: IC.TUTORS[T.cur].steps[i] };
};
/* start one (the first time the player meets what it teaches, or again from the Guide) */
IC.tutorStart = function (S, id, again) {
  const T = st(S); if (!IC.TUTORS[id] || (T.cur === id && !again)) return false;
  if (T.over[id] && !again) return false;
  if (again) { delete T.over[id]; T.done[id] = IC.TUTORS[id].steps.map(() => 0); }
  T.cur = id; delete T.want[id]; IC.tutorNow(S);
  IC.emit(S, 'tutorStart', id);
  return true;
};
IC.tutorSkip = function (S) { const T = st(S); if (T.cur) { T.over[T.cur] = 1; T.cur = null; T.endT = S.time; } };
/* put the one showing aside without finishing it: what it points at has gone (a card closed); it comes back when
   its step can be shown again */
IC.tutorPause = function (S) { const T = st(S); if (T.cur) { T.want[T.cur] = 1; T.cur = null; } };
IC.tutorSeen = (S, id) => !!(S.tutor && S.tutor.over[id]);
/* may it start now: not before the story reaches what it teaches, and (with a trigger) not before that happened */
IC.tutorWhen = function (S, id) {
  const T = IC.TUTORS[id], s = S.story, ch1 = !s || s.act > 1 || s.ch >= 1;
  if (T.trig && !(S.tutor && S.tutor.want && S.tutor.want[id]) && !(S.tutor && S.tutor.done[id] && S.tutor.done[id].some(Boolean))) return false;
  if (typeof T.when === 'function') { try { return !!T.when(S); } catch (e) { return false; } }
  return T.when === 'red' ? !!S.red : T.when === 'cards' ? ch1 && !!(S.av && S.av.airlines.some(a => a.sc)) : T.when === 'ch1' ? ch1 : true;
};
/* the steps of a tutorial that its own checks find done: ticked */
IC.tutorTick = function (S) {
  const N = IC.tutorNow(S); if (!N) return null;
  const F = flags(S, N.id), L = IC.TUTORS[N.id].steps;
  // (only the step showing: a later one's state may already hold for another reason, a plan from another piece)
  if (L[N.i].ok) { let ok = false; try { ok = !!L[N.i].ok(S); } catch (e) { ok = false; } if (ok) F[N.i] = 1; }
  return IC.tutorNow(S);
};
/* something happened: tick off what it does. Round 5b's four count it ahead of time; the rest only while they show */
IC.tutorEvent = function (S, type, d) {
  if (!S || S.time == null) return;
  const T = S.tutor; if (!T && type !== 'ui' && type !== 'bld' && !trigs[type]) return;
  for (const id in IC.TUTORS) {
    const D = IC.TUTORS[id];
    if (T && T.over[id]) continue;
    if (D.trig && D.trig.some(([t, act]) => t === type && (!act || what(d) === act))) st(S).want[id] = 1;
    if (!(D.early || (T && T.cur === id)) || !D.steps.some(s => IC.tutorMatch(s, type, d))) continue;
    const F = flags(S, id);
    if (D.early) D.steps.forEach((s, i) => { if (IC.tutorMatch(s, type, d)) F[i] = 1; });
    // (the one showing: the step now, and the ones after it the same action does too: Esc drops the plan and with
    // it the Build button the next step would point at)
    else for (let i = F.indexOf(0); i >= 0 && i < F.length && IC.tutorMatch(D.steps[i], type, d); i++) F[i] = 1;
  }
  if (S.tutor) IC.tutorTick(S);
};
const trigs = {}; for (const id in IC.TUTORS) for (const [t] of IC.TUTORS[id].trig || []) trigs[t] = 1;
/* the page saw a step's seen-selector on screen */
IC.tutorSaw = function (S, id, i) { const F = flags(S, id); if (!F[i]) { F[i] = 1; IC.tutorNow(S); } };
/* (round 5c) the civil tutorials in the order the Guide lists them, for "Show me" */
IC.tutorFor = guide => Object.keys(IC.TUTORS).filter(k => IC.TUTORS[k].guide === guide);
IC.on((S, type, d) => { if (type !== 'tutorStart' && S && S.mode !== 'academy') IC.tutorEvent(S, type, d); });
})(window.IC);
