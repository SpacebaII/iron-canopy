/* Iron Canopy — the side view: a vertical slice through the map along a line, showing what flies above what.
   For a track the line runs along its path; for an airport, across it (turnable). It shows the ground, the lowest
   height radar sees, each airport's airspace as blocks (the wedding cake), military bands, holding stacks, and every
   flight, weapon and interceptor near the line at its height, interceptors with the arc they flew. In an airport's
   side view the floors and ceilings can be dragged. Also here: the reach chart for a unit's missiles, and the
   airport Airspace tab's and the radio's orders (IC.aspAct, IC.atcAct, IC.aspMapClick). */
(function (IC) {
'use strict';
const U = IC.U;
const esc = s => U.esc ? U.esc(s) : String(s);
const SV = IC.side = { open: false, what: null, S: null, drag: null, ang: 0 };
const lvl = a => IC.lvlShort ? IC.lvlShort(a) : IC.flText(a);

/* the slice: centre, direction, half-length (units), corridor half-width (units), height shown (km) */
function slice(S, w) {
  const r = w.ref;
  if (w.kind === 'base') {
    const out = Math.max(300, IC.aspOuter(S, r)) * 1.15;
    return { x: r.x, y: r.y, a: SV.ang, L: out, W: 300, H: Math.max(5, IC.aspTop(S, r) * 1.35), title: `${r.name} · airspace from the side` };
  }
  if (r.d && (r.d.move === 'bal' || r.d.move === 'hgv') && r.x0 != null) {
    const L = U.dxy(r.x0, r.y0, r.x1, r.y1) / 2 + 100;
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, a: Math.atan2(r.y1 - r.y0, r.x1 - r.x0), L, W: 400, H: Math.max(20, (r.apex || r.alt) * 1.25), title: `TN ${r.tn || ''} · its arc from launch to impact` };
  }
  const a = Math.atan2(r.vy || 0, r.vx || 1), L = 900;
  let H = 6; for (const t of S.threats) if (t.det && U.dist(t, r) < L) H = Math.max(H, t.alt * 1.2 + 1);
  return { x: r.x, y: r.y, a, L, W: 250, H: Math.min(Math.max(H, r.alt * 1.4 + 1), 60), title: `${r.cs || 'TN ' + (r.tn || '')} · what flies above and below it` };
}
/* where a map point falls on the slice: s along it (units), off to the side */
const proj = (P, x, y) => { const c = Math.cos(P.a), s = Math.sin(P.a), dx = x - P.x, dy = y - P.y; return { s: dx * c + dy * s, off: -dx * s + dy * c }; };
const at = (P, s) => ({ x: P.x + Math.cos(P.a) * s, y: P.y + Math.sin(P.a) * s });

/* where each flight near the slice has been, sampled every 4 game seconds while the panel is open */
const hist = new WeakMap();
function remember(S) {
  for (const o of S.threats.concat(S.air)) {
    if (o.dead) continue;
    let h = hist.get(o); if (!h) hist.set(o, h = []);
    const last = h[h.length - 1];
    if (!last || S.time - last.t >= 4) { h.push({ x: o.x, y: o.y, alt: o.alt || 0, t: S.time }); if (h.length > 45) h.shift(); }
  }
}
/* draw the slice on a canvas */
IC.drawSide = function (cv, S, w) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, P = slice(S, w);
  const ml = 44, mr = 10, mt = 8, mb = 22, pw = W - ml - mr, ph = H - mt - mb;
  const X = s => ml + (s + P.L) / (2 * P.L) * pw, Y = a => mt + ph - U.clamp(a / P.H, 0, 1.02) * ph;
  P.X = X; P.Y = Y; P.ml = ml; P.mt = mt; P.pw = pw; P.ph = ph; w.P = P;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(6,14,22,0.92)'; g.fillRect(0, 0, W, H);
  g.font = '600 10px "IBM Plex Mono", monospace';
  // height grid: flight levels for airspace up to 15 km, km above that
  // flight levels for airspace heights, km for weapons that fly higher
  const step = P.H > 30 ? 10 : P.H > 16 ? 2 : P.H > 6 ? IC.flKm(50) : IC.flKm(20);
  for (let a = 0; a <= P.H + 1e-6; a += step) {
    g.strokeStyle = 'rgba(160,190,210,0.10)'; g.beginPath(); g.moveTo(ml, Y(a)); g.lineTo(W - mr, Y(a)); g.stroke();
    g.fillStyle = 'rgba(160,190,210,0.6)'; g.textAlign = 'right'; g.fillText(P.H > 16 ? `${a} km` : a ? IC.flText(a).replace(' ft', '') : 'SFC', ml - 4, Y(a) + 3);
  }
  // distance along
  g.textAlign = 'center';
  for (let k = -4; k <= 4; k++) { const s = k * P.L / 4; g.fillStyle = 'rgba(160,190,210,0.5)'; g.fillText(`${Math.round(Math.abs(s) / 10)} km`, X(s), H - 6); }
  // airspace volumes cut by the line
  if (S.asp && S.asp.vols) for (const v of S.asp.vols) {
    const c = proj(P, v.x, v.y); if (Math.abs(c.off) >= v.r1) continue;
    const h1 = Math.sqrt(v.r1 * v.r1 - c.off * c.off), h0 = Math.abs(c.off) < v.r0 ? Math.sqrt(v.r0 * v.r0 - c.off * c.off) : 0;
    const C = IC.ASP_CLS[v.cls], hot = IC.ui && IC.ui.aspVol === v.id;
    const segs = h0 ? [[c.s - h1, c.s - h0], [c.s + h0, c.s + h1]] : [[c.s - h1, c.s + h1]];
    for (const [s0, s1] of segs) {
      if (s1 < -P.L || s0 > P.L) continue;
      const x0 = X(Math.max(-P.L, s0)), x1 = X(Math.min(P.L, s1)), y0 = Y(v.hi), y1 = Y(v.lo);
      g.fillStyle = `rgba(${C.col},${hot ? 0.24 : 0.13})`; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = `rgba(${C.col},${hot ? 1 : 0.7})`; g.lineWidth = hot ? 2 : 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      if (x1 - x0 > 34) { g.fillStyle = `rgb(${C.col})`; g.textAlign = 'center'; g.fillText(v.kind === 'mil' ? (v.cls === 'X' ? 'ADZ' : v.cls) : v.cls, (x0 + x1) / 2, Math.min(y1 - 4, y0 + 13)); }
    }
  }
  // the ground (heights are above it) and the lowest height radar sees: hills leave holes behind them
  const n = 90;
  g.fillStyle = 'rgba(70,82,60,0.75)'; g.fillRect(ml, Y(0), pw, 3);
  if (S.asp) {
    g.setLineDash([4, 3]); g.strokeStyle = 'rgba(111,210,255,0.55)'; g.lineWidth = 1.2; g.beginPath(); let on = false;
    for (let i = 0; i <= n; i++) { const s = -P.L + 2 * P.L * i / n, p = at(P, s), c = IC.aspCovAlt(S, p.x, p.y); if (c === Infinity || c > P.H) { on = false; continue; } if (on) g.lineTo(X(s), Y(c)); else { g.moveTo(X(s), Y(c)); on = true; } }
    g.stroke(); g.setLineDash([]);
  }
  // holding stacks: one line per level
  if (S.asp && S.asp.arr) for (const id in S.asp.arr) { const ap = S.byId[id]; if (!ap) continue; for (const st of IC.atcStacks(S, ap)) { const c = proj(P, st.x, st.y); if (Math.abs(c.off) > P.W || Math.abs(c.s) > P.L) continue; st.lv.forEach((t, i) => { const y = Y(IC.atcStackLevel(i)); g.strokeStyle = 'rgba(242,209,74,0.6)'; g.beginPath(); g.moveTo(X(c.s) - 14, y); g.lineTo(X(c.s) + 14, y); g.stroke(); }); g.fillStyle = 'rgba(242,209,74,0.9)'; g.textAlign = 'center'; g.fillText(`${st.k} stack`, X(c.s), Y(IC.atcStackLevel(st.lv.length)) - 2); } }
  // interceptors: the arc each has flown, and where it is now
  for (const m of S.missiles) {
    if (m.dead) continue;
    const c = proj(P, m.x, m.y); if (Math.abs(c.off) > P.W * 2 || Math.abs(c.s) > P.L) continue;
    g.strokeStyle = 'rgba(180,220,255,0.75)'; g.lineWidth = 1.3; g.beginPath(); let first = true;
    for (const q of (m.tr && m.tr.pts) || []) { if (q.alt == null) continue; const e = proj(P, q.x, q.y); if (first) { g.moveTo(X(e.s), Y(q.alt)); first = false; } else g.lineTo(X(e.s), Y(q.alt)); }
    if (!first) { g.lineTo(X(c.s), Y(m.alt || 0)); g.stroke(); }
    g.fillStyle = '#d8eeff'; g.beginPath(); g.arc(X(c.s), Y(m.alt || 0), 2.5, 0, 7); g.fill();
    if (m.pip) { const e = proj(P, m.pip.x, m.pip.y); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.strokeRect(X(e.s) - 4, Y(m.pip.alt) - 4, 8, 8); }
  }
  // everything flying near the line
  const dots = [];
  for (const t of S.threats) if (t.det && !t.dead) dots.push([t, t.aff === 'H' ? '#ff7b6b' : t.aff === 'S' ? '#ffb05a' : t.d.civil && (t.aff === 'N' || t.aff === 'A') ? (t.type === 'ga' ? '#c9b0ff' : '#7fe8b0') : '#f2d14a', t.d.civil && (t.aff === 'N' || t.aff === 'A') ? t.cs : t.aff === 'H' ? t.d.code : `${t.tn}`]);
  for (const a of S.air) if (!a.dead && !a.gnd) dots.push([a, '#6fd2ff', a.name]);
  // labels step down out of each other's way
  const boxes = [];
  const place = (x, y, wd) => { let yy = y; for (let k = 0; k < 8 && boxes.some(b => x < b[0] + b[2] && x + wd > b[0] && Math.abs(yy - b[1]) < 11); k++) yy += 11; boxes.push([x, yy, wd]); return yy; };
  for (const [o, col, name] of dots) {
    const c = proj(P, o.x, o.y); if (Math.abs(c.off) > P.W || Math.abs(c.s) > P.L) continue;
    const x = X(c.s), y = Y(o.alt || 0), me = o === w.ref;
    // a track's recent path, so climbs and dives read as lines
    const hp = hist.get(o);
    if (hp && hp.length > 1) { g.strokeStyle = col; g.globalAlpha = 0.35; g.beginPath(); hp.forEach((q, i) => { const e = proj(P, q.x, q.y); g[i ? 'lineTo' : 'moveTo'](X(e.s), Y(q.alt)); }); g.lineTo(x, y); g.stroke(); g.globalAlpha = 1; }
    g.fillStyle = col; g.beginPath(); g.arc(x, y, me ? 4.5 : 3, 0, 7); g.fill();
    if (me) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
    const lab = `${name} ${IC.tagAlt ? IC.tagAlt(o) : IC.altText(o)}`, wd = g.measureText(lab).width, ly = place(x + 6, y - 4, wd);
    if (ly !== y - 4) { g.strokeStyle = col; g.globalAlpha = 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, ly - 3); g.stroke(); g.globalAlpha = 1; }
    g.textAlign = 'left'; g.fillStyle = col; g.fillText(lab, x + 6, ly);
  }
  g.textAlign = 'left'; g.fillStyle = 'rgba(200,215,225,0.8)'; g.fillText(w.kind === 'base' ? `looking ${U.compass(P.a + Math.PI / 2)} · dashed blue: lowest height radar sees` : 'dashed blue: lowest height radar sees', ml + 4, mt + 11);
  return P;
};

/* ---------- the floating panel ---------- */
let el = null, cv = null, raf = 0;
const CSS = `.sideview{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);width:min(760px,calc(100% - 32px));z-index:30;padding:.55rem .7rem .7rem;display:none}
.sideview.on{display:block}.sideview header{display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem}.sideview header b{flex:1;font-size:.95rem}
.sideview canvas{width:100%;height:auto;display:block;border-radius:8px;cursor:default}.sideview canvas.drag{cursor:ns-resize}
.sideview .x{min-width:2rem}.reach{width:100%;max-width:100%;height:auto;display:block;border-radius:8px;margin:.2rem 0}`;
if (typeof document !== 'undefined' && document.head) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
function build() {
  if (el) return;
  el = document.createElement('div'); el.className = 'sideview glass'; el.setAttribute('aria-label', 'Side view');
  el.innerHTML = `<header><b id="svT"></b><button class="act" data-sv="turn" title="Turn the slice 45°">Turn</button><button class="act x" data-sv="close" aria-label="Close" title="Close">✕</button></header><canvas width="740" height="260"></canvas><p class="hint" id="svH"></p>`;
  (document.querySelector('.app') || document.body).appendChild(el);
  cv = el.querySelector('canvas');
  el.addEventListener('click', e => { const b = e.target.closest('[data-sv]'); if (!b) return; if (b.dataset.sv === 'close') IC.sideClose(); else { SV.ang += Math.PI / 4; } });
  cv.addEventListener('mousedown', e => { const h = hit(e); if (h) { SV.drag = h; IC.ui.aspVol = h.v.id; e.preventDefault(); } });
  window.addEventListener('mousemove', e => {
    if (!SV.open || !SV.what || !SV.what.P) return;
    const h = SV.drag || hit(e); cv.classList.toggle('drag', !!h);
    if (!SV.drag) return;
    const P = SV.what.P, r = cv.getBoundingClientRect(), y = (e.clientY - r.top) * cv.height / r.height;
    const a = Math.max(0, (P.mt + P.ph - y) / P.ph * P.H), ft = Math.round(a * IC.FT / 500) * 500 / IC.FT;
    IC.aspSetVol(SV.S, SV.drag.v, { [SV.drag.k]: ft });
  });
  window.addEventListener('mouseup', () => { if (SV.drag) { const v = SV.drag.v; SV.drag = null; IC.ui && IC.ui.refresh && IC.ui.refresh(true); IC.log(SV.S, 'info', 'AIRSPACE', `${v.name}: ${IC.flText(v.lo)} to ${IC.flText(v.hi)}.`); } });
}
/* a floor or ceiling under the mouse (airport side view only) */
function hit(e) {
  const w = SV.what; if (!w || w.kind !== 'base' || !w.P) return null;
  const P = w.P, r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  const s = (x - P.ml) / P.pw * 2 * P.L - P.L;
  for (const v of IC.aspVols(SV.S, w.ref)) {
    const c = proj(P, v.x, v.y), d = Math.abs(s - c.s); if (Math.abs(c.off) >= v.r1) continue;
    const h1 = Math.sqrt(v.r1 * v.r1 - c.off * c.off), h0 = Math.abs(c.off) < v.r0 ? Math.sqrt(v.r0 * v.r0 - c.off * c.off) : 0;
    if (d > h1 || d < h0) continue;
    if (Math.abs(y - P.Y(v.hi)) < 5) return { v, k: 'hi' };
    if (v.lo > 0 && Math.abs(y - P.Y(v.lo)) < 5) return { v, k: 'lo' };
  }
  return null;
}
function loop() {
  raf = 0;
  if (!SV.open) return;
  const w = SV.what, S = SV.S;
  if (!w || !w.ref || w.ref.dead) { IC.sideClose(); return; }
  remember(S);
  IC.drawSide(cv, S, w);
  document.getElementById('svT').textContent = w.P.title;
  document.getElementById('svH').textContent = w.kind === 'base' ? 'Drag a block\'s top or bottom edge to set that ceiling or floor (500 ft steps). Arrivals come down about 1,000 ft every 5 km; they should stay inside the blocks.' : 'Each dot is at its height. Lines are the last minutes of each path; interceptors show the arc they flew.';
  raf = requestAnimationFrame(loop);
}
IC.sideOpen = function (S, kind, ref) {
  build(); SV.S = S; SV.what = { kind, ref }; SV.open = true; SV.ang = 0;
  el.classList.add('on'); el.querySelector('[data-sv="turn"]').style.display = kind === 'base' ? '' : 'none';
  if (!raf) raf = requestAnimationFrame(loop);
};
IC.sideClose = function () { SV.open = false; if (el) el.classList.remove('on'); };
IC.sideIsOpen = () => SV.open;

/* ---------- the reach chart in a unit's panel: how far and how high each of its missiles reaches ---------- */
IC.drawReachChart = function (cv2, muns) {
  const g = cv2.getContext('2d'), W = cv2.width, H = cv2.height, ml = 40, mb = 20, mt = 8, mr = 8;
  const rows = muns.map(m => IC.reachRows(m)), maxR = Math.max(10, ...rows.map(R => Math.max(...R.map(r => r[1])))), maxA = Math.max(4, ...rows.map(R => R[R.length - 1][0]));
  const X = r => ml + r / maxR * (W - ml - mr), Y = a => mt + (H - mt - mb) * (1 - a / maxA);
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(6,14,22,0.9)'; g.fillRect(0, 0, W, H);
  g.font = '600 10px "IBM Plex Mono", monospace';
  const cols = ['111,210,255', '127,232,176', '242,209,74', '255,150,120'];
  rows.forEach((R, i) => {
    g.beginPath(); g.moveTo(X(0), Y(R[0][0])); for (const [a, r] of R) g.lineTo(X(r), Y(a)); g.lineTo(X(0), Y(R[R.length - 1][0])); g.closePath();
    g.fillStyle = `rgba(${cols[i % 4]},0.18)`; g.fill(); g.strokeStyle = `rgba(${cols[i % 4]},0.9)`; g.lineWidth = 1.4; g.stroke();
    const m = R.reduce((p, q) => q[1] > p[1] ? q : p);
    g.fillStyle = `rgb(${cols[i % 4]})`; g.textAlign = 'right'; g.fillText(IC.MUN[muns[i]].short || muns[i], X(m[1]) - 6, Y(m[0]) + 14);
  });
  g.fillStyle = 'rgba(160,190,210,0.7)'; g.textAlign = 'right';
  for (const a of [0, maxA / 2, maxA]) g.fillText(`${+a.toFixed(1)} km`, ml - 4, Y(a) + 3);
  g.textAlign = 'center'; for (const r of [0, maxR / 2, maxR]) g.fillText(`${Math.round(r)} km`, X(r), H - 5);
  g.textAlign = 'right'; g.fillStyle = 'rgba(200,215,225,0.8)'; g.fillText('height ↑   distance →', W - mr - 4, mt + 10);
};

/* ---------- orders from the airport's Airspace tab ---------- */
IC.aspAct = function (S, ap, ds) {
  const ui = IC.ui, v = ds.id ? IC.aspVol(S, ds.id) : null, sec = ds.sec ? IC.aspSector(S, ds.sec) : null, n = +ds.v;
  switch (ds.op) {
    case 'preset': if (ap) { IC.aspPreset(S, ap, ds.v); ui.aspVol = null; IC.log(S, 'info', 'AIRSPACE', `${ap.name}: airspace set to the ${IC.ASP_PRESETS[ds.v].name.toLowerCase()} layout. ${IC.ASP_PRESETS[ds.v].words}`, ap); } break;
    case 'sel': ui.aspVol = ui.aspVol === ds.id ? null : ds.id; break;
    case 'cls': if (v) IC.aspSetVol(S, v, { cls: ds.v }); break;
    case 'lo': if (v) IC.aspSetVol(S, v, { lo: v.lo + n * 500 / IC.FT }); break;
    case 'hi': if (v) IC.aspSetVol(S, v, { hi: v.hi + n * 500 / IC.FT }); break;
    case 'r': if (v) IC.aspSetVol(S, v, { r1: v.r1 + n * 50 }); break;
    case 'del': if (v) { IC.aspDelVol(S, v); ui.aspVol = null; } break;
    case 'shelf': if (ap) ui.aspVol = IC.aspAddShelf(S, ap).id; break;
    case 'draw': if (v) { IC.setMode({ kind: 'asp', op: 'radius', vol: v.id }); return; } break;
    case 'mil': IC.setMode({ kind: 'asp', op: 'mil', cls: ds.v || 'X' }); return;
    case 'staff': if (sec) IC.aspSetStaff(S, sec, sec.staff + n); break;
    case 'space': if (sec) sec.rules.space = sec.rules.space > 1 ? 1 : 1.5; break;
    case 'depBelow': if (sec) sec.rules.depBelow = !sec.rules.depBelow; break;
    case 'lanes': if (sec) sec.rules.lanes = sec.rules.lanes === false; break;
    case 'stack': if (sec) sec.rules.stack = n; break;
    case 'side': if (ap) IC.sideOpen(S, 'base', ap); break;
    case 'sector': IC.setMode({ kind: 'asp', op: 'sector' }); return;
    case 'secDel': if (sec && !IC.aspDelSector(S, sec)) IC.sfx && IC.sfx.ui('err'); break;
  }
};
/* a click on the map in an airspace mode: a shelf's outer edge, a military area (centre, then edge), a sector */
IC.aspMapClick = function (S, m, p) {
  if (m.op === 'radius') { const v = IC.aspVol(S, m.vol); if (v) IC.aspSetVol(S, v, { r1: U.dist(v, p) }); IC.setMode(null); return; }
  if (m.op === 'sector') { IC.aspAddSector(S, p.x, p.y); IC.setMode(null); return; }
  if (m.op === 'mil') {
    if (!m.c) { m.c = { x: p.x, y: p.y }; return; }
    const v = IC.aspAddMil(S, m.c.x, m.c.y, Math.max(80, U.dist(m.c, p)), 0, IC.flKm(100), m.cls);
    IC.ui.aspVol = v.id; IC.setMode(null);
  }
};
IC.aspModeHint = m => m.op === 'radius' ? 'Click where the outer edge of the shelf should be.' : m.op === 'sector' ? 'Click where the new area sector should be centred. Flights go to the nearest sector centre.' : m.c ? 'Click the edge of the area. It starts from the ground to FL100; set its band in the Airspace tab.' : 'Click the centre of the military area.';

/* ---------- orders on the radio to one flight ---------- */
IC.atcAct = function (S, t, ds) {
  const n = +ds.v || 0, hd = Math.atan2(t.vy || 0, t.vx || 1);
  switch (ds.op) {
    case 'lvl': IC.atcCmd(S, t, { lvl: IC.flKm(Math.round((IC.flOf(t.clr != null ? t.clr : t.alt) + n) / 10) * 10) }); break;
    case 'turn': IC.atcCmd(S, t, { hdg: hd + n * Math.PI / 180, for: 300 }); break;
    case 'hold': IC.atcCmd(S, t, { hold: true }); break;
    case 'resume': IC.atcCmd(S, t, { resume: true }); break;
    case 'clear': IC.atcCmd(S, t, { clear: ds.id }); break;
    case 'side': IC.sideOpen(S, 'track', t); break;
  }
};

})(window.IC);
