/* How smoothly things move on the map (brief 67): a Quick war's capital airport filmed frame by frame on the held
   clock (tools/film-lib.js) at a few game speeds, measuring every aircraft on the ground as it is drawn
   (IC.movePose where there is one, else the simulation's own position and heading):
     heading snaps   frames where the drawn heading turns more than 12° (a real airliner turns some 3° a second)
     slip            the drawn heading against the way the aircraft really moves on screen (sliding sideways)
     jerk            the change of on-screen velocity from one frame to the next, in pixels
   and the camera's fly-to (zoom and pan easing: the largest step from one frame to the next against the average).
     node tools/motion-probe.js <tag> [--root=path] [--speeds=1,8] [--sec=3] [--z=30] [--detail]
   (--detail lists the worst moments: kind, size, frame, aircraft, phase, on-screen speed in px a frame)
   Prints the numbers and saves shots/motion-<tag>-x<speed>.jpg, a contact sheet of every third frame round the
   busiest aircraft. Needs Playwright and Python's PIL for the sheet. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { open } = require('./film-lib');

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const root = arg('root') ? path.resolve(arg('root')) : path.resolve(__dirname, '..');
const tag = (args.find(a => !a.startsWith('--')) || 'now').replace(/[^\w-]/g, '');
const speeds = arg('speeds', '1,8').split(',').map(Number), SEC = +arg('sec', 3), Z = +arg('z', 30);
const OUT = path.resolve(__dirname, '../shots'), TMP = path.join(OUT, 'motion-tmp');

(async () => {
  const cam = await open({ w: 960, h: 600, root, frames: TMP });
  await cam.ev(async () => {
    IC.S.seed = 4242; Math.random = seeded(7);
    await IC.begin('quick');
    const S = IC.S; quiet();
    const st = document.createElement('style'); st.textContent = '#app > *:not(#map){display:none!important} #start,#cine,#evcard,#hints,#unlock{display:none!important}'; document.head.appendChild(st);
    const s0 = document.getElementById('start'); if (s0) s0.hidden = true; for (const e of document.querySelectorAll('.at-start')) e.classList.remove('at-start');
    S.cfg.slowmo = false; S.cfg.bars = false; S.cfg.pauseOn = {}; S.layers.coverage = false;
    IC.enemyTick = () => {};
    S.time = Math.floor(S.time / 86400) * 86400 + 10 * 3600;
    steps(S, 600);
    if (S.follow && IC.followStop) IC.followStop(S);
  });
  fs.mkdirSync(TMP, { recursive: true });
  for (const sp of speeds) {
    // the camera on the airport's busiest ground traffic
    await cam.ev(([sp, Z]) => {
      const S = IC.S, c = IC.cap(S);
      const A = S.infra.filter(b => b.kind === 'airport' && b.moves && b.moves.length).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
      const ap = A[0]; window.__ap = ap;
      const m = ap.moves.find(m => m.phase === 'taxi' && !m.dead) || ap.moves.find(m => !m.dead) || ap;
      look(m.x, m.y, Z); S.paused = true; S.speed = sp; S.skip = false;
      window.__rec = []; window.__sheet = [];
    }, [sp, Z]);
    // (paused while the page catches up, so both checkouts film the same moment of the same game)
    await cam.free(300);
    await cam.ev(() => { IC.film.hold(true); IC.S.paused = false; });
    const n = Math.round(SEC * 30);
    let k = 0;
    await cam.film(SEC, async i => {
      await cam.ev(() => {
        const ap = window.__ap, cz = IC.cam, P = IC.movePose || (m => m);
        const f = { t: IC.S.time, ms: [] };
        for (const m of ap.moves) { if (m.dead) continue; const p = P(m, IC.S); f.ms.push([m.id, (p.x - cz.x) * cz.z, (p.y - cz.y) * cz.z, p.h, m.phase]); }
        window.__rec.push(f);
      });
    });
    // every third frame of the film for the sheet
    const files = fs.readdirSync(TMP).filter(f => f.endsWith('.jpg')).sort();
    const res = await cam.ev(() => {
      const R = window.__rec, out = { frames: R.length, snaps: 0, maxDh: 0, slip: [], jerk: [], moving: 0, ev: [] };
      const ang = a => { a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a; };
      for (let i = 2; i < R.length; i++) {
        const A = new Map(R[i - 2].ms.map(q => [q[0], q])), B = new Map(R[i - 1].ms.map(q => [q[0], q]));
        for (const q of R[i].ms) {
          const b = B.get(q[0]), a = A.get(q[0]); if (!a || !b) continue;
          const dh = Math.abs(ang(q[3] - b[3])) * 180 / Math.PI; out.maxDh = Math.max(out.maxDh, dh); if (dh > 12) { out.snaps++; out.ev.push(['snap', dh, i, q[0], b[4] + '>' + q[4]]); }
          const vx = q[1] - b[1], vy = q[2] - b[2], ux = b[1] - a[1], uy = b[2] - a[2], v = Math.hypot(vx, vy);
          if (v > 0.4) { out.moving++; const s = Math.abs(ang(Math.atan2(vy, vx) - q[3])) * 180 / Math.PI, sl = Math.min(s, 180 - s), j = Math.hypot(vx - ux, vy - uy); out.slip.push(sl); out.jerk.push(j);
            if (sl > 20) out.ev.push(['slip', sl, i, q[0], q[4], +v.toFixed(1)]); if (j > 8) out.ev.push(['jerk', j, i, q[0], b[4] + '>' + q[4], +v.toFixed(1)]); }
        }
      }
      const pc = (L, p) => { if (!L.length) return 0; L = L.slice().sort((x, y) => x - y); return L[Math.min(L.length - 1, Math.floor(L.length * p))]; };
      return { ev: out.ev.sort((x, y) => y[1] - x[1]).slice(0, 12).map(e => e.map(v => typeof v === 'number' ? +v.toFixed(1) : v).join(' ')), frames: out.frames, moving: out.moving, snaps: out.snaps, maxDh: out.maxDh, slip95: pc(out.slip, 0.95), slipMax: pc(out.slip, 1), jerk95: pc(out.jerk, 0.95), jerkMax: pc(out.jerk, 1) };
    });
    console.log(`x${sp}: ${res.frames} frames, ${res.moving} aircraft-frames moving; heading snaps over 12°: ${res.snaps} (largest ${res.maxDh.toFixed(1)}°); sideways slip 95% ${res.slip95.toFixed(1)}°, max ${res.slipMax.toFixed(1)}°; jerk 95% ${res.jerk95.toFixed(2)} px, max ${res.jerkMax.toFixed(2)} px`);
    if (args.includes('--detail')) for (const e of res.ev) console.log('    ' + e);
    const pick = files.slice(-n).filter((_, i) => i % 3 === 0).slice(0, 30).map(f => path.join(TMP, f));
    const sheet = path.join(OUT, `motion-${tag}-x${sp}.jpg`);
    try {
      execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
fs = sys.argv[2:]; W, H = 320, 200; cols = 6; rows = (len(fs) + cols - 1) // cols
sh = Image.new('RGB', (W * cols, H * rows))
for i, f in enumerate(fs):
    im = Image.open(f); w, h = im.size; im = im.crop((w // 2 - w // 4, h // 2 - h // 4, w // 2 + w // 4, h // 2 + h // 4)).resize((W, H))
    sh.paste(im, ((i % cols) * W, (i // cols) * H))
sh.save(sys.argv[1], quality=80)`, sheet, ...pick]);
      console.log('  sheet ' + path.relative(process.cwd(), sheet));
    } catch (e) { console.log('  no sheet: ' + e.message.split('\n')[0]); }
    await cam.ev(() => { IC.S.paused = true; }); await cam.free(200);
  }
  // the camera's fly-to: from the whole country to the airport, and back out
  await cam.ev(() => { const S = IC.S; IC.film.hold(true); S.speed = 1; if (S.follow && IC.followStop) IC.followStop(S); const ap = window.__ap; look(ap.x + 3000, ap.y - 2000, 0.05); window.__cz = []; IC.flyTo(ap.x, ap.y, 30); });
  // (filmed, not just ticked: the page draws its frames only when a picture is taken; long enough for the longest flight)
  await cam.film(3.5, async () => { await cam.ev(() => { const c = IC.cam; window.__cz.push([c.z, c.x + c.vw / c.z / 2, c.y + c.vh / c.z / 2]); }); });
  const fly = await cam.ev(() => {
    const L = window.__cz, st = [];
    // each frame's step as the screen sees it: the zoom in log terms and the pan in screens
    for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i]; st.push(Math.abs(Math.log(b[0] / a[0])) + Math.hypot(b[1] - a[1], b[2] - a[2]) * Math.min(a[0], b[0]) / 960); }
    // (from the first frame that moves: the page may take a few frames to pick the flight up)
    const go = Math.max(0, st.findIndex(x => x > 1e-6)), done = st.findIndex((s, i) => i > go && st.slice(i).every(x => x < 1e-6));
    const act = st.slice(go, done < 0 ? st.length : done), avg = act.reduce((s, v) => s + v, 0) / Math.max(1, act.length);
    return { frames: act.length, first: act[0] || 0, max: Math.max(...act, 0), avg, end: L[L.length - 1][0] };
  });
  console.log(`fly-to (country to airport): ${fly.frames} frames moving, first frame's step ${(fly.first / (fly.avg || 1)).toFixed(2)}× the average, largest ${(fly.max / (fly.avg || 1)).toFixed(2)}× (smooth: starts small, peaks under 2×); zoom at the end ${fly.end.toFixed(1)}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  if (cam.errors.length) console.log('page errors:\n  ' + cam.errors.slice(0, 5).join('\n  '));
  await cam.close();
})();
