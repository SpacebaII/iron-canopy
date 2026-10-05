/* Engagement balance: standard raids on the Test range against a standard layered defence, several seeds each.
   Prints for each raid what was launched, shot down and leaked, the defence's kill rate, missiles fired, and the
   flight time of our missiles (mean and longest, by round). Run it on two checkouts to compare.
   node tools/engage-balance.js [seeds]  (on main before brief 43, one seed: 92% of 178 weapons down; our missiles fly 45 s on average at long range, 31 s medium, 14 s short) */
const IC = require('../headless.js');
const U = IC.U;
const seeds = +process.argv[2] || 4;
const RAIDS = [['mixed', 14, 150], ['cruise', 12, 150], ['drones', 20, 120], ['sead', 6, 200], ['ballistic', 6, 400], ['big', 24, 200]];
const DEF = [['lrsam', -120, 0], ['mr3d', -100, 30], ['mrsam', -60, 40], ['mrsam', -40, -50], ['shorad', 30, 0], ['shorad', 10, 40]];
const tof = {}, tot = { launched: 0, kills: 0, leaks: 0, shots: 0 };
console.log('raid        launched  down  leaked  kill rate  shots');
for (const [what, n, km] of RAIDS) {
  const a = { launched: 0, kills: 0, leaks: 0, shots: 0 };
  for (let s = 1; s <= seeds; s++) {
    const S = IC.newGame({ seed: s, mode: 'range' }), T = S.range.target;
    for (const [type, dx, dy] of DEF) IC.rangeAddUnit(S, type, T.x + dx, T.y + dy);
    const born = new Map();
    const off = IC.on((S2, type, d) => { if (S2 !== S) return; });
    IC.rangeSpawn(S, { what, n, brg: 90, km, alt: '' });
    for (let i = 0; i < 4 * 5400; i++) {
      IC.step(S, 0.25);
      for (const m of S.missiles) if (!born.has(m)) born.set(m, S.time);
      for (const [m, t0] of born) if (m.dead || !S.missiles.includes(m)) { (tof[m.mun] = tof[m.mun] || []).push(S.time - t0); born.delete(m); }
      if (S.range.pending.length === 0 && S.threats.every(t => t.dead || t.mission === 'rtb' || t.mission === 'jam') && !S.missiles.length && S.time - S.range.t0 > 300) break;
    }
    const st = IC.rangeStats(S);
    a.launched += st.launched; a.kills += st.kills; a.leaks += st.leaks; a.shots += st.shots;
  }
  for (const k in tot) tot[k] += a[k];
  console.log(`${what.padEnd(11)} ${String(a.launched).padStart(8)} ${String(a.kills).padStart(5)} ${String(a.leaks).padStart(7)} ${U.pct(a.kills / Math.max(1, a.launched)).padStart(10)} ${String(a.shots).padStart(6)}`);
}
console.log(`${'all'.padEnd(11)} ${String(tot.launched).padStart(8)} ${String(tot.kills).padStart(5)} ${String(tot.leaks).padStart(7)} ${U.pct(tot.kills / Math.max(1, tot.launched)).padStart(10)} ${String(tot.shots).padStart(6)}`);
console.log('\nflight time of our missiles (game s): round  n  mean  longest');
for (const k in tof) { const v = tof[k]; console.log(`  ${k.padEnd(5)} ${String(v.length).padStart(4)} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(0).padStart(5)} ${Math.max(...v).toFixed(0).padStart(6)}`); }
