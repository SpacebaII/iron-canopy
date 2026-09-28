/* The Career's balance run: a scripted player (careerplayer.js) through Act I. Prints when each chapter starts,
   what the player has every six hours, and the chapter lengths at the end.
   node storytest.js [seed] [max game days] [hours into Act II]      QUIET=1 hides the log lines */
const IC = require('./headless.js');
const { player } = require('./careerplayer.js');
const U = IC.U;
const seed = +process.argv[2] || 12345, days = +process.argv[3] || 6, after = +process.argv[4] || 0;
const quiet = process.env.QUIET;
const S = IC.newGame({ seed, mode: 'story', hour: 7 }); IC.S = S;
const st = S.story, t0 = S.time;
const logs = [];
const origLog = IC.log;
IC.log = function (S2, kind, tag, msg, at) { if (['GOAL', 'MAYDAY', 'DECISION', 'AIRSPACE', 'MIN', 'PM', 'ATC', 'APT', 'FIN', 'GOV', 'INT'].includes(tag) && !quiet) logs.push(`${U.clock(S2.time)} [${tag}] ${msg}`); return origLog(S2, kind, tag, msg, at); };
const el = () => (S.time - t0) / 3600;
let chSeen = -1, lastH = -6, wall = Date.now();
console.log(`seed ${seed}: ${S.world.cities.length} cities, capital ${IC.cap(S).name}, budget ${U.money(S.budget)}`);
for (let step = 0; el() < days * 24 && !S.over && st.act === 1; step++) {
  IC.step(S, 1);
  if (step % 60 === 0) player(S);
  if (st.ch !== chSeen) { chSeen = st.ch; console.log(`\n=== ${U.clock(S.time)} (+${el().toFixed(1)} h) Chapter ${st.ch + 1}: ${IC.CHAPTERS[st.ch].title}`); }
  if (el() - lastH >= 6) {
    lastH = el();
    const A = S.av, N = S.asp, ap = st.cap && S.byId[st.cap];
    console.log(`${U.clock(S.time)} ch${st.ch + 1} conf ${st.standing.toFixed(0)} ${U.money(S.budget)} grant ${st.grant.toFixed(1)}/h fees ${IC.avRevenueRate(S).toFixed(1)}/h up ${S.upkeep.toFixed(1)}/h · airlines ${A.airlines.length} sat ${Math.round(IC.avgSat(S))}% routes ${A.routes.filter(r => r.st === 'active').length} pax today ${Math.round(A.day.pax)} · ctl ${Math.round(N.load)}/${N.cap} los ${N.stats.los} near ${N.stats.near} · ${ap ? `${ap.name}: ${IC.aptStands(ap).length} stands, ${ap.works.length} works` : 'no airport'}`);
    console.log('    goals: ' + st.goals.map(g => (g.failed ? '✗' : g.done ? '✓' : '·') + g.id + (!g.done && g.prog ? ` (${g.prog()})` : '')).join('  '));
  }
  while (logs.length) console.log('      ' + logs.shift());
}
while (logs.length) console.log('      ' + logs.shift());
console.log(`\nAct ${st.act} after ${el().toFixed(1)} game hours (${((Date.now() - wall) / 1000).toFixed(0)} s)${S.over ? ' · over: ' + S.over : ''}`);
console.log('Chapter starts (game hours from the start):');
const L = st.chLog.concat(st.act > 1 ? [{ ch: 6, t: st.actT }] : []);
// a look at Act II's money with what Act I left behind
if (st.act === 2 && after) {
  const b0 = S.budget, t1 = S.time;
  for (let step = 0; S.time - t1 < after * 3600 && !S.over; step++) { IC.step(S, 1); if (step % 60 === 0) player(S); }
  console.log(`Act II after ${after} h: ${U.money(b0)} → ${U.money(S.budget)}, grant ${st.grant.toFixed(1)}/h, fees ${IC.avRevenueRate(S).toFixed(1)}/h, upkeep ${S.upkeep.toFixed(1)}/h, confidence ${st.standing.toFixed(0)}, goals ${st.goals.filter(g => g.done).length}/${st.goals.length}${S.over ? ', over: ' + S.over : ''}`);
}
// real minutes at a speed: IC.GS game seconds a real second at 1×
const real = (h, sp) => `${Math.round(h * 3600 / (IC.GS * sp) / 60)}`;
L.forEach((c, i) => { const nx = L[i + 1], h = nx ? (nx.t - c.t) / 3600 : 0; console.log(`  ${c.ch < 6 ? `Chapter ${c.ch + 1} ${IC.CHAPTERS[c.ch].title}` : 'Act II'}`.padEnd(38) + `+${((c.t - t0) / 3600).toFixed(1)} h` + (nx ? `   lasted ${h.toFixed(1)} h: ${real(h, 1)} / ${real(h, 4)} / ${real(h, 16)} real min at 1× / 4× / 16×` : '')); });
if (st.act > 1) { const h = (st.actT - t0) / 3600; console.log(`Act I: ${h.toFixed(1)} game hours = ${real(h, 1)} real minutes at 1×, ${real(h, 4)} at 4×, ${real(h, 16)} at 16× (plus the time spent building and reading)`); }
const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us');
console.log(`Airports: ${aps.map(a => `${a.name} (${IC.aptStands(a).length} stands, longest runway ${U.km(a.st.longest || 0)}, name ${Math.round(IC.aptRep(a))})`).join('; ')}`);
const D = S.av.deals, sum = k => D.reduce((s, d) => s + (d[k] || 0), 0);
console.log(`Deals: ${D.filter(d => d.st === 'active').length} running, ${sum('honoured')} terms honoured (${sum('clean')} with no bad day), ${D.filter(d => d.st === 'broken').length} broken (${D.filter(d => d.st === 'broken').map(d => d.why).join('; ')}); ${sum('flown')} flights, ${sum('late')} late, ${sum('cancel')} cancelled, ${sum('strikes')} bad days; treasury ${U.money(S.budget)}`);
