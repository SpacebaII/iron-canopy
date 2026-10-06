/* Round 2's recorded playthrough (docs/focus/round-2.md): a fresh Career from the start screen with the round-1
   Starter airport, played with real clicks and keys in headless Chromium, on to the first landing and a few
   turnarounds, day and night. IC is read for positions and state, and the camera is set for the stand-zoom shots
   a player would zoom to; time is only moved by the speed keys and Finish now.
     python3 -m http.server 8777 &   (from the repository root)
     node tools/round2-play.js [--url=...] [--before]
   --before turns round 2 off (IC.FOCUS.life and firstLanding false) for the "before" pictures of the same moments.
   Needs Playwright (npm i --no-save playwright). Saves JPGs to docs/focus/round-2/. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8777/iron-canopy/index.html';
const BEFORE = process.argv.includes('--before');
const OUT = path.resolve(__dirname, '../docs/focus/round-2');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now(); let clicks = 0;
  const T = () => ((Date.now() - t0) / 1000).toFixed(0);
  const log = (...a) => console.log(`[${T()} s, ${clicks} clicks]`, ...a);
  const ev = s => page.evaluate(s);
  const shot = async name => { await page.screenshot({ path: path.join(OUT, (BEFORE ? 'before-' : '') + name + '.jpg'), type: 'jpeg', quality: 68 }); log('shot', name); };
  const click = async (sel, o) => { await page.click(sel, Object.assign({ timeout: 8000 }, o)); clicks++; await page.waitForTimeout(250); };
  const clickXY = async (x, y) => { await page.mouse.click(x, y); clicks++; await page.waitForTimeout(250); };
  const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(200); };
  const screenOf = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  const dismiss = async (keepMoment) => {
    for (let i = 0; i < 12; i++) {
      const b = await page.$('[data-act="hintOk"]:visible');
      if (b) { await b.click(); clicks++; await page.waitForTimeout(300); continue; }
      const c = await page.$('#cine:not([hidden])');
      if (c && !(keepMoment && await ev(`document.getElementById('cine').classList.contains('moment')`))) { await c.click({ position: { x: 20, y: 20 } }); clicks++; await page.waitForTimeout(900); continue; }
      break;
    }
  };
  // zoom as a player does, with the wheel over the middle of the map (the camera keeps following)
  const wheelTo = async z => { for (let i = 0; i < 40; i++) { const c = await ev('IC.cam.z'); if (Math.abs(Math.log(c / z)) < 0.15) break; await page.mouse.move(720, 450); await page.mouse.wheel(0, c < z ? -240 : 240); await page.waitForTimeout(120); } };
  const stopFollow = async () => { for (let i = 0; i < 3 && await ev('!!IC.S.follow'); i++) { await page.click('#followchip [data-act="followOff"]', { timeout: 2000 }).then(() => clicks++).catch(() => {}); await page.waitForTimeout(300); } };
  const look = async (x, y, z) => { await ev(`(() => { IC.cam.fly = null; IC.cam.z = ${z}; IC.centerOn(${x}, ${y}); })()`); await page.waitForTimeout(900); };
  const moments = {};
  const mark = k => { if (!moments[k]) { moments[k] = { s: +T(), clicks }; log('**', k); } };

  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  if (BEFORE) await ev('IC.FOCUS.life = false; IC.FOCUS.firstLanding = false');
  await page.waitForTimeout(1500);
  await click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await dismiss();
  await click('[data-act="bbToggle"]');
  await click('#bbar [data-act="foundMode"]');
  await page.waitForTimeout(400);
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y, cx: c.x, cy: c.y }; } return null; })()`);
  await ev(`IC.cam.fly = null; IC.frame(${Math.min(site.x, site.cx) - 60}, ${Math.min(site.y, site.cy) - 60}, ${Math.max(site.x, site.cx) + 60}, ${Math.max(site.y, site.cy) + 60})`);
  await page.waitForTimeout(600);
  let p = await screenOf(site.x, site.y);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(500);
  await clickXY(p.x, p.y);
  await page.waitForTimeout(500);
  await click('#bldgo [data-go="build"]');
  await page.waitForTimeout(1500);
  await dismiss();
  const capId = await ev('IC.S.story.cap || (IC.S.mode2 && IC.S.mode2.ap && IC.S.mode2.ap.id)');
  await click('#bbar [data-bb="tab"][data-v="bq"]');
  await click('#bbar [data-bb="item"][data-v="starter"]'); await page.waitForTimeout(1500);
  const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y }; })()`);
  p = await screenOf(ap.x, ap.y + 2);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(500);
  await clickXY(p.x, p.y); await page.waitForTimeout(600);
  await click('#bldgo [data-go="build"]');
  await page.waitForTimeout(800);
  await click('#bbar [data-act="finishNow"]');
  for (let i = 0; i < 240; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; }
  await dismiss();
  mark('open');
  await key('Escape');
  // 32× until the first airliner comes: the game eases to 1× and follows it in
  await key('6');
  let followed = false;
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(1000);
    if (i % 5 === 0) await dismiss(true);
    const st = await ev('({ first: !!IC.S.first, follow: !!IC.S.follow, parked: IC.S.story.cnt.parked, speed: IC.S.speed, paused: IC.S.paused })');
    if (st.paused) await ev('IC.S.paused = false');
    if (st.first && !followed) { followed = true; mark('first arrival: eased to ' + st.speed + '×'); await page.waitForTimeout(2500); await shot('01-approach'); }
    if (st.parked > 0) break;
  }
  mark('first landing');
  if (!BEFORE) {
    // the follow went on through the landing and taxi; the card comes as it parks
    await page.waitForTimeout(1200);
    await shot('02-first-landing-card');
  } else await shot('02-first-landing-card');
  await dismiss();
  // the stand: a turnaround from close in, a few times as it goes on (at 2×: 20 game s a second)
  const tail = await ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}'); return tl ? tl.id : null; })()`);
  const standAt = async () => ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.id === '${tail}'); const a = S.byId['${capId}']; const s = tl && tl.stand && IC.aptStands(a).find(x => x.id === tl.stand); return s ? { x: s.x, y: s.y, where: tl.where, t: tl.t } : null; })()`);
  await key('2');
  if (!BEFORE && tail) {
    // a player clicks the aircraft: its panel shows the turnaround
    const s = await standAt();
    if (s) { await wheelTo(90); await page.waitForTimeout(1500); const q = await screenOf(s.x, s.y); await clickXY(q.x, q.y); await page.mouse.move(560, 860); await page.waitForTimeout(800); await shot('03-stand-selected'); }
  }
  for (const [name, wait] of [['04-turn-early', 20], ['05-turn-mid', 45], ['06-turn-late', 40]]) {
    for (let i = 0; i < wait; i++) { await page.waitForTimeout(1000); if (i % 6 === 0) await dismiss(); }
    const s = await standAt();
    if (s && BEFORE) await look(s.x, s.y, 200);
    else if (s) { await wheelTo(200); await page.mouse.move(560, 860); }
    if (s) { await page.waitForTimeout(1200); await shot(name); }
    if (s && name === '05-turn-mid') { if (BEFORE) await look(s.x, s.y, 320); else { await wheelTo(320); await page.mouse.move(560, 860); } await page.waitForTimeout(1200); await shot('05b-turn-close'); }
  }
  await stopFollow();
  // the whole apron and the landside
  const term = await ev(`(() => { const a = IC.S.byId['${capId}'], t = a.parts.find(q => q.kind === 'terminal'); return { x: t.x, y: t.y }; })()`);
  await key('5');
  for (let i = 0; i < 25; i++) { await page.waitForTimeout(1000); if (i % 5 === 0) await dismiss(); }
  await look(term.x, term.y, 26); await shot('07-apron');
  const kerb = await ev(`(() => { const a = IC.S.byId['${capId}'], r = (a.land && a.land.roads || []).find(r => r.kerb); if (!r) return null; const m = r.pts[Math.floor(r.pts.length / 2)]; return { x: m.x, y: m.y }; })()`);
  if (kerb) { await look(kerb.x, kerb.y, 180); await shot('08-kerb'); }
  if (process.argv.includes('--quick')) { console.log(JSON.stringify({ errors })); await browser.close(); return; }
  await look(ap.x, ap.y, 6); await shot('09-airport');
  // night: at 32× until it is dark
  await key('6');
  for (let i = 0; i < 240; i++) { await page.waitForTimeout(1000); if (i % 5 === 0) await dismiss(); if (await ev('IC.daylight(IC.S.time) < 0.25')) break; }
  await key('2');
  await page.waitForTimeout(1500);
  await look(term.x, term.y, 26); await shot('10-night-apron');
  if (kerb) { await look(kerb.x, kerb.y, 180); await shot('11-night-kerb'); }
  // follow a departure out at night
  const dep = await ev(`(() => { const S = IC.S, a = S.byId['${capId}'], m = a.moves.find(m => m.tail && m.kind === 'dep'); const tl = m ? m.tail : S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}'); return tl ? tl.id : null; })()`);
  if (dep && !BEFORE) {
    await ev(`IC.select({ kind: 'tail', ref: IC.S.av.tails.find(t => t.id === '${dep}') })`); await page.waitForTimeout(600);
    try { await click('#insp [data-act="follow"]'); await page.waitForTimeout(2500); await shot('12-night-follow'); }
    catch (e) { log('no Follow button:', await ev(`(document.getElementById('insp').innerText || '').slice(0, 200)`)); }
  }
  const stats = await ev(`(() => { const S = IC.S, a = S.byId['${capId}']; return { paxRate: a.paxRate || 0, turns: (S.rec ? S.rec.turns.filter(q => q.ap === a.id && q.t1 == null).length : 0), moves: a.moves.length, budget: Math.round(S.budget) }; })()`);
  console.log(JSON.stringify({ before: BEFORE, moments, stats, errors }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
