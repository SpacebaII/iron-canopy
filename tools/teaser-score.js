/* The teaser's sound (brief 60): a trailer score in D minor and the sound of the raid, synthesised here and written
   as a WAV, so nothing is licensed and every run makes the same file.
     node tools/teaser-score.js [--out=shots/teaser/score.wav] [--shots=shots/teaser/shots.json]
   It reads the cut from tools/teaser.js (the shots and their lengths) and shots/teaser/shots.json (what each shot
   filmed, so a blast in the picture is heard on its frame). The score: a low drone and a string pad from the open,
   a ticking pulse from the launch that tightens as the missiles come, low brass hits ("braams") on the title cards,
   drums under the fight, a riser into silence, and the title on one last hit.
   The raid is built in layers, the way a film's sound is: each sound is a few voices (a crack, a body, a roar, a
   tail) shaped by how far it is (quieter, darker, later) and by the shot's slow motion (lower, longer). Wind, a
   distant siren and the fire fill the gaps. Three buses (music, ambience, effects) meet in the mix: the music and
   the ambience duck under big hits, the effects ring in an open-air reverb and a rolling echo, and a compressor
   and a look-ahead limiter make the hits loud without clipping. */
const fs = require('fs');
const path = require('path');
const { CUT } = require('./teaser');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', 'shots/teaser/score.wav'));
const LOG = path.resolve(ROOT, arg('shots', 'shots/teaser/shots.json'));
const CLOCK = Date.now();

const SR = 44100, C = 340;   // sample rate; the speed of sound, m/s
const starts = {}; let total = 0;
for (const s of CUT) { starts[s.name] = total; total += s.dur; }
total += 1.5;   // the last hit rings out
const N = Math.ceil(total * SR);
const T = name => starts[name];
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N), wL: new Float32Array(N), wR: new Float32Array(N), eL: new Float32Array(N), eR: new Float32Array(N) });
const MUS = bus(), AMB = bus(), SFX = bus();
let B = MUS, cur = 0;   // the bus being written, the sample a voice is at
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const env = (t, a, d) => t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d);

/* ---------- building blocks ---------- */
/* an RBJ biquad, low-pass, high-pass or band-pass (0 dB peak); the cutoff can move per sample (it is recomputed
   only when it moves by more than 0.3%) */
function bq(type) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, lf = 0, lq = 0;
  return (x, fc, q = 0.707) => {
    if (Math.abs(fc - lf) > lf * 0.003 || q !== lq) {
      lf = fc; lq = q;
      const w = 2 * Math.PI * clamp(fc, 10, SR * 0.45) / SR, s = Math.sin(w), c = Math.cos(w), al = s / (2 * q), a0 = 1 + al;
      if (type === 'lp') { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
      else { b0 = al / a0; b1 = 0; b2 = -al / a0; }
      a1 = -2 * c / a0; a2 = (1 - al) / a0;
    }
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}
const lowpass = () => bq('lp'), highpass = () => bq('hp');
function pink() {   // -3 dB an octave (Kellet's filter): wind, roar
  let b0 = 0, b1 = 0, b2 = 0;
  return () => { const w = noise(); b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; return (b0 + b1 + b2 + w * 0.1848) * 0.25; };
}
function brown() { let y = 0; return () => (y = (y + 0.04 * noise()) * 0.996) * 2.5; }   // rumble
function wob(rate) {   // a smooth random value 0..1, a new aim rate times a second: flutter, gusts
  let a = rnd(), b = rnd(), ph = 0;
  return () => { ph += rate / SR; if (ph >= 1) { ph -= 1; a = b; b = rnd(); } return a + (b - a) * (1 - Math.cos(Math.PI * ph)) / 2; };
}
/* crackle: sparse positive shocks with a heavy-tailed size, high-passed, as a rocket motor or a fire makes */
function crackler() {
  let v = 0; const hp = bq('hp');
  return (dens, fc, pow = 4) => { if (rnd() < dens / SR) v += Math.pow(rnd(), pow) * 3; v *= 0.55; return hp(v, fc); };
}
const nwave = (t, len) => t >= 0 && t < len ? 1 - 2 * t / len : 0;   // a shock wave as it passes: up, ramp, back
const air = d => clamp(20000 / (1 + d / 600), 180, 19000);           // what is left of the highs over d metres
const att = (d, ref) => ref / Math.max(ref, d);                      // spreading loss against a reference distance
/* run a voice from t0 for dur seconds: f(t) is called once a sample and puts its sound with put() */
function voice(t0, dur, f) {
  const n0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let i = Math.max(0, -n0); i < n && n0 + i < N; i++) { cur = n0 + i; f(i / SR); }
}
function put(l, r, wet, echo) {
  const i = cur; B.L[i] += l; B.R[i] += r;
  if (wet) { B.wL[i] += l * wet; B.wR[i] += r * wet; }
  if (echo) { B.eL[i] += l * echo; B.eR[i] += r * echo; }
}
const panL = p => 1 - Math.max(0, p), panR = p => 1 + Math.min(0, p);   // a balance: +1 is right
const add = (i, l, r, wet) => { if (i < 0 || i >= N) return; cur = i; put(l, r, wet); };

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
    add(n0 + i, s * (1 - pan), s * (1 + pan), o.wet);
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
/* noise through a moving filter: risers, whooshes */
function swish(t0, dur, o) {
  const n0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), lp = lowpass(), hp = highpass();
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / dur, x = noise();
    const s = hp(lp(x, o.lp(k), o.q || 1), o.hp ? o.hp(k) : 20) * o.env(k, t) * o.gain;
    const pan = o.pan ? o.pan(k) : 0;
    add(n0 + i, s * (1 - pan), s * (1 + pan), o.wet || 0.2);
  }
}

/* ---------- the score ---------- */
B = MUS;
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
// the title: one hit, a sub drop under it, and the chord left to ring
braam(T('title'), [D - 24, D - 12, D, D + 3, D + 7], 1.3, 6);
drum(T('title'), { f0: 55, f1: 24, drop: 0.5, dec: 2.2, len: 5, gain: 0.7, nk: 0.9, nf: 900, ndec: 0.25, wet: 0.5 });
saws(T('title') + 0.1, 6, [D + 12, D + 15, D + 19, D + 24], { gain: 0.12, wet: 0.8, env: (t, d) => Math.min(1, t / 0.8) * Math.min(1, (d - t) / 2.5), cut: () => 2400 });

/* ---------- where the picture is: film time against the game's clock in each 3D shot ---------- */
let log = {};
try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { console.log('no shots.json: the score has no raid sounds from the record'); }
const ev = log.ev || [], fps = log.fps || 30;
// game seconds since the shot's start at film time ft, and the shot's speed there (game s a film s: under 1 is slow motion)
function clockOf(name) {
  const st = starts[name], L = log[name];
  if (!L || !L.times || L.times.length < 2) return { g: ft => ft - st, sp: () => 1, f: g => st + g };
  const tm = L.times, n = tm.length;
  const sp = ft => { const i = clamp(Math.floor((ft - st) * fps), 0, n - 2); return (tm[i + 1] - tm[i]) * fps; };
  const g = ft => { const x = (ft - st) * fps, i = clamp(Math.floor(x), 0, n - 2); return tm[i] + (x - i) * (tm[i + 1] - tm[i]); };
  const f = gg => { let i = 0; while (i < n - 2 && tm[i + 1] <= gg) i++; return st + (i + (gg - tm[i]) / Math.max(1e-6, tm[i + 1] - tm[i])) / fps; };
  return { g, sp, f };
}
// slow motion is heard lower and longer: a pitch factor for the shot's speed
const slowOf = s => clamp(Math.pow(s, 0.3), 0.55, 1);
/* each 3D shot is built round one moment (PICK in teaser.js): the game seconds after the shot's start it happens at,
   the event it is, and how far the camera is from it, km */
const FOCUS = {
  launch: { g: 0.2, km: 0.85 }, flyby: { g: 2.1, km: 0.045 }, sam: { g: 1, kind: 'launch', km: 0.25 },
  kill: { g: 1.9, kind: 'kill', km: 1.2 }, high: { g: 2.1, kind: 'intercept', km: 16 },
  hit: { g: 2.2, kind: 'impact', km: 0.65 }, hit2: { g: 1, kind: 'impact', km: 1 }
};
const focusAt = name => starts[name] != null && FOCUS[name] ? clockOf(name).f(FOCUS[name].g) : null;

/* ---------- the raid's sounds ---------- */
B = SFX;
/* a sharp shock: the N-wave and a hiss of high noise after it */
function crack(t0, o) {
  const hp = bq('hp'), lp = bq('lp'), len = o.len || 0.004, fc = air(o.d || 50);
  voice(t0, 0.35, t => {
    const s = nwave(t, len) * 1.4 + hp(noise(), 1200) * env(t, 0.0005, o.dec || 0.025);
    const y = lp(s, fc) * o.gain;
    put(y * panL(o.pan || 0), y * panR(o.pan || 0), o.wet || 0.4, o.echo || 0.5);
  });
}
/* a thump: a sine dropping in pitch, run through a soft clip so it is heard on small speakers too */
function thump(t0, o) {
  let p = 0;
  voice(t0, o.len || 2.5, t => {
    const f = (o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.drop)) * (o.sl || 1); p += f / SR;
    const y = Math.tanh(2 * Math.sin(2 * Math.PI * p)) * 0.6 * env(t, 0.003, o.dec) * o.gain;
    put(y, y, o.wet || 0.15, o.echo || 0);
  });
}
/* the motor of a rocket: a tearing roar of two noises, flutter and crackle, and a low rumble; d(t) metres away,
   sl(t) its pitch (slow motion, doppler), lvl(t) its loudness, pan(t) where it is */
function motor(t0, dur, o) {
  const nl = pink(), nr = pink(), lL = bq('lp'), lR = bq('lp'), hL = bq('hp'), hR = bq('hp'), cl = crackler(), cr = crackler(),
    cpl = bq('lp'), cpr = bq('lp'), br = brown(), rl = bq('lp'), fl = wob(16), fl2 = wob(5);
  voice(t0, dur, t => {
    const d = o.d(t), sl = o.sl(t), g = o.lvl(t) * Math.pow(att(d, o.ref), 0.7), fc = Math.min(air(d), o.bright) * sl, w = clamp(o.ref / d, 0.15, 1);
    if (g < 1e-5) return;
    const flut = 0.55 + 0.9 * fl() * (0.6 + 0.4 * fl2());
    const a = hL(lL(nl(), fc, 0.6), 50), b = hR(lR(nr(), fc, 0.6), 50);
    const dens = o.crackle * sl, ca = cpl(cl(dens, 600 * sl), fc * 1.4), cb = cpr(cr(dens, 600 * sl), fc * 1.4);
    const rum = rl(br(), 110 * sl) * 2.2 * w;
    const m = (a + b) / 2, p = o.pan(t);   // close the roar is wide; far it narrows to a point
    const yl = ((m + (a - m) * w) * flut * 1.6 + ca * o.ck + rum) * g, yr = ((m + (b - m) * w) * flut * 1.6 + cb * o.ck + rum) * g;
    put(yl * panL(p), yr * panR(p), 0.3, 0.15);
  });
}
/* grit: many small strikes rung through two banks of resonances, one a side, and dirt thuds under them */
function grit(t0, dur, o) {
  const fr = [1700, 2600, 3500, 4700, 6100], bL = fr.map(() => bq('bp')), bR = fr.map(() => bq('bp')), q = o.q || 9;
  const xL = new Float64Array(fr.length), xR = new Float64Array(fr.length), tL = bq('lp'), tR = bq('lp'), lp = bq('lp');
  voice(t0, dur, t => {
    xL.fill(0); xR.fill(0);
    let dl = 0, dr = 0;
    if (rnd() < o.rate(t) / SR) {
      const a = Math.pow(rnd(), 2), k = Math.floor(rnd() * fr.length), side = rnd();
      if (rnd() < o.dirt) { dl = a * side * 6; dr = a * (1 - side) * 6; } else { xL[k] = a * side * 30; xR[k] = a * (1 - side) * 30; }
    }
    let l = 0, r = 0;
    for (let k = 0; k < fr.length; k++) { l += bL[k](xL[k], fr[k] * (o.sl || 1), q); r += bR[k](xR[k], fr[k] * (o.sl || 1), q); }
    const f = air(o.d || 50);
    const yl = (lp(l, f) + tL(dl, 260)) * o.gain, yr = (lp(r, f) + tR(dr, 260)) * o.gain;
    put(yl, yr, 0.25, 0.1);
  });
}
/* a long low roll: lowpassed rumble with a slow swell, the sound of a blast coming back off the land */
function roll(t0, dur, o) {
  const a = brown(), b = brown(), la = bq('lp'), lb = bq('lp'), m = wob(o.rate || 2.5);
  voice(t0, dur, t => {
    const e = env(t, o.att || 0.25, o.dec) * (0.45 + 0.8 * m() ** 2) * o.gain, fc = o.fc * (1 - 0.5 * Math.min(1, t / dur));
    put(la(a(), fc) * e, lb(b(), fc) * e, o.wet || 0.5, o.echo || 0.3);
  });
}
/* the blast itself: wideband noise whose cutoff falls as it spreads */
function blast(t0, o) {
  const a = bq('lp'), b = bq('lp');
  voice(t0, o.len || 2.5, t => {
    const fc = (o.top * Math.exp(-t / o.fall) + o.bot) * (o.sl || 1), e = env(t, 0.002, o.dec) * o.gain;
    put(a(noise(), fc) * e, b(noise(), fc) * e, o.wet || 0.35, o.echo || 0.4);
  });
}

/* a rocket leaving the rail: an ignition crack and slam, then the motor tearing away up into the sky */
function rocket(t0, o) {
  const sl = o.sl || (() => 1);
  crack(t0, { gain: 0.9 * o.k, d: o.d0, len: 0.006, dec: 0.04, echo: 0.8 });
  thump(t0, { f0: 70, f1: 28, drop: 0.18, dec: 0.9, gain: 1.2 * o.k, sl: sl(0) });
  blast(t0, { top: 1500, bot: 120, fall: 0.15, dec: 0.3, gain: 0.7 * o.k, len: 1.2, sl: sl(0) });
  motor(t0 + 0.03, o.dur, { d: o.d, sl, ref: o.d0, bright: o.bright || 2600, crackle: o.crackle || 700, ck: o.ck || 0.8,
    pan: o.pan || (() => 0), lvl: t => o.k * env(t, 0.12, 99) * (o.lvl ? o.lvl(t) : 1) });
}
/* a SAM out of its canister close by: the hiss of the eject, the bang of the motor, gravel thrown, the roar going */
function samLaunch(t0, o) {
  const hp = bq('hp');
  voice(t0 - 0.2, 0.24, t => { const y = hp(noise(), 3500) * Math.pow(t / 0.2, 3) * (t < 0.2 ? 1 : Math.exp(-(t - 0.2) / 0.01)) * 0.35 * o.k; put(y, y, 0.3); });
  rocket(t0, { k: o.k, d0: o.d0, dur: 5.5, sl: o.sl, d: t => o.d0 * (1 + Math.pow(Math.max(0, t), 1.5) * 3), bright: 4200, crackle: 1400, ck: 1, pan: t => clamp(t * 0.15, 0, 0.4), lvl: o.lvl });
  thump(t0, { f0: 110, f1: 40, drop: 0.05, dec: 0.35, gain: 0.8 * o.k, echo: 0.3 });
  grit(t0 + 0.04, 2.6, { rate: t => 900 * Math.exp(-t / 0.35) + 40 * Math.exp(-t / 1.2), dirt: 0.3, gain: 0.22 * o.k, sl: o.sl(0.3) });
}
/* a jet engine past the camera: the turbine whine and the fan with a doppler fall, the roar, the whoosh of the
   air as it passes; x(t) metres along its path (0 abeam), dmin metres off it. cut: stop dead there (it hits). */
function jet(t0, dur, o) {
  const nl = pink(), lp1 = bq('lp'), lp2 = bq('lp'), lp3 = bq('lp'), bpL = bq('bp'), bpR = bq('bp'), roarL = bq('bp'), roarR = bq('bp'), fm = wob(9);
  let p1 = 0, p2 = 0, p3 = 0, xo = o.x(0);
  voice(t0, dur, t => {
    const x = o.x(t), dx = (x - xo) * SR; xo = x;   // metres a second along the path
    const d = Math.hypot(x, o.dmin), vr = -dx * x / d * 0.55, dop = C / (C - clamp(vr, -250, 250)), sl = o.sl(t);
    let e = Math.min(1, t / 0.3) * Math.min(1, (dur - t) / 0.3);
    if (o.cut != null) e *= t < o.cut ? 1 : Math.exp(-(t - o.cut) / 0.01);
    if (e < 1e-5) return;
    const g = Math.pow(att(d, 45), 0.75) * o.k * e, fc = air(d), f = dop * sl;   // loudness against 45 m
    p1 += o.whine * f * (1 + 0.004 * (fm() - 0.5)) / SR; p2 += o.whine * 0.37 * f / SR; p3 += o.whine * 2.02 * f / SR;
    const tone = Math.sin(2 * Math.PI * p1) * 0.5 + Math.sin(2 * Math.PI * p2) * 0.6 + Math.sin(2 * Math.PI * p3) * 0.15;
    const n = noise(), m = nl();
    const near = Math.pow(Math.min(1, 60 / d), 2), wc = 400 + 3800 * near;   // the whoosh only when it is within metres
    const rl = roarL(m, 900 * f, 0.5), rr = roarR(nl(), 900 * f, 0.5);
    const wl = bpL(n, wc * sl, 0.8) * near * 3, wr = bpR(noise(), wc * sl, 0.8) * near * 3;
    const c = lp1(tone * 0.35, fc), pan = clamp(-x / d, -1, 1) * (o.dir || 1) * 0.85;
    const l = (c + lp2(rl, fc) * 1.2 + wl) * g, r = (c + lp3(rr, fc) * 1.2 + wr) * g;
    put(l * panL(pan), r * panR(pan), 0.2, 0.1);
  });
}
/* a warhead going off in the air dkm away: the crack heard later (sound at 340 m/s, cheated to a quarter as film
   sound is), a body, and a roll coming back off the land; far ones are only a muffled thump and the roll */
function burst(t0, dkm, o = {}) {
  const k = o.k || 1, sl = o.sl || 1, near = clamp(1 - (dkm - 0.4) / 5, 0, 1), d = dkm * 1000;
  const t = t0 + Math.min(1.1, d / C * 0.25);
  if (near > 0) crack(t, { gain: 1.1 * near * k, d, len: 0.003 + 0.002 * dkm, dec: 0.02 + 0.03 * dkm, echo: 1, wet: 0.5 });
  thump(t, { f0: 120 - 50 * (1 - near), f1: 38, drop: 0.06, dec: 0.35 + 0.4 * (1 - near), gain: (0.5 + 0.4 * near) * k, sl, echo: 0.3 });
  blast(t, { top: 400 + 4000 * near * near, bot: 90, fall: 0.2, dec: 0.25 + 0.5 * (1 - near), gain: 0.55 * k, sl, len: 2 });
  roll(t + 0.1, 4 + 2 * (1 - near), { fc: 180 + 300 * near, dec: 1.4 + 1.2 * (1 - near), gain: 0.75 * k, rate: 2, echo: 0.5 });
}
/* a warhead into the ground d metres off: a crack, a sub-bass thump falling 50 to 25 Hz, the blast, debris
   raining back down and a long rumble; on fuel the tanks go up in a whoomph a moment later */
function impact(t0, o) {
  const k = o.k, sl = o.sl || 1, d = o.d || 600, near = clamp(1 - d / 6000, 0, 1);
  const t = t0 + Math.min(0.6, Math.max(0, d - 1500) / C * 0.15);   // close ones on the frame, as film cheats it
  crack(t, { gain: 1.5 * k * near, d, len: 0.006, dec: 0.05, echo: 1, wet: 0.5 });
  thump(t, { f0: 50, f1: 25, drop: 0.35, dec: 1.4 / sl, len: 4, gain: 1.6 * k, sl });
  thump(t, { f0: 150, f1: 60, drop: 0.05, dec: 0.25, gain: 0.6 * k * near, sl, echo: 0.3 });
  blast(t, { top: 3500 * near + 300, bot: 140, fall: 0.5 / sl, dec: 0.9 / sl, gain: 1.5 * k, sl, len: 4 });
  grit(t + 0.35, 5, { rate: q => 380 * Math.exp(-q / 1.4) * near + 4, dirt: 0.45, gain: 0.18 * k, d, sl });
  roll(t + 0.2, 9, { fc: 140, att: 0.4, dec: 3.2 / sl, gain: 1.0 * k, rate: 1.2, echo: 0.6 });
  if (o.fuel) {   // the fireball breathing in, then the tanks' roar
    const a = bq('lp'), b = bq('lp');
    voice(t + 0.15, 3, q => {
      const fc = (150 + 850 * Math.sin(Math.PI * Math.min(1, q / 1.2)) ** 1.5) * sl, e = env(q, 0.18, 0.9) * 1.1 * k;
      put(a(noise(), fc) * e, b(noise(), fc) * e, 0.4, 0.3);
    });
    thump(t + 0.15, { f0: 45, f1: 32, drop: 0.4, dec: 1, gain: 0.9 * k, sl });
  }
}
/* a ballistic warhead coming down faster than sound: a tearing shriek falling in pitch in the last half second */
function shriek(t1, k) {
  const a = bq('bp'), b = bq('bp');
  voice(t1 - 0.6, 0.62, t => { const q = t / 0.6, fc = 5000 - 3800 * q, e = q * q * k * (q < 1 ? 1 : 0); put(a(noise(), fc, 2) * e, b(noise(), fc * 1.03, 2) * e, 0.3, 0.2); });
}
/* a whoosh far off on the map: a missile off its launcher */
function puff(t0, k) {
  const a = bq('bp');
  voice(t0, 1.2, t => { const e = env(t, 0.06, 0.35) * k, y = a(noise(), 900 + 1500 * Math.exp(-t * 3), 0.7) * e; put(y * 0.8, y, 0.4, 0.2); });
  thump(t0, { f0: 80, f1: 40, drop: 0.08, dec: 0.25, gain: 0.25 * k });
}

/* ---------- the shots ---------- */
const at = [];   // [film time, kind, loudness, class, km] for the record's events
const focus = {};
for (const s of CUT) {
  const st = starts[s.name];
  if (s.kind === '2d') for (const e of ev) { const f = (e.t - s.at) / s.g; if (f >= 0 && f < s.dur) at.push([st + f, e.kind, 0.35, e.cls, 6]); }
  if (s.kind === '3d' && log[s.name]) {
    const { t, times } = log[s.name], F = FOCUS[s.name];
    // a shot's own moment is designed below; the other events heard only if the record is the one it was filmed from
    const fe = F && F.kind ? ev.find(e => e.kind === F.kind && Math.abs(e.t - t - F.g) < 0.6) : null;
    if (F) focus[s.name] = fe;
    if (F && !fe) continue;
    for (const e of ev) {
      const g = e.t - t; if (e === fe || g < times[0] || g > times[times.length - 1]) continue;
      let i = 0; while (i < times.length - 1 && times[i] < g) i++;
      const km = fe ? Math.hypot(F.km, U100(e.x - fe.x, e.y - fe.y), (e.alt || 0) - (fe.alt || 0)) : 1;
      at.push([st + i / fps, e.kind, 1, e.cls, km, slowOf(clockOf(s.name).sp(st + i / fps))]);
    }
  }
}
function U100(dx, dy) { return Math.hypot(dx, dy) * 0.1; }   // world units to km
for (const [t, kind, k, cls, km, sl] of at) {
  if (kind === 'impact') impact(t, { k: k * (cls === 'bal' ? 1.2 : 1), d: km * 1000, sl });
  else if (kind === 'intercept' || kind === 'kill') burst(t, km, { k: k * 0.7, sl });
  else if (kind === 'launch') puff(t, k * 0.8);
}

// the ballistic missile off its launcher 850 m away in slow motion, tearing up and away into the next shot
if (focusAt('launch') != null) {
  const t0 = focusAt('launch'), ck = clockOf('launch'), end = T('launch') + CUT.find(s => s.name === 'launch').dur;
  rocket(t0, { k: 0.9, d0: 850, dur: 8, sl: t => slowOf(ck.sp(t0 + t)) * (1 - 0.25 * Math.min(1, t / 4)),
    d: t => 850 * (1 + t * t * 0.45), pan: t => clamp(t * 0.06, 0, 0.3), lvl: t => t0 + t < end ? 1 : 0.35 * Math.exp(-(t0 + t - end) / 1.2), crackle: 900, bright: 3800, ck: 1.2 });
}
// a cruise missile low past the camera: 250 m/s, 45 m off, its pass slowed down
if (focusAt('flyby') != null) {
  const ck = clockOf('flyby'), gc = FOCUS.flyby.g, st = T('flyby'), dur = CUT.find(s => s.name === 'flyby').dur;
  jet(st, dur + 0.4, { x: t => 250 * (ck.g(st + t) - gc), dmin: 45, k: 0.75, whine: 3100, sl: t => slowOf(ck.sp(st + t)), dir: 1 });
}
// the medium-range battery fires 250 m from the camera
if (focusAt('sam') != null) {
  const t0 = focusAt('sam'), ck = clockOf('sam'), end = T('sam') + CUT.find(s => s.name === 'sam').dur;
  samLaunch(t0, { k: 1.2, d0: 250, sl: t => slowOf(ck.sp(t0 + t)), lvl: t => t0 + t < end ? 1 : 0.3 * Math.exp(-(t0 + t - end) / 0.8) });
}
// a cruise missile coming at the camera 1.2 km off and shot down
if (focusAt('kill') != null) {
  const ck = clockOf('kill'), st = T('kill'), tk = focusAt('kill');
  jet(st, tk - st + 0.1, { x: t => 250 * (ck.g(st + t) - FOCUS.kill.g) - 400, dmin: 1200, k: 0.9, whine: 3100, sl: t => slowOf(ck.sp(st + t)), cut: tk - st, dir: -1 });
  burst(tk, FOCUS.kill.km, { k: 1.2, sl: slowOf(ck.sp(tk)) });
}
// a ballistic missile met 15 km up: a long way off, a muffled thump and a roll like thunder
if (focusAt('high') != null) burst(focusAt('high'), FOCUS.high.km, { k: 1.3, sl: slowOf(clockOf('high').sp(focusAt('high'))) });
// what gets through: a cruise missile into the fuel farm, its whine growing until it hits; then a ballistic warhead
if (focusAt('hit') != null) {
  const ck = clockOf('hit'), st = T('hit'), ti = focusAt('hit');
  jet(st, ti - st + 0.05, { x: t => 250 * (ck.g(st + t) - FOCUS.hit.g), dmin: 600, k: 1.4, whine: 2900, sl: t => slowOf(ck.sp(st + t)), cut: ti - st, dir: -1 });
  impact(ti, { k: 1.25, d: 650, sl: slowOf(ck.sp(ti + 0.2)), fuel: true });
}
if (focusAt('hit2') != null) {
  const ti = focusAt('hit2');
  shriek(ti, 0.5);
  impact(ti, { k: 1.5, d: 1000, sl: slowOf(clockOf('hit2').sp(ti)) });
}
// the record's events are already in the picture's own shots; secondary blasts as the fire reaches more (after)
if (starts.after != null) for (const [dt, k] of [[1.1, 0.25], [2.9, 0.18], [4.4, 0.22]]) impact(T('after') + dt, { k, d: 4000, sl: 0.9 });
if (starts.chase != null) swish(starts.chase, 3.2, { lp: () => 2500, hp: () => 200, env: (q, t) => Math.min(1, t / 0.2) * (1 - q * 0.5), gain: 0.25, wet: 0.1 });
console.log(`${at.length} raid sounds from the record, ${Object.keys(FOCUS).filter(n => focusAt(n) != null).length} designed shots`);

/* ---------- ambience: wind, a siren far off, the fire, the radio ---------- */
B = AMB;
// a level for each shot, eased across the cuts
function curve(levels) {
  const v = new Float32Array(N), l0 = levels[CUT[0].name] || 0; let y = Array.isArray(l0) ? l0[0] : l0;
  const k = 1 / (0.15 * SR);
  for (const s of CUT) {
    const a = Math.round(starts[s.name] * SR), b = Math.min(N, Math.round((starts[s.name] + s.dur) * SR)), L = levels[s.name] || 0;
    const L1 = Array.isArray(L) ? L : [L, L];
    for (let i = a; i < b; i++) { const want = L1[0] + (L1[1] - L1[0]) * (i - a) / (b - a); y += (want - y) * k; v[i] = y; }
  }
  for (let i = Math.round((total - 1.5) * SR); i < N; i++) { y *= 1 - k; v[i] = y; }
  return v;
}
// wind: two pink noises through band-passes that wander, with gusts; quieter on the map and the cards
const WIND = curve({ open: [0, 0.5], city: 0.45, calm: 1, launch: 0.9, arcs: 0.35, flyby: 0.9, track: 0.35, wakes: 0.25, sam: 0.9, kill: 0.8, raid: 0.35, high: 0.75, through: 0.12, hit: 0.7, hit2: 0.7, after: 1.1, out: [0.5, 0.2], title: [0.2, 0] });
{
  const a = pink(), b = pink(), fa = bq('bp'), fb = bq('bp'), la = bq('lp'), lb = bq('lp'), ca = wob(0.13), cb = wob(0.11), gust = wob(0.25);
  voice(0, total, t => {
    const w = WIND[cur]; if (w < 1e-4) return;
    const g = (0.35 + 0.65 * gust() ** 1.5) * w * 0.5;
    const l = fa(a(), 250 + 700 * ca(), 0.7) + la(a(), 140) * 0.3, r = fb(b(), 250 + 700 * cb(), 0.7) + lb(b(), 140) * 0.3;
    put(l * g, r * g, 0.1);
  });
}
// two hand-cranked air-raid sirens far apart in the city, wailing up and down out of step, carried on the wind
const SIREN = curve({ flyby: [0, 0.4], track: 0.7, wakes: 0.8, sam: 0.75, kill: 0.75, raid: 0.9, high: 0.9, through: 0.5, hit: 0.55, hit2: 0.55, after: 0.9, out: [0.8, 0.3], title: [0.15, 0] });
for (const sv of [{ off: 0, det: 1, pan: -0.5, k: 1, fc: 1300 }, { off: 3.7, det: 1.035, pan: 0.55, k: 0.6, fc: 850 }]) {
  const lp = bq('lp'), hp = bq('hp'), fl = wob(0.35), ph = new Float64Array(9);
  voice(0, total, t => {
    const lv = SIREN[cur]; if (lv < 1e-4) return;
    const c = ((t + sv.off) % 14) / 14;   // up over 5 s, held 3, down over 6
    const u = c < 5 / 14 ? 1 - Math.pow(1 - c * 14 / 5, 2) : c < 8 / 14 ? 1 : 1 - Math.pow((c * 14 - 8) / 6, 1.6);
    const f = (190 + 300 * u) * sv.det;
    let s = 0;
    for (let h = 1; h <= 9; h++) { ph[h - 1] += f * h / SR; s += Math.sin(2 * Math.PI * ph[h - 1]) * (h % 2 ? 1 : 0.35) / h; }
    const y = hp(lp(s, sv.fc), 160) * lv * sv.k * 0.085 * (0.6 + 0.4 * fl());
    put(y * panL(sv.pan), y * panR(sv.pan), 1.3, 0.6);
  });
}
// the fire: a low roar that flickers, a hiss, and wood and metal popping in it; from the hit on the fuel to the end
const tFire = focusAt('hit') != null ? focusAt('hit') + 0.4 : null;
if (tFire != null) {
  const FIRE = curve({ hit: 1, hit2: 0.55, after: 0.45, out: [0.4, 0.08], title: 0 });
  const a = pink(), b = pink(), la = bq('lp'), lb = bq('lp'), ha = bq('lp'), fl = wob(7), fl2 = wob(2.2), cr = crackler(), cr2 = crackler(), pa = bq('lp'), pb = bq('lp');
  voice(tFire, total - tFire, t => {
    const lv = FIRE[cur] * Math.min(1, t / 0.8); if (lv < 1e-4) return;
    const g = (0.5 + 0.7 * fl() * fl2()) * lv;
    const pop = cr(18, 1500, 3) * 1.6, pop2 = cr2(18, 1500, 3) * 1.6, dark = 1500 + 3500 * lv;
    const l = (la(a(), 380) * 1.4 + ha(a(), 2500) * 0.12) * g + pa(pop, dark) * lv, r = (lb(b(), 380) * 1.4 + ha(b(), 2500) * 0.12) * g + pb(pop2, dark) * lv;
    put(l * 0.55, r * 0.55, 0.3);
  });
}
// the radio on the map shots: squelch open, a burst of chatter nobody can make out, squelch closed
function radio(t0, len, pan) {
  const bp1 = bq('bp'), bp2 = bq('bp'), hp = bq('hp'), lp = bq('lp'), sy = wob(5.5), fm = wob(3);
  voice(t0, len + 0.25, t => {
    let s;
    if (t < 0.08) s = (t < 0.002 ? 3 : 0) + noise() * 0.9;                                   // the squelch opening
    else if (t < len) { const v = Math.max(0, sy() - 0.35) * 2; s = (bp1(noise(), 600 + 500 * fm(), 4) + bp2(noise(), 1800 + 900 * fm(), 4)) * v * 2.5 + noise() * 0.06; }
    else s = noise() * 0.9 * Math.exp(-(t - len) / 0.05) + (t - len < 0.002 ? -3 : 0);        // and the tail as it closes
    const y = lp(hp(s, 350), 3000) * 0.035;
    put(y * panL(pan), y * panR(pan), 0.15);
  });
}
for (const [shot, dt, len] of [['track', 0.4, 1.2], ['raid', 0.3, 0.9], ['raid', 2.6, 1.1], ['out', 1.2, 1.4]]) if (starts[shot] != null) radio(T(shot) + dt, len, -0.35);
// a distant airliner high over the airport at dusk, before anything happens
if (starts.calm != null) {
  const a = pink(), lp = bq('lp');
  voice(T('calm') - 0.5, 5.5, t => { const e = Math.sin(Math.PI * t / 5.5) * 0.12, y = lp(a(), 500) * e, p = -0.6 + t * 0.22; put(y * panL(p), y * panR(p), 0.5); });
}

/* ---------- the mix ---------- */
/* a feedback delay network: eight delays mixed by a Hadamard matrix, each losing highs as it circulates */
function fdn(inL, inR, oL, oR, o) {
  const lens = [1031, 1327, 1523, 1801, 2063, 2339, 2711, 3089].map(x => Math.round(x * o.size));
  const buf = lens.map(l => new Float32Array(l)), idx = new Int32Array(8), lp = new Float64Array(8), h = new Float64Array(8);
  const g = lens.map(l => Math.pow(10, -3 * l / SR / o.rt)), pre = Math.round(o.pre * SR), dm = o.damp;
  for (let n = 0; n < N; n++) {
    const xl = n >= pre ? inL[n - pre] : 0, xr = n >= pre ? inR[n - pre] : 0;
    for (let k = 0; k < 8; k++) { const y = buf[k][idx[k]]; lp[k] += dm * (y - lp[k]); h[k] = lp[k]; }
    oL[n] += (h[0] + h[2] + h[4] + h[6]) * o.mix; oR[n] += (h[1] + h[3] + h[5] + h[7]) * o.mix;
    for (let s = 1; s < 8; s <<= 1) for (let i = 0; i < 8; i += s << 1) for (let j = i; j < i + s; j++) { const a = h[j], b = h[j + s]; h[j] = a + b; h[j + s] = a - b; }
    for (let k = 0; k < 8; k++) { buf[k][idx[k]] = h[k] * 0.35355 * g[k] + (k & 1 ? xr : xl); if (++idx[k] >= lens[k]) idx[k] = 0; }
  }
}
/* the land answering: taps from 0.2 to 2.6 s, each darker than the last, side to side */
function echoes(inL, inR, oL, oR) {
  const taps = [[0.21, 0.45], [0.47, 0.38], [0.83, 0.3], [1.31, 0.22], [1.9, 0.16], [2.6, 0.1]];
  taps.forEach(([dt, g], j) => {
    const d = Math.round(dt * SR), a = Math.exp(-2 * Math.PI * (2400 / (j + 1)) / SR);
    let yl = 0, yr = 0;
    const [sl, sr] = j & 1 ? [inR, inL] : [inL, inR];
    for (let n = d; n < N; n++) { yl = sl[n - d] + (yl - sl[n - d]) * a; yr = sr[n - d] + (yr - sr[n - d]) * a; oL[n] += yl * g; oR[n] += yr * g; }
  });
}
if (process.env.BUSES) for (const [nm, b] of [['mus', MUS], ['amb', AMB], ['sfx', SFX]]) {   // a debugging view of the buses' levels
  const w = SR / 2, out = [];
  for (let a = 0; a + w < N; a += w) { let q = 0; for (let n = a; n < a + w; n++) q += b.L[n] * b.L[n] + b.R[n] * b.R[n]; out.push(Math.round(10 * Math.log10(q / w / 2 + 1e-12))); }
  console.log(nm, out.join(' '));
}
// the music and the ambience duck under the effects: a follower on the effects, scaled to their own loudest
const duck = new Float32Array(N);
{
  let e = 0, pk = 0;
  const at = 1 - Math.exp(-1 / (0.004 * SR)), rl = 1 - Math.exp(-1 / (0.6 * SR));
  for (let n = 0; n < N; n++) { const x = Math.abs(SFX.L[n]) + Math.abs(SFX.R[n]); e += (x > e ? at : rl) * (x - e); duck[n] = e; if (e > pk) pk = e; }
  for (let n = 0; n < N; n++) { const q = clamp((duck[n] / pk - 0.08) / 0.5, 0, 1); duck[n] = 1 - 0.6 * q * q * (3 - 2 * q); }
}
const ML = new Float32Array(N), MR = new Float32Array(N), HL = new Float32Array(N), HR = new Float32Array(N);
for (let n = 0; n < N; n++) {
  const g = duck[n], ga = 0.4 + 0.6 * g;
  ML[n] = (MUS.L[n] * g + AMB.L[n] * ga + SFX.L[n]); MR[n] = (MUS.R[n] * g + AMB.R[n] * ga + SFX.R[n]);
  HL[n] = MUS.wL[n] * g + AMB.wL[n] * ga; HR[n] = MUS.wR[n] * g + AMB.wR[n] * ga;
}
fdn(HL, HR, ML, MR, { size: 1.6, rt: 2.6, damp: 0.45, pre: 0.02, mix: 0.25 });          // the hall the music is in
fdn(SFX.wL, SFX.wR, ML, MR, { size: 2.3, rt: 3.2, damp: 0.3, pre: 0.045, mix: 0.3 });   // open air: long, dark
const EL = new Float32Array(N), ER = new Float32Array(N);
for (let n = 0; n < N; n++) { EL[n] = SFX.eL[n] + AMB.eL[n] * duck[n]; ER[n] = SFX.eR[n] + AMB.eR[n] * duck[n]; }
echoes(EL, ER, ML, MR);

/* the master: a high-pass under the sub, levelled so the loud half sits at -17 dBFS RMS, a glue compressor, and a
   look-ahead limiter to -1 dBFS */
{
  const hl = bq('hp'), hr = bq('hp');
  for (let n = 0; n < N; n++) { ML[n] = hl(ML[n], 22); MR[n] = hr(MR[n], 22); }
  const win = Math.round(0.4 * SR), rms = [];
  for (let a = 0; a + win < N; a += win) { let s = 0; for (let n = a; n < a + win; n++) s += ML[n] * ML[n] + MR[n] * MR[n]; rms.push(Math.sqrt(s / (2 * win))); }
  rms.sort((a, b) => a - b);
  const g0 = Math.pow(10, -17 / 20) / Math.max(1e-9, rms[Math.floor(rms.length * 0.75)]);
  // compressor: RMS detector, threshold -16 dB, ratio 3, 10 ms attack, 250 ms release, 3 dB of make-up
  const th = -16, ratio = 3, ca = Math.exp(-1 / (0.01 * SR)), cr = Math.exp(-1 / (0.25 * SR)), pw = Math.exp(-1 / (0.02 * SR)), mk = Math.pow(10, 3 / 20);
  let p = 0, gr = 0;
  for (let n = 0; n < N; n++) {
    const l = ML[n] * g0, r = MR[n] * g0;
    p = pw * p + (1 - pw) * (l * l + r * r) / 2;
    const db = 10 * Math.log10(p + 1e-12), want = db > th ? (db - th) * (1 - 1 / ratio) : 0;
    gr = want > gr ? ca * gr + (1 - ca) * want : cr * gr + (1 - cr) * want;
    const g = Math.pow(10, -gr / 20) * mk; ML[n] = l * g; MR[n] = r * g;
  }
  // limiter: the gain each sample needs, its minimum over the next 5 ms, averaged over 5 ms (so it is reached in
  // time), then a 120 ms release
  const W = Math.round(0.005 * SR), ceil = Math.pow(10, -1 / 20), need = new Float32Array(N), mn = new Float32Array(N);
  for (let n = 0; n < N; n++) need[n] = Math.min(1, ceil / Math.max(1e-9, Math.abs(ML[n]), Math.abs(MR[n])));
  const dq = new Int32Array(N); let h = 0, t = 0;
  for (let n = N - 1; n >= 0; n--) {   // the minimum of need over [n, n + W], by a deque from the end
    while (t > h && need[dq[t - 1]] >= need[n]) t--;
    dq[t++] = n; while (dq[h] > n + W) h++;
    mn[n] = need[dq[h]];
  }
  const rel = 1 - Math.exp(-1 / (0.12 * SR));
  let sum = W, g = 1;   // the window starts full of ones
  for (let n = 0; n < N; n++) {
    sum += mn[n] - (n >= W ? mn[n - W] : 1);
    const s = sum / W;
    g = Math.min(s, g + (1 - g) * rel);
    ML[n] *= g; MR[n] *= g;
  }
}
// fade the very end, dither to 16 bits and write
const fadeN = Math.floor(1.2 * SR);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
let peak = 0;
for (let i = 0; i < N; i++) {
  const f = i > N - fadeN ? (N - i) / fadeN : 1, dl = (rnd() - rnd()) / 32767, dr = (rnd() - rnd()) / 32767;
  const l = clamp(ML[i] * f + dl, -1, 1), r = clamp(MR[i] * f + dr, -1, 1);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log('saved', OUT, total.toFixed(1) + ' s, peak ' + (20 * Math.log10(peak)).toFixed(1) + ' dBFS, made in ' + ((Date.now() - CLOCK) / 1000).toFixed(1) + ' s');
