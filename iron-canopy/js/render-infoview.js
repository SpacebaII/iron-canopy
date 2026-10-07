/* Iron Canopy — the build bar's info views (brief 44): overlays that dim the rest of the map and show one thing about
   the airport being built on: where aircraft wait on the taxiways, how busy each stand is, how far passengers walk,
   what the fuel, hydrant and fire services reach, who hears the runways, and what each runway can take. They read
   the simulation; nothing here changes it. */
(function (IC) {
'use strict';
const U = IC.U;
const heat = (f, a) => { f = U.clamp(f, 0, 1); const r = f < 0.5 ? 80 + f * 2 * 175 : 255, g = f < 0.5 ? 220 : 220 - (f - 0.5) * 2 * 170; return `rgba(${r | 0},${g | 0},70,${a == null ? 0.95 : a})`; };


IC.drawInfoView = function (g, S, px, now) {
  const v = IC.bb && IC.bb.view, ap = v && IC.bbAirport && IC.bbAirport(S);
  if (!v || !ap || !ap.parts) return;
  const V = IC.rs.view, H = IC.infoGather(S, ap), G = IC.aptGraph(ap);
  // everything else dims
  g.fillStyle = 'rgba(3,8,14,0.62)'; g.fillRect(V.x0, V.y0, V.x1 - V.x0, V.y1 - V.y0);
  // the pavement as a pale outline, so the view has a map
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(200,214,226,0.22)';
  for (const p of ap.parts) if (p.kind === 'taxi' && p.built) { g.lineWidth = Math.max(p.w, 2 * px); g.beginPath(); p.nodes.forEach((id, i) => { const n = ap.nodes[id]; if (n) g[i ? 'lineTo' : 'moveTo'](n.x, n.y); }); g.stroke(); }
  for (const p of ap.parts) if (p.kind === 'runway' && p.built) { g.lineWidth = Math.max(p.w, 3 * px); g.lineCap = 'butt'; g.beginPath(); g.moveTo(p.a.x, p.a.y); g.lineTo(p.b.x, p.b.y); g.stroke(); g.lineCap = 'round'; }
  g.fillStyle = 'rgba(200,214,226,0.12)';
  for (const p of ap.parts) if ((p.kind === 'apron' || p.kind === 'terminal' || p.kind === 'cargo') && p.built) { const P = IC.partOutline(p); g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); g.fill(); }
  const legend = [];
  if (v === 'taxi') {
    let max = 60; for (const x of H.e.values()) max = Math.max(max, x);
    for (const [, L] of G.adj) for (const e of L) {
      if (e.kind !== 'taxi') continue;
      const a = G.N.get(e.from), b = G.N.get(e.to); if (!a || !b) continue;
      const h = (H.e.get(e.key) || 0) + (H.e.get(G.adj.get(e.to) && (G.adj.get(e.to).find(r => r.to === e.from) || {}).key) || 0);
      g.strokeStyle = h < 1 ? 'rgba(110,200,140,0.55)' : heat(Math.sqrt(h / max)); g.lineWidth = Math.max(0.12, 4 * px);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    const wait = ap.moves.filter(m => !m.dead && m.holding).length;
    legend.push(['Taxi congestion', `while this view is open · ${wait} waiting now · average taxi ${U.dur((ap.kpi && ap.kpi.taxi) || 0)}`], [heat(0), 'little'], [heat(0.5), 'busy'], [heat(1), 'aircraft queue here']);
  } else if (v === 'stands') {
    let max = 1; for (const x of H.s.values()) max = Math.max(max, x);
    let n = 0, used = 0;
    for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
      const f = (H.s.get(s.id) || 0) / max; n++; if (s.occ) used++;
      const S0 = IC.STAND[s.size] || IC.STAND.m;
      g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.fillStyle = s.linked === false ? 'rgba(255,91,79,0.6)' : heat(f, 0.75); g.fillRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.restore();
      if (IC.cam.z > 26) label(g, `${IC.standName(s)} ${IC.RAMP_SIZE[s.size] ? IC.RAMP_SIZE[s.size][0].toUpperCase() : ''}`, s.x, s.y, px);
    }
    legend.push(['Stand use', `${used} of ${n} stands in use now · shaded by use while this view is open`], [heat(0), 'hardly used'], [heat(0.5), 'half the time'], [heat(1), 'always full'], ['rgba(255,91,79,0.8)', 'no taxiway reaches it']);
  } else if (v === 'walk') {
    const terms = ap.parts.filter(p => (p.kind === 'terminal') && p.built);
    let far = 0;
    for (const p of ap.parts) if (p.kind === 'apron' && p.built && IC.partZone(ap, p) === 'civil') for (const s of p.stands || []) {
      let best = null, bd = 1e9; for (const t of terms) { const d = IC.partDist(ap, t, s); if (d < bd) { bd = d; best = t; } }
      const m = s.contact ? 0 : bd * 100, f = s.contact ? 0 : U.clamp(m / 600, 0.15, 1);
      if (m > 400) far++;
      const S0 = IC.STAND[s.size] || IC.STAND.m;
      g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.fillStyle = heat(f, 0.75); g.fillRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w); g.restore();
      if (best && !s.contact) { g.strokeStyle = heat(f, 0.6); g.lineWidth = Math.max(0.01, 1.2 * px); g.setLineDash([4 * px, 3 * px]); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(best.x, best.y); g.stroke(); g.setLineDash([]); }
      if (IC.cam.z > 22) label(g, s.contact ? 'gate' : m > 400 ? `bus ${Math.round(m)} m` : `${Math.round(m)} m`, s.x, s.y, px);
    }
    legend.push(['Walking to gates', `${far} stands need a bus (over 400 m)`], [heat(0), 'a gate: a jet bridge'], [heat(0.5), 'a walk'], [heat(1), 'a bus ride']);
  } else if (v === 'service') {
    const ring = (c, r, col, fill, dash) => { g.beginPath(); g.arc(c.x, c.y, r, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = col; g.lineWidth = Math.max(0.01, 1.5 * px); if (dash) g.setLineDash([6 * px, 4 * px]); g.stroke(); g.setLineDash([]); };
    for (const p of ap.parts) if (p.built && p.kind === 'fire') ring(p, (180 - 60) * 0.25, 'rgba(255,120,90,0.9)', 'rgba(255,120,90,0.08)');
    for (const p of ap.parts) if (p.built && p.kind === 'hydrant') ring(p, IC.APART.hydrant.reach, 'rgba(90,170,255,0.9)', 'rgba(90,170,255,0.1)');
    for (const p of ap.parts) if (p.built && p.kind === 'fuel') ring(p, 1.6, 'rgba(242,180,65,0.9)', 'rgba(242,180,65,0.12)', true);
    for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
      const hyd = s.svc && s.svc.fuel === 'hydrant' || ap.parts.some(h => h.kind === 'hydrant' && h.built && U.dist(h, s) < IC.APART.hydrant.reach);
      g.fillStyle = hyd ? 'rgba(90,170,255,0.9)' : 'rgba(200,200,200,0.7)'; g.beginPath(); g.arc(s.x, s.y, Math.max(0.05, 3 * px), 0, 7); g.fill();
    }
    const st = ap.st || {};
    legend.push(['Fuel and services', `fire trucks reach every runway in ${U.dur(st.rescue || 0)} (three minutes is the standard)`], ['rgba(255,120,90,0.9)', 'the fire station\'s three minutes'], ['rgba(90,170,255,0.9)', 'hydrant pipes: stands fuelled without trucks'], ['rgba(242,180,65,0.9)', 'a burning tank sets fire to what is inside this']);
  } else if (v === 'noise') {
    const towns = {};
    for (const rw of ap.parts) if (rw.kind === 'runway' && rw.built) {
      const c = IC.rwAt(rw, 0.5), a = Math.atan2(rw.b.y - rw.a.y, rw.b.x - rw.a.x), L = IC.rwLen(rw), d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -d.y, y: d.x };
      // the footprint: 8 km out beyond each end, widening from 6 km wide at the runway to 30 km
      const half = lx => 15 * (0.4 + 0.6 * Math.min(1, Math.abs(lx) / 60)), P = [];
      for (let lx = -L / 2 - 80; lx <= L / 2 + 80; lx += 10) P.push({ x: c.x + d.x * lx + n.x * half(lx), y: c.y + d.y * lx + n.y * half(lx) });
      for (let lx = L / 2 + 80; lx >= -L / 2 - 80; lx -= 10) P.push({ x: c.x + d.x * lx - n.x * half(lx), y: c.y + d.y * lx - n.y * half(lx) });
      g.beginPath(); P.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath(); g.fillStyle = 'rgba(255,150,60,0.12)'; g.fill(); g.strokeStyle = 'rgba(255,150,60,0.6)'; g.lineWidth = 1.5 * px; g.stroke();
      const hit = IC.noiseOver(S, c.x, c.y, a, L);
      for (const [k, x] of Object.entries(hit)) towns[k] = Math.max(towns[k] || 0, x);
      // the homes in it
      for (const town of IC.cities(S).concat((S.world.villages || []).filter(q => q.home))) {
        if (!hit[town.name]) continue;
        g.fillStyle = 'rgba(255,91,79,0.75)';
        for (const b of town.blocks || []) { if (b.hp <= 0) continue; const dx = b.x - c.x, dy = b.y - c.y, lx = dx * d.x + dy * d.y, ly = -dx * d.y + dy * d.x; if (Math.abs(lx) < L / 2 + 80 && Math.abs(ly) < half(lx)) g.fillRect(b.x - (b.w || 0.5) / 2, b.y - (b.h || 0.5) / 2, b.w || 0.5, b.h || 0.5); }
        label(g, `${town.name}: ${hit[town.name]} blocks`, town.x, town.y, px, 'rgba(255,190,170,0.95)');
      }
    }
    const tot = Object.values(towns).reduce((a, b) => a + b, 0);
    legend.push(['Noise over towns', tot ? `${tot} city blocks under the flight paths: every new runway there angers them` : 'no town under the flight paths'], ['rgba(255,150,60,0.8)', 'under the flight paths'], ['rgba(255,91,79,0.8)', 'homes that hear it']);
  } else if (v === 'capacity') {
    const st = ap.st && ap.st.rwy ? ap.st : IC.aptStats(S, ap);
    const flown = {}; for (const x of ap.mvLog || []) if (S.time - (x.t || 0) < 3600) flown[x.rw] = (flown[x.rw] || 0) + 1;
    for (const r of st.rwy || []) {
      const rw = ap.parts.find(p => p.id === r.id); if (!rw) continue;
      const c = IC.rwAt(rw, 0.5), cap = r.perHour || 0, used = flown[r.id] || 0, f = cap ? used / cap : 0;
      g.strokeStyle = r.role === 'spare' ? 'rgba(160,170,180,0.6)' : heat(f); g.lineWidth = Math.max(rw.w, 6 * px); g.lineCap = 'butt';
      g.beginPath(); g.moveTo(rw.a.x, rw.a.y); g.lineTo(rw.b.x, rw.b.y); g.stroke(); g.lineCap = 'round';
      label(g, `${r.end} ${({ arr: 'arrivals', dep: 'departures', mixed: 'arrivals and departures', spare: 'not in use' })[r.role] || ''} · ${cap}/h${used ? ` · ${used} last hour` : ''}`, c.x, c.y, px, '#fff');
    }
    legend.push(['Runway capacity', `${st.arrPerHour || 0} arrivals and ${st.depPerHour || 0} departures an hour in this wind`], [heat(0), 'room to spare'], [heat(0.6), 'busy'], [heat(1), 'at capacity']);
  }
  drawLegend(g, legend);
};
function label(g, t, x, y, px, col) {
  g.font = `600 ${10 * px}px "IBM Plex Mono", monospace`; g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(t, x + px, y + px + 3 * px); g.fillStyle = col || 'rgba(236,240,244,0.95)'; g.fillText(t, x, y + 3 * px); g.textAlign = 'left';
}
/* the legend: a card at the top of the map, in screen pixels */
function drawLegend(g, L) {
  if (!L.length) return;
  const dpr = IC.dpr ? IC.dpr() : 1, T = g.getTransform();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = '700 15px "Saira Condensed", sans-serif';
  const hw = g.measureText(L[0][0].toUpperCase()).width + 10;
  g.font = '500 12px "IBM Plex Sans Condensed", sans-serif';
  const w1 = g.measureText(L[0][1]).width + hw + 30, w2 = L.slice(1).reduce((a, q) => a + g.measureText(q[1]).width + 33, 14);
  const w = Math.min(IC.cam.vw - 40, Math.max(w1, w2)), x = (IC.cam.vw - w) / 2, y = 150, h = 50;
  g.fillStyle = 'rgba(4,10,15,0.92)'; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 12); else g.rect(x, y, w, h); g.fill();
  g.font = '700 15px "Saira Condensed", sans-serif'; g.fillStyle = '#e8f0f5'; g.fillText(L[0][0].toUpperCase(), x + 14, y + 20);
  g.font = '500 12px "IBM Plex Sans Condensed", sans-serif'; g.fillStyle = '#9ab0bf'; g.fillText(L[0][1], x + 14 + hw, y + 20);
  let cx = x + 14;
  for (const [col, t] of L.slice(1)) { g.fillStyle = col; g.fillRect(cx, y + 31, 12, 10); g.fillStyle = '#c8d6e0'; g.fillText(t, cx + 17, y + 40); cx += 17 + g.measureText(t).width + 16; }
  g.setTransform(T);
}
})(window.IC);
