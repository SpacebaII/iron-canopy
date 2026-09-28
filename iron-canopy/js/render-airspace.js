/* Iron Canopy — the airspace on the map. Each airport's volumes by class (the control zone and the rings of its
   shelves, each labelled with its floor and ceiling), military height bands, the holding stacks with their levels,
   the area sectors' centres, the height tags of tracks (flight level or feet for aircraft, km for everything else),
   and a ladder beside any point where several things fly over the same spot at different heights. */
(function (IC) {
'use strict';
const U = IC.U;

/* a height as a short label on the map: SFC, 2,500, FL150 */
const lvl = a => a <= 0.01 ? 'SFC' : IC.flText(a).replace(' ft', '');
IC.lvlShort = lvl;
/* the height part of a track's tag: FL350, or FL120↓080 while it goes to the level controllers gave it */
IC.tagAlt = function (t) {
  const a = IC.altText(t);
  if (!IC.isAircraft(t) || t.lvl == null || Math.abs(t.lvl - t.alt) < 0.1) return a;
  const to = IC.flText(t.lvl);
  return `${a}${t.lvl > t.alt ? '↑' : '↓'}${to.startsWith('FL') ? to.slice(2) : to.replace(' ft', '')}`;
};

function text(ctx, s, x, y, px, col, size, align, weight) {
  ctx.font = `${weight || 600} ${(size || 9) * px}px "IBM Plex Mono", monospace`;
  ctx.textAlign = align || 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 0.9 * px, y + 0.9 * px);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
const inView = (v, x, y, r) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;

IC.drawAirspace = function (ctx, S, px, view, labels, vols) {
  const N = S.asp; if (!N || !N.vols) return;
  const z = IC.cam.z, sel = S.sel, selAp = sel && sel.kind === 'infra' && sel.ref.parts ? sel.ref : sel && sel.kind === 'apart' ? sel.ap : null;
  const edit = IC.ui && IC.ui.aspVol, m = S.mode2;
  if (vols !== false) for (const v of N.vols) {
    if (!inView(view, v.x, v.y, v.r1) || v.r1 * z < 3) continue;
    const C = IC.ASP_CLS[v.cls], hot = (selAp && v.ap === selAp.id) || edit === v.id || (m && m.kind === 'asp' && m.vol === v.id), grab = IC.ui && IC.ui.aspEdge === v.id;
    const col = C.col, mil = v.kind === 'mil';
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r1, 0, 7); if (v.r0 > 0) ctx.arc(v.x, v.y, v.r0, 7, 0, true);
    ctx.fillStyle = `rgba(${col},${mil ? 0.07 : hot ? 0.06 : 0.025})`; ctx.fill('evenodd');
    ctx.lineWidth = (hot ? 2 : mil ? 1.6 : 1.1) * px; ctx.strokeStyle = `rgba(${col},${hot ? 0.85 : mil ? 0.6 : 0.4})`;
    if (v.cls === 'D' || v.cls === 'E' || v.cls === 'Q') ctx.setLineDash([7 * px, 5 * px]); else if (mil) ctx.setLineDash([12 * px, 4 * px, 2 * px, 4 * px]);
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r1, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // the edge under the pointer (or being dragged), and the selected ring's fill
    if (grab) { ctx.lineWidth = 4 * px; ctx.strokeStyle = `rgba(${col},0.9)`; ctx.beginPath(); ctx.arc(v.x, v.y, v.r1, 0, 7); ctx.stroke(); }
    if (edit === v.id) { ctx.beginPath(); ctx.arc(v.x, v.y, v.r1, 0, 7); if (v.r0 > 0) ctx.arc(v.x, v.y, v.r0, 7, 0, true); ctx.fillStyle = `rgba(${col},0.10)`; ctx.fill('evenodd'); }
    // floor and ceiling on the ring's rim, where the ring is wide enough on screen to read
    if (labels && (hot || z > 0.05) && v.r1 * z > 40) {
      const k = N.vols.filter(w => w.ap === v.ap && w.x === v.x && w.r1 < v.r1).length, a = -Math.PI / 2 + (v.ap ? 0.22 * k : 0);
      const x = v.x + Math.cos(a) * (v.r1 - 7 * px), y = v.y + Math.sin(a) * (v.r1 - 7 * px);
      text(ctx, `${mil ? v.cls === 'X' ? 'ADZ' : v.cls : v.cls} ${lvl(v.lo)}–${lvl(v.hi)}`, x, y, px, `rgba(${col},${hot ? 1 : 0.8})`, hot ? 10 : 8.5, 'center', 700);
      if (mil && v.r1 * z > 80) text(ctx, v.name.toUpperCase(), v.x, v.y, px, `rgba(${col},0.7)`, 8.5, 'center', 600);
    }
  }
  // drawing on the map: the ring the next click makes
  if (m && m.kind === 'asp' && S.hover && (m.op === 'radius' || m.op === 'shelf' || (m.op === 'mil' && m.c))) {
    const c = m.op === 'mil' ? m.c : m.op === 'shelf' ? S.byId[m.ap] : IC.aspVol(S, m.vol);
    if (c) {
      const r = U.dist(c, S.hover), col = m.op === 'mil' ? IC.ASP_CLS[m.cls || 'X'].col : '205,110,235';
      ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 2 * px; ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, `${Math.round(r / 10)} km`, S.hover.x, S.hover.y - 12 * px, px, `rgb(${col})`, 10, 'center', 700);
    }
  }
  // the selected airport's arrival and departure lanes, with arrows the way they are flown
  const Ln = selAp && selAp.owner === 'us' && IC.atcLanes(S, selAp);
  if (Ln && z > 0.03) {
    const arrow = (p, q, col) => { const a = Math.atan2(q.y - p.y, q.x - p.x), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, k = 7 * px; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * k, my + Math.sin(a) * k); ctx.lineTo(mx + Math.cos(a + 2.5) * k, my + Math.sin(a + 2.5) * k); ctx.lineTo(mx + Math.cos(a - 2.5) * k, my + Math.sin(a - 2.5) * k); ctx.fill(); };
    const line = (P, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.5 * px; ctx.setLineDash([9 * px, 6 * px]); ctx.beginPath(); P.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.stroke(); ctx.setLineDash([]); for (let i = 1; i < P.length; i++) arrow(P[i - 1], P[i], col); };
    for (const l of Ln.arr) line(l.pts, 'rgba(242,209,74,0.55)');
    for (const l of Ln.dep) line(l.pts, 'rgba(127,232,176,0.6)');
    if (labels) { text(ctx, `${Ln.gate.name.toUpperCase()}`, Ln.gate.x, Ln.gate.y - 8 * px, px, 'rgba(242,209,74,0.9)', 9, 'center', 700); for (const l of Ln.dep) text(ctx, `DEP ${l.rw}`, l.pts[1].x, l.pts[1].y - 8 * px, px, 'rgba(127,232,176,0.9)', 9, 'center', 700); }
  }
  // holding stacks: a lap round each fix, and its levels
  if (z > 0.02 && N.arr) for (const id in N.arr) {
    const ap = S.byId[id]; if (!ap) continue;
    for (const st of IC.atcStacks(S, ap)) {
      if (!inView(view, st.x, st.y, 200)) continue;
      ctx.strokeStyle = 'rgba(242,209,74,0.7)'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([4 * px, 4 * px]);
      ctx.beginPath(); ctx.arc(st.x, st.y, IC.ASP.holdR, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (labels) {
        const lo = IC.atcStackLevel(0), hi = IC.atcStackLevel(st.lv.length - 1);
        text(ctx, `${st.k} STACK ${lvl(lo)}${st.lv.length > 1 ? '–' + lvl(hi) : ''} · ${st.lv.length}`, st.x, st.y + IC.ASP.holdR + 14 * px, px, 'rgba(242,209,74,0.95)', 9, 'center', 700);
      }
    }
  }
  // area sectors: their names at their centres when there is more than one
  const acc = (N.secs || []).filter(s => s.kind === 'acc');
  if (labels && acc.length > 1 && z < 0.12) for (const s of acc) text(ctx, `${s.name.toUpperCase()} · ${Math.round(s.work * 100)}%`, s.x, s.y, px, s.work > 1 ? 'rgba(255,160,110,0.8)' : 'rgba(160,200,255,0.6)', 10, 'center', 700);
};

/* several things over one point at different heights: a ladder beside them, highest at the top */
IC.drawHeightLadders = function (ctx, S, px, view) {
  const z = IC.cam.z; if (z < 0.004) return;
  const cell = 16 / z, bins = new Map();
  const add = (o, name, col) => {
    if (!inView(view, o.x, o.y, 20 * px)) return;
    const k = Math.floor(o.x / cell) * 65536 + Math.floor(o.y / cell);
    let b = bins.get(k); if (!b) bins.set(k, b = []);
    if (b.length < 8) b.push({ o, name, col });
  };
  for (const t of S.threats) if (t.det && !t.dead && t.altKnown) add(t, t.d.civil && (t.aff === 'N' || t.aff === 'A') ? t.cs : t.aff === 'H' ? `${t.tn} ${t.d.code}` : `${t.tn}`, t.aff === 'H' ? '255,120,100' : t.aff === 'N' || t.aff === 'A' ? '127,232,176' : '242,209,74');
  for (const a of S.air) if (!a.dead && !a.gnd) add(a, a.name, '111,210,255');
  for (const m of S.missiles) if (!m.dead && m.alt != null) add(m, m.M.short || m.mun, '180,220,255');
  for (const b of bins.values()) {
    if (b.length < 2) continue;
    b.sort((p, q) => (q.o.alt || 0) - (p.o.alt || 0));
    if ((b[0].o.alt || 0) - (b[b.length - 1].o.alt || 0) < 0.25) continue;
    let cx = 0, cy = 0; for (const e of b) { cx += e.o.x; cy += e.o.y; } cx /= b.length; cy /= b.length;
    const x = cx - 26 * px, h = 12 * px, y0 = cy - (b.length - 1) * h / 2;
    ctx.strokeStyle = 'rgba(200,220,235,0.55)'; ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.moveTo(x, y0 - 4 * px); ctx.lineTo(x, y0 + (b.length - 1) * h + 4 * px); ctx.stroke();
    b.forEach((e, i) => {
      const y = y0 + i * h;
      ctx.fillStyle = `rgb(${e.col})`; ctx.beginPath(); ctx.arc(x, y, 2.2 * px, 0, 7); ctx.fill();
      text(ctx, `${IC.altText(e.o)} ${e.name}`, x - 5 * px, y + 3 * px, px, `rgb(${e.col})`, 8.5, 'right', 600);
    });
    ctx.strokeStyle = 'rgba(200,220,235,0.25)'; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(cx, cy); ctx.stroke();
  }
};

})(window.IC);
