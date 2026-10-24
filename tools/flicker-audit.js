/* The 3D view's flicker audit: the live view over the capital's airport, the scene paused, the camera turned a
   little each frame from several places (on the ground, at the gate, over the field, high up, at the horizon) and
   at each picture quality. A pixel whose brightness jumps and jumps straight back while the camera moves smoothly
   is flicker: two surfaces fighting for depth, a texture shimmering, a shadow swimming, noise from frame to frame.
   Each case prints the share of such pixels and saves a picture with them in red (shots/<out>/flicker-*.png), so
   the cause can be found by where it is. A still pass (the camera not moving) catches noise that moves by itself.
   Needs Playwright and three.js on disk:
     npm i --no-save playwright three@0.160.0
   Usage: node tools/flicker-audit.js [--q low,high] [--cams ground,gate,field,high,horizon] [--out dir] [--root=dir]
     [--hook "<script>"]: runs in the page before each case with the view as L (hide something to see if it was it) */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); if (a) return a.split('=')[1]; const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const QS = arg('q', 'low,medium,high').split(','), CAMS = arg('cams', 'ground,gate,field,high,horizon,still').split(',');
const ROOT = path.resolve(arg('root', path.join(__dirname, '..'))), OUT = path.resolve(__dirname, '../shots', arg('out', 'flicker'));
const W = 640, H = 400, HOOK = arg('hook', '');

// camera setups round what the view follows: pitch (rad), distance (world units, 100 m), turn a frame (rad)
const SETUP = {
  ground: { pitch: 0.04, dist: 4, turn: 0.003 },     // eye height over the apron, looking along the pavement
  gate: { pitch: 0.22, dist: 1.6, turn: 0.004 },
  field: { pitch: 0.3, dist: 30, turn: 0.002 },      // the whole airfield from 1 km up
  high: { pitch: 0.7, dist: 160, turn: 0.0015 },      // 11 km up: the coarse ground rings
  horizon: { pitch: 0.08, dist: 60, turn: 0.002 },   // low and far: everything at a grazing angle
  still: { pitch: 0.3, dist: 12, turn: 0 }            // nothing moves: anything that changes moves by itself
};

const PAGE = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
window.__audit = async (q, setups, W, H, hook) => {
  IC.S.seed = 4242; Math.random = seeded(7);
  try { localStorage.setItem('ic-3d', q); } catch (e) {}
  await IC.begin('sandbox');
  const S = IC.S; S.paused = true;
  IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  S.time = Math.floor(S.time / 86400) * 86400 + 11 * 3600; S.cfg.slowmo = false; S.cfg.pauseOn = {};
  let m = null;
  for (let i = 0; i < 1800 * 4 && !m; i++) { IC.step(S, 0.25); for (const b of IC.bases(S)) for (const x of b.moves || []) if (!m && !x.dead && x.phase === 'taxi' && x.kind === 'dep' && x.type !== 'light') m = x; }
  if (!m) throw new Error('nothing taxiing');
  for (let i = 0; i < 24; i++) IC.step(S, 0.25);
  S.paused = false; S.speed = 1;
  const L = IC.liveOpen(S, m);
  for (let i = 0; i < 300 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
  L.el.querySelector('[data-rp=full]').click();
  await wait(3000); S.paused = true; await wait(800);
  const sel = L.el.querySelector('[data-rp=cam]'); sel.value = 'orbit'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  L.labels = false; for (const x of L.movers) x.label.hidden = true; const pn = L.$('panel'); if (pn) pn.style.display = 'none';
  window.requestAnimationFrame = () => 0;   // the frames are made here, one by one
  let now = performance.now();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  const out = [];
  for (const [name, o] of setups) {
    Object.assign(L.orbit, { yaw: -0.8, pitch: o.pitch, dist: o.dist });
    // settle: the ground rings for this height, painted (the finest only from low down)
    for (let i = 0; i < 40; i++) { IC.replayStep(L, now += 33); await wait(30); }
    for (let i = 0; i < 400 && (L.tileQ.length || L.job); i++) { IC.replayStep(L, now += 33); await wait(40); }
    for (let i = 0; i < 20; i++) IC.replayStep(L, now += 33);
    if (hook) new Function('L', 'IC', hook)(L, IC);
    const N = 28, frames = [];
    for (let f = 0; f < N; f++) {
      L.orbit.yaw += o.turn; IC.replayStep(L, now += 33);
      g.drawImage(L.renderer.domElement, 0, 0, W, H); frames.push(g.getImageData(0, 0, W, H).data.slice());
    }
    const lum = (k, i) => frames[k][i] * 0.3 + frames[k][i + 1] * 0.59 + frames[k][i + 2] * 0.11;
    const hits = new Uint8Array(W * H); let osc = 0, n = 0, moved = 0;
    for (let f = 1; f < N - 1; f++) for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      const a = lum(f, i) - lum(f - 1, i), b = lum(f + 1, i) - lum(f, i); n++;
      if (Math.abs(a) > 3) moved++;
      if (Math.abs(a) > 24 && Math.abs(b) > 24 && Math.sign(a) !== Math.sign(b)) { osc++; if (hits[p] < 255) hits[p]++; }
    }
    // the last frame, dimmed, with every pixel that flickered twice or more in red
    const img = g.createImageData(W, H), last = frames[N - 1]; let px = 0;
    for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      if (hits[p] >= 2) { px++; img.data[i] = 255; img.data[i + 1] = 30; img.data[i + 2] = 30; }
      else { img.data[i] = last[i] * 0.55; img.data[i + 1] = last[i + 1] * 0.55; img.data[i + 2] = last[i + 2] * 0.55; }
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const heat = cv.toDataURL('image/png');
    g.drawImage(L.renderer.domElement, 0, 0, W, H); const shot = cv.toDataURL('image/jpeg', 0.9);
    const pair = [];
    if (window.__frames) for (const k of [N - 3, N - 2]) { const im = g.createImageData(W, H); im.data.set(frames[k]); g.putImageData(im, 0, 0); pair.push(cv.toDataURL('image/png')); }
    out.push({ pair, name, flickerPct: +(osc / n * 100).toFixed(4), pixels2x: +(px / (W * H) * 100).toFixed(3), movedPct: +(moved / n * 100).toFixed(1), heat, shot });
  }
  return { q, fx: !!(IC.fx3d && IC.fx3d.ok), out };
};`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  const rows = [];
  for (const q of QS) {
    const ctx = await browser.newContext({ viewport: { width: W + 40, height: H + 140 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 400)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.goto('file://' + path.join(ROOT, 'iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
    await page.evaluate(PAGE);
    if (process.env.FRAMES) await page.evaluate(() => { window.__frames = true; });   // also save two frames in a row
    let res;
    try { res = await page.evaluate(([q, s, w, h, k]) => window.__audit(q, s, w, h, k), [q, CAMS.map(c => [c, SETUP[c]]), W, H, HOOK]); }
    catch (e) { console.log(q, 'failed:', e.message.split('\n')[0]); await ctx.close(); continue; }
    for (const r of res.out) {
      fs.writeFileSync(path.join(OUT, `flicker-${q}-${r.name}.png`), Buffer.from(r.heat.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(OUT, `view-${q}-${r.name}.jpg`), Buffer.from(r.shot.split(',')[1], 'base64'));
      r.pair.forEach((d, k) => fs.writeFileSync(path.join(OUT, `frame-${q}-${r.name}-${k}.png`), Buffer.from(d.split(',')[1], 'base64')));
      rows.push({ q, cam: r.name, flicker: r.flickerPct, px2: r.pixels2x, moved: r.movedPct });
      console.log(`${q.padEnd(7)} ${r.name.padEnd(8)} flicker ${String(r.flickerPct).padStart(7)}%   pixels flickering twice+ ${String(r.pixels2x).padStart(6)}%   moving ${r.movedPct}%`);
    }
    if (errors.length) console.log(q, 'page errors:\n  ' + errors.join('\n  '));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'flicker.json'), JSON.stringify(rows, null, 1));
  await browser.close();
})();
