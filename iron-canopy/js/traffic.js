/* Iron Canopy — road and rail traffic: cars and lorries on the road network, trains on the railways.
   Wartime and air raid alerts thin the traffic out. */
(function (IC) {
'use strict';
const U = IC.U;

IC.trafficInit = function (S) {
  for (const e of S.world.edges) { e.cum = [0]; for (let i = 1; i < e.pts.length; i++) e.cum.push(e.cum[i - 1] + U.dist(e.pts[i - 1], e.pts[i])); }
  for (const r of S.world.rails) { r.cum = [0]; for (let i = 1; i < r.pts.length; i++) r.cum.push(r.cum[i - 1] + U.dist(r.pts[i - 1], r.pts[i])); r.len = r.cum[r.cum.length - 1]; }
  for (let i = 0; i < 200; i++) S.cars.push(newCar(S));
  for (const r of S.world.rails) if (Math.random() < 0.7) S.trains.push({ r, s: Math.random() * r.len, dir: Math.random() < 0.5 ? 1 : -1, spd: U.rand(0.35, 0.5), cars: U.randi(6, 14) });
};
function newCar(S) {
  const es = S.world.edges;
  for (let g = 0; g < 20; g++) {
    const e = es[Math.floor(Math.random() * es.length)];
    const w = e.cls === 'hw' ? 1 : e.cls === 'rd' ? 0.6 : 0.25;
    if (Math.random() > w) continue;
    return { e, s: Math.random() * e.len, dir: Math.random() < 0.5 ? 1 : -1, spd: U.rand(0.3, 0.42) * (e.cls === 'hw' ? 1.2 : 1), truck: Math.random() < 0.18 };
  }
  const e = es[0]; return { e, s: 0, dir: 1, spd: 0.3, truck: false };
}
const along = (pts, cum, s) => {
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
};
IC.carPos = c => along(c.e.pts, c.e.cum, U.clamp(c.s, 0, c.e.len));
IC.trainPos = t => along(t.r.pts, t.r.cum, U.clamp(t.s, 0, t.r.len));

IC.traffic = function (S, dt) {
  const war = S.enemy && S.enemy.war;
  const cars = Math.round(200 * (IC.isNight(S) ? 0.3 : 1) * (S.alertCities > 2 ? 0.55 : 1) * (war ? 0.75 : 1));
  for (const c of S.cars) {
    c.s += c.dir * c.spd * dt;
    if (c.s < 0 || c.s > c.e.len) { if (S.cars.length > cars && Math.random() < 0.5) c.gone = true; else Object.assign(c, newCar(S)); }
  }
  S.cars = S.cars.filter(c => !c.gone);
  while (S.cars.length < cars) S.cars.push(newCar(S));
  for (const t of S.trains) { t.s += t.dir * t.spd * dt; if (t.s < 0 || t.s > t.r.len) { t.dir *= -1; t.s = U.clamp(t.s, 0, t.r.len); } }
};

})(window.IC);
