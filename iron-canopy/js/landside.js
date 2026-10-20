/* Iron Canopy — the landside of an airport, generated. A new airport gets an access road to the road network, paid
   for and shown like any road works (growth.js builds it). As passengers and cargo grow, the airport fills in by
   itself on the side of the terminal away from the aprons (brief 61, the front side): a kerb road along the terminal
   and a forecourt loop bowed out in front of it, a bus stop (a rail station when it is busy and a railway runs close)
   and a taxi rank on the forecourt, short-stay parking inside the loop, then an airport road curving away towards the
   road network with car parks along it, each shaped to the free ground it is given, parking garages, hotels and
   offices; cargo warehouses beside the cargo sheds. Parking is sized to the passengers: a car park full means
   travellers who choose another airport (IC.landAccessF). Developers build it (L.auto, which the player can turn off)
   and pay rent; car parks the player draws count too. Drawn in render-airport.js. */
(function (IC) {
'use strict';
const U = IC.U;

/* what each item is, how big (units: 100 m), what it holds and earns (₭M an hour at full use) */
IC.LAND = {
  park:      { name: 'Car park', w: 1.2, h: 0.8, cap: 400, earn: 0.08, what: 'spaces' },
  garage:    { name: 'Parking garage', w: 1.2, h: 0.8, cap: 1900, earn: 0.3, what: 'spaces' },
  taxi:      { name: 'Taxi and rental cars', w: 0.8, h: 0.4, cap: 120, earn: 0.05, what: 'cars' },
  stop:      { name: 'Bus and coach stop', w: 0.6, h: 0.3, cap: 1, earn: 0.02, what: '' },
  hotel:     { name: 'Hotel', w: 0.5, h: 0.4, cap: 250, earn: 0.15, what: 'rooms' },
  office:    { name: 'Offices', w: 0.6, h: 0.5, cap: 800, earn: 0.1, what: 'desks' },
  warehouse: { name: 'Cargo warehouse', w: 1.0, h: 0.6, cap: 40, earn: 0.1, what: 't an hour' }
};
IC.STATEMENT.landside = 'Airport car parks, hotels and rents';
/* parking: spaces wanted for each passenger an hour (fewer at a big airport, where more come by train and coach),
   cars a hectare of surface car park holds with its aisles, a garage's levels, rent a space pays an hour (₭M) */
IC.LAND_PARK = { perPax: 4, lot: 350, garage: 400, lvls: 5, earn: 0.00011, maxLots: 24 };

/* the side of a terminal or shed away from its aprons: +1 or −1 along its local y */
function landSide(ap, t) {
  let s = 0;
  for (const q of ap.parts) if (q.kind === 'apron' && q.w && IC.rectGap(q, t) < 0.6) s += IC.rectLocal(t, q).y > 0 ? -1 : 1;
  if (s) return Math.sign(s);
  const c = ap.cityRef;
  return c ? (IC.rectLocal(t, c).y >= 0 ? 1 : -1) : 1;
}
IC.landSide = landSide;
/* ---------- a terminal's front side (brief 61) ---------- */
/* Laid out like a real terminal front rather than in rows: the kerb road along the terminal face, a one-way
   forecourt loop round in front of it with its far side bowed out, and an airport road leaving the far side and
   curving away towards the road network. The bus stop and the taxi rank stand on the forecourt by the kerb's ends,
   short-stay parking (a car park, or garages at a busy airport) fills the loop, hotels stand beside the forecourt,
   and the long-stay car parks, more garages, hotels and offices line the airport road, nearest first, both sides
   in turn. A car park is given a plot along the road and takes the free ground in it (fitLot): it stops at a
   country road, a river, the airfield, or the car park next to it, so no two are the same shape. Everything is in
   the terminal's own frame: W(s, d) is s along its face from its middle and d out from the face (units: 100 m). */
const KERB_D = 0.2, FORE = 1.5, BULGE = 0.6, APP_W = 0.14;
IC.LAND_DEPTH = FORE + BULGE + 0.3;
const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
/* corners cut off a polyline twice over (Chaikin), its two ends kept where they are: a road drawn round, not angled */
function smooth(P, n) {
  for (let k = 0; k < n; k++) { const Q = [P[0]]; for (let i = 0; i < P.length - 1; i++) { if (i > 0) Q.push(lerp(P[i], P[i + 1], 0.25)); if (i < P.length - 2) Q.push(lerp(P[i], P[i + 1], 0.75)); } Q.push(P[P.length - 1]); P = Q; }
  return P;
}
/* a polyline's lengths from its start */
const cumOf = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + U.dist(P[i - 1], P[i])); return c; };
/* the point s along a polyline, with its unit direction */
function along(P, c, s) {
  let i = 1; while (i < P.length - 1 && c[i] < s) i++;
  const a = P[i - 1], b = P[i], L = c[i] - c[i - 1] || 1e-9, f = U.clamp((s - c[i - 1]) / L, 0, 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L };
}
/* the stretch of a polyline from s0 to s1, moved off it by o (+ to the left of the way it runs) */
function stretch(P, c, s0, s1, o) {
  const out = [], n = Math.max(2, Math.ceil((s1 - s0) / 0.15) + 1);
  for (let k = 0; k < n; k++) { const q = along(P, c, s0 + (s1 - s0) * k / (n - 1)); out.push({ x: q.x - q.uy * o, y: q.y + q.ux * o }); }
  return out;
}
/* a terminal's front: its frame and the lines of its roads, worked out again when the terminal or airport changes */
function front(S, ap, t) {
  const side = landSide(ap, t), key = [t.x, t.y, t.a, t.w, t.h, side, ap.parts.length, ap.nodeN].join();
  if (t._fr && t._fr.key === key) return t._fr;
  const hk = Math.max(t.w / 2 - 0.1, 0.5), X = hk + 0.1;
  const L = (s, d) => IC.rectWorld(t, s, side * (t.h / 2 + d));
  // which way the road network lies, in the terminal's frame: the airport road curves towards it
  const to = (ap.land && ap.land.access && ap.land.access.pts[0]) || ownRoadEnd(S, ap) || ap.cityRef || null;
  const lt = to ? IC.rectLocal(t, to) : { x: 0 }, sg = Math.abs(lt.x) > 1 ? Math.sign(lt.x) : (U.hash(t.x * 7, t.y * 3) < 0.5 ? -1 : 1);
  const sA = sg * Math.min(X * 0.4, 1.2);
  // the loop, local (s, d): up the far leg, round the bowed far side, down the near leg, its corners rounded
  const far = []; for (let k = 0; k <= 10; k++) { const s = X - 2 * X * k / 10; far.push({ x: s, y: FORE + BULGE * (1 - (s / X) * (s / X)) }); }
  const loopL = smooth([{ x: X, y: KERB_D }].concat(far, [{ x: -X, y: KERB_D }]), 3);
  // where the airport road leaves the far side: the point of the loop at sA
  let d0 = FORE + BULGE * (1 - (sA / X) * (sA / X));
  for (let i = 1; i < loopL.length; i++) { const a = loopL[i - 1], b = loopL[i]; if (a.y > FORE * 0.8 && (a.x - sA) * (b.x - sA) <= 0 && a.x !== b.x) { d0 = a.y + (b.y - a.y) * (sA - a.x) / (b.x - a.x); break; } }
  // the airport road, local: out from the loop, curving more as it goes (towards the network), every 25 m
  // (as long as the terminal is big: 300 m before a small one, 800 m before the largest)
  // (and on a little further, where the country's road comes in)
  const MAX = U.clamp(t.w * 0.5 + 2, 3, 8), appL = []; for (let u = 0; u <= MAX + 1 + 1e-6; u += 0.25) appL.push({ x: sA + sg * 0.09 * Math.pow(u, 1.5), y: d0 + u });
  const toW = P => P.map(q => L(q.x, q.y));
  const fr = { key, side, X, hk, sA, sg, L, kerb: [L(-X, KERB_D), L(X, KERB_D)], loop: toW(loopL), app: toW(appL) };
  fr.appC = cumOf(fr.app);
  // as far as the airport road may go: up to the first thing in its way (the airfield, another building, a
  // country road), less room to turn into what it meets. (The country's road to this airport is brought to the
  // airport road's end, IC.landGate: it is not in the way.)
  const B = frontBlocks(S, ap, t, true).filter(b => b.road !== 'ownworld');
  let free = MAX;
  for (let i = 1; i < fr.app.length && fr.appC[i - 1] < MAX && free === MAX; i++) { const seg = [fr.app[i - 1], fr.app[i]]; if (B.some(b => IC.shapeDepth(IC.shapeLine(seg, APP_W / 2 + b.pad), b.sh) > 0.005)) free = Math.max(0, fr.appC[i - 1] - 0.3); }
  fr.free = free;
  return (t._fr = fr);
}
IC.landFront = front;
/* the far end of the country's road that serves the airport (the way to the network), or null */
function ownRoadEnd(S, ap) {
  const E = (S.world.edges || []).filter(e => e.a === ap.id || e.b === ap.id || e.apt === ap.id);
  let best = null, bd = 0;
  for (const e of E) for (const q of [e.pts[0], e.pts[e.pts.length - 1]]) { const d = U.dist(q, ap); if (d > bd) { bd = d; best = q; } }
  return best;
}
/* what a terminal's front side must keep off: the airfield, other buildings, railways, the country's roads, other
   landside items, and (unless bare) its own kerb, loop and airport road as planned; each with the room to keep */
/* (the airport and the country round it as shapes, kept while nothing changes: placing an item asks many times) */
let EL = null;
function elems(S, ap) {
  const k = [S.time, ap.id, ap.parts.length, ap.nodeN, ap.land ? ap.land.ver : 0, ap.land ? ap.land.roads.length : 0, (S.world.edges || []).length].join();
  if (!EL || EL.k !== k || EL.S !== S) EL = { k, S, E: IC.aptElements(S, ap) };
  return EL.E;
}
function frontBlocks(S, ap, t, bare) {
  const out = [];
  for (const e of elems(S, ap)) {
    if (e.cat === 'rwy') out.push({ sh: e.strip, pad: 0.05 });
    else if (e.cat === 'twy') out.push({ sh: e.sh, pad: 0.16 });
    else if (e.cat === 'apron' || e.cat === 'bld' || e.cat === 'rail') out.push({ sh: e.sh, pad: 0.06 });
    else if (e.cat === 'road' && e.world) out.push({ sh: e.sh, pad: 0.08, road: e.ownRoad ? 'ownworld' : 'world' });
    // (roads out to the network are laid again round whatever is built)
    else if (e.cat === 'road' && e.land && !e.land.out && e.land.by !== t.id) out.push({ sh: e.sh, pad: 0.05, road: 'land' });
    else if ((e.cat === 'land' || e.cat === 'park') && e.own) out.push({ sh: e.sh, pad: 0.05, it: e.it });
  }
  if (!bare) {
    const fr = front(S, ap, t);
    out.push({ sh: IC.shapeLine(fr.kerb, 0.07), pad: 0.04, road: 'own' }, { sh: IC.shapeLine(fr.loop, 0.06), pad: 0.04, road: 'own' });
    if (fr.free > 0.2) out.push({ sh: IC.shapeLine(stretch(fr.app, fr.appC, 0, fr.free, 0), APP_W / 2), pad: 0.04, road: 'own' });
  }
  return out;
}
/* the free ground inside an outline P (world points), off everything in B: cells 5 m across, the largest piece of
   them traced and straightened. null when it is less than min hectares (units squared) */
function fitLot(S, P, B, min) {
  const c = 0.05, bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of P) { bb[0] = Math.min(bb[0], q.x); bb[1] = Math.min(bb[1], q.y); bb[2] = Math.max(bb[2], q.x); bb[3] = Math.max(bb[3], q.y); }
  const box = [bb[0] - c, bb[1] - c, bb[2] + c, bb[3] + c], nx = Math.ceil((box[2] - box[0]) / c), ny = Math.ceil((box[3] - box[1]) / c);
  if (nx * ny > 2e5) return null;
  const near = B.filter(b => b.sh.bb[0] - b.pad < box[2] && b.sh.bb[2] + b.pad > box[0] && b.sh.bb[1] - b.pad < box[3] && b.sh.bb[3] + b.pad > box[1]);
  const PA = P.map(q => [q.x, q.y]), F = new Uint8Array(nx * ny), W = S.world;
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = box[0] + (i + 0.5) * c, y = box[1] + (j + 0.5) * c;
    if (!U.inPoly(x, y, PA)) continue;
    let ok = true; for (const b of near) if (IC.shapeDist(b.sh, { x, y }) < b.pad + c * 0.5) { ok = false; break; }
    if (ok && W.inLake && W.inLake(x, y)) ok = false;
    if (ok) { F[j * nx + i] = 1; n++; }
  }
  if (n * c * c < min) return null;
  if (IC.cellLargest(F, nx, ny) * c * c < min) return null;
  const out = IC.cellOutline(F, nx, ny, box, c, 0.035);
  if (!out || IC.polyArea(out) < min) return null;
  // (rivers, the country's edge and towns: the outline's corners and middle keep off them, as other items do)
  const probe = out.concat([{ x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 }]).filter(q => U.inPoly(q.x, q.y, PA));
  for (const q of probe) if (!IC.inHome(q.x, q.y) || (IC.onRiver && IC.onRiver(q.x, q.y))) return null;
  if (townIn(S, out)) return null;
  return out;
}
/* a town's built blocks in an outline */
function townIn(S, P) {
  const PA = P.map(q => [q.x, q.y]), c = P.reduce((a, q) => ({ x: a.x + q.x / P.length, y: a.y + q.y / P.length }), { x: 0, y: 0 });
  const R = Math.max(...P.map(q => U.dist(q, c)));
  for (const city of IC.cities(S)) { if (U.dist(city, c) > (city.r || 20) * 1.6 + 5 + R) continue; for (const b of city.blocks || []) if (b.hp > 0 && U.dxy(b.x, b.y, c.x, c.y) < R + 1 && (U.inPoly(b.x, b.y, PA) || P.some(q => U.dxy(q.x, q.y, b.x, b.y) < Math.max(b.w, b.h) * 0.4))) return true; }
  return false;
}
/* a building on the front side, a rectangle: free of B with a little room, on dry ground in the country, out of town */
function bldFree(S, ap, r, B) {
  const sh = IC.shapePoly(IC.partOutline({ x: r.x, y: r.y, a: r.a, w: r.w + 0.08, h: r.h + 0.08 }));
  for (const b of B) if (IC.shapeDepth(sh, b.sh) > 0.005) return false;
  return free(S, ap, r, []);
}
const lotOf = (kind, P, by, zone) => { const it = IC.polyPart(kind, P); return Object.assign(it, { cap: Math.round(IC.partArea(it) * (kind === 'garage' ? IC.LAND_PARK.garage * IC.LAND_PARK.lvls : IC.LAND_PARK.lot)), t0: null, by, zone }); };
/* a building on the front side; hotels and offices each their own size (k: what it is sized by, 0..1) */
const boxOf = (kind, c, a, by, zone, k) => { const D = IC.LAND[kind], f = kind === 'hotel' || kind === 'office' ? 0.8 + 0.6 * (k || 0) : 1, g = kind === 'hotel' || kind === 'office' ? 0.85 + 0.4 * U.hash((k || 0) * 977, 5) : 1; return { kind, x: c.x, y: c.y, a, w: D.w * f, h: D.h * g, cap: kind === 'garage' ? Math.round(D.w * D.h * IC.LAND_PARK.garage * IC.LAND_PARK.lvls) : D.cap, t0: null, by, zone, lvls: kind === 'garage' ? IC.LAND_PARK.lvls : undefined }; };
/* where the next item of a kind goes on a terminal's front side, or null: the forecourt for the stop, the taxi rank
   and short-stay parking, its corners for the first hotels, then the airport road */
function placeFront(S, ap, t, kind, L) {
  const fr = front(S, ap, t), mine = L.items.filter(it => it.by === t.id), B = frontBlocks(S, ap, t);
  const a = t.a || 0, W = (s, d) => fr.L(s, d);
  // on the forecourt: the bus stop and the taxi rank at the kerb's two ends, short-stay parking filling the loop
  if (kind === 'stop' || kind === 'taxi') {
    const D = IC.LAND[kind], s = (kind === 'stop' ? -1 : 1) * (fr.X - 0.16 - D.w / 2), r = boxOf(kind, W(s, KERB_D + 0.17 + D.h / 2), a, t.id, 'fore');
    return bldFree(S, ap, r, B) ? r : null;
  }
  // short stay inside the loop: at a busy airport a row of garages across the kerb from the doors, from the middle
  // out; and a car park in the ground left over (the whole loop, at a quieter one)
  if (kind === 'garage' && !mine.some(it => it.zone === 'in' && it.kind === 'park')) {
    const D = IC.LAND.garage, n = Math.max(1, Math.floor((2 * fr.X - 1.9) / (D.w + 0.14)));
    for (let i = 0; i < n; i++) { const k = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), s = (k + (n % 2 ? 0 : 0.5)) * (D.w + 0.14); if (Math.abs(s) + D.w / 2 > fr.X - 0.9) continue; const r = boxOf('garage', W(s, KERB_D + 0.24 + D.h / 2), a, t.id, 'in'); if (bldFree(S, ap, r, B)) return r; }
  }
  if (kind === 'park' && !mine.some(it => it.zone === 'in' && it.kind === 'park')) { const P = fitLot(S, fr.loop.concat([fr.kerb[0]]), B, 0.3); if (P) return lotOf('park', P, t.id, 'in'); }
  if ((kind === 'hotel' || kind === 'office') && !mine.some(it => it.zone === 'corner' && it.kind === kind)) {
    // the forecourt's corners, beside its legs: the hotel by the terminal
    for (const k of kind === 'hotel' ? [-fr.sg || 1, fr.sg || -1] : [fr.sg || 1]) { const D = IC.LAND[kind], r = boxOf(kind, W(k * (fr.X + 0.14 + D.w / 2), KERB_D + 0.1 + D.h / 2), a, t.id, 'corner'); if (bldFree(S, ap, r, B)) return r; }
  }
  // along the airport road: each side has a cursor, the distance along the road its next plot starts at
  const C = (L.cur = L.cur || {})[t.id] = (L.cur[t.id] || { r: 0.3, l: 0.3 });
  for (let tries = 0; tries < 16; tries++) {
    const sd = C.r <= C.l ? 'r' : 'l', o = sd === 'r' ? -1 : 1, s0 = C[sd];
    if (s0 > fr.free - 0.3) { if (C.r > fr.free - 0.3 && C.l > fr.free - 0.3) return null; C[sd] = 1e9; continue; }
    const h = k => U.hash(Math.round(s0 * 10) + k * 31, idNum(t) + o);
    if (kind === 'park') {
      // a plot: from the road's verge out by a depth, its far corners cut back by different amounts
      // a plot: from the road's verge out to a far edge that is straight but not parallel (deeper at one end), its
      // ends square to the road, one far corner cut off
      const len = Math.min(1.3 + 1.1 * h(1), fr.free - s0), d0 = 1.0 + 1.0 * h(2), d1 = 1.0 + 1.0 * h(3), cut = 0.15 + 0.35 * h(4), v = APP_W / 2 + 0.06;
      if (len < 0.6) { C[sd] = s0 + 0.3; continue; }
      const nearE = stretch(fr.app, fr.appC, s0, s0 + len, o * v), e0 = along(fr.app, fr.appC, s0), e1 = along(fr.app, fr.appC, s0 + len);
      const off = (q, d) => ({ x: q.x - q.uy * o * d, y: q.y + q.ux * o * d });
      const f0 = off(e0, v + d0), f1 = off(e1, v + d1), cx = h(5) < 0.5;
      const farE = cx ? [f0, lerp(f1, f0, cut / len), lerp(f1, off(e1, v), cut / Math.max(d1, 0.5))] : [lerp(f0, off(e0, v), cut / Math.max(d0, 0.5)), lerp(f0, f1, cut / len), f1];
      const P = fitLot(S, nearE.concat(farE.reverse()), B, Math.max(0.3, len * Math.min(d0, d1) * 0.3));
      if (P) { C[sd] = s0 + len + 0.1; return lotOf('park', P, t.id, 'road'); }
      C[sd] = s0 + 0.4; continue;
    }
    // a building facing the road: hotels, offices, garages
    const z = boxOf(kind, { x: 0, y: 0 }, 0, t.id, 'road', h(6)), q = along(fr.app, fr.appC, s0 + z.w / 2), off = o * (APP_W / 2 + 0.08 + z.h / 2 + 0.12 * h(7));
    const r = Object.assign(z, { x: q.x - q.uy * off, y: q.y + q.ux * off, a: Math.atan2(q.uy, q.ux) });
    if (s0 + r.w < fr.free && bldFree(S, ap, r, B)) { C[sd] = s0 + r.w + 0.15 + 0.2 * h(8); return r; }
    C[sd] = s0 + 0.3;
  }
  return null;
}
const idNum = t => { let h = 0; for (const ch of String(t.id)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
/* how far a terminal's airport road runs: laid in full with the front side, the car parks then line it */
const appLen = (ap, fr) => fr.free;
/* where the country's road meets a terminal's front side: just beyond the end of its airport road */
IC.landGate = function (S, ap, t) {
  const fr = front(S, ap, t);
  if (fr.free < 0.5) return null;
  return along(fr.app, fr.appC, fr.free + 0.6);
};

/* ---------- cargo sheds: warehouses in rows ---------- */
/* A cargo shed's landside is laid out in rows: the kerb road along the shed, then a band of warehouses or two with
   a road beyond each band, the rows joined at both ends into one loop. Items front onto the road on the shed's side
   of their band, so no driveway crosses anything. BANDS are the distances of each band from the shed's face. */
const BANDS = [[0.34, 1.0], [1.22, 2.08]];
const ROW = k => BANDS[k][1] + 0.11, KERB = 0.2;
const depthOf = t => t.kind === 'cargo' ? ROW(1) + 0.12 : IC.LAND_DEPTH;
const halfLen = t => Math.max(t.w / 2 + 1.2, 3.2);
/* the ground a building's landside may take, in its frame: a shed's loop at its full size; a terminal's forecourt,
   and its airport road as far as it reaches now */
IC.landEnvelope = function (ap, t, side, S) {
  const sd = side || landSide(ap, t), fr = t.kind !== 'terminal' ? null : S ? front(S, ap, t) : t._fr;
  if (fr) {
    // (the forecourt, then the airport road's corridor out and back, the side nearer the forecourt's corner first)
    const s = Math.max(0.3, appLen(ap, fr)), P = [fr.L(-fr.X - 0.3, 0), fr.L(fr.X + 0.3, 0), fr.L(fr.X + 0.3, FORE + 0.2)];
    const A = stretch(fr.app, fr.appC, 0, s, -0.5), Z = stretch(fr.app, fr.appC, 0, s, 0.5), [p, q] = U.dist(A[0], P[2]) < U.dist(Z[0], P[2]) ? [A, Z] : [Z, A];
    return IC.shapePoly(P.concat(p, q.reverse(), [fr.L(-fr.X - 0.3, FORE + 0.2)]));
  }
  const X = halfLen(t) + 0.3, D = depthOf(t);
  const c = IC.rectWorld(t, 0, sd * (t.h / 2 + D / 2));
  return IC.shapePoly(IC.partOutline({ x: c.x, y: c.y, a: t.a || 0, w: 2 * X, h: D }));
};
/* the envelope keeps off the airfield: no runway strip, taxiway or apron in it (buildings in it stand on the landside) */
IC.landClear = function (ap, t, env) {
  for (const e of IC.aptElements(null, ap, { noWorld: true })) {
    const sh = e.cat === 'rwy' ? e.strip : e.cat === 'twy' ? IC.shapeLine(e.sh.line, e.sh.r + 0.1) : e.cat === 'apron' ? e.sh : null;
    if (sh && IC.shapeDepth(sh, env) > 0.01) return false;
  }
  return true;
};
/* candidate plots for a warehouse in a shed's bands, nearest band first, each band spreading from the middle */
function plots(t, side, kind) {
  const out = [], D = IC.LAND[kind], X = halfLen(t);
  for (const k of [0, 1]) {
    if (D.h > BANDS[k][1] - BANDS[k][0] + 1e-6 || ROW(k) > depthOf(t)) continue;
    for (let i = 0; i < 40; i++) {
      const n = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), x = n * (D.w + 0.12) / 2;
      if (Math.abs(x) + D.w / 2 > X) continue;
      out.push(Object.assign(IC.rectWorld(t, x, side * (t.h / 2 + BANDS[k][0] + D.h / 2)), { band: k }));
    }
  }
  return out;
}
/* what a shed's landside must keep off: the airfield, other buildings, the country's roads and other buildings' landside */
function blockers(S, ap, by) {
  const out = [];
  for (const e of elems(S, ap)) {
    if (e.cat === 'rwy') out.push(e.strip);
    else if (e.cat === 'twy') out.push(IC.shapeLine(e.sh.line, e.sh.r + 0.12));
    else if (e.cat === 'apron' || e.cat === 'bld' || e.cat === 'rail') out.push(e.sh);
    else if (e.cat === 'road' && (e.world || (e.land && e.land.by !== by))) out.push(e.sh);
    else if ((e.cat === 'land' || e.cat === 'park') && e.own) out.push(e.sh);
  }
  return out;
}
/* a plot is free when it keeps off all that, water, the country's edge and towns */
function free(S, ap, r, B) {
  const W = S.world;
  if (!IC.inHome(r.x, r.y) || (W.inLake && W.inLake(r.x, r.y)) || (IC.onRiver && IC.onRiver(r.x, r.y))) return false;
  const sh = IC.shapePoly(IC.partOutline({ x: r.x, y: r.y, a: r.a, w: r.w + 0.04, h: r.h + 0.04 }));
  for (const b of B) if (IC.shapeDepth(sh, b) > 0.005) return false;
  for (const c of IC.cities(S)) { if (U.dist(c, r) > (c.r || 20) * 1.6 + 5) continue; for (const b of c.blocks || []) if (b.hp > 0 && U.dxy(b.x, b.y, r.x, r.y) < Math.max(r.w, r.h) / 2 + Math.max(b.w, b.h) * 0.4) return false; }
  return true;
}
function place(S, ap, kind, near) {
  const D = IC.LAND[kind];
  for (const t of near) {
    if (t.kind === 'terminal') {
      if (!loopFits(S, ap, t, landSide(ap, t), blockers(S, ap, t.id))) continue;
      const it = placeFront(S, ap, t, kind, ap.land);
      if (it) return it;
      continue;
    }
    const side = landSide(ap, t), B = blockers(S, ap, t.id);
    // (a building whose loop road cannot be laid gets no landside)
    if (!loopFits(S, ap, t, side, B)) continue;
    for (const c of plots(t, side, kind)) {
      const r = { kind, x: c.x, y: c.y, a: t.a, w: D.w, h: D.h, cap: D.cap, t0: null, by: t.id, band: c.band };
      if (free(S, ap, r, B)) return r;
    }
  }
  return null;
}
/* the loop at its full size keeps off the airfield and the other buildings (a terminal's forecourt loop and kerb) */
function loopFits(S, ap, t, side, B) {
  if (t.kind === 'terminal') {
    const fr = front(S, ap, t), sh = [IC.shapeLine(fr.loop, 0.07), IC.shapeLine(fr.kerb, 0.07)];
    return !B.some(b => sh.some(s => IC.shapeDepth(s, b) > 0.005));
  }
  const X = halfLen(t) + 0.15, D = t.h / 2 + depthOf(t) - 0.12;
  const pts = [IC.rectWorld(t, -X, side * (t.h / 2 + KERB)), IC.rectWorld(t, X, side * (t.h / 2 + KERB)), IC.rectWorld(t, X, side * D), IC.rectWorld(t, -X, side * D)];
  const sh = IC.shapeLine(pts.concat([pts[0]]), 0.07);
  return !B.some(b => IC.shapeDepth(sh, b) > 0.005);
}
IC.landInit = ap => ap.land || (ap.land = { items: [], pax: 0, cargo: 0, ver: 0, road: false, roads: [], t: 0 });

/* every ten game minutes: follow the passengers and cargo, add what is missing, and pay the income */
IC.landsideTick = function (S, ap, dt) {
  if (ap.kind !== 'airport' || ap.owner !== 'us') return;
  const L = IC.landInit(ap);
  L.t -= dt;
  if (L.t > 0) return;
  L.t = 600;
  IC.aptReseat(S, ap);
  // passengers and cargo, averaged over some hours so a busy hour does not build a hotel
  const cargoH = (ap.mvLog || []).filter(x => x.type === 'cargo' && x.k === 'arr').length * 60;
  L.pax += ((ap.paxRate || 0) - L.pax) * 0.05; L.cargo += (cargoH - L.cargo) * 0.05;
  if (!L.road) L.road = hasRoad(S, ap);
  const terms = ap.parts.filter(p => p.kind === 'terminal' && p.built && p.hp > p.max * 0.25);
  const sheds = ap.parts.filter(p => p.kind === 'cargo' && p.built && p.hp > p.max * 0.25);
  const rail = railNear(S, ap);
  let added = null;
  // (a landside laid out from real data is kept as it is: it only earns; with the developers turned off, nothing new)
  if (!L.fixed && L.auto !== false) for (const k of IC.landWant(S, ap, L, terms.length, sheds.length, rail)) {
    // (no room for another car park: tried again when the airport changes, or after six hours)
    if (k === 'park' && L.noRoom && L.noRoom.k === ap.parts.length && S.time - L.noRoom.t < 6 * 3600) continue;
    const it = place(S, ap, k, k === 'warehouse' ? sheds : terms);
    if (!it) { if (k === 'park') L.noRoom = { k: ap.parts.length, t: S.time }; continue; }
    it.t0 = S.time; if (k === 'stop' && L.pax > 2500 && rail) { it.rail = true; it.name = 'Rail station'; }
    L.items.push(it); L.ver++; added = it;
    break;   // one at a time: the landside grows over hours, not in a moment
  }
  if (!L.fixed && (added || L.kerbN !== terms.length + sheds.length || L.deckN !== deckWant(S, ap, L))) kerbs(S, ap, terms.concat(sheds));
  // (the main terminal's airport road a good stretch longer: the country's road is brought to its new end)
  const main = ap.parts.filter(p => p.kind === 'terminal').sort((a, b) => IC.partArea(b) - IC.partArea(a))[0];
  if (main && main.built && L.items.some(it => it.by === main.id)) { const s = Math.round(front(S, ap, main).free * 2); if (s !== L.gateS) { L.gateS = s; L.gateV = (L.gateV || 0) + 1; } }
  if (added) { ap._box = null; const b = IC.partOutline(added).reduce((q, p) => ({ x0: Math.min(q.x0, p.x), y0: Math.min(q.y0, p.y), x1: Math.max(q.x1, p.x), y1: Math.max(q.y1, p.y) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }); IC.worldChanged && IC.worldChanged(S, { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 }); if (added.kind !== 'park' || L.items.filter(x => x.kind === 'park').length === 1) IC.log(S, 'info', 'AVIATION', `${ap.name}: ${added.name || IC.LAND[added.kind].name.toLowerCase()} ${/s$/.test(IC.LAND[added.kind].name) ? 'open' : 'opens'} by the ${added.kind === 'warehouse' ? 'cargo sheds' : 'terminal'}, built by private money: it pays the airport rent.`, S.story ? added : null); }
  // use and income: parking and hotels fill with passengers, warehouses with cargo; the player's own car parks too
  const A = IC.landAccess(S, ap);
  let v = 0;
  for (const it of L.items) { it.use = IC.landUse(L, it, A); v += (it.kind === 'park' || it.kind === 'garage' ? it.cap * IC.LAND_PARK.earn : IC.LAND[it.kind].earn) * it.use; }
  if (A.own) v += A.own * IC.LAND_PARK.earn * U.clamp(A.need / Math.max(1, A.have), 0.1, 1);
  L.earn = v;
  if (v > 0) { S.budget += v * 600 / 3600; IC.econBook(S, 'landside', v * 600 / 3600); }
  // travellers who find no space, or a kerb jammed with cars, choose another airport (growth.js, IC.landAccessF)
  const want = 1 - 0.3 * U.clamp((A.short - 0.1) / 0.9, 0, 1) - 0.1 * U.clamp((A.kerbShort - 0.1) / 0.9, 0, 1);
  L.accF = (L.accF == null ? 1 : L.accF) + (want - (L.accF == null ? 1 : L.accF)) * 0.15;
  if (A.short > 0.25 && !L.shortSaid && terms.length) { L.shortSaid = true; IC.log(S, 'warn', 'AVIATION', `${ap.name}: the car parks are full. Travellers bring about ${A.need.toLocaleString('en-US')} cars and there are ${A.have.toLocaleString('en-US')} spaces, so some choose another airport. ${L.auto === false ? 'Draw a car park by the terminal, or let developers build them (the airport panel).' : 'There is no free ground for more along the airport road: draw a car park on open ground, or move what is in the way.'}`, ap); }
  else if (A.short < 0.1) L.shortSaid = false;
};
/* what travellers need of the front side and what they find there: spaces for their cars (need, have: developers'
   and the player's own car parks, own: the player's alone), the share short, kerb to drop off at (units) */
IC.landAccess = function (S, ap) {
  const L = ap.land || {}, p = L.pax || 0, rail = (L.items || []).some(it => it.rail);
  const car = U.clamp(1 - (p - 1000) / 10000, 0.6, 1) * (rail ? 0.8 : 1);
  const need = p > 20 ? Math.round(p * IC.LAND_PARK.perPax * car) : 0;
  let have = 0, own = 0;
  for (const it of L.items || []) if (it.kind === 'park' || it.kind === 'garage') have += it.cap || 0;
  for (const q of ap.parts) if (q.kind === 'surface' && q.built && IC.SURF[q.surf] && IC.SURF[q.surf].park && !IC.aptInFence(ap, q)) own += Math.round(IC.SURF[q.surf].park * IC.partArea(q));
  have += own;
  // the kerb: cars stand a couple of minutes to drop their passengers, 7 m each; an upper deck doubles it
  const kerb = p * 0.55 / 1.6 * (2 / 60) * 0.07 * car;
  const term = new Set(ap.parts.filter(q => q.kind === 'terminal').map(q => q.id));
  let kerbHave = 0; for (const r of L.roads || []) if ((r.kerb || r.kind === 'upper') && term.has(r.by)) kerbHave += U.dist(r.pts[0], r.pts[r.pts.length - 1]);
  return { pax: p, need, have, own, short: need ? U.clamp(1 - have / need, 0, 1) : 0, kerb, kerbHave, kerbShort: kerb > 0.3 && L.roads && L.roads.length ? U.clamp(1 - kerbHave / kerb, 0, 1) : 0 };
};
/* how much the front side helps an airport draw travellers: 1, down to 0.6 with no parking and a jammed kerb */
IC.landAccessF = ap => ap.land && ap.land.accF != null ? ap.land.accF : 1;
/* the player's say over the front side (the airport panel): developers build it, or only what the player builds */
IC.landAct = function (S, ap, d) {
  const L = IC.landInit(ap);
  if (d.op === 'auto') { L.auto = d.v !== '0'; L.noRoom = null; IC.log(S, 'info', 'AVIATION', L.auto ? `${ap.name}: developers will build car parks, garages, hotels and offices by the terminal as passengers grow, and pay rent.` : `${ap.name}: nothing new is built on the front side unless you build it. Draw car parks with the Car park tool; travellers who find no space go elsewhere.`, ap); }
};
/* what the landside should add next for its traffic, in order: the first that fits is built */
IC.landWant = function (S, ap, L, terms, sheds, rail) {
  const p = L.pax, out = [], n = k => L.items.filter(x => x.kind === k).length;
  const ware = sheds && L.cargo > 5 && n('warehouse') < Math.min(6, Math.ceil(L.cargo / 40)) ? ['warehouse'] : [];
  if (!terms) return ware;
  const A = IC.landAccess(S, ap), inner = L.items.some(it => it.zone === 'in');
  if (p > 20 && !inner) out.push(p > 900 ? 'garage' : 'park');
  if (p > 80 && !n('stop')) out.push('stop');
  if (p > 150 && !n('taxi')) out.push('taxi');
  if (A.have < A.need) {
    // (a busy airport stacks its cars in garages, more of them the busier it is; the rest in car parks along the road)
    const gar = p > 900 ? Math.min(8, Math.ceil(p / 1500)) : 0;
    if (n('garage') < gar) out.push('garage');
    if (n('park') < IC.LAND_PARK.maxLots) out.push('park');
    if (n('garage') < 8 && p > 900) out.push('garage');
  }
  if (p > 600 && n('hotel') < Math.min(5, Math.floor(p / 600))) out.push('hotel');
  if (p > 1500 && n('office') < Math.min(4, Math.floor(p / 1500))) out.push('office');
  return out.concat(ware);
};
/* how full an item is, 0..1 */
IC.landUse = function (L, it, A) {
  const p = L.pax;
  if (it.kind === 'warehouse') return U.clamp(L.cargo / 40 / Math.max(1, L.items.filter(x => x.kind === 'warehouse').length), 0.2, 1);
  if (it.kind === 'park' || it.kind === 'garage') return A ? U.clamp(A.need / Math.max(1, A.have), 0.1, 1) : 0.5;
  return U.clamp(p / 1500, 0.3, 1);
};
/* terminals whose kerb is too short for their cars get an upper deck for departures */
function deckWant(S, ap, L) {
  if ((L.pax || 0) < 1500) return 0;
  const A = IC.landAccess(S, ap), T = ap.parts.filter(p => p.kind === 'terminal' && p.built && L.items.some(it => it.by === p.id));
  const have = T.reduce((a, t) => a + 2 * front(S, ap, t).X, 0);
  return have && have < A.kerb ? 1 : 0;
}
/* the roads of each building's landside, laid again as it grows: a terminal's kerb, its forecourt loop and its
   airport road, a shed's kerb, rows and loop; then the road out from each to the country's network (or the access
   road), round the airfield */
function kerbs(S, ap, bl) {
  const L = ap.land; if (L.fixed) return; L.kerbN = bl.length; L.roads = L.roads.filter(r => r.keep); L.jn = [];
  const deck = L.deckN = deckWant(S, ap, L);
  const outs = [];
  for (const t of bl) {
    const sd = landSide(ap, t), mine = L.items.filter(it => it.by === t.id);
    if (!mine.length && t.kind === 'cargo') continue;
    // (a concourse with aprons on both sides, or hemmed in, has no landside: passengers come by the terminal)
    if (!mine.length && !loopFits(S, ap, t, sd, blockers(S, ap, t.id))) continue;
    if (t.kind === 'terminal') {
      const fr = front(S, ap, t), s = appLen(ap, fr);
      const k = { pts: fr.kerb.slice(), w: 0.14, kind: 'kerb', by: t.id, kerb: true, oneway: 1 }; L.roads.push(k);
      if (deck) L.roads.push({ pts: fr.kerb.slice(), w: 0.16, kind: 'upper', lv: 1, by: t.id, oneway: 1 });
      L.roads.push({ pts: fr.loop.slice(), w: 0.12, kind: 'loop', by: t.id, oneway: 1 });
      if (fr.free >= 0.5) {
        const pts = stretch(fr.app, fr.appC, 0, s, 0);
        L.roads.push({ pts, w: APP_W, kind: 'approach', by: t.id, name: 'Airport road' });
        const e = pts[pts.length - 1], q = along(fr.app, fr.appC, s);
        outs.push({ t, from: e, n: { x: e.x + q.ux * 0.3, y: e.y + q.uy * 0.3 } });
      }
      continue;
    }
    const nb = Math.max(1, ...mine.map(it => (it.band != null ? it.band : 0) + 1)), y = d => sd * (t.h / 2 + d);
    // the loop is as long as what it serves: the building's front, or the items beyond it
    const X = Math.max(t.w / 2 + 0.4, ...mine.map(it => Math.abs(IC.rectLocal(t, it).x) + it.w / 2 + 0.15));
    const road = (x0, d0, x1, d1, kind, w) => { const r = { pts: [IC.rectWorld(t, x0, y(d0)), IC.rectWorld(t, x1, y(d1))], w, kind, by: t.id }; L.roads.push(r); return r; };
    const k = road(-X, KERB, X, KERB, 'kerb', 0.14); k.kerb = true; k.oneway = 1;
    for (let i = 0; i < nb; i++) road(-X, ROW(i), X, ROW(i), 'loop', 0.12);
    road(-X, KERB, -X, ROW(nb - 1), 'loop', 0.12); road(X, KERB, X, ROW(nb - 1), 'loop', 0.12);
    outs.push({ t, from: IC.rectWorld(t, 0, y(ROW(nb - 1))), n: IC.rectWorld(t, 0, y(ROW(nb - 1) + 0.3)) });
  }
  // out to the network: the nearest road outside the airfield, the airport's gate or the access road, or another
  // building's landside, found round everything in the way
  const B = [];
  for (const e of IC.aptElements(S, ap, { noWorld: true })) {
    if (e.cat === 'rwy') B.push({ sh: e.strip, pad: 0.05 }); else if (e.cat === 'twy') B.push({ sh: e.sh, pad: 0.18 });
    else if (e.cat === 'apron' || e.cat === 'bld') B.push({ sh: e.sh, pad: 0.06 });
    else if ((e.cat === 'land' || e.cat === 'park') && e.own) B.push({ sh: e.sh, pad: 0.04 });
  }
  const F = IC.aptFence(ap); if (F) B.push({ sh: IC.shapePoly(F.poly), pad: 0.05, carve: F.carveA });
  for (const o of outs) {
    const lines = [];
    const W = S.world, R = 30, box = r => [o.from.x - r, o.from.y - r, o.from.x + r, o.from.y + r], bb = box(R);
    if (L.access) lines.push(L.access.pts);
    for (const e of W.edges || []) { if (e.bb && (e.bb[2] < bb[0] || e.bb[0] > bb[2] || e.bb[3] < bb[1] || e.bb[1] > bb[3])) continue; for (const run of IC.openRuns(W, e.pts)) lines.push(run); }
    for (const q of outs) if (q !== o) for (const r of L.roads) if (r.by === q.t.id && (r.kind === 'loop' || r.kind === 'approach')) lines.push(r.pts);
    // the rows of this loop are in the way of the road out, the loop's own ends are not
    const own = L.roads.filter(r => r.by === o.t.id).map(r => ({ sh: IC.shapeLine(r.pts, 0.02), pad: 0.03 }));
    const near = (x, y) => { for (const l of lines) for (let i = 1; i < l.length; i++) if (U.segDist(x, y, l[i - 1].x, l[i - 1].y, l[i].x, l[i].y) < 0.1) return true; return false; };
    const snap = p => { let best = p, bd = Infinity; for (const l of lines) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy || 1, f = U.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / LL, 0, 1), q = { x: a.x + dx * f, y: a.y + dy * f }, d = U.dist(p, q); if (d < bd) { bd = d; best = q; } } return best; };
    if (!lines.length) continue;
    // step off the loop first, straight out
    // (a small search first: the network is usually close)
    const path = IC.gridRoute(box(8), 0.1, B.concat(own), o.n, near, { snapEnd: snap }) || IC.gridRoute(bb, 0.1, B.concat(own), o.n, near, { snapEnd: snap });
    if (!path) continue;
    const pts = [o.from].concat(path);
    L.roads.push({ pts, w: 0.12, out: true, kind: 'out', by: o.t.id });
    L.jn.push(pts[pts.length - 1]);
  }
  // wherever the airport's roads meet another at grade, that is a junction
  const own = L.roads.filter(r => r.kind === 'out');
  for (const r of own) {
    for (const e of IC.aptElements(S, ap).filter(e => e.cat === 'road' && e.world)) for (let i = 1; i < r.pts.length; i++) for (let j = 1; j < e.sh.line.length; j++) {
      const a = r.pts[i - 1], b = r.pts[i], c = e.sh.line[j - 1], d = e.sh.line[j], t = U.segX(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
      if (t >= 0) L.jn.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  L.ver++;
}
IC.landKerbs = kerbs;
/* a road reaches the airport: any road node or road within 3 km of it */
function hasRoad(S, ap) {
  const W = S.world, R = 30;
  for (const k in W.nodes) { const n = W.nodes[k]; if (U.dxy(n.x, n.y, ap.x, ap.y) < R) return true; }
  for (const e of W.edges) { if (e.bb && (ap.x < e.bb[0] - R || ap.x > e.bb[2] + R || ap.y < e.bb[1] - R || ap.y > e.bb[3] + R)) continue; for (const q of e.pts) if (U.dxy(q.x, q.y, ap.x, ap.y) < R) return true; }
  return (S.econ && S.econ.works || []).some(w => w.apt === ap.id);
}
function railNear(S, ap) {
  const W = S.world;
  for (const r of W.rails || W.railways || []) for (const q of r.pts || []) { const x = q.x != null ? q.x : q[0], y = q.x != null ? q.y : q[1]; if (U.dxy(x, y, ap.x, ap.y) < 50) return true; }
  return false;
}

/* ---------- the access road a new airport gets ---------- */
/* from the landside of the site (the side towards the nearest city) to the nearest road, or straight into town */
/* the access road a site at x, y with its runway at a would get: { P (the road plan), pts, snaps, city, end }, or
   null. The site survey prices it before Found (playtest 1: a 20 km road was a hidden ₭48M) */
IC.landAccessPlan = function (S, x, y, a, probe) {
  const W = S.world;
  if (!IC.roadPlan || !IC.roadFinish || !W.edges) return null;
  const at = { x, y };
  const city = IC.cities(S).filter(c => c.owner !== 'enemy').sort((p, q) => U.dist(p, at) - U.dist(q, at))[0];
  if (!city) return null;
  // leave the site at right angles to the runway, on the city's side, 500 m out
  const nx = -Math.sin(a || 0), ny = Math.cos(a || 0), side = ((city.x - x) * nx + (city.y - y) * ny) >= 0 ? 1 : -1;
  const start = { x: x + nx * side * 5, y: y + ny * side * 5 };
  // the nearest road, within 25 km; failing that, the city's own junction
  let end = null;
  for (const r of [15, 60, 250]) { const sn = IC.roadSnap(S, start.x, start.y, r); if (sn.node || sn.edge) { end = sn; break; } }
  if (!end && W.nodes[city.id]) end = { x: city.x, y: city.y, node: city.id };
  if (!end) return null;
  const pts = [start, { x: end.x, y: end.y }], snaps = [{ x: start.x, y: start.y }, end];
  // (a probe for a site not yet founded: the road will serve the airport once it is there)
  const plan = (p, s) => { const P = IC.roadPlan(S, 'lc', p, s); if (probe && /serve one of your airports/.test(P.why)) P.why = ''; return P; };
  let P = plan(pts, snaps);
  if (P.why && W.nodes[city.id] && !end.node) { const e2 = { x: city.x, y: city.y, node: city.id }; const P2 = plan([start, e2], [snaps[0], e2]); if (!P2.why) { P = P2; pts[1] = e2; snaps[1] = e2; end = e2; } }
  return { P, pts, snaps, city, end };
};
IC.landAccessRoad = function (S, ap) {
  const W = S.world;
  const A = IC.landAccessPlan(S, ap.x, ap.y, ap.rwyA || 0); if (!A) return null;
  const { P, pts, snaps, city, end } = A, start = pts[0];
  ap.cityRef = { x: city.x, y: city.y };
  if (P.why) { IC.log(S, 'warn', 'ROADS', `${ap.name}: no access road could be laid automatically (${P.why.replace(/\.$/, '').toLowerCase()}). Build one with the road tool in the airport panel.`, ap); return null; }

  const w = IC.roadFinish(S, { cls: 'lc', pts, snaps });
  if (!w) return null;
  const L = IC.landInit(ap); L.road = true; L.access = { pts: pts.map(p => ({ x: p.x, y: p.y })), cost: P.cost, km: P.km, work: w.id };
  // (the road works log their own line; a card says the rest, so the line is only for games without cards)
  if (!(S.camp && IC.card)) IC.log(S, 'info', 'ROADS', `${ap.name}: an access road to ${city.name} is laid automatically: ${P.km.toFixed(1)} km for ${U.money(P.cost)}, open in about ${U.dur(P.hours * 3600)}. The road tool builds more.`, start);
  if (S.camp && IC.card) IC.card(S, 'Access road', ap.name, `An airport needs a road. A ${P.km.toFixed(1)} km access road from ${ap.name} to ${end.node === city.id ? city.name : `the road to ${city.name}`} has been laid out and paid for (${U.money(P.cost)}); the works take about ${U.dur(P.hours * 3600)}. Better roads bring more passengers: the road tool in the airport panel builds link roads and motorway spurs.`, 'info');
  return w;
};
IC.on((S, type, d) => { if (type === 'founded' && d && d.parts) IC.landAccessRoad(S, d); });

})(window.IC);
