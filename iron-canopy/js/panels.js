/* Iron Canopy — the screen's layout (DOM only): panels the player hides, folds and moves, kept in this browser.
   Each panel in IC.HUD_PANELS can be hidden (hide), dragged (move) or both. Moving uses the CSS `translate`
   property, on top of where the stylesheet puts the panel, so every rule that places a panel and every bit of code
   that measures one keeps working. Arrange mode puts a frame over each movable panel to drag. Shift+P hides every
   panel for a clean map. A later panel (a desk, a planner) joins with IC.hud.register({ id, name, el, hide, move }). */
(function (IC) {
'use strict';
const $ = id => document.getElementById(id);
const esc = IC.U.esc;
const KEY = 'ic-layout';
const load = () => { try { return Object.assign({ pos: {}, off: {}, mini: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { pos: {}, off: {}, mini: {} }; } };
const L = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* private mode */ } };

IC.HUD_PANELS = [
  { id: 'left', name: 'Goals and messages', el: '.leftcol', move: true },
  { id: 'goals', name: 'Goals and situation', el: '#brief', hide: true },
  { id: 'comms', name: 'Staff messages', el: '#comms', hide: true },
  { id: 'feed', name: 'News line', el: '#feed', hide: true },
  { id: 'airpic', name: 'Air picture', el: '#airpic', hide: true },
  { id: 'arsenal', name: 'Arsenal', el: '#arsenal', hide: true, move: true },
  { id: 'insp', name: 'Selection panel', el: '#insp', move: true },
  { id: 'mapbox', name: 'Map controls', el: '#mapbox', hide: true, move: true },
  { id: 'rail', name: 'Rooms', el: '#rail', hide: true, move: true }
];
const hud = IC.hud = { L, arrange: false, menu: false };
hud.register = p => { if (!IC.HUD_PANELS.some(q => q.id === p.id)) IC.HUD_PANELS.push(p); };
const elOf = p => typeof p.el === 'string' ? document.querySelector(p.el) : p.el;
let S = null;

/* what a lesson or a tutorial points at stays on screen, whatever the player hid */
function wanted() {
  const N = S && IC.tutorNow && IC.tutorNow(S), el = N && N.step && N.step.el && IC.hint && IC.hint.find(N.step.el);
  return el || null;
}
const shown = p => { const e = elOf(p); return e && e.offsetParent !== null && e.getBoundingClientRect().height > 4; };

// the minimap: on by default in a war, off in the Career, remembered for each
const miniKey = () => S && S.mode === 'story' ? 'story' : 'war';
hud.bind = function (st) {
  S = st; hud.arrange = false; hud.menu = false;
  const k = miniKey(); IC.ui.miniOn = L.mini[k] != null ? L.mini[k] : k !== 'story';
};

hud.apply = function (st) {
  S = st; const app = $('app'); if (!app) return;
  // how much of the map shows through the panels (a hovered panel is solid again, app.css)
  const pa = String(L.alpha || 0.8); if (document.documentElement.style.getPropertyValue('--pa') !== pa) document.documentElement.style.setProperty('--pa', pa);
  const ui = IC.ui, want = wanted(), clean = !!L.clean && !hud.arrange;
  // the top of the panels follows the top bar, one row or two
  const tb = [document.querySelector('.tb-left'), document.querySelector('.tb-right')].map(e => e ? e.getBoundingClientRect().bottom : 0);
  const ab = app.getBoundingClientRect(), top = Math.max(...tb) - ab.top;
  if (top > 20) app.style.setProperty('--top', Math.round(top + 14) + 'px');
  for (const p of IC.HUD_PANELS) {
    const e = elOf(p); if (!e) continue;
    const need = want && (e === want || e.contains(want));
    e.classList.toggle('hud-off', !need && ((p.hide && !!L.off[p.id]) || (clean && p.id !== 'insp')));
    const d = L.pos[p.id];
    e.classList.toggle('hud-moved', !!(p.move && d));
    e.style.translate = p.move && d ? `${d[0]}px ${d[1]}px` : '';
  }
  // the layers' chips fold behind one button
  const lb = $('layersBtn'), nOn = S && S.layers ? Object.keys(S.layers).filter(k => S.layers[k] && IC.layerAllowed(S, k)).length : 0;
  const lOpen = !!L.layers || !!(want && $('layers') && $('layers').contains(want));
  app.classList.toggle('layers-open', lOpen);
  if (lb) { lb.setAttribute('aria-pressed', String(lOpen)); const t = `Layers${nOn ? ` · ${nOn}` : ''}`; if (lb.textContent !== t) lb.textContent = t; }
  const k = miniKey(); if (S && L.mini[k] !== !!ui.miniOn) { L.mini[k] = !!ui.miniOn; save(); }
  // with the selection panel short enough, the map controls keep their corner instead of stepping aside
  const ins = $('insp'), mb = $('mapbox');
  if (ins && mb && ins.innerHTML) {
    const ir = ins.getBoundingClientRect(), mh = mb.getBoundingClientRect().height;
    app.classList.toggle('insp-clear', ir.bottom < ab.bottom - 12 - mh - 10);
  } else app.classList.remove('insp-clear');
  $('hudBtn') && $('hudBtn').classList.toggle('on', hud.menu || hud.arrange || !!L.clean);
  // a story card beside the goals moves down as the goals grow, never over them
  for (const id of ['cine', 'evcard']) {
    const cn = $(id); if (!cn || cn.hidden || !cn.classList.contains('side')) continue;
    if (id === 'cine' && ui.cineCur && ui.placeCard) ui.placeCard(cn, ui.cineCur);
    // a card that would run down over the arsenal goes to the right side instead
    const cr = cn.getBoundingClientRect(), ar = $('arsenal'), arr = ar && !ar.classList.contains('hud-off') && ar.innerHTML ? ar.getBoundingClientRect() : null;
    if (arr && arr.height && cr.bottom > arr.top - 8 && cr.left < arr.right && cn.style.left !== 'auto') { cn.style.left = 'auto'; cn.style.right = Math.round((ui.mapRight || 0) + 12) + 'px'; cn.style.top = 'var(--top)'; }
  }
  // with every panel hidden, one quiet line says how to bring them back
  let hc = $('hudclean');
  if (clean && !hc) { hc = document.createElement('button'); hc.id = 'hudclean'; hc.className = 'hudclean'; hc.dataset.hud = 'clean'; hc.innerHTML = 'Panels hidden · <kbd>Shift+P</kbd> brings them back'; app.appendChild(hc); }
  if (hc) hc.hidden = !clean;
  keepOn();
  menu();
};

/* a moved panel never ends up off the screen (a smaller window, a different game) */
function keepOn() {
  const ab = $('app').getBoundingClientRect();
  for (const p of IC.HUD_PANELS) {
    const d = L.pos[p.id]; if (!p.move || !d) continue;
    const e = elOf(p); if (!e || !shown(p)) continue;
    const r = e.getBoundingClientRect(), m = 8;
    let dx = 0, dy = 0;
    if (r.right > ab.right - m) dx = ab.right - m - r.right; if (r.left + dx < ab.left + m) dx = ab.left + m - r.left;
    if (r.bottom > ab.bottom - m) dy = ab.bottom - m - r.bottom; if (r.top + dy < ab.top + m) dy = ab.top + m - r.top;
    if (dx || dy) { d[0] += dx; d[1] += dy; e.style.translate = `${d[0]}px ${d[1]}px`; }
  }
}

/* ---------- the Panels menu, under its button in the top bar ---------- */
function menu() {
  let el = $('hudmenu');
  if (!hud.menu) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'hudmenu'; el.className = 'hudmenu glass'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Panels'); $('app').appendChild(el); }
  el.hidden = false;
  const rows = IC.HUD_PANELS.filter(p => p.hide && (elOf(p) && (elOf(p).innerHTML || p.id === 'mapbox' || p.id === 'rail'))).map(p =>
    `<button class="hm-row" data-hud="tog" data-v="${p.id}" aria-pressed="${!L.off[p.id]}"><i></i>${esc(p.name)}</button>`).join('');
  const mini = S && !S.range ? `<button class="hm-row" data-hud="mini" aria-pressed="${!!IC.ui.miniOn}"><i></i>Minimap</button>` : '';
  const pct = Math.round((1 - (L.alpha || 0.8)) * 100);
  const html = `<h4>On the screen</h4>${rows}${mini}
    <label class="hm-alpha" title="How much of the map shows through the panels. A panel under the mouse turns solid so it reads easily.">See-through<input type="range" min="0" max="50" step="5" value="${pct}" data-hud="alpha"><b>${pct}%</b></label>
    <div class="hm-acts"><button class="btn sm" data-hud="arrange">Move panels</button><button class="btn sm" data-hud="clean">${L.clean ? 'Show panels' : 'Hide all'} <kbd>Shift+P</kbd></button><button class="btn sm ghost" data-hud="reset" title="Every panel back where it started, all shown">Reset</button></div>
    <p class="hm-note">Click a panel's title to fold it. Where you put things is kept in this browser.</p>`;
  // (not rebuilt while the slider is held: the drag would be lost)
  if (el._h !== html && !el.contains(document.activeElement && document.activeElement.type === 'range' ? document.activeElement : null)) { el.innerHTML = html; el._h = html; }
  const b = $('hudBtn'), ab = $('app').getBoundingClientRect();
  if (b) { const r = b.getBoundingClientRect(); el.style.top = Math.round(r.bottom - ab.top + 8) + 'px'; el.style.right = Math.max(12, Math.round(ab.right - r.right - 40)) + 'px'; }
}

/* ---------- arrange mode: a frame over each panel, dragged by the player ---------- */
let frames = null, drag = null, raf = 0;
function arrangeOn(on) {
  hud.arrange = on; hud.menu = false;
  if (frames) { frames.remove(); frames = null; }
  cancelAnimationFrame(raf);
  if (on) {
    frames = document.createElement('div'); frames.id = 'hudframes'; frames.className = 'hudframes';
    frames.innerHTML = `<div class="hf-bar glass"><b>Move panels</b><span>Drag a panel where you want it. It stays there in every game.</span><button class="btn sm ghost" data-hud="reset">Reset</button><button class="btn sm primary" data-hud="done">Done <kbd>Esc</kbd></button></div>`;
    $('app').appendChild(frames);
    const tick = () => { place(); raf = requestAnimationFrame(tick); };
    tick();
  }
  IC.ui.refresh(true);
}
function place() {
  if (!frames) return;
  const ab = $('app').getBoundingClientRect();
  for (const p of IC.HUD_PANELS) {
    if (!p.move) continue;
    let f = frames.querySelector(`[data-p="${p.id}"]`);
    const vis = shown(p);
    if (!vis) { if (f) f.hidden = true; continue; }
    if (!f) { f = document.createElement('div'); f.className = 'hf'; f.dataset.p = p.id; f.innerHTML = `<span>${esc(p.name)}</span>${p.hide ? `<button class="btn sm ghost" data-hud="tog" data-v="${p.id}" title="Hide it (bring it back from the Panels menu)">Hide</button>` : ''}`; frames.appendChild(f); }
    f.hidden = false;
    const r = elOf(p).getBoundingClientRect();
    f.style.left = (r.left - ab.left) + 'px'; f.style.top = (r.top - ab.top) + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
    f.classList.toggle('drag', !!(drag && drag.p === p));
  }
}
document.addEventListener('pointerdown', e => {
  const f = e.target.closest && e.target.closest('.hf'); if (!f || e.target.closest('button')) return;
  const p = IC.HUD_PANELS.find(q => q.id === f.dataset.p); if (!p) return;
  const d = L.pos[p.id] || [0, 0], el = elOf(p);
  drag = { p, x: e.clientX, y: e.clientY, d0: d.slice(), r: el.getBoundingClientRect() };
  f.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const ab = $('app').getBoundingClientRect(), r = drag.r, m = 8;
  // kept inside the screen as it is dragged
  const dx = Math.max(ab.left + m - r.left, Math.min(ab.right - m - r.right, e.clientX - drag.x));
  const dy = Math.max(ab.top + m - r.top, Math.min(ab.bottom - m - r.bottom, e.clientY - drag.y));
  L.pos[drag.p.id] = [Math.round(drag.d0[0] + dx), Math.round(drag.d0[1] + dy)];
  const el = elOf(drag.p); el.style.translate = `${L.pos[drag.p.id][0]}px ${L.pos[drag.p.id][1]}px`; el.classList.add('hud-moved');
});
document.addEventListener('pointerup', () => { if (!drag) return; const d = L.pos[drag.p.id]; if (d && !d[0] && !d[1]) delete L.pos[drag.p.id]; drag = null; save(); });

/* ---------- the buttons ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-hud]');
  if (!b) { if (hud.menu && !(e.target.closest && e.target.closest('#hudmenu'))) { hud.menu = false; menu(); } return; }
  const a = b.dataset.hud, v = b.dataset.v;
  if (a === 'menu') hud.menu = !hud.menu;
  else if (a === 'tog') { if (L.off[v]) delete L.off[v]; else L.off[v] = 1; L.clean = false; }
  else if (a === 'mini') IC.ui.miniOn = !IC.ui.miniOn;
  else if (a === 'layers') L.layers = !L.layers;
  else if (a === 'clean') { L.clean = !L.clean; hud.menu = false; }
  else if (a === 'arrange') { arrangeOn(true); return; }
  else if (a === 'done') { arrangeOn(false); return; }
  else if (a === 'alpha') return;
  else if (a === 'alphaSet') L.alpha = Math.round((1 - v / 100) * 100) / 100;
  else if (a === 'reset') { L.pos = {}; L.off = {}; L.clean = false; L.layers = false; delete L.alpha; for (const p of IC.HUD_PANELS) { const el = elOf(p); if (el) el.style.translate = ''; } }
  save();
  if (S) IC.ui.refresh(true);
});
document.addEventListener('input', e => {
  if (!e.target.matches || !e.target.matches('[data-hud="alpha"]')) return;
  L.alpha = Math.round((1 - e.target.value / 100) * 100) / 100; save();
  document.documentElement.style.setProperty('--pa', String(L.alpha));
  const b = e.target.parentNode.querySelector('b'); if (b) b.textContent = e.target.value + '%';
});
// (before the game's own keys: Esc closes the menu or ends arranging first)
window.addEventListener('keydown', e => {
  if (!S || (e.target.closest && e.target.closest('input,textarea'))) return;
  if (e.key === 'Escape' && (hud.arrange || hud.menu)) { e.stopImmediatePropagation(); e.preventDefault(); if (hud.arrange) arrangeOn(false); else { hud.menu = false; IC.ui.refresh(true); } return; }
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p' && $('start') && $('start').hidden) {
    e.stopImmediatePropagation(); e.preventDefault(); L.clean = !L.clean; save(); IC.ui.refresh(true);
  }
}, true);
})(window.IC);
