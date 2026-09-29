/* Pictures of airport shapes for review (brief 33): round and curved terminals, branching piers, people movers,
   cosmetics, paint and blueprints, built with the player's tools at the capital of the ready-made network.
     node tools/shapes-shots.js [scene]
   Saves shots/shape-<scene>.png. Needs Playwright, like tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

// each scene: clicks with the tools (in the airport's own frame: x along the runway, 100 m units), then the camera
const SCENES = {
  rotunda: {
    build: [['rotunda', [[0, -6], [0.8, -6], [0.8, -6]]], ['taxi', [[1, 0], [1, -4.08], [1, -4.08]]]],
    z: 75, c: [0.2, -5.9]
  },
  curve: {
    build: [['curve', [[-12, -6], [-8, -8.4], [-4, -6], [-4, -6]]], ['taxi', [[-8, 0], [-8, -5.2], [-8, -5.2]]]],
    z: 30, c: [-8, -7.3]
  },
  ghost: {
    build: [], tool: ['curve', [[-12, -6], [-8, -8.4]]], at: [-4, -6.1], z: 20, c: [-8, -6.5]
  }
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
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const [name, sc] of Object.entries(SCENES)) {
    if (only && only !== name) continue;
    const err = await page.evaluate(sc => {
      const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 }); IC.adopt(S); document.getElementById('start').hidden = true;
      S.paused = true; S.budget = 1e5; IC.ui.hintsOn = false; for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
      document.getElementById('cine').hidden = true; IC.ui.cineShown = S.camp.cards.length;
      const ap = S.byId[S.story.cap], P = ([x, y]) => IC.aptLocal(ap, x, y), errs = [];
      for (const [tool, pts] of sc.build) { const m = IC.bldMode(S, ap, tool); for (const q of pts) { const r = IC.buildInput(S, m, P(q), 0, 30); if (r === 'err') errs.push(`${tool}: ${m.err}`); } }
      for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
      ap.dirty = true; IC.aptStats(S, ap);
      S.mode2 = null;
      if (sc.tool) { const m = S.mode2 = IC.bldMode(S, ap, sc.tool[0]); for (const q of sc.tool[1]) IC.buildInput(S, m, P(q), 0, sc.z); S.hover = P(sc.at); }
      const c = P(sc.c); IC.cam.fly = null; IC.cam.z = sc.z; IC.centerOn(c.x, c.y);
      IC.ui.refresh(true);
      return errs.join('; ');
    }, sc);
    if (err) console.log(name + ': ' + err);
    await page.waitForTimeout(400);
    // the cards the openings raised, and the camera where the scene wants it
    await page.evaluate(sc => { const S = IC.S, ap = S.byId[S.story.cap], c = IC.aptLocal(ap, sc.c[0], sc.c[1]); IC.ui.closeCine && IC.ui.closeCine(); document.getElementById('cine').hidden = true; IC.ui.cineShown = S.camp.cards.length; IC.cam.fly = null; IC.cam.z = sc.z; IC.centerOn(c.x, c.y); IC.ui.refresh(true); }, sc);
    await page.waitForTimeout(600);
    const out = path.resolve(__dirname, `../shots/shape-${name}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
