/* Iron Canopy test suite. Runs the simulation headless and checks that it behaves.
   node tests/run.js            everything but the long balance runs, in parallel (one worker per core, up to 4)
   node tests/run.js airport    only tests whose name contains "airport"
   node tests/run.js --quick    skip the slow ones too (the Academy lessons and other long plays)
   node tests/run.js --slow     only the long balance runs (GitHub runs them every night)
   node tests/run.js --times    also rewrite tests/times.json, which orders the next runs longest first
   node tests/run.js --shard=1/2  one of two halves of equal length (by tests/times.json), for two machines at once
   IC_JOBS=n sets the number of workers (one per core by default, up to 8 and 1.6 GB of memory each); IC_JOBS=1
   runs everything in this process, one test after another.
   Every test starts from the same seeded random numbers (IC.seedRandom, from its name) and the same ids, so it plays
   out the same alone, in a full run or in any worker, and a failure can be repeated. */
const IC = require('../headless.js');
const { playLesson } = require('../academytest.js');
const Q = require('../qwplayer.js');
const U = IC.U;

const args = process.argv.slice(2);
const quick = args.includes('--quick'), slowOnly = args.includes('--slow');
const filter = args.find(a => !a.startsWith('--'));
const tests = [];
/* slow: true = left out of --quick; 'long' = a balance run, only in --slow. group: tests that share what they
   build (a generated world) run one after another in the same worker; group 'alone': tests that time the code. They
   run with the others, and one that fails is run again at the end with no other worker busy: only that counts */
const test = (name, fn, slow, group) => tests.push({ name, fn, slow, group });
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const run = (S, hours, each) => { for (let i = 0; i < hours * 3600 / 0.5 && !S.over; i++) { IC.step(S, 0.5); if (each && i % 120 === 0) each(S); } };
/* a player who approves feasible airline requests and answers decisions with the first option */
const player = S => {
  if (S.av) for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q)) IC.avDecide(S, q.id, true);
  if (S.story) for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0);
};

/* ---------- world ---------- */
/* a generated world per seed, shared by the tests that only read it (they run in one worker, group 'world') */
const worlds = {};
const world = seed => worlds[seed] || (worlds[seed] = IC.generate(seed));
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
    const W = world(seed), seen = reach(W, W.cities[0].id);
    const lost = W.cities.concat(W.villages.filter(v => v.home), W.infra).filter(p => !seen.has(p.id));
    assert(!lost.length, `seed ${seed}: cut off from the capital: ${lost.map(p => p.name).join(', ')}`);
  }
}, false, 'world');
test('world: motorways join the capital to the four largest cities', () => {
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    // (a motorway ends at the edge of town, where it meets one of the city's avenues)
    const W = world(seed), seen = reach(W, W.cities[0].id, e => e.cls === 'hw' || e.city);
    const big = W.cities.filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(0, 4);
    for (const c of big) assert(seen.has(c.id), `seed ${seed}: no motorway from the capital to ${c.name}`);
  }
}, false, 'world');
test('world: roads meet at junctions and do not run side by side', () => {
  const W = world(4242);
  const pair = new Set();
  for (const e of W.edges) { const k = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a; assert(!pair.has(k), `two roads between ${k}`); assert(e.a !== e.b, 'a road loops onto itself'); pair.add(k); }
  assert(Object.values(W.nodes).some(n => n.ix), 'no motorway interchanges');
  assert(W.bridges.length > 0, 'no bridges');
}, false, 'world');
test('world: every motorway-to-motorway junction has an interchange shape, with smooth slip roads', () => {
  let mm = 0, mx = 0;
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = world(seed);
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
}, false, 'world');
test('world: city streets end on another street or road', () => {
  for (const seed of [4242, 7]) {
    const W = world(seed);
    for (const c of W.cities) for (const l of c.streets) assert(!l.deadEnd, `seed ${seed}: a street in ${c.name} ends in the middle of nowhere`);
  }
}, false, 'world');
test('world: no road inside a city runs over a block', () => {
  for (const seed of [4242, 7]) {
    const W = world(seed);
    for (const c of W.cities) {
      const segs = [];
      for (const e of W.edges) for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        if (U.segDist(c.x, c.y, a.x, a.y, b.x, b.y) < c.ext + 5) segs.push([a.x, a.y, b.x, b.y, e.city ? 'art' : e.cls]);
      }
      const on = c.blocks.filter(b => IC.blockOnRoad(b, segs, -0.05));
      assert(!on.length, `seed ${seed}: ${on.length} blocks in ${c.name} stand on a road`);
    }
  }
}, false, 'world');
test('world: a national road entering a city goes on as one of its streets, or round it', () => {
  for (const seed of [4242, 7]) {
    const W = world(seed);
    let grid = 0, along = 0;
    for (const c of W.cities) {
      // the city's node is reached only by its own avenues, and no other road crosses the middle of town
      for (const e of W.edges) if (e.a === c.id || e.b === c.id) assert(e.city === c.id, `seed ${seed}: road ${e.id} (${e.cls}) runs into the middle of ${c.name} without becoming a street`);
      // (among the blocks of the inner half of the town; its gates are where the roads meet its edge)
      const gate = k => k.startsWith(c.id + ':');
      for (const e of W.edges) if (e.city !== c.id) e.pts.forEach((p, i) => {
        if ((i === 0 && gate(e.a)) || (i === e.pts.length - 1 && gate(e.b)) || U.dist(p, c) > c.ext * 0.5) return;
        assert(!c.blocks.some(b => U.dist(b, p) < 3.5), `seed ${seed}: road ${e.id} (${e.cls}) runs through the middle of ${c.name}`);
      });
      // in a grid city the avenues run along the grid (a few diagonal avenues aside)
      if (!['ny', 'chi', 'dxb'].includes(c.tpl)) continue;
      const F = IC.cityFrame(c);
      for (const e of W.edges) if (e.city === c.id && !e.diag) for (let i = 2; i < e.pts.length; i++) {
        const [u0, v0] = F.toG(e.pts[i - 1].x, e.pts[i - 1].y), [u1, v1] = F.toG(e.pts[i].x, e.pts[i].y), L = Math.hypot(u1 - u0, v1 - v0);
        const a = Math.abs(Math.atan2(v1 - v0, u1 - u0)) % (Math.PI / 2);
        grid += L; if (a < 0.05 || a > Math.PI / 2 - 0.05) along += L;
      }
    }
    assert(along > grid * 0.8, `seed ${seed}: only ${U.pct(along / grid)} of the avenues in grid cities run along the grid`);
    // motorways stop at the edge of town: a bypass round it, or the avenue in
    assert(W.edges.some(e => e.bypass), `seed ${seed}: no city has a motorway bypass`);
  }
}, false, 'world');
test('world: every map has cities laid out like each of the five plans, and no two alike', () => {
  for (const seed of [4242, 7, 99]) {
    const W = world(seed), by = {};
    for (const c of W.cities) (by[c.tpl] = by[c.tpl] || []).push(c);
    for (const t of ['ny', 'chi', 'lon', 'par', 'dxb']) assert(by[t] && by[t].length, `seed ${seed}: no city laid out like ${IC.CITY_TEMPLATES[t].sketch}`);
    for (const t in by) {
      const [a, b] = by[t].sort((p, q) => q.pop - p.pop);
      if (!b) continue;
      const turn = Math.abs(U.angWrap(4 * (a.grid - b.grid))) / 4, size = Math.abs(a.blocks.length - b.blocks.length) / Math.max(a.blocks.length, b.blocks.length);
      assert(turn > 0.03 || size > 0.1, `seed ${seed}: ${a.name} and ${b.name} are copies of each other`);
    }
  }
}, false, 'world');
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
    const W = world(seed);
    for (const c of W.cities) {
      const r = roundness(c.blocks); sum += r; n++;
      assert(r < 0.7, `seed ${seed}: ${c.name} is nearly round (${r.toFixed(2)})`);
    }
  }
  assert(sum / n < 0.5, `cities are round on average (${(sum / n).toFixed(2)})`);
}, false, 'world');
test('world: every map has cities of at least two styles, and districts in every city', () => {
  for (const seed of [4242, 7, 99, 12345, 2024]) {
    const W = world(seed), styles = new Set(W.cities.map(c => c.style));
    assert(styles.size >= 2, `seed ${seed}: only ${[...styles].join(', ')} cities`);
    assert(W.cities.some(c => c.style === 'eu') && W.cities.some(c => c.style === 'us'), `seed ${seed}: not both European and American cities`);
    assert(W.foreign.filter(f => W.side[f.k] === 'hostile').every(f => f.style === 'east' && f.blocks.length), `seed ${seed}: the enemy's towns are not built to their own plan`);
    for (const c of W.cities) {
      assert(c.blocks.every(b => IC.DISTRICTS[b.d]), `seed ${seed}: a block in ${c.name} has no district`);
      const m = c.mix; assert(m && Math.abs(Object.values(m).reduce((a, b) => a + b, 0) - 1) < 1e-6, `seed ${seed}: ${c.name} has no district mix`);
      assert(m.sub + m.dense > 0.25 && m.ind + m.log + m.rail > 0.03, `seed ${seed}: ${c.name} lacks housing or industry`);
    }
  }
}, false, 'world');
test('world: districts change what a city wants from its airport', () => {
  const W = world(4242), cs = W.cities.filter(c => !c.capital);
  const work = c => c.mix.ind + c.mix.log + c.mix.rail;
  const ind = cs.slice().sort((a, b) => work(b) - work(a))[0], res = cs.slice().sort((a, b) => work(a) - work(b))[0];
  const di = IC.cityDemand(ind), dr = IC.cityDemand(res);
  assert(di.cargo > dr.cargo * 1.5, `${ind.name} (industry ${U.pct(work(ind))}) wants little more cargo than ${res.name} (${U.pct(work(res))}): ${di.cargo.toFixed(2)} vs ${dr.cargo.toFixed(2)}`);
  // the same city with its offices turned into housing flies less on business
  const c = W.cities[0], d0 = IC.cityDemand(c);
  const flat = Object.assign({}, c, { mix: Object.assign({}, c.mix, { biz: 0, old: 0, dense: c.mix.dense + c.mix.biz + c.mix.old }) });
  assert(IC.cityDemand(flat).biz < d0.biz * 0.8 && IC.cityDemand(flat).leisure > d0.leisure, 'offices do not change the business and leisure mix');
  assert(/cargo/.test(IC.cityCharacter(ind).text), `the city panel does not say ${ind.name} is about cargo: ${IC.cityCharacter(ind).text}`);
}, false, 'world');
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
}, true, 'alone');
test('world: the map is about 5,700 × 4,300 km, with three times the towns of the smaller map', () => {
  assert(Math.abs(IC.WW / 10 - 5700) < 200 && Math.abs(IC.WH / 10 - 4300) < 200, `the map is ${IC.WW / 10} × ${IC.WH / 10} km`);
  for (const seed of [4242, 7, 99]) {
    const W = world(seed), home = W.villages.filter(v => v.home).length;
    // the smaller map had 18 cities and 80 villages
    assert(W.cities.length >= 54 && home >= 240, `seed ${seed}: ${W.cities.length} cities and ${home} villages`);
    // spread over the country, not bunched in the lowlands: no city more than 500 km from the next
    for (const c of W.cities) { const d = Math.min(...W.cities.filter(o => o !== c).map(o => U.dist(o, c))); assert(d < 5000, `seed ${seed}: ${c.name} is ${U.km(d)} from the nearest city`); }
    // the country spans most of the map
    const xs = W.poly.map(p => p[0]), ys = W.poly.map(p => p[1]);
    assert(Math.max(...xs) - Math.min(...xs) > IC.WW * 0.5 && Math.max(...ys) - Math.min(...ys) > IC.WH * 0.45, `seed ${seed}: the country is small on the map`);
  }
}, false, 'world');

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
  // (at every street where the zone's trips start and end; the demand: a jammed street carries as much both ways)
  const G = T.G, inbound = (h) => { S.time = h * 3600; count(); let i = 0, o = 0; for (const n of biz.nodes) for (const li of G.nodes[n].out) { const L = T.links[li], d = G.links[li].b === n ? 0 : 1; i += L.dem[d]; o += L.dem[1 - d]; } return [i, o]; };
  const [mi, mo] = inbound(8), [ei, eo] = inbound(17.5);
  assert(mi > mo && eo > ei, `rush hours do not run into town in the morning and out in the evening (08:00 ${mi.toFixed(2)} in, ${mo.toFixed(2)} out; 17:30 ${ei.toFixed(2)} in, ${eo.toFixed(2)} out)`);
});
test('traffic: at rush hour the side streets carry some traffic and the avenues the most', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const cap = IC.cap(S), T = S.traffic;
  S.traffic.stepT = 0; IC.traffic(S, 0.25);
  // by vehicles, not by how full: an avenue has two lanes each way and carries more at the same load
  const mine = T.links.filter(L => L.l.city === cap && L.l.len > 0.3), vol = L => L.load * L.C.dens * L.C.lanes;
  const top = mine.slice().sort((a, b) => vol(b) - vol(a)).slice(0, Math.ceil(mine.length * 0.05));
  const side = top.filter(L => L.cls === 'st');
  assert(!side.length, `${side.length} of the ${top.length} busiest links in ${cap.name} are side streets`);
  // homes are on quiet streets, but not empty ones
  const homes = T.zones.filter(z => z.city === cap && z.kind === 'home'), G = T.G;
  const res = []; for (const z of homes) for (const n of z.nodes) for (const li of G.nodes[n].out) if (T.links[li].cls === 'st') res.push(T.links[li]);
  const used = res.filter(L => L.load > 0.03).length;
  assert(res.length > 20 && used > res.length * 0.7, `only ${used} of ${res.length} residential streets carry traffic at 08:00`);
  // close in, vehicles drive the side streets too
  const z = homes.sort((a, b) => b.homes - a.homes)[0], view = { x0: z.x - 20, y0: z.y - 14, x1: z.x + 20, y1: z.y + 14 };
  let onSide = 0;
  for (let i = 0; i < 400; i++) { S.time += 0.5; IC.traffic(S, 0.5); const A = IC.trafficAgents(S, view, 0.5); if (i % 40 === 39) onSide += A.filter(a => a.route[a.ri][0].cls === 'st').length; }
  assert(onSide > 10, `close in, hardly any vehicles on the side streets (${onSide})`);
});
test('traffic: vehicles start at real places and drive the road graph like traffic', () => {
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
  // close in, vehicles leave zones with buildings, take the roads the flows say are busy, and park after a while
  const view = { x0: cap.x - 40, y0: cap.y - 25, x1: cap.x + 40, y1: cap.y + 25 };
  IC.trafficAgents(S, view, 0);
  const onLink = new Map();
  for (let i = 0; i < 1200; i++) {
    S.time += 0.5; IC.traffic(S, 0.5); IC.trafficAgents(S, view, 0.5);
    if (i % 20 === 0) for (const a of IC.trafficAgentsOf(S).list) { const id = a.route[a.ri][0].id; onLink.set(id, (onLink.get(id) || 0) + 1); }
  }
  const A = IC.trafficAgentsOf(S);
  assert(A.stats.spawnZone > 100, `few vehicles left the city's zones (${A.stats.spawnZone})`);
  assert(A.trips.length >= 10, `only ${A.trips.length} vehicles parked in ten minutes`);
  const connected = r => r.every(([lk, d], i) => IC.driveCanGo(lk, d) && (i === 0 || (r[i - 1][1] ? r[i - 1][0].a : r[i - 1][0].b) === (d ? lk.b : lk.a)));
  for (const tr of A.trips) {
    assert(tr.org && tr.org.blocks && tr.org.blocks.length, 'a vehicle started away from any buildings');
    assert(connected(tr.route), 'a vehicle jumped between roads that do not meet, or ran the wrong way along a slip road');
  }
  for (const a of A.list) assert(connected(a.route), 'a vehicle on the road follows a broken route');
  assert(A.list.some(a => a.pur === 'com') && A.list.some(a => a.pur === 'frt' || ['artic', 'box', 'tanker'].includes(a.k)), 'no commuters or lorries');
  // busy roads carry more of them than quiet ones
  const inView = T.links.filter(L => { const b = L.l.bb; return !(b[2] < view.x0 || b[0] > view.x1 || b[3] < view.y0 || b[1] > view.y1) && L.l.len > 0.5; });
  const per = L => (onLink.get(L.l.id) || 0) / L.l.len, busy = inView.filter(L => L.load > 0.5), quiet = inView.filter(L => L.load < 0.1);
  const avg = a => a.reduce((t, L) => t + per(L), 0) / Math.max(1, a.length);
  assert(busy.length && quiet.length && avg(busy) > avg(quiet) * 3, `busy roads (${avg(busy).toFixed(2)}) are not much busier close in than quiet ones (${avg(quiet).toFixed(2)})`);
  // buses run lines along the road graph, with stops
  assert(T.lines.some(l => l.kind === 'bus') && T.lines.some(l => l.kind === 'coach'), 'no bus or coach lines');
  for (const l of T.lines) { assert(connected(l.path), `${l.name} is not a connected route`); if (l.kind === 'bus') assert(l.stops.length >= 3, `${l.name} has no stops`); }
});
test('traffic: a cut road makes a visible queue, and close-in traffic turns back from it', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 8 });
  const T = S.traffic, G = T.G;
  for (let i = 0; i < 4; i++) { S.time += 0.25; IC.traffic(S, 0.25); }
  // the busiest main road link, and the junction at its start
  // (busy, but not already jammed: a jam cannot grow any longer)
  const L = T.links.filter(L => L.l.ref.edge && L.l.ref.edge.cls === 'rd' && L.l.len > 6 && L.ld[0] > 0.3 && L.ld[0] < 0.95).sort((a, b) => b.ld[0] - a.ld[0])[0];
  assert(L, 'no busy main road');
  const n0 = L.l.a, p = G.nodes[n0];
  // vehicles within 150 m of that junction on the roads that lead into it, as the middle zoom shows them
  const near = () => { let n = 0; IC.trafficVisible(S, { x0: p.x - 2, y0: p.y - 2, x1: p.x + 2, y1: p.y + 2 }, 0.05, (x, y) => { if (U.dist({ x, y }, p) < 1.5) n++; }); return n; };
  const before = near();
  L.l.cut = true; T.stepT = 0; IC.traffic(S, 0.25);
  const after = near();
  assert(after > before * 1.5 && after >= 4, `no queue in front of the cut road: ${before} vehicles by the junction before, ${after} after`);
  // close in: nobody drives onto the cut road; those who meet it queue, then turn back
  const view = { x0: p.x - 30, y0: p.y - 20, x1: p.x + 30, y1: p.y + 20 };
  IC.trafficAgents(S, view, 0);
  const onCut = new Set(IC.trafficAgentsOf(S).list.filter(a => a.route[a.ri][0] === L.l).map(a => a.id));
  for (let i = 0; i < 1200; i++) {
    S.time += 0.5;
    for (const a of IC.trafficAgents(S, view, 0.5)) assert(a.route[a.ri][0] !== L.l || onCut.has(a.id), 'a vehicle drove onto a cut road');
  }
  assert(IC.trafficAgentsOf(S).stats.turned > 0, 'no vehicle turned back in front of the cut road');
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
}, false, 'alone');

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
  // (the six-runway layout built in code: on the real Denver, arrivals on the outer runways cross the inner ones through
  // the same exits, which the panel's rating does not count, so demand set to the rating queues)
  const { S, ap } = kdenGame(12345, 9, 'kden6');
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
  // (the real Denver has no military ramp: the air wing gets a remote apron of its own, as a base would)
  if (!IC.aptStands(ap).some(s => s.zone === 'mil')) { const A = ap.parts.filter(p => p.kind === 'apron' && p.built && (p.stands || []).length >= 4 && !(p.stands || []).some(s => s.contact)).sort((a, b) => b.stands.length - a.stands.length)[0]; assert(A, 'no remote apron to make military'); A.zone = 'mil'; ap.dirty = true; IC.aptStats(S, ap); }
  S.roster.push({ id: 'rzone', name: 'Test flight', kind: 'aew', base: ap.id, st: 'ready', n: 1 });
  IC.assignSlots(S, ap);
  const r = S.roster.find(x => x.id === 'rzone'), stand = IC.aptStands(ap).find(s => s.id === r.slot);
  assert(stand && stand.zone === 'mil', `military flight parked in the ${stand ? stand.zone : 'open'}`);
  for (const k of ['turbo', 'narrow', 'wide', 'cargo']) for (let i = 0; i < 20; i++) { const s = IC.avFreeStand(S, ap, IC.ACTYPES[k]); if (s) { assert(s.zone !== 'mil', `${k} offered a military stand`); s.occ = 'z' + k + i; } }
  for (const s of IC.aptStands(ap)) if (/^z/.test(s.occ)) s.occ = null;
  // (four hours: after the relayout every airliner starts abroad, two or three hours' flight away on this map)
  run(S, 4, player);
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
  // (the real Denver: 566 parts and 2,500 taxi nodes, about a third more a step than the six-runway layout built in code)
  assert(t / N < 2, `a step takes ${(t / N).toFixed(2)} ms`);
}, false, 'alone');

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
    // (every class: the real Denver's small stands send turboprops too, and by day those line up and wait by default)
    const R = IC.opsOf(ap).r; for (const k of Object.keys(R.enter)) R.enter[k] = enter; IC.aptStats(S, ap);
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
test('builder: a build says it has started or is queued, and a refused one names what is in the way', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); S.budget = 1e5;
  const ap = S.infra.find(a => a.parts && a.parts.some(p => p.kind === 'runway'));
  const rw = ap.parts.find(p => p.kind === 'runway'), d = IC.rwDir(rw), n = { x: -d.y, y: d.x };
  const lay = k => { const m = IC.bldMode(S, ap, 'runway'), a = { x: rw.a.x + n.x * k, y: rw.a.y + n.y * k }, b = { x: rw.b.x + n.x * k, y: rw.b.y + n.y * k }; IC.buildInput(S, m, a, 0, 20); IC.buildInput(S, m, b, 0, 20); return [IC.buildInput(S, m, b, 0, 20), m]; };
  const [r1, m1] = lay(2.5);
  assert(r1 === 'built' && /planned: ₭/.test(m1.done) && /Work starts now/.test(m1.done), `the first runway says "${m1.done}"`);
  const [r2, m2] = lay(-2.5);
  assert(r2 === 'err' && /overlaps (the apron|Apron \d)/.test(m2.err), `a runway across the apron is refused with "${m2.err}"`);
  const m = IC.bldMode(S, ap, 'apron'), c = { x: ap.x + 30, y: ap.y + 30 };
  IC.buildInput(S, m, c, 0, 20); IC.buildInput(S, m, { x: c.x + 3, y: c.y + 2 }, 0, 20);
  assert(IC.buildInput(S, m, { x: c.x + 3, y: c.y + 2 }, 0, 20) === 'built' && /Queued: the crew is busy on Runway/.test(m.done), `the apron says "${m.done}"`);
});
test('builder: an apron lays out stands no larger than the size picked, and says when it could take bigger ones', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); S.budget = 1e5;
  const ap = S.infra.find(a => a.parts && a.parts.some(p => p.kind === 'runway'));
  const deep = { w: 4, h: 2 };
  assert(IC.apronStandSize(deep) === 'l' && IC.apronStandSize(Object.assign({ smax: 'm' }, deep)) === 'm' && IC.apronStandSize(Object.assign({ smax: 's' }, deep)) === 's', 'the picked size does not cap the stands');
  const m = IC.bldMode(S, ap, 'apron'); m.size = 'm';
  const c = { x: ap.x + 30, y: ap.y + 30 };
  IC.buildInput(S, m, c, 0, 20); IC.buildInput(S, m, { x: c.x + 4, y: c.y + 2 }, 0, 20);
  const plan = IC.bldPlanOf(S, m, { x: c.x + 4, y: c.y + 2 }, 0.2);
  assert(plan.text.some(t => /medium stands/.test(t) && /bigger stands/.test(t)), `the preview says ${plan.text.join(' · ')}`);
  assert(IC.buildInput(S, m, { x: c.x + 4, y: c.y + 2 }, 0, 20) === 'built', m.err);
  const apr = ap.parts[ap.parts.length - 1];
  assert(apr.kind === 'apron' && apr.smax === 'm', 'the apron did not keep the size picked');
});
test('airport: a runway under construction is not reported closed', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); S.budget = 1e5;
  const ap = S.infra.find(a => a.parts && a.parts.some(p => p.kind === 'runway'));
  const rw = ap.parts.find(p => p.kind === 'runway');
  assert(IC.rwyState(S, ap).open, 'the ready-made runway is not open');
  const saved = ap.parts.filter(p => p.kind === 'runway'); for (const p of saved) p.built = false;
  ap.works.push({ id: 'w-test', key: 'bd:' + rw.id, kind: 'build', label: 'Build runway', part: rw, prog: 0.14, stages: [] });
  IC.aptStats(S, ap);
  const st = IC.rwyState(S, ap);
  assert(st.building && /being built · 14%/.test(st.word), `a runway being built reads "${st.word}"`);
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
  assert(seen.join() === 'survey,earth,pave,mark,lights,open', `stages ran ${seen.join()}`);
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

/* snapping and guides: the capital of the ready-made network, in its own frame (x along the runway, which runs from
   -17 to 17; the parallel taxiway at y 1.8; the south apron from x -14.3 to -9.7, y -2.58 to -1.62) */
const snapAp = () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S; S.budget = 1e5;
  const ap = S.byId[S.story.cap], P = (x, y) => IC.aptLocal(ap, x, y), L = p => IC.rectLocal({ x: ap.x, y: ap.y, a: ap.rwyA }, p);
  return { S, ap, P, L, near: (a, b, e) => Math.abs(a - b) < (e || 1e-6) };
};
test('builder: a taxiway drawn off a runway locks square to it, and its length rounds to 10 m', () => {
  const { S, ap, P, L, near } = snapAp(), m = IC.bldMode(S, ap, 'taxi');
  IC.buildInput(S, m, P(4, 0), 0, 20);
  assert(m.pts[0].kind === 'rwy', `the first point is not on the runway: ${m.pts[0].kind}`);
  // six degrees off square
  const plan = IC.bldPlanOf(S, m, P(4.23, -2.2), 0.4), q = L(plan.snap);
  assert(near(q.x, 4) && near(q.y, -2.2), `the end is at ${q.x.toFixed(3)}, ${q.y.toFixed(3)}, not square 220 m out`);
  assert(/square to/.test(plan.snap.lock), `the lock says "${plan.snap.lock}"`);
  // without a lock the length still rounds to 10 m
  let n = 0;
  for (let k = 0; k < 40; k++) {
    const q2 = IC.bldPlanOf(S, m, P(6.43 + k * 0.137, -1.21 - k * 0.061), 0.4).snap, d = U.dist(q2, P(4, 0));
    if (q2.lock || q2.guides || q2.kind !== 'free') continue;
    n++; assert(near(d * 10, Math.round(d * 10), 1e-6), `a free leg is ${(d * 100).toFixed(2)} m long`);
  }
  assert(n >= 5, `only ${n} free legs tried`);
});
test('builder: moving a runway\'s far end after both are placed still locks it parallel to the first runway', () => {
  const { S, ap, P, L, near } = snapAp(), m = IC.bldMode(S, ap, 'runway');
  IC.buildInput(S, m, P(-17, -13), 0, 20); IC.buildInput(S, m, P(10, -13.6), 0, 20);
  assert(m.pts.length === 2, `${m.pts.length} points placed`);
  const s = IC.bldPlanOf(S, m, P(16.9, -14.1), 0.4).snap;
  assert(near(L(s).y, -13) && /along/.test(s.lock), `the far end is at ${L(s).x.toFixed(2)}, ${L(s).y.toFixed(2)} (${s.lock})`);
});
test('builder: a line keeps to 90° from the part it starts on, and Shift draws freely', () => {
  const { S, ap, P, L, near } = snapAp();
  // a taxiway at 34° to the runway, then a new one started on it
  IC.aptPlanTaxi(S, ap, [P(20, 5), P(26, 9)], 0.1);
  const m = IC.bldMode(S, ap, 'taxi');
  IC.buildInput(S, m, P(23, 7), 0, 20);
  assert(m.pts[0].kind === 'taxi', `the first point is not on the taxiway: ${m.pts[0].kind}`);
  const u = Math.atan2(4, 6) + Math.PI / 2 + 0.07, at = P(23 + Math.cos(u) * 2, 7 + Math.sin(u) * 2);
  const s = IC.bldPlanOf(S, m, at, 0.4).snap, a = Math.atan2(L(s).y - 7, L(s).x - 23);
  assert(near(a, Math.atan2(4, 6) + Math.PI / 2, 1e-6) && /square to the taxiway/.test(s.lock), `drawn at ${(a * 180 / Math.PI).toFixed(2)}° (${s.lock})`);
  const f = IC.bldPlanOf(S, m, at, 0.4, true).snap;
  assert(!f.lock && U.dist(f, at) < 1e-9, 'Shift did not draw freely');
});
test('builder: a point locks onto guides from edges and centrelines, and onto where two cross', () => {
  const { S, ap, P, L, near } = snapAp(), m = IC.bldMode(S, ap, 'taxi');
  // the south apron's far edge, extended east, meets the line of the taxiway at x 4
  const s = IC.bldPlanOf(S, m, P(4.05, -2.55), 0.4).snap, q = L(s);
  assert(s.guides && s.guides.length === 2 && near(q.x, 4) && near(q.y, -2.58), `snapped to ${q.x.toFixed(3)}, ${q.y.toFixed(3)} on ${(s.guides || []).map(g => g.what).join(', ')}`);
  // a line locked square to the runway stops on the apron edge's guide
  IC.buildInput(S, m, P(4, 0), 0, 20);
  const e = IC.bldPlanOf(S, m, P(4.2, -2.5), 0.4).snap;
  assert(near(L(e).y, -2.58) && e.lock && e.guides && /apron edge/.test(e.guides[0].what), `the end is at y ${L(e).y.toFixed(3)} (${e.guides ? e.guides[0].what : 'no guide'})`);
});
test('builder: readouts give each leg, the distance from the runway, and an apron\'s sides and depth', () => {
  const { S, ap, P } = snapAp(), m = IC.bldMode(S, ap, 'taxi');
  IC.buildInput(S, m, P(4, 0), 0, 20);
  const plan = IC.bldPlanOf(S, m, P(4.23, -2.2), 0.4), t = plan.marks.map(k => k.t);
  assert(t.includes('220 m') && t.some(x => /^220 m from the Runway .* centreline$/.test(x)), `the readouts are ${t.join(' | ')}`);
  const a = IC.bldMode(S, ap, 'apron');
  IC.buildInput(S, a, P(0, -4), 0, 20);
  const ta = IC.bldPlanOf(S, a, P(4.62, -5.02), 0.4).marks.map(k => k.t);
  assert(ta.includes('460 m') && ta.some(x => /^100 m deep · medium stands$/.test(x)), `the apron readouts are ${ta.join(' | ')}`);
});
test('builder: an area snaps to corners and flush to edges, and turns to line up with a part at an angle', () => {
  const { S, ap, P, L, near } = snapAp(), m = IC.bldMode(S, ap, 'apron');
  const c = IC.bldPlanOf(S, m, P(-9.73, -1.65), 0.4).snap;
  assert(c.kind === 'corner' && near(L(c).x, -9.7) && near(L(c).y, -1.62), `the corner snap is ${c.kind} at ${L(c).x.toFixed(3)}, ${L(c).y.toFixed(3)}`);
  const e = IC.bldPlanOf(S, m, P(-11, -2.64), 0.4).snap;
  assert(e.kind === 'edge' && near(L(e).y, -2.58), `the edge snap is ${e.kind} at y ${L(e).y.toFixed(3)}`);
  // a terminal turned 17° from the runway: an apron started against it turns with it
  const T = IC.aptPlanPart(S, ap, 'terminal', P(25, -9).x, P(25, -9).y, ap.rwyA + 0.3, 3, 1);
  assert(T, 'could not plan the turned terminal');
  const at = IC.rectWorld(T, 0.4, 0.55);
  IC.buildInput(S, m, at, 0, 20);
  const da = Math.abs(U.angWrap(m.rot - T.a)) % (Math.PI / 2);
  assert(m.pts.length === 1 && (da < 1e-6 || Math.PI / 2 - da < 1e-6), `the apron is turned ${(U.angWrap(m.rot - ap.rwyA) * 180 / Math.PI).toFixed(1)}° from the runway, the terminal ${(0.3 * 180 / Math.PI).toFixed(1)}°`);
});
test('builder: a taxiway through an apron is refused, drawn red, naming the apron; a building may not cover a taxiway', () => {
  const { S, ap, P } = snapAp(), m = IC.bldMode(S, ap, 'taxi');
  IC.buildInput(S, m, P(-2, 1.8), 0, 20);
  const plan = IC.bldPlanOf(S, m, P(-2.04, 3.6), 0.4);
  assert(!plan.ok && /runs through Apron \d/.test(plan.why) && plan.hit && plan.hit.kind === 'apron', `the plan says "${plan.why}"`);
  assert(IC.buildInput(S, m, P(-2.04, 3.6), 0, 20) === 'point' && IC.buildInput(S, m, P(-2.04, 3.6), 0, 20) === 'err' && /runs through/.test(m.err), `the click says "${m.err}"`);
  // ending on the apron's edge is how a taxiway joins it
  const j = IC.bldMode(S, ap, 'taxi'); IC.buildInput(S, j, P(-2, 1.8), 0, 20);
  const ok = IC.bldPlanOf(S, j, P(-2, 2.76), 0.4);
  assert(ok.ok && ok.snap.kind === 'apron', `a taxiway to the apron edge is refused: ${ok.why}`);
  const h = P(2, 1.8);
  assert(!IC.aptCanPlace(S, ap, { kind: 'hangar', x: h.x, y: h.y, a: ap.rwyA }) && /covers a taxiway/.test(IC.aptPlaceWhy), `a hangar on the taxiway: "${IC.aptPlaceWhy}"`);
});
test('builder: a part far bigger than needed says so before the click, with its price', () => {
  const { S, ap, P } = snapAp(), m = IC.bldMode(S, ap, 'apron');
  IC.buildInput(S, m, P(0, -4), 0, 20);
  const big = IC.bldPlanOf(S, m, P(14, -9.5), 0.4);
  assert(big.ok && /times what one airliner needs: ₭/.test(big.size) && /paving no aircraft uses/.test(big.size), `a 1.4 km apron says "${big.size}"`);
  const small = IC.bldPlanOf(S, m, P(2, -4.8), 0.4);
  assert(small.ok && !small.size, `a 200 m apron says "${small.size}"`);
  const r = IC.bldMode(S, ap, 'runway');
  IC.buildInput(S, r, P(-25, -15), 0, 20);
  assert(/longer than any airliner needs/.test(IC.bldPlanOf(S, r, P(25, -15), 0.4).size || ''), 'a 5 km runway says nothing');
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

/* ---------- the build bar: its tabs, the tools (brief 44) ---------- */
test('build bar: every tab has items, and each one can be placed on an airport', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S;
  const ap = S.byId[S.story.cap]; S.budget = 1e6;
  // the research the Career locks is done, so the whole bar is open
  if (S.tech) for (const k of Object.values(IC.APT_TECH)) S.tech.done.add(k);
  const P = (x, y) => IC.aptLocal(ap, x, y);
  const placed = [], skipped = [];
  for (const tab of IC.BB_TABS) {
    assert(tab.items.length, `tab ${tab.name} has no items`);
    for (const k of tab.items) {
      if (k === 'blueprint' && !(IC.showcaseKeys && IC.showcaseKeys().length)) { skipped.push(k); continue; }
      if (k.startsWith('road:')) { assert(IC.ROADS[k.slice(5)], `${k} is not a road the player may build`); skipped.push(k); continue; }
      const part = k === 'carpark' ? 'surface' : k;
      if (IC.APART[part]) assert(!IC.aptLockWhy(S, part), `${k} is still locked: ${IC.aptLockWhy(S, part)}`);
      // somewhere clear, well away from what is already built, in the airport's own frame
      const n = placed.length, c = P(-20 + (n % 6) * 7, 14 + Math.floor(n / 6) * 6);
      const m = IC.bldMode(S, ap, part);
      if (k === 'carpark') m.surf = 'asph';
      if (part === 'stand' || part === 'stretch' || part === 'exits' || part === 'hold' || part === 'parallel' || part === 'skybridge' || part === 'people' || part === 'ils' || part === 'alert') { skipped.push(k); continue; }   // (these need something to attach to: their own tests cover them)
      S.mode2 = m; S.hover = c;
      const cnt = () => ap.parts.length + (ap.svcRoads || []).length, n0 = cnt(), two = IC.bldIsArea(part) || IC.bldIsLine(part), c2 = { x: c.x + 4, y: c.y + 2.2 };
      IC.clickWorld(c, 0);
      if (two) { S.hover = c2; IC.clickWorld(c2, 0); }
      IC.clickWorld(two ? c2 : c, 0);
      assert(cnt() > n0, `${k} (${tab.name}) was not placed: ${m.err || 'no reason given'}`);
      placed.push(k);
    }
  }
  assert(placed.length >= 12, `only ${placed.length} of the bar's items were placed (skipped ${skipped.join(', ')})`);
  // and each one the player reads about has a price, a use and what it needs
  for (const tab of IC.BB_TABS) for (const k of tab.items) { const w = IC.BB_ITEM(S, k); assert(w.name && w.price && w.desc, `${k} has no name, price or description`); }
});
test('build bar: upgrading charges the difference and bulldozing refunds', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S;
  const ap = S.byId[S.story.cap]; S.budget = 1e5;
  const tx = ap.parts.find(p => p.kind === 'taxi' && p.built);
  // asphalt to concrete: the difference in price, not the whole price
  tx.mat = 'asph';
  const was = IC.partCost(ap, tx), to = IC.partCost(ap, Object.assign({}, tx, { mat: 'conc' }));
  const q = IC.bldUpgradeCost(S, ap, tx, { mat: 'conc' });
  assert(!q.why, `the upgrade was refused: ${q.why}`);
  assert(Math.abs(q.cost - (to - was)) < 1e-6 && q.cost > 0, `charged ${U.money(q.cost)}, the difference is ${U.money(to - was)}`);
  const b0 = S.budget;
  assert(IC.bldUpgrade(S, ap, tx, { mat: 'conc' }), 'the upgrade did not start');
  assert(tx.shut, 'the taxiway stays open while it is relaid');
  for (let i = 0; i < 4000 && ap.works.length; i++) tick(S, 2);
  assert(IC.paveOf(tx) === 'conc' && !tx.shut, `after the work it is ${IC.paveOf(tx)}${tx.shut ? ', still closed' : ''}`);
  const paid = b0 - S.budget;
  assert(Math.abs(paid - q.cost) < q.cost * 0.02, `paid ${U.money(paid)} for an upgrade quoted at ${U.money(q.cost)}`);
  // a cheaper material costs nothing and gives nothing back
  assert(IC.bldUpgradeCost(S, ap, tx, { mat: 'asph' }).cost === 0, 'a cheaper pavement is paid for');
  // a wider runway, and lights taken off a runway close it at night
  const rw = ap.parts.find(p => p.kind === 'runway' && p.built);
  const wq = IC.bldUpgradeCost(S, ap, rw, { mat: IC.paveOf(rw), w: 0.6, lit: true });
  assert(wq.cost > 0 && /60 m wide/.test(wq.what.join(' ')), `widening quoted ${U.money(wq.cost)} for ${wq.what.join(', ')}`);
  // bulldozing: what comes back is what the panel said, and it is booked
  const hangar = ap.parts.find(p => p.kind === 'hangar' && p.built);
  const r = IC.bldRefund(S, ap, hangar);
  assert(!r.why && r.refund > 0 && r.refund < IC.partCost(ap, hangar), `salvage ${U.money(r.refund)} of ${U.money(IC.partCost(ap, hangar))}`);
  const b1 = S.budget, n0 = ap.parts.length;
  assert(IC.bldBulldoze(S, ap, hangar), 'the hangar was not bulldozed');
  assert(ap.parts.length === n0 - 1 && Math.abs(S.budget - (b1 + r.refund)) < 1e-6, `bulldozing gave back ${U.money(S.budget - b1)} instead of ${U.money(r.refund)}`);
  // an apron with an aircraft on it is refused, with the reason
  const apr = ap.parts.find(p => p.kind === 'apron' && (p.stands || []).length);
  const st0 = IC.aptStands(ap).find(x => x.apron === apr.id);
  if (st0) { st0.occ = 'test'; const q2 = IC.bldRefund(S, ap, apr); assert(/parked/.test(q2.why || ''), `an occupied apron says "${q2.why}"`); assert(!IC.bldBulldoze(S, ap, apr), 'an occupied apron was bulldozed'); st0.occ = null; }
  // planned work not yet begun comes back in full
  const m = IC.bldMode(S, ap, 'hangar'), c = IC.aptLocal(ap, -18, 12);
  S.mode2 = m; S.hover = c; IC.clickWorld(c, 0); IC.clickWorld(c, 0);
  const p2 = ap.parts[ap.parts.length - 1];
  assert(p2 && !p2.built, 'the new hangar was not planned');
  const b2 = S.budget;
  assert(IC.bldBulldoze(S, ap, p2), 'the planned hangar was not removed');
  assert(S.budget >= b2 - 1e-6, `removing planned work cost ${U.money(b2 - S.budget)}`);
});
test('build bar: a building moves for half its price, and the info views read the airport', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S;
  const ap = S.byId[S.story.cap]; S.budget = 1e5;
  const fire = ap.parts.find(p => p.kind === 'fire' && p.built);
  const q = IC.bldRelocateCost(S, ap, fire);
  assert(!q.why && Math.abs(q.cost - IC.partCost(ap, fire) * 0.5) < 1e-6, `moving a built fire station quoted ${U.money(q.cost)} of ${U.money(IC.partCost(ap, fire))}`);
  const to = IC.aptLocal(ap, -14, 9), b0 = S.budget;
  assert(IC.bldRelocate(S, ap, fire, to.x, to.y, fire.a), 'the fire station did not move');
  assert(U.dist(fire, to) < 0.2 && !fire.built, 'it did not go to the new place as work');
  for (let i = 0; i < 6000 && ap.works.length; i++) tick(S, 2);
  assert(fire.built, 'it was never put up again');
  const paid = b0 - S.budget;
  assert(paid > 0 && Math.abs(paid - q.cost) < q.cost * 0.15, `moving cost ${U.money(paid)}, quoted ${U.money(q.cost)}`);
  // a runway is not moved: it is rebuilt
  assert(/rebuilt/.test(IC.bldRelocateCost(S, ap, ap.parts.find(p => p.kind === 'runway')).why), 'a runway can be picked up and moved');
  // the info views: each has a name and a sentence, and gathering runs headless
  for (const [k, v] of Object.entries(IC.INFO_VIEWS)) assert(v.name && /\.$/.test(v.desc), `info view ${k} has no name or its line does not end in a full stop`);
  const H = IC.infoGather(S, ap); tick(S, 600); IC.infoGather(S, ap);
  assert(H && H.e instanceof Map && H.s instanceof Map, 'the info views keep no record of the taxiways and stands');
});
/* ---------- airspace ---------- */
/* switch off every radar controllers could use: the civil radars and the approach radars at the airports */
const blind = S => {
  S.units = S.units.filter(u => u.type !== 'ssr');
  for (const b of IC.bases(S)) for (const p of b.parts || []) if (p.kind === 'atc') p.hp = 0;
  IC.step(S, 0.5); S.asp.scanT = 0; IC.step(S, 0.5);
};
/* a point d units from p, on the side away from the map edge */
/* ---------- airport life: buildings that fit together, aprons, services, landside ---------- */
test('airport life: a hangar placed near a taxiway snaps to it, faces it and connects', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S;
  const cap = S.byId[S.story.cap]; S.budget = 5000;
  const P = (x, y) => IC.aptLocal(cap, x, y);
  S.mode2 = IC.bldMode(S, cap, 'hangar');
  // 80 m beyond the edge of the parallel taxiway, not lined up with anything
  IC.clickWorld(P(6, 1.2), 0); IC.clickWorld(P(6, 1.2), 0);
  const h = cap.parts.filter(p => p.kind === 'hangar').pop();
  assert(h && !h.built, 'no hangar planned');
  const stub = cap.parts.filter(p => p.kind === 'taxi').pop();
  finishWorks(S, cap); IC.aptStats(S, cap);
  const da = Math.abs(U.angWrap(h.a - cap.rwyA)) % Math.PI;
  assert(da < 0.01 || Math.PI - da < 0.01, `the hangar is turned ${(da * 180 / Math.PI).toFixed(0)}° from the taxiway`);
  assert(h.linked, 'the hangar is not connected to the taxiways');
  assert(IC.partMeasure(cap, stub) < 0.6, `its connecting taxiway is ${U.km(IC.partMeasure(cap, stub))} long`);
  // and a departure can start from its door
  assert(IC.gopsCanDepart(S, cap, 'narrow', h.id + ':d'), 'no route from the hangar door to a runway');
});
test('airport life: an apron stretched by hand takes stands placed by hand, and aircraft use them', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S;
  const cap = S.byId[S.story.cap]; S.budget = 5000;
  const P = (x, y) => IC.aptLocal(cap, x, y), n0 = cap.parts.filter(p => p.kind === 'apron').length;
  // the remote apron south of the runway: pull its far edge out 80 m
  S.mode2 = IC.bldMode(S, cap, 'stretch');
  for (const q of [P(-12, -2.58), P(-12, -3.4), P(-12, -3.4)]) IC.clickWorld(q, 0);
  const strip = cap.parts.filter(p => p.kind === 'apron')[n0];
  assert(strip && Math.abs(strip.h - 0.8) < 0.06, `no 80 m strip: ${strip ? U.km(strip.h) : 'none'}`);
  finishWorks(S, cap);
  S.mode2 = IC.bldMode(S, cap, 'stand'); S.mode2.size = 'm';
  IC.clickWorld(P(-13.2, -3.0), 0);
  S.mode2.drive = true; IC.clickWorld(P(-11.4, -3.0), 0);
  assert(strip.ramp && strip.free.length === 2, `${strip.free ? strip.free.length : 0} stands placed on the new paving`);
  IC.aptStats(S, cap);
  const mine = strip.stands;
  assert(mine.every(s => s.linked), 'the stands on the new paving do not reach a runway');
  // every other stand is taken: an arrival must use one of ours, and a departure from the drive-through one leaves forwards
  for (const s of IC.aptStands(cap)) if (s.apron !== strip.id) s.occ = 'x';
  const s = IC.avFreeStand(S, cap, IC.ACTYPES.narrow);
  assert(s && s.apron === strip.id, 'the free stand chosen is not on the new paving');
  let parked = false;
  const q = IC.gopsFaf(S, cap, 'narrow');
  let m = 'hold';
  for (let i = 0; i < 2400 && typeof m === 'string'; i++) { m = IC.gopsLand(S, cap, { type: 'narrow', target: s.id, stand: s, who: 'TEST 1', faf: q, onPark: () => { parked = true; } }); if (typeof m === 'string') IC.step(S, 0.5); }
  assert(typeof m === 'object', `the arrival was never cleared (${m})`);
  for (let i = 0; i < 7200 && !parked; i++) IC.step(S, 0.5);
  assert(parked, `the arrival did not reach the stand; last phase ${m.phase}`);
  const d = mine.find(x => x.drive);
  let air = false;
  const dep = IC.gopsDepart(S, cap, { type: 'narrow', node: d.id, stand: d, startT: 0, who: 'TEST 2', onAir: () => { air = true; } });
  assert(dep && dep.node === d.id + 'o', 'a drive-through departure does not leave by the nose');
  for (let i = 0; i < 7200 && !air; i++) IC.step(S, 0.5);
  assert(air && !(dep.gmLog || []).includes('push'), `drive-through departure: ${air ? 'pushed back' : 'never took off, phase ' + dep.phase}`);
});
test('airport life: an arrival at a remote stand gets buses; one at a gate a jet bridge once researched, else passengers walk', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S;
  // (fair weather: a Career starts in January, and winter fog would divert the arrivals this test watches)
  sky(S, 'clear');
  const cap = S.byId[S.story.cap], seen = {};
  const look = () => { for (const s of IC.aptStands(cap)) if (s.svc && s.occ === s.svc.tail) seen[(s.contact ? 'gate:' : 'remote:') + s.svc.kind] = (seen[(s.contact ? 'gate:' : 'remote:') + s.svc.kind] || 0) + 1; };
  // keep one kind of stand taken at a time, so the arrivals must use the other
  const only = gate => { for (const s of IC.aptStands(cap)) { if (s.occ === 'x') s.occ = null; if (!s.occ && !!s.contact !== gate) s.occ = 'x'; } };
  only(false);
  for (let i = 0; i < 3600 * 3 && !seen['remote:bus']; i++) { IC.step(S, 0.5); if (i % 60 === 0) look(); }
  only(true);
  for (let i = 0; i < 3600 * 3 && !seen['gate:walk']; i++) { IC.step(S, 0.5); if (i % 60 === 0) look(); }
  assert(seen['remote:bus'], `no remote stand was served by bus: ${JSON.stringify(seen)}`);
  assert(seen['gate:walk'] && !seen['gate:bridge'], `before the research, gates should have passengers walking: ${JSON.stringify(seen)}`);
  const bus = IC.aptStands(cap).find(s => s.svc && s.svc.kind === 'bus');
  assert(bus.svc.n >= 1, 'a remote stand got no buses');
  S.tech.done.add('p_bridge');
  for (const k in seen) delete seen[k];
  only(true);
  for (let i = 0; i < 3600 * 4 && !seen['gate:bridge']; i++) { IC.step(S, 0.5); if (i % 60 === 0) look(); }
  assert(seen['gate:bridge'], `after the research no gate used a jet bridge: ${JSON.stringify(seen)}`);
  assert(/gate/.test(IC.partNow(S, cap, cap.parts.find(p => p.kind === 'terminal'))), 'the terminal panel does not say what it is doing');
});
test('airport life: a departure stops at the fuel stand, then takes off, and its ground movements are counted', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 }); IC.S = S;
  const cap = S.byId[S.story.cap]; S.budget = 5000;
  const P = (x, y) => IC.aptLocal(cap, x, y);
  S.mode2 = IC.bldMode(S, cap, 'fuelpad');
  IC.clickWorld(P(10, 1.2), 0); IC.clickWorld(P(10, 1.2), 0);
  const pad = cap.parts.find(p => p.kind === 'fuelpad');
  assert(pad, 'no fuel stand planned');
  finishWorks(S, cap); IC.aptStats(S, cap);
  assert(pad.linked, 'the fuel stand is not connected');
  // a turboprop fills up at the fuel stand on its way out
  const s = IC.aptStands(cap).find(x => !x.occ && x.linked !== false);
  let air = false;
  const m = IC.gopsDepart(S, cap, { type: 'turbo', node: s.id, stand: s, startT: 0, who: 'TEST 3', tail: { id: 'x' }, onAir: () => { air = true; } });
  assert(m && m.via && m.via.length === 1, 'the departure plans no stop at the fuel stand');
  for (let i = 0; i < 7200 && !air; i++) IC.step(S, 0.5);
  assert(air, `never took off; phase ${m.phase}`);
  assert((m.gmLog || []).includes('fuel') && m.gm >= 2, `ground movements: ${JSON.stringify(m.gmLog)}`);
  assert(pad.served && pad.served.length >= 1 && /refuelled/.test(IC.partNow(S, cap, pad)), 'the fuel stand does not count what it served');
});
test('airport life: an aircraft due for maintenance is towed to a hangar, stays there a day or more, and comes back', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S;
  const cap = S.byId[S.story.cap];
  let tl = null;
  for (let i = 0; i < 7200 && !tl; i++) { IC.step(S, 0.5); tl = S.av.tails.find(t => t.at === cap.id && t.where === 'stand' && t.t > 1500); }
  assert(tl, 'no aircraft on a stand');
  tl.legs = 99; tl.mxDue = 1;
  IC.emit(S, 'tailParked', { tl, ap: cap });
  assert(tl.mx, 'not scheduled for maintenance although a hangar is free');
  run(S, 1.5);
  const h = cap.parts.find(p => p.kind === 'hangar' && (p.inside || []).some(x => x.tl === tl.id));
  assert(tl.where === 'hangar' && h, `after 90 min the aircraft is ${tl.where}, not in a hangar`);
  run(S, 22);
  assert(tl.where === 'hangar', `it left the hangar within a day (${tl.where})`);
  assert(/maintenance/.test(IC.partNow(S, cap, h)), 'the hangar panel does not say what is inside');
  // (its stay is up to two and a half days: bring the end forward)
  const x = h.inside.find(y => y.tl === tl.id);
  assert(x.until - S.time > 0, 'the stay was shorter than a day');
  x.until = S.time + 60;
  run(S, 1.5);
  assert(tl.where !== 'hangar' && tl.where !== 'lost', `when its stay was over it is still ${tl.where}`);
}, true);
test('airport life: a locked material cannot be chosen until its research is done', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S;
  const cap = S.byId[S.story.cap]; S.budget = 5000;
  const P = (x, y) => IC.aptLocal(cap, x, y);
  assert(!IC.bldPick(S, 'rconc') && (S.bldPref || {}).mat !== 'rconc', 'reinforced concrete could be chosen before its research');
  assert(!IC.aptPlanTaxi(S, cap, [P(10, 1.8), P(10, 5)], 0.1, { mat: 'rconc' }), 'a reinforced concrete taxiway was planned before its research');
  assert(IC.aptLockWhy(S, 'hydrant') && IC.aptLockWhy(S, 'gradar'), 'the hydrant system and ground radar are not locked at the start of the Career');
  const t = IC.TECH.find(x => x.id === 'p_rconc');
  assert(t && /Opens: reinforced concrete/.test(t.desc), 'the research does not say which airport item it opens');
  S.tech.done.add('p_rconc');
  assert(IC.bldPick(S, 'rconc') && S.bldPref.mat === 'rconc', 'reinforced concrete cannot be chosen after its research');
  assert(IC.aptPlanTaxi(S, cap, [P(10, 1.8), P(10, 5)], 0.1, { mat: 'rconc' }), 'no reinforced concrete taxiway after the research');
  // outside the Career every item is open
  const Q = IC.newGame({ seed: 12345, mode: 'campaign' });
  assert(!IC.aptLockWhy(Q, 'hydrant'), 'Quick war locks airport items');
});
test('airport life: a new airport gets an access road to its city, and its cost is shown', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  S.budget = 5000;
  const t = townWithSite(S); assert(t, 'no site near any town');
  const b0 = S.budget, w0 = S.econ.works.length, sv = IC.foundSurvey(S, t.p.x, t.p.y, IC.PREVAIL);
  const ap = IC.foundAirport(S, t.p.x, t.p.y, IC.PREVAIL);
  assert(ap, 'could not found the airport');
  const paid = b0 - S.budget - sv.cost;
  const w = S.econ.works.find(x => x.apt === ap.id);
  assert(w && S.econ.works.length === w0 + 1, 'no access road works started');
  assert(ap.land && ap.land.access && ap.land.access.cost > 0 && S.logs.some(l => /access road/.test(l.text || l.msg || '') && /₭/.test(l.text || l.msg || '')), 'the access road and its cost are not reported');
  const near = IC.cities(S).slice().sort((a, b) => U.dist(a, ap) - U.dist(b, ap))[0];
  // it opens as a road and brings the airport within reach of its city
  for (let i = 0; i < 48 * 360 && S.econ.works.some(x => x.id === w.id); i++) IC.step(S, 10);
  assert(!S.econ.works.some(x => x.id === w.id), 'the access road never opened');
  assert(S.world.edges.some(e => e.player && U.dist(e.pts[0], ap) < 8 || e.player && U.dist(e.pts[e.pts.length - 1], ap) < 8), 'no road reaches the airport');
  assert(Math.abs(paid - ap.land.access.cost) < 0.01, `the road cost ${U.money(ap.land.access.cost)} but ${U.money(paid)} was paid`);
});
test('airport life: the landside grows with passengers and pays a small income', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 9 }); IC.S = S;
  const cap = S.byId[S.story.cap];
  run(S, 5);
  const L = cap.land, kinds = new Set(L.items.map(x => x.kind));
  assert(L.pax > 100 && kinds.has('park') && kinds.has('stop'), `after 5 hours with ${Math.round(L.pax)} passengers an hour: ${[...kinds].join(', ') || 'nothing'}`);
  assert(L.items.every(it => !IC.aptOnPart(cap, it, 0.05) && !cap.parts.some(p => p.kind === 'runway' && IC.partDist(cap, p, it) < 1.5)), 'a landside item stands on the airfield');
  assert(S.econ.book.landside > 0, 'the landside earned nothing');
}, true);
test('airport life: a radar and a beacon can stand inside the airport, but not on a runway', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 });
  const cap = S.byId[S.story.cap], P = (x, y) => IC.aptLocal(cap, x, y);
  const inside = P(-6, -2.8);
  assert(IC.aptInFence(cap, inside), 'the test point is not inside the fence');
  assert(IC.canPlace(S, 'ssr', inside.x, inside.y), 'a beacon cannot be placed inside the airport');
  const on = P(0, 0.3);
  assert(!IC.canPlace(S, 'ssr', on.x, on.y), 'a beacon can be placed on the runway');
});

/* ---------- nothing overlaps (brief 39) ---------- */
const overlapsOf = (S, ap) => IC.aptOverlaps(S, ap).map(o => `${ap.name}: ${o.text}`);
/* the landside at its fullest: passengers and cargo far beyond any real day */
const growLand = (S, ap) => { const L = IC.landInit(ap); for (let i = 0, n = -1; i < 60 && L.items.length !== n; i++) { n = i < 3 ? -1 : L.items.length; ap.paxRate = 9000; ap.mvLog = Array.from({ length: 8 }, () => ({ type: 'cargo', k: 'arr' })); L.pax = 9000; L.cargo = 400; L.t = 0; IC.landsideTick(S, ap, 1); } };
test('overlaps: nothing overlaps on the starting airports of three worlds, even with the landside grown in full', () => {
  const bad = [];
  for (const [seed, mode] of [[12345, 'story'], [777, 'quick'], [9001, 'quick']]) {
    IC.seedRandom(seed);
    const S = IC.newGame({ seed, mode, preset: mode === 'story' ? 'network' : undefined, hour: 8 });
    for (const ap of IC.bases(S)) { if (ap.kind === 'airport') growLand(S, ap); bad.push(...overlapsOf(S, ap)); }
    // the country's own roads to each airport end at a gate on its landside, outside the fence
    for (const ap of IC.bases(S)) { const n = S.world.nodes[ap.id]; if (n && n.gate) assert(!IC.aptInFence(ap, n), `${ap.name}: its road ends inside the fence`); }
  }
  assert(!bad.length, `${bad.length} overlaps: ${bad.slice(0, 4).join(' ')}`);
}, true);
test('overlaps: the KDEN-scale airport has none, laid out or built by hand on a new site', () => {
  const { S, ap } = kdenGame(12345, 9);
  const a = overlapsOf(S, ap);
  assert(!a.length, `laid out: ${a.length}: ${a.slice(0, 3).join(' ')}`);
  const { buildKden, finishAll } = require('../kdenbuild.js');
  const K = buildKden(12345, true); finishAll(K.S, K.ap); growLand(K.S, K.ap);
  const b = overlapsOf(K.S, K.ap);
  assert(!b.length, `built by hand: ${b.length}: ${b.slice(0, 3).join(' ')}`);
  // the airport's own road was moved round the airfield as it grew, not left under the runways
  const acc = K.S.world.edges.filter(e => e.apt === K.ap.id || e.a === K.ap.id || e.b === K.ap.id);
  assert(acc.length && acc.every(e => e.pts.every(p => !IC.aptOnPart(K.ap, p, 0.05))), 'the access road still runs over the airfield');
}, true);
test('overlaps: the builder refuses a building on a taxiway, a road or the landside, and says what it would hit', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.S = S; S.budget = 1e5;
  const cap = S.byId[S.story.cap];
  growLand(S, cap);
  // on a taxiway
  const tw = cap.parts.find(p => p.kind === 'taxi' && p.nodes.length > 2), n = cap.nodes[tw.nodes[1]];
  assert(!IC.aptCanPlace(S, cap, { kind: 'fire', x: n.x, y: n.y, a: 0 }) && /taxiway/.test(IC.aptPlaceWhy), `a fire station on a taxiway: "${IC.aptPlaceWhy}"`);
  // on the landside: a car park and its road
  const park = cap.land.items.find(it => it.kind === 'park');
  assert(!IC.aptCanPlace(S, cap, { kind: 'hangar', x: park.x, y: park.y, a: park.a }) && /car park/i.test(IC.aptPlaceWhy), `a hangar on the car park: "${IC.aptPlaceWhy}"`);
  const kerb = cap.land.roads.find(r => r.kerb), mid = { x: (kerb.pts[0].x + kerb.pts[1].x) / 2, y: (kerb.pts[0].y + kerb.pts[1].y) / 2 };
  assert(!IC.aptCanPlace(S, cap, { kind: 'fuel', x: mid.x, y: mid.y, a: 0 }) && /road/.test(IC.aptPlaceWhy), `a fuel tank on the kerb road: "${IC.aptPlaceWhy}"`);
  // on a country road outside the airfield (within the site)
  const e = S.world.edges.find(e => e.pts.some(p => U.dist(p, cap) < 50 && U.dist(p, cap) > 25 && IC.aptInSite(S, cap, p) && !IC.aptInFence(cap, p)));
  if (e) { const p = e.pts.find(p => U.dist(p, cap) < 50 && U.dist(p, cap) > 25 && IC.aptInSite(S, cap, p)); assert(!IC.aptCanPlace(S, cap, { kind: 'hangar', x: p.x, y: p.y, a: 0 }) && /road|street|lane/.test(IC.aptPlaceWhy), `a hangar on a road: "${IC.aptPlaceWhy}"`); }
  // clear ground is fine
  assert(IC.aptOverlaps(S, cap).length === 0, 'the test airport overlaps before anything is built');
});

/* ---------- roads where they meet (brief 46) ---------- */
const roadWorld = (() => { let W = null; return () => W || (W = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }).world); })();
const halfAt = z => k => IC.roadWidth(k, z) / 2;
test('roads: a T junction has curb returns tangent to both edges, and no disc', () => {
  const W = roadWorld(), R = IC.roadJoins(W);
  // (not the rare forks where two roads leave at almost the same angle)
  const T = R.joins.filter(j => j.kind === 'tj' && j.arms.length === 3 && IC.joinGeom(j, halfAt(200)).gaps.every(g => g > 0.3));
  assert(T.length > 50, `only ${T.length} T junctions`);
  for (const j of T.slice(0, 40)) {
    const G = IC.joinGeom(j, halfAt(200)), F = G.fil.filter(Boolean);
    assert(F.length >= 2, `a T junction at ${j.x | 0}, ${j.y | 0} has ${F.length} curb returns`);
    for (const f of F) {
      // the arc's centre is its radius away from each road's edge line: tangent, not a blob
      const dA = Math.abs((f.O.x - G.N.x) * -f.A.uy + (f.O.y - G.N.y) * f.A.ux) - f.A.h, dB = Math.abs((f.O.x - G.N.x) * -f.B.uy + (f.O.y - G.N.y) * f.B.ux) - f.B.h;
      assert(Math.abs(dA - f.R) < 1e-6 && Math.abs(dB - f.R) < 1e-6, `a curb return is not tangent (${dA.toFixed(4)}, ${dB.toFixed(4)} against ${f.R.toFixed(4)})`);
      assert(f.R >= 0.03 || f.A.len < 0.5 || f.B.len < 0.5, `a curb return of ${(f.R * 100).toFixed(0)} m on country roads`);
    }
    // the junction's surface follows the roads: far from round (a disc would be as wide every way)
    const d = G.surf.map(p => Math.hypot(p.x - G.N.x, p.y - G.N.y)), lo = Math.min(...d), hi = Math.max(...d);
    assert(hi > lo * 1.6, `the junction at ${j.x | 0}, ${j.y | 0} is round (${lo.toFixed(3)} to ${hi.toFixed(3)})`);
  }
  // and nothing on the map is drawn as a circle at a T junction: the painter has no disc for them
  const src = require('fs').readFileSync(require('path').join(__dirname, '../iron-canopy/js/render-roads.js'), 'utf8');
  assert(!/function kerbs\(/.test(src) && !/j\.kind === 'tj'[^\n]*arc\(/.test(src), 'the road painter still stamps discs on junctions');
});
test('roads: a main road\'s centre line and far edge run straight through a minor junction; the minor road gives way', () => {
  const W = roadWorld(), R = IC.roadJoins(W);
  const T = R.joins.filter(j => j.kind === 'tj' && j.arms.length === 3 && j.arms.filter(a => a.cls === 'rd').length === 2 && j.arms.some(a => a.cls === 'lc' || a.cls === 'sp'));
  assert(T.length >= 5, `only ${T.length} main-road T junctions`);
  let straight = 0;
  for (const j of T) {
    const G = IC.joinGeom(j, halfAt(200));
    assert(G.main && G.main.every(i => G.arms[i].cls === 'rd'), `the main road at ${j.x | 0}, ${j.y | 0} is not the main road (${G.main})`);
    const minor = G.arms.findIndex((a, i) => !G.main.includes(i));
    assert(minor >= 0 && G.mouth[minor] > 0, 'the minor road has no mouth to give way at');
    // where the main road runs straight on, its far side has no curb return: the edge line continues
    const [i, k] = G.main, a = G.arms[i], b = G.arms[k];
    if (-(a.ux * b.ux + a.uy * b.uy) > 0.995) { straight++; const far = (i + 1) % 3 === k ? i : k; assert(!G.fil[far], 'a curb return on the straight side of a main road'); }
  }
  assert(straight > 0, 'no straight main road through a junction to check');
});
test('roads: a roundabout has a kerbed island, flared entries with curb returns tangent to the ring, and splitter islands', () => {
  const W = roadWorld(), R = IC.roadJoins(W);
  assert(R.rbs.length >= 10, `only ${R.rbs.length} roundabouts`);
  for (const j of R.rbs) {
    const G = IC.rbGeom(j, halfAt(200));
    assert(G.Ri > 0.1 && G.Ro > G.Ri + 0.05, `the roundabout at ${j.x | 0}, ${j.y | 0}: island ${G.Ri.toFixed(2)}, ring to ${G.Ro.toFixed(2)}`);
    for (const a of G.arms) {
      assert(a.he > a.ha * 1.2, 'an entry is not flared');
      for (const sd of a.side) assert(Math.abs(Math.hypot(sd.Q.x - G.C.x, sd.Q.y - G.C.y) - (G.Ro + Math.hypot(sd.Q.x - sd.Tc.x, sd.Q.y - sd.Tc.y))) < 1e-6, 'an entry curb is not tangent to the ring');
      let area = 0; for (let i = 0; i < a.isl.length; i++) { const p = a.isl[i], q = a.isl[(i + 1) % a.isl.length]; area += p.x * q.y - q.x * p.y; }
      assert(Math.abs(area) / 2 > 1e-4, 'an entry has no splitter island');
      assert(a.gy.length === 2, 'an entry has no give-way line');
    }
  }
});
test('roads: an interchange\'s slip roads leave and join the motorway with a taper, and a gore where they part', () => {
  const W = roadWorld(), R = IC.roadJoins(W), hw = halfAt(200)('hw'), hr = halfAt(200)('ramp');
  const M = R.ends.filter(e => e.kind === 'merge');
  assert(M.length >= 40, `only ${M.length} slip road ends on motorways`);
  let gores = 0;
  for (const e of M) {
    const T = IC.taperGeom(e, hw, hr), n = T.lane.length;
    if (T.gore) gores++;
    // (a loop that starts beside the junction's bridge runs on its own parallel lane: no room for a taper there)
    if (T.len < 0.3) continue;
    const wAt = i => { const p = T.lane[i], q = T.aux[T.aux.length - 1 - i]; return Math.hypot(p.x - q.x, p.y - q.y); };
    // full width beside the slip road, tapering to nothing at the far end
    assert(wAt(0) > hr * 1.5, `the auxiliary lane is ${(wAt(0) * 100).toFixed(1)} m wide at the slip road`);
    assert(wAt(n - 1) < 0.01 || T.lane.length < 3, `the taper ends ${(wAt(n - 1) * 100).toFixed(1)} m wide`);
  }
  assert(gores >= M.length * 0.9, `only ${gores} of ${M.length} slip roads have a gore`);
});
test('roads: no road surface crosses another at grade: over the deck, on a bridge, or at a junction', () => {
  const W = roadWorld(), R = IC.roadJoins(W);
  let n = 0;
  for (const J of W.junctions) for (const r of J.ramps || []) {
    const P = r.pts, others = J.dirs.filter(d => d.e).map(d => ({ pts: d.e.pts, over: (J.over || []).includes(d.a) }));
    for (const o of others) for (let i = 1; i < P.length; i++) for (let k = 1; k < o.pts.length; k++) {
      const A = P[i - 1], B = P[i], C = o.pts[k - 1], D = o.pts[k], t = U.segX(A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y); if (t < 0) continue;
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t; n++;
      const atEnd = Math.min(U.dxy(x, y, P[0].x, P[0].y), U.dxy(x, y, P[P.length - 1].x, P[P.length - 1].y)) < 0.35;
      const underDeck = o.over && U.dxy(x, y, J.x, J.y) < 0.6;
      const bridge = R.xings.some(q => U.dxy(q.x, q.y, x, y) < 0.05);
      assert(atEnd || underDeck || bridge, `a slip road crosses a road at grade at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    }
  }
  assert(n > 0, 'no crossings to check');
  // at every interchange one road crosses over the other on a deck; a railway is crossed on a bridge, or level by a small road
  for (const J of W.junctions) if (J.kind === 'mm' || J.kind === 'mx') assert(J.over && J.over.length, `the interchange at ${J.x | 0}, ${J.y | 0} has no bridge`);
  for (const x of IC.railCrossings(W)) assert(x.level === (x.cls === 'lc' || x.cls === 'sp'), `a ${x.cls} road crosses the railway ${x.level ? 'level' : 'on a bridge'}`);
});
test('roads: city streets cross at kerbed corners that meet the blocks\' lots, never cutting into a building', () => {
  const W = roadWorld(), c = W.cities[0], J = IC.streetJoins(W, c);
  assert(J.length > 300, `only ${J.length} street crossings in the capital`);
  const inRect = (b, x, y, m) => { const ca = Math.cos(b.a), sa = Math.sin(b.a), lx = (x - b.x) * ca + (y - b.y) * sa, ly = -(x - b.x) * sa + (y - b.y) * ca; return Math.abs(lx) < b.w / 2 + m && Math.abs(ly) < b.h / 2 + m; };
  let arcs = 0, cut = 0, meet = 0;
  for (const j of J) {
    const G = IC.joinGeom(j, k => IC.ROAD_SPEC[k].w / 2);
    for (const f of G.fil) {
      if (!f) continue;
      arcs++;
      const mid = f.arc[f.arc.length >> 1], near = c.blocks.filter(b => !b.empty && U.dxy(b.x, b.y, mid.x, mid.y) < 6);
      if (near.some(b => inRect(b, mid.x, mid.y, -0.02))) cut++;
      if (near.some(b => inRect(b, mid.x, mid.y, 0.25))) meet++;
    }
  }
  assert(arcs > J.length * 2, `only ${arcs} kerbed corners at ${J.length} crossings`);
  assert(cut <= arcs * 0.005, `${cut} of ${arcs} kerbed corners cut into a building`);
  assert(meet >= arcs * 0.35, `only ${meet} of ${arcs} kerbed corners meet a block's lot`);
});
test('roads: the landside\'s roads meet at kerbed corners and T junctions', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }), cap = S.byId[S.story.cap];
  growLand(S, cap);
  const J = IC.landJoins(cap);
  assert(J.length >= 6, `only ${J.length} junctions on the capital's landside`);
  const F = J.map(j => IC.joinGeom(j, () => 0.06)).flatMap(G => G.fil.filter(Boolean));
  assert(F.length >= J.length, `only ${F.length} curb returns at ${J.length} landside junctions`);
});

/* ---------- shapes: outlines, bridges, movers, two-level roads (brief 39) ---------- */
const MINI = require('./fixtures/mini-layout.js');
/* the made-up test field in place of the capital's airport, turned by rot */
const miniGame = (rot, hour) => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: hour == null ? 9 : hour }); IC.S = S;
  const ap = S.byId[S.story.cap];
  if (S.av) { S.av.tails = []; S.av.routes = []; }
  S.threats = S.threats.filter(t => !t.tail);
  IC.aptFromLayout(ap, MINI, { x: ap.x, y: ap.y, rot: rot || 0 });
  ap._seatKey = null; IC.aptReseat(S, ap); IC.aptStats(S, ap);
  return { S, ap };
};
test('shapes: a layout of outlines becomes an airport: stands on the aprons, gates at the terminals, all of them reached from a runway and back', () => {
  const { S, ap } = miniGame();
  const st = IC.aptStands(ap);
  assert(st.length === MINI.stands.length, `${st.length} stands of ${MINI.stands.length}`);
  assert(st.every(s => s.contact), `${st.filter(s => !s.contact).map(s => s.name).join(', ')} not at a gate`);
  assert(IC.aptOverlaps(S, ap).length === 0, IC.overlapText(IC.aptOverlaps(S, ap)));
  // an L-shaped terminal measures its own outline, not its bounding box
  const t = ap.parts.find(p => p.name === 'Main Terminal');
  assert(Math.abs(IC.partMeasure(ap, t) - (16 * 2.6 - 9 * 1)) < 0.05, `the terminal measures ${IC.partMeasure(ap, t).toFixed(2)} ha`);
  const rwA = ap.parts.find(p => p.kind === 'runway').id + ':a';
  for (const s of st) {
    assert(IC.aptPath(ap, rwA, s.id, false, IC.ACTYPES.narrow.ht) && IC.aptPath(ap, s.id, rwA, true, IC.ACTYPES.narrow.ht), `stand ${s.name} cannot be reached from the runway and back`);
    assert(s.linked, `stand ${s.name} is not linked`);
  }
  assert(ap.parts.find(p => p.kind === 'runway').name === 'Runway 09/27', 'the runway lost its real name');
});
test('shapes: a passenger bridge over a taxiway lets a narrow-body under and keeps a wide-body out', () => {
  const { S, ap } = miniGame();
  const br = ap.parts.find(p => p.kind === 'skybridge'), rwA = ap.parts.find(p => p.kind === 'runway').id + ':a';
  const far = IC.aptStands(ap).find(s => s.name === '11');
  assert(br.clear === 13 && far.maxHt === 12, `the stand beyond the bridge takes tails up to ${far.maxHt} m`);
  assert(IC.aptPath(ap, rwA, far.id, false, IC.ACTYPES.narrow.ht), 'a narrow-body (11.8 m) cannot pass under a 13 m bridge');
  assert(!IC.aptPath(ap, rwA, far.id, false, IC.ACTYPES.wide.ht), 'a wide-body (18.5 m) was routed under a 13 m bridge');
  // and an airline never sends one there
  far.size = 'l';
  const T = IC.ACTYPES.wide;
  assert(!(IC.STAND_FITS[far.size].includes(T.stand) && !(far.maxHt && T.ht > far.maxHt)), 'a wide-body would be given the stand beyond the bridge');
});
test('shapes: the two levels of the kerb road never meet, and at one level they would', () => {
  const { S, ap } = miniGame();
  const up = ap.land.roads.find(r => r.kind === 'upper'), lo = ap.land.roads.find(r => r.kind === 'lower');
  assert(up.lv === 1 && lo.lv === 0 && IC.aptOverlaps(S, ap).length === 0, 'the two decks are reported as overlapping');
  // a road across the kerb at grade, with no junction, is reported; the same road on the upper deck is not
  ap.land.roads.push({ pts: [IC.layoutXf({ x: ap.x, y: ap.y })(12, -8.9), IC.layoutXf({ x: ap.x, y: ap.y })(12, -10)], w: 0.1, lv: 0, kind: 'drive' });
  assert(IC.aptOverlaps(S, ap).some(o => o.kind === 'road'), 'a road across the arrivals road at grade is not reported');
  ap.land.roads[ap.land.roads.length - 1].lv = 1;
  assert(!IC.aptOverlaps(S, ap).some(o => o.kind === 'road' && /arrivals/.test(o.text)), 'a road on the upper deck is reported as crossing the arrivals road');
});
test('import: an OpenStreetMap extract becomes a layout the game builds: stands, gates, the bridge and its height, the mover, the roads', () => {
  const { importAirport } = require('../tools/airport-import.js');
  const L = importAirport('mini');
  assert(L.runways.length === 1 && L.runways[0].ends.join('/') === '09/27', 'the runway');
  assert(L.stands.length === MINI.stands.length && L.stands.every(s => s.ref), `${L.stands.length} stands with gate numbers`);
  assert(L.bridges.length === 1 && L.bridges[0].clear === 13, 'the bridge and its clearance from min_height');
  assert(L.movers.length === 1 && L.movers[0].lv === -1 && L.movers[0].stops.length === 2, 'the underground mover between the two terminals');
  assert(L.roads.some(r => r.lv === 1) && L.roads.some(r => !r.lv), 'the two levels of the kerb road');
  assert(L.parks.some(p => p.kind === 'garage' && p.lvls === 5), 'the garage and its levels');
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 9 }); IC.S = S;
  const ap = S.byId[S.story.cap];
  IC.aptFromLayout(ap, L, { x: ap.x, y: ap.y }); ap._seatKey = null; IC.aptReseat(S, ap); IC.aptStats(S, ap);
  const st = IC.aptStands(ap);
  assert(st.length === L.stands.length && st.every(s => s.linked && s.contact), `${st.filter(s => !s.linked).length} stands cut off, ${st.filter(s => !s.contact).length} not at a gate`);
  assert(IC.aptOverlaps(S, ap).length === 0, IC.overlapText(IC.aptOverlaps(S, ap)));
});
test('showcase: the showcase opens with the real airport at the capital, on a flat site, with nothing overlapping and airlines using it', () => {
  IC.REAL_APT.mini = MINI;
  IC.seedRandom(12345);
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', showcase: 'mini', hour: 9 }); IC.S = S;
  const ap = S.byId[S.story.cap];
  assert(S.showcase === 'mini' && ap.showcase === 'mini' && ap.name === MINI.name, 'the capital\'s airport is not the showcase');
  assert(U.dist(ap, IC.cap(S)) < 1000, `the showcase is ${(U.dist(ap, IC.cap(S)) / 10).toFixed(0)} km from the capital`);
  assert(IC.aptOverlaps(S, ap).length === 0, IC.overlapText(IC.aptOverlaps(S, ap)));
  // the country's road comes to the airport's own road, outside the fence
  const n = S.world.nodes[ap.id];
  assert(n && ap.exits.some(e => U.dist(e, n) < 0.05) && !IC.aptInFence(ap, n), 'the country\'s road does not end at the airport\'s road');
  assert(!S.camp.cards.length && !S.story.goals.length, 'the showcase shows the Career\'s cards or goals');
  for (let i = 0; i < 4 * 3600; i++) IC.step(S, 0.25);
  assert(S.av.tails.some(t => t.at === ap.id || t.dest === ap.id || t.from === ap.id), 'no airline flies to the showcase airport');
  delete IC.REAL_APT.mini;
});
test('blueprint: a real airport planned onto a new site, turned, is paid for as it is built and works like the original', () => {
  IC.REAL_APT.mini = MINI;
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 9 }); IC.S = S; S.budget = 1e5;
  const c = IC.cap(S); let ap = null;
  for (let d = 150; d < 500 && !ap; d += 20) for (let k = 0; k < 12 && !ap; k++) { const x = c.x + Math.cos(k) * d, y = c.y + Math.sin(k) * d; if (!IC.foundCheck(S, x, y)) ap = IC.foundAirport(S, x, y, 0); }
  assert(ap, 'no site to found an airport on');
  // turned until it fits the site (clear of rivers)
  let rot = 0.5, C = null; for (let k = 0; k < 18; k++, rot += 0.35) { C = IC.bldBlueprintCheck(S, ap, 'mini', ap.x, ap.y, rot); if (C.ok) break; }
  assert(C.ok, C.why);
  // it must fit: not across the border
  const far = IC.bldBlueprintCheck(S, ap, 'mini', S.world.WW || 1e6, 0, 0);
  assert(!far.ok && /border|lake/.test(far.why), `a blueprint off the map: "${far.why}"`);
  const b0 = S.budget, made = IC.bldBlueprint(S, ap, 'mini', ap.x, ap.y, rot);
  assert(made && made.length === C.parts && ap.works.length >= made.length, 'the blueprint was not planned part by part');
  assert(b0 - S.budget < C.cost * 0.2, `paid ${U.money(b0 - S.budget)} up front of ${U.money(C.cost)}`);
  // a second one on top is refused, naming what it would hit
  const again = IC.bldBlueprintCheck(S, ap, 'mini', ap.x, ap.y, rot);
  assert(!again.ok && /overlaps/.test(again.why), `a second blueprint on top: "${again.why}"`);
  for (let i = 0; i < 80 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
  ap.dirty = true; IC.aptStats(S, ap);
  const st = IC.aptStands(ap);
  assert(st.length === MINI.stands.length && st.every(s => s.linked && s.contact), `${st.filter(s => !s.linked).length} stands cut off`);
  assert(IC.aptOverlaps(S, ap).length === 0, IC.overlapText(IC.aptOverlaps(S, ap)));
  delete IC.REAL_APT.mini;
}, true);
test('accuracy: each real airport against its sources: runway ends within 30 m, gates within 5%, terminal footprints within 10%', () => {
  const { accuracy, accuracyText } = require('../tools/airport-import.js');
  // (the real airports from map data: the blueprints made from kits have their own tests)
  const keys = ['mini'].concat(Object.keys(IC.REAL_APT).filter(k => IC.REAL_APT[k].icao && !IC.REAL_APT[k].bp));
  for (const k of keys) {
    const A = accuracy(k, k === 'mini' ? require('../tools/airport-import.js').importAirport('mini') : null);
    console.log(accuracyText(A).split('\n').map(l => '        ' + l).join('\n'));
    // (within 30 m of OurAirports, or within what its coordinates can say where it gives them to 0.001°; on the map's
    // runway line either way)
    for (const r of A.runways) { if (r.ourairports != null) assert(r.ourairports <= Math.max(30, r.prec || 0), `${A.name} ${r.name}: an end ${r.ourairports} m from OurAirports`); if (r.osm != null) assert(r.osm <= 30, `${A.name} ${r.name}: an end ${r.osm} m across the map's runway line`); }
    const g = A.gates; if (g.src && g.src.gates) assert(Math.abs(g.game / g.src.gates - 1) <= 0.05, `${A.name}: ${g.game} gates against ${g.src.gates} in the map`);
    for (const t of A.terminals) if (t.off != null) assert(Math.abs(t.off) <= 10, `${A.name} ${t.name}: ${t.off}% off its footprint`);
  }
});
test('showcase: a day at each real airport at its busy schedule: no gridlock, departures on the runways the wind picks, passengers at the gates', () => {
  IC.REAL_APT.mini = MINI;
  // (the real airports from map data: the blueprints made from kits have their own tests)
  const keys = [['mini', 6]].concat(Object.keys(IC.REAL_APT).filter(k => IC.REAL_APT[k].icao && !IC.REAL_APT[k].bp).map(k => [k, 24]));
  for (const [k, hours] of keys) {
    IC.seedRandom(4242);
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', showcase: k, hour: 5 }); IC.S = S;
    const ap = S.byId[S.story.cap];
    const r = { dep: 0, arr: 0, wrongRw: 0, gate: 0, bus: 0, cargo: 0 };
    const off = IC.on((S2, type, d) => {
      if (S2 !== S || !d || d.ap !== ap) return;
      if (type === 'rwMove') { r[d.k] = (r[d.k] || 0) + 1; const c = ap.cfg && ap.cfg.rw[d.rw]; if (c && ((d.k === 'dep' && c.role === 'arr') || (d.k === 'arr' && c.role === 'dep'))) r.wrongRw++; }
      if (type === 'tailParked') { const s = IC.aptStands(ap).find(x => x.id === d.tl.stand); if (s && s.svc) r[s.svc.kind === 'cargo' ? 'cargo' : s.svc.kind === 'bus' ? 'bus' : 'gate']++; }
    });
    for (let i = 0; i < hours * 3600 * 4; i++) IC.step(S, 0.25);
    off();
    const kp = ap.kpi, oldest = ap.moves.reduce((m, x) => Math.max(m, S.time - x.born), 0);
    console.log(`        ${ap.name}: ${hours} h, ${r.arr} arrivals and ${r.dep} departures (${Math.round((r.arr + r.dep) / hours)} an hour), ${r.gate} parked at gates, ${r.bus} by bus, ${r.cargo} at cargo stands; ${kp.div || 0} diversions, ${kp.grid || 0} gridlocks; the oldest on the ground ${U.dur(oldest)}`);
    // (what the oldest is doing, when it has been there too long)
    for (const m of ap.moves.filter(x => S.time - x.born > 2 * 3600).slice(0, 3)) {
      const st = m.path && m.path[m.pi], on = st && ap.eo && ap.eo.get(st.e.key) || [];
      console.log(`          ${m.who} ${m.kind} ${m.type} phase=${m.phase} holding=${m.holding || '-'} wait=${U.dur(m.waitT || 0)} node=${m.node} step=${m.pi}/${m.path ? m.path.length : '-'} next=${st ? st.e.kind + ' ' + st.e.key + ' len ' + st.e.len.toFixed(2) : '-'} t=${Math.round(m.t || 0)} stuck=${!!m.stuck} tow=${!!m.tow} at ${m.x.toFixed(1)},${m.y.toFixed(1)}; on that edge: ${on.map(o => `${o.m.who} ${o.m.kind} ${o.m.phase} d=${o.d}${o.pre ? ' pre' : ''} dead=${!!o.m.dead} in moves=${ap.moves.includes(o.m)} hold=${o.m.holding || '-'} node=${o.m.node} s=${(o.m.s || 0).toFixed(2)}`).join(' | ') || 'nobody'}; claim=${ap.claim && ap.claim.get(st.e.key) ? ap.claim.get(st.e.key).m.who : '-'}`);
    }
    assert(!kp.grid && !kp.stuck, `${ap.name}: ${kp.grid || 0} gridlocks, ${kp.stuck || 0} stranded`);
    assert(r.wrongRw === 0, `${ap.name}: ${r.wrongRw} movements on a runway set for the other kind`);
    assert(oldest < 3 * 3600, `${ap.name}: an aircraft has been on the ground ${U.dur(oldest)}`);
    assert(r.gate > 0 && r.arr + r.dep >= (k === 'mini' ? 30 : 400), `${ap.name}: ${r.arr + r.dep} movements, ${r.gate} at gates`);
  }
  delete IC.REAL_APT.mini;
}, true);
test('shapes: a layout turned and moved works like the original', () => {
  const A = miniGame(0), B = miniGame(1.1);
  const sa = IC.aptStands(A.ap), sb = IC.aptStands(B.ap);
  assert(sa.length === sb.length && sb.every(s => s.linked && s.contact), 'the turned layout lost stands or gates');
  assert(IC.aptOverlaps(B.S, B.ap).length === 0, IC.overlapText(IC.aptOverlaps(B.S, B.ap)));
  const st = [IC.aptStats(A.S, A.ap), IC.aptStats(B.S, B.ap)];
  assert(st[0].movesPerHour === st[1].movesPerHour, `rated ${st[0].movesPerHour} against ${st[1].movesPerHour} movements an hour`);
  // turned 63 degrees, runway 09/27 becomes 15/33
  assert(B.ap.parts.find(p => p.kind === 'runway').name === 'Runway 15/33', B.ap.parts.find(p => p.kind === 'runway').name);
  const r = drive(B.S, B.ap, { arr: 10, dep: 10, hours: 2, fill: 0.5, mix: [['narrow', 1]] });
  assert(r.grid === 0 && r.stuck === 0 && r.arr + r.dep >= 25, `turned: ${r.arr} arrivals, ${r.dep} departures, ${r.grid} gridlocks, ${r.stuck} stranded`);
}, true);

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
test('airspace: a pair that loses spacing is reported once, however long they stay close', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  blind(S);
  // two airliners side by side, 6 km apart, flying the same way at the same height: they stay too close for long
  const m = off(IC.cap(S), 0.4, 600), q = off(m, 0, 4000);
  const mk = (p, cs) => IC.spawnThreat(S, 'civ', p.x, p.y, { dest: off(q, 0, 0), wps: [off(p, 0, 4000)], orig: { x: p.x, y: p.y, edge: true }, cs, sq: IC.squawk(), alt: 9.5, cruise: 9.5, pax: 100, plan: null, route: [q], aim: q });
  const a = mk(off(m, Math.PI / 2, 30), 'TST 101'), b = mk(off(m, -Math.PI / 2, 30), 'TST 202');
  const seen = { lossSep: 0, nearMiss: 0 };
  IC.on((S2, type, d) => { if (S2 === S && seen[type] != null && (d.a === a || d.b === a)) seen[type]++; });
  const ctl = IC.ASP.ctl; IC.ASP.ctl = 1;
  // for 20 minutes, looked at again every 5 minutes
  try { for (let i = 0; i < 2400; i++) IC.step(S, 0.5); } finally { IC.ASP.ctl = ctl; }
  assert(seen.lossSep + seen.nearMiss > 0, 'no loss of separation recorded');
  assert(seen.lossSep <= 1 && seen.nearMiss <= 1, `reported again and again: ${JSON.stringify(seen)}`);
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
  const bad = fly(A, B, { careless: true, alt: 0.9 });
  assert(bad.zones.size && bad.inc, 'a careless pilot crossed the capital without an infringement incident');
}, true);

/* a quiet sky: only the flights a test makes */
const quiet = S => { S.threats = S.threats.filter(t => !t.d.civil); S.civT = S.gaT = 1e9; if (S.av) { S.av.tails = []; S.av.routes = []; } };
test('airspace: two airliners crossing 2,000 ft apart keep their spacing; 500 ft apart they lose it', () => {
  const cross = dzFt => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
    quiet(S); blind(S);
    const [a, b] = pair(S, IC.cap(S), 9.5);
    b.alt = b.cruise = 9.5 + dzFt / IC.FT;
    let lost = 0, minD = 1e9;
    IC.on((S2, type, d) => { if (S2 === S && (type === 'lossSep' || type === 'nearMiss') && (d.a === a || d.b === a)) lost++; });
    // controllers too busy to step in: what counts is the spacing itself
    const ctl = IC.ASP.ctl; IC.ASP.ctl = 0.01;
    try { for (let i = 0; i < 400; i++) { IC.step(S, 0.5); minD = Math.min(minD, U.dist(a, b)); } } finally { IC.ASP.ctl = ctl; }
    assert(minD < 30, 'the two airliners never crossed');
    const sp = IC.aspSpacing(S, a, Object.assign({}, b, { x: a.x, y: a.y }));
    return { lost, sp };
  };
  const far = cross(2000), close = cross(500);
  assert(!far.lost && !far.sp.lost, 'airliners 2,000 ft apart were counted as a loss of spacing');
  assert(close.lost && close.sp.lost, 'airliners 500 ft apart crossed without a loss of spacing');
});
test('airspace: a light aircraft stays out of a class C shelf unless cleared', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 9 });
  const ap = S.byId[S.story.reg];
  IC.aspPreset(S, ap, 'C');
  const C = IC.aspVols(S, ap).filter(v => v.cls === 'C');
  assert(C.length >= 2, 'the class C shape has no shelf');
  const shelf = C.find(v => v.kind === 'shelf'), mid = (shelf.r0 + shelf.r1) / 2;
  // a line through the middle of the shelf ring, well clear of the core
  const A = off(off(ap, 0.2 + Math.PI / 2, mid), 0.2, 700), B = off(off(ap, 0.2 + Math.PI / 2, mid), 0.2 + Math.PI, 700);
  const fly = o => {
    const t = IC.gaLaunch(S, A, B, Object.assign({ xpdr: true, alt: 0.9 }, o));
    let inC = 0, n = 0;
    for (let i = 0; i < 12000 && !t.dead; i++) { IC.step(S, 0.5); if (t.alt > 0.2 && IC.aspVolsAt(S, t.x, t.y, t.alt).some(v => v.cls === 'C')) inC++; if (U.dist(t, ap) < shelf.r1) n++; }
    return { t, inC, n };
  };
  const out = fly({});
  assert(out.t.dead && out.n > 50, 'the light aircraft never flew under the shelf');
  assert(!out.inC, `a light aircraft without clearance was inside a class C shelf for ${out.inC} steps`);
  const inn = fly({ cleared: [ap.id] });
  assert(inn.inC > 20, 'a light aircraft cleared into the class C airspace still kept under it');
}, true);
test('airspace: arrivals are sequenced, and held in a stack at different levels when the runway is busy', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
  const cap = S.byId[S.story.cap], gap0 = IC.atcGap;
  // a slow runway: one arrival every 400 s
  IC.atcGap = (S2, ap) => ap === cap ? 400 : gap0(S2, ap);
  const seq = new Map();
  let stack = null;
  try {
    for (let i = 0; i < 8 * 7200 && !stack; i++) {
      IC.step(S, 0.5);
      if (i % 20) continue;
      for (const t of S.threats) if (t.seq && t.toApt === cap.id) seq.set(t.id, t.slot);
      for (const st of IC.atcStacks(S, cap)) {
        const settled = st.lv.filter(t => t.inHold && Math.abs(t.alt - t.lvl) < 0.05);
        if (settled.length >= 2) stack = settled.map(t => t.alt);
      }
    }
  } finally { IC.atcGap = gap0; }
  const slots = [...seq.values()].sort((a, b) => a - b);
  assert(slots.length >= 3, `only ${slots.length} arrivals were sequenced`);
  for (let i = 1; i < slots.length; i++) assert(slots[i] - slots[i - 1] >= 399, `two landing slots only ${Math.round(slots[i] - slots[i - 1])} s apart`);
  assert(stack, 'no arrivals were held in a stack');
  stack.sort((a, b) => a - b);
  for (let i = 1; i < stack.length; i++) assert(stack[i] - stack[i - 1] > 0.29, `two aircraft in the stack only ${Math.round((stack[i] - stack[i - 1]) * IC.FT)} ft apart`);
}, true);
test('airspace: an overloaded sector has more near misses than a well-staffed one', () => {
  const misses = staff => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 });
    quiet(S); IC.step(S, 0.5);
    const cap = IC.cap(S), acc = IC.aspSectors(S).find(s => s.kind === 'acc');
    IC.aspSetStaff(S, acc, staff);
    let n = 0;
    IC.on((S2, type) => { if (S2 === S && type === 'nearMiss') n++; });
    // sixteen pairs meeting head on at the same level, spread round the capital, under radar
    for (let k = 0; k < 16; k++) { const c = off(cap, k / 16 * 6.283, 900 + (k % 4) * 150); pair(S, c, 8 + (k % 5) * 0.61); }
    for (let i = 0; i < 400; i++) IC.step(S, 0.5);
    return n;
  };
  const busy = misses(1), calm = misses(12);
  assert(busy > calm, `one controller: ${busy} near misses; twelve: ${calm}`);
  assert(calm <= 2, `a well-staffed sector under radar let ${calm} near misses happen`);
});
test('airspace: the shapes are valid for the six-runway KDEN layout', () => {
  const { S, ap } = kdenGame(12345, 10);
  IC.step(S, 0.5);
  for (const k of ['D', 'C', 'B']) {
    IC.aspPreset(S, ap, k);
    const bad = IC.aspCheck(S, ap).filter(w => /final approach|pass under/.test(w));
    assert(!bad.length, `${k}: ${bad.join(' ')}`);
    // every runway end's final approach fix is inside the core, and the core reaches the ground
    const ctr = IC.aspVols(S, ap).find(v => v.kind === 'ctr');
    assert(ctr && ctr.lo === 0, `${k}: no core from the ground up`);
    for (const f of IC.aspFafs(ap)) assert(U.dist(f, ap) < ctr.r1, `${k}: the final approach to ${f.end} starts outside the core`);
    assert(IC.aspSectors(S).some(s => s.ap === ap.id && s.kind === 'twr' && s.staff > 0), `${k}: no tower controllers`);
  }
});
test('airspace: a new airport starts with the small shape, and the next size up is suggested when traffic and radar support it', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  S.budget = 5000;
  const t = townWithSite(S); assert(t, 'no site near any town');
  const ap = IC.foundAirport(S, t.p.x, t.p.y, IC.PREVAIL);
  IC.step(S, 0.5);
  const sh = IC.aspShapeOf(S, ap);
  assert(sh && sh.key === 'D' && sh.rings.length === 1, `a new airport got ${sh && sh.key}`);
  assert(IC.aspShapeOf(S, S.byId[S.story.cap]).key === 'C', 'the international airport does not start with class C');
  assert(IC.bases(S).filter(b => b.kind === 'airbase' && b.owner === 'us').every(b => IC.aspShapeOf(S, b).key === 'M'), 'an air base has no military zone');
  assert(!IC.aspSuggest(S, ap).ok, 'class C suggested for an airport with no traffic');
  ap.mvLog = []; for (let i = 0; i < 30; i++) ap.mvLog.push({ t: S.time - i * 60, k: 'x', type: 'arr' });
  ap.st.radar = true;
  const sg = IC.aspSuggest(S, ap);
  assert(sg.ok && sg.key === 'C' && /flew 30 movements in the last hour and has approach radar: Class C/.test(sg.text), sg.text);
});
test('airspace shapes: scaling keeps the rings nested, a ring stops at its neighbours, and changes are said in words', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }), ap = S.infra.find(i => i.kind === 'airport'); IC.S = S;
  IC.step(S, 0.5);
  IC.aspPreset(S, ap, 'B');
  const sh = IC.aspShapeOf(S, ap), nested = () => sh.rings.every((g, i) => !i || g.r > sh.rings[i - 1].r) && IC.aspVols(S, ap).filter(v => v.kind !== 'ext').every(v => v.r0 < v.r1);
  const r0 = sh.rings.map(g => g.r);
  for (const f of [1.5, 0.3, 4, 0.01]) { IC.aspScale(S, sh, f); assert(nested(), `scaled ×${f}: rings ${sh.rings.map(g => Math.round(g.r))}`); }
  IC.aspScale(S, sh, r0[0] / sh.rings[0].r);
  sh.rings.forEach((g, i) => assert(Math.abs(g.r / r0[i] - sh.rings[0].r / r0[0]) < 1e-6, 'scaling did not keep the proportions'));
  // one ring dragged past the next stops short of it; the next ring's inner edge follows
  IC.aspRingR(S, sh, 1, sh.rings[2].r + 500);
  assert(nested() && sh.rings[1].r < sh.rings[2].r, 'the inner shelf grew past the outer one');
  const [core, s1] = IC.aspVols(S, ap).sort((a, b) => a.r1 - b.r1);
  assert(Math.abs(IC.aspVols(S, ap).find(v => v.name === 'Outer shelf').r0 - s1.r1) < 1e-6, 'the outer shelf does not start where the inner one ends');
  assert(ap.asp.mod && !ap.asp.auto, 'a reshaped airspace still counts as the shape');
  // a handle dragged on the map: the square scales the whole shape to where the pointer is
  const h = IC.aspHandles(S, sh).find(x => x.hk === 'scale'), out0 = sh.rings[2].r;
  IC.aspResize(S, h, out0 * 0.8, { x: ap.x + out0 * 0.8, y: ap.y });
  assert(Math.abs(sh.rings[2].r - out0 * 0.8) < 1 && nested(), 'the scale handle did not scale the shape');
  const h2 = IC.aspHandles(S, sh).find(x => x.hk === 'scale');
  assert(IC.aspEdgeAt(S, ap, { x: h2.hx, y: h2.hy }, 10).hk === 'scale', 'the scale handle cannot be grabbed');
  assert(/Class B from 3,000 ft to FL100/.test(IC.aspWords(s1)) && /light aircraft fly under it/.test(IC.aspWords(s1)), IC.aspWords(s1));
  assert(IC.aspWords(core).includes('from the ground'), IC.aspWords(core));
  assert(/^Class B: core out to \d+ km, the ground to FL100; inner shelf/.test(IC.aspShapeText(S, sh)), IC.aspShapeText(S, sh));
  // the approach extension is class E along the runway line, and turns with the shape
  IC.aspExt(S, sh, { len: 100 });
  const e = IC.aspVols(S, ap).find(v => v.kind === 'ext'), far = sh.rings[0].r + 50;
  const p = { x: ap.x + Math.cos(sh.rot) * far, y: ap.y + Math.sin(sh.rot) * far };
  assert(e && e.cls === 'E' && IC.aspVolsAt(S, p.x, p.y, 0.2).includes(e), 'no class E extension along the runway line');
  IC.aspRotate(S, sh, sh.rot + Math.PI / 2);
  assert(!IC.aspVolsAt(S, p.x, p.y, 0.2).includes(e), 'the extension did not turn with the shape');
});
test('airspace shapes: a notch lets a light aircraft through below its floor without a clearance', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 9 }); IC.S = S;
  const ap = S.byId[S.story.reg];
  IC.aspPreset(S, ap, 'D');
  const sh = IC.aspShapeOf(S, ap), ctr = IC.aspVols(S, ap)[0], R = ctr.r1;
  // a line 7 km from the field, square to the notch's bearing, across the zone
  const b = sh.rot + Math.PI / 2, mid = off(ap, b, 70), A = off(mid, b + Math.PI / 2, 600), B = off(mid, b - Math.PI / 2, 600);
  const fly = () => {
    const t = IC.gaLaunch(S, A, B, { xpdr: true, alt: 0.9 });
    let inside = 0, minD = 1e9;
    for (let i = 0; i < 12000 && !t.dead; i++) { IC.step(S, 0.5); if (IC.aspVolsAt(S, t.x, t.y, t.alt).some(v => v.ap === ap.id && IC.aspNeedsClr(v.cls))) inside++; minD = Math.min(minD, U.dist(t, ap)); }
    return { t, inside, minD };
  };
  const round = fly();
  assert(round.t.dead && !round.inside && round.minD > R, `without a notch it flew ${Math.round(round.minD)} from the field (zone ${Math.round(R)}), ${round.inside} steps inside`);
  // a notch 115° wide from 3 km out towards the line, floor 1,500 ft: the light aircraft goes through under it
  IC.aspNotch(S, sh, { a: Math.PI / 2, w: 1.0, r: 30, lo: 1500 / IC.FT });
  assert(!IC.aspVolsAt(S, mid.x, mid.y, 0.3).length && IC.aspVolsAt(S, mid.x, mid.y, 0.6).includes(ctr), 'the notch does not raise the floor');
  const thru = fly();
  assert(thru.t.dead && thru.minD < R - 10, `with a notch it still flew round (${Math.round(thru.minD)} from the field)`);
  assert(!thru.inside, `it was inside the class D zone without a clearance for ${thru.inside} steps`);
}, true);
test('airspace: no airspace warnings before the Airspace chapter', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  const ap = S.byId[S.story.cap];
  IC.aspPreset(S, ap, 'B'); blind(S);
  Object.assign(S.story, { fresh: true, act: 1, ch: 1 });
  assert(!IC.aspTaught(S) && !IC.aspCheck(S, ap).length, `warned in chapter 2: ${IC.aspCheck(S, ap).join(' ')}`);
  assert(!IC.aspSuggest(S, ap), 'suggested a shape before the airspace chapter');
  S.story.ch = 2;
  assert(IC.aspCheck(S, ap).some(w => /needs radar/.test(w)), 'no radar warning in the airspace chapter');
});
test('airspace: heights read the same way everywhere, feet below 6,000 ft and flight levels above', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  IC.step(S, 0.5);
  const ap = S.byId[S.story.cap], texts = [];
  for (const k of ['D', 'C', 'B', 'M']) {
    IC.aspPreset(S, ap, k); const sh = IC.aspShapeOf(S, ap);
    IC.aspNotch(S, sh, {}); IC.aspExt(S, sh, {});
    texts.push(IC.ASP_SHAPES[k].what, IC.aspShapeText(S, sh), ...IC.aspVols(S, ap).map(IC.aspWords), ...IC.aspVols(S, ap).map(IC.aspShort), ...IC.aspCheck(S, ap));
  }
  for (const k in IC.ASP_CLS) texts.push(IC.ASP_CLS[k].who, IC.ASP_CLS[k].need, IC.ASP_CLS[k].rule);
  for (const t of texts) {
    for (const m of t.matchAll(/(\d{1,2}),(\d{3}) ft/g)) assert(+(m[1] + m[2]) < 6000, `"${m[0]}" should be a flight level: ${t}`);
    for (const m of t.matchAll(/FL(\d{3})/g)) assert(+m[1] >= 60, `"${m[0]}" should be in feet: ${t}`);
  }
  // the chart's labels: hundreds of feet below 6,000 ft, flight levels above, and the list says the same
  assert(IC.aspChart(0) === 'SFC' && IC.aspChart(1200 / IC.FT) === '12' && IC.aspChart(10000 / IC.FT) === 'FL100', 'chart labels');
  assert(IC.flText(4000 / IC.FT) === '4,000 ft' && IC.flText(7000 / IC.FT) === 'FL070', 'the list and the text disagree');
});
test('airspace: a save from before shapes converts its rings and areas', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  IC.step(S, 0.5);
  const ap = S.byId[S.story.cap], k = 1000 / IC.FT;
  // the old form: rings as volumes, a preset name, a military circle
  delete S.asp.shapes;
  S.asp.vols = [{ id: 'av1', ap: ap.id, x: ap.x, y: ap.y, kind: 'ctr', cls: 'D', r0: 0, r1: 110, lo: 0, hi: 2.5 * k, name: 'Control zone' },
    { id: 'av2', ap: ap.id, x: ap.x, y: ap.y, kind: 'shelf', cls: 'C', r0: 110, r1: 250, lo: 2.5 * k, hi: 10 * k, name: 'Shelf 1' },
    { id: 'av3', ap: null, x: ap.x + 900, y: ap.y, kind: 'mil', cls: 'Q', r0: 0, r1: 200, lo: 0, hi: 10 * k, name: 'Danger area Somewhere' }];
  ap.asp = { preset: 'regional', auto: false };
  IC.step(S, 0.5);
  const sh = IC.aspShapeOf(S, ap);
  assert(sh && sh.key === 'C' && sh.rings.length === 2 && sh.rings[0].cls === 'D' && Math.abs(sh.rings[1].r - 250) < 1e-6 && Math.abs(sh.rings[1].lo - 2.5 * k) < 1e-6, `converted to ${JSON.stringify(sh && sh.rings)}`);
  const area = S.asp.shapes.find(s => !s.ap && s.key === 'T');
  assert(area && area.name === 'Danger area Somewhere' && IC.aspClassAt(S, ap.x + 900, ap.y, 1).cls === 'Q', 'the military circle was not kept');
  assert(!S.asp.vols.some(v => v.id === 'av1'), 'old volumes are still there');
  // and the converted game saves and loads
  const back = IC.loadSave(IC.saveGame(S));
  assert(back && IC.aspShapeOf(back, back.byId[ap.id]).rings.length === 2, 'the converted airspace did not survive a save');
});

/* ---------- the pavement: fillets, one outline (brief 44) ---------- */
/* a small test field: a runway, a parallel taxiway with a stub to the runway (a T), a taxiway crossing the parallel
   straight (an X), and a 90° corner at the parallel's east end */
function paveField() {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap], x = ap.x, y = ap.y;
  IC.initAirport(ap);
  const N = (dx, dy) => IC.aptNode(ap, x + dx, y + dy);
  IC.aptAddPart(ap, { kind: 'runway', a: { x: x - 12, y }, b: { x: x + 12, y } }, true);
  const w0 = N(-10, 2), T = N(-4, 2), X = N(2, 2), E = N(8, 2), R = N(-4, 0), X1 = N(2, 0.9), X2 = N(2, 4), E2 = N(8, 5);
  IC.aptAddPart(ap, { kind: 'taxi', nodes: [w0, T, X, E] }, true);
  IC.aptAddPart(ap, { kind: 'taxi', nodes: [T, R] }, true);
  IC.aptAddPart(ap, { kind: 'taxi', nodes: [X1, X, X2] }, true);
  IC.aptAddPart(ap, { kind: 'taxi', nodes: [E, E2] }, true);
  IC.resolveNodes(ap);
  return { S, ap, n: id => ap.nodes[id], T, X, E };
}
test('pavement: a straight crossing has no fillet bulge and a turn has an inner curve', () => {
  const { ap, n, T, X, E } = paveField(), w = IC.APART.taxi.w, at = (q, dx, dy) => IC.paveAt(ap, q.x + dx, q.y + dy);
  // the T: the straight side stays straight, the two inner corners towards the runway are filled
  assert(!at(n(T), 0, w / 2 + 0.02), 'pavement bulges out on the straight side of a T junction');
  assert(at(n(T), -w / 2 - 0.02, -w / 2 - 0.02) && at(n(T), w / 2 + 0.02, -w / 2 - 0.02), 'no fillet in the corners of a T junction');
  // the X: two taxiways crossing straight, nothing in any corner
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) assert(!at(n(X), sx * (w / 2 + 0.03), sy * (w / 2 + 0.03)), `a fillet at a straight crossing (${sx}, ${sy})`);
  // the corner at the east end turns south: its inside (south-west) is a curve, not a square nor a disc
  const C = { x: n(E).x - w / 2, y: n(E).y + w / 2 }, b = Math.SQRT1_2;
  assert(at(C, -0.02 * b, 0.02 * b), 'nothing in the inside of the turn');
  const f = IC.paveGeom(ap).fil.find(q => U.dist(q.f.N, n(E)) < 1e-6);
  assert(f && f.f.R > 0.1, 'the turn has no fillet sized for the design aircraft');
  const depth = f.f.R / Math.sin(f.f.gap / 2) - f.f.R;
  assert(at(C, -(depth - 0.01) * b, (depth - 0.01) * b) && !at(C, -(depth + 0.02) * b, (depth + 0.02) * b), `the fillet's edge is not where its arc is (depth ${depth.toFixed(3)})`);
  // the outside of the turn is not widened (no disc round the node)
  assert(!at(n(E), w / 2 + 0.03, -w / 2 - 0.03), 'the outside of the turn bulges');
  // the yellow line turns on an arc there; across the X it runs straight through
  const G = IC.paveGeom(ap);
  assert(G.cl.some(c => c.turn && c.pts.every(q => U.dist(q, n(E)) < 0.6)), 'no centreline curve at the corner');
  assert(!G.cl.some(c => c.turn && c.pts.some(q => U.dist(q, n(X)) < 0.05)), 'a centreline curve at a straight crossing');
  // lead-on lines curve off the stub onto the runway's centreline
  assert(G.cl.filter(c => c.lead && c.pts.some(q => Math.abs(q.y - ap.y) < 0.01)).length === 2, 'the stub has no lead-on lines both ways onto the runway');
});
test('pavement: the outline has no gaps under taxiways, fillets join their legs, and the capital and Denver-size layouts are one surface', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const cap = S.byId[S.story.cap];
  const check = (ap, name) => {
    const G = IC.paveGeom(ap);
    assert(G.fil.length > 10, `${name}: hardly any fillets (${G.fil.length})`);
    for (const t of G.tw) for (let i = 1; i < t.pts.length; i++) {
      const A = t.pts[i - 1], B = t.pts[i], L = U.dist(A, B); if (L < 0.01) continue;
      const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
      for (let s = 0; s <= L; s += 0.05) for (const o of [-0.45, 0, 0.45]) {
        const x = A.x + ux * s - uy * o * t.w, y = A.y + uy * s + ux * o * t.w;
        assert(IC.paveAt(ap, x, y), `${name}: a gap under ${t.p.name || t.p.id} at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      }
    }
    // every fillet reaches into the pavement of both legs (no hairline between them)
    for (const f of G.fil) for (const [arm, T] of [[f.f.A, f.f.T1], [f.f.B, f.f.T2]]) {
      const s = (T.x - f.f.N.x) * arm.ux + (T.y - f.f.N.y) * arm.uy, c = { x: f.f.N.x + arm.ux * s, y: f.f.N.y + arm.uy * s };
      const mid = { x: (c.x + T.x) / 2, y: (c.y + T.y) / 2 };
      assert(U.segDist(mid.x, mid.y, f.f.N.x, f.f.N.y, f.f.N.x + arm.ux * arm.len, f.f.N.y + arm.uy * arm.len) <= arm.h + 1e-6, `${name}: a fillet at ${f.f.N.x.toFixed(2)}, ${f.f.N.y.toFixed(2)} does not overlap its leg`);
    }
    // the fillets are curves, not discs: none reaches further from its node than its legs are wide plus the arc's depth
    for (const f of G.fil) for (const q of f.poly) assert(U.dist(q, f.f.N) < 3.5, `${name}: a fillet runs ${U.dist(q, f.f.N).toFixed(2)} from its node`);
  };
  check(cap, 'the capital');
  IC.aptRelayout(S, cap, 'kden', 0);
  check(cap, 'the Denver-size layout');
});
test('pavement: every kind of junction joins without a round edge, and a runway lies over what meets it (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap], x = ap.x, y = ap.y;
  IC.initAirport(ap);
  const N = (dx, dy) => IC.aptNode(ap, x + dx, y + dy), P = (nodes, o) => IC.aptAddPart(ap, Object.assign({ kind: 'taxi', nodes }, o), true);
  IC.aptAddPart(ap, { kind: 'runway', a: { x: x - 12, y }, b: { x: x + 12, y } }, true);
  const e0 = N(-12, 0), e1 = N(-12, 2), T = N(-4, 2), X = N(0, 2), E = N(8, 2), R = N(-4, 0);
  P([e0, e1, T, X, E]); P([T, R]); P([N(0, 0.9), X, N(0, 3.5)]);
  const r0 = N(3, 0), r1 = N(3 + 3.46, 2); P([r0, r1]);                       // a rapid exit at 30°
  const na = N(-8, 6), nb = N(-4, 6), nc = N(0, 6), nd = N(3, 6), st = N(-4, 8);
  P([na, nb, nc, nd], { w: 0.1 }); P([nb, st], { w: 0.23 }); P([nc, N(2.6, 7.5)], { w: 0.1 });   // wide stem on a narrow lane; a fork
  const E2 = N(8, 7.5); P([E, E2]);
  IC.aptAddPart(ap, { kind: 'apron', x: x + 8, y: y + 9, a: 0, w: 4, h: 3 }, true);
  IC.resolveNodes(ap);
  const n = id => ap.nodes[id], at = (q, dx, dy) => IC.paveAt(ap, q.x + dx, q.y + dy), lay = (q, dx, dy) => IC.paveLayer(ap, q.x + dx, q.y + dy);
  const kinds = new Set(IC.paveJoins(ap).map(j => j.type));
  for (const k of ['end', 'entry', 'rapid', 'apron', 'X', 'T', 'Y', 'bend']) assert(kinds.has(k), `no ${k} junction in the test field (${[...kinds]})`);
  // a wide stem on a narrow lane: nothing round pokes out on the far side, and its dead end is square
  assert(!at(n(nb), 0, -0.07), 'a wide taxiway pokes a disc out through the far side of a narrow one');
  assert(at(n(st), 0.1, -0.01) && !at(n(st), 0.08, 0.06), 'a dead end is round, not square');
  // the runway, its edge line and its shoulder run straight through every junction on it
  const rw = ap.parts.find(p => p.kind === 'runway'), hw = rw.w / 2, sh = IC.rwShoulder(rw.w);
  for (const id of [R, r0, e0]) for (const dx of id === e0 ? [0.02, 0.08] : [-0.08, 0, 0.08]) for (const o of [hw - 0.01, hw + sh / 2]) assert(lay(n(id), dx, o) === 'rwy', `the runway is not on top at ${id} (${dx}, ${o})`);
  assert(lay(n(R), 0, hw + sh + 0.03) === 'taxi', 'the taxiway does not meet the runway shoulder');
  // every turn that is taxied has a fillet, curving off the shoulder's edge; the outside of a hairpin has none
  const G = IC.paveGeom(ap), fil = id => G.fil.filter(f => U.dist(f.f.N, n(id)) < 1e-6);
  assert(fil(R).length === 2 && fil(T).length === 2, 'a right-angle entry or T without its two fillets');
  const rf = fil(r0);
  assert(rf.length === 1 && rf[0].f.gap > 2 && U.dist(rf[0].f.T1, rf[0].f.T2) > 0.3, 'a rapid exit without one long fillet on the inside of the turn');
  assert(fil(nc).every(f => f.f.gap > 1), 'a fillet in the acute corner of a fork');
  assert(fil(E2).length === 2, 'a taxiway onto an apron without fillets both sides');
  for (const f of G.fil) if (f.f.A.kind === 'rwy' || f.f.B.kind === 'rwy') {
    const T0 = f.f.A.kind === 'rwy' ? f.f.T1 : f.f.T2, o = Math.abs((T0.x - rw.a.x) * -IC.rwDir(rw).y + (T0.y - rw.a.y) * IC.rwDir(rw).x);
    assert(Math.abs(o - hw - sh) < 0.005, `a fillet meets the runway ${o.toFixed(3)} from its centreline, not at the shoulder's edge (${(hw + sh).toFixed(3)})`);
  }
  // the junctions' middles: nothing reaches past the widest taxiway there, except round the outside of a bend
  for (const h of IC.paveHubs(ap, 0)) {
    const J = G.J.find(j => j.N === h.N), wmax = Math.max(...J.A.filter(a => a.kind === 'taxi').map(a => a.h));
    for (const q of h.poly) assert(U.dist(q, h.N) <= wmax + 1e-6, 'a junction reaches past its taxiways');
  }
  // the lead-off line from a rapid exit sweeps onto the runway's centreline on a long curve
  const lead = G.cl.filter(c => c.lead && c.pts.some(q => U.dist(q, n(r0)) < 2.5));
  assert(lead.length === 1 && U.dist(lead[0].pts[0], lead[0].pts[lead[0].pts.length - 1]) > 0.4, `the rapid exit's lead-off line is missing or short (${lead.length})`);
});
test('pavement: a taxiway into an apron opens its edge with fillets, its centreline runs on to the stands, and the edge line stops at the opening (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap], x = ap.x, y = ap.y;
  IC.initAirport(ap);
  const N = (dx, dy) => IC.aptNode(ap, x + dx, y + dy);
  // a taxiway from the south meets the middle of an apron's long edge, square on
  const E = N(0, 7.5);
  IC.aptAddPart(ap, { kind: 'taxi', nodes: [N(0, 4), E] }, true);
  IC.aptAddPart(ap, { kind: 'apron', x, y: y + 9, a: 0, w: 6, h: 3 }, true);
  IC.resolveNodes(ap); ap.dirty = true; IC.aptGraph(ap);
  const apr = ap.parts.find(p => p.kind === 'apron'), n = ap.nodes[E], at = (dx, dy) => IC.paveAt(ap, n.x + dx, n.y + dy);
  assert(apr.stands.length >= 4, `the apron has ${apr.stands.length} stands`);
  // fillets either side, sized like a taxiway's (no square notch, no disc): pavement in the corners, grass further out
  const G = IC.paveGeom(ap), fil = G.fil.filter(f => U.dist(f.f.N, n) < 1e-6);
  assert(fil.length === 2 && fil.every(f => f.f.R > 0.2), `the opening has ${fil.length} fillets`);
  const w = IC.APART.taxi.w;
  for (const sx of [-1, 1]) assert(at(sx * (w / 2 + 0.04), -0.04) && !at(sx * (w / 2 + 0.04), -0.6), `no curved fillet on the ${sx < 0 ? 'west' : 'east'} side`);
  // the apron is on top inside its edge: no taxiway stroke laid across it
  assert(IC.paveLayer(ap, n.x, n.y + 0.1) === 'apron', 'a taxiway is painted over the apron');
  // the opening: the edge line, shoulder and service road stop between the fillets' ends
  const m = IC.paveMouths(ap).find(q => q.N === n);
  assert(m && U.dist(m.a, m.b) > w + 0.3, `the opening is ${m ? U.dist(m.a, m.b).toFixed(2) : 'missing'}, not as wide as the fillets`);
  assert(m.n.y > 0.9, 'the opening does not face into the apron');
  // the yellow line runs on from the edge to the taxilane, which every stand's lead-in leaves on a curve
  const L = IC.paveApronLines(ap), lane = L.find(c => c.taxilane);
  assert(lane, 'no taxilane on the apron');
  const ly = lane.pts[0].y;
  assert(Math.abs(lane.pts[1].y - ly) < 1e-6 && ly > n.y + 0.1, 'the taxilane is not a line across the apron in front of the stands');
  assert(L.some(c => !c.turn && c.pts.some(q => U.dist(q, n) < 1e-6)), 'the taxiway centreline stops at the apron edge');
  assert(L.filter(c => c.turn && c.pts.some(q => Math.abs(q.x - n.x) < 0.01 && q.y < ly - 0.05)).length === 2, 'no turns both ways off the entry onto the taxilane');
  // (kept inside the apron)
  for (const q of lane.pts) assert(Math.abs(q.x - apr.x) < apr.w / 2, 'the taxilane runs off the apron');
  for (const s of apr.stands) {
    const turn = L.find(c => c.turn && c.pts.some(q => Math.abs(q.y - ly) < 1e-4) && c.pts.some(q => Math.abs(q.x - s.fx) < 1e-4 && q.y > ly));
    assert(turn, `stand ${s.id}'s lead-in does not curve off the taxilane`);
  }
  // every line lies on the apron
  for (const c of L) for (const q of c.pts) assert(IC.paveAt(ap, q.x, q.y), 'an apron line off the pavement');
});
test('pavement: a de-icing pad meets its taxiway as one piece, and a service road stops short of an apron opening (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap]; S.budget = 1e5;
  IC.aptGraph(ap);
  // a pad beside a taxiway, from the builder's own tool
  let pad = null;
  for (const t of ap.parts.filter(p => p.kind === 'taxi' && p.built && !p.lane)) {
    const a = ap.nodes[t.nodes[0]], b = ap.nodes[t.nodes[t.nodes.length - 1]], L = U.dist(a, b); if (L < 2) continue;
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    for (const sg of [1, -1]) { const m = IC.bldMode(S, ap, 'deice'), plan = IC.bldPlanOf(S, m, { x: c.x + nx * sg * 0.8, y: c.y + ny * sg * 0.8 }, 0.5); if (plan.ok) { IC.bldPlanSpecs(S, ap, plan.specs); break; } }
    pad = ap.parts.find(p => p.kind === 'deice'); if (pad) break;
  }
  assert(pad, 'no de-icing pad could be placed');
  for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
  ap.dirty = true; IC.aptGraph(ap);
  const P = IC.partOutline(pad).map(v => [v.x, v.y]);
  // its stub runs onto it, and where it crosses the edge the edge opens with a fillet each side
  const J = IC.paveJoins(ap).find(j => j.type === 'apron' && j.J.A.some(a => a.part === pad));
  assert(J, 'the pad has no opening where its taxiway comes in');
  const fil = IC.paveGeom(ap).fil.filter(f => f.f.N === J.J.N);
  assert(fil.length === 2, `the pad's opening has ${fil.length} fillets`);
  // between the stub's fillets at the pad and at the taxiway: paving, no sliver of grass
  const ch = IC.paveChamfers(ap, 0).filter(c => c.poly.some(q => U.dist(q, J.J.N) < 0.6));
  assert(ch.length === 2, `the stub's sides are not filled out (${ch.length})`);
  for (const c of ch) { const m = { x: c.poly.reduce((s, q) => s + q.x, 0) / 4, y: c.poly.reduce((s, q) => s + q.y, 0) / 4 }; assert(IC.paveAt(ap, m.x, m.y) && !U.inPoly(m.x, m.y, P), 'a stub side is left unpaved'); }
  // a service road across an apron opening: its stop lines are where the pavement ends, past the fillets
  const N0 = IC.svcNet(ap), mo = IC.paveMouths(ap);
  const c = N0.cross.find(q => !q.lane && mo.some(m => U.dist(m.N, q) < 0.4));
  if (c) {
    const s = Math.abs(Math.sin(c.a - c.ta)) || 1;
    assert(Math.max(c.p0, c.p1) > c.w / 2 / s + 0.1, `the stop line at an apron opening is on the pavement (${c.p0.toFixed(2)}, ${c.p1.toFixed(2)})`);
    for (const sg of [-1, 1]) { const d = (sg < 0 ? c.p0 : c.p1) + 0.03; assert(!IC.paveAt(ap, c.x + Math.cos(c.a) * sg * d, c.y + Math.sin(c.a) * sg * d), 'a stop line painted on the pavement'); }
  }
});
test('airport: every jet bridge starts at a terminal wall and reaches the door, on every preset and blueprint (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap];
  const check = name => {
    ap.dirty = true; IC.aptGraph(ap);
    const st = IC.aptStands(ap), gates = st.filter(s => s.contact);
    for (const s of gates) {
      const B = s.bridge, t = B && ap.parts.find(q => q.id === B.term);
      assert(B && t && t.kind === 'terminal', `${name}: gate ${s.id} has no bridge from a terminal`);
      assert(U.dxy(B.rx, B.ry, B.dx, B.dy) <= IC.BRIDGE_REACH.tunnel + 1e-6, `${name}: gate ${s.id}'s bridge is longer than a bridge reaches`);
    }
    const u = IC.aptUnattached(S, ap);
    assert(!u.length, `${name}: ${u.length} things unattached: ${u.slice(0, 4).map(x => x.text).join(' ')}`);
    return gates.length;
  };
  for (const k of ['intl', 'regional_ok', 'regional_bad', 'kden6']) { IC.aptRelayout(S, ap, k, ap.rwyA || 0); const n = check(k); if (k !== 'regional_bad') assert(n > 0, `${k}: no gates at all`); }
  // (the blueprints made from kits; the real airports from map data have their own checks, brief 39)
  for (const key of Object.keys(IC.REAL_APT).filter(k => IC.REAL_APT[k].bp)) { IC.aptFromLayout(ap, IC.REAL_APT[key], { x: ap.x, y: ap.y, rot: 0.4 }); check('the ' + key + ' blueprint'); }
  // a stand next to the terminal's end, beyond its wall, is remote with stairs, and its apron says so
  IC.aptRelayout(S, ap, 'intl', ap.rwyA || 0);
  const term = ap.parts.find(p => p.kind === 'terminal'), apr = ap.parts.find(p => p.kind === 'apron' && IC.rectGap(p, term) < 0.3);
  const far = { x: term.x, y: term.y }, T = IC.rectWorld(term, term.w / 2 + 1.2, 0);
  IC.bldManualStands(ap, apr); const l = IC.rectLocal(apr, T);
  apr.free.push({ k: 99, lx: l.x, ly: l.y, rot: IC.U.angWrap(Math.atan2(far.y - T.y, far.x - T.x) - apr.a), size: 'm' }); ap.dirty = true; IC.aptGraph(ap);
  const s = apr.stands.find(q => q.id === apr.id + 's99');
  assert(s && !s.contact && !s.bridge, 'a stand 120 m past the end of the terminal got a jet bridge');
});
test('airport: a holding bay is one slab with its own tracks, and a departure that is ready passes one waiting for its release (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap]; S.budget = 1e5; S.av.tails.length = 0; ap.moves.length = 0;
  const rw = ap.parts.find(p => p.kind === 'runway');
  for (const e of [rw.a, rw.b]) { const H = IC.bldHoldSpec(ap, rw, e); assert(!H.bad, H.text[0]); IC.bldPlanSpecs(S, ap, H.specs); }
  finishWorks(S, ap); ap.dirty = true;
  const G = IC.aptGraph(ap), bays = ap.parts.filter(p => p.kind === 'holdbay' && p.built), tracks = ap.parts.filter(p => p.bay && p.built);
  assert(bays.length === 2 && tracks.length >= 4 && tracks.length <= 8, `${bays.length} slabs, ${tracks.length} tracks`);
  // every track has its holding position, on the slab
  const bars = IC.aptHoldBars ? IC.aptHoldBars(ap) : null;
  for (const t of tracks) {
    const onRw = t.nodes.map(id => ap.nodes[id]).find(n => n.on && n.on.kind === 'rwy');
    assert(onRw, 'a track that does not reach the runway');
    const end = G.N.get(onRw.id), prev = G.N.get(t.nodes[t.nodes.indexOf(onRw.id) - 1] || t.nodes[1]);
    const hold = { x: end.x + (prev.x - end.x) / U.dist(prev, end) * IC.GOPS.HOLD, y: end.y + (prev.y - end.y) / U.dist(prev, end) * IC.GOPS.HOLD };
    assert(bays.some(b => U.inPoly(hold.x, hold.y, IC.partOutline(b).map(q => [q.x, q.y]))) && IC.paveAt(ap, hold.x, hold.y), 'a holding position off the slab');
    if (bars) assert(bars.some(b => U.dxy(b.x, b.y, hold.x, hold.y) < 0.05), 'a track without its holding position marking');
  }
  assert(!IC.aptUnattached(S, ap).length && !IC.aptOverlaps(S, ap).some(o => /holding bay/i.test(o.text || o)), 'the bay overlaps something or is left hanging');
  const st = IC.aptStands(ap).filter(s => s.linked !== false && !s.occ && s.zone === 'civil');
  const air = []; IC.H.tBayAir = w => () => air.push(w);
  const A = IC.gopsDepart(S, ap, { type: 'wide', node: st[0].id, stand: st[0], who: 'A', readyT: S.time + 7200, onAir: IC.hfn('tBayAir', 'A') });
  st[0].occ = 'x';
  for (let i = 0; i < 4 * 600; i++) IC.step(S, 0.25);
  assert(A.holding === 'release', `the waiting departure is not holding for its release (${A.phase}, ${A.holding})`);
  const B = IC.gopsDepart(S, ap, { type: 'narrow', node: st[1].id, stand: st[1], who: 'B', onAir: IC.hfn('tBayAir', 'B') });
  for (let i = 0; i < 4 * 1200 && !air.includes('B'); i++) IC.step(S, 0.25);
  assert(air.includes('B') && !air.includes('A'), `the ready departure did not pass (${air})`);
  assert(B.plan.start.id !== A.plan.start.id && ap.kpi.grid === 0, 'it went by the same track, or there was a gridlock');
});
test('airport: service roads are laid out by themselves, reach the fuel farm, cargo and fire station as one network, and follow the airport as it grows (brief 45)', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap];
  const near = (N, p) => N.roads.some(r => { const P = r.closed ? r.pts.concat([r.pts[0]]) : r.pts; return P.some((q, i) => i && IC.shapeDist(IC.partShape(ap, p), { x: (P[i - 1].x + q.x) / 2, y: (P[i - 1].y + q.y) / 2 }) < 0.2 || IC.partDist(ap, p, q) < 0.15); });
  const check = name => {
    ap.dirty = true; IC.aptGraph(ap);
    const N = IC.svcNet(ap);
    for (const k of ['fuel', 'cargo', 'fire']) { const ps = ap.parts.filter(p => p.built && p.kind === k); if (ps.length) assert(ps.some(p => near(N, p)), `${name}: no service road reaches the ${k === 'fuel' ? 'fuel farm' : k === 'cargo' ? 'cargo shed' : 'fire station'}`); }
    for (const p of ap.parts.filter(q => q.built && (q.kind === 'cargo' || q.kind === 'fire'))) assert(near(N, p), `${name}: ${p.kind} ${p.id} has no road`);
    // one network, and never across a runway
    const bad = IC.svcRoadEnds(S, ap).filter(e => !e.ok);
    assert(!bad.length, `${name}: ${bad.length} service roads end in the grass`);
    for (const r of N.roads) if (r.kind !== 'perim' && r.kind !== 'drawn') for (const rw of ap.parts.filter(q => q.kind === 'runway')) for (let i = 1; i < r.pts.length; i++) {
      const A = r.pts[i - 1], B = r.pts[i];
      for (let t = 0; t <= 1; t += 0.1) { const q = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; assert(IC.partDist(ap, rw, q) > 0.05, `${name}: a ${r.kind} road runs over ${rw.name}`); }
    }
    return N;
  };
  const N0 = check('the capital');
  // the service vehicles' way from the fuel farm to a stand keeps to the roads, never across a runway
  const fuel = ap.parts.find(p => p.kind === 'fuel'), st = IC.aptStands(ap)[2], way = IC.svcPath(ap, fuel, st);
  assert(way && way.length > 2, 'no way along the service roads from the fuel farm to a stand');
  for (let i = 1; i < way.length; i++) for (const rw of ap.parts.filter(q => q.kind === 'runway')) for (let t = 0.1; t < 1; t += 0.1) assert(IC.partDist(ap, rw, { x: way[i - 1].x + (way[i].x - way[i - 1].x) * t, y: way[i - 1].y + (way[i].y - way[i - 1].y) * t }) > 0.05, 'the fuel truck drives across a runway');
  assert(N0.roads.some(r => r.kind === 'edge') && N0.roads.some(r => r.kind === 'equip') && N0.roads.some(r => r.kind === 'perim'), 'no apron edge, equipment or perimeter road');
  // a new fire station gets its road without anyone drawing it
  S.budget = 1e5; const rw = ap.parts.find(p => p.kind === 'runway'), c = IC.rwAt(rw, 0.3), d = IC.rwDir(rw);
  IC.aptPlanPart(S, ap, 'fire', c.x + d.y * 3, c.y - d.x * 3, ap.rwyA); finishWorks(S, ap);
  const fire = ap.parts.filter(p => p.kind === 'fire').pop();
  assert(fire.built && near(IC.svcNet(ap), fire), 'the new fire station has no service road');
  IC.aptRelayout(S, ap, 'kden6', ap.rwyA || 0); check('the Denver-size layout');
  for (const key of Object.keys(IC.REAL_APT).filter(k => IC.REAL_APT[k].bp)) { IC.aptFromLayout(ap, IC.REAL_APT[key], { x: ap.x, y: ap.y, rot: 0 }); check('the ' + key + ' blueprint'); }
});
/* ---------- terminal kits and blueprints (brief 45) ---------- */
test('kits: every terminal kit has its stands fanned or lined along its walls, each with a bridge, and nothing overlaps', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const ap = S.byId[S.story.cap];
  for (const k of Object.keys(IC.TERM_KITS)) for (const size of ['m', 'l']) {
    IC.aptFromLayout(ap, IC.kitLayout(k, { size }), { x: ap.x, y: ap.y, rot: 0.7 }); ap.dirty = true;
    const G = IC.aptGraph(ap), st = IC.aptStands(ap);
    assert(st.length >= 4, `${k} (${size}): only ${st.length} stands`);
    assert(st.every(s => s.contact && s.bridge), `${k} (${size}): a stand without a jet bridge (${st.filter(s => !s.bridge).length})`);
    assert(st.every(s => (G.adj.get(s.id) || []).length), `${k} (${size}): a stand with no way to it`);
    const u = IC.aptUnattached(S, ap), ov = IC.aptOverlaps(S, ap).filter(o => o.kind !== 'world' && o.kind !== 'fence');
    assert(!u.length && !ov.length, `${k} (${size}): ${u.concat(ov).slice(0, 3).map(x => x.text).join(' ')}`);
    // no two stands overlap (the fan keeps their inner corners apart)
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i], b = st[j], box = s => IC.shapePoly(IC.partOutline({ x: s.x, y: s.y, a: s.a, w: IC.STAND[s.size].d - 0.02, h: IC.STAND[s.size].w - 0.02 }));
      assert(IC.shapeDepth(box(a), box(b)) <= 0.01, `${k} (${size}): stands ${a.id} and ${b.id} overlap`);
    }
  }
  // and the build bar places one on an airport, planned like any other work
  const S2 = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); IC.S = S2; S2.budget = 1e5;
  const ap2 = S2.byId[S2.story.cap], m = IC.bldMode(S2, ap2, 'rotunda'), p = IC.aptLocal(ap2, 0, 9);
  S2.mode2 = m; S2.hover = p;
  const n0 = ap2.parts.length; assert(IC.clickWorld(p, 0) === 'built' || ap2.parts.length > n0, `the round terminal was not placed: ${m.err}`);
  assert(ap2.parts.some(q => q.kind === 'terminal' && q.roof === 'dome' && !q.built) && ap2.works.length, 'no round terminal being built');
});
for (const key of ['ring', 'hub', 'spine', 'midfield', 'long']) test(`blueprints: ${key} passes every check and runs six hours of traffic without gridlock`, () => {
  IC.seedRandom(7);
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', showcase: key, hour: 6 });
  const ap = S.byId[S.story.cap], L = IC.REAL_APT[key];
  assert(L.bp && /^after /.test(L.after) && L.name && ap.showcase === key, 'not a blueprint with a fictional name "after" its model');
  assert(IC.REAL_APT[key].icao, 'the showcase does not list it');
  ap.dirty = true; IC.aptGraph(ap); IC.aptStats(S, ap);
  const st = IC.aptStands(ap);
  assert(st.length >= 24 && st.every(s => s.linked !== false), `${st.filter(s => s.linked === false).length} of ${st.length} stands cannot be reached from a runway`);
  const gates = st.filter(s => s.contact);
  assert(gates.length >= 20 && gates.every(s => s.bridge), 'a gate without its bridge');
  const u = IC.aptUnattached(S, ap), ov = IC.aptOverlaps(S, ap);
  assert(!u.length, u.slice(0, 3).map(x => x.text).join(' '));
  assert(!ov.length, ov.slice(0, 3).map(x => x.text).join(' '));
  for (const k of ['fuel', 'cargo', 'fire', 'tower']) assert(ap.parts.some(p => p.kind === k), `no ${k}`);
  const n0 = ap.kpi.n;
  for (let i = 0; i < 6 * 3600 * 4; i++) IC.step(S, 0.25);
  assert(ap.kpi.grid === 0 && !(ap.kpi.stuck > 0), `gridlock: ${ap.kpi.grid} tows, ${ap.kpi.stuck || 0} stranded`);
  assert(ap.kpi.n - n0 >= 60, `only ${ap.kpi.n - n0} movements in six hours`);
}, true);
test('labels: every word on an airport sits on or just by what it names, none over another, and a site\'s goes when it is built', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 }); S.budget = 1e5;
  const ap = S.byId[S.story.cap];
  IC.aptPlanPart(S, ap, 'hangar', ...Object.values(IC.aptLocal(ap, -20, 14)), ap.rwyA);
  const site = ap.parts.find(p => p.kind === 'hangar' && !p.built);
  for (const z of [1, 3, 12, 40, 150]) {
    const L = IC.aptLabels(S, ap, z);
    for (const l of L) {
      assert(ap.parts.includes(l.of), `a label for something that is not there (${l.txt})`);
      const d = IC.partDist(ap, l.of, { x: l.x, y: l.y });
      assert(d <= 12 / z + 0.02, `"${l.txt}" hangs ${Math.round(d * 100)} m from what it names at zoom ${z}`);
      assert(l.kind === 'name' ? l.of.built : !l.of.built, `"${l.txt}" names a ${l.of.built ? 'finished' : 'unfinished'} part`);
    }
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i].box, b = L[j].box; assert(!(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]), `"${L[i].txt}" and "${L[j].txt}" overlap at zoom ${z}`); }
  }
  assert(IC.aptLabels(S, ap, 40).some(l => l.of === site), 'the building site has no label close in');
  assert(!IC.aptLabels(S, ap, 3).some(l => l.of === site), 'a small site is labelled from far out');
  finishWorks(S, ap);
  assert(site.built && !IC.aptLabels(S, ap, 40).some(l => l.of === site && l.kind !== 'name'), 'the site still says it is being built');
  // the blueprints too, at the whole-airport and the middle zoom
  for (const key of Object.keys(IC.BLUEPRINTS)) {
    IC.aptFromLayout(ap, IC.REAL_APT[key], { x: ap.x, y: ap.y, rot: 0 });
    for (const z of [8, 20]) { const L = IC.aptLabels(S, ap, z); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i].box, b = L[j].box; assert(!(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]), `${key}: labels overlap`); } }
  }
});
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
  // (the Career's cities grow by the year: a short calendar puts a year and a third into four live days)
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7, dpm: 0.25 });
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
test('growth: the monthly statement adds up to the change in the treasury', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 });
  const b0 = S.budget;
  IC.takeLoan(S, 0);
  run(S, 2, player);
  const st = IC.monthStatement(S, 0);
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
  const st = IC.monthStatement(S, 0);
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
  // (the depot's first load is not enough to fill it; the rest comes by rail from a plant up to 1,000 km away)
  while (t < 12 * 3600 && m.store + m.mag < m.storeMax + m.max) {
    IC.step(S, 0.5); t += 0.5;
    const j = S.jobs.find(x => x.mag === m && x.v);
    if (j) { v = j.v; if (v.state === 'toDest' && onRoad(S, v.x, v.y)) seenOnRoad = true; }
  }
  assert(v, 'no convoy was sent');
  assert(m.store + m.mag >= m.storeMax + m.max, `only ${m.mag} ready and ${m.store} in reserve after ${U.dur(t)}`);
  assert(seenOnRoad, 'the convoy never drove on a road');
  assert(IC.nextLoad(S, u, m).text === 'Full.', 'the panel does not say it is full');
}, true);
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
  const st = IC.monthStatement(S, 0);
  const sum = st.lines.reduce((s, l) => s + l.v, 0);
  assert(Math.abs(sum - (S.budget - b0)) < 0.5, `lines add to ${sum.toFixed(1)}, the treasury changed ${(S.budget - b0).toFixed(1)}`);
  for (const k of ['buyUnits', 'buyMun', 'research', 'loanIn', 'upAD', 'base']) assert(st.lines.some(l => l.k === k), `no "${IC.STATEMENT[k]}" line`);
  const other = st.lines.find(l => l.k === 'other');
  assert(!other || Math.abs(other.v) < 1, `unexplained spending: ${other && other.v.toFixed(1)}`);
  const M = IC.money(S);
  assert(Math.abs(M.net - (S.income - S.upkeep)) < 0.01, 'the hourly lines do not add up to the hourly balance');
  assert(M.inc.concat(M.out).every(l => l.why && l.name), 'a money line has no name or no reason');
}, true);
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
/* ---------- the air war ---------- */
// a sandbox with no enemy operations and no standing tasks: only what the test puts in the sky
const quietWar = () => { const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 10 }); S.enemy.allow = new Set(); S.ato = []; for (const a of S.air) a.dead = true; S.air = []; for (const r of S.roster) if (r.st === 'air') { r.st = 'ready'; r.ent = null; } return S; };
// an aircraft of ours already in the air at a point (the test skips the taxi and take-off)
function airborne(S, r, x, y, mission) {
  const K = IC.AIR_KIND[r.kind], L = IC.LOADOUTS[r.load || 'aa'];
  const a = { id: IC.nid('a'), kind: r.kind, r, name: r.name, x, y, vx: 0, vy: 0, h: 0, state: 'out', mission, fuel: K.endur, aam: r.kind === 'ftr' ? L.aam * r.n : 0, srm: r.kind === 'ftr' ? L.srm * r.n : 0,
    gbu: 0, hp: r.n, n: r.n, dmg: 0, cm: K.cm * r.n, cool: 0, oa: 0, scan: 0, notchT: 0, alt: K.alt, roe: r.roe, give: K.give || 0 };
  r.st = 'air'; r.ent = a; S.air.push(a);
  return a;
}
test('air war: a track stays steady and selectable across radar sweeps, and for a set time after contact is lost', () => {
  const S = range(), T = S.range.target;
  const rad = IC.makeUnit(S, 'vhf', T.x, T.y, { instant: true, full: true }); rad.emcon = 'on';
  const t = IC.spawnThreat(S, 'str', T.x + 1500, T.y - 400, { route: [{ x: T.x - 3000, y: T.y - 400 }], mission: 'strike', home: { x: T.x + 6000, y: T.y }, fromHostile: true });
  runRange(S, 200, () => t.held);
  assert(t.held && t.tn, 'the radar never picked the aircraft up');
  // between sweeps (48 s apart) the symbol glides: no step jumps further than the aircraft flies
  let last = { x: t.px, y: t.py }, worst = 0, blink = 0;
  for (let i = 0; i < 4 * 200; i++) { IC.step(S, 0.25); worst = Math.max(worst, U.dxy(t.px, t.py, last.x, last.y)); last = { x: t.px, y: t.py }; if (!t.held) blink++; }
  assert(!blink, `the track dropped out ${blink} times between sweeps`);
  assert(worst < t.spd * 0.25 * 2 + 25, `the track jumped ${worst.toFixed(1)} units in one step`);
  // contact lost: it coasts on its heading, selectable, with a growing ellipse, then is lost after its coast time
  t.rcs = 0;
  const lostAt = t.pt, x0 = t.px, u0 = t.unc || 0;
  runRange(S, IC.coastT(t) - 5 - (S.time - lostAt));
  assert(t.held && !t.det, `the track is not held while coasting (held ${t.held}, det ${t.det})`);
  assert(IC.airPicture(S).some(r => r.t === t) && IC.cycleTrack(S, 1) === t, 'the coasting track is not in the air picture or cannot be picked');
  assert(Math.abs(t.px - x0) > t.spd * (IC.coastT(t) - 60 - (S.time - lostAt - IC.coastT(t) + 5)) * 0.8, 'the coasting track did not move on its heading');
  assert(t.unc > u0 + 20, `the uncertainty did not grow (${u0} → ${t.unc})`);
  runRange(S, 20);
  assert(!t.held && S.time - lostAt >= IC.coastT(t), 'the track was not dropped after its coast time');
});
test('air war: tracks flying together are one raid, and split when they split', () => {
  const S = range(), T = S.range.target;
  IC.makeUnit(S, 'lr3d', T.x, T.y, { instant: true, full: true }).emcon = 'on';
  const ts = [];
  for (let i = 0; i < 4; i++) ts.push(IC.spawnThreat(S, 'str', T.x + 1200 + i * 30, T.y + (i % 2) * 30, { route: [{ x: T.x - 3000, y: T.y }], mission: 'strike', home: { x: T.x + 6000, y: T.y }, fromHostile: true }));
  runRange(S, 60);
  const g = ts[0].grp;
  assert(g && g.n === 4 && ts.every(t => t.grp === g), `not one group of four: ${ts.map(t => t.grp ? t.grp.id + 'x' + t.grp.n : '-').join(' ')}`);
  assert(IC.airPicture(S).filter(r => r.g === g).length === 1, 'the raid is not one row in the air picture');
  for (const t of ts.slice(2)) t.route = [{ x: T.x, y: T.y + 4000 }];
  runRange(S, 240);
  assert(ts[0].grp && ts[2].grp && ts[0].grp !== ts[2].grp && ts[0].grp.n === 2 && ts[2].grp.n === 2, 'the raid did not split in two when its aircraft turned apart');
});
test('air war: a fighter launched from 5-minute alert is airborne within 5 minutes', () => {
  const S = quietWar();
  const r = S.roster.find(x => x.kind === 'ftr' && x.st === 'ready' && !IC.missionOk(S, x, 'cap'));
  assert(IC.setAlert(S, r, 5), 'could not set the alert state');
  let up = null; IC.on((S2, type, d) => { if (S2 === S && type === 'airborne' && d.r === r && up == null) up = S2.time; });
  const t0 = S.time, b = IC.baseOf(S, r.base);
  const a = IC.launchAir(S, r, { type: 'cap', x: b.x + 300, y: b.y });
  assert(a, 'the flight did not launch');
  for (let i = 0; i < 4 * 600 && up == null; i++) IC.step(S, 0.25);
  assert(up != null && up - t0 <= 300, `airborne after ${up == null ? 'never' : U.dur(up - t0)}`);
  // crews on 5-minute alert tire; stood down, they rest
  const f0 = S.roster.find(x => x !== r && x.kind === 'ftr' && x.st === 'ready');
  IC.setAlert(S, f0, 5); f0.fat = 0; run(S, 2);
  assert(f0.fat > 0.1, `crews on 5-minute alert did not tire (${f0.fat})`);
}, true);
test('air war: an intercept commits, flies to the predicted point and engages', () => {
  const S = quietWar();
  const b = S.byId.ab_fwd, r = S.roster.find(x => x.base === b.id && x.kind === 'ftr' && x.st === 'ready');
  const c = IC.cap(S), cl = U.dist(c, b), dir = { x: (c.x - b.x) / cl, y: (c.y - b.y) / cl };
  // no batteries: their fire-control radars would lock on and turn the bomber for home, off the predicted course
  S.units = [];
  IC.makeUnit(S, 'lr3d', b.x + dir.x * 900, b.y + dir.y * 900, { instant: true, full: true }).emcon = 'on';
  const t = IC.spawnThreat(S, 'str', b.x + dir.x * 1800, b.y + dir.y * 1800, { route: [{ x: b.x + dir.y * 3000, y: b.y - dir.x * 3000 }], mission: 'strike', home: { x: b.x + dir.x * 9000, y: b.y + dir.y * 9000 }, noFire: true });
  for (let i = 0; i < 4 * 120 && !t.held; i++) IC.step(S, 0.25);
  assert(t.held, 'the strike aircraft was never detected');
  IC.setAff(S, t, 'H', 'test');
  const P = IC.interceptPlan(S, r, t);
  assert(P.ok && P.x != null && P.pk > 0.4 && P.fuelBack > 0, `a bad plan: ${JSON.stringify({ ok: P.ok, why: P.why, pk: P.pk, fuelBack: P.fuelBack })}`);
  const a = IC.commitIntercept(S, r, t);
  assert(a && a.mission.type === 'intercept' && a.mission.track === t, 'the intercept was not committed');
  let shot = null;
  for (let i = 0; i < 4 * 3600 && !shot && !t.dead; i++) { IC.step(S, 0.25); const m = S.missiles.find(x => x.by === a); if (m) shot = { x: a.x, y: a.y, T: S.time }; }
  assert(shot, 'the fighter never fired');
  const miss = U.dxy(shot.x, shot.y, P.x, P.y);
  assert(miss < IC.aamReach('mrm', 9, t, null) + 150, `it fired ${U.km(miss)} from the predicted meeting point`);
  run(S, 0.5, () => {});
  assert(t.dead || S.missiles.some(m => m.by === a) || a.aam + a.srm < P.aam + P.srm, 'no engagement followed');
});
test('air war: fighters under an early-warning orbit see a low cruise missile that ground radar behind a hill does not', () => {
  const S = quietWar(), W = S.world, D = 300;
  let at = null;
  for (let j = 200; j < IC.WH - 200 && !at; j += 97) for (let i = 200; i < IC.WW - 200 && !at; i += 97) {
    if (!W.inHome(i, j) || W.inLake(i, j)) continue;
    for (let q = 0; q < 6.28 && !at; q += 0.05) {
      const x = i + Math.cos(q) * D, y = j + Math.sin(q) * D;
      if (W.inHome(x, y) && Math.abs(IC.elevKm(x, y) - IC.elevKm(i, j)) < 0.1 && !IC.losClear(i, j, 25, x, y, 0.6)) at = { x: i, y: j, hid: { x, y } };
    }
  }
  assert(at, 'no hill found');
  S.units = []; for (const b of IC.bases(S)) if (b.parts) b.parts = b.parts.filter(p => p.kind !== 'atc');
  const gf = IC.makeUnit(S, 'gf', at.x, at.y, { instant: true, full: true }); gf.emcon = 'on';
  const cm = IC.spawnThreat(S, 'lacm', at.hid.x, at.hid.y, { route: [{ x: at.hid.x - 4000, y: at.hid.y }], aim: { x: at.hid.x - 4000, y: at.hid.y }, fromHostile: true });
  const hold = () => { cm.x = at.hid.x; cm.y = at.hid.y; cm.alt = 0.05; };
  for (let i = 0; i < 80; i++) { IC.updateEmcon(S, 0.25); hold(); IC.sense(S, 0.25); S.time += 0.25; }
  assert(!cm.det && !cm.held, 'the ground radar sees the cruise missile behind the hill');
  // an early-warning aircraft 100 km away and a fighter 40 km from the missile, both at height
  const aewR = S.roster.find(x => x.kind === 'aew'), fr = S.roster.find(x => x.kind === 'ftr' && x.st === 'ready');
  const aew = airborne(S, aewR, at.hid.x - 1000, at.hid.y, { type: 'orbit', x: at.hid.x - 1000, y: at.hid.y });
  const ftr = airborne(S, fr, at.hid.x - 400, at.hid.y + 50, { type: 'hold', x: at.hid.x - 400, y: at.hid.y + 50 });
  fr.roe = ftr.roe = 'free';
  const own = () => { IC.sense(S, 0.25); const s = S.sensors.find(x => x.air === ftr); return IC.detects(s, cm); };
  hold();
  assert(!own(), 'the fighter\'s own radar sees the low missile 40 km out: look-down should hide it');
  for (let i = 0; i < 4 * 30 && !cm.det; i++) { hold(); IC.sense(S, 0.25); S.time += 0.25; }
  assert(cm.det, 'the early-warning aircraft does not see the cruise missile behind the hill');
  let fired = false;
  for (let i = 0; i < 4 * 300 && !fired && !cm.dead; i++) { IC.step(S, 0.25); fired = S.missiles.some(m => m.by === ftr && m.target === cm); }
  assert(fired || cm.dead, 'the fighter under the early-warning orbit did not engage the cruise missile');
});
test('air war: a fighter identifies by sight: an airliner off its route is spared, a bomber without a transponder is hostile', () => {
  const S = quietWar();
  S.units = []; for (const b of IC.bases(S)) if (b.parts) b.parts = b.parts.filter(p => p.kind !== 'atc');
  S.ad.roe = 'free';
  // an airliner in cruise, moved near a base with two fighter flights ready: it flies a line 40 km from its filed route
  const b = IC.bases(S).find(x => S.roster.filter(r => r.kind === 'ftr' && r.base === x.id && r.st === 'ready').length >= 2);
  const air = S.threats.find(t => !t.dead && t.type === 'civ' && t.plan && t.wps && t.alt > 5 && !t.appr);
  assert(b && air, 'no airliner in cruise');
  const from = { x: b.x + 1400, y: b.y - 600 }, to = { x: b.x - 4000, y: b.y - 600 };
  air.x = from.x; air.y = from.y; air.wps = [to]; air.dest = to; air.drift = 0; air.pt = 0; air.tn = null;
  air.plan = Object.assign({}, air.plan, { pts: [{ x: from.x, y: from.y + 400 }, { x: to.x, y: to.y + 400 }] });
  const bmr = IC.spawnThreat(S, 'bmr', b.x + 900, b.y + 300, { route: [{ x: b.x - 3000, y: b.y + 300 }], mission: 'bomber', home: { x: b.x + 9000, y: b.y }, load: 0, noFire: true });
  const vhf = IC.makeUnit(S, 'vhf', b.x, b.y + 50, { instant: true, full: true }); vhf.emcon = 'on';
  for (let i = 0; i < 4 * 200 && !(air.held && bmr.held); i++) IC.step(S, 0.25);
  assert(air.held && bmr.held && air.aff !== 'N' && bmr.aff !== 'H', `both should be unidentified tracks (airliner ${air.aff} ${air.held} ${U.km(U.dist(air, vhf))}, bomber ${bmr.aff} ${bmr.held} ${U.km(U.dist(bmr, vhf))})`);
  const [r1, r2] = S.roster.filter(x => x.kind === 'ftr' && x.base === b.id && x.st === 'ready' && !IC.missionOk(S, x, 'cap'));
  const a1 = IC.commitIntercept(S, r1, air), a2 = IC.commitIntercept(S, r2, bmr);
  assert(a1 && a2, `the intercepts were not committed: ${IC.interceptPlan(S, r1, air).why} / ${IC.interceptPlan(S, r2, bmr).why}`);
  let shotAtAirliner = false;
  for (let i = 0; i < 4 * 3600 && !(air.aff === 'N' && bmr.aff === 'H'); i++) { IC.step(S, 0.25); if (S.missiles.some(m => m.target === air)) shotAtAirliner = true; }
  for (let i = 0; i < 20; i++) IC.step(S, 0.25);
  assert(air.aff === 'N' && !air.dead && !shotAtAirliner, `the airliner was not recognised by sight (${air.aff}, dead ${air.dead}, shot at ${shotAtAirliner}, fighter ${a1.state} ${a1.mission.type} ${U.km(U.dist(a1, air))} ${a1.dead}, held ${air.held} alt ${air.alt.toFixed(1)} ${a1.alt.toFixed(1)})`);
  assert(bmr.aff === 'H', `the bomber was not identified hostile (${bmr.aff})`);
  assert(S.logs.some(l => l.tag === 'VID' && /off its route/.test(l.msg)), 'the pilot did not report the airliner off its route');
});
test('air war: a combat air patrol is relieved before its fuel runs out when relief is available', () => {
  const S = quietWar();
  const b = S.byId.ab_fwd;
  for (const r of S.roster) if (r.kind === 'ftr' && r.base !== b.id) r.st = 'lost';
  const task = IC.addTask(S, 'cap', { x: b.x + 600, y: b.y + 200 });
  let first = null, gap = 0, worst = 0;
  const ev = []; IC.on((S2, type, d) => { if (S2 === S && type === 'landed' && d.kind === 'ftr') ev.push({ fuel: d.fuel, name: d.name }); });
  for (let i = 0; i < 2 * 3600 * 5; i++) {
    IC.step(S, 0.5);
    const on = S.air.some(a => a.task === task && a.state === 'station');
    if (on && first == null) first = S.time;
    if (first != null) { gap = on ? 0 : gap + 0.5; worst = Math.max(worst, gap); }
  }
  assert(first != null, 'nobody reached the patrol station');
  assert(S.logs.some(l => l.tag === 'ATO' && /relieved/.test(l.msg)), 'no fighter was relieved on the station');
  assert(worst <= 300, `the station was empty for ${U.dur(worst)} at a stretch`);
  assert(!S.stats.acLost && ev.length && ev.every(e => e.fuel > 0), `fighters came home dry or were lost: ${JSON.stringify(ev)}`);
}, true);
test('air war: a tanker on its track extends a patrol', () => {
  const S = quietWar();
  const b = S.byId.ab_fwd, fr = S.roster.find(x => x.kind === 'ftr' && x.base === b.id), kr = S.roster.find(x => x.kind === 'tkr');
  const p = { x: b.x + 800, y: b.y };
  const k = airborne(S, kr, p.x + 200, p.y, { type: 'tanker', x: p.x + 200, y: p.y });
  const a = airborne(S, fr, p.x, p.y, { type: 'hold', x: p.x, y: p.y });
  a.fuel = U.dist(a, b) / IC.AIR_KIND.ftr.spd * 1.25 + 300 + 800;
  const f0 = a.fuel, give0 = k.give;
  run(S, 0.3);
  assert(!a.dead && a.state !== 'rtb' && a.fuel > f0, `the fighter did not take fuel from the tanker (fuel ${Math.round(a.fuel)}, state ${a.state})`);
  assert(k.give < give0, 'the tanker gave nothing');
});
test('air war: a lost aircraft is replaced when a pilot is free, a damaged one comes back from repair', () => {
  const S = quietWar();
  const r = S.roster.find(x => x.kind === 'ftr' && x.st === 'ready'), b = IC.baseOf(S, r.base);
  const a = airborne(S, r, b.x + 300, b.y, { type: 'hold', x: b.x + 300, y: b.y });
  const money = S.budget;
  IC.airLostOne(S, a, 'a test');
  assert(a.hp === 1 && r.back.length === 1 && S.budget < money, 'no replacement was ordered for the lost aircraft');
  a.dmg = 1; IC.recallAir(S, a);
  run(S, 1);
  assert(!S.air.includes(a) && r.n === 0 && r.back.length === 2, `the damaged aircraft did not go into repair (n ${r.n}, ${r.back.length} coming back)`);
  S.pilots.spare = 1;
  run(S, IC.AIR_LOSS.replace / 3600 + 0.2);
  assert(r.n === 2 && !r.back.length, `the flight is not back to strength (n ${r.n}, ${r.back.length} still to come)`);
}, true);
test('air war: a fighter escorts a helicopter and engages what comes for it', () => {
  const S = quietWar();
  const hr = S.roster.find(x => x.kind === 'heli'), fr = S.roster.find(x => x.kind === 'ftr' && x.st === 'ready'), b = IC.baseOf(S, hr.base);
  const h = airborne(S, hr, b.x, b.y, { type: 'hold', x: b.x, y: b.y }); h.route = [{ x: b.x + 2000, y: b.y }];
  const f = airborne(S, fr, b.x - 200, b.y, { type: 'hold', x: b.x, y: b.y });
  IC.escortAir(S, f, h);
  run(S, 0.1);
  assert(U.dist(f, h) < 80 && f.state === 'escort', `the fighter is not with the helicopter (${U.km(U.dist(f, h))}, ${f.state})`);
  const e = IC.spawnThreat(S, 'ahe', h.x + 350, h.y + 50, { route: [{ x: h.x, y: h.y }], mission: 'strike', home: { x: h.x + 5000, y: h.y }, fromHostile: true });
  IC.makeUnit(S, 'lr3d', h.x, h.y + 100, { instant: true, full: true }).emcon = 'on';
  let fired = false;
  for (let i = 0; i < 4 * 400 && !fired && !e.dead; i++) { IC.step(S, 0.25); if (e.held && e.aff !== 'H') IC.setAff(S, e, 'H', 'test'); fired = S.missiles.some(m => m.by === f && m.target === e); }
  assert(fired || e.dead, 'the escort did not engage the attack helicopter');
});
test('air war: enemy aircraft fly in formation, break away when locked on, and go home short of fuel', () => {
  const S = range(), T = S.range.target;
  const op = { launched: 0 };
  const home = { x: T.x + 8000, y: T.y };
  const ts = [0, 1, 2].map(i => IC.spawnThreat(S, 'str', T.x + 3000 + i * 20, T.y + i * 20, { route: [{ x: T.x - 3000, y: T.y }], mission: 'strike', op, home, tgt: T }));
  runRange(S, 30);
  assert(ts[1].lead === ts[0] && ts[2].lead === ts[0], 'the wingmen are not flying on their leader');
  assert(U.dist(ts[1], ts[0]) < 40 && U.dist(ts[2], ts[0]) < 40, 'the formation is not close');
  // a missile locks on: the leader breaks away from it
  const h0 = Math.atan2(ts[0].vy, ts[0].vx);
  ts[0].inbound = 1; S.missiles.push({ id: 'mt', target: ts[0], x: ts[0].x - 400, y: ts[0].y, a: 0, spd: 0, life: 1e9, M: IC.MUN.AAM, pk: 0, tr: IC.newTrail(S, 'aam'), trailT: 1e9 });
  runRange(S, 30);
  const turned = Math.abs(U.angWrap(Math.atan2(ts[0].vy, ts[0].vx) - h0));
  assert(ts[0].evadeT > 0 && turned > 0.5, `the leader did not break away (turned ${turned.toFixed(2)} rad)`);
  S.missiles = []; ts[0].inbound = 0;
  ts[2].fuel = U.dist(ts[2], home) / ts[2].spd * 1.2 + 100;
  runRange(S, 5);
  assert(ts[2].mission === 'rtb', 'the wingman short of fuel did not turn for home');
});

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
  // a heat-seeker can miss one crossing drone; three in a row give it a fair chance
  let d;
  for (let k = 0; k < 3 && !(d && d.dead && d.killer === team.name); k++) {
    d = IC.spawnThreat(S, 'owa', T.x + 250, T.y + 20 + k * 5, { route: [{ x: T.x - 300, y: T.y }], aim: { x: T.x - 300, y: T.y }, fromHostile: true });
    runRange(S, 700, () => d.dead);
  }
  assert(d.dead && d.killer === team.name, `the team shot down none of three drones (last: dead ${d.dead}, by ${d.killer})`);
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
/* ---------- height ---------- */
test('height: an interceptor passing 8 km above or below a target does not hit it; at its height it does', () => {
  const S = range(), T = S.range.target;
  let passed = 0;
  IC.on((S2, type) => { if (S2 === S && type === 'missHeight') passed++; });
  const shoot = dz => {
    const t = IC.spawnThreat(S, 'jdr', T.x + 400, T.y, { route: [{ x: T.x, y: T.y }], aim: { x: T.x, y: T.y }, alt: 5, det: true });
    t.vx = -t.spd; t.vy = 0;
    // a certain-kill round already on top of it on the map, dz km above or below
    S.missiles.push({ id: IC.nid('m'), mun: 'MR', M: IC.MUN.MR, x: t.x + 3, y: t.y, a: Math.PI, spd: 12, target: t, life: 30, src: 'test', pk: 1, trailT: 0, side: 'us', tr: IC.newTrail(S, 'sam'), alt: t.alt + dz, a0: t.alt + dz, loft: 0, flown: 400 });
    t.inbound++;
    for (let i = 0; i < 8; i++) IC.step(S, 0.25);
    return t;
  };
  const above = shoot(8), below = shoot(-4.9);
  assert(!above.dead && !below.dead, 'an interceptor far above or below the target killed it');
  assert(passed >= 2, `the misses were not reported as passing above or below (${passed})`);
  assert(shoot(0).dead, 'an interceptor at the target\'s height and position did not kill it');
});
test('height: a long-reach missile reaches less far against a low target, as its table says', () => {
  const M = IC.MUN.LR, low = IC.reachAt(M, 0.04), high = IC.reachAt(M, 8), R = IC.REACH.LR;
  assert(high === M.range, `at 8 km the long-range missile should reach its full ${M.range / 10} km (got ${high / 10})`);
  assert(low < high * 0.6 && low > R[0][1] * 10 - 1, `against a target at 40 m it should reach ${R[0][1]}–${R[1][1]} km (got ${low / 10})`);
  assert(IC.reachAt(M, 30) === 0 && IC.reachAt('HAT', 5) === 0, 'reach outside the band should be zero');
  assert(/km up, out to 160 km/.test(IC.reachText('LR')), IC.reachText('LR'));
  // and the battery holds fire on a sea-skimming cruise missile 100 km out that it would shoot at 3 km up
  const S = range(), T = S.range.target, u = IC.rangeAddUnit(S, 'lrsam', T.x, T.y);
  const t = IC.spawnThreat(S, 'lacm', T.x + 1000, T.y, { alt: 0.04, route: [{ x: T.x, y: T.y }], aim: { x: T.x, y: T.y }, det: true, fc: true });
  t.vx = -t.spd; t.vy = 0;
  const why = {};
  assert(!IC.chooseMun(S, u, t, 1000, why), 'the long-range battery would fire on a cruise missile at 40 m from 100 km');
  t.alt = 3;
  assert(IC.chooseMun(S, u, t, 1000, {}), 'the long-range battery would not fire on a target 3 km up at 100 km');
});
test('height: tags give flight levels or feet for aircraft and km for everything else', () => {
  assert(IC.altText({ d: IC.THR.civ, alt: 10.97 }) === 'FL360', IC.altText({ d: IC.THR.civ, alt: 10.97 }));
  assert(IC.altText({ d: IC.THR.ga, alt: 1.2 }) === '3,900 ft', IC.altText({ d: IC.THR.ga, alt: 1.2 }));
  assert(IC.altText({ d: IC.THR.srbm, alt: 62 }) === '62 km' && IC.altText({ d: IC.THR.lacm, alt: 0.04 }) === '40 m', 'missile heights should be in km or m');
  for (const k in IC.THR) assert(IC.profileOf(k).name, `no height profile for ${k}`);
});
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

/* ---------- magazines, reloads, helicopter resupply, new units ---------- */
test('magazines: a long-range battery fires about 16, pauses, then reloads launcher by launcher from site stock and keeps firing', () => {
  const S = range(), T = S.range.target;
  S.tech.done.delete('a_pac3');   // long-range rounds only
  const u = IC.rangeAddUnit(S, 'lrsam', T.x - 50, T.y), m = IC.magSync(u, u.mags[0]);
  assert(m.max === 16 && m.ln === 4 && m.store === 16, `the battery has ${m.max} ready on ${m.ln} launchers and ${m.store} on site`);
  const shots = [];
  IC.on((S2, type, d) => { if (S2 === S && type === 'launch' && d.u === u) shots.push(S.time); });
  IC.rangeSpawn(S, { what: 'jdr', n: 40, brg: 90, km: 150, alt: '' });
  let reloading = '', partial = false;
  runRange(S, 1500, () => {
    if (/^Reloading launcher \d of 4: ready in/.test(u.why)) reloading = reloading || u.why;
    IC.magSync(u, m); if (m.l.some(n => n === 0) && m.l.some(n => n === 4)) partial = true;
    return false;
  });
  const gap = shots.findIndex((t, i) => i && t - shots[i - 1] > 60);
  assert(gap >= 14 && gap <= 16, `${gap < 0 ? shots.length : gap} shots before the first pause, not about 16`);
  assert(partial, 'the launchers never held different loads: they emptied together');
  assert(reloading, 'while every launcher was empty the battery never said which launcher it was reloading');
  assert(shots.length >= gap + 8, `only ${shots.length - gap} more shots after the pause`);
  assert(m.store <= 16 - (shots.length - 16), `site stock did not go down as launchers reloaded (${m.store} left after ${shots.length} shots)`);
  for (let i = gap + 1; i < shots.length; i++) if (shots[i] - shots[i - 1] > 60) assert(shots[i] - shots[i - 1] >= 100, 'a launcher reloaded faster than a launcher reload takes');
});
/* a battery with 2 missiles left and nothing on site, 30-50 km from the Central Depot, a helicopter pad by the depot */
function heliGame() {
  const S = supplyGame(); sky(S, 'clear');
  const dep = IC.depots(S).find(d => d.central);
  const pad = IC.findSpot(S, 'heliport', dep.x, dep.y, 40, 120); IC.makeUnit(S, 'heliport', pad.x, pad.y, { instant: true });
  const spot = IC.findSpot(S, 'shorad', dep.x, dep.y, 300, 500);
  const u = IC.makeUnit(S, 'shorad', spot.x, spot.y, { instant: true }), m = u.mags[0];
  m.mag = 2; m.store = 0;
  return { S, dep, u, m };
}
test('supply: with Keep stocked, a battery low on stock behind a cut road is resupplied by helicopter without the player doing anything', () => {
  const { S, dep, u, m } = heliGame();
  assert(S.supply.auto, 'Keep stocked is off');
  // crater the roads the lorries would take, and then the detours, until the way in is cut or long
  let drive = IC.driveTime(S, dep, u);
  for (let k = 0; k < 6 && !drive.cut && drive.t <= IC.SUPPLY.heliSlow; k++) {
    const r = IC.route(dep.x, dep.y, u.x, u.y, true).slice(-8);
    for (const e of S.world.edges) if (e.pts.some(p => r.some(q => U.dxy(p.x, p.y, q.x, q.y) < 3))) { e.cut = true; e.cond = 0.2; e.cutName = `Road cut near ${u.name}`; }
    IC.roadsChanged(S);
    drive = IC.driveTime(S, dep, u);
  }
  // on the large map there can be many ways round: cut every road near the battery
  for (const rad of [150, 250, 400, 600]) {
    if (drive.cut || drive.t > IC.SUPPLY.heliSlow) break;
    for (const e of S.world.edges) if (e.pts.some(p => U.dxy(p.x, p.y, u.x, u.y) < rad)) { e.cut = true; e.cond = 0.2; e.cutName = `Road cut near ${u.name}`; }
    IC.roadsChanged(S); drive = IC.driveTime(S, dep, u);
  }
  assert(drive.cut || drive.t > IC.SUPPLY.heliSlow, `the lorries are not held up (${U.dur(drive.t)})`);
  let heli = null, truck = null, t = 0;
  const m0 = m.mag + m.store;
  while (t < 2 * 3600 && m.mag + m.store <= m0) {
    IC.step(S, 0.5); t += 0.5;
    for (const j of S.jobs) if (j.mag === m) { if (j.mode === 'heli') heli = heli || j; else truck = truck || j; }
  }
  assert(heli && !truck, `no helicopter was called (${truck ? 'a convoy was sent instead' : 'nothing was sent'})`);
  assert(m.mag + m.store > m0, `nothing arrived in ${U.dur(t)}`);
  assert(t < 3600, `the helicopter took ${U.dur(t)}`);
  assert(S.logs.some(l => l.tag === 'HELI' && /Called by Keep stocked/.test(l.msg)), 'the log does not say Keep stocked called it');
});
test('supply: "Resupply by helicopter" says why not when weather grounds the helicopters', () => {
  const { S, u } = heliGame();
  const P = IC.heliPlan(S, u);
  assert(!P.why && P.r && P.src && P.eta > 0 && P.cost > 0 && P.loads[0].qty > 0, `in clear weather there is no plan: ${P.why}`);
  sky(S, 'fog');
  const F = IC.heliPlan(S, u);
  assert(/Fog grounds the helicopters/.test(F.why) && /Lorries still drive/.test(F.why), `the reason is "${F.why}"`);
  assert(!IC.heliResupply(S, u, true), 'a helicopter took off in fog');
  assert(S.logs[0].tag === 'HELI' && S.logs[0].msg.includes(F.why), 'pressing the button did not say why');
  sky(S, 'clear');
  for (const r of S.roster) if (r.kind === 'heli') r.st = 'lost';
  assert(/No transport helicopter/.test(IC.heliPlan(S, u).why), `without helicopters: "${IC.heliPlan(S, u).why}"`);
});
test('supply: one helicopter sortie brings loads to two batteries near each other', () => {
  const { S, u, m } = heliGame();
  const p = IC.findSpot(S, 'shorad', u.x, u.y, 40, 150), v = IC.makeUnit(S, 'shorad', p.x, p.y, { instant: true });
  v.mags[0].mag = 4; v.mags[0].store = 0; m.mag = 12; m.store = 10;
  assert(IC.heliResupply(S, u, true), IC.heliPlan(S, u).why);
  const hj = S.jobs.filter(j => j.mode === 'heli');
  assert(hj.length >= 2 && hj.every(j => j.air === hj[0].air) && hj.some(j => j.to === u) && hj.some(j => j.to === v), `the sortie carries loads for ${hj.map(j => j.to.name).join(', ')}`);
  let t = 0;
  while (t < 2 * 3600 && !(m.store > 10 && v.mags[0].store > 0)) { IC.step(S, 0.5); t += 0.5; }
  assert(m.store > 10 && v.mags[0].store > 0, `after ${U.dur(t)}: ${m.store} and ${v.mags[0].store} on site`);
});
const NEW_UNITS = ['vshorad', 'dgun', 'idl', 'mrmob', 'cp', 'mlaser', 'pcl'];
test('units: every new unit type can be bought, placed, and sets up', () => {
  const S = supplyGame(); S.budget = 5000; S.tech.done.add('a_laser');
  const c = IC.cap(S), placed = [];
  for (const type of NEW_UNITS) {
    const d = IC.UNITS[type];
    assert(d.name && d.short && d.role && d.desc && IC.fullName(d).includes('·'), `${type} has no name, code or role`);
    assert(!IC.buyBlock(S, type), `${type}: ${IC.buyBlock(S, type)}`);
    const p = IC.findSpot(S, type, c.x, c.y, 250, 700), u = IC.deploy(S, type, p.x, p.y);
    assert(u, `${type} could not be placed`);
    placed.push(u);
  }
  run(S, 1);
  const late = placed.filter(u => u.state !== 'ready');
  assert(!late.length, `not ready after an hour: ${late.map(u => `${u.name} ${u.state}`).join(', ')}`);
});
/* one new unit against a raid on the Test range, 2 km in front of the target */
function rangeTrial(type, what, n, km, pre, o) {
  const S = range(), T = S.range.target;
  if (pre) pre(S, T);
  const u = IC.rangeAddUnit(S, type, T.x + 20, T.y, o), x0 = u.x, y0 = u.y;
  IC.rangeSpawn(S, { what, n, brg: 90, km, alt: '' });
  runRange(S, 2400, S => S.range.pending.length === 0 && S.threats.every(t => t.dead || t.mission === 'rtb') && S.time - S.range.t0 > 120);
  const st = IC.rangeStats(S);
  return { S, u, st, sys: st.sys.find(x => x.sys === type) || { shots: 0, kills: 0 }, moved: U.dxy(u.x, u.y, x0, y0) };
}
test('units: the new short-range systems shoot down a drone swarm on the Test range', () => {
  for (const [type, n] of [['vshorad', 10], ['dgun', 10], ['mlaser', 10], ['idl', 20]]) {
    const r = rangeTrial(type, 'owa', n, type === 'idl' ? 40 : 20);
    assert(r.sys.kills >= n / 2, `${type} shot down ${r.sys.kills} of ${n} drones`);
    if (type === 'idl') assert(r.st.ours / r.sys.kills < 0.1, `interceptor drones cost ${U.money(r.st.ours / r.sys.kills)} a kill`);
    if (type === 'dgun' || type === 'mlaser') assert(r.st.ours === 0, `${type} spent missiles`);
  }
}, true);
test('units: the mobile medium-range launcher shoots down strike aircraft, then moves', () => {
  const S = range(), T = S.range.target;
  const u = IC.rangeAddUnit(S, 'mrmob', T.x + 20, T.y), x0 = u.x, y0 = u.y;
  IC.rangeSpawn(S, { what: 'str', n: 4, brg: 90, km: 150, alt: '' });
  // once it has fired, the enemy has found it (in a real raid its radar and launch smoke give it away)
  let far = 0, told = false;
  for (let i = 0; i < 3000 * 4; i++) {
    IC.step(S, 0.25);
    if (u.lastFired && !told) { IC.enemyLearn(S, u, 'radar'); told = true; }
    far = Math.max(far, U.dxy(u.x, u.y, x0, y0));
    if (far > 20 && u.state === 'ready' && S.threats.every(t => t.dead || t.mission === 'rtb')) break;
  }
  const sys = IC.rangeStats(S).sys.find(x => x.sys === 'mrmob') || { kills: 0 };
  assert(sys.kills >= 1, `it shot down ${sys.kills} of 4 strike aircraft`);
  assert(S.logs.some(l => l.tag === 'SCOOT'), 'it never moved after firing');
  assert(far > 20, `it went at most ${U.km(far)} from where it started`);
});
test('units: a command post lets a battery with its radar silent fire on another radar\'s track', () => {
  // no IADS research: without a link a battery fires only on its own radar's track
  const trial = withCp => rangeTrial('shorad', 'owa', 8, 40, (S, T) => {
    S.tech.done.delete('a_remote');
    IC.rangeAddUnit(S, 'mr3d', T.x - 40, T.y + 30);
    if (withCp) IC.rangeAddUnit(S, 'cp', T.x - 200, T.y - 100);
  }, { emcon: 'off' });
  const off = trial(false);
  assert(off.sys.shots === 0, 'the silent battery fired without a link');
  const on = trial(true);
  assert(on.sys.kills >= 3, `with the command post it shot down ${on.sys.kills} of 8`);
  assert(/Linking 1 battery/.test(on.S.units.find(u => u.type === 'cp').why), 'the command post does not say what it links');
});
test('units: the passive radar sees an aircraft 150 km out without transmitting, and not a cruise missile low at 70 km', () => {
  const S = range(), T = S.range.target;
  const p = IC.rangeAddUnit(S, 'pcl', T.x, T.y);
  assert(!p.emitter, 'the passive radar transmits');
  const jet = IC.spawnThreat(S, 'str', T.x + 1500, T.y, { mission: 'patrol', st: { x: T.x + 1500, y: T.y }, route: [], home: T, noFire: true });
  const cm = IC.spawnThreat(S, 'lacm', T.x + 700, T.y, { route: [{ x: T.x + 700, y: T.y + 3000 }], aim: T });
  runRange(S, 30);
  assert(jet.det, 'the aircraft was not detected');
  assert(!cm.det, 'a cruise missile at 40 m, 70 km out, was detected');
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
/* the national airport of a fresh Career, built at once by the scripted player's plan, with its first airlines */
const careerAirport = seed => {
  const CP = require('../careerplayer.js');
  const S = IC.newGame({ seed: seed || 12345, mode: 'story', hour: 9 }); IC.S = S;
  const p = CP.site(S, IC.cap(S), 180, 380);
  IC.foundAirport(S, p.x, p.y, IC.PREVAIL);
  const ap = S.byId[S.story.cap];
  CP.starter(S, ap, 30); finishWorks(S, ap);
  IC.aptPlanTaxi(S, ap, [[-15, 0], [-15, 1.8], [0, 1.8], [15, 1.8], [15, 0]].map(([x, y]) => IC.aptLocal(ap, x, y * (ap._side || 1))), 0.3, { mat: 'conc' }); finishWorks(S, ap);
  IC.aptStats(S, ap);
  run(S, 0.05);
  return { S, ap, CP };
};
test('career: the Career starts with ₭5,500M', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  assert(IC.CAREER_START === 5500 && Math.abs(S.budget - 5500) < 5, `the Career starts with ${U.money(S.budget)}`);
});
test('deals: an airline will not sign a deal until the airport has the facilities it requires', () => {
  const { S, ap } = careerAirport();
  assert(S.story.opened && S.av.airlines.length, 'the airport did not open');
  const flag = S.av.airlines.find(a => a.kind === 'flag'), port = IC.avPorts(S).sort((a, b) => U.dist(a, ap) - U.dist(b, ap))[2];
  const q = IC.avRequest(S, flag, ap, port, 'narrow', 2, 'wants to open a third route', 6 * 3600);
  const needs = IC.dealNeeds(S, q);
  assert(needs.some(x => x.k === 'hangar' && !x.ok), `the flag carrier bases aircraft here and asked for no hangar: ${needs.map(x => x.name).join(', ')}`);
  const routes = S.av.routes.length;
  assert(/hangar/.test(IC.avReqBlock(S, q)), `the offer is not blocked by the missing hangar: ${IC.avReqBlock(S, q)}`);
  assert(!IC.avDecide(S, q.id, true) && S.av.routes.length === routes, 'the airline signed without its hangar');
  IC.aptPlanPart(S, ap, 'hangar', ...Object.values(IC.aptLocal(ap, -10, 2.32 * (ap._side || 1)))); finishWorks(S, ap); IC.aptStats(S, ap);
  assert(!IC.avReqBlock(S, q), `still blocked with a hangar: ${IC.avReqBlock(S, q)}`);
  // it will not pay more than it said it would
  IC.avNegotiate(S, q.id, 3); if (!IC.dealTerms(S, q).ok) assert(!IC.avDecide(S, q.id, true), 'signed at charges it refused');
  IC.avNegotiate(S, q.id, 0);
  const t = IC.dealTerms(S, q);
  assert(t.ok && t.days > q.terms.days, 'a discount does not buy a longer contract');
  assert(IC.avDecide(S, q.id, true), 'did not sign once everything was there');
  const d = S.av.deals.find(x => x.al === flag.id && x.st === 'active' && x.n === 2);
  assert(d && Math.abs(d.charge - (ap.feeLevel || 1) * 0.9) < 1e-6, 'no deal at the agreed charges');
});
test('deals: a broken deal costs reputation and money', () => {
  const { S, ap } = careerAirport();
  const d = S.av.deals.find(x => x.st === 'active' && IC.avAirline(S, x.al).kind === 'flag');
  assert(d, 'no founding deal with the flag carrier');
  // the airport never builds the hangar its founding deal asked for: a day's grace, twelve hours' notice, then it walks out
  const rep = IC.aptRep(ap), spent = () => -(S.econ.book.penalty || 0) - S.econ.days.reduce((s, x) => s + (x.book.penalty || 0), 0);
  for (let i = 0; i < 40 * 1800 && d.st === 'active' && !S.over; i++) { IC.step(S, 2); if (i % 30 === 0) for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0); }
  assert(d.st === 'broken', `the deal was not broken: ${d.st}`);
  assert(/hangar/.test(d.why), `broken for the wrong reason: ${d.why}`);
  assert(IC.aptRep(ap) < rep - 5, `reputation ${rep} → ${IC.aptRep(ap)}`);
  assert(spent() > 1, `no compensation paid: ${spent()}`);
  assert(S.logs.some(l => /walked out/.test(l.msg)), 'the log does not say the airline walked out');
}, true);
test('network: a second city asks for an airport only once its demand is there, and never on another airport’s approach', () => {
  const { S, ap } = careerAirport();
  const A = S.av;
  A.day.pax = 0; A.yesterday = null;
  assert(!IC.cityAsks(S, 150), 'a city asked before the national airport carried anyone');
  A.yesterday = { pax: 6000, flights: 50, delays: 0, div: 0 };
  const P = IC.cities(S).map(c => c.prosp);
  for (const c of IC.cities(S)) c.prosp = 0.3;
  IC.econRefresh(S);
  assert(!IC.cityAsks(S, 150), `a city asked with little demand: ${(IC.cityAsks(S, 150) || {}).city && IC.cityAsks(S, 150).city.name}`);
  IC.cities(S).forEach((c, i) => { c.prosp = P[i]; });
  IC.econRefresh(S);
  const ask = IC.cityAsks(S, 150);
  assert(ask && ask.unserved >= IC.NETWORK.ask && U.dist(ask.city, ap) > 1500, 'no city with the demand asked, or a city near the national airport did');
  // on the runway line, 12 km beyond its end: refused; 20 km to the side of it: not for that reason
  const rw = ap.parts.find(p => p.kind === 'runway'), dir = IC.rwDir(rw);
  const on = { x: rw.b.x + dir.x * 120, y: rw.b.y + dir.y * 120 }, side = { x: rw.b.x + dir.y * 250, y: rw.b.y - dir.x * 250 };
  assert(/approach/.test(IC.foundCheck(S, on.x, on.y)), `a site under the approach was allowed: ${IC.foundCheck(S, on.x, on.y)}`);
  assert(!/approach/.test(IC.foundCheck(S, side.x, side.y)), 'a site off the runway line was refused as under the approach');
});
test('guide: the Guide shows only lessons the player has reached, the current ones first', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7 });
  const g0 = IC.guideFor(S), all0 = g0.now.concat(g0.past);
  assert(all0.length && all0.every(l => l.act === 1 && l.ch === 0), `lessons beyond the first chapter at the start: ${all0.filter(l => l.act > 1 || l.ch > 0).map(l => l.t).join(', ')}`);
  assert(!all0.some(l => /ballistic/i.test(l.t + l.d)), 'ballistic missiles in the first lesson');
  IC.storyStartChapter(S, 2);
  const g2 = IC.guideFor(S);
  assert(g2.now.length && g2.now.every(l => l.ch === 2), 'the current chapter\'s lessons are not first');
  assert(g2.past.some(l => l.ch === 0) && g2.past.some(l => l.ch === 1), 'lessons already reached are missing');
  assert(!g2.now.concat(g2.past).some(l => l.act > 1 || l.ch > 2 || /ballistic/i.test(l.t + l.d)), 'a lesson not reached yet is shown');
  const q = IC.newGame({ seed: 777, mode: 'campaign' });
  assert(IC.guideFor(q).past.length === IC.GUIDE.length, 'Quick war does not show every lesson');
});
test('career: a player who does nothing stays in Act I for months, warned but not replaced', () => {
  // (a short calendar: four months in a live day)
  const S = IC.newGame({ seed: 777, mode: 'story', hour: 7, dpm: 0.25 });
  for (let t = 0; t < IC.MO(S, 4) && !S.over; t += 2) IC.step(S, 2);
  assert(!S.over, `the game ended: ${S.over}`);
  assert(S.story.act === 1 && S.story.ch === 0, `left the first chapter without an airport (act ${S.story.act}, chapter ${S.story.ch + 1})`);
  assert(S.story.standing < 55 && S.story.standing >= 5, `confidence did not fall, or fell below the floor: ${S.story.standing.toFixed(0)}`);
  assert(S.logs.some(l => l.tag === 'MIN'), 'the Minister never asked about the airport');
}, true);
test('career: a scripted player builds the national airport and plays through Act I, chapter by chapter, over years', () => {
  const { player } = require('../careerplayer.js');
  // a short calendar (a month is six live hours) so the whole act runs in the test; the chapters count months
  const S = IC.newGame({ seed: 12345, mode: 'story', hour: 7, dpm: 0.25 }); IC.S = S;
  const st = S.story, t0 = S.time;
  for (let i = 0; S.time - t0 < IC.MO(S, 84) && st.act === 1 && !S.over; i++) { IC.step(S, 4); if (i % 16 === 0) player(S); }
  assert(!S.over, `the game ended: ${S.over}`);
  const L = st.chLog.map(c => `${c.ch + 1}@${U.date(c.t)}`).join(' ');
  assert(st.chLog.map(c => c.ch).join() === '0,1,2,3,4,5', `chapters out of order or missing: ${L}`);
  assert(st.act === 2, `still in Act I after seven years: ${L}`);
  // no chapter is rushed: each ran its minimum months (the second may open at three quarters of it when a near miss
  // or overloaded controllers force the airspace question)
  for (let i = 1; i < st.chLog.length; i++) { const c = st.chLog[i - 1], dur = (st.chLog[i].t - c.t) / IC.MO(S), min = IC.CHAPTERS[c.ch].min * (c.ch === 1 ? 0.75 : 1); if (c.ch > 0) assert(dur >= min - 0.01, `chapter ${c.ch + 1} lasted only ${dur.toFixed(1)} months: ${L}`); }
  // the owner asked for years: Act I is three to five of them
  const yrs = (st.actT - t0) / IC.YR(S);
  assert(yrs * 12 >= IC.ACT1_MIN_MO && yrs <= 6, `Act I lasted ${yrs.toFixed(1)} years: ${L}`);
  assert(S.av.deals.some(d => d.honoured), 'no deal honoured');
  assert(IC.bases(S).filter(b => b.kind === 'airport').length >= 2 && S.av.airlines.length >= 4, 'no second airport, or few airlines');
}, 'long');
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
/* ---------- the calendar: months over the live clock ---------- */
test('calendar: the month turns after DAYS_PER_MONTH days and nights, and the top bar says so', () => {
  for (const dpm of [3, 5]) {
    const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7, dpm }); IC.S = S;
    let turns = 0, at = 0; const off = IC.on((S2, type, d) => { if (S2 === S && type === 'month') { turns++; at = S.time; } });
    assert(U.date(S.time) === 'January, Year 1', `a new Career starts on ${U.date(S.time)}`);
    while (S.time < dpm * 86400 + 600) { S.time += 60; IC.calendar(S); }
    if (typeof off === 'function') off();
    assert(turns === 1 && at >= dpm * 86400 && at < dpm * 86400 + 61, `with ${dpm} days a month the month turned ${turns} times, at ${U.clock(at)}`);
    assert(U.date(S.time) === 'February, Year 1' && IC.calAt(S, S.time).d === 1, `after ${dpm} days it is ${U.date(S.time)}, day ${IC.calAt(S, S.time).d}`);
    S.time = IC.MO(S, 26) + 3600; IC.calendar(S);
    assert(U.date(S.time) === 'March, Year 3', `26 months in it is ${U.date(S.time)}`);
  }
});
test('calendar: research, city growth and a deal\'s length follow the calendar: twice the days a month, twice the live days', () => {
  const out = [3, 6].map(dpm => {
    const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7, dpm }); IC.S = S;
    S.budget = 5000;
    // research: an airport project, run on the economy's own tick
    const t = IC.TECH.find(x => x.id === 'p_rconc');
    assert(IC.startResearch(S, t.id), 'could not start research');
    let live = 0; while (!S.tech.done.has(t.id) && live < 400 * 86400) { S.time += 600; live += 600; IC.economy(S, 600); }
    // a city's growth over twenty live days (the economy alone, as the growth tests run it)
    IC.econRefresh(S);
    const c = IC.cities(S).filter(x => x.air && x.air.score > 0.1).sort((a, b) => b.air.score - a.air.score)[0], p0 = c.popF;
    econDays(S, 20);
    // a deal: the length an airline's offer runs for
    const al = S.av.airlines.find(a => a.kind === 'flag'), ap = S.infra.find(i => i.kind === 'airport'), port = IC.avPorts(S)[0];
    const q = IC.avRequest(S, al, ap, port, 'narrow', 1, 'wants a route', 3600), d = IC.avSignDeal(S, q, IC.avAddRoute(S, al, ap, port, 'narrow', 1, true), [], 0);
    return { research: live / 86400, grew: c.popF / p0 - 1, deal: (d.end - S.time) / 86400, city: c.name, what: IC.techDur(S, t) };
  });
  const [a, b] = out, near2 = (x, y) => x / y > 1.8 && x / y < 2.2;
  assert(near2(b.research, a.research), `research took ${a.research.toFixed(1)} and ${b.research.toFixed(1)} live days (${a.what})`);
  assert(a.grew > 0 && near2(a.grew, b.grew), `${a.city} grew ${(a.grew * 100).toFixed(2)}% and ${(b.grew * 100).toFixed(2)}% in the same live days`);
  assert(near2(b.deal, a.deal) && a.deal >= 9 * 3, `the deal ran ${a.deal.toFixed(1)} and ${b.deal.toFixed(1)} live days`);
});
test('calendar: waiting for money runs until the treasury reaches the target, and says how long', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  run(S, 0.5, player);
  S.budget = 100;
  const target = Math.ceil((S.budget + 60) / 10) * 10;
  let why = null; const off = IC.on((S2, type, d) => { if (S2 === S && type === 'waitDone') why = d.why; });
  assert(IC.waitStart(S, 'amt:' + target) && S.wait, 'the wait did not start');
  assert(/to go for .*(month|day|h|min)/.test(IC.waitText(S)), `the wait does not say how long: ${IC.waitText(S)}`);
  for (let i = 0; i < 3 * 86400 / IC.WAIT.step && S.wait; i++) { IC.step(S, IC.WAIT.step); if (i % 8 === 0) player(S); }
  if (typeof off === 'function') off();
  assert(!S.wait && why, `still waiting at ${U.money(S.budget)}`);
  assert(S.budget >= target - 1 && S.budget < target + 30, `stopped at ${U.money(S.budget)} for a target of ${U.money(target)}: ${why}`);
  assert(/enough/.test(why), `the stop does not say why: ${why}`);
  // and the turn of the month stops a wait for something far off
  IC.waitStart(S, 'amt:' + (S.budget + 1e6));
  const m0 = S.cal.m; for (let i = 0; i < 4 * 86400 / 8 && S.wait; i++) IC.step(S, 8);
  assert(!S.wait && S.cal.m === m0 + 1, 'a wait for a fortune did not stop when the month turned');
});
test('calendar: a save and load keeps the date and the month length', () => {
  const S = IC.newGame({ seed: 4242, mode: 'story', preset: 'network', hour: 7, dpm: 4 }); IC.S = S;
  S.time += IC.MO(S, 17) + 5 * 3600; IC.step(S, 1);
  const date = U.clock(S.time), cal = JSON.stringify(S.cal);
  const S2 = IC.loadSave(JSON.stringify(IC.saveGame(S))); IC.S = S2;
  assert(U.clock(S2.time) === date && JSON.stringify(S2.cal) === cal, `saved on ${date} (${cal}), loaded on ${U.clock(S2.time)} (${JSON.stringify(S2.cal)})`);
  assert(IC.dpm(S2) === 4 && U.date(S2.time) === 'June, Year 2', `the month length or the date changed: ${IC.dpm(S2)} days, ${U.date(S2.time)}`);
});
test('calendar: the seasons change the weather: fog and snow in winter, storms in summer', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  const count = mo => { const n = {}; for (let i = 0; i < 1500; i++) { S.time = IC.MO(S, mo) + 3600; S.weather.next = 0; S.weather.forecast = U.pick(['overcast', 'rain', 'scattered', 'clear']); S.time += 5 * 3600; IC.weather(S, 1); n[S.weather.forecast] = (n[S.weather.forecast] || 0) + 1; } return n; };
  const jan = count(0), jul = count(6);
  assert((jan.snow || 0) > 20 && !jul.snow, `snow in January ${jan.snow || 0}, in July ${jul.snow || 0}`);
  assert((jul.storm || 0) > (jan.storm || 0) * 2, `storms in July ${jul.storm || 0}, in January ${jan.storm || 0}`);
  const q = IC.newGame({ seed: 777, mode: 'campaign' });
  assert(IC.seasonOf(q).name === '' && IC.seasonOf(S).name, 'a Quick war has seasons, or the Career has none');
});
test('calendar: runways and buildings age over the years and ask to be resurfaced and renewed', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  const ap = S.infra.find(i => i.kind === 'airport' && i.parts.some(p => p.kind === 'terminal' && p.built));
  const rw = ap.parts.find(p => p.kind === 'runway' && p.built), term = ap.parts.find(p => p.kind === 'terminal' && p.built);
  rw.wear = 0; for (let m = 0; m < 60; m++) { S.time += IC.MO(S); IC.calendar(S); }
  const L = IC.aptRepairList(ap);
  assert(rw.wear > 0.2 && rw.wear < 0.6, `${IC.PAVE[IC.paveOf(rw)].name} runway ${U.pct(rw.wear)} worn after five years`);
  assert(L.some(it => it.key === 'rs:' + rw.id), 'no resurfacing offered for the aged runway');
  assert(term.hp < term.max * 0.8 && L.some(it => it.part === term && /Renew/.test(it.label)), `terminal at ${U.pct(term.hp / term.max)}, renewal offered: ${L.filter(it => it.part === term).map(it => it.label)}`);
  const q = IC.newGame({ seed: 777, mode: 'campaign' }), b = IC.bases(q).find(x => x.parts && x.parts.some(p => p.kind === 'runway'));
  const r2 = b.parts.find(p => p.kind === 'runway'), w0 = r2.wear || 0;
  for (let m = 0; m < 6; m++) { q.time += IC.MO(q); IC.calendar(q); }
  assert((r2.wear || 0) === w0, 'a Quick war\'s runways age by the calendar');
});
test('calendar: construction runs through its stages, markings and lights each their own', () => {
  const S = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = S;
  const ap = S.infra.find(i => i.kind === 'airport'); S.budget = 5000;
  const rw = ap.parts.find(p => p.kind === 'runway'), c = IC.rwAt(rw, 0.5), d = IC.rwDir(rw);
  const p = IC.aptPlanPart(S, ap, 'apron', c.x - d.y * 9, c.y + d.x * 9, Math.atan2(d.y, d.x), 3, 1.2) || IC.aptPlanPart(S, ap, 'apron', c.x + d.y * 9, c.y - d.x * 9, Math.atan2(d.y, d.x), 3, 1.2);
  assert(p, 'could not plan an apron');
  const seen = []; let dur = 0;
  for (let i = 0; i < 48 * 3600 / 5 && !p.built; i++) { IC.step(S, 5); if (p.stage && seen[seen.length - 1] !== p.stage) seen.push(p.stage); }
  const w0 = IC.bldPreview(S, ap, Object.assign({}, p, { built: false }));
  assert(p.built, `the apron was not built: ${seen.join(' → ')}`);
  assert(['survey', 'earth', 'pave', 'mark', 'lights', 'open'].every(k => seen.includes(k)), `stages seen: ${seen.join(' → ')}`);
  assert(w0.stages.find(x => x.k === 'lights').name && w0.stages.find(x => x.k === 'mark').name, 'a stage has no name');
});

/* ---------- the enemy commander ---------- */
/* one three-day Quick war with the scripted commander of qwplayer.js, shared by the tests below (a few minutes) */
let qw3 = null;
const threeDays = () => {
  if (qw3) return qw3;
  // the same war every time: the simulation's own dice are seeded for this run
  const rnd = Math.random; Math.random = IC.makeRng(19);
  const S = IC.newGame({ seed: 777, mode: 'campaign' }), E = S.enemy, acts = [], main = IC.mainBase(S);
  const on = (S2, type, d) => { if (S2 === S && type === 'enemyAct') acts.push({ act: d.act, t: S.time, winH: E.winH, warH: (S.time - E.warT) / 3600 }); };
  IC.on(on);
  // every weapon fired, with where it was aimed
  const aims = [], sp = IC.spawnThreat;
  IC.spawnThreat = function (S2, type, x, y, o) { const t = sp(S2, type, x, y, o); if (S2 === S && t.op && IC.THR[type].dmg && IC.THR[type].cls !== 'air') aims.push({ t: S.time, type, act: E.act, kind: t.op.raid && t.op.raid.kind, aim: t.aim || (t.route && t.route[t.route.length - 1]), set: t.op.set || (t.op.raid && t.op.raid.set) }); return t; };
  let shockT = null;
  try {
    for (let i = 0; !S.over && (!E.war || S.time - E.warT < 72 * 3600); i++) {
      IC.step(S, 1);
      if (i % 60 === 0) Q.commander(S);
      if (E.raid && E.raid.kind === 'shock' && shockT === null) shockT = E.raid.T;
    }
  } finally { IC.spawnThreat = sp; Math.random = rnd; }
  return (qw3 = { S, E, acts, aims, main, shockT });
};
test('enemy: over a three-day Quick war no target set takes more than 35% of the fire before act 4, the main air base no more than 25%', () => {
  const { S, aims, main } = threeDays();
  const pre = aims.filter(a => a.act < 4 && a.set), n = pre.length, by = {};
  for (const a of pre) by[a.set] = (by[a.set] || 0) + 1;
  assert(n >= 40, `only ${n} weapons fired before act 4`);
  for (const k in by) assert(by[k] / n <= 0.35, `${IC.ESETS[k].name} took ${U.pct(by[k] / n)} of the ${n} weapons fired before act 4 (${JSON.stringify(by)})`);
  const onMain = aims.filter(a => a.aim && U.dist(a.aim, main) < (main.radius || 50) + 20).length;
  assert(onMain / aims.length <= 0.25, `${main.name} took ${onMain} of ${aims.length} weapons (${U.pct(onMain / aims.length)})`);
  assert(Object.keys(by).length >= 4, `only ${Object.keys(by).length} target sets were attacked before act 4`);
  assert(!S.over, `the game ended: ${S.over}`);
}, true);
test('enemy: the acts come in order, and act 4 only after the defence has had its time winning', () => {
  const { acts, E } = threeDays();
  assert(acts.map(a => a.act).join() === '1,2,3,4', `acts came as ${acts.map(a => a.act).join()}`);
  const a4 = acts[3];
  assert(a4.winH >= IC.EPACE.winH || a4.warH >= IC.EPACE.act4Max, `act 4 began ${a4.warH.toFixed(1)} h into the war with only ${a4.winH.toFixed(1)} h of the defence winning`);
  assert(a4.warH >= 20, `act 4 began only ${a4.warH.toFixed(1)} h into the war`);
  assert(E.rec.filter(r => r.t < a4.t).length >= 4, 'fewer than four raids before act 4');
}, true);
test('enemy: it stockpiles before the shock, and intelligence says so hours ahead', () => {
  const { E, shockT, aims } = threeDays();
  assert(shockT, 'no shock in three days');
  const first = E.intel.filter(i => /saving for something big/.test(i.text)).pop();
  assert(first && shockT - first.t >= 3 * 3600, `the first stockpile report came ${first ? ((shockT - first.t) / 3600).toFixed(1) + ' h' : 'never'} before the shock`);
  // while saving, no ballistic missile was fired; the shock used them
  const saveT = E.clog.find(c => /Starts saving/.test(c.text)).t, bal = a => IC.THR[a.type].cls === 'bal';
  assert(!aims.some(a => bal(a) && a.t > saveT && a.t < shockT - 3600), 'ballistic missiles were fired while they were being saved');
  assert(aims.filter(a => bal(a) && a.t >= shockT - 3600 && a.t <= shockT).length >= 4, 'the shock used fewer than four ballistic missiles');
  const shock = aims.filter(a => a.kind === 'shock').length;
  assert(shock >= 20, `the shock launched only ${shock} weapons`);
  assert(E.clog.some(c => c.t > saveT && c.t < shockT && /Plans the shock/.test(c.text)), 'the shock was not planned after the saving');
}, true);
test('enemy: destroying the stockpile or the launchers delays the shock', () => {
  // production only: the commander's cycle is held so nothing is fired
  const ready = hit => {
    const S = IC.newGame({ seed: 12345, mode: 'campaign' }), E = S.enemy;
    E.allow = null; IC.enemyOpening(S, { act: 2 });
    E.pending = []; E.cycle = { phase: 'calm', next: 1e12 };
    if (hit) {
      for (const t of S.tels.filter(t => t.site.kind === 'bm' && t.site.nat === 'A')) IC.telDestroyed(S, t, 'test');
      const s = S.esites.find(s => s.kind === 'cm' && s.nat === 'A'); IC.siteDamaged(S, s, 60, 'test', true);
    }
    const t0 = S.time;
    for (let k = 0; k < 60 * 60 && IC.enemyStock(S).f < 0.97; k++) { S.time += 60; IC.enemyTick(S, 60); }
    return (S.time - t0) / 3600;
  };
  const calm = ready(false), hit = ready(true);
  assert(calm < 30, `the stockpile took ${calm.toFixed(1)} h even without losses`);
  assert(hit >= calm + 4, `losing three launchers and a strike on a cruise missile site delayed it only from ${calm.toFixed(1)} h to ${hit.toFixed(1)} h`);
});
test('enemy: in act 4 raids go for batteries low on missiles more often than chance', () => {
  const rnd = Math.random; Math.random = IC.makeRng(7);
  try { lowBatteries(); } finally { Math.random = rnd; }
});
function lowBatteries() {
  const S = IC.newGame({ seed: 12345, mode: 'campaign' }), E = S.enemy, b = IC.mainBase(S);
  E.allow = null; IC.enemyOpening(S, { act: 2 }); E.pending = [];
  // only these six batteries: the enemy's choice among them is what is measured
  S.units = S.units.filter(u => u.type === 'depot');
  for (const id of [...E.known.keys()]) if (!S.units.some(u => u.id === id)) E.known.delete(id);
  const bats = [];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const u = IC.makeUnit(S, 'mrsam', b.x + Math.cos(a) * 200, b.y + Math.sin(a) * 200, { instant: true }); IC.enemyLearn(S, u, 'test'); bats.push(u); }
  // three of them have fired most of their missiles, and the enemy saw it
  for (const u of bats.slice(0, 3)) { for (const m of u.mags) { m.mag = 1; m.store = 0; } for (let k = 0; k < 18; k++) IC.emit(S, 'launch', { u, t: { fromHostile: true }, mun: 'MR' }); }
  IC.enemyStartAct(S, 4, 'test');
  let low = 0, n = 0;
  for (let k = 0; k < 60; k++) {
    E.c4.i = 1; E.raid = null; E.pending = []; E.retaliate = 0;
    IC.enemyPlanRaid(S);
    const r = E.raid && E.raid.obj.ref;
    if (!r || !bats.includes(r)) continue;
    n++; if (IC.fill(S, r) < 0.5) low++;
  }
  assert(n >= 30, `only ${n} of 60 saturation raids went for a battery`);
  assert(low / n >= 0.65, `${low} of ${n} went for one of the three batteries low on missiles (chance: half)`);
}
test('quick war: the enemy attacks and the defense fights', () => {
  // (with the scripted commander deploying the reserve and buying: on the large map the few units placed at the
  // start rarely stand where the first raids go)
  const S = IC.newGame({ seed: 12345, mode: 'campaign' });
  for (let h = 0; h < 24 && !(S.enemy.war && S.stats.kills > 0 && S.stats.fired > 0); h++) run(S, 1, Q.commander);
  assert(S.enemy.war, 'war never started');
  assert(S.stats.kills > 0 && S.stats.fired > 0, `no fighting: ${JSON.stringify(S.stats)}`);
}, true);
test('quick war: a sensible commander has two layers over what matters by the first strike, and radar along the border by the end of day 2', () => {
  const S = IC.newGame({ seed: 777, mode: 'campaign' });
  let first = null;
  for (let i = 0; S.time < 2 * 86400 && !S.over; i++) {
    IC.step(S, 1);
    if (i % 60 === 0) Q.commander(S);
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
}, 'long');
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

/* ---------- recorder and replay ---------- */
test('recorder: keeps the last 15 minutes of an engagement, with height, within the step budget', () => {
  const S = IC.newGame({ seed: 7, mode: 'range' });
  IC.rangeAddUnit(S, 'lrsam', S.range.target.x - 30, S.range.target.y);
  IC.rangeAddUnit(S, 'lr3d', S.range.target.x - 60, S.range.target.y + 20);
  IC.rangeSpawn(S, { what: 'srbm', n: 2, brg: 80, km: 300, alt: '' });
  IC.rangeSpawn(S, { what: 'lacm', n: 4, brg: 90, km: 120, alt: '' });
  const mins = (n, dt) => { for (let i = 0; i < n * 60 / dt; i++) IC.step(S, dt); };
  mins(5, 0.25);
  const trs = IC.recTracks(S);
  const bm = trs.find(t => t.kind === 'threat' && t.meta.type === 'srbm');
  assert(bm, 'no ballistic missile track recorded');
  const path = IC.recPath(bm, 0, 1e12); let top = 0; for (let i = 2; i < path.length; i += 4) top = Math.max(top, path[i]);
  assert(top > 5, `ballistic missile recorded without its height (top ${top.toFixed(1)} km)`);
  assert(trs.some(t => t.kind === 'missile'), 'no interceptor recorded');
  assert(trs.some(t => t.kind === 'unit' && t.model === 'lrsam'), 'the battery is not in the record');
  const ev0 = S.rec.ev[0];
  assert(ev0 && S.rec.ev.some(e => e.kind === 'launch') && S.rec.ev.some(e => e.kind === 'kill' || e.kind === 'intercept' || e.kind === 'impact'), 'launches and hits were not recorded as events');
  const st = IC.recAt(bm, IC.recFirstT(bm) + 10);
  assert(st && st.alt > 0 && Number.isFinite(st.h) && st.spd > 0, 'no interpolated state inside the track');
  mins(7, 0.25);
  assert(S.rec.ev.includes(ev0) && IC.recTracks(S).includes(bm), 'the event or its track was dropped inside 15 minutes');
  mins(9, 0.25);
  const R = IC.recRange(S);
  assert(R.t1 - R.t0 > 800 && R.t1 - R.t0 <= 900.5, `replayable window is ${(R.t1 - R.t0).toFixed(0)} s, not 15 min`);
  assert(!S.rec.ev.includes(ev0) && !IC.recTracks(S).includes(bm), 'an event or track older than 15 minutes was kept');
  assert(IC.recCost(S) < 0.1, `the recorder costs ${IC.recCost(S).toFixed(3)} ms a call`);
  // on the real map with traffic, airliners and convoys it stays cheap too
  const S2 = IC.newGame({ seed: 99, mode: 'sandbox' });
  const t0 = performance.now();
  for (let i = 0; i < 5 * 60 * 4; i++) IC.step(S2, 0.25);
  const stepMs = (performance.now() - t0) / (5 * 60 * 4), recMs = IC.recCost(S2) / 2;   // the recorder samples every other step
  assert(IC.recTracks(S2).length > 5 && recMs < Math.max(0.1, stepMs * 0.08), `sandbox: ${IC.recTracks(S2).length} tracks, the recorder costs ${recMs.toFixed(3)} ms a step against ${stepMs.toFixed(2)} ms for the step`);
  assert(!Object.keys(S2).includes('rec'), 'the recording would go into a save');
}, false, 'alone');
test('replay: the game runs headless without three.js, and every aircraft, threat and unit has a model', () => {
  assert(typeof THREE === 'undefined' && typeof window.THREE === 'undefined', 'three.js leaked into the headless game');
  assert(!IC.replayOpen && !IC.liveOpen && !IC.modelTop, 'the replay window, the live view or their drawing is loaded headless');
  for (const k in IC.ACTYPES) assert(IC.modelOfType(k) === k && IC.MODELS[k], `no model for aircraft type ${k}`);
  for (const k in IC.THR) { const m = IC.modelOfThreat({ type: k, d: IC.THR[k], aff: 'H' }, true); assert(m && IC.MODELS[m], `no model for threat ${k}`); }
  for (const k in IC.THR) if (IC.THR[k].civil) assert(IC.ACTYPES[IC.modelOfThreat({ type: k, d: IC.THR[k], aff: 'N' }, true)], `civil traffic (${k}) is drawn as a weapon`);
  for (const k in IC.UNITS) assert(IC.modelOfUnit(k) === k && IC.MODELS[k], `no model for unit ${k}`);
  for (const k in IC.MODELS) assert(IC.modelSize(k) > (k === 'person' ? 0.4 : 1) && IC.modelSize(k) < 200, `model ${k} has an odd size (${IC.modelSize(k)} m)`);
  assert(IC.modelOfThreat({ type: 'ftr', d: IC.THR.ftr, aff: 'U' }) === null && IC.modelOfThreat({ type: 'ftr', d: IC.THR.ftr, aff: 'U', klass: 'fighter' }) === 'ftr_e', 'an unknown track should show only what its class says');
  const tower = IC.blockBoxes({ x: 0, y: 0, w: 3, h: 3, a: 0, seed: 12, f: 'tower', hp: 1 }, true), cul = IC.blockBoxes({ x: 0, y: 0, w: 3, h: 3, a: 0, seed: 12, f: 'cul', hp: 1 }, true);
  assert(tower.length && Math.max(...tower.map(b => b.ht)) > 0.25 && Math.max(...cul.map(b => b.ht)) < 0.1, 'building heights do not follow the block form');
});

/* ---------- aircraft variety (brief 38): general aviation, business jets, rare visitors ---------- */
test('aircraft variety: every aircraft type has a model at its real size, low enough in triangles', () => {
  for (const k in IC.ACTYPES) {
    const T = IC.ACTYPES[k], d = IC.MODELS[IC.modelOfType(k)], me = IC.modelMesh(k, 1), far = IC.modelMesh(k, 0);
    assert(d && d.key === k, `aircraft type ${k} has no model of its own`);
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; let R = 0;
    for (const n in me.groups) { const G = me.groups[n]; if (G.kind === 'ab') continue; if (G.kind === 'rotor' && G.axis[2]) R = Math.max(R, G.R); for (let i = 0; i < G.pos.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], G.pos[i + a]); b[a + 3] = Math.max(b[a + 3], G.pos[i + a]); } }
    const L = b[3] - b[0], Sp = Math.max(b[4] - b[1], 2 * R), H = b[5] - b[2], off = (x, y) => Math.abs(x - y) / y;
    if (!T.mil) {
      assert(off(L, T.len * 100) < 0.1 && off(Sp, T.span * 100) < 0.1, `${k}: the model is ${L.toFixed(1)} × ${Sp.toFixed(1)} m, the type ${T.len * 100} × ${T.span * 100} m`);
      assert(d.h && off(H, d.h) < 0.1, `${k}: the model is ${H.toFixed(1)} m high, the real one ${d.h} m`);
    }
    assert(me.tris < 5000 && far.tris < me.tris * 0.7, `${k}: ${me.tris} triangles close, ${far.tris} far`);
  }
  // light aircraft wear white with stripes; the rare visitors their own paint whatever livery they are given
  const ga = IC.liveryCols(IC.gaLivery(3), null);
  assert(ga.BODY === ga.BELLY && ga.STRIPE !== ga.BODY && ga.FIN === ga.STRIPE, 'a light aircraft is not white with stripes');
  assert(IC.modelMesh('vintage', 1).slots.every(c => c[0] === '#' || c === 'WIN' || c === 'GLASS'), 'the vintage airliner takes an airline livery');
});
test('aircraft variety: general aviation fills a light-aircraft field over a day', () => {
  // (in the Career's first act: no war to ground the clubs)
  const S = IC.newGame({ seed: 4242, mode: 'story' });
  S.time = Math.floor(S.time / 86400) * 86400 + 86400 + 7 * 3600;
  const types = new Set(), from = new Map(); let circuits = 0, tows = 0;
  run(S, 12, S => { for (const t of S.threats) if (t.type === 'ga' && !t.dead && !t.biz && !t.visit) { types.add(t.acType); if (t.gaFrom && t.gaFrom.field) from.set(t.id, t.gaFrom.field); if (t.circuit) circuits++; if (t.tow) tows++; } });
  const moves = S.asp.fields.reduce((n, f) => n + f.moves, 0), busiest = Math.max(...S.asp.fields.map(f => f.moves));
  assert(moves >= 25 && busiest >= 3, `${moves} light-aircraft movements at the fields in a day (the busiest ${busiest})`);
  assert(types.size >= 7, `only ${types.size} kinds of light aircraft flew: ${[...types].join(', ')}`);
  assert(circuits > 0 && tows > 0, `club flying: ${circuits} circuit samples, ${tows} glider tows`);
  // on the ground: a row of aircraft, the club's buildings, the helicopter pad; covered and tied down at night
  const f = S.asp.fields[0], day = IC.fieldLife(S, f);
  assert(day.filter(o => o.kind === 'plane').length >= 5 && day.some(o => o.key === 'fieldkit') && day.some(o => o.key === 'helipad'), 'a field shows no aircraft or buildings');
  S.time += 6 * 3600;   // one in the morning
  const night = IC.fieldLife(S, f).filter(o => o.kind === 'plane' && o.key !== 'helil' && o.key !== 'helim');
  assert(night.length && night.every(o => o.cover && o.liv[3] === 'cover'), 'at night the club\'s aircraft are not covered');
}, true);
test('aircraft variety: business jets use the international airports and park on the business side', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox' });
  const aps = IC.bizAirports(S);
  assert(aps.length >= 1 && S.biz.parked.length >= 2, `${aps.length} airports for business jets, ${S.biz.parked.length} parked at the start`);
  const ap = aps[0], life = IC.apronLife(S, ap);
  assert(life.some(q => (IC.ACTYPES[q[0]] || {}).biz) && life.some(q => (IC.ACTYPES[q[0]] || {}).ga), 'no business jets or light aircraft on the business side');
  const taken = new Set(IC.bizStands(S, ap).filter(s => s.occ).map(s => s.id));
  assert(!taken.size, 'a business jet is drawn on a stand an airliner holds');
  let flights = 0;
  run(S, 6, S => { flights = Math.max(flights, S.threats.filter(t => !t.dead && t.type === 'ga' && IC.ACTYPES[t.acType].biz).length); });
  assert(flights >= 1, 'no business jet flew in six hours');
});
test('aircraft variety: a rare visitor comes within two game days, is logged, lands and leaves', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox' });
  assert(S.rare.next - S.time <= 1.5 * 86400, `the first visitor is ${((S.rare.next - S.time) / 3600).toFixed(0)} h away`);
  S.rare.next = S.time + 60;
  let t = null;
  for (let i = 0; i < 4 * 3600 * 12 && !(S.rare.here); i++) { IC.step(S, 0.5); if (!t && S.rare.flying) t = S.threats.find(x => x.id === S.rare.flying); }
  const log = S.logs.find(l => l.tag === 'VISITOR');
  assert(t && log && /is visiting .* today/.test(log.msg) && log.at, `no visitor, or it was not logged: ${log && log.msg}`);
  assert(IC.MODELS[IC.modelOfThreat(t, true)] && IC.ACTYPES[t.acType].rare, 'the visitor has no model of its own');
  assert(S.rare.here && S.rare.here.type === t.acType, 'the visitor did not land');
  const ap = S.byId[S.rare.here.ap];
  assert(IC.apronLife(S, ap).some(q => q[0] === t.acType), 'the visitor is not on the business side of the airport');
  S.time = S.rare.here.until; IC.step(S, 0.5);
  assert(!S.rare.here && S.rare.next > S.time, 'the visitor did not leave');
});
test('aircraft variety: the majors keep one fleet and one livery per airline', () => {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox' });
  run(S, 1);
  const liv = new Set();
  for (const al of S.av.airlines) {
    const fleet = IC.avFleetOf(al), tails = S.av.tails.filter(t => t.al === al.id);
    assert(tails.every(t => fleet.includes(t.type)), `${al.name} flies ${[...new Set(tails.map(t => t.type))].join(', ')} outside its fleet ${fleet.join(', ')}`);
    assert(!liv.has(al.livery.join()), `${al.name} shares a livery`); liv.add(al.livery.join());
    assert(IC.avFleetOf(al) === fleet, 'an airline changes fleet');
  }
  for (const t of S.threats) if (t.tail && !t.dead) assert(t.livery === IC.avAirline(S, t.tail.al).livery, `${t.cs} is not in its airline's livery`);
});

/* an engagement on the Test range with chaff (a battery of active-radar missiles against strike aircraft) and then
   flares (heat-seekers against fighters close in, a wave at a time until one drops them) */
function cmFight() {
  const S = IC.newGame({ seed: 7, mode: 'range' }), T = S.range.target;
  IC.rangeAddUnit(S, 'mrsam', T.x - 30, T.y); IC.rangeAddUnit(S, 'lr3d', T.x - 60, T.y + 20);
  IC.rangeAddUnit(S, 'vshorad', T.x - 5, T.y); IC.rangeAddUnit(S, 'vshorad', T.x + 5, T.y + 5);
  const has = (k, w) => IC.recOf(S).ev.some(e => e.kind === k && (!w || e.what === w));
  IC.rangeSpawn(S, { what: 'str', n: 3, brg: 90, km: 120, alt: '' });
  for (let i = 0; i < 6 * 60 * 4 && !(has('cm', 'chaff') && has('lock')); i++) IC.step(S, 0.25);
  for (let w = 0; w < 12 && !has('cm', 'flare'); w++) { IC.rangeSpawn(S, { what: 'ftr', n: 3, brg: 60 + w * 25, km: 8, alt: 1 }); for (let i = 0; i < 150 * 4 && !has('cm', 'flare'); i++) IC.step(S, 0.25); }
  return { S, has };
}
test('recorder: keeps chaff, flares, lock phases and what each seeker did, where it happened', () => {
  const { S, has } = cmFight();
  assert(has('cm', 'chaff') && has('cm', 'flare'), `chaff ${has('cm', 'chaff')}, flares ${has('cm', 'flare')}: countermeasures were not recorded`);
  const ev = S.rec.ev, chaff = ev.find(e => e.kind === 'cm' && e.what === 'chaff');
  assert(chaff.alt > 0.5 && Number.isFinite(chaff.vx) && S.rec.of.has(chaff.tref), 'a chaff burst was recorded without its height, drift or aircraft');
  const lock = ev.find(e => e.kind === 'lock');
  assert(lock && IC.GUIDANCE[lock.ph] && S.rec.of.has(lock.mref), 'no lock event with a guidance phase and its missile');
  assert(ev.some(e => e.kind === 'mstat' && e.text === 'NOTCHING') && ev.some(e => e.kind === 'mstat' && e.what === 'miss'), 'notching and misses were not recorded with their words');
  // every missile sample carries its guidance, and the track knows its target and launcher
  const m = S.rec.tracks.find(tr => tr.kind === 'missile' && tr.meta.mun === 'MR');
  assert(m && S.rec.of.get(m.meta.tref) && S.rec.of.get(m.meta.uref), 'a missile track does not know its target and launcher');
  for (let i = 0; i < m.n; i++) assert(IC.GUIDANCE[IC.recGet(m, i, 8)], `missile sample ${i} has no guidance phase`);
  // while missiles fly, they are sampled every step
  const gaps = []; for (let i = 1; i < m.n; i++) gaps.push(IC.recGet(m, i, 0) - IC.recGet(m, i - 1, 0));
  assert(Math.max(...gaps) <= 0.26, `a missile was sampled only every ${Math.max(...gaps).toFixed(2)} s`);
});
test('replay: a hard turn shows bank and g, straight flight none (the model rolls by IC.recAttitude)', () => {
  const { S } = cmFight();
  let bank = 0, g = 0, notched = null;
  for (const tr of S.rec.tracks) if (tr.kind === 'threat') for (let i = 1; i < tr.n - 1; i++) if (IC.recGet(tr, i, 8) & 1) { const a = IC.recAttitude(tr, IC.recGet(tr, i, 0)); if (Math.abs(a.roll) > bank) { bank = Math.abs(a.roll); g = a.g; notched = tr; } }
  assert(notched, 'no aircraft notched in the record');
  assert(bank > 0.5 && g > 1.3, `a notching aircraft banks only ${(bank * 57.3).toFixed(0)}° at ${g.toFixed(1)} g`);
  // straight and level somewhere before its first turn (with longer missile reach it may turn early): the flattest moment
  let a0 = null; for (let t = IC.recFirstT(notched) + 1; t < IC.recFirstT(notched) + 40; t += 0.5) { const a = IC.recAttitude(notched, t); if (!a0 || Math.abs(a.roll) < Math.abs(a0.roll)) a0 = a; }
  assert(Math.abs(a0.roll) < 0.05 && Math.abs(a0.g - 1) < 0.1, `straight and level it banks ${(a0.roll * 57.3).toFixed(1)}° at ${a0.g.toFixed(2)} g`);
  // a right turn banks right: the sign follows the heading's change
  let tr = null, t = 0; for (const x of S.rec.tracks) if (x.kind === 'threat') for (let i = 2; i < x.n - 2 && !tr; i++) { const at = IC.recGet(x, i, 0), a = IC.recAttitude(x, at); if (Math.abs(a.roll) > 0.4) { tr = x; t = at; } }
  const a = IC.recAttitude(tr, t);
  assert(Math.sign(a.roll) === Math.sign(a.turn), 'the bank is to the wrong side of the turn');
  // the smoothed path passes through the samples and between them stays near the straight line
  const i = 5, s0 = IC.recAt(tr, IC.recGet(tr, i, 0)), mid = IC.recAt(tr, (IC.recGet(tr, i, 0) + IC.recGet(tr, i + 1, 0)) / 2), raw = IC.recAt(tr, (IC.recGet(tr, i, 0) + IC.recGet(tr, i + 1, 0)) / 2, {}, true);
  assert(Math.abs(s0.x - IC.recGet(tr, i, 1)) < 1e-3 && U.dxy(mid.x, mid.y, raw.x, raw.y) < 2, 'the smoothed path strays from the samples');
});

/* ---------- the 3D view (brief 34) ---------- */
test('3D view: 300 frames of the live view and of a replay make nothing again, and every model faces where it goes', () => {
  // tests/view3d.js runs the view headless with a stand-in for three.js that counts what is made (its own process:
  // the game here must stay without the view)
  const cp = require('child_process'), path = require('path');
  const out = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, 'view3d.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }).trim().split('\n').pop());
  assert(!out.error, out.error);
  const none = (d, what) => assert(!Object.keys(d).filter(k => k !== 'html').length, `${what}: made again ${JSON.stringify(d)}`);
  none(out.livePaused.made, 'live view, paused'); none(out.livePaused.view, 'live view, paused (scene parts)');
  assert(!out.livePaused.made.html, 'the live view rewrote labels while nothing moved');
  none(out.replay.made, 'replay'); none(out.replay.view, 'replay (scene parts)');
  assert(out.liveRunning.again === 0 && out.liveRunning.rebuilt === 0, `running: ${out.liveRunning.again} movers and ${out.liveRunning.rebuilt} ground tiles made twice`);
  assert(out.livePaused.movers > 5 && out.replay.movers > 5, `too little to look at: ${out.livePaused.movers} and ${out.replay.movers} movers`);
  const faced = out.liveRunning.faced.concat(out.replay.faced, out.turn.faced), worst = faced.reduce((a, f) => f.off > a.off ? f : a, { off: 0 });
  assert(faced.length > 20 && worst.off < 0.2, `a model points ${(worst.off * 57.3).toFixed(0)}° off where it goes: ${worst.who}`);
  assert(out.turn.bank > 0.5 && Math.abs(out.turn.roll - out.turn.poseRoll) < 1e-6 && Math.abs(out.turn.roll) > 0.5, `the aircraft turning hardest (bank ${(out.turn.bank * 57.3).toFixed(0)}°) is drawn banked ${(out.turn.roll * 57.3).toFixed(0)}°`);
}, true);
test('3D life: a jet at a gate gets its jet bridge and vehicles, nothing is made from frame to frame, and the lights follow the phase', () => {
  const cp = require('child_process'), path = require('path');
  const out = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, 'view3d.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }).trim().split('\n').pop());
  assert(!out.error, out.error);
  const g = out.gate;
  assert(g.stats.docked >= 1, `no jet bridge at the door of the ${g.turn.type} turning round (${g.stats.bridges} bridges drawn)`);
  const k = g.stats.kinds, served = ['belt', 'bagtractor', 'bagcart', 'catering', 'refueller', 'dispenser'].filter(x => k[x] > 0);
  assert(g.stats.vehicles >= 3 && served.length >= 2, `a turnaround ${Math.round(g.turn.age)} s in has ${g.stats.vehicles} vehicles: ${JSON.stringify(k)}`);
  // (a touchdown's puff or a newcomer is made once, when it comes: the rest of the scene is not made again)
  const fresh = (g.view.event || 0) + (g.view.mover || 0);
  assert(g.lifeMade === 0 && !g.made.geometry && !g.made.texture && (g.made.object || 0) <= fresh * 12 && (g.made.material || 0) <= fresh * 12, `made again at the gate: ${JSON.stringify(g.made)} ${JSON.stringify(g.view)} ${g.lifeMade}`);
  assert(g.lights.checked > 50 && g.lights.bad === 0, `${g.lights.bad} of ${g.lights.checked} aircraft lights do not follow the pose`);
  assert(g.stats.bars > 0, 'no stop bars at the capital');
}, true);
test('3D life: crews switch the lights, spoilers and reversers by phase', () => {
  const { S, tr } = flight('td');
  assert(tr, 'no airliner landed in three hours');
  const td = tr.marks.find(m => m[1] === 'td')[0], at = dt => IC.recPose(tr, td + dt, {}, S.wind);
  // on to its stand
  for (let i = 0; i < 4 * 1200 && !tr.marks.some(m => m[1] === 'pk' && m[0] < S.time - 25); i++) IC.step(S, 0.25);
  const f = at(-20);
  assert(f.land && f.strobe && f.beacon && f.nav && f.taxi, `on final: landing ${f.land}, strobes ${f.strobe}, beacon ${f.beacon}, taxi light ${f.taxi}`);
  assert(at(1.5).spoil > 0.9 && at(4).rev > 0.9 && at(4).n1 > 0.6, `after touchdown: spoilers ${at(1.5).spoil.toFixed(2)}, reversers ${at(4).rev.toFixed(2)}, power ${at(4).n1.toFixed(2)}`);
  let stow = null; for (let dt = 4; dt < 60; dt += 0.5) { const p = at(dt); if (p && p.phase === IC.REC_PHASE.land && p.rev < 0.05) { stow = p; break; } }
  assert(stow && stow.spd < 0.42, 'the reversers are not stowed as the aircraft slows');
  let taxi = null; for (let dt = 20; dt < 900 && !taxi; dt += 1) { const p = at(dt); if (p && p.phase === IC.REC_PHASE.taxi && p.spd > 0.03) taxi = p; }
  assert(taxi && !taxi.strobe && !taxi.land && taxi.taxi && taxi.beacon && !taxi.spoil && !taxi.flap, `taxiing in: strobes ${taxi && taxi.strobe}, landing ${taxi && taxi.land}, taxi light ${taxi && taxi.taxi}, beacon ${taxi && taxi.beacon}, flaps ${taxi && taxi.flap}`);
  let cruise = null; for (let i = 0; i < tr.n && !cruise; i++) { const p = IC.recPose(tr, IC.recGet(tr, i, 0), {}, S.wind); if (p && p.alt > 4) cruise = p; }
  if (cruise) assert(!cruise.land && cruise.strobe && cruise.beacon && cruise.nav, `above 10,000 ft: landing lights ${cruise.land}, strobes ${cruise.strobe}`);
  const pk = tr.marks.find(m => m[1] === 'pk');
  if (pk) { const p = IC.recPose(tr, Math.min(tr.t1, pk[0] + 19.5), {}, S.wind); assert(p && p.beacon === 0 && p.n1 < 0.05, `parked: beacon ${p && p.beacon}, engines ${p && p.n1}`); }
  // a departure: the beacon from the pushback, the engines started on it; strobes and landing lights for the roll
  const d = flight('to'), t2 = d.tr, to = t2.marks.find(m => m[1] === 'to')[0], p0 = t2.marks.find(m => m[1] === 'p0');
  if (p0) { const p = IC.recPose(t2, p0[0] + 50, {}, d.S.wind); assert(p.beacon && !p.strobe && p.n1 > 0.15, `pushing back: beacon ${p.beacon}, strobes ${p.strobe}, engines ${p.n1.toFixed(2)}`); }
  const r = IC.recPose(t2, to - 3, {}, d.S.wind), up = IC.recPose(t2, to + 7, {}, d.S.wind);
  assert(r.strobe && r.land && r.n1 > 0.9 && r.elev > 0.3, `rotating: strobes ${r.strobe}, landing ${r.land}, power ${r.n1.toFixed(2)}, elevator ${r.elev.toFixed(2)}`);
  assert(up.gear > 0 && up.gear < 1, `the gear is not on its way up 7 s after lift-off (${up.gear})`);
}, true);
/* the sandbox's airports until an airliner has taken off and climbed away ('to') or landed ('td'): its track */
function flight(mark) {
  const S = IC.newGame({ seed: 4242, mode: 'sandbox' });
  let tr = null;
  for (let i = 0; i < 3 * 3600 * 2 && !tr; i++) {
    IC.step(S, 0.5);
    if (i % 20) continue;
    for (const x of S.rec.tracks) { const m = x.marks.find(q => q[1] === mark); if (m && x.t1 > m[0] + 60 && (mark === 'td' || x.model === 'narrow')) { tr = x; break; } }
  }
  return { S, tr };
}
test('3D view: a take-off rolls along the runway, rotates, lifts off and climbs away with its gear coming up', () => {
  const { S, tr } = flight('to');
  assert(tr, 'no airliner took off in three hours');
  const t0 = tr.marks.find(m => m[1] === 'to')[0], ap = S.byId[tr.meta.ap];
  const rws = ap.parts.filter(p => p.kind === 'runway' && p.built);
  // on the roll: on the runway's centreline, pointing along it
  let rolled = 0;
  for (let t = t0 - 30; t <= t0; t += 0.5) {
    const p = IC.recPose(tr, t, {}, S.wind); if (!p || p.phase !== IC.REC_PHASE.roll) continue;
    const rw = rws.reduce((a, r) => { const d = IC.partDist(ap, r, p); return !a || d < a[1] ? [r, d] : a; }, null)[0];
    const off = Math.abs((p.x - rw.a.x) * -IC.rwDir(rw).y + (p.y - rw.a.y) * IC.rwDir(rw).x), dh = Math.abs(Math.sin(p.h - Math.atan2(IC.rwDir(rw).y, IC.rwDir(rw).x)));
    assert(off < 0.05 && dh < 0.05 && p.gnd && p.gear === 1, `on the take-off roll ${(off * 100).toFixed(0)} m off the centreline, ${(Math.asin(dh) * 57.3).toFixed(0)}° off its heading`);
    rolled++;
  }
  assert(rolled > 10, `only ${rolled} half-seconds of take-off roll`);
  const at = dt => IC.recPose(tr, t0 + dt, {}, S.wind);
  assert(at(-0.5).pitch > 3 / 57.3, `no rotation before lift-off (pitch ${(at(-0.5).pitch * 57.3).toFixed(1)}°)`);
  // the climb-out: from the runway, without a jump, gear down just after lift-off and up a few seconds later
  let last = 0;
  for (let dt = 0.5; dt < 40; dt += 0.5) { const a = at(dt).alt; assert(a >= last - 1e-6 && a - last < 0.02, `the climb-out jumps from ${last.toFixed(3)} to ${a.toFixed(3)} km at ${dt} s`); last = a; }
  assert(at(2).alt < 0.03 && at(2).gear === 1 && at(12).gear === 0 && at(2).pitch > 8 / 57.3, `just after lift-off: ${(at(2).alt * 1000).toFixed(0)} m, gear ${at(2).gear}, then gear ${at(12).gear}; pitch ${(at(2).pitch * 57.3).toFixed(0)}°`);
}, true);
test('3D view: gear and flaps are down on approach and up in the cruise; the flare and touchdown', () => {
  const { S, tr } = flight('td');
  assert(tr, 'no airliner landed in three hours');
  const t1 = tr.marks.find(m => m[1] === 'td')[0];
  const at = dt => IC.recPose(tr, t1 + dt, {}, S.wind);
  let cruise = null;
  for (let i = 0; i < tr.n; i++) { const t = IC.recGet(tr, i, 0), p = IC.recPose(tr, t, {}, S.wind); if (p && p.alt > 6) { cruise = p; break; } }
  assert(cruise && cruise.gear === 0 && cruise.flap === 0, `in the cruise: ${cruise ? `gear ${cruise.gear}, flaps ${cruise.flap}` : 'never high enough'}`);
  const fin = at(-20);
  assert(fin.phase === IC.REC_PHASE.final && fin.gear === 1 && fin.flap === 1 && fin.alt > 0.05, `20 s out: phase ${fin.phase}, gear ${fin.gear}, flaps ${fin.flap}, ${(fin.alt * 1000).toFixed(0)} m`);
  assert(at(-1).pitch > at(-20).pitch, 'no flare before touchdown');
  assert(at(0.5).gnd && at(0.5).pitch > 0 && at(4).pitch === 0, 'the nose does not come down after touchdown');
}, true);

/* ---------- engine health ---------- */
test('engine: a game built in stages is the game built at once, and it reports every stage in order', () => {
  const opts = { seed: 777, mode: 'story', preset: 'network', hour: 7 };
  IC.seedRandom(9); const A = IC.newGame(opts);
  IC.seedRandom(9); const g = IC.newGameSteps(opts), seen = [];
  let r; while (!(r = g.next()).done) seen.push(r.value);
  const B = r.value;
  const order = Object.keys(IC.LOAD_STAGES).filter(k => k !== 'done');
  assert(seen.join() === order.join(), `stages ${seen.join(', ')}, expected ${order.join(', ')}`);
  assert(order.every((k, i) => !i || IC.LOAD_STAGES[k] > IC.LOAD_STAGES[order[i - 1]]), 'the stages do not add up in order');
  const sig = S => [S.world.cities.map(c => c.x + ',' + c.y + ',' + c.blocks.length).join(';'), S.world.edges.length, S.infra.length, S.units.length,
    S.traffic.links.length, S.av.tails.length, S.budget.toFixed(3)].join('|');
  assert(sig(A) === sig(B), 'the game built in stages differs from the one built at once');
}, true);
test('radar: sensors asked by grid cell detect exactly what asking every sensor detects', () => {
  const S = IC.newGame({ seed: 12345, mode: 'campaign', hour: 10 });
  const c = IC.cap(S);
  for (let i = 0; i < 12; i++) IC.spawnThreat(S, 'jdr', c.x + 900 + i * 40, c.y - 600 + i * 30, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y } });
  for (let i = 0; i < 6; i++) IC.spawnThreat(S, 'lacm', c.x + 2500, c.y - 300 + i * 200, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y } });
  let n = 0, seen = 0;
  for (let k = 0; k < 40; k++) {
    IC.step(S, 0.25);
    IC.sense(S, 0.25);
    for (const t of S.threats) {
      if (t.dead || t.notchT > 0) continue;
      const all = S.sensors.some(s => IC.detects(s, t));
      assert(all === t.inView, `TN ${t.tn || t.id} (${t.type}): every sensor says ${all}, the grid says ${t.inView}`);
      n++; if (all) seen++;
    }
  }
  assert(n > 1000 && seen > 50, `too few tracks to be a real test (${n}, ${seen} seen)`);
});
test('airport: a parked airliner held on the ground is fuelled once, not again at every try', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  const parkedAt = a => S.av.tails.filter(t => t.at === a.id && t.where === 'stand').length;
  let ap = null;
  for (let k = 0; k < 6 && !ap; k++) { run(S, 0.25); ap = IC.bases(S).find(b => b.kind === 'airport' && b.parts && b.parts.filter(p => p.kind === 'runway').length === 1 && parkedAt(b) > 0); }
  assert(ap, 'no airliner parked at an airport with one runway');
  S.story.del.eng = false; ap.autoRepair = false;
  const rw = ap.parts.find(p => p.kind === 'runway'), q = IC.rwAt(rw, 0.5);
  IC.detonate(S, q.x, q.y, 120, { d: { code: 'TEST' } });
  let draws = 0; const take = IC.aptTakeFuel;
  IC.aptTakeFuel = function (a, n, S2) { const ok = take.apply(this, arguments); if (S2 === S && a === ap && ok) draws++; return ok; };
  const parked = parkedAt(ap);
  try { run(S, 2); } finally { IC.aptTakeFuel = take; }
  assert(draws <= parked, `${draws} fuel draws for ${parked} parked airliners that could not leave`);
}, true);
test('airport: an apron with airliners parked on it cannot be bulldozed, and says why', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  run(S, 0.5);
  const ap = IC.bases(S).find(b => b.parts && IC.aptStands(b).some(s => s.occ && S.av.tails.some(t => t.id === s.occ)));
  assert(ap, 'no airport with a parked airliner');
  const s = IC.aptStands(ap).find(x => x.occ && S.av.tails.some(t => t.id === x.occ)), apron = ap.parts.find(p => p.id === s.apron);
  const lost = () => S.av.tails.filter(t => t.where === 'lost').length, l0 = lost();
  assert(/parked on it/.test(IC.aptRemoveBlock(S, ap, apron)), 'no reason given for keeping the apron');
  assert(!IC.aptRemove(S, ap, apron.id) && ap.parts.includes(apron), 'the apron was bulldozed with aircraft on it');
  run(S, 0.1);
  assert(lost() === l0, 'aircraft were lost');
}, true);
test('aviation: an airliner whose route is dropped while it is in the air leaves the fleet once it lands', () => {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  run(S, 1 / 3);
  let r = null, tl = null;
  for (const rt of S.av.routes) {
    const ts = S.av.tails.filter(t => t.route === rt.id && t.where !== 'lost');
    const air = ts.find(t => t.where === 'air' && t.track && t.track.toApt);
    if (air) { r = rt; tl = air; for (const t of ts) if (t !== air) { t.where = 'lost'; t.retired = true; } rt.n = 1; break; }
  }
  assert(tl, 'no airliner in the air towards one of our airports');
  const al = S.av.airlines.find(a => a.id === r.al);
  for (const x of S.av.routes) if (x.al === al.id && x !== r) x.st = 'cut';
  al.sat = 5; al.lowT = 5; S.av.hourT = 3599.5;
  IC.step(S, 0.5);
  assert(r.st === 'cut', 'the airline kept the route');
  for (let i = 0; i < 6 * 7200 && tl.where !== 'lost'; i++) IC.step(S, 0.5);
  assert(tl.where === 'lost', `${tl.cs} is still '${tl.where}' six hours after its route was dropped`);
  assert(!IC.aptStands(S.byId[tl.at]).some(s => s.occ === tl.id), `${tl.cs} still holds a stand`);
}, true);
test('air defence: a laser stops burning its target when weapons are set to Hold', () => {
  const S = IC.newGame({ seed: 7, mode: 'range' }), T = S.range.target;
  const u = IC.rangeAddUnit(S, 'laser', T.x, T.y);
  S.ad.roe = 'free';
  IC.rangeSpawn(S, { what: 'owa', n: 1, brg: 90, km: 12, alt: '' });
  let t = null;
  for (let i = 0; i < 4 * 240 && !t; i++) { IC.step(S, 0.25); if (u.beam && !u.beam.dead) t = u.beam; }
  assert(t, `the laser never engaged (${u.why})`);
  S.ad.roe = 'hold';
  const hp = t.hp;
  for (let i = 0; i < 40; i++) IC.step(S, 0.25);
  assert(!t.dead && t.hp === hp && u.beam !== t, `the laser kept burning TN ${t.tn} under Hold (hp ${hp.toFixed(2)} → ${t.hp.toFixed(2)})`);
});
/* ---------- saving and loading ---------- */
const CP = require('../careerplayer.js');
const dice = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const saveBody = d => JSON.stringify([d.root, d.jobs]);
/* saves S, loads it, then plays both on for the same time with the same dice: they should keep step */
function saveAndPlayOn(S, hours, each) {
  const d = IC.saveGame(S), json = JSON.stringify(d);
  assert(!Object.keys(d.lost).length, `the save dropped functions it cannot name: ${Object.keys(d.lost).join(', ')}`);
  const S2 = IC.loadSave(json);
  assert(saveBody(IC.saveGame(S2)) === saveBody(d), 'saving the loaded game again does not give the same save');
  const rnd = Math.random;
  try {
    for (const G of [S, S2]) { Math.random = dice(7); IC.nidSet(d.nid); for (let i = 0; i < hours * 7200 && !G.over; i++) { IC.step(G, 0.5); if (each && i % 120 === 0) each(G); } }
  } finally { Math.random = rnd; }
  return { d, json, S2 };
}
/* what the player would notice: aircraft, airports, works in progress, weapons in the air, money */
const picture = S => ({
  aircraft: [].concat(S.av ? S.av.tails.map(t => `${t.cs} ${t.where}`) : [], S.air.filter(a => !a.dead).map(a => `${a.name} ${a.state || ''}`), S.threats.filter(t => !t.dead).map(t => `${t.type}#${t.tn || t.id}`)).sort(),
  airports: IC.bases(S).filter(b => b.parts && b.parts.length).map(b => `${b.name}: ${b.parts.length} parts, ${b.parts.filter(p => p.built).length} built`),
  works: IC.bases(S).flatMap(b => (b.works || []).map(w => `${b.name} ${w.part ? w.part.kind : w.kind} ${Math.round((w.prog || 0) * 100)}%`)),
  missiles: S.missiles.length, units: S.units.map(u => `${u.name} ${u.state}`)
});
function samePicture(a, b) {
  const A = picture(a), B = picture(b);
  for (const k in A) {
    const x = JSON.stringify(A[k]), y = JSON.stringify(B[k]);
    assert(x === y, `${k} differ after playing on: ${x.slice(0, 300)} … against the loaded game's ${y.slice(0, 300)}`);
  }
  assert(Math.abs(a.budget - b.budget) <= Math.max(1, Math.abs(a.budget) * 0.01), `money differs: ${U.money(a.budget)} against ${U.money(b.budget)}`);
}
test('save: a Career game with works in progress and aircraft taxiing saves, loads and plays on like the unsaved one', () => {
  const S = IC.newGame({ seed: 4242, mode: 'story' });
  let busy = () => IC.bases(S).some(b => b.works && b.works.length) && S.av.tails.some(t => t.mv);
  for (let i = 0; i < 16 * 7200 && !(S.time > 13 * 3600 && busy()); i++) { IC.step(S, 0.5); if (i % 120 === 0) CP.player(S); }
  assert(busy(), 'no works in progress with aircraft on the ground to save');
  const { json, S2 } = saveAndPlayOn(S, 1, CP.player);
  assert(json.length < 3e6, `a Career save is ${(json.length / 1e6).toFixed(1)} MB`);
  samePicture(S, S2);
  const u = S2.infra.find(b => b.parts && b.parts.length), tl = S2.av.tails.find(t => t.track);
  assert(S2.world === IC.W && S2.byId[u.id] === u && IC.ACTYPES[tl.type] === tl.T, 'the loaded game does not point at its own world, airports and aircraft types');
  if (tl) assert(S2.threats.includes(tl.track) || tl.track.dead || !tl.track, 'a tail and its track are no longer the same object');
});
test('save: a Quick war saved with missiles in the air loads and plays on like the unsaved one', () => {
  const S = IC.newGame({ seed: 4242, mode: 'campaign' });
  const fight = () => S.enemy.war && S.missiles.length > 0 && S.threats.some(t => !t.dead && t.aff === 'H');
  for (let i = 0; i < 9 * 7200 && !fight(); i++) { IC.step(S, 0.5); if (i % 120 === 0) Q.commander(S); }
  assert(fight(), 'no battle to save');
  const { json, S2 } = saveAndPlayOn(S, 0.5, Q.commander);
  assert(json.length < 3e6, `a Quick war save is ${(json.length / 1e6).toFixed(1)} MB`);
  samePicture(S, S2);
  assert(S2.units.every(u => u.d === IC.UNITS[u.type]), 'unit types are copies after a load, not the tables');
});
test('save: lessons, the Test range and the Sandbox save without dropping anything', () => {
  for (const o of [{ mode: 'academy', lesson: 'id', seed: 20260926 }, { mode: 'academy', lesson: 'strike', seed: 20260926 }, { mode: 'range', seed: 1 }, { mode: 'sandbox', seed: 99 }]) {
    const S = IC.newGame(o);
    if (S.range) { IC.rangeSpawn(S, { what: 'drones', n: 6, brg: 90, km: 150, alt: '' }); }
    for (let i = 0; i < 1200; i++) IC.step(S, 0.5);
    const d = IC.saveGame(S);
    assert(!Object.keys(d.lost).length, `${o.lesson || o.mode}: dropped ${Object.keys(d.lost).join(', ')}`);
    const S2 = IC.loadSave(JSON.stringify(d));
    for (let i = 0; i < 600; i++) IC.step(S2, 0.5);
  }
});
test('save: a save from another version of the map generator, or of the game, is refused with a reason', () => {
  const S = IC.newGame({ seed: 7, mode: 'campaign' });
  const d = IC.saveGame(S);
  const odd = Object.assign({}, d, { wsig: 'x' });
  let why = ''; try { IC.loadSave(JSON.stringify(odd)); } catch (e) { why = e.message; }
  assert(/map generator/.test(why) && IC.W === S.world, `a save for a different world was not refused cleanly (${why})`);
  assert(/newer version/.test(IC.saveProblem(Object.assign({}, d, { v: IC.SAVE_VERSION + 1 }))), 'a save from a newer game is not refused');
  assert(/not an Iron Canopy save/.test(IC.saveProblem({ hello: 1 })), 'any JSON passes for a save');
});

/* ---------- words on screen ---------- */
test('text: the interface\'s own words have no doubled spaces, repeated words, "aircrafts" or American spellings', () => {
  const P = require('../tools/textlint.js').lintSource();
  assert(!P.length, `${P.length} problems, first: ${P[0]}`);
});
test('text: ten hours of Career and four of Quick war write no "undefined", "NaN" or "1 minutes"', () => {
  const T = require('../tools/textlint.js'), out = [], seen = new Set();
  const take = (S, where) => {
    const L = (S.logs || []).map(l => l.msg).concat(S.camp ? S.camp.cards.map(c => `${c.title} · ${c.sub} · ${c.text}`).concat(S.camp.comms.map(c => c.text)) : [], (S.news || []).map(n => n.text));
    for (const t of L) if (!seen.has(t)) { seen.add(t); T.check(String(t), where, out); }
  };
  const C = IC.newGame({ seed: 777, mode: 'story', preset: 'network', hour: 7 }); IC.S = C;
  run(C, 10, player); take(C, 'Career');
  const Q2 = IC.newGame({ seed: 778, mode: 'campaign' }); IC.S = Q2;
  run(Q2, 4, S => Q.commander(S)); take(Q2, 'Quick war');
  assert(!out.length, `${out.length} problems, first: ${out[0]}`);
}, true);

/* ---------- run ---------- */
const seedOf = name => { let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return h >>> 0; };
/* run one test; what it prints is kept and shown under its result line */
function runOne(t) {
  const out = [], log = console.log, on = IC.on, offs = [];
  console.log = (...a) => out.push(a.join(' '));
  // listeners a test adds go when it ends: they hold its game, which would otherwise stay in memory
  IC.on = fn => { const off = on(fn); offs.push(off); return off; };
  IC.seedRandom(seedOf(t.name));
  // (and the same ids: the id counter runs on over every game a worker makes, and ids break ties, so a test would
  // play out differently after different tests in its worker)
  IC.nidSet(1);
  const t0 = Date.now();
  let err = null;
  try { t.fn(); } catch (e) { err = e.stack.split('\n').slice(0, 3).join('\n        '); }
  console.log = log; IC.seedRandom(); IC.on = on;
  for (const off of offs) off();
  return { name: t.name, s: (Date.now() - t0) / 1000, err, out };
}
const show = r => {
  console.log(r.err ? `  FAIL  ${r.name}\n        ${r.err}` : `  ok    ${r.name}  (${r.s.toFixed(1)} s)`);
  for (const l of r.out) console.log(l);
};

if (process.env.IC_TEST_WORKER) {
  // a worker: run the tests it is sent, one unit (a test or a group) at a time
  // (a worker that has grown large is replaced by a fresh one: a test that keeps its game alive cannot starve the rest)
  process.on('message', m => { for (const i of m.is) process.send(Object.assign(runOne(tests[i]), { i })); process.send({ done: true, big: process.memoryUsage().heapUsed > 1.5e9 }); });
} else {
  const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
  const timesFile = path.join(__dirname, 'times.json');
  let times = {}; try { times = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch (e) { /* first run: list order */ }
  const chosen = tests.map((t, i) => Object.assign({ i }, t)).filter(t => (!filter || t.name.includes(filter)) &&
    (slowOnly ? t.slow === 'long' : t.slow !== 'long' && !(quick && t.slow)));
  // units: a group runs as one; longest first so the long ones do not start last
  const units = [], byGroup = new Map();
  for (const t of chosen) {
    if (t.group && t.group !== 'alone' && byGroup.has(t.group)) { byGroup.get(t.group).push(t); continue; }
    const u = [t]; units.push(u); if (t.group) byGroup.set(t.group, u);
  }
  const est = u => u.reduce((s, t) => s + (times[t.name] || 5), 0);
  units.sort((a, b) => est(b) - est(a));
  // a shard: the units dealt out longest first to whichever share is shortest so far
  const sh = (args.find(a => a.startsWith('--shard=')) || '').slice(8).split('/').map(Number);
  if (sh.length === 2 && sh[1] > 1) {
    const load = new Array(sh[1]).fill(0), mine = [];
    for (const u of units) { const k = load.indexOf(Math.min(...load)); load[k] += est(u); if (k === sh[0] - 1) mine.push(u); }
    units.length = 0; units.push(...mine);
  }
  if (!units.length) { console.log('No tests match.'); process.exit(1); }
  const again = [];   // timing tests that failed beside the others, to time alone at the end
  const jobs = Math.max(1, Math.min(units.length, +process.env.IC_JOBS || Math.min(8, os.cpus().length, Math.floor(os.totalmem() / 1.6e9))));
  const res = [], t00 = Date.now();
  const finish = () => {
    const fail = res.filter(r => r.err).length;
    if (args.includes('--times')) {
      for (const r of res) if (!r.err) times[r.name] = Math.round(r.s * 10) / 10;
      const sorted = {}; for (const t of tests) if (times[t.name] != null) sorted[t.name] = times[t.name];
      fs.writeFileSync(timesFile, JSON.stringify(sorted, null, 1) + '\n');
    }
    console.log(`\n${res.length - fail} passed, ${fail} failed in ${((Date.now() - t00) / 1000).toFixed(0)} s` + (jobs > 1 ? ` (${jobs} workers)` : ''));
    process.exit(fail ? 1 : 0);
  };
  if (jobs === 1) {
    for (const u of units) for (const t of u) { const r = runOne(tests[t.i]); res.push(r); show(r); }
    finish();
  } else {
    let live = 0;
    const done = () => {
      if (!again.length) return finish();
      console.log(`\n  timing again, alone: ${again.map(t => t.name).join('; ')}`);
      units.push(again.splice(0)); spawn();
    };
    const result = (m, t) => {
      if (m.err && t && t.group === 'alone' && !t.retried) { t.retried = true; again.push(t); console.log(`  (slow beside the other workers: ${m.name})`); return; }
      res.push(m); show(m);
    };
    const spawn = () => {
      const w = cp.fork(__filename, args, { env: Object.assign({}, process.env, { IC_TEST_WORKER: '1' }) });
      let cur = null;
      live++;
      const next = () => { cur = units.shift(); if (cur) w.send({ is: cur.map(t => t.i) }); else w.disconnect(); };
      w.on('message', m => {
        if (!m.done) { result(m, cur.find(t => t.i === m.i)); cur = cur.filter(t => t.i !== m.i); return; }
        if (m.big && units.length) { cur = null; w.disconnect(); spawn(); } else next();
      });
      w.on('exit', code => {
        // a worker that dies takes its current tests with it: they fail
        for (const t of cur || []) { const r = { name: t.name, s: 0, err: `the test worker stopped (exit code ${code})`, out: [] }; res.push(r); show(r); }
        cur = null;
        if (--live === 0) done();
      });
      next();
    };
    for (let k = 0; k < jobs; k++) spawn();
  }
}
