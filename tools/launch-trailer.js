/* Iron Canopy: the launch trailer, about three minutes, cut from the game's own pictures.
     node tools/launch-trailer.js [--out=shots/trailer] [--only=cards|cut|mux] [--fresh=dir] [--panels=dir]
   The cut is the list CUT below: each shot a clip (a living story panel recorded by tools/cut-life-clip.js --clean
   --each, a map shot from tools/broll.js, a 3D shot from tools/teaser.js, a capture) or a still pushed in slowly, or
   black; a shot may carry words: a line of the Director's narration (serif, low in the frame) or a title (caps,
   centred). The words are drawn by Chromium into transparent pictures (cards), the shots are made one size and
   cut together by ffmpeg with a film grade and letterbox bars, and the score (tools/launch-score.js, which reads the
   same CUT for its hits) is laid under it. Every source is looked up in order: --fresh (the newest b-roll), then
   the older ones, so a better take of a shot replaces the old one by name. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const PF = '/mnt/project-files';
const OUT = path.resolve(ROOT, arg('out', 'shots/launch-trailer')), ONLY = arg('only', '');
const DIRS = {
  P: arg('panels', PF + '/trailer/launch/panels'),
  F: arg('fresh', PF + '/trailer/launch/fresh'),
  B: PF + '/fidelity/broll', C: PF + '/captures/clips', S: PF + '/captures/screens'
};
const W = 1920, H = 1080, FPS = 30, BAR = 112;

/* the cut: [source, seconds, options]. Sources: 'P:c01-1' a panel, 'F|B:flyin' the fresh take or else the old one,
   'S:map-gate80' a still, 'black'. Options: ss (start in the clip), line / title (words over it, from `at` s for
   `for` s), mark (a name the score hits on: 'blast', 'war', 'title'…), fade ('in', 'out', 'both') */
const CUT = [
  ['black', 1.5, { mark: 'open' }],
  // the life before
  ['P:c01-1', 4.2, { fade: 'in', line: 'We had been married a little over two years.', at: 0.6 }],
  ['P:c01-4', 3.4],
  ['P:c02-date-cafe', 3.6, { line: 'I knew which end of the loaf she liked.', at: 0.4 }],
  ['P:c02-date-film', 3.0],
  ['P:c02-1', 3.2, { line: 'My work was the sky over this country.', at: 0.3 }],
  ['P:c02-2', 3.0],
  // the airports
  ['F|B:apt-close|flyin', 5.0, { mark: 'build', title: 'Build the airports', at: 0.8, for: 3.2 }],
  ['S:map-gate80', 3.2],
  ['F|C:build|build-site', 4.0, { ss: 2, title: 'Runway by runway. At real scale.', at: 0.4, for: 3.2 }],
  ['F|B:apt-apron|airport', 4.0],
  ['C:airport-takeoff', 3.6, { ss: 1 }],
  ['B:taxi', 3.4],
  ['F:country-pull', 4.0, { mark: 'rise' }],
  ['S:map-night-city', 3.2, { title: 'Run the airlines. Keep the sky in order.', at: 0.3, for: 2.8 }],
  ['F|B:city-night|night', 3.4],
  ['S:map-country', 3.4],
  // the day of the strike
  ['P:c03-2', 3.6, { mark: 'day', fade: 'in', line: 'She was going to stay with her sister for a while.', at: 0.4 }],
  ['P:c04-2', 3.4, { line: 'That afternoon she was at the terminal with her case.', at: 0.3 }],
  ['P:c04-3', 3.2, { line: 'June called me over. A return that did not fit.', at: 0.2 }],
  ['black', 0.7, { mark: 'hush' }],
  ['P:c04-5', 5.2, { mark: 'blast', line: 'The right half became black. The left did not.', at: 1.6, for: 3.4 }],
  ['P:c04-6', 3.4],
  ['P:c06-4', 3.4],
  ['P:c07-3', 3.2, { line: 'She wasn’t taking much.', at: 0.4, fade: 'out' }],
  // the war
  ['black', 3.0, { mark: 'turn', title: 'Then they asked me to help defend it.', at: 0.3, for: 2.4 }],
  ['P:x1-1', 3.0, { fade: 'in' }],
  ['P:x1-4', 3.4, { line: 'The first real night.', at: 0.4 }],
  ['C:teaser-erect', 2.4, { mark: 'war' }],
  ['C:launch-long-range', 2.8, { ss: 1 }],
  ['B:ballistic', 3.0],
  ['C:teaser-arcs', 2.8],
  ['P:x2-1', 3.0],
  ['C:intercept-ballistic', 3.2, { ss: 3 }],
  ['C:intercept-medium-range', 2.8, { ss: 1 }],
  ['F|B:raid-capital|defence', 4.4, { title: 'Hold fire. Or shoot first.', at: 0.5, for: 3.0 }],
  ['B:cruise', 2.8],
  ['C:teaser-after', 2.4, { mark: 'hit' }],
  ['F|C:burn|impact-airport', 3.0, { ss: 2 }],
  ['P:c18-junction', 2.8],
  ['P:c18-hospital', 2.8, { title: 'Every battery is a choice.', at: 0.2, for: 2.4 }],
  ['P:x2-3', 2.6],
  ['P:x2-4', 4.0, { title: 'Every choice has a name.', at: 0.6, for: 3.0 }],
  ['F|B:intercept-close|fires', 2.8],
  ['P:c24-1', 2.6, { mark: 'hit' }],
  ['P:c05-3', 3.0],
  // the minute of silence
  ['P:c27-1', 3.2, { mark: 'still', line: 'Two hundred and thirty-one aboard.', at: 0.4 }],
  ['P:c27-3', 4.2, { line: '22:34. Every civil frequency in the country went silent.', at: 0.3, for: 3.6 }],
  ['P:r04-flash', 3.2],
  ['P:x3-5', 3.6, { line: 'Some of them are not on the stone.', at: 0.4 }],
  ['P:e01a-stone', 4.0, { fade: 'out' }],
  ['black', 8.4, { mark: 'title', title: 'IRON CANOPY', big: true, at: 0.4, for: 7.6 }],
  ['black', 5.6, { title: 'Four years. One sky.<br>Play it in your browser.', at: 0.6, for: 4.4, fade: 'out' }]
];
/* when each shot starts, and the marks */
let t0 = 0;
const SHOTS = CUT.map(([src, d, o = {}], i) => { const s = { i, src, d, o, t: t0 }; t0 += d; return s; });
const LENGTH = t0, MARKS = {};
for (const s of SHOTS) if (s.o.mark) (MARKS[s.o.mark] = MARKS[s.o.mark] || []).push(s.t);
module.exports = { CUT, SHOTS, LENGTH, MARKS };
if (require.main !== module) return;

const sh = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 26 });
fs.mkdirSync(path.join(OUT, 'seg'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'cards'), { recursive: true });
/* where a shot's picture is */
function find(src) {
  if (src === 'black') return { kind: 'black' };
  const [k, rest] = src.split(':'), kinds = k.split('|'), names = rest.split('|');
  for (let j = 0; j < kinds.length; j++) {
    const dir = DIRS[kinds[j]], n = names[Math.min(j, names.length - 1)];
    for (const ext of kinds[j] === 'S' ? ['.jpg', '.png'] : ['.mp4']) { const f = path.join(dir, n + ext); if (fs.existsSync(f)) return { kind: kinds[j] === 'S' ? 'still' : 'clip', f }; }
  }
  throw new Error('no picture for ' + src);
}

/* ---------- the words, drawn by Chromium ---------- */
async function cards() {
  const { chromium } = require('playwright');
  const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  for (const s of SHOTS) {
    const o = s.o, text = o.line || o.title; if (!text) continue;
    const style = o.big ? 'big' : o.title ? 'title' : 'line';
    await pg.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700&family=Cormorant+Garamond:ital,wght@1,500&display=swap"><style>
      html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
      .w{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
      .line{position:absolute;left:0;right:0;text-align:center;bottom:${BAR + 70}px;font:italic 500 50px/1.25 'Cormorant Garamond',Georgia,serif;color:#f4eee2;letter-spacing:.01em;text-shadow:0 2px 18px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.8);padding:0 200px}
      .title{font:500 54px/1.2 'Saira Condensed',sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#f1ebdd;text-shadow:0 2px 24px rgba(0,0,0,.9);padding:0 160px}
      .big{font:700 150px/1 'Saira Condensed',sans-serif;letter-spacing:.42em;padding-left:.42em;color:#f1ebdd;text-shadow:0 0 60px rgba(242,180,65,.25)}
      .big small{display:block;margin-top:38px;font:500 30px/1 'Saira Condensed',sans-serif;letter-spacing:.36em;text-transform:uppercase;color:#c9a35a}
    </style></head><body>${style === 'line' ? `<div class="line">${text}</div>` : `<div class="w"><div class="${style}">${text}${o.big ? '<small>From Director to Chief of the Air Force</small>' : ''}</div></div>`}</body></html>`);
    await pg.evaluate(() => document.fonts.ready);
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(OUT, 'cards', `c${s.i}.png`), omitBackground: true });
  }
  await b.close();
}

/* ---------- the shots, one size, graded, then cut together ---------- */
const GRADE = 'eq=contrast=1.06:saturation=1.06:gamma=0.98,unsharp=5:5:0.35';
function segment(s) {
  const p = find(s.src), out = path.join(OUT, 'seg', `s${String(s.i).padStart(3, '0')}.mp4`), d = s.d.toFixed(3);
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1`;
  let a;
  if (p.kind === 'black') a = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${d}`, '-vf', 'format=yuv420p'];
  else if (p.kind === 'still') {
    // a still pushes in slowly (zoompan on a larger copy keeps it smooth)
    const n = Math.round(s.d * FPS);
    a = ['-loop', '1', '-i', p.f, '-vf', `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1.0+0.06*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS},${GRADE},format=yuv420p`, '-frames:v', String(n)];
  } else {
    const len = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p.f]).toString();
    const ss = Math.max(0, Math.min(s.o.ss || 0, len - s.d));
    // a clip shorter than its shot is slowed to fit, not frozen
    const slow = len - ss < s.d ? `setpts=${((s.d) / (len - ss)).toFixed(3)}*PTS,` : '';
    a = ['-ss', String(ss), '-i', p.f, '-vf', `${slow}fps=${FPS},${fit},${GRADE},format=yuv420p`, '-t', d];
  }
  const fade = s.o.fade, fl = [];
  if (fade === 'in' || fade === 'both') fl.push(`fade=t=in:st=0:d=0.6`);
  if (fade === 'out' || fade === 'both') fl.push(`fade=t=out:st=${(s.d - 0.8).toFixed(2)}:d=0.8`);
  if (fl.length) { const k = a.indexOf('-vf'); if (k >= 0) a[k + 1] += ',' + fl.join(','); }
  sh('ffmpeg', ['-y', '-loglevel', 'error', ...a, '-an', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
  return out;
}
function cut() {
  const list = SHOTS.map(s => { const f = segment(s); console.error('shot', s.i, s.src, s.d); return `file '${f}'`; });
  fs.writeFileSync(path.join(OUT, 'list.txt'), list.join('\n'));
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', path.join(OUT, 'picture.mp4')]);
  // the words over it, faded in and out, then the bars and a little grain
  const ins = ['-i', path.join(OUT, 'picture.mp4')], fx = []; let last = '[0:v]', k = 1;
  for (const s of SHOTS) {
    const o = s.o; if (!(o.line || o.title)) continue;
    const at = s.t + (o.at || 0), dur = o.for || Math.max(1.2, s.d - (o.at || 0) - 0.3);
    ins.push('-loop', '1', '-t', dur.toFixed(2), '-i', path.join(OUT, 'cards', `c${s.i}.png`));
    const f = Math.min(0.5, dur / 4);
    fx.push(`[${k}:v]format=rgba,fade=t=in:st=0:d=${f}:alpha=1,fade=t=out:st=${(dur - f).toFixed(2)}:d=${f}:alpha=1,setpts=PTS+${at.toFixed(3)}/TB[t${k}]`);
    fx.push(`${last}[t${k}]overlay=0:0:eof_action=pass[v${k}]`); last = `[v${k}]`; k++;
  }
  fx.push(`${last}noise=alls=3:allf=t,drawbox=x=0:y=0:w=iw:h=${BAR}:color=black:t=fill,drawbox=x=0:y=ih-${BAR}:w=iw:h=${BAR}:color=black:t=fill,format=yuv420p[out]`);
  sh('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', fx.join(';'), '-map', '[out]', '-t', LENGTH.toFixed(2), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', path.join(OUT, 'video.mp4')]);
}
function mux() {
  sh('node', [path.join(__dirname, 'launch-score.js'), `--out=${path.join(OUT, 'score.wav')}`]);
  const fin = path.join(OUT, 'iron-canopy-launch-trailer.mp4');
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'video.mp4'), '-i', path.join(OUT, 'score.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', fin]);
  console.log('saved', fin, LENGTH.toFixed(1), 's');
}
(async () => {
  console.error('length', LENGTH.toFixed(1), 's; marks', JSON.stringify(MARKS));
  if (!ONLY || ONLY === 'cards') await cards();
  if (!ONLY || ONLY === 'cut') cut();
  if (!ONLY || ONLY === 'mux') mux();
})();
