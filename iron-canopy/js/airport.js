/* Iron Canopy — airports as built places, at real scale (1 unit = 100 m).
   Runways, taxiways, aprons, terminals, hangars, shelters, fuel, tower, fire station and radar are separate parts.
   The taxi network is built from how the parts touch; aircraft move along it, so bad layouts cost time, capacity and
   money, and a strike damages exactly what it lands on. */
(function (IC) {
'use strict';
const U = IC.U;
const SNAP_RWY = 0.2, SNAP_APRON = 0.16;

/* ---------- geometry ---------- */
const rwLen = rw => U.dist(rw.a, rw.b);
const rwDir = rw => { const L = rwLen(rw) || 1; return { x: (rw.b.x - rw.a.x) / L, y: (rw.b.y - rw.a.y) / L }; };
const rwT = (rw, p) => { const d = rwDir(rw), L = rwLen(rw); return ((p.x - rw.a.x) * d.x + (p.y - rw.a.y) * d.y) / L; };
const rwAt = (rw, t) => ({ x: rw.a.x + (rw.b.x - rw.a.x) * t, y: rw.a.y + (rw.b.y - rw.a.y) * t });
const rwOff = (rw, p) => { const d = rwDir(rw); return (p.x - rw.a.x) * -d.y + (p.y - rw.a.y) * d.x; };
IC.rwLen = rwLen; IC.rwAt = rwAt; IC.rwT = rwT; IC.rwDir = rwDir;
function toLocal(r, p) { const c = Math.cos(-r.a), s = Math.sin(-r.a), dx = p.x - r.x, dy = p.y - r.y; return { x: dx * c - dy * s, y: dx * s + dy * c }; }
function toWorld(r, lx, ly) { const c = Math.cos(r.a), s = Math.sin(r.a); return { x: r.x + lx * c - ly * s, y: r.y + lx * s + ly * c }; }
IC.rectLocal = toLocal; IC.rectWorld = toWorld;
function rectDist(r, p) { const l = toLocal(r, p), dx = Math.max(0, Math.abs(l.x) - r.w / 2), dy = Math.max(0, Math.abs(l.y) - r.h / 2); return Math.hypot(dx, dy); }
function partDist(ap, part, p) {
  if (part.kind === 'runway') { const t = U.clamp(rwT(part, p), 0, 1); return Math.max(0, U.dist(rwAt(part, t), p) - part.w / 2); }
  if (part.kind === 'taxi') { let m = 1e9; for (let i = 1; i < part.nodes.length; i++) { const a = ap.nodes[part.nodes[i - 1]], b = ap.nodes[part.nodes[i]]; m = Math.min(m, U.segDist(p.x, p.y, a.x, a.y, b.x, b.y)); } return Math.max(0, m - part.w / 2); }
  if (part.r) return Math.max(0, U.dist(part, p) - part.r);
  return rectDist(part, p);
}
IC.partDist = partDist;
IC.partAt = function (ap, p, pad) { let best = null, bd = pad || 0.05; for (const q of ap.parts) { const d = partDist(ap, q, p); if (d < bd) { bd = d; best = q; } } return best; };

/* ---------- the model ---------- */
IC.initAirport = function (ap) {
  ap.parts = []; ap.nodes = {}; ap.nodeN = 0; ap.partN = 0; ap.works = []; ap.crews = ap.kind === 'airbase' ? 2 : 1; ap.autoRepair = true;
  ap.moves = []; ap.st = {}; ap.dirty = true; ap.feeLevel = 1; ap.curfew = true; ap.rl = {}; ap.kpi = { taxi: 0, wait: 0, n: 0, grid: 0, div: 0, hold: 0, back: 0 };
  ap.radius = 20; ap.buildR = 45;
};
IC.aptNode = function (ap, x, y) { const id = ap.id + 'n' + (ap.nodeN++); ap.nodes[id] = { id, x, y, on: null }; resolveNode(ap, ap.nodes[id]); return id; };
function resolveNode(ap, n) {
  n.on = null;
  for (const p of ap.parts) {
    if (p.kind === 'runway') { const t = rwT(p, n), off = Math.abs(rwOff(p, n)); if (t >= -0.01 && t <= 1.01 && off < SNAP_RWY) { n.on = { kind: 'rwy', part: p.id, t: U.clamp(t, 0, 1) }; return; } }
  }
  for (const p of ap.parts) {
    if (p.kind === 'apron' || p.kind === 'alert') { const l = toLocal(p, n); if (Math.abs(l.x) <= p.w / 2 + SNAP_APRON && Math.abs(l.y) <= p.h / 2 + SNAP_APRON && (Math.abs(Math.abs(l.x) - p.w / 2) < SNAP_APRON || Math.abs(Math.abs(l.y) - p.h / 2) < SNAP_APRON)) { n.on = { kind: 'apron', part: p.id }; return; } }
  }
}
IC.resolveNodes = ap => { for (const n of Object.values(ap.nodes)) resolveNode(ap, n); };
IC.aptAddPart = function (ap, part, built) {
  const D = IC.APART[part.kind];
  part.id = ap.id + 'p' + (ap.partN++);
  part.w = part.w != null ? part.w : D.w;
  if (part.kind !== 'taxi' && part.kind !== 'runway' && !D.area && D.h) part.h = part.h != null ? part.h : D.h;
  if (D.r && part.r == null) part.r = D.r;
  part.max = D.hp; part.hp = D.hp;
  part.built = !!built; part.prog = built ? 1 : 0;
  if (part.kind === 'runway') part.craters = part.craters || [];
  if (part.kind === 'taxi') part.cut = part.cut || {};
  if (part.kind === 'fuel') part.stock = built ? IC.APART.fuel.cap * 0.8 : 0;
  ap.parts.push(part);
  if (part.kind === 'runway' || part.kind === 'apron' || part.kind === 'alert') IC.resolveNodes(ap);
  ap.dirty = true;
  return part;
};
/* how big a part is, for costs and build time */
IC.partMeasure = function (ap, p) {
  const D = IC.APART[p.kind];
  if (p.kind === 'runway') return rwLen(p);
  if (p.kind === 'taxi') { let L = 0; for (let i = 1; i < p.nodes.length; i++) L += U.dist(ap.nodes[p.nodes[i - 1]], ap.nodes[p.nodes[i]]); return L; }
  if (D.area) return p.w * p.h;
  return 1;
};
IC.partCost = (ap, p) => IC.APART[p.kind].cost * IC.partMeasure(ap, p);
IC.partBuildTime = (ap, p) => IC.APART[p.kind].build * Math.max(0.5, IC.partMeasure(ap, p));

/* stands laid out along an apron's back edge; the back is the side facing a terminal, or away from the taxiways */
function standsFor(ap, p) {
  const depth = p.h * 0.64;
  const size = depth >= IC.STAND.l.d ? 'l' : depth >= IC.STAND.m.d ? 'm' : depth >= IC.STAND.s.d ? 's' : null;
  if (!size) return [];
  const S = IC.STAND[size], n = Math.floor(p.w / S.w);
  let back = 1;
  const term = ap.parts.find(q => (q.kind === 'terminal' || q.kind === 'cargo') && q.built && rectDist(q, p) < 0.5);
  if (term) back = toLocal(p, term).y >= 0 ? 1 : -1;
  else { const at = Object.values(ap.nodes).filter(nd => nd.on && nd.on.part === p.id); if (at.length) back = at.reduce((s, nd) => s + toLocal(p, nd).y, 0) > 0 ? -1 : 1; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const lx = -p.w / 2 + S.w * (i + 0.5), ly = back * (p.h / 2 - S.d / 2);
    const c = toWorld(p, lx, ly), f = toWorld(p, lx, back * (p.h / 2 - S.d - 0.08));
    const contact = !!(term && term.kind === 'terminal');
    const old = p.stands && p.stands[i];
    out.push({ id: p.id + 's' + i, x: c.x, y: c.y, fx: f.x, fy: f.y, a: p.a + (back > 0 ? Math.PI / 2 : -Math.PI / 2), size, apron: p.id, contact, hp: old ? old.hp : 1, occ: old ? old.occ : null, cargo: term && term.kind === 'cargo' });
  }
  return out;
}

/* ---------- the taxi network ---------- */
IC.aptGraph = function (ap) {
  if (!ap.dirty && ap.G) return ap.G;
  const N = new Map(), adj = new Map();
  const node = (id, x, y, kind, ref) => { if (!N.has(id)) { N.set(id, { id, x, y, kind, ref }); adj.set(id, []); } return N.get(id); };
  const edge = (a, b, kind, part, seg, spd) => {
    const A = N.get(a), B = N.get(b); if (!A || !B || a === b) return;
    const len = Math.max(0.01, U.dist(A, B)), w = len * (kind === 'apron' ? 1.2 : 1), key = (a < b ? a + '|' + b : b + '|' + a);
    adj.get(a).push({ from: a, to: b, len, w, kind, part, seg, spd, key }); adj.get(b).push({ from: b, to: a, len, w, kind, part, seg, spd, key });
  };
  for (const n of Object.values(ap.nodes)) node(n.id, n.x, n.y, 'taxi', n);
  const parts = ap.parts.filter(p => p.built);
  for (const p of parts) {
    if (p.kind === 'taxi') for (let i = 1; i < p.nodes.length; i++) { if (!p.cut[i]) edge(p.nodes[i - 1], p.nodes[i], 'taxi', p.id, i, 0.09); }
    else if (p.kind === 'runway') {
      node(p.id + ':a', p.a.x, p.a.y, 'rwyEnd', { part: p.id, t: 0 }); node(p.id + ':b', p.b.x, p.b.y, 'rwyEnd', { part: p.id, t: 1 });
      const on = [{ id: p.id + ':a', t: 0 }, { id: p.id + ':b', t: 1 }].concat(Object.values(ap.nodes).filter(n => n.on && n.on.kind === 'rwy' && n.on.part === p.id).map(n => ({ id: n.id, t: n.on.t })));
      on.sort((x, y) => x.t - y.t);
      for (let i = 1; i < on.length; i++) {
        const t0 = on[i - 1].t, t1 = on[i].t;
        if (t1 - t0 < 1e-4) { edge(on[i - 1].id, on[i].id, 'rwy', p.id, 0, 0.12); continue; }
        if (p.craters.some(c => c.t > t0 - c.r / rwLen(p) && c.t < t1 + c.r / rwLen(p))) continue;
        edge(on[i - 1].id, on[i].id, 'rwy', p.id, 0, 0.12);
      }
    } else if (p.kind === 'apron') {
      p.stands = standsFor(ap, p);
      const at = Object.values(ap.nodes).filter(n => n.on && n.on.kind === 'apron' && n.on.part === p.id);
      for (const s of p.stands) { node(s.id, s.fx, s.fy, 'stand', s); for (const a of at) edge(s.id, a.id, 'apron', p.id, 0, 0.04); }
      for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) edge(at[i].id, at[j].id, 'apron', p.id, 0, 0.05);
    }
  }
  // shelters join the network through the nearest taxi point in front of their doors
  for (const p of parts) {
    if (p.kind !== 'hangar' && p.kind !== 'has' && p.kind !== 'alert') continue;
    if (!p.door) {
      // the doors face whichever side has taxiway nearby
      const sides = [toWorld(p, 0, -p.h / 2 - 0.05), toWorld(p, 0, p.h / 2 + 0.05)];
      const near = q => { let m = 1e9; for (const n of Object.values(ap.nodes)) m = Math.min(m, U.dist(n, q)); return m; };
      p.door = near(sides[0]) <= near(sides[1]) ? sides[0] : sides[1];
      p.doorSide = p.door === sides[0] ? -1 : 1;
    }
    const nid = p.id + ':d'; node(nid, p.door.x, p.door.y, 'shelter', p);
    let best = null, bd = 0.55;
    for (const n of Object.values(ap.nodes)) { if (!adj.get(n.id).length && !(n.on && n.on.part === p.id)) continue; const d = U.dist(n, p.door); if (d < bd) { bd = d; best = n; } }
    if (p.kind === 'alert') for (const n of Object.values(ap.nodes)) if (n.on && n.on.part === p.id) edge(nid, n.id, 'apron', p.id, 0, 0.06);
    if (best) edge(nid, best.id, 'apron', p.id, 0, 0.05);
  }
  ap.G = { N, adj };
  ap.dirty = false;
  return ap.G;
};
/* cheapest path in seconds; runway edges cost extra because using one blocks the runway */
IC.aptPath = function (ap, from, to, avoidRwy) {
  const G = IC.aptGraph(ap);
  if (!G.N.has(from) || !G.N.has(to)) return null;
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  const Q = [from];
  while (Q.length) {
    let bi = 0; for (let i = 1; i < Q.length; i++) if (dist.get(Q[i]) < dist.get(Q[bi])) bi = i;
    const u = Q.splice(bi, 1)[0];
    if (u === to) break;
    if (done.has(u)) continue; done.add(u);
    for (const e of G.adj.get(u)) {
      if (done.has(e.to)) continue;
      const w = e.w / e.spd * (e.kind === 'rwy' ? (avoidRwy ? 6 : 2) : 1);
      const nd = dist.get(u) + w;
      if (nd < (dist.has(e.to) ? dist.get(e.to) : 1e18)) { dist.set(e.to, nd); prev.set(e.to, { from: u, e }); Q.push(e.to); }
    }
  }
  if (!dist.has(to)) return null;
  const path = []; let c = to;
  while (c !== from) { const p = prev.get(c); path.unshift({ from: p.from, to: c, e: p.e }); c = p.from; }
  return { cost: dist.get(to), steps: path };
};
/* all nodes reachable from a start (for connectivity checks) */
function reach(ap, start) {
  const G = IC.aptGraph(ap), seen = new Set([start]), Q = [start];
  while (Q.length) { const u = Q.pop(); for (const e of G.adj.get(u) || []) if (!seen.has(e.to)) { seen.add(e.to); Q.push(e.to); } }
  return seen;
}

/* ---------- runways: usable strips between craters ---------- */
IC.rwStrips = function (rw) {
  const L = rwLen(rw);
  const cs = rw.craters.map(c => [c.t * L - c.r, c.t * L + c.r]).sort((a, b) => a[0] - b[0]);
  const out = []; let s = 0;
  for (const [a, b] of cs) { if (a > s) out.push([s, Math.min(a, L)]); s = Math.max(s, b); }
  if (s < L) out.push([s, L]);
  return out.filter(x => x[1] - x[0] > 0.5);
};
IC.rwUsable = rw => rw.built && rw.hp > 0 ? Math.max(0, ...IC.rwStrips(rw).map(x => x[1] - x[0])) : 0;

/* spacing between runway movements: a tower and an approach radar let controllers pack them tighter */
IC.aptSep = st => !st.tower ? 480 : st.radar ? 60 : 110;

/* ---------- what the airport can do, and what is wrong with it ---------- */
IC.aptStats = function (S, ap) {
  const G = IC.aptGraph(ap);
  const alive = k => ap.parts.filter(p => p.kind === k && p.built && p.hp > p.max * 0.25);
  const rws = alive('runway');
  const st = { rwy: [], stands: { s: 0, m: 0, l: 0 }, standsFree: { s: 0, m: 0, l: 0 }, warn: [], pax: 0, cargo: 0, fuelCap: 0, shelters: 0 };
  const stands = [];
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) stands.push(s);
  // which stands can actually reach a runway
  const rwNodes = new Set();
  for (const rw of rws) { rwNodes.add(rw.id + ':a'); rwNodes.add(rw.id + ':b'); for (const n of Object.values(ap.nodes)) if (n.on && n.on.kind === 'rwy' && n.on.part === rw.id) rwNodes.add(n.id); }
  let reachAny = null;
  if (rws.length) { const r = reach(ap, rws[0].id + ':a'); for (const rw of rws.slice(1)) for (const x of reach(ap, rw.id + ':a')) r.add(x); reachAny = r; }
  for (const s of stands) {
    const ok = reachAny && reachAny.has(s.id) && s.hp > 0;
    s.linked = ok;
    if (!ok) continue;
    st.stands[s.size]++;
    if (!s.occ) st.standsFree[s.size]++;
  }
  const unlinked = stands.filter(s => !s.linked && s.hp > 0).length;
  if (unlinked) st.warn.push(`${unlinked} stand${unlinked > 1 ? 's are' : ' is'} not connected to a runway.`);
  for (const p of ap.parts) if ((p.kind === 'hangar' || p.kind === 'has' || p.kind === 'alert') && p.built) { p.linked = !!(reachAny && reachAny.has(p.id + ':d')); if (p.hp > p.max * 0.25 && p.linked) st.shelters += IC.APART[p.kind].holds; else if (!p.linked && p.hp > 0) st.warn.push(`${IC.APART[p.kind].name} is not connected to the taxiways.`); }
  // runway occupancy: landing roll to the first exit, or a backtrack if there is none
  let best = 0;
  for (const rw of rws) {
    const L = rwLen(rw), usable = IC.rwUsable(rw);
    const exits = Object.values(ap.nodes).filter(n => n.on && n.on.kind === 'rwy' && n.on.part === rw.id && G.adj.get(n.id).some(e => e.kind !== 'rwy')).map(n => n.on.t * L).sort((a, b) => a - b);
    const occ = dir => {
      const touch = dir > 0 ? 3 : L - 3, need = 13, stop = touch + dir * need;
      const ex = dir > 0 ? exits.find(x => x >= stop) : exits.slice().reverse().find(x => x <= stop);
      const roll = 55;
      if (ex != null) return roll + Math.abs(ex - stop) / 0.3;
      const back = dir > 0 ? exits[exits.length - 1] : exits[0];
      return back == null ? 1e9 : roll + Math.abs(stop - (dir > 0 ? L : 0)) / 0.3 + Math.abs((dir > 0 ? L : 0) - back) / 0.12;
    };
    const land = Math.min(occ(1), occ(-1));
    const threshold = exits.length && (exits[0] < 1.2 || exits[exits.length - 1] > L - 1.2);
    const dep = threshold ? 50 : exits.length ? 50 + Math.min(exits[0], L - exits[exits.length - 1]) / 0.12 : 1e9;
    const r = { id: rw.id, name: rw.name, len: L, usable, exits: exits.length, land, dep, threshold };
    st.rwy.push(r);
    if (!exits.length) st.warn.push(`${rw.name}: no taxiway reaches it.`);
    else if (land > 200) st.warn.push(`${rw.name}: no exit near where aircraft stop; every landing backtracks along the runway (${Math.round(land / 60)} min on the runway).`);
    if (exits.length && !threshold) st.warn.push(`${rw.name}: no taxiway to either end; every departure backtracks along the runway.`);
    if (usable < L - 1) st.warn.push(`${rw.name}: cratered, ${U.km(usable)} usable.`);
    best = Math.max(best, usable);
  }
  st.longest = best;
  const tower = alive('tower').length > 0;
  const radar = alive('atc').length > 0 || (S && S.units.some(u => u.radarOn && u.d.sensor && !u.d.sensor.passive && U.dist(u, ap) < 900));
  const fireSt = alive('fire').filter(f => rws.some(rw => U.dist(f, rwAt(rw, 0.5)) < 15));
  st.fire = fireSt.length > 0;
  st.tower = tower; st.radar = radar;
  if (!tower) st.warn.push('No control tower: only a few movements an hour.');
  if (!st.fire) st.warn.push('No fire station near the runway: only turboprops may use it.');
  const sep = IC.aptSep(st);
  st.movesPerHour = Math.round(st.rwy.reduce((s, r) => s + (r.land < 1e8 && r.dep < 1e8 ? 3600 / ((r.land + r.dep) / 2 + sep) : 0), 0));
  for (const t of alive('terminal')) st.pax += IC.APART.terminal.pax * t.w * t.h;
  for (const t of alive('cargo')) st.cargo += 60 * t.w * t.h;
  const tanks = alive('fuel');
  st.fuelCap = tanks.length * IC.APART.fuel.cap;
  st.fuel = tanks.reduce((s, t) => s + (t.stock || 0), 0);
  for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) if (U.dist(tanks[i], tanks[j]) < 1.4) { st.warn.push('Fuel tanks stand within 140 m of each other: one fire could take them all.'); i = tanks.length; break; }
  const links = rws.map(rw => Object.values(ap.nodes).filter(n => n.on && n.on.kind === 'rwy' && n.on.part === rw.id && G.adj.get(n.id).some(e => e.kind !== 'rwy')).length).reduce((s, v) => s + v, 0);
  if (links === 1) st.warn.push('Only one taxiway connects the runway: a single hit strands every aircraft.');
  const ammo = alive('ammo');
  if (ammo.some(a => ap.parts.some(q => q.kind !== 'ammo' && q.built && q.kind !== 'runway' && q.kind !== 'taxi' && partDist(ap, q, a) < 1.5))) st.warn.push('The munitions store is close to other buildings: if it goes up, so do they.');
  st.maxType = !rws.length ? null : !st.fire ? 'turbo' : best >= 29 ? 'cargo' : best >= 27 ? 'wide' : best >= 21 ? 'narrow' : best >= 13 ? 'turbo' : null;
  ap.st = st;
  return st;
};
/* can this aircraft type use the airport right now (runway, stands, fire cover) */
IC.aptFits = function (ap, type) {
  const T = IC.ACTYPES[type], st = ap.st || {};
  if (!T.vtol && (st.longest || 0) < T.rwy) return false;
  if (!T.mil && !st.fire && type !== 'turbo') return false;
  return true;
};

/* ---------- compatibility with the rest of the game ---------- */
IC.baseStatus = function (S, b) {
  if (!b || !b.parts) return { runway: true, turn: 1, cap: 99 };
  const st = b.st && b.st.rwy ? b.st : IC.aptStats(S, b);
  let turn = 1;
  if (!st.fuel || st.fuel < 5) turn *= 1.6;
  if (b.kind === 'airbase' && !b.parts.some(p => p.kind === 'ammo' && p.built && p.hp > p.max * 0.25)) turn *= 1.3;
  return { runway: (st.longest || 0) >= 10 && st.rwy.some(r => r.exits > 0), rwyLen: st.longest || 0, turn, cap: st.shelters, off: b.offline || b.owner === 'enemy', st };
};
IC.canLaunch = function (S, r) {
  const b = IC.baseOf(S, r.base);
  if (!b || b.dead || b.owner === 'enemy' || (b.state !== undefined && b.state !== 'ready')) return false;
  if (b.parts) {
    const T = IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]];
    if (!T.vtol && (b.st.longest || 0) < T.rwy) return false;
    if (!T.vtol && r.slot && !IC.slotPath(S, b, r)) return false;
  }
  return true;
};
IC.baseUsable = IC.canLaunch;
IC.slotPath = function (S, b, r) {
  const from = IC.slotNode(b, r); if (!from) return true;
  const rws = b.parts.filter(p => p.kind === 'runway' && p.built && p.hp > 0);
  return rws.some(rw => reach(b, from).has(rw.id + ':a') || reach(b, from).has(rw.id + ':b') || Object.values(b.nodes).some(n => n.on && n.on.part === rw.id && reach(b, from).has(n.id)));
};
IC.slotNode = (b, r) => { if (!r.slot) return null; const p = b.parts.find(x => x.id === r.slot); if (p) return p.id + ':d'; for (const a of b.parts) if (a.stands) { const s = a.stands.find(x => x.id === r.slot); if (s) return s.id; } return null; };
IC.fallbackBase = function (S, r) {
  const T = IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]];
  const opts = IC.bases(S).filter(b => b.owner === 'us' && (b.kind === 'airbase' || S.story && S.story.act >= 3) && b.active !== false && (T.vtol || (b.st.longest || 0) >= T.rwy))
    .concat(T.vtol ? S.units.filter(u => u.type === 'heliport' && u.state === 'ready') : []);
  const here = IC.baseOf(S, r.base) || (r.ent ? r.ent : IC.cap(S));
  opts.sort((a, b) => U.dist(a, here) - U.dist(b, here));
  return opts[0] ? opts[0].id : r.base;
};
/* put each flight based here into a shelter (shelters, alert pads, hangars, then stands) */
IC.assignSlots = function (S, b) {
  if (!b || !b.parts) return;
  const flights = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
  const shel = b.parts.filter(p => (p.kind === 'has' || p.kind === 'alert' || p.kind === 'hangar') && p.built && p.hp > p.max * 0.25);
  const slots = [];
  for (const p of shel) for (let i = 0; i < IC.APART[p.kind].holds; i++) slots.push({ id: p.id, kind: p.kind, i });
  const stands = [];
  for (const a of b.parts) if (a.kind === 'apron' && a.built) for (const s of a.stands || []) if (s.hp > 0) stands.push({ id: s.id, kind: 'stand', size: s.size });
  const pref = r => r.kind === 'ftr' ? ['alert', 'has', 'hangar', 'stand'] : r.kind === 'aew' || r.kind === 'cargo' ? ['stand', 'hangar'] : ['hangar', 'has', 'stand'];
  const used = new Map();
  const take = (r, s) => { r.slot = s.id; used.set(s.id + ':' + (s.i || 0), r); };
  for (const r of flights) r.slot = null;
  for (const r of flights) {
    for (const k of pref(r)) {
      const pool = k === 'stand' ? stands.filter(s => IC.STAND_FITS[s.size].includes(IC.ACTYPES[IC.AIRKIND_TYPE[r.kind]].stand)) : slots.filter(s => s.kind === k);
      const s = pool.find(x => !used.has(x.id + ':' + (x.i || 0)) && !(k === 'stand' && [...used.keys()].some(u => u.startsWith(x.id))));
      if (s) { take(r, s); break; }
    }
  }
};
IC.parkPos = function (S, b, r) {
  if (!r.slot) return { x: b.x, y: b.y, inside: false };
  const p = b.parts.find(x => x.id === r.slot);
  if (p) { const i = S.roster.filter(x => x.base === b.id && x.slot === r.slot).indexOf(r); const q = toWorld(p, (i - 0.5) * 0.18 * (IC.APART[p.kind].holds > 1 ? 1 : 0), 0); return { x: q.x, y: q.y, inside: true, fac: p, a: p.a + Math.PI / 2 }; }
  for (const a of b.parts) if (a.stands) { const s = a.stands.find(x => x.id === r.slot); if (s) return { x: s.x, y: s.y, inside: false, a: s.a, stand: s }; }
  return { x: b.x, y: b.y, inside: false };
};

/* ---------- damage by location ---------- */
IC.aptHit = IC.baseHit = function (S, ap, x, y, dmg, src) {
  const rb = 0.3 + dmg * 0.006, p = { x, y };
  const hitNames = [];
  let acLost = 0;
  for (const part of ap.parts) {
    if (!part.built && part.prog <= 0) continue;
    if (part.kind === 'runway') {
      const off = Math.abs(rwOff(part, p)), t = rwT(part, p);
      if (off < part.w / 2 + rb * 0.5 && t > -0.01 && t < 1.01) {
        part.craters.push({ t: U.clamp(t, 0, 1), r: Math.max(0.35, rb * 0.7), id: IC.nid('cr') });
        part.hp = Math.max(1, part.hp - 5);
        hitNames.push(`${part.name || 'runway'} cratered`);
        ap.dirty = true;
      }
      continue;
    }
    if (part.kind === 'taxi') {
      for (let i = 1; i < part.nodes.length; i++) {
        const a = ap.nodes[part.nodes[i - 1]], b = ap.nodes[part.nodes[i]];
        if (U.segDist(x, y, a.x, a.y, b.x, b.y) < part.w / 2 + rb * 0.4 && !part.cut[i]) { part.cut[i] = true; ap.dirty = true; hitNames.push('taxiway cut'); }
      }
      continue;
    }
    if (part.kind === 'apron') {
      for (const s of part.stands || []) if (U.dxy(s.x, s.y, x, y) < rb + 0.2 && s.hp > 0) { s.hp = 0; hitNames.push('stand destroyed'); }
      if (rectDist(part, p) < rb) { part.hp = Math.max(0, part.hp - dmg * 0.3); (part.scorch = part.scorch || []).push({ x, y, r: rb * 0.9 }); if (part.scorch.length > 16) part.scorch.shift(); }
      continue;
    }
    const d = partDist(ap, part, p);
    if (d > rb) continue;
    const was = part.hp;
    const hard = part.kind === 'has' ? 0.35 : part.kind === 'alert' ? 0.7 : 1;
    part.hp = Math.max(0, part.hp - dmg * (1 - d / rb * 0.5) * hard);
    if (was > part.max * 0.25 && part.hp <= part.max * 0.25) {
      hitNames.push(`${IC.APART[part.kind].name.toLowerCase()} destroyed`);
      IC.addScar(S, { kind: 'burn', x: part.x, y: part.y, r: Math.max(part.w || part.r * 2, part.h || 0) * 1.4 });
      if (part.kind === 'fuel') { part.burning = 5400; part.stock = 0; IC.explode(S, part.x, part.y, 1.8, 'ground', { big: 0.6 }); IC.addFire(S, part.x, part.y, 1.8, 9000); }
      else if (part.kind === 'ammo') { IC.explode(S, part.x, part.y, 2, 'ground', { big: 0.8 }); IC.addFire(S, part.x, part.y, 1.2, 6000); setTimeout0(S, () => IC.aptHit(S, ap, part.x + 0.05, part.y + 0.05, 90, { d: { code: 'secondary explosion' } })); }
      else IC.addFire(S, part.x, part.y, 0.8, 4000);
      ap.dirty = true;
    }
  }
  // aircraft on the ground
  for (const r of S.roster) {
    if (r.base !== ap.id || r.st === 'lost' || r.st === 'air') continue;
    const pp = IC.parkPos(S, ap, r);
    const d = U.dxy(x, y, pp.x, pp.y);
    if (d > rb + 0.25) continue;
    const shel = pp.fac;
    const chance = shel ? (shel.kind === 'has' ? (shel.hp > shel.max * 0.25 ? 0.1 : 0.6) : shel.kind === 'alert' ? 0.45 : (shel.hp > shel.max * 0.25 ? 0.4 : 0.9)) : 0.8;
    if (Math.random() < chance) { r.st = 'lost'; r.ent = null; acLost++; S.stats.acLost++; S.wrecks.push({ x: pp.x, y: pp.y, type: 'aircraft', t: S.time, h: pp.a || 0 }); IC.addFire(S, pp.x, pp.y, 0.6, 2400); }
  }
  for (const m of ap.moves) if (!m.dead && !m.destroyed && U.dist(m, p) < rb + m.T.span / 2) { m.destroyed = true; acLost++; S.wrecks.push({ x: m.x, y: m.y, type: m.T.mil ? 'aircraft' : 'airliner', t: S.time, h: m.h }); IC.addFire(S, m.x, m.y, 0.8, 3000); }
  // airliners parked at their stands
  for (const a of ap.parts) if (a.stands) for (const s of a.stands) {
    if (!s.occ || U.dxy(s.x, s.y, x, y) > rb + 0.3) continue;
    if (Math.random() < 0.75) { IC.emit(S, 'tailLost', { ap, tail: s.occ, why: 'destroyed at the gate' }); S.wrecks.push({ x: s.x, y: s.y, type: 'airliner', t: S.time, h: s.a }); IC.addFire(S, s.x, s.y, 0.8, 3000); s.occ = null; acLost++; }
  }
  ap.dirty = true;
  IC.aptStats(S, ap);
  if (ap.kind === 'airbase') IC.assignSlots(S, ap);
  const st = IC.baseStatus(S, ap);
  const uniq = [...new Set(hitNames)];
  if (uniq.length || acLost) IC.log(S, 'leak', 'AIRPORT', `${ap.name}: ${uniq.join(', ')}${acLost ? `${uniq.length ? '; ' : ''}${acLost} aircraft destroyed on the ground` : ''}${!st.runway ? '; RUNWAY CLOSED' : ''}.`, { x, y });
  IC.emit(S, 'baseHit', { base: ap, acLost, runway: st.runway });
  if (ap.autoRepair) autoQueue(S, ap);
};
function setTimeout0(S, fn) { (S.later = S.later || []).push({ t: S.time + 2, fn }); }

/* ---------- engineering: repairs and construction ---------- */
function workFor(ap, key) { return ap.works.find(w => w.key === key); }
IC.aptRepairList = function (ap) {
  const L = [];
  for (const p of ap.parts) {
    if (!p.built) continue;
    if (p.kind === 'runway') for (const c of p.craters) L.push({ key: 'cr:' + c.id, label: `Fill crater on ${p.name || 'the runway'}`, cost: 10, dur: 700, part: p, crater: c });
    else if (p.kind === 'taxi') for (const i in p.cut) L.push({ key: 'tx:' + p.id + ':' + i, label: 'Repair taxiway', cost: 4, dur: 420, part: p, seg: +i });
    else if (p.kind === 'apron') {
      for (const s of p.stands || []) if (s.hp <= 0) L.push({ key: 'st:' + s.id, label: 'Repair stand', cost: 5, dur: 500, part: p, stand: s });
      if (p.hp < p.max * 0.8) L.push({ key: 'pt:' + p.id, label: 'Resurface apron', cost: Math.max(3, IC.partCost(ap, p) * 0.3), dur: 900, part: p });
    }
    else if (p.hp < p.max) { const f = 1 - p.hp / p.max; L.push({ key: 'pt:' + p.id, label: `${p.hp <= p.max * 0.25 ? 'Rebuild' : 'Repair'} ${IC.APART[p.kind].name.toLowerCase()}`, cost: Math.max(2, IC.partCost(ap, p) * f * 0.6), dur: Math.max(300, IC.partBuildTime(ap, p) * f * 0.7), part: p }); }
  }
  return L;
};
IC.aptQueue = function (S, ap, key) {
  const it = IC.aptRepairList(ap).find(x => x.key === key);
  if (!it || workFor(ap, key) || S.budget < it.cost) return false;
  S.budget -= it.cost;
  const rrr = IC.hasTech(S, 'l_rrr') && (key.startsWith('cr:') || key.startsWith('tx:')) ? 0.5 : 1;
  ap.works.push({ id: IC.nid('w'), key, kind: 'repair', label: it.label, prog: 0, dur: it.dur * rrr, it });
  IC.emit(S, 'baseWork', { b: ap, key });
  return true;
};
/* old interface kept for the Academy and the inspector buttons */
IC.baseWork = function (S, b, action, arg) {
  if (action === 'crew') { if (S.budget < 20) return false; S.budget -= 20; b.crews++; IC.log(S, 'info', 'ENG', `${b.name}: another engineer crew assigned.`); return true; }
  if (action === 'repair') { const it = IC.aptRepairList(b).find(x => x.key === arg || (x.part && x.part.id === arg && x.key.startsWith('pt:'))); return it ? IC.aptQueue(S, b, it.key) : false; }
  if (action === 'build') return !!IC.autoPlace(S, b, arg);
  return false;
};
IC.cancelWork = function (S, b, id) {
  const w = b.works.find(x => x.id === id); if (!w) return;
  b.works = b.works.filter(x => x !== w);
  if (w.kind === 'build') { b.parts = b.parts.filter(p => p !== w.part); b.dirty = true; S.budget += w.cost * 0.8; }
};
function autoQueue(S, ap) {
  // runway craters and cut taxiways always; with a Chief Engineer on duty, everything else too
  const all = S.story && S.story.del && S.story.del.eng;
  for (const it of IC.aptRepairList(ap)) if ((all || it.key.startsWith('cr:') || it.key.startsWith('tx:')) && !workFor(ap, it.key)) IC.aptQueue(S, ap, it.key);
}
IC.aptAutoQueue = autoQueue;
/* plan a new part: paid now, built by the engineers */
IC.aptPlan = function (S, ap, part) {
  const cost = IC.partCost(ap, part);
  if (S.budget < cost) { IC.log(S, 'warn', 'BUILD', `Not enough money: ${U.money(cost)} needed.`); return null; }
  S.budget -= cost;
  IC.aptAddPart(ap, part, false);
  const w = { id: IC.nid('w'), key: 'bd:' + part.id, kind: 'build', label: `Build ${IC.APART[part.kind].name.toLowerCase()}`, prog: 0, dur: IC.partBuildTime(ap, part), part, cost };
  ap.works.push(w);
  IC.aptExtent(ap);
  IC.log(S, 'info', 'BUILD', `${ap.name}: ${IC.APART[part.kind].name.toLowerCase()} planned (${U.money(cost)}, about ${U.dur(w.dur)} of engineer work).`);
  IC.emit(S, 'aptPlan', { ap, part });
  return part;
};
/* place a building automatically next to others of its kind (used by quick buttons and the Academy) */
IC.autoPlace = function (S, ap, kind) {
  const D = IC.APART[kind];
  const same = ap.parts.filter(p => p.kind === kind);
  const rw = ap.parts.find(p => p.kind === 'runway');
  const a = rw ? Math.atan2(rw.b.y - rw.a.y, rw.b.x - rw.a.x) : 0;
  const base = same.length ? same[same.length - 1] : ap.parts.find(p => p.kind === 'hangar') || ap;
  for (let k = 1; k < 40; k++) {
    const off = (D.w || 0.3) + 0.12;
    const cand = { x: base.x + Math.cos(a) * off * k * (k % 2 ? 1 : -1) * 0.5, y: base.y + Math.sin(a) * off * k * (k % 2 ? 1 : -1) * 0.5 };
    const part = { kind, x: cand.x, y: cand.y, a: base.a != null ? base.a : a };
    if (!IC.aptCanPlace(S, ap, part)) continue;
    return IC.aptPlan(S, ap, part);
  }
  return null;
};
IC.aptCanPlace = function (S, ap, part) {
  const pts = part.kind === 'runway' ? [part.a, part.b] : part.kind === 'taxi' ? part.pts : [part];
  for (const p of pts) { if (!IC.inHome(p.x, p.y) || IC.inLake(p.x, p.y)) return false; if (U.dist(p, ap) > ap.buildR) return false; }
  if (part.kind === 'runway' || part.kind === 'taxi') return true;
  const probe = Object.assign({ w: IC.APART[part.kind].w, h: IC.APART[part.kind].h, r: IC.APART[part.kind].r }, part);
  for (const q of ap.parts) {
    if (q.kind === 'taxi') continue;
    const d = partDist(ap, q, probe);
    if (d < (probe.r || Math.max(probe.w || 0, probe.h || 0) / 2) + 0.02) return false;
  }
  return true;
};

IC.updateBases = function (S, dt) {
  if (S.later) { const due = S.later.filter(l => l.t <= S.time); S.later = S.later.filter(l => l.t > S.time); for (const l of due) l.fn(); }
  for (const b of IC.bases(S)) {
    if (!b.parts || b.owner !== 'us') continue;
    let n = 0;
    for (const w of b.works) {
      if (n >= b.crews) break;
      n++;
      w.prog += dt / w.dur;
      if (w.prog < 1) continue;
      w.done = true;
      if (w.kind === 'build') {
        w.part.built = true; w.part.prog = 1;
        if (w.part.kind === 'runway' || w.part.kind === 'apron' || w.part.kind === 'alert') IC.resolveNodes(b);
        if (['apron', 'hangar', 'has', 'alert'].includes(w.part.kind)) IC.aptAutoJoin(b, w.part);
        if (w.part.kind === 'taxi') for (const q of b.parts) if (q.built && ['apron', 'hangar', 'has', 'alert'].includes(q.kind)) IC.aptAutoJoin(b, q);
        IC.aptExtent(b); IC.log(S, 'info', 'BUILD', `${b.name}: ${IC.APART[w.part.kind].name.toLowerCase()} complete.`, w.part.x != null ? w.part : b); IC.emit(S, 'aptBuilt', { ap: b, part: w.part }); }
      else {
        const it = w.it;
        if (it.crater) it.part.craters = it.part.craters.filter(c => c !== it.crater);
        else if (it.seg != null) delete it.part.cut[it.seg];
        else if (it.stand) it.stand.hp = 1;
        else { it.part.hp = it.part.max; it.part.burning = 0; it.part.scorch = null; }
        IC.emit(S, 'baseWorkDone', { b, w });
      }
      b.dirty = true;
    }
    for (const w of b.works) if (w.kind === 'build' && !w.done) w.part.prog = w.prog;
    if (b.works.some(w => w.done)) { b.works = b.works.filter(w => !w.done); IC.aptStats(S, b); if (b.kind === 'airbase') IC.assignSlots(S, b); }
    // burning fuel spreads to whatever stands close by
    for (const p of b.parts) {
      if (!(p.burning > 0)) continue;
      p.burning -= dt;
      for (const q of b.parts) {
        if (q === p || !q.built || q.kind === 'runway' || q.kind === 'taxi' || q.kind === 'apron') continue;
        const d = partDist(b, q, p);
        if (d > 1.6) continue;
        const was = q.hp;
        q.hp = Math.max(0, q.hp - dt / 60 * (q.kind === 'fuel' ? 9 : 4) * (1 - d / 1.6));
        if (was > q.max * 0.25 && q.hp <= q.max * 0.25) {
          IC.log(S, 'leak', 'FIRE', `${b.name}: fire spreads to the ${IC.APART[q.kind].name.toLowerCase()}.`, q);
          if (q.kind === 'fuel') { q.burning = 5400; q.stock = 0; IC.explode(S, q.x, q.y, 1.6, 'ground'); IC.addFire(S, q.x, q.y, 1.6, 8000); }
          b.dirty = true;
        }
      }
    }
    // fuel arrives by road and pipeline
    const tanks = b.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25);
    // each tank is refilled by road or pipeline at its own rate: more tanks, more fuel
    const inflow = 45 * dt / 3600;
    for (const t of tanks) t.stock = Math.min(IC.APART.fuel.cap, (t.stock || 0) + inflow);
    b.statT = (b.statT || 0) - dt;
    if (b.statT <= 0 || b.dirty) { b.statT = 60; IC.aptStats(S, b); }
    // engineers come back to jobs that could not be paid for at the time
    b.aqT = (b.aqT || 0) - dt;
    if (b.aqT <= 0) { b.aqT = 180; if (b.autoRepair && !b.locked) autoQueue(S, b); }
    const tot = b.parts.reduce((s, p) => s + (p.built ? p.max : 0), 0), cur = b.parts.reduce((s, p) => s + (p.built ? p.hp : 0), 0);
    b.hp = b.max * (tot ? cur / tot : 1);
    b.offline = b.kind === 'airport' && !IC.baseStatus(S, b).runway;
  }
};
IC.aptTakeFuel = function (ap, n) {
  const tanks = ap.parts.filter(p => p.kind === 'fuel' && p.built && p.hp > p.max * 0.25 && p.stock > 0).sort((a, b) => b.stock - a.stock);
  if (tanks.reduce((s, t) => s + t.stock, 0) < n) return false;
  let need = n;
  for (const t of tanks) { const q = Math.min(need, t.stock); t.stock -= q; need -= q; if (need <= 0) break; }
  return need <= 0;
};

/* ---------- the editor: snapping and planning ---------- */
/* airport-local coordinates (x along the main runway) to world */
IC.aptLocal = (ap, lx, ly) => { const a = ap.rwyA || 0, c = Math.cos(a), s = Math.sin(a); return { x: ap.x + lx * c - ly * s, y: ap.y + lx * s + ly * c }; };
/* where a click lands on the network: an existing node, a runway, an apron edge, a taxiway segment, or open ground */
IC.aptSnap = function (ap, p, tol) {
  // the click tolerance follows the zoom, but never reaches further than a few tens of metres
  tol = Math.min(tol || 0.12, 0.35);
  let best = null, bd = tol;
  for (const n of Object.values(ap.nodes)) { const d = U.dist(n, p); if (d < bd) { bd = d; best = { kind: 'node', node: n.id, x: n.x, y: n.y }; } }
  if (best) return best;
  for (const q of ap.parts) {
    if (q.kind !== 'runway') continue;
    const L = rwLen(q), t = rwT(q, p), off = Math.abs(rwOff(q, p));
    if (t < -0.02 || t > 1.02 || off > q.w / 2 + Math.min(tol, 0.1)) continue;
    // runway ends snap exactly
    const tt = t * L < 0.6 ? 0 : (1 - t) * L < 0.6 ? 1 : U.clamp(t, 0, 1);
    const c = rwAt(q, tt);
    return { kind: 'rwy', part: q.id, t: tt, x: c.x, y: c.y };
  }
  for (const q of ap.parts) {
    if (q.kind !== 'taxi') continue;
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]];
      const d = U.segDist(p.x, p.y, a.x, a.y, b.x, b.y);
      if (d < q.w / 2 + Math.min(tol * 0.6, 0.15)) {
        const L = U.dist(a, b) || 1, f = U.clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L), 0.05, 0.95);
        return { kind: 'taxi', part: q.id, seg: i, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
  }
  for (const q of ap.parts) {
    if (q.kind !== 'apron' && q.kind !== 'alert') continue;
    const l = toLocal(q, p), et = Math.min(tol, 0.2);
    if (Math.abs(l.x) > q.w / 2 + et || Math.abs(l.y) > q.h / 2 + et) continue;
    // only near an edge: a click in the middle of an apron is not a connection
    if (Math.abs(l.x) < q.w / 2 - et && Math.abs(l.y) < q.h / 2 - et) continue;
    // project onto the nearest edge
    const dx = q.w / 2 - Math.abs(l.x), dy = q.h / 2 - Math.abs(l.y);
    const e = dx < dy ? toWorld(q, Math.sign(l.x || 1) * q.w / 2, U.clamp(l.y, -q.h / 2, q.h / 2)) : toWorld(q, U.clamp(l.x, -q.w / 2, q.w / 2), Math.sign(l.y || 1) * q.h / 2);
    return { kind: 'apron', part: q.id, x: e.x, y: e.y };
  }
  return { kind: 'free', x: p.x, y: p.y };
};
/* turn a snap into a node id, splitting a taxiway if the point lands on one */
function nodeFor(ap, s) {
  if (s.kind === 'node') return s.node;
  const id = IC.aptNode(ap, s.x, s.y);
  if (s.kind === 'taxi') {
    const q = ap.parts.find(x => x.id === s.part);
    const cut = {}; for (const k in q.cut) cut[+k >= s.seg ? +k + 1 : +k] = true;
    if (q.cut[s.seg]) cut[s.seg] = true;
    q.nodes.splice(s.seg, 0, id); q.cut = cut;
    ap.dirty = true;
  }
  return id;
}
/* an apron or shelter built beside an existing taxiway joins it where they touch */
IC.aptAutoJoin = function (ap, part) {
  const shelter = part.kind === 'hangar' || part.kind === 'has';
  const door = shelter ? [toWorld(part, 0, -part.h / 2 - 0.05), toWorld(part, 0, part.h / 2 + 0.05)] : null;
  for (const q of ap.parts) {
    if (q.kind !== 'taxi' || q === part) continue;
    const splits = [];
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]], L = U.dist(a, b);
      if (L < 0.2) continue;
      if (shelter) {
        // already reachable from an existing node?
        if (door.some(d => Object.values(ap.nodes).some(n => U.dist(n, d) < 0.5))) return;
        for (const d of door) {
          const f = U.clamp(((d.x - a.x) * (b.x - a.x) + (d.y - a.y) * (b.y - a.y)) / (L * L), 0.03, 0.97);
          const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
          if (U.dist(p, d) < 0.45) { splits.push({ seg: i, f, x: p.x, y: p.y }); break; }
        }
        continue;
      }
      // aprons: find stretches of the segment that run along the apron edge
      const K = Math.max(4, Math.ceil(L / 0.25)), run = [];
      for (let k = 0; k <= K; k++) { const f = 0.03 + 0.94 * k / K, p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; if (rectDist(part, p) < 0.14) run.push(f); }
      if (!run.length) continue;
      if (a.on && a.on.part === part.id || b.on && b.on.part === part.id) continue;
      const fs = run.length * (L / K) > 3 ? [run[0], run[run.length - 1]] : [run[Math.floor(run.length / 2)]];
      for (const f of fs) splits.push({ seg: i, f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    // split from the end backwards so segment numbers stay valid
    splits.sort((p, r) => r.seg - p.seg || r.f - p.f);
    for (const s of splits) nodeFor(ap, { kind: 'taxi', part: q.id, seg: s.seg, x: s.x, y: s.y });
  }
  IC.resolveNodes(ap);
  ap.dirty = true;
};
/* plan a taxiway through a list of world points (each is snapped) */
IC.aptPlanTaxi = function (S, ap, pts, tol) {
  if (pts.length < 2) return null;
  const snaps = pts.map(p => IC.aptSnap(ap, p, tol)).filter((s, i, L) => i === 0 || U.dist(s, L[i - 1]) > 0.05);
  if (snaps.length < 2) return null;
  for (const s of snaps) if (!IC.inHome(s.x, s.y) || IC.inLake(s.x, s.y) || U.dist(s, ap) > ap.buildR) { IC.log(S, 'warn', 'BUILD', 'That taxiway leaves the airport site.'); return null; }
  let len = 0; for (let i = 1; i < snaps.length; i++) len += U.dist(snaps[i - 1], snaps[i]);
  const cost = IC.APART.taxi.cost * len;
  if (S.budget < cost) { IC.log(S, 'warn', 'BUILD', `Not enough money: ${U.money(cost)} needed.`); return null; }
  const ids = snaps.map(s => nodeFor(ap, s));
  const clean = ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
  if (clean.length < 2) return null;
  return IC.aptPlan(S, ap, { kind: 'taxi', nodes: clean });
};
/* plan a runway from a to b */
IC.aptPlanRunway = function (S, ap, a, b, name) {
  const part = { kind: 'runway', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, name: name || `Runway ${ap.parts.filter(p => p.kind === 'runway').length + 1}` };
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', 'A runway cannot go there.'); return null; }
  return IC.aptPlan(S, ap, part);
};
/* plan an area or building; area parts take w and h */
IC.aptPlanPart = function (S, ap, kind, x, y, a, w, h) {
  const D = IC.APART[kind];
  const part = { kind, x, y, a: a != null ? a : ap.rwyA || 0 };
  if (D.area) { part.w = w; part.h = h; }
  if (!IC.aptCanPlace(S, ap, part)) { IC.log(S, 'warn', 'BUILD', `The ${D.name.toLowerCase()} does not fit there.`); return null; }
  return IC.aptPlan(S, ap, part);
};
/* bulldoze: remove a part (refund part of an unbuilt one) */
IC.aptRemove = function (S, ap, id) {
  const p = ap.parts.find(x => x.id === id); if (!p) return false;
  const w = ap.works.find(x => x.part === p);
  if (w) { ap.works = ap.works.filter(x => x !== w); S.budget += w.cost * (1 - w.prog) * 0.8; }
  ap.parts = ap.parts.filter(x => x !== p);
  if (p.kind === 'runway' || p.kind === 'apron' || p.kind === 'alert') IC.resolveNodes(ap);
  // drop nodes nothing uses any more
  const used = new Set(); for (const q of ap.parts) if (q.kind === 'taxi') for (const n of q.nodes) used.add(n);
  for (const id2 of Object.keys(ap.nodes)) if (!used.has(id2)) delete ap.nodes[id2];
  ap.dirty = true; IC.aptStats(S, ap);
  return true;
};

/* ---------- new airports ---------- */
IC.FOUND_COST = 80;
IC.foundCheck = function (S, x, y) {
  if (!IC.inHome(x, y) || IC.inLake(x, y)) return 'Outside the country.';
  if (IC.enemyHeld && IC.enemyHeld(S, x, y)) return 'Enemy-held ground.';
  if (S.world.slopeAt && S.world.slopeAt(x, y) > 0.08) return 'Too hilly for a runway.';
  if (IC.bases(S).some(b => U.dist(b, { x, y }) < 250)) return 'Too close to another airport.';
  if (IC.cities(S).some(c => U.dist(c, { x, y }) < c.r + 25)) return 'Inside a city.';
  if (S.budget < IC.FOUND_COST) return `Needs ${U.money(IC.FOUND_COST)}.`;
  return '';
};
IC.foundAirport = function (S, x, y) {
  const why = IC.foundCheck(S, x, y);
  if (why) { IC.log(S, 'warn', 'BUILD', why); IC.text(S, x, y, why.toUpperCase().replace(/\.$/, ''), IC.C.hostile); return null; }
  S.budget -= IC.FOUND_COST;
  const city = IC.cities(S).slice().sort((a, b) => U.dist(a, { x, y }) - U.dist(b, { x, y }))[0];
  const n = S.infra.filter(i => i.kind === 'airport').length;
  const ap = { id: 'apt' + n + IC.nid(''), kind: 'airport', name: `${city ? city.name : 'New'} ${S.infra.some(i => i.name === (city ? city.name : 'New') + ' Airport') ? 'Field' : 'Airport'}`, x, y, owner: 'us', infra: true, r: 50, max: 150, hp: 150, city: city && city.id, inv: {}, inc: {} };
  ap.rwyA = city ? Math.atan2(y - city.y, x - city.x) + Math.PI / 2 : 0;
  IC.initAirport(ap);
  ap.template = 'new'; ap.crews = 1; ap.works = []; ap.autoRepair = true;
  S.infra.push(ap); S.byId[ap.id] = ap;
  IC.aptStats(S, ap);
  // noise: a field close to town upsets the neighbours
  if (city && U.dist(city, ap) < city.r + 120) { S.support = Math.max(0, S.support - 3); city.morale = Math.max(0, city.morale - 4); IC.log(S, 'warn', 'AVIATION', `Residents of ${city.name} protest the noise of a new airport so close to town.`, ap); }
  IC.log(S, 'info', 'AVIATION', `${ap.name} founded (${U.money(IC.FOUND_COST)}). Lay a runway, a taxiway, an apron and a terminal before airlines will come.`, ap);
  IC.emit(S, 'founded', ap);
  return ap;
};

/* ---------- starting layouts ---------- */
IC.layoutAirport = function (ap, template, a) {
  IC.initAirport(ap);
  const ca = Math.cos(a), sa = Math.sin(a);
  const W = (lx, ly) => ({ x: ap.x + lx * ca - ly * sa, y: ap.y + lx * sa + ly * ca });
  const N = (lx, ly) => nodeFor(ap, IC.aptSnap(ap, W(lx, ly), 0.03));
  const rw = (x0, x1, ly, name) => IC.aptAddPart(ap, { kind: 'runway', a: W(x0, ly), b: W(x1, ly), name }, true);
  const tx = pts => IC.aptAddPart(ap, { kind: 'taxi', nodes: pts.map(([x, y]) => N(x, y)) }, true);
  const rect = (kind, lx, ly, w, h) => { const c = W(lx, ly); return IC.aptAddPart(ap, { kind, x: c.x, y: c.y, w, h, a }, true); };
  const bld = (kind, lx, ly, rot) => { const c = W(lx, ly); return IC.aptAddPart(ap, { kind, x: c.x, y: c.y, a: a + (rot || 0) }, true); };
  const nm = (i) => { const h = Math.round(((a * 180 / Math.PI + 360) % 180) / 10) || 18; const x = String(h).padStart(2, '0'), y = String((h + 18) % 36 || 36).padStart(2, '0'); return `Runway ${x}/${y}${i ? ' ' + 'LR'[i - 1] : ''}`; };
  if (template === 'intl') {
    rw(-17, 17, 0, nm());
    tx([[-16.8, 1.8], [-12, 1.8], [-8, 1.8], [-4, 1.8], [0, 1.8], [4, 1.8], [8, 1.8], [12, 1.8], [16.8, 1.8]]);
    for (const x of [-16.8, -8, 0, 8, 16.8]) tx([[x, 0], [x, 1.8]]);
    tx([[-4, 1.8], [-4, 2.75]]); tx([[4, 1.8], [4, 2.8]]); tx([[12, 1.8], [12, 2.75]]);
    rect('apron', -3.5, 3.4, 6, 1.3); rect('apron', 5, 3.28, 8, 0.96); rect('apron', 13.5, 3.4, 3, 1.3);
    rect('terminal', 1, 4.7, 12, 1.0); rect('cargo', 13.5, 4.6, 3, 0.8);
    // a remote apron for overnight parking, south of the runway
    tx([[-12, 0], [-12, -1.6]]); rect('apron', -12, -2.1, 4.6, 0.96);
    bld('fuel', -12, 4.6); bld('fuel', -11.55, 5.05); bld('fuel', -12.5, 5.15); bld('fuel', -11.1, 4.6);
    bld('tower', 3.5, 5.7); bld('fire', 0, -1.5); bld('atc', -8, -3.2);
    bld('hangar', -9.2, 3.6); bld('hangar', -8.3, 3.6);
    tx([[-8, 1.8], [-8.75, 3.25]]);
  } else if (template === 'regional_bad') {
    // one stub in the middle of the runway: every departure backtracks, every landing blocks the runway for minutes
    rw(-12, 12, 0, nm());
    tx([[2, 0], [2, 1.75]]);
    rect('apron', 2, 2.22, 1.5, 0.95);
    rect('terminal', 2, 3.05, 1.8, 0.55);
    bld('fuel', 3.6, 2.6); bld('tower', 0.6, 2.7); bld('fire', 0, -1.2);
  } else if (template === 'regional_ok') {
    rw(-13, 13, 0, nm());
    tx([[-12.8, 1.7], [-6, 1.7], [0, 1.7], [6, 1.7]]);
    tx([[-12.8, 0], [-12.8, 1.7]]); tx([[6, 0], [6, 1.7]]); tx([[0, 1.7], [0, 2.25]]); tx([[-6, 1.7], [-6, 2.25]]);
    rect('apron', 0, 2.72, 3.2, 0.95); rect('terminal', 0, 3.6, 3.2, 0.7);
    bld('fuel', 3.8, 3.4); bld('fuel', 5.2, 3.5); bld('tower', -2.4, 3.1); bld('fire', -3, -1.2); bld('hangar', -6, 2.6);
  } else if (template === 'mil_mothball') {
    // a half-closed base: a parallel taxiway to one end only, clustered fuel, no shelters, no alert pad
    rw(-13, 13, 0, nm());
    tx([[-12.8, 0], [-12.8, -1.6], [-9, -1.6], [-6, -1.6], [-3, -1.6], [0, -1.6], [0, 0]]);
    tx([[-6, -1.6], [-6, -2.6]]); tx([[-9, -1.6], [-9, -2.12]]);
    rect('apron', -9, -2.55, 2.5, 0.86);
    bld('hangar', -6.4, -2.95); bld('hangar', -5.6, -2.95);
    bld('fuel', -10.3, -3.8); bld('fuel', -10.0, -4.15);
    bld('tower', -2.2, -2.8); bld('fire', 1.2, -1.3);
  } else if (template === 'mil_full') {
    rw(-15, 15, 0, nm());
    tx([[-14.8, 0], [-14.8, -1.7], [-10, -1.7], [-5, -1.7], [0, -1.7], [5, -1.7], [10, -1.7], [14.8, -1.7], [14.8, 0]]);
    tx([[0, -1.7], [0, 0]]); tx([[-7.5, -1.7], [-7.5, -3.2]]); tx([[7.5, -1.7], [7.5, -3.2]]);
    for (const x of [-9, -6, 6, 9]) { tx([[x, -1.7], [x, -2.6]]); bld('has', x, -2.8); }
    rect('apron', -7.5, -3.62, 2.5, 0.86); rect('apron', 7.5, -3.62, 2.5, 0.86);
    bld('hangar', -2.5, -3.2); bld('hangar', 2.5, -3.2);
    tx([[-2.5, -1.7], [-2.5, -2.9]]); tx([[2.5, -1.7], [2.5, -2.9]]);
    rect('alert', -15.6, -1.0, 0.42, 0.3);
    bld('fuel', -12, -4.5); bld('fuel', -4, -5.2); bld('fuel', 11, -4.6);
    bld('ammo', 0, -7); bld('tower', 1.2, -3.8); bld('fire', -1.2, 1.3);
    tx([[-14.8, -1.7], [-15.6, -1.15]]);
  }
  IC.resolveNodes(ap);
  for (const p of ap.parts) if (p.kind === 'apron' || p.kind === 'hangar' || p.kind === 'has' || p.kind === 'alert') IC.aptAutoJoin(ap, p);
  ap.dirty = true;
  ap.template = template;
  const r0 = ap.parts.find(p => p.kind === 'runway');
  ap.rwyA = a; ap.rwyL = r0 ? IC.rwLen(r0) : 20;
  IC.aptExtent(ap);
};
/* how far the airport reaches from its reference point (for strikes, picking and drawing) */
IC.aptExtent = function (ap) {
  let r = 5;
  for (const p of ap.parts) {
    if (p.kind === 'runway') r = Math.max(r, U.dist(ap, p.a), U.dist(ap, p.b));
    else if (p.kind === 'taxi') for (const id of p.nodes) r = Math.max(r, U.dist(ap, ap.nodes[id]));
    else r = Math.max(r, U.dist(ap, p) + Math.max(p.w || 0, p.h || 0, p.r || 0));
  }
  ap.radius = r + 1;
  return ap.radius;
};

})(window.IC);
