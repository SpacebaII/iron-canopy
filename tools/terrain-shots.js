/* The ground and the mountains (brief 71): a Quick war on seed 4242, interface hidden, at noon, framed on the
   highest ground in our country, a hill town, a farm valley and the capital, from the whole country to close in.
     node tools/terrain-shots.js <tag> [scene ...] [--root=path/to/checkout] [--jpg]
   Saves shots/ter-<tag>-<scene>.png (or .jpg). Run with --root= on an older checkout for "before".
   Needs Playwright (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
const { open } = require('./film-lib');

const args = process.argv.slice(2);
const rootArg = args.find(a => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(__dirname, '..');
const plain = args.filter(a => !a.startsWith('--'));
const tag = (plain[0] || 'now').replace(/[^\w-]/g, '');
const jpg = args.includes('--jpg');
// name: [where, zoom, hour]; where is country | peak | slope | hilltown | farm | capital
const SCENES = {
  country: ['country', 0.03, 12], range: ['peak', 0.12, 12], peak: ['peak', 0.4, 12], peak1: ['peak', 1.2, 12],
  peak4: ['peak', 4, 12], slope12: ['slope', 12, 12], hilltown: ['hilltown', 1.5, 12], farm: ['farm', 3, 12],
  farm10: ['farm', 10, 12], capital: ['capital', 0.5, 12], dusk: ['peak', 0.4, 18.6],
  volcano: ['volcano', 0.5, 12], volcano2: ['volcano', 1.6, 12], old: ['old', 0.5, 12],
  plains: ['plains', 2.5, 12], palouse: ['palouse', 2.5, 12], wet: ['wet', 2.5, 12], valley: ['valley', 2.5, 12], south: ['south', 2.5, 12],
  plains8: ['plains', 8, 12], south8: ['south', 8, 12]
};
const which = plain.slice(1).length ? plain.slice(1) : Object.keys(SCENES);

(async () => {
  const cam = await open({ w: 1440, h: 900, root });
  const info = await cam.ev(async () => {
    IC.S.seed = 4242; Math.random = seeded(7);
    await IC.begin('quick');
    const S = IC.S; quiet();
    const st = document.createElement('style'); st.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(st);
    S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
    IC.enemyTick = () => {}; S.layers.coverage = false;
    S.paused = true;
    // the places: the highest point inside our border, a steep slope near it, the hill town and the flattest farm town
    const W = S.world; let best = null, slope = null;
    for (let y = 400; y < IC.WH - 400; y += 80) for (let x = 400; x < IC.WW - 400; x += 80) {
      if (!W.inHome(x, y)) continue;
      const h = W.hAt(x, y); if (!best || h > best.h) best = { x, y, h };
    }
    for (let a = 0; a < 6.28; a += 0.2) for (let r = 30; r < 300; r += 15) {
      const x = best.x + Math.cos(a) * r, y = best.y + Math.sin(a) * r, s = W.slopeAt(x, y);
      if (!slope || s > slope.s) slope = { x, y, s };
    }
    const towns = W.cities.filter(c => W.inHome(c.x, c.y)).map(c => ({ c, h: W.hAt(c.x, c.y), s: W.slopeAt(c.x, c.y) }));
    const hill = towns.slice().sort((a, b) => b.h - a.h)[0].c, flat = towns.slice().sort((a, b) => a.s - b.s)[0].c;
    // a farmed spot in each region (W.biome), the first volcano and the middle of the first old range inside
    const reg = {};
    if (W.biome) for (let k = 0; k < 20000; k++) {
      const x = 400 + ((k * 7919) % 997) / 997 * (IC.WW - 800), y = 400 + ((k * 104729) % 991) / 991 * (IC.WH - 800);
      if (!W.inHome(x, y) || W.farmAt(x, y) < 0.6) continue;
      const b = IC.BIOMES[W.biome(x, y)]; if (!reg[b] || Math.random() < 0.002) reg[b] = { x, y };
    }
    if (W.hFine) W.hFine(0, 0, 1);
    const vol = (W._volcanoes || []).concat(W.ridges || []).find(r => r.style === 'volcano'), old = (W.ridges || []).find(r => r.style === 'old' && W.inHome(r.pts[0][0], r.pts[0][1]));
    const mid = r => r && { x: r.pts[r.pts.length >> 1][0], y: r.pts[r.pts.length >> 1][1] };
    window.PLACES = { ...reg, volcano: mid(vol) || best, old: mid(old) || best, peak: best, slope, hilltown: hill, farm: { x: flat.x + 120, y: flat.y + 90 }, capital: IC.cap(S), country: { x: IC.WW / 2, y: IC.WH / 2 } };
    return `peak ${JSON.stringify(best)} slope ${JSON.stringify(slope)} hill town ${hill.name} farm town ${flat.name}`;
  });
  console.log(info);
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const k of which) {
    const sc = SCENES[k]; if (!sc) { console.log('no scene', k); continue; }
    await cam.ev(([where, z, hour]) => {
      const S = IC.S;
      S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
      if (S.weather) { S.weather.prev = 'clear'; S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
      const st0 = document.getElementById('start'); if (st0) st0.hidden = true; for (const e of document.querySelectorAll('.at-start')) e.classList.remove('at-start');
      const at = PLACES[where]; if (!at) return; look(at.x, at.y, z);
    }, sc);
    await cam.ev(() => { IC.film.hold(true); IC.film.tick(16); IC.film.tick(16); });
    const t0 = Date.now(); await cam.ev(() => IC.film.tick(16)); const ms = Date.now() - t0;
    const out = path.resolve(__dirname, `../shots/ter-${tag}-${k}.${jpg ? 'jpg' : 'png'}`);
    await cam.shot(out);
    console.log(`${k}: frame ${ms} ms  ${path.relative(process.cwd(), out)}`);
  }
  if (cam.errors.length) console.log('page errors:\n  ' + cam.errors.join('\n  '));
  await cam.close();
})();
