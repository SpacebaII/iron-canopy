/* Iron Canopy — (brief 69) the Director's desk: the Career played as a job with something at stake, not a checklist.
   - The mandate (IC.MANDATES): the Minister's aim for each chapter of Act I, an outcome with a date (Acts II and III
     have one each, IC.MANDATES_ACT, that judges but does not turn the act). It is met when
     the chapter's key goals are done (the goals stay as the How? steps, and no longer pay or open the chapter on
     their own). A missed date costs confidence and sets a new one; met, it pays what the chapter's goals used to.
   - Pressures (IC.PRESSURES): live problems found in the simulation (aircraft waiting for stands, a full terminal,
     no fuel, winter coming with no landing system, delays, a run of near misses, an empty treasury, light aircraft
     straying, a city beyond every airport's reach after Act I, incidents on an airfield), two or three at a time. Each comes from a person, sits at a place on the map, has a date, says what
     happens if it is left, and has more than one answer: fix it, buy time once, pay it off where money can, or
     refuse and take the hit now. Paced by the play clock (S.story.play), so Wait does not skip past them.
   - The record (desk.rec): what the Director did, each entry fading over about half a year. It moves the target the
     Minister's confidence settles to, so a failure is still felt months later.
   - The quarterly review: passengers, reliability, safety and money graded A to E against what the act expects.
   - Losing: before Act III a full month under IC.DESK.sackAt and the Director is replaced.
   IC.emit(S, 'pressure', { id, kind, title, outcome: 'new' | 'solved' | 'paid' | 'refused' | 'failed' | 'time' }).
   Headless: IC.deskTick runs from IC.storyTick. Behind IC.FOCUS.desk. */
(function (IC) {
'use strict';
const U = IC.U, H = 3600;
const short = n => n.replace(/ (International|Airport|Field)$/, '');
const on = S => !!(IC.FOCUS.desk && S.mode === 'story' && S.story && S.story.fresh && S.story.act <= 3 && !S.showcase);
IC.deskOn = on;
const capAp = S => S.story.cap ? S.byId[S.story.cap] : null;
const ours = S => S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts && !i.locked && i.parts.some(p => p.kind === 'runway' && p.built));
const dayPax = S => Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0);
const castTrust = (S, who, v) => { if (IC.castTrust && who) IC.castTrust(S, who, v); };
const who = k => IC.ADVISORS[k] ? IC.ADVISORS[k].name : k;
const dateOf = (S, t) => { const c = IC.calAt(S, t); return `${c.d} ${IC.MONTHS[c.mo]}`; };
const lc1 = s => /^(The|A|An) /.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const left = (S, t) => { const s = t - S.time; return s <= 0 ? 'now' : s >= IC.MO(S, 1) * 0.95 ? U.months(s) : s >= 86400 ? `${Math.round(s / 86400)} day${Math.round(s / 86400) > 1 ? 's' : ''}` : U.dur(s); };

IC.DESK = {
  open: 3,              // pressures on the desk at once
  first: 150,           // seconds of play after the airport opens before the first
  gap: [240, 420],      // seconds of play between new ones
  again: 4,             // months before the same kind comes back for the same place
  seen: 2 * H,          // a problem must last this long (game time) before someone writes about it
  calm: 6 * H,          // and be gone this long to count as solved
  fade: 6,              // months over which a record entry fades to a quarter (half-life of half that)
  sackAt: 10,           // confidence under this for a month replaces the Director (before Act III)
  warnAt: [30, 18],     // the Minister warns under these
  missConf: [-8, -15],  // a mandate missed once, then twice: after that the cabinet stops setting dates
  metConf: 6,
  drag: -5,             // each month an Act I mandate stays undone after its second date, more each month,
  dragMax: -15,         // up to this
  more: 2               // buying time costs this much confidence
};

/* ---------- the mandate ---------- */
IC.MANDATES = [
  { of: ['first'], mo: 3, text: S => `Open the national airport near ${IC.cap(S).name} and land its first airliner` },
  { of: ['pax3', 'happy'], mo: 8, text: () => 'Make it the region’s airport: 6,000 passengers a day, and three airlines content with it' },
  { of: ['gates', 'link', 'radar'], mo: 8, text: () => 'Give the sky a plan: entry points on the border, airways to the airport, and radar that sees them' },
  { of: ['field', 'clubs', 'quiet'], mo: 6, text: () => 'Get light aircraft out of the airliners’ way, and keep the flying clubs on side' },
  { of: ['open2', 'route2'], mo: 9, text: S => `Open ${S.story.city2 ? S.byId[S.story.city2].name : 'the second city'}’s airport and fly a route to it` },
  { of: ['fees', 'served'], mo: 9, text: () => 'Pay your own way: ₭150M of airline fees in a day, and air service for four cities' }
];
/* Acts II and III: one mandate for the act, from its goals that the Ministry of Defence cares most about. It does not
   turn the act (the story's beats do), but a date missed or met moves the record as in Act I */
IC.MANDATES_ACT = {
  2: { of: ['alert', 'qra', 'milradar'], mo: 12, text: S => `Show them the border is watched: an alert pad at ${short(S.byId.ab_fwd.name)}, fighters up within 5 minutes of an order, and a military radar near the border` },
  3: { of: ['layers', 'basecover', 'depot'], mo: 10, text: S => `Make ${IC.cap(S).name} and ${short(S.byId.ab_fwd.name)} hard targets: two layers of missiles over the capital, cover for the air base, and a forward depot to keep them firing` }
};
const mandOf = S => S.story.act === 1 ? IC.MANDATES[S.story.ch] : IC.MANDATES_ACT[S.story.act] || null;
/* which mandate this is (a new key starts a new date), and when its clock started */
const mandKey = S => S.story.act === 1 ? S.story.ch : 'a' + S.story.act;
const mandT0 = S => S.story.act === 1 ? S.story.chT : S.story.actT;
/* how the mandate stands: { text, due, left, parts: [{ text, done, prog }], met, missed } */
IC.deskMandate = function (S) {
  const st = S.story, M = mandOf(S), d = st.desk; if (!M || !d) return null;
  const parts = M.of.map(id => st.goals.find(g => g.id === id)).filter(Boolean).map(g => ({ id: g.id, text: g.text, done: !!g.done, prog: !g.done && g.prog ? g.prog() : '' }));
  return { ch: st.ch, where: st.act === 1 ? `Chapter ${st.ch + 1}` : IC.ACTS[st.act].name, text: M.text(S), due: d.due, left: d.lapsed ? 'no date' : left(S, d.due), date: d.lapsed ? 'no date' : dateOf(S, d.due), dshort: d.lapsed ? 'overdue' : (c => `${c.d} ${IC.MONTHS[c.mo].slice(0, 3)}`)(IC.calAt(S, d.due)), parts, met: !!d.met, missed: d.miss || 0, lapsed: !!d.lapsed };
};
IC.deskMet = S => { const st = S.story, M = mandOf(S); return !!M && M.of.every(id => { const g = st.goals.find(x => x.id === id); return !g || g.done; }); };
const mandPay = S => (S.story.goals || []).reduce((s, g) => s + (g.pay || 0), 0);
function mandate(S) {
  const st = S.story, d = st.desk, M = mandOf(S); if (!M) return;
  if (d.mch !== mandKey(S)) { d.mch = mandKey(S); d.due = mandT0(S) + IC.MO(S, M.mo); d.miss = 0; d.met = false; d.lapsed = false; }
  if (!d.met && IC.deskMet(S)) meet(S);
  else if (!d.met && d.lapsed && st.act === 1 && S.time - (d.dragT || 0) >= IC.MO(S, 1)) {
    // (in Act I the mandate is the job: still not done, it costs a little every month, so standing still is not safe;
    // Acts II and III go on by their story, and a lapsed mandate there stays on the record only)
    d.dragT = S.time; d.drags = (d.drags || 0) + 1; record(S, Math.max(IC.DESK.drag * d.drags, IC.DESK.dragMax), 'the mandate still not done');
  }
  else if (!d.met && !d.lapsed && S.time > d.due) {
    // (late twice and the cabinet stops setting dates: the record carries the failure, it does not grow without end)
    const v = IC.DESK.missConf[Math.min(d.miss, IC.DESK.missConf.length - 1)];
    d.miss++;
    if (d.miss >= IC.DESK.missConf.length) { d.lapsed = true; d.dragT = S.time; d.drags = 0; } else d.due = S.time + IC.MO(S, Math.max(2, Math.round(M.mo / 2)));
    record(S, v, 'the mandate late');
    if (S.wait) IC.waitStop(S, 'The Minister’s date has passed.');
    castTrust(S, 'MIN', -6);
    IC.say(S, st.act === 1 ? 'MIN' : 'PM', d.miss === 1 ? `The date has passed, Director, and it is not done: ${M.text(S).charAt(0).toLowerCase() + M.text(S).slice(1)}. I have told the cabinet ${dateOf(S, d.due)}. Do not make me tell them another.` : `Late again. The cabinet has stopped asking me when. They are asking me who. It still wants it done.`);
    IC.emit(S, 'mandate', { ch: st.ch, act: st.act, met: false, miss: d.miss });
  }
}
function meet(S) {
  const st = S.story, d = st.desk, M = mandOf(S);
  d.met = true;
  const pay = mandPay(S);
  if (pay > 0) { S.budget += pay; IC.econBook(S, 'bonus', pay); }
  record(S, IC.DESK.metConf, 'the mandate met');
  castTrust(S, 'MIN', 6);
  IC.card(S, 'Mandate met', U.clock(S.time, S), `${M.text(S)}: done${d.miss ? ', late' : `, ${left(S, d.due)} before the date`}. ${metWords(S)}${pay > 0 ? ` The Ministry pays ${U.money(pay)}.` : ''}`, 'chapter');
  IC.emit(S, 'mandate', { ch: st.ch, act: st.act, met: true });
}
/* the chapter turns (story.js, before its goals change): a mandate met that the desk has not seen yet is met now */
IC.deskChapterEnd = function (S) {
  if (!on(S)) return;
  const st = S.story, d = st.desk || IC.deskInit(S);
  if (st.act !== 1) return;
  if (d.mch !== mandKey(S)) { const M = mandOf(S); if (!M) return; d.mch = mandKey(S); d.due = mandT0(S) + IC.MO(S, M.mo); d.miss = 0; d.met = false; }
  if (!d.met && IC.deskMet(S)) meet(S);
};
/* what was achieved, in the player's own numbers */
function metWords(S) {
  if (S.story.act > 1) return '';
  const ap = capAp(S), pax = Math.round(dayPax(S)), al = S.av.airlines.filter(a => !a.gone).length;
  return ap ? `${short(ap.name)} carries ${pax.toLocaleString('en-US')} passengers a day for ${al} airline${al === 1 ? '' : 's'}.` : '';
}

/* ---------- the record: what moves the Minister's confidence for months ---------- */
function record(S, v, why) {
  const d = S.story.desk; d.rec.push({ t: S.time, v, why });
  if (d.rec.length > 60) d.rec.shift();
}
/* the record's weight now: each entry halves over half of IC.DESK.fade months */
IC.deskRecord = function (S) {
  const d = S.story && S.story.desk; if (!d) return 0;
  const half = IC.MO(S, IC.DESK.fade / 2);
  let v = 0; for (const r of d.rec) v += r.v * Math.pow(0.5, (S.time - r.t) / half);
  return v;
};
/* the last few things that moved it, newest first, for the desk */
IC.deskWhy = S => { const d = S.story && S.story.desk; return d ? d.rec.slice(-4).reverse().map(r => ({ v: r.v, why: r.why, t: r.t })) : []; };

/* ---------- pressures ----------
   Each kind: find(S, d) → candidates { key, ap?, at, al?, fix? } ; make(S, c) → { who, title, text, mo, stake, pay?,
   reward } ; ok(S, P) → solved now ; prog(S, P) → words ; fail(S, P) → what happens when it is left. A problem from
   IC.aptProblems must have lasted IC.DESK.seen (game time) before anyone writes about it. */
const lasting = (S, d, key) => d.seen[key] != null && S.time - d.seen[key] >= IC.DESK.seen;
const probAt = (S, ap, f) => IC.aptProblems(S, ap).find(f);
const alAt = (S, ap) => { const n = {}; for (const x of S.av.deals) if (x.st === 'active' && x.a === ap.id) n[x.al] = (n[x.al] || 0) + 1; const id = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; return id ? S.av.airlines.find(a => a.id === id) : null; };
const satAt = (S, ap, v) => { for (const a of S.av.airlines) if (S.av.deals.some(x => x.st === 'active' && x.al === a.id && x.a === ap.id)) a.sat = U.clamp(a.sat + v, 0, 100); };
const goneFor = (S, P, now) => { if (now) { P.okT = null; return false; } if (P.okT == null) P.okT = S.time; return S.time - P.okT >= IC.DESK.calm; };
IC.PRESSURES = {
  stands: {
    find: (S, d) => ours(S).map(ap => ({ ap, p: probAt(S, ap, p => p.kind === 'stand') })).filter(c => c.p && lasting(S, d, c.p.id)).map(c => ({ key: 'stands:' + c.ap.id, ap: c.ap.id, at: { x: c.p.x, y: c.p.y }, al: (alAt(S, c.ap) || {}).id, fix: c.p.fix })),
    make: (S, c) => { const ap = S.byId[c.ap], al = S.av.airlines.find(a => a.id === c.al); const an = al ? al.name : 'The airlines';
      return { who: 'APT', title: `${short(an)}: aircraft waiting for stands`, mo: 1,
        text: `${an}’s aircraft sit on the taxiway at ${short(ap.name)} waiting for a free stand, engines running. Its operations chief has written: if it does not stop, it moves flights to an airport that has room.`,
        stake: `${an} walks out of a deal here, and the Minister −6`, conf: -6, reward: 3, pay: 25, payText: 'Rent buses and tow aircraft to remote spots (₭25M)' }; },
    ok: (S, P) => goneFor(S, P, !!probAt(S, S.byId[P.ap], p => p.kind === 'stand')),
    prog: (S, P) => probAt(S, S.byId[P.ap], p => p.kind === 'stand') ? 'aircraft are still waiting' : P.okT == null ? 'none waiting now' : `none waiting for ${U.dur(S.time - P.okT)} of the ${U.dur(IC.DESK.calm)} it takes`,
    fail: (S, P) => { const al = S.av.airlines.find(a => a.id === P.al), x = al && S.av.deals.find(q => q.st === 'active' && q.al === al.id && q.a === P.ap); if (x) IC.avBreakDeal(S, x.id, 'no stands for its aircraft'); }
  },
  rating: {
    // an airline's worst mark for an airport (its scorecard), bad for hours: it says so, and what would fix it
    find: (S, d) => ours(S).flatMap(ap => IC.aptProblems(S, ap).filter(p => p.kind === 'score' && lasting(S, d, p.id)).map(p => ({ key: p.id, ap: ap.id, al: p.id.split(':')[1], at: { x: p.x, y: p.y }, fix: p.fix, what: p.title, why: p.text }))),
    make: (S, c) => { const ap = S.byId[c.ap], al = S.av.airlines.find(a => a.id === c.al), an = al ? al.name : 'An airline';
      return { who: 'APT', title: `${short(an)} is unhappy at ${short(ap.name)}`, mo: 1.5, what: c.what,
        text: `${c.what}. ${c.why} Its chief executive has asked for a meeting with the Minister. Fix it, or it starts moving flights elsewhere.`,
        stake: `${an} drops a route here, and the Minister −4`, conf: -4, reward: 3, pay: 15, payText: `Give ${short(an)} a month’s discount on charges (₭15M)` }; },
    ok: (S, P) => goneFor(S, P, IC.aptProblems(S, S.byId[P.ap]).some(p => p.id === P.key)),
    prog: (S, P) => IC.aptProblems(S, S.byId[P.ap]).some(p => p.id === P.key) ? P.what : P.okT == null ? 'better now' : `better for ${U.dur(S.time - P.okT)} of the ${U.dur(IC.DESK.calm)} it takes`,
    fail: (S, P) => { const al = S.av.airlines.find(a => a.id === P.al); if (!al) return; al.sat = U.clamp(al.sat - 10, 0, 100); const x = S.av.deals.find(q => q.st === 'active' && q.al === al.id && q.a === P.ap); if (x) IC.avBreakDeal(S, x.id, 'how it is treated here'); }
  },
  terminal: {
    find: (S, d) => ours(S).map(ap => ({ ap, p: probAt(S, ap, p => p.kind === 'term') })).filter(c => c.p && lasting(S, d, c.p.id)).map(c => ({ key: 'terminal:' + c.ap.id, ap: c.ap.id, at: { x: c.p.x, y: c.p.y }, fix: c.p.fix })),
    make: (S, c) => { const ap = S.byId[c.ap];
      return { who: 'APT', title: `${short(ap.name)}: the terminal is full`, mo: 1.5,
        text: `Queues out of the doors at ${short(ap.name)}: check-in, security, the gates. Passengers miss flights and the papers are photographing the crowds. Lena Okafor wants room, or fewer flights.`,
        stake: 'every airline here −5, the airport’s name −6, and the Minister −5', conf: -5, reward: 3 }; },
    ok: (S, P) => goneFor(S, P, !!probAt(S, S.byId[P.ap], p => p.kind === 'term')),
    prog: (S, P) => { const ap = S.byId[P.ap], st = ap.st || {}; return `${Math.round(ap.paxRate || 0).toLocaleString('en-US')} passengers an hour, room for ${Math.round(st.pax || 0).toLocaleString('en-US')}`; },
    fail: (S, P) => { const ap = S.byId[P.ap]; satAt(S, ap, -5); ap.rep = U.clamp(IC.aptRep(ap) - 6, 0, 100); }
  },
  fuel: {
    find: (S, d) => ours(S).map(ap => ({ ap, p: probAt(S, ap, p => p.kind === 'fuel' && p.lvl === 'bad') })).filter(c => c.p && lasting(S, d, c.p.id)).map(c => ({ key: 'fuel:' + c.ap.id, ap: c.ap.id, at: { x: c.p.x, y: c.p.y }, fix: c.p.fix })),
    make: (S, c) => { const ap = S.byId[c.ap];
      return { who: 'APT', title: `${short(ap.name)}: departures wait for fuel`, mo: 1,
        text: `Departures at ${short(ap.name)} sit at their stands waiting for fuel. Every airline here is counting the minutes, and the crews are running out of hours.`,
        stake: 'every airline here −8, and the Minister −4', conf: -4, reward: 2, pay: 20, payText: 'Truck in fuel from the city depot (₭20M)' }; },
    ok: (S, P) => goneFor(S, P, !!probAt(S, S.byId[P.ap], p => p.kind === 'fuel' && p.lvl === 'bad')),
    prog: (S, P) => probAt(S, S.byId[P.ap], p => p.kind === 'fuel' && p.lvl === 'bad') ? 'still waiting for fuel' : P.okT == null ? 'fuel on time now' : `fuel on time for ${U.dur(S.time - P.okT)} of the ${U.dur(IC.DESK.calm)} it takes`,
    fail: (S, P) => satAt(S, S.byId[P.ap], -8)
  },
  winter: {
    // in autumn, an airport with jets and no landing system on a runway arrivals use
    find: (S) => { const c = IC.calAt(S, S.time); if (c.mo < 8 || c.mo > 10) return [];
      return ours(S).filter(ap => (ap.st && ap.st.longest || 0) >= IC.ACTYPES.narrow.rwy).map(ap => ({ ap, p: probAt(S, ap, p => p.kind === 'ils') })).filter(c2 => c2.p).map(c2 => ({ key: 'winter:' + c2.ap.id, ap: c2.ap.id, at: { x: c2.p.x, y: c2.p.y }, fix: c2.p.fix })); },
    make: (S, c) => { const ap = S.byId[c.ap], cl = IC.calAt(S, S.time), dec = IC.MO(S, cl.m + (11 - cl.mo));
      return { who: 'ATC', title: `${short(ap.name)}: winter is coming`, due: dec,
        text: `The forecasters expect fog most winter mornings from December. ${short(ap.name)} has a runway with no landing system: in fog every arrival on it diverts abroad, and the airlines are paid back. Ivo Marsh wants one before the first frost.`,
        stake: 'diversions all winter, and the Minister −5', conf: -5, reward: 2 }; },
    ok: (S, P) => !probAt(S, S.byId[P.ap], p => p.kind === 'ils'),
    prog: (S, P) => { const w = S.byId[P.ap].works.find(x => x.part && x.part.kind === 'ils'); return w ? `a landing system is being built: ${U.pct(w.prog || 0)}` : 'no landing system yet'; },
    fail: () => {}
  },
  delays: {
    find: (S) => { const y = S.av.yesterday, ap = capAp(S); if (!y || !ap || y.flights < 20 || (y.delays + y.div) / y.flights < 0.25) return []; return [{ key: 'delays', ap: ap.id, at: { x: ap.x, y: ap.y } }]; },
    make: (S) => { const y = S.av.yesterday || S.av.day;
      return { who: 'MIN', title: 'Flights are late', mo: 1,
        text: `Yesterday ${Math.round((y.delays + y.div) / Math.max(1, y.flights) * 100)}% of our flights were late or diverted. The Minister has had the airlines on the phone, and the papers have a name for us: the waiting room of the region. One good day would quiet them.`,
        stake: 'every airline −4, and the Minister −5', conf: -5, reward: 3 }; },
    ok: (S, P) => { const y = S.av.yesterday; return !!y && y !== P.y0 && y.flights >= 10 && (y.delays + y.div) / y.flights < 0.12; },
    prog: (S) => { const y = S.av.yesterday; return y && y.flights ? `yesterday ${Math.round((y.delays + y.div) / y.flights * 100)}% late or diverted; a day under 12% will do` : ''; },
    fail: (S) => { for (const a of S.av.airlines) a.sat = U.clamp(a.sat - 4, 0, 100); }
  },
  separation: {
    // only once the airspace is the player's to fix (radar opens in Chapter 3)
    find: (S, d) => { if (IC.storyLock(S, 'radar')) return []; const n = d.los.filter(t => S.time - t < IC.MO(S, 1)).length, ap = capAp(S); return n >= 3 && ap ? [{ key: 'separation', at: { x: ap.x, y: ap.y }, n }] : []; },
    make: (S, c) => ({ who: 'ATC', title: 'The regulator: near misses', mo: 2, n: c.n,
      text: `${c.n} losses of separation in a month. The safety regulator wants a month without one, or it fines the service and the papers get its report. Radar over the airways, airways that keep crossings apart, or fewer flights: the controllers can only keep apart what they can see.`,
      stake: 'a ₭40M fine, and the Minister −8', conf: -8, reward: 4 }),
    ok: (S, P) => S.time - P.t0 >= IC.MO(S, 1) && !S.story.desk.los.some(t => t > S.time - IC.MO(S, 1)),
    prog: (S, P) => { const L = S.story.desk.los, last = L.length ? L[L.length - 1] : P.t0; return `${U.months(Math.max(0, S.time - Math.max(last, P.t0)))} without one; a month will do`; },
    fail: (S) => IC.pay(S, 'penalty', 40)
  },
  treasury: {
    find: (S) => { const E = S.econ, M = E && E.months && E.months[E.months.length - 1]; if (!S.story.opened || S.budget > IC.CAREER_START * 0.12 || !M) return []; const st = IC.monthStatement(S, 1); return st && st.net < 0 ? [{ key: 'treasury', at: capAp(S) ? { x: capAp(S).x, y: capAp(S).y } : null }] : []; },
    make: (S) => ({ who: 'FIN', title: 'The Treasury is worried', mo: 2,
      text: `The treasury is down to ${U.money(S.budget)} and last month more went out than came in. Karl Ostrow wants a month in the black before he signs anything else. Fees come from flights: more deals, fuller aircraft, charges the airlines will pay. Running costs come from what you built.`,
      stake: 'the Minister −8, and Finance will remember it', conf: -8, reward: 4 }),
    ok: (S, P) => { const E = S.econ, M = E && E.months && E.months[E.months.length - 1]; return !!M && M.end && P.m0 != null && M.m > P.m0 && IC.monthStatement(S, 1).net >= 0; },
    prog: (S) => { const m = IC.monthStatement(S, 0); return m ? `this month so far: ${U.money(m.net)}` : ''; },
    fail: () => {}
  },
  strays: {
    find: (S) => { if (IC.storyLock(S, 'fields')) return []; const n = S.story.cnt.infT.filter(t => S.time - t < 86400).length, ap = capAp(S); return n >= 5 && ap ? [{ key: 'strays', at: { x: ap.x, y: ap.y }, n }] : []; },
    make: (S, c) => ({ who: 'ATC', title: 'Light aircraft in the control zone', mo: 1,
      text: `${c.n} light aircraft wandered into a control zone in a day, one of them across an airliner’s final approach. The controllers want them kept out: fields of their own away from the airports, and a call on the radio to every stray.`,
      stake: 'every flying club −10, and the Minister −4', conf: -4, reward: 2 }),
    ok: (S, P) => S.time - P.t0 >= 12 * H && S.story.cnt.infT.filter(t => S.time - t < 86400).length < 2,
    prog: (S) => `${S.story.cnt.infT.filter(t => S.time - t < 86400).length} in the last day; fewer than 2 will do`,
    fail: (S) => { for (const f of S.asp.fields) f.mood = Math.max(0, f.mood - 10); }
  },
  city: {
    // after Act I (whose second and third cities are the story's), a city beyond every airport's reach whose people
    // want to fly: its council writes, and the answer is an airport within 150 km
    find: (S) => { const st = S.story; if (st.act < 2) return []; const a = IC.cityAsks(S, 150); if (!a || a.city.id === st.city2 || a.city.id === st.city3) return [];
      return [{ key: 'city:' + a.city.id, city: a.city.id, at: { x: a.city.x, y: a.city.y }, n: Math.round(a.unserved / 100) * 100, size: a.size }]; },
    make: (S, c) => { const k = S.byId[c.city];
      return { who: 'MIN', title: `${k.name} wants to fly`, mo: 9, city: c.city,
        text: `${k.name} is more than 150 km from every airport we have, and some ${c.n.toLocaleString('en-US')} of its people a day would fly if they could. The council wants ${c.size === 'jets' ? 'an airport that takes jets' : 'at least a field for turboprops'} near the city, with a runway open within nine months. Found one from the build bar (B).`,
        stake: `${k.name}’s morale −10, public support −2, and the Minister −5`, conf: -5, reward: 4, pay: 30, payText: `Fund coaches from ${k.name} to the nearest airport (₭30M)` }; },
    ok: (S, P) => { const k = S.byId[P.city]; return !!k && ours(S).some(ap => U.dist(ap, k) < 1500); },
    prog: (S, P) => { const k = S.byId[P.city], f = k && S.infra.find(i => i.kind === 'airport' && i.owner === 'us' && U.dist(i, k) < 1500); return f ? `${short(f.name)} is founded: it needs a runway` : 'no airport near it yet'; },
    fail: (S, P) => { const k = S.byId[P.city]; if (k) k.morale = Math.max(0, k.morale - 10); S.support = Math.max(0, (S.support || 0) - 2); }
  },
  incidents: {
    // (with airport operations, airops.js) incidents keep happening at one airport: debris, spills, scrapes
    find: (S, d) => { const n = {}; for (const x of d.inc || []) if (S.time - x.t < IC.MO(S, 1)) n[x.ap] = (n[x.ap] || 0) + 1;
      return Object.keys(n).filter(id => n[id] >= 3 && S.byId[id]).map(id => ({ key: 'incidents:' + id, ap: id, at: { x: S.byId[id].x, y: S.byId[id].y }, n: n[id] })); },
    make: (S, c) => { const ap = S.byId[c.ap];
      return { who: 'APT', title: `${short(ap.name)}: one incident after another`, mo: 1.5,
        text: `${c.n} incidents on the airfield at ${short(ap.name)} in a month. The insurers want a month without one, or they raise the premium. An operations base near the runways, crews to clear debris and spills quickly, and stands with room round them all help.`,
        stake: 'a ₭30M rise in the premium, and the Minister −4', conf: -4, reward: 3 }; },
    ok: (S, P) => S.time - P.t0 >= IC.MO(S, 1) && !S.story.desk.inc.some(x => x.ap === P.ap && x.t > P.t0),
    prog: (S, P) => { const L = S.story.desk.inc.filter(x => x.ap === P.ap && x.t > P.t0); return L.length ? `${L.length} since; a month without one will do` : `${U.months(S.time - P.t0)} without one; a month will do`; },
    fail: (S) => IC.pay(S, 'penalty', 30)
  }
};

function pressureNew(S, kind, c) {
  const d = S.story.desk, K = IC.PRESSURES[kind], m = K.make(S, c);
  const P = Object.assign({ id: IC.nid('pr'), kind, key: c.key, ap: c.ap || null, al: c.al || null, at: c.at, fix: c.fix || null, t0: S.time, more: false, okT: null }, m);
  P.span = (P.due || S.time + IC.MO(S, m.mo || 1)) - S.time; P.due = S.time + P.span;
  if (kind === 'delays') P.y0 = S.av.yesterday;
  if (kind === 'treasury') P.m0 = S.cal ? S.cal.m : 0;
  d.P.push(P); d.cool[c.key] = S.time;
  IC.storyEvent(S, 'pressure', P.id);
  IC.emit(S, 'pressure', { id: P.id, kind, title: P.title, outcome: 'new' });
  return P;
}
IC.deskNew = (S, kind, c) => pressureNew(S, kind, c);
function close(S, P, outcome) {
  const d = S.story.desk;
  d.P = d.P.filter(x => x !== P);
  d.log.push({ t: S.time, kind: P.kind, title: P.title, outcome });
  if (d.log.length > 40) d.log.shift();
  if (outcome === 'solved') { record(S, P.reward || 2, P.title); castTrust(S, P.who, 4); IC.log(S, 'kill', 'DESK', `${P.title}: dealt with.`); IC.say(S, P.who, THANKS[P.kind] ? THANKS[P.kind](S, P) : 'That is sorted. Thank you, Director.'); }
  else if (outcome === 'paid') { record(S, -1, `${P.title}: paid off`); castTrust(S, P.who, 1); IC.log(S, 'info', 'DESK', `${P.title}: paid off.`); }
  else if (outcome === 'failed' || outcome === 'refused') {
    record(S, outcome === 'refused' ? Math.round(P.conf * 0.6) : P.conf, `${P.title}: ${outcome === 'refused' ? 'refused' : 'left'}`);
    castTrust(S, P.who, outcome === 'refused' ? -3 : -6);
    IC.PRESSURES[P.kind].fail(S, P);
    if (S.wait && outcome === 'failed') IC.waitStop(S, `${P.title}: the date has passed.`);
    IC.log(S, 'leak', 'DESK', `${P.title}: ${outcome === 'refused' ? 'refused' : 'the date passed'}. ${P.stake.charAt(0).toUpperCase() + P.stake.slice(1)}.`);
  }
  IC.emit(S, 'pressure', { id: P.id, kind: P.kind, title: P.title, outcome });
}
const THANKS = {
  rating: (S, P) => `${short(S.byId[P.ap].name)}: the airline has stopped complaining. Its chief executive cancelled the meeting with the Minister.`,
  stands: (S, P) => `${short(S.byId[P.ap].name)} has room for every aircraft again. The airlines have noticed.`,
  terminal: (S, P) => `The queues at ${short(S.byId[P.ap].name)} are gone. The papers have moved on to something else.`,
  fuel: (S, P) => `Fuel is on time at ${short(S.byId[P.ap].name)}. The crews have stopped counting.`,
  winter: (S, P) => `${short(S.byId[P.ap].name)} can land in fog now. Let it come.`,
  delays: () => 'A good day, on time. I had the airlines on the phone again: to say so.',
  separation: () => 'A month without a loss of separation. The regulator has closed its file.',
  treasury: () => 'A month in the black. Finance has stopped writing to me.',
  strays: () => 'The light aircraft keep out of the zones now. My controllers can breathe.',
  city: (S, P) => `${S.byId[P.city].name} has its airport. The council has sent the Minister a letter of thanks, and a photograph.`,
  incidents: (S, P) => `A clean month at ${short(S.byId[P.ap].name)}. The insurers have left the premium alone.`
};
/* the player's answers, from the card or the desk: 'pay' (where money can), 'more' (time, once), 'refuse' */
IC.deskAnswer = function (S, id, how) {
  const d = S.story && S.story.desk, P = d && d.P.find(x => x.id === id); if (!P) return false;
  if (how === 'pay') { if (!P.pay || S.budget < P.pay) return false; IC.pay(S, 'events', P.pay); close(S, P, 'paid'); return true; }
  if (how === 'more') { if (P.more) return false; P.more = true; P.due += P.span / 2; record(S, -IC.DESK.more, `${P.title}: more time`); IC.emit(S, 'pressure', { id: P.id, kind: P.kind, title: P.title, outcome: 'time' }); return true; }
  if (how === 'refuse') { close(S, P, 'refused'); return true; }
  return false;
};
/* the card a pressure arrives with: the first answer (taken if the card is left) puts it on the desk */
IC.EV.pressure = (S, id) => {
  const P = S.story.desk.P.find(x => x.id === id) || { title: 'A problem', text: '', stake: '', who: 'MIN' };
  const opts = [{ t: `Take it on: by ${P.due ? dateOf(S, P.due) : 'the date'}`, tip: `If it is not done by then: ${P.stake}.`, fx: () => {} }];
  if (P.pay) opts.push({ t: P.payText, tip: 'Closes it now, for money: the Minister notes you paid rather than fixed it.', fx: () => IC.deskAnswer(S, id, 'pay') });
  opts.push({ t: 'Refuse', tip: `Take most of the hit now: ${P.stake}.`, fx: () => IC.deskAnswer(S, id, 'refuse') });
  return { title: P.title, who: who(P.who), at: P.at, text: `${P.text} If it is left past the date: ${P.stake}.`, opts };
};

/* ---------- the quarterly review ---------- */
const GR = ['A', 'B', 'C', 'D', 'E'], GV = [8, 4, 0, -6, -12];
const grade = (v, cuts, up) => { for (let i = 0; i < cuts.length; i++) if (up ? v >= cuts[i] : v <= cuts[i]) return i; return 4; };
function review(S) {
  const d = S.story.desk, q = d.q, days = Math.max(1, q.days), prev = d.qPrev;
  if (q.flights < 30) { d.qPrev = q; d.q = quarter(S); return null; }
  // (against the same quarter a year before when there is one: summer is always busier than autumn)
  const paxDay = q.pax / days, ago = d.revs.length >= 4 && d.revs[d.revs.length - 4].pax, was = ago || (prev && prev.days ? prev.pax / prev.days : 0);
  const grow = was > 100 ? paxDay / was - 1 : 1;
  const late = (q.late + q.div) / Math.max(1, q.flights);
  const risk = (q.los + q.acc * 5 + q.dead * 0.5) / Math.max(1, q.flights) * 1000;
  const run = q.money / Math.max(1, q.mo);
  // (the first two quarters after the opening are for building: the Minister expects less of the money then)
  const young = Math.max(0, 2 - d.revs.length) * 150;
  const R = [
    { k: 'Passengers', g: grade(grow, [0.2, 0.05, -0.05, -0.15], true), say: `${Math.round(paxDay).toLocaleString('en-US')} a day${was > 100 ? `, ${grow >= 0 ? '+' : ''}${Math.round(grow * 100)}% on ${ago ? 'the same quarter last year' : 'the quarter before'}` : ''}` },
    { k: 'Reliability', g: grade(late, [0.05, 0.1, 0.18, 0.28]), say: `${Math.round(late * 100)}% of flights late or diverted` },
    { k: 'Safety', g: grade(risk, [0.3, 1.5, 4, 8]), say: q.acc ? `${q.acc} accident${q.acc > 1 ? 's' : ''}${q.dead ? `, ${q.dead} dead` : ''}, ${q.los} losses of separation` : q.los ? `${q.los} loss${q.los > 1 ? 'es' : ''} of separation in ${Math.round(q.flights).toLocaleString('en-US')} flights` : 'no accident and no loss of separation' },
    { k: 'Money', g: grade(run + young, [150, 50, 0, -100], true), say: `${run >= 0 ? '+' : ''}${U.money(run)} a month after running costs` }
  ];
  const v = R.reduce((s, r) => s + GV[r.g], 0) / R.length, c = IC.calAt(S, S.time - 1);
  const rv = { t: S.time, q: `${['Winter', 'Spring', 'Summer', 'Autumn'][Math.floor(c.mo / 3)]}, Year ${c.y}`, rows: R.map(r => ({ k: r.k, g: GR[r.g], say: r.say })), v, pax: paxDay };
  d.revs.push(rv); if (d.revs.length > 16) d.revs.shift();
  record(S, Math.round(v * 1.5), `the ${rv.q} review`);
  const avg = GR[Math.round(R.reduce((s, r) => s + r.g, 0) / R.length)];
  IC.card(S, `The quarter in review · ${avg}`, rv.q, R.map(r => `${r.k}: ${GR[r.g]}. ${r.say}.`).join(' ') + ` ${v >= 4 ? 'The Minister is pleased, and says so in cabinet.' : v >= 0 ? 'The Minister has no complaints, and no praise either.' : v > -6 ? 'The Minister wants better next quarter.' : 'The Minister has asked to see you.'}`, 'chapter', { review: rv });
  if (IC.cutscene && (v >= 6 || v <= -8)) IC.cutscene(S, 'review', { good: v > 0, rv });
  IC.emit(S, 'review', rv);
  d.qPrev = q; d.q = quarter(S);
  return rv;
}
IC.deskReview = review;
const quarter = S => ({ pax: 0, flights: 0, late: 0, div: 0, los: 0, acc: 0, dead: 0, days: 0, money: 0, mo: 0, m0: S.cal ? S.cal.m : 0 });
/* running money of a closed month: everything but building, buying and loans taken */
const RUN = new Set(['base', 'tax', 'trade', 'apt', 'fee_land', 'fee_pax', 'fee_cargo', 'fee_over', 'upApt', 'upAD', 'upAir', 'upStaff', 'penalty', 'loan']);
IC.onMonth((S) => {
  if (!on(S) || !S.story.desk) return;
  const d = S.story.desk, E = S.econ, M = E && E.months && E.months[E.months.length - 1];
  if (M && S.story.opened) { let v = 0; for (const k in M.book) if (RUN.has(k)) v += M.book[k]; d.q.money += v; d.q.mo++; }
  if (S.cal && S.cal.m % 3 === 0 && S.story.opened) review(S);
});

/* ---------- losing ---------- */
const boss = S => S.story.act === 1 ? 'MIN' : 'PM';
function standing(S) {
  const st = S.story, d = st.desk;
  if (st.act >= 3) return;
  const W = IC.DESK.warnAt;
  if (st.standing < IC.DESK.sackAt) {
    if (d.lowT == null) { d.lowT = S.time; IC.say(S, boss(S), `I have run out of reasons to keep you, Director. If nothing changes within a month, the Prime Minister will appoint someone else.`); IC.emit(S, 'deskLow', { t: S.time }); }
    else if (S.time - d.lowT >= IC.MO(S, 1) && !S.over) sack(S);
  } else if (d.lowT != null && st.standing >= IC.DESK.sackAt + 5) { d.lowT = null; IC.say(S, boss(S), 'You have bought yourself some time. Use it.'); }
  const band = st.standing < W[1] ? 2 : st.standing < W[0] ? 1 : 0;
  // (a band the Minister has spoken of in the last two months is not said again)
  if (band > (d.band || 0) && !(band <= (d.wBand || 0) && S.time - (d.wT || -1e12) < IC.MO(S, 2))) { d.wBand = band; d.wT = S.time; const r = IC.deskWhy(S).filter(x => x.v < 0)[0]; IC.say(S, boss(S), band === 2 ? `The cabinet is asking about you, Director${r ? `, and about ${lc1(r.why)}` : ''}. Fix what is on your desk.` : `I am losing patience${r ? `: ${lc1(r.why)}` : ''}. The grant follows my confidence.`); }
  d.band = band;
}
function sack(S) {
  const d = S.story.desk, bad = d.log.filter(x => x.outcome === 'failed' || x.outcome === 'refused').slice(-3).map(x => x.title.toLowerCase());
  const why = `The Prime Minister has ${S.story.act === 1 ? 'accepted the Minister’s advice and ' : ''}appointed a new ${IC.ACTS[S.story.act].role}.${bad.length ? ` The letter names ${bad.join('; ')}.` : ''}${d.revs.length ? ` Your last review: ${d.revs[d.revs.length - 1].rows.map(r => `${r.k.toLowerCase()} ${r.g}`).join(', ')}.` : ''}`;
  if (IC.cutscene) IC.cutscene(S, 'sacked', { why });
  IC.gameOver(S, why);
}
IC.deskSack = sack;
/* how close the player is to being replaced, for the desk and the Career room */
IC.deskDanger = function (S) {
  const st = S.story, d = st && st.desk; if (!d || st.act >= 3) return null;
  if (d.lowT != null) return { lvl: 2, text: `Replaced in ${left(S, d.lowT + IC.MO(S, 1))} unless the Minister’s confidence rises above ${IC.DESK.sackAt + 5}.` };
  if (st.standing < IC.DESK.warnAt[0]) return { lvl: 1, text: `Under ${IC.DESK.sackAt} for a month and you are replaced.` };
  return null;
};

/* ---------- every step ---------- */
IC.deskInit = function (S) {
  const st = S.story;
  // (saves from before the cap on misses: a mandate missed more than twice has no date)
  if (st.desk && st.desk.miss >= IC.DESK.missConf.length) st.desk.lapsed = true;
  st.desk = st.desk || { mch: -1, due: 0, miss: 0, met: false, P: [], cool: {}, seen: {}, next: 0, rec: [], log: [], los: [], q: quarter(S), qPrev: null, revs: [], lowT: null, band: 0, yDay: null, inc: [] };
  if (!st.desk.inc) st.desk.inc = [];
  return st.desk;
};
IC.deskTick = function (S, dt) {
  if (!on(S)) return;
  const st = S.story, d = st.desk || IC.deskInit(S);
  d.tT = (d.tT || 0) - dt; if (d.tT > 0) return;
  d.tT = 30;
  mandate(S);
  standing(S);
  if (!st.opened) return;
  // the day's flights into the quarter
  const y = S.av.yesterday;
  if (y && y !== d.yDay) { d.yDay = y; d.q.days++; d.q.pax += y.pax; d.q.flights += y.flights; d.q.late += y.delays; d.q.div += y.div; }
  // problems that have lasted (the seen map: when each was first seen, dropped when gone)
  const now = new Set();
  for (const ap of ours(S)) for (const p of IC.aptProblems(S, ap)) { now.add(p.id); if (d.seen[p.id] == null) d.seen[p.id] = S.time; }
  for (const k in d.seen) if (!now.has(k)) delete d.seen[k];
  // the desk: solved, out of time
  for (const P of d.P.slice()) {
    const K = IC.PRESSURES[P.kind];
    if (K.ok(S, P)) close(S, P, 'solved');
    else if (S.time > P.due) close(S, P, 'failed');
    else if (!P.warned && P.due - S.time < Math.min(P.span * 0.25, IC.MO(S, 0.3))) {
      P.warned = true;
      // (Wait runs a month a minute: a date close stops it, so a pressure is never lost unseen)
      if (S.wait) IC.waitStop(S, `${P.title}: ${left(S, P.due)} left.`);
      IC.emit(S, 'pressure', { id: P.id, kind: P.kind, title: P.title, outcome: 'due' });
    }
  }
  // something new, on the play clock
  if (!d.next) d.next = st.play + IC.DESK.first;
  if (d.P.length >= IC.DESK.open || st.play < d.next || st.events.length) return;
  // (the kinds in turn, from the one after the last: no single kind fills the desk)
  const K = Object.keys(IC.PRESSURES), k0 = K.indexOf(d.lastKind) + 1;
  for (let i = 0; i < K.length; i++) {
    const kind = K[(k0 + i) % K.length];
    const c = IC.PRESSURES[kind].find(S, d).find(x => !d.P.some(P => P.key === x.key) && (d.cool[x.key] == null || S.time - d.cool[x.key] > IC.MO(S, IC.DESK.again)));
    if (!c) continue;
    pressureNew(S, kind, c); d.lastKind = kind;
    d.next = st.play + U.rand(IC.DESK.gap[0], IC.DESK.gap[1]);
    return;
  }
};
/* what the desk shows: the open pressures with their words */
IC.deskList = S => { const d = S.story && S.story.desk; return d ? d.P.map(P => ({ P, left: left(S, P.due), date: dateOf(S, P.due), prog: IC.PRESSURES[P.kind].prog(S, P), late: P.due - S.time < P.span * 0.25 })) : []; };

/* what the quarter counts: losses of separation and accidents */
IC.on((S, type, x) => {
  if (!on(S) || !S.story.desk) return;
  const d = S.story.desk;
  if (type === 'lossSep' || type === 'nearMiss') { d.los.push(S.time); if (d.los.length > 50) d.los.shift(); d.q.los++; }
  else if (type === 'aptIncident' && x && x.ap) { (d.inc = d.inc || []).push({ t: S.time, ap: x.ap.id }); if (d.inc.length > 40) d.inc.shift(); }
  else if (type === 'crash') { d.q.acc++; d.q.dead += x.dead || 0; if (IC.cutscene) IC.cutscene(S, 'crash', { ap: x.ap, cause: x.cause, dead: x.dead }); record(S, -(4 + Math.min(10, (x.dead || 0) / 10)), `the accident at ${x.ap ? short(x.ap.name) : 'an airport'}`); }
});

})(window.IC);
