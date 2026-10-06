/* Round 1's recorded playthrough (docs/focus/round-1.md): a fresh Career from the start screen, played with real
   clicks and keys in headless Chromium, as the playtest did. IC is only read (positions, state), never used to build
   or to move time. Counts the clicks and real seconds to: the airport founded, a complete starter airport ordered,
   the airport open, the first landing, Chapter 2. Saves JPG screenshots to docs/focus/round-1/.
     python3 -m http.server 8777 &   (from the repository root)
     node tools/round1-play.js [--url=http://127.0.0.1:8777/iron-canopy/index.html] [--path=starter|pieces]
   Needs Playwright (npm i --no-save playwright). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8777/iron-canopy/index.html';
const PATH = arg('path') || 'starter';
const OUT = path.resolve(__dirname, '../docs/focus/round-1');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now(); let clicks = 0, keys = 0;
  const T = () => ((Date.now() - t0) / 1000).toFixed(0);
  const log = (...a) => console.log(`[${T()} s, ${clicks} clicks]`, ...a);
  const ev = s => page.evaluate(s);
  const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 70 }); log('shot', name); };
  const click = async (sel, o) => { await page.click(sel, Object.assign({ timeout: 8000 }, o)); clicks++; await page.waitForTimeout(250); };
  const clickXY = async (x, y, o) => { await page.mouse.click(x, y, o); clicks++; await page.waitForTimeout(250); };
  const key = async k => { await page.keyboard.press(k); keys++; await page.waitForTimeout(200); };
  const screenOf = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  // the tips and cards a new player meets, closed as a player would
  const dismiss = async () => {
    for (let i = 0; i < 12; i++) {
      const b = await page.$('[data-act="hintOk"]:visible');
      if (b) { await b.click(); clicks++; await page.waitForTimeout(300); continue; }
      const c = await page.$('#cine:not([hidden])');
      if (c) { await c.click({ position: { x: 20, y: 20 } }); clicks++; await page.waitForTimeout(900); continue; }
      break;
    }
  };
  const moments = {};
  const mark = k => { if (!moments[k]) { moments[k] = { s: +T(), clicks, keys }; log('**', k); } };

  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot('01-start');
  await click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await dismiss();
  await shot('02-career-open');
  // Build in the top bar, then Found an airport
  await click('[data-act="bbToggle"]');
  await click('#bbar [data-act="foundMode"]');
  await page.waitForTimeout(400);
  // a site 25 km from the capital, away from town (the player reads the ring: 15–40 km)
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y, cx: c.x, cy: c.y }; } return null; })()`);
  // frame the capital and the site, as a player zooming out would see both
  await ev(`IC.cam.fly = null; IC.frame(${Math.min(site.x, site.cx) - 60}, ${Math.min(site.y, site.cy) - 60}, ${Math.max(site.x, site.cx) + 60}, ${Math.max(site.y, site.cy) + 60})`);
  await page.waitForTimeout(600);
  let p = await screenOf(site.x, site.y);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(500);
  await shot('03-found-ring');
  await clickXY(p.x, p.y);
  await page.waitForTimeout(500);
  await shot('04-survey');
  const surveyCost = await ev(`IC.foundSurvey(IC.S, IC.S.mode2.site.x, IC.S.mode2.site.y, IC.S.mode2.hdg).cost`);
  const b0 = await ev('IC.S.budget');
  await click('#bldgo [data-go="build"]');
  await page.waitForTimeout(1500);
  const b1 = await ev('IC.S.budget');
  mark('founded');
  log(`survey said ${surveyCost}, the treasury fell by ${(b0 - b1).toFixed(0)} (the access road is paid as it is laid)`);
  await dismiss();
  await shot('05-after-found-plan');
  const capId = await ev('IC.S.story.cap || (IC.S.mode2 && IC.S.mode2.ap && IC.S.mode2.ap.id)');
  if (PATH === 'starter') {
    // the Blueprints tab, the Starter airport, a click on the surveyed runway, Build
    await click('#bbar [data-bb="tab"][data-v="bq"]'); log('errors', errors.join(' / ')); log('tab', await ev('IC.bb.tab + " " + IC.bb.open + " " + document.querySelectorAll("#bbar .bb-it").length + " " + [...document.querySelectorAll("#bbar .bb-it")].map(b => b.dataset.v).join(",")'));
    await click('#bbar [data-bb="item"][data-v="starter"]');
    const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y, z: IC.cam.z }; })()`);
    p = await screenOf(ap.x, ap.y + 2);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(500);
    await clickXY(p.x, p.y);
    await page.waitForTimeout(600);
    await shot('06-starter-placed');
    await click('#bldgo [data-go="build"]');
    mark('starter ordered');
  } else {
    // the surveyed runway is already placed: Build it; then a terminal and the services beside it
    await click('#bldgo [data-go="build"]');
    for (const [item, off] of [['tstraight', 4.2], ['services', -3.8]]) {
      await click(`#bbar [data-bb="item"][data-v="${item}"]`);
      const ap = await ev(`(() => { const a = IC.S.byId['${capId}'], r = a.parts.find(q => q.kind === 'runway'), d = IC.rwDir(r), m = IC.rwAt(r, 0.5); const side = a.cityRef ? Math.sign((a.cityRef.x - m.x) * -d.y + (a.cityRef.y - m.y) * d.x) || 1 : 1; return { x: m.x - d.y * ${off} * side + d.x * ${item === 'services' ? 7 : 0}, y: m.y + d.x * ${off} * side + d.y * ${item === 'services' ? 7 : 0} }; })()`);
      p = await screenOf(ap.x, ap.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(400);
      await clickXY(p.x, p.y); await page.waitForTimeout(400);
      await shot('06-' + item);
      await click('#bldgo [data-go="build"]');
    }
    mark('starter ordered');
  }
  await page.waitForTimeout(800);
  await shot('07-ordered');
  const ord = await ev(`(() => { const a = IC.S.byId['${capId}']; return { parts: a.parts.length, kinds: [...new Set(a.parts.map(q => q.kind))].join(','), works: a.works.length, budget: Math.round(IC.S.budget) }; })()`);
  log('ordered', JSON.stringify(ord));
  // zoom in to look at the plan, then Finish now
  await ev(`(() => { const a = IC.S.byId['${capId}']; IC.cam.fly = null; IC.cam.z = 14; IC.centerOn(a.x, a.y); })()`);
  await page.waitForTimeout(800);
  await shot('08-plan-close');
  await click('#bbar [data-act="finishNow"]');
  const tW = Date.now();
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(1000);
    const st = await ev(`(() => { const a = IC.S.byId['${capId}']; return { left: a.works.filter(w => w.stages).length, wait: !!IC.S.wait, open: !!IC.S.story.opened }; })()`);
    if (i === 6) await shot('09-construction');
    if (!st.wait) { log('wait ended', JSON.stringify(st)); break; }
  }
  log(`Finish now ran ${((Date.now() - tW) / 1000).toFixed(0)} s`);
  await dismiss();
  await shot('10-built');
  const opened = await ev('!!IC.S.story.opened');
  if (opened) mark('open');
  // then play on at 32x until the first landing, closing what comes up
  await key('6');
  const g0 = await ev('IC.S.time');
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(1000);
    if (i % 5 === 0) await dismiss();
    const st = await ev('({ open: !!IC.S.story.opened, parked: IC.S.story.cnt.parked, ch: IC.S.story.ch, div: IC.S.av.day.div, t: IC.S.time, paused: IC.S.paused })');
    if (st.open) mark('open');
    if (st.parked > 0) mark('first landing');
    if (st.ch >= 1) { mark('chapter 2'); break; }
    if (st.paused) await ev('IC.S.paused = false');
  }
  await page.waitForTimeout(500);
  await shot('11-chapter2');
  const end = await ev(`(() => { const S = IC.S, a = S.byId['${capId}']; IC.aptStats(S, a); return { date: IC.U.date ? IC.U.date(S) : '', div: (a.kpi && a.kpi.div) || 0, warn: a.st.warn, budget: Math.round(S.budget) }; })()`);
  await ev(`(() => { const a = IC.S.byId['${capId}']; IC.cam.fly = null; IC.cam.z = 16; IC.centerOn(a.x, a.y); })()`);
  await page.waitForTimeout(800);
  await shot('12-airport');
  await ev(`(() => { const a = IC.S.byId['${capId}'], t = a.parts.find(q => q.kind === 'terminal'); IC.cam.fly = null; IC.cam.z = 70; IC.centerOn(t.x, t.y); })()`);
  await page.waitForTimeout(1500);
  await shot('13-terminal');
  console.log(JSON.stringify({ path: PATH, moments, end, errors }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
