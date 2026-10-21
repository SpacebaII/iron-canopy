/* Iron Canopy — (brief 62) light aircraft and business jets on the ground at our airports. An airport with a GA ramp
   (an apron in the light-aircraft zone: tie-downs, and small stands for business jets) has its based aircraft tied
   down on their own spots and takes visitors for a few hours. They move like any other aircraft (groundops.js):
   start-up at the spot, taxi, a run-up at the holding point, take-off; on arrival the final, the landing, taxiing in
   to a free tie-down. Helicopters air-taxi straight from and to their spot. An airport with no GA ramp keeps the
   old way: light aircraft come and go over its middle and hold the runway by a timer (airspace.js IC.gaRunway).
   Headless; what the ramp's people and vehicles do is drawn from these records (civil.js IC.gaScene). */
(function (IC) {
'use strict';
const U = IC.U;

IC.GA = {
  based: 0.55,          // share of an airport's tie-downs its based aircraft take
  stay: [1, 5],         // a visitor stays this many hours
  preflight: [300, 540],// from the pilot walking out to start-up (s): the cover off, the walk round, the checks
  join: 90,             // an arrival asks for its approach this far out (9 km)
  walk: 0.012,          // people on the ramp walk 1.2 m/s
  lost: 4 * 3600        // a based aircraft not seen again in this long is home again by road (a diversion)
};
const BASED = ['light', 'light', 'tourer', 'tourer', 'light', 'retract', 'twin', 'taildrag', 'tourer', 'utility', 'helil', 'retract', 'light', 'helim'];
const idNum = id => { let h = 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

/* the airport's GA ramp: its linked, whole stands in the light-aircraft zone, tie-downs and small ones */
IC.gaRamp = function (ap) {
  if (!ap || !ap.parts || ap.owner !== 'us' || ap.offline) return null;
  const L = IC.aptStands(ap).filter(s => s.zone === 'light' && s.linked !== false && s.hp > 0 && (s.size === 'xs' || s.size === 's'));
  return L.length ? L : null;
};
const recOf = (S, id) => S.ga && S.ga.parked.find(r => r.id === id);
const standOf = (ap, sid) => IC.aptStands(ap).find(s => s.id === sid);
/* a free spot for this type: a tie-down for a light aircraft, a small stand for a business jet */
function freeSpot(ap, T) {
  const L = IC.gaRamp(ap); if (!L) return null;
  const fit = L.filter(s => !s.occ && IC.STAND_FITS[s.size].includes(T.stand));
  const s = fit.find(x => x.size === T.stand) || fit[0];
  if (s || !T.biz) return s || null;
  // (a business jet with the ramp full: a remote stand away from the gates, as before)
  const far = IC.aptStands(ap).filter(x => (x.zone || 'civil') === 'civil' && !x.contact && !x.cargo && !x.occ && x.linked !== false && x.hp > 0 && x.size !== 'l');
  return far.find(x => x.size === 's') || far[0] || null;
}
IC.gaFreeSpot = freeSpot;
const regOf = S => `${S.world.names.H.slice(0, 1)}-${String.fromCharCode(65 + U.randi(0, 25))}${String.fromCharCode(65 + U.randi(0, 25))}${U.randi(10, 99)}`;
function newRec(S, ap, s, o) {
  const r = { id: IC.nid('ga'), ap: ap.id, sid: s.id, type: o.type, cs: o.cs || regOf(S), n: o.n != null ? o.n : U.randi(0, 9999), home: o.home ? 1 : 0, biz: o.biz ? 1 : 0,
    away: false, mv: null, t0: S.time, until: o.until || 0, from: o.from || null, dep: 0, arr: o.arr || 0, flown: null };
  s.occ = r.id; S.ga.parked.push(r);
  return r;
}
IC.gaLiv = r => IC.gaLivery(r.n);
IC.gaPark = (S, ap, s, o) => newRec(S, ap, s, o);
/* the based aircraft of every airport with a ramp, the first time it has one */
function fill(S, ap) {
  const L = IC.gaRamp(ap); if (!L || ap.gaFilled) return;
  ap.gaFilled = true;
  const ties = L.filter(s => s.size === 'xs' && !s.occ), want = Math.round(ties.length * IC.GA.based), seed = idNum(ap.id);
  for (let i = 0; i < want; i++) { const s = ties[(i * 7 + seed) % ties.length]; if (s.occ) continue; newRec(S, ap, s, { type: BASED[(seed + i * 5) % BASED.length], home: true, n: seed + i * 13 }); }
}
IC.gaInit = function (S) {
  S.ga = S.ga || { parked: [], t: 0 };
  for (const ap of IC.bases(S)) if (ap.kind === 'airport') fill(S, ap);
};

/* destroyed where it stood (a raid on the airport) */
IC.gaLost = (S, rid) => { const r = recOf(S, rid); if (r) drop(S, r); };
/* ---------- leaving ---------- */
IC.H.gaAirborne = (S, rid, to, o) => m => airborne(S, rid, to, o, m);
IC.H.gaGroundLost = (S, rid) => () => { const r = recOf(S, rid); if (r) drop(S, r); };
function drop(S, r) {
  const ap = S.byId[r.ap], s = ap && standOf(ap, r.sid);
  if (s && s.occ === r.id) s.occ = null;
  S.ga.parked = S.ga.parked.filter(x => x !== r);
}
/* off the ground: it flies on as a light aircraft; a based one keeps its spot, a visitor gives it up */
function airborne(S, rid, to, o, m) {
  const r = recOf(S, rid), ap = r && S.byId[r.ap]; if (!r || !ap) return;
  r.mv = null;
  const from = { x: m.x, y: m.y, name: ap.name, apt: ap.id };
  const t = IC.gaLaunch(S, from, to, Object.assign({}, o, { type: r.type, cs: r.cs, livery: IC.gaLiv(r), ground: true, alt: o && o.alt }));
  if (t) { t.alt = 0.03; t.gaRec = r.home ? r.id : null; t.gaN = r.n; t.vx = Math.cos(m.h) * t.spd; t.vy = Math.sin(m.h) * t.spd; t.climbK = Math.max(t.climbK || 1, 1.6); }
  if (r.home) { r.away = true; r.flown = S.time; } else drop(S, r);
}
/* a parked aircraft sets off to `to` ({ x, y, name, apt | field }): start-up and taxi out, or (a helicopter) straight
   up off its spot. false when it cannot (no runway it can use, no way out) */
IC.gaDepart = function (S, r, to, o) {
  const ap = S.byId[r.ap], s = ap && standOf(ap, r.sid), T = IC.ACTYPES[r.type];
  if (!s || r.away || r.mv) return false;
  r.dep = S.time; r.pre = U.rand(IC.GA.preflight[0], IC.GA.preflight[1]);
  if (T.vtol) { r.mv = 'heli'; r.liftT = S.time + r.pre; r.to = to; r.o = o || null; return true; }
  const m = IC.gopsDepart(S, ap, { type: r.type, node: s.id, stand: s, startT: r.pre, who: r.cs, livery: IC.gaLiv(r), ga: r.id,
    onAir: IC.hfn('gaAirborne', S, r.id, to, o || null), onDead: IC.hfn('gaGroundLost', S, r.id) });
  if (!m) { r.dep = 0; return false; }
  r.mv = m.id;
  return true;
};
/* an idle based aircraft at this airport, for a pilot from a town nearby */
IC.gaIdle = (S, ap) => S.ga ? S.ga.parked.filter(r => r.ap === ap.id && r.home && !r.away && !r.mv && !r.biz) : [];

/* ---------- arriving ---------- */
IC.H.gaParked = (S, apId, sid, o) => m => parked(S, apId, sid, o);
IC.H.gaArrLost = (S, apId, sid, rid) => () => { const ap = S.byId[apId], s = ap && standOf(ap, sid); if (s && s.occ === (rid || 'ga-in:' + sid)) s.occ = null; const r = rid && recOf(S, rid); if (r) drop(S, r); };
function parked(S, apId, sid, o) {
  const ap = S.byId[apId], s = ap && standOf(ap, sid); if (!ap || !s) return;
  let r = o.rid && recOf(S, o.rid);
  if (r) { r.away = false; r.mv = null; r.t0 = S.time; r.arr = S.time; return; }
  if (s.occ === 'ga-in:' + sid) s.occ = null;
  r = newRec(S, ap, s, { type: o.type, cs: o.cs, n: o.n, biz: o.biz, home: false, from: o.from, arr: S.time,
    until: S.time + (o.biz ? U.rand(3, 30) : U.rand(IC.GA.stay[0], IC.GA.stay[1])) * 3600 });
}
/* a light aircraft or business jet coming in to an airport with a ramp: true while it is being looked after here
   (flying to its approach fix, waiting there, or handed to the ground), false to fly on the old way */
IC.gaInbound = function (S, t, dt) {
  const b = t.gaTo, ap = b && b.apt && S.byId[b.apt];
  if (!ap || t.tow || t.form || t.visit || t.gaNo) return false;
  if (!t.gaIn) {
    if (U.dist(t, ap) > IC.GA.join + 20) return false;
    if (!IC.gaRamp(ap)) { t.gaNo = true; return false; }
    const T = IC.ACTYPES[t.acType] || IC.ACTYPES.light, r = t.gaRec && recOf(S, t.gaRec);
    const s = r && r.ap === ap.id ? standOf(ap, r.sid) : freeSpot(ap, T);
    if (!s) { t.gaNo = true; return false; }
    if (!r || r.ap !== ap.id) s.occ = 'ga-in:' + s.id;
    if (T.vtol) { t.gaIn = { sid: s.id, heli: true }; t.wps = [{ x: s.x, y: s.y }]; t.dest = t.wps[0]; return false; }
    const faf = IC.gopsFaf(S, ap, t.acType, t);
    if (!faf) { if (s.occ === 'ga-in:' + s.id) s.occ = null; t.gaNo = true; return false; }
    t.gaIn = { sid: s.id, faf, tries: 0 };
  }
  const G = t.gaIn; if (G.heli) return false;
  const f = G.faf, d = U.dxy(t.x, t.y, f.x, f.y);
  let hd;
  if (d > 4 && !G.hold) hd = Math.atan2(f.y - t.y, f.x - t.x);
  else {
    if (S.time >= (G.next || 0)) {
      G.next = S.time + 8;
      const s = standOf(ap, G.sid), r = t.gaRec && recOf(S, t.gaRec);
      const m = s && IC.gopsLand(S, ap, { type: t.acType, target: s.id, stand: s, who: t.cs, livery: t.livery, faf: f, ga: 1,
        onPark: IC.hfn('gaParked', S, ap.id, s.id, { rid: r ? r.id : null, type: t.acType, cs: t.cs, n: t.gaN != null ? t.gaN : U.randi(0, 9999), biz: t.biz ? 1 : 0, from: t.gaFrom ? { x: t.gaFrom.x, y: t.gaFrom.y, name: t.gaFrom.name, field: t.gaFrom.field || null, apt: t.gaFrom.apt || null } : null }),
        onDead: IC.hfn('gaArrLost', S, ap.id, s ? s.id : null, r ? r.id : null), onGoAround: IC.hfn('gaGoAround', S, ap.id) });
      if (m && typeof m === 'object') { t.dead = true; t.landed = true; IC.gaArrive(S, t, true); if (r) r.mv = m.id; return true; }
      if (!m || m === 'divert' || ++G.tries > 90) {
        if (s && s.occ === 'ga-in:' + s.id) s.occ = null;
        t.gaNo = true; t.gaIn = null;
        // (kept waiting too long: it lands at the nearest club field instead)
        const f = S.asp.fields.slice().sort((p, q) => U.dist(p, t) - U.dist(q, t))[0];
        if (f && !t.biz) { t.gaTo = { x: f.x, y: f.y, name: f.name, field: f.id }; t.wps = [{ x: f.x, y: f.y }]; t.dest = t.wps[0]; }
        return false;
      }
    }
    // waiting: an orbit off the fix, low
    G.hold = true; G.a = (G.a || Math.atan2(t.y - f.y, t.x - f.x)) + dt * t.spd / 12;
    hd = Math.atan2(f.y + Math.sin(G.a) * 12 - t.y, f.x + Math.cos(G.a) * 12 - t.x);
  }
  t.vx = Math.cos(hd) * t.spd; t.vy = Math.sin(hd) * t.spd; t.x += t.vx * dt; t.y += t.vy * dt;
  t.alt += U.clamp(0.45 - t.alt, -0.004 * dt, 0.003 * dt);
  return true;
};
/* a go-around: the move is gone; a light aircraft flies a circuit and is out of the picture (it lands elsewhere) */
IC.H.gaGoAround = (S, apId) => () => {};
/* a helicopter at its spot: down, and parked */
IC.gaHeliDown = function (S, t) {
  const G = t.gaIn, ap = t.gaTo && S.byId[t.gaTo.apt]; if (!G || !G.heli || !ap) return false;
  const r = t.gaRec && recOf(S, t.gaRec);
  parked(S, ap.id, G.sid, { rid: r ? r.id : null, type: t.acType, cs: t.cs, n: t.gaN != null ? t.gaN : U.randi(0, 9999), from: t.gaFrom ? { x: t.gaFrom.x, y: t.gaFrom.y, name: t.gaFrom.name } : null });
  return true;
};

/* ---------- every ten seconds ---------- */
IC.gaTick = function (S, dt) {
  const G = S.ga; if (!G) return;
  if ((G.t -= dt) > 0) return;
  G.t = 10;
  for (const ap of IC.bases(S)) if (ap.kind === 'airport' && !ap.gaFilled && ap.st && IC.gaRamp(ap)) fill(S, ap);
  for (const r of G.parked.slice()) {
    const ap = S.byId[r.ap];
    if (!ap || ap.owner !== 'us') { drop(S, r); continue; }
    // a helicopter lifting off its spot when the pilot is ready
    if (r.mv === 'heli' && S.time >= r.liftT) {
      const s = standOf(ap, r.sid); r.mv = null;
      if (s) { const t = IC.gaLaunch(S, { x: s.x, y: s.y, name: ap.name, apt: ap.id }, r.to, Object.assign({}, r.o, { type: r.type, cs: r.cs, livery: IC.gaLiv(r), ground: true }));
        if (t) { t.alt = 0.02; t.gaRec = r.home ? r.id : null; t.gaN = r.n; } }
      if (r.home) { r.away = true; r.flown = S.time; } else drop(S, r);
      r.to = null; r.o = null;
      continue;
    }
    // a move that is no more (destroyed, or the airport rebuilt under it)
    if (r.mv && r.mv !== 'heli' && !ap.moves.some(m => m.id === r.mv)) { r.mv = null; if (r.away === false && r.dep) r.dep = 0; }
    // away too long: it came home by another way
    if (r.away && S.time - (r.flown || 0) > IC.GA.lost && !S.threats.some(t => t.gaRec === r.id && !t.dead)) { r.away = false; r.t0 = S.time; }
    // a visitor's time is up: it leaves for where it came from, a business jet for abroad
    if (!r.home && !r.away && !r.mv && r.until && S.time >= r.until && S.airspace === 'open' && (r.biz || IC.gaWeatherOk(S))) {
      const port = r.biz && IC.avPorts ? U.pick(IC.avPorts(S)) : null;
      const to = port ? { x: port.x, y: port.y, name: port.name } : r.from && r.from.x != null ? r.from : null;
      if (!to || !IC.gaDepart(S, r, to, r.biz ? { xpdr: true, fpl: true } : null)) r.until = S.time + 1800;
    }
  }
};

})(window.IC);
