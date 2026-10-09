/* Iron Canopy — (round 4, docs/focus/round-4.md) the Career's peacetime pace: the player's own clock, passenger
   milestones that open the bigger pieces, and a deck of peacetime events.
   - The play clock (S.story.play) counts real seconds of play from the speed the game runs at, so events come every
     few minutes of the player's time whether they watch at 4× or Wait at 432×.
   - Milestones (IC.MILESTONES): 2,000, 6,000, 15,000 and 50,000 passengers a day. Each is a card that says what the
     airport has outgrown, from its own numbers, and opens the piece that answers it (IC.pieceLock says what opens
     a locked piece, in one line).
   - The deck (IC.DECK): cards tied to the airport the player built, each with a choice whose consequence shows on
     the map (a runway closed, a visitor on the apron, aircraft held on their stands, an offer at the terminal) or in
     money. They are event cards like the story's own (IC.EV in story.js): made by name, so a saved card gets its
     choices back. Weather is at most one card in five.
   Headless: all of it runs in the step (IC.deckTick from IC.storyTick). Behind IC.FOCUS.progress. */
(function (IC) {
'use strict';
const U = IC.U;
const short = n => n.replace(/ (International|Airport|Field)$/, '');
const EV = IC.EV;
const on = S => IC.FOCUS.progress && S.mode === 'story' && !S.free && S.story && S.story.fresh && S.story.act === 1;
const capAp = S => S.story.cap ? S.byId[S.story.cap] : null;
const dayPax = S => Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0);
const hh = h => `${String(h).padStart(2, '0')}:00`;
const pt = o => ({ x: o.x, y: o.y });

/* ---------- the play clock ---------- */
/* the speed time runs at now: Wait and Finish now as fast as the page manages (main.js keeps S.wait.rate), skip at
   64×, otherwise the speed picked */
IC.playRate = S => S.wait ? (S.wait.rate || S.wait.speed || IC.WAIT.speed) : S.skip ? 64 : Math.max(1, S.speed || 1);

/* ---------- money and people, for the cards ---------- */
function money(S, v) { if (v > 0) { S.budget += v; IC.econBook(S, 'events', v); } else if (v < 0) IC.pay(S, 'events', -v); }
const conf = (S, v) => { S.story.standing = U.clamp(S.story.standing + v, 5, 100); };
const sat = (S, v, al) => { for (const a of S.av.airlines) if (!al || a === al) a.sat = U.clamp(a.sat + v, 0, 100); };
function town(S, ap) { let b = null, bd = 1e9; for (const c of IC.cities(S)) if (c.owner === 'us') { const d = U.dist(c, ap); if (d < bd) { bd = d; b = c; } } return b; }
const morale = (c, v) => { if (c) c.morale = U.clamp(c.morale + v, 0, 100); };
/* aircraft of an airline (or all) on the stands here, or due here, kept on the ground at least so long */
function hold(S, ap, secs, al) {
  let n = 0;
  for (const t of S.av.tails) if ((!al || t.al === al.id) && ((t.where === 'stand' && t.at === ap.id) || (al && t.where === 'away'))) { t.t = Math.max(t.t, secs); n++; }
  return n;
}
/* the weather that comes next, and when */
function forecast(S, kind, inS) { const w = S.weather; w.forecast = kind; w.next = Math.min(w.next, S.time + inS); }
const fogAt = S => { const h = (S.time % 86400) / 3600; return S.time + ((h < 4 ? 4 : 28) - h) * 3600; };
const rwOf = ap => ap.parts.filter(p => p.kind === 'runway' && p.built && p.hp > 0);
const longest = ap => Math.max(0, ...rwOf(ap).map(p => IC.rwLen ? IC.rwLen(p) : U.dist(p.a, p.b)));
const hasIls = ap => ap.parts.some(p => p.kind === 'ils' && p.built);
const tailsOn = (S, ap) => S.av.tails.filter(t => t.where === 'stand' && t.at === ap.id && t.t > 600);
const addUp = (S, v) => { S.story.extraUp = (S.story.extraUp || 0) + v; };

/* visitors the deck brings that never come on their own (weight 0 in IC.RARE) */
if (IC.RARE) {
  IC.RARE.bizlong = IC.RARE.bizlong || { w: 0, from: 'abroad', say: ap => `A film star’s long-range business jet is landing at ${ap}, for the festival.` };
  IC.RARE.widel = IC.RARE.widel || { w: 0, from: 'abroad', say: ap => `A foreign twin-aisle jet is diverting to ${ap} with a sick passenger on board.` };
}

/* ---------- the cards ----------
   Each: { title, who, text, at, opts: [{ t, tip, fx }] }. The first option is the one an unanswered card takes
   after three hours (story.js), so it is the careful one. */
EV.vip = (S, id) => { const ap = S.byId[id];
  return { title: 'A state visit', who: 'Protocol office', at: pt(ap), text: `A head of state lands at ${short(ap.name)} this afternoon in a four-engine jet of their own. Protocol asks for the runway to be cleared while they land and taxi in: about an hour with no other movements.`,
    opts: [
      { t: 'Close the runway for an hour', tip: `Arrivals hold or wait at the gate. Protocol pays ₭15M; the Minister +4.`, fx: () => { ap.closedT = Math.max(ap.closedT || 0, S.time + 3600); money(S, 15); conf(S, 4); IC.rareVisit(S, 'state', ap.id); } },
      { t: 'Fit them in between airliners', tip: 'No delays for the airlines. Security is unhappy: the Minister −3.', fx: () => { conf(S, -3); IC.rareVisit(S, 'state', ap.id); } }
    ] }; };
EV.storm = (S, id) => { const ap = S.byId[id];
  return { title: 'A storm front', who: 'Met office', weather: true, at: pt(ap), text: `A line of thunderstorms reaches ${short(ap.name)} within the hour: gusts of 40 knots and more, heavy rain, lightning over the apron. Crews will not land in the worst of it.`,
    opts: [
      { t: 'Close the runway for three hours', tip: 'Nobody takes the risk. Flights wait or divert: every airline −2.', fx: () => { forecast(S, 'storm', 600); ap.closedT = Math.max(ap.closedT || 0, S.time + 3 * 3600); sat(S, -2); } },
      { t: 'Keep it open: the crews decide', tip: 'Fewer delays, but a gust beyond a crew’s limit can end in an accident.', fx: () => { forecast(S, 'storm', 600); } }
    ] }; };
EV.fog = (S, id) => { const ap = S.byId[id], ils = hasIls(ap);
  return { title: 'Fog tomorrow morning', who: 'Met office', weather: true, at: pt(ap), text: `Fog will lie over ${short(ap.name)} from about 04:00 to 10:00 tomorrow, 300 m of visibility at best. ${ils ? 'The landing system keeps the runway open; the taxiways will be slow.' : 'There is no landing system: every arrival in it will divert.'}`,
    opts: ils ? [
      { t: 'Tell the airlines the airport stays open', tip: 'They keep their morning flights. Every airline +3.', fx: () => { forecast(S, 'fog', fogAt(S) - S.time); sat(S, 3); } },
      { t: 'Ask them to hold the first wave on the ground', tip: 'Safe and slow: morning departures wait until 10:00. Every airline −1.', fx: () => { forecast(S, 'fog', fogAt(S) - S.time); hold(S, ap, fogAt(S) + 6 * 3600 - S.time); sat(S, -1); } }
    ] : [
      { t: 'Ask the airlines to move their morning flights', tip: 'Aircraft wait on their stands until 10:00 instead of diverting. Every airline −2.', fx: () => { forecast(S, 'fog', fogAt(S) - S.time); hold(S, ap, fogAt(S) + 6 * 3600 - S.time); sat(S, -2); } },
      { t: 'Fly as planned', tip: 'Arrivals in the fog divert, and the airline is paid back.', fx: () => { forecast(S, 'fog', fogAt(S) - S.time); } }
    ] }; };
EV.snow = (S, id) => { const ap = S.byId[id];
  return { title: 'Snow tonight', who: 'Met office', weather: true, at: pt(ap), text: `Snow is forecast over ${short(ap.name)} tonight: 1.2 km of visibility and a runway that must be ploughed. ${hasIls(ap) ? 'The landing system will bring arrivals in.' : 'Without a landing system, arrivals in it divert.'}`,
    opts: [
      { t: 'Plough through the night: ₭6M overtime', tip: 'The runway stays open.', fx: () => { forecast(S, 'snow', 3600); money(S, -6); } },
      { t: 'Close the runway while it falls (4 hours)', tip: 'Free, and flights wait or divert. Every airline −2.', fx: () => { forecast(S, 'snow', 3600); ap.closedT = Math.max(ap.closedT || 0, S.time + 5 * 3600); sat(S, -2); } }
    ] }; };
EV.strike = (S, id, alId) => { const ap = S.byId[id], al = IC.avAirline(S, alId) || flagOf(S);
  return { title: `${al.name}: cabin crew strike`, who: 'Ground operations', at: pt(ap), text: `${al.name}’s cabin crews have walked out over rosters. Its aircraft at ${short(ap.name)} are staying on their stands, and the passengers are in our terminal.`,
    opts: [
      { t: 'Mediate: ₭20M towards a deal', tip: 'They are back within three hours. The airline +4.', fx: () => { money(S, -20); hold(S, ap, 3 * 3600, al); sat(S, 4, al); } },
      { t: 'Stay out of it', tip: 'Free. Its aircraft stay on the ground for 12 hours, and the papers blame the airport: the Minister −2.', fx: () => { hold(S, ap, 12 * 3600, al); conf(S, -2); } }
    ] }; };
EV.newcomer = (S, id, kind) => { const ap = S.byId[id];
  return { title: 'A new airline wants slots', who: 'Commercial office', at: pt(ap), text: `A ${kind === 'foreign' ? 'foreign' : 'low-cost'} airline has asked for slots at ${short(ap.name)}: a base for ${kind === 'foreign' ? 'one aircraft' : 'two aircraft'} if the terms are right.`,
    opts: [
      { t: 'Invite an offer', tip: 'Its offer shows at the terminal, with what it needs from the airport.', fx: () => { IC.storyNewAirline(S, kind, 0, ap); } },
      { t: 'Tell them the airport is full', tip: 'No offer. The airport’s name −2 among the airlines.', fx: () => { ap.rep = U.clamp(IC.aptRep(ap) - 2, 0, 100); } }
    ] }; };
EV.record = (S, id, n) => { const ap = S.byId[id]; n = n || Math.round(dayPax(S));
  return { title: 'A record day', who: 'Airport operations', at: pt(ap), text: `${short(ap.name)} carried ${n.toLocaleString('en-US')} passengers yesterday, its busiest day yet. The staff have noticed.`,
    opts: [
      { t: 'A bonus for the staff: ₭10M', tip: 'Smiling handlers, quicker turnarounds: every airline +3.', fx: () => { money(S, -10); sat(S, 3); } },
      { t: 'A press release', tip: 'Free. The Minister +3.', fx: () => { conf(S, 3); } }
    ] }; };
EV.holiday = (S, id, alId) => { const ap = S.byId[id], al = IC.avAirline(S, alId) || flagOf(S), pax = Math.round(dayPax(S));
  return { title: 'The holiday rush', who: 'Commercial office', at: pt(ap), text: `The school holidays start this week. Bookings out of ${short(ap.name)} are up by a third, and ${al.name} asks whether we can take more flights.`,
    opts: [
      { t: `Invite ${al.name} to add flights`, tip: 'Its offer for more aircraft shows at the terminal.', fx: () => { const P = IC.avPorts(S); IC.avRequest(S, al, ap, U.pick(P), al.kind === 'regional' ? 'turbo' : 'narrow', 1, 'wants to add holiday flights', IC.MO(S, 0.5)); } },
      { t: 'A holiday surcharge on every ticket', tip: `About ₭${Math.max(3, Math.round(pax * 0.004))}M now; every airline −4.`, fx: () => { money(S, Math.max(3, Math.round(pax * 0.004))); sat(S, -4); } }
    ] }; };
EV.inspect = (S, id) => { const ap = S.byId[id];
  return { title: 'The regulator’s inspection', who: 'Civil Aviation Authority', at: pt(ap), text: `Inspectors arrive at ${short(ap.name)} tomorrow: fire cover, landing systems, the state of the runway, the fuel farm. They can come now, or in a month.`,
    opts: [
      { t: 'Show them round now', tip: 'What they find decides it: passed, the airport’s name +4 and the Minister +3; failed, a ₭15M fine.', fx: () => inspect(S, ap) },
      { t: 'Ask for a month to prepare', tip: 'The Minister −2. They come back.', fx: () => { conf(S, -2); S.story.deck.again = { key: 'inspect', at: S.time + IC.MO(S, 1) }; } }
    ] }; };
function inspect(S, ap) {
  const st = ap.st || {}, bad = [];
  if (!st.fire) bad.push('no fire cover');
  else for (const rw of rwOf(ap)) if (((st.rescueRw || {})[rw.id] || 0) > IC.FIRE_STD) bad.push(`fire trucks slow to the far end of runway ${rw.name || ''}`.trim());
  if (!hasIls(ap)) bad.push('no landing system');
  if (rwOf(ap).some(p => (p.wear || 0) > 0.6)) bad.push('a worn runway');
  if (!ap.parts.some(p => p.kind === 'fuel' && p.built)) bad.push('no fuel farm');
  if (!bad.length) { ap.rep = U.clamp(IC.aptRep(ap) + 4, 0, 100); conf(S, 3); IC.log(S, 'kill', 'INSPECTION', `${ap.name} passed its inspection: fire cover, landing systems, runway and fuel all in order.`, ap); }
  else { money(S, -15); IC.log(S, 'warn', 'INSPECTION', `${ap.name} failed its inspection: ${bad.join(', ')}. A ₭15M fine. The airport panel shows what to build.`, ap); }
}
EV.bird = (S, id, cs) => { const ap = S.byId[id]; cs = cs || 'An airliner';
  return { title: 'Bird strike', who: 'Airport operations', at: pt(ap), text: `${cs} flew through a flock of gulls climbing out of ${short(ap.name)}. It came back round and landed safely with a dented engine. The gulls are still there.`,
    opts: [
      { t: 'Hire a bird-control team: ₭12M, then ₭0.1M an hour', tip: 'Falcons and patrols keep the birds off: bird strikes here a quarter as likely.', fx: () => { money(S, -12); ap.birdCtl = true; addUp(S, 0.1); } },
      { t: 'Cut the grass shorter: ₭2M', tip: 'It helps a little.', fx: () => { money(S, -2); } }
    ] }; };
EV.airshow = (S, id, cityId) => { const ap = S.byId[id], c = S.byId[cityId] || town(S, ap);
  return { title: 'An airshow request', who: `${c.name} city council`, at: pt(ap), text: `${c.name} asks to hold an airshow at ${short(ap.name)} this afternoon: the national display team, stalls on the apron, thousands of visitors. The runway would close to airlines for three hours.`,
    opts: [
      { t: 'Host it', tip: `The runway closes three hours. ₭40M in tickets; ${c.name}’s morale +6. The display team flies in.`, fx: () => { ap.closedT = Math.max(ap.closedT || 0, S.time + 3 * 3600); money(S, 40); morale(c, 6); IC.rareVisit(S, 'display', ap.id); } },
      { t: 'Decline: the runway is for the airlines', tip: `${c.name}’s morale −2.`, fx: () => { morale(c, -2); } }
    ] }; };
EV.celeb = (S, id) => { const ap = S.byId[id];
  return { title: 'A celebrity’s jet', who: 'Business aviation desk', at: pt(ap), text: `A film star’s long-range jet wants to park at ${short(ap.name)} for the festival week, with a car to the steps and nobody watching.`,
    opts: [
      { t: 'A private stand and a car: ₭8M', tip: 'The jet lands and parks on the business side. The press loves it: the Minister +1.', fx: () => { money(S, 8); conf(S, 1); IC.rareVisit(S, 'bizlong', ap.id); } },
      { t: 'No special treatment', tip: 'They go to another country’s airport.', fx: () => {} }
    ] }; };
EV.divert = (S, id) => { const ap = S.byId[id];
  return { title: 'A diversion', who: 'Area control', at: pt(ap), text: `A foreign twin-aisle jet, 396 seats, has a passenger with a heart attack on board. The crew ask to divert to ${short(ap.name)}: they need a long runway and a large stand for a few hours.`,
    opts: [
      { t: 'Clear it in', tip: 'It lands and parks on a large stand. ₭6M in fees; a life saved: the Minister +3.', fx: () => { money(S, 6); conf(S, 3); IC.rareVisit(S, 'widel', ap.id); } },
      { t: 'Send it on to its own country', tip: 'Two more hours in the air for the patient. The Minister −4.', fx: () => { conf(S, -4); } }
    ] }; };
EV.lost = (S, id, tid) => { const ap = S.byId[id], t = S.av.tails.find(x => x.id === tid), cs = t ? t.cs : 'the flight';
  return { title: 'A lost passenger', who: 'Terminal duty manager', at: pt(ap), text: `A boy of seven has lost his family between security and the gates. They are on ${cs}, boarding now at ${short(ap.name)}.`,
    opts: [
      { t: `Hold ${cs} until they are together`, tip: 'About 25 minutes late. The papers like it: the Minister +2.', fx: () => { if (t && t.where === 'stand') t.t += 1500; conf(S, 2); } },
      { t: 'Let it go; he flies on the next one', tip: 'On time. The family is not pleased: its airline −2.', fx: () => { if (t) sat(S, -2, IC.avAirline(S, t.al)); } }
    ] }; };
EV.fuel = (S, id) => { const ap = S.byId[id];
  return { title: 'A fuel shortage', who: 'Fuel supplier', at: pt(ap), text: `The refinery that supplies ${short(ap.name)} has broken down. The tanks hold half a day; after that, departures queue at the fuel farm.`,
    opts: [
      { t: 'Buy jet fuel abroad: ₭25M', tip: 'Tankers come by road. No delays.', fx: () => { money(S, -25); } },
      { t: 'Ration it', tip: 'Free. Every aircraft on the stands waits 40 minutes more; every airline −2.', fx: () => { hold(S, ap, 2400); sat(S, -2); } }
    ] }; };
EV.power = (S, id) => { const ap = S.byId[id];
  return { title: 'A power cut', who: 'Terminal duty manager', at: pt(ap), text: `A fire in a substation has cut the power to ${short(ap.name)}’s terminal: no check-in, no baggage belts, no jet bridges.`,
    opts: [
      { t: 'Run the generators: ₭6M in diesel', tip: 'The terminal works on.', fx: () => { money(S, -6); } },
      { t: 'Wait for the grid (about two hours)', tip: 'Free. Boarding stops: every aircraft on its stand waits two hours.', fx: () => { hold(S, ap, 2 * 3600); } }
    ] }; };
EV.film = (S, id) => { const ap = S.byId[id];
  return { title: 'A film crew', who: 'A film studio', at: pt(ap), text: `A studio wants to shoot a chase on ${short(ap.name)}’s apron tonight: one stand closed from dusk to dawn, ₭15M for the trouble.`,
    opts: [
      { t: 'Let them film: ₭15M', tip: 'One free stand closes for the night (it shows on the apron).', fx: () => { money(S, 15); const s = IC.aptStands(ap).find(x => !x.occ && x.linked !== false && x.hp > 0); if (s) { s.occ = 'film'; IC.later(S, 10 * 3600, 'deckFree', S, ap.id, s.id); } } },
      { t: 'No: the apron is for aircraft', tip: 'They shoot it at an airfield abroad. The stand stays ours.', fx: () => {} }
    ] }; };
IC.H.deckFree = (S, apId, sid) => () => { const ap = S.byId[apId], s = ap && IC.aptStands(ap).find(x => x.id === sid); if (s && s.occ === 'film') s.occ = null; };
EV.medical = (S, id) => { const ap = S.byId[id];
  return { title: 'A medical flight', who: 'Area control', at: pt(ap), text: `An air ambulance is bringing a donor heart into ${short(ap.name)} in 20 minutes. It asks for a straight-in approach with nothing in the way.`,
    opts: [
      { t: 'Give it priority: departures wait', tip: 'Every aircraft on the stands waits 15 minutes. The Minister +3.', fx: () => { for (const t of tailsOn(S, ap)) t.t += 900; conf(S, 3); } },
      { t: 'It joins the queue like anyone else', tip: 'No delays. If the papers hear of it: the Minister −2.', fx: () => { conf(S, -2); } }
    ] }; };
EV.charter = (S, id, alId) => { const ap = S.byId[id], al = IC.avAirline(S, alId) || flagOf(S);
  return { title: 'A charter wave', who: 'A tour operator', at: pt(ap), text: `A tour operator wants a season of charters to the sun from ${short(ap.name)}, flown by ${al.name}: two more aircraft at our stands on weekends.`,
    opts: [
      { t: 'Take them', tip: 'The offer shows at the terminal, with what it needs.', fx: () => { const P = IC.avPorts(S); IC.avRequest(S, al, ap, U.pick(P), 'narrow', 2, 'wants to fly a season of charters', IC.MO(S, 0.5)); } },
      { t: 'Not this season', tip: 'The charters go from a neighbour’s airport, and their fees with them.', fx: () => {} }
    ] }; };
EV.noise = (S, id, cityId) => { const ap = S.byId[id], c = S.byId[cityId] || town(S, ap);
  return { title: 'Noise at night', who: `${c.name} residents’ association`, at: pt(c), text: `People under the approach to ${short(ap.name)} say the night flights keep them awake, and ${c.name}’s council has taken it up.`,
    opts: [
      { t: 'Pay for insulation: ₭30M', tip: `Double glazing for the worst-hit streets. ${c.name}’s morale +3.`, fx: () => { money(S, -30); morale(c, 3); } },
      { t: 'A night curfew, 23:00 to 06:00', tip: `Free. Nothing lands or leaves at night, freight included. ${c.name}’s morale +6.`, fx: () => { IC.setNight(S, ap, 'curfew'); morale(c, 6); } },
      { t: 'Do nothing', tip: `${c.name}’s morale −6; the Minister −2.`, fx: () => { morale(c, -6); conf(S, -2); } }
    ] }; };
EV.union = (S, id) => { const ap = S.byId[id];
  return { title: 'A pay claim', who: 'Ground handlers’ union', at: pt(ap), text: `The ground handlers at ${short(ap.name)} want 10% more. Without it they will work to rule: every turnaround by the book, and slow.`,
    opts: [
      { t: 'Pay it: ₭0.2M an hour more', tip: 'Turnarounds stay quick; every airline +2.', fx: () => { addUp(S, 0.2); sat(S, 2); } },
      { t: 'Refuse', tip: 'Free. For a day every aircraft on the stands waits 30 minutes more; every airline −3.', fx: () => { for (const t of tailsOn(S, ap)) t.t += 1800; sat(S, -3); } }
    ] }; };
EV.hobbydrone = (S, id) => { const ap = S.byId[id];
  return { title: 'A drone near the runway', who: 'Tower', at: pt(ap), text: `A pilot on final to ${short(ap.name)} has seen a small drone at 800 ft, a kilometre from the runway. Probably a hobbyist. The police are on their way.`,
    opts: [
      { t: 'Stop landings for 20 minutes', tip: 'Safe. A few arrivals hold.', fx: () => { ap.closedT = Math.max(ap.closedT || 0, S.time + 1200); } },
      { t: 'Keep landing and warn the crews', tip: 'No delays. If it hits an airliner, it is on us.', fx: () => { conf(S, -1); } }
    ] }; };
EV.openday = (S, id, cityId) => { const ap = S.byId[id], c = S.byId[cityId] || town(S, ap);
  return { title: 'An open day', who: `${c.name} schools`, at: pt(ap), text: `Schools in ${c.name} ask whether 3,000 children can see ${short(ap.name)} on Saturday: the fire station, the tower, an airliner on its stand.`,
    opts: [
      { t: 'Open the gates: ₭3M', tip: `${c.name}’s morale +4; the Minister +2.`, fx: () => { money(S, -3); morale(c, 4); conf(S, 2); } },
      { t: 'Not while we are this busy', tip: 'The teachers are disappointed. The day runs as planned.', fx: () => {} }
    ] }; };
EV.vintage = (S, id) => { const ap = S.byId[id];
  return { title: 'A vintage airliner', who: 'The vintage aircraft society', at: pt(ap), text: `A restored four-engine airliner from the 1950s is on a tour, and its society asks to show it at ${short(ap.name)} for a day.`,
    opts: [
      { t: 'Welcome it: ₭2M for the stand and the stewards', tip: 'It lands and parks, and people come out to watch: the nearest town’s morale +3.', fx: () => { money(S, -2); morale(town(S, ap), 3); IC.rareVisit(S, 'vintage', ap.id); } },
      { t: 'No room this week', tip: 'It lands somewhere else on its tour.', fx: () => {} }
    ] }; };
EV.spotters = (S, id, cityId) => { const ap = S.byId[id], c = S.byId[cityId] || town(S, ap);
  return { title: 'Plane spotters', who: `${c.name} aviation club`, at: pt(ap), text: `Spotters have been parking on the verge by ${short(ap.name)}’s runway to watch the jets. They ask for a proper viewing area with a car park.`,
    opts: [
      { t: 'Build them one: ₭4M', tip: `${c.name}’s morale +2; the verge is clear again.`, fx: () => { money(S, -4); morale(c, 2); } },
      { t: 'Have the police move them on', tip: `${c.name}’s morale −2.`, fx: () => { morale(c, -2); } }
    ] }; };

/* the deck: when each card may come, and what it is given. cond(S, ap) → the arguments, or null */
const flagOf = S => S.av.airlines.find(a => a.kind === 'flag' && !a.gone) || S.av.airlines.find(a => !a.gone);
IC.DECK = {
  vip: { w: 1, cond: (S, ap) => longest(ap) >= 28 ? [ap.id] : null },
  storm: { w: 1, weather: true, cond: (S, ap) => IC.seasonOf(S).name !== 'Winter' ? [ap.id] : null },
  fog: { w: 1, weather: true, cond: (S, ap) => [ap.id] },
  snow: { w: 1, weather: true, cond: (S, ap) => IC.seasonOf(S).snow >= 1 ? [ap.id] : null },
  strike: { w: 1, cond: (S, ap) => { const al = flagOf(S); return al && S.av.tails.some(t => t.al === al.id && t.where === 'stand' && t.at === ap.id) ? [ap.id, al.id] : null; } },
  newcomer: { w: 1.2, cond: (S, ap) => [ap.id, S.av.airlines.filter(a => a.kind === 'budget').length > 1 ? 'foreign' : 'budget'] },
  record: { w: 1, cond: (S, ap) => { const d = S.story.deck, y = S.av.yesterday ? Math.round(S.av.yesterday.pax) : 0; return y > 300 && y > (d.best || 0) * 1.15 ? [ap.id, y] : null; } },
  holiday: { w: 1, cond: (S, ap) => { const al = S.av.airlines.find(a => a.kind === 'budget' && !a.gone) || flagOf(S); return al ? [ap.id, al.id] : null; } },
  inspect: { w: 1, cond: (S, ap) => [ap.id] },
  bird: { w: 1, cond: (S, ap) => { const t = S.av.tails.find(x => x.where !== 'lost' && x.at === ap.id); return !ap.birdCtl && t ? [ap.id, t.cs] : null; } },
  airshow: { w: 0.8, cond: (S, ap) => { const c = town(S, ap); return c ? [ap.id, c.id] : null; } },
  celeb: { w: 1, cond: (S, ap) => longest(ap) >= 18 ? [ap.id] : null },
  divert: { w: 1, cond: (S, ap) => longest(ap) >= 30 && IC.aptStands(ap).some(s => s.size === 'l' || s.size === 'xl') ? [ap.id] : null },
  lost: { w: 1, cond: (S, ap) => { const t = tailsOn(S, ap)[0]; return t ? [ap.id, t.id] : null; } },
  fuel: { w: 1, cond: (S, ap) => tailsOn(S, ap).length ? [ap.id] : null },
  power: { w: 1, cond: (S, ap) => tailsOn(S, ap).length ? [ap.id] : null },
  film: { w: 0.8, cond: (S, ap) => IC.aptStands(ap).some(x => !x.occ && x.linked !== false) ? [ap.id] : null },
  medical: { w: 1, cond: (S, ap) => [ap.id] },
  charter: { w: 1, cond: (S, ap) => { const al = S.av.airlines.find(a => a.kind === 'budget' && !a.gone) || flagOf(S); return al ? [ap.id, al.id] : null; } },
  noise: { w: 1, cond: (S, ap) => { const c = town(S, ap); return c && !ap.curfew ? [ap.id, c.id] : null; } },
  union: { w: 1, cond: (S, ap) => [ap.id] },
  hobbydrone: { w: 1, cond: (S, ap) => [ap.id] },
  openday: { w: 0.8, cond: (S, ap) => { const c = town(S, ap); return c ? [ap.id, c.id] : null; } },
  vintage: { w: 0.8, cond: (S, ap) => longest(ap) >= 18 ? [ap.id] : null },
  spotters: { w: 0.8, cond: (S, ap) => { const c = town(S, ap); return c ? [ap.id, c.id] : null; } }
};
/* play seconds between cards, and the least game time between them (at 1× a card every few game hours is plenty) */
IC.DECK_PACE = { first: 120, gap: [150, 270], gameMin: 4 * 3600, recent: 8, weatherIn: 5 };

/* the next card: one the airport can have now, not one of the last few, weather at most one in five */
IC.deckPick = function (S, ap) {
  const d = S.story.deck, P = IC.DECK_PACE, last = d.last.slice(-P.recent), wx = d.last.slice(-(P.weatherIn - 1)).some(k => IC.DECK[k] && IC.DECK[k].weather);
  if (d.again && S.time >= d.again.at) { const k = d.again.key; d.again = null; return { k, args: IC.DECK[k].cond(S, ap) || [ap.id] }; }
  const L = [];
  for (const k in IC.DECK) {
    const D = IC.DECK[k];
    if (last.includes(k) || (D.weather && wx)) continue;
    const args = D.cond(S, ap); if (!args) continue;
    L.push([{ k, args }, D.w * (d.used[k] ? 1 : 3)]);
  }
  return L.length ? U.wpick(L) : null;
};
IC.deckDeal = function (S, k, args) {
  const d = S.story.deck;
  d.last.push(k); if (d.last.length > 20) d.last.shift();
  d.used[k] = (d.used[k] || 0) + 1; d.n++; d.t = S.time;
  if (k === 'record') d.best = args[1];
  IC.storyEvent(S, k, ...args);
  IC.emit(S, 'deckCard', { key: k });
};

/* ---------- milestones: passengers a day, and the piece each opens because the airport needs it ---------- */
IC.MILESTONES = [
  { n: 2000, piece: 'tpier', name: 'Terminal with a pier', parts: ['concourse', 'curved', 'pierT', 'pierY', 'pierX'], open: 'concourse' },
  { n: 6000, piece: 'rwkit', name: 'a second runway', second: true, parts: ['runway'], open: 'runway' },
  { n: 15000, piece: 'tround', name: 'Round terminal', parts: ['rotunda', 'satellite', 'semicircle'], open: 'rotunda' },
  { n: 50000, pay: 200, name: 'a hub' }
];
/* the milestone that opens a piece, or (wave 12, the bar of parts) a part */
const msOf = k => IC.MILESTONES.findIndex(m => m.piece === k || (IC.FOCUS.parts && m.parts && m.parts.includes(k)));
/* why a piece is not open yet ('' when it is), in one line: what opens it */
IC.pieceLock = function (S, k, ap) {
  if (!S || !on(S)) return '';
  const i = msOf(k); if (i < 0) return '';
  const M = IC.MILESTONES[i];
  if ((S.story.ms || 0) > i) return '';
  if (M.second && !(ap && ap.parts && ap.parts.some(p => p.kind === 'runway'))) return '';
  const now = Math.round(dayPax(S)).toLocaleString('en-US');
  return M.second ? `A second runway opens at ${M.n.toLocaleString('en-US')} passengers a day (${now} now): until then one runway carries every flight.`
    : `Opens at ${M.n.toLocaleString('en-US')} passengers a day (${now} now), when one ${M.piece === 'tpier' ? 'row of gates' : 'terminal'} is no longer enough.`;
};
IC.pieceLockShort = (S, k) => { const M = IC.MILESTONES[msOf(k)]; return M ? `${(M.n / 1000)}k passengers a day` : ''; };
/* the airport's busiest moments today and yesterday: stands taken, passengers an hour, at what hour */
function peaks(S) {
  const st = S.story, day = Math.floor(S.time / 86400), h = Math.floor((S.time % 86400) / 3600);
  st.peak = st.peak || {};
  for (const ap of IC.bases(S)) {
    if (ap.kind !== 'airport' || ap.owner !== 'us' || !ap.parts) continue;
    const P = st.peak[ap.id] = st.peak[ap.id] || { d: day, occ: 0, h: 0, pax: 0, ph: 0, y: null };
    if (P.d !== day) { P.y = { occ: P.occ, h: P.h, pax: P.pax, ph: P.ph }; P.d = day; P.occ = 0; P.pax = 0; }
    const occ = IC.aptStands(ap).filter(s => s.occ && s.zone !== 'cargo' && s.zone !== 'mil').length;
    if (occ > P.occ) { P.occ = occ; P.h = h; }
    if ((ap.paxRate || 0) > P.pax) { P.pax = ap.paxRate || 0; P.ph = h; }
  }
}
function milestone(S, i) {
  const st = S.story, M = IC.MILESTONES[i], ap = capApt(S); if (!ap) return;
  st.ms = i + 1;
  const P = (st.peak || {})[ap.id] || {}, B = P.y && P.y.occ > (P.occ || 0) ? P.y : P, pv = IC.aptProvides(ap), stt = ap.st || {};
  const gates = pv.gates, stands = IC.aptStands(ap).filter(s => s.linked !== false && s.zone !== 'cargo' && s.zone !== 'mil').length;
  const title = `${M.n.toLocaleString('en-US')} passengers a day`;
  let text, fix = null; const P_ = IC.FOCUS.parts;
  if (M.piece === 'tpier') {
    text = `At ${hh(B.h || 9)}, its busiest hour, ${B.occ || 0} of ${short(ap.name)}’s ${stands} stands were taken and ${gates} of them have a gate. A pier reaches out from the terminal with gates on both sides: more gates without a second building. ${P_ ? 'The Concourse, the Curved pier, the T and Y piers and the X airside are open under Terminals & piers.' : 'The Terminal with a pier is open under Airport pieces.'}`;
    fix = { label: 'Place a pier', v: P_ ? M.open : 'tpier' };
  } else if (M.piece === 'rwkit') {
    const mv = Math.round(stt.movesPerHour || 0);
    text = `${short(ap.name)}’s runway takes about ${mv} movements an hour, and at its busy hours arrivals now wait for departures. A second runway, 1.1 km or more from the first, lets one land while the other sends them off. ${P_ ? 'It is open under Runways; give it a parallel taxiway and links to the first.' : 'It is open under Airport pieces.'}`;
    fix = { label: 'Place a second runway', v: P_ ? M.open : 'rwkit' };
  } else if (M.piece === 'tround') {
    text = `${short(ap.name)}’s terminals took ${Math.round(B.pax || P.pax || ap.paxRate || 0).toLocaleString('en-US')} passengers in their busiest hour, against ${Math.round(stt.pax || 0).toLocaleString('en-US')} they are built for. A round terminal fans its gates around one building, so passengers walk less. ${P_ ? 'The Round terminal, the Satellite and the Semicircular terminal are open under Terminals & piers.' : 'It is open under Airport pieces.'}`;
    fix = { label: 'Place a round terminal', v: P_ ? M.open : 'tround' };
  } else {
    S.budget += M.pay; IC.econBook(S, 'bonus', M.pay); st.standing = Math.min(100, st.standing + 5);
    text = `${short(ap.name)} is a hub now: more people fly through it in a day than live in most of our towns. The Ministry adds ${U.money(M.pay)} and the Minister’s confidence rises.`;
  }
  IC.card(S, title, `${short(ap.name)} · ${U.clock(S.time, S)}`, text, 'moment', Object.assign({ at: { x: ap.x, y: ap.y }, milestone: M.n }, fix ? { fix, ap: ap.id } : {}));
  IC.log(S, 'kill', 'MILESTONE', `${title} through ${ap.name}.${M.piece ? ` ${M.second ? 'A second runway' : M.name} is open to build.` : ''}`, ap);
  IC.emit(S, 'milestone', { n: M.n, ap: ap.id, piece: M.piece || null });
}
const capApt = capAp;

/* ---------- every step ---------- */
IC.deckTick = function (S, dt) {
  const st = S.story;
  st.play = (st.play || 0) + dt / (IC.GS * IC.playRate(S));
  if (!on(S) || !st.opened) return;
  const d = st.deck = st.deck || { next: 0, last: [], used: {}, n: 0, t: -1e9, best: 0, again: null };
  // a few times a game minute is plenty
  st.deckT = (st.deckT || 0) - dt; if (st.deckT > 0) return;
  st.deckT = 30;
  peaks(S);
  const pax = dayPax(S);
  while ((st.ms || 0) < IC.MILESTONES.length && pax >= IC.MILESTONES[st.ms || 0].n) milestone(S, st.ms || 0);
  // the deck starts once the first airliner is on its stand
  if (!st.cnt.parked) return;
  if (!d.next) d.next = st.play + IC.DECK_PACE.first;
  if (st.play < d.next || S.time - d.t < IC.DECK_PACE.gameMin || st.events.length) return;
  const ap = capApt(S); if (!ap) return;
  const c = IC.deckPick(S, ap);
  d.next = st.play + U.rand(IC.DECK_PACE.gap[0], IC.DECK_PACE.gap[1]);
  if (c) IC.deckDeal(S, c.k, c.args);
};

})(window.IC);
