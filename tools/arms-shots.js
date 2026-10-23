/* Launchers, radars and missiles close in (briefs 61–63): each model from the models gallery at a three-quarter angle,
   saved to shots/arms/<key>.png, to look at a model after changing it.
     node tools/arms-shots.js [keys,...] [--yaw=0.7] [--pitch=0.25] [--dist=1.6] [--w=1280 --h=720]
   dist is in model lengths. Needs Playwright and three.js on disk (tools/film-lib.js). */
const path = require('path');
const fs = require('fs');
const { open, ROOT } = require('./film-lib');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const keys = (process.argv.slice(2).find(a => !a.startsWith('--')) || 'lrsam,mrsam,shorad,spaag,etel,ecml,lr3d,sam,bm,cm').split(',');
const OUT = path.join(ROOT, 'shots/arms');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const cam = await open({ w: +arg('w', 1280), h: +arg('h', 720) });
  await cam.ev(() => { const st = document.getElementById('start'); if (st) st.hidden = true; IC.replayGallery(IC.S); });
  await cam.page.waitForFunction(() => { const v = IC.replayState(); return v && v.movers && v.movers.length > 50; }, null, { timeout: 180000 });
  for (const k of keys) {
    const ok = await cam.ev(([k, yaw, pitch, dist]) => {
      const v = IC.replayState(), m = v.movers.find(q => q.tr.model === k); if (!m) return false;
      const p = m.grp.position, L = Math.max(4, IC.modelSize(k));
      v.labels = false; for (const q of v.movers) if (q.lblOn) { q.label.hidden = true; q.lblOn = false; }
      Object.assign(v.orbit, { tx: p.x, ty: p.y + L * 0.12, tz: p.z, yaw, pitch, dist: L * dist });
      return true;
    }, [k, +arg('yaw', 0.7), +arg('pitch', 0.25), +arg('dist', 1.6)]);
    if (!ok) { console.log(k, 'no such model'); continue; }
    await cam.page.waitForTimeout(1500);
    await cam.page.locator('#replay [data-el=view]').screenshot({ path: path.join(OUT, k + '.png') });
    console.log('saved', k);
  }
  if (cam.errors.length) console.log('page errors:', cam.errors.slice(0, 5));
  await cam.browser.close();
})();
