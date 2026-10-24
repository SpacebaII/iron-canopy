/* Film mode (brief 58), for looking at: a raid at night on the capital in normal play and in film mode, the same at
   noon, and short clips filmed frame by frame on the held clock.
     node tools/film-shots.js [scene ...] [--out=shots/film]
   Scenes: night (normal and film stills), noon (film still), track (a 10 s clip of the camera on a cruise missile),
   director (a 20 s clip of the director's own cuts). Stills go to <out>/<scene>-*.png, clips to <out>/<scene>.mp4
   (ffmpeg). Needs Playwright (see tools/film-lib.js). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const args = process.argv.slice(2);
const OUT = path.resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=shots/film').slice(6));
const names = args.filter(a => !a.startsWith('--'));

/* the Sandbox at an hour, the batteries free to fire, and a raid from across the border at the capital */
const RAID = (hour, what, n) => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('test'); quiet();
  const S = IC.S; S.paused = true; S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.cfg.bars = false;
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.ad.roe = 'free'; for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
  const c = IC.cap(S); IC.sandboxTarget(S, c);
  IC.sandboxLaunch(S, { what: '${what}', n: ${n}, from: 'border' });
  // run on until the first weapons are some 60 km out
  steps(S, 3000, S2 => S2.threats.some(t => !t.dead && !t.d.civil && Math.hypot(t.x - c.x, t.y - c.y) < 600));
  window.C = c;
  return S.threats.filter(t => !t.dead && !t.d.civil).length;
})()`;

const SCENES = {
  async night(cam) {
    console.log('weapons in the air', await cam.ev(RAID(23, 'big', 30)));
    await cam.ev(() => { const S = IC.S; S.paused = false; S.speed = 1; look(C.x + 200, C.y - 100, 0.32); });
    await cam.free(9000);
    await cam.still(path.join(OUT, 'night-normal.png'));
    await cam.ev(() => IC.film.set(true));
    await cam.free(1500);
    await cam.still(path.join(OUT, 'night-film.png'));
    await cam.ev(() => { const S = IC.S, t = S.threats.find(q => !q.dead && !q.d.civil && q.d.cls === 'cm') || S.threats.find(q => !q.dead && !q.d.civil); look(t.x, t.y, 2.5); });
    await cam.free(1500);
    await cam.still(path.join(OUT, 'night-film-close.png'));
  },
  async noon(cam) {
    await cam.ev(RAID(12, 'big', 30));
    await cam.ev(() => { const S = IC.S; S.paused = false; S.speed = 1; IC.film.set(true); look(C.x + 200, C.y - 100, 0.32); });
    await cam.free(9000);
    await cam.still(path.join(OUT, 'noon-film.png'));
  },
  async track(cam) {
    await cam.ev(RAID(22, 'cruise', 12));
    await cam.ev(() => { const S = IC.S; S.speed = 1; S.paused = false; IC.film.set(true); IC.film.opt.bars = true;
      const t = S.threats.filter(q => !q.dead && q.d.cls === 'cm').sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
      IC.film.shot({ kind: 'track', ref: t, z: 3, dur: 20, snap: true, keep: true }); IC.film.caption('Cruise missile', '30 m over the fields, 60 km from the capital', 6); });
    await cam.free(800);
    await cam.film(10);
    clip(cam, 'track');
  },
  async director(cam) {
    await cam.ev(RAID(23, 'big', 40));
    await cam.ev(() => { const S = IC.S; S.speed = 1; S.paused = false; IC.film.set(true); IC.film.opt.bars = true; IC.film.auto = true; });
    await cam.free(800);
    await cam.film(20);
    clip(cam, 'director');
  }
};
function clip(cam, name) {
  const out = path.join(OUT, name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(cam.fps), '-i', path.join(cam.dir, '%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
  console.log('saved', out);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names.length ? names : Object.keys(SCENES)) {
    const dir = path.join(OUT, 'frames-' + name); fs.rmSync(dir, { recursive: true, force: true });
    const cam = await open({ w: 1600, h: 900, frames: dir });
    const t0 = Date.now();
    try { await SCENES[name](cam); } catch (e) { console.log(name, 'failed:', e.message); }
    console.log(name, `${((Date.now() - t0) / 1000).toFixed(0)} s`, cam.errors.length ? 'page errors:\n  ' + cam.errors.slice(0, 5).join('\n  ') : '');
    await cam.close();
  }
})();
