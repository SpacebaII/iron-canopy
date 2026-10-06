/* Where a frame's time goes, view by view: the brief 36 scene (the real Denver with about 150 aircraft moving,
   tools/world-perf.js --views), with the Chrome profiler round 40 frames of drawing at each view.
     node tools/frame-prof.js [--only=airport] [--top=25]
   Prints each view's functions by time spent in them (self) and with what they call (total). Needs Playwright. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const args = process.argv.slice(2);
// --root=dir: time another checkout's game with this script (comparing two checkouts)
const ROOT = path.resolve((args.find(a => a.startsWith('--root=')) || '--root=' + path.resolve(__dirname, '..')).slice(7));
const only = (args.find(a => a.startsWith('--only=')) || '--only=').slice(7);
const TOP = +((args.find(a => a.startsWith('--top=')) || '--top=25').slice(6));

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto('file://' + path.resolve(ROOT, 'iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  const drv = fs.readFileSync(path.resolve(ROOT, 'tests/traffic.js'), 'utf8').replace("const IC = require('../headless.js');", 'const IC = window.IC;').replace(/module\.exports = ([^;]+);/, 'window.__traffic = $1;');
  await page.addScriptTag({ content: `(function () {${drv}})();` });
  const views = await page.evaluate(() => {
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
    S.paused = false; S.speed = 1;
    const taxi = ap.moves.filter(m => m.phase === 'taxi' || m.phase === 'push' || m.phase === 'start');
    const mx = taxi.reduce((s, m) => s + m.x, 0) / Math.max(1, taxi.length), my = taxi.reduce((s, m) => s + m.y, 0) / Math.max(1, taxi.length);
    let gate = null; for (const s of IC.aptStands(ap)) if (!gate || IC.U.dxy(s.x, s.y, mx, my) < IC.U.dxy(gate.x, gate.y, mx, my)) gate = s;
    const cap = IC.cap(S);
    window.__views = [['whole map', IC.minZoom(), S.world.cx, S.world.cy], ['airport z 20', 20, (ap.x + gate.x) / 2, (ap.y + gate.y) / 2], ['airport z 40', 40, gate.x, gate.y], ['airport z 80', 80, gate.x, gate.y],
      ['capital z 4', 4, cap.x, cap.y], ['capital z 12', 12, cap.x, cap.y], ['capital z 30', 30, cap.x, cap.y]];
    return window.__views.map(v => v[0]);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  for (let i = 0; i < views.length; i++) {
    if (only && !views[i].includes(only)) continue;
    await page.evaluate(async i => { const [, z, x, y] = window.__views[i]; IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); await new Promise(r => setTimeout(r, 2000)); for (let k = 0; k < 25; k++) IC.render(IC.S, performance.now() / 1000); }, i);
    await cdp.send('Profiler.start');
    const ms = await page.evaluate(() => { const S = IC.S, d = [], mc = document.getElementById('map').getContext('2d'); for (let k = 0; k < 40; k++) { const a = performance.now(); IC.render(S, a / 1000); mc.getImageData(0, 0, 1, 1); d.push(performance.now() - a); } d.sort((a, b) => a - b); return d[d.length >> 1]; });
    const { profile: p } = await cdp.send('Profiler.stop');
    const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map();
    for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const key = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    const self = new Map(), tot = new Map(); let all = 0;
    for (let s = 0; s < p.samples.length; s++) {
      let id = p.samples[s]; const n = byId.get(id); if (n.callFrame.functionName === '(idle)') continue;
      all++; self.set(key(n), (self.get(key(n)) || 0) + 1);
      const seen = new Set(); while (id != null) { const k = key(byId.get(id)); if (!seen.has(k)) { seen.add(k); tot.set(k, (tot.get(k) || 0) + 1); } id = parent.get(id); }
    }
    console.log(`\n== ${views[i]}: drawing ${ms.toFixed(1)} ms a frame (median of 40)`);
    const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => `${(100 * v / all).toFixed(1).padStart(5)}%  ${k}`).join('\n');
    console.log('-- self\n' + top(self));
    console.log('-- total\n' + top(new Map([...tot].filter(([k]) => /render|traffic|terrain|landside|roadgeom|models|pavement|airport|IC\.render/.test(k)))));
  }
  await browser.close();
})();
