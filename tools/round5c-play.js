/* Round 5c's playthrough (docs/focus/round-5c.md): round 5b's steady player (tools/round5b-play.js) as a new player
   who follows the tutorials. It plays a fresh Career from the start screen in headless Chromium at 1440 × 900 for
   --min minutes of real time, and every time a tutorial shows a step it does what the step says, with a real click
   on the element it rings or the place on the map it points at, then checks that the step moved on. Chapter 3's
   radars go where the game's own marker says (the biggest gap), one at a time, as the goal's tip counts them.
   It records the pacing (goals, events, milestones), each tutorial's steps, and the evidence for the 12-point
   checklist (docs/focus/plan.md), with a screenshot for each.
     python3 -m http.server 8779 &   (from the repository root)
     node tools/round5c-play.js [--min=30] [--url=...] [--out=round-5c] [--before]
   --before plays a checkout without the round 5c tutorials (point --url at it): the opening is clicked the same
   way, nothing is waited for. Needs Playwright (npm i --no-save playwright). Saves JPGs to docs/focus/<out>/. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8779/iron-canopy/index.html';
const BEFORE = process.argv.includes('--before');
const MIN = +(arg('min') || 30);
const OUT = path.resolve(__dirname, '../docs/focus/' + (arg('out') || 'round-5c'));
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
  const shot = async (name, force) => { if (shots.has(name) && !force) return; shots.add(name); await page.screenshot({ path: path.join(OUT, (BEFORE ? 'before-' : '') + name + '.jpg'), type: 'jpeg', quality: 58 }); log('shot', name); };
  let clicks = 0;
  const click = async (sel, o) => { const e = typeof sel === 'string' ? await page.$(sel) : sel; if (!e) return false; await e.scrollIntoViewIfNeeded().catch(() => {}); await e.click(o).catch(() => {}); clicks++; await page.waitForTimeout(350); return true; };
  const key = async k => { await page.keyboard.press(k); clicks++; await page.waitForTimeout(150); };
  const look = async (x, y, z) => { await ev(`(() => { IC.cam.fly = null; IC.cam.z = ${z}; IC.centerOn(${x}, ${y}); })()`); await page.waitForTimeout(700); };
  const scr = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  const mapClick = async (x, y, btn) => { const p = await scr(x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(250); await page.mouse.click(p.x, p.y, btn ? { button: btn } : undefined); clicks++; await page.waitForTimeout(450); };
  const dismissHints = async () => { for (let i = 0; i < 6; i++) { const b = await page.$('[data-act="hintOk"]:visible'); if (!b) break; await b.click().catch(() => {}); await page.waitForTimeout(200); } };
  const cardsAway = async () => { for (let i = 0; i < 6; i++) { const c = await page.$('#cine:not([hidden])'); if (!c) break; await c.click({ position: { x: 20, y: 20 } }); clicks++; await page.waitForTimeout(600); } };

  // ---------- the tutorials, as a player who reads the note and does what it says ----------
  const TUT = {}; // id -> { steps: [{ i, did, moved, t }], done }
  const tutNow = () => ev(`(() => { const N = IC.tutorNow ? IC.tutorNow(IC.S) : null; if (!N) return null; const n = document.querySelector('#hints .hnote:not([hidden])');
    return { id: N.id, i: N.i, n: N.n, note: !!n, text: n ? n.innerText.replace(/\\s+/g, ' ').slice(0, 160) : '' }; })()`);
  const tutShot = new Set();
  // what a step asks for, done on the real page; returns what was done
  const doStep = async (N, ctx) => {
    const id = N.id, i = N.i;
    // the element it rings: the note's own target
    // (the element the note rings when it is on screen, else the place on the map)
    const sel = await ev(`(() => { const N = IC.tutorNow(IC.S); const show = N && IC.TUTORS[N.id].steps[N.i]; if (!show || !show.el) return null; const e = IC.hint.find(show.el); if (!e || e.offsetParent === null) return null; e.setAttribute('data-tut-target', '1'); return true; })()`);
    const at = sel ? null : await ev(`(() => { const N = IC.tutorNow(IC.S); const s = N && IC.TUTORS[N.id].steps[N.i]; if (!s || !s.at) return null; const p = s.at(IC.S); return p ? { x: p.x, y: p.y } : null; })()`);
    if (id === 'follow' && i === 1) { const w = await ev(`(() => { const tl = IC.followTail(IC.S) || IC.S.av.tails.find(t => t.id === (IC.S.first || {}).tl); const w = tl && IC.tailWhere(IC.S, tl); return w ? { x: w.x, y: w.y } : null; })()`); if (w) { const p = await scr(w.x, w.y); await page.mouse.move(p.x, p.y); for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(120); } clicks++; return 'zoomed in on the stand'; } }
    if (sel) {
      const el = await page.$('[data-tut-target="1"]');
      await ev(`document.querySelectorAll('[data-tut-target]').forEach(e => e.removeAttribute('data-tut-target'))`);
      // (a ring round a row of buttons: the player presses one of them, one not already on)
      const inner = el && await el.evaluate(e => e.tagName !== 'BUTTON' && !!e.querySelector('button')) ? await el.$('button:not([aria-pressed="true"]):not([disabled]):not(.on)') : null;
      if (inner) { await click(inner); return 'pressed a button in the ringed row'; }
      if (el) { await click(el); return 'clicked the ringed button'; }
    }
    if (at) {
      // (off the screen: the note's own button takes the camera there first)
      const lookBtn = await page.$('#hints [data-act="tutorLook"]'); if (lookBtn) { await click(lookBtn); await page.waitForTimeout(1500); return 'pressed Show me where'; }
      if (id === 'pieces' || id === 'buildesc') {
        // beside the parallel taxiway: the first spot the plan fits, as a player tries one
        const q = await ev(`(() => { const S = IC.S, m = S.mode2; if (!m || m.kind !== 'build') return null; if (m.set && m.at) return { x: m.at.x + 0.6, y: m.at.y + 0.4 };
          const a = S.byId[S.story.cap]; for (let k = 0; k < 80; k++) { const ang = k * 0.61, d = 3 + k * 0.35, p = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d }; const pl = IC.bldPlanOf(S, m, p, 0.12, false, true); if (pl && pl.ok && (pl.bp || (pl.specs && pl.specs.length))) return p; } return null; })()`);
        if (q) { await mapClick(q.x, q.y); return 'placed it beside the taxiway'; }
      }
      if (id === 'radar') { const q = await ev(`(() => { const g = IC.radarGap(IC.S); return g && IC.findSpot(IC.S, 'ssr', g.at.x, g.at.y, 0, 300); })()`); if (q) { await look(q.x, q.y, 0.08); await mapClick(q.x, q.y); return 'placed the radar on the marker'; } }
      if (id === 'airspace' && i === 2) { await mapClick(at.x, at.y); await mapClick(at.x, at.y, 'right'); return 'laid the airway to the capital'; }
      await mapClick(at.x, at.y); return 'clicked where the ring is';
    }
    return null;
  };
  const tutorials = async ctx => {
    if (BEFORE) return false;
    let did = false;
    for (let k = 0; k < 8; k++) {
      const N = await tutNow(); if (!N || !N.note) break;
      const rec = TUT[N.id] = TUT[N.id] || { steps: [], done: false };
      if (!tutShot.has(N.id + N.i) && (N.i === 0 || ['found', 'starter', 'radar', 'deals', 'follow', 'deck', 'milestone'].includes(N.id))) { tutShot.add(N.id + N.i); await shot(`t-${N.id}-${N.i + 1}`); }
      const what = await doStep(N, ctx);
      await page.waitForTimeout(700);
      const M = await tutNow();
      const moved = !M || M.id !== N.id || M.i > N.i;
      rec.steps.push({ i: N.i + 1, of: N.n, did: what, moved });
      log(`tutorial ${N.id} ${N.i + 1}/${N.n}: ${what || 'nothing to do'} -> ${moved ? 'moved on' : 'still waiting'}`);
      // (three tries at the same step and nothing: a player would press Skip; it is recorded as stuck)
      const tries = rec.steps.filter(x => x.i === N.i + 1 && !x.moved).length;
      if (!moved && tries >= 3) { rec.stuck = N.i + 1; log(`tutorial ${N.id}: stuck at step ${N.i + 1}, skipped`); await click('#hints [data-act="tutorSkip"]'); break; }
      if (!M || M.id !== N.id) rec.done = await ev(`IC.tutorSeen(IC.S, '${N.id}')`);
      did = true;
      if (!moved) break;
      // (a step that opened a card or placed a plan: let the page catch up)
      await page.waitForTimeout(300);
    }
    return did;
  };

  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await ev(`(() => { window.__r = []; const keep = { goal: d => d.text, event: d => d.title, deckCard: d => d.key, milestone: d => String(d.n), rareVisitor: d => d.type, request: d => IC.avAirline(IC.S, d.al).name + (d.renew ? ' (renewal)' : ''), storyChapter: d => String(d), firstArrival: () => '', tailParked: () => '', bld: d => d.act + ' ' + (d.v || ''), tutorStart: d => d };
    IC.on((S, type, d) => { if (S === IC.S && keep[type]) { let w = ''; try { w = keep[type](d) || ''; } catch (e) {} __r.push({ type, what: w, real: performance.now(), game: S.time }); } });
    window.__t0 = performance.now(); })()`);
  await page.waitForTimeout(1500);
  await shot('00-opening');
  await cardsAway();
  await page.waitForTimeout(2500);
  // ---------- the first minutes: the tutorials lead (or, before, the same clicks by hand) ----------
  if (!BEFORE) {
    for (let k = 0; k < 40; k++) {
      await cardsAway();
      const s = await ev('({ cap: !!IC.S.story.cap, open: IC.S.story.ch >= 1, works: (IC.S.byId[IC.S.story.cap] || { works: [] }).works.length, wait: !!IC.S.wait })');
      if (s.cap && s.works === 0 && !s.wait && (await ev(`IC.S.byId[IC.S.story.cap].parts.some(p => p.kind === 'terminal' && p.built)`))) break;
      if (s.wait) { await page.waitForTimeout(1500); continue; }
      if (!(await tutorials())) await page.waitForTimeout(1200);
      if (k === 6) await shot('02-starter-ghost');
    }
  } else {
    await click('#sys [data-act="bbToggle"]'); await click('#bbar [data-act="foundMode"]');
    const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y }; } return null; })()`);
    await look(site.x, site.y, 1.2); await mapClick(site.x, site.y); await click('#bldgo [data-go="build"]'); await page.waitForTimeout(1200); await cardsAway();
    await click('#bbar [data-bb="tab"][data-v="bq"]'); await click('#bbar [data-bb="item"][data-v="starter"]'); await page.waitForTimeout(800);
    const a = await ev('(() => { const a = IC.S.byId[IC.S.story.cap]; return { x: a.x, y: a.y }; })()');
    await mapClick(a.x, a.y + 2); await shot('02-starter-ghost'); await click('#bldgo [data-go="build"]');
    await click('#insp [data-act="finishNow"]') || await click('#bbar [data-act="finishNow"]');
    for (let i = 0; i < 200; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; }
  }
  const capId = await ev('IC.S.story.cap');
  const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y }; })()`);
  const opening = { min: +T().toFixed(1), clicks };
  log('open for business after', opening.clicks, 'clicks');
  await look(ap.x, ap.y, 14); await shot('03-built-z14');
  await look(ap.x, ap.y, 6);
  await key('6');

  // ---------- the player ----------
  const money = [], seenCards = []; let floor = Infinity, held = 0;
  let lastAct = Date.now(), lastWait = 0, lastBuild = 0, radarT = 0;
  const state = () => ev(`(() => { const S = IC.S, st = S.story, a = S.byId['${capId}'];
    const g = st.goals.find(x => !x.done && !x.failed);
    return { budget: S.budget, paused: S.paused, wait: !!S.wait, room: !!IC.ui.room, works: a.works.length, ch: st.ch, act: st.act, mode: S.mode2 ? S.mode2.kind : '',
      goal: g ? g.text : '', gid: g ? g.id : '', play: st.play || 0, ssr: S.units.filter(u => u.type === 'ssr').length, ssrBusy: S.units.some(u => u.type === 'ssr' && u.state !== 'ready'),
      cover: IC.wayCoverAll ? IC.wayCoverAll(S) : 0, radarOpen: st.goals.some(g => g.id === 'radar' && !g.done && !g.failed), plan: IC.radarPlan && S.asp.ways.length ? IC.radarPlan(S).n : 0,
      probs: IC.aptProblems(S, a).map(p => ({ id: p.id, kind: p.kind, title: p.title, fix: p.fix && p.fix.part, size: p.fix && p.fix.size, req: p.req, deal: p.deal })) }; })()`);
  const tried = new Set();
  // a fix from the map: its marker's button (the game places the piece), then Build beside it
  const build = async (part, near, label, size, id) => {
    if (Date.now() - lastBuild < 8000 || (id && tried.has(id))) return false;
    if (id) tried.add(id);
    const ok = await ev(`(() => { const S = IC.S, a = S.byId['${capId}']; if (S.budget < 250) return false; IC.fixOpen(S, a, '${part}', ${near}, ${size ? `'${size}'` : 'null'}); return !!(S.mode2 && S.mode2.kind === 'build'); })()`);
    if (!ok) return false;
    lastBuild = Date.now();
    await page.waitForTimeout(500);
    await tutorials();
    const b = await page.$('#bldgo [data-go="build"]'); if (b) await click(b);
    log('built:', label);
    const fin = await page.$('#insp [data-act="finishNow"]'); if (fin) { await click(fin); for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (!(await ev('!!IC.S.wait'))) break; } }
    await ev('IC.S.mode2 && IC.setMode(null)');
    await key('6'); lastAct = Date.now();
    return true;
  };
  const termNear = `(() => { const a = IC.S.byId['${capId}'], t = a.parts.find(q => q.kind === 'terminal' && q.built) || a; return { x: t.x, y: t.y }; })()`;
  let lastRadarLog = 0, dealLook = 0;
  while (T() < MIN) {
    await page.waitForTimeout(900);
    await dismissHints();
    // (the menu open by a stray Esc: closed, as a player would)
    if (await page.$('#menu:not([hidden])')) await click('#menu [data-act="menu"]');
    if (await tutorials()) { lastAct = Date.now(); continue; }
    const s = await state();
    floor = Math.min(floor, s.budget);
    held = Math.max(held, await ev(`(() => { const S = IC.S; let w = 0; for (const t of S.av.tails) if (t.where === 'stand' && t.held && t.held.k !== 'night' && t.held.k !== 'slot') w = Math.max(w, S.time - t.held.t0); return w; })()`));
    if (s.room) await key('Escape');
    const cine = await page.$('#cine:not([hidden])');
    if (cine) {
      const t = await ev(`(document.querySelector('#cine h2') || {}).textContent || ''`);
      if (!seenCards.includes(t)) { seenCards.push(t); log('card:', t); if (/passengers a day/.test(t)) await shot('04-milestone'); else if (/^Chapter 3/.test(t)) await shot('07-chapter3'); }
      const fx = await page.$('#cine [data-act="buildPick"]');
      if (fx && !BEFORE) { if (await tutorials()) continue; }
      const v = fx ? await fx.getAttribute('data-v') : null;
      await cine.click({ position: { x: 20, y: 20 } }).catch(() => {}); clicks++; await page.waitForTimeout(500);
      if (v && v !== 'rwkit') await build(v, termNear, 'the milestone\'s ' + v);
      continue;
    }
    const card = await page.$('#evcard:not([hidden]) .opt');
    if (card) {
      const t = await ev(`(document.querySelector('#evcard h2') || {}).textContent || ''`);
      log('decision:', t);
      if (!shots.has('08-decision')) await shot('08-decision');
      const pick = /sky with a plan/i.test(t) ? (await page.$$('#evcard:not([hidden]) .opt'))[1] : card;
      await click(pick || card); await key('6'); lastAct = Date.now();
      continue;
    }
    if (s.paused) await ev('IC.S.paused = false');
    if (!shots.has('01-next-goal') && s.gid) { await page.waitForTimeout(500); await shot('01-next-goal'); }
    const off = s.probs.find(q => q.kind === 'offer');
    // (a new player reads the first offer through its tutorial: the airport on screen, the marker in view)
    if (off && !BEFORE && dealLook < 3 && !(await ev(`IC.tutorSeen(IC.S, 'deals')`))) { dealLook++; await look(ap.x, ap.y, 6); continue; }
    if (off) {
      const signed = await ev(`(() => { const S = IC.S, q = S.av.requests.find(x => x.id === '${off.req}'); if (!q || IC.avReqBlock(S, q)) return false; return IC.avDecide(S, q.id, true); })()`);
      if (signed) { log('signed:', off.title); lastAct = Date.now(); continue; }
      if (off.fix && off.fix !== 'deal' && await build(off.fix, `(IC.aptProblems(IC.S, IC.S.byId['${capId}']).find(p => p.id === '${off.id}') || { fix: {} }).fix.near`, 'for an offer: ' + off.fix, off.size, off.id)) continue;
    }
    const pr = s.probs.find(q => q.kind !== 'offer' && q.fix && q.fix !== 'ils');
    if (pr && await build(pr.fix, `(IC.aptProblems(IC.S, IC.S.byId['${capId}']).find(p => p.id === '${pr.id}') || { fix: {} }).fix.near`, pr.title, pr.size, pr.id)) continue;
    // Chapter 3: a radar on the gap marker, through its own button, once the last one is up; never more than the tip says plus one
    if (s.ch === 2 && s.radarOpen && s.cover < 0.8 && !s.ssrBusy && s.budget > 150 && Date.now() - radarT > 15000 && s.ssr < Math.max(3, s.plan + s.ssr + 1)) {
      radarT = Date.now();
      // (the marker sits at the gap: the camera goes there first, as Show the gaps would take it)
      const g0 = await ev('(() => { const g = IC.radarGap(IC.S); return g && g.at; })()'); if (g0) await look(g0.x, g0.y, 0.08);
      const m = await page.$('#pmarks [data-act="gapFix"]');
      if (m) { await click(m); await page.waitForTimeout(900);
        const q = await ev(`(() => { const g = IC.radarGap(IC.S); return g && IC.findSpot(IC.S, 'ssr', g.at.x, g.at.y, 0, 300); })()`);
        if (q) { await look(q.x, q.y, 0.08); const p = await scr(q.x, q.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(500); if (!shots.has('13-radar-tag')) await shot('13-radar-tag'); await page.mouse.click(p.x, p.y); clicks++; await page.waitForTimeout(500); await ev('IC.S.mode2 && IC.setMode(null)'); log(await ev(`IC.S.units.some(u => u.type === 'ssr' && U_near(u))`.replace('U_near(u)', `Math.hypot(u.x - ${q.x}, u.y - ${q.y}) < 5`)) ? 'built: a civil radar on the gap marker' : 'the radar was not placed'); }
        await look(ap.x, ap.y, 6); await key('6');
      }
    }
    if (s.ch === 2 && Date.now() - lastRadarLog > 60000) { lastRadarLog = Date.now(); log(`chapter 3: ${Math.round(s.cover * 100)}% of the airways seen, ${s.ssr} radars, the tip says about ${s.plan} more`); }
    // Chapter 4: the light-aircraft field the How asks for (Aviation room → Light-aircraft field), near the town, as a
    // player places it; the clubs' other goals follow from it
    if (s.ch === 3 && /light-aircraft field/.test(s.goal) && Date.now() - lastBuild > 15000) { lastBuild = Date.now(); const f = await ev(`(() => { const S = IC.S, c = S.story.contract && S.byId[S.story.contract.town]; if (!c || S.asp.fields.some(f => IC.U.dist(f, c) < 160)) return null;
        for (let k = 0; k < 48; k++) { const a = k * 0.83, d = 40 + k * 2.2, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.aspFieldWhy(S, x, y)) { IC.aspFoundField(S, x, y); return c.name; } } return null; })()`); if (f) log('built: the light-aircraft field near', f); }
    if (s.ch === 2 && /approach radar/.test(s.goal) && !s.works && await build('atc', `(() => { const r = IC.S.byId['${capId}'].parts.find(q => q.kind === 'runway' && q.built); return { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }; })()`, 'an approach radar')) continue;
    if (/stands/.test(s.goal) && !s.works && await build('tstraight', termNear, 'stands for the goal')) continue;
    if (!money.length || T() - money[money.length - 1].min >= 0.5) money.push({ min: +T().toFixed(1), budget: Math.round(s.budget), ch: s.ch, goal: s.goal });
    // the first turnaround at stand zoom, with the aircraft's panel open
    if (!shots.has('05-turnaround')) { const tl = await ev(`(() => { const S = IC.S, t = S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}' && t.t > 600); if (!t) return null; const a = S.byId['${capId}'], s = IC.aptStands(a).find(q => q.occ === t.id) || null; return { id: t.id, x: s ? s.x : null, y: s ? s.y : null }; })()`);
      if (tl && tl.x != null) { await key('1'); const p = await scr(tl.x, tl.y); await look(tl.x, tl.y, 60); const q = await scr(tl.x, tl.y); await page.mouse.click(q.x, q.y); clicks++; await page.waitForTimeout(900); await shot('05-turnaround'); await look(tl.x, tl.y, 150); await shot('05b-stand-z150'); await look(tl.x, tl.y, 25); await shot('05c-stand-z25'); await key('Escape'); await key('6'); } }
    if (!shots.has('09-problem') && s.probs.some(q => q.kind !== 'offer')) { await look(ap.x, ap.y, 6); await shot('09-problem'); }
    if (!shots.has('11-night') && T() > 6) { const n = await ev('IC.daylight(IC.S.time) < 0.2'); if (n) { await key('2'); await look(ap.x, ap.y, 6); await shot('11-night'); await look(ap.x, ap.y, 22); await shot('11b-night-z22'); await key('6'); } }
    if (!shots.has('12-chain') && T() > 9) { await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await page.waitForTimeout(500); if (!(await ev('IC.chainOn'))) await click('#insp [data-act="chainTog"]'); await look(ap.x, ap.y, 0.25); await page.waitForTimeout(1500); await shot('12-chain'); await look(ap.x, ap.y, 1.2); await page.waitForTimeout(1200); await shot('12b-chain-near'); await ev('IC.chainOn = false'); await look(ap.x, ap.y, 6); }
    if (s.ch === 2 && !shots.has('13-ch3')) { await page.waitForTimeout(600); await shot('13-ch3'); log('chapter 3 goal:', s.goal); }
    if (s.ch >= 3 && !shots.has('14-ch4')) { await shot('14-ch4'); log('chapter 4 goal:', s.goal); }
    if (!shots.has('06-mid') && T() > 14) { await look(ap.x, ap.y, 6); await shot('06-mid'); }
    if (!s.wait && !s.works && Date.now() - lastAct > 25000 && Date.now() - lastWait > 30000) {
      lastWait = Date.now();
      await click('#speed [data-act="waitPick"]');
      const w = await page.$('.waitbar [data-act="wait"]'); if (w) { await click(w); log('Wait'); } else await key('6');
      // (nothing worth waiting for: the picker is closed again, as a player would)
      if (await page.$('.waitbar.pick')) await click('#speed [data-act="waitPick"]');
    }
  }
  await key('1');
  await look(ap.x, ap.y, 6); await shot('06-end');
  await look(ap.x, ap.y, 2.2); await shot('06b-end-z2');
  const fin = await ev(`(() => { const S = IC.S, a = S.byId['${capId}'], st = IC.aptStats(S, a), L = IC.aptDayLog(S, a), P = L.prev || L;
    return { ch: S.story.ch, goal: (S.story.goals.find(g => !g.done && !g.failed) || {}).text, deals: S.av.deals.filter(d => d.st === 'active').length, pax: Math.round(a.paxRate || 0), budget: Math.round(S.budget), date: IC.U.clock(S.time, S),
      dayMoves: P.arr.reduce((x, y) => x + y, 0) + P.dep.reduce((x, y) => x + y, 0), radars: S.units.filter(u => u.type === 'ssr').length, cover: IC.wayCoverAll ? Math.round(IC.wayCoverAll(S) * 100) : null, tutorsSeen: S.tutor ? Object.keys(S.tutor.over) : [] }; })()`).catch(e => String(e));
  fin.floor = Math.round(floor); fin.heldMaxMin = Math.round(held / 60);
  console.log('FINAL', JSON.stringify(fin));
  // ---------- the pacing ----------
  const rec = await ev('__r.map(r => ({ type: r.type, what: r.what, min: (r.real - __t0) / 60000, game: r.game }))');
  const first = rec.find(r => r.type === 'tailParked'), arr = rec.find(r => r.type === 'firstArrival'), open = rec.find(r => r.type === 'storyChapter' && r.what === '1');
  const from = open ? open.min : 0;
  const EVENT = { event: 1, milestone: 1, rareVisitor: 1, storyChapter: 1, request: 1 };
  const evs = rec.filter(r => EVENT[r.type] && r.min >= from - 0.01), goals = rec.filter(r => r.type === 'goal');
  const gap = L => { const m = [from].concat(L.map(r => r.min)).concat([T()]); let g = 0; for (let i = 1; i < m.length; i++) g = Math.max(g, m[i] - m[i - 1]); return g; };
  const kinds = {}; for (const r of evs) { const k = r.type === 'event' ? 'card: ' + r.what : r.type === 'request' ? 'offer' : r.type; kinds[k] = (kinds[k] || 0) + 1; }
  const out = { before: BEFORE, minutes: +T().toFixed(1), opening, firstArrivalMin: arr ? +arr.min.toFixed(1) : null, firstParkedMin: first ? +first.min.toFixed(1) : null, openAt: +from.toFixed(1),
    goals: goals.length, goalGapMax: +gap(goals).toFixed(1), events: evs.length, eventGapMax: +gap(evs).toFixed(1), distinctEvents: Object.keys(kinds).length, kinds,
    milestones: rec.filter(r => r.type === 'milestone').map(r => `${r.what} at ${r.min.toFixed(1)} min`), chapters: rec.filter(r => r.type === 'storyChapter').map(r => `${r.what} at ${r.min.toFixed(1)} min`),
    tutorials: TUT, timeline: rec.filter(r => r.type !== 'bld').map(r => `${r.min.toFixed(1)} ${r.type} ${r.what}`), money: money.filter((m, i) => i % 4 === 0), final: fin, errors };
  console.log(JSON.stringify(Object.assign({}, out, { timeline: undefined }), null, 1));
  fs.writeFileSync(path.join(OUT, (BEFORE ? 'before-' : '') + 'pacing.json'), JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
