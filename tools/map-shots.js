/* The map from the whole country down to the gate, for the visual fidelity pass (brief 67): a Quick war on seed 4242,
   interface hidden, the same views by day, dusk, night and in weather.
     node tools/map-shots.js <tag> [scene ...] [--root=path/to/checkout] [--jpg]
   Saves shots/map-<tag>-<scene>.png (or .jpg) and prints each view's median frame time. Run with --root= on an older
   checkout for "before". Needs Playwright (npm i --no-save playwright three@0.160.0). */
const path = require('path');
const fs = require('fs');
const { open } = require('./film-lib');

const args = process.argv.slice(2);
const rootArg = args.find(a => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(__dirname, '..');
const plain = args.filter(a => !a.startsWith('--'));
const tag = (plain[0] || 'now').replace(/[^\w-]/g, '');
const jpg = args.includes('--jpg');
// name: [where, zoom, hour, weather]; where is country | region | city | apt | rwy | gate | air
const SCENES = {
  country: ['country', 0.03, 12, 'clear'], region: ['region', 0.3, 12, 'clear'], city: ['city', 3, 12, 'clear'],
  apt8: ['apt', 8, 12, 'clear'], apt25: ['rwy', 25, 12, 'clear'], gate80: ['gate', 80, 12, 'clear'], gate200: ['gate', 200, 12, 'clear'],
  dawn: ['apt', 8, 6.4, 'clear'], dusk: ['apt', 8, 19.6, 'clear'], night: ['apt', 8, 23, 'clear'], 'night-city': ['city', 3, 23, 'clear'],
  'night-region': ['region', 0.3, 23, 'clear'], 'night-gate': ['gate', 80, 23, 'clear'], 'night-rwy': ['rwy', 25, 23, 'clear'],
  rain: ['apt', 8, 14, 'storm'], fog: ['apt', 8, 8, 'fog'], snow: ['apt', 8, 11, 'snow'], air: ['air', 6, 12, 'clear'],
  coast: ['coast', 1.2, 12, 'clear'], 'night-coast': ['coast', 1.2, 23, 'clear']
};
const which = plain.slice(1).length ? plain.slice(1) : Object.keys(SCENES);

(async () => {
  const cam = await open({ w: 1440, h: 900, root });
  await cam.ev(async () => {
    IC.S.seed = 4242; Math.random = seeded(7);
    await IC.begin('quick');
    const S = IC.S; quiet();
    const st = document.createElement('style'); st.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(st);
    S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {};
    IC.enemyTick = () => {}; S.layers.coverage = false;
    steps(S, 900);                                        // a quarter hour: airliners taxiing, flying, landing
    S.paused = true;
  });
  fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
  for (const k of which) {
    const sc = SCENES[k]; if (!sc) { console.log('no scene', k); continue; }
    await cam.ev(async ([where, z, hour, kind]) => {
      const S = IC.S;
      S.time = Math.floor(S.time / 86400) * 86400 + hour * 3600;
      if (S.weather) { S.weather.prev = kind; S.weather.kind = kind; S.weather.fade = 1; S.weather.hold = true; }
      const c = IC.cap(S);
      const A = (S.infra || []).filter(b => b.parts && b.parts.some(p => p.kind === 'runway' && p.built));
      A.sort((a, b) => ((b.kind === 'airport') - (a.kind === 'airport')) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
      const ap = A[0];
      let at = { x: c.x, y: c.y };
      if (where === 'country') at = { x: IC.WW / 2, y: IC.WH / 2 };
      if (where === 'apt' || where === 'region') at = ap;
      if (where === 'rwy' && ap) { const r = ap.parts.find(p => p.kind === 'runway' && p.built); at = IC.rwAt(r, 0.25); }
      if (where === 'gate' && ap) { let g = null; for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) if (!g || (s.occ && !g.occ)) g = s; if (g) at = g; }
      if (where === 'air') { const f = S.av.tails.filter(t => t.alt > 2 && t.x != null).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; if (f) at = f; }
      if (where === 'coast') { const L = S.world.lakes.slice().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)); if (L[0]) at = { x: L[0].x + L[0].rx * 0.8, y: L[0].y }; }
      const st0 = document.getElementById('start'); if (st0) st0.hidden = true; for (const e of document.querySelectorAll('.at-start')) e.classList.remove('at-start');
      look(at.x, at.y, z);
    }, sc);
    // on the held clock (film-lib): every tile is painted in the first frame, the page draws only when asked
    await cam.ev(() => { IC.film.hold(true); IC.film.tick(16); IC.film.tick(16); });
    const t0 = Date.now(); await cam.ev(() => IC.film.tick(16)); const ms = Date.now() - t0;
    const out = path.resolve(__dirname, `../shots/map-${tag}-${k}.${jpg ? 'jpg' : 'png'}`);
    await cam.shot(out);
    console.log(`${k}: frame ${ms} ms (with page overhead)  ${path.relative(process.cwd(), out)}`);
  }
  if (cam.errors.length) console.log('page errors:\n  ' + cam.errors.join('\n  '));
  await cam.close();
})();
