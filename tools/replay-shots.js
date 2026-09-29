/* Replay scenes for looking at the 3D window, and for timing its frames.
   Needs Playwright and three.js on disk where cdnjs is blocked (see tools/shot.js):
     npm i --no-save playwright three@0.160.0
   Usage: node tools/replay-shots.js [scene ...]
   Scenes: city (a cruise missile into the capital's towers), tankfarm (the fuel tanks of the capital's airport),
   engagement (a battery against ballistic and cruise missiles, heights ×3, trails), gallery, gallery-above, perf;
   notch (strike aircraft notching and dropping chaff against active-radar missiles), flares (heat-seekers against
   helicopters that drop flares), lrshot (a long-range shot's whole flight, its phases, chase and target cameras),
   live (the live view small over the map during a raid and full screen, with frame times), video (a WebM export).
   Frames go to shots/replay-<scene>.png (scenes with several frames add a suffix); the video to shots/replay.webm.
   `perf` prints frame times with the replay open and 30+ movers. */
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
}
/* picks a camera the way the player does, from the window's list */
function camTo(V, c) { const s = V.el.querySelector('[data-rp=cam]'); s.value = c; s.dispatchEvent(new Event('change', { bubbles: true })); }
async function at(V, t, ms) { V.t = t; V.playing = false; await wait(ms || 1500); }
/* a battery's fight against a few aircraft, run until the event wanted is recorded */
async function fight(hour, units, raid, until, sec) {
  const S = await war(hour); const c = IC.cap(S);
  const x = c.x + 60, y = c.y + 40;
  for (const [type, dx, dy] of units) unit(S, type, x + dx, y + dy);
  S.ad.roe = 'free';
  for (const [type, n, dx, dy, gap] of raid) for (let i = 0; i < n; i++) hostile(S, type, x + dx, y + dy + i * gap, { x: c.x, y: c.y });
  steps(S, sec || 500, until); steps(S, 12);
  return { S, x, y, c };
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
    window.__perf = { tiles: V.tiles.size, tileMsMax: +V.tileMsMax.toFixed(0), tileMsSum: +V.tileMsSum.toFixed(0) };
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
  // strike aircraft notch and drop chaff against a medium-range battery's active-radar missiles
  notch: `
    const { S } = await fight(13, [['mrsam', 0, 0], ['lr3d', -25, 15]], [['str', 3, 700, -80, 70]], S => S.rec.ev.some(e => e.kind === 'cm' && e.what === 'chaff'));
    const e = S.rec.ev.find(e => e.kind === 'cm' && e.what === 'chaff');
    if (!e) throw new Error('no chaff in the fight');
    const V = await replay({ follow: e.tref, x: e.x, y: e.y, t: e.t - 8, r: 160, cam: 'side' }, e.t + 1.5);
    await __snap('notch-side');
    camTo(V, 'target'); await at(V, e.t + 2.5); await __snap('notch-target');
    V.el.querySelector('[data-rp=cone]').click(); camTo(V, 'chase'); const m = S.rec.tracks.find(tr => tr.kind === 'missile' && tr.meta.tref === e.tref && tr.t0 < e.t && tr.t1 > e.t);
    if (m) { V.follow = V.moverOf.get(m); await at(V, e.t - 0.5); await __snap('notch-chase'); }`,
  // fighters close in drop flares against heat-seeking missiles (on the Test range, wave after wave until one does)
  flares: `
    Math.random = seeded(11); await IC.begin('range'); const S = IC.S; S.paused = true;
    IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const T = S.range.target;
    IC.rangeAddUnit(S, 'vshorad', T.x - 5, T.y); IC.rangeAddUnit(S, 'vshorad', T.x + 5, T.y + 5);
    let e = null;
    for (let w = 0; w < 12 && !e; w++) { IC.rangeSpawn(S, { what: 'ftr', n: 3, brg: 60 + w * 25, km: 8, alt: 1 }); steps(S, 150, S => S.rec.ev.some(e => e.kind === 'cm' && e.what === 'flare')); e = S.rec.ev.find(e => e.kind === 'cm' && e.what === 'flare'); }
    if (!e) throw new Error('no flares in twelve waves');
    steps(S, 10);
    const V = await replay({ follow: e.tref, x: e.x, y: e.y, t: e.t - 6, r: 60, cam: 'target' }, e.t + 1.2);
    await __snap('flares-target');
    camTo(V, 'side'); await at(V, e.t + 1.8); await __snap('flares-side');
    camTo(V, 'orbit'); V.follow = V.moverOf.get(S.rec.of.get(e.tref)); camTo(V, 'follow'); Object.assign(V.orbit, { dist: 1.2, pitch: 0.25 }); await at(V, e.t + 1.5); await __snap('flares-close');`,
  // a long-range shot at a strike aircraft: boost and smoke, midcourse, semi-active homing, the end
  lrshot: `
    const { S, x, y } = await fight(11, [['lrsam', 0, 0], ['lr3d', -25, 15]], [['str', 2, 1400, -200, 120]], S => S.rec.tracks.some(tr => tr.kind === 'missile' && tr.meta.mun === 'LR' && tr.t1 < S.time - 2), 900);
    const tr = S.rec.tracks.find(tr => tr.kind === 'missile' && tr.meta.mun === 'LR');
    if (!tr) throw new Error('no long-range missile flew');
    const t0 = IC.recFirstT(tr), t1 = tr.t1;
    window.__lr = { flight: +(t1 - t0).toFixed(1), from: IC.U.km(IC.U.dxy(IC.recGet(tr, 0, 1), IC.recGet(tr, 0, 2), IC.recGet(tr, tr.n - 1, 1), IC.recGet(tr, tr.n - 1, 2))) };
    const ex = IC.recGet(tr, tr.n - 1, 1), ey = IC.recGet(tr, tr.n - 1, 2);
    const V = await replay({ follow: tr.ref, x: (x + ex) / 2, y: (y + ey) / 2, t: t0 - 5, r: IC.U.dxy(x, y, ex, ey) / 2 + 60, cam: 'chase' }, t0 + 3);
    await __snap('lr-1-boost-chase');
    camTo(V, 'side'); await at(V, t0 + 6); await __snap('lr-1b-boost-side'); camTo(V, 'chase');
    camTo(V, 'side'); await at(V, t0 + (t1 - t0) * 0.45); await __snap('lr-2-midcourse-side');
    await at(V, t1 - 3); await __snap('lr-3-homing-side');
    camTo(V, 'target'); await at(V, t1 - 2); await __snap('lr-4-target');
    const hk = V.el.querySelector('[data-rp=hk]'); hk.value = '3'; hk.dispatchEvent(new Event('change', { bubbles: true }));
    camTo(V, 'side'); V.camK = 1.3; await at(V, t1 - 0.3, 3000); await __snap('lr-5-whole-flight-x3');`,
  // the live view over the map during a raid: small, then full screen; frame times of the page with it open
  live: `
    const S = await war(12); const c = IC.cap(S);
    const x = c.x + 60, y = c.y + 40;
    const b = unit(S, 'mrsam', x, y); unit(S, 'lr3d', x - 25, y + 15); unit(S, 'shorad', x + 30, y - 20); unit(S, 'lrsam', x - 40, y - 30);
    S.ad.roe = 'free';
    for (let i = 0; i < 3; i++) hostile(S, 'str', x + 700, y - 100 + i * 70, { x: c.x, y: c.y });
    for (let i = 0; i < 16; i++) hostile(S, i % 2 ? 'lacm' : 'owa', x + 500 + (i % 4) * 40, y - 200 + i * 20, { x: c.x, y: c.y });
    steps(S, 60);
    IC.cam.fly = null; IC.cam.z = 0.9; IC.centerOn(x + 150, y);
    const frames = async n => { const ts = []; let last = performance.now(); await new Promise(res => { const f = now => { ts.push(now - last); last = now; if (ts.length < n) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); ts.sort((a, b) => a - b); return { med: +ts[n >> 1].toFixed(1), p95: +ts[Math.floor(n * 0.95)].toFixed(1) }; };
    S.paused = false; S.speed = 1;
    await wait(500); const closed = await frames(120);
    IC.S.sel = b; IC.liveOpen(S, b);
    const L = IC.liveState(); for (let i = 0; i < 100 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    await wait(4000);
    const open = await frames(120);
    S.paused = true; await wait(600);
    await __snap('live-small');
    window.__perf = { mapOnly: closed, withLive: open, liveUpdateMs: +L.upMs.toFixed(2), liveDrawSubmitMs: +L.drawMs.toFixed(2), tileMs: +(L.tileMs || 0).toFixed(1), movers: L.movers.length, calls: L.renderer.info.render.calls, tris: L.renderer.info.render.triangles };
    S.paused = false; await wait(3000); S.paused = true;
    L.el.querySelector('[data-rp=full]').click(); await wait(2500);
    await __snap('live-full');`,
  // a few seconds of the replay recorded to a WebM file
  video: `
    const { S } = await fight(13, [['mrsam', 0, 0], ['lr3d', -25, 15]], [['str', 3, 700, -80, 70]], S => S.rec.ev.some(e => e.kind === 'cm' && e.what === 'chaff'));
    const e = S.rec.ev.find(e => e.kind === 'cm' && e.what === 'chaff');
    const V = await replay({ follow: e.tref, x: e.x, y: e.y, t: e.t - 14, r: 160, cam: 'auto' }, e.t - 14);
    V.speed = 1; IC.replayVideoStart({ w: 960, h: 540, labels: true });
    await wait(+(window.VIDEO_MS || 20000));
    await IC.replayVideoStop();
    const buf = new Uint8Array(await IC.replayVideo.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    await __save('replay.webm', btoa(bin));
    await __snap('video-last-frame');`,
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
    if (process.env.DBG) page.on('console', m => console.log('page:', m.text().slice(0, 600)));
    if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    if (process.env.DBG) await page.addInitScript(() => { window.DBG = 1; });
    if (process.env.VIDEO_MS) await page.addInitScript(ms => { window.VIDEO_MS = ms; }, process.env.VIDEO_MS);
    await page.exposeFunction('__snap', async n => { const out = path.resolve(__dirname, `../shots/replay-${n}.png`); await page.screenshot({ path: out, timeout: 180000 }); console.log('saved', out); });
    await page.exposeFunction('__save', async (n, b64) => { const out = path.resolve(__dirname, `../shots/${n}`); fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('saved', out, fs.statSync(out).size, 'bytes'); });
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    await page.evaluate(`(async () => { const U = IC.U; ${LIB} ${SCENES[name]} })()`);
    if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => window.__dbg)));
    if (name === 'perf' || name === 'live' || name === 'engagement') console.log('perf', JSON.stringify(await page.evaluate(() => window.__perf)));
    if (name === 'lrshot') console.log('long-range shot', JSON.stringify(await page.evaluate(() => window.__lr)));
    if (name === 'perf' || /^(notch|flares|lrshot|live|video)$/.test(name)) { /* frames saved by the scene */ }
    else { const out = path.resolve(__dirname, `../shots/replay-${name}.png`); await page.screenshot({ path: out, timeout: 180000 }); console.log('saved', out); }
    if (errors.length) { bad++; console.log(name, 'page errors:\n  ' + errors.join('\n  ')); }
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
