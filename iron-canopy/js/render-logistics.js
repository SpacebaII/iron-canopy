/* Iron Canopy — drawing supply. Far out, supply lines: a line from where a load comes from to where it goes,
   thicker the more it carries, red where a cut road forces a detour. Closer in, each convoy is a short column
   of the right lorries (missile transporters, rocket carriers, flatbeds) following the road, with a label that
   says what it carries, to whom and when it arrives. The selected convoy shows its whole route. Parked trucks
   stay in their depot and are not drawn. */
(function (IC) {
'use strict';
const U = IC.U, cam = IC.cam, C = IC.C;
let g = null;
const inView = (x, y, m) => x > cam.x - m && x < cam.x + cam.vw / cam.z + m && y > cam.y - m && y < cam.y + cam.vh / cam.z + m;
const RED = 'rgba(255,91,79,0.9)', AMBER = 'rgba(224,180,88,0.9)';
function brackets(x, y, r, px, col) {
  const l = Math.min(r * 0.5, 7 * px);
  g.strokeStyle = col || C.amber; g.lineWidth = 1.8 * px; g.beginPath();
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(x + a * r, y + b * (r - l)); g.lineTo(x + a * r, y + b * r); g.lineTo(x + a * (r - l), y + b * r); }
  g.stroke();
}
function tag(txt, x, y, px, col, bg) {
  g.font = `600 ${10 * px}px "IBM Plex Mono", monospace`;
  const w = g.measureText(txt).width + 8 * px;
  g.fillStyle = bg || 'rgba(24,18,8,0.86)'; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - 10 * px, w, 13 * px, 4 * px) : g.rect(x - w / 2, y - 10 * px, w, 13 * px); g.fill();
  g.fillStyle = col; g.textAlign = 'center'; g.fillText(txt, x, y); g.textAlign = 'left';
}
/* a point a given distance back along the road the convoy has driven */
function behind(v, d) {
  const T = v.trail || [];
  let px = v.x, py = v.y, left = d;
  for (let i = T.length - 1; i >= 0; i--) {
    const q = T[i], L = U.dxy(px, py, q.x, q.y);
    if (L >= left) { const f = left / L; return { x: px + (q.x - px) * f, y: py + (q.y - py) * f, h: Math.atan2(py - q.y, px - q.x) }; }
    left -= L; px = q.x; py = q.y;
  }
  const h = v.h || 0;
  return { x: px - Math.cos(h) * left, y: py - Math.sin(h) * left, h };
}
/* one lorry seen from above: cab in front, the load behind. Real size (16 m) when that is big enough to read,
   never under 20 px so the load can be told apart */
function lorry(x, y, h, kind, px, body, civil) {
  const len = Math.max(0.16, 20 * px), wid = len * 0.36;
  g.save(); g.translate(x, y); g.rotate(h);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-len / 2 + wid * 0.25, -wid / 2 + wid * 0.25, len, wid);
  g.fillStyle = civil ? '#d8d4c8' : '#5d6a45'; g.fillRect(len * 0.28, -wid / 2, len * 0.22, wid);            // cab
  g.fillStyle = body; g.fillRect(-len / 2, -wid / 2, len * 0.76, wid);                                         // bed
  g.strokeStyle = 'rgba(20,16,8,0.9)'; g.lineWidth = 1.2 * px; g.strokeRect(-len / 2, -wid / 2, len, wid);
  if (kind === 'missile') { g.fillStyle = '#eef0e8'; g.fillRect(-len * 0.46, -wid * 0.3, len * 0.66, wid * 0.18); g.fillRect(-len * 0.46, wid * 0.12, len * 0.66, wid * 0.18); }
  else if (kind === 'rocket') { g.fillStyle = '#3a4030'; g.fillRect(-len * 0.44, -wid * 0.36, len * 0.5, wid * 0.72); }
  else if (kind === 'flat') { g.fillStyle = '#8a6a3a'; for (let i = 0; i < 3; i++) g.fillRect(-len * 0.46 + i * len * 0.22, -wid * 0.34, len * 0.18, wid * 0.68); }
  g.restore();
}
const lorries = (S, v) => {
  const j = v.job;
  if (!j || !j.mun || !(v.state === 'toDest' || v.state === 'unload')) return v.trucks;
  return U.clamp(Math.ceil(j.qty * IC.MUN[j.mun].w / (IC.hasTech(S, 'l_trucks') ? 18 : 12)), 1, v.trucks);
};
function label(S, v, px) {
  const j = v.job, t = j ? IC.jobEta(S, j) : 0;
  if (j && v.state === 'toSource') return [`to ${j.from.name} to load`, AMBER];
  if (j) return [`${IC.munWords(j.mun, j.qty)} → ${j.to.name} · ${U.dur(t)}${v.cut ? ' · detour' : ''}`, v.cut ? '#ffb0a8' : C.supply];
  return [`empty, back to ${v.home ? v.home.name : 'base'}`, 'rgba(210,200,170,0.85)'];
}
function column(S, v, px, sel) {
  const loaded = !!(v.job && v.job.loaded && v.state !== 'toSource');
  const n = v.trucks, full = lorries(S, v), kind = loaded ? IC.cargoKind(v.job.mun) : 'empty';
  const gap = Math.max(0.5, 25 * px);
  const body = v.contract ? '#b9b2a0' : loaded ? C.supply : '#8f8266';
  // the whole company drives together; only the lorries the load needs carry it
  for (let i = n - 1; i >= 0; i--) { const p = i ? behind(v, i * gap) : { x: v.x, y: v.y, h: v.h || 0 }; lorry(p.x, p.y, p.h, i < full ? kind : 'empty', px, i < full ? body : '#8f8266', v.contract); }
  if (sel) { const m = behind(v, (n - 1) * gap / 2); brackets(m.x, m.y, Math.max(1.2, (n * 13 + 8) * px), px); }
}
function routeLine(S, v, px) {
  if (!v.route || !v.route.length) return;
  g.lineWidth = 2.2 * px; g.setLineDash([6 * px, 5 * px]);
  let p = v;
  for (const q of v.route) { g.strokeStyle = q.cut ? RED : 'rgba(224,180,88,0.75)'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); p = q; }
  g.setLineDash([]);
  const e = v.route[v.route.length - 1];
  g.strokeStyle = AMBER; g.lineWidth = 1.6 * px; g.beginPath(); g.arc(e.x, e.y, 7 * px, 0, 7); g.stroke();
}
/* far out: one line per supply run, from where the load comes from to where it goes */
function flows(S, px, now) {
  const runs = new Map();
  for (const j of S.jobs) {
    if (j.state !== 'active' || !j.from || !j.to || j.from.x == null) continue;
    const k = (j.from.id || j.from.name) + '>' + j.to.id;
    const r = runs.get(k) || { a: j.from, b: j.to, w: 0, cut: false, rail: j.mode === 'rail', air: j.mode === 'heli' || j.mode === 'cargo' };
    r.w += j.qty * (j.mun ? IC.MUN[j.mun].w : 1); r.cut = r.cut || !!(j.v && j.v.cut);
    runs.set(k, r);
  }
  for (const r of runs.values()) {
    const w = U.clamp(1.4 + Math.sqrt(r.w) * 0.5, 1.5, 6) * px;
    g.strokeStyle = r.cut ? RED : r.air ? 'rgba(200,220,255,0.55)' : r.rail ? 'rgba(224,180,88,0.4)' : 'rgba(224,180,88,0.75)';
    g.lineWidth = w; g.setLineDash(r.rail || r.air ? [3 * px, 6 * px] : [14 * px, 8 * px]); g.lineDashOffset = -now * 18 * px;
    g.beginPath(); g.moveTo(r.a.x, r.a.y); g.lineTo(r.b.x, r.b.y); g.stroke();
    g.setLineDash([]); g.lineDashOffset = 0;
  }
}
IC.drawConvoys = function (ctx, S, px) {
  g = ctx;
  const now = performance.now() / 1000, z = cam.z;
  if (z < 0.6) flows(S, px, now);
  for (const v of S.vehicles) {
    if (v.state === 'idle' || v.dead) continue;
    const sel = S.sel && S.sel.ref === v, hov = S.hover && U.dxy(S.hover.x, S.hover.y, v.x, v.y) < 16 * px;
    if (sel) routeLine(S, v, px);
    if (!inView(v.x, v.y, 60)) continue;
    // far out a convoy is a dot on its supply line; from region zoom it is a column of lorries
    if (z < 0.35 && !sel) { g.fillStyle = v.cut ? RED : v.job ? C.supply : '#8f8266'; g.strokeStyle = 'rgba(20,16,8,0.9)'; g.lineWidth = 1 * px; g.beginPath(); g.arc(v.x, v.y, 3.2 * px, 0, 7); g.fill(); g.stroke(); }
    else column(S, v, px, sel);
    if (sel || hov || (v.job && z > 0.35)) {
      const [txt, col] = label(S, v, px);
      tag(txt, v.x, v.y - Math.max(1.4, 22 * px), px, col, v.cut ? 'rgba(40,10,8,0.88)' : null);
    }
  }
};
/* while placing a unit: where it comes from and when it will be ready */
let etaKey = '', eta = null;
IC.drawDeployEta = function (ctx, S, px, type, h) {
  g = ctx;
  const k = `${type}|${Math.round(h.x / 20)}|${Math.round(h.y / 20)}|${S.reserve[type] || 0}`;
  if (k !== etaKey) { etaKey = k; eta = IC.deliveryPlan(S, type, h.x, h.y); }
  const P = eta, free = (S.reserve[type] || 0) > 0;
  if (P.from) { g.strokeStyle = 'rgba(224,180,88,0.6)'; g.lineWidth = 1.4 * px; g.setLineDash([4 * px, 5 * px]); g.beginPath(); g.moveTo(P.from.x, P.from.y); g.lineTo(h.x, h.y); g.stroke(); g.setLineDash([]); }
  const cost = free ? 'from the reserve' : U.money(IC.unitCost(S, type));
  tag(`${cost} · ready in about ${U.dur(P.total)}${P.from ? ` · from ${P.from.name}` : ' · built here'}`, h.x, h.y + 40 * px, px, C.supply);
};

})(window.IC);
