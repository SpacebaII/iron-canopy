/* Iron Canopy — synthesized sound (WebAudio, no files). Positional sounds are panned and
   attenuated by where the camera is looking. Audio starts only after the player clicks. */
(function (IC) {
'use strict';
const A = IC.sfx = { on: false, muted: false, vol: 0.65 };
let ctx = null, master, sfxBus, ambBus, noiseBuf, chatterTimer = null, rumbleTimer = null;
const last = {};

function throttle(key, ms) { const n = performance.now(); if (last[key] && n - last[key] < ms) return false; last[key] = n; return true; }
function spatial(x, y, reach) {
  const c = IC.cam; if (!c) return { g: 0, pan: 0, delay: 0, far: 0 };
  const cx = c.x + c.vw / c.z / 2, cy = c.y + c.vh / c.z / 2;
  const R = Math.max(c.vw, c.vh) / c.z * 0.7 * (reach || 1);
  const d = Math.hypot(x - cx, y - cy);
  const g = Math.max(0, 1 - d / R) * Math.min(1, 0.3 + c.z * 1.6);
  // sound travels slower than light: distant blasts arrive late and muffled
  const vis = Math.max(c.vw, c.vh) / c.z;
  return { g, pan: Math.max(-1, Math.min(1, (x - cx) / (c.vw / c.z / 2))) * 0.7, delay: Math.min(1.1, (d / vis) * 0.9 + (1 - Math.min(1, c.z)) * 0.15), far: Math.min(1, d / vis) };
}
function out(gain, pan) {
  const g = ctx.createGain(); g.gain.value = 0;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(sfxBus); }
  else g.connect(sfxBus);
  return g;
}
function noise(dur) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.start(ctx.currentTime, Math.random() * 1.5); s.stop(ctx.currentTime + dur + 0.05);
  return s;
}
function env(g, t0, peak, a, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function tone(type, f0, f1, dur, peak, dest, delay) {
  const t0 = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain(); env(g, t0, peak, 0.005, dur);
  o.connect(g); g.connect(dest || sfxBus); o.start(t0); o.stop(t0 + dur + 0.05);
}

A.init = function () {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = A.muted ? 0 : A.vol; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.8; ambBus.connect(master);
  const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let b = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3.5; }
  ambience();
  A.on = true;
};
A.setVol = function (v) { A.vol = v; if (master) master.gain.setTargetAtTime(A.muted ? 0 : v, ctx.currentTime, 0.1); };
A.toggle = function () {
  A.muted = !A.muted;
  if (master) master.gain.setTargetAtTime(A.muted ? 0 : A.vol, ctx.currentTime, 0.1);
  return A.muted;
};

function ambience() {
  // wind
  const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const wg = ctx.createGain(); wg.gain.value = 0.035;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  w.connect(lp); lp.connect(wg); wg.connect(ambBus); w.start();
  // operations room hum
  for (const [f, g0] of [[55, 0.012], [110, 0.005], [165, 0.002]]) {
    const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = g0;
    o.connect(g); g.connect(ambBus); o.start();
  }
  const chatter = () => {
    chatterTimer = setTimeout(chatter, 5000 + Math.random() * 11000);
    if (!ctx || A.muted || document.hidden) return;
    const t0 = ctx.currentTime, dur = 0.8 + Math.random() * 1.6;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 + Math.random() * 500; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0;
    for (let t = 0; t < dur; t += 0.07) g.gain.setValueAtTime(Math.random() < 0.7 ? 0.012 + Math.random() * 0.02 : 0.001, t0 + t);
    g.gain.setValueAtTime(0, t0 + dur);
    n.connect(bp); bp.connect(g); g.connect(ambBus); n.start(t0); n.stop(t0 + dur + 0.1);
    tone('sine', 1250, 1250, 0.06, 0.012, ambBus, dur);
  };
  chatter();
  const rumble = () => {
    rumbleTimer = setTimeout(rumble, 2500 + Math.random() * 6000);
    if (!ctx || A.muted || document.hidden || !IC.S || !IC.S.enemy || !IC.S.enemy.war || IC.S.paused) return;
    const t0 = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 140;
    const g = ctx.createGain(); env(g, t0, 0.05 + Math.random() * 0.05, 0.05, 1.8);
    n.connect(lp2); lp2.connect(g); g.connect(ambBus); n.start(t0); n.stop(t0 + 2);
  };
  rumble();
}

A.boom = function (x, y, s) {
  if (!ctx || !A.on) return;
  const { g, pan, delay, far } = spatial(x, y, 1.4);
  if (g < 0.03 || !throttle('boom', 70)) return;
  const t0 = ctx.currentTime + delay, big = Math.min(1.8, s || 1);
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t0, Math.random() * 1.5); n.stop(t0 + 2.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600 * (1 - far * 0.7), t0); lp.frequency.exponentialRampToValueAtTime(80, t0 + 1.3 + big * 0.5);
  const o = out(1, pan); env(o, t0, 0.5 * g * (0.5 + big * 0.4), 0.006, 1.1 + big * 0.8);
  n.connect(lp); lp.connect(o);
  const th = ctx.createOscillator(); th.frequency.setValueAtTime(70, t0); th.frequency.exponentialRampToValueAtTime(26, t0 + 0.7);
  const tg = out(1, pan); env(tg, t0, 0.5 * g * big, 0.004, 0.6 + big * 0.3); th.connect(tg); th.start(t0); th.stop(t0 + 1.2);
  if (big > 1.3) { // rolling echo off the hills
    const n2 = ctx.createBufferSource(); n2.buffer = noiseBuf; n2.loop = true; n2.start(t0 + 0.35); n2.stop(t0 + 3.2);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 180;
    const o2 = out(1, -pan); env(o2, t0 + 0.35, 0.12 * g, 0.2, 2.2); n2.connect(lp2); lp2.connect(o2);
  }
};
A.pop = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 0.9);
  if (g < 0.05 || !throttle('pop', 120)) return;
  for (let i = 0; i < 4; i++) {
    const t0 = ctx.currentTime + i * 0.07;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t0, Math.random()); s.stop(t0 + 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    const o = out(1, pan); env(o, t0, 0.12 * g, 0.002, 0.05); s.connect(hp); hp.connect(o);
  }
};
A.rotor = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 1);
  if (g < 0.05 || !throttle('rotor', 2500)) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 18; i++) {
    const tt = t0 + i * 0.11;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(tt, Math.random()); s.stop(tt + 0.08);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const o = out(1, pan); env(o, tt, 0.14 * g * Math.sin(Math.PI * i / 18), 0.01, 0.07); s.connect(lp); lp.connect(o);
  }
};
A.thunder = function () {
  if (!ctx || !A.on || !throttle('thunder', 3000)) return;
  const t0 = ctx.currentTime + 0.4 + Math.random() * 1.2;
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t0); n.stop(t0 + 4);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(60, t0 + 3.5);
  const o = out(1, Math.random() - 0.5); env(o, t0, 0.3, 0.15, 3.4); n.connect(lp); lp.connect(o);
};
/* launches: the simulation asks for a sound by size; the drawing, which knows the missile, claims it with its class
   in the same frame. Anything unclaimed plays by size. Two from one launcher ripple. */
const pending = [], claims = [];
let flushT = null;
A.launch = function (x, y, s) {
  if (!ctx || !A.on) return;
  pending.push({ x, y, s });
  if (!flushT) flushT = setTimeout(flush, 0);
};
A.claimLaunch = function (x, y, cls, delay) {
  if (!ctx || !A.on) return;
  claims.push({ x, y, cls, delay: delay || 0 });
  if (!flushT) flushT = setTimeout(flush, 0);
};
const BY_SIZE = s => s >= 1.35 ? 'lr' : s >= 1.25 ? 'tbm' : s >= 0.95 ? 'mr' : s >= 0.75 ? 'cm' : s >= 0.65 ? 'sr' : s >= 0.55 ? 'aam' : 'rkt';
function flush() {
  flushT = null;
  const used = new Set();
  for (const c of claims) {
    const i = pending.findIndex((p, k) => !used.has(k) && Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < 8);
    if (i >= 0) used.add(i);
    missile(c.x, c.y, c.cls, c.delay);
  }
  pending.forEach((p, k) => { if (!used.has(k)) missile(p.x, p.y, BY_SIZE(p.s), 0); });
  pending.length = 0; claims.length = 0;
}
/* each class has its own voice: a heat-seeker's pop and hiss, a short-range crack, a medium-range whoosh, a long-range
   roar that crackles, the tearing climb of a ballistic missile interceptor */
const VOICE = {
  ir:  { pop: 0.5, crack: 0, band: [3200, 1400], dur: 0.7, roar: 0, gain: 0.22 },
  sr:  { pop: 0.3, crack: 0.5, band: [2800, 900], dur: 0.9, roar: 0.15, gain: 0.3 },
  mr:  { pop: 0, crack: 0.35, band: [1900, 500], dur: 1.6, roar: 0.35, gain: 0.34 },
  lr:  { pop: 0, crack: 0.5, band: [1300, 260], dur: 3, roar: 0.7, gain: 0.42, crackle: true },
  bmd: { pop: 0, crack: 0.8, band: [2600, 3600], dur: 2, roar: 0.5, gain: 0.4, crackle: true },
  hat: { pop: 0, crack: 0.9, band: [1500, 2600], dur: 3.4, roar: 0.8, gain: 0.44, crackle: true },
  exo: { pop: 0, crack: 1, band: [1200, 2400], dur: 4, roar: 0.9, gain: 0.46, crackle: true },
  aam: { pop: 0.2, crack: 0, band: [3000, 1200], dur: 0.8, roar: 0, gain: 0.2 },
  tbm: { pop: 0, crack: 0.2, band: [900, 300], dur: 3.5, roar: 0.8, gain: 0.3, crackle: true, far: true },
  cm:  { pop: 0.4, crack: 0, band: [1500, 700], dur: 1.4, roar: 0.2, gain: 0.22 },
  rkt: { pop: 0.3, crack: 0.3, band: [2400, 800], dur: 0.7, roar: 0.1, gain: 0.24 }
};
function missile(x, y, cls, delay) {
  const V = VOICE[cls] || VOICE.mr;
  const { g, pan, far } = spatial(x, y, V.far ? 1.8 : 1.2);
  if (g < 0.03 || !throttle('launch' + cls + Math.round(delay * 10), 60)) return;
  const t0 = ctx.currentTime + (delay || 0) + far * 0.3, dur = V.dur, G = V.gain * g;
  if (V.pop) { const s = noise(0.06); const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; const o = out(1, pan); env(o, t0, G * V.pop * 1.4, 0.002, 0.06); s.connect(hp); hp.connect(o); }
  if (V.crack) { const s = noise(0.25); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000 * (1 - far * 0.6); const o = out(1, pan); env(o, t0, G * V.crack * 1.6, 0.003, 0.22); s.connect(lp); lp.connect(o); }
  const t1 = t0 + (V.pop ? 0.07 : 0);
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t1, Math.random() * 1.5); n.stop(t1 + dur + 0.1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(V.band[0] * (1 - far * 0.5), t1); bp.frequency.exponentialRampToValueAtTime(V.band[1] * (1 - far * 0.5), t1 + dur);
  const o = out(1, pan); o.gain.setValueAtTime(0.0001, t1); o.gain.exponentialRampToValueAtTime(Math.max(0.0002, G), t1 + 0.04); o.gain.exponentialRampToValueAtTime(0.0001, t1 + dur);
  n.connect(bp);
  if (V.crackle) {
    // a motor's crackle: the roar chopped by fast random gain
    const am = ctx.createGain(); am.gain.value = 0.6;
    for (let t = 0; t < dur; t += 0.025) am.gain.setValueAtTime(0.35 + Math.random() * 0.9, t1 + t);
    bp.connect(am); am.connect(o);
  } else bp.connect(o);
  if (V.roar) { const n2 = noise(dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; const o2 = out(1, pan); env(o2, t0, G * V.roar, 0.05, dur * 0.9); n2.connect(lp); lp.connect(o2); }
}
A.missile = missile;
/* an interceptor meets its target: a hard, bright crack; a ballistic kill adds a heavy thump */
A.intercept = function (x, y, big) {
  if (!ctx || !A.on) return;
  const { g, pan, delay, far } = spatial(x, y, 1.6);
  if (g < 0.03 || !throttle('icpt', 90)) return;
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t0, Math.random()); s.stop(t0 + 0.2);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 * (1 - far * 0.6);
  const o = out(1, pan); env(o, t0, 0.3 * g, 0.001, 0.12); s.connect(hp); hp.connect(o);
  tone('triangle', 1800, 600, 0.12, 0.05 * g, null, delay);
  if (big) { const th = ctx.createOscillator(); th.frequency.setValueAtTime(90, t0); th.frequency.exponentialRampToValueAtTime(30, t0 + 0.8); const tg = out(1, pan); env(tg, t0, 0.45 * g, 0.004, 0.9); th.connect(tg); th.start(t0); th.stop(t0 + 1.1); }
};
/* the selected battery: a soft pulse while it tracks, quick high beeps while its missiles fly */
A.lock = function (state) {
  if (!ctx || !A.on || !state) return;
  if (state === 'guiding') { if (throttle('lock', 420)) { tone('square', 1760, 1760, 0.05, 0.018); tone('square', 1760, 1760, 0.05, 0.018, null, 0.1); } }
  else if (state === 'tracking') { if (throttle('lock', 1300)) tone('sine', 880, 880, 0.09, 0.016); }
};
A.gun = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 0.8);
  if (g < 0.05 || !throttle('gun', 350)) return;
  for (let i = 0; i < 7; i++) {
    const t0 = ctx.currentTime + i * 0.045;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t0, Math.random()); s.stop(t0 + 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const o = out(1, pan); env(o, t0, 0.22 * g, 0.002, 0.04);
    s.connect(hp); hp.connect(o);
  }
};
A.arty = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 1.6);
  if (g < 0.04 || !throttle('arty', 160)) return;
  const t0 = ctx.currentTime;
  const n = noise(1); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const o = out(1, pan); env(o, t0, 0.25 * g, 0.01, 0.8); n.connect(lp); lp.connect(o);
};
A.zap = function (x, y) {
  if (!ctx || !A.on) return;
  const { g } = spatial(x, y); if (g < 0.03) return;
  tone('sawtooth', 180, 2400, 0.6, 0.12 * g);
};
A.jet = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 1.2);
  if (g < 0.05 || !throttle('jet', 1500)) return;
  const t0 = ctx.currentTime, n = noise(3.2);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
  bp.frequency.setValueAtTime(500, t0); bp.frequency.linearRampToValueAtTime(1400, t0 + 1.5); bp.frequency.linearRampToValueAtTime(400, t0 + 3);
  const o = out(1, pan); o.gain.setValueAtTime(0.0001, t0); o.gain.exponentialRampToValueAtTime(0.18 * g, t0 + 1.4); o.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.1);
  n.connect(bp); bp.connect(o);
};
A.contact = function (t) {
  if (!ctx || !A.on || !throttle('contact', 400)) return;
  tone('sine', 1320, 1300, 0.18, 0.05);
  tone('sine', 1320, 1300, 0.12, 0.02, null, 0.22);
};
/* incident sounds: a two-note chime for an airliner off route, a rising tone for an intruder, an alarm for weapons */
A.chime = function () {
  if (!ctx || !A.on || !throttle('chime', 6000)) return;
  tone('sine', 988, 988, 0.35, 0.05, null, 0); tone('sine', 740, 740, 0.5, 0.045, null, 0.28);
};
A.tone = function () {
  if (!ctx || !A.on || !throttle('tone', 8000)) return;
  tone('triangle', 520, 880, 0.4, 0.04, null, 0);
};
A.alarm = function () {
  if (!ctx || !A.on || !throttle('alarm', 20000)) return;
  for (let i = 0; i < 6; i++) tone('sawtooth', i % 2 ? 540 : 720, i % 2 ? 540 : 720, 0.18, 0.035, null, i * 0.2);
};
A.klaxon = function () {
  if (!ctx || !A.on || !throttle('klaxon', 4000)) return;
  for (let i = 0; i < 4; i++) tone('square', i % 2 ? 620 : 820, i % 2 ? 620 : 820, 0.22, 0.05, null, i * 0.26);
};
A.siren = function (x, y) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 1.6);
  if (g < 0.05 || !throttle('siren', 25000)) return;
  const t0 = ctx.currentTime, T = 16;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  const og = out(1, pan); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.07 * g, t0 + 2); og.gain.setValueAtTime(0.07 * g, t0 + T - 3); og.gain.exponentialRampToValueAtTime(0.0001, t0 + T);
  lp.connect(og);
  for (const det of [1, 1.012]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    // wind up, wail, wind down, wail again
    o.frequency.setValueAtTime(140 * det, t0); o.frequency.linearRampToValueAtTime(560 * det, t0 + 3.5); o.frequency.setValueAtTime(560 * det, t0 + 6);
    o.frequency.linearRampToValueAtTime(330 * det, t0 + 8.5); o.frequency.linearRampToValueAtTime(560 * det, t0 + 10.5); o.frequency.setValueAtTime(560 * det, t0 + 12.5); o.frequency.linearRampToValueAtTime(120 * det, t0 + T);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 6; vib.connect(vg); vg.connect(o.frequency); vib.start(t0); vib.stop(t0 + T + 0.2);
    o.connect(lp); o.start(t0); o.stop(t0 + T + 0.2);
  }
};
A.radio = function () {
  if (!ctx || !A.on || !throttle('radio', 500)) return;
  const t0 = ctx.currentTime, n = noise(0.12);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.5;
  const g = ctx.createGain(); env(g, t0, 0.07, 0.004, 0.1); n.connect(bp); bp.connect(g); g.connect(sfxBus);
  tone('sine', 1000, 1000, 0.05, 0.04, null, 0.12); tone('sine', 1400, 1400, 0.05, 0.04, null, 0.19);
};
A.ui = function (kind) {
  if (!ctx || !A.on) return;
  if (kind === 'ok') { tone('sine', 660, 660, 0.09, 0.04); tone('sine', 990, 990, 0.12, 0.04, null, 0.09); }
  else if (kind === 'chapter') { tone('triangle', 440, 440, 0.6, 0.05); tone('triangle', 554, 554, 0.6, 0.04, null, 0.08); tone('triangle', 659, 659, 0.8, 0.04, null, 0.16); }
  else if (kind === 'err') tone('square', 140, 110, 0.15, 0.03);
  else if (throttle('click', 40)) tone('sine', 1900, 1700, 0.03, 0.02);
};

})(window.IC);
