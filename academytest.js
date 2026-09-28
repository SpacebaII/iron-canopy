/* Plays every Academy lesson with a scripted student, to check each lesson can be completed. */
const IC = require('./headless.js'); const U = IC.U;
const only = process.argv[2];
const near = (S, type, p, a, b) => IC.findSpot(S, type, p.x, p.y, a, b);
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
  bmd: [
    S => { S.sel = { kind: 'unit', ref: S.units.find(u => u.type === 'lrsam') }; },
    S => { if (!S.units.some(u => u.type === 'hatd')) { const q = near(S, 'hatd', S.byId.ab_fwd, 80, 250); if (q) IC.deploy(S, 'hatd', q.x, q.y); } }
  ],
  ew: [
    S => { S.sel = { kind: 'unit', ref: S.camp.rad }; },
    // a second radar well to the side of the jammer's bearing from the first
    S => { if (S.units.some(u => u.type === 'mr3d')) return; const r = S.camp.rad, a = Math.atan2(S.camp.jst.y - r.y, S.camp.jst.x - r.x) + Math.PI / 2; for (const s of [1, -1]) for (const d of [600, 800, 1000]) { const q = near(S, 'mr3d', { x: r.x + Math.cos(a) * s * d, y: r.y + Math.sin(a) * s * d }, 0, 120); if (q) { IC.deploy(S, 'mr3d', q.x, q.y); return; } } },
    S => { S.camp.bat.roe = 'free'; }
  ],
  logi: [
    S => { if (!S.units.some(u => u.type === 'depot' && !u.central)) { const q = near(S, 'depot', S.camp.bat, 150, 450); IC.deploy(S, 'depot', q.x, q.y); } },
    S => { const d = S.units.find(u => u.type === 'depot' && !u.central); d.pri = 'first'; },
    S => { const d = S.units.find(u => u.type === 'depot' && !u.central); IC.buyCompany(S, d); },
    S => { IC.heliResupply(S, S.camp.bat, true); }
  ],
  airbase: [
    S => { if (!S.units.some(u => u.callin) && !IC.callInState(S).inbound.length) { const b = S.byId.ab_fwd; IC.callIn(S, b.x + 30, b.y + 20); } },
    null,
    // the bomber's row in the air picture, then the quickest fighter on it
    S => { const row = IC.airPicture(S).find(r => r.t.type === 'bmr'); if (row) S.sel = { kind: 'track', ref: row.t }; },
    S => { const t = S.sel && S.sel.ref; if (t && t.type === 'bmr' && !t.dead) { const w = IC.bestInterceptor(S, t); if (w) IC.commitIntercept(S, w, t); } },
    null,
    S => { S.sel = { kind: 'infra', ref: S.byId.ab_fwd }; },
    S => { const b = S.byId.ab_fwd; const f = b.parts.find(x => (x.kind === 'hangar' || x.kind === 'has') && x.hp < x.max); if (f) IC.baseWork(S, b, 'repair', f.id); else if (!b.works.some(w => w.kind === 'build')) IC.baseWork(S, b, 'build', 'hangar'); }
  ],
  strike: [
    S => { const r = S.roster.find(x => x.kind === 'isr' && x.st === 'ready'); const s = S.camp.site; if (r && s) IC.launchAir(S, r, { type: 'isr', x: s.x, y: s.y }); },
    S => {
      // only a fresh sighting is worth a strike: launchers move soon after they are seen
      const t = S.tels.find(x => x.known && !x.dead && S.time - x.kt < 600);
      if (t && !S.air.some(a => a.mission && a.mission.type === 'strike' && a.state !== 'rtb')) {
        const r = S.roster.find(x => (x.kind === 'ucav' || (x.kind === 'ftr' && x.load === 'strike')) && x.st === 'ready' && !IC.missionOk(S, x, 'strike'));
        if (r) IC.launchAir(S, r, { type: 'strike', site: t });
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
    if (process.env.DBG && i % (3600 * 4) === 0) console.log('   dbg', U.dur(S.time - t0), 'step', S.camp.step, 'roster', S.roster.map(r => r.name + ':' + r.st).join(' '), 'air', S.air.map(a => a.name + ':' + a.state + ':' + (a.mission && a.mission.type)).join(' '), 'wx', S.weather.kind);
  }
  return { id, won: S.won, stars: S.stars, over: S.over, step: S.camp.step, hours: (S.time - t0) / 3600, S };
}
module.exports = { playLesson };

if (require.main === module && process.argv.includes('--many')) {
  // every lesson many times on the two seeds that matter: the one the game uses and the test suite's
  const n = +process.argv[process.argv.indexOf('--many') + 1] || 10, seeds = [20260926, 777];
  for (const L of IC.LESSONS) {
    if (only && only !== '--many' && L.id !== only) continue;
    const res = [];
    for (const seed of seeds) for (let k = 0; k < n; k++) { const r = playLesson(L.id, true, seed); res.push(r.won ? r.stars : 'X' + r.step); }
    const won = res.filter(x => typeof x === 'number').length;
    console.log(`[${L.id}] ${won}/${res.length} completed · ${res.join(' ')}`);
  }
} else if (require.main === module) {
  for (const L of IC.LESSONS) {
    if (only && L.id !== only) continue;
    const r = playLesson(L.id);
    console.log(`[${L.id}] ${r.over || 'NOT FINISHED at step ' + r.step} won:${r.won} stars:${r.stars || '-'} after ${U.dur(r.hours * 3600)}`);
  }
}
