/* Iron Canopy — the enemy: installations, launchers, convoys, what they know about us, and the air and missile
   commander. The commander runs campaigns against objectives: it probes to learn where our coverage is thin,
   harasses to keep our radars lit and crews awake and interceptors flying, then throws a strike meant to wreck the
   objective, with every weapon timed to arrive together. It remembers which routes cost it and which methods
   worked, and changes objective, approach and weapons accordingly. */
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
    if (e.ac) { s.acMax = Object.assign({}, e.ac); s.acAvail = Object.assign({}, e.ac); }
    if (e.kind === 'supply') s.stock = 200;
    S.esites.push(s);
    for (let i = 0; i < (e.tels || 0); i++) {
      const hp = hidePoint(S, s);
      S.tels.push({ id: IC.nid('tel'), tel: true, site: s, name: `${s.name} launcher ${i + 1}`, x: hp.x, y: hp.y, h: 0,
        state: 'hidden', t: 0, known: false, kx: 0, ky: 0, kt: 0, dead: false, mission: null, kind: e.kind });
    }
  }
  S.enemy = {
    known: new Map(), convoys: new Map(), escal: 0, escalBase: 0, nextThink: S.time + 1800, retaliate: 0, ops: [], pending: [],
    cd: {}, patrolT: 0, intelT: 0, regenT: 0, convoyT: 600, mood: 'massing on the border', will: 100, allow: null, war: false,
    plan: null, harassT: S.time + 3600, danger: {}, method: { cm: 1, bal: 1, drones: 1, sead: 1, bomber: 1, disguise: 1, low: 1 },
    objW: { airbase: 1.3, ad: 1, industry: 0.9, terror: 0.6, logistics: 0.7, front: 0.8 }, history: []
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

function updateIntel(S) {
  const E = S.enemy;
  for (const u of S.units) {
    if (u.state !== 'ready' && u.state !== 'building' && u.state !== 'setup') continue;
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
    if (purpose === 'front' && IC.hostileBorderDist(k.x, k.y) < 1400) w = { sam: 10, radar: 12, launcher: 12, depot: 10, pointdef: 5, jammer: 8 }[k.kind] || 0;
    if (w) L.push({ x: k.x, y: k.y, ref: k.ref, name: k.ref.name, w });
  }
  if (purpose === 'front' || purpose === 'convoy' || purpose === 'logistics') for (const c of S.enemy.convoys.values()) L.push({ x: c.x, y: c.y, ref: c.ref, name: c.ref.name, w: purpose === 'convoy' ? 10 : 6 });
  return L;
}
function pickTarget(S, purpose) { const L = targets(S, purpose); return L.length ? U.wpick(L.map(t => [t, t.w])) : null; }
/* an aim point on the objective: bases are hit on their runway and hangars, not their centre */
function aimOn(obj) { const r = obj.ref; if (r && r.fac) return aimAtBase(r); return { x: obj.x + U.rand(-4, 4), y: obj.y + U.rand(-4, 4) }; }

/* ---------- route planning with a memory of where it hurts ---------- */
const cell = (x, y) => Math.floor(x / 900) + ':' + Math.floor(y / 900);
function exposure(S, pts, low) {
  let e = 0;
  const sams = [...S.enemy.known.values()].filter(k => k.kind === 'sam' || k.kind === 'pointdef' || (low && k.kind === 'radar'));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = U.dist(a, b), n = Math.ceil(L / 180);
    for (let s = 0; s <= n; s++) {
      const x = a.x + (b.x - a.x) * s / n, y = a.y + (b.y - a.y) * s / n;
      // a low flier behind a hill is out of sight (airspace.js): valleys are safe ground
      for (const k of sams) { const r = k.kind === 'radar' ? 450 : k.rng || 120; if (U.dxy(x, y, k.x, k.y) < r && (!low || IC.losClear(k.x, k.y, 15, x, y, 0.1))) e += k.kind === 'radar' ? 0.3 : 1; }
      e += (S.enemy.danger[cell(x, y)] || 0) * 0.6;
    }
  }
  return e;
}
function planRoute(S, from, to, low, spread) {
  let best = [{ x: to.x, y: to.y }], bc = 1e12;
  for (let k = 0; k < (low ? 14 : 9); k++) {
    const pts = [from];
    const nv = k === 0 ? 0 : U.randi(1, 2);
    for (let i = 0; i < nv; i++) {
      const f = (i + 1) / (nv + 1);
      const mx = from.x + (to.x - from.x) * f, my = from.y + (to.y - from.y) * f;
      const nx = -(to.y - from.y), ny = to.x - from.x, L = Math.hypot(nx, ny) || 1, off = U.rand(-1, 1) * (spread || 2100);
      let p = { x: U.clamp(mx + nx / L * off, 90, IC.WW - 90), y: U.clamp(my + ny / L * off, 90, IC.WH - 90) };
      // low routes turn at the lowest ground nearby, so they run along valleys
      if (low && k >= 9) for (let q = 0, h = IC.elevKm(p.x, p.y), p0 = p; q < 10; q++) { const a = U.rand(0, 6.28), d = U.rand(60, 300), c = { x: U.clamp(p0.x + Math.cos(a) * d, 90, IC.WW - 90), y: U.clamp(p0.y + Math.sin(a) * d, 90, IC.WH - 90) }, hc = IC.elevKm(c.x, c.y); if (hc < h) { h = hc; p = c; } }
      pts.push(p);
    }
    pts.push({ x: to.x, y: to.y });
    let len = 0; for (let i = 1; i < pts.length; i++) len += U.dist(pts[i - 1], pts[i]);
    const c = len + exposure(S, pts, low) * 200;
    if (c < bc) { bc = c; best = pts.slice(1); }
  }
  return best;
}
function routeLen(from, route) { let L = 0, p = from; for (const q of route) { L += U.dist(p, q); p = q; } return L; }

function newOp(S, type, label, extra) {
  const op = Object.assign({ id: IC.nid('op'), type, label, launched: 0, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time }, extra || {});
  S.enemy.ops.push(op);
  return op;
}
function later(S, dt, fn) { S.enemy.pending.push({ t: S.time + Math.max(0, dt), fn }); }
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
  drones(S, E, obj, n, op, arriveAt, harass) {
    const sites = S.esites.filter(s => s.kind === 'drone' && alive(s) && s.inv.owa >= 1);
    if (!sites.length) return 0;
    sites.sort((a, b) => U.dist(a, obj) - U.dist(b, obj));
    const s = Math.random() < 0.7 ? sites[0] : U.pick(sites);
    n = Math.min(Math.floor(s.inv.owa), n);
    const nj = !harass && E.escal >= 1.5 ? Math.min(Math.floor(s.inv.jdr || 0), U.randi(0, 3)) : 0;
    s.inv.owa -= n; if (nj) s.inv.jdr -= nj;
    for (let i = 0; i < n + nj; i++) {
      const type = i < n ? 'owa' : 'jdr';
      const aim = aimOn(obj);
      const route = planRoute(S, s, aim, true, harass ? 3000 : 2100);
      const T = routeLen(s, route) / IC.THR[type].spd;
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-120, 120) : i * U.rand(40, 140), () => {
        IC.spawnThreat(S, type, s.x + U.rand(-30, 30), s.y + U.rand(-30, 30), { route, aim: route[route.length - 1], target: obj.ref, op, origin: s });
        op.launched++;
      });
    }
    return n + nj;
  },
  cm(S, E, obj, n, op, arriveAt) {
    const sites = S.esites.filter(s => s.kind === 'cm' && alive(s) && ((s.inv.lacm || 0) + (s.inv.scm || 0) + (s.inv.mcm || 0)) >= 1);
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
      later(S, arriveAt ? arriveAt - S.time - T + U.rand(-40, 40) : i * 30, () => {
        IC.spawnThreat(S, type, from.x, from.y, { route, aim, target: obj.ref, op, origin: s });
        op.launched++;
        IC.sfx && IC.sfx.launch(from.x, from.y, 0.8);
      });
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
      later(S, arriveAt ? arriveAt - S.time - T - 300 : i * 30, () => IC.spawnThreat(S, 'sead', b.x, b.y, { home: b, mission: 'sead', route: [{ x: lp.x + i * 60, y: lp.y }], arms: 2, op, dcy: E.escal >= 1 ? 2 : 0, tgt }));
    }
    return 2;
  },
  bomber(S, E, obj, op, arriveAt) {
    const b = S.esites.find(s => s.kind === 'airbase' && alive(s) && (s.acAvail.bmr || 0) >= 1);
    if (!b) return 0;
    b.acAvail.bmr--;
    const st = standoff(obj, b, 500);
    const T = U.dist(b, st) / IC.THR.bmr.spd + U.dist(st, obj) / 2.4;
    later(S, arriveAt ? arriveAt - S.time - T : 0, () => IC.spawnThreat(S, 'bmr', b.x, b.y, { home: b, mission: 'bomber', route: [st], load: E.escal >= 2 ? 6 : 4, tgt: obj, op }));
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
      later(S, (arriveAt ? arriveAt - S.time - T : 0) + i * 25, () => IC.spawnThreat(S, 'str', b.x, b.y, { home: b, mission: 'strike', route: rp.map(p => ({ x: p.x + i * 20, y: p.y })), tgt: { x: obj.x, y: obj.y, ref: obj.ref, name: obj.name }, op, alt: 0.1, low: true, radarOn: false }));
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
      later(S, arriveAt ? arriveAt - S.time - T - 200 : i * 20, () => IC.spawnThreat(S, 'dcy', st.x + U.rand(-50, 50), st.y + U.rand(-50, 50), { route: [aim], aim, op }));
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

/* ---------- the campaign: objective → probe → harass → strike → assess ---------- */
const OBJ_NAMES = { airbase: 'neutralize an air base', ad: 'break the air defenses', industry: 'cripple war industry', terror: 'terrorize the cities', logistics: 'cut supply lines', front: 'support the ground offensive' };
function chooseObjective(S, E) {
  const opts = [];
  for (const k in E.objW) {
    if (k === 'front' && !S.fronts.some(f => f.active)) continue;
    const tg = pickTarget(S, k === 'ad' ? 'ad' : k === 'front' ? 'front' : k);
    if (!tg) continue;
    let w = E.objW[k];
    if (k === 'airbase') w *= 1 + S.air.filter(a => a.kind === 'ftr').length * 0.2;
    if (k === 'terror') w *= IC.nationalMorale(S) < 45 ? 1.8 : 0.8;
    if (k === 'ad') w *= 1 + S.units.filter(u => u.d.weapon === 'sam').length * 0.05;
    opts.push([{ k, tg }, w]);
  }
  const c = U.wpick(opts);
  if (!c) return null;
  return { kind: c.k, obj: c.tg, phase: 'probe', t0: S.time, next: S.time, probes: 0, strikes: 0, losses: 0, shots: 0, label: OBJ_NAMES[c.k] };
}
function probe(S, E, P) {
  const obj = P.obj;
  const op = newOp(S, 'probe', `probe towards ${obj.name}`, { plan: P });
  const r = Math.random();
  if (r < 0.45) W.drones(S, E, obj, U.randi(2, 4), op, 0, true);
  else if (r < 0.7) W.decoys(S, E, obj, U.randi(2, 3), op);
  else if (r < 0.85 && can(S, 'recon')) { OPS.recon(S, E, { x: obj.x + U.rand(-300, 300), y: obj.y + U.rand(-300, 300) }); }
  else feint(S, E, obj);
  P.probes++;
  P.next = S.time + U.rand(1500, 3000);
  if (P.probes >= U.randi(2, 4)) { P.phase = 'strike'; P.next = S.time + U.rand(2400, 6000); P.strikeT = P.next; }
}
/* fighters dash at the border and turn away: our radars and batteries light up for nothing */
function feint(S, E, obj) {
  const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.ftr >= 2).sort((p, q) => U.dist(p, obj) - U.dist(q, obj))[0];
  if (!b) return;
  const st = standoff(obj, b, 120);
  for (let i = 0; i < 2; i++) { b.acAvail.ftr--; IC.spawnThreat(S, 'ftr', b.x, b.y, { home: b, mission: 'feint', route: [{ x: st.x + i * 40, y: st.y }], feint: true }); }
  newOp(S, 'feint', 'fighters feint at the border');
}
function strike(S, E, P) {
  const obj = P.obj, esc = E.escal, M = E.method;
  // everything lands inside a few minutes of T, so T waits for the slowest launcher
  const T = S.time + Math.max(U.rand(2400, 3600), Math.min(7200, Math.max(balLead(S, obj, false), balLead(S, obj, true)) + 300));
  const op = newOp(S, 'strike', `major strike on ${obj.name}`, { plan: P, obj: obj.ref, arriveAt: T });
  let n = 0;
  // early in the war the enemy holds back: strikes grow as it mobilizes its arsenal
  const ramp = 0.55 + 0.45 * Math.min(1, (S.time - (E.warT || S.time)) / 129600);
  const big = (1 + esc * 0.5 + P.strikes * 0.25) * ramp;
  if (can(S, 'sead') && M.sead > 0.4 && Math.random() < 0.5 + esc * 0.15) n += W.sead(S, E, obj, op, T);
  if (can(S, 'drones')) n += W.drones(S, E, obj, Math.round((4 + esc * 3) * M.drones * ramp), op, T - 120);
  if (can(S, 'dcy') || esc >= 1) n += W.decoys(S, E, obj, Math.round((2 + esc) * ramp), op, T);
  if (can(S, 'cm')) n += W.cm(S, E, obj, Math.round((2 + esc * 1.5) * big * M.cm), op, T);
  if (can(S, 'bal') && M.bal > 0.4) n += W.bal(S, E, obj, Math.round((1 + esc) * M.bal), op, T, false);
  if (can(S, 'mrbm') && (esc >= 1.2 || P.kind === 'airbase') && Math.random() < 0.6) n += W.bal(S, E, obj, esc >= 2.5 ? 2 : 1, op, T, true);
  if (can(S, 'bomber') && esc >= 0.8 && M.bomber > 0.4 && Math.random() < 0.5) n += W.bomber(S, E, obj, op, T);
  if (can(S, 'disguise') && esc >= 0.6 && M.disguise > 0.4 && Math.random() < 0.35) n += W.disguise(S, E, obj, op);
  if (can(S, 'low') && M.low > 0.4 && Math.random() < 0.4) n += W.low(S, E, obj, op, T);
  P.strikes++;
  P.phase = 'assess'; P.next = T + U.rand(1800, 3600);
  if (n) {
    E.mood = `striking to ${P.label}`;
    IC.emit(S, 'enemyStrike', { op, obj });
    if (Math.random() < 0.5) IC.news(S, `Analysts warn ${S.world.names.A} is massing missiles and aircraft for a major raid.`);
  }
}
function assess(S, E, P) {
  const ops = E.ops.filter(o => o.plan === P && o.type === 'strike');
  const last = ops[ops.length - 1];
  const r = P.obj.ref;
  let success = false;
  if (r && r.fac) success = !IC.baseStatus(S, r).runway || r.fac.filter(f => (f.kind === 'hangar' || f.kind === 'has') && f.hp < f.max * 0.25).length >= 2;
  else if (r && r.infra) success = r.offline || r.hp < r.max * 0.5;
  else if (r) success = r.dead;
  const eff = last && last.launched ? last.hits / last.launched : 0;
  const cost = last && last.launched ? last.lost / last.launched : 0;
  E.history.push({ kind: P.kind, success, eff, cost, t: S.time });
  E.objW[P.kind] = U.clamp(E.objW[P.kind] * (success ? 1.1 : 0.8) * (cost > 0.7 ? 0.8 : 1), 0.3, 2.5);
  // methods that got through keep their share; the ones that died on the way are used less
  for (const k in E.method) E.method[k] = U.clamp(E.method[k] * 0.98 + 0.02, 0.2, 1.8);
  if (last) {
    for (const [type, st] of Object.entries(last.byType || {})) {
      const m = { owa: 'drones', jdr: 'drones', lacm: 'cm', mcm: 'cm', scm: 'cm', srbm: 'bal', marv: 'bal', mrbm: 'bal', sead: 'sead', bmr: 'bomber', str: 'low' }[type];
      if (!m) continue;
      const pass = st.n ? st.hit / st.n : 0;
      E.method[m] = U.clamp(E.method[m] * (0.85 + pass * 0.5), 0.3, 1.5);
    }
  }
  if (!success && P.strikes < 2 && Math.random() < 0.6) { P.phase = 'strike'; P.next = S.time + U.rand(3600, 7200); IC.log(S, 'warn', 'INTEL', `${S.world.names.A} is likely to strike ${P.obj.name} again.`); }
  else { E.plan = null; E.nextPlanT = S.time + U.rand(1800, 5400); }
  if (success) IC.news(S, `${S.world.names.A} claims its strike on ${P.obj.name} was a success.`);
  else if (last && last.launched >= 6 && eff < 0.2) { S.enemy.will = Math.max(0, S.enemy.will - 1.5); IC.news(S, `Air defenses blunt a major raid on ${P.obj.name}.`); }
}

/* harassment: cheap raids at odd hours so our radars stay lit, crews stay up and interceptors get spent */
function harass(S, E) {
  const night = IC.isNight(S);
  E.harassT = S.time + U.rand(1500, 4200) / (0.7 + E.escal * 0.2) * (night ? 0.7 : 1);
  const r = Math.random();
  const tg = E.plan && Math.random() < 0.6 ? E.plan.obj : pickTarget(S, U.pick(['terror', 'industry', 'ad', 'airbase']));
  if (!tg) return;
  const op = newOp(S, 'harass', `harassment raid towards ${tg.name}`);
  if (r < 0.55 && can(S, 'drones')) W.drones(S, E, tg, U.randi(1, 3), op, 0, true);
  else if (r < 0.75 && can(S, 'rkt')) OPS.rkt(S, E);
  else if (r < 0.9) feint(S, E, tg);
  else if (can(S, 'lm')) OPS.lm(S, E);
}

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
    const tgt = pickTarget(S, Math.random() < 0.5 ? 'convoy' : 'front');
    if (!tgt) return false;
    const s = S.esites.filter(x => x.kind === 'drone' && alive(x) && (x.inv.lm || 0) >= 2).sort((a, b) => U.dist(a, tgt) - U.dist(b, tgt))[0];
    if (!s) return false;
    const n = Math.min(Math.floor(s.inv.lm), U.randi(2, 4));
    s.inv.lm -= n;
    const op = newOp(S, 'lm', `loitering munitions hunting near ${tgt.name}`);
    for (let i = 0; i < n; i++) later(S, i * 60, () => { IC.spawnThreat(S, 'lm', s.x, s.y, { route: [{ x: tgt.x + U.rand(-120, 120), y: tgt.y + U.rand(-120, 120) }], aim: { x: tgt.x, y: tgt.y }, op, origin: s }); op.launched++; });
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
      for (const g of S.gunits) if (g.side === 'us' && !g.dead && U.dist(g, fp) < 780 && S.time - (g.spottedT || -1e9) < 7200) cands.push({ x: g.x, y: g.y, ref: g, name: g.name, w: 7 });
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
  ecas(S, E, g0) {
    const ours = S.gunits.filter(g => g.side === 'us' && !g.dead && g.front && g.front.active && g.order !== 'refit');
    if (!ours.length) return false;
    const g = g0 || U.pick(ours);
    const b = S.esites.filter(s => s.kind === 'airbase' && alive(s) && s.acAvail.str >= 2 && s.nat === g.front.key).sort((a, c) => U.dist(a, g) - U.dist(c, g))[0];
    if (!b) return false;
    const op = newOp(S, 'ecas', `air strike on ${g.name}`);
    const dir = Math.atan2(g.y - b.y, g.x - b.x);
    for (let i = 0; i < 2; i++) {
      b.acAvail.str--;
      const rp = { x: g.x - Math.cos(dir) * 560, y: g.y - Math.sin(dir) * 560 };
      later(S, i * 40, () => IC.spawnThreat(S, 'str', b.x, b.y, { home: b, mission: 'strike', route: [rp], tgt: { x: g.x, y: g.y, ref: g, name: g.name }, op }));
    }
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

/* ---------- enemy aircraft ---------- */
IC.moveEnemyAir = function (S, t, dt) {
  // gray-zone: fighters that fly alongside one of our airliners to make a point
  if (t.mission === 'shadow') {
    const v = t.shadow;
    t.shT = (t.shT || 0) + dt;
    if (!v || v.dead || t.shT > 1500) { t.mission = 'rtb'; t.route = [{ x: t.home.x, y: t.home.y }]; }
    else if (U.dist(t, v) > 30) t.route = [{ x: v.x + (t.side || 12), y: v.y + 8 }];
    else { t.side = t.side || (Math.random() < 0.5 ? -14 : 14); t.x = v.x - v.vy / (v.spd || 1) * t.side; t.y = v.y + v.vx / (v.spd || 1) * t.side; t.vx = v.vx; t.vy = v.vy; if (IC.inHome(t.x, t.y) && !t.violated) { t.violated = true; IC.emit(S, 'violation', t); } return; }
  }
  if (t.type === 'ftr' && !t.feint && !t.noFire) {
    t.cool = (t.cool || 0) - dt;
    if (t.aam == null) t.aam = 4;
    if (t.aam > 0 && t.cool <= 0) for (const a of S.air) {
      if (a.dead || a.gnd || U.dist(a, t) > 700 || a.allied) continue;
      if (t.border && IC.borderDist(a.x, a.y) > 600) continue;
      const close = U.dist(a, t) < 90;
      S.eaam.push({ x: t.x, y: t.y, a: Math.atan2(a.y - t.y, a.x - t.x), spd: close ? 9 : 11, target: a, pk: close ? 0.55 : 0.5, life: 70, src: t, ir: close });
      t.aam--; t.cool = 90; break;
    }
  }
  let tx, ty;
  if (t.route && t.route.length) {
    const p = t.route[0]; tx = p.x; ty = p.y;
    if (U.dxy(t.x, t.y, tx, ty) < t.spd * dt + 4) { t.route.shift(); if (!t.route.length) arriveAir(S, t); }
    // a disguised bomber leaving its airway is suddenly off-plan
    if (t.disguise && t.route.length === 1 && !t.offRoute) t.offRoute = true;
  } else if (t.mission === 'patrol' || t.mission === 'jam') {
    t.oa = (t.oa || 0) + dt * t.spd / 300;
    tx = t.st.x + Math.cos(t.oa) * 300; ty = t.st.y + Math.sin(t.oa) * 300;
    t.endur = (t.endur == null ? (t.mission === 'jam' ? t.jamT : 10800) : t.endur) - dt;
    if (t.endur <= 0) { t.mission = 'rtb'; t.jamming = false; t.route = [{ x: t.home.x, y: t.home.y }]; }
  }
  if (tx == null) { tx = t.x + (t.vx || 1); ty = t.y + (t.vy || 0); }
  let want = Math.atan2(ty - t.y, tx - t.x);
  if (t.notchT > 0 && t.notchA != null) want = t.notchA + Math.PI / 2;
  const cur = Math.atan2(t.vy || (ty - t.y), t.vx || (tx - t.x));
  const h = cur + U.clamp(U.angWrap(want - cur), -0.04 * dt, 0.04 * dt);
  t.vx = Math.cos(h) * t.spd; t.vy = Math.sin(h) * t.spd;
  t.x += t.vx * dt; t.y += t.vy * dt;
  if (t.low) t.alt = 0.1 + 0.05 * Math.sin(t.age * 0.05);
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
      // brigades carry their own shoulder-fired missiles
      const bg = t.tgt.ref && t.tgt.ref.gunit ? t.tgt.ref : S.gunits.find(g => g.side === 'us' && !g.dead && U.dist(g, t) < 500);
      if (bg && bg.kit.mpd > 0 && Math.random() < 0.12 + bg.kit.mpd * 0.03 * IC.wx(S).ir) {
        if (t.cm > 0 && Math.random() < 0.5) { t.cm--; IC.flares(S, t); }
        else { IC.killThreat(S, t, `${bg.name} air defense`); bg.kit.mpd = Math.max(0, bg.kit.mpd - 1); return; }
      }
      for (let i = 0; i < 2; i++) {
        const tg = t.tgt.ref && t.tgt.ref.side === 'us' && !t.tgt.ref.dead ? t.tgt.ref : t.tgt;
        const aim = tg.fac ? aimAtBase(tg) : { x: tg.x + U.rand(-10, 10), y: tg.y + U.rand(-10, 10) };
        IC.spawnThreat(S, 'glb', t.x, t.y, { route: [aim], aim, target: t.tgt.ref, op: t.op, alt0: t.low ? 1.5 : 7, dist0: U.dist(t, aim) });
        t.op.launched++;
      }
      IC.weaponRelease(S, t);
      t.low = false; t.alt = 7;
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

/* ---------- enemy convoys (interdiction targets) ---------- */
function runConvoys(S) {
  for (const f of S.fronts) {
    if (!f.active) continue;
    const st = S.esites.find(s => s.nat === f.key && s.kind === 'staging' && !s.destroyed);
    if (!st) continue;
    for (const d of S.esites.filter(s => s.nat === f.key && s.kind === 'supply' && !s.destroyed)) {
      if (d.stock > 240 || S.evehicles.filter(v => v.to === d && !v.dead).length) continue;
      S.evehicles.push({ id: IC.nid('ev'), evehicle: true, name: `${S.world.names[f.key]} supply convoy`, x: st.x, y: st.y, h: 0, route: [{ x: d.x, y: d.y }], to: d, trucks: 4, load: 60, kx: 0, ky: 0, kt: -1e9, known: false });
    }
  }
}
IC.enemyConvoyHit = function (S, v, by) {
  if (v.dead) return;
  v.trucks--; v.load = Math.max(0, v.load - 15);
  IC.explode(S, v.x, v.y, 0.6, 'us');
  S.wrecks.push({ x: v.x + U.rand(-4, 4), y: v.y + U.rand(-4, 4), type: 'etruck', t: S.time, h: v.h || 0 });
  if (v.trucks <= 0) { v.dead = true; IC.log(S, 'kill', 'INTERDICT', `Enemy supply convoy destroyed by ${by}.`, v); S.enemy.will = Math.max(0, S.enemy.will - 0.8); IC.emit(S, 'convoyKill', v); }
};
function moveConvoys(S, dt) {
  for (const v of S.evehicles) {
    if (v.dead) continue;
    if (IC.followRoute(v, dt, 0.2, 0.2)) { v.dead = true; v.arrived = true; v.to.stock = Math.min(300, (v.to.stock || 0) + v.load); }
  }
  S.evehicles = S.evehicles.filter(v => !v.dead);
}

/* ---------- commander ---------- */
function ensurePatrols(S) {
  for (const b of S.esites.filter(s => s.kind === 'airbase' && !s.destroyed && !s.dormant)) {
    const f = S.fronts.find(x => x.key === b.nat); if (!f) continue;
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
  const op = newOp(S, 'strike', `opening strike on ${ab.name}`, { obj: ab });
  const T = S.time + 1500;
  W.bal(S, E, obj, 3, op, T, false);
  W.cm(S, E, obj, 3, op, T);
  const pw = S.infra.find(i => i.kind === 'power');
  if (pw) W.drones(S, E, { x: pw.x, y: pw.y, ref: pw, name: pw.name }, 5, newOp(S, 'drones', `drones at ${pw.name}`), 0);
  E.escal = esc;
  E.plan = { kind: 'airbase', obj, phase: 'assess', t0: S.time, next: T + 2400, probes: 3, strikes: 1, label: OBJ_NAMES.airbase };
  IC.emit(S, 'war', {});
};
IC.enemyForceOp = function (S, name, target, n) {
  const E = S.enemy, obj = target ? Object.assign({ name: target.name || 'target' }, target) : null;
  if (name === 'recon') return OPS.recon(S, E, target);
  if (name === 'rkt') return OPS.rkt(S, E, target);
  if (name === 'lm') return OPS.lm(S, E);
  if (name === 'ecas') return OPS.ecas(S, E, target);
  if (name === 'hgv') return OPS.hgv(S, E, obj);
  const op = newOp(S, name, `${name} at ${obj ? obj.name : 'target'}`);
  let T = S.time + (n && n.T || 1200);
  if (n && n.T && (name === 'bal' || name === 'mrbm')) T = Math.max(T, S.time + balLead(S, obj, name === 'mrbm') + 120);
  if (name === 'drones') W.drones(S, E, obj, n && n.n || n || 6, op, 0);
  else if (name === 'cm') W.cm(S, E, obj, n && n.n || n || 3, op, n && n.T ? T : 0);
  else if (name === 'bal') W.bal(S, E, obj, n && n.n || n || 2, op, n && n.T ? T : 0, false);
  else if (name === 'mrbm') W.bal(S, E, obj, n && n.n || n || 1, op, n && n.T ? T : 0, true);
  else if (name === 'bomber') W.bomber(S, E, obj, op, n && n.T ? T : 0);
  else if (name === 'disguise') W.disguise(S, E, obj, op);
  else if (name === 'low') W.low(S, E, obj, op, 0);
  else if (name === 'sead') W.sead(S, E, obj, op, 0);
  else if (name === 'decoys') W.decoys(S, E, obj, n || 3, op, 0);
  else if (name === 'strike') { const P = { kind: 'airbase', obj, phase: 'strike', probes: 3, strikes: 0, label: 'strike' }; strike(S, E, P); }
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
  if (type === 'assault' && S.enemy.war) { OPS.ecas(S, S.enemy); if (Math.random() < 0.6) OPS.rkt(S, S.enemy, IC.secGeom(d.f, d.si)); }
});

IC.enemyTick = function (S, dt) {
  const E = S.enemy;
  if (E.war) E.escal = Math.min(4, E.escalBase + (S.time - (E.warT || S.time)) / 86400 * 0.8 + (E.bump || 0));
  if (E.pending.length) {
    const due = E.pending.filter(p => p.t <= S.time);
    if (due.length) { E.pending = E.pending.filter(p => p.t > S.time); for (const p of due) p.fn(); }
  }
  IC.updateTels(S, dt);
  moveConvoys(S, dt);
  E.intelT -= dt;
  if (E.intelT <= 0) { E.intelT = 30; updateIntel(S); for (const k in E.danger) E.danger[k] *= 0.995; }
  E.patrolT -= dt;
  if (E.patrolT <= 0) { E.patrolT = 300; ensurePatrols(S); }
  E.convoyT -= dt;
  if (E.convoyT <= 0) { E.convoyT = 1200; runConvoys(S); }
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
  // retaliation after our strikes on their territory
  if (E.retaliate > 0 && S.time > (E.retT || 0) && can(S, 'bal')) {
    E.retaliate = 0; E.retT = S.time + 5400;
    const tgt = pickTarget(S, 'bal') || pickTarget(S, 'terror');
    if (tgt) { const op = newOp(S, 'retaliate', `retaliation on ${tgt.name}`); if (!W.bal(S, E, tgt, 2, op, 0, false)) W.cm(S, E, tgt, 3, op, 0); E.mood = 'retaliating'; IC.news(S, `${S.world.names.A} vows retaliation after strikes on its territory.`); }
  }
  if (S.time > E.harassT) harass(S, E);
  if (!E.plan && S.time > (E.nextPlanT || 0)) {
    E.plan = chooseObjective(S, E);
    if (E.plan) { E.mood = `probing: ${E.plan.label}`; if (Math.random() < 0.5) IC.log(S, 'info', 'INTEL', `Enemy air activity suggests a new objective: ${E.plan.label}.`); }
  }
  const P = E.plan;
  if (P && S.time >= P.next) {
    if (P.phase === 'probe') probe(S, E, P);
    else if (P.phase === 'strike') strike(S, E, P);
    else if (P.phase === 'assess') assess(S, E, P);
  }
  if (S.time > (E.nextThink || 0)) {
    E.nextThink = S.time + U.rand(2400, 5400) / (0.6 + E.escal * 0.3);
    const r = Math.random();
    if (r < 0.25 && can(S, 'lm') && S.fronts.some(f => f.active)) OPS.lm(S, E);
    else if (r < 0.4 && can(S, 'rkt')) OPS.rkt(S, E);
    else if (r < 0.5 && can(S, 'recon')) OPS.recon(S, E);
    else if (r < 0.56 && can(S, 'hgv')) OPS.hgv(S, E);
  }
};

})(window.IC);
