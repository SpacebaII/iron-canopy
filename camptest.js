/* Plays the open campaign with a reasonable (not brilliant) scripted commander, to judge balance. */
const IC = require('./headless.js'); const U = IC.U;
const seed = +(process.argv[2] || 42), hours = +(process.argv[3] || 72), passive = process.argv[4] === 'passive';
const S = IC.newGame({ seed, mode: 'campaign' });
const t0 = S.time;
const fA = S.world.fronts.find(f => f.key === 'A'), fB = S.world.fronts.find(f => f.key === 'B');
const cap = IC.cap(S), ab = S.byId.ab_fwd || cap, abr = S.byId.ab_rear || cap;
const fac = S.infra.filter(i => i.kind === 'factory');
const mid = f => f.pts[Math.floor(f.pts.length / 2)];
const inward = (p, d) => ({ x: p.x + p.nx * d, y: p.y + p.ny * d });
const spots = {
  lrsam: [ab, cap], mrsam: [ab, cap, fac[0]], shorad: [ab, fac[0], cap, abr], spaag: [fac[1] || cap, ab], manpads: [ab, cap, fac[0]],
  gf: [inward(mid(fA), 800), ab, inward(mid(fB), 800)], mr3d: [inward(mid(fA), 1200), inward(mid(fB), 1200)], gnss: [ab, cap], mlrs: [inward(mid(fA), 700)],
  depot: [inward(mid(fA), 1300), inward(mid(fB), 1300)], vhf: [cap], lr3d: [inward(mid(fA), 1600)], cram: [ab], acou: [inward(mid(fA), 300)]
};
const used = {};
function deployAll() {
  for (const [type, n] of Object.entries(S.reserve)) {
    for (let k = 0; k < n; k++) {
      const L = spots[type] || [cap];
      const at = L[(used[type] = (used[type] || 0) + 1) % L.length];
      const q = IC.findSpot(S, type, at.x, at.y, 40, 260);
      if (q) IC.deploy(S, type, q.x, q.y);
    }
  }
}
const log = [];
let did = {};
for (let i = 0; i < hours * 3600 / 0.25 && !S.over; i++) {
  IC.step(S, 0.25);
  if (passive) continue;
  if (i % 400 === 0) {
    deployAll();
    for (const u of S.units) { if (u.d.weapon === 'sam' && u.emcon === 'off') u.emcon = 'ambush'; if ((u.type === 'shorad' || u.type === 'spaag' || u.type === 'gf') && u.emcon !== 'on') u.emcon = 'on'; if (Object.values(u.comp).some(v => v < 0.5) && !u.repairing) IC.repairUnit(S, u); }
    if (S.budget > 350 && S.orders.length < IC.slots(S)) { const pick = U.pick(['shorad', 'mrsam', 'gf', 'spaag', 'manpads', 'mr3d']); IC.order(S, pick); }
    if (S.budget > 250) for (const f of fac) { if (f.queue.length < 2 && !f.offline) IC.orderProduction(S, f, U.pick(['SR', 'MR', 'SR', 'LR', 'IR']), 4); }
    for (const id of ['a_pac3', 's_esm', 'a_remote', 'l_rrr', 's_nctr', 'e_eccm', 'x_glcm', 'a_cram']) IC.startResearch(S, id);
    if (!did.cap) { did.cap = 1; IC.addTask(S, 'cap', { x: cap.x, y: cap.y }); IC.addTask(S, 'aew', { x: inward(mid(fA), 1400).x, y: inward(mid(fA), 1400).y }); }
    if (S.enemy.war && !did.war) { did.war = 1; S.airspace = 'restricted'; IC.setMobil(S, 1); IC.addTask(S, 'cap', { x: ab.x, y: ab.y }); }
    for (const t of S.tels) if (t.known && !t.dead && S.time - t.kt < 300) for (const u of S.units) if (u.d.weapon === 'strike' && u.state === 'ready' && u.mags[0].mag > 0) IC.fireMission(S, u, t, 4);
  }
  if (i % (6 * 3600 * 4) === 0) log.push(`${U.clock(S.time)} will ${S.enemy.will.toFixed(0)} morale ${IC.nationalMorale(S).toFixed(0)} budget ${S.budget.toFixed(0)} units ${S.units.length} kills ${S.stats.kills} leak ${S.stats.leakers} lost ${S.stats.unitsLost}/${S.stats.acLost} plan ${S.enemy.plan ? S.enemy.plan.kind + '/' + S.enemy.plan.phase : '-'}`);
}
console.log(log.join('\n'));
console.log('END', U.clock(S.time), S.over || '', 'stats', JSON.stringify(S.stats));
console.log('method', JSON.stringify(S.enemy.method), 'objW', JSON.stringify(S.enemy.objW));
console.log('history', S.enemy.history.map(h => `${h.kind}:${h.success ? 'OK' : 'fail'}:${h.eff.toFixed(2)}`).join(' '));
console.log('ops', S.enemy.ops.slice(-15).map(o => `${o.type}:${o.launched}/${o.lost}/${o.hits}`).join(' '));
