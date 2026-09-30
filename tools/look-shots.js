/* Pictures of an airport at four zooms (region, whole airport, a junction, a gate) with the interface hidden, for
   before-and-after comparisons of how airports are drawn (brief 44).
     node tools/look-shots.js <tag> [cap|kden|all] [--night] [--w=1440] [--h=900]
   Saves shots/look-<tag>-<airport>-<zoom>.png and prints the frame time at each zoom. Needs Playwright
   (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const args = process.argv.slice(2);
const tag = (args[0] || 'now').replace(/[^\w-]/g, '');
const which = args[1] && !args[1].startsWith('--') ? args[1] : 'all';
const night = args.includes('--night');
const W = +((args.find(a => a.startsWith('--w=')) || '--w=1440').slice(4)), H = +((args.find(a => a.startsWith('--h=')) || '--h=900').slice(4));

const SETUP = `
window.__look = async function (key, hour) {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour });
  IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  if (!document.getElementById('aptCss')) { const s = document.createElement('style'); s.id = 'aptCss';
    s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s); }
  const ap = S.byId[S.story.cap];
  if (key === 'kden') IC.aptRelayout(S, ap, 'kden', 0);
  S.weather.hold = true; S.wind.kt = 6;
  for (let i = 0; i < 2400; i++) IC.step(S, 0.25);
  S.paused = true;
  // a junction: a taxiway meeting the runway at a turn, and a gate: a contact stand with an aircraft on it
  const G = IC.aptGraph(ap); let J = null, gate = null;
  for (const p of ap.parts) if (p.kind === 'taxi' && p.built && !J) for (const id of p.nodes) { const n = ap.nodes[id]; if (n && n.on && n.on.kind === 'rwy') { J = n; break; } }
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) if (!gate || (s.occ && !gate.occ) || (s.contact && !gate.contact)) gate = s;
  const r = ap.radius || 40;
  return { ap: { x: ap.x, y: ap.y, r }, J: J && { x: J.x, y: J.y }, gate: gate && { x: gate.x, y: gate.y } };
};
window.__cam = function (x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
window.__frames = async function (n) {
  const t = []; let last = performance.now();
  for (let i = 0; i < n; i++) { await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); t.push(now - last); last = now; }
  t.sort((a, b) => a - b); return { med: t[t.length >> 1], p90: t[Math.floor(t.length * 0.9)] };
};
`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(SETUP);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const key of which === 'all' ? ['cap', 'kden'] : [which]) {
    const L = await page.evaluate(`__look('${key}', ${night ? 22 : 11})`);
    const zooms = [['region', L.ap.x, L.ap.y, 1.2], ['airport', L.ap.x, L.ap.y, Math.min(W, H) / (L.ap.r * 2.2)]];
    if (L.J) zooms.push(['junction', L.J.x, L.J.y, 45]);
    if (L.gate) zooms.push(['gate', L.gate.x, L.gate.y, 160]);
    if (L.J && args.includes('--entry')) zooms.push(['entry', L.J.x, L.J.y, 140]);
    if (L.gate && args.includes('--close')) zooms.push(['close', L.gate.x, L.gate.y, 320]);
    if (args.includes('--only')) zooms.splice(0, zooms.length, ...zooms.filter(q => args.includes('--' + q[0])));
    for (const [z, x, y, zz] of zooms) {
      await page.evaluate(`__cam(${x}, ${y}, ${zz})`);
      // let the tiles paint, then time frames
      await page.waitForTimeout(1500);
      const f = await page.evaluate('__frames(60)');
      const file = path.resolve(__dirname, `../shots/look-${tag}-${key}-${z}.png`);
      await page.screenshot({ path: file });
      console.log(`${key} ${z} z=${zz.toFixed(2)}: frame median ${f.med.toFixed(1)} ms, 90% ${f.p90.toFixed(1)} ms  ${path.relative(process.cwd(), file)}`);
    }
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
