/* Iron Canopy: a clip of painted cutscene panels as they move in the viewer (render-cutlife.js), frame by frame, for
   phones and the trailer. Needs Playwright, ffmpeg and the game served over http (WebGL cannot read file:// pictures):
     python devserver.py &
     node tools/cut-life-clip.js out.mp4 v3:C01/c01-1 v3:C04/c04-5 ... [--sec=5] [--fps=30] [--w=1280] [--lean]
   Each panel plays --sec seconds from when it opens (or its own: v3:C01/c01-1@3.5); panels are joined by a 0.6 s
   dissolve. --lean moves the pointer in a slow circle, as a player's mouse would. For a trailer: --clean hides the
   caption, the balloons and the frame's border; --speed=2 runs the panel's clock twice as fast (the camera travels
   further in a short shot); --each=dir saves every panel as dir/<art>.mp4 instead of joining them. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');

const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const out = args[0], shots = args.slice(1).filter(a => !a.startsWith('--'));
const SEC = +(opt('sec') || 5), FPS = +(opt('fps') || 30), W = +(opt('w') || 1280), LEAN = args.includes('--lean');
const URL = opt('url') || 'http://localhost:8766/iron-canopy/index.html', CLEAN = args.includes('--clean');
const SPEED = +(opt('speed') || 1), EACH = opt('each'), XF = EACH ? 0 : 0.6;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cutlife-'));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Math.max(1, W / 1180) });
  pg.on('pageerror', e => console.error('pageerror:', e.message));
  await pg.goto(URL);
  await pg.waitForFunction(() => window.IC && IC.begin && IC.cutView && IC.cutLife, null, { timeout: 120000 });
  await pg.evaluate(async () => { await IC.begin('story'); });
  await pg.waitForFunction(() => IC.S && IC.S.story, null, { timeout: 600000 });
  const parts = [];
  for (const [n, s] of shots.entries()) {
    const [id, rest] = s.split('/'), [art, own] = rest.split('@'), sec = +(own || SEC);
    if (EACH && fs.existsSync(path.join(EACH, art + '.mp4')) && !args.includes('--force')) { console.error('have', art); continue; }
    await pg.evaluate(([id, art, clean]) => {
      if (IC.cutView.isOpen()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      IC.S.story.cutQ = []; IC.cutLife.manual = true;
      IC.cutView.open(IC.S, { id }, true);
      const V = IC.cutView, j = V.panels.findIndex(p => p.art === art);
      if (j >= 0) V.goTo(j); else throw new Error(`${art} is not a panel of ${id}`);
      // the words come in at once in a clip (the clip's frames are slower than the page's own clock)
      document.querySelector('#cutv .frame').classList.add('shown');
      const g = document.querySelector('#cutv .cutghost'); if (g) g.remove();
      if (clean) for (const el of document.querySelectorAll('#cutv .cap, #cutv .says, #cutv .ask')) el.style.display = 'none';
      if (clean) Object.assign(document.querySelector('#cutv .frame').style, { border: '0', outline: '0', borderRadius: '0', boxShadow: 'none' });
    }, [id, art, CLEAN]);
    await pg.waitForFunction(() => IC.cutLife.run && IC.cutLife.run.live, null, { timeout: 60000 }).catch(() => console.error('no WebGL for', s));
    const dir = path.join(tmp, String(n)); fs.mkdirSync(dir);
    const frame = await pg.$('#cutv .frame');
    const N = Math.round((sec + (n < shots.length - 1 ? XF : 0)) * FPS);
    for (let f = 0; f < N; f++) {
      const t = f / FPS * SPEED;
      await pg.evaluate(([ms, lean]) => {
        const P = IC.cutLife.pointer;
        if (lean) { P.tx = Math.sin(ms / 1000 * 0.9) * 0.8; P.ty = Math.cos(ms / 1000 * 0.7) * 0.5; } else P.tx = P.ty = 0;
        IC.cutLife.step(ms);
      }, [t * 1000, LEAN]);
      const file = path.join(dir, String(f).padStart(5, '0') + '.jpg');
      // clean: the picture is only its two canvases, so they are joined in the page (much faster than a screenshot)
      const jpg = CLEAN && await pg.evaluate(() => {
        const r = IC.cutLife.run; if (!r || !r.live) return null;
        const c = document.createElement('canvas'); c.width = r.cv.width; c.height = r.cv.height;
        const g = c.getContext('2d'); g.drawImage(r.cv, 0, 0); g.drawImage(r.pc, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.93).split(',')[1];
      });
      if (jpg) fs.writeFileSync(file, Buffer.from(jpg, 'base64'));
      else await frame.screenshot({ path: file, type: 'jpeg', quality: 92 });
    }
    const mp4 = EACH ? path.join(EACH, art + '.mp4') : path.join(tmp, n + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'), '-vf', `scale=${W}:${Math.round(W * 9 / 32) * 2},setsar=1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4]);
    parts.push(mp4);
    console.error('panel', s, N, 'frames');
  }
  await b.close();
  // join with dissolves
  if (EACH) { console.log('saved', parts.length, 'panels in', EACH); return; }
  if (parts.length === 1) fs.copyFileSync(parts[0], out);
  else {
    const inp = parts.flatMap(p => ['-i', p]); let f = '', last = '[0:v]', acc = SEC;
    for (let i = 1; i < parts.length; i++) { const lab = `[v${i}]`; f += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${acc.toFixed(2)}${lab};`; last = lab; acc += SEC; }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inp, '-filter_complex', f.replace(/;$/, ''), '-map', last, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]);
  }
  console.log('saved', out);
})();
