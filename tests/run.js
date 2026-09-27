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

/* ---------- modes ---------- */
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
