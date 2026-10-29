/* The cutscenes' painted panels as prompts for an image model (brief 75): one ready-to-paste prompt for every panel
   with src 'ai', the look and the cast written once at the top so the pictures agree, and the file each one is
   saved as (iron-canopy/art/cut/<art>.jpg). Panels that already have their picture are listed as done.
     node tools/art-prompts.js [--out=file.md|file.txt] [--all] (--all: the done ones too)
   A .txt file is plain text for pasting into a chat with an image model as one long job: the brief first, then
   one numbered panel after another. */
const fs = require('fs');
const path = require('path');
const IC = require('../headless.js');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ALL = process.argv.includes('--all');
const ART = path.join(__dirname, '../iron-canopy/art/cut');

const STYLE = 'Graphic-novel panel: confident black ink line, flat washes of muted colour, heavy shadows, a little paper grain; grounded and realistic, not cartoonish; cinematic 16:9 framing. Keep the subject well inside the frame with about 15% to spare on every side (the game pans and zooms over the picture). No text, letters, captions, speech balloons, logos or watermarks anywhere in the picture.';
const SKIN = ['very fair', 'fair', 'light olive', 'olive', 'brown', 'dark brown'];
const AGE = ['late twenties', 'late thirties', 'late forties', 'about sixty'];
const HAIR = { bob: c => `${c} hair in a chin-length bob`, swept: c => `${c} hair swept back`, bun: c => `${c} hair in a tight bun`, crop: c => `close-cropped ${c} hair`, long: c => `long ${c} hair`, bald: () => 'a shaved head' };
const COAT = { suit: 'a dark suit', blouse: 'a plain blouse', shirt: 'a shirt with rolled sleeves', pilot: 'an airline pilot\'s uniform', uniform: 'a military uniform' };
function hairCol(h) {
  const n = parseInt((h || '#555').slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, L = (r + g + b) / 3;
  if (L > 180) return 'silver'; if (L > 150 && r > b + 30) return 'fair'; if (L > 140) return 'grey'; if (r > g + 25 && L > 70) return 'auburn'; if (L < 40) return 'black'; return 'brown';
}
const looks = (k) => {
  const c = IC.CAST[k], f = c.face || {}, who = IC.ADVISORS[k] || {};
  const fly = f.coat === 'pilot' && /fighter|Air Operations/.test(who.role || '');
  const bits = [`${SKIN[f.skin] || 'fair'} skin`, (HAIR[f.hair] || (c => `${c} hair`))(hairCol(f.hairC)), AGE[f.age || 0], fly ? 'a fighter pilot\'s flight suit' : COAT[f.coat] || ''];
  if (f.glasses) bits.push('glasses'); if (f.beard) bits.push(f.beard === 2 ? 'a short beard' : 'a grey beard');
  return { name: who.name || k, role: who.role || '', text: bits.filter(Boolean).join(', '), bio: c.bio || '' };
};

const out = [];
out.push('# Iron Canopy: prompts for the painted cutscene panels', '');
out.push('Paste one prompt at a time into ChatGPT (or any image model). Save each picture as the file named above its prompt, a JPEG about 1920 × 1080, and drop it in the project folder\'s `cutscenes/art/` (or straight into `iron-canopy/art/cut/`). The game picks a picture up by its name and plays it in place of the storyboard frame, with the same camera moves and words.', '');
out.push('## The look (already in every prompt)', '', STYLE, '');
out.push('## The cast', '', 'Paste a character\'s line into a prompt that shows them, or keep a ChatGPT chat per character so the face stays the same.', '');
const named = {};
for (const k in IC.CAST) { const l = looks(k); named[k] = l; out.push(`- **${l.name}**${l.role ? ` (${l.role})` : ''}: ${l.text}. ${l.bio}`); }
out.push('- **The Director** (you, the narrator): seen from behind or in shadow, never a clear face; a dark coat.', '');

const TITLES = /^(Min\.|Prime|Minister|Gov\.|Gen\.|Col\.|Maj\.|Capt\.|Lt\.|Marshal|President|Chair|Ambassador)$/;
const toks = k => named[k].name.split(' ').filter(w => !TITLES.test(w));
const surname = {}; for (const k in named) { const t = toks(k); if (t.length > 1) surname[t[t.length - 1]] = (surname[t[t.length - 1]] || 0) + 1; }
const TOK = { capCity: 'the capital', town: 'the border town', sister: 'Mira', cap: 'the national airport', H: 'our country', A: 'their country', Hfull: 'our country', Afull: 'their country', leader: 'their leader', ap: 'the airport', cause: 'the weather' };
let todo = 0, done = 0;
const rows = [];
for (const id in IC.CUTSCENES) {
  const C = IC.CUTSCENES[id];
  for (const p of C.panels) {
    if (p.src !== 'ai') continue;
    const have = fs.existsSync(path.join(ART, p.art + '.jpg'));
    if (have) done++; else todo++;
    if (have && !ALL) continue;
    // who is in the picture, by name in the shot line
    const cast = Object.keys(named).filter(k => { const t = toks(k); return p.shot.includes(t[0]) || (t.length > 1 && surname[t[t.length - 1]] === 1 && p.shot.includes(t[t.length - 1])); });
    const mood = (p.cap || '').replace(/\{(\w+)\}/g, (m, k) => TOK[k] || 'there').slice(0, 220);
    rows.push(`### ${p.art}.jpg${have ? ' (done)' : ''}`, `*${C.title}*${p.only ? ` · variant ${p.only}` : ''}`, '', '```',
      `${p.shot}${cast.length ? ' ' + cast.map(k => `${named[k].name}: ${named[k].text}.`).join(' ') : ''} The mood of the moment: "${mood}" ${STYLE}`, '```', '');
  }
}
out.push(`## The panels (${todo} to paint${done ? `, ${done} done` : ''})`, '', ...rows);
const file = arg('out', null);
if (file && /\.txt$/.test(file)) {
  const T = [];
  T.push('IRON CANOPY - PAINTED CUTSCENE PANELS', '', 'THE JOB', `Paint ${todo} panels for the story cutscenes of Iron Canopy, a game about a country's Director of Civil Aviation in the years before and during a war with a neighbour. Work through the panels below in order, one image per panel, then the faces. Each one names the file it is saved as.`, '',
    'RULES FOR EVERY IMAGE', `- ${STYLE}`, '- Landscape 16:9, about 1920 x 1080.', '- The same character must look the same in every panel: use the cast sheet below every time they appear.', '- The Director (the narrator) is only ever seen from behind or in shadow.', '- Before moving on, check the image against its panel: the right people, place, time of day and weather, and no text in the picture. Redo it if not.', '',
    'THE CAST');
  for (const k in named) T.push(`- ${named[k].name}${named[k].role ? ` (${named[k].role})` : ''}: ${named[k].text}. ${named[k].bio}`);
  T.push('- The Director: seen from behind or in shadow, a dark coat.', '', 'THE PANELS', '');
  let n = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i].startsWith('### ')) {
    n++; const name = rows[i].slice(4).replace(' (done)', ''), scene = rows[i + 1].replace(/\*/g, ''), prompt = rows[i + 4];
    T.push(`PANEL ${n} of ${todo} - save as ${name} - scene: ${scene}`, prompt, '');
  }
  // the faces: head-and-shoulders portraits for the cast cards and the balloons
  const faces = Object.keys(IC.CAST).filter(k => !fs.existsSync(path.join(ART, '../faces/face-' + k + '.jpg')));
  T.push('THE FACES', `Then paint ${faces.length} portraits, one per character: head and shoulders, three-quarter view, square (1024 x 1024), the same look as the panels, a plain background (blue-grey for our side, dark plum for the other side).`, '');
  faces.forEach((k, i) => T.push(`FACE ${i + 1} of ${faces.length} - save as face-${k}.jpg - ${named[k].name}`, `Portrait of ${named[k].name}${named[k].role ? `, ${named[k].role}` : ''}: ${named[k].text}. ${named[k].bio} Head and shoulders, three-quarter view, square, plain ${IC.CAST[k].foe ? 'dark plum' : 'blue-grey'} background. ${STYLE}`, ''));
  fs.writeFileSync(file, T.join('\n')); console.log(`${file}: ${todo} prompts, ${faces.length} faces`); process.exit(0);
}
if (file) { fs.writeFileSync(file, out.join('\n')); console.log(`${file}: ${todo} prompts, ${done} done`); } else console.log(out.join('\n'));
