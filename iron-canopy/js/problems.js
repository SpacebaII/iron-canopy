/* Iron Canopy — (round 3, docs/focus/round-3.md) the airport as the interface. What is going wrong at an airport,
   where on the map it is happening, and the one click that fixes it: a build piece already placed where it helps,
   or the airline's deal card (IC.aptProblems, IC.fixPlan). The chain from the city to the money, in numbers
   (IC.aptChain), and one money line that says the same everywhere (IC.moneyLine). Headless: the markers, the
   panel and the overlay that show these are drawn by ui.js, inspector.js and render-chain.js. */
(function (IC) {
'use strict';
const U = IC.U;
const short = n => n.replace(/ (International|Airport|Field)$/, '');
const rwMid = rw => ({ x: (rw.a.x + rw.b.x) / 2, y: (rw.a.y + rw.b.y) / 2 });
const built = (ap, k) => ap.parts.filter(p => p.kind === k && p.built && p.hp > p.max * 0.25);
const PIECE_FIX = { hangar: 'hangar', stands: 'tstraight', gates: 'tstraight', pax: 'tstraight', cargoStands: 'cargoarea', cargoT: 'cargoarea', fuelDeps: 'fuel' };
/* (wave 13) with the parts one by one (IC.FOCUS.parts), a fix places the one part that is missing: an apron for
   stands (beside the terminal, for gates), a terminal for passengers, a cargo shed for cargo */
const PART_FIX = { hangar: 'hangar', stands: 'apron', gates: 'apron', pax: 'terminal', cargoStands: 'apron', cargoT: 'cargo', fuelDeps: 'fuel' };
const FIX_WORD = { hangar: 'Build a hangar', tstraight: 'Build a terminal with stands', cargoarea: 'Build a cargo area', fuel: 'Build a fuel tank', fire: 'Build a fire station', ils: 'Build a landing system',
  apron: 'Build an apron', terminal: 'Build a terminal', cargo: 'Build a cargo shed' };
/* the part a fix places for what is missing ('stands', 'pax', ...) */
IC.fixPart = k => (IC.FOCUS && IC.FOCUS.parts ? PART_FIX : PIECE_FIX)[k];
/* the size an area part is placed at by a fix, long side along the runway (w × h, 100 m units) */
const FIX_AREA = { apron: { m: [3, 0.8], l: [3.2, 1.3] }, terminal: { m: [2, 0.8] }, cargo: { m: [1.6, 0.8] } };

/* ---------- problems ----------
   Each: { id, kind, lvl ('bad' | 'warn' | 'deal'), x, y (where it happens), title, text, fix }. A fix is
   { part, near: {x, y}, label } (a build piece placed near that point), or { deal: id, label } (its card).
   Only what the player can act on now; the layout warnings stay in the airport panel's list. */
IC.aptProblems = function (S, ap) {
  const out = [];
  if (!ap || !ap.parts || ap.owner !== 'us' || ap.locked || ap.kind !== 'airport') return out;
  const st = ap.st || {}, rws = built(ap, 'runway'), A = S.av;
  if (!rws.length) return out;
  const terms = built(ap, 'terminal'), term = terms[0], aprons = built(ap, 'apron');
  const hub = term || aprons[0] || ap;
  // arrivals circling because every stand that fits them is taken
  const wait = S.threats.filter(t => t.tail && !t.dead && t.toApt === ap.id && t.holding && t.standShort);
  if (wait.length) out.push({ id: ap.id + ':stand', kind: 'stand', lvl: 'bad', x: hub.x, y: hub.y, title: `${term ? term.name || 'Terminal' : 'Stands'}: ${wait.length} aircraft waiting for a stand`,
    text: `${wait.map(t => t.tail.cs).slice(0, 3).join(', ')} ${wait.length > 1 ? 'are' : 'is'} circling: every stand that fits is taken. They divert after 25 minutes.`, fix: { part: IC.fixPart('stands'), near: hub, label: IC.fixPart('stands') === 'apron' ? 'Add an apron with stands' : 'Add a terminal with stands' } });
  // the terminal running full
  if (term && st.pax > 0 && (ap.paxRate || 0) > st.pax * 0.9) out.push({ id: ap.id + ':term', kind: 'term', lvl: 'warn', x: term.x, y: term.y, title: `Terminal full: ${Math.round(ap.paxRate).toLocaleString('en-US')} of ${Math.round(st.pax).toLocaleString('en-US')} passengers an hour`,
    text: 'Boarding slows down and turnarounds run long. A second terminal doubles the room.', fix: { part: IC.fixPart('pax'), near: term, label: 'Add a terminal' } });
  // departures waiting for fuel trucks, or no fuel at all
  const fuel = built(ap, 'fuel'), onStand = A ? A.tails.filter(t => t.at === ap.id && t.where === 'stand') : [];
  if (!fuel.length) out.push({ id: ap.id + ':nofuel', kind: 'fuel', lvl: 'bad', x: hub.x, y: hub.y, title: 'No fuel farm: departures cannot refuel', text: 'Airliners leave with what they brought, and airlines will not base aircraft here.', fix: { part: 'fuel', near: hub, label: 'Build a fuel farm' } });
  // (round 5b) departures held on their stands, each reason on its own with its own fix (a night stop is no problem)
  for (const h of IC.aptHolds ? IC.aptHolds(S, ap) : []) {
    if (h.k === 'night' || h.wait < 180) continue;
    const head = `${h.n} departure${h.n > 1 ? 's' : ''} held ${U.dur(h.wait)}`, at = h.k === 'fuel' || h.k === 'truck' ? (fuel[0] || hub) : h.k === 'rwy' || h.k === 'wind' || h.k === 'ga' ? rwMid(rws[0]) : hub;
    const P = { id: ap.id + ':hold:' + h.k, kind: 'hold', hold: h.k, lvl: h.wait > 3600 ? 'bad' : 'warn', x: at.x, y: at.y };
    const gse = k => { const G = IC.GSE[k], n = Math.max(1, Math.min(4, h.n)); return { act: 'gse', v: k, n, label: `Buy ${n} ${n > 1 ? G.name.toLowerCase() : G.one} (${U.money(G.cost * n)})` }; };
    if (h.k === 'truck') Object.assign(P, { kind: 'fuel', id: ap.id + ':fuel', title: `Fuel: ${h.n} departure${h.n > 1 ? 's' : ''} waiting ${Math.round(h.wait / 60)} min for a truck`,
      text: IC.FOCUS.gse && ap.fleet ? `${ap.fleet.fuel} fuel trucks refuel ${ap.fleet.fuel * IC.FUEL_TRUCKS / 2} aircraft an hour. Buy more, or a hydrant system ends the wait.` : `${fuel.length} fuel farm${fuel.length > 1 ? 's' : ''} with ${st.tanks * 2} trucks refuel ${st.trucks} aircraft an hour. Another tank brings two more trucks.`,
      fix: IC.FOCUS.gse && ap.fleet ? gse('fuel') : fuel[0] && { part: 'fuel', near: fuel[0], label: 'Add a fuel tank' } });
    else if (h.k === 'tug' || h.k === 'bus') Object.assign(P, { title: `${head}: ${h.k === 'tug' ? 'waiting for a tug' : 'waiting for an apron bus'}`, text: `${h.why.charAt(0).toUpperCase() + h.why.slice(1)}. Each ${IC.GSE[h.k].one} ${IC.GSE[h.k].does.replace(/^\w+/, w => w + (w.endsWith('h') ? 'es' : 's'))}; the airport recommends ${IC.gseNeed(S, ap)[h.k]}.`, fix: gse(h.k) });
    else if (h.k === 'fuel') Object.assign(P, { kind: 'fuel', id: ap.id + ':fuel', title: `Fuel: ${h.n} departure${h.n > 1 ? 's' : ''} waiting ${Math.round(h.wait / 60)} min: the tanks are empty`,
      text: `Deliveries refill each tank by ${IC.FUEL_IN} units an hour. More tanks hold more; a hydrant system pipes fuel in.`, fix: fuel[0] && { part: 'fuel', near: fuel[0], label: 'Add a fuel tank' } });
    else if (h.k === 'rwy') Object.assign(P, { title: `${head}: cannot take off`, text: `${h.why.charAt(0).toUpperCase() + h.why.slice(1)}. After ${U.dur(IC.HOLD_CANCEL)} the airline cancels and takes the aircraft off the route. A longer runway (a new one, or this one rebuilt longer) lets them go; until then, decline offers for aircraft that need more runway.` });
    else if (h.k === 'route') Object.assign(P, { title: `${head}: no way to a runway`, text: `No taxiway leads from the stand to a runway it can take off from. Draw a taxiway from the apron to the runway (Taxiway on the build bar). After ${U.dur(IC.HOLD_CANCEL)} the airline cancels.` });
    else if (h.k === 'wind') Object.assign(P, { title: `${head}: wind beyond the limits`, text: `${h.why}. A runway pointing into the usual wind lets them go.` });
    else if (h.k === 'ga') Object.assign(P, { title: `${head}: light aircraft on the runway`, text: 'Each slow light aircraft holds the runway as long as two airliners. A light-aircraft field nearby takes them away.' });
    else if (h.k === 'release') Object.assign(P, { title: `${head} for an airway release`, text: 'Controllers space departures on the same airway. A second airway, or radar along it, lets them go closer together.' });
    else Object.assign(P, { title: `${head}: ${(IC.HOLD[h.k] || h.k).toLowerCase()}`, text: h.why });
    out.push(P);
  }
  // fire cover: none, or too slow to a runway for heavy jets
  if (!st.fire) out.push({ id: ap.id + ':nofire', kind: 'fire', lvl: 'bad', ...rwMid(rws[0]), title: 'No fire cover: only turboprops may land', text: 'A fire station within 1.5 km of the runway lets jets land.', fix: { part: 'fire', near: rwMid(rws[0]), label: 'Build a fire station' } });
  else for (const rw of rws) {
    const t = (st.rescueRw || {})[rw.id] || 0;
    if (t > IC.FIRE_STD) out.push({ id: ap.id + ':fire:' + rw.id, kind: 'fire', lvl: 'warn', ...rwMid(rw), title: `Runway ${rw.name || ''}: no fire cover for heavy jets`.replace('  ', ' '),
      text: `Fire trucks need ${IC.mmss(t)} to reach its far end; heavy jets need them there within ${IC.mmss(IC.FIRE_STD)}. A fire station nearer the runway's middle fixes it.`, fix: { part: 'fire', near: rwMid(rw), label: 'Build a fire station nearer' } });
  }
  // a runway with no landing system at either end: in fog or snow every arrival diverts
  for (const rw of rws) if (!['a', 'b'].some(e => ap.parts.some(q => q.kind === 'ils' && q.rw === rw.id && q.end === e))) {
    const e = rw.a;
    out.push({ id: ap.id + ':ils:' + rw.id, kind: 'ils', lvl: IC.needILS && IC.needILS(S) ? 'bad' : 'warn', x: e.x, y: e.y, title: `Runway ${rw.name || ''}: no landing system`.replace('  ', ' '),
      text: 'In fog, low cloud or snow every arrival diverts. A landing system (ILS) at the end they land toward costs ₭25M.', fix: { part: 'ils', near: e, label: 'Build a landing system' } });
  }
  // (round 5b) an airline's worst aspect here, when it is bad, with its fix
  for (const c of IC.aptScorecards ? IC.aptScorecards(S, ap) : []) {
    if (c.worst.v >= 45 || !c.worst.fix) continue;
    const at = c.worst.fix.near || hub;
    out.push({ id: `score:${c.al.id}:${ap.id}`, kind: 'score', lvl: 'warn', x: at.x, y: at.y, title: `${short(c.al.name)} rates ${c.worst.name.toLowerCase()} ${c.worst.v} of 100`, text: c.worst.text, fix: c.worst.fix });
  }
  // deals: one at risk for want of a facility, and offers waiting for an answer
  if (A) {
    const seen = new Map();
    for (const d of A.deals) {
      // (round 4) a deal still in its grace that needs something the airport lacks: said up front, with the time left
      if (IC.FOCUS.progress && d.st === 'active' && !d.badT && S.time < d.grace && d.a === ap.id && !seen.has('grace:' + d.al)) {
        const miss = IC.dealNeeds(S, Object.assign({ renew: d.id }, d)).filter(x => !x.ok && x.k !== 'pax' && x.k !== 'fuelDeps'), m = miss[0], part = m && IC.fixPart(m.k);
        if (m && part) {
          const al = IC.avAirline(S, d.al), at = part === 'hangar' ? (aprons[0] || hub) : hub, what = m.text.replace(/^[^:]*?needs /, '').replace(/ \(\d+ of \d+\)$/, '');
          out.push({ id: 'grace:' + d.id, kind: 'deal', lvl: 'warn', x: at.x, y: at.y, deal: d.id, title: `${short(al.name)} needs ${what}`,
            text: `Its deal gives you ${S.mode === 'story' ? U.months(d.grace - S.time) : U.dur(d.grace - S.time)} to build it${S.mode === 'story' ? ` (by ${U.date(d.grace, S)})` : ''}; after that it warns once, then walks out.`, fix: { part, near: at, label: FIX_WORD[part] || 'Build it' } });
          seen.set('grace:' + d.al, out[out.length - 1]);
        }
      }
      if (d.st !== 'active' || !d.badT || (d.a !== ap.id && d.b.apt !== ap.id)) continue;
      const al = IC.avAirline(S, d.al), miss = IC.dealNeeds(S, Object.assign({ renew: d.id }, d)).filter(x => !x.ok && x.k !== 'pax' && x.k !== 'fuelDeps');
      const m = miss[0], part = m && IC.fixPart(m.k), left = Math.max(0, 12 * 3600 - (S.time - d.badT));
      const what = m ? m.text.replace(/^[^:]*?needs /, '').replace(/ \(\d+ of \d+\)$/, '') : 'what it signed for';
      const at = part === 'hangar' ? (aprons[0] || hub) : hub;
      // (two deals of one airline short of the same thing are one problem)
      const key = d.al + ':' + what, had = seen.get(key);
      if (had) { had.n++; had.text = `${al.name} has ${had.n} deals here; they end in ${U.dur(left)} unless it is put right, with compensation, and our name falls.`; continue; }
      out.push({ id: 'deal:' + d.id, kind: 'deal', lvl: 'bad', x: at.x, y: at.y, deal: d.id, title: `Deal at risk: ${short(al.name)} needs ${what}`,
        text: `${al.name} walks out in ${U.dur(left)} unless it is put right: ${U.money(d.value * 0.5 + 5)} in compensation and our name falls.`,
        fix: part ? { part, near: at, label: FIX_WORD[part] || 'Build it' } : { deal: d.id, label: 'Open the deal' }, n: 1 });
      seen.set(key, out[out.length - 1]);
    }
    for (const q of A.requests) {
      if (q.a !== ap.id && !(q.b && q.b.apt === ap.id)) continue;
      const al = IC.avAirline(S, q.al), T = IC.ACTYPES[q.type], k = q.terms && IC.dealTerms(S, q), b = IC.avEnd(S, q.b);
      const block = IC.avReqBlock(S, q), miss = block && IC.dealNeeds(S, q).find(x => !x.ok), need = miss && (miss.k === 'take' ? (/stand/.test(miss.text) ? IC.fixPart('stands') : /fire/.test(miss.text) ? 'fire' : null) : IC.fixPart(miss.k));
      out.push({ id: 'offer:' + q.id, kind: 'offer', lvl: 'deal', x: hub.x, y: hub.y, req: q.id, title: `${q.renew ? 'Renewal' : 'Offer'}: ${short(al.name)}, ${q.n} × ${T.short || T.name} to ${short(b.name)}`,
        text: `${k ? `${U.money(k.value)} a day for ${IC.dealLen(S, k.days)}. ` : ''}${block ? `It will not sign yet: ${block}.` : 'Ready to sign.'} Decide within ${U.dur(Math.max(0, q.exp - S.time))}.`,
        fix: need ? { part: need, near: need === 'hangar' ? (aprons[0] || hub) : need === 'fire' ? rwMid(rws[0]) : hub, label: (need === 'tstraight' || need === 'apron') && T.stand === 'l' ? (need === 'apron' ? 'Build an apron for wide-bodies' : 'Build wide-body gates') : FIX_WORD[need] || 'Build it', size: T.stand === 'l' ? 'l' : null }
          : { deal: q.id, label: block ? 'See what it needs' : 'Read and sign' } });
    }
  }
  return out;
};

/* ---------- the fix: a build piece placed where it helps ----------
   Tries places round the point, nearest first, in the frame of the runway, and keeps the first the builder
   accepts (the same check as the Build button). Returns the build mode (S.mode2) ready to Build, or null. */
IC.fixPlan = function (S, ap, part, near, size) {
  if (!ap || !IC.APART[part] && !(IC.PIECES && IC.PIECES[part])) return null;
  const m = IC.bldMode(S, ap, part), a = ap.rwyA || 0, ca = Math.cos(a), sa = Math.sin(a);
  if (size) m.size = size;
  // a landing system goes on the runway end itself
  if (part === 'ils') { m.set = true; m.at = { x: near.x, y: near.y }; m.tol = 0.12; return m; }
  // an area part: its two corners round each place tried, square to the runway
  const A = FIX_AREA[part], dim = A && (A[size] || A.m);
  const put = A ? (m, c) => { m.rot = a; m.pts = [{ x: c.x - (dim[0] / 2) * ca + (dim[1] / 2) * sa, y: c.y - (dim[0] / 2) * sa - (dim[1] / 2) * ca }]; m.at = { x: c.x + (dim[0] / 2) * ca - (dim[1] / 2) * sa, y: c.y + (dim[0] / 2) * sa + (dim[1] / 2) * ca }; }
    : (m, c) => { m.at = { x: c.x, y: c.y }; };
  // (fuel keeps 100 m from other fuel: one fire must not take them all)
  const P = IC.PIECES && IC.PIECES[part], step = P ? 4 : A ? Math.max(1.1, dim[1] + 0.2) : part === 'hangar' ? 1.6 : part === 'fuel' ? 1.8 : 1.1;
  // (the treasury is not the question here: the Build button says if it cannot be paid)
  const budget = S.budget; S.budget = Math.max(S.budget, 1e9);
  try {
    const cand = [];
    for (let r = 1; r <= 7; r++) for (let k = 0; k < 8 * r; k++) { const t = k / (8 * r) * Math.PI * 2, u = Math.cos(t) * r * step, v = Math.sin(t) * r * step; cand.push({ x: near.x + u * ca - v * sa, y: near.y + u * sa + v * ca, d: r }); }
    // the nearest place the builder accepts with nothing to warn about; failing that, the nearest it accepts
    let fall = null;
    for (const c of cand) {
      m.set = true; put(m, c); m.tol = 0.12; m.free = false; m._readyK = null; m._ppK = null; m._pcK = null;
      const out = IC.bldPlanOf(S, m, m.at, 0.12, false);
      if (!out.ok) continue;
      const bad = (out.warn || []).concat(out.text || []).some(w => /within 100 m|strip|not connected|No taxiway near/.test(w));
      if (!bad && !(out.warn || []).length) { m.fix = true; return m; }
      if (!fall && !bad) fall = { x: c.x, y: c.y };
    }
    if (fall) { put(m, fall); m._readyK = null; m._ppK = null; m._pcK = null; m.fix = true; return m; }
  } finally { S.budget = budget; }
  return null;
};

/* ---------- the chain: from the city by road to the terminal, flights out, money in ---------- */
IC.aptChain = function (S, ap) {
  const L = IC.aptCatchList ? IC.aptCatchList(S, ap) : [], st = ap.st || {}, M = IC.aptMonth ? IC.aptMonth(S, ap) : null;
  const people = L.reduce((s, x) => s + x.k, 0);
  const deps = (ap.mvLog || []).filter(x => x.k === 'dep').length;
  const dests = new Map();
  // (round 5c) with the aircraft flying each, so the chain can name the busiest route
  const per = new Map();
  if (S.av) for (const r of S.av.routes) if (r.st === 'active' && r.n > 0 && (r.a === ap.id || r.b.apt === ap.id)) { const far = r.a === ap.id ? IC.avEnd(S, r.b) : S.byId[r.a]; if (far) { dests.set(far.name, far); per.set(far.name, (per.get(far.name) || 0) + r.n); } }
  const earned = M ? M.land + M.pax + M.cargo : 0;
  const near = L[0];
  const cal = S.mode === 'story';
  const text = `${near ? `${short(near.c.name)}${L.length > 1 ? ` and ${L.length - 1} more` : ''}: ${fmtK(people)} people within ${IC.GROWTH.catch[1]} h by road` : 'No town within reach by road'} → ${Math.round(ap.paxRate || 0).toLocaleString('en-US')} passengers an hour → ${dests.size} place${dests.size === 1 ? '' : 's'} served → ${U.money(earned)} ${cal ? 'this month' : 'today'}`;
  return { cities: L.slice(0, 6), people, paxHour: ap.paxRate || 0, cap: st.pax || 0, deps, dests: [...dests.values()].sort((p, q) => (per.get(q.name) || 0) - (per.get(p.name) || 0)), perDay: per, earned, month: M, text };
};
const fmtK = k => k >= 1000 ? `${(k / 1000).toFixed(1)} million` : `${Math.round(k)}k`;
IC.fmtPeople = fmtK;

/* ---------- one money line, the same everywhere: this month's in and out ----------
   From the month's books (IC.monthStatement), so it always agrees with the statement: what came in, what went
   out, how much of that was building, and the change in the treasury. */
IC.moneyLine = function (S) {
  const st = IC.monthStatement ? IC.monthStatement(S, 0) : null; if (!st) return null;
  const get = k => (st.lines.find(l => l.k === k) || { v: 0 }).v;
  // (the airlines' fees come in several lines: landings, passengers, cargo, overflights; counted as one here)
  const fees = st.lines.filter(l => /^fee_/.test(l.k)).reduce((a, l) => a + l.v, 0);
  const ins = st.lines.filter(l => l.v > 0 && l.k !== 'loanIn' && !/^fee_/.test(l.k)).concat(fees > 0 ? [{ k: 'fees', name: 'Airline fees', v: fees }] : []).sort((a, b) => b.v - a.v);
  const build = -get('other'), top = ins[0], cal = S.mode === 'story';
  const when = cal ? `${IC.MONTHS[st.m % 12]} so far` : 'Today so far';
  const net = st.net, sign = v => `${v >= 0 ? '+' : '−'}${U.money(Math.abs(v)).replace('−', '')}`;
  // (round 4) running (everything but building) apart from what was invested in building, and where
  const run = net + build, E = S.econ, inv = E && E.minv ? Object.keys(E.minv).filter(k => S.byId[k]).sort((a, b) => E.minv[b] - E.minv[a]) : [];
  const where = inv.length ? short(S.byId[inv[0]].name) + (inv.length > 1 ? ` and ${inv.length - 1} more` : '') : '';
  if (IC.FOCUS.progress) return { inn: st.income, out: -st.spend, net, build, run, where, days: st.days, top, split: true,
    short: `Running ${sign(run)}${build > 0.5 ? ` · Invested ${U.money(build)}` : ''}`,
    text: `${when}: running the airports ${run >= 0 ? 'made' : 'cost'} ${U.money(Math.abs(run))} (${U.money(st.income)} came in${top ? `, most of it ${top.name.toLowerCase()}` : ''}; ${U.money(-st.spend - build)} went out on running costs)${build > 0.5 ? `, and ${U.money(build)} was invested in building${where ? ` at ${where}` : ''}` : ''}. The treasury ${net >= 0 ? 'rose' : 'fell'} ${sign(net).replace(/^[+−]/, '')}.`,
    sign: sign(net), runSign: sign(run) };
  return { inn: st.income, out: -st.spend, net, build, days: st.days, top,
    short: `${cal ? IC.MONTHS[st.m % 12].slice(0, 3) : 'Today'}: ${U.money(st.income)} in · ${U.money(-st.spend)} out`,
    text: `${when}: ${U.money(st.income)} came in${top ? `, most of it ${top.name.toLowerCase()}` : ''}; ${U.money(-st.spend)} went out${build > 0.5 ? `, ${U.money(build)} of it building` : ''}. The treasury ${net >= 0 ? 'rose' : 'fell'} ${sign(net).replace(/^[+−]/, '')}.`,
    sign: sign(net) };
};

})(window.IC);
