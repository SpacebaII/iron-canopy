/* The cutscenes as clips (brief 75): each played by the cutscene player in a Career page, filmed frame by frame on
   the held clock (tools/film-lib.js), so the 3D stages and the camera moves are smooth however slowly this machine
   draws, and encoded H.264 / yuv420p with the index first, to play on a phone.
     node tools/cut-clip.js <cutscene id ...> [--out=shots/cut] [--w=1280 --h=720] [--fps=30] [--from=s --sec=s]
       [--stills=t1,t2,...] (PNG stills at those cutscene seconds instead of a clip) [--q3d=low|medium|high]
   Needs Playwright, ffmpeg and three.js on disk (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('w', 1280), H = +arg('h', 720), FPS = +arg('fps', 30), OUT = path.resolve(ROOT, arg('out', 'shots/cut'));
const FROM = arg('from', null), SEC = arg('sec', null), STILLS = arg('stills', null), Q3D = arg('q3d', 'medium');
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* a Career with the ready-made airports, the story's cards answered, nothing over the picture */
const SETUP = (q) => `(async () => {
  IC.seedRandom(71); const real = IC.cutscene; IC.cutscene = () => false;
  if (IC.q3d && IC.q3d.set) try { IC.q3d.set(${JSON.stringify(q)}); } catch (e) {}
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 10 });
  IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  quiet(); S.cfg.pauseOn = { event: false, launch: false };
  for (const e of S.story ? S.story.events.slice() : []) try { IC.storyChoose(S, e.id, 0); } catch (err) {}
  steps(S, 600); S.paused = true; IC.cutscene = real;
  for (const id of ['hints', 'cine', 'evcard', 'unlock', 'comms']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  return true;
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const dir = path.join(OUT, 'frames-' + id); fs.rmSync(dir, { recursive: true, force: true });
    const cam = await open({ w: W, h: H, frames: dir, fps: FPS });
    const t0 = Date.now();
    try {
      await cam.ev(SETUP(Q3D));
      await cam.free(1500);
      const info = await cam.ev(id => { const S = IC.S, TL = IC.cutView.open(S, { id, v: '', t: S.time, d: {} }, true); return { total: TL.total, title: IC.CUTMO.title, shots: TL.shots.map(s => [s.art, +s.t0.toFixed(1), +s.dur.toFixed(1), s.stage ? s.stage.id : '']) }; }, id);
      console.log(id, JSON.stringify(info));
      const total = info.total + info.title + 0.6;
      // the staged scenes build on a free clock (three.js and the ground); then the held clock films
      // let the player run freely until it has drawn the panel at t (and built its 3D stage, if it has one), then hold
      const settle = async t => {
        await cam.ev(t => { IC.cutView.t = t; IC.cutView.playing = false; window.__f = 0; const f0 = IC.cutView.last; window.__l = f0; }, t);
        await cam.free(0);
        await cam.page.waitForFunction(() => IC.cutView.last !== window.__l && (window.__f = (window.__f || 0) + 1) > 1, null, { timeout: 240000, polling: 300 }).catch(() => console.log('  the player did not draw'));
        await cam.page.waitForFunction(() => { const v = IC.replayState && IC.replayState(); return !v || (v.scene && v.camera && !(v.tileQ && v.tileQ.length) && IC.cutView.v3on >= 1); }, null, { timeout: 240000, polling: 500 }).catch(() => console.log('  the stage did not build'));
        await cam.page.waitForTimeout(1500);
        await cam.ev(t => { IC.film.hold(true); IC.cutView.t = t; IC.cutView.playing = true; }, t);
      };
      if (STILLS) {
        for (const s of STILLS.split(',').map(Number)) {
          await settle(s - info.title);
          for (let i = 0; i < 3; i++) await cam.ev(() => IC.film.tick(33));
          await cam.shot(path.join(OUT, `${id}-${String(s).replace('.', '_')}.png`));
          console.log('  still', s);
        }
      } else {
        const from = FROM != null ? +FROM : 0, sec = SEC != null ? +SEC : total - from;
        await settle(from - info.title);
        // before each staged panel the scene is given time to build, off the clip
        let lastStage = null;
        await cam.film(sec, async (i) => {
          const t = from + i / FPS - info.title;
          const sh = info.shots.find(s => t >= s[1] - 0.05 && t < s[1] + s[2]);
          if (sh && sh[3] && sh[3] !== lastStage) { lastStage = sh[3]; await settle(t); }
        });
        const file = path.join(OUT, id + '.mp4');
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '24', '-profile:v', 'main', '-level', '4.0', '-movflags', '+faststart', file]);
        const mid = Math.floor(cam.n / 2);
        fs.copyFileSync(path.join(dir, String(mid).padStart(6, '0') + '.jpg'), path.join(OUT, id + '.jpg'));
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`  ${file}: ${cam.n} frames, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      }
      if (cam.errors.length) console.log('  page errors:', cam.errors.slice(0, 5).join(' | '));
    } catch (e) { console.log(id, 'failed:', e.message, cam.errors.slice(0, 3).join(' | ')); }
    await cam.close();
  }
})();
