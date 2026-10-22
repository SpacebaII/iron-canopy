/* Iron Canopy — (brief 70) the story's memory: the people and how they feel about you, the flags the story keeps,
   the chains of cards that run through the peace, the road the war comes by, and the epilogue.
   - The cast (IC.CAST in data.js): st.cast[key].trust, 0-100, moved by IC.castTrust with a reason. Cards from a
     person carry their key (e.cast), so the card shows their face (render-portrait.js).
   - Flags (st.flags, a Map): what the story remembers, each with words (IC.FLAG_WORDS) for the Journal.
   - Chains (IC.CHAINS): three to five cards each, paced by the play clock like the deck (deck.js), every option
     saying what it costs now (tip) and what it risks later (risk). Endings set flags, and most come back later.
   - The neighbour: its leader (st.foe) and grievance (st.grievance) drawn at the start of a Career.
   - The road to the war (st.road, IC.ROADS_TO_WAR), picked at the start of Act III from the flags.
   - The epilogue (IC.epilogue): a paragraph per thread of the story, from what was chosen.
   Headless: all of it runs in the step (IC.chainsTick from IC.storyTick). */
(function (IC) {
'use strict';
const U = IC.U;
const EV = IC.EV;
const MO = (S, n) => IC.MO(S, n);
const short = n => n.replace(/ (International|Airport|Air Base|Field)$/, '');

/* ---------- the cast ---------- */
IC.castInit = function (S) {
  const st = S.story; st.cast = {};
  for (const k in IC.CAST) st.cast[k] = { trust: IC.CAST[k].trust, last: '', lastT: 0, log: [] };
};
/* who a key means now: the Minister of Transport is Finch once Halloran has fallen */
IC.castWho = function (S, key) {
  const st = S && S.story;
  if (key === 'MIN' && st && st.flags && st.flags.get('minister') === 'finch') return 'FINCH';
  return key;
};
IC.castTrust = function (S, key, dv, why) {
  const st = S.story; if (!st || !st.cast) return;
  key = IC.castWho(S, key);
  const c = st.cast[key]; if (!c || !dv) return;
  c.trust = U.clamp(c.trust + dv, 0, 100);
  c.log.push({ t: S.time, dv, why: why || '' });
  if (c.log.length > 12) c.log.shift();
  IC.emit(S, 'trust', { key, dv, trust: c.trust });
};
IC.trustOf = (S, key) => { const c = S.story && S.story.cast && S.story.cast[IC.castWho(S, key)]; return c ? c.trust : 50; };
IC.trustWord = v => v >= 80 ? 'loyal' : v >= 62 ? 'warm' : v >= 40 ? 'neutral' : v >= 22 ? 'wary' : 'cold';
/* the last thing a person said, for the People page */
IC.castLast = (S, key) => { const L = S.camp ? S.camp.comms : []; for (let i = L.length - 1; i >= 0; i--) if (L[i].who === key) return L[i]; return null; };
/* a short line for a card option: who will remember it */
function trustLine(S, T) {
  if (!T) return '';
  const L = [];
  for (const k in T) {
    const who = IC.ADVISORS[IC.castWho(S, k)]; if (!who || !T[k]) continue;
    const n = who.name.replace(/^(Min\.|Gov\.|Gen\.|Col\.|Maj\.|Capt\.|Prime Minister|Ambassador) /, '').split(' ').pop();
    L.push(T[k] >= 10 ? `${n} will be grateful.` : T[k] > 0 ? `${n} approves.` : T[k] <= -10 ? `${n} will not forget it.` : `${n} is not pleased.`);
  }
  return L.join(' ');
}

/* ---------- flags ---------- */
IC.flag = (S, k, v) => { const st = S.story; if (!st) return; st.flags.set(k, v === undefined ? true : v); st.flagT.set(k, S.time); IC.emit(S, 'flag', { k, v }); };
IC.flagOf = (S, k) => S.story && S.story.flags ? S.story.flags.get(k) : undefined;
/* words for every flag the Journal shows (chain endings have their own, in IC.CHAINS[..].ends) */
IC.FLAG_WORDS = {
  fired: () => 'You fired first: the spy jet disguised as an airliner was shot down.',
  spared: () => 'You let the spy jet go home without a shot.',
  cheapGuns: () => 'You bought anti-aircraft guns for the airports.',
  transparency: () => 'You named the neighbour publicly after the collision.',
  quiet: () => 'After the collision you said only that an investigation was under way.',
  airports5: () => 'You built five airports.',
  minister: v => v === 'finch' ? 'Halloran fell, and Aurel Finch became Minister of Transport.' : ''
};
/* what the story learns from play, not cards */
function measure(S) {
  const st = S.story;
  const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts && i.parts.some(p => p.kind === 'runway' && p.built));
  if (aps.length >= 5 && !st.flags.has('airports5')) IC.flag(S, 'airports5');
  if (st.fired && !st.flags.has('fired')) IC.flag(S, 'fired');
  if (st.dilemmaDone && !st.fired && !st.flags.has('spared')) IC.flag(S, 'spared');
  for (const k of ['cheapGuns', 'transparency', 'quiet']) if (st.doc[k] && !st.flags.has(k)) IC.flag(S, k);
}

/* ---------- the neighbour ---------- */
IC.FOES = {
  dorn: { name: 'Marshal Dorn', title: 'the Marshal', how: 'took power in a coup three years ago and keeps the officers loyal with promises', wants: 'a victory to show the army', road: 'incident' },
  varenne: { name: 'President Ilka Varenne', title: 'the President', how: 'won the last election by a few thousand votes and faces another', wants: 'an enemy on the evening news', road: 'election' },
  council: { name: 'the Revolutionary Council', title: 'the Council', how: 'shares power uneasily between hard-liners and moderates', wants: 'whatever the stronger faction wants that month', road: 'base' }
};
IC.GRIEVANCES = {
  corridor: { name: 'the corridor', words: (S) => `Their airline must cross ${S.world.names.H} to reach the world, and pays us for every flight.`, cry: 'our sky is a toll road' },
  river: { name: 'the river', words: (S) => `The river rises on their side and runs through ours; in a dry year they say our towns drink their water.`, cry: 'they are stealing our water' },
  province: { name: 'the lost province', words: (S) => `They still print maps with our border region inside their own frontier.`, cry: 'the north was always ours' }
};
IC.foeOf = S => IC.FOES[S.story.foe] || IC.FOES.dorn;

/* ---------- start ---------- */
IC.chainsInit = function (S) {
  const st = S.story;
  st.flags = new Map(); st.flagT = new Map();
  IC.castInit(S);
  // the neighbour, from the seed: never shown as a menu, only through the story
  const R = IC.makeRng((S.seed >>> 0) ^ 0x51a7e);
  const foes = Object.keys(IC.FOES), gr = Object.keys(IC.GRIEVANCES);
  st.foe = foes[Math.floor(R() * foes.length)];
  st.grievance = gr[Math.floor(R() * gr.length)];
  st.heat = 0;   // how hot the grievance runs, from what we did (it picks the road with the flags)
  // which chains this Career meets: the core four always, and four of the other six by the seed
  const core = Object.keys(IC.CHAINS).filter(k => IC.CHAINS[k].core), rest = Object.keys(IC.CHAINS).filter(k => !IC.CHAINS[k].core);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  st.chains = {};
  for (const k of core.concat(rest.slice(0, IC.CHAIN_POOL))) st.chains[k] = { step: IC.CHAINS[k].first, at: null, seen: [], end: null };
  st.chainNext = 0;
  st.road = null;
};
IC.CHAIN_POOL = 4;
/* play seconds between chain cards, and the least game time between two (a chain never crowds the deck) */
IC.CHAIN_PACE = { first: 300, gap: [360, 600], gameMin: 6 * 3600 };

/* ---------- running the chains ---------- */
const inPeace = S => S.story.act <= 3;
IC.chainsTick = function (S, dt) {
  const st = S.story; if (!st || !st.chains || S.mode !== 'story') return;
  st.chT2 = (st.chT2 || 0) - dt; if (st.chT2 > 0) return;
  st.chT2 = 30;
  measure(S);
  if (!st.chainNext) st.chainNext = (st.play || 0) + IC.CHAIN_PACE.first;
  if ((st.play || 0) < st.chainNext || st.events.length || S.time - (st.chainLast || -1e9) < IC.CHAIN_PACE.gameMin) return;
  // the step that has waited longest and is ready now
  let best = null;
  for (const k in st.chains) {
    const c = st.chains[k], C = IC.CHAINS[k]; if (c.end || !c.step) continue;
    const step = C.steps[c.step]; if (!step) continue;
    if (step.act && (st.act < step.act[0] || st.act > step.act[1])) continue;
    if (c.at != null && S.time < c.at) continue;
    if (step.when && !step.when(S, c)) continue;
    const since = c.seen.length ? c.seen[c.seen.length - 1].t : st.actT;
    if (!best || since < best.since) best = { k, c, step, since };
  }
  if (!best) return;
  st.chainNext = st.play + U.rand(IC.CHAIN_PACE.gap[0], IC.CHAIN_PACE.gap[1]);
  st.chainLast = S.time;
  if (st.deck) st.deck.next = Math.max(st.deck.next || 0, st.play + 120);
  if (best.step.say) { best.step.say(S, best.c); chainGo(S, best.k, best.step.next || null, best.step.gapMo, best.step.end); return; }
  IC.storyEvent(S, `ch_${best.k}_${best.c.step}`);
};
/* move a chain on: its next step (after at least mo months), or its end */
function chainGo(S, k, next, mo, end) {
  const c = S.story.chains[k]; if (!c) return;
  if (end) { c.end = end; c.step = null; IC.flag(S, k, end); IC.emit(S, 'chainEnd', { k, end }); return; }
  c.step = next || null;
  c.at = next ? S.time + MO(S, mo == null ? 3 : mo) : null;
  if (!next) c.end = c.end || 'done';
}
IC.chainGo = chainGo;
/* make each chain step's card an event card by name (story.js event()), so a saved card gets its choices back */
function register(k) {
  const C = IC.CHAINS[k];
  for (const sid in C.steps) {
    const step = C.steps[sid]; if (step.say) continue;
    EV[`ch_${k}_${sid}`] = S => {
      const c = S.story.chains[k], e = step.card(S, c);
      e.cast = e.cast || C.who; e.chain = k; e.step = sid;
      e.who = e.who || IC.ADVISORS[IC.castWho(S, e.cast)].name;
      e.opts = e.opts.map(o => Object.assign({}, o, {
        tip: [o.tip, trustLine(S, o.trust)].filter(Boolean).join(' '),
        fx: () => {
          c.seen.push({ step: sid, t: S.time, choice: o.t, title: e.title });
          for (const p in o.trust || {}) IC.castTrust(S, p, o.trust[p], e.title);
          if (o.heat) S.story.heat += o.heat;
          if (o.fx) o.fx(S, c);
          if (o.set) for (const f in o.set) IC.flag(S, f, o.set[f]);
          chainGo(S, k, o.next, o.mo, o.end);
        }
      }));
      return e;
    };
  }
}

/* ---------- helpers for the cards ---------- */
function money(S, v) { if (v > 0) { S.budget += v; IC.econBook(S, 'events', v); } else if (v < 0) IC.pay(S, 'events', -v); }
const conf = (S, v) => { S.story.standing = U.clamp(S.story.standing + v, 5, 100); };
const morale = (c, v) => { if (c) c.morale = U.clamp(c.morale + v, 0, 100); };
const raise = (S, v) => IC.storyRaise && IC.storyRaise(S, v);
const flagAl = S => S.av.airlines.find(a => a.kind === 'flag' && !a.gone);
const capAp = S => S.story.cap ? S.byId[S.story.cap] : null;
const capName = S => { const a = capAp(S); return a ? short(a.name) : IC.cap(S).name; };
const N = S => S.world.names;
/* the town nearest the hostile border (Tessel's town), fixed once chosen */
function borderTown(S) {
  const st = S.story;
  if (!st.btown || !S.byId[st.btown]) {
    const c = IC.cities(S).filter(x => !x.capital && x.owner === 'us' && x.id !== st.city2).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
    st.btown = c ? c.id : null;
  }
  return st.btown ? S.byId[st.btown] : null;
}
IC.storyBorderTown = borderTown;
/* is there an airport of ours with a runway within d units of a place */
const airportNear = (S, p, d) => S.infra.some(i => i.kind === 'airport' && i.owner === 'us' && i.parts && i.parts.some(x => x.kind === 'runway' && x.built) && U.dist(i, p) < d);
/* Halloran's home region: a mid-sized town that is neither the capital, the second city nor the border town */
function homeTown(S) {
  const st = S.story;
  if (!st.htown || !S.byId[st.htown]) {
    const c = IC.cities(S).filter(x => !x.capital && x.owner === 'us' && x.id !== st.city2 && x.id !== st.btown).sort((a, b) => a.pop - b.pop)[Math.floor(IC.cities(S).length / 3)] || IC.cities(S).find(x => !x.capital);
    st.htown = c ? c.id : null;
  }
  return st.htown ? S.byId[st.htown] : null;
}
const months = (S, k) => { const c = S.story.chains[k]; return c && c.seen.length ? (S.time - c.seen[c.seen.length - 1].t) / MO(S, 1) : 0; };

/* ---------- the chains ----------
   Each: { name, who (cast key), core (always in the pool), first, steps: { id: { act: [from, to], when(S, c),
   card(S, c) → { title, text, letter?, opts: [{ t, tip, risk, trust: { key: dv }, heat, set, fx(S, c), next, mo, end }] }
   } or { say(S, c), next, gapMo, end } }, ends: { id: { did(S), came(S) } } }. The first option of every card is the
   careful one: an unanswered card takes it after three hours. */
IC.CHAINS = {
  /* 1. the flag carrier: protection, then the bail-out, and in the war its aircraft fly the evacuation or have left */
  flag: { name: 'The flag carrier', who: 'FLAG', core: true, first: 'ask',
    steps: {
      ask: { act: [1, 1], when: S => S.story.ch >= 1 && !!flagAl(S) && S.av.airlines.length >= 2,
        card: S => ({ title: 'Protect the flag carrier?', text: `${N(S).H} Airways flies the country's name on its tail and loses money on half its routes. Foreign and low-cost airlines are coming to ${capName(S)} with lower fares. "Give us three years," Ruth Amberly says. "Longer contracts at list charges, and fewer slots for the newcomers. Then we can stand on our own."`,
          opts: [
            { t: 'Let them compete', tip: 'Offers keep coming at their usual pace. The flag carrier’s satisfaction −8.', risk: 'Amberly may look for a foreign partner.', trust: { FLAG: -8 }, set: { flagCo: 'open' }, fx: S => IC.storyAirSat(S, flagAl(S), -8), next: 'fuel', mo: 8 },
            { t: 'Protect it for three years', tip: 'Its satisfaction +12. Offers from other airlines come 15% slower until Act II.', risk: 'A carrier that is protected stops competing, and comes back asking for more.', trust: { FLAG: 12, MIN: 3 }, set: { flagCo: 'protect' }, fx: S => IC.storyAirSat(S, flagAl(S), 12), next: 'fuel', mo: 8 }
          ] }) },
      fuel: { act: [1, 3], when: S => !!flagAl(S),
        card: S => { const prot = IC.flagOf(S, 'flagCo') === 'protect';
          return { title: 'The flag carrier is in trouble', text: `Fuel has doubled in a year. ${N(S).H} Airways cannot pay the leases on its aircraft by the winter. ${prot ? '"You kept the wolves away," Amberly writes, "and we are grateful. Now we need the Treasury."' : '"You let them undercut us," Amberly writes. "I warned you."'} She asks for ₭400M. A foreign airline has offered to buy half of it.`,
            opts: [
              { t: 'Let the foreign airline buy in', tip: 'No money from us. The flag carrier’s satisfaction +10: it is solvent and better run.', risk: 'A foreign owner moves its aircraft abroad if war comes.', trust: { FLAG: -4, FIN: 4 }, end: 'partner', fx: S => IC.storyAirSat(S, flagAl(S), 10) },
              { t: 'Pay ₭400M and take a stake', tip: '₭400M now. The flag carrier becomes the state’s.', risk: 'Every loss it makes from now on is yours.', trust: { FLAG: 15, FIN: -10 }, end: 'state', fx: S => money(S, -400) },
              { t: 'Refuse both', tip: 'No money. The flag carrier’s satisfaction −25; it cuts routes.', risk: 'It may fold, and the routes go to whoever will fly them.', trust: { FLAG: -20 }, end: 'bust', fx: S => IC.storyAirSat(S, flagAl(S), -25) }
            ] }; } },
    },
    ends: {
      partner: { did: S => `You let a foreign airline buy half of ${N(S).H} Airways.`, came: S => S.story.act >= 4 ? 'When the war came its new owners moved the aircraft abroad, out of reach of the missiles and of us.' : 'It is solvent, better run, and no longer only ours.' },
      state: { did: S => `You paid ₭400M and made ${N(S).H} Airways the state’s.`, came: S => S.story.act >= 4 ? 'When the war came its aircraft flew the evacuation from the north and carried the government’s people and parts.' : 'It flies the flag, and its losses are the Treasury’s.' },
      bust: { did: S => `You refused ${N(S).H} Airways both the money and the buyer.`, came: S => 'It cut its routes to the bone, and others took them.' }
    } },

  /* 2. the corridor: Lenz's shared airway, his night cargo, and his fate */
  corridor: { name: 'The corridor', who: 'LENZ', core: true, first: 'airway',
    steps: {
      airway: { act: [1, 1], when: S => S.story.ch >= 2,
        card: S => ({ title: 'A letter from across the border', letter: true, text: `"Director, we have not met, but we have the same job on two sides of one sky. ${IC.GRIEVANCES.corridor.words(S)} I propose a shared airway: entry points on the border that both our controllers know, and a charge for our airline's overflights that it can live with. Half your list would do it. Our people would remember who opened the door. Kasimir Lenz, Director of Civil Aviation, ${S.world.full.A}."`,
          opts: [
            { t: 'Full charges, but the shared airway', tip: 'The airway and its entry points; their airline pays what everyone pays.', risk: 'Lenz will say at home that we treat them like strangers.', trust: { LENZ: -6, FIN: 4 }, heat: 1, set: { lenzRate: 'full' }, next: 'night', mo: 10 },
            { t: 'Half charges for their airline', tip: 'About ₭10M a month less from overflights while the peace lasts.', risk: 'If relations sour, we will have paid for nothing.', trust: { LENZ: 15, FIN: -6 }, heat: -2, set: { lenzRate: 'half' }, next: 'night', mo: 10 }
          ] }) },
      night: { act: [2, 3], when: S => S.story.surveyTold,
        card: S => ({ title: 'Lenz writes again', letter: true, text: `"I have read about the drones over your border. Believe me when I say they are not my people's doing: our army flies what it likes and tells nobody, least of all me. Please do not close the corridor to our night cargo flights. Medicines go on them, and spare parts for hospitals. If you close it, the men who fly those drones will have won an argument at home. K. L."`,
          opts: [
            { t: 'Show the letter to the Prime Minister', tip: 'The cabinet knows what you know. Prime Minister +6.', risk: 'Lenz wrote to you, not to our cabinet. If it leaks, it costs him.', trust: { PM: 6, LENZ: -4 }, next: 'fate', mo: 14 },
            { t: 'Keep the night corridor open', tip: 'Tension −5. Lenz trusts you.', risk: 'If he is wrong, their drones keep learning our airways in the dark.', trust: { LENZ: 12, CDS: -6 }, heat: -2, fx: S => raise(S, -5), set: { night: 'open' }, next: 'fate', mo: 14 },
            { t: 'Close it to their night flights', tip: 'Tension +5. Overflight income falls a little.', risk: 'Their hard-liners will call it a blockade.', trust: { LENZ: -15, CDS: 8 }, heat: 3, fx: S => raise(S, 5), set: { night: 'closed' }, next: 'fate', mo: 14 }
          ] }) },
      fate: { act: [3, 3], say: (S, c) => {
        const t = IC.trustOf(S, 'LENZ'), F = IC.foeOf(S);
        if (t >= 60) { IC.say(S, 'LENZ', `A note by hand, through a friend. "${F.title[0].toUpperCase() + F.title.slice(1)} has stopped listening to people like me. If it comes, it will come for what keeps your aircraft in the air. Be ready. Burn this." He means it as a warning, and it is one.`); c.end = 'friend'; IC.flag(S, 'corridor', 'friend'); }
        else if (t < 35) { IC.news(S, `${N(S).A}'s Director of Civil Aviation, Kasimir Lenz, has been arrested and accused of "contacts with a hostile state".`); IC.say(S, 'INT', `Lenz has been arrested. Whatever he was to us, there is nobody left over there who will pick up the phone.`); c.end = 'arrested'; IC.flag(S, 'corridor', 'arrested'); raise(S, 4); }
        else { IC.say(S, 'INT', `Lenz has not been seen at his ministry for a month. His letters have stopped.`); c.end = 'silent'; IC.flag(S, 'corridor', 'silent'); }
      }, end: null }
    },
    ends: {
      friend: { did: S => 'You kept faith with Kasimir Lenz across the border.', came: S => S.story.act >= 4 ? (S.won ? 'When the guns fell silent it was Lenz who carried the first message between the two governments.' : 'Through the war a line stayed open to him, the one thread between the two sides that never broke.') : 'He warned you of what was coming.' },
      arrested: { did: S => 'Kasimir Lenz lost his faith in you, and then his post.', came: S => 'He was arrested for contacts with a hostile state. Nobody across the border picked up the phone again.' },
      silent: { did: S => 'You and Kasimir Lenz were never quite friends.', came: S => 'His letters stopped a year before the war. Nobody knows where he went.' }
    } },

  /* 3. home soil: Halloran's region first, the right city first, or the press */
  homesoil: { name: 'Home soil', who: 'MIN', core: true, first: 'ask',
    steps: {
      ask: { act: [1, 1], when: S => S.story.ch >= 4 && !!homeTown(S),
        card: S => { const h = homeTown(S);
          return { title: 'A favour', text: `A quiet word after cabinet. "Director, I grew up in ${h.name}. The people there have voted for me for twenty years and they have never had an airport. I am not asking you to build it tomorrow. I am asking you to put it on the list before the others, and to say so. You know I would not ask if it did not matter to me."`,
            opts: [
              { t: 'Promise nothing, politely', tip: 'Halloran is cool for a while.', risk: 'None, except her patience.', trust: { MIN: -6 }, end: 'polite' },
              { t: `Promise ${h.name} an airport`, tip: `Halloran +15 now. An airport within 120 km of ${h.name} before Act II is due.`, risk: 'A promise to a minister is remembered. Broken, it costs more than refusing.', trust: { MIN: 15 }, fx: S => { conf(S, 4); S.story.homeDue = true; }, next: 'due', mo: 0 },
              { t: 'Tell the Courier what she asked', tip: 'Sol Varga prints it. Halloran falls; the Treasury’s Aurel Finch replaces her. Confidence −8.', risk: 'Finch judges only by the books, and nobody in cabinet owes you anything.', trust: { PRESS: 15, MIN: -40 }, fx: S => { IC.flag(S, 'minister', 'finch'); conf(S, -8); IC.news(S, `MINISTER ASKED FOR AIRPORT IN HER HOME TOWN, SAYS AVIATION CHIEF. Halloran resigns.`); }, end: 'press' }
            ] }; } },
      due: { act: [1, 2], when: S => S.story.act >= 2 || airportNear(S, homeTown(S), 1200), say: (S, c) => {
        const h = homeTown(S), kept = airportNear(S, h, 1200);
        if (kept) { IC.say(S, 'MIN', `I flew into ${h.name} yesterday, on a scheduled flight, and my mother was at the fence. Thank you, Director. I do not forget.`); IC.castTrust(S, 'MIN', 12, 'the promise kept'); c.end = 'kept'; IC.flag(S, 'homesoil', 'kept'); }
        else { IC.say(S, 'MIN', `You promised me ${h.name}. I told them. I will not make that mistake twice.`); IC.castTrust(S, 'MIN', -25, 'the promise broken'); conf(S, -6); c.end = 'broken'; IC.flag(S, 'homesoil', 'broken'); }
      } }
    },
    ends: {
      polite: { did: S => 'You turned down the Minister’s favour, politely.', came: S => 'She never asked again.' },
      kept: { did: S => `You promised the Minister an airport in her home town of ${homeTown(S).name}, and built it.`, came: S => IC.trustOf(S, 'MIN') >= 60 ? 'She never forgot it, and argued your case in cabinet when it mattered.' : 'She was grateful, for a while.' },
      broken: { did: S => `You promised the Minister an airport in ${homeTown(S).name} and did not build it.`, came: S => 'She did not forgive it.' },
      press: { did: S => 'You told the Courier what the Minister had asked of you.', came: S => 'Halloran resigned. Aurel Finch, who reads only the figures, took her place.' }
    } },

  /* 4. the tower: the controllers' pay claim, and how they work in the war */
  tower: { name: 'The tower', who: 'ATC', core: true, first: 'claim',
    steps: {
      claim: { act: [1, 2], when: S => S.story.act >= 2 || S.story.ch >= 5,
        card: S => ({ title: 'The controllers’ claim', text: `"My people work nights, weekends and Christmas," Ivo Marsh says, "and an airline pilot earns three times what they do. They want 20% over two years, or they work to rule from the first of next month. I will not stop them, and I would not if I could."`,
          opts: [
            { t: 'Settle at 10% over two years', tip: '₭40M. The controllers accept, without joy.', risk: 'Little.', trust: { ATC: 2 }, fx: S => money(S, -40), end: 'fair' },
            { t: 'Give them the 20%', tip: '₭90M. Each controller handles 5% more flights: people who feel valued work harder.', risk: 'Other unions will read about it.', trust: { ATC: 18, FIN: -8 }, fx: S => money(S, -90), end: 'loyal' },
            { t: 'Refuse, and automate what we can', tip: '₭150M for new systems. Each controller handles 10% more flights; Marsh never forgives it.', risk: 'Systems fail when they are jammed. In a war, people adapt and systems do not.', trust: { ATC: -25, FIN: 6 }, fx: S => money(S, -150), end: 'auto' }
          ] }) }
    },
    ends: {
      fair: { did: S => 'You settled the controllers’ claim halfway.', came: S => 'They worked, as they always had.' },
      loyal: { did: S => 'You gave the controllers everything they asked for.', came: S => S.story.act >= 4 ? 'In the war they stayed at their scopes through the raids, in towers with no glass left in the windows.' : 'Ivo Marsh says his people would follow you anywhere.' },
      auto: { did: S => 'You refused the controllers and automated their work.', came: S => S.story.act >= 4 ? 'When the jamming came, the new systems lost their picture and the people who might have worked around it had gone.' : 'The sectors run on fewer people, and Ivo Marsh retired early.' }
    } },

  /* 5. the inquiry into the collision */
  inquiry: { name: 'The inquiry', who: 'LISE', first: 'hear',
    steps: {
      hear: { act: [2, 2], when: S => S.time - S.story.actT > MO(S, 2),
        card: S => ({ title: 'The inquiry', text: `Lise Marsh was the first officer who landed the airliner after the drone hit it. Before the inquiry she asks to see you. "Our radars could not see it. Your people knew they could not see anything without a transponder, and nobody told the crews. I will say so under oath. What will you say?"`,
          opts: [
            { t: 'Publish the radar gaps', tip: 'Confidence −5 now. The public backs military radar: the grant is 10% larger for the rest of Act II.', risk: 'The neighbour learns exactly where we are blind.', trust: { LISE: 15, ATC: 10, PRESS: 8 }, fx: S => conf(S, -5), end: 'open' },
            { t: 'Ask the inquiry to sit in private', tip: 'Confidence +3. The Minister is relieved.', risk: 'Sol Varga is already asking questions. Secrets in this country last about a year.', trust: { LISE: -20, ATC: -12, MIN: 8 }, fx: S => conf(S, 3), next: 'leak', mo: 12 },
            { t: 'Blame the airline’s lookout', tip: 'Confidence +4. The regional airline’s satisfaction −20.', risk: 'Airlines talk to each other.', trust: { LISE: -30, ATC: -20, FLAG: -10 }, fx: S => { conf(S, 4); for (const a of S.av.airlines) if (a.kind === 'regional') IC.storyAirSat(S, a, -20); }, end: 'blame' }
          ] }) },
      leak: { act: [2, 3], say: (S, c) => {
        IC.news(S, `THE DRONES THEY KNEW ABOUT: radar gaps were known a year before the collision, papers show. — Sol Varga, the Courier`);
        IC.say(S, 'MIN', `Varga has the inquiry's papers. All of them. I hope it was worth it.`);
        conf(S, -12); IC.castTrust(S, 'PRESS', -5, 'the leak'); c.end = 'leaked'; IC.flag(S, 'inquiry', 'leaked');
      } }
    },
    ends: {
      open: { did: S => 'You published the radar gaps the collision exposed.', came: S => 'The country paid for the military radars that saw the drones coming in the war.' },
      leaked: { did: S => 'You kept the inquiry private.', came: S => 'A year later Sol Varga printed every page of it.' },
      blame: { did: S => 'You blamed the airline crew for the collision.', came: S => 'Lise Marsh left aviation. Her uncle never spoke to you again.' }
    } },

  /* 6. the border town: an airport, a refusal, or a civil field only */
  border: { name: 'The border town', who: 'GOV', first: 'ask',
    steps: {
      ask: { act: [1, 2], when: S => (S.story.act >= 2 || S.story.ch >= 4) && !!borderTown(S),
        card: S => { const b = borderTown(S), km = Math.round(IC.hostileBorderDist(b.x, b.y) / 10);
          return { title: `${b.name} asks to be remembered`, text: `${b.name} is ${km} km from the ${N(S).A} border. Its young people leave for the capital and do not come back. "An airport would keep them," Governor Tessel says. "Jobs, visitors, a reason to stay. We are your country too, Director, even this far north."`,
            opts: [
              { t: 'A small civil field, nothing more', tip: `Tessel +6. A field within 100 km of ${b.name} is due within two years.`, risk: 'Small and civil is also small and easy to forget.', trust: { GOV: 6 }, fx: S => { S.story.borderDue = S.time + MO(S, 24); }, set: { btown: 'civil' }, next: 'due', mo: 0 },
              { t: 'Promise them a proper airport', tip: `Tessel +15 and ${b.name}’s morale +10. An airport within 100 km is due within two years.`, risk: `An airport ${km} km from the border is the first thing they can reach.`, trust: { GOV: 15 }, fx: S => { morale(b, 10); S.story.borderDue = S.time + MO(S, 24); }, set: { btown: 'airport' }, next: 'due', mo: 0 },
              { t: 'Not this close to the border', tip: `Tessel −15. ${b.name}’s morale −10.`, risk: 'A town that empties is a story their broadcasts will tell.', trust: { GOV: -15 }, fx: S => morale(b, -10), heat: 1, end: 'refused' }
            ] }; } },
      due: { act: [1, 3], when: S => S.time >= (S.story.borderDue || 0) || airportNear(S, borderTown(S), 1000), say: (S, c) => {
        const b = borderTown(S), ok = airportNear(S, b, 1000);
        if (ok) { IC.say(S, 'GOV', `The first scheduled flight landed at ${b.name} this morning. Half the town was at the fence. Thank you.`); IC.castTrust(S, 'GOV', 10, 'the airport'); morale(b, 8); c.end = IC.flagOf(S, 'btown') === 'civil' ? 'field' : 'built'; }
        else { IC.say(S, 'GOV', `Two years, Director. ${b.name} is still waiting.`); IC.castTrust(S, 'GOV', -20, 'the broken promise'); morale(b, -10); c.end = 'waited'; S.story.heat += 1; }
        IC.flag(S, 'border', c.end);
      } }
    },
    ends: {
      built: { did: S => `You gave ${borderTown(S).name}, near the border, an airport.`, came: S => S.story.act >= 3 ? 'It grew, and became the first thing the enemy could reach.' : 'It grew.' },
      field: { did: S => `You gave ${borderTown(S).name} a small civil field.`, came: S => 'It stayed small, and stayed out of the headlines.' },
      waited: { did: S => `You promised ${borderTown(S).name} an airport and never built it.`, came: S => 'Its people left for the south, and the broadcasts across the border showed its empty streets.' },
      refused: { did: S => `You refused ${borderTown(S).name} an airport so close to the border.`, came: S => 'Its people left for the south, and the broadcasts across the border showed its empty streets.' }
    } },

  /* 7. across the wire: the defector */
  defector: { name: 'Across the wire', who: 'CDS', first: 'call',
    steps: {
      call: { act: [2, 2], when: S => S.time - S.story.actT > MO(S, 12),
        card: S => { const fb = S.byId.ab_fwd;
          return { title: 'Across the wire', text: `A ${N(S).A} military transport is on the emergency frequency, low over the border, asking to land at ${short(fb.name)}. The pilot says he has his wife and children aboard, a man who says he is Kasimir Lenz's cousin, and maps of their missile sites. General Voss wants it down and the maps in her hands. The Foreign Office says taking a military aircraft is an act they cannot ignore.`,
            opts: [
              { t: 'Turn it back over the border', tip: 'Tension −5. The peace lasts longer.', risk: 'Voss will go over your head. Lenz will hear what you did to his cousin.', trust: { CDS: -15, LENZ: -10, PM: 4 }, fx: S => raise(S, -5), heat: -1, end: 'back' },
              { t: 'Let it land, and keep them all', tip: 'Tension +12. Intelligence on their missile sites in Act III.', risk: 'They will call it theft of a military aircraft, and the war comes sooner.', trust: { CDS: 15, LENZ: 6 }, fx: S => raise(S, 12), heat: 2, end: 'took' },
              { t: 'Land it quietly, return the aircraft, keep the family', tip: 'Tension +4. No maps: the pilot goes home with his aircraft.', risk: 'Half of each, and everyone knows it.', trust: { CDS: 4, LENZ: 10 }, fx: S => raise(S, 4), end: 'half' }
            ] }; } }
    },
    ends: {
      back: { did: S => 'You turned the defectors back over the border.', came: S => 'Nobody across the border heard of them again.' },
      took: { did: S => 'You took in the defectors, their aircraft and their maps.', came: S => 'Their maps found the missile sites. Across the border they called it theft, and the war came sooner.' },
      half: { did: S => 'You kept the defector’s family and sent the aircraft home.', came: S => 'Lenz’s cousin lives in the capital still.' }
    } },

  /* 8. the alliance: radars and missiles for a base */
  alliance: { name: 'The alliance', who: 'ENVOY', core: true, first: 'offer',
    steps: {
      offer: { act: [3, 3], when: S => S.time - S.story.actT > MO(S, 3),
        card: S => { const ap = capAp(S);
          return { title: 'An offer from our allies', text: `Ambassador Whitlow comes with a map. "We will send radars and long-range missiles, and our aircraft will fly from your territory if the worst happens. In return we would want a base: a corner of ${ap ? short(ap.name) : 'your main airport'}, our own fence, our own people." General Voss wants it. The Prime Minister wants to know what the neighbour will say.`,
            opts: [
              { t: 'Ask for aid without a base', tip: 'Less aid, later: allied support +10.', risk: 'They will give what they can spare, when they can spare it.', trust: { ENVOY: -4, PM: 4 }, fx: S => { S.support = Math.min(100, S.support + 10); }, end: 'aid' },
              { t: 'Accept the base', tip: 'Allied support +25 and aid in the war. Tension +10.', risk: 'The neighbour will name the base as its reason.', trust: { ENVOY: 15, CDS: 10, PM: -4 }, heat: 2, fx: S => { S.support = Math.min(100, S.support + 25); raise(S, 10); }, end: 'base' },
              { t: 'Refuse: we stand alone', tip: 'Tension −5. No aid.', risk: 'When the war comes, nobody is obliged to help.', trust: { ENVOY: -15, CDS: -10, LENZ: 4 }, heat: -2, fx: S => { S.support = Math.max(0, S.support - 10); raise(S, -5); }, end: 'alone' }
            ] }; } }
    },
    ends: {
      aid: { did: S => 'You asked our allies for aid without a base.', came: S => 'It came, late and in pieces, but it came.' },
      base: { did: S => 'You gave our allies a base at the national airport.', came: S => 'Their missiles stood beside ours, and the neighbour named the base as its reason for the war.' },
      alone: { did: S => 'You refused our allies’ base and their conditions.', came: S => 'The country fought alone.' }
    } },

  /* 9. the press: Sol Varga */
  press: { name: 'The press', who: 'PRESS', first: 'interview',
    steps: {
      interview: { act: [1, 1], when: S => S.story.opened,
        card: S => ({ title: 'An interview', text: `Sol Varga of the Courier has written about ${capName(S)} since it was a field of survey pegs. He called it "Halloran's Folly" then. He asks for an hour with you and a walk round the apron. "I want to see whether it works, not hear that it does."`,
          opts: [
            { t: 'An hour, on the record', tip: 'Confidence +2.', risk: 'He will print what he sees, including what is wrong.', trust: { PRESS: 12, MIN: 2 }, fx: S => conf(S, 2), next: 'drones', mo: 12 },
            { t: 'Send him the press office’s figures', tip: 'Nothing changes.', risk: 'A journalist kept out keeps digging.', trust: { PRESS: -10 }, next: 'drones', mo: 12 }
          ] }) },
      drones: { act: [2, 3], when: S => S.story.surveyTold,
        card: S => ({ title: 'Varga asks about the drones', text: `"Readers in the north say they hear engines at night and see nothing on the flight trackers. Is the ${N(S).A} flying drones over our country, Director? Yes or no." He has photographs of something grey and slow.`,
          opts: [
            { t: '"We are looking into reports"', tip: 'Nothing changes now.', risk: 'If he proves it, he proves we hid it.', trust: { PRESS: -8 }, end: 'stone' },
            { t: 'Tell him the truth', tip: 'Confidence −3. Tension +4. The country knows.', risk: 'The Prime Minister wanted to say it himself.', trust: { PRESS: 15, PM: -6 }, fx: S => { conf(S, -3); raise(S, 4); IC.news(S, `YES, THEY ARE THEIR DRONES: aviation chief confirms flights over the north. — Sol Varga`); }, end: 'honest' }
          ] }) }
    },
    ends: {
      stone: { did: S => 'You kept Sol Varga at arm’s length.', came: S => 'His book about the war is fair to you, and cold.' },
      honest: { did: S => 'You told Sol Varga the truth about the drones before anyone else would.', came: S => 'His dispatches from the war were the ones the country believed.' }
    } },

  /* 10. winter fuel: ration, pay, or the neighbour's fuel */
  fuel: { name: 'Winter fuel', who: 'FIN', first: 'crisis',
    steps: {
      crisis: { act: [2, 2], when: S => S.time - S.story.actT > MO(S, 8),
        card: S => ({ title: 'A winter without fuel', text: `A refinery fire abroad has halved the jet fuel coming into ${N(S).H} this winter. The Treasury can buy cargoes on the open market at twice the price, or the airlines can fly less. And the ${N(S).A} has offered fuel by pipeline at last year's price, through the corridor.`,
            opts: [
              { t: 'Ration it: the airlines fly less', tip: 'Every airline’s satisfaction −10.', risk: 'Little, but the airlines will remember the winter.', trust: { FLAG: -6 }, fx: S => { for (const a of S.av.airlines) IC.storyAirSat(S, a, -10); }, end: 'ration' },
              { t: 'Buy at any price: ₭250M', tip: '₭250M. Nobody notices.', risk: 'None, but the money.', trust: { FIN: -8, FLAG: 6 }, fx: S => money(S, -250), end: 'paid' },
              { t: 'Take the neighbour’s fuel', tip: 'No cost. Tension −4. Lenz approves.', risk: 'What comes through a pipeline can be turned off.', trust: { LENZ: 10, CDS: -8 }, heat: -1, fx: S => raise(S, -4), next: 'cut', mo: 10 }
            ] }) },
      cut: { act: [3, 3], say: (S, c) => {
        IC.say(S, 'FIN', `The ${N(S).A} has closed the fuel pipeline "for maintenance". The airlines have three weeks of stock. You were warned.`);
        for (const a of S.av.airlines) IC.storyAirSat(S, a, -15);
        conf(S, -5); c.end = 'cut'; IC.flag(S, 'fuel', 'cut');
      } }
    },
    ends: {
      ration: { did: S => 'In the fuel crisis you made the airlines fly less.', came: S => 'It was a hard winter, and a short one.' },
      paid: { did: S => 'In the fuel crisis you paid whatever the fuel cost.', came: S => 'Nobody noticed but the Treasury.' },
      cut: { did: S => 'In the fuel crisis you took the neighbour’s fuel.', came: S => 'On the eve of the war they turned it off.' }
    } }
};
for (const k in IC.CHAINS) register(k);

/* a share of an airline's satisfaction, kept in bounds */
IC.storyAirSat = (S, al, v) => { if (al) al.sat = U.clamp(al.sat + v, 0, 100); };

/* ---------- what the chains change, through the modifiers (research.js) ---------- */
if (IC.MOD_SRC) IC.MOD_SRC.push(S => {
  const st = S.story; if (!st || !st.flags) return [];
  const L = [], f = k => st.flags.get(k);
  if (f('flagCo') === 'protect' && st.act === 1) L.push({ fx: { offerRate: -0.15 }, why: 'Protecting the flag carrier', src: 'the story' });
  if (f('flagCo') === 'open' && st.act === 1) L.push({ fx: { offerRate: 0.05 }, why: 'Open competition', src: 'the story' });
  if (f('tower') === 'loyal') L.push({ fx: { ctlLoad: 0.05 }, why: 'The controllers’ settlement', src: 'the story' });
  if (f('tower') === 'auto') L.push({ fx: { ctlLoad: st.act >= 4 && S.jam ? -0.1 : 0.1 }, why: st.act >= 4 && S.jam ? 'Automated sectors under jamming' : 'Automated sectors', src: 'the story' });
  if (f('inquiry') === 'open' && st.act === 2) L.push({ fx: { grant: 0.1 }, why: 'The public backs military radar', src: 'the story' });
  return L;
});
/* half charges for their airline: what the corridor costs a month */
IC.onMonth(S => { const st = S.story; if (!st || !st.flags || st.act >= 4) return; if (st.flags.get('lenzRate') === 'half' && st.act >= 1) IC.pay(S, 'events', 10); if (st.flags.get('flag') === 'state' && st.act < 4) IC.pay(S, 'events', 8); });
IC.on((S, type) => { if ((type === 'flag' || type === 'chainEnd') && IC.modDirty) IC.modDirty(S); });

/* ---------- the Courier's front pages ----------
   At the turns of the story, a front page that says what the player did, in Sol Varga's paper. */
function paper(S, head, deck, text, more) {
  IC.card(S, head, U.date(S.time), text, 'paper', { paper: { deck, more, by: Math.random() < 0.6 ? 'Sol Varga, aviation correspondent' : 'Staff and agencies' } });
}
IC.storyPaper = paper;
IC.on((S, type, d) => {
  const st = S.story; if (!st || !st.flags || S.mode !== 'story') return;
  const W = S.world, cap = capAp(S);
  if (type === 'collision' && d) st.collPlace = d.place;
  if (type === 'goal' && d && d.id === 'first' && cap) {
    const mo = (S.time - 7 * 3600) / MO(S, 1), late = mo > 9;
    paper(S, late ? `${short(cap.name).toUpperCase()}: LATE, BUT IT FLIES` : `“HALLORAN’S FOLLY” OPENS`, late ? 'The airport the opposition loved to mock welcomes its first airliner' : 'The national airport the opposition called a folly takes its first airliner, on time',
      `The first airliner landed at ${short(cap.name)} this week to applause from the fence. Minister Petra Halloran, who staked her name on the airport, called it "the day ${W.names.H} joined the world".`,
      late ? 'Critics point out that it opened months after the date she gave Parliament, and over budget.' : 'Her critics were quiet for once. The question now is whether the airlines will stay.');
  }
  if (type === 'act' && d === 2) paper(S, 'DRONE HIT AIRLINER, INQUIRY TOLD', `“Nobody saw it coming,” say controllers`,
    `An unidentified drone struck a regional airliner ${st.collPlace || 'over the north'} last month. The crew, led by first officer Lise Marsh, landed safely with one engine.`,
    'The government has put civil and military air traffic under one director. Questions remain about who was flying the drone, and why our radars could not see it.');
  if (type === 'act' && d === 3) paper(S, st.fired ? 'WE FIRED FIRST' : 'THEY OPENED FIRE', st.fired ? `A ${W.names.A} spy jet disguised as an airliner was shot down; their missiles answered` : `Missiles and drones struck ${short((S.byId.ab_fwd || {}).name || 'our air base')} without warning`,
    `The cabinet has handed the country's air defences to the Director, with missiles, radars and depots. ${W.names.A} has not declared war.`,
    `"It does not need to," a senior officer told the Courier. Along the border, families are packing cars.`);
  if (type === 'act' && d === 4) paper(S, 'WAR', `${W.full.A} attacks. ${IC.ROADS_TO_WAR[st.road] ? IC.ROADS_TO_WAR[st.road].words(S) : ''}`,
    `Sirens sounded across the north at dawn as missiles struck. The government has made the Director Chief of the Air Force.`,
    `Everything built in the quiet years must now hold: the airports, the radars, the people who run them.`);
  if (type === 'chainEnd' && d && d.k === 'alliance' && d.end === 'base') paper(S, 'ALLIED BASE AT THE NATIONAL AIRPORT', 'Missiles and radars in exchange for a corner of the airfield',
    `Our allies will station radars, missiles and aircraft at ${cap ? short(cap.name) : 'the national airport'} under an agreement signed this week.`, `The ${W.full.A} called it "an act of aggression".`);
});

/* 69's problems tell the story how they ended */
IC.on((S, type, d) => { if (type === 'pressure' && S.story && S.story.flags && d && d.id) IC.flag(S, 'p:' + d.id, d.outcome); });

/* ---------- the road to the war ---------- */
IC.ROADS_TO_WAR = {
  election: { name: 'The election', aim: 'morale', words: S => `${IC.foeOf(S).name} needed an enemy to win an election, and chose us.` },
  incident: { name: 'The border incident', aim: 'air', words: S => 'An incident on the border was answered, and the answer was answered, until nobody could step back.' },
  base: { name: 'The base', aim: 'coerce', words: S => 'They said they were defending themselves against a foreign base on our soil.' }
};
IC.storyRoad = function (S) {
  const st = S.story, f = k => st.flags.get(k), sc = { election: 0, incident: 0, base: 0 };
  sc[IC.foeOf(S).road] += 1.5;
  if (st.grievance === 'corridor') sc.election += 1;
  if (f('lenzRate') === 'full') sc.election += 0.5;
  if (f('night') === 'closed') sc.election += 1.5;
  if (f('fuel') === 'cut') sc.election += 0.5;
  if (f('corridor') === 'arrested') sc.election += 1;
  if (st.fired) sc.incident += 3;
  if (f('defector') === 'took') sc.incident += 2;
  if (f('border') === 'built') sc.incident += 1;
  if (st.grievance === 'province') sc.incident += 1;
  if (f('alliance') === 'base') sc.base += 4;
  if (st.grievance === 'river') sc.base += 0.5;
  let best = 'election'; for (const k in sc) if (sc[k] > sc[best]) best = k;
  return best;
};
/* the act's beats on each road, months into Act III; story.js runs them through beatsFor */
IC.roadBeats = function (S) {
  const st = S.story, W = S.world, F = IC.foeOf(S), G = IC.GRIEVANCES[st.grievance];
  const town = borderTown(S) || IC.cap(S);
  if (st.road === 'election') return [
    { id: 'r1', mo: 4, run: () => { IC.say(S, 'INT', `${F.name} told a rally last night that "${G.cry}". Their news repeats it every hour. ${F.how[0].toUpperCase() + F.how.slice(1)}; an election is due in a year.`); raise(S, 5); } },
    { id: 'r2', mo: 11, run: () => { IC.say(S, 'INT', `The ${W.full.A} has banned our airlines from its airspace "until ${W.names.H} pays what it owes". Their own still fly over us.`); for (const a of S.av.airlines) if (!a.K || !a.K.foreign) IC.storyAirSat(S, a, -6); raise(S, 6); } },
    { id: 'r3', mo: 19, run: () => { IC.news(S, `${F.name} wins the ${W.names.A} election. "The time for talking is over."`); IC.say(S, 'PM', `They have their result. Director, I want the country ready by spring. Whatever you need, ask now.`); raise(S, 8); } }
  ];
  if (st.road === 'incident') return [
    { id: 'r1', mo: 3, run: () => { IC.enemyForceOp(S, 'rkt', { x: town.x, y: town.y, ref: town, name: town.name }); IC.say(S, 'GOV', `Shells on ${town.name}'s outskirts last night. Two farms burned. People are asking who will protect them.`); raise(S, 6); } },
    { id: 'r2', mo: 8, run: () => { IC.say(S, 'AIR', `One of our patrols was locked up by a ${W.names.A} battery and broke off. They say we crossed the line. We did not.`); IC.castTrust(S, 'CDS', -4, 'the patrol'); raise(S, 8); } },
    { id: 'r3', mo: 13, run: () => { IC.news(S, `Border crossing at ${town.name} closed after an exchange of fire. Both sides blame the other.`); IC.say(S, 'CDS', `It has a life of its own now. Every incident answers the last one. We have months, not years.`); raise(S, 10); } }
  ];
  return [
    { id: 'r1', mo: 4, run: () => { IC.say(S, 'INT', `The ${W.full.A} has given us a year to "remove foreign forces from ${W.names.H}". It is printed on the front of every paper over there.`); raise(S, 6); } },
    { id: 'r2', mo: 12, run: () => { IC.say(S, 'ATC', `They have closed the corridor. No ${W.names.A} airways to the east, no overflights of their territory. Airlines are routing round the long way.`); for (const a of S.av.airlines) IC.storyAirSat(S, a, -5); raise(S, 6); } },
    { id: 'r3', mo: 20, run: () => { IC.say(S, 'ENVOY', `My government has told theirs that an attack on the base is an attack on us. I wish I could tell you that will stop them.`); raise(S, 8); } }
  ];
};
/* when Act III's embassy beat comes on each road (months into the act): sooner on the incident, later on the base */
IC.roadEve = S => ({ election: 24, incident: 18, base: 27 })[S.story.road] || 24;
/* the war opens with the road's aim; the base road saves longer for a bigger shock */
IC.roadOpen = function (S, o) {
  const R = IC.ROADS_TO_WAR[S.story.road];
  if (R && IC.EAIMS[R.aim]) S.enemy.aim = R.aim;
  return o;
};
/* a friend across the border makes a ceasefire a little easier */
IC.ceaseAt = S => S.story && S.story.flags && S.story.flags.get('corridor') === 'friend' ? 25 : 20;

/* ---------- the reckoning ---------- */
IC.storyThreads = function (S) {
  const st = S.story, L = [];
  for (const k in st.chains || {}) {
    const c = st.chains[k], C = IC.CHAINS[k]; if (!c.seen.length && !c.end) continue;
    const E = c.end && C.ends[c.end];
    L.push({ k, name: C.name, who: C.who, seen: c.seen, end: c.end, did: E ? E.did(S) : '', came: E ? E.came(S) : '', open: !c.end || c.end === 'done' });
  }
  return L;
};
IC.epilogue = function (S) {
  const st = S.story, W = S.world, P = [];
  const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts && i.parts.some(p => p.kind === 'runway' && p.built));
  const pax = Math.round(S.av && S.av.yesterday ? S.av.yesterday.pax : 0);
  P.push({ head: 'The airports', text: `You came to a country with no airport worth the name. You left it ${aps.length} airport${aps.length === 1 ? '' : 's'}${pax ? ` and ${pax.toLocaleString('en-US')} passengers a day` : ''}.` });
  const T = IC.storyThreads(S).filter(t => t.did);
  for (const t of T) P.push({ head: t.name, text: `${t.did} ${t.came}` });
  if (st.road) P.push({ head: 'Why the war came', text: IC.ROADS_TO_WAR[st.road].words(S) });
  const ppl = Object.keys(st.cast || {}).filter(k => IC.CAST[k].bio && !IC.CAST[k].foe && k !== 'FINCH' || k === 'LENZ').map(k => ({ k, t: st.cast[k].trust })).sort((a, b) => b.t - a.t);
  if (ppl.length) {
    const best = ppl[0], worst = ppl[ppl.length - 1], nm = k => IC.ADVISORS[k].name;
    P.push({ head: 'The people', text: `${nm(best.k)} would have followed you anywhere. ${worst.t < 35 ? `${nm(worst.k)} never forgave you.` : 'Nobody you worked with left with a grudge.'}` });
  }
  const ends = S.won ? (st.flags.get('corridor') === 'friend' ? 'lenz' : open(S) ? 'open' : 'fortress') : S.over ? (/replaced/i.test(S.over) ? 'replaced' : 'lost') : 'peace';
  const E = IC.ENDINGS[ends];
  return { title: E.title, text: E.text(S), paras: P, by: `From "The Canopy", by Sol Varga` };
};
const open = S => { const f = k => S.story.flags.get(k); return f('flag') !== 'partner' && f('alliance') !== 'base' && f('corridor') !== 'arrested'; };
IC.ENDINGS = {
  lenz: { title: 'A ceasefire through Lenz', text: S => `The guns stopped sooner than anyone expected, because a man across the border still trusted you. Kasimir Lenz carried the first message between the two governments, and the reply.` },
  open: { title: 'The canopy held', text: S => `The ${S.world.full.A} asked for a ceasefire. The country you built stayed open: its airlines flew again within the month, to the same places as before.` },
  fortress: { title: 'The canopy held', text: S => `The ${S.world.full.A} asked for a ceasefire. The country you defended was not quite the one you had built: harder, more guarded, with foreign soldiers at its airports and fewer friends across the border.` },
  replaced: { title: 'Replaced', text: S => `The Prime Minister lost confidence in you, and someone else finished what you started. What you built stayed built.` },
  lost: { title: 'The sky fell silent', text: S => `The war went the other way. What was built over those years is what the country will rebuild from.` },
  peace: { title: 'Your story so far', text: S => 'The story is still being written.' }
};

})(window.IC);
