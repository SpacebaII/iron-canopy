/* Iron Canopy — (brief 71) airport operations: the incidents an airport lives with, each with a cause, a response
   that takes its real minutes and a closure until it is done. Debris on a runway (a tyre, a panel, bird remains)
   is reported by a crew and the player decides: close the runway and sweep it, or keep it open and risk an engine;
   a fuel spill under a truck at a stand closes the stand until the fire crew and the cleaners are done, and burns
   if the trucks are slow; a pushback scrapes a neighbour's wingtip when the tugs are rushed or the stands tight; an
   arrival in gusts beyond its crew's limit, or on a wet runway only just long enough, runs off the side and closes
   the runway until it is lifted back. The Airside operations base (sweepers, the recovery kit, the follow-me cars)
   decides how fast the clean-up comes. Each incident is a list of stages (ap.incs.list); the map and the airport
   panel draw them with their bars (render-ops.js, inspector.js). Headless. */
(function (IC) {
'use strict';
const U = IC.U;

IC.OPS = {
  debris: 0.003,     // a piece of debris left on the runway, per movement (worn pavement, patched craters: more)
  spill: 0.006,       // a fuel spill, per refuelling by truck (rushed when the trucks are short: more)
  scrape: 0.002,     // a wingtip scraped, per pushback (tight stands, rushed tugs, the dark: more)
  excursion: 6,       // a runway excursion: this many times the crash risk of the gusts or tailwind
  overrunExc: 0.75,   // a runway only just long enough: this share of its crash risk ends in the grass instead
  wetExc: 0.0006,     // an arrival sliding off a wet runway, per landing in rain or snow
  ask: 240,           // a crew reports debris: the tower's own call after this long without the player's
  openRisk: 0.05,     // debris left on a runway: an engine or tyre damaged, per movement over it
  openMax: 7200,      // debris left on a runway: the next routine inspection sweeps it
  rushCost: 3,        // ₭M to send every crew and machine the airport can find: halves what is left of the stage
  baseSpd: 0.2,       // the ops base's vehicles across the airfield, units a second (72 km/h)
  contractor: 1200    // without an ops base: a sweeper or crane from a contractor in town, s to arrive
};

/* the kinds: words for the pill, the map and the report; the fix that would have helped */
IC.OPS_INC = {
  debris:    { name: 'Debris on the runway', tag: 'RUNWAY', col: 'amber' },
  bird:      { name: 'Bird strike', tag: 'BIRD STRIKE', col: 'amber' },
  spill:     { name: 'Fuel spill', tag: 'FUEL SPILL', col: 'red' },
  scrape:    { name: 'Wingtip strike', tag: 'GROUND', col: 'amber' },
  excursion: { name: 'Runway excursion', tag: 'EXCURSION', col: 'red' }
};
/* the stages: what is being done, in words for "now: …" */
const STG = {
  ask: 'Crew report: waiting for your call',
  open: 'Kept open: debris on the runway',
  drive: 'Ops vehicles on the way',
  fire: 'Fire trucks on the way',
  foam: 'Fire crew making it safe',
  burn: 'Fire on the stand',
  sweep: 'Sweeping the runway',
  clean: 'Cleaning up the fuel',
  inspect: 'Inspecting the runway',
  check: 'Engineers checking the aircraft',
  disembark: 'Passengers off by the stairs',
  recover: 'Lifting the aircraft back onto the pavement',
  tow: 'Towing it off the runway'
};
IC.OPS_STG = STG;

const ops = ap => ap.incs || (ap.incs = { list: [], log: [], n: 0 });
const alive = (ap, k) => ap.parts.filter(p => p.kind === k && p.built && p.hp > p.max * 0.25);
const rwOf = (ap, id) => ap.parts.find(p => p.id === id && p.kind === 'runway');
const standOf = (ap, id) => IC.aptStands(ap).find(s => s.id === id);
const tailOf = (S, id) => S.av && S.av.tails.find(t => t.id === id);
const on = () => !!(IC.FOCUS && IC.FOCUS.ops);
/* the tests and the screenshot tools: IC.OPS.force = kind makes the next chance of that kind happen */
const forced = k => { if (IC.OPS.force !== k) return false; IC.OPS.force = null; return true; };
const ours = ap => ap && ap.parts && ap.owner === 'us' && ap.kind !== 'airbase';
/* the ops base's vehicles to a point: a minute to turn out, then across the airfield; without one the contractor */
IC.opsTime = function (ap, at) {
  let best = null;
  for (const b of alive(ap, 'opsbase')) { const t = 60 + U.dist(b, at) / IC.OPS.baseSpd; if (!best || t < best.t) best = { t, from: b }; }
  return best || { t: IC.OPS.contractor, from: null };
};
IC.opsBase = ap => alive(ap, 'opsbase').length > 0;
/* the runway group key, as ground ops locks it */
const keyOf = (ap, rwId) => IC.aptGraph(ap).grp[rwId] || rwId;

/* ---------- starting one ---------- */
/* o: { kind, x, y, rw, stand, tail, mv, cause, fix, stages: [[k, dur]], shut: 'rw' | 'stand' | null, ask } */
function start(S, ap, o) {
  const O = ops(ap), K = IC.OPS_INC[o.kind];
  const inc = { id: IC.nid('op'), kind: o.kind, ap: ap.id, x: o.x, y: o.y, t0: S.time, rw: o.rw || null, stand: o.stand || null, tail: o.tail || null, mv: o.mv || null,
    what: o.what, cause: o.cause || '', fix: o.fix || '', stages: o.stages.map(([k, dur]) => ({ k, dur: Math.max(30, dur) })), si: 0, t: 0, shut: o.shut || null, ask: !!o.ask, rushed: false, cost: o.cost || 0, done: false, from: o.from || null };
  inc.dur = inc.stages.reduce((a, s) => a + s.dur, 0);
  O.list.push(inc); O.n++;
  if (inc.shut) close(S, ap, inc, true);
  if (inc.cost) IC.pay(S, 'repair', inc.cost);
  const words = `${ap.name}: ${inc.what}`;
  IC.log(S, inc.kind === 'excursion' || inc.kind === 'spill' ? 'leak' : 'warn', K.tag, `${words}. ${inc.cause ? `The cause: ${inc.cause}.` : ''}`, { x: inc.x, y: inc.y });
  // the short list under the top bar: the stage now, and for a report the two choices
  if (IC.incidentAdd) inc.pill = IC.incidentAdd(S, 'ops', inc, pillText(S, ap, inc), inc.kind === 'excursion' || inc.kind === 'spill' ? 'alarm' : 'warn').id;
  IC.emit(S, 'aptIncident', { ap, inc });
  return inc;
}
function pillText(S, ap, inc) {
  const st = inc.stages[Math.min(inc.si, inc.stages.length - 1)], left = IC.opsLeft(S, inc);
  return `${ap.name}: ${inc.what}${inc.done ? '' : ` · ${STG[st.k]}${st.k === 'open' ? '' : `, ${U.dur(Math.max(30, left))} to go`}`}`;
}
/* closing what it lies on: a runway group (ground ops keeps everyone off it but crossings) or a stand */
function close(S, ap, inc, yes) {
  if (inc.shut === 'rw' && inc.rw) {
    const k = keyOf(ap, inc.rw), M = ap.opsShut = ap.opsShut || {};
    if (yes) M[k] = inc.id; else if (M[k] === inc.id) delete M[k];
    ap.cfg = null;
  }
  if (inc.shut === 'stand' && inc.stand) { const s = standOf(ap, inc.stand); if (s) { if (yes) s.shut = inc.id; else if (s.shut === inc.id) s.shut = null; } }
}
/* why a runway group is closed now, for the tower's words; '' when it is open */
IC.opsShutWhy = function (S, ap, k) {
  const id = ap.opsShut && ap.opsShut[k]; if (!id) return '';
  const inc = ops(ap).list.find(x => x.id === id);
  if (!inc || inc.done) { delete ap.opsShut[k]; return ''; }
  return `runway closed: ${U.lc(STG[inc.stages[Math.min(inc.si, inc.stages.length - 1)].k])}`;
};
/* how long it has left, over every stage */
IC.opsLeft = function (S, inc) {
  let t = 0; for (let i = inc.si; i < inc.stages.length; i++) t += i === inc.si ? Math.max(0, inc.stages[i].dur - inc.t) : inc.stages[i].dur;
  return t;
};
IC.opsProg = inc => inc.done ? 1 : U.clamp(1 - IC.opsLeft(null, inc) / Math.max(1, inc.dur), 0, 1);
IC.opsStage = inc => inc.stages[Math.min(inc.si, inc.stages.length - 1)];

/* ---------- the runway: debris after a movement, a bird strike, an excursion ---------- */
/* a crew reports debris: the player has IC.OPS.ask seconds to choose, then the tower closes it to be safe */
function debris(S, ap, rw, t, kind, what, cause, fix) {
  if (ops(ap).list.some(x => !x.done && x.rw === rw.id && (x.kind === 'debris' || x.kind === 'bird' || x.kind === 'excursion'))) return null;
  const at = IC.rwAt(rw, U.clamp(t, 0.1, 0.9)), go = IC.opsTime(ap, at), L = IC.rwLen(rw);
  return start(S, ap, { kind, x: at.x, y: at.y, rw: rw.id, what, cause, fix, ask: true, from: go.from && go.from.id,
    stages: [['ask', IC.OPS.ask], ['drive', go.t], ['sweep', (240 + L * 8) * (go.from ? 1 : 1.6)], ['inspect', go.from ? 240 : 540]] });
}
const DEBRIS_WHAT = [
  ['a crew reports debris on the runway after take-off', 'part of a tyre tread'],
  ['a crew reports debris on the runway after landing', 'a piece of metal from an aircraft panel'],
  ['a crew reports something on the runway', 'a loose runway light fitting']
];
IC.on((S, type, d) => {
  if (type !== 'rwMove' || !on() || !ours(d.ap) || !d.rw) return;
  const ap = d.ap, rw = typeof d.rw === 'string' ? rwOf(ap, d.rw) : d.rw;
  if (!rw || !rw.built) return;
  const T = IC.ACTYPES[d.type] || {};
  if (T.mil) return;
  // debris left on a runway kept open: each movement over it may suck it into an engine or cut a tyre
  const open = ops(ap).list.find(x => !x.done && x.rw === rw.id && IC.opsStage(x).k === 'open');
  if (open) { open.over = (open.over || 0) + 1; if (Math.random() < IC.OPS.openRisk && d.m && d.m.tail) hurt(S, ap, d.m.tail, open, `${d.m.who || 'an aircraft'} ran over the debris left on ${rw.name}: a tyre cut and an engine dented`, 8 * 3600, 'a cut tyre and a dented engine'); return; }
  // worn pavement sheds bits, patched craters more; heavy aircraft shed more than light ones
  const wear = rw.wear || 0, patch = (rw.craters || []).filter(c => c.patched).length;
  const p = IC.OPS.debris * (1 + 3 * wear) * (1 + 0.5 * Math.min(4, patch)) * (T.stand === 'l' ? 1.5 : T.stand === 's' || !T.seats ? 0.4 : 1);
  if (!forced('debris') && Math.random() >= p) return;
  const [w, what] = U.pick(DEBRIS_WHAT);
  debris(S, ap, rw, Math.random(), 'debris', `${w} on ${rw.name}`, `${what}${wear > 0.4 ? `, from pavement ${U.pct(wear)} worn` : patch ? ', near a patched crater' : ''}`,
    wear > 0.4 ? 'Resurfacing the runway (Works) leaves less to break loose.' : 'An airside operations base near the runway sweeps it faster.');
});
/* a bird strike the crew survived: what is left of the birds must come off the runway, and the aircraft is checked */
IC.opsBird = function (S, ap, m, what, c) {
  if (!on() || !ours(ap) || !m.plan || !m.plan.rw) return false;
  const rw = m.plan.rw, t = what === 'arr' ? 0.3 : 0.25;
  const inc = debris(S, ap, rw, m.plan.dir > 0 ? t : 1 - t, 'bird', `${m.who || 'an aircraft'} hit birds ${what === 'arr' ? 'landing' : 'taking off'} on ${rw.name}`, c.text, 'Airports away from lakes and rivers see far fewer birds; a bird-control team keeps most away.');
  if (inc && m.tail) hurt(S, ap, m.tail, inc, `${m.who || 'the aircraft'} is checked for damage after the bird strike`, 3 * 3600, 'checked for damage after a bird strike');
  return !!inc;
};
/* the player's call on a report: 'close' (sweep now) or 'open' (keep flying, sweep at the next inspection) */
IC.opsDecide = function (S, ap, id, choice) {
  const inc = ops(ap).list.find(x => x.id === id && !x.done); if (!inc) return false;
  const st = IC.opsStage(inc);
  if (st.k !== 'ask' && st.k !== 'open') return false;
  if (choice === 'open' && st.k === 'ask') {
    inc.stages.splice(inc.si, 1, { k: 'open', dur: IC.OPS.openMax }); inc.t = 0; inc.kept = true;
    IC.log(S, 'warn', 'RUNWAY', `${ap.name}: ${rwOf(ap, inc.rw).name} stays open with debris on it. Each movement risks a cut tyre or a damaged engine; it is swept at the next inspection.`, inc);
  } else if (choice === 'close') {
    inc.stages.splice(inc.si, 1); inc.t = 0; inc.shut = 'rw'; close(S, ap, inc, true);
    IC.log(S, 'info', 'RUNWAY', `${ap.name}: ${rwOf(ap, inc.rw).name} closed to be swept. Arrivals hold${(ap.st && ap.st.rwy || []).length > 1 ? ' or use the other runway' : ''}.`, inc);
  } else return false;
  inc.dur = inc.stages.reduce((a, s) => a + s.dur, 0);
  inc.answered = choice;
  refreshPill(S, ap, inc);
  return true;
};
/* every crew and machine there is: what is left of a clean-up stage halves */
IC.opsRush = function (S, ap, id) {
  const inc = ops(ap).list.find(x => x.id === id && !x.done); if (!inc || inc.rushed) return false;
  const st = IC.opsStage(inc);
  if (!['sweep', 'clean', 'recover', 'check', 'foam', 'burn', 'disembark'].includes(st.k) || S.budget < IC.OPS.rushCost) return false;
  IC.pay(S, 'repair', IC.OPS.rushCost);
  const left = st.dur - inc.t; st.dur = inc.t + left / 2; inc.dur -= left / 2; inc.rushed = true;
  IC.log(S, 'info', 'AIRPORT', `${ap.name}: every crew on the ${U.lc(IC.OPS_INC[inc.kind].name)}: ${U.lc(STG[st.k])} done in ${U.dur(left / 2)} instead of ${U.dur(left)}.`, inc);
  refreshPill(S, ap, inc);
  return true;
};
IC.opsRushOk = inc => !inc.rushed && ['sweep', 'clean', 'recover', 'check', 'foam', 'burn', 'disembark'].includes(IC.opsStage(inc).k);
function refreshPill(S, ap, inc) {
  const it = S.inc && S.inc.list.find(x => x.id === inc.pill);
  // (the alarm only while lives may be at stake: the fire trucks on their way)
  if (it) { it.text = pillText(S, ap, inc); if (it.level === 'alarm' && IC.opsStage(inc).k !== 'fire') it.level = 'warn'; if (inc.done) it.done = true; }
}

/* an arrival's excursion: ground ops asks once the landing is decided (groundops.js risky); the aircraft is held
   in the grass beside the runway (phase 'off') until it is lifted back, then taxis in */
IC.opsExcursionRoll = function (S, ap, m, r) {
  if (!on() || !ours(ap) || m.mil || !m.tail || m.crash || m.excur) return 0;
  let p = 0, c = null, took = 0;
  for (const x of r.why) if (x.cause === 'gust' || x.cause === 'tailwind' || x.cause === 'overrun') {
    const q = x.p * (x.cause === 'overrun' ? IC.OPS.overrunExc : IC.OPS.excursion);
    if (x.cause === 'overrun') took += q;
    p += q; if (!c || q > c.q) c = Object.assign({ q }, x);
  }
  const sky = IC.sky(S);
  if (sky.wet) { p += IC.OPS.wetExc; if (!c) c = { cause: 'wet', text: 'a wet runway: the aircraft aquaplaned as it slowed' }; }
  if (IC.OPS.force === 'excursion' && !c) c = { cause: 'gust', text: 'a gust across the runway beyond what the crew may land in' };
  if (!c || (!forced('excursion') && Math.random() >= p)) return took;
  m.excur = c;
  return took;
};
const EXC_FIX = { gust: 'A runway pointing into the wind (a crosswind runway) keeps crews inside their limits.', tailwind: 'A runway pointing into the wind avoids the tailwind.', overrun: 'A longer runway leaves a margin when it is wet.', wet: 'Grooved, well-kept pavement drains faster: resurface a worn runway.' };
IC.opsExcursion = function (S, ap, m) {
  const c = m.excur, rw = m.plan.rw, d = IC.rwDir(rw), side = Math.random() < 0.5 ? 1 : -1, off = (rw.w || 0.45) / 2 + 0.35 + Math.random() * 0.25;
  // off the side, at an angle, in the grass
  m.offAt = { x: m.x, y: m.y, h: m.h };
  m.x += -d.y * side * off; m.y += d.x * side * off; m.h += side * U.rand(0.35, 0.7);
  m.phase = 'off'; m.holding = 'off'; m.holdWhy = 'off the runway';
  const fire = IC.aptRescue ? IC.aptRescue(ap, m) : 600, go = IC.opsTime(ap, m);
  if (IC.fireRun) IC.fireRun(S, ap, m, 'call');
  const T = m.T, heavy = T.stand === 'l';
  const inc = start(S, ap, { kind: 'excursion', x: m.x, y: m.y, rw: rw.id, mv: m.id, tail: m.tail.id, shut: 'rw', from: go.from && go.from.id,
    what: `${m.who || 'an arrival'} ran off ${rw.name} into the grass`, cause: c.text, fix: EXC_FIX[c.cause] || '', cost: heavy ? 4 : 2,
    stages: [['fire', fire >= 1e8 ? 900 : fire], ['disembark', T.seats ? 600 + T.seats * 2 : 300], ['recover', Math.max(go.t, 300) + (go.from ? 1500 : 4200) * (heavy ? 1.4 : 1)], ['tow', 240], ['inspect', go.from ? 300 : 600]] });
  hurt(S, ap, m.tail.id, inc, `${m.who || 'the aircraft'} is inspected after running off the runway`, 6 * 3600, 'inspected after the runway excursion');
  return inc;
};

/* ---------- the stands: a fuel spill, a wingtip scraped at pushback ---------- */
IC.on((S, type, d) => {
  if (type !== 'tailParked' || !on() || !ours(d.ap)) return;
  const tl = d.tl, ap = d.ap, s = standOf(ap, tl.stand);
  if (!s || !s.svc || s.svc.fuel !== 'truck' || tl.T.mil || !tl.T.seats && !tl.T.cargo) return;
  // trucks short (the airport's own fleet below what it needs): crews hurry, hoses get dropped
  const need = IC.gseNeed ? IC.gseNeed(S, ap).fuel : 0, have = ap.fleet ? ap.fleet.fuel : need, short = need && have < need;
  const p = IC.OPS.spill * (short ? 2.5 : 1);
  if (!forced('spill') && Math.random() >= p) return;
  // it happens while the truck is at work, a third of the way through the turnaround
  (ops(ap).due = ops(ap).due || []).push({ t: S.time + (s.svc.dur || 1800) * U.rand(0.3, 0.5), stand: s.id, tail: tl.id, short });
});
function spill(S, ap, q) {
  const s = standOf(ap, q.stand), tl = tailOf(S, q.tail);
  if (!s || !tl || tl.where !== 'stand' || tl.stand !== s.id) return;
  const fire = IC.aptRescue ? IC.aptRescue(ap, s) : 1e9, go = IC.opsTime(ap, s), late = fire >= 1e8 ? 900 : fire;
  // fuel on a hot apron: the slower the fire crew, the likelier it catches
  const burns = Math.random() < U.clamp((late - 240) / 600, 0, 0.6);
  const stages = [['fire', late], ['foam', 360]];
  if (burns) stages.push(['burn', 1500]);
  stages.push(['clean', (go.from ? 900 : 2400) + Math.max(0, go.t - 60)]);
  if (IC.fireRun) IC.fireRun(S, ap, s, 'call');
  const inc = start(S, ap, { kind: 'spill', x: s.x, y: s.y, stand: s.id, tail: tl.id, shut: 'stand', from: go.from && go.from.id, cost: burns ? 6 : 1, stages,
    what: `fuel spilled under ${tl.cs} on stand ${IC.standName(s)}${burns ? ', and it caught fire' : ''}`,
    cause: q.short ? 'a fuel truck crew in a hurry: the airport has fewer fuel trucks than its stands need' : 'a hose coupling gave way during refuelling',
    fix: `${q.short ? 'More fuel trucks (Ground vehicles) take the hurry out. ' : ''}A hydrant system takes the trucks off the apron${fire > 300 ? '; a fire station nearer the stands brings the trucks sooner' : ''}.` });
  inc.burns = burns;
  if (burns) { IC.addFire(S, s.x, s.y, 0.5, 1500); hurt(S, ap, tl.id, inc, `${tl.cs} was damaged by the fire on stand ${IC.standName(s)}`, 30 * 3600, 'repairs after the fire'); }
  else hurt(S, ap, tl.id, inc, `${tl.cs} waits on stand ${IC.standName(s)} while the spill is cleaned up`, IC.opsLeft(S, inc), 'the fuel spill under it is cleaned up');
}
/* a pushback: the tug driver clips the neighbour's wingtip. Called by ground ops as the push starts */
IC.opsPush = function (S, ap, m) {
  if (!on() || !ours(ap) || m.mil || !m.stand || !m.T || !S.av) return;
  const a = ap.parts.find(p => p.id === m.stand.apron), i = a && a.stands ? a.stands.findIndex(s => s.id === m.stand.id) : -1; if (i < 0) return;
  const nb = [a.stands[i - 1], a.stands[i + 1]].filter(s => s && s.occ);
  if (!nb.length) return;
  const s = U.pick(nb), tl = tailOf(S, s.occ); if (!tl || tl.where !== 'stand' || tl.T.mil) return;
  // the gap between the wingtips: stands laid out for the size leave 7.5 m and more
  const gap = U.dist(s, m.stand) - ((m.T.span || 0.3) + (tl.T.span || 0.3)) / 2;
  const need = IC.gseNeed ? IC.gseNeed(S, ap).tug : 0, short = need && ap.fleet && ap.fleet.tug < need;
  const dark = IC.opsDark ? IC.opsDark(S) : false;
  const p = IC.OPS.scrape * (gap < 0.075 ? 4 : 1) * (short ? 2.5 : 1) * (dark ? 1.5 : 1);
  if (!forced('scrape') && Math.random() >= p) return;
  const why = gap < 0.075 ? `stands ${IC.standName(m.stand)} and ${IC.standName(s)} leave only ${Math.max(0, Math.round(gap * 100))} m between the wingtips` : short ? 'a tug crew rushing between pushbacks: the airport has fewer tugs than it needs' : dark ? 'a pushback in the dark' : 'a misjudged turn on the pushback';
  const at = { x: (s.x + m.stand.x) / 2, y: (s.y + m.stand.y) / 2 }, chk = (tl.T.stand === 'l' ? 2.5 : 1.5) * 3600;
  const inc = start(S, ap, { kind: 'scrape', x: at.x, y: at.y, stand: s.id, tail: tl.id, cost: 1.5,
    what: `${m.who || 'a departure'} clipped ${tl.cs}'s wingtip pushing back from stand ${IC.standName(m.stand)}`, cause: why,
    fix: gap < 0.075 ? 'Lay the stands out for the aircraft that use them (the apron\'s stand layout), so the wingtips clear.' : short ? 'More tugs (Ground vehicles).' : 'Floodlit aprons help at night.',
    stages: [['check', chk]] });
  hurt(S, ap, tl.id, inc, `${tl.cs} is grounded on stand ${IC.standName(s)} while engineers check the wing`, chk, 'engineers check the scraped wing');
};

/* ---------- the aircraft hurt: held where it is, the airline unhappy ---------- */
function hurt(S, ap, tlId, inc, why, sec, short) {
  const tl = tailOf(S, tlId); if (!tl) return;
  tl.dmg = { why, short: short || why, until: S.time + sec, inc: inc.id };
  if (tl.where === 'stand') tl.t = Math.max(tl.t, sec);
  else tl.dmgHold = sec;
  const al = IC.avAirline && IC.avAirline(S, tl.al);
  if (al) { al.sat = U.clamp(al.sat - 2.5, 0, 100); al.lastWhy = `an aircraft damaged at ${ap.name}`; }
  ap.sat = U.clamp((ap.sat == null ? 70 : ap.sat) - 2, 0, 100);
}
// an aircraft hurt on the runway is held when it reaches its stand
IC.on((S, type, d) => {
  if (type !== 'tailParked' || !d.tl.dmgHold) return;
  d.tl.t = Math.max(d.tl.t, d.tl.dmgHold); d.tl.dmg.until = S.time + d.tl.dmgHold; d.tl.dmgHold = 0;
});

/* ---------- each step: the stages run, closures end, reports are written ---------- */
IC.opsTick = function (S, dt) {
  if (!on()) return;
  for (const ap of IC.bases(S)) {
    const O = ap.incs; if (!O) continue;
    if (O.due && O.due.length) { const now = O.due.filter(q => S.time >= q.t); if (now.length) { O.due = O.due.filter(q => S.time < q.t); for (const q of now) spill(S, ap, q); } }
    for (const inc of O.list) if (!inc.done) stepInc(S, ap, inc, dt);
    if (O.list.some(x => x.done && S.time - x.end > 1800)) O.list = O.list.filter(x => !x.done || S.time - x.end <= 1800);
  }
};
function stepInc(S, ap, inc, dt) {
  const st = inc.stages[inc.si];
  // an aircraft gone (destroyed, crashed in a raid) takes what waits on it with it
  if (inc.mv && !ap.moves.some(m => m.id === inc.mv && !m.dead) && ['fire', 'disembark', 'recover', 'tow'].includes(st.k)) { inc.mv = null; }
  inc.t += dt;
  if (st.k === 'ask' && inc.t >= st.dur) { IC.log(S, 'info', 'RUNWAY', `${ap.name}: no word from you, so the tower closed ${(rwOf(ap, inc.rw) || {}).name || 'the runway'} to sweep it.`, inc); IC.opsDecide(S, ap, inc.id, 'close'); return; }
  // kept open: the routine inspection sweeps it at night, or when its time is up
  if (st.k === 'open' && (inc.t >= st.dur || IC.opsDark && IC.opsDark(S) && inc.t > 1800)) { inc.stages.splice(inc.si, 1); inc.t = 0; inc.shut = 'rw'; inc.dur = inc.stages.reduce((a, s) => a + s.dur, 0); close(S, ap, inc, true); refreshPill(S, ap, inc); return; }
  if (inc.t < st.dur) { if ((inc._pt = (inc._pt || 0) - dt) <= 0) { inc._pt = 30; refreshPill(S, ap, inc); } return; }
  // the stage is done
  if (st.k === 'tow' && inc.mv) { const m = ap.moves.find(x => x.id === inc.mv); if (m && m.phase === 'off' && IC.gopsBackOn) IC.gopsBackOn(S, ap, m); }
  inc.si++; inc.t = 0;
  if (inc.si < inc.stages.length) { refreshPill(S, ap, inc); return; }
  finish(S, ap, inc);
}
function finish(S, ap, inc) {
  inc.done = true; inc.end = S.time;
  close(S, ap, inc, false);
  const K = IC.OPS_INC[inc.kind], took = S.time - inc.t0;
  const back = inc.shut === 'rw' ? `${(rwOf(ap, inc.rw) || {}).name || 'The runway'} is open again` : inc.shut === 'stand' ? `Stand ${(standOf(ap, inc.stand) && IC.standName(standOf(ap, inc.stand))) || ''} is open again` : 'Done';
  const rep = `${back} after ${U.dur(took)}.${inc.kept ? ` It stayed open with debris on it for ${inc.over || 0} movement${inc.over === 1 ? '' : 's'}.` : ''}`;
  (ops(ap).log = ops(ap).log || []).unshift({ kind: inc.kind, t0: inc.t0, took, what: inc.what, cause: inc.cause, fix: inc.fix, kept: !!inc.kept, rushed: inc.rushed });
  if (ops(ap).log.length > 12) ops(ap).log.length = 12;
  IC.log(S, 'info', K.tag, `${ap.name}: ${rep} ${inc.fix}`, { x: inc.x, y: inc.y });
  refreshPill(S, ap, inc);
  // the bad ones get a report card in the Career, with the cause and the fix
  if ((inc.kind === 'excursion' || inc.burns) && S.camp) IC.card(S, `${K.name}: report`, `${ap.name} · ${U.clock(S.time, S)}`, `${inc.what.charAt(0).toUpperCase() + inc.what.slice(1)}. Nobody was hurt. The cause: ${inc.cause}. ${rep} ${inc.fix}`, 'alarm');
  IC.emit(S, 'aptIncidentEnd', { ap, inc });
}

/* ---------- the first aircraft to use what the player built: words over it, a line in the Journal ---------- */
function firstUse(S, ap, at, text) {
  IC.text(S, at.x, at.y, text.toUpperCase(), '#ffd98a', 7);
  IC.log(S, 'info', 'AIRPORT', `${ap.name}: ${text}.`, at);
  IC.sfx && IC.sfx.ui && IC.sfx.ui('ok');
  IC.emit(S, 'firstUse', { ap, text });
}
IC.on((S, type, d) => {
  if (type === 'rwMove' && ours(d.ap) && d.rw && d.rw.newT && !d.rw.used && d.m && !d.m.mil) {
    d.rw.used = S.time;
    firstUse(S, d.ap, IC.rwAt(d.rw, 0.5), `the first ${d.k === 'arr' ? 'landing on' : 'take-off from'} ${d.rw.name}: ${d.m.who || 'an aircraft'}`);
  }
  if (type === 'tailParked' && ours(d.ap)) {
    const s = standOf(d.ap, d.tl.stand), a = s && d.ap.parts.find(p => p.id === s.apron);
    if (s && a && a.newT && !a.used) { a.used = S.time; firstUse(S, d.ap, s, `the first aircraft on the new apron: ${d.tl.cs} at stand ${IC.standName(s)}`); }
  }
});

/* (for the tests: a report of debris on a runway, a spill under a parked aircraft) */
IC.opsDebris = (S, ap, rw) => debris(S, ap, rw, 0.4, 'debris', `a crew reports debris on ${rw.name}`, 'part of a tyre tread', '');
IC.opsSpill = (S, ap, s, tl) => spill(S, ap, { stand: s.id, tail: tl.id, short: false });

/* ---------- for the panel and the map ---------- */
/* what is going on now: incidents, then runway queues and the stands' turnarounds */
IC.opsNow = function (S, ap) {
  const out = { inc: [], rw: [], turns: [], free: 0, stands: 0 };
  for (const inc of (ap.incs && ap.incs.list) || []) if (!inc.done) out.inc.push(inc);
  for (const rw of ap.parts.filter(p => p.kind === 'runway' && p.built)) {
    const k = keyOf(ap, rw.id), dep = ap.moves.filter(m => !m.dead && m.kind === 'dep' && m.plan && m.plan.rw === rw && (m.phase === 'hold' || m.holding === 'queue' || m.holding === 'runway')).length;
    const arr = S.threats.filter(t => !t.dead && t.toApt === ap.id && t.holding && t.faf && t.faf.rwId === rw.id).length;
    out.rw.push({ rw, dep, arr, shut: IC.opsShutWhy(S, ap, k), works: !!rw.shut });
  }
  // (the airliners' stands: light aircraft have their own ramps, military theirs)
  const L = IC.aptStands(ap).filter(s => s.linked !== false && (s.zone || 'civil') !== 'mil' && s.zone !== 'light');
  out.stands = L.length; out.free = L.filter(s => !s.occ && !s.shut).length;
  if (S.av) for (const s of L) {
    if (!s.occ) continue;
    const tl = tailOf(S, s.occ); if (!tl || tl.where !== 'stand') continue;
    const sv = s.svc, f = sv && sv.tail === tl.id ? U.clamp((S.time - sv.t0) / Math.max(60, sv.dur), 0, 1) : 0;
    const held = tl.dmg && S.time < tl.dmg.until ? 'grounded' : tl.t <= 0 ? (tl.held ? 'held' : 'ready') : tl.held && S.time - tl.held.t0 > 60 ? 'held' : '';
    out.turns.push({ s, tl, f: tl.t <= 0 ? 1 : f, left: Math.max(0, tl.t), held, why: held === 'grounded' ? tl.dmg.why : tl.held ? tl.held.why : '' });
  }
  out.turns.sort((a, b) => (b.held ? 1 : 0) - (a.held ? 1 : 0) || a.left - b.left);
  return out;
};
/* the last few, for the panel */
IC.opsRecent = (ap, n) => ((ap.incs && ap.incs.log) || []).slice(0, n || 4);

})(window.IC);
