/* Iron Canopy — supply and money.
   Supply, in the words of the Guide:
   - Missiles and rockets are held in depots: the Central Depot and the forward depots you place.
   - Each depot's truck companies drive them to the units inside its service area, emptiest and highest priority
     first. A forward depot refills from the Central Depot.
   - Stock is bought from the arms plants and goes by rail to the depot that is short, in minutes; when the plants
     are knocked out it is imported by air and trucked on from the airport. With "Keep stocked" on, the Ministry buys whenever stock falls below half of one full reload
     for every unit that uses it.
   - Convoys drive the roads at road speed, slower through towns at rush hour. A cut road means a slow detour,
     and the enemy can see convoys and strike them.
   The economy tick (income, running costs, research) is at the end of the file. */
(function (IC) {
'use strict';
const U = IC.U;

/* the Guide's words for money and supply (also the Supply room's) */
IC.MONEY_GUIDE = 'Money comes in every hour: the Ministry\'s grant, airline fees at our airports, and later taxes from the cities and trade taxes from remote industries. It goes out every hour on running costs: every unit on the map, every flight of aircraft, the airports\' upkeep, staff and loan repayments. Units in the reserve cost nothing. Buying, building and research are paid when you do them. The Economy room (E) shows every line with its reason and how long the money lasts at this rate, and you are warned a day, six hours and an hour before it runs out. Your levers: what you build and keep on the map, airport charges, loans, and how much the Ministry may spend on stock.';
IC.SUPPLY_GUIDE = 'Buy a unit by placing it: you pay then, and it is loaded at the nearest depot, barracks or airfield and driven there, or flown by heavy-lift helicopter when the drive would be long. It is set up and ready well within the hour. Missiles and rockets are kept in depots: the Central Depot and the forward depots you place. Each depot\'s truck companies drive them to the units inside its ring, first-priority areas and the emptiest units first; forward depots refill from the Central Depot. Stock is bought from the arms plants and goes by rail to the depot that needs it; with Keep stocked on, the Ministry buys whenever it falls below half of one full reload. Convoys drive the roads at road speed, slower through towns at rush hour. A cut road means a slow detour, and the enemy strikes convoys it sees near the border. A unit\'s panel says when its next load arrives, or why none is coming.';
IC.SUPPLY = {
  load: 90, unload: 90,   // s to load and unload a convoy at a depot or a unit
  plantLoad: 120,         // s to load the lorries that take an import on from the airport
  offKmh: 35,             // lorries between a road and a depot, on tracks
  townK: 0.75, rush: 0.4, // through a town: slower, and slower still at rush hour
  topUp: 0.5,             // a unit is resupplied when its reserve falls to half (or at once if it is a priority)
  reorder: 0.5,           // "Keep stocked" buys when stock falls to half of one full reload
  maxCol: 6,              // lorries in one column; bigger loads go in several
  railKmh: 200, railLoad: 300,   // bought stock goes by rail from the plant: loading, then the trip
  // military convoys, escorted and driving through: about 1.5 times the speed cars keep on each class of road
  kmh: { hw: 150, rd: 120, lc: 90, sp: 70 }
};
IC.DEPOT_PRI = {
  first: { name: 'First', w: 2, desc: 'Units in this area are resupplied before any other.' },
  normal: { name: 'Normal', w: 1, desc: 'Resupplied in turn, emptiest first.' },
  last: { name: 'Last', w: 0, desc: 'Resupplied only when nobody else is waiting.' }
};
IC.FLOORS = [0, 50, 150, 400];
IC.QW_TAX_SHARE = 0.25;   // Quick war: the share of city and trade taxes that goes to the air defence
IC.QW_GRANT = 60;         // Quick war: the defence ministry's grant an hour, for a country of sixty cities
IC.STORY_TAX = [0, 0, 0.1, 0.25, 1];   // Career: the share of city and trade taxes by act
const truckCap = S => IC.hasTech(S, 'l_trucks') ? 18 : 12;   // weight one lorry carries
const kmhK = S => IC.hasTech(S, 'l_trucks') ? 1.1 : 1;

/* what a load is called, in words the player knows */
const NOUN = { IR: 'IR missiles', IR2: 'imaging IR missiles', SR: 'SR missiles', MR: 'MR missiles', LR: 'LR missiles', TBD: 'BMD missiles', HAT: 'HAT interceptors', EXO: 'EXO interceptors', CRS: 'cruise missiles', SRB: 'ballistic missiles', RKT: 'guided rockets' };
IC.munWords = (mun, n) => n == null ? NOUN[mun] || mun : `${n} ${n === 1 ? (NOUN[mun] || mun).replace(/s$/, '') : NOUN[mun] || mun}`;
/* the lorries a load rides on: missile transporters, rocket carriers, flatbeds */
IC.cargoKind = mun => !mun ? 'empty' : IC.MUN[mun].strike ? 'rocket' : 'missile';

IC.addTruck = function (S, home) {
  home.convoyN = (home.convoyN || 0) + 1;
  const tag = home.central ? 'C' : home.name.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'F';
  const v = { id: IC.nid('v'), kind: 'truck', name: `Convoy ${tag}-${String(home.convoyN).padStart(2, '0')}`, home, x: home.x, y: home.y, h: 0,
    state: 'idle', route: null, job: null, t: 0, trucks: 3, dead: false };
  S.vehicles.push(v);
  return v;
};
IC.buyCompany = function (S, depot) {
  if (S.budget < 12) return false;
  IC.pay(S, 'buyLogi', 12); IC.addTruck(S, depot);
  IC.log(S, 'info', 'LOGI', `New truck company at ${depot.name}: ${S.vehicles.filter(v => v.home === depot && !v.dead).length} now.`);
  return true;
};
IC.moveCompany = function (S, from, to) {
  const v = S.vehicles.find(x => x.home === from && x.state === 'idle' && !x.dead);
  if (!v) return false;
  v.home = to; v.state = 'return'; plan(S, v, to);
  IC.log(S, 'info', 'LOGI', `${v.name} moving to ${to.name}.`);
  return true;
};
IC.depots = S => S.units.filter(u => u.type === 'depot' && u.state === 'ready' && !u.dead);
const freeTruck = (S, d) => S.vehicles.find(v => v.home === d && v.state === 'idle' && !v.dead);
IC.serves = (d, x, y) => d.central || U.dxy(d.x, d.y, x, y) <= (d.reach || 1400);
/* the depot that looks after a place: the nearest forward depot whose area covers it, or the Central Depot */
IC.servingDepot = function (S, p) {
  let best = null, bd = 1e12, central = null;
  for (const d of IC.depots(S)) { if (d.central) { central = d; continue; } const r = U.dist(d, p); if (r <= (d.reach || 1400) && r < bd) { bd = r; best = d; } }
  return best || central;
};
const priW = d => d ? IC.DEPOT_PRI[d.pri || 'normal'].w : 1;

/* ---------- driving: road speed by class, slower in towns at rush hour, crawling past a cut ---------- */
function segSpeed(S, p) {
  const K = IC.SUPPLY.kmh;
  if (p.cut) return K[p.cls || 'rd'] / IC.CUT_SLOW / 360;
  if (!p.road) return IC.SUPPLY.offKmh / 360;
  let v = K[p.cls || 'rd'] * kmhK(S) / 360;
  if (p.town) v *= IC.SUPPLY.townK * (1 - IC.SUPPLY.rush * IC.trafficHour(S));
  return v;
}
const edgeName = (S, id) => {
  const e = S.world.edges.find(x => x.id === id); if (!e) return 'a cut road';
  if (e.cutName) return e.cutName;
  const br = S.infra.find(i => i.kind === 'bridge' && i.offline && i.edge === id);
  return br ? `${br.name} down` : `${{ hw: 'Motorway', rd: 'Main road', lc: 'Local road', sp: 'Access road' }[e.cls] || 'Road'} cut ${IC.nearestPlace(S, e.pts[e.pts.length >> 1].x, e.pts[e.pts.length >> 1].y)}`;
};
/* seconds to drive a route, the cut it crosses and the time the cut costs */
function routeInfo(S, from, r) {
  let t = 0, p = from, cut = 0, lost = 0;
  for (const q of r) { const s = U.dist(p, q) / segSpeed(S, q); t += s; if (q.cut) { cut = q.cut; lost += s * (1 - 1 / IC.CUT_SLOW); } p = q; }
  // no road left that is worth taking: straight across country, past the cut that closed the way
  const q = r[r.length - 1], d = U.dist(from, q), W = S.world;
  if (r.length === 1 && d > 40 && W.blocked && W.blocked.size) {
    let best = null, bd = 150;
    for (const e of W.edges) { if (!W.blocked.has(e.id)) continue; const m = e.pts[e.pts.length >> 1], k = U.segDist(m.x, m.y, from.x, from.y, q.x, q.y); if (k < bd) { bd = k; best = e; } }
    if (best) return { t, cut: `${edgeName(S, best.id)}, across country`, lost: Math.max(0, t - d * 1.3 / (IC.SUPPLY.kmh.rd / 360)) };
  }
  return { t, cut: cut ? edgeName(S, cut) : '', lost };
}
function markTowns(S, r) { const cs = IC.cities(S); for (const p of r) p.town = p.road && cs.some(c => U.dxy(c.x, c.y, p.x, p.y) < c.r); }
/* drive time between two places, as a convoy would go now */
IC.driveTime = function (S, a, b) { const r = IC.route(a.x, a.y, b.x, b.y, true); markTowns(S, r); return routeInfo(S, a, r); };
function plan(S, v, to) {
  v.route = IC.route(v.x, v.y, to.x, to.y, true); v.dest = { x: to.x, y: to.y }; v.trail = [{ x: v.x, y: v.y }];
  retime(S, v);
}
function retime(S, v) {
  v.rt = v.route; markTowns(S, v.route);
  const I = routeInfo(S, v, v.route);
  v.eta = S.time + I.t; v.cut = I.cut; v.lost = I.lost; v.infoT = S.time;
}
function drive(S, v, dt) {
  if (!v.route) return true;
  if (v.route !== v.rt || S.time - v.infoT > 60) retime(S, v);   // re-routed after a road changed, or traffic changed
  let left = dt;
  while (left > 0 && v.route.length) {
    const p = v.route[0], sp = segSpeed(S, p);
    const dx = p.x - v.x, dy = p.y - v.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) { v.route.shift(); continue; }
    v.h = Math.atan2(dy, dx);
    if (sp * left >= L) { v.x = p.x; v.y = p.y; left -= L / sp; v.route.shift(); }
    else { v.x += dx / L * sp * left; v.y += dy / L * sp * left; left = 0; }
  }
  // the road just driven, so the column behind the lead lorry follows the bends
  const T = v.trail || (v.trail = []), last = T[T.length - 1];
  if (!last || U.dxy(last.x, last.y, v.x, v.y) > 0.25) { T.push({ x: v.x, y: v.y }); if (T.length > 40) T.shift(); }
  return !v.route.length;
}

/* ---------- jobs ---------- */
function newJob(S, o) {
  const j = Object.assign({ id: IC.nid('j'), state: 'active', t0: S.time }, o);
  if (j.from && j.to && j.mode === 'truck') j.drive = IC.driveTime(S, j.from, j.to).t;
  S.jobs.push(j);
  return j;
}
/* "12 SR missiles to MRS-2", "16 MR missiles to Central Depot" */
IC.jobLabel = j => `${IC.munWords(j.mun, j.qty)} to ${j.to.name}`;
/* game seconds until a job's load is unloaded where it is going */
IC.jobEta = function (S, j) {
  const v = j.v, a = j.air, C = IC.SUPPLY;
  if (v && !v.dead) {
    const left = Math.max(0, (v.eta || S.time) - S.time);
    if (v.state === 'toSource') return left + (j.loadT || C.load) + (j.drive || 0) + C.unload;
    if (v.state === 'load') return v.t + (j.drive || 0) + C.unload;
    if (v.state === 'toDest') return left + C.unload;
    if (v.state === 'unload') return v.t;
  }
  if (a && !a.dead) return (a.route && a.route.length ? U.dist(a, a.route[0]) / (a.allied ? 1.7 : IC.AIR_KIND[a.kind].spd) : 0) + (a.wait || 0) + (a.leg === 'toSource' ? 240 + U.dist(j.from, j.to) / (a.allied ? 1.7 : IC.AIR_KIND[a.kind].spd) : 0) + (j.after || 0);
  if (j.mode === 'rail') return Math.max(0, j.arrive - S.time);
  return 0;
};
IC.failJob = function (S, j) {
  if (j.state !== 'active') return;
  j.state = 'failed';
  const back = !j.loaded && j.from && j.from.inv && j.mun && j.kind !== 'buy';
  if (back) j.from.inv[j.mun] = (j.from.inv[j.mun] || 0) + j.qty0;
  if (j.mag) j.mag.inc = Math.max(0, j.mag.inc - j.qty0);
  if (j.to && j.to.inc && !j.mag) j.to.inc[j.mun] = Math.max(0, (j.to.inc[j.mun] || 0) - j.qty0);
  if (j.kind === 'buy' && j.loaded) IC.log(S, 'warn', 'SUPPLY', `${IC.munWords(j.mun, j.qty0)} for ${j.to.name} lost on the road.`, j.v || j.to);
};
function deliver(S, j) {
  j.state = 'done';
  if (j.mag) {
    j.mag.inc = Math.max(0, j.mag.inc - j.qty0);
    let q = j.qty;
    const toStore = Math.min(j.mag.storeMax - j.mag.store, q); j.mag.store += toStore; q -= toStore;
    const toMag = Math.min(j.mag.max - j.mag.mag, q); j.mag.mag += toMag; q -= toMag;
    j.mag.store += q;
    IC.emit(S, 'rearmed', j.to);
    return;
  }
  // an import landed: a lorry column takes it on from the airport to the depot
  if (j.kind === 'import' && j.depot && U.dist(j.to, j.depot) > 30) { contractor(S, j.to, j.depot, j.mun, j.qty, 0, true); return; }
  const to = j.depot || j.to;
  to.inv[j.mun] = (to.inv[j.mun] || 0) + j.qty;
  if (to.inc) to.inc[j.mun] = Math.max(0, (to.inc[j.mun] || 0) - j.qty0);
  if (j.kind === 'buy' || j.kind === 'import') IC.emit(S, 'stockIn', { depot: to, mun: j.mun, qty: j.qty });
}

/* ---------- convoys ---------- */
function sendTruck(S, v, j) {
  v.job = j; j.v = v;
  if (U.dist(v, j.from) > 5) { v.state = 'toSource'; plan(S, v, j.from); }
  else { v.state = 'load'; v.t = j.loadT || IC.SUPPLY.load; v.route = null; }
}
/* a purchase leaves the plant (or an airport) on the supplier's lorries; they go home once unloaded */
function contractor(S, from, to, mun, qty, delay, counted) {
  const w = IC.MUN[mun].w, cap = truckCap(S), per = Math.max(1, Math.floor(cap * IC.SUPPLY.maxCol / w));
  const loadT = IC.SUPPLY.plantLoad / U.clamp(from.hp && from.max ? from.hp / from.max : 1, 0.3, 1) / (IC.hasTech(S, 'l_ind') ? 2 : 1);
  let k = 0;
  for (let left = qty; left > 0; left -= per, k++) {
    const q = Math.min(per, left);
    const v = { id: IC.nid('v'), kind: 'truck', contract: true, name: `${from.name.replace(/ (International|Airport|Arms Plant|Works)$/, '')} lorries`, home: null,
      x: from.x, y: from.y, h: 0, state: 'load', t: loadT + (delay || 0) + k * 60, route: null, job: null, trucks: Math.min(IC.SUPPLY.maxCol, Math.max(1, Math.ceil(q * w / cap))), dead: false };
    const j = newJob(S, { kind: 'buy', mode: 'truck', mun, qty: q, qty0: q, from, to, loadT: v.t });
    if (!counted) to.inc[mun] = (to.inc[mun] || 0) + q;
    v.job = j; j.v = v;
    S.vehicles.push(v);
  }
}
IC.updateVehicles = function (S, dt) {
  const C = IC.SUPPLY;
  for (const v of S.vehicles) {
    if (v.dead) continue;
    if (v.homeless) {
      const ds = IC.depots(S); if (!ds.length) continue;
      v.home = ds.sort((a, b) => U.dist(a, v) - U.dist(b, v))[0]; v.homeless = false;
      if (v.state === 'idle') { v.state = 'return'; plan(S, v, v.home); }
    }
    const j = v.job;
    switch (v.state) {
      case 'idle': break;
      case 'toSource': if (drive(S, v, dt)) { v.state = 'load'; v.t = j.loadT || C.load; } break;
      case 'load':
        v.t -= dt;
        if (v.t <= 0) { j.loaded = true; v.state = 'toDest'; plan(S, v, j.to); }
        break;
      case 'toDest': {
        if (j.to.dead) { IC.failJob(S, j); v.job = null; goHome(S, v); break; }
        if (v.route && v.route.length) { const last = v.route[v.route.length - 1]; if (U.dxy(last.x, last.y, j.to.x, j.to.y) > 60) plan(S, v, j.to); }
        if (drive(S, v, dt)) { v.state = 'unload'; v.t = C.unload; }
        break;
      }
      case 'unload': v.t -= dt; if (v.t <= 0) { deliver(S, j); v.job = null; goHome(S, v); } break;
      case 'return': if (drive(S, v, dt)) { v.state = 'idle'; v.route = null; if (v.home) { v.x = v.home.x; v.y = v.home.y; } } break;
    }
  }
  S.vehicles = S.vehicles.filter(v => !v.dead);
};
function goHome(S, v) {
  if (v.contract) { v.dead = true; return; }   // the supplier's lorries leave the map once they have delivered
  if (U.dist(v, v.home) < 5) { v.state = 'idle'; v.route = null; return; }
  v.state = 'return'; plan(S, v, v.home);
}

/* ---------- helicopters and allied airlift ---------- */
IC.airJobStep = function (S, a) {
  const j = a.job;
  if (!j) { a.dead = true; return; }
  if (a.leg === 'toSource') { a.leg = 'loading'; a.wait = 240; }
  else if (a.leg === 'loading') { j.loaded = true; a.leg = 'toDest'; a.route = [{ x: j.to.x, y: j.to.y }]; }
  else if (a.leg === 'toDest') {
    if (j.to.dead) { IC.failJob(S, j); a.leg = 'home'; }
    else {
      a.leg = 'unloading'; a.wait = a.kind === 'heli' ? 200 : 600; return;
    }
  }
  else if (a.leg === 'unloading') { deliver(S, j); a.job = null; a.leg = 'home'; if (a.allied) IC.log(S, 'kill', 'IMPORT', `Allied airlift landed ${IC.munWords(j.mun, j.qty)} at ${j.to.name}${j.depot && U.dist(j.to, j.depot) > 30 ? `; lorries take them on to ${j.depot.name}` : ''}.`, j.to); }
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
  if (!src) { if (manual) IC.log(S, 'warn', 'LOGI', `No depot holds ${IC.munWords(mag.mun)} for ${u.name}.`); return false; }
  const r = heliFor(S, src, 6500);
  if (!r) { if (manual) IC.log(S, 'warn', 'LOGI', 'No transport helicopter is available.'); return false; }
  const qty = Math.min(Math.floor(src.inv[mag.mun]), Math.max(1, Math.floor(IC.AIR_KIND.heli.cap * r.n / M.w)), mag.storeMax + mag.max - mag.store - mag.mag - mag.inc);
  if (qty < 1) return false;
  src.inv[mag.mun] -= qty; mag.inc += qty;
  const j = newJob(S, { kind: 'unit', mode: 'heli', mun: mag.mun, qty, qty0: qty, from: src, to: u, mag });
  const a = IC.launchAir(S, r, { type: 'supply' }, true);
  if (!a) { IC.failJob(S, j); return false; }
  a.job = j; j.air = a; a.leg = 'toSource'; a.route = [{ x: src.x, y: src.y }];
  IC.log(S, 'info', 'HELI', `${r.name} flying ${IC.munWords(mag.mun, qty)} from ${src.name} to ${u.name}.`);
  return true;
};

/* ---------- buying stock ---------- */
IC.plantPrice = (S, mun, qty) => IC.MUN[mun].cost * qty * (IC.hasTech(S, 'l_lines') ? 0.85 : 1);
IC.importPrice = (S, mun, qty) => IC.MUN[mun].cost * qty * (1.9 - S.support / 100);
const plants = S => S.infra.filter(f => f.kind === 'factory' && f.owner === 'us' && !f.offline);
IC.canBuyMun = (S, mun) => IC.hasTech(S, IC.MUN_TECH[mun]);
/* where a purchase for a depot would come from and what it costs: the nearest working plant, or an import */
IC.stockSource = function (S, mun, qty, depot) {
  const p = plants(S).sort((a, b) => U.dist(a, depot) - U.dist(b, depot))[0];
  if (p) return { plant: p, cost: IC.plantPrice(S, mun, qty), eta: IC.SUPPLY.railLoad / U.clamp(p.hp / p.max, 0.3, 1) / (IC.hasTech(S, 'l_ind') ? 2 : 1) + U.dist(p, depot) * 360 / IC.SUPPLY.railKmh };
  return { plant: null, cost: IC.importPrice(S, mun, qty), eta: 1800 };
};
/* buy stock for a depot (the one that needs it most if none is given): paid now, trucked from the plant */
IC.buyStock = function (S, mun, qty, depot, auto) {
  if (!IC.canBuyMun(S, mun) || qty < 1) return false;
  depot = depot || neediest(S, mun);
  if (!depot) return false;
  const src = IC.stockSource(S, mun, qty, depot);
  if (S.budget < src.cost) { if (!auto) IC.log(S, 'warn', 'SUPPLY', `Not enough money for ${IC.munWords(mun, qty)}: ${U.money(src.cost)}.`); return false; }
  IC.pay(S, 'buyMun', src.cost);
  if (src.plant) {
    depot.inc[mun] = (depot.inc[mun] || 0) + qty;
    newJob(S, { kind: 'buy', mode: 'rail', mun, qty, qty0: qty, from: src.plant, to: depot, loaded: true, arrive: S.time + src.eta });
    IC.log(S, 'info', auto ? 'MINISTRY' : 'ORDER', `${auto ? 'Stock low: bought' : 'Bought'} ${IC.munWords(mun, qty)} (${U.money(src.cost)}) from ${src.plant.name}. By rail to ${depot.name} in about ${U.dur(src.eta)}.`);
  } else {
    depot.inc[mun] = (depot.inc[mun] || 0) + qty;
    S.imports.push({ mun, qty, depot, eta: S.time + 1200, state: 'ordered' });
    IC.log(S, 'info', auto ? 'MINISTRY' : 'IMPORT', `The arms plants are down: ${IC.munWords(mun, qty)} imported from ${S.world.names.D} (${U.money(src.cost)}). Airlift lands in about ${U.dur(1200 + 600)}.`);
  }
  IC.emit(S, 'production', mun);
  return true;
};
/* compatibility: ordering at a factory buys stock for the depots */
IC.orderProduction = (S, f, mun, qty) => IC.buyStock(S, mun, qty);
IC.orderImport = (S, mun, qty) => IC.buyStock(S, mun, qty);
function imports(S) {
  for (const im of S.imports) {
    if (im.state !== 'ordered' || S.time < im.eta) continue;
    const apt = IC.bases(S).filter(i => i.owner === 'us' && IC.baseStatus(S, i).runway).sort((a, b) => U.dist(a, im.depot) - U.dist(b, im.depot))[0];
    if (!apt) continue;
    im.state = 'done';
    const ex = S.world.crossings.find(c => c.k === 'D') || S.world.crossings[0];
    const ox = ex ? ex.far.x : -200, oy = ex ? ex.far.y : IC.WH / 3;
    const a = { id: IC.nid('a'), kind: 'cargo', allied: true, name: `${S.world.names.D.toUpperCase()} AIRLIFT`, x: ox, y: oy, ox, oy, vx: 0, vy: 0, h: 0, state: 'out', fuel: 1e9, hp: 1, n: 1, cm: 0, alt: 8 };
    a.job = newJob(S, { kind: 'import', mode: 'cargo', mun: im.mun, qty: im.qty, qty0: im.qty, from: { name: S.world.names.D, x: ox, y: oy }, to: apt, depot: im.depot });
    a.job.loaded = true; a.job.air = a; a.leg = 'toDest'; a.route = [{ x: apt.x, y: apt.y }];
    S.air.push(a);
  }
  S.imports = S.imports.filter(i => i.state !== 'done');
}

/* ---------- what each depot should hold ---------- */
/* one full reload for every unit it looks after; the Central Depot holds one for the whole force */
IC.depotDemand = function (S) {
  const depots = IC.depots(S), demand = {};
  for (const d of depots) demand[d.id] = {};
  const central = depots.find(d => d.central);
  for (const u of S.units) {
    if (!u.mags.length || u.dead) continue;
    const d = IC.servingDepot(S, u);
    for (const m of IC.activeMags(S, u)) {
      const n = m.storeMax + m.max;
      if (d) demand[d.id][m.mun] = (demand[d.id][m.mun] || 0) + n;
      if (central && d !== central) demand[central.id][m.mun] = (demand[central.id][m.mun] || 0) + n * 0.5;
    }
  }
  return demand;
};
/* the whole force's need, the stock held or coming, per item */
IC.stockNeed = function (S) {
  const need = {}, have = {};
  for (const u of S.units) if (!u.dead) for (const m of IC.activeMags(S, u)) need[m.mun] = (need[m.mun] || 0) + m.storeMax + m.max;
  for (const d of IC.depots(S)) for (const k in d.inv) have[k] = (have[k] || 0) + (d.inv[k] || 0) + (d.inc[k] || 0);
  return { need, have };
};
function neediest(S, mun) {
  const dem = IC.depotDemand(S);
  let best = null, bs = Infinity;
  for (const d of IC.depots(S)) {
    const want = dem[d.id][mun] || 0; if (!want && !d.central) continue;
    const r = ((d.inv[mun] || 0) + (d.inc[mun] || 0)) / Math.max(1, want) - priW(d) * 0.05;
    if (r < bs) { bs = r; best = d; }
  }
  return best;
}
/* "Keep stocked": the Ministry buys whatever falls below half of one full reload, above the floor you set */
function keepStocked(S) {
  const P = S.supply;
  if (!P.auto || !IC.depots(S).length) return;
  const { need, have } = IC.stockNeed(S);
  for (const mun in need) {
    if (!IC.canBuyMun(S, mun)) continue;
    const want = Math.max(4, Math.ceil(need[mun])), h = have[mun] || 0;
    if (h >= want * IC.SUPPLY.reorder) { P.short[mun] = ''; continue; }
    const d = neediest(S, mun); if (!d) continue;
    let qty = want - Math.floor(h);
    const each = IC.stockSource(S, mun, 1, d).cost;
    qty = Math.min(qty, Math.floor((S.budget - P.floor) / each));
    if (qty < 1) {
      P.short[mun] = 'money';
      if (S.time - (P.warnT[mun] || -1e9) > 7200) { P.warnT[mun] = S.time; IC.log(S, 'warn', 'SUPPLY', `${IC.munWords(mun)} are running low (${Math.floor(h)} of ${want} wanted), and the treasury is below the ${U.money(P.floor)} you keep back. Nothing more can be bought.`); }
      continue;
    }
    P.short[mun] = '';
    IC.buyStock(S, mun, qty, d, true);
  }
}
function warnLow(S) {
  const P = S.supply;
  if (P.auto) return;
  const { need, have } = IC.stockNeed(S);
  for (const mun in need) {
    const want = Math.max(4, Math.ceil(need[mun])), h = have[mun] || 0;
    if (h >= want * IC.SUPPLY.reorder || S.time - (P.warnT[mun] || -1e9) < 7200) continue;
    P.warnT[mun] = S.time;
    IC.log(S, 'warn', 'SUPPLY', `${IC.munWords(mun)} are running low: ${Math.floor(h)} in the depots, a full reload takes ${want}. Buy more in Supply (L), or turn on Keep stocked.`);
  }
}

/* ---------- the dispatcher ---------- */
IC.supplyInit = function (S) { S.supply = S.supply || { auto: S.mode !== 'academy', floor: 50, short: {}, warnT: {} }; };
IC.logistics = function (S, dt) {
  if (!S.supply) IC.supplyInit(S);
  IC.updateVehicles(S, dt);
  S.logiT = (S.logiT || 0) - dt;
  if (S.logiT > 0) return;
  S.logiT = 20;
  imports(S);
  for (const j of S.jobs) if (j.mode === 'rail' && j.state === 'active' && S.time >= j.arrive) { if (j.to.dead) IC.failJob(S, j); else deliver(S, j); }
  const depots = IC.depots(S);
  // units short of missiles or rockets: priority areas first, then priority units, then the emptiest
  const aus = S.units.filter(u => !u.dead && !u.callin && u.mags.length && u.state !== 'transit' && u.state !== 'packing')
    .map(u => ({ u, d: IC.servingDepot(S, u) }))
    .sort((a, b) => priW(b.d) - priW(a.d) || (b.u.pri ? 1 : 0) - (a.u.pri ? 1 : 0) || fill(S, a.u) - fill(S, b.u));
  for (const { u, d: home } of aus) {
    for (const m of IC.activeMags(S, u)) {
      const deficit = m.storeMax + m.max - m.store - m.mag - m.inc;
      m.why = '';
      if (deficit <= 0 || (deficit < Math.max(1, m.storeMax * IC.SUPPLY.topUp) && m.mag + m.store > 0 && !u.pri)) continue;
      if (m.inc > 0 && !u.pri) continue;   // one load at a time unless it is a priority
      // the depot that looks after it, or any other depot whose area covers it
      let src = null, bd = Infinity, busy = null;
      for (const d of depots) {
        if (!IC.serves(d, u.x, u.y) || (d.inv[m.mun] || 0) < 1) continue;
        if (!freeTruck(S, d)) { busy = busy || d; continue; }
        const r = U.dist(d, u) * (d.central && home && !home.central ? 1.4 : 1);
        if (r < bd) { bd = r; src = d; }
      }
      if (!src) {
        m.why = whyNot(S, u, m, home, busy);
        if (m.mag + m.store === 0 && m.inc === 0 && S.time - (u.heliT || -1e9) > 1800) { u.heliT = S.time; IC.heliResupply(S, u, false); }
        continue;
      }
      const v = freeTruck(S, src);
      const qty = Math.min(deficit, Math.floor(src.inv[m.mun]), Math.max(1, Math.floor(truckCap(S) * v.trucks / IC.MUN[m.mun].w)));
      if (qty < 1) continue;
      src.inv[m.mun] -= qty; m.inc += qty;
      sendTruck(S, v, newJob(S, { kind: 'unit', mode: 'truck', mun: m.mun, qty, qty0: qty, from: src, to: u, mag: m }));
    }
  }
  // 3. forward depots refill from the Central Depot, priority areas first
  const central = depots.find(d => d.central);
  const demand = IC.depotDemand(S);
  if (central) for (const d of depots.filter(x => !x.central).sort((a, b) => priW(b) - priW(a))) {
    for (const mun in demand[d.id]) {
      const target = Math.ceil(demand[d.id][mun]), have = (d.inv[mun] || 0) + (d.inc[mun] || 0);
      if (have >= target * 0.6 || (central.inv[mun] || 0) < 1) continue;
      const v = freeTruck(S, central); if (!v) break;
      const qty = Math.min(target - have, Math.floor(central.inv[mun]), Math.max(1, Math.floor(truckCap(S) * v.trucks / IC.MUN[mun].w)));
      if (qty < 1) continue;
      central.inv[mun] -= qty; d.inc[mun] = (d.inc[mun] || 0) + qty;
      sendTruck(S, v, newJob(S, { kind: 'restock', mode: 'truck', mun, qty, qty0: qty, from: central, to: d }));
    }
  }
  // 4. buying: every two minutes
  S.buyT = (S.buyT || 0) - 20;
  if (S.buyT <= 0) { S.buyT = 120; keepStocked(S); warnLow(S); }
  S.jobs = S.jobs.filter(j => j.state === 'active');
};
/* why nothing is on its way, in words */
function whyNot(S, u, m, home, busy) {
  const name = IC.munWords(m.mun);
  if (busy) {
    const back = Math.min(...S.vehicles.filter(v => v.home === busy && !v.dead).map(v => truckBack(S, v)));
    return `All ${busy.name}'s truck companies are out. The first is back in about ${U.dur(back)}. More companies, a depot nearer, or a helicopter (H) is quicker.`;
  }
  if (!home) return 'No depot. Place a depot, or the Central Depot is lost.';
  const coming = S.jobs.filter(j => j.state === 'active' && j.mun === m.mun && (j.kind === 'buy' || j.kind === 'restock' || j.kind === 'import') && IC.serves(j.depot || j.to, u.x, u.y));
  if (coming.length) { const j = coming.sort((a, b) => IC.jobEta(S, a) - IC.jobEta(S, b))[0]; return `No ${name} in the depots nearby. ${IC.munWords(m.mun, j.qty)} reach ${(j.depot || j.to).name} in about ${U.dur(IC.jobEta(S, j))}${j.v && j.v.cut ? ` (slowed: ${j.v.cut})` : ''}.`; }
  if (S.supply.short[m.mun] === 'money') return `No ${name} in the depots, and no money to buy more above your floor.`;
  return S.supply.auto ? `No ${name} in the depots. The Ministry buys more within two minutes.` : `No ${name} in the depots. Buy more in Supply (L).`;
}
/* seconds until a busy truck company is back at its depot */
function truckBack(S, v) {
  const j = v.job, C = IC.SUPPLY, left = Math.max(0, (v.eta || S.time) - S.time), d = j ? j.drive || 0 : 0;
  if (v.state === 'idle') return 0;
  if (v.state === 'return') return left;
  if (v.state === 'unload') return v.t + d;
  if (v.state === 'toDest') return left + C.unload + d;
  if (v.state === 'load') return v.t + 2 * d + C.unload;
  return left + C.load + 2 * d + C.unload;
}
/* what a unit's panel says about one magazine's next load */
IC.nextLoad = function (S, u, m) {
  const j = S.jobs.find(x => x.state === 'active' && x.mag === m);
  if (j) {
    const t = IC.jobEta(S, j), v = j.v;
    const how = j.mode === 'heli' ? `by helicopter from ${j.from.name}` : v && v.state === 'toSource' ? `from ${j.from.name} (${v.name} is on its way to load)` : v && v.state === 'load' ? `from ${j.from.name} (loading)` : `from ${j.from.name}`;
    return { cls: v && v.cut ? 'amber' : 'ok', text: `${IC.munWords(m.mun, j.qty)} coming ${how}: here in about ${U.dur(t)}.${v && v.cut ? ` Slowed by a detour: ${v.cut} (+${U.dur(v.lost)}).` : ''}`, eta: t };
  }
  const deficit = m.storeMax + m.max - m.store - m.mag;
  if (deficit <= 0) return { cls: 'ok', text: 'Full.' };
  if (m.why) return { cls: m.mag + m.store === 0 ? 'hostile' : 'amber', text: m.why };
  return { cls: 'ok', text: `Topped up when the reserve falls to half${u.pri ? '' : ' (at once if it is a priority)'}.` };
};
function fill(S, u) { let a = 0, b = 0; for (const m of IC.activeMags(S, u)) { a += m.mag + m.store + m.inc; b += m.max + m.storeMax; } return b ? a / b : 1; }
IC.fill = fill;

/* ---------- national industry ---------- */
IC.industry = function (S) {
  let have = 0, tot = 0;
  for (const c of IC.cities(S)) {
    tot += c.ind;
    const plant = c.plant && S.byId[c.plant];
    if (c.owner === 'us') have += c.ind * (c.hp / c.max) * (plant && plant.offline ? 0.6 : 1);
  }
  return tot ? have / tot : 1;
};

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
  S.budget += v; IC.econBook(S, 'oneoff', v);
  for (const c of IC.cities(S)) c.morale = Math.max(0, c.morale - 3);
  IC.log(S, 'info', 'POLICY', `War bonds raised ${U.money(v)}.`);
  IC.news(S, 'Citizens queue to buy war bonds; the treasury raises emergency funds.');
  return true;
};
IC.economy = function (S, dt) {
  const mob = IC.MOBIL[S.mobil];
  let tax = 0, apt = 0;
  const air = { open: 1, restricted: 0.5, closed: 0 }[S.airspace];
  for (const i of S.infra) {
    if (i.offline || i.owner !== 'us') continue;
    if (i.kind === 'city') tax += i.pop * 0.02 * (i.hp / i.max) * i.prosp * (0.5 + i.morale / 200);
    if (i.kind === 'airport' && !S.av) apt += i.rev * air * (i.hp / i.max);
  }
  for (const t of S.world.foreign) if (t.taken) tax += 3;
  tax *= mob.tax;
  let trade = IC.tradeTax(S) * mob.tax;
  let aidRate = S.support * 0.12, base = 25;
  // in the story the budget grows with the job: a civil aviation authority, then a defence command
  if (S.story) { const k = IC.STORY_TAX[S.story.act] || 0; base = S.story.grant; tax *= k; trade *= k; aidRate *= S.story.act >= 4 ? 1 : 0; }
  // Quick war: the air defence gets its share of the cities' taxes; the rest runs the country
  else if (S.mode === 'campaign') { base = IC.QW_GRANT; tax *= IC.QW_TAX_SHARE; trade *= IC.QW_TAX_SHARE; }
  let upAD = 0;
  // every other radar on the same band close by (where they would blind each other, sensors.js) makes a radar
  // cost more to keep deconflicted and maintained
  const on = S.units.filter(u => u.radarOn && IC.BAND[u.type]);
  let crowd = 0;
  for (const u of S.units) {
    const b = u.radarOn && IC.BAND[u.type], n = b ? on.filter(o => o !== u && IC.BAND[o.type] === b && U.dist(o, u) < 700).length : 0, k = 0.15 * n;
    upAD += u.d.up * (1 + k); crowd += u.d.up * k;
  }
  const upAir = S.roster.filter(r => r.st !== 'lost').length * 0.6;
  const upApt = S.av ? IC.avUpkeep(S) : 0, upStaff = S.story ? IC.staffCost(S) : 0, upLoan = IC.loanRate(S);
  const up = (upAD + upAir) * mob.up + upApt + upStaff + upLoan;
  S.income = base + tax + trade + apt + aidRate + IC.avRevenueRate(S); S.upkeep = up;
  const L = S.ledger = { base, tax, trade, apt, aid: aidRate, av: IC.avRevenueRate(S), upAD: upAD * mob.up, upAir: upAir * mob.up, upApt, upStaff, loan: upLoan, crowd: crowd * mob.up };
  moneyWatch(S);
  S.budget += (S.income - IC.avRevenueRate(S) - S.upkeep) * dt / 3600;
  // the weekly statement books each line as it is paid (airline fees are booked where they are paid)
  for (const k of ['base', 'tax', 'trade', 'apt', 'aid']) IC.econBook(S, k, L[k] * dt / 3600);
  for (const k of ['upAD', 'upAir', 'upApt', 'upStaff', 'loan']) IC.econBook(S, k, -L[k] * dt / 3600);
  for (const c of IC.cities(S)) {
    c.morale = U.clamp(c.morale + mob.morale * dt / 3600, 0, 100);
    // prosperity follows connections (growth.js); without that model it just recovers
    if (!S.econ) c.prosp = Math.min(1, c.prosp + 0.01 * dt / 3600);
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
    S.budget += v; IC.econBook(S, 'oneoff', v);
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
/* warn before the money runs out, not after: at a day, six hours and one hour left */
function moneyWatch(S) {
  const net = S.income - S.upkeep, left = net < 0 ? S.budget / -net : Infinity;
  const tier = left < 1 ? 3 : left < 6 ? 2 : left < 24 ? 1 : 0;
  S.moneyLeft = left;
  if (tier > (S.moneyTier || 0) && S.budget > 0) {
    IC.log(S, 'warn', 'TREASURY', `Money runs out in about ${U.dur(left * 3600)}: running costs are ${U.money(-net)} an hour more than comes in. Put units back in the reserve, raise airport charges, or borrow (Economy, E).`);
    if (tier >= 2) IC.emit(S, 'moneyLow', left);
  }
  if (S.budget <= 0 && !S.broke) { S.broke = true; IC.log(S, 'leak', 'TREASURY', 'The treasury is empty. Nothing can be bought until money comes in; the Ministry will not buy stock.'); }
  if (S.budget > 0) S.broke = false;
  S.moneyTier = tier;
}
IC.researching = (S, id) => S.tech.slots.find(s => s && s.id === id);
IC.startResearch = function (S, id) {
  const t = IC.TECH.find(x => x.id === id);
  const slot = S.tech.slots.findIndex(s => !s);
  if (!t || S.tech.done.has(id) || IC.researching(S, id) || slot < 0 || S.budget < t.cost) return false;
  if (!t.req.every(r => S.tech.done.has(r))) return false;
  IC.pay(S, 'research', t.cost);
  S.tech.slots[slot] = { id, prog: 0 };
  IC.log(S, 'info', 'RESEARCH', `Started ${t.name} (${U.dur(t.time)}).`);
  IC.emit(S, 'researchStart', id);
  return true;
};

})(window.IC);
