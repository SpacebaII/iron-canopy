/* Iron Canopy — the scripted war (brief 76), headless. In the Career the enemy no longer rolls its raids: it flies a
   written plan (IC.WAR_PLANS[map], war-homeland.js; the planner in the Sandbox writes one, brief 77).

   A plan has batteries and waves.
   - A battery is a group of launchers on their soil: `w` the weapon family (an IC.ARMS type: srbm, lacm, owa...; the
     aircraft str, sead, bmr, ahe, ewj; or `sam`, their own air defence, which fires at nothing of ours but guards
     its sector against our strikes), `n` launchers, `salvo` rounds a launcher fires in a wave, `stock` rounds in
     all, `tier` a version to pin (IC.ARMS_D), `replace` hours to replace a destroyed launcher (0: never). Ballistic
     and rocket launchers are real launchers in S.tels: they drive out of hiding to the battery's firing point,
     set up, fire and drive back, and can be found and destroyed like the rest. A launcher destroyed fires nothing.
   - A wave is one raid: `when` (hours after the war starts `{ war: h }`, after another wave ends `{ after: id, h }`,
     when a story flag is set `{ flag }` or a story beat is done `{ beat }`; otherwise after the last one, `gap`
     hours), `night` to come between 21:00 and 04:00, `act` to move the enemy to that act (their weapons' versions
     follow it), `warn` minutes of warning, `intel` the warning's words, `say` lines heard before it, `cut` a cutscene,
     and `hits`: each a battery firing `n` rounds at `at`, timed to land `t` seconds after the wave's peak, along
     `via` waypoints if given. A wave marked `loop` comes round again after the last wave, until the war ends.
   - Targets (`at`) are named so a plan survives the player's own building: 'city:Ashford', 'place:dam' (a story
     place, IC.placeOf), 'infra:ab_fwd' (by id or name), 'apt:busiest' / 'apt:capital' / 'apt:north' (our airports),
     'base:main', 'ad:radar' / 'ad:sam' / 'ad:busiest' (our units the enemy knows of), 'set:fuel' (any of a target
     set, IC.ESETS), 'command:capital', or a point [x, y].

   Variation is light and seeded per game (S.wp.seed): a wave's peak moves by `vary.t` seconds (10 minutes unless it
   says), a hit's `n` may be a range [a, b], a hit may fly only with chance `p`, and `alt` lists other targets it may
   take instead. The enemy's raid machinery does the rest: the build-up, the raid, the after-action report. */
(function (IC) {
'use strict';
const U = IC.U, H = 3600;

IC.WAR_PLANS = IC.WAR_PLANS || {};
/* what each family fires from: grp is what the counter-strike menu calls them */
IC.WP_W = {
  srbm: { grp: 'bal', tel: 'bm', salvo: 2 }, marv: { grp: 'bal', tel: 'bm', salvo: 2 }, mrbm: { grp: 'bal', tel: 'mrbm', salvo: 1 },
  rkt: { grp: 'rkt', tel: 'rkt', salvo: 12 }, hgv: { grp: 'bal', salvo: 1 },
  lacm: { grp: 'cm', salvo: 2 }, mcm: { grp: 'cm', salvo: 2 }, scm: { grp: 'cm', salvo: 1 }, glb: { grp: 'cm', salvo: 2 },
  owa: { grp: 'drone', salvo: 6 }, jdr: { grp: 'drone', salvo: 3 }, lm: { grp: 'drone', salvo: 2 }, dcy: { grp: 'drone', salvo: 4 }, esj: { grp: 'drone', salvo: 2 },
  str: { grp: 'air', salvo: 1 }, sead: { grp: 'air', salvo: 1 }, bmr: { grp: 'air', salvo: 1 }, ahe: { grp: 'air', salvo: 1 }, ewj: { grp: 'air', salvo: 1 },
  sam: { grp: 'sam', salvo: 0, R: 600 }
};
IC.WP_GRP = {
  bal: { name: 'Ballistic missile launchers', one: 'ballistic missile launcher' },
  cm: { name: 'Cruise missile launchers', one: 'cruise missile launcher' },
  drone: { name: 'Drone launch sites', one: 'drone launcher' },
  rkt: { name: 'Rocket artillery', one: 'rocket launcher' },
  air: { name: 'Aircraft at their air bases', one: 'aircraft' },
  sam: { name: 'Their air defence', one: 'air defence launcher' }
};
const TEL_SPD = { bm: 0.16, mrbm: 0.16, rkt: 0.22 };
const SETUP = { bm: 700, mrbm: 700, rkt: 300 };
const RAID_PEAK_MIN = 1500;

/* ---------- setting up ---------- */
IC.warPlanFor = S => S.world && S.world.map && IC.WAR_PLANS[S.world.map] || null;
IC.warPlanInit = function (S, plan) {
  plan = plan || IC.warPlanFor(S);
  if (!plan) { S.wp = null; return null; }
  const X = S.wp = { name: plan.name || 'plan', plan: JSON.parse(JSON.stringify(plan)), on: true, bats: {}, waves: [], i: 0, loopN: 0, R: null, lastEnd: 0, seed: (S.world.seed ^ 0x5eed) >>> 0, log: [], ends: {}, skipT: 0 };
  for (const b of plan.batteries || []) addBattery(S, b);
  for (const w of plan.waves || []) X.waves.push(JSON.parse(JSON.stringify(w)));
  return X;
};
/* a battery on the map, with its launchers */
function addBattery(S, b) {
  const X = S.wp, K = IC.WP_W[b.w];
  if (!K) return null;
  const B = Object.assign({ n: 1, salvo: K.salvo, stock: 0, tier: null, replace: 0 }, JSON.parse(JSON.stringify(b)));
  B.nat = IC.countryAt(B.x, B.y) || 'A'; B.grp = K.grp; B.L = []; B.seen = 0; B.q = [];
  if (!B.stock) B.stock = B.n * Math.max(1, B.salvo) * 4;
  if (!B.name) B.name = `${IC.WP_GRP[K.grp].one} battery ${Object.keys(X.bats).length + 1}`;
  // where its launchers hide: a few km back from the firing point, away from the border
  const away = hideOf(B);
  B.hx = b.hx != null ? b.hx : away.x; B.hy = b.hy != null ? b.hy : away.y;
  if (K.tel) B.site = { id: 'wps_' + B.id, name: B.name, nat: B.nat, kind: K.tel, pk: 0, x: B.x, y: B.y, wp: true };
  for (let i = 0; i < B.n; i++) B.L.push(makeLauncher(S, B, i));
  X.bats[B.id] = B;
  return B;
}
IC.wpAddBattery = addBattery;
function hideOf(B) {
  // straight back from the border: a step towards the nearest point of their own country's interior
  let bx = B.x, by = B.y, bd = IC.hostileBorderDist(B.x, B.y);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, x = B.x + Math.cos(a) * 120, y = B.y + Math.sin(a) * 120;
    if (IC.countryAt(x, y) !== B.nat) continue;
    const d = IC.hostileBorderDist(x, y); if (d > bd) { bd = d; bx = x; by = y; }
  }
  return { x: bx, y: by };
}
function makeLauncher(S, B, i) {
  const K = IC.WP_W[B.w], ox = (i % 3 - 1) * 6, oy = (Math.floor(i / 3) - 0.5) * 6;
  if (K.tel) {
    const tel = { id: IC.nid('tel'), tel: true, site: B.site, bat: B.id, name: `${B.name}, launcher ${i + 1}`, x: B.hx + ox, y: B.hy + oy, h: 0,
      state: 'hidden', t: 0, known: false, kx: 0, ky: 0, kt: 0, dead: false, mission: null, kind: K.tel, home: { x: B.hx + ox, y: B.hy + oy } };
    S.tels.push(tel);
    return tel;
  }
  return { id: IC.nid('wl'), bat: B.id, name: `${B.name}, ${IC.WP_GRP[K.grp].one} ${i + 1}`, x: B.x + ox, y: B.y + oy, dead: false };
}
IC.wpAlive = B => B ? B.L.filter(l => !l.dead).length : 0;
IC.wpBattery = (S, id) => S.wp && S.wp.bats[id] || null;

/* ---------- targets ---------- */
const SET_OF = { city: 'city', power: 'city', airport: 'trade', factory: 'trade', airbase: 'airbase', bridge: 'transport', depot: 'transport' };
function setOf(ref) {
  if (!ref) return 'city';
  if (ref.d) return ref.type === 'depot' ? 'transport' : 'ad';
  return SET_OF[ref.kind] || 'city';
}
const tgt = (ref, set, name) => ref ? { x: ref.x, y: ref.y, ref, name: name || ref.name, set: set || setOf(ref) } : null;
const live = r => r && !r.dead && !r.destroyed;
/* a named target, resolved now: null when there is no such thing in this game (yet) */
IC.wpTarget = function (S, at, from) {
  if (Array.isArray(at)) return { x: at[0], y: at[1], ref: null, name: IC.nearestPlace(S, at[0], at[1]), set: 'city' };
  if (!at || typeof at !== 'string') return null;
  const i = at.indexOf(':'), k = i < 0 ? at : at.slice(0, i), v = i < 0 ? '' : at.slice(i + 1);
  const ours = S.infra.filter(x => x.owner === 'us' && !x.offline);
  if (k === 'city') return tgt(IC.cities(S).find(c => c.name === v));
  if (k === 'place') { const p = IC.placeOf(S, v); if (!p) return null; return p._ref && p._ref.x != null && !p._ref.abroad ? tgt(p._ref) : { x: p.x, y: p.y, ref: null, name: p.name, set: 'city' }; }
  if (k === 'infra') return tgt(S.byId[v] || S.infra.find(x => x.name === v));
  if (k === 'base') return tgt(IC.mainBase(S), 'airbase');
  if (k === 'command') { const c = IC.cap(S); return c ? tgt(c, 'command', `the government quarter of ${c.name}`) : null; }
  if (k === 'apt') {
    const L = ours.filter(a => a.kind === 'airport' && a.parts && a.parts.some(p => p.built));
    if (!L.length) return null;
    const cap = IC.cap(S);
    const pick = v === 'capital' && cap ? L.sort((a, b) => U.dist(a, cap) - U.dist(b, cap))[0]
      : v === 'north' ? L.sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0]
      : v === 'nearest' && from ? L.sort((a, b) => U.dist(a, from) - U.dist(b, from))[0]
      : L.sort((a, b) => (b.svc ? b.svc.deps : 0) - (a.svc ? a.svc.deps : 0))[0];
    return tgt(pick, 'trade');
  }
  if (k === 'ad') {
    const L = [...S.enemy.known.values()].filter(q => live(q.ref) && (v === 'radar' ? q.kind === 'radar' : v === 'sam' ? q.kind === 'sam' : q.kind === 'sam' || q.kind === 'radar'));
    if (!L.length) return null;
    L.sort(v === 'busiest' ? (a, b) => (b.shots || []).length - (a.shots || []).length : (a, b) => from ? U.dist(a, from) - U.dist(b, from) : 0);
    return { x: L[0].x, y: L[0].y, ref: L[0].ref, name: L[0].ref.name, set: 'ad' };
  }
  if (k === 'set') {
    const L = IC.enemyTargets(S, v);
    if (!L.length) return null;
    L.sort((a, b) => b.w - a.w);
    return L[0];
  }
  return null;
};
/* the words a target spec reads as, for the planner and the Intel room */
IC.wpTargetWords = function (at) {
  if (Array.isArray(at)) return `a point at ${Math.round(at[0])}, ${Math.round(at[1])}`;
  const i = (at || '').indexOf(':'), k = at.slice(0, i), v = at.slice(i + 1);
  return { city: `the city of ${v}`, place: `the place "${v}"`, infra: v, base: 'our main air base', command: 'the government quarter',
    apt: { busiest: 'our busiest airport', capital: "the capital's airport", north: 'our airport nearest the border', nearest: 'our nearest airport' }[v] || 'an airport',
    ad: { radar: 'a radar they know of', sam: 'a missile battery they know of', busiest: 'the battery that has fired most' }[v] || 'our air defence',
    set: IC.ESETS[v] ? IC.ESETS[v].name : v }[k] || at;
};

/* ---------- timing ---------- */
const rngFor = (X, i) => IC.makeRng((X.seed + Math.imul(i + 1, 7919) + Math.imul(X.loopN, 104729)) >>> 0);
const pickR = (R, v) => Array.isArray(v) ? R.range(v[0], v[1]) : v;
const pick = (R, v) => Array.isArray(v) ? (v.length === 2 && typeof v[0] === 'number' ? R.range(v[0], v[1]) : R.pick(v)) : v;
/* the wave to fly next, and the time it may be planned from; null while nothing is due */
function nextWave(S, X) {
  const W = X.waves;
  if (!W.length) return null;
  while (W[X.i] && W[X.i].retaliation) X.i++;
  let w = W[X.i];
  if (!w) {
    // after the last wave, the loop: the waves marked loop, or the last three
    const L = W.filter(x => x.loop && !x.retaliation), loop = L.length ? L : W.filter(x => !x.retaliation).slice(-3);
    w = loop[X.li = (X.li || 0) % loop.length];
    if (!w) return null;
  }
  return w;
}
/* when a wave should peak, if it can be told now */
function peakOf(S, X, w, R) {
  const E = S.enemy, wh = w.when || {};
  let t = null;
  if (wh.war != null) t = E.warT + pick(R, wh.war) * H;
  else if (wh.after) { const e = X.ends[wh.after]; if (e == null) return null; t = e + pick(R, wh.h != null ? wh.h : [2.5, 4]) * H; }
  else if (wh.flag) { const f = S.story && S.story.flagT && S.story.flagT.get(wh.flag); if (f == null) return null; t = Math.max(f, X.lastEnd) + pick(R, wh.h != null ? wh.h : 1) * H; }
  else if (wh.beat) { const b = S.story && S.story.beats && S.story.beats.find(x => x.id === wh.beat && x.done); if (!b) return null; t = Math.max(X.lastEnd, S.time) + pick(R, wh.h != null ? wh.h : 1) * H; }
  else t = (X.lastEnd || E.warT) + pick(R, w.gap || [2.5, 4]) * H;
  if (X.i >= X.waves.length && wh.war != null) t = X.lastEnd + pick(R, w.gap || [2.5, 4]) * H;
  t += R.range(-1, 1) * (w.vary && w.vary.t != null ? w.vary.t : 600);
  if (w.night) { const h = (t % 86400) / H; if (h >= 4 && h < 21) t += (21 - h) * H + R.range(0, 2) * H; }
  return t;
}
/* how long before its peak a hit must start: launchers driving out and setting up, weapons in flight */
function hitLead(S, B, obj, h) {
  const K = IC.WP_W[B.w], d = IC.ARMS_D[B.tier] || IC.armsDef(S, B.w);
  const from = { x: B.x, y: B.y }, L = pathLen(from, h.via, obj);
  if (K.tel) return U.dist({ x: B.hx, y: B.hy }, from) / TEL_SPD[K.tel] + SETUP[K.tel] + L / (d.vAvg || 10) + 40 + 30 * (B.salvo || 1) + 120;
  if (B.w === 'hgv') return L / 12;
  return L / Math.max(0.3, d.spd || 1) + 60;
}
function pathLen(from, via, to) { let L = 0, p = from; for (const q of (via || []).map(v => ({ x: v[0], y: v[1] })).concat([to])) { L += U.dist(p, q); p = q; } return L * (via && via.length ? 1 : 1.15); }

/* ---------- each step of the calm: plan the next wave when it is due ---------- */
IC.wpCalm = function (S, E) {
  const X = S.wp;
  if (!X || !X.on || X.R || X.manual) return !!(X && X.on);
  // our strikes on their soil bring the plan's retaliation forward, whatever was next
  const ret = E.retaliate > 0 && S.time > (X.retT || 0) && X.waves.find(x => x.retaliation);
  if (ret) {
    E.retaliate = 0; X.retT = S.time + 4 * H; X.retN = (X.retN || 0) + 1;
    planWave(S, E, X, ret, S.time + pickR(rngFor(X, 900 + X.retN), ret.gap || [1, 1.5]) * H, rngFor(X, 950 + X.retN));
    return true;
  }
  const w = nextWave(S, X);
  if (!w) return true;
  const idx = X.waves.indexOf(w) + (X.i >= X.waves.length ? X.waves.length * (X.loopN + 1) : 0), R = rngFor(X, idx);
  const T = peakOf(S, X, w, R);
  if (T == null) return true;
  const lead = ((w.warn != null ? w.warn : 60) + 30) * 60;
  if (S.time < T - lead) return true;
  planWave(S, E, X, w, T, rngFor(X, idx + 10000));
  return true;
};

/* a target that is not there falls back to one of the same kind, then the main air base */
const FALLBACK = { ad: ['ad:any', 'base:main'], apt: ['apt:busiest', 'set:trade', 'base:main'], set: ['base:main'], infra: ['base:main'], place: ['base:main'], city: ['set:city'] };
function planWave(S, E, X, w, T, R) {
  const K = IC.EK, plan = [], skipped = [];
  if (w.act && E.act < w.act) for (let n = E.act + 1; n <= w.act; n++) K.startAct(S, n, w.actWhy || `the plan's ${w.name || 'next wave'}`);
  for (const h of w.hits || []) {
    const B = X.bats[h.bat];
    if (!B || B.w === 'sam') continue;
    if (h.p != null && R() > h.p) continue;
    let obj = IC.wpTarget(S, h.at, B);
    if (h.alt && h.alt.length && R() < (h.altP != null ? h.altP : 0.3)) obj = IC.wpTarget(S, R.pick(h.alt), B) || obj;
    if (!obj) for (const a of (h.alt || []).concat(FALLBACK[(h.at || '').split(':')[0]] || [])) if ((obj = IC.wpTarget(S, a, B))) break;
    if (!obj) { skipped.push({ B, why: `nothing at ${IC.wpTargetWords(h.at)}` }); continue; }
    const alive = IC.wpAlive(B);
    if (!alive) { skipped.push({ B, why: B.lost ? 'destroyed by our strikes' : 'none of its launchers can fire', dead: !!B.lost }); continue; }
    let n = Math.round(pick(R, h.n != null ? h.n : B.salvo * alive));
    if (w.vary && w.vary.n) n = Math.round(n * (1 + R.range(-1, 1) * w.vary.n));
    const cap = IC.WP_W[B.w].grp === 'air' ? alive : alive * Math.max(1, B.salvo);
    const short = n > cap ? n - cap : 0;
    n = Math.min(n, cap, Math.floor(B.stock));
    if (n <= 0) { skipped.push({ B, why: 'out of stock' }); continue; }
    plan.push({ h, B, obj, n, short, at: (h.t || 0) + R.range(-1, 1) * (h.vary != null ? h.vary : 45) });
  }
  // the peak waits for the slowest hit
  let need = 0;
  for (const p of plan) need = Math.max(need, hitLead(S, p.B, p.obj, p.h) - p.at);
  T = Math.max(T, S.time + need + 120, S.time + RAID_PEAK_MIN);
  const main = plan.length ? plan.slice().sort((a, b) => b.n - a.n)[0].obj : null;
  const name = w.name || 'raid';
  if (!main) {
    K.note(S, `The plan's ${name} has nothing to fly: ${skipped.map(s => `${s.B.name} ${s.why}`).join('; ') || 'no hits'}.`);
    if (skipped.some(s => s.dead)) K.intel(S, `They meant to strike again, but ${skipped.filter(s => s.dead).map(s => s.B.name).join(' and ')} cannot fire: destroyed by our strikes.`);
    endWave(S, X, w);
    return;
  }
  const Rd = { id: ++E.raidN, kind: 'scripted', name, obj: main, set: main.set, T, t0: S.time, ops: [], leaks: [], launched: 0, act: E.act, mix: [], why: w.why || 'the plan', wave: w.id, fired0: S.stats.fired, skipped: skipped.map(s => ({ name: s.B.name, why: s.why })) };
  Rd.P = E.plan = { aim: E.aim, label: name, set: main.set, obj: main, kind: 'scripted', why: Rd.why };
  const dead = skipped.filter(s => s.dead);
  if (dead.length) Rd.note = `${dead.map(s => s.B.name).join(' and ')} did not fire: destroyed by our strikes.`;
  const shortL = plan.filter(p => p.short && p.B.lost);
  if (shortL.length) Rd.note = (Rd.note ? Rd.note + ' ' : '') + `${shortL.map(p => `${p.B.name} fired ${p.n} instead of ${p.n + p.short}`).join('; ')}: the launchers we destroyed were missing.`;
  E.raid = Rd; X.R = Rd; X.wave = w;
  E.mood = `preparing the ${name}`;
  let n = 0;
  for (const p of plan) n += fire(S, E, Rd, p, T);
  Rd.planned = n;
  K.note(S, `Plans raid ${Rd.id}, the ${name}, peaking at ${U.hhmm(T)}: ${plan.map(p => `${p.n} from ${p.B.name} at ${p.obj.name}`).join('; ')}.${skipped.length ? ' Missing: ' + skipped.map(s => `${s.B.name} (${s.why})`).join(', ') + '.' : ''}`);
  // the build-up the player can see coming: the plan's own words, or the usual warning
  const warn = (w.warn != null ? w.warn : 60) * 60;
  K.later(S, Math.max(0, T - S.time - warn), 'wpWarn', S, Rd, w.intel || '', w.say || null, w.cut || null);
  if (w.recon !== false) K.later(S, Math.max(0, T - S.time - 2900), 'eRecon', S, Rd);
  E.cycle = { phase: 'buildup', next: T, R: Rd };
  IC.emit(S, 'wavePlanned', { w, R: Rd });
}
function endWave(S, X, w) {
  X.ends[w.id] = S.time; X.lastEnd = S.time; X.R = null; X.wave = null;
  if (w.retaliation) return;
  if (X.i < X.waves.length) X.i++; else { X.li = (X.li || 0) + 1; X.loopN++; }
}
/* the raid is over and reported (enemy.js): the plan moves on */
IC.on((S, type, R) => {
  if (type !== 'raidOver' || !S.wp || S.wp.R !== R) return;
  const X = S.wp, w = X.wave;
  if (w && !X.single) endWave(S, X, w); else { X.R = null; X.wave = null; if (w) X.ends[w.id] = S.time; }
  X.single = false;
  S.enemy.calm = 0;
});
IC.H.wpWarn = (S, R, words, say, cut) => () => {
  const E = S.enemy, sharp = IC.hasTech(S, 's_esm') || IC.hasTech(S, 's_sat');
  const when = Math.max(5, Math.round((R.T - S.time) / 900) * 15);
  R.warned = true;
  const where = sharp ? `, most likely against ${R.obj.name}` : ` towards ${IC.nearestPlace(S, R.obj.x, R.obj.y).replace(/^[\d.]+ km \w+ of /, '')}`;
  IC.log(S, 'warn', 'INTEL', words ? `${words} Expect it in about ${when} minutes.` : `Signals intelligence: ${S.world.names.A} is preparing a raid${where}. Expect it in about ${when} minutes.`, sharp ? R.obj : null);
  if (R.note) IC.EK.intel(S, R.note);
  for (const s of say || []) if (IC.say) IC.say(S, s.who || 'INT', s.text);
  if (cut && IC.cutscene) IC.cutscene(S, cut);
  IC.emit(S, 'raidWarning', { R, sharp, when });
};

/* ---------- firing ---------- */
function fire(S, E, Rd, p, T) {
  const K = IC.EK, B = p.B, W = IC.WP_W[B.w];
  const op = K.newOp(S, 'strike', `${Rd.name} on ${p.obj.name}`, { raid: Rd, obj: p.obj.ref, set: p.obj.set, arriveAt: T + p.at, bat: B.id });
  Rd.ops.push(op);
  const arrive = T + p.at, tier = B.tier || undefined;
  B.stock -= p.n;
  const via = (p.h.via || []).map(v => ({ x: v[0], y: v[1] }));
  if (W.tel) {
    // the launchers alive share the rounds, each firing its salvo
    const tels = B.L.filter(l => !l.dead);
    let left = p.n;
    for (const tel of tels) {
      if (left <= 0) break;
      const k = Math.min(left, Math.max(1, Math.ceil(p.n / tels.length))); left -= k;
      const aims = [];
      for (let i = 0; i < k; i++) {
        const a = B.w === 'rkt' ? { x: p.obj.x + U.rand(-25, 25), y: p.obj.y + U.rand(-25, 25) } : K.aimOn(p.obj);
        aims.push({ type: B.w, x: a.x, y: a.y, ref: p.obj.ref, pens: 0, tier });
      }
      const fp = { x: B.x + (tel.home.x - B.hx), y: B.y + (tel.home.y - B.hy) };
      const flight = U.dist(fp, p.obj) / ((IC.ARMS_D[tier] || IC.armsDef(S, B.w)).vAvg || 10) + 40;
      const fireAt = arrive - flight - (k - 1) * (B.w === 'rkt' ? 6 : 30);
      const go = fireAt - SETUP[W.tel] - U.dist(tel, fp) / TEL_SPD[W.tel] - 60;
      K.later(S, Math.max(0, go - S.time), 'wpTel', S, tel, aims, op, fireAt, fp);
    }
    return p.n;
  }
  const d = IC.ARMS_D[tier] || IC.armsDef(S, B.w);
  if (B.w === 'hgv') {
    K.later(S, Math.max(0, arrive - S.time - U.dist(B, p.obj) / 12), 'wpHgv', S, B.id, p.obj, op);
    return 1;
  }
  if (W.grp === 'air') return air(S, E, B, p, op, arrive, via);
  for (let i = 0; i < p.n; i++) {
    const from = { x: B.x + U.rand(-15, 15), y: B.y + U.rand(-15, 15) };
    const aim = K.aimOn(p.obj);
    const route = via.length ? via.map(q => ({ x: q.x + U.rand(-8, 8), y: q.y + U.rand(-8, 8) })).concat([aim]) : B.w === 'scm' ? [aim] : K.routeBy(S, from, aim, true, B.w === 'owa' ? 2600 : 2100, null);
    const tt = K.routeLen(from, route) / Math.max(0.1, d.spd || 1);
    const spread = W.grp === 'drone' ? U.rand(-90, 90) : U.rand(-30, 30);
    K.later(S, Math.max(0, arrive - S.time - tt + spread), 'eSpawn', S, B.w, from.x, from.y, { route, aim, target: p.obj.ref, op, origin: B.site || null, tier, bat: B.id }, 0, W.grp === 'cm' ? 2 : 1);
  }
  return p.n;
}
/* a launcher drives out to fire at its time, unless it was destroyed in the meantime */
IC.H.wpTel = (S, tel, aims, op, fireAt, fp) => () => {
  if (tel.dead) return;
  tel.mission = { aims, op, fireAt }; tel.state = 'moving'; tel.route = [fp]; tel.staged = false;
};
IC.H.wpHgv = (S, id, obj, op) => () => {
  const B = IC.wpBattery(S, id);
  if (!B || !IC.wpAlive(B)) return;
  const aim = { x: obj.x, y: obj.y }, R = U.dist(B, aim);
  IC.spawnThreat(S, 'hgv', B.x, B.y, { x0: B.x, y0: B.y, x1: aim.x, y1: aim.y, T: R / 12, apex: 90, aim, op, vx: (aim.x - B.x) / (R / 12), vy: (aim.y - B.y) / (R / 12), bat: id });
  op.launched++;
};
/* aircraft: they take off from their base at the battery and fly the mission their type flies */
function air(S, E, B, p, op, arrive, via) {
  const K = IC.EK, home = B.home || (B.home = { x: B.x, y: B.y, name: B.name, acAvail: {}, acMax: {} });
  const ac = B.L.filter(l => !l.dead && !l.out).slice(0, p.n);
  const d = IC.THR[B.w], obj = p.obj;
  ac.forEach((l, i) => {
    let o, T;
    if (B.w === 'str' || B.w === 'ahe') {
      const rp = via.length ? via.concat([{ x: obj.x, y: obj.y }]) : K.routeBy(S, home, obj, true, B.w === 'ahe' ? 900 : 1500, null);
      const last = rp[rp.length - 1], dir = Math.atan2(last.y - home.y, last.x - home.x), off = B.w === 'ahe' ? 60 : 400;
      rp[rp.length - 1] = { x: obj.x - Math.cos(dir) * off, y: obj.y - Math.sin(dir) * off };
      T = K.routeLen(home, rp) / d.spd;
      o = { home, mission: 'strike', route: rp.map(q => ({ x: q.x + i * 20, y: q.y })), tgt: { x: obj.x, y: obj.y, ref: obj.ref, name: obj.name }, op, alt: 0.1, low: true, radarOn: false };
    } else if (B.w === 'sead') {
      const dir = Math.atan2(obj.y - home.y, obj.x - home.x), lp = { x: obj.x - Math.cos(dir) * 1200, y: obj.y - Math.sin(dir) * 1200 };
      T = U.dist(home, lp) / d.spd + 500;
      o = { home, mission: 'sead', route: (via.length ? via : []).concat([{ x: lp.x + i * 60, y: lp.y }]), arms: 2, op, dcy: 2, tgt: obj };
    } else if (B.w === 'bmr') {
      const st = K.standoff(obj, home, 500);
      T = U.dist(home, st) / d.spd + U.dist(st, obj) / 2.4;
      o = { home, mission: 'bomber', route: (via.length ? via : []).concat([st]), load: 4, tgt: obj, op };
    } else {
      const st = K.standoff(obj, home);
      T = 0;
      o = { home, mission: 'jam', route: [st], st, jamT: Math.max(1800, arrive - S.time + 2400), jamming: true, op };
    }
    o.wpL = l.id; o.bat = B.id;
    K.later(S, Math.max(0, arrive - S.time - T) + i * 25, 'eSpawn', S, B.w, home.x, home.y, o, 0, 1);
  });
  return ac.length;
}
/* an aircraft of a squadron shot down is one fewer for the next wave */
IC.on((S, type, t) => {
  if (type !== 'kill' || !S.wp || !t || !t.bat || !t.wpL) return;
  const B = S.wp.bats[t.bat], l = B && B.L.find(x => x.id === t.wpL);
  if (l && !l.dead) { l.dead = true; B.lost = (B.lost || 0) + 1; if (B.replace) B.q.push(S.time + B.replace * H); }
});
/* a ballistic or rocket launcher destroyed (by a strike, our reconnaissance and the rest): the battery is one short */
IC.on((S, type, d) => {
  if (type !== 'telKilled' || !S.wp || !d || !d.bat) return;
  const B = S.wp.bats[d.bat];
  if (B) { B.lost = (B.lost || 0) + 1; if (B.replace) B.q.push(S.time + B.replace * H); }
});
/* destroy one launcher of a battery (a counter-strike's bomb, a test) */
IC.wpKill = function (S, B, l, by) {
  if (!l || l.dead) return false;
  if (l.tel) { IC.telDestroyed(S, l, by || 'our strike'); return true; }
  l.dead = true; B.lost = (B.lost || 0) + 1;
  if (B.replace) B.q.push(S.time + B.replace * H);
  IC.log(S, 'kill', 'DESTROYED', `${l.name} destroyed by ${by || 'our strike'}.`, { x: l.x, y: l.y });
  return true;
};

/* ---------- every step: what our sensors learn of the batteries, and replacements ---------- */
IC.wpTick = function (S, dt) {
  const X = S.wp;
  if (!X || !X.on) return;
  X.skipT -= dt;
  if (X.skipT > 0) return;
  X.skipT = 20;
  // a weapon we track gives away roughly where it came from; a launcher we have located, exactly
  for (const t of S.threats) {
    if (!t.bat || t.dead || !t.det || t.wpSeen) continue;
    t.wpSeen = true;
    const B = X.bats[t.bat];
    if (B && !B.seen) { B.seen = S.time; IC.log(S, 'warn', 'LAUNCH POINT', `${IC.ARMS[t.type] ? 'Launches' : 'Aircraft'} traced back to ${B.name}, ${IC.wpSectorName(IC.wpSector(S, B.x, B.y))}.`, { x: B.x, y: B.y }); }
  }
  for (const B of Object.values(X.bats)) {
    if (!B.seen && B.L.some(l => l.tel && l.known)) B.seen = S.time;
    while (B.q.length && B.q[0] <= S.time) {
      B.q.shift();
      const l = B.L.find(x => x.dead);
      if (!l) continue;
      l.dead = false;
      if (l.tel) { l.state = 'hidden'; l.mission = null; l.x = l.home.x; l.y = l.home.y; l.known = false; }
      B.lost = Math.max(0, (B.lost || 0) - 1);
      IC.EK.note(S, `A replacement launcher reaches ${B.name}.`);
    }
  }
};

/* ---------- sectors: the compass from our capital ---------- */
IC.WP_SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SECTOR_NAME = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
IC.wpSectorName = k => `the ${SECTOR_NAME[k] || k} sector`;
IC.wpSectorWord = k => SECTOR_NAME[k] || k;
IC.wpSector = function (S, x, y) {
  const c = IC.cap(S) || { x: IC.WW / 2, y: IC.WH / 2 };
  const a = Math.atan2(x - c.x, -(y - c.y));   // 0 north, clockwise
  return IC.WP_SECTORS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
};

/* ---------- the planner's side (brief 77): the plan is edited in S.wp.plan, then the batteries are made again ---------- */
IC.wpRebuild = function (S) {
  const X = S.wp; if (!X) return null;
  S.tels = S.tels.filter(t => !t.bat);
  const keep = { manual: X.manual, log: X.log };
  const Y = IC.warPlanInit(S, X.plan);
  Object.assign(Y, keep);
  return Y;
};
/* fly one wave of the plan now (the Sandbox): it peaks as soon as its slowest weapon can get there */
IC.wpFly = function (S, id) {
  const X = S.wp, E = S.enemy, w = X && X.waves.find(x => x.id === id);
  if (!w) return null;
  if (!E.war) { E.allow = null; E.war = true; E.warT = S.time; E.actT = S.time; E.aimT = S.time; if (!E.act) E.act = 1; }
  if (X.R && E.raid === X.R) E.raid = null;
  X.R = null; X.single = true;
  planWave(S, E, X, w, S.time, rngFor(X, 20000 + (X.flown = (X.flown || 0) + 1)));
  return X.R;
};
/* what a hit will do, for the planner: its target now, how long its weapons fly, and when it must start */
IC.wpHitInfo = function (S, h) {
  const B = S.wp && S.wp.bats[h.bat];
  if (!B) return null;
  const obj = IC.wpTarget(S, h.at, B);
  if (!obj) return { B, obj: null };
  const d = IC.ARMS_D[B.tier] || IC.armsDef(S, B.w), K = IC.WP_W[B.w];
  const L = pathLen({ x: B.x, y: B.y }, h.via, obj);
  const spd = K.tel || B.w === 'hgv' ? (B.w === 'hgv' ? 12 : d.vAvg || 10) : d.spd || 1;
  return { B, obj, km: L / 10, flight: L / spd, lead: B.w === 'sam' ? 0 : hitLead(S, B, obj, h), d };
};

/* ---------- the plan as a file: what the planner exports and the game loads ---------- */
IC.wpExport = S => S.wp ? JSON.parse(JSON.stringify(S.wp.plan)) : null;
IC.wpFileText = function (P, map) {
  const b = P.batteries.map(x => '    ' + JSON.stringify(x)).join(',\n'), w = P.waves.map(x => '    ' + JSON.stringify(x)).join(',\n');
  // the header's lines are joined, not written with their indent, so the text test reads no doubled space
  const head = [`/* Iron Canopy — the enemy's war plan for the ${map} map (brief 76), written by the war planner (brief 77).`,
    'Batteries are their launchers; waves are the raids, in order. Every field is described in the war plan code. */'].join('\n' + ' '.repeat(3));
  return `${head}\n(function (IC) {\n'use strict';\nIC.WAR_PLANS = IC.WAR_PLANS || {};\nIC.WAR_PLANS.${map} = {\n  "name": ${JSON.stringify(P.name)},\n  "batteries": [\n${b}\n  ],\n  "waves": [\n${w}\n  ]\n};\n})(window.IC);\n`;
};
/* a plan from a file's text: the planner's export, the game's plan file, or the plan's JSON alone */
IC.wpParse = function (text) {
  const m = /=\s*(\{[\s\S]*\})\s*;?\s*\}\)\(window\.IC\)/.exec(text);
  const P = JSON.parse(m ? m[1] : text);
  if (!P || !Array.isArray(P.batteries) || !Array.isArray(P.waves)) throw new Error('not a war plan: it needs batteries and waves');
  return P;
};

})(window.IC);
