/* Iron Canopy — one simulation step. Kept free of DOM code so it can run headless for testing. */
(function (IC) {
'use strict';

IC.step = function (S, dt) {
  S.time += dt;
  IC.weather(S, dt);
  IC.updateUnits(S, dt);
  IC.updateEmcon(S, dt);
  IC.updateBases(S, dt);
  IC.gops(S, dt);
  IC.updateAir(S, dt);
  IC.sense(S, dt);
  IC.enemyTick(S, dt);
  IC.moveThreats(S, dt);
  IC.defense(S, dt);
  IC.updateMissiles(S, dt);
  IC.updateStrikes(S, dt);
  IC.ground(S, dt);
  IC.logistics(S, dt);
  IC.economy(S, dt);
  IC.civil(S, dt);
  IC.aviation(S, dt);
  IC.fatigue(S, dt);
  IC.airspace(S, dt);
  IC.incidents(S, dt);
  if (S.mode === 'academy') IC.academyTick(S, dt); else if (S.mode === 'story') IC.storyTick(S, dt); else IC.campaignTick(S, dt);
  const F = S.fx;
  for (const f of F.fires) f.t += dt;
  F.fires = F.fires.filter(f => f.t < f.life);
  for (const p of F.plumes) p.t += dt;
  F.plumes = F.plumes.filter(p => p.t < p.life);
  // ballistic missiles leave a boost trail while they climb
  for (const t of S.threats) if (t.tr && !t.dead && t.det && t.alt > 0.5) { t.trT = (t.trT || 0) - dt; if (t.trT <= 0) { t.trT = 2; t.tr.pts.push({ x: t.x, y: t.y, t: S.time }); if (t.tr.pts.length > 60) t.tr.pts.shift(); } }
  if ((S.trailT = (S.trailT || 0) - dt) <= 0) {
    S.trailT = 5;
    F.trails = F.trails.filter(tr => tr.pts.length === 0 ? S.time - (tr.born || (tr.born = S.time)) < 120 : S.time - tr.pts[tr.pts.length - 1].t < 240);
    S.wrecks = S.wrecks.filter(w => S.time - w.t < 6 * 3600);
  }
  S.threats = S.threats.filter(t => !t.dead);
  if (S.sel) {
    const r = S.sel.ref;
    if (!r || r.dead || (S.sel.kind === 'track' && !S.threats.includes(r)) || (S.sel.kind === 'veh' && !S.vehicles.includes(r)) || (S.sel.kind === 'air' && !S.air.includes(r))) S.sel = null;
  }
  S.group = S.group.filter(x => !x.dead);
  if (S.mode2 && S.mode2.unit && S.mode2.unit.dead) S.mode2 = null;
};

})(window.IC);
