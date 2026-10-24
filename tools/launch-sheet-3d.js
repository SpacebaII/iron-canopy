/* How each weapon leaves its launcher in the 3D replay, frame by frame (brief 67): a contact sheet of twelve frames
   over the first seconds of a launch, filmed on the replay's own clock at 30 frames a second from a camera planted
   beside the launcher, looking at the round.
     node tools/launch-sheet-3d.js [what ...] [--out=shots/launch3d] [--q=medium] [--span=2] [--cols=4]
   what: lrsam mrsam shorad vshorad spaag (ours, at a strike aircraft) or srbm lacm owa (the enemy's, from the
   ground). Saves <out>/sheet-<what>.jpg, and with --frames every frame of the span as <out>/<what>/f000.jpg.
   Needs Playwright and three.js on disk: npm i --no-save playwright three@0.160.0 */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(__dirname, '..', arg('out', 'shots/launch3d'));
const Q = arg('q', 'medium'), SPAN = +arg('span', 2), COLS = +arg('cols', 4), N = +arg('n', 12), FRAMES = process.argv.includes('--frames');
const ALL = ['lrsam', 'mrsam', 'shorad', 'vshorad', 'spaag', 'srbm', 'lacm', 'owa'];
const want = process.argv.slice(2).filter(a => !a.startsWith('--'));

const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function steps(S, sec, until) { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until && until(S)) return true; } return false; }
async function war(hour) {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('sandbox');
  const S = IC.S; S.paused = true;
  IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  S.enemy.war = true; S.cfg.slowmo = false; S.cfg.pauseOn = {};
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  return S;
}
function unit(S, type, x, y) { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; }
function hostile(S, type, x, y, to) { return IC.spawnThreat(S, type, x, y, { route: [{ x: to.x, y: to.y }], aim: { x: to.x, y: to.y }, target: to, fromHostile: true }); }
`;

/* the launch: [the track whose first seconds are filmed, the launcher's place, where it flies] */
const SETUP = what => `(async () => { ${LIB}
  const S = await war(11); const c = IC.cap(S), x = c.x + 60, y = c.y + 40;
  S.ad.roe = 'free';
  const ours = ${JSON.stringify(['lrsam', 'mrsam', 'shorad', 'vshorad', 'spaag'])}.includes('${what}');
  let tr = null, ux = x, uy = y;
  if (ours) {
    const u = unit(S, '${what}', x, y); unit(S, 'lr3d', x - 25, y + 15);
    const far = { lrsam: 900, mrsam: 450, shorad: 120, vshorad: 60, spaag: 40 }['${what}'];
    for (let i = 0; i < 2; i++) hostile(S, '${what}' === 'spaag' || '${what}' === 'vshorad' ? 'ahe' : 'str', x + far, y - 60 + i * 40, { x: c.x, y: c.y });
    steps(S, 900, S => S.rec.tracks.some(t => t.kind === 'missile' && t.meta.uref === u) || S.rec.ev.some(e => e.kind === 'fire' && Math.hypot(e.x - x, e.y - y) < 1));
    tr = S.rec.tracks.find(t => t.kind === 'missile' && t.meta.uref === u);
    if (!tr) { const e = S.rec.ev.find(e => e.kind === 'fire'); if (!e) throw new Error('${what} did not fire'); window.T0 = e.t; window.REF = null; }
    else { window.T0 = IC.recFirstT(tr); window.REF = tr.ref; }
  } else {
    // from the ground some way off, at the capital
    // (a ballistic missile is launched as the enemy launches one: a flight to its aim, from the pad)
    const t = '${what}' === 'srbm' ? IC.launchBallistic(S, 'srbm', x + 500, y + 100, { x: c.x, y: c.y }) : hostile(S, '${what}', x + 500, y + 100, { x: c.x, y: c.y });
    if (!t) throw new Error('no ${what}');
    t.alt = 0; ux = t.x; uy = t.y;
    steps(S, 3);
    tr = S.rec.of.get(t); if (!tr) throw new Error('no track for ${what}');
    window.T0 = IC.recFirstT(tr); window.REF = tr.ref;
  }
  steps(S, 40);
  const a = tr ? IC.recAt(tr, window.T0, {}) : { x: ux, y: uy }, b = tr ? IC.recAt(tr, Math.min(tr.t1, window.T0 + 6), {}) : { x: ux + 1, y: uy };
  const az = Math.atan2(b.y - a.y, b.x - a.x);
  window.LX = a.x; window.LY = a.y; window.AZ = az;
  return { t0: window.T0, ref: !!window.REF, alt0: tr ? IC.recAt(tr, window.T0, {}).alt : 0 };
})()`;

const FILM = (what, span, n, cols, frames) => `(async () => { ${LIB}
  const S = IC.S, t0 = window.T0, a = window.AZ, big = '${what}' === 'srbm' || '${what}' === 'lacm';
  const V = IC.replayOpen(S, { follow: window.REF || undefined, x: window.LX, y: window.LY, t: t0 - 4, r: 120, cam: 'orbit' });
  for (let i = 0; i < 300 && !(V.renderer && V.movers); i++) await wait(100);
  V.labels = false; V.trails = true; for (const m of V.movers) m.label.hidden = true;
  const pn = V.$('panel'); if (pn) pn.style.display = 'none';
  // planted beside the launcher, square to the way it fires and a little behind, looking at the round
  const side = big ? 1.6 : 0.9, back = big ? 0.4 : 0.35;
  const from = { x: window.LX - Math.sin(a) * side - Math.cos(a) * back, y: window.LY + Math.cos(a) * side - Math.sin(a) * back, h: 3 };
  IC.replayShot(V, { mode: 'fixed', from, ref: window.REF || { x: window.LX, y: window.LY, h: 3 }, at: { x: window.LX, y: window.LY, h: 3 }, lens: big ? 28 : 35, lag: 0.25, dur: 60 });
  window.requestAnimationFrame = () => 0;
  V.playing = true; V.speed = 1; V.slowmo = false; V.t = t0 - 0.6;
  let now = performance.now();
  // settle (the ground, the airport, the passes) on the frame before the launch
  for (let i = 0; i < 6; i++) { V.t = t0 - 0.6; IC.replayStep(V, now += 1000 / 30); await wait(200); }
  V.t = t0 - 0.2; V.playing = true;
  const total = Math.round(${span} * 30), every = Math.max(1, Math.round(total / ${n}));
  const W = 480, H = 270, rows = Math.ceil(${n} / ${cols}), cv = document.createElement('canvas'); cv.width = W * ${cols}; cv.height = H * rows;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const src = V.renderer.domElement;
  let k = 0;
  for (let f = 0; f <= total && k < ${n}; f++) {
    IC.replayStep(V, now += 1000 / 30);
    const sw = src.width, sh = src.height, s = Math.min(sw / W, sh / H), cw = W * s, ch = H * s;
    if (${frames}) { const c1 = document.createElement('canvas'); c1.width = 640; c1.height = 360; c1.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 640, 360); await __frame('${what}', f, c1.toDataURL('image/jpeg', 0.85).slice(23)); }
    if (f % every === 0) {
      const X = (k % ${cols}) * W, Y = Math.floor(k / ${cols}) * H;
      g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, X, Y, W, H);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(X + 6, Y + 6, 92, 22); g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText('t+' + (V.t - t0).toFixed(2) + 's', X + 12, Y + 22);
      k++;
    }
  }
  await __sheet('${what}', cv.toDataURL('image/jpeg', 0.88).slice(23));
})()`;

(async () => {
  const names = want.length ? want : ALL;
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  fs.mkdirSync(OUT, { recursive: true });
  let bad = 0;
  for (const what of names) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 400)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.addInitScript(q => { try { localStorage.setItem('ic-3d', q); } catch (e) { /* file page */ } }, Q);
    await page.exposeFunction('__sheet', (n, b64) => { const f = path.join(OUT, `sheet-${n}.jpg`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); console.log('saved', f); });
    await page.exposeFunction('__frame', (n, i, b64) => { const d = path.join(OUT, n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `f${String(i).padStart(3, '0')}.jpg`), Buffer.from(b64, 'base64')); });
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 300000 });
    try {
      const info = await page.evaluate(SETUP(what));
      console.log(what, JSON.stringify(info));
      await page.evaluate(FILM(what, SPAN, N, COLS, FRAMES));
    } catch (e) { errors.push(e.message.split('\n')[0]); }
    if (errors.length) { bad++; console.log(what, 'errors:\n  ' + errors.join('\n  ')); }
    await page.close(); await ctx.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
