/* Iron Canopy — film mode (brief 58): the interface off, the map as a camera, a film look, and a recorder.
   Shift+H (or "Film mode" in the menu) hides every panel and draws the world without its data: no tags, rings or
   labels, our aircraft and the enemy's weapons as what they are. In film mode: D lets the director pick the shots,
   B the letterbox bars, Shift+1 and Shift+2 run the game at ¼× and ½×, Shift+R records the map to a WebM file.
   The shots' maths is film-cam.js (headless); this file drives the map's camera with it each frame, draws the
   film look over the finished map (bloom, grade, vignette, grain, bars, captions, cards, fades), shakes the camera
   for blasts near the middle, and holds the page's clock for the tools: IC.film.hold(true), then IC.film.tick(ms)
   moves every animation on by exactly ms, so a scene films smoothly however slow the machine draws.
   Browser only; nothing in the simulation reads it. */
(function (IC) {
'use strict';
const U = IC.U;

const F = IC.film = {
  on: false, auto: false,
  opt: { bars: false, grade: true, bloom: true, grain: true, shake: true, vignette: true },
  sh: null, D: { cur: null, since: 0 }, t: 0, dirT: 0,
  sx: 0, sy: 0, trauma: 0, flashA: 0, fadeA: 0, fadeTo: 0, fadeK: 0,
  cap: null, cd: null, rec: null, frames: 0
};

/* ---------- the page's clock ----------
   Free-running until held. Held, performance.now stands still and animation frames wait until tick() runs them
   with the clock moved on by exactly one frame. */
const rNow = performance.now.bind(performance), rRAF = window.requestAnimationFrame.bind(window), rCAF = window.cancelAnimationFrame.bind(window);
let held = false, off = 0, vt = 0, q = new Map(), qid = 0;
performance.now = () => held ? vt : rNow() - off;
window.requestAnimationFrame = cb => { if (held) { const id = -(++qid); q.set(id, cb); return id; } return rRAF(() => cb(rNow() - off)); };
window.cancelAnimationFrame = id => { if (id < 0) q.delete(id); else rCAF(id); };
F.hold = function (on) {
  document.body.classList.toggle('filmheld', !!on);
  if (on && !held) { vt = rNow() - off; held = true; }
  else if (!on && held) { off = rNow() - vt; held = false; const Q = [...q.values()]; q.clear(); for (const cb of Q) rRAF(() => cb(rNow() - off)); }
};
F.held = () => held;
/* one frame of the held clock: everything waiting for a frame runs once, at the new time */
F.tick = function (ms) {
  if (!held) return;
  vt += ms;
  const Q = [...q.values()]; q.clear();
  for (const cb of Q) cb(vt);
};

/* ---------- on and off ---------- */
const CSS = `
body.film #app > *:not(#map):not(#replay):not(.live):not(#filmRec){opacity:0!important;pointer-events:none!important;transition:opacity .45s}
body.film #map{cursor:default}
body.filmheld #app > *{transition:none!important}
body.film{padding:0!important}
body.film .app{border-radius:0!important}
#filmRec{position:absolute;right:14px;top:12px;z-index:30;font:600 13px var(--mono,monospace);color:#ff5b4f;text-shadow:0 1px 3px #000;pointer-events:none}
.replay.film,.live.film{inset:0!important;border-radius:0!important;box-shadow:none!important;width:auto!important;height:auto!important;resize:none!important;z-index:11}
.replay.film .rp-head,.replay.film .rp-bar,.live.film .rp-head,.film .rp-panel,.film .rp-labels,.film .rp-side,.film .rp-fps{display:none!important}
.rp-film{position:absolute;inset:0;pointer-events:none;z-index:2}`;
function style() { if (document.getElementById('filmStyle')) return; const st = document.createElement('style'); st.id = 'filmStyle'; st.textContent = CSS; document.head.appendChild(st); }
F.css = style;
F.set = function (on) {
  style();
  F.on = !!on;
  document.body.classList.toggle('film', F.on);
  if (!F.on) { F.sh = null; F.auto = false; F.cap = null; F.cd = null; F.fadeA = F.fadeTo = 0; if (F.rec) F.record(false); }
  if (IC.S && IC.S.speed < 1 && !F.on) IC.S.speed = 1;
  return F.on;
};
F.toggle = () => F.set(!F.on);

/* ---------- shots ----------
   F.shot(spec): spec as in film-cam.js, t0 and dur in film seconds from now ({ dur } defaults to 6). The camera
   follows it until it ends (or for good with keep), or until the player drags or zooms. */
F.shot = function (spec) {
  const c = IC.cam;
  const sh = Object.assign({ dur: 6 }, spec, { t0: F.t + (spec.delay || 0) });
  if (!sh.at && (sh.kind === 'hold' || sh.kind === 'push' || sh.kind === 'pan')) sh.at = { x: c.x + c.vw / c.z / 2, y: c.y + c.vh / c.z / 2 };
  if (sh.z == null && sh.kind !== 'track') sh.z = c.z;
  F.sh = sh; c.fly = null;
  if (sh.snap) snapTo(sh);
  return sh;
};
F.stop = () => { F.sh = null; F.auto = false; };
function snapTo(sh) { const w = IC.filmWant(IC.S, sh, F.t, IC.cam.vw, IC.cam.vh); if (w) { IC.cam.z = w.z; IC.centerOn(w.x, w.y); } }
function drive(S, dt) {
  const c = IC.cam;
  if (F.auto && (F.dirT -= dt) <= 0) {
    F.dirT = 0.5;
    const gs = S.paused ? 0.01 : IC.GS * (IC.combatNow && IC.combatNow.active ? IC.combatNow.speed : S.speed);
    const sh = IC.filmDirect(S, F.D, F.t, gs);
    if (sh) { F.sh = Object.assign(sh, { t0: F.t, dur: IC.FILM.hold[1] + 4 }); F.sh.cut = true; }
  }
  const sh = F.sh; if (!sh) return;
  if (F.t < sh.t0) return;
  const w = IC.filmWant(S, sh, F.t, c.vw, c.vh);
  if (!w) { if (!F.auto) F.sh = null; return; }
  if (IC.filmEased(sh) && !sh.cut) {
    const k = 1 - Math.exp(-dt * (sh.ease || 2.2)), cx = c.x + c.vw / c.z / 2, cy = c.y + c.vh / c.z / 2;
    c.z = Math.exp(Math.log(c.z) + (Math.log(w.z) - Math.log(c.z)) * k);
    IC.centerOn(cx + (w.x - cx) * k, cy + (w.y - cy) * k);
  } else { c.z = w.z; IC.centerOn(w.x, w.y); sh.cut = false; }
  if (!sh.keep && F.t > sh.t0 + sh.dur && !F.auto) F.sh = null;
}

/* ---------- shake: blasts near the middle of the picture ---------- */
function boom(S, x, y, s) {
  if (!F.on || !F.opt.shake || !IC.cam) return;
  const c = IC.cam, mx = c.x + c.vw / c.z / 2, my = c.y + c.vh / c.z / 2;
  const d = Math.hypot(x - mx, y - my) * c.z / Math.max(c.vw, c.vh);   // in screens from the middle
  if (d > 0.8) return;
  const k = (s || 1) * (1 - d / 0.8) * U.clamp(c.z / 2, 0.25, 1.5);
  F.trauma = Math.min(1, F.trauma + 0.35 * k);
  if (k > 0.8) F.flashA = Math.min(0.6, F.flashA + 0.18 * k);
}
F.boom = boom;
const ex = IC.explode;
if (ex) IC.explode = function (S, x, y, s) { const r = ex.apply(this, arguments); boom(S, x, y, s); return r; };
F.shake = (k) => { F.trauma = Math.min(1, F.trauma + k); };
// smooth noise for the shake: a few sines at odd rates
const nz = (t, s) => Math.sin(t * 23.1 + s) * 0.5 + Math.sin(t * 37.7 + s * 2.3) * 0.3 + Math.sin(t * 61.3 + s * 4.1) * 0.2;

/* ---------- every frame, before the map draws ---------- */
F.step = function (S, dtR) {
  dtR = U.clamp(dtR || 0, 0, 0.1);
  F.t += dtR; F.frames++;
  if (F.on) drive(S, dtR);
  F.trauma = Math.max(0, F.trauma - dtR * 1.1);
  const a = F.trauma * F.trauma * 14;
  F.sx = a * nz(F.t, 1); F.sy = a * nz(F.t, 7);
  F.flashA = Math.max(0, F.flashA - dtR * 2.2);
  if (F.fadeK) { const d = F.fadeTo - F.fadeA, s = dtR / F.fadeK; F.fadeA += Math.sign(d) * Math.min(Math.abs(d), s); if (Math.abs(F.fadeTo - F.fadeA) < 1e-4) F.fadeK = 0; }
  if (F.cover) blankDraw();
  if (F.rec) F.rec.el.textContent = `● REC ${U.hhmm ? Math.floor((performance.now() - F.rec.t0) / 60000) + ':' + String(Math.floor((performance.now() - F.rec.t0) / 1000) % 60).padStart(2, '0') : ''}`;
};

/* a black screen over everything for title cards between shots (the map stops drawing under it) */
F.blank = function (on) {
  let cv = document.getElementById('filmCard');
  if (on && !cv) { cv = document.createElement('canvas'); cv.id = 'filmCard'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:60;background:#000;pointer-events:none'; document.body.appendChild(cv); }
  if (cv) cv.hidden = !on;
  F.cover = !!on;
};
function blankDraw() {
  const cv = document.getElementById('filmCard'); if (!cv || cv.hidden) return;
  const w = innerWidth, h = innerHeight; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); overlay(g, w, h);
}
/* ---------- captions, cards, fades ---------- */
F.caption = (title, line, sec) => { F.cap = title ? { title, line: line || '', t0: F.t, dur: sec || 4 } : null; };
F.card = (title, line, sec, o) => { F.cd = title ? Object.assign({ title, line: line || '', t0: F.t, dur: sec || 3 }, o || {}) : null; };
F.fade = (to, sec) => { F.fadeTo = to; F.fadeK = sec || 0; if (!sec) F.fadeA = to; };
F.flash = k => { F.flashA = Math.min(1, F.flashA + (k || 0.6)); };

/* ---------- the look: drawn over the finished map, in screen pixels ---------- */
let b1 = null, b2 = null, grainC = null, vig = null, vigK = '';
function canvases(W, H) {
  const w1 = Math.max(8, Math.round(W / 4)), h1 = Math.max(8, Math.round(H / 4)), w2 = Math.max(4, Math.round(W / 16)), h2 = Math.max(4, Math.round(H / 16));
  if (!b1 || b1.width !== w1 || b1.height !== h1) { b1 = document.createElement('canvas'); b1.width = w1; b1.height = h1; b2 = document.createElement('canvas'); b2.width = w2; b2.height = h2; }
  if (!grainC) {
    grainC = document.createElement('canvas'); grainC.width = grainC.height = 256;
    const g = grainC.getContext('2d'), im = g.createImageData(256, 256), seed = IC.makeRng ? IC.makeRng(77) : Math.random;
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (seed() - 0.5) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  }
}
/* the grade by the light: blue night, warm golden hours, a slightly cool, contrasty day */
function grade(g, W, H, light, S) {
  const golden = light > 0.15 && light < 0.75 ? 1 - Math.abs(light - 0.45) / 0.3 : 0;
  g.globalCompositeOperation = 'soft-light';
  if (light < 0.35) { g.globalAlpha = 0.4 * (1 - light / 0.35); g.fillStyle = 'rgb(70,120,170)'; g.fillRect(0, 0, W, H); }
  // golden hour: teal in the shadows, warm in the light, gently (the map is already warm at dusk)
  if (golden > 0) { g.globalAlpha = 0.22 * golden; g.fillStyle = 'rgb(30,90,120)'; g.fillRect(0, 0, W, H); g.globalAlpha = 0.16 * golden; g.fillStyle = 'rgb(255,160,90)'; g.fillRect(0, 0, W, H); }
  if (light >= 0.75) { g.globalAlpha = 0.25; g.fillStyle = 'rgb(120,150,170)'; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
F.post = function (g, cv, W, H, S, light) {
  if (!F.on) return;
  canvases(W, H);
  g.save(); g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  // bloom: the bright parts, small and soft, laid back over the picture as light
  if (F.opt.bloom) {
    const c1 = b1.getContext('2d'), c2 = b2.getContext('2d');
    c1.globalCompositeOperation = 'copy'; c1.filter = light < 0.4 ? 'brightness(0.75) contrast(3.2)' : 'brightness(0.62) contrast(3.6)';
    c1.drawImage(cv, 0, 0, b1.width, b1.height); c1.filter = 'none';
    c2.globalCompositeOperation = 'copy'; c2.drawImage(b1, 0, 0, b2.width, b2.height);
    g.globalCompositeOperation = 'screen'; g.imageSmoothingEnabled = true;
    g.globalAlpha = light < 0.4 ? 0.55 : 0.32; g.drawImage(b2, 0, 0, W, H);
    g.globalAlpha = light < 0.4 ? 0.4 : 0.2; g.drawImage(b1, 0, 0, W, H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  if (F.opt.grade) grade(g, W, H, light, S);
  if (F.opt.vignette) {
    const k = W + 'x' + H;
    if (vigK !== k) { vigK = k; vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,2,6,0.62)'); }
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
  }
  if (F.flashA > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = F.flashA; g.fillStyle = 'rgb(255,236,210)'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  if (F.opt.grain) {
    const s = F.frames * 7919 % 65536, ox = (s * 37) % 256, oy = (s * 91) % 256;
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.07;
    const p = g.createPattern(grainC, 'repeat'); p.setTransform(new DOMMatrix().translate(-ox, -oy));
    g.fillStyle = p; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  overlay(g, W, H);
  g.restore();
};
/* bars, captions, cards and the fade: also drawn over the 3D view's own canvas in film mode */
function overlay(g, W, H) {
  const bh = F.opt.bars ? Math.max(0, (H - W / 2.39) / 2) : 0;
  if (bh > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh); }
  const C = F.cap;
  if (C) {
    const a = fadeIn(C, 0.7);
    if (a <= 0 && F.t > C.t0 + C.dur) F.cap = null;
    else if (a > 0) {
      const s = H / 1080, x = 96 * s + (1 - a) * -18 * s, y = H - bh - 120 * s;
      g.globalAlpha = a;
      g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 14 * s;
      g.font = `700 ${46 * s}px "Saira Condensed", "IBM Plex Sans Condensed", sans-serif`; g.fillStyle = '#eef3f6'; g.textBaseline = 'alphabetic';
      spaced(g, C.title.toUpperCase(), x, y, 0.16 * 46 * s);
      g.fillStyle = '#f2b441'; g.shadowBlur = 0; g.fillRect(x, y + 14 * s, 64 * s * a, 3 * s);
      g.shadowBlur = 10 * s;
      g.font = `500 ${25 * s}px "IBM Plex Sans Condensed", sans-serif`; g.fillStyle = '#b8c8d2';
      if (C.line) g.fillText(C.line, x, y + 52 * s);
      g.shadowBlur = 0; g.globalAlpha = 1;
    }
  }
  const K = F.cd;
  if (K) {
    const a = fadeIn(K, K.fade || 0.8);
    if (a <= 0 && F.t > K.t0 + K.dur) F.cd = null;
    else if (a > 0) {
      const s = H / 1080;
      g.globalAlpha = a;
      if (!K.clear) { g.fillStyle = '#020508'; g.fillRect(0, 0, W, H); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#eef3f6';
      g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = K.clear ? 18 * s : 0;
      const big = K.big || 120;
      g.font = `700 ${big * s}px "Saira Condensed", sans-serif`;
      spaced(g, K.title, W / 2, H / 2 - (K.line ? 30 * s : 0), 0.22 * big * s, true);
      if (K.line) { g.font = `500 ${32 * s}px "IBM Plex Sans Condensed", sans-serif`; g.fillStyle = '#9ab0bf'; g.fillText(K.line, W / 2, H / 2 + big * 0.45 * s + 10 * s); }
      if (K.rule !== false) { g.fillStyle = '#f2b441'; g.fillRect(W / 2 - 50 * s, H / 2 + big * 0.42 * s - 20 * s, 100 * s, 2.5 * s); }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.globalAlpha = 1; g.shadowBlur = 0;
    }
  }
  if (F.fadeA > 0.001) { g.globalAlpha = F.fadeA; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}
F.overlay = overlay;
function fadeIn(C, f) { const t = F.t - C.t0; return t < 0 ? 0 : Math.min(1, t / f, Math.max(0, (C.t0 + C.dur - F.t) / f)); }
/* letters spaced out like a title; centred when asked */
function spaced(g, s, x, y, sp, centre) {
  let w = 0; const ws = []; for (const ch of s) { const m = g.measureText(ch).width; ws.push(m); w += m + sp; } w -= sp;
  let cx = centre ? x - w / 2 : x; const al = g.textAlign; g.textAlign = 'left';
  let i = 0; for (const ch of s) { g.fillText(ch, cx, y); cx += ws[i++] + sp; }
  g.textAlign = al;
}

/* ---------- recording: the map canvas (with the look) to a WebM file ---------- */
F.record = function (on) {
  const cv = document.getElementById('map');
  if (on && !F.rec && cv && cv.captureStream && window.MediaRecorder) {
    const stream = cv.captureStream(60), chunks = [];
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const el = document.createElement('div'); el.id = 'filmRec'; (document.getElementById('app') || document.body).appendChild(el);
    F.rec = { r, chunks, el, t0: performance.now() };
    r.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' }); F.lastVideo = blob;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iron-canopy-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    };
    r.start(1000);
  } else if (!on && F.rec) { F.rec.r.stop(); F.rec.el.remove(); F.rec = null; }
  return !!F.rec;
};

/* ---------- keys (main.js passes them here first while film mode is on) ---------- */
F.key = function (e, S) {
  const k = e.key, lk = k.toLowerCase();
  if (lk === 'h' && e.shiftKey) { F.toggle(); return true; }
  if (!F.on) return false;
  if (k === 'Escape') { F.set(false); return true; }
  if (lk === 'd' && !e.shiftKey) { F.auto = !F.auto; F.D = { cur: null, since: 0 }; if (!F.auto) F.sh = null; return true; }
  if (lk === 'b' && !e.shiftKey) { F.opt.bars = !F.opt.bars; return true; }
  if (lk === 'r' && e.shiftKey) { F.record(!F.rec); return true; }
  if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) { S.speed = e.code === 'Digit1' ? 0.25 : 0.5; S.paused = false; return true; }
  return false;
};
// the player takes the camera back by dragging or zooming
addEventListener('pointerdown', e => { if (F.on && e.target && e.target.id === 'map' && !F.held()) { F.sh = null; F.auto = false; } }, true);
addEventListener('wheel', e => { if (F.on && e.target && e.target.id === 'map' && !F.held()) { F.sh = null; F.auto = false; } }, { capture: true, passive: true });

})(window.IC);
