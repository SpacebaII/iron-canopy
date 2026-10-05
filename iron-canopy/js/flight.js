/* Iron Canopy — height and reach: shared helpers for everything that flies, and for anything that flies to meet it.
   Heights are in km above the ground (t.alt), positions in world units (1 unit = 100 m), so 1 km up = 10 units.

   Showing height
     IC.FT                      feet in a kilometre
     IC.TA                      transition altitude (km): below it aircraft heights are in feet, above it in flight levels
     IC.flText(altKm)           'FL350' at or above the transition altitude, '4,500 ft' below it
     IC.kmText(altKm)           '12 km', '3.5 km', '400 m'
     IC.altText(t)              the height of anything as the player reads it: flight level or feet for aircraft
                                (airliners, light aircraft, military jets, helicopters, ours or theirs; o.aircraft forces
                                it), km for everything else (missiles, drones, warheads)
     IC.isAircraft(t)           does IC.altText show it in feet?
     IC.flOf(altKm)             the flight level as a number (350 for 35,000 ft); IC.flKm(fl) back to km

   Meeting in three dimensions
     IC.dist3(a, b)             distance in world units counting height (a.alt and b.alt in km)
     IC.HIT_R                   how close an interceptor must pass, in 3D, to count as a hit (world units)
     IC.meets(a, b, r)          within r (default IC.HIT_R) in 3D? Two things over the same map point 8 km apart in
                                height do not meet
     IC.flyLoft(M, distUnits)   how high above the meeting point a weapon M climbs on its way (km)
     IC.flyPath(a, b, loftKm)   a climb-and-descend path from a {x, y, alt} to a meeting point b {x, y, alt}
     IC.flyAt(P, f)             {x, y, alt} a fraction f (0–1) of the way along it: a steep climb to the top of the
                                arc a third of the way, then a long descent onto the meeting point
     IC.flyAltWant(a0, a1, loft, f)  the height the path wants at fraction f (for weapons that steer as they go)
     IC.flyClimb(M)             the fastest a weapon M changes height (km per game second)

   Reach
     IC.REACH[mun]              per munition (a key of IC.MUN): rows [target height km, reach km]. Reach shrinks
                                against very low targets (radar horizon, ground clutter, the missile's own climb) and
                                near the top of its band (thin air)
     IC.reachAt(M, altKm)       reach against a target at that height, in world units (0 outside the band);
                                M is a munition key or an IC.MUN entry
     IC.reachBand(M)            [lowest, highest] height it reaches (km)
     IC.reachMax(M)             its longest reach (km)
     IC.reachText(M)            'reaches 30 m – 25 km up, out to 100 km (45 km against a target at 30 m)'
     IC.reachRows(M)            the rows (km) for a side-view chart

   Height profiles (how enemy weapons and aircraft fly, for the player to learn)
     IC.PROFILES[k]             { name, band, words } for k in low, skim, mid, high, arc
     IC.profileOf(t | d | type) the profile of a threat, its data (IC.THR entry) or its type key */
(function (IC) {
'use strict';
const U = IC.U;

/* ---------- showing height ---------- */
IC.FT = 3280.84;
IC.TA = 6000 / IC.FT;          // 6,000 ft
IC.flOf = altKm => Math.round(altKm * IC.FT / 100);
IC.flKm = fl => fl * 100 / IC.FT;
const pad3 = n => String(n).padStart(3, '0');
IC.flText = function (altKm) {
  if (altKm >= IC.TA - 0.01) return 'FL' + pad3(Math.round(altKm * IC.FT / 1000) * 10);
  const ft = Math.max(0, Math.round(altKm * IC.FT / 100) * 100);
  return ft.toLocaleString('en-GB') + ' ft';
};
IC.kmText = altKm => altKm >= 9.95 ? `${Math.round(altKm)} km` : altKm >= 0.95 ? `${+altKm.toFixed(1)} km` : altKm >= 0.1 ? `${Math.round(altKm * 20) * 50} m` : `${Math.max(0, Math.round(altKm * 100) * 10)} m`;
const AIR = { air: 1, heli: 1, ga: 1 };
IC.isAircraft = t => !!t && (t.aircraft || (t.d && (t.d.civil || (AIR[t.d.cls] && !t.d.decoy))) || t.kind === 'air');
IC.altText = t => IC.isAircraft(t) ? IC.flText(t.alt || 0) : IC.kmText(t.alt || 0);

/* ---------- meeting in three dimensions ---------- */
IC.HIT_R = 6;
IC.dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, ((a.alt || 0) - (b.alt || 0)) * 10);
IC.meets = (a, b, r) => IC.dist3(a, b) < (r || IC.HIT_R);
/* long-range rounds loft high and dive onto the target (they fly further in thin air); short-range ones climb
   straight at it */
IC.flyLoft = (M, D) => M.range > 300 ? Math.min(D / 10 * 0.15, M.alt[1] * 0.4) : Math.min(D / 10 * 0.06, 1);
IC.flyClimb = M => M.spd * 0.1 * 0.7;
/* the climb is steep and the descent long: the top of the arc comes a third of the way */
const hump = f => { const g = Math.pow(U.clamp(f, 0, 1), 0.7); return 4 * g * (1 - g); };
IC.flyAltWant = (a0, a1, loft, f) => Math.max(0, a0 + (a1 - a0) * U.clamp(f, 0, 1) + loft * hump(f));
IC.flyPath = (a, b, loft) => ({ x0: a.x, y0: a.y, a0: a.alt || 0, x1: b.x, y1: b.y, a1: b.alt || 0, loft: loft || 0 });
IC.flyAt = (P, f) => ({ x: P.x0 + (P.x1 - P.x0) * f, y: P.y0 + (P.y1 - P.y0) * f, alt: IC.flyAltWant(P.a0, P.a1, P.loft, f) });

/* ---------- reach ---------- */
/* [target height km, reach km]. The first and last rows are the band: nothing outside it. Wave 11 moved these toward
   the real ones: a short-range round 25 km, medium 90, long 200 (the extended-range round 250, the very-long-range
   interceptor 400), heat-seekers 8 km from the shoulder, 12 imaging, 14 from a vehicle, a fighter's radar missile 90
   (SRM its heat-seeker; EAAM and EIR the enemy fighters' radar and heat-seeking missiles). Air-to-air rows are from a
   shooter at 10 km: IC.aamReach (air.js) shortens them for a lower shooter and a receding target */
IC.REACH = {
  IR:  [[0.02, 4], [0.1, 7.5], [3, 8], [4.5, 4]],
  IR2: [[0.02, 5], [0.1, 11], [3.5, 12], [5, 6]],
  IRV: [[0.02, 6], [0.1, 13], [4, 14], [6, 7]],
  INT: [[0.02, 10], [0.2, 15], [3, 15], [4, 8]],
  SR:  [[0.02, 12], [0.2, 20], [1, 25], [5, 25], [7, 14]],
  MR:  [[0.03, 38], [0.3, 60], [2, 90], [14, 90], [22, 50]],
  LR:  [[0.03, 75], [0.3, 120], [3, 200], [18, 200], [27, 110]],
  LRE: [[0.03, 80], [0.3, 130], [4, 250], [20, 250], [30, 140]],
  VLR: [[0.05, 90], [0.5, 160], [6, 400], [25, 400], [35, 220]],
  AAM: [[0.03, 30], [0.5, 50], [4, 80], [15, 90], [20, 60]],
  SRM: [[0.03, 6], [0.5, 11], [6, 15], [15, 15], [18, 9]],
  EAAM:[[0.03, 25], [0.5, 45], [4, 70], [15, 80], [20, 55]],
  EIR: [[0.03, 5], [0.5, 9], [6, 12], [15, 12], [18, 8]],
  TBD: [[0.05, 18], [1, 28], [5, 35], [25, 35], [35, 20]],
  HAT: [[40, 120], [60, 200], [120, 200], [150, 120]],
  EXO: [[90, 300], [200, 500], [600, 500], [700, 300]]
};
/* a munition's key in IC.REACH: its key in IC.MUN, or the row a fighter's missile names (IC.AAMS, IC.EAAMS) */
const keyOf = M => typeof M === 'string' ? M : M.reach || M._k || (M._k = Object.keys(IC.MUN).find(k => IC.MUN[k] === M));
const AIRK = { SRM: () => IC.AAMS.srm, EAAM: () => IC.EAAMS.mrm, EIR: () => IC.EAAMS.srm };
const munOf = M => typeof M === 'string' ? IC.MUN[M] || (AIRK[M] && AIRK[M]()) : M;
IC.reachRows = function (M) {
  const k = keyOf(M), m = munOf(M);
  return IC.REACH[k] || (m && m.alt ? [[m.alt[0], m.range / 10], [m.alt[1], m.range / 10]] : [[0, 0]]);
};
IC.reachAt = function (M, alt) {
  const R = IC.reachRows(M);
  if (alt < R[0][0] - 1e-6 || alt > R[R.length - 1][0] + 1e-6) return 0;
  for (let i = 1; i < R.length; i++) if (alt <= R[i][0]) { const [a0, r0] = R[i - 1], [a1, r1] = R[i]; return (r0 + (r1 - r0) * (a1 > a0 ? (alt - a0) / (a1 - a0) : 1)) * 10; }
  return R[R.length - 1][1] * 10;
};
IC.reachBand = M => { const R = IC.reachRows(M); return [R[0][0], R[R.length - 1][0]]; };
IC.reachMax = M => Math.max(...IC.reachRows(M).map(r => r[1]));
const nkm = v => v >= 10 ? Math.round(v) : +v.toFixed(1);
IC.reachText = function (M) {
  const R = IC.reachRows(M), [lo, hi] = IC.reachBand(M), mx = IC.reachMax(M);
  const low = R[0][1] < mx * 0.8 ? ` (${nkm(R[0][1])} km against a target at ${IC.kmText(lo)})` : '';
  return `reaches ${IC.kmText(lo)} – ${IC.kmText(hi)} up, out to ${nkm(mx)} km${low}`;
};

/* ---------- missile energy ----------
   A missile's motor burns for a few seconds and takes it to its peak speed; then it coasts and slows. Drag takes
   speed in proportion to its square, so over the ground x it coasts its speed falls as e^(−c·x), and every turn
   costs more on top (IC.MSL_TURN: a 90° turn loses about a third). Below its lowest useful speed it is spent, and
   a slow missile cannot turn hard: the g it can pull falls with the square of its speed. The coast constant c is set
   shot by shot so that a missile flown straight at a target at that height reaches exactly as far as IC.REACH says
   (thick air low down gives a larger c): IC.REACH stays the one table of reach, and the energy gives it a shape in
   time. A long-range shot at 100 km takes about two minutes; an air-to-air shot at 45 km about a minute.
     IC.MSL[k]                  { boost s, vb peak speed, vmin spent speed (world units a second), g it pulls at peak }
     IC.mslOf(M)                the profile of a munition (a key of IC.MUN or an entry; M.msl names another profile)
     IC.mslTime(M, d, altKm)    game seconds to fly d world units at a target at that height (Infinity beyond reach)
     IC.mslSpeedAt(M, d, altKm) its speed after d world units
     IC.mslFlown(M, T, altKm)   how far it flies in T seconds
     IC.mslNez(M, altKm)        the no-escape zone (world units): closer than this a target that turns side-on, dives
                                and drops chaff cannot get away, because the missile arrives before the manoeuvre works
     IC.mslInit(m, M, R, v0)    fills a new missile's energy fields for a reach of R world units, launched at speed v0
     IC.mslFly(S, m, dt)        one step of a guided missile against m.target: guidance, seeker, energy, the fuse.
                                Returns null while it flies, else { end: 'fuse' | 'miss' | 'spent', why, d }
     IC.mslDecoy(S, m, w, kind) a chaff or flare salvo from w against missile m: may take its seeker
     IC.defendPlan(S, w, dt, skill)  what an aircraft w does about the missile coming for it (w.mslIn): nothing yet,
                                crank (turn 60° off it), notch (side-on to the radar that guides it, diving into the
                                ground clutter, chaff or flares), drag (turn away and run it out of energy) or
                                recommit when it is spent. Returns { mode, h, alt } or null
     IC.FUSE_R                  closest approach in 3D that sets the fuse off (world units)
     IC.NOTCH_COAST             seconds a doppler radar's tracker coasts on a target side-on in the clutter before
                                losing it (longer with ECCM) */
IC.MSL = {
  IR:   { boost: 2, vb: 7, vmin: 1.8, g: 30 },
  IR2:  { boost: 2.5, vb: 7.5, vmin: 1.8, g: 35 },
  IRV:  { boost: 3, vb: 8, vmin: 2, g: 35 },
  INT:  { cruise: true },
  SR:   { boost: 3, vb: 10, vmin: 2.2, g: 35 },
  MR:   { boost: 6, vb: 13, vmin: 2.5, g: 40 },
  LR:   { boost: 10, vb: 12, vmin: 2.5, g: 30 },
  LRE:  { boost: 12, vb: 14, vmin: 2.6, g: 30 },
  VLR:  { boost: 15, vb: 16, vmin: 3, g: 25 },
  TBD:  { boost: 4, vb: 17, vmin: 3, g: 50 },
  HAT:  { boost: 8, vb: 26, vmin: 5, g: 30 },
  EXO:  { boost: 10, vb: 33, vmin: 6, g: 20 },
  AAM:  { boost: 5, vb: 10, vmin: 2.8, g: 40 },
  SRM:  { boost: 3, vb: 9, vmin: 2.4, g: 50 },
  EAAM: { boost: 5, vb: 9.5, vmin: 2.8, g: 35 },
  EIR:  { boost: 3, vb: 8.5, vmin: 2.3, g: 45 }
};
IC.MSL_TURN = 0.25;          // speed lost per radian of turn
IC.FUSE_R = 2.5;
IC.NOTCH_COAST = 3;
IC.GUIDANCE_ACTIVE_R = 150;  // an active seeker goes on its own in the last 15 km
const G0 = 0.0981;           // one g in world units a second squared
IC.mslOf = function (M) {
  const m = munOf(M) || {}, k = typeof M === 'string' ? M : m.msl || keyOf(m);
  return IC.MSL[k] || { boost: 4, vb: m.spd || 10, vmin: (m.spd || 10) * 0.2, g: 30 };
};
const boostX = (P, v0) => P.boost * (v0 + P.vb) / 2;
const dragFor = (P, R, v0) => Math.log(P.vb / P.vmin) / Math.max(20, R - boostX(P, v0));
IC.mslTime = function (M, d, alt, v0) {
  const P = IC.mslOf(M), m = munOf(M);
  if (P.cruise) return d / m.spd;
  const R = IC.reachAt(M, alt || 0); if (!R || d > R * 1.001) return Infinity;
  v0 = v0 == null ? P.vb * 0.25 : v0;
  const xb = boostX(P, v0), a = (P.vb - v0) / P.boost;
  if (d <= xb) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a;
  const c = dragFor(P, R, v0);
  return P.boost + (Math.exp(c * (d - xb)) - 1) / (c * P.vb);
};
IC.mslSpeedAt = function (M, d, alt, v0) {
  const P = IC.mslOf(M), m = munOf(M);
  if (P.cruise) return m.spd;
  const R = IC.reachAt(M, alt || 0); v0 = v0 == null ? P.vb * 0.25 : v0;
  const xb = boostX(P, v0);
  if (d <= xb) return Math.sqrt(v0 * v0 + 2 * (P.vb - v0) / P.boost * d);
  return P.vb * Math.exp(-dragFor(P, R, v0) * (d - xb));
};
IC.mslFlown = function (M, T, alt, v0) {
  const P = IC.mslOf(M), m = munOf(M);
  if (P.cruise) return m.spd * T;
  const R = IC.reachAt(M, alt || 0); v0 = v0 == null ? P.vb * 0.25 : v0;
  const a = (P.vb - v0) / P.boost;
  if (T <= P.boost) return v0 * T + a * T * T / 2;
  const c = dragFor(P, R, v0);
  return Math.min(R, boostX(P, v0) + Math.log(1 + c * P.vb * (T - P.boost)) / c);
};
/* a target needs about 11 s to turn side-on and IC.NOTCH_COAST more for the tracker to lose it; a high one must also
   dive into the clutter first (at about 150 m a second) against a radar on the ground */
IC.mslNez = function (M, alt) {
  const R = IC.reachAt(M, alt || 0); if (!R) return 0;
  const T = 11 + IC.NOTCH_COAST + Math.max(0, (alt || 0) - 2.5) / 0.15;
  return Math.min(R * 0.9, IC.mslFlown(M, T, alt) + 2.4 * T);
};
IC.mslInit = function (m, M, R, v0) {
  const P = IC.mslOf(M);
  m.P = P; m.age = 0; m.v0 = v0 == null ? P.vb * 0.25 : v0;
  if (P.cruise) { m.v = munOf(M).spd; m.c = 0; m.vb = m.v; }
  else { m.vb = P.vb + (v0 ? v0 * 0.5 : 0); m.v = m.v0; m.c = Math.log(m.vb / P.vmin) / Math.max(20, R - P.boost * (m.v0 + m.vb) / 2); }
  m.spd = m.v; m.nh = 0; m.closeT = 0; m.rPrev = null; m.rhPrev = null; m.lostLock = false; m.fooled = false; m.tti = Infinity;
  return m;
};
/* the radar that guides a missile now: the launcher's (semi-active and command all the way, active ones until their
   own seeker takes over), the missile's own, or none for a heat-seeker */
function guideOf(m) {
  const sk = m.M.seeker;
  if (sk === 'IR') return null;
  if ((sk === 'ARH' || sk === 'HTK') && m.active) return m;
  return m.unit || m.by || (m.src && typeof m.src === 'object' ? m.src : null) || m;
}
IC.mslGuide = guideOf;
/* side-on to that radar, low enough that the ground behind hides it in the clutter (or the radar looks down on it) */
function inNotch(m, t, G) {
  if (!G) return false;
  const sp = Math.hypot(t.vx || 0, t.vy || 0); if (sp < 0.3) return false;
  const dx = t.x - G.x, dy = t.y - G.y, L = Math.hypot(dx, dy) || 1;
  const radial = Math.abs((t.vx * dx + t.vy * dy) / (sp * L));
  return radial < 0.3 && (t.alt < 3 || (G.alt || 0) > t.alt + 0.5);
}
IC.mslInNotch = inNotch;
const cone = (m, t, w) => Math.abs(U.angWrap(Math.atan2(t.y - m.y, t.x - m.x) - m.a)) < w;
function status(S, m, t, what, text, quiet) { IC.emit(S, 'mstat', { m, t, what, text }); if (!quiet && (t.det || t.kind || m.side === 'us')) IC.text(S, m.x, m.y, text, '#8fa3b0'); }
/* is the guiding radar still on the target? (semi-active and command need it until impact) */
function illuminated(S, m, t) {
  const u = m.unit;
  if (!u) return true;
  if (u.dead) return false;
  if (m.hoj) return !!t.jamming;
  if (u.radarOn && t.fcBy && t.fcBy.includes(u.id)) return true;
  // command guidance can come over the network from another radar's track; semi-active cannot
  return m.M.seeker === 'CMD' && t.fc && IC.netted && IC.netted(S, u);
}
IC.mslFly = function (S, m, dt) {
  const t = m.target, M = m.M;
  // a missile made elsewhere without its energy (a lesson, a test): already coasting at its speed
  if (m.v == null) { const sp = m.spd; IC.mslInit(m, M, IC.reachAt(M, t.alt || 0) || M.range, 0); m.v = sp || m.vb; m.age = m.P.boost; }
  const P = m.P;
  const r0 = U.dxy(m.x, m.y, t.x, t.y);
  // close in the step is cut finer, so the fuse sees the closest approach
  const n = r0 < 80 ? Math.max(1, Math.ceil(dt / 0.1)) : 1, h = dt / n;
  for (let k = 0; k < n; k++) {
    m.age += h;
    const sk = M.seeker;
    // ---- the seeker and what guides it ----
    if (sk === 'ARH' || sk === 'HTK') { if (!m.active && U.dxy(m.x, m.y, t.x, t.y) < (sk === 'HTK' ? 80 : IC.GUIDANCE_ACTIVE_R)) { m.active = true; m.launchSeen = true; } }
    const G = guideOf(m);
    // (a missile homing on a jammer's noise does not care about the doppler notch)
    const notch = t.def === 'notch' && !(m.hoj && t.jamming) && inNotch(m, t, G);
    m.nh = notch ? m.nh + h : Math.max(0, m.nh - h * 0.5);
    const coast = IC.NOTCH_COAST + (m.side === 'us' && IC.hasTech(S, 'e_eccm') ? 2 : 0);
    // (semi-active and command guidance need the radar on the target; its tracker coasts a few seconds without it)
    m.semiT = (sk === 'SARH' || sk === 'CMD') && !illuminated(S, m, t) ? m.semiT + h : 0;
    const semi = m.semiT > coast;
    if (!m.lostLock && (m.nh > coast || semi)) {
      m.lostLock = true; m.lockT = S.time;
      status(S, m, t, 'lost', 'LOST LOCK', !notch);
    } else if (m.lostLock && !notch && !semi && S.time - m.lockT > 4) {
      // a seeker that lost it may find it again: an active one inside its own reach and cone, a semi-active one when
      // the radar has it again
      const can = sk === 'SARH' || sk === 'CMD' || (U.dxy(m.x, m.y, t.x, t.y) < IC.GUIDANCE_ACTIVE_R * 1.2 && cone(m, t, 0.8));
      if (can && Math.random() < h * 0.3) { m.lostLock = false; m.nh = 0; IC.emit(S, 'mstat', { m, t, what: 'relock', text: 'LOCK' }); }
    }
    if (m.fooled && Math.random() < h * (M.ircm > 0.6 ? 0.35 : 0.2) && U.dxy(t.x, t.y, m.fx, m.fy) > 25 && cone(m, t, 0.7)) m.fooled = false;
    if (m.fooled) { m.fx += (m.fvx || 0) * h; m.fy += (m.fvy || 0) * h; }
    m.phase = m.fooled ? 'decoy' : m.lostLock ? 'lost' : sk === 'SARH' ? 'sarh' : sk === 'CMD' ? 'cmd' : sk === 'IR' ? 'ir' : m.active ? (sk === 'HTK' ? 'term' : 'arh') : 'mid';
    // ---- guidance: lead the target by the time to go; a lost missile flies straight on ----
    const r = U.dxy(m.x, m.y, t.x, t.y);
    const clos = m.v + ((t.vx || 0) * (m.x - t.x) + (t.vy || 0) * (m.y - t.y)) / (r || 1);
    const tgo = r / Math.max(0.5, clos);
    m.tti = clos > 0.2 ? r / clos : Infinity;
    // the target defends against whichever missile is closest to arriving
    const q = t.mslIn;
    if (!q || q === m || q.dead || !(q.tti <= m.tti)) t.mslIn = m;
    let da = 0;
    if (!m.lostLock) {
      const ax = m.fooled ? m.fx : t.x + (t.vx || 0) * tgo, ay = m.fooled ? m.fy : t.y + (t.vy || 0) * tgo;
      const wmax = P.cruise ? 1.2 : Math.min(1.5, P.g * G0 * Math.pow(m.v / m.vb, 2) / Math.max(0.3, m.v));
      da = U.clamp(U.angWrap(Math.atan2(ay - m.y, ax - m.x) - m.a), -wmax * h, wmax * h);
      m.a += da;
    }
    // ---- energy: the motor, then drag and every turn ----
    if (!P.cruise) {
      if (m.age <= P.boost) m.v = Math.min(m.vb, m.v + (m.vb - m.v0) / P.boost * h);
      else m.v -= m.c * m.v * m.v * h;
      m.v *= Math.exp(-IC.MSL_TURN * Math.abs(da));
    }
    m.spd = m.v;
    // ---- move, climbing or diving toward the target's height along the loft ----
    const x0 = m.x, y0 = m.y, z0 = m.alt;
    // (it climbs or dives at most about 45°: the rest of its speed carries it on over the ground)
    const step = m.v * h, zt = t.d ? IC.altAt(t, tgo) : t.alt || 0, dzU = (zt - m.alt) * 10, hs = step * Math.max(0.7, r / Math.max(1e-6, Math.hypot(r, dzU)));
    m.x += Math.cos(m.a) * hs; m.y += Math.sin(m.a) * hs; m.flown = (m.flown || 0) + hs;
    const want = IC.flyAltWant(m.a0 || 0, zt, m.loft || 0, m.flown / Math.max(1e-6, m.flown + r)), vmax = step * 0.1;
    m.alt += U.clamp(want - m.alt, -vmax, vmax);
    // ---- the fuse: the closest approach in 3D along this piece of flight ----
    const px = x0 - t.x, py = y0 - t.y, pz = (z0 - (t.alt || 0)) * 10, wx = m.x - x0, wy = m.y - y0, wz = (m.alt - z0) * 10;
    const ww = wx * wx + wy * wy + wz * wz, f = ww > 0 ? U.clamp(-(px * wx + py * wy + pz * wz) / ww, 0, 1) : 0;
    const d = Math.hypot(px + wx * f, py + wy * f, pz + wz * f);
    if (d < IC.FUSE_R) { m.x = x0 + wx * f; m.y = y0 + wy * f; m.alt = z0 + wz * f / 10; return { end: 'fuse', d }; }
    // passed it: over the ground it was close, and now the range opens again
    // (or it went over or under it: past it over the ground with a kilometre or more between them in height)
    const rh = U.dxy(m.x, m.y, t.x, t.y), d3 = IC.dist3(m, t), dzNow = (m.alt - (t.alt || 0)) * 10;
    if (m.rPrev != null && m.rhPrev < Math.max(40, step * 4) && ((d3 > m.rPrev && f < 1) || (rh > m.rhPrev && Math.abs(dzNow) > Math.max(rh, IC.FUSE_R * 4)))) {
      const dz = dzNow, dh = Math.hypot(px + wx * f, py + wy * f);
      const why = m.fooled ? 'DECOYED' : m.lostLock ? 'LOST LOCK' : Math.abs(dz) > dh ? (dz > 0 ? 'PASSED ABOVE' : 'PASSED BELOW') : m.v < P.vmin * 1.6 ? 'OUT OF ENERGY' : `MISSED BY ${Math.round(d * 100 / 50) * 50} m`;
      return { end: 'miss', why, d, dz };
    }
    m.rPrev = d3; m.rhPrev = rh;
    // ---- spent: too slow to fly on, or it cannot catch what it chases ----
    m.closeT = clos <= 0.05 && r > 40 ? m.closeT + h : 0;
    if (!P.cruise && m.age > P.boost && (m.v < P.vmin || m.closeT > 3)) return { end: 'spent', why: 'OUT OF ENERGY', d: r };
  }
  return null;
};
/* chaff against a radar seeker (far better side-on, when the target's own echo sinks into the clutter), flares
   against a heat-seeker (imaging seekers see through most of them) */
IC.mslDecoy = function (S, m, w, kind) {
  if (kind === 'flare') IC.flares && IC.flares(S, w); else IC.chaffFx && IC.chaffFx(S, w);
  if (m.fooled || m.lostLock || (m.hoj && w.jamming)) return false;
  const M = m.M, ir = M.seeker === 'IR';
  if ((kind === 'flare') !== ir) return false;
  let p = ir ? 0.5 * (1 - (M.ircm != null ? M.ircm : 0.3)) : 0.08 + (w.notchT > 0 ? 0.3 : 0);
  if (!ir && m.side === 'us' && IC.hasTech(S, 'e_eccm')) p *= 0.7;
  if (Math.random() >= p) return false;
  m.fooled = true; m.fx = w.x - (w.vx || 0) * 2; m.fy = w.y - (w.vy || 0) * 2; m.fvx = (w.vx || 0) * 0.15; m.fvy = (w.vy || 0) * 0.15;
  IC.emit(S, 'mstat', { m, t: w, what: 'decoyed', text: 'DECOYED' });
  return true;
};
/* defending: how long a crew takes to react (seconds, from a poor crew to a good one), when it turns side-on (time to
   impact), and a missile slower than this many times its own speed is dragged out of energy */
IC.DEF = { react: [9, 2], notchTti: 24, notchR: 220, dragV: 1.6, turn: 0.14 };
IC.defendPlan = function (S, w, dt, skill) {
  const m = w.mslIn;
  if (!m || m.dead) {
    w.mslIn = null;
    if (!w.def) return null;
    if (w.def !== 'recommit') { w.def = 'recommit'; w.defT = S.time; }
    if (S.time - w.defT > 8) { w.def = null; return null; }
    return { mode: 'recommit' };
  }
  const r = U.dist(m, w), sk = m.M.seeker;
  // does the crew know? a radar lock warns from the launch (semi-active, command, a fighter's radar guiding its
  // missile); an active seeker only when it goes on its own; a heat-seeker only when the approach warner sees it
  const warned = sk === 'SARH' || sk === 'CMD' || sk === 'HTK' || m.launchSeen || (sk === 'ARH' && m.active) || (sk === 'IR' && r < 90);
  if (!warned) return null;
  if (!w.def || w.def === 'recommit') { w.def = 'react'; w.defT = S.time + U.lerp(IC.DEF.react[0], IC.DEF.react[1], skill); }
  if (S.time < w.defT && w.def === 'react') return null;
  const bT = Math.atan2(m.y - w.y, m.x - w.x), hNow = Math.atan2(w.vy || 0, w.vx || 1), spd = Math.hypot(w.vx || 0, w.vy || 0) || 2;
  let mode, h, alt = null;
  if (m.v < spd * IC.DEF.dragV && r > 60 && m.age > (m.P ? m.P.boost : 0)) { mode = 'drag'; h = bT + Math.PI; }
  else if (m.tti < IC.DEF.notchTti * (0.7 + 0.5 * skill) || r < IC.DEF.notchR) {
    mode = 'notch';
    const G = guideOf(m) || m, bg = Math.atan2(w.y - G.y, w.x - G.x), h1 = bg + Math.PI / 2, h2 = bg - Math.PI / 2;
    h = Math.abs(U.angWrap(h1 - hNow)) < Math.abs(U.angWrap(h2 - hNow)) ? h1 : h2;
    // dive into the ground clutter (a poor crew forgets)
    if (skill > 0.3 && sk !== 'IR') alt = Math.min(w.alt, 0.6);
  } else { mode = 'crank'; const s = U.angWrap(hNow - bT) >= 0 ? 1 : -1; h = bT + s * 1.05; }
  // turning side-on is the moment to see: the word on the map and in the record
  if (mode === 'notch' && w.def !== 'notch') { IC.emit(S, 'mstat', { m, t: w, what: 'notch', text: 'NOTCHING' }); if (w.det || w.kind) IC.text(S, w.x, w.y, 'NOTCHING', '#ffb0a6'); }
  w.def = mode;
  w.notchT = mode === 'notch' ? 1.5 : 0;
  // chaff or flares in the last seconds, a salvo every two seconds or so while they last
  if ((w.cm || 0) > 0 && r < 140 && S.time >= (w.cmT || 0)) { w.cmT = S.time + (skill > 0.6 ? 1.6 : 2.6); w.cm--; IC.mslDecoy(S, m, w, sk === 'IR' ? 'flare' : 'chaff'); }
  return { mode, h, alt };
};
IC.DEF_WORDS = { react: 'DEFENDING', crank: 'DEFENDING · cranking', notch: 'DEFENDING · notching', drag: 'DEFENDING · dragging', recommit: 'recommitting' };

/* ---------- height profiles ---------- */
IC.PROFILES = {
  low:  { name: 'Low and slow', band: 'under 600 m', words: 'Flies low and slow to hide behind hills and under radar. Guns, short-range missiles and radars on high ground see it best.' },
  skim: { name: 'Low and fast', band: '30–50 m', words: 'Skims the ground fast. Radar sees it only 30–40 km out, so there is little time: long-range missiles reach less than half as far against it.' },
  mid:  { name: 'Middle height', band: '1–3 km', words: 'Flies at a middle height: every radar sees it, and most missiles reach it.' },
  high: { name: 'High and fast', band: '7–15 km, diving at the end', words: 'Flies high and fast, then dives on its target. Radar sees it far out, but only medium- and long-range missiles reach it up there.' },
  arc:  { name: 'High arc', band: 'up to 40–150 km', words: 'Flies a high ballistic arc, above the air, and falls almost straight down. Only missile-defence rounds meet it, high or at the end.' }
};
const PROF = { owa: 'low', lm: 'low', ahe: 'low', esj: 'mid', jdr: 'mid', isr: 'high', lacm: 'skim', mcm: 'skim', scm: 'high', glb: 'high', arm: 'high',
  hgv: 'arc', srbm: 'arc', marv: 'arc', mrbm: 'arc', pen: 'arc', rkt: 'arc', dcy: 'high', ftr: 'high', str: 'high', sead: 'high', ewj: 'high', bmr: 'high', civ: 'high', ga: 'low' };
IC.profileOf = function (x) {
  const type = typeof x === 'string' ? x : x.type || Object.keys(IC.THR).find(k => IC.THR[k] === x);
  const k = PROF[type] || (x.d && x.d.move === 'bal' ? 'arc' : 'mid');
  return Object.assign({ key: k }, IC.PROFILES[k]);
};

})(window.IC);
