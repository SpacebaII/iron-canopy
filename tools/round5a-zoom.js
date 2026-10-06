/* Round 5a: the turnaround at stand zoom, as a player sees it (docs/focus/round-5a-benchmark.md). Plays the round-1
   opening (found, the Starter, Finish now), waits for the first airliner to park, then zooms with the mouse wheel while
   following it and reports the zoom reached; then stops following and shoots the stand at z 60 and z 150, and the
   apron at night. Needs the page served on :8777 and Playwright. Saves JPGs to docs/focus/round-5a/ (z-*). */
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/focus/round-5a');
(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const ev = s => page.evaluate(s);
  const shot = async n => { await page.screenshot({ path: path.join(OUT, 'z-' + n + '.jpg'), type: 'jpeg', quality: 55 }); console.log('shot', n); };
  const look = async (x, y, z) => { await ev(`(() => { IC.cam.fly = null; IC.cam.z = ${z}; IC.centerOn(${x}, ${y}); })()`); await page.waitForTimeout(900); };
  const closeCards = async () => { for (let i = 0; i < 6; i++) { const c = await page.$('#cine:not([hidden])'); if (c) { await c.click({ position: { x: 20, y: 20 } }).catch(() => {}); await page.waitForTimeout(400); continue; } const o = await page.$('#evcard:not([hidden]) .opt'); if (o) { await o.click().catch(() => {}); await page.waitForTimeout(400); continue; } const h = await page.$('[data-act="hintOk"]:visible'); if (h) { await h.click().catch(() => {}); continue; } break; } };
  await page.goto('http://127.0.0.1:8777/iron-canopy/index.html');
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await page.waitForTimeout(1500); await closeCards();
  await page.click('[data-act="bbToggle"]'); await page.waitForTimeout(300);
  await page.click('#bbar [data-act="foundMode"]'); await page.waitForTimeout(400);
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y }; } return null; })()`);
  await look(site.x, site.y, 0.6);
  const scr = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  let p = await scr(site.x, site.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(300); await page.mouse.click(p.x, p.y); await page.waitForTimeout(400);
  await page.click('#bldgo [data-go="build"]'); await page.waitForTimeout(1500); await closeCards();
  const capId = await ev('IC.S.story.cap');
  await page.click('#bbar [data-bb="tab"][data-v="bq"]'); await page.waitForTimeout(300);
  await page.click('#bbar [data-bb="item"][data-v="starter"]'); await page.waitForTimeout(1000);
  const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y }; })()`);
  await look(ap.x, ap.y, 6);
  p = await scr(ap.x, ap.y + 2); await page.mouse.move(p.x, p.y); await page.waitForTimeout(500); await page.mouse.click(p.x, p.y); await page.waitForTimeout(400);
  await page.click('#bldgo [data-go="build"]'); await page.waitForTimeout(500);
  await page.click('#bbar [data-act="finishNow"]');
  for (let i = 0; i < 300; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; }
  await page.keyboard.press('Escape');
  await page.keyboard.press('6');
  for (let i = 0; i < 400; i++) { await page.waitForTimeout(1000); if (i % 4 === 0) await closeCards(); await ev('IC.S.paused = false'); if (await ev('IC.S.story.cnt.parked > 0')) break; }
  await closeCards();
  await page.keyboard.press('2');
  // the wheel, while following
  const z0 = await ev('IC.cam.z');
  for (let i = 0; i < 12; i++) { await page.mouse.move(720, 450); await page.mouse.wheel(0, -240); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  const z1 = await ev('IC.cam.z'), fol = await ev('!!IC.S.follow');
  console.log('wheel while following: z', z0.toFixed(1), '->', z1.toFixed(1), 'following', fol);
  await shot('follow-wheel');
  await ev('IC.followStop && IC.followStop(IC.S)');
  const st = await ev(`(() => { const S = IC.S, a = S.byId['${capId}'], tl = S.av.tails.find(t => t.where === 'stand' && t.at === a.id); const s = tl && IC.aptStands(a).find(q => q.id === tl.stand); return s ? { x: s.x, y: s.y } : null; })()`);
  if (st) {
    for (let k = 0; k < 3; k++) { await page.waitForTimeout(9000); await closeCards(); await look(st.x, st.y, 60); await shot('stand60-' + k); }
    await look(st.x, st.y, 150); await shot('stand150'); await look(st.x, st.y, 320); await shot('stand320');
  }
  // night: at 32× until dark, the whole airport and the apron
  await page.keyboard.press('7');
  for (let i = 0; i < 300; i++) { await page.waitForTimeout(1000); if (i % 4 === 0) await closeCards(); await ev('IC.S.paused = false'); if (await ev('(IC.S.time % 86400) / 3600 >= 23.3 || (IC.S.time % 86400) / 3600 < 4')) break; }
  await page.keyboard.press('1');
  await closeCards();
  const n = await ev(`(() => { const S = IC.S, a = S.byId['${capId}']; return { hour: ((S.time % 86400) / 3600).toFixed(1), moves: a.moves.length, onStand: S.av.tails.filter(t => t.at === a.id && t.where === 'stand').length, tails: S.av.tails.length }; })()`);
  console.log('night', JSON.stringify(n));
  await look(ap.x, ap.y, 8); await shot('night-airport');
  if (st) { await look(st.x, st.y, 40); await shot('night-apron'); }
  console.log(JSON.stringify({ errors }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
