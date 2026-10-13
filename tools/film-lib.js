/* Shared by the film tools (brief 58–60: tools/film-shots.js, tools/teaser.js): a page of the game in headless
   Chromium with the web fonts and three.js served from disk where the sandbox blocks them, and a camera that films
   it frame by frame on the game's own held clock (IC.film.hold / IC.film.tick), so every clip is smooth at its frame
   rate however slowly this machine draws. Needs Playwright (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const LIB = `
window.wait = ms => new Promise(r => setTimeout(r, ms));
window.seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/* a quiet page: no hints, story cards or staff messages over the picture */
window.quiet = () => { IC.ui.hintsOn = false; IC.ui.cineShown = 1e9; for (const id of ['cine', 'comms', 'unlock']) { const e = document.getElementById(id); if (e) e.hidden = true; } };
window.steps = (S, sec, until) => { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until) { const r = until(S); if (r) return r; } } return null; };
window.look = (x, y, z) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
`;

async function open(o) {
  o = o || {};
  const W = o.w || 1920, H = o.h || 1080;
  const bopt = { args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.HTTPS_PROXY) bopt.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' };
  let browser;
  try { browser = await chromium.launch(bopt); } catch (e) { const alt = process.env.CHROMIUM || '/opt/pw-browsers/chromium'; if (!fs.existsSync(alt)) throw e; browser = await chromium.launch(Object.assign({ executablePath: alt }, bopt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (o.verbose && m.type() !== 'debug') console.log('  [page]', m.text()); });
  // the web fonts by curl (it trusts the sandbox's proxy), three.js from node_modules
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
    try {
      const body = execFileSync('curl', ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', route.request().url()]);
      await route.fulfill({ status: 200, body, headers: { 'content-type': /googleapis/.test(route.request().url()) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } });
    } catch (e) { await route.continue(); }
  });
  const three = path.join(ROOT, 'node_modules/three/build/three.module.min.js');
  if (fs.existsSync(three)) await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\//, r => r.fulfill({ path: three, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.join(o.root || ROOT, 'iron-canopy/index.html'));
  await page.waitForFunction(() => window.IC && IC.begin && IC.S && IC.film, null, { timeout: 90000 });
  await page.evaluate(LIB);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  const cam = {
    page, browser, errors, W, H, n: 0, dir: o.frames, fps: o.fps || 30,
    ev: (s, a) => page.evaluate(s, a),
    /* film sec seconds: each frame moves the held clock on by one frame, runs each(i, n) first, then saves the
       picture as the next numbered JPEG in dir */
    async film(sec, each) {
      await page.evaluate(() => IC.film.hold(true));
      const n = Math.round(sec * cam.fps), ms = 1000 / cam.fps;
      for (let i = 0; i < n; i++) {
        if (each) await each(i, n);
        await page.evaluate(m => IC.film.tick(m), ms);
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
        fs.writeFileSync(path.join(cam.dir, String(cam.n++).padStart(6, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
      }
    },
    /* let the clock run freely again (between shots, so the game and the tiles catch up) */
    async free(ms) { await page.evaluate(() => IC.film.hold(false)); if (ms) await page.waitForTimeout(ms); },
    /* a still on the held clock: one frame on, the map's tiles all painted in it */
    async still(file) {
      await page.evaluate(() => { IC.film.hold(true); IC.film.tick(16); IC.film.tick(16); });
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() { await browser.close(); }
  };
  if (cam.dir) fs.mkdirSync(cam.dir, { recursive: true });
  return cam;
}

module.exports = { open, ROOT };
