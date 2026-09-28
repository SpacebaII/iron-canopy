/* Step time with a busy sky: 300 flights in the air over the country and a raid on the capital.
     node tools/airspace-perf.js [path to another checkout]
   Prints the mean and the worst of 480 steps of 0.25 game s (two game minutes). */
const path = require('path');
const IC = require(path.resolve(process.argv[2] || path.join(__dirname, '..'), 'headless.js'));
const U = IC.U;
const S = IC.newGame({ seed: 12345, mode: 'campaign', hour: 10 });
for (let i = 0; i < 40; i++) IC.step(S, 0.25);
const home = IC.cities(S).filter(c => c.owner === 'us'), R = IC.makeRng(7);
// airliners between random cities at their cruise levels, some climbing and descending
while (S.threats.filter(t => t.d.civil && !t.dead).length < 300) {
  const a = home[Math.floor(R() * home.length)], b = home[Math.floor(R() * home.length)];
  if (a === b || U.dist(a, b) < 1500) continue;
  const f = 0.1 + R() * 0.8, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, cruise = IC.aspLevel(9 + R() * 3, a, b);
  IC.spawnThreat(S, 'civ', x, y, { dest: { x: b.x, y: b.y }, wps: [{ x: b.x, y: b.y }], orig: { x: a.x, y: a.y }, cs: `PRF ${100 + S.threats.length}`, sq: IC.squawk(), alt: cruise, cruise, pax: 150, plan: { a, b, pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] }, route: [b], aim: b });
}
// the raid: drones, cruise missiles and ballistic missiles on the capital
const c = IC.cap(S);
for (let i = 0; i < 20; i++) IC.spawnThreat(S, 'jdr', c.x + 900 + i * 20, c.y - 600, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y } });
for (let i = 0; i < 10; i++) IC.spawnThreat(S, 'lacm', c.x + 700, c.y - 300 + i * 30, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y } });
for (let i = 0; i < 4; i++) IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900 + i * 100, { x: c.x, y: c.y });
const T = [];
for (let i = 0; i < 480; i++) { const t0 = process.hrtime.bigint(); IC.step(S, 0.25); T.push(Number(process.hrtime.bigint() - t0) / 1e6); }
T.sort((a, b) => a - b);
const mean = T.reduce((s, v) => s + v, 0) / T.length;
console.log(`${S.threats.filter(t => t.d.civil).length} flights, ${S.threats.filter(t => !t.d.civil).length} hostile, ${S.missiles.length} interceptors: step ${mean.toFixed(3)} ms mean, ${T[Math.floor(T.length * 0.95)].toFixed(3)} ms at the 95th percentile, ${T[T.length - 1].toFixed(2)} ms worst`);
