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
  .mapctl,#layers,#mapbox,#brief,#comms,#airpic,#feed,#modehint,#hints,#alerts,#incidents{display:none!important}
  body.tr-noinsp #insp{display:none!important}\`;
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'tr-cap'; cap.innerHTML = '<b></b><span></span>'; document.body.appendChild(cap);
  const card = document.createElement('div'); card.id = 'tr-card'; document.body.appendChild(card);
  // fades run on the page's clock, so a filmed fade lasts its real length in the video
  const F = { cap: { el: cap, a: 0, want: 0, k: 3 }, card: { el: card, a: 0, want: 0, k: 2 } };
  const place = () => {};
  window.__onTick = ms => { if (window.IC && IC.cam && !window.trFree) IC.cam.fly = null; for (const f of Object.values(F)) { const d = f.want - f.a, s = ms / 1000 * f.k; f.a += Math.sign(d) * Math.min(Math.abs(d), s); f.el.style.opacity = f.a; } place(); };
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
  const dismiss = async () => {
    for (let i = 0; i < 12; i++) {
      const b = await page.$('[data-act="hintOk"]:visible');
      if (b) { await b.click(); await hold(250); continue; }
      const c = await page.$('#cine:not([hidden])');
      if (c) { await c.click({ position: { x: 20, y: 20 } }); await hold(700); continue; }
      break;
    }
  };

  // filming: each frame advances the page's clock by 1/30 s, runs whatever the shot does at that frame, then captures
  const cdp = await page.context().newCDPSession(page);
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
    for (let i = 0; i < n; i++) { if (each) await each(i, n); await frame(); if (until && i % 3 === 0 && await until()) break; }
  };
  // a mouse glide over the frames of a shot (eased), so hovers and ghosts follow it on film
  const glideTo = (x, y, sec) => { const a = { ...mouse }, n = Math.max(1, Math.round(sec * FPS)); let i = 0;
    return async () => { if (i > n) return; const k = i++ / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; mouse = { x: a.x + (x - a.x) * e, y: a.y + (y - a.y) * e }; await page.mouse.move(mouse.x, mouse.y); }; };
  const RAISE = 70;  // px: what the camera looks at sits this far above the middle, clear of the build bar
  const camTo = (x, y, z, ms) => ev(`trCam(${x}, ${y + RAISE / z}, ${z}, ${ms}); 0`);
  const camNow = (x, y, z) => ev(`trCamNow(${x}, ${y + RAISE / z}, ${z})`);
  const click = async (sel) => { const b = await boxOf(sel); if (!b) { log('no', sel); return false; } mouse = b; await page.mouse.click(b.x, b.y); return true; };
  const stopAt = name => { if (STOP === name) throw new Error('STOP'); };

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

  try {
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
    let p = await screenOf(site.x, site.y);
    let g = glideTo(p.x, p.y, 2.2);
    await shoot(4.5, g);
    await page.mouse.click(p.x, p.y);
    await shoot(1.5);
    await filmOff();
    await page.click('#bldgo [data-go="build"]'); await hold(1500);
    await dismiss();
    const capId = await ev('IC.S.story.cap');
    const AP = `IC.S.byId['${capId}']`;
    const ap = await ev(`(() => { const a = ${AP}; return { x: a.x, y: a.y, a: a.survey ? a.survey.a : a.rwyA || 0 }; })()`);
    log('founded', capId, ap);
    stopAt('found');

    // 3. the runway with its taxiways: the surveyed plan, its price, Build
    await camNow(ap.x, ap.y, 15); await hold(800);
    const planCost = () => ev(`(() => { const S = IC.S, m = S.mode2; if (!m || m.kind !== 'build') return 0; const o = IC.bldPlanOf(S, m); return o && o.ok ? o.cost : 0; })()`);
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
    stopAt('runway');

    // the airport's frame: the runway's direction, and which side its parallel taxiway is on
    const F = await ev(`(() => { const a = ${AP}, rw = a.parts.find(q => q.kind === 'runway'), d = IC.rwDir(rw), mid = IC.rwAt(rw, 0.5);
      const A = a.parts.find(q => q.kind === 'taxi' && q.name === 'A') || a.parts.find(q => q.kind === 'taxi'), n0 = a.nodes[A.nodes[0]];
      const sg = ((n0.x - mid.x) * -d.y + (n0.y - mid.y) * d.x) >= 0 ? 1 : -1;
      return { mx: mid.x, my: mid.y, dx: d.x, dy: d.y, nx: -d.y * sg, ny: d.x * sg }; })()`);
    const at = (u, v) => ({ x: F.mx + F.dx * u + F.nx * v, y: F.my + F.dy * u + F.ny * v });
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

    // 4. the terminal, beside the parallel taxiway, then the services past its end
    await camNow(F.mx + F.nx * 3.6, F.my + F.ny * 3.6, 62);
    await piece('tstraight', at(0, 4.2), 'Terminal with apron', 'Six stands with jet bridges · a taxilane · joined to the parallel by itself');
    stopAt('terminal');
    await camTo(...Object.values(at(8, 3.4)), 40, 1500); await shoot(1.5);
    await piece('services', at(9, 3.4), 'Services', 'Control tower ₭70M · fire station ₭60M · fuel farm ₭90M');
    stopAt('services');

    // 5. construction, stage by stage, at 32×
    const works = () => ev(`${AP}.works.map(w => w.part.kind + ':' + (w.stages[w.si] || {}).k + ':' + (w.prog || 0).toFixed(2) + ':' + Math.round(w.dur)).join(' ')`);
    log('works', await works());
    await page.keyboard.press('Escape');
    await camTo(F.mx + F.nx * 2.5, F.my + F.ny * 2.5, 30, 1500);
    await shoot(1.5);
    await page.keyboard.press('6');
    for (let k = 0; k < 6; k++) { await shoot(3); log('works', await ev('IC.U.clock ? IC.S.time : 0'), await works()); }
    stopAt('build');
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
