/* Pictures of the real airports (brief 39): each showcase airport at the whole-airport zoom beside a plain diagram
   drawn from the same layout data, and close-ups of the places a pilot would look at first (a concourse's gates, a
   runway end with its holding bays, the terminal kerb, the Concourse A bridge, World Way's two levels, the Theme
   Building, the tent roof), by day or by night, with the interface hidden.
     node tools/real-shots.js [kden|klax|all] [--night] [--out=docs/tasks/39-screens] [--only=airport,diagram,...]
   Saves <out>/<key>-<what>.jpg and prints the frame time at each. Needs Playwright (npm i --no-save playwright). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const args = process.argv.slice(2);
const which = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const night = args.includes('--night');
const outDir = path.resolve(__dirname, '..', (args.find(a => a.startsWith('--out=')) || '--out=shots').slice(6));
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const W = 1440, H = 900;

/* runs in the page: the showcase game for a key, an hour of traffic, and the places worth a picture */
const SETUP = `
window.__real = async function (key, hour) {
  const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', showcase: key, hour });
  IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
  IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
  IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true;
  S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  if (!document.getElementById('aptCss')) { const s = document.createElement('style'); s.id = 'aptCss';
    s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock,#toasts,#alerts{display:none!important}'; document.head.appendChild(s); }
  const ap = S.byId[S.story.cap];
  S.weather.hold = true; S.wind.kt = 6;
  for (let i = 0; i < 4 * 3600; i++) IC.step(S, 0.25);
  S.paused = true;
  const L = IC.REAL_APT[key], X = IC.layoutXf({ x: ap.x, y: ap.y, rot: 0 });
  const bld = re => ap.parts.find(p => (p.poly || p.r) && re.test(p.name || ''));
  const mid = p => p ? { x: p.x, y: p.y } : null;
  const stands = IC.aptStands(ap);
  const gateAt = re => { const t = bld(re); if (!t) return null; const g = stands.filter(s => s.contact && s.occ).concat(stands.filter(s => s.contact)).find(s => IC.partDist(ap, t, { x: s.ox, y: s.oy }) < 1); return g ? { x: g.x, y: g.y } : mid(t); };
  const rwEnd = name => { const r = ap.parts.find(p => p.kind === 'runway' && (p.ends.a === name || p.ends.b === name)); if (!r) return null; const e = r.ends.a === name ? r.a : r.b, o = r.ends.a === name ? r.b : r.a, d = IC.U.dist(e, o) || 1; return { x: e + 0 ? e.x + (o.x - e.x) / d * 2.5 : 0, y: e.y + (o.y - e.y) / d * 2.5 }; };
  // (the longest piece of the road on its upper level: World Way's departures deck round the terminals)
  const road = re => { const R = ap.land.roads.filter(q => re.test(q.name || '')), up = R.filter(q => (q.lv || 0) === 1), r = (up.length ? up : R).sort((a, b) => b.pts.length - a.pts.length)[0]; return r ? r.pts[r.pts.length >> 1] : null; };
  const kerb = () => { const r = ap.land.roads.filter(q => q.kerb); return r.length ? r[r.length >> 1].pts[r[r.length >> 1].pts.length >> 1] : null; };
  const span = ap.parts.find(p => p.kind === 'skybridge' && /A Gates/i.test(p.name || '')) || ap.parts.find(p => p.kind === 'skybridge');
  const places = key === 'kden' ? {
    gates: [gateAt(/Concourse B/), 160], runwayend: [rwEnd('16R'), 45], kerb: [kerb(), 120], bridge: [mid(span), 160], tent: [mid(bld(/Jeppesen/)), 60], concourses: [mid(bld(/Concourse B/)), 14]
  } : {
    gates: [gateAt(/Tom Bradley/), 160], runwayend: [rwEnd('25L'), 45], kerb: [kerb(), 120], worldway: [road(/^World Way$/), 120], theme: [mid(bld(/Theme Building/)), 200], cta: [mid(bld(/Tom Bradley/)), 14]
  };
  // the airfield's box: runways, aprons and terminals (the roads out to the motorway are not the picture)
  let bb = [1e9, 1e9, -1e9, -1e9];
  const see = q => { bb = [Math.min(bb[0], q.x), Math.min(bb[1], q.y), Math.max(bb[2], q.x), Math.max(bb[3], q.y)]; };
  for (const p of ap.parts) { if (p.kind === 'runway') { see(p.a); see(p.b); } else if ((p.kind === 'apron' || p.kind === 'terminal') && p.pts) p.pts.forEach(see); }
  const r = Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 3;
  return { ap: { x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2, r, w: bb[2] - bb[0] + 6, h: bb[3] - bb[1] + 6 }, places, name: ap.name };
};
window.__cam = function (x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
window.__frames = async function (n) {
  const t = []; let last = performance.now();
  for (let i = 0; i < n; i++) { await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); t.push(now - last); last = now; }
  t.sort((a, b) => a - b); return { med: t[t.length >> 1], p90: t[Math.floor(t.length * 0.9)] };
};
/* the layout as a plain diagram in the current camera: pavement grey, buildings dark, roads thin, the fence dashed */
window.__diagram = function (key, on) {
  let cv = document.getElementById('diagram');
  if (!on) { if (cv) cv.remove(); return; }
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'diagram'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99'; document.body.appendChild(cv); }
  cv.width = innerWidth; cv.height = innerHeight;
  const g = cv.getContext('2d'), S = IC.S, ap = S.byId[S.story.cap], L = IC.REAL_APT[key], X = IC.layoutXf({ x: ap.x, y: ap.y, rot: 0 }), z = IC.cam.z;
  const P = (x, y) => { const w = X(x, y); return IC.toScreen(w.x, w.y); };
  const poly = (F, fill, stroke) => { g.beginPath(); for (let i = 0; i + 1 < F.length; i += 2) { const q = P(F[i], F[i + 1]); g[i ? 'lineTo' : 'moveTo'](q.x, q.y); } g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };
  const line = (pts, w, col, dash) => { g.beginPath(); pts.forEach((q, i) => { const s = P(q[0], q[1]); g[i ? 'lineTo' : 'moveTo'](s.x, s.y); }); g.strokeStyle = col; g.lineWidth = Math.max(1, w * z); g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
  const pairs = F => { const o = []; for (let i = 0; i + 1 < F.length; i += 2) o.push([F[i], F[i + 1]]); return o; };
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  for (const A of L.aprons) poly(A.poly, '#d9d9d6');
  for (const t of L.taxi) line(t.n.map(i => L.nodes[i]), t.w || 0.23, '#b9b9b6');
  for (const r of L.runways) line([r.a, r.b], r.w, '#8d8d8a');
  for (const R of L.roads) line(pairs(R.pts), R.w || 0.1, R.lv > 0 ? '#c46' : R.lv < 0 ? '#9ab' : '#666', R.lv < 0 ? [6, 4] : null);
  for (const R of L.service || []) line(pairs(R.pts), 0.06, '#ccc');
  for (const K of L.parks) poly(K.poly, K.kind === 'garage' ? '#c8c8c8' : '#ececea', '#bbb');
  for (const B of L.blds) { if (B.poly) poly(B.poly, B.kind === 'terminal' ? '#334' : B.kind === 'cargo' ? '#557' : B.kind === 'hangar' ? '#575' : '#777'); else if (B.c) { const q = P(B.c[0], B.c[1]); g.beginPath(); g.arc(q.x, q.y, B.r * z, 0, 6.2832); g.fillStyle = '#c96'; g.fill(); } }
  for (const B of L.bridges) poly(B.poly, 'rgba(60,60,200,0.7)');
  for (const M of L.movers) line(pairs(M.pts), 0.05, '#d33', [8, 6]);
  for (const s of L.stands) { const q = P(s.x, s.y), d = { l: 0.4, m: 0.25, s: 0.18 }[s.size] * z; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + Math.cos(s.h) * d, q.y + Math.sin(s.h) * d); g.strokeStyle = s.gate ? '#e80' : '#4a4'; g.lineWidth = 1; g.stroke(); }
  g.fillStyle = '#000'; g.font = '14px sans-serif'; g.fillText(L.name + ' (' + L.after + '): the layout data as a diagram, same scale and view. Grey: pavement; dark: terminals; red: departures road; blue dashes: tunnel; red dashes: people mover; orange: gates; green: other stands.', 12, cv.height - 12);
};
`;

(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  await page.evaluate(SETUP);
  fs.mkdirSync(outDir, { recursive: true });
  const keys = which === 'all' ? await page.evaluate('Object.keys(IC.REAL_APT).filter(k => IC.REAL_APT[k].icao)') : [which];
  for (const key of keys) {
    const L = await page.evaluate(`__real('${key}', ${night ? 22 : 11})`);
    const zA = Math.min(W / L.ap.w, H / L.ap.h);
    const shots = [['airport', L.ap.x, L.ap.y, zA], ['diagram', L.ap.x, L.ap.y, zA]];
    for (const [what, [p, z]] of Object.entries(L.places)) if (p) shots.push([what, p.x, p.y, z]);
    for (const [what, x, y, z] of shots) {
      if (only.length && !only.includes(what)) continue;
      await page.evaluate(`__cam(${x}, ${y}, ${z})`);
      await page.waitForTimeout(what === 'airport' || what === 'diagram' ? 4000 : 1800);
      const f = what === 'diagram' ? null : await page.evaluate('__frames(60)');
      if (what === 'diagram') await page.evaluate(`__diagram('${key}', true)`);
      const file = path.resolve(outDir, `${key}-${what}${night ? '-night' : ''}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
      if (what === 'diagram') await page.evaluate(`__diagram('${key}', false)`);
      console.log(`${path.relative(process.cwd(), file)}${f ? `  frame ${f.med.toFixed(1)} ms (p90 ${f.p90.toFixed(1)})` : ''}`);
    }
  }
  if (errors.length) { console.log('page errors:'); for (const e of errors) console.log('  ' + e); }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
