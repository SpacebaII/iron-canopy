/* The teaser (brief 60): "First Strike", a raid on the capital at dusk told in shots on the map and in the 3D view,
   filmed frame by frame on the game's held clock, scored by tools/teaser-score.js and cut together with ffmpeg.
     node tools/teaser.js [--out=docs/trailer/iron-canopy-first-strike.mp4] [--fps=30] [--w=1920 --h=1080]
                          [--hour=19.6] [--q=high] [--stills] [--only=name,name] [--cut] [--probe]
   The raid is played once, live: the map's shots are filmed as it happens, then the 3D shots replay the record
   (the last 15 game minutes, which hold the whole raid). --stills saves one picture from the middle of each shot
   (shots/teaser/still-<name>.png) instead of filming, to look at the cut quickly; --only films just those shots
   (the others' clips stay in shots/teaser/clips); --cut only cuts the clips already filmed and scores them. --q is
   the 3D view's quality; --probe times the first frames of each 3D shot. On a machine with no graphics card,
   --q=medium --w=1280 --h=720 --fps=24 films the whole teaser in about 1½ hours. Needs Playwright, three.js on disk and
   ffmpeg (tools/film-lib.js). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open, ROOT } = require('./film-lib');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const flag = k => process.argv.includes('--' + k);
const W = +arg('w', 1920), H = +arg('h', 1080), FPS = +arg('fps', 30), HOUR = +arg('hour', 19.6);
const OUT = path.resolve(ROOT, arg('out', 'docs/trailer/iron-canopy-first-strike.mp4'));
const WORK = path.resolve(ROOT, 'shots/teaser');
const STILLS = flag('stills'), PROBE = flag('probe'), Q3D = arg('q', 'high'), ONLY = arg('only', '') ? arg('only', '').split(',') : null;

/* ---------- the raid ----------
   Dusk over the capital. Six ballistic missiles from across the border at the capital's airport, then sixteen cruise
   missiles low from 100 km out, timed to arrive with them; the fuel farm is the aim. The long-range battery meets
   the ballistic missiles, a medium-range battery and the point defence the cruise missiles. There are not enough
   missiles in the launchers for all of them: some get through. Times below are game seconds from the first launch. */
const SETUP = hour => `(async () => {
  IC.S.seed = 4242; Math.random = seeded(7);
  await IC.begin('test'); quiet();
  const S = IC.S, U = IC.U; S.paused = true; S.cfg.slowmo = false; S.cfg.pauseOn = {}; S.cfg.bars = false;
  S.time = Math.floor(S.time / 86400) * 86400 + ${hour} * 3600 - 120;
  if (S.weather) { S.weather.prev = S.weather.kind = 'clear'; S.weather.fade = 1; S.weather.hold = true; }
  const c = IC.cap(S), ap = IC.bases(S).filter(b => b.parts).sort((a, b) => U.dxy(a.x, a.y, c.x, c.y) - U.dxy(b.x, b.y, c.x, c.y))[0];
  const f = ap.parts.find(p => p.kind === 'fuel') || ap;
  IC.sandboxTarget(S, { x: f.x, y: f.y });
  const E = S.enemy; E.allow = null; E.war = true; E.warT = E.actT = E.aimT = S.time; E.act = 1; S.sbx.war = true; E.cycle = { phase: 'calm', next: S.time + 36000, since: S.time };
  const fr = IC.sandboxFrom(S, { from: 'close' }), A = Math.atan2(fr.y - f.y, fr.x - f.x);
  const put = (type, d, side) => IC.makeUnit(S, type, f.x + Math.cos(A) * d - Math.sin(A) * side, f.y + Math.sin(A) * d + Math.cos(A) * side, { instant: true, full: true });
  put('shorad', 30, 6); put('spaag', 10, -3); put('mrsam', 60, -10);
  S.ad.roe = 'free'; for (const u of S.units) { u.roe = 'free'; if (u.emitter) { u.emcon = 'on'; u.radarOn = true; } }
  for (const u of S.units) (u.mags || []).forEach((m, i) => { m.mag = Math.min(m.mag, u.type === 'lrsam' ? (i ? 0 : 6) : u.type === 'mrsam' ? 4 : 3); m.store = 0; });
  // the long-range battery keeps its rounds for the ballistic missiles
  const lr = S.units.filter(u => u.type === 'lrsam'); for (const u of lr) u.roe = 'hold';
  const t0 = S.time + 120, ev = [];
  IC.on((S2, type, d) => { if (['impact', 'kill', 'intercept', 'launch'].includes(type)) ev.push({ t: S.time - t0, kind: type, x: d.x != null ? d.x : d.u ? d.u.x : d.t ? d.t.x : 0, y: d.y != null ? d.y : d.u ? d.u.y : d.t ? d.t.y : 0, alt: d.alt || (d.t && d.t.alt) || 0, u: d.u ? d.u.type : '', uid: d.u ? d.u.id : null, cls: d.t && d.t.d ? d.t.d.cls : d.d ? d.d.cls : d.src && d.src.d ? d.src.d.cls : '', hit: d.hit ? d.hit.name : '' }); });
  window.RAID = { t0, ev, cap: { x: c.x, y: c.y }, ap: { x: ap.x, y: ap.y }, fuel: { x: f.x, y: f.y }, A };
  // the game moves on only when the camera asks: g game seconds more, launching the waves on time
  // with dice of its own, so the raid plays the same however many frames the map and the 3D view draw between steps
  let acc = 0, srbm = false, cm = false;
  const dice = seeded(11), own = Math.random;
  window.adv = g => {
    acc += g; Math.random = dice;
    while (acc >= 0.25) {
      const r = S.time - t0;
      if (!srbm && r >= 0) { srbm = true; IC.sandboxLaunch(S, { what: 'srbm', n: 6, from: 'border' }); }
      if (!cm && r >= 330) { cm = true; IC.sandboxLaunch(S, { what: 'lacm', n: 16, from: 'close' }); }
      if (r >= 700) for (const u of lr) u.roe = 'free';
      IC.step(S, 0.25); acc -= 0.25;
    }
    Math.random = own;
  };
  window.advTo = r => adv(Math.max(0, t0 + r - S.time));
  // a hostile weapon in the air, the one nearest to a place
  window.nearest = (p, cls) => S.threats.filter(t => !t.dead && !t.d.civil && (!cls || t.d.cls === cls) && t.age > 0).sort((a, b) => U.dxy(a.x, a.y, p.x, p.y) - U.dxy(b.x, b.y, p.x, p.y))[0] || null;
  return { cap: c.name, ap: ap.name };
})()`;

/* ---------- the 3D shots: chosen from the record ----------
   PICK runs in the page after the raid: for each 3D shot, where the replay opens (x, y, r), the game time it
   starts at (t, from the launch), how fast the game runs against the film (speed: game seconds a film second, or
   [[film s, speed], ...] eased between), and the camera (render3d-war.js). */
const PICK = () => {
  const S = IC.S, U = IC.U, R = RAID, T0 = R.t0, ev = R.ev;
  const tracks = IC.recTracks(S), cls = tr => tr.ref && tr.ref.d ? tr.ref.d.cls : null, first = tr => IC.recFirstT(tr);
  const pos = (tr, t) => IC.recAt(tr, t, {});
  const perp = (a, d) => ({ x: Math.cos(a + Math.PI / 2) * d, y: Math.sin(a + Math.PI / 2) * d });
  const out = {};
  // calm: the airport at dusk, its lights coming on, a slow orbit
  out.calm = { x: R.ap.x, y: R.ap.y, r: 120, t: -40, speed: 1, cam: { mode: 'orbit', at: { x: R.ap.x, y: R.ap.y, h: 0 }, dist: 22, up: 3.2, rate: 0.035, yaw0: R.A + 2.2, lens: 32, shake: 0.05 } };
  // the launch: the first ballistic missile off its launcher, seen from the ground 800 m away
  const bal = tracks.filter(tr => tr.kind === 'threat' && cls(tr) === 'bal').sort((a, b) => first(a) - first(b));
  if (bal.length) {
    // its flight is fast from the first second: 800 m off at a seventh of real time, the camera tilting up after it
    const b = bal[0], L = pos(b, first(b)), L2 = pos(b, first(b) + 30), a = Math.atan2(L2.y - L.y, L2.x - L.x), o = perp(a, 8);
    out.launch = { x: L.x, y: L.y, r: 120, t: first(b) - T0 - 0.2, speed: [[0, 0.14], [3.2, 0.14], [4.2, 0.5]], cam: { mode: 'fixed', ref: b.ref, lookOff: { y: -0.3 }, from: { x: L.x + o.x - Math.cos(a) * 2, y: L.y + o.y - Math.sin(a) * 2, h: 2 }, lens: [70, 45], lag: 0.3, shake: 0.12 } };
  }
  // a cruise missile low over the fields: the camera set down beside its path as it comes
  const cms = tracks.filter(tr => tr.kind === 'threat' && cls(tr) === 'cm');
  const tf = T0 + 560, cm = cms.find(tr => first(tr) < tf - 5 && tr.t1 > tf + 10) || cms[0];
  if (cm) { const p = pos(cm, tf + 2); out.flyby = { x: p.x, y: p.y, r: 80, t: 560, speed: [[0, 1], [1.7, 1], [2.2, 0.25], [3.2, 0.25], [4, 1]], cam: { mode: 'plant', ref: cm.ref, lead: 2.1, side: 0.45, up: 0.06, lens: 24, lag: 0.08, shake: 0.08 } }; }
  // the medium-range battery fires: the camera stays on the launcher, the missile leaves the frame in slow motion and its smoke stays
  const lm = ev.find(e => e.kind === 'launch' && e.u === 'mrsam');
  if (lm) {
    const u = S.units.find(q => q.id === lm.uid), ms = u && tracks.filter(tr => tr.kind === 'missile' && tr.meta.uref === u && Math.abs(first(tr) - (lm.t + T0)) < 3)[0];
    const a = R.A + 0.9;
    if (u) out.sam = { x: u.x, y: u.y, r: 120, t: lm.t - 1.0, speed: [[0, 1], [0.8, 1], [1.2, 0.25], [3.6, 0.3]], cam: { mode: 'fixed', at: { x: u.x, y: u.y, h: 45 }, from: { x: u.x + Math.cos(a) * 2.5, y: u.y + Math.sin(a) * 2.5, h: 1.7 }, lens: [32, 28], shake: 0.2 } };
    if (ms) out.chase = { x: u.x, y: u.y, r: 400, t: lm.t + 1.2, speed: 1, cam: { mode: 'chase', ref: ms.ref, lookAt: ms.meta.tref || null, back: 0.35, side: 0.08, up: 0.1, lens: 30, lag: 0.1, shake: 0.1 } };
  }
  // a cruise missile shot down: from the ground 1.2 km off with a long lens, slowing as it is hit
  const kcs = ev.filter(e => e.kind === 'kill' && e.cls === 'cm').sort((a, b) => U.dxy(a.x, a.y, R.fuel.x, R.fuel.y) - U.dxy(b.x, b.y, R.fuel.x, R.fuel.y)), kc = kcs[2] || kcs[0];
  if (kc) {
    const o = perp(R.A, 12); out.kill = { x: kc.x, y: kc.y, r: 120, t: kc.t - 1.9, speed: [[0, 1], [1.6, 1], [2.1, 0.22], [3.6, 0.22], [4.2, 0.6]], cam: { mode: 'fixed', at: { x: kc.x, y: kc.y, alt: kc.alt || 0.04 }, from: { x: kc.x + o.x, y: kc.y + o.y, h: 2 }, lens: 135, lag: 0.3, shake: 0.06 } }; }
  // a ballistic missile met high up, seen from the ground 5 km off, looking up
  const kb = ev.find(e => e.kind === 'intercept' && e.cls === 'bal');
  if (kb) out.high = { x: R.ap.x, y: R.ap.y, r: 400, t: kb.t - 2.1, speed: [[0, 1], [1.8, 1], [2.4, 0.3], [4, 0.3]], cam: { mode: 'fixed', at: { x: kb.x, y: kb.y, alt: kb.alt || 20 }, from: { x: kb.x + Math.cos(R.A + 1.2) * 50, y: kb.y + Math.sin(R.A + 1.2) * 50, h: 2 }, lens: [200, 320], shake: 0.1 } };
  // what gets through: a cruise missile into the airport, then a ballistic one
  const ics = ev.filter(e => e.kind === 'impact' && e.cls === 'cm'), ic = ics[0], ib = ev.filter(e => e.kind === 'impact' && e.cls === 'bal')[0] || ics[ics.length - 1];
  if (ic) { const o = perp(R.A, -6); out.hit = { x: ic.x, y: ic.y, r: 120, t: ic.t - 2.2, speed: [[0, 1], [1.9, 1], [2.3, 0.4], [3.6, 0.4], [4.4, 1]], cam: { mode: 'fixed', at: { x: ic.x, y: ic.y, h: 45 }, from: { x: ic.x + o.x + Math.cos(R.A) * 2, y: ic.y + o.y + Math.sin(R.A) * 2, h: 12 }, lens: [60, 80], lag: 0.1, shake: 0.12 } }; }
  if (ib) { const o = perp(R.A + 1.2, 10); out.hit2 = { x: ib.x, y: ib.y, r: 120, t: ib.t - 1.0, speed: 1, cam: { mode: 'fixed', at: { x: ib.x, y: ib.y, h: 70 }, from: { x: ib.x + o.x, y: ib.y + o.y, h: 40 }, lens: [40, 50], shake: 0.12 } }; }
  // after: the burning airport from the air, turning slowly, the game running at four times
  const last = ev.filter(e => e.kind === 'impact').slice(-1)[0], c0 = ic || ib || R.fuel;
  out.after = { x: R.ap.x, y: R.ap.y, r: 160, t: (last ? last.t : 840) + 6, speed: 5, cam: { mode: 'orbit', at: { x: (R.ap.x + c0.x) / 2, y: (R.ap.y + c0.y) / 2, h: 80 }, dist: 20, up: 4.5, rate: 0.05, yaw0: R.A - 0.8, lens: [30, 26], shake: 0.06 } };
  return out;
};

/* ---------- the cut ----------
   Each shot: kind 'card' (a title on black), '2d' (the map, live: g is game seconds a film second, at the game
   time it starts, cam IC.film.shot's spec, made in the page where C is the raid), or '3d' (PICK's shot of that
   name). cap: a caption over the shot. */
const CUT = [
  { name: 'open', kind: 'card', dur: 3.2, card: ['HOLITZ', '19:36 · the capital'], big: 92 },
  { name: 'city', kind: '2d', dur: 5, at: -110, g: 10, cam: `({ kind: 'pan', at: { x: C.cap.x, y: C.cap.y }, to: { x: C.ap.x, y: C.ap.y }, z: 4, z1: 16 })`, cap: ['Holitz', 'The capital, 19:36'] },
  { name: 'calm', kind: '3d', dur: 4.5, cap: ['Holitz International', 'The country\'s busiest airport'] },
  { name: 'launch', kind: '3d', dur: 4.2, cap: ['East of the border', 'A ballistic missile leaves its launcher'] },
  { name: 'arcs', kind: '2d', dur: 4.5, at: 120, g: 70, cam: `({ kind: 'raid', ref: nearest(C.ap, 'bal'), with: [C.ap], pad: 900, zMax: 0.12 })`, cap: ['Six ballistic missiles', '900 km. Twelve minutes.'] },
  { name: 'flyby', kind: '3d', dur: 4, cap: ['Sixteen cruise missiles', '30 m over the fields'] },
  { name: 'track', kind: '2d', dur: 3.6, at: 600, g: 10, cam: `({ kind: 'track', ref: nearest(C.ap, 'cm'), z: 6, lead: 0.3 })` },
  { name: 'wakes', kind: 'card', dur: 2, card: ['THE DEFENCE WAKES'], big: 84, rule: false },
  { name: 'sam', kind: '3d', dur: 3.6 },
  { name: 'kill', kind: '3d', still: 0.75, dur: 4.4 },
  { name: 'raid', kind: '2d', dur: 4.4, at: 690, g: 14, cam: `({ kind: 'raid', ref: nearest(C.ap, 'cm'), with: [C.ap], pad: 200, zMax: 2.5 })` },
  { name: 'high', kind: '3d', still: 0.75, dur: 4 },
  { name: 'through', kind: 'card', dur: 1.8, card: ['NOT ALL OF THEM'], big: 84, rule: false },
  { name: 'hit', kind: '3d', still: 0.75, dur: 4.6 },
  { name: 'hit2', kind: '3d', still: 0.75, dur: 3.4 },
  { name: 'after', kind: '3d', dur: 5.5 },
  { name: 'out', kind: '2d', dur: 4.8, at: 852, g: 6, cam: `({ kind: 'push', at: { x: C.ap.x, y: C.ap.y }, z: 16, z1: 0.12 })` },
  { name: 'title', kind: 'card', dur: 6.5, card: ['IRON CANOPY', 'Build the airports. Run the skies. Then defend them.'], big: 150, fade: 1.2 }
];
module.exports = { SETUP, PICK, CUT };
if (require.main !== module) return;

/* the speed of a 3D shot at film time f: a number, or a ramp eased between its points */
function speedAt(sp, f) {
  if (!Array.isArray(sp)) return sp;
  if (f <= sp[0][0]) return sp[0][1];
  for (let i = 1; i < sp.length; i++) if (f <= sp[i][0]) { const [a, va] = sp[i - 1], [b, vb] = sp[i], k = (f - a) / (b - a), e = k * k * (3 - 2 * k); return va + (vb - va) * e; }
  return sp[sp.length - 1][1];
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  const clips = path.join(WORK, 'clips'); fs.mkdirSync(clips, { recursive: true });
  const T = Date.now(), el = () => ((Date.now() - T) / 1000).toFixed(0) + ' s';
  if (!flag('cut')) await film(clips, el);
  if (STILLS || ONLY) return;
  cut(clips, el);
})();

/* every shot (or those --only names), as clips in shots/teaser/clips */
async function film(clips, el) {
  const cam = await open({ w: W, h: H, fps: FPS });
  console.log('setup', await cam.ev(SETUP(HOUR)), el());
  await cam.ev(q => { window.Q3D = q; }, Q3D);
  await cam.ev(() => { IC.film.set(true); IC.film.opt.bars = true; IC.q3d.set(window.Q3D); window.C = RAID; });
  const want = s => !ONLY || ONLY.includes(s.name);
  const frameDir = name => { const d = path.join(WORK, 'f-' + name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };
  const enc = (name, dir) => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%06d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', path.join(clips, name + '.mp4')]); fs.rmSync(dir, { recursive: true, force: true }); };
  const frames = s => Math.round(s.dur * FPS);
  const caption = s => cam.ev(c => IC.film.caption(c ? c[0] : null, c ? c[1] : '', 3.6), s.cap || null);
  // what each 3D shot showed, kept from earlier runs for the shots this one does not film (--only)
  let log = { fps: FPS }; try { log = Object.assign(JSON.parse(fs.readFileSync(path.join(WORK, 'shots.json'), 'utf8')), log); } catch (e) { /* the first run */ }

  // the map's shots, in the order the raid plays them
  for (const s of CUT.filter(s => s.kind === '2d')) {
    await cam.ev(r => advTo(r), s.at);
    if (!want(s)) continue;
    await cam.ev(([spec, d]) => { IC.film.blank(false); const sh = IC.film.shot(Object.assign(eval(spec), { dur: d, keep: true, snap: true })); if (sh.kind !== 'push' && sh.kind !== 'pan') sh.dur = 999; }, [s.cam, s.dur]);
    await caption(s);
    const g = s.g / FPS;
    if (STILLS) {
      await cam.ev(([g, k]) => { IC.film.hold(true); for (let i = 0; i < k; i++) { adv(g); IC.film.tick(1000 / 30); } }, [g, Math.round(frames(s) / 2)]);
      await cam.still(path.join(WORK, 'still-' + s.name + '.png')); console.log(s.name, el()); continue;
    }
    cam.dir = frameDir(s.name); cam.n = 0;
    await cam.film(s.dur, () => cam.ev(g => adv(g), g));
    enc(s.name, cam.dir); console.log(s.name, 'filmed', el());
  }
  await cam.ev(() => advTo(860));
  log.ev = await cam.ev(() => RAID.ev);
  console.log('raid:', log.ev.filter(e => e.kind !== 'launch').map(e => `${e.t.toFixed(0)} ${e.kind} ${e.cls}`).join(' · '));

  // the 3D shots, from the record
  await cam.ev(`window.PK = (${PICK.toString()})(); 1`);
  const keys = await cam.ev(() => Object.keys(PK));
  for (const s of CUT.filter(s => s.kind === '3d')) {
    if (!want(s)) continue;
    if (!keys.includes(s.name)) { console.log(s.name, 'has nothing to film: skipped'); continue; }
    await cam.ev(k => { const p = PK[k]; IC.film.blank(false); const v = IC.replayOpen(IC.S, { x: p.x, y: p.y, r: p.r, t: RAID.t0 + p.t }); window.V3 = v; IC.replayFilm(v, true); v.playing = false; }, s.name);
    await cam.free(300);
    await cam.ev(async () => { for (let i = 0; i < 300 && !(V3.renderer && V3.movers && V3.war); i++) await wait(100); });
    const sp = await cam.ev(k => { const p = PK[k]; V3.t = RAID.t0 + p.t; IC.replayShot(V3, Object.assign({ t0: V3.t }, p.cam)); return p.speed; }, s.name);
    // let the ground and the airports build round the camera before the first frame
    await cam.ev(() => { IC.film.hold(true); for (let i = 0; i < 4; i++) IC.film.tick(1000 / 30); });
    await caption(s);
    let gt = 0; const times = []; for (let i = 0; i < frames(s); i++) { times.push(gt); gt += speedAt(sp, i / FPS) / FPS; }
    log[s.name] = { t: await cam.ev(k => PK[k].t, s.name), times };
    if (PROBE) {
      const ms = []; for (let i = 0; i < 6; i++) { const a = Date.now(); await cam.ev(([k, g]) => { V3.t = RAID.t0 + PK[k].t + g; IC.film.tick(1000 / 30); }, [s.name, times[i]]); await cam.still(path.join(WORK, 'probe-' + s.name + '.png')); ms.push(Date.now() - a); }
      console.log(s.name, 'frame ms', ms.join(' '), el()); continue;
    }
    if (STILLS) {
      // the last few frames before the middle, so the camera's lag and the motion blur are as the film has them
      const mid = Math.floor(times.length * (s.still || 0.5));
      await cam.ev(([k, g]) => { V3.t = RAID.t0 + PK[k].t + g; V3.fsnap = true; IC.film.tick(1000 / 30); }, [s.name, times[Math.max(0, mid - 8)]]);
      for (let i = Math.max(0, mid - 7); i <= mid; i++) {
        await cam.ev(([k, g]) => { V3.t = RAID.t0 + PK[k].t + g; IC.film.tick(1000 / 30); }, [s.name, times[i]]);
        await cam.shot(path.join(WORK, 'still-' + s.name + '.png'));
      }
      console.log(s.name, el()); continue;
    }
    cam.dir = frameDir(s.name); cam.n = 0;
    let i = 0;
    await cam.film(s.dur, () => cam.ev(([k, g]) => { V3.t = RAID.t0 + PK[k].t + g; }, [s.name, times[Math.min(i++, times.length - 1)]]));
    enc(s.name, cam.dir); console.log(s.name, 'filmed', el());
  }
  await cam.ev(() => IC.replayClose && IC.replayClose());

  // the title cards, on black
  for (const s of CUT.filter(s => s.kind === 'card')) {
    if (!want(s)) continue;
    await cam.ev(s => { IC.film.blank(true); IC.film.caption(null); IC.film.card(s.card[0], s.card[1] || '', s.dur - 0.1, { big: s.big, rule: s.rule, fade: s.fade || 0.5 }); }, s);
    if (STILLS) { await cam.ev(k => { IC.film.hold(true); for (let i = 0; i < k * 30; i++) IC.film.tick(1000 / 30); }, s.dur / 2); await cam.still(path.join(WORK, 'still-' + s.name + '.png')); continue; }
    cam.dir = frameDir(s.name); cam.n = 0;
    await cam.film(s.dur);
    enc(s.name, cam.dir); console.log(s.name, 'filmed', el());
  }
  if (cam.errors.length) console.log('page errors:\n  ' + cam.errors.slice(0, 8).join('\n  '));
  fs.writeFileSync(path.join(WORK, 'shots.json'), JSON.stringify(log));
  await cam.close();
}

/* the cut: the clips end to end, the score under them (--cut does only this, from the clips already filmed) */
function cut(clips, el) {
  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, CUT.filter(s => fs.existsSync(path.join(clips, s.name + '.mp4'))).map(s => `file '${path.join(clips, s.name + '.mp4')}'`).join('\n'));
  const silent = path.join(WORK, 'picture.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  const wav = path.join(WORK, 'score.wav');
  execFileSync('node', [path.join(__dirname, 'teaser-score.js'), '--out=' + wav], { stdio: 'inherit' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', OUT]);
  console.log('saved', OUT, el());
}
