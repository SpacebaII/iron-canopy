/* Iron Canopy — (brief 70) the cutscene viewer: a comic page over the whole screen, one framed panel at a time
   with the Director's narration in a caption box and a line of dialogue in a balloon. It pauses the game while it is
   open; a click, Space or → turns the panel, ← goes back, Esc skips the rest. The art is art/cut/<name>.jpg; until a
   panel's picture exists it shows as a storyboard frame: the shot described in pencil, with the speaker's face.
   IC.cutView.open(S, c) also plays a seen one again from the Journal. */
(function (IC) {
'use strict';
const U = IC.U, esc = s => U.esc(s == null ? '' : String(s));
const V = IC.cutView = { el: null, c: null, i: 0, panels: [], wasPaused: false, replay: false };
const missing = new Set();

function el() {
  if (V.el) return V.el;
  const d = document.createElement('div');
  d.id = 'cutv'; d.className = 'cutv'; d.hidden = true;
  d.addEventListener('click', e => {
    const a = e.target.closest('[data-cut=pick]');
    if (a) { pick(a.dataset.v); return; }
    if (e.target.closest('[data-cut=skip]')) close(); else if (e.target.closest('[data-cut=back]')) go(-1); else if (!asking()) go(1);
  });
  (document.getElementById('app') || document.body).appendChild(d);
  V.el = d;
  return d;
}
const face = (S, k, n) => {
  const key = IC.castWho ? IC.castWho(S, k) : k;
  return IC.portrait && IC.CAST[key] ? IC.portrait(key, n) : '';
};
const who = (S, k) => { const key = IC.castWho ? IC.castWho(S, k) : k; return (IC.ADVISORS[key] || { name: '' }).name; };
/* (story v3) a panel on a route the player is not on is passed over; a choice holds the page until it is made */
const shows = (S, p) => !p.if || !IC.sagaIf || IC.sagaIf(S, p.if);
const asking = () => { const p = V.panels[V.i]; return !!(p && p.ask && IC.sagaFlag && IC.sagaFlag(IC.S, p.ask.k) == null); };
function pick(v) {
  const S = IC.S, p = V.panels[V.i];
  if (!p || !p.ask) return;
  IC.sagaPick(S, p.ask.k, v);
  IC.sfx && IC.sfx.ui('ok');
  go(1);
}
const line = (S, x, at) => `<div class="say${x[0] === 'ME' ? ' me' : ''}" style="animation-delay:${at.toFixed(2)}s">${x[0] === 'ME' ? '' : face(S, x[0], 44)}<div><b>${esc(x[0] === 'ME' ? 'You' : who(S, x[0]))}</b><span>${esc(x[1])}</span></div></div>`;
/* the caption comes in word by word, then the balloons one after another (a click shows the rest at once) */
const CAP_AT = 0.3, WORD = 0.035, SAY_GAP = 0.9;
const words = cap => cap.split(/(\s+)/).map((w, i) => /^\s+$/.test(w) ? w : `<span style="animation-delay:${(CAP_AT + (i >> 1) * WORD).toFixed(2)}s">${esc(w)}</span>`).join('');
let shownAt = 0, revealT = 0;
function draw() {
  const S = IC.S, p = V.panels[V.i], C = IC.CUTSCENES[V.c.id], d = el();
  const ghost = IC.cutLife && IC.cutLife.stop();
  const src = `art/cut/${p.art}.jpg`, have = !missing.has(p.art);
  const sp = p.says || (p.say ? [p.say] : []), sp0 = sp.find(x => x[0] !== 'ME');
  const nw = p.cap ? p.cap.split(/\s+/).length : 0, sayAt = nw ? CAP_AT + nw * WORD + 0.35 : 0.5;
  revealT = sayAt + Math.max(0, sp.length - 1) * SAY_GAP + 0.6; shownAt = performance.now();
  const pic = have ? `<img src="${src}" alt="" draggable="false">` : `<div class="board"><span>Storyboard · ${p.src === '3d' ? 'from the 3D view' : 'painted panel'}</span><p>${esc(p.shot)}</p>${sp0 ? face(S, sp0[0], 120) : ''}</div>`;
  const ask = p.ask && IC.sagaFlag && IC.sagaFlag(S, p.ask.k) == null ? `<div class="ask"><b>${esc(p.ask.q)}</b>${p.ask.opts.map(o => `<button class="btn" data-cut="pick" data-v="${esc(o.v)}">${esc(o.t)}</button>`).join('')}</div>` : '';
  d.innerHTML = `<div class="page"><div class="frame${have ? '' : ' sketch'} k${V.i % 3}">${pic}
      ${p.cap ? `<div class="cap">${words(p.cap)}</div>` : ''}
      ${sp.length ? `<div class="says">${sp.map((x, j) => line(S, x, sayAt + j * SAY_GAP)).join('')}</div>` : ''}${ask}</div>
    <div class="cutbar"><small>${esc(C.title)}</small><div class="dots">${V.panels.map((x, j) => `<i class="${j === V.i ? 'on' : j < V.i ? 'past' : ''}"></i>`).join('')}</div>
      <span><button class="btn sm" data-cut="back" ${V.i && !p.ask ? '' : 'disabled'}>Back</button> <button class="btn sm" data-cut="skip">${V.replay ? 'Close' : 'Skip'} <kbd>Esc</kbd></button></span></div></div>`;
  if (have) d.querySelector('img').onerror = () => { missing.add(p.art); if (V.panels[V.i] === p) draw(); };
  const fr = d.querySelector('.frame');
  // the last panel dissolves into this one
  if (ghost) { ghost.className = 'cutghost'; fr.appendChild(ghost); setTimeout(() => ghost.remove(), 900); }
  if (have && IC.cutLife) IC.cutLife.start(fr, p, V.i);
}
/* a click while the words are still coming in shows them all; the next click turns the panel */
function revealing() {
  const fr = V.el && V.el.querySelector('.frame');
  if (!fr || fr.classList.contains('shown') || performance.now() - shownAt > revealT * 1000) return false;
  fr.classList.add('shown');
  return true;
}
function go(k) {
  if (!V.c) return;
  if (k > 0 && revealing()) return;
  const S = IC.S, i0 = V.i;
  V.i += k;
  while (V.i >= 0 && V.i < V.panels.length && !shows(S, V.panels[V.i])) V.i += k < 0 ? -1 : 1;
  if (V.i < 0) { V.i = i0; return; }
  if (V.i >= V.panels.length) return close();
  draw();
  IC.sfx && IC.sfx.ui('click');
}
function close() {
  const S = IC.S;
  if (!V.c) return;
  if (!V.replay && S && S.story) IC.cutDone(S, V.c);
  V.c = null; el().hidden = true;
  IC.cutLife && IC.cutLife.stop();
  if (S && !V.wasPaused) S.paused = false;
  IC.ui && IC.ui.refresh && IC.ui.refresh(true);
}
V.open = function (S, c, replay) {
  V.c = c; V.i = 0; V.replay = !!replay; V.panels = IC.cutPanels(S, c);
  while (V.i < V.panels.length - 1 && !shows(S, V.panels[V.i])) V.i++;
  V.wasPaused = S.paused; S.paused = true;
  el().hidden = false;
  IC.ui && IC.ui.closeCine && IC.ui.closeCine();
  draw();
  IC.sfx && IC.sfx.ui('chapter');
};
V.isOpen = () => !!V.c;
/* a tool's way to one panel, whatever route the story is on (tools/cut-life-clip.js) */
V.goTo = i => { if (V.c && V.panels[i]) { V.i = i; draw(); } };
/* every frame: the next cutscene in the queue opens when nothing else is in front of the map */
V.tick = function (S) {
  if (V.c || !S || !S.story || !S.story.cutQ || !S.story.cutQ.length) return;
  const ui = IC.ui, $ = id => document.getElementById(id);
  if (!ui || ui.room || ui.menu || ($('start') && !$('start').hidden)) return;
  V.open(S, S.story.cutQ[0]);
};
window.addEventListener('keydown', e => {
  if (!V.c) return;
  if (e.key === 'Escape') close();
  else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { if (!asking()) go(1); }
  else if (/^[1-4]$/.test(e.key) && asking()) { const o = V.panels[V.i].ask.opts[+e.key - 1]; if (o) pick(o.v); }
  else if (e.key === 'ArrowLeft') go(-1);
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
})(window.IC);
