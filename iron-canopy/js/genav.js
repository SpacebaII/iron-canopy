/* Iron Canopy — general aviation at our airports (wave 14). Light aircraft, business jets and helicopters used to
   touch an airport only in the abstract: they held the runway for a while and vanished. Now, where the airport has
   somewhere for them (stands in the light-aircraft zone, a helipad), they are aircraft like the airliners: they land
   through the tower, taxi to a stand, stay, and taxi out again. Some are based here: the town's clubs, owners and
   schools fly circuits, local flights and trips by day and are all home by dusk; the helicopters (medical, police,
   pleasure flights) fly from the pad at any hour. A general aviation terminal brings the business jets and charges
   for handling. With nowhere to park, light aircraft still land and are towed off at once, holding the runway as
   before. Headless: drawing is in render-airport.js and civil.js's apronLife. */
(function (IC) {
'use strict';
const U = IC.U;

/* the parts */
IC.APART.helipad = { name: 'Helipad', w: 0.3, h: 0.3, cost: 6, build: 300, hp: 20, desc: 'A 30 m pad with its circle and H. Helicopters fly straight to it and lift off from it, never using the runway. One helicopter is based on each pad.' };
IC.APART.gaterm = { name: 'General aviation terminal', w: 0.45, h: 0.24, cost: 25, build: 600, hp: 30, desc: 'A small terminal for private pilots and business jets, with its own lounge and customs. Business jets come to an airport that has one, and light aircraft pay for handling.' };
for (const k of ['helipad', 'gaterm']) if (!IC.APART_ORDER.includes(k)) IC.APART_ORDER.push(k);

/* how many are based here, how long visitors stay, what they pay */
IC.GAV = {
  basedPer: 0.6,       // based aircraft for each light-aircraft stand (the rest are left for visitors)
  basedMax: 24,
  heliPer: 1,          // based helicopters per helipad
  idle: [1200, 5400],  // seconds a based aircraft stands between flights by day
  visit: [3600, 4 * 3600],
  handling: 0.03,      // ₭M a visit with a general aviation terminal
  near: 60,            // units out (6 km) a light aircraft joins the circuit, or a helicopter starts down to its pad
  holdMax: 1200        // seconds in the circuit before it gives up and is towed off the runway as before
};
const HELI_ROLE = [['medical', 'Air ambulance', 'MED'], ['police', 'Police helicopter', 'POL'], ['tour', 'Pleasure flights', 'TUR']];

const day = S => { const h = ((S.time % 86400) + 86400) % 86400 / 3600; return h >= 7 && h < 19; };
const G = S => S.gav || (S.gav = { craft: [], t: 0 });
const ours = ap => ap && ap.kind === 'airport' && ap.owner === 'us' && !ap.offline && ap.parts;
/* stands in the light-aircraft zone that the taxiways reach */
IC.gavStands = ap => IC.aptStands(ap).filter(s => s.zone === 'light' && s.linked !== false && s.hp > 0);
IC.gavPads = ap => ap.parts.filter(p => p.kind === 'helipad' && p.built && p.hp > p.max * 0.25);
const standOf = (ap, id) => IC.aptStands(ap).find(s => s.id === id);
const craftOf = (S, id) => G(S).craft.find(c => c.id === id);
/* a free stand for it: its own if it is based here (kept while it flies), else one nobody based here calls home */
function freeStand(S, ap, T, me) {
  const res = new Set();
  for (const c of G(S).craft) if (c.ap === ap.id && c !== me) { if (c.stand) res.add(c.stand); if (c.own) res.add(c.own); }
  const ok = s => !s.occ && !res.has(s.id) && IC.STAND_FITS[s.size].includes(T.stand);
  const own = me && me.own && IC.gavStands(ap).find(s => s.id === me.own);
  return own && ok(own) ? own : IC.gavStands(ap).find(ok) || null;
}
function freePad(S, ap) {
  const res = new Set(G(S).craft.filter(c => c.ap === ap.id && c.pad).map(c => c.pad));
  return IC.gavPads(ap).find(p => !res.has(p.id)) || null;
}
const reg = S => `${S.world.names.H.slice(0, 1)}-${String.fromCharCode(65 + U.randi(0, 25))}${String.fromCharCode(65 + U.randi(0, 25))}${U.randi(10, 99)}`;
const hash = cs => { let h = 7; for (const c of cs || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
function make(S, o) {
  const c = Object.assign({ id: IC.nid('gv'), ap: null, type: 'light', cs: '', liv: null, kind: 'based', role: null, where: 'stand', stand: null, own: null, pad: null, t: 0, home: null, trip: null, track: null, why: null, n: 0 }, o);
  c.liv = c.liv || IC.gaLivery(hash(c.cs));
  G(S).craft.push(c);
  return c;
}
const drop = (S, c) => { const g = G(S); g.craft = g.craft.filter(x => x !== c); };

/* ---------- the step ---------- */
IC.genav = function (S, dt) {
  const g = G(S);
  if ((g.t -= dt) <= 0) { g.t = 300; for (const ap of IC.bases(S)) if (ours(ap)) populate(S, ap); }
  const open = S.airspace === 'open' && !(S.enemy && S.enemy.war);
  for (const c of g.craft.slice()) {
    if (c.where !== 'stand' && c.where !== 'pad' && c.where !== 'away') continue;
    if ((c.t -= dt) > 0) continue;
    const ap = S.byId[c.ap];
    if (c.where === 'away') { if (!ap || !ours(ap)) { drop(S, c); continue; } comeBack(S, c, ap); continue; }
    if (!ap || !ours(ap)) { drop(S, c); continue; }
    if (!open) { c.t = 1800; c.why = 'the airspace is closed to light aircraft'; continue; }
    leave(S, c, ap);
  }
};

/* based aircraft come with the stands and pads: as many as the airport has room for, a few left for visitors */
function populate(S, ap) {
  const g = G(S), here = g.craft.filter(c => c.ap === ap.id && c.kind === 'based');
  // (a stand or pad that is gone takes its aircraft with it)
  for (const c of here) if ((c.own && !standOf(ap, c.own)) || (c.where === 'stand' && c.stand && !standOf(ap, c.stand)) || (c.where === 'pad' && !IC.gavPads(ap).some(p => p.id === c.pad))) drop(S, c);
  // (one whose flight ended some other way: shot down, or its track lost)
  for (const c of g.craft.filter(x => x.ap === ap.id && x.where === 'air')) if (!S.threats.some(t => t.id === c.track && !t.dead)) drop(S, c);
  const st = IC.gavStands(ap), fixed = here.filter(c => !IC.ACTYPES[c.type].vtol).length, helis = here.filter(c => IC.ACTYPES[c.type].vtol).length;
  const want = Math.min(IC.GAV.basedMax, Math.floor(st.length * IC.GAV.basedPer));
  for (let i = fixed; i < want; i++) {
    const type = U.wpick(IC.GA_MIX.filter(([k]) => !IC.ACTYPES[k].vtol && k !== 'glider' && k !== 'micro')), T = IC.ACTYPES[type], s = freeStand(S, ap, T);
    if (!s) break;
    s.occ = 'gv';
    const c = make(S, { ap: ap.id, type, cs: reg(S), kind: 'based', where: 'stand', stand: s.id, own: s.id, t: U.rand(...IC.GAV.idle) });
    s.occ = c.id;
  }
  const pads = IC.gavPads(ap);
  for (let i = helis; i < pads.length * IC.GAV.heliPer; i++) {
    const p = freePad(S, ap); if (!p) break;
    const R = HELI_ROLE[(helis + i) % HELI_ROLE.length];
    make(S, { ap: ap.id, type: R[0] === 'tour' ? 'helil' : 'helim', cs: `${R[2]} ${U.randi(1, 9)}${U.randi(0, 9)}`, kind: 'based', role: R[0], where: 'pad', pad: p.id, t: U.rand(600, 3600) });
  }
}

/* ---------- leaving ---------- */
/* what a based aircraft does next: circuits, a local flight out and back, or a trip away for a few hours; at dusk it
   stays home. A helicopter flies to a town and back (the air ambulance at any hour) */
function leave(S, c, ap) {
  const T = IC.ACTYPES[c.type], heli = T.vtol;
  const night = !day(S), wxOk = IC.gaWeatherOk(S);
  if (c.kind === 'based' && !(heli && c.role === 'medical') && (night || !wxOk)) { c.t = night ? 1800 : 900; c.why = night ? 'home for the night' : 'the weather is not good enough to fly by sight'; return; }
  if (c.kind === 'based' && heli && c.role === 'medical' && Math.random() < 0.6) { c.t = U.rand(1800, 5400); return; }
  const from = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id };
  let to = from, trip;
  c.trip = null;
  if (c.kind !== 'based') { to = c.home || farPoint(S, ap, 800, 1600); trip = 'home'; }
  else if (heli) { const town = U.pick(S.world.cities.filter(t => t.owner !== 'enemy' && U.dist(t, ap) < 1500 && U.dist(t, ap) > 100)); trip = 'town'; c.trip = town ? { x: town.x, y: town.y, name: town.name } : farPoint(S, ap, 200, 500); }
  else { const r = Math.random(); trip = r < 0.4 ? 'circuit' : r < 0.75 ? 'local' : 'away'; if (trip === 'away') c.trip = farPoint(S, ap, 500, 1200); }
  c.tripK = trip;
  if (heli) return liftOff(S, c, ap, to);
  const s = standOf(ap, c.stand);
  if (!s) { drop(S, c); return; }
  const m = IC.gopsDepart(S, ap, { type: c.type, node: s.drive && IC.aptGraph(ap).N.has(s.id + 'o') ? s.id + 'o' : s.id, stand: s, startT: 0, who: c.cs, livery: c.liv,
    onAir: IC.hfn('gavAir', S, c.id, to), onDead: IC.hfn('gavLost', S, c.id) });
  if (!m) { const W = IC.gopsDepartWhy(S, ap, c.type, s.id); c.t = 900; c.why = W.why; return; }
  c.where = 'dep'; c.why = null; c.stand = null;
}
function farPoint(S, ap, d0, d1) {
  for (let i = 0; i < 20; i++) { const a = Math.random() * 6.283, d = U.rand(d0, d1), p = { x: ap.x + Math.cos(a) * d, y: ap.y + Math.sin(a) * d }; if (IC.inHome(p.x, p.y)) return Object.assign(p, { name: 'the countryside' }); }
  return { x: ap.x + d0, y: ap.y, name: 'the countryside' };
}
/* the aircraft lifts off: from here on it is a light aircraft in the air like any other (civil.js flies it) */
IC.H.gavAir = (S, id, to) => m => {
  const c = craftOf(S, id); if (!c) return;
  const ap = S.byId[c.ap], from = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id };
  pay(S, c, ap);
  fly(S, c, ap, { x: m.x, y: m.y }, from, to, m.h);
};
IC.H.gavLost = (S, id) => () => { const c = craftOf(S, id); if (c) drop(S, c); };
function liftOff(S, c, ap, to) {
  // (a based helicopter keeps its pad while it flies; a visitor gives it up)
  const p = ap.parts.find(q => q.id === c.pad);
  if (c.kind !== 'based') c.pad = null;
  pay(S, c, ap);
  fly(S, c, ap, p || ap, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, to, null);
}
function fly(S, c, ap, at, from, to, h) {
  const T = IC.ACTYPES[c.type], k = c.tripK;
  let pts, o = { type: c.type, cs: c.cs, livery: c.liv, xpdr: true, fpl: k !== 'circuit' };
  if (k === 'circuit') pts = [at].concat(circuitPts(ap, at, 2 + U.randi(0, 2)));
  else if (k === 'home' || k === 'away' || k === 'town') { const dst = k === 'home' ? to : c.trip; pts = [at].concat(IC.gaPath(S, at, dst, [ap.id], false).slice(1)); if (k === 'town') pts = pts.concat(IC.gaPath(S, dst, ap, [ap.id], false).slice(1)); }
  else { const tp = farPoint(S, ap, 150, 350); pts = [at].concat(IC.gaPath(S, at, tp, [ap.id], false).slice(1), IC.gaPath(S, tp, ap, [ap.id], false).slice(1)); }
  const home = k === 'home' || k === 'away' ? (k === 'home' ? to : c.trip) : from;
  const t = IC.gaLaunch(S, { x: at.x, y: at.y, name: ap.name }, home, Object.assign(o, { pts }));
  t.alt = T.vtol ? 0.02 : 0.15; if (h != null) t.h = h;
  if (k === 'home') { drop(S, c); return t; }
  if (k === 'away') { c.where = 'gone'; t.gav = c.id; t.gavAway = true; return t; }
  c.where = 'air'; c.track = t.id; t.gav = c.id;
  return t;
}
/* circuits round the runway the aircraft took off from: up the runway, crosswind, downwind, base, final */
function circuitPts(ap, at, laps) {
  const rw = ap.parts.filter(p => p.kind === 'runway' && p.built).sort((a, b) => U.dist(a.a, at) + U.dist(a.b, at) - U.dist(b.a, at) - U.dist(b.b, at))[0];
  const ang = rw ? Math.atan2(rw.b.y - rw.a.y, rw.b.x - rw.a.x) : ap.rwyA || 0, mid = rw ? IC.rwAt(rw, 0.5) : ap;
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, P = (u, n) => ({ x: mid.x + ux * u + nx * n, y: mid.y + uy * u + ny * n }), out = [];
  for (let i = 0; i < laps; i++) out.push(P(24, 0), P(30, -9), P(10, -13), P(-18, -13), P(-30, -7), P(-24, 0), P(0, 0));
  return out;
}
function pay(S, c, ap) {
  const T = IC.ACTYPES[c.type], term = ap.parts.some(p => p.kind === 'gaterm' && p.built);
  const v = (T.fee || 0.03) * 0.5 * (ap.feeLevel || 1) + (term && c.kind !== 'based' ? IC.GAV.handling : 0);
  S.budget += v; IC.econBook && IC.econBook(S, 'apt', v);
  ap.gavLog = (ap.gavLog || []).filter(x => S.time - x < 86400); ap.gavLog.push(S.time);
}

/* a based aircraft back from its trip: it flies in from where it went */
function comeBack(S, c, ap) {
  const p = c.trip || farPoint(S, ap, 500, 1200);
  c.where = 'air';
  const t = IC.gaLaunch(S, p, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, { type: c.type, cs: c.cs, livery: c.liv, xpdr: true, fpl: true, progress: 0.02 });
  t.gav = c.id; c.track = t.id;
}

/* ---------- coming in ----------
   Called by civil.js for a light aircraft bound for one of our airports. Returns true while this file flies it:
   a helicopter straight down to a free pad; anything else round to the approach fix and through the tower to a
   light-aircraft stand. False leaves it to the old way (it lands, is towed off, and the runway is held). */
IC.gavInbound = function (S, t, dt) {
  if (t.gavNo) return false;
  // (a based aircraft away on a trip lands somewhere else: it is gone for a few hours, then comes back)
  if (t.gavAway) { const fin = t.wps[t.wps.length - 1]; if (U.dxy(t.x, t.y, fin.x, fin.y) < 3) { const c = craftOf(S, t.gav); if (c) { c.where = 'away'; c.t = U.rand(3600, 3 * 3600); } t.dead = true; return true; } return false; }
  const b = t.gaTo, ap = b && b.apt && S.byId[b.apt];
  if (!ours(ap)) return false;
  if (t.gav && !craftOf(S, t.gav)) t.gav = null;
  const d = U.dist(t, ap);
  // (circuits and local flights come back over the field: they are inbound for the last of their points only)
  if (t.wps && t.wps.length > 1) return false;
  if (d > IC.GAV.near && !t.gavIn) return false;
  const T = IC.ACTYPES[t.acType || 'light'];
  return T.vtol ? toPad(S, t, ap, T, dt) : toStand(S, t, ap, T, dt);
};
function craftFor(S, t, ap) {
  let c = t.gav && craftOf(S, t.gav);
  if (!c) { const f = t.gaFrom; c = make(S, { ap: ap.id, type: t.acType || 'light', cs: t.cs, liv: t.livery, kind: t.biz ? 'biz' : 'visit', where: 'air', home: f && f.apt !== ap.id ? { x: f.x, y: f.y, name: f.name } : null }); t.gav = c.id; }
  c.ap = ap.id; c.track = t.id;
  return c;
}
function toPad(S, t, ap, T, dt) {
  let c = t.gav && craftOf(S, t.gav);
  let p = c && c.pad && ap.parts.find(q => q.id === c.pad);
  if (!p) { p = freePad(S, ap); if (!p) { if (c) drop(S, c); t.gav = null; t.gavNo = true; return false; } c = craftFor(S, t, ap); c.pad = p.id; }
  t.gavIn = true;
  const d = U.dist(t, p), a = Math.atan2(p.y - t.y, p.x - t.x), spd = Math.min(T.cruise, 0.04 + d * 0.025);
  t.vx = Math.cos(a) * spd; t.vy = Math.sin(a) * spd; t.spd = spd;
  t.alt += U.clamp(Math.min(t.gaAlt || 0.6, 0.02 + d / 40) - t.alt, -0.006 * dt, 0.004 * dt);
  if (d < spd * dt + 0.05 && t.alt < 0.05) { c.where = 'pad'; c.track = null; c.t = stay(S, c); c.n++; t.dead = true; landed(S, c, ap); return true; }
  t.x += t.vx * dt; t.y += t.vy * dt;
  return true;
}
function toStand(S, t, ap, T, dt) {
  let c = t.gav && craftOf(S, t.gav);
  let s = c && c.stand && standOf(ap, c.stand);
  if (!s) { s = freeStand(S, ap, T, c); if (!s) { t.gavNo = true; return false; } c = craftFor(S, t, ap); c.stand = s.id; }
  t.gavIn = true;
  if (!t.faf || S.time - (t.fafT || 0) > 600) { t.faf = IC.gopsFaf(S, ap, c.type, t); t.fafT = S.time; }
  const f = t.faf;
  if (!f) { giveUp(S, t, c); return false; }
  const d = U.dxy(t.x, t.y, f.x, f.y);
  let to = f;
  if (d < 6) {
    if (S.time >= (t.nextTry || 0)) {
      t.nextTry = S.time + 5;
      const m = IC.gopsLand(S, ap, { type: c.type, target: s.id, stand: s, who: c.cs, livery: c.liv, faf: f,
        onPark: IC.hfn('gavParked', S, c.id), onDead: IC.hfn('gavLost', S, c.id), onGoAround: IC.hfn('gavRound', S, c.id) });
      if (m === 'divert') { giveUp(S, t, c); return false; }
      if (m !== 'hold') { s.occ = c.id; c.where = 'arr'; c.track = null; t.dead = true; return true; }
    }
    t.holdT = (t.holdT || 0) + dt;
    if (t.holdT > IC.GAV.holdMax) { giveUp(S, t, c); return false; }
    to = { x: f.x + Math.cos(S.time * 0.03) * 8, y: f.y + Math.sin(S.time * 0.03) * 8 };
  }
  const a = Math.atan2(to.y - t.y, to.x - t.x), spd = Math.max(0.35, Math.min(t.spd, T.cruise));
  t.vx = Math.cos(a) * spd; t.vy = Math.sin(a) * spd;
  t.alt += U.clamp(0.6 - t.alt, -0.004 * dt, 0.003 * dt);
  t.x += t.vx * dt; t.y += t.vy * dt;
  return true;
}
/* no stand or no runway after all: the old way, and the stand it had is free again */
function giveUp(S, t, c) {
  t.gavNo = true; t.gavIn = false; t.faf = null;
  if (c) { if (c.kind === 'based') { c.stand = null; drop(S, c); } else drop(S, c); }
  t.gav = null; t.wps = [{ x: t.gaTo.x, y: t.gaTo.y }]; t.dest = t.wps[0];
}
IC.H.gavParked = (S, id) => () => { const c = craftOf(S, id); if (!c) return; const ap = S.byId[c.ap]; c.where = 'stand'; c.t = stay(S, c); c.n++; landed(S, c, ap); };
IC.H.gavRound = (S, id) => m => {
  const c = craftOf(S, id); if (!c) return;
  const ap = S.byId[c.ap], s = standOf(ap, c.stand); if (s && s.occ === c.id) s.occ = null;
  const t = IC.gaLaunch(S, { x: m.x, y: m.y, name: ap.name }, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, { type: c.type, cs: c.cs, livery: c.liv, xpdr: true, pts: [{ x: m.x, y: m.y }].concat(circuitPts(ap, m, 1)) });
  t.alt = 0.3; t.gav = c.id; c.where = 'air'; c.track = t.id;
};
/* how long it stays: a based aircraft until its next flight, a visitor an hour or few, a business jet a working day */
function stay(S, c) {
  if (c.kind === 'based') return U.rand(...IC.GAV.idle);
  if (c.kind === 'biz') return U.rand(3, 14) * 3600;
  return U.rand(...IC.GAV.visit);
}
function landed(S, c, ap) {
  ap.gavLog = (ap.gavLog || []).filter(x => S.time - x < 86400); ap.gavLog.push(S.time);
  if (c.kind === 'based' && c.tripK === 'circuit') c.t = Math.min(c.t, U.rand(600, 1800));
  IC.emit(S, 'gavLanded', { ap, c });
}

/* ---------- for panels and the map ---------- */
/* what is parked here and where: [type, livery, x, y, heading, craft] */
IC.gavParked = function (S, ap) {
  const out = [];
  for (const c of G(S).craft) {
    if (c.ap !== ap.id) continue;
    if (c.where === 'stand' && c.stand) { const s = standOf(ap, c.stand); if (s) out.push([c.type, c.liv, s.x, s.y, s.a, c]); }
    else if (c.where === 'pad' && c.pad) { const p = ap.parts.find(q => q.id === c.pad); if (p) out.push([c.type, c.liv, p.x, p.y, (p.a || 0) + 0.6, c]); }
  }
  return out;
};
/* in a line for the airport's panel: based aircraft, visitors, movements today */
IC.gavSummary = function (S, ap) {
  const L = G(S).craft.filter(c => c.ap === ap.id), based = L.filter(c => c.kind === 'based'), here = L.filter(c => c.kind !== 'based' && (c.where === 'stand' || c.where === 'pad'));
  const moves = (ap.gavLog || []).filter(x => S.time - x < 86400).length;
  return { based: based.length, helis: based.filter(c => IC.ACTYPES[c.type].vtol).length, visitors: here.length, moves, stands: IC.gavStands(ap).length, pads: IC.gavPads(ap).length };
};
/* a stand or pad's own line: who is on it and when it leaves */
IC.gavOn = function (S, ap, id) {
  const c = G(S).craft.find(x => x.ap === ap.id && (x.stand === id || x.pad === id) && (x.where === 'stand' || x.where === 'pad'));
  if (!c) return '';
  const T = IC.ACTYPES[c.type], who = c.kind === 'based' ? (c.role ? HELI_ROLE.find(r => r[0] === c.role)[1] : 'based here') : c.kind === 'biz' ? 'business jet visiting' : 'visiting';
  return `${c.cs}, ${T.name.toLowerCase()} (${who})${c.why ? `: ${c.why}` : `, leaves in ${U.dur(Math.max(0, c.t))}`}.`;
};
})(window.IC);
