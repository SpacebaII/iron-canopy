/* A traffic generator for airport tests: arrivals and departures at set rates, straight into ground operations,
   without the airlines' business in between. Used by tests/run.js and airporttest.js. */
const IC = require('../headless.js');
const U = IC.U;

/* run only what moves aircraft on the ground (weather, airport upkeep, ground ops) */
function tick(S, dt) { S.time += dt; IC.weather(S, dt); IC.updateBases(S, dt); IC.gops(S, dt); if (S.later) { const due = S.later.filter(l => l.t <= S.time); S.later = S.later.filter(l => l.t > S.time); for (const l of due) l.fn(); } }

/* o: { arr, dep (per hour), follow (keep them at the rated capacity), hours, fill (share of stands occupied at the start),
   mix: [[type, weight]], full (use IC.step) } */
function drive(S, ap, o) {
  const mix = o.mix || [['narrow', 6], ['wide', 3], ['turbo', 1]];
  const stands = IC.aptStands(ap).filter(s => s.linked && s.hp > 0 && (s.zone === 'civil' || !s.zone));
  const fits = (s, type) => IC.STAND_FITS[s.size].includes(IC.ACTYPES[type].stand);
  const r = { arr: 0, dep: 0, div: 0, divWhy: {}, crash: 0, pending: [], maxHold: 0, left: 0, peak: 0, parkedTypes: new Map() };
  let n = 0;
  // aircraft already parked, ready to leave
  for (const s of stands) if (!s.occ && Math.random() < (o.fill == null ? 0.6 : o.fill)) { s.occ = 'pk' + (n++); r.parkedTypes.set(s.occ, s.size === 'l' ? U.wpick([['wide', 1], ['narrow', 1]]) : s.size === 'm' ? 'narrow' : 'turbo'); }
  const busy = new Set();
  let tArr = 0, tDep = 0, tTry = 0;
  const dt = 0.5, end = S.time + o.hours * 3600;
  IC.on((S2, type, d) => { if (S2 === S && type === 'crash') r.crash++; });
  let tRate = 0;
  while (S.time < end) {
    // follow: demand keeps pace with the capacity the panel shows for the traffic actually flying
    if (o.follow && (tRate -= dt) <= 0) { tRate = 600; const st = IC.aptStats(S, ap); o.arr = st.arrPerHour; o.dep = st.depPerHour; }
    tArr += dt * (o.arr || 0) / 3600; tDep += dt * (o.dep || 0) / 3600;
    while (tArr >= 1) { tArr -= 1; r.pending.push({ type: U.wpick(mix), t: S.time, cs: 'TST ' + (n++) }); }
    while (tDep >= 1) {
      tDep -= 1;
      const cands = stands.filter(s => s.occ && !busy.has(s.occ) && r.parkedTypes.has(s.occ));
      if (!cands.length) { r.noDep = (r.noDep || 0) + 1; continue; }
      const s = U.pick(cands), id = s.occ, type = r.parkedTypes.get(id);
      busy.add(id);
      const m = IC.gopsDepart(S, ap, { type, node: s.id, stand: s, startT: 0, who: id, onAir: () => { r.dep++; busy.delete(id); r.parkedTypes.delete(id); }, onDead: () => { busy.delete(id); } });
      if (!m) { busy.delete(id); r.noPlan = (r.noPlan || 0) + 1; }
    }
    // arrivals at the approach fix ask for the runway every few seconds
    if ((tTry -= dt) <= 0) {
      tTry = 5;
      for (const a of r.pending.slice()) {
        const s = stands.find(x => !x.occ && fits(x, a.type));
        if (!s) continue;
        if (!a.faf) a.faf = IC.gopsFaf(S, ap, a.type);
        const m = IC.gopsLand(S, ap, { type: a.type, target: s.id, stand: s, faf: a.faf, who: a.cs, onPark: () => { r.arr++; r.parkedTypes.set(a.cs, a.type); s.occ = a.cs; } });
        if (m === 'hold') continue;
        r.pending.splice(r.pending.indexOf(a), 1);
        if (m === 'divert') { r.div++; const why = IC.aptLandWhy(S, ap, IC.ACTYPES[a.type]) || 'other'; r.divWhy[why] = (r.divWhy[why] || 0) + 1; continue; }
        s.occ = a.cs; r.maxHold = Math.max(r.maxHold, S.time - a.t);
      }
    }
    if (o.full) IC.step(S, dt); else tick(S, dt);
    r.peak = Math.max(r.peak, ap.moves.length);
    if (o.each) o.each(S, r);
  }
  r.left = ap.moves.length;
  r.oldest = ap.moves.reduce((m, x) => Math.max(m, S.time - x.born), 0);
  r.grid = ap.kpi.grid || 0; r.stuck = ap.kpi.stuck || 0; r.risk = ap.kpi.risk || 0;
  return r;
}
/* lay an airport out again; airliners parked there are sent away first, since their stands go */
function relayout(S, ap, template) {
  if (S.av) for (const t of S.av.tails) if (t.at === ap.id && t.where === 'stand') { t.where = 'away'; t.at = null; t.stand = null; t.t = U.rand(300, 1800); }
  IC.layoutAirport(ap, template, 0);
  IC.aptStats(S, ap);
}
/* a game with the KDEN-scale layout in place of the capital airport */
function kdenGame(seed, hour) {
  const S = IC.newGame({ seed: seed || 12345, mode: 'story', hour: hour == null ? 10 : hour });
  const ap = S.byId[S.story.cap];
  // the airlines are sent elsewhere so the test sees only its own traffic
  if (S.av) { S.av.tails = []; S.av.routes = []; }
  S.threats = S.threats.filter(t => !t.tail);
  IC.layoutAirport(ap, 'kden', 0);
  IC.aptStats(S, ap);
  S.weather.hold = true;
  return { S, ap };
}
module.exports = { drive, tick, kdenGame, relayout };
