/* Iron Canopy — weather. Cloud and rain blind cameras and heat-seekers, storms and fog ground helicopters,
   and the sky changes through the day. Wind has a direction, a speed in knots and gusts: it decides which runways
   airliners can use. Fog and low cloud need an instrument landing system. */
(function (IC) {
'use strict';
const U = IC.U;
const NEXT = {
  clear: [['clear', 3], ['scattered', 3], ['fog', 0.6]],
  scattered: [['clear', 2], ['scattered', 2], ['overcast', 2]],
  overcast: [['scattered', 2], ['overcast', 1.5], ['rain', 2]],
  rain: [['overcast', 2], ['rain', 1], ['storm', 0.8]],
  storm: [['rain', 2], ['overcast', 1]],
  fog: [['clear', 1], ['scattered', 2]]
};
/* wind in knots (a range the mean is drawn from), gusts as a share of the mean, visibility in km, cloud base in feet */
IC.SKY = {
  clear:     { wind: [2, 12], gust: 0.2, vis: 10, ceil: 5000 },
  scattered: { wind: [5, 16], gust: 0.3, vis: 10, ceil: 3500 },
  overcast:  { wind: [6, 18], gust: 0.3, vis: 8, ceil: 1200 },
  rain:      { wind: [10, 24], gust: 0.4, vis: 4, ceil: 800, wet: true },
  storm:     { wind: [18, 36], gust: 0.55, vis: 2, ceil: 600, wet: true },
  fog:       { wind: [0, 5], gust: 0, vis: 0.3, ceil: 100 }
};
/* below these an arrival needs an instrument landing system on the runway end it lands on */
IC.ILS_VIS = 1.5; IC.ILS_CEIL = 500;
const KT = 1 / 33;                       // smoke and cloud drift (world units a second) per knot

IC.weatherInit = function (S) {
  S.weather = { kind: U.pick(['clear', 'scattered', 'scattered', 'overcast']), next: S.time + U.rand(3, 7) * 3600, fade: 1, prev: 'clear' };
  S.weather.forecast = pickNext(S.weather.kind);
  const K = IC.SKY[S.weather.kind];
  // the prevailing wind blows from the west-north-west, give or take
  const kt = U.rand(K.wind[0], K.wind[1]);
  S.wind = { dir: Math.PI + U.rand(-0.9, 0.5), kt, gust: kt, tgt: kt, x: 0, y: 0 };
  windVec(S.wind);
};
function pickNext(k) { return U.wpick(NEXT[k]); }
IC.wx = S => {
  const w = S.weather; if (!w) return IC.WEATHER.clear;
  const a = IC.WEATHER[w.prev], b = IC.WEATHER[w.kind], f = w.fade;
  if (f >= 1) return b;
  const o = {};
  for (const k in b) o[k] = typeof b[k] === 'number' ? a[k] + (b[k] - a[k]) * f : b[k];
  o.heli = f > 0.5 ? b.heli : a.heli;
  return o;
};
/* visibility (km), cloud base (ft) and a wet runway, blended while the weather changes */
IC.sky = S => {
  const w = S.weather; if (!w) return IC.SKY.clear;
  const a = IC.SKY[w.prev] || IC.SKY.clear, b = IC.SKY[w.kind], f = w.fade;
  if (w.force) return Object.assign({}, b, w.force);
  return { vis: a.vis + (b.vis - a.vis) * f, ceil: a.ceil + (b.ceil - a.ceil) * f, wet: f > 0.4 ? !!b.wet : !!a.wet };
};
IC.needILS = S => { const k = IC.sky(S); return k.vis < IC.ILS_VIS || k.ceil < IC.ILS_CEIL; };
/* the wind as a drift vector: where smoke goes (dir is where the wind comes from) */
function windVec(W) { const v = W.kt * KT; W.x = -Math.cos(W.dir) * v; W.y = -Math.sin(W.dir) * v; }
/* compass bearing (degrees, 360 = north, y grows southward) of a world direction */
IC.bearing = a => { const d = Math.round(((a * 180 / Math.PI + 90) % 360 + 360) % 360); return d === 0 ? 360 : d; };
/* wind components along a heading: head (+) or tail (−) wind and crosswind, steady and in gusts */
IC.windOn = function (S, hdg) {
  const W = S.wind, c = Math.cos(W.dir - hdg), s = Math.abs(Math.sin(W.dir - hdg));
  return { head: W.kt * c, cross: W.kt * s, gHead: W.gust * c, gCross: W.gust * s };
};
IC.windText = S => { const W = S.wind; return W.kt < 1 ? 'calm' : `${String(IC.bearing(W.dir)).padStart(3, '0')}° ${Math.round(W.kt)} kt${W.gust > W.kt + 3 ? ` gusting ${Math.round(W.gust)}` : ''}`; };
/* tests and lessons can pin the wind: { dir, kt, gust } */
IC.setWind = function (S, o) { Object.assign(S.wind, o); S.wind.tgt = S.wind.kt; if (o.gust == null) S.wind.gust = S.wind.kt; S.wind.hold = !!o.hold; windVec(S.wind); };

IC.weather = function (S, dt) {
  const w = S.weather;
  if (w.fade < 1) w.fade = Math.min(1, w.fade + dt / 1800);
  // lessons hold the weather fair so they teach the system, not the forecast
  if (w.hold) w.next = Math.max(w.next, S.time + 3600);
  if (S.time > w.next) {
    let k = w.forecast;
    const h = (S.time % 86400) / 3600;
    if (k === 'fog' && !(h > 3 && h < 9)) k = 'scattered';
    w.prev = w.kind; w.kind = k; w.fade = 0;
    w.next = S.time + U.rand(2.5, 7) * 3600;
    w.forecast = pickNext(k);
    // a new air mass: the wind picks a new strength and swings round
    if (!S.wind.hold) { const K = IC.SKY[k]; S.wind.tgt = U.rand(K.wind[0], K.wind[1]); S.wind.veer = U.rand(-0.7, 0.7); }
    IC.log(S, 'info', 'WEATHER', `${IC.WEATHER[k].name}${IC.WEATHER[k].heli ? '' : ': helicopters grounded'}. Wind ${IC.windText(S)}.`);
    IC.emit(S, 'weather', k);
  }
  const W = S.wind;
  if (!W.hold) {
    // the wind eases towards the new strength over half an hour and wanders a little
    const f = Math.min(1, dt / 1800);
    W.kt = Math.max(0, W.kt + (W.tgt - W.kt) * f + U.gauss() * 0.04 * Math.sqrt(dt));
    if (W.veer) { const v = W.veer * f * 2; W.dir += v; W.veer -= v; }
    W.dir += U.gauss() * 0.003 * Math.sqrt(dt);
    // gusts come and go every few minutes
    W.gT = (W.gT || 0) - dt;
    if (W.gT <= 0) { W.gT = U.rand(120, 360); W.gAmt = U.rand(0.4, 1); }
    const K = IC.SKY[w.kind];
    W.gust = W.kt > 8 ? W.kt * (1 + K.gust * (W.gAmt || 0.5)) : W.kt;
  }
  windVec(W);
};

})(window.IC);
