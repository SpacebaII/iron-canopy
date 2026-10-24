/* Iron Canopy — the score and the living ambience (WebAudio, no files, browser only). The music is played live from
   three layers that share one key and one bar line, so they can blend: calm (pads and a slow, sparse melody, for
   peacetime and building), tension (a drone, a pulsing bass, high strings that swell) and battle (drums, low brass,
   a driving bass). IC.mood (atmos.js) sets how much of each sounds. The ambience follows the weather, the hour, the
   zoom and what is in view: wind by its strength, rain, birds by day and crickets at night close in over the
   country, a town's hum over a city. IC.sfx.score(S, dt) runs each frame from main.js. */
(function (IC) {
'use strict';
const A = IC.sfx, U = IC.U;
let G = null, ctx = null, musicBus = null, delay = null, L = null;
const M = { calm: 0, tension: 0, battle: 0, bpm: 66, step: 0, nextT: 0, timer: null, wasBattle: 0, stingT: -1e9 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

/* one key (D minor, its relative F major) for every layer; a chord is a bass note and the notes above it */
const PROG = {
  calm:    [[41, [57, 60, 64, 69]], [36, [55, 60, 62, 67]], [38, [57, 60, 62, 65]], [34, [53, 57, 62, 65]]],   // Fmaj7, Cadd9, Dm7, Bbmaj7
  tension: [[38, [50, 57, 62, 65]], [34, [50, 58, 62, 65]], [43, [50, 58, 62, 67]], [36, [52, 55, 60, 67]]],   // Dm, Bb, Gm, C
  battle:  [[38, [50, 57, 62]], [38, [50, 57, 62]], [34, [46, 53, 58]], [36, [48, 55, 60]]]                    // D5, D5, Bb5, C5
};
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79];   // the calm melody's notes
const BPM = { calm: 66, tension: 84, battle: 108 };

A.musicVol = A.musicVol == null ? 0.5 : A.musicVol;
const MUSIC_GAIN = 2.2;
A.setMusic = function (v) { A.musicVol = v; if (musicBus) musicBus.gain.setTargetAtTime(v * MUSIC_GAIN, ctx.currentTime, 0.2); };

A.onInit = function () {
  G = A.graph; ctx = G.ctx;
  musicBus = ctx.createGain(); musicBus.gain.value = A.musicVol * MUSIC_GAIN;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -14; lim.ratio.value = 6; lim.attack.value = 0.01; musicBus.connect(lim); lim.connect(G.master);
  // the music's own room: a long echo and a quarter-note delay for the melody
  const verb = ctx.createConvolver(); verb.buffer = G.impulse(3.4); const wet = ctx.createGain(); wet.gain.value = 0.55;
  const send = ctx.createGain(); send.gain.value = 1; send.connect(verb); verb.connect(wet); wet.connect(musicBus);
  delay = ctx.createDelay(2); delay.delayTime.value = 60 / BPM.calm * 0.75; const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
  delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(send);
  L = {};
  for (const k of ['calm', 'tension', 'battle']) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(musicBus); g.connect(send);
    L[k] = g;
  }
  L.send = send;
  // the tension drone: two detuned saws on D and A through a slowly breathing filter
  const dg = ctx.createGain(); dg.gain.value = 0; const dlpf = ctx.createBiquadFilter(); dlpf.type = 'lowpass'; dlpf.frequency.value = 300; dlpf.Q.value = 2;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(dlpf.frequency); lfo.start();
  for (const [m, det] of [[38, -6], [38, 5], [45, -4], [45, 7]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(dlpf); o.start(); }
  dlpf.connect(dg); dg.connect(musicBus); dg.connect(send);
  L.drone = dg;
  ambienceInit();
  M.nextT = ctx.currentTime + 0.2;
  M.timer = setInterval(schedule, 100);
};

/* ---------- the score ---------- */
function voice(type, f, t0, dur, peak, dest, o) {
  o = o || {};
  const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f, t0); if (o.det) osc.detune.value = o.det;
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
  const g = ctx.createGain(), a = o.a || 0.01, r = o.r || dur;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  if (o.hold) g.gain.setValueAtTime(peak, t0 + a + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + (o.hold || 0) + r);
  let n = osc;
  if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(o.lp, t0); if (o.lpTo) f2.frequency.exponentialRampToValueAtTime(o.lpTo, t0 + a + (o.hold || 0) + r); f2.Q.value = o.q || 0.7; osc.connect(f2); n = f2; }
  n.connect(g); g.connect(dest);
  osc.start(t0); osc.stop(t0 + a + (o.hold || 0) + r + 0.05);
}
function hit(t0, f0, f1, dur, peak, dest, noiseAmt, nf) {
  // a drum: a falling sine for the body, a burst of filtered noise for the skin
  voice('sine', f0, t0, dur, peak, dest, { a: 0.003, slide: f1 });
  if (noiseAmt) {
    const s = ctx.createBufferSource(); s.buffer = G.noiseBuf; s.start(t0, Math.random() * 1.5); s.stop(t0 + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = nf || 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak * noiseAmt, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
    s.connect(bp); bp.connect(g); g.connect(dest);
  }
}
/* the step: eighth notes; a bar is 8 of them, a chord lasts a bar (two in calm) */
function schedule() {
  if (!ctx || !A.on) return;
  const now = ctx.currentTime;
  if (M.nextT < now - 0.3) M.nextT = now + 0.05;   // the tab was asleep: start again from now
  while (M.nextT < now + 0.35) { play(M.step, M.nextT); M.nextT += 60 / M.bpm / 2; M.step++; }
}
function play(i, t) {
  if (A.muted || A.musicVol <= 0) return;
  const e = 60 / M.bpm / 2, inBar = i % 8, bar = Math.floor(i / 8);
  // calm: a pad that changes every two bars, and a few notes of melody now and then
  if (M.calm > 0.02) {
    const [b, ch] = PROG.calm[Math.floor(bar / 2) % 4];
    if (inBar === 0 && bar % 2 === 0) {
      const d = e * 16;
      // each chord swells in and rings on under the next, so the pad never drops out
      for (const m of ch) for (const det of [-7, 6]) voice('sawtooth', hz(m), t, d, 0.015, L.calm, { a: 2.2, hold: d * 0.55, r: 4.5, det, lp: 900, lpTo: 1600 });
      for (const m of ch) voice('triangle', hz(m + 12), t, d, 0.008, L.calm, { a: 3, hold: d * 0.4, r: 4, lp: 2400 });
      voice('sine', hz(b + 12), t, d, 0.03, L.calm, { a: 1.2, hold: d * 0.6, r: 3.5 });
    }
    // the melody comes in phrases: eight bars of it, then four of the pad alone
    if (inBar % 2 === 0 && bar % 12 < 8 && Math.random() < 0.3) {
      // a stepwise walk over the pentatonic notes, so the melody sounds like one
      M.mel = U.clamp((M.mel == null ? 3 : M.mel) + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)], 0, PENTA.length - 1);
      const m = PENTA[M.mel];
      voice('triangle', hz(m), t, 1.8, 0.04, L.calm, { a: 0.005, r: 1.8, lp: 3000 }); voice('sine', hz(m) * 2, t, 0.6, 0.006, L.calm, { a: 0.005, r: 0.6 });
      // the melody's echo
      const g = ctx.createGain(); g.gain.value = 0.5 * M.calm; voice('sine', hz(m), t, 1.2, 0.02, g, { a: 0.005, r: 1.2 }); g.connect(delay);
    }
  }
  // tension: a muted bass pulsing on the eighths (an accent on the off-beat), strings swelling over it
  if (M.tension > 0.02) {
    const [b, ch] = PROG.tension[bar % 4];
    const acc = inBar === 0 || inBar === 3 || inBar === 6;
    voice('sawtooth', hz(b), t, e * 0.9, acc ? 0.06 : 0.035, L.tension, { a: 0.005, r: e * 0.9, lp: acc ? 700 : 450, lpTo: 120, q: 4 });
    if (inBar === 0) for (const m of ch) for (const det of [-9, 8]) voice('sawtooth', hz(m + 12), t, e * 8, 0.006, L.tension, { a: e * 5, hold: e * 1.5, r: e * 3, det, lp: 1800 });
    if (inBar === 0 && bar % 4 === 3) hit(t, 70, 40, 1.4, 0.12, L.tension, 0.2, 300);
  }
  // battle: drums in a driving pattern, low brass on the bar, the bass doubled
  if (M.battle > 0.02) {
    const [b, ch] = PROG.battle[bar % 4];
    if (inBar === 0 || inBar === 3 || inBar === 6) hit(t, 110, 42, 0.5, 0.22, L.battle, 0.25, 220);
    if (inBar === 2 || inBar === 6) hit(t, 220, 160, 0.22, 0.05, L.battle, 1.4, 1800);
    if (bar % 4 === 3 && inBar >= 4) hit(t, 160 - inBar * 10, 80, 0.3, 0.1, L.battle, 0.4, 600);
    voice('sawtooth', hz(b), t, e, 0.05, L.battle, { a: 0.004, r: e * 0.95, lp: 900, lpTo: 150, q: 3 });
    voice('square', hz(b - 12), t, e, 0.03, L.battle, { a: 0.004, r: e * 0.8, lp: 300 });
    if (inBar === 0) for (const m of ch) for (const det of [-5, 5]) voice('sawtooth', hz(m), t, e * 4, 0.022, L.battle, { a: 0.06, hold: e * 2, r: e * 3, det, lp: 600, lpTo: 1800, q: 1.2 });
  }
}
/* a sting when a raid comes in from quiet: a low brass swell and a roll on the drums */
A.sting = function (kind) {
  if (!ctx || !A.on || A.muted) return;
  const t = ctx.currentTime + 0.05;
  if (kind === 'raid') {
    for (const m of [38, 45, 50]) for (const det of [-8, 8]) voice('sawtooth', hz(m), t, 2.6, 0.05, musicBus, { a: 0.25, hold: 0.8, r: 1.8, det, lp: 300, lpTo: 2000, q: 1.5 });
    for (let k = 0; k < 14; k++) hit(t + k * 0.06, 90, 50, 0.3, 0.02 + k * 0.006, musicBus, 0.3, 300);
    hit(t + 0.9, 60, 30, 2, 0.35, musicBus, 0.3, 200);
  }
};

/* ---------- the ambience ---------- */
let amb = null;
function loopNoise(type, f, q) {
  const n = ctx.createBufferSource(); n.buffer = G.noiseBuf; n.loop = true; n.start(0, Math.random() * 1.5);
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  n.connect(fl); fl.connect(g); g.connect(G.ambBus);
  return { g, fl };
}
function ambienceInit() {
  amb = { rain: loopNoise('highpass', 1400), rainLow: loopNoise('lowpass', 500), town: loopNoise('lowpass', 260, 0.6), birdT: 0 };
  // crickets: a high tone chopped into chirps, in two voices that drift in and out of step
  amb.crickets = [];
  for (const f of [4300, 4650]) {
    const o = ctx.createOscillator(); o.frequency.value = f;
    const am = ctx.createGain(); am.gain.value = 0;
    const chop = ctx.createOscillator(); chop.type = 'square'; chop.frequency.value = 26 + Math.random() * 6; const cg = ctx.createGain(); cg.gain.value = 0.5; chop.connect(cg); cg.connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(am); am.connect(g); g.connect(G.ambBus); o.start(); chop.start();
    amb.crickets.push({ g, ph: Math.random() * 6 });
  }
}
function bird(pan, k) {
  // a few quick rising and falling whistles
  const t0 = ctx.currentTime + Math.random() * 0.3, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1800;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) { p.pan.value = pan; p.connect(G.ambBus); }
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.09 + Math.random() * 0.07), f = base * (0.85 + Math.random() * 0.4);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.5 : 0.7), t + 0.07);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 * k, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(p || G.ambBus); o.start(t); o.stop(t + 0.1);
  }
}
const set = (p, v, tc) => p.setTargetAtTime(v, ctx.currentTime, tc || 0.8);
function ambience(S, dt, mood) {
  const wx = IC.wx(S), cam = IC.cam, z = cam.z, light = IC.daylight(S.time);
  // wind: its strength and gusts, louder high up (zoomed out) and in a storm
  const W = G.wind, kt = S.wind ? S.wind.kt + (S.wind.gust || 0) * 0.5 : 8;
  const gust = 0.75 + 0.25 * Math.sin(S.time * 0.13) * Math.sin(S.time * 0.051);
  set(W.gain.gain, (0.012 + Math.min(1, kt / 35) * 0.07) * gust * (1 + wx.precip * 0.4) * (z < 0.3 ? 1.3 : 1));
  set(W.lp.frequency, 260 + Math.min(1, kt / 35) * 700 * gust);
  // rain: a hiss and a low wash; snow is near silence
  const rain = wx.snow ? 0 : wx.precip;
  set(amb.rain.g.gain, rain * 0.05 * (z > 0.5 ? 1 : 0.6)); set(amb.rainLow.g.gain, rain * 0.04);
  // close in over the country: birds by day, crickets at night, fewer in war and none in the rain
  const near = U.clamp((z - 1.5) / 4, 0, 1), cx = cam.x + cam.vw / z / 2, cy = cam.y + cam.vh / z / 2;
  let town = 0;
  for (const c of IC.cities(S)) { const d = Math.hypot(c.x - cx, c.y - cy), r = (c.ext || 40) + cam.vw / z * 0.3; if (d < r) town = Math.max(town, (1 - d / r) * Math.min(1, (c.pop || 200) / 600)); }
  const nature = near * (1 - town * 0.8) * (1 - rain) * (1 - mood.battle) * (S.paused ? 0.6 : 1);
  const night = 1 - light;
  for (const c of amb.crickets) set(c.g.gain, nature * night * 0.006 * (0.7 + 0.3 * Math.sin(S.time * 0.02 + c.ph)), 1.5);
  amb.birdT -= dt;
  if (amb.birdT <= 0) { amb.birdT = 1.5 + Math.random() * 5; const k = nature * light * (light > 0.3 ? 1 : 0.3); if (k > 0.05) bird(Math.random() * 1.6 - 0.8, k); }
  // a town: traffic and the city's own low rumble, quieter at night
  set(amb.town.g.gain, town * U.clamp(z / 2, 0.15, 1) * (0.5 + 0.5 * light) * 0.05);
}

let tick = 0;
A.score = function (S, dt) {
  if (!ctx || !A.on || !S) return;
  tick -= dt; if (tick > 0) return; tick = 0.25;
  // the start screen has its own blend: calm with an undertow of what is coming
  const st = document.getElementById('start');
  const mood = st && !st.hidden ? { calm: 0.6, tension: 0.4, battle: 0 } : IC.mood(S);
  // fade between moods over a few seconds (battle comes in fast, leaves slowly)
  const k = (cur, want, up, down) => cur + (want - cur) * (want > cur ? up : down);
  M.calm = k(M.calm, mood.calm, 0.05, 0.05); M.tension = k(M.tension, mood.tension, 0.06, 0.04); M.battle = k(M.battle, mood.battle, 0.2, 0.025);
  M.bpm = BPM.calm * M.calm + BPM.tension * M.tension + BPM.battle * M.battle || BPM.calm;
  M.bpm = Math.max(60, Math.min(112, M.bpm / Math.max(0.01, M.calm + M.tension + M.battle)));
  const vol = A.muted ? 0 : 1;
  set(L.calm.gain, M.calm * vol, 0.5); set(L.tension.gain, M.tension * vol, 0.5); set(L.battle.gain, M.battle * vol, 0.3);
  set(L.drone.gain, (M.tension * 0.03 + M.battle * 0.02) * vol, 1);
  // a raid from a quiet sky: the sting, at most every three minutes
  const now = ctx.currentTime;
  if (mood.battle > 0.15 && M.wasBattle < 0.05 && now - M.stingT > 180) { M.stingT = now; A.sting('raid'); }
  M.wasBattle = mood.battle > 0.15 ? 1 : Math.max(0, M.wasBattle - 0.01);
  ambience(S, 0.25, mood);
};
A.moodNow = () => ({ calm: M.calm, tension: M.tension, battle: M.battle, bpm: M.bpm });

})(window.IC);
