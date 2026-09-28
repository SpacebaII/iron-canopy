/* Pictures of the calendar for review. The scripted Career player (careerplayer.js) plays in the page for so many
   months first (a save made in Node does not load in the browser: the two build the map a hair differently):
     node tools/calendar-shots.js [months, default 14] [seed, default 777]
   Saves in shots/: cal-topbar (the date in the top bar), cal-statement (the month's statement and the year month by
   month), cal-review (the yearly review), cal-wait-pick and cal-wait (waiting for money), cal-build-<stage> (a new
   apron through its construction stages). Needs Playwright, like tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

(async () => {
  const months = +process.argv[2] || 14, seed = +process.argv[3] || 777;
  const src = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  // the scripted player, loaded into the page (its require() gets the page's IC), plays the Career for a while
  const t0 = Date.now();
  await page.evaluate(async ([qw, cp, seed, months]) => {
    const mods = {}, req = n => n.includes('qwplayer') ? mods.qw : window.IC;
    let m = { exports: {} }; new Function('module', 'require', qw)(m, req); mods.qw = m.exports;
    m = { exports: {} }; new Function('module', 'require', cp)(m, req); const player = m.exports.player;
    const S = IC.newGame({ seed, mode: 'story', hour: 7 }); IC.adopt(S); document.getElementById('start').hidden = true;
    const calm = () => !S.threats.some(t => !t.dead && !(t.d && t.d.civil)) && !S.missiles.length;
    let next = 0;
    // (to the middle of the month, in daylight: the month's statement has something in it)
    const end = IC.MO(S, months + 0.5);
    while (S.time < end && !S.over) {
      for (let i = 0; i < 2000 && S.time < end; i++) { IC.step(S, calm() ? 8 : 1); if (S.time >= next) { player(S); next = S.time + 64; } }
      await new Promise(r => setTimeout(r, 0));
    }
    S.paused = true; IC.ui.hintsOn = false; for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  }, [src('qwplayer.js'), src('careerplayer.js'), seed, months]);
  console.log(`played ${months} months in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  await page.waitForTimeout(1500);
  const out = n => path.resolve(__dirname, `../shots/${n}.png`);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const shot = async (n, clip, keepCard) => { if (!keepCard) await page.evaluate(() => { document.getElementById('cine').hidden = true; IC.ui.cineShown = IC.S.camp.cards.length; }); await page.waitForTimeout(700); await page.screenshot(clip ? { path: out(n), clip } : { path: out(n) }); console.log('saved', out(n)); };
  const run = src => page.evaluate(`(async () => { const S = IC.S, ui = IC.ui; ${src}; ui.refresh(true); })()`);

  // the top bar at a busy moment of the day
  await run(`const ap = S.byId[S.story.cap]; IC.cam.z = 1.2; IC.centerOn(ap.x, ap.y); document.getElementById('cine').hidden = true`);
  await shot('cal-topbar', { x: 0, y: 0, width: 1440, height: 130 });
  await shot('cal-map');
  // the Economy room: this month, last month, the year month by month
  await run(`ui.openRoom('economy'); ui.sub.economy = 'money'`);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.getElementById('wrBody'), h = [...b.querySelectorAll('h3')].find(x => /This month/.test(x.textContent)); if (h) h.scrollIntoView(); });
  await shot('cal-statement');
  await page.evaluate(() => { const b = document.getElementById('wrBody'), h = [...b.querySelectorAll('h3')].find(x => /in review/.test(x.textContent)); if (h) h.scrollIntoView(); });
  await shot('cal-review-room');
  await run(`ui.openRoom(null); const y = Math.floor(S.cal.m / 12); const R = IC.yearReview(S, y); if (R) IC.card(S, 'Year ' + R.y + ' in review', IC.U.clock(S.time, S), R.text, 'report')`);
  await shot('cal-review', null, true);
  // waiting for money: the chooser, then the wait with its line
  await run(`document.getElementById('cine').hidden = true; ui.cineShown = S.camp.cards.length; ui.waitPick = true`);
  await shot('cal-wait-pick', { x: 0, y: 0, width: 1440, height: 520 });
  await run(`for (const q of S.av.requests.slice()) IC.avDecide(S, q.id, !IC.avReqBlock(S, q)); for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0);
    const t = IC.waitTargets(S).filter(x => x.sum)[2]; IC.waitStart(S, t.key); S.paused = true; ui.waitPick = false`);
  await shot('cal-wait', { x: 0, y: 0, width: 1440, height: 260 });
  await run(`S.paused = false`);
  // how fast the wait really runs here, with this map: game seconds a real second, and frames a second
  const perf = await page.evaluate(async () => {
    const S = IC.S, again = () => { if (!S.wait) { for (const q of S.av.requests.slice()) IC.avDecide(S, q.id, false); const t = IC.waitTargets(S).find(x => x.sum && x.amt > S.budget + 900); IC.waitStart(S, t.key); } };
    again();
    let n = 0; const t0 = performance.now(), g0 = S.time, go = () => { n++; again(); if (performance.now() - t0 < 10000) requestAnimationFrame(go); };
    requestAnimationFrame(go); await new Promise(r => setTimeout(r, 10200));
    const gs = (S.time - g0) / ((performance.now() - t0) / 1000);
    return { gs: Math.round(gs), monthS: Math.round(IC.MO(S) / gs), fps: Math.round(n / 10), flights: S.threats.filter(t => t.tail && !t.dead).length, tails: S.av.tails.length, waiting: !!S.wait };
  });
  console.log(`wait: ${perf.gs} game s a real second, a month in about ${perf.monthS} s, ${perf.fps} frames a second, ${perf.flights} flights in the air of ${perf.tails} aircraft${perf.waiting ? '' : ' (the wait stopped during the measure)'}`);
  // a second runway at the capital, 2 km beside the first, through its stages, close in
  // (from the next morning, so the stages are built in daylight)
  await run(`IC.waitStop(S); S.paused = true; S.budget = Math.max(S.budget, 4000); S.time = Math.ceil((S.time - 6 * 3600) / 86400) * 86400 + 6 * 3600;
    const ap = S.byId[S.story.cap], rw = ap.parts.find(p => p.kind === 'runway'), c = IC.rwAt(rw, 0.5), d = IC.rwDir(rw);
    let p = null; for (const k of [-20, 20, -24, 24, -28, 28]) { const x = c.x - d.y * k, y = c.y + d.x * k; p = IC.aptPlanRunway(S, ap, { x: x - d.x * 8, y: y - d.y * 8 }, { x: x + d.x * 8, y: y + d.y * 8 }, 'Runway 2', { mat: 'conc' }); if (p) break; }
    window.__p = p; if (p) { const m = IC.rwAt(p, 0.5); IC.cam.fly = null; IC.cam.z = 55; IC.centerOn(m.x, m.y); }`);
  for (const k of ['survey', 'earth', 'pave', 'mark', 'lights', 'open']) {
    const got = await page.evaluate(k2 => { const S = IC.S, p = window.__p; if (!p) return false; const I = ['survey', 'earth', 'pave', 'mark', 'lights', 'open']; for (let i = 0; i < 40000 && !p.built && (I.indexOf(p.stage) < I.indexOf(k2) || (p.stage === k2 && (p.stageF || 0) < 0.55)); i++) IC.step(S, 2); IC.ui.refresh(true); return p.stage === k2; }, k);
    if (got) await shot('cal-build-' + k);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
