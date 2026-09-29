/* Iron Canopy — the side view: a vertical slice through the map along a line, showing what flies above what.
   For a track the line runs along its path; for an airport, across it (turnable). It shows the ground, the lowest
   height radar sees, each airport's airspace as blocks (the wedding cake), military bands, holding stacks, and every
   flight, weapon and interceptor near the line at its height, interceptors with the arc they flew. It is a picture
   only: the airspace is shaped on the map and in the Airspace tab. Also here: the reach chart for a unit's missiles, and the
   airport Airspace tab's and the radio's orders (IC.aspAct, IC.atcAct, IC.aspMapClick). */
(function (IC) {
'use strict';
const U = IC.U;
const esc = s => U.esc ? U.esc(s) : String(s);
const SV = IC.side = { open: false, what: null, S: null, ang: 0 };
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
  // interceptors aimed at it climb above it: keep their whole arc in view
  for (const m of S.missiles) if (m.target === r && !m.dead) for (const q of [m].concat((m.tr && m.tr.pts) || [])) if (q.alt != null) H = Math.max(H, q.alt * 1.1 + 0.5);
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
  // airspace volumes cut by the line, sampled along it so that notches and extensions show as they are
  if (S.asp && S.asp.vols) for (const v of S.asp.vols) {
    const c = proj(P, v.x, v.y), R = v.R || v.r1; if (Math.abs(c.off) >= R || Math.abs(c.s) > P.L + R) continue;
    const C = IC.ASP_CLS[v.cls], hot = IC.ui && IC.ui.aspVol === v.id, n = 160, ds = 2 * P.L / n;
    let run = null;
    const flush = () => {
      if (!run) return;
      const x0 = X(run.s0), x1 = X(run.s1), y0 = Y(v.hi), y1 = Y(run.lo);
      g.fillStyle = `rgba(${C.col},${hot ? 0.24 : 0.13})`; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = `rgba(${C.col},${hot ? 1 : 0.7})`; g.lineWidth = hot ? 2 : 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      if (x1 - x0 > 34) { g.fillStyle = `rgb(${C.col})`; g.textAlign = 'center'; g.fillText(v.kind === 'mil' ? (v.cls === 'X' ? 'ADZ' : v.cls) : v.cls, (x0 + x1) / 2, Math.min(y1 - 4, y0 + 13)); }
      run = null;
    };
    for (let i = 0; i < n; i++) {
      const s = -P.L + (i + 0.5) * ds, p = at(P, s), inside = IC.aspInVol(v, p.x, p.y, null), lo = inside ? IC.aspFloorAt(v, p.x, p.y) : 0;
      if (run && (!inside || Math.abs(lo - run.lo) > 1e-6)) flush();
      if (inside) { if (!run) run = { s0: s - ds / 2, lo }; run.s1 = s + ds / 2; }
    }
    flush();
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
const CSS = `.sideview{position:absolute;left:calc(50% - 195px);bottom:92px;transform:translateX(-50%);width:min(760px,calc(100% - 440px));min-width:420px;z-index:30;padding:.55rem .7rem .7rem;display:none}
.sideview.on{display:block}.sideview header{display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem}.sideview header b{flex:1;font-size:.95rem}
.sideview canvas{width:100%;height:auto;display:block;border-radius:8px;cursor:default}
.sideview .x{min-width:2rem}.asprow{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;margin:.15rem 0 .15rem .5rem}.asprow>span{flex:1;min-width:6rem;color:var(--dim,#9ab)}.asprow>span small{display:block;opacity:.8}.asprow .act{margin:0}.aspsel{font:inherit;font-size:.9rem;background:rgba(10,22,32,.9);color:inherit;border:1px solid rgba(160,200,230,.25);border-radius:6px;padding:.2rem .35rem}.aspval{min-width:4.5em;text-align:center}.li{position:relative}.chart{display:inline-flex;flex-direction:column;align-items:center;position:absolute;right:.7rem;top:50%;transform:translateY(-50%);font:700 .78rem 'IBM Plex Mono',monospace;line-height:1.05;margin-left:.4rem}.chart b:first-child{border-bottom:1.5px solid currentColor;padding:0 .15rem}.reach{width:100%;max-width:100%;height:auto;display:block;border-radius:8px;margin:.2rem 0}`;
if (typeof document !== 'undefined' && document.head) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
function build() {
  if (el) return;
  el = document.createElement('div'); el.className = 'sideview glass'; el.setAttribute('aria-label', 'Side view');
  el.innerHTML = `<header><b id="svT"></b><button class="act" data-sv="turn" title="Turn the slice 45°">Turn</button><button class="act x" data-sv="close" aria-label="Close" title="Close">✕</button></header><canvas width="740" height="260"></canvas><p class="hint" id="svH"></p>`;
  (document.querySelector('.app') || document.body).appendChild(el);
  cv = el.querySelector('canvas');
  el.addEventListener('click', e => { const b = e.target.closest('[data-sv]'); if (!b) return; if (b.dataset.sv === 'close') IC.sideClose(); else { SV.ang += Math.PI / 4; } });
}
function loop() {
  raf = 0;
  if (!SV.open) return;
  const w = SV.what, S = SV.S;
  if (!w || !w.ref || w.ref.dead) { IC.sideClose(); return; }
  remember(S);
  IC.drawSide(cv, S, w);
  document.getElementById('svT').textContent = w.P.title;
  document.getElementById('svH').textContent = w.kind === 'base' ? 'A slice through the airspace, to look at: shape it on the map and in the Airspace tab. Arrivals come down about 1,000 ft every 5 km; they should stay inside the blocks.' : 'Each dot is at its height. Lines are the last minutes of each path; interceptors show the arc they flew.';
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
  const sh = ds.sh ? IC.aspShape(S, ds.sh) : v ? IC.aspShape(S, v.sh) : ap && IC.aspShapeOf(S, ap), i = v ? +String(v.id).split(':')[1] : 0;
  const said = () => { if (sh) IC.log(S, 'info', 'AIRSPACE', IC.aspShapeText(S, sh), ap || sh); };
  switch (ds.op) {
    case 'preset': if (ap && IC.aspPreset(S, ap, ds.v)) { ui.aspVol = null; const P = IC.ASP_SHAPES[ds.v]; IC.log(S, 'info', 'AIRSPACE', `${ap.name} now has ${P.name}. ${P.what} ${P.why}`, ap); } break;
    case 'sel': ui.aspVol = ui.aspVol === ds.id ? null : ds.id; break;
    case 'lo': case 'hi': if (v && sh) { IC.aspRingSet(S, sh, i, { [ds.op]: n / IC.FT }); IC.log(S, 'info', 'AIRSPACE', IC.aspShort(v), ap || sh); } break;
    case 'r': if (v && sh) IC.aspRingR(S, sh, i, v.r1 + n * 50); break;
    case 'scale': if (sh) IC.aspScale(S, sh, n > 0 ? 1.1 : 1 / 1.1); break;
    case 'notch': if (sh) { IC.aspNotch(S, sh, ds.v === 'del' ? null : {}); said(); } break;
    case 'nlo': if (sh && sh.notch) { IC.aspNotch(S, sh, { lo: n / IC.FT }); said(); } break;
    case 'nw': if (sh && sh.notch) IC.aspNotch(S, sh, { w: n / 2 * Math.PI / 180 }); break;
    case 'ext': if (sh) { if (ds.v === 'del') IC.aspExt(S, sh, null); else { IC.aspRotate(S, sh, IC.aspRunwayRot(ap)); IC.aspExt(S, sh, {}); } said(); } break;
    case 'ew': if (sh && sh.ext) IC.aspExt(S, sh, { w: n * 5 }); break;
    case 'align': if (sh && ap) IC.aspRotate(S, sh, IC.aspRunwayRot(ap)); break;
    case 'area': IC.setMode({ kind: 'asp', op: 'area', key: ds.v }); return;
    case 'adel': if (sh && !sh.ap) { IC.log(S, 'info', 'AIRSPACE', `${sh.name} withdrawn.`, sh); IC.aspDelArea(S, sh); ui.aspVol = null; } break;
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
/* the Airspace tab's lists of floors and ceilings: a pick is an order like a button */
if (typeof document !== 'undefined') document.addEventListener('change', e => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.asel || !IC.S) return;
  const S = IC.S, ap = S.byId[el.dataset.ap];
  IC.aspAct(S, ap, Object.assign({}, el.dataset, { v: el.value }));
  IC.ui.busyUntil = 0; IC.ui.refresh(true);
});
/* a click on the map in an airspace mode: an area (centre, then edge), a sector */
IC.aspMapClick = function (S, m, p) {
  if (m.op === 'sector') { IC.aspAddSector(S, p.x, p.y); IC.setMode(null); return; }
  if (m.op === 'area') {
    if (!m.c) { m.c = { x: p.x, y: p.y }; return; }
    const sh = IC.aspAddArea(S, m.key, m.c.x, m.c.y, Math.max(60, U.dist(m.c, p)));
    IC.ui.aspVol = sh ? `${sh.id}:0` : null; IC.setMode(null);
  }
};
IC.aspModeHint = m => m.op === 'sector' ? 'Click where the new area sector should be centred. Flights go to the nearest sector centre.' : m.c ? 'Click where its edge should be. Set its floor and ceiling in the Airspace tab.' : `Click the centre of the ${IC.ASP_SHAPES[m.key] ? IC.ASP_SHAPES[m.key].name.toLowerCase() : 'area'}.`;

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
