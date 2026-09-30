/* Iron Canopy — roads where they meet (brief 46): geometry only, headless, like pavement.js for the airfield.
   render-roads.js paints it live close in and terrain.js paints the city streets into the tiles with the same code.

   Sections. Every class has a real cross-section (SPEC): lanes of 3.5 m on motorways and 3–3.5 m elsewhere, hard
   shoulders and strips, a central reservation; far out a road is drawn wider than life so it stays readable
   (IC.roadWidth), and everything here is worked out at the width it is drawn.

   Joins. Where roads meet, the corner between two neighbouring arms is a curb return: an arc of a real radius
   (8 m in town, 12–20 m on country roads) tangent to both edges, never a disc. The two arms of the highest class
   that run most nearly straight on are the main road: its centre line and far edge line run through, and the
   others end at a give-way line at the mouth of the junction (where the curb returns start). Roundabouts are a ring
   round a kerbed island, entries flared with curb returns tangent to the ring and a splitter island on each arm.
   Slip roads leave and join a motorway with an auxiliary lane and a taper, and a gore of chevrons where they part.
   A road crosses a railway on a bridge, or at a level crossing if it is a local or access road. City streets cross
   at kerbed corners with pavements round them. */
(function (IC) {
'use strict';
const U = IC.U;

/* the cross-section by class (units: 100 m): w the paved width, lane, lanes each way, sh the hard shoulder or
   strip outside the edge line, med a motorway's central reservation, R the curb radius at a junction, px the
   narrowest it is drawn on screen (pixels), centre: its centre line ('dash', 'solid' or none) */
const SPEC = {
  hw: { w: 0.28, lane: 0.0375, lanes: 2, sh: 0.03, strip: 0.01, med: 0.05, R: 0.5, px: 4.6 },
  ring: { w: 0.26, lane: 0.035, lanes: 2, sh: 0.02, strip: 0.01, med: 0.04, R: 0.14, px: 3.6 },
  rd: { w: 0.105, lane: 0.0325, lanes: 1, sh: 0.02, R: 0.18, px: 3.2, centre: 'dash' },
  lc: { w: 0.07, lane: 0.03, lanes: 1, sh: 0.005, R: 0.12, px: 2.2, centre: 'dash' },
  sp: { w: 0.055, lane: 0.0275, lanes: 1, sh: 0, R: 0.1, px: 1.9 },
  ramp: { w: 0.075, lane: 0.04, lanes: 1, sh: 0.025, strip: 0.01, R: 0.22, px: 1.8 },
  art: { w: 0.4, lane: 0.035, lanes: 2, sh: 0.03, R: 0.1, px: 2.2, centre: 'solid' },
  st: { w: 0.34, lane: 0.035, lanes: 1, sh: 0.1, R: 0.08, px: 1.4 },
  ln: { w: 0.05, lane: 0.025, lanes: 1, sh: 0, R: 0.06, px: 1.1 },
  land: { w: 0.12, lane: 0.035, lanes: 1, sh: 0.01, R: 0.07, px: 1.4 }
};
IC.ROAD_SPEC = SPEC;
/* how each class looks far out, where a road is a line on the map (the tiles' far levels, and the live drawing as it
   zooms in, which blends these into the asphalt): pale concrete and asphalt greys, the busier the lighter */
IC.ROAD_TONE = { hw: [206, 196, 174], ring: [200, 192, 172], rd: [190, 184, 166], art: [178, 174, 164], lc: [172, 166, 148], sp: [172, 166, 148], st: [148, 146, 140], ln: [160, 140, 100], ramp: [200, 192, 172] };
const RANK = { hw: 6, ring: 5, art: 4, rd: 4, ramp: 3, lc: 2, land: 2, st: 1, sp: 1, ln: 0 };
IC.ROAD_RANK = RANK;
/* the width a road is drawn at zoom z: its real width close in, wider far out so it reads */
IC.roadWidth = (k, z) => { const s = SPEC[k] || SPEC.lc; return Math.max(s.w, s.px / z * (1 - U.clamp((z - 3) / 6, 0, 1) * 0.5)); };
/* lane centres from the middle of the road, as drawn at zoom z (traffic keeps to them) */
IC.laneCentre = function (k, i, z) {
  const s = SPEC[k] || SPEC.lc, f = IC.roadWidth(k, z) / s.w;
  if (s.med) return (s.med / 2 + s.strip + s.lane * (i + 0.5)) * f;
  return (s.lane * (i + 0.5)) * f;
};

/* ---------- polylines ---------- */
const PL = {
  len(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); return s; },
  /* the point and direction s along P (clamped) */
  at(P, s) {
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) continue;
      if (acc + L >= s || i === P.length - 1) { const t = U.clamp((s - acc) / L, 0, 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L }; }
      acc += L;
    }
    const p = P[0]; return { x: p.x, y: p.y, ux: 1, uy: 0 };
  },
  /* the stretch of P from s0 to s1 along it */
  cut(P, s0, s1) {
    const out = []; let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) continue;
      const lo = acc, hi = acc + L;
      if (hi >= s0 && lo <= s1) {
        const t0 = Math.max(0, (s0 - lo) / L), t1 = Math.min(1, (s1 - lo) / L);
        if (!out.length) out.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
        out.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
      }
      acc = hi; if (acc > s1) break;
    }
    return out;
  },
  /* P moved sideways by d (to the left of its direction, y down: a positive d is on the right-hand side of travel) */
  offset(P, d) {
    const n = P.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(n - 1, i + 1)];
      let x1 = b.x - a.x, y1 = b.y - a.y, x2 = c.x - b.x, y2 = c.y - b.y;
      const l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2);
      if (l1 > 1e-9) { x1 /= l1; y1 /= l1; } else { x1 = x2 / (l2 || 1); y1 = y2 / (l2 || 1); }
      if (l2 > 1e-9) { x2 /= l2; y2 /= l2; } else { x2 = x1; y2 = y1; }
      let nx = -(y1 + y2), ny = x1 + x2; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const k = Math.min(3, 1 / Math.max(0.33, nx * -y1 + ny * x1));
      out[i] = { x: b.x + nx * d * k, y: b.y + ny * d * k };
    }
    return out;
  },
  /* the nearest point of P to q: { d, s (along), x, y, ux, uy } */
  near(P, q) {
    let best = null, acc = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) continue;
      const t = U.clamp(((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L * L), 0, 1), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, d = Math.hypot(q.x - x, q.y - y);
      if (!best || d < best.d) best = { d, s: acc + t * L, x, y, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L };
      acc += L;
    }
    return best;
  }
};
IC.PL = PL;
const arcPts = (O, R, P1, P2, n) => {
  let a1 = Math.atan2(P1.y - O.y, P1.x - O.x), a2 = Math.atan2(P2.y - O.y, P2.x - O.x), d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const out = [], k = Math.max(2, n || Math.ceil(Math.abs(d) / 0.1));
  for (let i = 0; i <= k; i++) { const a = a1 + d * i / k; out.push({ x: O.x + Math.cos(a) * R, y: O.y + Math.sin(a) * R }); }
  return out;
};
IC.roadArc = arcPts;

/* ---------- curb returns ----------
   A join: N the point where the centre lines meet; arms leaving it { ux, uy, h (half width drawn), len (room along
   it), cls }, sorted by angle. Returns the curb returns between neighbouring arms (grown outwards by e: 0 the
   kerb, > 0 the verge or pavement behind it, < 0 an edge line inside it), the mouth of each arm (how far from N the
   junction's own surface reaches along it) and the junction's surface: one outline from arm to arm round the curb
   returns. */
const STRAIGHT = Math.PI - 0.12;
const rk = a => a.rank != null ? a.rank : RANK[a.cls] || 0;
// an arm's half width on its counter-clockwise (left of its way out) and clockwise side: the same unless a street's
// blocks come closer on one side
const hl = a => a.hl != null ? Math.min(a.hl, a.h) : a.h, hr = a => a.hr != null ? Math.min(a.hr, a.h) : a.h;   // a gap wider than about 173°: a straight edge, no curb return
function sortArms(arms) {
  for (const a of arms) a.th = Math.atan2(a.uy, a.ux);
  arms.sort((a, b) => a.th - b.th);
  return arms.map((a, i) => { const b = arms[(i + 1) % arms.length]; let g = b.th - a.th; if (i === arms.length - 1) g += 2 * Math.PI; return arms.length < 2 ? 2 * Math.PI : g; });
}
function curb(N, A, B, gap, R, e) {
  if (gap >= STRAIGHT || gap < 0.12) return null;
  // the edges facing each other: A's on its counter-clockwise side, B's on its clockwise side
  const nA = { x: -A.uy, y: A.ux }, nB = { x: B.uy, y: -B.ux }, hA = hl(A) + e, hB = hr(B) + e;
  const pA = { x: N.x + nA.x * hA, y: N.y + nA.y * hA }, pB = { x: N.x + nB.x * hB, y: N.y + nB.y * hB };
  const den = A.ux * B.uy - A.uy * B.ux; if (Math.abs(den) < 1e-6) return null;
  const s = ((pB.x - pA.x) * B.uy - (pB.y - pA.y) * B.ux) / den;
  const C = { x: pA.x + A.ux * s, y: pA.y + A.uy * s };
  let r = Math.max(0.004, R - e);
  const tg = Math.tan(gap / 2);
  // no curb return longer than the arms allow (a short arm to the next junction takes a tighter one)
  const sC = (x, u) => (x.x - N.x) * u.ux + (x.y - N.y) * u.uy;
  const room = Math.min(A.len * 0.45 - sC(C, A), B.len * 0.45 - sC(C, B));
  if (room <= 0.002) return null;
  if (r / tg > room) r = Math.max(0.004, room * tg);
  const t = r / tg, bx = A.ux + B.ux, by = A.uy + B.uy, bl = Math.hypot(bx, by) || 1, k = r / Math.sin(gap / 2);
  const O = { x: C.x + bx / bl * k, y: C.y + by / bl * k };
  const T1 = { x: C.x + A.ux * t, y: C.y + A.uy * t }, T2 = { x: C.x + B.ux * t, y: C.y + B.uy * t };
  const arc = arcPts(O, r, T1, T2);
  const sA = sC(T1, A), sB = sC(T2, B);
  return { A, B, C, O, R: r, T1, T2, arc, sA, sB, poly: [N, { x: N.x + A.ux * sA, y: N.y + A.uy * sA }].concat(arc, [{ x: N.x + B.ux * sB, y: N.y + B.uy * sB }]) };
}
/* R(a, b): the curb radius between two arms (by default the larger class's) */
IC.curbJoin = function (N, arms, opt) {
  const o = opt || {}, gaps = sortArms(arms), e = o.e || 0;
  const Rof = o.R || ((a, b) => Math.max((SPEC[a.cls] || SPEC.lc).R, (SPEC[b.cls] || SPEC.lc).R));
  const fil = [], mouth = arms.map(a => Math.min(a.len * 0.45, a.h * 0.5));
  arms.forEach((a, i) => {
    if (arms.length < 2) return;
    const b = arms[(i + 1) % arms.length], f = curb(N, a, b, gaps[i], Rof(a, b), e);
    fil.push(f);
    if (f) { const j = (i + 1) % arms.length; mouth[i] = Math.max(mouth[i], f.sA); mouth[j] = Math.max(mouth[j], f.sB); }
    else if (gaps[i] < STRAIGHT) {
      // a sharp corner with no room for a curb return: the arms' edges meet
      const nA = { x: -a.uy, y: a.ux };
      const den = a.ux * b.uy - a.uy * b.ux;
      if (Math.abs(den) > 1e-6) {
        const pA = { x: N.x + nA.x * (hl(a) + e), y: N.y + nA.y * (hl(a) + e) }, pB = { x: N.x + b.uy * (hr(b) + e), y: N.y - b.ux * (hr(b) + e) };
        const s = ((pB.x - pA.x) * b.uy - (pB.y - pA.y) * b.ux) / den;
        const C = { x: pA.x + a.ux * s, y: pA.y + a.uy * s }, j = (i + 1) % arms.length;
        mouth[i] = Math.max(mouth[i], U.clamp((C.x - N.x) * a.ux + (C.y - N.y) * a.uy, 0, a.len * 0.45));
        mouth[j] = Math.max(mouth[j], U.clamp((C.x - N.x) * b.ux + (C.y - N.y) * b.uy, 0, b.len * 0.45));
      }
    }
  });
  // every arm reaches at least across the widest road it meets
  const wide = Math.max(...arms.map(a => a.h + e));
  arms.forEach((a, i) => { mouth[i] = Math.min(a.len * 0.45, Math.max(mouth[i], wide * 0.999)); });
  // the surface: round the arms counter-clockwise, each arm's mouth, then the curb return (or a straight edge) to the next
  const out = [];
  arms.forEach((a, i) => {
    const m = mouth[i], nx = -a.uy, ny = a.ux, h1 = hr(a) + e, h2 = hl(a) + e;
    out.push({ x: N.x + a.ux * m - nx * h1, y: N.y + a.uy * m - ny * h1 }, { x: N.x + a.ux * m + nx * h2, y: N.y + a.uy * m + ny * h2 });
    const f = fil[i]; if (f) out.push(...f.arc);
    else if (gaps[i] > Math.PI + 0.05 && arms.length > 1) {
      // a reflex corner (a bend, or the back of a Y): the two outer edges meet behind the node
      const b = arms[(i + 1) % arms.length], hA = hl(a) + e, hB = hr(b) + e, den = a.ux * b.uy - a.uy * b.ux;
      if (Math.abs(den) > 1e-6) {
        const pA = { x: N.x - a.uy * hA, y: N.y + a.ux * hA }, pB = { x: N.x + b.uy * hB, y: N.y - b.ux * hB };
        const t = ((pB.x - pA.x) * b.uy - (pB.y - pA.y) * b.ux) / den, C = { x: pA.x + a.ux * t, y: pA.y + a.uy * t };
        if (Math.hypot(C.x - N.x, C.y - N.y) < (hA + hB) * 3) out.push(C);
      }
    }
  });
  // the main road: the two arms of the highest rank most nearly opposite
  let main = null, best = -1;
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
    const a = arms[i], b = arms[j], opp = -(a.ux * b.ux + a.uy * b.uy);
    if (opp < 0.7) continue;
    const sc = Math.min(rk(a), rk(b)) * 10 + opp;
    if (sc > best) { best = sc; main = [i, j]; }
  }
  // (a main road only if nothing that meets it outranks it)
  if (main && arms.some((a, k) => !main.includes(k) && rk(a) > Math.min(rk(arms[main[0]]), rk(arms[main[1]])))) main = null;
  return { N, arms, gaps, fil, mouth, surf: out, main };
};

/* ---------- where roads meet on the country's network ----------
   Sites: every road junction that is not an interchange or a roundabout (W.junctions 'tj', and villages where three
   roads meet), roundabouts, and the ends of slip roads (a merge onto the motorway, or a T where the slip road meets
   the road across). Cached until the roads change. */
function armOf(n, e, end) {
  const P = end ? e.pts.slice().reverse() : e.pts, L = e.len || PL.len(P);
  const p = PL.at(P, Math.min(0.3, L * 0.4));
  const dx = p.x - n.x, dy = p.y - n.y, l = Math.hypot(dx, dy) || 1;
  // (a national road inside a city is drawn as the avenue it has become)
  return { ux: dx / l, uy: dy / l, len: L, cls: e.city ? e.ccls || 'art' : e.cls, e, end };
}
function netSig(W) { let s = W.edges.length + ':' + (W.ramps || []).length; for (let i = 0; i < W.edges.length; i += 7) s += ',' + W.edges[i].pts.length; return s; }
IC.roadJoins = function (W) {
  const sig = netSig(W);
  if (W._rj && W._rj.sig === sig && W._rj.J === W.junctions) return W._rj;
  const R = { sig, J: W.junctions, joins: [], rbs: [], ends: [], rail: null };
  W._rj = R;
  const byNode = {};
  for (const e of W.edges) for (const [k, end] of [[e.a, 0], [e.b, 1]]) (byNode[k] = byNode[k] || []).push(armOf(W.nodes[k] || e.pts[end ? e.pts.length - 1 : 0], e, end));
  const cityIds = new Set(W.cities.map(c => c.id));
  const done = new Set();
  for (const J of W.junctions || []) {
    done.add(J.id);
    const n = W.nodes[J.id], all = byNode[J.id] || [], arms = all.filter(a => !a.e.city);
    if (!n) continue;
    if (J.kind === 'tj' && arms.length >= 3) R.joins.push({ id: J.id, x: n.x, y: n.y, arms, kind: 'tj' });
    else if (J.kind === 'rb' && all.length >= 2) R.rbs.push({ id: J.id, x: n.x, y: n.y, r: J.r, arms: all, J });
  }
  // villages and other places where three or more roads meet (not the cities: their roads become avenues)
  for (const k in byNode) {
    if (done.has(k) || cityIds.has(k)) continue;
    const n = W.nodes[k], arms = byNode[k].filter(a => !a.e.city);
    if (!n || n.gate || arms.length < 3) continue;
    R.joins.push({ id: k, x: n.x, y: n.y, arms, kind: 'tj' });
  }
  // the ends of slip roads: merges onto the motorway, and terminals on the road across (the two slip roads that
  // meet the road at the same place make one crossroads there)
  const terms = new Map();
  for (const J of W.junctions || []) for (const r of J.ramps || []) for (const end of [0, 1]) {
    const P = r.pts, q = end ? P[P.length - 1] : P[0], q2 = end ? P[P.length - 2] : P[1];
    const L = Math.hypot(q.x - q2.x, q.y - q2.y) || 1, rx = (q.x - q2.x) / L, ry = (q.y - q2.y) / L;   // pointing out of the slip road
    let best = null;
    for (const d of J.dirs) {
      const e = d.e; if (!e) continue;
      const nr = PL.near(e.pts, q); if (!nr || nr.d > 0.6) continue;
      if (!best || nr.d < best.nr.d) best = { e, nr };
    }
    if (!best) continue;
    const { e, nr } = best, par = Math.abs(rx * nr.ux + ry * nr.uy);
    if (e.cls === 'hw' && par > 0.8) { R.ends.push({ kind: 'merge', r, end, e, q, dir: { x: rx, y: ry }, J }); continue; }
    const key = e.id + ':' + Math.round(nr.s / 0.15);
    let T = terms.get(key);
    if (!T) {
      const EL = e.len || PL.len(e.pts);
      T = { id: 'rt' + key, x: nr.x, y: nr.y, R: () => 0.13, stubs: [], term: true,
        arms: [{ ux: nr.ux, uy: nr.uy, len: Math.max(0.2, EL - nr.s), cls: e.city ? 'art' : e.cls, rank: 9 }, { ux: -nr.ux, uy: -nr.uy, len: Math.max(0.2, nr.s), cls: e.city ? 'art' : e.cls, rank: 9 }] };
      terms.set(key, T); R.joins.push(T);
    }
    const dx = q.x - T.x, dy = q.y - T.y, l = Math.hypot(dx, dy);
    T.arms.push(l > 0.02 ? { ux: dx / l, uy: dy / l, len: 1.2, cls: 'ramp' } : { ux: -rx, uy: -ry, len: 1.2, cls: 'ramp' });
    T.stubs.push({ cls: 'ramp', pts: [{ x: T.x, y: T.y }, q] });
  }
  // a slip road that crosses a road it does not join (away from the junction's own bridge) goes over it on a bridge
  R.xings = [];
  for (const J of W.junctions || []) for (const r of J.ramps || []) {
    const others = J.dirs.filter(d => d.e).map(d => ({ pts: d.e.pts, cls: d.e.city ? 'art' : d.cls, over: (J.over || []).includes(d.a) })).concat(J.ramps.filter(q => q !== r).map(q => ({ pts: q.pts, cls: 'ramp' })));
    const P = r.pts, e0 = P[0], e1 = P[P.length - 1];
    for (const o of others) for (let i = 1; i < P.length; i++) for (let k = 1; k < o.pts.length; k++) {
      const A = P[i - 1], B = P[i], C = o.pts[k - 1], D = o.pts[k];
      if (Math.max(A.x, B.x) < Math.min(C.x, D.x) || Math.min(A.x, B.x) > Math.max(C.x, D.x) || Math.max(A.y, B.y) < Math.min(C.y, D.y) || Math.min(A.y, B.y) > Math.max(C.y, D.y)) continue;
      const t = U.segX(A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y); if (t < 0) continue;
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
      // (where it joins that road, or under the junction's bridge, it is no crossing)
      if (Math.min(Math.hypot(x - e0.x, y - e0.y), Math.hypot(x - e1.x, y - e1.y)) < 0.35) continue;
      if (o.over && Math.hypot(x - J.x, y - J.y) < 0.6) continue;
      if (o.cls === 'ramp' && R.xings.some(q => Math.hypot(q.x - x, q.y - y) < 0.1)) continue;
      R.xings.push({ x, y, a: Math.atan2(B.y - A.y, B.x - A.x), under: o.cls, J: J.id });
    }
  }
  return R;
};
/* a join's geometry at the widths drawn (half widths from h(cls)), grown by e, cached while they stay the same */
IC.joinGeom = function (site, h, e) {
  const key = site.arms.map(a => (a.w ? a.w / 2 : h(a.cls)).toFixed(4)).join() + '|' + (e || 0).toFixed(4);
  const M = site._g || (site._g = new Map());
  let G = M.get(key); if (G) return G;
  if (M.size > 6) M.clear();
  G = IC.curbJoin({ x: site.x, y: site.y }, site.arms.map(a => ({ ux: a.ux, uy: a.uy, len: a.len, cls: a.cls, rank: a.rank, h: a.w ? a.w / 2 : h(a.cls), hl: a.hl, hr: a.hr, src: a })), { e, R: site.R });
  M.set(key, G);
  return G;
};

/* ---------- roundabouts ----------
   The ring (a circulating carriageway round a kerbed island with a strip of cobbles for lorries), each arm flared
   into it with curb returns tangent to the ring, and a splitter island between its entry and exit. */
IC.rbGeom = function (site, h) {
  const hs = site.arms.map(a => h(a.cls)), key = hs.map(v => v.toFixed(4)).join();
  if (site._g && site._k === key) return site._g;
  // the ring is as wide as the busiest road coming in needs (an avenue's roundabout is a big city place)
  const hm = Math.min(Math.max(...hs), h('rd') * 1.2), cw = Math.max(0.075, hm * 1.4), r = Math.max(site.r, cw * 1.6, Math.max(...hs) * 1.9), Ro = r + cw / 2, Ri = r - cw / 2;
  const C = { x: site.x, y: site.y }, arms = [];
  for (const a of site.arms) {
    const ha = h(a.cls), he = ha * 1.45, Rf = Math.max(0.05, (SPEC[a.cls] || SPEC.lc).R * 0.7);
    const nx = -a.uy, ny = a.ux, side = [];
    for (const sg of [1, -1]) {
      // a circle of radius Rf tangent to the flared edge (sg side) and outside the ring
      const l = he + Rf, al = Math.sqrt(Math.max(0, (Ro + Rf) * (Ro + Rf) - l * l));
      const Q = { x: C.x + a.ux * al + nx * sg * l, y: C.y + a.uy * al + ny * sg * l };
      const Tl = { x: C.x + a.ux * al + nx * sg * he, y: C.y + a.uy * al + ny * sg * he };
      const k = Ro / (Ro + Rf), Tc = { x: C.x + (Q.x - C.x) * k, y: C.y + (Q.y - C.y) * k };
      side.push({ Q, Tl, Tc, arc: arcPts(Q, Rf, Tl, Tc), al });
    }
    const al = Math.max(side[0].al, side[1].al), fl = al + Math.max(0.12, ha * 3);   // the flare starts this far out
    // the entry's surface: from the unflared arm, out to the flare, round the curb returns to the ring
    const P = (s, o) => ({ x: C.x + a.ux * s + nx * o, y: C.y + a.uy * s + ny * o });
    const surf = [P(fl, -ha), P(fl, ha), side[0].Tl].concat(side[0].arc, [C], side[1].arc.slice().reverse(), [side[1].Tl]);
    // the splitter island: a kerbed teardrop on the centre line from just off the ring
    const s0 = Ro + 0.012, s1 = Math.min(a.len * 0.4, s0 + Math.max(0.16, ha * 4)), wI = Math.max(0.012, he - ha * 1.05);
    const isl = [P(s0, 0)];
    for (let i = 0; i <= 8; i++) { const t = i / 8, w = wI * Math.sin(Math.PI * (0.15 + 0.85 * (1 - t)) / 2) * (1 - t * t); isl.push(P(s0 + (s1 - s0) * t, w)); }
    for (let i = 8; i >= 0; i--) { const t = i / 8, w = wI * Math.sin(Math.PI * (0.15 + 0.85 * (1 - t)) / 2) * (1 - t * t); isl.push(P(s0 + (s1 - s0) * t, -w)); }
    // the give-way line: across the entry lane (right-hand traffic: arriving on the arm's clockwise side), at the ring
    const gy = [P(Ro + 0.006, -wI - 0.004), P(Ro + 0.006, -he)];
    arms.push({ a, ha, he, surf, isl, gy, fl, s0, s1, P, side });
  }
  const G = { C, r, Ro, Ri, cw, arms, apron: Math.max(0.01, cw * 0.25) };
  site._g = G; site._k = key;
  return G;
};

/* ---------- slip roads ----------
   Where a slip road meets its motorway: an auxiliary lane along the carriageway before it leaves (or after it
   joins), tapering into the edge, and a gore of chevrons in the V where the slip road and the carriageway part. */
IC.taperGeom = function (end, hw, hr) {
  const key = hw.toFixed(4) + hr.toFixed(4);
  if (end._g && end._k === key) return end._g;
  const P = end.e.pts, q = end.q, nr = PL.near(P, q), L = PL.len(P);
  // which side of the motorway, how far out, and which way along it the slip road points
  const side = Math.sign((q.x - nr.x) * -nr.uy + (q.y - nr.y) * nr.ux) || 1;
  const along = Math.sign(end.dir.x * nr.ux + end.dir.y * nr.uy) || 1;   // the slip road's end points this way along P
  const off = nr.d, edge = hw;
  // the auxiliary lane runs on beyond the slip road's end (where its traffic still shares the motorway), then tapers
  const J = end.J, jn = J && { x: J.x, y: J.y }, sJ = jn ? PL.near(P, jn).s : -1e9;
  let La = 1.1, Lt = 0.9;
  // (not through the junction itself: a loop that starts beside the bridge has no room for one)
  const room = along > 0 ? (sJ > nr.s ? sJ - nr.s - 0.5 : L - nr.s) : (sJ < nr.s ? nr.s - sJ - 0.5 : nr.s);
  if (room < La + Lt) { const k = Math.max(0, room) / (La + Lt); La *= k; Lt *= k; }
  const outer = Math.max(edge + hr * 2, off + hr), n = 14, lane = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = nr.s + along * (La + Lt) * t;
    const p = PL.at(P, U.clamp(s, 0, L)), nx = -p.uy * side, ny = p.ux * side;
    const w = t * (La + Lt) <= La ? outer : edge + (outer - edge) * (1 - (t * (La + Lt) - La) / Lt);
    lane.push({ x: p.x + nx * w, y: p.y + ny * w }); inner.push({ x: p.x + nx * (edge - 0.004), y: p.y + ny * (edge - 0.004) });
  }
  const aux = lane.concat(inner.reverse());
  // the gore: along the slip road from its end, while it runs close beside the carriageway
  const R = end.end ? end.r.pts.slice().reverse() : end.r.pts, gore = [], base = [];
  const RL = PL.len(R);
  let nose = null;
  for (let s = 0; s <= Math.min(RL, 2.5); s += 0.05) {
    const p = PL.at(R, s), m = PL.near(P, p); if (!m) break;
    const gap = m.d - hr - edge;
    const nx = -p.uy, ny = p.ux, sd = Math.sign((m.x - p.x) * nx + (m.y - p.y) * ny) || 1;
    gore.push({ x: p.x + nx * sd * hr, y: p.y + ny * sd * hr });
    base.push({ x: m.x + (p.x - m.x) / (m.d || 1) * edge, y: m.y + (p.y - m.y) / (m.d || 1) * edge });
    if (gap > Math.max(0.06, hr * 1.6)) { nose = { x: p.x, y: p.y, s }; break; }
  }
  const G = { aux, gore: gore.length > 2 && nose ? gore.concat(base.reverse()) : null, nose, side, along, lane, edge, len: La + Lt };
  end._g = G; end._k = key;
  return G;
};
/* ---------- railways ----------
   Where a road crosses a railway: a local or access road crosses at a level crossing (barriers, boards, markings),
   anything bigger on a bridge. The rail's own direction at the crossing is found once. */
IC.railCrossings = function (W) {
  const R = IC.roadJoins(W);
  if (R.rail && R.rail.n === (W.railX || []).length) return R.rail.list;
  const list = [];
  for (const x of W.railX || []) {
    let best = null;
    for (const r of W.rails) {
      if (r.bb && (x.x < r.bb[0] - 1 || x.x > r.bb[2] + 1 || x.y < r.bb[1] - 1 || x.y > r.bb[3] + 1)) continue;
      const m = PL.near(r.pts, x); if (m && (!best || m.d < best.d)) best = m;
    }
    const ra = best ? Math.atan2(best.uy, best.ux) : x.a + Math.PI / 2;
    list.push({ x: x.x, y: x.y, a: x.a, ra, cls: x.cls, level: x.cls === 'lc' || x.cls === 'sp' });
  }
  R.rail = { n: list.length, list };
  return list;
};

/* ---------- city streets ----------
   A city's streets are drawn lines that cross one another (they are not split at junctions): every crossing, and
   every street ending on another, is a join with curb returns, the pavements following them round. Worked out once
   for the city and again when its streets change. Arms reach half way to the next join along the same street. */
IC.streetJoins = function (W, c) {
  const lines = c.streets.concat(W.edges.filter(e => e.city === c.id).map(e => ({ cls: 'art', pts: e.pts, ave: true })));
  const sig = lines.length + ':' + lines.reduce((s, l) => s + l.pts.length, 0);
  if (c._sj && c._sj.sig === sig) return c._sj.joins;
  c._sj = { sig, joins: lineJoins(lines, c.blocks, 3) };
  return c._sj.joins;
};
/* an airport's landside roads (landside.js), at ground level: their corners and T junctions */
IC.landJoins = function (ap) {
  const L = ap.land; if (!L || !L.roads) return [];
  const lines = L.roads.filter(r => (r.lv || 0) === 0 && r.pts.length > 1).map(r => ({ cls: 'land', pts: r.pts, w: r.w || 0.12, road: r }));
  const sig = (L.ver || 0) + ':' + lines.length + ':' + lines.reduce((s, l) => s + l.pts.length + l.pts[0].x, 0);
  if (L._lj && L._lj.sig === sig) return L._lj.joins;
  L._lj = { sig, joins: lineJoins(lines, null, 2) };
  return L._lj.joins;
};
/* where drawn lines cross or end on one another; blocks (optional): the lots that narrow a street's open width */
function lineJoins(lines, blocks, minArms) {
  const cum = lines.map(l => { const a = [0]; for (let i = 1; i < l.pts.length; i++) a.push(a[i - 1] + Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y)); return a; });
  // segments into a grid of 2-unit cells
  const G = new Map(), CS = 2, key = (i, j) => i * 100003 + j;
  lines.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) {
    const a = l.pts[i - 1], b = l.pts[i];
    for (let gx = Math.floor(Math.min(a.x, b.x) / CS); gx <= Math.floor(Math.max(a.x, b.x) / CS); gx++) for (let gy = Math.floor(Math.min(a.y, b.y) / CS); gy <= Math.floor(Math.max(a.y, b.y) / CS); gy++) {
      const k = key(gx, gy); let L = G.get(k); if (!L) G.set(k, L = []); L.push(li, i);
    }
  } });
  const pts = [];   // { x, y, on: [[line, s], ...] }
  const add = (x, y, li, s, lj, t) => {
    let p = pts.find(q => Math.abs(q.x - x) < 0.25 && Math.abs(q.y - y) < 0.25 && Math.hypot(q.x - x, q.y - y) < 0.25);
    if (!p) pts.push(p = { x, y, on: [] });
    if (!p.on.some(o => o[0] === li)) p.on.push([li, s]);
    if (lj != null && !p.on.some(o => o[0] === lj)) p.on.push([lj, t]);
  };
  const seen = new Set();
  for (const L of G.values()) for (let u = 0; u < L.length; u += 2) for (let v = u + 2; v < L.length; v += 2) {
    const li = L[u], i = L[u + 1], lj = L[v], j = L[v + 1];
    if (li === lj) continue;
    const pk = li < lj ? li + ':' + i + ':' + lj + ':' + j : lj + ':' + j + ':' + li + ':' + i; if (seen.has(pk)) continue; seen.add(pk);
    const A = lines[li].pts, B = lines[lj].pts, a = A[i - 1], b = A[i], c2 = B[j - 1], d = B[j];
    const t = U.segX(a.x, a.y, b.x, b.y, c2.x, c2.y, d.x, d.y); if (t < 0) continue;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    const tb = Math.hypot(x - c2.x, y - c2.y) / (Math.hypot(d.x - c2.x, d.y - c2.y) || 1);
    add(x, y, li, cum[li][i - 1] + t * (cum[li][i] - cum[li][i - 1]), lj, cum[lj][j - 1] + tb * (cum[lj][j] - cum[lj][j - 1]));
  }
  // a street that ends on another (a T)
  lines.forEach((l, li) => { for (const end of [0, 1]) {
    const q = end ? l.pts[l.pts.length - 1] : l.pts[0], sq = end ? cum[li][cum[li].length - 1] : 0;
    const cand = G.get(key(Math.floor(q.x / CS), Math.floor(q.y / CS))) || [];
    for (let u = 0; u < cand.length; u += 2) {
      const lj = cand[u], j = cand[u + 1]; if (lj === li) continue;
      const B = lines[lj].pts, a = B[j - 1], b = B[j], w = (SPEC[lines[lj].cls] || SPEC.st).w / 2 + 0.1;
      if (U.segDist(q.x, q.y, a.x, a.y, b.x, b.y) > w) continue;
      const L2 = Math.hypot(b.x - a.x, b.y - a.y) || 1, t = U.clamp(((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L2 * L2), 0, 1);
      add(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, lj, cum[lj][j - 1] + t * L2, li, sq);
      break;
    }
  } });
  // along each line, the joins in order: an arm reaches half way to the next
  const along = lines.map(() => []);
  pts.forEach((p, k) => { for (const [li, s] of p.on) along[li].push([s, k]); });
  for (const A of along) A.sort((a, b) => a[0] - b[0]);
  // how far the blocks' lots (their pavements and yards) leave the street open on each side of an arm: the kerb is
  // where the lot begins
  const BG = new Map(), BC = 3;
  for (const b of blocks || []) { if (b.empty) continue; const k = key(Math.floor(b.x / BC), Math.floor(b.y / BC)); let L = BG.get(k); if (!L) BG.set(k, L = []); L.push(b); }
  const open = (x, y, nx, ny, h) => {
    let best = h;
    for (let gx = Math.floor(x / BC) - 1; gx <= Math.floor(x / BC) + 1; gx++) for (let gy = Math.floor(y / BC) - 1; gy <= Math.floor(y / BC) + 1; gy++) for (const b of BG.get(key(gx, gy)) || []) {
      // along the ray (x, y) + t n into the lot rectangle (the block and 15 m round it)
      const ca = Math.cos(b.a), sa = Math.sin(b.a), lx = (x - b.x) * ca + (y - b.y) * sa, ly = -(x - b.x) * sa + (y - b.y) * ca, dx = nx * ca + ny * sa, dy = -nx * sa + ny * ca;
      const W2 = b.w / 2 + 0.15, H2 = b.h / 2 + 0.15;
      let t0 = 0, t1 = best;
      for (const [p, d, lim] of [[lx, dx, W2], [ly, dy, H2]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(p) > lim) { t0 = 1; t1 = 0; } continue; }
        let a1 = (-lim - p) / d, a2 = (lim - p) / d; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; }
        t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      }
      if (t0 <= t1 && t0 < best) best = Math.max(0, t0);
    }
    return best;
  };
  const joins = [];
  pts.forEach((p, k) => {
    const arms = [];
    for (const [li, s] of p.on) {
      const l = lines[li], tot = cum[li][cum[li].length - 1], A = along[li], ix = A.findIndex(q => q[1] === k);
      const prev = ix > 0 ? A[ix - 1][0] : -1e9, next = ix < A.length - 1 ? A[ix + 1][0] : 1e9;
      for (const dir of [1, -1]) {
        const room = dir > 0 ? Math.min(tot - s, (next - s)) : Math.min(s, (s - prev));
        if (room < 0.05) continue;
        const q = PL.at(l.pts, U.clamp(s + dir * Math.min(0.25, room * 0.5), 0, tot)), dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy); if (dl < 1e-4) continue;
        const arm = { ux: dx / dl, uy: dy / dl, len: room * (dir > 0 && next < 1e8 || dir < 0 && prev > -1e8 ? 1 : 2), cls: l.cls, line: l, dir, w: l.w };
        // the street's open width a little way out (never less than a lane each way)
        if (blocks) {
          const h = (SPEC[l.cls] || SPEC.st).w / 2, sm = Math.min(room * 0.5, 0.5), m = PL.at(l.pts, U.clamp(s + dir * sm, 0, tot));
          const nx = -arm.uy, ny = arm.ux;
          arm.hl = Math.max(0.04, open(m.x, m.y, nx, ny, h)); arm.hr = Math.max(0.04, open(m.x, m.y, -nx, -ny, h));
        }
        arms.push(arm);
      }
    }
    if (arms.length >= minArms) joins.push({ x: p.x, y: p.y, arms, big: arms.some(a => a.cls === 'art' || a.cls === 'ring'), ave: arms.some(a => a.line.ave) });
  });
  return joins;
}

})(window.IC);
