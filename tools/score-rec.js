/* Recordings of the game's sound, to listen to without playing: the score and the ambience in four moments, taken
   from the page's own mix (everything the master volume carries).
     node tools/score-rec.js [scene ...] [--sec=20]
   Scenes: peace (the Career, close over the country by day), night (the same at night), tension (a Quick war's
   first hour), raid (drones and cruise missiles coming at the capital). Saves shots/score-<scene>.webm and prints
   its loudness (RMS and peak, dB), so silence or clipping shows. Needs Playwright (npm i --no-save playwright). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }

const args = process.argv.slice(2);
const sec = +((args.find(a => a.startsWith('--sec=')) || '--sec=20').slice(6));
const plain = args.filter(a => !a.startsWith('--'));
const which = plain.length ? plain : ['peace', 'night', 'tension', 'raid'];

const SETUP = `
window.__rec = async function (scene, sec) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mode = scene === 'peace' || scene === 'night' ? 'story' : 'campaign';
  if (!IC.S.started || IC.S.mode !== mode) await IC.begin(mode);
  const S = IC.S; IC.sfx.init();
  IC.ui.hintsOn = false; IC.ui.cineShown = 1e9;
  S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.paused = false; S.speed = 1;
  const c = IC.cap(S);
  const hour = scene === 'night' ? 23 : scene === 'raid' ? 15 : 10;
  S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  IC.cam.fly = null;
  if (scene === 'peace' || scene === 'night') { IC.cam.z = 6; IC.centerOn(c.x + 300, c.y + 200); }
  else { IC.cam.z = 1.2; IC.centerOn(c.x, c.y); }
  if (scene === 'raid') {
    S.enemy.war = true; IC.enemyTick = () => {};
    for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; IC.spawnThreat(S, i % 3 ? 'owa' : 'lacm', c.x + Math.cos(a) * 700, c.y + Math.sin(a) * 700, { route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y }, target: c, fromHostile: true }); }
  }
  const G = IC.sfx.graph, dst = G.ctx.createMediaStreamDestination(); G.master.connect(dst);
  const an = G.ctx.createAnalyser(); an.fftSize = 2048; G.master.connect(an);
  const rec = new MediaRecorder(dst.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 }), parts = [];
  rec.ondataavailable = e => parts.push(e.data);
  const buf = new Float32Array(2048); let sum = 0, n = 0, peak = 0;
  rec.start(500);
  const t0 = performance.now();
  while (performance.now() - t0 < sec * 1000) {
    await wait(50); an.getFloatTimeDomainData(buf);
    for (const v of buf) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); }
  }
  rec.stop(); await wait(600); G.master.disconnect(dst); G.master.disconnect(an);
  const blob = new Blob(parts, { type: 'audio/webm' }), ab = await blob.arrayBuffer();
  let s = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  const db = v => (20 * Math.log10(Math.max(1e-9, v))).toFixed(1);
  return { b64: btoa(s), rms: db(Math.sqrt(sum / Math.max(1, n))), peak: db(peak), mood: IC.sfx.moodNow(), ctx: G.ctx.state };
};
`;

(async () => {
  const opt = { args: ['--autoplay-policy=no-user-gesture-required'] };
  if (process.env.HTTPS_PROXY) opt.proxy = { server: process.env.HTTPS_PROXY };
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 60000 });
  await page.evaluate(SETUP);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const k of which) {
    const r = await page.evaluate(`__rec('${k}', ${sec})`);
    const out = path.resolve(__dirname, `../shots/score-${k}.webm`);
    fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
    const m = r.mood;
    console.log(`${k}: RMS ${r.rms} dB, peak ${r.peak} dB, mood calm ${m.calm.toFixed(2)} tension ${m.tension.toFixed(2)} battle ${m.battle.toFixed(2)} at ${Math.round(m.bpm)} bpm (${r.ctx})  ${path.relative(process.cwd(), out)}`);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
