/* Iron Canopy — whole pieces (round 1, docs/focus/round-1.md). The build bar opens on pieces an airport is made of,
   each placed, turned and stretched, then built as one plan with one price, and undone as one:
   - Runway with taxiways: the runway, a parallel taxiway, links at both ends, a holding entry at each end, two rapid
     exits and a landing system at each end (two clicks, its ends, or a drag; R puts the taxiway on the other side);
   - terminals with their apron and stands: straight, with a pier, round (from the terminal kits in airport-kits.js);
   - Services: tower, fire station and fuel farm, laid out beside the runway and outside its strip;
   - Cargo area: a cargo shed with its apron and stands;
   - Starter airport (Blueprints): all of it, on the surveyed runway or on one already planned.
   A piece is a layout (airport-kits.js's builder) planned through the blueprint path (IC.bldBlueprint); a piece that
   attaches to the airport (a terminal, the cargo area) is joined to the nearest taxiway by short links planned with
   it. Placing is builder.js (planOf asks IC.piecePlan); the ghost is render-airport.js's blueprint drawing. Headless. */
(function (IC) {
'use strict';
const U = IC.U;
const pt = (x, y) => ({ x, y });
const PAR = 1.9;          // the parallel taxiway, 190 m from the runway centreline
const LANE_GAP = 1.0;     // a terminal's taxilane, 100 m beyond the parallel
const STRIP = 1.5;        // the runway strip: 150 m either side of the centreline, kept clear of buildings

/* the runway with its taxiways, along x from −L/2 to L/2, the parallel on the +y side; stations: where other
   taxiways join the parallel (a terminal's lane ends) */
function runwaySet(B, L, o) {
  o = o || {};
  const h = L / 2, hold = Math.min(1.2, L * 0.05), ex = Math.min(L * 0.55, 17), dx = PAR / Math.tan(Math.PI / 6);
  const stations = new Set([-h, h, -(h - hold), h - hold].concat(o.joins || []));
  // (rapid exits from the far side of the middle, angled 30° toward the way the landing rolls)
  const exA = h - ex, exB = -h + ex;
  if (L >= 18) { stations.add(exA - dx); stations.add(exB + dx); }
  if (o.runway !== false) B.runway(pt(-h, 0), pt(h, 0), 0.45, { ils: ['a', 'b'] });
  if (o.parallel !== false) {
    B.taxi([...stations].filter(x => x >= -h - 1e-6 && x <= h + 1e-6).sort((a, b) => a - b).map(x => pt(x, PAR)), { name: 'A' });
    for (const x of [-h, h, -(h - hold), h - hold]) B.taxi([pt(x, 0), pt(x, PAR)]);
    if (L >= 18) { B.taxi([pt(exA, 0), pt(exA - dx, PAR)]); B.taxi([pt(exB, 0), pt(exB + dx, PAR)]); }
  }
}
/* a straight terminal along x, centred at (0, y0), its stands on the −y face (toward the runway), its taxilane
   beyond them; returns the lane's two ends */
function straightTerm(B, y0, n, size) {
  const S0 = IC.STAND[size || 'm'], Lt = n * (S0.w + 0.02) + 0.1;
  const P = IC.kitPier(B, { p0: pt(-Lt / 2, y0), p1: pt(Lt / 2, y0), bw: 0.3, size: size || 'm', sides: [-1], tip: 0.6, name: 'Terminal' });
  return { ends: P.lanes[0].ends, lane: y0 - P.off, Lt };
}
/* the services beside a runway, on the +y side at y (centre line of the row), from x: fire station, tower, fuel */
function services(B, x, y) {
  B.box('fire', pt(x - 1.5, y), 0, 1.0, 0.6, { name: 'Fire station' });
  B.box('tower', pt(x, y + 0.15), 0, 0.3, 0.3, { name: 'Control tower' });
  B.box('fuel', pt(x + 2.1, y + 0.35), 0, 1.5, 1.0, { name: 'Fuel farm' });
}

IC.PIECES = {
  rwkit: { name: 'Runway with taxiways', line: true, use: 'land, take off and taxi: all of it',
    desc: 'Click one end, then the other (or drag): a concrete runway with a parallel taxiway 190 m beside it, links at both ends, a holding entry at each end, two rapid exits, edge lights and a landing system (ILS) at each end, so fog does not close it. R puts the taxiway on the other side. Build (or Enter) plans it all.',
    make: o => { const B = IC.layoutBuilder(); runwaySet(B, o.len); return B.L; } },
  tstraight: { name: 'Terminal with apron', use: 'passengers, with stands at its gates',
    desc: 'A terminal with a row of stands along its face, each with a jet bridge, on its own apron with a taxilane in front. Click beside the parallel taxiway: it faces the runway and joins the nearest taxiway by itself. R turns it.',
    make: o => { const B = IC.layoutBuilder(), T = straightTerm(B, 0, o.n || 6, o.size); B.L.joins = T.ends; return B.L; } },
  tpier: { name: 'Terminal with a pier', use: 'gates on both sides of a pier',
    desc: 'A terminal with a pier reaching toward the runway, stands on both faces, the taxilanes round its tip. Click it in place: its tip joins the nearest taxiway by itself. R turns it.',
    make: o => { const B = IC.layoutBuilder(); B.box('terminal', pt(0, 0.45), 0, 2.6, 0.7, { name: 'Terminal', lvls: 2 });
      const P = IC.kitPier(B, { p0: pt(0, 0.1), p1: pt(0, -2.6), bw: 0.22, size: o.size || 'm', tip: 0.6, lane0: { 1: 0.1, [-1]: 0.1 }, s0: { 1: 0.15, [-1]: 0.15 }, name: 'Pier' });
      B.L.joins = [P.W(2.7 + 0.6, 0)]; return B.L; } },
  tround: { name: 'Round terminal', use: 'gates fanned round a round building',
    desc: 'A round terminal with stands all round it, each with a jet bridge, and a taxilane ring. Click it in place: the ring joins the nearest taxiway by itself.',
    make: o => { const B = IC.layoutBuilder(), K = IC.kitRound(B, { c: pt(0, 0), R: 0.8, size: o.size || 'm', name: 'Round terminal' });
      const j = K.ring.reduce((b, r) => (!b || r.q.y < b.y ? r.q : b), null); B.L.joins = [j]; return B.L; } },
  services: { name: 'Services', use: 'tower, fire station and fuel farm',
    desc: 'A control tower (one movement every 2 min instead of every 8), a fire station whose trucks reach the runway in under 3 minutes (airliners need it) and a fuel farm, in a row beside the runway, outside its 150 m strip. Click beside the runway.',
    make: () => { const B = IC.layoutBuilder(); services(B, 0, 0); return B.L; } },
  cargoarea: { name: 'Cargo area', use: 'freighters load and unload',
    desc: 'A cargo shed with four freighter stands on its own apron and a taxilane, joined to the nearest taxiway by itself. Freighters fly at night and pay for their cargo.',
    make: () => { const B = IC.layoutBuilder(), S0 = IC.STAND.l, face = 0.4, WALL = 0.06;
      B.box('cargo', pt(0, 0), 0, 3.2, 0.8, { name: 'Cargo terminal' });
      const sd = -(face + WALL + S0.d / 2), ld = -(face + WALL + S0.d + 0.12), od = ld - 0.14;
      const ai = B.apron([pt(-1.8, -face + 0.04), pt(1.8, -face + 0.04), pt(1.8, od), pt(-1.8, od)], { zone: 'cargo', name: 'Cargo apron' });
      const xs = [-1.2, -0.4, 0.4, 1.2]; B.lane([pt(-2.3, ld)].concat(xs.map(x => pt(x, ld)), [pt(2.3, ld)]), { w: 0.23 });
      for (const x of xs) B.stand(ai, pt(x, sd), Math.PI / 2, 'l', B.node(pt(x, ld)));
      B.L.joins = [pt(-2.3, ld), pt(2.3, ld)]; return B.L; } },
  starter: { name: 'Starter airport', bp: true, use: 'a whole small airport, ready for jets',
    desc: 'A complete airport as one plan: a 3 km runway with its taxiways and a landing system at each end, a terminal with eight stands, a control tower, a fire station and a fuel farm. On a new airport it lies on the surveyed runway; with a runway already planned it is built round it. One price, paid as the work runs; Undo takes all of it back before work starts.',
    make: o => {
      const B = IC.layoutBuilder(), L = o.len || 30, n = 8;
      const S0 = IC.STAND.m, Lt = n * (S0.w + 0.02) + 0.1, ld = 0.3 + 0.06 + S0.d + 0.12, y0 = PAR + LANE_GAP + ld;
      const ends = [-Lt / 2 - 0.6, Lt / 2 + 0.6];
      runwaySet(B, L, { runway: o.runway, parallel: o.parallel, joins: ends });
      straightTerm(B, y0, n, 'm');
      for (const x of ends) if (o.parallel !== false) B.taxi([pt(x, y0 - ld), pt(x, PAR)]);
      if (o.parallel === false) B.L.joins = ends.map(x => pt(x, y0 - ld));
      services(B, Lt / 2 + 3.4, PAR + 1.4);
      return B.L;
    } }
};
for (const k in IC.PIECES) IC.PIECES[k].piece = true;

/* the runway nearest a point (built or planned), with the point's offset from its centreline and its angle */
function nearRunway(ap, p) {
  let best = null;
  for (const rw of ap.parts) {
    if (rw.kind !== 'runway') continue;
    const L = IC.rwLen(rw), d = IC.rwDir(rw), t = U.clamp(IC.rwT(rw, p), 0, 1), q = IC.rwAt(rw, t), off = (p.x - rw.a.x) * -d.y + (p.y - rw.a.y) * d.x;
    const dist = U.dist(p, q);
    if (!best || dist < best.dist) best = { rw, L, d, t, q, off, dist, a: Math.atan2(d.y, d.x), mid: IC.rwAt(rw, 0.5) };
  }
  return best;
}
IC.pieceNearRunway = nearRunway;
/* a parallel taxiway on one side (sg: +1 left of a → b): a taxiway whose every node lies 1–3 km... (100–300 m) off the
   centreline on that side, along most of its length */
function hasParallel(ap, rw, sg) {
  const d = IC.rwDir(rw), L = IC.rwLen(rw);
  return ap.parts.some(q => {
    if (q.kind !== 'taxi' || q.nodes.length < 2) return false;
    const N = q.nodes.map(id => ap.nodes[id]).filter(Boolean); if (N.length < 2) return false;
    const off = N.map(n => ((n.x - rw.a.x) * -d.y + (n.y - rw.a.y) * d.x) * sg), along = N.map(n => (n.x - rw.a.x) * d.x + (n.y - rw.a.y) * d.y);
    return off.every(v => v > 0.9 && v < 3.2) && Math.max(...along) - Math.min(...along) > L * 0.6;
  });
}
/* the nearest point on the airport's taxiways (built or planned) to a join, by a straight link that crosses no runway
   and no building, within 2.5 km: { from, to, len } or null */
function joinOf(S, ap, J, skip) {
  let best = null;
  for (const q of ap.parts) {
    if (q.kind !== 'taxi' || (skip && skip.has(q.id))) continue;
    for (let i = 1; i < q.nodes.length; i++) {
      const a = ap.nodes[q.nodes[i - 1]], b = ap.nodes[q.nodes[i]]; if (!a || !b) continue;
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = L2 ? U.clamp(((J.x - a.x) * (b.x - a.x) + (J.y - a.y) * (b.y - a.y)) / L2, 0, 1) : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, len = U.dist(J, p);
      if (len < 0.05 || len > 25 || (best && len >= best.len)) continue;
      // (never across a runway: a link that would cross one is no link)
      if (ap.parts.some(r => r.kind === 'runway' && segX(J, p, r.a, r.b))) continue;
      best = { from: { x: J.x, y: J.y }, to: p, len };
    }
  }
  return best;
}
const segX = (p1, p2, p3, p4) => {
  const d = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};

/* where the piece goes for the cursor at hv, and its layout: { L, x, y, rot, why, join, ils } */
function placeOf(S, m, hv) {
  const ap = m.ap, K = IC.PIECES[m.part], size = m.size === 'l' ? 'l' : 'm';
  const city = IC.cities(S).slice().sort((p, q) => U.dist(p, ap) - U.dist(q, ap))[0];
  const toCity = (x, y, a) => city ? ((city.x - x) * -Math.sin(a) + (city.y - y) * Math.cos(a)) >= 0 : true;
  // the runway piece: two ends; its taxiway on the city's side unless R put it on the other
  if (K.line) {
    const pts = m.pts.slice(); if (!m.set && pts.length < 2) pts.push(hv);
    if (pts.length < 2) return { why: '' };
    const a0 = pts[0], b0 = pts[1], len = Math.round(U.dist(a0, b0) * 10) / 10;
    if (len < 12) return { why: `Too short: ${IC.bldLen(len)}. Airliners need at least 2.1 km; 3 km takes every one.`, len };
    const a = Math.atan2(b0.y - a0.y, b0.x - a0.x), cx = (a0.x + b0.x) / 2, cy = (a0.y + b0.y) / 2;
    let rot = a; if (toCity(cx, cy, rot) === !!m.flip) rot += Math.PI;
    const key = 'rw' + len;
    return { L: lay(m, key, () => K.make({ len })), x: cx, y: cy, rot, len };
  }
  // the starter airport: on the surveyed runway, or round the nearest runway already there
  if (m.part === 'starter') {
    const nr = nearRunway(ap, hv);
    if (nr && nr.dist < 40) {
      const sg = nr.off >= 0 ? 1 : -1, rot = nr.a + (sg > 0 ? 0 : Math.PI), par = hasParallel(ap, nr.rw, sg);
      return { L: lay(m, `st${nr.L.toFixed(1)}${par}`, () => K.make({ len: nr.L, runway: false, parallel: !par })), x: nr.mid.x, y: nr.mid.y, rot, around: nr.rw, par };
    }
    const sv = ap.survey && U.dist(ap.survey, hv) < 40 ? ap.survey : null, at = sv || hv;
    let rot = sv ? sv.a : (m.rot || 0); if (!toCity(at.x, at.y, rot) !== !!m.flip) rot += Math.PI;
    return { L: lay(m, 'st30', () => K.make({ len: 30 })), x: at.x, y: at.y, rot, onSurvey: !!sv };
  }
  // everything else at the cursor, its face to the nearest runway (R turns it by hand)
  const L = lay(m, m.part + size, () => K.make({ size }));
  let rot = m.rot || 0;
  const nr = nearRunway(ap, hv);
  if (nr && !m.rotHand) { const sg = nr.off >= 0 ? 1 : -1; rot = nr.a + (sg > 0 ? 0 : Math.PI); }
  let x = hv.x, y = hv.y;
  // services stand outside the runway strip, the fire station's far side 160 m from the centreline at least
  if (m.part === 'services' && nr && nr.dist < 6 && !m.rotHand) { const sg = nr.off >= 0 ? 1 : -1, n = { x: -nr.d.y * sg, y: nr.d.x * sg }, want = STRIP + 0.6; if (Math.abs(nr.off) < want) { x += n.x * (want - Math.abs(nr.off)); y += n.y * (want - Math.abs(nr.off)); } }
  return { L, x, y, rot };
}
const lay = (m, key, make) => { if (m._pcK !== key) { m._pcK = key; m._pcL = make(); m._pcL.kit = true; m._pcL.name = IC.PIECES[m.part].name; m._pcL.join = true; } return m._pcL; };

/* the plan for the build bar's ghost and the Build button (builder.js's planOf) */
IC.piecePlan = function (S, m, hv, out) {
  const ap = m.ap, K = IC.PIECES[m.part], P = placeOf(S, m, hv);
  if (!P.L) { out.ok = false; out.why = P.why || ''; if (K.line && m.pts.length) out.text.push(P.why || 'Click the other end'); else if (K.line) out.text.push('Click where one end goes, then the other (or drag from end to end)'); return out; }
  const key = [m.part, P.x.toFixed(2), P.y.toFixed(2), P.rot.toFixed(3), m._pcK, ap.parts.length, ap.nodeN, Math.round(S.budget)].join('|');
  if (m._ppK !== key) {
    m._ppK = key;
    const C = IC.bldBlueprintCheck(S, ap, P.L, P.x, P.y, P.rot), X = IC.layoutXf(P);
    // links from the piece's lane ends to the nearest taxiway
    const links = [];
    for (const j of P.L.joins || []) { const J = X(j.x, j.y), l = joinOf(S, ap, J); if (l) links.push(l); }
    const linkCost = links.reduce((a, l) => a + IC.partCost(ap, { kind: 'taxi', pts: [l.from, l.to] }), 0);
    // a runway planned without one gets a landing system at each end it lacks
    const ils = P.around ? ['a', 'b'].filter(e => !ap.parts.some(q => q.kind === 'ils' && q.rw === P.around.id && q.end === e)) : [];
    m._pp = { C, links, linkCost, ils, P };
  }
  const { C, links, linkCost, ils } = m._pp;
  out.bp = { x: P.x, y: P.y, rot: P.rot, t: C.t }; out.piece = { links, ils, P };
  out.ok = C.ok; out.why = C.why; out.hit = C.hit;
  out.cost = (C.cost || 0) + linkCost + ils.length * IC.APART.ils.cost;
  out.warn = [];
  if ((P.L.joins || []).length && !links.length) out.warn.push('No taxiway near enough to join: draw one from its taxilane to the parallel taxiway, or build the Runway with taxiways first.');
  if (C.t) {
    const st = (P.L.stands || []).length, term = C.t.parts.filter(q => q.kind === 'terminal').reduce((a, q) => a + IC.APART.terminal.pax * IC.partArea(q), 0);
    const bits = [];
    if (P.len) bits.push(IC.bldLen(P.len));
    if (st) bits.push(`${st} stands`);
    if (term) bits.push(`${Math.round(term / 10) * 10} passengers an hour`);
    if (links.length) bits.push(`${links.length} link${links.length > 1 ? 's' : ''} to your taxiways`);
    if (P.around) bits.push(`round ${P.around.name || 'the runway'}`);
    else if (P.onSurvey) bits.push('on the surveyed runway');
    out.text.push(`${K.name}: ${bits.join(' · ')}${bits.length ? ' · ' : ''}${U.money(out.cost)}, paid as the work runs · ${K.line ? 'R: taxiway on the other side' : 'R turns it'}`);
  }
  return out;
};
/* Build: plan the piece, its links and landing systems, as one step to undo */
IC.pieceBuild = function (S, m, plan) {
  const ap = m.ap, K = IC.PIECES[m.part], P = plan.piece.P, u0 = (ap.undo = ap.undo || []).length;
  const made = IC.bldBlueprint(S, ap, P.L, P.x, P.y, P.rot);
  if (!made) return null;
  for (const l of plan.piece.links) { const q = IC.aptPlanTaxi(S, ap, [l.from, l.to], 0.1); if (q) made.push(q); }
  for (const e of plan.piece.ils) { const rw = P.around, q = rw && IC.aptPlanPart(S, ap, 'ils', rw[e].x, rw[e].y); if (q) made.push(q); }
  // (one step to undo: everything this Build planned)
  const ids = []; while (ap.undo.length > u0) { const top = ap.undo.pop(); if (Array.isArray(top)) ids.push(...top); else if (typeof top === 'string') ids.push(top); else { ap.undo.push(top); break; } }
  ap.undo.push(ids);
  // the first runway of a new airport sets its axis, as the founding survey did
  if (m.part === 'rwkit' || m.part === 'starter') { const r = made.find(q => q.kind === 'runway'); if (r && !ap.parts.some(q => q.kind === 'runway' && q !== r)) ap.rwyA = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x); }
  IC.emit(S, 'piece', { ap, piece: m.part, parts: made });
  return { made, name: K.name };
};

/* R (or the turn buttons) on a piece: a runway piece and the starter airport put their taxiways on the other side;
   the rest turn a quarter (fine: Shift, 15°). False when the mode is not a piece */
IC.pieceTurn = function (m, dir, fine) {
  const PC = IC.PIECES[m && m.part]; if (!PC) return false;
  if (PC.line || m.part === 'starter') m.flip = !m.flip;
  else { m.rot = (m._pp && !m.rotHand ? m._pp.P.rot : m.rot || 0) + (dir || 1) * (fine ? Math.PI / 12 : Math.PI / 2); m.rotHand = true; }
  return true;
};
/* after Found, the surveyed runway as a placed plan
: the Runway with taxiways along the survey line, ready to Build */
IC.pieceFromSurvey = function (S, ap) {
  const sv = ap.survey; if (!sv) return null;
  const m = IC.bldMode(S, ap, 'rwkit'), d = { x: Math.cos(sv.a), y: Math.sin(sv.a) }, h = 15;
  m.pts = [{ x: sv.x - d.x * h, y: sv.y - d.y * h }, { x: sv.x + d.x * h, y: sv.y + d.y * h }];
  m.set = true; m.at = m.pts[1]; m.tol = 0.12; m.fromSurvey = true;
  return m;
};

})(window.IC);
