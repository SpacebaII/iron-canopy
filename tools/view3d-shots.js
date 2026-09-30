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
/* brief 40's moments: the weather held, the picture filmed frame by frame from the view's own canvas (16:9, cut
   from its middle), labels off; a still where the moment peaks */
function wx(S, k) { const w = S.weather; if (!w) return; w.kind = w.prev = k; w.fade = 1; w.next = S.time + 864000; w.hold = true; if (IC.WEATHER[k]) IC.emit(S, 'weather', k); }
const CLIP = { w: 960, h: 540 };
function grab(V, w, h) {
  const src = V.renderer.domElement, sw = src.width, sh = src.height, k = Math.min(sw / w, sh / h), cw = w * k, ch = h * k;
  const cv = grab.cv || (grab.cv = document.createElement('canvas')); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  return cv;
}
async function film(V, S, name, N, speed, hook) {
  window.requestAnimationFrame = () => 0;   // the frames are made here, one by one
  V.labels = false; V.trails = false; for (const m of V.movers) m.label.hidden = true;
  const pn = V.$('panel'); if (pn) pn.style.display = 'none';
  let now = film.now || (film.now = performance.now()), acc = 0, stillAt = null;
  for (let f = 0; f < N; f++) {
    if (S && V.kind === 'live') { acc += speed / 30; while (acc >= 0.25) { IC.step(S, 0.25); acc -= 0.25; } }
    const r = hook ? await hook(f) : null;
    IC.replayStep(V, now += 1000 / 30); film.now = now;
    if (film.after) film.after(f);
    if (film.stop && film.stop()) { film.stop = null; N = f + 1; }
    // both pictures straight after the frame is drawn: once the page yields, the drawing buffer is gone
    const still = r === 'still' || (f === N - 1 && !film.took) ? grab(V, 1280, 720).toDataURL('image/jpeg', 0.93).slice(23) : null;
    const clip = window.CLIPS ? grab(V, CLIP.w, CLIP.h).toDataURL('image/jpeg', 0.9).slice(23) : null;
    if (clip) await __frame(name, clip);
    if (still) { film.took = true; await __still(name, still); }
    if (f % 60 === 0) console.log(name, 'frame', f, U.hhmm(S ? S.time : V.t));
  }
  film.took = false;
}
function cam(V, c) { const s = V.el.querySelector('[data-rp=cam]'); if (s) { s.value = c; s.dispatchEvent(new Event('change', { bubbles: true })); } }
if (window.QUALITY) try { localStorage.setItem('ic-3d', window.QUALITY); } catch (e) { /* file page */ }
/* brief 41: the live view on a place (no track to follow: the orbit camera is set by hand), and clips made frame by
   frame (the game stepped between frames, speed game seconds a video second; labels drawn in) */
async function liveAt(S, x, y) {
  const L = IC.liveOpen(S, { x, y, name: 'here' });
  for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
  L.el.querySelector('[data-rp=full]').click(); camTo(L, 'orbit'); L.follow = null; await wait(1500);
  return L;
}
function orbitAt(L, x, y, yaw, pitch, dist, h) { L.follow = null; Object.assign(L.orbit, { tx: x - L.cx, tz: y - L.cy, ty: (h || 0) + (L.flat && L.flat.length ? L.flat[0].e * L.hk : 0), yaw, pitch, dist }); }
function clipStart(L, labels) {
  window.requestAnimationFrame = () => 0;
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  L.rec = { cv, g: cv.getContext('2d'), o: { w: 960, h: 540, labels: labels !== false } };
  return { L, cv, now: performance.now(), acc: 0, f: 0 };
}
/* one video frame: the game runs speed game seconds a video second (0: paused), the view draws, the frame is kept */
async function clipFrame(C, S, speed, before) {
  C.acc += (speed || 0) / 30; while (C.acc >= 0.25) { IC.step(S, 0.25); C.acc -= 0.25; }
  if (before) before(C);
  C.L.lod = 0;   // full detail: software drawing is slow, the view would otherwise drop its costly effects
  IC.replayStep(C.L, C.now += 1000 / 30);
  await __frame(C.cv.toDataURL('image/jpeg', 0.9).slice(23));
  C.f++; if (C.f % 150 === 0) console.log('frame', C.f, 'game', U.hhmm(S.time));
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
  // brief 40: the six moments, filmed frame by frame (CLIPS=1 makes the clips; the still is taken where it peaks)
  'm-takeoff': `
    const S = await game('sandbox', 11.6); wx(S, 'clear');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'roll' && m.spd < 0.05 && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('no take-off roll'); console.log('take-off at', U.hhmm(S.time));
    const L = await live(S, m, 'chase', 800); L.camK = 1.3; let shot = 0;
    await film(L, S, 'm-takeoff', +(window.FRAMES || 360), 3, f => { if (f === 150) { cam(L, 'side'); L.camK = 0.5; } if (!shot && m.phase !== 'roll' && f > 150) { shot = 1; return 'still'; } });`,
  'm-landing': `
    const S = await game('sandbox', 18.6); wx(S, 'scattered');
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.t > 20 && m.type !== 'light'));
    if (!m) throw new Error('no arrival on final'); console.log('landing at', U.hhmm(S.time));
    const L = await live(S, m, 'side', 800); L.camK = 1.2; let shot = 0;
    await film(L, S, 'm-landing', +(window.FRAMES || 330), 2, f => { if (f === 200) cam(L, 'chase'); if (!shot && m.phase !== 'final' && f > 20) { shot = 1; return 'still'; } });`,
  'm-night-rain': `
    const S = await game('sandbox', 21.7); wx(S, 'rain');
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.t > 20 && m.type !== 'light'));
    if (!m) throw new Error('no arrival on final'); console.log('night arrival at', U.hhmm(S.time));
    const L = await live(S, m, 'chase', 800); L.camK = 1.0; let shot = 0;
    await film(L, S, 'm-night-rain', +(window.FRAMES || 300), 2, f => { if (f === 180) { cam(L, 'side'); L.camK = 0.6; } if (!shot && m.phase !== 'final' && f > 20) { shot = 1; return 'still'; } });`,
  'm-fog': `
    const S = await game('sandbox', 6.9); wx(S, 'fog');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('nothing taxiing'); console.log('fog taxi at', U.hhmm(S.time));
    const L = await live(S, m, 'chase', 800); L.camK = 0.9;
    await film(L, S, 'm-fog', +(window.FRAMES || 240), 2, f => { if (f === 120) { cam(L, 'side'); L.camK = 0.35; } if (f === 200) return 'still'; });`,
  'm-snow': `
    const S = await game('sandbox', 10.5); wx(S, 'snow');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    if (!m) throw new Error('nothing taxiing'); console.log('snow taxi at', U.hhmm(S.time));
    const L = await live(S, m, 'side', 800); L.camK = 1.5;
    await film(L, S, 'm-snow', +(window.FRAMES || 240), 2, f => { if (f === 90) cam(L, 'chase'); if (f === 60) return 'still'; });`,
  'm-intercept': `
    Math.random = seeded(11); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    S.time = Math.floor(S.time / 86400) * 86400 + 15.5 * 3600; wx(S, 'scattered');
    const T = S.range.target;
    IC.rangeAddUnit(S, 'mrsam', T.x - 30, T.y); IC.rangeAddUnit(S, 'lr3d', T.x - 60, T.y + 20);
    IC.rangeSpawn(S, { what: 'str', n: 2, brg: 80, km: 90, alt: 4 });
    let kill = null; steps(S, 900, S => (kill = S.rec.ev.find(e => e.kind === 'kill' || e.kind === 'intercept' || (e.kind === 'mstat' && e.what === 'hit'))));
    if (!kill) throw new Error('no intercept');
    const ms = S.rec.tracks.filter(t => t.kind === 'missile' && IC.recFirstT(t) < kill.t);
    const mis = ms.find(t => t.ref === kill.mref) || ms.filter(t => t.meta.tref === kill.tref).pop() || ms.pop();
    if (!mis) throw new Error('no missile before the hit: ' + JSON.stringify(kill).slice(0, 200));
    const tl = IC.recFirstT(mis); console.log('launch at', U.hhmm(tl), 'hit at', U.hhmm(kill.t));
    const tg = S.rec.of.get(mis.meta.tref) || mis;
    // the director follows the missile from the launch to the hit; the clip ends a few seconds after it
    const V = await replay({ follow: mis.ref, x: kill.x, y: kill.y, t: tl - 2, r: 150, cam: 'auto' }, tl - 2);
    V.slowmo = true; V.playing = true; V.speed = 2; let shot = 0;
    const N = +(window.FRAMES || 900); film.stop = () => V.t > kill.t + 3.5;
    await film(V, null, 'm-intercept', N, 1, f => { if (!shot && V.t > kill.t + 0.25) { shot = 1; return 'still'; } });`,
  // the same frame with the fog, then the sky's light, switched off: what each does to the colours
  'm-debug': `
    const S = await game('sandbox', 11); wx(S, 'scattered');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light' && !m.mil));
    const L = await live(S, m, 'chase', 600); L.camK = +(window.K || 1.2);
    const px = () => { const c = grab(L, 64, 36), d = c.getContext('2d').getImageData(0, 0, 64, 36).data; const at = (x, y) => [d[(y * 64 + x) * 4], d[(y * 64 + x) * 4 + 1], d[(y * 64 + x) * 4 + 2]]; return [at(8, 33), at(32, 30), at(50, 22), at(32, 3)]; };
    film.after = f => { if (f === 9) console.log('pixels near, mid, far, sky', JSON.stringify(px()), JSON.stringify(IC.fx3d.debug)); };
    await film(L, S, 'dbg-a', 10, 1, f => f === 9 ? 'still' : null);
    IC.fx3d.debug.fog = 0; await film(L, S, 'dbg-b', 10, 1, f => f === 9 ? 'still' : null);
    IC.fx3d.debug.env = 0; await film(L, S, 'dbg-c', 10, 1, f => f === 9 ? 'still' : null);
    IC.fx3d.debug.fog = 1; IC.fx3d.debug.env = 1; IC.fx3d.debug.post = 0; await film(L, S, 'dbg-d', 10, 1, f => f === 9 ? 'still' : null);`,
  // what the bright spots are: the snow frame, then with every point sprite hidden, then every glowing material hidden
  'm-spots': `
    const S = await game('sandbox', 10.5); wx(S, 'snow');
    const m = steps(S, 3600, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && (m.type === 'narrow' || m.type === 'wide') && !m.mil));
    const L = await live(S, m, 'side', 800); L.camK = 1.5;
    await film(L, S, 'spots-a', 20, 1, f => f === 19 ? 'still' : null);
    const hide = fn => L.scene.traverse(o => { if (fn(o)) o.visible = false; });
    // the brightest pixel near the horizon, then each object hidden in turn until it goes dark
    let spot = null, res = [];
    film.after = () => { const c = grab(L, 320, 180), d = c.getContext('2d').getImageData(0, 0, 320, 180).data; let best = 0; for (let y = 40; y < 120; y++) for (let x = 0; x < 320; x++) { const i = (y * 320 + x) * 4, l = d[i] + d[i + 1] + d[i + 2]; if (l > best) { best = l; spot = [x, y, l]; } } };
    await film(L, S, 'spots-x', 2, 1);
    const lum = () => { const c = grab(L, 320, 180), d = c.getContext('2d').getImageData(spot[0], spot[1], 1, 1).data; return d[0] + d[1] + d[2]; };
    let now = performance.now() + 1e6;
    const tryIt = (name, on, off) => { on(); IC.replayStep(L, now += 33); IC.replayStep(L, now += 33); const l = lum(); off(); IC.replayStep(L, now += 33); console.log('spot test', name, l); };
    tryIt('no fog', () => { IC.fx3d.debug.fog = 0; }, () => { IC.fx3d.debug.fog = 1; });
    tryIt('overcast look', () => IC.fx3d.look(L, { weather: 'overcast' }), () => IC.fx3d.look(L, { weather: null }));
    tryIt('no env', () => { IC.fx3d.debug.env = 0; }, () => { IC.fx3d.debug.env = 1; });
    tryIt('no post', () => { IC.fx3d.debug.post = 0; }, () => { IC.fx3d.debug.post = 1; });
    tryIt('no shadows', () => { L.renderer.shadowMap.enabled = false; }, () => { L.renderer.shadowMap.enabled = true; });
    const objs = window.CULPRITS ? [] : []; L.scene.traverse(o => { if (window.CULPRITS && (o.isMesh || o.isPoints || o.isLine)) objs.push(o); });
    for (const o of objs) { if (!o.visible) continue; o.visible = false; IC.replayStep(L, now += 33); const l = lum(); o.visible = true; if (l < spot[2] - 120) res.push([o.type, o.material && o.material.type, o.renderOrder, o.parent && o.parent.type, o.material && o.material.userData && Object.keys(o.material.userData).join('|'), l]); }
    console.log('spot', JSON.stringify(spot), 'culprits', JSON.stringify(res.slice(0, 10)), objs.length);
    IC.fx3d.debug.post = 0; await film(L, S, 'spots-b', 3, 1, f => f === 2 ? 'still' : null); IC.fx3d.debug.post = 1;
    const Q = L.fxs.Q; Q.ao = Q.dof = Q.mblur = 0; await film(L, S, 'spots-c', 3, 1, f => f === 2 ? 'still' : null);
    Q.bloom = 0; await film(L, S, 'spots-d', 3, 1, f => f === 2 ? 'still' : null);
    return;
    film.after = () => hide(o => o.isInstancedMesh);
    await film(L, S, 'spots-c', 3, 1, f => f === 2 ? 'still' : null);
    film.after = () => hide(o => o.material && o.material.userData && o.material.userData.fxWin || o.material === IC.R3D.solidMat());
    await film(L, S, 'spots-d', 3, 1, f => f === 2 ? 'still' : null);
    const list = []; L.scene.traverse(o => { if (o.isPoints && o.visible !== undefined) list.push((o.material && o.material.type) + ':' + (o.material && o.material.userData && o.material.userData.glow) + ':' + (o.parent && o.parent.type) + ':' + (o.geometry && o.geometry.drawRange.count)); });
    console.log('points', list.length, JSON.stringify(list.slice(0, 40)));`,
  // for tuning the look: HOUR, WX, CAM, K (camera distance), WHAT (taxi, roll, final, gate) from the environment
  'm-probe': `
    const S = await game('sandbox', +(window.HOUR || 11)); wx(S, window.WX || 'scattered');
    const what = window.WHAT || 'taxi';
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === what && (what !== 'taxi' || m.kind === 'dep') && (what !== 'final' || m.t > 20) && m.type !== 'light' && !m.mil));
    if (!m) throw new Error('nothing ' + what);
    const L = await live(S, m, window.CAM || 'chase', 600); L.camK = +(window.K || 1.4);
    await film(L, S, window.NAME || 'm-probe', +(window.FRAMES || 40), 1, f => { if (f === +(window.FRAMES || 40) - 1) { const F = L.fxs; console.log('fx', F && JSON.stringify({ q: F.q, expo: F.expo, night: F.night, sun: F.sunDir, wet: F.wet, W: F.W, fog: [IC.fx3d && 0] })); if (window.PADPX && F.grassU && F.grassU.pad.value) { const u = F.grassU, im = u.pad.value.image, b = u.padBox.value, c = u.camAt.value, out = []; for (const [dx, dz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) { const x = ((c.x + dx - b.x) / b.z) * im.width, y = ((c.z + dz - b.y) / b.z) * im.height; out.push([Math.round(x), Math.round(y), Array.from(im.getContext('2d').getImageData(x | 0, y | 0, 1, 1).data)]); } console.log('pad under the grass', F.grass && F.grass.visible, JSON.stringify(out)); } return 'still'; } });`,
  // brief 40: frame times per preset, the live view full screen following an airliner at the capital (VIEWPORT=1920x1080)
  'frames-40': `
    const S = await game('sandbox', 11); wx(S, 'scattered');
    const m = steps(S, 1800, S => findMove(S, m => m.phase === 'taxi' && m.kind === 'dep' && m.type !== 'light'));
    const L = IC.liveOpen(S, m); for (let i = 0; i < 150 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    L.el.querySelector('[data-rp=full]').click(); S.paused = false; S.speed = 1; await wait(2500);
    const out = { gpu: IC.fx3d.gpuName(), size: [L.renderer.domElement.width, L.renderer.domElement.height] };
    for (const q of ['low', 'medium', 'high', 'ultra']) {
      IC.q3d.set(q); await wait(2500);
      const ft = await frameTimes(+(window.N || 40));
      out[q] = Object.assign(ft, { fps: +(1000 / ft.med).toFixed(1), upMs: +L.upMs.toFixed(2), fxMs: +IC.fx3d.state(L).cpuMs.toFixed(3), carMs: +(L.fxs.carMs || 0).toFixed(3), drawMs: +L.drawMs.toFixed(2), px: [L.renderer.domElement.width, L.renderer.domElement.height], calls: L.renderer.info.render.calls, tris: L.renderer.info.render.triangles });
      console.log(q, JSON.stringify(out[q]));
    }
    window.__perf = out; S.paused = true;`,
  // brief 41, stills to look at: a jet at a bridge with its vehicles; spoilers, reversers and tyre smoke; the gear
  // coming up; a fighter's controls
  'life-stills': `
    const S = await game('sandbox', 11);
    const q = steps(S, 3 * 3600, S => S.rec && S.rec.turns.find(q => q.kind === (window.KIND || 'bridge') && q.len > 0.3 && q.t1 == null && S.time - q.t0 > 400));
    if (!q) throw new Error('no turnaround at a bridge');
    console.log('turn', q.kind, q.type, q.cs, Math.round(S.time - q.t0), 's in of', q.dur);
    const L = await liveAt(S, q.x, q.y);
    orbitAt(L, q.x, q.y, q.a + 2.2, 0.32, 0.9); await wait(2500); await __snap('life-gate');
    orbitAt(L, q.x, q.y, q.a - 1.2, 0.25, 0.7); await wait(2500); await __snap('life-gate-2');
    orbitAt(L, q.x, q.y, q.a + 3.14, 0.9, 1.6); await wait(2500); await __snap('life-gate-3');
    console.log('stats', JSON.stringify(IC.life3d.stats(L)));`,
  'life-land': `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.t > 30 && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('no jet on final');
    const L = await live(S, m, 'side', 1500); S.paused = false;
    await new Promise(r => { const f = () => { if (m.phase === 'land' || m.dead) r(); else setTimeout(f, 30); }; f(); });
    await wait(+(window.AFTER || 250)); S.paused = true; L.camK = +(window.K || 0.45); await wait(1500); await __snap('life-land');
    const F = L.follow; if (F) console.log('pose', JSON.stringify({ now: S.time, vt: L.t, t1: F.tr.t1, marks: F.tr.marks, last: [0, 1, 2, 3, 4, 5].map(i => [IC.recGet(F.tr, F.tr.n - 1 - i, 0), IC.recGet(F.tr, F.tr.n - 1 - i, 8)]), mphase: m.phase, same: F.tr === S.rec.of.get(m), ph: F.st.phase, spoil: F.st.spoil, rev: F.st.rev, n1: F.st.n1, lod: F.lod, life: F.life && { spoil: F.life.spoil, rev: F.life.rev, n1: F.life.n1 }, anims: F.anims.map(A => A.a.name + ':' + A.node.visible + ':' + (A.node.parent && A.node.parent.type)) }));
    camTo(L, 'chase'); L.camK = 0.6; await wait(2000); await __snap('life-land-2');`,
  // close round a jet just after touchdown: spoilers, reversers, tyre smoke (the game stepped by hand)
  'life-rollout': `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.alt < 0.1 && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('no jet on final');
    const L = await live(S, m, 'orbit', 600);
    const C = clipStart(L); let td = null;
    for (let f = 0; f < 600; f++) { if (td == null && m.phase === 'land') td = f; if (td != null && f > td + (+(window.AFTER) || 90)) break; C.acc += 1 / 30; while (C.acc >= 0.25) { IC.step(S, 0.25); C.acc -= 0.25; } L.lod = 0; Object.assign(L.orbit, { yaw: +(window.YAW || 2.2), pitch: +(window.PITCH || 0.35), dist: +(window.DIST || 0.55) }); IC.replayStep(L, C.now += 33); }
    L.lod = 0; IC.replayStep(L, C.now += 33);
    const F = L.follow; console.log('pose', JSON.stringify({ ph: F.st.phase, spoil: F.st.spoil, rev: F.st.rev, life: { spoil: F.life.spoil, rev: F.life.rev }, vis: F.anims.filter(A => /spoil|rev/.test(A.a.name)).map(A => A.a.name + A.node.visible) }));
    await __snap('life-rollout');`,
  'life-takeoff': `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'roll' && m.spd > 0.5 && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('no take-off roll');
    const L = await live(S, m, 'side', 1200); S.paused = false; L.camK = 0.5;
    await wait(+(window.AFTER || 900)); S.paused = true; await wait(1500); await __snap('life-takeoff');`,
  // brief 41's clips, made frame by frame (960 × 540, 30 fps, labels drawn in). N limits the frames (a trial run)
  // a landing: the flare, the touchdown with tyre smoke, spoilers up, reversers out and stowed, the rollout
  'clip-landing': `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => m.phase === 'final' && m.alt < 0.14 && m.alt > 0.1 && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('no jet on final');
    const L = await live(S, m, 'side', 600); L.camK = 0.55;
    const C = clipStart(L), N = +(window.N || 1350); let td = null, yaw = 2.9;
    for (let f = 0; f < N; f++) await clipFrame(C, S, 1, () => {
      if (td == null && m.phase !== 'final') td = f;
      // close round it from just after touchdown: the spoilers up, the reversers out and stowed again
      if (td != null && f === td + 25) { camTo(L, 'orbit'); }
      if (td != null && f > td + 25) { yaw -= 0.0018; Object.assign(L.orbit, { yaw, pitch: 0.3, dist: 0.62 }); }
    });
    await __snap('clip-landing-last');`,
  // a take-off: lining up, the roll, rotation, lift-off, the gear folding nose first, the climb-out
  'clip-takeoff': `
    const S = await game('sandbox', 11);
    const m = steps(S, 3 * 3600, S => findMove(S, m => (m.phase === 'lineup' || m.phase === 'wait') && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('nothing lining up');
    const L = await live(S, m, 'chase', 600); L.camK = 0.7; L.orbit.yaw = 2.0;
    const C = clipStart(L), N = +(window.N || 1400); let roll = null, air = null;
    // standing at the line-up, time runs faster: the clip is the roll and the climb
    for (let f = 0; f < N; f++) await clipFrame(C, S, m.spd < 0.01 && air == null ? 6 : roll != null && air == null ? 1.4 : 1, () => {
      if (roll == null && m.phase === 'roll') { roll = f; camTo(L, 'side'); L.camK = 0.5; }
      if (air == null && roll != null && (m.dead || m.phase !== 'roll')) air = f;
      // off the ground: from below and to the side, the gear folding away nose first; then behind it
      if (air != null && f === air + 20) { camTo(L, 'orbit'); Object.assign(L.orbit, { pitch: -0.12, dist: 0.7 }); }
      if (air != null && f > air + 20 && f < air + 420) Object.assign(L.orbit, { yaw: L.orbit.yaw + 0.002, pitch: -0.12, dist: 0.7 });
      if (air != null && f === air + 420) { camTo(L, 'chase'); L.camK = 0.9; }
    });
    await __snap('clip-takeoff-last');`,
  // a full turnaround at a gate: the arrival, the jet bridge out to the door, the vehicles by the turnaround's clock
  // (the service time-lapsed), the bridge back, the tug, the pushback
  'clip-turnaround': `
    const S = await game('sandbox', 11);
    const m = steps(S, 4 * 3600, S => findMove(S, m => m.phase === 'rollout' && m.stand && m.stand.contact && (m.type === 'narrow' || m.type === 'wide')));
    if (!m) throw new Error('no jet landing for a gate');
    const st = m.stand, tl = m.tail; console.log('arrival', m.who, m.type, 'to', st.id);
    const L = await live(S, m, 'chase', 600); L.camK = 1.5;
    const C = clipStart(L), N = +(window.N || 3300); let ph = 'taxi', f0 = 0, dep = null, q = null, yaw = st.a + 2.4;
    for (let f = 0; f < N; f++) {
      let speed = 8;
      if (ph === 'taxi' && tl.where === 'stand') { ph = 'turn'; f0 = f; L.focusRef = { x: st.x, y: st.y, name: 'gate' }; camTo(L, 'orbit'); L.follow = null; q = S.rec.turns.find(x => x.tail === tl.id && x.t1 == null); }
      if (ph === 'turn') {
        // the bridge out at the pace it moves, the service time-lapsed, the bridge back and the tug slower again
        const tt = q ? S.time - q.t0 : 0, left = q ? q.t0 + q.dur - S.time : 0;
        speed = tt < 130 ? 7 : left > 330 ? 120 : left > -30 ? 16 : 45;
        yaw += speed > 40 ? 0.0035 : 0.0012; orbitAt(L, st.x, st.y, yaw, 0.3, 0.95);
        dep = findMove(S, x => x.tail === tl && x.phase === 'push');
        if (dep) { ph = 'push'; f0 = f; IC.liveOpen(S, dep); L.follow = null; camTo(L, 'orbit'); }
      }
      if (ph === 'push') { speed = 3; if (L.follow) { L.orbit.yaw += 0.002; L.orbit.pitch = 0.3; L.orbit.dist = 1.0; } if (f - f0 > 480) break; }
      await clipFrame(C, S, speed);
    }
    await __snap('clip-turnaround-last');`,
  // the capital's airport at night: a slow orbit over the lights, then an aircraft taxiing out past the stop bars
  'clip-night': `
    const S = await game('sandbox', 21.3);
    const ap = S.byId.i0; steps(S, 600);
    const L = await liveAt(S, ap.x, ap.y);
    const C = clipStart(L), N = +(window.N || 900); let yaw = 0.6, m = null;
    for (let f = 0; f < N; f++) {
      if (f < 420) { yaw += 0.0022; orbitAt(L, ap.x, ap.y, yaw, 0.2 - f * 0.0002, 30 - f * 0.035); }
      if (f === 420) { m = findMove(S, x => x.phase === 'taxi' && x.kind === 'dep' && x.type !== 'light' && !x.mil) || findMove(S, x => x.phase === 'taxi' && x.type !== 'light'); if (m) { IC.liveOpen(S, m); camTo(L, 'chase'); L.camK = 2.2; } }
      await clipFrame(C, S, f < 420 ? 4 : 1.5);
    }
    await __snap('clip-night-last');`,
  // a long-range battery fires: the launcher up, the flash and the dust, the smoke column, the booster falling away
  'clip-launch': `
    Math.random = seeded(3); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const T = S.range.target;
    IC.rangeAddUnit(S, 'lrsam', T.x - 30, T.y); IC.rangeAddUnit(S, 'lr3d', T.x - 40, T.y + 20);
    IC.rangeSpawn(S, { what: 'str', n: 3, brg: 90, km: 160, alt: '' });
    let tr = null; steps(S, 600, S => (tr = S.rec.tracks.find(t => t.kind === 'missile' && t.meta.mun === 'LR')) && S.time > IC.recFirstT(tr) + 40);
    if (!tr) throw new Error('no long-range shot');
    const u = S.units.find(x => x.type === 'lrsam'), t0 = IC.recFirstT(tr);
    const V = IC.replayOpen(S, { x: u.x, y: u.y, t: t0 - 3, r: 150, cam: 'orbit' });
    for (let i = 0; i < 150 && !(V.renderer && V.movers && V.tiles.size > 8); i++) await wait(100);
    await wait(2000); V.playing = false; V.t = t0 - 3;
    const C = clipStart(V), N = +(window.N || 1050), mv = V.moverOf.get(tr);
    let yaw = 2.6;
    for (let f = 0; f < N; f++) {
      const k = V.t - t0;
      V.t += (k < 7 ? 0.35 : 0.6) / 30;
      if (k < 1.2) { yaw += 0.0015; V.cam = 'orbit'; V.follow = null; Object.assign(V.orbit, { tx: u.x - V.cx, tz: u.y - V.cy, ty: (V.flat[0] ? V.flat[0].e : 0) * V.hk + 0.04, yaw, pitch: 0.12, dist: 1.1 }); }
      else if (k < 3.8) { if (V.cam !== 'chase') { V.follow = mv; camTo(V, 'chase'); V.camK = 3; } }
      else if (k < 14) {
        // held where the booster lets go (4.5 s after launch): the missile goes on, the booster falls away tumbling
        const sp = IC.recAt(tr, t0 - 0.25 + 4.5, {}), bp = mv.life && mv.life.bpos; V.cam = 'orbit'; V.follow = null;
        if (bp && k > 4.3) Object.assign(V.orbit, { tx: bp.x, ty: bp.y, tz: bp.z, yaw: 1.2 + k * 0.03, pitch: 0.15, dist: 0.25 });
        else if (sp) Object.assign(V.orbit, { tx: sp.x - V.cx, tz: sp.y - V.cy, ty: sp.alt * 10 * V.hk, yaw: 1.2 + k * 0.03, pitch: 0.15, dist: 0.6 });
      } else if (V.cam !== 'side') { V.follow = mv; camTo(V, 'side'); V.camK = 1.2; }
      await clipFrame(C, S, 0);
    }
    await __snap('clip-launch-last');`,
  // brief 41's frame times: the capital's airport busy at midday and at night, the live view full screen; what the
  // scene's script costs a frame, what the life of it (render3d-life.js) costs, and what is drawn
  'frames-life': `
    const out = {};
    for (const hour of [11, 21.5]) {
      const S = await game('sandbox', hour); steps(S, 1800);
      const ap = S.byId.i0, st = IC.aptStands(ap).find(s => s.occ) || ap;
      const L = await liveAt(S, st.x, st.y); orbitAt(L, st.x, st.y, 2.2, 0.35, 2.5);
      S.paused = false; S.speed = 1; await wait(4000);
      const ft = await frameTimes(60);
      const life = IC.life3d.stats(L);
      out[hour < 12 ? 'noon' : 'night'] = { frames: ft, upMs: +L.upMs.toFixed(2), drawMs: +L.drawMs.toFixed(2), lifeMs: life.ms, vehicles: life.vehicles, bridges: life.bridges, particles: life.particles, lights: life.lights, movers: L.movers.length, calls: L.renderer.info.render.calls, tris: L.renderer.info.render.triangles, px: L.renderer.domElement.width + 'x' + L.renderer.domElement.height };
      S.paused = true; IC.liveClose(); await wait(500);
    }
    window.__perf = out;`,
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
  const names = want.length ? want : Object.keys(SCENES).filter(k => !/^m-/.test(k) && !/^frames/.test(k) && k !== 'video' && k !== 'movie' && !/^flicker/.test(k) && !/^clip-/.test(k));
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
    const [vw, vh] = (process.env.VIEWPORT || process.env.VIEW || '1280x800').split('x').map(Number);
    const ctx = await browser.newContext(Object.assign({ viewport: { width: vw, height: vh }, ignoreHTTPSErrors: true }, vid ? { recordVideo: { dir, size: { width: 1280, height: 800 } } } : {}));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 600)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    if (process.env.VIDEO_MS) await page.addInitScript(ms => { window.VIDEO_MS = ms; }, process.env.VIDEO_MS);
    let ff = null;
    const clips = new Set();
    if (/^m-/.test(name)) {
      await page.exposeFunction('__frame', (n, b64) => { const f = path.join(dir, `3d-${n}.mjpeg`); if (!clips.has(n)) { clips.add(n); fs.writeFileSync(f, ''); } fs.appendFileSync(f, Buffer.from(b64, 'base64')); });
      await page.exposeFunction('__still', (n, b64) => { const out = path.join(dir, `3d-${n}.jpg`); fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('saved', out); });
      for (const k of ['CLIPS', 'FRAMES', 'QUALITY', 'HOUR', 'WX', 'CAM', 'K', 'WHAT', 'NAME', 'CULPRITS', 'PADPX']) if (process.env[k]) await page.addInitScript(([n, v]) => { window[n] = v; }, [k, process.env[k]]);
    }
    if (name === 'movie' || /^clip-/.test(name)) {
      // the frames go one after another into one file of JPEGs, which ffmpeg reads as a stream when they are done
      ff = path.join(dir, name === 'movie' ? '3d-live.mjpeg' : `3d-${name}.mjpeg`); fs.writeFileSync(ff, '');
      // KEEP=n also keeps every nth frame as a picture of its own, to look at
      const keep = +(process.env.KEEP || 0), fd = path.join(dir, `frames-${name}`); let fi = 0;
      if (keep) fs.mkdirSync(fd, { recursive: true });
      await page.exposeFunction('__frame', b64 => { const b = Buffer.from(b64, 'base64'); fs.appendFileSync(ff, b); if (keep && fi % keep === 0) fs.writeFileSync(path.join(fd, `f${String(fi).padStart(4, '0')}.jpg`), b); fi++; });
    }
    for (const k of ['MODELS', 'YAW', 'PITCH', 'DIST', 'PICK', 'KIND', 'AFTER', 'K', 'N']) if (process.env[k]) await page.addInitScript(([n, v]) => { window[n] = v; }, [k, process.env[k]]);
    if (process.env.MOVIE_FRAMES) await page.addInitScript(n => { window.MOVIE_FRAMES = n; }, process.env.MOVIE_FRAMES);
    await page.exposeFunction('__snap', async n => { const out = path.join(dir, `3d-${n}.png`); await page.screenshot({ path: out, timeout: 180000 }); console.log('saved', out); });
    await page.goto('file://' + (process.env.GAME ? path.resolve(process.env.GAME) : path.resolve(__dirname, '../iron-canopy/index.html')));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    try { await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${SCENES[name]} })()`); } catch (e) { errors.push(e.message.split('\n')[0]); }
    if (ff) {
      const out = path.join(dir, name === 'movie' ? '3d-live.webm' : `3d-${name}.webm`), ffmpeg = process.env.FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
      require('child_process').execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', ff, '-c:v', 'libvpx', '-b:v', '3M', '-auto-alt-ref', '0', out], { stdio: 'ignore' });
      fs.unlinkSync(ff); console.log('saved', out);
    }
    for (const n of clips) {
      const src = path.join(dir, `3d-${n}.mjpeg`), out = path.join(dir, `3d-${n}.webm`), ffmpeg = process.env.FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
      require('child_process').execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', src, '-c:v', 'libvpx', '-b:v', '2500k', '-auto-alt-ref', '0', out], { stdio: 'ignore' });
      fs.unlinkSync(src); console.log('saved', out);
    }
    if (/^frames/.test(name) || /^flicker/.test(name)) console.log('perf', JSON.stringify(await page.evaluate(() => window.__perf)));
    if (errors.length) { bad++; console.log(name, 'errors:\n  ' + errors.join('\n  ')); }
    await page.close(); await ctx.close();
    if (vid) { const v = await page.video(); if (v) { const p = await v.path(); fs.renameSync(p, path.join(dir, '3d-live.webm')); console.log('saved', path.join(dir, '3d-live.webm')); } }
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
