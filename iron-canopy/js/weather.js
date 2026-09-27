/* Iron Canopy — weather. Cloud and rain blind cameras and heat-seekers, storms and fog ground helicopters,
   and the sky changes through the day. */
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

IC.weatherInit = function (S) {
  S.weather = { kind: U.pick(['clear', 'scattered', 'scattered', 'overcast']), next: S.time + U.rand(3, 7) * 3600, fade: 1, prev: 'clear' };
  S.weather.forecast = pickNext(S.weather.kind);
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
IC.weather = function (S, dt) {
  const w = S.weather;
  if (w.fade < 1) w.fade = Math.min(1, w.fade + dt / 1800);
  if (S.time > w.next) {
    let k = w.forecast;
    const h = (S.time % 86400) / 3600;
    if (k === 'fog' && !(h > 3 && h < 9)) k = 'scattered';
    w.prev = w.kind; w.kind = k; w.fade = 0;
    w.next = S.time + U.rand(2.5, 7) * 3600;
    w.forecast = pickNext(k);
    IC.log(S, 'info', 'WEATHER', `${IC.WEATHER[k].name}${IC.WEATHER[k].heli ? '' : ': helicopters grounded'}.`);
    IC.emit(S, 'weather', k);
  }
  // wind wanders
  S.wind.x = U.clamp(S.wind.x + U.gauss() * 0.002 * dt / 10, -0.9, 0.9);
  S.wind.y = U.clamp(S.wind.y + U.gauss() * 0.002 * dt / 10, -0.9, 0.9);
};

})(window.IC);
