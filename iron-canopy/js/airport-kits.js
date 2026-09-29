/* Iron Canopy — terminal kits and blueprints made from them (brief 45). The complex shapes real airports have, built
   only from the general parts (terminal outlines, outline aprons with stands placed on them, taxilanes, people
   movers, landside roads and car parks), as layouts in the same form airports-real.js builds from map data:
   - a round terminal or rotunda with stands fanned round it, bridges to its wall, on an apron that follows the curve
     and a taxilane ring round it;
   - a satellite: the same, joined to a terminal by a people mover;
   - a curved pier, and a semicircular terminal (stands on its outer face, its landside inside the curve);
   - straight, T, Y and X piers from a round hub;
   and five blueprints with fictional names ("after …"), laid out from those kits with their runways, taxiways and
   landside: a round terminal with satellites and tubes, round airsides on a people mover, semicircles along a spine
   road, midfield concourses on a train, and long concourses.
   The build bar places a kit like a blueprint (IC.bldKitCheck, IC.bldKit); the Blueprints tab and the showcase list
   the blueprints (IC.REAL_APT, with bp: true). Headless. */
(function (IC) {
'use strict';
const U = IC.U;
const r3 = v => Math.round(v * 1000) / 1000;
const flat = P => { const o = []; for (const q of P) o.push(r3(q.x), r3(q.y)); return o; };
const pt = (x, y) => ({ x, y });
const polar = (c, r, a) => ({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
const LANE_W = 0.2, LANE_OFF = 0.12, WALL = 0.06, MARGIN = 0.14;
/* an arc's points from a0 to a1 (radians, either way) at radius r, about every 5° */
function arc(c, r, a0, a1, step) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (step || 0.09))), out = [];
  for (let i = 0; i <= n; i++) out.push(polar(c, r, a0 + (a1 - a0) * i / n));
  return out;
}
/* a band between two radii over an angle: an annular sector's outline */
const band = (c, r0, r1, a0, a1) => arc(c, r1, a0, a1).concat(arc(c, r0, a1, a0));

/* ---------- a layout being written ---------- */
IC.layoutBuilder = function () {
  const L = { runways: [], nodes: [], taxi: [], aprons: [], stands: [], blds: [], bridges: [], movers: [], roads: [], parks: [], junctions: [], service: [] };
  const idx = new Map(), key = q => Math.round(q.x * 200) + ',' + Math.round(q.y * 200);
  const B = {
    L,
    // (points within half a metre are one node, so chains that share a point meet there)
    node(q) { const k = key(q); if (idx.has(k)) return idx.get(k); L.nodes.push([r3(q.x), r3(q.y)]); idx.set(k, L.nodes.length - 1); return L.nodes.length - 1; },
    at(i) { const q = L.nodes[i]; return pt(q[0], q[1]); },
    taxi(pts, o) { const n = []; for (const q of pts) { const i = B.node(q); if (n[n.length - 1] !== i) n.push(i); } if (n.length > 1) L.taxi.push(Object.assign({ n }, o || {})); return n; },
    lane(pts, o) { return B.taxi(pts, Object.assign({ lane: 1, w: LANE_W }, o || {})); },
    apron(P, o) { L.aprons.push(Object.assign({ poly: flat(P) }, o || {})); return L.aprons.length - 1; },
    stand(ai, c, h, size, via, ref) { L.stands.push({ ap: ai, x: r3(c.x), y: r3(c.y), h: r3(h), size, via, ref: ref || null }); },
    bld(kind, P, o) { L.blds.push(Object.assign({ kind, poly: flat(P) }, o || {})); return L.blds.length - 1; },
    box(kind, c, a, w, h, o) { const ca = Math.cos(a), sa = Math.sin(a), W = (x, y) => pt(c.x + x * ca - y * sa, c.y + x * sa + y * ca); return B.bld(kind, [W(-w / 2, -h / 2), W(w / 2, -h / 2), W(w / 2, h / 2), W(-w / 2, h / 2)], o); },
    round(kind, c, r, o) { return B.bld(kind, arc(c, r, 0, Math.PI * 2 - 0.13, 0.13), Object.assign({ arc: [r3(c.x), r3(c.y), 0, r, 0, Math.PI * 2] }, o)); },
    mover(pts, stops, lv, name) { L.movers.push({ pts: flat(pts), stops, lv: lv == null ? -1 : lv, name }); },
    road(pts, o) { L.roads.push(Object.assign({ pts: flat(pts), w: 0.12, lv: 0 }, o || {})); },
    park(P, kind, o) { L.parks.push(Object.assign({ poly: flat(P), kind: kind || 'park' }, o || {})); },
    // a runway from a to b, its ends named by their headings
    runway(a, b, w, o) {
      const brg = ((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI) + 360) % 360, nm = h => String(Math.round(h / 10) % 36 || 36).padStart(2, '0') + ((o && o.sfx) || ['', ''])[h === brg ? 0 : 1];
      L.runways.push({ a: [r3(a.x), r3(a.y)], b: [r3(b.x), r3(b.y)], w: w || 0.45, ends: [nm(brg), nm((brg + 180) % 360)], hdg: brg, ils: (o && o.ils) || ['a', 'b'], mat: 'conc' });
    }
  };
  return B;
};

/* ---------- the kits ---------- */
/* A round terminal (a rotunda or a satellite pod) at c, radius R: stands fanned round its wall between a0 and a1
   (all round when the span is a full turn), noses to the wall so each gets a bridge; an apron in four curved pieces
   that follows it; a taxilane ring beyond the stands. Returns the ring's nodes by angle, to join taxiways to. */
IC.kitRound = function (B, o) {
  const c = o.c, R = o.R, S0 = IC.STAND[o.size || 'm'], a0 = o.a0 != null ? o.a0 : 0, a1 = o.a1 != null ? o.a1 : Math.PI * 2;
  const full = a1 - a0 >= Math.PI * 2 - 1e-6, rs = R + WALL + S0.d / 2, rl = R + WALL + S0.d + LANE_OFF, ro = rl + MARGIN;
  const term = o.noTerm ? null : B.round('terminal', c, R, { name: o.name, roof: o.roof || 'dome', lvls: 2 });
  // (stands spaced so their inner corners clear each other)
  const step = 2 * Math.asin(Math.min(0.99, (S0.w / 2 + 0.01) / (R + WALL))) , span = full ? Math.PI * 2 : a1 - a0;
  const n = Math.max(1, Math.floor((full ? span : span - step * 0.2) / step)), da = span / n;
  const angs = []; for (let i = 0; i < n; i++) angs.push(a0 + da * (i + (full ? 0 : 0.5)));
  // the apron: quarter bands (an outline cannot have a hole), or one band over the span
  const aps = [];
  const pieces = full ? 4 : Math.max(1, Math.ceil(span / (Math.PI / 2)));
  for (let k = 0; k < pieces; k++) { const b0 = a0 + span * k / pieces - (full ? 0 : k ? 0 : 0.12), b1 = a0 + span * (k + 1) / pieces + (full ? 0 : k === pieces - 1 ? 0.12 : 0); aps.push({ i: B.apron(band(c, R - 0.04, ro, b0, b1), { name: o.apName }), b0, b1 }); }
  // the taxilane ring (or arc), a node at every stand's lead-in and every 10° between
  const ringA = new Set(angs.map(a => r3(a)));
  const lp = [];
  if (full) { for (let k = 0; k < 36; k++) ringA.add(r3(a0 + k * Math.PI / 18)); }
  else { for (let a = a0 - 0.1; a <= a1 + 0.1 + 1e-9; a += Math.PI / 18) ringA.add(r3(a)); ringA.add(r3(a0 - 0.1)); ringA.add(r3(a1 + 0.1)); }
  const ring = [...ringA].sort((x, y) => x - y).filter(a => full || (a >= a0 - 0.1 - 1e-6 && a <= a1 + 0.1 + 1e-6)).map(a => ({ a, q: polar(c, rl, a) }));
  for (const r of ring) lp.push(r.q);
  if (full) lp.push(ring[0].q);
  const nodes = B.lane(lp, { name: o.laneName });
  ring.forEach(r => { r.n = B.node(r.q); });
  angs.forEach((a, i) => {
    const ap = aps.find(p => a >= p.b0 - 1e-6 && a <= p.b1 + 1e-6) || aps[0];
    B.stand(ap.i, polar(c, rs, a), a + Math.PI, o.size || 'm', B.node(polar(c, rl, a)), o.ref ? o.ref(i) : null);
  });
  return { ring, nodes, term, R, rl, ro, stands: n };
};
/* a curved pier or a semicircular terminal: the building a band round c between Rc − bw and Rc + bw from a0 to a1;
   stands on its outer face (and its inner one if o.inner), each with a bridge; aprons that follow the curve; a
   taxilane arc beyond each row, its ends run on 60 m past the building */
IC.kitCurve = function (B, o) {
  const c = o.c, Rc = o.Rc, bw = o.bw || 0.22, S0 = IC.STAND[o.size || 'm'], a0 = o.a0, a1 = o.a1, out = { lanes: [] };
  out.term = B.bld('terminal', band(c, Rc - bw, Rc + bw, a0, a1), { name: o.name, roof: o.roof || 'arc', lvls: 2, arc: [r3(c.x), r3(c.y), Rc - bw, Rc + bw, a0, a1] });
  const side = (sg) => {
    const wall = Rc + sg * bw, rs = wall + sg * (WALL + S0.d / 2), rl = wall + sg * (WALL + S0.d + LANE_OFF), ro = rl + sg * MARGIN;
    if (rl < 0.4) return;
    const tipR = Math.max(0.15, (S0.d + 0.1)) / Math.max(0.3, Math.abs(rl));
    const e0 = o.sa0 != null ? o.sa0 - 0.08 : a0 - tipR - 0.03, e1 = o.sa1 != null ? o.sa1 + 0.08 : a1 + tipR + 0.03;
    const ai = B.apron(band(c, Math.min(wall - sg * 0.04, ro), Math.max(wall - sg * 0.04, ro), e0, e1), { name: o.apName });
    // stands along the wall, spaced by their span at the narrowest point of the fan
    const b0 = o.sa0 != null ? o.sa0 : a0, b1 = o.sa1 != null ? o.sa1 : a1;
    const rn = sg > 0 ? wall + WALL : Math.max(0.3, wall - WALL - S0.d), step = (S0.w + 0.02) / rn, n = Math.max(1, Math.floor((b1 - b0) / step)), da = (b1 - b0) / n;
    const angs = []; for (let i = 0; i < n; i++) angs.push(b0 + da * (i + 0.5));
    const t0 = b0 - (o.sa0 != null ? 0.05 : tipR), t1 = b1 + (o.sa1 != null ? 0.05 : tipR);
    const la = new Set(angs.map(r3)); for (let a = t0; a <= t1 + 1e-9; a += Math.PI / 24) la.add(r3(a)); la.add(r3(t0)); la.add(r3(t1));
    const lp = [...la].sort((x, y) => x - y).map(a => polar(c, rl, a));
    out.lanes.push({ sg, pts: lp, n: B.lane(lp), ends: [lp[0], lp[lp.length - 1]], rl });
    for (const a of angs) B.stand(ai, polar(c, rs, a), sg > 0 ? a + Math.PI : a, o.size || 'm', B.node(polar(c, rl, a)));
  };
  side(1); if (o.inner) side(-1);
  return out;
};
/* a straight pier from p0 to p1, bw either side of its spine, with stands along both faces (or one) from s0 along
   it, bridges to its walls, aprons, and a taxilane along each face run on past its tip and round it. Returns the
   lanes (their ends are where taxiways join) */
IC.kitPier = function (B, o) {
  const p0 = o.p0, p1 = o.p1, L = U.dist(p0, p1), ux = (p1.x - p0.x) / L, uy = (p1.y - p0.y) / L, nx = -uy, ny = ux, bw = o.bw || 0.22, S0 = IC.STAND[o.size || 'm'];
  const W = (s, t) => pt(p0.x + ux * s + nx * t, p0.y + uy * s + ny * t), out = { lanes: [], tip: [] };
  if (!o.noTerm) out.term = B.bld('terminal', [W(0, -bw), W(L, -bw), W(L, bw), W(0, bw)], { name: o.name, roof: o.roof, lvls: 2 });
  const ext = o.tip != null ? o.tip : 0.6, sides = o.sides || [1, -1];
  for (const sg of sides) {
    const wall = sg * bw, sd = sg * (bw + WALL + S0.d / 2), ld = sg * (bw + WALL + S0.d + LANE_OFF), od = sg * (bw + WALL + S0.d + LANE_OFF + MARGIN);
    const s0 = (o.s0 && o.s0[sg]) || 0, sEnd = L + ext, sStart = o.lane0 && o.lane0[sg] != null ? o.lane0[sg] : -ext;
    out.aprons = out.aprons || {};
    const ai = out.aprons[sg] = B.apron([W(Math.max(-ext - 0.14, sStart - 0.14), wall - sg * 0.04), W(sEnd + 0.14, wall - sg * 0.04), W(sEnd + 0.14, od), W(Math.max(-ext - 0.14, sStart - 0.14), od)], { name: o.apName });
    const n = Math.max(0, Math.floor((L - s0 - (o.s1 || 0)) / (S0.w + 0.02))), gap = (L - s0 - (o.s1 || 0) - n * (S0.w + 0.02)) / 2;
    const ss = []; for (let i = 0; i < n; i++) ss.push(s0 + gap + (S0.w + 0.02) * (i + 0.5));
    const lp = [W(sStart, ld)]; for (const s of ss) lp.push(W(s, ld)); lp.push(W(L, ld), W(sEnd, ld));
    out.lanes.push({ sg, pts: lp, n: B.lane(lp), ends: [lp[0], lp[lp.length - 1]] });
    for (const s of ss) B.stand(ai, W(s, sd), Math.atan2(-ny * sg, -nx * sg), o.size || 'm', B.node(W(s, ld)));
  }
  // round the tip: the two lanes joined across it
  if (sides.length === 2 && !o.openTip) { const a = W(L + ext, bw + WALL + S0.d + LANE_OFF), b = W(L + ext, -(bw + WALL + S0.d + LANE_OFF)); out.tip = B.lane([a, W(L + ext, 0), b]); }
  if (sides.length === 2 && o.cap0) { const a = W(-ext, bw + WALL + S0.d + LANE_OFF), b = W(-ext, -(bw + WALL + S0.d + LANE_OFF)); out.cap0 = B.lane([a, W(-ext, 0), b]); }
  // (paved across the tip, where the lanes join round it)
  const od = bw + WALL + S0.d + LANE_OFF + MARGIN;
  if (out.tip && out.tip.length) B.apron([W(L - 0.02, -od), W(L + ext + MARGIN, -od), W(L + ext + MARGIN, od), W(L - 0.02, od)]);
  if (out.cap0) B.apron([W(-ext - MARGIN, -od), W(0.02, -od), W(0.02, od), W(-ext - MARGIN, od)]);
  out.W = W; out.off = bw + WALL + S0.d + LANE_OFF;
  return out;
};
/* piers from a round hub at c: arms at the given angles (T, Y, X and the rest), each from the hub's wall to len.
   Where two arms face each other at less than a straight line, their taxilanes meet at a corner and the stands start
   beyond it, so none stands in the corner */
IC.kitStar = function (B, o) {
  const c = o.c, S0 = IC.STAND[o.size || 'm'], bw = o.bw || 0.22, hubR = o.hubR || bw * 1.9, off = bw + WALL + S0.d + LANE_OFF;
  const arms = o.arms.map(a => ({ a: U.angWrap(a.a), len: a.len, conn: a.conn })).sort((x, y) => x.a - y.a), out = { arms: [], hub: null };
  out.hub = B.round('terminal', c, hubR, { name: o.name, roof: 'dome', lvls: 2 });
  const n = arms.length;
  // for each arm and side (+1 left, −1 right of its direction): where its lane starts and where its stands start
  for (const A of arms) { A.lane0 = { 1: 0, [-1]: 0 }; A.s0 = { 1: 0.05, [-1]: 0.05 }; A.corner = {}; }
  for (let i = 0; i < n; i++) {
    const A = arms[i], Bm = arms[(i + 1) % n];
    let gap = Bm.a - A.a; if (i === n - 1) gap += Math.PI * 2;
    if (gap > Math.PI - 0.05) continue;   // (a straight side or wider: the lanes run on past the hub)
    // A's left lane and B's right lane meet off the hub on the bisector
    const d = off / Math.sin(gap / 2), bis = A.a + gap / 2, I = polar(c, d, bis), along = off / Math.tan(gap / 2) - hubR;
    A.lane0[1] = along; Bm.lane0[-1] = along; A.corner[1] = I; Bm.corner[-1] = I;
    A.s0[1] = Math.max(0.05, along + S0.w / 2 + 0.05); Bm.s0[-1] = Math.max(0.05, along + S0.w / 2 + 0.05);
  }
  for (const A of arms) {
    const p0 = polar(c, hubR, A.a), p1 = polar(c, hubR + A.len, A.a);
    const P = IC.kitPier(B, { p0, p1, bw, size: o.size, s0: A.conn ? { 1: A.len, [-1]: A.len } : A.s0, lane0: A.lane0, tip: 0.6, openTip: !!A.conn, name: o.armName ? o.armName(A) : undefined, noTerm: false });
    out.arms.push(Object.assign(P, { A }));
  }
  // the straight (or wider) sides: the two lanes meet past the hub in a curve round it
  for (let i = 0; i < n; i++) {
    const A = arms[i], Bm = arms[(i + 1) % n];
    let gap = Bm.a - A.a; if (i === n - 1) gap += Math.PI * 2;
    if (gap <= Math.PI - 0.05) continue;
    // (from where A's left lane starts at the hub's wall to where B's right lane starts: straight across a straight
    // side, round the hub on a wider one)
    const sA = polar(polar(c, hubR, A.a), off, A.a + Math.PI / 2), sB = polar(polar(c, hubR, Bm.a), off, Bm.a - Math.PI / 2);
    const r = U.dist(sA, c), a0 = Math.atan2(sA.y - c.y, sA.x - c.x); let a1 = Math.atan2(sB.y - c.y, sB.x - c.x); while (a1 < a0) a1 += Math.PI * 2;
    if (Math.abs(gap - Math.PI) < 0.1) { B.lane([sA, sB]); const m = { x: (sA.x + sB.x) / 2, y: (sA.y + sB.y) / 2 }, ux = (sB.x - sA.x) / U.dist(sA, sB), uy = (sB.y - sA.y) / U.dist(sA, sB), q = (s, t) => pt(m.x + ux * s - uy * t, m.y + uy * s + ux * t), h = U.dist(sA, sB) / 2; B.apron([q(-h, -MARGIN), q(h, -MARGIN), q(h, off - hubR * 0.3), q(-h, off - hubR * 0.3)]); continue; }
    B.lane(arc(c, r, a0, a1, 0.15));
    B.apron(band(c, hubR - 0.04, r + MARGIN, a0 - 0.05, a1 + 0.05));
  }
  return out;
};

/* ---------- the build bar's kits: what each is, and its layout at the origin, facing east ---------- */
IC.TERM_KITS = {
  rotunda: { name: 'Round terminal', desc: 'A round building with stands fanned all round it, each with a jet bridge to its wall, on an apron that follows the curve and a taxilane ring round it. Join the ring to your taxiways.', make: (B, o) => IC.kitRound(B, { c: pt(0, 0), R: o.size === 'l' ? 1.1 : 0.8, size: o.size }) },
  satellite: { name: 'Satellite', desc: 'A round pod of gates on its own apron, reached from a terminal by a people mover under the apron. Place it, then draw the people mover to it from the terminal (Terminals tab).', make: (B, o) => IC.kitRound(B, { c: pt(0, 0), R: o.size === 'l' ? 0.7 : 0.5, size: o.size, name: 'Satellite' }) },
  curved: { name: 'Curved pier', desc: 'A pier on an arc with gates on both faces, the aprons and taxilanes following it.', make: (B, o) => IC.kitCurve(B, { c: pt(0, 4), Rc: 4, a0: -Math.PI / 2 - 0.55, a1: -Math.PI / 2 + 0.55, size: o.size, inner: true, name: 'Curved pier' }) },
  semicircle: { name: 'Semicircular terminal', desc: 'A terminal on a half circle, gates round its outer face, its kerb road and car parks inside the curve: passengers park a short walk from their gate.', make: (B, o) => semiLand(B, IC.kitCurve(B, { c: pt(0, 0), Rc: 2.2, bw: 0.24, a0: -Math.PI, a1: 0, size: o.size, name: 'Semicircular terminal' }), pt(0, 0), 2.2 - 0.24, -Math.PI, 0) },
  pierT: { name: 'T pier', desc: 'A pier that splits into two at its end, gates along every face, from a round hub.', make: (B, o) => IC.kitStar(B, { c: pt(0, 0), size: o.size, arms: [{ a: Math.PI, len: 1.6, conn: true }, { a: -Math.PI / 2, len: 2.6 }, { a: Math.PI / 2, len: 2.6 }] }) },
  pierY: { name: 'Y pier', desc: 'A pier that forks at its end into two arms at 70°, gates along every face.', make: (B, o) => IC.kitStar(B, { c: pt(0, 0), size: o.size, arms: [{ a: Math.PI, len: 1.6, conn: true }, { a: -0.61, len: 2.8 }, { a: 0.61, len: 2.8 }] }) },
  pierX: { name: 'X airside', desc: 'Four piers from a round hub, gates along every face: an airside reached by a people mover.', make: (B, o) => IC.kitStar(B, { c: pt(0, 0), size: o.size, arms: [0.79, 2.36, 3.93, 5.5].map(a => ({ a, len: 2.2 })) }) }
};
/* the landside inside a semicircle: its kerb road on the inner face, a car park in the middle, the road out */
function semiLand(B, K, c, rIn, a0, a1) {
  B.road(arc(c, rIn - 0.14, a0 + 0.04, a1 - 0.04), { kind: 'kerb', oneway: 1, w: 0.14, name: 'Terminal kerb' });
  B.road([polar(c, rIn - 0.14, a0 + 0.04), pt(c.x - rIn + 0.14, c.y + 0.9)], { kind: 'out', w: 0.12 });
  B.road([polar(c, rIn - 0.14, a1 - 0.04), pt(c.x + rIn - 0.14, c.y + 0.9)], { kind: 'out', w: 0.12 });
  B.park(band(c, 0.25, rIn - 0.34, a0 + 0.35, a1 - 0.35), 'park', { name: 'Car park' });
  return K;
}
/* a kit's layout (at the origin, facing east) */
IC.kitLayout = function (key, o) {
  const K = IC.TERM_KITS[key]; if (!K) return null;
  const B = IC.layoutBuilder(); K.make(B, o || {});
  B.L.key = key; B.L.name = K.name; B.L.kit = true;
  return B.L;
};

/* ---------- blueprints ---------- */
/* a runway from a to b with its parallel taxiway off to one side (off, signed: + is to the left of a → b), links
   to the runway at both ends and at the stations given (distances from a), the parallel carrying a node at every
   station and every join (joins: distances where other taxiways meet it). Returns where a distance along it is. */
function runwayPar(B, o) {
  const a = o.a, b = o.b, L = U.dist(a, b), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
  const W = (s, t) => pt(a.x + ux * s + nx * t, a.y + uy * s + ny * t);
  B.runway(a, b, o.w || 0.45, { sfx: o.sfx });
  const links = [0, L].concat(o.links || []), st = new Set(links.concat(o.joins || []).map(r3));
  const ss = [...st].filter(v => v >= -1e-6 && v <= L + 1e-6).sort((x, y) => x - y);
  B.taxi(ss.map(v => W(v, o.off)), { name: o.name });
  for (const v of links) B.taxi([W(v, 0), W(v, o.off)]);
  return { W, L, par: s2 => W(s2, o.off) };
}
/* the landside in front of a terminal face: a one-way kerb loop, garages and car parks behind it, and the road out
   (from the face at distance 0 outwards along n, the face running along u for len, centred at c) */
function frontLand(B, c, u, len, out, o) {
  o = o || {};
  const n = { x: -u.y * out, y: u.x * out }, W = (s, t) => pt(c.x + u.x * s + n.x * t, c.y + u.y * s + n.y * t), h = len / 2;
  B.road([W(-h + 0.2, 0.2), W(h - 0.2, 0.2)], { kind: 'kerb', oneway: 1, w: 0.14, name: 'Departures kerb' });
  B.road([W(h - 0.2, 0.2), W(h + 0.25, 0.2), W(h + 0.25, 1.9), W(-h - 0.25, 1.9), W(-h - 0.25, 0.2), W(-h + 0.2, 0.2)], { kind: 'loop', oneway: 1, w: 0.12, name: 'Terminal loop' });
  B.park([W(-h + 0.15, 0.4), W(-0.1, 0.4), W(-0.1, 1.05), W(-h + 0.15, 1.05)], 'garage', { lvls: 5, name: 'Garage' });
  B.park([W(0.1, 0.4), W(h - 0.15, 0.4), W(h - 0.15, 1.05), W(0.1, 1.05)], 'garage', { lvls: 5, name: 'Garage' });
  B.park([W(-h + 0.15, 1.2), W(h - 0.15, 1.2), W(h - 0.15, 1.75), W(-h + 0.15, 1.75)], 'park', { name: 'Car park' });
  const far = W(o.outS || 0, o.outT || 6);
  B.road([W(o.outS || 0, 1.9), far], { kind: 'out', w: 0.16, name: o.road || 'Airport road' });
  B.L.exits = (B.L.exits || []).concat([[r3(far.x), r3(far.y)]]);
  B.L.junctions.push([r3(W(o.outS || 0, 1.9).x), r3(W(o.outS || 0, 1.9).y)], [r3(W(h - 0.2, 0.2).x), r3(W(h - 0.2, 0.2).y)], [r3(W(-h + 0.2, 0.2).x), r3(W(-h + 0.2, 0.2).y)]);
}
/* join a point to the nearest node of a list of kit ring or lane points with a taxilane */
const nearest = (list, q) => list.reduce((b, p) => (!b || U.dist(p, q) < U.dist(b, q) ? p : b), null);

/* the support area every blueprint has: a cargo shed with its apron and stands, two hangars on the cargo lane, a fuel
   farm, the tower, an approach radar, a ground radar and two fire stations; laid out at c along u (the cargo lane
   on the +n side, joined to the points in o.join) */
function support(B, c, u, o) {
  const n = { x: -u.y, y: u.x }, W = (s, t) => pt(c.x + u.x * s + n.x * t, c.y + u.y * s + n.y * t), a = Math.atan2(u.y, u.x);
  const S0 = IC.STAND.m, face = 0.4, sd = face + WALL + S0.d / 2, ld = face + WALL + S0.d + LANE_OFF, od = ld + MARGIN;
  const shed = B.box('cargo', W(0, 0), a, 3, 0.8, { name: 'Cargo centre' });
  const ai = B.apron([W(-1.6, face - 0.04), W(1.6, face - 0.04), W(1.6, od), W(-1.6, od)], { zone: 'cargo', name: 'Cargo apron' });
  const ss = [-1.2, -0.7, -0.2, 0.3, 0.8, 1.3];
  const lane = [W(-4.2, ld), W(-3.4, ld), W(-2.4, ld), W(-1.6, ld)].concat(ss.map(x => W(x, ld)), [W(1.6, ld), W(o.east || 2.2, ld)]);
  B.lane(lane, { w: 0.23 });
  for (const x of ss) B.stand(ai, W(x, sd), a - Math.PI / 2 * (n.y * Math.cos(a) - n.x * Math.sin(a) > 0 ? 1 : -1), 'm', B.node(W(x, ld)));
  // (stands nose to the shed: their heading points along −n)
  const st = B.L.stands.slice(-ss.length); for (const q of st) q.h = r3(Math.atan2(-n.y, -n.x));
  // hangars on the lane beyond the shed, doors to it
  B.box('hangar', W(-3.4, ld - 0.2 - 0.275 - 0.05 - 0.12), a, 0.7, 0.55, { name: 'Hangar' });
  B.box('hangar', W(-2.4, ld - 0.2 - 0.275 - 0.05 - 0.12), a, 0.7, 0.55, { name: 'Hangar' });
  // behind the shed: fuel, tower, radars, a fire station; another fire station by the lane's far end
  // (the tanks 150 m apart, so one burning does not set fire to the next)
  for (const [x, y] of [[-1.6, -1.1], [-0.1, -1.1], [2.9, -1.1]]) { const q = W(x, y); B.L.blds.push({ kind: 'fuel', c: [r3(q.x), r3(q.y)], name: 'Fuel farm' }); }
  B.box('tower', W(1.2, -1.1), a, 0.14, 0.14, { name: 'Tower' });
  B.box('atc', W(2.0, -1.2), a, 0.12, 0.12, { name: 'Approach radar' });
  B.box('gradar', W(1.6, -0.9), a, 0.1, 0.1, { name: 'Ground radar' });
  B.box('hydrant', W(0.7, -1.6), a, 0.24, 0.18, { name: 'Hydrant fuel system' });
  B.box('fire', W(-3.0, -0.6), a, 0.28, 0.2, { name: 'Fire station' });
  if (o.fire2) B.box('fire', o.fire2, a, 0.28, 0.2, { name: 'Fire station' });
  for (const [from, to] of o.join || []) B.taxi(from === 'w' ? [W(-4.2, ld), to] : [W(o.east || 2.2, ld), to]);
  return { w: W(-4.2, ld), e: W(o.east || 2.2, ld), W, ld };
}

IC.BLUEPRINTS = {
  /* a round terminal in the middle, its landside inside a ring road, six round satellites round it reached by tubes
     under the apron; two parallel runways, north and south */
  ring: {
    name: 'Anneau International', after: 'after Paris–Charles de Gaulle Terminal 1', icao: 'XRNG',
    make(B) {
      const c = pt(0, 0), D = 4.3, R0 = 1.0;
      const main = B.round('terminal', c, R0, { name: 'Terminal 1', roof: 'dome', lvls: 3 });
      const angs = [180, -144, -108, -72, -36, 0].map(d => d * Math.PI / 180), sats = [];
      angs.forEach((a, k) => {
        const sc = polar(c, D, a), toC = a + Math.PI;
        const K = IC.kitRound(B, { c: sc, R: 0.45, size: 'm', a0: toC + 0.75, a1: toC + Math.PI * 2 - 0.75, name: `Satellite ${k + 1}`, ref: i => `${k + 1}${String(i + 1).padStart(2, '0')}` });
        sats.push({ K, sc, a });
        B.mover([polar(c, R0 - 0.05, a), polar(sc, 0.4, toC)], [main, K.term], -1, `Tube ${k + 1}`);
      });
      // the outer ring taxiway joining every satellite's ring and the parallels, one node wherever something joins it
      const Ro = D + 1.25 + 0.75, joinA = [];
      // (every angle rounded once, so a join lands on the ring's own node)
      const nrm = a => r3(((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), onRing = a => polar(c, Ro, nrm(a));
      for (const S of sats) { const q = nearest(S.K.ring.map(r => r.q), polar(c, Ro, S.a)); S.q = q; S.ja = Math.atan2(q.y - c.y, q.x - c.x); joinA.push(S.ja); }
      const up = [-3.5, 0, 3.5].map(dx => ({ dx, a: Math.atan2(-Math.sqrt(Ro * Ro - dx * dx), dx) })), dn = [-3.5, 3.5].map(dx => ({ dx, a: Math.atan2(Math.sqrt(Ro * Ro - dx * dx), dx) }));
      for (const q of up.concat(dn)) joinA.push(q.a);
      const ringA = new Set(joinA.map(nrm));
      for (let d = 0; d < 360; d += 10) ringA.add(r3(d * Math.PI / 180));
      const RA = [...ringA].sort((x, y) => x - y);
      B.taxi(RA.map(onRing).concat([onRing(RA[0])]), { name: 'Ring' });
      for (const S of sats) B.taxi([S.q, onRing(S.ja)]);
      const N = runwayPar(B, { a: pt(-19, -9.4), b: pt(19, -9.4), off: 1.9, links: [5, 9.5, 19, 28.5, 33], joins: [19 - 3.5, 19, 19 + 3.5, 19 + 15.0], name: 'A' });
      const Sr = runwayPar(B, { a: pt(-19, 9.4), b: pt(19, 9.4), off: -1.9, links: [5, 9.5, 19, 28.5, 33], joins: [19 - 3.5, 19 + 3.5, 19 + 15.0], name: 'B' });
      for (const q of up) B.taxi([N.par(19 + q.dx), onRing(q.a)]);
      for (const q of dn) B.taxi([Sr.par(19 + q.dx), onRing(q.a)]);
      // the landside: a ring road round the terminal, car parks, and the road out in a tunnel under the south side
      B.road(arc(c, R0 + 0.2, Math.PI / 2, Math.PI / 2 + Math.PI * 2), { kind: 'loop', oneway: 1, w: 0.14, name: 'Terminal ring road' });
      B.park(band(c, R0 + 0.45, R0 + 1.35, 0.3, Math.PI / 2 - 0.2), 'garage', { lvls: 4, name: 'Car park' });
      B.park(band(c, R0 + 0.45, R0 + 1.35, Math.PI / 2 + 0.2, Math.PI - 0.3), 'garage', { lvls: 4, name: 'Car park' });
      B.park(band(c, R0 + 0.45, R0 + 1.35, -Math.PI + 0.3, -0.3), 'park', { name: 'Car park' });
      B.road([polar(c, R0 + 0.2, Math.PI / 2), pt(0, 2.6)], { kind: 'out', w: 0.16 });
      B.road([pt(0, 2.6), pt(0, 12.4)], { kind: 'out', w: 0.16, lv: -1, name: 'Access tunnel' });
      B.road([pt(0, 12.4), pt(0, 15)], { kind: 'out', w: 0.16, name: 'Airport road' });
      B.L.exits = [[0, 15]]; B.L.junctions.push([0, r3(R0 + 0.2)], [0, 2.6], [0, 12.4]);
      const Sp = support(B, pt(11.2, 0.6), { x: 1, y: 0 }, { east: 2.4, join: [['w', onRing(RA.find(a => Math.abs(a) < 1e-6) || 0)]], fire2: pt(-11, 0) });
      B.taxi([Sp.e, pt(15.0, Sp.e.y), N.par(19 + 15.0)]);
      B.taxi([pt(15.0, Sp.e.y), Sr.par(19 + 15.0)]);
    }
  },
  /* a landside terminal with four airsides round it on people movers: two round, two X-shaped; runways east and west */
  hub: {
    name: 'Bayshore International', after: 'after Tampa International', icao: 'XBAY',
    make(B) {
      const T = B.box('terminal', pt(0, 0), 0, 5.6, 1.4, { name: 'Main terminal', lvls: 3 });
      const air = [{ c: pt(-7.0, -5.0), kind: 'round' }, { c: pt(-2.8, -6.2), kind: 'x' }, { c: pt(2.8, -6.2), kind: 'x' }, { c: pt(7.0, -5.0), kind: 'round' }];
      air.forEach((A, k) => {
        const toT = Math.atan2(0 - A.c.y, 0 - A.c.x), nm = `Airside ${'ACEF'[k]}`;
        if (A.kind === 'round') { const K = IC.kitRound(B, { c: A.c, R: 0.55, size: 'm', a0: toT + 0.7, a1: toT + Math.PI * 2 - 0.7, name: nm }); A.term = K.term; A.pts = K.ring.map(r => r.q); }
        else { const K = IC.kitStar(B, { c: A.c, size: 'm', hubR: 0.42, arms: [toT + Math.PI / 2, toT + Math.PI, toT - Math.PI / 2].map(a => ({ a, len: 1.6 })).concat([{ a: toT, len: 1.0, conn: true }]), name: nm }); A.term = K.hub; A.pts = [].concat(...K.arms.map(x => x.lanes.map(l => l.ends).flat())); }
        // the shuttle on its viaduct from the terminal's airside face
        B.mover([pt(A.c.x * 0.3, -0.7), polar(A.c, A.kind === 'round' ? 0.5 : 0.38, toT)], [T, A.term], 1, `Shuttle to ${U.lc(nm)}`);
      });
      // runways east and west with their parallels; a taxiway north of the airsides and one between them and the terminal
      const W = runwayPar(B, { a: pt(-12.5, 17), b: pt(-12.5, -17), off: 2.2, links: [5, 11, 17, 23, 29], joins: [17 + 9.4, 17 + 2.4], name: 'W' });
      const E = runwayPar(B, { a: pt(12.5, 17), b: pt(12.5, -17), off: -2.2, links: [5, 11, 17, 23, 29], joins: [17 + 9.4, 17 + 2.4], name: 'E' });
      const tops = air.map(A => { const q = nearest(A.pts, pt(A.c.x, -9.4)); return { A, q, x: A.kind === 'round' ? A.c.x : q.x }; });
      B.taxi([W.par(17 + 9.4)].concat(tops.map(t => pt(t.x, -9.4)).sort((a, b) => a.x - b.x), [E.par(17 + 9.4)]), { name: 'N' });
      for (const t of tops) B.taxi([t.q, pt(t.x, -9.4)]);
      const bots = air.filter(A => A.kind === 'round').map(A => ({ A, q: nearest(A.pts, pt(A.c.x, -2.4)) }));
      B.taxi([W.par(17 + 2.4)].concat(bots.map(b => pt(b.A.c.x, -2.4)).sort((a, b) => a.x - b.x), [E.par(17 + 2.4)]), { name: 'M' });
      for (const b of bots) B.taxi([b.q, pt(b.A.c.x, -2.4)]);
      // (the X airsides' lower lanes down to the middle taxiway too)
      for (const A of air.filter(q => q.kind === 'x')) { const q = nearest(A.pts, pt(A.c.x + (A.c.x < 0 ? -1.5 : 1.5), -2.4)); void q; }
      frontLand(B, pt(0, 0.7), { x: 1, y: 0 }, 5.6, 1, { outT: 16.3 });
      support(B, pt(-5.0, 6.0), { x: 1, y: 0 }, { east: 2.2, join: [['w', W.par(17 - 6.9)]], fire2: pt(7, 3.2) });
      B.L.taxi.push({ n: [B.node(W.par(17 - 6.9)), B.node(W.W(17 - 6.9, 0))] });
    }
  },
  /* four semicircular terminals along a spine road, each its own kerb and parking inside the curve; runways east and
     west */
  spine: {
    name: 'Prairie International', after: 'after Dallas–Fort Worth', icao: 'XPRA',
    make(B) {
      const Rc = 2.0, bw = 0.24, rIn = Rc - bw, lanes = [];
      B.road([pt(0, -17), pt(0, 17)], { kind: 'out', w: 0.2, name: 'Spine road' });
      B.L.exits = [[0, -17], [0, 17]];
      for (const [cx, yk, side, k] of [[0.35, -3.6, 1, 'A'], [0.35, 3.6, 1, 'C'], [-0.35, -3.6, -1, 'B'], [-0.35, 3.6, -1, 'D']]) {
        const c = pt(cx, yk), a0 = side > 0 ? -Math.PI / 2 : Math.PI / 2, a1 = side > 0 ? Math.PI / 2 : Math.PI * 1.5;
        const K = IC.kitCurve(B, { c, Rc, bw, a0, a1, sa0: a0 + 0.42, sa1: a1 - 0.42, size: 'm', name: `Terminal ${k}` });
        lanes.push({ K, side, c });
        // the kerb inside the curve, joined to the spine at both ends; a car park in the middle
        const kb = arc(c, rIn - 0.14, a0 + 0.06, a1 - 0.06);
        B.road(kb, { kind: 'kerb', oneway: 1, w: 0.14, name: `Terminal ${k} kerb` });
        B.road([kb[kb.length - 1], pt(0, kb[kb.length - 1].y)], { kind: 'loop', w: 0.12 });
        B.road([pt(0, kb[0].y), kb[0]], { kind: 'loop', w: 0.12 });
        B.L.junctions.push([0, r3(kb[0].y)], [0, r3(kb[kb.length - 1].y)]);
        B.park(band(c, 0.5, rIn - 0.34, a0 + 0.3, a1 - 0.3), 'park', { name: `Car park ${k}` });
      }
      // each terminal's taxilane to its runway's parallel at both ends
      const Sup = support(B, pt(5.2, 10.4), { x: 1, y: 0 }, { east: 4.3, fire2: pt(-6, -10) });
      const ends = { 1: [Sup.e], [-1]: [] };
      for (const { K, side } of lanes) for (const e of K.lanes[0].ends) ends[side].push(e);
      const E = runwayPar(B, { a: pt(11.5, 17), b: pt(11.5, -17), off: -2, links: [4, 10, 17, 24, 30], joins: ends[1].map(e => 17 - e.y), name: 'E' });
      const Wr = runwayPar(B, { a: pt(-11.5, -17), b: pt(-11.5, 17), off: -2, links: [4, 10, 17, 24, 30], joins: ends[-1].map(e => e.y + 17), name: 'W' });
      for (const e of ends[1]) B.taxi([e, E.par(17 - e.y)]);
      for (const e of ends[-1]) B.taxi([e, Wr.par(e.y + 17)]);
    }
  },
  /* midfield concourses side by side between two pairs of runways, a train under them from the landside terminal */
  midfield: {
    name: 'Magnolia International', after: 'after Hartsfield–Jackson Atlanta', icao: 'XMAG',
    make(B) {
      const xs = [0, 3.8, 7.6, 11.4, 15.2], names = ['T', 'A', 'B', 'C', 'D'], con = [];
      const T = B.box('terminal', pt(-6, 0), Math.PI / 2, 6, 2.2, { name: 'Terminal', lvls: 3 });
      xs.forEach((x, i) => { const P = IC.kitPier(B, { p0: pt(x, -5), p1: pt(x, 5), bw: 0.24, size: 'm', cap0: true, name: `Concourse ${names[i]}` }); con.push(P); });
      B.mover([pt(-4.9, 0), pt(15.2, 0)], [T].concat(con.map(c => c.term)), -1, 'Plane train');
      const off = 0.24 + 0.06 + 0.5 + 0.12;
      const par = (y, o2, nm) => runwayPar(B, { a: pt(-19, y), b: pt(21, y), off: o2, links: [4, 9, 14, 20, 26, 31, 36], joins: [].concat(...xs.map(x => [x + 19 - off, x + 19 + off])).concat([19 + 19.6]), name: nm });
      const N = par(-8.6, 2, 'N'), Sp = par(8.6, -2, 'S');
      // the outer runways of each pair, joined to the inner ones at the ends
      B.runway(pt(-19, -11.2), pt(21, -11.2), 0.45, { sfx: ['R', 'L'] }); B.runway(pt(-19, 11.2), pt(21, 11.2), 0.45, { sfx: ['L', 'R'] });
      for (const x of [-19, -15, -10, -5, 1, 7, 12, 17, 21]) { B.taxi([pt(x, -8.6), pt(x, -11.2)]); B.taxi([pt(x, 8.6), pt(x, 11.2)]); }
      // the concourses' taxilanes onto the parallels at both ends
      for (const x of xs) for (const dx of [-off, off]) { B.taxi([pt(x + dx, -5.6), pt(x + dx, -6.6)]); B.taxi([pt(x + dx, 5.6), pt(x + dx, 6.6)]); }
      frontLand(B, pt(-7.1, 0), { x: 0, y: 1 }, 6, 1, { outT: 11.5 });
      support(B, pt(19.6, 2.0), { x: 0, y: -1 }, { east: 2.0, join: [['e', N.par(19 + 19.6)]], fire2: pt(-10, -5) });
      B.taxi([pt(19.6 + 0.4 + WALL + 0.5 + LANE_OFF, 2.0 + 4.2), Sp.par(19 + 19.6)]);
      void Sp;
    }
  },
  /* two long concourses of wide-body gates between two runways, a train from the terminal to both */
  long: {
    name: 'Gulf International', after: 'after Dubai International', icao: 'XGLF',
    make(B) {
      const T = B.box('terminal', pt(-10.4, 0.5), Math.PI / 2, 7, 2.4, { name: 'Terminal 3', lvls: 3, roof: 'glass' });
      const Bc = IC.kitPier(B, { p0: pt(-6.5, -2.2), p1: pt(7.5, -2.2), bw: 0.26, size: 'l', cap0: true, name: 'Concourse B' });
      const Ac = IC.kitPier(B, { p0: pt(-5, 3.4), p1: pt(5, 3.4), bw: 0.26, size: 'l', cap0: true, name: 'Concourse A' });
      B.mover([pt(-9.1, -2.2), pt(0.5, -2.2), pt(0.5, 3.4)], [T, Bc.term, Ac.term], -1, 'Airport train');
      const off = 0.26 + 0.06 + 0.8 + 0.12;
      const N = runwayPar(B, { a: pt(-20, -8.4), b: pt(22, -8.4), off: 1.9, links: [5, 10, 16, 21, 26, 32, 37], joins: [-7.1 + 20, 8.1 + 20, 0.5 + 20, 13 + 20], name: 'N' });
      const Sp = runwayPar(B, { a: pt(-20, 9.4), b: pt(22, 9.4), off: -1.9, links: [5, 10, 16, 21, 26, 32, 37], joins: [-5.6 + 20, 5.6 + 20, 0 + 20, 13 + 20], name: 'S' });
      B.taxi([pt(-7.1, -2.2 - off), N.par(-7.1 + 20)]); B.taxi([pt(8.1, -2.2 - off), N.par(8.1 + 20)]); B.taxi([pt(0.5, -2.2 - off), N.par(0.5 + 20)]);
      B.taxi([pt(-5.6, 3.4 + off), Sp.par(-5.6 + 20)]); B.taxi([pt(5.6, 3.4 + off), Sp.par(5.6 + 20)]); B.taxi([pt(0, 3.4 + off), Sp.par(0 + 20)]);
      // (the inner lanes, B's south and A's north, joined round both ends)
      B.taxi([pt(-7.1, -2.2 + off), pt(-7.1, 0.6), pt(-5.6, 0.6), pt(-5.6, 3.4 - off)]); B.taxi([pt(8.1, -2.2 + off), pt(8.1, 0.6), pt(5.6, 0.6), pt(5.6, 3.4 - off)]);
      frontLand(B, pt(-11.6, 0.5), { x: 0, y: 1 }, 7, 1, { outT: 8.4 });
      support(B, pt(13, 1.2), { x: 1, y: 0 }, { east: 2.4, join: [['w', pt(8.1, 0.6)]], fire2: pt(-14, -5) });
      B.taxi([pt(13 + 2.4, 1.2 + 0.4 + WALL + 0.5 + LANE_OFF), N.par(13 + 20)]); B.taxi([pt(13 + 2.4, 1.2 + 0.4 + WALL + 0.5 + LANE_OFF), Sp.par(13 + 20)]);
    }
  }
};
for (const [key, D] of Object.entries(IC.BLUEPRINTS)) {
  const B = IC.layoutBuilder(); D.make(B);
  IC.REAL_APT[key] = Object.assign(B.L, { key, name: D.name, after: D.after, icao: D.icao, bp: true });
}

})(window.IC);
