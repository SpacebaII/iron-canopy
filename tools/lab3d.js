/* A 3D lab for briefs 61–63: the teaser's raid played once in a page that stays open, so the 3D view's files can be
   changed and looked at again without playing the raid again.
     node tools/lab3d.js [--port=8799] [--w=1280 --h=720] [--q=medium]
   Then, from another shell:
     curl -s localhost:8799/eval -d 'JS'        runs JS in the page (await allowed), prints what it returns
     curl -s localhost:8799/reload -d 'models-arms,render3d-war'   loads those files again and closes the 3D view
     curl -s 'localhost:8799/shot?f=shots/lab/x.png'               a picture of the page
     curl -s localhost:8799/quit
   In the page: RAID (the raid's times and places, as tools/teaser.js), PK (its 3D shots), and
   lab(name or spec, game seconds after the shot starts) opens the replay on a shot and draws that moment. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { open, ROOT } = require('./film-lib');
const { SETUP, PICK } = require('./teaser');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };

(async () => {
  const cam = await open({ w: +arg('w', 1280), h: +arg('h', 720), fps: 24 });
  const T = Date.now();
  console.log('setup', await cam.ev(SETUP(+arg('hour', 19.6))));
  await cam.ev(q => { IC.film.set(true); IC.film.opt.bars = true; IC.q3d.set(q); window.C = RAID; }, arg('q', 'medium'));
  await cam.ev(() => advTo(870));
  await cam.ev(`window.PK = (${PICK.toString()})(); 1`);
  await cam.ev(() => {
    /* open the replay on a shot (a name in PK or a spec like PK's) at its start plus g game seconds, and draw it */
    window.lab = async (s, g, settle) => {
      const p = typeof s === 'string' ? PK[s] : s;
      if (!window.V3 || V3.closed || V3.labKey !== JSON.stringify([p.x, p.y, p.r])) {
        if (IC.replayClose) IC.replayClose();
        IC.film.blank(false);
        const v = window.V3 = IC.replayOpen(IC.S, { x: p.x, y: p.y, r: p.r, t: RAID.t0 + p.t }); IC.replayFilm(v, true); v.playing = false; v.labKey = JSON.stringify([p.x, p.y, p.r]);
        for (let i = 0; i < 600 && !(v.renderer && v.movers && v.war); i++) await wait(100);
      }
      IC.film.hold(true);
      const t = RAID.t0 + p.t + (g || 0);
      V3.t = t - 0.4; IC.replayShot(V3, Object.assign({ t0: RAID.t0 + p.t }, p.cam)); V3.fsnap = true;
      for (let i = 0; i < (settle || 6); i++) { V3.t = t - 0.4 + 0.4 * (i + 1) / (settle || 6); IC.film.tick(1000 / 24); }
      return { t: V3.t, movers: V3.movers.length };
    };
  });
  console.log('ready', ((Date.now() - T) / 1000).toFixed(0) + ' s', 'shots:', await cam.ev(() => Object.keys(PK).join(' ')));
  const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/eval') {
        const js = await body(req);
        const out = await cam.page.evaluate(`(async () => { ${/return|;|\n/.test(js) ? js : 'return ' + js} })()`);
        res.end(JSON.stringify(out === undefined ? null : out) + '\n');
      } else if (u.pathname === '/reload') {
        const files = (await body(req)).trim().split(',').filter(Boolean);
        await cam.ev(() => { if (IC.replayClose) IC.replayClose(); window.V3 = null; });
        for (const f of files) await cam.page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'iron-canopy/js', f + '.js'), 'utf8') });
        await cam.ev(() => { IC.modelMesh.clear(); if (IC.R3D) IC.R3D.clearParts(); });
        res.end('reloaded ' + files.join(', ') + '\n');
      } else if (u.pathname === '/shot') {
        const f = path.resolve(ROOT, u.searchParams.get('f') || 'shots/lab/shot.png'); fs.mkdirSync(path.dirname(f), { recursive: true });
        await cam.shot(f); res.end('saved ' + f + '\n');
      } else if (u.pathname === '/quit') { res.end('bye\n'); await cam.browser.close(); process.exit(0); }
      else res.end('?\n');
    } catch (e) { res.end('error: ' + e.message + '\n'); }
    if (cam.errors.length) { console.log('page errors:', cam.errors.join(' | ')); cam.errors.length = 0; }
  }).listen(+arg('port', 8799));
})();
