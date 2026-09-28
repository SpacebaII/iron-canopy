/* World size and speed: generation, start-up, simulation step and frame times, for comparing two checkouts.
   node tools/world-perf.js            both parts
   node tools/world-perf.js --node     generation and step only (no browser)
   The browser part needs Playwright (see tools/shot.js). Prints one line per measure. */
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);

function nodePart() {
  const IC = require('../headless.js');
  IC.generate(1);   // warm up the JIT
  const gen = [];
  for (const seed of [4242, 7, 99]) { const t0 = Date.now(); const W = IC.generate(seed); IC.buildRouting(W); gen.push(Date.now() - t0); }
  const W = IC.generate(4242), home = W.villages.filter(v => v.home).length;
  console.log(`world ${Math.round(IC.WW / 10)} x ${Math.round(IC.WH / 10)} km: ${W.cities.length} cities, ${home} villages, ${Object.keys(W.nodes).length} road nodes, ${W.edges.length} roads, ${W.rails.length} railways, ${W.cities.reduce((s, c) => s + c.blocks.length, 0)} city blocks`);
  console.log(`generation (IC.generate + routing), seeds 4242/7/99: ${gen.join(' / ')} ms`);
  let t0 = Date.now();
  const S = IC.newGame({ seed: 4242, mode: 'campaign' });
  console.log(`new Quick war game (generation, routing, traffic, airlines): ${Date.now() - t0} ms; heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
  // a busy morning: two game hours at 0.25 s steps, timed after the first half hour
  S.paused = false; S.time = 7 * 3600;
  for (let i = 0; i < 7200; i++) IC.step(S, 0.25);
  t0 = process.hrtime.bigint(); const N = 21600;
  for (let i = 0; i < N; i++) IC.step(S, 0.25);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`simulation step (0.25 game s), Quick war 07:30-09:00: ${ms.toFixed(3)} ms; ${S.av ? S.av.tails.filter(t => t.st !== 'park').length : 0} airliners moving`);
}

async function browserPart() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('(no Playwright: browser part skipped)'); return; }
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const tLoad = Date.now();
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  console.log(`page load to start screen (a world generated and painted): ${Date.now() - tLoad} ms`);
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const t0 = performance.now(); const bt = IC.buildTerrain; let terr = 0;
    IC.buildTerrain = function () { const a = performance.now(); const T = bt.apply(this, arguments); terr = performance.now() - a; return T; };
    IC.begin('campaign');
    while (!document.getElementById('start').hidden) await wait(20);
    const begin = performance.now() - t0;
    IC.buildTerrain = bt;
    const S = IC.S; S.speed = 8;
    const out = { begin, terr, views: [] };
    const U = IC.U, cap = IC.cap(S), ap = IC.bases(S).filter(b => b.kind === 'airport').sort((a, b) => U.dist(a, cap) - U.dist(b, cap))[0];
    const views = [['whole map', IC.minZoom(), S.world.cx, S.world.cy], ['capital region', 0.25, cap.x, cap.y], ['capital city', 2, cap.x, cap.y], ['busy airport', 12, ap.x, ap.y]];
    for (const [name, z, x, y] of views) {
      IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y);
      await wait(1500);   // tiles paint on the first frames
      const iv = []; let last = performance.now();
      await new Promise(res => { const f = now => { iv.push(now - last); last = now; if (iv.length < 180) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      iv.shift(); iv.sort((a, b) => a - b);
      // the cost of drawing alone, one frame at a time
      const t1 = performance.now(); let n = 0; while (performance.now() - t1 < 600) { IC.render(S, performance.now() / 1000); n++; }
      out.views.push({ name, med: iv[iv.length >> 1], p95: iv[Math.floor(iv.length * 0.95)], render: (performance.now() - t1) / n, tiles: S.terrain.tiles.size });
    }
    out.mem = performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0;
    return out;
  });
  console.log(`start a Quick war (generation and terrain): ${Math.round(r.begin)} ms, of which the terrain images ${Math.round(r.terr)} ms; JS heap ${Math.round(r.mem)} MB`);
  for (const v of r.views) console.log(`frame, ${v.name}: median ${v.med.toFixed(1)} ms, 95% ${v.p95.toFixed(1)} ms; drawing alone ${v.render.toFixed(1)} ms; ${v.tiles} tiles held`);
  if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
  await browser.close();
}

(async () => {
  if (!args.includes('--browser')) nodePart();
  if (!args.includes('--node')) await browserPart();
})();
