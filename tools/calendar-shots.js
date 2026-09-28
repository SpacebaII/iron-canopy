/* Pictures of the calendar for review, from a saved Career (made by the balance run: SAVE=career.json node storytest.js):
     node tools/calendar-shots.js career.json
   Saves in shots/: cal-topbar (the date in the top bar), cal-statement (the month's statement and the year month by
   month), cal-review (the yearly review), cal-wait-pick and cal-wait (waiting for money), cal-build-<stage> (a new
   apron through its construction stages). Needs Playwright, like tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('usage: node tools/calendar-shots.js <save.json>'); process.exit(2); }
  const json = fs.readFileSync(file, 'utf8');
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(j => { IC.adopt(IC.loadSave(j)); IC.S.paused = true; IC.ui.hintsOn = false; }, json);
  await page.waitForTimeout(1500);
  const out = n => path.resolve(__dirname, `../shots/${n}.png`);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const shot = async (n, clip) => { await page.waitForTimeout(700); await page.screenshot({ path: out(n), clip }); console.log('saved', out(n)); };
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
  await shot('cal-review');
  // waiting for money: the chooser, then the wait with its line
  await run(`document.getElementById('cine').hidden = true; ui.cineShown = S.camp.cards.length; ui.waitPick = true`);
  await shot('cal-wait-pick', { x: 0, y: 0, width: 1440, height: 520 });
  await run(`const t = IC.waitTargets(S).find(x => x.sum); IC.waitStart(S, t.key); S.paused = false; ui.waitPick = false`);
  await page.waitForTimeout(4000);
  await shot('cal-wait', { x: 0, y: 0, width: 1440, height: 260 });
  // a new apron at the capital, through its stages, close in
  await run(`IC.waitStop(S); S.paused = true; S.budget = Math.max(S.budget, 3000);
    const ap = S.byId[S.story.cap], rw = ap.parts.find(p => p.kind === 'runway'), c = IC.rwAt(rw, 0.5), d = IC.rwDir(rw), a = Math.atan2(d.y, d.x);
    let p = null; for (const k of [-12, 12, -16, 16, -20, 20]) { p = IC.aptPlanPart(S, ap, 'apron', c.x - d.y * k, c.y + d.x * k, a, 4, 1.3, { mat: 'conc' }); if (p) break; }
    window.__p = p; if (p) { IC.cam.fly = null; IC.cam.z = 9; IC.centerOn(p.x, p.y); }`);
  for (const k of ['survey', 'earth', 'pave', 'mark', 'lights', 'open']) {
    const got = await page.evaluate(k2 => { const S = IC.S, p = window.__p; if (!p) return false; const I = ['survey', 'earth', 'pave', 'mark', 'lights', 'open']; for (let i = 0; i < 40000 && !p.built && (I.indexOf(p.stage) < I.indexOf(k2) || (p.stage === k2 && (p.stageF || 0) < 0.55)); i++) IC.step(S, 2); IC.ui.refresh(true); return p.stage === k2; }, k);
    if (got) await shot('cal-build-' + k);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
