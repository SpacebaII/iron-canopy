/* Iron Canopy — (briefs 70 and 75) the cutscene player: a comic page over the whole screen, played as a scene.
   The timeline (cutscript.js) says how long each panel holds, how the camera moves over its picture, the weather
   and light over it, when the Director's caption types in and the balloon pops, the flashes and shakes, and how one
   panel gives way to the next. A panel with a stage plays a 3D shot instead: the replay window (replay3d.js) opened
   in film mode on the staged record, inside the frame, its clock and film camera driven from here; until the scene
   is built, or if it cannot be, the panel's picture shows. The art is art/cut/<name>.jpg; a panel with no picture
   yet shows as a storyboard frame (the shot described in pencil, with the speaker's face), moved the same way.
   It pauses the game while it is open and plays by itself; a click or Space finishes the words or turns to the next
   panel, ← goes back, P pauses, Esc skips the rest. Everything runs on performance.now and animation frames, so
   film.js's held clock records it frame by frame (tools/cut-clip.js). IC.cutView.open(S, c, replay) plays a seen
   one again from the Journal. */
(function (IC) {
'use strict';
const U = IC.U, esc = s => U.esc(s == null ? '' : String(s));
const MO = () => IC.CUTMO;
const V = IC.cutView = { el: null, c: null, TL: null, t: 0, playing: true, wasPaused: false, replay: false, cur: -1, last: 0, raf: 0, fired: new Set(), stage: null, v3: null, shake: 0, flash: 0, flashCol: '#fff' };
const missing = new Set();
const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRANS = 0.7;   // seconds a transition takes

function el() {
  if (V.el) return V.el;
  const d = document.createElement('div');
  d.id = 'cutv'; d.className = 'cutv'; d.hidden = true;
  d.innerHTML = `<div class="page">
      <div class="frame" data-c="frame">
        <div class="layer" data-c="L0"></div><div class="layer" data-c="L1"></div>
        <div class="host3d" data-c="host"></div>
        <canvas class="fxc" data-c="fx"></canvas>
        <div class="bars"><i></i><i></i></div>
        <div class="cap" data-c="cap" hidden></div>
        <div class="say" data-c="say" hidden></div>
        <div class="flash" data-c="flash"></div>
        <div class="titlecard" data-c="title" hidden></div>
        <div class="paused" data-c="paused" hidden>Paused · P to go on</div>
      </div>
      <div class="cutbar"><small data-c="name"></small><div class="prog"><b data-c="prog"></b></div>
        <span><button class="btn sm" data-cut="back">Back</button> <button class="btn sm" data-cut="pause">Pause</button> <button class="btn sm" data-cut="skip" data-c="skip">Skip <kbd>Esc</kbd></button></span></div></div>`;
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-cut]');
    if (b) { const a = b.dataset.cut; if (a === 'skip') close(); else if (a === 'back') back(); else if (a === 'pause') pause(); return; }
    next();
  });
  (document.getElementById('app') || document.body).appendChild(d);
  V.el = d;
  return d;
}
const $c = k => V.el.querySelector(`[data-c="${k}"]`);
const face = (S, k, n) => { const key = IC.castWho ? IC.castWho(S, k) : k; return IC.portrait && IC.CAST[key] ? IC.portrait(key, n) : ''; };
const who = (S, k) => { const key = IC.castWho ? IC.castWho(S, k) : k; return (IC.ADVISORS[key] || { name: '' }).name; };

/* ---------- a panel's picture in a layer ---------- */
function fill(L, sh) {
  const S = IC.S, have = !missing.has(sh.art);
  L.dataset.art = sh.art; L.className = 'layer' + (have ? '' : ' sketch') + (sh.fx.includes('night') ? ' night' : '') + (sh.fx.includes('memory') ? ' memory' : '');
  L.innerHTML = have ? `<img src="art/cut/${sh.art}.jpg" alt="" draggable="false">`
    : `<div class="board"><span>Storyboard · ${sh.src === '3d' ? 'from the 3D view' : 'painted panel'}</span><p>${esc(sh.shot)}</p>${sh.say ? face(S, sh.say[0], 120) : ''}</div>`;
  if (have) L.querySelector('img').onerror = () => { missing.add(sh.art); if (L.dataset.art === sh.art) fill(L, sh); };
}
/* the camera over a layer: zoom s round the point x, y (0..1), never showing past the picture's edge */
function place(L, cam, sx, sy) {
  const f = $c('frame'), W = f.clientWidth, H = f.clientHeight, s = Math.max(1, cam.s);
  const tx = U.clamp((0.5 - cam.x) * W * s, -(s - 1) * W / 2, (s - 1) * W / 2) + sx, ty = U.clamp((0.5 - cam.y) * H * s, -(s - 1) * H / 2, (s - 1) * H / 2) + sy;
  L.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
}

/* ---------- the 3D stage ---------- */
function stageOff() {
  if (!V.v3) { V.stage = null; return; }
  const v = V.v3; V.v3 = null; V.stage = null;
  if (IC.replayState && IC.replayState() === v) IC.replayClose();
  const app = document.getElementById('app') || document.body;
  if (v.el && v.el.parentNode !== app) app.appendChild(v.el);
  $c('host').style.opacity = 0;
}
function stageOn(sh) {
  const S = IC.S, want = sh.stage;
  if (!want || !IC.cutStage || !IC.replayOpen) return stageOff();
  if (V.stage && V.stage.id === want.id) return;
  stageOff();
  let G = null;
  try { G = IC.cutStage(S, want.id, V.c.d, want); } catch (e) { console.warn('cutscene stage', e); }
  if (!G) return;
  V.stage = G; V.stage.first = sh.i;
  const v = V.v3 = IC.replayOpen(G.S, { x: G.at.x, y: G.at.y, t: G.parts[0].t0, r: 160, cam: 'orbit' });
  if (!v) { V.stage = null; return; }
  v.slowmo = false; v.playing = false; v.labels = false; v.trails = false;
  if (IC.replayFilm) IC.replayFilm(v, true);
  $c('host').appendChild(v.el);
  v.el.classList.add('cutstage');
  v.shotI = -1;
}
/* every frame of a staged panel: the replay's clock and its film shot follow the cutscene's */
function stageTick(sh, k) {
  const G = V.stage, v = V.v3; if (!G || !v) return 0;
  const part = G.parts[Math.min(G.parts.length - 1, (sh.stage.part || 0))];
  // a panel that holds longer than its part plays it slower (never below 0.6×), then holds the last moment
  const t = part.t0 + Math.min(part.dur + 2, k * Math.max(0.6, Math.min(1, part.dur / sh.dur)));
  v.t = Math.min(t, v.t1); v.playing = false;
  let i = -1; for (let j = 0; j < G.shots.length; j++) if (G.shots[j].t0 <= v.t + 1e-6) i = j;
  if (i !== v.shotI && i >= 0 && v.camera) { v.shotI = i; IC.replayShot(v, G.shots[i]); }
  // the scene shows once it is built and has drawn
  return v.camera && v.scene && v.renderer ? 1 : 0;
}

/* ---------- the weather and light over the picture: stateless particles, so a held clock draws them the same ---------- */
let grain = null;
function grainTile() {
  if (grain) return grain;
  grain = document.createElement('canvas'); grain.width = grain.height = 128;
  const g = grain.getContext('2d'), im = g.createImageData(128, 128);
  for (let i = 0; i < im.data.length; i += 4) { const n = (Math.sin(i * 12.9898) * 43758.5453) % 1; const c = Math.abs(n) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = c; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return grain;
}
const fr = x => x - Math.floor(x);
const rnd = i => fr(Math.sin(i * 127.1 + 311.7) * 43758.5453);
function drawFx(sh, k, T, a, in3d) {
  const cv = $c('fx'), f = $c('frame'), W = f.clientWidth, H = f.clientHeight;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  if (!sh) return;
  const fx = sh.fx, still = reduce();
  g.globalAlpha = a;
  if (fx.includes('glow')) {
    const p = 0.75 + 0.25 * Math.sin(T * 0.7), gr = g.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.7);
    gr.addColorStop(0, `rgba(255,190,110,${0.32 * p})`); gr.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (fx.includes('fog')) for (let i = 0; i < 3; i++) {
    const x = W * fr(rnd(i) + T * (0.012 + i * 0.005)) * 1.6 - W * 0.3, y = H * (0.3 + 0.25 * i), r = W * 0.45;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(200,205,210,0.22)'); gr.addColorStop(1, 'rgba(200,205,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (fx.includes('rain') && !still) {
    g.strokeStyle = 'rgba(190,205,225,0.45)'; g.lineWidth = 1.1; g.beginPath();
    for (let i = 0; i < 170; i++) { const sp = 1.4 + rnd(i + 3) * 0.9, x = W * fr(rnd(i) + T * 0.05), y = H * fr(rnd(i + 1) + T * sp) * 1.1 - H * 0.05; g.moveTo(x, y); g.lineTo(x - 5, y + 22 + rnd(i) * 14); }
    g.stroke();
  }
  if (fx.includes('snow') && !still) {
    g.fillStyle = 'rgba(245,248,255,0.85)';
    for (let i = 0; i < 140; i++) { const s = 1 + rnd(i + 7) * 2.4, x = W * fr(rnd(i) + 0.03 * Math.sin(T * 0.8 + i) + T * 0.01), y = H * fr(rnd(i + 2) + T * (0.05 + rnd(i) * 0.06)); g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
  }
  if (fx.includes('embers') && !still) {
    for (let i = 0; i < 60; i++) {
      const life = fr(rnd(i + 5) + T * (0.12 + rnd(i) * 0.1)), x = W * fr(rnd(i) + 0.04 * Math.sin(T + i)), y = H * (1.05 - life * 0.9), s = 1 + rnd(i + 9) * 2.6;
      g.fillStyle = `rgba(255,${120 + Math.round(rnd(i) * 80)},40,${(1 - life) * 0.9})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    const gr = g.createLinearGradient(0, H, 0, H * 0.45); gr.addColorStop(0, `rgba(255,90,20,${0.22 + 0.06 * Math.sin(T * 5)})`); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (fx.includes('dust') && !still) {
    g.fillStyle = 'rgba(220,205,180,0.35)';
    for (let i = 0; i < 70; i++) { const x = W * fr(rnd(i) + T * 0.008 * (1 + rnd(i + 4))), y = H * fr(rnd(i + 2) + 0.02 * Math.sin(T * 0.5 + i)); g.fillRect(x, y, 1.6, 1.6); }
  }
  if (fx.includes('scan')) {
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const yb = H * fr(T * 0.25); const gr = g.createLinearGradient(0, yb - 40, 0, yb + 40); gr.addColorStop(0, 'rgba(120,255,160,0)'); gr.addColorStop(0.5, 'rgba(120,255,160,0.08)'); gr.addColorStop(1, 'rgba(120,255,160,0)'); g.fillStyle = gr; g.fillRect(0, yb - 40, W, 80);
  }
  if (fx.includes('strobe')) {
    const blue = Math.sin(T * 9) > 0, gr = g.createRadialGradient(blue ? 0 : W, H * 0.6, 0, blue ? 0 : W, H * 0.6, W * 0.55);
    gr.addColorStop(0, blue ? 'rgba(60,120,255,0.28)' : 'rgba(255,60,50,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // the film over everything: a vignette, darker at night, and grain
  const night = fx.includes('night'), vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${night ? 0.7 : 0.45})`); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.globalAlpha = a * (in3d ? 0.015 : 0.035); g.globalCompositeOperation = 'overlay';
  const gt = grainTile(), ox = Math.floor(rnd(Math.floor(T * 24)) * 128), oy = Math.floor(rnd(Math.floor(T * 24) + 1) * 128);
  g.fillStyle = g.createPattern(gt, 'repeat'); g.translate(-ox, -oy); g.fillRect(ox, oy, W, H); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/* ---------- the words ---------- */
function words(sh, k) {
  const S = IC.S, cap = $c('cap'), say = $c('say');
  const nc = IC.cutTyped(sh, k, 'cap'), ns = IC.cutTyped(sh, k, 'say');
  const bc = sh.beats.find(b => b.k === 'cap'), bs = sh.beats.find(b => b.k === 'say');
  const capOn = !!(sh.cap && bc && k >= bc.t), sayOn = !!(sh.say && bs && k >= bs.t);
  cap.hidden = !capOn; say.hidden = !sayOn;
  const pop = (e, b) => { const a = U.clamp((k - b.t) / 0.35, 0, 1); e.style.opacity = a.toFixed(3); e.style.transform = a < 1 ? `translateY(${((1 - a) * 8).toFixed(1)}px) scale(${(0.96 + 0.04 * a).toFixed(3)})` : ''; };
  if (capOn) pop(cap, bc); if (sayOn) pop(say, bs);
  if (capOn) {
    if (cap.dataset.i !== String(sh.i)) { cap.dataset.i = sh.i; cap.innerHTML = `<span class="on"></span><span class="off">${esc(sh.cap)}</span>`; cap.dataset.n = -1; }
    const on = cap.firstChild, off = cap.lastChild;
    if (+cap.dataset.n !== nc) { cap.dataset.n = nc; on.textContent = sh.cap.slice(0, nc); off.textContent = sh.cap.slice(nc); }
  }
  if (sayOn) {
    if (say.dataset.i !== String(sh.i)) { say.dataset.i = sh.i; say.innerHTML = `${face(S, sh.say[0], 44)}<div><b>${esc(who(S, sh.say[0]))}</b><span><span class="on"></span><span class="off">${esc(sh.say[1])}</span></span></div>`; say.dataset.n = -1; }
    const sp = say.querySelector('div > span'), on = sp.firstChild, off = sp.lastChild;
    if (+say.dataset.n !== ns) { say.dataset.n = ns; on.textContent = sh.say[1].slice(0, ns); off.textContent = sh.say[1].slice(ns); }
  }
  // a picture with no art yet keeps the words clear of the pencil
  $c('frame').classList.toggle('sketchy', missing.has(sh.art) && !V.v3on);
}
/* when the words of a shot are all out: the time into it */
const wordsDone = sh => {
  let k = 0;
  for (const b of sh.beats) if (b.k === 'cap' && sh.cap) k = Math.max(k, b.t + sh.cap.length / MO().type); else if (b.k === 'say' && sh.say) k = Math.max(k, b.t + sh.say[1].length / MO().type);
  return k;
};

/* ---------- the frame loop ---------- */
function enter(sh, prev) {
  // the new picture goes in the other layer, under the old one, which stays on top while it gives way
  const A = $c('L0'), B = $c('L1'), top = V.curL || null, under = top === A ? B : A;
  fill(under, sh); under.style.zIndex = '1'; under.style.opacity = '1'; under.style.clipPath = '';
  if (top) { top.style.zIndex = '2'; if (!prev) top.style.opacity = '0'; }
  V.curL = under;
  V.top = top; V.under = under; V.prevSh = prev;
  stageOn(sh);
  V.v3on = 0;
  if (!V.replay && IC.sfx && IC.sfx.ui) { try { if (sh.trans === 'flash') IC.sfx.ui('alert'); } catch (e) {} }
}
function frame(now) {
  V.raf = 0;
  if (!V.c) return;
  const dt = Math.min(0.1, Math.max(0, (now - V.last) / 1000)); V.last = now;
  if (V.playing) V.t += dt;
  const TL = V.TL, T = V.t, still = reduce();
  if (T >= TL.total + 0.6) return close();
  // the title card, then the panels
  const tc = $c('title'), tin = U.clamp((T + MO().title) / 0.8, 0, 1);
  tc.hidden = T >= 0;
  if (T < 0) { tc.style.opacity = U.clamp(-T / 0.6, 0, 1).toFixed(3); tc.lastChild.style.opacity = tin.toFixed(3); tc.lastChild.style.letterSpacing = `${(0.3 - 0.12 * tin).toFixed(3)}em`; }
  const p = IC.cutAt(TL, Math.max(0, T)), sh = p.sh, k = T < 0 ? 0 : p.k;
  if (sh.i !== V.cur) { const prev = V.cur >= 0 ? TL.shots[V.cur] : null; V.cur = sh.i; enter(sh, prev); for (const b of sh.beats) V.fired.delete(sh.i + ':' + b.t + b.k); }
  // beats: flashes and shakes, once each
  for (const b of sh.beats) {
    const key = sh.i + ':' + b.t + b.k; if (k < b.t || V.fired.has(key)) continue; V.fired.add(key);
    if (b.k === 'flash') { V.flash = b.a || 1; V.flashCol = b.c || '#fff'; }
    else if (b.k === 'shake' && !still) V.shake = Math.max(V.shake, b.a || 1);
    else if (b.k === 'sfx' && IC.sfx && IC.sfx.ui) { try { IC.sfx.ui(b.s); } catch (e) {} }
  }
  // the transition from the last panel
  const tk = U.clamp(k / TRANS, 0, 1), top = V.top, under = V.under;
  if (top && V.prevSh) {
    const tr = sh.trans;
    if (tr === 'cut' || still) top.style.opacity = '0';
    else if (tr === 'slide') { top.style.opacity = '1'; top.style.clipPath = `inset(0 ${(tk * 100).toFixed(1)}% 0 0)`; }
    else if (tr === 'dip') { top.style.opacity = U.clamp(1 - tk * 2, 0, 1).toFixed(3); under.style.opacity = U.clamp(tk * 2 - 1, 0, 1).toFixed(3); }
    else top.style.opacity = (1 - tk).toFixed(3);
    if (tr === 'flash' && k < 0.08 && !V.fired.has(sh.i + 'tf')) { V.fired.add(sh.i + 'tf'); V.flash = 0.9; V.flashCol = '#fff'; }
    if (tk >= 1) { top.style.opacity = '0'; top.style.clipPath = ''; }
  } else if (top) top.style.opacity = '0';
  // the camera over the picture, and the shake
  V.shake *= Math.exp(-dt * 4); if (V.shake < 0.01) V.shake = 0;
  const sx = V.shake ? (rnd(Math.floor(T * 60)) - 0.5) * 18 * V.shake : 0, sy = V.shake ? (rnd(Math.floor(T * 60) + 7) - 0.5) * 12 * V.shake : 0;
  const cam = still ? { x: sh.cam.x0, y: sh.cam.y0, s: sh.cam.s0 } : IC.cutCam(sh, k);
  place(under, cam, sx, sy);
  if (top && V.prevSh && top.style.opacity !== '0') { const pc = still ? { x: V.prevSh.cam.x1, y: V.prevSh.cam.y1, s: V.prevSh.cam.s1 } : IC.cutCam(V.prevSh, V.prevSh.dur + k); place(top, pc, sx, sy); }
  // the 3D stage fades in over the picture once it draws
  if (sh.stage && V.v3) {
    const ok = stageTick(sh, k); V.v3on = ok ? Math.min(1, V.v3on + dt * 2.5) : 0;
    const h = $c('host'); h.style.opacity = V.v3on.toFixed(3); h.style.transform = sx || sy ? `translate(${sx}px,${sy}px)` : '';
  } else if (V.v3 && !sh.stage) stageOff();
  // the flash
  V.flash *= Math.exp(-dt * 5); if (V.flash < 0.01) V.flash = 0;
  const fl = $c('flash'); fl.style.opacity = V.flash.toFixed(3); fl.style.background = V.flashCol;
  drawFx(sh, k, T, T < 0 ? 0 : 1, V.v3on > 0.5);
  words(sh, k);
  $c('prog').style.width = `${U.clamp(T / TL.total, 0, 1) * 100}%`;
  $c('paused').hidden = V.playing;
  V.raf = requestAnimationFrame(frame);
}

/* ---------- the controls ---------- */
function next() {
  if (!V.c) return;
  if (V.t < 0) { V.t = 0; return; }
  const p = IC.cutAt(V.TL, V.t), sh = p.sh, done = wordsDone(sh);
  if (p.k < done - 0.05) V.t = sh.t0 + done;
  else if (sh.i + 1 < V.TL.shots.length) V.t = V.TL.shots[sh.i + 1].t0;
  else return close();
  V.playing = true;
  IC.sfx && IC.sfx.ui && IC.sfx.ui('click');
}
function back() {
  if (!V.c || V.t < 0) return;
  const p = IC.cutAt(V.TL, V.t), sh = p.sh;
  V.t = p.k > 1.2 || !sh.i ? sh.t0 : V.TL.shots[sh.i - 1].t0;
  V.cur = -1; V.prevSh = null;
}
function pause() { if (V.c) V.playing = !V.playing; }
function close() {
  const S = IC.S;
  if (!V.c) return;
  stageOff();
  if (V.raf) cancelAnimationFrame(V.raf); V.raf = 0;
  if (!V.replay && S && S.story) IC.cutDone(S, V.c);
  V.c = null; el().hidden = true;
  if (S && !V.wasPaused) S.paused = false;
  IC.emit && S && IC.emit(S, 'cutsceneEnd', {});
  IC.ui && IC.ui.refresh && IC.ui.refresh(true);
}
V.open = function (S, c, replay) {
  el();
  V.c = c; V.replay = !!replay; V.TL = IC.cutTimeline(S, c);
  V.t = -MO().title; V.cur = -1; V.curL = null; V.playing = true; V.fired = new Set(); V.shake = 0; V.flash = 0; V.prevSh = null;
  V.wasPaused = S.paused; S.paused = true;
  for (const k of ['L0', 'L1']) { const L = $c(k); L.innerHTML = ''; L.style.opacity = '0'; L.style.clipPath = ''; L.style.zIndex = ''; }
  $c('cap').hidden = $c('say').hidden = true; $c('cap').dataset.i = $c('say').dataset.i = '';
  $c('title').innerHTML = `<small>${esc(IC.storyActLabel ? IC.storyActLabel(S) || '' : '')}</small><h1>${esc(V.TL.title)}</h1>`;
  $c('name').textContent = V.TL.title;
  $c('skip').innerHTML = `${V.replay ? 'Close' : 'Skip'} <kbd>Esc</kbd>`;
  V.el.hidden = false;
  IC.ui && IC.ui.closeCine && IC.ui.closeCine();
  IC.sfx && IC.sfx.ui && IC.sfx.ui('chapter');
  V.last = performance.now();
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = requestAnimationFrame(frame);
  return V.TL;
};
V.isOpen = () => !!V.c;
V.close = close;
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
  else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') next();
  else if (e.key === 'ArrowLeft') back();
  else if (e.key === 'p' || e.key === 'P') pause();
  // nothing else reaches the game or the 3D window under the scene
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
})(window.IC);
