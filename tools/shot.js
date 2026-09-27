/* Screenshot the real game in headless Chromium, UI included, and report page errors.
   Needs Playwright, which is not a project dependency:
     npm i --no-save playwright && npx playwright install chromium
   Usage:
     node tools/shot.js <name> [setup script] [--wait=ms]
   The setup script runs in the page after it loads, as the body of an async function, e.g.
     node tools/shot.js capital "IC.begin('story'); await wait(2500); IC.S.paused = true; const ap = IC.S.byId[IC.S.story.cap]; IC.cam.fly = null; IC.cam.z = 12; IC.centerOn(ap.x, ap.y);"
   Saves shots/<name>.png. `wait(ms)` is available inside the script. */
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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(`(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); ${setup} })()`);
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const out = path.resolve(__dirname, `../shots/${name}.png`);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('saved', out);
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
