/* Step time in a busy war: a Quick war played by the scripted commander of qwplayer.js until the enemy is past its
   probing (act 2 or later) with a raid in the air, then a few thousand steps of 0.25 game s timed one by one.
     node tools/war-perf.js [--seed=777] [--steps=4000] [--min=40] [--phases] [--snap=file] [--root=dir]
   --min: hostile tracks in the air before timing starts; --phases: time each part of the step (IC.weather, IC.sense…);
   --snap=file: keep the warmed-up game (the warm-up takes minutes) and start from it when it is there;
   --root=dir: time another checkout's game with this script (comparing two checkouts).
   Times are CPU time (process.cpuUsage), so a busy machine slows the run but not the numbers much.
   Prints the median, the 95th percentile and the worst, and a hash of the state after the run: the same seed must give
   the same hash on two checkouts, or a change altered the game. Profile with: node --cpu-prof tools/war-perf.js */
const path = require('path'), crypto = require('crypto');
const args = process.argv.slice(2), opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(opt('root', path.resolve(__dirname, '..')));
const IC = require(path.join(ROOT, 'headless.js'));
const Q = require(path.join(ROOT, 'qwplayer.js'));
const seed = +opt('seed', 777), N = +opt('steps', 4000), MIN = +opt('min', 40);
const fs = require('fs'), SNAP = opt('snap', '');
IC.seedRandom(seed);
const w0 = Date.now(), fromSnap = SNAP && fs.existsSync(SNAP);
let S = fromSnap ? IC.loadSave(fs.readFileSync(SNAP, 'utf8')) : IC.newGame({ seed, mode: 'campaign' }); IC.S = S;
let E = S.enemy;
const hostile = () => S.threats.filter(t => !t.dead && !t.d.civil).length;
// warm up a second at a time, as tools/enemy-timeline.js plays, until a raid of act 2 or later is in the air
// (keeping the game as it was 15–20 minutes before, for --snap: a loaded game is played that long untimed, below)
let i = 0;
const ring = [];
if (!fromSnap) for (; !S.over && !(E.act >= 2 && hostile() >= MIN) && S.time < 80 * 3600; i++) {
  IC.step(S, 1); if (i % 60 === 0) Q.commander(S);
  if (SNAP && E.act >= 2 && i % 300 === 0) { ring.push(JSON.stringify(IC.saveGame(S))); if (ring.length > 4) ring.shift(); }
}
if (SNAP) {
  if (!fromSnap) { fs.writeFileSync(SNAP, ring[0] || JSON.stringify(IC.saveGame(S))); S = IC.loadSave(fs.readFileSync(SNAP, 'utf8')); IC.S = S; E = S.enemy; }
  // the same dice from here, and a quarter of an hour untimed: a loaded game rebuilds its caches in its first steps
  // and minutes (the landside's ten-minute tick seats the airports' roads again), a live one has them already
  IC.seedRandom(seed + 1);
  for (let k = 0; k < 900 && !S.over; k++) { IC.step(S, 1); if (k % 60 === 0) Q.commander(S); }
}
const warm = (Date.now() - w0) / 1000;
// the parts of the step (or the functions named by --fns=a,b), timed when asked: in all, and in calls over 1 ms (the hitches)
const PH = {}, SP = {}, NC = {};
const wrap = name => {
  const f = IC[name]; if (typeof f !== 'function') return;
  PH[name] = SP[name] = NC[name] = 0;
  IC[name] = function () { const c0 = process.cpuUsage(); const r = f.apply(this, arguments); const c = process.cpuUsage(c0), ms = (c.user + c.system) / 1000; PH[name] += ms; if (ms > 1) { SP[name] += ms; NC[name]++; } return r; };
};
if (args.includes('--phases')) {
  const src = fs.readFileSync(path.join(ROOT, 'iron-canopy/js/sim.js'), 'utf8');
  for (const name of new Set([...src.matchAll(/IC\.(\w+)\(S, dt\)/g)].map(m => m[1]))) wrap(name);
}
for (const name of opt('fns', '').split(',').filter(Boolean)) wrap(name);
const busy = `act ${E.act}, ${S.units.filter(u => !u.dead).length} units, ${hostile()} hostile, ${S.threats.length} tracks, ${S.missiles.length} interceptors, ${(S.vehicles || []).length} vehicles`;
const T = [];
for (let k = 0; k < N && !S.over; k++) {
  const c0 = process.cpuUsage(); IC.step(S, 0.25); const c = process.cpuUsage(c0), ms = (c.user + c.system) / 1000; T.push(ms);
  if (k % 240 === 0) Q.commander(S);
}
T.sort((a, b) => a - b);
const q = f => T[Math.min(T.length - 1, Math.floor(T.length * f))].toFixed(3);
// a compact summary of the state: what the game would show if anything had changed
const r = v => Math.round(v * 1000) / 1000;
const sum = {
  time: S.time, act: E.act, budget: r(S.budget), pm: r(S.pm), stats: S.stats,
  threats: S.threats.map(t => [t.id, t.type, r(t.x), r(t.y), r(t.alt || 0), t.dead ? 1 : 0]),
  units: S.units.map(u => [u.id, u.type, u.state, r(u.x), r(u.y), u.dead ? 1 : 0, (u.mags || []).map(m => `${m.mun}:${m.mag}:${m.store}`).join(' ')]),
  missiles: S.missiles.map(m => [m.mun, r(m.x), r(m.y), r(m.alt)]), vehicles: (S.vehicles || []).map(v => [r(v.x), r(v.y)]), raids: (S.raids || []).length
};
const hash = crypto.createHash('sha1').update(JSON.stringify(sum)).digest('hex').slice(0, 16);
console.log(`${path.relative(process.cwd(), ROOT) || '.'} · seed ${seed} · ${fromSnap ? 'loaded from ' + SNAP + ' in' : `warm-up ${i} s of game in`} ${warm.toFixed(1)} s · ${busy}`);
console.log(`${T.length} steps of 0.25 s: median ${q(0.5)} ms, 95th percentile ${q(0.95)} ms, worst ${T[T.length - 1].toFixed(2)} ms, mean ${(T.reduce((s, v) => s + v, 0) / T.length).toFixed(3)} ms`);
if (Object.keys(PH).length) {
  const tot = Object.values(PH).reduce((s, v) => s + v, 0);
  console.log('ms per step (of which in calls over 1 ms) and the calls over 1 ms:');
  for (const [k, v] of Object.entries(PH).sort((a, b) => b[1] - a[1]).filter(e => e[1] / tot > 0.01)) console.log(`  ${k.padEnd(18)} ${(v / T.length).toFixed(3)} (${(SP[k] / T.length).toFixed(3)}) ${NC[k]}`);
}
console.log(`state hash ${hash}`);
