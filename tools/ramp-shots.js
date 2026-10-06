/* Close-ups of where taxiways meet ramps (the owner's taxiway-to-ramp list, brief 45): every apron opening on the
   Career capital (with a de-icing pad, a fuel stand and a holding bay built by the builder's tools) or the 'kden'
   layout, and its stands' lead-in lines, with the interface hidden.
     node tools/ramp-shots.js <tag> [cap|kden] [--z=160] [--max=6]
   Saves shots/ramp-<tag>-<airport>-<n>.png. Needs Playwright (npm i --no-save playwright). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright'); process.exit(2); }
const args = process.argv.slice(2);
const tag = (args[0] || 'now').replace(/[^\w-]/g, ''), which = args[1] && !args[1].startsWith('--') ? args[1] : 'cap';
const Z = +((args.find(a => a.startsWith('--z=')) || '--z=160').slice(4)), MAX = +((args.find(a => a.startsWith('--max=')) || '--max=6').slice(6));
(async () => {
  const opt = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
  let browser;
  try { browser = await chromium.launch(opt); } catch (e) { browser = await chromium.launch(Object.assign({ executablePath: '/opt/pw-browsers/chromium' }, opt)); }
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
  const spots = await page.evaluate(async ([key, max]) => {
    const S = IC.newGame({ seed: 12345, mode: 'story', preset: 'network', hour: 11 });
    IC.adopt(S); const st = document.getElementById('start'); if (st) st.hidden = true;
    IC.ui.hintsOn = false; if (IC.hint) for (const k of ['career1', 'war1']) IC.hint.skipTour(k);
    IC.ui.cineShown = 1e9;
    const s = document.createElement('style'); s.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(s);
    const ap = S.byId[S.story.cap];
    if (key === 'kden') IC.aptRelayout(S, ap, 'kden', 0);
    S.paused = true; S.weather.hold = true; S.budget = 1e5;
    const use = (tool, at) => { const m = IC.bldMode(S, ap, tool); const plan = IC.bldPlanOf(S, m, at, 0.5); if (plan.specs && plan.specs.length && plan.ok) IC.bldPlanSpecs(S, ap, plan.specs); return plan.ok; };
    const rw = ap.parts.find(p => p.kind === 'runway');
    use('hold', IC.rwAt(rw, 0.97));
    // a de-icing pad and a fuel stand beside taxiways
    const tx = ap.parts.filter(p => p.kind === "taxi" && p.built && !p.lane).sort((p, q) => IC.U.dist(ap.nodes[q.nodes[0]], rw.a) - IC.U.dist(ap.nodes[p.nodes[0]], rw.a));
    for (const kind of ['deice', 'fuelpad']) for (const t of tx) {
      const a = ap.nodes[t.nodes[0]], b = ap.nodes[t.nodes[t.nodes.length - 1]], L = IC.U.dist(a, b); if (L < 2) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      if (use(kind, { x: m.x + n.x * 0.7, y: m.y + n.y * 0.7 }) || use(kind, { x: m.x - n.x * 0.7, y: m.y - n.y * 0.7 })) break;
    }
    for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); }
    ap.dirty = true; IC.aptGraph(ap);
    for (let i = 0; i < 40; i++) IC.step(S, 0.25);
    const out = [];
    const far = q => out.every(o => IC.U.dist(o, q) > 3);
    for (const m of IC.paveMouths(ap)) { const q = { x: m.N.x + m.n.x * 0.5, y: m.N.y + m.n.y * 0.5 }; if (far(q)) out.push(q); }
    for (const p of ap.parts) if (p.built && (p.kind === 'deice' || p.kind === 'fuelpad' || p.kind === 'holdbay')) out.push({ x: p.x, y: p.y, k: p.kind });
    return out.slice(0, max + 3);
  }, [which, MAX]);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  let i = 0;
  for (const q of spots) {
    await page.evaluate(([x, y, z]) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }, [q.x, q.y, Z]);
    await page.waitForTimeout(1500);
    const file = path.resolve(__dirname, `../shots/ramp-${tag}-${which}-${q.k || i++}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
