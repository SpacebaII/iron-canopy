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
    day: { pax: 0, flights: 0, delays: 0, div: 0 }, hist: [], deals: [], reqT: 3 * 3600, cutT: 0, paxTotal: 0, flightsTotal: 0 };
  const apts = S.infra.filter(i => i.kind === 'airport');
  if (!apts.length) return;
  const cap = apts.find(a => a.template === 'intl') || apts[0];
  const second = apts.find(a => a !== cap && a.template === 'regional_ok') || apts[1] || cap;
  const third = apts.find(a => a !== cap && a !== second) || second;
  const ports = IC.avPorts(S);
  const gates = W.airways.filter(w => w.kind === 'long' && (w.a.k === 'H' || w.b.k === 'H')).map(w => w.a.k === 'H' ? w.b : w.a);
  const mk = (kind, hub, extra) => IC.avAddAirline(S, kind, hub, extra);
  const flag = mk('flag', cap);
  const budget = mk('budget', cap);
  const regional = mk('regional', second);
  const cargo = mk('cargo', cap);
  const neutralKs = [...new Set(ports.map(p => p.k))];
  const foreign = neutralKs.map(k => mk('foreign', cap, { country: k }));
  const port = k => ports.filter(p => !k || p.k === k);
  const add = (al, a, b, type, n) => { if (!a || !b) return; IC.avAddRoute(S, al, a, b, type, IC.avFleet(S, a, b, type, n), true); };
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

/* the foreign airports our airlines fly to */
IC.avPorts = S => S.world.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b).filter((p, i, L) => L.findIndex(q => q.name === p.name) === i);
/* a new airline based at hub: flag carrier, budget, regional, cargo or a neighbour's ('foreign', with country) */
IC.avAddAirline = function (S, kind, hub, extra) {
  const A = S.av, W = S.world, K = IC.AIRLINE_KIND[kind];
  const taken = new Set(A.airlines.map(a => a.livery.join())), liv = IC.LIVERY.filter(l => !taken.has(l.join()));
  const k = extra && extra.country;
  const name = kind === 'flag' ? `${W.names.H} Airways` : kind === 'foreign' ? `${W.names[k]} Air` : U.pick(IC.AIRLINE_NAMES[kind].filter(n => !A.airlines.some(a => a.name === n))) || U.pick(IC.AIRLINE_NAMES[kind]);
  const code = kind === 'flag' ? W.names.H.slice(0, 2).toUpperCase() + 'A' : kind === 'foreign' ? W.names[k].slice(0, 3).toUpperCase() : name.replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const al = Object.assign({ id: IC.nid('al'), kind, K, name, code, hub: hub.id, livery: U.pick(liv.length ? liv : IC.LIVERY) || ['#ccc', '#333'], sat: 62, lowT: 0, flights: 0 }, extra || {});
  A.airlines.push(al);
  return al;
};
/* the Career: the national airport has just opened and the first airlines come. The flag carrier flies to two
   neighbours' capitals and one neighbour's airline flies in; the others arrive as the story goes on */
IC.avCareerStart = function (S, cap) {
  const A = S.av, ports = IC.avPorts(S);
  if (A.airlines.length) return;
  const flag = IC.avAddAirline(S, 'flag', cap);
  const near = ports.slice().sort((a, b) => U.dist(a, cap) - U.dist(b, cap));
  // one aircraft each: the Career starts small, and traffic grows with the requests the player approves
  // each under a founding deal: the terms of an ordinary one, and a day's grace to build what it asks for (the flag
  // carrier bases its aircraft here and wants a hangar)
  const add = (al, b) => {
    const r = IC.avAddRoute(S, al, cap, b, 'narrow', 1, true), q = { al: al.id, a: cap.id, b: r.b, type: 'narrow', n: 1 };
    makeTerms(S, q); q.terms.days += career(S) ? 6 : 1;
    signDeal(S, q, r, A.tails.filter(t => t.route === r.id && !t.deal), 24 * 3600);
  };
  add(flag, near[0]);
  if (near[1]) add(flag, near[1]);
  const k = near[near.length > 2 ? 2 : 0].k, fr = IC.avAddAirline(S, 'foreign', cap, { country: k });
  add(fr, ports.find(p => p.k === k));
  A.reqT = career(S) ? IC.MO(S, 0.5) : 4 * 3600;
  return flag;
};

/* aircraft a route needs to fly n aircraft's worth of flights a day: a longer flight keeps each aircraft away longer
   (the fleets were sized for flights of about 800 km; on the large map most go further) */
IC.avFleet = (S, a, b, type, n) => { const T = IC.ACTYPES[type], d = U.dist(a, endPt(S, b)), k = (d / T.cruise + T.turn) / (8000 / T.cruise + T.turn); return Math.max(n, Math.round(n * U.clamp(k, 1, 3))); };
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
  // off our runway: out along the departure lane first
  const lane = !progress && from.apt && S.byId[from.apt] && IC.atcDepLane(S, S.byId[from.apt], x, y);
  if (lane && U.dist(lane, to) < U.dist(from, to)) path.pts.splice(1, 0, { x: lane.x, y: lane.y, lane: true });
  const r = routeOf(S, t), al = airlineOf(S, t.al);
  // an aircraft already under way starts part way along its route
  const at = progress ? IC.pathAt(path.pts, progress) : { x, y, ahead: path.pts.slice(1) };
  const tr = IC.spawnThreat(S, 'civ', at.x, at.y, { tail: t, cs: t.cs, sq: t.sq || (t.sq = octal()), pax: t.T.seats ? Math.round(t.T.seats * U.rand(0.6, 0.95)) : 2, alt,
    orig: from, dest: at.ahead[0], wps: at.ahead, plan: { a: from, b: to, cs: t.cs, pts: path.pts }, route: [to], aim: to, dist0: path.len, flown: progress ? path.len * progress : 0,
    toApt: to.apt || null, cruise: IC.aspLevel(t.T.alt, from, to), spd: t.T.cruise, livery: al.livery, acType: t.type, detour: path.len / Math.max(1, path.base), net: path.net });
  tr.rcs = t.type === 'turbo' ? 12 : t.type === 'narrow' ? 30 : 60;
  // a departure from our airport is cleared first to a level under the arrivals, then climbs in steps (airspace.js)
  const sec = from.apt && IC.aspSectorAt(S, from.x, from.y, 0.5), o = from.apt && S.byId[from.apt];
  if (o && !progress && sec && sec.rules.depBelow && IC.aspVols(S, o).some(v => v.kind === 'shelf')) tr.clr = Math.min(tr.cruise, Math.max(IC.flKm(60), IC.aspTop(S, o) - IC.flKm(20)));
  t.where = 'air'; t.track = tr; t.leg0 = S.time;
  // zones make a detour; airways a longer way round than direct
  t.detour = path.len / Math.max(1, path.base); t.netDetour = path.base / Math.max(1, path.direct);
  return tr;
}
IC.moveTail = function (S, t, dt) {
  const tl = t.tail;
  if (t.appr) return approach(S, t, dt);
  if (t.phold) { IC.atcPlayerHold(S, t, dt); return; }
  // in a holding stack until its slot comes
  if (t.stk) {
    const r = IC.atcHold(S, t, dt);
    if (r === 'divert') { IC.atcLeave(S, t); divert(S, t, 'too long in the holding stack'); }
    if (r === 'go') toGate(S, t);
    return;
  }
  // a sequenced arrival near the airport joins the arrival lane at its gate
  if (t.seq && !t.onLane && t.toApt && !t.drift && !t.pCmd && U.dist(t, S.byId[t.toApt] || t) < IC.ASP.stackR + 60) toGate(S, t);
  // GPS jamming or a deliberate turn pulls the aircraft off its route
  let d = t.dest;
  let hd = Math.atan2(d.y - t.y, d.x - t.x);
  if (t.drift) hd += t.drift;
  if (t.vector != null) { hd = t.vector; t.vectorT -= dt; if (t.vectorT <= 0) t.vector = null; }
  const L = U.dxy(t.x, t.y, d.x, d.y);
  // controllers slow it down to meet its landing slot; 250 kt below FL100
  const spd = Math.min(t.spd * (t.spdF || 1), t.alt < 3.1 ? IC.aspSpeedCap(S, t) : Infinity);
  t.vx = Math.cos(hd) * spd; t.vy = Math.sin(hd) * spd;
  t.x += t.vx * dt; t.y += t.vy * dt; t.flown += spd * dt;
  // a controller's level change, eased in and out
  if (t.aspDzT > 0) { t.aspDzT -= dt; if (t.aspDzT <= 0) t.aspDz = 0; }
  t.dzNow = (t.dzNow || 0) + U.clamp((t.aspDz || 0) - (t.dzNow || 0), -0.01 * dt, 0.01 * dt);
  // climb out, cruise, descend
  const remain = L + (t.wps.length > 1 ? t.wps.slice(1).reduce((s, p, i, arr) => s + U.dist(i ? arr[i - 1] : t.wps[0], p), 0) : 0);
  t.remain = remain;
  // climb out, cruise at the level controllers clear it to, come down 3.5° to the runway
  const cr = (t.pCmd && t.clr != null ? t.clr : t.cruise) + (t.dzNow || 0);
  const climb = t.orig && t.orig.edge ? cr : Math.min(cr, IC.aspClimbAt(t.flown));
  const desc = t.toApt ? Math.min(cr, IC.aspDescent(remain + IC.GOPS.FAF)) : cr;
  const want = Math.max(0.3, Math.min(climb, desc, t.clr != null && !t.pCmd ? t.clr + (t.dzNow || 0) : Infinity));
  t.alt += U.clamp(want - t.alt, -0.02 * dt, 0.03 * dt);
  t.lvl = t.clr != null ? t.clr : t.toApt && desc < cr - 0.05 ? null : t.cruise;
  if (t.toApt && !t.seq && remain < IC.ASP.seq && !t.drift) { const ap = S.byId[t.toApt]; if (ap) IC.atcSequence(S, t, ap, remain); }
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
/* from a stack or the edge of the terminal area, by the arrival lane: to the gate, then in */
function toGate(S, t) {
  const ap = S.byId[t.toApt], end = t.wps[t.wps.length - 1], Ln = ap && IC.atcLanes(S, ap);
  t.onLane = true;
  t.wps = Ln && U.dist(t, Ln.gate) > 60 && U.dist(t, ap) > U.dist(Ln.gate, ap) - 30 ? [{ x: Ln.gate.x, y: Ln.gate.y, lane: true }, end] : [end];
  t.dest = t.wps[0];
}
function beginApproach(S, t) {
  const ap = S.byId[t.toApt];
  t.spdF = 1; t.vector = null;
  const faf = ap && IC.gopsFaf(S, ap, t.tail.type, t);
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
  // down the glide path to the fix; holding there, each a thousand feet above the one before it
  let a = IC.aspDescent(d + IC.GOPS.FAF);
  if (t.holding) { const q = (ap.fafQ || []).filter(x => !x.done && x.rw === f.rwId && x.o && x.o.holding && !x.o.dead), i = Math.max(0, q.findIndex(x => x.o === t)); a = IC.aspDescent(IC.GOPS.FAF) + i * IC.flKm(10); t.lvl = a; }
  t.alt += U.clamp((t.holding ? a : Math.min(t.alt, a)) - t.alt, -0.02 * dt, 0.012 * dt);
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
/* an arrival's ground move: parked, destroyed on the ground, or gone around */
IC.H.avParked = (S, tl, ap, s) => mm => parked(S, tl, ap, s, mm);
IC.H.avGroundLost = (S, tl, ap) => (mm, why) => tailLost(S, tl, ap, why || 'destroyed on the ground');
IC.H.avGoAround = (S, t, tl, ap, s) => mm => goneAround(S, t, tl, ap, s, mm);
function tryLand(S, t, ap) {
  const tl = t.tail;
  if (IC.aptCanTake(S, ap, tl.T)) return 'divert';
  if (IC.gaBusy(S, ap)) { IC.gaDelayNote(S, ap); return 'hold'; }
  let s = tl.resStand ? standById(ap, tl.resStand) : null;
  if (!s || (s.occ && s.occ !== tl.id)) { s = freeStand(S, ap, tl.T, airlineOf(S, tl.al).kind); if (!s) { ap.kpi.standWait = (ap.kpi.standWait || 0) + 1; t.standShort = true; return 'hold'; } }
  const m = IC.gopsLand(S, ap, { type: tl.type, target: s.id, stand: s, who: tl.cs, tail: tl, livery: t.livery, faf: t.faf,
    onPark: IC.hfn('avParked', S, tl, ap, s), onDead: IC.hfn('avGroundLost', S, tl, ap), onGoAround: IC.hfn('avGoAround', S, t, tl, ap, s) });
  if (m === 'divert') return 'divert';
  if (m === 'hold') { tl.resStand = s.id; return 'hold'; }
  s.occ = tl.id; tl.stand = s.id; tl.resStand = null;
  tl.where = 'arr'; tl.at = ap.id; tl.mv = m; tl.hold = t.holdT;
  t.dead = true; t.landed = true;
  pay(S, tl, ap, 'land');
  return true;
}
/* a go-around: back into the air, round the circuit (about four minutes, and the fuel for it) and into the queue
   at the approach fix again, the stand still kept for it */
const CIRCUIT = 240;
function goneAround(S, t, tl, ap, s, m) {
  if (s.occ === tl.id) s.occ = null;
  tl.resStand = s.id; tl.where = 'air'; tl.mv = null; tl.stand = null;
  t.dead = false; t.landed = false; t.x = m.x; t.y = m.y; t.alt = 0.6; t.holding = true;
  t.holdT = (t.holdT || 0) + CIRCUIT; t.nextTry = S.time + CIRCUIT; t.ga = (t.ga || 0) + 1;
  if (t.faf && t.faf.q) { t.faf.q.done = false; t.faf.q.t = S.time; t.faf.q.askT = S.time; t.faf.q.backT = S.time + CIRCUIT; }
  if (!S.threats.includes(t)) S.threats.push(t);
}
/* what the crews and the tower say on the radio about runway events */
IC.radioGoAround = function (S, ap, m, o, why) {
  IC.sfx && IC.sfx.radio && IC.sfx.radio();
  IC.log(S, 'info', 'RADIO', `${ap.name} tower: ${m.who || 'an arrival'}, going around at 1 km on ${IC.rwEnd(m.plan.rw, m.plan.dir)}: ${why}. It flies a circuit and lands in about ${Math.round(CIRCUIT / 60)} minutes.`, m);
};
function parked(S, tl, ap, s, m) {
  tl.where = 'stand'; tl.mv = null; tl.at = ap.id; tl.lastStand = s.id;
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
  IC.atcLeave(S, t); t.spdF = 1;
  t.appr = false; t.holding = false; t.diverted = true;
  const ap = S.byId[t.toApt];
  const out = S.world.airways.filter(w => w.kind === 'intl').map(w => w.b.k === 'H' ? w.a : w.b).sort((a, b) => U.dist(a, t) - U.dist(b, t))[0] || { x: t.x + 3000, y: t.y };
  t.toApt = null; t.wps = [{ x: out.x, y: out.y }]; t.dest = t.wps[0]; t.plan = { a: { x: t.x, y: t.y }, b: out, cs: t.cs, pts: [{ x: t.x, y: t.y }, { x: out.x, y: out.y }] };
  if (tl) { if (tl.resStand) { const s = standById(ap, tl.resStand); if (s && s.occ === tl.id) s.occ = null; tl.resStand = null; } const al = airlineOf(S, tl.al); judge(S, al, tl, ap, { divert: true }); }
  S.av.day.div++; ap.kpi.div++;
  // outside the Career one toast an hour for each airport (in a war they come in dozens); the Journal has them all
  const loud = S.story || !ap.divLogT || S.time - ap.divLogT > 3600; if (loud) ap.divLogT = S.time;
  IC.log(S, loud ? 'warn' : 'info', 'AVIATION', `${t.cs} diverted away from ${ap.name}: ${why}.`, loud ? ap : null);
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
  const al = airlineOf(S, tl.al), dl = dealOf(S, tl), fee = dl ? dl.charge : ap.feeLevel || 1;
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
  // the day's takings at this airport, and what each stand earned (the Economy room's lesson on idle stands)
  const D = dayLog(S, ap), sid = tl.stand || tl.lastStand;
  D.fee += land + pf + cg; if (sid) D.stand[sid] = (D.stand[sid] || 0) + land + pf + cg;
}
/* route charges from traffic crossing the country: more for a flight on our airways, where controllers give it a service */
IC.avOverflight = function (S, net) { if (!S.av) return; const v = net ? 0.5 : 0.25; S.budget += v; S.av.led.over += v; feeLog(S, 'over', v); IC.emit(S, 'overflight', { net: !!net }); };
/* revenue over the last hour, by kind (scaled up during the first hour of a game) */
function feeLog(S, k, v) { (S.av.fees = S.av.fees || []).push({ t: S.time, k, v }); S.av.feeTotal = (S.av.feeTotal || 0) + v; IC.econBook(S, 'fee_' + k, v); }
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
  dealMark(S, tl, o);
  const K = al.K, dl = dealOf(S, tl);
  let score = 85;
  const why = [];
  if (o.divert) { score = 5; why.push('diversion'); }
  else {
    const tx = (o.taxi || 0) / 60, dl = (o.wait || 0) / 60;
    if (tx > K.taxiTol) { score -= (tx - K.taxiTol) * 4; why.push(`${Math.round(tx)} min taxiing`); }
    if (dl > K.delayTol) { score -= (dl - K.delayTol) * 3; why.push(`${Math.round(dl)} min delays`); }
  }
  const fee = dl ? dl.charge : ap ? ap.feeLevel || 1 : 1;
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
  let type = U.pick(al.K.fleet);
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
  // long routes go to bigger aircraft where the airline has them
  if (type === 'narrow' && U.dist(a, endPt(S, b)) > 25000 && al.K.fleet.includes('wide')) type = 'wide';
  // a route another airline holds exclusively is not on offer
  const bK = JSON.stringify(b.apt ? { apt: b.apt } : { name: b.name });
  if (A.deals.some(d => d.st === 'active' && d.excl && d.al !== al.id && d.a === a.id && JSON.stringify(d.b.apt ? { apt: d.b.apt } : { name: d.b.name }) === bK)) return;
  const act1 = S.story && S.story.act === 1;
  // an airline that trusts the airport brings more aircraft at once: fewer offers, each with weight
  const n = (IC.DEAL.fleet[al.kind] || 1) + (repOf(a) >= 60 ? 1 : 0) + (al.sat > 75 && Math.random() < 0.5 ? 1 : 0);
  const req = { id: IC.nid('rq'), al: al.id, a: a.id, b: b.apt ? { apt: b.apt } : b, type, n, t: S.time, exp: S.time + (career(S) ? IC.MO(S) : (act1 ? 12 : 6) * 3600), more: !!existing };
  req.why = existing ? `wants another ${IC.ACTYPES[type].name.toLowerCase()} on ${routeName(S, existing)}` : `wants to open ${S.byId[a.id].name.replace(/ (International|Airport)$/, '')} – ${endPt(S, req.b).name.replace(/ (International|Airport)$/, '')}`;
  makeTerms(S, req);
  A.requests.push(req);
  IC.log(S, 'info', 'AVIATION', `${al.name} ${req.why}. Decide in the Aviation room.`);
  IC.emit(S, 'request', req);
}
/* a request from a given airline, for the story: from airport a to b ({ apt } or a foreign airport) */
IC.avRequest = function (S, al, a, b, type, n, why, life) {
  const q = { id: IC.nid('rq'), al: al.id, a: a.id, b: b.apt ? { apt: b.apt } : { x: b.x, y: b.y, name: b.name, k: b.k }, type, n, t: S.time, exp: S.time + (life || 6 * 3600), why };
  makeTerms(S, q);
  S.av.requests.push(q);
  IC.log(S, 'info', 'AVIATION', `${al.name} ${why}. Decide in the Aviation room.`);
  IC.emit(S, 'request', q);
  return q;
};
/* what stops a request being flown: '' when it can be */
IC.avReqBlock = function (S, q) {
  const miss = IC.dealNeeds(S, q).find(x => !x.ok);
  return miss ? miss.text : '';
};
IC.avDecide = function (S, id, yes) {
  const A = S.av, q = A.requests.find(x => x.id === id);
  if (!q) return false;
  const al = airlineOf(S, q.al);
  if (yes) {
    const why = IC.avReqBlock(S, q), k = q.terms && IC.dealTerms(S, q);
    if (why) { IC.log(S, 'warn', 'AVIATION', `${al.name} will not sign yet: ${why}.`); return false; }
    if (k && !k.ok) { IC.log(S, 'warn', 'AVIATION', `${al.name} will not sign at those charges: ${k.why}.`); return false; }
    const old = q.renew && A.deals.find(d => d.id === q.renew && d.st !== 'broken');
    if (old) { signDeal(S, q, null, [], 0); IC.log(S, 'info', 'AVIATION', `${al.name} renews for ${IC.dealLen(S, old.days)} at ${U.pct(old.charge)} of list charges.`, S.byId[q.a]); }
    else {
      const r = IC.avAddRoute(S, al, S.byId[q.a], q.b.apt ? { apt: q.b.apt } : q.b, q.type, q.n);
      if (q.terms) signDeal(S, q, r, A.tails.filter(t => t.route === r.id && !t.deal).slice(-q.n), 0);
    }
    al.sat = Math.min(100, al.sat + 4);
    IC.emit(S, 'approve', q);
  } else {
    al.sat = Math.max(0, al.sat - 3); IC.emit(S, 'decline', q);
    const d = q.renew && A.deals.find(x => x.id === q.renew); if (d && d.st === 'done') retireDeal(S, d);
  }
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
      // its route was dropped while it was in the air: it leaves the fleet here (cutRoute retires the ones parked then)
      if (r.st === 'cut') { tl.where = 'lost'; tl.retired = true; if (s.occ === tl.id) s.occ = null; continue; }
      if (suspended) { tl.t = 600; continue; }
      const al = airlineOf(S, tl.al);
      const night = !dayOps(S);
      if (night && (ap.curfew || al.kind !== 'cargo')) { tl.t = 300; continue; }
      // fuelled once: held back below (light aircraft, spacing, no taxi route) it keeps what it took
      if (!tl.fuelled && !IC.aptTakeFuel(ap, tl.T.fuel, S)) { tl.t = 300; tl.fuelWait = (tl.fuelWait || 0) + 300; if (!ap.fuelLogT || S.time - ap.fuelLogT > 3600) { ap.fuelLogT = S.time; IC.log(S, 'warn', 'AVIATION', ap.truckWait === S.time ? `${ap.name}: aircraft waiting for a fuel truck. Every truck is busy; more tanks or a hydrant system would help.` : `${ap.name}: aircraft waiting for fuel. The tank farm is empty or destroyed.`, ap); } continue; }
      tl.fuelled = true;
      const toEnd = tl.at === r.a ? endPt(S, r.b) : endPt(S, { apt: r.a });
      const from = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id, k: 'H' };
      // light aircraft on the runway, or controllers still spacing the last departure the same way
      if (IC.gaBusy(S, ap)) { const w = ap.gaUntil - S.time + 5; IC.gaDelayNote(S, ap, w); tl.t = w; tl.fuelWait = (tl.fuelWait || 0) + w; continue; }
      const rel = IC.aspRelease(S, from, toEnd);
      if (rel > 0) { tl.t = rel; tl.fuelWait = (tl.fuelWait || 0) + rel; continue; }
      const m = IC.gopsDepart(S, ap, { type: tl.type, node: s.id, stand: s, startT: 0, who: tl.cs, tail: tl, livery: al.livery,
        onAir: IC.hfn('avAirborne', S, tl, from, toEnd, al, ap), onDead: IC.hfn('avTaxiLost', S, tl, ap) });
      if (!m) { tl.t = 300; tl.fuelWait = (tl.fuelWait || 0) + 300; continue; }
      tl.where = 'dep'; tl.mv = m; tl.stand = null; tl.fuelled = false;
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
    if (hourOf(S) < 3600) { A.yesterday = A.day; A.day = { pax: 0, flights: 0, delays: 0, div: 0 }; dealsDay(S); }
    dealsTick(S);
    // unhappy airlines cut routes
    for (const al of A.airlines) {
      if (al.sat < 28) al.lowT += 1; else al.lowT = Math.max(0, al.lowT - 1);
      if (al.lowT >= 6) {
        al.lowT = 0;
        const r = A.routes.filter(x => x.al === al.id && x.st === 'active' && x.n > 0).sort((p, q) => p.rev - q.rev)[0];
        if (r) cutRoute(S, al, r, al.lastWhy);
      }
    }
    for (const q of A.requests.filter(q => S.time > q.exp)) { const al = airlineOf(S, q.al); if (al) al.sat = Math.max(0, al.sat - 3); const d = q.renew && A.deals.find(x => x.id === q.renew); if (d && d.st === 'done') retireDeal(S, d); }
    A.requests = A.requests.filter(q => S.time <= q.exp);
  }
  // unmet demand brings requests sooner: the busiest airport's passengers over its seats
  A.pullT = (A.pullT || 0) - dt;
  if (A.pullT <= 0) { A.pullT = 600; A.pull = Math.max(0, ...IC.bases(S).filter(x => x.owner === 'us').map(x => IC.demandPull(S, x))); }
  // (in the Career's first act, offers come at the pace of the airport's name, not of every empty seat)
  A.reqT -= dt * (1 + (S.story ? S.story.growth || 0 : 0) + U.clamp((A.pull || 0) - 0.9, 0, S.story && S.story.act === 1 ? 0.4 : 1.5));
  if (A.reqT <= 0 && !war) { A.reqT = offerGap(S); if (A.requests.length < (S.story && S.story.act === 1 ? 3 : 4)) makeRequest(S); }
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
  const n = Math.max(12, Math.ceil(U.dist(a, b) / 200));   // every 20 km along the way
  for (let i = 0; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (IC.inHome(x, y)) m = Math.min(m, IC.hostileBorderDist(x, y)); }
  r._safe = m > 1800; r._safeT = S.time;
  return r._safe;
}
IC.avRevenueRate = S => S.av ? Object.values(S.av.rate).reduce((s, v) => s + v, 0) : 0;
IC.avUpkeep = function (S) {
  // pricing every part is slow and the step asks each time: the sum is kept, and worked out again when the parts
  // change (added, built, re-laid) or a game minute has passed
  let key = 0;
  for (const ap of IC.bases(S)) if (ap.parts && ap.owner === 'us' && !ap.locked) { key = key * 31 + ap.parts.length * 1009 + (ap.gver || 0) * 7; for (const p of ap.parts) if (p.built) key++; key %= 1e12; }
  const C = S._upk;
  let v;
  if (C && C.key === key && S.time - C.t < 60 && S.time >= C.t) v = C.v;
  else {
    v = 0;
    for (const ap of IC.bases(S)) if (ap.parts && ap.owner === 'us' && !ap.locked) for (const p of ap.parts) if (p.built) v += IC.partCost(ap, p) * 0.0012;
    Object.defineProperty(S, '_upk', { value: { key, v, t: S.time }, enumerable: false, configurable: true, writable: true });
  }
  // and the air traffic controllers in every sector
  return v + (S.asp && S.asp.secs ? IC.aspStaffCost(S) : 0);
};

/* a departing airliner's ground move: when it lifts off, and if it is destroyed on the ground */
IC.H.avAirborne = (S, tl, from, toEnd, al, ap) => mm => { launchLeg(S, tl, from, toEnd, mm.x, mm.y, 0.3); tl.track.h = mm.h; judge(S, al, tl, ap, { taxi: mm.taxiT, wait: mm.waitT + (tl.fuelWait || 0), kind: 'dep' }); tl.fuelWait = 0; pay(S, tl, ap, 'dep'); };
IC.H.avTaxiLost = (S, tl, ap) => (mm, why) => tailLost(S, tl, ap, why || 'destroyed while taxiing');
/* ---------- radio: call an aircraft that is off its route ---------- */
IC.callAircraft = function (S, t) {
  if (t.dead || t.called) return false;
  t.called = S.time;
  IC.log(S, 'info', 'RADIO', `Calling ${t.cs || 'TN ' + t.tn} on the guard frequency…`, t);
  IC.later(S, U.rand(25, 70), 'avRadioReply', S, t);
  return true;
};
IC.H.avRadioReply = (S, t) => () => {
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
};
/* back onto the filed route: to the next route point ahead */
IC.avRejoin = t => rejoin(t);
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
  // off the plan on a controller's instruction (sequenced, holding, vectored) or the player's is not off route
  if ((t.seq || t.stk || t.pCmd || t.phold) && !t.drift) return 0;
  const P = t.plan && (t.plan.pts || [t.plan.a, t.plan.b]);
  if (!P) return 0;
  let m = 1e9;
  for (let i = 1; i < P.length; i++) m = Math.min(m, U.segDist(t.x, t.y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y));
  return m;
};

/* ---------- deals: what an airline signs up to, and what it asks of our airports ----------
   Every offer (S.av.requests) carries terms: the aircraft and flights a week, a length (months in the Career, days on the live clock), the charges, what
   the airline needs at our end (stands, gates, hangar space for aircraft staying days, cargo handling, fuel, room in
   the terminal), penalties for late and cancelled flights, and what it brings. An airline will not sign until the
   airport can carry the flights. Signed, the offer becomes a deal (S.av.deals): honoured, it ends with reputation
   gained and an offer to renew; broken (by the airline when the airport lets it down, or by the player), it costs
   reputation and money. Reputation (ap.rep, 0–100) decides how often new offers come. */
IC.DEAL = {
  days: { flag: 3, budget: 2, regional: 3, cargo: 3, foreign: 3 },   // contract length on the live clock, game days
  months: { flag: 18, budget: 9, regional: 12, cargo: 12, foreign: 12 },   // in the Career, calendar months
  offerMo: [1, 2],  // Career: months between offers at a name of 50 (sooner with a better name)
  hangar: { flag: 0.25, budget: 0.15, regional: 0.2, cargo: 0, foreign: 0 },   // hangar spaces per aircraft based here
  gates: { flag: 0.6, foreign: 0.5, budget: 0, regional: 0, cargo: 0 },   // share of the stands it wants at the terminal
  lateMin: 20,      // an arrival or departure later than this counts against the deal
  strikes: 3,       // bad days before the airline walks out
  levels: [-0.1, 0, 0.1, 0.2],   // charges the player may ask for, against the airport's list charges
  fleet: { flag: 2, budget: 2, regional: 2, cargo: 1, foreign: 1 },   // aircraft in an offer, before trust adds more
  rep0: 50
};
const OPS_H = 17;   // airliners fly 06:00–23:00
/* a deal's length is counted in calendar months in the Career and in days on the live clock (a Quick war) */
const career = S => S.mode === 'story';
IC.dealUnit = S => career(S) ? IC.MO(S) : 86400;
IC.dealLen = (S, n) => career(S) ? (n >= 24 && n % 12 === 0 ? `${n / 12} years` : `${n} month${n === 1 ? '' : 's'}`) : `${n} day${n === 1 ? '' : 's'}`;
const dealOf = (S, tl) => tl && tl.deal ? S.av.deals.find(d => d.id === tl.deal) : null;
IC.avDealOf = dealOf;
/* a round trip from an airport: both legs and a turnaround at each end, in seconds */
const cycleOf = (S, a, b, T) => U.dist(a, endPt(S, b)) / T.cruise * 2 + T.turn * 2.5 + 1200;
/* what an airport provides to airlines: IC.aptProvides(ap) from the airport session (airport.js), in its field
   names; this stand-in, used only until that lands, measures the same way: stands by size (civil, cargo and light
   zones), gates (stands at a terminal), cargoStands, pax (terminal passengers an hour), cargo (cargo shed capacity),
   hangar (aircraft the hangars hold), fuelDeps (refuellings an hour) */
IC.aptProvides = IC.aptProvides || function (ap) {
  const st = ap.st || {}, P = { stands: { s: 0, m: 0, l: 0, xl: 0 }, gates: 0, remote: 0, cargoStands: 0, hangar: 0, pax: Math.round(st.pax || 0), cargo: Math.round(st.cargo || 0), fuelDeps: st.fuelDeps || 0, fuel: st.hydrant ? 'hydrant' : st.fuelCap ? 'trucks' : 'none' };
  // a gate: a stand passengers walk to from a terminal (within 60 m of one)
  const terms = ap.parts.filter(p => p.kind === 'terminal' && p.built && p.hp > p.max * 0.25);
  const nearT = s => terms.some(t => { const c = Math.cos(-t.a), n = Math.sin(-t.a), dx = s.x - t.x, dy = s.y - t.y, lx = dx * c - dy * n, ly = dx * n + dy * c; return Math.hypot(Math.max(0, Math.abs(lx) - t.w / 2), Math.max(0, Math.abs(ly) - t.h / 2)) < 0.6; });
  for (const s of standsOf(ap)) {
    if (s.linked === false || s.hp <= 0 || s.zone === 'mil') continue;
    P.stands[s.size] = (P.stands[s.size] || 0) + 1;
    if (s.zone === 'cargo' || s.cargo) P.cargoStands++; else if (s.contact || nearT(s)) P.gates++; else P.remote++;
  }
  for (const p of ap.parts) if (p.kind === 'hangar' && p.built && p.hp > p.max * 0.25 && p.linked !== false) P.hangar += IC.APART.hangar.holds;
  return P;
};
IC.CARGO_T = 8;   // tonnes a day a unit of cargo shed capacity handles: a 3 × 0.8 ha shed about 1,150 t, a freighter's four rotations a day
const SIZES = ['s', 'm', 'l', 'xl'];
/* stands of a size or larger */
const fitting = (st, size) => SIZES.slice(SIZES.indexOf(size)).reduce((n, k) => n + (st[k] || 0), 0);
/* what the flights at an airport need from it, with an offer added (extra: { al, type, n, b }), in the same names */
function aptNeeds(S, ap, extra) {
  const N = { stands: { s: 0, m: 0, l: 0, xl: 0 }, gates: 0, cargoStands: 0, hangar: 0, cargoT: 0, fuelDeps: 0, pax: 0 };
  const lf = IC.loadFactor(S, ap);
  const add = (al, type, n, far) => {
    const T = IC.ACTYPES[type], cyc = cycleOf(S, ap, far, T), K = IC.DEAL;
    const deps = n * (T.cargo ? 24 : OPS_H) * 3600 / cyc;
    // the busiest hour sees about twice the average; on the ground each aircraft spends its turnaround
    const onStand = Math.min(n, n * T.turn * 1.25 / cyc * 2.2) + 0.3;
    if (T.cargo) { N.cargoStands += onStand; N.cargoT += deps * T.cargo * 2; }
    else { N.stands[T.stand] += onStand; N.gates += onStand * (K.gates[al.kind] || 0); N.pax += deps / OPS_H * 2 * T.seats * lf * 1.6; }
    if (al.hub === ap.id) N.hangar += n * (K.hangar[al.kind] || 0);
    N.fuelDeps += deps / (T.cargo ? 24 : OPS_H) * 1.8;
  };
  for (const r of S.av.routes) {
    if (r.st !== 'active' || r.n <= 0) continue;
    const al = airlineOf(S, r.al);
    if (r.a === ap.id) add(al, r.type, r.n, r.b); else if (r.b.apt === ap.id) add(al, r.type, r.n, { apt: r.a });
  }
  if (extra) add(extra.al, extra.type, extra.n, extra.b);
  for (const k in N.stands) N.stands[k] = Math.ceil(N.stands[k] - 0.05);
  for (const k of ['gates', 'cargoStands', 'hangar']) N[k] = Math.ceil(N[k] - 0.05);
  return N;
}
IC.aptNeeds = aptNeeds;
/* the facilities an offer (or a signed deal: q.renew) asks of each of our airports on its route, met or not */
IC.dealNeeds = function (S, q) {
  const al = airlineOf(S, q.al), T = IC.ACTYPES[q.type], L = [];
  const ends = [[S.byId[q.a], q.b]].concat(q.b.apt ? [[S.byId[q.b.apt], { apt: q.a }]] : []);
  for (const [ap, far] of ends) {
    if (!ap) continue;
    const nm = ap.name.replace(/ (International|Airport)$/, '');
    const why = IC.aptCanTake(S, ap, T);
    L.push({ ap: ap.id, k: 'take', name: `${nm}: runway, fire cover, a stand`, ok: !why, text: why ? `${nm}: ${why}` : '' });
    if (why) continue;
    const P = IC.aptProvides(ap), N = aptNeeds(S, ap, q.renew ? null : { al, type: q.type, n: q.n, b: far });
    const row = (k, name, need, have, fix) => { if (need > 0) L.push({ ap: ap.id, k, name: `${nm}: ${name}`, need, have, ok: have >= need, text: have >= need ? '' : `${nm} needs ${fix} (${Math.floor(have)} of ${Math.ceil(need)})` }); };
    // (stands for airliners: the passenger stands of the size, not the cargo zone's)
    const paxStands = Math.max(0, fitting(P.stands, T.stand) - (P.cargoStands || 0));
    if (T.cargo) {
      // freighters park in the cargo zone, or on large passenger stands the wide-bodies leave free
      row('cargoStands', 'large stands for freighters', N.cargoStands, (P.cargoStands || 0) + Math.max(0, paxStands - fitting(N.stands, 'l')), 'more large stands, best in the cargo zone');
      row('cargoT', 'cargo handling, t a day', Math.round(N.cargoT), Math.round((P.cargo || 0) * IC.CARGO_T), 'more cargo terminal space');
    } else {
      row('stands', `${IC.STAND[T.stand].name}${T.stand === 'l' ? '' : ' or larger'} stands`, fitting(N.stands, T.stand), paxStands, `more ${IC.STAND[T.stand].name} stands`);
      if ((IC.DEAL.gates[al.kind] || 0) > 0) row('gates', 'stands at the terminal (gates)', N.gates, P.gates || 0, 'more stands beside a terminal');
      row('pax', 'terminal room, passengers an hour', Math.round(N.pax), Math.round(P.pax || 0), 'a bigger terminal');
    }
    if (al.hub === ap.id && (IC.DEAL.hangar[al.kind] || 0) > 0) row('hangar', 'hangar space for aircraft staying days', N.hangar, P.hangar || 0, 'hangar space for the aircraft based here');
    row('fuelDeps', 'refuellings an hour', Math.round(N.fuelDeps), Math.min(999, P.fuelDeps || 0), 'more fuel tanks, or a hydrant system');
  }
  return L;
};
/* what a deal is worth to us a day at a charge level, and what it brings */
function dealWorth(S, q, charge) {
  const T = IC.ACTYPES[q.type], a = S.byId[q.a], lf = IC.loadFactor(S, a);
  const cyc = cycleOf(S, a, q.b, T), deps = q.n * (T.cargo ? 24 : OPS_H) * 3600 / cyc;
  const ends = q.b.apt ? 2 : 1, flights = deps * 2 * ends;   // landings and departures at our airports
  const pax = T.seats ? deps * 2 * T.seats * lf : 0, cargo = (T.cargo || (q.type === 'wide' ? 15 : 0)) * deps * 2;
  return { perWk: Math.round(deps * 7), paxDay: Math.round(pax), cargoDay: Math.round(cargo), value: (T.fee * 0.5 * flights / 2 + pax * 0.0035 * ends + cargo * 0.008 * IC.cargoLoad(S, a)) * charge };
}
/* the terms of an offer: what the airline proposes, and how far it will bend */
function makeTerms(S, q) {
  const al = airlineOf(S, q.al), a = S.byId[q.a], list = a.feeLevel || 1, rep = a.rep == null ? IC.DEAL.rep0 : a.rep;
  // how much it wants in: seats running full, and our name
  const want = U.clamp(0.02 + 0.15 * U.clamp(IC.demandPull(S, a) - 0.7, 0, 1) + (rep - 50) / 250 + (al.sat - 60) / 400, 0, 0.25);
  const T = IC.ACTYPES[q.type];
  q.terms = { list, days: (career(S) ? IC.DEAL.months : IC.DEAL.days)[al.kind] || (career(S) ? 12 : 4), flex: want, excl: !T.cargo && !al.K.foreign && Math.random() < 0.35,
    late: +(T.fee * 0.25).toFixed(2), cancel: +(T.fee * 1.2 + (T.seats || 0) * 0.004).toFixed(2), rep: al.kind === 'flag' || al.K.foreign ? 5 : 3 };
  q.pick = { lvl: 1, excl: false };
  q.value = dealWorth(S, q, list).value;
}
/* the terms at the level the player picked: charges, length, worth, and whether the airline accepts */
IC.dealTerms = function (S, q, lvl, excl) {
  const t = q.terms; if (!t) return null;
  const i = lvl == null ? q.pick.lvl : lvl, x = excl == null ? q.pick.excl : excl, d = IC.DEAL.levels[i];
  const charge = t.list * (1 + d) * (x ? 1.08 : 1);
  const days = Math.max(1, Math.round(t.days * (1 - 2.5 * d) * (x ? 1.25 : 1)));
  const w = dealWorth(S, q, charge);
  const over = d + (x ? 0.08 : 0) - t.flex - (x ? 0.08 : 0) * (t.excl ? 1 : 0);
  const why = x && !t.excl ? 'it has not asked for the route to itself' : over > 0.001 ? `it will not pay more than ${U.pct(1 + t.flex)} of your list charges` : '';
  return Object.assign(w, { charge, days, ok: !why, why, lvl: i, excl: x });
};
IC.avNegotiate = function (S, id, lvl, excl) {
  const q = S.av.requests.find(x => x.id === id); if (!q || !q.terms) return false;
  if (lvl != null) q.pick.lvl = U.clamp(lvl | 0, 0, IC.DEAL.levels.length - 1);
  if (excl != null) q.pick.excl = !!excl;
  return true;
};
/* sign: the route opens (or grows) and the deal starts; grace = seconds before its facilities are checked */
function signDeal(S, q, route, tails, grace) {
  const A = S.av, al = airlineOf(S, q.al), k = q.terms ? IC.dealTerms(S, q) : { charge: S.byId[q.a].feeLevel || 1, days: 4, perWk: 0, paxDay: 0, cargoDay: 0, value: q.value || 0, excl: false };
  const old = q.renew && A.deals.find(d => d.id === q.renew);
  // renewed before its end: the term just served counts as honoured, and the new one starts clean
  if (old && old.st === 'active') honour(S, old);
  if (old) { old.strikes = 0; old.t0 = S.time; }
  const d = old || { id: IC.nid('dl'), al: al.id, route: route.id, a: q.a, b: q.b, type: q.type, n: q.n, t0: S.time, strikes: 0, good: 0, late: 0, cancel: 0, flown: 0, day: { late: 0, cancel: 0, n: 0 }, paid: 0 };
  Object.assign(d, { charge: k.charge, days: k.days, end: S.time + k.days * IC.dealUnit(S), excl: k.excl, perWk: k.perWk, paxDay: k.paxDay, cargoDay: k.cargoDay, value: k.value,
    pen: q.terms ? { late: q.terms.late, cancel: q.terms.cancel } : { late: 0.3, cancel: 1.5 }, rep: q.terms ? q.terms.rep : 3, st: 'active', grace: S.time + (grace || 0), renewAsked: false, badT: 0 });
  if (!old) { A.deals.push(d); for (const t of tails) t.deal = d.id; }
  return d;
}
IC.avSignDeal = signDeal;
/* rows of the day's movements at an airport, by hour, for the timeline */
function dayLog(S, ap) {
  const day = Math.floor(S.time / 86400);
  const L = ap.dayLog = ap.dayLog || { day, arr: new Array(24).fill(0), dep: new Array(24).fill(0), fee: 0, stand: {}, prev: null };
  if (L.day !== day) { L.prev = L.day === day - 1 ? { arr: L.arr, dep: L.dep, fee: L.fee, stand: L.stand } : null; L.day = day; L.arr = new Array(24).fill(0); L.dep = new Array(24).fill(0); L.fee = 0; L.stand = {}; }
  return L;
}
IC.aptDayLog = dayLog;
IC.on((S, type, d) => {
  if (type !== 'rwMove' || !d.ap || d.ap.kind !== 'airport' || !d.type || IC.ACTYPES[d.type].mil) return;
  const L = dayLog(S, d.ap), h = Math.floor(hourOf(S) / 3600);
  if (d.k === 'arr' || d.k === 'dep') L[d.k][h]++;
});
/* a flight flown under a deal: late or cancelled counts against it, and costs us the penalty */
function dealMark(S, tl, o) {
  const d = dealOf(S, tl); if (!d || d.st !== 'active') return;
  d.day.n++; d.flown++;
  let pen = 0;
  if (o.divert) { d.cancel++; d.day.cancel++; pen = d.pen.cancel; }
  else if ((o.wait || 0) > IC.DEAL.lateMin * 60) { d.late++; d.day.late++; pen = d.pen.late; }
  if (pen > 0) { IC.pay(S, 'penalty', pen); d.paid += pen; }
}
const repOf = ap => ap.rep == null ? IC.DEAL.rep0 : ap.rep;
IC.aptRep = repOf;
// a good name is slow to build and quick to lose: gains shrink as it rises, losses do not
function repAdd(S, ap, v) { if (ap && ap.kind === 'airport') ap.rep = U.clamp(repOf(ap) + (v > 0 ? v * (1 - repOf(ap) / 100) * 2 : v), 0, 100); }
/* the aircraft of a deal leave (it ended or broke): its tails retire, the route shrinks or closes */
function retireDeal(S, d) {
  const r = S.av.routes.find(x => x.id === d.route);
  const tl = S.av.tails.filter(t => t.deal === d.id && t.where !== 'lost');
  for (const t of tl) {
    if (t.where === 'away' || t.where === 'stand') { t.where = 'lost'; t.retired = true; if (t.stand && t.at) { const s = standById(S.byId[t.at], t.stand); if (s && s.occ === t.id) s.occ = null; } if (r) r.n = Math.max(0, r.n - 1); }
    else t.leaving = true;   // in the air or taxiing: it goes when it lands
  }
  if (r && r.n <= 0 && !tl.some(t => t.leaving)) r.st = 'cut';
}
/* a deal ends badly: who broke it, and why */
IC.avBreakDeal = function (S, id, why, byUs) {
  const A = S.av, d = A.deals.find(x => x.id === id); if (!d || d.st !== 'active') return false;
  const al = airlineOf(S, d.al), ap = S.byId[d.a], r = A.routes.find(x => x.id === d.route);
  d.st = 'broken'; d.endT = S.time; d.why = why;
  // either way we pay: a walk-out claims compensation, a cancellation by us the rest of the contract
  const left = Math.max(0, d.end - S.time) / 86400, comp = byUs ? d.value * left * 0.3 + 5 : d.value * 0.5 + 5;
  IC.pay(S, 'penalty', comp); d.paid += comp;
  repAdd(S, ap, byUs ? -8 : -12); if (d.b.apt) repAdd(S, S.byId[d.b.apt], byUs ? -4 : -6);
  al.sat = Math.max(0, al.sat - (byUs ? 20 : 12));
  retireDeal(S, d);
  A.requests = A.requests.filter(q => q.renew !== d.id);
  IC.log(S, 'leak', 'AVIATION', byUs ? `You ended ${al.name}'s deal for ${r ? routeName(S, r) : 'its route'}: ${U.money(comp)} in compensation, and the airlines have noticed.` : `${al.name} has walked out of its deal for ${r ? routeName(S, r) : 'its route'}: ${why}. We pay ${U.money(comp)} in compensation, and our name suffers.`, ap);
  IC.news(S, `${al.name} ${byUs ? 'loses its contract at' : 'pulls out of'} ${ap.name}${byUs ? '' : `, citing ${why}`}.`);
  IC.emit(S, 'dealBroken', { d, al, byUs, why });
  return true;
};
/* the hourly look at every deal: facilities still there, bad days, the end of the term and renewal */
function dealsTick(S) {
  const A = S.av;
  for (const d of A.deals) {
    if (d.st !== 'active') continue;
    const al = airlineOf(S, d.al);
    if (!al) { d.st = 'done'; continue; }
    // the facilities it signed for: a day's grace to put right what is lost (the airline says so), then it walks out
    if (S.time > d.grace) {
      const miss = IC.dealNeeds(S, Object.assign({ renew: d.id }, d)).filter(x => !x.ok && x.k !== 'pax' && x.k !== 'fuelDeps');
      if (miss.length) {
        if (!d.badT) { d.badT = S.time; IC.log(S, 'warn', 'AVIATION', `${al.name}: ${miss[0].text}. Put it right within 12 hours or it ends the deal.`, S.byId[miss[0].ap]); IC.emit(S, 'dealWarn', { d, al, text: miss[0].text }); }
        else if (S.time - d.badT > 12 * 3600) { IC.avBreakDeal(S, d.id, miss[0].text.replace(/^[^:]*needs/, 'the airport lacks')); continue; }
      } else d.badT = 0;
    }
    // the end of the term: an honoured deal lifts our name; the airline offers to renew before it runs out
    const left = d.end - S.time;
    if (!d.renewAsked && left < d.days * IC.dealUnit(S) * 0.3) {
      d.renewAsked = true;
      if (al.sat >= 45 && S.story) renewOffer(S, d, al);
      else if (al.sat >= 45) { d.end += d.days * IC.dealUnit(S); d.renewAsked = false; }
    }
    if (left <= 0) {
      d.st = 'done'; d.endT = S.time;
      honour(S, d);
      if (!A.requests.some(q => q.renew === d.id)) { retireDeal(S, d); IC.log(S, 'info', 'AVIATION', `${al.name}'s aircraft on ${routeName(S, A.routes.find(x => x.id === d.route))} leave: the deal was not renewed.`, S.byId[d.a]); }
    }
  }
  // tails of an ended deal that were flying when it ended leave when they are back at a stand
  for (const t of A.tails) if (t.leaving && (t.where === 'stand' || t.where === 'away')) { const r = routeOf(S, t); t.where = 'lost'; t.retired = true; t.leaving = false; if (t.stand && t.at) { const s = standById(S.byId[t.at], t.stand); if (s && s.occ === t.id) s.occ = null; } if (r) { r.n = Math.max(0, r.n - 1); if (r.n <= 0) r.st = 'cut'; } }
}
/* the day's report card: too many late or cancelled flights is a strike; three and the airline walks out */
function dealsDay(S) {
  for (const d of S.av.deals) {
    if (d.st !== 'active') continue;
    const D = d.day, bad = D.late + D.cancel * 2, al = airlineOf(S, d.al);
    d.day = { late: 0, cancel: 0, n: 0 };
    // (a deal that runs for years forgives a bad day after a month of good ones)
    if (!D.n || bad < Math.max(3, D.n * 0.25)) { if (career(S) && d.strikes && ++d.good >= IC.dpm(S)) { d.strikes--; d.good = 0; } continue; }
    d.good = 0;
    d.strikes++;
    repAdd(S, S.byId[d.a], -2);
    if (d.strikes >= IC.DEAL.strikes) { IC.avBreakDeal(S, d.id, `${D.late} late and ${D.cancel} cancelled of ${D.n} flights yesterday, the ${d.strikes}th bad day`); continue; }
    IC.log(S, 'warn', 'AVIATION', `${al.name} has written: ${D.late} of ${D.n} flights late and ${D.cancel} cancelled yesterday. ${IC.DEAL.strikes - d.strikes} more bad day${IC.DEAL.strikes - d.strikes > 1 ? 's' : ''} and it ends the deal.`, S.byId[d.a]);
    IC.emit(S, 'dealStrike', { d, al });
  }
}
/* a term served to its end: our name rises, more if every day went well */
function honour(S, d) {
  const al = airlineOf(S, d.al), clean = d.strikes === 0, v = d.rep / 2 + (clean ? 1 : 0);
  repAdd(S, S.byId[d.a], v); if (d.b.apt) repAdd(S, S.byId[d.b.apt], v / 2);
  d.honoured = (d.honoured || 0) + 1; if (clean) d.clean = (d.clean || 0) + 1;
  IC.log(S, 'info', 'AVIATION', `${al.name}'s deal for ${routeName(S, S.av.routes.find(x => x.id === d.route))} has run its term${clean ? ', every day on time' : ''}. Our name rises.`, S.byId[d.a]);
  IC.emit(S, 'dealDone', { d, al });
}
function renewOffer(S, d, al) {
  const q = { id: IC.nid('rq'), al: al.id, a: d.a, b: d.b, type: d.type, n: d.n, t: S.time, exp: d.end, renew: d.id, why: `wants to renew its deal for ${routeName(S, S.av.routes.find(x => x.id === d.route))}` };
  makeTerms(S, q);
  S.av.requests.push(q);
  IC.log(S, 'info', 'AVIATION', `${al.name} ${q.why}. Its offer is in the Aviation room.`, S.byId[d.a]);
  IC.emit(S, 'request', q);
}
/* how long until the next offer: slower in the Career's first act, quicker the better our name */
function offerGap(S) {
  const A = S.av;
  if (!career(S) || !S.story) return U.rand(2.5, 5) * 3600;
  // the Career: an offer every month or two, by the calendar
  const aps = IC.bases(S).filter(x => x.kind === 'airport' && x.owner === 'us');
  const rep = aps.length ? Math.max(...aps.map(repOf)) : IC.DEAL.rep0;
  return IC.MO(S, U.rand(IC.DEAL.offerMo[0], IC.DEAL.offerMo[1])) * U.clamp(1.6 - rep / 90, 0.6, 1.3) * (S.story.act === 1 ? 1 : 0.8);
}


})(window.IC);
