/* Iron Canopy — roads and traffic on the map: the live road drawing close in (verges, lanes, markings, junctions,
   slip roads, bridges), streetlights at night, and the traffic itself, as flows far out and vehicles close in.
   render.js calls these with its context and the view rectangle. */
(function (IC) {
'use strict';
const U = IC.U, cam = IC.cam, C = IC.C;
let ctx = null, view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const inView = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
function label(txt, x, y, px, col, size, align, weight) {
  ctx.font = `${weight || 500} ${(size || 10) * px}px "IBM Plex Mono", monospace`;
  ctx.textAlign = align || 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(txt, x + 0.9 * px, y + 0.9 * px);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
  ctx.textAlign = 'left';
}

/* streetlights: along city streets, and on motorways through towns and at interchanges, a lamp every 40 m */
IC.streetLights = function (g, S, v, light, pf) {
  ctx = g; view = v;
  const W = S.world, k = (1 - light) * pf, P = [], sp = cam.z > 24 ? 0.4 : 0.8;
  const along = (l, off, step) => {
    if (l.bb && (l.bb[2] < view.x0 || l.bb[0] > view.x1 || l.bb[3] < view.y0 || l.bb[1] > view.y1)) return;
    let carry = 0, side = 1;
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) continue;
      const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      for (let t = carry; t < L; t += step) {
        const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L;
        if (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1) P.push(x + nx * off * side, y + ny * off * side);
        side = -side;
      }
      carry = (carry - L) % step; if (carry < 0) carry += step;
    }
  };
  for (const c of W.cities) {
    if (c.x + c.r * 1.6 < view.x0 || c.x - c.r * 1.6 > view.x1 || c.y + c.r * 1.6 < view.y0 || c.y - c.r * 1.6 > view.y1) continue;
    const plant = c.plant && S.byId[c.plant]; if (plant && plant.offline) continue;
    for (const l of c.streets) if (l.cls !== 'st' || cam.z > 24) along(l, IC.ROAD_SPEC[l.cls].w * 0.55, sp);   // side streets only close in
    // the national roads through town are its avenues; the bypass is lit round it
    for (const e of W.edges) if (e.city === c.id || e.bypass === c.id) along(e, IC.ROAD_SPEC[e.city ? 'art' : e.cls].w * 0.55 + 0.02, sp);
  }
  for (const r of W.ramps || []) along(r, 0.07, sp);
  if (!P.length) return;
  // a pool of light round each lamp close in; further out only the lamp itself (squares are far cheaper than circles)
  const dot = Math.max(0.02, 1.2 / cam.z);
  if (cam.z > 24) {
    const glow = Math.max(0.1, 4 / cam.z);
    ctx.globalAlpha = 0.12 * k; ctx.fillStyle = 'rgb(255,190,110)';
    ctx.beginPath(); for (let i = 0; i < P.length; i += 2) { ctx.moveTo(P[i] + glow, P[i + 1]); ctx.arc(P[i], P[i + 1], glow, 0, 7); } ctx.fill();
  }
  ctx.globalAlpha = 0.65 * k; ctx.fillStyle = 'rgb(255,226,170)';
  ctx.beginPath(); for (let i = 0; i < P.length; i += 2) ctx.rect(P[i] - dot / 2, P[i + 1] - dot / 2, dot, dot); ctx.fill();
  ctx.globalAlpha = 1;
};

/* roads close in: drawn live at the width of their real cross-section (roadgeom.js) once that is wider than a few
   pixels. Far out a clean hierarchy by width and colour; close in asphalt with verges, edge and lane lines, crash
   barriers and slip roads. Where roads meet, the junction is one surface laid over the roads' own markings (no
   disc, no overlap of strokes): curb returns, the main road's lines running through, give-way lines on the roads
   that meet it, roundabouts with their islands, tapers and gores where slip roads leave and join, bridges, and
   level crossings where a small road crosses a railway. */
const TONE = { hw: [238, 176, 104], ring: [232, 190, 130], rd: [214, 198, 158], art: [178, 174, 164], lc: [198, 186, 154], sp: [198, 186, 154], st: [148, 146, 140], ln: [160, 140, 100], ramp: [230, 184, 124] };
const ASPHALT = [72, 73, 74], SHOULDER = [84, 85, 85];
const PAINT = 'rgba(238,238,230,0.88)', VERGE = 'rgb(118,138,84)';
const SP = IC.ROAD_SPEC;
IC.drawRoads = function (g, S, px, v) {
  ctx = g; view = v;
  const W = S.world, z = cam.z, t = U.clamp((z - 3) / 6, 0, 1), m = 5;
  const vis = l => (l.bb || bbox(l)) && l.bb[2] > view.x0 - m && l.bb[0] < view.x1 + m && l.bb[3] > view.y0 - m && l.bb[1] < view.y1 + m;
  const groups = { sp: [], lc: [], rd: [], art: [], ring: [], ramp: [], hw: [] };
  for (const e of W.edges) if (vis(e)) groups[e.city ? e.ccls || 'art' : e.cls].push(e);
  for (const r of W.ramps || []) if (vis(r)) groups.ramp.push(r);
  // where roads meet (worked out once, roadgeom.js); close in only, where the shapes show
  const R = z > 3 ? IC.roadJoins(W) : null;
  const joins = [], rbs = [], merges = [];
  if (R) {
    for (const j of R.joins) if (inView(j.x, j.y, 1)) { joins.push(j); if (j.stubs) groups.ramp.push(...j.stubs); }
    for (const j of R.rbs) if (inView(j.x, j.y, 2)) rbs.push(j);
    for (const e of R.ends) if (e.kind === 'merge' && inView(e.q.x, e.q.y, 3)) merges.push(e);
  }
  const path = list => {
    ctx.beginPath();
    for (const l of list) for (const P of IC.roadRuns(W, l)) {
      let on = false;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        if (Math.max(a.x, b.x) < view.x0 - m || Math.min(a.x, b.x) > view.x1 + m || Math.max(a.y, b.y) < view.y0 - m || Math.min(a.y, b.y) > view.y1 + m) { on = false; continue; }
        if (!on) { ctx.moveTo(a.x, a.y); on = true; }
        ctx.lineTo(b.x, b.y);
      }
    }
  };
  const width = k => IC.roadWidth(k, z), half = k => IC.roadWidth(k, z) / 2;
  const tone = (k, base) => { const c = TONE[k] || TONE.lc, a = base || ASPHALT; return `rgb(${c[0] + (a[0] - c[0]) * t | 0},${c[1] + (a[1] - c[1]) * t | 0},${c[2] + (a[2] - c[2]) * t | 0})`; };
  const fill = k => tone(k);
  const stroke = (k, w, col, dash) => { if (!groups[k].length) return; path(groups[k]); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.stroke(); if (dash) ctx.setLineDash([]); };
  const poly = P => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
  const line = P => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
  // a painted line: its real width (15–20 cm) or a pixel, whichever is wider; dashes likewise
  const lw = Math.max(0.0022, 0.8 * px), D = (real, pxs) => Math.max(real, pxs * px);
  const top = site => site.arms.reduce((a, b) => (IC.ROAD_RANK[b.cls] || 0) > (IC.ROAD_RANK[a.cls] || 0) ? b : a).cls;
  const geo = s => IC.joinGeom(s, half);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  // close in, the railways under the roads: ballast, sleepers and the two rails (a road crosses on a bridge or at a
  // level crossing, drawn after)
  if (z > 30) for (const r of W.rails) {
    if (!vis(r)) continue;
    // (only the stretches in view)
    const runs = []; let cur = null;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      if (Math.max(a.x, b.x) < view.x0 - 1 || Math.min(a.x, b.x) > view.x1 + 1 || Math.max(a.y, b.y) < view.y0 - 1 || Math.min(a.y, b.y) > view.y1 + 1) { cur = null; continue; }
      if (!cur) runs.push(cur = [a]); cur.push(b);
    }
    for (const P of runs) {
      ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.strokeStyle = 'rgb(126,118,104)'; ctx.lineWidth = 0.055; ctx.stroke();
      if (z > 90) { ctx.strokeStyle = 'rgb(88,72,58)'; ctx.lineWidth = 0.026; ctx.setLineDash([0.0025, 0.0035]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = 'rgb(150,150,150)'; ctx.lineWidth = Math.max(0.0012, px * 0.9);
      ctx.beginPath(); for (const o of [-0.0072, 0.0072]) IC.PL.offset(P, o).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
  }
  const order = ['sp', 'lc', 'art', 'rd', 'ring', 'ramp', 'hw'];
  // verges: mown grass either side
  if (z > 2.5) {
    const col = `rgba(118,138,84,${0.6 * t + 0.25})`;
    for (const k of order) stroke(k, width(k) + (k === 'hw' ? 0.08 : k === 'rd' ? 0.05 : 0.03), col);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    for (const j of joins) { const G = geo(j); poly(G.surf); ctx.lineWidth = 0.05; ctx.stroke(); ctx.fill(); }
    for (const j of rbs) { const G = IC.rbGeom(j, half); ctx.beginPath(); ctx.arc(G.C.x, G.C.y, G.Ro + 0.04, 0, 7); ctx.fill(); for (const a of G.arms) { poly(a.surf); ctx.lineWidth = 0.06; ctx.stroke(); } }
  }
  // the road's edge: a dark line far out, the kerb and crumb of the asphalt close in
  const edgeW = k => width(k) * (0.45 - t * 0.38) + px * 0.8;
  const edgeCol = 'rgba(22,20,16,0.55)';
  for (const k of order) stroke(k, width(k) + edgeW(k), edgeCol);
  ctx.strokeStyle = edgeCol; ctx.fillStyle = edgeCol;
  for (const j of joins) { const G = geo(j); poly(G.surf); ctx.lineWidth = edgeW(top(j)); ctx.stroke(); }
  for (const j of rbs) { const G = IC.rbGeom(j, half); ctx.beginPath(); ctx.arc(G.C.x, G.C.y, G.Ro + edgeW('rd') / 2, 0, 7); ctx.fill(); ctx.lineWidth = edgeW('rd'); for (const a of G.arms) { poly(a.surf); ctx.stroke(); } }
  if (z > 4) for (const e of merges) { const T = IC.taperGeom(e, half('hw'), half('ramp')); ctx.lineWidth = edgeW('ramp'); poly(T.aux); ctx.stroke(); if (T.gore) { poly(T.gore); ctx.stroke(); } }
  // the asphalt: shoulders a shade lighter close in, crash barriers along motorways
  for (const k of order) {
    if (k === 'hw' && z > 5) stroke(k, width(k) + lw * 3, 'rgb(170,170,164)');
    stroke(k, width(k), z > 5 && (k === 'hw' || k === 'rd' || k === 'ramp' || k === 'ring') ? tone(k, SHOULDER) : fill(k));
  }
  for (const j of joins) { ctx.fillStyle = fill(top(j)); poly(geo(j).surf); ctx.fill(); }
  if (z > 4) for (const e of merges) { const T = IC.taperGeom(e, half('hw'), half('ramp')); ctx.fillStyle = tone('hw', z > 5 ? SHOULDER : ASPHALT); poly(T.aux); ctx.fill(); if (T.gore) { poly(T.gore); ctx.fill(); } }
  // (each line only once the road is wide enough on screen to carry it)
  const pw = k => width(k) * z;
  if (z > 5) {
    // motorways: two carriageways of two lanes, edge lines, a central reservation with a barrier
    const s = SP.hw, f = width('hw') / s.w, asp = fill('hw'), o = s.med / 2 + s.strip, c = o + 2 * s.lane;
    if (pw('hw') > 9) { stroke('hw', 2 * c * f + lw, PAINT); stroke('hw', 2 * c * f - lw, asp); }
    if (pw('hw') > 18) { stroke('hw', 2 * (o + s.lane) * f + lw, PAINT, [D(0.06, 6), D(0.12, 10)]); stroke('hw', 2 * (o + s.lane) * f - lw, asp); }
    if (pw('hw') > 14) { stroke('hw', 2 * o * f + lw, PAINT); stroke('hw', 2 * o * f - lw, tone('hw', SHOULDER)); }
    stroke('hw', s.med * f, 'rgb(112,128,86)'); if (pw('hw') > 14) stroke('hw', Math.max(0.004, px * 1.2), 'rgb(186,186,180)');
    // slip roads: one lane between edge lines
    const fr = width('ramp') / SP.ramp.w; if (pw('ramp') > 8) { stroke('ramp', SP.ramp.lane * fr + lw, PAINT); stroke('ramp', SP.ramp.lane * fr - lw, fill('ramp')); }
    // main roads: edge lines inside the hard strips, a dashed centre line
    const fd = width('rd') / SP.rd.w; if (pw('rd') > 9) { stroke('rd', 2 * SP.rd.lane * fd + lw, PAINT); stroke('rd', 2 * SP.rd.lane * fd - lw, fill('rd')); }
    if (pw('rd') > 5) stroke('rd', lw, PAINT, [D(0.03, 5), D(0.06, 8)]);
    if (pw('lc') > 6) stroke('lc', lw, 'rgba(238,238,230,0.7)', [D(0.03, 4), D(0.07, 9)]);
    if (pw('art') > 10) stroke('art', lw, 'rgba(236,236,226,0.7)', [D(0.06, 5), D(0.09, 8)]);
  }
  // slip roads leaving and joining: the auxiliary lane (the motorway's edge line broken beside it), the taper, the
  // gore of chevrons in the V where they part
  if (z > 5) for (const e of merges) {
    const T = IC.taperGeom(e, half('hw'), half('ramp'));
    ctx.fillStyle = fill('hw'); poly(T.aux); ctx.fill();
    ctx.strokeStyle = PAINT; ctx.lineWidth = lw * 1.8; ctx.setLineDash([D(0.03, 4), D(0.03, 4)]); line(T.aux.slice(T.aux.length / 2)); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = lw; line(T.lane.map((p, i) => { const q = T.aux[T.aux.length - 1 - i]; return { x: p.x + (q.x - p.x) * 0.12, y: p.y + (q.y - p.y) * 0.12 }; })); ctx.stroke();
    if (T.gore) gore(T.gore, lw, px);
  }
  // junctions: one surface over the roads' markings, then its own
  for (const j of joins) junction(j, geo(j), fill(top(j)), lw, D, z, t, px);
  for (const j of rbs) roundabout(j, IC.rbGeom(j, half), fill, lw, D, z, px);
  // city crossings on the avenues drawn here (the side streets' are in the tiles, painted by the same code)
  if (z > 4) for (const c of W.cities) {
    if (c.x + c.r * 1.8 < view.x0 || c.x - c.r * 1.8 > view.x1 || c.y + c.r * 1.8 < view.y0 || c.y - c.r * 1.8 > view.y1) continue;
    for (const j of IC.streetJoins(W, c)) if (j.ave && inView(j.x, j.y, 1)) IC.paintStreetJoin(ctx, j, z > 16 ? 5 : 3, px);
  }
  // bridges at interchanges: the road that crosses over, with its shadow and parapets
  for (const j of W.junctions || []) if (j.over && inView(j.x, j.y, 3)) overpass(j, width, fill, px);
  if (z > 2) for (const x of IC.railCrossings(W)) {
    if (!inView(x.x, x.y, 2)) continue;
    if (x.level && z > 5) levelCrossing(x, width(x.cls), lw, px, S);
    else if (!x.level) overpass({ x: x.x, y: x.y, over: [x.a], dirs: [{ a: x.a, x: Math.cos(x.a), y: Math.sin(x.a), cls: x.cls }] }, width, fill, px, Math.max(0.16, width(x.cls) * 1.2));
  }
  // craters and patches in the roads, over the live road drawing
  for (const mk of S.marks) if (mk.kind === 'road' && inView(mk.x, mk.y, mk.r * 2)) IC.drawMark(ctx, mk, S.time, 3);
};
/* a road's stretches above ground: cut where it runs in a tunnel under an airfield (kept until the tunnels change) */
IC.roadRuns = function (W, l) {
  const T = W.tunnels; if (!T || !T.length) return [l.pts];
  if (l._rk !== T.length || l._rp !== l.pts) { l._rk = T.length; l._rp = l.pts; l._runs = IC.openRuns(W, l.pts); }
  return l._runs;
};
function bbox(l) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of l.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } l.bb = [x0, y0, x1, y1]; return l.bb; }
const pline = P => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
const ppoly = P => { pline(P); ctx.closePath(); };
/* the gore where a slip road parts from the carriageway: white edges and chevrons between */
function gore(P, lw, px) {
  ctx.save(); ppoly(P); ctx.clip();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const a = Math.atan2(P[P.length - 1].y - P[0].y, P[P.length - 1].x - P[0].x) + 0.9, st = Math.max(0.03, 5 * px);
  ctx.strokeStyle = PAINT; ctx.lineWidth = Math.max(0.006, 1.6 * px); ctx.beginPath();
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2 + 0.05;
  for (let d = -r; d <= r; d += st) { const ox = Math.cos(a + Math.PI / 2) * d, oy = Math.sin(a + Math.PI / 2) * d; ctx.moveTo(cx + ox - Math.cos(a) * r, cy + oy - Math.sin(a) * r); ctx.lineTo(cx + ox + Math.cos(a) * r, cy + oy + Math.sin(a) * r); }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = PAINT; ctx.lineWidth = lw; ppoly(P); ctx.stroke();
}
/* a junction's own surface and markings: the curb returns' edge lines, the main road's centre and edge lines through
   (broken across the mouths of the roads that meet it) and a give-way line across the lane coming in on each of those */
function junction(j, G, asp, lw, D, z, t, px) {
  ctx.fillStyle = asp; ppoly(G.surf); ctx.fill();
  if (z < 5) return;
  const A = G.arms, N = G.N, inset = Math.max(lw * 1.5, 0.004);
  const edged = a => a.cls === 'rd' || a.cls === 'ramp' || a.cls === 'hw';
  ctx.strokeStyle = PAINT; ctx.lineWidth = lw;
  const at = (a, s, o) => ({ x: N.x + a.ux * s - a.uy * o, y: N.y + a.uy * s + a.ux * o });
  const eo = a => SPEC_LANE(a) * (a.h / SP[a.cls].w * 2);   // where an arm's edge line runs, from its centre
  // the edge lines follow each curb return round from one road's edge line to the other's
  const ft = new Map();
  G.fil.forEach((f, i) => {
    if (!f || !(edged(f.A) || edged(f.B))) return;
    const sh = a => edged(a) ? a.h - eo(a) : inset;
    const ins = Math.min(Math.max(sh(f.A), sh(f.B)), Math.min(f.A.h, f.B.h) * 0.5), j = (i + 1) % A.length;
    const P = IC.roadArc(f.O, f.R + ins, f.T1, f.T2);
    const sA = (P[0].x - N.x) * f.A.ux + (P[0].y - N.y) * f.A.uy, sB = (P[P.length - 1].x - N.x) * f.B.ux + (P[P.length - 1].y - N.y) * f.B.uy;
    const L = [];
    if (edged(f.A)) L.push(at(f.A, Math.max(G.mouth[i], sA), eo(f.A)));
    L.push(...P);
    if (edged(f.B)) L.push(at(f.B, Math.max(G.mouth[j], sB), -eo(f.B)));
    ctx.lineWidth = lw; pline(L); ctx.stroke();
    ft.set(i, { a: P[0], b: P[P.length - 1] });
  });
  if (G.main) {
    const [i, k] = G.main, a = A[i], b = A[k], ma = G.mouth[i], mb = G.mouth[k];
    // the centre line runs through
    const cl = a.cls === 'rd' ? [D(0.03, 5), D(0.06, 8)] : a.cls === 'lc' ? [D(0.03, 4), D(0.07, 9)] : null;
    if (cl && (a.cls !== 'lc' || z > 9)) { ctx.lineWidth = lw; ctx.setLineDash(cl); pline([at(a, ma, 0), N, at(b, mb, 0)]); ctx.stroke(); ctx.setLineDash([]); }
    // and its edge line, broken, across the mouth of each road that meets it: from where the curb return leaves it
    // on one side to where the next comes back
    if (edged(a) && edged(b)) for (const [p, q] of [[i, k], [k, i]]) {
      if ((q - p + A.length) % A.length === 1) {
        // nothing meets it on this side: the edge line runs on, solid (a curb return on a bend has drawn it already)
        if (!G.fil[p]) { ctx.lineWidth = lw; pline([at(A[p], G.mouth[p], eo(A[p])), at(A[q], G.mouth[q], -eo(A[q]))]); ctx.stroke(); }
        continue;
      }
      const f0 = G.fil[p], f1 = G.fil[(q - 1 + A.length) % A.length];
      const P0 = f0 ? at(A[p], (f0.T1.x - N.x) * A[p].ux + (f0.T1.y - N.y) * A[p].uy, eo(A[p])) : at(A[p], G.mouth[p], eo(A[p]));
      const P1 = f1 ? at(A[q], (f1.T2.x - N.x) * A[q].ux + (f1.T2.y - N.y) * A[q].uy, -eo(A[q])) : at(A[q], G.mouth[q], -eo(A[q]));
      ctx.lineWidth = lw; ctx.setLineDash([D(0.02, 3), D(0.02, 3)]); pline([P0, P1]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // give way: a double dashed line across the lane coming in (right-hand traffic: on the arm's clockwise side),
  // where the main road's edge line would run across it
  const gwAt = (a, q) => {
    if (!G.main) return G.mouth[q];
    let s0 = 0;
    for (const i of G.main) {
      const b = A[i], o = edged(b) ? SPEC_LANE(b) * (b.h / SP[b.cls].w * 2) : b.h, sn = Math.abs(a.ux * b.uy - a.uy * b.ux);
      if (sn > 0.2) s0 = Math.max(s0, (o + a.h * Math.abs(a.ux * b.ux + a.uy * b.uy)) / sn);
    }
    return Math.min(G.mouth[q], s0 + lw);
  };
  A.forEach((a, q) => {
    if (G.main && G.main.includes(q)) return;
    if (!G.main && A.length < 4) return;
    const m = gwAt(a, q) + lw * 2, w = a.h * (edged(a) ? 0.66 : 0.92);
    ctx.lineWidth = Math.max(0.004, lw * 1.6); ctx.setLineDash([D(0.012, 3), D(0.008, 2)]);
    pline([at(a, m, 0), at(a, m, -w)]); ctx.stroke();
    pline([at(a, m + Math.max(0.01, lw * 4), 0), at(a, m + Math.max(0.01, lw * 4), -w)]); ctx.stroke();
    ctx.setLineDash([]);
    // (the centre line leading up to it is solid)
    if (a.cls !== 'sp' && z > 9) { ctx.lineWidth = lw; pline([at(a, m, 0), at(a, m + Math.min(0.25, a.len * 0.3), 0)]); ctx.stroke(); }
  });
}
const SPEC_LANE = a => (SP[a.cls] || SP.lc).lane * ((SP[a.cls] || SP.lc).lanes || 1);
/* a roundabout: the ring, the flared entries with their curb returns, the kerbed island (a strip of cobbles for
   lorries, grass, planting in the middle), splitter islands and give-way lines */
function roundabout(j, G, fill, lw, D, z, px) {
  const C = G.C, asp = fill('rd');
  ctx.fillStyle = asp; ctx.beginPath(); ctx.arc(C.x, C.y, G.Ro, 0, 7); ctx.fill();
  if (z > 5) { ctx.strokeStyle = PAINT; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(C.x, C.y, G.Ro - Math.max(0.006, lw * 2), 0, 7); ctx.stroke(); }
  for (const a of G.arms) { ctx.fillStyle = fill(a.a.cls === 'hw' ? 'rd' : a.a.cls); ppoly(a.surf); ctx.fill(); }
  // the island
  const kerb = Math.max(0.004, px * 1.2);
  ctx.fillStyle = 'rgb(178,176,168)'; ctx.beginPath(); ctx.arc(C.x, C.y, G.Ri, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgb(128,118,104)'; ctx.beginPath(); ctx.arc(C.x, C.y, G.Ri - kerb, 0, 7); ctx.fill();
  const gr = G.Ri - G.apron;
  ctx.fillStyle = 'rgb(176,174,166)'; ctx.beginPath(); ctx.arc(C.x, C.y, gr, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgb(98,132,70)'; ctx.beginPath(); ctx.arc(C.x, C.y, gr - kerb, 0, 7); ctx.fill();
  if (z > 5) {
    // cobbles on the lorry apron, mowing rings, a bed of shrubs and trees in the middle
    if (z > 20) { ctx.strokeStyle = 'rgba(90,82,70,0.5)'; ctx.lineWidth = px * 0.6; ctx.setLineDash([px * 2, px * 2]); ctx.beginPath(); ctx.arc(C.x, C.y, G.Ri - G.apron / 2, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = 'rgba(120,152,86,0.5)'; ctx.lineWidth = gr * 0.08; ctx.beginPath(); ctx.arc(C.x, C.y, gr * 0.75, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgb(122,104,76)'; ctx.beginPath(); ctx.arc(C.x, C.y, gr * 0.42, 0, 7); ctx.fill();
    const n = 7, seed = (j.x * 13 + j.y * 7) | 0;
    ctx.fillStyle = 'rgba(8,14,8,0.35)'; ctx.beginPath();
    for (let i = 0; i < n; i++) { const an = i / n * 6.283 + U.hash(i, seed), d = gr * (i ? 0.26 : 0), r = gr * (0.12 + 0.05 * U.hash(seed, i)); ctx.moveTo(C.x + Math.cos(an) * d + r + gr * 0.04, C.y + Math.sin(an) * d + gr * 0.05); ctx.arc(C.x + Math.cos(an) * d + gr * 0.04, C.y + Math.sin(an) * d + gr * 0.05, r, 0, 7); }
    ctx.fill();
    for (let i = 0; i < n; i++) { const an = i / n * 6.283 + U.hash(i, seed), d = gr * (i ? 0.26 : 0), r = gr * (0.12 + 0.05 * U.hash(seed, i)); ctx.fillStyle = ['rgb(52,82,44)', 'rgb(64,96,50)', 'rgb(46,72,40)'][i % 3]; ctx.beginPath(); ctx.arc(C.x + Math.cos(an) * d, C.y + Math.sin(an) * d, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(210,190,90,0.7)'; ctx.beginPath(); for (let i = 0; i < 18; i++) { const an = i / 18 * 6.283, x = C.x + Math.cos(an) * gr * 0.5, y = C.y + Math.sin(an) * gr * 0.5; ctx.moveTo(x + gr * 0.025, y); ctx.arc(x, y, gr * 0.025, 0, 7); } ctx.fill();
    // each entry: the splitter island, its painted outline, the give-way line
    for (const a of G.arms) {
      ctx.fillStyle = 'rgb(178,176,168)'; ppoly(a.isl); ctx.fill();
      ctx.strokeStyle = PAINT; ctx.lineWidth = lw; ppoly(a.isl); ctx.stroke();
      ctx.lineWidth = Math.max(0.004, lw * 1.6); ctx.setLineDash([D(0.012, 3), D(0.008, 2)]); pline(a.gy); ctx.stroke(); ctx.setLineDash([]);
      // a hatched nose leading up to the island
      const s1 = a.s1, s2 = Math.min(a.a.len * 0.45, s1 + (a.s1 - a.s0) * 0.7);
      if (s2 > s1 + 0.01) { ctx.lineWidth = lw; pline([a.P(s1, 0), a.P(s2, 0)]); ctx.stroke(); }
    }
  }
}
/* the road that crosses at an interchange (or over a railway) rides a bridge: its shadow, the deck, parapets. At an
   interchange each road over it has its own half of the deck, from the junction out along it (so a road that bends
   there has a bent bridge); over a railway the deck runs both ways */
function overpass(j, width, fill, px, span) {
  ctx.lineCap = 'butt';
  for (const a of j.over) {
    const d = j.dirs.find(q => q.a === a); if (!d) continue;
    const cls = d.e && d.e.city ? 'art' : d.cls, w = width(cls), L = span || width('hw') * 0.55 + Math.max(0.12, w * 1.2);
    const x0 = span ? j.x - d.x * L : j.x - d.x * w * 0.5, y0 = span ? j.y - d.y * L : j.y - d.y * w * 0.5, x1 = j.x + d.x * L, y1 = j.y + d.y * L;
    const sh = Math.max(w * 0.4, 0.04);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = w * 1.4; ctx.beginPath(); ctx.moveTo(x0 + sh * 0.7, y0 + sh); ctx.lineTo(x1 + sh * 0.7, y1 + sh); ctx.stroke();
    ctx.strokeStyle = 'rgb(170,168,160)'; ctx.lineWidth = w + Math.max(0.012, px * 2.4); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgb(206,204,196)'; ctx.lineWidth = w + Math.max(0.006, px * 1.2); ctx.stroke();
    ctx.strokeStyle = fill(cls); ctx.lineWidth = w; ctx.stroke();
    // the deck's joint where it comes down to the ground
    const nx = -d.y * w / 2, ny = d.x * w / 2, bx = x1 - d.x * Math.max(0.006, px * 2), by = y1 - d.y * Math.max(0.006, px * 2);
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = Math.max(0.003, px); ctx.beginPath(); ctx.moveTo(bx - nx, by - ny); ctx.lineTo(bx + nx, by + ny);
    if (span) { const cx = x0 + d.x * Math.max(0.006, px * 2), cy = y0 + d.y * Math.max(0.006, px * 2); ctx.moveTo(cx - nx, cy - ny); ctx.lineTo(cx + nx, cy + ny); }
    ctx.stroke();
  }
}
/* a level crossing: rubber panels across the road, the rails, stop lines and a half barrier on each approach */
function levelCrossing(x, w, lw, px, S) {
  const ra = x.ra, rx = Math.cos(ra), ry = Math.sin(ra), ux = Math.cos(x.a), uy = Math.sin(x.a);
  // along the road (u) and along the rails (r)
  const P = (s, o) => ({ x: x.x + ux * s + rx * o, y: x.y + uy * s + ry * o });
  const sin = Math.abs(ux * ry - uy * rx) || 1, half = w / 2 / sin + 0.02;
  ctx.fillStyle = 'rgb(46,46,48)'; ppoly([P(-0.025, -half), P(-0.025, half), P(0.025, half), P(0.025, -half)]); ctx.fill();
  ctx.strokeStyle = 'rgb(168,168,164)'; ctx.lineWidth = Math.max(0.002, px * 0.8); ctx.beginPath();
  for (const o of [-0.0072, 0.0072]) { const nx = -ry * o, ny = rx * o; ctx.moveTo(x.x + nx - rx * (half + 0.03), x.y + ny - ry * (half + 0.03)); ctx.lineTo(x.x + nx + rx * (half + 0.03), x.y + ny + ry * (half + 0.03)); }
  ctx.stroke();
  // stop lines and barriers on each approach (right-hand traffic: the barrier closes the lane coming in)
  const shut = S && IC.trainNear ? IC.trainNear(S, x) : false;
  for (const sg of [1, -1]) {
    const s = sg * (0.06 + w * 0.2), nx = -uy, ny = ux, r = -sg;   // the lane coming in is on the right of travel towards the rails
    ctx.strokeStyle = PAINT; ctx.lineWidth = Math.max(0.004, lw * 1.8);
    ctx.beginPath(); ctx.moveTo(x.x + ux * s, x.y + uy * s); ctx.lineTo(x.x + ux * s + nx * r * w / 2, x.y + uy * s + ny * r * w / 2); ctx.stroke();
    const b0 = { x: x.x + ux * (s - sg * 0.012) + nx * r * (w / 2 + 0.012), y: x.y + uy * (s - sg * 0.012) + ny * r * (w / 2 + 0.012) };
    const L = shut ? w / 2 + 0.006 : 0.012, b1 = shut ? { x: b0.x - nx * r * L, y: b0.y - ny * r * L } : { x: b0.x - ux * sg * 0.035, y: b0.y - uy * sg * 0.035 };
    ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(0.004, px * 1.6);
    ctx.strokeStyle = 'rgb(240,240,236)'; ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
    ctx.strokeStyle = 'rgb(200,40,36)'; ctx.setLineDash([Math.max(0.006, px * 2), Math.max(0.006, px * 2)]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgb(60,60,62)'; ctx.beginPath(); ctx.arc(b0.x, b0.y, Math.max(0.004, px * 1.6), 0, 7); ctx.fill();
    // the crossbuck board on its post
    ctx.fillStyle = 'rgb(236,236,232)'; ctx.fillRect(b0.x - ux * sg * 0.004 - Math.max(0.003, px), b0.y - uy * sg * 0.004 - Math.max(0.003, px), Math.max(0.006, px * 2), Math.max(0.006, px * 2));
  }
}

/* ---------- city street crossings (roadgeom.js IC.streetJoins) ----------
   Painted into the tiles after the blocks (terrain.js), and live over the avenues close in, by the same code: the
   pavement follows each curb return round the corner, the crossing is one surface of asphalt over the streets' own
   lines, and on the busier crossings there are zebra crossings across each arm, a stop line before them on the lane
   coming in, and close in arrows on the avenues' lanes. lod: the tile level (5 live), px: a pixel in world units */
const STREET_ASP = { st: 'rgb(80,81,82)', art: 'rgb(72,73,74)', ring: 'rgb(68,69,70)' };
IC.STREET_ASP = STREET_ASP;
const streetHalf = k => (IC.ROAD_SPEC[k] || IC.ROAD_SPEC.st).w / 2;
IC.paintStreetJoin = function (g, j, lod, px) {
  const G = IC.joinGeom(j, streetHalf), A = G.arms, N = G.N;
  const top = A.reduce((a, b) => (IC.ROAD_RANK[b.cls] || 0) > (IC.ROAD_RANK[a.cls] || 0) ? b : a).cls;
  const pl = P => { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
  // the crossing's asphalt, its corners rounded into the lots' square corners (the lot is the pavement), and the kerb
  // a pale line along each curb return
  g.fillStyle = STREET_ASP[top] || STREET_ASP.st; pl(G.surf); g.closePath(); g.fill();
  if (lod < 4) return;
  g.strokeStyle = 'rgba(190,188,180,0.85)'; g.lineWidth = Math.max(0.008, px * 0.8); g.lineCap = 'butt';
  for (const f of G.fil) if (f) { pl(f.arc); g.stroke(); }
  const at = (a, s, o) => ({ x: N.x + a.ux * s - a.uy * o, y: N.y + a.uy * s + a.ux * o });
  const busy = j.big || A.length >= 4;
  A.forEach((a, q) => {
    if (a.len < 0.5) return;
    const m = G.mouth[q], hL = Math.min(a.hl != null ? a.hl : a.h, a.h) - 0.015, hR = Math.min(a.hr != null ? a.hr : a.h, a.h) - 0.015, h = (hL + hR) / 2, zw = 0.035;
    if (busy) {
      // a zebra across the arm just beyond the corner: its stripes run along the street
      const s0 = m + 0.008, n = Math.max(3, Math.round((hL + hR) / 0.012)), st = (hL + hR) / n;
      g.fillStyle = 'rgba(236,236,228,0.85)';
      if (st * (1 / px) < 1.6) { g.globalAlpha = 0.45; pl([at(a, s0, -hR), at(a, s0, hL), at(a, s0 + zw, hL), at(a, s0 + zw, -hR)]); g.closePath(); g.fill(); g.globalAlpha = 1; }
      else { g.beginPath(); for (let i = 0; i < n; i += 2) { const o0 = -hR + i * st, o1 = o0 + st; const P = [at(a, s0, o0), at(a, s0, o1), at(a, s0 + zw, o1), at(a, s0 + zw, o0)]; g.moveTo(P[0].x, P[0].y); for (const p of P.slice(1)) g.lineTo(p.x, p.y); g.closePath(); } g.fill(); }
      // the stop line on the lane coming in (right-hand traffic: the arm's clockwise side), before the zebra
      g.strokeStyle = 'rgba(236,236,228,0.85)'; g.lineWidth = Math.max(0.005, px * 1.2);
      pl([at(a, s0 + zw + 0.012, 0), at(a, s0 + zw + 0.012, -hR)]); g.stroke();
      // arrows in the lanes coming in, close in
      if (lod >= 5 && 1 / px > 60 && (a.cls === 'art' || a.cls === 'ring')) {
        g.fillStyle = 'rgba(236,236,228,0.8)';
        for (const o of [-hR * 0.3, -hR * 0.72]) {
          const b = at(a, s0 + zw + 0.07, o), tip = at(a, s0 + zw + 0.03, o), w = 0.006, L2 = 0.03;
          g.beginPath(); g.moveTo(tip.x, tip.y);
          const p1 = at(a, s0 + zw + 0.045, o - w * 1.8), p2 = at(a, s0 + zw + 0.045, o + w * 1.8), q1 = at(a, s0 + zw + 0.045, o - w * 0.6), q2 = at(a, s0 + zw + 0.045, o + w * 0.6), r1 = at(a, s0 + zw + 0.045 + L2, o - w * 0.6), r2 = at(a, s0 + zw + 0.045 + L2, o + w * 0.6);
          g.lineTo(p1.x, p1.y); g.lineTo(q1.x, q1.y); g.lineTo(r1.x, r1.y); g.lineTo(r2.x, r2.y); g.lineTo(q2.x, q2.y); g.lineTo(p2.x, p2.y); g.closePath(); g.fill();
          void b;
        }
      }
    }
  });
};
/* a city's crossings inside a box */
IC.paintStreetJoins = function (g, W, c, x0, y0, x1, y1, lod, px) {
  for (const j of IC.streetJoins(W, c)) if (j.x > x0 - 1 && j.x < x1 + 1 && j.y > y0 - 1 && j.y < y1 + 1) IC.paintStreetJoin(g, j, lod, px);
};

// how wide a river is drawn close in (terrain.js: 0.3 of its width in the far view)
const RW = new Map();
function riverW(W, name) { if (!RW.has(name)) { const r = W.rivers.find(q => q.name === name); RW.set(name, r ? r.w * 0.3 : 2); } return RW.get(name); }
IC.drawRoadBridges = function (g, S, px, v) {
  ctx = g; view = v;
  if (cam.z < 0.2) return;
  for (const b of S.infra) {
    if (b.kind !== 'bridge' || !inView(b.x, b.y, 30)) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    // far out a clear symbol; close in the bridge at its real size: the river's width and a bit, parapets, a shadow
    const near = U.clamp((cam.z - 2) / 3, 0, 1), rw = riverW(S.world, b.river);
    const w = Math.max(IC.roadWidth(b.cls, cam.z) * (1.3 - near * 0.15), b.cls === 'hw' ? 0.6 * (1 - near) : 0.3 * (1 - near)), H = U.lerp(6, rw / 2 + 0.35, near);
    if (b.offline) {
      ctx.fillStyle = 'rgba(40,36,30,0.95)'; ctx.fillRect(-H, -w / 2, H * 0.66, w); ctx.fillRect(H * 0.34, -w / 2, H * 0.66, w);
      ctx.strokeStyle = C.hostile; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(-H / 3, -w); ctx.lineTo(H / 3, w); ctx.moveTo(H / 3, -w); ctx.lineTo(-H / 3, w); ctx.stroke();
    } else if (near < 1) {
      ctx.globalAlpha = 1 - near;
      ctx.fillStyle = 'rgba(220,210,190,0.95)'; ctx.fillRect(-H, -w / 2, 2 * H, w);
      ctx.strokeStyle = 'rgba(40,36,30,0.9)'; ctx.lineWidth = Math.min(0.5, w * 0.15); ctx.strokeRect(-H, -w / 2, 2 * H, w);
      ctx.globalAlpha = 1;
    }
    if (!b.offline && near > 0) {
      ctx.globalAlpha = near;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-H + 0.06, -w / 2 + 0.08, 2 * H, w);
      ctx.fillStyle = 'rgb(168,166,160)'; ctx.fillRect(-H, -w / 2 - 0.03, 2 * H, w + 0.06);
      ctx.fillStyle = 'rgb(74,75,76)'; ctx.fillRect(-H, -w / 2 + 0.02, 2 * H, w - 0.04);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (b.offline && cam.z > 0.4) label('BRIDGE DOWN', b.x, b.y - 10 * px, px, C.hostile, 8.5, 'center', 700);
  }
};
/* traffic: far out, the flow along each road; in the middle, vehicles riding the flow; close in, vehicles making
   their own trips (traffic.js). Every kind has its size and colours; at night headlights, tail lights and the blue
   lights of police cars and ambulances. */
const AGZ = 10;   // closer than this, individual vehicles
const CAR_COLS = ['rgb(232,232,228)', 'rgb(236,236,232)', 'rgb(190,192,196)', 'rgb(176,178,182)', 'rgb(38,40,44)', 'rgb(60,62,66)', 'rgb(96,100,106)', 'rgb(168,38,34)', 'rgb(36,64,132)', 'rgb(60,96,150)', 'rgb(48,84,58)', 'rgb(198,184,150)', 'rgb(118,22,30)', 'rgb(222,184,52)', 'rgb(214,110,40)'];
const TRAILER = ['rgb(232,232,228)', 'rgb(200,202,204)', 'rgb(52,92,150)', 'rgb(170,50,40)', 'rgb(64,110,70)', 'rgb(212,168,60)'];
const CAB = ['rgb(236,236,232)', 'rgb(170,40,36)', 'rgb(40,70,140)', 'rgb(40,42,46)', 'rgb(220,190,60)'];
/* the parts of a vehicle as [colour, front, back, half-width] along its length (1 = its front, -1 = its back) */
function parts(k, col) {
  const c = CAR_COLS[col % CAR_COLS.length];
  switch (k) {
    case 'taxi': return [['rgb(236,196,40)', 1, -1, 1], ['rgba(20,24,30,0.75)', 0.45, 0.15, 0.8], ['rgb(250,250,240)', 0.05, -0.1, 0.4]];
    case 'police': return [['rgb(240,240,240)', 1, -1, 1], ['rgb(30,60,160)', 0.25, -0.35, 1], ['rgba(20,24,30,0.75)', 0.45, 0.2, 0.8], ['rgb(60,120,255)', 0.1, 0, 0.6]];
    case 'amb': return [['rgb(244,244,236)', 1, -1, 1], ['rgb(230,196,40)', -0.2, -0.6, 1], ['rgb(210,40,40)', 0.1, -0.05, 0.9]];
    case 'van': return [[c === CAR_COLS[4] ? 'rgb(236,236,232)' : c, 1, -1, 1], ['rgba(20,24,30,0.75)', 0.72, 0.55, 0.85]];
    case 'box': return [[CAB[col % CAB.length], 1, 0.55, 0.95], ['rgb(236,236,232)', 0.5, -1, 1]];
    case 'artic': return [[CAB[col % CAB.length], 1, 0.72, 0.9], [TRAILER[col % TRAILER.length], 0.66, -1, 1]];
    case 'tanker': return [[CAB[(col + 2) % CAB.length], 1, 0.72, 0.9], ['rgb(206,210,214)', 0.66, -1, 0.85], ['rgba(255,255,255,0.5)', 0.6, -0.95, 0.25]];
    case 'bus': return [['rgb(206,58,46)', 1, -1, 1], ['rgba(250,250,245,0.55)', 0.85, -0.85, 0.35]];
    case 'coach': return [['rgb(240,240,236)', 1, -1, 1], ['rgb(40,90,150)', 0.2, -0.9, 0.95], ['rgba(20,24,30,0.7)', 0.95, 0.85, 0.9]];
    case 'shuttle': return [['rgb(240,240,236)', 1, -1, 1], ['rgb(80,160,200)', 0.1, -0.6, 1], ['rgba(20,24,30,0.7)', 0.85, 0.6, 0.85]];
    case 'cater': return [['rgb(240,240,236)', 1, 0.6, 0.9], ['rgb(236,190,40)', 0.55, -1, 1]];
    default: return [[c, 1, -1, 1], ['rgba(20,24,30,0.72)', 0.5, 0.18, 0.82], ['rgba(20,24,30,0.55)', -0.55, -0.75, 0.8]];
  }
}
/* draw a list of vehicles {x, y, h, k, col}; m: at least this many world units long (so they stay visible) */
function vehicles(list, px, night, now, m, detail) {
  const calm = cam.z < 10;
  const groups = new Map();
  const quad = (col, x, y, c, s, f, b, w) => { let L = groups.get(col); if (!L) groups.set(col, L = []); L.push(x, y, c, s, f, b, w); };
  const lights = [], tails = [], blues = [], shade = [];
  for (const v of list) {
    const K = IC.VEHICLE_KINDS[v.k] || IC.VEHICLE_KINDS.car, f = Math.max(1, m / 0.045), L = K.L * f / 2, W = Math.max(K.W / 2, px * K.W / 0.019);
    const c = Math.cos(v.h), s = Math.sin(v.h);
    if (!night) shade.push(v.x + L * 0.25, v.y + L * 0.3, c, s, L, W);
    // further out a calm palette: pale cars, buff lorries, red buses; colours and details close in
    const P = detail ? parts(v.k, v.col) : calm ? [[v.k === 'bus' ? 'rgb(206,58,46)' : K.L > 0.07 ? 'rgb(214,204,180)' : 'rgb(234,236,240)', 1, -1, 1]] : [parts(v.k, v.col)[0]];
    for (const [col, fr, bk, hw] of P) quad(col, v.x, v.y, c, s, fr * L, bk * L, hw * W);
    if (night) { lights.push(v.x + c * L, v.y + s * L, c, s, W); tails.push(v.x - c * L, v.y - s * L, W); }
    if ((v.k === 'police' || v.k === 'amb') && Math.sin(now * 12 + v.col) > 0) blues.push(v.x, v.y, W);
  }
  const fillQ = (L, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < L.length; i += 7) {
      const x = L[i], y = L[i + 1], c = L[i + 2], s = L[i + 3], fr = L[i + 4], bk = L[i + 5], w = L[i + 6], wx = -s * w, wy = c * w;
      ctx.moveTo(x + c * fr - wx, y + s * fr - wy); ctx.lineTo(x + c * fr + wx, y + s * fr + wy); ctx.lineTo(x + c * bk + wx, y + s * bk + wy); ctx.lineTo(x + c * bk - wx, y + s * bk - wy); ctx.closePath();
    }
    ctx.fill();
  };
  if (shade.length) { const S2 = []; for (let i = 0; i < shade.length; i += 6) S2.push(shade[i], shade[i + 1], shade[i + 2], shade[i + 3], shade[i + 4], -shade[i + 4], shade[i + 5]); fillQ(S2, 'rgba(0,0,0,0.28)'); }
  for (const [col, L] of groups) fillQ(L, night ? col.replace(/rgb\((\d+),(\d+),(\d+)\)/, (q, r, g2, b) => `rgb(${r * 0.35 | 0},${g2 * 0.35 | 0},${b * 0.4 | 0})`) : col);
  if (night) {
    ctx.globalCompositeOperation = 'lighter';
    // headlights: close in, a short beam of light on the road ahead
    const beams = detail && cam.z > 30;
    if (beams) { ctx.fillStyle = 'rgba(255,232,180,0.2)'; ctx.beginPath(); } else ctx.beginPath();
    if (beams) { for (let i = 0; i < lights.length; i += 5) { const x = lights[i], y = lights[i + 1], c = lights[i + 2], s = lights[i + 3], w = lights[i + 4] * 1.4, l = w * 6; ctx.moveTo(x - s * w, y + c * w); ctx.lineTo(x + c * l - s * w * 2.2, y + s * l + c * w * 2.2); ctx.lineTo(x + c * l + s * w * 2.2, y + s * l - c * w * 2.2); ctx.lineTo(x + s * w, y - c * w); ctx.closePath(); } ctx.fill(); }
    ctx.fillStyle = 'rgba(255,244,210,0.95)'; ctx.beginPath();
    for (let i = 0; i < lights.length; i += 5) { const r = detail ? Math.max(lights[i + 4] * 0.7, 0.8 * px) : 1.1 * px; ctx.moveTo(lights[i] + r, lights[i + 1]); ctx.arc(lights[i], lights[i + 1], r, 0, 7); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,40,30,0.85)'; ctx.beginPath();
    for (let i = 0; i < tails.length; i += 3) { const r = detail ? Math.max(tails[i + 2] * 0.6, 0.6 * px) : 0.8 * px; ctx.moveTo(tails[i] + r, tails[i + 1]); ctx.arc(tails[i], tails[i + 1], r, 0, 7); }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (blues.length) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = night ? 'rgba(80,140,255,0.8)' : 'rgba(80,140,255,0.55)'; ctx.beginPath();
    for (let i = 0; i < blues.length; i += 3) { const r = Math.max(blues[i + 2] * (night ? 5 : 2), 2 * px); ctx.moveTo(blues[i] + r, blues[i + 1]); ctx.arc(blues[i], blues[i + 1], r, 0, 7); }
    ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  }
}
let lastT = null;
IC.drawTraffic = function (g, S, px, v, light, now) {
  ctx = g; view = v;
  const z = cam.z, night = light < 0.35;
  const dtg = lastT == null || S.time < lastT || S.time - lastT > 120 ? 0 : S.time - lastT; lastT = S.time;
  if (z < 1.3) {
    // moving dashes along the roads; brighter and longer where the road is full, warm streaks at night
    const classes = z < 0.3 ? { hw: 1 } : z < 0.6 ? { hw: 1, rd: 1, ring: 1 } : { hw: 1, rd: 1, ring: 1, art: 1, lc: 1 };
    ctx.lineCap = 'butt';
    IC.trafficFlows(S, view, classes, (l, load, ph, cls) => {
      const a = (0.35 + 0.65 * Math.min(1, load)) * (night ? 0.9 : 0.8) * (cls === 'hw' ? 1 : 0.75);
      ctx.strokeStyle = night ? `rgba(255,220,160,${a})` : load > 0.95 ? `rgba(255,200,120,${a})` : `rgba(255,252,240,${a})`;
      ctx.lineWidth = (cls === 'hw' ? 1.6 : 1.1) * px;
      // dashes close up as the road fills; they crawl along with the traffic
      const gapPx = 18 - Math.min(1, load) * 12;
      ctx.setLineDash([3 * px, gapPx * px]); ctx.lineDashOffset = -ph;
      ctx.beginPath(); const P = l.pts; ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
  } else {
    // real size is 4.5 m for a car, 16 m for an articulated lorry; never smaller than a couple of pixels
    const m = Math.max(0.045, 4.4 * px), list = [];
    // the lane offset scaled to the road as drawn (wider than real far out)
    const wk = k => IC.roadWidth(k, z) / (IC.ROAD_SPEC[k] || IC.ROAD_SPEC.lc).w;
    if (z < AGZ) {
      IC.trafficVisible(S, view, Math.max(0.3, 7 * px), (x, y, h, k, cls, off) => { const o = off * wk(cls), c = Math.cos(h), n = Math.sin(h); list.push({ x: x - n * o, y: y + c * o, h, k, col: (x * 7 + y * 13) & 1023 }); }, z < 2.5 ? { st: 1, ln: 1 } : null);
    } else {
      // drawn bigger than life they would crowd the road: show only as many as fit at the size drawn
      const thin = Math.max(1, Math.ceil(m / 0.045 / 2.5));
      for (const a of IC.trafficAgents(S, view, dtg)) { if (a.id % thin) continue; const p = IC.agentPos(a); if (inView(p.x, p.y, 1)) list.push({ x: p.x, y: p.y, h: p.h, k: a.k, col: a.col }); }
    }
    // buses and coaches on their lines
    for (const b of S.buses) {
      const p = IC.busPos(b); if (!inView(p.x, p.y, 2)) continue;
      const lk = b.line.path[0][0], o = (IC.TRAFFIC_CLS.st.off[0]) * (z < AGZ ? wk('art') : 1);
      list.push({ x: p.x - Math.sin(p.h) * o, y: p.y + Math.cos(p.h) * o, h: p.h, k: b.kind, col: 0 });
      void lk;
    }
    // at a roundabout the routes run through its middle: whoever is inside the ring drives round it (anticlockwise,
    // as seen from above, for right-hand traffic)
    const RJ = z > 3 && IC.roadJoins(S.world);
    if (RJ) for (const j of RJ.rbs) {
      if (!inView(j.x, j.y, 1)) continue;
      const G = IC.rbGeom(j, k => IC.roadWidth(k, z) / 2), rr = G.r + G.cw * 0.2;
      for (const v of list) {
        const dx = v.x - G.C.x, dy = v.y - G.C.y, d = Math.hypot(dx, dy); if (d > G.Ro) continue;
        const a = d > 1e-6 ? Math.atan2(dy, dx) : v.h;
        v.x = G.C.x + Math.cos(a) * rr; v.y = G.C.y + Math.sin(a) * rr; v.h = a - Math.PI / 2;
      }
    }
    vehicles(list, px, night, now, m, z > 18);
  }
  // trains: real length is about 25 m a carriage
  const tl = Math.max(0.25, 5 * px);
  for (const t of S.trains) {
    for (let k = 0; k < t.cars; k++) {
      const p = IC.trainPos({ r: t.r, s: t.s - t.dir * k * tl * 1.1 });
      if (!inView(p.x, p.y, 10)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h);
      const tw = Math.max(0.032, 2 * px);   // a carriage is about 3 m wide
      ctx.fillStyle = night ? (k === 0 ? 'rgba(255,230,170,0.95)' : 'rgba(255,210,140,0.55)') : k === 0 ? 'rgba(210,90,60,0.95)' : 'rgba(120,110,100,0.95)'; ctx.fillRect(-tl / 2 + tl * 0.02, -tw / 2, tl * 0.96, tw);
      ctx.restore();
    }
  }
};

})(window.IC);
