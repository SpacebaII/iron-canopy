/* Round 5b's playthrough (docs/focus/round-5b.md): round 5a's player with its radar rule fixed (one civil radar in
   the middle of each airway that has none, never more), the money floor and the held departures recorded, and at
   the end the new screens: the day board, the scorecards, the ground fleet, and each tutorial walked through by
   clicking the real buttons (each step must advance on the click). Based on round 5a's benchmark playthrough
   (docs/focus/round-5a-benchmark.md): round 4's player, with a screenshot for each
   checklist item (the Starter's ghost, construction, the first turnaround at stand zoom, night, a problem marker, the
   chain at region zoom, the rooms) and a timed look at Chapter 3. Based on: Round 4's recorded playthrough (docs/focus/round-4.md): a fresh Career from the start screen in headless Chromium
   at 1440 × 900, played for --min minutes of real time (30 by default) the way a steady player would: found the
   airport, order the Starter, Finish now, then watch at 32× and use Wait when there is nothing to do; answer every
   card (the first choice, as the scripted Career player does), sign what the airport can carry, build what the
   markers and the goals ask for with their own fix (placed by the game), and take the piece a milestone opens.
   It records, against real time: every goal done, every event (deck cards, the story's cards, milestones, visitors,
   offers, chapters), and the treasury, and prints the pacing at the end.
     python3 -m http.server 8777 &   (from the repository root)
     node tools/round4-play.js [--min=30] [--before] [--url=...]
   --before turns round 4 off (IC.FOCUS.progress false). Needs Playwright (npm i --no-save playwright).
   Saves JPGs to docs/focus/round-4/. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8777/iron-canopy/index.html';
const BEFORE = process.argv.includes('--before');
const MIN = +(arg('min') || 30);
const OUT = path.resolve(__dirname, '../docs/focus/round-5b');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now();
  const T = () => (Date.now() - t0) / 60000;
  const log = (...a) => console.log(`[${T().toFixed(1)} min]`, ...a);
  const ev = s => page.evaluate(s);
  const shots = new Set();
  const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: path.join(OUT, (BEFORE ? 'before-' : '') + name + '.jpg'), type: 'jpeg', quality: 55 }); log('shot', name); };
  const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(150); };
  const look = async (x, y, z) => { await ev(`(() => { IC.cam.fly = null; IC.cam.z = ${z}; IC.centerOn(${x}, ${y}); })()`); await page.waitForTimeout(700); };
  const dismissHints = async () => { for (let i = 0; i < 6; i++) { const b = await page.$('[data-act="hintOk"]:visible'); if (!b) break; await b.click().catch(() => {}); await page.waitForTimeout(200); } };

  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  if (BEFORE) await ev('IC.FOCUS.slots = false; IC.FOCUS.gse = false');
  await page.waitForTimeout(1500);
  await page.click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  // the record: what happens, against real time (performance.now) and the game's clock
  await ev(`(() => { window.__r4 = []; const keep = { goal: d => d.text, event: d => d.title, deckCard: d => d.key, milestone: d => String(d.n), rareVisitor: d => d.type, request: d => IC.avAirline(IC.S, d.al).name + (d.renew ? ' (renewal)' : ''), storyChapter: d => String(d), approve: () => '', dealDone: d => '', weather: d => d };
    IC.on((S, type, d) => { if (S === IC.S && keep[type]) { let w = ''; try { w = keep[type](d) || ''; } catch (e) {} __r4.push({ type, what: w, real: performance.now(), game: S.time }); } });
    window.__cards = 0; window.__t0 = performance.now(); })()`);
  await page.waitForTimeout(2000);
  await shot('00-opening');
  // the round-1 opening, as round 3 played it: found, the Starter, Finish now
  for (let i = 0; i < 6; i++) { await dismissHints(); const c = await page.$('#cine:not([hidden])'); if (c) { await c.click({ position: { x: 20, y: 20 } }); await page.waitForTimeout(700); } else break; }
  await page.click('[data-act="bbToggle"]'); await page.waitForTimeout(300);
  await page.click('#bbar [data-act="foundMode"]'); await page.waitForTimeout(400);
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y, cx: c.x, cy: c.y }; } return null; })()`);
  await ev(`IC.cam.fly = null; IC.frame(${Math.min(site.x, site.cx) - 60}, ${Math.min(site.y, site.cy) - 60}, ${Math.max(site.x, site.cx) + 60}, ${Math.max(site.y, site.cy) + 60})`);
  await page.waitForTimeout(600);
  const scr = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  let p = await scr(site.x, site.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(400); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500);
  await page.click('#bldgo [data-go="build"]'); await page.waitForTimeout(1500);
  await dismissHints();
  const capId = await ev('IC.S.story.cap');
  await page.click('#bbar [data-bb="tab"][data-v="bq"]'); await page.waitForTimeout(300);
  await page.click('#bbar [data-bb="item"][data-v="starter"]'); await page.waitForTimeout(1200);
  const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y }; })()`);
  p = await scr(ap.x, ap.y + 2); await page.mouse.move(p.x, p.y); await page.waitForTimeout(600); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500);
  await shot('02-starter-ghost');
  await page.click('#bldgo [data-go="build"]'); await page.waitForTimeout(600);
  await page.click('#bbar [data-act="finishNow"]');
  for (let i = 0; i < 300; i++) { await page.waitForTimeout(1000); if (i === 4) { await look(ap.x, ap.y, 14); await shot('03-construction'); await look(ap.x, ap.y, 6); } if (!(await ev('!!IC.S.wait'))) break; }
  await shot('04-built');
  log('open for business');
  await key('Escape');
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`);
  await look(ap.x, ap.y, 6);
  await key('6');

  // ---------- the player ----------
  const money = [], seenCards = []; let floor = Infinity, held = 0;
  let lastAct = Date.now(), lastWait = 0, lastBuild = 0;
  const state = () => ev(`(() => { const S = IC.S, st = S.story, a = S.byId['${capId}'], ML = IC.moneyLine(S);
    const g = st.goals.find(x => !x.done && !x.failed);
    return { budget: S.budget, paused: S.paused, wait: !!S.wait, room: !!IC.ui.room, works: a.works.length, ch: st.ch, act: st.act,
      goal: g ? g.text : '', gid: g ? g.id : '', gives: g && g.gives || '', ev: st.events.length, ml: ML ? (ML.short || ML.sign) : '', date: IC.U.clock(S.time, S), cards: S.camp.cards.length, play: st.play || 0,
      probs: IC.aptProblems(S, a).map(p => ({ id: p.id, kind: p.kind, title: p.title, fix: p.fix && p.fix.part, size: p.fix && p.fix.size, req: p.req, deal: p.deal })) }; })()`);
  // a problem or a goal's fix, placed by the game where it fits, built, and run through
  const tried = new Set();
  const build = async (part, near, label, size, id) => {
    if (Date.now() - lastBuild < 8000 || (id && tried.has(id))) return false;
    if (id) tried.add(id);
    const ok = await ev(`(() => { const S = IC.S, a = S.byId['${capId}']; if (S.budget < 250) return false; IC.fixOpen(S, a, '${part}', ${near}, ${size ? `'${size}'` : 'null'}); return !!(S.mode2 && S.mode2.kind === 'build'); })()`);
    if (!ok) return false;
    lastBuild = Date.now();
    await page.waitForTimeout(500);
    const b = await page.$('#bldgo [data-go="build"]'); if (!b) { await key('Escape'); return false; }
    await b.click(); await page.waitForTimeout(400);
    log('built:', label);
    const fin = await page.$('#bbar [data-act="finishNow"]'); if (fin) { await fin.click().catch(() => {}); for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; } }
    await key('Escape'); if (await page.$('#bbar:not([hidden]) [data-bb="close"]')) await page.click('#bbar [data-bb="close"]').catch(() => {});
    await key('6'); lastAct = Date.now();
    return true;
  };
  const termNear = `(() => { const a = IC.S.byId['${capId}'], t = a.parts.find(q => q.kind === 'terminal' && q.built) || a; return { x: t.x, y: t.y }; })()`;
  while (T() < MIN) {
    await page.waitForTimeout(1000);
    await dismissHints();
    const s = await state();
    floor = Math.min(floor, s.budget);
    held = Math.max(held, await ev(`(() => { const S = IC.S; let w = 0; for (const t of S.av.tails) if (t.where === 'stand' && t.held && t.held.k !== 'night' && t.held.k !== 'slot') w = Math.max(w, S.time - t.held.t0); return w; })()`));
    if (s.room) await key('Escape');
    // cards: read, then on
    const cine = await page.$('#cine:not([hidden])');
    if (cine) {
      const t = await ev(`(document.querySelector('#cine h2') || {}).textContent || ''`);
      if (!seenCards.includes(t)) { seenCards.push(t); log('card:', t);
        if (/passengers a day/.test(t)) await shot(BEFORE ? 'milestone' : '04-milestone');
        else if (/^Chapter 3/.test(t)) await shot('07-chapter3'); }
      // a milestone's piece: placed by the game beside the terminal, and built
      const fx = await page.$('#cine [data-act="buildPick"]');
      const v = fx ? await fx.getAttribute('data-v') : null;
      await cine.click({ position: { x: 20, y: 20 } }).catch(() => {}); await page.waitForTimeout(500);
      if (v && v !== 'rwkit') await build(v, termNear, 'the milestone\'s ' + v);
    }
    const card = await page.$('#evcard:not([hidden]) .opt');
    if (card) {
      const t = await ev(`(document.querySelector('#evcard h2') || {}).textContent || ''`);
      log('decision:', t);
      if (!shots.has('03-decision')) await shot('03-decision');
      // (the airspace: the consultants draw the entry points and airways, as a player short of time would choose)
      const pick = /sky with a plan/i.test(t) ? (await page.$$('#evcard:not([hidden]) .opt'))[1] : card;
      await (pick || card).click().catch(() => {}); await page.waitForTimeout(400); await key('6'); lastAct = Date.now();
      continue;
    }
    if (s.paused) await ev('IC.S.paused = false');
    if (!shots.has('01-next-goal') && s.gid) { await page.waitForTimeout(500); await shot('01-next-goal'); }
    // offers: signed at the airport when the airport can carry them
    const off = s.probs.find(q => q.kind === 'offer');
    if (off) {
      const signed = await ev(`(() => { const S = IC.S, q = S.av.requests.find(x => x.id === '${off.req}'); if (!q || IC.avReqBlock(S, q)) return false; return IC.avDecide(S, q.id, true); })()`);
      if (signed) { log('signed:', off.title); lastAct = Date.now(); continue; }
      if (off.fix && off.fix !== 'deal' && await build(off.fix, `(IC.aptProblems(IC.S, IC.S.byId['${capId}']).find(p => p.id === '${off.id}') || { fix: {} }).fix.near`, 'for an offer: ' + off.fix, off.size, off.id)) continue;
    }
    // problems with a fix on the map
    const pr = s.probs.find(q => q.kind !== 'offer' && q.fix && q.fix !== 'ils');
    if (pr && await build(pr.fix, `(IC.aptProblems(IC.S, IC.S.byId['${capId}']).find(p => p.id === '${pr.id}') || { fix: {} }).fix.near`, pr.title, pr.size, pr.id)) continue;
    // the airspace chapter: a civil radar where the airways are least seen, an approach radar beside the runway
    // (round 5b: at most one radar per airway, in its middle; round 5a's rule placed one every 20 s at the first fix)
    if (s.ch === 2 && /civil radar/.test(s.goal) && Date.now() - lastBuild > 20000) { lastBuild = Date.now(); const r = await ev(`(() => { const S = IC.S; if (S.budget < 150 || S.units.some(u => u.type === 'ssr' && u.state !== 'ready')) return false;
      for (const w of S.asp.ways) { const [a, b] = IC.aspWayEnds(S, w), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, L = IC.U.dist(a, b); if (S.units.some(u => u.type === 'ssr' && IC.U.segDist(u.x, u.y, a.x, a.y, b.x, b.y) < L / 3)) continue;
        const p = IC.findSpot(S, 'ssr', m.x, m.y, 0, 300); if (p && IC.deploy(S, 'ssr', p.x, p.y)) return true; } return false; })()`); if (r) log('built: a civil radar'); }
    if (s.ch === 2 && /approach radar/.test(s.goal) && !s.works && await build('atc', `(() => { const r = IC.S.byId['${capId}'].parts.find(q => q.kind === 'runway' && q.built); return { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }; })()`, 'an approach radar')) continue;
    // the goal line: more stands when it asks for them
    if (/stands/.test(s.goal) && !s.works && await build('tstraight', termNear, 'stands for the goal')) continue;
    if (Date.now() - money.length * 0 && (!money.length || T() - money[money.length - 1].min >= 0.5)) money.push({ min: +T().toFixed(1), budget: Math.round(s.budget), ml: s.ml, date: s.date, ch: s.ch, goal: s.goal });
    // the first turnaround at stand zoom, with the aircraft's panel open
    if (!shots.has('05-turnaround')) { const tl = await ev(`(() => { const S = IC.S, t = S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}'); if (!t) return null; const a = S.byId['${capId}'], s = IC.aptStands(a).find(q => q.occ === t.id) || null; return { id: t.id, x: s ? s.x : null, y: s ? s.y : null }; })()`);
      if (tl && tl.x != null) { await ev(`IC.select({ kind: 'tail', ref: IC.S.av.tails.find(t => t.id === '${tl.id}') })`); await key('2'); await look(tl.x, tl.y, 60); await shot('05-turnaround'); await look(tl.x, tl.y, 25); await shot('05b-stand-z25'); await key('Escape'); await key('6'); } }
    if (!shots.has('09-problem') && s.probs.some(q => q.kind !== 'offer')) { await look(ap.x, ap.y, 6); await shot('09-problem'); log('problem:', s.probs.filter(q => q.kind !== 'offer').map(q => q.title).join(' | ')); }
    if (!shots.has('11-night') && T() > 6) { const n = await ev('IC.daylight(IC.S.time) < 0.2'); if (n) { await key('2'); await look(ap.x, ap.y, 6); await shot('11-night'); await look(ap.x, ap.y, 22); await shot('11b-night-z22'); const q = await ev(`IC.S.byId['${capId}'].moves.length`); log('night: moves', q); await key('6'); } }
    if (!shots.has('12-chain') && T() > 9) { await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await page.waitForTimeout(500); const b = await page.$('#insp [data-act="chainTog"]'); if (b) { await b.click(); await look(ap.x, ap.y, 0.25); await page.waitForTimeout(1500); await shot('12-chain'); await look(ap.x, ap.y, 1.2); await page.waitForTimeout(1200); await shot('12b-chain-near'); await page.click('#insp [data-act="chainTog"]').catch(() => {}); } await look(ap.x, ap.y, 6); }
    if (s.ch === 2 && !shots.has('13-ch3')) { await shot('13-ch3'); log('chapter 3 goal:', s.goal); }
    if (s.ch >= 3 && !shots.has('14-ch4')) { await shot('14-ch4'); log('chapter 4 goal:', s.goal); }
    if (!shots.has('02-money') && T() > 12) { await look(ap.x, ap.y, 6); await shot('02-money'); }
    if (!shots.has('05-later') && T() > 24) { await look(ap.x, ap.y, 6); await shot('05-later'); }
    // nothing to do for a while: Wait, as a player would (it stops when something needs them)
    if (!s.wait && !s.works && Date.now() - lastAct > 25000 && Date.now() - lastWait > 30000) {
      lastWait = Date.now();
      await key('7'); await page.waitForTimeout(400);
      const w = await page.$('.waitbar [data-act="wait"]'); if (w) { await w.click().catch(() => {}); log('Wait'); } else await key('6');
    }
  }
  await key('1');
  await look(ap.x, ap.y, 6); await shot('06-end');
  await page.click('#stat-money').catch(() => {}); await page.waitForTimeout(900); await shot('08-economy'); await key('Escape');
  const fin = await ev(`(() => { const S = IC.S, a = S.byId['${capId}'], st = IC.aptStats(S, a), L = IC.aptDayLog(S, a), P = L.prev || L; let night = 0; for (let h = 0; h < 24; h++) if (h >= 23 || h < 6) night += P.arr[h] + P.dep[h];
    return { ch: S.story.ch, goal: (S.story.goals.find(g => !g.done && !g.failed) || {}).text, warn: st.warn, deals: S.av.deals ? S.av.deals.length : null, tails: S.av.tails.filter(t => t.base === a.id || t.at === a.id).length, pax: Math.round(a.paxRate || 0), budget: Math.round(S.budget), date: IC.U.clock(S.time, S),
      movesHour: (a.mvLog || []).length, capMoves: st.movesPerHour, dayMoves: P.arr.reduce((x, y) => x + y, 0) + P.dep.reduce((x, y) => x + y, 0), busiest: Math.max(...P.arr.map((v, i) => v + P.dep[i])), night, fleet: a.fleet ? { tug: a.fleet.tug, bus: a.fleet.bus, fuel: a.fleet.fuel } : null,
      holds: IC.aptHolds(S, a).map(h => h.k + ':' + h.n + ':' + Math.round(h.wait / 60)), radars: S.units.filter(u => u.type === 'ssr').length }; })()`).catch(e => String(e));
  fin.floor = Math.round(floor); fin.heldMaxMin = Math.round(held / 60);
  console.log('FINAL', JSON.stringify(fin));
  // ---------- the new screens, and each tutorial walked through on the real buttons ----------
  await ev(`(() => { IC.S.paused = true; IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] }); IC.ui.aptTab = 'info'; IC.ui.inspMin = false; })()`);
  await look(ap.x, ap.y, 4);
  const tut = {};
  const tryClick = async sel => { const e = await page.$(sel); if (!e) return false; await e.scrollIntoViewIfNeeded().catch(() => {}); await e.click().catch(() => {}); await page.waitForTimeout(500); return true; };
  const walk = async (id, acts) => {
    await ev(`IC.ui.tutorGo('${id}')`); await page.waitForTimeout(900);
    const r = [];
    for (let i = 0; i < acts.length; i++) {
      const now = await ev(`(() => { const N = IC.tutorNow(IC.S); if (!N) return null; const e = IC.hint.find(N.step.el); const b = e && e.getBoundingClientRect(); return { i: N.i, on: !!(b && b.width && e.offsetParent !== null), ring: !!document.querySelector('#hints .hnote') }; })()`);
      r.push(now);
      if (!now) break;
      if (i === 1 || (i === 0 && id === 'treasury')) await shot(`20-tutor-${id}-${i + 1}`);
      await tryClick(acts[i]);
    }
    const end = await ev(`IC.tutorSeen(IC.S, '${id}')`);
    tut[id] = { steps: r, finished: end };
    log('tutorial', id, JSON.stringify(tut[id]));
  };
  await walk('dayboard', ['#insp [data-act="aptOpen"][data-v="day"]', '#insp .dcap [data-act="dayCap"]:not([aria-pressed="true"])', '#insp .dbanks [data-act="dayShift"][data-v="1"]', '#insp .dnight [data-act="dayNight"][data-v="quota"]']);
  await ev(`IC.ui.aptOpen.day = true`); await page.waitForTimeout(600); await shot('21-dayboard');
  await walk('scorecards', ['#insp [data-act="aptOpen"][data-v="score"]', '#insp .t.score [data-act="pmFix"]']);
  await ev(`(() => { IC.ui.aptOpen.day = false; IC.ui.aptOpen.score = true; })()`); await page.waitForTimeout(600); await shot('22-scorecards');
  await walk('fleet', ['#insp [data-act="aptOpen"][data-v="fleet"]', '#insp .fleet [data-act="gseAdd"][data-v="tug"][data-n="1"]', '#insp .fleet [data-act="gseAuto"]']);
  await tryClick('#insp .fleet [data-act="gseAuto"]');
  await ev(`(() => { IC.ui.aptOpen.score = false; IC.ui.aptOpen.fleet = true; })()`); await page.waitForTimeout(600); await shot('23-fleet');
  // the Treasury: the money taken below zero for the look, then put back
  const keep = await ev('IC.S.budget');
  await ev('IC.S.budget = -900; IC.redTick(IC.S)'); await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) { const c = await page.$('#evcard:not([hidden])'); if (!c) break; await shot('24-treasury-card'); await page.click('#evcard:not([hidden]) .opt').catch(() => {}); await page.waitForTimeout(500); }
  await walk('treasury', ['#rail-economy', '[data-act="redLoan"]']);
  await page.waitForTimeout(500); await key('Escape');
  await ev(`IC.S.budget = ${keep}`);
  // a departure held for a tug, on the map, with its fix
  await ev(`(() => { const a = IC.S.byId['${capId}']; IC.gseAuto(IC.S, a, false); a.fleet.tug = 0; IC.S.paused = false; })()`);
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(1000); if (await ev(`IC.aptProblems(IC.S, IC.S.byId['${capId}']).some(p => p.hold === 'tug')`)) break; }
  await ev('IC.S.paused = true'); await look(ap.x, ap.y, 6); await page.waitForTimeout(800); await shot('25-tug-hold');
  console.log('TUTORIALS', JSON.stringify(tut));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  // ---------- the pacing ----------
  const rec = await ev('__r4.map(r => ({ type: r.type, what: r.what, min: (r.real - __t0) / 60000, game: r.game }))');
  const t1 = rec.find(r => r.type === 'storyChapter' && r.what === '1');   // the first airliner: the airport is open
  const from = t1 ? t1.min : 0;
  const EVENT = { event: 1, deckCard: 0, milestone: 1, rareVisitor: 1, storyChapter: 1, request: 1 };
  const evs = rec.filter(r => EVENT[r.type] && r.min >= from - 0.01), goals = rec.filter(r => r.type === 'goal');
  const gap = L => { const m = [from].concat(L.map(r => r.min)).concat([T()]); let g = 0; for (let i = 1; i < m.length; i++) g = Math.max(g, m[i] - m[i - 1]); return g; };
  const kinds = {}; for (const r of evs) { const k = r.type === 'event' ? 'card: ' + r.what : r.type === 'request' ? 'offer' : r.type; kinds[k] = (kinds[k] || 0) + 1; }
  const wx = rec.filter(r => r.type === 'weather').length;
  const out = { before: BEFORE, minutes: +T().toFixed(1), openAt: +from.toFixed(1), goals: goals.length, goalGapMax: +gap(goals).toFixed(1), events: evs.length, eventGapMax: +gap(evs).toFixed(1), distinctEvents: Object.keys(kinds).length, weatherLines: wx, kinds,
    timeline: rec.filter(r => r.type !== 'weather' && r.type !== 'approve' && r.type !== 'dealDone').map(r => `${r.min.toFixed(1)} ${r.type} ${r.what}`), money: money.filter((m, i) => i % 4 === 0), errors };
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(OUT, (BEFORE ? 'before-' : '') + 'pacing.json'), JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
