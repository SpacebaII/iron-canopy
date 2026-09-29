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
  ypier: {
    build: [['concourse', [[4, -7], [10, -7], [10, -7]]], ['concourse', [[10, -7], [14, -10], [14, -10]]], ['concourse', [[10, -7], [14, -4], [14, -4]]],
      ['taxi', [[3.4, 0], [3.4, -5.9], [3.4, -5.9]]], ['taxi', [[3.4, -5.9], [2.8, -5.9], [2.8, -8.11], [3.4, -8.11], [3.4, -8.11]]]],
    z: 26, c: [9.5, -7]
  },
  plain: { build: [], z: 40, c: [1, 5.2], night: false },
  looks: {
    build: [['fountain', [[1, 6.3], [1, 6.3]]], ['art', [[-3, 6.2], [-3, 6.2]]], ['art', [[5, 6.2], [5, 6.2]]]],
    after: `const T = ap.parts.find(p => p.kind === 'terminal'), tw = ap.parts.find(p => p.kind === 'tower'); IC.bldLook(S, ap, T, 'roof', 'tent'); IC.bldLook(S, ap, T, 'tint', 'white'); IC.bldLook(S, ap, T, 'sign', '1'); IC.bldLook(S, ap, tw, 'tower', 'flared');`,
    z: 40, c: [1, 5.2]
  },
  paint: {
    build: [['fountain', [[1, 6.3], [1, 6.3]]]],
    after: `const T = ap.parts.find(p => p.kind === 'terminal'); IC.bldLook(S, ap, T, 'roof', 'tent'); IC.bldLook(S, ap, T, 'sign', '1');
      const st = (mat, pts) => IC.bldPaint(S, ap, { mat, pts: pts.map(q => P(q)) });
      st('grass', [[-4.5, 5.5], [6.5, 5.5], [6.5, 7.5], [-4.5, 7.5]]); st('planting', [[-4, 5.7], [-1, 5.7], [-1, 6.2], [-4, 6.2]]); st('planting', [[3, 5.7], [6, 5.7], [6, 6.2], [3, 6.2]]);
      st('water', [[-3.6, 6.6], [-2.2, 6.5], [-1.8, 7.0], [-2.8, 7.3], [-3.7, 7.1]]); st('path', [[1, 5.3], [1, 7.4]]); st('path', [[-4.3, 6.4], [6.3, 6.4]]);
      st('hedge', [[-4.5, 7.5], [6.5, 7.5]]); st('fence', [[-4.8, 5.4], [-4.8, 7.8]]); st('kerb', [[-4.5, 5.45], [6.5, 5.45]]);
      const F = ap.parts.find(p => p.kind === 'fountain'); IC.bldMove && 0;`,
    z: 50, c: [1, 6.2]
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
      if (sc.after) new Function('S', 'ap', 'P', sc.after)(S, ap, P);
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
