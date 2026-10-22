/* Iron Canopy — the map editor (edit.html, brief 71): a dev page, not part of the game. It shows the Career's map
   (IC.MAPS.homeland) over the generated world's far picture, lets you drag its handles (cities, points of rivers,
   ridges, roads and railways, border vertices, sites, places), add and delete things, rebuild the world from the
   map and export the map file as the game loads it. Nothing here is saved by itself: export, then put the file in
   js/map-homeland.js. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const A = JSON.parse(JSON.stringify(IC.MAPS[IC.CAREER_MAP]));
let W = null, T = null, building = false;
const cam = { s: 0.02, x: 0, y: 0 };   // s: screen px a world unit; x, y: the world point at the top left
const toS = (x, y) => [(x - cam.x) * cam.s, (y - cam.y) * cam.s];
const toW = (px, py) => [px / cam.s + cam.x, py / cam.s + cam.y];
const show = { generated: true, biomes: false, plateaus: true, villages: true, labels: true };
let sel = null;   // { kind, obj, i } what is selected: a thing, or a point of a thing
const status = t => { $('status').textContent = t; };

/* ---------- the world behind the map ---------- */
function rebuild() {
  if (building) return;
  building = true; status('Rebuilding the world from the map…');
  IC.MAPS[A.name] = A;
  const it = IC.generateSteps(0, A.name);
  const step = () => {
    let r;
    try { r = it.next(); } catch (e) { building = false; status('Generation failed: ' + e.message); console.error(e); return; }
    if (r.done) { W = r.value; T = IC.buildTerrain(W); building = false; status(`World built: ${W.cities.length} cities, ${W.edges.length} roads, ${W.rivers.length} rivers.`); $('warn').textContent = W.warnings.length ? 'The map could not be built quite as drawn:\n· ' + W.warnings.join('\n· ') : ''; draw(); return; }
    status('Rebuilding: ' + r.value + '…'); draw(); setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

/* ---------- drawing ---------- */
const STYLE_COL = { rocky: '#e8e4dc', old: '#b89a6a', volcano: '#ff8a5a' };
const KIND_COL = { airport: '#7fd0ff', airbase: '#ff7f7f', factory: '#ffd27f', power: '#c8ff7f' };
function resize() { cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio; draw(); }
function placeOf(v) {
  if (Array.isArray(v)) return { x: v[0], y: v[1] };
  return A.cities.find(c => c.name === v) || A.infra.find(i => i.name === v || i.id === v) || A.villages.find(x => x.name === v) || A.places.find(p => p.id === v || p.name === v) || (W && W.crossings.find(x => x.name === v)) || null;
}
function line(pts, col, w, dash) {
  g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath();
  pts.forEach((p, i) => { const [x, y] = toS(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke(); g.setLineDash([]);
}
function handle(x, y, col, r, on) { const [sx, sy] = toS(x, y); g.fillStyle = on ? '#fff' : col; g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.rect(sx - r, sy - r, 2 * r, 2 * r); g.fill(); g.stroke(); }
function label(t, x, y, col, size) { const [sx, sy] = toS(x, y); g.font = `${size || 11}px sans-serif`; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t, sx + 7, sy + 4); g.fillStyle = col; g.fillText(t, sx + 6, sy + 3); }
const isSel = (kind, obj, i) => sel && sel.kind === kind && sel.obj === obj && (i == null || sel.i === i);
function draw() {
  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  g.fillStyle = '#0d1116'; g.fillRect(0, 0, cv.width, cv.height);
  if (T) { const [x, y] = toS(0, 0); g.drawImage(T.far, x, y, IC.WW * cam.s, IC.WH * cam.s); }
  const z = cam.s;
  // the generated world: its roads, rivers and railways, to see what the map made
  if (W && show.generated) {
    for (const r of W.rivers) line(r.pts.filter((_, i) => i % 3 === 0), 'rgba(90,170,220,0.8)', Math.max(1, r.w * z * 0.3));
    for (const e of W.edges) if (!e.abroad && (e.cls === 'hw' || e.cls === 'rd')) line(e.pts.map(p => [p.x, p.y]), e.cls === 'hw' ? 'rgba(255,170,60,0.55)' : 'rgba(230,220,160,0.35)', e.cls === 'hw' ? 1.6 : 0.8);
    for (const r of W.rails) line(r.pts.map(p => [p.x, p.y]), 'rgba(200,200,200,0.5)', 1, [4, 3]);
    for (const l of W.lakes) { const [x, y] = toS(l.x, l.y); g.save(); g.translate(x, y); g.rotate(l.rot); g.strokeStyle = 'rgba(120,190,230,0.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 0, l.rx * z, l.ry * z, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
  }
  // the border and its vertices; the neighbours' sector lines
  line(A.border.concat([A.border[0]]), isSel('border', A) ? '#fff' : 'rgba(140,215,255,0.9)', 1.5);
  if (isSel('border', A) || z > 0.05) for (let i = 0; i < A.border.length; i++) handle(A.border[i][0], A.border[i][1], 'rgba(140,215,255,0.9)', isSel('border', A, i) ? 4 : 2, isSel('border', A, i));
  for (const s of A.secs) { const a = s.deg * Math.PI / 180, r = 26000; line([A.centre, [A.centre[0] + Math.cos(a) * r, A.centre[1] + Math.sin(a) * r]], 'rgba(220,220,220,0.35)', 1, [6, 6]); const hx = A.centre[0] + Math.cos(a) * 19000, hy = A.centre[1] + Math.sin(a) * 19000; handle(hx, hy, '#ccc', 4, isSel('sec', s)); label(s.k + ' ' + s.deg + '°', hx, hy, '#ddd'); }
  // biomes and plateaus
  if (show.biomes) for (const b of A.biomes) { line(b.poly.concat([b.poly[0]]), 'rgba(180,255,180,0.4)', 1, [3, 3]); label(b.biome, b.poly[0][0], b.poly[0][1], '#9f9'); }
  if (show.plateaus) for (const p of A.plateaus) { line(p.poly.concat([p.poly[0]]), isSel('plateau', p) ? '#fff' : 'rgba(230,200,140,0.6)', 1, [5, 3]); if (isSel('plateau', p)) p.poly.forEach((q, i) => handle(q[0], q[1], '#ec8', isSel('plateau', p, i) ? 4 : 3, isSel('plateau', p, i))); label(p.name + ' +' + p.h, p.poly[0][0], p.poly[0][1], '#ec8'); }
  for (const s of A.seas) if (isSel('sea', s)) { line(s.poly.concat([s.poly[0]]), '#fff', 1); s.poly.forEach((q, i) => handle(q[0], q[1], '#8cf', 3, isSel('sea', s, i))); }
  // ridges: the crest, its width as a band, its passes
  for (const r of A.ridges) {
    const col = STYLE_COL[r.style] || '#ccc', on = isSel('ridge', r);
    g.globalAlpha = 0.18; line(r.pts.length > 1 ? r.pts : [r.pts[0], r.pts[0]], col, Math.max(2, r.w * 2 * z)); g.globalAlpha = 1;
    line(r.pts, on ? '#fff' : col, 2);
    if (on || z > 0.04) r.pts.forEach((p, i) => handle(p[0], p[1], col, on && sel.i === i ? 4 : 2.5, on && sel.i === i));
    for (const gp of r.gaps || []) { const [x, y] = toS(gp[0], gp[1]); g.strokeStyle = '#8f8'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, Math.max(3, gp[2] * z), 0, Math.PI * 2); g.stroke(); }
    label(`${r.name} (${r.style} a${r.a} w${r.w})`, r.pts[0][0], r.pts[0][1], col);
  }
  // rivers and lakes as drawn
  for (const r of A.rivers) { const on = isSel('river', r), pts = r.via || r.pts; line(pts, on ? '#fff' : 'rgba(120,200,255,0.7)', 1, r.via ? [2, 4] : []); if (on || z > 0.04) pts.forEach((p, i) => handle(p[0], p[1], '#8cf', on && sel.i === i ? 4 : 2.5, on && sel.i === i)); label(r.name, pts[0][0], pts[0][1], '#9cf'); }
  for (const l of A.lakes) { const [x, y] = toS(l.x, l.y); g.save(); g.translate(x, y); g.rotate(l.rot || 0); g.strokeStyle = isSel('lake', l) ? '#fff' : '#8cf'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, l.rx * z, l.ry * z, 0, 0, Math.PI * 2); g.stroke(); g.restore(); handle(l.x, l.y, '#8cf', 3, isSel('lake', l)); label(l.name, l.x, l.y, '#9cf'); }
  // roads and railways as drawn: straight lines between their stops
  for (const r of A.roads.concat(A.rails.map(x => Object.assign({ cls: 'rail' }, x)))) {
    const on = isSel(r.cls === 'rail' ? 'rail' : 'road', r), pts = r.via.map(placeOf).filter(Boolean).map(p => [p.x, p.y]);
    line(pts, on ? '#fff' : r.cls === 'hw' ? 'rgba(255,150,40,0.9)' : r.cls === 'rd' ? 'rgba(240,220,120,0.9)' : 'rgba(220,220,220,0.8)', r.cls === 'hw' ? 2.5 : 1.5, r.cls === 'rail' ? [8, 4] : []);
    r.via.forEach((v, i) => { if (Array.isArray(v)) handle(v[0], v[1], '#fc8', on && sel.i === i ? 4 : 3, on && sel.i === i); });
    if (on && pts.length) label(r.name, pts[0][0], pts[0][1], '#fff');
  }
  // cities, villages, sites, crossings, places
  for (const c of A.cities) { const [x, y] = toS(c.x, c.y), r = Math.max(3, (45 + Math.sqrt(c.pop) * 1.7) * z); g.fillStyle = isSel('city', c) ? '#fff' : c.role === 'capital' ? '#ffd700' : 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); if (show.labels) label(c.name, c.x + r / z, c.y, '#fff', c.pop > 300 ? 12 : 10); }
  if (show.villages) for (const v of A.villages) { handle(v.x, v.y, '#dcb', 2.5, isSel('village', v)); label(v.name, v.x, v.y, '#dcb', 10); }
  for (const i of A.infra) { handle(i.x, i.y, KIND_COL[i.kind] || '#ccc', 3.5, isSel('site', i)); label((i.id || i.kind) + (i.name ? ' ' + i.name : i.city ? ' ' + i.city : ''), i.x, i.y, KIND_COL[i.kind] || '#ccc', 10); }
  for (const x of A.crossings) { const a = x.deg * Math.PI / 180, p = W ? W.borderPt(a) : { x: A.centre[0] + Math.cos(a) * 14000, y: A.centre[1] + Math.sin(a) * 14000 }; handle(p.x, p.y, '#f8f', 4, isSel('crossing', x)); label(x.name + ' ' + x.deg + '°', p.x, p.y, '#f8f', 10); }
  for (const p of A.places) { const [x, y] = toS(p.x, p.y); g.fillStyle = isSel('place', p) ? '#fff' : '#7fe'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); label(p.id, p.x, p.y, '#7fe', 10); }
  // the map's frame and scale
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; { const [x, y] = toS(0, 0); g.strokeRect(x, y, IC.WW * cam.s, IC.WH * cam.s); }
  g.fillStyle = '#ddd'; g.font = '11px sans-serif'; g.fillText(`${(100 / cam.s / 10).toFixed(0)} km = 100 px`, 10, 16);
}

/* ---------- picking ---------- */
function* handles() {
  for (const c of A.cities) yield { kind: 'city', obj: c, x: c.x, y: c.y, r: 7 };
  for (const v of A.villages) yield { kind: 'village', obj: v, x: v.x, y: v.y, r: 6 };
  for (const i of A.infra) yield { kind: 'site', obj: i, x: i.x, y: i.y, r: 6 };
  for (const p of A.places) yield { kind: 'place', obj: p, x: p.x, y: p.y, r: 7 };
  for (const l of A.lakes) yield { kind: 'lake', obj: l, x: l.x, y: l.y, r: 6 };
  for (const r of A.rivers) { const pts = r.via || r.pts; for (let i = 0; i < pts.length; i++) yield { kind: 'river', obj: r, i, x: pts[i][0], y: pts[i][1], r: 5 }; }
  for (const r of A.ridges) for (let i = 0; i < r.pts.length; i++) yield { kind: 'ridge', obj: r, i, x: r.pts[i][0], y: r.pts[i][1], r: 5 };
  for (const r of A.roads) for (let i = 0; i < r.via.length; i++) if (Array.isArray(r.via[i])) yield { kind: 'road', obj: r, i, x: r.via[i][0], y: r.via[i][1], r: 5 };
  for (const r of A.rails) for (let i = 0; i < r.via.length; i++) if (Array.isArray(r.via[i])) yield { kind: 'rail', obj: r, i, x: r.via[i][0], y: r.via[i][1], r: 5 };
  for (const p of A.plateaus) if (isSel('plateau', p)) for (let i = 0; i < p.poly.length; i++) yield { kind: 'plateau', obj: p, i, x: p.poly[i][0], y: p.poly[i][1], r: 5 };
  for (const s of A.seas) if (isSel('sea', s)) for (let i = 0; i < s.poly.length; i++) yield { kind: 'sea', obj: s, i, x: s.poly[i][0], y: s.poly[i][1], r: 5 };
  for (let i = 0; i < A.border.length; i++) yield { kind: 'border', obj: A, i, x: A.border[i][0], y: A.border[i][1], r: 4 };
  for (const s of A.secs) { const a = s.deg * Math.PI / 180; yield { kind: 'sec', obj: s, x: A.centre[0] + Math.cos(a) * 19000, y: A.centre[1] + Math.sin(a) * 19000, r: 6 }; }
  for (const x of A.crossings) { const a = x.deg * Math.PI / 180, p = W ? W.borderPt(a) : { x: A.centre[0] + Math.cos(a) * 14000, y: A.centre[1] + Math.sin(a) * 14000 }; yield { kind: 'crossing', obj: x, x: p.x, y: p.y, r: 6 }; }
}
function pick(px, py) {
  let best = null, bd = 1e9;
  for (const h of handles()) { const [sx, sy] = toS(h.x, h.y), d = Math.hypot(sx - px, sy - py); if (d < h.r + 3 && d < bd) { bd = d; best = h; } }
  if (best) return best;
  // a line (road, river, ridge) by its nearest piece
  const near = (pts, kind, obj) => { for (let i = 1; i < pts.length; i++) { const [ax, ay] = toS(pts[i - 1][0], pts[i - 1][1]), [bx, by] = toS(pts[i][0], pts[i][1]); const d = U.segDist(px, py, ax, ay, bx, by); if (d < 5 && d < bd) { bd = d; best = { kind, obj }; } } };
  for (const r of A.roads) near(r.via.map(placeOf).filter(Boolean).map(p => [p.x, p.y]), 'road', r);
  for (const r of A.rails) near(r.via.map(placeOf).filter(Boolean).map(p => [p.x, p.y]), 'rail', r);
  for (const r of A.rivers) near(r.via || r.pts, 'river', r);
  for (const r of A.ridges) near(r.pts, 'ridge', r);
  for (const p of A.plateaus) near(p.poly.concat([p.poly[0]]), 'plateau', p);
  near(A.border.concat([A.border[0]]), 'border', A);
  return best;
}
/* ---------- the side panel: the selection as text you can change ---------- */
function showSel() {
  const el = $('sel');
  if (!sel) { el.innerHTML = '<p>Nothing selected.</p>'; return; }
  const o = sel.obj, what = sel.kind + (sel.i != null ? ` · point ${sel.i + 1}` : '');
  const text = sel.kind === 'border' ? `${A.border.length} vertices` : JSON.stringify(o, null, 1);
  el.innerHTML = `<p><b>${what}</b></p><textarea id="selText" spellcheck="false">${text.replace(/</g, '&lt;')}</textarea><div><button id="apply">Apply</button><button id="del">Delete</button></div>`;
  $('apply').onclick = () => { if (sel.kind === 'border') return; try { const v = JSON.parse($('selText').value); for (const k of Object.keys(o)) delete o[k]; Object.assign(o, v); draw(); } catch (e) { alert('Not valid JSON: ' + e.message); } };
  $('del').onclick = () => { del(); };
}
function listOf(kind) { return { city: A.cities, village: A.villages, site: A.infra, place: A.places, lake: A.lakes, river: A.rivers, ridge: A.ridges, road: A.roads, rail: A.rails, plateau: A.plateaus, crossing: A.crossings, sec: A.secs, sea: A.seas }[kind]; }
function del() {
  if (!sel) return;
  const pts = sel.kind === 'border' ? A.border : sel.kind === 'ridge' ? sel.obj.pts : sel.kind === 'river' ? (sel.obj.via || sel.obj.pts) : sel.kind === 'road' || sel.kind === 'rail' ? sel.obj.via : sel.kind === 'plateau' || sel.kind === 'sea' ? sel.obj.poly : null;
  if (sel.i != null && pts && pts.length > (sel.kind === 'border' || sel.kind === 'plateau' || sel.kind === 'sea' ? 3 : 1)) { pts.splice(sel.i, 1); sel.i = null; }
  else if (sel.kind !== 'border') { const L = listOf(sel.kind); L.splice(L.indexOf(sel.obj), 1); sel = null; }
  showSel(); draw();
}
/* ---------- input ---------- */
let drag = null;
cv.addEventListener('mousedown', e => {
  const px = e.offsetX, py = e.offsetY, h = pick(px, py), [wx, wy] = toW(px, py);
  if (e.shiftKey && sel) { addPoint(wx, wy, h); return; }
  if (h) { sel = { kind: h.kind, obj: h.obj, i: h.i }; drag = h.x != null ? { h, ox: wx - h.x, oy: wy - h.y } : null; showSel(); draw(); return; }
  sel = null; showSel(); drag = { pan: true, px, py, cx: cam.x, cy: cam.y }; draw();
});
cv.addEventListener('mousemove', e => {
  if (!drag) return;
  const px = e.offsetX, py = e.offsetY;
  if (drag.pan) { cam.x = drag.cx - (px - drag.px) / cam.s; cam.y = drag.cy - (py - drag.py) / cam.s; draw(); return; }
  const [wx, wy] = toW(px, py), x = Math.round(wx - drag.ox), y = Math.round(wy - drag.oy), h = drag.h;
  if (h.kind === 'city' || h.kind === 'village' || h.kind === 'site' || h.kind === 'place' || h.kind === 'lake') { h.obj.x = x; h.obj.y = y; }
  else if (h.kind === 'river') { (h.obj.via || h.obj.pts)[h.i] = [x, y]; }
  else if (h.kind === 'ridge') h.obj.pts[h.i] = [x, y];
  else if (h.kind === 'road' || h.kind === 'rail') h.obj.via[h.i] = [x, y];
  else if (h.kind === 'plateau' || h.kind === 'sea') h.obj.poly[h.i] = [x, y];
  else if (h.kind === 'border') A.border[h.i] = [x, y];
  else if (h.kind === 'sec' || h.kind === 'crossing') h.obj.deg = Math.round(Math.atan2(wy - A.centre[1], wx - A.centre[0]) * 180 / Math.PI);
  draw();
});
window.addEventListener('mouseup', () => { drag = null; showSel(); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx, wy] = toW(e.offsetX, e.offsetY), k = Math.exp(-e.deltaY * 0.0015);
  cam.s = U.clamp(cam.s * k, 0.008, 2);
  cam.x = wx - e.offsetX / cam.s; cam.y = wy - e.offsetY / cam.s; draw();
}, { passive: false });
let cursor = [A.centre[0], A.centre[1]];
cv.addEventListener('mousemove', e => { cursor = toW(e.offsetX, e.offsetY).map(Math.round); });
function addPoint(wx, wy, h) {
  const p = h && h.kind === 'city' && (sel.kind === 'road' || sel.kind === 'rail') ? h.obj.name : [Math.round(wx), Math.round(wy)];
  const pts = sel.kind === 'ridge' ? sel.obj.pts : sel.kind === 'river' ? (sel.obj.via || sel.obj.pts) : sel.kind === 'road' || sel.kind === 'rail' ? sel.obj.via : sel.kind === 'plateau' || sel.kind === 'sea' ? sel.obj.poly : sel.kind === 'border' ? A.border : null;
  if (!pts) return;
  // after the selected point, else at the end; a border vertex goes between its neighbours by angle
  if (sel.kind === 'border') { const a = Math.atan2(wy - A.centre[1], wx - A.centre[0]); let at = A.border.findIndex(q => Math.atan2(q[1] - A.centre[1], q[0] - A.centre[0]) > a); if (at < 0) at = A.border.length; A.border.splice(at, 0, p); sel.i = at; }
  else { const at = sel.i != null ? sel.i + 1 : pts.length; pts.splice(at, 0, p); sel.i = at; }
  showSel(); draw();
}
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const [x, y] = cursor, k = e.key.toLowerCase();
  const add = (kind, obj) => { listOf(kind).push(obj); sel = { kind, obj }; showSel(); draw(); };
  if (e.key === 'Delete' || e.key === 'Backspace') del();
  else if (k === 'c') { const name = prompt('City name'); if (name) add('city', { name, x, y, pop: 100, region: 'valley', style: 'us', tpl: 'chi' }); }
  else if (k === 'v') { const name = prompt('Village name'); if (name) add('village', { name, x, y, pop: 20 }); }
  else if (k === 'p') { const id = prompt('Place id'); if (id) add('place', { id, name: id, role: '', region: '', x, y }); }
  else if (k === 's') { const kind = prompt('Site kind: airport, airbase, factory, power'); if (kind) add('site', { kind, name: '', x, y }); }
  else if (k === 'r') { const name = prompt('River name'); if (name) add('river', { name, via: [[x, y]] }); }
  else if (k === 'm') { const name = prompt('Motorway name'); if (name) add('road', { cls: 'hw', name, via: [[x, y]] }); }
  else if (k === 'd') { const name = prompt('Main road name'); if (name) add('road', { cls: 'rd', name, via: [[x, y]] }); }
  else if (k === 't') { const name = prompt('Railway name'); if (name) add('rail', { name, via: [[x, y]] }); }
  else if (k === 'h') { const name = prompt('Ridge name'); if (name) add('ridge', { name, style: 'old', a: 0.3, w: 300, pts: [[x, y]] }); }
  else if (k === 'l') { const name = prompt('Lake name'); if (name) add('lake', { name, x, y, rx: 150, ry: 70, rot: 0 }); }
  else if (k === 'b') { sel = { kind: 'border', obj: A }; addPoint(x, y, null); }
});
/* ---------- export: the map file as the game loads it ---------- */
IC.mapSource = function (A) {
  const J = v => JSON.stringify(v);
  const list = (arr, f) => arr.map(f).join(',\n');
  return `/* Iron Canopy — the Career's map (brief 71): one country drawn by hand at the scale a player reads it. The generator
   (gen.js, authored mode) takes everything here and fills in the rest: villages, fields, forest, the streets and
   buildings inside each city, lanes, junctions. Coordinates are world units (100 m); angles are degrees clockwise from
   east on screen (90 south, -90 north). The map editor (edit.html) writes this file: edit by hand with care. */
(function (IC) {
'use strict';
IC.MAPS = IC.MAPS || {};
IC.MAPS.${A.name} = {
  name: ${J(A.name)}, version: ${A.version},
  names: ${J(A.names)},
  full: ${J(A.full)},
  centre: ${J(A.centre)},
  secs: ${J(A.secs)}, east: ${!!A.east},
  coast: ${J(A.coast || [])},
  drain: ${J(A.drain || null)},
  border: [
${A.border.map(p => '    ' + J(p)).join(',\n')}
  ],
  seas: [
${list(A.seas || [], s => `    { name: ${J(s.name)}, poly: [\n${s.poly.map(p => '      ' + J(p)).join(',\n')}\n    ] }`)}
  ],
  ridges: [
${list(A.ridges, r => `    { name: ${J(r.name)}, style: ${J(r.style)}, a: ${r.a}, w: ${r.w}${r.core ? ', core: true' : ''}${r.gaps && r.gaps.length ? ', gaps: ' + J(r.gaps) : ''}, pts: ${J(r.pts)} }`)}
  ],
  plateaus: [
${list(A.plateaus || [], p => `    { name: ${J(p.name)}, h: ${p.h}, edge: ${p.edge || 250}, poly: ${J(p.poly)} }`)}
  ],
  biomes: [
${list(A.biomes || [], b => `    { biome: ${J(b.biome)}, poly: ${J(b.poly)} }`)}
  ],
  rivers: [
${list(A.rivers, r => `    ${J(r)}`)}
  ],
  lakes: [
${list(A.lakes || [], l => `    ${J(l)}`)}
  ],
  // name, where, people (thousands), region, style, plan, role
  cities: [
${list(A.cities, c => `    ${J(c)}`)}
  ],
  villages: [
${list(A.villages || [], v => `    ${J(v)}`)}
  ],
  infra: [
${list(A.infra || [], i => `    ${J(i)}`)}
  ],
  crossings: [
${list(A.crossings || [], x => `    ${J(x)}`)}
  ],
  roads: [
${list(A.roads || [], r => `    ${J(r)}`)}
  ],
  rails: [
${list(A.rails || [], r => `    ${J(r)}`)}
  ],
  places: [
${list(A.places || [], p => `    ${J(p)}`)}
  ]
};
})(window.IC);
`;
};
$('export').onclick = () => {
  const text = IC.mapSource(A), out = $('out');
  out.hidden = false; out.value = text;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); a.download = `map-${A.name}.js`; a.click();
  status(`Exported ${(text.length / 1024).toFixed(0)} KB: save it as js/map-${A.name}.js (and bump the version when the world should change for saves).`);
};
$('rebuild').onclick = rebuild;
$('fit').onclick = () => { const xs = A.border.map(p => p[0]), ys = A.border.map(p => p[1]), x0 = Math.min(...xs) - 1500, x1 = Math.max(...xs) + 1500, y0 = Math.min(...ys) - 1500, y1 = Math.max(...ys) + 1500; cam.s = Math.min((cv.clientWidth - 340) / (x1 - x0), cv.clientHeight / (y1 - y0)); cam.x = x0; cam.y = y0 - (cv.clientHeight / cam.s - (y1 - y0)) / 2; draw(); };
for (const k of Object.keys(show)) { const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" ${show[k] ? 'checked' : ''}> ${k}`; l.querySelector('input').onchange = ev => { show[k] = ev.target.checked; draw(); }; $('layers').appendChild(l); }
window.addEventListener('resize', resize);
IC.mapEdit = { A, get W() { return W; }, rebuild, draw, cam, select: s => { sel = s; showSel(); draw(); } };
resize(); $('fit').onclick(); showSel();
status('Map loaded. Rebuild the world to see it; drag, add and delete, then export.');
rebuild();
})(window.IC);
