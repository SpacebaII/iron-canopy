/* Iron Canopy — Free build (wave 14): the Career's country with no story, for building airports and watching them
   work. Money does not run out, every part and research item is open, building can finish at once, and airlines
   come by themselves to fill the stands the player builds: no deals to sign, no goals, no cards. The airport is the
   game. Headless: the panel that switches these is in ui.js. */
(function (IC) {
'use strict';
const U = IC.U;

/* the switches: instant building, airlines that come by themselves, general aviation; the treasury it tops up to */
IC.FREE = { budget: 1e6, every: 120, share: 0.8, perRoute: 2, most: 3, gap: 900, busy: 0.6 };

/* a free game is made like the Career (mode 'story', no airports), then stripped of the story */
IC.freeInit = function (S) {
  S.free = { instant: true, traffic: true, ga: true, why: {} };
  S.budget = IC.FREE.budget;
  if (S.econ) S.econ.lastBudget = S.budget;   // (the treasury is not income: the statement shows only the airports' own money)
  S.tech.done = new Set(IC.TECH.map(t => t.id)); S.tech.slots = [null, null];
  const st = S.story, C = S.camp;
  C.cards = []; C.comms = []; C.sched = [];
  st.goals = []; st.beats = []; st.tut = false;
  if (S.av) S.av.reqT = 1e15;   // (no offers: airlines come by themselves)
  S.ad.roe = 'hold';
  return S;
};

/* every step of a free game, in place of the story (story.js hands over) */
IC.freeTick = function (S, dt) {
  const F = S.free;
  if (S.budget < IC.FREE.budget / 2) { if (S.econ) S.econ.lastBudget += IC.FREE.budget - S.budget; S.budget = IC.FREE.budget; }
  if (S.story) S.story.standing = 60;
  if ((F.t = (F.t || 0) - dt) > 0) return;
  F.t = IC.FREE.every;
  for (const ap of IC.bases(S)) if (ap.kind === 'airport' && ap.owner === 'us' && ap.parts) {
    F.why[ap.id] = F.traffic ? IC.freeTraffic(S, ap) : '';
  }
};

/* Airlines come until the airport is full: every couple of minutes each kind of stand (large, medium, small, cargo)
   whose stands stood less than 60% used by day lately gets more aircraft, of the largest type the airport can take
   there, while nothing is holding for it; so a new apron fills within the hour or two its aircraft take to come,
   and the first thing to run out (stands, runway, terminal) shows. Returns '' or why none come. */
const CLASS = { l: ['widel', 'wide', 'jumbo', 'narrow'], m: ['narrow'], s: ['rj', 'turbo'], cargo: ['cargo', 'cargoprop'] };
const KIND = { l: ['flag', 'foreign'], m: ['flag', 'budget'], s: ['regional'], cargo: ['cargo'] };
const classOf = T => T.cargo ? 'cargo' : T.stand === 'xl' ? 'l' : T.stand;
const standClass = s => s.cargo || s.zone === 'cargo' ? 'cargo' : s.size === 'xl' ? 'l' : s.size;
IC.freeTraffic = function (S, ap) {
  IC.aptGraph(ap);
  const st = IC.aptStats(S, ap), stands = IC.aptStands(ap).filter(s => s.linked !== false && s.hp > 0 && s.zone !== 'mil' && s.zone !== 'light');
  if (!st.rwy || !st.rwy.length) return 'No runway yet.';
  if (!stands.length) return 'No stands joined to the runway yet: an apron needs a taxiway to it.';
  const n = { l: 0, m: 0, s: 0, cargo: 0 }, busy = { l: 0, m: 0, s: 0, cargo: 0 }, have = { l: 0, m: 0, s: 0, cargo: 0 };
  for (const s of stands) { const c = standClass(s); n[c]++; if (s.occ) busy[c]++; }
  const A = S.av, routes = new Map(A.routes.map(r => [r.id, r]));
  const coming = { l: 0, m: 0, s: 0, cargo: 0 };
  for (const t of A.tails) { const r = routes.get(t.route); if (r && r.a === ap.id && t.where !== 'lost') { have[classOf(t.T)]++; if (!t.lastStand) coming[classOf(t.T)]++; } }
  // (anything holding for this airport, or diverted from it in the last six hours, says it is full: wait)
  const full = S.threats.some(t => t.tail && t.toApt === ap.id && t.holding && !t.dead) || S.time - (ap.divLogT || -1e9) < 6 * 3600;
  const F = ap.freeFill = ap.freeFill || { occ: {}, addT: {} };
  let why = '';
  for (const c of ['l', 'm', 's', 'cargo']) {
    if (!n[c]) continue;
    // (the stands' use by day: at night every aircraft is parked and the gates look full)
    const h = ((S.time % 86400) + 86400) % 86400 / 3600, dayT = h >= 7 && h < 22;
    if (dayT) F.occ[c] = F.occ[c] == null ? busy[c] / n[c] : F.occ[c] * 0.9 + busy[c] / n[c] * 0.1;
    // (one on its way to its first stand here counts for half a stand: the stands' use does not show it yet)
    const occ = (F.occ[c] || 0) + coming[c] * 0.5 / n[c];
    // (a fresh apron gets four in five of its stands' worth at once; after that a few at a time, fewer as it fills)
    const first = Math.round(n[c] * IC.FREE.share) - have[c];
    const more = dayT && !full && occ < IC.FREE.busy && have[c] < n[c] * IC.FREE.most && S.time - (F.addT[c] || -1e9) >= IC.FREE.gap;
    const need = first > 0 ? first : more ? Math.max(1, Math.round(n[c] * (IC.FREE.busy - occ) * 0.5)) : 0;
    if (need <= 0) continue;
    const types = CLASS[c].filter(k => !IC.aptCanTake(S, ap, IC.ACTYPES[k]));
    if (!types.length) { why = why || `No airliners for the ${c === 'cargo' ? 'cargo' : IC.STAND[c].name} stands: ${IC.aptCanTake(S, ap, IC.ACTYPES[CLASS[c][CLASS[c].length - 1]])}.`; continue; }
    const dests = destsFor(S, ap);
    for (let left = need, i = 0; left > 0 && i < 40; i++) {
      const k = types[(A.routes.length + i) % Math.min(types.length, c === 'l' ? 3 : 2)], m = Math.min(left, IC.FREE.perRoute);
      IC.avAddRoute(S, airline(S, U.pick(KIND[c]), ap), ap, dests[(A.routes.length + i) % dests.length], k, m, true);
      // (spread over a whole cycle of the route, so they do not all come and go in one bank and leave the gates empty)
      for (const tl of A.tails.slice(-m)) tl.t = U.rand(300, 4 * tl.T.turn);
      left -= m;
    }
    F.addT[c] = S.time;
  }
  return why;
};
/* where they fly: the foreign airports, and our other airports that are open */
function destsFor(S, ap) {
  const L = IC.avPorts(S).slice();
  for (const b of IC.bases(S)) if (b !== ap && b.kind === 'airport' && b.owner === 'us' && b.st && b.st.rwy && b.st.rwy.length) L.push({ apt: b.id });
  return L;
}
/* an airline of that kind (the first airport founded is everyone's home; a foreign one is a neighbour's) */
function airline(S, kind, ap) {
  const A = S.av, have = A.airlines.filter(a => a.kind === kind);
  if (have.length) return U.pick(have);
  const ports = IC.avPorts(S);
  return IC.avAddAirline(S, kind, ap, kind === 'foreign' && ports.length ? { country: U.pick(ports).k } : undefined);
}

/* the first airport founded in a free game stands for the capital's (panels and the camera look for it) */
IC.on((S, type, d) => {
  if (!S.free) return;
  if (type === 'founded' && S.story && !S.story.cap) S.story.cap = d.id;
});
})(window.IC);
