/* Quick war balance run: a reasonable (not brilliant) scripted commander plays three game days and the run prints
   every raid and, per day, threats, kills, leakers and damage.
   node camptest.js [seed] [days] [passive] */
const IC = require('./headless.js'); const U = IC.U;
const seed = +(process.argv[2] || 42), days = +(process.argv[3] || 3.2), passive = process.argv[4] === 'passive';
const S = IC.newGame({ seed, mode: 'campaign' });
const cap = IC.cap(S), ab = S.byId.ab_fwd || cap, abr = S.byId.ab_rear || cap;
const fac = S.infra.filter(i => i.kind === 'factory');
const fA = S.world.fronts.find(f => f.key === 'A');
const mid = f => f.pts[Math.floor(f.pts.length / 2)];
const inward = (p, d) => ({ x: p.x + p.nx * d, y: p.y + p.ny * d });
const spots = {
  lrsam: [ab, cap], mrsam: [ab, cap, fac[0]], shorad: [ab, fac[0], cap, abr], spaag: [fac[1] || cap, ab], manpads: [ab, cap, fac[0]],
  gf: [inward(mid(fA), 800), ab, cap], mr3d: [inward(mid(fA), 1200), ab], gnss: [ab, cap], mlrs: [inward(mid(fA), 700)],
  depot: [inward(mid(fA), 1300)], vhf: [cap], lr3d: [inward(mid(fA), 1600)], cram: [ab], acou: [inward(mid(fA), 300)], hatd: [ab, cap]
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
const day0 = { kills: 0, leak: 0, fired: 0, blocks: 0, infra: 0, raids: 0 };
const blocksLost = () => IC.cities(S).reduce((s, c) => s + (c.blocks ? c.blocks.filter(b => b.hp <= 0).length : 0), 0);
const infraLost = () => S.infra.filter(i => i.offline && i.kind !== 'city').length;
const snap = () => ({ kills: S.stats.kills, leak: S.stats.leakers, fired: S.stats.fired, blocks: blocksLost(), infra: infraLost(), raids: (S.raids || []).length, threats: (S.raids || []).reduce((s, r) => s + r.threats, 0) });
let prev = snap(), lastDay = U.day(S.time), did = {};
const out = [];
const t0 = Date.now();
for (let i = 0; i < days * 86400 / 0.5 && !S.over; i++) {
  IC.step(S, 0.5);
  if (!passive && i % 200 === 0) {
    deployAll();
    for (const u of S.units) { if (u.d.weapon === 'sam' && u.emcon === 'off') u.emcon = 'ambush'; if ((u.type === 'shorad' || u.type === 'spaag' || u.type === 'gf' || u.type === 'mr3d') && u.emcon !== 'on') u.emcon = 'on'; if (Object.values(u.comp).some(v => v < 0.5) && !u.repairing) IC.repairUnit(S, u); }
    // weapons free while a raid is on, tight in the calm (airliners fly again)
    const ph = IC.raidPhase(S);
    S.ad.roe = ph === 'raid' ? 'free' : 'tight';
    if (S.budget > 350 && S.orders.length < IC.slots(S)) IC.order(S, U.pick(['shorad', 'mrsam', 'gf', 'spaag', 'mr3d']));
    if (S.budget > 250) for (const f of fac) { if (f.queue.length < 2 && !f.offline) IC.orderProduction(S, f, U.pick(['SR', 'MR', 'SR', 'LR', 'IR']), 4); }
    for (const id of ['a_pac3', 's_esm', 'a_remote', 'l_rrr', 's_nctr', 'e_eccm', 'x_glcm', 'a_cram']) IC.startResearch(S, id);
    if (!did.cap) { did.cap = 1; IC.addTask(S, 'cap', { x: cap.x, y: cap.y }); const p = inward(mid(fA), 1400); IC.addTask(S, 'aew', { x: p.x, y: p.y }); }
    if (S.enemy.war && !did.war) { did.war = 1; S.airspace = 'restricted'; IC.setMobil(S, 1); IC.addTask(S, 'cap', { x: ab.x, y: ab.y }); }
    for (const t of S.tels) if (t.known && !t.dead && S.time - t.kt < 300) for (const u of S.units) if (u.d.weapon === 'strike' && u.state === 'ready' && u.mags[0].mag > 0) IC.fireMission(S, u, t, 4);
    if (IC.callIn && S.enemy.war) IC.autoCallIn && IC.autoCallIn(S);
  }
  const d = U.day(S.time);
  if (d !== lastDay) {
    const n = snap();
    out.push(`Day ${lastDay}: raids ${n.raids - prev.raids}, threats ${n.threats - prev.threats}, kills ${n.kills - prev.kills}, leakers ${n.leak - prev.leak}, interceptors ${n.fired - prev.fired}, homes lost ${n.blocks - prev.blocks}, sites knocked out ${n.infra - prev.infra} | PM ${Math.round(S.pm)} working ${U.pct(IC.working(S))} morale ${Math.round(IC.nationalMorale(S))}`);
    prev = n; lastDay = d;
  }
}
console.log(`seed ${seed} · ${passive ? 'passive' : 'scripted'} · ${((Date.now() - t0) / 1000).toFixed(0)} s · ${S.over || 'still going'} ${S.won ? '(won)' : ''}`);
for (const r of S.raids || []) console.log(`  raid ${r.id} day ${r.day} ${r.name.padEnd(20)} on ${r.obj.slice(0, 22).padEnd(22)} threats ${String(r.threats).padStart(3)} kills ${String(r.kills).padStart(3)} leaked ${String(r.leaks).padStart(3)} hits ${String(r.hits).padStart(3)} fired ${r.fired}`);
console.log(out.join('\n'));
console.log('stats', JSON.stringify(S.stats));
