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
  d.addEventListener('click', e => { if (e.target.closest('[data-cut=skip]')) close(); else if (e.target.closest('[data-cut=back]')) go(-1); else go(1); });
  (document.getElementById('app') || document.body).appendChild(d);
  V.el = d;
  return d;
}
const face = (S, k, n) => {
  const key = IC.castWho ? IC.castWho(S, k) : k;
  return IC.portrait && IC.CAST[key] ? IC.portrait(key, n) : '';
};
const who = (S, k) => { const key = IC.castWho ? IC.castWho(S, k) : k; return (IC.ADVISORS[key] || { name: '' }).name; };
function draw() {
  const S = IC.S, p = V.panels[V.i], C = IC.CUTSCENES[V.c.id], d = el();
  const src = `art/cut/${p.art}.jpg`, have = !missing.has(p.art);
  const pic = have ? `<img src="${src}" alt="" draggable="false">` : `<div class="board"><span>Storyboard · ${p.src === '3d' ? 'from the 3D view' : 'painted panel'}</span><p>${esc(p.shot)}</p>${p.say ? face(S, p.say[0], 120) : ''}</div>`;
  d.innerHTML = `<div class="page"><div class="frame${have ? '' : ' sketch'} k${V.i % 3}">${pic}
      ${p.cap ? `<div class="cap">${esc(p.cap)}</div>` : ''}
      ${p.say ? `<div class="say">${face(S, p.say[0], 44)}<div><b>${esc(who(S, p.say[0]))}</b><span>${esc(p.say[1])}</span></div></div>` : ''}</div>
    <div class="cutbar"><small>${esc(C.title)}</small><div class="dots">${V.panels.map((x, j) => `<i class="${j === V.i ? 'on' : j < V.i ? 'past' : ''}"></i>`).join('')}</div>
      <span><button class="btn sm" data-cut="back" ${V.i ? '' : 'disabled'}>Back</button> <button class="btn sm" data-cut="skip">${V.replay ? 'Close' : 'Skip'} <kbd>Esc</kbd></button></span></div></div>`;
  if (have) d.querySelector('img').onerror = () => { missing.add(p.art); if (V.panels[V.i] === p) draw(); };
}
function go(k) {
  if (!V.c) return;
  V.i += k;
  if (V.i < 0) V.i = 0;
  if (V.i >= V.panels.length) return close();
  draw();
  IC.sfx && IC.sfx.ui('click');
}
function close() {
  const S = IC.S;
  if (!V.c) return;
  if (!V.replay && S && S.story) IC.cutDone(S, V.c);
  V.c = null; el().hidden = true;
  if (S && !V.wasPaused) S.paused = false;
  IC.ui && IC.ui.refresh && IC.ui.refresh(true);
}
V.open = function (S, c, replay) {
  V.c = c; V.i = 0; V.replay = !!replay; V.panels = IC.cutPanels(S, c);
  V.wasPaused = S.paused; S.paused = true;
  el().hidden = false;
  IC.ui && IC.ui.closeCine && IC.ui.closeCine();
  draw();
  IC.sfx && IC.sfx.ui('chapter');
};
V.isOpen = () => !!V.c;
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
  else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
})(window.IC);
