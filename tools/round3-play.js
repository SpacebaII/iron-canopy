/* Round 3's recorded playthrough (docs/focus/round-3.md): a fresh Career from the start screen, played with real
   clicks and keys in headless Chromium at 1440 × 900. It founds an airport, orders the Starter, runs Finish now,
   plays to the first landing, then fixes a problem and signs a deal, counting the clicks each takes, and measures
   at each moment how much of the screen shows the map unobstructed (tools/mapshare.js). IC is read for positions
   and state; time is moved only by the speed keys, Wait and Finish now.
     python3 -m http.server 8777 &   (from the repository root)
     node tools/round3-play.js [--url=...] [--before]
   --before turns round 3 off (IC.FOCUS.screen, calm, hands and chain false) for the same moments as they were.
   Needs Playwright (npm i --no-save playwright). Saves JPGs to docs/focus/round-3/. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const share = require('./mapshare').src;
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8777/iron-canopy/index.html';
const BEFORE = process.argv.includes('--before');
const OUT = path.resolve(__dirname, '../docs/focus/round-3');
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
  const shares = {}, counts = {};
  const shot = async (name, measure) => {
    await page.screenshot({ path: path.join(OUT, (BEFORE ? 'before-' : '') + name + '.jpg'), type: 'jpeg', quality: 66 });
    if (measure !== false) { const r = await ev(share); shares[name] = Math.round(r.free * 100); log('shot', name, `map ${shares[name]}%`); } else log('shot', name);
  };
  const click = async (sel, o) => { await page.click(sel, Object.assign({ timeout: 8000 }, o)); clicks++; await page.waitForTimeout(300); };
  const clickXY = async (x, y) => { await page.mouse.click(x, y); clicks++; await page.waitForTimeout(300); };
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
  const look = async (x, y, z) => { await ev(`(() => { IC.cam.fly = null; IC.cam.z = ${z}; IC.centerOn(${x}, ${y}); })()`); await page.waitForTimeout(900); };
  const moments = {};
  const mark = k => { if (!moments[k]) { moments[k] = { s: +T(), clicks }; log('**', k); } };
  // counting the clicks for one task: from c0 to now
  const task = (k, c0, how) => { counts[k] = { clicks: clicks - c0, how }; log('task', k, clicks - c0, 'clicks:', how); };

  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  if (BEFORE) await ev('Object.assign(IC.FOCUS, { screen: false, calm: false, hands: false, chain: false })');
  await page.waitForTimeout(1500);
  await click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot('00-opening');
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
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(800);
  await shot('01-placing');
  await clickXY(p.x, p.y); await page.waitForTimeout(600);
  await click('#bldgo [data-go="build"]');
  await page.waitForTimeout(800);
  await click('#bbar [data-act="finishNow"]');
  for (let i = 0; i < 240; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; }
  await dismiss();
  mark('open');
  await key('Escape');
  // the airport selected, the whole of it in view
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`);
  await look(ap.x, ap.y, 7);
  await shot('02-airport');
  // 32× until the first airliner comes: the game eases to 1× and follows it in
  await key('6');
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(1000);
    if (i % 5 === 0) await dismiss(true);
    const st = await ev('({ first: !!IC.S.first, parked: IC.S.story.cnt.parked, paused: IC.S.paused })');
    if (st.paused) await ev('IC.S.paused = false');
    if (st.parked > 0) break;
  }
  mark('first landing');
  await page.waitForTimeout(1200);
  await shot('03-first-landing');
  await dismiss();
  // the airliner on its stand, clicked
  const tail = await ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}'); return tl ? tl.id : null; })()`);
  await key('2');
  if (tail) {
    const s = await ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.id === '${tail}'), a = S.byId['${capId}'], s = tl && tl.stand && IC.aptStands(a).find(x => x.id === tl.stand); return s ? { x: s.x, y: s.y } : null; })()`);
    if (s) { await look(s.x, s.y, 60); const q = await screenOf(s.x, s.y); await clickXY(q.x, q.y); await page.mouse.move(560, 860); await page.waitForTimeout(900); await shot('04-stand'); }
  }
  await ev('IC.S.follow = null');
  // money: what came in and went out this month
  {
    const c0 = clicks;
    if (BEFORE) { await click('#stat-money'); await page.waitForTimeout(700); await shot('05-money'); await key('Escape'); task('money', c0, 'Treasury → Economy room'); }
    else { await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await page.waitForTimeout(600); await shot('05-money'); task('money', c0, 'the money line is on screen'); }
  }
  // play on at 32× until something needs fixing at the airport (a deal at risk for want of a hangar, fuel queues,
  // stands full...), and an airline offers a deal
  const capView = async () => look(ap.x, ap.y, 6);
  const probs = () => ev(`IC.aptProblems(IC.S, IC.S.byId['${capId}']).map(p => ({ id: p.id, kind: p.kind, title: p.title, fix: p.fix && (p.fix.part || 'deal') }))`);
  const playUntil = async (cond, max) => {
    await key('6');
    for (let i = 0; i < (max || 240); i++) {
      await page.waitForTimeout(1000);
      if (i % 4 === 0) await dismiss();
      if (await ev('IC.S.paused')) await ev('IC.S.paused = false');
      if (await ev('IC.ui.room')) await key('Escape');
      const P = await probs(); const hit = cond(P); if (hit) { await ev('IC.waitStop && IC.waitStop(IC.S)'); await key('1'); return hit; }
      // (after a while at 32×, Wait: time runs a month a minute and stops when something needs the player)
      if (i >= 20 && i % 5 === 0 && !(await ev('!!IC.S.wait'))) { await key('7'); await page.waitForTimeout(300); const w = await page.$('.waitbar [data-act="wait"]'); if (w) await w.click(); else await key('6'); }
    }
    await key('1'); return null;
  };
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`);
  const prob = await playUntil(P => P.find(p => p.kind !== 'offer' && p.fix && p.fix !== 'deal'), 300);
  mark('a problem: ' + (prob ? prob.title : 'none'));
  if (prob) {
    await capView(); await page.mouse.move(300, 860); await page.waitForTimeout(1200);
    await shot('06-problem');
    const c0 = clicks;
    if (!BEFORE) {
      await click(`#pmarks [data-act="pmFix"][data-v="${prob.id}"]`);
      await page.waitForTimeout(1200);
      await shot('07-fix-placed');
      await click('#bldgo [data-go="build"]');
      task('fix', c0, `marker's "${prob.fix}" fix → Build`);
    } else {
      // the round-2 way: read it in the airport panel, then the build bar's Detail, the tab, the part, the map, Build
      const part = prob.fix, P = { hangar: 'cg', fuel: 'fs', fire: 'fs', tstraight: 'tm', ils: 'nv', cargoarea: 'cg' }[part];
      const near = await ev(`(() => { const p = IC.aptProblems(IC.S, IC.S.byId['${capId}']).find(x => x.id === '${prob.id}'); const m = IC.fixPlan(IC.S, IC.S.byId['${capId}'], p.fix.part, p.fix.near); return m ? m.at : p.fix.near; })()`);
      await clickXY(...Object.values(await screenOf(ap.x, ap.y)));
      if (!(await page.$('#bbar:not([hidden]) [data-bb="detail"]'))) await click('#sys [data-act="bbToggle"]');
      if (part === 'tstraight' || part === 'cargoarea') { await click(`#bbar [data-bb="tab"][data-v="pc"]`); await click(`#bbar [data-bb="item"][data-v="${part}"]`); }
      else { if (!(await page.$('#bbar [data-bb="detail"].on'))) await click('#bbar [data-bb="detail"]'); await click(`#bbar [data-bb="tab"][data-v="${P}"]`); await click(`#bbar [data-bb="item"][data-v="${part}"]`); }
      await page.waitForTimeout(800);
      const q = await screenOf(near.x, near.y); await page.mouse.move(q.x, q.y); await page.waitForTimeout(400); await clickXY(q.x, q.y);
      await page.waitForTimeout(600); await shot('07-fix-placed');
      await click('#bldgo [data-go="build"]').catch(() => log('no Build button'));
      task('fix', c0, 'select the airport, Build bar: Detail → tab → part → click the map → Build');
    }
    const fixed0 = await ev(`IC.S.byId['${capId}'].works.length`);
    log('works queued', fixed0);
    if (fixed0) { await click('#bbar [data-act="finishNow"]').catch(() => {}); for (let i = 0; i < 120; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; } }
    await dismiss(); await key('Escape');
    if (await page.$('#bbar:not([hidden]) [data-bb="close"]')) await click('#bbar [data-bb="close"]');
    const still = (await probs()).some(p => p.id === prob.id);
    log('problem still there after the fix:', still);
    counts.fix.solved = !still;
  }
  // an airline's offer: signed where it shows
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`);
  const offer = await playUntil(P => P.find(p => p.kind === 'offer'), 400);
  mark('an offer: ' + (offer ? offer.title : 'none'));
  if (offer) {
    await capView(); await page.mouse.move(300, 860); await page.waitForTimeout(1200);
    await shot('08-offer');
    const c0 = clicks, d0 = await ev('IC.S.av.deals.length');
    if (!BEFORE) {
      await click(`#pmarks [data-act="pmGo"][data-v="${offer.id}"]`);
      await page.waitForTimeout(900); await shot('09-deal-card');
      const ok = await page.$('#insp [data-act="avYes"]:not([disabled])');
      if (ok) { await click('#insp [data-act="avYes"]:not([disabled])'); task('deal', c0, 'the offer\'s marker → Sign'); }
      else {
        log('cannot sign yet:', await ev(`(document.querySelector('#insp .dl-why') || {}).textContent`));
        task('deal', c0, 'the offer\'s marker opens its card (it cannot be signed yet)');
        // what it lacks, from the button under its card: placed, built, finished, then Sign
        const fx = await page.$(`#insp [data-act="pmFix"][data-v="${offer.id}"]`);
        if (fx) {
          const c1 = clicks;
          await click(`#insp [data-act="pmFix"][data-v="${offer.id}"]`); await page.waitForTimeout(1200); await shot('09b-offer-fix');
          await click('#bldgo [data-go="build"]').catch(() => log('no Build'));
          await click('#bbar [data-act="finishNow"]').catch(() => {});
          for (let i = 0; i < 180; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; }
          await dismiss();
          if (await page.$('#bbar:not([hidden]) [data-bb="close"]')) await click('#bbar [data-bb="close"]');
          await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await page.waitForTimeout(800);
          const ok2 = await page.$('#insp [data-act="avYes"]:not([disabled])');
          if (ok2) await click('#insp [data-act="avYes"]:not([disabled])'); else log('still cannot sign:', await ev(`(document.querySelector('#insp .dl-why') || {}).textContent`));
          task('dealFix', c1, 'under the card: build what it lacks → Build → Finish now → Sign');
        }
      }
    } else {
      await click('#rail-aviation'); await click('[data-act="sub"][data-v="deals"]');
      await page.waitForTimeout(700); await shot('09-deal-card');
      const ok = await page.$('[data-act="avYes"]:not([disabled])');
      if (ok) await click('[data-act="avYes"]:not([disabled])'); else log('cannot sign');
      await key('Escape');
      task('deal', c0, 'Aviation room → Deals → Sign');
    }
    counts.deal.signed = (await ev('IC.S.av.deals.length')) > d0;
    await page.waitForTimeout(800);
    await shot('10-after-sign');
  }
  // the chain on the map
  if (!BEFORE) {
    await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await page.waitForTimeout(500);
    await click('#insp [data-act="chainTog"]'); await look(ap.x, ap.y, 1.2); await page.waitForTimeout(1200); await shot('11-chain');
    await look(ap.x, ap.y, 0.25); await page.waitForTimeout(1200); await shot('12-chain-region');
    await click('#insp [data-act="chainTog"]');
  }
  // the parts as the interface: a runway, the terminal, the fuel farm, each with its live state and actions
  if (!BEFORE) for (const [k, name] of [['runway', '13-runway'], ['terminal', '14-terminal'], ['fuel', '15-fuel'], ['fire', '16-fire']]) {
    const at = await ev(`(() => { const a = IC.S.byId['${capId}'], p = a.parts.find(q => q.kind === '${k}' && q.built); if (!p) return null; IC.select({ kind: 'apart', ref: p, ap: a }); const c = p.kind === 'runway' ? { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 } : p; return { x: c.x, y: c.y }; })()`);
    if (!at) continue;
    await look(at.x, at.y, k === 'runway' ? 5 : 14); await page.waitForTimeout(700); await shot(name);
  }
  const econ = await ev(`(() => { const L = IC.moneyLine(IC.S), st = IC.monthStatement(IC.S, 0); return { line: L && L.text, stmtNet: st.net, lineNet: L && L.net }; })()`);
  console.log(JSON.stringify({ before: BEFORE, moments, shares, counts, econ, errors }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
