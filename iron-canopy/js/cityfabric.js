/* Iron Canopy — the city fabric (brief 53): a direction field, the streets traced on it, and the blocks between them.
   At every point of a city the field says which way its streets run: the city's own grid, the radial about its
   centre, the line of each road and avenue near by, the river bank and the old town's winding lanes, blended as
   tensors (a street running east and one running west are the same street, so an angle counts twice). Streets are
   evenly spaced streamlines of the field in two families, along it and across it, the arterials first and the side
   streets between them; every street runs until it comes within half a spacing of another of its family and is run
   on to meet it. The blocks are the rectangles that fit inside the faces of the street net, set back from the kerbs.
   Geometry only and headless: cities.js uses it when a city is built, growth.js when a city grows. */
(function (IC) {
'use strict';
const U = IC.U;

IC.FABRIC = {
  // block spacing by district (units of 100 m): the old town's lanes, the centre, dense housing, suburbs, industry
  size: { old: 1.3, biz: 1.6, dense: 2.1, sub: 3.1, ind: 4.2, log: 4.6, rail: 4.0, park: 2.6 },
  art: 3.5,                                                   // an arterial every so many blocks
  styleK: { eu: 1, us: 1.17, new: 1.1, ind: 1, east: 1.2 },   // American blocks a sixth wider
  step: 0.3,                                                  // tracing step (30 m)
  // how far a line turns the field round it, and how strongly
  reach: { hw: 5, rd: 7, art: 5, ring: 7, lc: 4, sp: 2.5, rail: 4, river: 9, diag: 3, wall: 5, st: 2 },
  weight: { hw: 0.5, rd: 1.4, art: 1.0, ring: 1.4, lc: 0.8, sp: 0.4, rail: 0.6, river: 1.2, diag: 0.25, wall: 1.2, st: 0.8 }
};

/* ---------- the field ----------
   c.fld = { x, y: the centre; a: the grid's angle; wg: the grid's weight; wr, wr1: the radial's weight at the centre
   and at the edge; ext: the city's reach; warp: the bend in radians; wl: its wavelength; s: the noise's seed;
   old: { x, y, r } the old town or null; lines: [x0, y0, x1, y1, kind] the roads, avenues and banks it follows }.
   Plain data, so a save keeps it; the buckets are a cache. */
IC.cityField = function (c) {
  const f = c.fld, n = f.lines.length;
  if (c._fld && c._fld.f === f && c._fld.n === n) return c._fld;
  const B = 8, bk = new Map(), key = (i, j) => i * 65536 + j, RC = IC.FABRIC.reach, WT = IC.FABRIC.weight;
  for (const s of f.lines) {
    const r = RC[s[4]] || 4;
    const i0 = Math.floor((Math.min(s[0], s[2]) - r) / B), i1 = Math.floor((Math.max(s[0], s[2]) + r) / B), j0 = Math.floor((Math.min(s[1], s[3]) - r) / B), j1 = Math.floor((Math.max(s[1], s[3]) + r) / B);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let l = bk.get(k); if (!l) bk.set(k, l = []); l.push(s); }
  }
  const ca2 = Math.cos(2 * f.a), sa2 = Math.sin(2 * f.a);
  // the smooth part of the field at x, y: the grid, the radial and the lines near by, as Σ w (cos 2θ, sin 2θ)
  const smooth = (x, y, out) => {
    let cx = f.wg * ca2, sx = f.wg * sa2;
    const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy);
    const wr = f.wr * U.lerp(1, f.wr1, U.clamp(d / f.ext, 0, 1));
    if (wr > 0 && d > 0.01) { const t = Math.atan2(dy, dx); cx += wr * Math.cos(2 * t); sx += wr * Math.sin(2 * t); }
    const L = bk.get(key(Math.floor(x / B), Math.floor(y / B)));
    if (L) for (const s of L) {
      const r = RC[s[4]] || 4, vx = s[2] - s[0], vy = s[3] - s[1], LL = vx * vx + vy * vy;
      let t = LL ? ((x - s[0]) * vx + (y - s[1]) * vy) / LL : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - s[0] - vx * t, ey = y - s[1] - vy * t, d2 = ex * ex + ey * ey; if (d2 > r * r) continue;
      const w = (WT[s[4]] || 1) * Math.exp(-d2 / (r * r * 0.18)), a = Math.atan2(vy, vx);
      cx += w * Math.cos(2 * a); sx += w * Math.sin(2 * a);
    }
    out[0] = cx; out[1] = sx;
  };
  // the old town's lanes wind round its centre on a short wavelength, and the whole bends with the style's warp
  const finish = (x, y, cx, sx) => {
    if (f.old) {
      const ox = x - f.old.x, oy = y - f.old.y, od = Math.hypot(ox, oy), k = U.clamp((f.old.r + 1.2 - od) / 2.4, 0, 1);
      if (k > 0 && od > 0.01) { const t = Math.atan2(oy, ox) + (U.vnoise(x / 3.5 + f.s, y / 3.5) - 0.5) * 1.8, m = Math.hypot(cx, sx) || 1; cx = cx / m * (1 - k) + k * 1.2 * Math.cos(2 * t); sx = sx / m * (1 - k) + k * 1.2 * Math.sin(2 * t); }
    }
    let th = 0.5 * Math.atan2(sx, cx);
    if (f.warp) th += f.warp * (U.vnoise(x / f.wl + f.s, y / f.wl + 17) - 0.5) * 2;
    return th;
  };
  const tmp = [0, 0];
  const ang = (x, y) => { smooth(x, y, tmp); return finish(x, y, tmp[0], tmp[1]); };
  // the smooth part sampled on a 300 m grid as it is asked for (the tracing asks millions of times), interpolated
  const G = 3, gx0 = Math.floor((f.x - f.ext * 1.6) / G), gy0 = Math.floor((f.y - f.ext * 1.6) / G), gw = Math.ceil(f.ext * 3.2 / G) + 2, gh = gw;
  const gc = new Float32Array(gw * gh).fill(NaN), gs = new Float32Array(gw * gh);
  const at = (i, j) => { const k = j * gw + i; if (gc[k] !== gc[k]) { smooth((gx0 + i) * G, (gy0 + j) * G, tmp); gc[k] = tmp[0]; gs[k] = tmp[1]; } return k; };
  const fast = (x, y) => {
    const u = x / G - gx0, v = y / G - gy0, i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= gw - 1 || j >= gh - 1) return ang(x, y);
    const fu = u - i, fv = v - j, k00 = at(i, j), k10 = at(i + 1, j), k01 = at(i, j + 1), k11 = at(i + 1, j + 1);
    const cc = (gc[k00] * (1 - fu) + gc[k10] * fu) * (1 - fv) + (gc[k01] * (1 - fu) + gc[k11] * fu) * fv, ss = (gs[k00] * (1 - fu) + gs[k10] * fu) * (1 - fv) + (gs[k01] * (1 - fu) + gs[k11] * fu) * fv;
    return finish(x, y, cc, ss);
  };
  // the two directions at x, y: fam 0 along the field, fam 1 across it (as unit vectors, either way round)
  const dir = (x, y, fam) => { const t = fast(x, y) + (fam ? Math.PI / 2 : 0); return { x: Math.cos(t), y: Math.sin(t) }; };
  // which family a direction belongs to here
  const famOf = (x, y, dx, dy) => { const t = fast(x, y), c0 = Math.cos(t), s0 = Math.sin(t); return Math.abs(dx * c0 + dy * s0) >= Math.abs(-dx * s0 + dy * c0) ? 0 : 1; };
  c._fld = { f, n, ang: fast, exact: ang, dir, famOf };
  return c._fld;
};

/* ---------- samples of lines in square cells, for "what line is near here" ----------
   Dense over a box when one is given (the tracing asks at every step), else a map. */
function Samples(cell, box) {
  const C = cell;
  let m, nx = 0, ny = 0, bx = 0, by = 0, dense = null;
  if (box) { bx = Math.floor(box[0] / C) - 1; by = Math.floor(box[1] / C) - 1; nx = Math.ceil((box[2] - box[0]) / C) + 3; ny = Math.ceil((box[3] - box[1]) / C) + 3; dense = new Array(nx * ny).fill(null); }
  else m = new Map();
  const key = (i, j) => (i + 32768) * 65536 + j + 32768;
  const cellOf = (i, j) => { if (dense) { i -= bx; j -= by; return i < 0 || j < 0 || i >= nx || j >= ny ? null : dense[j * nx + i]; } return m.get(key(i, j)); };
  return {
    add(x, y, fam, id, dx, dy) {
      const i = Math.floor(x / C), j = Math.floor(y / C);
      let l;
      if (dense) { const a = i - bx, b = j - by; if (a < 0 || b < 0 || a >= nx || b >= ny) return; l = dense[b * nx + a]; if (!l) dense[b * nx + a] = l = []; }
      else { const k = key(i, j); l = m.get(k); if (!l) m.set(k, l = []); }
      l.push(x, y, fam, id, dx || 0, dy || 0);
    },
    // the nearest sample of family fam (-1: any) within r, not of line `not`; any: the first found will do;
    // along (a unit vector): only samples running within 30° of it
    near(x, y, fam, r, not, skip, any, along) {
      let best = null, bd = r * r;
      const i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((y - r) / C), j1 = Math.floor((y + r) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const l = cellOf(i, j); if (!l) continue;
        for (let q = 0; q < l.length; q += 6) {
          if ((fam >= 0 && l[q + 2] !== fam) || l[q + 3] === not || (skip && skip(l[q + 3]))) continue;
          if (along && Math.abs(l[q + 4] * along.x + l[q + 5] * along.y) < 0.87) continue;
          const dx = l[q] - x, dy = l[q + 1] - y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { d: Math.sqrt(d), id: l[q + 3], x: l[q], y: l[q + 1] }; if (any) return best; }
        }
      }
      return best;
    }
  };
}
/* the point of a polyline nearest x, y: { d, x, y, i } */
function nearestOn(pts, x, y) {
  let best = { d: 1e9 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy, t = L ? U.clamp(((x - a.x) * vx + (y - a.y) * vy) / L, 0, 1) : 0;
    const px = a.x + vx * t, py = a.y + vy * t, d = Math.hypot(px - x, py - y);
    if (d < best.d) best = { d, x: px, y: py, i, t };
  }
  return best;
}
IC.fabricNearestOn = nearestOn;
IC.fabricSamples = Samples;
const STEP = () => IC.FABRIC.step;

/* ---------- streets: evenly spaced streamlines ----------
   o: { fld (IC.cityField), box [x0, y0, x1, y1] (where it all is), blocked(x, y) → 0 inside and free, 2 outside the city, else why ('hw', 'water', 'field', 'sq'),
        dsep(x, y, fam) the spacing here, lines: the lines already laid ([{ pts }], streets, avenues, roads),
        seeds: [{ x, y, fam }], maxLen, cross(x, y, dx, dy) → the points across the water or null (a bridge) }.
   Returns the new lines: { pts, fam, ends: [e0, e1], br? } where an end is { to, x?, y? }: 'line' (run on to meet
   one), 'head' (met nothing: a turning head), 'hw', 'water', 'field', 'sq', 'edge' (the city's edge, with the point
   just beyond it) or 'loop' (closed on itself). */
IC.fabricTrace = function (o) {
  const F = o.fld, h = o.step || STEP(), S = Samples(o.cell || 2, o.box), out = [], dsep = (x, y, fam) => o.dsep(x, y, fam);
  let nid = 0;
  // existing lines first, each sample with the family its direction belongs to here
  const sample = (pts, id) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = U.dist(a, b), n = Math.max(1, Math.ceil(L / Math.max(h, dsep(a.x, a.y, 0) / 6)));
      const ux = (b.x - a.x) / (L || 1), uy = (b.y - a.y) / (L || 1);
      for (let q = 0; q < n; q++) { const t = q / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; S.add(x, y, F.famOf(x, y, ux, uy), id, ux, uy); }
    }
    const e = pts[pts.length - 1], p = pts[pts.length - 2]; if (p) { const L = U.dist(e, p) || 1; S.add(e.x, e.y, F.famOf(e.x, e.y, e.x - p.x, e.y - p.y), id, (e.x - p.x) / L, (e.y - p.y) / L); }
  };
  const all = [], along = { x: 0, y: 0 };   // every line by id, for running an end on to one
  for (const l of o.lines || []) { if (l.pts.length > 1) { const id = nid++; all[id] = l; sample(l.pts, id); } }
  const queue = [];   // seeds, flat: x, y, family
  for (const q of o.seeds || []) queue.push(q.x, q.y, q.fam);
  let qi = 0;
  // seeds from a line: parallel streets a spacing away on either side, and crossing streets along it (fam: the
  // line's family, or -1 for one that changes family along its way, judged at each point)
  const spawn = (pts, fam) => {
    let acc = 1e9, accP = 1e9;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], sl = U.dist(a, b); acc += sl; accP += sl;
      const ux = (b.x - a.x) / (sl || 1), uy = (b.y - a.y) / (sl || 1), f = fam >= 0 ? fam : F.famOf(b.x, b.y, ux, uy);
      const dsA = dsep(b.x, b.y, f);
      if (accP >= dsA * 1.5) { accP = 0; for (const sg of [1, -1]) { const d2 = dsep(b.x - uy * sg * dsA, b.y + ux * sg * dsA, f); queue.push(b.x - uy * sg * d2, b.y + ux * sg * d2, f); } }
      if (acc >= dsA) { acc = 0; queue.push(b.x, b.y, 1 - f); }
    }
  };
  for (const l of o.lines || []) if (l.seed && l.pts.length > 1) spawn(l.pts, -1);
  /* one direction from p0 */
  const walk = (p0, fam, d0, id, mine) => {
    const pts = [], own = [], samp = [];   // own: my own points, for closing a loop; samp: for the net once kept
    let x = p0.x, y = p0.y, dx = d0.x, dy = d0.y, len = 0, end = null, br = null, lastS = -1e9;
    const rot = fam ? Math.PI / 2 : 0;
    for (let k = 0; k < 4000 && !end; k++) {
      if (IC.FABRIC.stats) IC.FABRIC.stats.steps++;
      // a step along the field (midpoint rule), keeping the sense of travel
      let t = F.ang(x, y) + rot, vx = Math.cos(t), vy = Math.sin(t);
      if (vx * dx + vy * dy < 0) { vx = -vx; vy = -vy; }
      t = F.ang(x + vx * h / 2, y + vy * h / 2) + rot;
      let wx = Math.cos(t), wy = Math.sin(t);
      if (wx * vx + wy * vy < 0) { wx = -wx; wy = -wy; }
      if (wx * dx + wy * dy < 0.3) { end = { to: 'turn' }; break; }   // a degenerate point: the field turns away
      const nx = x + wx * h, ny = y + wy * h;
      const why = o.blocked(nx, ny);
      if (why === 2) { end = { to: 'edge', x: nx, y: ny }; break; }
      if (why) {
        if (why === 'water' && o.cross) { const c = o.cross(nx, ny, wx, wy, fam); if (c) { for (const p of c) pts.push(p); br = (br || []).concat([[pts.length - c.length, pts.length - 1]]); const e = c[c.length - 1], p2 = c[c.length - 2] || { x, y }; x = e.x; y = e.y; dx = e.x - p2.x; dy = e.y - p2.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; len += 6; continue; } }
        end = { to: why, x: nx, y: ny }; break;
      }
      const ds = dsep(nx, ny, fam), dt = ds * 0.5;
      // close on myself (a ring)
      if (mine && own.length > 2 * ds / h + 4) { let cl = null; for (let q = 0; q < own.length - 2 * ds / h - 4; q += 2) { const ex = own[q] - nx, ey = own[q + 1] - ny; if (ex * ex + ey * ey < dt * dt * 0.5) { cl = q; break; } } if (cl != null) { pts.push({ x: own[cl], y: own[cl + 1] }); end = { to: 'loop' }; break; } }
      // within half a spacing of another line of my family, or alongside one of the other within a third: run on to
      // meet it (two streets never run a few metres apart)
      along.x = wx; along.y = wy;
      const q = S.near(nx, ny, fam, dt, id) || S.near(nx, ny, 1 - fam, dt * 0.65, id, null, false, along);
      if (q) {
        const l = all[q.id], nn = nearestOn(l.pts, nx, ny);
        if (nn.d < 1e9) { pts.push({ x: nn.x, y: nn.y }); end = { to: 'line', id: q.id, x: nn.x, y: nn.y }; break; }
      }
      pts.push({ x: nx, y: ny }); own.push(nx, ny);
      if (len - lastS >= ds / 6) { samp.push(nx, ny, F.famOf(nx, ny, wx, wy), wx, wy); lastS = len; }
      dx = wx; dy = wy; x = nx; y = ny; len += h;
      if (len > (o.maxLen || 400)) { end = { to: 'long' }; break; }
    }
    return { pts, end: end || { to: 'turn' }, br, samp };
  };
  const s = { x: 0, y: 0, fam: 0 };
  // (a seed is tried once per 50 m cell and family)
  const bx = o.box, SC = 0.5, sw = bx ? Math.ceil((bx[2] - bx[0]) / SC) + 1 : 0, sh = bx ? Math.ceil((bx[3] - bx[1]) / SC) + 1 : 0, tried = bx ? new Uint8Array(sw * sh) : null;
  while (qi < queue.length) {
    s.x = queue[qi]; s.y = queue[qi + 1]; s.fam = queue[qi + 2]; qi += 3;
    if (IC.FABRIC.stats) IC.FABRIC.stats.seeds++;
    if (tried) { const i = Math.floor((s.x - bx[0]) / SC), j = Math.floor((s.y - bx[1]) / SC); if (i < 0 || j < 0 || i >= sw || j >= sh) continue; const k = j * sw + i, bit = 1 << s.fam; if (tried[k] & bit) continue; tried[k] |= bit; }
    if (o.blocked(s.x, s.y)) continue;
    const ds = dsep(s.x, s.y, s.fam);
    if (S.near(s.x, s.y, s.fam, ds * 0.85, -1, null, true)) continue;   // too close to a line of this family already
    if (IC.FABRIC.stats) IC.FABRIC.stats.walks++;
    const id = nid++, d0 = F.dir(s.x, s.y, s.fam);
    const fw = walk(s, s.fam, d0, id, true), bw = fw.end.to === 'loop' ? { pts: [], end: { to: 'loop' }, samp: [] } : walk(s, s.fam, { x: -d0.x, y: -d0.y }, id, false);
    const pts = bw.pts.slice().reverse().concat([{ x: s.x, y: s.y }], fw.pts);
    let L = 0; for (let i = 1; i < pts.length; i++) L += U.dist(pts[i - 1], pts[i]);
    const tied = e => e.to === 'line' || e.to === 'loop';
    // too short to be a street, or a stub that meets nothing
    if (L < ds * 0.6 || (L < ds * 1.5 && !tied(bw.end) && !tied(fw.end))) { continue; }
    const br = (bw.br || []).map(([a, b]) => [bw.pts.length - 1 - b, bw.pts.length - 1 - a]).concat((fw.br || []).map(([a, b]) => [bw.pts.length + 1 + a, bw.pts.length + 1 + b]));
    const l = { pts: br.length ? pts : IC.simplifyLine(pts, 0.03), fam: s.fam, ends: [bw.end, fw.end] };
    if (br.length) l.br = br;
    all[id] = l; out.push(l);
    for (const w of [fw, bw]) for (let q = 0; q < w.samp.length; q += 5) S.add(w.samp[q], w.samp[q + 1], w.samp[q + 2], id, w.samp[q + 3], w.samp[q + 4]);
    S.add(s.x, s.y, s.fam, id, d0.x, d0.y);
    spawn(pts, s.fam);
    if (queue.length > 240000) break;
  }
  return out;
};

/* ---------- a path on the field towards a point (an avenue in from a gate) ----------
   From p along whichever family points more towards `to`, changing family only after `run` of the other (so a grid
   city's avenue turns once, a radial city's runs straight in). Stops within `near` of `to` (and ends on it), or where
   meet(x, y) says it has met something (and ends on what meet returns), or where blocked. */
IC.fabricPath = function (F, p, to, o) {
  const h = STEP(), pts = [{ x: p.x, y: p.y }];
  let x = p.x, y = p.y, fam = -1, since = 0, dx = 0, dy = 0;
  for (let k = 0; k < 6000; k++) {
    const tx = to.x - x, ty = to.y - y, td = Math.hypot(tx, ty);
    if (td < (o.near || 1)) { pts.push({ x: to.x, y: to.y }); return { pts: IC.simplifyLine(pts, 0.03), hit: 'to' }; }
    const vs = [F.dir(x, y, 0), F.dir(x, y, 1)].map(v => { const s = v.x * tx + v.y * ty >= 0 ? 1 : -1; return { x: v.x * s, y: v.y * s, dot: Math.abs(v.x * tx + v.y * ty) / td }; });
    let f = fam;
    if (f < 0) f = vs[0].dot >= vs[1].dot ? 0 : 1;
    else if (since > (o.run || 4) && vs[1 - f].dot > vs[f].dot + 0.25) { f = 1 - f; since = 0; }
    let v = vs[f];
    // keep the sense of travel through a kink of the field
    if (k && v.x * dx + v.y * dy < 0 && v.dot < 0.5) v = { x: -v.x, y: -v.y };
    const nx = x + v.x * h, ny = y + v.y * h;
    if (o.blocked && o.blocked(nx, ny)) return { pts, hit: 'blocked' };
    const m = o.meet && o.meet(nx, ny);
    if (m) { pts.push({ x: m.x, y: m.y }); return { pts: IC.simplifyLine(pts, 0.03), hit: m }; }
    pts.push({ x: nx, y: ny }); x = nx; y = ny; dx = v.x; dy = v.y; fam = f; since += h;
  }
  return { pts, hit: 'lost' };
};

/* ---------- a ring or a radial on the field ----------
   A ring: round the centre c at the radius rad(a) gives, along whichever family runs more across the line to the
   centre (so a grid city's ring is a loop of avenues with square corners, a radial city's a circle), each way from
   seeds all round, until it closes, meets itself or a piece laid before, or is blocked (a gap, as a ring road has at
   a lake). A radial (o.radial): out from p along whichever family runs more along the line from the centre. */
IC.fabricRound = function (F, c, o) {
  const h = STEP(), pieces = [], S = Samples(2);
  let nid = 0;
  const walk = (p0, sense) => {
    const pts = [{ x: p0.x, y: p0.y }], id = nid++, own = [];
    let x = p0.x, y = p0.y, fam = -1, since = 0, dx = 0, dy = 0, closed = false, len = 0;
    for (let k = 0; k < 6000; k++) {
      const rx = x - c.x, ry = y - c.y, rd = Math.hypot(rx, ry) || 1, ux = rx / rd, uy = ry / rd;
      // the tangent sense (counter-clockwise), or outwards for a radial
      const wx = o.radial ? ux : -uy * sense, wy = o.radial ? uy : ux * sense;
      const vs = [F.dir(x, y, 0), F.dir(x, y, 1)].map(v => { const s = v.x * wx + v.y * wy >= 0 ? 1 : -1; return { x: v.x * s, y: v.y * s, dot: Math.abs(v.x * wx + v.y * wy) }; });
      let f = fam;
      if (f < 0) f = vs[0].dot >= vs[1].dot ? 0 : 1;
      else if (since > (o.run || 2) && vs[1 - f].dot > vs[f].dot + (o.hyst == null ? 0.05 : o.hyst)) { f = 1 - f; since = 0; }
      const v = vs[f], nx = x + v.x * h, ny = y + v.y * h;
      if (k && v.x * dx + v.y * dy < -0.2) break;
      if (o.blocked(nx, ny) || (o.inside && !o.inside(nx, ny))) break;
      // a ring keeps near its radius: pulled back when it strays (the field's lines bend it, the radius holds it)
      if (!o.radial) {
        const want = o.rad(Math.atan2(ny - c.y, nx - c.x)), have = Math.hypot(nx - c.x, ny - c.y), err = (have - want) / want;
        if (Math.abs(err) > 0.35) break;
      }
      if (o.radial && Math.hypot(nx - c.x, ny - c.y) > o.rad(Math.atan2(ny - c.y, nx - c.x))) break;
      // closing on myself, or meeting a piece laid before
      if (own.length > 40) for (let q = 0; q < own.length - 40; q += 2) { const ex = own[q] - nx, ey = own[q + 1] - ny; if (ex * ex + ey * ey < 0.36) { pts.push({ x: own[q], y: own[q + 1] }); closed = true; break; } }
      if (closed) break;
      const m = S.near(nx, ny, -1, o.join == null ? 0.8 : o.join, id);
      if (m) { const nn = nearestOn(pieces[m.id].pts, nx, ny); pts.push({ x: nn.x, y: nn.y }); break; }
      if (o.meet) { const mm = o.meet(nx, ny); if (mm) { pts.push({ x: mm.x, y: mm.y }); break; } }
      pts.push({ x: nx, y: ny }); own.push(nx, ny); S.add(nx, ny, 0, id);
      x = nx; y = ny; dx = v.x; dy = v.y; fam = f; since += h; len += h;
      if (len > (o.maxLen || 600)) break;
    }
    if (pts.length > 3) { const l = { pts: IC.simplifyLine(pts, 0.03), closed }; pieces[id] = l; return l; }
    pieces[id] = { pts: [] }; return null;
  };
  const out = [];
  for (const s of o.seeds) {
    if (o.blocked(s.x, s.y) || (o.inside && !o.inside(s.x, s.y)) || S.near(s.x, s.y, -1, o.join == null ? 0.8 : o.join, -1)) continue;
    if (o.radial) { const l = walk(s, 1); if (l) out.push(l); continue; }
    const a = walk(s, 1);
    if (a && a.closed) { out.push(a); continue; }
    const b = walk(s, -1);
    if (a && b) { out.push({ pts: b.pts.slice(1).reverse().concat(a.pts), closed: false }); }
    else if (a || b) out.push(a || b);
  }
  return out;
};

/* ---------- faces of the street net ----------
   lines: [{ pts, w, virt? }] (w: how far a block keeps from the line's centre; virt: an edge of the city, a bank, a
   shore, drawn by nothing). Returns the bounded faces: { poly: [{ x, y }], pads: [w per edge], area, x, y (the
   centroid), virt: how many of its edges are virtual, lines: Set of line indices }. */
IC.fabricFaces = function (lines) {
  const segs = [];
  lines.forEach((l, li) => { for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i]; if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-6) segs.push({ a, b, li, cuts: [] }); } });
  // crossings: segments in cells, every pair in a cell
  const C = 2, G = new Map(), key = (i, j) => (i + 32768) * 65536 + j + 32768;
  segs.forEach((s, si) => {
    for (let i = Math.floor(Math.min(s.a.x, s.b.x) / C); i <= Math.floor(Math.max(s.a.x, s.b.x) / C); i++) for (let j = Math.floor(Math.min(s.a.y, s.b.y) / C); j <= Math.floor(Math.max(s.a.y, s.b.y) / C); j++) { const k = key(i, j); let l = G.get(k); if (!l) G.set(k, l = []); l.push(si); }
  });
  const seen = new Set();
  const cut = (s, t, p) => { if (t > 1e-7 && t < 1 - 1e-7) s.cuts.push([t, p]); };
  for (const L of G.values()) for (let u = 0; u < L.length; u++) for (let v = u + 1; v < L.length; v++) {
    const si = L[u], sj = L[v], pk = si < sj ? si * 1e6 + sj : sj * 1e6 + si; if (seen.has(pk)) continue; seen.add(pk);
    const p = segs[si], q = segs[sj];
    if (p.li === q.li && (p.a === q.b || p.b === q.a)) continue;
    const r1 = p.b.x - p.a.x, r2 = p.b.y - p.a.y, s1 = q.b.x - q.a.x, s2 = q.b.y - q.a.y, den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((q.a.x - p.a.x) * s2 - (q.a.y - p.a.y) * s1) / den, w = ((q.a.x - p.a.x) * r2 - (q.a.y - p.a.y) * r1) / den;
    if (t < -1e-7 || t > 1 + 1e-7 || w < -1e-7 || w > 1 + 1e-7) continue;
    const pt = { x: p.a.x + r1 * t, y: p.a.y + r2 * t };
    cut(p, t, pt); cut(q, w, pt);
  }
  // vertices (shared where points coincide within 5 mm), edges between the cuts
  const V = [], vkey = new Map(), vOf = p => { const k = Math.round(p.x * 200) * 4194304 + Math.round(p.y * 200); let i = vkey.get(k); if (i == null) { i = V.length; V.push({ x: p.x, y: p.y, nb: [] }); vkey.set(k, i); } return i; };
  const E = new Map();   // u*N+v → { li }
  const addE = (u, v, li) => { if (u === v) return; V[u].nb.push(v); V[v].nb.push(u); E.set(u * 4194304 + v, li); E.set(v * 4194304 + u, li); };
  for (const s of segs) {
    s.cuts.sort((p, q) => p[0] - q[0]);
    let u = vOf(s.a);
    for (const [, p] of s.cuts) { const v = vOf(p); if (v !== u) { addE(u, v, s.li); u = v; } }
    const v = vOf(s.b); if (v !== u) addE(u, v, s.li);
  }
  for (const v of V) { const u = new Set(v.nb); v.nb = [...u]; v.nb.sort((a, b) => Math.atan2(V[a].y - v.y, V[a].x - v.x) - Math.atan2(V[b].y - v.y, V[b].x - v.x)); }
  // walk the faces: from each directed edge, always the next edge clockwise from the way back (the face stays on
  // the left, so a bounded face comes out counter-clockwise, the outside clockwise)
  const used = new Set(), faces = [];
  for (let u0 = 0; u0 < V.length; u0++) for (const v0 of V[u0].nb) {
    if (used.has(u0 * 4194304 + v0)) continue;
    const poly = [], lis = [];
    let u = u0, v = v0, ok = true;
    for (let g = 0; g < 20000; g++) {
      used.add(u * 4194304 + v); poly.push(V[u]); lis.push(E.get(u * 4194304 + v));
      const nb = V[v].nb, i = nb.indexOf(u), w = nb[(i - 1 + nb.length) % nb.length];
      u = v; v = w;
      if (u === u0 && v === v0) break;
      if (g === 19999) ok = false;
    }
    if (!ok || poly.length < 3) continue;
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], k = p.x * q.y - q.x * p.y; A += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k; }
    if (A <= 1e-6) continue;
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    let virt = 0; for (const li of lis) if (lines[li].virt) virt++;
    faces.push({ poly: poly.map(p => ({ x: p.x, y: p.y })), pads: lis.map(li => lines[li].w || 0), lines: new Set(lis), area: A, x: cx, y: cy, virt, edges: lis.length });
  }
  return faces;
};

/* ---------- the block in a face ----------
   The largest rectangle (near enough) inside the polygon, each edge kept at its pad: in the frame of the longest
   edge, shrunk from the centroid until it fits, then each side pushed out while it still fits. Null if nothing
   over `min` across fits. */
function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function segBox(x0, y0, x1, y1, W, H) {
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 + W], [dx, W - x0], [-dy, y0 + H], [dy, H - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
IC.fabricRect = function (face, min, ang) {
  const P = face.poly, n = P.length;
  let a = ang;
  if (a == null) { let bl = -1; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], L = U.dist(p, q); if (L > bl) { bl = L; a = Math.atan2(q.y - p.y, q.x - p.x); } } }
  const ca = Math.cos(a), sa = Math.sin(a);
  // in the frame: x along the edge, y across, origin at the centroid
  const L = P.map(p => ({ x: (p.x - face.x) * ca + (p.y - face.y) * sa, y: -(p.x - face.x) * sa + (p.y - face.y) * ca }));
  const fits = (x0, y0, x1, y1) => {
    if (!pip(L, x0, y0) || !pip(L, x1, y0) || !pip(L, x0, y1) || !pip(L, x1, y1)) return false;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W = (x1 - x0) / 2, H = (y1 - y0) / 2;
    for (let i = 0; i < n; i++) { const p = L[i], q = L[(i + 1) % n], w = face.pads[i] || 0; if (segBox(p.x - cx, p.y - cy, q.x - cx, q.y - cy, W + w, H + w)) return false; }
    return true;
  };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of L) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = Math.max(...face.pads, 0);
  x0 += pad; y0 += pad; x1 -= pad; y1 -= pad;
  if (x1 - x0 < min || y1 - y0 < min) return null;
  // start from the square in the circle round the centroid that touches the nearest edge, then shrink about the
  // centroid until it fits
  let md = 1e9;
  for (let i = 0; i < n; i++) { const p = L[i], q = L[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, d = (ex * -p.y - ey * -p.x) / el - (face.pads[i] || 0); if (d < md) md = d; }
  if (md * 2 < min) return null;   // (the nearest edge is too close for anything to fit)
  let w = Math.min(x1, -x0) * 2, h = Math.min(y1, -y0) * 2, r = null;
  if (md > min / 2) { const sq = md * 0.7; if (fits(-sq, -sq, sq, sq)) r = [-sq, -sq, sq, sq]; }
  if (!r && (w < min || h < min)) { w = x1 - x0; h = y1 - y0; }
  if (!r)
  for (let k = 0; k < 40; k++) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const [ox, oy] of [[0, 0], [cx, cy], [cx / 2, cy / 2]]) if (fits(ox - w / 2, oy - h / 2, ox + w / 2, oy + h / 2)) { r = [ox - w / 2, oy - h / 2, ox + w / 2, oy + h / 2]; break; }
    if (r) break;
    if (w >= h) w *= 0.86; else h *= 0.86;
    if (w < min || h < min) return null;
  }
  if (!r) return null;
  // push each side out while it still fits
  for (let round = 0; round < 10; round++) {
    let grew = false;
    for (const side of [0, 1, 2, 3]) {
      const d = (side & 1 ? r[3] - r[1] : r[2] - r[0]) * 0.08, v = r[side] + (side < 2 ? -d : d);
      if (fits(side === 0 ? v : r[0], side === 1 ? v : r[1], side === 2 ? v : r[2], side === 3 ? v : r[3])) { r[side] = v; grew = true; }
    }
    if (!grew) break;
  }
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  return { x: face.x + cx * ca - cy * sa, y: face.y + cx * sa + cy * ca, w: r[2] - r[0], h: r[3] - r[1], a };
};
/* a big rectangle as several, with lanes between (a face the streets left too large) */
IC.fabricSplit = function (rc, sz, gap) {
  const n = Math.max(1, Math.round(rc.w / sz)), m = Math.max(1, Math.round(rc.h / sz));
  if (n === 1 && m === 1) return [rc];
  const out = [], cw = (rc.w - (n - 1) * gap) / n, ch = (rc.h - (m - 1) * gap) / m, ca = Math.cos(rc.a), sa = Math.sin(rc.a);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const u = -rc.w / 2 + i * (cw + gap) + cw / 2, v = -rc.h / 2 + j * (ch + gap) + ch / 2;
    out.push({ x: rc.x + u * ca - v * sa, y: rc.y + u * sa + v * ca, w: cw, h: ch, a: rc.a });
  }
  return out;
};

})(window.IC);
