/* Iron Canopy — (brief 71) airport operations on the map: a ring on every occupied stand for its turnaround (amber
   while it runs, green when it is ready, red when it is held or grounded), a bar of six stages on every building
   site, the queue at each runway, and every incident where it happens: its ring and bar, the closed runway's
   crosses, the ops vehicles driving out from their base, sweeping, lifting, cleaning, and the Airside operations
   base itself. The renderer's alone: it reads airops.js and never touches the simulation. render-airport.js calls
   IC.drawOps and IC.drawOpsBase. */
(function (IC) {
'use strict';
const U = IC.U;
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const COL = { amber: 'rgba(242,180,65,0.95)', red: 'rgba(255,96,80,0.95)', green: 'rgba(127,232,176,0.95)', dim: 'rgba(0,0,0,0.5)' };
/* the base's vehicles from above, front along +x (render-life.js draws them) */
const VEH = {
  sweeper:  { L: 0.075, W: 0.026, c: 'rgb(236,192,48)', c2: 'rgb(60,62,64)', k: 'truck' },
  followme: { L: 0.045, W: 0.019, c: 'rgb(236,192,48)', c2: 'rgb(30,30,30)', k: 'van' },
  crane:    { L: 0.12, W: 0.03, c: 'rgb(236,192,48)', c2: 'rgb(80,82,84)', k: 'truck' },
  lorry:    { L: 0.1, W: 0.026, c: 'rgb(230,230,226)', c2: 'rgb(236,192,48)', k: 'truck' },
  vac:      { L: 0.08, W: 0.025, c: 'rgb(226,228,230)', c2: 'rgb(60,140,80)', k: 'tank' },
  van:      { L: 0.05, W: 0.021, c: 'rgb(226,228,230)', c2: 'rgb(60,90,160)', k: 'van' }
};
const veh = (g, k, x, y, h, px, now, night, moving) => IC.drawLifeVeh && IC.drawLifeVeh(g, VEH[k], x, y, h, px, 13, moving || (now * 1.7) % 1 < 0.5 ? 1 : 0.4, night, 1);

/* ---------- the Airside operations base: a yellow-roofed garage of four bays, its vehicles parked in front ---------- */
IC.drawOpsBase = function (g, S, ap, p, w, h, px, z, full, dead, now, night) {
  const hp = p.hp / p.max, k = dead ? 0.3 : 0.6 + 0.4 * hp;
  g.fillStyle = 'rgba(150,152,146,0.95)'; g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = `rgb(${196 * k | 0},${170 * k | 0},${92 * k | 0})`; g.fillRect(-w / 2, -h / 2, w, h * 0.55);
  if (!full || dead) return;
  // four bays with their doors on the apron side, a stripe of hazard paint along the apron's edge
  g.fillStyle = 'rgba(40,40,38,0.9)'; for (let i = 0; i < 4; i++) g.fillRect(-w / 2 + w * (0.06 + i * 0.235), h * 0.02, w * 0.17, h * 0.04);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-w / 2, -h / 2, w, h * 0.08);
  if (z > 8) { g.fillStyle = 'rgba(236,192,48,0.8)'; for (let x = -w / 2; x < w / 2; x += 0.04) g.fillRect(x, h / 2 - 0.012, 0.02, 0.012); }
  // the vehicles at home: one fewer for every incident they are out on
  const out = ((ap.incs && ap.incs.list) || []).filter(i => !i.done && i.from === p.id).length;
  const home = ['sweeper', 'followme', 'crane', 'van'].slice(0, Math.max(0, 4 - out * 2));
  home.forEach((v, i) => veh(g, v, -w / 2 + w * (0.14 + i * 0.235), h * 0.27, -Math.PI / 2, px, now, night, 0));
};

/* ---------- each frame, over the airport ---------- */
IC.drawOps = function (g, S, ap, px, z, now, lbl, night, seen) {
  if (!(IC.FOCUS && IC.FOCUS.ops) || ap.owner !== 'us') return;
  if (z > 3) standRings(g, S, ap, px, z, seen);
  const L = (ap.incs && ap.incs.list) || [];
  for (const inc of L) if (!inc.done && z > 0.6) drawInc(g, S, ap, inc, px, z, now, lbl, night);
  if (z > 2.2) queues(g, S, ap, px, z, lbl);
};

/* every occupied stand: a thin ring for its turnaround (the selected or followed one has the big clock) */
function standRings(g, S, ap, px, z, seen) {
  const sel = S.sel && S.sel.kind === 'tail' ? S.sel.ref : IC.followTail && IC.followTail(S);
  const r0 = Math.max(9 * px, 0.06), lw = Math.max(0.004, 2 * px);
  for (const a of ap.parts) {
    if (a.kind !== 'apron' || !a.built || !a.stands) continue;
    for (const s of a.stands) {
      if (!s.occ || (seen && !seen(s.x, s.y, 1))) continue;
      const tl = S.av && S.av.tails.find(t => t.id === s.occ);
      if (!tl || tl.where !== 'stand' || tl === sel || tl.T.mil) continue;
      const sv = s.svc, grounded = tl.dmg && S.time < tl.dmg.until, held = tl.held && S.time - tl.held.t0 > 60;
      const f = tl.t <= 0 ? 1 : sv && sv.tail === tl.id ? U.clamp((S.time - sv.t0) / Math.max(60, sv.dur), 0, 1) : 0;
      // close in, round the aircraft; further out, a dot of a ring on the stand
      const R = z > 14 ? Math.max(tl.T.len * 0.58, r0) : r0, col = grounded || held ? COL.red : tl.t <= 0 ? COL.green : COL.amber;
      g.lineWidth = lw; g.strokeStyle = COL.dim; g.beginPath(); g.arc(s.x, s.y, R, 0, 7); g.stroke();
      g.strokeStyle = col; g.beginPath(); g.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + Math.max(0.05, f) * 6.283); g.stroke();
      if (s.shut) { g.strokeStyle = COL.red; g.setLineDash([4 * px, 3 * px]); g.beginPath(); g.arc(s.x, s.y, R + 4 * px, 0, 7); g.stroke(); g.setLineDash([]); }
    }
  }
}

/* departures queued for each runway: one tag at the head of the queue */
function queues(g, S, ap, px, z, lbl) {
  const by = new Map();
  for (const m of ap.moves) {
    if (m.dead || m.kind !== 'dep' || !m.plan || !m.plan.rw || !(m.phase === 'hold' || m.holding === 'runway' || m.holding === 'queue')) continue;
    const L = by.get(m.plan.rw.id) || []; L.push(m); by.set(m.plan.rw.id, L);
  }
  for (const [, L] of by) {
    if (L.length < 2) continue;
    const head = L.find(m => m.phase === 'hold') || L[0];
    // (to the side of the head of the queue, clear of the incident's words above the runway)
    pill(g, `${L.length} WAITING TO DEPART`, head.x + 78 * px, head.y + 6 * px, px, COL.amber);
  }
}

/* one incident: where it is, what is being done, and the vehicles doing it */
function drawInc(g, S, ap, inc, px, z, now, lbl, night) {
  const st = IC.opsStage(inc), K = IC.OPS_INC[inc.kind], col = K.col === 'red' && (st.k === 'fire' || st.k === 'burn') ? COL.red : COL.amber;
  const rw = inc.rw && ap.parts.find(p => p.id === inc.rw), f = U.clamp(inc.t / Math.max(1, st.dur), 0, 1);
  const shut = inc.shut === 'rw' && rw && ap.opsShut && Object.values(ap.opsShut).includes(inc.id);
  if (shut && z > 0.8) closedX(g, rw, px);
  if (z > 2) {
    // what is on the pavement: debris, fuel, skid marks into the grass
    if (inc.kind === 'debris' || inc.kind === 'bird') for (let i = 0; i < 6; i++) { if (st.k === 'inspect') break; const a = i * 2.4, r = 0.03 + (i % 3) * 0.025; g.fillStyle = inc.kind === 'bird' ? 'rgba(120,60,50,0.9)' : 'rgba(40,40,40,0.9)'; g.fillRect(inc.x + Math.cos(a) * r, inc.y + Math.sin(a) * r * 0.6, Math.max(0.006, 1.5 * px), Math.max(0.006, 1.5 * px)); }
    if (inc.kind === 'spill') { const r = 0.16 * (st.k === 'clean' ? 1 - f * 0.9 : 1); g.fillStyle = inc.burns && st.k === 'burn' ? 'rgba(30,24,20,0.6)' : 'rgba(60,70,90,0.45)'; g.beginPath(); g.ellipse(inc.x + 0.03, inc.y, r * 1.3, r, 0.4, 0, 7); g.fill(); if (st.k === 'foam') { g.fillStyle = 'rgba(245,245,240,0.7)'; g.beginPath(); g.ellipse(inc.x + 0.03, inc.y, r * 1.3 * f, r * f, 0.4, 0, 7); g.fill(); } }
    if (inc.kind === 'excursion' && rw) { const m = ap.moves.find(x => x.id === inc.mv); if (m && m.offAt) { g.strokeStyle = 'rgba(30,26,20,0.55)'; g.lineWidth = Math.max(0.01, 1.4 * px); g.beginPath(); g.moveTo(m.offAt.x - Math.cos(m.offAt.h) * 0.6, m.offAt.y - Math.sin(m.offAt.h) * 0.6); g.quadraticCurveTo(m.offAt.x, m.offAt.y, m.x, m.y); g.stroke(); } }
    vehicles(g, S, ap, inc, st, f, rw, px, z, now, night);
  }
  // the ring and the bar, with what is being done and how long it has left
  const pulse = 0.5 + 0.5 * Math.sin(now * 4), R = Math.max(14 * px, 0.12) * (1 + 0.15 * pulse);
  g.lineWidth = Math.max(0.006, 2.2 * px); g.strokeStyle = col; g.beginPath(); g.arc(inc.x, inc.y, R, 0, 7); g.stroke();
  if (z > 1.2) {
    const where = rw ? rw.name : inc.stand ? `stand ${IC.standName(IC.aptStands(ap).find(s => s.id === inc.stand) || { id: '' })}` : '';
    const head = st.k === 'ask' ? `${K.name.toUpperCase()} REPORTED · YOUR CALL` : st.k === 'open' ? `${where.toUpperCase()} OPEN WITH DEBRIS` : `${shut ? `${where.toUpperCase()} CLOSED · ` : inc.shut === 'stand' ? `${where.toUpperCase()} CLOSED · ` : ''}${IC.OPS_STG[st.k].toUpperCase()}`;
    const left = st.k === 'open' ? '' : ` · ${U.dur(Math.max(30, IC.opsLeft(S, inc)))}`;
    const y = inc.y - R - 36 * px;
    pill(g, head + left, inc.x, y, px, col);
    bar(g, inc.x, y + 14 * px, 120 * px, 4 * px, IC.opsProg(inc), col, px);
  }
}
/* real closed-runway marks: big yellow crosses at each end and the middle */
function closedX(g, rw, px) {
  const d = IC.rwDir(rw), w = (rw.w || 0.45) * 0.9, L = Math.max(w * 1.6, 12 * px);
  g.strokeStyle = 'rgba(250,210,60,0.95)'; g.lineWidth = Math.max(w * 0.18, 2 * px); g.lineCap = 'butt';
  for (const t of [0.08, 0.5, 0.92]) {
    const c = IC.rwAt(rw, t), ux = d.x * L / 2, uy = d.y * L / 2, vx = -d.y * w / 2, vy = d.x * w / 2;
    g.beginPath(); g.moveTo(c.x - ux - vx, c.y - uy - vy); g.lineTo(c.x + ux + vx, c.y + uy + vy); g.moveTo(c.x - ux + vx, c.y - uy + vy); g.lineTo(c.x + ux - vx, c.y + uy - vy); g.stroke();
  }
}
/* the response: out from the ops base (or in from the fence, the contractor), working, and back */
function vehicles(g, S, ap, inc, st, f, rw, px, z, now, night) {
  const base = inc.from && ap.parts.find(p => p.id === inc.from);
  const gate = base ? { x: base.x + Math.cos((base.a || 0) + Math.PI / 2) * (base.h || 0.5) * 0.7, y: base.y + Math.sin((base.a || 0) + Math.PI / 2) * (base.h || 0.5) * 0.7 } : { x: ap.x + (inc.x - ap.x) * 1.6, y: ap.y + (inc.y - ap.y) * 1.6 };
  const at = { x: inc.x, y: inc.y }, hd = Math.atan2(at.y - gate.y, at.x - gate.x);
  const d = rw ? IC.rwDir(rw) : { x: 1, y: 0 }, rh = Math.atan2(d.y, d.x);
  switch (st.k) {
    case 'drive': { const p = lerp(gate, at, f); veh(g, 'sweeper', p.x, p.y, hd, px, now, night, 1); const q = lerp(gate, at, Math.max(0, f - 0.06)); veh(g, 'followme', q.x, q.y, hd, px, now, night, 1); break; }
    case 'sweep': {
      // up and down the runway, one pass every few minutes, the follow-me car parked by the debris
      const tt = IC.rwT(rw, at), sw = Math.abs(((f * 3) % 2) - 1), p = IC.rwAt(rw, U.clamp(tt + (sw - 0.5) * 0.5, 0.02, 0.98));
      veh(g, 'sweeper', p.x, p.y, rh + ((f * 3) % 2 < 1 ? 0 : Math.PI), px, now, night, 1);
      veh(g, 'followme', at.x - d.y * 0.12, at.y + d.x * 0.12, rh, px, now, night, 0);
      break;
    }
    case 'inspect': { const p = IC.rwAt(rw, U.clamp(f, 0.02, 0.98)); veh(g, 'followme', p.x, p.y, rh, px, now, night, 1); break; }
    case 'recover': case 'tow': {
      const m = ap.moves.find(x => x.id === inc.mv), c = m || at, h = m ? m.h : rh;
      veh(g, 'crane', c.x + Math.cos(h + 1.4) * 0.25, c.y + Math.sin(h + 1.4) * 0.25, h, px, now, night, 0);
      veh(g, 'lorry', c.x + Math.cos(h - 1.6) * 0.25, c.y + Math.sin(h - 1.6) * 0.25, h + 0.3, px, now, night, 0);
      if (st.k === 'tow' && m) veh(g, 'followme', m.x + Math.cos(m.h) * (m.T.len * 0.5 + 0.05), m.y + Math.sin(m.h) * (m.T.len * 0.5 + 0.05), m.h + Math.PI, px, now, night, 1);
      break;
    }
    case 'disembark': {
      // stairs at the door and buses waiting on the grass
      const m = ap.moves.find(x => x.id === inc.mv); if (!m) break;
      veh(g, 'van', m.x - Math.sin(m.h) * 0.12, m.y + Math.cos(m.h) * 0.12, m.h + 1.57, px, now, night, 0);
      break;
    }
    case 'clean': { veh(g, 'vac', at.x + 0.06, at.y + 0.08, hd, px, now, night, 0); veh(g, 'followme', at.x - 0.08, at.y + 0.1, hd, px, now, night, 0); break; }
    case 'check': { veh(g, 'van', at.x, at.y + 0.06, hd, px, now, night, 0); break; }
  }
}
/* a little dark plate with words, and a bar: drawn in screen pixels (a font of a fraction of a world unit comes out
   squeezed close in), at the point on the map */
function toScr(g, x, y, px) { const m = g.getTransform(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, k: Math.hypot(m.a, m.b) * px }; }
function pill(g, t, x, y, px, col) {
  const s = toScr(g, x, y, px), k = s.k;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = `700 ${9 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  const w = g.measureText(t).width + 10 * k, h = 14 * k;
  g.fillStyle = 'rgba(12,16,20,0.84)'; g.beginPath(); if (g.roundRect) g.roundRect(s.x - w / 2, s.y - h / 2, w, h, 3 * k); else g.rect(s.x - w / 2, s.y - h / 2, w, h); g.fill();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, s.x, s.y + 0.5 * k);
  g.restore();
}
function bar(g, x, y, w, h, f, col, px) {
  const s = toScr(g, x, y, px), k = s.k; w = w / px * k; h = h / px * k;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = 'rgba(12,16,20,0.84)'; g.fillRect(s.x - w / 2 - h * 0.5, s.y - h, w + h, h * 2);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(s.x - w / 2, s.y - h / 2, w, h);
  g.fillStyle = col; g.fillRect(s.x - w / 2, s.y - h / 2, w * U.clamp(f, 0, 1), h);
  g.restore();
}
IC.opsPill = pill;

/* ---------- a building site's stages, under its words: one segment a stage, the one at work filling ---------- */
IC.drawWorkBar = function (g, S, ap, L, px) {
  const p = L.of, w = ap.works.find(x => x.part === p && x.stages); if (!w) return;
  const s = toScr(g, L.x, L.y + 7 * px, px), k = s.k;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const n = w.stages.length, W = Math.min(150, 26 * n) * k, gap = 2 * k, sw = (W - gap * (n - 1)) / n, h = 4 * k, y = s.y, x0 = s.x - W / 2;
  g.fillStyle = 'rgba(12,16,20,0.8)'; g.fillRect(x0 - 2 * k, y - 2 * k, W + 4 * k, h + 4 * k);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (sw + gap), f = i < w.si ? 1 : i > w.si ? 0 : U.clamp(w.t / Math.max(1, w.stages[i].dur), 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x, y, sw, h);
    g.fillStyle = i < w.si ? 'rgba(127,232,176,0.95)' : w.wait ? 'rgba(242,180,65,0.95)' : 'rgba(236,236,226,0.95)'; g.fillRect(x, y, sw * f, h);
  }
  g.restore();
};

})(window.IC);
