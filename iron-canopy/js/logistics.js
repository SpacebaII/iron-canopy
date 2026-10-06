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
IC.SUPPLY_GUIDE = 'Buy a unit by placing it: you pay then, and it is loaded at the nearest depot, barracks or airfield and driven there, or flown by heavy-lift helicopter when the drive would be long. It is set up and ready well within the hour. Missiles and rockets are kept in depots: the Central Depot and the forward depots you place. Each depot\'s truck companies drive them to the units inside its ring, first-priority areas and the emptiest units first; forward depots refill from the Central Depot. Stock is bought from the arms plants and goes by rail to the depot that needs it; with Keep stocked on, the Ministry buys whenever it falls below half of one full reload. Convoys drive the roads at road speed, slower through towns at rush hour. A cut road means a slow detour, and the enemy strikes convoys it sees near the border. Resupply by helicopter, on a unit\'s panel, flies missiles in from the nearest depot that has them, to that unit and any close by; with Keep stocked on, a unit low on missiles calls one itself when lorries would be slow or a road is cut. Fog and thunderstorms ground helicopters. A unit\'s panel says when its next load arrives, or why none is coming.';
IC.SUPPLY = {
  load: 90, unload: 90,   // s to load and unload a convoy at a depot or a unit
  plantLoad: 120,         // s to load the lorries that take an import on from the airport
  offKmh: 35,             // lorries between a road and a depot, on tracks
  townK: 0.75, rush: 0.4, // through a town: slower, and slower still at rush hour
  topUp: 0.5,             // a unit is resupplied when its reserve falls to half (or at once if it is a priority)
  heliBelow: 0.3,         // with Keep stocked, a unit down to this share of its rounds (ready and on site) calls a helicopter
  heliSlow: 3600,         // ... when lorries would take longer than this, or must cross a cut road
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
IC.QW_TAX_SHARE = 0.75;   // Quick war: the share of city and trade taxes that goes to the air defence
IC.QW_GRANT = 300;        // Quick war: the defence ministry's grant an hour, for a country of sixty cities
IC.STORY_TAX = [0, 0, 0.01, 0.15, 1];   // Career: the share of city and trade taxes by act (Acts II and III run for years)
const truckCap = S => IC.hasTech(S, 'l_trucks') ? 18 : 12;   // weight one lorry carries
const kmhK = S => IC.hasTech(S, 'l_trucks') ? 1.1 : 1;

/* what a load is called, in words the player knows */
const NOUN = { INT: 'interceptor drones', IR: 'IR missiles', IR2: 'imaging IR missiles', SR: 'SR missiles', MR: 'MR missiles', LR: 'LR missiles', LRE: 'extended-range missiles', VLR: 'very-long-range interceptors', TBD: 'BMD missiles', HAT: 'HAT interceptors', EXO: 'EXO interceptors', CRS: 'cruise missiles', SRB: 'ballistic missiles', RKT: 'guided rockets' };
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
  return br ? `${br.name} down` : `${{ hw: 'Motorway', rd: 'Main road', lc: 'Local road', sp: 'Access road' }[e.cls] || 'Road'} cut ${IC.nearPlace(S, e.pts[e.pts.length >> 1].x, e.pts[e.pts.length >> 1].y)}`;
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
  if (a && !a.dead && j.prev && a.job !== j) return IC.jobEta(S, j.prev) + IC.HELI.unload + U.dist(j.prev.to, j.to) / IC.AIR_KIND.heli.spd;
  if (a && !a.dead) return (a.route && a.route.length ? U.dist(a, a.route[0]) / (a.allied ? 1.7 : IC.AIR_KIND[a.kind].spd) : 0) + (a.wait || 0) + (a.leg === 'toSource' ? 240 + U.dist(j.from, j.to) / (a.allied ? 1.7 : IC.AIR_KIND[a.kind].spd) : 0) + (j.after || 0);
  if (j.mode === 'rail') return Math.max(0, j.arrive - S.time);
  return 0;
};
IC.failJob = function (S, j) {
  if (j.state !== 'active') return;
  j.state = 'failed';
  if (j.next) IC.failJob(S, j.next);   // a helicopter lost with loads for several units
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
    j.mag.store += j.qty;   // onto the stock on site: the crew reloads the launchers from it
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
IC.HELI = { load: 240, unload: 200, reach: 6500, near: 250 };
/* a helicopter with loads for several units flies on to the next one that still stands */
function nextStop(S, a, j) {
  let n = j.next; j.next = null;
  while (n && n.to.dead) { const k = n.next; n.next = null; IC.failJob(S, n); n = k; }
  if (!n) return false;
  a.job = n; a.leg = 'toDest'; a.route = [{ x: n.to.x, y: n.to.y }];
  return true;
}
IC.airJobStep = function (S, a) {
  const j = a.job;
  if (!j) { a.dead = true; return; }
  if (a.leg === 'toSource') { a.leg = 'loading'; a.wait = a.kind === 'heli' ? IC.HELI.load : 240; }
  else if (a.leg === 'loading') { for (let k = j; k; k = k.next) k.loaded = true; a.leg = 'toDest'; a.route = [{ x: j.to.x, y: j.to.y }]; }
  else if (a.leg === 'toDest') {
    if (j.to.dead) { if (nextStop(S, a, j)) { IC.failJob(S, j); return; } IC.failJob(S, j); a.leg = 'home'; }
    else {
      a.leg = 'unloading'; a.wait = a.kind === 'heli' ? IC.HELI.unload : 600; return;
    }
  }
  else if (a.leg === 'unloading') { deliver(S, j); if (nextStop(S, a, j)) return; a.job = null; a.leg = 'home'; if (a.allied) IC.log(S, 'kill', 'IMPORT', `Allied airlift landed ${IC.munWords(j.mun, j.qty)} at ${j.to.name}${j.depot && U.dist(j.to, j.depot) > 30 ? `; lorries take them on to ${j.depot.name}` : ''}.`, j.to); }
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
/* seconds until a busy helicopter flight could fly again */
function heliBack(S, r) {
  if (r.st === 'turn') return r.t;
  const a = r.ent; if (!a || a.dead) return null;
  let j = a.job; while (j && j.next) j = j.next;
  const spd = IC.AIR_KIND.heli.spd, b = IC.baseOf(S, r.base);
  const home = j ? IC.jobEta(S, j) + IC.HELI.unload + (b ? U.dist(j.to, b) / spd : 0) : (b ? U.dist(a, b) / spd : 0);
  return home + IC.AIR_KIND.heli.turn;
}
const heliRoom = (m) => m.storeMax + m.max - m.store - m.mag - m.inc;
/* what a helicopter sortie to this unit would be: from which depot, which helicopter, what it carries, to whom,
   when it lands and what it costs. { why } in one sentence when it cannot fly. */
IC.heliPlan = function (S, u) {
  const wx = IC.wx(S), K = IC.AIR_KIND.heli, H = IC.HELI;
  if (!wx.heli) {
    const w = S.weather, fc = w && w.forecast && IC.WEATHER[w.forecast];
    const clears = fc && fc.heli ? ` It should clear in about ${U.dur(Math.max(600, w.next - S.time))}.` : '';
    return { why: `${wx.name} grounds the helicopters.${clears} Lorries still drive.` };
  }
  const mags = IC.activeMags(S, u).filter(m => heliRoom(m) > 0).sort((a, b) => (a.mag + a.store) / (a.max + a.storeMax) - (b.mag + b.store) / (b.max + b.storeMax));
  if (!mags.length) return { why: IC.activeMags(S, u).some(m => m.inc > 0) ? 'Everything it has room for is already on its way.' : 'Full: nothing to fly in.' };
  const ds = IC.depots(S);
  const src = ds.filter(d => mags.some(m => (d.inv[m.mun] || 0) >= 1)).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0];
  if (!src) return { why: `No depot holds ${IC.munWords(mags[0].mun)}. ${S.supply && S.supply.auto ? 'The Ministry buys more within two minutes (Keep stocked).' : 'Buy more in Supply (L), or turn on Keep stocked.'}` };
  const r = heliFor(S, src, H.reach);
  if (!r) {
    const all = S.roster.filter(x => x.kind === 'heli' && x.st !== 'lost');
    if (!all.length) return { why: 'No transport helicopter. A Forward Heliport (Supply tab) comes with one.' };
    const back = all.map(x => ({ x, t: heliBack(S, x) })).filter(o => o.t != null).sort((a, b) => a.t - b.t)[0];
    if (back) return { why: `Every transport helicopter is busy: ${back.x.name} can fly again in about ${U.dur(back.t)}.` };
    return { why: 'No transport helicopter can take off: its base is closed or too far from the depots.' };
  }
  // what it carries: this unit's emptiest rounds first, then units close by that need what the depot holds
  let room = K.cap * (r.n || K.n);
  const inv = Object.assign({}, src.inv), loads = [];
  const take = (unit, m) => {
    const w = IC.MUN[m.mun].w, q = Math.min(Math.floor(inv[m.mun] || 0), Math.floor(room / w), heliRoom(m));
    if (q < 1) return;
    inv[m.mun] -= q; room -= q * w;
    loads.push({ u: unit, m, qty: q });
  };
  for (const m of mags) take(u, m);
  if (!loads.length) return { why: `${r.name} cannot lift even one ${IC.munWords(mags[0].mun, 1).replace(/^1 /, '')}.` };
  const near = S.units.filter(x => x !== u && !x.dead && !x.callin && x.mags.length && x.state !== 'transit' && x.state !== 'packing' && U.dist(x, u) <= H.near)
    .sort((a, b) => U.dist(a, u) - U.dist(b, u));
  for (const x of near) for (const m of IC.activeMags(S, x)) if (room > 0 && m.inc === 0 && m.store < m.storeMax * 0.75) take(x, m);
  // the route: base, depot, then the units in order
  const b = IC.baseOf(S, r.base), stops = [];
  for (const l of loads) if (!stops.includes(l.u)) stops.push(l.u);
  let t = U.dist(b, src) / K.spd + H.load, p = src;
  const eta = new Map();
  for (const x of stops) { t += U.dist(p, x) / K.spd; eta.set(x, t); t += H.unload; p = x; }
  return { src, r, loads, stops, eta: eta.get(u), etas: eta, cost: IC.SORTIE_COST.heli };
};
IC.heliResupply = function (S, u, manual) {
  const P = IC.heliPlan(S, u);
  if (P.why) { if (manual) IC.log(S, 'warn', 'HELI', `${u.name}: ${P.why}`, u); return false; }
  const jobs = [];
  for (const x of P.stops) for (const l of P.loads.filter(l => l.u === x)) {
    P.src.inv[l.m.mun] -= l.qty; l.m.inc += l.qty;
    const j = newJob(S, { kind: 'unit', mode: 'heli', mun: l.m.mun, qty: l.qty, qty0: l.qty, from: P.src, to: x, mag: l.m, short: `${l.qty} ${IC.MUN[l.m.mun].short} → ${x.name}` });
    if (jobs.length) { j.prev = jobs[jobs.length - 1]; j.prev.next = j; }
    jobs.push(j);
  }
  const a = IC.launchAir(S, P.r, { type: 'supply' }, true);
  if (!a) { IC.failJob(S, jobs[0]); return false; }
  for (const j of jobs) j.air = a;
  a.job = jobs[0]; a.leg = 'toSource'; a.route = [{ x: P.src.x, y: P.src.y }];
  const what = P.loads.filter(l => l.u === u).map(l => IC.munWords(l.m.mun, l.qty)).join(' and ');
  const others = P.stops.filter(x => x !== u).map(x => x.name);
  IC.log(S, 'info', 'HELI', `${P.r.name} flying ${what} from ${P.src.name} to ${u.name}${others.length ? `, then to ${others.join(', ')}` : ''}: there in about ${U.dur(P.eta)}.${manual ? '' : ' Called by Keep stocked.'}`, u);
  IC.emit(S, 'heliResupply', { u, a, auto: !manual });
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
        if (autoHeli(S, u, m, null)) m.why = '';
        else if (m.mag + m.store === 0 && m.inc === 0 && S.time - (u.heliT || -1e9) > 1800) { u.heliT = S.time; if (IC.heliResupply(S, u, false)) m.why = ''; }
        continue;
      }
      if (autoHeli(S, u, m, src)) continue;
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
/* Keep stocked: a unit low on stock on site calls a helicopter when lorries would be slow or must cross a cut
   road (src: the depot whose lorries would go, or none) */
function autoHeli(S, u, m, src) {
  const C = IC.SUPPLY;
  if (!S.supply.auto || m.inc > 0 || m.mag + m.store >= (m.max + m.storeMax) * C.heliBelow || S.time - (u.heliT || -1e9) < 600) return false;
  if (u.state !== 'ready' && u.state !== 'setup') return false;
  let slow = !src, by = null;
  if (src) { by = IC.driveTime(S, src, u); slow = !!by.cut || by.t + C.load + C.unload > C.heliSlow; }
  if (!slow) return false;
  const P = IC.heliPlan(S, u);
  if (P.why || (by && P.eta > by.t + C.load + C.unload)) return false;
  u.heliT = S.time;
  return IC.heliResupply(S, u, false);
}
/* why nothing is on its way, in words */
function whyNot(S, u, m, home, busy) {
  const name = IC.munWords(m.mun);
  if (busy) {
    const out = S.vehicles.filter(v => v.home === busy && !v.dead);
    // a depot whose lorries were all destroyed or moved away has none out to wait for
    if (!out.length) return `${busy.name} has no truck companies left. Buy one there (₭12M, in Supply, L), or Resupply by helicopter (H).`;
    const back = Math.min(...out.map(v => truckBack(S, v)));
    return `All ${busy.name}'s truck companies are out. The first is back in about ${U.dur(back)}. More companies, a depot nearer, or Resupply by helicopter (H) is quicker.`;
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
  const js = S.jobs.filter(x => x.state === 'active' && x.mag === m).map(x => ({ x, t: IC.jobEta(S, x) })).sort((a, b) => a.t - b.t);
  if (js.length) {
    const j = js[0].x, t = js[0].t, v = j.v;
    const how = j.mode === 'heli' ? `by helicopter${j.air && j.air.name ? ` (${j.air.name})` : ''} from ${j.from.name}` : v && v.state === 'toSource' ? `from ${j.from.name} (${v.name} is on its way to load)` : v && v.state === 'load' ? `from ${j.from.name} (loading)` : `from ${j.from.name}`;
    const more = js.length > 1 ? ` ${js.length - 1} more load${js.length > 2 ? 's' : ''} after it.` : '';
    return { cls: v && v.cut ? 'amber' : 'ok', text: `${IC.munWords(m.mun, j.qty)} coming ${how}: here in about ${U.dur(t)}.${v && v.cut ? ` Slowed by a detour: ${v.cut} (+${U.dur(v.lost)}).` : ''}${more}`, eta: t };
  }
  const deficit = m.storeMax + m.max - m.store - m.mag;
  if (deficit <= 0) return { cls: 'ok', text: 'Full.' };
  if (m.why) return { cls: m.mag + m.store === 0 ? 'hostile' : 'amber', text: m.why };
  return { cls: 'ok', text: `Lorries top it up when the stock on site falls to half${u.pri ? '' : ' (at once if it is a priority)'}.` };
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
  if (IC.redTick) IC.redTick(S);
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
    sl.prog += dt / IC.techTime(S, tech);
    if (sl.prog >= 1) {
      T.done.add(tech.id); T.slots[i] = null;
      IC.log(S, 'kill', 'RESEARCH', `${tech.name} complete.`);
      IC.news(S, `Defence ministry fields new capability: ${tech.name.toLowerCase()}.`);
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
/* ---------- waiting for money ----------
   Time runs fast (IC.WAIT) until the treasury reaches what the player is saving for, the month turns, or something
   needs the player (main.js stops it on the same events as skip). S.wait = { key, what, amt, m0 } */
const worksOf = S => IC.bases(S).filter(b => b.owner === 'us' && b.works).flatMap(b => b.works.filter(w => w.stages).map(w => ({ ap: b, w })));
/* the things worth saving for: works waiting for money, research not yet affordable, and round sums */
IC.waitTargets = function (S) {
  const L = [];
  for (const { ap, w } of worksOf(S)) {
    const left = Math.max(0, (w.cost || 0) - (w.spent || 0));
    if (left > 1) L.push({ key: 'work:' + w.id, what: `${w.part && w.part.kind === 'runway' && w.kind === 'build' ? w.part.name : U.lc(w.label.replace(/^Build /, 'the '))} at ${ap.name.replace(/ (International|Airport|Air Base)$/, '')}`, amt: left, work: w.id, money: /money/.test(w.wait || '') });
  }
  for (const t of IC.TECH) if (!S.tech.done.has(t.id) && !IC.researching(S, t.id) && t.req.every(r => S.tech.done.has(r)) && t.cost > S.budget && (!S.story || t.cat === 'apt' || S.story.act >= 3))
    L.push({ key: 'tech:' + t.id, what: `research: ${t.name.toLowerCase()}`, amt: t.cost });
  L.sort((a, b) => (b.money ? 1 : 0) - (a.money ? 1 : 0) || a.amt - b.amt);
  // (round 5b) never offer what will never come: with more going out than coming in, nothing above the treasury
  // can be waited for (the picker says so instead, with the loan)
  const reach = IC.waitRate(S) > 0.01, can = t => reach || t.amt <= Math.max(0, S.budget) || (t.work && t.amt <= 0.5);
  const out = L.filter(can).slice(0, 6);
  if (reach) for (const v of [250, 500, 1000, 2000]) { const amt = Math.ceil((Math.max(0, S.budget) + v) / 50) * 50; out.push({ key: 'amt:' + amt, what: `${U.money(amt)} in the treasury`, amt, sum: true }); }
  return out;
};
/* money coming in an hour: last month's income less its running costs (building and buying left out), or while
   there is no finished month yet, the flow averaged over the last day or so (fees come and go with the flights) */
const RECUR = ['base', 'tax', 'trade', 'apt', 'aid', 'fee_land', 'fee_pax', 'fee_cargo', 'fee_over', 'landside', 'upAD', 'upAir', 'upApt', 'upStaff', 'loan', 'penalty'];
IC.waitRate = S => {
  const E = S.econ, M = E && E.months && E.months[E.months.length - 1];
  if (M && M.days > 0.5) { let v = 0; for (const k in M.book) if (RECUR.includes(k)) v += M.book[k]; return v / (M.days * 24); }
  return S.netAvg != null ? S.netAvg : S.income - S.upkeep;
};
/* what is still to come, and roughly when: "₭400M to go for the second runway, about 5 months at this rate" */
IC.waitText = function (S, w) {
  w = w || S.wait; if (!w) return '';
  const work = w.work && worksOf(S).find(x => x.w.id === w.work);
  const left = work ? Math.max(0, work.w.cost - work.w.spent - Math.max(0, S.budget)) : w.amt - S.budget, r = IC.waitRate(S);
  if (left <= 0) return `Enough for ${w.what}.`;
  const eta = r > 0.01 ? left / r * 3600 : Infinity;
  const per = S.mode === 'story' ? IC.MO(S) / 3600 : 24, perW = S.mode === 'story' ? 'a month' : 'a day';
  const when = !isFinite(eta) ? (r < -0.01 ? `never at this rate: ${U.money(-r * per)} ${perW} more goes out than comes in (the Economy room says where)` : 'never at this rate: running costs take all that comes in') : `about ${S.mode === 'story' ? U.months(eta) : U.dur(eta)} at this rate`;
  return `${U.money(left)} to go for ${w.what}, ${when}.`;
};
/* a calm sky, when time may run in long steps: no missile in flight and nothing armed of theirs over our country
   more than 15 km inside the border (their standing patrols along the border and unarmed reconnaissance drones do not count: in Act III some are
   nearly always up; anything that fires, or is fired at, brings the fine steps back) */
IC.calmSky = S => !S.missiles.length && !(S.eaam && S.eaam.length) && !S.threats.some(t => !t.dead && !(t.d && t.d.civil) && t.type !== 'isr' && !(t.border && (t.mission === 'patrol' || t.mission === 'rtb')) && IC.inHome(t.x, t.y) && IC.hostileBorderDist(t.x, t.y) > 150);
IC.waitStart = function (S, key) {
  // (round 1) Finish now: time runs on fast until every work at the airport is done (works: + its id)
  const ws = key && key.startsWith('works:') ? S.byId[key.slice(6)] : null;
  if (ws) { if (!ws.works || !ws.works.some(w => w.stages)) return false; S.wait = { key, what: `the works at ${ws.name}`, amt: 0, works: ws.id, speed: IC.WAIT.speed * 3, m0: S.cal ? S.cal.m : 0, t0: S.time }; S.skip = false; S.paused = false; IC.emit(S, 'waitStart', S.wait); return true; }
  const t = IC.waitTargets(S).find(x => x.key === key) || (key && key.startsWith('amt:') ? { key, what: `${U.money(+key.slice(4))} in the treasury`, amt: +key.slice(4) } : null);
  if (!t) return false;
  S.wait = { key: t.key, what: t.what, amt: t.amt, work: t.work || null, m0: S.cal ? S.cal.m : 0, t0: S.time };
  S.skip = false; S.paused = false;
  IC.emit(S, 'waitStart', S.wait);
  return true;
};
/* Should this stop a wait (or skip)? Only what the player can act on now, and never the same thing twice: the same
   kind of incident about the same aircraft, or the same kind more than once a game day while waiting (playtest 1:
   one airspace incident nobody could fix in Act I stopped Wait ten times in a row) */
IC.waitWorth = function (S, type, d) {
  if (type !== 'incidentAdded' || !d) return true;
  const st = S.story;
  // in Act I the airspace is not the player's yet: no radar, no airways to give; foreign overflights never are
  const sep = d.kind === 'separation' || d.kind === 'nearmiss';
  if (sep && st && st.act === 1 && st.ch < 2) return false;
  if (sep && st && st.act === 1 && d.ref && !d.ref.tail) return false;
  const seen = S.waitSeen || (S.waitSeen = {}), ref = d.ref ? d.ref.id || d.ref.cs || d.ref.tn || '' : '';
  const k1 = d.kind + ':' + ref, k2 = 'kind:' + d.kind;
  if (seen[k1] != null) return false;
  if (seen[k2] != null && S.time - seen[k2] < 86400) return false;
  seen[k1] = seen[k2] = S.time;
  // (forget the oldest: a long Career meets thousands of aircraft)
  const ks = Object.keys(seen); if (ks.length > 200) for (const k of ks.slice(0, 100)) delete seen[k];
  return true;
};
IC.waitStop = function (S, why) {
  if (!S.wait) return;
  const w = S.wait; S.wait = null;
  IC.emit(S, 'waitDone', { w, why });
};
/* every step: has what we wait for come? (headless: the tests run it) */
IC.waitTick = function (S, dt) {
  // the money coming in, averaged over about a day of live time
  const net = S.income - S.upkeep, k = Math.min(1, dt / 86400 * 1.5);
  S.netAvg = S.netAvg == null ? net : S.netAvg + (net - S.netAvg) * k;
  const w = S.wait; if (!w) return;
  if (w.works) {
    const ap = S.byId[w.works], left = ap && ap.works ? ap.works.filter(x => x.stages) : [];
    if (!left.length) return IC.waitStop(S, `Every work at ${ap ? ap.name : 'the airport'} is finished.`);
    if (left.every(x => /money/.test(x.wait || ''))) return IC.waitStop(S, `The works at ${ap.name} wait for money: ${IC.waitText(S, { what: 'them', amt: S.budget + left.reduce((a, x) => a + Math.max(0, x.cost - x.spent), 0) })}`);
    return;
  }
  if (w.work) {
 const x = worksOf(S).find(q => q.w.id === w.work); if (!x) return IC.waitStop(S, `${cap1(w.what)} is finished.`); if (x.w.cost - x.w.spent <= Math.max(0, S.budget)) return IC.waitStop(S, `There is enough to finish ${w.what}.`); }
  else if (S.budget >= w.amt) return IC.waitStop(S, `${U.money(S.budget)} in the treasury: enough for ${w.what}.`);
  if (S.cal && S.cal.m !== w.m0) return IC.waitStop(S, `${IC.MONTHS[S.cal.m % 12]} begins. ${IC.waitText(S, w)}`);
};
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);

/* research for airports: in the Career these open airport items (IC.APT_TECH in airport.js); each says what it opens */
if (!IC.TECH_CATS.some(c => c.id === 'apt')) {
  IC.TECH_CATS.push({ id: 'apt', name: 'Airports' });
  IC.TECH.push(
    { id: 'p_bridge', cat: 'apt', name: 'Jet bridges', cost: 60, time: 1800, req: [], desc: 'Opens: jet bridges at gates. Passengers board through a covered bridge instead of walking out across the apron: turnarounds at gates about 8% quicker.' },
    { id: 'p_rconc', cat: 'apt', name: 'Reinforced concrete', cost: 90, time: 2700, req: [], desc: 'Opens: reinforced concrete pavement. It carries 600 t, and a bomb leaves a crater about half the size.' },
    { id: 'p_hydrant', cat: 'apt', name: 'Hydrant fuel systems', cost: 120, time: 3600, req: ['p_bridge'], desc: 'Opens: the hydrant fuel system. Fuel piped under the aprons: no waiting for a fuel truck.' },
    { id: 'p_gradar', cat: 'apt', name: 'Ground movement radar', cost: 100, time: 2700, req: [], desc: 'Opens: the ground radar. The tower sees every aircraft on the ground, at night and in fog.' },
    { id: 'p_ils3', cat: 'apt', name: 'CAT III landing systems', cost: 150, time: 3600, req: ['p_gradar'], desc: 'Opens: CAT III landing systems. Landing systems built after it keep movements closely spaced in fog; earlier ones are CAT I, and fog then spaces every movement 60% wider.' }
  );
}
/* how long a project takes: in the Career by the calendar (about a month for every 12½ live minutes it used to take,
   so a big one takes a year), on the live clock in a Quick war */
IC.techMonths = t => t.mo || Math.max(1, Math.round(t.time / 750));
IC.techTime = (S, t) => S.mode === 'story' ? IC.MO(S, IC.techMonths(t)) : t.time;
IC.techDur = (S, t, f) => { const g = (f == null ? 1 : f) * IC.techTime(S, t); return S.mode === 'story' ? U.months(g) : U.dur(g); };
IC.researching = (S, id) => S.tech.slots.find(s => s && s.id === id);
IC.startResearch = function (S, id) {
  const t = IC.TECH.find(x => x.id === id);
  const slot = S.tech.slots.findIndex(s => !s);
  if (!t || S.tech.done.has(id) || IC.researching(S, id) || slot < 0 || S.budget < t.cost) return false;
  if (!t.req.every(r => S.tech.done.has(r))) return false;
  IC.pay(S, 'research', t.cost);
  S.tech.slots[slot] = { id, prog: 0 };
  IC.log(S, 'info', 'RESEARCH', `Started ${t.name}: ready in ${IC.techDur(S, t)}.`);
  IC.emit(S, 'researchStart', id);
  return true;
};

})(window.IC);
