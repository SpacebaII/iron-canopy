/* B-roll for a trailer (brief 67): short shots of the game itself on the map, each filmed frame by frame on the held
   clock (IC.film.hold / IC.film.tick, tools/film-lib.js) so it plays smoothly however slowly this machine draws.
   Film mode is on (no interface, the film look) unless a shot says otherwise; seed 4242 throughout.
     node tools/broll.js [shot ...] [--out=shots/broll] [--w=1920 --h=1080] [--fps=30] [--sec=k] [--stills]
   Each shot saves <out>/<shot>.mp4 (ffmpeg) and <out>/<shot>.jpg, a still from its middle; --stills makes only the
   stills; --sec scales every shot's length. The 3D shots come from tools/teaser.js (its --stills and --only). Needs
   Playwright and ffmpeg. The list of shots, with what each is for, is in docs/tasks/67-broll.md. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('w', 1920), H = +arg('h', 1080), FPS = +arg('fps', 30), SEC = +arg('sec', 1);
const OUT = path.resolve(ROOT, arg('out', 'shots/broll')), STILLS = process.argv.includes('--stills');
const names = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* the game for a shot: a mode at an hour and weather, the interface hidden, a quarter hour played so the airports
   are busy, the enemy quiet unless the shot sends something */
const GAME = (mode, hour, kind) => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('${mode}'); quiet();
  const S = IC.S; S.paused = true; S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.cfg.bars = false;
  IC.enemyTick = () => {}; S.layers.coverage = false;
  steps(S, 900);
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = '${kind || 'clear'}'; S.weather.fade = 1; S.weather.hold = true; }
  const c = IC.cap(S);
  const A = (S.infra || []).filter(b => b.parts && b.parts.some(p => p.kind === 'runway' && p.built));
  A.sort((a, b) => ((b.kind === 'airport') - (a.kind === 'airport')) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  window.C = { x: c.x, y: c.y }; window.AP = A[0];
  return true;
})()`;
/* a raid from across the border at the capital in the Sandbox, the batteries free to fire, run on until the first
   weapons are some km out */
const RAID = (hour, what, n, km) => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('test'); quiet();
  const S = IC.S; S.paused = true; S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.cfg.bars = false;
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.ad.roe = 'free'; for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
  const c = IC.cap(S); IC.sandboxTarget(S, c);
  IC.sandboxLaunch(S, { what: '${what}', n: ${n}, from: 'border' });
  steps(S, 4000, S2 => S2.threats.some(t => !t.dead && !t.d.civil && Math.hypot(t.x - c.x, t.y - c.y) < ${km * 10}));
  window.C = { x: c.x, y: c.y };
  return S.threats.filter(t => !t.dead && !t.d.civil).length;
})()`;
const run = (speed, film) => `(() => { const S = IC.S; S.paused = false; S.speed = ${speed}; IC.film.set(${film !== false}); })()`;

/* each shot: set, then frame (the camera's shot, after the tiles have painted), sec its length in film seconds */
const SHOTS = {
  // the start screen as the game opens: the title over the capital drifting by
  start: { sec: 8, async set(cam) { await cam.ev(() => { IC.ui.hintsOn = false; }); await cam.free(4000); } },
  // from the whole country down to the capital's airport at noon
  flyin: { sec: 7, async set(cam) {
    await cam.ev(GAME('quick', 12));
    await cam.ev(run(1));
    await cam.ev(() => { const a = window.AP; IC.film.shot({ kind: 'pan', at: { x: a.x + 2500, y: a.y - 1600 }, to: { x: a.x, y: a.y }, z: 0.05, z1: 12, dur: 7, snap: true, keep: true }); });
  } },
  // the capital's airport working at mid-morning, a slow push towards the terminal
  airport: { sec: 7, async set(cam) {
    await cam.ev(GAME('quick', 10));
    await cam.ev(run(2));
    await cam.ev(() => { const a = window.AP; IC.film.shot({ kind: 'push', at: { x: a.x, y: a.y }, z: 6, z1: 14, drift: { x: 3, y: -1.5 }, dur: 7, snap: true, keep: true }); });
  } },
  // airliners taxiing round corners, close in
  taxi: { sec: 6, async set(cam) {
    await cam.ev(GAME('quick', 9.5));
    await cam.ev(run(2));
    await cam.ev(() => { const a = window.AP, m = (a.moves || []).find(q => !q.dead && /taxi/.test(q.phase || '')) || (a.moves || [])[0];
      const at = m ? { x: m.x, y: m.y } : { x: a.x, y: a.y };
      IC.film.shot({ kind: 'hold', at, z: 28, drift: { x: 0.6, y: 0.3 }, dur: 6, snap: true, keep: true }); });
  } },
  // the airport under snow
  snow: { sec: 6, async set(cam) {
    await cam.ev(GAME('quick', 11, 'snow'));
    await cam.ev(run(2));
    await cam.ev(() => { const a = window.AP; IC.film.shot({ kind: 'hold', at: { x: a.x, y: a.y }, z: 9, drift: { x: 2, y: 1 }, dur: 6, snap: true, keep: true }); });
  } },
  // the capital at night from the region, its glow and its runways, pushing in
  night: { sec: 7, async set(cam) {
    await cam.ev(GAME('quick', 23));
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.shot({ kind: 'push', at: C, z: 0.3, z1: 1.4, dur: 7, snap: true, keep: true }); });
  } },
  // a lake at dawn, the sun's glitter on it
  lake: { sec: 6, async set(cam) {
    await cam.ev(GAME('quick', 6.6));
    await cam.ev(run(1));
    await cam.ev(() => { const S = IC.S, L = S.world.lakes.slice().sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
      const at = L ? { x: L.x, y: L.y } : C; IC.film.shot({ kind: 'pan', at: { x: at.x - 40, y: at.y }, to: { x: at.x + 40, y: at.y }, z: 1.4, dur: 6, snap: true, keep: true }); });
  } },
  // a ballistic salvo coming down on the capital at night, the warheads' streaks
  ballistic: { sec: 6, async set(cam) {
    await cam.ev(RAID(22, 'ballistic', 8, 250));
    await cam.ev(() => { IC.film.opt.bars = true; });
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.shot({ kind: 'raid', ref: null, dur: 6, snap: true, keep: true, zMax: 1.2 }); IC.film.caption('Holitz', 'Eight ballistic missiles, four minutes out', 5); });
  } },
  // cruise missiles low over the fields, followed
  cruise: { sec: 6, async set(cam) {
    await cam.ev(RAID(19.4, 'cruise', 12, 120));
    await cam.ev(() => { IC.film.opt.bars = true; });
    await cam.ev(run(1));
    await cam.ev(() => { const S = IC.S, t = S.threats.filter(q => !q.dead && q.d.cls === 'cm').sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
      IC.film.shot({ kind: 'track', ref: t, z: 6, dur: 8, snap: true, keep: true }); });
  } },
  // the defence firing at a big raid at dusk, the director choosing the shots
  defence: { sec: 10, async set(cam) {
    await cam.ev(RAID(19.6, 'big', 40, 90));
    await cam.ev(() => { IC.film.opt.bars = true; });
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.auto = true; });
  } },
  // the morning after a raid: what burns, close in at night
  fires: { sec: 6, async set(cam) {
    await cam.ev(RAID(23, 'big', 40, 30));
    await cam.ev(() => { const S = IC.S; steps(S, 600); const f = (S.fx.fires || []).slice().sort((a, b) => (b.size || 1) - (a.size || 1))[0];
      window.F0 = f ? { x: f.x, y: f.y } : C; });
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.shot({ kind: 'push', at: F0, z: 2.5, z1: 4, dur: 6, snap: true, keep: true }); });
  } }
};

function clip(dir, file) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', file]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names.length ? names : Object.keys(SHOTS)) {
    const sh = SHOTS[name]; if (!sh) { console.log('no shot', name); continue; }
    const dir = path.join(OUT, 'frames-' + name); fs.rmSync(dir, { recursive: true, force: true });
    const cam = await open({ w: W, h: H, frames: dir, fps: FPS });
    const t0 = Date.now();
    try {
      await sh.set(cam);
      await cam.free(1500);                         // the tiles paint on a free clock
      const sec = sh.sec * SEC;
      // (a still is the frame half way through the shot)
      await cam.film(STILLS ? sec / 2 : sec);
      if (!STILLS) clip(dir, path.join(OUT, name + '.mp4'));
      fs.copyFileSync(path.join(dir, String(STILLS ? cam.n - 1 : Math.floor(cam.n / 2)).padStart(6, '0') + '.jpg'), path.join(OUT, name + '.jpg'));
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(name, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (e) { console.log(name, 'failed:', e.message); }
    if (cam.errors.length) console.log(name, 'page errors:\n  ' + cam.errors.slice(0, 5).join('\n  '));
    await cam.close();
  }
})();
