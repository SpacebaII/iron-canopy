/* Iron Canopy — the cutscene viewer's painted panels brought to life (DOM and WebGL, never headless).
   - The painting is drawn by WebGL with its depth map (art/cut/depth/<name>.jpg, made by tools/cut-depth.py): a slow
     camera move (push in on the nearest thing, or pull back) and a sway that the pointer leans, each pixel shifted by
     its depth, so the foreground slides against the background. Light on top: a grade for night, lamps that flicker,
     an alarm's pulse, a blast's flash and shake, vignette and grain.
   - What moves in front of the picture is a 2D canvas over it, by IC.cutMood (cutscenes.js): dust in the light, rain,
     snow, embers, smoke; each speck has a depth and slides with the picture.
   - The caption and the balloons sit nearest the camera and lean furthest.
   Where WebGL or the picture's pixels are not available (a page opened from file:// cannot hand its pictures to
   WebGL), the picture keeps its CSS move and only the particles and the leaning are drawn. */
(function (IC) {
'use strict';
const L = IC.cutLife = { on: true, run: null, manual: false };   // manual: a tool steps it frame by frame (L.step)
const CFG = { zoom0: 1.07, zoom1: 1.15, dur: 18, sway: 0.016, lean: 0.022, push: 0.35 };
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointer = L.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', e => { pointer.tx = e.clientX / innerWidth * 2 - 1; pointer.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });

/* ---------- WebGL: the painting with its depth ---------- */
const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;v.y=1.-v.y;gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;varying vec2 v;uniform sampler2D img,dep;uniform vec2 ctr,off;uniform float zoom,focus,t,flick,alarm,flash,night,grain;
float h(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 u0=ctr+(v-.5)/zoom,u=u0;
  for(int i=0;i<3;i++){float d=texture2D(dep,u).r;u=u0+off*(d-focus);}
  u=clamp(u,.001,.999);
  vec3 c=texture2D(img,u).rgb;
  float d=texture2D(dep,u).r;
  c*=1.+flick*(.35+.65*d);
  c=mix(c,c*vec3(.78,.86,1.08),night*.35);
  float r=length((v-.5)*vec2(1.25,1.));
  c+=vec3(1.,.32,.08)*alarm*smoothstep(.25,.85,r)*.55;
  c*=1.-smoothstep(.45,1.05,r)*.55;
  c=mix(c,vec3(1.,.97,.9),flash);
  c+=(h(v*vec2(1600.,900.)+t)-.5)*grain;
  gl_FragColor=vec4(c,1.);
}`;
function glFor(cv) {
  const gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (k, src) => { const s = gl.createShader(k); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const u = {}; for (const k of ['img', 'dep', 'ctr', 'off', 'zoom', 'focus', 't', 'flick', 'alarm', 'flash', 'night', 'grain']) u[k] = gl.getUniformLocation(pr, k);
  gl.uniform1i(u.img, 0); gl.uniform1i(u.dep, 1);
  return { gl, u };
}
function tex(gl, unit, src) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);   // throws on a file:// page
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128]));
  return t;
}
const load = src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
/* where the camera goes: towards the nearest things in the picture (the brightest part of its depth map) */
function aim(dimg) {
  const c = document.createElement('canvas'); c.width = 48; c.height = 27;
  const g = c.getContext('2d'); g.drawImage(dimg, 0, 0, 48, 27);
  const px = g.getImageData(0, 0, 48, 27).data, n = 48 * 27, ds = new Float32Array(n);
  for (let i = 0; i < n; i++) ds[i] = px[i * 4] / 255;
  const cut = Float32Array.from(ds).sort()[Math.floor(n * 0.85)];
  let sx = 0, sy = 0, sw = 0, sd = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (ds[i] >= cut) { const w = ds[i]; sx += (i % 48 + 0.5) / 48 * w; sy += (Math.floor(i / 48) + 0.5) / 27 * w; sw += w; sd += ds[i]; cnt++; }
  return sw ? { x: sx / sw, y: sy / sw, near: sd / cnt } : null;
}

/* ---------- particles in front of the picture ---------- */
let sprite = null;
function soft() {
  if (sprite) return sprite;
  sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
  const g = sprite.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return sprite;
}
const KIND = {
  motes: { n: 70, make: (p, R) => Object.assign(p, { z: R(), s: 0.6 + R() * 1.8, vx: (R() - 0.5) * 6, vy: -2 - R() * 5, a: 0.15 + R() * 0.35, tw: R() * 6 }) },
  rain: { n: 220, make: (p, R) => Object.assign(p, { z: R(), s: 1, vx: -90, vy: 900 + R() * 500, a: 0.18 + R() * 0.25 }) },
  snow: { n: 160, make: (p, R) => Object.assign(p, { z: R(), s: 1 + R() * 2.6, vx: -10 + R() * 10, vy: 30 + R() * 50, a: 0.5 + R() * 0.4, tw: R() * 6 }) },
  embers: { n: 60, make: (p, R) => Object.assign(p, { z: 0.3 + R() * 0.7, s: 0.8 + R() * 1.8, vx: (R() - 0.5) * 30, vy: -40 - R() * 70, a: 0.6 + R() * 0.4, tw: R() * 6 }) },
  smoke: { n: 14, make: (p, R) => Object.assign(p, { z: 0.2 + R() * 0.6, s: 90 + R() * 160, vx: 6 + R() * 10, vy: -6 - R() * 8, a: 0.05 + R() * 0.07 }) }
};
function specks(m, W, H) {
  const R = Math.random, out = [];
  for (const k in KIND) if (m[k]) for (let i = 0; i < KIND[k].n; i++) out.push(KIND[k].make({ k, x: R() * W, y: R() * H }, R));
  return out;
}
function drawSpecks(g, ps, W, H, dt, t, shift, focus) {
  g.clearRect(0, 0, W, H);
  const sp = soft(), sc = W / 1180;
  for (const p of ps) {
    const z = 0.5 + p.z;                                   // nearer ones are bigger and faster
    p.x += p.vx * dt * z * sc; p.y += p.vy * dt * z * sc;
    const m = p.k === 'smoke' ? p.s * sc : 40 * sc;
    if (p.y > H + m) { p.y = -m; p.x = Math.random() * W; } else if (p.y < -m) { p.y = H + m; p.x = Math.random() * W; }
    if (p.x > W + m) p.x = -m; else if (p.x < -m) p.x = W + m;
    const x = p.x - shift.x * W * (p.z + 0.4 - focus), y = p.y - shift.y * H * (p.z + 0.4 - focus);
    if (p.k === 'rain') {
      g.strokeStyle = `rgba(210,225,240,${p.a})`; g.lineWidth = (0.6 + p.z) * sc;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + p.vx * 0.02 * sc, y + p.vy * 0.028 * z * sc); g.stroke();
    } else if (p.k === 'smoke') {
      g.globalAlpha = p.a; g.filter = 'none'; g.drawImage(sp, x - m / 2, y - m / 2, m, m);
    } else {
      const tw = p.k === 'snow' ? 1 : 0.55 + 0.45 * Math.sin(t * 2.2 + p.tw);
      g.globalAlpha = p.a * tw;
      if (p.k === 'embers') { p.vx += (Math.random() - 0.5) * 40 * dt; }
      if (p.k === 'snow') p.x += Math.sin(t + p.tw) * 12 * dt * sc;
      const s = p.s * (0.6 + p.z) * sc * (p.k === 'embers' ? 2.4 : p.k === 'snow' ? 2.2 : 3.2);
      g.drawImage(p.k === 'embers' ? emberSprite() : sp, x - s, y - s, s * 2, s * 2);
    }
  }
  g.globalAlpha = 1;
}
let ember = null;
function emberSprite() {
  if (ember) return ember;
  ember = document.createElement('canvas'); ember.width = ember.height = 32;
  const g = ember.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,230,160,1)'); r.addColorStop(0.35, 'rgba(255,140,40,.8)'); r.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return ember;
}

/* ---------- one panel ---------- */
L.stop = function () {
  const r = L.run; L.run = null;
  if (!r) return null;
  cancelAnimationFrame(r.raf);
  // the picture as it last stood, for the next panel to dissolve from
  if (!r.cv || !r.live) return null;
  const g = document.createElement('canvas'); g.width = r.cv.width; g.height = r.cv.height;
  try { g.getContext('2d').drawImage(r.cv, 0, 0); g.getContext('2d').drawImage(r.pc, 0, 0); } catch (e) { return null; }
  return g;
};
/* frame: the .frame element; p: the panel; k: its place in the scene (moves alternate) */
L.start = function (frame, p, k) {
  L.stop();
  if (!L.on || !frame) return;
  const img = frame.querySelector('img'), m = IC.cutMood(p), still = reduced();
  const r = L.run = { frame, p, m, t0: performance.now(), last: performance.now(), tick: null, raf: 0, live: false, cv: null, gl: null, focus: 0.5, aim: { x: 0.5, y: 0.5 }, out: k % 3 === 1 };
  // the particles' canvas, over the picture and under the words
  const pc = r.pc = document.createElement('canvas'); pc.className = 'cutfx';
  const sizeUp = () => { const w = frame.clientWidth, h = frame.clientHeight, d = Math.min(devicePixelRatio || 1, 2); pc.width = w * d; pc.height = h * d; if (r.cv) { r.cv.width = Math.min(1920, w * d); r.cv.height = Math.round(r.cv.width * h / w); } };
  frame.insertBefore(pc, img ? img.nextSibling : frame.firstChild);
  sizeUp();
  r.ps = still ? [] : specks(m, pc.width, pc.height);
  const lean = [frame.querySelector('.cap'), frame.querySelector('.says')].filter(Boolean);
  if (img && p.art) (async () => {
    const [pic, dimg] = await Promise.all([load(img.src), load(`art/cut/depth/${p.art}.jpg`)]);
    if (L.run !== r || !pic) return;
    const cv = document.createElement('canvas'); cv.className = 'cutgl';
    const G = glFor(cv); if (!G) return;
    try { tex(G.gl, 0, pic); tex(G.gl, 1, dimg); } catch (e) { return; }   // a file:// page: the CSS move stays
    if (dimg) { const a = aim(dimg); if (a) { r.aim = a; r.focus = Math.min(0.85, Math.max(0.35, a.near * 0.85)); } }
    r.cv = cv; r.gl = G; sizeUp();
    frame.insertBefore(cv, img); img.classList.add('under');
    r.live = true;
  })();
  const tick = now => {
    if (L.run !== r) return;
    const dt = Math.min(0.05, (now - r.last) / 1000), t = (now - r.t0) / 1000; r.last = now;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    const q = still ? 0 : Math.min(1, t / CFG.dur), e = q * q * (3 - 2 * q), ease = r.out ? 1 - e : e;
    const sway = still ? { x: 0, y: 0 } : { x: Math.sin(t * 0.31) * 0.7 + Math.sin(t * 0.83) * 0.2, y: Math.sin(t * 0.23 + 1) * 0.45 };
    const off = { x: (sway.x * CFG.sway + pointer.x * CFG.lean), y: (sway.y * CFG.sway * 0.6 + pointer.y * CFG.lean * 0.6) };
    // the move: zoom in towards the nearest things (or back out from them), pan a share of the way
    const zoom = CFG.zoom0 + (CFG.zoom1 - CFG.zoom0) * ease, mx = 0.5 / zoom;
    let cx = 0.5 + (r.aim.x - 0.5) * CFG.push * ease, cy = 0.5 + (r.aim.y - 0.5) * CFG.push * ease;
    // a blast: one flash and a shake that dies away
    const fl = m.flash ? Math.max(0, 1 - t / 0.9) ** 2 : 0, shake = m.flash ? Math.max(0, 1 - t / 2.2) * 0.012 : 0;
    cx += (Math.random() - 0.5) * shake; cy += (Math.random() - 0.5) * shake;
    cx = Math.min(1 - mx, Math.max(mx, cx)); cy = Math.min(1 - mx, Math.max(mx, cy));
    // the camera moving is parallax too: the nearer things travel further than the pan
    off.x += (cx - 0.5) * 0.06; off.y += (cy - 0.5) * 0.06;
    const flick = m.flicker ? (Math.sin(t * 7.1) * 0.02 + Math.sin(t * 13.7) * 0.015 + (Math.random() < 0.012 ? -0.12 : 0)) : 0;
    const alarm = m.alarm ? Math.max(0, Math.sin(t * 3.4)) ** 3 : 0;
    if (r.live) {
      const { gl, u } = r.gl;
      gl.viewport(0, 0, r.cv.width, r.cv.height);
      gl.uniform2f(u.ctr, cx, cy); gl.uniform2f(u.off, off.x, off.y);
      gl.uniform1f(u.zoom, zoom); gl.uniform1f(u.focus, r.focus); gl.uniform1f(u.t, t % 100);
      gl.uniform1f(u.flick, flick); gl.uniform1f(u.alarm, alarm); gl.uniform1f(u.flash, fl);
      gl.uniform1f(u.night, m.night ? 1 : 0); gl.uniform1f(u.grain, 0.035);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // what floats in front, in the picture's frame of motion
    drawSpecks(pc.getContext('2d'), r.ps, pc.width, pc.height, dt, t, { x: off.x * zoom, y: off.y * zoom }, r.focus);
    if (!r.live) {   // no depth: a flash and an alarm still show over the CSS move
      const g = pc.getContext('2d');
      if (fl > 0) { g.fillStyle = `rgba(255,248,230,${fl})`; g.fillRect(0, 0, pc.width, pc.height); }
      if (alarm > 0) { g.fillStyle = `rgba(255,70,20,${alarm * 0.16})`; g.fillRect(0, 0, pc.width, pc.height); }
    }
    // the words lean furthest: they are nearest the camera
    for (const el of lean) el.style.translate = `${(-off.x * 0.9 * frame.clientWidth).toFixed(1)}px ${(-off.y * 0.9 * frame.clientHeight).toFixed(1)}px`;
    if (shake && frame) frame.style.translate = `${((Math.random() - 0.5) * shake * 400).toFixed(1)}px ${((Math.random() - 0.5) * shake * 400).toFixed(1)}px`;
    else if (frame.style.translate) frame.style.translate = '';
    if (!L.manual) r.raf = requestAnimationFrame(tick);
  };
  r.tick = tick;
  if (!L.manual) r.raf = requestAnimationFrame(tick);
};
/* a clip tool's frame: the panel as it stands ms after it opened */
L.step = ms => { const r = L.run; if (r) r.tick(r.t0 + ms); };
})(window.IC);
