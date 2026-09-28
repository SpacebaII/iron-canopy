/* The Career's balance run: a scripted player (careerplayer.js) through all four acts. Prints the date each
   chapter and act starts, a line a month (treasury, income and costs, airlines, passengers), and at the end the
   timeline with real playing times at normal and fast speeds.
   node storytest.js [seed] [max years] [act to stop at]      QUIET=1 hides the log lines, SAVE=file.json saves the
   game at the end (tools/calendar-shots.js takes its pictures from such a save)
   The step is 8 game seconds while the sky is calm (the "wait for money" speed takes the same steps: the flights,
   fees and delays come out the same as at 1 s), 1 s while anything hostile or armed is in the air. */
const IC = require('./headless.js');
const { player } = require('./careerplayer.js');
const U = IC.U;
const seed = +process.argv[2] || 12345, years = +process.argv[3] || 14, stopAct = +process.argv[4] || 5;
const quiet = process.env.QUIET;
if (process.env.START) IC.CAREER_START = +process.env.START;   // (to try another starting treasury)
const S = IC.newGame({ seed, mode: 'story', hour: 7 }); IC.S = S;
const st = S.story, t0 = S.time, MO = IC.MO(S);
const logs = [];
const origLog = IC.log;
IC.log = function (S2, kind, tag, msg, at) { if (['GOAL', 'MAYDAY', 'DECISION', 'AIRSPACE', 'MIN', 'PM', 'INT', 'GOV'].includes(tag) && !quiet) logs.push(`${U.clock(S2.time)} [${tag}] ${msg}`); return origLog(S2, kind, tag, msg, at); };
const mo = t => (t - t0) / MO;
const stamp = t => `${U.date(t)} (+${mo(t).toFixed(1)} months)`;
const marks = [];   // { what, t }
let chSeen = -1, actSeen = 1, wall = Date.now(), lastM = S.cal.m;
console.log(`seed ${seed}: ${S.world.cities.length} cities, capital ${IC.cap(S).name}, budget ${U.money(S.budget)}; a month is ${IC.dpm(S)} days`);
marks.push({ what: 'Act I', t: S.time });
const calm = () => !S.threats.some(t => !t.dead && !(t.d && t.d.civil)) && !S.missiles.length;
let nextP = 0;
while (mo(S.time) < years * 12 && !S.over && st.act < stopAct) {
  const dt = calm() ? 8 : 1;
  IC.step(S, dt);
  if (S.time >= nextP) { player(S); nextP = S.time + 64; }
  if (st.act === 1 && st.ch !== chSeen) { chSeen = st.ch; marks.push({ what: `Chapter ${st.ch + 1} ${IC.CHAPTERS[st.ch].title}`, t: S.time, ch: st.ch }); console.log(`\n=== ${stamp(S.time)} Chapter ${st.ch + 1}: ${IC.CHAPTERS[st.ch].title}`); }
  if (st.act !== actSeen) { actSeen = st.act; marks.push({ what: `${IC.ACTS[st.act].name} ${IC.ACTS[st.act].title}`, t: S.time, act: st.act }); console.log(`\n=== ${stamp(S.time)} ${IC.ACTS[st.act].name}: ${IC.ACTS[st.act].title}`); }
  if (S.cal.m !== lastM) {
    lastM = S.cal.m;
    const A = S.av, aps = IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us'), m1 = IC.monthStatement(S, 1);
    console.log(`${U.date(S.time).padEnd(20)} ${U.money(S.budget).padStart(9)}  month ${m1 ? (m1.net >= 0 ? '+' : '') + Math.round(m1.net) : '?'} (in ${m1 ? Math.round(m1.income) : '?'})  grant ${st.grant.toFixed(1)}/h fees ${IC.avRevenueRate(S).toFixed(1)}/h up ${S.upkeep.toFixed(1)}/h (apt ${(S.ledger.upApt || 0).toFixed(1)}, radars ${(S.ledger.upAD || 0).toFixed(1)}, ${S.units.filter(u => !u.dead && u.type === 'ssr').length} SSR) · conf ${st.standing.toFixed(0)} · ${A.airlines.length} airlines, ${A.routes.filter(r => r.st === 'active').length} routes, ${A.deals.filter(d => d.st === 'active').length} deals, pax/day ${Math.round(Math.max(A.day.pax, A.yesterday ? A.yesterday.pax : 0))} · ${aps.length} airports ${aps.map(a => IC.aptStands(a).length).join('/')} stands · goals ${st.goals.filter(g => g.done).length}/${st.goals.length}${st.act >= 4 ? ` · will ${Math.round(S.enemy.will)}` : ''} · ${((Date.now() - wall) / 60000).toFixed(1)} min`);
  }
  while (logs.length) console.log('      ' + logs.shift());
}
while (logs.length) console.log('      ' + logs.shift());
marks.push({ what: S.over ? `End: ${S.over}` : 'Stopped', t: S.time });
console.log(`\n${S.over ? 'Over: ' + S.over : `Act ${st.act} after ${mo(S.time).toFixed(1)} months`} (${((Date.now() - wall) / 60000).toFixed(0)} min to run)`);
// real minutes: IC.GS game seconds a real second at 1×; Wait runs a month in about a minute
const real = (gs, sp) => gs / (IC.GS * sp) / 60;
const fmt = m => m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`;
console.log('\nTimeline'.padEnd(46) + 'starts'.padEnd(34) + 'lasts'.padEnd(14) + 'real time at 8× / 32× / Wait');
marks.forEach((c, i) => {
  const nx = marks[i + 1], gs = nx ? nx.t - c.t : 0;
  console.log(`  ${c.what}`.padEnd(46) + `${U.date(c.t)} (+${mo(c.t).toFixed(1)} mo)`.padEnd(34) + (nx ? `${(gs / MO).toFixed(1)} months`.padEnd(14) + `${fmt(real(gs, 8))} / ${fmt(real(gs, 32))} / ${fmt(real(gs, IC.WAIT.speed))}` : ''));
});
const act = n => marks.find(m => m.act === n), a2 = act(2);
if (a2) console.log(`Act I: ${((a2.t - t0) / IC.YR(S)).toFixed(1)} years`);
console.log(`Career so far: ${((S.time - t0) / IC.YR(S)).toFixed(1)} years`);
const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us');
console.log(`Airports: ${aps.map(a => `${a.name} (${IC.aptStands(a).length} stands, longest runway ${U.km(a.st.longest || 0)}, name ${Math.round(IC.aptRep(a))})`).join('; ')}`);
const D = S.av.deals, sum = k => D.reduce((s, d) => s + (d[k] || 0), 0);
console.log(`Deals: ${D.filter(d => d.st === 'active').length} running, ${sum('honoured')} terms honoured (${sum('clean')} with no bad day), ${D.filter(d => d.st === 'broken').length} broken; ${sum('flown')} flights, ${sum('late')} late, ${sum('cancel')} cancelled; treasury ${U.money(S.budget)}`);
if (process.env.SAVE) { require('fs').writeFileSync(process.env.SAVE, JSON.stringify(IC.saveGame(S))); console.log(`saved to ${process.env.SAVE}`); }
