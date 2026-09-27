/* Why do threats get through? Runs camptest's commander and inspects every impact. */
const IC = require('./headless.js'); const U = IC.U;
const seed = +(process.argv[2] || 42), hours = +(process.argv[3] || 36);
process.argv[3] = String(hours);
const reasons = {}, byType = {};
IC.on((S, type, d) => {
  if (type !== 'impact' || !d.src || !d.src.d) return;
  const t = d.src;
  byType[t.type] = (byType[t.type] || 0) + 1;
  let r;
  if (!t.tn) r = 'never detected';
  else if (!t.det) r = 'detected then lost';
  else if (t.aff !== 'H') r = 'not identified (' + t.aff + ')';
  else {
    const bats = S.units.filter(u => u.d.weapon === 'sam' && u.state === 'ready' && U.dist(u, t) < IC.maxRange(S, u) * 1.5);
    if (!bats.length) r = 'no battery near target';
    else {
      const empty = bats.every(u => IC.activeMags(S, u).every(m => m.mag + m.store === 0));
      r = empty ? 'batteries empty' : 'batteries near: ' + [...new Set(bats.map(u => u.why.replace(/TN \d+/, 'TN')))].join(' | ');
    }
  }
  reasons[t.type + ': ' + r] = (reasons[t.type + ': ' + r] || 0) + 1;
});
require('./camptest.js');
console.log(JSON.stringify(byType));
console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + '  ' + k).join('\n'));
