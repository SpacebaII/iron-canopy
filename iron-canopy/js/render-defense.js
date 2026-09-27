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

IC.drawDefense = function (c, S, px, now) {
  ctx = c;
  strobes(S, px, now);
  pips(S, px, now);
  holding(S, px);
  if (IC.drawTeams) IC.drawTeams(c, S, px, now, label);
};

})(window.IC);
