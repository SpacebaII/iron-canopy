/* Iron Canopy — unit lifecycle: buying (pay when you place it; it is loaded, driven there and set up in minutes),
   deployment from the national reserve, setup, relocation, repair. */
(function (IC) {
'use strict';
const U = IC.U;

IC.unitSpeed = u => u.d.fast ? [0.5, 0.3] : u.d.mob === 'mobile' ? [0.45, 0.18] : [0.32, 0.12];

IC.canPlace = function (S, type, x, y, ignore) {
  if (!IC.inHome(x, y) || IC.inLake(x, y) || IC.borderDist(x, y) < 40) return false;
  const d = IC.UNITS[type];
  for (const u of S.units) {
    if (u === ignore) continue;
    const r = (d.mob === 'fixed' || u.d.mob === 'fixed') ? 34 : 16;
    if (U.dxy(u.x, u.y, x, y) < r) return false;
  }
  for (const i of S.infra) if (i.kind !== 'city' && i.kind !== 'bridge' && U.dxy(i.x, i.y, x, y) < (i.parts ? Math.max(12, i.radius * 0.8) : 22)) return false;
  return true;
};

/* ---------- buying: pay when you place it, and it comes at once ---------- */
/* doctrine choices in the story make some equipment cheaper */
IC.unitCost = function (S, type) {
  const d = IC.UNITS[type], D = S.story && S.story.doc || {};
  let k = 1;
  if (D.forward && (type === 'gf' || type === 'mr3d' || type === 'acou')) k *= 0.75;
  if (D.depth && (type === 'mrsam' || type === 'shorad' || type === 'lr3d')) k *= 0.8;
  if (D.cheapGuns && (type === 'spaag' || type === 'cram' || type === 'dgun')) k *= 0.7;
  return Math.round(d.cost * k);
};
IC.LOAD_T = 120;   // s to load a new or reserve unit onto its transporters
IC.AIRLIFT = { kmh: 250, load: 300, over: 1500 };   // heavy-lift helicopters: used when the drive would take over 25 min
/* why a unit cannot be bought now ('' if it can) */
IC.buyBlock = function (S, type) {
  const d = IC.UNITS[type];
  if (!IC.hasTech(S, d.tech)) return 'Needs research';
  if (S.story && !IC.storyAllows(S, type)) return 'Not yet in your remit';
  if (S.budget < IC.unitCost(S, type)) return `Needs ${U.money(IC.unitCost(S, type))}`;
  return '';
};
/* where equipment rolls out from: depots, garrisons, the barracks in our cities, and our airfields (new equipment
   is flown to the nearest) */
IC.musterPoints = function (S) {
  const pts = IC.depots(S).map(d => ({ x: d.x, y: d.y, name: d.name }));
  for (const g of S.world.garrisons) pts.push({ x: g.x, y: g.y, name: g.name });
  for (const c of IC.cities(S)) if (c.owner === 'us') pts.push({ x: c.x, y: c.y, name: `${c.name} barracks` });
  for (const b of IC.bases(S)) if (b.owner === 'us' && (b.kind === 'airbase' || b.parts) && !b.locked) pts.push({ x: b.x, y: b.y, name: b.name.replace(/ (International|Airport)$/, '') });
  return pts;
};
/* how a unit placed here gets there: from where, and how long loading, the drive and setting up take */
IC.deliveryPlan = function (S, type, x, y) {
  const d = IC.UNITS[type];
  if (d.mob === 'fixed') return { fixed: true, from: null, load: 0, road: 0, setup: d.build, total: d.build };
  const pts = IC.musterPoints(S).sort((a, b) => U.dxy(a.x, a.y, x, y) - U.dxy(b.x, b.y, x, y)).slice(0, 3);
  const [vr, vo] = IC.unitSpeed({ d });
  let best = null;
  for (const p of pts.length ? pts : [IC.cap(S)]) { const r = IC.route(p.x, p.y, x, y), t = IC.routeTime(p, r, vr, vo); if (!best || t < best.road) best = { from: p, road: t }; }
  // a long drive: flown in from the nearest airfield instead
  const A = IC.AIRLIFT, fields = IC.bases(S).filter(b => b.owner === 'us' && !b.locked && (b.kind === 'airbase' || b.parts));
  const af = fields.sort((a, b) => U.dxy(a.x, a.y, x, y) - U.dxy(b.x, b.y, x, y))[0];
  if (af && best.road > A.over) {
    const fly = U.dxy(af.x, af.y, x, y) * 360 / A.kmh;
    if (fly + A.load < best.road + IC.LOAD_T) return { fixed: false, air: true, from: { x: af.x, y: af.y, name: af.name.replace(/ (International|Airport)$/, '') }, load: A.load, road: fly, setup: d.build, total: A.load + fly + d.build };
  }
  return { fixed: false, from: best.from, load: IC.LOAD_T, road: best.road, setup: d.build, total: IC.LOAD_T + best.road + d.build };
};
/* buy one into the reserve without placing it (scripts and story use this) */
IC.order = function (S, type) {
  if (IC.buyBlock(S, type)) return false;
  IC.pay(S, 'buyUnits', IC.unitCost(S, type));
  S.reserve[type] = (S.reserve[type] || 0) + 1;
  IC.log(S, 'info', 'ORDER', `${IC.UNITS[type].name} bought (${U.money(IC.unitCost(S, type))}): in the reserve, ready to place.`);
  IC.emit(S, 'procure', type);
  return true;
};
/* place a unit: from the reserve if there is one, bought otherwise */
IC.deploy = function (S, type, x, y) {
  const d = IC.UNITS[type];
  if (!IC.canPlace(S, type, x, y)) return null;
  let bought = 0;
  if (!(S.reserve[type] > 0)) {
    if (IC.buyBlock(S, type)) return null;
    bought = IC.unitCost(S, type);
    IC.pay(S, 'buyUnits', bought);
    S.reserve[type] = (S.reserve[type] || 0) + 1;
    IC.emit(S, 'procure', type);
  }
  S.reserve[type]--;
  S.flags.deployed = (S.flags.deployed || 0) + 1;
  IC.emit(S, 'deploy', type);
  const P = IC.deliveryPlan(S, type, x, y), cost = bought ? ` (bought, ${U.money(bought)})` : '';
  if (P.fixed) {
    const u = IC.makeUnit(S, type, x, y, {});
    IC.log(S, 'info', 'BUILD', `${u.name} ${d.name}${cost} under construction near ${IC.nearestPlace(S, x, y)}: ready in ${U.dur(d.build)}.`);
    return u;
  }
  const u = IC.makeUnit(S, type, P.from.x + U.rand(-3, 3), P.from.y + U.rand(-3, 3), {});
  // loaded first, then it drives there and sets up
  u.state = 'packing'; u.stT = u.stMax = P.load; u.dest = { x, y }; u.deliver = true; u.airlift = !!P.air;
  u.eta = S.time + P.load + P.road;
  IC.log(S, 'info', 'DEPLOY', `${u.name} ${d.name}${cost} ${P.air ? 'loading onto heavy-lift helicopters' : 'loading'} at ${P.from.name}: in position in about ${U.dur(P.load + P.road)}, ready ${U.dur(P.setup)} later.`);
  return u;
};
IC.relocate = function (S, u, x, y) {
  if (u.d.mob === 'fixed' || u.state !== 'ready' || !IC.canPlace(S, u.type, x, y, u)) return false;
  if (IC.ok(u, 'mob') < 0.3) { IC.log(S, 'warn', 'MOVE', `${u.name} cannot move: its vehicles are knocked out.`, u); return false; }
  u.state = 'packing'; u.stT = u.stMax = u.d.mob === 'mobile' ? (u.d.fast ? 30 : 90) : 600;
  u.dest = { x, y }; u.beam = null; u.radarOn = false; u.toReserve = false;
  IC.log(S, 'info', 'MARCH', `${u.name} packing up to move.`);
  return true;
};
IC.toReserve = function (S, u) {
  if (u.d.mob === 'fixed') {
    const refund = u.d.cost * 0.2; S.budget += refund; IC.econBook(S, 'refund', refund);
    kill(S, u);
    IC.log(S, 'info', 'DISMANTLE', `${u.name} dismantled (+${U.money(refund)}).`);
    return;
  }
  const m = IC.musterPoints(S).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0]; if (!m) return;
  u.state = 'packing'; u.stT = u.stMax = u.d.mob === 'mobile' ? 90 : 600; u.dest = { x: m.x, y: m.y }; u.toReserve = true; u.radarOn = false;
  IC.log(S, 'info', 'RESERVE', `${u.name} returning to the reserve at ${m.name}.`);
};
IC.repairUnit = function (S, u) {
  const cost = Math.max(3, u.d.cost * 0.08);
  if (u.repairing || S.budget < cost || (u.hp >= u.max && Object.values(u.comp).every(v => v >= 1))) return false;
  IC.pay(S, 'repair', cost); u.repairing = true;
  IC.log(S, 'info', 'REPAIR', `Repair crew sent to ${u.name} (${U.money(cost)}).`);
  return true;
};
function kill(S, u) {
  u.dead = true;
  S.units = S.units.filter(x => x !== u);
  for (const v of S.vehicles) if (v.home === u) v.homeless = true;
  if (u.inv) { const ds = IC.depots(S); if (ds.length) for (const k in u.inv) ds[0].inv[k] += u.inv[k]; }
  if (S.sel && S.sel.ref === u) S.sel = null;
  S.group = S.group.filter(x => x !== u);
}

/* shoot and scoot: a launcher that has fired and been found moves a few km once the shooting stops */
IC.SCOOT = { quiet: 20, within: 600, min: 25, max: 45 };
function scoot(S, u) {
  const C = IC.SCOOT, since = S.time - u.lastFired;
  if (since < C.quiet || since > C.within || (u.scootT || -1e9) > u.lastFired || S.missiles.some(m => m.unit === u)) return;
  const k = S.enemy && S.enemy.known && S.enemy.known.get(u.id);
  if (!k || U.dxy(k.x, k.y, u.x, u.y) > 30) return;
  u.scootT = S.time;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, r = U.rand(C.min, C.max), x = u.x + Math.cos(a) * r, y = u.y + Math.sin(a) * r;
    if (!IC.canPlace(S, u.type, x, y, u)) continue;
    if (IC.relocate(S, u, x, y)) { IC.log(S, 'info', 'SCOOT', `${u.name} has fired and the enemy knows where it is: moving ${U.km(r)} to a new position.`, u); return; }
  }
}

const moveSpeed = u => u.airlift ? [IC.AIRLIFT.kmh / 360, IC.AIRLIFT.kmh / 360] : IC.unitSpeed(u);
IC.updateUnits = function (S, dt) {
  for (const u of S.units.slice()) {
    if (u.d.scoot && u.state === 'ready') scoot(S, u);
    if (u.state === 'building' || u.state === 'setup' || u.state === 'packing') {
      u.stT -= dt * (0.5 + 0.5 * IC.ok(u, 'crew'));
      if (u.state !== 'packing' && Math.random() < dt * 0.02) IC.part(S, { x: u.x, y: u.y, ox: U.rand(-6, 6), oy: U.rand(-6, 6), vy: -4, life: 1.2, size: 3, grow: 4, col: '150,140,120', a: 0.25 });
      if (u.stT <= 0) {
        if (u.state === 'packing') { u.state = 'transit'; u.route = u.airlift || S.flat ? [{ x: u.dest.x, y: u.dest.y, road: true }] : IC.route(u.x, u.y, u.dest.x, u.dest.y); const [vr, vo] = moveSpeed(u); u.eta = S.time + IC.routeTime(u, u.route, vr, vo); u.stMax = 0; }
        else { u.state = 'ready'; IC.log(S, 'info', 'READY', `${u.name} ${u.d.name} operational.`); IC.emit(S, 'ready', u); }
      }
    } else if (u.state === 'transit') {
      const [vr, vo] = moveSpeed(u);
      const k = u.airlift ? 1 : 0.4 + 0.6 * IC.ok(u, 'mob');
      if (IC.followRoute(u, dt, vr * k, vo * k)) {
        u.x = u.dest.x; u.y = u.dest.y; u.route = null;
        if (u.toReserve) {
          const dep = IC.depots(S).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0];
          if (dep) for (const m of u.mags) dep.inv[m.mun] = (dep.inv[m.mun] || 0) + m.mag + m.store;
          S.reserve[u.type] = (S.reserve[u.type] || 0) + 1;
          kill(S, u);
          IC.log(S, 'info', 'RESERVE', `${u.name} back in the reserve.`);
          continue;
        }
        u.state = 'setup'; u.stT = u.stMax = u.d.build * (u.moved ? 0.6 : 1);
        u.moved = true; u.deliver = false; u.airlift = false;
      }
    }
  }
};

})(window.IC);
