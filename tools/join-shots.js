/* Close-ups of every kind of pavement junction on an airport (brief 45): a runway end, an entry, a rapid exit, an
   apron edge, a T, an X, a Y and a bend, one picture each, with the interface hidden.
     node tools/join-shots.js <tag> [cap|kden] [--z=110]
   Saves shots/join-<tag>-<airport>-<kind>.png. Needs Playwright (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }
const args = process.argv.slice(2);
const tag = (args[0] || 'now').replace(/[^\w-]/g, ''), which = args[1] && !args[1].startsWith('--') ? args[1] : 'cap';
const Z = +((args.find(a => a.startsWith('--z=')) || '--z=110').slice(4));
(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const spots = await page.evaluate(async (key) => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    IC.ui.cineShown = 1e9;
    const s = document.createElement('style'); s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s);
    const ap = S.byId[S.story.cap];
    if (key === 'kden') IC.aptRelayout(S, ap, 'kden', 0);
    else if (key !== 'cap' && IC.REAL_APT[key]) IC.showcaseSetup(S, key);
    S.paused = true; S.weather.hold = true;
    // rapid exits on the longest runway, so there is one to look at
    S.budget = 1e5;
    const rw = ap.parts.filter(p => p.kind === 'runway').sort((a, b) => IC.rwLen(b) - IC.rwLen(a))[0];
    const X = IC.bldExitSpec(S, ap, rw); if (X.specs.length) IC.bldPlanSpecs(S, ap, X.specs);
    if (window.__extra) window.__extra(S, ap);
    for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
    for (let i = 0; i < 40; i++) IC.step(S, 0.25);
    const out = {};
    for (const j of IC.paveJoins(ap)) if (!out[j.type]) out[j.type] = { x: j.x, y: j.y };
    return out;
  }, which);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const [k, q] of Object.entries(spots)) {
    await page.evaluate(([x, y, z]) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }, [q.x, q.y, Z]);
    await page.waitForTimeout(1200);
    const file = path.resolve(__dirname, `../shots/join-${tag}-${which}-${k}.png`);
    await page.screenshot({ path: file });
    console.log(k, path.relative(process.cwd(), file));
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
