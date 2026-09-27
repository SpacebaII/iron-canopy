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

// per class: vehicles per unit (100 m) of lane at full flow, free speed (units per game second), lanes each way,
// lane offsets from the centre line (world units), and rank at junctions
const CLS = {
  hw: { dens: 2.4, v: 0.31, lanes: 2, off: [0.07, 0.155], rank: 5 }, ring: { dens: 2, v: 0.22, lanes: 2, off: [0.06, 0.14], rank: 4 },
  rd: { dens: 0.9, v: 0.22, lanes: 1, off: [0.05], rank: 4 }, art: { dens: 1.5, v: 0.13, lanes: 2, off: [0.06, 0.145], rank: 3 },
  lc: { dens: 0.3, v: 0.17, lanes: 1, off: [0.034], rank: 2 }, sp: { dens: 0.3, v: 0.12, lanes: 1, off: [0.03], rank: 1 },
  st: { dens: 0.7, v: 0.08, lanes: 1, off: [0.075], rank: 1 }, ln: { dens: 0.05, v: 0.1, lanes: 1, off: [0.018], rank: 0 },
  ramp: { dens: 1.2, v: 0.16, lanes: 1, off: [0], rank: 2 }
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
  for (const e of W.edges) add(e.pts, e.cls, { edge: e }, [levelAt(e, e.a), levelAt(e, e.b)]);
  for (const c of W.cities) for (const s of c.streets) add(s.pts, s.cls, { city: c });
  for (const r of W.ramps || []) add(r.pts, 'ramp', { ramp: r });
  for (const l of W.lanes) add(l.pts, 'ln', {});
  // crossings at grade: every pair of pieces that cross (motorways and slip roads never do)
  const B = 4, bk = new Map(), key2 = (i, j) => (i + 100) * 8192 + j + 100;
  lines.forEach((l, li) => {
    if (l.cls === 'hw' || l.cls === 'ramp') return;
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i];
      for (let x = Math.floor(Math.min(a.x, b.x) / B); x <= Math.floor(Math.max(a.x, b.x) / B); x++) for (let y = Math.floor(Math.min(a.y, b.y) / B); y <= Math.floor(Math.max(a.y, b.y) / B); y++) {
        const k = key2(x, y); let L = bk.get(k); if (!L) bk.set(k, L = []); L.push(li, i);
      }
    }
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
    const sk = la < lb ? ((la * 4096 + ia) * 16384 + lb) * 4096 + ib : ((lb * 4096 + ib) * 16384 + la) * 4096 + ia;
    if (seen.has(sk)) continue; seen.add(sk);
    const x = a0.x + r1 * t, y = a0.y + r2 * t;
    A.ins.push({ i: ia, t, x, y }); Bl.ins.push({ i: ib, t: u, x, y });
  }
  // slip roads: each end is tied onto the nearest carriageway or road
  const segB = new Map();
  lines.forEach((l, li) => {
    if (l.cls === 'ramp') return;
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i];
      for (let x = Math.floor(Math.min(a.x, b.x) / B); x <= Math.floor(Math.max(a.x, b.x) / B); x++) for (let y = Math.floor(Math.min(a.y, b.y) / B); y <= Math.floor(Math.max(a.y, b.y) / B); y++) { const k = key2(x, y); let M = segB.get(k); if (!M) segB.set(k, M = []); M.push(li, i); }
    }
  });
  const tie = (P, lineOk) => {
    let best = null, bd = 0.7;
    const gx = Math.floor(P.x / B), gy = Math.floor(P.y / B);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) {
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
  // put the crossing points into the lines
  const kq = (x, y) => Math.round(x * 256) * 4194304 + Math.round(y * 256);
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
  // nodes where lines share a point, and at every end
  const cnt = new Map(), keyOf = (l, i) => kq(l.pts[i].x, l.pts[i].y) * 4 + (i === 0 ? l.lv[0] : i === l.pts.length - 1 ? l.lv[1] : 0);
  for (const l of lines) for (let i = 0; i < l.pts.length; i++) { const k = keyOf(l, i); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const G = { nodes: [], links: [], at: new Map() };
  const nodeOf = (k, p) => { let n = G.at.get(k); if (n == null) { n = G.nodes.length; G.nodes.push({ x: p.x, y: p.y, out: [], rank: 0 }); G.at.set(k, n); } return n; };
  for (const l of lines) {
    let s = 0, a = nodeOf(keyOf(l, 0), l.pts[0]);
    for (let i = 1; i < l.pts.length; i++) {
      const k = keyOf(l, i), last = i === l.pts.length - 1;
      if (!last && cnt.get(k) < 2 && !forced.has(Math.floor(k / 4))) continue;
      const b = nodeOf(k, l.pts[i]), pts = l.pts.slice(s, i + 1);
      s = i;
      if (a === b && pts.length < 3) continue;
      const cum = cumOf(pts), len = cum[cum.length - 1];
      if (len < 1e-3) continue;
      const lk = { id: G.links.length, a, b, pts, cum, len, cls: l.cls, C: CLS[l.cls], one: 0, ref: l.ref, city: l.ref.city || null };
      G.links.push(lk); G.nodes[a].out.push(lk.id); G.nodes[b].out.push(lk.id);
      a = b;
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
      const R = lk.pts, q0 = end ? R[R.length - 1] : R[0], q1 = end ? R[R.length - 2] : R[1];
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
    n.sig = big >= 3 && n.out.length >= 3 && n.out.every(i => G.links[i].cls !== 'hw');
    n.ph = U.hash(Math.round(n.x * 10), Math.round(n.y * 10)) * 90;
  }
  for (const j of W.junctions || []) {
    const n = G.at.get(kq(j.x, j.y) * 4); if (n == null) continue;
    G.nodes[n].jk = j.kind;
    if (j.kind === 'rb') G.nodes[n].sig = false;
    if (j.kind === 'tj' && G.nodes[n].out.length >= 4) G.nodes[n].sig = true;
  }
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
      const v = f + lk.len / lk.C.v * (lk.cut ? 6 : 1);
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
      if (z.node >= 0) { z.kind = z.frt > z.jobs * 0.3 ? 'ind' : z.jobs > z.homes ? 'work' : 'home'; z.id = Z.length; Z.push(z); }
    }
  }
  return Z;
}
function placesOf(S, G) {
  const W = S.world, P = [];
  const add = (o, kind, w) => { const n = G.nearNode(o.x, o.y, 8); if (n >= 0) P.push({ id: o.id, name: o.name, x: o.x, y: o.y, kind, w, node: n, ref: o }); };
  for (const a of S.infra) if (a.kind === 'airport' && a.owner === 'us') add(a, 'apt', a.parts ? 3 + (a.rev || 5) / 2 : 0.5);
  for (const x of W.crossings) add(x, 'border', 3);
  for (const i of (S.econ && S.econ.inds) || []) add(i, 'industry', 2);
  if (W.depotPos) add({ id: 'depot', name: 'Depot', x: W.depotPos.x, y: W.depotPos.y }, 'depot', 1.5);
  for (const i of S.infra) if (i.kind === 'factory' || i.kind === 'power') add(i, 'industry', 1.5);
  return P;
}

/* ---------- assigning trips to routes ----------
   Commuters from housing to jobs in their city (gravity by time), lorries between freight zones, industries,
   airports and crossings, travellers from every city to its airports, and errands within the city. Each flow
   is added to every link on its route in the direction it runs. */
function assign(S) {
  const W = S.world, G = IC.driveGraph(W), T = S.traffic;
  const Z = zonesOf(S, G), P = placesOf(S, G);
  const nL = G.links.length, F = {};
  for (const p of PURP) F[p] = new Float32Array(nL * 2);
  const lay = (path, v, arr) => { for (const [lk, d] of path) arr[lk.id * 2 + d] += v; };
  const byCity = new Map(); for (const z of Z) { let L = byCity.get(z.city); if (!L) byCity.set(z.city, L = []); L.push(z); }
  // within each city: commuters and errands, over the city's own streets and roads
  for (const [c, L] of byCity) {
    const R = (c.ext || c.r) + 8, ok = n => U.dxy(G.nodes[n].x, G.nodes[n].y, c.x, c.y) < R;
    const work = L.filter(z => z.jobs > 0.01), sc = Math.max(8, (c.ext || c.r) * 0.45);
    // at most 50 origins a city: the rest join the nearest one
    const orig = L.filter(z => z.homes > 0.01).sort((a, b) => b.homes - a.homes).slice(0, 50);
    for (const o of orig) {
      const Tr = dijkstra(G, [o.node], ok);
      let tot = 0; const wts = work.map(w => { const t = Tr.t[w.node]; const v = isFinite(t) ? w.jobs * Math.exp(-U.dist(o, w) / sc) : 0; tot += v; return v; });
      if (!tot) continue;
      const homes = o.homes * (L.filter(z => z.homes > 0.01).reduce((s, z) => s + z.homes, 0) / orig.reduce((s, z) => s + z.homes, 0));
      work.forEach((w, i) => { if (wts[i] > 0 && w !== o) { const v = homes * wts[i] / tot; lay(pathTo(G, Tr, w.node), v, F.com); lay(pathTo(G, Tr, w.node), v * 0.35, F.gen); } });
    }
    // everything that leaves town goes to the nearest road out: the nodes on national roads at the city's edge
    const gates = [];
    for (let n = 0; n < G.nodes.length; n++) {
      const nd = G.nodes[n], d = U.dxy(nd.x, nd.y, c.x, c.y); if (d > R || d < (c.ext || c.r) * 0.35) continue;
      if (nd.out.some(i => G.links[i].ref.edge && G.links[i].cls !== 'hw')) gates.push(n);
    }
    if (!gates.length) gates.push(G.nearNode(c.x, c.y, 10));
    const Tg = dijkstra(G, gates.filter(g => g >= 0), ok);
    for (const z of L) {
      const out = z.frt * 0.1 + z.homes * 0.08 + z.jobs * 0.05; if (!(out > 0) || !isFinite(Tg.t[z.node])) continue;
      const p = pathTo(G, Tg, z.node);   // from the gate to the zone: inbound
      for (const [lk, d] of p) { F.frt[lk.id * 2 + d] += z.frt * 0.06; F.frt[lk.id * 2 + (1 - d)] += z.frt * 0.06; F.apt[lk.id * 2 + d] += z.homes * 0.03; F.apt[lk.id * 2 + (1 - d)] += z.homes * 0.03; F.gen[lk.id * 2 + d] += z.homes * 0.04; F.gen[lk.id * 2 + (1 - d)] += z.homes * 0.04; }
    }
  }
  // between places: over the whole network, from each city centre, airport, industry and crossing
  const ends = [];
  for (const c of W.cities) { const n = G.nearNode(c.x, c.y, 6); if (n >= 0) ends.push({ node: n, x: c.x, y: c.y, pop: c.pop, frt: c.pop * (c.mix ? c.mix.ind + c.mix.log + c.mix.rail : 0.15) * 3, kind: 'city', ref: c }); }
  for (const p of P) ends.push({ node: p.node, x: p.x, y: p.y, pop: 0, frt: p.kind === 'apt' ? p.w * 10 : p.kind === 'border' ? 60 : 20, apt: p.kind === 'apt' ? p.w : 0, kind: p.kind, ref: p.ref });
  // over the national roads and their slip roads only
  const nat = new Uint8Array(G.nodes.length);
  for (const lk of G.links) if (lk.ref.edge || lk.cls === 'ramp') { nat[lk.a] = 1; nat[lk.b] = 1; }
  for (const e of ends) nat[e.node] = 1;
  for (const a of ends) {
    if (!(a.frt > 0 || a.pop > 0)) continue;
    const Tr = dijkstra(G, [a.node], n => nat[n] === 1, 5 * 3600);
    for (const b of ends) {
      if (a === b || !isFinite(Tr.t[b.node])) continue;
      const t = Tr.t[b.node] / 3600, fr = a.frt * b.frt / 400 * Math.exp(-t / 2);
      const ap = b.apt ? a.pop * b.apt / 60 * Math.max(0, 1 - t / 2.5) : 0;
      const ge = a.kind === 'city' && b.kind === 'city' ? a.pop * b.pop / 3e4 * Math.exp(-t / 1.2) : 0;
      if (fr + ap + ge < 1e-3) continue;
      const path = pathTo(G, Tr, b.node);
      if (fr) lay(path, fr, F.frt);
      if (ap) { lay(path, ap, F.apt); for (const [lk, d] of path) F.apt[lk.id * 2 + 1 - d] += ap; }
      if (ge) lay(path, ge, F.gen);
      // people from the towns round a big city commute into it
      if (a.kind === 'city' && b.kind === 'city' && a.pop < b.pop && t < 1.2) lay(path, a.pop * b.pop / 2e4 * Math.exp(-t / 0.6), F.com);
    }
  }
  // every street carries its own residents and deliveries: a little traffic in proportion to what is built there
  const zb = new Map(), ZB = 10;
  for (const z of Z) { const k = Math.floor(z.x / ZB) * 4096 + Math.floor(z.y / ZB); let L = zb.get(k); if (!L) zb.set(k, L = []); L.push(z); }
  for (const lk of G.links) {
    if (!lk.city && lk.cls !== 'ln') continue;
    const m = lk.pts[lk.pts.length >> 1], gx = Math.floor(m.x / ZB), gy = Math.floor(m.y / ZB);
    let best = null, bd = 12;
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const z of zb.get(x * 4096 + y) || []) { const d = U.dist(z, m); if (d < bd) { bd = d; best = z; } }
    const v = best ? (best.homes + best.jobs + best.frt * 0.5) / best.n * 0.3 : lk.cls === 'ln' ? 0.02 : 0;
    for (let d = 0; d < 2; d++) { F.gen[lk.id * 2 + d] += v; F.com[lk.id * 2 + d] += v * 0.5; }
  }
  // flows into loads, class by class: the busiest links of each class at a full rush hour run at what that class
  // carries at its busiest in real cities (motorways at capacity, side streets far from it)
  const TOP = { hw: 1.05, ring: 0.85, rd: 0.8, art: 0.75, lc: 0.45, sp: 0.5, st: 0.4, ln: 0.12, ramp: 0.8 }, byCls = {};
  for (let i = 0; i < nL; i++) {
    const lk = G.links[i];
    for (let d = 0; d < 2; d++) { const v = F.com[i * 2 + d] + F.frt[i * 2 + d] + F.apt[i * 2 + d] + F.gen[i * 2 + d]; if (v > 0) (byCls[lk.cls] = byCls[lk.cls] || []).push(v); }
  }
  const kc = {};
  for (const c in byCls) { const a = byCls[c].sort((x, y) => x - y); kc[c] = TOP[c] / Math.max(1e-9, a[Math.floor(a.length * 0.95)]); }
  for (const p of PURP) for (let i = 0; i < F[p].length; i++) F[p][i] *= kc[G.links[i >> 1].cls] || 0;
  T.F = F; T.zones = Z; T.places = P; T.G = G;
  T.nApt = S.infra.filter(a => a.kind === 'airport' && a.owner === 'us' && a.parts).length;
}

/* ---------- start, and the step ---------- */
// each link's traffic: load, speed and purpose mix by direction, and where its slots ride
const linkState = lk => ({ l: lk, cls: lk.cls, C: lk.C, len: lk.len, ld: [0, 0], load: 0, v: [0, 0], ph: [U.hash(lk.id, 1) * 1000, U.hash(lk.id, 2) * 1000], key: lk.id * 7919 + 1, mix: [[0, 0, 0], [0, 0, 0]], mixOk: [0, 0] });
const mixOf = (L, d) => L.mixOk[d] ? L.mix[d] : null;
IC.trafficInit = function (S) {
  const W = S.world, G = IC.driveGraph(W);
  S.traffic = { links: G.links.map(linkState), hour: 0, stepT: 0, G };
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
  T.G = G; T.links = G.links.map(linkState);
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
      for (let d = 0; d < 2; d++) { L.ph[d] = (L.ph[d] + L.v[d] * (S.time - (L.t0 || S.time))) % (BASE * 65536); }
      L.t0 = S.time;
      const lk = L.l, i = lk.id * 2, c = lk.city;
      // under an air raid alert people leave the roads for the shelters
      const raid = c && c.alert > 0 ? 0.25 : 1;
      const cut = lk.cut || (lk.ref.edge && W.blocked && W.blocked.has(lk.ref.edge.id)) ? 0.05 : 1;
      for (let d = 0; d < 2; d++) {
        // commuters run home→work in the morning and back in the evening: the reverse direction's flow comes home
        const com = F.com[i + d] * fi + F.com[i + 1 - d] * fo, frt = F.frt[i + d] * ff, apt = F.apt[i + d] * fa, gen = F.gen[i + d] * fg;
        const tot = com + frt + apt + gen;
        L.ld[d] = U.clamp(tot * g * raid * cut, 0, 1.3);
        const M = L.mix[d]; L.mixOk[d] = tot > 0 ? 1 : 0; if (tot > 0) { M[0] = com / tot; M[1] = frt / tot; M[2] = apt / tot; }
        // a full road slows down: at peak the motorways round the capital crawl
        L.v[d] = lk.C.v * (L.ld[d] > 0.75 ? U.clamp(1 - (L.ld[d] - 0.75) * 1.3, 0.3, 1) : 1) * (raid < 1 ? 0.4 : 1);
      }
      L.load = Math.max(L.ld[0], L.ld[1]);
    }
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
    const near = W.cities.map((o, j) => [o, j]).filter(([o, j]) => j !== i && cn[j] >= 0 && U.dist(o, c) < 1600).sort((p, q) => U.dist(p[0], c) - U.dist(q[0], c)).slice(0, 2);
    for (const [o, j] of near) {
      const k = Math.min(i, j) + ',' + Math.max(i, j); if (pairs.has(k)) continue; pairs.add(k);
      const p = astar(G, cn[i], cn[j], 60000, road); if (p) mk(p, 'coach', `${c.name} – ${o.name}`, 1e9);
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
const along = (pts, cum, s) => {
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = pts[lo - 1], b = pts[lo], t = (s - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
};
IC.along = along;
IC.trainPos = t => along(t.r.pts, t.r.cum, U.clamp(t.s, 0, t.r.len));
IC.busPos = b => { const p = along(b.line.pts, b.line.cum, U.clamp(b.s, 0, b.line.len)); if (b.dir < 0) p.h += Math.PI; return p; };

/* ---------- vehicles in slots, for the middle zoom ----------
   fn(x, y, heading, kind, cls, lane) for each vehicle in a view rectangle. gap: the smallest spacing to show
   (the renderer asks for a few screen pixels); skip: classes to leave out. Near a junction with lights or a give
   way the slots bunch up: traffic slows and queues there. */
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
  const G = T.G, k = Math.max(0, Math.ceil(Math.log2(Math.max(BASE, gap) / BASE))), step = 1 << k;
  let n = 0;
  for (const L of T.links) {
    const l = L.l, bb = l.bb;
    if (L.load <= 0.01 || (skip && skip[L.cls]) || bb[2] < view.x0 || bb[0] > view.x1 || bb[3] < view.y0 || bb[1] > view.y1) continue;
    const P = l.pts, cum = l.cum, len = l.len;
    let s0 = 1e9, s1 = -1;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (Math.max(a.x, b.x) < view.x0 || Math.min(a.x, b.x) > view.x1 || Math.max(a.y, b.y) < view.y0 || Math.min(a.y, b.y) > view.y1) continue;
      if (cum[i - 1] < s0) s0 = cum[i - 1]; if (cum[i] > s1) s1 = cum[i];
    }
    if (s1 < 0) continue;
    const lanes = L.C.lanes;
    for (let d = 0; d < 2; d++) {
      if (!canGo(l, d) || L.ld[d] <= 0.01) continue;
      const p = L.ld[d] * L.C.dens * BASE, end = G.nodes[d ? l.a : l.b];
      // the queue at the end of the link: vehicles there move Kq times slower, so they stand closer together
      const Kq = end.sig || end.jk === 'rb' || end.rank > L.C.rank ? 1 + 3 * U.clamp(L.ld[d] - 0.3, 0, 1) : 1, Q = Kq > 1 ? Math.min(len * 0.4, 0.3 + L.ld[d] * 1.5) : 0;
      const qs = len - Q, span = len + Q * (Kq - 1), toS = u => u < qs ? u : qs + (u - qs) / Kq;
      const ph = phase(L, d, S.time);
      // slot j rides at j·BASE + phase from its lane's start (the far end for the other direction);
      // the same j is the same vehicle from frame to frame, and coarser zooms show every 2^k-th slot
      const a = d ? len - s1 : s0, b = d ? len - s0 : s1;
      const ua = a < qs ? a : qs + (a - qs) * Kq, ub = b < qs ? b : qs + (b - qs) * Kq;
      let j = Math.ceil((ua - ph) / BASE); j += (step - (j % step + step) % step) % step;
      for (; j * BASE + ph <= Math.min(ub, span); j += step) {
        const u = j * BASE + ph, h = U.hash(L.key + d, j & 65535);
        if (h > p) continue;
        const s = toS(u), q = along(P, cum, d ? len - s : s);
        if (q.x < view.x0 || q.x > view.x1 || q.y < view.y0 || q.y > view.y1) continue;
        const kind = pickKind(mixOf(L, d), h / p), lane = lanes > 1 ? (KINDS[kind].L > 0.1 || U.hash(j, L.key) < 0.55 ? 0 : 1) : 0;
        fn(q.x, q.y, d ? q.h + Math.PI : q.h, kind, L.cls, L.C.off[lane]);
        n++;
      }
    }
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

/* ---------- close in: vehicles making their own trips ----------
   Around the view, vehicles start at zones (car parks, estates, depots, the airport) at a rate set by the
   zone's homes, jobs and freight for the hour, or come in from beyond the view on the links that carry traffic.
   Each has a route over the drive graph and follows it lane by lane: it keeps its distance to the vehicle ahead,
   stops at red lights and gives way to the bigger road, and leaves the map at its destination. Nothing here
   touches the simulation state: the renderer calls it with the game time that has passed. */
const AG = new WeakMap();
const AG_MAX = 1400;
function signalGreen(G, n, lk, d, t) {
  const node = G.nodes[n], P = lk.pts, p0 = d ? P[1] : P[P.length - 2], p1 = d ? P[0] : P[P.length - 1];
  const hd = Math.atan2(p1.y - p0.y, p1.x - p0.x), grp = Math.cos(2 * (hd - node.ph)) > 0 ? 0 : 1;
  const c = (t + node.ph) % 60, g0 = c < 26, g1 = c >= 30 && c < 56;
  return grp ? g1 : g0;
}
IC.signalState = (S, n, lk, d) => { const G = S.traffic.G; return signalGreen(G, n, lk, d, S.time); };
function spawnRoute(S, A, G, from, purpose, R) {
  const T = S.traffic, Z = T.zones, z0 = from.zone, h = (S.time % 86400) / 3600;
  let dest = null;
  if (purpose === 'com') {
    const morning = h < 12, same = Z.filter(z => z.city === z0.city && z !== z0);
    const pool = same.filter(z => morning ? z.jobs > z.homes * 0.5 : z.homes > 0.05);
    dest = pool.length ? pool[Math.floor(R() * pool.length)] : null;
  } else if (purpose === 'frt') {
    const pl = T.places.filter(p => p.kind !== 'apt' || p.ref.parts);
    const zs = Z.filter(z => z.kind === 'ind' && z !== z0);
    dest = R() < 0.4 && pl.length ? pl[Math.floor(R() * pl.length)] : zs.length ? zs[Math.floor(R() * zs.length)] : null;
  } else if (purpose === 'apt') {
    const aps = T.places.filter(p => p.kind === 'apt' && p.ref.parts).sort((a, b) => U.dist(a, from) - U.dist(b, from));
    dest = aps[0] || null;
  } else {
    const same = Z.filter(z => z.city === (z0 && z0.city) && z !== z0);
    dest = same.length ? same[Math.floor(R() * same.length)] : null;
  }
  if (!dest) return null;
  // far destinations: the route runs to the edge of what is simulated here and the vehicle leaves there
  const far = U.dist(dest, from) > A.r * 2.5;
  const path = far ? null : astar(G, from.node, dest.node, 6000);
  return path && path.length ? { path, dest } : null;
}
function newAgent(S, A, route, s0, kind, purpose, org) {
  const K = KINDS[kind], lk = route.path[0][0];
  const a = { k: kind, K, route: route.path, ri: 0, s: s0, v: lk.C.v * 0.5, lane: 0, dest: route.dest, org, pur: purpose, col: Math.floor(A.R() * 1000), t0: S.time, id: A.nid++ };
  laneFor(a);
  A.list.push(a);
  return a;
}
function laneFor(a) { const lk = a.route[a.ri][0], n = lk.C.lanes; a.lane = n > 1 ? (a.K.L > 0.1 || (a.col % 10) < 6 ? 0 : 1) : 0; }
/* the next link after a route's end, for traffic passing through: the straightest way on along the same class */
function extend(G, a) {
  const [lk, d] = a.route[a.route.length - 1], n = d ? lk.a : lk.b, P = lk.pts;
  const p0 = d ? P[1] : P[P.length - 2], p1 = d ? P[0] : P[P.length - 1], hd = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  let best = null, bs = -1e9;
  for (const li of G.nodes[n].out) {
    const q = G.links[li]; if (q === lk) continue;
    const dd = q.a === n ? 0 : 1; if (!canGo(q, dd)) continue;
    const Q = q.pts, q0 = dd ? Q[Q.length - 1] : Q[0], q1 = dd ? Q[Q.length - 2] : Q[1];
    const s = Math.cos(Math.atan2(q1.y - q0.y, q1.x - q0.x) - hd) + (q.cls === lk.cls ? 0.6 : 0) + (q.C.rank - 2) * 0.1;
    if (s > bs) { bs = s; best = [q, dd]; }
  }
  if (best) a.route.push(best);
  return !!best;
}
IC.trafficAgents = function (S, view, dt) {
  const T = S.traffic; if (!T) return [];
  let A = AG.get(S);
  const G = T.G, cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2, r = Math.max(view.x1 - view.x0, view.y1 - view.y0) * 0.65 + 4;
  if (!A || A.reset || A.G !== G) { A = { list: [], nid: 1, R: IC.makeRng(((S.seed * 7 + 3) >>> 0) + (A ? A.nid : 0)), G, box: null, trips: [], zt: new Map() }; AG.set(S, A); }
  const box = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }, R = A.R;
  A.r = r; A.stats = A.stats || { spawnZone: 0, spawnEdge: 0, arrived: 0 };
  const inBox = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  const posOf = a => { const [lk, d] = a.route[a.ri], s = d ? lk.len - a.s : a.s; return along(lk.pts, lk.cum, U.clamp(s, 0, lk.len)); };
  // the view moved on: vehicles far outside go, links newly in view are filled at their flow
  const moved = !A.box || !inBox(cx, cy, { x0: A.box.x0 + r * 0.4, y0: A.box.y0 + r * 0.4, x1: A.box.x1 - r * 0.4, y1: A.box.y1 - r * 0.4 }) || Math.abs((A.box.x1 - A.box.x0) - 2 * r) > r * 0.3;
  if (moved) {
    const old = A.box;
    A.list = A.list.filter(a => { const p = posOf(a); return inBox(p.x, p.y, box); });
    for (const L of T.links) {
      const lk = L.l, bb = lk.bb;
      if (bb[2] < box.x0 || bb[0] > box.x1 || bb[3] < box.y0 || bb[1] > box.y1) continue;
      if (old && bb[0] > old.x0 && bb[2] < old.x1 && bb[1] > old.y0 && bb[3] < old.y1) continue;
      for (let d = 0; d < 2; d++) {
        if (!canGo(lk, d) || L.ld[d] < 0.02) continue;
        const n = L.ld[d] * lk.C.dens * lk.len * lk.C.lanes * 0.5;
        for (let q = 0; q < n && A.list.length < AG_MAX; q++) {
          if (R() > n - q) break;
          const s = R() * lk.len, kind = pickKind(mixOf(L, d), R());
          const a = newAgent(S, A, { path: [[lk, d]], dest: null }, s, kind, 'through', null);
          a.lane = lk.C.lanes > 1 ? (R() < 0.6 || a.K.L > 0.1 ? 0 : 1) : 0;
        }
      }
    }
    A.box = box;
  }
  if (!dt || dt <= 0) return A.list;
  // new trips: from the zones in view, and in from the edge of the box on busy links
  const h = (S.time % 86400) / 3600, fi = hr(H_IN, h), fo = hr(H_OUT, h), ff = hr(H_FRT, h), fa = hr(H_APT, h), fg = hr(H_GEN, h);
  const room = () => A.list.length < AG_MAX;
  for (const z of T.zones) {
    if (!inBox(z.x, z.y, box) || !room()) continue;
    // departures a game second: people and lorries leaving this zone
    const rate = (z.homes * fi + z.jobs * fo) * 0.004 + z.frt * ff * 0.002 + z.homes * (fa * 0.0006 + fg * 0.0015);
    let acc = (A.zt.get(z) || 0) + rate * dt;
    while (acc >= 1 && room()) {
      acc -= 1;
      const u = R() * rate, pc = (z.homes * fi + z.jobs * fo) * 0.004, pf = z.frt * ff * 0.002, pa = z.homes * fa * 0.0006;
      const pur = u < pc ? 'com' : u < pc + pf ? 'frt' : u < pc + pf + pa ? 'apt' : 'gen';
      const rt = spawnRoute(S, A, G, { zone: z, node: z.node, x: z.x, y: z.y }, pur, R);
      if (!rt) continue;
      const M = MIX[pur]; let kr = R(), kind = M[0][0]; for (const [k, q] of M) { if (kr < q) { kind = k; break; } kr -= q; }
      newAgent(S, A, rt, 0, kind, pur, z);
      A.stats.spawnZone++;
    }
    A.zt.set(z, Math.min(acc, 3));
  }
  // in from the edge: links that cross the box's edge bring their flow in
  A.et = (A.et || 0) + dt;
  if (A.et > 2) {
    const et = A.et; A.et = 0;
    for (const L of T.links) {
      const lk = L.l, bb = lk.bb;
      if (bb[2] < box.x0 || bb[0] > box.x1 || bb[3] < box.y0 || bb[1] > box.y1) continue;
      const pa = lk.pts[0], pb = lk.pts[lk.pts.length - 1], ia = inBox(pa.x, pa.y, box), ib = inBox(pb.x, pb.y, box);
      if (ia === ib) continue;
      const d = ia ? 1 : 0;   // the direction that runs into the box
      if (!canGo(lk, d) || L.ld[d] < 0.02) continue;
      const n = L.ld[d] * lk.C.dens * lk.C.lanes * L.v[d] * et;
      for (let q = 0; q < n && room(); q++) {
        if (R() > n - q) break;
        const a = newAgent(S, A, { path: [[lk, d]], dest: null }, 0, pickKind(mixOf(L, d), R()), 'through', null);
        a.lane = lk.C.lanes > 1 ? (R() < 0.6 || a.K.L > 0.1 ? 0 : 1) : 0;
        A.stats.spawnEdge++;
      }
    }
  }
  stepAgents(S, A, G, Math.min(dt, 30), box);
  return A.list;
};
function stepAgents(S, A, G, dt, box) {
  // steps of half a second, but never more than four a frame: at high game speed they take longer steps
  const n = Math.min(4, Math.ceil(dt / 0.5)), h = dt / n;
  for (let q = 0; q < n; q++) stepOnce(S, A, G, h, S.time - dt + (q + 1) * h, box, (A.sn = (A.sn || 0) + 1) % 4 === 0);
}
function stepOnce(S, A, G, dt, now, box, check) {
  // who is ahead of whom: vehicles by lane of each link and direction, sorted along it
  const lanes = new Map();
  for (const a of A.list) { const [lk, d] = a.route[a.ri], k = (lk.id * 2 + d) * 2 + a.lane; let L = lanes.get(k); if (!L) lanes.set(k, L = []); L.push(a); }
  for (const L of lanes.values()) L.sort((p, q) => p.s - q.s);
  const firstOn = (lk, d) => { let m = null; for (let ln = 0; ln < 2; ln++) { const L = lanes.get((lk.id * 2 + d) * 2 + ln); if (L && L.length && (!m || L[0].s < m.s)) m = L[0]; } return m; };
  const gone = new Set(), traffic = S.traffic, L2 = traffic.links;
  for (const L of lanes.values()) for (let i = 0; i < L.length; i++) {
    const a = L[i], [lk, d] = a.route[a.ri];
    if (a.ri >= a.route.length - 1 && !a.dest) extend(G, a);
    let gap = 1e9;
    if (i + 1 < L.length) { const b = L[i + 1]; gap = b.s - a.s - (a.K.L + b.K.L) / 2; }
    else if (a.ri + 1 < a.route.length) {
      const [nl, nd] = a.route[a.ri + 1], b = firstOn(nl, nd);
      if (b) gap = lk.len - a.s + b.s - (a.K.L + b.K.L) / 2;
    }
    // the junction ahead: red light, or give way to the bigger road while someone crosses
    const toEnd = lk.len - a.s, end = d ? lk.a : lk.b, nd = G.nodes[end];
    if (a.ri + 1 < a.route.length && toEnd < 0.6) {
      let stop = false;
      if (nd.sig) stop = !signalGreen(G, end, lk, d, now);
      else if (nd.rank > lk.C.rank || nd.jk === 'rb') stop = nd.busy > now && nd.from !== lk.id;
      if (stop) gap = Math.min(gap, toEnd - 0.03);
    }
    const speed = Math.min(a.K.v, (L2[lk.id] ? L2[lk.id].v[d] : lk.C.v) * (0.9 + (a.col % 7) * 0.03), lk.C.v * 1.1);
    const want = Math.max(0, Math.min(speed, (gap - 0.012) / 1.4));
    a.v = want < a.v ? want : Math.min(want, a.v + 0.02 * dt);
    a.s += a.v * dt;
    while (a.s >= a.route[a.ri][0].len) {
      const [cl, cd] = a.route[a.ri];
      a.s -= cl.len;
      const nd2 = G.nodes[cd ? cl.a : cl.b];
      if (a.ri + 1 >= a.route.length) { gone.add(a); if (a.dest) { A.stats.arrived++; A.trips.push({ org: a.org, dest: a.dest, route: a.route, id: a.id }); if (A.trips.length > 200) A.trips.shift(); } break; }
      // entering the junction: it is busy for a moment for whoever gives way
      nd2.busy = now + 1.2; nd2.from = cl.id;
      a.ri++; laneFor(a);
    }
    if (check && !gone.has(a) && !a.dest) {
      const [cl, cd] = a.route[a.ri], p = along(cl.pts, cl.cum, U.clamp(cd ? cl.len - a.s : a.s, 0, cl.len));
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) gone.add(a);
    }
  }
  if (gone.size) A.list = A.list.filter(a => !gone.has(a));
}
/* where an agent is and which way it faces, with its lane offset */
IC.agentPos = function (a) {
  const [lk, d] = a.route[a.ri], s = d ? lk.len - a.s : a.s, p = along(lk.pts, lk.cum, U.clamp(s, 0, lk.len));
  const h = d ? p.h + Math.PI : p.h, o = lk.C.off[Math.min(a.lane, lk.C.off.length - 1)];
  return { x: p.x - Math.sin(h) * o, y: p.y + Math.cos(h) * o, h };
};
IC.trafficAgentsOf = S => AG.get(S) || null;

})(window.IC);
