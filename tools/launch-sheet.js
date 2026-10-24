/* How each weapon leaves its launcher, frame by frame (brief 67): every launch filmed on the held clock (IC.film.hold,
   IC.film.tick: smooth however slow this machine draws), cropped round the launcher and laid out as a contact sheet.
     node tools/launch-sheet.js [case ...] [--out=shots/launch] [--root=../other-checkout] [--z=4] [--film]
   Cases: shorad, mrsam, lrsam, bmd, gun, ballistic (an enemy launch), cruise, drone. Sheets go to <out>/<case>.jpg:
   24 frames, the first 12 at 30 fps (the first 0.4 s), then every third frame to 2 s. Needs Playwright and ffmpeg. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const args = process.argv.slice(2);
const OUT = path.resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=shots/launch').slice(6));
const rootArg = args.find(a => a.startsWith('--root='));
const Z = +((args.find(a => a.startsWith('--z=')) || '--z=4').slice(4));
const FILM = args.includes('--film');
const names = args.filter(a => !a.startsWith('--'));

// a quiet war round the capital, only what the case puts there
const WAR = `
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('sandbox'); quiet();
  const S = IC.S; S.paused = true;
  for (const k of ['a_lrsam', 'a_pac3', 'a_hatd', 's_bmd', 'a_cram', 'x_glcm', 'x_tbm']) S.tech.done.add(k);
  S.time = Math.floor(S.time / 86400) * 86400 + 14 * 3600;
  S.enemy.war = true; S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {}; S.cfg.shake = false;
  IC.enemyTick = () => {}; IC.ground = () => {}; S.threats = S.threats.filter(t => t.d.civil); S.units = S.units.filter(u => !u.d.weapon);
  const c = IC.cap(S), at = { x: c.x + 500, y: c.y - 300 };
  const unit = (type, x, y) => { const u = IC.makeUnit(S, type, x, y, { instant: true, full: true }); u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } return u; };
  const hostile = (type, x, y, o) => IC.spawnThreat(S, type, x, y, Object.assign({ route: [{ x: c.x, y: c.y }], aim: { x: c.x, y: c.y }, target: c, fromHostile: true }, o || {}));
`;
// each case: set up, run the simulation to the moment before the launch, and say where to look
const SAM = (type, thr, d) => `${WAR}
  const u = unit('${type}', at.x, at.y); unit('mr3d', at.x - 30, at.y + 20);
  for (let i = 0; i < 2; i++) hostile('${thr}', at.x + ${d} + i * 20, at.y - ${d / 2}, {});
  for (let i = 0; i < 4 * 900 && !S.missiles.length; i++) { const keep = S.time; IC.step(S, 0.25); }
  return { x: u.x, y: u.y };`;
const CASES = {
  shorad: SAM('shorad', 'jdr', 120),
  mrsam: SAM('mrsam', 'jdr', 300),
  lrsam: SAM('lrsam', 'ftr', 900),
  bmd: `${WAR}
    const u = unit('hatd', at.x, at.y); unit('lr3d', at.x - 30, at.y + 20);
    IC.launchBallistic(S, 'srbm', c.x + 2600, c.y - 1900, { x: at.x, y: at.y });
    for (let i = 0; i < 4 * 900 && !S.missiles.length; i++) IC.step(S, 0.25);
    return { x: u.x, y: u.y };`,
  gun: `${WAR}
    const u = unit('cram', at.x, at.y); unit('spaag', at.x + 15, at.y + 10); unit('mr3d', at.x - 30, at.y + 20);
    for (let i = 0; i < 3; i++) hostile('owa', at.x + 60 + i * 8, at.y - 30 + i * 6, { route: [{ x: at.x, y: at.y }], aim: { x: at.x, y: at.y } });
    for (let i = 0; i < 4 * 900 && !S.fx.tracers.length && !S.missiles.length; i++) IC.step(S, 0.25);
    return { x: u.x + 30, y: u.y - 15 };`,
  ballistic: `${WAR}
    const p = { x: c.x + 600, y: c.y - 400 };
    IC.launchBallistic(S, 'srbm', p.x, p.y, { x: c.x, y: c.y });
    IC.step(S, 0.05);
    return p;`,
  cruise: `${WAR}
    const p = { x: c.x + 600, y: c.y - 400 };
    hostile('lacm', p.x, p.y, {}); S.threats[S.threats.length - 1].det = true;
    return p;`,
  drone: `${WAR}
    const p = { x: c.x + 600, y: c.y - 400 };
    for (let i = 0; i < 3; i++) hostile('owa', p.x + i * 3, p.y + i * 2, {});
    return p;`
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names.length ? names : Object.keys(CASES)) {
    const dir = path.join(OUT, 'f-' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const cam = await open({ w: 1280, h: 720, root: rootArg ? path.resolve(rootArg.slice(7)) : undefined });
    try {
      const p = await cam.ev(`(async () => { ${CASES[name]} })()`);
      // the tiles paint with the weapons put aside, so the first frame filmed is the first the launch is drawn in
      await cam.ev(({ p, z, film }) => { const S = IC.S; if (film) IC.film.set(true); look(p.x, p.y, z); S.speed = 1; S.paused = true;
        window._keep = { m: S.missiles.splice(0), tr: S.fx.tracers.splice(0), t: S.threats.filter(t => !t.d.civil) }; S.threats = S.threats.filter(t => t.d.civil); }, { p, z: Z, film: FILM });
      await cam.free(1500);
      await cam.ev(() => { const S = IC.S, K = window._keep; IC.film.hold(true); S.missiles.push(...K.m); S.fx.tracers.push(...K.tr); S.threats.push(...K.t); S.paused = false; });
      const cdp = await cam.page.context().newCDPSession(cam.page);
      const W = 400, H = 300, clip = { x: 640 - W / 2, y: 360 - H / 2, width: W, height: H, scale: 1 };
      const pick = new Set([...Array(12).keys(), ...Array.from({ length: 12 }, (_, i) => 12 + (i + 1) * 4)]);
      let n = 0;
      for (let i = 0; i <= 60; i++) {
        await cam.ev(() => IC.film.tick(1000 / 30));
        if (!pick.has(i)) continue;
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip });
        fs.writeFileSync(path.join(dir, String(n++).padStart(3, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
      }
      const out = path.join(OUT, name + (FILM ? '-film' : '') + '.jpg');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, '%03d.jpg'), '-vf', `scale=${W / 2}:${H / 2},tile=6x4:padding=2`, '-frames:v', '1', '-q:v', '3', out]);
      console.log('saved', out);
    } catch (e) { console.log(name, 'failed:', e.message); }
    if (cam.errors.length) console.log(name, 'page errors:\n  ' + cam.errors.slice(0, 5).join('\n  '));
    await cam.close();
  }
})();
