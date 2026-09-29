/* The store page's screenshots at 1920 × 1080 (docs/release/screenshots/), made the same way every time:
     node tools/store-shots.js [scene ...] [--out dir]
   Scenes: airport (the capital's airport close in: airliners, light aircraft and business jets), builder (a taxiway
   drawn square to a runway on a snapping guide), airspace (the capital's airspace drawn as on a chart, in its tab),
   raid (a raid on the capital: missiles, trails and tracks), live (the 3D live view of a take-off), replay (the 3D
   replay of an intercept, with a missile's data panel). Frames go to docs/release/screenshots/<n>-<scene>.png unless
   --out names another folder. Needs Playwright and three.js on disk: npm i --no-save playwright three@0.160.0.
   Chromium runs with its GPU switches on; where there is no GPU it falls back to software (SwiftShader). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// no tour, hints, chapter cards or staff messages over the picture
function quiet(S) {
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  // the message feed and the staff's messages are for playing, not for a still
  if (!document.getElementById('storeCss')) { const st = document.createElement('style'); st.id = 'storeCss'; st.textContent = '#feed,#comms{display:none!important}'; document.head.appendChild(st); }
}
async function game(mode, hour, seed) {
  IC.S.seed = seed || 4242; Math.random = seeded(7);
  await IC.begin(mode);
  const S = IC.S; S.paused = true; quiet(S);
  if (hour != null) S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  return S;
}
function steps(S, sec, until) { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until) { const r = until(S); if (r) return r; } } return null; }
function look(x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }
const moves = S => IC.bases(S).flatMap(b => (b.moves || []).map(m => [b, m]));
function findMove(S, fn) { for (const [b, m] of moves(S)) if (!m.dead && fn(m, b)) return m; return null; }
function camTo(V, c) { const s = V.el.querySelector('[data-rp=cam]'); s.value = c; s.dispatchEvent(new Event('change', { bubbles: true })); }
function unit(S, type, x, y) { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; }
function hostile(S, type, x, y, to, o) { return IC.spawnThreat(S, type, x, y, Object.assign({ route: [{ x: to.x, y: to.y }], aim: { x: to.x, y: to.y }, target: to, fromHostile: true }, o || {})); }
// a Career in Chapter 3 with the ready-made network of three airports, money to spend
async function career(hour) {
  Math.random = seeded(7);
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour }); IC.adopt(S); document.getElementById('start').hidden = true;
  S.paused = true; S.budget = 5500; S.story.tut = false; quiet(S); IC.ui.cineShown = S.camp.cards.length;
  await wait(500); return S;
}
// a sandbox at war over the capital, with only the threats the scene sends
async function war(hour) {
  const S = await game('sandbox', hour);
  S.enemy.war = true;
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  return S;
}`;

const SCENES = {
  // the capital's international airport close in at midday: airliners at the gates and taxiing, the business side
  // with its jets and light aircraft, club traffic round it
  airport: `
    const S = await career(8), ap = S.byId[S.story.cap];
    const aprons = ap.parts.filter(p => p.kind === 'apron' && p.built && p.stands), occ = p => p.stands.filter(s => s.occ).length;
    const hr = () => (S.time % 86400) / 3600, busy = () => aprons.reduce((n, p) => n + occ(p), 0) + 3 * (ap.moves || []).filter(m => !m.dead).length;
    // a busy daylight minute in the first two days
    steps(S, 50 * 3600, () => hr() > 8.5 && hr() < 16.5 && busy() >= +(window.BUSY || 24) && S.threats.some(t => !t.dead && t.type === 'ga' && U.dist(t, ap) < 30));
    const life = IC.apronLife(S, ap), g = aprons.sort((a, b) => occ(b) - occ(a))[0];
    console.log('at', hr().toFixed(2), 'parked', aprons.reduce((n, p) => n + occ(p), 0), 'moving', (ap.moves || []).filter(m => !m.dead).length, 'business side', life.length);
    const L = life.slice(1), lc = L.length ? { x: 0, y: 0 } : null;
    if (lc) { lc.x = L.reduce((a, q) => a + q[2], 0) / L.length; lc.y = L.reduce((a, q) => a + q[3], 0) / L.length; }
    // between the airliners at the gates and the business side, a little right of the middle (the panels are on the left)
    const occS = g.stands.filter(s => s.occ), oc = occS.length ? { x: occS.reduce((a, s) => a + s.x, 0) / occS.length, y: occS.reduce((a, s) => a + s.y, 0) / occS.length } : g;
    const f = +(window.MIX || 0.5), z = +(window.Z || 80), c = lc ? { x: oc.x + (lc.x - oc.x) * f - 170 / z, y: oc.y + (lc.y - oc.y) * f } : g;
    console.log('gates', g.x.toFixed(1), g.y.toFixed(1), 'business', lc && lc.x.toFixed(1), lc && lc.y.toFixed(1), L.map(q => q[0]).join(' '));
    IC.ui.cineShown = S.camp.cards.length; document.getElementById('cine').hidden = true;
    S.layers.coverage = false; S.paused = false; S.speed = 1;
    look(c.x, c.y, z); await wait(3500); look(c.x, c.y, z); S.paused = true; await wait(800);`,
  // the builder: a taxiway from the runway, locked square to it and stopped on a guide, its length and cost by the cursor
  builder: `
    const S = await career(11); steps(S, 600); S.paused = true;
    const ap = S.byId[S.story.cap], P = ([x, y]) => IC.aptLocal(ap, x, y);
    S.layers.coverage = false; IC.select({ kind: 'infra', ref: ap }); IC.ui.aptTab = 'build';
    S.mode2 = IC.bldMode(S, ap, 'taxi');
    IC.buildInput(S, S.mode2, P([4, 0]), 0, 38);
    S.hover = P([4.08, -2.63]);
    const c = P([2.6, -1.6]); look(c.x, c.y, 34); IC.ui.refresh(true); await wait(5000);
    const r = document.getElementById('map').getBoundingClientRect(), sc = IC.toScreen(S.hover.x, S.hover.y);
    window.__mouse = [r.left + sc.x, r.top + sc.y];`,
  // the capital's airspace drawn as on a chart, its rings in the airport's Airspace tab
  airspace: `
    const S = await career(14); steps(S, 900); S.paused = true;
    const ap = S.byId[S.story.cap];
    S.layers.coverage = false; S.layers.airways = true;
    IC.select({ kind: 'infra', ref: ap }); IC.ui.aptTab = 'asp'; IC.ui.refresh(true);
    look(ap.x - 40, ap.y, 3.2); await wait(6000);`,
  // a raid on the capital: cruise missiles and drones coming in, interceptors climbing, tracks and trails
  raid: `
    const S = await war(15); const c = IC.cap(S);
    for (const k of ['a_lrsam', 'a_pac3', 's_bmd']) S.tech.done.add(k);
    S.ad.doctrine = 'salvo';
    unit(S, 'lrsam', c.x - 120, c.y + 60); unit(S, 'lrsam', c.x + 60, c.y + 160); unit(S, 'mrsam', c.x + 110, c.y + 80); unit(S, 'mrsam', c.x + 40, c.y - 120); unit(S, 'mrsam', c.x - 100, c.y - 100);
    unit(S, 'shorad', c.x + 160, c.y - 40); unit(S, 'shorad', c.x + 220, c.y - 160); unit(S, 'spaag', c.x + 60, c.y - 60); unit(S, 'lr3d', c.x, c.y - 40); unit(S, 'gf', c.x + 200, c.y - 150);
    for (let i = 0; i < 14; i++) hostile(S, 'jdr', c.x + 520 + (i % 5) * 45, c.y - 420 + Math.floor(i / 5) * 60 + (i % 5) * 20, c);
    for (let i = 0; i < 8; i++) hostile(S, 'lacm', c.x + 450 + i * 30, c.y - 250 + (i % 3) * 40, c);
    for (let i = 0; i < 4; i++) hostile(S, 'ftr', c.x + 1100, c.y - 700 + i * 50, c, { mission: 'sweep' });
    IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900, { x: c.x + 20, y: c.y });
    steps(S, 900, S => S.missiles.length >= 14);
    S.layers.coverage = false; look(c.x + 230, c.y - 170, +(window.Z || 0.62)); await wait(5000);
    S.speed = 1; S.paused = false; await wait(+(window.MS || 2200)); S.paused = true; await wait(1500);`,
  // the 3D live view, full screen, of an airliner's take-off roll at the capital
  live: `
    const S = await game('sandbox', 11);
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'roll' && m.spd > 0.35 && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('no take-off roll');
    S.paused = false; S.speed = 1;
    const L = IC.liveOpen(S, m);
    for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    L.el.querySelector('[data-rp=full]').click(); camTo(L, window.CAM || 'side'); L.camK = +(window.K || 0.9);
    await wait(+(window.MS || 2600)); S.paused = true; await wait(2500);`,
  // the 3D replay of an intercept: a battery against cruise missiles, a missile followed with its data panel
  replay: `
    const S = await war(16); const c = IC.cap(S);
    const x = c.x + 60, y = c.y + 40;
    unit(S, 'lrsam', x, y); unit(S, 'lr3d', x - 25, y + 15); unit(S, 'mrsam', x + 30, y - 20);
    S.ad.roe = 'free';
    for (let i = 0; i < 6; i++) hostile(S, 'lacm', x + 500, y - 90 + i * 30, { x: c.x, y: c.y });
    steps(S, 400, S => S.rec.ev.some(e => e.kind === 'intercept' || e.kind === 'kill')); steps(S, 10);
    const e = S.rec.ev.find(e => e.kind === 'intercept' || e.kind === 'kill');
    if (!e) throw new Error('no intercept');
    const m = S.rec.tracks.find(tr => tr.kind === 'missile' && tr.t0 < e.t && tr.t1 >= e.t - 1 && U.dxy(IC.recGet(tr, tr.n - 1, 1), IC.recGet(tr, tr.n - 1, 2), e.x, e.y) < 5) || S.rec.tracks.find(tr => tr.kind === 'missile');
    const V = IC.replayOpen(S, { follow: m && m.ref, x: e.x, y: e.y, t: e.t - 40, r: 60, cam: 'chase' });
    for (let i = 0; i < 150 && !(V.renderer && V.movers); i++) await wait(100);
    V.t = e.t - +(window.BEFORE || 1.2); V.playing = false;
    console.log('following', m && m.name, !!V.follow);
    camTo(V, window.CAM || 'chase'); V.camK = +(window.K || 1.4); await wait(3500);`
};

(async () => {
  const args = process.argv.slice(2), oi = args.indexOf('--out');
  const outDir = oi >= 0 ? path.resolve(args[oi + 1]) : path.resolve(__dirname, '../docs/release/screenshots');
  const want = args.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));
  const names = want.length ? want : Object.keys(SCENES);
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const gpu = { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  fs.mkdirSync(outDir, { recursive: true });
  let bad = 0;
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 400)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    for (const k of ['Z', 'PICK', 'BUSY', 'MIX', 'MS', 'K', 'CAM', 'BEFORE']) if (process.env[k]) await page.addInitScript(([n, v]) => { window[n] = v; }, [k, process.env[k]]);
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    try { await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${SCENES[name]} })()`); } catch (e) { errors.push(e.message.split('\n')[0]); }
    const mouse = await page.evaluate(() => window.__mouse);
    if (mouse) { await page.mouse.move(mouse[0], mouse[1]); await page.waitForTimeout(600); }
    const n = Object.keys(SCENES).indexOf(name) + 1, out = path.join(outDir, `${n}-${name}.png`);
    await page.screenshot({ path: out, timeout: 180000 });
    console.log('saved', out);
    if (errors.length) { bad++; console.log(name, 'errors:\n  ' + errors.join('\n  ')); }
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
