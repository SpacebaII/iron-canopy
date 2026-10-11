/* Iron Canopy — (brief 48) research from day one: the civil tree and the modifier system.
   - Modifiers: a project (or, from brief 49, a Ministry policy) carries fx: { refuel: 0.05 }, a share. IC.mod(S, key)
     is 1 + the sum of every source's share for key, capped by IC.MOD_CAP (default ±30%); IC.modAdd(S, key) is the sum
     alone (for keys in kt, like xwind). Sources are functions on IC.MOD_SRC, (S) => [{ fx, why, src }] (src: 'research', 'the Ministry'), so a panel can say
     where each share came from (IC.modWhy, IC.modNote). The value is cached until a source changes: whoever changes
     one calls IC.modDirty(S). Each system multiplies its own constant once, in the step and in IC.aptStats alike.
   - IC.MOD_WORDS[key] says in a sentence what a key does, with {p} for the share ("Fuel trucks refuel {p} more
     aircraft an hour").
   Headless. */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- modifiers ---------- */
IC.MOD_SRC = [];
IC.MOD_CAP = { xwind: 6, grant: 0.5 };
/* keys where less is better: the words say "less", the panels show a fall as a gain */
IC.MOD_LESS = { rwOcc: 1, turn: 1, buildCost: 1, matLoads: 1, fireTime: 1, birds: 1, fuelSpread: 1, pushback: 1, catering: 1, board: 1 };
IC.MOD_WORDS = {
  refuel: { t: 'Fuel trucks refuel {p} more aircraft an hour.', short: 'refuelling' },
  board: { t: 'Boarding and deplaning take {p} less time.', short: 'boarding' },
  catering: { t: 'Catering and cleaning take {p} less time.', short: 'catering' },
  pushback: { t: 'Pushbacks and tows take {p} less time.', short: 'pushback' },
  turn: { t: 'Every turnaround takes {p} less time.', short: 'turnaround' },
  rwOcc: { t: 'The tower clears the next movement on a runway {p} sooner, so it takes more movements an hour.', short: 'runway spacing' },
  ctlLoad: { t: 'Each controller handles {p} more flights at once.', short: 'controller load' },
  buildSpeed: { t: 'Construction stages run {p} quicker.', short: 'building speed' },
  buildCost: { t: 'Airport works cost {p} less.', short: 'building cost' },
  matLoads: { t: 'Paving needs {p} fewer lorry loads a hectare.', short: 'lorry loads' },
  paveLife: { t: 'Pavement lasts {p} longer before it wears out.', short: 'pavement life' },
  bldLife: { t: 'Buildings last {p} longer before they need rebuilding.', short: 'building life' },
  xwind: { t: 'Crews land and take off in {k} kt more crosswind.', short: 'crosswind limit', kt: true },
  fireTime: { t: 'Fire trucks reach the runway {p} sooner.', short: 'fire response' },
  birds: { t: '{p} fewer bird strikes.', short: 'bird strikes' },
  offerRate: { t: 'Airline offers come {p} sooner.', short: 'offers' },
  overList: { t: 'Airlines accept charges {p} further over list.', short: 'over list', abs: true },
  forgive: { t: 'Bad days are forgiven {p} sooner.', short: 'forgiving' },
  cargoRate: { t: 'Cargo warehouses handle {p} more freight.', short: 'cargo handling' },
  repair: { t: 'Runways and roads are repaired {p} faster.', short: 'repairs' },
  fuelSpread: { t: 'Burning fuel is {p} less likely to spread to nearby tanks.', short: 'fire spread' },
  grant: { t: 'The Ministry’s grant is {p} larger.', short: 'grant' }
};
const capOf = k => IC.MOD_CAP[k] != null ? IC.MOD_CAP[k] : 0.3;
IC.modDirty = S => { if (S) S._modV = (S._modV || 0) + 1; };
function build(S) {
  const sum = {}, why = {};
  for (const src of IC.MOD_SRC) for (const s of src(S) || []) for (const k in s.fx) {
    sum[k] = (sum[k] || 0) + s.fx[k];
    (why[k] = why[k] || []).push({ why: s.why, v: s.fx[k], src: s.src });
  }
  for (const k in sum) { const c = capOf(k); sum[k] = U.clamp(sum[k], -c, c); }
  return { v: S._modV || 0, sum, why };
}
const cache = S => (S._mod && S._mod.v === (S._modV || 0)) ? S._mod : (S._mod = build(S));
/* the sum of every share for key, capped */
IC.modAdd = (S, key) => !S ? 0 : (cache(S).sum[key] || 0);
/* 1 + that: multiply the constant by it (or divide, for a rate) */
IC.mod = (S, key) => 1 + IC.modAdd(S, key);
/* where each share came from: [{ why, v }] */
IC.modWhy = (S, key) => (S && cache(S).why[key]) || [];
/* "(+10% from research)": what a panel puts beside the number it changed; '' when nothing changes it */
IC.modNote = function (S, key) {
  const L = IC.modWhy(S, key); if (!L.length) return '';
  const W = IC.MOD_WORDS[key] || {}, v = IC.modAdd(S, key);
  const amt = W.kt ? `${v > 0 ? '+' : ''}${Math.round(v)} kt` : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  const from = [...new Set(L.map(x => x.src || 'research'))];
  return `(${amt} from ${from.join(' and ')})`;
};
/* every key something changes now, with its sentence and where it came from: [{ key, v, text, why: [names] }] */
IC.modList = function (S) {
  const C = cache(S), out = [];
  for (const k in C.sum) if (Math.abs(C.sum[k]) > 1e-9 && IC.MOD_WORDS[k]) out.push({ key: k, v: C.sum[k], text: IC.modWords(k, C.sum[k]), why: C.why[k].map(x => x.why) });
  return out;
};
/* a key's sentence for a share */
IC.modWords = function (key, v) {
  const W = IC.MOD_WORDS[key]; if (!W) return key;
  // a share the wrong way (a trade-off in a fork): plain "Building speed −5%"
  if (IC.MOD_LESS[key] ? v > 0 : v < 0) return `${W.short.charAt(0).toUpperCase() + W.short.slice(1)} ${v > 0 ? '+' : '−'}${W.kt ? Math.round(Math.abs(v)) + ' kt' : Math.round(Math.abs(v) * 100) + '%'}.`;
  return W.t.replace('{p}', `${Math.round(Math.abs(v) * 100)}%`).replace('{k}', String(Math.round(Math.abs(v))));
};
/* finished research is the first source */
IC.MOD_SRC.push(S => {
  const out = [];
  if (!S.tech) return out;
  for (const id of S.tech.done) { const t = IC.techById(id); if (t && t.fx) out.push({ fx: t.fx, why: t.name, src: 'research' }); }
  return out;
});
IC.techById = id => IC.TECH.find(t => t.id === id);

/* ---------- the civil tree ----------
   Six lanes on the airport and airline side. Each has cheap first steps, ranked small upgrades (I, II, III, each
   needing the one before and costing more) and one or two capstones that open something. pm: minutes of play in the
   Career (the play clock, deck.js); time: game seconds on the live clock (a Quick war). fx: shares for IC.mod.
   excl: the project this one rules out (both say so before either starts). The five airport projects of wave 7 keep
   their ids (IC.APT_TECH). */
IC.TECH_CIVIL = ['gh', 'rc', 'cn', 'ws', 'al', 'rs'];
IC.TECH_CATS.unshift(
  { id: 'gh', name: 'Ground handling', civil: true }, { id: 'rc', name: 'Runways and control', civil: true },
  { id: 'cn', name: 'Construction', civil: true }, { id: 'ws', name: 'Weather and safety', civil: true },
  { id: 'al', name: 'Airlines and cargo', civil: true }, { id: 'rs', name: 'Resilience', civil: true });
const civ = (id, cat, name, cost, pm, req, desc, o) => Object.assign({ id, cat, name, cost, pm, time: pm * 300, req, desc }, o || {});
IC.TECH.push(
  // ground handling
  civ('h_fuel1', 'gh', 'Refuelling drills I', 30, 4, [], 'Fuel crews rehearse the hook-up and the paperwork: each truck refuels 5% more aircraft an hour. Worth it if departures wait for fuel (the airport panel says how long).', { fx: { refuel: 0.05 } }),
  civ('h_fuel2', 'gh', 'Refuelling drills II', 60, 6, ['h_fuel1'], 'Faster pumps and a dispatcher who sends the nearest truck: another 5% more refuellings an hour.', { fx: { refuel: 0.05 } }),
  civ('h_fuel3', 'gh', 'Refuelling drills III', 110, 9, ['h_fuel2'], 'Trucks refilled at the farm while the last one drives back: another 5%.', { fx: { refuel: 0.05 } }),
  civ('h_board1', 'gh', 'Boarding by zones I', 30, 4, [], 'Passengers board back to front by zone: boarding and deplaning take 5% less time, so every passenger turnaround is about 2% shorter.', { fx: { board: -0.05 } }),
  civ('h_board2', 'gh', 'Boarding by zones II', 60, 6, ['h_board1'], 'Bags checked at the gate and two doors used where there are stairs: another 5% off boarding.', { fx: { board: -0.05 } }),
  civ('h_board3', 'gh', 'Boarding by zones III', 110, 9, ['h_board2'], 'Self-service boarding gates: another 5% off boarding.', { fx: { board: -0.05 } }),
  civ('h_cater', 'gh', 'Catering and cleaning crews', 40, 5, [], 'Bigger crews that work the cabin from both ends: catering and cleaning take 15% less time, about 3% off a passenger turnaround.', { fx: { catering: -0.15 } }),
  civ('h_push', 'gh', 'Pushback drills', 35, 5, [], 'Tug drivers trained with the tower: a pushback takes 10% less time, and a tug is free sooner.', { fx: { pushback: -0.1 } }),
  civ('p_bridge', 'gh', 'Jet bridges', 80, 10, ['h_board1'], 'Opens: jet bridges at gates. Passengers board through a covered bridge instead of walking out across the apron: turnarounds at gates about 8% quicker.'),
  civ('h_tbl', 'gh', 'Towbarless tugs', 150, 14, ['h_push'], 'Tugs that lift the nose wheel and drive: pushbacks and tows take 20% less time, so a gate is free sooner and fewer tugs do the work.', { fx: { pushback: -0.2 } }),
  civ('p_hydrant', 'gh', 'Hydrant fuel systems', 180, 16, ['p_bridge', 'h_fuel2'], 'Opens: the hydrant fuel system. Fuel piped under the aprons: no waiting for a fuel truck.'),
  civ('h_quick', 'gh', 'Quick turns', 220, 18, ['h_board2', 'h_cater'], 'Every turnaround takes 10% less time: more flights from the same stands. Low-cost and regional airlines love it. Rules out Premium handling.', { fx: { turn: -0.1 }, excl: 'h_prem' }),
  civ('h_prem', 'gh', 'Premium handling', 220, 18, ['h_board2', 'h_cater'], 'Lounges, fast lanes and a concierge on every gate: airlines accept charges 5% further over list and forgive a bad day 25% sooner. Rules out Quick turns.', { fx: { overList: 0.05, forgive: 0.25 }, excl: 'h_quick' }),
  // runways and control
  civ('r_occ1', 'rc', 'Runway procedures I', 40, 5, [], 'Controllers clear the next aircraft as the last one vacates, not after: the gap between movements on a runway is 3% shorter. Worth it when departures queue at the runway.', { fx: { rwOcc: -0.03 } }),
  civ('r_occ2', 'rc', 'Runway procedures II', 80, 8, ['r_occ1'], 'Line-up while the arrival rolls out, where the rules allow: another 3% off the gap.', { fx: { rwOcc: -0.03 } }),
  civ('r_occ3', 'rc', 'Runway procedures III', 140, 12, ['r_occ2'], 'Departures given their route before they reach the runway: another 3% off the gap.', { fx: { rwOcc: -0.03 } }),
  civ('r_ctl1', 'rc', 'Controller training I', 35, 5, [], 'Each controller handles 10% more flights at once: an area controller 11 instead of 10, a tower 5½. Worth it when the Airspace tab shows a sector near its limit.', { fx: { ctlLoad: 0.1 } }),
  civ('r_ctl2', 'rc', 'Controller training II', 90, 9, ['r_ctl1'], 'Electronic flight strips: another 10% more flights a controller.', { fx: { ctlLoad: 0.1 } }),
  civ('p_gradar', 'rc', 'Ground movement radar', 120, 10, [], 'Opens: the ground radar. The tower sees every aircraft on the ground, at night and in fog.'),
  civ('p_ils3', 'rc', 'CAT III landing systems', 200, 16, ['p_gradar'], 'Opens: CAT III landing systems. Landing systems built after it keep movements closely spaced in fog; earlier ones are CAT I, and fog then spaces every movement 60% wider.'),
  civ('r_hsx', 'rc', 'High-speed exits', 250, 18, ['r_occ2'], 'Exit lights, markings and crew briefings so landings leave the runway at speed: the tower clears the next movement 6% sooner.', { fx: { rwOcc: -0.06 } }),
  civ('r_flow', 'rc', 'Flow management', 300, 22, ['r_ctl2'], 'A national flow unit that spreads the load before it builds up: controllers handle 15% more flights. Rules out Reduced separation.', { fx: { ctlLoad: 0.15 }, excl: 'r_sep' }),
  civ('r_sep', 'rc', 'Reduced separation', 300, 22, ['r_occ3'], 'Arrivals spaced by the wake of the aircraft ahead, not by a fixed distance: the gap between movements is 8% shorter. Rules out Flow management.', { fx: { rwOcc: -0.08 }, excl: 'r_flow' }),
  // construction
  civ('c_spd1', 'cn', 'Site management I', 30, 4, [], 'Crews and lorries planned a week ahead: every construction stage runs 8% quicker.', { fx: { buildSpeed: 0.08 } }),
  civ('c_spd2', 'cn', 'Site management II', 70, 7, ['c_spd1'], 'Two shifts on every site: stages another 8% quicker.', { fx: { buildSpeed: 0.08 } }),
  civ('c_spd3', 'cn', 'Site management III', 130, 11, ['c_spd2'], 'Prefabricated parts made off site: stages another 8% quicker.', { fx: { buildSpeed: 0.08 } }),
  civ('c_cost1', 'cn', 'Procurement I', 40, 5, [], 'Materials bought in bulk: airport works cost 5% less.', { fx: { buildCost: -0.05 } }),
  civ('c_cost2', 'cn', 'Procurement II', 100, 9, ['c_cost1'], 'Fixed-price contracts: works another 5% cheaper.', { fx: { buildCost: -0.05 } }),
  civ('c_pave1', 'cn', 'Better mixes I', 35, 5, [], 'Pavement laid with tested mixes lasts 10% longer before it wears out (concrete 15 years, asphalt 8).', { fx: { paveLife: 0.1 } }),
  civ('c_pave2', 'cn', 'Better mixes II', 80, 8, ['c_pave1'], 'Joints sealed every summer: pavement another 10% longer.', { fx: { paveLife: 0.1 } }),
  civ('c_bld', 'cn', 'Building upkeep', 50, 6, [], 'Roofs and plant serviced on a schedule: buildings last 15% longer before they need renewing.', { fx: { bldLife: 0.15 } }),
  civ('p_rconc', 'cn', 'Reinforced concrete', 150, 12, ['c_pave1'], 'Opens: reinforced concrete pavement. It carries 600 t, and a bomb leaves a crater about half the size.'),
  civ('c_slip', 'cn', 'Slip-form paving', 250, 18, ['c_spd2'], 'A paving train that lays a whole lane at once: paving needs 30% fewer lorry loads a hectare. Worth it where sites wait for concrete.', { fx: { matLoads: -0.3 } }),
  civ('c_fast', 'cn', 'Fast-track contracts', 200, 15, ['c_cost2'], 'Contractors paid to finish early: stages 12% quicker, works 5% dearer. Rules out Lean contracts.', { fx: { buildSpeed: 0.12, buildCost: 0.05 }, excl: 'c_lean' }),
  civ('c_lean', 'cn', 'Lean contracts', 200, 15, ['c_cost2'], 'Contractors paid for savings: works 10% cheaper, stages 5% slower. Rules out Fast-track contracts.', { fx: { buildCost: -0.1, buildSpeed: -0.05 }, excl: 'c_fast' }),
  // weather and safety
  civ('w_xw1', 'ws', 'Crosswind training I', 40, 5, [], 'Crews trained in the simulator: airliners land and take off in 2 kt more crosswind. Worth it where the wind often blows across the runway.', { fx: { xwind: 2 } }),
  civ('w_xw2', 'ws', 'Crosswind training II', 100, 9, ['w_xw1'], 'Every crew checked twice a year: another 2 kt.', { fx: { xwind: 2 } }),
  civ('w_fire1', 'ws', 'Fire drills I', 35, 5, [], 'Fire crews dressed and rolling sooner: they reach the runway 10% sooner. Heavy jets need them there within 3 minutes.', { fx: { fireTime: -0.1 } }),
  civ('w_fire2', 'ws', 'Fire drills II', 90, 9, ['w_fire1'], 'Rapid intervention vehicles: another 10% sooner.', { fx: { fireTime: -0.1 } }),
  civ('w_bird', 'ws', 'Bird patrols', 40, 5, [], 'Patrols that scare birds off the airfield at dawn and dusk: 30% fewer bird strikes. Worth it at an airport near water.', { fx: { birds: -0.3 } }),
  civ('w_wild', 'ws', 'Wildlife unit', 120, 12, ['w_bird'], 'Grass kept long, ponds netted, a falconer on the staff: another 40% fewer bird strikes.', { fx: { birds: -0.4 } }),
  civ('w_glycol', 'ws', 'Glycol recovery', 160, 14, ['w_xw1'], 'De-icing fluid caught and reused, and heated pads: de-icing takes half as long, on a pad or at the stand. Worth it in winter.', { fx: { deice: -0.5 } }),
  // airlines and cargo
  civ('a_off1', 'al', 'Route marketing I', 40, 5, [], 'Our airports sold at airline fairs: offers come 5% sooner.', { fx: { offerRate: 0.05 } }),
  civ('a_off2', 'al', 'Route marketing II', 100, 9, ['a_off1'], 'A route development fund and sales offices abroad: offers another 5% sooner.', { fx: { offerRate: 0.05 } }),
  civ('a_list1', 'al', 'Airline relations I', 40, 5, [], 'A desk for each airline: they accept charges 2% further over list.', { fx: { overList: 0.02 } }),
  civ('a_list2', 'al', 'Airline relations II', 100, 9, ['a_list1'], 'Joint marketing with the airlines: another 2% over list.', { fx: { overList: 0.02 } }),
  civ('a_forg', 'al', 'Service recovery', 60, 7, ['a_list1'], 'A team that calls the airline the morning after a bad day: bad days are forgiven 30% sooner.', { fx: { forgive: 0.3 } }),
  civ('a_cargo', 'al', 'Cargo automation', 200, 16, ['a_list1'], 'Sorting machines and racked storage: cargo warehouses handle 50% more freight.', { fx: { cargoRate: 0.5 } }),
  civ('a_lab', 'al', 'Research office', 250, 20, ['a_off1'], 'A planning office that runs projects side by side: a third research slot.', { slot: 1 }),
  // resilience: pays off in the war
  civ('s_rep1', 'rs', 'Repair crews I', 40, 5, [], 'Engineers with their own lorries: runways and roads are repaired 10% faster.', { fx: { repair: 0.1 } }),
  civ('s_rep2', 'rs', 'Repair crews II', 100, 9, ['s_rep1'], 'Materials stockpiled on every site: another 10% faster.', { fx: { repair: 0.1 } }),
  civ('s_spread', 'rs', 'Fire breaks', 50, 6, [], 'Walls and foam between tanks and buildings: burning fuel does 25% less damage to what stands near it.', { fx: { fuelSpread: -0.25 } }),
  civ('s_hard', 'rs', 'Hardened fuel farms', 220, 16, ['s_spread'], 'Tanks half buried behind earth walls: burning fuel does another 35% less damage nearby.', { fx: { fuelSpread: -0.35 } })
);
// rapid runway repair moves here from Logistics (same id: Quick war starts with it)
{ const t = IC.TECH.find(x => x.id === 'l_rrr'); if (t) Object.assign(t, { cat: 'rs', req: ['s_rep1'], pm: 12, desc: 'Base engineers repair runways and taxiways twice as fast after a crater.' }); }
IC.MOD_CAP.cargoRate = 0.6; IC.MOD_CAP.matLoads = 0.4; IC.MOD_CAP.birds = 0.75; IC.MOD_CAP.fuelSpread = 0.6; IC.MOD_CAP.deice = 0.5; IC.MOD_CAP.pushback = 0.35;
IC.MOD_WORDS.deice = { t: 'De-icing takes {p} less time.', short: 'de-icing' };
IC.MOD_LESS.deice = 1;
IC.techCivil = t => IC.TECH_CIVIL.includes(t.cat);

/* ---------- slots, pace, locks ---------- */
IC.RES_PACE = 1;   // multiplies every project's minutes of play (the balance lever)
/* research slots: two, a third from the Research office, a fourth when Act II begins (the Career) */
IC.techSlots = S => 2 + (S.tech.done.has('a_lab') ? 1 : 0) + (S.story && S.story.act >= 2 ? 1 : 0);
IC.techNextSlot = S => !S.tech.done.has('a_lab') ? 'The Research office (Airlines and cargo) opens a third slot.' : S.story && S.story.act < 2 ? 'A fourth slot opens when Act II begins.' : '';
/* seconds of play a project takes in the Career */
IC.techPlay = t => (t.pm || U.clamp(Math.round(t.time / 300), 6, 30)) * 60 * IC.RES_PACE;
/* game seconds it takes at the speed the game runs now (the Career), or on the live clock */
IC.techTime = (S, t) => S.mode === 'story' && S.story ? IC.techPlay(t) * IC.GS * IC.playRate(S) : t.time;
IC.techMonths = t => Math.max(1, Math.round(IC.techPlay(t) / 60 / 4));
/* how long, in words: "about 12 min of play" in the Career, a duration on the live clock */
IC.techDur = (S, t, f) => {
  f = f == null ? 1 : f;
  if (!(S.mode === 'story' && S.story)) return U.dur(f * t.time);
  return `about ${Math.max(1, Math.round(f * IC.techPlay(t) / 60))} min of play`;
};
/* the date it lands at the current speed (the Career) */
IC.techWhen = (S, t, f) => S.mode === 'story' && S.story ? U.date(S.time + (f == null ? 1 : f) * IC.techTime(S, t)) : '';
/* a lane the Career has not reached: the military ones before Act III */
IC.techLaneOpen = (S, cat) => !S.story || IC.TECH_CIVIL.includes(cat) || S.story.act >= 3;
/* why a project cannot be started now, '' when it can */
IC.techClosed = function (S, t) {
  if (!IC.techLaneOpen(S, t.cat)) return 'Opens with Act III';
  const x = t.excl && IC.techById(t.excl);
  if (x && (S.tech.done.has(x.id) || IC.researching(S, x.id))) return `Ruled out by ${x.name}`;
  return '';
};
IC.techOpenNow = (S, t) => !S.tech.done.has(t.id) && !IC.researching(S, t.id) && t.req.every(r => S.tech.done.has(r)) && !IC.techClosed(S, t);
IC.researching = (S, id) => S.tech.slots.find(s => s && s.id === id);
IC.startResearch = function (S, id) {
  const t = IC.techById(id);
  const slot = S.tech.slots.findIndex(s => !s);
  if (!t || slot < 0 || S.budget < t.cost || !IC.techOpenNow(S, t)) return false;
  IC.pay(S, 'research', t.cost);
  S.tech.slots[slot] = { id, prog: 0 };
  IC.log(S, 'info', 'RESEARCH', `Started ${t.name}: ready in ${IC.techDur(S, t)}${IC.techWhen(S, t) ? ` (${IC.techWhen(S, t)} at this speed)` : ''}.`);
  IC.emit(S, 'researchStart', id);
  return true;
};
/* every step: projects advance (in the Career by the play clock, so Wait does not finish them sooner), slots open */
IC.researchTick = function (S, dt) {
  const T = S.tech;
  while (T.slots.length < IC.techSlots(S)) T.slots.push(null);
  T.slots.forEach((sl, i) => {
    if (!sl) return;
    const tech = IC.techById(sl.id);
    sl.prog += dt / IC.techTime(S, tech);
    if (sl.prog < 1) return;
    T.done.add(tech.id); T.slots[i] = null; IC.modDirty(S);
    const civil = IC.techCivil(tech);
    IC.log(S, 'kill', 'RESEARCH', `${tech.name} complete.${tech.fx ? ' ' + Object.entries(tech.fx).map(([k, v]) => IC.modWords(k, v)).join(' ') : ''}`);
    IC.news(S, civil ? `Civil aviation authority adopts ${tech.name.toLowerCase()}.` : `Defence ministry fields new capability: ${tech.name.toLowerCase()}.`);
    IC.techAir && IC.techAir(S, tech.id);
    IC.sfx && IC.sfx.ui('ok');
    IC.emit(S, 'research', tech.id);
    // stats that read a modifier are worked out again
    if (tech.fx) for (const ap of IC.bases(S)) if (ap.owner === 'us' && ap.parts) ap.dirty = true;
  });
};
/* the idle-slot warning: what is open to start */
IC.techIdleText = function (S) {
  const free = S.tech.slots.filter(s => !s).length; if (!free) return '';
  const open = IC.TECH.filter(t => IC.techOpenNow(S, t)).sort((a, b) => a.cost - b.cost);
  if (!open.length) return '';
  return `${free === 1 ? 'A research slot is' : `${free} research slots are`} free. Open now: ${open.slice(0, 3).map(t => `${t.name} (${U.money(t.cost)})`).join(', ')}${open.length > 3 ? ` and ${open.length - 3} more` : ''}.`;
};

})(window.IC);
