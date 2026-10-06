/* Iron Canopy — (round 5b) tutorials that wait for the player to do it. A tutorial is a few steps; each points at
   the real thing on screen (el: an anchor or CSS selector, as IC.hint takes) and says what to do, and it moves on
   only when the game sees that done: a click the page reports (IC.emit 'ui' { act, v, n, al } from main.js), a game
   event (a loan taken), or the thing it opens being on screen (seen: a selector the page reports visible). A step
   the player does before it is asked is ticked off then. No Next button: a small Skip only.
   IC.TUTORS[id] = { title, steps: [{ el, title, text, on: [[type, act, v?]...], seen? }] }; the state is
   S.tutor = { cur, i, done: { id: [step flags] }, over: { id: 1 } } and saves with the game. Headless; the page
   draws the current step (ui.js). Other features add their own entries the same way. */
(function (IC) {
'use strict';
IC.TUTORS = {
  dayboard: { title: 'The day board', guide: 'deals', when: 'ch1', open: 'day', steps: [
    { el: '[data-act="aptOpen"][data-v="day"]', title: 'The day board', text: 'Open the day board: every airline\'s departures by the hour, against what your runways can take.', on: [['ui', 'aptOpen', 'day']], seen: '.dayb' },
    { el: '.dayb .dcap', title: 'Cap the busy hour', text: 'Where the stack reaches the dashed line, departures queue. Pick a cap: no more than that many leave in any hour; the rest move to the next hour with room.', on: [['ui', 'dayCap']] },
    { el: '.dayb .dbanks', title: 'Move a bank', text: 'Push one airline\'s flights an hour earlier or later with its arrows. Its whole day moves with it.', on: [['ui', 'dayShift']] },
    { el: '.dayb .dnight', title: 'Decide the night', text: 'Open pays and keeps the freighters happy; a quota keeps the town asleep most of the time; a curfew shuts the airport 23:00–06:00. Pick one.', on: [['ui', 'dayNight']] }
  ] },
  scorecards: { title: 'Airline scorecards', guide: 'deals', when: 'cards', open: 'score', steps: [
    { el: '[data-act="aptOpen"][data-v="score"]', title: 'What the airlines think', text: 'Open the scorecards: each airline marks this airport on time-keeping, taxiing, gates, fuel, charges and bags.', on: [['ui', 'aptOpen', 'score']], seen: '.t.score' },
    { el: '.t.score [data-act="pmFix"]', title: 'Fix the worst', text: 'Under each airline is what it minds most. This button fixes it: press it.', on: [['ui', 'pmFix']] }
  ] },
  fleet: { title: 'Ground vehicles', guide: 'runway', when: 'ch1', open: 'fleet', steps: [
    { el: '[data-act="aptOpen"][data-v="fleet"]', title: 'Your ground fleet', text: 'Open Ground vehicles: the tugs, apron buses and fuel trucks this airport owns.', on: [['ui', 'aptOpen', 'fleet']], seen: '.fleet' },
    { el: '.fleet [data-act="gseAdd"][data-v="tug"][data-n="1"]', title: 'Buy a tug', text: 'Each tug pushes back about ten aircraft an hour. Press + to buy one.', on: [['ui', 'gseAdd', 'tug']] },
    { el: '.fleet [data-act="gseAuto"]', title: 'Or let it run itself', text: 'Keep it matched buys and sells to what the traffic needs. Press it to see it switch; leave it on unless you want to run the fleet by hand.', on: [['ui', 'gseAuto']] }
  ] },
  treasury: { title: 'In the red', guide: 'money1', when: 'red', steps: [
    { el: 'rail-economy', title: 'The treasury is below zero', text: 'Nothing new can be built or bought. Open the Economy room to see where the money goes.', on: [['ui', 'room', 'economy']], seen: '#warroom [data-act="redLoan"]' },
    { el: '[data-act="redLoan"]', title: 'The Treasury\'s loan', text: 'Its emergency loan costs 2.5% a month, more than twice the banks. Take it to start building again, or cut running costs and wait.', on: [['ui', 'redLoan'], ['loan'], ['redOut']] }
  ] }
};
const st = S => S.tutor || (S.tutor = { cur: null, i: 0, done: {}, over: {} });
const flags = (S, id) => { const T = st(S); return T.done[id] || (T.done[id] = IC.TUTORS[id].steps.map(() => 0)); };
/* does this event do that step? */
IC.tutorMatch = (step, type, d) => (step.on || []).some(([t, act, v]) => t === type && (!act || (d && d.act === act)) && (v == null || (d && String(d.v) === String(v))));
/* the step now shown: { id, i, n, step } or null */
IC.tutorNow = function (S) {
  const T = S.tutor; if (!T || !T.cur || !IC.TUTORS[T.cur]) return null;
  const F = flags(S, T.cur), i = F.indexOf(0);
  if (i < 0) { T.over[T.cur] = 1; T.cur = null; return null; }
  return { id: T.cur, i, n: F.length, step: IC.TUTORS[T.cur].steps[i] };
};
/* start one (the first time the player meets what it teaches, or again from the Guide) */
IC.tutorStart = function (S, id, again) {
  const T = st(S); if (!IC.TUTORS[id] || (T.cur === id && !again)) return false;
  if (T.over[id] && !again) return false;
  if (again) { delete T.over[id]; T.done[id] = IC.TUTORS[id].steps.map(() => 0); }
  T.cur = id; IC.tutorNow(S);
  IC.emit(S, 'tutorStart', id);
  return true;
};
IC.tutorSkip = function (S) { const T = st(S); if (T.cur) { T.over[T.cur] = 1; T.cur = null; } };
IC.tutorSeen = (S, id) => !!(S.tutor && S.tutor.over[id]);
/* may it start now: not before the story reaches what it teaches */
IC.tutorWhen = function (S, id) {
  const T = IC.TUTORS[id], s = S.story, ch1 = !s || s.act > 1 || s.ch >= 1;
  return T.when === 'red' ? !!S.red : T.when === 'cards' ? ch1 && !!(S.av && S.av.airlines.some(a => a.sc)) : T.when === 'ch1' ? ch1 : true;
};
/* something happened: tick off every step of an unfinished tutorial it does (ahead of time too) */
IC.tutorEvent = function (S, type, d) {
  if (!S || S.time == null) return;
  const T = S.tutor; if (!T && type !== 'ui') return;
  for (const id in IC.TUTORS) {
    if ((T && T.over[id]) || !IC.TUTORS[id].steps.some(s => IC.tutorMatch(s, type, d))) continue;
    const F = flags(S, id);
    IC.TUTORS[id].steps.forEach((s, i) => { if (IC.tutorMatch(s, type, d)) F[i] = 1; });
  }
  if (S.tutor) IC.tutorNow(S);
};
/* the page saw a step's seen-selector on screen */
IC.tutorSaw = function (S, id, i) { const F = flags(S, id); if (!F[i]) { F[i] = 1; IC.tutorNow(S); } };
IC.on((S, type, d) => { if (type !== 'tutorStart' && S && S.mode !== 'academy') IC.tutorEvent(S, type, d); });
})(window.IC);
