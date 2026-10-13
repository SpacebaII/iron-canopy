/* A village's plan (brief 54): not thirty boxes round a point but a street with houses on plots fronting it, a farm
   with its yard at each end, a green with the church in the bigger ones, and a lane or two off the street with a few
   houses and a farm at the end. Headless geometry; the tiles paint the plots, the green and the churchyard
   (terrain.js) and the houses are blocks like any other (v.blocks: x, y, w, h, a, seed, hp, and kind for a farm
   shed or the church). Units: 1 = 100 m. */
(function (IC) {
const U = IC.U;

/* the road through the village: the chain of road pieces nearest its centre, up to `len` long, as a polyline */
function streetOf(v, segs, len, W, R) {
  const road = segs.filter(s => s[4] !== 'hw' && s[4] !== 'rail');
  if (!road.length) return null;
  let best = null, bd = 1e9;
  for (const s of road) { const d = U.segDist(v.x, v.y, s[0], s[1], s[2], s[3]); if (d < bd) { bd = d; best = s; } }
  if (bd > v.r) return null;
  // the foot of the centre on that piece, then out both ways along pieces that join end to end
  const vx = best[2] - best[0], vy = best[3] - best[1], L2 = vx * vx + vy * vy || 1, t = U.clamp(((v.x - best[0]) * vx + (v.y - best[1]) * vy) / L2, 0, 1);
  const foot = { x: best[0] + vx * t, y: best[1] + vy * t };
  const walk = (from, to, left) => {
    const out = []; let cur = { x: from.x, y: from.y }, nx = to, used = new Set([best]);
    while (left > 0 && nx) {
      const d = U.dxy(cur.x, cur.y, nx.x, nx.y);
      if (d >= left) { const k = left / d; out.push({ x: cur.x + (nx.x - cur.x) * k, y: cur.y + (nx.y - cur.y) * k }); break; }
      out.push(nx); left -= d; cur = nx;
      // the piece that goes on from here, straightest first, never back on itself
      let next = null, bt = -2;
      for (const s of road) {
        if (used.has(s)) continue;
        for (const e of [0, 1]) {
          const a = e ? { x: s[2], y: s[3] } : { x: s[0], y: s[1] }, b = e ? { x: s[0], y: s[1] } : { x: s[2], y: s[3] };
          if (U.dxy(a.x, a.y, cur.x, cur.y) > 0.05) continue;
          const o = out.length > 1 ? out[out.length - 2] : from, dot = ((cur.x - o.x) * (b.x - cur.x) + (cur.y - o.y) * (b.y - cur.y)) / ((U.dxy(cur.x, cur.y, o.x, o.y) || 1) * (U.dxy(b.x, b.y, cur.x, cur.y) || 1));
          if (dot > bt) { bt = dot; next = { s, b }; }
        }
      }
      if (!next || bt < 0) break;
      used.add(next.s); nx = next.b;
    }
    // where the road ends short (a village at the end of its road), the street runs on as a lane of the village's own
    if (left > 0.6 && out.length) {
      const o = out.length > 1 ? out[out.length - 2] : from, e = out[out.length - 1]; let a = Math.atan2(e.y - o.y, e.x - o.x), x = e.x, y = e.y;
      const ext = [{ x, y }];
      for (let d = 0; d < left; d += 0.5) {
        x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
        if (W.inLake(x, y) || W.forestAt(x, y) || !W.inHome(x, y) === !!v.home) break;
        ext.push({ x, y }); out.push({ x, y }); a += R.range(-0.1, 0.1);
      }
      if (ext.length > 1) exts.push(ext);
    }
    return out;
  };
  const exts = [];
  const back = walk(foot, { x: best[0], y: best[1] }, len / 2), fwd = walk(foot, { x: best[2], y: best[3] }, len / 2);
  const pts = back.reverse().concat([foot], fwd);
  return pts.length >= 2 ? { pts, exts } : null;
}
/* along a polyline: the point and heading at distance s */
function at(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = U.dist(a, b);
    if (s <= L || i === pts.length - 1) { const k = L ? U.clamp(s / L, 0, 1) : 0; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x) }; }
    s -= L;
  }
  return null;
}
const plLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]); return L; };

IC.buildVillage = function (W, v, R, segs) {
  v.blocks = []; v.plan = null;
  // the river's own banks (W.riverDist is a 5 km grid, too coarse for a house 60 m from the water)
  const rs = [];
  for (const r of W.rivers || []) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(v.x, v.y, a.x, a.y, b.x, b.y) < v.r * 2.5) rs.push([a.x, a.y, b.x, b.y, (r.w || 2) * 0.15 + 0.6]); }
  const wet = (x, y) => W.inLake(x, y) || rs.some(s => U.segDist(x, y, s[0], s[1], s[2], s[3]) < s[4]);
  const onRoad = (x, y, d) => segs.some(s => U.segDist(x, y, s[0], s[1], s[2], s[3]) < d + (s[4] === 'hw' ? 1.2 : 0));
  const taken = [];   // plots and yards laid, so nothing stands on another
  // (two rectangles apart: judged in the new one's frame; one turned more than 20° from it counts by its longer side)
  const free = (x, y, w, h, a) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const q of taken) {
      const dx = q.x - x, dy = q.y - y, du = Math.abs(dx * ca + dy * sa), dv = Math.abs(-dx * sa + dy * ca);
      const turned = Math.abs(U.angWrap(q.a - a)) > 0.35, qw = turned ? Math.max(q.w, q.h) : q.w, qh = turned ? Math.max(q.w, q.h) : q.h;
      if (du < (w + qw) / 2 && dv < (h + qh) / 2) return false;
    }
    return true;
  };
  const house = (x, y, w, h, a, kind) => { if (onRoad(x, y, Math.max(w, h) / 2 + 0.02)) return null; const b = { x, y, w, h, a, seed: R() * 1000, hp: 1 }; if (kind) b.kind = kind; v.blocks.push(b); return b; };
  const rotXY = (x, y, a, u, w) => ({ x: x + Math.cos(a) * u - Math.sin(a) * w, y: y + Math.sin(a) * u + Math.cos(a) * w });
  // the street: 300 m for a hamlet, up to 1.4 km for the biggest (pop is in hundreds), the centre in the middle
  const len = U.clamp(2.5 + v.pop * 0.3, 3, 14);
  const so = streetOf(v, segs, len, W, R), ga = v.grid;
  const street = so ? so.pts : [{ x: v.x - Math.cos(ga) * len / 2, y: v.y - Math.sin(ga) * len / 2 }, { x: v.x + Math.cos(ga) * len / 2, y: v.y + Math.sin(ga) * len / 2 }];
  const SL = plLen(street);
  const form = v.pop < 9 ? 'hamlet' : v.pop >= 14 && R() < 0.55 ? 'green' : 'street';
  const plan = v.plan = { form, street, lanes: [], plots: [], green: null, church: null, yards: [] };
  // (the street beyond the road's end, or all of it where no road reaches the village, is a lane the traffic drives)
  // (a village no road reaches keeps its lanes for the picture, marked loose: the traffic cannot get to them)
  for (const ext of so ? so.exts : [street]) plan.lanes.push({ cls: 'ln', pts: ext, village: v.id, loose: !so || undefined });
  plan.loose = !so;
  // a farm: a yard with two or three sheds round it
  const farm = (x, y, a) => {
    if (wet(x, y) || onRoad(x, y, 0.5) || !free(x, y, 1.4, 1.1, a)) return false;
    const yd = { x, y, w: R.range(1.1, 1.5), h: R.range(0.8, 1.1), a }; plan.yards.push(yd); taken.push(yd);
    const n = R.int(2, 3);
    for (let k = 0; k < n; k++) {
      const side = k === 0 ? -1 : k === 1 ? 1 : 0, p = side ? rotXY(x, y, a, 0, side * (yd.h / 2 - 0.1)) : rotXY(x, y, a, yd.w / 2 - 0.12, 0);
      house(p.x, p.y, side ? R.range(0.5, 0.8) : R.range(0.14, 0.2), side ? R.range(0.12, 0.18) : R.range(0.4, 0.6), a, k === 0 ? 'house' : 'farm');
    }
    return true;
  };
  // a plot fronting a line at s along it, on `side`: a garden with the house at its front
  const plot = (pts, s, side, depth, big) => {
    const p = at(pts, s); if (!p) return false;
    const fw = R.range(0.24, big ? 0.55 : 0.42);   // frontage 24–55 m, the house 10 m back from the road edge
    const c = rotXY(p.x, p.y, p.a, 0, side * (0.1 + depth / 2)), q = { x: c.x, y: c.y, w: fw * 0.92, h: depth, a: p.a };
    if (wet(c.x, c.y) || !free(c.x, c.y, fw, depth, p.a) || onRoad(c.x, c.y, depth / 2 - 0.08)) return false;
    plan.plots.push(q); taken.push(q);
    const hw = R.range(0.14, 0.24), hh = R.range(0.09, 0.13), hp = rotXY(p.x, p.y, p.a, R.range(-0.1, 0.1) * fw, side * (0.1 + 0.06 + hh / 2 + R() * 0.08));
    house(hp.x, hp.y, hw, hh, p.a + R.range(-0.06, 0.06));
    if (R() < 0.25) { const sh = rotXY(p.x, p.y, p.a, R.range(-0.3, 0.3) * fw, side * (0.1 + depth * R.range(0.55, 0.85))); house(sh.x, sh.y, R.range(0.05, 0.08), R.range(0.04, 0.06), p.a, 'shed'); }
    return true;
  };
  // the green: beside the street at the centre, with the church on its far side
  let gside = R() < 0.5 ? 1 : -1, gEnd = 0;
  if (form === 'green') {
    const p = at(street, SL / 2), rx = R.range(0.55, 0.85), ry = R.range(0.35, 0.55);
    for (const sd of [gside, -gside]) {
      const c = rotXY(p.x, p.y, p.a, 0, sd * (0.1 + ry));
      if (wet(c.x, c.y) || onRoad(c.x, c.y, ry - 0.05)) continue;
      gside = sd; plan.green = { x: c.x, y: c.y, rx, ry, a: p.a }; taken.push({ x: c.x, y: c.y, w: rx * 2, h: ry * 2, a: p.a }); break;
    }
    if (plan.green) {
      const g = plan.green, cp = rotXY(p.x, p.y, p.a, R.range(-0.25, 0.25) * rx, gside * (0.1 + ry * 2 + 0.22));
      if (!wet(cp.x, cp.y) && !onRoad(cp.x, cp.y, 0.3)) { plan.church = { x: cp.x, y: cp.y, a: p.a }; const b = house(cp.x, cp.y, 0.28, 0.12, p.a, 'church'); taken.push({ x: cp.x, y: cp.y, w: 0.5, h: 0.4, a: p.a }); gEnd = 1; void b; }
    }
  }
  // plots along the street, both sides, denser at the centre; the green's side is skipped across the green
  const dense = form === 'hamlet' ? 0.45 : 0.7;
  for (const side of [1, -1]) {
    let s = 0.2;
    while (s < SL - 0.3) {
      const w = R.range(0.26, 0.55), mid = Math.abs(s + w / 2 - SL / 2) / (SL / 2);
      const overGreen = plan.green && side === gside && Math.abs(s + w / 2 - SL / 2) < plan.green.rx + 0.1;
      if (!overGreen && R() < dense + 0.35 * (1 - mid)) plot(street, s + w / 2, side, R.range(0.55, 0.95), mid < 0.4);
      s += w + (R() < 0.15 ? R.range(0.3, 0.8) : 0.04);
    }
  }
  // a farm at each end of a street village, set back off the road
  if (form !== 'hamlet') for (const e of [0, 1]) {
    const p = at(street, e ? SL - 0.5 : 0.5); if (!p || R() > 0.8) continue;
    const q = rotXY(p.x, p.y, p.a, e ? 0.3 : -0.3, (R() < 0.5 ? 1 : -1) * R.range(0.9, 1.3));
    farm(q.x, q.y, p.a + R.range(-0.3, 0.3));
  }
  // lanes off the street, out across the fields, with plots along them and maybe a farm at the end: a hamlet has one
  // or two, a village as many as its people need (pop is in hundreds: about five houses a hundred), and a lane may
  // fork into a back lane, so a big village is a small net of lanes rather than one long street
  const want = form === 'hamlet' ? 0 : v.pop * 5, maxL = form === 'hamlet' ? R.int(1, 2) : 14;
  const lane = (p, side, L0, depth) => {
    let a = p.a + side * Math.PI / 2 + R.range(-0.25, 0.25), x = p.x, y = p.y;
    const pts = [{ x, y }], L = L0;
    for (let d = 0; d < L; d += 0.25) {
      x += Math.cos(a) * 0.25; y += Math.sin(a) * 0.25;
      if (wet(x, y) || W.forestAt(x, y) || (d > 0.4 && onRoad(x, y, 0.3)) || !W.inHome(x, y) === !!v.home) break;
      pts.push({ x, y }); a += R.range(-0.12, 0.12);
    }
    if (plLen(pts) < 0.8) return false;
    plan.lanes.push({ cls: 'ln', pts, village: v.id, loose: plan.loose || undefined });
    const LL = plLen(pts), ls = R() < 0.5 ? 1 : -1;
    // (built up near the street, thinning to the odd house further out)
    for (let s = 0.45; s < LL - 0.4; s += R.range(0.3, 0.5)) { const near = 1 - s / LL; if (R() < 0.5 + 0.45 * near) plot(pts, s, ls, R.range(0.5, 0.8), false); if (R() < 0.3 + 0.4 * near) plot(pts, s + 0.15, -ls, R.range(0.5, 0.8), false); }
    if (depth < 2 && LL > 2 && R() < 0.7) { const q = at(pts, LL * R.range(0.4, 0.75)); if (q) lane(q, R() < 0.5 ? 1 : -1, L0 * R.range(0.5, 0.8), depth + 1); }
    else if (R() < 0.35) { const e = pts[pts.length - 1], q = at(pts, LL - 0.01); farm(e.x + Math.cos(q.a) * 0.6, e.y + Math.sin(q.a) * 0.6, q.a); }
    return true;
  };
  for (let k = 0, tries = 0; (k < 2 || v.blocks.length < want) && k < maxL && tries < 40; tries++) {
    const s0 = SL * (0.12 + 0.76 * R()), p = at(street, s0); if (!p) continue;
    const side = plan.green && Math.abs(s0 - SL / 2) < plan.green.rx + 0.3 ? -gside : (R() < 0.5 ? 1 : -1);
    if (plan.lanes.some(l => U.dxy(l.pts[0].x, l.pts[0].y, p.x, p.y) < 0.7)) continue;   // not two lanes from one spot
    if (lane(p, side, R.range(1.5, U.clamp(1.5 + v.pop * 0.1, 2.5, 5)), 0)) k++;
  }
  // (a village with nothing built, in the water or the forest, keeps a few houses so it is still a place)
  if (v.blocks.length < 4) for (let k = 0; k < 6; k++) { const x = v.x + R.gauss() * v.r * 0.3, y = v.y + R.gauss() * v.r * 0.3; if (!wet(x, y) && !onRoad(x, y, 0.3)) house(x, y, R.range(0.12, 0.2), R.range(0.08, 0.11), v.grid); }
  return v.plan;
};

})(window.IC);
