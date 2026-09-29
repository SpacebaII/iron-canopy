/* The words on screen, checked. Two parts:
   - the source: every string in iron-canopy/js and the text of index.html, for doubled spaces, a word twice in a
     row, "aircrafts", American spellings the rest of the game does not use, and a space before a comma or full stop;
   - the game: a Career played by the scripted player (careerplayer.js) and a Quick war (qwplayer.js), headless, and
     every log line, card, staff message, decision and news item they wrote, for "undefined", "NaN", "[object
     Object]", "Infinity", "1 minutes" and the same slips as above.
   node tools/textlint.js            both (about a minute)
   node tools/textlint.js --source   only the source (a second; tests/run.js runs this part)
   Exits 1 and prints each problem with where it is. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// what is wrong in any text the player reads
const RULES = [
  [/\bundefined\b/, '"undefined"'],
  [/\bNaN\b/, '"NaN"'],
  [/\[object \w+\]/, '"[object Object]"'],
  [/(^|[^\w.])-?Infinity\b/, '"Infinity"'],
  [/[\w.,;:!?)’”] {2,}[\w(‘“₭]/, 'doubled space'],
  [/\b(the|a|an|and|of|to|in|is|on|for|it)\s+\1\b/i, 'a word twice'],
  [/\baircrafts\b/i, '"aircrafts"'],
  [/\b1 (seconds|minutes|hours|days|weeks|months|years|flights|aircraft\w+|units|blocks|stands|controllers|lorries|trucks|deals|routes|airlines|goals|points|messages|lessons|systems|missiles|kills)\b/, 'a plural after 1'],
  [/\b(defense|offense|color|center|meter|kilometer|airplane)s?\b/i, 'American spelling (the game writes defence, colour, centre, metre, aeroplane or aircraft)'],
  [/\w ,|[a-z] \.(?!\d)/, 'a space before a comma or full stop']
];
const check = (text, where, out) => {
  for (const [re, what] of RULES) if (re.test(text)) out.push(`${where}: ${what}: ${JSON.stringify(text.length > 160 ? text.slice(0, 160) + '…' : text)}`);
};

/* ---------- the source ---------- */
// string literals of a script, with the line they start on; template literals lose their ${…} parts
function strings(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); line += (src.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++]; }
      out.push({ s, line }); i = j + 1; continue;
    }
    if (c === '`') {
      // (nested templates inside ${…} are skipped with it)
      let j = i + 1, s = '', start = line;
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          let d = 1; j += 2;
          while (j < n && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; else if (src[j] === '\n') line++; else if (src[j] === '`') { j++; while (j < n && src[j] !== '`') { if (src[j] === '\n') line++; j++; } } j++; }
          s += '…'; continue;
        }
        if (src[j] === '\n') line++;
        s += src[j++];
      }
      out.push({ s, line: start }); i = j + 1; continue;
    }
    // a regular expression literal: skip it so its quotes are not read as strings
    if (c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && regexStart(src, i)) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      if (src[j] === '/') { i = j + 1; continue; }
    }
    i++;
  }
  return out;
}
// a slash starts a regular expression after an operator or bracket, or after return, not after a value
function regexStart(src, i) {
  let k = i - 1; while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
  if (k < 0 || /[=(,:!&|?;{}[\n+\-*%<>~^]/.test(src[k])) return true;
  return /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, k - 6), k + 1));
}
// the words in a string, without its markup: tags, attribute names, CSS and code-like strings say nothing
// (the text between tags is checked piece by piece: spaces round a tag are the markup's, not the reader's)
const words = s => s.replace(/&\w+;/g, ' ').replace(/\n\s*/g, ' ');
const pieces = s => s.split(/<[^>]*>|\u2026/).map(t => t.trim()).filter(Boolean);
const prose = s => /[A-Za-z]{3,} [A-Za-z]{2,}/.test(s) && !/^[\w.-]+(\s[\w.-]+)*$/.test(s.trim()) || / [a-z]+ [a-z]+ /.test(s);
function lintSource() {
  const out = [];
  const dir = path.join(ROOT, 'iron-canopy/js');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const { s, line } of strings(src)) {
      for (const t of pieces(words(s))) {
        if (!prose(t) || /[{;]\s*[a-z-]+:[^ ]/.test(t)) continue;   // (a style sheet in a string is not prose)
        // (the source's own "defense.js" and friends are file and function names, not words)
        check(t.replace(/\b[\w-]+\.js\b/g, ''), `iron-canopy/js/${f}:${line}`, out);
      }
    }
  }
  const html = fs.readFileSync(path.join(ROOT, 'iron-canopy/index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  html.split('\n').forEach((l, i) => { for (const t of pieces(words(l.replace(/\b(src|href)="[^"]*"/g, '')))) if (prose(t)) check(t, `iron-canopy/index.html:${i + 1}`, out); });
  return out;
}

/* ---------- the game ---------- */
function lintPlay() {
  const IC = require(path.join(ROOT, 'headless.js'));
  const out = [], seen = new Set();
  const take = (S, where) => {
    const texts = [];
    for (const l of S.logs || []) texts.push([`log ${l.tag}`, l.msg]);
    if (S.camp) {
      for (const c of S.camp.cards) texts.push(['card', `${c.title} · ${c.sub} · ${c.text}`]);
      for (const c of S.camp.comms) texts.push([`staff ${c.tag || c.who}`, c.text]);
    }
    for (const n of S.news || []) texts.push(['news', n.text]);
    if (S.story) for (const e of S.story.events) texts.push(['decision', [e.title, e.text].concat((e.opts || e.options || []).map(o => o.label || o.text || '')).join(' · ')]);
    for (const [k, t] of texts) { if (typeof t !== 'string') { out.push(`${where} ${k}: not text: ${JSON.stringify(t)}`); continue; } if (seen.has(t)) continue; seen.add(t); check(t, `${where} ${k}`, out); }
  };
  // the Career, Act I, with the scripted player
  {
    const { player } = require(path.join(ROOT, 'careerplayer.js'));
    const S = IC.newGame({ seed: 20261, mode: 'story', hour: 7 }); IC.S = S;
    let next = 0;
    for (let h = 0; h < 90; h++) {
      const t1 = S.time + 3600;
      while (S.time < t1 && !S.over) { IC.step(S, IC.calmSky(S) ? 8 : 1); if (S.time >= next) { player(S); next = S.time + 64; } }
      take(S, `Career ${IC.U.clock(S.time, S)}`);
    }
  }
  // a Quick war into the war, with the scripted commander
  {
    const Q = require(path.join(ROOT, 'qwplayer.js'));
    const S = IC.newGame({ seed: 20262, mode: 'campaign' }); IC.S = S;
    for (let h = 0; h < 10 && !S.over; h++) {
      for (let i = 0; i < 3600 && !S.over; i++) { IC.step(S, 1); if (i % 120 === 0) Q.commander(S); }
      take(S, `Quick war ${IC.U.clock(S.time, S)}`);
    }
  }
  return out;
}

if (require.main === module) {
  const t0 = Date.now();
  const P = lintSource().concat(process.argv.includes('--source') ? [] : lintPlay());
  for (const p of P) console.log(p);
  console.log(P.length ? `\n${P.length} problem${P.length > 1 ? 's' : ''} in the words on screen` : `The words on screen read clean (${((Date.now() - t0) / 1000).toFixed(0)} s).`);
  process.exit(P.length ? 1 : 0);
}
module.exports = { lintSource, lintPlay, check, RULES };
