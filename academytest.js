/* Plays every Academy lesson with a scripted student, to check each lesson can be completed. */
const IC = require('./headless.js'); const U = IC.U;
const only = process.argv[2];
const near = (S, type, p, a, b) => IC.findSpot(S, type, p.x, p.y, a, b);
/* the strike lesson's MLRS: within reach of the launcher if it is still in sight, otherwise of its site */
function deployMlrs(S) {
  if (S.units.some(u => u.type === 'mlrs' && !u.dead) || !(S.reserve.mlrs > 0)) return;
  const t = S.tels.find(x => x.known && !x.dead), px = t ? t.kx : S.camp.site.x, py = t ? t.ky : S.camp.site.y;
  let spot = null; for (let r = 300; r < 800 && !spot; r += 100) spot = IC.findSpot(S, 'mlrs', px, py, r - 100, r);
  // not in the town itself: that is where the enemy rockets fall
  if (!spot) spot = IC.findSpot(S, 'mlrs', S.camp.town.x, S.camp.town.y, 120, 300);
  if (spot) IC.deploy(S, 'mlrs', spot.x, spot.y);
}
const ACT = {
  radar: [
    S => { const c = IC.cap(S); const q = near(S, 'vhf', c, 150, 400); IC.deploy(S, 'vhf', q.x, q.y); },
    null,
    S => { const t = S.threats.find(x => x.det); if (t) { S.sel = { kind: 'track', ref: t }; IC.emit(S, 'select', S.sel); } },
    S => { if (!S.units.some(u => u.type === 'mr3d')) { const c = IC.cap(S); const q = near(S, 'mr3d', c, 150, 400); IC.deploy(S, 'mr3d', q.x, q.y); } }
  ],
  id: [
    S => { for (const t of S.threats.filter(x => x.det).slice(0, 3)) IC.emit(S, 'select', { kind: 'track', ref: t }); },
    null,
    S => { S.sel = { kind: 'track', ref: S.camp.bomber }; },
    S => { const r = S.roster.find(x => x.kind === 'ftr' && x.st === 'ready'); if (r && !S.air.some(a => a.mission && a.mission.track === S.camp.bomber)) IC.launchAir(S, r, { type: 'intercept', track: S.camp.bomber }); }
  ],
  layers: [
    S => { if (!S.units.some(u => u.type === 'gf')) { const b = S.byId.ab_fwd; const q = near(S, 'gf', b, 60, 140); IC.deploy(S, 'gf', q.x, q.y); } },
    S => { if (!S.units.some(u => u.type === 'shorad')) { const b = S.byId.ab_fwd; const q = near(S, 'shorad', b, 10, 40); IC.deploy(S, 'shorad', q.x, q.y); } },
    S => { S.ad.doctrine = 'sls'; IC.emit(S, 'doctrine', 'sls'); }
  ],
  bmd: [S => { S.sel = { kind: 'unit', ref: S.units.find(u => u.type === 'lrsam') }; }],
  logi: [
    S => { if (!S.units.some(u => u.type === 'depot' && !u.central)) { const q = near(S, 'depot', S.camp.bat, 150, 450); IC.deploy(S, 'depot', q.x, q.y); } },
    S => { const d = S.units.find(u => u.type === 'depot' && !u.central); d.pri = 'first'; },
    S => { const d = S.units.find(u => u.type === 'depot' && !u.central); IC.buyCompany(S, d); },
    S => { IC.heliResupply(S, S.camp.bat, true); }
  ],
  airbase: [
    S => { const r = S.roster.filter(x => x.kind === 'ftr' && x.st === 'ready'); const b = S.threats.find(t => t.type === 'bmr' && t.det); if (b && r[0]) IC.launchAir(S, r[0], { type: 'intercept', track: b }); },
    S => { S.sel = { kind: 'infra', ref: S.byId.ab_fwd }; },
    S => { const b = S.byId.ab_fwd; const f = b.parts.find(x => (x.kind === 'hangar' || x.kind === 'has') && x.hp < x.max); if (f) IC.baseWork(S, b, 'repair', f.id); else if (!b.works.some(w => w.kind === 'build')) IC.baseWork(S, b, 'build', 'hangar'); },
    S => { const r = S.roster.find(x => x.kind === 'atk' && x.st === 'ready'); if (r && !S.air.some(a => a.kind === 'atk')) IC.launchAir(S, r, { type: 'hstrike', g: S.camp.enemy }); },
    S => { IC.orderGround(S, S.camp.ours, 'dig', { manual: true }); },
    S => { if (!S.camp.ours.lift) IC.heliLift(S, S.camp.ours, 'ATG'); }
  ],
  ground: [
    S => IC.emit(S, 'warroom', 'army'),
    S => { S.fronts.find(f => f.key === 'A').stance = 'active'; },
    S => { const g = S.gunits.find(x => x.side === 'us' && x.type === 'inf'); IC.orderGround(S, g, 'defend', { town: S.camp.town }); },
    S => { const g = S.gunits.find(x => x.side === 'us' && x.type === 'arm'); IC.orderGround(S, g, 'reserve', { manual: true }); }
  ],
  strike: [
    S => { const r = S.roster.find(x => x.kind === 'isr' && x.st === 'ready'); const s = S.camp.site; if (r && s) IC.launchAir(S, r, { type: 'isr', x: s.x, y: s.y }); },
    S => deployMlrs(S),
    S => {
      deployMlrs(S);
      // only a fresh sighting is worth a salvo: launchers move soon after they are seen
      const u = S.units.find(x => x.type === 'mlrs' && x.state === 'ready'), t = S.tels.find(x => x.known && !x.dead && S.time - x.kt < 900);
      if (u && t && u.mags[0].mag > 0 && S.time - (u.lastFired || 0) > 300) IC.fireMission(S, u, t, 6);
      // the launcher is out of reach: move the MLRS up behind it
      if (u && t && U.dxy(u.x, u.y, t.kx, t.ky) > IC.MUN[u.mags[0].mun].range * 0.95) {
        let spot = null; for (let r = 300; r < 700 && !spot; r += 100) spot = IC.findSpot(S, 'mlrs', t.kx, t.ky, r - 100, r);
        if (spot) IC.relocate(S, u, spot.x, spot.y);
      }
      // lost sight of it: look again
      const r = S.roster.find(x => x.kind === 'isr' && x.st === 'ready');
      if (!t && r && S.camp.site) IC.launchAir(S, r, { type: 'isr', x: S.camp.site.x, y: S.camp.site.y });
    }
  ]
};
/* plays one lesson; returns { id, won, stars, over, step, hours } */
function playLesson(id, quiet, seed) {
  const S = IC.newGame({ seed: seed || 777, mode: 'academy', lesson: id, hour: 10 });
  const acts = ACT[id] || [];
  const t0 = S.time;
  let lastStep = -1;
  for (let i = 0; i < 12 * 3600 / 0.25 && !S.over; i++) {
    IC.step(S, 0.25);
    if (S.camp.step !== lastStep) { lastStep = S.camp.step; if (!quiet) process.stdout.write(`[${id}] step ${S.camp.step} at +${U.dur(S.time - t0)}\n`); }
    if (i % 40 === 0 && acts[S.camp.step]) { try { acts[S.camp.step](S); } catch (e) { if (!quiet) console.log('act error', e.message); } }
    if (process.env.DBG && i % (3600 * 4) === 0) console.log('   dbg', U.dur(S.time - t0), 'step', S.camp.step, 'roster', S.roster.map(r => r.name + ':' + r.st).join(' '), 'air', S.air.map(a => a.name + ':' + a.state + ':' + (a.mission && a.mission.type)).join(' '), 'wx', S.weather.kind, 'enemy', S.camp.enemy ? Math.round(S.camp.enemy.str) + (S.camp.enemy.dead ? 'dead' : '') : '');
  }
  return { id, won: S.won, stars: S.stars, over: S.over, step: S.camp.step, hours: (S.time - t0) / 3600, S };
}
module.exports = { playLesson };

if (require.main === module) {
  for (const L of IC.LESSONS) {
    if (only && L.id !== only) continue;
    const r = playLesson(L.id);
    console.log(`[${L.id}] ${r.over || 'NOT FINISHED at step ' + r.step} won:${r.won} stars:${r.stars || '-'} after ${U.dur(r.hours * 3600)}`);
  }
}
