/* Iron Canopy — the replay window: the last minutes in 3D, from any angle, like a sports replay camera.
   It reads the recorder (record.js) and builds a three.js scene: the map's own tiles as the ground texture over
   the terrain relief, city blocks as buildings from models.js, airports with their buildings and tanks, every
   recorded mover as a low-poly model with a trail, and a flash and smoke where something happened.
   three.js is the one outside library in the game, loaded from cdnjs only when this window opens. Nothing else
   depends on it, and the game runs without it (the window then says the library could not be loaded). */
(function (IC) {
'use strict';
const U = IC.U;

const CFG = IC.REPLAY = {
  threeUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
  fallbackUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  texPx: 1024, trail: 60, maxLabels: 40, maxBoxes: 40000
};
const KM = 10;   // world units a kilometre of height

let THREE = null, loading = null;
function loadThree() {
  if (THREE) return Promise.resolve(THREE);
  if (window.THREE) return Promise.resolve(THREE = window.THREE);
  if (loading) return loading;
  const byTag = url => new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = () => window.THREE ? res(window.THREE) : rej(new Error('no THREE')); s.onerror = () => rej(new Error('load failed')); document.head.appendChild(s); });
  loading = import(CFG.threeUrl).then(m => (THREE = m.default && m.default.Scene ? m.default : m)).catch(() => byTag(CFG.fallbackUrl).then(t => (THREE = t)));
  loading.catch(() => { loading = null; });
  return loading;
}

/* ---------- the window ---------- */
const CSS = `
.replay{position:absolute;z-index:10;inset:12px;display:flex;flex-direction:column;border-radius:18px;background:rgba(6,11,16,.96);box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;animation:fadeIn .2s var(--ease)}
.rp-head{display:flex;gap:.8rem;align-items:center;padding:.6rem 1rem .5rem;flex-wrap:wrap}
.rp-head h2{margin:0;font-family:var(--display);font-weight:700;font-size:1.1rem;letter-spacing:.14em;text-transform:uppercase;color:var(--friend)}
.rp-head .sub{color:var(--muted);font-size:.9rem;flex:1;min-width:8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-head label{display:inline-flex;gap:.35rem;align-items:center;font-size:.85rem;color:var(--muted);cursor:pointer}
.rp-head select{background:var(--well);color:var(--text);border:0;border-radius:8px;padding:.2rem .4rem;font:inherit;font-size:.85rem}
.rp-view{position:relative;flex:1;min-height:0;background:#04080c}
.rp-view > canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.rp-view > canvas:active{cursor:grabbing}
.rp-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.rp-lbl{position:absolute;left:0;top:0;transform:translate(-50%,-100%);font-family:var(--mono);font-size:.72rem;line-height:1.15;color:var(--text);text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;pointer-events:none}
.rp-lbl small{display:block;color:var(--muted);font-size:.66rem}
.rp-lbl.enemy{color:#ffb0a8}.rp-lbl.civil{color:#b8f0d0}.rp-lbl.us{color:#c0e8ff}.rp-lbl.sel{color:var(--amber)}
.rp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:1rem 1.4rem;border-radius:12px;background:rgba(6,11,16,.85);color:var(--text);font-size:.95rem;max-width:26rem;text-align:center}
.rp-fps{position:absolute;right:.6rem;top:.4rem;font-family:var(--mono);font-size:.7rem;color:var(--muted)}
.rp-bar{display:flex;gap:.7rem;align-items:center;padding:.5rem 1rem .7rem;flex-wrap:wrap}
.rp-bar input[type=range]{flex:1;min-width:10rem;accent-color:var(--friend)}
.rp-bar .time{font-family:var(--mono);font-variant-numeric:tabular-nums;min-width:5.2rem;color:var(--text)}
.rp-bar .hint{font-size:.78rem;color:var(--muted);flex-basis:100%}
.rp-side{position:absolute;z-index:2;right:0;top:0;bottom:0;width:15rem;overflow:auto;background:rgba(6,11,16,.7);padding:.5rem;display:grid;gap:.3rem;align-content:start;scrollbar-width:thin}
.rp-side div{display:flex;gap:.5rem;align-items:center;font-size:.78rem;color:var(--muted)}
.rp-side canvas{width:64px;height:48px;flex:none;background:rgba(255,255,255,.05);border-radius:6px}
.rp-side b{color:var(--text);font-weight:600}
.rp-side h4{margin:.4rem 0 0;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}`;

let V = null;   // the open window
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function makeWindow(S, title, sub) {
  if (!$('rpStyle')) { const st = document.createElement('style'); st.id = 'rpStyle'; st.textContent = CSS; document.head.appendChild(st); }
  let el = $('replay');
  if (!el) { el = document.createElement('div'); el.id = 'replay'; el.className = 'replay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Replay'); ($('app') || document.body).appendChild(el); }
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([v, n, t]) => `<button data-rp="${act}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="rp-head"><h2>${esc(title)}</h2><span class="sub" id="rpSub">${esc(sub)}</span>
      ${seg('mode', 'orbit', [['orbit', 'Orbit', 'Drag to turn round the scene, wheel to zoom, right-drag to pan'], ['follow', 'Follow', 'The camera stays with the chosen object (click one)'], ['free', 'Free', 'Fly: W A S D and Q E move, drag looks']])}
      <label title="Only what our radars saw at the time, in identity colours"><input type="checkbox" data-rp="radar"> Radar picture</label>
      <label><input type="checkbox" data-rp="labels" checked> Labels</label>
      <label>Heights <select data-rp="hk"><option value="1">real</option><option value="3">×3</option></select></label>
      <button class="x" data-rp="close" aria-label="Close" title="Close (Esc)">✕</button></div>
    <div class="rp-view" id="rpView"><canvas id="rpCanvas"></canvas><div class="rp-labels" id="rpLabels"></div><div class="rp-fps" id="rpFps"></div><div class="rp-msg" id="rpMsg">Loading the 3D library…</div></div>
    <div class="rp-bar"><button class="btn" data-rp="play" id="rpPlay" title="Play or pause (space)">▶</button><span class="time" id="rpTime">—</span><input type="range" id="rpRange" min="0" max="1" step="0.1" value="0" aria-label="Time">
      ${seg('speed', 1, [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×'], [10, '10×']])}
      <span class="hint" id="rpHint">Drag to orbit · wheel to zoom · right-drag to pan · click an object to follow it · ← → step 5 s · space plays</span></div>`;
  el.hidden = false;
  return el;
}
const msg = t => { const m = $('rpMsg'); if (m) { m.hidden = !t; m.innerHTML = t || ''; } };

/* ---------- geometry builders: model parts into one mesh with vertex colours ---------- */
const colCache = new Map();
const colorOf = hex => { let c = colCache.get(hex); if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); } return c; };
const resolveCol = (c, o) => c === 'BODY' ? (o.body || IC.MODEL_PAL.civil) : c === 'L1' ? (o.livery ? o.livery[0] : o.body || IC.MODEL_PAL.steel) : c === 'L2' ? (o.livery ? o.livery[1] : IC.MODEL_PAL.dark) : c;

/* appends a geometry (in place, after its matrix is applied) to the merge arrays */
function append(acc, geom, col, shade) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.attributes.position.array, nor = g.attributes.normal ? g.attributes.normal.array : null;
  const c = colorOf(col);
  for (let i = 0; i < pos.length; i += 3) {
    acc.pos.push(pos[i], pos[i + 1], pos[i + 2]);
    if (nor) acc.nor.push(nor[i], nor[i + 1], nor[i + 2]); else acc.nor.push(0, 1, 0);
    const k = shade ? shade(nor ? nor[i + 1] : 1) : 1;
    acc.col.push(c.r * k, c.g * k, c.b * k);
  }
  if (g !== geom) g.dispose();
  geom.dispose();
}
function finish(acc) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  return geom;
}
/* a model's parts, in metres, mirrored in y so starboard comes out on the map's right, then turned so z is up */
function partGeom(p) {
  const [shape, x, y, z, sx, sy, sz] = p, op = p[8] || {};
  let g;
  if (shape === 'box') g = new THREE.BoxGeometry(sx || 0.01, sy || 0.01, sz || 0.01);
  else if (shape === 'cyl' || shape === 'disc') {
    const d = IC.modelCyl(p), r = d.dia / 2, len = shape === 'disc' ? 0.04 : d.len || 0.01;
    g = new THREE.CylinderGeometry(r, r, len, shape === 'disc' ? 18 : 10);
    if (d.axis === 'x') g.rotateZ(Math.PI / 2); else if (d.axis === 'z') g.rotateX(Math.PI / 2);
  } else if (shape === 'cone') {
    const d = IC.modelCyl(p);
    g = new THREE.ConeGeometry(d.dia / 2, d.len || 0.01, 10);
    if (d.axis === 'z') g.rotateX(Math.PI / 2); else g.rotateZ(op.flip ? Math.PI / 2 : -Math.PI / 2);
  } else if (shape === 'sphere') { g = new THREE.SphereGeometry(0.5, 10, 7); g.scale(sx || 0.01, sy || 0.01, sz || 0.01); }
  else if (shape === 'poly') {
    const sh = new THREE.Shape(op.pts.map(q => new THREE.Vector2(q[0], -q[1])));
    g = new THREE.ExtrudeGeometry(sh, { depth: sz || 0.1, bevelEnabled: false }); g.translate(0, 0, -(sz || 0.1) / 2);
  } else if (shape === 'fin') {
    const sh = new THREE.Shape(op.pts.map(q => new THREE.Vector2(q[0], q[1])));
    g = new THREE.ExtrudeGeometry(sh, { depth: sy || 0.2, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, sy / 2, 0);
  } else return null;
  if (op.pitch) g.rotateY(-op.pitch);
  if (op.yaw) g.rotateZ(-op.yaw);
  g.translate(x, -y, z);
  return g;
}
const modelCache = new Map();
/* a model as two geometries: the solid parts with vertex colours, and its rotor and propeller discs, drawn translucent */
function modelGeom(key, o) {
  const ck = key + '|' + (o.livery ? o.livery.join() : '') + '|' + (o.body || '');
  let g = modelCache.get(ck); if (g) return g;
  const m = IC.MODELS[key] || IC.MODELS.cm, acc = { pos: [], nor: [], col: [] }, discs = { pos: [], nor: [], col: [] };
  for (const p of m.parts) { const pg = partGeom(p); if (pg) append(p[0] === 'disc' ? discs : acc, pg, resolveCol(p[7], o)); }
  g = { solid: finish(acc), discs: discs.pos.length ? finish(discs) : null };
  for (const x of [g.solid, g.discs]) if (x) { x.rotateX(-Math.PI / 2); x.scale(0.01, 0.01, 0.01); }
  modelCache.set(ck, g);
  return g;
}
const discMat = new Map();
function discMaterial() { let m = discMat.get('d'); if (!m) { m = new THREE.MeshBasicMaterial({ color: '#202428', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }); discMat.set('d', m); } return m; }
/* a box on the ground with a yaw, into the merge arrays; ht up from y0. Sides a little darker than the roof */
function boxInto(acc, cx, cz, y0, w, d, ht, yaw, col) {
  const g = new THREE.BoxGeometry(w, ht, d);
  g.rotateY(-yaw); g.translate(cx, y0 + ht / 2, cz);
  append(acc, g, col, ny => ny > 0.5 ? 1 : ny < -0.5 ? 0.5 : 0.72);
}

/* ---------- the scene ---------- */
const hT = (S, x, y) => S.flat ? 0 : IC.elevKm(x, y) * KM;

/* the ground texture: the map exactly as the player sees it, drawn by the map's own painters into a canvas */
function groundTexture(S, cx, cy, R) {
  const T = R <= 60 ? CFG.texPx * 2 : CFG.texPx, cv = document.createElement('canvas'); cv.width = cv.height = T;
  const g = cv.getContext('2d'), z = T / (2 * R), px = 1 / z;
  const cam = IC.cam, saved = { x: cam.x, y: cam.y, z: cam.z, vw: cam.vw, vh: cam.vh }, view = { x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R };
  const rs = IC.rs, savedView = rs && rs.view;
  Object.assign(cam, { x: cx - R, y: cy - R, z, vw: T, vh: T });
  if (rs) rs.view = view;
  const moves = [];
  try {
    g.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    g.fillStyle = '#04080c'; g.fillRect(view.x0, view.y0, 2 * R, 2 * R);
    if (S.flat) { g.fillStyle = '#3c4a3a'; g.fillRect(view.x0, view.y0, 2 * R, 2 * R); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = px; g.beginPath(); for (let x = Math.ceil(view.x0 / 10) * 10; x < view.x1; x += 10) { g.moveTo(x, view.y0); g.lineTo(x, view.y1); } for (let y = Math.ceil(view.y0 / 10) * 10; y < view.y1; y += 10) { g.moveTo(view.x0, y); g.lineTo(view.x1, y); } g.stroke(); }
    else if (S.terrain && IC.drawTerrain) { for (let i = 0; i < 8; i++) if (!IC.drawTerrain(g, S.terrain, cam, 1, 400, S)) break; }
    if (IC.drawRoads && !S.flat) IC.drawRoads(g, S, px, view);
    // the airports' pavement, buildings and parked aircraft; the aircraft moving are the replay's own
    for (const b of IC.bases(S)) if (b.parts && U.dxy(b.x, b.y, cx, cy) < R + (b.radius || 60)) { moves.push([b, b.moves]); b.moves = []; IC.drawAirport(g, S, b, px, performance.now() / 1000, 1); }
  } catch (e) { console.warn('replay texture', e); }
  for (const [b, m] of moves) b.moves = m;
  Object.assign(cam, saved); if (rs) rs.view = savedView;
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}
function terrainMesh(S, cx, cy, R, hk) {
  const N = 96, geo = new THREE.PlaneGeometry(2 * R, 2 * R, N, N);
  geo.rotateX(-Math.PI / 2);   // now in XZ, normal up; PlaneGeometry's v runs down, so z grows with the map's y
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hT(S, cx + pos.getX(i), cy + pos.getZ(i)) * hk);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: groundTexture(S, cx, cy, R) });
  return new THREE.Mesh(geo, mat);
}
/* city blocks and village houses as buildings, one merged mesh, with the damage each event did */
function buildings(S, cx, cy, R, hk, evs, sc) {
  const acc = { pos: [], nor: [], col: [] }, items = [];
  const dmgT = new Map();
  for (const e of evs) for (const d of e.dmg || []) if (d.kind === 'block') dmgT.set(d.b, Math.min(dmgT.get(d.b) || 1e18, e.t));
  let boxes = 0;
  const add = (b, town) => {
    if (U.dxy(b.x, b.y, cx, cy) > R + 3 || boxes > CFG.maxBoxes) return;
    if (b.hp <= 0 && !dmgT.has(b)) return;   // rubble already: the map shows it
    const list = IC.blockBoxes(b, town), c = Math.cos(b.a), s = Math.sin(b.a), y0 = hT(S, b.x, b.y) * hk;
    const start = acc.pos.length / 3;
    for (const q of list) {
      const wx = b.x + q.x * c - q.y * s, wy = b.y + q.x * s + q.y * c;
      boxInto(acc, wx - cx, wy - cy, y0, q.w, q.h, q.ht * hk, b.a, `rgb(${q.col[0]},${q.col[1]},${q.col[2]})`); boxes++;
    }
    const dark = b.hp < 1 && !dmgT.has(b);
    items.push({ start, end: acc.pos.length / 3, t: dmgT.has(b) ? dmgT.get(b) : dark ? -1e18 : 1e18, dark: false });
  };
  for (const c of S.world.cities) if (U.dxy(c.x, c.y, cx, cy) < R + (c.r || 80) + 40) for (const b of c.blocks) add(b, true);
  for (const v of S.world.villages) if (U.dxy(v.x, v.y, cx, cy) < R + 40) for (const b of v.blocks || []) add(b, false);
  if (!acc.pos.length) return null;
  const geom = finish(acc), mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.items = items; mesh.userData.base = Float32Array.from(acc.col);
  sc.add(mesh);
  return mesh;
}
/* a building at an airport: its footprint raised by a height that fits its kind */
const PART_H = { terminal: 0.14, cargo: 0.12, hangar: 0.14, has: 0.08, alert: 0.08, tower: 0.55, fire: 0.08, atc: 0.05, ammo: 0.05, ils: 0.03, gradar: 0.04, hydrant: 0.05 };
const PART_COL = { terminal: '#b0b4ba', cargo: '#968c76', hangar: '#80868c', has: '#969284', alert: '#8c8c84', tower: '#bebec4', fire: '#b04638', atc: '#c8ccd0', ammo: '#607454', fuel: '#e2e0d4', ils: '#dc823c', gradar: '#c8ccd0', hydrant: '#788896' };
function airportParts(S, cx, cy, R, hk, evs, sc) {
  const dmgT = new Map();
  for (const e of evs) for (const d of e.dmg || []) if (d.kind === 'part') dmgT.set(d.p, Math.min(dmgT.get(d.p) || 1e18, e.t));
  const items = [];
  for (const b of IC.bases(S)) if (b.parts && U.dxy(b.x, b.y, cx, cy) < R + (b.radius || 60)) for (const p of b.parts) {
    // what was destroyed before the window is rubble on the map already; what died inside it stands until its hit
    if (!p.built || (p.hp <= 0 && !dmgT.has(p)) || p.kind === 'runway' || p.kind === 'taxi' || p.kind === 'apron') continue;
    if (U.dxy(p.x, p.y, cx, cy) > R + 2) continue;
    const acc = { pos: [], nor: [], col: [] }, y0 = hT(S, p.x, p.y) * hk, col = PART_COL[p.kind] || '#969696', ht = (PART_H[p.kind] || 0.06) * hk;
    if (p.kind === 'fuel') { const g = new THREE.CylinderGeometry(p.r, p.r, 0.12 * hk, 18); g.translate(p.x - cx, y0 + 0.06 * hk, p.y - cy); append(acc, g, col, ny => ny > 0.5 ? 1 : 0.75); }
    else if (p.kind === 'tower') { boxInto(acc, p.x - cx, p.y - cy, y0, p.w * 0.6, p.h * 0.6, ht * 0.8, p.a || 0, col); boxInto(acc, p.x - cx, p.y - cy, y0 + ht * 0.8, p.w * 1.3, p.h * 1.3, ht * 0.2, p.a || 0, '#3a5068'); }
    else if (p.kind === 'hangar') { boxInto(acc, p.x - cx, p.y - cy, y0, p.w, p.h, ht * 0.7, p.a || 0, col); boxInto(acc, p.x - cx, p.y - cy, y0 + ht * 0.7, p.w * 0.9, p.h * 0.6, ht * 0.3, p.a || 0, col); }
    else if (p.kind === 'atc' || p.kind === 'gradar') { boxInto(acc, p.x - cx, p.y - cy, y0, p.w, p.h, ht, p.a || 0, col); const g = new THREE.BoxGeometry(0.01, 0.03 * hk, p.w * 0.9); g.translate(p.x - cx, y0 + ht + 0.03 * hk, p.y - cy); append(acc, g, '#e8ecf0'); }
    else boxInto(acc, p.x - cx, p.y - cy, y0, p.w || p.r * 2, p.h || p.w || p.r * 2, ht, p.a || 0, col);
    const mesh = new THREE.Mesh(finish(acc), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const hurt = p.hp < p.max * 0.75;
    mesh.userData.items = [{ start: 0, end: acc.pos.length / 3, t: dmgT.has(p) ? dmgT.get(p) : hurt ? -1e18 : 1e18, dark: false }];
    mesh.userData.base = Float32Array.from(acc.col);
    sc.add(mesh); items.push(mesh);
  }
  return items;
}
/* darken what an event damaged once the replay clock has passed it */
function applyDamage(mesh, t) {
  let changed = false;
  const col = mesh.geometry.attributes.color, base = mesh.userData.base;
  for (const it of mesh.userData.items) {
    const dark = t >= it.t;
    if (dark === it.dark) continue;
    it.dark = dark; changed = true;
    const k = dark ? 0.32 : 1;
    for (let i = it.start * 3; i < it.end * 3; i++) col.array[i] = base[i] * k;
  }
  if (changed) col.needsUpdate = true;
}

/* the movers: one mesh from the model, a second in identity colour for the radar picture, a trail, a label */
const SIDE_COL = { us: '#6fd2ff', enemy: '#ff5b4f', civil: '#7fe8b0' };
const AFF_COL = ['#f2d14a', '#6fd2ff', '#7fe8b0', '#ff9a3c', '#ff5b4f', '#8fa3b0'];
function makeMover(tr, sc) {
  const o = { livery: tr.meta.livery || null };
  const G = modelGeom(tr.model, o), geom = G.solid;
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const rmat = new THREE.MeshBasicMaterial({ color: SIDE_COL[tr.side] || '#ffffff' });
  const rmesh = new THREE.Mesh(geom, rmat); rmesh.visible = false;
  const grp = new THREE.Group(); grp.add(mesh); grp.add(rmesh); grp.userData.tr = tr; mesh.userData.tr = tr;
  if (G.discs) { const dm = new THREE.Mesh(G.discs, discMaterial()); mesh.add(dm); }
  // the smallest movers get a size floor so they can be seen at all
  const size = IC.modelSize(tr.model) / 100; grp.userData.size = size;
  const maxPts = tr.kind === 'missile' || tr.kind === 'threat' ? 1200 : 400;
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3)); lg.setDrawRange(0, 0);
  const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: tr.kind === 'missile' ? '#e8e8e0' : SIDE_COL[tr.side] || '#ffffff', transparent: true, opacity: tr.kind === 'missile' ? 0.9 : 0.55 }));
  line.frustumCulled = false;
  sc.add(grp); sc.add(line);
  const label = document.createElement('div'); label.className = 'rp-lbl ' + (tr.side || ''); label.hidden = true;
  $('rpLabels').appendChild(label);
  return { tr, grp, mesh, rmesh, rmat, line, label, maxPts, st: {}, st2: {}, tmp: [] };
}
/* flash and smoke at an event, kept deterministic in the replay clock so scrubbing looks the same both ways */
function makeEvent(e, cx, cy, S, hk, sc) {
  let top = 0;
  for (const d of e.dmg || []) if (d.kind === 'block') for (const q of IC.blockBoxes(d.b, true)) top = Math.max(top, q.ht); else if (d.kind === 'part') top = Math.max(top, PART_H[d.p.kind] || 0.06);
  const y0 = hT(S, e.x, e.y) * hk + e.alt * KM * hk + top * hk;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: e.kind === 'launch' || e.kind === 'fire' ? '#ffe0a0' : '#ffb060', transparent: true, opacity: 0.9 }));
  flash.position.set(e.x - cx, y0, e.y - cy); flash.visible = false; sc.add(flash);
  const puffs = [];
  if (!e.quiet) for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshLambertMaterial({ color: e.kind === 'kill' || e.kind === 'intercept' ? '#9a9a98' : '#4a4442', transparent: true, opacity: 0.5 }));
    p.visible = false; sc.add(p);
    puffs.push({ m: p, dx: U.rand(-1, 1), dz: U.rand(-1, 1), k: U.rand(0.7, 1.3), ph: Math.random() * 6 });
  }
  return { e, flash, puffs, y0 };
}
function updateEvent(ev, t, wind) {
  const age = t - ev.e.t, s = ev.e.sz || 1;
  if (age < 0 || age > 90) { ev.flash.visible = false; for (const p of ev.puffs) p.m.visible = false; return; }
  if (age < 1.6) { ev.flash.visible = true; const k = age / 1.6; ev.flash.scale.setScalar(s * (0.06 + 0.4 * Math.sqrt(k))); ev.flash.material.opacity = 0.95 * (1 - k); } else ev.flash.visible = false;
  for (const p of ev.puffs) {
    const a = Math.max(0, age - p.ph * 0.15), life = 60 * p.k;
    if (a <= 0 || a > life) { p.m.visible = false; continue; }
    p.m.visible = true;
    const k = a / life, r = s * (0.1 + 0.5 * Math.sqrt(k)) * p.k;
    p.m.position.set(ev.flash.position.x + p.dx * s * 0.3 + wind.x * a * 0.12 + p.dx * a * 0.03, ev.y0 + a * 0.05 * s * p.k + r * 0.6, ev.flash.position.z + p.dz * s * 0.3 + wind.y * a * 0.12 + p.dz * a * 0.03);
    p.m.scale.setScalar(r); p.m.material.opacity = 0.45 * (1 - k) * (1 - k);
  }
}

/* ---------- open, run, close ---------- */
/* o: { x, y, t, follow (a game object with a recorded track), r (radius, world units) } */
IC.replayOpen = function (S, o) {
  o = o || {};
  if (V) IC.replayClose();
  const R0 = IC.recRange(S);
  const t = U.clamp(o.t != null ? o.t : S.time - 60, R0.t0, R0.t1);
  const near = (x, y) => IC.bases(S).find(b => b.parts && U.dxy(b.x, b.y, x, y) < (b.radius || 60) + 20) || S.world.cities.find(c => U.dxy(c.x, c.y, x, y) < (c.r || 60) + 20);
  const place = near(o.x, o.y);
  const R = o.r || (o.follow ? 150 : place && place.parts ? 55 : place ? 45 : 90);
  const where = place ? place.name : IC.nearestPlace(S, o.x, o.y);
  const el = makeWindow(S, 'Replay', `${where} · ${U.hhmm(R0.t0)}–${U.hhmm(R0.t1)}`);
  V = { S, el, cx: o.x, cy: o.y, R, t, t0: R0.t0, t1: R0.t1, playing: false, speed: 1, mode: o.follow ? 'follow' : 'orbit', followRef: o.follow || null, hk: 1, radar: false, labels: true,
    orbit: { yaw: -0.8, pitch: 0.55, dist: Math.max(6, R * 0.9), tx: 0, ty: hT(S, o.x, o.y), tz: 0 }, free: null, keys: new Set(), wasPaused: S.paused, gallery: false, fps: 0, frames: 0, fpsT: 0 };
  S.paused = true;
  bindWindow(el);
  loadThree().then(() => { if (V && V.el === el) buildScene(); }).catch(e => { msg('The 3D library could not be loaded from cdnjs.cloudflare.com. Check the connection and open the replay again.'); console.warn(e); });
  return V;
};
IC.replayClose = function () {
  if (!V) return;
  const v = V; V = null;
  cancelAnimationFrame(v.raf);
  window.removeEventListener('keydown', v.onKey, true);
  window.removeEventListener('resize', v.onResize);
  if (v.renderer) { const keep = new Set(); for (const g of modelCache.values()) { keep.add(g.solid); keep.add(g.discs); } v.renderer.dispose(); v.scene.traverse(x => { if (x.geometry && !keep.has(x.geometry)) x.geometry.dispose(); if (x.material && x.material.map) x.material.map.dispose(); }); }
  v.S.paused = v.wasPaused;
  v.el.hidden = true; v.el.innerHTML = '';
  IC.ui && IC.ui.refresh && IC.ui.refresh(true);
};
IC.replayOpenFor = ref => V && IC.replayOpen(V.S, { follow: ref, x: ref.x, y: ref.y, t: V.t });

function bindWindow(el) {
  el.onclick = e => {
    const b = e.target.closest('[data-rp]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    const a = b.dataset.rp, v = b.dataset.v;
    if (a === 'close') IC.replayClose();
    else if (a === 'play') togglePlay();
    else if (a === 'speed') { V.speed = +v; for (const x of el.querySelectorAll('[data-rp=speed]')) x.setAttribute('aria-pressed', +x.dataset.v === V.speed); }
    else if (a === 'mode') setMode(v);
    else if (a === 'above') { V.orbit.pitch = 1.5; V.orbit.yaw = -Math.PI / 2; }
  };
  el.onchange = e => {
    const a = e.target.dataset.rp;
    if (a === 'radar') V.radar = e.target.checked;
    else if (a === 'labels') { V.labels = e.target.checked; if (!V.labels) for (const m of V.movers || []) m.label.hidden = true; }
    else if (a === 'hk') { V.hk = +e.target.value; if (V.scene) rebuildStatic(); }
  };
  el.oninput = e => { if (e.target.id === 'rpRange') { V.t = +e.target.value; V.playing = false; $('rpPlay').textContent = '▶'; } };
  V.onKey = e => {
    if (!V) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { IC.replayClose(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.target.closest && e.target.closest('input,select')) return;
    if (k === ' ') { togglePlay(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') V.t = Math.max(V.t0, V.t - 5);
    else if (e.key === 'ArrowRight') V.t = Math.min(V.t1, V.t + 5);
    else if ('wasdqe'.includes(k)) { V.keys.add(k); if (V.mode !== 'free') setMode('free'); }
    else return;
    e.stopImmediatePropagation();
  };
  V.onKeyUp = e => { if (V) V.keys.delete(e.key.toLowerCase()); };
  window.addEventListener('keydown', V.onKey, true);
  window.addEventListener('keyup', V.onKeyUp, true);
  V.onResize = () => V && V.renderer && resize();
  window.addEventListener('resize', V.onResize);
}
function togglePlay() { V.playing = !V.playing; if (V.playing && V.t >= V.t1 - 0.05) V.t = V.t0; $('rpPlay').textContent = V.playing ? '❚❚' : '▶'; }
function setMode(m) {
  if (m === 'follow' && !V.follow) { if (V.movers && V.movers.length) V.follow = nearestMover(); if (!V.follow) return; }
  if (m === 'free' && !V.free) { const c = V.camera; V.free = { pos: c.position.clone(), yaw: Math.atan2(c.getWorldDirection(new THREE.Vector3()).z, c.getWorldDirection(new THREE.Vector3()).x), pitch: Math.asin(U.clamp(c.getWorldDirection(new THREE.Vector3()).y, -1, 1)) }; }
  V.mode = m;
  for (const x of V.el.querySelectorAll('[data-rp=mode]')) x.setAttribute('aria-pressed', x.dataset.v === m);
  $('rpHint').textContent = m === 'orbit' ? 'Drag to orbit · wheel to zoom · right-drag to pan · click an object to follow it · ← → step 5 s · space plays'
    : m === 'follow' ? `Following ${V.follow ? V.follow.tr.name : '…'} · drag to look round it · wheel for distance · click another object to switch` : 'Free camera: W A S D move, Q E down and up, drag to look · wheel changes speed';
}
function nearestMover() {
  let best = null, bd = 1e18;
  for (const m of V.movers) { const st = IC.recAt(m.tr, V.t, m.st); if (!st) continue; const d = U.dxy(st.x, st.y, V.cx, V.cy); if (d < bd) { bd = d; best = m; } }
  return best;
}

function resize() {
  const view = $('rpView'), w = view.clientWidth, h = view.clientHeight;
  V.renderer.setSize(w, h, false);
  V.camera.aspect = w / h;
  const side = V.gallery && $('rpSide');   // the gallery centres its models in the part the side list leaves free
  if (side) V.camera.setViewOffset(w, h, side.offsetWidth / 2, 0, w, h);
  V.camera.updateProjectionMatrix();
}
function buildScene() {
  const S = V.S, cx = V.cx, cy = V.cy, R = V.R;
  msg('Building the scene…');
  const canvas = $('rpCanvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); } catch (e) { msg('WebGL is not available in this browser, so the replay cannot draw.'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V.renderer = renderer;
  const scene = V.scene = new THREE.Scene();
  const rev = +THREE.REVISION || 128, lk = rev >= 155 ? Math.PI : 1;
  const light = S.flat ? 1 : IC.daylight(S.time), dim = 0.35 + 0.65 * light;
  // the sky and the far ground follow the time of day; the box's edge fades into them
  const sky = new THREE.Color('#0a1420').lerp(new THREE.Color('#9cc4e4'), light), far = new THREE.Color('#0c1410').lerp(new THREE.Color('#8e9a70'), light);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, R * 2.5, R * 9);
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(R * 60, R * 60), new THREE.MeshLambertMaterial({ color: far })); beyond.rotation.x = -Math.PI / 2; beyond.position.y = -0.2; scene.add(beyond);
  V.camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, R * 40);
  V.hemi = new THREE.HemisphereLight(0xbfd4ee, 0x3a3428, 0.85 * lk * dim); scene.add(V.hemi);
  V.sun = new THREE.DirectionalLight(0xfff0dc, 1.0 * lk * dim); V.sun.position.set(-R, R * 0.9, R * 0.6); scene.add(V.sun);
  V.static = new THREE.Group(); scene.add(V.static);
  V.evs = IC.recEvents(S, V.t0, V.t1).filter(e => U.dxy(e.x, e.y, cx, cy) < R * 1.4);
  buildStatic();
  // the movers that came through the box in the window
  V.movers = [];
  for (const tr of IC.recTracks(S)) if (IC.recNear(tr, cx, cy, R * 1.6, V.t0, V.t1)) V.movers.push(makeMover(tr, scene));
  if (V.followRef) { V.follow = V.movers.find(m => m.tr.ref === V.followRef) || null; if (!V.follow) V.mode = 'orbit'; }
  V.events = V.evs.map(e => makeEvent(e, cx, cy, S, V.hk, scene));
  bindPointer(canvas);
  resize();
  setMode(V.mode);
  $('rpRange').min = V.t0; $('rpRange').max = V.t1;
  msg('');
  V.last = performance.now();
  frame();
}
function buildStatic() {
  const S = V.S, g = V.static;
  while (g.children.length) g.remove(g.children[0]);
  V.ground = terrainMesh(S, V.cx, V.cy, V.R, V.hk); g.add(V.ground);
  V.blocks = buildings(S, V.cx, V.cy, V.R, V.hk, V.evs, g);
  V.parts = airportParts(S, V.cx, V.cy, V.R, V.hk, V.evs, g);
  // a faint ring at the edge so the box's end reads as a choice, not the edge of the world
  const ring = new THREE.Mesh(new THREE.RingGeometry(V.R * 0.995, V.R * 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x6fd2ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
}
function rebuildStatic() { if (V.ground && V.ground.material.map) V.ground.material.map.dispose(); buildStatic(); for (const ev of V.events) { ev.y0 = hT(V.S, ev.e.x, ev.e.y) * V.hk + ev.e.alt * KM * V.hk; ev.flash.position.y = ev.y0; } }

/* ---------- pointer: orbit, pan, look, pick ---------- */
function bindPointer(canvas) {
  let drag = null;
  canvas.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const O = V.orbit;
    if (V.mode === 'free') { V.free.yaw += dx * 0.004; V.free.pitch = U.clamp(V.free.pitch - dy * 0.004, -1.5, 1.5); return; }
    if (drag.b === 2 || drag.shift) {
      if (V.mode === 'follow') return;
      const k = O.dist * 0.0016, s = Math.sin(O.yaw), c = Math.cos(O.yaw);
      O.tx -= (dx * c - dy * s) * k * -1; O.tz -= (dx * s + dy * c) * k * -1;
    } else { O.yaw -= dx * 0.005; O.pitch = U.clamp(O.pitch + dy * 0.005, 0.02, 1.55); }
  };
  canvas.onpointerup = e => {
    if (drag && !drag.moved && drag.b === 0) pick(e, canvas);
    drag = null;
  };
  canvas.oncontextmenu = e => e.preventDefault();
  canvas.onwheel = e => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0012);
    if (V.mode === 'free') V.freeSpd = U.clamp((V.freeSpd || 1) / k, 0.05, 40); else V.orbit.dist = U.clamp(V.orbit.dist * k, V.gallery ? 3 : 0.3, V.gallery ? 1500 : V.R * 12);
  };
}
function pick(e, canvas) {
  const r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = -((e.clientY - r.top) / r.height * 2 - 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), V.camera);
  // a mover is picked by its mesh, or by being the nearest to the ray within a few pixels
  const meshes = V.movers.filter(m => m.grp.visible).map(m => m.mesh);
  const hit = rc.intersectObjects(meshes, false)[0];
  let best = hit ? hit.object.userData.tr : null;
  if (!best) {
    let bd = 1e9;
    for (const m of V.movers) { if (!m.grp.visible) continue; const d = rc.ray.distanceToPoint(m.grp.position), lim = Math.max(m.grp.userData.size * 2, m.grp.position.distanceTo(V.camera.position) * 0.02); if (d < lim && d < bd) { bd = d; best = m.tr; } }
  }
  if (!best) return;
  V.follow = V.movers.find(m => m.tr === best);
  setMode('follow');
}

/* ---------- every frame ---------- */
const tmpV = () => new THREE.Vector3();
function frame() {
  if (!V || !V.renderer) return;
  V.raf = requestAnimationFrame(frame);
  const now = performance.now(), dtR = Math.min(0.1, (now - V.last) / 1000); V.last = now;
  V.frames++; if (now - V.fpsT > 1000) { V.fps = V.frames; V.frames = 0; V.fpsT = now; $('rpFps').textContent = `${V.fps} fps · ${V.movers.length} objects`; }
  if (V.playing) { V.t += dtR * V.speed; if (V.t >= V.t1) { V.t = V.t1; V.playing = false; $('rpPlay').textContent = '▶'; } }
  const t = V.t, S = V.S, cx = V.cx, cy = V.cy, hk = V.hk;
  $('rpRange').value = t; $('rpTime').textContent = `${U.hhmm(t)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  // movers
  const wind = S.wind || { x: 0, y: 0 };
  let followPos = null;
  for (const m of V.movers) {
    const st = IC.recAt(m.tr, t, m.st);
    const hide = !st || (V.radar && m.tr.kind === 'threat' && !st.det && !m.tr.meta.civil && st.aff !== 1);
    m.grp.visible = !hide;
    if (!st) { m.line.visible = false; m.label.hidden = true; continue; }
    const y = hT(S, st.x, st.y) * hk + st.alt * KM * hk;
    m.grp.position.set(st.x - cx, y, st.y - cy);
    // pitch from the next second's height change, so climbing and diving read
    const st2 = IC.recAt(m.tr, t + 1, m.st2);
    let pitch = 0;
    if (st2 && st.spd > 0.05) pitch = Math.atan2((st2.alt - st.alt) * KM, Math.max(0.01, U.dxy(st.x, st.y, st2.x, st2.y)));
    m.grp.rotation.set(0, -st.h, 0); m.grp.rotateZ(pitch);
    // on the ground a launcher stands still; a flying thing far from the camera gets a size floor
    const d = m.grp.position.distanceTo(V.camera.position), floor = d * 0.004 / Math.max(m.grp.userData.size, 0.02);
    m.grp.scale.setScalar(Math.max(1, floor));
    if (m === V.follow) followPos = m.grp.position;
    // the radar picture: identity colours, and only what was seen
    m.mesh.visible = !V.radar; m.rmesh.visible = V.radar;
    if (V.radar) m.rmat.color.set(m.tr.kind === 'threat' ? AFF_COL[st.aff | 0] : SIDE_COL[m.tr.side] || '#fff');
    // trail
    const tl = m.tr.kind === 'missile' ? 900 : m.tr.kind === 'veh' || m.tr.kind === 'unit' ? 0 : CFG.trail;
    if (tl && !hide) {
      m.tmp.length = 0; IC.recPath(m.tr, t - tl, t, m.tmp);
      const arr = m.line.geometry.attributes.position.array; let n = 0;
      const step = Math.max(1, Math.ceil((m.tmp.length / 4) / m.maxPts));
      for (let i = 0; i < m.tmp.length && n < m.maxPts - 1; i += 4 * step) { arr[n * 3] = m.tmp[i] - cx; arr[n * 3 + 1] = hT(S, m.tmp[i], m.tmp[i + 1]) * hk + m.tmp[i + 2] * KM * hk; arr[n * 3 + 2] = m.tmp[i + 1] - cy; n++; }
      arr[n * 3] = st.x - cx; arr[n * 3 + 1] = y; arr[n * 3 + 2] = st.y - cy; n++;
      m.line.geometry.attributes.position.needsUpdate = true; m.line.geometry.setDrawRange(0, n); m.line.visible = n > 1;
    } else m.line.visible = false;
  }
  // camera
  const cam = V.camera, O = V.orbit;
  if (V.mode === 'follow' && V.follow && followPos) { O.tx = followPos.x; O.ty = followPos.y; O.tz = followPos.z; O.dist = Math.min(O.dist, V.R * 2); }
  if (V.mode === 'free' && V.free) {
    const F = V.free, sp = (V.freeSpd || 1) * V.R * 0.08 * dtR, fwd = new THREE.Vector3(Math.cos(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), Math.sin(F.yaw) * Math.cos(F.pitch));
    const right = new THREE.Vector3(-Math.sin(F.yaw), 0, Math.cos(F.yaw));
    if (V.keys.has('w')) F.pos.addScaledVector(fwd, sp); if (V.keys.has('s')) F.pos.addScaledVector(fwd, -sp);
    if (V.keys.has('d')) F.pos.addScaledVector(right, sp); if (V.keys.has('a')) F.pos.addScaledVector(right, -sp);
    if (V.keys.has('e')) F.pos.y += sp; if (V.keys.has('q')) F.pos.y -= sp;
    F.pos.y = Math.max(F.pos.y, hT(S, F.pos.x + cx, F.pos.z + cy) * hk + 0.05);
    cam.position.copy(F.pos); cam.lookAt(F.pos.clone().add(fwd));
  } else {
    const px = O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, pz = O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist, py = O.ty + Math.sin(O.pitch) * O.dist;
    cam.position.set(px, Math.max(py, hT(S, px + cx, pz + cy) * hk + 0.05), pz);
    cam.lookAt(O.tx, O.ty, O.tz);
  }
  cam.near = Math.max(0.02, O.dist * 0.002); cam.far = V.R * 40; cam.updateProjectionMatrix();
  // events and damage
  for (const ev of V.events) updateEvent(ev, t, wind);
  if (V.blocks) applyDamage(V.blocks, t);
  for (const p of V.parts) applyDamage(p, t);
  // labels: name, height and speed, the nearest first
  if (V.labels) labels(t);
  V.renderer.render(V.scene, cam);
}
function labels(t) {
  const cam = V.camera, view = $('rpView'), w = view.clientWidth, h = view.clientHeight, v = tmpV();
  const list = [];
  for (const m of V.movers) { if (!m.grp.visible) { m.label.hidden = true; continue; } list.push([m, m.grp.position.distanceTo(cam.position)]); }
  list.sort((a, b) => a[1] - b[1]);
  list.forEach(([m], i) => {
    if (i >= CFG.maxLabels) { m.label.hidden = true; return; }
    v.copy(m.grp.position); v.y += m.grp.userData.size * m.grp.scale.x * 0.6; v.project(cam);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { m.label.hidden = true; return; }
    const st = m.st, gnd = m.tr.kind === 'veh' || m.tr.kind === 'unit' || (m.tr.kind === 'gnd' && st.alt < 0.005);
    const txt = `${esc(m.tr.name)}<small>${gnd ? '' : U.alt(st.alt) + ' · '}${st.spd > 0.02 ? U.kmh(st.spd) : gnd ? (m.tr.kind === 'unit' ? (st.det ? 'radar on' : 'radar silent') : 'stopped') : 'stopped'}</small>`;
    if (m.label.innerHTML !== txt) m.label.innerHTML = txt;
    m.label.className = 'rp-lbl ' + (m === V.follow ? 'sel' : m.tr.side || '');
    m.label.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(0)}px,${((1 - v.y) / 2 * h - 6).toFixed(0)}px) translate(-50%,-100%)`;
    m.label.hidden = false;
  });
}

/* ---------- the gallery: every model in 3D on a grid, and from above down the side ---------- */
IC.replayGallery = function (S) {
  if (V) IC.replayClose();
  const el = makeWindow(S, 'Models', 'Every model in 3D; the same models from above down the side');
  V = { S, el, cx: 0, cy: 0, R: 60, t: 0, t0: 0, t1: 1, playing: false, speed: 1, mode: 'orbit', hk: 1, radar: false, labels: true, gallery: true,
    orbit: { yaw: 1.25, pitch: 0.7, dist: 110, tx: 0, ty: 0, tz: 0 }, free: null, keys: new Set(), wasPaused: S.paused, fps: 0, frames: 0, fpsT: 0, movers: [], events: [], parts: [] };
  S.paused = true;
  bindWindow(el);
  el.querySelector('.rp-bar').innerHTML = `<button class="btn" data-rp="above" title="Look straight down">From above</button><span class="hint">Drag to orbit · wheel to zoom · right-drag to pan · click a model to look at it. Models are at real size next to each other: a lorry is 10 m, a wide-body 64 m.</span>`;
  for (const x of el.querySelectorAll('[data-rp=radar],[data-rp=hk]')) x.closest('label').hidden = true;   // nothing recorded to show here
  const side = document.createElement('div'); side.className = 'rp-side'; side.id = 'rpSide'; $('rpView').appendChild(side);
  loadThree().then(() => { if (V && V.el === el) buildGallery(side); }).catch(e => { msg('The 3D library could not be loaded from cdnjs.cloudflare.com. Check the connection and open the gallery again.'); console.warn(e); });
  return V;
};
function buildGallery(side) {
  const canvas = $('rpCanvas'), S = V.S;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { msg('WebGL is not available in this browser.'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V.renderer = renderer;
  const scene = V.scene = new THREE.Scene(); scene.background = new THREE.Color('#0a1420');
  V.camera = new THREE.PerspectiveCamera(45, 1.6, 0.5, 6000);   // the gallery is laid out in metres
  const lk = (+THREE.REVISION || 128) >= 155 ? Math.PI : 1;
  scene.add(new THREE.HemisphereLight(0xbfd4ee, 0x3a3428, 0.9 * lk));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.0 * lk); sun.position.set(-300, 400, 200); scene.add(sun);
  // a grey slab with a 10 m grid
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.fillStyle = '#3a4038'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); for (let i = 0; i <= 512; i += 32) { g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); } g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(1920, 1920), new THREE.MeshLambertMaterial({ map: tex })); slab.rotation.x = -Math.PI / 2; scene.add(slab);
  V.static = new THREE.Group(); scene.add(V.static);
  // rows by group, spaced by size
  // in metres here (the models are scaled up a hundredfold), one row a group, spaced by size
  let z = -140;
  V.movers = [];
  for (const grp of IC.MODEL_GROUPS) {
    const keys = Object.keys(IC.MODELS).filter(k => IC.MODELS[k].group === grp);
    const h4 = document.createElement('h4'); h4.textContent = grp; side.appendChild(h4);
    let x = -240, rowMax = 0;
    for (const k of keys) {
      const size = IC.modelSize(k), liv = grp === 'Civil aircraft' && k !== 'light' ? IC.LIVERY[(keys.indexOf(k) * 2) % IC.LIVERY.length] : null;
      if (x > 40) { x = -240; z += rowMax + 10; rowMax = 0; }   // wrap long groups so the grid stays compact
      x += size / 2 + 6;
      const tr = { id: k, kind: 'gallery', model: k, name: IC.MODELS[k].name, side: grp === 'Enemy weapons' ? 'enemy' : grp === 'Civil aircraft' ? 'civil' : 'us', meta: { livery: liv } };
      const m = makeMover(tr, scene); m.grp.position.set(x, 0, z); m.grp.rotation.y = Math.PI / 2; m.grp.scale.setScalar(100); m.grp.userData.size = size; m.line.visible = false; m.fixed = true;
      V.movers.push(m);
      x += size / 2 + 6; rowMax = Math.max(rowMax, size);
      const row = document.createElement('div'); const c = IC.modelTopCanvas(k, 128, 96, { livery: liv }); row.appendChild(c);
      const b = document.createElement('b'); b.textContent = IC.MODELS[k].name; row.appendChild(b); side.appendChild(row);
    }
    z += rowMax + 14;
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const m of V.movers) { x0 = Math.min(x0, m.grp.position.x); x1 = Math.max(x1, m.grp.position.x); z0 = Math.min(z0, m.grp.position.z); z1 = Math.max(z1, m.grp.position.z); }
  Object.assign(V.orbit, { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, dist: Math.max(x1 - x0, z1 - z0) * 0.85 });
  bindPointer(canvas);
  resize();
  msg('');
  V.last = performance.now();
  galleryFrame();
}
function galleryFrame() {
  if (!V || !V.renderer) return;
  V.raf = requestAnimationFrame(galleryFrame);
  const now = performance.now(), dtR = Math.min(0.1, (now - V.last) / 1000); V.last = now;
  V.frames++; if (now - V.fpsT > 1000) { V.fps = V.frames; V.frames = 0; V.fpsT = now; $('rpFps').textContent = `${V.fps} fps · ${V.movers.length} models`; }
  const cam = V.camera, O = V.orbit;
  if (V.mode === 'follow' && V.follow) { const p = V.follow.grp.position; O.tx = p.x; O.ty = p.y; O.tz = p.z; O.dist = Math.min(O.dist, Math.max(20, V.follow.grp.userData.size * 3)); }
  if (V.mode === 'free' && V.free) {
    const F = V.free, sp = (V.freeSpd || 1) * 60 * dtR, fwd = new THREE.Vector3(Math.cos(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), Math.sin(F.yaw) * Math.cos(F.pitch)), right = new THREE.Vector3(-Math.sin(F.yaw), 0, Math.cos(F.yaw));
    if (V.keys.has('w')) F.pos.addScaledVector(fwd, sp); if (V.keys.has('s')) F.pos.addScaledVector(fwd, -sp); if (V.keys.has('d')) F.pos.addScaledVector(right, sp); if (V.keys.has('a')) F.pos.addScaledVector(right, -sp); if (V.keys.has('e')) F.pos.y += sp; if (V.keys.has('q')) F.pos.y -= sp;
    cam.position.copy(F.pos); cam.lookAt(F.pos.clone().add(fwd));
  } else { cam.position.set(O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, Math.max(0.5, O.ty + Math.sin(O.pitch) * O.dist), O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist); cam.lookAt(O.tx, O.ty, O.tz); }
  cam.near = Math.max(0.2, O.dist * 0.002); cam.updateProjectionMatrix();
  for (const m of V.movers) { m.mesh.visible = true; m.rmesh.visible = false; }
  if (V.labels) {
    const view = $('rpView'), w = view.clientWidth, h = view.clientHeight, v = tmpV();
    for (const m of V.movers) {
      v.copy(m.grp.position); v.y += m.grp.userData.size * 0.35 + 3; v.project(cam);
      const d = m.grp.position.distanceTo(cam.position);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || d > 260) { m.label.hidden = true; continue; }
      const txt = `${esc(m.tr.name)}<small>${Math.round(IC.modelSize(m.tr.model))} m</small>`;
      if (m.label.innerHTML !== txt) m.label.innerHTML = txt;
      m.label.className = 'rp-lbl ' + (m === V.follow ? 'sel' : m.tr.side || '');
      m.label.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(0)}px,${((1 - v.y) / 2 * h - 4).toFixed(0)}px) translate(-50%,-100%)`;
      m.label.hidden = false;
    }
  }
  V.renderer.render(V.scene, cam);
}

IC.replayState = () => V;

})(window.IC);
