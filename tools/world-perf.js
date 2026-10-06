/* World size and speed: generation, start-up, simulation step and frame times, for comparing two checkouts.
   node tools/world-perf.js            both parts
   node tools/world-perf.js --node     generation and step only (no browser)
   The browser part needs Playwright (see tools/shot.js). Prints one line per measure. */
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
// --root=dir: time another checkout's game with this script (comparing two checkouts)
const ROOT = path.resolve((args.find(a => a.startsWith('--root=')) || '--root=' + path.resolve(__dirname, '..')).slice(7));

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

/* brief 36: frame times where the owner found the game slow. The real Denver at the capital, driven to about 150
   aircraft moving by the tests' traffic generator (tests/traffic.js), then run at 1× while frames are timed close in
   (z 20, 40, 80), over the capital city (z 4, 12, 30) and on the whole map. Each view is checked against a frame
   budget (--budget=ms, 16.7 by default): the drawing alone, one frame at a time, must fit in it. A software-rendered
   browser (no graphics card) draws several times slower than a laptop: compare checkouts, not the budget, there. */
async function viewsPart() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('(no Playwright: views part skipped)'); return; }
  const budget = +((args.find(a => a.startsWith('--budget=')) || '--budget=16.7').slice(9));
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(ROOT, 'iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  // the tests' traffic generator, run in the page
  const drv = fs.readFileSync(path.resolve(ROOT, 'tests/traffic.js'), 'utf8').replace("const IC = require('../headless.js');", 'const IC = window.IC;').replace(/module\.exports = ([^;]+);/, 'window.__traffic = $1;');
  await page.addScriptTag({ content: `(function () {${drv}})();` });
  const r = await page.evaluate(async (only) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const { drive, kdenGame } = window.__traffic;
    IC.seedRandom(12345);
    const { S, ap } = kdenGame(12345, 10);
    IC.adopt(S);
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    IC.ui.cineShown = 1e9; const cn = document.getElementById('cine'); if (cn) cn.hidden = true;
    S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
    IC.setWind(S, { dir: -Math.PI / 2, kt: 12, hold: true });
    IC.aptStats(S, ap);
    drive(S, ap, { arr: 200, dep: 700, hours: 0.25, fill: 0.95 });
    const moving = ap.moves.length;
    S.paused = false; S.speed = 1;
    // where the aircraft are thickest: the stand nearest the middle of those taxiing
    const taxi = ap.moves.filter(m => m.phase === 'taxi' || m.phase === 'push' || m.phase === 'start');
    const mx = taxi.reduce((s, m) => s + m.x, 0) / Math.max(1, taxi.length), my = taxi.reduce((s, m) => s + m.y, 0) / Math.max(1, taxi.length);
    let gate = null; for (const s of IC.aptStands(ap)) if (!gate || IC.U.dxy(s.x, s.y, mx, my) < IC.U.dxy(gate.x, gate.y, mx, my)) gate = s;
    const cap = IC.cap(S);
    const views = [['whole map', IC.minZoom(), S.world.cx, S.world.cy], ['airport z 20', 20, (ap.x + gate.x) / 2, (ap.y + gate.y) / 2], ['airport z 40', 40, gate.x, gate.y], ['airport z 80', 80, gate.x, gate.y],
      ['capital z 4', 4, cap.x, cap.y], ['capital z 12', 12, cap.x, cap.y], ['capital z 30', 30, cap.x, cap.y]].filter(v => !only || v[0].includes(only));
    const out = { moving, views: [] };
    for (const [name, z, x, y] of views) {
      IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y);
      // tiles paint on the first frames: a few seconds of frames first, and as many drawn straight after
      await wait(2000); for (let k = 0; k < 25; k++) IC.render(S, performance.now() / 1000);
      const iv = []; let last = performance.now();
      await new Promise(res => { const f = now => { iv.push(now - last); last = now; if (iv.length < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      iv.shift(); iv.sort((a, b) => a - b);
      // the cost of drawing alone, one frame at a time (reading a pixel back makes the browser finish painting it)
      const d = [], mc = document.getElementById('map').getContext('2d'); const t1 = performance.now();
      while (performance.now() - t1 < 1500 && d.length < 60) { const a = performance.now(); IC.render(S, a / 1000); mc.getImageData(0, 0, 1, 1); d.push(performance.now() - a); }
      d.sort((a, b) => a - b);
      out.views.push({ name, med: iv[iv.length >> 1], p95: iv[Math.floor(iv.length * 0.95)], draw: d[d.length >> 1], drawP95: d[Math.floor(d.length * 0.95)] });
    }
    return out;
  }, args.find(a => a.startsWith('--only=')) ? args.find(a => a.startsWith('--only=')).slice(7) : '');
  console.log(`brief 36 views: the real Denver with ${r.moving} aircraft moving, at 1×`);
  for (const v of r.views) console.log(`frame, ${v.name}: median ${v.med.toFixed(1)} ms, 95% ${v.p95.toFixed(1)} ms; drawing alone median ${v.draw.toFixed(1)} ms, 95% ${v.drawP95.toFixed(1)} ms ${v.draw <= budget ? 'ok' : 'OVER'} (budget ${budget} ms)`);
  if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
  await browser.close();
}

(async () => {
  if (args.includes('--views')) return viewsPart();
  if (!args.includes('--browser')) nodePart();
  if (!args.includes('--node')) await browserPart();
})();
