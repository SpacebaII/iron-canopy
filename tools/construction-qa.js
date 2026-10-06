/* The construction QA pass (brief 47): every build-bar tool at four zooms, placed, cancelled, built, watched through
   its stages, used, bulldozed and undone, in the real page with its interface; and the fuel farm, fire station and
   tower at work. Each scene saves docs/tasks/47-screens/<scene>.png.
     node tools/construction-qa.js [words]      only the scenes whose name contains one of the words
     node tools/construction-qa.js --list       the scenes
   Needs Playwright (npm i --no-save playwright; a preinstalled Chromium at /opt/pw-browsers/chromium is used when
   Playwright's own is missing). Prints each file and any page error. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const OUT = path.resolve(__dirname, '../docs/tasks/47-screens');
const args = process.argv.slice(2), words = args.filter(a => !a.startsWith('--'));

/* helpers in the page: a Career capital ready to build on, the camera, finishing works, a click as the player
   makes it (through the same input as the mouse), and the tips out of the way */
const LIB = `
window.QA = {
  career(seed, hour) {
    const S = IC.newGame({ seed: seed || 12345, mode: 'story', preset: 'network', hour: hour == null ? 11 : hour });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1', 'arsenal', 'build']) try { IC.hint.skipTour(k); } catch (e) {}
    IC.ui.cineShown = 1e9; S.paused = true; S.weather.hold = true; S.budget = 2e4;
    for (const e of S.story ? S.story.events.slice() : []) try { IC.storyChoose(S, e.id, 0); } catch (err) {}
    return S;
  },
  cap() { return IC.S.byId[IC.S.story.cap]; },
  P(ap, x, y) { return IC.aptLocal(ap, x, y); },
  look(p, z) { QA.want = { x: p.x, y: p.y, z }; QA.aim(); },
  aim() { const w = QA.want; if (!w) return; IC.cam.fly = null; IC.cam.z = w.z; IC.centerOn(w.x, w.y); },
  finish(ap) { for (let i = 0; i < 60 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(IC.S, 0.1); } ap.dirty = true; IC.aptStats(IC.S, ap); },
  tool(ap, t) { IC.select({ kind: 'infra', ref: ap }); IC.bbOpen && IC.bbOpen(true); IC.S.mode2 = IC.bldMode(IC.S, ap, t); IC.ui.refresh(true); return IC.S.mode2; },
  click(p, btn) { IC.S.hover = { x: p.x, y: p.y }; const r = IC.clickWorld({ x: p.x, y: p.y }, btn || 0); IC.ui.refresh(true); return r; },
  hover(p) { IC.S.hover = { x: p.x, y: p.y }; IC.ui.refresh(true); },
  run(sec) { const S = IC.S; for (let t = 0; t < sec; t += 0.5) IC.step(S, 0.5); IC.ui.refresh(true); },
  /* the 3D replay round a point of the airport: orbit camera, yaw and pitch in radians, dist in units */
  async view3d(p, dist, yaw, pitch) {
    const S = IC.S, wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4 * 240; i++) IC.step(S, 0.25);
    const V = IC.replayOpen(S, { x: p.x, y: p.y, t: S.time - 5, r: 60 });
    for (let i = 0; i < 200 && !(V.renderer && V.movers); i++) await wait(100);
    V.t = S.time - 2;
    const sel = V.el.querySelector('[data-rp=cam]'); if (sel) { sel.value = 'orbit'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    Object.assign(V.orbit, { yaw, pitch, dist, tx: 0, tz: 0 });
    await wait(5000);
  },
  close3d() { if (IC.replayClose) IC.replayClose(); const e = document.querySelector('.replay'); if (e) e.remove(); },
  quiet() { for (const id of ['hints', 'cine', 'evcard', 'unlock', 'comms']) { const e = document.getElementById(id); if (e) e.hidden = true; } }
};`;

/* the scenes: name, the zoom, and the script that sets them up (QA and IC in scope) */
const Z = { airport: 6, terminal: 30, stand: 110, close: 300 };
const SCENES = [];
const scene = (name, js) => SCENES.push({ name, js });
// the fuel farm, the fire station and the tower, at the four zooms, and at work
scene('services-3d-tower', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'tower'); await QA.view3d(t, 6, 0.9, 0.22);`);
scene('services-3d-farm', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'fuel'); await QA.view3d(t, 3, 2.2, 0.45);`);
scene('services-3d-fire', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'fire'); await QA.view3d(t, 2.5, 0.5, 0.5);`);
for (const [k, z] of Object.entries(Z)) scene(`services-${k}`, `const S = QA.career(12345, 11); const ap = QA.cap(); const f = ap.parts.find(p => p.kind === 'fuel'); QA.run(60); QA.look(${k === 'airport' ? 'ap' : 'f'}, ${z});`);

(async () => {
  if (args.includes('--list')) { for (const s of SCENES) console.log(s.name); return; }
  const todo = SCENES.filter(s => !words.length || words.some(w => s.name.includes(w)));
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  // (WebGL in software for the 3D scenes; three.js from node_modules where cdnjs is blocked: npm i --no-save three@0.160.0)
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  await page.evaluate(LIB);
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of todo) {
    try { await page.evaluate(`(async () => { QA.close3d(); QA.want = null; ${s.js}; QA.quiet(); })()`); }
    catch (e) { errors.push(`${s.name}: ${e.message.split('\n')[0]}`); continue; }
    await page.waitForTimeout(700);
    await page.evaluate('QA.aim(); QA.quiet()');
    await page.waitForTimeout(700);
    const file = path.join(OUT, `${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
