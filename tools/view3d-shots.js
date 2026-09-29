/* The 3D view's moments, for looking at the models and their movement (brief 34): an airliner at the gate, taxiing,
   taking off, cruising and landing; a fighter turning; a drone; a helicopter; the models gallery; and a short video
   of the live view. Needs Playwright and three.js on disk (see tools/replay-shots.js):
     npm i --no-save playwright three@0.160.0
   Usage: node tools/view3d-shots.js [scene ...] [--out dir]
   Scenes: gate taxi takeoff cruise landing fighter drone heli gallery gallery-close video frames.
   Frames go to shots/<dir>/3d-<scene>.png (default dir: after); `video` saves 3d-live.webm, `frames` prints
   frame times of the live view full screen over a raid and small over a busy airport. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
async function game(mode, hour) {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin(mode || 'sandbox');
  const S = IC.S; S.paused = true;
  IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  if (hour != null) S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  S.cfg.slowmo = false; S.cfg.pauseOn = {};
  return S;
}
function steps(S, sec, until) { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until) { const r = until(S); if (r) return r; } } return null; }
const moves = S => IC.bases(S).flatMap(b => (b.moves || []).map(m => [b, m]));
function findMove(S, fn) { for (const [b, m] of moves(S)) if (!m.dead && fn(m, b)) return m; return null; }
/* the live view full screen on a ref, the game running at 1× for a few seconds so the view has history */
async function live(S, ref, cam, ms) {
  S.paused = false; S.speed = 1;
  const L = IC.liveOpen(S, ref);
  for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
  L.el.querySelector('[data-rp=full]').click();
  if (cam) { const s = L.el.querySelector('[data-rp=cam]'); s.value = cam; s.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait(ms || 5000);
  S.paused = true; await wait(1200);
  return L;
}
async function replay(o, at, orbit) {
  const V = IC.replayOpen(IC.S, o);
  for (let i = 0; i < 150 && !(V.renderer && V.movers); i++) await wait(100);
  V.t = at; if (orbit) Object.assign(V.orbit, orbit);
  await wait(2500);
  return V;
}
function camTo(V, c) { const s = V.el.querySelector('[data-rp=cam]'); s.value = c; s.dispatchEvent(new Event('change', { bubbles: true })); }
async function flicker(V) {
  const W = 480, H = 300, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  const frames = [], R = V.renderer, orig = R.render;
  // the orbit camera, turned a fraction of a pixel each frame: smooth things barely change, flicker jumps
  const sel = V.el.querySelector('[data-rp=cam]'); sel.value = 'orbit'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(800);
  await new Promise(res => { R.render = function (s, c) { orig.call(R, s, c); if (frames.length < 24) { g.drawImage(R.domElement, 0, 0, W, H); frames.push(g.getImageData(0, 0, W, H).data.slice()); V.orbit.yaw += 0.0002; } else res(); }; });
  R.render = orig;
  let osc = 0, n = 0;
  const lum = (k, i) => frames[k][i] * 0.3 + frames[k][i + 1] * 0.59 + frames[k][i + 2] * 0.11;
  for (let f = 1; f < frames.length - 1; f++) for (let i = 0; i < W * H * 4; i += 4) { const a = lum(f, i) - lum(f - 1, i), b = lum(f + 1, i) - lum(f, i); n++; if (Math.abs(a) > 30 && Math.abs(b) > 30 && Math.sign(a) !== Math.sign(b)) osc++; }
  return { flickerPct: +(osc / n * 100).toFixed(3), frames: frames.length };
}
const frameTimes = async n => { const ts = []; let last = performance.now(); await new Promise(res => { const f = now => { ts.push(now - last); last = now; if (ts.length < n) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); ts.sort((a, b) => a - b); return { med: +ts[n >> 1].toFixed(1), p95: +ts[Math.floor(n * 0.95)].toFixed(1) }; };`;

const SCENES = {
  // an airliner parked at a contact stand of the capital's airport, seen from the apron
  gate: `
    const S = await game('sandbox', 11); steps(S, 600);
    let m = null;
    for (const b of IC.bases(S)) for (const p of b.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) if (s.occ && (!m || s.contact)) { const t = S.av.tails.find(t => t.id === s.occ); if (t && t.where === 'stand' && t.type !== 'light') m = { x: s.x, y: s.y, h: s.a }; }
    if (!m) throw new Error('no aircraft at a stand');
    const V = await replay({ x: m.x, y: m.y, t: S.time - 5, r: 30 }, S.time - 2, { yaw: m.h + 2.4, pitch: 0.12, dist: 0.9, tx: 0, tz: 0 });
    await __snap('gate');`,
  taxi: `
    const S = await game('sandbox', 11);
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light' && !m.mil));
    if (!m) throw new Error('nothing taxiing'); steps(S, 6);
    await live(S, m, 'chase', 4000); await __snap('taxi');`,
  takeoff: `
    const S = await game('sandbox', 11);
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'roll' && m.spd > 0.4 && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('no take-off roll');
    await live(S, m, 'side', 2200); await __snap('takeoff');`,
  cruise: `
    const S = await game('sandbox', 11);
    const t = steps(S, 1800, S => S.threats.find(t => t.tail && t.d.civil && t.alt > 9 && t.tail.type === 'narrow') || S.threats.find(t => t.tail && t.alt > 9));
    if (!t) throw new Error('no airliner in the cruise');
    await live(S, t, 'chase', 4000); await __snap('cruise');`,
  landing: `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.t > 30 && m.type !== 'light'));
    if (!m) throw new Error('no arrival on final');
    await live(S, m, 'side', 4000); await __snap('landing');
    S.paused = false; await wait(9000); S.paused = true; await wait(800); await __snap('landing-2');`,
  fighter: `
    Math.random = seeded(11); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const T = S.range.target;
    IC.rangeAddUnit(S, 'vshorad', T.x - 5, T.y); IC.rangeAddUnit(S, 'mrsam', T.x - 30, T.y);
    IC.rangeSpawn(S, { what: 'ftr', n: 3, brg: 80, km: 30, alt: 3 });
    steps(S, 200); let best = null, bt = 0, bk = 0;
    for (const tr of S.rec.tracks) if (tr.kind === 'threat') for (let i = 2; i < tr.n - 2; i++) { const t = IC.recGet(tr, i, 0), a = IC.recAttitude(tr, t); if (Math.abs(a.roll) > bk) { bk = Math.abs(a.roll); best = tr; bt = t; } }
    if (!best) throw new Error('no fighter');
    const V = await replay({ follow: best.ref, x: IC.recGet(best, 0, 1), y: IC.recGet(best, 0, 2), t: bt - 3, r: 120, cam: 'chase' }, bt);
    V.camK = 1.6; await wait(1500); await __snap('fighter');
    camTo(V, 'side'); V.camK = 0.3; await wait(1500); await __snap('fighter-2');`,
  drone: `
    Math.random = seeded(3); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    IC.rangeSpawn(S, { what: 'isr', n: 1, brg: 80, km: 30, alt: '' }); IC.rangeSpawn(S, { what: 'owa', n: 2, brg: 70, km: 25, alt: '' });
    steps(S, 30); const t = S.threats.find(t => t.type === 'isr');
    await live(S, t, 'chase', 4000); await __snap('drone');`,
  heli: `
    Math.random = seeded(3); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    IC.rangeSpawn(S, { what: 'ahe', n: 1, brg: 80, km: 20, alt: '' });
    steps(S, 20); const t = S.threats.find(t => t.type === 'ahe');
    await live(S, t, 'chase', 4000); await __snap('heli');`,
  gallery: `await IC.begin('range'); IC.replayGallery(IC.S); await wait(5000); await __snap('gallery');`,
  'gallery-close': `
    await IC.begin('range'); const V = IC.replayGallery(IC.S); await wait(4000);
    for (const k of ['narrow', 'wide', 'fighter', 'ftr_e', 'heli', 'drone', 'cm', 'lrsam']) {
      const m = V.movers.find(m => m.tr.model === k); if (!m) continue;
      V.follow = m; camTo(V, 'follow'); V.cam = 'follow'; Object.assign(V.orbit, { yaw: 0.9, pitch: 0.28, dist: Math.max(12, IC.modelSize(k) * 1.1) });
      await wait(1500); await __snap('gallery-' + k);
    }`,
  // brief 38's models one by one in the gallery, three-quarter view from the front (MODELS=key,key to choose)
  'gallery-38': `
    await IC.begin('range'); const V = IC.replayGallery(IC.S); await wait(4000);
    const keys = window.MODELS ? window.MODELS.split(',') : Object.keys(IC.MODELS).filter(k => ['General aviation', 'Business aviation', 'Rare visitors'].includes(IC.MODELS[k].group) || ['rj', 'widel', 'jumbo', 'cargoprop'].includes(k));
    for (const k of keys) {
      const m = V.movers.find(m => m.tr.model === k); if (!m) continue;
      V.follow = m; camTo(V, 'follow'); V.cam = 'follow'; Object.assign(V.orbit, { yaw: +(window.YAW || 0.75), pitch: +(window.PITCH || 0.22), dist: Math.max(8, IC.modelSize(k) * +(window.DIST || 0.62)) });
      await wait(1300); await __snap('g38-' + k);
    }`,
  // brief 38: a light-aircraft field by day: a light aircraft leaving it, then the club's row seen from the replay
  'ga-field': `
    Math.random = seeded(5); IC.S.seed = 4242; await IC.begin('story'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    S.time = Math.floor(S.time / 86400) * 86400 + 86400 + 10.5 * 3600;
    const t = steps(S, 3 * 3600, S => S.threats.find(x => !x.dead && x.type === 'ga' && x.gaFrom && x.gaFrom.field && !x.tow && x.age > 20 && x.age < 30));
    if (!t) throw new Error('nothing leaving a field');
    const L = await live(S, t, 'chase', 1500); L.camK = 2.6; await wait(1500); await __snap('ga-field');
    IC.liveClose(); S.paused = true;
    const f = S.asp.fields.find(x => x.id === t.gaFrom.field), ux = Math.cos(f.a), uy = Math.sin(f.a);
    const cx = f.x - ux * 0.3 - uy * 0.62, cy = f.y - uy * 0.3 + ux * 0.62;
    await replay({ x: cx, y: cy, t: S.time - 2, r: 25 }, S.time - 2, { dist: +(window.DIST || 1.4), pitch: 0.36, yaw: f.a + +(window.YAW || 2.3) });
    await __snap('ga-field-2');`,
  // brief 38: the capital's business side, jets and light aircraft on the free stands, from the replay window
  'biz-apron': `
    const S = await game('sandbox', 11); steps(S, 1200);
    const ap = S.byId.i0, life = IC.apronLife(S, ap), c = life[Math.min(+(window.PICK || 2), life.length - 1)];
    console.log('business side:', life.map(q => q[0]).join(', '));
    await replay({ x: c[2], y: c[3], t: S.time - 2, r: 25 }, S.time - 2, { dist: +(window.DIST || 1.6), pitch: 0.4, yaw: +(window.YAW || 2.4) });
    await __snap('biz-apron');`,
  // brief 38: rare visitors in flight, followed in the live view
  rare: `
    const S = await game('sandbox', 10);
    for (const [k, cam, K] of [['vintage', 'chase', 1.6], ['airship', 'side', 1.2], ['display', 'chase', 2.2], ['sst', 'side', 1.0], ['outsize', 'chase', 1.3]]) {
      if (window.MODELS && !window.MODELS.split(',').includes(k)) continue;
      S.rare.flying = null; S.rare.here = null;
      const t = IC.rareVisit(S, k); steps(S, 240);
      const L = await live(S, t, cam, 2500); L.camK = K; await wait(2000); await __snap('rare-' + k);
      IC.liveClose(); S.paused = true;
    }`,
  // the live view full screen following an airliner round the capital's airport, recorded by the browser
  video: `
    const S = await game('sandbox', 11);
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type === 'narrow'));
    if (!m) throw new Error('nothing taxiing');
    await live(S, m, 'auto', 1500); S.paused = false; S.speed = 2; await wait(+(window.VIDEO_MS || 15000)); S.paused = true;`,
  // the capital's airport at night: lights on the runways and taxiways, lit windows, aircraft lights
  night: `
    const S = await game('sandbox', 21.5);
    const m = steps(S, 2400, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light' && !m.mil));
    if (!m) throw new Error('nothing taxiing at night'); steps(S, 6);
    const L = await live(S, m, 'chase', 3000); L.camK = 2.2; await wait(1500); await __snap('night');`,
    // blinking, measured: 24 frames in a row while the camera turns slowly round a paused scene; a pixel that jumps and
  // jumps straight back is flicker (a slow turn moves things smoothly). Works on older versions of the view too
  flicker: `
    const S = await game('sandbox', 11);
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light'));
    steps(S, 6);
    const L = await live(S, m, 'spin', 4000);
    window.__perf = await flicker(L);
    await __snap('flicker');`,
  'flicker-air': `
    const S = await game('sandbox', 11);
    const t = steps(S, 1800, S => S.threats.find(t => t.tail && t.alt > 9));
    const L = await live(S, t, 'spin', 5000);
    window.__perf = await flicker(L);
    await __snap('flicker-air');`,
  // a video of the live view made frame by frame at 30 fps (smooth however slowly this machine draws): an airliner
  // lines up, takes off and climbs away, the game at twice real time; labels and panel drawn in
  movie: `
    const S = await game('sandbox', 11);
    const m = steps(S, 3600, S => findMove(S, m => (m.phase === 'lineup' || m.phase === 'hold') && m.type === 'narrow'));
    if (!m) throw new Error('nothing lining up');
    console.log('movie: lining up at', S.time);
    const L = await live(S, m, 'chase', 2500); L.camK = 1.6;
    console.log('movie: live view open');
    window.requestAnimationFrame = () => 0;   // the frames are made here, one by one
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    L.rec = { cv, g: cv.getContext('2d'), o: { w: 960, h: 540, labels: true } };
    const N = +(window.MOVIE_FRAMES || 750), speed = 2; let now = performance.now(), acc = 0;
    for (let f = 0; f < N; f++) {
      acc += speed / 30; while (acc >= 0.25) { IC.step(S, 0.25); acc -= 0.25; }
      if (f === 330) { const s = L.el.querySelector('[data-rp=cam]'); s.value = 'side'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      IC.replayStep(L, now += 1000 / 30);
      await __frame(cv.toDataURL('image/jpeg', 0.88).slice(23));
      if (f % 30 === 0) console.log('movie: frame', f);
    }
    await __snap('movie-last');`,
  // brief 38's busy airport: the capital with its business side full and a hundred and ten light aircraft round it (about 150
  // aircraft), frame times on the map close in and in the live view full screen, and the step's cost
  'frames-38': `
    const S = await game('sandbox', 11);
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light'));
    const ap = S.byId.i0, home = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id };
    for (let i = 0, n = IC.bizStands(S, ap).length; i < n; i++) S.biz.parked.push({ ap: ap.id, type: IC.BIZ_MIX[i % 4][0], cs: 'X' + i, liv: IC.gaLivery(i), until: S.time + 86400 });
    for (let i = 0; i < 110; i++) IC.gaLaunch(S, home, home, { type: IC.GA_MIX[i % 8][0], circuit: 12, progress: i / 110 * 0.7, alt: 0.3 });
    const near = () => S.threats.filter(t => !t.dead && U.dist(t, ap) < 150).length + (ap.moves || []).filter(x => !x.dead).length + ap.parts.filter(p => p.kind === 'apron').reduce((n, p) => n + (p.stands || []).filter(s => s.occ).length, 0) + IC.apronLife(S, ap).length;
    let t0 = performance.now(); for (let i = 0; i < 400; i++) IC.step(S, 0.25); const stepMs = (performance.now() - t0) / 400;
    IC.cam.fly = null; IC.cam.z = 20; IC.centerOn(ap.x - 10, ap.y - 2);
    S.paused = false; S.speed = 1; await wait(2500);
    const mapClose = await frameTimes(120);
    IC.cam.z = 6; IC.centerOn(ap.x, ap.y); await wait(1500); const mapAirport = await frameTimes(120);
    const L = IC.liveOpen(S, m); for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    L.el.querySelector('[data-rp=full]').click(); await wait(3500);
    const liveFull = await frameTimes(120);
    // what brief 38 adds to a map frame: the business side and a field's life drawn 50 times, per call
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; const g = cv.getContext('2d'), f = S.asp.fields[0];
    IC.drawApronLife(g, S, ap, 0.05); IC.drawFieldLife(g, S, f, 0.05);
    t0 = performance.now(); for (let i = 0; i < 50; i++) IC.drawApronLife(g, S, ap, 0.05); const apronMs = (performance.now() - t0) / 50;
    t0 = performance.now(); for (let i = 0; i < 50; i++) IC.drawFieldLife(g, S, f, 0.05); const fieldMs = (performance.now() - t0) / 50;
    window.__perf = { aircraft: near(), stepMs: +stepMs.toFixed(3), apronMs: +apronMs.toFixed(3), fieldMs: +fieldMs.toFixed(3), mapClose, mapAirport, liveFull, liveUpMs: +L.upMs.toFixed(2), liveDrawMs: +L.drawMs.toFixed(2), movers: L.movers.length, calls: L.renderer.info.render.calls, tris: L.renderer.info.render.triangles };
    await __snap('frames-38'); S.paused = true;`,
  // frame times: the live view small over the capital's airport, then full screen over a raid
  frames: `
    const S = await game('sandbox', 11);
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light'));
    const ap = S.byId.i0; IC.cam.fly = null; IC.cam.z = 6; IC.centerOn(ap.x, ap.y);
    S.paused = false; S.speed = 1; await wait(1500);
    const mapOnly = await frameTimes(90);
    const L = IC.liveOpen(S, m); for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    await wait(3000); const small = await frameTimes(90);
    window.__perf = { mapOnly, liveSmall: small, liveUpMs: +L.upMs.toFixed(2), liveDrawMs: +L.drawMs.toFixed(2), movers: L.movers.length, calls: L.renderer.info.render.calls, tris: L.renderer.info.render.triangles };
    S.paused = true;`
};

(async () => {
  const args = process.argv.slice(2), oi = args.indexOf('--out'), outDir = oi >= 0 ? args[oi + 1] : 'after';
  const want = args.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));
  const names = want.length ? want : Object.keys(SCENES).filter(k => !/^frames/.test(k) && k !== 'video' && k !== 'movie' && !/^flicker/.test(k));
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: alt }, opt, gpu)); }
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  const dir = path.resolve(__dirname, '../shots', outDir); fs.mkdirSync(dir, { recursive: true });
  let bad = 0;
  for (const name of names) {
    const vid = name === 'video';
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true }, vid ? { recordVideo: { dir, size: { width: 1280, height: 800 } } } : {}));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 600)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    if (process.env.VIDEO_MS) await page.addInitScript(ms => { window.VIDEO_MS = ms; }, process.env.VIDEO_MS);
    let ff = null;
    if (name === 'movie') {
      // the frames go one after another into one file of JPEGs, which ffmpeg reads as a stream when they are done
      ff = path.join(dir, '3d-live.mjpeg'); fs.writeFileSync(ff, '');
      await page.exposeFunction('__frame', b64 => fs.appendFileSync(ff, Buffer.from(b64, 'base64')));
    }
    for (const k of ['MODELS', 'YAW', 'PITCH', 'DIST', 'PICK']) if (process.env[k]) await page.addInitScript(([n, v]) => { window[n] = v; }, [k, process.env[k]]);
    if (process.env.MOVIE_FRAMES) await page.addInitScript(n => { window.MOVIE_FRAMES = n; }, process.env.MOVIE_FRAMES);
    await page.exposeFunction('__snap', async n => { const out = path.join(dir, `3d-${n}.png`); await page.screenshot({ path: out, timeout: 180000 }); console.log('saved', out); });
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    try { await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${SCENES[name]} })()`); } catch (e) { errors.push(e.message.split('\n')[0]); }
    if (ff) {
      const out = path.join(dir, '3d-live.webm'), ffmpeg = process.env.FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
      require('child_process').execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', ff, '-c:v', 'libvpx', '-b:v', '3M', '-auto-alt-ref', '0', out], { stdio: 'ignore' });
      fs.unlinkSync(ff); console.log('saved', out);
    }
    if (/^frames/.test(name) || /^flicker/.test(name)) console.log('perf', JSON.stringify(await page.evaluate(() => window.__perf)));
    if (errors.length) { bad++; console.log(name, 'errors:\n  ' + errors.join('\n  ')); }
    await page.close(); await ctx.close();
    if (vid) { const v = await page.video(); if (v) { const p = await v.path(); fs.renameSync(p, path.join(dir, '3d-live.webm')); console.log('saved', path.join(dir, '3d-live.webm')); } }
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
