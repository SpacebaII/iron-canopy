/* Replay scenes for looking at the 3D window, and for timing its frames.
   Needs Playwright and three.js on disk where cdnjs is blocked (see tools/shot.js):
     npm i --no-save playwright three@0.160.0
   Usage: node tools/replay-shots.js [scene ...]
   Scenes: city (a cruise missile into the capital's towers), tankfarm (the fuel tanks of the capital's airport),
   engagement (a battery against ballistic and cruise missiles, heights ×3, trails), gallery, gallery-above, perf.
   Frames go to shots/replay-<scene>.png. `perf` prints frame times with the replay open and 30+ movers. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
async function war(hour) {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('sandbox');
  const S = IC.S; S.paused = true;
  IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  S.enemy.war = true; S.cfg.slowmo = false; S.cfg.pauseOn = {};
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  return S;
}
function unit(S, type, x, y) { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; }
function hostile(S, type, x, y, to, o) { return IC.spawnThreat(S, type, x, y, Object.assign({ route: [{ x: to.x, y: to.y }], aim: { x: to.x, y: to.y }, target: to, fromHostile: true }, o || {})); }
function steps(S, sec, until) { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until && until(S)) return true; } return false; }
const firstEv = (S, kinds) => S.rec.ev.find(e => kinds.includes(e.kind));
async function replay(o, at, cam) {
  const V = IC.replayOpen(IC.S, o);
  for (let i = 0; i < 100 && !(V.renderer && V.movers); i++) await wait(100);
  V.t = at; if (cam) Object.assign(V.orbit, cam);
  await wait(1500);
  return V;
}`;

const SCENES = {
  // a cruise missile from the east into the tallest blocks of the capital's business district
  city: `
    const S = await war(10); const c = IC.cap(S);
    const b = c.blocks.filter(b => b.f === 'tower' && b.hp > 0).sort((p, q) => U.dxy(p.x, p.y, c.x, c.y) - U.dxy(q.x, q.y, c.x, c.y))[0];
    hostile(S, 'lacm', b.x + 300, b.y - 120, { x: b.x, y: b.y });
    steps(S, 240, S => firstEv(S, ['impact'])); steps(S, 20);
    const e = firstEv(S, ['impact']);
    await replay({ x: e.x, y: e.y, t: e.t - 30, r: 30 }, e.t + 10, { yaw: -2.2, pitch: 0.32, dist: 12 });`,
  // two missiles into the fuel tanks of the capital's airport
  tankfarm: `
    const S = await war(15); const ap = S.byId.i0;
    const tanks = ap.parts.filter(p => p.kind === 'fuel' && p.built);
    for (const p of tanks.slice(0, 2)) hostile(S, 'lacm', p.x + 250, p.y + 200, { x: p.x, y: p.y });
    steps(S, 200, S => S.rec.ev.filter(e => e.kind === 'impact').length >= 2); steps(S, 25);
    const e = firstEv(S, ['impact']);
    await replay({ x: e.x, y: e.y, t: e.t - 30, r: 40 }, e.t + 12, { yaw: 0.6, pitch: 0.38, dist: 9 });`,
  // a long-range battery and its radar against two ballistic and four cruise missiles, heights ×3, with trails
  engagement: `
    const S = await war(12); const c = IC.cap(S);
    const x = c.x + 60, y = c.y + 40;
    unit(S, 'lrsam', x, y); unit(S, 'lr3d', x - 25, y + 15); unit(S, 'shorad', x + 30, y - 20);
    S.ad.roe = 'free';
    for (let i = 0; i < 2; i++) IC.launchBallistic(S, 'srbm', x + 2600, y - 400 + i * 200, { x: c.x + i * 20, y: c.y }, {}).fromHostile = true;
    for (let i = 0; i < 4; i++) hostile(S, 'lacm', x + 700, y - 60 + i * 30, { x: c.x, y: c.y });
    steps(S, 400, S => S.rec.ev.some(e => e.kind === 'intercept')); steps(S, 10);
    const e = S.rec.ev.find(e => (e.kind === 'intercept' || e.kind === 'kill') && e.alt > 3) || firstEv(S, ['intercept', 'kill']);
    // the box between the battery and the intercept, seen from the side so the climb and the arcs read
    const mx = (x + e.x) / 2, my = (y + e.y) / 2, a = Math.atan2(e.y - y, e.x - x);
    const V = await replay({ x: mx, y: my, t: e.t - 90, r: 220 }, e.t - 3, { yaw: a + Math.PI / 2, pitch: 0.1, dist: 480, ty: e.alt * 10 * 0.55 });
    if (window.DBG) window.__dbg = { e, cam: V.camera.position.toArray().map(Math.round), movers: V.movers.map(m => [m.tr.name, m.tr.kind, m.grp.visible, m.grp.position.toArray().map(Math.round), m.grp.scale.x.toFixed(1), m.line.visible]) };`,
  // the Journal's Replay button on the city strike, and the replay it opens
  journal: `
    const S = await war(10); const c = IC.cap(S);
    const b = c.blocks.filter(b => b.f === 'tower' && b.hp > 0).sort((p, q) => U.dxy(p.x, p.y, c.x, c.y) - U.dxy(q.x, q.y, c.x, c.y))[0];
    hostile(S, 'lacm', b.x + 300, b.y - 120, { x: b.x, y: b.y });
    steps(S, 240, S => firstEv(S, ['impact'])); steps(S, 20);
    IC.ui.openRoom('journal'); IC.ui.refresh(true); await wait(600);
    const btn = document.querySelector('[data-act=replay]'); if (!btn) throw new Error('no Replay button in the Journal');
    btn.click(); for (let i = 0; i < 100 && !(IC.replayState() && IC.replayState().renderer); i++) await wait(100);
    if (!IC.replayState()) throw new Error('the Replay button did not open the replay');
    await wait(1500);`,
  // the 2D map close in: airliners at their stands and a battery's launchers drawn from above as their models
  'map-top': `
    const S = await war(11); const ap = S.byId.i0;
    const st = ap.parts.find(p => p.kind === 'apron' && p.built) || ap;
    unit(S, 'lrsam', st.x + 6, st.y - 8);
    steps(S, 30); S.paused = true;
    IC.cam.fly = null; IC.cam.z = 45; IC.centerOn(st.x + 2, st.y - 3); await wait(2500);`,
  gallery: `await IC.begin('range'); IC.replayGallery(IC.S); await wait(4000);`,
  'gallery-above': `await IC.begin('range'); IC.replayGallery(IC.S); await wait(3000); document.querySelector('[data-rp=above]').click(); await wait(1500);`,
  // frame times with the replay open on a raid: 30+ movers with trails and labels, playing at 2×
  perf: `
    const S = await war(12); const c = IC.cap(S);
    const x = c.x + 60, y = c.y + 40;
    unit(S, 'lrsam', x, y); unit(S, 'lr3d', x - 25, y + 15); unit(S, 'shorad', x + 30, y - 20); unit(S, 'mrsam', x - 40, y - 30);
    for (let i = 0; i < 4; i++) IC.launchBallistic(S, 'srbm', x + 2600, y - 400 + i * 200, { x: c.x + i * 20, y: c.y }, {}).fromHostile = true;
    for (let i = 0; i < 28; i++) hostile(S, i % 2 ? 'lacm' : 'owa', x + 400 + (i % 4) * 40, y - 200 + i * 15, { x: c.x, y: c.y });
    steps(S, 150);
    const V = await replay({ x, y, t: S.time - 120, r: 120 }, S.time - 120, { yaw: -1.9, pitch: 0.35, dist: 120 });
    V.speed = 2; document.getElementById('rpPlay').click();
    const n = V.movers.length, times = [];
    let last = performance.now();
    await new Promise(res => { const f = now => { times.push(now - last); last = now; if (times.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    times.sort((a, b) => a - b);
    window.__perf = { movers: n, events: V.events.length, frameMed: +times[120].toFixed(1), frameP95: +times[228].toFixed(1), updateMs: +V.upMs.toFixed(2), drawSubmitMs: +V.drawMs.toFixed(2), calls: V.renderer.info.render.calls, tris: V.renderer.info.render.triangles, gl: (() => { const g = V.renderer.getContext(), x = g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })() };`
};

(async () => {
  const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const names = want.length ? want : Object.keys(SCENES).filter(k => k !== 'perf');
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: alt }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  let bad = 0;
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    if (process.env.DBG) await page.addInitScript(() => { window.DBG = 1; });
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${SCENES[name]} })()`);
    if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => window.__dbg)));
    if (name === 'perf') console.log('perf', JSON.stringify(await page.evaluate(() => window.__perf)));
    else { const out = path.resolve(__dirname, `../shots/replay-${name}.png`); await page.screenshot({ path: out, timeout: 180000 }); console.log('saved', out); }
    if (errors.length) { bad++; console.log(name, 'page errors:\n  ' + errors.join('\n  ')); }
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
