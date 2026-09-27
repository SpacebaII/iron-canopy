/* Combat scenes for looking at missiles, explosions and symbols, and for timing frames with a big raid on screen.
   Needs Playwright (see tools/shot.js). Usage:
     node tools/combat-shots.js [scene ...] [--game=path/to/index.html]
   Scenes: symbols, arsenal, threats, sam-day-near, sam-day-far, sam-night-near, sam-night-far, bmd, raid, perf.
   Frames go to shots/<scene>-<n>.png. `perf` prints render and frame times; run it on two checkouts to compare. */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

// shared page helpers: a sandbox war around the capital with our batteries and a raid we choose
const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
// the map alone: goals, message feed and alert banners out of the way
const clean = () => { IC.ui.arMin = true; const st = document.createElement('style'); st.textContent = '#brief,#feed,#incidents,#alerts{display:none!important}'; document.head.appendChild(st); };
const quiet = () => { IC.ui.cineShown = 1e9; const c = document.getElementById('cine'); if (c) c.hidden = true; const m = document.getElementById('comms'); if (m) m.style.display = 'none'; };
// the same world and the same dice every run, so frames and timings compare
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
async function war(hour) {
  IC.S.seed = 4242; Math.random = seeded(7);
  IC.begin('sandbox'); await wait(2600);
  const S = IC.S; S.paused = true; quiet();
  for (const k of ['a_lrsam', 'a_pac3', 'a_hatd', 's_bmd', 'a_cram', 'a_laser', 'a_hpm', 's_esm', 's_cbr', 's_aero', 'e_decoy', 'x_glcm', 'x_tbm', 'a_exo']) S.tech.done.add(k);
  if (hour != null) S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
  S.enemy.war = true; S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
  // only the threats a scene sends: the enemy commander and the rest of the war sit this one out
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
  return S;
}
function unit(S, type, x, y) { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; }
function hostile(S, type, x, y, to, o) { const t = IC.spawnThreat(S, type, x, y, Object.assign({ route: [{ x: to.x, y: to.y }], aim: { x: to.x, y: to.y }, target: to, fromHostile: true }, o || {})); return t; }
function steps(S, sec, until) { for (let i = 0; i < sec * 4; i++) { IC.step(S, 0.25); if (until && until(S)) return true; } return false; }
function look(x, y, z) { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); }
`;

const SYMBOLS = `
    const S = await war(11); const c = IC.cap(S);
    S.units.length = 0; S.threats = S.threats.filter(t => t.d.civil);
    const types = Object.keys(IC.UNITS), cols = 7, gx = 70, gy = 62, x0 = c.x - 240, y0 = c.y - 150;
    types.forEach((k, i) => { const u = unit(S, k, x0 + (i % cols) * gx, y0 + Math.floor(i / cols) * gy); if (i % 5 === 1 && u.emitter) { u.emcon = 'off'; u.radarOn = false; } if (i % 6 === 2) u.hp = u.max * 0.3; if (i % 7 === 4 && u.mags.length) for (const m of u.mags) { m.mag = 0; m.store = 4; m.rl = m.reload * 0.6; } });
    const thr = Object.keys(IC.THR).filter(k => !IC.THR[k].civil && k !== 'pen');
    thr.forEach((k, i) => { const t = hostile(S, k, x0 + (i % 10) * 52, y0 + 330 + Math.floor(i / 10) * 60, { x: x0 + 2000, y: y0 + 330 }); t.det = true; t.aff = 'H'; t.px = t.x; t.py = t.y; t.pt = S.time; t.altKnown = true; t.tn = 2000 + i; t.vx = 1; t.vy = 0; t.pvx = 1; t.pvy = 0; });
    S.layers.rings = false; look(x0 + 190, y0 + 230, 1.05); IC.select && IC.select(null);`;
const SCENES = {
  // every unit type in a grid, in each state, and every threat type
  symbols: { frames: [0], setup: SYMBOLS },
  // every symbol large, with its name and states, as a sheet over the map
  sheet: { frames: [0], setup: `
    const S = await war(11);
    const cv = document.createElement('canvas'); cv.width = 1440; cv.height = 900; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#0b1620';
    document.body.appendChild(cv); const g = cv.getContext('2d');
    g.font = '600 13px IBM Plex Mono, monospace'; g.textAlign = 'center';
    const types = Object.keys(IC.UNITS); const cols = 7, W = 200, H = 104;
    types.forEach((k, i) => { const d = IC.UNITS[k], x = 110 + (i % cols) * W, y = 50 + Math.floor(i / cols) * H;
      IC.drawUnitSymbol(g, k, x - 26, y, 2.2, IC.C.friend, { radar: (d.sensor && !d.sensor.passive) || (d.fc && !d.fc.passive) || d.emits ? 'on' : null, now: 0.3 });
      IC.drawUnitSymbol(g, k, x + 36, y, 1.05, IC.C.friend, { radar: (d.sensor && !d.sensor.passive) || (d.fc && !d.fc.passive) || d.emits ? 'silent' : null, dash: (d.sensor && !d.sensor.passive) || (d.fc && !d.fc.passive) || d.emits, reload: d.mags ? 0.6 : null, damaged: i % 3 === 0 });
      g.fillStyle = '#e4edf2'; g.fillText(d.name, x, y + 42); g.fillStyle = '#9ab0bf'; g.font = '500 11px IBM Plex Mono, monospace'; g.fillText(d.role, x, y + 57); g.font = '600 13px IBM Plex Mono, monospace'; });
    const thr = Object.keys(IC.THR).filter(k => k !== 'pen' && !IC.THR[k].civil);
    thr.forEach((k, i) => { const d = IC.THR[k], x = 70 + (i % 11) * 128, y = 480 + Math.floor(i / 11) * 105;
      IC.drawThreatSymbol(g, k, x, y + 8, 2.4); g.fillStyle = '#ffb0a6'; g.fillText(d.nick + ' ' + d.code, x, y + 42); g.fillStyle = '#9ab0bf'; g.font = '500 10px IBM Plex Mono, monospace'; g.fillText(d.name.length > 20 ? d.name.slice(0, 19) + '…' : d.name, x, y + 56); g.font = '600 13px IBM Plex Mono, monospace'; });
    const roles = Object.entries(IC.ROLE_NAME); g.textAlign = 'left';
    roles.forEach(([r, n], i) => { const x = 40 + (i % 4) * 350, y = 700 + Math.floor(i / 4) * 34; g.strokeStyle = 'rgba(92,200,255,0.8)'; g.lineWidth = 1.5; g.setLineDash(IC.ringDash({ symRole: r }, 1)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70, y); g.stroke(); g.setLineDash([]); g.fillStyle = '#9ab0bf'; g.fillText(n, x + 80, y + 4); });` },
  // the map symbols at their real size, twice the pixels: units in every state, hostile tracks with what they are
  'map-symbols': { frames: [0], dpr: 2, clip: { x: 380, y: 150, width: 680, height: 560 }, setup: SYMBOLS },
  // the enemy we know about: bases, launch sites and launchers found by reconnaissance
  intel: { frames: [0], dpr: 2, clip: { x: 220, y: 120, width: 1000, height: 640 }, setup: `
    const S = await war(11); clean(); S.layers.intel = true;
    for (const s of S.esites) s.pk = 2;
    const s0 = S.esites.find(s => s.kind === 'bm') || S.esites[0];
    for (const t of S.tels.slice(0, 4)) { t.known = true; t.kx = t.x; t.ky = t.y; t.kt = S.time - 600; }
    look(s0.x, s0.y, 0.16);` },
  arsenal: { frames: [0], setup: `const S = await war(11); IC.ui.cat = 'ad'; IC.ui.refresh(true); const c = IC.cap(S); look(c.x, c.y, 0.5);` },
  threats: { frames: [0], setup: `const S = await war(11); IC.ui.refCat = 'threats'; IC.ui.openRoom('reference'); await wait(300);` },
  units: { frames: [0], setup: `const S = await war(11); IC.ui.refCat = 'units'; IC.ui.openRoom('reference'); await wait(300);` },
  // one battery, a fighter coming at it: flash, booster, trail, intercept
  'sam-day-near': { frames: [0, 120, 300, 600, 1000, 1600, 2400, 3400, 4600], setup: samScene(11, 2.2) },
  'sam-day-far': { frames: [0, 400, 1200, 2400, 3600, 5000], setup: samScene(11, 0.3) },
  'sam-night-near': { frames: [0, 150, 400, 900, 1600, 2600, 3600], setup: samScene(23, 2.2) },
  'sam-night-far': { frames: [0, 500, 1500, 3000, 4500], setup: samScene(23, 0.3) },
  // a ballistic missile on the capital, a long-range battery with BMD rounds and an upper tier
  bmd: { frames: [0, 500, 1200, 2000, 3000, 4200, 5500, 7000], setup: `
    const S = await war(21); const c = IC.cap(S); clean();
    unit(S, 'lrsam', c.x - 60, c.y + 40); unit(S, 'hatd', c.x + 50, c.y + 70); unit(S, 'bmd', c.x + 20, c.y - 90);
    const t = IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900, { x: c.x + 20, y: c.y });
    steps(S, 400, S => S.missiles.some(m => m.target === t));
    look(c.x + 600, c.y - 500, 0.3); S.speed = 1; S.paused = false;` },
  // cruise missiles and a ballistic missile land on an undefended air base: fireballs, smoke, burning fuel cooking off
  impact: { frames: [0, 800, 1500, 2100, 2700, 3400, 4500, 6500], setup: `
    const S = await war(17); const c = IC.cap(S); clean();
    const ab = IC.bases(S).filter(b => b.parts).sort((a, b) => IC.U.dist(a, c) - IC.U.dist(b, c))[0];
    const tank = ab.parts.find(p => p.kind === 'fuel' || p.kind === 'tank') || ab;
    for (let i = 0; i < 5; i++) { const t = hostile(S, 'lacm', ab.x + 120 + i * 12, ab.y - 90 - i * 8, ab); t.aim = { x: ab.x + (i - 2) * 6, y: ab.y + (i % 2) * 5 }; t.route = [t.aim]; t.target = ab; }
    unit(S, 'mr3d', ab.x - 100, ab.y + 80);
    steps(S, 300, S => S.threats.some(t => t.type === 'lacm' && IC.U.dist(t, ab) < 60));
    look(ab.x, ab.y, 1.6); S.speed = 1; S.paused = false;` },
  // a gun vehicle against drones close in: tracer
  guns: { frames: [0, 250, 600, 1200, 2000], setup: `
    const S = await war(19); const c = IC.cap(S); clean();
    const at = { x: c.x + 400, y: c.y - 250 };
    unit(S, 'spaag', at.x, at.y); unit(S, 'cram', at.x + 20, at.y + 25); unit(S, 'mr3d', at.x - 40, at.y - 30);
    for (let i = 0; i < 4; i++) hostile(S, 'owa', at.x + 70 + i * 12, at.y - 40 + i * 10, at);
    steps(S, 600, S => S.fx.tracers.length > 0);
    look(at.x + 25, at.y - 10, 6); S.speed = 1; S.paused = false;` },
  // a dozen missiles in the air: drones and cruise missiles on the capital, three batteries firing salvos
  raid: { frames: [0, 1500, 3000], setup: raidScene(15) },
  perf: { perf: true, setup: raidScene(15) }
};
function samScene(hour, z) {
  // close in: a short-range vehicle and a medium-range battery against jet drones a few km out, the whole flight on screen;
  // far out: a long-range battery against fighters 100 km away
  const near = z > 1;
  return `
    const S = await war(${hour}); const c = IC.cap(S); clean();
    const at = { x: c.x + 500, y: c.y - 300 };
    ${near ? `unit(S, 'shorad', at.x, at.y); unit(S, 'mrsam', at.x - 60, at.y + 40); unit(S, 'mr3d', at.x - 20, at.y - 60);
    for (let i = 0; i < 3; i++) hostile(S, 'jdr', at.x + 260 + i * 25, at.y - 160 + i * 35, c);
    steps(S, 600, S => S.missiles.length > 0);
    look(at.x + 120, at.y - 40, ${z});`
    : `unit(S, 'lrsam', c.x - 150, c.y + 60); unit(S, 'mrsam', c.x + 120, c.y + 90); unit(S, 'lr3d', c.x, c.y - 40);
    for (let i = 0; i < 2; i++) hostile(S, 'ftr', c.x + 1300 + i * 40, c.y - 700 + i * 30, c, { mission: 'sweep' });
    for (let i = 0; i < 3; i++) hostile(S, 'jdr', c.x + 900 + i * 30, c.y - 500 + i * 50, c);
    steps(S, 600, S => S.missiles.length > 0);
    look(c.x + 400, c.y - 250, ${z});`}
    S.speed = 1; S.paused = false;`;
}
function raidScene(hour) {
  return `
    const S = await war(${hour}); const c = IC.cap(S); clean();
    S.ad = S.ad || {}; S.ad.doctrine = 'salvo';
    unit(S, 'lrsam', c.x - 120, c.y + 60); unit(S, 'lrsam', c.x + 60, c.y + 160); unit(S, 'mrsam', c.x + 110, c.y + 80); unit(S, 'mrsam', c.x + 40, c.y - 120); unit(S, 'mrsam', c.x - 100, c.y - 100);
    unit(S, 'shorad', c.x + 160, c.y - 40); unit(S, 'shorad', c.x + 220, c.y - 160); unit(S, 'spaag', c.x + 60, c.y - 60); unit(S, 'lr3d', c.x, c.y - 40); unit(S, 'gf', c.x + 200, c.y - 150);
    for (let i = 0; i < 14; i++) hostile(S, 'jdr', c.x + 520 + (i % 5) * 45, c.y - 420 + Math.floor(i / 5) * 60 + (i % 5) * 20, c);
    for (let i = 0; i < 8; i++) hostile(S, 'lacm', c.x + 450 + i * 30, c.y - 250 + (i % 3) * 40, c);
    for (let i = 0; i < 4; i++) hostile(S, 'ftr', c.x + 1100, c.y - 700 + i * 50, c, { mission: 'sweep' });
    IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900, { x: c.x + 20, y: c.y });
    steps(S, 900, S => S.missiles.length >= 14);
    look(c.x + 250, c.y - 180, 0.55); S.speed = 1; S.paused = false;`;
}

(async () => {
  const args = process.argv.slice(2);
  const gameArg = args.find(a => a.startsWith('--game='));
  const game = gameArg ? path.resolve(gameArg.slice(7)) : path.resolve(__dirname, '../iron-canopy/index.html');
  const names = args.filter(a => !a.startsWith('--'));
  const list = names.length ? names : Object.keys(SCENES).filter(k => k !== 'perf');
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const name of list) {
    const sc = SCENES[name]; if (!sc) { console.log('no scene', name); continue; }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: sc.dpr || 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + game);
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    if (args.includes('--fx-off')) await page.evaluate(() => { if (IC.cfx) IC.cfx.on = false; });
    const noArg = args.find(a => a.startsWith('--no='));
    if (noArg) await page.evaluate(v => { IC.cfx.no = {}; for (const k of v.split(',')) IC.cfx.no[k] = true; }, noArg.slice(5));
    await page.evaluate(`(async () => { ${LIB} ${sc.setup} })()`);
    if (sc.perf) {
      const r = await page.evaluate(`(async () => {
        const S = IC.S, wait = ms => new Promise(r => setTimeout(r, ms));
        const cv = document.getElementById('map'), g2 = cv.getContext('2d');
        const wrap = () => { const dc = IC.drawCombat, df = IC.drawForces, o = { t: 0, n: 0, dc, df }; if (!dc) return o;
          IC.drawCombat = function () { const a = performance.now(); dc.apply(this, arguments); o.t += performance.now() - a; o.n++; };
          IC.drawForces = function () { const a = performance.now(); df.apply(this, arguments); o.t += performance.now() - a; }; return o; };
        const unwrap = o => { if (o.dc) { IC.drawCombat = o.dc; IC.drawForces = o.df; } };
        // the raid running: frame intervals as requestAnimationFrame delivers them (simulation, effects and drawing)
        let w = wrap(), peak = 0; const iv = []; let last = performance.now();
        await new Promise(res => { const f = t => { iv.push(t - last); last = t; peak = Math.max(peak, IC.cfx && IC.cfx.count ? IC.cfx.count() : 0); if (iv.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        unwrap(w); const live = w.n ? w.t / w.n : null;
        iv.sort((a, b) => a - b);
        // then held still: the whole picture drawn again and again; reading a pixel back makes the canvas rasterise
        // now, so the time includes the drawing itself
        S.paused = true;
        const hold = ms => { const t0 = performance.now(); let n = 0; while (performance.now() - t0 < ms) { IC.render(S, performance.now() / 1000); g2.getImageData(0, 0, 1, 1); n++; } return (performance.now() - t0) / n; };
        // the same frozen frame without the new effects (trails, particles, missile heads), for a direct difference
        hold(800);   // map tiles paint on the first frames; let that finish
        let bare = null;
        if (IC.cfx && IC.cfx.count) { const keep = IC.cfx.count(); IC.cfx.no = { trails: 1, low: 1, high: 1, miss: 1 }; bare = hold(1500); IC.cfx.no = null; bare = { ms: bare, parts: keep }; }
        w = wrap(); const render = hold(2500); unwrap(w);
        return { render, bare, combat: w.n ? w.t / w.n : null, live, peak, parts: IC.cfx && IC.cfx.count ? IC.cfx.count() : 0, frameMed: iv[iv.length >> 1], frame95: iv[Math.floor(iv.length * 0.95)], missiles: S.missiles.length, threats: S.threats.filter(t => !t.dead && !t.d.civil).length };
      })()`);
      console.log(`perf: render ${r.render.toFixed(2)} ms${r.combat != null ? ` (combat drawing ${r.combat.toFixed(2)} ms)` : ''}${r.bare ? `, ${r.bare.ms.toFixed(2)} ms without the new effects (${r.bare.parts} particles)` : ''}, frame median ${r.frameMed.toFixed(1)} ms${r.live != null ? ` (combat ${r.live.toFixed(2)} ms, up to ${r.peak} particles, ${r.parts} when timed)` : ''}, 95th ${r.frame95.toFixed(1)} ms, ${r.missiles} interceptors and ${r.threats} threats in the air`);
    } else {
      const t0 = Date.now();
      for (let i = 0; i < sc.frames.length; i++) {
        const at = sc.frames[i], lag = at - (Date.now() - t0);
        if (lag > 0) await page.waitForTimeout(lag);
        const out = path.resolve(__dirname, `../shots/${name}${sc.frames.length > 1 ? '-' + i : ''}.png`);
        await page.screenshot({ path: out, clip: sc.clip });
      }
      console.log('saved', name, sc.frames.length, 'frame(s)');
    }
    if (errors.length) console.log('page errors in ' + name + ':\n  ' + errors.join('\n  '));
    await page.close();
  }
  await browser.close();
})();
