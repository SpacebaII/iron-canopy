/* The atmosphere's moments as pictures (light, weather, night): the same Quick war at the capital and its airport at
   noon, golden hour, dusk, night, in a storm and in fog, plus a raid at night. Interface hidden.
     node tools/atmos-shots.js [tag] [scene ...] [--root=path/to/checkout]
   Saves shots/atmos-<tag>-<scene>.png and prints the frame time of each. Run with --root= on an older checkout for
   "before". Needs Playwright (npm i --no-save playwright). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const args = process.argv.slice(2);
const rootArg = args.find(a => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(__dirname, '..');
const plain = args.filter(a => !a.startsWith('--'));
const tag = (plain[0] || 'now').replace(/[^\w-]/g, '');
// scene: hour, weather, where (region | airport | city), zoom
const SCENES = {
  noon: [12, 'clear', 'region', 1.2], golden: [18.6, 'clear', 'region', 1.2], dusk: [19.8, 'clear', 'region', 1.2],
  night: [23, 'clear', 'region', 1.2], 'night-far': [23, 'clear', 'region', 0.25], 'night-city': [23, 'clear', 'city', 4],
  'night-apt': [23, 'clear', 'airport', 14], storm: [14, 'storm', 'region', 1.2], fog: [8, 'fog', 'region', 1.2],
  overcast: [13, 'overcast', 'region', 1.2], 'raid-night': [1, 'clear', 'raid', 1.6]
};
const which = plain.slice(1).length ? plain.slice(1) : Object.keys(SCENES);

const SETUP = `
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
window.__wait = ms => new Promise(r => setTimeout(r, ms));
window.__ready = async function () {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('campaign');
  const S = IC.S; S.paused = true;
  IC.ui.hintsOn = false; IC.ui.cineShown = 1e9;
  const st = document.createElement('style'); st.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(st);
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
};
window.__scene = async function (hour, kind, where, z) {
  const S = IC.S;
  S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  if (S.weather) { S.weather.prev = kind; S.weather.kind = kind; S.weather.fade = 1; S.weather.hold = true; }
  const c = IC.cap(S);
  let at = c;
  if (where === 'airport') { const A = (S.infra || []).filter(b => b.parts && b.parts.some(p => p.kind === 'runway' && p.built)); A.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)); if (A[0]) at = A[0]; }
  if (where === 'raid') {
    S.enemy.war = true; IC.enemyTick = () => {}; S.layers.coverage = false;
    for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; IC.spawnThreat(S, i % 3 ? 'owa' : 'lacm', c.x + Math.cos(a) * 900, c.y + Math.sin(a) * 900, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y }, target: c, fromHostile: true }); }
    for (let i = 0; i < 400; i++) { IC.step(S, 0.25); if (S.fx.flashes.length > 2) break; }
  }
  IC.cam.fly = null; IC.cam.z = z; IC.centerOn(at.x, at.y);
  await __wait(900);
  const t = []; let last = performance.now();
  for (let i = 0; i < 30; i++) { await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); t.push(now - last); last = now; }
  t.sort((a, b) => a - b); return t[t.length >> 1];
};
`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(root, 'iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  await page.evaluate(SETUP);
  await page.evaluate('__ready()');
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const k of which) {
    const sc = SCENES[k]; if (!sc) { console.log('no scene', k); continue; }
    const ms = await page.evaluate(`__scene(${sc[0]}, '${sc[1]}', '${sc[2]}', ${sc[3]})`);
    const out = path.resolve(__dirname, `../shots/atmos-${tag}-${k}.png`);
    await page.screenshot({ path: out });
    console.log(`${k}: frame median ${ms.toFixed(1)} ms  ${path.relative(process.cwd(), out)}`);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
