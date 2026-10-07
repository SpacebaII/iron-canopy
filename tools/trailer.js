/* The trailer (docs/focus/trailer/): a fresh Career played in headless Chromium at 1280 × 720 with real clicks, the
   frames captured by the browser's screencast, then cut into scenes, the dead time between them dropped, and joined
   by ffmpeg into an H.264 MP4 that plays on phones. Captions and the title and end cards are a DOM overlay the script
   injects; no game file changes. IC is read for positions and state, the camera is moved smoothly through IC.cam,
   and time is moved by the speed keys, Wait and Finish now, between the moments that matter.
   (round 5c) The opening follows the tutorials as a new player would, so one of their steps is on screen; then the
   new screens: the day board, the ground fleet, a decision card and the airline scorecards. The caption keeps clear
   of the Build button and the tutorial's note; vehicles at the stand are filmed close; the night scene waits for
   aircraft moving under the lights.
     python3 -m http.server 8779 &   (from the repository root)
     node tools/trailer.js [--url=...] [--frames=dir] [--out=file.mp4]
   Needs Playwright (npm i --no-save playwright) and ffmpeg. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8779/iron-canopy/index.html';
const DIR = path.resolve(__dirname, '../docs/focus/trailer');
const OUTV = arg('out') || path.join(DIR, 'iron-canopy-trailer.mp4');
const FR = path.resolve(arg('frames') || path.join(require('os').tmpdir(), 'ic-trailer-frames'));
const W = 1280, H = 720, FPS = 30;
fs.mkdirSync(DIR, { recursive: true });
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });

// the overlay: captions bottom-centre in the game's glass, and full-screen title cards
const OVERLAY = `(() => {
  const st = document.createElement('style');
  st.textContent = \`
  #tr-cap{position:fixed;left:50%;bottom:22px;transition:opacity .5s,transform .5s,bottom .35s;transform:translate(-50%,8px);z-index:99999;pointer-events:none;max-width:min(62rem,92vw);
    padding:.65rem 1.4rem;border-radius:14px;background:rgba(9,16,23,.88);box-shadow:0 14px 44px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
    color:#e8f0f5;font-family:var(--body);font-size:1.45rem;font-weight:500;line-height:1.25;text-align:center;opacity:0}
  #tr-cap.on{opacity:1;transform:translate(-50%,0)}
  #tr-card{position:fixed;inset:0;z-index:99998;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;
    background:radial-gradient(ellipse at 50% 45%,rgba(14,28,40,.985),rgb(2,5,8) 72%);opacity:0;transition:opacity .8s}
  #tr-card.on{opacity:1}
  #tr-card h1{margin:0;font-family:var(--display);font-weight:700;font-size:6.2rem;letter-spacing:.24em;color:#e8f0f5;text-indent:.24em}
  #tr-card p{margin:0;font-family:var(--body);font-size:1.75rem;color:#9ab0bf;max-width:46rem;text-align:center;line-height:1.35}
  #tr-card i{display:block;width:7rem;height:2px;background:#f2b441;opacity:.85}
  .mapctl,#layers{display:none!important}\`;
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'tr-cap'; document.body.appendChild(cap);
  const card = document.createElement('div'); card.id = 'tr-card'; document.body.appendChild(card);
  // the caption sits above the build bar, the hint line and the Follow chip when they are up
  setInterval(() => { let top = innerHeight - 22;
    for (const id of ['bbar', 'modehint', 'followchip', 'bldgo', 'tutnote']) { const e = id === 'tutnote' ? document.querySelector('#hints .hnote:not([hidden])') : document.getElementById(id); if (!e || e.hidden || !e.offsetParent) continue;
      const r = e.getBoundingClientRect(); if (r.height && r.top > innerHeight * .55 && r.top < top) top = r.top - 10; }
    cap.style.bottom = (innerHeight - top) + 'px'; }, 120);
  window.trCap = t => { if (t) { cap.textContent = t; cap.classList.add('on'); } else cap.classList.remove('on'); };
  window.trCard = (h, p) => { if (h) { card.innerHTML = '<h1>' + h + '</h1><i></i><p>' + p + '</p>'; card.classList.add('on'); } else card.classList.remove('on'); };
  // the camera eased from where it is to (x, y, z) over ms: zoom by its logarithm so it feels even
  window.trCam = (x, y, z, ms) => new Promise(res => {
    const c = IC.cam, z0 = c.z, x0 = c.x + c.vw / c.z / 2, y0 = c.y + c.vh / c.z / 2, t0 = performance.now();
    c.fly = null;
    const f = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const zz = Math.exp(Math.log(z0) + (Math.log(z) - Math.log(z0)) * e), m = (1 / zz - 1 / z0) / ((1 / z - 1 / z0) || 1e-9);
      const w = Math.abs(z - z0) < 1e-6 ? e : m; c.z = zz; IC.centerOn(x0 + (x - x0) * w, y0 + (y - y0) * w);
      if (k < 1) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
})()`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now();
  const T = () => ((Date.now() - t0) / 1000).toFixed(0);
  const log = (...a) => console.log(`[${T()} s]`, ...a);
  const ev = s => page.evaluate(s);
  const click = async (sel, o) => { await page.click(sel, Object.assign({ timeout: 8000 }, o)); await page.waitForTimeout(300); };
  const clickXY = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(300); };
  const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(200); };
  const hold = ms => page.waitForTimeout(ms);
  const screenOf = async (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  const glide = async (x, y, steps) => { await page.mouse.move(x, y, { steps: steps || 25 }); };
  const cam = (x, y, z, ms) => ev(`trCam(${x}, ${y}, ${z}, ${ms})`);
  const cap = t => ev(`trCap(${JSON.stringify(t || '')})`);
  const dismiss = async (keepMoment) => {
    for (let i = 0; i < 12; i++) {
      const b = await page.$('[data-act="hintOk"]:visible');
      if (b) { await b.click(); await page.waitForTimeout(300); continue; }
      const c = await page.$('#cine:not([hidden])');
      if (c && !(keepMoment && await ev(`document.getElementById('cine').classList.contains('moment')`))) { await c.click({ position: { x: 20, y: 20 } }); await page.waitForTimeout(900); continue; }
      break;
    }
  };
  const still = async name => { await page.screenshot({ path: path.join(DIR, name + '.jpg'), type: 'jpeg', quality: 80 }); log('still', name); };

  // the screencast: every frame the page paints, with the time it arrived
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', f => {
    const n = frames.length, file = path.join(FR, String(n).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ t: Date.now(), file });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  // the scenes: [start, end) in real time, each played back at a speed (or squeezed to a length)
  const scenes = []; let cur = null;
  const scene = async (name, caption) => { if (cur) end(); cur = { name, caption, a: Date.now() }; await cap(caption); log('scene', name); };
  const end = () => { if (cur) { cur.b = Date.now(); scenes.push(cur); cur = null; } };
  const cut = async () => { await cap(''); await hold(450); end(); };

  // the game's web fonts, fetched by curl (which trusts the sandbox's proxy) when the browser cannot reach them
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
    try {
      const body = execFileSync('curl', ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', route.request().url()]);
      const css = /googleapis/.test(route.request().url());
      await route.fulfill({ status: 200, body, headers: { 'content-type': css ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } });
    } catch (e) { await route.continue(); }
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 60000 });
  await ev(OVERLAY);
  log('fonts', await ev(`Promise.all(['700 20px "Saira Condensed"', '500 20px "IBM Plex Sans Condensed"'].map(f => document.fonts.load(f))).then(r => r.map(x => x.length).join(','))`));
  await page.waitForTimeout(1500);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  // 1. title, over the start screen
  await ev(`trCard('IRON CANOPY', 'Build the airports. Run the skies.')`);
  await hold(900);
  await scene('title', '');
  await hold(3000);
  end();
  await click('[data-act="begin"][data-v="story"]');
  await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await dismiss();
  await ev(`trCard('')`);

  // 2. founding: the 15–40 km band round the capital, the site survey, Found. The tutorial rings each step
  await ev(`(() => { const T = IC.S.tutor || (IC.S.tutor = { cur: null, i: 0, done: {}, over: {} }); T.over.basics = 1; if (T.cur === 'basics') T.cur = null; })()`);
  await hold(3200);
  await scene('tutorial', 'Every feature is taught on the real screen, and waits for you to do it');
  await hold(2600);
  await click('[data-act="bbToggle"]'); await hold(1800);
  await still('still-0-tutorial');
  await cut();
  await click('#bbar [data-act="foundMode"]');
  await page.waitForTimeout(400);
  const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y, cx: c.x, cy: c.y }; } return null; })()`);
  await ev(`IC.cam.fly = null; IC.frame(${site.cx - 520}, ${site.cy - 420}, ${site.cx + 520}, ${site.cy + 420})`);
  await page.mouse.move(W / 2 - 200, H / 2 + 60);
  await hold(1200);
  await scene('found', 'Found your airport where the city and the wind agree');
  let p = await screenOf(site.x, site.y);
  await glide(p.x, p.y, 40); await hold(1800);
  await clickXY(p.x, p.y);
  await hold(3200);
  await click('#bldgo [data-go="build"]');
  await hold(1600);
  await cut();
  await dismiss();
  const capId = await ev('IC.S.story.cap || (IC.S.mode2 && IC.S.mode2.ap && IC.S.mode2.ap.id)');
  const ap = await ev(`(() => { const a = IC.S.byId['${capId}']; return { x: a.x, y: a.y }; })()`);

  // 3. the Starter airport as one plan, its price and Build
  await click('#bbar [data-bb="tab"][data-v="bq"]');
  await click('#bbar [data-bb="item"][data-v="starter"]'); await hold(800);
  await cam(ap.x, ap.y + 2, 10, 10);
  await page.mouse.move(W * 0.3, H * 0.75); await hold(800);
  await scene('starter', 'One blueprint: runway, taxiways, terminal, tower, fire and fuel');
  p = await screenOf(ap.x, ap.y + 2);
  await glide(p.x, p.y, 35); await hold(1500);
  await clickXY(p.x, p.y); await hold(3200);
  await still('still-1-plan');
  await click('#bldgo [data-go="build"]');
  await hold(1200);

  // 4. construction in stages, then the terminal opens
  await scene('build', 'Watch it go up, stage by stage');
  await page.mouse.move(W - 40, H / 2);
  await click('#insp [data-act="finishNow"]').catch(() => click('#bbar [data-act="finishNow"]'));
  await cam(ap.x, ap.y, 12, 3000);
  // (from here on the film keeps the tutorials' notes out of the way)
  await ev('IC.ui.hintsOn = false');
  for (let i = 0; i < 240; i++) { await hold(500); if (!(await ev('!!IC.S.wait'))) break; }
  await hold(300);
  const card = await ev(`(() => { const c = document.getElementById('cine'); return c && !c.hidden ? c.innerText.slice(0, 120) : ''; })()`);
  log('after the works:', JSON.stringify(card));
  await scene('opens', 'Every opening says what it bought you');
  await hold(5000);
  await still('still-2-opens');
  await cut();
  await dismiss();
  if (await page.$('#bbar:not([hidden]) [data-bb="close"]')) await click('#bbar [data-bb="close"]');
  await ev('IC.select(null)');

  // 5. the first landing: 32× until the first airliner, then the game eases to 1× and follows it in
  await key('6');
  let got = 0;
  const away = `(() => { const S = IC.S; if (!S.follow) return -1; const tl = IC.followTail(S), w = tl && IC.tailWhere(S, tl); return w && w.t && w.ap ? IC.U.dist(w.t, w.ap) : 0; })()`;
  for (let i = 0; i < 600; i++) {
    await hold(400);
    if (i % 10 === 0 && !got) await dismiss(true);
    const s = await ev('({ first: !!IC.S.first, parked: IC.S.story.cnt.parked, paused: IC.S.paused })');
    if (s.paused) await ev('IC.S.paused = false');
    if (s.first && !got) { got = 1; await ev('IC.select(null)'); await scene('inbound', 'Your first airliner: the clock eases to 1× and the camera follows it in'); }
    if (got === 1) { const d = await ev(away); if (d >= 0 && d < 150) { got = 2; await scene('landing', 'Final approach, touchdown, taxi to the stand'); } }
    if (s.parked > 0) break;
  }
  await hold(1200);
  await scene('fee', 'Parked. The landing fee is yours');
  await hold(4500);
  await still('still-3-landing');
  await cut();
  await dismiss();

  // 6. the turnaround at stand zoom
  const tail = await ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.where === 'stand' && t.at === '${capId}'); return tl ? tl.id : null; })()`);
  const standAt = async () => ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.id === '${tail}'); const a = S.byId['${capId}']; const s = tl && tl.stand && IC.aptStands(a).find(x => x.id === tl.stand); return s ? { x: s.x, y: s.y } : null; })()`);
  await ev('IC.S.follow = null');
  await key('2');
  const st0 = tail && await standAt();
  const phase = () => ev(`(() => { const tl = IC.S.av.tails.find(t => t.id === '${tail}'); return tl && tl.stand ? IC.tailPhase(IC.S, tl) : ''; })()`);
  if (st0) {
    await cam(st0.x, st0.y, 60, 2500);
    const q = await screenOf(st0.x, st0.y); await clickXY(q.x, q.y); await page.mouse.move(W - 30, H - 30);
    await ev('IC.S.follow = null');
    await scene('turn', 'A real turnaround: stairs, bags and catering, each vehicle on its way');
    await cam(st0.x, st0.y, 260, 3500);
    await key('4');
    for (let i = 0; i < 120; i++) { await hold(400); if (/fuel/i.test(await phase())) break; }
    await key('2');
    await scene('refuel', 'The fuel truck comes from the farm, and the stand counts down');
    await hold(2500); await still('still-4-turn'); await hold(3000);
    await key('4');
    await scene('push', 'Then the tug pushes it back');
    for (let i = 0; i < 150; i++) { await hold(400); if (!(await phase())) break; }
    await key('2'); await hold(2500);
    await cut();
  } else log('no tail on a stand');
  await ev('IC.select(null)');

  // 7. a problem on the map, fixed with one click
  const probs = () => ev(`IC.aptProblems(IC.S, IC.S.byId['${capId}']).map(p => ({ id: p.id, kind: p.kind, title: p.title, fix: p.fix && (p.fix.part || 'deal') }))`);
  const playUntil = async (cond, max) => {
    await key('6');
    for (let i = 0; i < (max || 240); i++) {
      await hold(1000);
      if (i % 4 === 0) await dismiss();
      if (await ev('IC.S.paused')) await ev('IC.S.paused = false');
      if (await ev('IC.ui.room')) await key('Escape');
      const P = await probs(); const hit = cond(P); if (hit) { await ev('IC.waitStop && IC.waitStop(IC.S)'); await key('1'); return hit; }
      if (i >= 20 && i % 5 === 0 && !(await ev('!!IC.S.wait'))) { await key('7'); await hold(300); const w = await page.$('.waitbar [data-act="wait"]'); if (w) await w.click(); else await key('6'); }
    }
    await key('1'); return null;
  };
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`);
  const prob = await playUntil(P => P.find(p => p.kind !== 'offer' && p.fix && p.fix !== 'deal'), 300);
  log('problem', prob && prob.title);
  if (prob) {
    await dismiss();
    await cam(ap.x, ap.y, 6, 10); await page.mouse.move(W - 30, H - 30); await hold(800);
    await scene('problem', `Problems show on the map, with the fix one click away`);
    await hold(3000);
    await click(`#pmarks [data-act="pmFix"][data-v="${prob.id}"]`);
    await hold(2500);
    await click('#bldgo [data-go="build"]').catch(() => log('no Build'));
    await hold(2000);
    await cut();
    if (await ev(`IC.S.byId['${capId}'].works.length`)) { await click('#bbar [data-act="finishNow"]').catch(() => {}); for (let i = 0; i < 120; i++) { await hold(1000); if (!(await ev('!!IC.S.wait'))) break; } }
    await dismiss(); await ev('IC.select(null)');
    if (await page.$('#bbar:not([hidden]) [data-bb="close"]')) await click('#bbar [data-bb="close"]');
  }

  // 8. the chain on the map: towns, road, airport, flights, money
  await ev(`IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] })`); await hold(500);
  await click('#insp [data-act="chainTog"]');
  await cam(ap.x, ap.y, 1.6, 10); await page.mouse.move(W - 30, H - 30); await hold(800);
  await scene('chain', 'Towns, roads, the airport and its flights: one chain, and the money moving along it');
  await hold(1500);
  await cam(ap.x, ap.y, 0.35, 6000);
  await hold(2500);
  await cut();
  await click('#insp [data-act="chainTog"]');
  await ev('IC.select(null)');

  // 8b. the airport panel's depth: the day board, the ground fleet, the scorecards; and a decision card
  const panel = async (k, cap0, len) => {
    await ev(`(() => { IC.select({ kind: 'infra', ref: IC.S.byId['${capId}'] }); IC.ui.aptTab = 'info'; IC.ui.aptOpen = { ${k}: true }; IC.ui.refresh(true); })()`); await hold(500);
    await ev(`(() => { const e = document.querySelector('#insp ${k === 'day' ? '.dayb' : k === 'fleet' ? '.fleet' : '.t.score'}'); if (e) e.scrollIntoView({ block: 'start' }); })()`);
    await scene(k, cap0); await hold(len || 4000);
  };
  await key('6');
  for (let i = 0; i < 90; i++) { await hold(1000); if (i % 5 === 0) await dismiss(); if (await ev('IC.S.paused')) await ev('IC.S.paused = false'); if (await ev(`IC.aptScorecards(IC.S, IC.S.byId['${capId}']).length >= 2 && IC.S.av.deals.filter(d => d.st === 'active').length >= 3`)) break; }
  await key('1'); await cam(ap.x, ap.y, 5, 1500);
  await panel('day', 'The day board: departures by hour against what the runways take. Cap the peak, move a bank, pick the night', 5000);
  await still('still-5-dayboard');
  await panel('fleet', 'Tugs, apron buses and fuel trucks, as many as the stands and the busiest hour need', 3500);
  await panel('score', 'Every airline marks the airport, and its worst mark comes with its fix', 4000);
  await cut();
  await ev('IC.select(null)');
  // a decision card, as it comes
  await key('6');
  for (let i = 0; i < 240; i++) { await hold(700); if (await page.$('#evcard:not([hidden]) .opt')) break; const c = await page.$('#cine:not([hidden])'); if (c) await c.click({ position: { x: 20, y: 20 } }).catch(() => {}); if (await ev('IC.S.paused') && !(await page.$('#evcard:not([hidden])'))) await ev('IC.S.paused = false'); if (i % 30 === 29 && !(await ev('!!IC.S.wait'))) { await key('7'); await hold(300); const w = await page.$('.waitbar [data-act="wait"]'); if (w) await w.click(); else await key('6'); } }
  if (await page.$('#evcard:not([hidden]) .opt')) {
    await ev('IC.waitStop && IC.waitStop(IC.S)');
    await scene('deck', 'Something different every few minutes: each answer says what it costs');
    await hold(4500); await still('still-6-deck');
    const o = await page.$('#evcard:not([hidden]) .opt'); if (o) { await o.hover(); await hold(900); await o.click(); }
    await hold(800); await cut();
  } else log('no decision card came');

  // 9. busier, and at night: from the stand out to the whole airport
  await key('6');
  for (let i = 0; i < 300; i++) { await hold(1000); if (i % 5 === 0) await dismiss(); if (await page.$('#evcard:not([hidden]) .opt')) await (await page.$('#evcard:not([hidden]) .opt')).click().catch(() => {}); if (await ev('IC.S.paused')) await ev('IC.S.paused = false'); if (await ev(`IC.daylight(IC.S.time) < 0.08 && IC.S.byId['${capId}'].moves.filter(m => !m.dead).length >= 2`)) break; }
  await key('2'); await ev('IC.select(null)');
  const term = await ev(`(() => { const a = IC.S.byId['${capId}'], S = IC.S, tl = S.av.tails.find(t => t.where === 'stand' && t.at === a.id), s = tl && tl.stand && IC.aptStands(a).find(x => x.id === tl.stand); const t = s || a.parts.find(q => q.kind === 'terminal'); return { x: t.x, y: t.y }; })()`);
  await cam(term.x, term.y, 40, 10); await page.mouse.move(W - 30, H - 30); await hold(1500);
  await scene('night', 'Day and night, the airport keeps moving');
  await hold(1500);
  await cam((term.x + ap.x) / 2, (term.y + ap.y) / 2, 7, 10000);
  await hold(1500);
  await cut();

  // 10. the end card
  await ev(`trCard('IRON CANOPY', 'Then the airspace, airlines over the years, a network of cities. And later, the war.')`);
  await hold(900);
  await scene('end', '');
  await hold(3500);
  end();
  await cdp.send('Page.stopScreencast');
  await browser.close();
  log('frames', frames.length, 'errors', errors.length ? errors.join(' / ') : 'none');

  // cut: each scene squeezed to at most its length (playback speed ≥ 1), the frames written with their durations
  const MAXLEN = { title: 3, tutorial: 4.5, day: 5, fleet: 3.5, score: 4, deck: 5, found: 9, starter: 8, build: 8, opens: 5, inbound: 4, landing: 12, fee: 5, turn: 5, refuel: 5, push: 5, problem: 8, chain: 9, night: 11, end: 3.5 };
  let list = '', at = 0; const times = [];
  for (const s of scenes) {
    const len = (s.b - s.a) / 1000, sp = Math.max(1, len / (MAXLEN[s.name] || len));
    times.push({ name: s.name, at: +at.toFixed(1), caption: s.caption, real: +len.toFixed(1), speed: +sp.toFixed(2) });
    let i = frames.findIndex(f => f.t > s.a) - 1; if (i < 0) i = 0;
    for (; i < frames.length && frames[i].t < s.b; i++) {
      const a = Math.max(frames[i].t, s.a), b = Math.min(i + 1 < frames.length ? frames[i + 1].t : s.b, s.b), d = (b - a) / 1000 / sp;
      if (d <= 0) continue;
      list += `file '${frames[i].file}'\nduration ${d.toFixed(4)}\n`; at += d;
    }
  }
  list += `file '${frames[frames.length - 1].file}'\n`;
  fs.writeFileSync(path.join(FR, 'list.txt'), list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(FR, 'list.txt'),
    '-vf', `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', OUTV]);
  fs.writeFileSync(path.join(FR, 'scenes.json'), JSON.stringify(times, null, 1));
  console.log(JSON.stringify({ length: +at.toFixed(1), scenes: times, errors }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
