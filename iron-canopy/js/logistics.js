/* Iron Canopy — logistics (named convoys with real jobs, depots with service areas and stock profiles,
   helicopter lifts, cargo planes), industry, economy, policy and research. The player sets the network up —
   where depots sit, how many truck companies each runs, what they stock, who gets served first — and the
   convoys then run themselves. */
(function (IC) {
'use strict';
const U = IC.U;

const truckCap = S => IC.hasTech(S, 'l_trucks') ? 18 : 12;
const truckSpd = S => IC.hasTech(S, 'l_trucks') ? [0.48, 0.18] : [0.4, 0.15];
const convoyCap = (S, v) => truckCap(S) * v.trucks;
IC.PROFILES = {
  balanced: { name: 'Balanced', ad: 1, army: 1, desc: 'Missiles and supply in proportion to local demand.' },
  ad: { name: 'Air defense first', ad: 1.6, army: 0.5, desc: 'Deep missile stocks for the batteries nearby.' },
  army: { name: 'Army first', ad: 0.5, army: 1.8, desc: 'Supply and anti-tank kits for the brigades.' }
};

IC.addTruck = function (S, home) {
  home.convoyN = (home.convoyN || 0) + 1;
  const tag = home.central ? 'C' : home.name.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'F';
  const v = { id: IC.nid('v'), kind: 'truck', name: `Convoy ${tag}-${String(home.convoyN).padStart(2, '0')}`, home, x: home.x + U.rand(-8, 8), y: home.y + U.rand(-8, 8), h: 0,
    state: 'idle', route: null, job: null, t: 0, trucks: 3, dead: false };
  S.vehicles.push(v);
  return v;
};
IC.buyCompany = function (S, depot) { if (S.budget < 12) return false; S.budget -= 12; IC.addTruck(S, depot); IC.log(S, 'info', 'LOGI', `New truck company at ${depot.name}.`); return true; };
IC.moveCompany = function (S, from, to) {
  const v = S.vehicles.find(x => x.home === from && x.state === 'idle' && !x.dead);
  if (!v) return false;
  v.home = to; v.state = 'return'; v.route = IC.route(v.x, v.y, to.x, to.y);
  IC.log(S, 'info', 'LOGI', `${v.name} rebasing to ${to.name}.`);
  return true;
};
IC.depots = S => S.units.filter(u => u.type === 'depot' && u.state === 'ready' && !u.dead);
IC.nodes = S => IC.depots(S).concat(S.infra.filter(i => i.inv && !i.offline && i.owner === 'us'));
const freeTruck = (S, d) => S.vehicles.find(v => v.home === d && v.kind === 'truck' && v.state === 'idle' && !v.dead);
IC.serves = (d, x, y) => d.central || U.dxy(d.x, d.y, x, y) <= (d.reach || 1400);

function newJob(S, o) {
  const j = Object.assign({ id: IC.nid('j'), state: 'active', t0: S.time }, o);
  j.label = j.kind === 'ground' ? `${j.qty} supply → ${j.to.name}` : j.kind === 'lift' ? `${IC.HLIFT[j.cargo].name} → ${j.to.name}` : j.kind === 'restock' ? `Restock ${j.qty}× ${j.mun} from ${j.from.name}` : j.kind === 'import' ? `${j.qty}× ${j.mun} import` : `${j.qty}× ${j.mun} → ${j.to.name}`;
  j.short = j.kind === 'ground' ? 'SUPPLY' : j.kind === 'lift' ? 'LIFT' : j.kind === 'restock' ? 'RESTOCK' : 'AMMO';
  S.jobs.push(j);
  return j;
}
IC.failJob = function (S, j) {
  if (j.state !== 'active') return;
  j.state = 'failed';
  if (!j.loaded && j.from && j.from.inv && j.mun) j.from.inv[j.mun] += j.qty;
  if (j.kind === 'lift' && j.cargo === 'REPL' && !j.loaded) S.manpower += IC.HLIFT.REPL.repl;
  if (j.mag) j.mag.inc = Math.max(0, j.mag.inc - j.qty0);
  if (j.kind === 'ground' && j.to) j.to.supInc = Math.max(0, (j.to.supInc || 0) - j.qty0);
  if (j.kind === 'lift' && j.to) j.to.lift = null;
  if (j.to && j.to.inc && !j.mag && j.kind !== 'ground' && j.kind !== 'lift') j.to.inc[j.mun] = Math.max(0, (j.to.inc[j.mun] || 0) - j.qty0);
};
function deliver(S, j) {
  j.state = 'done';
  if (j.kind === 'ground') {
    j.to.supInc = Math.max(0, (j.to.supInc || 0) - j.qty0);
    if (!j.to.dead) j.to.sup = Math.min(100, j.to.sup + j.qty * 4);
    return;
  }
  if (j.kind === 'lift') {
    const g = j.to; g.lift = null;
    if (g.dead) return;
    if (j.cargo === 'SUP') g.sup = Math.min(100, g.sup + 30);
    else if (j.cargo === 'ATG') g.kit.atgm += j.qty + 2;
    else if (j.cargo === 'REPL') g.str = Math.min(100, g.str + IC.HLIFT.REPL.repl);
    IC.log(S, 'kill', 'LIFT', `${IC.HLIFT[j.cargo].name} delivered to ${g.name}.`, g);
    IC.emit(S, 'lift', { g, cargo: j.cargo });
    return;
  }
  if (j.mag) {
    j.mag.inc = Math.max(0, j.mag.inc - j.qty0);
    let q = j.qty;
    const toStore = Math.min(j.mag.storeMax - j.mag.store, q); j.mag.store += toStore; q -= toStore;
    const toMag = Math.min(j.mag.max - j.mag.mag, q); j.mag.mag += toMag; q -= toMag;
    j.mag.store += q;
    IC.emit(S, 'rearmed', j.to);
  } else {
    j.to.inv[j.mun] = (j.to.inv[j.mun] || 0) + j.qty;
    if (j.to.inc) j.to.inc[j.mun] = Math.max(0, (j.to.inc[j.mun] || 0) - j.qty0);
  }
}

/* ---------- convoys ---------- */
IC.updateVehicles = function (S, dt) {
  const [vr, vo] = truckSpd(S);
  for (const v of S.vehicles) {
    if (v.dead) continue;
    if (v.homeless) {
      const ds = IC.depots(S); if (!ds.length) continue;
      v.home = ds.sort((a, b) => U.dist(a, v) - U.dist(b, v))[0]; v.homeless = false;
      if (v.state === 'idle') { v.state = 'return'; v.route = IC.route(v.x, v.y, v.home.x, v.home.y); }
    }
    const j = v.job;
    switch (v.state) {
      case 'idle': break;
      case 'load': v.t -= dt; if (v.t <= 0) { j.loaded = true; v.state = 'toDest'; v.route = IC.route(v.x, v.y, j.to.x, j.to.y); v.dest = { x: j.to.x, y: j.to.y }; v.eta = S.time + IC.routeTime(v, v.route, vr, vo); } break;
      case 'toSource': if (IC.followRoute(v, dt, vr, vo)) { v.state = 'load'; v.t = 240; } break;
      case 'toDest': {
        if (j.to.dead) { IC.failJob(S, j); v.job = null; v.state = 'return'; v.route = IC.route(v.x, v.y, v.home.x, v.home.y); break; }
        if (v.route && v.route.length) { const last = v.route[v.route.length - 1]; if (U.dxy(last.x, last.y, j.to.x, j.to.y) > 60) { v.route = IC.route(v.x, v.y, j.to.x, j.to.y); v.dest = { x: j.to.x, y: j.to.y }; } }
        if (IC.followRoute(v, dt, vr, vo)) { v.state = 'unload'; v.t = 200; }
        break;
      }
      case 'unload': v.t -= dt; if (v.t <= 0) { deliver(S, j); v.job = null; if (j.to === v.home) v.state = 'idle'; else { v.state = 'return'; v.route = IC.route(v.x, v.y, v.home.x, v.home.y); v.dest = { x: v.home.x, y: v.home.y }; } } break;
      case 'return': if (IC.followRoute(v, dt, vr, vo)) { v.state = 'idle'; v.route = null; } break;
    }
  }
  S.vehicles = S.vehicles.filter(v => !v.dead);
};

IC.airJobStep = function (S, a) {
  const j = a.job;
  if (!j) { a.dead = true; return; }
  if (a.leg === 'toSource') { a.leg = 'loading'; a.wait = 240; }
  else if (a.leg === 'loading') { j.loaded = true; a.leg = 'toDest'; a.route = [{ x: j.to.x, y: j.to.y }]; }
  else if (a.leg === 'toDest') {
    if (j.to.dead) { IC.failJob(S, j); a.leg = 'home'; }
    else {
      if (j.kind === 'lift' && IC.groundFire && IC.groundFire(S, a, 0.04)) { if (a.dead) return; }
      a.leg = 'unloading'; a.wait = a.kind === 'heli' ? 200 : 600; return;
    }
  }
  else if (a.leg === 'unloading') { deliver(S, j); a.job = null; a.leg = 'home'; if (a.allied) IC.log(S, 'kill', 'IMPORT', `Allied airlift delivered ${j.qty}× ${IC.MUN[j.mun].name.toLowerCase()} to ${j.to.name}.`, j.to); }
  if (a.leg === 'home') {
    if (a.allied) { a.route = [{ x: a.ox, y: a.oy }]; a.leg = 'gone'; return; }
    a.state = 'rtb';
  }
  if (a.leg === 'gone') a.dead = true;
};

function heliFor(S, near, maxD) {
  let best = null, bd = maxD;
  for (const r of S.roster) {
    if (r.kind !== 'heli' || r.st !== 'ready' || !IC.canLaunch(S, r)) continue;
    const d = U.dist(IC.baseOf(S, r.base), near);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
IC.heliResupply = function (S, u, manual) {
  if (!IC.wx(S).heli) { if (manual) IC.log(S, 'warn', 'LOGI', 'Weather grounds the helicopters.'); return false; }
  const mag = IC.activeMags(S, u).find(m => m.storeMax + m.max - m.store - m.mag - m.inc > 0);
  if (!mag) { if (manual) IC.log(S, 'info', 'LOGI', `${u.name} is already fully stocked.`); return false; }
  const M = IC.MUN[mag.mun];
  const src = IC.depots(S).filter(d => d.inv[mag.mun] >= 1).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0];
  if (!src) { if (manual) IC.log(S, 'warn', 'LOGI', `No depot holds ${M.name.toLowerCase()}s for ${u.name}.`); return false; }
  const r = heliFor(S, src, 6500);
  if (!r) { if (manual) IC.log(S, 'warn', 'LOGI', 'No transport helicopter is available.'); return false; }
  const qty = Math.min(Math.floor(src.inv[mag.mun]), Math.max(1, Math.floor(IC.AIR_KIND.heli.cap * r.n / M.w)), mag.storeMax + mag.max - mag.store - mag.mag - mag.inc);
  if (qty < 1) return false;
  src.inv[mag.mun] -= qty; mag.inc += qty;
  const j = newJob(S, { kind: 'unit', mode: 'heli', mun: mag.mun, qty, qty0: qty, from: src, to: u, mag });
  const a = IC.launchAir(S, r, { type: 'supply' }, true);
  if (!a) { IC.failJob(S, j); return false; }
  a.job = j; a.leg = 'toSource'; a.route = [{ x: src.x, y: src.y }];
  IC.log(S, 'info', 'HELI', `${r.name} flying ${qty}× ${mag.mun} from ${src.name} to ${u.name}.`);
  return true;
};
/* helicopter lift to a brigade: supply, anti-tank kits, or replacements */
IC.liftCheck = function (S, g, cargo) {
  const C = IC.HLIFT[cargo];
  if (!IC.wx(S).heli) return 'Weather grounds the helicopters';
  if (g.lift) return 'A lift is already on the way';
  if (cargo === 'REPL' && S.manpower < C.repl) return 'Not enough manpower in the pool';
  if (C.mun && !IC.depots(S).some(d => (d.inv[C.mun] || 0) >= C.qty)) return `No depot holds ${C.qty} ${IC.MUN[C.mun].name.toLowerCase()}s`;
  if (!S.roster.some(r => r.kind === 'heli' && r.st === 'ready' && IC.canLaunch(S, r))) return 'No transport helicopter ready';
  return '';
};
IC.heliLift = function (S, g, cargo, rid) {
  const why = IC.liftCheck(S, g, cargo);
  if (why) { IC.log(S, 'warn', 'LIFT', `${g.name}: ${why}.`); return false; }
  const C = IC.HLIFT[cargo];
  const src = C.mun ? IC.depots(S).filter(d => (d.inv[C.mun] || 0) >= C.qty).sort((a, b) => U.dist(a, g) - U.dist(b, g))[0] : IC.musterPoints(S).sort((a, b) => U.dist(a, g) - U.dist(b, g))[0];
  const r = rid ? S.roster.find(x => x.id === rid) : heliFor(S, src, 1e9);
  if (!r || r.st !== 'ready') return false;
  if (C.mun) src.inv[C.mun] -= C.qty; else S.manpower -= C.repl;
  const j = newJob(S, { kind: 'lift', mode: 'heli', cargo, mun: C.mun, qty: C.qty || 0, qty0: C.qty || 0, from: src, to: g });
  const a = IC.launchAir(S, r, { type: 'hlift', cargo, to: g }, true);
  if (!a) { IC.failJob(S, j); return false; }
  a.job = j; a.leg = 'toSource'; a.route = [{ x: src.x, y: src.y }];
  g.lift = j;
  IC.log(S, 'info', 'LIFT', `${r.name} flying ${C.name.toLowerCase()} from ${src.name} to ${g.name}.`, g);
  IC.emit(S, 'liftOrdered', { g, cargo });
  return true;
};

/* ---------- dispatcher ---------- */
IC.logistics = function (S, dt) {
  IC.updateVehicles(S, dt);
  S.logiT = (S.logiT || 0) - dt;
  if (S.logiT > 0) return;
  S.logiT = 20;
  const depots = IC.depots(S);
  // sources: a depot whose service area covers the customer, then the central depot, then plants and airports
  const sources = depots.concat(S.infra.filter(i => i.inv && !i.offline && i.owner === 'us'));
  const pick = (mun, near, need) => {
    let best = null, bd = 1e9;
    for (const d of sources) {
      if ((d.inv[mun] || 0) < need || !freeTruck(S, d)) continue;
      if (!d.infra && !IC.serves(d, near.x, near.y)) continue;
      const r = U.dist(d, near) * (d.infra ? 2.5 : d.central ? 1.4 : 1);
      if (r < bd) { bd = r; best = d; }
    }
    return best;
  };
  // 1. front-line brigades, by the front's supply priority
  const gs = S.gunits.filter(g => g.side === 'us' && !g.dead && (g.front.active || g.sup < 45) && !(g.obj && g.obj.besieged))
    .sort((a, b) => (b.front.supplyPri - a.front.supplyPri) || (a.sup - b.sup));
  for (const g of gs) {
    const need = Math.ceil((100 - g.sup) / 4) - (g.supInc || 0);
    if (g.sup > 70 || need < 5) continue;
    const d = pick('SUP', g, 5); if (!d) continue;
    const v = freeTruck(S, d);
    const qty = Math.min(need, Math.floor(d.inv.SUP), Math.floor(convoyCap(S, v)));
    d.inv.SUP -= qty; g.supInc = (g.supInc || 0) + qty;
    v.job = newJob(S, { kind: 'ground', mode: 'truck', mun: 'SUP', qty, qty0: qty, from: d, to: g });
    v.state = 'load'; v.t = 180;
  }
  // 2. air defense and strike units, priority units and emptiest first
  const aus = S.units.filter(u => !u.dead && u.mags.length && u.state !== 'transit' && u.state !== 'packing')
    .sort((a, b) => (b.pri ? 1 : 0) - (a.pri ? 1 : 0) || fill(S, a) - fill(S, b));
  for (const u of aus) {
    for (const m of IC.activeMags(S, u)) {
      const deficit = m.storeMax + m.max - m.store - m.mag - m.inc;
      if (deficit <= 0 || (deficit < Math.max(1, m.storeMax * 0.5) && m.mag + m.store > 0 && !u.pri)) continue;
      const M = IC.MUN[m.mun];
      const d = pick(m.mun, u, 1);
      if (!d) {
        if (m.mag + m.store === 0 && m.inc === 0 && S.time - (u.heliT || -1e9) > 1800) { u.heliT = S.time; IC.heliResupply(S, u, false); }
        continue;
      }
      const v = freeTruck(S, d);
      const qty = Math.min(deficit, Math.floor(d.inv[m.mun]), Math.max(1, Math.floor(convoyCap(S, v) / M.w)));
      if (qty < 1) continue;
      d.inv[m.mun] -= qty; m.inc += qty;
      v.job = newJob(S, { kind: 'unit', mode: 'truck', mun: m.mun, qty, qty0: qty, from: d, to: u, mag: m });
      v.state = 'load'; v.t = 180;
    }
  }
  // 3. depots restock to their profile from factories, airports and the central depot
  S.restockT = (S.restockT || 0) - 20;
  if (S.restockT > 0) return;
  S.restockT = 120;
  const central = depots.find(d => d.central);
  const demand = IC.depotDemand(S);
  for (const n of S.infra) {
    if (!n.inv || n.offline || n.owner !== 'us') continue;
    const v = freeTruck(S, n); if (!v) continue;
    let best = null, bs = 0;
    for (const d of depots) for (const mun in n.inv) {
      if (n.inv[mun] < (mun === 'SUP' ? 8 : 1)) continue;
      const want = d.central ? (mun === 'SUP' ? 500 : 1e6) : Math.ceil((demand[d.id][mun] || 0));
      const deficit = want - (d.inv[mun] || 0) - (d.inc[mun] || 0);
      if (deficit <= 0) continue;
      const sc = Math.min(deficit, n.inv[mun]) * IC.MUN[mun].w / (1 + U.dist(n, d) / 3750) * (d.central ? 1 : 1.5);
      if (sc > bs) { bs = sc; best = { d, mun, deficit }; }
    }
    if (!best) continue;
    const qty = Math.min(best.deficit, Math.floor(n.inv[best.mun]), Math.max(1, Math.floor(convoyCap(S, v) / IC.MUN[best.mun].w)));
    if (qty < 1) continue;
    n.inv[best.mun] -= qty; best.d.inc[best.mun] = (best.d.inc[best.mun] || 0) + qty;
    v.job = newJob(S, { kind: 'restock', mode: 'truck', mun: best.mun, qty, qty0: qty, from: n, to: best.d, loaded: false });
    v.state = 'load'; v.t = 240;
  }
  for (const d of depots) {
    if (d.central) continue;
    for (const mun in demand[d.id]) {
      const target = Math.ceil(demand[d.id][mun]);
      const have = (d.inv[mun] || 0) + (d.inc[mun] || 0);
      if (have >= target * 0.6) continue;
      const v = freeTruck(S, d); if (!v) break;
      if (!central || (central.inv[mun] || 0) < 1) continue;
      const M = IC.MUN[mun];
      const qty = Math.min(target - have, Math.floor(central.inv[mun]), Math.max(1, Math.floor(convoyCap(S, v) / M.w)));
      if (qty < 1) continue;
      central.inv[mun] -= qty; d.inc[mun] = (d.inc[mun] || 0) + qty;
      v.job = newJob(S, { kind: 'restock', mode: 'truck', mun, qty, qty0: qty, from: central, to: d });
      v.state = 'toSource'; v.route = IC.route(v.x, v.y, central.x, central.y);
    }
  }
  S.jobs = S.jobs.filter(j => j.state === 'active');
};
/* what each depot should hold, from the units in its service area and its stock profile */
IC.depotDemand = function (S) {
  const depots = IC.depots(S), demand = {};
  for (const d of depots) demand[d.id] = {};
  for (const u of S.units) {
    if (!u.mags.length) continue;
    const near = depots.filter(d => !d.central && IC.serves(d, u.x, u.y)).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0] || depots.find(d => d.central);
    if (!near) continue;
    const P = IC.PROFILES[near.profile || 'balanced'];
    for (const m of IC.activeMags(S, u)) demand[near.id][m.mun] = (demand[near.id][m.mun] || 0) + (m.storeMax + m.max) * P.ad;
  }
  for (const g of S.gunits) {
    if (g.side !== 'us' || g.dead) continue;
    const near = depots.filter(d => !d.central && IC.serves(d, g.x, g.y)).sort((a, b) => U.dist(a, g) - U.dist(b, g))[0] || depots.find(d => d.central);
    if (!near) continue;
    const P = IC.PROFILES[near.profile || 'balanced'];
    demand[near.id].SUP = (demand[near.id].SUP || 0) + (g.front.active ? 25 : 8) * (0.5 + g.front.supplyPri * 0.5) * P.army;
    demand[near.id].ATG = (demand[near.id].ATG || 0) + 4 * P.army;
  }
  return demand;
};
function fill(S, u) { let a = 0, b = 0; for (const m of IC.activeMags(S, u)) { a += m.mag + m.store + m.inc; b += m.max + m.storeMax; } return b ? a / b : 1; }
IC.fill = fill;

/* ---------- industry, production and imports ---------- */
IC.industry = function (S) {
  let have = 0, tot = 0;
  for (const c of IC.cities(S)) {
    tot += c.ind;
    const plant = c.plant && S.byId[c.plant];
    if (c.owner === 'us') have += c.ind * (c.hp / c.max) * (plant && plant.offline ? 0.6 : 1);
  }
  return tot ? have / tot : 1;
};
IC.factoryLines = (S, f) => f.lines + (IC.hasTech(S, 'l_lines') ? 1 : 0);
IC.orderProduction = function (S, f, mun, qty) {
  const M = IC.MUN[mun], cost = M.cost * qty;
  if (!IC.hasTech(S, IC.MUN_TECH[mun]) || S.budget < cost || f.offline || f.owner !== 'us') return false;
  S.budget -= cost;
  const q = f.queue.find(x => x.mun === mun && x.started < x.qty);
  if (q) q.qty += qty; else f.queue.push({ mun, qty, started: 0, done: 0 });
  IC.log(S, 'info', 'ORDER', `${f.name}: ${qty}× ${M.name.toLowerCase()} ordered (${U.money(cost)}).`);
  IC.emit(S, 'production', mun);
  IC.sfx && IC.sfx.ui('ok');
  return true;
};
IC.importPrice = (S, mun, qty) => IC.MUN[mun].cost * qty * (1.9 - S.support / 100);
IC.orderImport = function (S, mun, qty) {
  const cost = IC.importPrice(S, mun, qty);
  if (!IC.hasTech(S, IC.MUN_TECH[mun]) || S.budget < cost) return false;
  S.budget -= cost;
  S.imports.push({ mun, qty, eta: S.time + U.rand(1500, 2700), state: 'ordered' });
  IC.log(S, 'info', 'IMPORT', `Ordered ${qty}× ${IC.MUN[mun].name.toLowerCase()} from ${S.world.names.D} (${U.money(cost)}). Airlift in about ${U.dur(2100)}.`);
  IC.emit(S, 'production', mun);
  return true;
};
function production(S, dt) {
  const eff = IC.powerFactor(S), mob = IC.MOBIL[S.mobil], ind = 0.5 + 0.5 * IC.industry(S);
  for (const f of S.infra) {
    if (f.kind !== 'factory' || f.offline || f.owner !== 'us') continue;
    const lines = IC.factoryLines(S, f);
    while (f.active.length < lines) {
      const q = f.queue.find(x => x.started < x.qty);
      if (!q) break;
      q.started++; f.active.push({ mun: q.mun, q, prog: 0 });
    }
    for (const a of f.active) {
      a.prog += dt / IC.MUN[a.mun].prod * (f.hp / f.max) * eff * mob.prod * ind;
      if (a.prog >= 1) { a.done = true; f.inv[a.mun] = (f.inv[a.mun] || 0) + 1; a.q.done++; }
    }
    f.active = f.active.filter(a => !a.done);
    f.queue = f.queue.filter(q => q.done < q.qty);
    f.inv.SUP = (f.inv.SUP || 0) + 10 * mob.sup * eff * ind * (f.hp / f.max) * (IC.hasTech(S, 'l_ind') ? 1.5 : 1) * dt / 3600;
  }
  for (const im of S.imports) {
    if (im.state === 'ordered' && S.time >= im.eta - 1600) {
      const apt = IC.bases(S).filter(i => i.owner === 'us' && IC.baseStatus(S, i).runway).sort((a, b) => U.dist(a, IC.cap(S)) - U.dist(b, IC.cap(S)))[0];
      if (!apt) continue;
      im.state = 'flying';
      const ex = S.world.crossings.find(c => c.k === 'D') || S.world.crossings[0];
      const ox = ex ? ex.far.x : -200, oy = ex ? ex.far.y : 4500;
      const a = { id: IC.nid('a'), kind: 'cargo', allied: true, name: `${S.world.names.D.toUpperCase()} AIRLIFT`, x: ox, y: oy, ox, oy, vx: 0, vy: 0, h: 0, state: 'out', fuel: 1e9, hp: 1, n: 1, cm: 0, alt: 8 };
      a.job = newJob(S, { kind: 'import', mode: 'cargo', mun: im.mun, qty: im.qty, qty0: im.qty, from: { name: S.world.names.D }, to: apt });
      a.job.loaded = true; a.leg = 'toDest'; a.route = [{ x: apt.x, y: apt.y }];
      S.air.push(a);
      im.state = 'done';
    }
  }
  S.imports = S.imports.filter(i => i.state !== 'done');
}

/* ---------- economy, policy, research ---------- */
IC.nationalMorale = function (S) {
  let s = 0, p = 0;
  for (const c of IC.cities(S)) { s += c.morale * c.pop; p += c.pop; }
  return s / p;
};
IC.setMobil = function (S, lvl) {
  if (lvl === S.mobil || lvl < 0 || lvl > 2) return;
  const up = lvl > S.mobil;
  S.mobil = lvl;
  IC.log(S, 'warn', 'POLICY', `${IC.MOBIL[lvl].name} declared.`);
  IC.news(S, up ? `Government declares ${IC.MOBIL[lvl].name.toLowerCase()}; reservists report to barracks.` : `Mobilization eased to ${IC.MOBIL[lvl].name.toLowerCase()}.`);
  if (up) for (const c of IC.cities(S)) c.morale = Math.max(0, c.morale - 3);
  IC.emit(S, 'mobil', lvl);
};
IC.warBonds = function (S) {
  if (S.time - S.bondsT < 86400) return false;
  S.bondsT = S.time;
  const v = 200 + S.mobil * 80;
  S.budget += v;
  for (const c of IC.cities(S)) c.morale = Math.max(0, c.morale - 3);
  IC.log(S, 'info', 'POLICY', `War bonds raised ${U.money(v)}.`);
  IC.news(S, 'Citizens queue to buy war bonds; the treasury raises emergency funds.');
  return true;
};
IC.economy = function (S, dt) {
  production(S, dt);
  const mob = IC.MOBIL[S.mobil];
  let tax = 0, apt = 0;
  const air = { open: 1, restricted: 0.5, closed: 0 }[S.airspace];
  for (const i of S.infra) {
    if (i.offline || i.owner !== 'us') continue;
    if (i.kind === 'city') tax += i.pop * 0.02 * (i.hp / i.max) * i.prosp * (0.5 + i.morale / 200) * (i.besieged ? 0.2 : 1);
    if (i.kind === 'airport' && !S.av) apt += i.rev * air * (i.hp / i.max);
  }
  for (const t of S.world.foreign) if (t.taken) tax += 3;
  tax *= mob.tax;
  let aidRate = S.support * 0.12, base = 25;
  // in the story the budget grows with the job: a civil aviation authority, then a defence command
  if (S.story) { const k = [0, 0, 0, 0.25, 1][S.story.act] || 0; base = S.story.grant; tax *= k; aidRate *= S.story.act >= 4 ? 1 : 0; }
  let upAD = 0;
  const bands = {};
  for (const u of S.units) { const b = IC.BAND[u.type]; if (b && u.radarOn) bands[b] = (bands[b] || 0) + 1; }
  // every extra radar on a crowded band costs more to keep deconflicted and maintained
  for (const u of S.units) { const b = IC.BAND[u.type]; upAD += u.d.up * (b && bands[b] > 1 ? 1 + 0.15 * (bands[b] - 1) : 1); }
  const upAir = S.roster.filter(r => r.st !== 'lost').length * 0.6;
  let upG = 0; for (const g of S.gunits) if (g.side === 'us' && (!S.story || S.story.act >= 4)) upG += g.g.cost * 0.004;
  const upApt = S.av ? IC.avUpkeep(S) : 0, upStaff = S.story ? IC.staffCost(S) : 0;
  const up = (upAD + upAir + upG) * mob.up + upApt + upStaff;
  S.income = base + tax + apt + aidRate + IC.avRevenueRate(S); S.upkeep = up;
  S.ledger = { base, tax, apt, aid: aidRate, av: IC.avRevenueRate(S), upAD: upAD * mob.up, upAir: upAir * mob.up, upG: upG * mob.up, upApt, upStaff };
  S.budget += (S.income - IC.avRevenueRate(S) - S.upkeep) * dt / 3600;
  for (const c of IC.cities(S)) {
    c.morale = U.clamp(c.morale + mob.morale * dt / 3600, 0, 100);
    c.prosp = Math.min(1, c.prosp + 0.01 * dt / 3600);
  }
  // plants, power stations and bridges are repaired round the clock
  for (const i of S.infra) {
    if (i.owner !== 'us' || i.kind === 'city' || i.parts) continue;
    if (i.hp < i.max) i.hp = Math.min(i.max, i.hp + i.max * (i.offline ? 0.05 : 0.02) * dt / 3600);
    if (i.offline && i.hp >= i.max * 0.6) {
      i.offline = false; IC.log(S, 'info', 'REPAIR', `${i.name} is back in operation.`); IC.news(S, `${i.name} restored after round-the-clock repairs.`);
      if (i.kind === 'bridge') IC.bridgeChanged(S);
      if (i.kind === 'power') for (const c of IC.cities(S)) if (c.plant === i.id) IC.cityLights(c);
    }
  }
  S.aidT = S.aidT == null ? S.time + U.rand(10, 16) * 3600 : S.aidT;
  if (S.time > S.aidT && (!S.story || S.story.act >= 4)) {
    S.aidT = S.time + U.rand(10, 18) * 3600;
    const v = Math.round(60 + S.support * 3 * U.rand(0.7, 1.2));
    S.budget += v;
    IC.log(S, 'kill', 'AID', `Allied aid package received: ${U.money(v)}.`);
    IC.news(S, `${S.world.names.C} and ${S.world.names.D} announce ${U.money(v)} in aid to ${S.world.names.H}.`);
  }
  const T = S.tech;
  T.slots.forEach((sl, i) => {
    if (!sl) return;
    const tech = IC.TECH.find(x => x.id === sl.id);
    sl.prog += dt / tech.time;
    if (sl.prog >= 1) {
      T.done.add(tech.id); T.slots[i] = null;
      IC.log(S, 'kill', 'RESEARCH', `${tech.name} complete.`);
      IC.news(S, `Defense ministry fields new capability: ${tech.name.toLowerCase()}.`);
      IC.techAir(S, tech.id);
      IC.sfx && IC.sfx.ui('ok');
      IC.emit(S, 'research', tech.id);
    }
  });
};
IC.researching = (S, id) => S.tech.slots.find(s => s && s.id === id);
IC.startResearch = function (S, id) {
  const t = IC.TECH.find(x => x.id === id);
  const slot = S.tech.slots.findIndex(s => !s);
  if (!t || S.tech.done.has(id) || IC.researching(S, id) || slot < 0 || S.budget < t.cost) return false;
  if (!t.req.every(r => S.tech.done.has(r))) return false;
  S.budget -= t.cost;
  S.tech.slots[slot] = { id, prog: 0 };
  IC.log(S, 'info', 'RESEARCH', `Started ${t.name} (${U.dur(t.time)}).`);
  IC.emit(S, 'researchStart', id);
  return true;
};

})(window.IC);
