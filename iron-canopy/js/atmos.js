/* Iron Canopy — the mood of the moment, headless: how tense things are (for the music and the ambience) and the colour
   of the light (for the map's grade). The renderer and audio-score.js read these; neither changes the simulation. */
(function (IC) {
'use strict';
const U = IC.U;

/* 0 at night, 1 by day, ramps at dawn (05:00–07:30) and dusk (18:00–20:30) */
IC.daylight = function (t) {
  const h = (t % 86400) / 3600;
  if (h < 5 || h > 20.5) return 0;
  if (h < 7.5) return (h - 5) / 2.5;
  if (h > 18) return 1 - (h - 18) / 2.5;
  return 1;
};

/* How tense the moment is, as three weights that sum to 1: calm (peace, building), tension (a war coming, an alert,
   the gray zone) and battle (hostile aircraft and weapons in the air). The base follows the story's act or the war;
   what is in the air pushes it to battle. */
const ACT_TENSION = [0, 0, 0.2, 0.45, 0.7];
IC.mood = function (S) {
  const E = S.enemy;
  let t = 0;
  if (S.mode === 'story') t = S.story ? ACT_TENSION[S.story.act] || 0 : 0;
  else if (S.mode === 'campaign' || S.mode === 'sandbox') t = 0.7;
  else if (S.mode === 'academy') t = 0.25;
  if (E && E.war) t = Math.max(t, 0.7);
  if (S.alarmFx > 0) t = Math.max(t, 0.85);
  let hostile = 0;
  for (const th of S.threats) if (!th.dead && th.det && !(th.d && th.d.civil) && !th.border && (th.aff === 'H' || th.aff === 'S')) hostile++;
  const b = U.clamp(hostile / 6 + (S.missiles ? S.missiles.length : 0) / 8, 0, 1);
  if (b > 0) t = Math.max(t, 0.6);
  return { calm: (1 - t) * (1 - b), tension: t * (1 - b), battle: b, hostile, war: !!(E && E.war) };
};

/* The light over the map: how much colour drains away (sat, 0–1) and the colour the picture is multiplied by
   ([r, g, b] 0–255), from the hour and the weather. Night is a cool, dark moonlight; the hour around sunset and
   sunrise warms it; cloud greys it and a storm darkens it. A warm tint (soft light) for the golden hour. */
const MOON = [50, 62, 108], BLUE_HOUR = [120, 110, 170], STORM = [150, 158, 172], CLOUD = [214, 218, 224];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
IC.skyGrade = function (S, wx) {
  const light = IC.daylight(S.time), h = (S.time % 86400) / 3600;
  wx = wx || (IC.wx ? IC.wx(S) : { cloud: 0, precip: 0 });
  const dark = 1 - light;
  // dusk and dawn: the blue hour sits just on the dark side of the ramp
  const blue = dark > 0 && dark < 1 ? Math.sin(dark * Math.PI) : 0;
  let mul = [255, 255, 255];
  mul = mix(mul, BLUE_HOUR, blue * 0.55);
  mul = mix(mul, MOON, dark);
  // weather: cloud dims a little, rain and storms more, mostly by day (at night it is dark anyway)
  const gloom = U.clamp((wx.cloud - 0.5) * 1.2, 0, 0.6) + (wx.precip || 0) * 0.4;
  if (gloom > 0) mul = mix(mul, mix(CLOUD, STORM, U.clamp(wx.precip || 0, 0, 1)), Math.min(1, gloom) * (0.3 + 0.7 * light));
  const sat = U.clamp(dark * dark * 0.6 + gloom * 0.35, 0, 0.8);
  const golden = h > 5 && h < 8.5 ? 1 - Math.abs(h - 6.8) / 1.7 : h > 17 && h < 20.5 ? 1 - Math.abs(h - 18.8) / 1.7 : 0;
  return { light, dark, sat, mul: mul.map(Math.round), golden: Math.max(0, golden) * (1 - U.clamp(gloom, 0, 1)) };
};

})(window.IC);
