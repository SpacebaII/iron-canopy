/* (brief 69) the Director's desk over a Career: the scripted player (careerplayer.js), or nobody (LAZY=1), and a line
   for every pressure, mandate, review and month, with the Minister's confidence.
   node tools/desk-run.js [seed] [months] */
const IC = require('../headless.js');
const { player } = require('../careerplayer.js');
const U = IC.U;
const seed = +process.argv[2] || 12345, months = +process.argv[3] || 12, lazy = !!process.env.LAZY;
IC.seedRandom(seed);
const S = IC.newGame({ seed, mode: 'story', hour: 7 }); IC.S = S;
const st = S.story, t0 = S.time;
const say = s => console.log(`${U.date(S.time, S).padEnd(18)} ${String(Math.round(st.standing)).padStart(3)}  ${s}`);
IC.on((S2, type, d) => {
  if (S2 !== S) return;
  if (type === 'pressure') say(`desk: ${d.outcome.padEnd(7)} ${d.title}`);
  else if (type === 'mandate') say(`mandate ${d.met ? 'met' : `missed (${d.miss})`}: chapter ${d.ch + 1}`);
  else if (type === 'review') say(`review ${d.q}: ${d.rows.map(r => `${r.k} ${r.g} (${r.say})`).join('; ')}`);
  else if (type === 'storyChapter') say(`=== chapter ${d + 1}`);
  else if (type === 'act') say(`=== act ${d}`);
  else if (type === 'over') say(`OVER: ${d}`);
});
let lastM = S.cal.m, n = 0;
while (S.time - t0 < IC.MO(S, months) && !S.over) {
  IC.step(S, IC.calmSky(S) ? 8 : 1);
  if (++n % 8 === 0) { if (!lazy) player(S); else { for (const e of st.events.slice()) if (S.time - e.t > 120) IC.storyChoose(S, e.id, 0); if (!st.cap) { const { site } = require('../careerplayer.js'), p = site(S, IC.cap(S), 180, 380); if (p) IC.foundAirport(S, p.x, p.y, IC.PREVAIL); } } }
  if (S.cal.m !== lastM) { lastM = S.cal.m; say(`month: ${U.money(S.budget)}, ${Math.round(Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0))} pax/day, ${S.av.airlines.length} airlines, record ${IC.deskRecord(S).toFixed(1)}, desk ${st.desk ? st.desk.P.length : 0}`); }
}
