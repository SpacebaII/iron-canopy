/* Iron Canopy — (brief 70) the cast's faces, drawn in code: a bust in flat colours in one house style (a round
   frame, the side's tone behind, shoulders, collar or uniform, head, hair, eyes, glasses, beard, lines of age), as
   an SVG string, cached by person and size. Pure strings: it runs headless, so the tests can check every face. */
(function (IC) {
'use strict';
const SKIN = ['#f3d5bf', '#e9bf9f', '#d6a07c', '#b97f5a', '#8f5b3d', '#6a412b'];
const BG = { home: ['#2a3d52', '#16222f'], foe: ['#4a2630', '#24131a'], ally: ['#1f4a4a', '#102626'] };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
};
const cache = new Map();
/* the face of a cast key, size in px (the drawing is on a 100-unit grid) */
IC.portrait = function (key, size) {
  size = size || 72;
  const ck = key + ':' + size; if (cache.has(ck)) return cache.get(ck);
  const C = IC.CAST[key] || { face: {} }, F = Object.assign({ skin: 2, hairC: '#3a2a20', hair: 'crop', coat: 'suit', coatC: '#2c3e63', age: 1 }, C.face);
  const skin = SKIN[F.skin] || SKIN[2], skinD = shade(skin, 0.86), hair = F.hairC, hairD = shade(hair, 0.8), coat = F.coatC, coatD = shade(coat, 0.75);
  const side = C.foe ? 'foe' : C.ally ? 'ally' : 'home', bg = BG[side], id = 'p' + key;
  const s = [];
  s.push(`<defs><radialGradient id="${id}g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient><clipPath id="${id}c"><circle cx="50" cy="50" r="49"/></clipPath></defs>`);
  s.push(`<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}g)"/>`);
  // hair that falls behind the shoulders
  if (F.hair === 'long') s.push(`<path d="M27 40 Q24 70 30 86 L70 86 Q76 70 73 40 Z" fill="${hairD}"/>`);
  // shoulders and coat
  s.push(`<path d="M8 104 Q10 78 32 72 L68 72 Q90 78 92 104 Z" fill="${coat}"/>`);
  // the neck
  s.push(`<path d="M42 58 L42 74 Q50 79 58 74 L58 58 Z" fill="${skinD}"/>`);
  // collars by coat
  if (F.coat === 'suit') s.push(`<path d="M40 72 L50 90 L60 72 Z" fill="#eef1f3"/><path d="M48 76 L50 74 L52 76 L51 92 L49 92 Z" fill="${shade(coat, 0.55)}"/><path d="M32 72 L40 72 L50 92 L40 104 Z M68 72 L60 72 L50 92 L60 104 Z" fill="${coatD}"/>`);
  else if (F.coat === 'uniform') s.push(`<path d="M38 71 L50 84 L62 71 L58 70 L50 78 L42 70 Z" fill="${coatD}"/><rect x="20" y="75" width="12" height="3" rx="1" fill="#c9a24a"/><rect x="68" y="75" width="12" height="3" rx="1" fill="#c9a24a"/><circle cx="50" cy="90" r="1.6" fill="#c9a24a"/><circle cx="50" cy="98" r="1.6" fill="#c9a24a"/>`);
  else if (F.coat === 'pilot') s.push(`<path d="M30 74 L70 74 L66 104 L34 104 Z" fill="#e9edf0"/><path d="M42 72 L50 82 L58 72 Z" fill="${skinD}"/><path d="M48 80 L52 80 L51 96 L49 96 Z" fill="#1d2532"/><rect x="18" y="76" width="13" height="4" rx="1" fill="#1d2532"/><rect x="19" y="77.3" width="11" height="0.9" fill="#d8b44a"/><rect x="69" y="76" width="13" height="4" rx="1" fill="#1d2532"/><rect x="70" y="77.3" width="11" height="0.9" fill="#d8b44a"/>`);
  else if (F.coat === 'shirt') s.push(`<path d="M40 71 L50 84 L60 71 L64 73 L50 90 L36 73 Z" fill="${shade(coat, 1.25)}"/><path d="M44 72 L50 82 L56 72 Z" fill="${skinD}"/>`);
  else s.push(`<path d="M40 72 Q50 82 60 72 Z" fill="${skinD}"/><path d="M38 72 Q50 86 62 72" fill="none" stroke="${shade(coat, 1.3)}" stroke-width="2"/>`);
  // ears, head
  if (F.hair !== 'long' && F.hair !== 'bob') s.push(`<ellipse cx="30.5" cy="47" rx="3.2" ry="5" fill="${skinD}"/><ellipse cx="69.5" cy="47" rx="3.2" ry="5" fill="${skinD}"/>`);
  s.push(`<path d="M31 40 Q31 22 50 21 Q69 22 69 40 L69 50 Q68 64 50 68 Q32 64 31 50 Z" fill="${skin}"/>`);
  // beard: full, or short
  if (F.beard === 1) s.push(`<path d="M31.5 48 Q33 66 50 70 Q67 66 68.5 48 Q66 58 58 59 Q50 56 42 59 Q34 58 31.5 48 Z" fill="${hair}"/><path d="M44 60 Q50 63 56 60" fill="none" stroke="${shade(skin, 0.6)}" stroke-width="1.2"/>`);
  else if (F.beard === 2) s.push(`<path d="M32 50 Q34 65 50 68 Q66 65 68 50 Q64 60 50 61 Q36 60 32 50 Z" fill="${hair}" opacity=".35"/>`);
  // hair on top
  if (F.hair === 'crop') s.push(`<path d="M30 41 Q29 19 50 18 Q71 19 70 41 Q67 30 60 28 Q50 26 40 28 Q33 30 30 41 Z" fill="${hair}"/>`);
  else if (F.hair === 'swept') s.push(`<path d="M30 42 Q27 17 52 17 Q72 18 70 40 Q68 30 62 27 Q50 31 38 26 Q32 32 30 42 Z" fill="${hair}"/><path d="M38 26 Q50 31 62 27" fill="none" stroke="${hairD}" stroke-width="1.2"/>`);
  else if (F.hair === 'bob') s.push(`<path d="M27 56 Q22 18 50 17 Q78 18 73 56 L67 56 Q69 36 62 29 Q50 33 40 26 Q32 34 33 56 Z" fill="${hair}"/>`);
  else if (F.hair === 'long') s.push(`<path d="M28 52 Q24 17 50 17 Q76 17 72 52 L68 46 Q68 32 60 28 Q48 32 38 27 Q32 34 32 46 Z" fill="${hair}"/>`);
  else if (F.hair === 'bun') s.push(`<circle cx="50" cy="15" r="8" fill="${hairD}"/><path d="M30 42 Q28 19 50 19 Q72 19 70 42 Q68 28 50 27 Q32 28 30 42 Z" fill="${hair}"/>`);
  else if (F.hair === 'bald') s.push(`<path d="M30 46 Q29 36 33 32 L34 44 Z M70 46 Q71 36 67 32 L66 44 Z" fill="${hair}" opacity=".85"/>`);
  // brows, eyes, nose, mouth
  const brow = F.hair === 'bald' ? '#3a3027' : hairD;
  s.push(`<path d="M38 40 Q42 38 46 40 M54 40 Q58 38 62 40" fill="none" stroke="${brow}" stroke-width="1.8" stroke-linecap="round"/>`);
  s.push(`<ellipse cx="42" cy="45" rx="2.1" ry="1.6" fill="#1d1a18"/><ellipse cx="58" cy="45" rx="2.1" ry="1.6" fill="#1d1a18"/>`);
  s.push(`<path d="M50 46 Q48.5 53 50.5 54" fill="none" stroke="${shade(skin, 0.72)}" stroke-width="1.3" stroke-linecap="round"/>`);
  if (F.beard !== 1) s.push(`<path d="M44.5 59 Q50 61.5 55.5 59" fill="none" stroke="${shade(skin, 0.55)}" stroke-width="1.5" stroke-linecap="round"/>`);
  // lines of age
  if (F.age >= 2) s.push(`<path d="M41 33 Q50 31.5 59 33" fill="none" stroke="${shade(skin, 0.8)}" stroke-width=".9"/><path d="M37 50 Q38 54 41 56 M63 50 Q62 54 59 56" fill="none" stroke="${shade(skin, 0.82)}" stroke-width=".8"/>`);
  if (F.age >= 3) s.push(`<path d="M36.5 46 L34.5 47 M63.5 46 L65.5 47" stroke="${shade(skin, 0.75)}" stroke-width=".8"/>`);
  // glasses: round, or square
  if (F.glasses === 1) s.push(`<g fill="none" stroke="#2a2724" stroke-width="1.4"><circle cx="42" cy="45" r="5"/><circle cx="58" cy="45" r="5"/><path d="M47 45 L53 45 M37 44 L32 42 M63 44 L68 42"/></g>`);
  else if (F.glasses === 2) s.push(`<g fill="none" stroke="#1c1c1c" stroke-width="1.6"><rect x="36" y="41.5" width="12" height="7.5" rx="1.5"/><rect x="52" y="41.5" width="12" height="7.5" rx="1.5"/><path d="M48 45 L52 45 M36 44 L32 42 M64 44 L68 42"/></g>`);
  if (F.ear && F.hair === 'bob') s.push(`<circle cx="31" cy="55" r="1.4" fill="#e7c867"/><circle cx="69" cy="55" r="1.4" fill="#e7c867"/>`);
  s.push(`</g><circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>`);
  const out = `<svg class="face" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${(IC.ADVISORS[key] || {}).name || key}">${s.join('')}</svg>`;
  cache.set(ck, out);
  return out;
};
})(window.IC);
