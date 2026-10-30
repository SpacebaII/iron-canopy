/* Iron Canopy — the war plan on the map (briefs 77, 78). In play: their batteries we have traced, with how many
   launchers are left. With the war planner open: every battery, its air defence's reach, and the wave being written,
   a line from each battery to its target with what flies and how long. render-combat.js calls IC.drawWarPlan. */
(function (IC) {
'use strict';
const U = IC.U, cam = IC.cam, RS = IC.rs;
const GLYPH = { bal: 'tel', rkt: 'tubes', cm: 'cm', drone: 'drone', air: 'runway', sam: 'mrsam' };
const LINE = { bal: 'rgba(255,91,79,0.8)', rkt: 'rgba(255,150,100,0.8)', cm: 'rgba(255,110,210,0.75)', drone: 'rgba(255,170,90,0.75)', air: 'rgba(255,220,120,0.75)' };

IC.drawWarPlan = function (S, px, ctx, RC) {
  const X = S.wp; if (!X) return;
  const P = IC.planner, plan = P && P.on;
  const label = (...a) => RS.label(...a);
  for (const B of Object.values(X.bats)) {
    const left = IC.wpAlive(B), tel = IC.WP_W[B.w].tel;
    // in play, only what we have traced: launchers we have found are drawn by render-combat as themselves
    if (!plan && (!B.seen || tel) && !(S.layers && S.layers.all)) continue;
    if (!RS.inView(B.x, B.y, (B.R || 0) + 300)) continue;
    if (B.w === 'sam' && plan && cam.z > 0.012) {
      ctx.strokeStyle = 'rgba(255,91,79,0.35)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([5 * px, 5 * px]);
      ctx.beginPath(); ctx.arc(B.x, B.y, B.R || IC.WP_W.sam.R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = left ? 1 : 0.45;
    const sel = plan && P.bat === B.id, s = px * (sel ? 1.25 : 1);
    const ink = RC.frame(ctx, 'h', B.x, B.y, s);
    RC.glyph(ctx, GLYPH[B.grp] || 'crate', B.x, B.y, s * 0.95, ink);
    ctx.globalAlpha = 1;
    if (plan && tel && cam.z > 0.15) { ctx.strokeStyle = 'rgba(255,170,160,0.4)'; ctx.lineWidth = px; ctx.setLineDash([2 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(B.hx, B.hy); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]); }
    if (cam.z > 0.03 || sel) label(`${B.name} · ${left} of ${B.n}`, B.x, B.y + 20 * px, px, sel ? '#fff' : 'rgba(255,170,160,0.9)', 9.5);
    if (sel) RS.brackets(B.x, B.y, 15 * px, px);
  }
  if (!plan) return;
  // the wave being written: what flies from where to what, and for how long
  const w = X.plan.waves.find(x => x.id === P.wave);
  if (!w) return;
  (w.hits || []).forEach((h, i) => {
    const I = IC.wpHitInfo(S, h);
    if (!I || !I.obj) return;
    const B = I.B, pts = [{ x: B.x, y: B.y }].concat((h.via || []).map(v => ({ x: v[0], y: v[1] }))).concat([I.obj]);
    ctx.strokeStyle = LINE[B.grp] || 'rgba(255,91,79,0.8)'; ctx.lineWidth = (P.hit === i ? 2.6 : 1.6) * px;
    ctx.setLineDash(B.grp === 'drone' ? [3 * px, 5 * px] : B.grp === 'cm' ? [9 * px, 5 * px] : []);
    ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
    // the target: a cross
    const t = I.obj, r = 9 * px;
    ctx.strokeStyle = '#ff5b4f'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(t.x - r, t.y - r); ctx.lineTo(t.x + r, t.y + r); ctx.moveTo(t.x + r, t.y - r); ctx.lineTo(t.x - r, t.y + r); ctx.stroke();
    const m = pts[Math.floor(pts.length / 2) - (pts.length % 2 ? 0 : 1)], n = pts[Math.floor(pts.length / 2)];
    const nick = B.tier ? (IC.armsVer(B.tier) || {}).nick : IC.ARMS[B.w] ? (IC.armsVer(IC.armsKey(S, B.w)) || {}).nick : B.w;
    const k = Array.isArray(h.n) ? h.n.join('–') : h.n;
    if (P.hit === i || cam.z > 0.045 || (w.hits || []).length <= 4) label(`${i + 1}: ${k} ${nick || ''} · ${U.dur(I.flight)}${h.t ? ` · lands ${h.t > 0 ? '+' : ''}${Math.round(h.t / 6) / 10} min` : ''}`, (m.x + n.x) / 2, (m.y + n.y) / 2 - 6 * px, px, '#ffd9d4', 10);
    label(t.name, t.x, t.y + 18 * px, px, '#ffb3ab', 10);
  });
};

})(window.IC);
