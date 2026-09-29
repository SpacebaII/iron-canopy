/* The store page's gameplay clip (docs/release/iron-canopy-clip.webm): airport life close in, an airliner's take-off in
   the 3D live view, a raid on the map, and the 3D replay of an intercept, with a caption on each part.
     node tools/clip.js [part ...] [--out file.webm] [--seconds n]
   Parts: airport, live, raid, replay (all four by default, about 12 s each). Every frame is made on a fake clock,
   1/30 s at a time, and saved as a screenshot, so the clip plays smoothly however slowly this machine draws (the
   game in a software-rendered browser draws a few frames a second). Playwright's own ffmpeg turns the frames into
   a WebM. Needs Playwright and three.js on disk: npm i --no-save playwright three@0.160.0.
   A GIF for places that do not play video: python3 tools/clip-gif.py (needs Pillow). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const W = 1280, H = 720, FPS = 30;
const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function quiet(S) {
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {}; S.cfg.shake = false;
  const st = document.createElement('style'); st.textContent = '#feed,#comms,#incidents,#unlock{display:none!important}'; document.head.appendChild(st);
}
// the caption over the bottom of the picture, in the game's own type
function caption(t) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:9999;padding:.5rem 1.3rem;border-radius:12px;background:rgba(6,20,30,.86);color:#e4f4ff;font:600 26px var(--display);letter-spacing:.06em;text-transform:uppercase;box-shadow:0 0 24px rgba(0,0,0,.5);pointer-events:none';
  el.textContent = t; document.body.appendChild(el);
}
async function game(mode, hour) {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin(mode); const S = IC.S; S.paused = true; quiet(S);
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
async function war(hour) {
  const S = await game('sandbox', hour); S.enemy.war = true;
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  return S;
}`;

/* a clock of our own for the page: once started, requestAnimationFrame and performance.now move only when __tick
   is called (Playwright's own waits run in another world and keep the real ones) */
const VCLOCK = `(() => {
  const realNow = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  // (inside a frame the real time runs on, so work that spends a few milliseconds at a time still stops; each frame
  // starts again from its own time)
  const V = { on: false, t: 0, base: 0, q: new Map(), id: 1e6 };
  performance.now = () => V.on ? V.t + realNow() - V.base : realNow();
  window.requestAnimationFrame = cb => { if (!V.on) return raf(cb); const id = ++V.id; V.q.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { if (V.q.has(id)) V.q.delete(id); else caf(id); };
  window.__vtStart = () => { V.t = V.base = realNow(); V.on = true; };
  window.__tick = ms => { V.t += ms; V.base = realNow(); const cbs = [...V.q.values()]; V.q.clear(); for (const cb of cbs) cb(V.t); };
})();`;

/* each part sets its scene up paused; the recording then runs the game (or the replay) on the fake clock */
const PARTS = {
  // the Career's capital airport on a busy morning: airliners at the gates and taxiing, the business side, light aircraft
  airport: `
    Math.random = seeded(7);
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 8 }); IC.adopt(S); document.getElementById('start').hidden = true;
    S.paused = true; S.budget = 5500; S.story.tut = false; quiet(S); IC.ui.cineShown = S.camp.cards.length;
    const ap = S.byId[S.story.cap], hr = () => (S.time % 86400) / 3600;
    const taxi = () => (ap.moves || []).filter(m => !m.dead && (m.phase === 'taxi' || m.phase === 'roll' || m.phase === 'lineup')).length;
    steps(S, 50 * 3600, () => hr() > 8.5 && hr() < 16 && taxi() >= 2);
    IC.ui.cineShown = S.camp.cards.length; document.getElementById('cine').hidden = true;
    const g = ap.parts.filter(p => p.kind === 'apron' && p.built && p.stands).sort((a, b) => b.stands.filter(s => s.occ).length - a.stands.filter(s => s.occ).length)[0];
    const m = (ap.moves || []).find(m => !m.dead && m.phase === 'taxi') || g;
    S.layers.coverage = false; look((g.x + m.x) / 2 - 2, (g.y + m.y) / 2, 42);
    caption('Build airports at real scale'); S.speed = 2; S.paused = false;`,
  // an airliner lines up and takes off, followed in the 3D live view
  live: `
    const S = await game('sandbox', 11);
    const m = steps(S, 3600, S => findMove(S, m => (m.phase === 'lineup' || m.phase === 'hold') && m.type === 'narrow'));
    if (!m) throw new Error('nothing lining up');
    S.paused = false; S.speed = 1;
    const L = IC.liveOpen(S, m);
    for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    L.el.querySelector('[data-rp=full]').click(); camTo(L, 'chase'); L.camK = 1.4; S.paused = true;
    caption('Every aircraft flies its own path'); S.paused = false; S.speed = 2;`,
  // a raid on the capital: drones and cruise missiles, interceptors climbing out to meet them
  raid: `
    const S = await war(15); const c = IC.cap(S);
    S.ad.doctrine = 'salvo';
    unit(S, 'lrsam', c.x - 120, c.y + 60); unit(S, 'lrsam', c.x + 60, c.y + 160); unit(S, 'mrsam', c.x + 110, c.y + 80); unit(S, 'mrsam', c.x + 40, c.y - 120); unit(S, 'mrsam', c.x - 100, c.y - 100);
    unit(S, 'shorad', c.x + 160, c.y - 40); unit(S, 'shorad', c.x + 220, c.y - 160); unit(S, 'spaag', c.x + 60, c.y - 60); unit(S, 'lr3d', c.x, c.y - 40); unit(S, 'gf', c.x + 200, c.y - 150);
    for (let i = 0; i < 14; i++) hostile(S, 'jdr', c.x + 520 + (i % 5) * 45, c.y - 420 + Math.floor(i / 5) * 60 + (i % 5) * 20, c);
    for (let i = 0; i < 8; i++) hostile(S, 'lacm', c.x + 450 + i * 30, c.y - 250 + (i % 3) * 40, c);
    for (let i = 0; i < 4; i++) hostile(S, 'ftr', c.x + 1100, c.y - 700 + i * 50, c, { mission: 'sweep' });
    steps(S, 900, S => S.missiles.length >= 4);
    S.layers.coverage = false; look(c.x + 330, c.y - 220, 0.6); await wait(5000);
    caption('Then defend the sky'); S.speed = 1; S.paused = false;`,
  // the replay of an intercept: a long-range missile chased to its target, its data beside it
  replay: `
    const S = await war(16); const c = IC.cap(S);
    const x = c.x + 60, y = c.y + 40;
    unit(S, 'lrsam', x, y); unit(S, 'lr3d', x - 25, y + 15); unit(S, 'mrsam', x + 30, y - 20);
    S.ad.roe = 'free';
    for (let i = 0; i < 6; i++) hostile(S, 'lacm', x + 500, y - 90 + i * 30, { x: c.x, y: c.y });
    steps(S, 400, S => S.rec.ev.some(e => e.kind === 'intercept' || e.kind === 'kill')); steps(S, 15);
    const e = S.rec.ev.find(e => e.kind === 'intercept' || e.kind === 'kill');
    const m = S.rec.tracks.filter(tr => tr.kind === 'missile' && tr.t1 - IC.recFirstT(tr) > 8).sort((a, b) => U.dxy(IC.recGet(a, a.n - 1, 1), IC.recGet(a, a.n - 1, 2), e.x, e.y) - U.dxy(IC.recGet(b, b.n - 1, 1), IC.recGet(b, b.n - 1, 2), e.x, e.y))[0];
    const V = IC.replayOpen(S, { follow: m && m.ref, x: e.x, y: e.y, t: e.t - 40, r: 60, cam: 'chase' });
    for (let i = 0; i < 150 && !(V.renderer && V.movers); i++) await wait(100);
    V.t = Math.min(m.t1, e.t) - 5; camTo(V, 'chase'); V.camK = 0.8; await wait(2000);
    caption('Replay every engagement in 3D');
    V.playing = true;`
};

// Google's web fonts, kept on disk after the first fetch: the shots must not fall back to plain fonts when the network
// hiccups (shots/.fonts, not committed)
async function fontCache(page) {
  const dir = path.resolve(__dirname, '../shots/.fonts'); fs.mkdirSync(dir, { recursive: true });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    const f = path.join(dir, require('crypto').createHash('md5').update(r.request().url()).digest('hex'));
    if (!fs.existsSync(f)) for (let i = 0; i < 5 && !fs.existsSync(f); i++) {
      try { const res = await r.fetch(); if (res.ok()) fs.writeFileSync(f, JSON.stringify({ type: res.headers()['content-type'], body: (await res.body()).toString('base64') })); } catch (e) { await new Promise(ok => setTimeout(ok, 1000 * (i + 1))); }
    }
    if (!fs.existsSync(f)) return r.abort();
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    return r.fulfill({ body: Buffer.from(c.body, 'base64'), contentType: c.type, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

(async () => {
  const args = process.argv.slice(2), oi = args.indexOf('--out'), si = args.indexOf('--seconds');
  const out = oi >= 0 ? path.resolve(args[oi + 1]) : path.resolve(__dirname, '../docs/release/iron-canopy-clip.webm');
  const secs = si >= 0 ? +args[si + 1] : 12;
  const want = args.filter((a, i) => !a.startsWith('--') && i !== oi + 1 && i !== si + 1);
  const names = want.length ? want : Object.keys(PARTS);
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const gpu = { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  const frames = out.replace(/\.webm$/, '') + '.mjpeg'; fs.writeFileSync(frames, '');
  let n = 0, bad = 0;
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 300)));
    await fontCache(page);
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.addInitScript(VCLOCK);
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    try { await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${PARTS[name]} })()`); } catch (e) { errors.push(e.message.split('\n')[0]); }
    // from here time moves only when a frame is made
    await page.evaluate(() => window.__vtStart());
    for (let f = 0; f < secs * FPS; f++) {
      await page.evaluate(ms => window.__tick(ms), 1000 / FPS);
      fs.appendFileSync(frames, await page.screenshot({ type: 'jpeg', quality: 88 }));
      n++; if (f % 60 === 0) console.log(name, 'frame', f);
    }
    if (errors.length) { bad++; console.log(name, 'errors:\n  ' + errors.join('\n  ')); }
    await page.close();
  }
  await browser.close();
  const ffmpeg = process.env.FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
  execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', frames, '-c:v', 'libvpx', '-b:v', '2500k', '-auto-alt-ref', '0', out], { stdio: 'ignore' });
  if (!process.env.KEEP) fs.unlinkSync(frames);
  console.log(`saved ${out}: ${n} frames, ${(n / FPS).toFixed(1)} s, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
  process.exit(bad ? 1 : 0);
})();
