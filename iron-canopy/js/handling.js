/* Iron Canopy — (round 5b, docs/focus/round-5b.md) ground handling as counts the airport owns: tugs push aircraft
   back, buses carry passengers to and from remote stands, fuel trucks refuel what no hydrant serves. One number per
   kind (ap.fleet), nothing per vehicle: no assigning, no repairs (upkeep covers them). Each airport starts with what
   its stands need and, unless the player turns it off, keeps matched to the recommendation as it grows. Too few
   means a departure held for a named reason, with buying more as its fix. Headless. */
(function (IC) {
'use strict';
const U = IC.U;
/* price each, running cost an hour each, how long one job keeps a vehicle busy (s) */
IC.GSE = {
  tug: { name: 'Tugs', one: 'tug', cost: 1.5, up: 0.02, job: 360, does: 'push aircraft back off the stands' },
  bus: { name: 'Apron buses', one: 'bus', cost: 0.6, up: 0.015, job: 900, does: 'carry passengers to and from remote stands' },
  fuel: { name: 'Fuel trucks', one: 'fuel truck', cost: 0.8, up: 0.02, job: 3600 / (IC.FUEL_TRUCKS / 2), does: 'refuel aircraft where there is no hydrant' }
};
const stands = ap => IC.aptStands(ap).filter(s => s.linked !== false && (s.zone || 'civil') !== 'mil');
/* what the airport needs of each, for its stands and its busiest hour */
IC.gseNeed = function (S, ap) {
  const L = stands(ap), st = ap.st || {};
  const peak = S.av && IC.dayPlan ? Math.max(1, ...IC.dayPlan(S, ap).dep) : Math.max(1, Math.round((st.depPerHour || 4) / 2));
  const push = L.filter(s => !s.drive).length, remote = L.filter(s => !s.contact && !s.cargo && s.size !== 'xs').length, share = L.length ? remote / L.length : 0;
  return {
    tug: push ? Math.max(1, Math.ceil(peak * 1.3 * IC.GSE.tug.job / 3600), Math.ceil(push / 4)) : 0,
    bus: remote ? Math.max(1, Math.ceil(peak * share * 1.3 * IC.GSE.bus.job / 3600), Math.ceil(remote / 4)) : 0,
    // (two a tank at least, as before trucks were counted)
    fuel: st.hydrant ? 0 : (st.tanks ? Math.max(2 * st.tanks, Math.ceil(peak * 1.2 * IC.GSE.fuel.job / 3600)) : 0),
    peak, stands: L.length, remote, push
  };
};
/* the airport's fleet, made the first time it is asked for: what it needs (the Starter comes ready) */
IC.fleet = function (S, ap) {
  if (!ap.fleet) { const N = IC.gseNeed(S, ap); ap.fleet = { tug: N.tug, bus: N.bus, fuel: N.fuel, auto: true, busy: { tug: [], bus: [], fuel: [] } }; }
  return ap.fleet;
};
IC.gseBuy = function (S, ap, k, n, quiet) {
  const F = IC.fleet(S, ap), G = IC.GSE[k]; if (!G || !n) return false;
  if (n > 0) { const c = G.cost * n; if (S.budget < c) { if (!quiet) IC.log(S, 'warn', 'AVIATION', IC.inRed && IC.inRed(S) ? IC.redWhy(S) : `Not enough money: ${U.money(c)} for ${n} ${n > 1 ? G.name.toLowerCase() : G.one}.`, ap); return false; } IC.pay(S, 'buyLogi', c); F[k] += n; }
  else { const m = Math.min(F[k], -n); if (!m) return false; F[k] -= m; const back = G.cost * 0.5 * m; S.budget += back; IC.econBook(S, 'refund', back); }
  return true;
};
IC.gseAuto = (S, ap, on) => { IC.fleet(S, ap).auto = on == null ? !IC.fleet(S, ap).auto : !!on; return IC.fleet(S, ap).auto; };
/* running costs of every airport's vehicles, ₭M an hour */
IC.fleetUpkeep = function (S) {
  let v = 0;
  for (const ap of IC.bases(S)) if (ap.fleet && ap.owner === 'us') for (const k in IC.GSE) v += (ap.fleet[k] || 0) * IC.GSE[k].up;
  return v;
};
const busyOf = (F, k, t) => (F.busy[k] = (F.busy[k] || []).filter(x => x > t));
IC.gseFree = (S, ap, k) => { const F = IC.fleet(S, ap); return Math.max(0, (F[k] || 0) - busyOf(F, k, S.time).length); };
/* may this departure leave its stand now? null, or the hold { k, w, why }. take: claim the vehicles (only once
   everything else has let it go, so a tug is not kept waiting on an airway release) */
IC.gseGate = function (S, ap, tl, s, take) {
  if (S.mode === 'academy' || !IC.FOCUS.gse) return null;
  const F = IC.fleet(S, ap), bus = !s.cargo && !s.contact && !tl.T.cargo && !!tl.T.seats, tug = !s.drive;
  const wait = k => { const L = busyOf(F, k, S.time); return !(F[k] || 0) ? -1 : L.length >= F[k] ? Math.max(30, Math.min(...L) - S.time) : 0; };
  const why = (k, w) => w < 0 ? (k === 'bus' ? 'no apron buses: passengers cannot reach a remote stand' : 'no tugs to push it back') : `every ${IC.GSE[k].one} is busy (${F[k]} owned)`;
  for (const k of [bus && 'bus', tug && 'tug'].filter(Boolean)) { const w = wait(k); if (w) return { k, w: w < 0 ? 600 : w, why: why(k, w) }; }
  if (take) { if (bus) F.busy.bus.push(S.time + IC.GSE.bus.job); if (tug) F.busy.tug.push(S.time + IC.GSE.tug.job); }
  return null;
};
/* fuel trucks: refuellings an hour they can do */
IC.gseFuelCap = (S, ap) => (IC.FOCUS.gse && S.mode !== 'academy' && ap.kind === 'airport' && ap.owner === 'us' ? IC.fleet(S, ap).fuel : null);
/* every five game minutes: an airport kept matched buys and sells to what it needs */
IC.gseTick = function (S) {
  for (const ap of IC.bases(S)) {
    if (ap.kind !== 'airport' || ap.owner !== 'us' || !ap.parts || !ap.st || !(ap.st.longest > 0)) continue;
    const F = IC.fleet(S, ap);
    if (!F.auto) continue;
    const N = IC.gseNeed(S, ap);
    for (const k in IC.GSE) { const d = N[k] - F[k]; if (d > 0) IC.gseBuy(S, ap, k, d, true); else if (d < -1) IC.gseBuy(S, ap, k, d + 1, true); }
  }
};
})(window.IC);
