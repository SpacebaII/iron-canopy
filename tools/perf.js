/* Measure frame and step times. Frame times come from the real game in headless Chromium (software rendering, so
   slower than a laptop with a GPU: compare runs with each other, not with 16.7 ms); step times from Node.
     node tools/perf.js            both
     node tools/perf.js step       only the simulation step
   Needs Playwright for the frame part (see tools/shot.js). */
const path = require('path');
const args = process.argv.slice(2);

function stepTimes() {
  const IC = require('../headless.js');
  const S = IC.newGame({ seed: 4242, mode: 'sandbox', hour: 7 });
  S.paused = false;
  for (let i = 0; i < 3600 * 2 / 0.25; i++) IC.step(S, 0.25);   // two hours in, so the airports are busy
  const t = [];
  for (let i = 0; i < 2400; i++) { const t0 = process.hrtime.bigint(); IC.step(S, 0.25); t.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  t.sort((a, b) => a - b);
  const mean = t.reduce((s, v) => s + v, 0) / t.length;
  console.log(`step (0.25 game s, sandbox after 2 h): mean ${mean.toFixed(3)} ms, p95 ${t[Math.floor(t.length * 0.95)].toFixed(3)} ms`);
}

async function frameTimes() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright is not installed: skipping frame times'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const out = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    IC.S.seed = 4242; await IC.begin('sandbox');
    const S = IC.S;
    const t0 = performance.now(); IC.buildTerrain(S.world); const build = performance.now() - t0;
    for (let i = 0; i < 3600 / 0.25; i++) IC.step(S, 0.25);
    S.paused = true;
    const cap = IC.cap(S), ap = IC.bases(S).find(b => b.city === cap.id) || IC.bases(S)[0];
    const views = [['country', cap.x, cap.y, 0.12], ['region', cap.x + 300, cap.y, 0.8], ['city', cap.x, cap.y, 3], ['street', cap.x, cap.y, 14], ['airport', ap.x, ap.y, 5], ['airport close', ap.x, ap.y, 20]];
    const res = { build: build.toFixed(0) };
    for (const [name, x, y, z] of views) {
      IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y);
      // fill the tile cache first, timing how long the cold view takes
      let tiles = 0; const c0 = performance.now();
      for (let k = 0; k < 400; k++) { const n = IC.drawTerrain(document.createElement('canvas').getContext('2d'), S.terrain, IC.cam, IC.dpr(), 1e9, S); tiles += n; if (!n) break; }
      const cold = performance.now() - c0;
      const t = [];
      for (let k = 0; k < 40; k++) { const a = performance.now(); IC.render(S, a / 1000); t.push(performance.now() - a); }
      t.sort((p, q) => p - q);
      res[name] = `mean ${(t.reduce((s, v) => s + v, 0) / t.length).toFixed(1)} ms, p95 ${t[Math.floor(t.length * 0.95)].toFixed(1)} ms; ${tiles} tiles painted in ${cold.toFixed(0)} ms`;
    }
    return res;
  });
  console.log(`terrain build: ${out.build} ms`);
  for (const k in out) if (k !== 'build') console.log(`frame, ${k}: ${out[k]}`);
  await browser.close();
}

(async () => {
  stepTimes();
  if (args[0] !== 'step') await frameTimes();
})();
