/* Iron Canopy — (round 3) the chain made visible, over the map: people from the towns by road to the airport,
   through its terminal, out on flights to the places it serves, and the money coming back. Numbers from
   IC.aptChain (problems.js), worked out once a second; drawn only while it is switched on (the airport panel's
   "Show on the map"). Draws only. */
(function (IC) {
'use strict';
const U = IC.U;
let cache = null;
const GREEN = '127,232,176', BLUE = '111,210,255', GOLD = '243,217,139';
function pick(S) {
  const s = S.sel, a = s && (s.kind === 'apart' ? s.ap : s.kind === 'infra' && s.ref.parts ? s.ref : null);
  if (a && a.kind === 'airport' && a.owner === 'us') return a;
  if (IC.bb && IC.bb.ap && IC.bb.ap.kind === 'airport') return IC.bb.ap;
  return IC.bases(S).find(b => b.kind === 'airport' && b.owner === 'us' && b.parts) || null;
}
function tag(ctx, txt, x, y, px, col, size) {
  ctx.font = `600 ${(size || 11) * px}px "IBM Plex Mono", monospace`;
  const w = ctx.measureText(txt).width + 10 * px, h = (size || 11) * 1.6 * px;
  ctx.fillStyle = 'rgba(6,12,18,0.82)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 4 * px) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
/* dots running along a line, a to b, at a speed; n of them */
function dots(ctx, a, b, n, t, r, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { const f = (t + i / n) % 1, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
}
IC.drawChain = function (ctx, S, px, now) {
  const ap = pick(S); if (!ap) return;
  if (!cache || cache.ap !== ap || now - cache.t > 1) cache = { ap, t: now, C: IC.aptChain(S, ap) };
  const C = cache.C, short = n => n.replace(/ (International|Airport|Field)$/, '');
  ctx.save();
  // people in, by road: a line from each town in reach, as thick as the people it brings
  for (const x of C.cities) {
    const c = x.c, w = U.clamp(Math.sqrt(x.k) / 5, 1.5, 7) * px;
    ctx.strokeStyle = `rgba(${GREEN},0.5)`; ctx.lineWidth = w; ctx.setLineDash([9 * px, 7 * px]); ctx.lineDashOffset = -(now * 26 % 16) * px;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(ap.x, ap.y); ctx.stroke();
    ctx.setLineDash([]);
    // (a town off the screen is labelled on its line, near the airport)
    const L = U.dist(ap, c), v = IC.rs && IC.rs.view, inV = !v || (c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1), f = inV ? 1 : Math.min(1, (200 + 46 * C.cities.indexOf(x)) * px / Math.max(1e-6, L));
    dots(ctx, c, ap, Math.max(2, Math.round(x.k / 120)), now * 0.08 + C.cities.indexOf(x) * 0.21, 2.4 * px, `rgba(${GREEN},0.95)`);
    const lx = ap.x + (c.x - ap.x) * f, ly = ap.y + (c.y - ap.y) * f, nearA = Math.hypot(lx - ap.x, ly - ap.y) < 90 * px;
    tag(ctx, `${short(c.name)} · ${IC.fmtPeople(x.k)} · ${Math.round(x.h * 60)} min by road`, lx, nearA ? ap.y - 30 * px : ly - 14 * px, px, `rgb(${GREEN})`);
  }
  // flights out to the places served, and the money coming back along them
  const far = C.dests, n = far.length;
  far.forEach((d, i) => {
    const L = U.dist(ap, d), k = Math.min(1, (260 + 30 * i) * px / Math.max(1e-6, L)), end = { x: ap.x + (d.x - ap.x) * k, y: ap.y + (d.y - ap.y) * k };
    ctx.strokeStyle = `rgba(${BLUE},0.45)`; ctx.lineWidth = 1.6 * px; ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    dots(ctx, ap, end, 4, now * 0.12 + i / Math.max(1, n), 2.6 * px, `rgba(${BLUE},0.9)`);
    dots(ctx, end, ap, 3, now * 0.1 + i * 0.37, 3.2 * px, `rgba(${GOLD},0.95)`);
    const lab = { x: ap.x + (end.x - ap.x) * 0.55, y: ap.y + (end.y - ap.y) * 0.55 };
    tag(ctx, `✈ ${short(d.name)}`, lab.x, lab.y, px, `rgb(${BLUE})`, 10);
  });
  // the airport: what goes through it and what it earns
  const cal = S.mode === 'story';
  tag(ctx, `${Math.round(C.paxHour).toLocaleString('en-US')} passengers an hour → ${n} place${n === 1 ? '' : 's'} → ${U.money(C.earned)} ${cal ? 'this month' : 'today'}`, ap.x, ap.y + 26 * px, px, `rgb(${GOLD})`, 12);
  ctx.restore();
};

})(window.IC);
