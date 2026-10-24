/* node tools/road-audit.js [seed | --map=name] [--city=name] [--list=kind] [--n=count]
   Drives the road network as a car would and reports where it cannot: ends that lead nowhere, ends that stop a few
   metres short of another road, pieces too short for two cars, kinks a car in its lane would jump, and links a car
   can reach but not leave (or leave but not reach). Headless. */
const path = require('path');
const IC = require(path.join(__dirname, '..', 'headless.js'));
const U = IC.U;
const args = process.argv.slice(2), seed = +(args.find(a => /^\d+$/.test(a)) || 4242);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const W = opt('map') ? IC.generate(IC.mapSeed(opt('map')), opt('map')) : IC.generate(seed), G = IC.driveGraph(W);
const R = IC.roadAudit(W, G);
console.log(`${opt('map') ? 'map ' + opt('map') : 'seed ' + seed}: ${G.links.length} links, ${G.nodes.length} nodes`);
for (const k in R.count) console.log(`  ${k.padEnd(10)} ${R.count[k]}  ${R.words[k]}`);
const L = opt('list');
if (L) for (const p of R.list[L].slice(0, +(opt('n') || 20))) console.log(`  ${L} ${p.x.toFixed(2)},${p.y.toFixed(2)} ${p.cls || ''} ${p.why || ''}`);
