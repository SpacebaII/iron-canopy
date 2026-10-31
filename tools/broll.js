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
/* (the launch trailer) the capital's airport relaid as the real Denver, with airlines on four in five of its stands
   (IC.freeTraffic) and six hours played so they come and go; at an hour; AP the airport, GATE an occupied stand near
   where the aircraft taxi */
const KDEN = (hour) => `(async () => {
  Math.random = seeded(7); IC.seedRandom(4242);
  const S = IC.newGame({ seed: 4242, mode: 'story', preset: 'network', hour: 9 });
  IC.adopt(S); quiet();
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  const ap = S.byId[S.story.cap];
  for (const t of S.av.tails) if (t.at === ap.id && t.where === 'stand') { t.where = 'away'; t.at = null; t.stand = null; t.t = IC.U.rand(300, 1800); }
  IC.aptRelayout(S, ap, 'kden', 0);
  IC.setWind(S, { dir: -Math.PI / 2, kt: 10, hold: true });
  IC.freeTraffic(S, ap);
  for (let h = 0; h < 6; h++) { steps(S, 1800); IC.freeTraffic(S, ap); steps(S, 1800); }
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.follow = null; IC.ui.watch = false; S.sel = null; steps(S, 120);
  const st = IC.aptStands(ap).filter(s => s.occ);
  const taxi = ap.moves.filter(m => m.phase === 'taxi' || m.phase === 'push' || m.phase === 'start');
  const mx = taxi.reduce((s, m) => s + m.x, 0) / Math.max(1, taxi.length), my = taxi.reduce((s, m) => s + m.y, 0) / Math.max(1, taxi.length);
  let gate = null; for (const s of st) if (!gate || IC.U.dxy(s.x, s.y, mx, my) < IC.U.dxy(gate.x, gate.y, mx, my)) gate = s;
  window.AP = ap; window.GATE = gate || ap; window.C = IC.cap(S);
  return ap.moves.length;
})()`;
const run = (speed, film) => `(() => { const S = IC.S; S.paused = false; S.speed = ${speed}; IC.film.set(${film !== false}); })()`;

/* each shot: set, then frame (the camera's shot, after the tiles have painted), sec its length in film seconds */
const SHOTS = {
  // (the launch trailer, fresh) the real Denver close in in the late afternoon, airliners taxiing, a slow drift
  'apt-close': { sec: 6, async set(cam) {
    await cam.ev(KDEN(17.4));
    await cam.ev(run(2));
    await cam.ev(() => { const a = window.AP, g = window.GATE;
      const m = a.moves.filter(q => !q.dead && q.kind === 'dep' && (q.phase === 'hold' || q.phase === 'lineup' || q.holding === 'runway'))[0];
      const at = m ? { x: (g.x + m.x) / 2, y: (g.y + m.y) / 2 } : { x: g.x, y: g.y };
      IC.film.shot({ kind: 'push', at, z: 38, z1: 52, drift: { x: 8, y: -3 }, dur: 6, snap: true, keep: true }); });
  } },
  // very close on a busy apron at mid-morning: jet bridges, tugs, lorries round the airliners
  'apt-gate': { sec: 6, async set(cam) {
    await cam.ev(KDEN(10.4));
    await cam.ev(run(1));
    await cam.ev(() => { const S = IC.S, a = window.AP, st = IC.aptStands(a).filter(s => s.occ && s.svc);
      const g = st.sort((p, q) => IC.U.dxy(p.x, p.y, GATE.x, GATE.y) - IC.U.dxy(q.x, q.y, GATE.x, GATE.y))[0] || GATE;
      IC.film.shot({ kind: 'push', at: { x: g.x, y: g.y }, z: 120, z1: 150, drift: { x: 0.8, y: 0.3 }, dur: 6, snap: true, keep: true }); });
  } },
  // the capital at night close in: lit windows, streetlights and traffic, a slow push
  'city-night': { sec: 6, async set(cam) {
    await cam.ev(GAME('quick', 22.4));
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.shot({ kind: 'push', at: C, z: 5, z1: 8, drift: { x: 20, y: 8 }, dur: 6, snap: true, keep: true }); });
  } },
  // a big raid on the capital at dusk, framed close enough that the arcs and blasts read
  'raid-capital': { sec: 7, async set(cam) {
    await cam.ev(RAID(20.1, 'big', 40, 22));
    await cam.ev(run(1));
    await cam.ev(() => { IC.film.shot({ kind: 'push', at: C, z: 0.9, z1: 1.5, dur: 7, snap: true, keep: true }); });
  } },
  // one intercept close in at night: a missile meeting a cruise missile, the flash, at a quarter speed
  'intercept-close': { sec: 6, async set(cam) {
    await cam.ev(RAID(21.5, 'cruise', 8, 60));
    await cam.ev(() => { const S = IC.S;
      const m = steps(S, 1200, S2 => S2.missiles.find(q => q.target && !q.target.dead && q.target.d && !q.target.d.civil && Math.hypot(q.target.x - q.x, q.target.y - q.y) < 60));
      window.M = m; window.T = m && m.target; return !!m; });
    await cam.ev(run(0.25));
    await cam.ev(() => { IC.film.shot(window.M ? { kind: 'pair', ref: window.T, ref2: window.M, dur: 6, snap: true, keep: true, zMax: 6, pad: 120 } : { kind: 'hold', at: C, z: 2, dur: 6, snap: true, keep: true }); });
  } },
  // from the capital's airport out to the whole country at dusk
  'country-pull': { sec: 7, async set(cam) {
    await cam.ev(GAME('quick', 19.4));
    await cam.ev(run(1));
    await cam.ev(() => { const a = window.AP, W = IC.S.world; IC.film.shot({ kind: 'pan', at: { x: a.x, y: a.y }, to: { x: W.cx || W.w / 2, y: W.cy || W.h / 2 }, z: 14, z1: IC.minZoom(), dur: 7, snap: true, keep: true }); });
  } },

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
  // (high profile at level 4.2 with the index first: plays on phones as well as in an editor)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-profile:v', 'high', '-level', '4.2', '-movflags', '+faststart', file]);
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
