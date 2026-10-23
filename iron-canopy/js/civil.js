/* Iron Canopy — civilian life: a busy sky of airliners on filed routes, light aircraft (some without
   transponders), the enemy's own civil traffic along the border, air raid alerts, morale. Road and rail traffic is in traffic.js.
   The point: not every track on the radar is hostile, and the enemy can hide among them. */
(function (IC) {
'use strict';
const U = IC.U;
const octal = () => { let s = ''; for (let i = 0; i < 4; i++) s += U.randi(0, 7); return s === '7000' || s === '7500' || s === '7700' ? '4' + s.slice(1) : s; };
IC.squawk = octal;

IC.civilInit = function (S) {
  S.civT = 60; S.gaT = 120;
  // the GA ramps' based aircraft, tied down (garamp.js)
  IC.gaInit(S);
  // the sky is already busy when the game starts
  for (let i = 0; i < 20; i++) scheduleFlight(S, Math.random());
  for (let i = 0; i < 7; i++) scheduleGA(S, Math.random());
  // business jets already parked at the big airports; the first rare visitor comes within a day or two
  S.biz = { parked: [], t: 1800 };
  S.rare = { next: S.time + U.rand(0.4, 1.4) * 86400, seen: [] };
  for (const ap of bizAirports(S)) for (let i = 0, n = U.randi(2, 4); i < n; i++) {
    const type = IC.BIZ_MIX[U.randi(0, IC.BIZ_MIX.length - 1)][0], s = IC.gaFreeSpot(ap, IC.ACTYPES[type]);
    // (on the GA ramp's small stands where there is one)
    if (s) IC.gaPark(S, ap, s, { type, biz: 1, until: S.time + U.rand(3, 30) * 3600 }); else S.biz.parked.push(bizStay(S, ap, type));
  }
};
/* ---------- airliners ---------- */
function minBorderDist(a, b) {
  let m = 1e9;
  // every 20 km along the way
  const n = Math.max(12, Math.ceil(U.dist(a, b) / 200));
  for (let i = 0; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (IC.inHome(x, y)) m = Math.min(m, IC.hostileBorderDist(x, y)); }
  return m;
}
function allowed(S, w) {
  const touchesHome = w.kind === 'dom' || w.kind === 'intl' || w.a.k === 'H' || w.b.k === 'H' || crossesHome(w);
  if (w.kind === 'hostile') return true;
  if (!touchesHome) return true;
  if (S.airspace === 'closed') return false;
  if (S.airspace === 'restricted') { if (w._safe == null) w._safe = minBorderDist(w.a, w.b) > 1800; return w._safe; }
  return true;
}
function crossesHome(w) { if (w._home == null) { w._home = false; const n = Math.max(12, Math.ceil(U.dist(w.a, w.b) / 200)); for (let i = 1; i < n; i++) if (IC.inHome(w.a.x + (w.b.x - w.a.x) * i / n, w.a.y + (w.b.y - w.a.y) * i / n)) { w._home = true; break; } } return w._home; }
IC.crossesHome = crossesHome;

function scheduleFlight(S, progress) {
  const W = S.world;
  const war = S.enemy && S.enemy.war;
  // our own airports' traffic is flown by the airlines (aviation.js); this is everyone else's
  const opts = W.airways.filter(w => allowed(S, w) && !(war && w.kind === 'hostile' && Math.random() < 0.5) && !(S.av && (w.a.k === 'H' || w.b.k === 'H')));
  if (!opts.length) return;
  const w = U.wpick(opts.map(x => [x, { over: 0.3, intl: 0.28, dom: 0.15, long: 0.14, hostile: 0.22 }[x.kind] || 0.1]));
  const fwd = Math.random() < 0.5, a = fwd ? w.a : w.b, b = fwd ? w.b : w.a;
  const air = w.kind === 'hostile' ? (W.names[a.k] || 'XX').slice(0, 3).toUpperCase() : U.pick(IC.NAMES.airline);
  const cs = `${air} ${U.randi(100, 989)}`;
  const f = progress || 0;
  const path = S.av && crossesHome(w) ? IC.avPath(S, a, b) : { pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] };
  const P = path.pts, at = IC.pathAt(P, f);
  const onGround = !a.edge && f < 0.02, cruise = IC.aspLevel(11, a, b);
  IC.spawnThreat(S, 'civ', at.x, at.y, { dest: at.ahead[0], wps: at.ahead, orig: a, cs, sq: octal(), plan: { a, b, cs, pts: P }, pax: U.randi(80, 290), alt: onGround ? 0.3 : cruise, cruise, net: !!path.net, route: [b], aim: b, dist0: U.dist(a, b), airway: w, hostileCiv: w.kind === 'hostile' });
  if (S.av && crossesHome(w) && w.kind !== 'hostile') IC.avOverflight(S, path.net);
}
/* ---------- light aircraft: slow, low, by sight, from grass fields and big airports alike ---------- */
function scheduleGA(S, progress) {
  const W = S.world;
  if (S.airspace === 'closed' || !IC.gaWeatherOk(S)) return;
  if (S.airspace === 'restricted' || (S.enemy && S.enemy.war)) { if (Math.random() < 0.6) return; }
  // pilots live in towns and fly from the nearest field; with no field near, from the airport
  const towns = W.cities.filter(c => c.owner !== 'enemy' && IC.inHome(c.x, c.y)).concat(W.villages.filter(v => v.home));
  const a = U.wpick(towns.map(t => [IC.gaBase(S, t), Math.sqrt(t.pop || 20)]).filter(p => p[0]));
  if (!a) return;
  const type = gaType(a);
  // from an airport with a GA ramp: one of its based aircraft, taxiing out (garamp.js); none free, nobody flies
  const ap0 = a.apt && !progress && S.byId[a.apt];
  if (ap0 && IC.gaRamp(ap0)) return groundGA(S, ap0, a);
  // from a field, some local flights fly circuits round it; a glider goes up behind a tug
  if (a.field && type === 'glider') { const tug = IC.gaLaunch(S, a, a, { progress, type: 'taildrag', alt: 0.7 }); return tug && IC.gaLaunch(S, a, a, { progress, type, tow: tug.id, alt: 1.1, xpdr: false }); }
  if (a.field && Math.random() < 0.3) return IC.gaLaunch(S, a, a, { progress, type: T_CIRCUIT.includes(type) ? type : 'light', circuit: 2 + U.randi(0, 2) });
  let b;
  if (Math.random() < 0.35) b = a; // a local flight: out and back
  else {
    const ends = S.asp.fields.map(f => ({ x: f.x, y: f.y, name: f.name, field: f.id })).concat(IC.bases(S).filter(x => x.kind === 'airport' && x.owner === 'us' && !x.offline).map(x => ({ x: x.x, y: x.y, name: x.name, apt: x.id })));
    const near = ends.filter(e => e.name !== a.name && U.dist(e, a) > 250 && U.dist(e, a) < 1800);
    b = near.length ? U.pick(near) : a;
  }
  return IC.gaLaunch(S, a, b, { progress, type, careless: Math.random() < 0.12 });
}
/* a based aircraft at an airport sets off: a local flight out and back, or to a field or airport 25–180 km away */
function groundGA(S, ap, a) {
  const r = U.pick(IC.gaIdle(S, ap)); if (!r) return null;
  let b = a;
  if (Math.random() >= 0.4) {
    const ends = S.asp.fields.map(f => ({ x: f.x, y: f.y, name: f.name, field: f.id })).concat(IC.bases(S).filter(x => x.kind === 'airport' && x.owner === 'us' && !x.offline && x !== ap).map(x => ({ x: x.x, y: x.y, name: x.name, apt: x.id })));
    const near = ends.filter(e => U.dist(e, a) > 250 && U.dist(e, a) < 1800);
    if (near.length) b = U.pick(near);
  }
  return IC.gaDepart(S, r, b, { careless: Math.random() < 0.12 });
}
/* which light aircraft: clubs fly trainers and tourers most, then private singles and twins, helicopters, working
   aircraft, aerobatics; gliders and microlights only from grass fields */
const GA_MIX = [['light', 30], ['tourer', 22], ['retract', 9], ['twin', 7], ['taildrag', 5], ['utility', 5], ['helil', 7], ['helim', 3], ['micro', 5], ['glider', 6]];
const T_CIRCUIT = ['light', 'tourer', 'taildrag', 'micro'];
const gaType = from => U.wpick(GA_MIX.filter(([k]) => from.field || (k !== 'glider' && k !== 'micro')));
IC.GA_MIX = GA_MIX;
/* a registration's number, for its paint */
const csHash = cs => { let h = 7; for (const c of cs || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
/* a circuit round a field: up the runway, across, back along the downwind leg, base and final, `laps` times */
function circuit(S, a, laps) {
  const f = a.field && S.asp.fields.find(x => x.id === a.field), ang = f ? f.a + (IC.fieldDir(S, f) < 0 ? Math.PI : 0) : 0, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const P = (u, n) => ({ x: a.x + ux * u + nx * n, y: a.y + uy * u + ny * n }), out = [{ x: a.x, y: a.y }];
  for (let i = 0; i < laps; i++) out.push(P(14, 0), P(20, -8), P(8, -12), P(-12, -12), P(-20, -6), P(-14, 0), { x: a.x, y: a.y });
  return out;
}
/* one light aircraft from a to b (the same place: a local flight out and back). Careless pilots fly straight */
IC.gaLaunch = function (S, a, b, o) {
  const W = S.world, careless = !!o.careless, cleared = [a.apt, b.apt].concat(o.cleared || []).filter(Boolean);
  const type = o.type || 'light', T = IC.ACTYPES[type];
  let pts;
  if (o.pts) pts = o.pts;
  else if (o.circuit) pts = circuit(S, a, o.circuit);
  else if (b === a) {
    const ang = Math.random() * 6.283, d = U.rand(150, 350), tp = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
    pts = IC.gaPath(S, a, tp, cleared, careless).concat(IC.gaPath(S, tp, a, cleared, careless).slice(1));
  } else pts = IC.gaPath(S, a, b, cleared, careless);
  const f = o.progress || 0, at = IC.pathAt(pts, f);
  const xpdr = o.xpdr != null ? o.xpdr : Math.random() < 0.8;
  const cs = o.cs || `${W.names.H.slice(0, 1)}-${String.fromCharCode(65 + U.randi(0, 25))}${String.fromCharCode(65 + U.randi(0, 25))}${U.randi(10, 99)}`;
  const want = o.alt || (T.vtol || type === 'micro' ? U.rand(0.3, 0.6) : o.circuit ? 0.3 : T.alt > 4 ? T.alt : U.rand(0.6, 1.8));
  const t = IC.spawnThreat(S, 'ga', at.x, at.y, { dest: at.ahead[0], wps: at.ahead, orig: { x: a.x, y: a.y, name: a.name }, gaFrom: a, gaTo: b, cleared, careless, fpl: o.fpl != null ? o.fpl : Math.random() < 0.5,
    cs, sq: xpdr ? '7000' : null, pax: U.randi(1, 4),
    alt: f ? Math.min(want, U.rand(0.6, 1.8)) : 0.15, gaAlt: want, route: [b], aim: b, dist0: U.dist(a, b) });
  // its type, speed and paint: light aircraft white with stripes, the rare visitors in their own
  t.acType = type; t.spd = o.spd || (o.type ? T.cruise : t.spd); t.livery = o.livery !== undefined ? o.livery : IC.gaLivery(csHash(cs));
  if (T.alt > 4) { t.climbK = 5; t.glide = 19; }   // jets climb and come down faster, on a 3° slope
  for (const k of ['circuit', 'tow', 'form', 'biz', 'visit']) if (o[k]) t[k] = o[k];
  if (o.spot != null) t.fldSpot = o.spot;
  if (f) t.alt = Math.min(t.alt, IC.gaCeiling(S, t));
  if (!f && a.apt && !o.ground) IC.gaRunway(S, S.byId[a.apt]);
  if (!f && a.field && !o.tow && !T.vtol) fieldOut(S, t, fieldOf(S, a.field));
  return t;
};
IC.moveCivil = function (S, t, dt) {
  if (t.tail) return IC.moveTail(S, t, dt);
  if (t.phold) { IC.atcPlayerHold(S, t, dt); return; }
  // intermediate route points (around prohibited zones)
  if (t.wps && t.wps.length > 1 && U.dxy(t.x, t.y, t.dest.x, t.dest.y) < t.spd * dt + 3) { t.wps.shift(); t.dest = t.wps[0]; }
  const d = t.dest, dx = d.x - t.x, dy = d.y - t.y, L = Math.hypot(dx, dy);
  if (t.aspDzT > 0) { t.aspDzT -= dt; if (t.aspDzT <= 0) t.aspDz = 0; }
  if (t.vector != null && (t.vectorT -= dt) <= 0) t.vector = null;
  t.dzNow = (t.dzNow || 0) + U.clamp((t.aspDz || 0) - (t.dzNow || 0), -0.01 * dt, 0.01 * dt);
  if (t.type === 'ga') {
    // coming in to an airport with a GA ramp: its approach, or handed to the ground (garamp.js)
    if (t.gaTo && t.gaTo.apt && IC.gaInbound(S, t, dt)) return;
    // a glider behind its tug until it lets go; a display team's wingmen in their places off the leader
    if ((t.tow || t.form) && follow(S, t)) return;
    // (brief 62) on the ground at a club field, or on its approach and landing run (a touch-and-go on a circuit)
    if (t.fld && fieldMove(S, t, dt)) return;
    if (t.gaTo && t.gaTo.field && !t.form && fieldIn(S, t, d)) return;
    // climb gently to its height, stay under terminal areas it is not cleared into, come down near the end
    const fin = t.wps ? t.wps[t.wps.length - 1] : d, left = U.dxy(t.x, t.y, fin.x, fin.y) + (t.wps && t.wps.length > 1 ? 50 : 0), k = t.climbK || 1;
    const want = Math.min(t.gaAlt || 1.2, IC.gaCeiling(S, t), 0.15 + left / (t.glide || 60));
    t.alt += U.clamp(want - t.alt, -0.004 * dt * k, 0.003 * dt * k);
    const a = t.vector != null ? t.vector : Math.atan2(dy, dx) + 0.2 * Math.sin(t.age * 0.01 + t.seed);
    t.vx = Math.cos(a) * t.spd; t.vy = Math.sin(a) * t.spd;
  } else {
    // the level controllers cleared it to (or the player gave it), else its cruise
    const fin = t.wps ? t.wps[t.wps.length - 1] : d, cr = (t.clr != null ? t.clr : t.cruise || 11) + (t.dzNow || 0);
    const flown = U.dxy(t.x, t.y, t.orig.x, t.orig.y);
    const climb = t.orig.edge ? cr : Math.min(cr, IC.aspClimbAt(flown));
    const desc = fin.edge ? cr : Math.min(cr, IC.aspDescent(U.dxy(t.x, t.y, fin.x, fin.y)));
    const want = Math.min(climb, desc);
    t.alt = Math.abs(want - t.alt) > 1 && t.age < 1 ? want : t.alt + U.clamp(want - t.alt, -0.02 * dt, 0.03 * dt);
    t.lvl = t.clr != null ? t.clr : t.cruise;
    const hd = t.vector != null ? t.vector : Math.atan2(dy, dx) + (t.drift || 0);
    t.vx = Math.cos(hd) * t.spd; t.vy = Math.sin(hd) * t.spd;
  }
  if (L <= t.spd * dt + 2 || t.x < -900 || t.y < -900 || t.x > IC.WW + 900 || t.y > IC.WH + 900) { if (t.type === 'ga' && L <= t.spd * dt + 2) { const heli = IC.gaHeliDown(S, t); IC.gaArrive(S, t, heli); if (!heli && (t.biz || t.visit)) landed(S, t); } t.dead = true; return; }
  t.x += t.vx * dt; t.y += t.vy * dt;
};
/* a towed glider or a wingman keeps its place off the aircraft it follows; a glider lets go after about seven
   minutes, a wingman lands when its leader does. Returns false once it flies on its own */
function follow(S, t) {
  const id = t.tow || t.form.lead;
  let L = t._lead;
  if (!L || L.id !== id) L = t._lead = S.threats.find(x => x.id === id) || null;
  if (L && !L.dead && !(t.tow && t.age > 420)) {
    const h = Math.atan2(L.vy, L.vx), dx = t.tow ? -0.6 : t.form.dx, dy = t.tow ? 0 : t.form.dy, c = Math.cos(h), s2 = Math.sin(h);
    t.x = L.x + dx * c - dy * s2; t.y = L.y + dx * s2 + dy * c; t.alt = L.alt; t.vx = L.vx; t.vy = L.vy; t.spd = L.spd;
    return true;
  }
  t._lead = null;
  if (t.form) { if (L && L.dead) landed(S, t); t.dead = true; return true; }
  // the glider is free: it glides round the field and back down
  t.tow = null; t.spd = IC.ACTYPES.glider.cruise; t.gaAlt = Math.min(t.alt, 1.2);
  return false;
}

/* ---------- business aviation: executive jets to and from the international airports, at all hours ---------- */
IC.BIZ_MIX = [['vlj', 3], ['bizjet', 4], ['bizlong', 2], ['bizprop', 2]];
const BIZ_CODES = ['XJT', 'SKX', 'LUX', 'ORX', 'AVX', 'JTX'];
const ih = (a, b) => Math.floor(U.hash(a | 0, b | 0) * 1e6);
const idNum = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
/* our airports with a terminal and a runway of 1,500 m or more */
function bizAirports(S) {
  return IC.bases(S).filter(ap => ap.kind === 'airport' && ap.owner === 'us' && !ap.offline && ap.parts && ap.parts.some(p => p.kind === 'terminal' && p.built) && ap.parts.some(p => p.kind === 'runway' && p.built && U.dist(p.a, p.b) >= 15));
}
IC.bizAirports = bizAirports;
function bizStay(S, ap, type, cs, liv) {
  cs = cs || `${U.pick(BIZ_CODES)} ${U.randi(10, 899)}`;
  return { ap: ap.id, type, cs, liv: liv || IC.gaLivery(csHash(cs)), until: S.time + U.rand(3, 30) * 3600 };
}
function bizTraffic(S, dt, war) {
  const B = S.biz;
  // parked jets leave when their passengers are done, for a foreign airport
  for (let i = B.parked.length - 1; i >= 0; i--) {
    const p = B.parked[i], ap = S.byId[p.ap];
    if (S.time < p.until) continue;
    B.parked.splice(i, 1);
    const port = U.pick(IC.avPorts(S));
    if (ap && port && S.airspace === 'open') IC.gaLaunch(S, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, { x: port.x, y: port.y, name: port.name }, { type: p.type, cs: p.cs, livery: p.liv, xpdr: true, fpl: true });
  }
  if ((B.t -= dt) > 0) return;
  const aps = bizAirports(S), h = ((S.time % 86400) + 86400) % 86400 / 3600;
  B.t = U.rand(1800, 5400) / Math.max(1, aps.length * 0.7);
  // odd hours: executives fly when their meetings end, late in the evening and through the night as much as by day
  if (war || S.airspace !== 'open' || !aps.length || Math.random() > (h >= 20 || h < 6 ? 1 : 0.55)) return;
  const ap = U.pick(aps), port = U.pick(IC.avPorts(S)); if (!port) return;
  const type = U.wpick(IC.BIZ_MIX), cs = `${U.pick(BIZ_CODES)} ${U.randi(10, 899)}`;
  IC.gaLaunch(S, { x: port.x, y: port.y, name: port.name }, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, { type, cs, xpdr: true, fpl: true, biz: 1 });
}
/* where business jets park: the light-aircraft apron if there is one, else the aprons away from the terminals'
   gates; free stands only (an airliner's stand is never taken) */
IC.bizStands = function (S, ap) {
  const out = [], ap2 = ap.parts.filter(p => p.kind === 'apron' && p.built && p.stands && p.stands.length);
  const light = ap2.filter(p => p.zone === 'light'), remote = ap2.filter(p => (p.zone || 'civil') === 'civil' && !p.stands.some(s => s.contact));
  for (const p of light.length ? light : remote) for (const s of p.stands) if (!s.occ && s.hp > 0) out.push(s);
  return out;
};
/* what stands on the business side of an airport: [model, livery, x, y, heading] for the visitor, the jets and the
   light aircraft of the towns that fly from here (two to a small stand) */
IC.apronLife = function (S, ap) {
  const out = []; if (!S.biz || !ap.parts) return out;
  // (brief 62) a GA ramp: what is really parked there, and the business terminal behind it
  const ramp = IC.gaRamp && IC.gaRamp(ap);
  // (with no ramp a visitor may stand on a remote airline stand: drawn as parked, the same way)
  if (ramp || (S.ga && S.ga.parked.some(r => r.ap === ap.id))) {
    const fbo = ramp && fboSpot(ap, ramp); if (fbo) out.push(fbo);
    const by = new Map((ramp || []).map(s => [s.id, s]));
    for (const r of S.ga.parked) {
      if (r.ap !== ap.id || r.away) continue;
      const pre = gaPre(ap, r); if (r.mv && !pre) continue;
      const s = by.get(r.sid) || IC.aptStands(ap).find(x => x.id === r.sid); if (!s) continue;
      // (tied down and covered for the night; by day a based aircraft not flown since yesterday keeps its cover; the
      // pilot pulls it off a minute after walking out)
      const cover = pre ? covered(S, r, r.dep) && S.time - r.dep < walkT(ap, r, s) + 60 : covered(S, r, S.time);
      // (the engine running: started up a little before it moves off, and winding down just after it stops)
      const run = (pre && S.time - r.dep > (r.pre || 0) - 30) || (!r.mv && r.arr && S.time - r.arr < 12);
      out.push([r.type, IC.gaLivery(r.n, cover), s.x, s.y, s.a, run ? 1 : 0]);
    }
  }
  if (ramp) {
    // (a rare visitor on a remote stand, as big as it needs)
    const H = S.rare && S.rare.here;
    if (H && H.ap === ap.id) { const T = IC.ACTYPES[H.type], L = IC.aptStands(ap).filter(x => (x.zone || 'civil') === 'civil' && !x.contact && !x.cargo && !x.occ && x.hp > 0), s = L.find(x => IC.STAND_FITS[x.size].includes(T.stand)) || L[0];
      if (s) for (let k = 0; k < (H.n || 1); k++) out.push([H.type, null, s.x + Math.cos(s.a + Math.PI / 2) * (H.n > 1 ? (k - 3) * 0.12 : 0), s.y + Math.sin(s.a + Math.PI / 2) * (H.n > 1 ? (k - 3) * 0.12 : 0), s.a]); }
    return out;
  }
  const stands = IC.bizStands(S, ap); if (!stands.length) return out;
  const fbo = fboSpot(ap, stands); if (fbo) out.push(fbo);
  const used = new Set(), H = S.rare && S.rare.here;
  if (H && H.ap === ap.id) {
    const T = IC.ACTYPES[H.type], fit = stands.filter(s => IC.STAND_FITS[s.size].includes(T.stand)).concat(stands);
    for (let k = 0; k < (H.n || 1); k++) {
      const s = H.n > 1 ? stands[Math.floor(k / 2)] : fit[0]; if (!s) break;
      used.add(s); const off = H.n > 1 ? (k % 2 ? 0.07 : -0.07) : 0;
      out.push([H.type, null, s.x + Math.cos(s.a + Math.PI / 2) * off, s.y + Math.sin(s.a + Math.PI / 2) * off, s.a]);
    }
  }
  const free = stands.filter(s => !used.has(s));
  let i = 0;
  for (const p of S.biz.parked) if (p.ap === ap.id && i < free.length) { const s = free[i++]; out.push([p.type, p.liv, s.x, s.y, s.a]); }
  const nGA = 2 + ih(idNum(ap.id), 3) % 5, day = gaDay(S);
  for (let k = 0; k < nGA && i < free.length; k += 2) {
    const s = free[i++];
    for (const sd of [-1, 1]) { const n = ih(idNum(ap.id), k * 2 + sd + 9), type = PARK_TYPES[n % PARK_TYPES.length], off = sd * 0.075; out.push([type, IC.gaLivery(n, !day || n % 3 === 0), s.x + Math.cos(s.a + Math.PI / 2) * off, s.y + Math.sin(s.a + Math.PI / 2) * off, s.a]); }
  }
  return out;
};

/* ---------- (brief 62) the GA ramp's people and vehicles, from what each aircraft on it did and when ---------- */
const covered = (S, r, t) => !r.biz && !IC.ACTYPES[r.type].vtol && (!gaDay(S, t) || (r.home && t - (r.arr || r.t0) > 14 * 3600 && r.n % 3 === 0));
/* in its preflight: the pilot is out, the engine not yet started (its move waits at the spot) */
function gaPre(ap, r) {
  if (r.mv === 'heli') return true;
  if (!r.mv) return false;
  const m = ap.moves.find(x => x.id === r.mv);
  return !!m && m.kind !== 'arr' && m.phase === 'start';
}
IC.gaPre = gaPre;
IC.gaWalkT = (ap, r, s) => walkT(ap, r, s);
/* the FBO's door, and the way a vehicle drives from it to a spot: out onto the ramp, down its middle lane, across */
function fboDoor(ap) {
  const ramp = IC.gaRamp(ap), f = ramp && fboSpot(ap, ramp); if (!f) return null;
  const p = ap.parts.find(q => q.fbo && q.built) || ap.parts.find(q => q.id === ramp[0].apron), c = { x: f[2], y: f[3] };
  // (the door: on the lane side of a terminal on the ramp, else towards the ramp)
  if (p.fbo) { const ux = Math.cos(p.a), uy = Math.sin(p.a), k = (c.x - p.x) * ux + (c.y - p.y) * uy, ax = p.x + ux * k, ay = p.y + uy * k, d = U.dxy(c.x, c.y, ax, ay) || 1; return { x: c.x + (ax - c.x) / d * 0.11, y: c.y + (ay - c.y) / d * 0.11, p, h: Math.atan2(ay - c.y, ax - c.x) }; }
  const d = U.dist(c, p) || 1;
  return { x: c.x + (p.x - c.x) / d * 0.12, y: c.y + (p.y - c.y) / d * 0.12, p, h: Math.atan2(p.y - c.y, p.x - c.x) };
}
const walkT = (ap, r, s) => { const D = fboDoor(ap); return D ? U.clamp(U.dist(D, s) / IC.GA.walk, 40, (r.pre || 400) * 0.45) : 60; };
function rampWay(D, s, spot) {
  const p = D.p, ux = Math.cos(p.a), uy = Math.sin(p.a), on = q => { const k = (q.x - p.x) * ux + (q.y - p.y) * uy; return { x: p.x + ux * k, y: p.y + uy * k }; };
  return IC.lifePath([D, on(D), on(s), spot]);
}
/* what is out on the ramp now: { key, liv, x, y, h, kind ('veh' | 'person' | 'marshal' | 'chock' | 'tie') } */
IC.gaScene = function (S, ap) {
  const out = [], ramp = S.ga && IC.gaRamp(ap); if (!ramp) return out;
  const D = fboDoor(ap); if (!D) return out;
  const now = S.time, by = new Map(ramp.map(s => [s.id, s])), V = {};
  const veh = (key, s, spot, h, ta, td) => { const path = rampWay(D, s, spot); if (IC.turnVehAt({ ta, td, lag: 0 }, path, now, V)) out.push({ key, x: V.x, y: V.y, h: V.moving ? V.h : h, kind: 'veh' }); };
  const walk = (s, from, to, k, n, liv) => { for (let i = 0; i < n; i++) { const w = U.clamp(k - i * 0.06, 0, 1); if (w <= 0 || w >= 1) continue; out.push({ key: 'person', liv, x: from.x + (to.x - from.x) * w + Math.cos(s.a) * i * 0.012, y: from.y + (to.y - from.y) * w + Math.sin(s.a) * i * 0.012, h: Math.atan2(to.y - from.y, to.x - from.x), kind: 'person' }); } };
  // a marshaller waves a visitor in to its spot
  for (const m of ap.moves) if (m.ga && m.kind === 'arr' && m.stand && (m.phase === 'taxi' || m.phase === 'parkin') && U.dist(m, m.stand) < 1.2) {
    const s = m.stand, T = IC.ACTYPES[m.type]; out.push({ key: 'person', liv: 'marshal', x: s.x + Math.cos(s.a) * (T.len * 0.5 + 0.08), y: s.y + Math.sin(s.a) * (T.len * 0.5 + 0.08), h: s.a + Math.PI, kind: 'marshal' });
  }
  for (const r of S.ga.parked) {
    if (r.ap !== ap.id || r.away) continue;
    const s = by.get(r.sid); if (!s) continue;
    const T = IC.ACTYPES[r.type], fx = Math.cos(s.a), fy = Math.sin(s.a), rx = -fy, ry = fx, L = T.len, W = T.span;
    const at = (f, q) => ({ x: s.x + fx * f + rx * q, y: s.y + fy * f + ry * q });
    const pre = gaPre(ap, r), e = now - (r.arr || -1e9), door = at(L * (r.biz ? 0.3 : 0.05), -(W * (r.biz ? 0.1 : 0.12) + 0.02)), np = 1 + r.n % 3 + (r.biz ? 1 + r.n % 4 : 0);
    if (r.mv && !pre) continue;
    // chocks at the main wheels until the pilot starts up, and the tie-down ropes once it is staying
    if (!T.vtol && !(pre && now - r.dep > r.pre - 40)) { out.push({ key: 'chock', x: at(-L * 0.05, 0).x, y: at(-L * 0.05, 0).y, h: s.a, w: W * (r.biz ? 0.16 : 0.13), kind: 'chock' }); }
    if (!T.vtol && !r.biz && !pre && e > 300) out.push({ key: 'tie', x: s.x, y: s.y, h: s.a, len: L, span: W, kind: 'tie' });
    const wk = walkT(ap, r, s);
    if (!pre && r.arr) {
      // in: a visitor's marshaller stays a moment; the pilot and passengers walk in to the FBO; the bowser comes
      if (!r.home && e < 45) out.push({ key: 'person', liv: 'marshal', x: at(L * 0.5 + 0.08, 0).x, y: at(L * 0.5 + 0.08, 0).y, h: s.a + Math.PI, kind: 'marshal' });
      if (e > 40 && e < 40 + wk + 30) walk(s, door, D, (e - 40) / wk, np, 'pax');
      const turbine = r.biz || r.type === 'helim' || r.type === 'utility';
      if (r.biz) {
        veh('car', s, at(L * 0.3, -W * 0.5 - 0.06), s.a, r.arr + 20, r.arr + 240);
        veh('gpu', s, at(L * 0.42, W * 0.12 + 0.04), s.a + Math.PI, r.arr + 30, r.arr + 900);
        veh('refueller', s, at(-L * 0.05, W * 0.45 + 0.08), s.a, r.arr + 900, r.arr + 1800);
      } else if (!r.home || r.n % 2) veh(turbine ? 'refueller' : 'bowser', s, at(-L * 0.02, W * 0.5 + 0.07), s.a + Math.PI, r.arr + 420, r.arr + 1020);
    }
    if (pre) {
      // out: the pilot (and passengers) walk out, the cover comes off, the walk round, then in and start-up
      const d = now - r.dep, P = r.pre;
      if (d < wk) walk(s, D, door, d / wk, r.biz ? 2 : 1, 'pilot');
      else if (!r.biz && d < P - 50) { const k = (d - wk) / Math.max(1, P - 50 - wk), a = -Math.PI / 2 - k * Math.PI * 2, rr = Math.max(L, W) * 0.62; out.push({ key: 'person', liv: 'pilot', x: s.x + (fx * Math.cos(a) * L * 0.6 + rx * Math.sin(a) * rr), y: s.y + (fy * Math.cos(a) * L * 0.6 + ry * Math.sin(a) * rr), h: a, kind: 'person' }); }
      if (!r.biz && np > 1 && d > P * 0.4 && d < P * 0.4 + wk) walk(s, D, door, (d - P * 0.4) / wk, np - 1, 'pax');
      if (r.biz) {
        veh('catering', s, at(-L * 0.15, W * 0.1 + 0.05), s.a + Math.PI / 2, r.dep - 60, r.dep + P * 0.5);
        veh('gpu', s, at(L * 0.42, W * 0.12 + 0.04), s.a + Math.PI, r.dep - 60, r.dep + P - 30);
        veh('car', s, at(L * 0.3, -W * 0.5 - 0.06), s.a, r.dep + P * 0.55, r.dep + P - 60);
      }
    }
  }
  return out;
};

/* the business terminal (FBO): a small building behind the middle of the business apron's back edge, where there is
   open ground for it */
const segDist = (x, y, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = U.clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1); return U.dxy(x, y, a.x + dx * t, a.y + dy * t); };
function fboSpot(ap, stands) {
  const p = ap.parts.find(q => q.id === stands[0].apron); if (!p) return null;
  // (a GA ramp laid out with its business terminal on its edge: brief 62)
  const fp = ap.parts.find(q => q.fbo && q.built && (q.zone === 'light' || q === p));
  if (fp) return ['fbo', null, fp.fbo.x, fp.fbo.y, fp.fbo.a];
  if (p.w == null || (p.stands || []).length < 3) return null;
  const ux = Math.cos(p.a), uy = Math.sin(p.a), nx = -uy, ny = ux, sg = Math.sign((stands[0].x - p.x) * nx + (stands[0].y - p.y) * ny) || 1;
  const d = p.h / 2 + 0.2, x = p.x + nx * sg * d + ux * (p.w / 2 - 0.35), y = p.y + ny * sg * d + uy * (p.w / 2 - 0.35);
  for (const q of ap.parts) {
    if (q === p) continue;
    const r = q.a && q.b && q.a.x != null ? segDist(x, y, q.a, q.b) - 0.25 : U.dxy(x, y, q.x, q.y) - Math.max(q.w || 0, q.h || 0) / 2;
    if (r < 0.25) return null;
  }
  return ['fbo', null, x, y, p.a + (sg > 0 ? 0 : Math.PI)];
}

/* ---------- a light-aircraft field on the ground: the club's aircraft in a row, covered and tied down, some out
   flying; the clubhouse, hangar and pump; a helicopter on its pad; the fuel bowser going from one to the next and
   pilots walking out. All from the field and the clock, nothing kept ---------- */
const PARK_TYPES = ['light', 'light', 'tourer', 'tourer', 'light', 'retract', 'twin', 'taildrag', 'tourer', 'utility', 'micro', 'glider', 'light', 'retract'];
const gaDay = (S, t) => { const h = (((t == null ? S.time : t) % 86400) + 86400) % 86400 / 3600; return h >= 7 && h < 19; };
/* items: { key, liv, x, y, h, cover, kind ('plane' | 'kit' | 'veh' | 'person'), tie } */
IC.fieldLife = function (S, f) {
  const out = [], seed = idNum(f.id), ux = Math.cos(f.a), uy = Math.sin(f.a), nx = -uy, ny = ux, day = gaDay(S);
  const at = (u, n) => ({ x: f.x + ux * u + nx * n, y: f.y + uy * u + ny * n });
  const kit = at(1.1, 0.62);
  out.push({ key: 'fieldkit', x: kit.x, y: kit.y, h: f.a, kind: 'kit' });
  // the club's aircraft: a row facing the strip, a second row behind for a big club; the ones out flying are gone
  const n = fieldSlots(f).length;
  let away = 0; for (const t of S.threats) if (!t.dead && t.type === 'ga' && t.gaFrom && t.gaFrom.field === f.id && !t.tow && t.fldSpot == null) away++;
  const hd = Math.atan2(-ny, -nx), slots = fieldSlots(f).map(q => at(q.u, q.n));
  for (let i = 0; i < n; i++) {
    if (i >= n - Math.min(away, n - 2)) break;
    const k = ih(seed, i + 3), type = PARK_TYPES[k % PARK_TYPES.length], cover = !day || k % 5 < 2, p = slots[i];
    out.push({ key: type, liv: IC.gaLivery(k, cover), x: p.x, y: p.y, h: hd + (type === 'glider' ? 0.25 : 0), kind: 'plane', cover, tie: cover });
  }
  // visitors at the end of the row for their stay, not covered
  for (const v of IC.fieldVisitors(S, f)) { const q = visSpot(f, v.k), p = at(q.u, q.n); out.push({ key: v.type, liv: v.liv, x: p.x, y: p.y, h: hd, kind: 'plane', cover: false, tie: true, vis: v }); }
  // the helicopter pad, with a helicopter on it unless it is flying
  const pad = at(-2.0, 0.72);
  out.push({ key: 'helipad', x: pad.x, y: pad.y, h: f.a, kind: 'kit' });
  if (!(day && ih(seed, Math.floor(S.time / 1800)) % 3 === 0)) out.push({ key: ih(seed, 2) % 2 ? 'helil' : 'helim', liv: IC.gaLivery(ih(seed, 5)), x: pad.x, y: pad.y, h: f.a + 0.6, kind: 'plane' });
  if (day) {
    // the bowser stops by one aircraft after another, a quarter of an hour at each
    const shown = out.filter(o => o.kind === 'plane' && !o.cover && o.key !== 'glider');
    if (shown.length) { const q = shown[Math.floor(S.time / 900) % shown.length]; out.push({ key: 'bowser', x: q.x + nx * 0.09 + ux * 0.05, y: q.y + ny * 0.09 + uy * 0.05, h: f.a + Math.PI / 2, kind: 'veh' }); }
    // pilots walk from the clubhouse out to an uncovered aircraft, a few minutes each way
    const club = at(1.16, 0.75);
    for (let j = 0; j < Math.min(3, shown.length); j++) {
      const cyc = 240 + j * 70, ph = ((S.time + j * 97) % cyc) / cyc, q = shown[(Math.floor((S.time + j * 97) / cyc) + j * 3) % shown.length], w = Math.min(1, ph * 1.6);
      const x = club.x + (q.x + nx * 0.03 - club.x) * w, y = club.y + (q.y + ny * 0.03 - club.y) * w;
      out.push({ key: 'person', liv: IC.gaLivery(j * 5 + 1), x: x + ux * j * 0.012, y: y + uy * j * 0.012, h: Math.atan2(q.y - club.y, q.x - club.x), kind: 'person', walk: w < 1 });
    }
  }
  return out;
};

/* the club's parking row: where each of its aircraft stands, along the strip ({ u, n } in the field's frame) */
function fieldSlots(f) {
  const n = 6 + ih(idNum(f.id), 1) % 8, out = [];
  for (let i = 0; i < n; i++) { const r = i < 8 ? 0 : 1, c = i < 8 ? i : i - 8; out.push({ u: -1.25 + c * 0.16 + r * 0.08, n: 0.6 + r * 0.2 }); }
  return out;
}

/* ---------- (brief 62) a club field's take-offs and landings: from the row along the grass to the strip, back down
   it to the end, a run-up, the take-off run; in, a final from 1.2 km out, the landing run, and back to the row.
   On a circuit each pass but the last is a touch-and-go. Into the wind, both ways ---------- */
IC.FIELD = { taxi: 0.06, accel: 0.018, decel: 0.03, fin: 12, td: 3.8, line: 4.2, glide: 0.15 };
const fieldOf = (S, id) => S.asp && S.asp.fields.find(x => x.id === id);
IC.fieldDir = (S, f) => (S.wind && S.wind.kt > 2 ? Math.cos(S.wind.dir - f.a) : 1) >= 0 ? 1 : -1;
const fAt = (f, u, n) => ({ x: f.x + Math.cos(f.a) * u - Math.sin(f.a) * n, y: f.y + Math.sin(f.a) * u + Math.cos(f.a) * n });
const vLiftOf = T => U.clamp(T.cruise * 0.5, 0.18, 0.34);
/* the slot in the row that the aircraft taking off (or coming back) leaves (or takes) */
function rowSlot(S, F, t) {
  const sl = fieldSlots(F); let away = 0;
  for (const x of S.threats) if (!x.dead && x.type === 'ga' && x.gaFrom && x.gaFrom.field === F.id && !x.tow && x.fldSpot == null) away++;
  const home = t.gaFrom && t.gaFrom.field === F.id;
  if (t.fldSpot != null) return visSpot(F, t.fldSpot);
  return home ? sl[U.clamp(sl.length - away, 0, sl.length - 1)] : visSpot(F, t.fld && t.fld.vs != null ? t.fld.vs : 0);
}
/* a visitor's place at the end of the club's row, and how long it stays: an hour or four, then home again */
const VIS_N = 3;
const visSpot = (F, k) => { const sl = fieldSlots(F); return { u: sl[0].u - 0.18 - k * 0.16, n: sl[0].n }; };
function visFree(S, F) {
  const L = S.ga && S.ga.fieldVis || [], used = new Set(L.filter(v => v.f === F.id).map(v => v.k));
  for (const x of S.threats) if (!x.dead && x.fld && x.fld.f === F.id && x.fld.vs != null) used.add(x.fld.vs);
  for (let k = 0; k < VIS_N; k++) if (!used.has(k)) return k;
  return null;
}
function fieldStay(S, F, t, k) {
  if (!S.ga || !t.gaFrom || t.circuit) return;
  const L = S.ga.fieldVis = S.ga.fieldVis || [];
  L.push({ f: F.id, k, type: t.acType, cs: t.cs, liv: t.livery, n: csHash(t.cs || ''), from: t.gaFrom, arr: S.time, until: S.time + U.rand(1, 4) * 3600 });
}
IC.fieldVisitors = (S, F) => (S.ga && S.ga.fieldVis || []).filter(v => v.f === F.id);
/* a visitor whose stay is up flies home, from its place on the row, when light aircraft fly */
IC.fieldVisTick = function (S) {
  const L = S.ga && S.ga.fieldVis; if (!L || !L.length || S.airspace !== 'open' || !IC.gaWeatherOk(S)) return;
  for (const v of L.slice()) {
    if (S.time < v.until) continue;
    const F = fieldOf(S, v.f); S.ga.fieldVis = S.ga.fieldVis.filter(x => x !== v);
    if (!F || !v.from) continue;
    IC.gaLaunch(S, { x: F.x, y: F.y, name: F.name, field: F.id }, v.from, { type: v.type, cs: v.cs, livery: v.liv, spot: v.k });
  }
};
function fieldOut(S, t, F) {
  if (!F) return;
  const e = IC.fieldDir(S, F), q = rowSlot(S, F, t), K = IC.FIELD;
  const pts = [fAt(F, q.u, q.n), fAt(F, q.u, 0.45), fAt(F, 0, 0.45), fAt(F, 0, 0), fAt(F, -e * K.line, 0)];
  Object.assign(t, { x: pts[0].x, y: pts[0].y, alt: 0 });
  t.fld = { f: F.id, ph: 'taxi', pts, i: 1, e, v: 0, w: 0, tg: false };
}
/* coming in: once the field is the next point and within 4 km, the approach (true while it is being flown here) */
function fieldIn(S, t, d) {
  const F = fieldOf(S, t.gaTo.field), T = IC.ACTYPES[t.acType] || IC.ACTYPES.light; if (!F || T.vtol || t.tow) return false;
  if (U.dxy(d.x, d.y, F.x, F.y) > 0.5 || U.dxy(t.x, t.y, F.x, F.y) > 40) return false;
  const e = IC.fieldDir(S, F), K = IC.FIELD, u = (t.x - F.x) * Math.cos(F.a) + (t.y - F.y) * Math.sin(F.a), n = -(t.x - F.x) * Math.sin(F.a) + (t.y - F.y) * Math.cos(F.a);
  // (from the far side, a wide base leg first, so it does not turn onto final over the field)
  const pts = (u * e > -K.fin + 2 ? [fAt(F, -e * (K.fin + 4), (n >= 0 ? 1 : -1) * 7)] : []).concat([fAt(F, -e * K.fin, 0)]);
  t.fld = { f: F.id, ph: 'app', pts, i: 0, e, v: t.spd, w: 0, tg: !!(t.wps && t.wps.length > 1) };
  // (a visitor from elsewhere takes a place at the end of the row for its stay, if one is free)
  if (!t.fld.tg && !t.circuit && t.gaFrom && t.gaFrom.field !== F.id && S.ga) t.fld.vs = visFree(S, F);
  return fieldMove(S, t, 0);
}
/* one aircraft on the strip at a time: lined up, rolling, on final, landing, or taxiing along it */
function stripBusy(S, F, me) {
  for (const x of S.threats) {
    const G = x.fld; if (x === me || x.dead || !G || G.f !== F.id) continue;
    if (G.ph === 'line' || G.ph === 'roll' || G.ph === 'fin' || G.ph === 'land' || (G.ph === 'taxi' && G.i >= 3 && !G.hold) || (G.ph === 'in' && G.i === 0 && G.pts.length === 4)) return true;
  }
  return false;
}
IC.fieldStripBusy = (S, F) => stripBusy(S, F, null);
function fieldMove(S, t, dt) {
  const G = t.fld, F = fieldOf(S, G.f), K = IC.FIELD; if (!F) { t.fld = null; return false; }
  const T = IC.ACTYPES[t.acType] || IC.ACTYPES.light, h0 = F.a + (G.e < 0 ? Math.PI : 0), vl = vLiftOf(T);
  const go = (hd, v) => { t.vx = Math.cos(hd) * v; t.vy = Math.sin(hd) * v; t.x += t.vx * dt; t.y += t.vy * dt; };
  const toward = (q, v) => { const L = U.dxy(t.x, t.y, q.x, q.y); if (L <= v * dt + 1e-4) { t.x = q.x; t.y = q.y; return true; } go(Math.atan2(q.y - t.y, q.x - t.x), v); return false; };
  switch (G.ph) {
    case 'taxi': case 'in': {
      t.alt = 0;
      // (holding short of the strip, 45 m off it, until it is clear)
      if (G.ph === 'taxi' && G.i === 3 && U.dxy(t.x, t.y, G.pts[2].x, G.pts[2].y) < 1e-3 && stripBusy(S, F, t)) { t.vx = Math.cos(h0) * 1e-3; t.vy = Math.sin(h0) * 1e-3; G.hold = true; return true; }
      G.hold = false;
      if (toward(G.pts[G.i], K.taxi) && ++G.i >= G.pts.length) {
        if (G.ph === 'in') { IC.gaArrive(S, t, false); if (t.biz || t.visit) landed(S, t); else if (G.vs != null) fieldStay(S, F, t, G.vs); t.dead = true; return true; }
        // lined up at the end of the strip: a run-up for a piston engine, then the take-off run
        G.ph = 'line'; G.w = T.vtol || t.acType === 'glider' ? 3 : 25;
      }
      return true;
    }
    case 'line': t.alt = 0; t.vx = Math.cos(h0) * 1e-3; t.vy = Math.sin(h0) * 1e-3; if ((G.w -= dt) <= 0) { G.ph = 'roll'; G.v = 0; } return true;
    case 'roll':
      // the take-off run, and off at its lift-off speed (it climbs out as before)
      G.v += K.accel * dt; t.alt = 0; go(h0, G.v);
      if (G.v >= vl) { t.fld = null; t.alt = 0.002; }
      return true;
    case 'app': {
      t.alt += U.clamp(K.glide - t.alt, -0.006 * dt, 0.003 * dt);
      if (toward(G.pts[G.i], t.spd) && ++G.i >= G.pts.length) {
        // the strip taken: round again on a wide circuit, and ask again at the final fix
        if (stripBusy(S, F, t)) { const sd = G.side || (G.side = 1); G.pts = [fAt(F, -G.e * (K.fin + 4), sd * 7), fAt(F, G.e * 4, sd * 9), fAt(F, -G.e * (K.fin + 4), sd * 7), fAt(F, -G.e * K.fin, 0)]; G.i = 0; G.around = (G.around || 0) + 1; }
        else { G.ph = 'fin'; G.v = t.spd; }
      }
      return true;
    }
    case 'fin': {
      // down the final at about 5°, slowing to its approach speed, to touch down past the threshold
      const Th = fAt(F, -G.e * K.td, 0), Lf = U.dxy(t.x, t.y, Th.x, Th.y), va = vl * 1.15;
      G.v += U.clamp(va - G.v, -0.03 * dt, 0.03 * dt);
      t.alt += U.clamp(K.glide * U.clamp(Lf / (K.fin - K.td), 0, 1) - t.alt, -0.012 * dt, 0);
      if (toward(Th, G.v)) { G.ph = 'land'; t.alt = 0; }
      return true;
    }
    case 'land': {
      t.alt = 0;
      if (G.tg) {
        // a touch-and-go: a few seconds on the wheels, power on, and away on the next lap
        G.w += dt; go(h0, G.v);
        if (G.w > 4) { G.ph = 'roll'; G.v = Math.max(G.v * 0.8, vl * 0.7); if (t.wps && t.wps.length > 1) { t.wps.shift(); t.dest = t.wps[0]; } }
        return true;
      }
      G.v = Math.max(K.taxi, G.v - K.decel * dt); go(h0, G.v);
      if (G.v <= K.taxi) {
        // off the strip at the middle, and back to the row
        const q = rowSlot(S, F, t), u = (t.x - F.x) * Math.cos(F.a) + (t.y - F.y) * Math.sin(F.a);
        G.pts = (u * G.e < 0 ? [fAt(F, 0, 0)] : []).concat([fAt(F, 0, 0.45), fAt(F, q.u, 0.45), fAt(F, q.u, q.n)]); G.i = 0; G.ph = 'in';
      }
      return true;
    }
  }
  return false;
}

/* ---------- rare visitors: now and then something one of a kind comes to one of our airports for a few hours ---------- */
IC.RARE = {
  vintage: { w: 3, from: 'abroad', say: ap => `A vintage four-engine airliner is visiting ${ap} today, restored and on a tour; people will come out to watch.` },
  sst: { w: 1, from: 'abroad', say: ap => `A supersonic airliner is visiting ${ap} today on a charter. Over land it flies slower than sound.` },
  outsize: { w: 2, from: 'abroad', say: ap => `An outsize freighter is visiting ${ap} today, with a load too big for any other aircraft.` },
  airship: { w: 2, from: 'home', say: ap => `An airship is visiting ${ap} today on a sightseeing tour, at about 110 km/h.` },
  amphib: { w: 2, from: 'home', say: ap => `A firefighting amphibian is visiting ${ap} today, on its way to the forest fire season.` },
  display: { w: 2, from: 'home', say: ap => `The national display team is visiting ${ap} today: seven jets in formation, practising for an air show.` },
  state: { w: 1, from: 'abroad', say: ap => `A head of state is visiting ${ap} today, in a four-engine jet of their own.` }
};
function rareVisitors(S, war) {
  const R = S.rare, H = R.here;
  // the visitor leaves when its day is done
  if (H && S.time >= H.until) {
    R.here = null;
    const ap = S.byId[H.ap], port = U.pick(IC.avPorts(S));
    if (ap && port && S.airspace === 'open') rareFly(S, H.type, { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, H.type === 'display' || H.type === 'amphib' || H.type === 'airship' ? farTown(S, ap) : { x: port.x, y: port.y, name: port.name }, H.cs, null);
  }
  if (S.time < R.next || R.here || R.flying) return;
  R.next = S.time + U.rand(1.5, 3.5) * 86400;
  if (war || S.airspace !== 'open') return;
  const recent = R.seen.slice(-3), opts = Object.keys(IC.RARE).filter(k => !recent.includes(k));
  IC.rareVisit(S, U.wpick(opts.map(k => [k, IC.RARE[k].w])));
}
/* a visitor of a given type sets off for one of our airports with a runway long enough (null if there is none) */
IC.rareVisit = function (S, type, apId) {
  const R = S.rare, T = IC.ACTYPES[type];
  const aps = IC.bases(S).filter(ap => ap.kind === 'airport' && ap.owner === 'us' && !ap.offline && ap.parts && ap.parts.some(p => p.kind === 'runway' && p.built && U.dist(p.a, p.b) >= T.rwy));
  // one with a business side to park on, if there is one (the visitor stands there, not on an airline's stand)
  const withSide = aps.filter(a => IC.bizStands(S, a).length);
  const ap = (apId && S.byId[apId]) || U.pick(withSide.length ? withSide : aps); if (!ap) return null;
  const to = { x: ap.x, y: ap.y, name: ap.name, apt: ap.id }, port = U.pick(IC.avPorts(S));
  const from = IC.RARE[type].from === 'home' || !port ? farTown(S, ap) : { x: port.x, y: port.y, name: port.name };
  const cs = type === 'state' ? `${S.world.names.H.slice(0, 3).toUpperCase()} 1` : type === 'display' ? 'ARROWS' : IC.regOf(S.time | 0, 'K');
  const t = rareFly(S, type, from, to, cs, { type });
  R.seen.push(type); R.flying = t.id;
  const eta = U.dist(from, to) / t.spd;
  const say = IC.RARE[type].say(ap.name);
  IC.log(S, 'info', 'VISITOR', `${say} It lands in about ${U.dur(eta)}. Select it to follow it in the live view.`, t);
  IC.news(S, say.split(/[,:;.]/)[0] + '.');
  IC.emit(S, 'rareVisitor', { type, ap: ap.id, cs });
  return t;
};
/* one rare visitor in the air (a display team: the leader and six wingmen in an arrowhead) */
function rareFly(S, type, from, to, cs, visit) {
  const T = IC.ACTYPES[type], alt = type === 'airship' ? 0.4 : type === 'display' ? 1.2 : Math.min(T.alt, 6);
  const t = IC.gaLaunch(S, from, to, { type, cs, livery: null, xpdr: true, fpl: true, alt, visit, cleared: [to.apt].filter(Boolean) });
  if (type === 'display') for (let i = 1; i < 7; i++) { const r = Math.ceil(i / 2), sd = i % 2 ? 1 : -1; IC.gaLaunch(S, from, to, { type, cs: `${cs} ${i + 1}`, livery: null, xpdr: false, fpl: true, alt, form: { lead: t.id, dx: -0.22 * r, dy: sd * 0.2 * r } }); }
  return t;
}
/* a town some 300–900 km away, for visitors that come from inside the country */
function farTown(S, ap) {
  const L = IC.cities(S).filter(c => c.owner === 'us' && U.dist(c, ap) > 3000 && U.dist(c, ap) < 9000);
  const c = U.pick(L.length ? L : IC.cities(S).filter(c => c.owner === 'us')) || ap;
  return { x: c.x, y: c.y, name: c.name };
}
/* a business jet or a visitor on the ground: it parks on the business side (a visitor for a few hours) */
function landed(S, t) {
  const ap = t.gaTo && t.gaTo.apt && S.byId[t.gaTo.apt];
  if (!ap) { if (t.visit && S.rare && S.rare.flying === t.id) S.rare.flying = null; return; }
  if (t.biz) S.biz.parked.push(bizStay(S, ap, t.acType, t.cs, t.livery));
  if (t.visit && S.rare && S.rare.flying === t.id) {
    S.rare.flying = null;
    S.rare.here = { type: t.acType, ap: ap.id, cs: t.cs, until: S.time + U.rand(3, 8) * 3600, n: t.acType === 'display' ? 7 : 1 };
  }
}

function hostileNear(S, c) {
  for (const t of S.threats) {
    if (t.dead || !t.det || t.d.civil || t.border || t.decoyKnown) continue;
    if (t.aff !== 'H' && t.aff !== 'S') continue;
    if (t.type === 'isr' || (t.d.cls === 'air' && t.mission === 'patrol')) continue;
    const aim = t.aim || t.tgt;
    if (aim && U.dxy(aim.x, aim.y, c.x, c.y) < c.r + 500) return true;
    if (U.dist(t, c) < 1000) return true;
  }
  return false;
}

IC.civil = function (S, dt) {
  const war = S.enemy && S.enemy.war;
  // (flights stay longer over a larger country, so a few more at a time is about as many crossing an hour)
  const want = (S.airspace === 'closed' ? 7 : S.airspace === 'restricted' ? 14 : war ? 21 : 30) * (S.av ? 0.6 : 1);
  const n = S.threats.filter(t => t.type === 'civ' && !t.dead && !t.tail).length;
  S.civT -= dt;
  if (S.civT <= 0) { S.civT = n < want ? U.rand(40, 120) : U.rand(200, 500); scheduleFlight(S); }
  S.gaT -= dt;
  const ga = S.threats.filter(t => t.type === 'ga' && !t.dead).length;
  // more clubs, more light aircraft: about one in the air for every two fields
  const gaWant = war ? 2 : Math.min(20, 8 + Math.round(S.asp.fields.length * 0.5));
  if (S.gaT <= 0) { S.gaT = ga < gaWant ? U.rand(120, 320) : U.rand(600, 1200); scheduleGA(S); }
  if (S.biz) bizTraffic(S, dt, war);
  IC.gaTick(S, dt);
  if (S.ga && S.ga.fieldVis && S.ga.fieldVis.length) IC.fieldVisTick(S);
  if (S.rare) rareVisitors(S, war);
  // airspace closure: flights in our airspace divert out of it, by the nearest border crossing
  if (S.airspace === 'closed') for (const t of S.threats) if (t.d.civil && !t.dead && !t.hostileCiv && !t.diverted && IC.inHome(t.x, t.y)) { t.diverted = true; const xo = S.world.crossings.slice().sort((p, q) => U.dist(p, t) - U.dist(q, t))[0], out = xo ? xo.far : { x: 0, y: 0 }; t.dest = { x: out.x, y: out.y, name: 'diversion', edge: true }; t.route = [t.dest]; t.wps = [t.dest]; t.toApt = null; t.appr = false; t.plan = { a: { x: t.x, y: t.y }, b: t.dest, cs: t.cs, pts: [{ x: t.x, y: t.y }, t.dest] }; }
  S.alertT = (S.alertT || 0) - dt;
  if (S.alertT <= 0) {
    S.alertT = 30;
    let nA = 0;
    for (const c of IC.cities(S)) {
      if (c.owner !== 'us') continue;
      if (hostileNear(S, c)) {
        if (c.alert <= 0) {
          if (!c.lastAlertLog || S.time - c.lastAlertLog > 3600) {
            c.lastAlertLog = S.time;
            IC.log(S, 'warn', 'SIRENS', `Air raid alert in ${c.name}.`, c);
            if (c.pop > 300 || Math.random() < 0.4) IC.news(S, `Sirens sound across ${c.name}; residents head for shelters.`);
          }
          IC.sfx && IC.sfx.siren(c.x, c.y);
        }
        c.alert = 600;
      } else c.alert = Math.max(0, c.alert - 30);
      if (c.alert > 0) { nA++; c.morale = Math.max(0, c.morale - 0.004); c.prosp = Math.max(0.3, c.prosp - 0.0004); }
      else if (c.hp > c.max * 0.6) c.morale = Math.min(88, c.morale + 0.006);
    }
    S.alertCities = nA;
    if (S.mode !== 'academy' && !S.sbx && IC.nationalMorale(S) < 12) IC.gameOver(S, 'National morale has collapsed. The government has asked for terms.');
  }
};

})(window.IC);
