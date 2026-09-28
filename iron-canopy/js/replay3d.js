/* Iron Canopy — the replay window and the live view: engagements in 3D, from any angle, like a debrief.
   Both read the recorder (record.js). The replay builds a three.js scene of the last minutes around a place: the
   map's own tiles as the ground over the terrain relief, city blocks as buildings from models.js, airports with
   their buildings and tanks, every recorded mover as a low-poly model with a smoothed trail, banking in its turns.
   Missiles burn with a plume and a thick smoke trail, then coast on a thin one; lock lines show how each is guided;
   chaff and flares fall away behind their aircraft; "LOST LOCK", "DECOYED" and the rest show where they happened.
   Cameras: chase, target, side-on, slow orbit and a director that cuts between them; slow motion around each hit,
   and the replay records to a WebM video. The live view is a small window over the map that follows one thing
   as it happens, with the same scene, cameras and panel, and gives no orders.
   three.js is the one outside library in the game, loaded from cdnjs only when a window opens. Nothing else
   depends on it, and the game runs without it (the window then says the library could not be loaded). */
(function (IC) {
'use strict';
const U = IC.U;

const CFG = IC.REPLAY = {
  threeUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
  fallbackUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  texPx: 1024, trail: 60, maxLabels: 40, maxBoxes: 40000,
  // the live view: a small window on a ground of tiles built round what it follows, a few a frame
  live: { w: 480, h: 300, tile: 240, tilePx: 384, ring: 2, reach: 500, maxMovers: 50, maxLabels: 14, boxes: 5000, fps: 30, lag: 0.55 }
};
const KM = 10;   // world units a kilometre of height
// how long a missile's motor burns (s), for the plume and the thick smoke; the missile data can carry its own (burn)
const BURN = { IR: 2.5, IR2: 3, SR: 3, MR: 6, LR: 10, TBD: 8, HAT: 10, EXO: 14, AAM: 5, MRM: 5, SRM: 3, INT: 0, GBU: 0 };
const burnOf = tr => { const M = IC.MUN[tr.meta.mun]; return M && M.burn != null ? M.burn : BURN[tr.meta.mun] != null ? BURN[tr.meta.mun] : 4; };
const SMOKE = { LR: 0.26, TBD: 0.24, HAT: 0.3, EXO: 0.3, MR: 0.2 };   // smoke puff size, world units
const CAMS = [
  ['auto', 'Director', 'Cuts between the cameras at the moments that matter'],
  ['chase', 'Chase', 'Behind it, looking where it goes'],
  ['target', 'Target', 'From the target, looking back at what is coming'],
  ['side', 'Side-on', 'Across the line from missile to target: the geometry of the engagement'],
  ['spin', 'Slow orbit', 'Circles it slowly; drag to turn, wheel to zoom'],
  ['orbit', 'Orbit', 'Drag to turn round the scene, wheel to zoom, right-drag to pan'],
  ['follow', 'Follow', 'Orbit that stays with the chosen object (click one)'],
  ['free', 'Free', 'Fly: W A S D and Q E move, drag looks']
];
const TAG_COL = { 'LOST LOCK': '#8fa3b0', DECOYED: '#b48cff', NOTCHING: '#ff9ab8', 'PASSED ABOVE': '#8fa3b0', 'PASSED BELOW': '#8fa3b0', MISS: '#9fb0bc', EVADED: '#9fe0ff',
  MANOEUVRED: '#9fb0bc', 'OUT OF ENVELOPE': '#8fa3b0', HIT: '#ffb060', DAMAGED: '#ffd08a', FLARES: '#ffe08a', CHAFF: '#cfd6de', 'OUT OF ENERGY': '#8fa3b0' };

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

/* ---------- the windows ---------- */
const CSS = `
.replay{position:absolute;z-index:10;inset:12px;display:flex;flex-direction:column;border-radius:18px;background:rgba(6,11,16,.96);box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;animation:fadeIn .2s var(--ease)}
.live{position:absolute;z-index:9;display:flex;flex-direction:column;border-radius:14px;background:rgba(6,11,16,.94);box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;resize:both;min-width:280px;min-height:180px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);animation:fadeIn .2s var(--ease)}
.live.full{inset:12px!important;width:auto!important;height:auto!important;resize:none;z-index:10}
.rp-head{display:flex;gap:.8rem;align-items:center;padding:.6rem 1rem .5rem;flex-wrap:wrap}
.rp-head h2{margin:0;font-family:var(--display);font-weight:700;font-size:1.1rem;letter-spacing:.14em;text-transform:uppercase;color:var(--friend)}
.rp-head .sub{color:var(--muted);font-size:.9rem;flex:1;min-width:8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-head label{display:inline-flex;gap:.35rem;align-items:center;font-size:.85rem;color:var(--muted);cursor:pointer}
.rp-head select{background:var(--well);color:var(--text);border:0;border-radius:8px;padding:.2rem .4rem;font:inherit;font-size:.85rem}
.live .rp-head{padding:.3rem .4rem .3rem .8rem;gap:.4rem;cursor:move;user-select:none;flex-wrap:nowrap}
.live .rp-head h2{font-size:.85rem}.live .rp-head .sub{font-size:.78rem;min-width:3rem}.live .rp-head select{font-size:.78rem}
.live .rp-head .x{width:1.8rem;height:1.8rem;font-size:.9rem;flex:none}
.live .rp-head .x.live-dot{background:none;color:#ff5b4f;width:auto;cursor:move;font-size:.7rem}
.rp-view{position:relative;flex:1;min-height:0;background:#04080c}
.rp-view > canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.rp-view > canvas:active{cursor:grabbing}
.rp-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.rp-lbl{position:absolute;left:0;top:0;transform:translate(-50%,-100%);font-family:var(--mono);font-size:.72rem;line-height:1.15;color:var(--text);text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;pointer-events:none}
.rp-lbl small{display:block;color:var(--muted);font-size:.66rem}
.rp-lbl.enemy{color:#ffb0a8}.rp-lbl.civil{color:#b8f0d0}.rp-lbl.us{color:#c0e8ff}.rp-lbl.sel{color:var(--amber)}
.rp-tag{position:absolute;left:0;top:0;font-family:var(--display);font-weight:700;letter-spacing:.08em;font-size:.85rem;text-shadow:0 1px 3px #000,0 0 8px #000;white-space:nowrap;pointer-events:none}
.rp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:1rem 1.4rem;border-radius:12px;background:rgba(6,11,16,.85);color:var(--text);font-size:.95rem;max-width:26rem;text-align:center;z-index:2}
.rp-fps{position:absolute;right:.6rem;top:.4rem;font-family:var(--mono);font-size:.7rem;color:var(--muted)}
.rp-panel{position:absolute;left:.6rem;top:.5rem;z-index:1;padding:.45rem .65rem;border-radius:10px;background:rgba(6,11,16,.74);font-family:var(--mono);font-size:.72rem;line-height:1.4;color:var(--text);pointer-events:none;white-space:nowrap}
.rp-panel b{color:var(--amber);font-weight:600}.rp-panel .k{color:var(--muted);display:inline-block;width:3.3em}.rp-panel hr{border:0;border-top:1px solid rgba(255,255,255,.12);margin:.25rem 0}
.rp-panel .ph{display:inline-block;width:.62em;height:.62em;border-radius:50%;margin-right:.35em;vertical-align:-.05em}
.rp-panel .why{white-space:normal;color:var(--muted);font-family:var(--body,inherit);max-width:16rem;font-size:.68rem;line-height:1.25}
.live .rp-panel{font-size:.64rem;padding:.3rem .45rem}.live .rp-panel .why{display:none}
.rp-bar{display:flex;gap:.7rem;align-items:center;padding:.5rem 1rem .7rem;flex-wrap:wrap}
.rp-tl{position:relative;flex:1;min-width:10rem;display:flex;flex-direction:column;gap:2px}
.rp-tl input[type=range]{width:100%;accent-color:var(--friend);margin:0}
.rp-marks{position:relative;height:8px;margin:0 7px}
.rp-marks i{position:absolute;top:0;width:2px;height:8px;border-radius:1px;transform:translateX(-1px)}
.rp-bar .time{font-family:var(--mono);font-variant-numeric:tabular-nums;min-width:5.2rem;color:var(--text)}
.rp-bar .hint{font-size:.78rem;color:var(--muted);flex-basis:100%}
.rp-bar .rec{color:#ff5b4f;font-family:var(--mono);font-size:.8rem}
.rp-pop{position:absolute;right:1rem;top:3.2rem;z-index:3;background:rgba(10,16,22,.97);border-radius:12px;padding:.8rem 1rem;display:grid;gap:.5rem;font-size:.85rem;box-shadow:0 10px 30px rgba(0,0,0,.5);color:var(--text)}
.rp-pop label{display:flex;gap:.5rem;align-items:center;color:var(--muted)}
.rp-pop select{background:var(--well);color:var(--text);border:0;border-radius:8px;padding:.2rem .4rem;font:inherit}
.rp-side{position:absolute;z-index:2;right:0;top:0;bottom:0;width:15rem;overflow:auto;background:rgba(6,11,16,.7);padding:.5rem;display:grid;gap:.3rem;align-content:start;scrollbar-width:thin}
.rp-side div{display:flex;gap:.5rem;align-items:center;font-size:.78rem;color:var(--muted)}
.rp-side canvas{width:64px;height:48px;flex:none;background:rgba(255,255,255,.05);border-radius:6px}
.rp-side b{color:var(--text);font-weight:600}
.rp-side h4{margin:.4rem 0 0;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}`;

let V = null;   // the replay or the gallery
let L = null;   // the live view
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const style = () => { if (!$('rpStyle')) { const st = document.createElement('style'); st.id = 'rpStyle'; st.textContent = CSS; document.head.appendChild(st); } };
const camSelect = (cur, skip) => `<label title="Camera">Camera <select data-rp="cam">${CAMS.filter(c => !(skip || []).includes(c[0])).map(([k, n, t]) => `<option value="${k}" title="${esc(t)}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
const viewInner = () => `<canvas data-el="canvas"></canvas><div class="rp-labels" data-el="labels"></div><div class="rp-panel" data-el="panel" hidden></div><div class="rp-fps" data-el="fps"></div><div class="rp-msg" data-el="msg">Loading the 3D library…</div>`;

function newView(S, el, kind) {
  const v = { S, el, kind, els: {}, t: 0, t0: 0, t1: 1, playing: false, speed: 1, cam: 'orbit', hk: 1, radar: false, labels: true, locks: true, cone: false, slowmo: kind === 'replay',
    orbit: { yaw: -0.8, pitch: 0.55, dist: 10, tx: 0, ty: 0, tz: 0 }, free: null, keys: new Set(), movers: [], moverOf: new Map(), events: [], fx: [], tags: [], parts: [],
    fps: 0, frames: 0, fpsT: 0, camK: 1, lod: 0, cost: 0, panelT: 0 };
  v.$ = k => v.els[k] || (v.els[k] = el.querySelector(`[data-el="${k}"]`));
  return v;
}
const msg = (v, t) => { const m = v.$('msg'); if (m) { m.hidden = !t; m.innerHTML = t || ''; } };

function makeReplayWindow(title, sub) {
  style();
  let el = $('replay');
  if (!el) { el = document.createElement('div'); el.id = 'replay'; el.className = 'replay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Replay'); ($('app') || document.body).appendChild(el); }
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([v, n, t]) => `<button data-rp="${act}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="rp-head"><h2>${esc(title)}</h2><span class="sub" data-el="sub">${esc(sub)}</span>
      ${camSelect('orbit')}
      <label title="Only what our radars saw at the time, in identity colours"><input type="checkbox" data-rp="radar"> Radar picture</label>
      <label><input type="checkbox" data-rp="labels" checked> Labels</label>
      <label title="Lines from the radar or the missile to its target, coloured by how the missile is guided"><input type="checkbox" data-rp="locks" checked> Locks</label>
      <label title="The cone each missile's seeker looks through once it homes"><input type="checkbox" data-rp="cone"> Seeker</label>
      <label title="Slows the replay down around each hit and miss"><input type="checkbox" data-rp="slowmo" checked> Slow motion</label>
      <label>Heights <select data-rp="hk"><option value="1">real</option><option value="3">×3</option></select></label>
      <button class="btn sm" data-rp="video" data-el="videoBtn" title="Record the replay to a video file">⏺ Video</button>
      <button class="x" data-rp="close" aria-label="Close" title="Close (Esc)">✕</button></div>
    <div class="rp-view" data-el="view">${viewInner()}</div>
    <div class="rp-bar"><button class="btn" data-rp="play" data-el="play" title="Play or pause (space)">▶</button><span class="time" data-el="time">—</span>
      <div class="rp-tl"><div class="rp-marks" data-el="marks"></div><input type="range" data-el="range" min="0" max="1" step="0.05" value="0" aria-label="Time"></div>
      ${seg('speed', 1, [[0.125, '⅛×'], [0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×'], [10, '10×']])}
      <span class="rec" data-el="rec" hidden></span>
      <span class="hint" data-el="hint"></span></div>`;
  el.hidden = false;
  return el;
}

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
/* what several windows share and none disposes: materials, textures and the unit shapes effects are scaled from */
const shared = new Map();
function share(k, make) { let x = shared.get(k); if (!x) { x = make(); shared.set(k, x); } return x; }
const discMaterial = () => share('disc', () => new THREE.MeshBasicMaterial({ color: '#202428', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
/* a soft round sprite for smoke, flares and glows */
const puffTex = () => share('puff', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
// a cone along +x, base at 0 and apex at -1 (a motor plume), and one with its apex at 0 opening to +x (a seeker's view)
const plumeGeom = () => share('plumeG', () => { const g = new THREE.ConeGeometry(0.5, 1, 10, 1, true); g.rotateZ(Math.PI / 2); g.translate(-0.5, 0, 0); return g; });
const coneGeom = () => share('coneG', () => { const g = new THREE.ConeGeometry(1, 1, 18, 1, true); g.rotateZ(Math.PI / 2); g.translate(0.5, 0, 0); return g; });
const additive = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
/* a box on the ground with a yaw, into the merge arrays; ht up from y0. Sides a little darker than the roof */
function boxInto(acc, cx, cz, y0, w, d, ht, yaw, col) {
  const g = new THREE.BoxGeometry(w, ht, d);
  g.rotateY(-yaw); g.translate(cx, y0 + ht / 2, cz);
  append(acc, g, col, ny => ny > 0.5 ? 1 : ny < -0.5 ? 0.5 : 0.72);
}
/* a small repeatable random sequence, so an effect looks the same each time the replay passes it */
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- the ground and what stands on it ----------
   A region is a square { x, y, R } on the map; o is the scene's origin on the map (the scene works in world units
   from there, with heights at KM units a kilometre) */
const hT = (S, x, y) => S.flat ? 0 : IC.elevKm(x, y) * KM;
const inSq = (x, y, reg, pad) => Math.abs(x - reg.x) <= reg.R + (pad || 0) && Math.abs(y - reg.y) <= reg.R + (pad || 0);

/* the ground texture: the map exactly as the player sees it, drawn by the map's own painters into a canvas */
function groundTexture(S, reg, T, budget) {
  const cx = reg.x, cy = reg.y, R = reg.R, cv = document.createElement('canvas'); cv.width = cv.height = T;
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
    else if (S.terrain && IC.drawTerrain) { for (let i = 0; i < (budget ? 2 : 8); i++) if (!IC.drawTerrain(g, S.terrain, cam, 1, budget || 400, S)) break; }
    if (IC.drawRoads && !S.flat) IC.drawRoads(g, S, px, view);
    // the airports' pavement, buildings and parked aircraft; the aircraft moving are the replay's own
    for (const b of IC.bases(S)) if (b.parts && inSq(b.x, b.y, reg, b.radius || 60)) { moves.push([b, b.moves]); b.moves = []; IC.drawAirport(g, S, b, px, performance.now() / 1000, 1); }
  } catch (e) { console.warn('replay texture', e); }
  for (const [b, m] of moves) b.moves = m;
  Object.assign(cam, saved); if (rs) rs.view = savedView;
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}
function terrainMesh(S, reg, o, hk, N, T, budget) {
  const geo = new THREE.PlaneGeometry(2 * reg.R, 2 * reg.R, N, N);
  geo.rotateX(-Math.PI / 2);   // now in XZ, normal up; PlaneGeometry's v runs down, so z grows with the map's y
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hT(S, reg.x + pos.getX(i), reg.y + pos.getZ(i)) * hk);
  geo.computeVertexNormals();
  geo.translate(reg.x - o.x, 0, reg.y - o.y);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: groundTexture(S, reg, T, budget) }));
}
/* city blocks and village houses as buildings, one merged mesh, with the damage each event did */
function buildings(S, reg, o, hk, evs, sc, maxBoxes) {
  const acc = { pos: [], nor: [], col: [] }, items = [];
  const dmgT = new Map();
  for (const e of evs) for (const d of e.dmg || []) if (d.kind === 'block') dmgT.set(d.b, Math.min(dmgT.get(d.b) || 1e18, e.t));
  let boxes = 0;
  const add = (b, town) => {
    if (!inSq(b.x, b.y, reg) || boxes > maxBoxes) return;
    if (b.hp <= 0 && !dmgT.has(b)) return;   // rubble already: the map shows it
    const list = IC.blockBoxes(b, town), c = Math.cos(b.a), s = Math.sin(b.a), y0 = hT(S, b.x, b.y) * hk;
    const start = acc.pos.length / 3;
    for (const q of list) {
      const wx = b.x + q.x * c - q.y * s, wy = b.y + q.x * s + q.y * c;
      boxInto(acc, wx - o.x, wy - o.y, y0, q.w, q.h, q.ht * hk, b.a, `rgb(${q.col[0]},${q.col[1]},${q.col[2]})`); boxes++;
    }
    const dark = b.hp < 1 && !dmgT.has(b);
    items.push({ start, end: acc.pos.length / 3, t: dmgT.has(b) ? dmgT.get(b) : dark ? -1e18 : 1e18, dark: false });
  };
  for (const c of S.world.cities) if (inSq(c.x, c.y, reg, (c.r || 80) + 40)) for (const b of c.blocks) add(b, true);
  for (const v of S.world.villages) if (inSq(v.x, v.y, reg, 40)) for (const b of v.blocks || []) add(b, false);
  if (!acc.pos.length) return null;
  const geom = finish(acc), mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.items = items; mesh.userData.base = Float32Array.from(acc.col);
  sc.add(mesh);
  return mesh;
}
/* a building at an airport: its footprint raised by a height that fits its kind */
const PART_H = { terminal: 0.14, cargo: 0.12, hangar: 0.14, has: 0.08, alert: 0.08, tower: 0.55, fire: 0.08, atc: 0.05, ammo: 0.05, ils: 0.03, gradar: 0.04, hydrant: 0.05 };
const PART_COL = { terminal: '#b0b4ba', cargo: '#968c76', hangar: '#80868c', has: '#969284', alert: '#8c8c84', tower: '#bebec4', fire: '#b04638', atc: '#c8ccd0', ammo: '#607454', fuel: '#e2e0d4', ils: '#dc823c', gradar: '#c8ccd0', hydrant: '#788896' };
function airportParts(S, reg, o, hk, evs, sc) {
  const dmgT = new Map();
  for (const e of evs) for (const d of e.dmg || []) if (d.kind === 'part') dmgT.set(d.p, Math.min(dmgT.get(d.p) || 1e18, e.t));
  const items = [];
  for (const b of IC.bases(S)) if (b.parts && inSq(b.x, b.y, reg, b.radius || 60)) for (const p of b.parts) {
    // what was destroyed before the window is rubble on the map already; what died inside it stands until its hit
    if (!p.built || (p.hp <= 0 && !dmgT.has(p)) || p.kind === 'runway' || p.kind === 'taxi' || p.kind === 'apron') continue;
    if (!inSq(p.x, p.y, reg)) continue;
    const acc = { pos: [], nor: [], col: [] }, y0 = hT(S, p.x, p.y) * hk, col = PART_COL[p.kind] || '#969696', ht = (PART_H[p.kind] || 0.06) * hk, px = p.x - o.x, pz = p.y - o.y;
    if (p.kind === 'fuel') { const g = new THREE.CylinderGeometry(p.r, p.r, 0.12 * hk, 18); g.translate(px, y0 + 0.06 * hk, pz); append(acc, g, col, ny => ny > 0.5 ? 1 : 0.75); }
    else if (p.kind === 'tower') { boxInto(acc, px, pz, y0, p.w * 0.6, p.h * 0.6, ht * 0.8, p.a || 0, col); boxInto(acc, px, pz, y0 + ht * 0.8, p.w * 1.3, p.h * 1.3, ht * 0.2, p.a || 0, '#3a5068'); }
    else if (p.kind === 'hangar') { boxInto(acc, px, pz, y0, p.w, p.h, ht * 0.7, p.a || 0, col); boxInto(acc, px, pz, y0 + ht * 0.7, p.w * 0.9, p.h * 0.6, ht * 0.3, p.a || 0, col); }
    else if (p.kind === 'atc' || p.kind === 'gradar') { boxInto(acc, px, pz, y0, p.w, p.h, ht, p.a || 0, col); const g = new THREE.BoxGeometry(0.01, 0.03 * hk, p.w * 0.9); g.translate(px, y0 + ht + 0.03 * hk, pz); append(acc, g, '#e8ecf0'); }
    else boxInto(acc, px, pz, y0, p.w || p.r * 2, p.h || p.w || p.r * 2, ht, p.a || 0, col);
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

/* ---------- the movers: a model, a second in identity colour for the radar picture, a trail, a label; a missile
   also a motor plume and glow, its smoke, its lock lines and its seeker cone ---------- */
const SIDE_COL = { us: '#6fd2ff', enemy: '#ff5b4f', civil: '#7fe8b0' };
const AFF_COL = ['#f2d14a', '#6fd2ff', '#7fe8b0', '#ff9a3c', '#ff5b4f', '#8fa3b0'];
const SMOKE_N = 600;
function lineGeom(n, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setDrawRange(0, 0); return g;
}
function makeMover(v, tr) {
  const sc = v.scene, o = { livery: tr.meta.livery || null };
  const G = modelGeom(tr.model, o), geom = G.solid;
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const rmat = new THREE.MeshBasicMaterial({ color: SIDE_COL[tr.side] || '#ffffff' });
  const rmesh = new THREE.Mesh(geom, rmat); rmesh.visible = false;
  const grp = new THREE.Group(); grp.add(mesh); grp.add(rmesh); grp.userData.tr = tr; mesh.userData.tr = tr;
  if (G.discs) { const dm = new THREE.Mesh(G.discs, discMaterial()); mesh.add(dm); }
  // the smallest movers get a size floor so they can be seen at all
  const size = IC.modelSize(tr.model) / 100; grp.userData.size = size;
  const missile = tr.kind === 'missile', maxPts = missile || tr.kind === 'threat' || tr.kind === 'air' ? 1600 : 400;
  const line = new THREE.Line(lineGeom(maxPts), new THREE.LineBasicMaterial({ color: missile ? '#e8e8e0' : SIDE_COL[tr.side] || '#ffffff', transparent: true, opacity: missile ? 0.75 : 0.55 }));
  line.frustumCulled = false;
  sc.add(grp); sc.add(line);
  const label = document.createElement('div'); label.className = 'rp-lbl ' + (tr.side || ''); label.hidden = true;
  v.$('labels').appendChild(label);
  const m = { tr, grp, mesh, rmesh, rmat, line, label, maxPts, st: {}, st2: {}, att: {}, tst: {}, ust: {}, tmp: [], size,
    ac: tr.kind === 'air' || !!tr.meta.civil || (tr.kind === 'threat' && IC.THR[tr.meta.type] && IC.isAircraft({ d: IC.THR[tr.meta.type] })) };
  if (missile) {
    // the motor: a white-hot cone at the nozzle and a glow that reads from far away
    const len = size, plume = new THREE.Mesh(plumeGeom(), new THREE.MeshBasicMaterial({ color: '#ffc46a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    plume.position.x = -len / 2; plume.visible = false; grp.add(plume);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-len / 2, 0, 0]), 3));
    const glow = new THREE.Points(gg, new THREE.PointsMaterial({ size: 14, sizeAttenuation: false, map: puffTex(), color: '#ffc070', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.visible = false; grp.add(glow);
    const smoke = new THREE.Points(lineGeom(SMOKE_N), new THREE.PointsMaterial({ size: SMOKE[tr.meta.mun] || 0.14, map: puffTex(), color: '#dcdcd6', transparent: true, opacity: 0.5, depthWrite: false }));
    smoke.frustumCulled = false; sc.add(smoke);
    // the same smoke as a fine line of dots, so the burn still reads from far away
    const smokeFar = new THREE.Points(smoke.geometry, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, color: '#eeeeea', transparent: true, opacity: 0.5, depthWrite: false }));
    smokeFar.frustumCulled = false; smoke.add(smokeFar);
    const locks = new THREE.LineSegments(lineGeom(8, true), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    locks.frustumCulled = false; sc.add(locks);
    const cone = new THREE.Mesh(coneGeom(), additive('#ffffff', 0.05)); cone.visible = false; sc.add(cone);
    Object.assign(m, { plume, glow, smoke, locks, cone, burn: burnOf(tr), tL: IC.recFirstT(tr) });
  }
  v.movers.push(m); v.moverOf.set(tr, m);
  return m;
}
function dropMover(v, m) {
  // the model's geometry and the effect shapes are shared; everything else is the mover's own
  for (const x of [m.grp, m.line, m.smoke, m.locks, m.cone]) if (x) v.scene.remove(x);
  for (const x of [m.line, m.smoke, m.locks, m.glow]) if (x) x.geometry.dispose();
  for (const x of [m.line, m.smoke, m.locks, m.glow, m.cone, m.plume, m.mesh]) if (x) x.material.dispose();
  if (m.smoke) m.smoke.children[0].material.dispose();
  m.rmat.dispose();
  m.label.remove();
  v.movers.splice(v.movers.indexOf(m), 1); v.moverOf.delete(m.tr);
  if (v.follow === m) v.follow = null;
}
const trackOf = (v, ref) => ref && v.S.rec ? v.S.rec.of.get(ref) : null;
const moverOfRef = (v, ref) => { const tr = trackOf(v, ref); return tr ? v.moverOf.get(tr) : null; };
/* a recorded state as a point in the scene */
function scenePos(v, st, out, lift) {
  out.x = st.x - v.cx; out.y = hT(v.S, st.x, st.y) * v.hk + st.alt * KM * v.hk + (lift || 0); out.z = st.y - v.cy;
  return out;
}
const P1 = {}, P2 = {}, P3 = {};
function updMover(v, m, t) {
  const S = v.S, hk = v.hk, st = IC.recAt(m.tr, t, m.st);
  const hide = !st || (v.radar && m.tr.kind === 'threat' && !st.det && !m.tr.meta.civil && st.aff !== 1);
  m.grp.visible = !hide; m.vis = !!st && !hide;
  if (!st) { m.line.visible = false; m.label.hidden = true; if (m.smoke) { m.smoke.visible = false; m.locks.visible = false; m.cone.visible = false; } return; }
  const y = hT(S, st.x, st.y) * hk + st.alt * KM * hk;
  m.grp.position.set(st.x - v.cx, y, st.y - v.cy);
  // bank into turns and pitch with the climb (heights ×3 steepen the pitch as the scene does)
  const a = IC.recAttitude(m.tr, t, m.att);
  m.grp.rotation.set(0, -st.h, 0); m.grp.rotateZ(hk > 1 ? Math.atan(Math.tan(a.pitch) * hk) : a.pitch); if (a.roll) m.grp.rotateX(a.roll);
  // a flying thing far from the camera gets a size floor
  const d = m.grp.position.distanceTo(v.camera.position), floor = d * (m.tr.kind === 'veh' || m.tr.kind === 'unit' ? 0.004 : 0.008) / Math.max(m.size, 0.02);
  m.grp.scale.setScalar(Math.max(1, floor));
  // the radar picture: identity colours, and only what was seen
  m.mesh.visible = !v.radar; m.rmesh.visible = v.radar;
  if (v.radar) m.rmat.color.set(m.tr.kind === 'threat' ? AFF_COL[st.aff | 0] : SIDE_COL[m.tr.side] || '#fff');
  // the trail, smoothed between the samples
  const tl = m.tr.kind === 'missile' ? 900 : m.tr.kind === 'veh' || m.tr.kind === 'unit' ? 0 : (v.lod > 0 ? 30 : CFG.trail);
  if (tl && !hide) trail(v, m, t - tl, t, st, y); else m.line.visible = false;
  if (m.smoke) missileFx(v, m, t, st, hide);
}
/* the recorded samples, with points on the same cubic the replay flies between them */
function trail(v, m, ta, tb, st, y) {
  const S = v.S, hk = v.hk, P = m.tmp; P.length = 0; IC.recPath(m.tr, ta, tb, P);
  const arr = m.line.geometry.attributes.position.array, n4 = P.length / 4;
  const sub = n4 * 3 < m.maxPts - 2 ? 3 : n4 * 2 < m.maxPts - 2 ? 2 : 1, step = Math.max(1, Math.ceil(n4 / (m.maxPts - 2)));
  let n = 0;
  const put = (x, yy, alt) => { arr[n * 3] = x - v.cx; arr[n * 3 + 1] = hT(S, x, yy) * hk + alt * KM * hk; arr[n * 3 + 2] = yy - v.cy; n++; };
  for (let i = 0; i < n4 && n < m.maxPts - 1; i += step) {
    const j = i * 4;
    put(P[j], P[j + 1], P[j + 2]);
    if (sub > 1 && i + 1 < n4 && P[j + 7] - P[j + 3] < 3) {
      const a = i > 0 ? j - 4 : j, b = j + 4, c = i + 2 < n4 ? j + 8 : b, ta0 = a === j ? P[j + 3] - (P[b + 3] - P[j + 3]) : P[a + 3], tc = c === b ? P[b + 3] + (P[b + 3] - P[j + 3]) : P[c + 3];
      for (let s = 1; s < sub; s++) {
        const k = s / sub, H = (f) => IC.recHerm(P[a + f], P[j + f], P[b + f], P[c + f], ta0, P[j + 3], P[b + 3], tc, k);
        put(H(0), H(1), Math.max(0, H(2)));
      }
    }
  }
  arr[n * 3] = st.x - v.cx; arr[n * 3 + 1] = y; arr[n * 3 + 2] = st.y - v.cy; n++;
  m.line.geometry.attributes.position.needsUpdate = true; m.line.geometry.setDrawRange(0, n); m.line.visible = n > 1;
}
const lockCol = new Map();
/* a missile: motor and smoke while it burns, lock lines by guidance, the seeker's cone */
function missileFx(v, m, t, st, hide) {
  const S = v.S, hk = v.hk, age = t - m.tL, burning = !hide && age >= 0 && age < m.burn;
  m.plume.visible = burning; m.glow.visible = burning;
  if (burning) { const f = 0.85 + 0.3 * Math.abs(Math.sin(t * 61 + m.tL)); m.plume.scale.set(m.size * 1.6 * f, m.size * 0.22, m.size * 0.22); }
  m.line.material.opacity = age < m.burn ? 0.35 : 0.75;
  // the thick smoke the motor leaves while it burns, fading over the next minute
  const smokeOn = m.burn > 0 && v.lod < 2 && age > 0 && age < m.burn + 60;
  m.smoke.visible = smokeOn;
  if (smokeOn) {
    const P = m.tmp; P.length = 0; IC.recPath(m.tr, m.tL, Math.min(t, m.tL + m.burn), P);
    const arr = m.smoke.geometry.attributes.position.array, gap = m.smoke.material.size * 0.35;
    let n = 0;
    for (let j = 0; j + 4 < P.length + 4 && n < SMOKE_N; j += 4) {
      const x0 = P[j], y0 = P[j + 1], a0 = P[j + 2], last = j + 4 >= P.length;
      const x1 = last ? st.x : P[j + 4], y1 = last ? st.y : P[j + 5], a1 = last ? st.alt : P[j + 6];
      if (last && t > m.tL + m.burn) { arr[n * 3] = x0 - v.cx; arr[n * 3 + 1] = hT(S, x0, y0) * hk + a0 * KM * hk; arr[n * 3 + 2] = y0 - v.cy; n++; break; }
      const k = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x1 - x0, y1 - y0, (a1 - a0) * KM) / gap)));
      for (let s = 0; s < k && n < SMOKE_N; s++) { const f = s / k, x = x0 + (x1 - x0) * f, yy = y0 + (y1 - y0) * f; if (burning && Math.hypot(x - st.x, yy - st.y) < gap * 4) continue; arr[n * 3] = x - v.cx; arr[n * 3 + 1] = hT(S, x, yy) * hk + (a0 + (a1 - a0) * f) * KM * hk; arr[n * 3 + 2] = yy - v.cy; n++; }
    }
    m.smoke.geometry.attributes.position.needsUpdate = true; m.smoke.geometry.setDrawRange(0, n);
    m.smoke.material.opacity = 0.3 * U.clamp(1 - (age - m.burn) / 60, 0, 1); m.smoke.children[0].material.opacity = m.smoke.material.opacity * 1.6;
  }
  // lock lines: missile to target in the colour of its guidance; the battery's radar on the target for semi-active
  // and command guidance; the launcher's datalink to the missile in midcourse
  const G = IC.GUIDE[st.ph | 0] || IC.GUIDE[1];
  m.locks.visible = v.locks && !hide;
  m.cone.visible = false;
  if (!m.locks.visible && !v.cone) return;
  const tt = trackOf(v, m.tr.meta.tref), T = tt && IC.recAt(tt, t, m.tst), ut = trackOf(v, m.tr.meta.uref), Ln = ut && IC.recAt(ut, t, m.ust);
  const M = scenePos(v, st, P1), Tp = T && scenePos(v, T, P2), Lp = Ln && scenePos(v, Ln, P3, ut.kind === 'unit' ? 0.03 : 0);
  if (m.locks.visible) {
    const g = m.locks.geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
    let n = 0;
    const seg = (a, b, hex, k) => { let c = lockCol.get(hex); if (!c) { c = new THREE.Color(hex); lockCol.set(hex, c); } for (const p of [a, b]) { pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z; col[n * 3] = c.r * k; col[n * 3 + 1] = c.g * k; col[n * 3 + 2] = c.b * k; n++; } };
    const faint = G.k === 'lost' || G.k === 'decoy';
    if (Tp) seg(M, Tp, G.col, faint ? 0.35 : G.k === 'mid' ? 0.45 : 0.95);
    if (Lp && Tp && (G.k === 'sarh' || G.k === 'cmd')) seg(Lp, Tp, G.col, 0.55);
    if (Lp && (G.k === 'cmd' || G.k === 'mid')) seg(Lp, M, IC.GUIDE[1].col, 0.35);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.setDrawRange(0, n);
  }
  // the seeker's cone, once it homes on its own
  if (v.cone && !hide && (G.k === 'arh' || G.k === 'ir' || G.k === 'term' || G.k === 'sarh')) {
    const len = Tp ? Math.min(Math.hypot(Tp.x - M.x, Tp.y - M.y, Tp.z - M.z) * 1.1, 60) : 20, r = len * Math.tan(G.k === 'ir' ? 0.07 : 0.12);
    m.cone.visible = true; m.cone.position.copy(m.grp.position); m.cone.quaternion.copy(m.grp.quaternion); m.cone.scale.set(len, r, r);
    m.cone.material.color.set(G.col);
  }
}

/* ---------- events: flashes, smoke and fire; a proximity burst; chaff and flares; words where they happened ---------- */
function makeEvent(v, e) {
  const S = v.S, hk = v.hk, sc = v.scene;
  let top = 0;
  for (const d of e.dmg || []) if (d.kind === 'block') for (const q of IC.blockBoxes(d.b, true)) top = Math.max(top, q.ht); else if (d.kind === 'part') top = Math.max(top, PART_H[d.p.kind] || 0.06);
  const y0 = hT(S, e.x, e.y) * hk + e.alt * KM * hk + top * hk;
  const air = e.alt > 0.05, burst = e.kind === 'intercept' || (e.kind === 'kill' && air) || (e.kind === 'mstat' && (e.what === 'hit' || e.text === 'MISS'));
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: e.kind === 'launch' || e.kind === 'fire' ? '#ffe0a0' : '#ffb060', transparent: true, opacity: 0.9 }));
  flash.position.set(e.x - v.cx, y0, e.y - v.cy); flash.visible = false; sc.add(flash);
  const puffs = [], rnd = seeded(e.id * 7919);
  if (!e.quiet) for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshLambertMaterial({ color: e.kind === 'kill' || e.kind === 'intercept' ? '#9a9a98' : '#4a4442', transparent: true, opacity: 0.5 }));
    p.visible = false; sc.add(p);
    puffs.push({ m: p, dx: rnd() * 2 - 1, dz: rnd() * 2 - 1, k: 0.7 + rnd() * 0.6, ph: rnd() * 6 });
  }
  // a hit on the ground keeps burning for a while, so the damage still reads after the flash
  let fire = null;
  if (e.kind === 'impact' || e.kind === 'crash') { fire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2, 7), new THREE.MeshBasicMaterial({ color: '#ff8a30', transparent: true, opacity: 0.8, depthWrite: false })); fire.visible = false; sc.add(fire); }
  // a proximity fuse: fragments thrown out in a shell round the warhead
  let frag = null;
  if (burst) {
    const N = 90, g = lineGeom(N), dirs = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 0.6 + rnd() * 0.5; dirs[i * 3] = r * Math.cos(a) * k; dirs[i * 3 + 1] = u * k; dirs[i * 3 + 2] = r * Math.sin(a) * k; }
    g.setDrawRange(0, N);
    frag = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: '#ffd8a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    frag.frustumCulled = false; frag.visible = false; frag.userData.dirs = dirs; sc.add(frag);
  }
  const ev = { e, flash, puffs, fire, frag, y0, sz: burst && e.kind === 'mstat' ? 0.5 : e.sz || 1 };
  v.events.push(ev);
  return ev;
}
function updateEvent(ev, t, wind) {
  const age = t - ev.e.t, s = ev.sz;
  if (age < 0 || age > 90) { ev.flash.visible = false; if (ev.fire) ev.fire.visible = false; if (ev.frag) ev.frag.visible = false; for (const p of ev.puffs) p.m.visible = false; return; }
  if (ev.fire) { const f = ev.fire, on = age > 0.4 && age < 80; f.visible = on; if (on) { const k = age / 80; const r = s * 0.16 * (1 - 0.5 * k); f.scale.set(r, r * (1 + 0.2 * Math.sin(age * 9)), r); f.material.opacity = 0.85 * (1 - k); f.position.set(ev.flash.position.x, ev.y0 + r, ev.flash.position.z); } }
  if (age < 1.6) { ev.flash.visible = true; const k = age / 1.6; ev.flash.scale.setScalar(s * (0.06 + 0.4 * Math.sqrt(k))); ev.flash.material.opacity = 0.95 * (1 - k); } else ev.flash.visible = false;
  if (ev.frag) {
    const on = age < 1.8; ev.frag.visible = on;
    if (on) {
      const R = s * 0.9 * (1 - Math.exp(-age * 5)), d = ev.frag.userData.dirs, arr = ev.frag.geometry.attributes.position.array, p = ev.flash.position;
      for (let i = 0; i < d.length; i += 3) { arr[i] = p.x + d[i] * R; arr[i + 1] = p.y + d[i + 1] * R - age * age * 0.05; arr[i + 2] = p.z + d[i + 2] * R; }
      ev.frag.geometry.attributes.position.needsUpdate = true; ev.frag.material.opacity = 1 - age / 1.8;
    }
  }
  for (const p of ev.puffs) {
    const a = Math.max(0, age - p.ph * 0.15), life = 60 * p.k;
    if (a <= 0 || a > life) { p.m.visible = false; continue; }
    p.m.visible = true;
    const k = a / life, r = s * (0.1 + 0.5 * Math.sqrt(k)) * p.k;
    p.m.position.set(ev.flash.position.x + p.dx * s * 0.3 + wind.x * a * 0.12 + p.dx * a * 0.03, ev.y0 + a * 0.05 * s * p.k + r * 0.6, ev.flash.position.z + p.dz * s * 0.3 + wind.y * a * 0.12 + p.dz * a * 0.03);
    p.m.scale.setScalar(r); p.m.material.opacity = 0.6 * (1 - k) * (1 - k);
  }
}
/* chaff: a cloud of foil that blooms behind the aircraft and hangs, glinting. Flares: bright points thrown out
   behind it that slow in the air, drop and burn out in a few seconds, each with a short smoke trail */
function makeCm(v, e) {
  const flare = e.what === 'flare', rnd = seeded(e.id * 104729), N = flare ? 8 : 80, TR = flare ? 7 : 0;
  const dirs = new Float32Array(N * 3), life = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (flare) { const side = i % 2 ? 1 : -1, a = Math.atan2(e.vy, e.vx) + Math.PI + side * (0.6 + rnd() * 0.7); dirs[i * 3] = Math.cos(a) * (0.25 + rnd() * 0.2); dirs[i * 3 + 1] = -0.1 - rnd() * 0.15; dirs[i * 3 + 2] = Math.sin(a) * (0.25 + rnd() * 0.2); life[i] = 3.5 + rnd() * 1.5; }
    else { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 0.3 + rnd() * 0.7; dirs[i * 3] = r * Math.cos(a) * k; dirs[i * 3 + 1] = u * k * 0.6; dirs[i * 3 + 2] = r * Math.sin(a) * k; life[i] = 7 + rnd() * 4; }
  }
  const pts = new THREE.Points(lineGeom(N), new THREE.PointsMaterial(flare ? { size: 0.14, map: puffTex(), color: '#fff2c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }
    : { size: 2.2, sizeAttenuation: false, color: '#dfe6ee', transparent: true, opacity: 0.85, depthWrite: false }));
  pts.frustumCulled = false; pts.visible = false; v.scene.add(pts);
  let smoke = null;
  if (TR) { smoke = new THREE.Points(lineGeom(N * TR), new THREE.PointsMaterial({ size: 0.07, map: puffTex(), color: '#d0d0cc', transparent: true, opacity: 0.45, depthWrite: false })); smoke.frustumCulled = false; smoke.visible = false; v.scene.add(smoke); }
  const fx = { e, flare, N, TR, dirs, life, pts, smoke, y0: hT(v.S, e.x, e.y) * v.hk + e.alt * KM * v.hk };
  v.fx.push(fx);
  return fx;
}
function cmPos(fx, i, a, out, v) {
  // carried along with the aircraft's speed, which the air takes off it within a second or two
  const e = fx.e, tau = fx.flare ? 0.9 : 0.5, carry = tau * (1 - Math.exp(-a / tau)), d = fx.dirs;
  const spread = fx.flare ? a * 1.2 : 0.9 * (1 - Math.exp(-a * 1.3));
  out.x = e.x - v.cx + e.vx * carry + d[i * 3] * spread;
  out.z = e.y - v.cy + e.vy * carry + d[i * 3 + 2] * spread;
  out.y = fx.y0 + d[i * 3 + 1] * spread * (fx.flare ? 1 : v.hk) - (fx.flare ? 0.25 * a * a / (1 + 0.5 * a) : 0.015 * a) * v.hk;
  return out;
}
function updateCm(v, fx, t) {
  const age = t - fx.e.t, maxL = fx.flare ? 5 : 11;
  const on = age >= 0 && age < maxL + (fx.flare ? 3 : 0);
  fx.pts.visible = on; if (fx.smoke) fx.smoke.visible = on && v.lod < 2;
  if (!on) return;
  const arr = fx.pts.geometry.attributes.position.array, p = P1;
  let n = 0;
  for (let i = 0; i < fx.N; i++) { if (age > fx.life[i]) continue; cmPos(fx, i, age, p, v); arr[n * 3] = p.x; arr[n * 3 + 1] = p.y; arr[n * 3 + 2] = p.z; n++; }
  fx.pts.geometry.attributes.position.needsUpdate = true; fx.pts.geometry.setDrawRange(0, n);
  if (fx.flare) fx.pts.material.opacity = 0.75 + 0.25 * Math.sin(t * 40); else fx.pts.material.opacity = 0.85 * U.clamp(1 - age / maxL, 0, 1) * (0.7 + 0.3 * Math.sin(t * 23));
  if (fx.smoke && fx.smoke.visible) {
    const sa = fx.smoke.geometry.attributes.position.array; let k = 0;
    for (let i = 0; i < fx.N; i++) for (let j = 1; j <= fx.TR; j++) { const a = Math.min(age, fx.life[i]) - j * 0.3; if (a <= 0) continue; cmPos(fx, i, a, p, v); sa[k * 3] = p.x; sa[k * 3 + 1] = p.y + (age - a) * 0.02; sa[k * 3 + 2] = p.z; k++; }
    fx.smoke.geometry.attributes.position.needsUpdate = true; fx.smoke.geometry.setDrawRange(0, k);
    fx.smoke.material.opacity = 0.45 * U.clamp(1 - (age - 4) / 4, 0, 1);
  }
}
/* a word where something happened: LOST LOCK, DECOYED, NOTCHING, PASSED ABOVE, FLARES, ACTIVE */
function makeTag(v, e) {
  const el = document.createElement('div'); el.className = 'rp-tag'; el.textContent = e.text; el.hidden = true;
  el.style.color = TAG_COL[e.text] || (e.kind === 'lock' && IC.GUIDE[e.ph] ? IC.GUIDE[e.ph].col : '#e8eef2');
  v.$('labels').appendChild(el);
  const tag = { e, el, p: { x: e.x - v.cx, y: hT(v.S, e.x, e.y) * v.hk + e.alt * KM * v.hk, z: e.y - v.cy } };
  v.tags.push(tag);
  return tag;
}
function addEvent(v, e) {
  if (e.kind === 'cm') { makeCm(v, e); makeTag(v, e); return; }
  if (e.kind === 'lock') { if (e.text && !/guidance$/.test(e.text)) makeTag(v, e); return; }
  if (e.kind === 'mstat') { makeTag(v, e); if (e.what === 'hit' || e.text === 'MISS') makeEvent(v, e); return; }
  makeEvent(v, e);
}

/* ---------- the replay: open, close ---------- */
/* o: { x, y, t, follow (a game object with a recorded track), r (radius, world units), cam } */
IC.replayOpen = function (S, o) {
  o = o || {};
  if (V) IC.replayClose();
  if (L) IC.liveClose();
  const R0 = IC.recRange(S);
  const t = U.clamp(o.t != null ? o.t : S.time - 60, R0.t0, R0.t1);
  const near = (x, y) => IC.bases(S).find(b => b.parts && U.dxy(b.x, b.y, x, y) < (b.radius || 60) + 20) || S.world.cities.find(c => U.dxy(c.x, c.y, x, y) < (c.r || 60) + 20);
  const place = near(o.x, o.y);
  const R = o.r || (o.follow ? 150 : place && place.parts ? 55 : place ? 45 : 90);
  const where = place ? place.name : IC.nearestPlace(S, o.x, o.y);
  const el = makeReplayWindow('Replay', `${where} · ${U.hhmm(R0.t0)}–${U.hhmm(R0.t1)}`);
  const v = V = newView(S, el, 'replay');
  Object.assign(v, { cx: o.x, cy: o.y, R, t, t0: R0.t0, t1: R0.t1, cam: o.cam || (o.follow ? 'auto' : 'orbit'), followRef: o.follow || null, where, wasPaused: S.paused,
    orbit: { yaw: -0.8, pitch: 0.55, dist: Math.max(6, R * 0.9), tx: 0, ty: hT(S, o.x, o.y), tz: 0 } });
  S.paused = true;
  bindWindow(v);
  loadThree().then(() => { if (V === v) buildReplay(v); }).catch(e => { msg(v, 'The 3D library could not be loaded from cdnjs.cloudflare.com. Check the connection and open the replay again.'); console.warn(e); });
  return v;
};
IC.replayClose = function () {
  if (!V) return;
  const v = V; V = null;
  if (v.rec) stopVideo(v, true);
  disposeView(v);
  window.removeEventListener('keydown', v.onKey, true);
  window.removeEventListener('keyup', v.onKeyUp, true);
  v.S.paused = v.wasPaused;
  v.el.hidden = true; v.el.innerHTML = '';
  IC.ui && IC.ui.refresh && IC.ui.refresh(true);
};
IC.replayOpenFor = ref => V && IC.replayOpen(V.S, { follow: ref, x: ref.x, y: ref.y, t: V.t });
function disposeView(v) {
  v.closed = true;
  cancelAnimationFrame(v.raf);
  if (v.ro) v.ro.disconnect();
  window.removeEventListener('resize', v.onResize);
  if (!v.renderer) return;
  const keep = new Set(shared.values()); for (const g of modelCache.values()) { keep.add(g.solid); keep.add(g.discs); }
  v.scene.traverse(x => {
    if (x.geometry && !keep.has(x.geometry)) x.geometry.dispose();
    const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const m of ms) { if (m.map && !keep.has(m.map)) m.map.dispose(); if (!keep.has(m)) m.dispose(); }
  });
  v.renderer.dispose();
  if (v.renderer.forceContextLoss) v.renderer.forceContextLoss();
}

function bindWindow(v) {
  const el = v.el;
  el.onclick = e => {
    const b = e.target.closest('[data-rp]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    const a = b.dataset.rp, val = b.dataset.v;
    if (a === 'close') v.kind === 'live' ? IC.liveClose() : IC.replayClose();
    else if (a === 'play') togglePlay(v);
    else if (a === 'speed') { v.speed = +val; for (const x of el.querySelectorAll('[data-rp=speed]')) x.setAttribute('aria-pressed', +x.dataset.v === v.speed); }
    else if (a === 'above') { v.orbit.pitch = 1.5; v.orbit.yaw = -Math.PI / 2; }
    else if (a === 'full') liveFull(v);
    else if (a === 'toReplay') liveToReplay(v);
    else if (a === 'video') videoPopup(v);
    else if (a === 'vgo') { const f = el.querySelector('.rp-pop'); const [w, h] = f.querySelector('[data-rp=vres]').value.split('x').map(Number); const o = { w, h, labels: f.querySelector('[data-rp=vlab]').checked, from: f.querySelector('[data-rp=vfrom]').value }; f.remove(); startVideo(v, o); }
    else if (a === 'vstop') stopVideo(v);
    else if (a === 'vcancel') { const f = el.querySelector('.rp-pop'); if (f) f.remove(); }
  };
  el.onchange = e => {
    const a = e.target.dataset.rp;
    if (a === 'radar') v.radar = e.target.checked;
    else if (a === 'labels') { v.labels = e.target.checked; if (!v.labels) for (const m of v.movers) m.label.hidden = true; }
    else if (a === 'locks') v.locks = e.target.checked;
    else if (a === 'cone') v.cone = e.target.checked;
    else if (a === 'slowmo') v.slowmo = e.target.checked;
    else if (a === 'hk') { v.hk = +e.target.value; if (v.scene) rebuildStatic(v); }
    else if (a === 'cam') setCam(v, e.target.value);
  };
  el.oninput = e => { if (e.target.dataset.el === 'range') { v.t = +e.target.value; v.playing = false; v.$('play').textContent = '▶'; } };
  if (v.kind !== 'replay' && v.kind !== 'gallery') return;
  v.onKey = e => {
    if (V !== v) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { IC.replayClose(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.target.closest && e.target.closest('input,select')) return;
    if (k === ' ') { togglePlay(v); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') v.t = Math.max(v.t0, v.t - 5);
    else if (e.key === 'ArrowRight') v.t = Math.min(v.t1, v.t + 5);
    else if (k >= '1' && k <= '7') setCam(v, CAMS[+k - 1][0]);
    else if ('wasdqe'.includes(k)) { v.keys.add(k); if (v.cam !== 'free') setCam(v, 'free'); }
    else return;
    e.stopImmediatePropagation();
  };
  v.onKeyUp = e => { if (V === v) v.keys.delete(e.key.toLowerCase()); };
  window.addEventListener('keydown', v.onKey, true);
  window.addEventListener('keyup', v.onKeyUp, true);
}
function togglePlay(v) { if (v.kind !== 'replay') return; v.playing = !v.playing; if (v.playing && v.t >= v.t1 - 0.05) v.t = v.t0; v.$('play').textContent = v.playing ? '❚❚' : '▶'; }
const HINT = {
  orbit: 'Drag to orbit · wheel to zoom · right-drag to pan · click an object to follow it · ← → step 5 s · space plays · 1–7 cameras',
  follow: 'Following it · drag to look round it · wheel for distance · click another object to switch',
  free: 'Free camera: W A S D move, Q E down and up, drag to look · wheel changes speed',
  auto: 'The director cuts between chase, side-on and target cameras through each engagement · click an object to follow it',
  chase: 'Behind it, looking where it goes · wheel for distance · click another object to switch',
  target: 'From the target, looking back at the missile coming for it · wheel for distance',
  side: 'Side-on to the line from missile to target: the geometry of the engagement',
  spin: 'A slow orbit round it · drag to turn · wheel to zoom'
};
function setCam(v, c) {
  if (c === 'free' && !v.free && v.camera) { const d = v.camera.getWorldDirection(new THREE.Vector3()); v.free = { pos: v.camera.position.clone(), yaw: Math.atan2(d.z, d.x), pitch: Math.asin(U.clamp(d.y, -1, 1)) }; }
  if ((c === 'follow' || c === 'chase' || c === 'target' || c === 'side' || c === 'spin') && !v.follow && v.movers.length && v.kind === 'replay') v.follow = nearestMover(v);
  v.cam = c; v.snap = true;
  const sel = v.el.querySelector('[data-rp=cam]'); if (sel && sel.value !== c) sel.value = c;
  const h = v.$('hint'); if (h) h.textContent = HINT[c] || '';
}
function nearestMover(v) {
  let best = null, bd = 1e18;
  for (const m of v.movers) { const st = IC.recAt(m.tr, v.t, m.st); if (!st) continue; const d = U.dxy(st.x, st.y, v.cx, v.cy) + (m.tr.kind === 'missile' ? 0 : 5) + (m.tr.kind === 'unit' || m.tr.kind === 'veh' ? 40 : 0); if (d < bd) { bd = d; best = m; } }
  return best;
}

function resize(v) {
  const view = v.$('view'), w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
  if (v.rec) return;   // recording: the drawing buffer keeps the video's size
  v.renderer.setSize(w, h, false);
  v.camera.aspect = w / h;
  const side = v.kind === 'gallery' && v.$('side');   // the gallery centres its models in the part the side list leaves free
  if (side) v.camera.setViewOffset(w, h, side.offsetWidth / 2, 0, w, h);
  v.camera.updateProjectionMatrix();
}
function makeRenderer(v) {
  const canvas = v.$('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: v.kind === 'live' ? 'low-power' : 'default' }); } catch (e) { msg(v, 'WebGL is not available in this browser, so the 3D view cannot draw.'); return null; }
  renderer.setPixelRatio(Math.min(v.kind === 'live' ? 1.5 : 2, window.devicePixelRatio || 1));
  v.renderer = renderer;
  v.onResize = () => v.renderer && !v.closed && resize(v);
  window.addEventListener('resize', v.onResize);
  if (window.ResizeObserver) { v.ro = new ResizeObserver(v.onResize); v.ro.observe(v.$('view')); }
  return renderer;
}
/* sky, fog, the far ground and the lights, from the time of day */
function sceneBase(v, fogNear, fogFar, far) {
  const S = v.S, scene = v.scene = new THREE.Scene();
  const rev = +THREE.REVISION || 128, lk = rev >= 155 ? Math.PI : 1;
  const light = S.flat ? 1 : IC.daylight(S.time), dim = 0.35 + 0.65 * light;
  const sky = new THREE.Color('#0a1420').lerp(new THREE.Color('#9cc4e4'), light), gnd = new THREE.Color('#0c1410').lerp(new THREE.Color('#8e9a70'), light);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, fogNear, fogFar);
  v.beyond = new THREE.Mesh(new THREE.PlaneGeometry(far, far), new THREE.MeshLambertMaterial({ color: gnd })); v.beyond.rotation.x = -Math.PI / 2; v.beyond.position.y = -0.2; scene.add(v.beyond);
  v.hemi = new THREE.HemisphereLight(0xbfd4ee, 0x3a3428, 0.85 * lk * dim); scene.add(v.hemi);
  v.sun = new THREE.DirectionalLight(0xfff0dc, 1.0 * lk * dim); v.sun.position.set(-600, 540, 360); scene.add(v.sun);
  v.static = new THREE.Group(); scene.add(v.static);
  return scene;
}
function buildReplay(v) {
  const S = v.S, cx = v.cx, cy = v.cy, R = v.R;
  msg(v, 'Building the scene…');
  if (!makeRenderer(v)) return;
  sceneBase(v, R * 2.5, R * 9, R * 60);
  v.camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, R * 40);
  v.evs = IC.recEvents(S, v.t0, v.t1).filter(e => U.dxy(e.x, e.y, cx, cy) < R * 1.4);
  buildStatic(v);
  // the movers that came through the box in the window
  for (const tr of IC.recTracks(S)) if (IC.recNear(tr, cx, cy, R * 1.6, v.t0, v.t1)) makeMover(v, tr);
  // a missile's target and launcher come too, however far out the engagement began or ended
  for (const m of v.movers.slice()) if (m.tr.kind === 'missile') for (const r of [m.tr.meta.tref, m.tr.meta.uref]) { const tr = trackOf(v, r); if (tr && !v.moverOf.has(tr)) makeMover(v, tr); }
  for (const tr of IC.recTracks(S)) if (tr.kind === 'missile' && !v.moverOf.has(tr) && (v.moverOf.has(trackOf(v, tr.meta.tref)) || trackOf(v, tr.meta.tref) === trackOf(v, v.followRef)) && IC.recNear(tr, cx, cy, R * 6, v.t0, v.t1)) makeMover(v, tr);
  if (v.followRef) { v.follow = moverOfRef(v, v.followRef) || null; if (!v.follow && v.cam !== 'orbit') v.cam = 'orbit'; }
  for (const e of v.evs) addEvent(v, e);
  // slow motion gathers round these moments
  v.keyT = v.evs.filter(e => e.kind === 'kill' || e.kind === 'intercept' || (e.kind === 'mstat' && (e.what === 'hit' || e.what === 'miss'))).map(e => e.t).sort((a, b) => a - b);
  marks(v);
  bindPointer(v);
  resize(v);
  setCam(v, v.cam);
  const r = v.$('range'); r.min = v.t0; r.max = v.t1;
  msg(v, '');
  v.last = performance.now();
  frame(v);
}
function buildStatic(v) {
  const S = v.S, g = v.static, reg = { x: v.cx, y: v.cy, R: v.R }, o = { x: v.cx, y: v.cy };
  while (g.children.length) g.remove(g.children[0]);
  v.ground = terrainMesh(S, reg, o, v.hk, 96, v.R <= 60 ? CFG.texPx * 2 : CFG.texPx); g.add(v.ground);
  v.blocks = buildings(S, reg, o, v.hk, v.evs, g, CFG.maxBoxes);
  v.parts = airportParts(S, reg, o, v.hk, v.evs, g);
  // a faint ring at the edge so the box's end reads as a choice, not the edge of the world
  const ring = new THREE.Mesh(new THREE.RingGeometry(v.R * 0.995, v.R * 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x6fd2ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
}
function rebuildStatic(v) {
  if (v.ground && v.ground.material.map) v.ground.material.map.dispose();
  buildStatic(v);
  for (const ev of v.events) { ev.y0 = hT(v.S, ev.e.x, ev.e.y) * v.hk + ev.e.alt * KM * v.hk; ev.flash.position.y = ev.y0; }
  for (const fx of v.fx) fx.y0 = hT(v.S, fx.e.x, fx.e.y) * v.hk + fx.e.alt * KM * v.hk;
  for (const tg of v.tags) tg.p.y = hT(v.S, tg.e.x, tg.e.y) * v.hk + tg.e.alt * KM * v.hk;
}
/* the moments on the timeline: launches, hits, chaff and flares, lost locks */
function marks(v) {
  const box = v.$('marks'); if (!box) return;
  const span = Math.max(1, v.t1 - v.t0), col = e => e.kind === 'launch' ? '#9fb0bc' : e.kind === 'kill' || e.kind === 'intercept' ? '#ffb060' : e.kind === 'impact' || e.kind === 'crash' ? '#ff5b4f' : e.kind === 'cm' ? '#ffe08a' : e.kind === 'mstat' ? (TAG_COL[e.text] || '#b48cff') : null;
  box.innerHTML = v.evs.filter(e => col(e)).slice(-400).map(e => `<i style="left:${((e.t - v.t0) / span * 100).toFixed(2)}%;background:${col(e)}" title="${esc(U.hhmm(e.t) + ' ' + (e.text || e.kind))}"></i>`).join('');
}

/* ---------- pointer: orbit, pan, look, pick ---------- */
function bindPointer(v) {
  const canvas = v.$('canvas');
  let drag = null;
  canvas.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const O = v.orbit;
    if (v.cam === 'free' && v.free) { v.free.yaw += dx * 0.004; v.free.pitch = U.clamp(v.free.pitch - dy * 0.004, -1.5, 1.5); return; }
    // dragging takes the camera from the director or the chase: it becomes an orbit round the same thing
    if (v.cam !== 'orbit' && v.cam !== 'follow' && v.cam !== 'spin' && drag.moved && v.kind !== 'gallery') { const c = v.camera.position, T = v.lookAt || new THREE.Vector3(O.tx, O.ty, O.tz); O.tx = T.x; O.ty = T.y; O.tz = T.z; O.dist = Math.max(0.2, c.distanceTo(T)); O.yaw = Math.atan2(c.z - T.z, c.x - T.x); O.pitch = U.clamp(Math.asin(U.clamp((c.y - T.y) / O.dist, -1, 1)), 0.02, 1.55); setCam(v, v.follow && v.kind !== 'live' ? 'follow' : 'orbit'); }
    if (drag.b === 2 || drag.shift) {
      if (v.cam === 'follow') return;
      const k = O.dist * 0.0016, s = Math.sin(O.yaw), c = Math.cos(O.yaw);
      O.tx -= (dx * c - dy * s) * k * -1; O.tz -= (dx * s + dy * c) * k * -1;
    } else { O.yaw -= dx * 0.005; O.pitch = U.clamp(O.pitch + dy * 0.005, 0.02, 1.55); }
  };
  canvas.onpointerup = e => {
    if (drag && !drag.moved && drag.b === 0) pick(v, e, canvas);
    drag = null;
  };
  canvas.oncontextmenu = e => e.preventDefault();
  canvas.onwheel = e => {
    e.preventDefault(); e.stopPropagation();
    const k = Math.exp(e.deltaY * 0.0012);
    if (v.cam === 'free') v.freeSpd = U.clamp((v.freeSpd || 1) / k, 0.05, 40);
    else if (v.cam === 'chase' || v.cam === 'target' || v.cam === 'side' || v.cam === 'auto') v.camK = U.clamp(v.camK * k, 0.2, 30);
    else v.orbit.dist = U.clamp(v.orbit.dist * k, v.kind === 'gallery' ? 3 : 0.3, v.kind === 'gallery' ? 1500 : (v.R || 300) * 12);
  };
}
function pick(v, e, canvas) {
  const r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = -((e.clientY - r.top) / r.height * 2 - 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), v.camera);
  // a mover is picked by its mesh, or by being the nearest to the ray within a few pixels
  const meshes = v.movers.filter(m => m.grp.visible).map(m => m.mesh);
  const hit = rc.intersectObjects(meshes, false)[0];
  let best = hit ? hit.object.userData.tr : null;
  if (!best) {
    let bd = 1e9;
    for (const m of v.movers) { if (!m.grp.visible) continue; const d = rc.ray.distanceToPoint(m.grp.position), lim = Math.max(m.grp.userData.size * 2, m.grp.position.distanceTo(v.camera.position) * 0.02); if (d < lim && d < bd) { bd = d; best = m.tr; } }
  }
  if (!best) return;
  v.follow = v.moverOf.get(best) || v.movers.find(m => m.tr === best);
  if (v.kind === 'live') { v.focusRef = best.ref; liveTitle(v); }
  if (v.kind === 'gallery' || (v.kind === 'replay' && (v.cam === 'orbit' || v.cam === 'free'))) setCam(v, 'follow'); else v.snap = true;
}

/* ---------- engagements, the director, the cameras ---------- */
const ST_A = {}, ST_B = {};
function rangeAt(a, b, t) {
  const p = IC.recAt(a.tr, t, ST_A), q = IC.recAt(b.tr, t, ST_B);
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y, (p.alt - q.alt) * 10) : null;
}
/* the engagement the camera and the panel look at: the missile and its target around what is followed */
function engagement(v, F, t) {
  if (!F || !F.vis) return null;
  let m = null, tg = null;
  if (F.tr.kind === 'missile') { m = F; tg = moverOfRef(v, F.tr.meta.tref); }
  else {
    let bd = 1e18;
    // a missile chasing it, the nearest first; else the last one it fired
    for (const x of v.movers) if (x.tr.kind === 'missile' && x.vis && x.tr.meta.tref === F.tr.ref) { const d = rangeAt(x, F, t); if (d != null && d < bd) { bd = d; m = x; tg = F; } }
    if (!m) { let lt = -1e18; for (const x of v.movers) if (x.tr.kind === 'missile' && x.vis && x.tr.meta.uref === F.tr.ref && x.tL > lt) { lt = x.tL; m = x; tg = moverOfRef(v, x.tr.meta.tref); } }
  }
  if (!m) return null;
  const E = { m, tg: tg && tg.vis ? tg : null, r: null, cls: null, tti: null };
  if (E.tg) {
    E.r = rangeAt(m, E.tg, t); const r0 = rangeAt(m, E.tg, t - 0.5);
    if (E.r != null && r0 != null) { E.cls = (r0 - E.r) / 0.5; E.tti = E.cls > 0.05 ? E.r / E.cls : null; }
  }
  return E;
}
/* with nothing followed, the director films the missile fired last that is still flying */
function latestMissile(v, t) {
  let best = null;
  for (const m of v.movers) if (m.tr.kind === 'missile' && m.vis && (!best || m.tL > best.tL)) best = m;
  return best;
}
/* the director: chase just after launch, side-on while it flies, the target's view in the last seconds, a slow
   orbit where it ended; when nothing is in the air, it chases what it follows */
function director(v, t) {
  const E = v.eng, F = v.follow;
  if (E && E.tg) {
    const age = t - E.m.tL;
    const mode = age < 3.5 ? 'chase' : E.tti != null && E.tti < 3.5 ? 'target' : E.tti != null && E.tti < 10 ? 'side' : Math.floor((age - 3.5) / 7) % 2 ? 'side' : 'chase';
    return { mode, subj: E.m, key: mode + E.m.tr.id };
  }
  if (E) return { mode: 'chase', subj: E.m, key: 'chase' + E.m.tr.id };
  // just after a hit or a miss near what it follows: circle the place
  const end = v.endEv;
  if (end && t - end.t < 6) return { mode: 'spin', at: end, subj: F && F.vis ? F : null, key: 'end' + end.id };
  if (F && F.vis) return { mode: F.st.spd > 0.05 && F.tr.kind !== 'unit' && F.tr.kind !== 'veh' ? 'chase' : 'spin', subj: F, key: 'f' + F.tr.id };
  return { mode: 'spin', subj: null, key: 'none' };
}
/* the last hit or miss within reach of the follow, in the last few seconds */
function lastEnd(v, t) {
  const F = v.follow; let best = null;
  const list = v.kind === 'replay' ? v.evs : v.liveEvs || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]; if (e.t > t) continue; if (e.t < t - 6) break;
    if (!(e.kind === 'kill' || e.kind === 'intercept' || (e.kind === 'mstat' && (e.what === 'hit' || e.what === 'miss')))) continue;
    if (F && F.st && e.mref !== F.tr.ref && e.tref !== F.tr.ref && U.dxy(e.x, e.y, F.st.x, F.st.y) > 150) continue;
    best = e; break;
  }
  return best;
}
const tv = [];
const vec = i => tv[i] || (tv[i] = new THREE.Vector3());
function dirOf(m, out) { const h = m.st.h, p = m.att.pitch || 0; return out.set(Math.cos(h) * Math.cos(p), Math.sin(p), Math.sin(h) * Math.cos(p)); }
const camDist = m => Math.max(m.size * 7, m.tr.kind === 'missile' ? 0.45 : 0.5);
function camera(v, t, dtR) {
  const cam = v.camera, O = v.orbit;
  const shot = v.cam === 'auto' ? director(v, t) : { mode: v.cam, subj: v.follow, key: v.cam + (v.follow ? v.follow.tr.id : '') };
  shot.key += shot.subj && shot.subj.vis ? '' : '-';   // a cut when what it films comes into the picture
  if (shot.key !== v.shotKey) { v.snap = true; v.shotKey = shot.key; }
  v.shot = shot;
  const S = shot.subj && shot.subj.vis ? shot.subj : null, E = v.eng;
  const want = vec(0), look = vec(1), up = vec(9).set(0, 1, 0);
  let ok = false;
  if (shot.mode === 'free' && v.free) {
    const F = v.free, sp = (v.freeSpd || 1) * (v.R || 200) * 0.08 * dtR, fwd = vec(2).set(Math.cos(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), Math.sin(F.yaw) * Math.cos(F.pitch));
    const right = vec(3).set(-Math.sin(F.yaw), 0, Math.cos(F.yaw));
    if (v.keys.has('w')) F.pos.addScaledVector(fwd, sp); if (v.keys.has('s')) F.pos.addScaledVector(fwd, -sp);
    if (v.keys.has('d')) F.pos.addScaledVector(right, sp); if (v.keys.has('a')) F.pos.addScaledVector(right, -sp);
    if (v.keys.has('e')) F.pos.y += sp; if (v.keys.has('q')) F.pos.y -= sp;
    F.pos.y = Math.max(F.pos.y, hT(v.S, F.pos.x + v.cx, F.pos.z + v.cy) * v.hk + 0.05);
    cam.position.copy(F.pos); cam.lookAt(look.copy(F.pos).add(fwd)); v.lookAt = null;
    return;
  }
  if (shot.mode === 'chase' && S) {
    const d = camDist(S) * v.camK, f = dirOf(S, vec(2));
    // behind, a little above and to one side, so the trail and what lies ahead both show
    const side = vec(3).crossVectors(f, up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    want.copy(S.grp.position).addScaledVector(f, -d).addScaledVector(side, d * 0.3); want.y += d * 0.35;
    look.copy(S.grp.position).addScaledVector(f, d * 0.6); ok = true;
  } else if (shot.mode === 'target' && S) {
    // from the target, a little behind and above it, looking back at the missile
    const pair = E && (E.m === S || E.tg === S) && E.tg ? E : null;
    if (pair) {
      const T = pair.tg.grp.position, M = pair.m.grp.position, d = camDist(pair.tg) * v.camK, f = vec(2).copy(T).sub(M).normalize();
      want.copy(T).addScaledVector(f, d); want.y += d * 0.35; look.copy(M); ok = true;
    } else { const d = camDist(S) * v.camK, f = dirOf(S, vec(2)); want.copy(S.grp.position).addScaledVector(f, d * 1.2); want.y += d * 0.2; look.copy(S.grp.position); ok = true; }
  } else if (shot.mode === 'side' && S) {
    const pair = E && E.tg && (E.m === S || E.tg === S) ? E : null;
    const A = S.grp.position, B = pair ? (pair.m === S ? pair.tg : pair.m).grp.position : null;
    const mid = vec(2), axis = vec(3);
    if (B) { mid.copy(A).add(B).multiplyScalar(0.5); axis.copy(B).sub(A); } else { mid.copy(A); dirOf(S, axis); }
    const Ln = B ? axis.length() : camDist(S) * 6, perp = vec(4).crossVectors(axis, up).normalize();
    if (v.sidePerp && perp.dot(v.sidePerp) < 0) perp.negate();
    (v.sidePerp || (v.sidePerp = new THREE.Vector3())).copy(perp);
    const d = Math.max(Ln * 0.8, camDist(S) * 4) * v.camK;
    want.copy(mid).addScaledVector(perp, d); want.y += d * 0.18; look.copy(mid); ok = true;
  }
  if (!ok) {
    // orbit, follow and the slow orbit: round a point that may move with what is followed
    if (shot.mode === 'spin') O.yaw += dtR * 0.14;
    const at = shot.at ? vec(5).set(shot.at.x - v.cx, hT(v.S, shot.at.x, shot.at.y) * v.hk + shot.at.alt * KM * v.hk, shot.at.y - v.cy) : S ? S.grp.position : null;
    if (at && (shot.mode === 'follow' || shot.mode === 'spin' || shot.mode === 'chase' || shot.mode === 'target' || shot.mode === 'side' || v.kind === 'live')) {
      O.tx = at.x; O.ty = at.y; O.tz = at.z;
      if (v.snap && shot.mode === 'spin') O.dist = S ? Math.max(camDist(S) * 5, 1.2) : 3;
      if (v.kind !== 'live' && shot.mode === 'follow') O.dist = Math.min(O.dist, v.R * 2);
    }
    const px = O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, pz = O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist, py = O.ty + Math.sin(O.pitch) * O.dist;
    want.set(px, py, pz); look.set(O.tx, O.ty, O.tz);
    if (shot.mode === 'orbit' || shot.mode === 'follow') v.snap = true;   // the player's own camera answers at once
  }
  const gnd = hT(v.S, want.x + v.cx, want.z + v.cy) * v.hk + 0.03;
  if (want.y < gnd) want.y = gnd;
  // the cinematic cameras ease after what they film, so a jittery path does not shake the picture
  if (v.snap || !v.camPos || v.camPos.distanceTo(want) > 3 * Math.max(0.5, want.distanceTo(look))) { (v.camPos || (v.camPos = new THREE.Vector3())).copy(want); (v.lookAt || (v.lookAt = new THREE.Vector3())).copy(look); v.snap = false; }
  else { const k = 1 - Math.exp(-dtR * 7); v.camPos.lerp(want, k); v.lookAt.lerp(look, Math.min(1, k * 1.5)); }
  cam.position.copy(v.camPos); cam.lookAt(v.lookAt);
  const d = cam.position.distanceTo(v.lookAt);
  cam.near = Math.max(0.01, Math.min(d * 0.05, O.dist * 0.002)); cam.far = Math.max(2000, (v.R || 300) * 40); cam.updateProjectionMatrix();
}
/* how fast the replay runs: slower round each hit and miss */
function slowK(v) {
  if (!v.slowmo || !v.keyT || !v.keyT.length) return 1;
  let d = 1e9;
  for (const kt of v.keyT) { const x = Math.abs(v.t - kt); if (x < d) d = x; if (kt > v.t + 5) break; }
  return d < 1.2 ? 0.2 : d < 4 ? 0.2 + 0.8 * (d - 1.2) / 2.8 : 1;
}

/* ---------- every frame ---------- */
const tmpV = () => new THREE.Vector3();
function frame(v) {
  if (v.closed || !v.renderer) return;
  v.raf = requestAnimationFrame(() => frame(v));
  const now = performance.now();
  // the small live window draws at 30 fps and leaves the rest of the frame to the map
  if (v.kind === 'live' && !v.full && now - v.last < 1000 / CFG.live.fps - 4) return;
  const dtR = Math.min(0.1, (now - v.last) / 1000); v.last = now;
  v.frames++; if (now - v.fpsT > 1000) { v.fps = v.frames; v.frames = 0; v.fpsT = now; v.$('fps').textContent = `${v.fps} fps · ${v.movers.length} objects · ${(v.upMs || 0).toFixed(1)} ms`; }
  const S = v.S;
  if (v.kind === 'live') { v.t = Math.max(v.t, S.time - CFG.live.lag); liveSync(v, now); }
  else {
    if (v.playing) { v.t += dtR * v.speed * slowK(v); if (v.t >= v.t1) { v.t = v.t1; v.playing = false; v.$('play').textContent = '▶'; if (v.rec) stopVideo(v); } }
    v.$('range').value = v.t; v.$('time').textContent = `${U.hhmm(v.t)}:${String(Math.floor(v.t % 60)).padStart(2, '0')}`;
  }
  const t = v.t, wind = S.wind || { x: 0, y: 0 };
  for (const m of v.movers) updMover(v, m, t);
  v.eng = engagement(v, v.follow || (v.cam === 'auto' ? latestMissile(v, t) : null), t);
  v.endEv = v.cam === 'auto' ? lastEnd(v, t) : null;
  camera(v, t, dtR);
  if (v.beyond) { v.beyond.position.x = v.camera.position.x; v.beyond.position.z = v.camera.position.z; }
  for (const ev of v.events) updateEvent(ev, t, wind);
  for (const fx of v.fx) updateCm(v, fx, t);
  if (v.blocks) applyDamage(v.blocks, t);
  for (const p of v.parts) applyDamage(p, t);
  if (v.labels) labels(v, t); else for (const tg of v.tags) tg.el.hidden = true;
  if (now - v.panelT > 120) { v.panelT = now; panel(v, t); }
  // what a frame costs: the scene update in script, then the draw call submission (the GPU works after)
  const t1 = performance.now(); v.renderer.render(v.scene, v.camera); const t2 = performance.now();
  v.upMs = v.upMs == null ? t1 - now : v.upMs * 0.95 + (t1 - now) * 0.05; v.drawMs = v.drawMs == null ? t2 - t1 : v.drawMs * 0.95 + (t2 - t1) * 0.05;
  // detail goes before frame rate: shorter trails and no smoke when the scene gets expensive
  v.cost = v.upMs + v.drawMs; if (v.kind === 'live') v.lod = v.cost > 7 ? 2 : v.cost > 4 ? 1 : 0;
  if (v.rec) capture(v);
}
function labels(v, t) {
  const cam = v.camera, view = v.$('view'), w = view.clientWidth, h = view.clientHeight, p = tmpV();
  const list = [], max = v.kind === 'live' ? CFG.live.maxLabels : CFG.maxLabels;
  for (const m of v.movers) { if (!m.grp.visible) { m.label.hidden = true; continue; } list.push([m, m.grp.position.distanceTo(cam.position) - (m === v.follow ? 1e6 : 0)]); }
  list.sort((a, b) => a[1] - b[1]);
  list.forEach(([m], i) => {
    if (i >= max) { m.label.hidden = true; return; }
    p.copy(m.grp.position); p.y += m.grp.userData.size * m.grp.scale.x * 0.6; p.project(cam);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) { m.label.hidden = true; return; }
    const st = m.st, a = m.att, tr = m.tr, gnd = tr.kind === 'veh' || tr.kind === 'unit' || (tr.kind === 'gnd' && st.alt < 0.005);
    let sub;
    if (tr.kind === 'missile') { const G = IC.GUIDE[st.ph | 0]; sub = `${G ? G.name : ''} · ${U.kmh(st.spd)}${a.g > 2 ? ` · ${Math.round(a.g)} g` : ''}`; }
    else if (gnd) sub = st.spd > 0.02 ? U.kmh(st.spd) : tr.kind === 'unit' ? (st.det ? 'radar on' : 'radar silent') : 'stopped';
    else sub = `${m.ac ? IC.flText(st.alt) : IC.kmText(st.alt)} · ${st.spd > 0.02 ? U.kmh(st.spd) : 'stopped'}${a.g > 1.4 ? ` · ${a.g.toFixed(1)} g` : ''}${st.ph & 1 ? ' · notching' : ''}`;
    const txt = `${esc(tr.name)}<small>${sub}</small>`;
    if (m.label.innerHTML !== txt) m.label.innerHTML = txt;
    m.label.className = 'rp-lbl ' + (m === v.follow ? 'sel' : tr.side || '');
    m.lx = (p.x + 1) / 2 * w; m.ly = (1 - p.y) / 2 * h - 6;
    m.label.style.transform = `translate(${m.lx.toFixed(0)}px,${m.ly.toFixed(0)}px) translate(-50%,-100%)`;
    m.label.hidden = false;
  });
  // the words of the moment, for four seconds where they happened
  let shown = 0;
  const placed = [];
  for (let i = v.tags.length - 1; i >= 0; i--) {
    const tg = v.tags[i], age = t - tg.e.t;
    if (age < 0 || age > 4.5 || shown >= 10) { tg.el.hidden = true; continue; }
    p.set(tg.p.x, tg.p.y, tg.p.z).project(cam);
    if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) { tg.el.hidden = true; continue; }
    tg.lx = (p.x + 1) / 2 * w; tg.ly = (1 - p.y) / 2 * h - 22 - age * 4;
    // words at the same moment and place stack instead of overprinting
    for (let k = 0; k < placed.length; k++) { const q = placed[k]; if (Math.abs(q[0] - tg.lx) < 70 && Math.abs(q[1] - tg.ly) < 16) { tg.ly = q[1] - 17; k = -1; } }
    placed.push([tg.lx, tg.ly]);
    tg.el.style.transform = `translate(${tg.lx.toFixed(0)}px,${tg.ly.toFixed(0)}px) translate(-50%,-100%)`;
    tg.el.style.opacity = age < 3.3 ? 1 : (4.5 - age) / 1.2;
    tg.el.hidden = false; shown++;
  }
}

/* ---------- the panel: what a debrief shows for the chosen object ---------- */
const mach = (spd, alt) => spd * 100 / (340.3 - 4.05 * Math.min(11, Math.max(0, alt)));
const compass = h => Math.round(((h * 180 / Math.PI + 90) % 360 + 360) % 360);
function panelRows(v, t) {
  const F = v.follow && v.follow.vis ? v.follow : v.shot && v.shot.subj && v.shot.subj.vis ? v.shot.subj : null;
  if (!F) return null;
  const st = F.st, a = F.att, tr = F.tr, air = !(tr.kind === 'veh' || tr.kind === 'unit' || (tr.kind === 'gnd' && st.alt < 0.005)), rows = [];
  rows.push(['', `<b>${esc(tr.name)}</b>`]);
  if (air) {
    rows.push(['SPD', `${U.kmh(st.spd)} · M${mach(st.spd, st.alt).toFixed(2)}`]);
    rows.push(['ALT', F.ac ? `${IC.flText(st.alt)} · ${IC.kmText(st.alt)}` : IC.kmText(st.alt)]);
    rows.push(['HDG', `${String(compass(st.h)).padStart(3, '0')}° · ${a.g.toFixed(1)} g${tr.kind !== 'missile' ? ` · bank ${Math.round(Math.abs(a.roll) * 180 / Math.PI)}°${a.roll > 0.05 ? ' R' : a.roll < -0.05 ? ' L' : ''}` : ''}`]);
  } else rows.push(['', st.spd > 0.02 ? U.kmh(st.spd) : tr.kind === 'unit' ? (st.det ? 'radar on' : 'radar silent') : 'stopped']);
  if (tr.kind === 'missile') { const age = t - F.tL; rows.push(['MTR', F.burn && age < F.burn ? `burning · ${Math.ceil(F.burn - age)} s left` : `coasting · ${Math.round(age)} s flown`]); }
  else if (st.ph & 1) rows.push(['', '<span style="color:#ff9ab8">NOTCHING: side-on to the missile</span>']);
  const E = v.eng && (v.eng.m === F || v.eng.tg === F) ? v.eng : engagement(v, F, t);
  if (E) {
    rows.push(['hr']);
    const other = E.m === F ? E.tg : E.m;
    if (other) rows.push([E.m === F ? 'TGT' : 'MSL', esc(other.tr.name)]);
    if (E.r != null) rows.push(['RNG', `${U.km(E.r)}${E.cls != null ? ` · closing ${U.kmh(Math.max(0, E.cls))}` : ''}`]);
    if (E.tti != null) rows.push(['TTI', `${E.tti < 10 ? E.tti.toFixed(1) : Math.round(E.tti)} s`]);
    const G = IC.GUIDE[E.m.st.ph | 0];
    if (G) rows.push(['GDE', `<span class="ph" style="background:${G.col}"></span>${G.name}`], ['why', G.brief]);
  }
  return rows;
}
function panel(v, t) {
  const box = v.$('panel'); if (!box) return;
  const rows = panelRows(v, t); v.panelRows = rows;
  if (!rows) { box.hidden = true; return; }
  const html = rows.map(([k, x]) => k === 'hr' ? '<hr>' : k === 'why' ? `<div class="why">${esc(x)}</div>` : `<div>${k ? `<span class="k">${k}</span>` : ''}${x}</div>`).join('');
  if (box.innerHTML !== html) box.innerHTML = html;
  box.hidden = false;
}

/* ---------- video: the replay window recorded to a WebM file by the browser's own recorder ---------- */
function videoPopup(v) {
  if (v.rec) { stopVideo(v); return; }
  const old = v.el.querySelector('.rp-pop'); if (old) { old.remove(); return; }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { msg(v, 'This browser cannot record video from a page (it has no MediaRecorder).'); setTimeout(() => msg(v, ''), 4000); return; }
  const view = v.$('view'), w = view.clientWidth, h = view.clientHeight;
  const pop = document.createElement('div'); pop.className = 'rp-pop';
  pop.innerHTML = `<b>Record a video</b>
    <label>Size <select data-rp="vres"><option value="${w}x${h}">This window (${w}×${h})</option><option value="1280x720" selected>1280×720</option><option value="1920x1080">1920×1080</option></select></label>
    <label>From <select data-rp="vfrom"><option value="here">here (${U.hhmm(v.t)})</option><option value="start">the start (${U.hhmm(v.t0)})</option></select></label>
    <label><input type="checkbox" data-rp="vlab" checked> Labels and panel</label>
    <span class="hint">It plays at the speed you set (${v.speed}×), with slow motion if it is on, until the end or until you stop it. The file is WebM.</span>
    <div class="acts"><button class="act pri" data-rp="vgo">Record</button><button class="act" data-rp="vcancel">Cancel</button></div>`;
  v.el.appendChild(pop);
}
function startVideo(v, o) {
  const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h;
  const g = cv.getContext('2d');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
  let mr;
  try { mr = new MediaRecorder(cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: Math.round(o.w * o.h * 5) } : undefined); } catch (e) { msg(v, 'The browser refused to record: ' + esc(e.message)); return; }
  v.rec = { cv, g, o, chunks: [], mr, t0: v.t };
  mr.ondataavailable = e => { if (e.data && e.data.size) v.rec && v.rec.chunks.push(e.data); };
  // the drawing buffer takes the video's size while it records; the window shows it scaled
  v.renderer.setPixelRatio(1); v.renderer.setSize(o.w, o.h, false); v.camera.aspect = o.w / o.h; v.camera.updateProjectionMatrix();
  if (o.from === 'start') v.t = v.t0;
  v.playing = true; v.$('play').textContent = '❚❚';
  mr.start(250);
  const b = v.$('videoBtn'); if (b) { b.textContent = '■ Stop'; b.dataset.rp = 'vstop'; }
  const r = v.$('rec'); if (r) { r.hidden = false; r.textContent = `● REC ${o.w}×${o.h}`; }
}
function stopVideo(v, discard) {
  const R = v.rec; if (!R) return;
  v.rec = null;
  const done = new Promise(res => { R.mr.onstop = res; });
  try { R.mr.stop(); } catch (e) { /* already stopped */ }
  done.then(() => {
    const blob = new Blob(R.chunks, { type: 'video/webm' });
    IC.replayVideo = blob;   // the last recording, for the tools that save one
    if (discard || !blob.size) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iron-canopy-replay-${U.hhmm(R.t0).replace(':', '')}.webm`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  });
  if (!v.closed) {
    v.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); resize(v);
    const b = v.$('videoBtn'); if (b) { b.textContent = '⏺ Video'; b.dataset.rp = 'video'; }
    const r = v.$('rec'); if (r) r.hidden = true;
  }
  return done;
}
IC.replayVideoStart = o => V && V.renderer && startVideo(V, Object.assign({ w: 1280, h: 720, labels: true, from: 'here' }, o || {}));
IC.replayVideoStop = () => V && V.rec ? stopVideo(V) : Promise.resolve();
/* one frame of the video: the 3D picture, then the labels, the words of the moment and the panel drawn over it */
function capture(v) {
  const R = v.rec, g = R.g, W = R.o.w, H = R.o.h;
  g.drawImage(v.renderer.domElement, 0, 0, W, H);
  if (!R.o.labels) return;
  const view = v.$('view'), sx = W / Math.max(1, view.clientWidth), sy = H / Math.max(1, view.clientHeight), fs = Math.max(11, Math.round(13 * sy));
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.shadowColor = '#000'; g.shadowBlur = 4;
  for (const m of v.movers) {
    if (m.label.hidden || m.lx == null) continue;
    const [name, sub] = m.label.innerHTML.split('<small>');
    g.font = `${fs}px monospace`; g.fillStyle = m === v.follow ? '#f2b441' : m.tr.side === 'enemy' ? '#ffb0a8' : m.tr.side === 'civil' ? '#b8f0d0' : '#c0e8ff';
    g.fillText(name.replace(/&amp;/g, '&'), m.lx * sx, m.ly * sy - fs);
    g.font = `${Math.round(fs * 0.9)}px monospace`; g.fillStyle = '#9ab0bf'; g.fillText((sub || '').replace('</small>', ''), m.lx * sx, m.ly * sy);
  }
  g.font = `bold ${Math.round(fs * 1.25)}px sans-serif`;
  for (const tg of v.tags) if (!tg.el.hidden) { g.globalAlpha = +tg.el.style.opacity || 1; g.fillStyle = tg.el.style.color; g.fillText(tg.e.text, tg.lx * sx, tg.ly * sy); }
  g.globalAlpha = 1; g.textAlign = 'left'; g.textBaseline = 'top';
  const rows = v.panelRows;
  if (rows) {
    const lh = Math.round(fs * 1.35), list = rows.filter(r => r[0] !== 'why');
    g.fillStyle = 'rgba(6,11,16,0.7)'; g.fillRect(10 * sx, 8 * sy, 250 * sx, list.length * lh + 12);
    list.forEach(([k, x], i) => { if (k === 'hr') return; g.font = `${fs}px monospace`; g.fillStyle = '#9ab0bf'; g.fillText(k, 18 * sx, 8 * sy + 6 + i * lh); g.fillStyle = i ? '#e8eef2' : '#f2b441'; g.fillText(x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'), 18 * sx + fs * 3.2, 8 * sy + 6 + i * lh); });
  }
  g.font = `${fs}px monospace`; g.fillStyle = '#e8eef2'; g.textBaseline = 'bottom';
  g.fillText(`${v.where || ''} · ${U.hhmm(v.t)}:${String(Math.floor(v.t % 60)).padStart(2, '0')}`, 14, H - 10);
  g.shadowBlur = 0;
}

/* ---------- the live view: a small window over the map that follows one thing as it happens ---------- */
IC.liveOpen = function (S, ref) {
  if (!S.rec || !ref) return null;
  if (L && L.S === S) { L.focusRef = ref; L.follow = null; L.snap = true; liveTitle(L); if (L.tiles) liveSync(L, performance.now(), true); return L; }
  if (L) IC.liveClose();
  style();
  const el = document.createElement('div'); el.className = 'live'; el.id = 'liveView'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Live view');
  const host = $('app') || document.body, W = CFG.live.w, H = CFG.live.h;
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.style.left = Math.max(12, (host.clientWidth || innerWidth) - W - 24) + 'px'; el.style.top = Math.max(12, (host.clientHeight || innerHeight) - H - 110) + 'px';
  el.innerHTML = `<div class="rp-head" data-el="head"><span class="x live-dot" title="Live: it follows the game as it runs">● LIVE</span><span class="sub" data-el="sub"></span>
      ${camSelect('auto', ['free', 'follow'])}
      <button class="x" data-rp="toReplay" title="Replay the last 15 minutes here">⟲</button><button class="x" data-rp="full" data-el="fullBtn" title="Fill the screen">⤢</button><button class="x" data-rp="close" aria-label="Close" title="Close">✕</button></div>
    <div class="rp-view" data-el="view">${viewInner()}</div>`;
  host.appendChild(el);
  const v = L = newView(S, el, 'live');
  Object.assign(v, { focusRef: ref, cx: Math.round(ref.x), cy: Math.round(ref.y), cam: 'auto', t: S.time - CFG.live.lag, locks: true, tiles: null, liveEvs: [],
    orbit: { yaw: -0.8, pitch: 0.35, dist: 3, tx: 0, ty: 0, tz: 0 } });
  liveTitle(v);
  bindWindow(v); bindDrag(v);
  loadThree().then(() => { if (L === v) buildLive(v); }).catch(e => {
    msg(v, 'The 3D library could not be loaded from cdnjs.cloudflare.com, so the live view cannot draw. It closes in a few seconds.');
    IC.toast && IC.toast(S, 'warn', 'LIVE', 'The live view closed: the 3D library could not be loaded from cdnjs.cloudflare.com.');
    console.warn(e); setTimeout(() => { if (L === v) IC.liveClose(); }, 6000);
  });
  return v;
};
IC.liveClose = function () {
  if (!L) return;
  const v = L; L = null;
  disposeView(v);
  v.el.remove();
};
IC.liveState = () => L;
function liveTitle(v) {
  const tr = trackOf(v, v.focusRef), sub = v.$('sub'); if (!sub) return;
  const gone = tr && tr.t1 < v.S.time - 3;
  sub.textContent = tr ? `${tr.name}${gone ? ` · gone ${U.hhmm(tr.t1)}` : ''}` : 'nothing recorded yet';
}
function liveFull(v) {
  v.full = !v.full; v.el.classList.toggle('full', v.full);
  const b = v.$('fullBtn'); if (b) { b.textContent = v.full ? '⤡' : '⤢'; b.title = v.full ? 'Back to the small window' : 'Fill the screen'; }
  if (v.renderer) resize(v);
}
function liveToReplay(v) {
  const S = v.S, tr = trackOf(v, v.focusRef), st = tr && IC.recAt(tr, Math.min(v.t, tr.t1), {});
  const x = st ? st.x : v.cx, y = st ? st.y : v.cy;
  IC.replayOpen(S, { follow: v.focusRef, x, y, t: Math.max(IC.recRange(S).t0, S.time - 90), cam: 'auto' });
}
/* the header drags the window; the corner resizes it (CSS) */
function bindDrag(v) {
  const head = v.$('head');
  head.onpointerdown = e => {
    if (e.target.closest('button:not(.live-dot),select,label') || v.full) return;
    const r = v.el.getBoundingClientRect(), pr = v.el.parentElement.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    head.onpointermove = ev => {
      const x = U.clamp(ev.clientX - pr.left - dx, 0, pr.width - 80), y = U.clamp(ev.clientY - pr.top - dy, 0, pr.height - 40);
      v.el.style.left = x + 'px'; v.el.style.top = y + 'px';
    };
    head.onpointerup = () => { head.onpointermove = null; head.onpointerup = null; };
  };
  head.ondblclick = e => { if (!e.target.closest('button,select')) liveFull(v); };
}
function buildLive(v) {
  const C = CFG.live;
  if (!makeRenderer(v)) { setTimeout(() => { if (L === v) IC.liveClose(); }, 6000); return; }
  sceneBase(v, C.tile * 1.4, C.tile * (C.ring + 0.6), C.tile * 40);
  v.camera = new THREE.PerspectiveCamera(50, 1.6, 0.02, C.tile * 12);
  v.tiles = new Map(); v.tileQ = []; v.evSeen = 0;
  // what happened in the last half minute is shown as it comes in
  const R = v.S.rec; for (const e of R.ev) if (e.t < v.S.time - 30) v.evSeen = e.id;
  bindPointer(v);
  resize(v);
  setCam(v, v.cam);
  liveSync(v, performance.now(), true);
  msg(v, '');
  v.last = 0;
  frame(v);
}
/* keeps the live scene round what it follows: movers within reach, the events as they come, ground tiles */
function liveSync(v, now, force) {
  const S = v.S, R = S.rec, C = CFG.live;
  // the focus: where it is now, or where it was last seen
  const ftr = trackOf(v, v.focusRef);
  let fx = v.fx0 != null ? v.fx0 : v.cx, fy = v.fy0 != null ? v.fy0 : v.cy;
  if (ftr && ftr.n) { const st = IC.recAt(ftr, Math.min(v.t, ftr.t1), ST_A); if (st) { fx = st.x; fy = st.y; } }
  v.fx0 = fx; v.fy0 = fy;
  if (force || now - (v.syncT || 0) > 250) {
    v.syncT = now;
    const want = new Set();
    if (ftr) want.add(ftr);
    // what the followed thing fires and what chases it, and their targets and launchers, whatever the distance
    const rel = new Set([v.focusRef]);
    for (const tr of R.tracks) if (tr.kind === 'missile' && tr.t1 > v.t - 3 && (tr.meta.tref === v.focusRef || tr.meta.uref === v.focusRef || tr.ref === v.focusRef)) { want.add(tr); for (const r of [tr.meta.tref, tr.meta.uref]) { const x = trackOf(v, r); if (x) want.add(x); } }
    const near = [];
    for (const tr of R.tracks) {
      if (want.has(tr) || tr.t1 < v.t - 3 || !tr.n) continue;
      const d = U.dxy(IC.recGet(tr, tr.n - 1, 1), IC.recGet(tr, tr.n - 1, 2), fx, fy);
      if (d < C.reach) near.push([tr, d + (tr.kind === 'missile' ? 0 : tr.kind === 'veh' || tr.kind === 'unit' || tr.kind === 'gnd' ? 60 : 20)]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (const [tr] of near) { if (want.size >= C.maxMovers) break; want.add(tr); }
    for (const tr of want) if (!v.moverOf.has(tr)) makeMover(v, tr);
    for (const m of v.movers.slice()) if (!want.has(m.tr)) dropMover(v, m);
    if (ftr && !v.follow) v.follow = v.moverOf.get(ftr) || null;
    // new events within reach
    for (const e of R.ev) {
      if (e.id <= v.evSeen) continue;
      v.evSeen = e.id;
      if (U.dxy(e.x, e.y, fx, fy) > C.reach * 1.2 && !(e.mref && rel.has(e.tref))) continue;
      v.liveEvs.push(e); addEvent(v, e);
    }
    // effects that are over are let go
    const old = v.t - 95;
    if (v.events.length && v.events[0].e.t < old) v.events = v.events.filter(ev => { if (ev.e.t >= old) return true; for (const x of [ev.flash, ev.fire, ev.frag, ...ev.puffs.map(p => p.m)]) if (x) { v.scene.remove(x); x.geometry.dispose(); x.material.dispose(); } return false; });
    if (v.fx.length && v.fx[0].e.t < v.t - 20) v.fx = v.fx.filter(fx => { if (fx.e.t >= v.t - 20) return true; for (const x of [fx.pts, fx.smoke]) if (x) { v.scene.remove(x); x.geometry.dispose(); x.material.dispose(); } return false; });
    if (v.tags.length && v.tags[0].e.t < v.t - 10) v.tags = v.tags.filter(tg => { if (tg.e.t >= v.t - 10) return true; tg.el.remove(); return false; });
    if (v.liveEvs.length > 200) v.liveEvs = v.liveEvs.slice(-100);
    liveTitle(v);
    // the ground: tiles round the focus, the nearest first; far ones are let go
    const TS = C.tile, i0 = Math.floor(fx / TS), j0 = Math.floor(fy / TS), need = [];
    for (let i = i0 - C.ring; i <= i0 + C.ring; i++) for (let j = j0 - C.ring; j <= j0 + C.ring; j++) { const k = i + ',' + j; if (!v.tiles.has(k)) need.push([k, i, j, Math.hypot(i - i0, j - j0)]); }
    need.sort((a, b) => a[3] - b[3]); v.tileQ = need;
    for (const [k, T] of v.tiles) { const [i, j] = k.split(',').map(Number); if (Math.abs(i - i0) > C.ring + 1 || Math.abs(j - j0) > C.ring + 1) { v.static.remove(T); T.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); v.tiles.delete(k); } }
  }
  // one tile at a time, when the browser is idle, so building the ground never stalls the map
  if (v.tileQ.length && !v.tileBusy) {
    v.tileBusy = true;
    const go = () => { v.tileBusy = false; if (v.closed || !v.tileQ.length) return; const [k, i, j, d] = v.tileQ.shift(); if (!v.tiles.has(k)) buildTile(v, k, i, j, d); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 400 }); else setTimeout(go, 30);
  }
}
function buildTile(v, k, i, j, d) {
  const C = CFG.live, S = v.S, TS = C.tile, reg = { x: (i + 0.5) * TS, y: (j + 0.5) * TS, R: TS / 2 }, o = { x: v.cx, y: v.cy };
  if (reg.x < -TS || reg.y < -TS || reg.x > IC.WW + TS || reg.y > IC.WH + TS) { v.tiles.set(k, new THREE.Group()); return; }
  const t0 = performance.now(), g = new THREE.Group();
  g.add(terrainMesh(S, reg, o, v.hk, 28, C.tilePx, 10));
  if (v.lod < 2 && d < 1.5) { const b = buildings(S, reg, o, v.hk, [], g, C.boxes); if (b) g.add(b); }   // buildings only close in
  for (const p of airportParts(S, reg, o, v.hk, [], g)) g.add(p);
  v.static.add(g); v.tiles.set(k, g);
  v.tileMs = performance.now() - t0;
}

/* ---------- the gallery: every model in 3D on a grid, and from above down the side ---------- */
IC.replayGallery = function (S) {
  if (V) IC.replayClose();
  const el = makeReplayWindow('Models', 'Every model in 3D; the same models from above down the side');
  const v = V = newView(S, el, 'gallery');
  Object.assign(v, { cx: 0, cy: 0, R: 60, labels: true, wasPaused: S.paused, orbit: { yaw: 1.25, pitch: 0.7, dist: 110, tx: 0, ty: 0, tz: 0 } });
  S.paused = true;
  bindWindow(v);
  el.querySelector('.rp-bar').innerHTML = `<button class="btn" data-rp="above" title="Look straight down">From above</button><span class="hint">Drag to orbit · wheel to zoom · right-drag to pan · click a model to look at it. Models are at real size next to each other: a lorry is 10 m, a wide-body 64 m.</span>`;
  for (const x of el.querySelectorAll('[data-rp=radar],[data-rp=hk],[data-rp=locks],[data-rp=cone],[data-rp=slowmo],[data-rp=cam]')) x.closest('label').hidden = true;   // nothing recorded to show here
  const vb = v.$('videoBtn'); if (vb) vb.hidden = true;
  const side = document.createElement('div'); side.className = 'rp-side'; side.dataset.el = 'side'; v.$('view').appendChild(side);
  loadThree().then(() => { if (V === v) buildGallery(v, side); }).catch(e => { msg(v, 'The 3D library could not be loaded from cdnjs.cloudflare.com. Check the connection and open the gallery again.'); console.warn(e); });
  return v;
};
function buildGallery(v, side) {
  if (!makeRenderer(v)) return;
  const scene = v.scene = new THREE.Scene(); scene.background = new THREE.Color('#0a1420');
  v.camera = new THREE.PerspectiveCamera(45, 1.6, 0.5, 6000);   // the gallery is laid out in metres
  const lk = (+THREE.REVISION || 128) >= 155 ? Math.PI : 1;
  scene.add(new THREE.HemisphereLight(0xbfd4ee, 0x3a3428, 0.9 * lk));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.0 * lk); sun.position.set(-300, 400, 200); scene.add(sun);
  // a grey slab with a 10 m grid
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.fillStyle = '#3a4038'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); for (let i = 0; i <= 512; i += 32) { g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); } g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(1920, 1920), new THREE.MeshLambertMaterial({ map: tex })); slab.rotation.x = -Math.PI / 2; scene.add(slab);
  // in metres here (the models are scaled up a hundredfold), one row a group, spaced by size
  let z = -140;
  for (const grp of IC.MODEL_GROUPS) {
    const keys = Object.keys(IC.MODELS).filter(k => IC.MODELS[k].group === grp);
    const h4 = document.createElement('h4'); h4.textContent = grp; side.appendChild(h4);
    let x = -240, rowMax = 0;
    for (const k of keys) {
      const size = IC.modelSize(k), liv = grp === 'Civil aircraft' && k !== 'light' ? IC.LIVERY[(keys.indexOf(k) * 2) % IC.LIVERY.length] : null;
      if (x > 40) { x = -240; z += rowMax + 10; rowMax = 0; }   // wrap long groups so the grid stays compact
      x += size / 2 + 6;
      const tr = { id: k, kind: 'gallery', model: k, name: IC.MODELS[k].name, side: grp === 'Enemy weapons' ? 'enemy' : grp === 'Civil aircraft' ? 'civil' : 'us', meta: { livery: liv } };
      const m = makeMover(v, tr); m.grp.position.set(x, 0, z); m.grp.rotation.y = Math.PI / 2; m.grp.scale.setScalar(100); m.grp.userData.size = size; m.line.visible = false; m.fixed = true; m.vis = true;
      x += size / 2 + 6; rowMax = Math.max(rowMax, size);
      const row = document.createElement('div'); const c = IC.modelTopCanvas(k, 128, 96, { livery: liv }); row.appendChild(c);
      const b = document.createElement('b'); b.textContent = IC.MODELS[k].name; row.appendChild(b); side.appendChild(row);
    }
    z += rowMax + 14;
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const m of v.movers) { x0 = Math.min(x0, m.grp.position.x); x1 = Math.max(x1, m.grp.position.x); z0 = Math.min(z0, m.grp.position.z); z1 = Math.max(z1, m.grp.position.z); }
  Object.assign(v.orbit, { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, dist: Math.max(x1 - x0, z1 - z0) * 0.85 });
  bindPointer(v);
  resize(v);
  msg(v, '');
  v.last = performance.now();
  galleryFrame(v);
}
function galleryFrame(v) {
  if (v.closed || !v.renderer) return;
  v.raf = requestAnimationFrame(() => galleryFrame(v));
  const now = performance.now(), dtR = Math.min(0.1, (now - v.last) / 1000); v.last = now;
  v.frames++; if (now - v.fpsT > 1000) { v.fps = v.frames; v.frames = 0; v.fpsT = now; v.$('fps').textContent = `${v.fps} fps · ${v.movers.length} models`; }
  const cam = v.camera, O = v.orbit;
  if (v.cam === 'follow' && v.follow) { const p = v.follow.grp.position; O.tx = p.x; O.ty = p.y; O.tz = p.z; O.dist = Math.min(O.dist, Math.max(20, v.follow.grp.userData.size * 3)); }
  if (v.cam === 'free' && v.free) {
    const F = v.free, sp = (v.freeSpd || 1) * 60 * dtR, fwd = new THREE.Vector3(Math.cos(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), Math.sin(F.yaw) * Math.cos(F.pitch)), right = new THREE.Vector3(-Math.sin(F.yaw), 0, Math.cos(F.yaw));
    if (v.keys.has('w')) F.pos.addScaledVector(fwd, sp); if (v.keys.has('s')) F.pos.addScaledVector(fwd, -sp); if (v.keys.has('d')) F.pos.addScaledVector(right, sp); if (v.keys.has('a')) F.pos.addScaledVector(right, -sp); if (v.keys.has('e')) F.pos.y += sp; if (v.keys.has('q')) F.pos.y -= sp;
    cam.position.copy(F.pos); cam.lookAt(F.pos.clone().add(fwd));
  } else { cam.position.set(O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, Math.max(0.5, O.ty + Math.sin(O.pitch) * O.dist), O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist); cam.lookAt(O.tx, O.ty, O.tz); }
  cam.near = Math.max(0.2, O.dist * 0.002); cam.updateProjectionMatrix();
  for (const m of v.movers) { m.mesh.visible = true; m.rmesh.visible = false; }
  if (v.labels) {
    const view = v.$('view'), w = view.clientWidth, h = view.clientHeight, p = tmpV();
    for (const m of v.movers) {
      p.copy(m.grp.position); p.y += m.grp.userData.size * 0.35 + 3; p.project(cam);
      const d = m.grp.position.distanceTo(cam.position);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05 || d > 260) { m.label.hidden = true; continue; }
      const txt = `${esc(m.tr.name)}<small>${Math.round(IC.modelSize(m.tr.model))} m</small>`;
      if (m.label.innerHTML !== txt) m.label.innerHTML = txt;
      m.label.className = 'rp-lbl ' + (m === v.follow ? 'sel' : m.tr.side || '');
      m.label.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(0)}px,${((1 - p.y) / 2 * h - 4).toFixed(0)}px) translate(-50%,-100%)`;
      m.label.hidden = false;
    }
  }
  v.renderer.render(v.scene, cam);
}

IC.replayState = () => V;

})(window.IC);
