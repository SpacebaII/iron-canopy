/* The real airports in the 3D replay (brief 39): the showcase opened, a few minutes of traffic recorded, then the
   replay's orbit camera round a point of the airport.
     node tools/apt3d-shots.js <name> <key> [x y dist yaw pitch]     x, y in units from the airport's reference point
   key is a showcase airport (IC.REAL_APT), or 'mini' for the made-up test field (tests/fixtures/mini-layout.js).
   Saves shots/<name>.png. Needs Playwright and three.js on disk: npm i --no-save playwright three@0.160.0 */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }
const [name = 'apt3d', key = 'mini', x = '0', y = '0', dist = '1.2', yaw = '0.8', pitch = '0.35'] = process.argv.slice(2);
(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const mini = key === 'mini' ? JSON.stringify(Object.assign({}, require('../tests/fixtures/mini-layout.js'), { icao: 'TEST', after: 'made up for the tests' })) : 'null';
  try {
    await page.evaluate(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      if (${mini}) IC.REAL_APT.mini = ${mini};
      const S = await IC.begin('showcase', '${key}'); S.paused = true;
      IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
      for (let i = 0; i < 4 * 600; i++) IC.step(S, 0.25);
      const ap = S.byId[S.story.cap];
      const V = IC.replayOpen(S, { x: ap.x + ${+x}, y: ap.y + ${+y}, t: S.time - 5, r: 60 });
      for (let i = 0; i < 200 && !(V.renderer && V.movers); i++) await wait(100);
      V.t = S.time - 2;
      const sel = V.el.querySelector('[data-rp=cam]'); if (sel) { sel.value = 'orbit'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      Object.assign(V.orbit, { yaw: ${+yaw}, pitch: ${+pitch}, dist: ${+dist}, tx: 0, tz: 0 });
      await wait(4000);
    })()`);
  } catch (e) { errors.push(e.message.split('\n')[0]); }
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const out = path.resolve(__dirname, `../shots/${name}.png`);
  await page.screenshot({ path: out, timeout: 180000 });
  console.log('saved', out);
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
