/* Iron Canopy — how big the danger is, on the map. A ballistic salvo is drawn as one threat: the ground it will fall
   on, sized by the warheads; a ring that closes in as the impact comes; one label with how many, how long and on
   what; and, when it lands off screen, an arrow at the edge pointing to it. The missiles themselves are drawn big
   and labelled with their height and real speed, so they never read like a cruise missile (render-combat.js
   drawTrack). Groups come from IC.salvos (arms.js). */
(function (IC) {
'use strict';
const U = IC.U, C = IC.C, cam = IC.cam, RS = IC.rs;
const label = (...a) => RS.label(...a);

/* the ground a warhead wrecks, world units: a heavy one about 3 km across */
IC.blastR = dmg => 10 + (dmg || 0) * 0.16;

// the tracks of a salvo but its first carry no label of their own: the salvo's says it for all of them
const mute = new Set();
IC.salvoMuted = t => mute.has(t);
IC.drawSalvos = function (S, px, now) {
  const ctx = RS.ctx, G = IC.salvos(S);
  mute.clear();
  if (!G.length) return;
  for (const g of G) for (let i = 1; i < g.L.length; i++) mute.add(g.L[i].t);
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + cam.vw / cam.z, y1 = cam.y + cam.vh / cam.z;
  for (const g of G) {
    // faster pulse as the impact comes: once every two seconds a few minutes out, four times a second at the end
    const hz = U.clamp(3 / Math.max(5, g.t0) * 10, 0.5, 4), p = 0.5 + 0.5 * Math.sin(now * 6.283 * hz);
    const word = g.hgv === g.n ? 'HYPERSONIC' : 'BALLISTIC', n = g.n;
    // each warhead's ground: a red disc as wide as what it wrecks, never smaller than a few pixels
    for (const e of g.L) {
      const r = Math.max(IC.blastR(e.t.d.dmg), 7 * px);
      ctx.fillStyle = `rgba(255,60,40,${0.10 + 0.10 * p})`; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,91,79,${0.45 + 0.4 * p})`; ctx.lineWidth = 1.4 * px; ctx.stroke();
      // the line from where the missile is to where it falls
      const tp = IC.trackAt(S, e.t);
      ctx.setLineDash([4 * px, 5 * px]); ctx.strokeStyle = 'rgba(255,91,79,0.32)'; ctx.lineWidth = 1 * px;
      ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // the ring closing on the target: 120 px out five minutes before, on the ground at impact
    const rf = Math.max(...g.L.map(e => U.dist(e, g) + IC.blastR(e.t.d.dmg)), 10 * px);
    const rr = rf + Math.min(1, g.t0 / 300) * 120 * px;
    ctx.strokeStyle = `rgba(255,70,55,${0.5 + 0.45 * p})`; ctx.lineWidth = (1.5 + Math.min(n, 8) * 0.35) * px;
    ctx.beginPath(); ctx.arc(g.x, g.y, rr, 0, 7); ctx.stroke();
    // ticks on the ring, one a warhead, so the size of the salvo shows without reading
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * 6.283 / n;
      ctx.beginPath(); ctx.moveTo(g.x + Math.cos(a) * rr, g.y + Math.sin(a) * rr); ctx.lineTo(g.x + Math.cos(a) * (rr + 9 * px), g.y + Math.sin(a) * (rr + 9 * px)); ctx.stroke();
    }
    const big = 11 + Math.min(n, 8) * 1.2;
    const when = g.t1 - g.t0 > 20 ? `${U.dur(g.t0)}–${U.dur(g.t1)}` : U.dur(g.t0);
    // the label on the side away from where the missiles come in, so it never sits on their tracks
    let mx = 0, my = 0; for (const e of g.L) { const tp = IC.trackAt(S, e.t); mx += tp.x - g.x; my += tp.y - g.y; }
    const below = my < 0, ly = below ? g.y + rr + (big + 6) * px : g.y - rr - 22 * px;
    label(`${n > 1 ? n + ' × ' : ''}${word}`, g.x, ly, px, C.hostile, big, 'center', 800);
    label(`IMPACT ${when} · ${g.at}`, g.x, ly + 13 * px, px, '#ffd1cb', 10, 'center', 700);
    // off screen: an arrow at the edge, pointing at it, so a salvo is never a surprise
    const m = 46 * px;
    if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = g.x - cx, dy = g.y - cy;
      const k = Math.min(dx ? ((dx > 0 ? x1 - m : x0 + m) - cx) / dx : 1e9, dy ? ((dy > 0 ? y1 - m : y0 + m) - cy) / dy : 1e9);
      const ax = cx + dx * k, ay = cy + dy * k, a = Math.atan2(dy, dx);
      ctx.fillStyle = `rgba(255,70,55,${0.7 + 0.3 * p})`;
      ctx.beginPath(); ctx.moveTo(ax + Math.cos(a) * 16 * px, ay + Math.sin(a) * 16 * px);
      ctx.lineTo(ax + Math.cos(a + 2.5) * 12 * px, ay + Math.sin(a + 2.5) * 12 * px); ctx.lineTo(ax + Math.cos(a - 2.5) * 12 * px, ay + Math.sin(a - 2.5) * 12 * px); ctx.fill();
      const lx = ax - Math.cos(a) * 18 * px, ly = ay - Math.sin(a) * 18 * px;
      const al = Math.abs(Math.cos(a)) < 0.5 ? 'center' : Math.cos(a) > 0 ? 'right' : 'left';
      label(`${n} ${word} · ${U.dur(g.t0)}`, lx, ly, px, C.hostile, 11, al, 800);
      label(g.at, lx, ly + 13 * px, px, '#ffd1cb', 9.5, al, 600);
    }
  }
};

/* a ballistic missile's own marks, under its symbol: a halo as wide as its warhead hits, pulsing */
IC.drawBalHalo = function (S, t, x, y, px, now) {
  const ctx = RS.ctx, p = (now * 1.4 + t.seed) % 1, r = (9 + (t.d.dmg || 100) / 12) * px;
  ctx.strokeStyle = `rgba(255,80,60,${0.75 * (1 - p)})`; ctx.lineWidth = 2 * px;
  ctx.beginPath(); ctx.arc(x, y, r * (1 + p * 0.9), 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,60,40,0.22)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
};

})(window.IC);
