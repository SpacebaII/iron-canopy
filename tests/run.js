/* Iron Canopy test suite. Runs the simulation headless and checks that it behaves.
   node tests/run.js            everything
   node tests/run.js airport    only tests whose name contains "airport"
   node tests/run.js --quick    skip the slow Academy lessons */
const IC = require('../headless.js');
const { playLesson } = require('../academytest.js');
const U = IC.U;

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const filter = args.find(a => !a.startsWith('--'));
const tests = [];
const test = (name, fn, slow) => tests.push({ name, fn, slow });
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const run = (S, hours, each) => { for (let i = 0; i < hours * 3600 / 0.5 && !S.over; i++) { IC.step(S, 0.5); if (each && i % 120 === 0) each(S); } };
/* a player who approves feasible airline requests and answers decisions with the first option */
const player = S => {
  if (S.av) for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q)) IC.avDecide(S, q.id, true);
  if (S.story) for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0);
};

/* ---------- world ---------- */
test('world generation is deterministic for a seed', () => {
  const a = IC.generate(4242), b = IC.generate(4242);
  assert(a.cities.length === b.cities.length && a.cities.length > 5, 'city count differs or too few cities');
  assert(a.cities.every((c, i) => c.x === b.cities[i].x && c.y === b.cities[i].y), 'city positions differ');
  assert(a.edges.length === b.edges.length, 'road count differs');
});

/* roads reachable from a node, optionally only along some classes */
const reach = (W, from, ok) => {
  const adj = {}; for (const e of W.edges) if (!ok || ok(e)) { (adj[e.a] = adj[e.a] || []).push(e.b); (adj[e.b] = adj[e.b] || []).push(e.a); }
  const seen = new Set([from]), q = [from];
  while (q.length) for (const n of adj[q.pop()] || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
};
test('world: every city, village and airfield is reachable by road', () => {
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = IC.generate(seed), seen = reach(W, W.cities[0].id);
    const lost = W.cities.concat(W.villages.filter(v => v.home), W.infra).filter(p => !seen.has(p.id));
    assert(!lost.length, `seed ${seed}: cut off from the capital: ${lost.map(p => p.name).join(', ')}`);
  }
});
test('world: motorways join the capital to the four largest cities', () => {
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = IC.generate(seed), seen = reach(W, W.cities[0].id, e => e.cls === 'hw');
    const big = W.cities.filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 4);
    for (const c of big) assert(seen.has(c.id), `seed ${seed}: no motorway from the capital to ${c.name}`);
  }
});
test('world: roads meet at junctions and do not run side by side', () => {
  const W = IC.generate(4242);
  const pair = new Set();
  for (const e of W.edges) { const k = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a; assert(!pair.has(k), `two roads between ${k}`); assert(e.a !== e.b, 'a road loops onto itself'); pair.add(k); }
  assert(Object.values(W.nodes).some(n => n.ix), 'no motorway interchanges');
  assert(W.bridges.length > 0, 'no bridges');
});
test('world: every motorway-to-motorway junction has an interchange shape, with smooth slip roads', () => {
  let mm = 0, mx = 0;
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = IC.generate(seed);
    const hwAt = k => W.edges.filter(e => e.cls === 'hw' && (e.a === k || e.b === k)).length;
    for (const k in W.nodes) {
      const n = W.nodes[k], J = W.junctionAt[k], h = hwAt(k);
      if (!n.jct || !h) continue;
      if (h >= 3) { assert(J && J.kind === 'mm', `seed ${seed}: motorways meet at ${k} without an interchange`); mm++; }
      else if (h === 2 && n.deg > 2) { assert(J && J.kind === 'mx', `seed ${seed}: a road meets the motorway at ${k} without an interchange`); mx++; }
      if (!J || !J.ramps.length) continue;
      if (J.kind === 'mm') assert(J.ramps.some(r => r.kind === 'loop') && J.ramps.some(r => r.kind === 'outer') && J.over.length, `seed ${seed}: interchange ${k} has no loops, slip roads or bridge`);
      for (const r of J.ramps) {
        // no kinks: consecutive pieces of a slip road turn by less than 30°; a loop turns three quarters round
        let turn = 0;
        for (let i = 2; i < r.pts.length; i++) {
          const a = Math.atan2(r.pts[i - 1].y - r.pts[i - 2].y, r.pts[i - 1].x - r.pts[i - 2].x), b = Math.atan2(r.pts[i].y - r.pts[i - 1].y, r.pts[i].x - r.pts[i - 1].x);
          assert(Math.abs(U.angWrap(b - a)) < 0.53, `seed ${seed}: a ${r.kind} slip road at ${k} has a kink`);
          turn += U.angWrap(b - a);
        }
        if (r.kind === 'loop') assert(Math.abs(turn) > 3.5, `seed ${seed}: a loop at ${k} turns only ${Math.round(Math.abs(turn) * 57)}°`);
      }
    }
  }
  assert(mm >= 2 && mx >= 20, `too few interchanges to be a real test (${mm} motorway, ${mx} other)`);
});
test('world: city streets end on another street or road', () => {
  for (const seed of [4242, 7]) {
    const W = IC.generate(seed);
    for (const c of W.cities) for (const l of c.streets) assert(!l.deadEnd, `seed ${seed}: a street in ${c.name} ends in the middle of nowhere`);
  }
});
test('world: generation stays under the time budget', () => {
  IC.generate(1); // warm up the JIT
  // the best of two tries per seed, so a busy machine does not fail the test
  let worst = 0;
  for (const seed of [4242, 7, 99]) {
    let best = 1e9;
    for (let k = 0; k < 2; k++) { const t0 = Date.now(); const W = IC.generate(seed); IC.buildRouting(W); best = Math.min(best, Date.now() - t0); }
    worst = Math.max(worst, best);
  }
  assert(worst < 1500, `generation took ${worst} ms`);
});

test('traffic: rush hour is busier than night, and an air raid empties the roads', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S), view = { x0: cap.x - 150, y0: cap.y - 150, x1: cap.x + 150, y1: cap.y + 150 };
  const count = () => { S.traffic.stepT = 0; IC.traffic(S, 0.25); return IC.trafficVisible(S, view, 0.3, () => {}); };
  const rush = count();
  S.time = 3 * 3600; const night = count();
  S.time = 8 * 3600; cap.alert = 600; const raid = count(); cap.alert = 0; count();
  assert(rush > 400, `too little traffic round the capital at 08:00: ${rush}`);
  assert(night < rush * 0.3, `night (${night}) not much quieter than rush hour (${rush})`);
  assert(raid < rush * 0.5, `an air raid alert did not clear the roads (${raid} vs ${rush})`);
  const hw = S.traffic.links.filter(L => L.cls === 'hw').sort((a, b) => b.busy - a.busy)[0];
  assert(hw.load > 0.8, `the busiest motorway is not busy at rush hour (${hw.load.toFixed(2)})`);
});
test('traffic: a busy hour stays inside the time budget', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S);
  for (let i = 0; i < 200; i++) IC.traffic(S, 0.25);
  let t0, step = 1e9;
  for (let k = 0; k < 3; k++) { t0 = process.hrtime.bigint(); for (let i = 0; i < 1000; i++) IC.traffic(S, 0.25); step = Math.min(step, Number(process.hrtime.bigint() - t0) / 1e6 / 1000); }
  // what the renderer asks for each frame at city zoom (about 1,400 × 900 px at 3 px per unit)
  const view = { x0: cap.x - 240, y0: cap.y - 150, x1: cap.x + 240, y1: cap.y + 150 };
  let n = 0, frame = 1e9;
  for (let k = 0; k < 3; k++) { t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) n = IC.trafficVisible(S, view, 7 / 3, () => {}); frame = Math.min(frame, Number(process.hrtime.bigint() - t0) / 1e6 / 20); }
  console.log(`        step ${step.toFixed(4)} ms, ${n} vehicles placed in ${frame.toFixed(2)} ms`);
  assert(step < 0.1, `traffic step takes ${step.toFixed(3)} ms (budget 0.1 ms of the 1 ms step)`);
  assert(frame < 4, `placing ${n} vehicles takes ${frame.toFixed(2)} ms a frame`);
});

/* ---------- airports ---------- */
test('airport: starting layouts are connected', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const cap = S.byId[S.story.cap], bad = S.byId[S.story.bad];
  const st = IC.aptStats(S, cap);
  assert(st.longest >= 30, `capital runway too short: ${st.longest}`);
  assert(IC.aptStands(cap).every(s => s.linked !== false), 'capital has stands cut off from the runway');
  assert(st.maxType === 'cargo', `capital cannot take the largest aircraft (${st.maxType})`);
  assert(IC.aptStats(S, bad).warn.some(w => /backtrack/.test(w)), 'the bad regional should warn about backtracking');
});
test('airport: a departure taxis out and takes off', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 10 });
  const cap = S.byId[S.story.cap];
  const s = IC.aptStands(cap).find(x => !x.occ && x.size !== 's' && x.linked !== false);
  let air = false;
  const m = IC.gopsDepart(S, cap, { type: 'narrow', node: s.id, stand: s, startT: 0, who: 'TEST 1', onAir: () => { air = true; } });
  assert(m, 'no departure plan');
  for (let i = 0; i < 3600 * 2 && !air; i++) IC.step(S, 0.5);
  assert(air, `never took off; last phase ${m.phase}`);
});
test('airport: building a parallel taxiway stops the backtracking', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const bad = S.byId[S.story.bad];
  S.budget = 5000;
  const P = (x, y) => IC.aptLocal(bad, x, y);
  assert(IC.aptPlanTaxi(S, bad, [P(2, 1.75), P(-6, 1.75), P(-11.8, 1.75), P(-11.8, 0)]), 'could not plan the first taxiway');
  assert(IC.aptPlanTaxi(S, bad, [P(2, 1.75), P(8, 1.75), P(11.8, 1.75), P(11.8, 0)]), 'could not plan the second taxiway');
  run(S, 2);
  const st = IC.aptStats(S, bad);
  assert(st.rwy[0].threshold, 'runway ends still not reached by a taxiway');
  assert(!st.warn.some(w => /backtrack/.test(w)), 'still warns about backtracking');
});
test('airport: a hit on a clustered fuel farm spreads fire', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const cap = S.byId[S.story.cap];
  const tanks = cap.parts.filter(p => p.kind === 'fuel');
  IC.detonate(S, tanks[0].x, tanks[0].y, 90, { d: { code: 'TEST' } });
  run(S, 0.5);
  assert(tanks.filter(t => t.hp <= t.max * 0.25).length >= 3, 'fire did not spread across the tank farm');
});
test('airport: a runway crater shortens the usable strip', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const cap = S.byId[S.story.cap], rw = cap.parts.find(p => p.kind === 'runway');
  const before = IC.rwUsable(rw), q = IC.rwAt(rw, 0.5);
  IC.detonate(S, q.x, q.y, 60, { d: { code: 'TEST' } });
  assert(rw.craters.length === 1, 'no crater recorded');
  assert(IC.rwUsable(rw) < before * 0.6, 'usable length did not drop');
});

/* ---------- the airport simulation at scale: wind, weather, zones, incidents ---------- */
const { drive, tick, kdenGame, relayout } = require('./traffic.js');
const calm = (S, dir, kt, gust) => IC.setWind(S, { dir: dir || 0, kt: kt == null ? 6 : kt, gust, hold: true });
const sky = (S, kind) => { S.weather.kind = S.weather.prev = kind; S.weather.fade = 1; S.weather.hold = true; };
/* finish every planned part at once */
const finishWorks = (S, ap) => { for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); } };
test('airport: the KDEN-scale layout handles its rated movements for two hours', () => {
  const { S, ap } = kdenGame(12345, 9);
  sky(S, 'clear'); calm(S, -Math.PI / 2, 12);
  const st = IC.aptStats(S, ap);
  assert(ap.parts.filter(p => p.kind === 'runway').length === 6 && IC.aptStands(ap).length >= 150, 'not a six-runway, 150-stand airport');
  assert(st.movesPerHour >= 150 && st.arrPerHour >= 40 && st.depPerHour >= 40, `rated too low: ${st.arrPerHour} arrivals, ${st.depPerHour} departures an hour`);
  // half an hour to fill the taxiways, then two hours at the rated rate
  const at = {}, t0 = S.time;
  const r = drive(S, ap, { follow: true, hours: 2.5, fill: 0.7, each: S => { for (const h of [0.5, 1.5, 2.5]) if (!at[h] && S.time >= t0 + h * 3600 - 1) at[h] = { arr: ap.kpi.arr || 0, dep: ap.kpi.dep || 0 }; } });
  const n1 = { arr: at[2.5].arr - at[1.5].arr, dep: at[2.5].dep - at[1.5].dep }, moved = at[2.5].arr + at[2.5].dep - at[0.5].arr - at[0.5].dep;
  // the panel rates the runways for the aircraft that actually used them in the last hour
  const now = IC.aptStats(S, ap), rated = now.arrPerHour + now.depPerHour;
  assert(r.grid === 0, `${r.grid} gridlocks`);
  assert(r.stuck === 0, `${r.stuck} aircraft stranded`);
  assert(r.oldest < 45 * 60, `an aircraft has been on the ground ${IC.U.dur(r.oldest)}`);
  assert(r.maxHold < 20 * 60, `an arrival held ${IC.U.dur(r.maxHold)}`);
  assert(n1.arr >= now.arrPerHour * 0.9 && n1.dep >= now.depPerHour * 0.9, `last hour: ${n1.arr}/${now.arrPerHour} arrivals, ${n1.dep}/${now.depPerHour} departures`);
  assert(moved >= rated * 2 * 0.9, `two hours: ${moved} movements against ${rated * 2} rated`);
  console.log(`        rated ${now.arrPerHour} arrivals + ${now.depPerHour} departures an hour for this mix; flew ${moved} movements in two hours (last hour ${n1.arr} + ${n1.dep}); longest hold ${IC.U.dur(r.maxHold)}`);
}, true);
test('airport: a crosswind closes a runway to a type; a crosswind runway keeps the airport open', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 10 });
  const ap = S.byId[S.story.reg];
  sky(S, 'clear'); calm(S, ap.rwyA + Math.PI / 2, 30);
  ap.cfg = null; IC.aptStats(S, ap);
  const rw = ap.parts.find(p => p.kind === 'runway'), turbo = IC.ACTYPES.turbo;
  assert(/crosswind/.test(IC.rwWindBlock(S, rw, ap.cfg.rw[rw.id].dir, turbo)), 'a 30 kt crosswind should close the runway to turboprops');
  assert(!IC.rwWindBlock(S, rw, ap.cfg.rw[rw.id].dir, IC.ACTYPES.wide), 'wide-bodies may still land in 30 kt');
  const s = IC.aptStands(ap).find(x => !x.occ && x.linked);
  assert(IC.gopsLand(S, ap, { type: 'turbo', target: s.id, stand: s }) === 'divert', 'turboprop not diverted');
  assert(/crosswind/.test(IC.aptLandWhy(S, ap, turbo)), 'no crosswind reason given');
  assert(ap.st.warn.some(w => /cannot use any runway/.test(w)), 'the panel does not warn about the wind');
  // a second runway across the first, joined to the parallel taxiway
  S.budget = 1e4;
  const P = (x, y) => IC.aptLocal(ap, x, y);
  assert(IC.aptPlanRunway(S, ap, P(-16, -9), P(-16, 9)), 'could not plan the crosswind runway');
  assert(IC.aptPlanTaxi(S, ap, [P(-12.8, 1.7), P(-16, 1.7)]), 'could not plan its taxiway');
  finishWorks(S, ap);
  ap.cfg = null; IC.aptStats(S, ap);
  const m = IC.gopsLand(S, ap, { type: 'turbo', target: s.id, stand: s });
  assert(m && typeof m === 'object', `turboprop still cannot land: ${m} (${IC.aptLandWhy(S, ap, turbo)})`);
  assert(m.plan.rw.id !== rw.id, 'landed on the main runway in a crosswind');
});
test('airport: fog without a landing system diverts arrivals; with one they land', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 5 });
  const ap = S.byId[S.story.cap];
  sky(S, 'fog'); calm(S, 0, 3);
  assert(IC.needILS(S), 'fog should need a landing system');
  const ils = ap.parts.filter(p => p.kind === 'ils');
  assert(ils.length === 2, 'the capital should start with a landing system on both ends');
  ap.parts = ap.parts.filter(p => p.kind !== 'ils'); ap.dirty = true; ap.cfg = null; IC.aptStats(S, ap);
  assert(ap.st.warn.some(w => /ILS/.test(w)), 'no warning about the missing landing system');
  const a = drive(S, ap, { arr: 12, hours: 0.5, fill: 0, mix: [['narrow', 1]] });
  assert(a.div > 0 && a.arr === 0, `fog without ILS: ${a.div} diversions, ${a.arr} landed`);
  assert(Object.keys(a.divWhy).some(w => /ILS/.test(w)), `diversions not blamed on the missing ILS: ${JSON.stringify(a.divWhy)}`);
  for (const p of ils) ap.parts.push(p);
  ap.dirty = true; ap.cfg = null; IC.aptStats(S, ap);
  const b = drive(S, ap, { arr: 12, hours: 0.75, fill: 0, mix: [['narrow', 1]] });
  assert(b.div === 0 && b.arr >= 5, `fog with ILS: ${b.div} diversions, ${b.arr} landed`);
});
test('airport: zones keep airliners and military aircraft apart', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 8 });
  const ap = S.byId[S.story.cap];
  relayout(S, ap, 'kden');
  S.roster.push({ id: 'rzone', name: 'Test flight', kind: 'aew', base: ap.id, st: 'ready', n: 1 });
  IC.assignSlots(S, ap);
  const r = S.roster.find(x => x.id === 'rzone'), stand = IC.aptStands(ap).find(s => s.id === r.slot);
  assert(stand && stand.zone === 'mil', `military flight parked in the ${stand ? stand.zone : 'open'}`);
  for (const k of ['turbo', 'narrow', 'wide', 'cargo']) for (let i = 0; i < 20; i++) { const s = IC.avFreeStand(S, ap, IC.ACTYPES[k]); if (s) { assert(s.zone !== 'mil', `${k} offered a military stand`); s.occ = 'z' + k + i; } }
  for (const s of IC.aptStands(ap)) if (/^z/.test(s.occ)) s.occ = null;
  run(S, 3, player);
  assert(!S.over, `game ended: ${S.over}`);
  assert(ap.kpi.n > 20, `only ${ap.kpi.n} airline movements`);
  const tails = new Map(S.av.tails.map(t => [t.id, t]));
  for (const s of IC.aptStands(ap)) { const t = tails.get(s.occ); if (t) assert(IC.standZoneOk(s, t.T), `${t.T.name} parked in the ${s.zone} zone`); }
  assert(IC.aptStats(S, ap).zones.mil && IC.aptStats(S, ap).zones.civil, 'the panel does not count stands per zone');
}, true);
test('airport: crash risk is zero in normal operations and rises beyond limits', () => {
  const { S, ap } = kdenGame(12345, 10);
  sky(S, 'clear'); calm(S, -Math.PI / 2, 14);
  IC.aptStats(S, ap);
  assert(!ap.water.near, 'the test site should be away from water');
  const r = drive(S, ap, { arr: 40, dep: 60, hours: 1.5, fill: 0.6 });
  assert(r.risk === 0 && r.crash === 0, `normal operations carried risk ${r.risk} and ${r.crash} crashes`);
  // a single-runway airport in gusts beyond a narrow-body's limit, then a wet runway only just long enough
  const S2 = IC.newGame({ seed: 12345, mode: 'story', hour: 10 });
  const cap = S2.byId[S2.story.cap], bad = S2.byId[S2.story.bad];
  sky(S2, 'clear'); calm(S2, cap.rwyA + Math.PI / 3, 26, 26);
  const land = ap2 => { ap2.cfg = null; IC.aptStats(S2, ap2); const s = IC.aptStands(ap2).find(x => !x.occ && x.linked && x.size !== 's'); const m = IC.gopsLand(S2, ap2, { type: 'narrow', target: s.id, stand: s }); assert(m && m.plan, `no landing at ${ap2.name}: ${m}`); ap2.moves = ap2.moves.filter(x => x !== m); ap2.rl = {}; return IC.gopsRisk(S2, ap2, m, 'arr'); };
  const steady = land(cap);
  assert(steady.p === 0 || steady.why.every(w => w.cause === 'bird'), `steady wind within limits carried risk: ${JSON.stringify(steady.why)}`);
  calm(S2, cap.rwyA + Math.PI / 3, 26, 44);
  const gusty = land(cap);
  assert(gusty.why.some(w => w.cause === 'gust' && w.p > 0), 'gusts beyond the crosswind limit carried no risk');
  calm(S2, bad.rwyA, 4);
  const dry = land(bad).why.filter(w => w.cause === 'overrun');
  sky(S2, 'rain');
  const wet = land(bad).why.filter(w => w.cause === 'overrun');
  assert(!dry.length && wet.length && wet[0].p > 0, `a wet ${IC.U.km(IC.rwLen(bad.parts.find(p => p.kind === 'runway')))} runway should risk an overrun (dry ${dry.length}, wet ${wet.length})`);
}, true);
test('airport: a crash closes the runway, is investigated and costs confidence', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 10 });
  const ap = S.byId[S.story.cap];
  sky(S, 'clear'); calm(S, ap.rwyA, 5);
  IC.aptStats(S, ap);
  const s = IC.aptStands(ap).find(x => !x.occ && x.linked && x.size !== 's');
  const m = IC.gopsLand(S, ap, { type: 'narrow', target: s.id, stand: s, who: 'TST 1' });
  m.crash = { cause: 'overrun', text: 'a test' };
  const before = S.story.standing, cards = S.camp.cards.length;
  let crashed = null; IC.on((S2, type, d) => { if (S2 === S && type === 'crash') crashed = d; });
  for (let i = 0; i < 400 && !crashed; i++) tick(S, 0.5);
  assert(crashed, 'no crash');
  assert(S.story.standing < before, 'the Prime Minister did not notice');
  assert(!IC.baseStatus(S, ap).runway || IC.rwUsable(ap.parts.find(p => p.kind === 'runway')) < IC.rwLen(ap.parts.find(p => p.kind === 'runway')) - 1, 'the runway did not close');
  assert(IC.aptRepairList(ap).some(it => /wreckage/.test(it.label)), 'no wreckage to clear');
  for (let i = 0; i < 3600 * 2 && S.camp.cards.length === cards; i++) tick(S, 0.5);
  assert(S.camp.cards.some(c => /cause/.test(c.text)), 'no investigation card stating the cause');
});
test('airport: a step with 150 aircraft moving stays within budget', () => {
  const { S, ap } = kdenGame(12345, 10);
  sky(S, 'clear'); calm(S, -Math.PI / 2, 12);
  IC.aptStats(S, ap);
  drive(S, ap, { arr: 200, dep: 700, hours: 0.25, fill: 0.95 });
  assert(ap.moves.length >= 150, `only ${ap.moves.length} aircraft moving`);
  let t = 0, g = 0; const N = 400;
  for (let i = 0; i < N; i++) { const a = process.hrtime.bigint(); IC.step(S, 0.25); t += Number(process.hrtime.bigint() - a) / 1e6; }
  for (let i = 0; i < N; i++) { const a = process.hrtime.bigint(); IC.gops(S, 0.25); g += Number(process.hrtime.bigint() - a) / 1e6; }
  console.log(`        ${ap.moves.length} aircraft moving: ${(t / N).toFixed(3)} ms a step, ground operations ${(g / N).toFixed(3)} ms`);
  assert(g / N < 0.6, `ground operations take ${(g / N).toFixed(2)} ms a step`);
  assert(t / N < 1.5, `a step takes ${(t / N).toFixed(2)} ms`);
});

/* ---------- the builder ---------- */
/* a site for a new airport at the edge of a town, with homes close by */
const siteNear = (S, c) => {
  for (let r = c.r * 0.55; r < c.r + 40; r += 3) for (let a = 0; a < 6.28; a += 0.2) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    if (!IC.foundCheck(S, x, y) && c.blocks.some(b => U.dxy(b.x, b.y, x, y) < 15)) return { x, y };
  }
  return null;
};
const townWithSite = S => { for (const c of IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop)) { const p = siteNear(S, c); if (p) return { c, p }; } return null; };
test('builder: right-click takes a point back; clicking the last point again builds the taxiway', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 }); IC.S = S;
  const bad = S.byId[S.story.bad]; S.budget = 5000;
  const P = (x, y) => IC.aptLocal(bad, x, y), taxis = () => bad.parts.filter(p => p.kind === 'taxi').length, n0 = taxis();
  S.mode2 = IC.bldMode(S, bad, 'taxi');
  IC.clickWorld(P(2, 1.75), 0); IC.clickWorld(P(-6, 1.75), 0); IC.clickWorld(P(-8, 4), 0);
  assert(S.mode2.pts.length === 3, `3 points expected, ${S.mode2.pts.length} placed`);
  IC.clickWorld(P(-8, 4), 2);
  assert(S.mode2 && S.mode2.pts.length === 2 && taxis() === n0, 'right-click did not take the last point back');
  IC.clickWorld(P(-11.8, 1.75), 0); IC.clickWorld(P(-11.8, 0), 0);
  assert(taxis() === n0, 'built before the last point was clicked again');
  IC.clickWorld(P(-11.8, 0), 0);
  assert(taxis() === n0 + 1 && S.mode2.pts.length === 0, 'clicking the last point again did not build the taxiway');
  const t = bad.parts[bad.parts.length - 1], end = bad.nodes[t.nodes[t.nodes.length - 1]];
  assert(end.on && end.on.kind === 'rwy', 'the taxiway does not reach the runway');
  assert(t.nodes.length > 4, 'the corner was not rounded');
  IC.clickWorld(P(0, 6), 2);
  assert(!S.mode2, 'right-click with no points left did not leave build mode');
  // undo takes the last placement back and refunds what it had cost so far
  const b0 = S.budget; tick(S, 20);
  const spent = b0 - S.budget;
  assert(IC.bldUndo(S, bad) && taxis() === n0 && Math.abs(S.budget - b0) < 1e-6, `undo left ${taxis() - n0} taxiways and refunded ${U.money(spent - (b0 - S.budget))} of ${U.money(spent)}`);
});
test('builder: the big-airport tools lay out a parallel taxiway, exits and a holding bay in a few clicks', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 10 }); IC.S = S;
  const bad = S.byId[S.story.bad], rw = bad.parts.find(p => p.kind === 'runway'); S.budget = 5000;
  const P = (x, y) => IC.aptLocal(bad, x, y), n0 = bad.parts.length;
  S.mode2 = IC.bldMode(S, bad, 'parallel');
  IC.clickWorld(P(0, 0), 0); IC.clickWorld(P(0, 1.8), 0); IC.clickWorld(P(0, 1.8), 0);
  S.mode2 = IC.bldMode(S, bad, 'exits');
  IC.clickWorld(P(0, 0), 0); IC.clickWorld(P(0, 0), 0);
  S.mode2 = IC.bldMode(S, bad, 'hold');
  IC.clickWorld(P(-11.8, 0), 0); IC.clickWorld(P(-11.8, 0), 0);
  finishWorks(S, bad);
  const st = IC.aptStats(S, bad), G = IC.aptGraph(bad), on = G.rwn.get(rw.id);
  assert(bad.parts.length - n0 >= 3, `${bad.parts.length - n0} parts from 8 clicks`);
  assert(st.rwy[0].threshold && !st.warn.some(w => /backtrack/.test(w)), `still backtracking: ${st.warn.join(' ')}`);
  assert(on.filter(n => n.exit).length >= 5, `only ${on.filter(n => n.exit).length} ways off the runway`);
  assert(on.filter(n => n.entry && n.s < 2).length >= 2, 'no holding bay beside the first entry');
});
test('builder: a planned part can be moved and turned before its earthworks start', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const ap = S.byId[S.story.cap]; S.budget = 3000; ap.crews = 0;
  const c = IC.aptLocal(ap, 4, -5.5), p = IC.aptPlanPart(S, ap, 'hangar', c.x, c.y, ap.rwyA);
  const to = IC.aptLocal(ap, 6, -5.5);
  assert(IC.bldMove(S, ap, p, to.x, to.y, p.a + Math.PI / 2) && U.dist(p, to) < 1e-6, 'could not move and turn the planned hangar');
  const tank = ap.parts.find(q => q.kind === 'fuel');
  assert(!IC.bldMove(S, ap, p, tank.x, tank.y), 'moved the hangar onto a fuel tank');
  ap.crews = 1; for (let i = 0; i < 3600 && ap.works[0].stage !== 'earth'; i++) tick(S, 1);
  assert(!IC.bldCanMove(ap, p), 'still movable once the earthworks started');
});
test('builder: construction goes in stages and is paid for as it runs', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const ap = S.byId[S.story.cap]; S.budget = 3000;
  const c = IC.aptLocal(ap, 4, -5.5), p = IC.aptPlanPart(S, ap, 'apron', c.x, c.y, ap.rwyA, 4, 1.3);
  assert(p, 'could not plan the apron');
  const w = ap.works.find(x => x.part === p);
  assert(3000 - S.budget < w.cost * 0.1, `${U.money(3000 - S.budget)} of ${U.money(w.cost)} paid up front`);
  const seen = [], spent = [];
  for (let i = 0; i < 6 * 3600 && !p.built; i++) { tick(S, 1); if (w.stage && seen[seen.length - 1] !== w.stage) seen.push(w.stage); if (i % 30 === 0) spent.push(w.spent); }
  assert(p.built, `not built after 6 hours (${w.wait})`);
  assert(seen.join() === 'survey,earth,pave,fit,open', `stages ran ${seen.join()}`);
  const half = spent[Math.floor(spent.length / 2)];
  assert(half > w.cost * 0.2 && half < w.cost * 0.9, `halfway through, ${U.money(half)} of ${U.money(w.cost)} had been spent`);
  assert(Math.abs(3000 - S.budget - w.cost) < 0.5, `spent ${U.money(3000 - S.budget)} for a ${U.money(w.cost)} apron`);
});
test('builder: construction stops when materials run out, and goes on when lorries bring more', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const ap = S.byId[S.story.cap]; S.budget = 3000;
  ap.mat = { asph: 0, conc: 8, steel: 0 };
  const c = IC.aptLocal(ap, 4, -5.5), p = IC.aptPlanPart(S, ap, 'apron', c.x, c.y, ap.rwyA, 4, 1.3), w = ap.works.find(x => x.part === p);
  let stalled = null;
  for (let i = 0; i < 8 * 3600 && !p.built; i++) {
    tick(S, 1);
    if (!stalled && w.wait && /concrete/.test(w.wait)) stalled = { prog: w.prog, i, why: w.wait };
    if (stalled && i === stalled.i + 120) assert(w.prog === stalled.prog || !/concrete/.test(w.wait), 'work went on without concrete');
  }
  assert(stalled, 'the work never ran short of concrete');
  assert(/lorries|ordered/.test(stalled.why), `the reason does not say where concrete comes from: ${stalled.why}`);
  assert(p.built, `lorries never brought enough concrete: ${w.wait}`);
});
test('builder: an airport can be founded at another city after a site survey', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 }); IC.S = S;
  S.budget = 5000;
  const t = townWithSite(S); assert(t, 'no site near any town');
  const sv = IC.foundSurvey(S, t.p.x, t.p.y, IC.PREVAIL);
  assert(sv.cost >= IC.FOUND_COST && IC.foundLines(S, sv).length >= 3, 'no survey of the site');
  S.mode2 = { kind: 'found' };
  IC.clickWorld(t.p, 0);
  assert(S.mode2.site, 'the first click did not pick the site');
  const aim = { x: t.p.x + Math.cos(IC.PREVAIL) * 20, y: t.p.y + Math.sin(IC.PREVAIL) * 20 };
  IC.clickWorld(aim, 0);
  const ap = IC.bases(S).find(b => b.template === 'new');
  assert(ap, 'the second click did not found the airport');
  assert(Math.abs(U.angWrap(ap.rwyA - IC.foundAngle(t.p, aim))) < 1e-6, 'the runway heading is not the one chosen');
  assert(IC.aptPlanRunway(S, ap, IC.aptLocal(ap, -12, 0), IC.aptLocal(ap, 12, 0)), 'could not plan its runway');
  for (let i = 0; i < 4 * 3600 && !(ap.mat.conc > 0); i++) tick(S, 1);
  assert(ap.mat.conc > 0, 'no concrete arrived by road');
  const cards = S.camp.cards.length;
  finishWorks(S, ap);
  assert(S.camp.cards.slice(cards).some(c => /opens/.test(c.title)), 'the new runway opened without a card');
});
test('builder: heavy aircraft wear out asphalt; reinforced concrete craters less', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 10 });
  const ap = S.byId[S.story.cap], rw = ap.parts.find(p => p.kind === 'runway');
  sky(S, 'clear'); calm(S, ap.rwyA, 5);
  rw.mat = 'asph';
  const d = drive(S, ap, { arr: 20, dep: 20, hours: 0.75, fill: 0.5, mix: [['wide', 1]] });
  assert(rw.wear > 0.02, `wide-bodies on asphalt wore it ${U.pct(rw.wear || 0)} (${d.arr} arrivals, ${d.dep} departures, ${d.div} diversions ${JSON.stringify(d.divWhy)})`);
  rw.wear = 0.6; IC.aptStats(S, ap);
  assert(ap.st.warn.some(w => /worn/.test(w)) && IC.aptRepairList(ap).some(it => /Resurface/.test(it.label)), 'worn pavement is not reported or repairable');
  rw.mat = 'conc'; rw.wear = 0;
  drive(S, ap, { arr: 20, dep: 20, hours: 0.5, fill: 0.5, mix: [['wide', 1]] });
  assert(!rw.wear, 'concrete wore under wide-bodies');
  const hole = mat => { rw.mat = mat; rw.craters = []; const q = IC.rwAt(rw, 0.3); IC.aptHit(S, ap, q.x, q.y, 60, { d: { code: 'TEST' } }); return rw.craters[0].r; };
  const a = hole('asph'), r = hole('rconc');
  assert(r < a * 0.8, `reinforced concrete crater ${r.toFixed(2)} against asphalt ${a.toFixed(2)}`);
});
test('builder: a very heavy military aircraft parks on an open ramp, and dies more easily there than in a shelter', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 8 }); IC.S = S;
  const ab = IC.bases(S).find(b => b.kind === 'airbase' && b.template === 'mil_full'); S.budget = 5000;
  const P = (x, y) => IC.aptLocal(ab, x, y);
  S.mode2 = IC.bldMode(S, ab, 'ramp');
  for (const q of [P(10.8, -1.75), P(13.6, -3.1), P(13.6, -3.1)]) IC.clickWorld(q, 0);
  const ramp = ab.parts.find(p => p.ramp);
  assert(ramp, 'no ramp planned');
  finishWorks(S, ab);
  S.mode2 = IC.bldMode(S, ab, 'stand'); S.mode2.size = 'xl';
  IC.clickWorld(P(12.2, -2.45), 0);
  assert(ramp.free.length === 1, 'no stand placed on the ramp');
  IC.aptStats(S, ab);
  const stand = IC.aptStands(ab).find(s => s.ramp);
  assert(stand && stand.size === 'xl' && stand.linked, `the ramp stand is ${stand ? (stand.linked ? stand.size : 'not connected') : 'missing'}`);
  const r = { id: 'rheavy', name: 'Test transport', kind: 'cargo', base: ab.id, st: 'ready', n: 1, park: 'open' };
  // the other aprons are full
  for (const s of IC.aptStands(ab)) if (!s.ramp) s.occ = 'full';
  S.roster.push(r); IC.assignSlots(S, ab);
  assert(r.slot === stand.id, `parked on ${r.slot}, not the ramp stand`);
  const has = ab.parts.find(p => p.kind === 'has');
  const losses = slot => { let n = 0; for (let i = 0; i < 200; i++) { r.st = 'ready'; r.slot = slot; stand.hp = 1; has.hp = has.max; const pp = IC.parkPos(S, ab, r); IC.aptHit(S, ab, pp.x, pp.y, 30, { d: { code: 'TEST' } }); if (r.st === 'lost') n++; } return n; };
  const open = losses(stand.id), shel = losses(has.id);
  assert(open > shel * 3 && open > 100, `lost ${open} of 200 in the open, ${shel} in a shelter`);
});
test('builder: a part planned over houses clears them, pays compensation and costs public support', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  S.budget = 5000;
  const t = townWithSite(S); assert(t, 'no site near any town');
  const ap = IC.foundAirport(S, t.p.x, t.p.y, IC.PREVAIL);
  const home = t.c.blocks.filter(b => b.hp > 0 && U.dist(b, ap) < ap.buildR - 5).sort((a, b) => U.dist(a, ap) - U.dist(b, ap))[0];
  assert(home, 'no homes near the new airport');
  const n0 = t.c.blocks.length, sup = S.support, bud = S.budget;
  const p = IC.aptPlanPart(S, ap, 'apron', home.x, home.y, ap.rwyA, 3, 2);
  assert(p, 'could not plan the apron over the homes');
  const w = ap.works.find(x => x.part === p);
  assert(w.stages[0].k === 'demo' && w.stages[0].cost > 0, 'demolition is not the first stage');
  assert(S.support < sup, 'public support did not drop');
  for (let i = 0; i < 3 * 3600 && w.si < 1; i++) tick(S, 1);
  assert(!t.c.blocks.includes(home) && t.c.blocks.length < n0, 'the homes are still standing');
  assert(S.worldDirty && S.worldDirty.length, 'the map was not told');
  assert(bud - S.budget >= w.stages[0].cost - 0.01, `paid ${U.money(bud - S.budget)}, compensation is ${U.money(w.stages[0].cost)}`);
});

test('builder: a KDEN-scale airport built by hand in under 200 clicks handles its rated traffic', () => {
  const { buildKden, finishAll } = require('../kdenbuild.js');
  const { S, ap, actions } = buildKden(12345, true);
  assert(actions < 200, `${actions} actions`);
  finishAll(S, ap);
  sky(S, 'clear'); calm(S, -Math.PI / 2, 12); ap.cfg = null;
  const st = IC.aptStats(S, ap), stands = IC.aptStands(ap);
  assert(st.rwy.length === 6 && stands.length >= 150 && stands.every(s => s.linked), `${st.rwy.length} runways, ${stands.length} stands, ${stands.filter(s => !s.linked).length} cut off`);
  assert(st.movesPerHour >= 150 && !st.warn.length, `rated ${st.movesPerHour} movements an hour; ${st.warn.join(' ')}`);
  const at = {}, t0 = S.time;
  const r = drive(S, ap, { follow: true, hours: 2, fill: 0.7, each: S => { for (const h of [1, 2]) if (!at[h] && S.time >= t0 + h * 3600 - 1) at[h] = (ap.kpi.arr || 0) + (ap.kpi.dep || 0); } });
  const rated = IC.aptStats(S, ap).movesPerHour;
  assert(r.grid === 0 && r.stuck === 0, `${r.grid} gridlocks, ${r.stuck} stranded`);
  assert(at[2] - at[1] >= rated * 0.8, `second hour: ${at[2] - at[1]} movements against ${rated} rated`);
  console.log(`        ${actions} actions; ${stands.length} stands; rated ${rated} movements an hour, flew ${at[2] - at[1]} in the second hour`);
}, true);

/* ---------- airspace ---------- */
/* switch off every radar controllers could use: the civil radars and the approach radars at the airports */
const blind = S => {
  S.units = S.units.filter(u => u.type !== 'ssr');
  for (const b of IC.bases(S)) for (const p of b.parts || []) if (p.kind === 'atc') p.hp = 0;
  IC.step(S, 0.5); S.asp.scanT = 0; IC.step(S, 0.5);
};
/* a point d units from p, on the side away from the map edge */
const off = (p, a, d) => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
const pair = (S, c, alt) => {
  // two airliners 40 km apart, flying head on at the same height, 60 km from the capital
  const m = off(c, 0.4, 600), a = off(m, 0, 200), b = off(m, Math.PI, 200);
  const mk = (p, q, cs) => IC.spawnThreat(S, 'civ', p.x, p.y, { dest: off(q, Math.atan2(q.y - p.y, q.x - p.x), 3000), wps: [off(q, Math.atan2(q.y - p.y, q.x - p.x), 3000)], orig: { x: p.x, y: p.y, edge: true }, cs, sq: IC.squawk(), alt, cruise: alt, pax: 100, plan: null, route: [q], aim: q });
  return [mk(a, b, 'TST 101'), mk(b, a, 'TST 202')];
};
test('airspace: airliners fly direct without airways and follow them once drawn', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  const cap = S.byId[S.story.cap], reg = S.byId[S.story.reg];
  const A = { x: cap.x, y: cap.y, apt: cap.id }, B = { x: reg.x, y: reg.y, apt: reg.id };
  assert(IC.avPath(S, A, B).pts.length === 2, 'expected a direct route with no airways');
  // a dog-leg airway: out to one side of the direct line and back
  const dx = reg.x - cap.x, dy = reg.y - cap.y, L = Math.hypot(dx, dy), nx = -dy / L * 300, ny = dx / L * 300;
  const f1 = IC.aspAddFix(S, cap.x + dx * 0.25 + nx, cap.y + dy * 0.25 + ny), f2 = IC.aspAddFix(S, cap.x + dx * 0.75 + nx, cap.y + dy * 0.75 + ny);
  assert(f1 && f2 && IC.aspAddWay(S, f1.id, f2.id), 'could not draw the airway');
  const p = IC.avPath(S, A, B);
  assert(p.net && p.pts.some(q => q.fix === f1.id) && p.pts.some(q => q.fix === f2.id), 'route does not use the airway');
  // and a real flight flies it
  let near1 = 1e9, near2 = 1e9, seen = null;
  for (let i = 0; i < 12 * 7200 && near2 > 20; i++) {
    IC.step(S, 0.5);
    // the first one to take off after the airway is published
    for (const t of S.threats) if (t.tail && !t.dead && t.toApt === reg.id && U.dist(t.orig, cap) < 5 && (seen || t.flown < 30)) { seen = seen || t; if (t === seen) { near1 = Math.min(near1, U.dist(t, f1)); near2 = Math.min(near2, U.dist(t, f2)); } }
  }
  assert(seen, 'no flight from the capital to the regional airport');
  assert(near1 < 20 && near2 < 20, `the flight missed the fixes (${near1.toFixed(0)}, ${near2.toFixed(0)} units)`);
}, true);
test('airspace: flights outside radar coverage are spaced wider', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  IC.step(S, 0.5); IC.step(S, 0.5);
  const cap = S.byId[S.story.cap], from = { x: cap.x, y: cap.y, apt: cap.id }, to = off(cap, 1, 3000);
  const gapOf = () => { S.asp.dep = {}; IC.aspRelease(S, from, to); return IC.aspRelease(S, from, to); };
  const withRadar = gapOf();
  blind(S);
  const without = gapOf();
  assert(withRadar > 0, 'a second departure the same way was released at once');
  assert(without >= withRadar * 3, `outside radar the spacing should be much wider (${withRadar} s → ${without} s)`);
});
test('airspace: a loss of separation produces an incident', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  blind(S);
  const [a, b] = pair(S, IC.cap(S), 9.5);
  let lost = false;
  IC.on((S2, type, d) => { if (S2 === S && (type === 'lossSep' || type === 'nearMiss') && (d.a === a || d.b === a)) lost = true; });
  for (let i = 0; i < 400 && !lost; i++) IC.step(S, 0.5);
  assert(lost, 'no loss of separation recorded');
  assert(S.inc.list.some(it => (it.kind === 'separation' || it.kind === 'nearmiss') && (it.ref === a || it.ref === b)), 'no incident raised');
});
test('airspace: controllers keep apart flights they can see', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 });
  run(S, 0.02);
  const cap = IC.cap(S), [a, b] = pair(S, cap, 9.5);
  let minD = 1e9, minZ = 1e9, lost = false;
  IC.on((S2, type, d) => { if (S2 === S && (type === 'lossSep' || type === 'nearMiss') && (d.a === a || d.b === a)) lost = true; });
  for (let i = 0; i < 400; i++) { IC.step(S, 0.5); if (U.dist(a, b) < 90) minZ = Math.min(minZ, Math.abs(a.alt - b.alt)); minD = Math.min(minD, U.dist(a, b)); }
  assert(minD < 40, 'the test flights never met');
  assert(!lost, `separation was lost under radar (${minZ.toFixed(2)} km apart vertically)`);
});
test('airspace: light aircraft avoid controlled airspace unless cleared', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 9 });
  const cap = IC.cap(S), ap = S.byId[S.story.cap];
  // across the capital from one side to the other, 60 km out, where the terminal area is 45 km
  const A = off(ap, 0.3, 600), B = off(ap, 0.3 + Math.PI, 600);
  const fly = (a, b, o) => {
    const t = IC.gaLaunch(S, a, b, Object.assign({ xpdr: true, alt: 1.8 }, o)), zones = new Set();
    let inc = false;
    for (let i = 0; i < 12000 && !t.dead; i++) {
      IC.step(S, 0.5);
      const z = IC.aspZoneAt(S, t.x, t.y, t.alt); if (z && t.alt > 0.2) zones.add(z.z.ap.id + ':' + z.kind);
      inc = inc || S.inc.list.some(it => it.kind === 'infringe' && it.ref === t);
    }
    return { t, zones, inc };
  };
  const ok = fly(A, B, {});
  assert(ok.t.dead, 'the light aircraft never arrived');
  assert(!ok.zones.size, `a careful pilot entered controlled airspace: ${[...ok.zones]}`);
  const home = fly(A, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, {});
  assert(home.zones.has(ap.id + ':ctr'), 'a light aircraft cleared to land at the capital never entered its control zone');
  const bad = fly(A, B, { careless: true });
  assert(bad.zones.size && bad.inc, 'a careless pilot crossed the capital without an infringement incident');
}, true);

/* ---------- growth, trade and roads ---------- */
/* the economy alone, a five-minute tick at a time (flights are not flown; demand follows the timetable) */
const econDays = (S, days) => { for (let i = 0; i < days * 288; i++) { S.time += 300; S.econ.tickT = 0; IC.growth(S, 300); } };
const secondApt = S => S.infra.filter(i => i.kind === 'airport')[1];
test('growth: better service raises demand and city growth over a few game days', () => {
  const games = [0, 1].map(k => {
    const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
    const ap = secondApt(S), c = S.byId[ap.city];
    if (k) {
      const al = S.av.airlines.find(a => a.kind === 'budget'), ports = S.world.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b);
      for (const p of ports.slice(0, 3)) IC.avAddRoute(S, al, ap, p, 'narrow', 2, true);
    }
    IC.econRefresh(S);
    const d0 = c.air.demand, p0 = c.popF;
    econDays(S, 3);
    return { S, c, ap, d0, p0 };
  });
  const [poor, good] = games;
  assert(good.d0 > poor.d0 * 1.1, `more flights did not raise demand: ${Math.round(good.d0)} vs ${Math.round(poor.d0)} passengers a day`);
  assert(good.c.popF > poor.c.popF, `the better-served city did not grow faster: ${good.c.popF.toFixed(1)}k vs ${poor.c.popF.toFixed(1)}k`);
  assert(good.c.popF > good.p0, 'the well-served city did not grow');
  assert(good.c.air.demand > good.d0, 'demand did not rise as the city grew');
  assert(/Grew/.test(IC.cityReport(good.S, good.c).growth), 'the city panel does not say it grew');
});
test('growth: a remote industry with an air cargo link out-produces one without', () => {
  const out = [0, 1].map(k => {
    const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
    IC.econRefresh(S);
    // the industry closest to an airport, and that airport
    const best = S.econ.inds.map(i => { const ap = S.infra.filter(a => a.kind === 'airport').sort((a, b) => IC.econTime(S, i, a) - IC.econTime(S, i, b))[0]; return { i, ap, t: IC.econTime(S, i, ap) }; }).sort((a, b) => a.t - b.t)[0];
    for (const r of S.av.routes) if (r.a === best.ap.id || (r.b.apt === best.ap.id)) r.st = 'cut';
    if (k) { const al = S.av.airlines.find(a => a.kind === 'cargo'), port = S.world.airways.find(w => w.kind === 'intl'); IC.avAddRoute(S, al, best.ap, port.b.k === 'H' ? port.a : port.b, 'cargo', 2, true); }
    IC.econRefresh(S);
    return { S, ind: best.i, v: best.i.out, t: best.t };
  });
  assert(out[0].t < 3 * 3600, `no industry within 3 h of an airport (${U.dur(out[0].t)})`);
  assert(out[1].v > out[0].v * 1.15, `the air cargo link made little difference: ${out[1].v.toFixed(3)} vs ${out[0].v.toFixed(3)} ₭M/h`);
  assert(IC.indWhy(out[1].S, out[1].ind).some(l => /air cargo/.test(l)), 'the explanation does not mention air cargo');
});
test('growth: a road the player builds joins the routing graph and shortens a trip', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  S.budget = 5000;
  IC.econRefresh(S);
  const W = S.world, cs = IC.cities(S);
  // two cities whose trip is long for the distance, with a clear straight line between them
  let pick = null;
  for (const a of cs) for (const b of cs) {
    if (a.id >= b.id) continue;
    const d = U.dist(a, b); if (d < 250 || d > 900) continue;
    const t = IC.tripTime(S, a, b), direct = d * 360 / IC.ROAD_KMH.hw;
    const P = IC.roadPlan(S, 'hw', [a, b], [{ node: a.id }, { node: b.id }]);
    if (!P.why && t > direct * 1.3 && (!pick || t / direct > pick.r)) pick = { a, b, t, r: t / direct };
  }
  assert(pick, 'no city pair where a new road would help');
  const edges0 = W.edges.length;
  const w = IC.roadFinish(S, { cls: 'hw', pts: [{ x: pick.a.x, y: pick.a.y }, { x: pick.b.x, y: pick.b.y }], snaps: [{ x: pick.a.x, y: pick.a.y, node: pick.a.id }, { x: pick.b.x, y: pick.b.y, node: pick.b.id }] });
  assert(w && S.econ.works.length === 1, 'the works did not start');
  for (let h = 0; h < w.hours + 2 && S.econ.works.length; h++) { S.time += 3600; IC.growth(S, 3600); }
  assert(!S.econ.works.length && W.edges.length === edges0 + 1, 'the road never opened');
  const e = W.edges[W.edges.length - 1];
  assert(W.roadIdx[e.a] != null && W.roadIdx[e.b] != null, 'the new road is not in the routing graph');
  const t1 = IC.tripTime(S, pick.a, pick.b);
  assert(t1 < pick.t * 0.85, `the trip did not get shorter: ${U.dur(t1)} vs ${U.dur(pick.t)}`);
  const r = IC.route(pick.a.x, pick.a.y, pick.b.x, pick.b.y);
  assert(IC.routeLength(r) < U.dist(pick.a, pick.b) * 1.2, 'convoys do not use the new road');
  assert(S.worldDirty && S.worldDirty.length, 'the world was not told the road changed');
});
test('growth: a crater on a motorway cuts the link between two cities until it is repaired', () => {
  // a map where the detour round the crater is long enough to show in the city panel (the world look changed
  // the roads on seed 777: there a parallel road now keeps the detour short)
  const S = IC.newGame({ seed: 99, mode: 'story', hour: 7 });
  IC.econRefresh(S);
  const W = S.world, cap = IC.cap(S);
  // the nearest city reached from the capital by motorway, and the longest motorway piece on that trip
  const T = IC.travelFrom(W, cap.id, false);
  const far = IC.cities(S).filter(c => !c.capital && IC.travelPath(T, c.id).some(e => e.cls === 'hw' && e.len > 40)).sort((a, b) => T.t[a.id] - T.t[b.id])[0];
  assert(far, 'no city reached by motorway');
  const e = IC.travelPath(T, far.id).filter(x => x.cls === 'hw').sort((a, b) => b.len - a.len)[0];
  const p = e.pts[e.pts.length >> 1], q = e.pts[(e.pts.length >> 1) - 1] || e.pts[0], mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const t0 = IC.tripTime(S, cap, far), trade0 = far.rc;
  IC.detonate(S, mid.x, mid.y, 150, {});
  assert(e.cut, 'the crater did not cut the motorway');
  IC.econRefresh(S);
  const t1 = IC.tripTime(S, cap, far);
  assert(t1 > t0 * 1.15, `the trip did not get longer: ${U.dur(t1)} vs ${U.dur(t0)}`);
  assert(far.rc < trade0 * 0.97, 'trade did not fall');
  const rep = IC.cityReport(S, far);
  assert(rep.cuts.some(l => /Motorway cut/.test(l) && /instead of/.test(l)), `the city panel does not explain the cut: ${rep.cuts.join(' / ')}`);
  for (let h = 0; h < 48 && e.cut; h++) { S.time += 900; IC.growth(S, 900); }
  assert(!e.cut, 'engineers never reopened the motorway');
  IC.econRefresh(S);
  assert(IC.tripTime(S, cap, far) < t0 * 1.01, 'the trip is still long after the repair');
});
test('growth: a well-connected city adds blocks over a few game days; a cut-off one does not', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  IC.econRefresh(S);
  const cap = IC.cap(S), lone = IC.cities(S).filter(c => c.air.score === 0).sort((a, b) => b.pop - a.pop)[0];
  const n0 = cap.blocks.length, s0 = cap.streets.length, l0 = lone ? lone.blocks.filter(b => !b.empty).length : 0;
  econDays(S, 4);
  const added = cap.blocks.filter(b => b.grown);
  assert(added.length >= 5 && cap.blocks.length === n0 + added.length, `the capital added only ${added.length} blocks in four days`);
  assert(cap.streets.length > s0, 'no new streets');
  assert(added.every(b => IC.inHome(b.x, b.y) && !S.world.inLake(b.x, b.y)), 'a block was built in a lake or abroad');
  if (lone) assert(lone.blocks.filter(b => !b.empty).length <= l0, `${lone.name}, with no air service, still grew`);
  assert(S.worldDirty.length, 'the world was not told about the new blocks');
});
test('growth: the weekly statement adds up to the change in the treasury', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  const b0 = S.budget;
  IC.takeLoan(S, 0);
  run(S, 2, player);
  const st = IC.weekStatement(S, 0);
  assert(Math.abs(st.net - (S.budget - b0)) < 0.5, `statement net ${st.net.toFixed(1)} vs treasury change ${(S.budget - b0).toFixed(1)}`);
  assert(st.lines.some(l => l.k === 'fee_pax') && st.lines.some(l => l.k === 'loan'), 'fees or loan repayments missing from the statement');
});

/* ---------- supply and money ---------- */
/* a quick-war game with the enemy kept quiet, the magazines as they start */
const supplyGame = seed => { const S = IC.newGame({ seed: seed || 12345, mode: 'campaign' }); S.enemy.allow = new Set(); S.enemy.warT = 1e12; return S; };
const onRoad = (S, x, y) => S.world.edges.some(e => { for (let i = 1; i < e.pts.length; i++) if (U.segDist(x, y, e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y) < 0.6) return true; return false; });
test('supply: a unit bought and placed arrives and is ready within 45 game minutes', () => {
  const S = supplyGame();
  S.reserve.mrsam = 0; S.budget = 1000;
  const c = IC.cap(S), spot = IC.findSpot(S, 'mrsam', c.x, c.y, 250, 400);
  const b0 = S.budget, u = IC.deploy(S, 'mrsam', spot.x, spot.y);
  assert(u, 'could not buy and place the battery');
  assert(Math.abs(b0 - S.budget - IC.unitCost(S, 'mrsam')) < 0.01, 'the battery was not paid for when placed');
  let t = 0;
  while (u.state !== 'ready' && t < 3 * 3600) { IC.step(S, 0.5); t += 0.5; }
  assert(u.state === 'ready', `still ${u.state} after 3 h`);
  assert(t <= 45 * 60, `ready only after ${U.dur(t)}`);
  assert(U.dxy(u.x, u.y, spot.x, spot.y) < 1, 'it is not where it was placed');
  const st = IC.weekStatement(S, 0);
  assert(st.lines.some(l => l.k === 'buyUnits'), 'the purchase is not on the statement');
});
/* a battery with an empty reserve, some distance from the depot */
function lowBattery(S, dmin, dmax) {
  const dep = IC.depots(S).find(d => d.central);
  const spot = IC.findSpot(S, 'shorad', dep.x, dep.y, dmin, dmax);
  const u = IC.makeUnit(S, 'shorad', spot.x, spot.y, { instant: true });
  for (const m of u.mags) { m.mag = 2; m.store = 0; }
  return { dep, u, m: u.mags[0] };
}
test('supply: a battery low on missiles is resupplied by a convoy seen on the road', () => {
  const S = supplyGame();
  const { u, m } = lowBattery(S, 900, 1400);
  let v = null, seenOnRoad = false, t = 0;
  while (t < 6 * 3600 && m.store < m.storeMax) {
    IC.step(S, 0.5); t += 0.5;
    const j = S.jobs.find(x => x.mag === m && x.v);
    if (j) { v = j.v; if (v.state === 'toDest' && onRoad(S, v.x, v.y)) seenOnRoad = true; }
  }
  assert(v, 'no convoy was sent');
  assert(m.store >= m.storeMax, `reserve only ${m.store}/${m.storeMax} after ${U.dur(t)}`);
  assert(seenOnRoad, 'the convoy never drove on a road');
  assert(IC.nextLoad(S, u, m).text === 'Full.', 'the panel does not say it is full');
});
test('supply: a cut road delays resupply, and the battery panel says why', () => {
  const S = supplyGame();
  const { dep, u, m } = lowBattery(S, 900, 1400);
  const clear = IC.driveTime(S, dep, u).t;
  // craters on every road into the junction where convoys leave the road for the battery
  const r = IC.route(dep.x, dep.y, u.x, u.y, true), n = r[r.length - 2];
  for (const e of S.world.edges) if (e.pts.some(p => U.dxy(p.x, p.y, n.x, n.y) < 3)) { e.cut = true; e.cond = 0.2; e.cutName = `${e.cls === 'hw' ? 'Motorway' : 'Road'} cut near ${u.name}`; }
  IC.roadsChanged(S);
  const cut = IC.driveTime(S, dep, u);
  assert(cut.t > clear * 1.1, `the cut costs no time (${U.dur(clear)} → ${U.dur(cut.t)})`);
  let said = '';
  for (let t = 0; t < 2 * 3600 && !said; t += 0.5) {
    IC.step(S, 0.5);
    const n = IC.nextLoad(S, u, m);
    if (/detour/.test(n.text) && /cut near/.test(n.text)) said = n.text;
  }
  assert(said, `the panel never said why the load is late: "${IC.nextLoad(S, u, m).text}"`);
});
test('money: the money panel adds up to the change in the treasury', () => {
  const S = supplyGame();
  const b0 = S.budget;
  IC.takeLoan(S, 0);
  const c = IC.cap(S), spot = IC.findSpot(S, 'shorad', c.x, c.y, 250, 400);
  S.reserve.shorad = 0; IC.deploy(S, 'shorad', spot.x, spot.y);
  IC.buyStock(S, 'SR', 16);
  IC.startResearch(S, IC.TECH.find(t => !t.req.length && !S.tech.done.has(t.id)).id);
  run(S, 3);
  const st = IC.weekStatement(S, 0);
  const sum = st.lines.reduce((s, l) => s + l.v, 0);
  assert(Math.abs(sum - (S.budget - b0)) < 0.5, `lines add to ${sum.toFixed(1)}, the treasury changed ${(S.budget - b0).toFixed(1)}`);
  for (const k of ['buyUnits', 'buyMun', 'research', 'loanIn', 'upAD', 'base']) assert(st.lines.some(l => l.k === k), `no "${IC.STATEMENT[k]}" line`);
  const other = st.lines.find(l => l.k === 'other');
  assert(!other || Math.abs(other.v) < 1, `unexplained spending: ${other && other.v.toFixed(1)}`);
  const M = IC.money(S);
  assert(Math.abs(M.net - (S.income - S.upkeep)) < 0.01, 'the hourly lines do not add up to the hourly balance');
  assert(M.inc.concat(M.out).every(l => l.why && l.name), 'a money line has no name or no reason');
});
test('money: a warning comes before the money runs out', () => {
  // Act I of the Career: a small grant, and two long-range batteries it cannot pay for
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  for (let i = 0; i < 2; i++) { const c = IC.cap(S), p = IC.findSpot(S, 'lrsam', c.x, c.y, 300, 700); IC.makeUnit(S, 'lrsam', p.x, p.y, { instant: true }); }
  let warned = -1, empty = -1;
  for (let t = 0; t < 12 * 3600 && empty < 0; t += 0.5) {
    IC.step(S, 0.5);
    if (warned < 0 && S.logs.some(l => l.tag === 'TREASURY' && /runs out/.test(l.msg))) warned = t;
    if (S.budget <= 0) empty = t;
  }
  assert(warned >= 0, 'no warning');
  assert(empty < 0 || empty - warned > 1800, `warned only ${U.dur(empty - warned)} before the money ran out`);
});

/* ---------- modes ---------- */
test('damage: a weapon landing on a city block damages that block, not the one across the street', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 10 });
  const cap = IC.cap(S), b = cap.blocks.filter(q => q.core)[2];
  const other = cap.blocks.filter(q => q !== b && U.dist(q, b) > 12)[0];
  IC.detonate(S, b.x, b.y, 120, null);
  assert(b.hp <= 0, `the block that was hit is still standing (hp ${b.hp})`);
  assert(other.hp === 1, 'a block 1.2 km away was damaged');
  assert(!S.marks.some(m => m.kind === 'field' || m.kind === 'road'), 'a hit on a building left a crater in a field or road');
  // a small rocket damages the block it lands on without flattening it
  const c = cap.blocks.filter(q => q.hp === 1 && !q.core)[5];
  IC.detonate(S, c.x, c.y, 14, null);
  assert(c.hp < 1 && c.hp > 0, `a rocket on a house should damage it (hp ${c.hp})`);
});
test('damage: a crater in a field fades after a day or two; one in a road stays until it is filled', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 10 });
  const W = S.world, cap = IC.cap(S);
  let fp = null;
  for (let a = 0; a < 6.28 && !fp; a += 0.1) { const x = cap.x + Math.cos(a) * cap.r * 1.7, y = cap.y + Math.sin(a) * cap.r * 1.7; if (IC.groundAt(S, x, y).kind === 'field') fp = { x, y }; }
  const e = W.edges.find(e => e.cls === 'rd'), rp = e.pts[Math.floor(e.pts.length / 2)];
  IC.detonate(S, fp.x, fp.y, 120, null);
  IC.detonate(S, rp.x, rp.y, 120, null);
  const field = S.marks.find(m => m.kind === 'field'), road = S.marks.find(m => m.kind === 'road');
  assert(field && U.dxy(field.x, field.y, fp.x, fp.y) < 0.01, 'no mark where the weapon hit the field');
  assert(road && road.cls === 'rd', 'no crater in the main road');
  const age = h => { for (let t = 0; t < h * 3600; t += 60) { S.time += 60; IC.growth(S, 60); IC.marksAge(S); } };
  age(1);
  assert(!road.fixed, 'the road crater was filled at once');
  age(11);
  assert(S.marks.includes(field), 'the scorch in the field faded within 12 hours');
  age(12);
  assert(road.fixed && !S.econ.damaged.includes(e.id), 'the road crater was not filled within a day');
  age(24);
  assert(!S.marks.includes(field), 'the field still shows the crater after two days');
  assert(S.marks.includes(road), 'the patch in the road disappeared too soon');
});

test('world: a change to the world is recorded for the map to redraw', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 10 });
  const c = IC.cap(S), b = { x0: c.x - 5, y0: c.y - 5, x1: c.x + 5, y1: c.y + 5 };
  IC.worldChanged(S, b);
  assert(S.worldDirty && S.worldDirty.includes(b), 'IC.worldChanged did not record the box');
});

test('radar: a military radar does not see a low aircraft behind a hill that it sees over flat ground', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 10 });
  const W = S.world, D = 300;
  // a radar site next to high ground: at 30 km some bearings are behind the hill, others over flat ground
  let at = null;
  for (let j = 200; j < IC.WH - 200 && !at; j += 97) for (let i = 200; i < IC.WW - 200 && !at; i += 97) {
    if (!W.inHome(i, j) || W.inLake(i, j)) continue;
    let hid = null, open = null;
    for (let a = 0; a < 6.28; a += 0.05) {
      const x = i + Math.cos(a) * D, y = j + Math.sin(a) * D;
      if (!W.inHome(x, y) || Math.abs(IC.elevKm(x, y) - IC.elevKm(i, j)) > 0.1) continue;
      const clear = IC.losClear(i, j, 25, x, y, 0.1);
      if (!clear && !hid && !IC.losClear(i, j, 25, x, y, 0.6)) hid = { x, y };
      if (clear && !open && [0.25, 0.5, 0.75].every(f => IC.elevKm(i + (x - i) * f, j + (y - j) * f) <= IC.elevKm(i, j) + 0.02)) open = { x, y };
    }
    if (hid && open) at = { x: i, y: j, hid, open };
  }
  assert(at, 'no valley next to a hill found');
  S.units = []; for (const b of IC.bases(S)) b.parts = b.parts.filter(p => p.kind !== 'atc');
  const u = IC.makeUnit(S, 'gf', at.x, at.y, { instant: true, full: true }); u.radarOn = true;
  const t = IC.spawnThreat(S, 'lacm', at.open.x, at.open.y, { route: [{ x: at.x, y: at.y }], aim: { x: at.x, y: at.y } });
  const sees = (p, alt) => { t.x = p.x; t.y = p.y; t.alt = alt; IC.sense(S, 0.25); return S.sensors.some(s => s.unit === u && IC.detects(s, t)); };
  assert(sees(at.open, 0.1), 'the gap filler does not see a cruise missile at 100 m over flat ground 30 km away');
  assert(!sees(at.hid, 0.1), 'the gap filler sees a cruise missile at 100 m behind a hill');
  assert(sees(at.hid, 3), 'the gap filler does not see an aircraft at 3 km above the same hill');
  const floor = IC.radarFloor(S.sensors.find(s => s.unit === u), at.hid.x, at.hid.y);
  assert(floor > 0.1 && IC.milCov(S).g.some(v => v > 0.5 && v < Infinity), `the coverage map does not show the hole behind the hill (floor ${floor})`);
});

test('career: Act I runs with airline traffic', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  run(S, 8, player);
  assert(!S.over, `game ended: ${S.over}`);
  assert(S.av.flightsTotal > 40, `too few flights: ${S.av.flightsTotal}`);
  assert(S.av.paxTotal > 5000, `too few passengers: ${S.av.paxTotal}`);
  assert(S.story.goals.some(g => g.done), 'no goal completed');
}, true);
test('career: every act can be reached', () => {
  const S = IC.newGame({ seed: 2024, mode: 'story', hour: 7 });
  for (const n of [2, 3, 4]) { IC.storyStartAct(S, n); run(S, 3, player); assert(!S.over, `act ${n} ended the game: ${S.over}`); assert(S.story.act >= n, `stuck before act ${n}`); }
}, true);
test('quick war: the enemy attacks and the defense fights', () => {
  const S = IC.newGame({ seed: 12345, mode: 'campaign' });
  run(S, 10);
  assert(S.enemy.war, 'war never started');
  assert(S.stats.kills > 0 && S.stats.fired > 0, `no fighting: ${JSON.stringify(S.stats)}`);
}, true);
test('sandbox: runs four hours', () => {
  const S = IC.newGame({ seed: 99, mode: 'sandbox' });
  run(S, 4);
  assert(S.threats.length >= 0 && S.time > 9 * 3600, 'did not advance');
}, true);

/* ---------- Academy ---------- */
for (const L of IC.LESSONS) test(`academy: ${L.id} lesson can be completed`, () => {
  const r = playLesson(L.id, true);
  const S = r.S;
  assert(r.won, `not finished (step ${r.step}${r.over ? ', ' + r.over : ''})\n        roster: ${S.roster.map(x => x.name + ':' + x.st).join(' ')}\n        air: ${S.air.map(a => a.name + ':' + a.state + ':' + (a.mission && a.mission.type)).join(' ')}\n        weather: ${S.weather.kind}\n        last log:\n          ${S.logs.slice(0, 12).map(l => U.hhmm(l.t) + ' ' + l.tag + ' ' + l.msg).join('\n          ')}`);
}, true);

/* ---------- run ---------- */
let pass = 0, fail = 0;
const t00 = Date.now();
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  if (quick && t.slow) continue;
  const t0 = Date.now();
  try { t.fn(); pass++; console.log(`  ok    ${t.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { fail++; console.log(`  FAIL  ${t.name}\n        ${e.stack.split('\n').slice(0, 3).join('\n        ')}`); }
}
console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
process.exit(fail ? 1 : 0);
