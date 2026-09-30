/* Smoke run: the real game in headless Chromium, every mode played for a little while as a player would, with real
   clicks and keys. Fails on any page error, and on "undefined", "NaN" or "[object Object]" anywhere on screen.
   Needs Playwright, which is not a project dependency:
     npm i --no-save playwright        (and npx playwright install chromium, unless a Chromium is already installed)
   node tools/smoke.js [--shots]       --shots saves a picture of each step in shots/smoke/
   What it plays: the start screen's pages; a Career (founding the national airport and laying its runway with the
   mouse, every room, the menu, a save, quitting and Continue); a Quick war into its first raid; every Academy lesson
   for a minute; the Test range; the Sandbox. About three minutes. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const SHOTS = process.argv.includes('--shots');
// (web fonts come from Google: a sandbox without them, or with a proxy that refuses them, is not the game's fault)
const IGNORE = /fonts\.(googleapis|gstatic)\.com|ERR_CERT|ERR_TOO_MANY_RETRIES|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|net::ERR_FAILED/;
const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object \w+\]/;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) {
    const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
    if (!fs.existsSync(alt)) throw e;
    browser = await chromium.launch(Object.assign({ executablePath: alt }, opt));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const problems = [];
  let step = 'loading';
  page.on('pageerror', e => problems.push(`${step}: page error: ${e.message} ${(e.stack || '').split('\n').slice(1, 3).map(l => l.trim()).join(' ')}`));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text() + ' ' + ((m.location() || {}).url || ''))) problems.push(`${step}: console error: ${m.text()}`); });
  page.on('requestfailed', r => { if (!IGNORE.test(r.url() + ' ' + (r.failure() || {}).errorText) && !/three/.test(r.url())) problems.push(`${step}: request failed: ${r.url()}`); });
  // three.js (the replay window only) comes from cdnjs; where that is blocked, a local copy serves (npm i --no-save three@0.160.0)
  const three = path.resolve(__dirname, '../node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));

  const ev = js => page.evaluate(js);
  const wait = ms => page.waitForTimeout(ms);
  const ready = () => page.waitForFunction(() => window.IC && IC.S && !(IC.building && IC.building()) && IC.loading !== true, null, { timeout: 180000 });
  let n = 0, seen = 0;
  const look = async name => {
    step = name;
    const txt = await ev(`[...document.querySelectorAll('#app *')].filter(e => e.offsetParent !== null && e.childElementCount === 0).map(e => e.textContent).join('\\n') + '\\n' + [...document.querySelectorAll('[title]')].map(e => e.title).join('\\n')`);
    for (const line of txt.split('\n')) if (BAD_TEXT.test(line)) problems.push(`${name}: on screen: ${JSON.stringify(line.trim().slice(0, 140))}`);
    if (SHOTS) { fs.mkdirSync(path.resolve(__dirname, '../shots/smoke'), { recursive: true }); await page.screenshot({ path: path.resolve(__dirname, `../shots/smoke/${String(++n).padStart(2, '0')}-${name}.png`) }); }
    console.log(`  ${problems.length > seen ? 'PROBLEM' : 'ok'}  ${name}`); for (const p of problems.slice(seen)) console.log(`       ${p}`); seen = problems.length;
  };
  // the page closes whatever is on top of the map: a chapter card, the tips
  const clear = async () => {
    for (let i = 0; i < 10; i++) {
      const hint = await page.$('#hints button[data-act=hintOk]');
      const cine = await ev(`!document.getElementById('cine').hidden`);
      if (!hint && !cine) break;
      if (cine) await page.click('#cine').catch(() => {}); else await hint.click().catch(() => {});
      await wait(200);
    }
  };
  // game hours of play, stepped in the page (the frames keep drawing between the slices)
  const run = async (hours, dt) => { for (let h = 0; h < hours * 4; h++) { await ev(`(() => { const S = IC.S, t1 = S.time + 900; while (S.time < t1 && !S.over) IC.step(S, ${dt || 1}); })()`); await wait(30); } };
  const toScreen = async (x, y) => { const b = await (await page.$('#map')).boundingBox(), q = await ev(`IC.toScreen(${x}, ${y})`); return { x: b.x + q.x, y: b.y + q.y }; };
  const clickWorld = async (x, y) => { const p = await toScreen(x, y); await page.mouse.move(p.x, p.y, { steps: 6 }); await page.mouse.click(p.x, p.y); await wait(250); };

  const t0 = Date.now();
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await ready(); await wait(500);
  console.log('Start screen');
  await look('start');
  for (const pg of ['lessons', 'saves', 'settings', 'keys']) { await page.click(`#st-main button[data-v=${pg}]`); await wait(300); await look(`start-${pg}`); await page.keyboard.press('Escape'); await wait(200); }

  console.log('Career');
  await page.click('#st-main button[data-v=story]'); await wait(500); await ready(); await wait(1500);
  await clear(); await look('career');
  for (const k of ['v', 'c', 'e', 'j', '?']) { await page.keyboard.press(k); await wait(400); await look(`career-room-${k === '?' ? 'guide' : k}`); }
  await page.keyboard.press('Escape'); await wait(200);
  // found the national airport with the mouse: the Aviation room's button, a site, a heading
  await page.keyboard.press('v'); await wait(300);
  await page.click('button[data-act=foundMode]'); await wait(300);
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (let r = 150; r <= 400; r += 25) for (let a = 0; a < 6.28; a += 0.3) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y }; } return null; })()`);
  if (!site) problems.push('career: no site to found an airport on');
  else {
    await ev(`IC.cam.fly = null; IC.cam.z = 0.9; IC.centerOn(${site.x}, ${site.y})`); await wait(300);
    await clickWorld(site.x, site.y); await clickWorld(site.x + 30, site.y);
    await wait(500); await clear();
    const ap = await ev(`(() => { const ap = IC.S.byId[IC.S.story.cap]; return ap && { x: ap.x, y: ap.y, a: ap.rwyA }; })()`);
    if (!ap) problems.push('career: founding with the mouse did not make the national airport');
    else {
      await look('career-founded');
      // the runway: the build bar (open with the airport selected), its Runways tab, Runway, one end, the other, and
      // again to build
      await ev(`IC.cam.fly = null; IC.cam.z = 4; IC.centerOn(${ap.x}, ${ap.y})`); await wait(300);
      if (!(await ev(`!document.getElementById('bbar').hidden`))) { await page.click('button[data-act=bbToggle]'); await wait(300); }
      await page.click('#bbar button[data-bb=tab][data-v=rw]'); await wait(200);
      await page.click('#bbar button[data-bb=item][data-v=runway]'); await wait(200);
      const P = (l) => ({ x: ap.x + Math.cos(ap.a) * l, y: ap.y + Math.sin(ap.a) * l });
      const a = P(-15), b = P(15);
      await clickWorld(a.x, a.y); await clickWorld(b.x, b.y); await clickWorld(b.x, b.y);
      const rw = await ev(`IC.S.byId[IC.S.story.cap].parts.some(p => p.kind === 'runway')`);
      if (!rw) problems.push('career: the runway was not planned by clicking its two ends');
      await page.keyboard.press('Escape'); await wait(200);
      await look('career-runway');
      // the rest of the build bar: a tab by its key, an item, the tools and an info view
      await page.keyboard.press('2'); await wait(200);
      await page.click('#bbar button[data-bb=item][data-v=taxi]'); await wait(200); await look('career-bar-taxiway');
      await page.keyboard.press('Escape'); await wait(200);
      for (const t of ['upgrade', 'move', 'bulldoze']) { await page.click(`#bbar button[data-bb=tool][data-v=${t}]`); await wait(200); await look(`career-bar-${t}`); await page.keyboard.press('Escape'); await wait(150); }
      await page.click('#bbar button[data-bb=tool][data-v=info]'); await wait(300); await look('career-bar-info');
      if (!(await ev(`!!IC.bb.view`))) problems.push('career: the info view did not open from the build bar');
      await page.keyboard.press('Escape'); await wait(150);
    }
  }
  await run(3, 4); await wait(500); await clear(); await look('career-3h');
  // the menu: save, quit to the main menu, and Continue (Esc backs out of one thing at a time, then opens the menu)
  const openMenu = async () => { for (let i = 0; i < 8 && !(await ev(`!document.getElementById('menu').hidden`)); i++) { await page.keyboard.press('Escape'); await wait(150); } };
  await openMenu(); await look('career-menu');
  await page.click('#menu button[data-act=saveQuick]'); await wait(1500);
  const saved = await ev(`IC.S.time`);
  await openMenu();
  await page.click('#menu button[data-act=restart]'); await wait(1500); await ready();
  await look('start-after-quit');
  await page.click('#stContinue'); await wait(1000);
  await page.waitForFunction(() => IC.loading === false && document.getElementById('loading').hidden, null, { timeout: 180000 }); await wait(800);
  const back = await ev(`IC.S.mode === 'story' && Math.abs(IC.S.time - ${saved}) < 3600`);
  if (!back) problems.push('career: Continue did not bring back the game that was saved');
  await look('career-continued');

  console.log('Quick war');
  await ev(`IC.showStart()`); await wait(500); await ready();
  await page.click('#st-main button[data-v=campaign]'); await wait(500); await ready(); await wait(1000);
  await clear(); await look('quickwar');
  await run(5, 2); await wait(500); await clear(); await look('quickwar-5h');
  for (const k of ['a', 'l', 'i', 'r', 'v', 'e', 'j']) { await page.keyboard.press(k); await wait(400); await look(`quickwar-room-${k}`); }
  await page.keyboard.press('Escape'); await wait(200);
  await ev(`IC.S.speed = 16; IC.S.paused = false`); await wait(3000); await look('quickwar-16x');

  console.log('Academy');
  for (const id of await ev(`IC.LESSONS.map(l => l.id)`)) {
    await ev(`IC.begin('academy', '${id}')`); await wait(300); await ready(); await wait(800);
    await clear(); await run(0.25, 0.5); await wait(300); await look(`academy-${id}`);
  }

  console.log('Test range and Sandbox');
  await ev(`IC.begin('range')`); await wait(300); await ready(); await wait(800); await clear(); await run(0.25, 0.5); await look('range');
  await ev(`IC.begin('sandbox')`); await wait(300); await ready(); await wait(800); await clear(); await run(1, 1); await look('sandbox');

  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}` : `\nSmoke run clean in ${Math.round((Date.now() - t0) / 1000)} s.`);
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
