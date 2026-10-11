/* Iron Canopy — (brief 49) the Ministry's agenda: a national focus track for the Career, as HOI4's national focus
   and Frostpunk's Book of Laws. The Director puts one policy at a time to the Minister; it passes after minutes of
   play (the play clock: IC.playRate, so Wait and skip do not pass it faster) and then stays. Acts I–III only; Act IV
   keeps what was passed.
   - A policy (IC.AGENDA): { id, act, name, d, req, need: { apts, pax, conf }, excl, min (minutes of play), cost (₭M
     to start), conf (the Minister's confidence on starting), pay (Ministry money when passed, booked as bonus), fx
     (shares through IC.mod: a source on IC.MOD_SRC, src 'the Ministry'), k (named changes the rest of the game reads
     with IC.agendaMul / IC.agendaAdd: a number, or (S, ctx) => number), opens (IC.storyLock keys it opens sooner),
     once (S => a change made once, when passed), says (what it changed, for the card and the tree) }.
   - State: S.story.agenda = { done: Set, cur: { id, p } (p: minutes played), closed: Set (ruled out by a pair) }.
   Headless. */
(function (IC) {
'use strict';
const U = IC.U;
const short = n => n.replace(/ (International|Airport|Field)$/, '');
const dayPax = S => S.av ? Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0) : 0;
const ourApts = S => S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts && i.parts.some(p => p.kind === 'runway' && p.built));
const foreignOrLow = al => al.K && al.K.foreign || al.kind === 'budget';

/* ---------- the policies ---------- */
IC.AGENDA = [
  // Act I: aviation policy
  { id: 'authority', act: 1, name: 'A civil aviation authority', min: 5, cost: 0, conf: 0, fx: { grant: 0.1 },
    d: 'The Ministry writes the Director’s office into law, with a budget line of its own: the grant is 10% larger.' },
  { id: 'openSkies', act: 1, name: 'Open skies', req: ['authority'], excl: 'flag', min: 8, cost: 20, fx: { offerRate: 0.1 },
    k: { offerKind: (S, al) => foreignOrLow(al) ? 1.8 : 1, flagDrift: 1 },
    d: 'Any airline may fly here on the same terms. Foreign and low-cost airlines offer nearly twice as often; the flag carrier’s satisfaction slips by 1 a month.' },
  { id: 'flag', act: 1, name: 'Protect the flag carrier', req: ['authority'], excl: 'openSkies', min: 8, cost: 20,
    k: { offerKind: (S, al) => al.K && al.K.foreign ? 0.5 : 1, dealLen: (S, al) => al.kind === 'flag' ? 1.5 : 1, flagFlex: (S, al) => al.kind === 'flag' ? 0.08 : 0 },
    d: 'The national airline comes first. Its deals run half as long again and it accepts 8% more over list; foreign airlines offer half as often.' },
  { id: 'toLast', act: 1, name: 'Build to last', req: ['authority'], excl: 'fast', min: 8, cost: 30, fx: { paveLife: 0.25, bldLife: 0.2, buildCost: 0.1 },
    d: 'Thicker slabs and better steel: pavement lasts 25% longer and buildings 20%, and every job costs 10% more.' },
  { id: 'fast', act: 1, name: 'Build fast', req: ['authority'], excl: 'toLast', min: 8, cost: 30, fx: { buildSpeed: 0.2, paveLife: -0.15, bldLife: -0.1 },
    d: 'Contractors paid by the day finished: works run 20% quicker, and pavement wears out 15% sooner.' },
  { id: 'hub', act: 1, name: 'One great hub', req: ['openSkies', 'flag'], any: true, excl: 'regional', min: 10, cost: 40, fx: { overList: 0.04 },
    d: 'Everything goes through the capital. Airlines accept charges 4% further over list; other cities wait longer before they ask for an airport.', k: { cityAsk: 1.25 } },
  { id: 'regional', act: 1, name: 'A regional network', req: ['openSkies', 'flag'], any: true, excl: 'hub', min: 10, cost: 40,
    k: { cityAsk: 0.7, offerKind: (S, al) => al.kind === 'regional' ? 1.8 : 1 },
    d: 'Every region gets its airport. A city asks for one with 30% fewer people waiting to fly, and regional airlines offer nearly twice as often.' },
  { id: 'safety', act: 1, name: 'A safety regulator', req: ['authority'], min: 6, cost: 40, fx: { fireTime: -0.1, birds: -0.15 },
    d: 'Inspectors with the power to close a runway. Fire trucks reach it 10% sooner and there are 15% fewer bird strikes.' },
  { id: 'handling', act: 1, name: 'Handling standards', req: ['authority'], min: 6, cost: 30, fx: { refuel: 0.05, board: 0.05 },
    d: 'One rulebook for every handler: fuel trucks refuel 5% more aircraft an hour and boarding is 5% quicker.' },
  { id: 'banks', act: 1, name: 'Access to the banks', req: ['authority'], need: { pax: 2000 }, min: 6, cost: 0, conf: -2, opens: ['loans'],
    d: 'The Treasury lets the airports borrow against their fees. Loans open now instead of with Chapter 5; the Treasury grumbles (the Minister −2).' },
  { id: 'roads', act: 1, name: 'Roads to the airports', req: ['banks'], min: 7, cost: 60, opens: ['roads'],
    d: 'The roads ministry builds what the airports ask for. Roads to your airports open now instead of with Chapter 5.' },
  { id: 'atc', act: 1, name: 'Air traffic services', req: ['safety'], need: { pax: 2000 }, min: 8, cost: 50, fx: { ctlLoad: 0.1, rwOcc: -0.03 },
    d: 'Controllers trained to one standard: each handles 10% more flights at once, and aircraft clear the runway 3% sooner.' },
  // Act II: the country notices
  { id: 'reform', act: 2, name: 'Airspace reform', req: ['atc'], min: 8, cost: 80, fx: { ctlLoad: 0.15, rwOcc: -0.03 },
    d: 'Sectors redrawn round the traffic, not the regions: each controller handles 15% more flights, and runways turn 3% quicker.' },
  { id: 'academy', act: 2, name: 'Aviation academy', req: ['safety'], min: 9, cost: 90, fx: { xwind: 2, birds: -0.1 },
    d: 'A national flying school. Crews land and take off in 2 kt more crosswind, and there are 10% fewer bird strikes.' },
  { id: 'dual', act: 2, name: 'Civil–military dual use', excl: 'civil', min: 10, cost: 60, conf: 2,
    k: { adCost: 0.8, handover: 1 }, once: S => satAll(S, -3),
    d: 'Airports and the air force share radars, fuel and runways. The air defence costs 20% less to run from Act III and the military hands over a short-range battery more; every airline −3, the Prime Minister +2.' },
  { id: 'civil', act: 2, name: 'Civil first', excl: 'dual', min: 10, cost: 60, fx: { overList: 0.04 },
    k: { handover: -1 }, once: S => satAll(S, 4),
    d: 'The airports stay the airlines’. Airlines accept charges 4% further over list and every airline +4; in Act III the military hands over one battery fewer.' },
  { id: 'freight', act: 2, name: 'Air freight drive', req: ['handling'], need: { apts: 2 }, min: 8, cost: 70, fx: { cargoRate: 0.15 },
    k: { offerKind: (S, al) => al.kind === 'cargo' ? 1.6 : 1 },
    d: 'Customs at the cargo door. Warehouses handle 15% more freight, and cargo airlines offer 60% more often.' },
  { id: 'turns', act: 2, name: 'Quick turnaround standards', req: ['handling'], min: 8, cost: 60, fx: { turn: -0.05, catering: -0.05, pushback: -0.05 },
    d: 'Every minute on the stand counted. Turnarounds, catering and pushbacks each take 5% less time.' },
  { id: 'tourism', act: 2, name: 'A tourism campaign', need: { pax: 6000 }, min: 7, cost: 120, conf: 3, fx: { offerRate: 0.05 },
    d: 'Posters in every foreign capital. Airline offers come 5% sooner; the Prime Minister likes the pictures (+3).' },
  { id: 'review', act: 2, name: 'A budget review', need: { conf: 50 }, min: 6, cost: 0, pay: 250, fx: { grant: 0.1 },
    d: 'The Treasury looks at what aviation earns the country. ₭250M when it passes, and a grant 10% larger.' },
  { id: 'charter', act: 2, name: 'An airline charter', req: ['reform'], min: 8, cost: 50, fx: { forgive: 0.15, overList: 0.02 },
    d: 'Written rights for the airlines and the airports. Bad days are forgiven 15% sooner, and airlines accept 2% more over list.' },
  // Act III: before the war
  { id: 'harden', act: 3, name: 'Harden the airports', min: 10, cost: 100, pay: 200, fx: { repair: 0.2, fuelSpread: -0.25 },
    d: 'Blast walls round the fuel farms and runway repair kits on every airfield. Repairs run 20% faster, burning fuel is 25% less likely to spread, and the Ministry puts ₭200M towards shelters.' },
  { id: 'brigades', act: 3, name: 'Runway repair brigades', req: ['harden'], min: 9, cost: 120, fx: { repair: 0.1, buildSpeed: 0.1 },
    d: 'Engineers on call at every airport. Repairs run 10% faster, and works 10% quicker.' },
  { id: 'keepFlying', act: 3, name: 'Keep the airlines flying', excl: 'closeSkies', min: 10, cost: 50,
    k: { warDrift: S => S.airspace === 'closed' ? 1 : 0.7 },
    d: 'Life goes on. In the war, while the airspace stays open, the Prime Minister’s confidence falls 30% slower.' },
  { id: 'closeSkies', act: 3, name: 'Close the skies early', excl: 'keepFlying', min: 10, cost: 50, fx: { offerRate: -0.15 },
    k: { tension: 0.75 },
    d: 'Fewer flights, fewer chances for the enemy. Tension builds 25% slower, and airline offers come 15% later.' },
  { id: 'drills', act: 3, name: 'Civil defence drills', req: ['safety'], min: 7, cost: 60, conf: 3, fx: { fireTime: -0.1 },
    d: 'Airport staff drill for the worst. Fire trucks reach the runway 10% sooner; the Prime Minister +3.' },
  { id: 'dispersal', act: 3, name: 'Dispersal plans', need: { apts: 2 }, min: 8, cost: 80, fx: { fuelSpread: -0.2, repair: 0.05 },
    d: 'Fuel and spares spread over every airfield. Burning fuel 20% less likely to spread, repairs 5% faster.' },
  { id: 'warBudget', act: 3, name: 'A war budget', need: { conf: 50 }, min: 8, cost: 0, conf: -2, fx: { grant: 0.15 },
    d: 'Defence before everything. The grant is 15% larger; the cabinet is uneasy (the Prime Minister −2).' },
  { id: 'channel', act: 3, name: 'A diplomatic channel', min: 8, cost: 30, conf: -3, k: { tension: 0.85 },
    d: 'A quiet line to the other side. Tension builds 15% slower; the press calls it weakness (the Prime Minister −3).' }
];
IC.AGENDA.forEach(p => { p.req = p.req || []; p.need = p.need || {}; });
IC.agendaById = id => IC.AGENDA.find(p => p.id === id);
function satAll(S, v) { for (const a of S.av ? S.av.airlines : []) a.sat = U.clamp(a.sat + v, 0, 100); }
IC.STATEMENT && (IC.STATEMENT.agenda = 'The Ministry’s agenda');

/* ---------- state ---------- */
const on = S => S.mode === 'story' && S.story;
IC.agendaState = S => on(S) ? (S.story.agenda || (S.story.agenda = { done: new Set(), cur: null, closed: new Set() })) : null;
const passed = S => { const A = on(S) && S.story.agenda; return A ? A.done : null; };
IC.agendaDone = (S, id) => { const D = passed(S); return !!(D && D.has(id)); };

/* a named change: the product (Mul) or sum (Add) over passed policies; a value may be a function of (S, ctx) */
IC.agendaMul = (S, key, ctx) => { let m = 1; const D = passed(S); if (!D || !D.size) return 1; for (const id of D) { const p = IC.agendaById(id), v = p && p.k && p.k[key]; if (v != null) m *= typeof v === 'function' ? v(S, ctx) : v; } return m; };
IC.agendaAdd = (S, key, ctx) => { let a = 0; const D = passed(S); if (!D || !D.size) return 0; for (const id of D) { const p = IC.agendaById(id), v = p && p.k && p.k[key]; if (v != null) a += typeof v === 'function' ? v(S, ctx) : v; } return a; };
/* a storyLock key a passed policy opens early */
IC.agendaOpens = (S, key) => { const D = passed(S); if (!D) return false; for (const id of D) { const p = IC.agendaById(id); if (p.opens && p.opens.includes(key)) return true; } return false; };
/* what a lock message adds: the policy that would open it sooner */
IC.agendaLockNote = (S, key) => { const p = IC.AGENDA.find(x => x.opens && x.opens.includes(key)); if (!p || !on(S) || S.story.act > 1) return ''; const A = IC.agendaState(S); return A.closed.has(p.id) ? '' : ` Or sooner: “${p.name}” on the Ministry’s agenda (Career room).`; };

/* the Ministry's shares, as a source for IC.mod */
if (IC.MOD_SRC) IC.MOD_SRC.push(S => {
  const D = passed(S), out = [];
  if (D) for (const id of D) { const p = IC.agendaById(id); if (p && p.fx) out.push({ fx: p.fx, why: p.name, src: 'the Ministry' }); }
  return out;
});

/* ---------- starting and passing ---------- */
const needWords = (S, p) => {
  const n = p.need, L = [];
  if (n.apts && ourApts(S).length < n.apts) L.push(`${n.apts} airports with a runway (you have ${ourApts(S).length})`);
  if (n.pax && dayPax(S) < n.pax) L.push(`${n.pax.toLocaleString('en-US')} passengers a day (now ${Math.round(dayPax(S)).toLocaleString('en-US')})`);
  if (n.conf && S.story.standing < n.conf) L.push(`the ${S.story.act === 1 ? 'Minister' : 'Prime Minister'}’s confidence at ${n.conf} (now ${Math.round(S.story.standing)})`);
  return L;
};
/* why a policy cannot be started now, in a sentence; '' when it can */
IC.agendaWhy = function (S, id) {
  const A = IC.agendaState(S), p = IC.agendaById(id); if (!A || !p) return 'Only in the Career.';
  const st = S.story;
  if (A.done.has(id)) return 'Already passed.';
  if (A.closed.has(id)) return `Ruled out: “${IC.agendaById(p.excl).name}” passed instead.`;
  if (st.act >= 4) return 'The war leaves no time for new policy: what was passed stays.';
  if (st.act < p.act) return `Comes with ${IC.ACTS[p.act].name}.`;
  const reqs = p.req.filter(r => !A.done.has(r));
  if (reqs.length && (!p.any || reqs.length === p.req.length)) return `Needs ${reqs.map(r => `“${IC.agendaById(r).name}”`).join(p.any ? ' or ' : ' and ')} first.`;
  const L = needWords(S, p); if (L.length) return `Needs ${L.join(', ')}.`;
  if (A.cur && A.cur.id === id) return 'Before the Minister now.';
  if (p.cost && S.budget < p.cost) return `Costs ${U.money(p.cost)}; the treasury holds ${U.money(S.budget)}.`;
  return '';
};
/* put a policy to the Minister. One at a time: starting another drops the one in progress and its progress. */
IC.agendaStart = function (S, id) {
  const why = IC.agendaWhy(S, id); if (why) return why;
  const A = IC.agendaState(S), p = IC.agendaById(id), st = S.story;
  if (A.cur) IC.log(S, 'info', 'AGENDA', `“${IC.agendaById(A.cur.id).name}” dropped, with ${Math.round(A.cur.p)} min of work on it.`);
  if (p.cost) IC.pay(S, 'agenda', p.cost);
  if (p.conf) st.standing = U.clamp(st.standing + p.conf, st.act < 3 ? 5 : 0, 100);
  A.cur = { id, p: 0 };
  IC.log(S, 'info', 'AGENDA', `“${p.name}” is before the ${st.act === 1 ? 'Minister' : 'cabinet'}: about ${p.min} min of play.${p.cost ? ` ${U.money(p.cost)} paid.` : ''}`);
  return '';
};
/* game seconds a policy needs from now at the current speed (for the date it will pass) */
IC.agendaLeft = (S, id) => { const A = IC.agendaState(S), p = IC.agendaById(id), left = p.min - (A && A.cur && A.cur.id === id ? A.cur.p : 0); return Math.max(0, left) * 60 * IC.GS * IC.playRate(S); };
function pass(S, p) {
  const A = IC.agendaState(S), st = S.story, boss = st.act === 1 ? 'MIN' : 'PM';
  A.done.add(p.id); A.cur = null;
  if (p.excl) A.closed.add(p.excl);
  if (p.pay) { S.budget += p.pay; IC.econBook(S, 'bonus', p.pay); }
  if (p.once) p.once(S);
  IC.modDirty(S);
  IC.log(S, 'kill', 'AGENDA', `“${p.name}” passed. ${p.d}`);
  IC.card(S, p.name, `Signed by the ${boss === 'MIN' ? 'Minister' : 'Prime Minister'} · ${U.date(S.time, S)}`, `${p.d}${p.excl ? ` “${IC.agendaById(p.excl).name}” is off the table for good.` : ''}`, 'policy');
  IC.emit(S, 'agenda', p.id);
}
IC.agendaPass = (S, id) => pass(S, IC.agendaById(id));
/* the step: the policy in progress runs on the play clock (real minutes, whatever the speed) */
IC.agendaTick = function (S, dt) {
  const A = IC.agendaState(S); if (!A || !A.cur) return;
  A.cur.p += dt / (IC.GS * IC.playRate(S)) / 60;
  const p = IC.agendaById(A.cur.id);
  if (A.cur.p >= p.min) pass(S, p);
};
/* what the open agenda says on the rail: true when nothing is before the Minister and something could be */
IC.agendaIdle = S => { const A = IC.agendaState(S); return !!A && !A.cur && S.story.act < 4 && IC.AGENDA.some(p => !IC.agendaWhy(S, p.id)); };

/* ---------- named changes the agenda makes elsewhere ---------- */
/* the flag carrier's satisfaction under Open skies: a month's slip */
IC.onMonth && IC.onMonth(S => { if (!on(S) || S.story.act >= 4) return; const n = IC.agendaAdd(S, 'flagDrift'); if (n && S.av) for (const a of S.av.airlines) if (a.kind === 'flag') a.sat = U.clamp(a.sat - n, 0, 100); });
/* Act III: what the military hands over follows the dual-use choice (story.js calls it when an act starts) */
IC.agendaAct = function (S, n) {
  if (n !== 3 || !S.reserve) return;
  const h = IC.agendaAdd(S, 'handover');
  if (h > 0) S.reserve.shorad = (S.reserve.shorad || 0) + h;
  if (h < 0) S.reserve.mrsam = Math.max(0, (S.reserve.mrsam || 0) + h);
};

/* ---------- the Guide's lesson ---------- */
if (IC.GUIDE && !IC.GUIDE.some(g => g.id === 'agenda')) {
  const i = IC.GUIDE.findIndex(g => g.act === 1 && g.ch > 0);
  IC.GUIDE.splice(i < 0 ? IC.GUIDE.length : i, 0, { id: 'agenda', act: 1, ch: 0, t: 'The Ministry’s agenda', d: 'In the Career room (C) you put one policy at a time to the Minister: open skies or a protected flag carrier, building to last or building fast. Each takes a few minutes of play, whatever speed the game runs at, so waiting does not pass it sooner. Once passed it stays, and some rule out another for good: the tree says what each needs, gives and closes. Starting another drops the one in progress and its work.' });
}

})(window.IC);
