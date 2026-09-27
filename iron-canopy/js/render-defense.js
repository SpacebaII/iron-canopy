/* Iron Canopy — what the air defence is thinking, drawn on the map: jamming strobes, predicted intercept points,
   the reason a battery is holding fire, and call-in teams. Drawn after the tracks, in world coordinates. */
(function (IC) {
'use strict';
const U = IC.U;
let ctx;

function label(txt, x, y, px, col, size, align, weight) {
  ctx.font = `${weight || 500} ${(size || 10) * px}px "IBM Plex Mono", monospace`;
  ctx.textAlign = align || 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(txt, x + 0.9 * px, y + 0.9 * px);
  ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}

/* a jammer's strobe: a flickering wedge from the radar along the jammer's bearing, out to the radar's reach.
   It shows the direction, never the range. */
function strobes(S, px, now) {
  const seen = new Set();
  for (const st of S.strobes || []) {
    const L = Math.min(st.R || 3000, 4000), a0 = st.a - st.w, a1 = st.a + st.w;
    const fl = 0.55 + 0.45 * Math.sin(now * 17 + st.a * 40) * Math.sin(now * 6.1);
    ctx.fillStyle = `rgba(242,180,65,${(0.05 + 0.08 * st.k) * (0.7 + 0.3 * fl)})`;
    ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.arc(st.x, st.y, L, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,200,90,${0.35 + 0.3 * fl})`; ctx.lineWidth = 1.2 * px; ctx.setLineDash([6 * px, 5 * px]);
    ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(st.x + Math.cos(st.a) * L, st.y + Math.sin(st.a) * L); ctx.stroke(); ctx.setLineDash([]);
    if (st.unit && !seen.has(st.unit) && IC.cam.z > 0.08) { seen.add(st.unit); label(`JAMMED ${U.compass(st.a)}`, st.x, st.y + 24 * px, px, '#f2b441', 9, 'center', 700); }
  }
}

/* where interceptors will meet ballistic warheads */
function pips(S, px, now) {
  for (const m of S.missiles) {
    if (!m.pip || m.dead) continue;
    const P = m.pip, left = Math.max(0, P.T - S.time);
    const r = 7 * px + 4;
    ctx.strokeStyle = `rgba(160,225,255,${0.5 + 0.3 * Math.sin(now * 8)})`; ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, 7); ctx.moveTo(P.x - r * 1.5, P.y); ctx.lineTo(P.x + r * 1.5, P.y); ctx.moveTo(P.x, P.y - r * 1.5); ctx.lineTo(P.x, P.y + r * 1.5); ctx.stroke();
    ctx.setLineDash([2 * px, 4 * px]); ctx.strokeStyle = 'rgba(160,225,255,0.3)';
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.setLineDash([]);
    if (IC.cam.z > 0.1) label(`${m.M.short} ${Math.round(P.alt)} km · ${Math.ceil(left)} s`, P.x, P.y - r - 5 * px, px, '#a0e1ff', 8.5, 'center', 600);
  }
}

/* a battery with hostiles near and not firing says why, under its symbol */
function holding(S, px) {
  if (IC.cam.z < 0.12) return;
  for (const u of S.units) {
    if (u.state !== 'ready' || !(u.d.weapon === 'sam' || u.d.weapon === 'gun') || !u.why) continue;
    if (/^(Engaging|Firing|Home-on-jam|No targets|Watching|Tracking)/.test(u.why)) continue;
    const R = IC.maxRange(S, u) * 1.3;
    if (!S.threats.some(t => t.det && !t.dead && t.aff === 'H' && U.dist(u, t) < R)) continue;
    const txt = u.why.length > 46 ? u.why.slice(0, 44) + '…' : u.why;
    label(txt, u.x, u.y + 26 * px, px, '#ffcf8a', 8.5, 'center', 600);
  }
}

/* call-in teams: the drop point while the helicopter is on its way, then the team's reach and the time it has left */
function teams(S, px, now) {
  const C = S.callin; if (!C) return;
  for (const j of C.inbound) {
    const k = U.clamp((S.time - j.t0) / (j.t - j.t0), 0, 1), r = 10 * px + 30 * (1 - k);
    ctx.strokeStyle = `rgba(111,210,255,${0.5 + 0.4 * Math.sin(now * 8)})`; ctx.lineWidth = 1.6 * px; ctx.setLineDash([4 * px, 3 * px]);
    ctx.beginPath(); ctx.arc(j.x, j.y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    label(`TEAM IN ${Math.ceil(j.t - S.time)} s`, j.x, j.y - r - 5 * px, px, '#6fd2ff', 9, 'center', 700);
  }
  for (const u of S.units) {
    if (!u.callin) continue;
    const R = IC.maxRange(S, u), left = Math.max(0, u.expire - S.time), f = left / (u.stay || 480);
    ctx.strokeStyle = 'rgba(111,210,255,0.35)'; ctx.lineWidth = 1 * px; ctx.setLineDash([3 * px, 4 * px]);
    ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = f < 0.2 ? '#f2b441' : '#6fd2ff'; ctx.lineWidth = 2.2 * px;
    ctx.beginPath(); ctx.arc(u.x, u.y, 16 * px, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
    if (IC.cam.z > 0.1) label(`${U.dur(left)} left · ${u.mags.reduce((s, m) => s + m.mag + m.store, 0)} missiles`, u.x, u.y - 22 * px, px, '#9fdcff', 8.5, 'center', 600);
  }
  // the drop cursor
  if (S.mode2 && S.mode2.kind === 'callin' && S.hover) {
    const h = S.hover, ok = !IC.callInWhy(S, h.x, h.y), R = IC.MUN[IC.callInStats(S).mun].range;
    ctx.strokeStyle = ok ? 'rgba(111,210,255,0.7)' : 'rgba(255,91,79,0.7)'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([5 * px, 4 * px]);
    ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
}

/* the test range: a flat plane with a 10 km grid, our half and theirs, and the target the threats aim at */
IC.drawFlat = function (c, S, view, px) {
  ctx = c;
  const mid = IC.WW / 2;
  ctx.fillStyle = '#1b2420'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  if (view.x1 > mid) { ctx.fillStyle = '#261d1b'; ctx.fillRect(Math.max(mid, view.x0), view.y0, view.x1 - Math.max(mid, view.x0), view.y1 - view.y0); }
  const step = IC.cam.z > 0.4 ? 10 : IC.cam.z > 0.08 ? 100 : 500;
  ctx.lineWidth = px;
  for (const [st, a] of [[step, 0.07], [step * 5, 0.14]]) {
    ctx.strokeStyle = `rgba(200,220,210,${a})`; ctx.beginPath();
    for (let x = Math.floor(view.x0 / st) * st; x <= view.x1; x += st) { ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1); }
    for (let y = Math.floor(view.y0 / st) * st; y <= view.y1; y += st) { ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y); }
    ctx.stroke();
  }
};
function rangeTarget(S, px) {
  const T = S.range.target, r = 14 * px;
  ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2 * px;
  ctx.beginPath(); ctx.arc(T.x, T.y, r, 0, 7); ctx.moveTo(T.x - r * 1.6, T.y); ctx.lineTo(T.x + r * 1.6, T.y); ctx.moveTo(T.x, T.y - r * 1.6); ctx.lineTo(T.x, T.y + r * 1.6); ctx.stroke();
  label('TARGET', T.x, T.y - r * 1.9, px, '#ff9a3c', 9, 'center', 700);
  // where the next launch comes from
  const F = S.range.form, a = (+F.brg - 90) * Math.PI / 180, d = Math.max(20, (+F.km || 150) * 10);
  const P = { x: T.x + Math.cos(a) * d, y: T.y + Math.sin(a) * d };
  ctx.setLineDash([6 * px, 6 * px]); ctx.strokeStyle = 'rgba(255,91,79,0.45)'; ctx.lineWidth = 1.2 * px;
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(T.x, T.y); ctx.stroke(); ctx.setLineDash([]);
  label(`launch point · ${F.brg}° · ${F.km} km`, P.x, P.y - 8 * px, px, '#ffb0a6', 9, 'center', 600);
}

IC.drawDefense = function (c, S, px, now) {
  ctx = c;
  if (S.range) rangeTarget(S, px);
  strobes(S, px, now);
  pips(S, px, now);
  holding(S, px);
  teams(S, px, now);
};

})(window.IC);
