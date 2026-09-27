/* Iron Canopy — hostile weapon flight models. */
(function (IC) {
'use strict';
const U = IC.U;

IC.spawnThreat = function (S, type, x, y, o) {
  const d = IC.THR[type];
  const t = Object.assign({
    id: IC.nid('t'), type, d, x, y, alt: d.alt || 0, vx: 0, vy: 0, hp: d.hp, spd: d.spd || 0, rcs: d.rcs, age: 0, seed: Math.random() * 10,
    route: null, aim: null, target: null, tn: null, det: false, fc: false, disc: false, fcBy: [], vis: false, idp: 0, ided: false,
    aff: 'U', klass: null, cm: d.cm || 0, notchT: 0, fromHostile: IC.inHostile(x, y),
    inbound: 0, lost: 0, px: x, py: y, pt: 0, holdUntil: 0, spoofed: false, dead: false, flash: 0, blip: 0, trailPts: []
  }, o || {});
  S.threats.push(t);
  return t;
};

IC.launchBallistic = function (S, type, x, y, aim, o) {
  const d = IC.THR[type];
  const R = U.dxy(x, y, aim.x, aim.y);
  const T = R / d.vAvg + 40;
  const apex = Math.max(18, d.apexK * R);
  IC.sfx && IC.sfx.launch(x, y, 1.3);
  return IC.spawnThreat(S, type, x, y, Object.assign({ x0: x, y0: y, x1: aim.x, y1: aim.y, T, apex, aim, vx: (aim.x - x) / T, vy: (aim.y - y) / T }, o || {}));
};
IC.balPos = function (t, age) {
  const f = U.clamp(age / t.T, 0, 1);
  return { x: t.x0 + (t.x1 - t.x0) * f, y: t.y0 + (t.y1 - t.y0) * f, alt: t.apex * 4 * f * (1 - f), f };
};
IC.altAt = function (t, ahead) { return t.d.move === 'bal' ? IC.balPos(t, t.age + ahead).alt : t.alt; };
IC.timeToImpact = function (t) {
  if (t.d.move === 'bal') return Math.max(0, t.T - t.age);
  if (t.aim && t.spd) {
    let L = 0, px = t.x, py = t.y;
    for (const p of (t.route && t.route.length ? t.route : [t.aim])) { L += U.dxy(px, py, p.x, p.y); px = p.x; py = p.y; }
    return L / t.spd;
  }
  return 1e9;
};

function arrive(S, t) {
  t.dead = true;
  if (t.d.decoy || !t.d.dmg) return;
  t.impacted = true;
  const hit = IC.detonate(S, t.x, t.y, t.d.dmg, t);
  IC.emit(S, 'arrive', { t, hit });
  if (t.op) { t.op.hits += hit ? 1 : 0; t.op.done++; if (hit && hit.fac) t.op.baseHits = (t.op.baseHits || 0) + 1; }
}

function spoofedDrift(S, t, dt) {
  t.spoofT -= dt;
  t.hd += t.sd * 0.004 * dt;
  t.vx = Math.cos(t.hd) * t.spd; t.vy = Math.sin(t.hd) * t.spd;
  t.x += t.vx * dt; t.y += t.vy * dt;
  if (t.spoofT <= 0) {
    t.dead = true;
    IC.explode(S, t.x, t.y, 0.5, 'ground');
    if (t.tn) IC.log(S, 'kill', 'SPOOFED', `TN ${t.tn} ${t.aff === 'H' ? t.d.code : 'UNK'} lost navigation and crashed ${IC.nearestPlace(S, t.x, t.y)}.`);
    S.stats.kills++;
    if (t.op) t.op.done++;
  }
}

function moveWp(S, t, dt) {
  if (t.spoofed) return spoofedDrift(S, t, dt);
  if (t.loiter != null) {
    t.loiter -= dt; t.hd = (t.hd || 0) + dt * 0.01;
    t.vx = Math.cos(t.hd) * t.spd; t.vy = Math.sin(t.hd) * t.spd; t.x += t.vx * dt; t.y += t.vy * dt;
    if (t.loiter <= 0) t.dead = true;
    return;
  }
  const p = t.route[0];
  const dx = p.x - t.x, dy = p.y - t.y, L = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx);
  const toAim = U.dxy(t.x, t.y, t.aim.x, t.aim.y);
  if (t.type === 'owa') a += 0.12 * Math.sin(t.age * 0.02 + t.seed);
  if (t.d.evasive && toAim < 450 && t.type !== 'scm') a += 0.5 * Math.sin(t.age * 0.25 + t.seed);
  const step = t.spd * dt;
  t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd; t.hd = a;
  if (L <= step + 0.5) {
    t.x = p.x; t.y = p.y; t.route.shift();
    if (!t.route.length) { if (t.d.decoy) { t.loiter = 600; return; } arrive(S, t); return; }
  } else { t.x += t.vx * dt; t.y += t.vy * dt; }
  if (t.d.glide) t.alt = Math.max(0.05, t.alt0 * Math.min(1, toAim / t.dist0));
  else if (t.d.dive) t.alt = toAim < 600 ? Math.max(0.05, 12 * toAim / 600) : 12;
  else if (t.d.cls === 'cm') t.alt = toAim < 60 ? 0.4 : t.d.alt * (0.8 + 0.4 * Math.sin(t.age * 0.05 + t.seed));
  else if (t.type === 'owa') t.alt = t.d.alt * (0.7 + 0.5 * Math.sin(t.age * 0.004 + t.seed));
  if (t.altHold != null && toAim > 60) t.alt = t.altHold;
}

/* loitering munition: fly to an area, then hunt vehicles and air defense */
function moveLm(S, t, dt) {
  if (t.spoofed) return spoofedDrift(S, t, dt);
  t.endT = (t.endT == null ? 3600 : t.endT) - dt;
  if (t.endT <= 0) { t.dead = true; IC.explode(S, t.x, t.y, 0.4, 'ground'); if (t.op) t.op.done++; return; }
  t.scan = (t.scan || 0) - dt;
  if ((!t.prey || t.prey.dead) && t.scan <= 0) {
    t.scan = 10; t.prey = null;
    let bd = 300;
    const look = (o, w) => { if (o.dead) return; const d = U.dist(o, t) / w; if (d < bd) { bd = d; t.prey = o; } };
    for (const v of S.vehicles) if (v.state !== 'idle') look(v, 1.3);
    for (const u of S.units) if (u.state === 'ready') look(u, u.radarOn ? 1.4 : 0.9);
  }
  let tx, ty;
  if (t.prey) { tx = t.prey.x; ty = t.prey.y; }
  else if (t.route && t.route.length) { tx = t.route[0].x; ty = t.route[0].y; if (U.dxy(t.x, t.y, tx, ty) < 20) t.route.shift(); }
  else { t.oa = (t.oa || 0) + dt * 0.004; tx = t.x + Math.cos(t.oa) * 50; ty = t.y + Math.sin(t.oa) * 50; }
  const a = Math.atan2(ty - t.y, tx - t.x), spd = t.prey ? t.spd * 1.4 : t.spd;
  t.vx = Math.cos(a) * spd; t.vy = Math.sin(a) * spd;
  if (t.prey && U.dxy(t.x, t.y, tx, ty) <= spd * dt + 2) {
    t.dead = true;
    const hit = IC.detonate(S, tx, ty, t.d.dmg, t);
    IC.emit(S, 'arrive', { t, hit });
    if (t.op) { t.op.done++; t.op.hits += hit ? 1 : 0; }
    return;
  }
  t.x += t.vx * dt; t.y += t.vy * dt;
  t.alt = t.prey ? Math.max(0.05, Math.min(0.5, U.dxy(t.x, t.y, tx, ty) / 400)) : 0.5;
}

function moveBal(S, t, dt) {
  const p = IC.balPos(t, t.age);
  t.x = p.x; t.y = p.y; t.alt = p.alt;
  if (t.d.evasive && p.f > 0.85) {
    const nx = -(t.y1 - t.y0), ny = t.x1 - t.x0, L = Math.hypot(nx, ny) || 1;
    const w = 25 * Math.sin(t.age * 0.2 + t.seed) * (1 - p.f) * 6;
    t.x += nx / L * w; t.y += ny / L * w;
  }
  if (t.d.pen && p.f > 0.78) { t.dead = true; if (t.op) t.op.done++; return; }
  if (p.f >= 1) arrive(S, t);
}

function moveHgv(S, t, dt) {
  if (!t.glide) {
    const p = IC.balPos(t, t.age);
    t.x = p.x; t.y = p.y; t.alt = Math.max(40, p.alt);
    if (p.f >= 0.5) { t.glide = true; t.spd = t.d.spd; }
    return;
  }
  const toAim = U.dxy(t.x, t.y, t.aim.x, t.aim.y);
  const a = Math.atan2(t.aim.y - t.y, t.aim.x - t.x) + 0.35 * Math.sin(t.age * 0.08 + t.seed) * Math.min(1, toAim / 600);
  t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd;
  t.alt = toAim < 500 ? Math.max(0.1, 40 * toAim / 500) : 40;
  if (toAim <= t.spd * dt + 2) { t.x = t.aim.x; t.y = t.aim.y; arrive(S, t); return; }
  t.x += t.vx * dt; t.y += t.vy * dt;
}

function moveArm(S, t, dt) {
  const g = t.target;
  if (g && !g.dead && g.radarOn) { t.aim = { x: g.x, y: g.y }; t.blind = false; }
  else if (!t.blind) { t.blind = true; if (t.det) IC.text(S, t.x, t.y, 'ARM LOST LOCK', '#9fe0ff'); }
  const r = U.dxy(t.x, t.y, t.aim.x, t.aim.y);
  t.alt = Math.max(0.05, Math.min(8, r / 60));
  const a = Math.atan2(t.aim.y - t.y, t.aim.x - t.x);
  t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd;
  if (r <= t.spd * dt + 1) {
    t.dead = true;
    const hitOk = !t.blind || Math.random() < 0.3;
    if (hitOk && g && !g.dead && U.dxy(g.x, g.y, t.aim.x, t.aim.y) < 25) { const hit = IC.detonate(S, t.aim.x, t.aim.y, t.d.dmg, t); IC.emit(S, 'arrive', { t, hit }); if (t.op) t.op.hits++; }
    else { IC.explode(S, t.aim.x, t.aim.y, 0.6, 'ground'); IC.log(S, 'kill', 'MISS', `ARM TN ${t.tn || '----'} missed ${g ? g.name : 'its target'}.`); }
    if (t.op) t.op.done++;
    return;
  }
  t.x += t.vx * dt; t.y += t.vy * dt;
}

function moveIsr(S, t, dt) {
  let tx, ty;
  if (t.phase === 'out') { tx = t.area.x; ty = t.area.y; if (U.dxy(t.x, t.y, tx, ty) < 40) { t.phase = 'loiter'; t.oa = 0; } }
  if (t.phase === 'loiter') {
    t.loiterT -= dt; t.oa += dt * t.spd / 300;
    tx = t.area.x + Math.cos(t.oa) * 300; ty = t.area.y + Math.sin(t.oa) * 300;
    if (t.loiterT <= 0) t.phase = 'home';
  }
  if (t.phase === 'home') { tx = t.home.x; ty = t.home.y; if (U.dxy(t.x, t.y, tx, ty) < 30) { t.dead = true; if (t.site) t.site.inv.isr = (t.site.inv.isr || 0) + 1; return; } }
  const a = Math.atan2(ty - t.y, tx - t.x);
  t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd;
  t.x += t.vx * dt; t.y += t.vy * dt;
  t.scan = (t.scan || 0) - dt;
  if (t.scan <= 0) {
    t.scan = 20;
    for (const u of S.units) if (U.dist(u, t) < 500) IC.enemyLearn(S, u, 'recon');
    for (const v of S.vehicles) if (U.dist(v, t) < 500) IC.enemyLearnConvoy(S, v);
    for (const b of IC.bases(S)) if (U.dist(b, t) < 500) IC.enemyAssess && IC.enemyAssess(S, b);
  }
}

IC.moveThreats = function (S, dt) {
  for (const t of S.threats) {
    if (t.dead) continue;
    t.age += dt;
    // where it crossed into our airspace, for the after-action report
    if (!t.entered && !t.d.civil && (t.age % 5) < dt && IC.inHome(t.x, t.y)) t.entered = { x: t.x, y: t.y };
    if (t.flash > 0) t.flash -= dt * 0.1;
    if (t.notchT > 0) t.notchT -= dt;
    switch (t.d.move) {
      case 'wp': moveWp(S, t, dt); break;
      case 'lm': moveLm(S, t, dt); break;
      case 'bal': moveBal(S, t, dt); break;
      case 'hgv': moveHgv(S, t, dt); break;
      case 'arm': moveArm(S, t, dt); break;
      case 'isr': moveIsr(S, t, dt); break;
      case 'air': IC.moveEnemyAir(S, t, dt); break;
      case 'civ': IC.moveCivil(S, t, dt); break;
    }
  }
};

})(window.IC);
