/* Iron Canopy — the enemy: installations, launchers, what they know about us, and the air and missile commander.
   The commander raids in cycles: a build-up the player can read, a raid whose waves are timed to arrive together,
   then a calm. It remembers which routes cost it and which methods worked, and changes objective, approach and
   weapons accordingly. */
(function (IC) {
'use strict';
const U = IC.U;

IC.isNight = S => { const h = (S.time % 86400) / 3600; return h < 6 || h >= 19.5; };

IC.enemyInit = function (S) {
  const W = S.world;
  for (const e of W.esites) {
    const s = Object.assign({}, e, { esite: true, nat: e.k, max: e.kind === 'airbase' ? 300 : e.kind === 'staging' ? 250 : 160, pk: e.kind === 'airbase' ? 2 : 0 });
    s.hp = s.max;
    s.inv = Object.assign({}, e.inv || {});
    if (e.ac) { s.acMax = Object.assign({ ahe: 4 }, e.ac); s.acAvail = Object.assign({ ahe: 4 }, e.ac); }
    // decoys are made at the air bases, and are finite like everything else
    if (e.kind === 'airbase') { s.inv.dcy = 12; s.regen = Object.assign({ dcy: 0.8 }, e.regen || {}); }
    if (e.tels) { s.telMax = e.tels; s.telQ = []; }
    if (e.kind === 'supply') s.stock = 200;
    S.esites.push(s);
    for (let i = 0; i < (e.tels || 0); i++) {
      const hp = hidePoint(S, s);
      S.tels.push({ id: IC.nid('tel'), tel: true, site: s, name: `${s.name} launcher ${i + 1}`, x: hp.x, y: hp.y, h: 0,
        state: 'hidden', t: 0, known: false, kx: 0, ky: 0, kt: 0, dead: false, mission: null, kind: e.kind });
    }
  }
  S.enemy = {
    known: new Map(), convoys: new Map(), raidN: 0, raid: null, cycle: null, escal: 0, escalBase: 0, nextThink: S.time + 1800, retaliate: 0, ops: [], pending: [],
    cd: {}, patrolT: 0, intelT: 0, regenT: 0, mood: 'massing on the border', will: 100, allow: null, war: false,
    plan: null, danger: {}, method: { cm: 1, bal: 1, drones: 1, sead: 1, bomber: 1, disguise: 1, low: 1 }, history: [],
    // the agenda: aims (the commander's own leaning, a little different each war), acts, what worked, what was fired
    aims: { coerce: U.rand(0.6, 1.1), morale: U.rand(0.6, 1.1), trade: U.rand(0.8, 1.3), air: U.rand(0.8, 1.3) }, aim: null, aimT: 0, aimFail: 0,
    act: 0, actT: 0, head: 0, winH: 0, winning: false, rec: [], setW: {}, hitN: {}, hard: {}, axisN: {},
    tally: {}, tallyRef: {}, tallyN: 0, tallyAll: {}, tallyAllN: 0, clog: [], intel: [], save: null, shock: null, c4: null
  };
  for (const k in IC.ESETS) S.enemy.setW[k] = 1;
  S.enemy.aim = pickAim(S.enemy);
  for (const u of S.units) IC.enemyLearn(S, u, 'prewar');
};

function hidePoint(S, s) {
  for (let k = 0; k < 40; k++) {
    const x = s.x + U.rand(-500, 500), y = s.y + U.rand(-500, 500);
    if (IC.countryAt(x, y) === s.nat && IC.hostileBorderDist(x, y) > 350 && x > 60 && y > 60 && x < IC.WW - 60 && y < IC.WH - 60) return { x, y };
  }
  return { x: s.x, y: s.y };
}
function launchPoint(S, s, near) {
  let best = null, bd = 1e9;
  for (let k = 0; k < 50; k++) {
    const x = s.x + U.rand(-650, 650), y = s.y + U.rand(-650, 650);
    if (IC.countryAt(x, y) !== s.nat || IC.hostileBorderDist(x, y) < 230 || y < 60 || x < 60 || x > IC.WW - 60 || y > IC.WH - 60) continue;
    const d = near ? U.dxy(x, y, near.x, near.y) : Math.random();
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best || { x: s.x, y: s.y };
}

/* ---------- what the enemy knows about us ---------- */
function kindFor(u) {
  const d = u.d;
  if (u.type === 'decoy') return 'radar';
  if (d.weapon === 'sam') return 'sam';
  if (d.sensor) return 'radar';
  if (d.weapon === 'ecm') return 'jammer';
  if (d.weapon === 'strike') return 'launcher';
  if (d.logi) return 'depot';
  return 'pointdef';
}
IC.enemyLearn = function (S, u, how) {
  if (!S.enemy || u.dead) return;
  const k = S.enemy.known.get(u.id);
  const rng = u.type === 'decoy' ? 0 : IC.maxRange(S, u);
  if (k) { k.x = u.x; k.y = u.y; k.t = S.time; k.how = how; k.rng = rng; }
  else S.enemy.known.set(u.id, { ref: u, x: u.x, y: u.y, t: S.time, kind: kindFor(u), how, rng, type: u.type });
};
IC.enemyLearnConvoy = function (S, v) { if (!v.dead) S.enemy.convoys.set(v.id, { ref: v, x: v.x, y: v.y, t: S.time }); };
IC.enemyAssess = function (S, b) { const E = S.enemy; if (E.plan && E.plan.obj && E.plan.obj.ref === b) E.plan.seen = S.time; };

IC.enemyIntel = S => updateIntel(S);
function updateIntel(S) {
  const E = S.enemy;
  for (const u of S.units) {
    if (u.callin || (u.state !== 'ready' && u.state !== 'building' && u.state !== 'setup')) continue;
    if (u.radarOn) IC.enemyLearn(S, u, 'ELINT');
    else if (IC.hostileBorderDist(u.x, u.y) < 380) IC.enemyLearn(S, u, 'observation');
    else if (S.time - u.lastFired < 150 && IC.hostileBorderDist(u.x, u.y) < 4500) IC.enemyLearn(S, u, 'launch detection');
  }
  for (const v of S.vehicles) if (!v.dead && IC.hostileBorderDist(v.x, v.y) < 1000) IC.enemyLearnConvoy(S, v);
  for (const [id, k] of E.known) if (k.ref.dead && S.time - k.t > 3600) E.known.delete(id);
  for (const [id, k] of E.convoys) if (k.ref.dead || S.time - k.t > 1800) E.convoys.delete(id);
}

/* ---------- targets: seven sets the commander's aims are served by ----------
   Each candidate has a value w, a place to aim at, and the set it belongs to. Airports and air bases are hit on their
   parts (runways, shelters, fuel tanks, terminals), not their centres. */
IC.ESETS = {
  city: { name: 'cities and their power', hint: 'power stations and city centres' },
  transport: { name: 'roads, bridges and supply', hint: 'motorways, bridges, depots and convoys' },
  trade: { name: 'airports and trade', hint: 'civil airports and factories' },
  fuel: { name: 'fuel', hint: 'the fuel farms at airports and air bases' },
  ad: { name: 'air defence and radars', hint: 'our radars and missile batteries' },
  airbase: { name: 'air bases and shelters', hint: 'runways, shelters and the jets in them' },
  command: { name: 'command', hint: 'the government quarter of the capital' }
};
const PART_W = { runway: 3, has: 2, hangar: 2, alert: 2, fuel: 2, ammo: 1.5, tower: 1, terminal: 2, apron: 1 };
/* a point on one of an airport's parts; `only` limits it to some kinds (fuel tanks, say) */
function aimAtBase(b, only) {
  const P = (b.parts || []).filter(p => (p.built || p.prog > 0) && PART_W[p.kind] && (!only || only.includes(p.kind)) && (p.kind === 'runway' || p.hp > p.max * 0.3));
  if (!P.length) return { x: b.x + U.rand(-3, 3), y: b.y + U.rand(-3, 3) };
  const p = U.wpick(P.map(q => [q, PART_W[q.kind] * (b.kind === 'airport' && q.kind === 'terminal' ? 1.5 : 1)]));
  if (p.kind === 'runway') { const f = U.rand(0.15, 0.85); return { x: p.a.x + (p.b.x - p.a.x) * f, y: p.a.y + (p.b.y - p.a.y) * f }; }
  return { x: p.x + U.rand(-0.1, 0.1), y: p.y + U.rand(-0.1, 0.1) };
}
const fighters = (S, b) => S.roster.filter(r => r.base === b.id && r.st !== 'lost').length;
IC.mainBase = S => S.byId.ab_fwd || S.infra.find(i => i.kind === 'airbase');
function setTargets(S, set) {
  const E = S.enemy, L = [];
  const add = (ref, x, y, name, w, only) => { if (w > 0) L.push({ ref, x, y, name, w, set, only }); };
  const ours = S.infra.filter(i => i.owner === 'us' && !i.offline);
  if (set === 'city') {
    // homes are for later: before the campaign the commander goes for the power, not the people
    for (const c of ours) if (c.kind === 'city') add(c, c.x, c.y, c.name, Math.sqrt(c.pop) * 0.25 * (E.act <= 1 ? 0 : E.act <= 3 ? 0.25 : 1));
    // a power station is worth the people it keeps in light
    for (const p of ours) if (p.kind === 'power') add(p, p.x, p.y, p.name, (5 + IC.cities(S).filter(c => c.plant === p.id).reduce((s, c) => s + c.pop, 0) / 150) * (E.act <= 1 ? 0.4 : 1));
  } else if (set === 'transport') {
    for (const b of ours) if (b.kind === 'bridge' && b.home) add(b, b.x, b.y, b.name, (b.cls === 'hw' ? 7 : b.cls === 'rd' ? 4 : 1.5) * (IC.hostileBorderDist(b.x, b.y) < 3000 ? 1.5 : 1));
    for (const k of E.known.values()) if (k.kind === 'depot' && !k.ref.dead) add(k.ref, k.x, k.y, k.ref.name, k.ref.central ? 9 : 12);
    for (const c of E.convoys.values()) add(c.ref, c.x, c.y, c.ref.name, 5);
  } else if (set === 'trade') {
    for (const a of ours) if (a.kind === 'airport' && a.parts) add(a, a.x, a.y, a.name, 8 + (a.svc ? Math.min(12, a.svc.deps / 25) : 0));
    for (const f of ours) if (f.kind === 'factory') add(f, f.x, f.y, f.name, 9);
  } else if (set === 'fuel') {
    for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && b.parts.some(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.3)) add(b, b.x, b.y, `the fuel farm at ${b.name}`, b.kind === 'airbase' ? 9 + fighters(S, b) : 7, ['fuel']);
  } else if (set === 'ad') {
    for (const k of E.known.values()) {
      if (k.ref.dead || k.kind === 'depot' || k.kind === 'launcher') continue;
      const w = { sam: 12, radar: 10, pointdef: 3, jammer: 5 }[k.kind] || 0;
      // an old fix is worth less: the unit may have moved; one seen firing a lot may be short of missiles
      add(k.ref, k.x, k.y, k.ref.name, w * (S.time - k.t > 7200 ? 0.5 : 1) * (1 + (E.act >= 4 ? 4 : 1.5) * (1 - guessFill(S, k))));
    }
  } else if (set === 'airbase') {
    for (const b of ours) if (b.kind === 'airbase' && b.parts) add(b, b.x, b.y, b.name, 8 + fighters(S, b) * 2, ['runway', 'has', 'hangar', 'alert', 'fuel', 'ammo', 'tower']);
  } else if (set === 'command') {
    const cap = IC.cap(S);
    if (cap) add(cap, cap.x, cap.y, `the government quarter of ${cap.name}`, 10);
  }
  return L;
}
IC.enemyTargets = setTargets;
/* the old purposes, for what still asks by them */
const PURPOSE = { ad: 'ad', industry: 'trade', terror: 'city', logistics: 'transport', airbase: 'airbase', emit: 'ad', convoy: 'transport', bal: 'airbase' };
function targets(S, purpose) {
  const L = setTargets(S, PURPOSE[purpose] || purpose);
  if (purpose === 'emit') return L.filter(t => t.ref.radarOn && !t.ref.dead);
  if (purpose === 'convoy') return L.filter(t => S.vehicles.includes(t.ref));
  return L;
}
function pickTarget(S, purpose) { const L = targets(S, purpose); return L.length ? U.wpick(L.map(t => [t, t.w])) : null; }
/* an aim point on the objective: the government quarter of a capital is its core blocks */
function aimOn(obj) {
  const r = obj.ref;
  if (r && r.parts) return aimAtBase(r, obj.only);
  if (r && r.capital && obj.set === 'command') { const b = U.pick(r.blocks.filter(b => b.core && b.hp > 0)); if (b) return { x: b.x, y: b.y }; }
  return { x: obj.x + U.rand(-4, 4), y: obj.y + U.rand(-4, 4) };
}
/* how full the enemy thinks one of our batteries is: it counts the interceptors it has seen it fire in the last
   four hours against what that kind of battery carries, and assumes it is refilled after that */
function guessFill(S, k) {
  const d = IC.UNITS[k.type];
  if (!d || !d.mags || !k.shots) return 1;
  const cap = d.mags.reduce((s, m) => s + m.mag + m.store, 0);
  k.shots = k.shots.filter(t => S.time - t < 14400);
  return cap ? U.clamp(1 - k.shots.length / cap, 0, 1) : 1;
}
IC.enemyGuessFill = (S, u) => { const k = S.enemy.known.get(u.id); return k ? guessFill(S, k) : null; };

/* ---------- route planning with a memory of where it hurts ----------
   Low fliers plan around the radars and batteries the enemy knows about: a radar only sees a cruise missile out to
   its horizon, and not behind a hill, so the cheapest route is the one through the hole in our cover. Routes are
   planned once a wave and shared, so a wave flies one lane. */
const cell = (x, y) => Math.floor(x / 900) + ':' + Math.floor(y / 900);
function threatSites(S, low) {
  const L = [];
  for (const k of S.enemy.known.values()) {
    if (k.ref.dead) continue;
    const d = IC.UNITS[k.type], sn = d && (d.sensor || d.fc);
    if (k.kind === 'radar' && sn && !sn.passive && !sn.bmdOnly && !sn.rktOnly && !sn.ssr) {
      const R = low ? Math.min(sn.R, U.horizon(sn.mast || 10, 0.06)) : sn.R * 0.6;
      L.push({ x: k.x, y: k.y, R, mast: sn.mast || 10, w: low ? 1 : 0.3 });
    } else if (k.kind === 'sam' || k.kind === 'pointdef') {
      const R = k.rng || 120;
      L.push({ x: k.x, y: k.y, R: low && sn ? Math.min(R, U.horizon(sn.mast || 5, 0.06)) : R, mast: sn ? sn.mast || 5 : 5, w: low ? 0.8 : 1 });
    }
  }
  return L;
}
function exposure(S, pts, low, sites) {
  let e = 0;
  const L = sites || threatSites(S, low);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.ceil(U.dist(a, b) / 150);
    for (let s = 0; s <= n; s++) {
      const x = a.x + (b.x - a.x) * s / n, y = a.y + (b.y - a.y) * s / n;
      for (const k of L) if (U.dxy(x, y, k.x, k.y) < k.R && (!low || IC.losClear(k.x, k.y, k.mast, x, y, 0.06))) e += k.w;
      e += (S.enemy.danger[cell(x, y)] || 0) * 0.6;
    }
  }
  return e;
}
IC.routeExposure = (S, from, route, low) => exposure(S, [from].concat(route), low);
IC.enemyPlanRoute = (S, from, to, low) => planRoute(S, from, to, low);
function planRoute(S, from, to, low, spread) {
  const E = S.enemy, key = `${Math.round(from.x / 60)},${Math.round(from.y / 60)}>${Math.round(to.x / 60)},${Math.round(to.y / 60)}${low ? 'L' : 'H'}`;
  const C = E.routes || (E.routes = new Map());
  const hit = C.get(key);
  if (hit && S.time - hit.t < 900) return hit.r.map(p => ({ x: p.x, y: p.y }));
  const sites = threatSites(S, low);
  const nx = -(to.y - from.y), ny = to.x - from.x, NL = Math.hypot(nx, ny) || 1, sp = spread || 2100;
  const via = (f, off) => ({ x: U.clamp(from.x + (to.x - from.x) * f + nx / NL * off, 90, IC.WW - 90), y: U.clamp(from.y + (to.y - from.y) * f + ny / NL * off, 90, IC.WH - 90) });
  const cands = [[]];
  // one turn: a fan of lanes through the defended belt
  for (const f of [0.35, 0.5, 0.65]) for (let o = -sp; o <= sp; o += sp / 6) if (o) cands.push([via(f, o)]);
  // two turns, and for low fliers turns at the lowest ground nearby, so they run along valleys
  for (let k = 0; k < (low ? 10 : 6); k++) {
    const pts = [via(0.33, U.rand(-1, 1) * sp), via(0.67, U.rand(-1, 1) * sp)];
    if (low && k >= 5) for (const p0 of pts) for (let q = 0, h = IC.elevKm(p0.x, p0.y); q < 10; q++) { const a = U.rand(0, 6.28), d = U.rand(60, 300), c = { x: U.clamp(p0.x + Math.cos(a) * d, 90, IC.WW - 90), y: U.clamp(p0.y + Math.sin(a) * d, 90, IC.WH - 90) }, hc = IC.elevKm(c.x, c.y); if (hc < h) { h = hc; p0.x = c.x; p0.y = c.y; } }
    cands.push(pts);
  }
  let best = null, bc = 1e12;
  for (const v of cands) {
    const pts = [from].concat(v, [{ x: to.x, y: to.y }]);
    let len = 0; for (let i = 1; i < pts.length; i++) len += U.dist(pts[i - 1], pts[i]);
    if (len > bc) continue;
    const c = len + exposure(S, pts, low, sites) * 200;
    if (c < bc) { bc = c; best = pts.slice(1); }
  }
  C.set(key, { t: S.time, r: best });
  if (C.size > 200) C.clear();
  return best.map(p => ({ x: p.x, y: p.y }));
}
function routeLen(from, route) { let L = 0, p = from; for (const q of route) { L += U.dist(p, q); p = q; } return L; }
/* a route that comes in by an axis: out to a point on the chosen flank first, then on to the target */
function routeBy(S, from, to, low, spread, via) {
  if (!via) return planRoute(S, from, to, low, spread);
  return planRoute(S, from, via, low, spread).concat(planRoute(S, via, to, low, spread));
}

function newOp(S, type, label, extra) {
  const op = Object.assign({ id: IC.nid('op'), type, label, launched: 0, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time }, extra || {});
  S.enemy.ops.push(op);
  return op;
}
function later(S, dt, name, ...args) { S.enemy.pending.push({ t: S.time + Math.max(0, dt), fn: IC.hfn(name, ...args) }); }
/* a launch or take-off at its time: jit scatters the start; launch 1 counts it for the operation, 2 also sounds it */
IC.H.eSpawn = (S, type, x, y, o, jit, launch) => () => {
  IC.spawnThreat(S, type, x + U.rand(-jit, jit), y + U.rand(-jit, jit), o);
  if (launch) { o.op.launched++; if (launch === 2) IC.sfx && IC.sfx.launch(x, y, 0.8); }
};
function alive(s) { return !s.destroyed && !s.dormant; }
/* stock the commander may spend: while it saves for a big operation, what it has put aside is not for small raids */
const spare = (s, k) => Math.max(0, (s.inv[k] || 0) - (s.hold && s.hold[k] || 0));
function readyTels(S, site) { return S.tels.filter(t => t.site === site && !t.dead && t.state === 'hidden'); }
function standoff(tgt, base, d) {
  for (let f = 0.9; f > 0; f -= 0.05) {
    const x = base.x + (tgt.x - base.x) * f, y = base.y + (tgt.y - base.y) * f;
    if (IC.inHostile(x, y) && IC.hostileBorderDist(x, y) > (d || 370)) return { x, y };
  }
  return { x: base.x, y: base.y };
}
const can = (S, k) => !S.enemy.allow || S.enemy.allow.has(k);

/* ---------- weapons: each returns the flight time so strikes can be timed to land together ---------- */
const W = {
  drones(S, E, obj, n, op, arriveAt, harass, nat) {
    const sites = S.esites.filter(s => s.kind === 'drone' && alive(s) && spare(s, 'owa') >= 1 && (!nat || s.nat === nat));
    if (!sites.length) return 0;
    sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj));
    const s = nat || Math.random() < 0.7 ? sites[0] : U.pick(sites);
    n = Math.min(Math.floor(spare(s, 'owa')), n);
    const nj = !harass && E.escal >= 1.5 ? Math.min(Math.floor(spare(s, 'jdr')), U.randi(0, 3)) : 0;
    s.inv.owa -= n; if (nj) s.inv.jdr -= nj;
    for (let i = 0; i < n + nj; i++) {
      const type = i < n ? 'owa' : 'jdr';
      const aim = aimOn(obj);
      const route = routeBy(S, s, aim, true, harass ? 3000 : 2100, op.via);
      const T = routeLen(s, route) / IC.THR[type].spd;
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-120, 120) : i * U.rand(40, 140), 'eSpawn', S, type, s.x, s.y, { route, aim: route[route.length - 1], target: obj.ref, op, origin: s }, 30, 1);
    }
    return n + nj;
  },
  cm(S, E, obj, n, op, arriveAt, nat) {
    const cms = s => spare(s, 'lacm') + spare(s, 'scm') + spare(s, 'mcm');
    const sites = S.esites.filter(s => s.kind === 'cm' && alive(s) && (!nat || s.nat === nat) && cms(s) >= 1);
    if (!sites.length) return 0;
    const s = sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
    n = Math.min(Math.floor(cms(s)), n);
    for (let i = 0; i < n; i++) {
      let type = 'lacm';
      if (spare(s, 'scm') >= 1 && Math.random() < 0.5) type = 'scm';
      else if (spare(s, 'mcm') >= 1 && E.escal >= 1.5) type = 'mcm';
      else if (spare(s, 'lacm') < 1) type = spare(s, 'scm') >= 1 ? 'scm' : 'mcm';
      s.inv[type]--;
      const from = { x: s.x + U.rand(-40, 40), y: s.y + U.rand(-40, 40) };
      const aim = aimOn(obj);
      const route = type === 'scm' && !op.via ? [aim] : routeBy(S, from, aim, true, 2100, op.via);
      const T = routeLen(from, route) / IC.THR[type].spd;
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-40, 40) : i * 30, 'eSpawn', S, type, from.x, from.y, { route, aim, target: obj.ref, op, origin: s }, 0, 2);
    }
    return n;
  },
  bal(S, E, obj, n, op, arriveAt, mrbm) {
    const kind = mrbm ? 'mrbm' : 'bm';
    const bms = s => spare(s, 'srbm') + spare(s, 'marv') + spare(s, 'mrbm');
    const sites = S.esites.filter(s => s.kind === kind && alive(s) && readyTels(S, s).length && bms(s) >= 1);
    if (!sites.length) return 0;
    const s = sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
    const tels = readyTels(S, s);
    let left = Math.min(n, tels.length * 2, Math.floor(bms(s)));
    let fired = 0;
    for (const tel of tels) {
      if (left <= 0) break;
      const k = Math.min(mrbm ? 1 : 2, left); left -= k;
      const aims = [];
      for (let i = 0; i < k; i++) {
        const type = mrbm ? 'mrbm' : spare(s, 'marv') >= 1 && E.escal >= 2 ? 'marv' : spare(s, 'srbm') >= 1 ? 'srbm' : 'marv';
        s.inv[type]--;
        const a = aimOn(obj);
        const pens = mrbm && E.escal >= 1.5 ? Math.min(Math.floor(spare(s, 'pen')), 3) : 0;
        if (pens) s.inv.pen -= pens;
        aims.push({ type, x: a.x, y: a.y, ref: obj.ref, pens });
        fired++;
      }
      const lp = tel.staged ? { x: tel.x, y: tel.y } : launchPoint(S, tel.site, obj);
      const T = U.dist(lp, obj) / IC.THR[mrbm ? 'mrbm' : 'srbm'].vAvg + 40;
      const moveT = U.dist(tel, lp) / 0.14 + 700;
      tel.mission = { aims, op, fireAt: arriveAt ? arriveAt - T : 0 };
      tel.state = 'moving'; tel.route = [lp];
      if (arriveAt && S.time + moveT > arriveAt - T) tel.mission.fireAt = 0;
    }
    return fired;
  },
  sead(S, E, obj, op, arriveAt) {
    const bases = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.sead >= 2);
    const em = targets(S, 'emit').filter(t => U.dist(t, obj) < 2600);
    if (!bases.length || !em.length) return 0;
    const b = bases.sort((a, c) => U.dist(a, obj) - U.dist(c, obj))[0];
    if (b.acAvail.ewj >= 1) {
      b.acAvail.ewj--;
      const st = standoff(obj, b);
      IC.spawnThreat(S, 'ewj', b.x, b.y, { home: b, mission: 'jam', route: [st], st, jamT: 3600, jamming: true, op });
    }
    // the radar the raid is after if it is radiating, else the most valuable one
    const tgt = em.find(t => t.ref === obj.ref) || U.wpick(em.map(t => [t, t.w]));
    const dir = Math.atan2(tgt.y - b.y, tgt.x - b.x);
    const lp = { x: tgt.x - Math.cos(dir) * 1200, y: tgt.y - Math.sin(dir) * 1200 };
    const T = U.dist(b, lp) / IC.THR.sead.spd + 500;
    for (let i = 0; i < 2; i++) {
      b.acAvail.sead--;
      later(S, arriveAt ? arriveAt - S.time - T - 300 : i * 30, 'eSpawn', S, 'sead', b.x, b.y, { home: b, mission: 'sead', route: [{ x: lp.x + i * 60, y: lp.y }], arms: 2, op, dcy: E.escal >= 1 ? 2 : 0, tgt }, 0, 0);
    }
    return 2;
  },
  bomber(S, E, obj, op, arriveAt) {
    const b = S.esites.find(s => s.kind === 'airbase' && alive(s) && (s.acAvail.bmr || 0) >= 1);
    if (!b) return 0;
    b.acAvail.bmr--;
    const st = standoff(obj, b, 500);
    const T = U.dist(b, st) / IC.THR.bmr.spd + U.dist(st, obj) / 2.4;
    later(S, arriveAt ? arriveAt - S.time - T : 0, 'eSpawn', S, 'bmr', b.x, b.y, { home: b, mission: 'bomber', route: [st], load: E.escal >= 2 ? 6 : 4, tgt: obj, op }, 0, 0);
    return 1;
  },
  /* a bomber posing as an airliner: it flies a real airway with a civil squawk, then turns off to launch */
  disguise(S, E, obj, op) {
    const b = S.esites.find(s => s.kind === 'airbase' && alive(s) && (s.acAvail.bmr || 0) >= 1);
    if (!b) return 0;
    const ways = S.world.airways.filter(w => (w.kind === 'over' || w.kind === 'intl' || w.kind === 'long') && IC.crossesHome(w));
    if (!ways.length) return 0;
    const w = ways.sort((p, q) => U.segDist(obj.x, obj.y, p.a.x, p.a.y, p.b.x, p.b.y) - U.segDist(obj.x, obj.y, q.a.x, q.a.y, q.b.x, q.b.y))[0];
    const fwd = U.dist(w.a, obj) > U.dist(w.b, obj);
    const a = fwd ? w.a : w.b, z = fwd ? w.b : w.a;
    // leave the airway where it passes closest to the objective, short of it
    let best = null, bd = 1e9;
    for (let i = 1; i < 20; i++) { const p = { x: a.x + (z.x - a.x) * i / 20, y: a.y + (z.y - a.y) * i / 20 }; const d = Math.abs(U.dist(p, obj) - 1300); if (d < bd) { bd = d; best = p; } }
    b.acAvail.bmr--;
    const lp = { x: best.x + (obj.x - best.x) * 0.25, y: best.y + (obj.y - best.y) * 0.25 };
    const cs = `${U.pick(IC.NAMES.airline)} ${U.randi(100, 989)}`;
    IC.spawnThreat(S, 'bmr', a.x, a.y, { home: b, mission: 'bomber', route: [best, lp], load: 4, tgt: obj, op, disguise: true, cs, sq: IC.squawk(), plan: { a, b: z, cs }, spd: 2.3, alt: 11, radarOn: false, fromHostile: false });
    op.launched++;
    return 1;
  },
  low(S, E, obj, op, arriveAt) {
    const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.str >= 2).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
    if (!b) return 0;
    const rp = planRoute(S, b, obj, true, 1500);
    const last = rp[rp.length - 1];
    const dir = Math.atan2(last.y - b.y, last.x - b.x);
    rp[rp.length - 1] = { x: obj.x - Math.cos(dir) * 400, y: obj.y - Math.sin(dir) * 400 };
    const T = routeLen(b, rp) / IC.THR.str.spd;
    for (let i = 0; i < 2; i++) {
      b.acAvail.str--;
      later(S, (arriveAt ? arriveAt - S.time - T : 0) + i * 25, 'eSpawn', S, 'str', b.x, b.y, { home: b, mission: 'strike', route: rp.map(p => ({ x: p.x + i * 20, y: p.y })), tgt: Object.assign(aimOn(obj), { ref: obj.ref, name: obj.name }), op, alt: 0.1, low: true, radarOn: false }, 0, 0);
    }
    return 2;
  },
  /* attack helicopters come in low under the radars against targets near the border */
  helis(S, E, obj, op, arriveAt) {
    const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && (s.acAvail.ahe || 0) >= 2).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
    if (!b || IC.hostileBorderDist(obj.x, obj.y) > 1300) return 0;
    const rp = planRoute(S, b, obj, true, 900);
    const last = rp[rp.length - 1], dir = Math.atan2(last.y - b.y, last.x - b.x);
    rp[rp.length - 1] = { x: obj.x - Math.cos(dir) * 60, y: obj.y - Math.sin(dir) * 60 };
    const T = routeLen(b, rp) / IC.THR.ahe.spd;
    for (let i = 0; i < 2; i++) {
      b.acAvail.ahe--;
      later(S, (arriveAt ? arriveAt - S.time - T : 0) + i * 30, 'eSpawn', S, 'ahe', b.x, b.y, { home: b, mission: 'strike', route: rp.map(p => ({ x: p.x + i * 12, y: p.y })), tgt: { x: obj.x, y: obj.y, ref: obj.ref, name: obj.name }, op, low: true, radarOn: false }, 0, 1);
    }
    return 2;
  },
  /* decoys fly at the defended target itself, so the batteries round it fire at them (spread wide = spread = 300) */
  decoys(S, E, obj, n, op, arriveAt, spread) {
    const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && spare(s, 'dcy') >= 1).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
    if (!b) return 0;
    n = Math.min(n, Math.floor(spare(b, 'dcy')));
    b.inv.dcy -= n;
    const st = standoff(obj, b, 300), sp = spread || 300;
    for (let i = 0; i < n; i++) {
      const aim = { x: obj.x + U.rand(-sp, sp), y: obj.y + U.rand(-sp, sp) };
      const T = U.dist(st, aim) / IC.THR.dcy.spd;
      later(S, arriveAt ? arriveAt - S.time - T - 200 : i * 20, 'eSpawn', S, 'dcy', st.x, st.y, { route: [aim], aim, op }, 50, 0);
    }
    return n;
  }
};

/* how long the slowest launcher needs to drive out, set up and fly its missile to the target */
function balLead(S, obj, mrbm) {
  const kind = mrbm ? 'mrbm' : 'bm';
  let worst = 0;
  const site = S.esites.filter(s => s.kind === kind && alive(s) && readyTels(S, s).length).sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
  if (!site) return 0;
  const lp = launchPoint(S, site, obj);
  for (const tel of readyTels(S, site)) worst = Math.max(worst, (tel.staged ? 0 : U.dist(tel, lp)) / 0.16 + 700 + U.dist(lp, obj) / IC.THR[mrbm ? 'mrbm' : 'srbm'].vAvg + 40);
  return worst;
}

IC.enemyLead = (S, obj) => Math.max(balLead(S, obj, false), balLead(S, obj, true));
/* scripted scenes: put launchers where they would fire from */
IC.enemyStageTels = function (S, obj) {
  for (const s of S.esites) if ((s.kind === 'bm' || s.kind === 'mrbm') && alive(s)) { const lp = launchPoint(S, s, obj); for (const t of readyTels(S, s)) { t.x = lp.x + U.rand(-40, 40); t.y = lp.y + U.rand(-40, 40); t.staged = true; } }
};

/* ---------- the commander: an agenda, four acts, and raids with a rhythm ----------
   The enemy commander has a war aim (coerce the government, break morale, strangle trade, ground our air power),
   served by target sets, and keeps it for days. The war comes in four acts, paced to the player:
   1. Probing: feints, drones and single missiles at the edges, to see what fires.
   2. Limited strikes on soft targets (a power station, a bridge, a depot) while it saves up missiles.
   3. The shock: one big, surprising operation paid for by that saving, then a lull while it reassesses.
   4. The deliberate campaign against our air power: radars first, then batteries when they run low, then supply,
      then the air base, with raids on the aim's other targets in between.
   Every raid is a cycle the player can read: an intelligence warning, a build-up, the raid (waves timed to arrive
   together), an after-action report, then a calm. The commander writes down what it does and why (E.clog). */
IC.EAIMS = {
  coerce: { name: 'coerce the government', sets: { command: 1, city: 0.6, trade: 0.5, transport: 0.3 }, hint: 'the capital and what the government is judged on' },
  morale: { name: 'break morale', sets: { city: 1, transport: 0.5, command: 0.3, trade: 0.3 }, hint: 'the cities, their power and their people' },
  trade: { name: 'strangle trade', sets: { trade: 1, transport: 0.9, fuel: 0.6, city: 0.3 }, hint: 'airports, factories, bridges and motorways' },
  air: { name: 'ground our air power', sets: { ad: 1, airbase: 0.7, fuel: 0.6, transport: 0.3 }, hint: 'our radars, batteries, air bases and their fuel' }
};
IC.EACTS = {
  1: { name: 'Probing', text: 'Feints, drones and single missiles. They are testing where our cover is and how we react.' },
  2: { name: 'Limited strikes', text: 'Small raids on soft targets: power, bridges, depots. They are learning where our defence is, and holding their big missiles back.' },
  3: { name: 'The shock', text: 'One big, planned strike paid for with the missiles they saved, then a lull while they count what worked.' },
  4: { name: 'The campaign', text: 'No more probing. A planned effort against our air power: radars first, then batteries when they run low, then supply, then the air base.' }
};
// what each act reaches for, before the aim's own weights
const ACT_SETS = {
  // probes feel for our radars and batteries and test the roads and airports; the government is left alone until later
  1: { ad: 1.3, city: 0.5, transport: 0.9, trade: 0.8, fuel: 0.2, airbase: 0.3, command: 0 },
  2: { city: 1.2, transport: 1.2, trade: 1, fuel: 0.9, ad: 0.6, airbase: 0.3, command: 0 },
  3: { city: 1, transport: 1, trade: 1, fuel: 1, ad: 0.8, airbase: 0.5, command: 0.6 },
  4: { city: 1, transport: 1, trade: 1, fuel: 1, ad: 1, airbase: 1, command: 0.8 }
};
/* The pace (game hours). The owner wants the player winning for a good while before the heat is turned up, so the
   measure is time spent winning: after each raid the defence is "winning" if it stopped at least 60% of what came
   and nothing the raid was after was knocked out; hours of war in that state add up in E.winH. The shock needs 8 of
   them and three limited strikes, act 4 needs 16, which at a raid every four hours or so is four raids in a row the
   player won, and never comes before 36 h of war: half of a three-day Quick war. A strong defence stops more and wins sooner, so it also shortens the minimum times
   ([weak, strong]); a weak one never earns the hours and gets the ceilings: act 4 comes at the latest 52 h into the
   war, so a three-day Quick war always sees it. */
IC.EPACE = { winH: 16, shockWinH: 8, act2: [10, 6], act2Max: 16, save: [16, 10], saveMax: 28, limited: 3, lull: [8, 5], act4Min: 36, act4Max: 52, saveH: 12 };
// how much of what is fired a set may take before act 4, and the main air base at any time (with room to spare
// under the owner's 35% and 25%: one raid adds many weapons at once)
const CAP = { set: 0.23, main: 0.2 };
const RAID_NAMES = { probe: 'probing raid', limited: 'limited strike', shock: 'major strike', sead: 'strike on our radars', saturate: 'saturation raid', supply: 'strike on our supply', airbase: 'strike on the air base', pressure: 'combined raid', opening: 'opening strike', retaliation: 'retaliation strike' };
const lerp = (a, b, f) => a + (b - a) * U.clamp(f, 0, 1);
const H = 3600;
function note(S, E, text) { E.clog.push({ t: S.time, act: E.act, text }); if (E.clog.length > 400) E.clog.shift(); }
IC.enemyNote = (S, text) => note(S, S.enemy, text);
/* what our intelligence tells the player: a staff line in a campaign, a log line elsewhere, and the Intel room */
function intel(S, E, text, who, at) {
  E.intel.unshift({ t: S.time, text });
  if (E.intel.length > 30) E.intel.length = 30;
  if (S.camp && IC.say && S.mode !== 'academy' && S.mode !== 'range') IC.say(S, who || 'INT', text);
  else IC.log(S, 'warn', 'INTEL', text, at);
}
/* the defence's record over the last three raids: the share of weapons it stopped */
function strength(E) { const r = E.rec.slice(-3); return r.length ? r.reduce((s, x) => s + x.stop, 0) / r.length : 0.5; }
const strong = E => (strength(E) - 0.4) / 0.5;   // 0 at 40% stopped, 1 at 90%
IC.enemyStrength = S => strength(S.enemy);
const place = (S, p) => IC.nearestPlace(S, p.x, p.y).replace(/^\d+ km \w+ of /, '');

/* ---------- aims ---------- */
function pickAim(E, not) { return U.wpick(Object.entries(E.aims).filter(([k]) => k !== not).map(([k, w]) => [k, w])); }
function switchAim(S, E, why) {
  const was = E.aim; E.aim = pickAim(E, was); E.aimT = S.time; E.aimFail = 0;
  note(S, E, `Changes aim: ${why}. From "${IC.EAIMS[was].name}" to "${IC.EAIMS[E.aim].name}".`);
  intel(S, E, `Intercepts suggest ${S.world.names.A} is changing its aim: less ${IC.EAIMS[was].hint}, more ${IC.EAIMS[E.aim].hint}.`);
}
/* the weight of each target set for the next raid: the aim, the act, what worked, and a spread over what was fired */
function setWeights(S, E, act) {
  const A = IC.EAIMS[E.aim].sets, M = ACT_SETS[act], out = {}, N = E.tallyN;
  // the share a set would have after this raid (about 10 weapons), once enough has been fired to tell
  const share = k => N < 15 ? 0 : N < 30 ? (E.tally[k] || 0) / N : ((E.tally[k] || 0) + 10) / (N + 10);
  for (const k in IC.ESETS) {
    let w = (A[k] || 0.15) * M[k] * E.setW[k];
    const sh = share(k);
    // before enough has been fired to judge a share, still lean against the set hit most so far (a strong defence
    // makes the first raids fail, and without this they all went to the same soft set)
    const early = N < 15 ? ((E.tally[k] || 0) + 2) / (N + 10) : sh;
    if (act < 4 && sh > CAP.set) w = 0; else w *= Math.pow(1 - Math.min(1, early), 3);
    out[k] = w;
  }
  // everything over its share: the one that has taken least
  if (!Object.values(out).some(w => w > 0)) { const k = Object.keys(IC.ESETS).filter(k => M[k] > 0).sort((a, b) => share(a) - share(b))[0]; out[k] = 1; }
  return out;
}
/* how many of our batteries the enemy knows cover a point */
function coverAt(S, p) { let n = 0; for (const k of S.enemy.known.values()) if (!k.ref.dead && (k.kind === 'sam' || k.kind === 'pointdef') && U.dist(k, p) < (k.rng || 120)) n++; return n; }
/* is any of our air defence the enemy knows about within 150 km? */
function nearKnown(S, p) { for (const k of S.enemy.known.values()) if (!k.ref.dead && k.kind !== 'depot' && U.dist(k, p) < 1500) return true; return false; }
/* a target from a set: valuable, not hit again and again, not where the defence keeps winning */
function chooseTarget(S, E, set, o) {
  o = o || {};
  const main = IC.mainBase(S);
  let L = setTargets(S, set).filter(t => !(main && t.ref === main && mainFull(E, main, o.size || (E.act >= 4 ? 25 : 10))));
  if (o.near) L = L.filter(t => U.dist(t, o.near) < o.R);
  // a small raid beyond a drone's reach needs cruise missiles; with few free, it stays within reach
  if (o.probe && spareOf(S, 'cm', ['lacm', 'scm', 'mcm']) < 3) { const R = L.filter(t => droneHours(S, t) <= 4.5); if (R.length) L = R; }
  if (o.filter) L = L.filter(o.filter);
  for (const t of L) {
    const id = t.ref.id || t.name;
    t.w *= 1 / (1 + (E.hitN[id] || 0) * 0.8) * Math.pow(0.45, E.hard[id] || 0);
    // probes and limited strikes stay within easy reach, and test the defence rather than avoid it: a target with a
    // battery or two near it tells them most; a fortress, little
    if (o.probe) { const c = coverAt(S, t); if (droneHours(S, t) > 4.5) t.w *= 0.3; t.w *= Math.exp(-IC.hostileBorderDist(t.x, t.y) / 9000) * (c === 0 ? (nearKnown(S, t) ? 0.5 : 0.12) : c <= 2 ? 2 : 0.8); }
  }
  L.sort((a, b) => b.w - a.w);
  return L.length ? U.wpick(L.slice(0, 12).map(t => [t, t.w])) : null;
}

/* ---------- stockpiling for the shock ----------
   From the start of act 2 the commander puts aside what the missile brigades, cruise missile sites and air bases
   make over IC.EPACE.saveH hours, on top of what they have. Small raids may not touch it. The launchers count too:
   one destroyed is replaced from the factories in about eight hours. Destroying stock (a hit on the site burns
   some) or launchers pushes the shock back; slowing production (a damaged site makes less) does too. */
const SAVE = { srbm: 3, marv: 4, mrbm: 6, pen: 0.5, lacm: 2, scm: 2, mcm: 2.5, dcy: 0.6 };
// what of today's stock stays free for small raids: a third of the cruise missiles and decoys, none of the ballistic
const KEEP = { lacm: 0.35, scm: 0.35, mcm: 0.35, dcy: 0.4 };
IC.TEL_REPLACE = 8 * H;
function startSaving(S, E) {
  E.save = { t0: S.time, nextRep: S.time + U.rand(1.3, 1.8) * H, reps: 0 };
  const held = {};
  for (const s of S.esites) {
    if (!s.regen) continue;
    // want: what the saving is to add; saved: what it has added so far. Small raids may not touch the stock on hand
    // (but for the share in KEEP) nor anything made while saving: hold = base + saved
    s.hold = {}; s.want = {}; s.saved = {}; s.base = {};
    for (const k in SAVE) if (s.regen[k]) {
      s.want[k] = s.regen[k] * IC.EPACE.saveH; s.saved[k] = 0;
      s.hold[k] = s.base[k] = (s.inv[k] || 0) * (1 - (KEEP[k] || 0)); held[k] = (held[k] || 0) + Math.round(s.base[k] + s.want[k]);
    }
  }
  const st = stockState(S);
  note(S, E, `Starts saving for a big operation: holds back ${Object.entries(held).filter(([k]) => SAVE[k] >= 2).map(([k, n]) => `${n} ${IC.THR[k].code}`).join(', ')}, and will not fire them before then. At today's production, ready in about ${Math.round(st.eta / H)} h.`);
}
/* how far the saving has come: what has been added since it began, against what it wants to add (stock lost to our
   strikes counts against it), and launchers lost against their replacements */
function stockState(S) {
  let have = 0, need = 0, eta = 0;
  for (const s of S.esites) if (s.want) for (const k in s.want) {
    const w = s.want[k], v = SAVE[k] || 0, got = Math.min(s.saved[k], w); if (!v || !w) continue;
    have += got * v; need += w * v;
    const rate = s.destroyed ? 0 : (s.regen[k] || 0) * s.hp / s.max;
    if (got < w) eta = Math.max(eta, rate > 0 ? (w - got) / rate * H : 99 * H);
  }
  for (const s of S.esites) if (s.telMax && s.kind !== 'rkt') {
    const n = S.tels.filter(t => t.site === s && !t.dead).length;
    have -= (s.telMax - n) * 8;
    if (n < s.telMax) eta = Math.max(eta, (s.telQ[s.telMax - n - 1] || S.time + IC.TEL_REPLACE) - S.time);
  }
  return { f: need ? U.clamp(have / need, 0, 1) : 1, eta: Math.min(eta, 99 * H) };
}
IC.enemyStock = S => stockState(S);
/* when intelligence expects the stockpile to be ready: in hours with Passive ESM or satellite warning, roughly without */
IC.enemyStockWhen = S => {
  const h = stockState(S).eta / H;
  return IC.hasTech(S, 's_sat') || IC.hasTech(S, 's_esm') ? `in about ${Math.max(1, Math.round(h))} h` : h < 6 ? 'within hours' : h < 16 ? 'in half a day or so' : 'in a day or more';
};
function stopSaving(S) { for (const s of S.esites) { s.hold = null; s.want = null; s.saved = null; } }
/* what intelligence sees of the saving: less firing, stocks at named sites growing */
function stockReport(S, E) {
  const st = stockState(S), sharp = IC.hasTech(S, 's_sat') || IC.hasTech(S, 's_esm');
  const sites = S.esites.filter(s => s.hold && (s.kind === 'bm' || s.kind === 'cm' || s.kind === 'mrbm') && !s.destroyed);
  for (const s of sites) s.pk = Math.max(s.pk, 1);
  const names = sites.slice(0, 3).map(s => s.name).join(', ');
  const h = st.eta / H, when = IC.enemyStockWhen(S);
  if (st.f >= 0.97 && E.save.readyTold) return;
  if (st.f >= 0.97) { E.save.readyTold = true; intel(S, E, `The stockpile looks complete. They are waiting for a moment of their choosing: expect something very large at any time, probably at night.`); note(S, E, 'Stockpile complete; waits for the right moment.'); return; }
  const how = st.f > 0.9 ? 'They look nearly ready' : `They have put aside ${sharp ? U.pct(st.f) : st.f > 0.6 ? 'about two thirds' : st.f > 0.35 ? 'about half' : st.f > 0.15 ? 'about a third' : 'a little'} of what they seem to want`;
  E.save.reps++;
  if (E.save.reps === 1) intel(S, E, `Satellite pictures: ${S.world.names.A}'s ballistic and cruise missiles have stopped flying, though they have them. ${names} are filling up: they are saving for something big. ${how}; ready ${when}. Strikes on those sites, or on their launchers, would set it back.`);
  else intel(S, E, `The stockpile: ${how.toLowerCase()}, ready ${when}.${sharp ? '' : ' (Passive ESM or satellite warning would tell us more precisely.)'}`);
  note(S, E, `Stockpile at ${U.pct(st.f)}; ready in about ${Math.round(h)} h.`);
}

/* ---------- acts ---------- */
function startAct(S, E, n, why) {
  if (E.act >= n) return;
  E.act = n; E.actT = S.time;
  note(S, E, `Act ${n}, ${IC.EACTS[n].name.toLowerCase()}: ${why}.`);
  if (n === 2) {
    startSaving(S, E);
    intel(S, E, `${S.world.names.A} has moved from probing to limited strikes: expect small raids on ${IC.EAIMS[E.aim].hint}. They are watching where we fire from.`);
  } else if (n === 4) {
    const b = baseFor(S, E);
    E.c4 = { base: b, i: 0, steps: ['sead', 'saturate', 'pressure', 'supply', 'airbase', 'pressure'] };
    note(S, E, `The campaign: first the radars round ${b ? b.name : 'our bases'}, then the batteries when they run low, then their supply, then the base itself.`);
    intel(S, E, `Jammers and radar-hunting aircraft are moving to forward fields. ${S.world.names.A} is done probing: expect them to go after our radars first, then the batteries${b ? ` round ${b.name}` : ''}, then its supply and the base itself. Radars that go silent between raids, spare missiles close by, and shelters will count.`);
    intel(S, E, `We have taken their best punch and held. They will now try to take our air force apart, methodically.`, 'PM');
  }
  IC.emit(S, 'enemyAct', { act: n, name: IC.EACTS[n].name, text: IC.EACTS[n].text });
}
IC.enemyStartAct = (S, n, why) => startAct(S, S.enemy, n, why || 'forced');
/* would a raid of n more weapons on the main air base take it past its share? (the first raids are let through) */
function mainFull(E, main, n) { return E.tallyAllN >= 15 && ((E.tallyRef[main.id] || 0) + n) / (E.tallyAllN + n) > CAP.main; }
/* the air base the campaign goes after: the one with most of our fighters, unless it has taken its share */
function baseFor(S, E) {
  const main = IC.mainBase(S), tooMuch = main && mainFull(E, main, 35);
  const L = S.infra.filter(b => b.kind === 'airbase' && b.owner === 'us' && b.parts && !(tooMuch && b === main));
  return L.sort((a, b) => fighters(S, b) * (b === main ? 1.5 : 1) - fighters(S, a) * (a === main ? 1.5 : 1))[0] || null;
}
/* move the acts along: called before each raid is planned */
function pace(S, E) {
  const warH = (S.time - E.warT) / H, inAct = (S.time - E.actT) / H, f = strong(E);
  if (E.act === 1 && ((E.rec.length >= 2 && inAct >= lerp(IC.EPACE.act2[0], IC.EPACE.act2[1], f) - E.head) || inAct >= IC.EPACE.act2Max - E.head))
    startAct(S, E, 2, `${E.rec.length} probes, ${U.pct(strength(E))} of them stopped: now limited strikes, and saving for a big one`);
  if (E.act === 3 && S.time >= (E.lullEnd || 0) && warH >= IC.EPACE.act4Min && (E.winH >= IC.EPACE.winH || warH >= IC.EPACE.act4Max))
    startAct(S, E, 4, E.winH >= IC.EPACE.winH ? `their defence has been winning for ${Math.round(E.winH)} h: time for a real campaign` : `${Math.round(warH)} h into the war: the campaign cannot wait any longer`);
}
/* is the shock ready to go? enough stock, enough time in act 2, and a defence that has had its time winning */
function shockReady(S, E) {
  if (E.act !== 2 || !E.save) return false;
  const inAct = (S.time - E.actT) / H, st = stockState(S);
  if (inAct >= 40) return st.f >= 0.4;
  if (inAct >= IC.EPACE.saveMax) return st.f >= 0.7;
  const limited = E.rec.filter(r => r.t > E.actT).length;
  return st.f >= 0.97 && limited >= IC.EPACE.limited && inAct >= lerp(IC.EPACE.save[0], IC.EPACE.save[1], strong(E)) && E.winH >= IC.EPACE.shockWinH;
}

/* ---------- planning a raid ---------- */
/* fighters dash at the border and turn away: our radars and batteries light up for nothing */
function feint(S, E, obj) {
  const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.ftr >= 2).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
  if (!b) return;
  const st = standoff(obj, b, 120);
  for (let i = 0; i < 2; i++) { b.acAvail.ftr--; IC.spawnThreat(S, 'ftr', b.x, b.y, { home: b, mission: 'feint', route: [{ x: st.x + i * 40, y: st.y }], feint: true }); }
  newOp(S, 'feint', 'fighters feint at the border');
}
/* how many a kind of weapon is available right now for small raids */
const spareOf = (S, kind, ks) => S.esites.filter(s => s.kind === kind && alive(s)).reduce((n, s) => n + ks.reduce((m, k) => m + spare(s, k), 0), 0);
/* what goes into a raid: packets of weapons, each with its time against the peak T */
function mixFor(S, E, kind, obj) {
  const r = (a, b) => U.randi(a, b), M = [];
  const add = (w, n, at, x) => { if (n > 0) M.push(Object.assign({ w, n, at: at || 0 }, x || {})); };
  const two = S.esites.some(s => s.nat === 'B' && alive(s) && s.kind === 'drone');
  if (kind === 'probe' || kind === 'opening') {
    const set = obj.set;
    if (set === 'ad') { add('harass', r(3, 4), -300); if (Math.random() < 0.5) add('feint', 1); }
    else { add('drones', r(3, 4), -300); if (Math.random() < 0.5) add('cm', r(1, 2)); }
  } else if (kind === 'limited' || kind === 'retaliation') {
    add('drones', r(3, 6), -360);
    add('dcy', r(0, 2), -360);
    add('cm', r(2, 3), 0);
    if (spareOf(S, 'bm', ['srbm', 'marv']) >= 1) add('bal', kind === 'retaliation' ? 3 : r(0, 2), 0);
    add('jam', 1);
    if (Math.random() < 0.35) add('helis', 1);
    add('drones', 1, 480);
  } else if (kind === 'shock') {
    // the saved missiles, shared over the main target and two or three others of different kinds, all at once
    const bal = Math.min(12, Math.floor(spareOf(S, 'bm', ['srbm', 'marv']) * 0.85)), cms = Math.min(20, Math.floor(spareOf(S, 'cm', ['lacm', 'scm', 'mcm']) * 0.85));
    const more = E.shock.more, k = more.length + 1, share = n => Math.max(1, Math.round(n / k));
    const how = E.shock.how, via = how === 'axis' ? { via: 1 } : {};
    if (how === 'soak') { add('dcy', 10, -660, { spread: 40 }); add('drones', 3, -600); }
    else add('dcy', 4, -300);
    // the other targets first: launchers and a site's missiles run out, and the main target should not take them all.
    // Each target's set gets what keeps it near a quarter of all that will have been fired by the end of the shock.
    const N = E.tallyN + bal + cms + 4 * k, left = {};
    for (const t of more.concat([obj])) left[t.set] = Math.max(3, Math.floor(0.25 * N - (E.tally[t.set] || 0)));
    for (const t of more.concat([null])) {
      const tt = t || obj, x = t ? { obj: t, set: t.set } : {}, dm = droneHours(S, tt) <= 5;
      const nb = Math.min(share(bal), left[tt.set]), nc = Math.min(share(cms), left[tt.set] - nb), nd = dm ? Math.min(4, left[tt.set] - nb - nc) : 0;
      left[tt.set] -= nb + nc + nd;
      add('cm', nc, how === 'soak' || !t ? 0 : U.rand(-120, 120), Object.assign({}, x, via)); add('bal', nb, 0, x);
      add('drones', nd, -300, Object.assign({}, x, via));
    }
    add('mrbm', 1, 0); add('jam', 2, 0, via);
    if (how === 'granted') add('low', 1, 0);
    // something taken for granted comes with a small raid on the main base first, to pull our eyes there
    const mb = IC.mainBase(S);
    if (how === 'granted' && mb) add('drones', 4, -1500, { obj: { x: mb.x, y: mb.y, ref: mb, name: mb.name, set: 'airbase' }, set: 'airbase' });
    add('drones', 4, 480);
  } else if (kind === 'sead') {
    add('sead', 1, 0); add('jam', 2, 0); add('dcy', 4, -240, { spread: 100 }); add('drones', r(5, 7), -200, { nat: 'A' });
    if (two) add('drones', r(3, 4), -200, { nat: 'B' });
    add('lm', 1); add('cm', 2, 60);
  } else if (kind === 'saturate') {
    // the first wave draws the battery's ready missiles; the second arrives as it is reloading
    const d = obj.ref && obj.ref.d, reload = d && d.mags && d.mags.length ? Math.max(...d.mags.map(m => m.reload || 120)) : 300;
    add('drones', r(6, 8), -300, { nat: 'A' }); add('dcy', 6, -300, { spread: 30 });
    if (two) add('drones', r(3, 5), -240, { nat: 'B' });
    add('cm', r(5, 7), reload + 60); add('bal', r(2, 4), reload + 60); add('jam', 2, reload);
  } else if (kind === 'supply') {
    add('drones', r(5, 7), -300); add('cm', r(3, 4), 0); add('lm', 1); add('jam', 1, 0);
  } else if (kind === 'airbase') {
    add('dcy', 6, -420, { spread: 60 }); add('drones', r(8, 10), -360, { nat: 'A' });
    if (two) add('drones', r(4, 5), -300, { nat: 'B' });
    add('jam', 2, 0); add('cm', r(5, 7), 0); add('bal', r(4, 5), 0); add('mrbm', 1, 0); add('low', 1, 0); add('bomber', 1, 0); add('helis', 1, -200); add('hgv', 1, 0);
    add('drones', 3, 480);
  } else if (kind === 'pressure') {
    add('drones', r(5, 7), -360, { nat: 'A' }); if (two) add('drones', r(2, 3), -300, { nat: 'B' });
    add('dcy', r(2, 4), -360); add('cm', r(3, 5), 0); add('bal', r(1, 2), 0); add('jam', 1, 0);
    if (Math.random() < 0.4) add('disguise', 1); if (Math.random() < 0.4) add('bomber', 1);
    add('drones', 2, 480);
  }
  return M;
}
/* the shock: which of three ways, and where. Something valuable nobody guards; failing that, an axis our radars do
   not watch; failing that, the best-defended big target, soaked with decoys first */
function planShock(S, E) {
  const L = [];
  // the main target from a set that has taken little so far, so the shock does not make one set the whole war
  const share = k => E.tallyN ? (E.tally[k] || 0) / E.tallyN : 0;
  for (const set of ['city', 'trade', 'fuel', 'command', 'transport']) for (const t of setTargets(S, set)) if (t.w >= 5) { t.w *= Math.pow(1 - share(set), 4); L.push(t); }
  L.sort((a, b) => b.w - a.w);
  const low = [...new Set(L.map(t => t.set))].sort((a, b) => share(a) - share(b)).slice(0, 2);
  const first = L.filter(t => E.tallyN < 20 || low.includes(t.set));
  const bare = L.filter(t => coverAt(S, t) === 0).slice(0, 8);
  const axis = axisPoint(S, E);
  let how, obj;
  const F = first.length ? first : L, bareF = bare.filter(t => first.includes(t));
  if (bareF.length && Math.random() < 0.6) { how = 'granted'; obj = U.pick(bareF.slice(0, 5)); }
  else if (axis && Math.random() < 0.6) { how = 'axis'; obj = U.pick(F.slice(0, 6)); }
  else { how = 'soak'; obj = F.slice(0, 6).sort((a, b) => coverAt(S, b) - coverAt(S, a))[0]; }
  if (!obj) { how = 'soak'; obj = chooseTarget(S, E, 'city'); }
  if (!obj) return null;
  // two or three more of other kinds, the most valuable near the first (within 300 km)
  const more = [], used = new Set([obj.set]);
  const near = t => t.w / (1 + U.dist(t, obj) / 2000);
  for (const lim of [0.25, 0.4]) for (const t of L.filter(t => t !== obj && droneHours(S, t) < 6).sort((a, b) => share(a.set) - share(b.set) || near(b) - near(a))) {
    if (more.length >= 3) break;
    if (used.has(t.set) || (E.tallyN >= 20 && share(t.set) > lim)) continue;
    used.add(t.set); more.push(t);
  }
  E.shock = { how, obj, more, via: how === 'axis' ? axis : null, t: S.time };
  const words = { granted: `${obj.name}, which nothing guards`, axis: `${obj.name}, coming in round the ${axis ? place(S, axis) : 'flank'} where they have seen no radar`, soak: `${obj.name}, the best-guarded big target: decoys and drones first to empty the batteries, then the missiles as they reload` };
  note(S, E, `Plans the shock on ${words[how]}; at the same moment ${more.map(t => t.name).join(', ') || 'nothing else'}. Stockpile at ${U.pct(stockState(S).f)}.`);
  return obj;
}
/* the flank our radars watch least, as the enemy knows them: a point just inside our border */
function axisPoint(S, E) {
  const sites = threatSites(S, true);
  let best = null, bc = 1e9;
  for (const f of S.world.fronts) {
    if (S.world.side && S.world.side[f.key] !== 'hostile') continue;
    if (f.key === 'B' && !S.esites.some(s => s.nat === 'B' && alive(s))) continue;
    for (const p of f.pts) {
      const q = { x: p.x + p.nx * 250, y: p.y + p.ny * 250 };
      let c = 0; for (const k of sites) if (U.dist(k, q) < k.R + 300) c += k.w;
      c += (E.axisN[Math.round(p.x / 3000) + ':' + Math.round(p.y / 3000)] || 0) * 0.5;
      if (c < bc) { bc = c; best = q; }
    }
  }
  return best;
}
/* the start of a cycle: what the next raid is, at what, and when it should peak */
function planRaid(S, E) {
  pace(S, E);
  let kind, obj, why;
  if (E.retaliate > 0 && can(S, 'cm')) {
    E.retaliate = 0; kind = E.act >= 2 ? 'retaliation' : 'probe';
    obj = chooseTarget(S, E, U.pick(E.act <= 2 ? ['city', 'trade', 'transport'] : ['city', 'trade', 'command']), { probe: E.act <= 3 });
    why = 'we struck their territory';
    IC.news(S, `${S.world.names.A} vows retaliation after strikes on its territory.`);
  } else if (shockReady(S, E)) {
    stopSaving(S);
    kind = 'shock'; obj = planShock(S, E); why = `the stockpile is ready (${U.pct(stockState(S).f)})`;
  } else if (E.act === 4) {
    const c = E.c4;
    let step = c.steps[c.i % c.steps.length];
    const near = c.base || IC.mainBase(S);
    // radars first, but only while there are radars to hunt; the base itself when its share allows
    if (step === 'sead' && !chooseTarget(S, E, 'ad', { near, R: 2500, filter: t => t.ref.radarOn })) step = 'saturate';
    if (step === 'airbase') c.base = baseFor(S, E);
    if (step === 'sead') obj = chooseTarget(S, E, 'ad', { near, R: 2500, filter: t => t.ref.radarOn });
    else if (step === 'saturate') { const sam = t => t.ref.d && t.ref.d.weapon === 'sam'; obj = chooseTarget(S, E, 'ad', { near, R: 2500, filter: sam }) || chooseTarget(S, E, 'ad', { filter: sam }); }
    else if (step === 'supply') obj = chooseTarget(S, E, 'transport', { near, R: 3500 }) || chooseTarget(S, E, 'transport');
    else if (step === 'airbase' && c.base) obj = { x: c.base.x, y: c.base.y, ref: c.base, name: c.base.name, set: 'airbase', w: 1, only: ['runway', 'has', 'hangar', 'alert', 'fuel', 'ammo'] };
    if (!obj) { step = 'pressure'; }
    if (step === 'pressure') { const sw = setWeights(S, E, 4); delete sw.airbase; delete sw.ad; const set = U.wpick(Object.entries(sw)); obj = set && chooseTarget(S, E, set); }
    kind = step; c.i++;
    const k = obj && obj.ref && E.known.get(obj.ref.id), gf = k ? guessFill(S, k) : 1;
    why = { sead: 'hunt the radars first', saturate: k && k.kind === 'sam' ? `${obj.name} has fired a lot${gf < 1 ? ` (they guess ${U.pct(gf)} of its missiles left)` : ''}: two waves, the second as it reloads` : '', supply: 'cut what feeds the batteries', airbase: 'the air base, now its cover is thin', pressure: `keep up the pressure: ${IC.EAIMS[E.aim].name}` }[step];
  } else {
    const sw = setWeights(S, E, E.act);
    const set = U.wpick(Object.entries(sw));
    kind = E.act === 1 ? 'probe' : 'limited';
    obj = set && chooseTarget(S, E, set, { probe: E.act <= 3 });
    why = `${IC.EAIMS[E.aim].name}${E.act === 1 ? ': see what fires' : ': a soft target'}`;
  }
  if (!obj) { note(S, E, `Finds nothing worth a ${RAID_NAMES[kind] || 'raid'}; looks again in an hour.`); E.cycle = { phase: 'calm', next: S.time + H }; return; }
  const mix = mixFor(S, E, kind, obj);
  E.plan = { aim: E.aim, label: IC.EAIMS[E.aim].name, set: obj.set, obj, kind, why };
  // T waits for the slowest weapon: launchers driving out, drones that fly for hours
  const usesBal = mix.some(p => p.w === 'bal' || p.w === 'mrbm');
  const bal = usesBal ? Math.max(balLead(S, obj, false), balLead(S, obj, true)) + 300 : 0;
  const dh = mix.some(p => p.w === 'drones' || p.w === 'harass') ? droneHours(S, obj) : 99;
  const drn = dh <= 5 ? dh * H + 600 : 0;
  // cruise missiles (and drones too far away, which become cruise missiles) fly an hour or two to deep targets
  const cmd = S.esites.filter(x => x.kind === 'cm' && alive(x)).reduce((m, x) => Math.min(m, U.dist(x, obj)), 1e9);
  const cmf = cmd < 1e8 && mix.some(p => p.w === 'cm' || ((p.w === 'drones' || p.w === 'harass') && dh > 5)) ? cmd * 1.3 / IC.THR.lacm.spd + 120 : 0;
  // the raid is planned as soon as the last one is over, but nothing flies for the first 90 minutes of the calm
  let T = S.time + Math.max(E.calm || 0, U.rand(4800, 6600), Math.min(7200, bal), 5400 + Math.max(drn, cmf) + 300, 8400);
  E.calm = 0;
  // drone probes and the shock come at night when the night is not too far off
  // the shock comes at night when the night is not too far off
  if (kind === 'shock' && E.shock.how !== 'soak') { const h = ((T % 86400) / H), wait = h >= 21 || h < 4 ? 0 : (21 - h) * H + U.rand(0, 5400); if (wait > 0 && wait < 9 * H) T += wait; }
  const R = { id: ++E.raidN, kind, name: RAID_NAMES[kind], obj, set: obj.set, P: E.plan, T, t0: S.time, ops: [], leaks: [], launched: 0, act: E.act, mix, why, via: kind === 'shock' && E.shock.via };
  E.raid = R;
  E.mood = `preparing a ${R.name}`;
  note(S, E, `Plans raid ${R.id}, a ${R.name} on ${obj.name} (${IC.ESETS[obj.set].name}) for ${U.hhmm(T)}: ${why}. ${mix.map(p => `${p.n > 1 ? p.n + ' ' : ''}${p.w}`).join(', ')}.`);
  // the build-up: things the player can see coming
  const sharp = IC.hasTech(S, 's_esm') || IC.hasTech(S, 's_sat');
  later(S, Math.max(0, T - S.time - U.rand(3600, 4800)), 'eRaidWarn', S, R, sharp);
  later(S, T - S.time - U.rand(2700, 3300), 'eRecon', S, R);
  if (kind !== 'probe') later(S, T - S.time - U.rand(2000, 2600), 'eProbe', S, R);
  if (kind !== 'probe' && kind !== 'opening') later(S, T - S.time - U.rand(2300, 2700), 'eJammer', S, R.obj, R);
  R.fired0 = S.stats.fired;
  launchRaid(S, E, R);
  E.cycle = { phase: 'buildup', next: T, R };
}
IC.enemyPlanRaid = S => planRaid(S, S.enemy);
/* the build-up before a raid: a warning, reconnaissance, a probe, a jammer */
IC.H.eRaidWarn = (S, R, sharp) => () => {
  const obj = R.obj, where = sharp ? `, most likely against ${obj.name}` : ` towards ${place(S, obj)}`;
  const when = Math.round((R.T - S.time) / 900) * 15;
  R.warned = true;
  const what = R.kind === 'shock' ? 'something very large, bigger than anything so far' : `a ${R.name}`;
  IC.log(S, 'warn', 'INTEL', `Signals intelligence: ${S.world.names.A} is preparing ${what}${where}. Expect it in about ${when} minutes.`, sharp ? obj : null);
  IC.emit(S, 'raidWarning', { R, sharp, when });
};
IC.H.eRecon = (S, R) => () => { const obj = R.obj; if (can(S, 'recon') && R.kind !== 'probe') OPS.recon(S, S.enemy, { x: obj.x + U.rand(-250, 250), y: obj.y + U.rand(-250, 250) }); };
IC.H.eProbe = (S, R) => () => {
  const E = S.enemy, obj = R.obj;
  const op = newOp(S, 'probe', `drones probing towards ${obj.name}`, { raid: R, set: obj.set });
  if (can(S, 'drones') && Math.random() < 0.7) W.drones(S, E, obj, U.randi(1, 2), op, 0, true); else feint(S, E, obj);
  if (can(S, 'rkt') && E.act >= 2 && Math.random() < 0.3) { const o = OPS.rkt(S, E); if (o) o.set = 'city'; }
};
IC.H.eJammer = (S, obj, R) => () => standoffJammer(S, S.enemy, obj, R);
/* a stand-off jammer flies to a station behind the border and jams along the raid's axis */
function standoffJammer(S, E, obj, R) {
  if (!can(S, 'sead') && !can(S, 'jam')) return 0;
  const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && (s.acAvail.ewj || 0) >= 1).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
  if (!b) return 0;
  b.acAvail.ewj--;
  const st = standoff(obj, b);
  IC.spawnThreat(S, 'ewj', b.x, b.y, { home: b, mission: 'jam', route: [st], st, jamT: Math.max(1800, R.T - S.time + 2400), jamming: true, op: newOp(S, 'jam', `stand-off jamming towards ${obj.name}`, { raid: R }) });
  return 1;
}
/* escort jammer drones fly the cruise missiles' lane and jam the radars ahead of them */
function escorts(S, E, obj, n, op, arriveAt) {
  const s = S.esites.filter(x => (x.kind === 'cm' || x.kind === 'drone') && alive(x)).sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
  if (!s) return 0;
  for (let i = 0; i < n; i++) {
    const from = { x: s.x + U.rand(-40, 40), y: s.y + U.rand(-40, 40) };
    const route = routeBy(S, s, { x: obj.x, y: obj.y }, true, 2100, op.via);
    const T = routeLen(from, route) / IC.THR.esj.spd;
    later(S, arriveAt - S.time - T - 120 + i * 40, 'eSpawn', S, 'esj', from.x, from.y, { route: route.map(p => ({ x: p.x + U.rand(-15, 15), y: p.y + U.rand(-15, 15) })), aim: route[route.length - 1], jamming: true, op, origin: s }, 0, 0);
  }
  return 0;
}
function droneHours(S, obj, nat) { const d = S.esites.filter(x => x.kind === 'drone' && alive(x) && (!nat || x.nat === nat)).reduce((m, x) => Math.min(m, U.dist(x, obj)), 1e9); return d * 1.3 / IC.THR.owa.spd / H; }
const CAN = { drones: 'drones', harass: 'drones', cm: 'cm', bal: 'bal', mrbm: 'mrbm', dcy: 'dcy', sead: 'sead', jam: 'jam', bomber: 'bomber', low: 'low', helis: 'helis', lm: 'lm', feint: 'drones', rkt: 'rkt', hgv: 'hgv', disguise: 'disguise' };
/* packets that go when the raid goes, not when it is planned */
IC.H.eDisguise = (S, obj, o) => () => W.disguise(S, S.enemy, obj, o);
IC.H.eFeint = (S, obj) => () => feint(S, S.enemy, obj);
IC.H.eLm = (S, obj, R) => () => { const x = OPS.lm(S, S.enemy, obj); if (x) x.set = R.set; };
IC.H.eHgv = (S, obj, R) => () => { const x = OPS.hgv(S, S.enemy, obj); if (x) { x.set = R.set; x.raid = R; } };
/* the raid itself: each packet timed on T */
function launchRaid(S, E, R) {
  const op = newOp(S, 'strike', `${R.name} on ${R.obj.name}`, { raid: R, obj: R.obj.ref, arriveAt: R.T, set: R.set });
  const opVia = R.via ? newOp(S, 'strike', `${R.name} on ${R.obj.name}`, { raid: R, obj: R.obj.ref, arriveAt: R.T, set: R.set, via: R.via }) : op;
  let n = 0;
  for (const p of R.mix) {
    if (!can(S, CAN[p.w])) continue;
    const obj = p.obj || R.obj, T = R.T + p.at, o = p.set ? newOp(S, 'strike', `${R.name} on ${obj.name}`, { raid: R, obj: obj.ref, set: p.set, via: p.via ? R.via : null }) : p.via ? opVia : op;
    if (o !== op && o !== opVia) R.ops.push(o);
    // a drone takes hours to cross the country: past five hours' flight, cruise missiles go instead
    let w = p.w;
    if ((w === 'drones' || w === 'harass') && droneHours(S, obj, p.nat) > 5) { w = 'cm'; p.n = Math.ceil(p.n / 3); }
    switch (w) {
      case 'drones': n += W.drones(S, E, obj, Math.round(p.n), o, T, false, p.nat); break;
      case 'harass': n += W.drones(S, E, obj, p.n, o, T, true, p.nat); break;
      case 'cm': n += W.cm(S, E, obj, p.n, o, T, p.nat); break;
      case 'bal': for (let k = 0, left = p.n; k < 3 && left > 0; k++) { const f = W.bal(S, E, obj, left, o, T, false); if (!f) break; left -= f; n += f; } break;
      case 'mrbm': n += W.bal(S, E, obj, p.n, o, T, true); break;
      case 'dcy': n += W.decoys(S, E, obj, p.n, o, T, p.spread); break;
      case 'sead': n += W.sead(S, E, obj, o, T); break;
      case 'jam': escorts(S, E, obj, p.n, o, T); break;
      case 'bomber': n += W.bomber(S, E, obj, o, T); break;
      case 'low': n += W.low(S, E, obj, o, T); break;
      case 'helis': n += W.helis(S, E, obj, o, T); break;
      // these go when the raid goes, not when it is planned (never in the first 90 minutes of the calm)
      case 'disguise': later(S, Math.max(5700, T - S.time - 5400), 'eDisguise', S, obj, o); n++; break;
      case 'feint': later(S, Math.max(0, T - S.time - 1800), 'eFeint', S, obj); break;
      case 'lm': later(S, Math.max(5700, T - S.time - 3600), 'eLm', S, obj, R); n++; break;
      case 'hgv': later(S, Math.max(5700, T - S.time - 300), 'eHgv', S, obj, R); n++; break;
    }
  }
  R.ops.push(op); if (opVia !== op) R.ops.push(opVia);
  R.planned = n;
  if (n) { IC.emit(S, 'enemyStrike', { op, obj: R.obj, R }); if (R.kind !== 'probe' && Math.random() < 0.5) IC.news(S, `Analysts warn ${S.world.names.A} is massing missiles and aircraft for a raid.`); }
  return n;
}
/* the raid is over when nothing it launched is still flying, driving to fire or waiting to launch */
function raidOver(S, R) {
  if (S.time < R.T + 300) return false;
  if (S.enemy.pending.some(p => p.t < R.T + 1200)) return false;
  const mine = o => o && o.raid === R;
  if (S.threats.some(t => !t.dead && mine(t.op) && t.mission !== 'rtb' && t.mission !== 'jam' && t.type !== 'isr')) return false;
  if (S.tels.some(t => t.mission && mine(t.mission.op))) return false;
  return true;
}
/* ---------- after-action report ---------- */
const WORD = { drone: ['drone', 'drones'], cm: ['cruise missile', 'cruise missiles'], bal: ['ballistic missile', 'ballistic missiles'], hgv: ['hypersonic glider', 'hypersonic gliders'], arm: ['anti-radiation missile', 'anti-radiation missiles'], rkt: ['rocket', 'rockets'], air: ['aircraft', 'aircraft'] };
/* why did this one get through? */
function leakWhy(S, t) {
  if (!t.tn) {
    // nobody saw it: which of our radars should have?
    const p = t.entered || t;
    let best = null, bd = 1e9;
    for (const u of S.units) {
      const sn = u.d.sensor || u.d.fc; if (!sn || sn.passive || sn.bmdOnly || sn.rktOnly || sn.ssr) continue;
      const d = U.dist(u, p); if (d < bd && d < U.horizon(sn.mast || 10, 0.06) * 1.3) { bd = d; best = u; }
    }
    if (best && (best.state !== 'ready' || !best.radarOn)) return `nobody saw it: ${best.name} near ${IC.nearestPlace(S, best.x, best.y).replace(/^\d+ km \w+ of /, '')} was ${best.state !== 'ready' ? 'not set up' : best.emcon === 'off' ? 'silent' : 'waiting in ambush'}`;
    if (best) return `nobody saw it: it came in low behind the hills past ${best.name}`;
    return 'nobody saw it: no radar covers that approach low down';
  }
  if (!t.shots) {
    let best = null, bd = 1e9;
    for (const u of S.units) if (u.d.weapon === 'sam' || u.d.weapon === 'gun') { const d = U.dist(u, t); if (d < bd && d < IC.maxRange(S, u) * 1.5) { bd = d; best = u; } }
    return best ? `seen, never engaged: ${best.name} ${IC.engageWhy(S, best, t).charAt(0).toLowerCase() + IC.engageWhy(S, best, t).slice(1)}` : 'seen, never engaged: no battery covers it';
  }
  return `survived ${t.shots} interceptor${t.shots > 1 ? 's' : ''}`;
}
function report(S, E, R) {
  const ops = E.ops.filter(o => o.raid === R);
  const launched = ops.reduce((s, o) => s + o.launched, 0), lost = ops.reduce((s, o) => s + o.lost, 0);
  const leaks = R.leaks.length;
  // group what got through by kind, reason and place
  const g = new Map();
  for (const L of R.leaks) { const key = L.cls + '|' + L.why + '|' + L.place; const e = g.get(key) || { n: 0, cls: L.cls, why: L.why, place: L.place }; e.n++; g.set(key, e); }
  const lines = [...g.values()].sort((a, b) => b.n - a.n).slice(0, 3).map(e => `${e.n} ${WORD[e.cls] ? WORD[e.cls][e.n > 1 ? 1 : 0] : 'weapons'} at ${e.place}: ${e.why}.`);
  const res = { id: R.id, kind: R.kind, name: R.name, obj: R.obj.name, t: S.time, day: U.day(R.T), threats: launched, kills: lost, leaks, hits: R.hits || 0, fired: S.stats.fired - (R.fired0 || 0) };
  (S.raids = S.raids || []).push(res);
  const head = `${launched} threats, ${lost} shot down, ${leaks} got through${R.hits ? ` (${R.hits} hit something)` : ''}. ${res.fired} interceptors fired.`;
  let text = `${head}${lines.length ? ' ' + lines.join(' ') : ''}`;
  text += ` They were after ${R.obj.name}${R.set ? ` (${IC.ESETS[R.set].name})` : ''}.`;
  R.text = text; R.res = res;
  IC.log(S, leaks ? 'warn' : 'kill', 'AFTER-ACTION', `${cap(R.name)} on ${R.obj.name}: ${text}`, R.obj);
  if (S.camp && IC.card) IC.card(S, `After-action · ${cap(R.name)}`, `${R.obj.name} · ${U.clock(S.time, S)}`, text, 'report');
  IC.emit(S, 'raidOver', R);
  // the commander learns what worked
  learn(S, E, R, ops);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/* did the raid get what it came for? */
function achieved(S, R) {
  const r = R.obj.ref;
  if (!r) return false;
  if (r.parts) return R.obj.only && R.obj.only.length === 1 ? !r.parts.some(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25) : !IC.baseStatus(S, r).runway;
  if (r.kind === 'city') return R.set === 'command' ? r.blocks.filter(b => b.core && b.hp <= 0).length >= 2 : (R.hits || 0) >= 3;
  if (r.infra) return !!r.offline || r.hp < r.max * 0.5;
  return !!r.dead;
}
function learn(S, E, R, ops) {
  const r = R.obj.ref, id = r && (r.id || R.obj.name);
  const success = achieved(S, R);
  const launched = ops.reduce((s, o) => s + o.launched, 0), lost = ops.reduce((s, o) => s + o.lost, 0);
  // (decoys shot down count as losses but not as launched)
  const stop = launched ? Math.min(1, lost / launched) : 1, eff = launched ? (R.hits || 0) / launched : 0;
  if (!launched && R.kind !== 'shock') { note(S, E, `Raid ${R.id} on ${R.obj.name} never got off the ground: nothing could reach it.`); return; }
  E.rec.push({ id: R.id, t: S.time, set: R.set, stop: success ? stop * 0.5 : stop, hits: R.hits || 0, success, launched });
  // the defence is winning while it stops most of what comes and keeps what the raids are after
  E.winning = !success && (stop >= 0.6 || (R.hits || 0) <= 1);
  E.history.push({ kind: R.set, success, eff, cost: stop, t: S.time });
  if (id) { E.hitN[id] = (E.hitN[id] || 0) + 1; if (stop >= 0.75 && launched >= 3) E.hard[id] = (E.hard[id] || 0) + 1; }
  for (const k in E.hard) E.hard[k] *= 0.9;
  // a set that keeps failing against a layer that keeps winning is used less; one that works, more
  if (R.set) E.setW[R.set] = U.clamp(E.setW[R.set] * (success ? 1.15 : stop >= 0.75 ? 0.75 : 0.95), 0.3, 2);
  if (R.kind !== 'shock') {
    E.aims[E.aim] = U.clamp(E.aims[E.aim] * (success ? 1.1 : stop >= 0.7 ? 0.85 : 1), 0.2, 3);
    E.aimFail = success ? 0 : (E.aimFail || 0) + 1;
  }
  // methods that got through keep their share; the ones that died on the way are used less
  for (const k in E.method) E.method[k] = U.clamp(E.method[k] * 0.98 + 0.02, 0.2, 1.8);
  for (const o of ops) for (const [type, st] of Object.entries(o.byType || {})) {
    const m = { owa: 'drones', jdr: 'drones', lacm: 'cm', mcm: 'cm', scm: 'cm', srbm: 'bal', marv: 'bal', mrbm: 'bal', sead: 'sead', bmr: 'bomber', str: 'low' }[type];
    if (!m) continue;
    E.method[m] = U.clamp(E.method[m] * (0.85 + (st.n ? st.hit / st.n : 0) * 0.5), 0.3, 1.5);
  }
  note(S, E, `Raid ${R.id} on ${R.obj.name}: ${launched} launched, ${lost} shot down (${U.pct(stop)}), ${R.hits || 0} hits: ${success ? 'got what it came for' : stop >= 0.75 ? 'the defence there keeps winning, avoid it' : 'not enough'}.${E.winning ? ' Their defence is winning.' : ''}`);
  if (success) IC.news(S, `${S.world.names.A} claims its strike on ${R.obj.name} was a success.`);
  else if (launched >= 6 && eff < 0.2) { E.will = Math.max(0, E.will - 1.5); IC.news(S, `Air defences blunt a ${R.name} on ${R.obj.name}.`); }
  // the shock: then a lull while the commander reassesses
  if (R.kind === 'shock') {
    const f = strong(E);
    E.act = 3; E.actT = S.time; E.lullEnd = S.time + lerp(IC.EPACE.lull[0], IC.EPACE.lull[1], f) * H; E.shock.done = S.time; E.shock.res = { launched, lost, hits: R.hits || 0 };
    note(S, E, `Act 3: the shock is spent (${launched} launched, ${R.hits || 0} hits). Reassesses until ${U.hhmm(E.lullEnd)}: no raids, reconnaissance only.`);
    intel(S, E, `After the strike on ${R.obj.name}, ${S.world.names.A}'s channels have gone quiet. They are counting what worked and what did not. When they come back it will be planned: use the time to repair, reload and move.`);
    IC.news(S, success || (R.hits || 0) >= 4 ? `${S.world.names.A} celebrates "the night the sky fell" over ${R.obj.name}.` : `The largest strike of the war largely fails: ${lost} of ${launched} shot down over ${place(S, R.obj)}.`);
    IC.emit(S, 'enemyAct', { act: 3, name: IC.EACTS[3].name, text: IC.EACTS[3].text, R });
  } else if (E.aimFail >= 2 && S.time - (E.aimT || 0) > 12 * H) switchAim(S, E, `${E.aimFail} raids in a row did not get what they came for`);
  else if (S.time - (E.aimT || 0) > 30 * H && Math.random() < 0.3) switchAim(S, E, 'a new plan after days on the old one');
}
/* the calm after a raid: shorter as the war goes on; the lull after the shock is longer */
function calmFor(S, E, R) {
  if (R.kind === 'shock') return E.lullEnd - S.time;
  const h = E.act >= 4 ? U.rand(3, 4) : E.act >= 2 ? U.rand(2.6, 3.8) : U.rand(2.5, 4);
  return h * H;
}
function runCycle(S, E) {
  const C = E.cycle || (E.cycle = { phase: 'calm', next: S.time + 1800 });
  if (C.phase === 'calm') {
    // a retaliation cuts the calm short, but not the lull after the shock
    if (E.retaliate > 0 && S.time > (E.retT || 0) && !(E.act === 3 && S.time < E.lullEnd)) { E.retT = S.time + 5400; C.next = Math.min(C.next, S.time + 900); }
    if (S.time >= C.next) planRaid(S, E);
  } else if (C.phase === 'buildup') {
    if (S.time >= C.next - 900) { E.cycle = { phase: 'raid', next: C.next + 5400, R: C.R }; E.mood = `${C.R.name} on ${C.R.obj.name}`; IC.emit(S, 'raidStart', C.R); }
  } else if (C.phase === 'raid') {
    if (raidOver(S, C.R) || S.time > C.next) {
      report(S, E, C.R);
      E.raid = null;
      E.mood = C.R.kind === 'shock' ? 'reassessing' : 'counting the cost';
      // the next raid is planned now and flies after the calm; after the shock, nothing until the lull is over
      const calm = calmFor(S, E, C.R);
      if (C.R.kind === 'shock') E.cycle = { phase: 'calm', next: S.time + calm, since: S.time, after: C.R };
      else { E.calm = calm; E.cycle = { phase: 'calm', next: S.time, since: S.time, after: C.R }; }
    }
  }
}
IC.raidPhase = S => S.enemy && S.enemy.cycle ? S.enemy.cycle.phase : 'calm';

/* standalone operations: recon, rockets, loitering munitions, close air support, retaliation */
const OPS = {
  recon(S, E, forcedArea) {
    const s = S.esites.find(x => x.kind === 'drone' && alive(x) && x.inv.isr >= 1);
    if (!s) return false;
    s.inv.isr--;
    const pool = S.units.length ? S.units : S.infra;
    const c = forcedArea || U.pick(pool);
    const area = forcedArea || { x: c.x + U.rand(-700, 700), y: c.y + U.rand(-700, 700) };
    newOp(S, 'recon', 'reconnaissance');
    return IC.spawnThreat(S, 'isr', s.x, s.y, { area, phase: 'out', loiterT: U.rand(2400, 4800), home: { x: s.x, y: s.y }, site: s, origin: s });
  },
  lm(S, E, forced) {
    const tgt = forced || pickTarget(S, Math.random() < 0.5 ? 'convoy' : 'ad');
    if (!tgt) return false;
    const s = S.esites.filter(x => x.kind === 'drone' && alive(x) && (x.inv.lm || 0) >= 2).sort((a, b) => U.dist(a, tgt) - U.dist(b, tgt))[0];
    if (!s) return false;
    const n = Math.min(Math.floor(s.inv.lm), U.randi(2, 4));
    s.inv.lm -= n;
    const op = newOp(S, 'lm', `loitering munitions hunting near ${tgt.name}`, { set: tgt.set });
    for (let i = 0; i < n; i++) later(S, i * 60, 'eSpawn', S, 'lm', s.x, s.y, { route: [{ x: tgt.x + U.rand(-120, 120), y: tgt.y + U.rand(-120, 120) }], aim: { x: tgt.x, y: tgt.y }, op, origin: s }, 0, 1);
    return op;
  },
  rkt(S, E, forced) {
    const sites = S.esites.filter(s => s.kind === 'rkt' && alive(s) && s.inv.rkt >= 6 && readyTels(S, s).length);
    if (!sites.length) return false;
    let s = U.pick(sites);
    if (forced) s = sites.sort((a, b) => U.dist(a, forced) - U.dist(b, forced))[0];
    const tel = readyTels(S, s)[0];
    const fp = launchPoint(S, s, forced || null);
    const cands = [];
    if (forced && U.dist(forced, fp) < 790) cands.push(Object.assign({ w: 1 }, forced));
    else {
      for (const i of S.infra) if (!i.offline && i.owner === 'us' && i.kind !== 'bridge' && U.dist(i, fp) < 780) cands.push({ x: i.x, y: i.y, ref: i, name: i.name, w: i.kind === 'city' ? 6 : 4 });
      for (const k of S.enemy.known.values()) if (!k.ref.dead && U.dist(k, fp) < 780) cands.push({ x: k.x, y: k.y, ref: k.ref, name: k.ref.name, w: 8 });
    }
    if (!cands.length) return false;
    const tgt = U.wpick(cands.map(c => [c, c.w]));
    const n = Math.min(Math.floor(s.inv.rkt), U.randi(6, 12));
    s.inv.rkt -= n;
    const op = newOp(S, 'rkt', `rocket salvo at ${tgt.name}`);
    const aims = []; for (let i = 0; i < n; i++) aims.push({ type: 'rkt', x: tgt.x + U.rand(-25, 25), y: tgt.y + U.rand(-25, 25), ref: tgt.ref });
    tel.mission = { aims, op, fireAt: 0 }; tel.state = 'moving'; tel.route = [fp];
    return op;
  },
  hgv(S, E, obj) {
    if (E.escal < 2.5) return false;
    const s = S.esites.find(x => x.kind === 'hgv' && alive(x) && x.inv.hgv >= 1);
    const tgt = obj || pickTarget(S, 'bal');
    if (!s || !tgt) return false;
    s.inv.hgv--;
    const op = newOp(S, 'hgv', `hypersonic strike on ${tgt.name}`);
    const aim = { x: tgt.x, y: tgt.y }, R = U.dist(s, aim);
    IC.spawnThreat(S, 'hgv', s.x, s.y, { x0: s.x, y0: s.y, x1: aim.x, y1: aim.y, T: R / 12, apex: 90, aim, op, vx: (aim.x - s.x) / (R / 12), vy: (aim.y - s.y) / (R / 12), origin: s });
    op.launched++;
    IC.news(S, `Unconfirmed reports of a hypersonic launch from ${S.world.names.A}.`);
    return op;
  }
};

IC.updateTels = function (S, dt) {
  for (const tel of S.tels) {
    if (tel.dead) continue;
    const spd = tel.kind === 'rkt' ? 0.22 : 0.16;
    if (tel.state === 'moving' || tel.state === 'scoot') {
      if (IC.followRoute(tel, dt, spd, spd)) {
        if (tel.state === 'moving') { tel.state = 'setup'; tel.t = tel.kind === 'rkt' ? 300 : 700; }
        else { tel.state = 'reload'; tel.t = tel.kind === 'rkt' ? 3600 : 5400; }
      }
    } else if (tel.state === 'setup') {
      tel.t -= dt; if (tel.t <= 0 && S.time >= (tel.mission.fireAt || 0)) { tel.state = 'firing'; tel.t = 0; }
    } else if (tel.state === 'firing') {
      tel.t -= dt;
      if (tel.t <= 0) {
        const a = tel.mission.aims.shift();
        if (a) {
          tel.t = a.type === 'rkt' ? 6 : 30;
          const th = IC.launchBallistic(S, a.type, tel.x, tel.y, a, { op: tel.mission.op, target: a.ref, src: tel, origin: tel.site });
          th.tr = IC.newTrail(S, 'bal');
          tel.mission.op.launched++;
          IC.part(S, { x: tel.x, y: tel.y, life: 0.4, size: 10, grow: 30, col: '255,190,120', add: true });
          for (let i = 0; i < 5; i++) IC.part(S, { x: tel.x, y: tel.y, vx: U.rand(-10, 10), vy: U.rand(-16, -4), life: U.rand(2, 4), size: U.rand(4, 7), grow: 10, col: '150,150,150', a: 0.4 });
          if (a.pens) for (let i = 0; i < a.pens; i++) IC.launchBallistic(S, 'pen', tel.x, tel.y, { x: a.x + U.rand(-180, 180), y: a.y + U.rand(-180, 180) }, { op: tel.mission.op, src: tel });
          if (a.type !== 'rkt' && IC.hasTech(S, 's_sat')) IC.revealLauncher(S, tel, 'satellite launch detection');
        } else {
          tel.mission = null; tel.state = 'scoot'; tel.staged = false;
          tel.route = [hidePoint(S, tel.site)];
        }
      }
    } else if (tel.state === 'reload') {
      tel.t -= dt; if (tel.t <= 0) tel.state = 'hidden';
    }
  }
};

IC.revealLauncher = function (S, tel, how) {
  if (!tel || !tel.tel) return;
  const moved = !tel.known || U.dxy(tel.kx, tel.ky, tel.x, tel.y) > 60;
  const logIt = moved && S.time - (tel.logT || -1e9) > 900;
  tel.known = true; tel.kx = tel.x; tel.ky = tel.y; tel.kt = S.time;
  tel.site.pk = Math.max(tel.site.pk, 1);
  if (logIt) { tel.logT = S.time; IC.log(S, 'warn', 'LOCATED', `${tel.name} located by ${how}. It will move soon.`, { x: tel.x, y: tel.y }); }
  IC.emit(S, 'located', tel);
};
IC.telDestroyed = function (S, tel, by) {
  tel.dead = true;
  S.stats.telKills++;
  // the factories send a replacement, in about eight hours each
  const q = tel.site.telQ;
  if (q) { q.push(Math.max(S.time, q.length ? q[q.length - 1] : 0) + IC.TEL_REPLACE); note(S, S.enemy, `Lost ${tel.name}; a replacement is due at ${U.hhmm(q[q.length - 1])}.`); }
  IC.log(S, 'kill', 'DESTROYED', `${tel.name} destroyed by ${by}.`, tel);
  IC.news(S, `${S.world.names.H} forces destroy a ${tel.kind === 'rkt' ? 'rocket launcher' : 'missile launcher'} inside ${S.world.names[tel.site.nat]}.`);
  for (const c of IC.cities(S)) c.morale = Math.min(100, c.morale + 2);
  S.stats.siteKills++;
  S.enemy.retaliate = 1;
  S.enemy.will = Math.max(0, S.enemy.will - 1.5);
  IC.addFire(S, tel.x, tel.y, 0.8, 2400);
  IC.emit(S, 'telKill', tel);
};
IC.siteDamaged = function (S, site, dmg, by, quiet) {
  if (site.destroyed) return;
  site.hp -= dmg;
  IC.explode(S, site.x + U.rand(-15, 15), site.y + U.rand(-15, 15), 1.2, 'us');
  IC.impactMark(S, site.x + U.rand(-15, 15), site.y + U.rand(-15, 15), 160);
  if (site.kind === 'supply') site.stock = Math.max(0, site.stock - dmg * 1.5);
  // stock on the site burns with it
  if (site.inv) {
    const k = Math.min(0.6, dmg / site.max * 0.8); let lost = 0;
    for (const m in site.inv) { const n = Math.floor(site.inv[m] * k); site.inv[m] -= n; if (SAVE[m] >= 2) lost += n; if (site.saved && site.saved[m] != null) { site.saved[m] = Math.max(0, site.saved[m] - n); site.base[m] = Math.min(site.base[m], site.inv[m]); site.hold[m] = site.base[m] + site.saved[m]; } }
    if (lost) note(S, S.enemy, `${site.name} hit: ${lost} missiles lost in the fire.`);
  }
  if (site.acAvail && Math.random() < 0.4) { const k = U.pick(Object.keys(site.acAvail).filter(k => site.acAvail[k] > 0)); if (k) { site.acAvail[k]--; site.acMax[k] = Math.max(0, site.acMax[k] - 1); } }
  if (site.hp <= 0) {
    site.hp = 0; site.destroyed = true;
    IC.addFire(S, site.x, site.y, 1.6, 10800);
    IC.log(S, 'kill', 'DESTROYED', `${site.name} destroyed by ${by}.`, site);
    IC.news(S, `${S.world.names.H} strike knocks out ${site.name}.`);
    for (const c of IC.cities(S)) c.morale = Math.min(100, c.morale + 4);
    S.stats.siteKills++;
    S.enemy.will = Math.max(0, S.enemy.will - (site.kind === 'airbase' || site.kind === 'staging' ? 5 : 3));
    IC.emit(S, 'siteKill', site);
  } else if (!quiet) IC.log(S, 'kill', 'HIT', `${site.name} hit by ${by}. Estimated damage ${Math.round(100 - site.hp / site.max * 100)}%.`, site);
  S.enemy.retaliate = 1;
};
IC.enemyAircraftLost = function (S, t) {
  const b = t.home;
  if (b && b.acMax && b.acMax[t.type] > 0) b.acMax[t.type]--;
  S.enemy.will = Math.max(0, S.enemy.will - 0.6);
};

/* ---------- enemy aircraft ----------
   They fly like aircraft: in formation behind a leader, patrols on a racetrack along the border, escorts that stay
   with what they escort and turn on our fighters, a break away when a missile or a fire-control radar locks on
   (and a turn for home after being locked on too often), and fuel: short of it, they go home. */
const EFUEL = { ftr: 9000, str: 9000, sead: 9000, ewj: 21600, bmr: 28800, ahe: 7200 };
const turnRate = t => t.type === 'ahe' ? 0.3 : t.type === 'bmr' || t.type === 'ewj' ? 0.03 : 0.05;   // rad/s
function formLead(S, t) {
  if (!t.op || !t.route || !t.route.length || t.mission === 'rtb' || t.mission === 'patrol' || t.disguise) return null;
  let n = 0;
  for (const o of S.threats) {
    if (o === t) break;
    if (o.dead || o.op !== t.op || o.type !== t.type || o.mission !== t.mission || o.lead || U.dist(o, t) > 250) continue;
    n = S.threats.filter(x => x.lead === o && !x.dead).length;
    t.slot = n + 1;
    return o;
  }
  return null;
}
function lockedOn(S, t) {
  if (t.inbound > 0) return true;
  if (t.fc && t.fcBy.length) return true;
  return false;
}
IC.moveEnemyAir = function (S, t, dt) {
  // gray-zone: fighters that fly alongside one of our airliners to make a point
  if (t.mission === 'shadow') {
    const v = t.shadow;
    t.shT = (t.shT || 0) + dt;
    if (!v || v.dead || t.shT > 1500) { t.mission = 'rtb'; t.route = [{ x: t.home.x, y: t.home.y }]; }
    else if (U.dist(t, v) > 30) t.route = [{ x: v.x + (t.side || 12), y: v.y + 8 }];
    else { t.side = t.side || (Math.random() < 0.5 ? -14 : 14); t.x = v.x - v.vy / (v.spd || 1) * t.side; t.y = v.y + v.vx / (v.spd || 1) * t.side; t.vx = v.vx; t.vy = v.vy; if (IC.inHome(t.x, t.y) && !t.violated) { t.violated = true; IC.emit(S, 'violation', t); } return; }
  }
  // fuel: short of it, home
  if (t.fuel == null) t.fuel = EFUEL[t.type] || 14400;
  t.fuel -= dt;
  if (t.home && t.mission !== 'rtb' && t.mission !== 'shadow' && t.fuel < U.dist(t, t.home) / t.spd * 1.2 + 300) {
    t.mission = 'rtb'; t.jamming = false; t.lead = null; t.route = [{ x: t.home.x, y: t.home.y }];
  }
  // our fighters close by: fighters on patrol or escort turn on them
  let chase = null;
  if (t.type === 'ftr' && !t.feint && !t.noFire && (t.mission === 'patrol' || t.mission === 'escort') && t.aam !== 0) {
    const c = t.mission === 'escort' && t.escortOf && !t.escortOf.dead ? t.escortOf : t.st || t;
    let bd = 500;
    for (const a of S.air) {
      if (a.dead || a.gnd || a.allied || a.alt < 0.5) continue;
      if (t.border && !IC.inHostile(a.x, a.y) && IC.borderDist(a.x, a.y) > 300) continue;
      const d = U.dist(a, c); if (d < bd) { bd = d; chase = a; }
    }
  }
  if (t.type === 'ftr' && !t.feint && !t.noFire) {
    t.cool = (t.cool || 0) - dt;
    if (t.aam == null) t.aam = 4;
    if (t.aam > 0 && t.cool <= 0) for (const a of S.air) {
      const R = Math.min(700, (IC.reachAt ? IC.reachAt('AAM', Math.max(0.03, a.alt || 0)) : 450) * 1.1);
      if (a.dead || a.gnd || U.dist(a, t) > R || a.allied) continue;
      if (t.border && IC.borderDist(a.x, a.y) > 600) continue;
      const close = U.dist(a, t) < 90;
      S.eaam.push({ x: t.x, y: t.y, a: Math.atan2(a.y - t.y, a.x - t.x), spd: close ? 9 : 11, target: a, pk: close ? 0.55 : 0.5, life: 70, src: t, ir: close });
      t.aam--; t.cool = 90; break;
    }
  }
  // locked on by a missile or a fire-control radar: break away; locked on too often, go home
  if (t.evadeT > 0) t.evadeT -= dt;
  const locked = lockedOn(S, t);
  // radar hunters do not break away (a radar locking on is what they came for), nor do the big jammers and bombers,
  // which cannot out-turn a missile and whose work is to hold their station
  if (locked && !t.wasLocked && !(t.evadeT > 0) && t.mission !== 'rtb' && t.mission !== 'sead' && turnRate(t) > 0.03 && !t.disguise) {
    t.locks = (t.locks || 0) + 1; t.evadeT = 45;
    const m = S.missiles.find(x => x.target === t && !x.dead), u = !m && t.fcBy.length && S.units.find(x => x.id === t.fcBy[0]);
    const from = m || u || t.home;
    t.evadeA = from ? Math.atan2(t.y - from.y, t.x - from.x) : Math.atan2(-(t.vy || 0), -(t.vx || 1));
    if (t.locks >= 3 && !t.released && t.home && t.mission !== 'escort') {
      t.mission = 'rtb'; t.jamming = false; t.lead = null; t.route = [{ x: t.home.x, y: t.home.y }];
      if (t.det && t.tn) IC.log(S, 'info', 'AIR', `TN ${t.tn} turned for home after being locked on ${t.locks} times.`, t);
    }
  }
  t.wasLocked = locked;
  if (t.lead === undefined) t.lead = formLead(S, t);
  if (t.lead && (t.lead.dead || t.lead.mission !== t.mission || !t.lead.route || !t.lead.route.length)) t.lead = null;
  let tx, ty, spd = t.spd;
  if (t.mission === 'escort' && t.escortOf) {
    const L = t.escortOf;
    if (L.dead || L.mission === 'rtb') { t.mission = 'rtb'; t.route = [{ x: t.home.x, y: t.home.y }]; }
    else if (!chase) {
      const h = Math.atan2(L.vy || 0, L.vx || 1), side = (t.slot || 1) % 2 ? 1 : -1;
      tx = L.x - Math.cos(h) * 10 - Math.sin(h) * 25 * side; ty = L.y - Math.sin(h) * 10 + Math.cos(h) * 25 * side;
      spd = U.dxy(t.x, t.y, tx, ty) > 10 ? t.spd * 1.2 : Math.max(0.5, Math.hypot(L.vx || 0, L.vy || 0));
    }
  }
  if (chase) { tx = chase.x; ty = chase.y; spd = t.spd * 1.25; }
  else if (tx != null) { /* escorting */ }
  else if (t.lead) {
    // in formation: an echelon behind the leader
    const L = t.lead, h = Math.atan2(L.vy || 0, L.vx || 1), k = t.slot || 1, side = k % 2 ? 1 : -1, row = Math.ceil(k / 2);
    tx = L.x - Math.cos(h) * 12 * row - Math.sin(h) * 10 * row * side; ty = L.y - Math.sin(h) * 12 * row + Math.cos(h) * 10 * row * side;
    const d = U.dxy(t.x, t.y, tx, ty);
    spd = d > 8 ? L.spd * 1.15 : L.spd;
    if (t.route && t.route.length && U.dxy(t.x, t.y, t.route[0].x, t.route[0].y) < 60 && t.route.length > 1) t.route.shift();
  } else if (t.route && t.route.length) {
    const p = t.route[0]; tx = p.x; ty = p.y;
    // there, or passed it within a turning circle (an aircraft that can only turn so fast would circle it for ever)
    const d = U.dxy(t.x, t.y, tx, ty), past = (tx - t.x) * (t.vx || 0) + (ty - t.y) * (t.vy || 0) <= 0;
    if (d < t.spd * dt + 4 || (past && d < 2 * t.spd / turnRate(t))) { t.route.shift(); if (!t.route.length) arriveAir(S, t); }
    // a disguised bomber leaving its airway is suddenly off-plan
    if (t.disguise && t.route.length === 1 && !t.offRoute) t.offRoute = true;
  } else if (t.mission === 'patrol' || t.mission === 'jam') {
    // a racetrack along the border: two turn points 30 km either side of the station
    const hx = t.home ? t.st.x - t.home.x : 1, hy = t.home ? t.st.y - t.home.y : 0, hl = Math.hypot(hx, hy) || 1, ux = -hy / hl, uy = hx / hl;
    t.leg = t.leg || 1;
    tx = t.st.x + ux * 300 * t.leg; ty = t.st.y + uy * 300 * t.leg;
    if (U.dxy(t.x, t.y, tx, ty) < 40) t.leg = -t.leg;
    t.endur = (t.endur == null ? (t.mission === 'jam' ? t.jamT : 10800) : t.endur) - dt;
    if (t.endur <= 0) { t.mission = 'rtb'; t.jamming = false; t.route = [{ x: t.home.x, y: t.home.y }]; }
  }
  if (tx == null) { tx = t.x + (t.vx || 1); ty = t.y + (t.vy || 0); }
  let want = Math.atan2(ty - t.y, tx - t.x);
  if (t.evadeT > 0 && t.evadeA != null) { want = t.evadeA; spd = t.spd * 1.15; }
  if (t.notchT > 0 && t.notchA != null) want = t.notchA + Math.PI / 2;
  const cur = Math.atan2(t.vy || (ty - t.y), t.vx || (tx - t.x));
  const rate = turnRate(t);
  const h = cur + U.clamp(U.angWrap(want - cur), -rate * dt, rate * dt);
  t.vx = Math.cos(h) * spd; t.vy = Math.sin(h) * spd;
  t.x += t.vx * dt; t.y += t.vy * dt;
  if (t.low) t.alt = 0.1 + 0.05 * Math.sin(t.age * 0.05);
  else if (t.altHold != null) t.alt = t.altHold;
};
function arriveAir(S, t) {
  const home = () => { t.mission = 'rtb'; t.route = [{ x: t.home.x, y: t.home.y }]; };
  switch (t.mission) {
    case 'patrol': case 'jam': break;
    case 'feint': home(); break;
    case 'shadow': break;
    case 'spy': t.dead = true; break;
    case 'sead': {
      let fired = 0;
      for (const k of S.enemy.known.values()) {
        if (fired >= t.arms) break;
        const u = k.ref;
        if (u.dead || !u.radarOn || U.dist(t, u) > 1400) continue;
        IC.spawnThreat(S, 'arm', t.x, t.y, { target: u, aim: { x: u.x, y: u.y }, op: t.op });
        t.op.launched++; fired++;
      }
      for (let i = 0; i < (t.dcy || 0); i++) {
        const aim = { x: t.tgt.x + U.rand(-300, 300), y: t.tgt.y + U.rand(-300, 300) };
        IC.spawnThreat(S, 'dcy', t.x, t.y, { route: [aim], aim });
      }
      if (fired) IC.weaponRelease(S, t);
      home(); break;
    }
    case 'strike': {
      for (let i = 0; i < 2; i++) {
        const tg = t.tgt.ref && t.tgt.ref.side === 'us' && !t.tgt.ref.dead ? t.tgt.ref : t.tgt;
        const aim = tg.fac ? aimAtBase(tg) : { x: tg.x + U.rand(-10, 10), y: tg.y + U.rand(-10, 10) };
        IC.spawnThreat(S, 'glb', t.x, t.y, { route: [aim], aim, target: t.tgt.ref, op: t.op, alt0: t.low ? 1.5 : 7, dist0: U.dist(t, aim) });
        t.op.launched++;
      }
      IC.weaponRelease(S, t);
      if (t.type !== 'ahe') { t.low = false; t.alt = 7; }
      home(); break;
    }
    case 'bomber': {
      for (let i = 0; i < t.load; i++) {
        const tg = i < 3 ? t.tgt : (pickTarget(S, Math.random() < 0.5 ? 'ad' : 'industry') || t.tgt);
        const aim = aimOn(tg);
        const route = planRoute(S, t, aim, true);
        const type = S.enemy.escal >= 2 && Math.random() < 0.5 ? 'mcm' : 'lacm';
        IC.spawnThreat(S, type, t.x, t.y, { route, aim, target: tg.ref, op: t.op });
        t.op.launched++;
      }
      IC.weaponRelease(S, t);
      t.radarOn = true;
      home(); break;
    }
    case 'rtb':
      t.dead = true;
      if (t.home && t.home.acAvail) t.home.acAvail[t.type] = (t.home.acAvail[t.type] || 0) + 1;
      break;
  }
}

/* ---------- commander ---------- */
function ensurePatrols(S) {
  for (const b of S.esites.filter(s => s.kind === 'airbase' && !s.destroyed && !s.dormant)) {
    const f = S.world.fronts.find(x => x.key === b.nat); if (!f) continue;
    const up = S.threats.filter(t => t.mission === 'patrol' && t.home === b && !t.dead).length;
    if (up >= 1 || b.acAvail.ftr < 1) continue;
    const p = f.pts[U.randi(0, f.pts.length - 1)];
    const st = { x: p.x - p.nx * 390, y: p.y - p.ny * 390 };
    b.acAvail.ftr--;
    IC.spawnThreat(S, 'ftr', b.x, b.y, { home: b, mission: 'patrol', route: [st], st, border: true });
  }
}

/* The war opens with probes, not the big one: drones at a radar, a missile at a power station or a bridge, fighters
   feinting at the main air base. `o.act` starts the enemy further along (the Career's Act IV after a strong Act III,
   the sandbox); `o.head` takes hours off act 1 for a defence that was ready when the war came. */
IC.enemyOpening = function (S, o) {
  const E = S.enemy;
  o = o || {};
  E.war = true; E.warT = S.time; E.actT = S.time; E.aimT = S.time; E.head = o.head || 0; E.winH = o.winH || 0;
  IC.log(S, 'leak', 'WAR', `${S.world.full.A} has opened hostilities. Missiles inbound.`);
  IC.news(S, `BREAKING: ${S.world.names.A} launches strikes on ${S.world.names.H}. Air raid sirens across the north.`);
  startAct(S, E, 1, `the war begins. Aim: ${IC.EAIMS[E.aim].name}${E.head ? `; their defence was ready, so probing is cut ${Math.round(E.head)} h short` : ''}`);
  for (let n = 2; n <= (o.act || 1); n++) startAct(S, E, n, 'the war starts further along');
  const pick = set => chooseTarget(S, E, set, { probe: true });
  const L = [pick('ad'), pick(U.pick(['city', 'transport'])), pick('trade')].filter(Boolean);
  const mb = IC.mainBase(S), T = S.time + 1500;
  const R = { id: 0, kind: 'opening', name: RAID_NAMES.opening, obj: L[0] || { x: mb.x, y: mb.y, ref: mb, name: mb.name, set: 'airbase' }, T, t0: S.time, ops: [], leaks: [], fired0: S.stats.fired, act: E.act, mix: [] };
  R.set = R.obj.set;
  for (const t of L) R.mix.push(...mixFor(S, E, 'probe', t).map(p => Object.assign(p, { obj: t, set: t.set })));
  if (mb) R.mix.push({ w: 'feint', n: 1, at: 0, obj: { x: mb.x, y: mb.y, ref: mb, name: mb.name, set: 'airbase' } });
  R.P = E.plan = { aim: E.aim, label: IC.EAIMS[E.aim].name, set: R.set, obj: R.obj, kind: 'opening', why: 'the opening' };
  E.raid = R;
  note(S, E, `Opening strike: small probes at ${L.map(t => t.name).join(', ')}, and a feint at ${mb ? mb.name : 'the border'}. See what fires, and from where.`);
  launchRaid(S, E, R);
  E.cycle = { phase: 'raid', next: R.T + 5400, R };
  IC.emit(S, 'war', {});
};
/* a deniable probe before the war (the Career's Act III): the agenda picks the target, probing weights; returns what
   intelligence would say about it */
IC.enemyProbe = function (S) {
  const E = S.enemy, sw = setWeights(S, E, 1), set = U.wpick(Object.entries(sw)), obj = set && chooseTarget(S, E, set, { probe: true });
  if (!obj) return null;
  const R = { id: 0, kind: 'probe', name: RAID_NAMES.probe, obj, set, T: S.time + 1800, t0: S.time, ops: [], leaks: [], act: E.act, mix: mixFor(S, E, 'probe', obj) };
  note(S, E, `Probes ${obj.name} (${IC.ESETS[set].name}), deniably: ${IC.EAIMS[E.aim].name}. See what fires.`);
  launchRaid(S, E, R);
  const where = obj.name;
  const words = { ad: `Drones crossing toward ${where}. They are feeling for our radars and batteries.`, city: `Something is heading for ${where}. They want to see how a city's defence reacts.`, transport: `A strike is heading for ${where}. Bridges and roads tell them how fast we repair.`, trade: `Drones are heading for ${where}. They want the airlines nervous.`, fuel: `Something is heading for ${where}.`, airbase: `Launches toward ${where}.`, command: `Something is heading for ${where}.` }[set];
  return { obj, set, words };
};
IC.enemyForceOp = function (S, name, target, n) {
  const E = S.enemy, obj = target ? Object.assign({ name: target.name || 'target' }, target) : null;
  if (name === 'recon') return OPS.recon(S, E, target);
  if (name === 'rkt') return OPS.rkt(S, E, target);
  if (name === 'lm') return OPS.lm(S, E);
  if (name === 'hgv') return OPS.hgv(S, E, obj);
  const op = newOp(S, name, `${name} at ${obj ? obj.name : 'target'}`);
  let T = S.time + (n && n.T || 1200);
  if (n && n.T && (name === 'bal' || name === 'mrbm')) T = Math.max(T, S.time + balLead(S, obj, name === 'mrbm') + 120);
  if (name === 'drones') W.drones(S, E, obj, n && n.n || n || 6, op, 0, false, n && n.nat);
  else if (name === 'cm') W.cm(S, E, obj, n && n.n || n || 3, op, n && n.T ? T : 0, n && n.nat);
  else if (name === 'bal') W.bal(S, E, obj, n && n.n || n || 2, op, n && n.T ? T : 0, false);
  else if (name === 'mrbm') W.bal(S, E, obj, n && n.n || n || 1, op, n && n.T ? T : 0, true);
  else if (name === 'bomber') W.bomber(S, E, obj, op, n && n.T ? T : 0);
  else if (name === 'disguise') W.disguise(S, E, obj, op);
  else if (name === 'low') W.low(S, E, obj, op, 0);
  else if (name === 'sead') W.sead(S, E, obj, op, 0);
  else if (name === 'decoys') W.decoys(S, E, obj, n || 3, op, 0);
  else if (name === 'helis') W.helis(S, E, obj, op, 0);
  else if (name === 'strike' || name === 'raid') {
    const old = { mixed: 'pressure', big: 'airbase', drones: 'probe', cm: 'limited', ballistic: 'limited' };
    const kind = old[n && n.kind] || n && n.kind || 'pressure';
    obj.set = obj.set || (obj.ref && obj.ref.kind === 'airbase' ? 'airbase' : obj.ref && obj.ref.d ? 'ad' : 'city');
    const R = { id: ++E.raidN, kind, name: RAID_NAMES[kind], obj, set: obj.set, T, t0: S.time, ops: [], leaks: [], fired0: S.stats.fired, act: E.act, mix: mixFor(S, E, kind, obj) };
    R.P = { aim: E.aim, label: 'strike', set: obj.set, obj, kind };
    E.raid = R; launchRaid(S, E, R); E.cycle = { phase: 'raid', next: T + 5400, R };
    return R.ops[0];
  }
  return op;
};

/* what has been fired at which set and target: every weapon of an operation counts once, when it is in the air */
function tally(S, E) {
  for (const t of S.threats) {
    if (t.tal || !t.op || !t.d.dmg || t.d.cls === 'air') continue;
    t.tal = true;
    const set = t.op.set || (t.op.raid && t.op.raid.set);
    if (!set) continue;
    const ref = t.op.obj || (t.op.raid && t.op.raid.obj.ref), id = ref && ref.id;
    if (E.act < 4) { E.tally[set] = (E.tally[set] || 0) + 1; E.tallyN++; }
    E.tallyAll[set] = (E.tallyAll[set] || 0) + 1; E.tallyAllN++;
    if (id) E.tallyRef[id] = (E.tallyRef[id] || 0) + 1;
  }
}
IC.enemyTally = S => { const E = S.enemy; return { pre: E.tally, preN: E.tallyN, all: E.tallyAll, allN: E.tallyAllN, ref: E.tallyRef }; };

/* results of each weapon, for the commander's memory of routes and methods */
IC.on((S, type, d) => {
  if (!S.enemy) return;
  if (type === 'kill' && d.op) {
    d.op.lost++;
    const k = cell(d.x, d.y); S.enemy.danger[k] = Math.min(8, (S.enemy.danger[k] || 0) + 1);
    const bt = d.op.byType || (d.op.byType = {}); (bt[d.type] = bt[d.type] || { n: 0, hit: 0 }).n++;
  }
  if (type === 'impact' && d.src && d.src.op) { const op = d.src.op; const bt = op.byType || (op.byType = {}); (bt[d.src.type] = bt[d.src.type] || { n: 0, hit: 0 }); bt[d.src.type].n++; bt[d.src.type].hit++; }
  if (type === 'launch' && d.t.op) d.t.op.shots++;
  // a battery that fires at their weapons gives itself away, and the enemy counts what it has fired
  if (type === 'launch' && d.u && d.t && d.t.fromHostile && S.enemy.war) {
    IC.enemyLearn(S, d.u, 'engaging its weapons');
    const k = S.enemy.known.get(d.u.id); if (k) (k.shots = k.shots || []).push(S.time);
  }
  // a weapon of a raid came down on our side: what it hit and why it got through
  if (type === 'arrive' && d.t.op && d.t.op.raid && IC.inHome(d.t.x, d.t.y)) {
    const R = d.t.op.raid, t = d.t;
    t.dead = false; const why = leakWhy(S, t); t.dead = true;
    R.leaks.push({ cls: t.d.cls, type: t.type, why, place: d.hit && d.hit.name ? d.hit.name : IC.nearestPlace(S, t.x, t.y), hit: !!d.hit });
    if (d.hit) R.hits = (R.hits || 0) + 1;
  }
});

IC.enemyTick = function (S, dt) {
  const E = S.enemy;
  // escalation follows the acts: the weapons it uses (jamming drones, manoeuvring warheads, the glider) come with them
  if (E.war) E.escal = Math.min(4, [0, 0.4, 1, 1.6, 2][E.act] + (E.act >= 4 ? (S.time - E.actT) / 86400 : 0) + (E.bump || 0));
  if (E.war) {
    tally(S, E);
    if (E.winning) E.winH += dt / H;
    if (E.save && !E.shock && S.time >= E.save.nextRep) { E.save.nextRep = S.time + U.rand(3.5, 4.5) * H; stockReport(S, E); }
  }
  if (E.pending.length) {
    const due = E.pending.filter(p => p.t <= S.time);
    if (due.length) { E.pending = E.pending.filter(p => p.t > S.time); for (const p of due) p.fn(); }
  }
  IC.updateTels(S, dt);
  E.intelT -= dt;
  if (E.intelT <= 0) { E.intelT = 30; updateIntel(S); for (const k in E.danger) E.danger[k] *= 0.995; }
  E.patrolT -= dt;
  if (E.patrolT <= 0) { E.patrolT = 300; ensurePatrols(S); }
  E.regenT -= dt;
  if (E.regenT <= 0) {
    E.regenT = 60;
    if (E.war && S.time - (E.warT || S.time) > 86400) E.will = Math.max(0, E.will - 0.3 / 60);
    for (const s of S.esites) {
      if (s.destroyed) { s.hp = Math.min(s.max * 0.3, s.hp + s.max * 0.0005); if (s.hp >= s.max * 0.3) { s.destroyed = false; IC.log(S, 'warn', 'INTEL', `${s.name} appears to be operating again.`); } continue; }
      const k = s.hp / s.max;
      if (s.regen) for (const r in s.regen) { s.inv[r] = (s.inv[r] || 0) + s.regen[r] * k / 60; if (s.saved && s.want && s.want[r] != null) { s.saved[r] += s.regen[r] * k / 60; s.hold[r] = s.base[r] + s.saved[r]; } }
      if (s.acAvail) for (const a in s.acMax) {
        const out = S.threats.filter(t => t.home === s && t.type === a && !t.dead).length;
        if (s.acAvail[a] + out < s.acMax[a] && Math.random() < 0.02) s.acAvail[a]++;
      }
      s.hp = Math.min(s.max, s.hp + s.max * 0.0005);
      // a replacement launcher arrives from the factories
      if (s.telQ && s.telQ.length && s.telQ[0] <= S.time) {
        s.telQ.shift();
        const hp = hidePoint(S, s), n = S.tels.filter(t => t.site === s).length + 1;
        S.tels.push({ id: IC.nid('tel'), tel: true, site: s, name: `${s.name} launcher ${n}`, x: hp.x, y: hp.y, h: 0, state: 'hidden', t: 0, known: false, kx: 0, ky: 0, kt: 0, dead: false, mission: null, kind: s.kind });
        note(S, E, `A replacement launcher reaches ${s.name}.`);
      }
    }
    E.ops = E.ops.filter(o => S.time - o.t0 < 43200 || (o.raid && o.raid === E.raid));
  }

  if (!E.war) {
    // before the war their reconnaissance is the gray zone: in the Career it comes by the calendar (Acts II and III
    // last years), every half-month to a month in Act II and about weekly in Act III; elsewhere every hour or so
    const st = S.mode === 'story' && S.story, gap = st ? IC.MO(S, st.act >= 3 ? U.rand(0.2, 0.4) : U.rand(0.5, 1)) : U.rand(3600, 5400);
    if (E.allow && E.allow.has('recon') && S.time > E.nextThink) { E.nextThink = S.time + gap; OPS.recon(S, E); }
    return;
  }
  runCycle(S, E);
};

})(window.IC);
