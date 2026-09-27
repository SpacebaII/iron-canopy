/* Iron Canopy — civil aviation. Fictional airlines fly routes through our airports with real aircraft ("tails")
   that land, taxi, park, turn round and leave again. They pay landing and passenger fees, judge every visit
   (taxi time, delays, fees, detours, danger) and ask for new routes when they are happy. Prohibited zones keep
   civil routes away from what matters, at the cost of longer flights. */
(function (IC) {
'use strict';
const U = IC.U;
const DAY0 = 6 * 3600, DAY1 = 23 * 3600;
const APPROACH = 260;

const octal = () => IC.squawk();
const hourOf = S => ((S.time % 86400) + 86400) % 86400;
const dayOps = S => { const h = hourOf(S); return h >= DAY0 && h < DAY1; };

IC.avInit = function (S) {
  const W = S.world;
  const A = S.av = { airlines: [], routes: [], tails: [], requests: [], zones: [], led: { land: 0, pax: 0, over: 0, cargo: 0 }, rate: { land: 0, pax: 0, over: 0, cargo: 0 },
    day: { pax: 0, flights: 0, delays: 0, div: 0 }, hist: [], reqT: 3 * 3600, cutT: 0, paxTotal: 0, flightsTotal: 0 };
  const apts = S.infra.filter(i => i.kind === 'airport');
  if (!apts.length) return;
  const cap = apts.find(a => a.template === 'intl') || apts[0];
  const second = apts.find(a => a !== cap && a.template === 'regional_ok') || apts[1] || cap;
  const third = apts.find(a => a !== cap && a !== second) || second;
  const ports = W.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b).filter((p, i, L) => L.findIndex(q => q.name === p.name) === i);
  const gates = W.airways.filter(w => w.kind === 'long' && (w.a.k === 'H' || w.b.k === 'H')).map(w => w.a.k === 'H' ? w.b : w.a);
  const liv = IC.LIVERY.slice();
  const mk = (kind, name, hub, extra) => {
    const K = IC.AIRLINE_KIND[kind];
    const al = Object.assign({ id: IC.nid('al'), kind, K, name, code: name.replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X'), hub: hub.id, livery: liv.splice(Math.floor(Math.random() * liv.length), 1)[0] || ['#ccc', '#333'], sat: 62, lowT: 0, flights: 0 }, extra || {});
    A.airlines.push(al);
    return al;
  };
  const flag = mk('flag', `${W.names.H} Airways`, cap, { code: W.names.H.slice(0, 2).toUpperCase() + 'A' });
  const budget = mk('budget', U.pick(IC.AIRLINE_NAMES.budget), cap);
  const regional = mk('regional', U.pick(IC.AIRLINE_NAMES.regional), second);
  const cargo = mk('cargo', U.pick(IC.AIRLINE_NAMES.cargo), cap);
  const neutralKs = [...new Set(ports.map(p => p.k))];
  const foreign = neutralKs.map(k => mk('foreign', `${W.names[k]} Air`, cap, { country: k, code: W.names[k].slice(0, 3).toUpperCase() }));
  const port = k => ports.filter(p => !k || p.k === k);
  const add = (al, a, b, type, n) => { if (!a || !b) return; IC.avAddRoute(S, al, a, b, type, n, true); };
  const portsAll = port();
  add(flag, cap, portsAll[0], 'narrow', 3);
  add(flag, cap, portsAll[1] || portsAll[0], 'narrow', 3);
  add(flag, cap, portsAll[2] || portsAll[0], 'narrow', 2);
  if (gates[0]) add(flag, cap, Object.assign({ gate: true }, gates[0], { name: 'long-haul' }), 'wide', 2);
  add(flag, cap, { apt: second.id }, 'narrow', 2);
  add(budget, cap, portsAll[portsAll.length - 1], 'narrow', 3);
  add(budget, cap, { apt: second.id }, 'narrow', 2);
  add(budget, second, portsAll[0], 'narrow', 1);
  add(regional, second, { apt: third.id }, 'turbo', 2);
  add(regional, cap, { apt: third.id }, 'turbo', 2);
  add(cargo, cap, portsAll[0], 'cargo', 1);
  for (const f of foreign) { const p = port(f.country)[0]; if (p) add(f, cap, p, U.pick(['narrow', 'narrow', 'wide']), 2); }
  // aircraft are spread over their routes when the game starts
  for (const t of A.tails) seedTail(S, t);
};

/* where a route endpoint is */
function endPt(S, e) { if (e.apt) { const ap = S.byId[e.apt]; return { x: ap.x, y: ap.y, name: ap.name, apt: ap.id, k: 'H' }; } return e; }
IC.avEnd = endPt;
function routeName(S, r) { return `${S.byId[r.a].name.replace(/ (International|Airport)$/, '')} – ${endPt(S, r.b).name.replace(/ (International|Airport)$/, '')}`; }
IC.avRouteName = routeName;

IC.avAddRoute = function (S, al, a, b, type, n, quiet) {
  const A = S.av;
  let r = A.routes.find(x => x.al === al.id && x.a === a.id && JSON.stringify(x.b) === JSON.stringify(b.apt ? { apt: b.apt } : b) && x.type === type);
  if (!r) { r = { id: IC.nid('rt'), al: al.id, a: a.id, b: b.apt ? { apt: b.apt } : b, type, n: 0, st: 'active', flown: 0, rev: 0, since: S.time }; A.routes.push(r); }
  for (let i = 0; i < n; i++) {
    r.n++;
    const t = { id: IC.nid('tl'), route: r.id, al: al.id, type, T: IC.ACTYPES[type], cs: `${al.code} ${U.randi(100, 989)}`, where: 'away', at: null, next: a.id, t: U.rand(300, 2400), leg: 'in' };
    A.tails.push(t);
  }
  if (!quiet) { IC.log(S, 'info', 'AVIATION', `${al.name} opens ${routeName(S, r)} with ${n} ${IC.ACTYPES[type].name.toLowerCase()}${n > 1 ? 's' : ''}.`, S.byId[a.id]); IC.emit(S, 'routeOpen', { al, r }); }
  return r;
};
function seedTail(S, t) {
  const r = routeOf(S, t), ap = S.byId[r.a];
  const roll = Math.random();
  if (roll < 0.45) {
    const s = freeStand(S, ap, t.T);
    if (s) { s.occ = t.id; t.where = 'stand'; t.at = ap.id; t.stand = s.id; t.t = U.rand(0, t.T.turn); return; }
  }
  if (roll < 0.75) { t.where = 'away'; t.next = r.a; t.t = U.rand(60, 3600); return; }
  // already airborne on the way in
  t.where = 'away'; t.next = r.a; t.t = 0; t.progress = U.rand(0.1, 0.7);
}
const routeOf = (S, t) => S.av.routes.find(r => r.id === t.route);
const airlineOf = (S, id) => S.av.airlines.find(a => a.id === id);
IC.avAirline = airlineOf; IC.avRoute = routeOf;

/* ---------- stands ---------- */
function standsOf(ap) { const L = []; for (const p of ap.parts || []) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) L.push(s); return L; }
IC.aptStands = standsOf;
function freeStand(S, ap, T, pref) {
  IC.aptGraph(ap);
  const milSlots = new Set(S.roster.filter(r => r.base === ap.id).map(r => r.slot));
  const ok = standsOf(ap).filter(s => s.hp > 0 && s.linked !== false && !s.occ && !milSlots.has(s.id) && IC.STAND_FITS[s.size].includes(T.stand) && IC.standZoneOk(s, T));
  if (!ok.length) return null;
  const order = { s: 0, m: 1, l: 2 };
  ok.sort((a, b) => ((b.zone === T.zone) - (a.zone === T.zone)) || (order[a.size] - order[b.size]) || ((b.contact === (pref !== 'cargo')) - (a.contact === (pref !== 'cargo'))) || (T.cargo ? (b.cargo - a.cargo) : 0));
  return ok[0];
}
IC.avFreeStand = freeStand;
function standById(ap, id) { for (const s of standsOf(ap)) if (s.id === id) return s; return null; }

/* ---------- route geometry: along the airways (airspace.js), then around prohibited zones ---------- */
const polyLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); return L; };
IC.avPath = function (S, a, b) {
  const net = S.asp ? IC.aspRoute(S, a, b) : null;
  const pts = net ? net.pts.map(p => Object.assign({}, p)) : [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  const base = polyLen(pts);
  IC.bendPath(pts, S.av ? S.av.zones : [], 6 + pts.length);
  return { pts, len: polyLen(pts), direct: U.dist(a, b), base, net: !!net };
};
IC.avAddZone = function (S, x, y, r, name) {
  const z = { id: IC.nid('pz'), x, y, r, name: name || `P-${S.av.zones.length + 1} ${IC.nearestPlace(S, x, y)}` };
  S.av.zones.push(z);
  IC.log(S, 'info', 'AIRSPACE', `Prohibited zone ${z.name} (${U.km(r)} radius) published. Civil routes will fly around it.`, z);
  IC.emit(S, 'zone', z);
  return z;
};
IC.avRemoveZone = function (S, id) { S.av.zones = S.av.zones.filter(z => z.id !== id); };
/* how much longer our routes are because of the zones (airways aside) */
IC.avDetour = function (S) {
  let a = 0, b = 0;
  for (const r of S.av.routes) { if (r.st !== 'active') continue; const p = IC.avPath(S, S.byId[r.a], endPt(S, r.b)); a += p.len; b += p.base; }
  return b ? a / b : 1;
};

/* ---------- flying the legs ---------- */
function launchLeg(S, t, from, to, x, y, alt, progress) {
  const path = IC.avPath(S, from, to);
  const r = routeOf(S, t), al = airlineOf(S, t.al);
  // an aircraft already under way starts part way along its route
  const at = progress ? IC.pathAt(path.pts, progress) : { x, y, ahead: path.pts.slice(1) };
  const tr = IC.spawnThreat(S, 'civ', at.x, at.y, { tail: t, cs: t.cs, sq: t.sq || (t.sq = octal()), pax: t.T.seats ? Math.round(t.T.seats * U.rand(0.6, 0.95)) : 2, alt,
    orig: from, dest: at.ahead[0], wps: at.ahead, plan: { a: from, b: to, cs: t.cs, pts: path.pts }, route: [to], aim: to, dist0: path.len, flown: progress ? path.len * progress : 0,
    toApt: to.apt || null, cruise: IC.aspLevel(t.T.alt, from, to), spd: t.T.cruise, livery: al.livery, acType: t.type, detour: path.len / Math.max(1, path.base), net: path.net });
  tr.rcs = t.type === 'turbo' ? 12 : t.type === 'narrow' ? 30 : 60;
  t.where = 'air'; t.track = tr; t.leg0 = S.time;
  // zones make a detour; airways a longer way round than direct
  t.detour = path.len / Math.max(1, path.base); t.netDetour = path.base / Math.max(1, path.direct);
  return tr;
}
IC.moveTail = function (S, t, dt) {
  const tl = t.tail;
  if (t.appr) return approach(S, t, dt);
  // GPS jamming or a deliberate turn pulls the aircraft off its route
  let d = t.dest;
  let hd = Math.atan2(d.y - t.y, d.x - t.x);
  if (t.drift) hd += t.drift;
  if (t.vector != null) { hd = t.vector; t.vectorT -= dt; if (t.vectorT <= 0) t.vector = null; }
  const L = U.dxy(t.x, t.y, d.x, d.y);
  t.vx = Math.cos(hd) * t.spd; t.vy = Math.sin(hd) * t.spd;
  t.x += t.vx * dt; t.y += t.vy * dt; t.flown += t.spd * dt;
  // a controller's level change, eased in and out
  if (t.aspDzT > 0) { t.aspDzT -= dt; if (t.aspDzT <= 0) t.aspDz = 0; }
  t.dzNow = (t.dzNow || 0) + U.clamp((t.aspDz || 0) - (t.dzNow || 0), -0.01 * dt, 0.01 * dt);
  // climb out, cruise, descend
  const remain = L + (t.wps.length > 1 ? t.wps.slice(1).reduce((s, p, i, arr) => s + U.dist(i ? arr[i - 1] : t.wps[0], p), 0) : 0);
  t.remain = remain;
  const cr = t.cruise + (t.dzNow || 0);
  const climb = t.orig && t.orig.edge ? cr : Math.min(cr, 0.3 + t.flown / 90);
  const desc = t.toApt ? Math.min(cr, 0.6 + Math.max(0, remain - APPROACH) / 110) : cr;
  t.alt = Math.max(0.3, Math.min(climb, desc));
  if (L < t.spd * dt + 3 && !t.drift) {
    t.wps.shift();
    if (t.wps.length) { t.dest = t.wps[0]; return; }
    // reached the end of the route
    if (t.toApt) { beginApproach(S, t); return; }
    t.dead = true; t.arrived = true;
    if (tl) arriveAway(S, tl, t);
    return;
  }
  if (t.toApt && remain < APPROACH && !t.drift) beginApproach(S, t);
  if (t.x < -1200 || t.y < -1200 || t.x > IC.WW + 1200 || t.y > IC.WH + 1200) { t.dead = true; t.arrived = true; if (tl) arriveAway(S, tl, t); }
};
function beginApproach(S, t) {
  const ap = S.byId[t.toApt];
  const faf = ap && IC.gopsFaf(S, ap, t.tail.type);
  if (!faf) { divert(S, t, IC.aptLandWhy(S, ap, t.tail.T) || 'the runway is closed'); return; }
  t.appr = true; t.faf = faf; t.holdT = 0;
}
function approach(S, t, dt) {
  const tl = t.tail, ap = S.byId[t.toApt];
  const f = t.faf;
  const d = U.dxy(t.x, t.y, f.x, f.y);
  const spd = Math.max(0.9, Math.min(t.spd, 0.9 + d / 200));
  let hd;
  if (d > 6 && !t.holding) hd = Math.atan2(f.y - t.y, f.x - t.x);
  else {
    // at the approach fix: ask for the runway (every few seconds while holding)
    const r = S.time >= (t.nextTry || 0) ? tryLand(S, t, ap) : 'hold';
    if (r === 'hold' && S.time >= (t.nextTry || 0)) t.nextTry = S.time + 6;
    if (r === true) return;
    if (r === 'divert') { divert(S, t, IC.aptCanTake(S, ap, tl.T) || IC.aptLandWhy(S, ap, tl.T) || 'no stand or runway for it'); return; }
    t.holding = true; t.holdT += dt;
    t.hoa = (t.hoa || 0) + dt * spd / 14;
    const hx = f.x + Math.cos(t.hoa) * 14, hy = f.y + Math.sin(t.hoa) * 14;
    hd = Math.atan2(hy - t.y, hx - t.x);
    if (t.holdT > 1500) { divert(S, t, 'too long in the hold'); return; }
  }
  t.vx = Math.cos(hd) * spd; t.vy = Math.sin(hd) * spd;
  t.x += t.vx * dt; t.y += t.vy * dt;
  t.alt = Math.max(0.6, Math.min(t.alt, 0.6 + d / 120));
}
/* can this airport take this aircraft at all? '' or the reason */
IC.aptCanTake = function (S, ap, T) {
  const st = ap.st || {};
  if (ap.owner !== 'us' || ap.offline) return 'the airport is closed';
  if ((st.longest || 0) < T.rwy) return `the runway is too short (needs ${U.km(T.rwy)})`;
  if (!T.mil && T !== IC.ACTYPES.turbo && !st.fire) return 'no fire station covers the runway';
  if (!standsOf(ap).some(s => s.linked !== false && s.hp > 0 && IC.STAND_FITS[s.size].includes(T.stand) && IC.standZoneOk(s, T))) return `no ${IC.STAND[T.stand].name} ${T.cargo ? 'cargo or passenger' : 'passenger'} stand connected to the runway`;
  return '';
};
function tryLand(S, t, ap) {
  const tl = t.tail;
  if (IC.aptCanTake(S, ap, tl.T)) return 'divert';
  if (IC.gaBusy(S, ap)) { IC.gaDelayNote(S, ap); return 'hold'; }
  let s = tl.resStand ? standById(ap, tl.resStand) : null;
  if (!s || (s.occ && s.occ !== tl.id)) { s = freeStand(S, ap, tl.T, airlineOf(S, tl.al).kind); if (!s) { ap.kpi.standWait = (ap.kpi.standWait || 0) + 1; t.standShort = true; return 'hold'; } }
  const m = IC.gopsLand(S, ap, { type: tl.type, target: s.id, stand: s, who: tl.cs, tail: tl, livery: t.livery, faf: t.faf,
    onPark: mm => parked(S, tl, ap, s, mm), onDead: (mm, why) => tailLost(S, tl, ap, why || 'destroyed on the ground') });
  if (m === 'divert') return 'divert';
  if (m === 'hold') { tl.resStand = s.id; return 'hold'; }
  s.occ = tl.id; tl.stand = s.id; tl.resStand = null;
  tl.where = 'arr'; tl.at = ap.id; tl.mv = m; tl.hold = t.holdT;
  t.dead = true; t.landed = true;
  pay(S, tl, ap, 'land');
  return true;
}
function parked(S, tl, ap, s, m) {
  tl.where = 'stand'; tl.mv = null; tl.at = ap.id;
  s.occ = tl.id;
  const al = airlineOf(S, tl.al);
  // turnaround: contact stands and a terminal with room are quicker
  const st = ap.st || {};
  let turn = tl.T.turn * (s.contact ? 1 : 1.25);
  const load = termLoad(S, ap);
  if (tl.T.seats) turn *= 1 + Math.max(0, load - 0.8) * 2.5;
  if (tl.T.cargo && !st.cargo) turn *= 2;
  tl.t = turn; tl.turn0 = turn;
  judge(S, al, tl, ap, { taxi: m.taxiT, wait: m.waitT + (tl.hold || 0), kind: 'arr' });
  IC.emit(S, 'tailParked', { tl, ap });
}
function termLoad(S, ap) {
  const cap = (ap.st && ap.st.pax) || 1;
  const L = ap.paxRate || 0;
  return L / cap;
}
function arriveAway(S, tl, t) {
  tl.where = 'away'; tl.track = null;
  const r = routeOf(S, tl);
  tl.next = r.a; tl.t = tl.T.turn * U.rand(1.2, 1.8) + (t.diverted ? 3600 : 0);
}
function divert(S, t, why) {
  const tl = t.tail;
  t.appr = false; t.holding = false; t.diverted = true;
  const ap = S.byId[t.toApt];
  const out = S.world.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b).sort((a, b) => U.dist(a, t) - U.dist(b, t))[0] || { x: t.x + 3000, y: t.y };
  t.toApt = null; t.wps = [{ x: out.x, y: out.y }]; t.dest = t.wps[0]; t.plan = { a: { x: t.x, y: t.y }, b: out, cs: t.cs, pts: [{ x: t.x, y: t.y }, { x: out.x, y: out.y }] };
  if (tl) { if (tl.resStand) { const s = standById(ap, tl.resStand); if (s && s.occ === tl.id) s.occ = null; tl.resStand = null; } const al = airlineOf(S, tl.al); judge(S, al, tl, ap, { divert: true }); }
  S.av.day.div++; ap.kpi.div++;
  IC.log(S, 'warn', 'AVIATION', `${t.cs} diverted away from ${ap.name}: ${why}.`, ap);
  IC.emit(S, 'divert', { t, ap, why });
}
function tailLost(S, tl, ap, why) {
  if (tl.where === 'lost') return;
  tl.where = 'lost';
  const r = routeOf(S, tl);
  if (r) r.n = Math.max(0, r.n - 1);
  const al = airlineOf(S, tl.al);
  al.sat = Math.max(0, al.sat - 25);
  IC.log(S, 'leak', 'AVIATION', `${al.name} ${tl.T.name.toLowerCase()} ${tl.cs} ${why} at ${ap ? ap.name : 'the airport'}.`, ap);
  IC.news(S, `${al.name} aircraft ${why} at ${ap ? ap.name : 'an airport'}.`);
  IC.emit(S, 'tailDestroyed', { tl, ap, why });
}
IC.on((S, type, d) => {
  if (type === 'tailLost' && S.av) { const tl = S.av.tails.find(x => x.id === d.tail); if (tl) tailLost(S, tl, d.ap, d.why); }
  if (type === 'civilKill' && S.av && d.tail) { const tl = d.tail; if (tl.where !== 'lost') { tl.where = 'lost'; const r = routeOf(S, tl); if (r) r.n = Math.max(0, r.n - 1); } }
});

/* ---------- money ---------- */
function pay(S, tl, ap, what) {
  const al = airlineOf(S, tl.al), fee = ap.feeLevel || 1;
  // seats fill with the demand from the cities the airport serves (growth.js); holds with the goods going out
  const pax = tl.T.seats ? Math.round(tl.T.seats * U.clamp(IC.loadFactor(S, ap) * U.rand(0.9, 1.08), 0.2, 1)) : 0;
  const hold = tl.T.cargo || (tl.type === 'wide' ? 15 : 0);
  const land = tl.T.fee * 0.5 * fee, pf = pax * 0.0035 * fee, cg = hold * 0.008 * fee * IC.cargoLoad(S, ap);
  S.budget += land + pf + cg;
  const L = S.av.led; L.land += land; L.pax += pf; L.cargo += cg;
  feeLog(S, 'land', land); feeLog(S, 'pax', pf); if (cg) feeLog(S, 'cargo', cg);
  S.av.day.pax += pax; S.av.paxTotal += pax; S.av.day.flights++; S.av.flightsTotal++;
  ap.paxLog = ap.paxLog || []; ap.paxLog.push({ t: S.time, n: pax });
  const r = routeOf(S, tl); if (r) { r.flown++; r.rev += land + pf + cg; }
  al.flights++;
}
IC.avOverflight = function (S, t) { if (!S.av) return; const v = 0.35; S.budget += v; S.av.led.over += v; feeLog(S, 'over', v); };
/* revenue over the last hour, by kind (scaled up during the first hour of a game) */
function feeLog(S, k, v) { (S.av.fees = S.av.fees || []).push({ t: S.time, k, v }); IC.econBook(S, 'fee_' + k, v); }
function feeRates(S) {
  const A = S.av, F = A.fees || [];
  while (F.length && S.time - F[0].t > 3600) F.shift();
  const span = Math.min(3600, Math.max(900, S.time - (A.t0 || (A.t0 = S.time))));
  const r = { land: 0, pax: 0, over: 0, cargo: 0 };
  for (const f of F) r[f.k] += f.v * 3600 / span;
  A.rate = r;
}

/* ---------- how airlines judge us ---------- */
function judge(S, al, tl, ap, o) {
  if (!al) return;
  const K = al.K;
  let score = 85;
  const why = [];
  if (o.divert) { score = 5; why.push('diversion'); }
  else {
    const tx = (o.taxi || 0) / 60, dl = (o.wait || 0) / 60;
    if (tx > K.taxiTol) { score -= (tx - K.taxiTol) * 4; why.push(`${Math.round(tx)} min taxiing`); }
    if (dl > K.delayTol) { score -= (dl - K.delayTol) * 3; why.push(`${Math.round(dl)} min delays`); }
  }
  const fee = ap ? ap.feeLevel || 1 : 1;
  if (fee > K.feeTol) { score -= (fee - K.feeTol) * 70; why.push('high fees'); }
  if (tl.detour > 1.03) { score -= (tl.detour - 1) * 180; why.push('detours round prohibited zones'); }
  if (tl.netDetour > 1.12) { score -= (tl.netDetour - 1.12) * 120; why.push('long airway routes'); }
  if (K.foreign || al.kind === 'flag') score -= (S.tension || 0) * (K.foreign ? 0.5 : 0.15);
  if (al.kind === 'cargo' && ap && ap.curfew) { score -= 12; why.push('the night curfew'); }
  score = U.clamp(score, 0, 100);
  al.sat = U.clamp(al.sat * 0.9 + score * 0.1, 0, 100);
  al.lastWhy = why.length ? why.join(', ') : 'smooth operations';
  if (ap) { ap.sat = (ap.sat == null ? 70 : ap.sat) * 0.92 + score * 0.08; if (why.length) ap.lastWhy = why[0]; }
  // delays and diversions put passengers off flying from here (growth.js reads the last day)
  if (ap && (o.divert || o.kind)) (ap.delays = ap.delays || []).push({ t: S.time, w: o.divert ? 3600 : o.wait || 0 });
  if (o.wait > 900) S.av.day.delays++;
}

/* ---------- requests: growth comes from happy airlines and a growing economy ---------- */
function makeRequest(S) {
  const A = S.av;
  const al = U.wpick(A.airlines.filter(a => a.sat > 45 && !(a.K.foreign && (S.tension || 0) > 40)).map(a => [a, a.sat - 40]));
  if (!al) return;
  const apts = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us');
  const W = S.world;
  const ports = W.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b).filter((p, i, L) => L.findIndex(q => q.name === p.name) === i);
  const type = U.pick(al.K.fleet);
  // airlines go where passengers are waiting for seats
  const busy = L => U.wpick(L.map(x => [x, 0.3 + Math.min(3, IC.demandPull(S, x))])) || U.pick(L);
  let a = S.byId[al.hub], b;
  if (al.kind === 'regional') { a = busy(apts); const o = apts.filter(x => x !== a); if (!o.length) return; b = { apt: busy(o).id }; }
  else if (al.kind === 'budget') { a = busy(apts); const o = apts.filter(x => x !== a); b = Math.random() < 0.6 || !o.length ? U.pick(ports) : { apt: busy(o).id }; }
  else if (al.K.foreign) { b = U.pick(ports.filter(p => p.k === al.country)) || U.pick(ports); a = U.pick(apts.filter(x => x.template === 'intl')) || a; }
  else if (al.kind === 'cargo' && IC.cargoPull) { a = U.wpick(apts.filter(x => x.svc).map(x => [x, 0.2 + Math.min(3, IC.cargoPull(S, x))])) || a; b = U.pick(ports); }
  else b = U.pick(ports);
  if (!a || !b) return;
  // no airline adds flights where the seats already fly more than half empty; cargo airlines look at the cargo
  // waiting for room instead (industrial towns and warehouses near the airport ship most)
  if (al.kind === 'cargo') { if (IC.cargoPull && a.svc && IC.cargoPull(S, a) < 0.4) return; }
  else if ([a].concat(b.apt ? [S.byId[b.apt]] : []).some(x => x.svc && x.svc.seats > 0 && IC.demandPull(S, x) < 0.55)) return;
  const existing = A.routes.find(r => r.al === al.id && r.a === a.id && JSON.stringify(r.b) === JSON.stringify(b.apt ? { apt: b.apt } : b));
  const req = { id: IC.nid('rq'), al: al.id, a: a.id, b: b.apt ? { apt: b.apt } : b, type, n: al.sat > 75 && Math.random() < 0.5 ? 2 : 1, t: S.time, exp: S.time + 6 * 3600, more: !!existing };
  req.why = existing ? `wants another ${IC.ACTYPES[type].name.toLowerCase()} on ${routeName(S, existing)}` : `wants to open ${S.byId[a.id].name.replace(/ (International|Airport)$/, '')} – ${endPt(S, req.b).name.replace(/ (International|Airport)$/, '')}`;
  req.value = estValue(S, req);
  A.requests.push(req);
  IC.log(S, 'info', 'AVIATION', `${al.name} ${req.why}. Decide in the Aviation room.`);
  IC.emit(S, 'request', req);
}
function estValue(S, q) {
  const T = IC.ACTYPES[q.type], a = S.byId[q.a], b = endPt(S, q.b);
  const leg = U.dist(a, b) / T.cruise * 2 + T.turn * 2.5 + 1200;
  const perDay = 86400 / leg * 0.75;
  return (T.fee * 0.5 + (T.seats || 0) * 0.006 + (T.cargo || 0) * 0.008) * perDay;
}
/* what stops a request being flown: '' when it can be */
IC.avReqBlock = function (S, q) {
  const T = IC.ACTYPES[q.type];
  const ends = [S.byId[q.a]].concat(q.b.apt ? [S.byId[q.b.apt]] : []);
  for (const ap of ends) { const why = IC.aptCanTake(S, ap, T); if (why) return `${ap.name}: ${why}`; }
  return '';
};
IC.avDecide = function (S, id, yes) {
  const A = S.av, q = A.requests.find(x => x.id === id);
  if (!q) return false;
  const al = airlineOf(S, q.al);
  if (yes) {
    const why = IC.avReqBlock(S, q);
    if (why) { IC.log(S, 'warn', 'AVIATION', `Cannot approve: ${why}.`); return false; }
    IC.avAddRoute(S, al, S.byId[q.a], q.b.apt ? { apt: q.b.apt } : q.b, q.type, q.n);
    al.sat = Math.min(100, al.sat + 4);
    IC.emit(S, 'approve', q);
  } else { al.sat = Math.max(0, al.sat - 3); IC.emit(S, 'decline', q); }
  A.requests = A.requests.filter(x => x !== q);
  return true;
};
IC.avSetFee = function (S, ap, v) { ap.feeLevel = U.clamp(v, 0.5, 2); };

/* ---------- the tick ---------- */
IC.aviation = function (S, dt) {
  const A = S.av;
  if (!A) return;
  const war = S.enemy && S.enemy.war;
  for (const tl of A.tails) {
    if (tl.where === 'lost') continue;
    const r = routeOf(S, tl);
    if (!r) { tl.where = 'lost'; continue; }
    const suspended = r.st !== 'active' || S.airspace === 'closed' || (S.airspace === 'restricted' && !routeSafe(S, r));
    if (tl.where === 'stand') {
      tl.t -= dt;
      if (tl.t > 0) continue;
      const ap = S.byId[tl.at], s = standById(ap, tl.stand);
      if (!s || s.hp <= 0) { tailLost(S, tl, ap, 'destroyed at the gate'); continue; }
      if (suspended) { tl.t = 600; continue; }
      const al = airlineOf(S, tl.al);
      const night = !dayOps(S);
      if (night && (ap.curfew || al.kind !== 'cargo')) { tl.t = 300; continue; }
      if (!IC.aptTakeFuel(ap, tl.T.fuel, S)) { tl.t = 300; tl.fuelWait = (tl.fuelWait || 0) + 300; if (!ap.fuelLogT || S.time - ap.fuelLogT > 3600) { ap.fuelLogT = S.time; IC.log(S, 'warn', 'AVIATION', ap.truckWait === S.time ? `${ap.name}: aircraft waiting for a fuel truck. Every truck is busy; more tanks or a hydrant system would help.` : `${ap.name}: aircraft waiting for fuel. The tank farm is empty or destroyed.`, ap); } continue; }
      const toEnd = tl.at === r.a ? endPt(S, r.b) : endPt(S, { apt: r.a });
      const from = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id, k: 'H' };
      // light aircraft on the runway, or controllers still spacing the last departure the same way
      if (IC.gaBusy(S, ap)) { const w = ap.gaUntil - S.time + 5; IC.gaDelayNote(S, ap, w); tl.t = w; tl.fuelWait = (tl.fuelWait || 0) + w; continue; }
      const rel = IC.aspRelease(S, from, toEnd);
      if (rel > 0) { tl.t = rel; tl.fuelWait = (tl.fuelWait || 0) + rel; continue; }
      const m = IC.gopsDepart(S, ap, { type: tl.type, node: s.id, stand: s, startT: 0, who: tl.cs, tail: tl, livery: al.livery,
        onAir: mm => { launchLeg(S, tl, from, toEnd, mm.x, mm.y, 0.3); tl.track.h = mm.h; judge(S, al, tl, ap, { taxi: mm.taxiT, wait: mm.waitT + (tl.fuelWait || 0), kind: 'dep' }); tl.fuelWait = 0; pay(S, tl, ap, 'dep'); },
        onDead: (mm, why) => tailLost(S, tl, ap, why || 'destroyed while taxiing') });
      if (!m) { tl.t = 300; tl.fuelWait = (tl.fuelWait || 0) + 300; continue; }
      tl.where = 'dep'; tl.mv = m; tl.stand = null;
    } else if (tl.where === 'away') {
      tl.t -= dt;
      if (tl.t > 0) continue;
      if (suspended) { tl.t = 1800; continue; }
      // the inbound leg starts at the far end of the route
      const dest = S.byId[tl.next];
      if (!dest || dest.owner !== 'us') { tl.t = 3600; continue; }
      const fromE = tl.next === r.a ? endPt(S, r.b) : endPt(S, { apt: r.a });
      if (fromE.apt) {
        // domestic: the aircraft is parked at the other airport; send it there first if it has nowhere to be
        const ap2 = S.byId[fromE.apt], s2 = freeStand(S, ap2, tl.T);
        if (s2 && Math.random() < 0.5) { s2.occ = tl.id; tl.where = 'stand'; tl.at = ap2.id; tl.stand = s2.id; tl.t = U.rand(600, tl.T.turn); continue; }
      }
      const to = { x: dest.x, y: dest.y, name: dest.name, apt: dest.id, k: 'H' };
      const f = tl.progress || 0; tl.progress = 0;
      // controllers space arrivals entering from the same place
      if (!f) { const rel = IC.aspRelease(S, fromE, to); if (rel > 0) { tl.t = rel; continue; } }
      const tr = launchLeg(S, tl, fromE, to, fromE.x, fromE.y, fromE.edge || f ? IC.aspLevel(tl.T.alt, fromE, to) : 0.5, f);
      if (!f) tr.flown = 0;
    }
  }
  // arriving aircraft counted per airport for terminal load
  A.paxHour = 0;
  for (const ap of IC.bases(S)) {
    if (!ap.paxLog) continue;
    ap.paxLog = ap.paxLog.filter(p => S.time - p.t < 3600);
    ap.paxRate = ap.paxLog.reduce((s, p) => s + p.n, 0);
    A.paxHour += ap.paxRate;
  }
  A.rateT = (A.rateT || 0) - dt;
  if (A.rateT <= 0) { A.rateT = 30; feeRates(S); }
  // hourly bookkeeping
  A.hourT = (A.hourT || 0) + dt;
  if (A.hourT >= 3600) {
    A.hourT -= 3600;
    for (const k in A.led) A.led[k] = 0;
    A.hist.push({ t: S.time, rev: Object.values(A.rate).reduce((s, v) => s + v, 0), pax: A.day.pax });
    if (A.hist.length > 72) A.hist.shift();
    if (hourOf(S) < 3600) { A.yesterday = A.day; A.day = { pax: 0, flights: 0, delays: 0, div: 0 }; }
    // unhappy airlines cut routes
    for (const al of A.airlines) {
      if (al.sat < 28) al.lowT += 1; else al.lowT = Math.max(0, al.lowT - 1);
      if (al.lowT >= 6) {
        al.lowT = 0;
        const r = A.routes.filter(x => x.al === al.id && x.st === 'active' && x.n > 0).sort((p, q) => p.rev - q.rev)[0];
        if (r) cutRoute(S, al, r, al.lastWhy);
      }
    }
    for (const q of A.requests.filter(q => S.time > q.exp)) { const al = airlineOf(S, q.al); if (al) al.sat = Math.max(0, al.sat - 3); }
    A.requests = A.requests.filter(q => S.time <= q.exp);
  }
  // unmet demand brings requests sooner: the busiest airport's passengers over its seats
  A.pullT = (A.pullT || 0) - dt;
  if (A.pullT <= 0) { A.pullT = 600; A.pull = Math.max(0, ...IC.bases(S).filter(x => x.owner === 'us').map(x => IC.demandPull(S, x))); }
  A.reqT -= dt * (1 + (S.story ? S.story.growth || 0 : 0) + U.clamp((A.pull || 0) - 0.9, 0, 1.5));
  if (A.reqT <= 0 && !war) { A.reqT = U.rand(2.5, 5) * 3600 * (S.mode === 'story' && S.story && S.story.act === 1 ? 0.5 : 1); if (A.requests.length < 4) makeRequest(S); }
};
function cutRoute(S, al, r, why) {
  const tl = S.av.tails.filter(t => t.route === r.id && t.where !== 'lost');
  if (r.n > 1) { r.n--; const t = tl.find(x => x.where === 'away') || tl[0]; if (t) { t.where = 'lost'; t.retired = true; if (t.stand && t.at) { const s = standById(S.byId[t.at], t.stand); if (s) s.occ = null; } } }
  else { r.st = 'cut'; for (const t of tl) if (t.where === 'away' || t.where === 'stand') { t.where = 'lost'; t.retired = true; if (t.stand && t.at) { const s = standById(S.byId[t.at], t.stand); if (s) s.occ = null; } } }
  IC.log(S, 'warn', 'AVIATION', `${al.name} ${r.st === 'cut' ? 'drops' : 'cuts back'} ${routeName(S, r)}, citing ${why || 'poor service'}.`, S.byId[r.a]);
  IC.news(S, `${al.name} ${r.st === 'cut' ? 'drops' : 'reduces'} ${routeName(S, r)} flights, citing ${why || 'poor service'}.`);
  IC.emit(S, 'routeCut', { al, r });
}
function routeSafe(S, r) {
  if (r._safeT && S.time - r._safeT < 3600) return r._safe;
  const a = S.byId[r.a], b = endPt(S, r.b);
  let m = 1e9;
  for (let i = 0; i <= 12; i++) { const x = a.x + (b.x - a.x) * i / 12, y = a.y + (b.y - a.y) * i / 12; if (IC.inHome(x, y)) m = Math.min(m, IC.hostileBorderDist(x, y)); }
  r._safe = m > 1800; r._safeT = S.time;
  return r._safe;
}
IC.avRevenueRate = S => S.av ? Object.values(S.av.rate).reduce((s, v) => s + v, 0) : 0;
IC.avUpkeep = function (S) {
  let v = 0;
  for (const ap of IC.bases(S)) if (ap.parts && ap.owner === 'us' && !ap.locked) for (const p of ap.parts) if (p.built) v += IC.partCost(ap, p) * 0.0012;
  return v;
};

/* ---------- radio: call an aircraft that is off its route ---------- */
IC.callAircraft = function (S, t) {
  if (t.dead || t.called) return false;
  t.called = S.time;
  IC.log(S, 'info', 'RADIO', `Calling ${t.cs || 'TN ' + t.tn} on the guard frequency…`, t);
  (S.later = S.later || []).push({ t: S.time + U.rand(25, 70), fn: () => {
    if (t.dead) return;
    if (t.type === 'ga' && !t.hijack) {
      IC.gaReplan(S, t);
      IC.log(S, 'info', 'RADIO', `${t.cs}: "Sorry, leaving controlled airspace now."`, t);
      IC.emit(S, 'radioOk', t);
    } else if (t.tail || (t.d.civil && !t.hijack)) {
      t.drift = 0; t.vector = null; t.jammed = false;
      t.wps = rejoin(t); t.dest = t.wps[0];
      IC.log(S, 'info', 'RADIO', `${t.cs}: "Roger, our GPS is unreliable. Turning back onto the route."`, t);
      IC.emit(S, 'radioOk', t);
    } else {
      t.noReply = true;
      IC.log(S, 'warn', 'RADIO', `${t.cs || 'TN ' + t.tn} does not answer.`, t);
      if (t.aff === 'A' || t.aff === 'N' || t.aff === 'U') IC.setAff(S, t, 'S', 'does not answer radio calls');
      IC.emit(S, 'radioNone', t);
    }
  } });
  return true;
};
/* back onto the filed route: to the next route point ahead */
function rejoin(t) {
  const P = t.plan && t.plan.pts;
  if (!P) return t.wps;
  let bi = 1, bd = 1e9;
  for (let i = 1; i < P.length; i++) { const d = U.segDist(t.x, t.y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y); if (d < bd) { bd = d; bi = i; } }
  const a = P[bi - 1], b = P[bi], L = U.dist(a, b) || 1;
  const f = U.clamp(((t.x - a.x) * (b.x - a.x) + (t.y - a.y) * (b.y - a.y)) / (L * L) + 60 / L, 0, 1);
  return [{ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }].concat(P.slice(bi));
}
/* distance from the filed route */
IC.offRoute = function (t) {
  const P = t.plan && (t.plan.pts || [t.plan.a, t.plan.b]);
  if (!P) return 0;
  let m = 1e9;
  for (let i = 1; i < P.length; i++) m = Math.min(m, U.segDist(t.x, t.y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y));
  return m;
};

})(window.IC);
