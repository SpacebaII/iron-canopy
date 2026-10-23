/* Iron Canopy — road and rail traffic.
   The roads, city streets and slip roads form one drive graph. Trips have a purpose and two real ends: commuters
   go from housing to offices and factories and back (rush hours at 8 and 17), lorries run between industry,
   warehouses, rail yards, airports and the border crossings, people and taxis go to the airports, and the rest is
   errands and deliveries. Trips are assigned to routes once (and again when roads change), which gives every
   link a flow in each direction by purpose; the step only turns those flows into loads for the hour (a few
   thousand numbers). Vehicles are not simulated in the step: far out the map shows flows, in the middle vehicles
   ride in slots along each link, and close in individual vehicles make real trips near the camera: they start at
   a car park, a depot or an estate, follow their route lane by lane, queue at lights and give way at junctions,
   and use the slip roads. Buses run routed lines with stops, coaches between cities, trains on the railways. */
(function (IC) {
'use strict';
const U = IC.U;

// per class: vehicles per unit (100 m) of lane at full flow (an avenue at full: one every 25 m a lane, a street one every 50 m), free speed (units per game second), lanes each way,
// lane offsets from the centre line (world units), and rank at junctions
const CLS = {
  hw: { dens: 4, v: 0.31, lanes: 2, off: [0.054, 0.091], rank: 5 }, ring: { dens: 4, v: 0.22, lanes: 2, off: [0.048, 0.083], rank: 4 },
  rd: { dens: 2, v: 0.22, lanes: 1, off: [0.0163], rank: 4 }, art: { dens: 4, v: 0.13, lanes: 2, off: [0.0175, 0.0525], rank: 3 },
  lc: { dens: 0.7, v: 0.17, lanes: 1, off: [0.015], rank: 2 }, sp: { dens: 0.5, v: 0.12, lanes: 1, off: [0.014], rank: 1 },
  col: { dens: 2.6, v: 0.1, lanes: 1, off: [0.0175], rank: 2 }, st: { dens: 2, v: 0.08, lanes: 1, off: [0.0175], rank: 1 }, ln: { dens: 0.06, v: 0.1, lanes: 1, off: [0.0125], rank: 0 },
  ramp: { dens: 2.4, v: 0.16, lanes: 1, off: [0], rank: 2 }
};
IC.TRAFFIC_CLS = CLS;
/* the kinds of vehicle: length and width (units), top speed (units per game s), colours */
const KINDS = {
  car: { L: 0.045, W: 0.019, v: 0.36 }, van: { L: 0.055, W: 0.021, v: 0.3 }, taxi: { L: 0.046, W: 0.019, v: 0.34 },
  box: { L: 0.08, W: 0.025, v: 0.25 }, artic: { L: 0.165, W: 0.025, v: 0.24 }, tanker: { L: 0.15, W: 0.025, v: 0.24 },
  bus: { L: 0.12, W: 0.026, v: 0.22 }, coach: { L: 0.13, W: 0.026, v: 0.28 }, shuttle: { L: 0.075, W: 0.022, v: 0.3 },
  police: { L: 0.048, W: 0.019, v: 0.4 }, amb: { L: 0.06, W: 0.022, v: 0.4 }, cater: { L: 0.07, W: 0.024, v: 0.26 }
};
IC.VEHICLE_KINDS = KINDS;
/* what each purpose puts on the road */
const MIX = {
  com: [['car', 0.95], ['van', 0.05]],
  frt: [['artic', 0.42], ['box', 0.28], ['tanker', 0.1], ['van', 0.2]],
  apt: [['car', 0.42], ['taxi', 0.3], ['shuttle', 0.1], ['cater', 0.06], ['tanker', 0.07], ['van', 0.05]],
  gen: [['car', 0.7], ['van', 0.14], ['box', 0.07], ['taxi', 0.05], ['police', 0.025], ['amb', 0.015]]
};
const PURP = ['com', 'frt', 'apt', 'gen'];
/* share of the peak flow by hour: commuters inbound (to work) and outbound (home), and the other purposes */
const H_IN = [0.02, 0.01, 0.01, 0.01, 0.03, 0.12, 0.45, 0.9, 1, 0.6, 0.3, 0.25, 0.3, 0.3, 0.25, 0.22, 0.2, 0.2, 0.15, 0.12, 0.08, 0.05, 0.04, 0.03];
const H_OUT = [0.04, 0.02, 0.01, 0.01, 0.01, 0.03, 0.06, 0.1, 0.12, 0.15, 0.2, 0.25, 0.35, 0.3, 0.3, 0.45, 0.8, 1, 0.85, 0.5, 0.3, 0.2, 0.12, 0.07];
const H_FRT = [0.35, 0.3, 0.3, 0.3, 0.35, 0.45, 0.6, 0.7, 0.75, 0.8, 0.8, 0.8, 0.75, 0.8, 0.8, 0.8, 0.75, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.38];
const H_APT = [0.1, 0.05, 0.05, 0.08, 0.3, 0.7, 0.9, 1, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.85, 0.9, 0.9, 0.85, 0.8, 0.7, 0.55, 0.35, 0.2];
const H_GEN = [0.08, 0.05, 0.04, 0.04, 0.06, 0.15, 0.35, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.85, 0.8, 0.85, 0.9, 0.9, 0.8, 0.65, 0.5, 0.35, 0.22, 0.12];
const hr = (T, h) => { const i = Math.floor(h) % 24, f = h - Math.floor(h); return T[i] + (T[(i + 1) % 24] - T[i]) * f; };
// overall busyness by hour, kept for others to read (rush hours at 8 and 17–18, quiet from midnight to five)
IC.trafficHour = S => { const h = (S.time % 86400) / 3600; return Math.max(hr(H_IN, h), hr(H_OUT, h), hr(H_GEN, h)); };

/* how full the roads are: the busiest links of each class at rush hour (TOP in assign), the floor every city street
   keeps for its own residents and every road for the country it runs through (loads, by class), gamma (how far the
   quiet links are pulled up towards the busy ones: 1 is the raw flows; gammaRoad on the national roads, which may be
   quiet far from the towns), and the city size whose streets are at full density (smaller towns scale down to minSize) */
IC.TRAFFIC_LOAD = { floor: { st: 0.12, col: 0.18, art: 0.25, ring: 0.3, hw: 0.08, rd: 0.05, lc: 0.03, sp: 0.03 }, gamma: 0.4, gammaRoad: 0.8, fullPop: 500, minSize: 0.4 };
const BASE = 0.3;   // spacing of the finest vehicle slots, in world units (30 m)
// where a link's slots are now: they ride at the link's speed from the last reading (wrapping after 65,536 slots
// leaves every slot's identity unchanged)
const phase = (L, d, now) => (L.ph[d] + L.v[d] * (now - (L.t0 || now))) % (BASE * 65536);
const cumOf = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + U.dist(pts[i - 1], pts[i])); return c; };

/* ---------- the drive graph ----------
   Every road, street, slip road and farm lane, cut into links where they meet. Streets meet where they share a
   point or cross; a motorway meets nothing at grade: at an interchange its carriageway and the road over it are
   separate levels, joined only by the slip roads, whose ends are tied onto the carriageways. */
function buildGraph(W) {
  const lines = [];
  const J = W.junctionAt || {};
  const add = (pts, cls, ref, lv) => { if (pts.length >= 2) lines.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), cls, ref, lv: lv || [0, 0], ins: [] }); };
  // the level of a road's end at an interchange: the motorway below, the road that crosses above
  const levelAt = (e, k) => {
    const j = J[k]; if (!j || (j.kind !== 'mm' && j.kind !== 'mx')) return 0;
    const d = j.dirs.find(q => q.e === e); if (!d) return 0;
    const over = j.over && j.over.includes(d.a);
    return j.kind === 'mx' ? (e.cls === 'hw' ? 1 : 2) : e.cls === 'hw' ? (over ? 2 : 1) : 3;
  };
  // a national road inside a city is one of its avenues, and carries the city's traffic as they do
  const cityOf = {}; for (const c of W.cities) cityOf[c.id] = c;
  // (a neighbour's roads are drawn, not driven: no trips are assigned over the border, brief 57)
  for (const e of W.edges) if (!e.abroad) add(e.pts, e.city ? e.ccls || 'art' : e.cls, e.city ? { edge: e, city: cityOf[e.city] } : { edge: e }, [levelAt(e, e.a), levelAt(e, e.b)]);
  for (const c of W.cities) for (const s of c.streets) if (!s.cul) add(s.pts, s.cls, { city: c, st: s });
  for (const r of W.ramps || []) add(r.pts, 'ramp', { ramp: r });
  for (const l of W.lanes) if (!l.loose && !l.abroad) add(l.pts, 'ln', { lane: l });   // (not the lanes of a village no road reaches, nor those abroad)
  // a suburb's closes last (brief 54): their links come after every other, so a loop that may skip them stops short
  for (const c of W.cities) for (const s of c.streets) if (s.cul) add(s.pts, s.cls, { city: c, cul: true, st: s });
  // crossings at grade: every pair of pieces that cross (motorways and slip roads never do)
  const B = 4, bk = new Map(), key2 = (i, j) => (i + 100) * 32768 + j + 100;
  // the cells a piece passes through (not its whole box: long country roads would fill millions)
  const cover = (a, b, fn) => {
    let x = Math.floor(a.x / B), y = Math.floor(a.y / B);
    const X1 = Math.floor(b.x / B), Y1 = Math.floor(b.y / B), dx = b.x - a.x, dy = b.y - a.y, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(B / dx) : Infinity, tdy = dy ? Math.abs(B / dy) : Infinity;
    let tx = dx ? (sx > 0 ? (x + 1) * B - a.x : a.x - x * B) / Math.abs(dx) : Infinity, ty = dy ? (sy > 0 ? (y + 1) * B - a.y : a.y - y * B) / Math.abs(dy) : Infinity;
    fn(x, y);
    for (let n = 0; n < 100000 && (x !== X1 || y !== Y1); n++) { if (tx < ty) { tx += tdx; x += sx; } else { ty += tdy; y += sy; } fn(x, y); }
  };
  lines.forEach((l, li) => {
    if (l.cls === 'hw' || l.cls === 'ramp') return;
    for (let i = 1; i < l.pts.length; i++) cover(l.pts[i - 1], l.pts[i], (x, y) => { const k = key2(x, y); let L = bk.get(k); if (!L) bk.set(k, L = []); L.push(li, i); });
  });
  const E = 1e-4, seen = new Set();
  for (const L of bk.values()) for (let p = 0; p < L.length; p += 2) for (let q = p + 2; q < L.length; q += 2) {
    const la = L[p], lb = L[q]; if (la === lb) continue;
    const ia = L[p + 1], ib = L[q + 1];
    const A = lines[la], Bl = lines[lb], a0 = A.pts[ia - 1], a1 = A.pts[ia], b0 = Bl.pts[ib - 1], b1 = Bl.pts[ib];
    const r1 = a1.x - a0.x, r2 = a1.y - a0.y, s1 = b1.x - b0.x, s2 = b1.y - b0.y, den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((b0.x - a0.x) * s2 - (b0.y - a0.y) * s1) / den, u = ((b0.x - a0.x) * r2 - (b0.y - a0.y) * r1) / den;
    if (t < -E || t > 1 + E || u < -E || u > 1 + E) continue;
    const sk = la < lb ? la + ':' + ia + ':' + lb + ':' + ib : lb + ':' + ib + ':' + la + ':' + ia;
    if (seen.has(sk)) continue; seen.add(sk);
    const x = a0.x + r1 * t, y = a0.y + r2 * t;
    A.ins.push({ i: ia, t, x, y }); Bl.ins.push({ i: ib, t: u, x, y });
  }
  // slip roads: each end is tied onto the nearest carriageway or road
  const segB = new Map();
  lines.forEach((l, li) => {
    if (l.cls === 'ramp') return;
    for (let i = 1; i < l.pts.length; i++) cover(l.pts[i - 1], l.pts[i], (x, y) => { const k = key2(x, y); let M = segB.get(k); if (!M) segB.set(k, M = []); M.push(li, i); });
  });
  const tie = (P, lineOk, within) => {
    let best = null, bd = within || 0.7;
    // (only the cells within reach: a piece near P passes through one of them, and a street's end looks 3 m round)
    for (let x = Math.floor((P.x - bd) / B); x <= Math.floor((P.x + bd) / B); x++) for (let y = Math.floor((P.y - bd) / B); y <= Math.floor((P.y + bd) / B); y++) {
      const M = segB.get(key2(x, y)); if (!M) continue;
      for (let q = 0; q < M.length; q += 2) {
        const l = lines[M[q]]; if (lineOk && !lineOk(l)) continue;
        const a = l.pts[M[q + 1] - 1], b = l.pts[M[q + 1]], vx = b.x - a.x, vy = b.y - a.y, LL = vx * vx + vy * vy, t = LL ? U.clamp(((P.x - a.x) * vx + (P.y - a.y) * vy) / LL, 0, 1) : 0;
        const d = Math.hypot(a.x + vx * t - P.x, a.y + vy * t - P.y);
        if (d < bd) { bd = d; best = { l, i: M[q + 1], t, x: a.x + vx * t, y: a.y + vy * t }; }
      }
    }
    return best;
  };
  for (const l of lines) if (l.cls === 'ramp') for (const end of [0, 1]) {
    const P = end ? l.pts[l.pts.length - 1] : l.pts[0];
    // the end nearer a motorway joins the motorway; the other the road it serves
    const h = tie(P, q => q.cls === 'hw'), o = tie(P, q => q.cls !== 'hw');
    const t = h && (!o || U.dxy(h.x, h.y, P.x, P.y) < U.dxy(o.x, o.y, P.x, P.y) + 0.1) ? h : o;
    if (!t) continue;
    t.l.ins.push({ i: t.i, t: t.t, x: t.x, y: t.y });
    P.x = t.x; P.y = t.y; l.tied = l.tied || []; l.tied[end] = t.l;
  }
  // a street's end that stops a hair short of the street it meets (the crossing test above is exact to a ten-thousandth
  // of a piece) is tied onto it within 3 m; a close's ends sit on its estate's loop and the loop's way in on the
  // street, drawn on the ellipse rather than on the loop's chords, so those are tied within 150 m (brief 54)
  for (const l of lines) if (l.ref.city && !l.ref.edge) for (const end of [0, 1]) {
    const P = end ? l.pts[l.pts.length - 1] : l.pts[0], t = tie(P, q => q !== l && q.cls !== 'hw', l.ref.cul ? 0.15 : 0.03);
    if (!t) continue;
    t.l.ins.push({ i: t.i, t: t.t, x: t.x, y: t.y });
    P.x = t.x; P.y = t.y;
  }
  // put the crossing points into the lines
  const kq = (x, y) => Math.round(x * 256) * 16777216 + Math.round(y * 256);
  const forced = new Set();
  for (const l of lines) {
    if (!l.ins.length) continue;
    l.ins.sort((a, b) => a.i - b.i || a.t - b.t);
    const out = [l.pts[0]]; let q = 0;
    for (let i = 1; i < l.pts.length; i++) {
      for (; q < l.ins.length && l.ins[q].i === i; q++) { const p = l.ins[q]; out.push({ x: p.x, y: p.y }); forced.add(kq(p.x, p.y)); }
      out.push(l.pts[i]);
    }
    l.pts = out;
  }
  // two points under a metre apart on one line (a close's end tied beside the crossing it makes with its loop, a street
  // ending a hair from where another crosses) are one node, or the piece between them is dropped and the loop falls in two
  const alias = new Map(), root = k => { while (alias.has(k)) k = alias.get(k); return k; };
  const raw = new Map(); for (const l of lines) l.pts.forEach((p, i) => { const k = kq(p.x, p.y); raw.set(k, (raw.get(k) || 0) + (i === 0 || i === l.pts.length - 1 ? 2 : 1)); });
  const joint = p => { const k = kq(p.x, p.y); return forced.has(k) || raw.get(k) > 1; };   // (a curve's own points stay apart)
  for (const l of lines) for (let i = 1; i < l.pts.length; i++) {
    const p = l.pts[i - 1], q = l.pts[i];
    const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    if (d >= 0.01 || (d >= 1e-3 && !(joint(p) && joint(q)))) continue;
    const a = root(kq(p.x, p.y)), b = root(kq(q.x, q.y)); if (a !== b) alias.set(b, a);
  }
  for (const k of [...forced]) forced.add(root(k));
  // nodes where lines share a point, and at every end
  const cnt = new Map(), keyOf = (l, i) => root(kq(l.pts[i].x, l.pts[i].y)) * 4 + (i === 0 ? l.lv[0] : i === l.pts.length - 1 ? l.lv[1] : 0);
  for (const l of lines) for (let i = 0; i < l.pts.length; i++) { const k = keyOf(l, i); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const G = { nodes: [], links: [], at: new Map() };
  const posOf = (k, p) => { const n = G.at.get(k); return n == null ? { x: p.x, y: p.y } : { x: G.nodes[n].x, y: G.nodes[n].y }; };
  const nodeOf = (k, p) => { let n = G.at.get(k); if (n == null) { n = G.nodes.length; G.nodes.push({ x: p.x, y: p.y, out: [], rank: 0 }); G.at.set(k, n); } return n; };
  for (const l of lines) {
    // nodes are made only for pieces that become links: a zero-length piece must not leave a node with no roads
    let s = 0, ka = keyOf(l, 0), pa = l.pts[0];
    for (let i = 1; i < l.pts.length; i++) {
      const k = keyOf(l, i), last = i === l.pts.length - 1;
      if (!last && cnt.get(k) < 2 && !forced.has(Math.floor(k / 4))) continue;
      let pts = l.pts.slice(s, i + 1);
      const k0 = ka, p0 = pa;
      s = i; ka = k; pa = l.pts[i];
      if (k0 === k && pts.length < 3) continue;
      // (the piece runs from node to node: a point merged into a node within a metre is the node's)
      const pa0 = posOf(k0, p0), pb0 = posOf(k, l.pts[i]);
      pts = [pa0].concat(pts.slice(1, -1).filter(p => U.dist(p, pa0) > 0.01 && U.dist(p, pb0) > 0.01), [pb0]);
      const cum = cumOf(pts), len = cum[cum.length - 1];
      if (len < 1e-3) continue;
      const a = nodeOf(k0, p0), b = nodeOf(k, l.pts[i]);
      const lk = { id: G.links.length, a, b, pts, cum, len, cls: l.cls, C: CLS[l.cls], one: 0, ref: l.ref, city: l.ref.city || null, cul: !!l.ref.cul };
      G.links.push(lk); G.nodes[a].out.push(lk.id); G.nodes[b].out.push(lk.id);
    }
  }
  // slip roads are one-way: which way depends on which carriageway (traffic keeps right) each end joins
  for (const lk of G.links) {
    if (lk.cls !== 'ramp') continue;
    let vote = 0;
    for (const end of [0, 1]) {
      const n = G.nodes[end ? lk.b : lk.a];
      const hw = n.out.map(i => G.links[i]).find(q => q.cls === 'hw'); if (!hw) continue;
      // the motorway's direction at this node, and which side of its centre line the slip road meets
      const atA = hw.a === (end ? lk.b : lk.a), P = hw.pts, p0 = atA ? P[0] : P[P.length - 1], p1 = atA ? P[1] : P[P.length - 2];
      let tx = p1.x - p0.x, ty = p1.y - p0.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      if (!atA) { tx = -tx; ty = -ty; }   // now pointing along the motorway from a to b
      // (read over the slip road's first 400 m, not its first piece: a short piece from where its end was tied onto
      // the carriageway can point almost straight across it)
      const R = lk.pts, q0 = end ? R[R.length - 1] : R[0];
      let q1 = end ? R[R.length - 2] : R[1];
      for (let k = 1; k < R.length && U.dist(q1, q0) < 0.4; k++) q1 = end ? R[R.length - 1 - k] : R[k];
      const side = (q1.x - q0.x) * -ty + (q1.y - q0.y) * tx;   // > 0: the slip road lies to the right of a→b
      const flow = side > 0 ? 1 : -1;                          // right of a→b flows a→b
      const into = (q0.x - q1.x) * tx * flow + (q0.y - q1.y) * ty * flow > 0;   // the slip road runs with the flow into its end
      vote += (into === !!end) ? 1 : -1;
    }
    lk.one = vote > 0 ? 1 : vote < 0 ? -1 : 0;
  }
  for (const n of G.nodes) for (const i of n.out) n.rank = Math.max(n.rank, CLS[G.links[i].cls].rank);
  // signals where two busy streets or roads cross; the national junctions keep their shape
  for (const n of G.nodes) {
    const big = n.out.filter(i => CLS[G.links[i].cls].rank >= 3 && G.links[i].cls !== 'hw' && G.links[i].cls !== 'ramp').length;
    // (brief 65: and where a town's avenue crosses a street, as at most crossroads of a real town's avenues)
    n.sig = (big >= 3 || (big >= 2 && n.out.length >= 4 && n.out.some(i => G.links[i].city))) && n.out.length >= 3 && n.out.every(i => G.links[i].cls !== 'hw');
    n.ph = U.hash(Math.round(n.x * 10), Math.round(n.y * 10)) * 90;
  }
  for (const j of W.junctions || []) {
    const n = G.at.get(kq(j.x, j.y) * 4); if (n == null) continue;
    G.nodes[n].jk = j.kind;
    if (j.kind === 'rb') G.nodes[n].sig = false;
    if (j.kind === 'tj' && G.nodes[n].out.length >= 4) G.nodes[n].sig = true;
  }
  rings(W, G, kq);
  // every node in one shape, with the fields the vehicles set as they pass (a hot loop reads them)
  G.nodes = G.nodes.map(n => ({ x: n.x, y: n.y, out: n.out, rank: n.rank, sig: !!n.sig, ph: n.ph || 0, jk: n.jk || null, ring: n.ring || null, busy: 0, from: -1, ax: null, mn: false }));
  // a spatial index of nodes
  G.nb = new Map(); G.NB = 6;
  G.nodes.forEach((n, i) => { const k = key2(Math.floor(n.x / G.NB), Math.floor(n.y / G.NB)); let L = G.nb.get(k); if (!L) G.nb.set(k, L = []); L.push(i); });
  G.nearNode = (x, y, r, ok) => {
    let best = -1, bd = r;
    for (let gx = Math.floor((x - r) / G.NB); gx <= Math.floor((x + r) / G.NB); gx++) for (let gy = Math.floor((y - r) / G.NB); gy <= Math.floor((y + r) / G.NB); gy++)
      for (const i of G.nb.get(key2(gx, gy)) || []) { const n = G.nodes[i], d = U.dxy(x, y, n.x, n.y); if (d < bd && (!ok || ok(n, i))) { bd = d; best = i; } }
    return best;
  };
  for (const lk of G.links) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of lk.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } lk.bb = [x0, y0, x1, y1]; }
  return G;
}
IC.driveGraph = W => W._dg || (W._dg = buildGraph(W));
/* a roundabout is driven round its ring (brief 67): every road into it is cut where it meets the ring, and the pieces of
   ring between are one-way links, anticlockwise as seen from above for right-hand traffic, so a car follows its lane
   round the island instead of through it */
function rings(W, G, kq) {
  const RJ = IC.roadJoins && IC.roadJoins(W); if (!RJ) return;
  const half = k => ((IC.ROAD_SPEC[k] || IC.ROAD_SPEC.lc).w) / 2, gone = new Set();
  // (the links near a roundabout by the 2-unit cells their points touch, so each ring looks only at the links near it;
  // a long piece's points may skip a cell, so the cells between its points count too)
  const LG = new Map(), lkey = (i, j) => i * 65536 + j;
  for (const r of RJ.rbs) for (let i = Math.floor(r.x / 2) - 2; i <= Math.floor(r.x / 2) + 2; i++) for (let j = Math.floor(r.y / 2) - 2; j <= Math.floor(r.y / 2) + 2; j++) LG.set(lkey(i, j), []);
  const put = (id, x, y) => { const L = LG.get(lkey(Math.floor(x / 2), Math.floor(y / 2))); if (L && L[L.length - 1] !== id) L.push(id); };
  const index = (id, P) => { for (let i = 0; i < P.length; i++) { if (i) { const a = P[i - 1], b = P[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5); for (let t = 1; t < n; t++) put(id, a.x + (b.x - a.x) * t / n, a.y + (b.y - a.y) * t / n); } put(id, P[i].x, P[i].y); } };
  for (const lk of G.links) index(lk.id, lk.pts);
  const linksNear = (x, y, r) => { const out = new Set(); for (let i = Math.floor((x - r) / 2); i <= Math.floor((x + r) / 2); i++) for (let j = Math.floor((y - r) / 2); j <= Math.floor((y + r) / 2); j++) for (const id of LG.get(lkey(i, j)) || []) out.add(id); return out; };
  for (const site of RJ.rbs) {
    const g = IC.rbGeom(site, half), R = g.r, C = g.C, inR = Q => Math.hypot(Q.x - C.x, Q.y - C.y) < R;
    // the node in the middle, where the roads meet (a dumbbell's ring sits where its slip roads were tied on)
    let n = G.at.get(kq(C.x, C.y) * 4) ?? -1;
    if (n < 0) { let bd = R * 0.6; for (let i = 0; i < G.nodes.length; i++) { const Q = G.nodes[i]; if (Math.abs(Q.x - C.x) < bd && Math.abs(Q.y - C.y) < bd && Q.out.length >= 3) { const d = Math.hypot(Q.x - C.x, Q.y - C.y); if (d < bd) { bd = d; n = i; } } } }
    if (n < 0 || G.nodes[n].out.length < 2) continue;
    // everything inside the ring (an avenue's crossings a few metres from the middle, a street's loop) is the ring's
    const inside = new Set([n]), nearL = linksNear(C.x, C.y, R + 1.5);
    for (const id of nearL) for (const m of [G.links[id].a, G.links[id].b]) if (inR(G.nodes[m]) && G.nodes[m].out.length) inside.add(m);
    // a road from the ring outwards, from its last point inside: where it leaves the circle (the far root of
    // |a + t (b − a) − C| = R), then on; null if it comes back in
    const outOf = P => {
      let j = 1; while (j < P.length && inR(P[j])) j++;
      if (j >= P.length || P.slice(j).some(inR)) return null;
      const a = P[j - 1], b = P[j], dx = b.x - a.x, dy = b.y - a.y, ex = a.x - C.x, ey = a.y - C.y;
      const A2 = dx * dx + dy * dy || 1e-9, B2 = ex * dx + ey * dy, t = (-B2 + Math.sqrt(Math.max(0, B2 * B2 - A2 * (ex * ex + ey * ey - R * R)))) / A2;
      return [{ x: a.x + dx * t, y: a.y + dy * t }].concat(P.slice(j));
    };
    const cuts = [], drop = [], cut = (lk, out, rest) => cuts.push({ lk, out, q: rest[0], rest, ang: Math.atan2(rest[0].y - C.y, rest[0].x - C.x) });
    let ok = true;
    for (const m of inside) for (const li of G.nodes[m].out) {
      const lk = G.links[li]; if (gone.has(li) || cuts.some(c => c.lk === lk)) continue;
      const ia = inside.has(lk.a), ib = inside.has(lk.b);
      if (ia && ib) { if (!drop.includes(li)) drop.push(li); continue; }
      const rest = outOf(ia ? lk.pts : lk.pts.slice().reverse());
      if (!rest) { ok = false; break; }   // (in and out again: left as it is)
      cut(lk, ia ? 'a' : 'b', rest);
    }
    // a street that runs across the circle without a junction inside it is cut in two, both halves ending on the ring
    if (ok) for (const id of nearL) {
      const lk = G.links[id];
      if (gone.has(lk.id) || inside.has(lk.a) || inside.has(lk.b) || lk.ref.ring || cuts.some(c => c.lk === lk || c.lk.half === lk)) continue;
      const i0 = lk.pts.findIndex(inR); if (i0 < 0) continue;
      let i1 = lk.pts.length - 1; while (!inR(lk.pts[i1])) i1--;
      const head = outOf(lk.pts.slice(0, i0 + 1).reverse()), tail = outOf(lk.pts.slice(i1));
      if (!head || !tail) { ok = false; break; }
      cut(lk, 'b', head); cut({ half: lk, b: lk.b }, 'a', tail);   // (the second half is made once the ring is)
    }
    if (!ok || cuts.length < 2) continue;
    // ring points: one per road in (roads in a car's length apart share one)
    cuts.sort((p, q) => p.ang - q.ang);
    const pts = [];
    for (const c of cuts) { const last = pts[pts.length - 1]; if (last && Math.hypot(last.q.x - c.q.x, last.q.y - c.q.y) < 0.03) { c.node = last; continue; } c.node = c; pts.push(c); }
    if (pts.length > 1 && Math.hypot(pts[0].q.x - pts[pts.length - 1].q.x, pts[0].q.y - pts[pts.length - 1].q.y) < 0.03) { const l = pts.pop(); for (const c of cuts) if (c.node === l) c.node = pts[0]; }
    if (pts.length < 2) continue;
    for (const li of drop) gone.add(li);
    const rank = G.nodes[n].rank;
    for (const m of inside) G.nodes[m].out = [];
    pts.forEach(p => {
      p.id = G.nodes.length; G.nodes.push({ x: p.q.x, y: p.q.y, out: [], rank, jk: 'rb', sig: false, ring: site });
      G.at.set(kq(p.q.x, p.q.y) * 4, p.id);
    });
    for (const c of cuts) {
      if (c.lk.half) { const h = c.lk.half, ob = G.nodes[c.lk.b].out; c.lk = Object.assign({}, h, { id: G.links.length, b: c.lk.b }); G.links.push(c.lk); ob[ob.indexOf(h.id)] = c.lk.id; index(c.lk.id, c.rest); }
      const lk = c.lk, id = c.node.id, P = c.rest.slice(); P[0] = { x: c.node.q.x, y: c.node.q.y };
      if (c.out === 'a') { lk.a = id; lk.pts = P; } else { lk.b = id; lk.pts = P.reverse(); }
      lk.cum = cumOf(lk.pts); lk.len = lk.cum[lk.cum.length - 1];
      G.nodes[id].out.push(lk.id);
    }
    // the ring, from each point to the next one round (angles falling: anticlockwise on the map)
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i - 1 + pts.length) % pts.length];
      const a0 = Math.atan2(A.q.y - C.y, A.q.x - C.x); let a1 = Math.atan2(B.q.y - C.y, B.q.x - C.x);
      while (a1 >= a0) a1 -= Math.PI * 2;
      const m = Math.max(2, Math.ceil((a0 - a1) / 0.15)), arc = [];
      for (let k = 0; k <= m; k++) { const a = a0 + (a1 - a0) * k / m; arc.push({ x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R }); }
      arc[0] = { x: A.q.x, y: A.q.y }; arc[m] = { x: B.q.x, y: B.q.y };
      const cum = cumOf(arc), lk = { id: G.links.length, a: A.id, b: B.id, pts: arc, cum, len: cum[cum.length - 1], cls: 'ramp', C: CLS.ramp, one: 1, ref: { ring: site }, city: null, cul: false };
      G.links.push(lk); G.nodes[A.id].out.push(lk.id); G.nodes[B.id].out.push(lk.id);
    }
  }
  // what the rings swallowed goes: links inside them and the nodes left with no road
  const L = G.links.filter(lk => !gone.has(lk.id)), lid = new Map(L.map((lk, i) => [lk.id, i]));
  const keep = G.nodes.map(N => N.out.some(i => !gone.has(i))), nid = new Int32Array(G.nodes.length).fill(-1), NN = [];
  G.nodes.forEach((N, i) => { if (keep[i]) { nid[i] = NN.length; NN.push(N); } });
  for (const N of NN) N.out = N.out.filter(i => !gone.has(i)).map(i => lid.get(i));
  L.forEach((lk, i) => { lk.id = i; lk.a = nid[lk.a]; lk.b = nid[lk.b]; });
  for (const [k, i] of G.at) { if (nid[i] < 0) G.at.delete(k); else G.at.set(k, nid[i]); }
  G.links = L; G.nodes = NN;
}
/* ---------- driving it as a car would (tools/road-audit.js, the tests) ----------
   Where a car following its lane cannot go on: an end that leads nowhere (not a turning head, a bank, a square, a
   farm, a place or the border), an end a few metres short of a road it should meet, a piece between two junctions
   too short for two cars, a bend sharper than a car in its lane can follow, and links a car can reach but not leave
   or leave but not reach (one-way slip roads that lead the wrong way). Lists of points, by kind. */
IC.roadAudit = function (W, G) {
  G = G || IC.driveGraph(W);
  const list = { open: [], gap: [], stub: [], jog: [], kink: [], trap: [] };
  const deg = n => G.nodes[n].out.length;
  const at = (p, q) => Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3;
  const place = new Set(); for (const k in W.nodes) { const n = W.nodes[k]; if (!n.jct) place.add(Math.round(n.x * 10) + ':' + Math.round(n.y * 10)); }
  // what a dead end is meant to be
  const meant = (lk, n) => {
    const N = G.nodes[n], r = lk.ref;
    if (lk.cls === 'hw' || lk.cls === 'ramp') return false;
    if (place.has(Math.round(N.x * 10) + ':' + Math.round(N.y * 10))) return true;
    if (r.edge) return !!(r.edge.abroad || r.edge.border || W.nodes[r.edge.a] && W.nodes[r.edge.b]) && !r.city;
    if (r.lane) return true;
    const st = r.st; if (!st) return false;
    const P = st.pts, e0 = at(P[0], N), e1 = at(P[P.length - 1], N);
    return !!((e0 && ((st.head | st.stop) & 1)) || (e1 && ((st.head | st.stop) & 2)) || st.cul && (e0 || e1));
  };
  // segments of everything drivable, for the near misses
  const B = 2, grid = new Map(), K = (i, j) => (i + 100) * 65536 + j + 100;
  for (const lk of G.links) for (let i = 1; i < lk.pts.length; i++) {
    const a = lk.pts[i - 1], b = lk.pts[i];
    for (let x = Math.floor(Math.min(a.x, b.x) / B); x <= Math.floor(Math.max(a.x, b.x) / B); x++) for (let y = Math.floor(Math.min(a.y, b.y) / B); y <= Math.floor(Math.max(a.y, b.y) / B); y++) {
      const k = K(x, y); let L = grid.get(k); if (!L) grid.set(k, L = []); L.push(lk, i);
    }
  }
  const nearest = (p, skip, r) => {
    let bd = r, best = null;
    for (let x = Math.floor((p.x - r) / B); x <= Math.floor((p.x + r) / B); x++) for (let y = Math.floor((p.y - r) / B); y <= Math.floor((p.y + r) / B); y++) {
      const L = grid.get(K(x, y)); if (!L) continue;
      for (let q = 0; q < L.length; q += 2) { const lk = L[q]; if (skip(lk)) continue; const a = lk.pts[L[q + 1] - 1], b = lk.pts[L[q + 1]], d = U.segDist(p.x, p.y, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = lk; } }
    }
    return best ? { lk: best, d: bd } : null;
  };
  G.nodes.forEach((N, n) => {
    if (deg(n) !== 1) return;
    const lk = G.links[N.out[0]];
    if (lk.cls === 'hw') return;
    // (a short dead end is nonsense whatever it was meant to be)
    if (lk.len < 0.3 && lk.cls !== 'ln' && !lk.ref.edge) { list.stub.push({ x: N.x, y: N.y, cls: lk.cls, len: lk.len }); return; }
    const m = nearest(N, q => q === lk || q.cls === 'hw' || q.a === n || q.b === n, meant(lk, n) ? 0.15 : 0.4);
    if (m && lk.cls !== 'ln') { list.gap.push({ x: N.x, y: N.y, cls: lk.cls, why: `${Math.round(m.d * 100)} m from a ${m.lk.cls}` }); return; }
    if (!meant(lk, n)) list.open.push({ x: N.x, y: N.y, cls: lk.cls });
  });
  // pieces between two junctions too short for two cars (12 m), drawn as a jog in the street
  for (const lk of G.links) if (lk.len < 0.12 && lk.cls !== 'ramp' && lk.cls !== 'hw' && deg(lk.a) >= 3 && deg(lk.b) >= 3) { const p = lk.pts[0]; list.jog.push({ x: p.x, y: p.y, cls: lk.cls, len: lk.len }); }
  // bends a car in its lane cannot follow: more than 60° within 15 m, on a link or through a node with two roads
  const turnAt = (p0, p1, p2) => Math.abs(U.angWrap(Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x)));
  for (const lk of G.links) {
    if (lk.cls === 'ramp' || lk.cls === 'ln') continue;
    const P = lk.pts;
    for (let i = 1; i < P.length - 1; i++) if (turnAt(P[i - 1], P[i], P[i + 1]) > 1.05 && Math.min(U.dist(P[i - 1], P[i]), U.dist(P[i], P[i + 1])) > 0.02) { list.kink.push({ x: P[i].x, y: P[i].y, cls: lk.cls }); break; }
  }
  G.nodes.forEach((N, n) => {
    if (deg(n) !== 2) return;
    const [l1, l2] = N.out.map(i => G.links[i]); if (l1.cls === 'ramp' || l2.cls === 'ramp' || l1 === l2) return;
    const q1 = l1.a === n ? l1.pts[1] : l1.pts[l1.pts.length - 2], q2 = l2.a === n ? l2.pts[1] : l2.pts[l2.pts.length - 2];
    if (turnAt(q1, N, q2) > 1.05) list.kink.push({ x: N.x, y: N.y, cls: l1.cls + '/' + l2.cls });
  });
  // links a car can get onto but not off, or off but not onto: strongly connected parts over the one-way slip roads
  const NN = G.nodes.length, idx = new Int32Array(NN).fill(-1), low = new Int32Array(NN), on = new Uint8Array(NN), comp = new Int32Array(NN).fill(-1);
  const nxt = n => { const r = []; for (const i of G.nodes[n].out) { const q = G.links[i], d = q.a === n ? 0 : 1; if (canGo(q, d)) r.push(d ? q.a : q.b); } return r; };
  let ix = 0, nc = 0; const st = [];
  for (let s0 = 0; s0 < NN; s0++) {
    if (idx[s0] >= 0) continue;
    const work = [[s0, nxt(s0), 0]]; idx[s0] = low[s0] = ix++; st.push(s0); on[s0] = 1;
    while (work.length) {
      const top = work[work.length - 1], [v, ns] = top;
      if (top[2] < ns.length) {
        const w = ns[top[2]++];
        if (idx[w] < 0) { idx[w] = low[w] = ix++; st.push(w); on[w] = 1; work.push([w, nxt(w), 0]); }
        else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        work.pop(); if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === idx[v]) { let w; do { w = st.pop(); on[w] = 0; comp[w] = nc; } while (w !== v); nc++; }
      }
    }
  }
  const size = new Int32Array(nc); for (let n = 0; n < NN; n++) size[comp[n]]++;
  // (a part with no one-way link in it is a road off on its own, which is fine: a village lane, an island's road)
  for (const lk of G.links) if (comp[lk.a] !== comp[lk.b] && lk.one) { const p = lk.pts[Math.floor(lk.pts.length / 2)]; list.trap.push({ x: p.x, y: p.y, cls: lk.cls }); }
  const count = {}; for (const k in list) count[k] = list[k].length;
  return { list, count, words: { open: 'ends that lead nowhere', gap: 'ends that stop short of a road (within 40 m, a turning head within 15 m)', stub: 'dead ends under 30 m', jog: 'pieces under 12 m between two junctions', kink: 'bends over 60° a car cannot follow', trap: 'one-way links that lead into or out of a dead part' } };
};

const canGo = (lk, d) => lk.one === 0 || (d === 0 ? lk.one > 0 : lk.one < 0);
const other = (lk, n) => lk.a === n ? lk.b : lk.a;
IC.driveCanGo = canGo;

/* shortest paths by time from one or more nodes. ok(node) limits the search; returns { t, via } (via: link used to
   arrive, as id*2+dir) over typed arrays */
function dijkstra(G, srcs, ok, maxT) {
  const N = G.nodes.length, t = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1), from = new Int32Array(N).fill(-1);
  const hf = [], hv = [];
  const push = (f, v) => { let i = hf.length; hf.push(f); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hv[i] = hv[p]; i = p; } hf[i] = f; hv[i] = v; };
  const pop = () => { const v = hv[0], lf = hf.pop(), lv = hv.pop(); if (hf.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hf.length) break; if (c + 1 < hf.length && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[i] = hf[c]; hv[i] = hv[c]; i = c; } hf[i] = lf; hv[i] = lv; } return v; };
  srcs.forEach((s, i) => { t[s] = 0; from[s] = i; push(0, s); });
  while (hf.length) {
    const f = hf[0], n = pop(); if (f > t[n]) continue;
    if (maxT && f > maxT) break;
    for (const li of G.nodes[n].out) {
      const lk = G.links[li], d = lk.a === n ? 0 : 1; if (!canGo(lk, d)) continue;
      const m = d ? lk.a : lk.b; if (ok && !ok(m)) continue;
      // (side streets and farm tracks cost more than their speed says: stops, parked cars, give-ways and ruts send
      // through traffic to the avenues and roads)
      const v = f + lk.len / lk.C.v * (lk.cut ? 6 : 1) * (lk.cls === 'st' ? 1.6 : lk.cls === 'ln' ? 2.5 : 1);
      if (v < t[m]) { t[m] = v; via[m] = li * 2 + d; from[m] = from[n]; push(v, m); }
    }
  }
  return { t, via, from };
}
/* the links from a Dijkstra tree's source to a node: [[link, dir], ...] */
function pathTo(G, T, n) {
  const out = [];
  for (let g = 0; g < 5000 && T.via[n] >= 0; g++) { const v = T.via[n], lk = G.links[v >> 1], d = v & 1; out.push([lk, d]); n = d ? lk.b : lk.a; }
  return out.reverse();
}
/* A* between two nodes, for single trips */
function astar(G, s, goal, maxN, allow) {
  const gn = G.nodes[goal], N = G.nodes.length;
  const g = new Map([[s, 0]]), via = new Map(), closed = new Set(), hf = [], hv = [];
  const push = (f, v) => { let i = hf.length; hf.push(f); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hv[i] = hv[p]; i = p; } hf[i] = f; hv[i] = v; };
  const pop = () => { const v = hv[0], lf = hf.pop(), lv = hv.pop(); if (hf.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hf.length) break; if (c + 1 < hf.length && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[i] = hf[c]; hv[i] = hv[c]; i = c; } hf[i] = lf; hv[i] = lv; } return v; };
  const h = n => U.dxy(G.nodes[n].x, G.nodes[n].y, gn.x, gn.y) / 0.31;
  push(h(s), s);
  let exp = 0;
  while (hf.length && exp < (maxN || 8000)) {
    const n = pop(); if (closed.has(n)) continue; closed.add(n); exp++;
    if (n === goal) { const out = []; let k = n; while (via.has(k)) { const v = via.get(k), lk = G.links[v >> 1], d = v & 1; out.push([lk, d]); k = d ? lk.b : lk.a; } return out.reverse(); }
    const gn0 = g.get(n);
    for (const li of G.nodes[n].out) {
      const lk = G.links[li], d = lk.a === n ? 0 : 1; if (!canGo(lk, d) || (allow && !allow(lk))) continue;
      const m = d ? lk.a : lk.b; if (closed.has(m)) continue;
      const v = gn0 + lk.len / lk.C.v * (lk.cut ? 6 : 1);
      if (v < (g.has(m) ? g.get(m) : Infinity)) { g.set(m, v); via.set(m, li * 2 + d); push(v + h(m), m); }
    }
  }
  return null;
}
IC.driveRoute = (G, a, b, maxN) => astar(G, a, b, maxN);

/* ---------- where trips start and end ----------
   A city's blocks are grouped into zones of about 1.5 km; each has homes, jobs and freight by what is built there.
   Airports, remote industries, the depot and the border crossings are places too. */
const HOMES = { old: 1.5, court: 1.6, slab: 1.8, row: 1.1, house: 0.5, cul: 0.45, tower: 0.4, office: 0, mall: 0, shed: 0, ware: 0, yard: 0 };
const JOBS = { tower: 4, office: 2.5, court: 0.8, old: 1.2, mall: 1.5, shed: 1.5, ware: 1, yard: 0.6, slab: 0.2, row: 0.1, house: 0.05, cul: 0.03 };
const FREIGHT = { shed: 1, ware: 1.6, yard: 1.2, mall: 0.3, tower: 0.05, office: 0.1 };
function zonesOf(S, G) {
  const W = S.world, Z = [];
  for (const c of W.cities) {
    const m = new Map(), q = c.style === 'us' ? 3 : 3;
    for (const b of c.blocks) {
      if (b.empty || b.hp <= 0) continue;
      const k = Math.floor((b.i || 0) / q) * 4096 + Math.floor((b.j || 0) / q);
      let z = m.get(k); if (!z) m.set(k, z = { city: c, x: 0, y: 0, n: 0, homes: 0, jobs: 0, frt: 0, blocks: [] });
      const a = b.w * b.h, f = b.f || (b.core ? 'court' : b.ind ? 'shed' : 'house');
      z.x += b.x; z.y += b.y; z.n++; z.homes += a * (HOMES[f] || 0); z.jobs += a * (JOBS[f] || 0); z.frt += a * (FREIGHT[f] || 0); z.blocks.push(b);
    }
    // people and jobs in proportion to the city's population
    let H = 0, Jb = 0; for (const z of m.values()) { H += z.homes; Jb += z.jobs; }
    for (const z of m.values()) {
      z.x /= z.n; z.y /= z.n; z.homes *= c.pop / Math.max(1, H); z.jobs *= c.pop / Math.max(1, Jb);
      // the zone's car park: the nearest street node, else the nearest node of any kind
      z.node = G.nearNode(z.x, z.y, 6, n => n.rank <= 3 && n.rank >= 1);
      if (z.node < 0) z.node = G.nearNode(z.x, z.y, 12);
      if (z.node >= 0) {
        // its trips start and end on several streets round it, not all at one corner
        z.nodes = [z.node];
        for (let k = 0; k < z.blocks.length && z.nodes.length < 4; k += Math.max(1, Math.floor(z.blocks.length / 4))) { const b = z.blocks[k], q = G.nearNode(b.x, b.y, 4, n => n.rank <= 3 && n.rank >= 1); if (q >= 0 && !z.nodes.includes(q)) z.nodes.push(q); }
        z.kind = z.frt > z.jobs * 0.3 ? 'ind' : z.jobs > z.homes ? 'work' : 'home'; z.id = Z.length; Z.push(z);
      }
    }
  }
  return Z;
}
function placesOf(S, G) {
  const W = S.world, P = [];
  const add = (o, kind, w, r, ok) => { const n = G.nearNode(o.x, o.y, r || 8, ok); if (n >= 0) P.push({ id: o.id, name: o.name, x: o.x, y: o.y, kind, w, node: n, ref: o }); };
  // (an airport's middle is the runways: its road is the nearest one that is not a motorway, up to 4 km off)
  for (const a of S.infra) if (a.kind === 'airport' && a.owner === 'us') add(a, 'apt', a.parts ? 3 + (a.rev || 5) / 2 : 0.5, 40, n => n.rank < 5 && n.out.length > 0);
  for (const x of W.crossings) add(x, 'border', 3);
  for (const i of (S.econ && S.econ.inds) || []) add(i, 'industry', 2);
  if (W.depotPos) add({ id: 'depot', name: 'Depot', x: W.depotPos.x, y: W.depotPos.y }, 'depot', 1.5);
  for (const i of S.infra) if (i.kind === 'factory' || i.kind === 'power') add(i, 'industry', 1.5);
  return P;
}

/* ---------- life on the roads (brief 66) ----------
   No trips are planned. Every link carries what is round it, by its class: in town, the homes, jobs and freight of
   the zones near it, more towards the centre and on the avenues, with the commuters running towards the jobs in the
   morning and home in the evening; on the national roads, the people of the towns near and far. A whole street or
   road keeps one character (some are busier than others), so the traffic does not change from block to block. The
   one flow with somewhere to go is the airports': travellers, taxis and shuttles on the roads between each airport
   and the towns it serves, as many as its passengers, filling and emptying its car parks (IC.landUse). */
// how much through traffic each class gathers from what is round it
const GATHER = { hw: 2.5, ring: 2.2, art: 2, rd: 1.6, ramp: 1.2, lc: 1, col: 1, sp: 0.6, st: 0.45, ln: 0.1 };
function assign(S) {
  const W = S.world, G = IC.driveGraph(W), T = S.traffic;
  const Z = zonesOf(S, G), P = placesOf(S, G);
  const nL = G.links.length, F = {};
  for (const p of PURP) F[p] = new Float32Array(nL * 2);
  const lay = (path, v, arr) => { for (const [lk, d] of path) { arr[lk.id * 2 + d] += v; arr[lk.id * 2 + 1 - d] += v; } };
  // the zones on a grid of 1 km, each city's centre of jobs, and our towns
  const zb = new Map(), ZB = 10, k2 = (x, y) => x * 8192 + y;
  for (const z of Z) { const k = k2(Math.floor(z.x / ZB), Math.floor(z.y / ZB)); let L = zb.get(k); if (!L) zb.set(k, L = []); L.push(z); }
  const jc = new Map();
  for (const z of Z) { let j = jc.get(z.city); if (!j) jc.set(z.city, j = { x: 0, y: 0, w: 0 }); j.x += z.x * z.jobs; j.y += z.y * z.jobs; j.w += z.jobs; }
  for (const j of jc.values()) { j.x /= j.w || 1; j.y /= j.w || 1; }
  const towns = W.cities.filter(c => c.pop > 0 && c.home !== false);
  // freight from the places that make or move goods, on the national roads near them
  const depots = P.filter(p => p.kind !== 'apt');
  const char = new WeakMap(), charOf = lk => { let v = char.get(lk.ref); if (v == null) char.set(lk.ref, v = 0.45 + 1.1 * U.hash(lk.id * 13 + 5, 77)); return v; };
  for (const lk of G.links) {
    const i = lk.id * 2, P0 = lk.pts[0], P1 = lk.pts[lk.pts.length - 1], m = lk.pts[lk.pts.length >> 1];
    if (lk.cls === 'ln') { F.gen[i] = F.gen[i + 1] = 0.02; continue; }   // (farm tracks: the farms' own)
    let act = 0, frt = 0, jx = 0, jy = 0, dir = 0.42;
    // the national roads, and their pieces through a town: the towns near and far
    if (!lk.city || lk.ref.edge) {
      // (the towns are 170–400 km apart: the far term carries the traffic between them)
      for (const c of towns) {
        const d = U.dist(c, m), w = c.pop * (Math.exp(-d / 80) + 0.25 * Math.exp(-d / 1500)), q = c.pop * Math.exp(-d / 150) / (d + 1);
        act += w; jx += (c.x - m.x) * q; jy += (c.y - m.y) * q;
      }
      frt = act * 0.3;
      for (const p of depots) { const d = U.dist(p, m); if (d < 300) frt += p.w * 120 * Math.exp(-d / 60); }
      // (half of them each way at any hour, the rest drawn towards the bigger town in the morning)
      dir = 0.25;
      if (lk.city) { act *= 0.5; frt *= 0.5; jx *= 0.5; jy *= 0.5; }
    }
    if (lk.city) {
      const gx = Math.floor(m.x / ZB), gy = Math.floor(m.y / ZB);
      for (let x = gx - 2; x <= gx + 2; x++) for (let y = gy - 2; y <= gy + 2; y++) for (const z of zb.get(k2(x, y)) || []) {
        const d = U.dist(z, m); if (d > 25) continue;
        const w = Math.exp(-d / 8);
        // (a side street carries its residents: the offices' traffic keeps to the avenues and the car parks)
        act += (z.homes + z.jobs * (lk.cls === 'st' ? 0.25 : 1)) * w; frt += z.frt * w;
        jx += (z.x - m.x) / (d + 1) * z.jobs * w; jy += (z.y - m.y) / (d + 1) * z.jobs * w;
      }
      // busier towards the middle of town, and the commuters drawn towards its centre of jobs as well as the jobs nearby
      const c = lk.city, ext = c.ext || c.r || 20, j = jc.get(c);
      if (lk.cls !== 'st') act *= 0.8 + 0.5 * Math.exp(-U.dist(m, c) / (ext * 0.6));
      if (j) { const dj = U.dxy(j.x, j.y, m.x, m.y) + 1, J = Math.hypot(jx, jy); jx += (j.x - m.x) / dj * (J + act * 0.3); jy += (j.y - m.y) / dj * (J + act * 0.3); }
      if (lk.cul) act *= 0.2;
    }
    const g = GATHER[lk.cls] || 1, k = g * charOf(lk);
    const hx = P1.x - P0.x, hy = P1.y - P0.y, hl = Math.hypot(hx, hy) || 1, J = Math.hypot(jx, jy);
    // the share of the commuters that runs a→b in the morning: towards the jobs
    const s = J > 0 ? 0.5 + dir * (jx * hx + jy * hy) / (J * hl) : 0.5;
    F.com[i] = act * k * 0.6 * s; F.com[i + 1] = act * k * 0.6 * (1 - s);
    F.gen[i] = F.gen[i + 1] = act * k * 0.3;
    F.frt[i] = F.frt[i + 1] = frt * k * 0.3;
    F.apt[i] = F.apt[i + 1] = act * k * 0.02;
  }
  // the streets where each zone's trips start and end: into the offices and out of the homes in the morning
  for (const z of Z) {
    const k = 0.15 / z.nodes.length;
    for (const n of z.nodes) for (const li of G.nodes[n].out) {
      const lk = G.links[li], toN = lk.b === n ? 0 : 1, i = lk.id * 2;
      F.com[i + toN] += z.jobs * k; F.com[i + 1 - toN] += z.homes * k;
    }
  }
  // the airports: to and from each of the towns within 150 km by its road, as many as it carries passengers
  for (const p of P) {
    if (p.kind !== 'apt') continue;
    const w = p.w, near = W.cities.filter(c => c.home !== false && U.dist(c, p) < 1500).sort((a, b) => U.dist(a, p) - U.dist(b, p)).slice(0, 3);
    near.forEach((c, r) => {
      const n = G.nearNode(c.x, c.y, 8); if (n < 0) return;
      const path = astar(G, p.node, n, 60000); if (!path) return;
      lay(path, c.pop * w * (1 - U.dist(c, p) / 1500) / (r + 1) * 0.4, F.apt);
    });
  }
  // flows into loads, class by class: the busiest links of each class at a full rush hour run at what that class
  // carries at its busiest in real cities (motorways at capacity, side streets far from it). City streets are
  // measured city by city: the many small towns of a big map would otherwise make every capital street a jam
  const ck = lk => lk.city && (lk.cls === 'st' || lk.cls === 'col' || lk.cls === 'art' || lk.cls === 'ring') ? lk.cls + '|' + (lk.city.id || lk.city) : lk.cls;
  const TOP = { hw: 1.05, ring: 0.75, rd: 0.8, art: 0.65, lc: 0.45, sp: 0.5, col: 0.5, st: 0.4, ln: 0.12, ramp: 0.8 }, byCls = {};
  for (let i = 0; i < nL; i++) {
    const lk = G.links[i];
    for (let d = 0; d < 2; d++) { const v = F.com[i * 2 + d] + F.frt[i * 2 + d] + F.apt[i * 2 + d] + F.gen[i * 2 + d]; if (v > 0) (byCls[ck(lk)] = byCls[ck(lk)] || []).push(v); }
  }
  // (a town's busiest are its centre's few avenues, measured at the 99.5th percentile; the roads at the 97th)
  const kc = {};
  for (const c in byCls) { const a = byCls[c].sort((x, y) => x - y); kc[c] = TOP[c.split('|')[0]] / Math.max(1e-9, a[Math.floor(a.length * (c.includes('|') ? 0.995 : 0.97))]); }
  // Scaled by the busiest alone, a city of two million read as empty (one car to the kilometre at rush hour), as
  // the quiet streets far from the centre carry a small share of the busiest one's flow. The root pulls the many quiet links up towards the busy ones while the ranking stays, every
  // street in town carries at least its residents and deliveries (the floor), and a small town's streets are
  // quieter than the capital's at the same rank (sizeK)
  const sizeK = c => c ? U.clamp(Math.pow(((c.pop || 50)) / IC.TRAFFIC_LOAD.fullPop, 0.35), IC.TRAFFIC_LOAD.minSize, 1) : 1;
  const FLOOR = IC.TRAFFIC_LOAD.floor;
  for (let i = 0; i < nL; i++) {
    const lk = G.links[i], k = kc[ck(lk)] || 0, top = TOP[lk.cls], sz = lk.city ? sizeK(lk.city) : 1, gamma = lk.city ? IC.TRAFFIC_LOAD.gamma : IC.TRAFFIC_LOAD.gammaRoad;
    for (let d = 0; d < 2; d++) {
      const j = i * 2 + d, raw = F.com[j] + F.frt[j] + F.apt[j] + F.gen[j], v = raw * k;
      // (a suburb's close carries its own few residents: a quarter of a street's floor, brief 54)
      const want = Math.max((FLOOR[lk.cls] || 0) * (lk.city ? sz * (lk.cul ? 0.25 : 1) : 1), (v <= 0 ? 0 : v < top ? top * Math.pow(v / top, gamma) : v) * sz);
      // (the flows are in load units from here on)
      if (raw > 0) { const f = want / raw; for (const p of PURP) F[p][j] *= f; }
      else { F.gen[j] = want * 0.6; F.com[j] = want * 0.4; }
    }
  }
  T.F = F; T.zones = Z; T.places = P; T.G = G;
  T.nApt = S.infra.filter(a => a.kind === 'airport' && a.owner === 'us' && a.parts).length;
}

/* ---------- start, and the step ---------- */
// each link's traffic: load, speed and purpose mix by direction, and where its slots ride
const linkState = lk => ({ l: lk, cls: lk.cls, C: lk.C, len: lk.len, ld: [0, 0], load: 0, v: [0, 0], ph: [U.hash(lk.id, 1) * 1000, U.hash(lk.id, 2) * 1000], key: lk.id * 7919 + 1, mix: [[0, 0, 0], [0, 0, 0]], mixOk: [0, 0] });
const mixOf = (L, d) => L.mixOk[d] ? L.mix[d] : null;
// the links before the suburbs' closes, which the drive graph puts last (brief 54): the town zoom stops there
// the links skipped at the town zoom: a suburb's closes and a housing block's own streets (brief 68), a car or two each
const minorOf = G => Uint8Array.from(G.links, lk => lk.cul || (lk.ref.st && lk.ref.st.res) ? 1 : 0);
IC.trafficInit = function (S) {
  const W = S.world, G = IC.driveGraph(W);
  S.traffic = { links: G.links.map(linkState), hour: 0, stepT: 0, G, minor: minorOf(G) };
  assign(S);
  // buses on routed lines with stops, coaches between cities, trains on the railways
  S.buses = []; busLines(S);
  S.trains = [];
  const R = IC.makeRng((S.seed * 977 + 5) >>> 0);
  for (const r of W.rails) { r.cum = cumOf(r.pts); r.len = r.cum[r.cum.length - 1]; if (R() < 0.8) S.trains.push({ r, s: R() * r.len, dir: R() < 0.5 ? 1 : -1, spd: R.range(0.3, 0.42), cars: R.int(6, 14), wait: 0 }); }
  IC.traffic(S, 0);
};
/* roads changed (built, split, cut or reopened): the graph and the trips are worked out again */
IC.trafficRoadChanged = function (S) { if (S.traffic) S.traffic.dirty = true; };
IC.trafficRebuild = function (S) {
  const W = S.world; W._dg = null;
  const T = S.traffic, G = IC.driveGraph(W);
  for (const e of W.edges) if (e.cut) for (const lk of G.links) if (lk.ref.edge === e) lk.cut = true;
  T.G = G; T.links = G.links.map(linkState); T.minor = minorOf(G);
  assign(S); T.dirty = false; T.stepT = 0;
  const A = AG.get(S); if (A) A.reset = true;
  busLines(S);
};

IC.traffic = function (S, dt) {
  const T = S.traffic; if (!T) return;
  if (T.dirty && (T.rebuildT == null || S.time - T.rebuildT > 600)) { T.rebuildT = S.time; IC.trafficRebuild(S); }
  const war = S.enemy && S.enemy.war, W = S.world;
  // flows are re-read every two minutes of game time, and at once when an air raid alert starts or ends
  let sig = S.alertCities || 0; for (const c of W.cities) if (c.alert > 0) sig += 1 + c.x;
  if (sig !== T.alertSig) { T.alertSig = sig; T.stepT = 0; }
  T.stepT -= dt;
  if (T.stepT <= 0) {
    T.stepT = 120;
    const nA = S.infra.filter(a => a.kind === 'airport' && a.owner === 'us' && a.parts).length;
    if (nA !== T.nApt) { T.dirty = true; T.nApt = nA; }
    const h = (S.time % 86400) / 3600, F = T.F;
    T.hour = IC.trafficHour(S);
    const fi = hr(H_IN, h), fo = hr(H_OUT, h), ff = hr(H_FRT, h), fa = hr(H_APT, h), fg = hr(H_GEN, h);
    const g = (war ? 0.75 : 1) * (S.alertCities > 2 ? 0.55 : 1);
    for (const L of T.links) {
      // the slots have ridden at the old speed since the last reading
      // (the remainder only when it wraps: it is the same number, and the slow part of this loop over every link)
      for (let d = 0; d < 2; d++) { const p = L.ph[d] + L.v[d] * (S.time - (L.t0 || S.time)); L.ph[d] = p >= 0 && p < BASE * 65536 ? p : p % (BASE * 65536); }
      L.t0 = S.time;
      const lk = L.l, i = lk.id * 2;
      // the town a link runs through: its own streets, or national roads inside its built-up area
      if (L.town === undefined) { const m = lk.pts[lk.pts.length >> 1]; L.town = lk.city || W.cities.find(t => U.dist(t, m) < (t.ext || t.r) * 1.1) || null; }
      const c = L.town;
      // under an air raid alert people leave the roads for the shelters
      const raid = c && c.alert > 0 ? 0.25 : 1;
      const cut = lk.cut || (lk.ref.edge && W.blocked && W.blocked.has(lk.ref.edge.id)) ? 0.05 : 1;
      for (let d = 0; d < 2; d++) {
        // commuters run home→work in the morning and back in the evening: the reverse direction's flow comes home
        const com = F.com[i + d] * fi + F.com[i + 1 - d] * fo, frt = F.frt[i + d] * ff, apt = F.apt[i + d] * fa, gen = F.gen[i + d] * fg;
        const tot = com + frt + apt + gen;
        // the demand, and the load the road can carry (a jammed street shows no direction; the demand still does);
        // raw is the load without a cut, which drivers head for until they find the road cut
        (L.dem || (L.dem = [0, 0]))[d] = tot * g * raid * cut;
        L.ld[d] = U.clamp(L.dem[d], 0, 1.3); (L.raw || (L.raw = [0, 0]))[d] = U.clamp(tot * g * raid, 0, 1.3);
        const M = L.mix[d]; L.mixOk[d] = tot > 0 ? 1 : 0; if (tot > 0) { M[0] = com / tot; M[1] = frt / tot; M[2] = apt / tot; }
        // a full road slows down: at peak the motorways round the capital crawl
        L.v[d] = lk.C.v * (L.ld[d] > 0.75 ? U.clamp(1 - (L.ld[d] - 0.75) * 1.3, 0.3, 1) : 1) * (raid < 1 ? 0.4 : 1);
      }
      L.load = Math.max(L.ld[0], L.ld[1]); L.cut = cut < 1;
    }
    // the junctions in front of a cut road, where traffic queues before it turns back
    T.cutN = new Set(); for (const L of T.links) if (L.cut) { T.cutN.add(L.l.a); T.cutN.add(L.l.b); }
    // in town, where links are short, the queue backs up through the junction behind
    for (let r = 0; r < 2; r++) for (const n of [...T.cutN]) for (const li of T.G.nodes[n].out) { const L = T.links[li]; if (!L.cut && L.l.len < 3 && L.l.city) T.cutN.add(L.l.a === n ? L.l.b : L.l.a); }
  }
  for (const b of S.buses) moveBus(S, b, dt);
  for (const t of S.trains) {
    if (t.wait > 0) { t.wait -= dt; continue; }
    t.s += t.dir * t.spd * dt;
    // trains stand at the terminus for a few minutes, then run back
    if (t.s < 0 || t.s > t.r.len) { t.dir *= -1; t.s = U.clamp(t.s, 0, t.r.len); t.wait = 240; }
  }
};

/* ---------- buses and coaches ----------
   City lines run across town between two far-apart zones, stopping every 400–500 m; coaches run between
   neighbouring cities; a shuttle runs from each airport to its city. Each line is a route of links. */
function busLines(S) {
  const T = S.traffic, G = T.G, W = S.world, R = IC.makeRng((S.seed * 131 + 71) >>> 0);
  const old = S.buses || [];
  const lines = [];
  const mk = (path, kind, name, stopEvery) => {
    if (!path || path.length < 2) return;
    const pts = []; for (const [lk, d] of path) { const P = d ? lk.pts.slice().reverse() : lk.pts; for (let i = pts.length ? 1 : 0; i < P.length; i++) pts.push(P[i]); }
    const cum = cumOf(pts), len = cum[cum.length - 1]; if (len < 8) return;
    const stops = []; for (let s = stopEvery * 0.5; s < len - 2; s += stopEvery) stops.push(s);
    lines.push({ path, pts, cum, len, stops, kind, name });
  };
  const byCity = new Map(); for (const z of T.zones) { let L = byCity.get(z.city); if (!L) byCity.set(z.city, L = []); L.push(z); }
  for (const [c, L] of byCity) {
    if (c.pop < 120) continue;
    const n = Math.min(6, 1 + Math.floor(c.pop / 300)), ctr = G.nearNode(c.x, c.y, 8);
    for (let k = 0; k < n; k++) {
      // a line through the centre: from a zone on one side to one on the other
      const a = (k / n) * Math.PI + R.range(-0.2, 0.2);
      const side = s => L.filter(z => Math.cos(Math.atan2(z.y - c.y, z.x - c.x) - a) * s > 0.7).sort((p, q) => U.dist(q, c) - U.dist(p, c))[Math.floor(R() * 3)];
      const z0 = side(1), z1 = side(-1); if (!z0 || !z1) continue;
      const street = lk => lk.cls !== 'hw' && lk.cls !== 'ramp';
      const p1 = ctr >= 0 ? astar(G, z0.node, ctr, 20000, street) : null, p2 = ctr >= 0 ? astar(G, ctr, z1.node, 20000, street) : null;
      if (p1 && p2) mk(p1.concat(p2), 'bus', `${c.name} line ${k + 1}`, 4.5);
    }
  }
  // coaches between neighbouring cities, shuttles to the airports
  const cn = W.cities.map(c => G.nearNode(c.x, c.y, 8)), pairs = new Set(), road = lk => !!lk.ref.edge || lk.cls === 'ramp';
  W.cities.forEach((c, i) => {
    if (c.pop < 150 || cn[i] < 0) return;
    const near = W.cities.map((o, j) => [o, j]).filter(([o, j]) => j !== i && cn[j] >= 0 && U.dist(o, c) < 4000).sort((p, q) => U.dist(p[0], c) - U.dist(q[0], c)).slice(0, 2);
    for (const [o, j] of near) {
      const k = Math.min(i, j) + ',' + Math.max(i, j); if (pairs.has(k)) continue; pairs.add(k);
      const p = astar(G, cn[i], cn[j], 200000, road); if (p) mk(p, 'coach', `${c.name} – ${o.name}`, 1e9);
    }
  });
  for (const p of T.places) {
    if (p.kind !== 'apt' || !p.ref.parts) continue;
    const c = W.cities.find(c => c.id === p.ref.city) || W.cities.slice().sort((a, b) => U.dist(a, p) - U.dist(b, p))[0];
    const n = G.nearNode(c.x, c.y, 8); if (n < 0) continue;
    const path = astar(G, n, p.node, 60000); if (path) mk(path, 'shuttle', `${c.name} – ${p.name} shuttle`, 1e9);
  }
  T.lines = lines;
  S.buses = [];
  for (const l of lines) {
    const n = l.kind === 'bus' ? Math.max(2, Math.round(l.len / 25)) : 2;
    for (let i = 0; i < n; i++) S.buses.push({ line: l, s: (i / n) * l.len, dir: i % 2 ? -1 : 1, wait: 0, next: 0, coach: l.kind !== 'bus', kind: l.kind });
  }
  for (const b of S.buses) b.next = nextStop(b);
  void old;
}
const nextStop = b => { const L = b.line.stops; if (b.dir > 0) { for (const s of L) if (s > b.s + 0.01) return s; return b.line.len; } for (let i = L.length - 1; i >= 0; i--) if (L[i] < b.s - 0.01) return L[i]; return 0; };
function moveBus(S, b, dt) {
  if (b.wait > 0) { b.wait -= dt; return; }
  const l = b.line, c = l.path[0][0].city, v = (b.kind === 'bus' ? 0.09 : 0.22) * (c && c.alert > 0 ? 0 : 1) * (S.traffic.hour < 0.1 && b.kind === 'bus' ? 0 : 1);
  b.s += b.dir * v * dt;
  if ((b.dir > 0 && b.s >= b.next) || (b.dir < 0 && b.s <= b.next)) {
    b.s = b.next;
    if (b.s <= 0 || b.s >= l.len) { b.dir *= -1; b.wait = b.kind === 'bus' ? 180 : 600; }
    else b.wait = 25;
    b.next = nextStop(b);
  }
}
// the heading of each piece of a line, worked out once (a link's is kept in l.hd)
const headings = pts => { const h = new Float32Array(pts.length - 1); for (let i = 1; i < pts.length; i++) h[i - 1] = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x); return h; };
const along = (pts, cum, s) => {
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = pts[lo - 1], b = pts[lo], t = (s - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
};
IC.along = along;
IC.trainPos = t => along(t.r.pts, t.r.cum, U.clamp(t.s, 0, t.r.len));
IC.busPos = b => { const p = along(b.line.pts, b.line.cum, U.clamp(b.s, 0, b.line.len)); if (b.dir < 0) p.h += Math.PI; return p; };

/* ---------- how many vehicles are drawn ----------
   Every way of drawing road traffic (the slots of the middle zoom, the vehicles on their own trips close in, the 3D
   view) shows the same share of the vehicles the flows put on a road at a zoom: all of them once they are drawn at
   their real size, fewer farther out, where each is drawn a few pixels long and they would crowd the road. The share
   changes smoothly with the zoom, and a smaller share is always part of a larger one, so as the player zooms
   vehicles come and go one at a time and the count on a street never jumps. Two hand-overs blend over a range of
   zooms: the moving dashes of the far view into the slots (TRAFFIC_DASH), and the slots into the vehicles on their
   own trips (TRAFFIC_AGZ). */
IC.trafficKeep = z => Math.min(1, 2.5 * KINDS.car.L / Math.max(KINDS.car.L, 4.4 / z));
IC.TRAFFIC_DASH = [1.1, 1.6];
IC.TRAFFIC_AGZ = [20, 30];
/* a slot's rank: slots at multiples of 2^n come first, so a share of keep needs only every 2^n-th slot looked at */
function slotRank(j, key) { const tz = j ? 31 - Math.clz32(j & -j) : 16; return (1 + U.hash(key + 7919, j)) / (2 << Math.min(16, tz)); }
IC.trafficSlotRank = slotRank;

/* ---------- vehicles in slots, for the middle zoom ----------
   fn(x, y, heading, kind, cls, lane) for each vehicle in a view rectangle. gap: the smallest spacing to show, or
   { keep (the share shown), cls: { class: weight of its share } }; skip: classes to leave out. Near a junction with
   lights or a give way the slots bunch up: traffic slows and queues there. */
const KIND_LIST = Object.keys(KINDS);
function pickKind(mix, h) {
  // h in [0, 1): which purpose, then which vehicle of that purpose
  const p = !mix ? 3 : h < mix[0] ? 0 : h < mix[0] + mix[1] ? 1 : h < mix[0] + mix[1] + mix[2] ? 2 : 3;
  const M = MIX[PURP[p]], lo = !mix ? 0 : p === 0 ? 0 : p === 1 ? mix[0] : p === 2 ? mix[0] + mix[1] : mix[0] + mix[1] + mix[2];
  const w = !mix ? 1 : p === 3 ? 1 - lo : mix[p];
  let r = w > 0 ? (h - lo) / w : 0;
  for (const [k, q] of M) { if (r < q) return k; r -= q; }
  return M[0][0];
}
IC.trafficVisible = function (S, view, gap, fn, skip) {
  const T = S.traffic; if (!T) return 0;
  const G = T.G, o = typeof gap === 'object' ? gap : null, keep0 = o ? o.keep : Math.min(1, BASE / Math.max(BASE, gap)), W = o && o.cls;
  let n = 0;
  // the links in view come from a coarse grid of them (a hundred thousand links, a few thousand in a city view);
  // a suburb's closes carry a car or two each and are drawn only close in: at the town zoom they are skipped,
  // and so are the housing blocks' own streets, since a city has thousands of them (T.minor)
  const mn = view.x1 - view.x0 > 150 ? T.minor : null, LG = linkGrid(T), stamp = ++LG.stamp;
  const ci0 = Math.floor(view.x0 / LG.C), ci1 = Math.floor(view.x1 / LG.C), cj0 = Math.floor(view.y0 / LG.C), cj1 = Math.floor(view.y1 / LG.C);
  for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
    const cell = LG.m.get(ci * 65536 + cj); if (!cell) continue;
    for (let q = 0; q < cell.length; q++) {
    const li = cell[q]; if ((mn && mn[li]) || LG.seen[li] === stamp) continue;
    LG.seen[li] = stamp;
    const L = T.links[li], l = L.l, bb = l.bb;
    if (L.load <= 0.01 || (skip && skip[L.cls]) || bb[2] < view.x0 || bb[0] > view.x1 || bb[3] < view.y0 || bb[1] > view.y1) continue;
    const keep = keep0 * (W && W[L.cls] != null ? W[L.cls] : 1); if (keep <= 0) continue;
    const step = keep >= 1 ? 1 : 1 << Math.min(16, Math.floor(Math.log2(1 / keep)));
    const P = l.pts, cum = l.cum, len = l.len;
    let s0 = 1e9, s1 = -1;
    if (bb[0] >= view.x0 && bb[2] <= view.x1 && bb[1] >= view.y0 && bb[3] <= view.y1) { s0 = 0; s1 = len; }   // (wholly in view)
    else for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (Math.max(a.x, b.x) < view.x0 || Math.min(a.x, b.x) > view.x1 || Math.max(a.y, b.y) < view.y0 || Math.min(a.y, b.y) > view.y1) continue;
      if (cum[i - 1] < s0) s0 = cum[i - 1]; if (cum[i] > s1) s1 = cum[i];
    }
    if (s1 < 0) continue;
    const lanes = L.C.lanes;
    for (let d = 0; d < 2; d++) {
      if (!canGo(l, d) || L.ld[d] <= 0.01) continue;
      const p = L.ld[d] * L.C.dens * IC.TRAFFIC_SHOW * BASE, end = G.nodes[d ? l.a : l.b];
      // the queue at the end of the link: vehicles there move Kq times slower, so they stand closer together;
      // in front of a cut road the queue is long
      const qc = !L.cut && T.cutN && T.cutN.has(d ? l.a : l.b) && L.ld[d] > 0.05;
      const Kq = qc ? 9 : end.sig || end.jk === 'rb' || end.rank > L.C.rank ? 1 + 3 * U.clamp(L.ld[d] - 0.3, 0, 1) : 1, Q = qc ? Math.min(len * 0.7, 1 + L.ld[d] * 6) : Kq > 1 ? Math.min(len * 0.4, 0.3 + L.ld[d] * 1.5) : 0;
      const qs = len - Q, span = len + Q * (Kq - 1), toS = u => u < qs ? u : qs + (u - qs) / Kq;
      const ph = phase(L, d, S.time);
      // slot j rides at j·BASE + phase from its lane's start (the far end for the other direction);
      // the same j is the same vehicle from frame to frame, and coarser zooms show every 2^k-th slot
      const a = d ? len - s1 : s0, b = d ? len - s0 : s1;
      const ua = a < qs ? a : qs + (a - qs) * Kq, ub = b < qs ? b : qs + (b - qs) * Kq;
      let j = Math.ceil((ua - ph) / BASE); j += (step - (j % step + step) % step) % step;
      for (; j * BASE + ph <= Math.min(ub, span); j += step) {
        // (in the queue before a cut road the vehicles stand bumper to bumper, on any road that carried a few)
        const u = j * BASE + ph, h = U.hash(L.key + d, j & 65535);
        if (h > (qc && u > qs ? Math.max(p, Math.min(0.6, L.ld[d] * 1.5)) : p) || (keep < 1 && slotRank(j & 65535, L.key + d) >= keep)) continue;
        // (the place along the link without an object or an arc tangent a vehicle: the heading is the piece's, kept)
        const s = toS(u), sv = d ? len - s : s;
        let lo = 1, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < sv) lo = mid + 1; else hi = mid; }
        const pa = P[lo - 1], pb = P[lo], t = (sv - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1), qx = pa.x + (pb.x - pa.x) * t, qy = pa.y + (pb.y - pa.y) * t;
        if (qx < view.x0 || qx > view.x1 || qy < view.y0 || qy > view.y1) continue;
        const hd = l.hd || (l.hd = headings(P)), qh = hd[lo - 1];
        const kind = pickKind(mixOf(L, d), h / p), lane = lanes > 1 ? (KINDS[kind].L > 0.1 || U.hash(j, L.key) < 0.55 ? 0 : 1) : 0;
        fn(qx, qy, d ? qh + Math.PI : qh, kind, L.cls, L.C.off[lane]);
        n++;
      }
    }
    }
  }
  return n;
};
/* the links on a grid of 64-unit cells, by their boxes, made once for a set of links (again when the roads change) */
/* the links whose cells meet a box, each once, in the order of T.links */
function linksNear(T, b) {
  const LG = linkGrid(T), stamp = ++LG.stamp, ix = [], out = LG.out || (LG.out = []);
  out.length = 0;
  for (let cj = Math.floor(b.y0 / LG.C); cj <= Math.floor(b.y1 / LG.C); cj++) for (let ci = Math.floor(b.x0 / LG.C); ci <= Math.floor(b.x1 / LG.C); ci++) {
    const cell = LG.m.get(ci * 65536 + cj); if (!cell) continue;
    for (let q = 0; q < cell.length; q++) { const li = cell[q]; if (LG.seen[li] !== stamp) { LG.seen[li] = stamp; ix.push(li); } }
  }
  ix.sort((p, q) => p - q);
  for (const li of ix) out.push(T.links[li]);
  return out;
}
function linkGrid(T) {
  if (T._lg && T._lg.links === T.links) return T._lg;
  const C = 64, m = new Map();
  T.links.forEach((L, li) => { const bb = L.l.bb; for (let j = Math.floor(bb[1] / C); j <= Math.floor(bb[3] / C); j++) for (let i = Math.floor(bb[0] / C); i <= Math.floor(bb[2] / C); i++) { const k = i * 65536 + j; let a = m.get(k); if (!a) m.set(k, a = []); a.push(li); } });
  return T._lg = { links: T.links, C, m, seen: new Uint32Array(T.links.length), stamp: 0 };
}

/* the vehicles the map shows in a view at zoom z, dt game seconds after the last frame: the slots riding the flows,
   handing over to the vehicles on their own trips (IC.TRAFFIC_AGZ), the share of both by IC.trafficKeep, faded in
   from the far view's dashes (IC.TRAFFIC_DASH); city streets and lanes join in as the zoom comes to them.
   fn(x, y, heading, kind, colour, cls, lane offset): a slot is on the road's centre line with its lane's offset to
   lay off (the renderer widens it with the road), a vehicle on its own trip already in its lane (offset 0) */
IC.trafficShown = function (S, view, z, dt, fn) {
  const D = IC.TRAFFIC_DASH, AZ = IC.TRAFFIC_AGZ, wD = U.clamp((z - D[0]) / (D[1] - D[0]), 0, 1), wA = U.clamp((z - AZ[0]) / (AZ[1] - AZ[0]), 0, 1);
  const keep = IC.trafficKeep(z) * wD;
  let n = 0;
  if (keep <= 0) return 0;
  if (wA < 1) {
    const sw = U.clamp(z - 2, 0, 1);
    n += IC.trafficVisible(S, view, { keep: keep * (1 - wA), cls: { st: sw, ln: sw } }, (x, y, h, k, cls, off) => fn(x, y, h, k, (x * 7 + y * 13) & 1023, cls, off));
  }
  // the vehicles on their own trips carry the whole share, and show the part of it handed over to them
  if (wA > 0) for (const a of IC.trafficAgents(S, view, dt, keep)) {
    if (a.u >= keep * wA) continue;
    const p = IC.agentPos(a); if (p.x < view.x0 - 1 || p.x > view.x1 + 1 || p.y < view.y0 - 1 || p.y > view.y1 + 1) continue;
    fn(p.x, p.y, p.h, a.k, a.col, a.route[a.ri][0].cls, 0); n++;
  }
  return n;
};
/* flow along the roads for the far view: fn(link, load, phase, cls) for roads in view */
IC.trafficFlows = function (S, view, classes, fn) {
  const T = S.traffic; if (!T) return;
  for (const L of T.links) {
    const bb = L.l.bb;
    if (!classes[L.cls] || L.load <= 0.02 || bb[2] < view.x0 || bb[0] > view.x1 || bb[3] < view.y0 || bb[1] > view.y1) continue;
    fn(L.l, L.load, phase(L, 0, S.time), L.cls);
  }
};

/* ---------- close in: vehicles that look like traffic ----------
   Around the view, vehicles leave zones (car parks, estates, depots, the airport) at a rate set by the zone's
   homes, jobs and freight for the hour, or come in from beyond the view on the links that carry traffic. They
   do not plan trips: at each junction a vehicle takes the next road at random, weighted by how much traffic that
   road carries and how straight on it is, so busy roads stay busy and quiet ones quiet. After a few km it turns
   off and parks. In lane, it keeps its distance, slows through junctions and gives way to whoever is already in
   one; it queues in front of a cut road and turns back after a while. Nothing here touches the simulation state:
   the renderer calls it with the game time that has passed. */
const AG = new WeakMap();
// how many of the vehicles the flows imply are drawn (brief 30 halved it when they piled onto the through roads;
// with the loads spread over the streets most of them are shown)
IC.TRAFFIC_SHOW = 1;
// (3,600 since brief 53: the streets traced on the field are denser, and the capital's centre close in implies about
// a thousand vehicles in a 3 × 2 km window)
const AG_MAX = 3000;
// how far a vehicle drives before it parks (world units), by purpose
const LIFE = { com: [20, 100], frt: [50, 250], apt: [50, 200], gen: [10, 60], through: [30, 150] };
function headOut(q, dd) { const Q = q.pts, q0 = dd ? Q[Q.length - 1] : Q[0], q1 = dd ? Q[Q.length - 2] : Q[1]; return Math.atan2(q1.y - q0.y, q1.x - q0.x); }
function headIn(lk, d) { const P = lk.pts, p0 = d ? P[1] : P[P.length - 2], p1 = d ? P[0] : P[P.length - 1]; return Math.atan2(p1.y - p0.y, p1.x - p0.x); }
/* the next road from node n: weighted by its traffic in that direction and by how straight on it is */
function pickNext(G, T, n, lk, R, back) {
  const hd = lk ? headIn(lk[0], lk[1]) : null, c = [];
  let tot = 0;
  for (const li of G.nodes[n].out) {
    const q = G.links[li];
    if (q === (lk && lk[0]) && !back) continue;
    // drivers find a cut road when they get there, so they head for it as they would have; turning back, they avoid it
    const dd = q.a === n ? 0 : 1, Lq = T.links[q.id]; if (!canGo(q, dd) || (back && (q.cut || (Lq && Lq.cut)))) continue;
    // (more than in proportion: an avenue at half load takes most of the turning traffic from a side street at a tenth)
    let w = Math.pow(Lq ? (Lq.cut ? Lq.raw[dd] : Lq.ld[dd]) : 0, 1.5) + 0.02;
    if (hd != null && q !== lk[0]) w *= 0.3 + Math.max(0, Math.cos(headOut(q, dd) - hd));
    tot += w; c.push(q, dd, w);
  }
  if (!c.length) return null;
  let r = R() * tot;
  for (let i = 0; i < c.length; i += 3) if ((r -= c[i + 2]) <= 0) return [c[i], c[i + 1]];
  return [c[c.length - 3], c[c.length - 2]];
}
/* u: the vehicle's rank, from 0 up to the share of the flows the agents carry (IC.trafficKeep): shown while it is
   below the share the renderer draws */
function newAgent(S, A, route, s0, kind, purpose, org, u) {
  const K = KINDS[kind], lk = route[0][0], L = LIFE[purpose] || LIFE.gen, R = A.R;
  const a = { k: kind, K, route, ri: 0, s: s0, v: lk.C.v * 0.5, lane: 0, org, pur: purpose, life: L[0] + R() * (L[1] - L[0]), wait: 0, col: Math.floor(R() * 1000), t0: S.time, id: A.nid++, u: u == null ? R() * A.k : u, gone: false };
  laneFor(a);
  A.list.push(a);
  return a;
}
function laneFor(a) { const lk = a.route[a.ri][0], n = lk.C.lanes; a.lane = n > 1 ? (a.K.L > 0.1 || (a.col % 10) < 6 ? 0 : 1) : 0; }
const endOf = (lk, d) => d ? lk.a : lk.b;
/* keep: the share of the flows to carry (IC.trafficKeep; all of them by default, as the 3D view wants) */
IC.trafficAgents = function (S, view, dt, keep) {
  const T = S.traffic; if (!T) return [];
  let A = AG.get(S);
  const G = T.G, cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2, r = Math.max(view.x1 - view.x0, view.y1 - view.y0) * 0.6 + 4;
  if (!A || A.reset || A.G !== G) { A = { list: [], nid: 1, R: IC.makeRng(((S.seed * 7 + 3) >>> 0) + (A ? A.nid : 0)), G, box: null, trips: [], zt: new Map(), k: 1 }; AG.set(S, A); }
  keep = keep == null ? 1 : U.clamp(keep, 0.01, 1);
  const box = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }, R = A.R;
  A.r = r; A.stats = A.stats || { spawnZone: 0, spawnEdge: 0, arrived: 0, turned: 0 };
  const inBox = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  const posOf = a => { const [lk, d] = a.route[a.ri], s = d ? lk.len - a.s : a.s; return along(lk.pts, lk.cum, U.clamp(s, 0, lk.len)); };
  // links filled at their flow, for the share of it from k0 to k1: as many vehicles a length as the slots show (fewer
  // everywhere alike where that would pass AG_MAX). Returns the share reached
  // (only the part of a link inside the box counts and is filled: a motorway running through the box and far beyond
  // would otherwise take most of the room for vehicles nobody sees, and lose them all when the view moves)
  const inside = lk => {
    const pts = lk.pts, cum = lk.cum, runs = []; let len = 0, s0 = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], on = inBox(p.x, p.y, box);
      if (on && s0 < 0) s0 = cum[i]; else if (!on && s0 >= 0) { runs.push(s0, cum[i]); len += cum[i] - s0; s0 = -1; }
    }
    if (s0 >= 0) { runs.push(s0, lk.len); len += lk.len - s0; }
    return { len, runs };
  };
  const fill = (k0, k1, old) => {
    const want = []; let E = 0;
    for (const L of linksNear(T, box)) {
      const lk = L.l, bb = lk.bb;
      if (bb[2] < box.x0 || bb[0] > box.x1 || bb[3] < box.y0 || bb[1] > box.y1) continue;
      if (old && bb[0] > old.x0 && bb[2] < old.x1 && bb[1] > old.y0 && bb[3] < old.y1) continue;
      const part = bb[0] > box.x0 && bb[2] < box.x1 && bb[1] > box.y0 && bb[3] < box.y1 ? null : inside(lk);
      const len = part ? part.len : lk.len; if (len <= 0) continue;
      for (let d = 0; d < 2; d++) {
        if (!canGo(lk, d) || L.ld[d] < 0.02 || L.cut) continue;
        const n = L.ld[d] * lk.C.dens * len * IC.TRAFFIC_SHOW * (k1 - k0);
        if (n > 0) { want.push(L, d, n, part); E += n; }
      }
    }
    const f = E > 0 ? U.clamp((AG_MAX - A.list.length) / E, 0, 1) : 1, k2 = k0 + (k1 - k0) * f;
    for (let i = 0; i < want.length; i += 4) {
      const L = want[i], lk = L.l, d = want[i + 1], n = want[i + 2] * f, part = want[i + 3];
      for (let q = 0; q < n && A.list.length < AG_MAX; q++) {
        if (R() > n - q) break;
        // (a place along the part inside the box; s counts from the end the vehicle comes from)
        let s = R() * lk.len;
        if (part) { let r = R() * part.len; for (let j = 0; j < part.runs.length; j += 2) { const l = part.runs[j + 1] - part.runs[j]; if (r <= l) { s = part.runs[j] + r; break; } r -= l; } if (d) s = lk.len - s; }
        const a = newAgent(S, A, [[lk, d]], s, pickKind(mixOf(L, d), R()), 'through', null, k0 + R() * (k2 - k0));
        a.lane = lk.C.lanes > 1 ? (R() < 0.6 || a.K.L > 0.1 ? 0 : 1) : 0;
      }
    }
    return k2;
  };
  // a smaller share: the vehicles ranked above it go at once
  if (keep < A.k) { A.list = A.list.filter(a => a.u < keep); A.k = keep; }
  // the view moved on: vehicles far outside go, links newly in view are filled at their flow
  const moved = !A.box || !inBox(cx, cy, { x0: A.box.x0 + r * 0.4, y0: A.box.y0 + r * 0.4, x1: A.box.x1 - r * 0.4, y1: A.box.y1 - r * 0.4 }) || Math.abs((A.box.x1 - A.box.x0) - 2 * r) > r * 0.3;
  if (moved) {
    const old = A.box;
    A.list = A.list.filter(a => { const p = posOf(a); return inBox(p.x, p.y, box); });
    fill(0, A.k, old);
    A.box = box;
  }
  // a larger share: more join on every link in the box
  if (keep > A.k * 1.02 && A.list.length < AG_MAX * 0.95) A.k = fill(A.k, keep, null);
  if (!dt || dt <= 0) return A.list;
  // new vehicles: from the zones in view, and in from the edge of the box on busy links
  const h = (S.time % 86400) / 3600, fi = hr(H_IN, h), fo = hr(H_OUT, h), ff = hr(H_FRT, h), fa = hr(H_APT, h), fg = hr(H_GEN, h);
  const room = () => A.list.length < AG_MAX;
  for (const z of T.zones) {
    if (!inBox(z.x, z.y, box) || !room()) continue;
    // departures a game second: people and lorries leaving this zone
    const pc = (z.homes * fi + z.jobs * fo) * 0.004, pf = z.frt * ff * 0.002, pa = z.homes * fa * 0.0006, rate = pc + pf + pa + z.homes * fg * 0.0015;
    let acc = (A.zt.get(z) || 0) + rate * dt * IC.TRAFFIC_SHOW * A.k;
    while (acc >= 1 && room()) {
      acc -= 1;
      const u = R() * rate, pur = u < pc ? 'com' : u < pc + pf ? 'frt' : u < pc + pf + pa ? 'apt' : 'gen';
      const first = pickNext(G, T, z.node, null, R); if (!first) continue;
      const M = MIX[pur]; let kr = R(), kind = M[0][0]; for (const [k, q] of M) { if (kr < q) { kind = k; break; } kr -= q; }
      newAgent(S, A, [first], 0, kind, pur, z);
      A.stats.spawnZone++;
    }
    A.zt.set(z, Math.min(acc, 3));
  }
  // in from the edge: links that cross the box's edge bring their flow in
  A.et = (A.et || 0) + dt;
  if (A.et > 2) {
    const et = A.et; A.et = 0;
    for (const L of linksNear(T, box)) {
      const lk = L.l, bb = lk.bb;
      if (bb[2] < box.x0 || bb[0] > box.x1 || bb[3] < box.y0 || bb[1] > box.y1) continue;
      const pa = lk.pts[0], pb = lk.pts[lk.pts.length - 1], ia = inBox(pa.x, pa.y, box), ib = inBox(pb.x, pb.y, box);
      if (ia === ib) continue;
      const d = ia ? 1 : 0;   // the direction that runs into the box
      if (!canGo(lk, d) || L.ld[d] < 0.02 || L.cut) continue;
      const n = L.ld[d] * lk.C.dens * L.v[d] * et * IC.TRAFFIC_SHOW * A.k;
      for (let q = 0; q < n && room(); q++) {
        if (R() > n - q) break;
        const a = newAgent(S, A, [[lk, d]], 0, pickKind(mixOf(L, d), R()), 'through', null);
        a.lane = lk.C.lanes > 1 ? (R() < 0.6 || a.K.L > 0.1 ? 0 : 1) : 0;
        A.stats.spawnEdge++;
      }
    }
  }
  stepAgents(S, A, G, Math.min(dt, 30), box);
  return A.list;
};
function stepAgents(S, A, G, dt, box) {
  // steps of half a second, but never more than three a frame: at high game speed they take longer steps
  const n = Math.min(3, Math.ceil(dt / 0.5)), h = dt / n;
  for (let q = 0; q < n; q++) stepOnce(S, A, G, h, S.time - dt + (q + 1) * h, box, (A.sn = (A.sn || 0) + 1) % 4 === 0);
}
function stepOnce(S, A, G, dt, now, box, check) {
  // who is ahead of whom: vehicles by lane of each link and direction, sorted along it (the lanes' arrays are kept
  // from frame to frame, emptied, and walked in the order this frame filled them: nothing new a frame for the collector)
  const T = S.traffic, L2 = T.links, R = A.R, ko = A.ko || (A.ko = []), pool = A.pool || (A.pool = []), nk = G.links.length * 4;
  if (!A.st || A.st.length !== nk) { A.st = new Int32Array(nk); A.ix = new Int32Array(nk); A.fr = 0; }
  const st = A.st, ix = A.ix, fr = ++A.fr;
  ko.length = 0;
  for (const a of A.list) {
    const r = a.route[a.ri], k = (r[0].id * 2 + r[1]) * 2 + a.lane;
    if (st[k] !== fr) { st[k] = fr; ix[k] = ko.length; ko.push(pool[ko.length] || (pool[ko.length] = [])); }
    ko[ix[k]].push(a);
  }
  for (const L of ko) if (L.length > 1) L.sort(bySpot);
  const laneAt = k => st[k] === fr ? ko[ix[k]] : null;
  const firstOn = (lk, d) => { let m = null; for (let ln = 0; ln < 2; ln++) { const L = laneAt((lk.id * 2 + d) * 2 + ln); if (L && L.length && (!m || L[0].s < m.s)) m = L[0]; } return m; };
  let nGone = 0;
  for (const L of ko) for (let i = 0; i < L.length; i++) {
    const a = L[i], r = a.route[a.ri], lk = r[0], d = r[1], end = endOf(lk, d), nd = G.nodes[end];
    // the road on: chosen when the vehicle comes near the junction, unless it is about to park
    if (a.ri >= a.route.length - 1 && a.life > 0 && lk.len - a.s < 1.5) { const nx = pickNext(G, T, end, [lk, d], R); if (nx) a.route.push(nx); }
    let gap = 1e9;
    if (i + 1 < L.length) { const b = L[i + 1]; gap = b.s - a.s - (a.K.L + b.K.L) / 2; }
    else if (a.ri + 1 < a.route.length) {
      const rn = a.route[a.ri + 1], b = firstOn(rn[0], rn[1]);
      if (b) gap = lk.len - a.s + b.s - (a.K.L + b.K.L) / 2;
    }
    const toEnd = lk.len - a.s;
    let speed = Math.min(a.K.v, (L2[lk.id] ? L2[lk.id].v[d] : lk.C.v) * (0.9 + (a.col % 7) * 0.03), lk.C.v * 1.1);
    if (a.ri + 1 < a.route.length && toEnd < 0.6) {
      const nx = a.route[a.ri + 1][0];
      if (nx.cut || (L2[nx.id] && L2[nx.id].cut)) {
        // a cut road ahead: queue at the line, then turn back after a while
        gap = Math.min(gap, toEnd - 0.03);
        if (a.v < 0.02 && (a.wait += dt) > 60 + (a.col % 60)) { a.route.length = a.ri + 1; const back = pickNext(G, T, end, [lk, d], R, true); if (back) a.route.push(back); a.wait = 0; A.stats.turned++; }
      } else if (nd.sig) {
        // traffic lights: stop at the line on red, and on amber if there is room to stop; through on green
        const st = IC.signalFor(G, end, lk, d, now), line = toEnd - IC.SIGNAL.stop;
        speed = Math.min(speed, Math.max(0.03, lk.C.v * 0.7));
        if (line > -0.01 && (st === 'r' || (st === 'a' && line > 0.08))) gap = Math.min(gap, line);
      } else if (nd.out.length >= 3) {
        // a junction: slow through it, and give way to whoever is already in it
        speed = Math.min(speed, Math.max(0.03, lk.C.v * 0.55));
        if (nd.busy > now && nd.from !== lk.id) gap = Math.min(gap, toEnd - 0.03);
      }
    }
    const want = Math.max(0, Math.min(speed, (gap - 0.012) / 1.4));
    a.v = want < a.v ? want : Math.min(want, a.v + 0.02 * dt);
    a.s += a.v * dt; a.life -= a.v * dt;
    while (a.s >= a.route[a.ri][0].len) {
      const rc = a.route[a.ri], cl = rc[0], cd = rc[1];
      a.s -= cl.len;
      if (a.ri + 1 >= a.route.length) {
        // it parks here (or there was no way on)
        a.gone = true; nGone++; A.stats.arrived++;
        if (a.org) { A.trips.push({ org: a.org, end: endOf(cl, cd), route: a.route.slice(), id: a.id }); if (A.trips.length > 200) A.trips.shift(); }
        break;
      }
      // entering the junction: it is busy for a moment for whoever gives way
      const nd2 = G.nodes[endOf(cl, cd)]; nd2.busy = now + 1.2; nd2.from = cl.id;
      a.ri++; laneFor(a);
      // keep only the last few roads of the route
      if (a.ri > 12) { a.route.splice(0, 8); a.ri -= 8; }
    }
    if (check && !a.gone) {
      const rc = a.route[a.ri], cl = rc[0], p = along(cl.pts, cl.cum, U.clamp(rc[1] ? cl.len - a.s : a.s, 0, cl.len));
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) { a.gone = true; nGone++; }
    }
  }
  for (const L of ko) L.length = 0;
  if (nGone) A.list = A.list.filter(a => !a.gone);
}
const bySpot = (p, q) => p.s - q.s;
/* ---------- traffic lights (brief 65) ----------
   A signalled junction (n.sig) turns its roads green by axis: the axis of its biggest road, then the one across it,
   in a cycle of IC.SIGNAL.cycle game seconds (the bigger road's share longer when a street crosses an avenue),
   amber for 3 s and red both ways for 1 s between. Vehicles stop at the line IC.SIGNAL.stop short of the
   junction's middle on red, and on amber unless they are too close to stop. Each junction starts its cycle at its
   own time. */
IC.SIGNAL = { cycle: 64, amber: 3, clear: 1, stop: 0.11 };
function sigAxis(G, ni) {
  const n = G.nodes[ni]; if (n.ax != null) return n.ax;
  let best = -1, ax = 0;
  for (const i of n.out) { const q = G.links[i], r = CLS[q.cls].rank + Math.min(1, q.len) * 0.01; if (r > best) { best = r; ax = headOut(q, q.a === ni ? 0 : 1); } }
  n.mn = n.out.some(i => CLS[G.links[i].cls].rank < 3);   // (a street across an avenue gets the shorter green)
  return n.ax = ax;
}
/* 'g', 'a' or 'r' for the road coming in on link lk in direction d (towards its end) at junction node n */
IC.signalFor = function (G, n, lk, d, now) {
  const N = G.nodes[n]; if (!N.sig) return 'g';
  sigAxis(G, n);
  const K = IC.SIGNAL, hin = headIn(lk, d), grp = Math.abs(Math.cos(hin - N.ax)) > 0.7071 ? 0 : 1;
  const g0 = N.mn ? 0.6 : 0.5, half = K.cycle * (grp ? 1 - g0 : g0), start = grp ? K.cycle * g0 : 0;
  const t = ((now + N.ph) % K.cycle + K.cycle - start) % K.cycle;
  return t < half - K.amber - K.clear ? 'g' : t < half - K.clear ? 'a' : 'r';
};
/* where an agent is and which way it faces, with its lane offset */
IC.agentPos = function (a) {
  const [lk, d] = a.route[a.ri], s = d ? lk.len - a.s : a.s, p = along(lk.pts, lk.cum, U.clamp(s, 0, lk.len));
  const h = d ? p.h + Math.PI : p.h, o = lk.C.off[Math.min(a.lane, lk.C.off.length - 1)];
  return { x: p.x - Math.sin(h) * o, y: p.y + Math.cos(h) * o, h };
};
IC.trafficAgentsOf = S => AG.get(S) || null;

/* parked cars (brief 55): the spaces along a side street's kerbs that have a car in them, as a flat list of
   x, y, heading, colour. A fifth of the spaces on a street, an eighth on a close; none within 25 m of a crossing or an
   end. Kept on the street (not saved), the same cars every time the view comes back. */
IC.PARKED = { st: 0.22, cl: 0.12, off: 0.045, step: 0.058, clear: 0.25 };
IC.parkedSpots = function (W, c, l) {
  if (l._pk) return l._pk;
  const out = [], K = IC.PARKED, share = l.cul ? K.cl : K.st, bb = l.bb;
  const J = IC.streetJoins ? IC.streetJoins(W, c).filter(j => !bb || (j.x > bb[0] - 1 && j.x < bb[2] + 1 && j.y > bb[1] - 1 && j.y < bb[3] + 1)) : [];
  const sd = Math.round((l.pts[0].x + l.pts[0].y) * 37);
  let n = 0, cum = 0, total = 0;
  for (let i = 1; i < l.pts.length; i++) total += Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y);
  for (let i = 1; i < l.pts.length; i++) {
    const a = l.pts[i - 1], b = l.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), c0 = cum; cum += L;
    if (L < K.step * 2) continue;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, h = Math.atan2(uy, ux);
    // (clear of the ends, and of the bends, where a car across the corner would sit in the road)
    for (let t = K.step; t < L - K.step; t += K.step, n++) {
      if (c0 + t < K.clear || total - c0 - t < K.clear) continue;
      const x = a.x + ux * t, y = a.y + uy * t;
      for (const sd2 of [1, -1]) {
        if (U.hash(sd + n, sd2 + 5) > share) continue;
        const cx = x - uy * K.off * sd2, cy = y + ux * K.off * sd2, e0 = l.pts[0], e1 = l.pts[l.pts.length - 1];
        if (U.dxy(cx, cy, e0.x, e0.y) < K.clear || U.dxy(cx, cy, e1.x, e1.y) < K.clear) continue;   // (a street that bends back to its end)
        // (inside a sharp bend the next piece of the street runs through the space)
        let inRoad = false; for (let q = 1; q < l.pts.length && !inRoad; q++) if (q !== i && U.segDist(cx, cy, l.pts[q - 1].x, l.pts[q - 1].y, l.pts[q].x, l.pts[q].y) < K.off - 0.01) inRoad = true;
        if (inRoad) continue;
        if (J.some(j => Math.abs(j.x - cx) < K.clear && Math.abs(j.y - cy) < K.clear && Math.hypot(j.x - cx, j.y - cy) < K.clear)) continue;
        out.push(cx, cy, sd2 > 0 ? h : h + Math.PI, Math.floor(U.hash(n, sd + sd2) * 97));
      }
    }
  }
  return l._pk = out;
};

})(window.IC);
