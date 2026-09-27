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
A.launch = function (x, y, s) {
  if (!ctx || !A.on) return;
  const { g, pan } = spatial(x, y, 1.1);
  if (g < 0.03 || !throttle('launch', 90)) return;
  const t0 = ctx.currentTime, dur = 0.9 + (s || 1) * 0.6;
  const n = noise(dur + 0.2);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(2600, t0); bp.frequency.exponentialRampToValueAtTime(500, t0 + dur);
  const o = out(1, pan); env(o, t0, 0.35 * g, 0.03, dur);
  n.connect(bp); bp.connect(o);
  const n2 = noise(dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
  const o2 = out(1, pan); env(o2, t0, 0.3 * g, 0.02, dur * 0.8); n2.connect(lp); lp.connect(o2);
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
  const { g, pan } = spatial(x, y, 1.4);
  if (g < 0.05 || !throttle('siren', 25000)) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  for (let c = 0; c < 2; c++) { o.frequency.setValueAtTime(280, t0 + c * 7); o.frequency.linearRampToValueAtTime(720, t0 + c * 7 + 3.5); o.frequency.linearRampToValueAtTime(280, t0 + c * 7 + 7); }
  const og = out(1, pan); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.06 * g, t0 + 1); og.gain.setValueAtTime(0.06 * g, t0 + 12); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 14);
  o.connect(lp); lp.connect(og); o.start(t0); o.stop(t0 + 14.2);
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
