/* The mountains in the 3D view (terrain pass): the live view on the highest ground in our country, looked at from a few
   distances, Quick war on seed 4242 at mid-morning.
     node tools/terrain3d-shots.js <tag> [--root=path/to/checkout]
   Saves shots/ter3d-<tag>-<view>.png. Needs Playwright and three.js on disk (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
const { open } = require('./film-lib');

const args = process.argv.slice(2);
const rootArg = args.find(a => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(__dirname, '..');
const tag = (args.filter(a => !a.startsWith('--'))[0] || 'now').replace(/[^\w-]/g, '');
// name: [yaw, pitch, distance in world units, offset of the centre from the peak towards our side]
const VIEWS = { wide: [-0.6, 0.32, 900, 250], range: [-0.9, 0.22, 380, 120], close: [-1.2, 0.18, 140, 40] };

(async () => {
  const cam = await open({ w: 1440, h: 900, root });
  const info = await cam.ev(async () => {
    IC.S.seed = 4242; Math.random = seeded(7);
    try { localStorage.setItem('ic-3d', 'medium'); } catch (e) { /* file page */ }
    await IC.begin('quick');
    const S = IC.S; quiet(); S.paused = true;
    S.time = Math.floor(S.time / 86400) * 86400 + 10 * 3600;
    if (S.weather) { S.weather.prev = 'clear'; S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
    steps(S, 20);
    const W = S.world; let best = null;
    for (let y = 400; y < IC.WH - 400; y += 80) for (let x = 400; x < IC.WW - 400; x += 80) {
      if (!W.inHome(x, y)) continue;
      const h = W.hAt(x, y); if (!best || h > best.h) best = { x, y, h };
    }
    // towards the middle of the country from the peak: the views look at the range from our side
    const dx = W.cx - best.x, dy = W.cy - best.y, L0 = Math.hypot(dx, dy);
    window.PK = { x: best.x, y: best.y, ux: dx / L0, uy: dy / L0 };
    const L = IC.liveOpen(S, { x: best.x, y: best.y, name: 'here' });
    for (let i = 0; i < 200 && !(L.renderer && L.tiles && L.tiles.size > 8); i++) await wait(100);
    const f = L.el.querySelector('[data-rp=full]'); if (f) f.click();
    const s = L.el.querySelector('[data-rp=cam]'); if (s) { s.value = 'orbit'; s.dispatchEvent(new Event('change', { bubbles: true })); }
    L.follow = null; await wait(1500);
    window.LV = L;
    return `peak ${JSON.stringify(best)}`;
  });
  console.log(info);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const [k, v] of Object.entries(VIEWS)) {
    await cam.ev(async ([yaw, pitch, dist, off]) => {
      const L = LV, x = PK.x + PK.ux * off, y = PK.y + PK.uy * off;
      // the camera's yaw is measured so the view looks from our side towards the peak
      const base = Math.atan2(PK.uy, PK.ux);
      Object.assign(L.orbit, { tx: x - L.cx, tz: y - L.cy, ty: IC.R3D.hT(L, x, y) * L.hk, yaw: base + yaw, pitch, dist });
      L.snap = true;
      await wait(6000);
    }, v);
    const out = path.resolve(__dirname, `../shots/ter3d-${tag}-${k}.png`);
    await cam.shot(out);
    console.log(`${k}: ${path.relative(process.cwd(), out)}`);
  }
  if (cam.errors.length) console.log('page errors:\n  ' + cam.errors.join('\n  '));
  await cam.close();
})();
