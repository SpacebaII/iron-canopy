/* Iron Canopy: a clip of painted cutscene panels as they move in the viewer (render-cutlife.js), frame by frame, for
   phones and the trailer. Needs Playwright, ffmpeg and the game served over http (WebGL cannot read file:// pictures):
     python devserver.py &
     node tools/cut-life-clip.js out.mp4 v3:C01/c01-1 v3:C04/c04-5 ... [--sec=5] [--fps=30] [--w=1280] [--lean]
   Each panel plays --sec seconds from when it opens; panels are joined by a 0.6 s dissolve. --lean moves the pointer
   in a slow circle, as a player's mouse would. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');

const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const out = args[0], shots = args.slice(1).filter(a => !a.startsWith('--'));
const SEC = +(opt('sec') || 5), FPS = +(opt('fps') || 30), W = +(opt('w') || 1280), LEAN = args.includes('--lean');
const URL = opt('url') || 'http://localhost:8766/iron-canopy/index.html', XF = 0.6;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cutlife-'));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: Math.round(W * 1.22), height: Math.round(W * 1.22 * 10 / 16) } });
  pg.on('pageerror', e => console.error('pageerror:', e.message));
  await pg.goto(URL);
  await pg.waitForFunction(() => window.IC && IC.begin && IC.cutView && IC.cutLife, null, { timeout: 120000 });
  await pg.evaluate(async () => { await IC.begin('story'); });
  await pg.waitForFunction(() => IC.S && IC.S.story, null, { timeout: 600000 });
  const parts = [];
  for (const [n, s] of shots.entries()) {
    const [id, art] = s.split('/');
    await pg.evaluate(([id, art]) => {
      if (IC.cutView.isOpen()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      IC.S.story.cutQ = []; IC.cutLife.manual = true;
      IC.cutView.open(IC.S, { id }, true);
      const V = IC.cutView, j = V.panels.findIndex(p => p.art === art);
      if (j >= 0) V.goTo(j); else throw new Error(`${art} is not a panel of ${id}`);
      // the words come in at once in a clip (the clip's frames are slower than the page's own clock)
      document.querySelector('#cutv .frame').classList.add('shown');
      const g = document.querySelector('#cutv .cutghost'); if (g) g.remove();
    }, [id, art]);
    await pg.waitForFunction(() => IC.cutLife.run && IC.cutLife.run.live, null, { timeout: 60000 }).catch(() => console.error('no WebGL for', s));
    const dir = path.join(tmp, String(n)); fs.mkdirSync(dir);
    const frame = await pg.$('#cutv .frame');
    const N = Math.round((SEC + (n < shots.length - 1 ? XF : 0)) * FPS);
    for (let f = 0; f < N; f++) {
      const t = f / FPS;
      await pg.evaluate(([ms, lean]) => {
        const P = IC.cutLife.pointer;
        if (lean) { P.tx = Math.sin(ms / 1000 * 0.9) * 0.8; P.ty = Math.cos(ms / 1000 * 0.7) * 0.5; } else P.tx = P.ty = 0;
        IC.cutLife.step(ms);
      }, [t * 1000, LEAN]);
      await frame.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    }
    const mp4 = path.join(tmp, n + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'), '-vf', `scale=${W}:${Math.round(W * 9 / 32) * 2},setsar=1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4]);
    parts.push(mp4);
    console.error('panel', s, N, 'frames');
  }
  await b.close();
  // join with dissolves
  if (parts.length === 1) fs.copyFileSync(parts[0], out);
  else {
    const inp = parts.flatMap(p => ['-i', p]); let f = '', last = '[0:v]', acc = SEC;
    for (let i = 1; i < parts.length; i++) { const lab = `[v${i}]`; f += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${acc.toFixed(2)}${lab};`; last = lab; acc += SEC; }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inp, '-filter_complex', f.replace(/;$/, ''), '-map', last, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]);
  }
  console.log('saved', out);
})();
