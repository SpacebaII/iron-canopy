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
   it. Placing is builder.js (planOf asks IC.piecePlan); the ghost is render-airport.js's blueprint drawing. Headless.
   (wave 12, IC.FOCUS.parts) The bar is the parts one by one again; of these only the Starter airport is on it, and
   the others are what a problem's fix places. */
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
  // (y0: the runway's line, sg: the parallel's side; a second runway of a pair lies at y0 with its parallel toward the first)
  const y0 = o.y0 || 0, P = y0 + (o.sg || 1) * PAR, h = L / 2, hold = Math.min(1.2, L * 0.05), ex = Math.min(L * 0.55, 17), dx = PAR / Math.tan(Math.PI / 6);
  const stations = new Set([-h, h, -(h - hold), h - hold].concat(o.joins || []));
  // (rapid exits from the far side of the middle, angled 30° toward the way the landing rolls)
  const exA = h - ex, exB = -h + ex;
  if (L >= 18) { stations.add(exA - dx); stations.add(exB + dx); }
  if (o.runway !== false) B.runway(pt(-h, y0), pt(h, y0), 0.45, { ils: ['a', 'b'], sfx: o.sfx });
  if (o.parallel !== false) {
    B.taxi([...stations].filter(x => x >= -h - 1e-6 && x <= h + 1e-6).sort((a, b) => a - b).map(x => pt(x, P)), { name: o.name || 'A' });
    for (const x of [-h, h, -(h - hold), h - hold]) B.taxi([pt(x, y0), pt(x, P)]);
    if (L >= 18) { B.taxi([pt(exA, y0), pt(exA - dx, P)]); B.taxi([pt(exB, y0), pt(exB + dx, P)]); }
  }
}
/* the services as a piece, placed beside a runway (its −y side faces it): the fire station in front, its apron to
   the airfield, the tower to one side, the fuel farm set back to the other, 170 m clear of the fire station (fire
   spreads 160 m from burning fuel), where its lorries come in from the road */
function services(B, x, y, noTower) {
  B.box('fire', pt(x, y), 0, 1.0, 0.6, { name: 'Fire station' });
  if (!noTower) B.box('tower', pt(x - 1.1, y + 0.45), 0, 0.3, 0.3, { name: 'Control tower' });
  B.box('fuel', pt(x + 2.95, y + 1.0), 0, 1.5, 1.0, { name: 'Fuel farm' });
}
/* the services of a whole airport, where real airports put them (QA: they stood in a row beside the terminal, the
   fire station with no way to the runway and the fuel farm against the tower): the fire station beside the terminal
   apron near the runway's middle, its apron facing the parallel taxiway and its own road onto it; the tower beside
   the terminal's end, where its cab sees the whole runway; the fuel farm set back behind the fire
   station, 200 m from the terminal, where its lorries come in from outside. xE: the apron's far end; y0: the
   terminal's line. The fuel farm keeps 170 m from everything: fire spreads 160 m from burning fuel */
function siteServices(B, xE, y0, noTower, small) {
  // (an airfield's are small: a two-bay fire station and a single tank, as at a flying club's field)
  const fw = small ? 0.5 : 1.0, fh = small ? 0.35 : 0.6, uw = small ? 0.6 : 1.5, uh = small ? 0.45 : 1.0;
  const fx = xE + 0.4 + fw / 2 + (small ? 0.2 : 0.1), fy = PAR + 0.115 + 0.4 + fh / 2, ax = fx - fw / 2 + fw * 0.325;
  B.box('fire', pt(fx, fy), 0, fw, fh, { name: 'Fire station', link: [pt(ax, fy - fh / 2), pt(ax, PAR + 0.115)] });
  if (!noTower) B.box('tower', pt(xE + 0.32, y0 + 0.05), 0, 0.3, 0.3, { name: 'Control tower' });
  // (170 m clear of the fire station: burning fuel reaches anything within 160 m, IC.FIRE_SPREAD)
  B.box('fuel', pt(fx + fw / 2 + 1.7 + uw / 2, fy + fh / 2 + 0.3 + uh / 2), 0, uw, uh, Object.assign({ name: 'Fuel farm' }, small ? { tanks: 1 } : null));
}
/* the paving's outer corners rounded off, as real aprons are laid (QA: every apron was a sharp-cornered box): a
   corner at the far ends of the slab is curved back 40 m along both sides, unless a building stands at it; corners
   inside the slab, where aprons meet, stay as they are so the paving is one piece */
function softAprons(B, from) {
  const A = B.L.aprons.slice(from || 0); if (!A.length || !IC.shapeOutline) return;
  const pts = a => { const o = []; for (let i = 0; i < a.poly.length; i += 2) o.push({ x: a.poly[i], y: a.poly[i + 1] }); return o; };
  const all = [].concat(...A.map(pts)), x0 = Math.min(...all.map(q => q.x)), x1 = Math.max(...all.map(q => q.x)), y0 = Math.min(...all.map(q => q.y)), y1 = Math.max(...all.map(q => q.y));
  const blds = B.L.blds.map(b => pts(b));
  const nearBld = q => blds.some(P => P.some((v, i) => { const w = P[(i + 1) % P.length]; return U.segDist(q.x, q.y, v.x, v.y, w.x, w.y) < 0.08; }));
  for (const a of A) {
    const P = pts(a).map(q => Object.assign(q, { k: (Math.abs(q.x - x0) < 0.02 || Math.abs(q.x - x1) < 0.02) && (Math.abs(q.y - y0) < 0.02 || Math.abs(q.y - y1) < 0.02) && !nearBld(q) ? 0 : 1 }));
    if (P.every(q => q.k)) continue;
    const O = IC.shapeOutline(P, 'round', 0.4), o = []; for (const q of O) o.push(Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000);
    a.poly = o;
  }
}
/* the far ends of the layout's aprons along x, so far */
const apronX = B => { let lo = 1e9, hi = -1e9; for (const A of B.L.aprons) for (let i = 0; i < A.poly.length; i += 2) { lo = Math.min(lo, A.poly[i]); hi = Math.max(hi, A.poly[i]); } return [lo, hi]; };

/* a cargo shed with four freighter stands, its taxilane along y = ly from cends[0] to cends[1] (the terminal lane's
   link to the parallel, so it is no dead end), the shed beyond it on the +y side, linked to the parallel at its west
   end too (when there is one) */
function cargoSet(B, cx, ly, cends, link) {
  const S0 = IC.STAND.l, WALL = 0.06, sd = ly + 0.12 + S0.d / 2, face = sd + S0.d / 2 + WALL;
  const ai = B.apron([pt(cx - 1.8, ly - 0.14), pt(cx + 1.8, ly - 0.14), pt(cx + 1.8, face - 0.04), pt(cx - 1.8, face - 0.04)], { zone: 'cargo', name: 'Cargo apron' });
  B.box('cargo', pt(cx, face + 0.4), 0, 3.2, 0.8, { name: 'Cargo terminal' });
  const xs = [-1.2, -0.4, 0.4, 1.2].map(x => cx + x);
  B.lane([pt(cends[0], ly)].concat(xs.map(x => pt(x, ly)), [pt(cends[1], ly)]), { w: 0.23 });
  for (const x of xs) B.stand(ai, pt(x, sd), Math.PI / 2, 'l', B.node(pt(x, ly)));
  if (link) B.taxi([pt(cends[0], ly), pt(cends[0], PAR)]);
}

/* a mega hub's Starter (QA: the biggest a player could found was one 4 km runway and ten stands): two independent
   runways 2.2 km apart, each with its parallel taxiway on the inside, three concourses side by side between them (two
   of large stands, one of medium), and the terminal outside, beyond runway 1's strip, where the roads reach it,
   joined to the concourses by a train in a tunnel (a terminal in the middle of the airfield has no way in by road);
   the services east of the concourses, a second fire station on the far runway's side so trucks reach both runways
   end to end within 3 minutes. Runway 1 on the surveyed line (y 0), runway 2 at y 22 */
const MEGA_Y = 22;
function megaStarter(B, L, o) {
  const h = L / 2, P1 = PAR, P2 = MEGA_Y - PAR, xs = [-2.6, 2.0, 6.6], sz = ['l', 'l', 'm'], y0 = 6.2, y1 = 15.8, con = [];
  const off = k => 0.26 + 0.06 + IC.STAND[sz[k]].d + 0.12;
  const joins = [].concat(...xs.map((x, k) => [x - off(k), x + off(k)]));
  if (o.runway !== false) runwaySet(B, L, { joins, sfx: ['R', 'L'], name: 'A' });
  runwaySet(B, L, { y0: MEGA_Y, sg: -1, joins, sfx: ['L', 'R'], name: 'B' });
  const tx = (xs[0] + xs[1]) / 2 + 0.2, ty = -(STRIP + 0.4 + 1.1), T = B.box('terminal', pt(tx, ty), 0, 7, 2.2, { name: 'Terminal', lvls: 3 });
  xs.forEach((x, k) => {
    const C = IC.kitPier(B, { p0: pt(x, y0), p1: pt(x, y1), bw: 0.26, size: sz[k], cap0: true, name: `Concourse ${'ABC'[k]}` }); con.push(C);
    // the concourse's taxilanes onto both parallels, round its two ends
    for (const dx of [-off(k), off(k)]) { B.taxi([pt(x + dx, y0 - 0.6), pt(x + dx, P1)]); B.taxi([pt(x + dx, y1 + 0.6), pt(x + dx, P2)]); }
  });
  // (the train: from the terminal north under runway 1 to the concourses' middle, then along them both ways)
  const ym = (y0 + y1) / 2;
  B.mover([pt(tx, ty + 1.1), pt(tx, ym), pt(xs[2], ym)], [T, con[1].term, con[2].term], -1, 'Plane train');
  B.mover([pt(tx, ym), pt(xs[0], ym)], [con[0].term], -1, 'Plane train');
  softAprons(B);
  // services: east of the concourses beside runway 1's parallel; a second fire station west, beside runway 2's
  siteServices(B, xs[2] + off(2) + 0.6, (y0 + y1) / 2, false, false);
  const fw = 1.0, fh = 0.6, fx = -5.6, fy = P2 - 0.115 - 0.4 - fh / 2, ax = fx - fw / 2 + fw * 0.325;
  B.box('fire', pt(fx, fy), Math.PI, fw, fh, { name: 'Fire station 2', link: [pt(ax, fy + fh / 2), pt(ax, P2 - 0.115)] });
  return B.L;
}

IC.PIECES = {
  rwkit: { name: 'Runway with taxiways', line: true, use: 'land, take off and taxi: all of it',
    desc: 'Click one end, then the other (or drag): a concrete runway with a parallel taxiway 190 m beside it, links at both ends, a holding entry at each end, two rapid exits, edge lights and a landing system (ILS) at each end, so fog does not close it. R puts the taxiway on the other side. Build (or Enter) plans it all.',
    make: o => { const B = IC.layoutBuilder(); runwaySet(B, o.len); return B.L; } },
  tstraight: { name: 'Terminal with apron', use: 'passengers, with stands at its gates',
    desc: 'A terminal whose face steps in and out, its hall standing forward to the kerb, with a row of stands along each part of its face, each with a jet bridge, on one apron with a taxilane in front. Click beside the parallel taxiway: it faces the runway and joins the nearest taxiway by itself. R turns it; Another layout tries a different one.',
    make: o => { const B = IC.layoutBuilder(), T = IC.kitComplex(B, { n: o.size === 'l' ? 4 : 6, piers: 0, size: o.size, seed: o.seed }); B.L.joins = T.joins; return B.L; } },
  tpier: { name: 'Terminal with piers', use: 'gates along piers reaching toward the runway',
    desc: 'A terminal with piers of different lengths fanned toward the runway, stands on both faces of each and along the terminal between them, on one apron, the taxilanes round each pier\'s tip. Click it in place: the tips join the nearest taxiway by themselves. R turns it; Another layout tries a different one.',
    make: o => { const B = IC.layoutBuilder(), T = IC.kitComplex(B, { n: o.size === 'l' ? 10 : 14, size: o.size, seed: o.seed }); B.L.joins = T.joins; return B.L; } },
  tround: { name: 'Round terminal', use: 'gates fanned round a round building',
    desc: 'A round terminal with stands all round it, each with a jet bridge, and a taxilane ring. Click it in place: the ring joins the nearest taxiway by itself.',
    make: o => { const B = IC.layoutBuilder(), K = IC.kitRound(B, { c: pt(0, 0), R: 0.8, size: o.size || 'm', name: 'Round terminal' });
      const j = K.ring.reduce((b, r) => (!b || r.q.y < b.y ? r.q : b), null); B.L.joins = [j]; return B.L; } },
  tattach: { name: 'Pier on a terminal', attach: true, use: 'more gates, where you want them',
    desc: 'A pier from the terminal wall nearest the cursor, out as far as the cursor (130 to 700 m), with stands on both faces and a taxilane round its tip. The apron in its way is cut round it: the stands there are taken up, the rest stay. R turns it 15°. Undo puts it all back before work starts.',
    make: o => pierLayout(o.plen || 3, o.size, { 1: 0.1, [-1]: 0.1 }) },
  services: { name: 'Services', use: 'tower, fire station and fuel farm',
    desc: 'A fire station whose trucks reach the runway in under 3 minutes (airliners need it), its apron facing the airfield; a control tower beside it (one movement every 2 min instead of every 8); and a fuel farm set back behind them, where tankers come in from the road. Click beside the runway, outside its 150 m strip: each gets its road by itself.',
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
    desc: 'A complete airport as one plan, sized for what the airport is for: the surveyed runway (1.2 km for an airfield, 2.2 km regional, 3 km national, 4 km for a hub) with its taxiways and a landing system at each end, a terminal with stands (small stands for light aircraft at an airfield, large ones at a hub, a cargo area at a cargo airport; at a mega hub a second 4 km runway 2.2 km away, three concourses of 88 gates between them and the terminal joined to them by a train), a control tower, a fire station and a fuel farm. On a new airport it lies on the surveyed runway; with a runway already planned it is built round it. One price, paid as the work runs; Undo takes all of it back before work starts.',
    make: o => {
      // (its size follows the airport's class, IC.APT_CLASS: stands, their size, a cargo area, the stands' zone)
      const C = o.st || {}, B = IC.layoutBuilder(), L = o.len || 30, n = C.n || 8, size = C.size || 'm';
      if (C.mega) return megaStarter(B, L, o);
      // (the terminal from the same kit as the Terminal piece: measured first, then set a lane's width beyond the parallel)
      const T0 = IC.kitComplex(IC.layoutBuilder(), { n, size, piers: 0, seed: o.seed });
      const y0 = PAR + LANE_GAP - T0.ymin, T = IC.kitComplex(B, { n, size, piers: 0, seed: o.seed, c: pt(0, y0) });
      const jx = T.joins.map(j => j.x), ly = T.joins[0].y, ends = [Math.min(...jx), Math.max(...jx)];
      // (a cargo area west of the terminal, on the same taxilane line: its own link to the parallel)
      const cw = 3.6, cx = C.cargo ? ends[0] - 0.6 - cw / 2 - 0.2 : 0, cends = C.cargo ? [cx - cw / 2 - 0.5, ends[0]] : [];
      runwaySet(B, L, { runway: o.runway, parallel: o.parallel, joins: jx.concat(cends.slice(0, 1)) });
      if (C.zone) for (const a of B.L.aprons) a.zone = C.zone;
      for (const j of T.joins) if (o.parallel !== false) B.taxi([j, pt(j.x, PAR)]);
      if (C.cargo) { const k = B.L.aprons.length; cargoSet(B, cx, ly, cends, o.parallel !== false); softAprons(B, k); }
      if (o.parallel === false) B.L.joins = T.joins.concat(C.cargo ? [pt(cends[0], ly)] : []);
      siteServices(B, Math.max(apronX(B)[1], T.x1 + 0.12), y0, C.tower === false, C.zone === 'light');
      // (an airfield's is asphalt with no landing system: light aircraft fly by sight)
      if (C.ils === false) for (const r of B.L.runways) r.ils = [];
      if (C.mat) for (const q of [].concat(B.L.runways, B.L.taxi, B.L.aprons)) q.mat = C.mat;
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
function joinOf(S, ap, J, skip, avoid) {
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
      // (nor back across the piece itself: a pier's tip does not join the lane at its own root)
      if (avoid && avoid.some(P => { const PA = P.map(c => [c.x, c.y]); for (let k = 0; k <= 12; k++) { const x = J.x + (p.x - J.x) * k / 12, y = J.y + (p.y - J.y) * k / 12; if (U.inPoly(x, y, PA) || P.some((c, i) => { const d = P[(i + 1) % P.length]; return U.segDist(x, y, c.x, c.y, d.x, d.y) < 0.2; })) return true; } return false; })) continue;
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
    if (len > IC.RWY_MAX) return { why: IC.rwyTooLong(len), len };
    const a = Math.atan2(b0.y - a0.y, b0.x - a0.x), cx = (a0.x + b0.x) / 2, cy = (a0.y + b0.y) / 2;
    let rot = a; if (toCity(cx, cy, rot) === !!m.flip) rot += Math.PI;
    const key = 'rw' + len;
    return { L: lay(m, key, () => K.make({ len })), x: cx, y: cy, rot, len };
  }
  // a pier on a terminal: from the wall nearest the cursor
  if (K.attach) return attachPlace(S, m, hv);
  // the starter airport: on the surveyed runway, or round the nearest runway already there
  if (m.part === 'starter') {
    const cls = IC.aptClass(ap) || 'national', st = (IC.APT_CLASS[cls] || IC.APT_CLASS.national).starter;
    const nr = nearRunway(ap, hv);
    if (nr && nr.dist < 40) {
      const sg = nr.off >= 0 ? 1 : -1, rot = nr.a + (sg > 0 ? 0 : Math.PI), par = hasParallel(ap, nr.rw, sg);
      const seed = pieceSeed(ap, m);
      return { L: lay(m, `st${nr.L.toFixed(1)}${par}${cls}${seed}`, () => K.make({ len: nr.L, runway: false, parallel: !par, st, seed })), x: nr.mid.x, y: nr.mid.y, rot, around: nr.rw, par };
    }
    const sv = ap.survey && U.dist(ap.survey, hv) < 40 ? ap.survey : null, at = sv || hv;
    let rot = sv ? sv.a : (m.rot || 0); if (!toCity(at.x, at.y, rot) !== !!m.flip) rot += Math.PI;
    const len = sv && sv.len || (IC.APT_CLASS[cls] || {}).rw || 30;
    const seed = pieceSeed(ap, m);
    return { L: lay(m, `st${len}${cls}${seed}`, () => K.make({ len, st, seed })), x: at.x, y: at.y, rot, onSurvey: !!sv };
  }
  // everything else at the cursor, its face to the nearest runway (R turns it by hand)
  const seed = pieceSeed(ap, m), L = lay(m, m.part + size + seed, () => K.make({ size, seed }));
  let rot = m.rot || 0;
  const nr = nearRunway(ap, hv);
  if (nr && !m.rotHand) { const sg = nr.off >= 0 ? 1 : -1; rot = nr.a + (sg > 0 ? 0 : Math.PI); }
  let x = hv.x, y = hv.y;
  // services stand outside the runway strip, the fire station's far side 160 m from the centreline at least
  if (m.part === 'services' && nr && nr.dist < 6 && !m.rotHand) { const sg = nr.off >= 0 ? 1 : -1, n = { x: -nr.d.y * sg, y: nr.d.x * sg }, want = STRIP + 0.6; if (Math.abs(nr.off) < want) { x += n.x * (want - Math.abs(nr.off)); y += n.y * (want - Math.abs(nr.off)); } }
  return { L, x, y, rot };
}
/* the seed a terminal piece is laid out from: the airport and how many terminals it has, so each one differs, and
   the player's Another layout (m.seed) */
const pieceSeed = (ap, m) => (Math.round(U.hash(String(ap.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0), 17) * 997) + ap.parts.filter(q => q.kind === 'terminal').length * 31 + (m.seed || 0) * 7) % 100003 + 1;
const lay = (m, key, make) => { if (m._pcK !== key) { m._pcK = key; m._pcL = make(); m._pcL.kit = true; m._pcL.name = IC.PIECES[m.part].name; m._pcL.join = true; } return m._pcL; };

/* ---------- a pier on a terminal that is there (brief 61) ---------- */
/* Grow a terminal where the player wants: a pier from the wall nearest the cursor, square to it (R turns it 15° at a
   time), reaching as far out as the cursor. The apron in its way is cut round it (stands there are taken up, the
   rest stay where they are); a taxilane across its root is split, each side's end joined to the pier's own lane.
   The pier's tip joins the nearest taxiway. Undo before work starts puts all of it back. */
const PIER_BW = 0.2, PIER_EXT = 0.6;
const pierOff = size => { const S0 = IC.STAND[size || 'm']; return PIER_BW + 0.06 + S0.d + 0.12; };
/* the terminal wall the cursor stands in front of: { t, p (the root, on the wall), n (outward), ahead } */
function wallAt(ap, hv) {
  let best = null, land = false;
  const aprons = ap.parts.filter(p => p.kind === 'apron' && p.x != null).map(p => IC.partOutline(p).map(q => [q.x, q.y]));
  for (const t of ap.parts) {
    if (t.kind !== 'terminal' || t.x == null || t.r) continue;
    const P = IC.partOutline(t), PA = P.map(q => [q.x, q.y]);
    for (let i = 0; i < P.length; i++) {
      const A = P[i], B = P[(i + 1) % P.length], L = U.dist(A, B); if (L < 2 * PIER_BW + 0.1) continue;
      const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, s = (hv.x - A.x) * ux + (hv.y - A.y) * uy;
      if (s < -0.5 || s > L + 0.5) continue;
      const ss = U.clamp(s, PIER_BW + 0.03, L - PIER_BW - 0.03), p = { x: A.x + ux * ss, y: A.y + uy * ss };
      let n = { x: -uy, y: ux }; if (U.inPoly(p.x + n.x * 0.03, p.y + n.y * 0.03, PA)) n = { x: uy, y: -ux };
      const ahead = (hv.x - p.x) * n.x + (hv.y - p.y) * n.y; if (ahead < 0.2 || ahead > 9) continue;
      // (only a wall with apron in front of it: the others face the kerb or the grass)
      if (!aprons.some(A => U.inPoly(p.x + n.x * 0.25, p.y + n.y * 0.25, A))) { land = true; continue; }
      const side = Math.abs(s - ss), d = side * 3 + ahead * 0.2;
      if (!best || d < best.d) best = { t, p, n, ahead, d, A, w: { x: ux, y: uy }, lo: PIER_BW + 0.03, hi: L - PIER_BW - 0.03, ss };
    }
  }
  return best || (land ? { land } : null);
}
/* where a line from a along u first meets one of the airport's taxiways within reach: { q, s, seg } */
function lineMeets(ap, a, u, reach) {
  let best = null;
  for (const q of ap.parts) {
    if (q.kind !== 'taxi' && q.kind !== 'runway') continue;
    const pts = q.kind === 'runway' ? [q.a, q.b] : q.nodes.map(id => ap.nodes[id]);
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i]; if (!A || !B) continue;
      const dx = B.x - A.x, dy = B.y - A.y, den = u.x * dy - u.y * dx; if (Math.abs(den) < 1e-9) continue;
      const s = ((A.x - a.x) * dy - (A.y - a.y) * dx) / den, r = ((A.x - a.x) * u.y - (A.y - a.y) * u.x) / den;
      if (s > -0.05 && s < reach && r >= 0 && r <= 1 && (!best || s < best.s)) best = { q, s, seg: i, at: { x: a.x + u.x * s, y: a.y + u.y * s } };
    }
  }
  return best;
}
/* the pier's layout in its own frame (from the origin toward −y), its side lanes from s0 (or their first gate) */
function pierLayout(len, size, s0) {
  const B = IC.layoutBuilder(), sz = size || 'm', od = pierOff(sz) + 0.14, a0 = Math.max(0, Math.min(s0[1], s0[-1]) - 0.14);
  // (one apron round the pier and its tip, not one a side: no seam down the middle)
  const e = -(len + PIER_EXT + 0.14), w = PIER_BW - 0.04;
  const ai = B.apron([pt(-od, -a0), pt(-od, e), pt(od, e), pt(od, -a0), pt(w, -a0), pt(w, -len), pt(-w, -len), pt(-w, -a0)]);
  const K = IC.kitPier(B, { p0: pt(0, 0), p1: pt(0, -len), bw: PIER_BW, size: sz, tip: PIER_EXT, ai, lane0: { 1: s0[1], [-1]: s0[-1] }, s0: { 1: s0[1] + 0.05, [-1]: s0[-1] + 0.05 }, name: 'Pier' });
  // (a lane starts at its first gate: its root end is joined to the split taxilane once built, or to nothing)
  for (const l of K.lanes) if (l.n.length > 2) l.n.shift();
  B.L.joins = [pt(0, -(len + PIER_EXT))];
  B.L.roots = K.lanes.map(l => ({ sg: l.sg, first: B.at(l.n[0]) }));
  return B.L;
}
/* the taxiways that cross the pier's band (|t| < off) between the wall and smax out */
function lanesAcross(ap, p, u, q, off, smax) {
  const R = [[-off, -0.05], [off, -0.05], [off, smax], [-off, smax]].map(([t, s]) => ({ x: p.x + q.x * t + u.x * s, y: p.y + q.y * t + u.y * s }));
  return ap.parts.filter(t => t.kind === 'taxi' && polyHitLine(R, t.nodes.map(id => ap.nodes[id]).filter(Boolean)));
}
/* where the pier goes, what it cuts: the aprons under it and the taxilane across its root */
function attachPlace(S, m, hv) {
  const ap = m.ap, size = m.size === 'l' ? 'l' : 'm', T = wallAt(ap, hv);
  if (!T) return { why: 'Point in front of a terminal wall: the pier starts there and reaches out to the cursor.' };
  if (T.land) return { why: 'A pier goes on a wall that faces the apron, not the kerb or the grass: point out from the airside.' };
  const a = Math.atan2(T.n.y, T.n.x) + (m.turn || 0) * Math.PI / 12, u = { x: Math.cos(a), y: Math.sin(a) };
  let len = U.clamp(Math.round(((hv.x - T.p.x) * u.x + (hv.y - T.p.y) * u.y) * 10) / 10, 1.3, 7); const off = pierOff(size), q = { x: -u.y, y: u.x };
  // a taxilane across the root: both side lanes meet it near the wall
  const side = sg => lineMeets(ap, { x: T.p.x + q.x * sg * off, y: T.p.y + q.y * sg * off }, u, Math.min(len, 1.6));
  // (the taxilanes across it there, one or several: a face lane may be in sections joined at a step)
  let mL = side(-1), mR = side(1);
  // (one side lane misses the taxilane, past its last gate: slide the root along the wall, toward the middle, until both meet it)
  if (!!mL !== !!mR && !m.turn) for (let k = 1; k <= 12 && !(mL && mR); k++) {
    const s1 = T.ss + (mL ? -1 : 1) * k * 0.05; if (s1 < T.lo || s1 > T.hi) break;
    T.p = { x: T.A.x + T.w.x * s1, y: T.A.y + T.w.y * s1 }; mL = side(-1); mR = side(1);
  }
  const smax = mL && mR ? Math.max(mL.s, mR.s) + 0.15 : 0, cross = mL && mR ? { qs: lanesAcross(ap, T.p, u, q, off, smax), at: { [-1]: mL.at, 1: mR.at }, u, q, p: T.p, off, smax } : null;
  const s0 = { [-1]: cross ? mL.s : 0.1, 1: cross ? mR.s : 0.1 };
  // (no further than the next taxiway or runway out: the tip's taxilane stops short of it and is joined to it)
  let far = 1e9;
  for (const t of [0, -1, 1]) { const o = t * (off + 0.14), a0 = { x: T.p.x + q.x * o, y: T.p.y + q.y * o }; let s = Math.max(s0[1], s0[-1]) + 0.3;
    for (let k = 0; k < 4; k++) { const h = lineMeets(ap, { x: a0.x + u.x * s, y: a0.y + u.y * s }, u, 9); if (!h) break; if (cross && cross.qs.includes(h.q)) { s += h.s + 0.05; continue; } far = Math.min(far, s + h.s - (h.q.kind === 'runway' ? 1.4 : 0.12 + (h.q.w || 0.23) / 2)); break; } }
  len = Math.min(len, Math.floor((far - PIER_EXT - 0.14) * 10) / 10);
  if (len < 1.3) return { why: 'No room for a pier there: a taxiway or runway is under 250 m from that wall. Try another wall, or turn it (R).' };
  const L = lay(m, `pa${len}${size}${s0[1].toFixed(2)}${s0[-1].toFixed(2)}`, () => pierLayout(len, size, s0));
  if (!L.stands.length) return { why: `Too short for a gate past the taxilane at its root: point farther out (room for ${Math.round(len * 100)} m before the next taxiway).` };
  const rot = Math.atan2(u.x, -u.y), X = IC.layoutXf({ x: T.p.x, y: T.p.y, rot });
  // the aprons it overlaps: cut round it once it is built
  const polys = L.aprons.map(A => IC.layoutPairs(A.poly).map(p => X(p.x, p.y))).concat(L.blds.map(b => IC.layoutPairs(b.poly).map(p => X(p.x, p.y))));
  const cuts = ap.parts.filter(p => p.kind === 'apron' && p.x != null && polys.some(P => polyHit(IC.partOutline(p), P)));
  const skip = new Set(cuts.map(p => p.id)); if (cross) for (const c of cross.qs) skip.add(c.id);
  // (a taxilane its apron only reaches over at the edge: it runs on the pavement, as on any apron, so long as it misses the pier)
  const nA = L.aprons.length;
  for (const t of ap.parts) if (t.kind === 'taxi' && t.lane && !skip.has(t.id)) { const P = t.nodes.map(id => ap.nodes[id]).filter(Boolean);
    if (polys.slice(0, nA).some(A => polyHitLine(A, P)) && !polys.slice(nA).some(A => polyHitLine(A, P))) skip.add(t.id); }
  return { L, x: T.p.x, y: T.p.y, rot, len, term: T.t, cuts, cross, skip, polys, u };
}
/* does a line run into an outline */
function polyHitLine(A, L) {
  const AA = A.map(q => [q.x, q.y]);
  if (L.some(q => U.inPoly(q.x, q.y, AA))) return true;
  for (let i = 1; i < L.length; i++) for (let j = 0; j < A.length; j++) { const a = L[i - 1], b = L[i], c = A[j], d = A[(j + 1) % A.length]; if (U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y) >= 0) return true; }
  return false;
}
/* do two outlines overlap (a corner inside the other, or sides that cross) */
function polyHit(A, B) {
  const AA = A.map(q => [q.x, q.y]), BB = B.map(q => [q.x, q.y]);
  if (A.some(q => U.inPoly(q.x, q.y, BB)) || B.some(q => U.inPoly(q.x, q.y, AA))) return true;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) { const a = A[i], b = A[(i + 1) % A.length], c = B[j], d = B[(j + 1) % B.length]; if (U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y) >= 0) return true; }
  return false;
}
/* is a point under the pier (or within 3 m of it) */
const underPier = (P, x, y) => P.polys.some(Q => U.inPoly(x, y, Q.map(q => [q.x, q.y])) || Q.some((q, i) => { const r = Q[(i + 1) % Q.length]; return U.segDist(x, y, q.x, q.y, r.x, r.y) < 0.03; }));
const standCorners = s => { const S0 = IC.STAND[s.size] || IC.STAND.m, ca = Math.cos(s.a), sa = Math.sin(s.a); return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => ({ x: s.x + ca * i * S0.d / 2 - sa * j * S0.w / 2, y: s.y + sa * i * S0.d / 2 + ca * j * S0.w / 2 })); };
/* the stands the pier takes up */
function attachGone(ap, P) { const ids = new Set(P.cuts.map(p => p.id)); return IC.aptStands(ap).filter(s => ids.has(s.apron) && standCorners(s).some(q => underPier(P, q.x, q.y))); }
/* cut the aprons round the pier and split the taxilane across its root; returns what undo needs to put back */
function attachCut(S, ap, P) {
  const keep = { parts: [], added: [], at: {} }, cl = o => JSON.parse(JSON.stringify(o, (k, v) => k[0] === '_' || k === 'stands' ? undefined : v));
  // (the apron left round it runs on under the edge of the pier's own apron and up to the pier's walls, with no strip
  // of grass between)
  const nA = P.L.aprons.length, PA = P.polys.slice(0, nA), deep = (Q, x, y) => U.inPoly(x, y, Q.map(q => [q.x, q.y])) && Q.every((q, i) => { const r = Q[(i + 1) % Q.length]; return U.segDist(x, y, q.x, q.y, r.x, r.y) > 0.04; });
  const near = (x, y) => PA.some(Q => deep(Q, x, y)) || P.polys.slice(nA).some(Q => U.inPoly(x, y, Q.map(q => [q.x, q.y])));
  // (where each was in the list, before any is taken out)
  for (const p of P.cuts.concat(P.cross ? P.cross.qs : [])) keep.at[p.id] = ap.parts.indexOf(p);
  const st = IC.aptStands(ap);
  for (const A of P.cuts) {
    keep.parts.push(cl(A));
    const O = IC.partOutline(A), OA = O.map(q => [q.x, q.y]), c = 0.025;
    const bb = O.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [1e9, 1e9, -1e9, -1e9]);
    const nx = Math.ceil((bb[2] - bb[0]) / c) + 1, ny = Math.ceil((bb[3] - bb[1]) / c) + 1, F = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = bb[0] + (i + 0.5) * c, y = bb[1] + (j + 0.5) * c; if (U.inPoly(x, y, OA) && !near(x, y)) F[j * nx + i] = 1; }
    // each piece left over is an apron of its own; the stands that still fit on it stay where they were
    const pieces = [];
    for (;;) { const G = F.slice(), n = IC.cellLargest(G, nx, ny); if (n * c * c < 0.04) break; pieces.push(IC.cellOutline(G, nx, ny, bb, c, 0.03)); for (let k = 0; k < F.length; k++) if (G[k]) F[k] = 0; }
    const mine = st.filter(s => s.apron === A.id);
    pieces.filter(Boolean).forEach((Q, k) => {
      const part = k === 0 ? A : Object.assign({}, cl(A), { id: undefined, stands: undefined });
      const sp = IC.polyPart('apron', Q); Object.assign(part, { x: sp.x, y: sp.y, a: sp.a, w: sp.w, h: sp.h, poly: sp.poly, ramp: true, _sh: null, _shk: null });
      const QA = Q.map(q => [q.x, q.y]);
      part.free = mine.filter(s => standCorners(s).every(q => U.inPoly(q.x, q.y, QA)))
        .map((s, i) => { const l = IC.rectLocal(part, s), k0 = +String(s.id).slice(String(A.id).length + 1); return { lx: l.x, ly: l.y, rot: U.angWrap(s.a - part.a), size: s.size, via: s.via || null, drive: s.drive || undefined, name: s.name || undefined, k: k === 0 && isFinite(k0) ? k0 : i }; });
      if (k > 0) { delete part.id; IC.aptAddPart(ap, part, A.built); keep.added.push(part.id); }
    });
    if (!pieces.length) ap.parts = ap.parts.filter(p => p !== A);
  }
  // the taxilane across the root: split in two at the pier's side lanes, the stretch between taken up
  if (P.cross) {
    const C = P.cross, tOf = n => (n.x - C.p.x) * C.q.x + (n.y - C.p.y) * C.q.y, sOf = n => (n.x - C.p.x) * C.u.x + (n.y - C.p.y) * C.u.y;
    const ends = { [-1]: null, 1: null }, end = (id, sg) => { const n = ap.nodes[id]; if (!ends[sg] || sOf(n) < sOf(ap.nodes[ends[sg]])) ends[sg] = id; };
    for (const q of C.qs) {
      keep.parts.push(cl(q));
      // walk it, keeping what lies outside the pier's band, a node where it crosses the band's edge
      const runs = []; let cur = [];
      for (let i = 0; i < q.nodes.length; i++) {
        const id = q.nodes[i], n = ap.nodes[id], t = tOf(n), inB = Math.abs(t) < C.off && sOf(n) < C.smax;
        if (i > 0) { const a = ap.nodes[q.nodes[i - 1]], ta = tOf(a), aIn = Math.abs(ta) < C.off && sOf(a) < C.smax;
          if (aIn !== inB) { const e = (aIn ? t : ta) > 0 ? 1 : -1, f = (e * C.off - ta) / (t - ta), x = IC.aptNode(ap, a.x + (n.x - a.x) * f, a.y + (n.y - a.y) * f);
            if (aIn) cur = [x]; else { cur.push(x); runs.push(cur); cur = []; } end(x, e); } }
        if (!inB) cur.push(id);
      }
      if (cur.length) runs.push(cur);
      ap.parts = ap.parts.filter(p => p !== q);
      for (const ns of runs) if (ns.length >= 2) { const part = Object.assign(cl(q), { nodes: ns, cut: {}, craters: [] }); delete part.id; IC.aptAddPart(ap, part, q.built); keep.added.push(part.id); }
    }
    keep.ends = ends;
  }
  // (and the nodes they use: taking up the pier's own taxilanes on undo would drop them)
  keep.nodes = {}; for (const o of keep.parts) for (const id of (o.nodes || []).concat((o.free || []).map(f => f.via).filter(Boolean))) if (ap.nodes[id]) keep.nodes[id] = { x: ap.nodes[id].x, y: ap.nodes[id].y };
  ap.dirty = true; IC.resolveNodes(ap);
  return keep;
}
/* undo of a cut: the parts as they were, the pieces made from them gone */
IC.attachRestore = function (S, ap, keep) {
  ap.parts = ap.parts.filter(p => !keep.added.includes(p.id));
  for (const id in keep.nodes || {}) if (!ap.nodes[id]) ap.nodes[id] = { id, x: keep.nodes[id].x, y: keep.nodes[id].y, on: null };
  // (in their old places in the list, with only the fields they had)
  for (const o of keep.parts.slice().sort((a, b) => (keep.at[a.id] || 0) - (keep.at[b.id] || 0))) { const i = ap.parts.findIndex(p => p.id === o.id);
    if (i >= 0) { const p = ap.parts[i]; for (const k of Object.keys(p)) if (!(k in o) && k !== 'stands') delete p[k]; Object.assign(p, o, { _sh: null, _shk: null }); }
    else ap.parts.splice(Math.min(keep.at[o.id] != null ? keep.at[o.id] : ap.parts.length, ap.parts.length), 0, o); }
  ap.dirty = true; IC.resolveNodes(ap);
};

/* the plan for the build bar's ghost and the Build button (builder.js's planOf) */
IC.piecePlan = function (S, m, hv, out) {
  const ap = m.ap, K = IC.PIECES[m.part], P = placeOf(S, m, hv);
  if (!P.L) { out.ok = false; out.why = P.why || ''; if (K.line && m.pts.length) out.text.push(P.why || 'Click the other end'); else if (K.line) out.text.push('Click where one end goes, then the other (or drag from end to end)'); return out; }
  const key = [m.part, P.x.toFixed(2), P.y.toFixed(2), P.rot.toFixed(3), m._pcK, ap.parts.length, ap.nodeN, Math.round(S.budget)].join('|');
  if (m._ppK !== key) {
    m._ppK = key;
    const C = IC.bldBlueprintCheck(S, ap, P.L, P.x, P.y, P.rot, P.skip), X = IC.layoutXf(P);
    // links from the piece's lane ends to the nearest taxiway
    const links = [];
    for (const j of P.L.joins || []) { const J = X(j.x, j.y), l = joinOf(S, ap, J, P.skip, P.polys && P.polys.slice(P.L.aprons.length));
      // (a pier's tip joins a taxiway out ahead of it, never one back beside the terminal)
      if (l && (!P.u || (l.to.x - l.from.x) * P.u.x + (l.to.y - l.from.y) * P.u.y > 0.3 * l.len)) links.push(l); }
    const linkCost = links.reduce((a, l) => a + IC.partCost(ap, { kind: 'taxi', pts: [l.from, l.to] }), 0);
    // a runway planned without one gets a landing system at each end it lacks
    const ils = P.around ? ['a', 'b'].filter(e => !ap.parts.some(q => q.kind === 'ils' && q.rw === P.around.id && q.end === e)) : [];
    // a pier: the stands it takes up, and none of them with an aircraft on it
    if (P.cuts && C.ok) { const gone = attachGone(ap, P); P.gone = gone.length; const occ = gone.find(s => s.occ); if (occ) Object.assign(C, { ok: false, why: 'An aircraft stands where the pier goes: wait until it leaves.' }); }
    m._pp = { C, links, linkCost, ils, P };
  }
  const { C, links, linkCost, ils } = m._pp;
  out.bp = { x: P.x, y: P.y, rot: P.rot, t: C.t }; out.piece = { links, ils, P: m._pp.P };
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
    const gone = m._pp.P.gone;
    if (gone) bits.push(`${gone} stand${gone > 1 ? 's' : ''} in its way taken up`);
    if (gone && gone >= st) out.warn.push(`It takes up ${gone} stands for ${st}: point farther out for a longer pier, or find a wall with more room in front.`);
    if (P.around) bits.push(`round ${P.around.name || 'the runway'}`);
    else if (P.onSurvey) bits.push('on the surveyed runway');
    out.text.push(`${K.name}: ${bits.join(' · ')}${bits.length ? ' · ' : ''}${U.money(out.cost)}, paid as the work runs · ${K.line ? 'R: taxiway on the other side' : K.attach ? 'R turns it 15°' : 'R turns it'}`);
  }
  return out;
};
/* Build: plan the piece, its links and landing systems, as one step to undo */
IC.pieceBuild = function (S, m, plan) {
  const ap = m.ap, K = IC.PIECES[m.part], P = plan.piece.P, u0 = (ap.undo = ap.undo || []).length;
  // (a pier: the apron in its way cut round it first, and put back if the pier cannot be planned)
  const keep = P.cuts ? attachCut(S, ap, P) : null;
  const made = IC.bldBlueprint(S, ap, P.L, P.x, P.y, P.rot, keep ? new Set([...P.skip, ...keep.added]) : P.skip);
  if (!made) { if (keep) IC.attachRestore(S, ap, keep); return null; }
  // its side lanes joined to the two ends of the taxilane it split
  if (keep && keep.ends) { const X = IC.layoutXf(P);
    for (const r of P.L.roots) { const e = ap.nodes[keep.ends[r.sg]], f = X(r.first.x, r.first.y); if (e && U.dist(e, f) > 0.02) { const q = IC.aptPlanTaxi(S, ap, [{ x: e.x, y: e.y }, f], 0.1); if (q) made.push(q); } } }
  for (const l of plan.piece.links) { const q = IC.aptPlanTaxi(S, ap, [l.from, l.to], 0.1); if (q) made.push(q); }
  for (const e of plan.piece.ils) { const rw = P.around, q = rw && IC.aptPlanPart(S, ap, 'ils', rw[e].x, rw[e].y); if (q) made.push(q); }
  // (one step to undo: everything this Build planned)
  const ids = []; while (ap.undo.length > u0) { const top = ap.undo.pop(); if (Array.isArray(top)) ids.push(...top); else if (typeof top === 'string') ids.push(top); else { ap.undo.push(top); break; } }
  ap.undo.push(keep ? { ids, restore: keep } : ids);
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
  else if (PC.attach) m.turn = U.clamp((m.turn || 0) + (dir || 1), -6, 6);
  else { m.rot = (m._pp && !m.rotHand ? m._pp.P.rot : m.rot || 0) + (dir || 1) * (fine ? Math.PI / 12 : Math.PI / 2); m.rotHand = true; }
  return true;
};
/* after Found, the surveyed runway as a placed plan, ready to Build: the runway alone when the bar is the parts
   (wave 12) and the player lays its taxiways; else the Runway with taxiways piece */
IC.pieceFromSurvey = function (S, ap, k) {
  const sv = ap.survey; if (!sv) return null;
  const m = IC.bldMode(S, ap, k || (IC.FOCUS.parts ? 'runway' : 'rwkit')), d = { x: Math.cos(sv.a), y: Math.sin(sv.a) }, h = (sv.len || 30) / 2;
  m.pts = [{ x: sv.x - d.x * h, y: sv.y - d.y * h }, { x: sv.x + d.x * h, y: sv.y + d.y * h }];
  m.set = true; m.at = m.pts[1]; m.tol = 0.12; m.fromSurvey = true;
  return m;
};

})(window.IC);
