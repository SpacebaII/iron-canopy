/* Economy balance run: Career Act I with the scripted player of careerplayer.js (builds the national airport,
   approves feasible airline requests and answers decisions with the first option). Prints income, city growth and passenger demand every six hours, and the statement at
   the end of each day. The run stays in Act I (the beat that ends it is taken out) unless "free" is given.
   node econtest.js [seed] [days] [free] */
const IC = require('./headless.js');
const U = IC.U;
const { player } = require('./careerplayer.js');
const seed = +process.argv[2] || 777, days = +process.argv[3] || 3;
const S = IC.newGame({ seed, mode: 'story', hour: 7 }); IC.S = S;
if (process.argv[4] !== 'free') S.story.beats = S.story.beats.filter(b => b.id !== 'collision');
const E = S.econ, t0 = S.time, b0 = S.budget;
const f0 = n => Math.round(n).toLocaleString('en-US');
const cities = IC.cities(S).slice().sort((a, b) => b.pop - a.pop).slice(0, 6);
const pop0 = new Map(IC.cities(S).map(c => [c, c.popF]));
console.log(`seed ${seed} · ${IC.cities(S).length} cities · ${S.infra.filter(i => i.kind === 'airport').length} airports · industries: ${E.inds.map(i => i.name).join(', ')}`);
let lastDay = U.day(S.time);
const report = () => {
  const L = S.ledger, A = S.av;
  console.log(`\n${U.clock(S.time)} · treasury ${U.money(S.budget)} (${S.budget >= b0 ? '+' : ''}${f0(S.budget - b0)} since the start) · act ${S.story.act}`);
  console.log(`  income/h: grant ${L.base.toFixed(1)} + airline fees ${L.av.toFixed(1)} + taxes ${L.tax.toFixed(1)} + trade ${L.trade.toFixed(1)}  −  upkeep ${S.upkeep.toFixed(1)}  (trade taxes before the story's share: ${IC.tradeTax(S).toFixed(2)})`);
  console.log(`  airlines: ${A.routes.filter(r => r.st === 'active').length} routes, ${A.tails.filter(t => t.where !== 'lost').length} aircraft, ${f0(A.paxTotal)} passengers and ${A.flightsTotal} movements so far, ${f0(A.paxHour)} passengers in the last hour`);
  for (const ap of S.infra.filter(i => i.kind === 'airport' && i.svc)) { const v = ap.svc; console.log(`  ${ap.name.padEnd(26)} demand ${f0(v.demand).padStart(6)}/day  seats ${f0(v.seats).padStart(6)}  full ${U.pct(v.lf).padStart(4)}  ${Math.round(v.deps)} departures to ${v.dests.size} places`); }
  for (const c of cities) console.log(`  ${c.name.padEnd(12)} ${String(c.pop).padStart(5)}k (${((c.popF / pop0.get(c) - 1) * 100).toFixed(2).padStart(5)}%)  ${c.gr.tot >= 0 ? '+' : ''}${c.gr.tot.toFixed(2)}%/day  air ${U.pct(c.air.score).padStart(4)}  flyers ${f0(c.air.demand).padStart(6)}/day  prosperity ${U.pct(c.prosp)}  blocks ${c.blocks.filter(b => !b.empty).length}`);
  console.log(`  industry: ${E.inds.map(i => `${i.place} ${U.money(i.out * 24)}/day`).join(', ')}`);
};
IC.step(S, 0.5);
report();
for (let step = 0; S.time - t0 < days * 86400 && !S.over; step++) {
  IC.step(S, 0.5);
  if (step % 120 === 0) {
    player(S);
  }
  if (step % 43200 === 43199) report();
  const d = U.day(S.time);
  if (d !== lastDay) {
    lastDay = d;
    const b = E.days[E.days.length - 1];
    console.log(`\n=== day ${b.day} statement: ${Object.entries(b.book).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${IC.STATEMENT[k] || k} ${v >= 0 ? '+' : ''}${v.toFixed(0)}`).join(', ')}`);
    console.log(`    all cities ${f0(b.pop)}k people, ${f0(b.demand)} want to fly a day`);
  }
}
if (S.over) console.log('game over:', S.over);
const grown = IC.cities(S).reduce((s, c) => s + c.blocks.filter(b => b.grown).length, 0);
console.log(`\nafter ${days} days: treasury ${U.money(S.budget)}, ${grown} blocks built by growth, ${IC.cities(S).reduce((s, c) => s + c.blocks.filter(b => b.empty).length, 0)} emptied, act ${S.story.act}`);
