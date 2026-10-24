/* Visual fidelity (brief 67), the combat, film and interface lane: the same views every run, for before and after.
     node tools/fidelity-combat.js [scene ...] [--out=shots/fid] [--root=../other-checkout]
   Scenes: ui (the start screen, the loading line, the top bar and panels, the inspector, a war room, a toast),
   noon and night (a big raid on the capital in normal play and in film mode at the regional, city and close zooms:
   SAM launches, intercepts, impacts, fires and smoke), bal (ballistic re-entry and its intercept, film mode at
   night). Stills go to <out>/<scene>-<view>.png. Needs Playwright (see tools/film-lib.js). */
const path = require('path');
const fs = require('fs');
const { open, ROOT } = require('./film-lib');
const args = process.argv.slice(2);
const OUT = path.resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=shots/fid').slice(6));
const rootArg = args.find(a => a.startsWith('--root='));
const names = args.filter(a => !a.startsWith('--'));

const SETUP = (hour, what, n) => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('test'); quiet();
  const S = IC.S; S.paused = true; S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.cfg.bars = false;
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.ad.roe = 'free'; for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
  const c = IC.cap(S); IC.sandboxTarget(S, c);
  IC.sandboxLaunch(S, { what: '${what}', n: ${n}, from: 'border' });
  steps(S, 3000, S2 => S2.threats.some(t => !t.dead && !t.d.civil && Math.hypot(t.x - c.x, t.y - c.y) < 450));
  window.C = c;
  return S.threats.filter(t => !t.dead && !t.d.civil).length;
})()`;
/* the busiest point of the fight on screen: a battery with missiles of its own in the air, else the nearest weapon */
const BUSY = `(() => { const S = IC.S; const m = S.missiles.find(m => m.unit && !m.dead); if (m) return { x: (m.x + m.unit.x) / 2, y: (m.y + m.unit.y) / 2, u: { x: m.unit.x, y: m.unit.y } };
  const t = S.threats.filter(q => !q.dead && !q.d.civil).sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0]; return t ? { x: t.x, y: t.y, u: { x: t.x, y: t.y } } : { x: C.x, y: C.y, u: C }; })()`;

async function raid(cam, tag, hour) {
  console.log(tag, 'weapons', await cam.ev(SETUP(hour, 'big', 40)));
  const F = s => path.join(OUT, `${tag}-${s}.png`);
  await cam.ev(() => { const S = IC.S; S.paused = false; S.speed = 1; look(C.x + 150, C.y - 100, 0.3); });
  await cam.free(7000);
  await cam.still(F('regional'));
  await cam.ev(`(() => { const b = ${BUSY}; look(b.x, b.y, 2); })()`);
  await cam.free(2500);
  await cam.still(F('city'));
  await cam.ev(`(() => { const b = ${BUSY}; look(b.u.x, b.u.y, 12); })()`);
  await cam.free(2500);
  await cam.still(F('close'));
  // film mode, the same three, after a little more of the fight
  await cam.ev(() => { IC.film.set(true); look(C.x + 150, C.y - 100, 0.3); });
  await cam.free(4000);
  await cam.still(F('film-regional'));
  await cam.ev(`(() => { const b = ${BUSY}; look(b.x, b.y, 2); })()`);
  await cam.free(2500);
  await cam.still(F('film-city'));
  // the fires and smoke where something was hit
  await cam.ev(() => { const S = IC.S, f = S.fx.fires.slice().sort((a, b) => b.size - a.size)[0]; if (f) look(f.x, f.y, 3); });
  await cam.free(2500);
  await cam.still(F('film-fire'));
  await cam.ev(`(() => { const b = ${BUSY}; look(b.u.x, b.u.y, 12); })()`);
  await cam.free(2000);
  await cam.still(F('film-close'));
}

const SCENES = {
  async ui(cam) {
    const F = s => path.join(OUT, `ui-${s}.png`);
    await cam.page.waitForFunction(() => !/Generating|Preparing|%/.test(document.getElementById('startLead').textContent), null, { timeout: 120000 }).catch(() => {});
    await cam.page.waitForTimeout(1500);
    await cam.shot(F('start'));
    await cam.ev(() => { IC.S.seed = 4242; window._b = IC.begin('test'); });
    await cam.page.waitForTimeout(700);
    await cam.shot(F('loading'));
    await cam.ev(() => window._b);
    await cam.ev(() => { IC.S.paused = true; IC.ui.hintsOn = false; });
    await cam.page.waitForTimeout(2500);
    await cam.shot(F('game'));
    await cam.ev(() => { const S = IC.S, u = S.units.find(u => u.d.weapon === 'sam'); IC.select({ kind: 'unit', ref: u }); look(u.x, u.y, 3); IC.toast(S, 'warn', 'PAUSED', 'A ballistic missile is 4 min from the capital.'); });
    await cam.page.waitForTimeout(250);
    await cam.shot(F('inspector-opening'));
    await cam.page.waitForTimeout(1500);
    await cam.shot(F('inspector'));
    await cam.ev(() => IC.ui.openRoom('intel'));
    await cam.page.waitForTimeout(150);
    await cam.shot(F('room-opening'));
    await cam.page.waitForTimeout(1500);
    await cam.shot(F('room'));
  },
  async noon(cam) { await raid(cam, 'noon', 12); },
  async night(cam) { await raid(cam, 'night', 23); },
  async bal(cam) {
    await cam.ev(SETUP(22, 'ballistic', 8));
    await cam.ev(() => { const S = IC.S; S.paused = false; S.speed = 1; IC.film.set(true); });
    // the warheads coming down near the capital
    for (let i = 0; i < 40; i++) {
      const ok = await cam.ev(() => { const S = IC.S; const t = S.threats.find(q => !q.dead && q.d.move === 'bal' && q.T && q.age / q.T > 0.75); if (t) { look(t.x, t.y, 0.9); return true; } return false; });
      if (ok) break; await cam.free(500);
    }
    await cam.free(1200);
    await cam.still(path.join(OUT, 'bal-film.png'));
    await cam.ev(() => IC.film.set(false));
    await cam.free(600);
    await cam.still(path.join(OUT, 'bal-normal.png'));
  }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names.length ? names : Object.keys(SCENES)) {
    const cam = await open({ w: 1600, h: 900, root: rootArg ? path.resolve(rootArg.slice(7)) : undefined });
    const t0 = Date.now();
    try { await SCENES[name](cam); } catch (e) { console.log(name, 'failed:', e.message); }
    console.log(name, `${((Date.now() - t0) / 1000).toFixed(0)} s`, cam.errors.length ? 'page errors:\n  ' + cam.errors.slice(0, 5).join('\n  ') : '');
    await cam.close();
  }
})();
