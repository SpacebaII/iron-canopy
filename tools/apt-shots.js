/* Pictures of airports with the interface hidden, for looking at the airport itself (brief 39).
     node tools/apt-shots.js <name> "<setup script>" [--ui] [--w=1440] [--h=900]
   The setup script runs in the page as the body of an async function with these helpers:
     game(mode, o)      a new game (IC.newGame options in o: seed, preset, hour...), adopted and quiet
     look(x, y, z)      the camera on a world point at zoom z
     steps(S, sec)      run the simulation
     wait(ms)
   Saves shots/<name>.png and reports page errors. Needs Playwright, like tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
function quiet(S, ui) {
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  if (!document.getElementById('aptCss')) { const st = document.createElement('style'); st.id = 'aptCss';
    st.textContent = ui ? '#feed,#comms,#incidents,#unlock,#hints{display:none!important}' : '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}';
    document.head.appendChild(st); }
}
async function game(mode, o) {
  o = Object.assign({ seed: 12345, mode, hour: 11 }, o || {});
  const S = IC.newGame(o); IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  S.paused = true; quiet(S, UI); return S;
}
function steps(S, sec) { for (let i = 0; i < sec * 4; i++) IC.step(S, 0.25); }
function look(x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }
`;

(async () => {
  const args = process.argv.slice(2);
  const name = (args[0] || 'apt').replace(/[^\w-]/g, '');
  const setup = args[1] && !args[1].startsWith('--') ? args[1] : '';
  const ui = args.includes('--ui');
  const W = +((args.find(a => a.startsWith('--w=')) || '--w=1440').slice(4)), H = +((args.find(a => a.startsWith('--h=')) || '--h=900').slice(4));
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const out = await page.evaluate(`(async () => { const UI = ${ui}; ${LIB}; ${setup} })()`);
  if (out) console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  await page.waitForTimeout(1200);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const file = path.resolve(__dirname, `../shots/${name}.png`);
  await page.screenshot({ path: file });
  await browser.close();
  console.log('saved', file);
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
