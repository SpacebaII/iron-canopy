/* Iron Canopy — civilian life: a busy sky of airliners on filed routes, light aircraft (some without
   transponders), the enemy's own civil traffic along the border, air raid alerts, morale. Road and rail traffic is in traffic.js.
   The point: not every track on the radar is hostile, and the enemy can hide among them. */
(function (IC) {
'use strict';
const U = IC.U;
const octal = () => { let s = ''; for (let i = 0; i < 4; i++) s += U.randi(0, 7); return s === '7000' || s === '7500' || s === '7700' ? '4' + s.slice(1) : s; };
IC.squawk = octal;

IC.civilInit = function (S) {
  S.civT = 60; S.gaT = 120;
  // the sky is already busy when the game starts
  for (let i = 0; i < 18; i++) scheduleFlight(S, Math.random());
  for (let i = 0; i < 5; i++) scheduleGA(S, Math.random());
};
/* ---------- airliners ---------- */
function minBorderDist(a, b) {
  let m = 1e9;
  for (let i = 0; i <= 12; i++) { const x = a.x + (b.x - a.x) * i / 12, y = a.y + (b.y - a.y) * i / 12; if (IC.inHome(x, y)) m = Math.min(m, IC.hostileBorderDist(x, y)); }
  return m;
}
function allowed(S, w) {
  const touchesHome = w.kind === 'dom' || w.kind === 'intl' || w.a.k === 'H' || w.b.k === 'H' || crossesHome(w);
  if (w.kind === 'hostile') return true;
  if (!touchesHome) return true;
  if (S.airspace === 'closed') return false;
  if (S.airspace === 'restricted') { if (w._safe == null) w._safe = minBorderDist(w.a, w.b) > 1800; return w._safe; }
  return true;
}
function crossesHome(w) { if (w._home == null) { w._home = false; for (let i = 1; i < 12; i++) if (IC.inHome(w.a.x + (w.b.x - w.a.x) * i / 12, w.a.y + (w.b.y - w.a.y) * i / 12)) { w._home = true; break; } } return w._home; }
IC.crossesHome = crossesHome;

function scheduleFlight(S, progress) {
  const W = S.world;
  const war = S.enemy && S.enemy.war;
  // our own airports' traffic is flown by the airlines (aviation.js); this is everyone else's
  const opts = W.airways.filter(w => allowed(S, w) && !(war && w.kind === 'hostile' && Math.random() < 0.5) && !(S.av && (w.a.k === 'H' || w.b.k === 'H')));
  if (!opts.length) return;
  const w = U.wpick(opts.map(x => [x, { over: 0.3, intl: 0.28, dom: 0.15, long: 0.14, hostile: 0.22 }[x.kind] || 0.1]));
  const fwd = Math.random() < 0.5, a = fwd ? w.a : w.b, b = fwd ? w.b : w.a;
  const air = w.kind === 'hostile' ? (W.names[a.k] || 'XX').slice(0, 3).toUpperCase() : U.pick(IC.NAMES.airline);
  const cs = `${air} ${U.randi(100, 989)}`;
  const f = progress || 0;
  const path = S.av && crossesHome(w) ? IC.avPath(S, a, b) : { pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] };
  const P = path.pts;
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
  const onGround = !a.edge && f < 0.02;
  const wps = P.slice(1).filter(p => f < 0.02 || ((p.x - x) * (b.x - a.x) + (p.y - y) * (b.y - a.y)) > 0);
  IC.spawnThreat(S, 'civ', x, y, { dest: wps[0] || b, wps: wps.length ? wps : [b], orig: a, cs, sq: octal(), plan: { a, b, cs, pts: P }, pax: U.randi(80, 290), alt: onGround ? 0.3 : 11, route: [b], aim: b, dist0: U.dist(a, b), airway: w, hostileCiv: w.kind === 'hostile' });
  if (S.av && crossesHome(w) && w.kind !== 'hostile') IC.avOverflight(S);
}
function scheduleGA(S, progress) {
  const W = S.world;
  if (S.airspace === 'closed') return;
  const towns = W.cities.filter(c => c.owner !== 'enemy').concat(W.villages.filter(v => v.home));
  if (S.airspace === 'restricted' || (S.enemy && S.enemy.war)) { if (Math.random() < 0.6) return; }
  const a = U.pick(towns); const near = towns.filter(t => t !== a && U.dist(t, a) < 1600);
  const b = near.length ? U.pick(near) : U.pick(towns);
  if (!b || a === b) return;
  const f = progress || 0;
  const vfr = Math.random() < 0.8;
  IC.spawnThreat(S, 'ga', a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, { dest: { x: b.x, y: b.y, name: b.name }, orig: { x: a.x, y: a.y, name: a.name }, cs: `${W.names.H.slice(0, 1)}-${String.fromCharCode(65 + U.randi(0, 25))}${String.fromCharCode(65 + U.randi(0, 25))}${U.randi(10, 99)}`, sq: vfr ? '7000' : null, pax: U.randi(1, 4), alt: U.rand(0.8, 2.2), route: [b], aim: b, dist0: U.dist(a, b) });
}
IC.moveCivil = function (S, t, dt) {
  if (t.tail) return IC.moveTail(S, t, dt);
  // intermediate route points (around prohibited zones)
  if (t.wps && t.wps.length > 1 && U.dxy(t.x, t.y, t.dest.x, t.dest.y) < t.spd * dt + 3) { t.wps.shift(); t.dest = t.wps[0]; }
  const d = t.dest, dx = d.x - t.x, dy = d.y - t.y, L = Math.hypot(dx, dy);
  if (t.type === 'ga') {
    t.alt = Math.min(t.alt, 0.3 + L / 60);
    const a = Math.atan2(dy, dx) + 0.2 * Math.sin(t.age * 0.01 + t.seed);
    t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd;
  } else {
    const fin = t.wps ? t.wps[t.wps.length - 1] : d;
    const flown = U.dxy(t.x, t.y, t.orig.x, t.orig.y);
    const climb = t.orig.edge ? 11 : Math.min(11, 0.3 + flown / 100);
    const desc = fin.edge ? 11 : Math.min(11, 0.3 + U.dxy(t.x, t.y, fin.x, fin.y) / 100);
    t.alt = Math.min(climb, desc);
    const hd = Math.atan2(dy, dx) + (t.drift || 0);
    t.vx = Math.cos(hd) * t.spd; t.vy = Math.sin(hd) * t.spd;
  }
  if (L <= t.spd * dt + 2 || t.x < -900 || t.y < -900 || t.x > IC.WW + 900 || t.y > IC.WH + 900) { t.dead = true; return; }
  t.x += t.vx * dt; t.y += t.vy * dt;
};

function hostileNear(S, c) {
  for (const t of S.threats) {
    if (t.dead || !t.det || t.d.civil || t.border || t.decoyKnown) continue;
    if (t.aff !== 'H' && t.aff !== 'S') continue;
    if (t.type === 'isr' || (t.d.cls === 'air' && t.mission === 'patrol')) continue;
    const aim = t.aim || t.tgt;
    if (aim && U.dxy(aim.x, aim.y, c.x, c.y) < c.r + 500) return true;
    if (U.dist(t, c) < 1000) return true;
  }
  return false;
}

IC.civil = function (S, dt) {
  const war = S.enemy && S.enemy.war;
  const want = (S.airspace === 'closed' ? 6 : S.airspace === 'restricted' ? 12 : war ? 18 : 26) * (S.av ? 0.6 : 1);
  const n = S.threats.filter(t => t.type === 'civ' && !t.dead && !t.tail).length;
  S.civT -= dt;
  if (S.civT <= 0) { S.civT = n < want ? U.rand(40, 120) : U.rand(200, 500); scheduleFlight(S); }
  S.gaT -= dt;
  const ga = S.threats.filter(t => t.type === 'ga' && !t.dead).length;
  if (S.gaT <= 0) { S.gaT = ga < (war ? 2 : 6) ? U.rand(150, 400) : U.rand(600, 1200); scheduleGA(S); }
  // airspace closure: flights in our airspace divert out of it
  if (S.airspace === 'closed') for (const t of S.threats) if (t.d.civil && !t.dead && !t.hostileCiv && !t.diverted && IC.inHome(t.x, t.y)) { t.diverted = true; const out = S.world.crossings[0] ? S.world.crossings[0].far : { x: 0, y: 0 }; t.dest = { x: out.x, y: out.y, name: 'diversion', edge: true }; t.route = [t.dest]; t.wps = [t.dest]; t.toApt = null; t.appr = false; t.plan = { a: { x: t.x, y: t.y }, b: t.dest, cs: t.cs, pts: [{ x: t.x, y: t.y }, t.dest] }; }
  S.alertT = (S.alertT || 0) - dt;
  if (S.alertT <= 0) {
    S.alertT = 30;
    let nA = 0;
    for (const c of IC.cities(S)) {
      if (c.owner !== 'us') continue;
      if (hostileNear(S, c)) {
        if (c.alert <= 0) {
          if (!c.lastAlertLog || S.time - c.lastAlertLog > 3600) {
            c.lastAlertLog = S.time;
            IC.log(S, 'warn', 'SIRENS', `Air raid alert in ${c.name}.`, c);
            if (c.pop > 300 || Math.random() < 0.4) IC.news(S, `Sirens sound across ${c.name}; residents head for shelters.`);
          }
          IC.sfx && IC.sfx.siren(c.x, c.y);
        }
        c.alert = 600;
      } else c.alert = Math.max(0, c.alert - 30);
      if (c.alert > 0) { nA++; c.morale = Math.max(0, c.morale - 0.004); c.prosp = Math.max(0.3, c.prosp - 0.0004); }
      else if (c.hp > c.max * 0.6) c.morale = Math.min(88, c.morale + 0.006);
    }
    S.alertCities = nA;
    if (S.mode !== 'academy' && IC.nationalMorale(S) < 12) IC.gameOver(S, 'National morale has collapsed. The government has asked for terms.');
  }
};

})(window.IC);
