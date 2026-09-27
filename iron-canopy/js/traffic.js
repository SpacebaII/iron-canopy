/* Iron Canopy — road and rail traffic.
   Every road carries a flow: how full it is depends on its class, how close it runs to big cities and the hour
   (rush hours, quiet nights); war, air raid alerts and blown bridges empty it. The step only advances each
   road's flow (a few thousand numbers). Individual cars and lorries exist only when drawn: they sit in fixed
   slots that ride along with the flow, so the same car is in the same place from frame to frame without being
   simulated. Buses and coaches run timetabled routes with stops, and trains shuttle along the railways. */
(function (IC) {
'use strict';
const U = IC.U;

// per class: vehicles per unit (100 m) of lane at full flow, free speed (units per game second), lorry share
const CLS = {
  hw: { dens: 2.4, v: 0.31, lorry: 0.22 }, ring: { dens: 2, v: 0.25, lorry: 0.15 }, rd: { dens: 0.8, v: 0.22, lorry: 0.16 },
  art: { dens: 1.6, v: 0.12, lorry: 0.06 }, lc: { dens: 0.2, v: 0.18, lorry: 0.08 }, sp: { dens: 0.15, v: 0.14, lorry: 0.2 },
  st: { dens: 0.6, v: 0.09, lorry: 0.03 }, ln: { dens: 0.04, v: 0.12, lorry: 0.3 }
};
IC.TRAFFIC_CLS = CLS;
// share of the peak flow by hour of day: rush hours at 8 and 17–18, quiet from midnight to five
const HOURS = [0.12, 0.08, 0.06, 0.06, 0.08, 0.16, 0.42, 0.82, 1, 0.78, 0.6, 0.6, 0.64, 0.62, 0.6, 0.66, 0.84, 1, 0.92, 0.66, 0.46, 0.34, 0.24, 0.16];
IC.trafficHour = S => { const h = (S.time % 86400) / 3600, i = Math.floor(h), f = h - i; return HOURS[i] + (HOURS[(i + 1) % 24] - HOURS[i]) * f; };

const BASE = 0.3;   // spacing of the finest vehicle slots, in world units (30 m)
const cumOf = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + U.dist(pts[i - 1], pts[i])); return c; };

IC.trafficInit = function (S) {
  const W = S.world;
  const busy = (x, y) => { let w = 0; for (const c of W.cities) { const d = U.dxy(x, y, c.x, c.y); w += c.pop / 700 * Math.exp(-d / (c.r * 2.5)); } return w; };
  const links = [];
  const add = (l, cls, city) => {
    if (!l.cum) l.cum = cumOf(l.pts);
    l.len = l.cum[l.cum.length - 1];
    if (l.len < 1) return;
    const m = l.pts[l.pts.length >> 1];
    links.push({ l, cls, C: CLS[cls], city, near: nearCity(W, m), busy: 0.3 + Math.min(1.7, busy(m.x, m.y)), load: 0, v: 0, ph: [0, 0], key: links.length * 7919 });
  };
  for (const e of W.edges) add(e, e.cls);
  for (const c of W.cities) for (const s of c.streets) add(s, s.cls, c);
  for (const l of W.lanes) add(l, 'ln');
  S.traffic = { links, hour: 0, stepT: 0 };
  for (const L of links) { L.ph[0] = Math.random() * 1000; L.ph[1] = Math.random() * 1000; }
  // buses: city lines along the avenues and ring roads, coaches between neighbouring cities
  S.buses = [];
  for (const c of W.cities) {
    if (c.pop < 150) continue;
    for (const s of c.streets) if (s.cls === 'art' || s.cls === 'ring') {
      const n = Math.max(1, Math.round(s.cum[s.cum.length - 1] / 40));
      for (let i = 0; i < n; i++) S.buses.push({ l: s, s: Math.random() * s.cum[s.cum.length - 1], dir: i % 2 ? -1 : 1, stop: 5, wait: 0, city: c, coach: false });
    }
  }
  const town = new Set(W.cities.map(c => c.id));
  for (const e of W.edges) if (e.cls === 'rd' && (town.has(e.a) || town.has(e.b)))
    for (const dir of [1, -1]) S.buses.push({ l: e, s: Math.random() * e.len, dir, stop: e.len, wait: 0, coach: true });
  S.trains = [];
  for (const r of W.rails) { r.cum = cumOf(r.pts); r.len = r.cum[r.cum.length - 1]; if (Math.random() < 0.8) S.trains.push({ r, s: Math.random() * r.len, dir: Math.random() < 0.5 ? 1 : -1, spd: U.rand(0.3, 0.42), cars: U.randi(6, 14), wait: 0 }); }
  IC.traffic(S, 0);
};
function nearCity(W, p) { let best = null, bd = 1e9; for (const c of W.cities) { const d = U.dist(c, p) / c.r; if (d < bd) { bd = d; best = c; } } return bd < 3 ? best : null; }

IC.traffic = function (S, dt) {
  const T = S.traffic; if (!T) return;
  const war = S.enemy && S.enemy.war, W = S.world;
  // flows are re-read every half minute of game time; the phases advance every step
  T.stepT -= dt;
  if (T.stepT <= 0) {
    T.stepT = 30;
    T.hour = IC.trafficHour(S);
    const g = T.hour * (war ? 0.75 : 1) * (S.alertCities > 2 ? 0.55 : 1);
    for (const L of T.links) {
      const c = L.city || L.near;
      // under an air raid alert people leave the roads for the shelters
      const raid = c && c.alert > 0 ? 0.25 : 1;
      const cut = L.l.id && W.blocked && W.blocked.has(L.l.id) ? 0.05 : 1;
      L.load = U.clamp(g * L.busy * raid * cut, 0, 1.3);
      // a full road slows down: at peak the motorways round the capital crawl
      L.v = L.C.v * (L.load > 0.75 ? U.clamp(1 - (L.load - 0.75) * 1.3, 0.3, 1) : 1) * (raid < 1 ? 0.4 : 1);
    }
  }
  // phases wrap after 65,536 slots, which leaves every slot's identity unchanged
  for (const L of T.links) for (let d = 0; d < 2; d++) { L.ph[d] += L.v * dt * (d ? 0.97 : 1); if (L.ph[d] > BASE * 65536) L.ph[d] -= BASE * 65536; }
  for (const b of S.buses) moveBus(S, b, dt);
  for (const t of S.trains) {
    if (t.wait > 0) { t.wait -= dt; continue; }
    t.s += t.dir * t.spd * dt;
    // trains stand at the terminus for a few minutes, then run back
    if (t.s < 0 || t.s > t.r.len) { t.dir *= -1; t.s = U.clamp(t.s, 0, t.r.len); t.wait = 240; }
  }
};
function moveBus(S, b, dt) {
  if (b.wait > 0) { b.wait -= dt; return; }
  const len = b.l.cum[b.l.cum.length - 1], v = (b.coach ? 0.2 : 0.09) * (b.city && b.city.alert > 0 ? 0 : 1);
  b.s += b.dir * v * dt;
  b.stop -= v * dt;
  // city buses stop every 500 m, coaches at the ends of the line
  if (b.stop <= 0) { b.stop = b.coach ? len : 5; b.wait = b.coach ? 300 : 25; }
  if (b.s < 0 || b.s > len) { b.dir *= -1; b.s = U.clamp(b.s, 0, len); b.wait = b.coach ? 600 : 120; b.stop = b.coach ? len : 5; }
}

const along = (pts, cum, s) => {
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = pts[lo - 1], b = pts[lo], t = (s - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
};
IC.along = along;
IC.trainPos = t => along(t.r.pts, t.r.cum, U.clamp(t.s, 0, t.r.len));
IC.busPos = b => along(b.l.pts, b.l.cum, U.clamp(b.s, 0, b.l.cum[b.l.cum.length - 1]));

/* the cars and lorries in a view rectangle, for drawing: fn(x, y, heading, lorry, laneSide).
   gap: the smallest spacing to show, in world units (the renderer asks for about 10 screen pixels) */
IC.trafficVisible = function (S, view, gap, fn) {
  const T = S.traffic; if (!T) return 0;
  const k = Math.max(0, Math.ceil(Math.log2(Math.max(BASE, gap) / BASE))), sp = BASE * (1 << k), step = 1 << k;
  let n = 0;
  for (const L of T.links) {
    const l = L.l, bb = l.bb;
    if (L.load <= 0.01 || bb[2] < view.x0 || bb[0] > view.x1 || bb[3] < view.y0 || bb[1] > view.y1) continue;
    // which stretch of the road is in view
    const P = l.pts, cum = l.cum;
    let s0 = 1e9, s1 = -1;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (Math.max(a.x, b.x) < view.x0 || Math.min(a.x, b.x) > view.x1 || Math.max(a.y, b.y) < view.y0 || Math.min(a.y, b.y) > view.y1) continue;
      if (cum[i - 1] < s0) s0 = cum[i - 1]; if (cum[i] > s1) s1 = cum[i];
    }
    if (s1 < 0) continue;
    const len = L.len, p = L.load * L.C.dens * BASE;
    for (let d = 0; d < 2; d++) {
      // slot j rides at j·BASE + phase from its lane's start (the far end for the other direction);
      // the same j is the same vehicle from frame to frame, and coarser zooms show every 2^k-th slot
      const ph = L.ph[d], a = d ? len - s1 : s0, b = d ? len - s0 : s1;
      let j = Math.ceil((a - ph) / BASE); j += (step - (j % step + step) % step) % step;
      for (; j * BASE + ph <= b; j += step) {
        const s = j * BASE + ph, h = U.hash(L.key + d, j & 65535);
        if (h > p) continue;
        const q = along(P, cum, d ? len - s : s);
        if (q.x < view.x0 || q.x > view.x1 || q.y < view.y0 || q.y > view.y1) continue;
        fn(q.x, q.y, d ? q.h + Math.PI : q.h, h < p * L.C.lorry * (T.hour < 0.3 ? 2 : 1), L.cls);
        n++;
      }
    }
  }
  return n;
};

/* flow along the roads for the far view: fn(link, load, phase) for roads in view */
IC.trafficFlows = function (S, view, classes, fn) {
  const T = S.traffic; if (!T) return;
  for (const L of T.links) {
    const bb = L.l.bb;
    if (!classes[L.cls] || L.load <= 0.02 || bb[2] < view.x0 || bb[0] > view.x1 || bb[3] < view.y0 || bb[1] > view.y1) continue;
    fn(L.l, L.load, L.ph[0], L.cls);
  }
};

})(window.IC);
