/* Pictures of the blueprints (brief 45): each opened as the airport showcase, from above at the whole-airport zoom
   and close in at its terminals, with the interface hidden.
     node tools/bp-shots.js <tag> [key ...] [--min=20] [--z=...]
   Saves shots/bp-<tag>-<key>-airport.png and -close.png, and prints the frame times. Needs Playwright
   (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }
const args = process.argv.slice(2), tag = (args[0] || 'now').replace(/[^\w-]/g, '');
const keys = args.slice(1).filter(a => !a.startsWith('--'));
const min = +((args.find(a => a.startsWith('--min=')) || '--min=20').slice(6));
(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const all = keys.length ? keys : await page.evaluate(() => Object.keys(IC.BLUEPRINTS));
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const key of all) {
    const info = await page.evaluate(async ([key, min]) => {
      const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', showcase: key, hour: 11 });
      IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
      IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
      IC.ui.cineShown = 1e9;
      if (!document.getElementById('bpCss')) { const s = document.createElement('style'); s.id = 'bpCss'; s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s); }
      S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {}; S.weather.hold = true; S.wind.kt = 6;
      for (let i = 0; i < min * 240; i++) IC.step(S, 0.25);
      S.paused = true;
      const ap = S.byId[S.story.cap], t = ap.parts.filter(p => p.kind === 'terminal' && p.built).sort((a, b) => (b.w * b.h) - (a.w * a.h));
      const G = IC.paveGeom(ap).bb;
      return { x: (G.x0 + G.x1) / 2, y: (G.y0 + G.y1) / 2, w: G.x1 - G.x0, h: G.y1 - G.y0, tx: t[1] ? t[1].x : ap.x, ty: t[1] ? t[1].y : ap.y, n: ap.moves.length, tails: S.av.tails.length };
    }, [key, min]);
    for (const [z, x, y, zz] of [['airport', info.x, info.y, Math.min(1440 / info.w, 900 / info.h) * 0.92], ['close', info.tx, info.ty, 85]]) {
      await page.evaluate(([x, y, z]) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }, [x, y, zz]);
      await page.waitForTimeout(2500);
      const f = await page.evaluate(async () => { const t = []; let last = performance.now(); for (let i = 0; i < 40; i++) { await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); t.push(n - last); last = n; } t.sort((a, b) => a - b); return t[t.length >> 1]; });
      const file = path.resolve(__dirname, `../shots/bp-${tag}-${key}-${z}.png`);
      await page.screenshot({ path: file });
      console.log(`${key} ${z}: ${info.n} moving, ${info.tails} aircraft, frame median ${f.toFixed(1)} ms  ${path.relative(process.cwd(), file)}`);
    }
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
