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
    plan: null, danger: {}, method: { cm: 1, bal: 1, drones: 1, sead: 1, bomber: 1, disguise: 1, low: 1 },
    objW: { airbase: 1.3, ad: 1, industry: 0.9, terror: 0.6, logistics: 0.7 }, history: []
  };
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

/* ---------- targets ---------- */
function aimAtBase(b) {
  const fac = (b.fac || []).filter(f => f.hp > f.max * 0.3);
  if (!fac.length) return { x: b.x, y: b.y };
  const f = U.wpick(fac.map(f => [f, f.kind === 'runway' ? 3 : f.kind === 'hangar' || f.kind === 'has' ? 2 : 1]));
  if (f.kind === 'runway') { const t = U.rand(-0.4, 0.4) * b.rwyL; return { x: b.x + Math.cos(b.rwyA) * t, y: b.y + Math.sin(b.rwyA) * t }; }
  return { x: f.x, y: f.y };
}
function targets(S, purpose) {
  const L = [], night = IC.isNight(S);
  for (const i of S.infra) {
    if (i.offline || i.owner !== 'us' || i.kind === 'bridge') continue;
    let w = 0;
    if (purpose === 'terror' && i.kind === 'city') w = Math.sqrt(i.pop) * (night ? 1.4 : 1);
    if (purpose === 'industry' && (i.kind === 'power' || i.kind === 'factory' || i.kind === 'airport')) w = i.kind === 'factory' ? 14 : 10;
    if (purpose === 'airbase' && i.kind === 'airbase') w = 18 + S.roster.filter(r => r.base === i.id && r.st !== 'lost').length * 2;
    if (purpose === 'bal' && (i.kind === 'airbase' || i.kind === 'factory' || i.capital)) w = i.kind === 'airbase' ? 16 : 10;
    if (w) L.push({ x: i.x, y: i.y, ref: i, name: i.name, w });
  }
  for (const b of S.infra) if (b.kind === 'bridge' && !b.offline && b.home && purpose === 'logistics' && IC.hostileBorderDist(b.x, b.y) < 2400) L.push({ x: b.x, y: b.y, ref: b, name: b.name, w: 6 });
  for (const k of S.enemy.known.values()) {
    let w = 0;
    if (purpose === 'ad') w = { sam: 14, radar: 11, pointdef: 3, jammer: 6 }[k.kind] || 0;
    if (purpose === 'logistics' && k.kind === 'depot') w = 14;
    if (purpose === 'bal' && (k.type === 'lrsam' || k.type === 'hatd' || k.type === 'exo' || k.type === 'bmd' || k.kind === 'launcher' || k.ref.central)) w = 14;
    if (purpose === 'emit' && (k.kind === 'radar' || k.kind === 'sam' || k.kind === 'jammer') && k.ref.radarOn && !k.ref.dead) w = 10;
    if (w) L.push({ x: k.x, y: k.y, ref: k.ref, name: k.ref.name, w });
  }
  if (purpose === 'convoy' || purpose === 'logistics') for (const c of S.enemy.convoys.values()) L.push({ x: c.x, y: c.y, ref: c.ref, name: c.ref.name, w: purpose === 'convoy' ? 10 : 6 });
  return L;
}
function pickTarget(S, purpose) { const L = targets(S, purpose); return L.length ? U.wpick(L.map(t => [t, t.w])) : null; }
/* an aim point on the objective: bases are hit on their runway and hangars, not their centre */
function aimOn(obj) { const r = obj.ref; if (r && r.fac) return aimAtBase(r); return { x: obj.x + U.rand(-4, 4), y: obj.y + U.rand(-4, 4) }; }

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
    const sites = S.esites.filter(s => s.kind === 'drone' && alive(s) && s.inv.owa >= 1 && (!nat || s.nat === nat));
    if (!sites.length) return 0;
    sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj));
    const s = nat || Math.random() < 0.7 ? sites[0] : U.pick(sites);
    n = Math.min(Math.floor(s.inv.owa), n);
    const nj = !harass && E.escal >= 1.5 ? Math.min(Math.floor(s.inv.jdr || 0), U.randi(0, 3)) : 0;
    s.inv.owa -= n; if (nj) s.inv.jdr -= nj;
    for (let i = 0; i < n + nj; i++) {
      const type = i < n ? 'owa' : 'jdr';
      const aim = aimOn(obj);
      const route = planRoute(S, s, aim, true, harass ? 3000 : 2100);
      const T = routeLen(s, route) / IC.THR[type].spd;
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-120, 120) : i * U.rand(40, 140), 'eSpawn', S, type, s.x, s.y, { route, aim: route[route.length - 1], target: obj.ref, op, origin: s }, 30, 1);
    }
    return n + nj;
  },
  cm(S, E, obj, n, op, arriveAt, nat) {
    const sites = S.esites.filter(s => s.kind === 'cm' && alive(s) && (!nat || s.nat === nat) && ((s.inv.lacm || 0) + (s.inv.scm || 0) + (s.inv.mcm || 0)) >= 1);
    if (!sites.length) return 0;
    const s = sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
    n = Math.min(Math.floor((s.inv.lacm || 0) + (s.inv.scm || 0) + (s.inv.mcm || 0)), n);
    for (let i = 0; i < n; i++) {
      let type = 'lacm';
      if ((s.inv.scm || 0) >= 1 && Math.random() < 0.5) type = 'scm';
      else if ((s.inv.mcm || 0) >= 1 && E.escal >= 1.5) type = 'mcm';
      else if ((s.inv.lacm || 0) < 1) type = (s.inv.scm || 0) >= 1 ? 'scm' : 'mcm';
      s.inv[type]--;
      const from = { x: s.x + U.rand(-40, 40), y: s.y + U.rand(-40, 40) };
      const aim = aimOn(obj);
      const route = type === 'scm' ? [aim] : planRoute(S, from, aim, true);
      const T = routeLen(from, route) / IC.THR[type].spd;
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-40, 40) : i * 30, 'eSpawn', S, type, from.x, from.y, { route, aim, target: obj.ref, op, origin: s }, 0, 2);
    }
    return n;
  },
  bal(S, E, obj, n, op, arriveAt, mrbm) {
    const kind = mrbm ? 'mrbm' : 'bm';
    const sites = S.esites.filter(s => s.kind === kind && alive(s) && readyTels(S, s).length && ((s.inv.srbm || 0) + (s.inv.marv || 0) + (s.inv.mrbm || 0)) >= 1);
    if (!sites.length) return 0;
    const s = sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0];
    const tels = readyTels(S, s);
    let left = Math.min(n, tels.length * 2, Math.floor((s.inv.srbm || 0) + (s.inv.marv || 0) + (s.inv.mrbm || 0)));
    let fired = 0;
    for (const tel of tels) {
      if (left <= 0) break;
      const k = Math.min(mrbm ? 1 : 2, left); left -= k;
      const aims = [];
      for (let i = 0; i < k; i++) {
        const type = mrbm ? 'mrbm' : (s.inv.marv || 0) >= 1 && E.escal >= 2 ? 'marv' : 'srbm';
        s.inv[type]--;
        const a = aimOn(obj);
        const pens = mrbm && E.escal >= 1.5 ? Math.min(Math.floor(s.inv.pen || 0), 3) : 0;
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
    const tgt = U.pick(em);
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
      later(S, (arriveAt ? arriveAt - S.time - T : 0) + i * 25, 'eSpawn', S, 'str', b.x, b.y, { home: b, mission: 'strike', route: rp.map(p => ({ x: p.x + i * 20, y: p.y })), tgt: { x: obj.x, y: obj.y, ref: obj.ref, name: obj.name }, op, alt: 0.1, low: true, radarOn: false }, 0, 0);
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
  decoys(S, E, obj, n, op, arriveAt) {
    const b = S.esites.find(s => s.kind === 'airbase' && alive(s));
    if (!b) return 0;
    const st = standoff(obj, b, 300);
    for (let i = 0; i < n; i++) {
      const aim = { x: obj.x + U.rand(-300, 300), y: obj.y + U.rand(-300, 300) };
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

/* ---------- the campaign: raids with a rhythm ----------
   The commander works in cycles the player can read. A build-up (intelligence warnings, a reconnaissance drone,
   probing drones on the flanks, then a stand-off jammer taking station), the raid (waves timed to arrive
   together: drones and decoys first to soak up missiles, then cruise and ballistic missiles with escort jammers,
   then stragglers), and a calm while it counts the cost. Raids climb a ladder over the days: drones, cruise
   missiles, mixed raids, ballistic salvoes, then the big one. After each raid the player gets an after-action
   report saying what got through and why. */
const OBJ_NAMES = { airbase: 'neutralize an air base', ad: 'break the air defenses', industry: 'cripple war industry', terror: 'terrorize the cities', logistics: 'cut supply lines' };
const RAID_NAMES = { drones: 'drone raid', cm: 'cruise missile raid', mixed: 'mixed raid', ballistic: 'ballistic salvo', big: 'major combined raid', opening: 'opening strike', retaliation: 'retaliation strike' };
const LADDER = ['drones', 'cm', 'mixed', 'ballistic', 'mixed', 'big'];
function chooseObjective(S, E, kind) {
  const opts = [];
  for (const k in E.objW) {
    const tg = pickTarget(S, kind === 'ballistic' && k !== 'terror' && k !== 'industry' ? 'bal' : k);
    if (!tg) continue;
    let w = E.objW[k];
    if (k === 'airbase') w *= 1 + S.air.filter(a => a.kind === 'ftr').length * 0.2;
    if (k === 'terror') w *= IC.nationalMorale(S) < 45 ? 1.8 : 0.8;
    if (k === 'ad') w *= 1 + S.units.filter(u => u.d.weapon === 'sam').length * 0.05;
    opts.push([{ k, tg }, w]);
  }
  const c = U.wpick(opts);
  return c ? { kind: c.k, obj: c.tg, label: OBJ_NAMES[c.k] } : null;
}
/* fighters dash at the border and turn away: our radars and batteries light up for nothing */
function feint(S, E, obj) {
  const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.ftr >= 2).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
  if (!b) return;
  const st = standoff(obj, b, 120);
  for (let i = 0; i < 2; i++) { b.acAvail.ftr--; IC.spawnThreat(S, 'ftr', b.x, b.y, { home: b, mission: 'feint', route: [{ x: st.x + i * 40, y: st.y }], feint: true }); }
  newOp(S, 'feint', 'fighters feint at the border');
}
function nextKind(S, E) {
  if (E.retaliate > 0 && can(S, 'bal')) return 'retaliation';
  if (E.raidN < LADDER.length) return LADDER[E.raidN];
  const esc = E.escal;
  return U.wpick([['drones', 1], ['cm', 1.2], ['mixed', 2], ['ballistic', 0.6 + esc * 0.3], ['big', esc >= 2 ? 0.8 : 0.2]]);
}
/* the start of a cycle: pick a raid and an objective, and a time it should peak */
function planRaid(S, E) {
  const kind = nextKind(S, E);
  const P = chooseObjective(S, E, kind);
  if (!P) { E.cycle = { phase: 'calm', next: S.time + 3600 }; return; }
  if (kind === 'retaliation') { E.retaliate = 0; const t = pickTarget(S, 'bal') || pickTarget(S, 'terror'); if (t) P.obj = t; IC.news(S, `${S.world.names.A} vows retaliation after strikes on its territory.`); }
  E.plan = P;
  // T waits for the slowest weapon: launchers driving out, drones that fly for hours
  const bal = kind === 'ballistic' || kind === 'big' || kind === 'retaliation' ? Math.max(balLead(S, P.obj, false), balLead(S, P.obj, true)) + 300 : 0;
  const ds = kind !== 'ballistic' && kind !== 'retaliation' ? S.esites.filter(x => x.kind === 'drone' && alive(x)).reduce((m, x) => Math.min(m, U.dist(x, P.obj)), 1e9) : 1e9;
  const drn = ds < 1e8 ? ds * 1.35 / IC.THR.owa.spd + 600 : 0;
  let T = S.time + Math.max(U.rand(4800, 6600), Math.min(7200, bal), Math.min(21600, drn));
  // drone raids come at night when the night is not too far off
  if (kind === 'drones') { const h = ((T % 86400) / 3600), wait = h >= 20 || h < 4 ? 0 : (20 - h) * 3600 + U.rand(0, 5400); if (wait > 0 && wait < 8 * 3600) T += wait; }
  const R = { id: ++E.raidN, kind, name: RAID_NAMES[kind], obj: P.obj, P, T, t0: S.time, ops: [], leaks: [], launched: 0, esc: E.escal };
  E.raid = R;
  E.cycle = { phase: 'buildup', next: T, R };
  E.mood = `preparing a ${R.name}`;
  // the build-up: things the player can see coming
  const sharp = IC.hasTech(S, 's_esm') || IC.hasTech(S, 's_sat');
  later(S, Math.max(0, T - S.time - U.rand(3600, 4800)), 'eRaidWarn', S, R, sharp);
  later(S, T - S.time - U.rand(2700, 3300), 'eRecon', S, P.obj);
  later(S, T - S.time - U.rand(2000, 2600), 'eProbe', S, R);
  if (kind !== 'drones') later(S, T - S.time - U.rand(2300, 2700), 'eJammer', S, P.obj, R);
  R.fired0 = S.stats.fired;
  launchRaid(S, E, R);
  E.cycle = { phase: 'buildup', next: T, R };
}
/* the build-up before a raid: a warning, reconnaissance, a probe, a jammer */
IC.H.eRaidWarn = (S, R, sharp) => () => {
  const P = R.P, T = R.T;
  const where = sharp ? `, most likely against ${P.obj.name}` : ` towards ${IC.nearestPlace(S, P.obj.x, P.obj.y).replace(/^\d+ km \w+ of /, '')}`;
  const when = Math.round((T - S.time) / 900) * 15;
  IC.log(S, 'warn', 'INTEL', `Signals intelligence: ${S.world.names.A} is preparing a ${R.name}${where}. Expect it in about ${when} minutes.`, sharp ? P.obj : null);
  IC.emit(S, 'raidWarning', { R, sharp, when });
};
IC.H.eRecon = (S, obj) => () => { if (can(S, 'recon')) OPS.recon(S, S.enemy, { x: obj.x + U.rand(-250, 250), y: obj.y + U.rand(-250, 250) }); };
IC.H.eProbe = (S, R) => () => {
  const E = S.enemy, P = R.P;
  const op = newOp(S, 'probe', `drones probing towards ${P.obj.name}`, { raid: R });
  if (can(S, 'drones') && Math.random() < 0.8) W.drones(S, E, P.obj, U.randi(2, 3), op, 0, true); else feint(S, E, P.obj);
  if (can(S, 'rkt') && E.escal >= 1 && Math.random() < 0.4) OPS.rkt(S, E);
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
    const route = planRoute(S, s, { x: obj.x, y: obj.y }, true);
    const T = routeLen(from, route) / IC.THR.esj.spd;
    later(S, arriveAt - S.time - T - 120 + i * 40, 'eSpawn', S, 'esj', from.x, from.y, { route: route.map(p => ({ x: p.x + U.rand(-15, 15), y: p.y + U.rand(-15, 15) })), aim: route[route.length - 1], jamming: true, op, origin: s }, 0, 1);
  }
  return n;
}
/* the raid itself: waves timed on T */
function launchRaid(S, E, R) {
  const obj = R.obj, esc = E.escal, M = E.method, T = R.T, k = R.kind;
  const ramp = 0.55 + 0.45 * Math.min(1, (S.time - (E.warT || S.time)) / 129600);
  const big = (1 + esc * 0.4) * ramp * (k === 'big' ? 1.4 : 1);
  const op = newOp(S, 'strike', `${R.name} on ${obj.name}`, { raid: R, obj: obj.ref, arriveAt: T });
  const wave1 = T - 360, straggle = T + 480;
  let n = 0;
  const heavy = k === 'mixed' || k === 'big';
  if ((k === 'drones' || heavy || k === 'cm') && can(S, 'drones')) n += W.drones(S, E, obj, Math.round((k === 'drones' ? 5 + esc * 2.5 : 3 + esc * 1.5) * Math.min(1.3, M.drones) * big), op, wave1);
  if ((k === 'drones' || heavy) && can(S, 'dcy')) n += W.decoys(S, E, obj, Math.round((2 + esc) * ramp), op, wave1);
  if (heavy && can(S, 'sead') && M.sead > 0.4) n += W.sead(S, E, obj, op, T);
  if ((k === 'cm' || heavy || k === 'ballistic') && can(S, 'cm')) n += W.cm(S, E, obj, Math.round((k === 'ballistic' ? 2 : 3 + esc * 1.5) * big * M.cm), op, T);
  if ((k === 'cm' || heavy) && can(S, 'jam')) n += escorts(S, E, obj, k === 'big' ? 2 : 1, op, T);
  if ((k === 'ballistic' || k === 'big' || k === 'retaliation' || k === 'opening') && can(S, 'bal')) n += W.bal(S, E, obj, Math.round((k === 'opening' ? 3 : 2 + esc) * Math.max(0.5, M.bal) * (k === 'big' ? 1.5 : 1)), op, T, false);
  if ((k === 'ballistic' || k === 'big') && esc >= 1.2 && can(S, 'mrbm')) n += W.bal(S, E, obj, esc >= 2.5 ? 2 : 1, op, T, true);
  if (heavy && can(S, 'bomber') && esc >= 0.8 && M.bomber > 0.4 && Math.random() < 0.6) n += W.bomber(S, E, obj, op, T);
  if (heavy && can(S, 'disguise') && esc >= 0.6 && M.disguise > 0.4 && Math.random() < 0.3) n += W.disguise(S, E, obj, op);
  if (heavy && can(S, 'low') && M.low > 0.4 && Math.random() < 0.4) n += W.low(S, E, obj, op, T);
  if ((heavy || k === 'drones') && can(S, 'helis') && Math.random() < 0.5) n += W.helis(S, E, obj, op, T - 200);
  if (k === 'big' && esc >= 2.5 && can(S, 'hgv')) OPS.hgv(S, E, obj);
  if (heavy && can(S, 'lm') && Math.random() < 0.4) OPS.lm(S, E);
  if ((k === 'opening' || k === 'big') && can(S, 'drones')) { const pw = S.infra.filter(i => i.kind === 'power' && !i.offline).sort((a, b) => U.dist(a, obj) - U.dist(b, obj))[0]; if (pw) n += W.drones(S, E, { x: pw.x, y: pw.y, ref: pw, name: pw.name }, 4, op, wave1); }
  // stragglers: a few that were late off the rails
  if (k !== 'ballistic' && k !== 'retaliation' && can(S, 'drones')) n += W.drones(S, E, obj, Math.max(1, Math.round(big)), op, straggle);
  R.ops.push(op); R.planned = n;
  if (n) { IC.emit(S, 'enemyStrike', { op, obj, R }); if (Math.random() < 0.5) IC.news(S, `Analysts warn ${S.world.names.A} is massing missiles and aircraft for a major raid.`); }
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
  const text = `${head}${lines.length ? ' ' + lines.join(' ') : ''}`;
  R.text = text; R.res = res;
  IC.log(S, leaks ? 'warn' : 'kill', 'AFTER-ACTION', `${cap(R.name)} on ${R.obj.name}: ${text}`, R.obj);
  if (S.camp && IC.card) IC.card(S, `After-action · ${cap(R.name)}`, `${R.obj.name} · ${U.clock(S.time)}`, text, 'report');
  IC.emit(S, 'raidOver', R);
  // the commander learns what worked
  learn(S, E, R, ops);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function learn(S, E, R, ops) {
  const P = R.P, r = R.obj.ref;
  let success = false;
  if (r && r.parts) success = !IC.baseStatus(S, r).runway;
  else if (r && r.infra) success = r.offline || r.hp < r.max * 0.5;
  else if (r) success = r.dead;
  const launched = ops.reduce((s, o) => s + o.launched, 0);
  const eff = launched ? (R.hits || 0) / launched : 0, cost = launched ? ops.reduce((s, o) => s + o.lost, 0) / launched : 0;
  if (P) {
    E.history.push({ kind: P.kind, success, eff, cost, t: S.time });
    E.objW[P.kind] = U.clamp(E.objW[P.kind] * (success ? 1.1 : 0.8) * (cost > 0.7 ? 0.8 : 1), 0.3, 2.5);
  }
  // methods that got through keep their share; the ones that died on the way are used less
  for (const k in E.method) E.method[k] = U.clamp(E.method[k] * 0.98 + 0.02, 0.2, 1.8);
  for (const o of ops) for (const [type, st] of Object.entries(o.byType || {})) {
    const m = { owa: 'drones', jdr: 'drones', lacm: 'cm', mcm: 'cm', scm: 'cm', srbm: 'bal', marv: 'bal', mrbm: 'bal', sead: 'sead', bmr: 'bomber', str: 'low' }[type];
    if (!m) continue;
    E.method[m] = U.clamp(E.method[m] * (0.85 + (st.n ? st.hit / st.n : 0) * 0.5), 0.3, 1.5);
  }
  if (success) IC.news(S, `${S.world.names.A} claims its strike on ${R.obj.name} was a success.`);
  else if (launched >= 6 && eff < 0.2) { E.will = Math.max(0, E.will - 1.5); IC.news(S, `Air defenses blunt a ${R.name} on ${R.obj.name}.`); }
}
/* the calm after a raid: longer after a big one, shorter as the war goes on */
function calmFor(E, R) {
  const h = R.kind === 'big' ? U.rand(4, 5.5) : R.kind === 'opening' ? U.rand(2, 3) : U.rand(2.2, 3.4);
  return h * 3600 / (0.85 + E.escal * 0.12);
}
function runCycle(S, E) {
  const C = E.cycle || (E.cycle = { phase: 'calm', next: S.time + 1800 });
  if (C.phase === 'calm') {
    // a retaliation cuts the calm short
    if (E.retaliate > 0 && S.time > (E.retT || 0)) { E.retT = S.time + 5400; C.next = Math.min(C.next, S.time + 900); }
    if (S.time >= C.next) planRaid(S, E);
  } else if (C.phase === 'buildup') {
    if (S.time >= C.next - 900) { E.cycle = { phase: 'raid', next: C.next + 5400, R: C.R }; E.mood = `${C.R.name} on ${C.R.obj.name}`; IC.emit(S, 'raidStart', C.R); }
  } else if (C.phase === 'raid') {
    if (raidOver(S, C.R) || S.time > C.next) {
      report(S, E, C.R);
      E.raid = null;
      E.cycle = { phase: 'calm', next: S.time + calmFor(E, C.R), since: S.time, after: C.R };
      E.mood = 'counting the cost';
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
  lm(S, E) {
    const tgt = pickTarget(S, Math.random() < 0.5 ? 'convoy' : 'ad');
    if (!tgt) return false;
    const s = S.esites.filter(x => x.kind === 'drone' && alive(x) && (x.inv.lm || 0) >= 2).sort((a, b) => U.dist(a, tgt) - U.dist(b, tgt))[0];
    if (!s) return false;
    const n = Math.min(Math.floor(s.inv.lm), U.randi(2, 4));
    s.inv.lm -= n;
    const op = newOp(S, 'lm', `loitering munitions hunting near ${tgt.name}`);
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

IC.enemyOpening = function (S) {
  const E = S.enemy;
  E.war = true; E.warT = S.time;
  IC.log(S, 'leak', 'WAR', `${S.world.full.A} has opened hostilities. Missiles inbound.`);
  IC.news(S, `BREAKING: ${S.world.names.A} launches strikes on ${S.world.names.H}. Air raid sirens across the north.`);
  const ab = S.infra.find(i => i.kind === 'airbase' && i.id === 'ab_fwd') || S.infra.find(i => i.kind === 'airbase');
  const obj = { x: ab.x, y: ab.y, ref: ab, name: ab.name };
  const esc = E.escal; E.escal = 0.4;
  const R = { id: 0, kind: 'opening', name: RAID_NAMES.opening, obj, P: { kind: 'airbase', obj, label: OBJ_NAMES.airbase }, T: S.time + 1500, t0: S.time, ops: [], leaks: [], fired0: S.stats.fired, esc: 0.4 };
  E.plan = R.P; E.raid = R;
  launchRaid(S, E, R);
  E.escal = esc;
  E.cycle = { phase: 'raid', next: R.T + 5400, R };
  IC.emit(S, 'war', {});
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
    const kind = n && n.kind || 'mixed', R = { id: ++E.raidN, kind, name: RAID_NAMES[kind], obj, P: { kind: 'airbase', obj, label: 'strike' }, T, t0: S.time, ops: [], leaks: [], fired0: S.stats.fired, esc: E.escal };
    E.raid = R; launchRaid(S, E, R); E.cycle = { phase: 'raid', next: T + 5400, R };
    return R.ops[0];
  }
  return op;
};

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
  if (E.war) E.escal = Math.min(4, E.escalBase + (S.time - (E.warT || S.time)) / 86400 * 0.6 + (E.bump || 0));
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
      if (s.regen) for (const r in s.regen) s.inv[r] = (s.inv[r] || 0) + s.regen[r] * k / 60;
      if (s.acAvail) for (const a in s.acMax) {
        const out = S.threats.filter(t => t.home === s && t.type === a && !t.dead).length;
        if (s.acAvail[a] + out < s.acMax[a] && Math.random() < 0.02) s.acAvail[a]++;
      }
      s.hp = Math.min(s.max, s.hp + s.max * 0.0005);
    }
    E.ops = E.ops.filter(o => S.time - o.t0 < 43200);
  }

  if (!E.war) {
    if (E.allow && E.allow.has('recon') && S.time > E.nextThink) { E.nextThink = S.time + U.rand(3600, 5400); OPS.recon(S, E); }
    return;
  }
  runCycle(S, E);
};

})(window.IC);
