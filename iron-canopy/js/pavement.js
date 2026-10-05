/* Iron Canopy — an airport's pavement as one piece (brief 44): runways, taxiways, aprons and the fillets between them,
   with the centrelines a pilot follows. Geometry only, headless; render-airport.js paints it into the airport's tiles
   and the 3D view lays the same picture on its ground.

   Fillets. Where a taxiway meets another taxiway, a runway or an apron edge at an angle, the pavement on the inside of
   the turn is widened by a curve tangent to both edges (the "judgemental oversteering" fillet of FAA AC
   150/5300-13): the design aircraft's cockpit follows the centreline arc of radius Rc, its main gear cuts inside it by
   the track-in (Rc − √(Rc² − d²), d from the cockpit to the main gear), and the edge curve is drawn that far inside.
   A taxiway passing straight through a junction gets nothing on its straight side, and a straight crossing (every arm
   continued by another) gets no fillets at all. The yellow centreline turns on the same arcs; onto a runway, the
   lead-on lines curve into the runway's centreline. */
(function (IC) {
'use strict';
const U = IC.U;

/* the design aircraft by taxiway width: the centreline radius, the cockpit-to-main-gear distance and the paved
   shoulder beyond the edge line, in units (100 m) */
const DESIGN = [
  { w: 0.22, Rc: 0.46, d: 0.3, sh: 0.1 },    // wide-bodies (ADG V, taxiways 23 m)
  { w: 0.17, Rc: 0.32, d: 0.19, sh: 0.075 }, // narrow-bodies (18 m)
  { w: 0.1, Rc: 0.22, d: 0.12, sh: 0.05 },   // taxilanes and regional aircraft
  { w: 0, Rc: 0.12, d: 0.04, sh: 0 }         // light aircraft
];
IC.PAVE_DESIGN = DESIGN;
const designOf = w => DESIGN.find(d => w >= d.w) || DESIGN[DESIGN.length - 1];
IC.paveDesign = designOf;
const STRAIGHT = Math.PI - 0.09;   // a gap wider than this (about 175°) is a straight run: no fillet
const ACUTE = 1.0;   // a gap narrower than this (about 57°) is the outside of a hairpin nobody taxis: no fillet or curve
/* the fillet's radius against the centreline radius: bold at a right angle, longer and gentler for a shallow turn
   (a rapid exit's inside edge widens over a long taper), wider still onto a runway */
const filK = (turn, rwy) => (rwy ? 1.6 : 1.3) * (1 + 3 * Math.pow(Math.max(0, 1 - turn / (Math.PI / 2)), 2));
/* a runway's paved shoulder beyond its edge line: it is drawn over the taxiways that meet it, so fillets onto a
   runway are tangent to the shoulder's outer edge and the runway reads as one piece through every junction */
IC.rwShoulder = w => w >= 0.4 ? 0.075 : w >= 0.3 ? 0.05 : 0.03;   // a gap wider than this (about 175°) is a straight run: no fillet
const ang = (x, y) => Math.atan2(y, x);

/* what the pavement looks like depends on: every paved part built, where it is, its material and width */
IC.paveSig = function (ap) {
  // (the service roads are painted with it: the buildings they reach and the roads drawn by hand count too)
  let s = ap.parts.length + ':' + ap.nodeN + ':' + (ap.svcRoads || []).length + ':' + (ap.land ? ap.land.ver : 0);
  for (const p of ap.parts) if (p.built && p.x != null && !IC.PAVED[p.kind]) s += p.kind[0] + (p.x + p.y).toFixed(2);
  for (const p of ap.parts) {
    if (!p.built || !(IC.PAVED[p.kind] || p.kind === 'terminal' || p.kind === 'cargo' || (IC.APART[p.kind] && IC.APART[p.kind].pad))) continue;
    s += '|' + p.id + (p.mat || '') + (p.w || 0) + (p.oneway || p.flow || '') + Math.round((p.wear || 0) * 4);
    if (p.x != null) s += (p.x + p.y + (p.a || 0)).toFixed(3) + (p.h || 0);
    if (p.a && p.a.x != null) s += (p.a.x + p.b.y).toFixed(3);
    if (p.stands) s += 's' + p.stands.length + (p.stands[0] ? p.stands[0].x.toFixed(2) : '');
    if (p.nodes) for (const id of p.nodes) { const n = ap.nodes[id]; if (n) s += (n.x + n.y).toFixed(3); }
  }
  return s;
};

/* the arms of the pavement leaving a node: each taxiway leg, the runway either way, the apron edge either way */
function arms(ap, id, legs) {
  const n = ap.nodes[id], out = [];
  for (const L of legs.get(id) || []) out.push(L);
  if (n.on && n.on.kind === 'rwy') {
    const rw = ap.parts.find(p => p.id === n.on.part);
    if (rw && rw.built) {
      const d = IC.rwDir(rw), Lr = IC.rwLen(rw), t = IC.rwT(rw, n) * Lr, h = rw.w / 2 + (IC.paveOf(rw) === 'grass' ? 0 : IC.rwShoulder(rw.w));
      if (t < Lr - 0.05) out.push({ ux: d.x, uy: d.y, h, len: Lr - t, kind: 'rwy', part: rw, mat: IC.paveOf(rw) });
      if (t > 0.05) out.push({ ux: -d.x, uy: -d.y, h, len: t, kind: 'rwy', part: rw, mat: IC.paveOf(rw) });
    }
  } else if (n.on && n.on.kind === 'apron' && !n.on.inside) {
    const a = ap.parts.find(p => p.id === n.on.part);
    if (a && a.built) {
      // the nearest edge of the apron's outline, either way along it from the node
      const P = IC.partOutline(a); let best = null, bd = 1e9;
      for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], d = U.segDist(n.x, n.y, A.x, A.y, B.x, B.y); if (d < bd) { bd = d; best = [A, B]; } }
      if (best) {
        const [A, B] = best, L = U.dist(A, B) || 1, ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, t = (n.x - A.x) * ux + (n.y - A.y) * uy;
        if (L - t > 0.02) out.push({ ux, uy, h: 0, len: L - t, kind: 'apron', part: a, mat: IC.paveOf(a) });
        if (t > 0.02) out.push({ ux: -ux, uy: -uy, h: 0, len: t, kind: 'apron', part: a, mat: IC.paveOf(a) });
      }
    }
  }
  // the same way twice (two taxiways overlapping): keep the wider
  const res = [];
  for (const a of out) {
    a.th = ang(a.ux, a.uy);
    const same = res.find(b => Math.abs(Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th))) < 0.035);
    if (!same) res.push(a); else if (a.kind === 'taxi' && (same.kind !== 'taxi' || a.h > same.h)) res[res.indexOf(same)] = a;
  }
  return res.sort((a, b) => a.th - b.th);
}

/* the legs of every built taxiway, by node */
function legsOf(ap) {
  const legs = new Map(), add = (id, L) => { if (!legs.has(id)) legs.set(id, []); legs.get(id).push(L); };
  for (const p of ap.parts) if (p.kind === 'taxi' && p.built) for (let i = 0; i < p.nodes.length; i++) {
    const a = ap.nodes[p.nodes[i]]; if (!a) continue;
    for (const j of [i - 1, i + 1]) {
      const b = ap.nodes[p.nodes[j]]; if (!b) continue;
      const len = U.dist(a, b); if (len < 1e-4) continue;
      add(p.nodes[i], { ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, h: (p.w || IC.APART.taxi.w) / 2, len, kind: 'taxi', part: p, mat: IC.paveOf(p), lane: !!p.lane, to: p.nodes[j] });
    }
  }
  return legs;
}

/* one inner corner between arm A and the next arm B (counter-clockwise), grown outwards by e: the corner C where their
   edges meet, the tangent points and the arc. null when the corner needs no fillet */
function corner(N, A, B, gap, e, straightX) {
  if (gap >= STRAIGHT || gap < ACUTE || straightX) return null;
  if (A.kind !== 'taxi' && B.kind !== 'taxi') return null;
  const T = A.kind === 'taxi' && (B.kind !== 'taxi' || A.h >= B.h) ? A : B, D = designOf(T.h * 2);
  // the edges facing each other: A's on its counter-clockwise side, B's on its clockwise side
  const nA = { x: -A.uy, y: A.ux }, nB = { x: B.uy, y: -B.ux };
  // (a runway's side is its shoulder's outer edge whatever e is: a taxiway's shoulder thins out into the runway's)
  const hA = A.h + (A.kind === 'rwy' ? 0 : e), hB = B.h + (B.kind === 'rwy' ? 0 : e);
  const pA = { x: N.x + nA.x * hA, y: N.y + nA.y * hA }, pB = { x: N.x + nB.x * hB, y: N.y + nB.y * hB };
  const den = A.ux * B.uy - A.uy * B.ux; if (Math.abs(den) < 1e-6) return null;
  const s = ((pB.x - pA.x) * B.uy - (pB.y - pA.y) * B.ux) / den;
  const C = { x: pA.x + A.ux * s, y: pA.y + A.uy * s };
  // (a corner behind the node along either arm, as where a narrow taxiway leaves a wide runway at a shallow angle,
  // lies over the other arm's pavement: nothing to fill there)
  if ((C.x - N.x) * A.ux + (C.y - N.y) * A.uy < 0 || (C.x - N.x) * B.ux + (C.y - N.y) * B.uy < 0) return null;
  // the turn is π − gap; the main gear cuts in by the track-in, less on a gentle turn
  const turn = Math.PI - gap, tin = (D.Rc - Math.sqrt(Math.max(0, D.Rc * D.Rc - D.d * D.d))) * Math.min(1, turn / (Math.PI / 2));
  // (as bold as the real ones: the edge arc runs from well before the corner, about 1.3 times the centreline radius
  // less the gear's cut-in; onto a runway the entry is wider still, so a turn from either way reads as a funnel)
  let R = Math.max(0.01, D.Rc * filK(turn, A.kind === 'rwy' || B.kind === 'rwy') - tin) - e;
  if (R < 0.004) R = 0.004;
  const tg = Math.tan(gap / 2);
  // no fillet longer than the legs it joins (a short leg to the next junction takes a tighter one)
  const room = Math.min((A.len - ((C.x - N.x) * A.ux + (C.y - N.y) * A.uy)), (B.len - ((C.x - N.x) * B.ux + (C.y - N.y) * B.uy))) * 0.92;
  if (room <= 0.002) return null;
  if (R / tg > room) R = room * tg;
  const t = R / tg, bx = A.ux + B.ux, by = A.uy + B.uy, bl = Math.hypot(bx, by) || 1;
  const O = { x: C.x + bx / bl * R / Math.sin(gap / 2), y: C.y + by / bl * R / Math.sin(gap / 2) };
  const T1 = { x: C.x + A.ux * t, y: C.y + A.uy * t }, T2 = { x: C.x + B.ux * t, y: C.y + B.uy * t };
  return { N, A, B, C, O, R, T1, T2, gap, D };
}
/* the arc's points from T1 to T2 round O (the short way, bulging towards the corner) */
function arcPts(O, R, P1, P2, n) {
  let a1 = Math.atan2(P1.y - O.y, P1.x - O.x), a2 = Math.atan2(P2.y - O.y, P2.x - O.x), d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const out = [], k = Math.max(2, n || Math.ceil(Math.abs(d) / 0.12));
  for (let i = 0; i <= k; i++) { const a = a1 + d * i / k; out.push({ x: O.x + Math.cos(a) * R, y: O.y + Math.sin(a) * R }); }
  return out;
}
IC.paveArc = arcPts;
/* the fillet's outline: from the node along A's centreline to the tangent point, round the arc, back along B.
   (It reaches into both legs, so it joins them with no hairline between.) */
function filletPoly(f) {
  const { N, A, B, T1, T2, O, R } = f;
  const sA = (T1.x - N.x) * A.ux + (T1.y - N.y) * A.uy, sB = (T2.x - N.x) * B.ux + (T2.y - N.y) * B.uy;
  return [{ x: N.x + A.ux * sA, y: N.y + A.uy * sA }].concat(arcPts(O, R, T1, T2), [{ x: N.x + B.ux * sB, y: N.y + B.uy * sB }, { x: N.x, y: N.y }]);
}

/* every junction's arms and whether it is a straight crossing */
function junctions(ap, G) {
  const legs = legsOf(ap), out = [];
  const add = (id, N, A) => {
    if (A.length < 2) { out.push({ id, N, A, gaps: [], cross: false }); return; }
    const gaps = A.map((a, i) => { const b = A[(i + 1) % A.length]; let g = b.th - a.th; if (i === A.length - 1) g += 2 * Math.PI; return g; });
    // a straight crossing: four or more arms, every one continued straight through by another
    const cross = A.length >= 4 && A.every(a => A.some(b => b !== a && Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th)))) < 0.09));
    out.push({ id, N, A, gaps, cross });
  };
  for (const id of legs.keys()) add(id, ap.nodes[id], arms(ap, id, legs));
  for (const X of edgeCrossings(ap, G)) add(X.id, X.N, X.A);
  return out;
}

/* Taxi legs that run into an apron or a pad with no node on its edge (the stub to a de-icing pad or a fuel stand, a
   taxilane into a ramp): a junction where the leg crosses the edge, so the edge opens with fillets as at any other
   apron entry. Not where the edge already lies on another taxiway's pavement (a holding bay's slab along its
   parallel taxiway), nor on a holding bay at all: that slab is laid round its tracks. */
function edgeCrossings(ap, G) {
  const out = [], polys = G.ar.filter(a => !a.fore && a.p.kind !== 'holdbay');
  if (!polys.length) return out;
  const onOther = (q, part) => G.tw.some(t => t.p !== part && t.pts.some((b, i) => i && U.segDist(q.x, q.y, t.pts[i - 1].x, t.pts[i - 1].y, b.x, b.y) <= t.w / 2 + 0.02));
  for (const t of G.tw) for (let i = 1; i < t.p.nodes.length; i++) for (const [ia, ib] of [[i - 1, i], [i, i - 1]]) {
    const A = ap.nodes[t.p.nodes[ia]], B = ap.nodes[t.p.nodes[ib]]; if (!A || !B) continue;
    for (const a of polys) {
      if (A.on && A.on.part === a.p.id) continue;
      const P = a.poly, pp = a._pp || (a._pp = P.map(v => [v.x, v.y]));
      if (U.inPoly(A.x, A.y, pp)) continue;
      // the first edge the leg crosses, going in; or (a stub that stops at a pad's face, as older ones did) the edge
      // just ahead of its end
      let best = null, N;
      if (U.inPoly(B.x, B.y, pp)) {
        for (let k = 0; k < P.length; k++) { const C = P[k], D = P[(k + 1) % P.length], s = U.segX(A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y); if (s >= 0 && (!best || s < best.s)) best = { s, C, D }; }
        if (!best) continue;
        N = { x: A.x + (B.x - A.x) * best.s, y: A.y + (B.y - A.y) * best.s };
        if (U.dist(N, B) < 0.03) continue;
      } else {
        if (ib !== 0 && ib !== t.p.nodes.length - 1) continue;
        const L0 = U.dist(A, B) || 1, F = { x: B.x + (B.x - A.x) / L0 * 0.1, y: B.y + (B.y - A.y) / L0 * 0.1 };
        for (let k = 0; k < P.length; k++) { const C = P[k], D = P[(k + 1) % P.length], s = U.segX(B.x, B.y, F.x, F.y, C.x, C.y, D.x, D.y); if (s >= 0 && (!best || s < best.s)) best = { s, C, D }; }
        if (!best) continue;
        N = { x: B.x + (F.x - B.x) * best.s, y: B.y + (F.y - B.y) * best.s };
      }
      if (U.dist(N, A) < 0.03 || onOther(N, t.p)) continue;
      const L = U.dist(A, N), El = U.dist(best.C, best.D) || 1, ex = (best.D.x - best.C.x) / El, ey = (best.D.y - best.C.y) / El, te = (N.x - best.C.x) * ex + (N.y - best.C.y) * ey;
      const Ar = [{ ux: (A.x - N.x) / L, uy: (A.y - N.y) / L, h: t.w / 2, len: U.dist(N, A), kind: 'taxi', part: t.p, mat: t.mat, lane: t.lane, to: t.p.nodes[ia] }];
      if (El - te > 0.02) Ar.push({ ux: ex, uy: ey, h: 0, len: El - te, kind: 'apron', part: a.p, mat: a.mat });
      if (te > 0.02) Ar.push({ ux: -ex, uy: -ey, h: 0, len: te, kind: 'apron', part: a.p, mat: a.mat });
      for (const q of Ar) q.th = ang(q.ux, q.uy);
      out.push({ id: 'x' + t.p.id + ':' + ia + ':' + a.p.id, N, A: Ar.sort((p, q) => p.th - q.th) });
    }
  }
  return out;
}

/* the fillets grown outwards by e (0: the pavement; the shoulder's width: the shoulder; the edge line inset: < 0) */
IC.paveFillets = function (ap, e) {
  const G = IC.paveGeom(ap), k = 'f' + (e || 0).toFixed(4);
  if (G[k]) return G[k];
  const out = [];
  for (const J of G.J) J.A.forEach((a, i) => {
    if (J.A.length < 2) return;
    const b = J.A[(i + 1) % J.A.length];
    const f = corner(J.N, a, b, J.gaps[i], e || 0, J.cross); if (!f) return;
    out.push({ poly: filletPoly(f), mat: (a.kind === 'taxi' ? a : b).mat, f, th: (a.kind === 'taxi' ? a : b).th });
  });
  G[k] = out;
  return out;
};

/* A short stub from a taxiway to a pad (de-icing, fuel), whose fillets on each side nearly meet: the paving between
   them is filled out to a straight edge from one fillet's far end to the other's, so no sliver of shoulder or grass is left
   between two curves. Grown by e, as the fillets are. */
IC.paveChamfers = function (ap, e) {
  const G = IC.paveGeom(ap), k = 'c' + (e || 0).toFixed(4);
  if (G[k]) return G[k];
  const F = IC.paveFillets(ap, e), out = [];
  const legOf = f => [[f.f.A, f.f.T2], [f.f.B, f.f.T1]].filter(q => q[0].kind === 'taxi');
  for (let i = 0; i < F.length; i++) for (const [X, To] of legOf(F[i])) {
    // (a pad's stub only: a link to an apron keeps its two curves, the grass between them)
    const E = F[i].f.A.kind === 'apron' ? F[i].f.A : F[i].f.B.kind === 'apron' ? F[i].f.B : null;
    if (!E || !(IC.APART[E.part.kind] && IC.APART[E.part.kind].pad)) continue;
    const N = F[i].f.N, M = { x: N.x + X.ux * X.len, y: N.y + X.uy * X.len }, side = Math.sign(X.ux * (F[i].f.C.y - N.y) - X.uy * (F[i].f.C.x - N.x));
    for (let j = 0; j < F.length; j++) {
      const g = F[j]; if (j === i || U.dist(g.f.N, M) > 0.01) continue;
      for (const [Y, Uo] of legOf(g)) {
        if (Y.ux * X.ux + Y.uy * X.uy > -0.999 || Math.sign(X.ux * (g.f.C.y - N.y) - X.uy * (g.f.C.x - N.x)) !== side) continue;
        // (whatever their size at this growth: the shoulder, the pavement and the edge line agree)
        if (X.len > 1.2) continue;
        out.push({ poly: [To, F[i].f.C, g.f.C, Uo], mat: F[i].mat });
      }
    }
  }
  G[k] = out;
  return out;
};

/* The middle of each junction, grown by e: the points where every arm's edges leave the node, joined in order round
   it, with an arc round the outside of a turn (the reflex side, where no arm is). Taxiways are drawn with square
   ends, so this is what fills a junction: nothing round pokes out of it, whatever the widths that meet. */
IC.paveHubs = function (ap, e) {
  const G = IC.paveGeom(ap), k = 'h' + (e || 0).toFixed(4);
  if (G[k]) return G[k];
  const out = [];
  e = e || 0;
  for (const J of G.J) {
    const A = J.A; if (A.length < 2 || !A.some(a => a.kind === 'taxi')) continue;
    const N = J.N, pts = [];
    const at = (th, r) => pts.push({ th, x: N.x + Math.cos(th) * r, y: N.y + Math.sin(th) * r });
    // (only the taxiways' edges: a runway or an apron covers its own side of the node)
    A.forEach((a, i) => {
      if (a.kind !== 'taxi') return;
      const h = Math.max(0.002, a.h + e);
      at(a.th + Math.PI / 2, h); at(a.th - Math.PI / 2, h);
      const b = A[(i + 1) % A.length], gap = J.gaps[i];
      if (gap > Math.PI + 0.05 && a.kind === 'taxi' && b.kind === 'taxi') {
        // the outside of the turn: an arc from a's left edge to b's right edge
        const t0 = a.th + Math.PI / 2, t1 = a.th + gap - Math.PI / 2, hb = Math.max(0.002, b.h + e), n = Math.max(2, Math.ceil((t1 - t0) / 0.15));
        for (let j = 1; j < n; j++) at(t0 + (t1 - t0) * j / n, h + (hb - h) * j / n);
      }
    });
    if (pts.length < 3) continue;
    for (const q of pts) q.th = Math.atan2(q.y - N.y, q.x - N.x);
    pts.sort((p, q) => p.th - q.th);
    const T = A.filter(a => a.kind === 'taxi').sort((p, q) => q.h - p.h)[0];
    out.push({ poly: pts.map(q => ({ x: q.x, y: q.y })), mat: T.mat, N });
  }
  G[k] = out;
  return out;
};

/* The geometry, cached until the pavement changes:
   rw  runways { p, a, b, w, d (unit along), L, mat }
   tw  taxiways { p, pts, w, mat, lane }
   ar  aprons, pads and the forecourts of terminals and sheds { p, poly, mat, a (the slab direction) }
   J   junctions (arms and gaps), fil the fillets
   cl  the yellow centrelines: straight runs trimmed where a curve takes over, and the curves { pts, lead } */
IC.paveGeom = function (ap) {
  const sig = IC.paveSig(ap);
  if (ap._pg && ap._pg.sig === sig) return ap._pg;
  const G = { sig, rw: [], tw: [], ar: [], cl: [] };
  ap._pg = G;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (x, y, m) => { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); };
  for (const p of ap.parts) {
    if (!p.built) continue;
    if (p.kind === 'runway') { const L = IC.rwLen(p), d = IC.rwDir(p); G.rw.push({ p, a: p.a, b: p.b, w: p.w, d, L, mat: IC.paveOf(p) }); grow(p.a.x, p.a.y, 9); grow(p.b.x, p.b.y, 9); }
    else if (p.kind === 'taxi') { const pts = p.nodes.map(id => ap.nodes[id]).filter(Boolean); if (pts.length < 2) continue; G.tw.push({ p, pts, w: p.w || IC.APART.taxi.w, mat: IC.paveOf(p), lane: !!p.lane }); for (const q of pts) grow(q.x, q.y, 1); }
    else if (p.kind === 'apron' || p.kind === 'alert' || p.kind === 'holdbay' || (IC.APART[p.kind] && IC.APART[p.kind].pad)) { const P = IC.partOutline(p); G.ar.push({ p, poly: P, mat: IC.PAVED[p.kind] ? IC.paveOf(p) : 'conc', a: p.a || 0, pad: !IC.PAVED[p.kind] }); for (const q of P) grow(q.x, q.y, 1); }
    else if ((p.kind === 'terminal' || p.kind === 'cargo') && p.x != null && !p.noApron) {
      // a terminal or shed stands on a forecourt that meets the apron
      const P = p.poly ? IC.polyGrow(IC.partOutline(p), 0.15) : IC.partOutline(Object.assign({}, p, { w: p.w + 0.3, h: p.h + 0.3, poly: null }));
      G.ar.push({ p, poly: P, mat: 'conc', a: p.a || 0, fore: true }); for (const q of P) grow(q.x, q.y, 1);
    }
  }
  G.bb = x0 < x1 ? { x0, y0, x1, y1 } : null;
  G.J = junctions(ap, G);
  G.fil = IC.paveFillets(ap, 0);
  centrelines(ap, G);
  G.mouths = mouths(G);
  for (const c of apronLines(ap, G)) G.cl.push(c);
  return G;
};

/* the centrelines: every taxiway leg runs straight between its junctions, trimmed where a turn curves off it; each
   turn with a fillet gets its curve (radius Rc, as far as the legs allow); onto a runway the curves are lead-on and
   lead-off lines and the straight line stops at the runway's edge */
function centrelines(ap, G) {
  const trim = new Map();   // node id + '>' + neighbour id: how far from the node the straight line starts
  const key = (id, L) => id + '>' + (L.to || '');
  for (const J of G.J) {
    const n = J.A.length; if (n < 2) continue;
    J.A.forEach((a, i) => {
      if (a.kind !== 'taxi') return;
      // a straight partner: another arm straight on (a taxiway, or across a runway)
      const through = J.A.some(b => b !== a && Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th)))) < 0.09 && b.kind === 'taxi');
      const rwy = J.A.find(b => b.kind === 'rwy');
      if (through && rwy) {
        // across a runway: the line stops at the runway's edge
        const s = Math.abs(a.ux * rwy.uy - a.uy * rwy.ux) || 1; trim.set(key(J.id, a), Math.min(a.len * 0.9, rwy.h / s + 0.02));
      } else if (!through && J.A.some(b => b.kind === 'apron')) trim.set(key(J.id, a), 0);
      else if (!through && n >= 2) trim.set(key(J.id, a), -1);   // (set below from its curves)
    });
    if (J.cross) continue;
    for (let i = 0; i < n; i++) {
      const a = J.A[i], b = J.A[(i + 1) % n], gap = J.gaps[i];
      if (gap >= STRAIGHT || gap < ACUTE || (a.kind !== 'taxi' && b.kind !== 'taxi') || a.kind === 'apron' || b.kind === 'apron') continue;
      const T = a.kind === 'taxi' ? a : b, D = designOf(T.h * 2), tg = Math.tan(gap / 2);
      // (a shallow turn, as off a rapid exit, on a long sweeping curve)
      let Rc = D.Rc * (1 + 3 * Math.pow(Math.max(0, 1 - (Math.PI - gap) / (Math.PI / 2)), 2)); const room = Math.min(a.len, b.len) * 0.85;
      if (Rc / tg > room) Rc = room * tg;
      const t = Rc / tg, N = J.N;
      const P1 = { x: N.x + a.ux * t, y: N.y + a.uy * t }, P2 = { x: N.x + b.ux * t, y: N.y + b.uy * t };
      const bx = a.ux + b.ux, by = a.uy + b.uy, bl = Math.hypot(bx, by) || 1, O = { x: N.x + bx / bl * Rc / Math.sin(gap / 2), y: N.y + by / bl * Rc / Math.sin(gap / 2) };
      G.cl.push({ pts: arcPts(O, Rc, P1, P2), lead: a.kind === 'rwy' || b.kind === 'rwy', turn: true });
      for (const L of [a, b]) if (L.kind === 'taxi') { const k = key(J.id, L); if (trim.get(k) === -1 || trim.get(k) < t) trim.set(k, t); }
    }
  }
  for (const t of G.tw) {
    const ids = t.p.nodes;
    for (let i = 1; i < ids.length; i++) {
      const A = ap.nodes[ids[i - 1]], B = ap.nodes[ids[i]]; if (!A || !B) continue;
      const len = U.dist(A, B); if (len < 1e-3) continue;
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
      let ta = trim.get(ids[i - 1] + '>' + ids[i]), tb = trim.get(ids[i] + '>' + ids[i - 1]);
      ta = ta > 0 ? ta : 0; tb = tb > 0 ? tb : 0;
      // (a bend inside one taxiway: its two legs meet at the curve)
      if (ta + tb >= len - 0.002) continue;
      G.cl.push({ pts: [{ x: A.x + ux * ta, y: A.y + uy * ta }, { x: B.x - ux * tb, y: B.y - uy * tb }], lane: t.lane, part: t.p });
    }
  }
}

/* The openings in apron edges: where a taxiway comes into an apron (not one running along its edge), the stretch of
   edge between the two fillets' tangent points (or the taxiway's own edges where a side has no fillet). The edge line,
   the shoulder and the service road stop there and resume after it. [{ part, N, a, b, n (into the apron) }] */
function mouths(G) {
  const out = [];
  for (const J of G.J) {
    const E = J.A.filter(a => a.kind === 'apron'), T = J.A.filter(a => a.kind === 'taxi' && E.every(e => Math.abs(a.ux * e.ux + a.uy * e.uy) < 0.97));
    if (!E.length || !T.length) continue;
    const N = J.N, reach = e => {
      let d = 0;
      for (const t of T) d = Math.max(d, Math.min(0.6, t.h / (Math.abs(t.ux * e.uy - t.uy * e.ux) || 1)));
      for (const f of G.fil) if (f.f.N === N && (f.f.A === e || f.f.B === e)) { const P = f.f.A === e ? f.f.T1 : f.f.T2; d = Math.max(d, (P.x - N.x) * e.ux + (P.y - N.y) * e.uy); }
      return Math.min(d, e.len);
    };
    const e0 = E[0], d0 = reach(e0), e1 = E[1] || { ux: -e0.ux, uy: -e0.uy, len: d0 }, d1 = E[1] ? reach(e1) : d0;
    // (the apron's side of its edge: the taxiway comes from the other)
    const sg = (T[0].ux * -e0.uy + T[0].uy * e0.ux) > 0 ? -1 : 1;
    out.push({ part: e0.part, N, a: { x: N.x + e0.ux * d0, y: N.y + e0.uy * d0 }, b: { x: N.x + e1.ux * d1, y: N.y + e1.uy * d1 }, n: { x: -e0.uy * sg, y: e0.ux * sg } });
  }
  return out;
}
IC.paveMouths = ap => IC.paveGeom(ap).mouths;

/* The yellow lines on an apron: each row of stands has its taxilane behind the tails (the taxiway along the apron's
   edge where one runs there, else a line of its own, as far in front of the tails as a lead-in turn needs), every
   stand's lead-in line leaves it on a curve either way, and each taxiway coming in carries its centreline on to the
   taxilane and turns onto it either way. Stands with a lead-in of their own (s.via, on an open ramp) keep it. */
const LEAD_R = { s: 0.2, m: 0.3, l: 0.42 };
/* the turn at J from arm a (unit, away from J) onto arm b: the arc of radius R tangent to both */
function turnAt(J, a, b, R) {
  const gap = Math.acos(U.clamp(a.x * b.x + a.y * b.y, -1, 1));
  if (gap >= STRAIGHT || gap < ACUTE) return null;
  const tl = R / Math.tan(gap / 2), bx = a.x + b.x, by = a.y + b.y, bl = Math.hypot(bx, by) || 1, k = R / Math.sin(gap / 2);
  const P1 = { x: J.x + a.x * tl, y: J.y + a.y * tl }, P2 = { x: J.x + b.x * tl, y: J.y + b.y * tl };
  return { tl, P1, P2, pts: arcPts({ x: J.x + bx / bl * k, y: J.y + by / bl * k }, R, P1, P2) };
}
function apronLines(ap, G) {
  const out = [];
  for (const a of G.ar) {
    const p = a.p; if ((p.kind !== 'apron' && p.kind !== 'alert') || !p.stands || !p.stands.length) continue;
    // (the openings aircraft come in by: taxiways into the apron, else any node on its edge)
    const P = a.poly, mo = G.mouths.filter(m => m.part === p).map(m => m.N);
    const ents = mo.length ? mo : G.J.filter(J => J.A.some(e => e.kind === 'apron' && e.part === p)).map(J => J.N);
    // the rows: stands turned the same way with their tails in line
    const rows = new Map();
    for (const s of p.stands) {
      if (s.via && ap.nodes[s.via]) continue;
      const hx = Math.cos(s.a), hy = Math.sin(s.a), k = Math.round(Math.atan2(hy, hx) * 30) + ':' + Math.round((s.fx * hx + s.fy * hy) * 12);
      if (!rows.has(k)) rows.set(k, { h: { x: hx, y: hy }, u: { x: -hy, y: hx }, st: [] });
      rows.get(k).st.push(s);
    }
    const own = [];
    for (const R of rows.values()) {
      const { h, u, st } = R, f0 = st[0], fd = f0.fx * h.x + f0.fy * h.y, ts = st.map(s => s.fx * u.x + s.fy * u.y);
      const r0 = Math.max(...st.map(s => LEAD_R[s.size] || LEAD_R.m)), t0 = Math.min(...ts), t1 = Math.max(...ts);
      // a taxiway running along behind the tails
      let D = null, flow = 0;
      for (const t of G.tw) for (let i = 1; i < t.pts.length; i++) {
        const A = t.pts[i - 1], B = t.pts[i], L = U.dist(A, B); if (L < 0.05) continue;
        const c = ((B.x - A.x) * u.x + (B.y - A.y) * u.y) / L;
        if (Math.abs(c) < 0.985) continue;
        const d = fd - (A.x * h.x + A.y * h.y), ua = A.x * u.x + A.y * u.y, ub = B.x * u.x + B.y * u.y;
        // (a one-way taxiway: aircraft come along it from one side only, and turn in from there)
        if (d > 0.05 && d < 1.3 && Math.max(ua, ub) > t0 - 0.05 && Math.min(ua, ub) < t1 + 0.05 && (D == null || d < D)) { D = d; flow = -Math.sign(c * (t.p.oneway || t.p.flow || 0)); }
      }
      R.mine = D == null;
      if (R.mine) {
        // a line of its own, in front of the tails (no closer to the apron's edge than it is to the tails)
        let room = 3;
        const m = st[Math.floor(st.length / 2)];
        for (let i = 0; i < P.length; i++) { const C = P[i], E = P[(i + 1) % P.length], q = U.segX(m.fx, m.fy, m.fx - h.x * 3, m.fy - h.y * 3, C.x, C.y, E.x, E.y); if (q >= 0) room = Math.min(room, q * 3); }
        D = Math.min(r0, room * 0.55);
        if (D < 0.06) continue;
      }
      R.D = D; R.lo = t0 - r0; R.hi = t1 + r0; R.line = fd - D;
      // the lead-ins: straight from the tail back to the turn, and the turn onto the taxilane: either way where there
      // is room, else from the way aircraft come (along a one-way taxiway, or from the nearest opening)
      const sorted = ts.slice().sort((x, y) => x - y); let gapMin = 9;
      for (let i = 1; i < sorted.length; i++) gapMin = Math.min(gapMin, sorted[i] - sorted[i - 1]);
      for (const s of st) {
        const r = Math.min(LEAD_R[s.size] || LEAD_R.m, D), J = { x: s.fx - h.x * D, y: s.fy - h.y * D };
        const P1 = { x: s.fx - h.x * (D - r), y: s.fy - h.y * (D - r) };
        if (D - r > 0.005) out.push({ pts: [P1, { x: s.fx, y: s.fy }], lane: true, apron: true });
        let sides = [-1, 1];
        if (2 * r > gapMin * 1.02) {
          if (flow) sides = [flow];
          else {
            const tu = s.fx * u.x + s.fy * u.y; let near = null;
            for (const m of ents) { const d = m.x * u.x + m.y * u.y - tu; if (near == null || Math.abs(d) < Math.abs(near)) near = d; }
            sides = [near != null && Math.abs(near) > 0.05 ? Math.sign(near) : 1];
          }
        }
        for (const sg of sides) { const T = turnAt(J, h, { x: u.x * sg, y: u.y * sg }, r); if (T) out.push({ pts: T.pts, lane: true, apron: true, turn: true }); }
      }
      if (R.mine) own.push(R);
    }
    if (!own.length) continue;
    // each taxiway coming in: its centreline on to the nearest taxilane ahead, turning onto it both ways
    for (const J of G.J) {
      if (!J.A.some(e => e.kind === 'apron' && e.part === p)) continue;
      for (const t of J.A) {
        if (t.kind !== 'taxi') continue;
        const v = { x: -t.ux, y: -t.uy }, E = J.N;
        let best = null;
        for (const R of own) {
          const dn = v.x * R.h.x + v.y * R.h.y, off = E.x * R.h.x + E.y * R.h.y - R.line;
          if (Math.abs(dn) > 0.35) { const s = -off / dn; if (s > 0.02 && s < 4 && (!best || s < best.s)) best = { R, s }; }
          else if (Math.abs(off) < 0.25 && (!best || Math.abs(off) < best.s)) best = { R, s: Math.abs(off), along: true };
        }
        if (!best) continue;
        const R = best.R, X = best.along ? { x: E.x - R.h.x * (E.x * R.h.x + E.y * R.h.y - R.line), y: E.y - R.h.y * (E.x * R.h.x + E.y * R.h.y - R.line) } : { x: E.x + v.x * best.s, y: E.y + v.y * best.s };
        const tu = X.x * R.u.x + X.y * R.u.y;
        if (best.along) { if (best.s > 0.005) out.push({ pts: [E, X], lane: true, apron: true }); R.lo = Math.min(R.lo, tu); R.hi = Math.max(R.hi, tu); continue; }
        const rc = Math.min(IC.paveDesign(t.h * 2).Rc, best.s * 0.9);
        let tl = best.s;
        for (const sg of [-1, 1]) {
          const T = turnAt(X, { x: -v.x, y: -v.y }, { x: R.u.x * sg, y: R.u.y * sg }, rc); if (!T) continue;
          out.push({ pts: T.pts, lane: true, apron: true, turn: true }); tl = Math.min(tl, T.tl);
          const e = tu + sg * T.tl; R.lo = Math.min(R.lo, e); R.hi = Math.max(R.hi, e);
        }
        if (best.s - tl > 0.005) out.push({ pts: [E, { x: X.x - v.x * tl, y: X.y - v.y * tl }], lane: true, apron: true });
      }
    }
    // the taxilanes, kept inside the apron
    for (const R of own) {
      const O = { x: R.h.x * R.line, y: R.h.y * R.line }, at = t => ({ x: O.x + R.u.x * t, y: O.y + R.u.y * t });
      const cuts = [], mid = (R.lo + R.hi) / 2, A = at(mid - 60), B = at(mid + 60);
      for (let i = 0; i < P.length; i++) { const C = P[i], E = P[(i + 1) % P.length], q = U.segX(A.x, A.y, B.x, B.y, C.x, C.y, E.x, E.y); if (q >= 0) cuts.push(mid - 60 + q * 120); }
      cuts.sort((x, y) => x - y);
      let lo = R.lo, hi = R.hi;
      for (let i = 1; i < cuts.length; i++) if (cuts[i - 1] <= mid && mid <= cuts[i]) { lo = Math.max(lo, cuts[i - 1] + 0.02); hi = Math.min(hi, cuts[i] - 0.02); }
      if (hi - lo > 0.05) out.push({ pts: [at(lo), at(hi)], lane: true, apron: true, taxilane: true });
    }
  }
  return out;
}
IC.paveApronLines = ap => IC.paveGeom(ap).cl.filter(c => c.apron);

/* every junction by its kind, for the audit and the pictures: 'end' (a taxiway at a runway's end), 'entry' (onto a
   runway at about a right angle), 'rapid' (onto a runway at an acute angle), 'apron' (onto an apron edge), 'X' (a
   crossing), 'T', 'Y' (a fork with an acute angle between two arms), 'bend' (one taxiway turning) */
IC.paveJoins = function (ap) {
  const G = IC.paveGeom(ap), out = [];
  for (const J of G.J) {
    if (J.A.length < 2) continue;
    const rw = J.A.find(a => a.kind === 'rwy'), taxi = J.A.filter(a => a.kind === 'taxi');
    let type;
    if (rw) {
      const r = rw.part, Lr = IC.rwLen(r), t = IC.rwT(r, J.N) * Lr;
      const acute = taxi.some(a => { const c = Math.abs(a.ux * rw.ux + a.uy * rw.uy); return c > 0.64 && c < 0.985; });
      type = t < 0.6 || t > Lr - 0.6 ? 'end' : acute ? 'rapid' : 'entry';
    } else if (J.A.some(a => a.kind === 'apron')) type = 'apron';
    else if (J.A.length === 2) type = 'bend';
    else if (J.cross || J.A.length >= 4) type = 'X';
    else type = J.gaps.some(g => g < 1.05) ? 'Y' : 'T';
    out.push({ id: J.id, x: J.N.x, y: J.N.y, type, J });
  }
  return out;
};

/* what is on top at a point, in the order the pavement is painted: 'rwy' (a runway or its shoulder, over everything
   that meets it), 'taxi' (a taxiway, fillet or junction), 'apron', or null */
IC.paveLayer = function (ap, x, y) {
  const G = IC.paveGeom(ap);
  for (const r of G.rw) { const t = (x - r.a.x) * r.d.x + (y - r.a.y) * r.d.y, o = (x - r.a.x) * -r.d.y + (y - r.a.y) * r.d.x; if (t >= 0 && t <= r.L && Math.abs(o) <= r.w / 2 + (r.mat === 'grass' ? 0 : IC.rwShoulder(r.w))) return 'rwy'; }
  const m = IC.paveAt(ap, x, y);
  if (!m) return null;
  // (an apron is painted over the taxiways that come into it: one slab, no taxiway stroke laid across it)
  for (const a of G.ar) if (U.inPoly(x, y, a.poly.map(v => [v.x, v.y]))) return 'apron';
  return 'taxi';
};

/* a fast test for pavement within r of x, y (what IC.paveAt counts, the pieces far away left out): for walking
   along a line a step at a time */
IC.paveNear = function (ap, x, y, r) {
  const G = IC.paveGeom(ap), near = P => P.some(q => Math.abs(q.x - x) < r + 1 && Math.abs(q.y - y) < r + 1);
  const rw = G.rw.filter(q => U.segDist(x, y, q.a.x, q.a.y, q.b.x, q.b.y) < r + q.w);
  const segs = []; for (const t of G.tw) for (let i = 1; i < t.pts.length; i++) if (U.segDist(x, y, t.pts[i - 1].x, t.pts[i - 1].y, t.pts[i].x, t.pts[i].y) < r + t.w) segs.push([t.pts[i - 1], t.pts[i], t.w / 2]);
  const polys = G.ar.map(a => a.poly).concat(G.fil.map(f => f.poly), IC.paveChamfers(ap, 0).map(f => f.poly), IC.paveHubs(ap, 0).map(h => h.poly)).filter(near).map(P => P.map(v => [v.x, v.y]));
  return (px, py) => rw.some(q => { const t = (px - q.a.x) * q.d.x + (py - q.a.y) * q.d.y, o = (px - q.a.x) * -q.d.y + (py - q.a.y) * q.d.x; return t >= 0 && t <= q.L && Math.abs(o) <= q.w / 2; })
    || segs.some(([A, B, h]) => U.segDist(px, py, A.x, A.y, B.x, B.y) <= h) || polys.some(P => U.inPoly(px, py, P));
};

/* the pavement under a point: 'conc', 'asph', 'rconc', 'grass' or null (the fillets count; buildings do not) */
IC.paveAt = function (ap, x, y) {
  const G = IC.paveGeom(ap);
  for (const r of G.rw) { const t = (x - r.a.x) * r.d.x + (y - r.a.y) * r.d.y, o = (x - r.a.x) * -r.d.y + (y - r.a.y) * r.d.x; if (t >= 0 && t <= r.L && Math.abs(o) <= r.w / 2) return r.mat; }
  // (square ends: the hubs fill the junctions)
  for (const t of G.tw) for (let i = 1; i < t.pts.length; i++) {
    const A = t.pts[i - 1], B = t.pts[i], L = U.dist(A, B); if (L < 1e-6) continue;
    const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, s = (x - A.x) * ux + (y - A.y) * uy, o = (x - A.x) * -uy + (y - A.y) * ux;
    if (s >= -1e-6 && s <= L + 1e-6 && Math.abs(o) <= t.w / 2 + 1e-6) return t.mat;
  }
  for (const a of G.ar) if (U.inPoly(x, y, a.poly.map(v => [v.x, v.y]))) return a.mat;
  for (const f of G.fil) if (U.inPoly(x, y, f.poly.map(v => [v.x, v.y]))) return f.mat;
  for (const f of IC.paveChamfers(ap, 0)) if (U.inPoly(x, y, f.poly.map(v => [v.x, v.y]))) return f.mat;
  for (const f of IC.paveHubs(ap, 0)) if (U.inPoly(x, y, f.poly.map(v => [v.x, v.y]))) return f.mat;
  return null;
};

})(window.IC);
