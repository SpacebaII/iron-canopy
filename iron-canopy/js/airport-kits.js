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
    const ai = B.apron(band(c, Math.min(wall - sg * 0.04, ro), Math.max(wall - sg * 0.04, ro), a0 - tipR - 0.03, a1 + tipR + 0.03), { name: o.apName });
    // stands along the wall, spaced by their span at the narrowest point of the fan
    const rn = sg > 0 ? wall + WALL : Math.max(0.3, wall - WALL - S0.d), step = (S0.w + 0.02) / rn, n = Math.max(1, Math.floor((a1 - a0) / step)), da = (a1 - a0) / n;
    const angs = []; for (let i = 0; i < n; i++) angs.push(a0 + da * (i + 0.5));
    const la = new Set(angs.map(r3)); for (let a = a0 - tipR; a <= a1 + tipR + 1e-9; a += Math.PI / 24) la.add(r3(a)); la.add(r3(a0 - tipR)); la.add(r3(a1 + tipR));
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

})(window.IC);
