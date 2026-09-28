/* Air war frames for the pull request and for looking at: the air picture, an intercept being set up, the
   early-warning aircraft's cover. A sandbox war with a raid of four strike aircraft and two fighters coming over the
   border near the forward air base. Needs Playwright (see tools/shot.js). Usage:
     node tools/air-shots.js [picture] [intercept] [aew]
   Frames go to shots/air-<scene>.png. */
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }
const LIB = `
const wait = ms => new Promise(r => setTimeout(r, ms));
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
IC.S.seed = 4242; Math.random = seeded(7);
IC.begin('sandbox'); await wait(2600);
const S = IC.S; S.paused = true;
IC.ui.cineShown = 1e9; { const c = document.getElementById('cine'); if (c) c.hidden = true; }
S.time = Math.floor(S.time / 86400) * 86400 + 11 * 3600;
S.enemy.allow = new Set(); IC.enemyTick = () => {}; IC.ground = () => {};
S.threats = S.threats.filter(t => t.d.civil); S.cfg.pauseOn = {}; S.cfg.slowmo = false;
const b = S.byId.ab_fwd;
// the nearest hostile ground from the forward base
let dir = null;
for (let R = 500; R < 20000 && !dir; R += 250) for (let q = 0; q < 6.283 && !dir; q += 0.05) if (IC.inHostile(b.x + Math.cos(q) * R, b.y + Math.sin(q) * R)) dir = { x: Math.cos(q), y: Math.sin(q), R };
const at = (d, s) => ({ x: b.x + dir.x * d - dir.y * s, y: b.y + dir.y * d + dir.x * s });
{ const u = IC.makeUnit(S, 'lr3d', b.x + dir.x * 300, b.y + dir.y * 300, { instant: true, full: true }); u.emcon = 'on'; u.radarOn = true; }
{ const st = document.createElement('style'); st.textContent = '#unlock,#comms,#feed{display:none!important}'; document.head.appendChild(st); }
const raid = [];
const st = at(dir.R + 600, 0), to = IC.cap(S);
for (let i = 0; i < 4; i++) raid.push(IC.spawnThreat(S, 'str', st.x + i * 25, st.y + (i % 2) * 25, { route: [{ x: to.x, y: to.y }], aim: to, target: to, mission: 'strike', fromHostile: true, noFire: true }));
const f2 = at(dir.R + 900, 700);
for (let i = 0; i < 2; i++) raid.push(IC.spawnThreat(S, 'ftr', f2.x + i * 30, f2.y, { route: [{ x: to.x, y: to.y }], mission: 'sweep', fromHostile: true, noFire: true }));
for (let i = 0; i < 4 * 150; i++) IC.step(S, 0.25);
for (const t of raid) if (t.held) IC.setAff(S, t, 'H', 'shots');
const look = (x, y, z) => { IC.cam.fly = null; IC.cam.z = z; IC.centerOn(x, y); };
`;
const SCENES = {
  picture: `${LIB} const t = raid[0]; IC.select({ kind: 'track', ref: t }); look((t.x + b.x) / 2 + 150, (t.y + b.y) / 2 + 250, 0.17);`,
  intercept: `${LIB} const w = S.air.filter(a => a.kind === 'ftr' && a.r && !a.dead).sort((p, q) => U.dist(p, raid[0]) - U.dist(q, raid[0]))[0];
    IC.select({ kind: 'air', ref: w }); S.icpt = { who: w, t: raid[0] }; IC.ui.refresh(true); look((raid[0].x + w.x) / 2 + 150, (raid[0].y + w.y) / 2 + 250, 0.17);`,
  aew: `${LIB} const a = S.air.find(x => x.kind === 'aew'); const p = at(dir.R - 500, 0);
    Object.assign(a, { x: p.x, y: p.y, gnd: false, state: 'station', alt: 9 }); a.mission = Object.assign(a.mission || {}, { type: 'orbit', x: p.x, y: p.y });
    for (const t of S.ato) if (t.type === 'aew') { t.x = p.x; t.y = p.y; }
    for (let i = 0; i < 4 * 20; i++) IC.step(S, 0.25);
    IC.select({ kind: 'air', ref: a }); S.layers.coverage = true; IC.ui.refresh(true); look(p.x + 900, p.y + 1300, 0.075);`
};
(async () => {
  const want = process.argv.slice(2);
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); }
  for (const [name, code] of Object.entries(SCENES)) {
    if (want.length && !want.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => console.log(name, 'pageerror', e.message));
    await page.goto('file://' + path.resolve(__dirname, '../iron-canopy/index.html'));
    await page.waitForFunction(() => window.IC && IC.begin && IC.S, null, { timeout: 30000 });
    await page.evaluate(`(async () => { const U = IC.U; ${code} })()`);
    await page.waitForTimeout(1200);
    fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, `../shots/air-${name}.png`) });
    console.log('saved', name);
    await page.close();
  }
  await browser.close();
})();
