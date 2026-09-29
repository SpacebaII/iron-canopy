/* Iron Canopy — the airspace on the map, drawn as a chart does: class B solid blue, C solid magenta, D dashed blue,
   E dashed magenta, restricted and military areas hatched; each ring labelled with its ceiling over its floor; the
   notch and the approach extension; the editing handles while the Airspace tab is open; military height bands, the holding stacks with their levels,
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

/* how a chart draws each class: B solid, C solid magenta, D dashed, E dashed magenta; areas hatched */
const STY = { B: 'solid', C: 'solid', D: 'dash', E: 'dash', A: 'solid', G: 'dash', R: 'hatch', Q: 'hatch', X: 'hatch' };
function ringPath(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function stroke(ctx, cls, px, hot, fade) {
  const C = IC.ASP_CLS[cls], sty = STY[cls] || 'solid', a = (hot ? 0.95 : 0.6) * (fade || 1);
  ctx.strokeStyle = `rgba(${C.col},${a})`; ctx.lineWidth = (hot ? 2.4 : 1.7) * px;
  if (sty === 'dash') ctx.setLineDash([8 * px, 5 * px]);
  ctx.stroke(); ctx.setLineDash([]);
}
/* the ticks of a hatched border, just inside a circle */
function hatch(ctx, x, y, r, cls, px, hot) {
  const C = IC.ASP_CLS[cls], k = 5 * px;
  if (r <= k) return;
  ctx.save(); ctx.strokeStyle = `rgba(${C.col},${hot ? 0.8 : 0.5})`; ctx.lineWidth = k * 2; ctx.setLineDash([1.6 * px, 5 * px]);
  ringPath(ctx, x, y, r - k); ctx.stroke(); ctx.restore();
}
/* a chart label: ceiling over floor, with a bar between */
function chartLabel(ctx, v, x, y, px, col, big) {
  const hi = IC.aspChart(v.hi), lo = IC.aspChart(v.lo), sz = big ? 11 : 9.5;
  ctx.font = `700 ${sz * px}px "IBM Plex Mono", monospace`;
  const w = Math.max(ctx.measureText(hi).width, ctx.measureText(lo).width) + 4 * px;
  ctx.fillStyle = 'rgba(6,14,22,0.55)'; ctx.fillRect(x - w / 2 - 2 * px, y - sz * 1.25 * px, w + 4 * px, sz * 2.5 * px);
  text(ctx, hi, x, y - 2.5 * px, px, col, sz, 'center', 700);
  text(ctx, lo, x, y + sz * px, px, col, sz, 'center', 700);
  ctx.strokeStyle = col; ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.stroke();
}
/* the outline of the approach extension: both arms, from where they leave the core */
function extPath(ctx, v) {
  const c = Math.cos(v.rot), s = Math.sin(v.rot), w = v.ext.w, L = v.r1 + v.ext.len, a0 = Math.sqrt(Math.max(0, v.r1 * v.r1 - w * w));
  const P = (al, cr) => [v.x + al * c - cr * s, v.y + al * s + cr * c];
  ctx.beginPath();
  for (const k of [1, -1]) { ctx.moveTo(...P(k * a0, -w)); ctx.lineTo(...P(k * L, -w)); ctx.lineTo(...P(k * L, w)); ctx.lineTo(...P(k * a0, w)); }
}
IC.drawAirspace = function (ctx, S, px, view, labels, vols) {
  const N = S.asp; if (!N || !N.vols) return;
  const z = IC.cam.z, sel = S.sel, selAp = sel && sel.kind === 'infra' && sel.ref.parts ? sel.ref : sel && sel.kind === 'apart' ? sel.ap : null;
  const edit = IC.ui && IC.ui.aspVol, m = S.mode2, tab = IC.ui && IC.ui.aptTab === 'asp' && selAp && selAp.owner === 'us' && sel.kind === 'infra';
  const editing = tab ? new Set(IC.aspShapesNear(S, selAp).map(s => s.id)) : null;
  if (vols !== false && N.shapes) for (const sh of N.shapes) {
    const o = sh.rings[sh.rings.length - 1].r, reach = o + (sh.ext ? sh.ext.len + sh.ext.w : 0);
    if (!inView(view, sh.x, sh.y, reach) || o * z < 3) continue;
    const hotSh = (selAp && sh.ap === selAp.id) || (editing && editing.has(sh.id)), V = N.vols.filter(v => v.sh === sh.id);
    // a light tint of the whole shape; a stronger one on the ring picked in the tab
    for (const v of V) {
      if (v.kind === 'ext') continue;
      const C = IC.ASP_CLS[v.cls], mil = v.kind === 'mil';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.r1, 0, 7); if (v.r0 > 0) ctx.arc(v.x, v.y, v.r0, 7, 0, true);
      ctx.fillStyle = `rgba(${C.col},${edit === v.id ? 0.12 : mil ? 0.06 : hotSh ? 0.05 : 0.025})`; ctx.fill('evenodd');
    }
    for (const v of V) {
      const C = IC.ASP_CLS[v.cls], hot = hotSh || edit === v.id, grab = IC.ui && IC.ui.aspEdge === v.id;
      if (v.kind === 'ext') {
        extPath(ctx, v); stroke(ctx, 'E', px, hot || edit === v.id);
        if (edit === v.id) { ctx.strokeStyle = `rgba(${C.col},0.25)`; ctx.lineWidth = 6 * px; ctx.stroke(); }
        continue;
      }
      ringPath(ctx, v.x, v.y, v.r1); stroke(ctx, v.cls, px, hot);
      if (STY[v.cls] === 'hatch') hatch(ctx, v.x, v.y, v.r1, v.cls, px, hot);
      if (grab) { ctx.lineWidth = 5 * px; ctx.strokeStyle = `rgba(${C.col},0.5)`; ringPath(ctx, v.x, v.y, v.r1); ctx.stroke(); }
    }
    // the notch: its sides and inner edge, where the floor steps up
    const n = sh.notch;
    if (n) {
      const C = IC.ASP_CLS[sh.rings[0].cls], a0 = sh.rot + n.a - n.w, a1 = sh.rot + n.a + n.w;
      ctx.beginPath();
      for (const a of [a0, a1]) { ctx.moveTo(sh.x + Math.cos(a) * n.r, sh.y + Math.sin(a) * n.r); ctx.lineTo(sh.x + Math.cos(a) * o, sh.y + Math.sin(a) * o); }
      ctx.moveTo(sh.x + Math.cos(a0) * n.r, sh.y + Math.sin(a0) * n.r); ctx.arc(sh.x, sh.y, n.r, a0, a1);
      ctx.strokeStyle = `rgba(${C.col},${hotSh ? 0.9 : 0.55})`; ctx.lineWidth = 1.4 * px; ctx.setLineDash([3 * px, 3 * px]); ctx.stroke(); ctx.setLineDash([]);
    }
    // ceiling over floor in each ring, on a line square to the runway (away from it), as a chart prints them
    if (labels && (hotSh || z > 0.04)) {
      const la = sh.ap ? sh.rot + Math.PI / 2 : -Math.PI / 2;
      for (const v of V) {
        if (v.kind === 'ext') continue;
        const r = v.r0 ? (v.r0 + v.r1) / 2 : v.r1 * (V.length > 1 ? 0.55 : 0.6), band = (v.r1 - v.r0) * z;
        if (band < 26 && !hotSh) continue;
        chartLabel(ctx, v, v.x + Math.cos(la) * r, v.y + Math.sin(la) * r, px, `rgba(${IC.ASP_CLS[v.cls].col},${hotSh ? 1 : 0.85})`, hotSh);
      }
      if (n && (o - n.r) * z > 30) {
        const a = sh.rot + n.a, r = (Math.max(n.r, sh.rings[0].r * 0.4) + o) / 2, top = V.filter(v => v.kind !== 'ext').reduce((p, q) => q.hi > p ? q.hi : p, 0);
        const lab = { hi: top, lo: n.lo };
        if (n.lo >= top) text(ctx, 'NOTCH', sh.x + Math.cos(a) * r, sh.y + Math.sin(a) * r, px, `rgba(${IC.ASP_CLS[sh.rings[0].cls].col},0.9)`, 9, 'center', 700);
        else chartLabel(ctx, lab, sh.x + Math.cos(a) * r, sh.y + Math.sin(a) * r, px, `rgba(${IC.ASP_CLS[sh.rings[0].cls].col},0.95)`, false);
      }
      if (!sh.ap && o * z > 80) text(ctx, sh.name.toUpperCase(), sh.x, sh.y + 4 * px, px, `rgba(${IC.ASP_CLS[sh.rings[0].cls].col},0.75)`, 9, 'center', 600);
    }
    // the handles, while the Airspace tab edits this shape
    if (editing && editing.has(sh.id)) for (const h of IC.aspHandles(S, sh)) {
      const on = IC.ui.aspEdge === h.id, k = (on ? 7 : 5.5) * px;
      ctx.fillStyle = on ? '#ffffff' : 'rgba(235,245,255,0.92)'; ctx.strokeStyle = 'rgba(6,14,22,0.9)'; ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      if (h.hk === 'scale') ctx.rect(h.hx - k, h.hy - k, 2 * k, 2 * k);
      else if (h.hk === 'ring') ctx.arc(h.hx, h.hy, k, 0, 7);
      else if (h.hk === 'notch') { ctx.moveTo(h.hx, h.hy - k * 1.3); ctx.lineTo(h.hx + k * 1.3, h.hy); ctx.lineTo(h.hx, h.hy + k * 1.3); ctx.lineTo(h.hx - k * 1.3, h.hy); ctx.closePath(); }
      else { const a = sh.rot + h.flip; ctx.moveTo(h.hx + Math.cos(a) * k * 1.5, h.hy + Math.sin(a) * k * 1.5); ctx.lineTo(h.hx + Math.cos(a + 2.4) * k * 1.3, h.hy + Math.sin(a + 2.4) * k * 1.3); ctx.lineTo(h.hx + Math.cos(a - 2.4) * k * 1.3, h.hy + Math.sin(a - 2.4) * k * 1.3); ctx.closePath(); }
      ctx.fill(); ctx.stroke();
      if (on && labels) text(ctx, h.hk === 'scale' ? `${Math.round(h.r1 / 10)} km` : h.hk === 'ring' ? `${h.name} ${Math.round(h.r1 / 10)} km` : h.hk === 'notch' ? `notch from ${Math.round(h.r1 / 10)} km` : `extension ${Math.round((h.r1 - sh.rings[0].r) / 10)} km`, h.hx, h.hy - 12 * px, px, '#ffffff', 10, 'center', 700);
    }
  }
  // in the tab, the ring under the pointer in plain words, like a chart's legend
  if (editing && S.hover && labels && !(IC.ui && IC.ui.aspEdge)) {
    const v = IC.aspVolUnder(S, selAp, S.hover);
    if (v) {
      const C = IC.ASP_CLS[v.cls], lo = IC.aspFloorAt(v, S.hover.x, S.hover.y);
      text(ctx, `${v.kind === 'ext' ? 'Approach extension' : v.name} · ${C.name} · ${lo <= 0.01 ? 'the ground' : IC.flText(lo)} to ${IC.flText(v.hi)}`, S.hover.x + 14 * px, S.hover.y - 16 * px, px, `rgb(${C.col})`, 10, 'left', 700);
      text(ctx, C.brief, S.hover.x + 14 * px, S.hover.y - 3 * px, px, 'rgba(225,235,245,0.9)', 9.5, 'left', 600);
    }
  }
  // placing an area on the map: the circle the next click makes
  if (m && m.kind === 'asp' && m.op === 'area' && m.c && S.hover) {
    const r = U.dist(m.c, S.hover), cls = (IC.ASP_SHAPES[m.key] || {}).cls || 'X', col = IC.ASP_CLS[cls].col;
    ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 2 * px; ctx.strokeStyle = `rgba(${col},0.9)`;
    ctx.beginPath(); ctx.arc(m.c.x, m.c.y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, `${Math.round(r / 10)} km`, S.hover.x, S.hover.y - 12 * px, px, `rgb(${col})`, 10, 'center', 700);
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
