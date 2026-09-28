/* The enemy commander's balance run: a Quick war with the scripted commander of qwplayer.js, printing the enemy's own
   log (what it plans and why, what it learnt), what our intelligence told the player, the after-action reports,
   and at the end the share of weapons each target set and the main air base took.
   node tools/enemy-timeline.js [seed] [hours of war] [intel] */
const IC = require('../headless.js');
const Q = require('../qwplayer.js');
const U = IC.U;
const seed = +process.argv[2] || 777, hours = +process.argv[3] || 72, showIntel = process.argv[4] !== 'nointel';
const S = IC.newGame({ seed, mode: 'campaign' }); IC.S = S;
const E = S.enemy, lines = [];
const warH = t => E.warT ? ((t - E.warT) / 3600).toFixed(1).padStart(5) : '  pre';
IC.on((S2, type, d) => {
  if (S2 !== S) return;
  if (type === 'raidOver') lines.push({ t: S.time, s: `  AFTER-ACTION ${d.name} on ${d.obj.name}: ${d.text}` });
  if (type === 'enemyAct') lines.push({ t: S.time, s: `  === ACT ${d.act}: ${d.name} ===` });
});
let seenLog = 0, seenIntel = 0;
const flush = () => {
  for (; seenLog < E.clog.length; seenLog++) { const c = E.clog[seenLog]; lines.push({ t: c.t, s: `  [act ${c.act}] ${c.text}` }); }
  if (showIntel) { const fresh = E.intel.slice(0, E.intel.length - seenIntel).reverse(); seenIntel = E.intel.length; for (const i of fresh) lines.push({ t: i.t, s: `  INTEL: ${i.text}` }); }
  lines.sort((a, b) => a.t - b.t);
  for (const l of lines) console.log(`${U.clock(l.t)} (war h ${warH(l.t)})${l.s}`);
  lines.length = 0;
};
console.log(`seed ${seed} · Quick war · aim at the start: ${IC.EAIMS[E.aim].name} (${Object.entries(E.aims).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')})`);
for (let i = 0; !S.over && (!E.war || S.time - E.warT < hours * 3600); i++) {
  IC.step(S, 1);
  if (i % 60 === 0) Q.commander(S);
  if (i % 600 === 0) flush();
}
flush();
const T = IC.enemyTally(S), main = IC.mainBase(S);
const pct = (n, d) => d ? U.pct(n / d) : '–';
console.log(`\n${S.over ? 'game over: ' + S.over : 'still going'} · act ${E.act} · defence won ${E.winH.toFixed(1)} h · enemy will ${Math.round(E.will)}%`);
console.log(`before act 4 (${T.preN} weapons): ${Object.entries(T.pre).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, T.preN)}`).join(', ')}`);
console.log(`whole war (${T.allN} weapons): ${Object.entries(T.all).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, T.allN)}`).join(', ')} · main air base ${main.name} ${pct(T.ref[main.id] || 0, T.allN)}`);
for (const r of S.raids || []) console.log(`  ${U.clock(r.t)} ${r.kind.padEnd(11)} ${r.obj.padEnd(34)} ${String(r.threats).padStart(3)} launched ${String(r.kills).padStart(3)} down ${String(r.leaks).padStart(3)} through ${String(r.hits).padStart(3)} hits`);
