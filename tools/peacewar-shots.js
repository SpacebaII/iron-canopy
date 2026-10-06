/* The play-through of brief 25 (docs/tasks/25-playthrough.md): three peacetime choices and the war that judges them,
   played in the page on a compressed calendar (a month is 0.05 live days, so the years pass in minutes; every date
   is the game's own calendar). A plain player signs every airline offer it can and answers events with the first
   option.
     node tools/peacewar-shots.js [seed, default 777]
   Choices: an approach radar at the airport nearest the hostile border (Year 1), a second runway at the capital
   (Year 2), a hangar at the capital (Year 3). Then the war in Year 9: a drone, a cruise missile on each airport's
   runway, a near miss by a hangar, the airspace closed for two days. Saves shots/pw-*.png. Needs Playwright, like
   tools/shot.js. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

(async () => {
  const seed = +process.argv[2] || 777;
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const out = n => path.resolve(__dirname, `../shots/${n}.png`);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const shot = async (n, keepCard) => { if (!keepCard) await page.evaluate(() => { document.getElementById('cine').hidden = true; IC.ui.cineShown = IC.S.camp.cards.length; }); await page.waitForTimeout(900); await page.screenshot({ path: out(n) }); console.log('saved', out(n)); };
  const run = src => page.evaluate(`(async () => { const S = IC.S, ui = IC.ui, U = IC.U, W = window.PW; ${src}; ui.moments.length = 0; ui.closeMoment(); ui.arMin = true; IC.bb.open = false; ui.refresh(true); return W && W.say ? W.say.splice(0) : null; })()`);
  const say = r => { if (r) for (const l of r) console.log(l); };

  // the game, the helpers and the plain player
  say(await page.evaluate(async seed => {
    const S = IC.newGame({ seed, mode: 'story', preset: 'network', hour: 7, dpm: 0.05 }); IC.adopt(S); document.getElementById('start').hidden = true;
    IC.ui.hintsOn = false; for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    const W = window.PW = { say: [] }, U = IC.U;
    W.date = () => U.clock(S.time, S);
    W.note = t => W.say.push(`${W.date()}  ${t}`);
    W.player = () => { for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q)) IC.avDecide(S, q.id, true); for (const e of S.story.events.slice()) IC.storyChoose(S, e.id, 0); S.budget = Math.max(S.budget, 2500); };
    W.until = async t => { let next = 0; while (S.time < t && !S.over) { for (let i = 0; i < 1500 && S.time < t; i++) { IC.step(S, IC.calmSky(S) ? 8 : 1); if (S.time >= next) { W.player(); next = S.time + 600; } } await new Promise(r => setTimeout(r, 0)); } };
    W.look = (p, z) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(p.x, p.y); document.getElementById('cine').hidden = true; IC.ui.cineShown = S.camp.cards.length; };
    W.cap = S.byId[S.story.cap];
    // the airport nearest the hostile border
    W.front = IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us' && b !== W.cap).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
    W.note(`Start. ${W.cap.name} is the national airport; ${W.front.name} is ${U.km(IC.hostileBorderDist(W.front.x, W.front.y))} from the hostile border.`);
    return W.say.splice(0);
  }, seed));

  // Choice 1, Year 1: an approach radar at the airport nearest the border
  say(await run(`await W.until(S.time + IC.MO(S, 2)); const ap = W.front;
    let p = null; for (const [x, y] of [[-8, -3], [-6, -3.5], [4, -3], [-9, 3.5], [9, -3]]) { const q = IC.aptLocal(ap, x, y); p = IC.aptPlanPart(S, ap, 'atc', q.x, q.y, ap.rwyA); if (p) break; }
    W.note('Choice 1: an approach radar at ' + ap.name + (p ? '' : ' (could not be placed)')); W.atc = p`));
  // Choice 2, Year 2: a second runway at the capital, 1.6 km south of the first
  say(await run(`await W.until(IC.MO(S, 14)); const ap = W.cap, P = (x, y) => IC.aptLocal(ap, x, y);
    const ok = IC.aptPlanRunway(S, ap, P(-17, -16), P(17, -16)) && IC.aptPlanTaxi(S, ap, [P(-12, -1.6), P(-12, -16)]) && IC.aptPlanTaxi(S, ap, [P(8, 0), P(8, -16)]);
    W.note('Choice 2: a second runway at ' + ap.name + (ok ? '' : ' (could not be planned)'))`));
  // Choice 3, Year 3: a hangar at the capital
  say(await run(`await W.until(IC.MO(S, 27)); const ap = W.cap, q = IC.aptLocal(ap, -20, 14);
    W.hangar = IC.aptPlanPart(S, ap, 'hangar', q.x, q.y, ap.rwyA);
    W.note('Choice 3: a hangar at ' + ap.name + (W.hangar ? '' : ' (could not be placed)'))`));
  // the quiet years
  say(await run(`await W.until(IC.MO(S, 100));
    W.note('Year 9. Runways: ' + IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us').map(b => b.name + ' ' + b.parts.filter(p => p.kind === 'runway' && p.built).map(p => U.pct(p.wear || 0) + ' worn').join(', ')).join('; ') + '. Deals running: ' + S.av.deals.filter(d => d.st === 'active').length)`));

  // the war: the Act IV card says what peace left
  say(await run(`await W.until(Math.ceil(S.time / 86400) * 86400 + 9 * 3600); IC.storyStartAct(S, 4); IC.enemyOpening(S); S.paused = true; W.note('War. ' + IC.peaceLedger(S).join(' ')); W.look(W.cap, 0.06);
    ui.cineShown = S.camp.cards.map(c => c.title).lastIndexOf(S.camp.cards.filter(c => /^Act IV/.test(c.title)).pop().title); ui.cineT = 0`));
  await page.waitForTimeout(400); await page.evaluate(() => IC.ui.refresh(true));
  await shot('pw-war', true);

  // Moment 1: a drone toward the border airport, no military radar near
  say(await run(`const ap = W.front, B = IC.hostileBorderDist(ap.x, ap.y);
    const a = Math.atan2(ap.y - S.world.cy, ap.x - S.world.cx), from = { x: ap.x + Math.cos(a) * 320, y: ap.y + Math.sin(a) * 320 };
    W.drone = IC.spawnThreat(S, 'owa', from.x, from.y, { route: [{ x: ap.x, y: ap.y }], aim: { x: ap.x, y: ap.y }, fromHostile: true });
    for (let i = 0; i < 4 * 240 && !W.drone.tn; i++) IC.step(S, 0.25);
    for (let i = 0; i < 4 * 20; i++) IC.step(S, 0.25);
    W.note('Moment 1: ' + ((S.logs.find(l => l.tag === 'RADAR') || {}).msg || 'no civil radar line')); W.look(ap, 0.9); S.sel = { kind: 'track', ref: W.drone }`));
  await shot('pw-radar');

  // Moment 2: a cruise missile on the middle of each airport's first runway
  say(await run(`W.drone.dead = true;
    const cm = { d: IC.THR.lacm };
    for (const ap of [W.front, W.cap]) { const rw = ap.parts.find(p => p.kind === 'runway' && p.built), q = IC.rwAt(rw, 0.5); IC.detonate(S, q.x, q.y, 60, cm); W.note('Moment 2, ' + ap.name + ': ' + (S.logs.find(l => l.tag === 'AIRPORT') || {}).msg); }
    S.sel = null; W.look(IC.aptLocal(W.cap, 0, -8), 14); S.paused = true`));
  await shot('pw-runway');
  // and a departure from the second runway at the capital
  say(await run(`let up = null; const on = (S2, type, d) => { if (S2 === S && type === 'rwMove' && d.ap === W.cap && d.k === 'dep') up = d; }; IC.on(on);
    for (let i = 0; i < 4 * 3600 && !up; i++) IC.step(S, 0.25);
    for (let i = 0; i < 4 * 25; i++) IC.step(S, 0.25);
    W.note('A departure from ' + W.cap.name + (up ? ' on ' + (up.rw && up.rw.name ? up.rw.name : 'the second runway') : ': none in an hour')); W.look(IC.aptLocal(W.cap, 0, -8), 14)`));
  await shot('pw-runway2');

  // Moment 3: a near miss by the hangar, an airliner inside for maintenance, two on open stands nearby
  say(await run(`const ap = W.cap, h = W.hangar && W.hangar.built ? W.hangar : ap.parts.find(p => p.kind === 'hangar' && p.built);
    const tl = S.av.tails.find(t => t.where === 'away' && t.at !== ap.id) || S.av.tails.find(t => t.where !== 'lost' && t.where !== 'air');
    tl.where = 'hangar'; tl.at = ap.id; h.inside = [{ tl: tl.id }];
    IC.aptHit(S, ap, h.x + 0.4, h.y, 25, { d: IC.THR.lacm });
    W.note('Moment 3: ' + (S.logs.find(l => l.tag === 'AIRPORT') || {}).msg);
    const s = IC.aptStands(ap).filter(x => x.occ && x.hp > 0)[0];
    if (s) { IC.detonate(S, s.x + 0.3, s.y, 25, { d: IC.THR.lacm }); W.note('Same blast by an open stand: ' + (S.logs.find(l => l.tag === 'AIRPORT') || {}).msg); }
    S.sel = null; W.look({ x: h.x + 0.6, y: h.y }, 18)`));
  await shot('pw-hangar');

  // War costs peace: closing the airspace says what it costs. (On this compressed calendar two live days are 40 months,
  // so the walk-out and the airlines' memory are shown by the test, on the real calendar.)
  say(await run(`S.sel = null; IC.airspaceSet(S, 'closed'); W.note('Closed: ' + (S.logs.find(l => l.tag === 'AIRSPACE') || {}).msg);
    for (let i = 0; i < 4 * 10; i++) IC.step(S, 0.25); W.look(W.cap, 0.25)`));
  await shot('pw-airspace');

  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
