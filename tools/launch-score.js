/* Iron Canopy: the launch trailer's score (tools/launch-trailer.js), synthesised here and written as a WAV, so nothing
   is licensed and every run makes the same file. It reads the cut's marks and plays to them, in D minor at 90 bpm:
   - the life before (open → build): a piano figure over a warm pad;
   - the airports (build → day): a pulse comes in, low strings, a kick from the rise, a riser into the day;
   - the day (day → blast): the pad thins to a held note and a heartbeat, a riser, and a hush of silence;
   - the blast: a hit with a long tail, a ringing in the ears, then the piano again, slower;
   - the turn: one low brass hit;
   - the war (war → still): drums, a string ostinato, brass every four bars, the hits on their marks, a riser;
   - the silence (still → title): the piano alone, the radio's minute nearly silent, the pad swelling back;
   - the title: the biggest hit, and one last piano note.
     node tools/launch-score.js [--out=shots/launch-trailer/score.wav] */
const fs = require('fs'), path = require('path');
const { MARKS, LENGTH, SHOTS } = require('./launch-trailer');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(__dirname, '..', arg('out', 'shots/launch-trailer/score.wav'));
const SR = 44100, N = Math.ceil((LENGTH + 0.5) * SR), BEAT = 60 / 90, BAR = BEAT * 4;
const M = k => (MARKS[k] || [])[0];
const L = new Float32Array(N), R = new Float32Array(N), VL = new Float32Array(N), VR = new Float32Array(N);   // dry, and the reverb's send
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
/* write one voice: f(t, i) is its sample at t seconds into it; pan -1..1; send to the reverb 0..1 */
function voice(at, dur, f, gain, pan = 0, send = 0.3) {
  const a = Math.max(0, Math.floor(at * SR)), n = Math.min(N - a, Math.floor(dur * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) { const v = f(i / SR, i); L[a + i] += v * gl; R[a + i] += v * gr; VL[a + i] += v * gl * send; VR[a + i] += v * gr * send; }
}
const env = (t, a, d) => Math.min(1, t / a) * (t > d ? 0 : 1);
/* ---------- instruments ---------- */
function piano(at, m, vel = 0.5, len = 3.5, pan = 0) {
  const f = hz(m), hs = [1, 2, 3, 4, 5, 6].map(k => ({ k, f: f * k * (1 + 0.0004 * k * k), a: 1 / (k * k * 0.7 + 0.3), d: 1.8 / (1 + k * 0.6) }));
  voice(at, len, t => { let s = 0; for (const h of hs) s += h.a * Math.sin(2 * Math.PI * h.f * t) * Math.exp(-t / h.d); return s * Math.min(1, t * 300) * (t > len - 0.3 ? (len - t) / 0.3 : 1); }, vel * 0.22, pan, 0.45);
}
function saw(f, t, n) { let s = 0; for (let k = 1; k <= n; k++) s += Math.sin(2 * Math.PI * f * k * t) / k; return s; }
function pad(at, ms, dur, gain = 0.06, att = 1.5) {
  for (const [j, m] of ms.entries()) for (const det of [-0.12, 0, 0.11]) {
    const f = hz(m) * Math.pow(2, det / 12), ph = rnd() * 6;
    voice(at, dur, t => saw(f, t + ph, 7) * Math.min(1, t / att) * Math.min(1, (dur - t) / 1.2), gain / ms.length, (j / Math.max(1, ms.length - 1) - 0.5) * 0.8 + det, 0.6);
  }
}
function pluck(at, m, gain = 0.08, pan = 0) {
  const f = hz(m); voice(at, 0.32, t => saw(f, t, 6) * Math.exp(-t / 0.07) * Math.min(1, t * 400), gain, pan, 0.25);
}
function braam(at, gain = 0.5, dur = 3.4) {
  for (const m of [26, 38, 45, 50]) for (const det of [-0.15, 0.13]) {
    const f = hz(m) * Math.pow(2, det / 12);
    voice(at, dur, t => { const open = 3 + 9 * Math.exp(-t / 0.5); return Math.tanh(1.6 * saw(f, t, Math.round(open))) * Math.min(1, t * 60) * Math.exp(-t / (dur * 0.45)); }, gain / 8, det * 3, 0.5);
  }
  boom(at, gain * 0.6, 2.2);
}
function boom(at, gain = 0.6, dur = 2.5) {
  let ph = 0; voice(at, dur, t => { ph += 2 * Math.PI * (28 + 40 * Math.exp(-t / 0.15)) / SR; return Math.sin(ph) * Math.exp(-t / (dur * 0.35)) * Math.min(1, t * 800); }, gain, 0, 0.15);
}
function noise(at, dur, gain, lp, shape, pan = 0, send = 0.5) {
  let y = 0; voice(at, dur, t => { const k = lp(t); y += k * ((rnd() * 2 - 1) - y); return y * shape(t); }, gain, pan, send);
}
function taiko(at, gain = 0.35, low = 1) {
  let ph = 0; voice(at, 0.9, t => { ph += 2 * Math.PI * (low * 50 + 90 * Math.exp(-t / 0.03)) / SR; return Math.sin(ph) * Math.exp(-t / 0.28); }, gain, 0, 0.3);
  noise(at, 0.12, gain * 0.4, () => 0.25, t => Math.exp(-t / 0.02), 0, 0.2);
}
function snare(at, gain = 0.12) { noise(at, 0.25, gain, () => 0.6, t => Math.exp(-t / 0.06), 0.1, 0.35); }
function riser(at, dur, gain = 0.18) {
  noise(at, dur, gain, t => 0.02 + 0.5 * (t / dur) ** 2, t => (t / dur) ** 2, 0, 0.6);
  let ph = 0; voice(at, dur, t => { ph += 2 * Math.PI * (200 + 1600 * (t / dur) ** 2) / SR; return Math.sin(ph) * (t / dur) ** 3; }, gain * 0.25, 0, 0.6);
}
function heart(at, gain = 0.3) { for (const [d, g] of [[0, 1], [0.22, 0.7]]) { let ph = 0; voice(at + d, 0.35, t => { ph += 2 * Math.PI * (55 + 30 * Math.exp(-t / 0.02)) / SR; return Math.sin(ph) * Math.exp(-t / 0.09); }, gain * g, 0, 0.1); } }
/* ---------- the music ---------- */
// D minor: Dm, Bb, F, C (two bars each), the piano's figure over each chord
const PROG = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
const FIG = [0, 1, 2, 1, 2, 3, 2, 1];   // indices into the chord, the top one an octave up
function figure(at, until, step = BEAT / 2, vel = 0.45, every = 1, low = -12, pg = 0.05) {
  let c = 0;
  for (let t = at; t < until - 0.05; t += BAR * 2, c++) {
    const ch = PROG[c % 4];
    pad(t, ch.map(m => m + low), BAR * 2 + 0.6, pg, 1.2);
    for (let k = 0; k < 16; k += every) {
      const x = t + k * step; if (x >= until) break;
      const n = FIG[k % 8], m = (n === 3 ? ch[0] + 12 : ch[n]) + 12;
      piano(x, m, vel * (k % 4 === 0 ? 1 : 0.7), 2.6, (n - 1.5) * 0.25);
    }
    piano(t, ch[0] - 12, vel * 0.8, 4.5, -0.2);
  }
}
const open = M('open'), build = M('build'), rise = M('rise'), day = M('day'), hush = M('hush'), blast = M('blast');
const turn = M('turn'), war = M('war'), still = M('still'), title = M('title');
// the life before: piano and pad
figure(open + 0.4, build, BEAT / 2, 0.45, 1, 0, 0.03);
// the airports: the figure goes on, a pulse and low strings join, a kick from the rise
figure(build, day - 0.2, BEAT / 2, 0.42);
for (let t = build; t < day - 0.2; t += BEAT / 2) pluck(t, 38 + (Math.floor((t - build) / (BAR * 2)) % 4 === 1 ? -4 : 0), t > rise ? 0.1 : 0.06, ((t - build) / (BEAT / 2)) % 2 ? 0.3 : -0.3);
pad(build, [38, 45], day - build, 0.05, 4);
for (let t = rise; t < day - 0.3; t += BEAT) { taiko(t, 0.18 + 0.2 * (t - rise) / (day - rise), 1.1); }
riser(day - 5.5, 5.4, 0.16);
braam(build, 0.35);
// the day: a held note, a heartbeat, a riser into the hush
pad(day, [50, 57], hush - day + 0.1, 0.05, 0.4);
voice(day, hush - day, t => Math.sin(2 * Math.PI * hz(81) * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 7 * t)) * Math.min(1, t / 2), 0.02, 0.2, 0.7);
for (let t = day + 0.5; t < hush - 0.4; t += 1.0 - 0.35 * (t - day) / (hush - day)) heart(t, 0.32);
riser(hush - 3.6, 3.6, 0.22);
// the blast: the biggest hit but one, a long tail, the ringing in the ears, the piano again, slower
boom(blast, 1.0, 5); braam(blast, 0.55, 5);
noise(blast, 6, 0.5, t => 0.05 + 0.6 * Math.exp(-t / 0.4), t => Math.exp(-t / 1.2) * Math.min(1, t * 200), 0, 0.9);
voice(blast + 0.4, 6.5, t => Math.sin(2 * Math.PI * 3700 * t) * Math.exp(-t / 3) * Math.min(1, t / 0.3), 0.025, 0, 0.1);
pad(blast + 2, [38, 45, 50], turn - blast - 1.5, 0.045, 3);
for (const [k, m] of [[0, 69], [2, 65], [4, 62], [6, 64], [8, 62], [10, 57]]) piano(blast + 4.5 + k * BEAT, m, 0.4, 3.5, 0.1);
// the turn: one low brass hit on the words
braam(turn + 0.3, 0.5, 4);
pad(turn, [38, 45], war - turn, 0.05, 2);
for (const [k, m] of [[0, 62], [2, 65], [4, 69], [6, 72]]) piano(turn + 3.2 + k * BEAT, m, 0.35, 3, -0.1);
riser(war - 2.5, 2.5, 0.18);
// the war: drums, a string ostinato, brass every four bars, the hits, a riser into the silence
const end = still - 0.1;
for (let t = war, b = 0; t < end; t += BEAT / 2, b++) {
  const beat = b % 8, bar = Math.floor(b / 8), heat = Math.min(1, (t - war) / (end - war) + 0.25);
  if (beat === 0 || beat === 3 || beat === 6) taiko(t, 0.42 * heat + 0.1, 0.9);
  if (beat === 4) snare(t, 0.14 * heat);
  if (heat > 0.6) taiko(t + BEAT / 4, 0.12 * heat, 1.6);
  const ch = PROG[[0, 0, 1, 3][Math.floor(bar / 1) % 4]];
  for (const off of [0, BEAT / 4]) pluck(t + off, ch[(beat + (off ? 1 : 0)) % 3] + 12, 0.07 * heat + 0.03, off ? 0.4 : -0.4);
  if (beat === 0 && bar % 4 === 0) braam(t, 0.42 * heat + 0.15, 3);
  if (beat === 0 && bar % 2 === 0) pad(t, ch.map(m => m - 12), BAR * 2, 0.06, 0.3);
}
for (const h of MARKS.hit || []) { boom(h, 0.7, 2.5); noise(h, 2.5, 0.35, () => 0.3, t => Math.exp(-t / 0.5), 0, 0.8); }
riser(end - 4, 4, 0.25);
boom(end - 0.05, 0.6, 1.5);
// the silence: the piano alone; the radio's minute (the line at 22:34) nearly silent; the pad swells to the title
const radio = SHOTS.find(s => /c27-3/.test(s.src)).t;
for (const [k, m] of [[0, 62], [2, 65], [3, 64], [4, 62], [6, 57]]) piano(still + 0.6 + k * BEAT, m, 0.42, 3.4, 0);
noise(radio, 4, 0.03, () => 0.4, t => 0.5 + 0.5 * Math.sin(t * 9), 0.3, 0.2);
pad(radio + 4.4, [50, 53, 57], title - radio - 4.2, 0.06, 5);
for (const [k, m] of [[0, 57], [2, 62], [4, 65], [6, 69], [8, 74]]) piano(radio + 5 + k * BEAT, m, 0.4 + k * 0.02, 3.4, 0);
riser(title - 3, 3, 0.2);
// the title
boom(title + 0.4, 1.0, 6); braam(title + 0.4, 0.7, 6.5);
noise(title + 0.4, 5, 0.3, () => 0.15, t => Math.exp(-t / 1.5), 0, 0.9);
pad(title + 1.5, [38, 45, 50, 57], LENGTH - title - 1.5, 0.05, 2);
piano(LENGTH - 2.8, 62, 0.4, 2.8, 0); piano(LENGTH - 2.8, 50, 0.3, 2.8, 0);
/* ---------- the room and the master ---------- */
function reverb(x, combs, aps) {
  const y = new Float32Array(N);
  for (const [d, g] of combs) { const b = new Float32Array(d); let i = 0, lp = 0; for (let n = 0; n < N; n++) { const o = b[i]; lp = o * 0.7 + lp * 0.3; b[i] = x[n] + lp * g; y[n] += o * 0.25; i = (i + 1) % d; } }
  for (const [d, g] of aps) { const b = new Float32Array(d); let i = 0; for (let n = 0; n < N; n++) { const o = b[i], v = y[n] + o * g; b[i] = v; y[n] = o - v * g; i = (i + 1) % d; } }
  return y;
}
const RL = reverb(VL, [[1557, 0.86], [1617, 0.86], [1491, 0.86], [1422, 0.86], [2903, 0.8]], [[225, 0.5], [556, 0.5], [441, 0.5]]);
const RRv = reverb(VR, [[1580, 0.86], [1640, 0.86], [1514, 0.86], [1445, 0.86], [2950, 0.8]], [[248, 0.5], [579, 0.5], [464, 0.5]]);
let g = 1, peak = 0; const out = new Int16Array(N * 2), mix = new Float32Array(N * 2);
for (let n = 0; n < N; n++) { mix[2 * n] = L[n] + RL[n] * 0.55; mix[2 * n + 1] = R[n] + RRv[n] * 0.55; }
// a gentle compressor with a look-ahead limiter
const LA = 220; let env2 = 0;
for (let n = 0; n < N; n++) {
  let p = 0; for (let k = 0; k < 2; k++) p = Math.max(p, Math.abs(mix[2 * Math.min(N - 1, n + LA) + k]));
  env2 = Math.max(p, env2 * 0.9995);
  const want = env2 > 0.5 ? 0.5 / env2 : 1; g += (want - g) * (want < g ? 0.02 : 0.0004);
  mix[2 * n] *= g; mix[2 * n + 1] *= g; peak = Math.max(peak, Math.abs(mix[2 * n]), Math.abs(mix[2 * n + 1]));
}
const norm = 0.89 / peak;
for (let i = 0; i < N * 2; i++) out[i] = Math.max(-32767, Math.min(32767, Math.round(mix[i] * norm * 32767)));
const hd = Buffer.alloc(44);
hd.write('RIFF', 0); hd.writeUInt32LE(36 + out.length * 2, 4); hd.write('WAVE', 8); hd.write('fmt ', 12); hd.writeUInt32LE(16, 16);
hd.writeUInt16LE(1, 20); hd.writeUInt16LE(2, 22); hd.writeUInt32LE(SR, 24); hd.writeUInt32LE(SR * 4, 28); hd.writeUInt16LE(4, 32); hd.writeUInt16LE(16, 34);
hd.write('data', 36); hd.writeUInt32LE(out.length * 2, 40);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([hd, Buffer.from(out.buffer)]));
console.log('saved', OUT, (N / SR).toFixed(1), 's');
