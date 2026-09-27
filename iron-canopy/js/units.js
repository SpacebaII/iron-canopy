/* Iron Canopy — unit lifecycle: procurement (several orders at once, minutes not hours), deployment from the
   national reserve, setup, relocation, repair. */
(function (IC) {
'use strict';
const U = IC.U;

IC.unitSpeed = u => u.d.fast ? [0.5, 0.3] : u.d.mob === 'mobile' ? [0.45, 0.18] : [0.32, 0.12];

IC.canPlace = function (S, type, x, y, ignore) {
  if (!IC.inHome(x, y) || IC.inLake(x, y) || IC.borderDist(x, y) < 40) return false;
  if (IC.enemyHeld && IC.enemyHeld(S, x, y)) return false;
  const d = IC.UNITS[type];
  for (const u of S.units) {
    if (u === ignore) continue;
    const r = (d.mob === 'fixed' || u.d.mob === 'fixed') ? 34 : 16;
    if (U.dxy(u.x, u.y, x, y) < r) return false;
  }
  for (const i of S.infra) if (i.kind !== 'city' && i.kind !== 'bridge' && U.dxy(i.x, i.y, x, y) < (i.parts ? Math.max(12, i.radius * 0.8) : 22)) return false;
  return true;
};

/* ---------- procurement ---------- */
IC.slots = S => IC.MOBIL[S.mobil].slots;
/* doctrine choices in the story make some equipment cheaper */
IC.unitCost = function (S, type) {
  const d = IC.UNITS[type], D = S.story && S.story.doc || {};
  let k = 1;
  if (D.forward && (type === 'gf' || type === 'mr3d' || type === 'acou')) k *= 0.75;
  if (D.depth && (type === 'mrsam' || type === 'shorad' || type === 'lr3d')) k *= 0.8;
  if (D.cheapGuns && (type === 'spaag' || type === 'cram')) k *= 0.7;
  return Math.round(d.cost * k);
};
IC.leadTime = (S, type) => IC.UNITS[type].lead / (1 + 0.25 * S.mobil);
IC.order = function (S, type) {
  const d = IC.UNITS[type];
  if (!IC.hasTech(S, d.tech) || S.budget < IC.unitCost(S, type) || (S.story && !IC.storyAllows(S, type))) return false;
  S.budget -= IC.unitCost(S, type);
  S.orders.push({ id: IC.nid('o'), type, prog: 0, dur: IC.leadTime(S, type), started: false });
  const active = S.orders.filter(o => o.started).length;
  IC.log(S, 'info', 'ORDER', `${d.name} ordered (${U.money(d.cost)}). ${active < IC.slots(S) ? `Ready in about ${U.dur(IC.leadTime(S, type))}.` : 'Queued: all production slots are busy.'}`);
  IC.emit(S, 'procure', type);
  return true;
};
IC.procure = IC.order;
IC.cancelOrder = function (S, id) {
  const o = S.orders.find(x => x.id === id); if (!o) return;
  S.orders = S.orders.filter(x => x !== o);
  S.budget += IC.UNITS[o.type].cost * (o.started ? 0.5 : 1);
};
function orders(S, dt) {
  let active = 0;
  for (const o of S.orders) {
    if (!o.started) { if (active < IC.slots(S)) o.started = true; else continue; }
    active++;
    o.prog += dt / o.dur;
    if (o.prog >= 1) {
      o.done = true;
      S.reserve[o.type] = (S.reserve[o.type] || 0) + 1;
      IC.log(S, 'kill', 'DELIVERED', `${IC.UNITS[o.type].name} delivered to the reserve.`);
      IC.sfx && IC.sfx.ui('ok');
      IC.emit(S, 'delivered', o.type);
    }
  }
  S.orders = S.orders.filter(o => !o.done);
}

/* where equipment from the national reserve can roll out from */
IC.musterPoints = function (S) {
  const pts = IC.depots(S).map(d => ({ x: d.x, y: d.y, name: d.name }));
  for (const g of S.world.garrisons) if (!IC.enemyHeld(S, g.x, g.y)) pts.push({ x: g.x, y: g.y, name: g.name });
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.kind === 'airbase') pts.push({ x: b.x, y: b.y, name: b.name });
  return pts;
};
IC.deploy = function (S, type, x, y) {
  const d = IC.UNITS[type];
  if (!(S.reserve[type] > 0) || !IC.canPlace(S, type, x, y)) return null;
  S.reserve[type]--;
  S.flags.deployed = (S.flags.deployed || 0) + 1;
  IC.emit(S, 'deploy', type);
  if (d.mob === 'fixed') {
    const u = IC.makeUnit(S, type, x, y, {});
    IC.log(S, 'info', 'BUILD', `${u.name} ${d.name} under construction near ${IC.nearestPlace(S, x, y)} (${U.dur(d.build)}).`);
    return u;
  }
  const from = IC.musterPoints(S).sort((a, b) => U.dxy(a.x, a.y, x, y) - U.dxy(b.x, b.y, x, y))[0] || IC.cap(S);
  const u = IC.makeUnit(S, type, from.x + U.rand(-8, 8), from.y + U.rand(-8, 8), {});
  u.state = 'transit'; u.dest = { x, y }; u.route = IC.route(u.x, u.y, x, y);
  const [vr, vo] = IC.unitSpeed(u);
  u.eta = S.time + IC.routeTime(u, u.route, vr, vo);
  IC.log(S, 'info', 'DEPLOY', `${u.name} ${d.name} leaving ${from.name}, in position in about ${U.dur(u.eta - S.time)}.`);
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
    const refund = u.d.cost * 0.2; S.budget += refund;
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
  S.budget -= cost; u.repairing = true;
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

IC.updateUnits = function (S, dt) {
  orders(S, dt);
  for (const u of S.units.slice()) {
    if (u.state === 'building' || u.state === 'setup' || u.state === 'packing') {
      u.stT -= dt * (0.5 + 0.5 * IC.ok(u, 'crew'));
      if (u.state !== 'packing' && Math.random() < dt * 0.02) IC.part(S, { x: u.x, y: u.y, ox: U.rand(-6, 6), oy: U.rand(-6, 6), vy: -4, life: 1.2, size: 3, grow: 4, col: '150,140,120', a: 0.25 });
      if (u.stT <= 0) {
        if (u.state === 'packing') { u.state = 'transit'; u.route = IC.route(u.x, u.y, u.dest.x, u.dest.y); const [vr, vo] = IC.unitSpeed(u); u.eta = S.time + IC.routeTime(u, u.route, vr, vo); }
        else { u.state = 'ready'; IC.log(S, 'info', 'READY', `${u.name} ${u.d.name} operational.`); IC.emit(S, 'ready', u); }
      }
    } else if (u.state === 'transit') {
      const [vr, vo] = IC.unitSpeed(u);
      const k = 0.4 + 0.6 * IC.ok(u, 'mob');
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
        u.moved = true;
      }
    }
  }
};

})(window.IC);
