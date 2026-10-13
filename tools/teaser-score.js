/* The teaser's sound (brief 60): a trailer score in D minor and the sound of the raid, synthesised here and written
   as a WAV, so nothing is licensed and every run makes the same file.
     node tools/teaser-score.js [--out=shots/teaser/score.wav]
   It reads the cut from tools/teaser.js (the shots and their lengths) and shots/teaser/shots.json (what each shot
   filmed, so a blast in the picture is heard on its frame). The score: a low drone and a string pad from the open,
   a ticking pulse from the launch that tightens as the missiles come, low brass hits ("braams") on the title cards,
   drums under the fight, a riser into silence, and the title on one last hit. The raid: launches roar, warheads
   crack high up, hits on the ground boom and rumble. */
const fs = require('fs');
const path = require('path');
const { CUT } = require('./teaser');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', 'shots/teaser/score.wav'));
const LOG = path.resolve(ROOT, arg('shots', 'shots/teaser/shots.json'));

const SR = 44100;
const starts = {}; let total = 0;
for (const s of CUT) { starts[s.name] = total; total += s.dur; }
total += 1.5;   // the last hit rings out
const N = Math.ceil(total * SR);
const L = new Float32Array(N), R = new Float32Array(N);       // the score, dry
const RL = new Float32Array(N), RR = new Float32Array(N);     // what goes to the reverb
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const T = name => starts[name];

/* a biquad low-pass (RBJ), its cutoff changeable per sample */
function lowpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, fc, q) => {
    const w = 2 * Math.PI * Math.min(fc, SR * 0.45) / SR, a = Math.sin(w) / (2 * (q || 0.707)), c = Math.cos(w);
    const b0 = (1 - c) / 2, b1 = 1 - c, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const y = (b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}
function highpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, fc, q) => {
    const w = 2 * Math.PI * fc / SR, a = Math.sin(w) / (2 * (q || 0.707)), c = Math.cos(w);
    const b0 = (1 + c) / 2, b1 = -(1 + c), a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const y = (b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}
const add = (i, l, r, wet) => { if (i < 0 || i >= N) return; L[i] += l; R[i] += r; if (wet) { RL[i] += l * wet; RR[i] += r * wet; } };
const env = (t, a, d) => t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d);

/* a voice of detuned saws through a filter: the pad, the brass and the drone are all this */
function saws(t0, dur, notes, o) {
  const n0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), lp = lowpass(), lp2 = lowpass(), ph = [];
  const det = o.det || [-0.08, 0, 0.07], pan = o.pan || 0;
  for (const f of notes) for (const d of det) ph.push({ f: midi(f + d), p: rnd() });
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = o.env(t, dur);
    if (e < 1e-5 && t > 0.1) { if (t > dur) break; continue; }
    let s = 0;
    for (const v of ph) { v.p += v.f / SR; if (v.p >= 1) v.p -= 1; s += 2 * v.p - 1; }
    s /= ph.length;
    const fc = o.cut(t, dur);
    s = lp2(lp(s, fc, o.q || 0.8), fc * 1.2, 0.6) * e * o.gain;
    add(n0 + i, s * (1 - pan) , s * (1 + pan), o.wet);
  }
}
/* a drum: a sine dropping in pitch, a click and a burst of noise */
function drum(t0, o) {
  const n0 = Math.floor(t0 * SR), n = Math.floor((o.len || 1.6) * SR), lp = lowpass();
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / (o.drop || 0.06));
    p += f / SR;
    const s = Math.sin(2 * Math.PI * p) * Math.exp(-t / (o.dec || 0.45)) + lp(noise(), o.nf || 1800) * Math.exp(-t / (o.ndec || 0.05)) * (o.nk || 0.5);
    add(n0 + i, s * o.gain, s * o.gain, o.wet || 0.25);
  }
}
/* noise through a moving filter: risers, whooshes, rumble */
function swish(t0, dur, o) {
  const n0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), lp = lowpass(), hp = highpass();
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / dur, x = noise();
    const s = hp(lp(x, o.lp(k), o.q || 1), o.hp ? o.hp(k) : 20) * o.env(k, t) * o.gain;
    const pan = o.pan ? o.pan(k) : 0;
    add(n0 + i, s * (1 - pan), s * (1 + pan), o.wet || 0.2);
  }
}
/* the raid's own sounds */
function boom(t0, k) {   // a hit on the ground: a crack, a deep thump and a long rolling rumble
  drum(t0, { f0: 90, f1: 28, drop: 0.12, dec: 0.9, len: 3, gain: 0.9 * k, nk: 1.2, nf: 3000, ndec: 0.12, wet: 0.35 });
  swish(t0, 6, { lp: q => 900 * Math.exp(-q * 4) + 60, env: (q, t) => env(t, 0.01, 1.4), gain: 1.1 * k, wet: 0.5 });
  swish(t0 + 0.3, 7, { lp: () => 160, env: (q, t) => env(t, 0.4, 2.2) * 0.8, gain: 1.2 * k, wet: 0.6 });
}
function crack(t0, k) {  // a warhead high up: a sharp crack, the rumble arriving later
  swish(t0, 0.4, { lp: () => 6000, hp: () => 800, env: (q, t) => env(t, 0.002, 0.06), gain: 0.9 * k, wet: 0.5 });
  drum(t0 + 0.02, { f0: 140, f1: 45, drop: 0.05, dec: 0.35, len: 1.5, gain: 0.5 * k, nk: 0.8, wet: 0.5 });
  swish(t0 + 0.6, 5, { lp: () => 220, env: (q, t) => env(t, 0.5, 1.6), gain: 0.7 * k, wet: 0.7 });
}
function roar(t0, k, len) {  // a motor lighting: a hiss that opens into a roar and fades as it goes
  swish(t0, len || 4, { lp: q => 400 + 3500 * Math.min(1, q * 6) * (1 - q * 0.7), hp: () => 60, env: (q, t) => env(t, 0.08, (len || 4) * 0.35), gain: 0.55 * k, wet: 0.35, pan: q => -0.3 + q * 0.6 });
  drum(t0, { f0: 70, f1: 35, drop: 0.1, dec: 0.5, len: 1.2, gain: 0.4 * k, nk: 0.3 });
}
function whoosh(t0, k) {  // something fast past the camera
  swish(t0 - 0.7, 1.6, { lp: q => 600 + 5000 * Math.exp(-Math.pow((q - 0.45) * 4, 2)), env: q => Math.exp(-Math.pow((q - 0.45) * 3.2, 2)), gain: 0.8 * k, wet: 0.15, pan: q => -0.9 + q * 1.8 });
}

/* ---------- the score ---------- */
const D = 38;   // D2
// the drone: D and A, low, from the open to the title, swelling with the fight
saws(0, T('title') - 0.4, [D - 12, D - 5], { gain: 0.32, wet: 0.2, det: [-0.05, 0.05], env: (t, d) => Math.min(1, t / 4) * Math.min(1, (d - t) / 0.3), cut: t => 140 + 260 * Math.min(1, Math.max(0, (t - T('wakes')) / 30)) });
// the pad: Dm, Bb, F, C in long chords, quiet at first
const chords = [[D + 12, D + 17, D + 21], [D + 8, D + 12, D + 17], [D + 7, D + 12, D + 15], [D + 10, D + 14, D + 17]];
const padEnd = T('through');
for (let t = 0.5, i = 0; t < padEnd; t += 6, i++) {
  const c = chords[i % 4], len = Math.min(6.6, padEnd - t + 0.4);
  saws(t, len, c, { gain: 0.11 + 0.05 * Math.min(1, t / 40), wet: 0.6, pan: (i % 2 ? 0.15 : -0.15), env: (tt, d) => Math.min(1, tt / 1.8) * Math.min(1, (d - tt) / 1.2), cut: tt => 900 + 600 * Math.sin(tt * 0.6) ** 2 });
}
// the pulse: from the launch, a muted low string ticking in sixteenths, tighter and louder as they come
const bpm = 110, six = 60 / bpm / 4;
for (let t = T('launch'); t < T('through') - 0.05; t += six) {
  const k = (t - T('launch')) / (T('through') - T('launch')), step = Math.round((t - T('launch')) / six) % 16;
  const acc = step % 4 === 0 ? 1 : 0.55, note = [D, D, D + 12, D, D, D + 10, D, D + 12, D, D, D + 12, D, D + 15, D, D + 12, D + 10][step];
  saws(t, 0.18, [note], { gain: (0.05 + 0.13 * k) * acc, wet: 0.15, det: [-0.03, 0.03], env: tt => env(tt, 0.004, 0.06), cut: () => 900 + 2200 * k });
  if (step % 4 === 2) swish(t, 0.08, { lp: () => 9000, hp: () => 5000, env: (q, tt) => env(tt, 0.001, 0.02), gain: 0.06 + 0.1 * k, wet: 0.05 });
}
// drums under the fight: a big hit on every bar, more as it builds
for (let t = T('wakes'); t < T('through') - 0.1; t += six * 16) {
  drum(t, { f0: 120, f1: 42, drop: 0.07, dec: 0.5, gain: 0.55, wet: 0.35 });
  drum(t + six * 6, { f0: 110, f1: 45, drop: 0.06, dec: 0.4, gain: 0.35, wet: 0.3 });
  if (t > T('kill')) for (const b of [10, 12, 14]) drum(t + six * b, { f0: 160, f1: 60, drop: 0.04, dec: 0.25, gain: 0.25, wet: 0.25 });
}
// braams: low brass hits on the cards and the turns of the story
const braam = (t, notes, k, len) => {
  saws(t, len || 4, notes, { gain: 0.5 * k, wet: 0.45, det: [-0.12, -0.04, 0.04, 0.11], env: (tt, d) => env(tt, 0.03, (d) * 0.35), cut: tt => 150 + 2200 * Math.exp(-tt * 1.4) + 300 * Math.exp(-tt * 0.3), q: 1.4 });
  drum(t, { f0: 60, f1: 26, drop: 0.2, dec: 1.4, len: 3.5, gain: 0.8 * k, nk: 0.4, wet: 0.4 });
};
braam(T('launch') + 0.6, [D - 12, D, D + 7], 0.8);
braam(T('wakes'), [D - 14, D - 2, D + 5], 1);
braam(T('through'), [D - 12, D, D + 3, D + 7], 1.15, 3);
// a riser into the last cards: noise and a climbing tone, cut dead for half a second before the title
const r0 = T('out'), r1 = T('title') - 0.45;
swish(r0, r1 - r0, { lp: q => 300 + 9000 * q * q, hp: q => 100 + 2000 * q, env: q => q * q, gain: 0.45, wet: 0.3 });
saws(r0, r1 - r0, [D + 12], { gain: 0.12, wet: 0.4, env: (t, d) => (t / d) ** 2, cut: (t, d) => 300 + 5000 * (t / d) ** 2 });
for (let i = 0; i < 4; i++) drum(r1 - 0.8 + i * 0.2, { f0: 140 + i * 20, f1: 60, drop: 0.04, dec: 0.2, gain: 0.25 + 0.1 * i, wet: 0.3 });
// the title: one hit, and the chord left to ring
braam(T('title'), [D - 24, D - 12, D, D + 3, D + 7], 1.3, 6);
saws(T('title') + 0.1, 6, [D + 12, D + 15, D + 19, D + 24], { gain: 0.12, wet: 0.8, env: (t, d) => Math.min(1, t / 0.8) * Math.min(1, (d - t) / 2.5), cut: () => 2400 });

/* ---------- the raid's sound, on its frames ---------- */
let log = {};
try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { console.log('no shots.json: the score has no raid sounds'); }
const ev = log.ev || [], fps = log.fps || 30;
const at = [];   // [film time, kind, loudness]
for (const s of CUT) {
  const st = starts[s.name];
  if (s.kind === '2d') for (const e of ev) { const f = (e.t - s.at) / s.g; if (f >= 0 && f < s.dur) at.push([st + f, e.kind, 0.35, e.cls]); }
  if (s.kind === '3d' && log[s.name]) {
    const { t, times } = log[s.name];
    for (const e of ev) {
      const g = e.t - t; if (g < times[0] || g > times[times.length - 1]) continue;
      let i = 0; while (i < times.length - 1 && times[i] < g) i++;
      at.push([st + i / fps, e.kind, 1, e.cls]);
    }
  }
}
for (const [t, kind, k, cls] of at) {
  if (kind === 'impact') boom(t, k * (cls === 'bal' ? 1.2 : 1));
  else if (kind === 'intercept' || kind === 'kill') crack(t, k * 0.8);
  else if (kind === 'launch') roar(t, k * 0.6, 3);
}
// the ballistic missile's own launch, and the cruise missile past the camera
if (starts.launch != null && log.launch) roar(starts.launch + 1.2, 1.3, 5);
if (starts.flyby != null) whoosh(starts.flyby + 2.2, 1.1);
if (starts.chase != null) swish(starts.chase, 3.2, { lp: () => 2500, hp: () => 200, env: (q, t) => Math.min(1, t / 0.2) * (1 - q * 0.5), gain: 0.25, wet: 0.1 });
console.log(`${at.length} raid sounds`);

/* ---------- reverb (a Schroeder hall), mix and limit ---------- */
function reverb(inp, out, delays, ap) {
  const combs = delays.map(d => ({ b: new Float32Array(Math.floor(d * SR)), i: 0, f: 0 })), aps = ap.map(d => ({ b: new Float32Array(Math.floor(d * SR)), i: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) { const y = c.b[c.i]; c.f = y * 0.7 + c.f * 0.3; c.b[c.i] = inp[n] + c.f * 0.84; c.i = (c.i + 1) % c.b.length; s += y; }
    s /= combs.length;
    for (const a of aps) { const y = a.b[a.i]; const x = s + y * 0.5; a.b[a.i] = x; a.i = (a.i + 1) % a.b.length; s = y - x * 0.5; }
    out[n] += s * 0.9;
  }
}
reverb(RL, L, [0.0297, 0.0371, 0.0411, 0.0437, 0.0533, 0.0617], [0.005, 0.0017]);
reverb(RR, R, [0.0313, 0.0353, 0.0429, 0.0461, 0.0557, 0.0601], [0.0051, 0.0016]);
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.89 / Math.max(1e-6, peak);
// fade the very end
const fadeN = Math.floor(1.2 * SR);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = i > N - fadeN ? (N - i) / fadeN : 1;
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log('saved', OUT, total.toFixed(1) + ' s');
