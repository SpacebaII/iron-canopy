/* Iron Canopy test suite. Runs the simulation headless and checks that it behaves.
   node tests/run.js            everything
   node tests/run.js airport    only tests whose name contains "airport"
   node tests/run.js --quick    skip the slow Academy lessons */
const IC = require('../headless.js');
const { playLesson } = require('../academytest.js');
const Q = require('../qwplayer.js');
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
/* how round a city is: its main built-up area (blocks, with the streets between them closed up, the largest
   connected piece) against the smallest circle round it. A disc of blocks scores about 0.8 */
function enclosing(P) {
  let c = { x: 0, y: 0, r: -1 };
  const out = p => U.dxy(p.x, p.y, c.x, c.y) > c.r + 1e-7;
  const two = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: U.dist(a, b) / 2 });
  const three = (a, b, d) => {
    const D = 2 * (a.x * (b.y - d.y) + b.x * (d.y - a.y) + d.x * (a.y - b.y)); if (Math.abs(D) < 1e-12) return two(a, b);
    const A = a.x * a.x + a.y * a.y, B = b.x * b.x + b.y * b.y, C2 = d.x * d.x + d.y * d.y;
    const x = (A * (b.y - d.y) + B * (d.y - a.y) + C2 * (a.y - b.y)) / D, y = (A * (d.x - b.x) + B * (a.x - d.x) + C2 * (b.x - a.x)) / D;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  };
  for (let i = 0; i < P.length; i++) if (c.r < 0 || out(P[i])) {
    c = { x: P[i].x, y: P[i].y, r: 0 };
    for (let j = 0; j < i; j++) if (out(P[j])) { c = two(P[i], P[j]); for (let k = 0; k < j; k++) if (out(P[k])) c = three(P[i], P[j], P[k]); }
  }
  return c;
}
function roundness(blocks) {
  const K = 100000, S = new Set();
  for (const b of blocks) { const ca = Math.cos(b.a), sa = Math.sin(b.a); for (let u = -b.w / 2; u <= b.w / 2 + 1e-9; u += 0.5) for (let v = -b.h / 2; v <= b.h / 2 + 1e-9; v += 0.5) S.add(Math.floor(b.x + u * ca - v * sa) * K + Math.floor(b.y + u * sa + v * ca)); }
  const F = new Set(S);
  for (const k of S) for (const d of [K, 1, K + 1, K - 1]) if (!S.has(k + d) && S.has(k + 2 * d)) F.add(k + d);
  const seen = new Set(); let best = [];
  for (const k of F) {
    if (seen.has(k)) continue;
    const comp = [k]; seen.add(k);
    for (let q = 0; q < comp.length; q++) for (const d of [K, -K, 1, -1, K + 1, K - 1, -K + 1, -K - 1]) { const m = comp[q] + d; if (F.has(m) && !seen.has(m)) { seen.add(m); comp.push(m); } }
    if (comp.length > best.length) best = comp;
  }
  const pts = best.map(k => { const i = Math.round(k / K); return { x: i + 0.5, y: k - i * K + 0.5 }; });
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(U.hash(i, 3) * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return best.length / (Math.PI * (enclosing(pts).r + 0.7) ** 2);
}
test('world: cities are not round', () => {
  // the measure itself: a disc of blocks on a grid scores high
  const disc = [];
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) if (Math.hypot(i, j) < 12) disc.push({ x: i * 4.6, y: j * 4.6, w: 3.9, h: 3.9, a: 0 });
  assert(roundness(disc) > 0.75, `the roundness measure gives a disc only ${roundness(disc).toFixed(2)}`);
  let sum = 0, n = 0;
  for (const seed of [4242, 7, 99]) {
    const W = IC.generate(seed);
    for (const c of W.cities) {
      const r = roundness(c.blocks); sum += r; n++;
      assert(r < 0.7, `seed ${seed}: ${c.name} is nearly round (${r.toFixed(2)})`);
    }
  }
  assert(sum / n < 0.5, `cities are round on average (${(sum / n).toFixed(2)})`);
});
test('world: every map has cities of at least two styles, and districts in every city', () => {
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = IC.generate(seed), styles = new Set(W.cities.map(c => c.style));
    assert(styles.size >= 2, `seed ${seed}: only ${[...styles].join(', ')} cities`);
    assert(W.cities.some(c => c.style === 'eu') && W.cities.some(c => c.style === 'us'), `seed ${seed}: not both European and American cities`);
    assert(W.foreign.filter(f => W.side[f.k] === 'hostile').every(f => f.style === 'east' && f.blocks.length), `seed ${seed}: the enemy's towns are not built to their own plan`);
    for (const c of W.cities) {
      assert(c.blocks.every(b => IC.DISTRICTS[b.d]), `seed ${seed}: a block in ${c.name} has no district`);
      const m = c.mix; assert(m && Math.abs(Object.values(m).reduce((a, b) => a + b, 0) - 1) < 1e-6, `seed ${seed}: ${c.name} has no district mix`);
      assert(m.sub + m.dense > 0.25 && m.ind + m.log + m.rail > 0.03, `seed ${seed}: ${c.name} lacks housing or industry`);
    }
  }
});
test('world: districts change what a city wants from its airport', () => {
  const W = IC.generate(4242), cs = W.cities.filter(c => !c.capital);
  const work = c => c.mix.ind + c.mix.log + c.mix.rail;
  const ind = cs.slice().sort((a, b) => work(b) - work(a))[0], res = cs.slice().sort((a, b) => work(a) - work(b))[0];
  const di = IC.cityDemand(ind), dr = IC.cityDemand(res);
  assert(di.cargo > dr.cargo * 1.5, `${ind.name} (industry ${U.pct(work(ind))}) wants little more cargo than ${res.name} (${U.pct(work(res))}): ${di.cargo.toFixed(2)} vs ${dr.cargo.toFixed(2)}`);
  // the same city with its offices turned into housing flies less on business
  const c = W.cities[0], d0 = IC.cityDemand(c);
  const flat = Object.assign({}, c, { mix: Object.assign({}, c.mix, { biz: 0, old: 0, dense: c.mix.dense + c.mix.biz + c.mix.old }) });
  assert(IC.cityDemand(flat).biz < d0.biz * 0.8 && IC.cityDemand(flat).leisure > d0.leisure, 'offices do not change the business and leisure mix');
  assert(/cargo/.test(IC.cityCharacter(ind).text), `the city panel does not say ${ind.name} is about cargo: ${IC.cityCharacter(ind).text}`);
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
  // the map is ten times larger than wave 4's, with three to four times the towns and roads; it was 1,500 ms for the
  // smaller map, about 1.3 s on the machine that measured both (3.5 s now, up to 4.8 s with other runs beside it)
  assert(worst < 5000, `generation took ${worst} ms`);
});
test('world: the map is about 5,700 × 4,300 km, with three times the towns of the smaller map', () => {
  assert(Math.abs(IC.WW / 10 - 5700) < 200 && Math.abs(IC.WH / 10 - 4300) < 200, `the map is ${IC.WW / 10} × ${IC.WH / 10} km`);
  for (const seed of [4242, 7, 99]) {
    const W = IC.generate(seed), home = W.villages.filter(v => v.home).length;
    // the smaller map had 18 cities and 80 villages
    assert(W.cities.length >= 54 && home >= 240, `seed ${seed}: ${W.cities.length} cities and ${home} villages`);
    // spread over the country, not bunched in the lowlands: no city more than 500 km from the next
    for (const c of W.cities) { const d = Math.min(...W.cities.filter(o => o !== c).map(o => U.dist(o, c))); assert(d < 5000, `seed ${seed}: ${c.name} is ${U.km(d)} from the nearest city`); }
    // the country spans most of the map
    const xs = W.poly.map(p => p[0]), ys = W.poly.map(p => p[1]);
    assert(Math.max(...xs) - Math.min(...xs) > IC.WW * 0.5 && Math.max(...ys) - Math.min(...ys) > IC.WH * 0.45, `seed ${seed}: the country is small on the map`);
  }
});

test('traffic: rush hour is busier than night, and an air raid empties the roads', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S), view = { x0: cap.x - 150, y0: cap.y - 150, x1: cap.x + 150, y1: cap.y + 150 };
  const count = () => { S.traffic.stepT = 0; IC.traffic(S, 0.25); return IC.trafficVisible(S, view, 0.3, () => {}); };
  const rush = count();
  const hw = S.traffic.links.filter(L => L.cls === 'hw' && U.dist(L.l.pts[0], cap) < 300).sort((a, b) => b.load - a.load)[0];
  assert(hw && hw.load > 0.8, `the busiest motorway by the capital is not busy at rush hour (${hw ? hw.load.toFixed(2) : 'none'})`);
  S.time = 3 * 3600; const night = count();
  S.time = 8 * 3600; cap.alert = 600; const raid = count(); cap.alert = 0; count();
  assert(rush > 400, `too little traffic round the capital at 08:00: ${rush}`);
  assert(night < rush * 0.3, `night (${night}) not much quieter than rush hour (${rush})`);
  assert(raid < rush * 0.5, `an air raid alert did not clear the roads (${raid} vs ${rush})`);
  // commuters: into the offices in the morning, home in the evening
  const T = S.traffic, biz = T.zones.filter(z => z.city === cap && z.jobs > z.homes * 2).sort((a, b) => b.jobs - a.jobs)[0];
  assert(biz, 'no business district in the capital');
  const G = T.G, nd = G.nodes[biz.node], inbound = (h) => { S.time = h * 3600; count(); let i = 0, o = 0; for (const li of nd.out) { const L = T.links[li], d = G.links[li].b === biz.node ? 0 : 1; i += L.dem[d]; o += L.dem[1 - d]; } return [i, o]; };   // (the demand: a jammed street carries as much both ways)
  const [mi, mo] = inbound(8), [ei, eo] = inbound(17.5);
  assert(mi > mo && eo > ei, `rush hours do not run into town in the morning and out in the evening (08:00 ${mi.toFixed(2)} in, ${mo.toFixed(2)} out; 17:30 ${ei.toFixed(2)} in, ${eo.toFixed(2)} out)`);
});
test('traffic: trips start and end at real places and follow the road graph', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S), T = S.traffic, G = T.G;
  // every city's streets are on one network with the roads
  const seen = new Set([0]), q = [0];
  while (q.length) { const n = q.pop(); for (const li of G.nodes[n].out) { const lk = G.links[li], m = lk.a === n ? lk.b : lk.a; if (!seen.has(m)) { seen.add(m); q.push(m); } } }
  assert(seen.size === G.nodes.length, `${G.nodes.length - seen.size} road and street nodes are cut off from the rest`);
  // slip roads run one way, and motorways meet other roads only through them
  const ramps = G.links.filter(l => l.cls === 'ramp');
  assert(ramps.length && ramps.filter(l => l.one).length >= ramps.length * 0.9, 'slip roads are not one-way');
  // (where a motorway runs through open country; in a town centre or at a roundabout it joins the roads there)
  const town = n => S.world.cities.some(c => U.dist(c, n) < 0.01);
  for (const n of G.nodes) { const c = n.out.map(i => G.links[i].cls); if (c.filter(k => k === 'hw').length >= 2 && !n.jk && !town(n)) assert(c.every(k => k === 'hw' || k === 'ramp'), `a motorway meets a ${c.find(k => k !== 'hw' && k !== 'ramp')} at grade`); }
  // close in, vehicles start at zones and places and drive their route to the end
  const view = { x0: cap.x - 40, y0: cap.y - 25, x1: cap.x + 40, y1: cap.y + 25 };
  IC.trafficAgents(S, view, 0);
  for (let i = 0; i < 1200; i++) { S.time += 0.5; IC.traffic(S, 0.5); IC.trafficAgents(S, view, 0.5); }
  const A = IC.trafficAgentsOf(S);
  assert(A.stats.spawnZone > 100, `few trips started in the city (${A.stats.spawnZone})`);
  assert(A.trips.length >= 10, `only ${A.trips.length} trips arrived in ten minutes`);
  const connected = r => r.every(([lk, d], i) => IC.driveCanGo(lk, d) && (i === 0 || (r[i - 1][1] ? r[i - 1][0].a : r[i - 1][0].b) === (d ? lk.b : lk.a)));
  for (const tr of A.trips) {
    assert(tr.org && tr.org.blocks && tr.org.blocks.length, 'a trip started away from any buildings');
    assert(tr.dest && (tr.dest.blocks ? tr.dest.blocks.length : ['apt', 'border', 'industry', 'depot'].includes(tr.dest.kind)), 'a trip ended away from any place');
    const [f] = tr.route[0], [l, ld] = tr.route[tr.route.length - 1];
    assert((tr.route[0][1] ? f.b : f.a) === tr.org.node && (ld ? l.a : l.b) === tr.dest.node, 'a route does not run from its start to its end');
    assert(connected(tr.route), 'a route jumps between roads that do not meet, or runs the wrong way along a slip road');
  }
  for (const a of A.list) assert(connected(a.route), 'a vehicle on the road follows a broken route');
  const purposes = new Set(A.list.map(a => a.pur).concat(A.trips.map(t => t.dest.kind || 'x')));
  assert(A.list.some(a => a.pur === 'com') && A.list.some(a => a.pur === 'frt' || ['artic', 'box', 'tanker'].includes(a.k)), `no commuters or lorries: ${[...purposes].join(', ')}`);
  // buses run lines along the road graph, with stops
  assert(T.lines.some(l => l.kind === 'bus') && T.lines.some(l => l.kind === 'coach'), 'no bus or coach lines');
  for (const l of T.lines) { assert(connected(l.path), `${l.name} is not a connected route`); if (l.kind === 'bus') assert(l.stops.length >= 3, `${l.name} has no stops`); }
});
test('traffic: a busy hour stays inside the time budget', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S);
  for (let i = 0; i < 200; i++) { S.time += 0.25; IC.traffic(S, 0.25); }
  let t0, step = 1e9;
  for (let k = 0; k < 3; k++) { t0 = process.hrtime.bigint(); for (let i = 0; i < 1000; i++) { S.time += 0.25; IC.traffic(S, 0.25); } step = Math.min(step, Number(process.hrtime.bigint() - t0) / 1e6 / 1000); }
  // what the renderer asks for each frame at city zoom (about 1,400 × 900 px at 3 px per unit)
  const view = { x0: cap.x - 240, y0: cap.y - 150, x1: cap.x + 240, y1: cap.y + 150 };
  let n = 0, frame = 1e9;
  for (let k = 0; k < 3; k++) { t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) n = IC.trafficVisible(S, view, 7 / 3, () => {}); frame = Math.min(frame, Number(process.hrtime.bigint() - t0) / 1e6 / 20); }
  // close in: vehicles on their own trips at street zoom, a frame at normal speed
  const near = { x0: cap.x - 36, y0: cap.y - 22, x1: cap.x + 36, y1: cap.y + 22 };
  IC.trafficAgents(S, near, 0); for (let i = 0; i < 200; i++) { S.time += 0.5; IC.trafficAgents(S, near, 0.5); }
  let ag = 1e9;
  for (let k = 0; k < 3; k++) { t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) { S.time += 0.17; IC.trafficAgents(S, near, 0.17); } ag = Math.min(ag, Number(process.hrtime.bigint() - t0) / 1e6 / 20); }
  const nA = IC.trafficAgentsOf(S).list.length;
  console.log(`        step ${step.toFixed(4)} ms, ${n} vehicles placed in ${frame.toFixed(2)} ms, ${nA} vehicles on their own trips moved in ${ag.toFixed(2)} ms`);
  assert(step < 0.1, `traffic step takes ${step.toFixed(3)} ms (budget 0.1 ms of the 1 ms step)`);
  assert(frame < 4, `placing ${n} vehicles takes ${frame.toFixed(2)} ms a frame`);
  assert(ag < 3, `moving ${nA} vehicles takes ${ag.toFixed(2)} ms a frame`);
});

/* ---------- airports ---------- */
test('airport: starting layouts are connected', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  const cap = S.byId[S.story.cap], bad = S.byId[S.story.bad];
  const st = IC.aptStats(S, cap);
  assert(st.longest >= 30, `capital runway too short: ${st.longest}`);
  assert(IC.aptStands(cap).every(s => s.linked !== false), 'capital has stands cut off from the runway');
  assert(st.maxType === 'cargo', `capital cannot take the largest aircraft (${st.maxType})`);
  assert(IC.aptStats(S, bad).warn.some(w => /backtrack/.test(w)), 'the bad regional should warn about backtracking');
});
test('airport: a departure taxis out and takes off', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const cap = S.byId[S.story.cap];
  const s = IC.aptStands(cap).find(x => !x.occ && x.size !== 's' && x.linked !== false);
  let air = false;
  const m = IC.gopsDepart(S, cap, { type: 'narrow', node: s.id, stand: s, startT: 0, who: 'TEST 1', onAir: () => { air = true; } });
  assert(m, 'no departure plan');
  for (let i = 0; i < 3600 * 2 && !air; i++) IC.step(S, 0.5);
  assert(air, `never took off; last phase ${m.phase}`);
});
test('airport: building a parallel taxiway stops the backtracking', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  const cap = S.byId[S.story.cap];
  const tanks = cap.parts.filter(p => p.kind === 'fuel');
  IC.detonate(S, tanks[0].x, tanks[0].y, 90, { d: { code: 'TEST' } });
  run(S, 0.5);
  assert(tanks.filter(t => t.hp <= t.max * 0.25).length >= 3, 'fire did not spread across the tank farm');
});
test('airport: a runway crater shortens the usable strip', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 5 });
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
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 8 });
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
  const S2 = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
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

/* ---------- the tower's rules: when aircraft may go onto a runway (docs/tasks/15-runway-rules.md) ---------- */
const grpOf = (ap, rwId) => IC.aptGraph(ap).grp[rwId] || rwId;
const lockAt = (ap, rwId) => (ap.rl || {})[grpOf(ap, rwId)] || {};
/* how far (world units) the nearest arrival coming to these runways is from touchdown: on final, or still flying in */
function arrDistance(S, ap, rwId) {
  const k = grpOf(ap, rwId); let d = 1e9;
  for (const m of ap.moves) if (m.kind === 'arr' && m.phase === 'final' && m.finK === k) d = Math.min(d, U.dxy(m.x, m.y, m.tx, m.ty));
  for (const t of S.threats) if (!t.dead && t.appr && !t.holding && t.toApt === ap.id && t.faf && grpOf(ap, t.faf.rwId) === k) d = Math.min(d, U.dxy(t.x, t.y, t.faf.x, t.faf.y) + IC.GOPS.FAF);
  return d;
}
/* watch every departure the moment it goes onto its runway */
function onEntry(S, ap, fn) {
  const seen = new Set();
  return () => { for (const m of ap.moves) if (m.kind === 'dep' && m.plan && m.locks && m.locks[grpOf(ap, m.plan.rw.id)] && !seen.has(m.id)) { seen.add(m.id); fn(m); } };
}
test('runway rules: under "only when cleared", an airliner never goes onto the runway with an arrival inside the gap', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  const ap = S.byId[S.story.cap];
  sky(S, 'clear'); calm(S, ap.rwyA, 6);
  const ops = IC.opsOf(ap); ops.r.enter.jet = ops.r.enter.heavy = 'hold'; ops.r.gap = 8;
  const O = IC.OPS_T, need = (ops.r.gap * 10 - O.GO) / O.ARR_V;
  // when an airliner goes onto the runway, and when its take-off run starts; when each arrival reaches 1 km
  let n = 0, near = 0, worst = 1e9, tight = 1e9;
  const runs = [], seenRun = new Set(), seenGo = new Set();
  const watch = onEntry(S, ap, m => {
    if (IC.opsKind(m.type) !== 'jet' && IC.opsKind(m.type) !== 'heavy') return;
    const d = arrDistance(S, ap, m.plan.rw.id), L = lockAt(ap, m.plan.rw.id); n++; if (d < 150) near++;
    if (L.gapFor !== m.id) worst = Math.min(worst, d);   // arrivals the tower holds at the fix for it do not count
  });
  // at least 9 hours, then on until the tower has had enough close calls to judge (traffic is random)
  for (let i = 0; i < 24 * 3600 / 0.5 && (i < 9 * 3600 / 0.5 || near < 6); i++) {
    IC.step(S, 0.5); watch();
    for (const m of ap.moves) {
      if (m.kind === 'dep' && m.phase === 'roll' && !(m.delay > 0) && !seenRun.has(m.id) && IC.opsKind(m.type) !== 'light') { seenRun.add(m.id); runs.push(S.time); }
      if (m.kind === 'arr' && m.phase === 'final' && m.t >= (IC.GOPS.FAF - O.GO) / O.ARR_V && !seenGo.has(m.id)) { seenGo.add(m.id); const r = runs.filter(t => t <= S.time).pop(); if (r) tight = Math.min(tight, S.time - r); }
    }
  }
  assert(n >= 15, `only ${n} airliner departures`);
  assert(near >= 3, `only ${near} departures with an arrival within 15 km: the test saw no conflict to judge`);
  assert(worst >= 80, `an airliner went onto the runway with an arrival ${U.km(worst)} out (gap 8 km)`);
  assert(tight >= need - 3, `an arrival was 1 km out ${U.dur(tight)} after a take-off run started; an 8 km gap gives ${U.dur(need)}`);
  console.log(`        ${n} airliner departures, ${near} with an arrival within 15 km; closest arrival ${U.km(worst)} out; next arrival 1 km out ${U.dur(tight)} after a run at the soonest`);
}, true);
test('runway rules: under the defaults a light aircraft lines up and waits while an airliner holds short', () => {
  const { S, ap } = kdenGame(12345, 10);
  sky(S, 'clear'); calm(S, -Math.PI / 2, 10); IC.aptStats(S, ap);
  let lightBehind = 0, jetBehind = 0, both = 0;
  const watch = onEntry(S, ap, m => {
    const L = lockAt(ap, m.plan.rw.id), o = L.by && L.by !== m.id && ap.moves.find(x => x.id === L.by);
    const behind = !!(o && o.kind === 'dep' && o.phase === 'roll');
    if (behind && m.type === 'light') lightBehind++;
    if (behind && IC.opsKind(m.type) === 'jet') jetBehind++;
  });
  // club aircraft and airliners land, then queue to leave (parked aircraft leave as turboprops and airliners)
  drive(S, ap, { arr: 90, dep: 300, hours: 1.5, fill: 0.3, mix: [['light', 1], ['narrow', 1]], each: () => {
    watch();
    for (const m of ap.moves) if (m.type === 'light' && m.phase === 'wait' && ap.moves.some(x => x.type === 'narrow' && x.holding === 'runway' && x.plan && grpOf(ap, x.plan.rw.id) === grpOf(ap, m.plan.rw.id))) { both++; break; }
  } });
  assert(lightBehind > 3, `only ${lightBehind} light aircraft lined up behind a rolling departure`);
  assert(jetBehind === 0, `${jetBehind} airliners went onto the runway behind a rolling departure`);
  assert(both > 0, 'never saw a light aircraft waiting on the runway while an airliner held short for it');
  console.log(`        ${lightBehind} light aircraft lined up behind a rolling departure; airliners 0`);
}, true);
test('runway rules: "line up and wait" lets a departure line up behind one that is rolling, and moves more of them', () => {
  const rate = enter => {
    const { S, ap } = kdenGame(12345, 10);
    sky(S, 'clear'); calm(S, -Math.PI / 2, 10);
    IC.opsOf(ap).r.enter.jet = enter; IC.aptStats(S, ap);
    let behind = 0, t0 = 0, d0 = 0; const start = S.time;
    const watch = onEntry(S, ap, m => { const L = lockAt(ap, m.plan.rw.id), o = L.by && L.by !== m.id && ap.moves.find(x => x.id === L.by); if (o && o.phase === 'roll') behind++; });
    // arrivals keep the arrival runways busy, so departures stay on their own
    const r = drive(S, ap, { follow: true, depX: 1.5, hours: 1.75, fill: 0.9, mix: [['narrow', 1]], each: S2 => { watch(); if (!t0 && S2.time - start > 2700) { t0 = S2.time; d0 = ap.kpi.dep || 0; } } });
    return { behind, perHour: ((ap.kpi.dep || 0) - d0) / ((S.time - t0) / 3600), rated: IC.aptStats(S, ap).depPerHour };
  };
  const hold = rate('hold'), luaw = rate('luaw');
  assert(luaw.behind > 5, `only ${luaw.behind} departures lined up behind a rolling one`);
  assert(hold.behind === 0, `${hold.behind} went on behind a rolling one under "only when cleared"`);
  assert(luaw.perHour > hold.perHour * 1.08, `line up and wait moved ${luaw.perHour.toFixed(0)} an hour, only when cleared ${hold.perHour.toFixed(0)}`);
  assert(luaw.rated > hold.rated, `the panel does not rate line up and wait higher (${luaw.rated} against ${hold.rated})`);
  console.log(`        departures an hour: only when cleared ${hold.perHour.toFixed(0)} (rated ${hold.rated}), line up and wait ${luaw.perHour.toFixed(0)} (rated ${luaw.rated})`);
}, true);
test('runway rules: an arrival goes around when the runway is still occupied, and it is counted', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap];
  sky(S, 'clear'); calm(S, ap.rwyA, 5); IC.aptStats(S, ap);
  const stands = IC.aptStands(ap).filter(x => !x.occ && x.linked && x.size !== 's');
  const a = IC.gopsLand(S, ap, { type: 'narrow', target: stands[0].id, stand: stands[0], who: 'ARR 1', onGoAround: () => { went = true; } });
  assert(a && a.phase === 'final', `the arrival was not cleared: ${a}`);
  let went = false, events = 0, landed = false;
  IC.on((S2, type) => { if (S2 === S && type === 'goAround') events++; });
  a.onPark = () => { landed = true; };
  // a departure lined up on the same runway that cannot go (its wake gap never ends)
  const d = IC.gopsDepart(S, ap, { type: 'narrow', node: stands[1].id, stand: stands[1], who: 'DEP 1' });
  const k = grpOf(ap, a.plan.rw.id), L = ap.rl[k];
  d.plan.rw = a.plan.rw; d.phase = 'wait'; d.path = null; d.locks = { [k]: true }; L.by = d.id; L.next = S.time + 1e6;
  for (let i = 0; i < 400 && !went; i++) tick(S, 0.5);
  assert(went && !landed, 'the arrival did not go around');
  assert(ap.kpi.ga === 1 && (ap.gaLog || []).length === 1 && events === 1, `go-around not counted: kpi ${ap.kpi.ga}, log ${(ap.gaLog || []).length}, events ${events}`);
  assert(!ap.moves.includes(a) && L.fin !== a.id, 'the arrival still holds the approach');
  assert(S.logs.some(l => l.tag === 'RADIO' && /going around/.test(l.msg)), 'no radio call for the go-around');
});
test('runway rules: the Operations tab rates departures an hour within 10% of a simulated hour', () => {
  for (const preset of ['standard', 'busy', 'cautious']) {
    const { S, ap } = kdenGame(12345, 10);
    sky(S, 'clear'); calm(S, -Math.PI / 2, 12);
    IC.opsPreset(IC.opsOf(ap), preset);
    const at = {}, t0 = S.time;
    drive(S, ap, { follow: true, depX: 1.25, hours: 2.5, fill: 0.8, each: S2 => { for (const h of [1.5, 2.5]) if (!at[h] && S2.time >= t0 + h * 3600 - 1) at[h] = ap.kpi.dep || 0; } });
    const st = IC.aptStats(S, ap), tab = IC.opsCapacity(S, ap, st), flew = at[2.5] - at[1.5];
    assert(Math.abs(flew - tab.dep) <= tab.dep * 0.1, `${preset}: the tab says ${tab.dep} departures an hour, the simulation flew ${flew}`);
    console.log(`        ${IC.OPS_PRESETS[preset].name}: rated ${tab.dep} departures an hour, flew ${flew}; ${ap.kpi.ga || 0} go-arounds; average delay ${U.dur(ap.kpi.wait || 0)}`);
  }
}, true);
test('runway rules: lining up and waiting at night without a ground radar carries more risk than by day', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 12 });
  const ap = S.byId[S.story.cap];
  sky(S, 'clear'); calm(S, ap.rwyA, 5); IC.aptStats(S, ap);
  ap.parts = ap.parts.filter(p => p.kind !== 'gradar'); ap.dirty = true; IC.aptStats(S, ap);
  const s = IC.aptStands(ap).find(x => !x.occ && x.linked);
  const m = IC.gopsDepart(S, ap, { type: 'light', node: s.id, stand: s, who: 'CLUB 1' });
  const day = IC.gopsRisk(S, ap, m, 'wait').p;
  S.time += 12 * 3600; const night = IC.gopsRisk(S, ap, m, 'wait');
  assert(day === 0 && night.p > 0, `risk by day ${day}, at night ${night.p}`);
  assert(night.why.some(w => /line up and wait/.test(w.rule)), 'the risk does not name the rule that allows it');
  ap.st.gradar = true;
  assert(IC.gopsRisk(S, ap, m, 'wait').p === 0, 'a ground radar should remove the risk');
  // and the panel says so before the player picks the rule
  ap.st.gradar = false; ap.st.mix = { light: 1 };
  const ops = IC.opsClone(IC.opsOf(ap)); ops.r.enter.light = 'luaw';
  assert(IC.opsNotes(S, ap, ap.st, ops).some(t => /ground radar/.test(t)), 'the Operations tab does not warn about lining up in the dark');
});

/* ---------- the builder ---------- */
/* a site for a new airport at the edge of a town, with homes close by */
const siteNear = (S, c) => {
  for (let r = c.r * 0.55; r < c.r + 40; r += 3) for (let a = 0; a < 6.28; a += 0.2) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    // (on the larger map more towns have a river by them: the runway line must be clear of it)
    if (!IC.foundCheck(S, x, y) && c.blocks.some(b => U.dxy(b.x, b.y, x, y) < 15) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y };
  }
  return null;
};
const townWithSite = S => { for (const c of IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop)) { const p = siteNear(S, c); if (p) return { c, p }; } return null; };
test('builder: right-click takes a point back; clicking the last point again builds the taxiway', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S;
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S;
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  const cap = S.byId[S.story.cap], reg = S.byId[S.story.reg];
  const A = { x: cap.x, y: cap.y, apt: cap.id }, B = { x: reg.x, y: reg.y, apt: reg.id };
  assert(IC.avPath(S, A, B).pts.length === 2, 'expected a direct route with no airways');
  // a dog-leg airway: out to one side of the direct line and back
  const dx = reg.x - cap.x, dy = reg.y - cap.y, L = Math.hypot(dx, dy), nx = -dy / L * 300, ny = dx / L * 300;
  // (each fix 80 km along from its airport, within the 120 km an airport reaches to join the network)
  const k = Math.min(0.25, 800 / L), f1 = IC.aspAddFix(S, cap.x + dx * k + nx, cap.y + dy * k + ny), f2 = IC.aspAddFix(S, cap.x + dx * (1 - k) + nx, cap.y + dy * (1 - k) + ny);
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
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  IC.step(S, 0.5); IC.step(S, 0.5);
  const cap = S.byId[S.story.cap], from = { x: cap.x, y: cap.y, apt: cap.id }, to = off(cap, 1, 3000);
  const gapOf = () => { S.asp.dep = {}; IC.aspRelease(S, from, to); return IC.aspRelease(S, from, to); };
  const withRadar = gapOf();
  blind(S);
  const without = gapOf();
  assert(withRadar > 0, 'a second departure the same way was released at once');
  assert(without >= withRadar * 3, `outside radar the spacing should be much wider (${withRadar} s → ${without} s)`);
});
test('airspace: once there are entry points, traffic from abroad joins the airways only there', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  const cap = S.byId[S.story.cap], port = IC.avPorts(S)[0], A = { x: cap.x, y: cap.y, apt: cap.id };
  // a fix near the airport and one out toward the foreign airport, inside the country
  const dx = port.x - cap.x, dy = port.y - cap.y, L = Math.hypot(dx, dy);
  let edge = 0; for (let i = 1; i < 200; i++) if (IC.inHome(cap.x + dx * i / 200, cap.y + dy * i / 200)) edge = i / 200;
  const hub = IC.aspAddFix(S, cap.x + dx / L * 200, cap.y + dy / L * 200), mid = IC.aspAddFix(S, cap.x + dx * edge * 0.6, cap.y + dy * edge * 0.6);
  IC.aspAddWay(S, hub.id, mid.id);
  assert(!mid.gate && !hub.gate, 'a fix deep inside the country counted as an entry point');
  const r1 = IC.aspRoute(S, A, port);
  assert(r1 && r1.fixes[r1.fixes.length - 1] === mid.id, 'without entry points, traffic should join at any fix');
  // an entry point on the border, off to one side
  const q = { x: cap.x + dx * edge + dy / L * 150, y: cap.y + dy * edge - dx / L * 150 };
  const gate = IC.aspAddFix(S, q.x, q.y);
  assert(gate && gate.gate, 'a fix on the border is not an entry point');
  IC.aspAddWay(S, mid.id, gate.id);
  const r2 = IC.aspRoute(S, A, port);
  assert(r2 && r2.fixes[r2.fixes.length - 1] === gate.id, `traffic should leave by the entry point: ${r2 && r2.fixes.join()}`);
});
test('airspace: overloaded controllers hold departures longer', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  run(S, 0.05);
  const cap = S.byId[S.story.cap], from = { x: cap.x, y: cap.y, apt: cap.id }, to = off(cap, 1, 3000);
  const calm = IC.aspGap(S, from, to).gap;
  S.asp.work = 2;
  assert(IC.aspGap(S, from, to).gap >= calm * 1.9, 'an overloaded team released departures as fast as a quiet one');
  assert(IC.aspWork(S).cap >= IC.ASP.ctl, 'no controller capacity reported');
});
test('airspace: a loss of separation produces an incident', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  blind(S);
  const [a, b] = pair(S, IC.cap(S), 9.5);
  let lost = false;
  IC.on((S2, type, d) => { if (S2 === S && (type === 'lossSep' || type === 'nearMiss') && (d.a === a || d.b === a)) lost = true; });
  // busy controllers: procedural control works only while the sky is quiet
  const ctl = IC.ASP.ctl; IC.ASP.ctl = 1;
  try { for (let i = 0; i < 400 && !lost; i++) IC.step(S, 0.5); } finally { IC.ASP.ctl = ctl; }
  assert(lost, 'no loss of separation recorded');
  assert(S.inc.list.some(it => (it.kind === 'separation' || it.kind === 'nearmiss') && (it.ref === a || it.ref === b)), 'no incident raised');
});
test('airspace: controllers keep apart flights they can see', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  run(S, 0.02);
  const cap = IC.cap(S), [a, b] = pair(S, cap, 9.5);
  let minD = 1e9, minZ = 1e9, lost = false;
  IC.on((S2, type, d) => { if (S2 === S && (type === 'lossSep' || type === 'nearMiss') && (d.a === a || d.b === a)) lost = true; });
  for (let i = 0; i < 400; i++) { IC.step(S, 0.5); if (U.dist(a, b) < 90) minZ = Math.min(minZ, Math.abs(a.alt - b.alt)); minD = Math.min(minD, U.dist(a, b)); }
  assert(minD < 40, 'the test flights never met');
  assert(!lost, `separation was lost under radar (${minZ.toFixed(2)} km apart vertically)`);
});
test('airspace: light aircraft avoid controlled airspace unless cleared', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 9 });
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
    const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
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
    const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
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
test('growth: the road tool builds links for airports, and refuses roads that serve none', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  S.budget = 5000;
  IC.econRefresh(S);
  const W = S.world, cs = IC.cities(S);
  // a road between two towns is not the airport authority's to build
  const [a, b] = cs.slice().sort((p, q) => p.pop - q.pop).slice(0, 2);
  const P0 = IC.roadPlan(S, 'rd', [a, b], [{ node: a.id }, { node: b.id }]);
  assert(/airport/.test(P0.why), `a road between ${a.name} and ${b.name} was allowed: ${P0.why || 'no reason given'}`);
  assert(!IC.roadFinish(S, { cls: 'rd', pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], snaps: [{ x: a.x, y: a.y, node: a.id }, { x: b.x, y: b.y, node: b.id }] }), 'the works started anyway');
  // a motorway link from an airport to the nearest motorway: where the road round is long for the distance
  let pick = null;
  for (const ap of S.infra.filter(i => i.kind === 'airport' && i.parts)) for (const e of W.edges) {
    if (e.cls !== 'hw') continue;
    for (let i = 2; i < e.pts.length - 2; i += 2) {
      const q = e.pts[i], d = U.dist(ap, q); if (d < 30 || d > 300) continue;
      const P = IC.roadPlan(S, 'hw', [{ x: ap.x, y: ap.y }, q], [{ x: ap.x, y: ap.y, node: ap.id }, { x: q.x, y: q.y, edge: e.id }]);
      if (P.why) continue;
      const far = cs.slice().sort((c1, c2) => U.dist(c1, q) - U.dist(c2, q))[0], t = IC.tripTime(S, far, ap), direct = (U.dist(far, q) + d) * 360 / IC.ROAD_KMH.hw;
      if (!pick || t / direct > pick.r) pick = { ap, q, e, far, t, r: t / direct };
    }
  }
  assert(pick, 'no airport where a motorway link could be built');
  const { ap, q, e, far } = pick, catch0 = IC.aptCatchment(S, ap), edges0 = W.edges.length;
  const w = IC.roadFinish(S, { cls: 'hw', pts: [{ x: ap.x, y: ap.y }, { x: q.x, y: q.y }], snaps: [{ x: ap.x, y: ap.y, node: ap.id }, { x: q.x, y: q.y, edge: e.id }] });
  assert(w && S.econ.works.length === 1 && w.apt === ap.id, 'the works did not start');
  for (let h = 0; h < w.hours + 2 && S.econ.works.length; h++) { S.time += 3600; IC.growth(S, 3600); IC.traffic(S, 3600); }
  assert(!S.econ.works.length && W.edges.length === edges0 + 2, 'the link never opened (the motorway is split where it joins)');
  const link = W.edges[W.edges.length - 1], ix = W.junctionAt[link.a] || W.junctionAt[link.b];
  assert(ix && ix.kind === 'mm' && ix.ramps.length, 'the motorway link has no interchange');
  assert(W.roadIdx[link.a] != null && W.roadIdx[link.b] != null, 'the new road is not in the routing graph');
  const t1 = IC.tripTime(S, far, ap);
  assert(t1 <= pick.t + 1, `the trip from ${far.name} to the airport got longer: ${U.dur(t1)} vs ${U.dur(pick.t)}`);
  assert(IC.aptCatchment(S, ap) >= catch0, 'the airport reaches fewer people');
  assert(/people within/.test(IC.aptRoadReport(S, ap).text), 'the airport panel does not say how many people it reaches by road');
  // traffic finds the new road, and reaches it by the new slip roads
  const G = S.traffic.G;
  assert(G.links.some(l => l.ref.edge === link) && G.links.some(l => l.cls === 'ramp' && ix.ramps.includes(l.ref.ramp)), 'traffic does not use the new link and its slip roads');
  assert(S.worldDirty && S.worldDirty.length, 'the world was not told the road changed');
});
test('growth: a crater on a motorway cuts the link between two cities until it is repaired', () => {
  // a map where the detour round the crater is long enough to show in the city panel (the world look changed
  // the roads on seed 777: there a parallel road now keeps the detour short)
  const S = IC.newGame({ seed: 99, mode: 'story', preset: 'network', hour: 7 });
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
test('growth: districts decide how a city flies: industry ships cargo, offices want frequent flights', () => {
  const S = IC.newGame({ seed: 4242, mode: 'campaign', hour: 7 });
  IC.econRefresh(S);
  const cs = IC.cities(S).filter(c => c.owner === 'us' && c.mix);
  const work = c => c.mix.ind + c.mix.log + c.mix.rail;
  const ind = cs.slice().sort((a, b) => work(b) - work(a))[0], res = cs.slice().sort((a, b) => work(a) - work(b))[0];
  const perHead = c => c.air.cargo / c.pop / c.prosp;
  assert(perHead(ind) > perHead(res) * 1.3, `${ind.name} (industry ${U.pct(work(ind))}) ships little more air cargo a head than ${res.name}: ${perHead(ind).toFixed(3)} vs ${perHead(res).toFixed(3)}`);
  // the districts move demand between cities; the country's total is what population and prosperity give
  const pot = cs.reduce((s, c) => s + c.air.pot, 0), base = cs.reduce((s, c) => s + c.pop * IC.GROWTH.flyRate * c.prosp, 0);
  assert(Math.abs(pot / base - 1) < 0.15, `districts changed the national demand by ${U.pct(pot / base - 1)}`);
  // the same city turned into offices flies more on business, and its flyers weigh frequency more
  const c = cs[0], pax0 = c.air.pot;
  c.mix = Object.assign({}, c.mix, { biz: c.mix.biz + c.mix.sub, sub: 0 });
  IC.econRefresh(S);
  assert(c.air.bizShare > 0.5 && c.air.pot > pax0, `${c.name} with more offices does not fly more on business (${U.pct(c.air.bizShare)} business, ${Math.round(c.air.pot)} vs ${Math.round(pax0)} flyers)`);
  const ap = IC.bases(S).find(a => a.svc && a.svc.cargoDem > 0);
  assert(ap && IC.cargoLoad(S, ap) > 0.45, 'city cargo does not fill any airport\'s cargo room');
});
test('growth: a well-connected city adds blocks over a few game days; a cut-off one does not', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  IC.econRefresh(S);
  const cap = IC.cap(S), lone = IC.cities(S).filter(c => c.air.score === 0).sort((a, b) => b.pop - a.pop)[0];
  const n0 = cap.blocks.length, s0 = cap.streets.length, l0 = lone ? lone.blocks.filter(b => !b.empty).length : 0;
  econDays(S, 4);
  const added = cap.blocks.filter(b => b.grown);
  assert(added.length >= 5 && cap.blocks.length === n0 + added.length, `the capital added only ${added.length} blocks in four days`);
  assert(cap.streets.length > s0, 'no new streets');
  assert(added.every(b => IC.inHome(b.x, b.y) && !S.world.inLake(b.x, b.y)), 'a block was built in a lake or abroad');
  assert(added.every(b => IC.DISTRICTS[b.d] && b.f && b.i != null), 'a new block has no district or building, or is off the city\'s street plan');
  if (lone) assert(lone.blocks.filter(b => !b.empty).length <= l0, `${lone.name}, with no air service, still grew`);
  assert(S.worldDirty.length, 'the world was not told about the new blocks');
});
test('growth: the weekly statement adds up to the change in the treasury', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
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
  while (t < 6 * 3600 && m.store + m.mag < m.storeMax + m.max) {
    IC.step(S, 0.5); t += 0.5;
    const j = S.jobs.find(x => x.mag === m && x.v);
    if (j) { v = j.v; if (v.state === 'toDest' && onRoad(S, v.x, v.y)) seenOnRoad = true; }
  }
  assert(v, 'no convoy was sent');
  assert(m.store + m.mag >= m.storeMax + m.max, `only ${m.mag} ready and ${m.store} in reserve after ${U.dur(t)}`);
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
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  for (let i = 0; i < 2; i++) { const c = IC.cap(S), p = IC.findSpot(S, 'lrsam', c.x, c.y, 300, 700); IC.makeUnit(S, 'lrsam', p.x, p.y, { instant: true }); }
  let warned = -1, empty = -1;
  for (let t = 0; t < 12 * 3600 && empty < 0; t += 0.5) {
    IC.step(S, 0.5);
    if (warned < 0 && S.logs.some(l => l.tag === 'TREASURY' && /runs out/.test(l.msg))) warned = t;
    if (S.budget <= 0) empty = t;
  }
  assert(warned >= 0, 'no warning');
  assert(empty < 0 || empty - warned > 1800, `warned only ${U.dur(empty - warned)} before the money ran out`);
}, true);

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

/* ---------- air defence ---------- */
const range = () => { const S = IC.newGame({ seed: 1, mode: 'range' }); return S; };
const runRange = (S, maxS, stop) => { for (let i = 0; i < maxS * 4 && !(stop && stop(S)); i++) IC.step(S, 0.25); };
test('air defence: no ground war code runs in the step', () => {
  assert(!IC.ground && !IC.groundInit && !IC.makeBrigade && !IC.GTYPES, 'ground war functions are still loaded');
  const src = IC.step.toString();
  assert(!/ground\(|fronts/.test(src), 'the step still calls the ground war');
  const S = IC.newGame({ seed: 12345, mode: 'campaign' });
  assert(S.gunits === undefined && S.fronts === undefined && S.evehicles === undefined, 'the state still has brigades, fronts or enemy convoys');
  run(S, 1);
  assert(!IC.LESSONS.some(l => l.id === 'ground'), 'the ground lesson is still in the Academy');
});
test('air defence: an upper and a lower tier stop most of a ballistic salvo', () => {
  const S = range(), T = S.range.target;
  IC.rangeAddUnit(S, 'hatd', T.x - 150, T.y + 50);
  IC.rangeAddUnit(S, 'lrsam', T.x - 60, T.y - 40);
  IC.rangeSpawn(S, { what: 'srbm', n: 6, brg: 80, km: 300, alt: '' });
  runRange(S, 1800, S => S.range.pending.length === 0 && S.threats.length === 0 && S.time - S.range.t0 > 60);
  const st = IC.rangeStats(S);
  assert(st.kills >= 4, `only ${st.kills} of 6 warheads intercepted (${st.leaks} got through)`);
  assert(st.mun.HAT > 0 && st.mun.TBD > 0, `both tiers should fire: ${JSON.stringify(st.mun)}`);
});
test('air defence: a stand-off jammer blinds a radar along its bearing, and a home-on-jam missile kills it', () => {
  const S = range(), T = S.range.target;
  const rad = IC.rangeAddUnit(S, 'lr3d', T.x, T.y);
  const j = IC.spawnThreat(S, 'ewj', T.x, T.y - 700, { mission: 'jam', st: { x: T.x, y: T.y - 700 }, route: [], jamming: true, home: { x: T.x + 3000, y: T.y }, jamT: 1e5 });
  const along = IC.spawnThreat(S, 'str', T.x + 10, T.y - 500, { mission: 'patrol', st: { x: T.x + 10, y: T.y - 500 }, route: [], home: T, noFire: true });
  const off = IC.spawnThreat(S, 'str', T.x + 500, T.y, { mission: 'patrol', st: { x: T.x + 500, y: T.y }, route: [], home: T, noFire: true });
  IC.updateEmcon(S, 0.25);
  const sees = t => { IC.sense(S, 0.25); return S.sensors.some(s => s.unit === rad && IC.detects(s, t)); };
  assert(!sees(along), 'the radar still sees an aircraft 50 km out on the jammer\'s bearing');
  assert(sees(off), 'the radar lost an aircraft 50 km out off the jammer\'s bearing');
  assert(S.strobes.some(st => st.j === j && st.unit === rad), 'no strobe on the jammer');
  j.jamming = false; assert(sees(along), 'with the jammer off the radar does not see the aircraft'); j.jamming = true;
  along.dead = off.dead = true;
  IC.rangeAddUnit(S, 'lrsam', T.x - 30, T.y + 20);
  runRange(S, 1800, () => j.dead);
  assert(j.dead, 'the jammer survived 30 minutes of home-on-jam fire');
  assert(S.logs.some(l => l.tag === 'HOME-ON-JAM'), 'no home-on-jam shot was fired');
});
test('air defence: a call-in team arrives in seconds, shoots down a drone and leaves after its time', () => {
  const S = range(), T = S.range.target;
  const job = IC.callIn(S, T.x, T.y);
  assert(job, 'the call-in was refused: ' + IC.callInWhy(S, T.x, T.y));
  assert(IC.callInState(S).charges === IC.callInStats(S).max - 1, 'the call-in did not use a charge');
  runRange(S, 60, () => S.units.some(u => u.callin));
  const team = S.units.find(u => u.callin);
  assert(team && S.time - job.t0 <= 30, `no team after ${Math.round(S.time - job.t0)} s`);
  const d = IC.spawnThreat(S, 'owa', T.x + 250, T.y + 20, { route: [{ x: T.x - 300, y: T.y }], aim: { x: T.x - 300, y: T.y }, fromHostile: true });
  runRange(S, 700, () => d.dead);
  assert(d.dead && d.killer === team.name, `the drone was not shot down by the team (dead ${d.dead}, by ${d.killer})`);
  runRange(S, 900, () => !S.units.includes(team));
  assert(!S.units.includes(team), 'the team is still there');
  assert(S.time - job.t <= IC.callInStats(S).stay + 5, 'the team stayed longer than its time');
});
test('air defence: cruise missiles route through a gap in the radar cover', () => {
  const S = range(), T = S.range.target;
  const from = { x: T.x + 5000, y: T.y + 300 }, dx = T.x - from.x, dy = T.y - from.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const mid = { x: from.x + dx * 0.55, y: from.y + dy * 0.55 };
  for (let i = -3; i <= 3; i++) if (i !== 2) IC.rangeAddUnit(S, 'gf', mid.x + nx * i * 700, mid.y + ny * i * 700);
  const r = IC.enemyPlanRoute(S, from, T, true);
  let cross = null, p = from;
  for (const q of r) { const a = (p.x - mid.x) * ux + (p.y - mid.y) * uy, b = (q.x - mid.x) * ux + (q.y - mid.y) * uy; if (a <= 0 && b > 0) { const f = a / (a - b); cross = { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }; } p = q; }
  const slot = cross ? ((cross.x - mid.x) * nx + (cross.y - mid.y) * ny) / 700 : null;
  assert(cross && Math.abs(slot - 2) < 0.35, `the route crosses the radar line at slot ${slot && slot.toFixed(2)}, not in the gap at slot 2`);
  assert(IC.routeExposure(S, from, r, true) < IC.routeExposure(S, from, [T], true), 'the planned route is no less exposed than flying straight');
});
test('air defence: raids build up, strike, and are followed by a calm', () => {
  const S = IC.newGame({ seed: 12345, mode: 'campaign' });
  const ev = []; IC.on((S2, type, d) => { if (S2 === S && (type === 'raidWarning' || type === 'raidOver' || type === 'war')) ev.push({ type, t: S.time, d }); });
  const spawns = []; const sp = IC.spawnThreat;
  IC.spawnThreat = function (S2, type, x, y, o) { const t = sp(S2, type, x, y, o); if (S2 === S && t.op && IC.THR[type].dmg) spawns.push(S.time); return t; };
  try { run(S, 20, S => S.ad.roe = 'free'); } finally { IC.spawnThreat = sp; }
  const over = ev.filter(e => e.type === 'raidOver'), warn = ev.filter(e => e.type === 'raidWarning');
  assert(over.length >= 2, `only ${over.length} raids ended in 20 hours`);
  assert(warn.length >= 1 && warn[0].t < over[1].t, 'no intelligence warning before the second raid');
  const first = over.find(e => e.d.kind !== 'opening') || over[0];
  const quiet = spawns.filter(t => t > first.t && t < first.t + 5400);
  assert(!quiet.length, `${quiet.length} weapons launched in the 90 minutes after a raid ended`);
  assert(over.every(e => typeof e.d.text === 'string' && /shot down/.test(e.d.text)), 'a raid ended without an after-action report');
}, true);
test('test range: a raid against a defence reports shots, kills, leakers and the cost exchange', () => {
  const S = range(), T = S.range.target;
  IC.rangeAddUnit(S, 'mr3d', T.x - 100, T.y);
  IC.rangeAddUnit(S, 'mrsam', T.x - 60, T.y + 40);
  IC.rangeAddUnit(S, 'shorad', T.x + 30, T.y);
  IC.rangeSpawn(S, { what: 'mixed', n: 10, brg: 90, km: 150, alt: '' });
  runRange(S, 3600, S => S.range.pending.length === 0 && S.threats.every(t => t.mission === 'rtb' || t.mission === 'jam') && S.time - S.range.t0 > 600);
  const st = IC.rangeStats(S);
  assert(st.launched >= 10 && st.shots > 0 && st.kills > 0, `nothing happened: ${JSON.stringify(st)}`);
  assert(st.kills + st.leaks <= st.launched + 4, 'kills and leakers add up to more than was launched');
  assert(st.sys.some(x => x.sys === 'mrsam' && x.pk > 0) && st.ours > 0 && st.exchange > 0, 'no kill probability or cost exchange per system');
  const json = IC.rangeExport(S), before = st.launched;
  assert(IC.rangeImport(S, json), 'the scenario did not load back');
  runRange(S, 3600, S => S.range.pending.length === 0 && S.time - S.range.t0 > 600);
  assert(IC.rangeStats(S).launched === before, 'the replay did not send the same threats');
});

test('career: Act I runs with airline traffic', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  run(S, 8, player);
  assert(!S.over, `game ended: ${S.over}`);
  assert(S.av.flightsTotal > 40, `too few flights: ${S.av.flightsTotal}`);
  assert(S.av.paxTotal > 5000, `too few passengers: ${S.av.paxTotal}`);
  assert(S.story.goals.some(g => g.done), 'no goal completed');
}, true);
test('career: the Career starts with one country, no airports and the money to build the first', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  assert(!S.infra.some(i => i.kind === 'airport'), 'the Career starts with ready-made airports');
  assert(!S.units.length, `the Career starts with units: ${S.units.map(u => u.type).join(', ')}`);
  assert(S.budget >= 800, `not enough money to build an airport: ${U.money(S.budget)}`);
  assert(S.story.ch === 0 && IC.storyShown(S).filter(x => !x.g.done).length <= 2, 'more than two goals shown at the start');
  assert(!S.av.airlines.length, 'airlines before there is an airport');
  // what the story has not reached stays hidden
  assert(IC.storyLock(S, 'airways') && IC.storyLock(S, 'fields') && !IC.storyAllows(S, 'ssr') && !IC.storyLock(S, 'found'), 'locks at the start are wrong');
});
test('career: a player who does nothing stays in Act I for days, warned but not replaced', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  for (let t = 0; t < 4 * 86400 && !S.over; t += 2) IC.step(S, 2);
  assert(!S.over, `the game ended: ${S.over}`);
  assert(S.story.act === 1 && S.story.ch === 0, `left the first chapter without an airport (act ${S.story.act}, chapter ${S.story.ch + 1})`);
  assert(S.story.standing < 55 && S.story.standing >= 5, `confidence did not fall, or fell below the floor: ${S.story.standing.toFixed(0)}`);
  assert(S.logs.some(l => l.tag === 'MIN'), 'the Minister never asked about the airport');
}, true);
test('career: a scripted player builds the national airport and plays through Act I, chapter by chapter', () => {
  const { player } = require('../careerplayer.js');
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7 }); IC.S = S;
  const st = S.story, t0 = S.time;
  for (let i = 0; i < 7 * 86400 && st.act === 1 && !S.over; i++) { IC.step(S, 1); if (i % 60 === 0) player(S); }
  assert(!S.over, `the game ended: ${S.over}`);
  const L = st.chLog.map(c => `${c.ch + 1}@${((c.t - t0) / 3600).toFixed(1)}h`).join(' ');
  assert(st.chLog.map(c => c.ch).join() === '0,1,2,3,4,5', `chapters out of order or missing: ${L}`);
  assert(st.act === 2, `still in Act I after a week: ${L}`);
  // no chapter is rushed: each ran its minimum
  for (let i = 1; i < st.chLog.length; i++) { const c = st.chLog[i - 1], dur = (st.chLog[i].t - c.t) / 3600; if (c.ch > 0) assert(dur >= IC.CHAPTERS[c.ch].min - 2.01, `chapter ${c.ch + 1} lasted only ${dur.toFixed(1)} h: ${L}`); }
  assert((st.actT - t0) / 3600 >= 48, `Act I lasted only ${((st.actT - t0) / 3600).toFixed(1)} game hours: ${L}`);
  assert(IC.bases(S).filter(b => b.kind === 'airport').length >= 2 && S.av.airlines.length >= 4, 'no second airport, or few airlines');
}, true);
test('career: from Act III a day at zero confidence replaces you; before, it cannot', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  S.story.standing = 0; run(S, 0.5);
  assert(!S.over && S.story.standing >= 5, 'confidence fell below the Act I floor, or the player was replaced');
  IC.storyStartAct(S, 3);
  const atZero = h => { for (let i = 0; i < h * 3600 / 2 && !S.over; i++) { S.story.standing = 0; IC.step(S, 2); if (i % 60 === 0) for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0); } };
  atZero(12);
  assert(!S.over, `replaced after half a day: ${S.over}`);
  assert(/replaced in/.test(IC.storyDismissal(S).text), `the panel does not say how close dismissal is: ${IC.storyDismissal(S).text}`);
  atZero(13);
  assert(S.over && /replaced/.test(S.over), 'not replaced after a full day at zero');
}, true);
test('career: every act can be reached', () => {
  const S = IC.newGame({ seed: 2024, mode: 'story', preset: 'network', hour: 7 });
  for (const n of [2, 3, 4]) { IC.storyStartAct(S, n); run(S, 3, player); assert(!S.over, `act ${n} ended the game: ${S.over}`); assert(S.story.act >= n, `stuck before act ${n}`); }
}, true);
test('quick war: the enemy attacks and the defense fights', () => {
  // (with the scripted commander deploying the reserve and buying: on the large map the few units placed at the
  // start rarely stand where the first raids go)
  const S = IC.newGame({ seed: 12345, mode: 'campaign' });
  run(S, 10, Q.commander);
  assert(S.enemy.war, 'war never started');
  assert(S.stats.kills > 0 && S.stats.fired > 0, `no fighting: ${JSON.stringify(S.stats)}`);
}, true);
test('quick war: a sensible commander has two layers over what matters by the first strike, and radar along the border by the end of day 2', () => {
  const S = IC.newGame({ seed: 777, mode: 'campaign' });
  let first = null;
  for (let i = 0; S.time < 2 * 86400 && !S.over; i++) {
    IC.step(S, 0.5);
    if (i % 120 === 0) Q.commander(S);
    if (!first && S.enemy.war) first = Q.keyPlaces(S).map(p => ({ p, L: Q.layers(S, p, true) }));
  }
  assert(!S.over, `game ended: ${S.over}`);
  assert(first, 'the war never started');
  // an area battery and a point-defence system, set up and ready, over each
  for (const { p, L } of first) assert(L.has('area') && L.has('point'), `${p.name} had ${[...L].join(' and ') || 'nothing'} over it at the first strike`);
  const cov = Q.borderCover(S, true);
  assert(cov >= 0.75, `radars see only ${U.pct(cov)} of the hostile border at the end of day 2`);
  // money stays meaningful: running costs take most of the income by then
  assert(S.budget >= 0 && S.upkeep > S.income * 0.5, `treasury ${U.money(S.budget)}, income ${U.money(S.income)}/h against running costs ${U.money(S.upkeep)}/h`);
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
