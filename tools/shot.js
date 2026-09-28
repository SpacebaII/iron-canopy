/* Screenshot the real game in headless Chromium, UI included, and report page errors.
   Needs Playwright, which is not a project dependency:
     npm i --no-save playwright && npx playwright install chromium
   Usage:
     node tools/shot.js <name> [setup script] [--wait=ms]
   The setup script runs in the page after it loads, as the body of an async function, e.g.
     node tools/shot.js capital "await IC.begin('story'); IC.S.paused = true; const ap = IC.S.byId[IC.S.story.cap]; IC.cam.fly = null; IC.cam.z = 12; IC.centerOn(ap.x, ap.y);"
   Saves shots/<name>.png. `wait(ms)` is available inside the script; it also waits while a game is being built, and
   IC.begin(mode) returns a promise kept when the game is ready. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

(async () => {
  const args = process.argv.slice(2);
  const name = (args[0] || 'shot').replace(/[^\w-]/g, '');
  const setup = args[1] && !args[1].startsWith('--') ? args[1] : '';
  const waitArg = args.find(a => a.startsWith('--wait='));
  const settle = waitArg ? +waitArg.slice(7) : 800;
  // a Playwright whose own browser is missing can still drive a preinstalled Chromium
  // behind a proxy (web fonts come from Google), let Chromium use it
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) {
    const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
    if (!fs.existsSync(alt)) throw e;
    browser = await chromium.launch(Object.assign({ executablePath: alt }, opt));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // three.js (the replay window) comes from cdnjs; where that host is blocked, serve a local copy (npm i --no-save three@0.160.0)
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const wait = async ms => { await sleep(ms); while (IC.loading && IC.loading()) await sleep(20); }; ${setup} })()`);
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const out = path.resolve(__dirname, `../shots/${name}.png`);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('saved', out);
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
