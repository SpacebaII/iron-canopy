/* Iron Canopy — (round 5b, docs/focus/round-5b.md) the airport's day: slots and caps, never flight by flight.
   The game builds each airline's day from its aircraft and the kind of airline it is (IC.PROFILE: hub banks, early
   and late low-cost waves, freighters at night); the player only adjusts: a cap on departures an hour, an airline's
   bank moved earlier or later, and a night policy (open, a quota of movements an hour, or a curfew). The plan
   (IC.dayPlan) is what the board in the airport panel draws; the step holds a departure ready before its airline's
   next slot, over the cap or outside the night policy (IC.slotGate), and says why. Headless. */
(function (IC) {
'use strict';
const U = IC.U;
const NIGHT = h => h >= 23 || h < 6;
const hourOf = S => Math.floor((((S.time % 86400) + 86400) % 86400) / 3600);
const hh = h => String((h + 24) % 24).padStart(2, '0') + ':00';
IC.hh = hh;
/* departures by hour of the day each kind of airline wants (relative weights) */
IC.PROFILE = {
  flag:     [0.1, 0, 0, 0, 0, 0.2, 1.2, 1.6, 1.4, 1, 0.7, 0.8, 1.1, 1, 0.7, 0.8, 1, 1.4, 1.5, 1.2, 0.9, 0.7, 0.4, 0.2],
  budget:   [0.3, 0.2, 0, 0, 0, 0.4, 1.5, 1.3, 1, 0.8, 0.7, 0.7, 0.8, 0.8, 0.7, 0.8, 0.9, 1, 1.1, 1.1, 1, 1, 0.8, 0.5],
  regional: [0, 0, 0, 0, 0, 0.3, 1.5, 1.6, 1.2, 0.8, 0.6, 0.6, 0.7, 0.7, 0.6, 0.8, 1.1, 1.5, 1.4, 1, 0.6, 0.3, 0.1, 0],
  foreign:  [0.2, 0.1, 0, 0, 0, 0.1, 0.6, 0.9, 1.1, 1.2, 1.2, 1.2, 1.2, 1.1, 1.1, 1.1, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.3],
  cargo:    [1.5, 1.4, 1.2, 1, 0.8, 0.6, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.4, 0.6, 0.8, 1.2, 1.5]
};
/* quota: movements an hour at night, a noisy type counting two; margin: slots planned over what the fleet can fly,
   so an aircraft a little late or early still finds one */
IC.DAYB = { quota: 4, margin: 1.25, noiseK: 0.25, noiseMax: 4, recent: 900 };
IC.NIGHT_POL = {
  open: { name: 'Open', brief: 'anything may land and leave at night' },
  quota: { name: 'Quota', brief: `up to ${IC.DAYB.quota} quiet movements an hour at night (a heavy jet counts two)` },
  curfew: { name: 'Curfew', brief: 'nothing lands or leaves 23:00–06:00, freight included' }
};
// (heavy jets and freighters: the types that need 2.6 km of runway or more)
const noisy = T => !!(T.cargo || T.rwy >= 26);
IC.noisy = noisy;
/* the airport's settings: made with it, the night from the old curfew switch */
IC.dayb = ap => ap.dayb || (ap.dayb = { cap: 0, night: ap.curfew ? 'curfew' : 'quota', shift: {} });
IC.nightPolicy = ap => IC.dayb(ap).night;
IC.setNight = function (S, ap, v) {
  const B = IC.dayb(ap); if (!IC.NIGHT_POL[v] || B.night === v) return false;
  const was = B.night; B.night = v; ap.curfew = v === 'curfew'; ap._plan = null;
  if (v === 'open' && was === 'curfew') S.support = Math.max(0, S.support - 2);
  IC.log(S, v === 'open' ? 'warn' : 'info', 'AVIATION', `${ap.name}: night policy ${IC.NIGHT_POL[v].name.toLowerCase()}: ${IC.NIGHT_POL[v].brief}.`, ap);
  return true;
};
IC.setCap = function (S, ap, n) { const B = IC.dayb(ap); B.cap = Math.max(0, n | 0); ap._plan = null; return true; };
IC.shiftBank = function (S, ap, alId, d) { const B = IC.dayb(ap); B.shift[alId] = U.clamp((B.shift[alId] || 0) + d, -4, 4); if (!B.shift[alId]) delete B.shift[alId]; ap._plan = null; return B.shift[alId] || 0; };

/* the tails flying out of an airport, by airline, with the departures a day each could fly */
function fleetAt(S, ap) {
  const by = new Map();
  if (!S.av) return by;
  for (const tl of S.av.tails) {
    if (tl.where === 'lost') continue;
    const r = IC.avRoute(S, tl); if (!r || r.st !== 'active') continue;
    if (r.a !== ap.id && !(r.b && r.b.apt === ap.id)) continue;
    const al = IC.avAirline(S, tl.al); if (!al) continue;
    const cyc = IC.avCycle(S, S.byId[r.a], r.b, tl.T);
    const g = by.get(al) || { al, tails: 0, perDay: 0, noisy: 0 };
    g.tails++; g.perDay += U.clamp(86400 / cyc, 0.3, 10); if (noisy(tl.T)) g.noisy++;
    by.set(al, g);
  }
  return by;
}
const kindOf = al => IC.PROFILE[al.kind] ? al.kind : al.K && al.K.foreign ? 'foreign' : 'flag';
/* whole flights to hours, largest remainder first */
function toInts(raw, tot) {
  const out = raw.map(Math.floor); let left = tot - out.reduce((a, b) => a + b, 0);
  const ord = raw.map((v, h) => [v - Math.floor(v), h]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0 && i < ord.length; i++) if (raw[ord[i][1]] > 0) { out[ord[i][1]]++; left--; }
  return out;
}
/* move a flight out of hour h to the nearest hour with room that it may use: later first */
function moveOut(dep, h, room, ok) {
  for (let d = 1; d < 12; d++) for (const x of [h + d, h - d]) { const y = (x + 24) % 24; if (ok(y) && dep[y] < room(y)) return y; }
  return -1;
}
/* the plan for the day: departures by airline and hour, departures and arrivals by hour, and what the cap and the
   night policy moved. Kept for ten minutes, or until a setting changes */
IC.dayPlan = function (S, ap) {
  const B = IC.dayb(ap), P = ap._plan;
  if (P && S.time - P.t < 600 && P.n === (S.av ? S.av.tails.length : 0)) return P;
  const F = fleetAt(S, ap), st = ap.st || {}, out = { t: S.time, n: S.av ? S.av.tails.length : 0, al: [], dep: new Array(24).fill(0), arr: new Array(24).fill(0), want: new Array(24).fill(0), movedCap: 0, movedNight: 0, night: 0, cap: B.cap, capDep: st.depPerHour || 0, capArr: st.arrPerHour || 0 };
  const shut = h => NIGHT(h) && B.night === 'curfew';
  for (const g of F.values()) {
    const sh = B.shift[g.al.id] || 0, prof = IC.PROFILE[kindOf(g.al)];
    // at night a passenger airline flies only what the quota or an open night lets it (red-eyes), freight as it likes
    const w = prof.map((_, h) => { const v = prof[(h - sh + 24) % 24]; return shut(h) ? 0 : NIGHT(h) && g.al.kind !== 'cargo' && B.night === 'quota' ? v * 0.5 : v; });
    const sw = w.reduce((a, b) => a + b, 0) || 1, tot = Math.max(g.tails, Math.round(g.perDay * IC.DAYB.margin));
    const want = toInts(w.map(v => v * tot / sw), tot);
    out.al.push({ al: g.al, id: g.al.id, tails: g.tails, perDay: g.perDay, noisy: g.noisy / g.tails, shift: sh, want: want.slice(), dep: want });
  }
  for (const a of out.al) for (let h = 0; h < 24; h++) out.want[h] += a.want[h];
  // the night quota: movements an hour, a noisy aircraft counting two (arrivals take as many as departures)
  if (B.night === 'quota') for (let h = 0; h < 24; h++) {
    if (!NIGHT(h)) continue;
    const load = () => out.al.reduce((s, a) => s + a.dep[h] * (1 + a.noisy), 0) * 2;
    for (const a of out.al.slice().sort((p, q) => q.noisy - p.noisy)) while (a.dep[h] > 0 && load() > IC.DAYB.quota) { a.dep[h]--; out.movedNight++; const y = moveOut(a.dep, h, () => 99, x => !NIGHT(x)); if (y >= 0) a.dep[y]++; }
  }
  // the cap: departures over it in an hour go to the nearest hour with room
  const tot = h => out.al.reduce((s, a) => s + a.dep[h], 0);
  if (B.cap > 0) for (let h = 0; h < 24; h++) while (tot(h) > B.cap) {
    const a = out.al.slice().sort((p, q) => q.dep[h] - p.dep[h])[0];
    a.dep[h]--; out.movedCap++;
    const y = moveOut(new Array(24).fill(0).map((_, x) => tot(x)), h, () => B.cap, x => !shut(x) && !(NIGHT(x) && B.night === 'quota'));
    if (y >= 0) a.dep[y]++;
  }
  // arrivals come in about a turnaround before they leave again
  for (const a of out.al) for (let h = 0; h < 24; h++) { out.dep[h] += a.dep[h]; out.arr[(h + 23) % 24] += a.dep[h]; }
  for (let h = 0; h < 24; h++) if (NIGHT(h)) out.night += out.dep[h] + out.arr[h];
  ap._plan = out;
  return out;
};
/* slots used today: by airline, and departures by hour */
function useOf(S, ap) {
  const day = Math.floor(S.time / 86400), U0 = ap.slotUse;
  if (U0 && U0.day === day) return U0;
  return (ap.slotUse = { day, al: {}, hour: new Array(24).fill(0) });
}
IC.slotUse = function (S, ap, tl) { const u = useOf(S, ap); u.al[tl.al] = (u.al[tl.al] || 0) + 1; u.hour[hourOf(S)]++; };
const left = S => 3600 - ((((S.time % 86400) + 86400) % 86400) % 3600) + 5;
/* may this departure leave now? null, or the hold { k, w (s), why } */
IC.slotGate = function (S, ap, tl, al) {
  const h = hourOf(S), B = IC.dayb(ap);
  // (the Academy keeps the old rule: airliners rest at night, freighters fly unless there is a curfew)
  if (S.mode === 'academy' || !IC.FOCUS.slots) return NIGHT(h) && (ap.curfew || al.kind !== 'cargo') ? { k: 'night', w: 300, why: ap.curfew ? 'the night curfew: no departures 23:00–06:00' : 'airliners do not leave at night (23:00–06:00)' } : null;
  if (NIGHT(h) && B.night === 'curfew') return { k: 'night', w: left(S), why: 'the night curfew: no departures 23:00–06:00' };
  const P = IC.dayPlan(S, ap), u = useOf(S, ap);
  // a stand wanted by an aircraft circling outside: the tower lets this one go now, whatever its slot
  const wanted = S.threats.some(t => t.tail && !t.dead && t.toApt === ap.id && t.holding && t.standShort);
  if (B.cap > 0 && u.hour[h] >= B.cap) return { k: 'cap', w: left(S), why: `the cap of ${B.cap} departures an hour is reached; it goes at ${hh(h + 1)}` };
  if (NIGHT(h) && B.night === 'quota') {
    const used = u.hour[h] * 2 * (1 + (noisy(tl.T) ? 1 : 0));
    if (used + (noisy(tl.T) ? 4 : 2) > IC.DAYB.quota * 2 && u.hour[h] > 0) return { k: 'night', w: left(S), why: `the night quota (${IC.DAYB.quota} movements an hour) is full; it goes at ${hh(h + 1)}` };
  }
  if (wanted) return null;
  const a = P.al.find(x => x.id === al.id); if (!a) return null;
  // its airline's slots so far today against the flights it has flown (late ones catch up)
  let cum = 0; for (let x = 0; x <= h; x++) cum += a.dep[x];
  const used = u.al[al.id] || 0;
  if (used < cum) return null;
  let nx = -1; for (let x = h + 1, c = cum; x < 24; x++) { c += a.dep[x]; if (c > used) { nx = x; break; } }
  const w = nx > 0 ? (nx - h - 1) * 3600 + left(S) : 86400 - ((((S.time % 86400) + 86400) % 86400)) + 5;
  return { k: 'slot', w: Math.min(w, 4 * 3600), why: `its airline's next slot is at ${hh(nx > 0 ? nx : 0)}` };
};
/* an inbound flight would land in a curfew: how long it waits to leave, landing no earlier than 06:00. flight is
   its cruise time at best; it may take up to half an hour longer (climb, approach, a hold) */
IC.arrCurfew = function (S, ap, flight) {
  if (S.mode === 'academy' || !IC.FOCUS.slots || IC.dayb(ap).night !== 'curfew') return 0;
  const sod = t => ((t % 86400) + 86400) % 86400, nightAt = t => NIGHT(Math.floor(sod(t) / 3600));
  const t0 = S.time + flight, t1 = t0 + 1800;
  if (!nightAt(t0) && !nightAt(t1) && Math.floor(t1 / 86400) === Math.floor(t0 / 86400)) return 0;
  const s0 = sod(t0), to6 = s0 < 6 * 3600 ? 6 * 3600 - s0 : 30 * 3600 - s0;
  return to6 + 60;
};
/* each day, the towns near an airport count the night's movements (noise) */
IC.scheduleTick = function (S) {
  const day = Math.floor(S.time / 86400);
  for (const ap of IC.bases(S)) {
    if (ap.kind !== 'airport' || ap.owner !== 'us' || !ap.dayLog || ap.noiseD === day) continue;
    ap.noiseD = day;
    const L = IC.aptDayLog(S, ap), P = L.prev; if (!P) continue;
    let n = 0; for (let h = 0; h < 24; h++) if (NIGHT(h)) n += P.arr[h] + P.dep[h];
    ap.nightN = n;
    if (!n) continue;
    const c = IC.cities(S).filter(x => x.owner === 'us').sort((p, q) => U.dist(p, ap) - U.dist(q, ap))[0];
    if (!c || U.dist(c, ap) > 400) continue;
    const v = Math.min(IC.DAYB.noiseMax, n * IC.DAYB.noiseK);
    c.morale = U.clamp((c.morale || 50) - v, 0, 100);
    if (n >= 6 && (!ap.noiseLogT || S.time - ap.noiseLogT > 3 * 86400)) { ap.noiseLogT = S.time; IC.log(S, 'warn', 'AVIATION', `${c.name}: ${n} aircraft woke people last night near ${ap.name}. Morale −${v.toFixed(1)}. A night quota or curfew (the airport's day board) keeps it down.`, ap); }
  }
};
/* what the board shows: the plan, today so far, what the runways take, and each setting's effect in words */
IC.dayBoard = function (S, ap) {
  const P = IC.dayPlan(S, ap), B = IC.dayb(ap), st = ap.st || {}, L = IC.aptDayLog(S, ap), M = IC.aptMonth(S, ap);
  const perFlight = M.flights > 0 ? (M.land + M.pax + M.cargo) / M.flights : 4;
  const mo = S.mode === 'story' ? IC.dpm(S) : 30, moW = S.mode === 'story' ? 'a month' : 'over 30 days';
  const peak = P.dep.reduce((b, v, i, a) => v > a[b] ? i : b, 0);
  const capWords = B.cap > 0 ? (P.movedCap ? `The cap of ${B.cap} departures an hour moves ${P.movedCap} flight${P.movedCap > 1 ? 's' : ''} a day out of the busiest hours. Airlines count the wait as delay.` : `The cap of ${B.cap} departures an hour moves nothing today: the busiest hour plans ${P.dep[peak]}.`)
    : `No cap: the busiest hour, ${hh(peak)}, plans ${P.dep[peak]} departures; the runways take ${P.capDep} an hour.`;
  // the night under each policy, for the choice
  const nightOf = v => { const keep = B.night; B.night = v; ap._plan = null; const Q = IC.dayPlan(S, ap); B.night = keep; ap._plan = null; return Q.night; };
  const N = { open: nightOf('open'), quota: nightOf('quota'), curfew: 0 };
  IC.dayPlan(S, ap);
  const fee = n => U.money(n * perFlight * 0.5 * mo);
  const nightWords = {
    open: `About ${N.open} movements a night, about ${fee(N.open)} ${moW} in fees. The nearest town loses morale with every night movement.`,
    quota: `About ${N.quota} movements a night, about ${fee(N.quota)} ${moW} in fees; the town hears less.`,
    curfew: `No night movements: about ${fee(N.open)} ${moW} of night fees gone, and cargo airlines like it less with every flight. The town sleeps.`
  };
  return { plan: P, cap: B.cap, night: B.night, nightWords, capWords, peak, capDep: st.depPerHour || 0, capArr: st.arrPerHour || 0, today: { arr: L.arr, dep: L.dep }, perFlight };
};
})(window.IC);
