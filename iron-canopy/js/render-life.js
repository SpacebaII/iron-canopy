/* Iron Canopy — an airport's life on the 2D map (focus round 2). The turnarounds' vehicles and people at the stands,
   from the plan in aptlife.js (the 3D replay's too): stairs, ground power, belt loaders, baggage trains, cleaners,
   catering, the fuel truck or hydrant cart, buses at remote stands, lorries at cargo stands and the pushback tug, each
   driving in along the service lane, working, and driving out. Passengers at the kerb and cars and taxis on the
   landside roads, as many as the passengers an hour bring; aircraft lights at night; the turnaround clock on the
   stand of a selected or followed airliner. The renderer's alone: it never touches the simulation, and the loops
   make nothing per frame. render-airport.js calls these (IC.FOCUS.life). */
(function (IC) {
'use strict';
const U = IC.U;
const ramp = (x, a, b) => U.clamp((x - a) / (b - a), 0, 1);
const P = { x: 0, y: 0, h: 0, moving: false, work: 0 }, Q = { x: 0, y: 0, h: 0 };

/* vehicles from above, front along +x: length and width in world units, body colour, a second colour, the form */
const VEH = {
  tug:        { L: 0.062, W: 0.028, c: 'rgb(236,196,60)', c2: 'rgb(54,56,60)', k: 'cab' },
  gpu:        { L: 0.035, W: 0.018, c: 'rgb(120,150,110)', c2: 'rgb(54,56,60)', k: 'cab' },
  stairs:     { L: 0.075, W: 0.022, c: 'rgb(232,232,226)', c2: 'rgb(110,114,120)', k: 'stairs' },
  belt:       { L: 0.08, W: 0.02, c: 'rgb(222,190,60)', c2: 'rgb(40,42,46)', k: 'belt' },
  bagtractor: { L: 0.03, W: 0.017, c: 'rgb(70,110,160)', c2: 'rgb(40,42,46)', k: 'cab' },
  bagcart:    { L: 0.032, W: 0.017, c: 'rgb(150,154,158)', c2: null, k: 'bags' },
  clean:      { L: 0.05, W: 0.02, c: 'rgb(236,236,232)', c2: 'rgb(60,150,90)', k: 'van' },
  catering:   { L: 0.09, W: 0.026, c: 'rgb(240,240,236)', c2: 'rgb(60,90,160)', k: 'truck' },
  refueller:  { L: 0.115, W: 0.027, c: 'rgb(226,228,230)', c2: 'rgb(200,50,44)', k: 'tank' },
  dispenser:  { L: 0.05, W: 0.022, c: 'rgb(210,212,214)', c2: 'rgb(200,50,44)', k: 'van' },
  apbus:      { L: 0.14, W: 0.03, c: 'rgb(236,236,230)', c2: 'rgba(60,110,150,0.95)', k: 'bus' },
  lorry:      { L: 0.12, W: 0.026, c: 'rgb(210,120,50)', c2: 'rgb(90,90,90)', k: 'truck' }
};
IC.LIFE_VEH = VEH;
const BAGS = ['rgb(200,60,50)', 'rgb(40,44,60)', 'rgb(60,120,190)', 'rgb(230,180,40)', 'rgb(90,90,94)'];
const CLOTHES = ['rgb(230,226,214)', 'rgb(40,44,52)', 'rgb(170,50,50)', 'rgb(60,100,170)', 'rgb(200,160,60)', 'rgb(110,130,90)', 'rgb(150,90,140)'];
const CARS = ['rgb(200,202,206)', 'rgb(40,44,50)', 'rgb(150,30,36)', 'rgb(230,230,226)', 'rgb(60,80,120)', 'rgb(120,124,128)', 'rgb(180,160,120)'];

let LP = false;   // the lights' pass: after the airport's night falls, only the lights (render-airport.js draws twice)
/* one vehicle; minPx: a 5 m vehicle is drawn at least this many pixels long (all of them scaled alike, at most 3
   times their size), so the apron reads at the middle zoom */
function drawVeh(g, d, x, y, h, px, minPx, beacon, night, seed) {
  const k = U.clamp(minPx * px / 0.05, 1, 3), L = d.L * k, W = d.W * k, x0 = -L / 2, y0 = -W / 2;
  if (LP && !beacon) return;
  g.save(); g.translate(x, y); g.rotate(h);
  if (!LP) {
  // a shadow, and a dark rim so a white truck still reads against a white fuselage
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + W * 0.25, y0 + W * 0.3, L, W);
  const e = Math.max(W * 0.12, 0.7 * px); g.fillStyle = 'rgba(20,22,26,0.85)'; g.fillRect(x0 - e, y0 - e, L + 2 * e, W + 2 * e);
  switch (d.k) {
    case 'cab': g.fillStyle = d.c; g.fillRect(x0, y0, L, W); g.fillStyle = d.c2; g.fillRect(x0, y0 + W * 0.15, L * 0.35, W * 0.7); break;
    case 'stairs': g.fillStyle = d.c; g.fillRect(x0, y0, L, W); g.fillStyle = d.c2; for (let i = 0; i < 5; i++) g.fillRect(x0 + L * (0.45 + i * 0.1), y0 + W * 0.1, L * 0.04, W * 0.8); break;
    case 'belt': g.fillStyle = d.c2; g.fillRect(x0, y0, L, W); g.fillStyle = d.c; g.fillRect(x0, y0, L * 0.22, W); g.fillStyle = 'rgb(70,72,76)'; g.fillRect(x0 + L * 0.25, y0 + W * 0.25, L * 0.75, W * 0.5); break;
    case 'bags': g.fillStyle = d.c; g.fillRect(x0, y0, L, W); for (let i = 0; i < 3; i++) { g.fillStyle = BAGS[(seed + i * 3) % BAGS.length]; g.fillRect(x0 + L * (0.08 + i * 0.3), y0 + W * 0.15, L * 0.24, W * 0.7); } break;
    case 'van': g.fillStyle = d.c; g.fillRect(x0, y0, L, W); g.fillStyle = d.c2; g.fillRect(x0, y0 + W * 0.4, L, W * 0.2); g.fillStyle = 'rgba(40,50,60,0.8)'; g.fillRect(x0 + L * 0.78, y0 + W * 0.1, L * 0.1, W * 0.8); break;
    case 'truck': g.fillStyle = d.c2; g.fillRect(x0 + L * 0.78, y0, L * 0.22, W); g.fillStyle = d.c; g.fillRect(x0, y0, L * 0.76, W); break;
    case 'tank': g.fillStyle = d.c2; g.fillRect(x0 + L * 0.8, y0, L * 0.2, W); g.fillStyle = d.c; g.fillRect(x0, y0 + W * 0.05, L * 0.78, W * 0.9); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x0, y0 + W * 0.3, L * 0.78, W * 0.18); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0 + W * 0.7, L * 0.78, W * 0.25); break;
    case 'bus': g.fillStyle = d.c; g.fillRect(x0, y0, L, W); g.fillStyle = d.c2; g.fillRect(x0 + L * 0.05, y0 + W * 0.3, L * 0.9, W * 0.4); break;
    default: g.fillStyle = d.c; g.fillRect(x0, y0, L, W);
  }
  }
  // headlights at night while it drives; the amber beacon that every apron vehicle turns on while it moves
  if (beacon && night && LP) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,240,200,0.18)'; g.beginPath(); g.moveTo(L / 2, -W / 2); g.lineTo(L / 2 + L * 1.4, -W * 1.4); g.lineTo(L / 2 + L * 1.4, W * 1.4); g.lineTo(L / 2, W / 2); g.fill(); g.globalCompositeOperation = 'source-over'; }
  if (beacon && beacon > 0.5 && (LP || !night)) { g.fillStyle = night ? 'rgba(255,170,40,1)' : 'rgba(255,170,40,0.95)'; g.beginPath(); g.arc(0, 0, Math.max(W * 0.22, 0.9 * px), 0, 7); g.fill(); }
  g.restore();
}
IC.drawLifeVeh = drawVeh;

/* the turnarounds at airport ap now: their vehicles, and the passengers walking to and from the aircraft */
IC.drawTurns = function (g, S, ap, px, z, now, night, seen, lights) {
  const R = S.rec; if (!R) return 0;
  LP = !!lights;
  const T = S.time, minPx = 9, people = z > 22;
  let n = 0;
  for (const q of R.turns) {
    if (q.ap !== ap.id || q.t0 > T + 1 || (q.t1 != null && q.t1 < T - 900)) continue;
    if (seen && !seen(q.x, q.y, 3)) continue;
    if (!q._jobs || q._jt1 !== q.t1) { q._jobs = IC.turnJobs(q); q._jt1 = q.t1; }
    if (!q._paths) q._paths = IC.turnPaths(ap, q);
    const Pa = q._paths, D = Math.max(600, q.dur), tEnd = q.t0 + q.dur;
    // passengers: across the apron to the steps at a gate without a bridge, from the steps to the bus at a remote stand
    if (people && !LP && (q.kind === 'walk' || q.kind === 'bus') && q.t1 == null) {
      const off = T - q.t0 > 30 && T - q.t0 < D * 0.2, on = T > q.t0 + D * 0.62 && T < tEnd - 120;
      if (off || on) {
        const a = Pa.door, b = q.kind === 'bus' ? Pa.bus0.pts[Pa.bus0.pts.length - 1] : Pa.term, len = Math.max(0.05, U.dist(a, b)), N = q.kind === 'bus' ? 6 : 12;
        const r = Math.max(0.004, 1.6 * px);
        for (let i = 0; i < N; i++) {
          const f = ((T * 0.013 / len) + i / N + U.hash(i, q.t0 | 0) * 0.05) % 1, k = on ? f : 1 - f, wob = (U.hash(i, 7) - 0.5) * 0.02;
          g.fillStyle = CLOTHES[i % CLOTHES.length]; g.beginPath(); g.arc(b.x + (a.x - b.x) * k - Math.sin(q.a) * wob, b.y + (a.y - b.y) * k + Math.cos(q.a) * wob, r, 0, 7); g.fill();
        }
      }
    }
    for (const j of q._jobs) {
      if (!IC.turnVehAt(j, Pa[j.path], T, P)) continue;
      const d = VEH[j.key]; if (!d) continue;
      drawVeh(g, d, P.x, P.y, P.h, px, minPx, P.moving ? ((now * 1.6 + j.lag * 0.3) % 1 < 0.5 ? 1 : 0.4) : 0, night, (q.t0 | 0) + j.lag);
      n++;
      // the hose from the hydrant cart or the fuel truck up to the wing while it pumps
      if ((j.key === 'refueller' || j.key === 'dispenser') && !P.moving && z > 30 && !LP) { g.strokeStyle = 'rgba(20,20,20,0.8)'; g.lineWidth = Math.max(0.003, 0.8 * px); g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(P.x - Math.sin(q.a) * 0.03, P.y + Math.cos(q.a) * 0.03); g.stroke(); }
    }
  }
  return n;
};

/* (round 5b) the airport's own vehicles that are free now, parked in rows on a small depot pad beside the fuel farm
   (or the fire station): what Ground vehicles says it owns, less what is out on a job */
IC.gseDepotAt = function (ap) {
  const p = ap.parts.find(q => q.kind === 'fuel' && q.built) || ap.parts.find(q => q.kind === 'fire' && q.built);
  if (!p) return null;
  const a = p.a != null ? p.a : ap.rwyA || 0, off = (p.h || 1) / 2 + 0.3;
  return { x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off, a };
};
IC.drawFleetDepot = function (g, S, ap, px, z, night) {
  if (!ap.fleet || !IC.FOCUS.gse) return;
  const D = IC.gseDepotAt(ap); if (!D) return;
  const rows = [['tug', 'tug'], ['bus', 'apbus'], ['fuel', 'refueller']].map(([k, v]) => [Math.min(12, IC.gseFree(S, ap, k)), VEH[v]]);
  const W = 0.62, H = 0.4;
  g.save(); g.translate(D.x, D.y); g.rotate(D.a);
  g.fillStyle = 'rgba(92,94,98,0.9)'; g.fillRect(-W / 2, -H / 2, W, H);
  g.strokeStyle = 'rgba(235,235,230,0.5)'; g.lineWidth = Math.max(0.002, 0.6 * px);
  rows.forEach(([n, d], r) => {
    const y = -H / 2 + 0.03 + r * 0.125;
    for (let i = 0; i < 12; i++) g.strokeRect(-W / 2 + 0.02 + i * 0.048, y, 0.044, 0.11);
    g.restore(); g.save(); g.translate(D.x, D.y); g.rotate(D.a);
    for (let i = 0; i < n; i++) drawVeh(g, d, -W / 2 + 0.042 + i * 0.048, y + 0.055, Math.PI / 2, px, 3, 0, night, i);
  });
  g.restore();
};
/* a jet bridge's reach for stand s now: 1 at the door, 0 folded back (the aircraft has not come, or is about to go) */
IC.bridgeReach = function (S, s) {
  const sv = s.svc;
  if (!s.occ || !sv || sv.tail !== s.occ || sv.kind !== 'bridge') return 0;
  const T = S.time, tEnd = sv.t0 + sv.dur;
  return ramp(T - sv.t0, 25, 85) * (1 - ramp(T, tEnd - 170, tEnd - 100));
};

/* ---------- the landside: cars and taxis on the roads, passengers at the kerb ---------- */
function roadOf(r) {
  if (r._cum) return r._cum;
  const c = [0]; for (let i = 1; i < r.pts.length; i++) c.push(c[i - 1] + U.dist(r.pts[i - 1], r.pts[i]));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  r._bb = { x0, y0, x1, y1 };
  return (r._cum = c);
}
function at(r, cum, s, out) {
  let i = 1; while (i < r.pts.length - 1 && cum[i] < s) i++;
  const a = r.pts[i - 1], b = r.pts[i], seg = cum[i] - cum[i - 1] || 1e-6, k = U.clamp((s - cum[i - 1]) / seg, 0, 1);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.h = Math.atan2(b.y - a.y, b.x - a.x);
  return out;
}
/* how busy the landside is: passengers an hour through the airport, 0 → about 1.5 */
IC.landBusy = ap => U.clamp((ap.paxRate || 0) / 700, 0, 1.5);
IC.drawLandLife = function (g, S, ap, px, z, night, LT, lights) {
  if (lights && !night) return 0;
  const L = ap.land; if (!L || !L.roads) return 0;
  const V = IC.rs && IC.rs.view, busy = IC.landBusy(ap), open = ap.parts.some(p => p.kind === 'terminal' && p.built);
  if (!open) return 0;
  let n = 0;
  for (const r of L.roads) {
    if ((r.lv || 0) < 0 || r.pts.length < 2) continue;
    const cum = roadOf(r), LL = cum[cum.length - 1], B = r._bb;
    if (V && (B.x1 < V.x0 - 0.5 || B.x0 > V.x1 + 0.5 || B.y1 < V.y0 - 0.5 || B.y0 > V.y1 + 0.5)) continue;
    // the terminal's side of a kerb road (where cars pull in and people stand)
    if (r.kerb && r._sd == null) { const t = ap.parts.find(p => p.id === r.by), a = r.pts[0], b = r.pts[r.pts.length - 1], l = U.dist(a, b) || 1; r._sd = t ? (Math.sign((t.x - a.x) * -(b.y - a.y) / l + (t.y - a.y) * (b.x - a.x) / l) || 1) : 1; }
    const lanes = r.lanes || (r.w > 0.2 ? 3 : 2), lw = r.w / lanes;
    const N = Math.min(80, Math.round(LL * (0.25 + 2.2 * busy) * lanes / 2));
    for (let i = 0; i < N; i++) {
      const h1 = U.hash(i, 11 + (r.pts[0].x * 10 | 0)), h2 = U.hash(i, 29), v = 0.11 + 0.05 * h2;
      const dir = r.oneway ? r.oneway : (i % 2 ? 1 : -1);
      let s, stop = false;
      // on the kerb road half the cars pull in, stand while their passengers get out, and go on
      if (r.kerb && h1 < 0.5) {
        const dwell = 30 + 60 * h2, sStop = 0.15 + (LL - 0.3) * U.hash(i, 3), per = LL / v + dwell, u = (LT + h1 * per * 7) % per;
        if (u < sStop / v) s = u * v; else if (u < sStop / v + dwell) { s = sStop; stop = true; } else s = (u - dwell) * v;
      } else s = (LT * v + h1 * LL) % LL;
      if (dir < 0) s = LL - s;
      at(r, cum, s, Q);
      // right-hand traffic: the lane to the right of the way it goes; one-way roads spread over their lanes
      const lane = r.oneway ? (stop ? (lanes - 1) : i % Math.max(1, lanes - (r.kerb ? 1 : 0))) : 0;
      let o = r.oneway ? -r.w / 2 + lw * (lane + 0.5) : lw * 0.5 * dir;
      if (r.kerb && stop) o = (r.w / 2 - lw / 2) * r._sd;
      const hd = Q.h + (dir < 0 ? Math.PI : 0), x = Q.x - Math.sin(Q.h) * o, y = Q.y + Math.cos(Q.h) * o;
      const taxi = U.hash(i, 5) < 0.22, bus = !r.kerb && U.hash(i, 41) > 0.95;
      const len = bus ? 0.12 : 0.045, wd = bus ? 0.026 : 0.019, k = U.clamp(8 * px / 0.045, 1, 3);
      g.save(); g.translate(x, y); g.rotate(hd);
      if (!lights) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-len * k / 2 + 0.004, -wd * k / 2 + 0.004, len * k, wd * k);
        g.fillStyle = bus ? 'rgb(236,236,230)' : taxi ? 'rgb(236,196,50)' : CARS[(h2 * CARS.length) | 0]; g.fillRect(-len * k / 2, -wd * k / 2, len * k, wd * k);
        g.fillStyle = 'rgba(30,40,50,0.6)'; g.fillRect(len * k * 0.05, -wd * k * 0.4, len * k * 0.18, wd * k * 0.8);
      } else {
        g.globalCompositeOperation = 'lighter';
        if (!stop) { g.fillStyle = 'rgba(255,240,200,0.22)'; g.beginPath(); g.moveTo(len * k / 2, -wd * k / 2); g.lineTo(len * k * 2.2, -wd * k * 1.5); g.lineTo(len * k * 2.2, wd * k * 1.5); g.lineTo(len * k / 2, wd * k / 2); g.fill(); }
        g.fillStyle = 'rgba(255,40,30,0.9)'; g.fillRect(-len * k / 2 - 0.002, -wd * k / 2, 0.004, wd * k);
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
      n++;
    }
    // passengers at the kerb: waiting with their bags, walking in through the doors
    if (r.kerb && z > 28 && !lights) {
      const M = Math.round(U.clamp(3 + (ap.paxRate || 0) / 10, 3, 160)), rr = Math.max(0.004, 1.6 * px);
      for (let i = 0; i < M; i++) {
        const s = 0.1 + (LL - 0.2) * U.hash(i, 13), walk = U.hash(i, 17) < 0.45;
        let o = r.w / 2 + 0.01 + 0.035 * U.hash(i, 19);
        if (walk) o = r.w / 2 + 0.005 + ((LT * 0.013 + U.hash(i, 23)) % 1) * 0.07;
        at(r, cum, s, Q);
        const x = Q.x - Math.sin(Q.h) * o * r._sd, y = Q.y + Math.cos(Q.h) * o * r._sd;
        g.fillStyle = CLOTHES[i % CLOTHES.length]; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
        if (!walk && i % 3 === 0 && z > 60) { g.fillStyle = BAGS[i % BAGS.length]; g.fillRect(x + rr, y - rr * 0.5, rr * 1.2, rr); }
      }
      n += M;
    }
  }
  return n;
};

/* ---------- lights on aircraft at night ---------- */
/* red and green on the wingtips, white strobes, the red beacon; landing and taxi lights ahead while it moves */
const LC = [];
function lightCols(k) {
  const i = Math.round(U.clamp(k, 0, 1) * 20);
  return LC[i] || (LC[i] = { cone: `rgba(255,244,214,${0.16 * i / 20})`, red: `rgba(255,50,40,${0.95 * i / 20})`, green: `rgba(60,255,120,${0.95 * i / 20})`, white: `rgba(255,255,255,${i / 20})`, bcn: `rgba(255,60,40,${i / 20})` });
}
IC.drawAcLights = function (g, m, px, z, now, k) {
  const T = m.T || IC.ACTYPES[m.type]; if (!T) return;
  const C = lightCols(k);
  const ch = Math.cos(m.h), sh = Math.sin(m.h), sp = Math.max(T.span / 2, 4 * px), r = Math.max(0.008, 1.1 * px);
  const lx = m.x + sh * sp, ly = m.y - ch * sp, rx = m.x - sh * sp, ry = m.y + ch * sp;
  g.globalCompositeOperation = 'lighter';
  if (m.spd > 0.002 || m.phase === 'final' || m.phase === 'roll' || m.phase === 'land' || m.phase === 'rollout') {
    const far = m.phase === 'final' || m.phase === 'roll' || m.phase === 'land' ? 1.2 : 0.5, nx = m.x + ch * T.len * 0.5, ny = m.y + sh * T.len * 0.5;
    g.fillStyle = C.cone; g.beginPath(); g.moveTo(nx, ny);
    g.lineTo(nx + ch * far - sh * far * 0.3, ny + sh * far + ch * far * 0.3); g.lineTo(nx + ch * far + sh * far * 0.3, ny + sh * far - ch * far * 0.3); g.closePath(); g.fill();
  }
  g.fillStyle = C.red; g.beginPath(); g.arc(lx, ly, r, 0, 7); g.fill();
  g.fillStyle = C.green; g.beginPath(); g.arc(rx, ry, r, 0, 7); g.fill();
  const ph = (now * 1.1 + (m.born || 0) * 0.37) % 1;
  if (ph < 0.06) { g.fillStyle = C.white; g.beginPath(); g.arc(lx, ly, r * 1.8, 0, 7); g.arc(rx, ry, r * 1.8, 0, 7); g.fill(); }
  if ((ph + 0.5) % 1 < 0.12) { g.fillStyle = C.bcn; g.beginPath(); g.arc(m.x, m.y, r * 1.4, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
};

/* ---------- sound: what the drawing sees, heard (audio.js) ---------- */
const SND = { level: 0, spooled: new WeakSet(), annT: 0, annT0: 0 };
/* one airport on screen this frame: its traffic in view adds to the engines' bed; a take-off roll spools up */
IC.lifeSoundAp = function (S, ap, z, seen) {
  if (!IC.sfx || !IC.sfx.on || S.paused || z < 3) return;
  for (const m of ap.moves) {
    if (m.dead || (seen && !seen(m.x, m.y, 2))) continue;
    if (m.spd > 0.002 || m.phase === 'roll' || m.phase === 'final') SND.level += m.phase === 'roll' ? 0.5 : 0.18;
    if (m.phase === 'roll' && !SND.spooled.has(m)) { SND.spooled.add(m); IC.sfx.spool(m.x, m.y); }
  }
  // an announcement now and then when the terminal is close (not the moment the camera arrives)
  const now = Date.now();
  if (z > 14 && now > SND.annT && ap.parts.some(p => p.kind === 'terminal' && p.built && (!seen || seen(p.x, p.y, 2)))) { SND.annT = now + 50000 + Math.random() * 60000; if (SND.annT0) IC.sfx.announce(); SND.annT0 = 1; }
};
/* after the frame: set the bed's loudness, and start the next frame's count */
IC.lifeSoundEnd = function () { if (IC.sfx && IC.sfx.aptAmb) IC.sfx.aptAmb(SND.level); SND.level = 0; };

/* ---------- the airliner followed: a ring round it; in the air the aircraft itself, its shadow on the ground ---------- */
IC.drawFollowMark = function (g, S, px, now) {
  const tl = IC.followTail(S), w = tl && IC.tailWhere(S, tl); if (!w) return;
  if (w.t) { const al = IC.avAirline(S, tl.al); IC.drawPlane(g, w.x, w.y, w.h, tl.type, al ? al.livery : null, { shadow: (w.alt || 0) * 6, minPx: 14 }); }
  if (w.s) return;   // on its stand the turnaround clock rings it
  const r = Math.max((tl.T.len || 0.4) * 0.8, 22 * px), a = (now * 0.8) % 6.283;
  g.lineWidth = Math.max(0.004, 2 * px); g.strokeStyle = 'rgba(242,180,65,0.9)';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w.x, w.y, r, a + i * Math.PI / 2, a + i * Math.PI / 2 + 0.9); g.stroke(); }
};

/* ---------- the turnaround clock on the stand of the airliner selected or followed ---------- */
IC.drawTurnClock = function (g, S, ap, px, z, label) {
  const tl = S.sel && S.sel.kind === 'tail' ? S.sel.ref : IC.followTail(S);
  if (!tl || tl.where !== 'stand' || tl.at !== ap.id) return;
  const s = IC.aptStands(ap).find(x => x.id === tl.stand); if (!s) return;
  const sv = s.svc, f = sv && sv.tail === tl.id ? U.clamp((S.time - sv.t0) / Math.max(60, sv.dur), 0, 1) : 0, R = Math.max(tl.T.len * 0.62, 26 * px);
  g.lineWidth = Math.max(0.006, 2.4 * px);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(s.x, s.y, R, 0, 7); g.stroke();
  g.strokeStyle = tl.t <= 0 ? 'rgba(127,232,176,0.95)' : 'rgba(242,180,65,0.95)'; g.beginPath(); g.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + f * 6.283); g.stroke();
  const txt = tl.t > 0 ? `${IC.turnStage(tl.T, f, sv && sv.kind)} · ${U.dur(tl.t)} left` : 'Turned round: ready to go';
  label(g, `STAND ${IC.standName(s)}: ${txt.toUpperCase()}`, s.x, s.y - R - 7 * px, px, 'rgba(242,214,150,0.98)', 12, 'center', 700);
};

})(window.IC);
