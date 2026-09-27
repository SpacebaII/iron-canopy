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
    for (const e of W.edges) if ((e.a === c.id || e.b === c.id) && e.cls !== 'sp') along({ pts: e.pts.filter(p => U.dist(p, c) < c.r * 1.3), bb: e.bb }, IC.ROAD_W[e.cls] * 0.55, sp);
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
  const groups = { sp: [], lc: [], rd: [], ramp: [], hw: [] };
  for (const e of W.edges) if (vis(e)) groups[e.cls].push(e);
  for (const r of W.ramps || []) if (vis(r)) groups.ramp.push(r);
  // only the stretches in view go into the path
  const path = list => {
    ctx.beginPath();
    for (const l of list) {
      const P = l.pts; let on = false;
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
  const order = ['sp', 'lc', 'rd', 'ramp', 'hw'];
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

IC.drawRoadBridges = function (g, S, px, v) {
  ctx = g; view = v;
  if (cam.z < 0.2) return;
  for (const b of S.infra) {
    if (b.kind !== 'bridge' || !inView(b.x, b.y, 30)) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    const w = Math.max(IC.roadWidth(b.cls, cam.z) * 1.3, b.cls === 'hw' ? 0.6 : 0.3);
    if (b.offline) {
      ctx.fillStyle = 'rgba(40,36,30,0.95)'; ctx.fillRect(-6, -w / 2, 4, w); ctx.fillRect(2, -w / 2, 4, w);
      ctx.strokeStyle = C.hostile; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(-2, -w); ctx.lineTo(2, w); ctx.moveTo(2, -w); ctx.lineTo(-2, w); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(220,210,190,0.95)'; ctx.fillRect(-6, -w / 2, 12, w);
      ctx.strokeStyle = 'rgba(40,36,30,0.9)'; ctx.lineWidth = Math.min(0.5, w * 0.15); ctx.strokeRect(-6, -w / 2, 12, w);
    }
    ctx.restore();
    if (b.offline && cam.z > 0.4) label('BRIDGE DOWN', b.x, b.y - 10 * px, px, C.hostile, 8.5, 'center', 700);
  }
};
/* traffic: far out, the flow along each road; close in, the vehicles themselves (headlights at night) */
IC.drawTraffic = function (g, S, px, v, light, now) {
  ctx = g; view = v;
  const z = cam.z, night = light < 0.35;
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
    // real size is 4.5 m for a car, 16 m for a lorry; never smaller than a couple of pixels
    const s = Math.max(0.045, 2.2 * px), gap = Math.max(0.3, 7 * px), side = k => Math.max(IC.roadWidth(k, z) * 0.24, 0);
    const cars = [], lorries = [];
    IC.trafficVisible(S, view, gap, (x, y, h, lorry, k) => { const o = side(k), c = Math.cos(h), n = Math.sin(h); (lorry ? lorries : cars).push(x - n * o, y + c * o, c, n); }, z < 2.5 ? { st: 1, ln: 1 } : null);
    const quad = (list, L, Wd, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i < list.length; i += 4) {
        const x = list[i], y = list[i + 1], c = list[i + 2], n = list[i + 3], lx = c * L, ly = n * L, wx = -n * Wd, wy = c * Wd;
        ctx.moveTo(x - lx - wx, y - ly - wy); ctx.lineTo(x + lx - wx, y + ly - wy); ctx.lineTo(x + lx + wx, y + ly + wy); ctx.lineTo(x - lx + wx, y - ly + wy); ctx.closePath();
      }
      ctx.fill();
    };
    if (night) {
      ctx.globalCompositeOperation = 'lighter';
      const hl = (list, L) => { ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { const x = list[i] + list[i + 2] * L, y = list[i + 1] + list[i + 3] * L; ctx.moveTo(x + s * 0.9, y); ctx.arc(x, y, s * 0.9, 0, 7); } ctx.fill(); };
      const tl = (list, L) => { ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { const x = list[i] - list[i + 2] * L, y = list[i + 1] - list[i + 3] * L; ctx.moveTo(x + s * 0.5, y); ctx.arc(x, y, s * 0.5, 0, 7); } ctx.fill(); };
      ctx.fillStyle = 'rgba(255,236,190,0.85)'; hl(cars, s); hl(lorries, s * 2.4);
      ctx.fillStyle = 'rgba(255,60,40,0.7)'; tl(cars, s); tl(lorries, s * 2.4);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      if (z > 8) { quad(cars, s, s * 0.45, 'rgba(0,0,0,0.3)'); for (let i = 0; i < cars.length; i += 4) { cars[i] -= s * 0.3; cars[i + 1] -= s * 0.3; } }
      quad(cars, s, s * 0.45, 'rgba(232,234,238,0.95)');
      quad(lorries, s * 2.4, s * 0.55, 'rgba(210,200,176,0.95)');
    }
    // buses and coaches: longer, in the national red
    const bs = [];
    for (const b of S.buses) { const p = IC.busPos(b); if (!inView(p.x, p.y, 2)) continue; const h = p.h + (b.dir < 0 ? Math.PI : 0), c = Math.cos(h), n = Math.sin(h), o = side(b.coach ? 'rd' : 'art'); bs.push(p.x - n * o, p.y + c * o, c, n); }
    if (night) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,236,190,0.8)'; ctx.beginPath(); for (let i = 0; i < bs.length; i += 4) { const x = bs[i] + bs[i + 2] * s * 3, y = bs[i + 1] + bs[i + 3] * s * 3; ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, 7); } ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    quad(bs, s * 2.2, s * 0.5, night ? 'rgba(120,50,40,0.9)' : 'rgba(214,72,52,0.95)');
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
