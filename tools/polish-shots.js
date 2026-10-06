/* Before-and-after pictures for brief 45: a runway entry, a rapid exit, a holding bay, a gate, and a round terminal,
   on the Career capital with its exits and a holding bay built by the builder's own tools. Runs on any checkout that
   has the builder (run it on the old one for "before").
     node tools/polish-shots.js <tag> [--z=110]
   Saves shots/polish-<tag>-<spot>.png. Needs Playwright (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright three@0.160.0'); process.exit(2); }
const args = process.argv.slice(2), tag = (args[0] || 'now').replace(/[^\w-]/g, '');
const root = (args.find(a => a.startsWith('--root=')) || '').slice(7) || path.resolve(__dirname, '..');
(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(root, 'iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const spots = await page.evaluate(async () => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    IC.ui.cineShown = 1e9;
    const s = document.createElement('style'); s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s);
    S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {}; S.weather.hold = true; S.wind.kt = 6;
    const ap = S.byId[S.story.cap]; S.budget = 1e5;
    const rw = ap.parts.find(p => p.kind === 'runway');
    // the builder's own tools: rapid exits on the runway, a holding bay at its south end
    const use = (tool, at) => { const m = IC.bldMode(S, ap, tool); const plan = IC.bldPlanOf(S, m, at, 0.5); if (plan.specs.length && plan.ok) IC.bldPlanSpecs(S, ap, plan.specs); return plan; };
    use('exits', IC.rwAt(rw, 0.5));
    const endB = IC.rwAt(rw, 0.97); use('hold', endB);
    for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
    ap.dirty = true;
    for (let i = 0; i < 2400; i++) IC.step(S, 0.25);
    S.paused = true;
    // the spots: a right-angle entry mid-runway, a rapid exit, the holding bay, a gate with an aircraft on it
    const d = IC.rwDir(rw), L = IC.rwLen(rw), out = {};
    for (const p of ap.parts) if (p.kind === 'taxi' && p.built) for (let i = 0; i < p.nodes.length; i++) {
      const n = ap.nodes[p.nodes[i]]; if (!n || !n.on || n.on.kind !== 'rwy') continue;
      const o = ap.nodes[p.nodes[i ? i - 1 : 1]]; if (!o) continue;
      const c = Math.abs(((o.x - n.x) * d.x + (o.y - n.y) * d.y) / (IC.U.dist(o, n) || 1)), t = IC.rwT(rw, n) * L;
      if (t < 2 || t > L - 2) continue;
      if (c < 0.2 && !out.entry) out.entry = { x: n.x, y: n.y };
      if (c > 0.6 && c < 0.97 && !out.rapid) out.rapid = { x: n.x + (o.x - n.x) * 0.3, y: n.y + (o.y - n.y) * 0.3 };
    }
    out.hold = { x: endB.x - d.y * 0.9 * 0 + (ap.parts.some(p => p.kind === 'holdbay') ? 0 : 0), y: endB.y };
    const bay = ap.parts.find(p => p.kind === 'holdbay'); if (bay) out.hold = { x: bay.x, y: bay.y };
    else { const n = Object.values(ap.nodes).filter(q => q.on && q.on.kind === 'rwy' && IC.rwT(rw, q) > 0.85).sort((a, b) => IC.rwT(rw, b) - IC.rwT(rw, a))[1]; if (n) out.hold = { x: n.x, y: n.y }; }
    let gate = null; for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s2 of p.stands || []) if (s2.contact && s2.occ && (!gate || s2.y < gate.y)) gate = s2;
    if (gate) out.gate = { x: gate.x, y: gate.y, z: 190 };
    return out;
  });
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const [k, q] of Object.entries(spots)) {
    await page.evaluate(([x, y, z]) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }, [q.x, q.y, q.z || +(process.env.PZ || 0) || (k === "hold" ? 95 : 130)]);
    await page.waitForTimeout(1800);
    const file = path.resolve(__dirname, `../shots/polish-${tag}-${k}.png`);
    await page.screenshot({ path: file });
    console.log(k, path.relative(process.cwd(), file));
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
