/* Pictures of roads where they meet (brief 46), with the interface hidden, for before-and-after comparisons:
   a village T junction, a town crossroads, a roundabout, a motorway interchange (diamond and cloverleaf), a city grid
   close in, an airport's landside loop, and the whole capital at the regional zoom.
     node tools/road-shots.js <tag> [scene ...] [--night] [--w=1440] [--h=900] [--z=zoom] [--dpr=2] [--clip=x,y,w,h] [--wait=ms] [--jpg]
   Saves shots/road-<tag>-<scene>.png and prints the frame time of each scene. Needs Playwright
   (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }

const args = process.argv.slice(2);
const tag = (args[0] || 'now').replace(/[^\w-]/g, '');
const only = args.slice(1).filter(a => !a.startsWith('--'));
const night = args.includes('--night');
const W = +((args.find(a => a.startsWith('--w=')) || '--w=1440').slice(4)), H = +((args.find(a => a.startsWith('--h=')) || '--h=900').slice(4));

const SETUP = `
window.__roads = async function (hour) {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour });
  IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  // (the radar cover tint off, so the ground reads as it is)
  S.layers.coverage = false;
  if (!document.getElementById('aptCss')) { const s = document.createElement('style'); s.id = 'aptCss';
    s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s); }
  const W = S.world, U = IC.U, ap = S.byId[S.story.cap];
  // the capital's landside grown in full
  const L = IC.landInit(ap);
  for (let i = 0, n = -1; i < 60 && L.items.length !== n; i++) { n = i < 3 ? -1 : L.items.length; ap.paxRate = 9000; ap.mvLog = Array.from({ length: 8 }, () => ({ type: 'cargo', k: 'arr' })); L.pax = 9000; L.cargo = 400; L.t = 0; IC.landsideTick(S, ap, 1); }
  S.weather.hold = true; S.wind.kt = 6;
  for (let i = 0; i < 1200; i++) IC.step(S, 0.25);
  S.paused = true;
  const cap = W.cities.reduce((a, b) => a.pop > b.pop ? a : b);
  const inTown = (x, y, k) => W.cities.some(c => Math.hypot(c.x - x, c.y - y) < c.r * (k || 1.4));
  const out = {};
  // a village T junction: a main road running through, a local road ending on it, away from the towns
  const tj = W.junctions.filter(j => j.kind === 'tj' && j.dirs.length === 3 && j.dirs.filter(d => d.cls === 'rd').length === 2 && j.dirs.some(d => d.cls !== 'rd') && !inTown(j.x, j.y))
    .sort((a, b) => Math.hypot(a.x - ap.x, a.y - ap.y) - Math.hypot(b.x - ap.x, b.y - ap.y))[0];
  if (tj) out.tjunction = [tj.x, tj.y, 240];
  // a town crossroads: two streets crossing near the middle of a middle-sized town
  const town = W.cities.filter(c => c !== cap && c.streets.length > 20).sort((a, b) => a.pop - b.pop)[Math.floor(W.cities.length / 3)] || cap;
  let best = null, bd = 1e9;
  const segs = town.streets.flatMap(l => l.pts.slice(1).map((p, i) => [l.pts[i], p, l]));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [a, b, la] = segs[i], [c2, d, lb] = segs[j]; if (la === lb) continue;
    const t = U.segX(a.x, a.y, b.x, b.y, c2.x, c2.y, d.x, d.y); if (t < 0) continue;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, dd = Math.hypot(x - town.x, y - town.y);
    if (dd < bd) { bd = dd; best = [x, y]; }
  }
  if (best) out.crossroads = [best[0], best[1], 110];
  const near = k => W.junctions.filter(j => j.kind === k).sort((a, b) => Math.hypot(a.x - ap.x, a.y - ap.y) - Math.hypot(b.x - ap.x, b.y - ap.y));
  const rb = near('rb').find(j => !inTown(j.x, j.y, 1)); if (rb) out.roundabout = [rb.x, rb.y, 200];
  const mx = near('mx')[0]; if (mx) { out.diamond = [mx.x, mx.y, 40]; out.bridge = [mx.x, mx.y, 150]; }
  const mm = near('mm').find(j => !inTown(j.x, j.y, 0.8)) || near('mm')[0]; if (mm) out.cloverleaf = [mm.x, mm.y, 40];
  out.citygrid = [cap.x, cap.y, 45];
  // where a slip road leaves the motorway, and a level crossing
  const RJ = IC.roadJoins ? IC.roadJoins(W) : { ends: [] }, me = RJ.ends.filter(e => e.kind === 'merge' && e.r.kind === 'slip').sort((a, b) => Math.hypot(a.q.x - ap.x, a.q.y - ap.y) - Math.hypot(b.q.x - ap.x, b.q.y - ap.y))[0];
  if (me) out.merge = [me.q.x, me.q.y, 90];
  const lx = (IC.railCrossings ? IC.railCrossings(W) : []).filter(x => x.level).sort((a, b) => Math.hypot(a.x - ap.x, a.y - ap.y) - Math.hypot(b.x - ap.x, b.y - ap.y))[0];
  if (lx) out.railx = [lx.x, lx.y, 260];
  if (RJ.xings && RJ.xings[0]) out.xing = [RJ.xings[0].x, RJ.xings[0].y, 90];
  const kerb = L.roads.find(r => r.kerb) || L.roads[0];
  if (kerb) { const a = kerb.pts[0], b = kerb.pts[kerb.pts.length - 1]; out.landside = [(a.x + b.x) / 2, (a.y + b.y) / 2, 80]; out.kerb = [a.x + (b.x - a.x) * 0.85, a.y + (b.y - a.y) * 0.85, 230]; }
  out.capital = [cap.x, cap.y, 1.2];
  return out;
};
window.__cam = function (x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
window.__frames = async function (n) {
  const t = []; let last = performance.now();
  for (let i = 0; i < n; i++) { await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); t.push(now - last); last = now; }
  t.sort((a, b) => a - b); return { med: t[t.length >> 1], p90: t[Math.floor(t.length * 0.9)] };
};
`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const dpr = +((args.find(a => a.startsWith('--dpr=')) || '--dpr=1').slice(6));
  const clip = (args.find(a => a.startsWith('--clip=')) || '').slice(7).split(',').map(Number);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(SETUP);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  const P = await page.evaluate(`__roads(${night ? 22 : 11})`);
  // extra places by hand: --at=name:x,y,z;name:x,y,z
  for (const q of ((args.find(a => a.startsWith('--at=')) || '--at=').slice(5)).split(';').filter(Boolean)) { const [k, v] = q.split(':'); P[k] = v.split(',').map(Number); }
  for (const [k, [x, y, z]] of Object.entries(P)) {
    if (only.length && !only.includes(k)) continue;
    const zz = +((args.find(a => a.startsWith('--z=')) || '--z=0').slice(4)) || z;
    await page.evaluate(`__cam(${x}, ${y}, ${zz})`);
    await page.waitForTimeout(+((args.find(a => a.startsWith('--wait=')) || '--wait=1500').slice(7)));
    const f = await page.evaluate('__frames(60)');
    const jpg = args.includes('--jpg'), file = path.resolve(__dirname, `../shots/road-${tag}-${k}.${jpg ? 'jpg' : 'png'}`), o = jpg ? { path: file, type: 'jpeg', quality: 84 } : { path: file };
    await page.screenshot(clip.length === 4 ? Object.assign(o, { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } }) : o);
    console.log(`${k} (${x.toFixed(0)}, ${y.toFixed(0)}) z=${zz}: frame median ${f.med.toFixed(1)} ms, 90% ${f.p90.toFixed(1)} ms  ${path.relative(process.cwd(), file)}`);
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
