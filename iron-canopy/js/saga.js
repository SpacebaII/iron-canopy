/* Iron Canopy — the Career's story, v3 (Preston's personal story and four years of war), headless.

   The Career runs as a list of chapters (IC.SAGA, saga-data.js) on the war's own calendar: month 0 is the airport
   strike (st.v3.T0), the three chapters before it are the days leading up to it, and the war runs some 48 months
   after it (IC.sagaMonth). A chapter comes when its month has come and the one before it is finished:
   - its scene plays first: a comic page (IC.CUTSCENES['v3:<id>'], the viewer in render-cutscene.js), panels with
     narration (cap), lines spoken (say: [cast key, words], or says: a list of them), `if` to play a panel only on a
     route (IC.sagaIf: 'gift=dish', 'W03=success|partial', '!tomas'), and `ask` for a small choice inside the scene
     ({ k, q, opts: [{ v, t }] }: the pick is a story flag, IC.flag);
   - then its operation, if it has one (op): tasks the game itself measures (IC.SAGA_TASKS: a service kept flying,
     stands kept free, a site covered, a road open, a part built), a raid from the war plan at its place (the plan's
     wave waits on the flag 'raid:<id>', set when the operation starts), and a window in months. When the window
     closes, or every task is done and the raid is over, the result is read from what happened: success, partial
     or failure, kept as the flag <id> (and in st.v3.res), never decided by the story;
   - then the scene after it (after: panels, each with `if` on the result), and its effects (fx: the war opening,
     the authority ladder's stage, flags).
   The authority ladder (v3.1): 1 the tower, 2 the civil desk (C08), 3 the board (X1), 4 the standing order (X1's
   last scene), 5 Sector Four (X2), 6 the chair (C21), 7 restricted (C24), 8 back by route (C27), 9 the handover
   (R04). IC.sagaLock says what each stage has not reached yet; story.js asks it for rooms, units, layers and levers.
   Nothing here is a closure: the state is plain data, and a save reloads it as it is. */
(function (IC) {
'use strict';
const U = IC.U, H = 3600;

IC.SAGA = IC.SAGA || [];
IC.CAREER_STORY = 'v3';   // the start screen's Career (main.js); the classic story stays for old saves and its tests
const on = S => !!(S && S.story && S.story.v3);
IC.sagaOn = on;
const V = S => S.story.v3;
const chap = id => IC.SAGA.find(c => c.id === id);
IC.sagaChapter = chap;
IC.sagaMonth = S => (S.time - V(S).T0) / IC.MO(S, 1);
IC.sagaTimeOf = (S, m) => V(S).T0 + IC.MO(S, m);

/* ---------- places: the story's sites, resolved to something real in this game ----------
   place: a story place on the drawn map (IC.placeOf); infra: an airport, base or plant by id or name; city: a town;
   near: a new site the story adds beside something that exists (dx, dy in world units, 100 m each) */
IC.SAGA_SITES = {
  ashford_airport: { infra: 'ap_cap', name: 'Ashford International' },
  corbin_airport: { infra: 'ap_corbin', name: 'Corbin Airport' },
  westhaven_airport: { infra: 'ap_west', name: 'Westhaven Airport' },
  fort_ashby: { infra: 'ab_fwd', name: 'Fort Ashby Air Base' },
  selby: { infra: 'ab_rear', name: 'Selby Air Base' },
  corbin_works: { infra: 'Corbin Motor Works' },
  kessock_power: { infra: 'Kessock Power Station' },
  ashford_power: { infra: 'Ashford Power Station' },
  westhaven_port: { place: 'port', name: 'Westhaven harbour' },
  southport: { place: 'southport', name: 'Southport harbour' },
  tarn_viaduct: { place: 'pass_bridge', name: 'the Tarn Pass viaduct' },
  tarn_pass: { place: 'tarn_pass', name: 'Tarn Pass' },
  hollin: { place: 'hollin', name: 'Hollin' },
  area_centre: { place: 'area_centre', name: 'the Northern Area Centre' },
  station9: { place: 'station9', name: 'Station 9' },
  weir: { place: 'home', name: 'Weir' },
  east_bank: { near: 'city:Ashford', dx: 34, dy: 8, name: 'East Bank Hospital' },
  lowen_junction: { near: 'city:Ashford', dx: -46, dy: 30, name: 'Lowen Junction' },
  civil_annex: { near: 'city:Ashford', dx: 6, dy: -4, name: 'the civil aviation annex' },
  arden_yard: { near: 'infra:Corbin Motor Works', dx: 14, dy: 10, name: 'the Arden service yard' },
  westhaven_reception: { near: 'place:port', dx: -10, dy: -14, name: 'the Westhaven reception hall' },
  ironbridge_works: { infra: 'Ironbridge Munitions' },
  ironbridge_power: { infra: 'Ironbridge Power Station' },
  arms_works: { place: 'arms', name: 'Fort Ashby Arms Works' },
  dalby_hydro: { place: 'dam', name: 'Dalby Hydro Dam' },
  elk_pass: { place: 'elk_pass', name: 'Elk Pass' },
  ostrand: { near: 'city:Ostrand', dx: 0, dy: 0, name: 'Ostrand' }
};
// the package's own names for the same places
Object.assign(IC.SAGA_SITES, { fort_ashby_base: IC.SAGA_SITES.fort_ashby, selby_base: IC.SAGA_SITES.selby, southport_port: IC.SAGA_SITES.southport, capital_annex: IC.SAGA_SITES.civil_annex, station_nine: IC.SAGA_SITES.station9 });
function resolveRef(S, spec) {
  const i = spec.indexOf(':'), k = spec.slice(0, i), v = spec.slice(i + 1);
  if (k === 'city') return IC.cities(S).find(c => c.name === v) || IC.cap(S);
  if (k === 'infra') return S.byId[v] || S.infra.find(x => x.name === v) || null;
  if (k === 'place') { const p = IC.placeOf(S, v); return p ? (p._ref && p._ref.x != null && !p._ref.abroad ? p._ref : p) : null; }
  return null;
}
/* { x, y, name, ref } for a site id, or null when this game has nothing there */
IC.sagaSite = function (S, id) {
  const d = IC.SAGA_SITES[id]; if (!d) return null;
  if (d.infra) { const r = resolveRef(S, 'infra:' + d.infra); return r ? { x: r.x, y: r.y, name: d.name || r.name, ref: r, id } : null; }
  if (d.place) { const p = IC.placeOf(S, d.place); if (!p) return null; const r = p._ref && p._ref.x != null && !p._ref.abroad ? p._ref : null; return { x: p.x, y: p.y, name: d.name || p.name, ref: r, id }; }
  if (d.near) { const r = resolveRef(S, d.near); return r ? { x: r.x + d.dx, y: r.y + d.dy, name: d.name, ref: null, id } : null; }
  return null;
};

/* ---------- flags and conditions ---------- */
const flagOf = (S, k) => S.story.flags ? S.story.flags.get(k) : undefined;
IC.sagaFlag = flagOf;
/* 'a=x|y & !b & c!=z | d': every part between the &s must hold. x|y (no spaces) are values of one test; ' | '
   (with spaces) is between whole tests, any one of which will do */
const test1 = (S, t) => {
  const neg = t[0] === '!' && t[1] !== '='; if (neg) t = t.slice(1);
  const m = /^([\w.:-]+)\s*(!?=)\s*(.*)$/.exec(t);
  let ok;
  if (m) { const v = String(flagOf(S, m[1])), L = m[3].split('|'); ok = m[2] === '=' ? L.includes(v) : !L.includes(v); }
  else { const v = flagOf(S, t); ok = v != null && v !== false; }
  return neg ? !ok : ok;
};
IC.sagaIf = function (S, c) {
  if (!c) return true;
  return c.split('&').every(part => {
    const tests = part.split(/\s+\|\s+/).map(t => t.trim()).filter(Boolean);
    return !tests.length || tests.some(t => test1(S, t));
  });
};
/* a choice made in a scene; the first one stands */
IC.sagaPick = function (S, k, v) {
  if (!on(S) || flagOf(S, k) != null) return false;
  IC.flag(S, k, v);
  const X = V(S); X.picks.push({ k, v, t: S.time });
  return true;
};
/* what a headless player picks: its own list (tests set st.v3.auto = { gift: 'book' }), else the first */
const autoPick = (S, a) => { const A = V(S).auto || {}; return A[a.k] != null && a.opts.some(o => o.v === A[a.k]) ? A[a.k] : a.opts[0].v; };

/* ---------- scenes ---------- */
const sceneId = (c, part) => `v3:${c.id}${part ? ':' + part : ''}`;
/* every chapter's scene and after-scene is a cutscene the viewer and the Journal know */
IC.sagaRegister = function () {
  // the chapters in story order (stable: chapters in the same month keep the order they were written in)
  IC.SAGA.sort((a, b) => a.m - b.m);
  // each panel's storyboard words (shown until its painting is in art/cut), and where its picture comes from
  const shot = L => { for (const p of L || []) { if (!p.shot && p.art) p.shot = (IC.SAGA_SHOTS || {})[p.art] || p.cap || ''; p.src = p.src || 'ai'; } };
  for (const c of IC.SAGA) {
    shot(c.p); shot(c.after);
    if (c.p && c.p.length) IC.CUTSCENES[sceneId(c)] = { title: c.t, v3: true, panels: c.p };
    if (c.after && c.after.length) IC.CUTSCENES[sceneId(c, 'after')] = { title: c.t, v3: true, panels: c.after };
  }
};
/* the viewer is done with one: the choices it did not see made by default (a skipped scene, a headless run) */
IC.sagaSeen = function (S, c) {
  if (!on(S) || !c.id.startsWith('v3:')) return;
  const C = IC.CUTSCENES[c.id]; if (!C) return;
  for (const p of C.panels) if (p.ask && IC.sagaIf(S, p.if) && flagOf(S, p.ask.k) == null) IC.sagaPick(S, p.ask.k, autoPick(S, p.ask));
};
const seen = (S, id) => (S.story.cuts || []).some(c => c.id === id);
const queued = (S, id) => (S.story.cutQ || []).some(c => c.id === id);

/* ---------- start ---------- */
IC.SAGA_START_MO = 0.4;   // the game opens twelve days before the strike
IC.sagaInit = function (S) {
  const st = S.story;
  st.v3 = { ver: 1, T0: S.time + IC.MO(S, IC.SAGA_START_MO), i: -1, ph: 'wait', stage: 1, res: {}, op: null, picks: [], log: [], dueT: 0, tickT: 0 };
  st.act = 1; st.role = 'Air traffic controller, Ashford';
  st.grant = st.grant0 = 0.5;
  st.goals = []; st.beats = []; st.tut = false;
  S.camp.chapter = 'Ashford, twelve days before'; S.camp.cards = [];
  // the old story's machinery stays off: the desk, the agenda and the chains run the classic Career only
  st.noDesk = true;
  IC.sagaRegister();
  // the enemy flies the story's plan: each operation's raid waits for its chapter
  if (IC.warPlanInit) IC.warPlanInit(S, IC.sagaPlan(S));
  if (S.wp) S.wp.on = true;
  IC.log(S, 'info', 'STORY', 'Ashford, twelve days before the strike.');
};

/* the chapter that comes next, and whether it may start now */
const nextOf = S => IC.SAGA[V(S).i + 1] || null;
function due(S, c) {
  const X = V(S);
  if (!c) return false;
  if (S.time < IC.sagaTimeOf(S, c.m)) return false;
  if (c.need && !IC.sagaIf(S, c.need)) return false;
  // nothing starts in the middle of a raid
  return !(S.enemy && S.enemy.raid && S.enemy.war);
}
IC.sagaDue = S => on(S) && V(S).ph === 'wait' && due(S, nextOf(S));
/* the chapter starts: its scene, or straight into its operation */
function begin(S, c) {
  const X = V(S);
  X.i = IC.SAGA.indexOf(c); X.ph = 'scene'; X.cT = S.time;
  S.camp.chapter = c.t;
  X.log.push({ id: c.id, t: S.time, m: Math.round(IC.sagaMonth(S) * 10) / 10 });
  if (c.pre) fx(S, c, c.pre);
  IC.log(S, 'info', 'STORY', `${label(S, c)}: ${c.t}.`);
  IC.emit(S, 'sagaChapter', { c });
  // a chapter whose scene is the raid itself plays it at the raid's warning (sagaPlan gives the wave its cut)
  if (c.sceneAt === 'warn' || !(c.p && c.p.length) || !IC.cutscene(S, sceneId(c), {})) sceneDone(S, c);
}
function sceneDone(S, c) {
  const X = V(S);
  if (c.op) return opStart(S, c);
  finish(S, c);
}
function finish(S, c) {
  const X = V(S);
  if (c.fx) fx(S, c, c.fx);
  if (c.after && c.after.length && IC.cutscene(S, sceneId(c, 'after'), {})) { X.ph = 'after'; return; }
  X.ph = 'wait';
  IC.emit(S, 'sagaDone', { c });
}

/* ---------- effects, by name ---------- */
const FX = {
  // the strike: the war begins, by the story's plan
  war: S => {
    const E = S.enemy;
    E.allow = null;
    for (const s of S.esites) if (s.nat === 'A') s.dormant = false;
    S.mobil = Math.max(S.mobil, 1);
    if (!E.war) IC.enemyOpening(S, {});
    S.story.act = 4;
  },
  // the morning after: the armed forces' own defence, run by the military until the cell exists
  forces: S => {
    if (IC.startingForces && !S.story.v3.forces) { S.story.v3.forces = true; IC.startingForces(S, false); }
    S.ad.roe = 'free';
    for (const b of S.infra.filter(i => i.kind === 'airbase')) b.locked = false;
  },
  // (C03) what the last days add up to: the evening kept and her plans heard, one of them, or neither
  depart: S => {
    if (flagOf(S, 'depart') != null) return;
    const kept = IC.sagaIf(S, 'follow=kept|resched'), heard = IC.sagaIf(S, 'listen=heard|repaired');
    IC.flag(S, 'depart', kept && heard ? 'repair' : kept || heard ? 'space' : 'decided');
  },
  ceasefire: S => {
    const E = S.enemy;
    if (S.wp) S.wp.on = false;
    E.war = false; E.raid = null; E.ceaseT = S.time;
    S.ad.roe = 'hold';
    S.story.peace = true;
  }
};
IC.SAGA_FX = FX;
function fx(S, c, L) {
  for (const e of [].concat(L)) {
    // { if, fx }: effects on one route only
    if (e && typeof e === 'object') { if (IC.sagaIf(S, e.if)) fx(S, c, e.fx); continue; }
    if (typeof e === 'string' && FX[e]) FX[e](S, c);
    else if (typeof e === 'string' && e.startsWith('stage:')) stage(S, +e.slice(6));
    else if (typeof e === 'string' && e.startsWith('unit:')) { const [t, at] = e.slice(5).split('@'); placeUnit(S, t, at); }
    else if (typeof e === 'string' && e.includes('=')) { const [k, v] = e.split('='); IC.flag(S, k, v); }
    else if (typeof e === 'string') IC.flag(S, e, true);
  }
}

/* ---------- the authority ladder ---------- */
IC.SAGA_STAGES = {
  1: { role: 'Air traffic controller, Ashford', name: 'Ivo Marsh', grant: 0.5 },
  2: { role: 'Civil liaison, emergency civil office', name: 'Lena Okafor', grant: 6, say: ['APT', 'Lena Okafor. The appointment is temporary and it has a review date. Until then the airports, the airspace, the civil diversions and the money are yours to run from this desk. The weapons are not.'] },
  3: { role: 'Civil seat, Joint Air Picture Cell', name: 'Gen. Voss', grant: 40, say: ['CDS', 'The board is yours to read. Radars, batteries and where they go: ask me and I sign. Weapons stay on my side of the room.'] },
  4: { role: 'Civil seat, Joint Air Picture Cell', name: 'Gen. Voss', grant: 40, say: ['CDS', 'If this cell says Free, I say Free. If I disagree, you will hear it from me, and you will hear why.'] },
  5: { role: 'Civil seat, Joint Air Picture Cell', name: 'Gen. Voss, Col. Reyes', grant: 45, say: ['CDS', 'Counter-strikes are the cell’s to recommend now. Bring me both sides of it. I decide.'] },
  6: { role: 'Civil chair, Joint Air Picture Cell', name: 'Lena Okafor, Gen. Voss', grant: 50 },
  7: { role: 'Suspended pending review', name: 'L. Okafor', grant: 50, say: ['APT', 'Until the review, every recommendation goes out under my name. Keep working. I’ll read what you send me.'] },
  8: { role: 'Civil chair, Joint Air Picture Cell', name: 'by route', grant: 50 },
  9: { role: 'Handing over', name: 'the receiving team', grant: 30 }
};
function stage(S, n) {
  const X = V(S), st = S.story, G = IC.SAGA_STAGES[n]; if (!G || X.stage === n) return;
  X.stage = n; st.role = G.role; st.grant = st.grant0 = G.grant;
  if (n >= 3) S.layers.intel = true;
  if (G.say) IC.say(S, G.say[0], G.say[1]);
  IC.log(S, 'info', 'STORY', `${G.role}. On the board's header: ${G.name}.`);
  IC.emit(S, 'sagaStage', { n });
}
IC.sagaStage = S => on(S) ? V(S).stage : 9;
/* who signs what the player does: the board's header (v3.1, stage 7 shows Lena's name) */
IC.sagaSigner = S => {
  if (!on(S)) return '';
  const X = V(S);
  if (X.stage === 7 || (X.stage === 8 && flagOf(S, 'route') === 'C')) return 'Recommended by L. Okafor';
  if (X.stage === 8 && flagOf(S, 'route') === 'B') return 'Recommended with a second signature';
  return X.stage >= 3 ? 'The cell recommends; Gen. Voss decides' : '';
};
/* what the story has not reached yet: '' when open, else why not, in a sentence */
IC.sagaLock = function (S, key) {
  if (!on(S)) return '';
  const n = V(S).stage;
  const L = {
    civil: [2, 'You are a controller in the tower. The airports are not yours to change until the emergency office appoints you.'],
    deploy: [3, 'Batteries and radars belong to the military. You ask for them once the joint cell gives you its civil seat (The Board).'],
    rooms: [3, 'The air picture, intelligence and supply are the joint cell’s. You join it with The Board.'],
    roe: [4, 'Hold and Free are the military’s call. Gen. Voss gives the cell a standing order at the end of The Board.'],
    strike: [5, 'Counter-strikes are not the cell’s to recommend until Sector Four.']
  }[key];
  if (!L || n >= L[0]) return '';
  return L[1];
};

/* ---------- operations ---------- */
// landings in the last 24 h: today's by the hour, and yesterday's from the hours not yet come round again
const dayN = (ap, S) => {
  if (!ap || !IC.aptDayLog) return 0;
  const L = IC.aptDayLog(S, ap), h = Math.floor((S.time % 86400) / 3600);
  return L.arr.reduce((s, n) => s + n, 0) + (L.prev ? L.prev.arr.slice(h + 1).reduce((s, n) => s + n, 0) : 0);
};
const freeStands = ap => (ap.stands || []).filter(s => !s.occ && !s.ac && s.ok !== false).length;
const coverAt = (S, p, r) => S.units.some(u => !u.dead && u.state === 'ready' && (u.d.weapon === 'sam' || u.d.weapon === 'gun') && U.dist(u, p) < (r || Math.max(60, (u.d.range || 0) * 0.6)));
const radarAt = (S, p) => S.units.some(u => !u.dead && u.state === 'ready' && u.d.sensor && U.dist(u, p) < (u.d.range || 400) * 0.8);
const roadOpen = (S, p, r) => !S.world.edges.some(e => e.cut && !e.abroad && e.pts && e.pts.some(q => U.dist(q, p) < (r || 80)));
const aptOpen = ap => ap && ap.parts && ap.parts.some(p => p.kind === 'runway' && IC.rwUsable(p) >= 15);
const apOf = (S, t) => { const s = IC.sagaSite(S, t.at); return s && s.ref && s.ref.parts ? s.ref : null; };
/* each kind of task: done(S, t) now, and how far along (a line for the panel) */
IC.SAGA_TASKS = {
  flights: { done: (S, t) => dayN(apOf(S, t), S) >= t.n, prog: (S, t) => `${dayN(apOf(S, t), S)} of ${t.n} landings in the last 24 h` },
  open: { done: (S, t) => aptOpen(apOf(S, t)), prog: (S, t) => aptOpen(apOf(S, t)) ? 'a runway is open' : 'no runway open' },
  stands: { done: (S, t) => { const ap = apOf(S, t); return !!ap && freeStands(ap) >= t.n; }, prog: (S, t) => { const ap = apOf(S, t); return ap ? `${freeStands(ap)} of ${t.n} stands free` : ''; } },
  cover: { done: (S, t) => { const s = IC.sagaSite(S, t.at); return !!s && coverAt(S, s, t.r); }, prog: (S, t) => '' },
  radar: { done: (S, t) => { const s = IC.sagaSite(S, t.at); return !!s && radarAt(S, s); }, prog: () => '' },
  road: { done: (S, t) => { const s = IC.sagaSite(S, t.at); return !!s && roadOpen(S, s, t.r); }, prog: (S, t) => { const s = IC.sagaSite(S, t.at); return s && roadOpen(S, s, t.r) ? 'the road is open' : 'the road is cut'; } },
  build: { done: (S, t) => { const ap = apOf(S, t); return !!ap && ap.parts.filter(p => p.kind === t.kind && p.built).length >= (t.n || 1); }, prog: () => '' },
  // a task the cell does when asked (a request): done once asked and its time has passed
  ask: { done: (S, t) => t.askT != null && S.time >= t.askT, prog: (S, t) => t.askT == null ? 'not asked yet' : S.time < t.askT ? `on its way: ${U.dur(t.askT - S.time)}` : '' },
  // a counter-strike recommended (and flown) during the operation
  strike: { done: (S, t) => !!(S.strike && S.strike.log.some(st => st.t >= V(S).op.t0)), prog: (S, t) => S.strike && S.strike.cur.length ? 'in the air' : 'from the Air room’s Counter-strike page' },
  // a task met by a choice in the operation's scene
  pick: { done: (S, t) => IC.sagaIf(S, t.if), prog: () => '' }
};
IC.SAGA_TASKS.pax = { done: (S, t) => Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0) >= t.n, prog: (S, t) => `${Math.round(Math.max(S.av.day.pax, S.av.yesterday ? S.av.yesterday.pax : 0)).toLocaleString('en-US')} of ${t.n.toLocaleString('en-US')} passengers a day` };

function opStart(S, c) {
  const X = V(S), O = c.op;
  const tasks = (O.tasks || []).filter(t => !t.if || t.k === 'pick' || IC.sagaIf(S, t.if)).map(t => Object.assign({}, t, { ok: false }));
  X.op = { id: c.id, t0: S.time, t1: S.time + IC.MO(S, O.mo || 0.5), tasks, raid: O.raid ? 'due' : null, hits: 0, hitBy: {}, hitAt: [], R: null };
  X.ph = 'op';
  if (O.raid) IC.flag(S, 'raid:' + c.id, true);
  if (O.brief) IC.log(S, 'warn', 'BRIEFING', O.brief);
  IC.emit(S, 'sagaOp', { c });
}
/* a request the cell carries out: a battery or a radar moved over the site by the military, after a delay */
IC.sagaAsk = function (S, i) {
  const X = V(S), O = X.op; if (!O) return false;
  const t = O.tasks[i]; if (!t || t.k !== 'ask' || t.askT != null) return false;
  t.askT = S.time + (t.h || 2) * H;
  IC.later(S, (t.h || 2) * H, 'sagaAskDone', S, O.id, i);
  IC.log(S, 'info', 'REQUEST', `${t.t}: asked. ${IC.SAGA_STAGES[X.stage].name} signs; it takes about ${t.h || 2} h.`);
  return true;
};
IC.H.sagaAskDone = (S, id, i) => () => {
  const X = V(S), O = X.op; if (!O || O.id !== id) return;
  const t = O.tasks[i];
  if (t.unit) placeUnit(S, t.unit, t.at);
};
/* a battery or radar the military puts over a story site, ready (one of that type there already will do) */
function placeUnit(S, type, at) {
  const s = IC.sagaSite(S, at); if (!s || !IC.findSpot || !IC.UNITS[type]) return null;
  const have = S.units.find(u => !u.dead && u.type === type && U.dist(u, s) < 120); if (have) return have;
  const p = IC.findSpot(S, type, s.x, s.y, 20, 160); if (!p) return null;
  const u = IC.makeUnit(S, type, p.x, p.y, { instant: true, full: true });
  u.name = `${s.name.replace(/^the /, '')} ${u.d.short || u.d.name}`;
  IC.log(S, 'info', 'REQUEST', `${u.name} is in place.`, u);
  return u;
}
function opTick(S) {
  const X = V(S), O = X.op, c = chap(O.id);
  for (const t of O.tasks) if (!t.ok && IC.SAGA_TASKS[t.k] && IC.SAGA_TASKS[t.k].done(S, t)) {
    t.ok = true; t.okT = S.time;
    IC.log(S, 'kill', 'TASK', `${t.t}: done.`);
    IC.sfx && IC.sfx.ui('ok');
  }
  // a task undone again (a runway cratered, a road cut) is not done
  for (const t of O.tasks) if (t.ok && t.keep && !IC.SAGA_TASKS[t.k].done(S, t)) { t.ok = false; IC.log(S, 'warn', 'TASK', `${t.t}: undone.`); }
  // a wave with nothing left to fly (its batteries destroyed) ends without a raid
  if (O.raid === 'due' && S.wp && S.wp.ends && S.wp.ends['v3_' + O.id] != null) O.raid = 'over';
  const raidDone = !O.raid || O.raid === 'over';
  const all = O.tasks.every(t => t.ok);
  // the window waits for its raid to be over (a month at most past it, should the plan never fly it)
  const late = S.time >= O.t1 + IC.MO(S, 1);
  if ((S.time >= O.t1 && raidDone) || late || (all && raidDone && S.time > O.t0 + 600)) opEnd(S, c);
}
/* the result, from what happened: the tasks done and what the raid hit */
function opEnd(S, c) {
  const X = V(S), O = X.op;
  const n = O.tasks.length, ok = O.tasks.filter(t => t.ok).length;
  const hit = O.hits > 0;
  let r;
  if (c.op.result) r = c.op.result;
  else if (!n) r = hit ? (O.hits >= 3 ? 'failure' : 'partial') : 'success';
  else if (ok === n && !hit) r = 'success';
  else if (ok === 0 && (hit || !c.op.raid)) r = 'failure';
  else if (hit && O.hits >= 3 && ok < n) r = 'failure';
  else r = 'partial';
  X.res[c.id] = r;
  IC.flag(S, c.id, r);
  if (hit) IC.flag(S, c.id + ':hit', O.hits);
  for (const k in O.hitBy) IC.flag(S, `${c.id}:hit:${k}`, O.hitBy[k]);
  IC.log(S, r === 'success' ? 'kill' : 'warn', 'STORY', `${c.t}: ${r === 'success' ? 'held' : r === 'partial' ? 'held in part' : 'not held'}. ${ok} of ${n} tasks done${c.op.raid ? hit ? `, ${O.hits} hit${O.hits > 1 ? 's' : ''} on the site` : ', nothing hit the site' : ''}.`);
  X.op = null;
  IC.emit(S, 'sagaResult', { c, r });
  finish(S, c);
}
/* what hits near an operation's sites counts against it */
IC.on((S, type, d) => {
  if (!on(S)) return;
  const X = V(S), O = X.op;
  if (type === 'wavePlanned' && O && O.raid === 'due' && d.w && d.w.when && d.w.when.flag === 'raid:' + O.id) { O.raid = 'flying'; O.R = d.R ? d.R.id : null; return; }
  if (type === 'raidOver' && O && O.raid === 'flying') { O.raid = 'over'; return; }
  // what a counter-strike cost, for the aftermath's words
  if (type === 'strikeDone' && O) { if (d.lost) IC.flag(S, O.id + ':lost', d.lost); if (d.killed.length) IC.flag(S, O.id + ':killed', d.killed.length); return; }
  if (type === 'groundLoss' && O && d.n) { IC.flag(S, O.id + ':ground', (flagOf(S, O.id + ':ground') || 0) + d.n); return; }
  if (type === 'impact' && O) {
    const c = chap(O.id), sites = (c.op.sites || []).map(id => IC.sagaSite(S, id)).filter(Boolean);
    const s = sites.find(s => U.dxy(d.x, d.y, s.x, s.y) < (c.op.r || 60));
    if (s) { O.hits++; O.hitBy[s.id] = (O.hitBy[s.id] || 0) + 1; O.hitAt.push({ x: d.x, y: d.y, t: S.time }); }
  }
});

/* ---------- the tick ---------- */
IC.sagaTick = function (S, dt) {
  const X = V(S);
  X.tickT -= dt; if (X.tickT > 0) return; X.tickT = 2;
  const c = IC.SAGA[X.i];
  if (X.ph === 'scene' && c && seen(S, sceneId(c))) sceneDone(S, c);
  else if (X.ph === 'scene' && c && !queued(S, sceneId(c)) && !seen(S, sceneId(c))) sceneDone(S, c);
  else if (X.ph === 'op' && X.op) opTick(S);
  else if (X.ph === 'after' && c && (seen(S, sceneId(c, 'after')) || !queued(S, sceneId(c, 'after')))) { X.ph = 'wait'; IC.emit(S, 'sagaDone', { c }); }
  if (X.ph === 'wait') { const n = nextOf(S); if (n && due(S, n)) begin(S, n); else if (!n && !S.over) end(S); }
  S.camp.goal = c ? c.t : '';
};
function end(S) {
  const X = V(S); if (X.ended) return;
  X.ended = true;
  IC.emit(S, 'sagaEnd', {});
  const dark = IC.sagaIf(S, 'account=protective | tu3310=lost');
  IC.victory ? IC.victory(S, dark ? 'The door locked. The airport reopened on a Monday.' : 'The door left open. The story is over; the airports go on.') : (S.over = 'end');
}

/* ---------- words for the panels ---------- */
const label = (S, c) => {
  if (c.m < 0) return 'Before';
  const m = Math.floor(c.m), y = Math.floor(m / 12) + 1;
  return `Year ${y} of the war, month ${m % 12 + 1}`;
};
IC.sagaLabel = label;
/* an operation's aftermath: one panel for each result, shown on the one that happened */
IC.sagaRes = (id, art, ok, part, bad) => [{ art, if: id + '=success', cap: ok }, { art, if: id + '=partial', cap: part }, { art, if: id + '=failure', cap: bad }];
/* the goals panel: the chapter, what is being done in it, and what comes next */
IC.sagaInfo = function (S) {
  if (!on(S)) return null;
  const X = V(S), c = IC.SAGA[X.i], n = nextOf(S), O = X.op;
  const m = IC.sagaMonth(S);
  const info = { c, n, ph: X.ph, stage: X.stage, role: IC.SAGA_STAGES[X.stage].role, signer: IC.sagaSigner(S), month: m, tasks: [], left: 0, of: IC.SAGA.length, at: X.i + 1 };
  if (O) {
    info.left = Math.max(0, O.t1 - S.time);
    info.tasks = O.tasks.map((t, i) => ({ i, t: t.t, ok: t.ok, ask: t.k === 'ask' && t.askT == null, prog: !t.ok && IC.SAGA_TASKS[t.k] && IC.SAGA_TASKS[t.k].prog ? IC.SAGA_TASKS[t.k].prog(S, t) : '', at: t.at }));
    info.raid = O.raid; info.hits = O.hits;
  }
  if (X.ph === 'wait' && n) {
    const T = IC.sagaTimeOf(S, n.m);
    info.next = S.time >= T ? `${n.t} begins as soon as the sky is clear.` : `Next: ${n.t}, in ${U.months(T - S.time)}.`;
  }
  return info;
};
/* Go on: time runs fast (logistics.js's wait) until the next chapter is due */
IC.sagaWait = function (S) {
  if (!on(S) || V(S).ph !== 'wait' || !nextOf(S)) return false;
  S.wait = { key: 'story', what: nextOf(S).t, amt: Infinity, story: true, m0: S.cal ? S.cal.m : 0, t0: S.time };
  S.skip = false; S.paused = false;
  IC.emit(S, 'waitStart', S.wait);
  return true;
};

/* ---------- the enemy's plan for the story: the batteries of the homeland plan, a wave per raid ---------- */
IC.sagaPlan = function (S) {
  const base = IC.WAR_PLANS.homeland || { batteries: [] };
  const waves = [];
  for (const c of IC.SAGA) {
    const R = c.op && c.op.raid; if (!R) continue;
    waves.push({ id: 'v3_' + c.id, name: R.name || c.t, when: { flag: 'raid:' + c.id, h: R.h || [2, 8] }, warn: R.warn != null ? R.warn : 40, night: !!R.night,
      act: R.act || undefined, intel: R.intel || '', say: R.say || undefined, cut: c.sceneAt === 'warn' ? sceneId(c) : undefined, hits: R.hits.map(h => Object.assign({}, h)), recon: false });
  }
  // after the last authored raid, nothing: the story's plan does not loop (a quiet wave nobody can trigger ends it)
  waves.push({ id: 'v3_end', name: 'none', when: { flag: 'raid:never' }, hits: [], loop: true });
  return { name: 'The war, by the story', batteries: base.batteries, waves };
};

})(window.IC);
