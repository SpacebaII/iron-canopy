/* Brief 71's pictures: airport operations in the real page. A busy capital (the network preset, an hour played) with
   every stand's turnaround ring; each kind of incident forced (IC.OPS.force) and caught at its telling stage (the
   crew's report waiting for the player's call, the sweep, the excursion's recovery, the fuel spill under foam, the
   scraped wing); a building site with its stage bar and the Rush button; the Airside operations base; the airport
   panel's Operations now.
     node tools/ops-shots.js [words]      only the scenes whose name contains one of the words
   Saves docs/tasks/71-screens/<scene>.jpg. Needs Playwright (npm i --no-save playwright; a preinstalled Chromium at
   /opt/pw-browsers/chromium is used when Playwright's own is missing). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const OUT = path.resolve(__dirname, '../docs/tasks/71-screens');
const words = process.argv.slice(2).filter(a => !a.startsWith('--'));

const LIB = `
window.OP = {
  game(hour, warm) {
    IC.seedRandom(71);
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: hour == null ? 9 : hour });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1', 'arsenal', 'build']) try { IC.hint.skipTour(k); } catch (e) {}
    IC.ui.cineShown = 1e9; S.weather.hold = true; S.budget = 2e4;
    OP.cards();
    OP.run(warm == null ? 3600 : warm);
    S.paused = true;
    return S;
  },
  cards() { const S = IC.S; for (const e of S.story ? S.story.events.slice() : []) try { IC.storyChoose(S, e.id, 0); } catch (err) {} if (S.camp) S.camp.cards.length = 0; },
  cap() { return IC.S.byId[IC.S.story.cap]; },
  run(sec, until) { const S = IC.S; for (let t = 0; t < sec; t += 0.25) { IC.step(S, 0.25); if (S.story && S.story.events.length) OP.cards(); if (until && until()) return true; } return false; },
  inc(kind) { return (OP.cap().incs && OP.cap().incs.list || []).find(x => x.kind === kind && !x.done); },
  look(p, z) { if (IC.followStop) IC.followStop(IC.S); IC.cam.fly = null; IC.cam.z = z; IC.centerOn(p.x, p.y); },
  quiet() { for (const id of ['hints', 'cine', 'evcard', 'unlock', 'comms']) { const e = document.getElementById(id); if (e) e.hidden = true; } if (IC.S.camp) IC.S.camp.cards.length = 0; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  async shot(name, p, z, sel) { OP.quiet(); if (sel !== undefined) IC.select(sel); else IC.select(null); OP.look(p, z); IC.ui.refresh(true); await OP.sleep(700); OP.look(p, z); OP.quiet(); IC.ui.refresh(true); await OP.sleep(500); await window.opShot(name); }
};`;

const SCENES = [];
const scene = (name, js) => SCENES.push({ name, js });
scene('stands', `OP.game(9, 5400); const ap = OP.cap(); const t = ap.parts.find(p => p.kind === 'terminal' && p.built) || ap; await OP.shot('stands', t, 48);`);
scene('stands-far', `OP.game(9, 5400); const ap = OP.cap(); await OP.shot('stands-far', ap, 16);`);
scene('debris', `OP.game(10, 1800); const ap = OP.cap(); IC.OPS.force = 'debris'; OP.run(3600, () => OP.inc('debris')); const i = OP.inc('debris'); OP.run(20);
  await OP.shot('debris-report', i, 22);
  IC.opsDecide(IC.S, ap, i.id, 'close'); OP.run(3600, () => IC.opsStage(i).k === 'sweep'); OP.run(120);
  await OP.shot('debris-sweep', i, 60); await OP.shot('debris-sweep-panel', i, 16, { kind: 'infra', ref: ap });`);
scene('excursion', `OP.game(11, 1800); const ap = OP.cap(); IC.OPS.force = 'excursion'; OP.run(5400, () => OP.inc('excursion')); const i = OP.inc('excursion'); OP.run(60);
  await OP.shot('excursion-fire', i, 60); OP.run(7200, () => IC.opsStage(i).k === 'recover'); OP.run(300); await OP.shot('excursion-recover', i, 80); await OP.shot('excursion-airport', ap, 16, { kind: 'infra', ref: ap });`);
scene('spill', `OP.game(9, 3600); const ap = OP.cap(); IC.OPS.force = 'spill'; OP.run(7200, () => OP.inc('spill')); const i = OP.inc('spill'); OP.run(5, () => IC.opsStage(i).k === 'foam'); OP.run(400, () => IC.opsStage(i).k === 'foam'); OP.run(120);
  await OP.shot('spill', i, 110);`);
scene('scrape', `OP.game(9, 3600); const ap = OP.cap(); IC.OPS.force = 'scrape'; OP.run(7200, () => OP.inc('scrape')); const i = OP.inc('scrape'); OP.run(60); await OP.shot('scrape', i, 100);`);
scene('opsbase', `OP.game(10, 600); const ap = OP.cap(); const rw = ap.parts.find(p => p.kind === 'runway' && p.built); const c = IC.rwAt(rw, 0.35), d = IC.rwDir(rw);
  const x = c.x - d.y * 3.2, y = c.y + d.x * 3.2; const p = IC.aptPlanPart(IC.S, ap, 'opsbase', x, y, Math.atan2(d.y, d.x), 0.8, 0.5, {});
  OP.run(400); await OP.shot('opsbase-building', { x, y }, 50, p ? { kind: 'apart', ref: p, ap } : null);
  for (let k = 0; k < 60 && ap.works.length; k++) { for (const w of ap.works) w.prog = 1; IC.updateBases(IC.S, 0.1); } ap.dirty = true; IC.aptStats(IC.S, ap);
  IC.OPS.force = 'debris'; OP.run(3600, () => OP.inc('debris')); const i = OP.inc('debris'); if (i) { IC.opsDecide(IC.S, ap, i.id, 'close'); OP.run(600, () => IC.opsStage(i).k === 'drive'); OP.run(25); }
  await OP.shot('opsbase-out', { x: (x + (i ? i.x : x)) / 2, y: (y + (i ? i.y : y)) / 2 }, 30);
  await OP.shot('opsbase', { x, y }, 120);`);
scene('site', `OP.game(10, 600); const ap = OP.cap(); const t = ap.parts.find(p => p.kind === 'terminal' && p.built); const rw = ap.parts.find(p => p.kind === 'runway' && p.built); const c = IC.rwAt(rw, 0.7), d = IC.rwDir(rw);
  const p = IC.aptPlanPart(IC.S, ap, 'cargo', c.x - d.y * 4.4, c.y + d.x * 4.4, Math.atan2(d.y, d.x), 2, 1, {});
  OP.run(240); await OP.shot('site', p || c, 40); await OP.shot('site-panel', p || c, 16, { kind: 'infra', ref: ap }); IC.ui.aptOpen = Object.assign(IC.ui.aptOpen || {}, { works: true }); await OP.shot('site-works', p || c, 16, { kind: 'infra', ref: ap });`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  for (const sc of SCENES) {
    if (words.length && !words.some(w => sc.name.includes(w))) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('opShot', async name => { await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 70 }); console.log('  saved', name); });
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
    await page.evaluate(LIB);
    console.log(sc.name);
    try { await page.evaluate(`(async () => { ${sc.js} })()`); } catch (e) { console.log('  FAIL', e.message.split('\n').slice(0, 6).join(' | ')); }
    if (errors.length) console.log('  page errors:\n    ' + errors.slice(0, 5).join('\n    '));
    await page.close();
  }
  await browser.close();
})();
