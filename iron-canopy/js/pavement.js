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
const ang = (x, y) => Math.atan2(y, x);

/* what the pavement looks like depends on: every paved part built, where it is, its material and width */
IC.paveSig = function (ap) {
  let s = ap.parts.length + ':' + ap.nodeN;
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
      const d = IC.rwDir(rw), Lr = IC.rwLen(rw), t = IC.rwT(rw, n) * Lr;
      if (t < Lr - 0.05) out.push({ ux: d.x, uy: d.y, h: rw.w / 2, len: Lr - t, kind: 'rwy', part: rw, mat: IC.paveOf(rw) });
      if (t > 0.05) out.push({ ux: -d.x, uy: -d.y, h: rw.w / 2, len: t, kind: 'rwy', part: rw, mat: IC.paveOf(rw) });
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
  if (gap >= STRAIGHT || gap < 0.03 || straightX) return null;
  if (A.kind !== 'taxi' && B.kind !== 'taxi') return null;
  const T = A.kind === 'taxi' && (B.kind !== 'taxi' || A.h >= B.h) ? A : B, D = designOf(T.h * 2);
  // the edges facing each other: A's on its counter-clockwise side, B's on its clockwise side
  const nA = { x: -A.uy, y: A.ux }, nB = { x: B.uy, y: -B.ux };
  const hA = A.h + e, hB = B.h + e;
  const pA = { x: N.x + nA.x * hA, y: N.y + nA.y * hA }, pB = { x: N.x + nB.x * hB, y: N.y + nB.y * hB };
  const den = A.ux * B.uy - A.uy * B.ux; if (Math.abs(den) < 1e-6) return null;
  const s = ((pB.x - pA.x) * B.uy - (pB.y - pA.y) * B.ux) / den;
  const C = { x: pA.x + A.ux * s, y: pA.y + A.uy * s };
  // (a corner behind the node along either arm, as where a narrow taxiway leaves a wide runway at a shallow angle,
  // lies over the other arm's pavement: nothing to fill there)
  if ((C.x - N.x) * A.ux + (C.y - N.y) * A.uy < 0 || (C.x - N.x) * B.ux + (C.y - N.y) * B.uy < 0) return null;
  // the turn is π − gap; the main gear cuts in by the track-in, less on a gentle turn
  const turn = Math.PI - gap, tin = (D.Rc - Math.sqrt(Math.max(0, D.Rc * D.Rc - D.d * D.d))) * Math.min(1, turn / (Math.PI / 2));
  let R = Math.max(0.01, D.Rc - T.h - tin) - e;
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
function junctions(ap) {
  const legs = legsOf(ap), out = [];
  for (const id of legs.keys()) {
    const N = ap.nodes[id], A = arms(ap, id, legs);
    if (A.length < 2) { out.push({ id, N, A, gaps: [], cross: false }); continue; }
    const gaps = A.map((a, i) => { const b = A[(i + 1) % A.length]; let g = b.th - a.th; if (i === A.length - 1) g += 2 * Math.PI; return g; });
    // a straight crossing: four or more arms, every one continued straight through by another
    const cross = A.length >= 4 && A.every(a => A.some(b => b !== a && Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th)))) < 0.09));
    out.push({ id, N, A, gaps, cross });
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
    else if (p.kind === 'apron' || p.kind === 'alert' || (IC.APART[p.kind] && IC.APART[p.kind].pad)) { const P = IC.partOutline(p); G.ar.push({ p, poly: P, mat: IC.PAVED[p.kind] ? IC.paveOf(p) : 'conc', a: p.a || 0, pad: !IC.PAVED[p.kind] }); for (const q of P) grow(q.x, q.y, 1); }
    else if ((p.kind === 'terminal' || p.kind === 'cargo') && p.x != null && !p.noApron) {
      // a terminal or shed stands on a forecourt that meets the apron
      const P = p.poly ? IC.polyGrow(IC.partOutline(p), 0.15) : IC.partOutline(Object.assign({}, p, { w: p.w + 0.3, h: p.h + 0.3, poly: null }));
      G.ar.push({ p, poly: P, mat: 'conc', a: p.a || 0, fore: true }); for (const q of P) grow(q.x, q.y, 1);
    }
  }
  G.bb = x0 < x1 ? { x0, y0, x1, y1 } : null;
  G.J = junctions(ap);
  G.fil = IC.paveFillets(ap, 0);
  centrelines(ap, G);
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
      if (gap >= STRAIGHT || gap < 0.2 || (a.kind !== 'taxi' && b.kind !== 'taxi') || a.kind === 'apron' || b.kind === 'apron') continue;
      const T = a.kind === 'taxi' ? a : b, D = designOf(T.h * 2), tg = Math.tan(gap / 2);
      let Rc = D.Rc; const room = Math.min(a.len, b.len) * 0.85;
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

/* the pavement under a point: 'conc', 'asph', 'rconc', 'grass' or null (the fillets count; buildings do not) */
IC.paveAt = function (ap, x, y) {
  const G = IC.paveGeom(ap);
  for (const r of G.rw) { const t = (x - r.a.x) * r.d.x + (y - r.a.y) * r.d.y, o = (x - r.a.x) * -r.d.y + (y - r.a.y) * r.d.x; if (t >= 0 && t <= r.L && Math.abs(o) <= r.w / 2) return r.mat; }
  for (const t of G.tw) for (let i = 1; i < t.pts.length; i++) if (U.segDist(x, y, t.pts[i - 1].x, t.pts[i - 1].y, t.pts[i].x, t.pts[i].y) <= t.w / 2 + 1e-6) return t.mat;
  for (const a of G.ar) if (U.inPoly(x, y, a.poly.map(v => [v.x, v.y]))) return a.mat;
  for (const f of G.fil) if (U.inPoly(x, y, f.poly.map(v => [v.x, v.y]))) return f.mat;
  return null;
};

})(window.IC);
