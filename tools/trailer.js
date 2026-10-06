/* The trailer (docs/trailer/): airport building and operations only. A fresh Career played in headless Chromium at
   1280 × 720 with real clicks, filmed frame by frame on a virtual clock: the page's requestAnimationFrame and
   performance.now are held, and each frame advances them by exactly 1/30 s before it is captured, so the video plays
   smoothly at 30 fps however slowly this machine draws. Between shots the clock runs freely and the game plays on as
   normal. Captions and the title and end cards are a DOM overlay the script injects; no game file changes.
     python3 -m http.server 8777 &   (from the repository root)
     node tools/trailer.js [--url=...] [--frames=dir] [--out=file.mp4] [--stop=scene]
   Needs Playwright (npm i --no-save playwright) and ffmpeg. Each run makes a new world, so names and prices of the
   pieces that depend on the ground change a little. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const URL = arg('url') || 'http://127.0.0.1:8777/iron-canopy/index.html';
const DIR = path.resolve(__dirname, '../docs/trailer');
const OUTV = arg('out') || path.join(DIR, 'iron-canopy-airports.mp4');
const FR = path.resolve(arg('frames') || path.join(os.tmpdir(), 'ic-trailer-frames'));
const STOP = arg('stop');
const SEED = +(arg('seed') || 4242);
const SAVE = arg('save'), FROM = arg('from');  // (for working on the later scenes: save the game where --stop stops, start from it)
const W = 1280, H = 720, FPS = 30, MS = 1000 / FPS;
fs.mkdirSync(DIR, { recursive: true });
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });

// the virtual clock, in the page before the game's scripts: free-running until __film(true), then advanced by __tick
const CLOCK = `(() => {
  const rp = performance.now.bind(performance), rRAF = window.requestAnimationFrame.bind(window);
  let film = false, off = 0, vt = 0, q = [];
  performance.now = () => film ? vt : rp() - off;
  window.requestAnimationFrame = cb => { if (film) { q.push(cb); return 0; } return rRAF(() => cb(rp() - off)); };
  window.__film = on => {
    if (on && !film) { vt = rp() - off; film = true; }
    else if (!on && film) { off = rp() - vt; film = false; const Q = q; q = []; for (const cb of Q) rRAF(() => cb(rp() - off)); }
  };
  window.__tick = ms => { vt += ms; if (window.__onTick) window.__onTick(ms); const Q = q; q = []; for (const cb of Q) cb(vt); };
})()`;

// the overlay: a caption in the game's glass (a title line and a price line), full-screen cards, and an eased camera
const OVERLAY = `(() => {
  document.body.classList.add('tr-noinsp');
  const st = document.createElement('style');
  st.textContent = \`
  #tr-cap{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:99999;pointer-events:none;max-width:min(76rem,94vw);
    padding:.7rem 1.5rem .75rem;border-radius:14px;background:rgba(9,16,23,.9);box-shadow:0 14px 44px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
    color:#e8f0f5;font-family:var(--body);text-align:center;opacity:0}
  #tr-cap b{display:block;font-size:1.5rem;font-weight:600;line-height:1.25}
  #tr-cap span{display:block;margin-top:.3rem;font-family:var(--body);font-weight:500;font-size:1.12rem;color:#f2b441;letter-spacing:.02em}
  #tr-cap span:empty{display:none}
  #tr-card{position:fixed;inset:0;z-index:99998;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;
    background:radial-gradient(ellipse at 50% 45%,rgba(14,28,40,.985),rgb(2,5,8) 72%);opacity:0}
  #tr-card h1{margin:0;font-family:var(--display);font-weight:700;font-size:6.2rem;letter-spacing:.24em;color:#e8f0f5;text-indent:.24em}
  #tr-card p{margin:0;font-family:var(--body);font-size:1.75rem;color:#9ab0bf;max-width:48rem;text-align:center;line-height:1.35}
  #tr-card i{display:block;width:7rem;height:2px;background:#f2b441;opacity:.85}
  .mapctl,#layers,#mapbox,#arsenal,body.tr-nomarks #pmarks,#followchip,body.tr-nocards #cine,body.tr-nocards #evcard,body.tr-nocards #unlock,#brief,#comms,#airpic,#feed,#modehint,#hints,#alerts,#incidents{display:none!important}
  body.tr-noinsp #insp{display:none!important}\`;
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'tr-cap'; cap.innerHTML = '<b></b><span></span>'; document.body.appendChild(cap);
  const card = document.createElement('div'); card.id = 'tr-card'; document.body.appendChild(card);
  // fades run on the page's clock, so a filmed fade lasts its real length in the video
  const F = { cap: { el: cap, a: 0, want: 0, k: 3 }, card: { el: card, a: 0, want: 0, k: 2 } };
  const place = () => {};
  // where an airliner is: on the ground or on a stand (IC.tailWhere), or in the air as its track
  window.trWhere = id => { const S = IC.S, tl = S.av.tails.find(t => t.id === id); if (!tl) return null; const w = IC.tailWhere(S, tl); if (w) return w;
    const t = S.threats.find(q => q.tail && q.tail.id === id && !q.dead); return t ? { x: t.x, y: t.y, h: Math.atan2(t.vy || 0, t.vx || 1), alt: t.alt || 0, t, ap: t.toApt ? S.byId[t.toApt] : null } : null; };
  // a tracking camera on one airliner, its zoom by what it is doing (trFollow = { id, Z: { phase: z } })
  const track = ms => { const T = window.trFollow, S = IC.S; if (!T || !S) return; S.follow = null;
    const w = trWhere(T.id); if (!w) return;
    const ph = w.t ? (w.t.alt > 0.6 ? 'air' : 'final') : w.m ? (w.m.phase || 'taxi') : 'stand', zw = (T.Z[ph] || T.Z.taxi || 60) * (T.k || 1);
    const k = 1 - Math.exp(-ms / 1000 * (T.snap ? 50 : 1.2)), c = IC.cam; T.snap = false;
    c.z = Math.exp(Math.log(c.z) + (Math.log(zw) - Math.log(c.z)) * k);
    const cx = c.x + c.vw / c.z / 2, cy = c.y + c.vh / c.z / 2, kk = 1 - Math.exp(-ms / 1000 * 4);
    const lead = w.t ? 0 : 0, tx = w.x + Math.cos(w.h || 0) * lead, ty = w.y + Math.sin(w.h || 0) * lead + (T.raise || 0) / c.z;
    IC.centerOn(cx + (tx - cx) * kk, cy + (ty - cy) * kk); };
  window.__onTick = ms => { if (window.IC && IC.cam && !window.trFree) IC.cam.fly = null; if (window.IC && IC.S && window.trRun) IC.S.paused = false; if (window.trFollow) track(ms); for (const f of Object.values(F)) { const d = f.want - f.a, s = ms / 1000 * f.k; f.a += Math.sign(d) * Math.min(Math.abs(d), s); f.el.style.opacity = f.a; } place(); };
  window.trCap = (t, p) => { if (t) { cap.querySelector('b').textContent = t; cap.querySelector('span').textContent = p || ''; F.cap.want = 1; } else F.cap.want = 0; place(); };
  window.trCard = (h, p, now) => { if (h) { card.innerHTML = '<h1>' + h + '</h1><i></i><p>' + p + '</p>'; F.card.want = 1; } else F.card.want = 0; if (now) { F.card.a = F.card.want; card.style.opacity = F.card.a; } };
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
  window.trCamNow = (x, y, z) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
})()`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s]`, ...a);
  const ev = (s, a) => page.evaluate(s, a);
  const hold = ms => page.waitForTimeout(ms);
  const screenOf = (x, y) => ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(), s = IC.toScreen(${x}, ${y}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
  const boxOf = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const cap = (t, p) => ev(`trCap(${JSON.stringify(t || '')}, ${JSON.stringify(p || '')})`);
  const money = v => ev(`IC.U.money(${v})`);
  // close whatever the game has put up: hints, story cards, the moment banner (the overlay may hide them on film)
  const dismiss = () => ev(`(() => { for (let i = 0; i < 12; i++) { const h = [...document.querySelectorAll('[data-act="hintOk"]')].find(e => e.offsetParent); if (h) { h.click(); continue; }
    const c = document.getElementById('cine'); if (c && !c.hidden) { IC.ui.closeCine(); continue; }
    const u = document.getElementById('unlock'); if (u && !u.hidden) { IC.ui.closeMoment(); continue; } break; } })()`);

  // filming: each frame advances the page's clock by 1/30 s, runs whatever the shot does at that frame, then captures
  const cdp = await page.context().newCDPSession(page);
  let dbg = null;
  let nFrames = 0, filming = false, mouse = { x: W / 2, y: H / 2 };
  const scenes = []; let scn = null;
  const scene = (name, caption, price) => { if (scn) scn.b = nFrames; scn = { name, caption: caption || '', price: price || '', a: nFrames }; scenes.push(scn); log('scene', name, price || ''); return cap(caption, price); };
  const frame = async () => {
    await ev('__tick(' + MS + ')');
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    fs.writeFileSync(path.join(FR, String(nFrames++).padStart(6, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
  };
  const filmOn = async () => { if (!filming) { await ev('__film(true)'); filming = true; } };
  const filmOff = async () => { if (filming) { await ev('__film(false)'); filming = false; } };
  // shoot n seconds; each(i, n) runs before frame i (may be async); until() ends it early
  const shoot = async (sec, each, until) => {
    await filmOn();
    const n = Math.round(sec * FPS);
    for (let i = 0; i < n; i++) { if (each) await each(i, n); await frame(); if (dbg && i % 45 === 0) log(' ', scn && scn.name, JSON.stringify(await dbg())); if (until && i % 3 === 0 && await until()) break; }
  };
  // a mouse glide over the frames of a shot (eased), so hovers and ghosts follow it on film
  const glideTo = (x, y, sec) => { const a = { ...mouse }, n = Math.max(1, Math.round(sec * FPS)); let i = 0;
    return async () => { if (i > n) return; const k = i++ / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; mouse = { x: a.x + (x - a.x) * e, y: a.y + (y - a.y) * e }; await page.mouse.move(mouse.x, mouse.y); }; };
  const RAISE = 70;  // px: what the camera looks at sits this far above the middle, clear of the build bar
  const camTo = (x, y, z, ms) => ev(`trCam(${x}, ${y + RAISE / z}, ${z}, ${ms}); 0`);
  const camNow = (x, y, z) => ev(`trCamNow(${x}, ${y + RAISE / z}, ${z})`);
  const click = async (sel) => { const b = await boxOf(sel); if (!b) { log('no', sel); return false; } mouse = b; await page.mouse.click(b.x, b.y); return true; };
  const stopAt = async name => { if (STOP !== name) return; if (SAVE) { await filmOff(); fs.writeFileSync(SAVE, await ev('JSON.stringify(IC.saveGame(IC.S))')); log('saved', SAVE); } throw new Error('STOP'); };

  await page.addInitScript(CLOCK);
  // the game's web fonts, fetched by curl (which trusts the sandbox's proxy) when the browser cannot reach them
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
    try {
      const body = execFileSync('curl', ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', route.request().url()]);
      const css = /googleapis/.test(route.request().url());
      await route.fulfill({ status: 200, body, headers: { 'content-type': css ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } });
    } catch (e) { await route.continue(); }
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.IC && IC.begin, null, { timeout: 90000 });
  await ev(OVERLAY);
  await ev(`Promise.all(['700 20px "Saira Condensed"', '500 20px "IBM Plex Sans Condensed"'].map(f => document.fonts.load(f)))`);
  await hold(1500);

  const planCost = () => ev(`(() => { const S = IC.S, m = S.mode2; if (!m || m.kind !== 'build') return 0; const o = IC.bldPlanOf(S, m); return o && o.ok ? o.cost : 0; })()`);
  // a piece from the build bar: hover its card (the price), pick it, glide to where it goes, click, Build
  const piece = async (k, w, title, sub, opt) => {
    opt = opt || {};
    const it = `#bbar .bb-it[data-v="${k}"]`;
    const cost = await ev(`IC.U.money(IC.pieceCost('${k}'))`);
    await scene(k, title, sub + ' · ' + cost);
    let gg = glideTo(...Object.values(await boxOf(it)), 0.9);
    await shoot(1.6, gg);
    await page.mouse.click(mouse.x, mouse.y);
    await shoot(0.3);
    const q = await screenOf(w.x, w.y);
    gg = glideTo(q.x, q.y, 1.4);
    await shoot(opt.place || 2.0, gg);
    await page.mouse.click(q.x, q.y);
    await shoot(1.0);
    const c2 = await planCost();
    if (!c2) log(k, 'not buildable here:', await ev(`(() => { const S = IC.S, m = S.mode2; const o = m && IC.bldPlanOf(S, m); return o ? o.why + ' / ' + (o.text || []).join(' ') : 'no mode'; })()`));
    else if (Math.abs(c2 - (await ev(`IC.pieceCost('${k}')`))) > 1) { const c3 = await money(c2); await cap(title, sub + ' · ' + c3); scn.price = sub + ' · ' + c3; }
    gg = glideTo(...Object.values(await boxOf('#bldgo [data-go="build"]')), 0.8);
    await shoot(1.2, gg);
    await page.mouse.click(mouse.x, mouse.y);
    await shoot(0.6);
    await cap('');
    await shoot(0.4);
  };
  let capId, AP, ap, F, at, mid, g, p;
  // the airport's frame: its runway's direction, and which side its parallel taxiway is on
  const frameOf = async () => {
    capId = await ev('IC.S.story.cap'); AP = `IC.S.byId['${capId}']`;
    ap = await ev(`(() => { const a = ${AP}; return { x: a.x, y: a.y }; })()`);
    F = await ev(`(() => { const a = ${AP}, rw = a.parts.find(q => q.kind === 'runway'), d = IC.rwDir(rw), mid = IC.rwAt(rw, 0.5);
      const A = a.parts.find(q => q.kind === 'taxi' && q.name === 'A') || a.parts.find(q => q.kind === 'taxi'), n0 = a.nodes[A.nodes[0]];
      const sg = ((n0.x - mid.x) * -d.y + (n0.y - mid.y) * d.x) >= 0 ? 1 : -1;
      return { mx: mid.x, my: mid.y, dx: d.x, dy: d.y, nx: -d.y * sg, ny: d.x * sg }; })()`);
    at = (u, v) => ({ x: F.mx + F.dx * u + F.nx * v, y: F.my + F.dy * u + F.ny * v });
    mid = at(2, 2.6);
  };
  try {
   if (FROM) {
    const data = fs.readFileSync(FROM, 'utf8');
    await page.click('[data-act="begin"][data-v="story"]');
    await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 180000 });
    await page.evaluate(d => { IC.adopt(IC.loadSave(JSON.parse(d))); IC.S.paused = false; }, data);
    await ev(`trCard('', '', true)`);
    await hold(1500); await dismiss();
    await frameOf();
    log('loaded', FROM, await ev('IC.U.clock(IC.S.time, IC.S)'));
   } else {
    // 1. title, over the start screen
    await ev(`trCard('IRON CANOPY', 'Build an airport, part by part. Then keep it moving.', true)`);
    scene('title');
    await shoot(3.2);
    await filmOff();
    await ev(`IC.S.seed = ${SEED}; IC.seedRandom(${SEED})`);
    await page.click('[data-act="begin"][data-v="story"]');
    await page.waitForFunction(() => IC.S && IC.S.story && !(IC.building && IC.building()), null, { timeout: 180000 });
    await hold(2500);
    await dismiss();
    await ev('IC.S.paused = false');

    // 2. founding: the site survey round the capital, then Found
    await page.click('[data-act="bbToggle"]'); await hold(300);
    await page.click('#bbar [data-act="foundMode"]'); await hold(400);
    const site = await ev(`(() => { const S = IC.S, c = IC.cap(S); for (const d of [250, 220, 280, 200, 300]) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!IC.foundCheck(S, x, y) && !IC.foundSurvey(S, x, y, IC.PREVAIL).river) return { x, y, cx: c.x, cy: c.y }; } return null; })()`);
    await ev(`IC.frame(${site.cx - 420}, ${site.cy - 300}, ${site.cx + 420}, ${site.cy + 300})`);
    await hold(800);
    mouse = { x: W / 2 - 220, y: H / 2 + 80 }; await page.mouse.move(mouse.x, mouse.y);
    await ev(`trCard('')`);
    scene('found', 'Choose the site', 'The survey reads the wind, the ground and the towns under the approach');
    p = await screenOf(site.x, site.y);
    g = glideTo(p.x, p.y, 2.2);
    await shoot(4.5, g);
    await page.mouse.click(p.x, p.y);
    await shoot(1.5);
    await filmOff();
    await page.click('#bldgo [data-go="build"]'); await hold(1500);
    await dismiss();
    capId = await ev('IC.S.story.cap'); AP = `IC.S.byId['${capId}']`;
    ap = await ev(`(() => { const a = ${AP}; return { x: a.x, y: a.y }; })()`);
    log('founded', capId, ap);
    await stopAt('found');

    // 3. the runway with its taxiways: the surveyed plan, its price, Build
    await camNow(ap.x, ap.y, 15); await hold(800);
    const rwCost = await planCost();
    await scene('runway', 'Runway with taxiways', `3 km of concrete · parallel taxiway · rapid exits · landing systems · ${await money(rwCost)}`);
    await camTo(ap.x, ap.y, 20, 3800);
    await shoot(3.6);
    g = glideTo(...Object.values(await boxOf('#bldgo [data-go="build"]')), 1.0);
    await shoot(1.3, g);
    await page.mouse.click(mouse.x, mouse.y);
    await shoot(0.8);
    await cap('');
    await shoot(0.4);
    await stopAt('runway');

    await frameOf();

    // 4. the terminal, beside the parallel taxiway, then the services past its end
    await camNow(F.mx + F.nx * 3.6, F.my + F.ny * 3.6, 62);
    await piece('tstraight', at(0, 4.2), 'Terminal with apron', 'Six stands with jet bridges · a taxilane · joined to the parallel by itself');
    await stopAt('terminal');
    await camTo(...Object.values(at(8, 3.4)), 40, 1500); await shoot(1.5);
    await piece('services', at(9, 3.4), 'Services', 'Control tower ₭70M · fire station ₭60M · fuel farm ₭90M');
    await stopAt('services');

    // 5. construction, stage by stage: close in on the runway at 32×, then Finish now over the whole site
    const works = () => ev(`${AP}.works.map(w => w.part.kind + ':' + (w.stages[w.si] || {}).k + ':' + (w.prog || 0).toFixed(2)).join(' ')`);
    await page.keyboard.press('Escape');
    await ev('IC.bbToggle(false); IC.select(null)');
    const near = at(-6, 0);
    await camTo(near.x, near.y, 110, 1800);
    await scene('stages', 'Built in stages, paid as the work runs', 'Survey 3% · earthworks 27% · paving 50% · markings and lights 20%');
    await page.keyboard.press('6');
    await shoot(1.5);
    for (let k = 0; k < 3; k++) { await shoot(2.2); log('works', await works()); }
    await stopAt('build');
    await cap(''); await shoot(0.4);

    // the rest at 432×: Finish now, over the whole site
    await ev(`trCamNow(${mid.x}, ${mid.y}, 24)`);
    await ev(`IC.waitStart(IC.S, 'works:${capId}')`);
    await scene('rise', 'Everything rises together', 'Runway, taxiways, terminal, tower, fire station and fuel farm');
    await shoot(6, null, () => ev(`!${AP}.works.length`));
    await filmOff();
    for (let i = 0; i < 300; i++) { if (!(await ev(`${AP}.works.length`))) break; await hold(500); if (i % 6 === 0) await dismiss(); }
    await ev('IC.waitStop && IC.waitStop(IC.S)'); await page.keyboard.press('1');
    await dismiss();
    const spent = await ev(`IC.U.money(${AP}.parts.reduce((a, q) => a + IC.partCost(${AP}, q), 0))`);
    const st0 = await ev(`(() => { const st = IC.aptStats(IC.S, ${AP}); return { arr: Math.round(st.arrH || st.arr || 0), dep: Math.round(st.depH || st.dep || 0), keys: Object.keys(st).join(',') }; })()`);
    log('built', spent, st0);
    await ev(`trCamNow(${mid.x}, ${mid.y}, 22)`);
    await scene('ready', 'Ready for jets', `All of it: ${spent}`);
    await ev(`trCam(${mid.x}, ${mid.y}, 34, 4500); 0`);
    await shoot(4.2);
    await cap(''); await shoot(0.4);
    await stopAt('ready');
   }

    await ev(`document.body.classList.add('tr-nocards'); window.trRun = true`);
    const signAll = () => ev(`(() => { const S = IC.S; let n = 0; for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q) && IC.avDecide(S, q.id, true)) n++; return n; })()`);
    const probs = () => ev(`IC.aptProblems(IC.S, ${AP}).filter(p => p.fix && p.fix.part).map(p => ({ id: p.id, title: p.title, part: p.fix.part, label: p.fix.label, x: (p.at || p.fix.near || ${AP}).x, y: (p.at || p.fix.near || ${AP}).y }))`);
    if (!process.argv.includes('--skip-first')) {
    // 6. the first airliner: 32× until it is 30 km out, then filmed from final approach to the stand
    await page.keyboard.press('6');
    // a deal that needs something built shows as a problem on the map, with its fix: film that, build it
    let prob = null;
    for (let i = 0; i < 400 && !prob; i++) { await hold(500); if (i % 4 === 0) { await dismiss(); await signAll(); } prob = (await probs())[0]; if (await ev('!!IC.S.first')) break; }
    log('problem', prob);
    if (prob) {
      await page.keyboard.press('1');
      const kc = await ev(`IC.U.money(IC.APART['${prob.part}'] ? IC.APART['${prob.part}'].cost : IC.pieceCost('${prob.part}'))`);
      await ev(`document.body.classList.add('tr-noinsp'); trCamNow(${mid.x}, ${mid.y + RAISE / 26}, 26)`);
      await scene('problem', 'Problems show on the map, with their fix', `${prob.title} · ${await ev(`(IC.APART['${prob.part}'] || IC.PIECES['${prob.part}']).name`)} ${kc}`);
      const mk = `#pmarks [data-act="pmFix"][data-v="${prob.id}"]`;
      const bx = await boxOf(mk);
      if (bx) { g = glideTo(bx.x, bx.y, 1.2); await shoot(2.4, g); await page.mouse.click(bx.x, bx.y); } else log('no marker button');
      await shoot(1.6);
      log('fix placed:', await ev(`(() => { const m = IC.S.mode2; return m ? m.kind + ':' + m.part + ':' + !!m.set : 'none'; })()`));
      const bb = await boxOf('#bldgo [data-go="build"]');
      if (bb) { g = glideTo(bb.x, bb.y, 0.9); await shoot(1.4, g); await page.mouse.click(bb.x, bb.y); }
      await shoot(0.8);
      await ev(`IC.bbToggle(false); IC.S.paused = false; IC.waitStart(IC.S, 'works:${capId}')`);
      await shoot(2.5);
      await cap(''); await shoot(0.4);
      await filmOff();
      for (let i = 0; i < 200; i++) { if (!(await ev(`${AP}.works.length`))) break; await hold(500); }
      await ev('IC.waitStop && IC.waitStop(IC.S); window.trRun = true'); await page.keyboard.press('6');
    }
    await stopAt('problem');
    for (let i = 0; i < (STOP === "diag" ? 240 : 900); i++) { await hold(500); if (i % 4 === 0) { await dismiss(); await signAll(); } if (await ev('!!IC.S.first')) break; if (await ev('IC.S.speed < 32 && !IC.S.first')) await page.keyboard.press('6'); }
    const tl = await ev('IC.S.first && IC.S.first.tl'); log('first', tl);
    if (!tl || STOP === 'diag') log('no first:', await ev(`JSON.stringify({ req: IC.S.av.requests.map(q => [q.id, IC.avReqBlock(IC.S, q)]), als: IC.S.av.airlines.length, tails: IC.S.av.tails.length, probs: IC.aptProblems(IC.S, ${AP}).map(p => p.kind + ':' + p.title), tw: IC.S.av.tails.map(t => t.where + ':' + t.t), ev: !document.getElementById('evcard').hidden && document.querySelector('#evcard h2').textContent, goal: (IC.S.story.goals[0] || {}).text, date: IC.U.clock(IC.S.time, IC.S) })`));
    await stopAt('diag');
    const Z = { air: 9, final: 26, land: 60, rollout: 70, taxi: 95, parkin: 140, stand: 170, start: 150, wait: 150, push: 120, hold: 90, lineup: 70, roll: 45 };
    await ev(`window.trFollow = { id: '${tl}', Z: ${JSON.stringify(Z)}, snap: true }`);
    const where = () => ev(`(() => { const S = IC.S, tl = S.av.tails.find(t => t.id === '${tl}'), w = trWhere('${tl}'); if (!w) return {}; return { air: !!w.t, d: w.t && w.ap ? IC.U.dist(w.t, w.ap) : 0, ph: w.m ? w.m.phase || 'taxi' : w.t ? 'air' : 'stand', alt: w.alt || 0, where: tl.where, txt: IC.tailPhase(S, tl), z: Math.round(IC.cam.z) }; })()`);
    if (process.argv.includes('--debug')) dbg = where;
    await page.keyboard.press('3');
    await scene('final', 'The first airliner', 'Spaced in by the arrival manager, lined up on the landing system');
    await shoot(12, null, async () => { const w = await where(); return !w.air || w.d < 45; });
    await page.keyboard.press('1');
    await scene('land', 'Touchdown, then a rapid exit', 'Off the runway sooner, so the next one can land');
    await shoot(30, null, async () => { const w = await where(); return w.ph === 'taxi' || w.ph === 'parkin' || w.where === 'stand'; });
    await page.keyboard.press('3');
    await scene('taxi', 'Taxi to the stand', 'Routes are reserved ahead: no one meets nose to nose');
    await shoot(12, null, async () => (await where()).where === 'stand');
    const paid = await ev(`(() => { const tl = IC.S.av.tails.find(t => t.id === '${tl}'), P = tl.paid || {}; return { land: IC.U.money(P.land || 0), pf: IC.U.money(P.pf || 0), pax: P.pax || 0 }; })()`);
    await scene('fee', 'Every landing pays', `${paid.land} landing fee · ${paid.pf} for ${paid.pax} passengers`);
    await shoot(3.5);
    await stopAt('fee');

    // 7. the turnaround at stand zoom, at 8×, then pushback and away
    await page.keyboard.press('4');
    await scene('turn', 'The turnaround', 'Jet bridge, bags, catering and the fuel truck from the farm, each on its way');
    await shoot(9, null, async () => /Refuel/.test((await where()).txt || ''));
    await scene('fuel', 'Fuel decides how soon it leaves', 'Two trucks per tank refuel 8 aircraft an hour; a hydrant removes the limit');
    await shoot(5);
    await cap(''); await shoot(0.4);
    await filmOff(); await page.keyboard.press('4');
    for (let i = 0; i < 300; i++) { await hold(250); const w = await where(); if (w.ph === 'push' || w.ph === 'start' || w.ph === 'wait') break; }
    await page.keyboard.press('3');
    await scene('push', 'Pushback, taxi out, hold short', 'Cleared by a tower that can see the runway');
    await shoot(14, null, async () => { const w = await where(); return w.ph === 'lineup' || w.ph === 'roll'; });
    await scene('takeoff', 'Line up and go', 'Departures wait under the arrivals until they are clear');
    await shoot(12, null, async () => { const w = await where(); return w.air && w.alt > 0.4; });
    await ev('window.trFollow = null');
    await cap(''); await shoot(0.4);
    await stopAt('takeoff');
    }

    // 8. busier: hours pass at 32× (offers signed, what deals need built by the game's own fixes), then the airport at work
    await ev('window.trRun = true'); await page.keyboard.press('6');
    const tried = new Set();
    const fixOne = async () => {
      const pr = (await probs()).find(q => !tried.has(q.id)); if (!pr) return false; tried.add(pr.id);
      const b = await boxOf(`#pmarks [data-act="pmFix"][data-v="${pr.id}"]`); if (!b) return false;
      await page.mouse.click(b.x, b.y); await hold(600);
      const go = await boxOf('#bldgo [data-go="build"]'); if (!go) { await page.keyboard.press('Escape'); return false; }
      await page.mouse.click(go.x, go.y); await hold(300); await ev('IC.bbToggle(false)'); log('built for a deal:', pr.part, pr.title); return true;
    };
    // a cargo area beside the terminal, from the build bar, with its price
    await page.keyboard.press('1');
    await ev(`IC.select({ kind: 'infra', ref: ${AP} }); IC.bbToggle(true)`); await hold(400);
    await click('#bbar [data-bb="tab"][data-v="pc"]');
    await camNow(...Object.values(at(-9, 4.2)), 40);
    await piece('cargoarea', at(-9, 4.6), 'Cargo area', 'A cargo shed, its apron and four freighter stands');
    await ev(`IC.bbToggle(false); IC.select(null); IC.waitStart(IC.S, 'works:${capId}')`);
    await camTo(...Object.values(at(-9, 4.6)), 40, 1);
    await shoot(4, null, () => ev(`!${AP}.works.length`));
    await shoot(1.2);
    await cap(''); await shoot(0.3);
    await filmOff();
    for (let i = 0; i < 200; i++) { if (!(await ev(`${AP}.works.length`))) break; await hold(500); }
    await stopAt('cargo');
    // months pass (Wait runs a month in about a minute): offers signed, what the deals need built by the game's fix
    const months = +(arg('months') || 3), m0 = await ev('IC.S.cal.m');
    const tStart = Date.now();
    while (Date.now() - tStart < 900000 && (await ev('IC.S.cal.m')) - m0 < months) {
      await hold(1000); await dismiss(); await signAll();
      if (await ev(`IC.cam.z < 3 || IC.cam.z > 40`)) await ev(`trCamNow(${mid.x}, ${mid.y}, 18)`);
      await fixOne();
      if (!(await ev('!!IC.S.wait'))) await ev(`IC.waitStart(IC.S, 'amt:999999') || (IC.S.speed = 32)`);
    }
    await ev('IC.waitStop && IC.waitStop(IC.S)');
    log('months', await ev('IC.U.clock(IC.S.time, IC.S)'));
    // on to the morning
    await page.keyboard.press('6');
    for (let i = 0; i < 400; i++) { await hold(500); if (i % 6 === 0) { await dismiss(); await signAll(); } if (await ev('(IC.S.time % 86400) / 3600 > 9.5 && (IC.S.time % 86400) / 3600 < 12')) break; if (await ev('IC.S.speed < 32 && !IC.S.wait')) await page.keyboard.press('6'); }
    await ev(`document.body.classList.add('tr-nomarks')`);
    await page.keyboard.press('3');
    const stat = await ev(`(() => { const st = IC.aptStats(IC.S, ${AP}), n = Object.values(st.stands).reduce((a, b) => a + b, 0); return { arr: Math.round(st.arrPerHour), dep: Math.round(st.depPerHour), pax: Math.round(st.pax / 10) * 10, stands: n, tails: IC.S.av.tails.filter(t => t.at === '${capId}' || t.where === 'air').length, als: IC.S.av.airlines.length }; })()`);
    log('busy', stat);
    const apron = await ev(`(() => { const a = ${AP}, p = a.parts.filter(q => q.kind === 'apron' && q.built); const q = p[0] || a; return { x: q.x != null ? q.x : a.x, y: q.y != null ? q.y : a.y }; })()`);
    await ev(`trCamNow(${(apron.x + mid.x) / 2}, ${(apron.y + mid.y) / 2}, 30)`);
    await scene('busy', `${stat.als} airlines, months later`, `Rated ${stat.arr} arrivals and ${stat.dep} departures an hour · ${stat.stands} stands · ${stat.pax} passengers an hour`);
    await ev(`trCam(${apron.x}, ${apron.y}, 55, 7000); 0`);
    await shoot(7);
    await cap(''); await shoot(0.4);
    await stopAt('busy');

    // 9. the info views: what each runway takes in the wind now, and where the taxiing queues form
    await ev(`IC.select({ kind: 'infra', ref: ${AP} }); IC.bbToggle(true)`); await hold(400);
    await ev(`trCamNow(${mid.x}, ${mid.y + RAISE / 20}, 20)`);
    await click('#bbar [data-bb="tool"][data-v="info"]'); await hold(300);
    if (await boxOf('#bbar [data-bb="view"][data-v="capacity"]')) await click('#bbar [data-bb="view"][data-v="capacity"]');
    await ev(`document.getElementById('tr-cap').style.top = '150px'`);
    await scene('capacity', 'Info views: runway capacity', 'What each runway takes an hour in the wind now, and what it is used for');
    await shoot(4.5);
    if (await boxOf('#bbar [data-bb="view"][data-v="service"]')) { await click('#bbar [data-bb="view"][data-v="service"]'); await ev(`trCamNow(${mid.x}, ${mid.y + RAISE / 18}, 18)`); }
    await scene('service', 'Info views: fuel and fire cover', 'The fire trucks must reach every point of a runway in 3 minutes, or heavy jets go elsewhere');
    await shoot(4.5);
    await cap(''); await shoot(0.4);
    await ev(`IC.bb.view = null; IC.bbToggle(false); IC.select(null); document.getElementById('tr-cap').style.top = ''`);
    await stopAt('info');

    // 10. dusk to night: the lights take over
    await filmOff(); await page.keyboard.press('6');
    for (let i = 0; i < 400; i++) { await hold(500); if (i % 6 === 0) { await dismiss(); await signAll(); } if (await ev('IC.daylight(IC.S.time) < 0.15')) break; }
    await page.keyboard.press('3');
    await ev(`trCamNow(${apron.x}, ${apron.y}, 70)`);
    await scene('night', 'Day and night, it keeps going', "Edge lights, floodlit stands and the tower's beacon");
    await ev(`trCam(${mid.x}, ${mid.y}, 16, 9000); 0`);
    await shoot(9.5);
    await cap(''); await shoot(0.4);
    await stopAt('night');

    // 11. the end card
    await ev(`trCard('IRON CANOPY', 'Build it part by part. Run it hour by hour.')`);
    await scene('end');
    await shoot(4);

  } catch (e) {
    if (e.message !== 'STOP') throw e;
    log('stopped at', STOP);
  }
  if (scn) scn.b = nFrames;
  await browser.close();
  log('frames', nFrames, 'errors', errors.length ? errors.join(' / ') : 'none');
  fs.writeFileSync(path.join(FR, 'scenes.json'), JSON.stringify(scenes, null, 1));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FR, '%06d.jpg'),
    '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', OUTV]);
  console.log(JSON.stringify({ length: +(nFrames / FPS).toFixed(1), scenes: scenes.map(s => ({ name: s.name, at: +(s.a / FPS).toFixed(1), len: +((s.b - s.a) / FPS).toFixed(1), caption: s.caption, price: s.price })), errors }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
