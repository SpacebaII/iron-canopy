/* Iron Canopy — the ground war. A dozen big brigades a side, not thirty counters. Fronts are split into sectors;
   each sector resolves combat from the brigades in it, their terrain, how dug in they are, their anti-tank kit,
   artillery and air support. Towns matter: they produce, they are worth taking, and a town with a garrison
   holds while the garrison does, even when the line flows past it. */
(function (IC) {
'use strict';
const U = IC.U;

const ORD = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const compassName = a => ['Eastern', 'South-Eastern', 'Southern', 'South-Western', 'Western', 'North-Western', 'Northern', 'North-Eastern'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
const LINE = new Set(['hold', 'dig', 'attack']);

let usNos = [];
function makeG(S, side, type, front, x, y, nat) {
  const g = IC.GTYPES[type];
  let n;
  if (side === 'us') { do { n = U.randi(1, 60); } while (usNos.includes(n)); usNos.push(n); }
  else n = U.randi(1, 150);
  const u = { id: IC.nid('g'), gunit: true, side, type, g, name: `${ORD(n)} ${g.short} Bde`, front, sector: -1, order: side === 'us' ? 'reserve' : 'staging',
    str: 100, sup: side === 'us' ? 75 : 100, mor: side === 'us' ? 72 : 80, exp: side === 'us' ? 0.1 : 0.15, fort: 0,
    kit: { atgm: type === 'inf' ? 10 : type === 'mech' ? 6 : 0, mpd: type === 'art' ? 2 : 4 }, ad: type === 'art' ? 0.5 : 1,
    x, y, route: null, manual: false, known: false, kx: x, ky: y, kt: -1e9, nat, h: 0, obj: null, moving: true };
  S.gunits.push(u);
  return u;
}
IC.makeBrigade = makeG;

IC.groundInit = function (S, academy) {
  const W = S.world;
  usNos = [];
  const used = new Set();
  S.fronts = W.fronts.map(f => {
    const mid = f.pts[Math.floor(f.pts.length / 2)];
    const ang = Math.atan2(mid.y - W.cy, mid.x - W.cx);
    let cmdName; do { cmdName = U.pick(IC.CMD_NAMES); } while (used.has(cmdName)); used.add(cmdName);
    return {
      key: f.key, enemy: W.names[f.key], name: `${compassName(ang)} Front`,
      pts: f.pts.map(p => ({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, d: 0 })),
      sectors: f.sectors.map((s, i) => ({ i0: s.i0, i1: s.i1, name: `${f.key === 'A' ? 'N' : 'E'}-${i + 1}`, eAttack: false, eUntil: 0, probe: false, usAttack: false, casUs: 0, casThem: 0, F: 0, E: 0, push: 0, seen: 1 })),
      active: false, stance: 'defend', supplyPri: 1, airShare: f.key === 'A' ? 0.6 : 0.4,
      cmd: { name: cmdName, trait: U.pick(Object.keys(IC.TRAITS)) }, ecmd: { phase: 'probe', nextPlan: 0, reinfT: 0, fails: {}, probeRes: {} }, t0: 0
    };
  });
  if (academy) return;
  const gar = W.garrisons.length ? W.garrisons : [{ x: W.cx, y: W.cy }];
  const ours = { A: ['inf', 'inf', 'mech', 'arm', 'art'], B: ['inf', 'mech', 'art'] };
  const theirs = { A: ['arm', 'arm', 'mech', 'mech', 'mech', 'inf', 'inf', 'art', 'art'], B: ['arm', 'mech', 'mech', 'inf', 'art'] };
  for (const f of S.fronts) {
    const m = f.pts[Math.floor(f.pts.length / 2)];
    const garN = gar.slice().sort((a, b) => U.dist(a, m) - U.dist(b, m));
    (ours[f.key] || []).forEach((t, i) => { const g0 = garN[i % Math.min(2, garN.length)]; makeG(S, 'us', t, f, g0.x + U.rand(-90, 90), g0.y + U.rand(-90, 90)); });
    const st = S.esites.find(s => s.nat === f.key && s.kind === 'staging');
    (theirs[f.key] || []).forEach(t => makeG(S, 'them', t, f, st.x + U.rand(-180, 180), st.y + U.rand(-180, 180), f.key));
  }
  // peacetime: our brigades garrison their sectors
  for (const f of S.fronts) {
    const mine = S.gunits.filter(g => g.side === 'us' && g.front === f);
    const line = mine.filter(g => g.type !== 'art');
    line.forEach((g, i) => { g.sector = Math.round((i + 0.5) * f.sectors.length / line.length - 0.5); g.order = 'hold'; });
    for (const g of mine.filter(g => g.type === 'art')) { g.sector = Math.floor(f.sectors.length / 2); g.order = 'hold'; }
    for (const g of mine) { const p = targetPos(S, g); g.x = p.x + U.rand(-30, 30); g.y = p.y + U.rand(-30, 30); }
  }
};

/* ---------- geometry ---------- */
IC.linePt = (f, i) => { const p = f.pts[i]; return { x: p.x + p.nx * p.d, y: p.y + p.ny * p.d }; };
IC.secGeom = function (f, si) {
  const s = f.sectors[si];
  let x = 0, y = 0, nx = 0, ny = 0, n = 0;
  for (let i = s.i0; i <= s.i1; i++) { const p = f.pts[i]; x += p.x + p.nx * p.d; y += p.y + p.ny * p.d; nx += p.nx; ny += p.ny; n++; }
  const L = Math.hypot(nx, ny) || 1;
  const a = f.pts[s.i0], b = f.pts[s.i1];
  return { x: x / n, y: y / n, nx: nx / L, ny: ny / L, tx: -ny / L, ty: nx / L, len: U.dist(a, b) };
};
function nearestOnFront(f, x, y) {
  let best = null, bd = 1e9;
  for (let i = 0; i + 1 < f.pts.length; i++) {
    const a = f.pts[i], b = f.pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = U.clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1);
    const d = U.dxy(x, y, a.x + dx * t, a.y + dy * t);
    if (d < bd) { bd = d; best = { i, a, b, t, d }; }
  }
  return best;
}
/* signed depth of a point behind the border along the front normal, and the line depth there */
function frontDepth(f, x, y) {
  const n = nearestOnFront(f, x, y); if (!n) return null;
  const { a, b, t } = n;
  const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t;
  const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
  return { depth: (x - px) * nx + (y - py) * ny, line: a.d + (b.d - a.d) * t, i: n.i, t, dist: n.d };
}
IC.frontDepth = frontDepth;
IC.enemyHeld = function (S, x, y) {
  for (const f of S.fronts) {
    if (!f.active) continue;
    const q = frontDepth(f, x, y);
    if (!q || q.dist > 4500) continue;
    if (q.depth > -5 && q.depth < q.line) return f;
  }
  return null;
};
/* ground we hold beyond the border */
IC.usHeld = function (S, x, y) {
  for (const f of S.fronts) {
    if (!f.active) continue;
    const q = frontDepth(f, x, y);
    if (!q || q.dist > 4500) continue;
    if (q.depth < 5 && q.depth > q.line) return f;
  }
  return null;
};
IC.sectorAt = function (S, x, y) {
  let best = null, bd = 1e9;
  for (const f of S.fronts) f.sectors.forEach((s, i) => { const G = IC.secGeom(f, i), d = U.dist(G, { x, y }); if (d < bd) { bd = d; best = { f, i, d }; } });
  return best;
};

/* ---------- combat power ---------- */
function terrainF(S, u) {
  const k = S.world.terrainAt(u.x, u.y);
  let f = IC.TERRAIN_DEF[k] || 1;
  if (u.g.soft && (k === 'urban' || k === 'forest')) f *= 1.15;
  if (u.g.armor && (k === 'urban' || k === 'forest')) f *= 0.85;
  return f;
}
IC.terrainOf = (S, u) => S.world.terrainAt(u.x, u.y);
function power(S, u, attacking, armorShare) {
  const g = u.g, f = u.front;
  const supF = 0.35 + 0.65 * Math.min(1, u.sup / 60), morF = 0.6 + 0.4 * u.mor / 100, expF = 1 + u.exp * 0.4;
  let p = (u.str / 100) * (attacking ? g.att : g.def) * supF * morF * expF;
  if (!attacking) {
    p *= terrainF(S, u) * (1 + u.fort * 0.8);
    if (u.kit.atgm > 0 && armorShare > 0) p *= 1 + Math.min(0.5, u.kit.atgm / 40) * armorShare * (IC.hasTech(S, 'g_atgm') && u.side === 'us' ? 1.2 : 1);
  }
  if (u.side === 'us' && attacking && f.cmd.trait === 'aggressive') p *= 1.2;
  return p;
}
IC.gpower = power;
function artyPower(S, u) {
  const g = u.g; if (!g.fire) return 0;
  let p = (u.str / 100) * g.fire * (0.3 + 0.7 * Math.min(1, u.sup / 50));
  if (u.side === 'us') { if (u.front.cmd.trait === 'gunner') p *= 1.3; if (IC.hasTech(S, 'g_arty')) p *= 1.3; }
  return p;
}

/* ---------- orders ---------- */
IC.orderGround = function (S, u, order, o) {
  o = o || {};
  if (order === 'defend') {
    const town = o.town || nearestTown(S, u);
    if (!town) return false;
    u.obj = town;
    const sa = IC.sectorAt(S, town.x, town.y); if (sa) { u.front = sa.f; u.sector = sa.i; }
  } else u.obj = null;
  if (o.sector != null) { u.front = o.front || u.front; u.sector = o.sector; }
  if (u.sector < 0) u.sector = Math.floor(u.front.sectors.length / 2);
  if (order !== u.order && u.order === 'dig' && u.fort > 0.3) IC.log(S, 'info', 'GROUND', `${u.name} leaves its prepared positions.`, u);
  u.order = order; u.manual = o.manual !== false; u.route = null;
  IC.emit(S, 'gorder', { u, order });
  return true;
};
IC.releaseToCommander = u => { u.manual = false; };
function nearestTown(S, u) {
  let best = null, bd = 1e9;
  for (const c of IC.cities(S)) { const d = U.dist(c, u); if (d < bd && c.owner === 'us') { bd = d; best = c; } }
  return best;
}

function targetPos(S, u) {
  const f = u.front;
  if (u.order === 'staging') { if (!u.rp) { const st = S.esites.find(s => s.nat === f.key && s.kind === 'staging'); u.rp = { x: st.x + U.rand(-160, 160), y: st.y + U.rand(-160, 160) }; } return u.rp; }
  if (u.order === 'refit') {
    if (!u.rp) {
      if (u.side === 'us') { const m = (IC.musterPoints ? IC.musterPoints(S) : []).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0] || IC.cap(S); u.rp = { x: m.x + U.rand(-70, 70), y: m.y + U.rand(-70, 70) }; }
      else { const st = S.esites.find(s => s.nat === f.key && s.kind === 'staging'); u.rp = { x: st.x + U.rand(-120, 120), y: st.y + U.rand(-120, 120) }; }
    }
    return u.rp;
  }
  u.rp = null;
  if (u.order === 'defend' && u.obj) return { x: u.obj.x + (u.id.charCodeAt(1) % 5 - 2) * 8, y: u.obj.y + (u.id.charCodeAt(2) % 5 - 2) * 8 };
  const si = u.sector < 0 ? Math.floor(f.sectors.length / 2) : Math.min(u.sector, f.sectors.length - 1);
  const G = IC.secGeom(f, si);
  const mates = S.gunits.filter(o => o.side === u.side && !o.dead && o.front === f && o.sector === si && (o.order === u.order || (LINE.has(o.order) && LINE.has(u.order))) && (o.type === 'art') === (u.type === 'art'));
  const j = mates.indexOf(u), n = mates.length;
  const lat = n > 1 ? (j - (n - 1) / 2) * Math.min(300, G.len / n) : 0;
  const s = u.side === 'us' ? 1 : -1;
  const depth = u.type === 'art' ? 300 : u.order === 'reserve' ? 600 : 100;
  return { x: G.x + G.nx * depth * s + G.tx * lat, y: G.y + G.ny * depth * s + G.ty * lat };
}
IC.gTargetPos = targetPos;

function moveUnits(S, dt) {
  for (const u of S.gunits) {
    if (u.dead) continue;
    const t = targetPos(S, u);
    const d = U.dist(u, t);
    u.moving = d > 200;
    if (d < 3) continue;
    const spd = u.g.spd * (u.sup < 15 ? 0.6 : 1);
    if (u.side === 'us' && d > 900 && !u.route) u.route = IC.route(u.x, u.y, t.x, t.y);
    if (u.route) {
      if (IC.followRoute(u, dt, spd * 2, spd)) u.route = null;
      else { const last = u.route[u.route.length - 1]; if (U.dxy(last.x, last.y, t.x, t.y) > 400) u.route = null; }
    } else {
      const step = Math.min(d, spd * dt);
      u.h = Math.atan2(t.y - u.y, t.x - u.x);
      u.x += (t.x - u.x) / d * step; u.y += (t.y - u.y) / d * step;
    }
    if (u.moving && u.fort > 0) u.fort = Math.max(0, u.fort - dt / 3600 * 0.5);
  }
}

/* ---------- our front commanders ---------- */
function ourCommander(S, f) {
  const mine = S.gunits.filter(u => u.side === 'us' && !u.dead && u.front === f);
  const auto = mine.filter(u => !u.manual);
  const secs = f.sectors;
  const threat = secs.map((s, i) => {
    let t = 0;
    for (const e of S.gunits) if (e.side === 'them' && !e.dead && e.front === f && e.sector === i && LINE.has(e.order)) t += power(S, e, s.eAttack, 0);
    t += s.eAttack ? 1.5 : 0;
    t += Math.max(0, (f.pts[s.i0].d + f.pts[s.i1].d) / 2) / 600;
    return t;
  });
  for (const u of auto) {
    if (u.order === 'refit') { if (u.str > 75 && u.sup > 60 && u.mor > 55) { u.order = 'reserve'; u.sector = threat.indexOf(Math.max(...threat)); IC.log(S, 'info', 'GROUND', `${u.name} back to strength and returning to the front.`, u); } continue; }
    if (u.str < 30 || u.mor < 25) { u.order = 'refit'; IC.log(S, 'warn', 'GROUND', `${u.name} withdrawn to refit (${Math.round(u.str)}% strength).`, u); }
  }
  const avail = auto.filter(u => u.order !== 'refit' && u.order !== 'defend');
  const order = secs.map((_, i) => i).sort((a, b) => threat[b] - threat[a]);
  const top = order[0];
  // every sector needs someone in it; holders stay put unless a sector is empty
  const covered = new Set(mine.filter(u => LINE.has(u.order) && u.type !== 'art' && u.sector >= 0).map(u => u.sector));
  const spare = avail.filter(u => u.type !== 'art' && !LINE.has(u.order)).sort((a, b) => (a.type === 'arm') - (b.type === 'arm'));
  for (const si of order) {
    if (covered.has(si) || !spare.length) continue;
    const G = IC.secGeom(f, si);
    spare.sort((a, b) => (a.type === 'arm') - (b.type === 'arm') || U.dist(a, G) - U.dist(b, G));
    const u = spare.shift();
    u.sector = si; u.order = 'hold'; covered.add(si);
  }
  // armor waits in reserve behind the most threatened sector and counterattacks when the stance allows
  for (const u of avail.filter(x => x.type === 'arm' && (x.order === 'reserve' || x.order === 'attack'))) {
    if (u.sector < 0 || threat[u.sector] < threat[top] * 0.6) u.sector = top;
    const s = secs[u.sector];
    const lost = (f.pts[s.i0].d + f.pts[s.i1].d) / 2;
    const go = f.stance === 'offensive' || (f.stance === 'active' && (lost > 150 || s.eAttack));
    u.order = go ? 'attack' : 'reserve';
  }
  // quiet sectors dig in; under the offensive stance, sectors with a clear edge attack
  for (const u of avail.filter(x => LINE.has(x.order) && x.type !== 'art' && x.type !== 'arm')) {
    const s = secs[u.sector];
    if (f.stance === 'offensive' && s.F > s.E * 1.4 && !s.eAttack) u.order = 'attack';
    else if (u.order === 'attack' && (s.F < s.E * 1.1 || f.stance === 'defend')) u.order = 'hold';
    else if (u.order === 'hold' && f.stance !== 'offensive' && !u.moving && u.fort < 0.9) u.order = 'dig';
  }
  for (const u of avail.filter(x => x.type === 'art')) { if (u.sector < 0 || threat[u.sector] < threat[top] * 0.6) u.sector = top; u.order = 'hold'; }
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    s.usAttack = mine.some(u => u.sector === i && u.order === 'attack' && !u.moving) && s.F > s.E * 1.05;
  }
}

/* ---------- enemy ground commander: probe, then commit, then regroup ---------- */
function enemyCommander(S, f) {
  const E = f.ecmd;
  const forces = S.gunits.filter(u => u.side === 'them' && !u.dead && u.front === f);
  for (const u of forces) {
    if (u.order === 'refit' && u.str > 70 && u.sup > 60) { u.order = 'reserve'; }
    if (LINE.has(u.order) && (u.str < 28 || u.mor < 20)) u.order = 'refit';
  }
  if (S.time < E.nextPlan) return;
  const secs = f.sectors;
  const ready = forces.filter(u => u.order !== 'refit' && u.str > 40);
  const ours = i => { let p = 0; for (const u of S.gunits) if (u.side === 'us' && !u.dead && u.front === f && u.sector === i && (LINE.has(u.order) || u.order === 'defend')) p += power(S, u, false, 0.4); return p; };
  const value = i => { let v = 0; const G = IC.secGeom(f, i); for (const c of IC.cities(S)) if (c.owner === 'us' && U.dist(c, G) < 1500) v += Math.sqrt(c.pop) / 10 + c.ind / 20; return v; };
  // hold every sector thinly
  const holders = ready.filter(u => u.type === 'inf' || u.type === 'mech');
  secs.forEach((s, i) => { const u = holders.find(h => h.sector === i && LINE.has(h.order)) || holders.find(h => !LINE.has(h.order)); if (u) { u.sector = i; u.order = 'hold'; holders.splice(holders.indexOf(u), 1); } });
  for (const s of secs) { s.eAttack = false; s.probe = false; }
  if (E.phase === 'probe') {
    // light attacks in two or three sectors to see where we are thin
    const picks = secs.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, Math.min(3, secs.length));
    for (const i of picks) { secs[i].eAttack = true; secs[i].probe = true; secs[i].eUntil = S.time + 7200; secs[i].gain0 = avgD(f, i); }
    E.probeSecs = picks; E.phase = 'assault'; E.nextPlan = S.time + 7200;
    if (f.active) IC.log(S, 'warn', 'GROUND', `${f.enemy} probing attacks along the ${f.name}.`, IC.secGeom(f, picks[0]));
    for (const u of ready.filter(u => u.type === 'arm')) { u.order = 'reserve'; }
  } else if (E.phase === 'assault') {
    // commit the armor where the probes found us weakest, weighed against what is worth taking and past failures
    const score = secs.map((s, i) => (E.probeRes[i] != null ? E.probeRes[i] * 2 : 0) + value(i) + 3 / (0.5 + ours(i)) - (E.fails[i] || 0) * 1.2 + Math.random());
    const order = secs.map((_, i) => i).sort((a, b) => score[b] - score[a]);
    const main = order[0], second = order[1];
    const assault = ready.filter(u => u.type === 'arm' || (u.type === 'mech' && !LINE.has(u.order))).sort((a, b) => b.str - a.str);
    assault.forEach((u, k) => { u.sector = k < Math.ceil(assault.length * 0.7) || second == null ? main : second; u.order = 'attack'; });
    for (const u of ready.filter(u => u.type === 'art')) { u.sector = main; u.order = 'hold'; }
    const dur = U.rand(5, 9) * 3600;
    secs[main].eAttack = true; secs[main].eUntil = S.time + dur; secs[main].gain0 = avgD(f, main); secs[main].main = true;
    if (second != null && Math.random() < 0.6) { secs[second].eAttack = true; secs[second].eUntil = S.time + dur * 0.6; secs[second].gain0 = avgD(f, second); }
    E.mainSec = main; E.phase = 'regroup'; E.nextPlan = S.time + dur;
    IC.log(S, 'warn', 'GROUND', `Intelligence: ${f.enemy} massing armor for a major assault on sector ${secs[main].name}, ${f.name}.`, IC.secGeom(f, main));
    IC.emit(S, 'assault', { f, si: main });
  } else {
    for (const u of ready.filter(u => u.type === 'arm')) u.order = 'reserve';
    E.phase = 'probe'; E.probeRes = {}; E.nextPlan = S.time + U.rand(2, 4) * 3600;
  }
}
const avgD = (f, i) => (f.pts[f.sectors[i].i0].d + f.pts[f.sectors[i].i1].d) / 2;

/* ---------- combat ---------- */
function combat(S, f, dt) {
  const h = dt / 3600;
  const tr = f.cmd.trait;
  const E = f.ecmd;
  for (let i = 0; i < f.sectors.length; i++) {
    const s = f.sectors[i];
    if (s.eAttack && S.time > s.eUntil) {
      s.eAttack = false;
      const gained = avgD(f, i) - (s.gain0 || 0);
      if (s.probe) E.probeRes[i] = gained / 100 + (s.E / Math.max(0.1, s.F)) * 0.5;
      else if (gained < 90) { E.fails[i] = (E.fails[i] || 0) + 1; S.enemy.will = Math.max(0, S.enemy.will - (s.main ? 3 : 1.5)); IC.log(S, 'kill', 'GROUND', `The ${f.enemy} assault on ${s.name} has stalled.`, IC.secGeom(f, i)); IC.emit(S, 'assaultStalled', { f, si: i }); }
      s.main = false; s.probe = false;
    }
    const inSec = u => !u.dead && u.front === f && u.sector === i && !u.moving;
    const us = S.gunits.filter(u => u.side === 'us' && inSec(u) && (LINE.has(u.order) || (u.order === 'defend' && u.obj && U.dist(u.obj, IC.secGeom(f, i)) < 900)));
    const them = S.gunits.filter(u => u.side === 'them' && inSec(u) && LINE.has(u.order));
    const adj = S.gunits.filter(u => !u.dead && u.front === f && u.type === 'art' && Math.abs(u.sector - i) === 1 && !u.moving && LINE.has(u.order));
    let eStr = 0, eArm = 0; for (const u of them) { eStr += u.str; if (u.g.armor) eArm += u.str; }
    const armorShare = eStr ? eArm / eStr : 0;
    let F = 0, Fa = 0, En = 0, Ea = 0;
    const attackingUs = s.usAttack;
    for (const u of us) { if (u.type === 'art') Fa += artyPower(S, u); else F += power(S, u, attackingUs && u.order === 'attack', armorShare); }
    for (const u of them) { if (u.type === 'art') Ea += artyPower(S, u); else En += power(S, u, s.eAttack, 0); }
    for (const u of adj) { if (u.side === 'us') Fa += artyPower(S, u) * 0.6; else Ea += artyPower(S, u) * 0.6; }
    const Ft = F + Fa * 0.5 + s.casUs + (us.length ? 0 : 0.05);
    const Et = En * (s.probe ? 0.5 : 1) + Ea * 0.5 + s.casThem + (them.length ? 0 : 0.05);
    s.F = Ft; s.E = Et;
    let push = 0;
    const lineUs = us.filter(u => u.type !== 'art').length;
    if (s.eAttack && them.length) push = 36 * (Et - Ft * 1.1) / (Et + Ft) * (tr === 'cautious' ? 1.2 : 1) * (s.probe ? 0.5 : 1);
    else if (s.usAttack && lineUs) push = -30 * (Ft - Et * 1.15) / (Et + Ft);
    else if (!them.length && lineUs) push = -8;
    if (!lineUs && them.length) push = Math.max(push, s.eAttack ? 45 : 12);
    s.push = push;
    const intensity = s.eAttack ? (s.probe ? 0.5 : 1) : s.usAttack ? 0.8 : (us.length && them.length ? 0.15 : 0);
    for (let k = s.i0; k <= s.i1; k++) {
      const p = f.pts[k];
      const wgt = (k === s.i0 || k === s.i1) ? 0.5 : 1;
      p.d = U.clamp(p.d + push * h * wgt, -900, 3900);
    }
    // fighting positions
    for (const u of us) {
      if (u.moving) continue;
      const rate = (u.order === 'dig' ? 0.14 : 0.03) * (tr === 'engineer' ? 2 : 1) * (IC.hasTech(S, 'g_fort') ? 2 : 1);
      const cap = u.order === 'dig' ? (IC.hasTech(S, 'g_fort') ? 1 : 0.8) : 0.3;
      if (u.order === 'attack') u.fort = Math.max(0, u.fort - h * 0.4);
      else if (u.fort < cap) u.fort = Math.min(cap, u.fort + h * rate * (intensity > 0.5 ? 0.3 : 1));
    }
    if (intensity > 0) {
      const ourLoss = intensity * 6 * Et / (Ft + Et) * (tr === 'cautious' ? 0.8 : tr === 'aggressive' ? 1.15 : 1);
      const theirLoss = intensity * 6 * Ft / (Ft + Et) * (IC.hasTech(S, 'g_fpv') ? 1.25 : 1);
      for (const u of us) {
        u.str -= ourLoss * h * (u.type === 'art' ? 0.3 : 1) * U.rand(0.7, 1.3) / (1 + u.fort * 0.5);
        u.mor -= ourLoss * h * 0.7; u.exp = Math.min(0.6, u.exp + h * 0.01);
        // anti-tank teams firing at attacking armor
        if (armorShare > 0.2 && u.kit.atgm > 0 && s.eAttack) {
          const used = Math.min(u.kit.atgm, intensity * 7.5 * h);
          u.kit.atgm = Math.max(0, u.kit.atgm - used);
          for (const e of them) if (e.g.armor || e.type === 'mech') e.str -= used * 0.35 * (e.g.armor ? 1.4 : 0.8);
        }
      }
      for (const u of them) { u.str -= theirLoss * h * (u.type === 'art' ? 0.3 : 1) * U.rand(0.7, 1.3); u.mor -= theirLoss * h * 0.6; }
    }
    s.casUs *= Math.exp(-dt / 1800); s.casThem *= Math.exp(-dt / 1800);
    // shellfire lights up the line and scars it
    if (intensity > 0 && Math.random() < dt * 0.2 * intensity) {
      const t = Math.random(), a = IC.linePt(f, s.i0), b = IC.linePt(f, s.i1);
      const G = IC.secGeom(f, i), side = Math.random() < 0.5 ? 1 : -1;
      const x = a.x + (b.x - a.x) * t + G.nx * side * U.rand(10, 140), y = a.y + (b.y - a.y) * t + G.ny * side * U.rand(10, 140);
      S.fx.flashes.push({ x, y, t: 0, r: U.rand(18, 34), wr: 3 });
      IC.part(S, { x, y, vy: -5, life: U.rand(1.5, 3), size: U.rand(3, 6), grow: 6, col: '110,110,110', a: 0.35 });
      if (Math.random() < 0.35) IC.addScar(S, { kind: 'crater', x, y, r: U.rand(0.8, 1.8) });
      if (Math.random() < 0.05) IC.addFire(S, x, y, 0.5, 1800);
      IC.sfx && IC.sfx.arty(x, y);
      // villages on the line burn
      for (const v of S.world.villages) if (v.home && U.dxy(v.x, v.y, x, y) < v.r + 20 && Math.random() < 0.3) { const b2 = v.blocks.find(bb => bb.hp > 0); if (b2) { b2.hp = 0; IC.addScar(S, { kind: 'block', x: b2.x, y: b2.y, r: 4, b: b2 }); } }
    }
  }
  // towns with a garrison pin the line in front of them
  for (const u of S.gunits) {
    if (u.side !== 'us' || u.dead || u.order !== 'defend' || !u.obj || u.front !== f || u.moving || u.str < 20) continue;
    const q = frontDepth(f, u.obj.x, u.obj.y); if (!q) continue;
    for (const k of [q.i, q.i + 1]) { const p = f.pts[k]; if (p && p.d > q.depth - 60) p.d = q.depth - 60; }
  }
  for (let k = 1; k + 1 < f.pts.length; k++) f.pts[k].d = f.pts[k].d * 0.96 + (f.pts[k - 1].d + f.pts[k + 1].d) * 0.02;
}

function upkeep(S, dt) {
  const h = dt / 3600;
  for (const u of S.gunits) {
    if (u.dead) continue;
    const f = u.front, inCombat = f.active && (LINE.has(u.order) || u.order === 'defend') && !u.moving;
    let use = u.g.use * (inCombat ? 4 : 0.6) * h;
    if (u.side === 'us' && f.cmd.trait === 'logistician') use *= 0.75;
    u.sup = Math.max(0, u.sup - use);
    if (!inCombat) u.mor = Math.min(u.side === 'us' ? 88 : 90, u.mor + 2 * h);
    if (u.order === 'refit') {
      if (u.side === 'us' && U.dist(u, targetPos(S, u)) < 90) {
        const add = Math.min(6 * h, 100 - u.str, S.manpower);
        const cost = add * u.g.cost * 0.004;
        if (add > 0 && S.budget > cost) { u.str += add; S.budget -= cost; S.manpower -= add; }
        u.sup = Math.min(100, u.sup + 10 * h);
        u.kit.atgm = Math.max(u.kit.atgm, u.type === 'inf' ? 6 : u.type === 'mech' ? 4 : 0);
      } else if (u.side === 'them') u.str = Math.min(100, u.str + 4 * h);
    }
    if (u.side === 'them') {
      const dep = S.esites.filter(s => s.nat === f.key && s.kind === 'supply' && !s.destroyed && s.stock > 0).sort((a, b) => U.dist(a, u) - U.dist(b, u))[0];
      if (dep && U.dist(dep, u) < 2400 && u.sup < 100) { const q = Math.min(12 * h, 100 - u.sup, dep.stock); u.sup += q; dep.stock -= q * 0.5; }
      else if (u.order === 'staging') u.sup = Math.min(100, u.sup + 5 * h);
    }
    if (u.str <= 3) {
      u.dead = true;
      if (u.side === 'them') { S.stats.gKills++; S.enemy.will = Math.max(0, S.enemy.will - 4); IC.log(S, 'kill', 'GROUND', `${f.enemy} ${u.name} destroyed.`, u); IC.news(S, `Enemy ${u.g.name.toLowerCase()} destroyed on the ${f.name.toLowerCase()}.`); }
      else { IC.log(S, 'leak', 'GROUND', `${u.name} has been destroyed.`, u); for (const c of IC.cities(S)) c.morale = Math.max(0, c.morale - 3); IC.emit(S, 'brigadeLost', u); }
      if (S.sel && S.sel.ref === u) S.sel = null;
    }
  }
  S.gunits = S.gunits.filter(u => !u.dead);
}

function spotting(S) {
  const eo = IC.wx(S).eo;
  for (const e of S.gunits) {
    if (e.side !== 'them') continue;
    let seen = false;
    for (const u of S.gunits) if (u.side === 'us' && U.dist(u, e) < 380 * eo) { seen = true; break; }
    if (!seen) for (const a of S.air) if (!a.dead && a.kind !== 'heli' && a.kind !== 'cargo' && U.dist(a, e) < (a.kind === 'isr' ? (IC.hasTech(S, 'x_isr') ? 600 : 450) : 380) * eo) { seen = true; break; }
    if (seen) { e.known = true; e.kx = e.x; e.ky = e.y; e.kt = S.time; }
    else if (S.time - e.kt > 5400) e.known = false;
  }
  for (const v of S.evehicles) {
    if (v.dead) continue;
    let seen = false;
    for (const a of S.air) if (!a.dead && a.kind !== 'heli' && a.kind !== 'cargo' && U.dist(a, v) < (a.kind === 'isr' ? 600 : 380) * eo) { seen = true; break; }
    if (seen) { v.known = true; v.kx = v.x; v.ky = v.y; v.kt = S.time; }
    else if (S.time - v.kt > 1200) v.known = false;
  }
}

function captures(S) {
  for (const c of IC.cities(S)) {
    const f = IC.enemyHeld(S, c.x, c.y);
    const garrison = S.gunits.find(u => u.side === 'us' && !u.dead && u.order === 'defend' && u.obj === c && !u.moving && u.str >= 20);
    c.besieged = !!(f && garrison);
    if (f && c.owner === 'us' && !garrison) {
      c.owner = 'enemy'; c.morale = Math.max(0, c.morale - 30);
      for (const o of IC.cities(S)) if (o !== c) o.morale = Math.max(0, o.morale - 6);
      S.enemy.will = Math.min(100, S.enemy.will + 4);
      S.support = Math.min(100, S.support + 6);
      IC.log(S, 'leak', 'CAPTURED', `${c.name} has fallen to ${f.enemy}.`, c);
      IC.news(S, `${c.name} falls after days of fighting; thousands flee.`);
      IC.sfx && IC.sfx.klaxon();
      IC.emit(S, 'capture', c);
      if (c.capital) IC.gameOver(S, `${c.name} has fallen. The government has capitulated.`);
    } else if (!f && c.owner === 'enemy') {
      c.owner = 'us'; c.morale = 50;
      for (const o of IC.cities(S)) if (o !== c) o.morale = Math.min(100, o.morale + 5);
      S.enemy.will = Math.max(0, S.enemy.will - 6);
      IC.log(S, 'kill', 'LIBERATED', `${c.name} liberated.`, c);
      IC.news(S, `Jubilation as ${S.world.names.H} troops enter ${c.name}.`);
      IC.emit(S, 'liberate', c);
    }
  }
  for (const t of S.world.foreign) {
    if (!t.frontier) continue;
    const ours = !!IC.usHeld(S, t.x, t.y);
    if (ours && !t.taken) { t.taken = true; S.enemy.will = Math.max(0, S.enemy.will - 8); S.support = Math.min(100, S.support + 3); IC.log(S, 'kill', 'CAPTURED', `${S.world.names.H} forces take ${t.name} inside ${S.world.names[t.k]}.`, t); IC.news(S, `${S.world.names.H} troops capture ${t.name}; ${S.world.names[t.k]} reels.`); IC.emit(S, 'takeTown', t); }
    else if (!ours && t.taken) { t.taken = false; S.enemy.will = Math.min(100, S.enemy.will + 4); IC.log(S, 'leak', 'LOST', `${t.name} retaken by ${S.world.names[t.k]}.`, t); }
  }
  for (const i of S.infra) if (i.kind !== 'city' && i.kind !== 'bridge') { const f = IC.enemyHeld(S, i.x, i.y); if (f && i.owner === 'us') { i.owner = 'enemy'; i.offline = true; IC.log(S, 'leak', 'CAPTURED', `${i.name} overrun.`, i); IC.emit(S, 'capture', i); } else if (!f && i.owner === 'enemy') { i.owner = 'us'; } }
  for (const u of S.units.slice()) if (IC.enemyHeld(S, u.x, u.y)) { IC.log(S, 'leak', 'OVERRUN', `${u.name} overrun by enemy ground forces.`, u); IC.hurtUnit(S, u, 999, { d: { code: 'ground assault' } }); }
}

IC.activateFront = function (S, key) {
  const f = S.fronts.find(x => x.key === key);
  if (!f || f.active) return;
  f.active = true; f.t0 = S.time;
  f.ecmd.nextPlan = S.time + 1800; f.ecmd.phase = 'probe';
  for (const u of S.gunits) if (u.front === f && u.side === 'them') { u.order = 'reserve'; u.sector = U.randi(0, f.sectors.length - 1); }
  IC.log(S, 'leak', 'INVASION', `${f.enemy} ground forces are crossing the border. The ${f.name} is active.`, f.pts[Math.floor(f.pts.length / 2)]);
  IC.news(S, `${f.enemy} armour crosses into ${S.world.names.H}. Heavy fighting reported along the ${f.name.toLowerCase()}.`);
  IC.emit(S, 'frontActive', f);
};

/* close air support landing on a sector */
IC.casStrike = function (S, f, si, pw, by) {
  const s = f.sectors[si]; if (!s) return;
  s.casUs += pw * 0.35;
  const G = IC.secGeom(f, si);
  const tgts = S.gunits.filter(u => u.side === 'them' && !u.dead && u.front === f && U.dist(u, G) < 750);
  if (tgts.length) {
    const t = U.pick(tgts);
    t.str -= pw * 2.2; t.mor -= pw * 1.5;
    t.known = true; t.kx = t.x; t.ky = t.y; t.kt = S.time;
    IC.explode(S, t.x + U.rand(-20, 20), t.y + U.rand(-20, 20), 0.8, 'us');
  }
};
IC.groundHit = function () {};

IC.ground = function (S, dt) {
  moveUnits(S, dt);
  S.groundT = (S.groundT || 0) - dt;
  if (S.groundT > 0) return;
  const step = 30 - S.groundT; S.groundT = 30;
  for (const f of S.fronts) {
    if (!f.active) continue;
    f.cmdT = (f.cmdT || 0) - step;
    if (f.cmdT <= 0) { f.cmdT = 600; ourCommander(S, f); enemyCommander(S, f); }
    combat(S, f, step);
  }
  upkeep(S, step);
  spotting(S);
  S.capT = (S.capT || 0) - step;
  if (S.capT <= 0) { S.capT = 120; captures(S); }
  for (const f of S.fronts) {
    if (!f.active) continue;
    f.ecmd.reinfT = (f.ecmd.reinfT || 8 * 3600) - step;
    if (f.ecmd.reinfT <= 0) {
      f.ecmd.reinfT = (10 - S.enemy.escal) * 3600;
      const st = S.esites.find(s => s.nat === f.key && s.kind === 'staging' && !s.destroyed);
      const n = S.gunits.filter(g => g.side === 'them' && g.front === f).length;
      if (st && S.enemy.will > 20 && n < (f.key === 'A' ? 12 : 8)) { const g = makeG(S, 'them', U.pick(['mech', 'mech', 'arm', 'inf']), f, st.x, st.y, f.key); g.order = 'reserve'; }
    }
  }
  S.manpower = Math.min(200, S.manpower + IC.MOBIL[S.mobil].man * step / 3600);
  if (S.enemy.will <= 0) IC.victory(S, `${S.world.full.A} has asked for a ceasefire. ${S.world.names.H} has held.`);
};

/* raise a new brigade (needs mobilization and manpower) */
IC.canRaise = (S, type) => S.mobil >= 1 && S.budget >= IC.GTYPES[type].cost && S.manpower >= 40 && S.gunits.filter(g => g.side === 'us').length < IC.MAX_BRIGADES;
IC.raiseBrigade = function (S, f, type) {
  if (!IC.canRaise(S, type)) return false;
  const g = IC.GTYPES[type];
  S.budget -= g.cost; S.manpower -= 40;
  const gar = S.world.garrisons[0] || IC.cap(S);
  const u = makeG(S, 'us', type, f, gar.x, gar.y);
  u.str = 60; u.sup = 50; u.mor = 60; u.order = 'refit'; u.exp = 0;
  IC.log(S, 'info', 'MOBILIZE', `${u.name} raised for the ${f.name}. It trains up to strength before deploying.`);
  return u;
};

})(window.IC);
