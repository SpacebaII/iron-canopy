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
    for (const l of c.streets) if (l.cls !== 'st' || cam.z > 24) along(l, IC.ROAD_W[l.cls] * 0.55, sp);   // side streets only close in
    // the national roads through town are its avenues; the bypass is lit round it
    for (const e of W.edges) if (e.city === c.id || e.bypass === c.id) along(e, IC.ROAD_W[e.city ? 'art' : e.cls] * 0.55, sp);
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

/* roads close in: drawn live, at real width once that is wider than a few pixels. Far out a clean hierarchy by width
   and colour; close in asphalt with verges, lane markings, crash barriers, slip roads, bridges and roundabouts */
const ROAD = {
  // real width (world units), smallest on screen (px), fill colour
  hw: [0.42, 4.6, [238, 176, 104]], ring: [0.36, 3.6, [232, 190, 130]], rd: [0.2, 3.2, [214, 198, 158]], art: [0.4, 2.2, [178, 174, 164]],
  lc: [0.13, 2.2, [198, 186, 154]], sp: [0.11, 1.9, [198, 186, 154]], st: [0.34, 1.4, [148, 146, 140]], ln: [0.07, 1.1, [160, 140, 100]],
  ramp: [0.1, 1.8, [230, 184, 124]]
};
IC.roadWidth = (k, z) => Math.max(ROAD[k][0], ROAD[k][1] / z * (1 - U.clamp((z - 3) / 6, 0, 1) * 0.6));
const ASPHALT = [72, 73, 74];
IC.drawRoads = function (g, S, px, v) {
  ctx = g; view = v;
  const W = S.world, z = cam.z, t = U.clamp((z - 3) / 6, 0, 1), m = 5;
  const vis = l => (l.bb || bbox(l)) && l.bb[2] > view.x0 - m && l.bb[0] < view.x1 + m && l.bb[3] > view.y0 - m && l.bb[1] < view.y1 + m;
  const groups = { sp: [], lc: [], rd: [], art: [], ring: [], ramp: [], hw: [] };
  // a national road inside a city is drawn as the avenue it has become
  for (const e of W.edges) if (vis(e)) groups[e.city ? e.ccls || 'art' : e.cls].push(e);
  for (const r of W.ramps || []) if (vis(r)) groups.ramp.push(r);
  // only the stretches in view go into the path
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
  const width = k => IC.roadWidth(k, z);
  const fill = k => { const c = ROAD[k][2]; return `rgb(${c[0] + (ASPHALT[0] - c[0]) * t | 0},${c[1] + (ASPHALT[1] - c[1]) * t | 0},${c[2] + (ASPHALT[2] - c[2]) * t | 0})`; };
  const stroke = (k, w, col, dash) => { if (!groups[k].length) return; path(groups[k]); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.stroke(); if (dash) ctx.setLineDash([]); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const order = ['sp', 'lc', 'art', 'rd', 'ring', 'ramp', 'hw'];
  // verges: mown grass either side, then a dark edge far out or the kerb close in
  if (z > 2.5) for (const k of order) stroke(k, width(k) + (k === 'hw' ? 0.6 : 0.24), `rgba(132,150,98,${0.6 * t + 0.25})`);
  for (const k of order) stroke(k, width(k) * (1.45 - t * 0.35) + px * 0.8, 'rgba(22,20,16,0.55)');
  for (const k of order) {
    if (k === 'hw' && z > 5) stroke(k, width(k) * 1.1, 'rgb(170,170,164)');   // crash barriers along the outer edge
    stroke(k, width(k) * (k === 'hw' && z > 5 ? 1.04 : 1), fill(k));
  }
  const J = W.junctions || [];
  for (const j of J) if (j.kind === 'rb' && inView(j.x, j.y, 2)) roundabout(j, width, fill);
  if (z > 4) for (const j of J) if (j.kind === 'tj' && inView(j.x, j.y, 2)) kerbs(j, width, fill);
  if (z > 5) {
    // motorways: two carriageways of two lanes, edge lines, a central reservation with a barrier
    const w = width('hw'), asp = fill('hw');
    stroke('hw', w * 0.95, 'rgba(236,236,228,0.8)'); stroke('hw', w * 0.91, asp);
    stroke('hw', w * 0.55, 'rgba(236,236,228,0.8)', [0.09, 0.14]); stroke('hw', w * 0.51, asp);
    stroke('hw', w * 0.14, 'rgba(236,236,228,0.8)'); stroke('hw', w * 0.1, 'rgb(112,122,92)'); stroke('hw', w * 0.02, 'rgb(186,186,180)');
    const wr = width('ramp'); stroke('ramp', wr * 0.9, 'rgba(236,236,228,0.7)'); stroke('ramp', wr * 0.8, fill('ramp'));
    stroke('rd', width('rd') * 0.92, 'rgba(236,236,228,0.55)'); stroke('rd', width('rd') * 0.86, fill('rd'));
    stroke('rd', 0.012, 'rgba(235,235,225,0.7)', [0.08, 0.1]);
  }
  // bridges at interchanges: the road that crosses over, with its shadow and parapets
  for (const j of J) if (j.over && inView(j.x, j.y, 3)) overpass(j, width, fill, px);
  if (z > 2) for (const x of W.railX || []) if (inView(x.x, x.y, 2)) overpass({ x: x.x, y: x.y, over: [x.a], dirs: [{ a: x.a, x: Math.cos(x.a), y: Math.sin(x.a), cls: x.cls }] }, width, fill, px, 0.25);
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
/* a roundabout: a ring of road round a grass island; the roads coming in stop at the ring */
function roundabout(j, width, fill) {
  const w = Math.max(...j.dirs.map(d => width(d.cls))), r = Math.max(j.r, w * 1.1);
  ctx.fillStyle = fill(j.dirs.some(d => d.cls === 'hw') ? 'hw' : 'rd'); ctx.beginPath(); ctx.arc(j.x, j.y, r + w * 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgb(104,128,80)'; ctx.beginPath(); ctx.arc(j.x, j.y, Math.max(r - w * 0.5, w * 0.3), 0, 7); ctx.fill();
  if (cam.z > 5) { ctx.strokeStyle = 'rgba(236,236,228,0.6)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.arc(j.x, j.y, r - w * 0.5 + 0.02, 0, 7); ctx.stroke(); }
}
/* curved kerbs where lesser roads meet: the corner between two roads is paved round a curve */
function kerbs(j, width, fill) {
  const D = j.dirs;
  for (let i = 0; i < D.length; i++) {
    const a = D[i], b = D[(i + 1) % D.length], gap = U.mod(b.a - a.a, Math.PI * 2);
    if (gap > 2.6 || gap < 0.3) continue;
    const wa = width(a.cls) / 2, wb = width(b.cls) / 2, k = Math.min(wa, wb) * 1.6 + 0.08;
    const na = { x: -a.y, y: a.x }, nb = { x: b.y, y: -b.x };
    const pa = { x: j.x + a.x * (wb + k) + na.x * wa, y: j.y + a.y * (wb + k) + na.y * wa }, pb = { x: j.x + b.x * (wa + k) + nb.x * wb, y: j.y + b.y * (wa + k) + nb.y * wb };
    const c = { x: j.x + na.x * wa + nb.x * wb, y: j.y + na.y * wa + nb.y * wb };
    ctx.fillStyle = fill(a.cls === 'rd' || b.cls === 'rd' ? 'rd' : 'lc');
    ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(pa.x, pa.y); ctx.quadraticCurveTo(c.x, c.y, pb.x, pb.y); ctx.closePath(); ctx.fill();
  }
}
/* the road that crosses at an interchange rides a bridge over the motorway */
function overpass(j, width, fill, px, span) {
  ctx.lineCap = 'butt';
  for (const a of j.over) {
    const d = j.dirs.find(q => q.a === a); if (!d) continue;
    const w = width(d.cls), L = span || width('hw') * 0.9 + 0.2, x0 = j.x - d.x * L, y0 = j.y - d.y * L, x1 = j.x + d.x * L, y1 = j.y + d.y * L;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w * 1.35; ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, y0 + w * 0.35); ctx.lineTo(x1 + w * 0.3, y1 + w * 0.35); ctx.stroke();
    ctx.strokeStyle = 'rgb(176,174,166)'; ctx.lineWidth = w * 1.3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = fill(d.cls); ctx.lineWidth = w; ctx.stroke();
  }
  ctx.lineCap = 'round';
}

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
    const wk = k => IC.roadWidth(k === 'ramp' ? 'ramp' : k, z) / (IC.ROAD_W[k] || 0.1);
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
    vehicles(list, px, night, now, m, z > 18);
  }
  // trains: real length is about 25 m a carriage
  const tl = Math.max(0.25, 5 * px);
  for (const t of S.trains) {
    for (let k = 0; k < t.cars; k++) {
      const p = IC.trainPos({ r: t.r, s: t.s - t.dir * k * tl * 1.1 });
      if (!inView(p.x, p.y, 10)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h);
      ctx.fillStyle = night ? (k === 0 ? 'rgba(255,230,170,0.95)' : 'rgba(255,210,140,0.55)') : k === 0 ? 'rgba(210,90,60,0.95)' : 'rgba(120,110,100,0.95)'; ctx.fillRect(-tl / 2, -tl * 0.2, tl, tl * 0.4);
      ctx.restore();
    }
  }
};

})(window.IC);
