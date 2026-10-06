/* The construction QA pass (brief 47): every build-bar tool in the real page, with its interface: placed (the plan
   with its Build button), cancelled, built, watched through a stage, used, bulldozed and undone, each step checked
   and the moments that matter saved as pictures; some tools at the four zooms (the whole airport, a terminal, a
   stand, the closest); and the fuel farm, fire station and tower at work, in 2D and 3D.
     node tools/construction-qa.js [words]      only the scenes whose name contains one of the words
     node tools/construction-qa.js --list       the scenes
   Saves docs/tasks/47-screens/<scene>.jpg and prints what each cycle found (a line per tool, FAIL where a step
   did not do what it should). Needs Playwright (npm i --no-save playwright; a preinstalled Chromium at
   /opt/pw-browsers/chromium is used when Playwright's own is missing) and, for the 3D scenes, three.js
   (npm i --no-save three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const OUT = path.resolve(__dirname, '../docs/tasks/47-screens');
const args = process.argv.slice(2), words = args.filter(a => !a.startsWith('--'));
// --root=<dir>: the game from another checkout (the before pictures: a copy of the branch this one started from)
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || path.resolve(__dirname, '..');

/* helpers in the page: a Career capital ready to build on (with a taxiway along the south of its runway, so
   buildings there have one to face), the camera, a click as the player makes it, pictures on demand */
const LIB = `
window.QA = {
  career(seed, hour) {
    const S = IC.newGame({ seed: seed || 12345, mode: 'story', preset: 'network', hour: hour == null ? 11 : hour });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1', 'arsenal', 'build']) try { IC.hint.skipTour(k); } catch (e) {}
    IC.ui.cineShown = 1e9; S.paused = true; S.weather.hold = true; S.budget = 2e4;
    for (const e of S.story ? S.story.events.slice() : []) try { IC.storyChoose(S, e.id, 0); } catch (err) {}
    for (const t of ['p_hydrant', 'p_gradar', 'p_ils3', 'p_bridge', 'p_rconc']) S.tech.done.add(t);
    return S;
  },
  cap() { return IC.S.byId[IC.S.story.cap]; },
  P(x, y) { return IC.aptLocal(QA.cap(), x, y); },
  south() { const ap = QA.cap(); IC.aptPlanTaxi(IC.S, ap, [QA.P(-16.8, 0), QA.P(-16.8, -1.4), QA.P(0, -1.4), QA.P(16.8, -1.4), QA.P(16.8, 0)], 0.1, {}); QA.finish(ap); },
  look(p, z) { QA.want = { x: p.x, y: p.y, z }; QA.aim(); },
  aim() { const w = QA.want; if (!w) return; IC.cam.fly = null; IC.cam.z = w.z; IC.centerOn(w.x, w.y); },
  finish(ap) { for (let i = 0; i < 60 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(IC.S, 0.1); } ap.dirty = true; IC.aptStats(IC.S, ap); },
  tool(t) { const ap = QA.cap(); IC.select({ kind: 'infra', ref: ap }); IC.bbToggle(true); const tab = IC.BB_TABS.find(x => x.items.includes(t)); if (tab) IC.bbTab(tab.k); IC.bbPick(t); return IC.S.mode2; },
  click(p, btn) { IC.S.hover = { x: p.x, y: p.y }; const r = IC.clickWorld({ x: p.x, y: p.y }, btn || 0); IC.ui.refresh(true); return r; },
  run(sec) { const S = IC.S; for (let t = 0; t < sec; t += 0.5) IC.step(S, 0.5); IC.ui.refresh(true); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  async shot(name) { QA.aim(); QA.quiet(); await QA.sleep(500); QA.aim(); await QA.sleep(400); await window.qaShot(name); },
  /* the 3D replay round a point of the airport: orbit camera, yaw and pitch in radians, dist in units */
  async view3d(p, dist, yaw, pitch) {
    const S = IC.S;
    for (let i = 0; i < 4 * 240; i++) IC.step(S, 0.25);
    const V = IC.replayOpen(S, { x: p.x, y: p.y, t: S.time - 5, r: 60 });
    for (let i = 0; i < 200 && !(V.renderer && V.movers); i++) await QA.sleep(100);
    V.t = S.time - 2;
    const sel = V.el.querySelector('[data-rp=cam]'); if (sel) { sel.value = 'orbit'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    Object.assign(V.orbit, { yaw, pitch, dist, tx: 0, tz: 0 });
    await QA.sleep(5000);
  },
  close3d() { try { if (IC.replayClose) IC.replayClose(); } catch (e) {} },
  quiet() { for (const id of ['hints', 'cine', 'evcard', 'unlock', 'comms']) { const e = document.getElementById(id); if (e) e.hidden = true; } },
  /* one tool's whole cycle: place (picture), click the last point again (nothing), Esc (gone), place again and
     Build, a stage of the work (picture), finished (picture), in use, bulldozed (salvage), placed and built again,
     undone (refund). Returns what happened at each step */
  async cycle(name, t, pts, o) {
    o = o || {};
    const S = QA.career(12345, 11), ap = QA.cap(), out = { tool: t, steps: [] }, ok = (k, v, why) => { out.steps.push(k + (v ? '' : ' FAIL' + (why ? ': ' + why : ''))); return v; };
    QA.south();
    const n = () => ap.parts.length + (ap.svcRoads || []).length + IC.aptStands(ap).length, P = q => QA.P(q[0], q[1]);
    let m = QA.tool(t); if (!m) { ok('pick', false, 'no mode'); return out; }
    const n0 = n();
    // (clicked at the zoom the scene is seen at: the snap's reach follows the zoom)
    QA.look(P(pts[0]), o.z || 30);
    for (const q of pts) QA.click(P(q));
    const plan = IC.bldReady(S, m);
    if (t === 'stand') { ok('one click places a stand (or removes the one clicked)', n() !== n0, m.err); QA.look(P(pts[0]), o.z || 110); await QA.shot(name + '-placed'); return out; }
    ok('placed', !!plan, m.err);
    ok('nothing built on a click', n() === n0);
    const at = m.at || P(pts[pts.length - 1]);
    QA.look(at, o.z || 30); IC.S.hover = { x: at.x + 0.6, y: at.y + 0.4 };
    out.ok = plan && plan.ok; out.why = plan && plan.why; out.warn = plan && plan.warn; out.cost = plan && plan.cost;
    await QA.shot(name + '-placed');
    if (o.zooms) for (const z of o.zooms) { QA.look(at, z); await QA.shot(name + '-placed-z' + z); }
    // the last point again does nothing; Esc takes the plan away
    QA.click(P(pts[pts.length - 1]));
    ok('last point again does not build', n() === n0);
    ok('Esc cancels', IC.buildCancel(S, m) === 'undo' && !IC.bldReady(S, m));
    if (!plan || !plan.ok) return out;
    for (const q of pts) QA.click(P(q));
    const had = new Set(ap.parts), r = IC.buildFinish(S, m);
    ok('Build builds it', r === 'built' && n() > n0, m.err);
    if (r !== 'built') return out;
    // (what this build added: a kit or a hangar is several parts; the main one is the first that is not a taxiway)
    const all = ap.parts.filter(p => !had.has(p)), made = all.find(p => p.kind !== 'taxi') || all[0];
    // watch a stage: run until the paving or the structure is under way
    for (let i = 0; i < 4 * 3600 && made && !made.built && !['pave', 'mark', 'lights'].includes(made.stage); i++) IC.step(S, 0.5);
    out.stage = made && made.stage;
    S.hover = null; IC.setMode(null); IC.select({ kind: 'apart', ref: made, ap });
    QA.look(made && made.x != null ? made : at, o.z || 30);
    await QA.shot(name + '-stage');
    QA.finish(ap); QA.run(600);
    out.built = !!(made && made.built);
    out.now = made && IC.partNow ? IC.partNow(S, ap, made) : '';
    out.warnAfter = (ap.st.warn || []).slice(0, 3);
    await QA.shot(name + '-built');
    // bulldoze it (what comes back), then plan it again and undo it (all of it back)
    if (all.length && t !== 'svcroad') {
      const before = S.budget, k = ap.parts.length; let rb = true;
      for (const p of all.slice().reverse()) if (ap.parts.includes(p)) rb = IC.bldBulldoze(S, ap, p) && rb;
      ok('bulldozed', !!rb && ap.parts.length <= k - all.length, rb ? '' : 'refused');
      out.salvage = S.budget - before;
    }
    m = QA.tool(t);
    for (const q of pts) QA.click(P(q));
    const u0 = S.budget, k1 = ap.parts.length + (ap.svcRoads || []).length;
    if (IC.buildFinish(S, m) === 'built') { QA.run(30); const u1 = S.budget, und = IC.bldUndo(S, ap); ok('undo takes it back', !!und && ap.parts.length + (ap.svcRoads || []).length <= k1 && S.budget >= u1 - 1e-6, (u0 - S.budget).toFixed(2) + ' not refunded'); }
    else ok('built again', false, m.err);
    IC.setMode(null);
    return out;
  }
};`;

/* the scenes: name and script (QA and IC in scope; await allowed) */
const SCENES = [];
const scene = (name, js) => SCENES.push({ name, js });
/* every tool in the build bar: its clicks (airport-local: the runway along x from -17 to 17, the parallel taxiway
   at y 1.8 and the new one at -1.4, the remote apron at x -14.3 to -9.7, y -2.6 to -1.6) and options */
const T = {
  runway: { pts: [[-15, -9], [15, -9]], z: 6, zooms: [6, 30, 110, 300] },
  exits: { pts: [[0, 0]], z: 8 },
  taxi: { pts: [[6, -1.4], [6, -3.2], [9, -3.2]], zooms: [6, 30, 110, 300] },
  parallel: { pts: [[0, 0], [0, -1.4]], z: 6 },
  hold: { pts: [[16.5, 0]], z: 30 },
  apron: { pts: [[2, -1.515], [6, -2.8]], zooms: [6, 30, 110, 300] },
  remote: { pts: [[8, -1.515], [12, -2.8]] },
  ramp: { pts: [[-6, -1.515], [-3, -2.6]] },
  stand: { pts: [[-12.6, -2.3]], z: 110 },
  stretch: { pts: [[-12, -2.58], [-12, -3.4]] },
  alert: { pts: [[-17.6, -0.9]] },
  terminal: { pts: [[2, -3.2], [6, -4.0]] },
  concourse: { pts: [[-6, -6.4], [2, -6.4]], z: 14 },
  rotunda: { pts: [[0, -11]], z: 10 }, satellite: { pts: [[0, -11]], z: 10 }, curved: { pts: [[0, -11]], z: 10 }, semicircle: { pts: [[0, -11]], z: 10 },
  pierT: { pts: [[0, -11]], z: 10 }, pierY: { pts: [[0, -11]], z: 10 }, pierX: { pts: [[0, -11]], z: 10 },
  skybridge: { pts: [[1.2, 1.7], [1.5, 2.05]], z: 60 },
  people: { pts: [[-4, 5.4], [4, 5.4]], z: 14 },
  cargo: { pts: [[8, -1.515], [11, -2.4]] },
  hangar: { pts: [[4, -2.2]], zooms: [6, 30, 110, 300] }, has: { pts: [[4, -2.2]] }, ammo: { pts: [[6, -2.6]] },
  fuel: { pts: [[6, -2.6]], zooms: [6, 30, 110, 300] }, hydrant: { pts: [[6, -2.3]] }, fuelpad: { pts: [[6, -1.9]] }, deice: { pts: [[14, -2.1]] },
  fire: { pts: [[6, -2.4]], zooms: [6, 30, 110, 300] },
  svcroad: { pts: [[4, -1.7], [4, -3.5], [8, -3.5]] },
  surface: { pts: [[4, -4], [6, -5]] },
  ils: { pts: [[17.3, 0]] }, tower: { pts: [[6, -2.6]], zooms: [6, 30, 110, 300] }, atc: { pts: [[6, -2.4]] }, gradar: { pts: [[6, -2.2]] },
  blueprint: { pts: [[0, -40]], z: 1.2 }
};
for (const [t, o] of Object.entries(T)) scene(`tool-${t}`, `const R = await QA.cycle('tool-${t}', '${t}', ${JSON.stringify(o.pts)}, { z: ${o.z || 30}${o.zooms ? `, zooms: ${JSON.stringify(o.zooms)}` : ''} }); window.__qa = (window.__qa || []).concat([R]);`);
// the fuel farm, the fire station and the tower at work, in 2D (the four zooms) and in 3D
const Z = { airport: 6, terminal: 30, stand: 110, close: 300 };
for (const [k, z] of Object.entries(Z)) scene(`services-${k}`, `QA.career(12345, 11); const ap = QA.cap(); const f = ap.parts.find(p => p.kind === 'fuel'); QA.run(60); QA.look(${k === 'airport' ? 'ap' : 'f'}, ${z}); await QA.shot('services-${k}');`);
scene('services-fire-drill', `const S = QA.career(12345, 9); const ap = QA.cap(); for (let i = 0; i < 4 * 3600 && !ap.fireRun; i++) IC.step(S, 0.5); const R = ap.fireRun; while (S.time < R.t0 + R.dur * 0.6) IC.step(S, 0.5); const st = ap.parts.find(p => p.id === R.from); IC.select({ kind: 'apart', ref: st, ap }); QA.look({ x: (st.x + R.x) / 2, y: (st.y + R.y) / 2 }, 14); await QA.shot('services-fire-drill');`);
scene('services-tower-panel', `const S = QA.career(12345, 11); const ap = QA.cap(); QA.run(1800); const t = ap.parts.find(p => p.kind === 'tower'); IC.select({ kind: 'infra', ref: ap }); QA.look(t, 30); await QA.shot('services-tower-panel');`);
scene('services-3d-tower', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'tower'); await QA.view3d(t, 6, 0.9, 0.22); await window.qaShot('services-3d-tower'); QA.close3d();`);
scene('services-3d-farm', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'fuel'); await QA.view3d(t, 3, 2.2, 0.45); await window.qaShot('services-3d-farm'); QA.close3d();`);
scene('services-3d-fire', `QA.career(12345, 11); const ap = QA.cap(); const t = ap.parts.find(p => p.kind === 'fire'); await QA.view3d(t, 2.5, 0.5, 0.5); await window.qaShot('services-3d-fire'); QA.close3d();`);
// founding: the site placed with its Found button, the runway turned
scene('found-placed', `const S = QA.career(12345, 11); const c = IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop)[0]; let p = null; for (let r = 150; r < 400 && !p; r += 20) for (let a = 0; a < 6.28 && !p; a += 0.3) { const q = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }; if (!IC.foundCheck(S, q.x, q.y) && !IC.foundSurvey(S, q.x, q.y, IC.PREVAIL).river) p = q; } IC.setMode({ kind: 'found' }); QA.click(p); IC.foundTurn(S.mode2, 1); IC.foundTurn(S.mode2, 1); S.hover = { x: p.x + 30, y: p.y + 10 }; QA.look(p, 1.4); await QA.shot('found-placed');`);
// ramps flush with an angled taxiway (goal 1): an apron started 40 m off a taxiway at 30° to the runway, zoomed in
scene('ramp-flush', `const S = QA.career(12345, 11); const ap = QA.cap(); const o = QA.P(-26, -16), ta = ap.rwyA + 0.52, a = { x: o.x, y: o.y }, b = { x: o.x + Math.cos(ta) * 8, y: o.y + Math.sin(ta) * 8 }; IC.aptPlanTaxi(S, ap, [a, b], 0.05, {}); QA.finish(ap); const n = { x: -Math.sin(ta), y: Math.cos(ta) }, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const m = QA.tool('apron'); const c1 = { x: mid.x + n.x * 0.4, y: mid.y + n.y * 0.4 }; QA.look(c1, 160); IC.buildInput(S, m, c1, 0, 160); const c2 = { x: c1.x + Math.cos(ta) * 3 + n.x * 1.6, y: c1.y + Math.sin(ta) * 3 + n.y * 1.6 }; QA.click(c2); IC.buildFinish(S, m); QA.finish(ap); IC.setMode(null); QA.look({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, 40); await QA.shot('ramp-flush');`);

// before (run with --root= on the code this branch started from): the same moments in the old builder
scene('before-ramp', `const S = QA.career(12345, 11); const ap = QA.cap(); const o = QA.P(-26, -16), ta = ap.rwyA + 0.52, a = { x: o.x, y: o.y }, b = { x: o.x + Math.cos(ta) * 8, y: o.y + Math.sin(ta) * 8 }; IC.aptPlanTaxi(S, ap, [a, b], 0.05, {}); QA.finish(ap); const n = { x: -Math.sin(ta), y: Math.cos(ta) }, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const m = QA.tool('apron'); const c1 = { x: mid.x + n.x * 0.4, y: mid.y + n.y * 0.4 }; QA.look(c1, 160); IC.buildInput(S, m, c1, 0, 160); const c2 = { x: c1.x + Math.cos(ta) * 3 + n.x * 1.6, y: c1.y + Math.sin(ta) * 3 + n.y * 1.6 }; IC.buildInput(S, m, c2, 0, 160); S.hover = c2; QA.look({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, 40); await QA.shot('before-ramp');`);
scene('before-click-again', `const S = QA.career(12345, 11); const ap = QA.cap(); QA.south(); const m = QA.tool('hangar'); const p = QA.P(4, -2.2); QA.look(p, 30); IC.buildInput(S, m, p, 0, 30); S.hover = { x: p.x + 0.3, y: p.y + 0.2 }; await QA.shot('before-click-again');`);
scene('before-services', `QA.career(12345, 11); const ap = QA.cap(); const f = ap.parts.find(p => p.kind === 'fuel'); QA.run(60); QA.look(f, 30); await QA.shot('before-services');`);

(async () => {
  if (args.includes('--list')) { for (const s of SCENES) console.log(s.name); return; }
  const todo = SCENES.filter(s => !words.length || words.some(w => s.name.includes(w)));
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  // (WebGL in software for the 3D scenes)
  const gpu = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  let browser;
  try { browser = await chromium.launch(Object.assign({}, opt, gpu)); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt, gpu)); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  fs.mkdirSync(OUT, { recursive: true });
  await page.exposeFunction('qaShot', async name => { const file = path.join(OUT, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 62 }); console.log('  ' + path.relative(process.cwd(), file)); });
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.resolve(ROOT, 'iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  await page.evaluate(LIB);
  for (const s of todo) {
    console.log(s.name);
    try { await page.evaluate(`(async () => { QA.close3d(); QA.want = null; ${s.js} })()`); }
    catch (e) { errors.push(`${s.name}: ${e.message.split('\n')[0]}`); }
  }
  const rep = await page.evaluate('window.__qa || []');
  for (const r of rep) console.log(`${r.tool}: ${r.steps.join(' · ')}${r.ok === false ? ` · refused: ${r.why}` : ''}${r.warn && r.warn.length ? ` · warns: ${r.warn.join(' | ')}` : ''}${r.stage ? ` · stage seen: ${r.stage}` : ''}${r.now ? ` · now: ${r.now}` : ''}${r.salvage != null ? ` · salvage ${r.salvage.toFixed(1)}` : ''}`);
  if (rep.length) fs.writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(rep, null, 1));
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
