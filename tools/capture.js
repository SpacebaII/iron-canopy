/* Clips for looking at the game on a phone: airport life, building, operations and the air war, each filmed frame
   by frame on the held clock (tools/film-lib.js) at 1280 × 720, 30 fps, and encoded H.264 / yuv420p with the index
   first, small enough to stream on a phone.
     node tools/capture.js [clip ...] [--out=shots/capture] [--w=1280 --h=720] [--fps=30] [--sec=k] [--stills]
   Each clip saves <out>/<clip>.mp4 and <out>/<clip>.jpg (a still from its middle). Needs Playwright and ffmpeg. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('w', 1280), H = +arg('h', 720), FPS = +arg('fps', 30), SEC = +arg('sec', 1);
const OUT = path.resolve(ROOT, arg('out', 'shots/capture')), STILLS = process.argv.includes('--stills');
const names = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* a busy Career capital (the ready-made network), the story's cards answered, the interface quiet */
const CAREER = (hour, warm) => `(async () => {
  IC.seedRandom(71); IC.cutscene = () => false; if (IC.cutView) IC.cutView.open = () => {};
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: ${hour} });
  IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1', 'arsenal', 'build']) try { IC.hint.skipTour(k); } catch (e) {}
  IC.ui.cineShown = 1e9; S.weather.hold = true; S.budget = 2e4; S.cfg.pauseOn = { event: false, launch: false }; S.cfg.slowmo = false;
  // (no incidents by chance: a clip that wants one forces it)
  for (const k of ['debris', 'spill', 'scrape', 'excursion', 'wetExc']) IC.OPS[k] = 0;
  window.cards = () => { const S = IC.S; for (const e of S.story ? S.story.events.slice() : []) try { IC.storyChoose(S, e.id, 0); } catch (err) {} if (S.camp) S.camp.cards.length = 0;
    for (const id of ['hints', 'cine', 'evcard', 'unlock', 'comms']) { const e = document.getElementById(id); if (e) e.hidden = true; } };
  window.run = (sec, until) => { const S = IC.S; for (let t = 0; t < sec; t += 0.25) { IC.step(S, 0.25); if (S.story && S.story.events.length) cards(); if (until && until()) return true; } return false; };
  cards(); run(${warm == null ? 3600 : warm}); S.paused = true; quiet();
  window.AP = S.byId[S.story.cap];
  return true;
})()`;
/* a quiet war round the capital with only what the clip puts there (as tools/launch-sheet.js) */
const WAR = (hour, body) => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('sandbox'); quiet();
  const S = IC.S; S.paused = true;
  for (const k of ['a_lrsam', 'a_pac3', 'a_hatd', 's_bmd', 'a_cram', 'x_glcm', 'x_tbm']) S.tech.done.add(k);
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.enemy.war = true; S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  const c = IC.cap(S), at = { x: c.x + 500, y: c.y - 300 };
  const unit = (type, x, y) => { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; };
  const hostile = (type, x, y, o) => IC.spawnThreat(S, type, x, y, Object.assign({ route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y }, target: c, fromHostile: true }, o || {}));
  const A = (S.infra || []).filter(b => b.parts && b.parts.some(p => p.kind === 'runway' && p.built)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  window.AP = A[0]; window.C = { x: c.x, y: c.y };
  ${body}
})()`;
/* run the war until the first round leaves, then put the weapons aside so the tiles paint before the launch is filmed */
const FIRST = `for (let i = 0; i < 4 * 900 && !S.missiles.length && !S.fx.tracers.length; i++) IC.step(S, 0.25);`;
const stash = () => { const S = IC.S; window._keep = { m: S.missiles.splice(0), tr: S.fx.tracers.splice(0), t: S.threats.filter(t => !t.d.civil) }; S.threats = S.threats.filter(t => t.d.civil); };
const unstash = () => { const S = IC.S, K = window._keep; if (!K) return; S.missiles.push(...K.m); S.fx.tracers.push(...K.tr); S.threats.push(...K.t); window._keep = null; };
const go = (speed, film) => `(() => { const S = IC.S; S.paused = false; S.speed = ${speed}; IC.film.set(${!!film}); })()`;

const CLIPS = {
  // the capital's airport working: the whole field at 4×
  'airport-day': { speed: 4, sec: 9, ui: true, async set(cam) {
    await cam.ev(CAREER(10));
    await cam.ev(() => { const a = AP; window.SHOT = ({ kind: 'push', at: { x: a.x, y: a.y }, z: 14, z1: 18, dur: 9, snap: true, keep: true }); });
  } },
  // gates close in: turnarounds, jet bridges, service vehicles
  'airport-gates': { speed: 2, sec: 9, ui: true, async set(cam) {
    await cam.ev(CAREER(9, 5400));
    await cam.ev(() => { const a = AP, t = a.parts.find(p => p.kind === 'terminal' && p.built) || a; window.SHOT = ({ kind: 'hold', at: { x: t.x, y: t.y }, z: 48, drift: { x: 1.5, y: 0.5 }, dur: 9, snap: true, keep: true }); });
  } },
  // an airliner lining up and taking off, followed
  'airport-takeoff': { speed: 1, sec: 9, ui: true, async set(cam) {
    await cam.ev(CAREER(11));
    await cam.ev(() => { const a = AP; run(1800, () => (a.moves || []).some(m => !m.dead && m.phase === 'lineup')); window.M = (a.moves || []).find(m => !m.dead && m.phase === 'lineup'); return !!M; });
    await cam.ev(() => { const m = M || AP; window.SHOT = ({ kind: M ? 'track' : 'hold', ref: M, at: { x: m.x, y: m.y }, z: 20, lead: 0.25, dur: 9, snap: true, keep: true }); });
  } },
  // a cargo terminal built from survey pegs to opening, at 8×
  'build-site': { speed: 16, sec: 11, ui: true, async set(cam) {
    await cam.ev(CAREER(10, 600));
    await cam.ev(() => { const S = IC.S, ap = AP, rw = ap.parts.find(p => p.kind === 'runway' && p.built), c = IC.rwAt(rw, 0.7), d = IC.rwDir(rw);
      const p = IC.aptPlanPart(S, ap, 'cargo', c.x - d.y * 4.4, c.y + d.x * 4.4, Math.atan2(d.y, d.x), 2, 1, {});
      window.SITE = p ? { x: p.x, y: p.y } : c; IC.select(null); IC.ui.refresh(true); });
    await cam.ev(() => { window.SHOT = ({ kind: 'hold', at: SITE, z: 60, drift: { x: 0.6, y: 0.2 }, dur: 11, snap: true, keep: true }); });
  } },
  // debris on the runway: the crew's report, the runway closed and swept
  'ops-debris': { speed: 4, sec: 10, ui: true, async set(cam) {
    await cam.ev(CAREER(10, 1800));
    await cam.ev(() => { const S = IC.S, ap = AP; IC.OPS.force = 'debris'; const inc = () => (ap.incs && ap.incs.list || []).find(x => x.kind === 'debris' && !x.done);
      run(3600, inc); const i = inc(); window.INC = i ? { x: i.x, y: i.y } : ap; if (i) IC.opsDecide(S, ap, i.id, 'close'); IC.select(null); IC.ui.refresh(true); });
    await cam.ev(() => { window.SHOT = ({ kind: 'push', at: INC, z: 20, z1: 40, dur: 10, snap: true, keep: true }); });
  } },
  // a runway excursion: fire trucks race out, foam, the aircraft recovered
  'ops-excursion': { speed: 2, sec: 10, ui: true, async set(cam) {
    await cam.ev(CAREER(11, 1800));
    await cam.ev(() => { const S = IC.S, ap = AP; IC.OPS.force = 'excursion'; const inc = () => (ap.incs && ap.incs.list || []).find(x => x.kind === 'excursion' && !x.done);
      run(5400, inc); const i = inc(); window.INC = i ? { x: i.x, y: i.y } : ap; IC.select(null); IC.ui.refresh(true); });
    await cam.ev(() => { window.SHOT = ({ kind: 'push', at: INC, z: 30, z1: 60, dur: 10, snap: true, keep: true }); });
  } },
  // a long-range battery firing, close in
  'launch-long-range': { sec: 7, film: true, stash: true, async set(cam) {
    await cam.ev(WAR(14, `const u = unit('lrsam', at.x, at.y); unit('lr3d', at.x - 30, at.y + 20);
      for (let i = 0; i < 2; i++) hostile('ftr', at.x + 900 + i * 20, at.y - 450, {}); ${FIRST} window.U0 = { x: u.x, y: u.y };`));
    await cam.ev(() => { window.SHOT = ({ kind: 'push', at: U0, z: 7, z1: 3, dur: 7, snap: true, keep: true }); });
  } },
  // a medium-range battery against drones: launch, then the director follows to the intercepts
  'intercept-medium-range': { sec: 12, film: true, stash: true, auto: true, async set(cam) {
    await cam.ev(WAR(15, `const u = unit('mrsam', at.x, at.y); unit('mr3d', at.x - 30, at.y + 20);
      for (let i = 0; i < 3; i++) hostile('jdr', at.x + 300 + i * 25, at.y - 150 + i * 15, {}); ${FIRST} window.U0 = { x: u.x, y: u.y };`));
    await cam.ev(() => { window.SHOT = ({ kind: 'push', at: U0, z: 4, z1: 2.5, dur: 3, snap: true }); });
  } },
  // a ballistic missile met by a terminal defence battery
  'intercept-ballistic': { sec: 12, film: true, stash: true, auto: true, async set(cam) {
    await cam.ev(WAR(13, `const u = unit('hatd', at.x, at.y); unit('lr3d', at.x - 30, at.y + 20);
      IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900, { x: at.x, y: at.y }); IC.launchBallistic(S, 'srbm', c.x + 2700, c.y - 1800, { x: at.x + 10, y: at.y });
      ${FIRST} window.U0 = { x: u.x, y: u.y };`));
    await cam.ev(() => { window.SHOT = ({ kind: 'push', at: U0, z: 3, z1: 1.5, dur: 3, snap: true }); });
  } },
  // guns against a drone swarm
  'guns-drones': { sec: 8, film: true, stash: true, async set(cam) {
    await cam.ev(WAR(16, `const u = unit('cram', at.x, at.y); unit('spaag', at.x + 15, at.y + 10); unit('mr3d', at.x - 30, at.y + 20);
      for (let i = 0; i < 6; i++) hostile('owa', at.x + 60 + i * 8, at.y - 30 + i * 6, { route: [{ x: at.x, y: at.y }], aim: { x: at.x, y: at.y } });
      ${FIRST} window.U0 = { x: u.x + 25, y: u.y - 12 };`));
    await cam.ev(() => { window.SHOT = ({ kind: 'hold', at: U0, z: 9, drift: { x: 2, y: -1 }, dur: 8, snap: true, keep: true }); });
  } },
  // ballistic missiles falling on an undefended airport, and what they do
  'impact-airport': { sec: 10, film: true, async set(cam) {
    await cam.ev(WAR(17, `const a = AP; for (let i = 0; i < 5; i++) IC.launchBallistic(S, 'srbm', c.x + 600 + i * 30, c.y - 400 - i * 20, { x: a.x + (i - 2) * 6, y: a.y + (i % 2 ? 3 : -3) });
      for (let i = 0; i < 4 * 600; i++) { IC.step(S, 0.25); if (S.threats.some(t => !t.dead && !t.d.civil && IC.timeToImpact(t) < 9)) break; }`));
    await cam.ev(() => { const a = AP; window.SHOT = ({ kind: 'push', at: { x: a.x, y: a.y }, z: 6, z1: 9, dur: 10, snap: true, keep: true }); });
  } },
  // a cruise missile low over the fields to its target, followed to the end
  'impact-cruise': { sec: 9, film: true, async set(cam) {
    await cam.ev(WAR(18.6, `const a = AP; const t = IC.spawnThreat(S, 'lacm', a.x + 250, a.y - 160, { route: [{ x: a.x, y: a.y }], aim: { x: a.x, y: a.y }, target: a, fromHostile: true }); t.det = true; window.T = t;
      for (let i = 0; i < 4 * 600; i++) { IC.step(S, 0.25); if (t.dead || IC.timeToImpact(t) < 10) break; }`));
    await cam.ev(() => { window.SHOT = ({ kind: 'track', ref: T, z: 5, lead: 0.2, dur: 9, snap: true, keep: true }); });
  } }
};

function clip(dir, file) {
  // H.264 main profile, yuv420p, the index first: plays and streams on an iPhone; crf 24 keeps 10 s near 5 MB
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '24', '-profile:v', 'main', '-level', '4.0', '-movflags', '+faststart', file]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names.length ? names : Object.keys(CLIPS)) {
    const sh = CLIPS[name]; if (!sh) { console.log('no clip', name); continue; }
    const dir = path.join(OUT, 'frames-' + name); fs.rmSync(dir, { recursive: true, force: true });
    const cam = await open({ w: W, h: H, frames: dir, fps: FPS });
    const t0 = Date.now();
    try {
      await sh.set(cam);
      if (sh.stash) await cam.ev(stash);
      await cam.ev(f => { IC.S.paused = true; IC.film.set(f); const s = window.SHOT; if (s) { const p = s.ref || s.at; look(p.x, p.y, s.z); } }, !!sh.film);
      await cam.free(2500);                         // the tiles paint on a free clock
      await cam.ev(() => { IC.film.hold(true); });
      if (sh.stash) await cam.ev(unstash);
      await cam.ev(go(sh.speed || 1, sh.film));
      await cam.ev(() => { if (window.SHOT) IC.film.shot(window.SHOT); });
      const sec = sh.sec * SEC, n = Math.round((STILLS ? sec / 2 : sec) * FPS);
      await cam.film(n / FPS, async i => {
        // (an arrival or a card can put the clock back to 1× or pause it: the clip's speed holds)
        if (sh.ui && i % 15 === 0) await cam.ev(sp => { if (window.cards) cards(); IC.S.paused = false; IC.S.speed = sp; if (IC.ui.refresh) IC.ui.refresh(true); }, sh.speed || 1);
        // (film mode drives the camera by itself; with the interface on, the shot is driven here, eased for a track)
        if (!sh.film) await cam.ev(([i, fps]) => { const sh = window.SHOT; if (!sh) return; const c = IC.cam; sh.t0 = 0;
          if (IC.followStop) IC.followStop(IC.S); const w = IC.filmWant(IC.S, sh, i / fps, c.vw, c.vh); if (!w) return;
          if (sh.kind === 'track' && i > 0) { const k = 1 - Math.exp(-2.2 / fps), cx = c.x + c.vw / c.z / 2, cy = c.y + c.vh / c.z / 2; IC.centerOn(cx + (w.x - cx) * k, cy + (w.y - cy) * k); }
          else { c.fly = null; c.z = w.z; IC.centerOn(w.x, w.y); } }, [i, FPS]);
        if (sh.auto && i === Math.round(2.5 * FPS)) await cam.ev(() => { IC.film.auto = true; });
      });
      if (!STILLS) clip(dir, path.join(OUT, name + '.mp4'));
      fs.copyFileSync(path.join(dir, String(STILLS ? cam.n - 1 : Math.floor(cam.n / 2)).padStart(6, '0') + '.jpg'), path.join(OUT, name + '.jpg'));
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(name, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (e) { console.log(name, 'failed:', e.message.split('\n').slice(0, 4).join(' | ')); }
    if (cam.errors.length) console.log(name, 'page errors:\n  ' + cam.errors.slice(0, 5).join('\n  '));
    await cam.close();
  }
})();
