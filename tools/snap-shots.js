/* Pictures of the builder's snapping and guides for review (brief 33), at the capital of the ready-made network:
     node tools/snap-shots.js [scene]
   Saves shots/snap-<scene>.png: taxi (a taxiway locked square to the runway, stopped on a guide), apron (an apron
   started flush on a corner, its sides and depth), red (a taxiway through an apron, refused with the reason), size (an
   apron far bigger than needed), runway (a second runway lined up end to end), hangar (a building flush against a
   terminal). Needs Playwright, like tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

// each scene: the tool, the points already clicked and the cursor, in the airport's own frame (x along the runway, 100 m units)
const SCENES = {
  taxi: { tool: 'taxi', pts: [[4, 0]], at: [4.08, -2.63], z: 38, c: [2, -1.4] },
  apron: { tool: 'apron', pts: [[-9.7, -1.62]], at: [-5.18, -2.6], z: 34, c: [-8, -2.3] },
  red: { tool: 'taxi', pts: [[-2, 1.8]], at: [-2.04, 3.6], z: 40, c: [-2, 2.8] },
  size: { tool: 'apron', pts: [[0, -4]], at: [14, -9.5], z: 18, c: [11, -5] },
  runway: { tool: 'runway', pts: [[-17, -13]], at: [17.05, -13.08], z: 11, c: [13, -5] },
  hangar: { tool: 'hangar', pts: [], at: [10.0, 3.3], z: 55, c: [9.5, 3.4] }
};

(async () => {
  const only = process.argv[2];
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(() => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 }); IC.adopt(S); document.getElementById('start').hidden = true;
    S.paused = true; S.budget = 20000; IC.ui.hintsOn = false; for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    document.getElementById('cine').hidden = true; IC.ui.cineShown = S.camp.cards.length;
  });
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const [name, sc] of Object.entries(SCENES)) {
    if (only && only !== name) continue;
    await page.evaluate(sc => {
      const S = IC.S, ap = S.byId[S.story.cap], P = ([x, y]) => IC.aptLocal(ap, x, y);
      S.mode2 = IC.bldMode(S, ap, sc.tool);
      for (const q of sc.pts) IC.buildInput(S, S.mode2, P(q), 0, sc.z);
      S.hover = P(sc.at);
      const c = P(sc.c); IC.cam.fly = null; IC.cam.z = sc.z; IC.centerOn(c.x, c.y);
      IC.ui.refresh(true);
    }, sc);
    await page.waitForTimeout(900);
    const out = path.resolve(__dirname, `../shots/snap-${name}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
