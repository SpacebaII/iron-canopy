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
/* [target height km, reach km]. The first and last rows are the band: nothing outside it */
IC.REACH = {
  IR:  [[0.02, 3], [0.1, 5], [3, 5.5], [4, 3]],
  IR2: [[0.02, 3.5], [0.1, 6], [3.5, 6.5], [4.5, 3.5]],
  INT: [[0.02, 10], [0.2, 15], [3, 15], [4, 8]],
  SR:  [[0.02, 7], [0.2, 11], [1, 12], [4, 12], [6, 7]],
  MR:  [[0.03, 22], [0.3, 32], [1.5, 45], [12, 45], [20, 25]],
  LR:  [[0.03, 45], [0.3, 72], [2, 100], [15, 100], [25, 55]],
  AAM: [[0.03, 20], [0.5, 35], [4, 45], [15, 45], [20, 30]],
  TBD: [[0.05, 18], [1, 28], [5, 35], [25, 35], [35, 20]],
  HAT: [[40, 120], [60, 200], [120, 200], [150, 120]],
  EXO: [[90, 300], [200, 500], [600, 500], [700, 300]]
};
const keyOf = M => typeof M === 'string' ? M : M._k || (M._k = Object.keys(IC.MUN).find(k => IC.MUN[k] === M));
const munOf = M => typeof M === 'string' ? IC.MUN[M] : M;
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
