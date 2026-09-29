/* Iron Canopy — the replay window and the live view: engagements and airports in 3D, from any angle, like a debrief.
   Both read the recorder (record.js). The scene: the ground in three rings of tiles (fine near the camera, coarser
   out to the horizon, one stencil so each place is drawn by the finest ring that has it), the map's own painting
   as their texture over the terrain's real heights, with the ground made level under each airport; airports in 3D
   from their parts (runways with their markings and lights, taxiways, aprons and stands, terminals, hangars, the
   tower) with the aircraft parked at their stands; city blocks as buildings; every recorded mover as its model at
   real size, posed by IC.recPose: turned to its heading, banking and pitching, gear and flaps down to land, taxiing
   along the real taxiways; far away, a dot keeps it in sight. Missiles burn with a plume and smoke; lock lines show
   how each is guided; chaff and flares fall away; "LOST LOCK", "DECOYED" and the rest show where they happened.
   Nothing in the scene is made again from frame to frame: models, tiles and airports are built once and moved.
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
  trail: 60, maxLabels: 40, boxes: 6000,
  // the ground: tiles of T world units painted at px pixels, seg squares a side, ring tiles round the focus
  levels: [{ T: 60, px: 512, seg: 20, ring: 2 }, { T: 240, px: 512, seg: 20, ring: 2 }, { T: 960, px: 256, seg: 16, ring: 2 }],
  near: 0.01, far: 60000, farPx: 3, lodPx: 70,
  // the live view: a small window following one thing, what it shows round it
  live: { w: 480, h: 300, reach: 500, keep: 650, maxMovers: 50, maxLabels: 14, fps: 30, lag: 0.55 }
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
/* the tests hand in a stand-in for three.js to count what the view makes */
IC.replayUseThree = T => { THREE = T; };

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
.rp-side .ref{display:block;width:100%;height:auto;flex:none;background:none}
.rp-view > canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.rp-view > canvas:active{cursor:grabbing}
.rp-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.rp-lbl{position:absolute;left:0;top:0;will-change:transform;font-family:var(--mono);font-size:.72rem;line-height:1.15;color:var(--text);text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;pointer-events:none}
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
    orbit: { yaw: -0.8, pitch: 0.55, dist: 10, tx: 0, ty: 0, tz: 0 }, free: null, keys: new Set(), movers: [], moverOf: new Map(), events: [], fx: [], tags: [],
    fps: 0, frames: 0, fpsT: 0, camK: 1, lod: 0, cost: 0, panelT: 0, tiles: new Map(), tileQ: [], apts: new Map(), pools: new Map(), flat: [],
    made: { mover: 0, tile: 0, airport: 0, parked: 0, event: 0, pool: 0 } };
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

/* ---------- geometry: arrays into buffers ---------- */
function geom(pos, nor, col, uv, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}
const colCache = new Map();
const colorOf = hex => { let c = colCache.get(hex); if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); } return c; };
/* groups of a mesh from models.js (metres, x forward, y starboard, z up) into scene arrays (world units, y up, z the
   map's y): the axes swap, so each triangle's winding turns round; origin o and scale k (0.01 for metres) */
function toScene(me, names, cols, o, k, shade) {
  let n = 0; for (const nm of names) n += me.groups[nm].pos.length;
  const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
  let w = 0;
  const ox = o ? o[0] : 0, oy = o ? o[1] : 0, oz = o ? o[2] : 0;
  for (const nm of names) {
    const G = me.groups[nm], p = G.pos, q = G.nor;
    for (let i = 0; i < p.length; i += 9) for (const j of [0, 6, 3]) {
      const a = i + j, c = colorOf(cols[me.slots[G.col[a / 3]]] || me.slots[G.col[a / 3]]), s = shade ? shade(q[a + 2]) : 1;
      pos[w] = (p[a] - ox) * k; pos[w + 1] = (p[a + 2] - oz) * k; pos[w + 2] = (p[a + 1] - oy) * k;
      nor[w] = q[a]; nor[w + 1] = q[a + 2]; nor[w + 2] = q[a + 1];
      col[w] = c.r * s; col[w + 1] = c.g * s; col[w + 2] = c.b * s; w += 3;
    }
  }
  return geom(pos, nor, col);
}
const ANIM = { gear: 1, flap: 1, prop: 1, rotor: 1, radar: 1, turret: 1, launch: 1, ab: 1 };
const LIGHT_COL = { red: '#ff3a2a', green: '#3aff6a', white: '#ffffff', strobe: '#ffffff', beacon: '#ff2a1a', land: '#fff4d8' };
/* a model as the view uses it, built once per model, livery and detail:
   solid (everything that does not move), win (windows, lit at night), anim (each moving part with its pivot and axis),
   rest (the whole model at rest in one piece: far away, parked, or drawn many times over), lights, sizes */
const partsCache = new Map();
function modelParts(key, livery, body) {
  const ck = key + '|' + (livery ? livery.join() : '') + '|' + (body || '');
  let P = partsCache.get(ck); if (P) return P;
  const me = IC.modelMesh(key, 1), lo = IC.modelMesh(key, 0), cols = IC.liveryCols(livery, body);
  const names = k => Object.keys(me.groups).filter(k);
  const solid = names(n => !ANIM[me.groups[n].kind] && me.groups[n].kind !== 'win');
  const win = names(n => me.groups[n].kind === 'win');
  const restOf = m => Object.keys(m.groups).filter(n => { const g = m.groups[n]; return g.kind !== 'ab' && g.kind !== 'flap'; });
  P = {
    key, solid: toScene(me, solid, cols, null, 0.01), win: win.length ? toScene(me, win, cols, null, 0.01) : null,
    rest: toScene(lo, restOf(lo), cols, null, 0.01), restHi: toScene(me, restOf(me), cols, null, 0.01),
    anim: names(n => ANIM[me.groups[n].kind]).map(n => {
      const g = me.groups[n], pv = g.pivot;
      return { name: n, kind: g.kind, up: g.up, rpm: g.rpm, geom: toScene(me, [n], cols, pv, 0.01), pivot: [pv[0] * 0.01, pv[2] * 0.01, pv[1] * 0.01], axis: [g.axis[0], g.axis[2], g.axis[1]] };
    }),
    lights: me.lights.map(l => ({ p: [l.x * 0.01, l.z * 0.01, l.y * 0.01], kind: l.kind })),
    size: IC.modelSize(key) / 100, top: me.box[5] * 0.01, len: (me.box[3] - me.box[0]) * 0.01
  };
  const mg = me.groups.gearL || me.groups.gearR;
  P.xm = mg ? mg.pivot[0] * 0.01 : 0;
  partsCache.set(ck, P);
  return P;
}
/* what several windows share and none disposes: materials, textures, unit shapes */
const shared = new Map();
function share(k, make) { let x = shared.get(k); if (!x) { x = make(); shared.set(k, x); } return x; }
const solidMat = () => share('solid', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
const basicMat = () => share('basic', () => new THREE.MeshBasicMaterial({ vertexColors: true }));
/* windows: dark glass by day, warm light at night (the colour follows the time of day each frame) */
const winMat = () => share('win', () => new THREE.MeshBasicMaterial({ vertexColors: false, color: '#303a44' }));
const abMat = () => share('ab', () => new THREE.MeshBasicMaterial({ color: '#ffb070', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
const discMat = () => share('disc', () => new THREE.MeshBasicMaterial({ color: '#3a4046', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
/* a soft shadow on the ground under an aircraft that is on it or just above it */
const shadowTex = () => share('shadowTex', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
const quadG = () => share('quadG', () => geom(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), null, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), new Uint16Array([0, 2, 1, 0, 3, 2])));
/* a soft round sprite for smoke, flares, glows and lights */
const puffTex = () => share('puff', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
/* unit shapes built once from the model builder: a sphere, a cone along +x with its base at 0 and apex at -1 (a
   motor plume), a cone with its apex at 0 opening to +x (a seeker's view), a flame, a ring, a rotor disc */
function unitShape(k, build) { return share('shape:' + k, () => { const B = IC.MB.Builder(1); build(B); const me = IC.MB.finish(B, k); return toScene(me, Object.keys(me.groups), {}, null, 1); }); }
const sphereG = () => unitShape('sphere', B => { const pr = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; pr.push([Math.cos(a), Math.max(0.001, Math.sin(a))]); } IC.MB.lathe(B, pr, '#ffffff', { segs: 12 }); });
const plumeG = () => unitShape('plume', B => IC.MB.lathe(B, [[0, 0.5], [-1, 0.001]], '#ffffff', { segs: 10 }));
const coneG = () => unitShape('cone', B => IC.MB.lathe(B, [[0, 0.001], [1, 1]], '#ffffff', { segs: 18 }));
const flameG = () => unitShape('flame', B => IC.MB.lathe(B, [[-1, 0.55], [0, 0.4], [1, 0.001]], '#ffffff', { axis: 'z', segs: 7 }));
const discG = () => unitShape('disc', B => IC.MB.lathe(B, [[-0.005, 1], [0.005, 1]], '#ffffff', { axis: 'z', segs: 24, cap0: '#ffffff', cap1: '#ffffff' }));
const additive = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
/* a small repeatable random sequence, so an effect looks the same each time the replay passes it */
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function lineGeom(n, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setDrawRange(0, 0); return g;
}
const texSRGB = tex => { if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding; return tex; };

/* ---------- the ground's height ----------
   The terrain's real heights, in world units (KM a kilometre), except under our airports, which are graded level
   at the height of their middle out to beyond their furthest part, blending into the hills round them */
const hRaw = (S, x, y) => S.flat ? 0 : IC.elevKm(x, y) * KM;
function flatOf(v) {
  const S = v.S;
  v.flat = [];
  if (S.flat) return;
  for (const b of IC.bases(S)) {
    if (!b.parts || !b.parts.length) continue;
    let r = 10;
    for (const p of b.parts) for (const q of p.kind === 'runway' ? [p.a, p.b] : [p]) if (q && q.x != null) r = Math.max(r, U.dxy(q.x, q.y, b.x, b.y) + (p.w || p.r || 1));
    v.flat.push({ x: b.x, y: b.y, e: hRaw(S, b.x, b.y), r0: r + 12, r1: r + 32 });
  }
}
function hT(v, x, y) {
  let h = hRaw(v.S, x, y);
  for (const f of v.flat) {
    const dx = x - f.x, dy = y - f.y; if (dx > f.r1 || dx < -f.r1 || dy > f.r1 || dy < -f.r1) continue;
    const d = Math.hypot(dx, dy); if (d >= f.r1) continue;
    const k = d <= f.r0 ? 0 : (d - f.r0) / (f.r1 - f.r0), s = k * k * (3 - 2 * k);
    h = f.e + (h - f.e) * s;
  }
  return h;
}
const inSq = (x, y, reg, pad) => Math.abs(x - reg.x) <= reg.R + (pad || 0) && Math.abs(y - reg.y) <= reg.R + (pad || 0);

/* ---------- the ground: tiles in three rings ----------
   Each tile is a grid over the terrain with the map painted on it by the map's own painters (fields, forest, rivers,
   roads, towns). The finest tiles write the stencil first; a coarser tile only draws where no finer one has, so the
   rings meet without a seam and never flicker against each other. Beyond them, a wide disc in the haze. */
function tileMat(tex, li) {
  const m = new THREE.MeshLambertMaterial({ map: tex });
  m.stencilWrite = true; m.stencilRef = 4 - li; m.stencilZPass = THREE.ReplaceStencilOp;
  m.stencilFunc = li === 0 ? THREE.AlwaysStencilFunc : THREE.GreaterStencilFunc;
  return m;
}
/* small fields, a pixel or two each, in the colours of crops, grass and fallow */
const grain = () => share('grain', () => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), rnd = seeded(77);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { const r = rnd(), k = 0.75 + rnd() * 0.5, c = r < 0.25 ? [168, 156, 96] : r < 0.4 ? [136, 110, 84] : r < 0.7 ? [112, 132, 92] : [128, 128, 128]; g.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`; g.fillRect(rnd() * 128 | 0, rnd() * 128 | 0, 1 + rnd() * 3 | 0, 1 + rnd() * 2 | 0); }
  return c;
});
/* a tile's picture, painted in slices: a job that paints for up to ms milliseconds a call and says when it is done
   (the map paints its own tiles on demand; only a finished picture goes on the ground) */
function paintJob(v, reg, T, lod) {
  const cv = document.createElement('canvas'); cv.width = cv.height = T;
  return { v, reg, T, lod, cv, g: cv.getContext('2d'), z: T / (2 * reg.R), started: false };
}
function paintStep(J, ms) {
  const v = J.v, S = v.S, reg = J.reg, R = reg.R, g = J.g, z = J.z, px = 1 / z, T = J.T, lod = J.lod;
  const cam = IC.cam, saved = { x: cam.x, y: cam.y, z: cam.z, vw: cam.vw, vh: cam.vh }, view = { x0: reg.x - R, y0: reg.y - R, x1: reg.x + R, y1: reg.y + R };
  const rs = IC.rs, savedView = rs && rs.view;
  Object.assign(cam, { x: reg.x - R, y: reg.y - R, z, vw: T, vh: T });
  if (rs) rs.view = view;
  let done = true;
  try {
    g.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    if (!J.started) { J.started = true; g.fillStyle = '#3c4a3a'; g.fillRect(view.x0, view.y0, 2 * R, 2 * R); }
    if (S.flat) { g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = px; g.beginPath(); for (let x = Math.ceil(view.x0 / 10) * 10; x < view.x1; x += 10) { g.moveTo(x, view.y0); g.lineTo(x, view.y1); } for (let y = Math.ceil(view.y0 / 10) * 10; y < view.y1; y += 10) { g.moveTo(view.x0, y); g.lineTo(view.x1, y); } g.stroke(); }
    // the map's painting at the detail it has at this scale: done when a pass has nothing left to paint
    else if (S.terrain && IC.drawTerrain) done = !IC.drawTerrain(g, S.terrain, cam, 1, ms, S);
    if (done && !S.flat) {
      // the coarsest ring: the map's overall picture has no fields; a fine grain of them over it, so it reads like
      // the rings inside it
      if (lod === 2) { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.8; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(grain(), 'repeat'); g.fillRect(0, 0, T, T); g.restore(); }
      // roads near their real width (the map draws them wider to read from far out)
      if (IC.drawRoads && lod < 2) { cam.z = Math.max(z, lod ? 7 : 12); IC.drawRoads(g, S, px, view); cam.z = z; }
    }
  } catch (e) { console.warn('3D ground', e); }
  Object.assign(cam, saved); if (rs) rs.view = savedView;
  return done;
}
function paintTex(v, cv) {
  const tex = texSRGB(new THREE.CanvasTexture(cv));
  tex.anisotropy = v.aniso || 4;
  if (THREE.ClampToEdgeWrapping) tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
/* a grid over the terrain: n squares a side over the square reg, heights by hT, normals from the slopes */
function terrainGeom(v, reg, n, hk) {
  const N = n + 1, pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), idx = new Uint32Array(n * n * 6);
  const x0 = reg.x - reg.R, y0 = reg.y - reg.R, d = 2 * reg.R / n, H = new Float32Array((N + 2) * (N + 2));
  for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) H[(j + 1) * (N + 2) + i + 1] = hT(v, x0 + i * d, y0 + j * d) * hk;
  const h = (i, j) => H[(j + 1) * (N + 2) + i + 1];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    pos[k * 3] = x0 + i * d - v.cx; pos[k * 3 + 1] = h(i, j); pos[k * 3 + 2] = y0 + j * d - v.cy;
    const nx = h(i - 1, j) - h(i + 1, j), nz = h(i, j - 1) - h(i, j + 1), l = Math.hypot(nx, 2 * d, nz);
    nor[k * 3] = nx / l; nor[k * 3 + 1] = 2 * d / l; nor[k * 3 + 2] = nz / l;
    uv[k * 2] = i / n; uv[k * 2 + 1] = 1 - j / n;
  }
  let w = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * N + i, b = a + 1, c = a + N, e = c + 1; idx[w++] = a; idx[w++] = c; idx[w++] = b; idx[w++] = b; idx[w++] = c; idx[w++] = e; }
  return geom(pos, nor, null, uv, idx);
}
/* a tile of the ground: its job paints in slices; when the picture is done the tile goes on the ground whole */
function tileJob(v, key, li, i, j) {
  const L = CFG.levels[li], reg = { x: (i + 0.5) * L.T, y: (j + 0.5) * L.T, R: L.T / 2 };
  const J = paintJob(v, reg, L.px, li); Object.assign(J, { key, li, ms: 0 });
  if (reg.x < -L.T || reg.y < -L.T || reg.x > IC.WW + L.T || reg.y > IC.WH + L.T) J.off = true;
  return J;
}
function finishTile(v, J) {
  const S = v.S, li = J.li, L = CFG.levels[li], g = new THREE.Group(); g.userData.li = li;
  if (!J.off) {
    const mesh = new THREE.Mesh(terrainGeom(v, J.reg, L.seg, v.hk), tileMat(paintTex(v, J.cv), li));
    mesh.renderOrder = -4 + li; g.add(mesh);
    if (li === 0 && !S.flat) { const b = buildings(v, J.reg, CFG.boxes); if (b) g.add(b); }   // buildings only close in
    if (li === 0 && v.lowGnd === false) g.visible = false;
  }
  v.static.add(g); v.tiles.set(J.key, g); v.made.tile++;
  v.tileMs = J.ms; v.tileMsMax = Math.max(v.tileMsMax || 0, J.ms); v.tileMsSum = (v.tileMsSum || 0) + J.ms;
  return g;
}
function dropTile(v, key) {
  const T = v.tiles.get(key); if (!T) return;
  v.static.remove(T);
  T.traverse(x => { if (x.geometry && x.geometry !== v.keepGeom) x.geometry.dispose(); if (x.material && x.material !== solidMat()) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } });
  v.tiles.delete(key);
}
/* keeps the rings of tiles round (fx, fy): what is missing goes in the queue, coarse rings first so there is never a
   hole, then the nearest; what is well out of reach is let go */
function groundSync(v, fx, fy) {
  const need = [];
  CFG.levels.forEach((L, li) => {
    if (li === 0 && v.lowGnd === false) return;   // the finest ring only while the camera is low
    const i0 = Math.floor(fx / L.T), j0 = Math.floor(fy / L.T);
    for (let i = i0 - L.ring; i <= i0 + L.ring; i++) for (let j = j0 - L.ring; j <= j0 + L.ring; j++) { const k = li + ':' + i + ':' + j; if (!v.tiles.has(k)) need.push([k, li, i, j, (2 - li) * 1e4 + Math.hypot(i - i0, j - j0)]); }
    for (const k of [...v.tiles.keys()]) { const [l, i, j] = k.split(':').map(Number); if (l === li && (Math.abs(i - i0) > L.ring + 1 || Math.abs(j - j0) > L.ring + 1)) dropTile(v, k); }
  });
  need.sort((a, b) => a[4] - b[4]); v.tileQ = need;
}
/* works through the queue for up to ms milliseconds: a tile's painting may take several calls */
function groundWork(v, ms) {
  const t0 = performance.now();
  for (;;) {
    const left = ms - (performance.now() - t0); if (left <= 0) break;
    if (!v.job) {
      const q = v.tileQ.shift(); if (!q) break;
      const [k, li, i, j] = q; if (v.tiles.has(k) || (li === 0 && v.lowGnd === false)) continue;
      v.job = tileJob(v, k, li, i, j);
    }
    const J = v.job, a = performance.now(), done = J.off || paintStep(J, Math.max(2, left));
    J.ms += performance.now() - a;
    if (done) { v.job = null; if (!v.tiles.has(J.key)) finishTile(v, J); }
  }
}
/* the time a live view spends on the ground: a tile at a time when the browser is idle */
function groundIdle(v) {
  if (!(v.tileQ.length || v.job) || v.tileBusy) return;
  v.tileBusy = true;
  const go = () => { v.tileBusy = false; if (v.closed || !(v.tileQ.length || v.job)) return; groundWork(v, 6); };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 300 }); else setTimeout(go, 20);
}

/* city blocks and village houses in a tile as buildings, one merged mesh, with the damage each event did */
function buildings(v, reg, maxBoxes) {
  const S = v.S, hk = v.hk, evs = v.evs || [], list = [];
  const dmgT = new Map();
  for (const e of evs) for (const d of e.dmg || []) if (d.kind === 'block') dmgT.set(d.b, Math.min(dmgT.get(d.b) || 1e18, e.t));
  let boxes = 0;
  const add = (b, town) => {
    if (!inSq(b.x, b.y, reg) || boxes > maxBoxes) return;
    if (b.hp <= 0 && !dmgT.has(b)) return;   // rubble already: the map shows it
    const bx = IC.blockBoxes(b, town); boxes += bx.length; list.push([b, bx]);
  };
  for (const c of S.world.cities) if (inSq(c.x, c.y, reg, (c.r || 80) + 40)) for (const b of c.blocks) add(b, true);
  for (const vl of S.world.villages) if (inSq(vl.x, vl.y, reg, 40)) for (const b of vl.blocks || []) add(b, false);
  if (!boxes) return null;
  const pos = new Float32Array(boxes * 30 * 3), nor = new Float32Array(boxes * 30 * 3), col = new Float32Array(boxes * 30 * 3), items = [];
  let w = 0;
  const put = (x, y, z, nx, ny, nz, c, k) => { pos[w] = x; pos[w + 1] = y; pos[w + 2] = z; nor[w] = nx; nor[w + 1] = ny; nor[w + 2] = nz; col[w] = c[0] * k; col[w + 1] = c[1] * k; col[w + 2] = c[2] * k; w += 3; };
  for (const [b, bx] of list) {
    const cs = Math.cos(b.a), sn = Math.sin(b.a), y0 = hT(v, b.x, b.y) * hk, start = w / 3;
    for (const q of bx) {
      const cx = b.x + q.x * cs - q.y * sn - v.cx, cz = b.y + q.x * sn + q.y * cs - v.cy, ht = q.ht * hk;
      const c = colorOf(`rgb(${q.col[0]},${q.col[1]},${q.col[2]})`), C = [c.r, c.g, c.b];
      const hx = q.w / 2, hz = q.h / 2, P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, d]) => [cx + a * cs - d * sn, cz + a * sn + d * cs]);
      // roof, then the four walls a little darker (no floor: nobody sees it)
      for (const [a, b2, c2] of [[0, 3, 2], [0, 2, 1]]) for (const k of [a, b2, c2]) put(P[k][0], y0 + ht, P[k][1], 0, 1, 0, C, 1);
      for (let e = 0; e < 4; e++) {
        const A = P[e], B2 = P[(e + 1) % 4], nx = (B2[1] - A[1]), nz = -(B2[0] - A[0]), l = Math.hypot(nx, nz) || 1, k = 0.62 + 0.14 * (e % 2);
        for (const [p, y] of [[A, y0], [B2, y0], [B2, y0 + ht], [A, y0], [B2, y0 + ht], [A, y0 + ht]]) put(p[0], y, p[1], -nx / l, 0, -nz / l, C, k);
      }
    }
    items.push({ start, end: w / 3, t: dmgT.has(b) ? dmgT.get(b) : b.hp < 1 ? -1e18 : 1e18, dark: false });
  }
  const mesh = new THREE.Mesh(geom(pos.subarray(0, w), nor.subarray(0, w), col.subarray(0, w)), solidMat());
  mesh.userData.items = items; mesh.userData.base = Float32Array.from(col.subarray(0, w));
  v.dmgMeshes.push(mesh);
  return mesh;
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

/* ---------- airports in 3D ----------
   The ground of an airport is level (hT), so its pavement is one flat picture: the map's own painting of aprons,
   stands, taxiways, pads and shoulders, cut out where there is no pavement. Runways lie on top with markings painted
   at a finer scale: threshold bars, designators, touchdown zone, aiming point, centreline, edges, craters. Buildings
   from their footprints at heights that fit them; lights for the night; the aircraft parked at their stands. */
const PAVE = { runway: 1, taxi: 1, apron: 1, surface: 1, deice: 0, fuelpad: 0 };
/* pavement lies 30 cm above the level ground and writes no depth: its layers are drawn in this order over one
   another (the airport's picture, aprons, taxiway joints, taxiways, runways), so where two meet nothing can flicker */
const LIFT = { pad: 0.003, rw: 0.004 };
const PAVE_ORDER = { pad: 1, apron: 2, joint: 3, taxi: 4, runway: 5 };
function paveMat(o, order, mesh) { const m = new THREE.MeshLambertMaterial(o); m.depthWrite = false; mesh.material = m; mesh.renderOrder = PAVE_ORDER[order]; return mesh; }
function aptPad(v, b, f) {
  const S = v.S, R = f.r0, T = Math.min(2048, Math.pow(2, Math.ceil(Math.log2(Math.max(256, R * 2 * 36)))));
  const cv = document.createElement('canvas'); cv.width = cv.height = T;
  const g = cv.getContext('2d'), z = T / (2 * R), px = 1 / z;
  const cam = IC.cam, saved = { x: cam.x, y: cam.y, z: cam.z, vw: cam.vw, vh: cam.vh }, rs = IC.rs, savedView = rs && rs.view;
  // the airport as the map paints it, without what the 3D scene shows itself: moving and parked aircraft, lights
  // (and the arrows the map shows for which way each runway is in use)
  const hide = { moves: b.moves, roster: S.roster, tb: S.av && S.av.tailById, tt: S.av && S.av.tailMapT, cfg: b.cfg };
  Object.assign(cam, { x: b.x - R, y: b.y - R, z, vw: T, vh: T }); if (rs) rs.view = { x0: b.x - R, y0: b.y - R, x1: b.x + R, y1: b.y + R };
  b.moves = []; S.roster = []; b.cfg = null; if (S.av) { S.av.tailById = new Map(); S.av.tailMapT = S.time; }
  try { g.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z); IC.drawAirport(g, S, b, px, 0, 1); } catch (e) { console.warn('3D airport', e); }
  b.moves = hide.moves; S.roster = hide.roster; b.cfg = hide.cfg; if (S.av) { S.av.tailById = hide.tb; S.av.tailMapT = hide.tt; }
  Object.assign(cam, saved); if (rs) rs.view = savedView;
  const tex = texSRGB(new THREE.CanvasTexture(cv)); tex.anisotropy = v.aniso || 4;
  const y = f.e * v.hk + LIFT.pad, x0 = b.x - R - v.cx, z0 = b.y - R - v.cy, x1 = x0 + 2 * R, z1 = z0 + 2 * R;
  const pos = new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]), nor = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  return paveMat({ map: tex, alphaTest: 0.5 }, 'pad', new THREE.Mesh(geom(pos, nor, null, uv, new Uint16Array([0, 3, 2, 0, 2, 1]))));
}
/* a runway's surface at 128 × 2048 pixels, end a at the bottom: pavement, shoulders, markings, craters */
function runwayTex(v, rw) {
  const L = IC.rwLen(rw) * 100, W = rw.w * 100 + 16, cv = document.createElement('canvas'); cv.width = 128; cv.height = 2048;
  const g = cv.getContext('2d'), sx = 128 / W, sy = 2048 / L, mat = IC.paveOf(rw);
  const base = mat === 'asph' ? '#3a3c3e' : mat === 'grass' ? '#5e7440' : mat === 'rconc' ? '#8a8c8a' : '#7c7e7a';
  g.fillStyle = mat === 'grass' ? '#5e7440' : '#55585a'; g.fillRect(0, 0, 128, 2048);          // shoulders
  const x0 = 8 * sx, x1 = 128 - 8 * sx, cx = 64; g.fillStyle = base; g.fillRect(x0, 0, x1 - x0, 2048);
  // slabs and rubber: panel joints, dark tyre marks where aircraft touch down
  if (mat !== 'grass') {
    g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < 2048; y += 7.5 * sy) g.fillRect(x0, y, x1 - x0, Math.max(0.6, 0.3 * sy));
    for (const e of [0, 1]) for (let i = 0; i < 40; i++) { const d = (300 + U.hash(i, e + 3) * 700) * sy, y = e ? 2048 - d : d; g.fillStyle = `rgba(20,20,20,${0.06 + U.hash(i, 9) * 0.12})`; g.fillRect(cx - (4 + U.hash(e, i) * 6) * sx, y, (8 + U.hash(i, 5) * 4) * sx, (20 + U.hash(i, 1) * 60) * sy); }
  }
  const P = 'rgba(236,238,232,0.95)', m = y => (y * sy);
  if (mat !== 'grass') {
    // edge stripes and the centreline: 30 m dashes with 20 m gaps
    g.fillStyle = P; g.fillRect(x0 + 0.5, 0, 0.9 * sx, 2048); g.fillRect(x1 - 0.5 - 0.9 * sx, 0, 0.9 * sx, 2048);
    for (let y = 400; y < L - 400; y += 50) g.fillRect(cx - 0.45 * sx * 2, m(y), 0.9 * sx * 2, m(30));
    const names = (rw.name || '').match(/(\d\d[LCR]?)\/(\d\d[LCR]?)/);
    for (const e of [0, 1]) {
      const at = d => e ? 2048 - m(d) : m(d);
      // threshold: eight bars each side, 30 m long, 6 m from the end
      for (let k = 0; k < 8; k++) { const w = 1.8 * sx; const xa = x0 + 3 * sx + k * ((x1 - x0) / 2 - 5 * sx) / 8; g.fillRect(xa, Math.min(at(6), at(36)), w, m(30)); g.fillRect(128 - xa - w, Math.min(at(6), at(36)), w, m(30)); }
      // the designator, upright for the crew landing on this end
      // (the top of the picture is end b: its number reads from b, turned round)
      if (names) { const fs = Math.max(6, m(18)); g.save(); g.translate(cx, at(62)); if (!e) g.rotate(Math.PI); g.scale(7 * sx * 1.7 / (0.6 * fs), 1); g.font = `700 ${Math.round(fs)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(names[e ? 1 : 2], 0, 0); g.restore(); }
      // aiming point at 400 m, touchdown zone bars at 150 m steps to 900 m
      g.fillRect(cx - 9 * sx, Math.min(at(400), at(445)), 4 * sx, m(45)); g.fillRect(cx + 5 * sx, Math.min(at(400), at(445)), 4 * sx, m(45));
      for (const d of [150, 300, 600, 750, 900]) for (const s of [-1, 1]) { const n = d < 450 ? 3 : d < 700 ? 2 : 1; for (let k = 0; k < n; k++) g.fillRect(cx + s * (6 + k * 2.2) * sx - (s < 0 ? 1.4 * sx : 0), Math.min(at(d), at(d + 22)), 1.4 * sx, m(22)); }
    }
  }
  if (rw.shut || rw.wear >= 1) { g.strokeStyle = 'rgba(242,200,60,0.95)'; g.lineWidth = 3 * sx; for (const f of [0.1, 0.5, 0.9]) { const y = f * 2048; g.beginPath(); g.moveTo(x0, y - 20); g.lineTo(x1, y + 20); g.moveTo(x1, y - 20); g.lineTo(x0, y + 20); g.stroke(); } }
  for (const c of rw.craters || []) { const y = c.t * 2048; g.fillStyle = 'rgba(70,56,44,0.95)'; g.beginPath(); g.ellipse(cx, y, c.r * 125 * sx, c.r * 125 * sy, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(22,16,12,0.95)'; g.beginPath(); g.ellipse(cx, y, c.r * 80 * sx, c.r * 80 * sy, 0, 0, 7); g.fill(); }
  const tex = texSRGB(new THREE.CanvasTexture(cv)); tex.anisotropy = v.aniso || 4;
  return tex;
}
function runwayMesh(v, rw, e, i) {
  const d = IC.rwDir(rw), n = { x: -d.y, y: d.x }, W = rw.w / 2 + 0.08, y = e * v.hk + LIFT.pad;
  const c = (p, s) => [p.x + n.x * s * W - v.cx, y, p.y + n.y * s * W - v.cy];
  const A = c(rw.a, -1), B = c(rw.a, 1), C = c(rw.b, 1), D = c(rw.b, -1);
  const pos = new Float32Array([...A, ...B, ...C, ...D]), nor = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const gm = geom(pos, nor, null, uv, new Uint16Array([0, 1, 2, 0, 2, 3]));
  // both windings: which way the axes turn depends on the runway's heading
  gm.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]), 1));
  return paveMat({ map: runwayTex(v, rw) }, 'runway', new THREE.Mesh(gm));
}
/* taxiways as ribbons along their nodes, mitred at the bends, a disc at each joint; the picture across them is a
   few pixels (pavement, a yellow centreline) so they stay sharp however close the camera comes */
const taxiTex = mat => share('taxi:' + mat, () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d');
  g.fillStyle = mat === 'asph' ? '#3e4042' : mat === 'grass' ? '#5e7440' : '#7e807c'; g.fillRect(0, 0, 64, 4);
  if (mat !== 'grass') { g.fillStyle = '#e6be3c'; g.fillRect(31, 0, 2, 4); g.fillStyle = 'rgba(230,190,60,0.55)'; g.fillRect(2, 0, 1, 4); g.fillRect(61, 0, 1, 4); }
  const t = texSRGB(new THREE.CanvasTexture(c)); t.anisotropy = 8; return t;
});
function taxiMeshes(v, b, f) {
  const y = f.e * v.hk + LIFT.pad, by = {}, out = [];
  const bucket = mat => by[mat] || (by[mat] = { P: [], N: [], UV: [], I: [], D: [], DI: [] });
  for (const p of b.parts) {
    if (p.kind !== 'taxi' || !p.built || !p.nodes) continue;
    const pts = p.nodes.map(id => b.nodes[id]).filter(Boolean); if (pts.length < 2) continue;
    const B = bucket(IC.paveOf(p)), w = (p.w || 0.23) / 2, base = B.P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)], q = pts[i];
      let d0 = i ? { x: q.x - a.x, y: q.y - a.y } : { x: c.x - q.x, y: c.y - q.y }, d1 = i < pts.length - 1 ? { x: c.x - q.x, y: c.y - q.y } : d0;
      const l0 = Math.hypot(d0.x, d0.y) || 1, l1 = Math.hypot(d1.x, d1.y) || 1;
      const n0 = { x: -d0.y / l0, y: d0.x / l0 }, n1 = { x: -d1.y / l1, y: d1.x / l1 }, nm = { x: n0.x + n1.x, y: n0.y + n1.y }, lm = Math.hypot(nm.x, nm.y) || 1;
      const k = Math.min(2.5, 1 / Math.max(0.4, (nm.x * n0.x + nm.y * n0.y) / lm)) * w;
      for (const s2 of [-1, 1]) { B.P.push(q.x + nm.x / lm * k * s2 - v.cx, y, q.y + nm.y / lm * k * s2 - v.cy); B.N.push(0, 1, 0); B.UV.push(s2 < 0 ? 0 : 1, 0.5); }
      if (i) { const o = base + (i - 1) * 2; B.I.push(o, o + 2, o + 1, o + 1, o + 2, o + 3, o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      // the joint: a round patch of plain pavement
      const db = B.D.length / 3; B.D.push(q.x - v.cx, y, q.y - v.cy);
      for (let j = 0; j < 12; j++) { const t = j / 12 * Math.PI * 2; B.D.push(q.x + Math.cos(t) * w * 1.15 - v.cx, y, q.y + Math.sin(t) * w * 1.15 - v.cy); B.DI.push(db, db + 1 + j, db + 1 + (j + 1) % 12, db, db + 1 + (j + 1) % 12, db + 1 + j); }
    }
  }
  for (const mat in by) {
    const B = by[mat];
    out.push(paveMat({ map: taxiTex(mat) }, 'taxi', new THREE.Mesh(geom(new Float32Array(B.P), new Float32Array(B.N), null, new Float32Array(B.UV), new Uint32Array(B.I)))));
    const n = B.D.length / 3, nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { nor[i * 3 + 1] = 1; uv[i * 2] = 0.3; uv[i * 2 + 1] = 0.5; }
    out.push(paveMat({ map: taxiTex(mat) }, 'joint', new THREE.Mesh(geom(new Float32Array(B.D), nor, null, uv, new Uint32Array(B.DI)))));
  }
  return out;
}
/* an apron: concrete slabs by its zone's tint, and each stand's markings: the yellow lead-in line to the stop bar,
   the stand's outline, its number */
const ZONE_TINT = { civil: '#8e908c', cargo: '#948a74', light: '#848e94', mil: '#7c8474' };
function apronMesh(v, b, p, f) {
  const Wm = p.w * 100, Hm = p.h * 100, q = Math.min(2, 2048 / Wm, 2048 / Hm), cv = document.createElement('canvas');
  cv.width = Math.max(8, Math.round(Wm * q)); cv.height = Math.max(8, Math.round(Hm * q));
  const g = cv.getContext('2d');
  g.fillStyle = ZONE_TINT[IC.partZone ? IC.partZone(b, p) : 'civil'] || ZONE_TINT.civil; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(0,0,0,0.07)'; for (let x = 0; x < cv.width; x += 7.5 * q) g.fillRect(x, 0, Math.max(0.7, 0.25 * q), cv.height); for (let yy = 0; yy < cv.height; yy += 7.5 * q) g.fillRect(0, yy, cv.width, Math.max(0.7, 0.25 * q));
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,30,30,${0.02 + U.hash(i, 4) * 0.03})`; g.beginPath(); g.ellipse(U.hash(i, 1) * cv.width, U.hash(2, i) * cv.height, (4 + U.hash(i, 7) * 10) * q, (3 + U.hash(i, 8) * 6) * q, U.hash(i, 9) * 3, 0, 7); g.fill(); }
  const toPx = (lx, ly) => [(lx * 100 + Wm / 2) * q, (ly * 100 + Hm / 2) * q];
  for (const s of p.stands || []) {
    const S0 = IC.STAND[s.size], l = IC.rectLocal(p, s), [cx, cy] = toPx(l.x, l.y), a = s.a - (p.a || 0);
    g.save(); g.translate(cx, cy); g.rotate(a); g.scale(q * 100, q * 100);
    g.lineWidth = 0.004; g.strokeStyle = 'rgba(236,236,226,0.75)'; g.strokeRect(-S0.d / 2, -S0.w / 2, S0.d, S0.w);
    g.strokeStyle = 'rgba(214,60,50,0.6)'; g.lineWidth = 0.003; g.strokeRect(-S0.d / 2 + 0.02, -S0.w / 2 + 0.02, S0.d - 0.04, S0.w - 0.04);
    g.strokeStyle = '#e6be3c'; g.lineWidth = 0.006; g.beginPath(); g.moveTo(-S0.d / 2 - 0.08, 0); g.lineTo(s.drive ? S0.d / 2 + 0.08 : S0.d * 0.35, 0); g.stroke();
    g.fillStyle = '#e6be3c'; g.fillRect(S0.d * 0.35, -0.04, 0.012, 0.08);
    g.save(); g.translate(-S0.d / 2 + 0.06, S0.w * 0.3); g.rotate(Math.PI / 2); g.font = '700 0.07px sans-serif'; g.textAlign = 'center'; g.fillText(String(s.id).split('s').pop(), 0, 0); g.restore();
    g.restore();
  }
  const tex = texSRGB(new THREE.CanvasTexture(cv)); tex.anisotropy = v.aniso || 4;
  const y = f.e * v.hk + LIFT.pad, c = (lx, ly) => { const w = IC.rectWorld(p, lx, ly); return [w.x - v.cx, y, w.y - v.cy]; };
  const pos = new Float32Array([...c(-p.w / 2, -p.h / 2), ...c(p.w / 2, -p.h / 2), ...c(p.w / 2, p.h / 2), ...c(-p.w / 2, p.h / 2)]);
  const gm = geom(pos, new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), null, new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), new Uint16Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]));
  return paveMat({ map: tex }, 'apron', new THREE.Mesh(gm));
}
/* the buildings of an airport from their parts, in metres about its middle: one mesh (with vertex ranges per part
   for damage), lit windows, and the radars that turn */
function aptBuildings(v, b, f) {
  const MB = IC.MB, P = MB.P, B = MB.Builder(1), items = [];
  let nr = 0;
  for (const p of b.parts) {
    if (!p.built || PAVE[p.kind] === 1) continue;
    const x = (p.x - b.x) * 100, y = (p.y - b.y) * 100, a = p.a || 0, W = (p.w || (p.r || 0.1) * 2) * 100, H = (p.h || (p.r || 0.1) * 2) * 100, dead = p.hp <= 0;
    const ca = Math.cos(a), sa = Math.sin(a), start = B.groups.main.pos.length / 3;
    B.with(q => [x + q[0] * ca - q[1] * sa, y + q[0] * sa + q[1] * ca, q[2]], () => {
      if (dead) { MB.box(B, 0, 0, 1.2, W * 0.9, H * 0.9, 2.4, '#3a3430', { top: [0.7, 0.7] }); return; }
      const long = W >= H, Lg = long ? W : H, Dp = long ? H : W, along = (px, py) => long ? [px, py] : [py, px];
      switch (p.kind) {
        case 'terminal': {
          // a glass front on both long sides between a plinth and the roof, mullions every 8 m, the roof overhanging
          MB.box(B, 0, 0, 8, W, H, 16, '#c8ccd0', { top: [0.99, 0.99] });
          MB.box(B, 0, 0, 16.6, (long ? W : W + 8) + 4, (long ? H + 8 : H) + 4, 1.2, '#aeb4ba');
          MB.box(B, 0, 0, 17.8, W * 0.96, H * 0.9, 1.2, '#9ea4aa');
          B.group('win', { kind: 'win' });
          for (const s of [-1, 1]) { const [px, py] = along(0, s * (Dp / 2 + 0.15)); MB.box(B, px, py, 8.5, long ? W * 0.97 : 0.3, long ? 0.3 : H * 0.97, 10, 'WIN'); }
          B.group('main');
          for (const s of [-1, 1]) for (let q = -Lg / 2 + 4; q < Lg / 2; q += 8) { const [px, py] = along(q, s * (Dp / 2 + 0.35)); MB.box(B, px, py, 8.5, long ? 0.35 : 0.3, long ? 0.3 : 0.35, 10, '#8c949c'); }
          for (let i = 0; i < Math.floor(Lg / 60); i++) { const [px, py] = along(-Lg / 2 + 40 + i * 60, (U.hash(i, 3) - 0.5) * Dp * 0.5); MB.box(B, px, py, 18.2, 8, 6, 3, '#8a9096'); }
          break;
        }
        case 'cargo': {
          MB.box(B, 0, 0, 7, W, H, 14, '#a89e86');
          for (let i = 0; i < Math.floor(Lg / 12); i++) { const [px, py] = along(-Lg / 2 + 8 + i * 12, Dp / 2 + 0.2); MB.box(B, px, py, 4, long ? 6 : 0.4, long ? 0.4 : 6, 8, '#3a3e42'); }
          break;
        }
        case 'hangar': case 'has': case 'alert': {
          const has = p.kind === 'has', wall = has ? 0 : p.kind === 'alert' ? 7 : 12, rise = has ? 9 : p.kind === 'alert' ? 2 : 8, col = has ? '#98927e' : p.kind === 'alert' ? '#8e8e86' : '#8a9096';
          // the arch runs across the door: doors are on the ±y sides of the part
          if (wall) MB.box(B, 0, 0, wall / 2, W, H, wall, col);
          B.with(q => [q[1], q[0], q[2]], () => MB.loft(B, [{ x: -H / 2, w: W / 2, h: rise, z: wall, n: has ? 2 : 2.4 }, { x: H / 2, w: W / 2, h: rise, z: wall, n: has ? 2 : 2.4 }], [0, 30, 60, 90, 270, 300, 330], () => has ? '#8a8472' : '#7c848a', { cap0: col, cap1: col, smooth: true }));
          const ds = p.doorSide || -1;
          MB.box(B, 0, ds * (H / 2 + 0.2), (wall + rise) * 0.42, W * 0.84, 0.4, (wall + rise) * 0.8, '#2a2e32');
          break;
        }
        case 'tower': {
          const r = Math.min(W, H) * 0.3;
          MB.lathe(B, [[0, r * 1.3], [4, r], [36, r * 0.8], [37, r * 1.5]], '#c4c6cc', { axis: 'z', cap0: '#c4c6cc', segs: 12 });
          B.group('win', { kind: 'win' }); MB.lathe(B, [[37, r * 1.55], [42, r * 1.75]], 'WIN', { axis: 'z', segs: 8, smooth: false }); B.group('main');
          MB.lathe(B, [[42, r * 1.85], [43.5, r * 1.6], [44, 0.3]], '#3a4048', { axis: 'z', segs: 8, cap1: '#3a4048' });
          MB.cyl(B, [0, 0, 47], 6, 0.2, '#e8e8e8', 'z', { segs: 4 });
          break;
        }
        case 'fire': MB.box(B, 0, 0, 4.5, W, H, 9, '#b04638'); for (let i = 0; i < 3; i++) { const [px, py] = along(-Lg * 0.3 + i * Lg * 0.3, Dp / 2 + 0.2); MB.box(B, px, py, 3, long ? Lg * 0.22 : 0.4, long ? 0.4 : Lg * 0.22, 5, '#e8e4dc'); } break;
        case 'atc': case 'gradar': {
          const mast = p.kind === 'gradar' ? 18 : 9;
          MB.box(B, 0, 0, 2, Math.min(W, 12), Math.min(H, 12), 4, '#c8ccd0');
          MB.cyl(B, [0, 0, mast / 2 + 2], mast, 0.6, '#8a9096', 'z', { segs: 6 });
          B.group('radar' + nr++, { kind: 'radar', pivot: [x, y, mast + 2], axis: [0, 0, 1] });
          MB.box(B, 0, 0, mast + 3, 1.2, p.kind === 'gradar' ? 8 : 12, p.kind === 'gradar' ? 1.2 : 3, '#e8ecf0', { pitch: -0.25 });
          B.group('main');
          break;
        }
        case 'ammo': MB.box(B, 0, 0, 2.2, W, H, 4.4, '#5f7048', { top: [0.7, 0.6] }); MB.box(B, 0, H * 0.3, 1.5, W * 0.2, 1, 3, '#3a3e42'); break;
        case 'fuel': {
          const r = (p.r || 0.2) * 100;
          MB.lathe(B, [[0, r], [13, r], [14.5, r * 0.8], [15.2, 0.1]], '#e2e0d4', { axis: 'z', cap0: '#e2e0d4', segs: 20 });
          MB.box(B, 0, 0, 0.6, r * 2.7, r * 2.7, 1.2, '#7e8468', { top: [1, 1] });
          break;
        }
        case 'ils': for (let i = 0; i < 8; i++) { const [px, py] = along(-Lg * 0.42 + i * Lg * 0.12, 0); MB.box(B, px, py, 1.5, 0.4, 0.4, 3, '#dc823c'); } break;
        case 'deice': for (const s of [-1, 1]) { MB.box(B, s * W * 0.42, 0, 3, 2, 2, 6, '#ec7828'); MB.box(B, s * W * 0.3, 0, 6.5, W * 0.25, 1.2, 1, '#ec7828'); } break;
        case 'fuelpad': MB.box(B, W * 0.3, H * 0.25, 1.2, 2.5, 2, 2.4, '#c83c32'); break;
        case 'hydrant': MB.box(B, 0, 0, 1.5, W, H, 3, '#788896'); break;
        default: MB.box(B, 0, 0, 3, W, H, 6, '#9a9a96');
      }
    });
    items.push({ p, start, end: B.groups.main.pos.length / 3 });
  }
  // jet bridges from the terminal to the front door of each contact stand
  for (const ap of b.parts) if (ap.kind === 'apron' && ap.built) for (const s of ap.stands || []) {
    if (!s.contact || s.hp <= 0) continue;
    const S0 = IC.STAND[s.size], ca = Math.cos(s.a), sa = Math.sin(s.a), sx = (s.x - b.x) * 100, sy = (s.y - b.y) * 100;
    B.with(q => [sx + q[0] * ca - q[1] * sa, sy + q[0] * sa + q[1] * ca, q[2]], () => { MB.box(B, S0.d * 37, -S0.w * 20, 4.6, S0.d * 30, 3, 3, '#b0b4ba'); MB.cyl(B, [S0.d * 24, -S0.w * 20, 2.2], 4.4, 0.4, '#70767c', 'z', { segs: 5 }); });
  }
  const me = MB.finish(B, 'apt' + b.id), cols = { WIN: '#ffffff' }, o = [-(b.x - v.cx) * 100, -(b.y - v.cy) * 100, -f.e * v.hk * 100 - LIFT.pad * 100];
  const G = new THREE.Group(), anims = [];
  if (me.groups.main) {
    const mesh = new THREE.Mesh(toScene(me, ['main'], cols, o, 0.01, nz => nz > 0.5 ? 1 : 0.86), solidMat());
    const hurt = new Map();
    for (const e of v.evs || []) for (const d of e.dmg || []) if (d.kind === 'part') hurt.set(d.p, Math.min(hurt.get(d.p) || 1e18, e.t));
    mesh.userData.items = items.map(it => ({ start: it.start, end: it.end, t: hurt.has(it.p) ? hurt.get(it.p) : it.p.hp < it.p.max * 0.5 ? -1e18 : 1e18, dark: false }));
    mesh.userData.base = Float32Array.from(mesh.geometry.attributes.color.array);
    v.dmgMeshes.push(mesh);
    G.add(mesh);
  }
  if (me.groups.win) G.add(new THREE.Mesh(toScene(me, ['win'], cols, o, 0.01), winMat()));
  for (const k in me.groups) if (me.groups[k].kind === 'radar') {
    const gp = me.groups[k], pv = gp.pivot, node = new THREE.Group();
    node.position.set((pv[0] - o[0]) * 0.01, (pv[2] - o[2]) * 0.01, (pv[1] - o[1]) * 0.01);
    node.add(new THREE.Mesh(toScene(me, [k], cols, pv, 0.01), solidMat()));
    G.add(node); anims.push(node);
  }
  G.userData.radars = anims;
  return G;
}
/* the lights of an airport at night: runway edges white, thresholds green, approach lights, taxiway centrelines
   green, floodlights over the aprons; points of light that keep their size on screen */
function aptLights(v, b, f) {
  const P = [], C = [], put = (x, y, z, hex) => { const c = colorOf(hex); P.push(x - v.cx, f.e * v.hk + z, y - v.cy); C.push(c.r, c.g, c.b); };
  for (const rw of b.parts) {
    if (!rw.built) continue;
    if (rw.kind === 'runway') {
      const L = IC.rwLen(rw), d = IC.rwDir(rw), n = { x: -d.y, y: d.x }, hw = rw.w / 2 + 0.03;
      for (let s = 0; s <= L; s += 0.6) { const p = IC.rwAt(rw, s / L); for (const e of [-1, 1]) put(p.x + n.x * e * hw, p.y + n.y * e * hw, 0.006, '#fff4dc'); }
      for (const [t, sg] of [[0, -1], [1, 1]]) {
        const p = IC.rwAt(rw, t);
        for (let i = -4; i <= 4; i++) put(p.x + n.x * i * hw / 4, p.y + n.y * i * hw / 4, 0.006, '#40ff80');
        for (let s = 0.3; s <= 9; s += 0.3) { const q = { x: p.x + d.x * sg * s, y: p.y + d.y * sg * s }; put(q.x, q.y, 0.02, '#fffae6'); if (Math.abs(s - 3) < 0.1 || Math.abs(s - 6) < 0.1) for (let i = -5; i <= 5; i++) put(q.x + n.x * i * 0.08, q.y + n.y * i * 0.08, 0.02, '#fffae6'); }
      }
    } else if (rw.kind === 'taxi' && rw.nodes) {
      for (let i = 1; i < rw.nodes.length; i++) {
        const a = b.nodes[rw.nodes[i - 1]], c = b.nodes[rw.nodes[i]]; if (!a || !c) continue;
        const L = U.dxy(a.x, a.y, c.x, c.y);
        for (let s = 0; s < L; s += 0.3) put(a.x + (c.x - a.x) * s / L, a.y + (c.y - a.y) * s / L, 0.004, '#50ff90');
      }
    } else if (rw.kind === 'apron') {
      const long = rw.w >= rw.h, Lg = long ? rw.w : rw.h;
      for (let i = 0; i <= Math.floor(Lg / 1.2); i++) { const q = IC.rectWorld(rw, long ? -Lg / 2 + i * 1.2 : 0, long ? 0 : -Lg / 2 + i * 1.2); put(q.x, q.y, 0.25, '#ffd89a'); }
    }
  }
  if (!P.length) return null;
  const pts = new THREE.Points(geom(new Float32Array(P), null, new Float32Array(C)), new THREE.PointsMaterial({ size: 4.5, sizeAttenuation: false, vertexColors: true, map: puffTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  return pts;
}
/* the airports near the focus, built once (and again when their parts change) */
const aptSig = b => b.parts.map(p => p.id + (p.built ? 1 : 0) + (p.hp > 0 ? 1 : 0) + (p.craters ? p.craters.length : 0)).join();
function airportSync(v, fx, fy) {
  for (const b of IC.bases(v.S)) {
    if (!b.parts || !b.parts.length) continue;
    const near = U.dxy(b.x, b.y, fx, fy) < 900, A = v.apts.get(b.id);
    if (!near) { if (A && U.dxy(b.x, b.y, fx, fy) > 1100) dropApt(v, b.id); continue; }
    const sig = aptSig(b);
    if (A && A.sig === sig) continue;
    if (A) dropApt(v, b.id);
    const f = v.flat.find(q => q.x === b.x && q.y === b.y); if (!f) continue;
    const G = new THREE.Group();
    G.add(aptPad(v, b, f));
    for (const p of b.parts) if (p.kind === 'apron' && p.built) G.add(apronMesh(v, b, p, f));
    for (const m of taxiMeshes(v, b, f)) G.add(m);
    b.parts.filter(p => p.kind === 'runway' && p.built).forEach((rw, i) => G.add(runwayMesh(v, rw, f.e, i)));
    const bl = aptBuildings(v, b, f); G.add(bl);
    const lt = aptLights(v, b, f); if (lt) { G.add(lt); v.nightLights.push(lt); }
    v.static.add(G); v.apts.set(b.id, { G, sig, radars: bl.userData.radars, lights: lt });
    v.made.airport++;
  }
}
function dropApt(v, id) {
  const A = v.apts.get(id); if (!A) return;
  v.static.remove(A.G);
  A.G.traverse(x => { if (x.geometry && !x.isInstancedMesh) x.geometry.dispose(); if (x.material && !isShared(x.material)) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } });
  v.dmgMeshes = v.dmgMeshes.filter(m => { let inside = false; A.G.traverse(x => { if (x === m) inside = true; }); return !inside; });
  if (A.lights) v.nightLights = v.nightLights.filter(x => x !== A.lights);
  v.apts.delete(id);
}
const isShared = m => { for (const x of shared.values()) if (x === m) return true; return false; };

/* ---------- many of one kind: instanced meshes ----------
   Parked aircraft, missiles in a raid, lorries: one draw for each model and livery. A pool grows (twice as big)
   only when it runs out; each frame it is filled from the start, and what is left over is not drawn */
function pool(v, key, gm, mat) {
  let p = v.pools.get(key);
  if (!p) { p = { key, gm, mat, cap: 0, mesh: null, n: 0, users: [] }; v.pools.set(key, p); }
  return p;
}
function poolGrow(v, p, need) {
  if (need <= p.cap) return;
  const cap = Math.max(16, p.cap * 2, need), mesh = new THREE.InstancedMesh(p.gm, p.mat, cap);
  mesh.frustumCulled = false; mesh.count = 0;
  if (p.mesh) { const m4 = new THREE.Matrix4(); for (let i = 0; i < p.cap; i++) { p.mesh.getMatrixAt(i, m4); mesh.setMatrixAt(i, m4); } v.scene.remove(p.mesh); p.mesh.dispose && p.mesh.dispose(); }
  p.mesh = mesh; p.cap = cap; v.scene.add(mesh); v.made.pool++;
}
/* the aircraft parked at stands and our air wing at its base, gathered when they change */
function parkedSync(v) {
  const S = v.S, list = [];
  const tails = S.av ? new Map(S.av.tails.map(t => [t.id, t])) : new Map();
  for (const [id] of v.apts) {
    const b = S.byId[id]; if (!b) continue;
    for (const p of b.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) {
      if (!s.occ) continue;
      const t = tails.get(s.occ); if (!t || t.where !== 'stand') continue;
      const al = IC.avAirline && IC.avAirline(S, t.al);
      list.push([IC.modelOfType(t.type), al ? al.livery : null, s.x, s.y, s.a, b]);
    }
    for (const r of S.roster || []) {
      if (r.base !== b.id || r.st === 'lost' || r.st === 'air') continue;
      const pp = IC.parkPos(S, b, r); if (pp.inside) continue;
      const type = IC.AIRKIND_TYPE[r.kind], n = r.n || 1, h = pp.a != null ? pp.a : b.rwyA || 0;
      for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * (IC.ACTYPES[type].span * 1.3); list.push([IC.modelOfType(type), null, pp.x - Math.sin(h) * off, pp.y + Math.cos(h) * off, h, b]); }
    }
  }
  const sig = list.map(q => q[0] + (q[1] || '') + q[2].toFixed(2) + q[3].toFixed(2)).join('|');
  if (sig === v.parkSig) return;
  v.parkSig = sig;
  for (const p of v.pools.values()) if (p.parked) { p.n = 0; if (p.mesh) p.mesh.count = 0; }
  const e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), P3 = new THREE.Vector3(), M = new THREE.Matrix4();
  for (const [key, liv, x, y, h, b] of list) {
    const MP = modelParts(key, liv, null), p = pool(v, 'park|' + key + '|' + (liv ? liv.join() : ''), MP.restHi, solidMat());
    p.parked = true; poolGrow(v, p, p.n + 1);
    const f = v.flat.find(q2 => q2.x === b.x && q2.y === b.y);
    P3.set(x - v.cx, (f ? f.e : hT(v, x, y)) * v.hk + LIFT.rw, y - v.cy); e.set(0, -h, 0, 'YZX'); q.setFromEuler(e); M.compose(P3, q, one);
    p.mesh.setMatrixAt(p.n++, M); p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true;
  }
  v.made.parked++;
}

/* ---------- the movers ----------
   Each recorded track as its model at real size. An aircraft has its own meshes (so its gear, flaps, propellers
   and rotors move): the solid body, the windows, each moving part on its pivot, the same model in one piece for when
   it is far away, its lights. Missiles, cruise missiles, one-way drones and lorries come in numbers and are drawn
   from instanced meshes. Too far to see, anything is a dot in its side's colour. A missile also has its motor plume
   and glow, its smoke, its lock lines and its seeker cone. */
const SIDE_COL = { us: '#6fd2ff', enemy: '#ff5b4f', civil: '#7fe8b0' };
const AFF_COL = ['#f2d14a', '#6fd2ff', '#7fe8b0', '#ff9a3c', '#ff5b4f', '#8fa3b0'];
const SMOKE_N = 600;
const instanced = tr => tr.kind === 'missile' || tr.kind === 'veh' || (tr.kind === 'threat' && !IC.modelIsAircraft(tr.model));
const radarMat = hex => share('radar:' + hex, () => new THREE.MeshBasicMaterial({ color: hex }));
const navMat = () => share('nav', () => new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, map: puffTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
function lightPoints(list) {
  if (!list.length) return null;
  const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
  list.forEach((l, i) => { pos.set(l.p, i * 3); const c = colorOf(LIGHT_COL[l.kind]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; });
  const p = new THREE.Points(geom(pos, null, col), navMat()); p.frustumCulled = false; p.visible = false;
  return p;
}
function makeMover(v, tr) {
  const sc = v.scene, MP = modelParts(tr.model, tr.meta.livery || null, null);
  const grp = new THREE.Group(); grp.userData.tr = tr;
  const m = { tr, grp, MP, st: {}, tst: {}, ust: {}, tmp: [], anims: [], size: MP.size, inst: instanced(tr), lod: 1, pos: grp.position,
    ac: IC.modelIsAircraft(tr.model), ph0: (v.made.mover * 0.377) % 1, gearK: null, flapK: null, launchK: null, lastT: null, tdSeen: 0 };
  if (!m.inst) {
    const body = m.body = new THREE.Group(); grp.add(body);
    m.solid = new THREE.Mesh(MP.solid, solidMat()); m.solid.userData.tr = tr; body.add(m.solid);
    if (MP.win) { m.win = new THREE.Mesh(MP.win, winMat()); body.add(m.win); }
    for (const a of MP.anim) {
      const node = new THREE.Group(); node.position.set(a.pivot[0], a.pivot[1], a.pivot[2]);
      node.add(new THREE.Mesh(a.geom, a.kind === 'ab' ? abMat() : solidMat()));
      if (a.kind === 'rotor' && a.axis[1] > 0.5) { const d = new THREE.Mesh(discG(), discMat()); const R = IC.modelMesh(tr.model, 1).groups[a.name].R * 0.01; d.scale.set(R, 1, R); body.add(d); d.position.set(a.pivot[0], a.pivot[1], a.pivot[2]); }
      body.add(node);
      m.anims.push({ a, node, axis: new THREE.Vector3(a.axis[0], a.axis[1], a.axis[2]).normalize() });
    }
    m.far = new THREE.Mesh(MP.rest, solidMat()); m.far.visible = false; m.far.userData.tr = tr; body.add(m.far);
    if (IC.modelIsAircraft(tr.model)) { m.shadow = new THREE.Mesh(quadG(), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 1 })); m.shadow.renderOrder = 6; m.shadow.visible = false; sc.add(m.shadow); }
    if (m.ac) {
      m.nav = lightPoints(MP.lights.filter(l => l.kind === 'red' || l.kind === 'green' || l.kind === 'white'));
      m.flash = lightPoints(MP.lights.filter(l => l.kind === 'strobe' || l.kind === 'beacon'));
      m.land = lightPoints(MP.lights.filter(l => l.kind === 'land'));
      for (const x of [m.nav, m.flash, m.land]) if (x) body.add(x);
    }
  }
  const missile = tr.kind === 'missile', maxPts = missile || tr.kind === 'threat' || tr.kind === 'air' || tr.kind === 'gnd' ? 1600 : 400;
  const line = new THREE.Line(lineGeom(maxPts), new THREE.LineBasicMaterial({ color: missile ? '#e8e8e0' : SIDE_COL[tr.side] || '#ffffff', transparent: true, opacity: missile ? 0.75 : 0.55 }));
  line.frustumCulled = false;
  sc.add(grp); sc.add(line);
  const label = document.createElement('div'); label.className = 'rp-lbl ' + (tr.side || ''); label.hidden = true;
  v.$('labels').appendChild(label);
  Object.assign(m, { line, label, maxPts, lblTxt: '', lblCls: label.className, lblOn: false });
  if (missile) {
    // the motor: a white-hot cone at the nozzle and a glow that reads from far away
    const len = MP.len, plume = new THREE.Mesh(plumeG(), new THREE.MeshBasicMaterial({ color: '#ffc46a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    plume.position.x = -len / 2; plume.visible = false; grp.add(plume);
    const glow = new THREE.Points(geom(new Float32Array([-len / 2, 0, 0])), new THREE.PointsMaterial({ size: 14, sizeAttenuation: false, map: puffTex(), color: '#ffc070', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.visible = false; glow.frustumCulled = false; grp.add(glow);
    const smoke = new THREE.Points(lineGeom(SMOKE_N), new THREE.PointsMaterial({ size: SMOKE[tr.meta.mun] || 0.14, map: puffTex(), color: '#dcdcd6', transparent: true, opacity: 0.5, depthWrite: false }));
    smoke.frustumCulled = false; sc.add(smoke);
    // the same smoke as a fine line of dots, so the burn still reads from far away
    const smokeFar = new THREE.Points(smoke.geometry, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, color: '#eeeeea', transparent: true, opacity: 0.5, depthWrite: false }));
    smokeFar.frustumCulled = false; smoke.add(smokeFar);
    const locks = new THREE.LineSegments(lineGeom(8, true), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    locks.frustumCulled = false; sc.add(locks);
    const cone = new THREE.Mesh(coneG(), additive('#ffffff', 0.05)); cone.visible = false; sc.add(cone);
    Object.assign(m, { plume, glow, smoke, locks, cone, burn: burnOf(tr), tL: IC.recFirstT(tr) });
  }
  v.movers.push(m); v.moverOf.set(tr, m); v.made.mover++;
  return m;
}
function dropMover(v, m) {
  // the models' geometry and materials are shared; the trail, smoke and lock lines are the mover's own
  for (const x of [m.grp, m.line, m.smoke, m.locks, m.cone, m.shadow]) if (x) v.scene.remove(x);
  if (m.shadow) m.shadow.material.dispose();
  for (const x of [m.line, m.smoke, m.locks, m.glow]) if (x) x.geometry.dispose();
  for (const x of [m.line, m.smoke, m.locks, m.glow, m.cone, m.plume]) if (x) x.material.dispose();
  if (m.smoke) m.smoke.children[0].material.dispose();
  m.label.remove();
  v.movers.splice(v.movers.indexOf(m), 1); v.moverOf.delete(m.tr);
  if (v.follow === m) v.follow = null;
}
const trackOf = (v, ref) => ref && v.S.rec ? v.S.rec.of.get(ref) : null;
const moverOfRef = (v, ref) => { const tr = trackOf(v, ref); return tr ? v.moverOf.get(tr) : null; };
/* a recorded state as a point in the scene */
function scenePos(v, st, out, lift) {
  out.x = st.x - v.cx; out.y = hT(v, st.x, st.y) * v.hk + st.alt * KM * v.hk + (lift || 0); out.z = st.y - v.cy;
  return out;
}
const P1 = {}, P2 = {}, P3 = {};
/* how the view gets from one frame's pose to the next: gear and flaps take their time, a scrub snaps */
function ease(cur, want, dt, secs) { return cur == null || dt > 2 ? want : cur + U.clamp(want - cur, -dt / secs, dt / secs); }
function updMover(v, m, t) {
  const S = v.S, hk = v.hk, st = IC.recPose(m.tr, t, m.st, S.wind);
  const hide = !st || (v.radar && m.tr.kind === 'threat' && !st.det && !m.tr.meta.civil && st.aff !== 1);
  m.vis = !!st && !hide;
  if (!m.vis) { m.grp.visible = false; m.line.visible = false; if (m.lblOn) { m.label.hidden = true; m.lblOn = false; } if (m.smoke) { m.smoke.visible = false; m.locks.visible = false; m.cone.visible = false; } return; }
  const dt = m.lastT == null ? 99 : Math.abs(t - m.lastT); m.lastT = t;
  const onGnd = st.gnd && m.ac, y = hT(v, st.x, st.y) * hk + (onGnd ? LIFT.rw : st.alt * KM * hk);
  const pitch = hk > 1 ? Math.atan(Math.tan(st.pitch) * hk) : st.pitch;
  m.grp.position.set(st.x - v.cx, y + (onGnd && pitch > 0 && m.MP.xm ? -m.MP.xm * Math.sin(pitch) : 0), st.y - v.cy);
  m.grp.rotation.set(st.roll, -(st.h + st.crab), pitch, 'YZX');
  // how big it is on screen: the model close in, the whole of it in one piece further out, a dot beyond that
  const d = m.grp.position.distanceTo(v.camera.position), px = m.size / Math.max(1e-3, d) * v.focalPx;
  m.px = px;
  const dot = px < CFG.farPx && m !== v.follow;
  m.grp.visible = !dot;
  if (m.inst) instance(v, m, st);
  else if (!dot) {
    const lod = px < CFG.lodPx * (m.lod ? 0.85 : 1.15) ? 0 : 1;
    if (lod !== m.lod) { m.lod = lod; m.solid.visible = !!lod; if (m.win) m.win.visible = !!lod; m.far.visible = !lod; for (const A of m.anims) A.node.visible = !!lod; }
    const mat = v.radar ? radarMat(m.tr.kind === 'threat' ? AFF_COL[st.aff | 0] : SIDE_COL[m.tr.side] || '#ffffff') : solidMat();
    if (m.solid.material !== mat) { m.solid.material = mat; m.far.material = mat; }
    if (lod) animate(v, m, st, t, dt);
    if (m.ac) { const on = v.night && !v.radar; if (m.nav) m.nav.visible = on; if (m.flash) m.flash.visible = on && ((t + m.ph0) % 1.1) < 0.07; if (m.land) m.land.visible = on && st.lights > 0; }
  }
  if (dot) v.dotList.push(m);
  // its shadow on the ground, fading as it climbs away (the sun is high enough to put it under it)
  if (m.shadow) {
    const on = !dot && !v.radar && st.alt < 0.4 && v.light > 0.25 && m.px > 6; m.shadow.visible = on;
    if (on) { const g0 = hT(v, st.x, st.y) * hk + LIFT.rw + 0.0005; m.shadow.position.set(m.grp.position.x + st.alt * KM * 0.3, g0, m.grp.position.z + st.alt * KM * 0.2); m.shadow.rotation.set(0, -st.h, 0); m.shadow.scale.set(m.MP.len * 1.1, 1, m.size * 0.95); m.shadow.material.opacity = (1 - st.alt / 0.4) * 0.85; }
  }
  // the trail, smoothed between the samples, at the heights shown (not along the ground)
  const tl = m.tr.kind === 'missile' ? 900 : m.tr.kind === 'veh' || m.tr.kind === 'unit' ? 0 : (v.lod > 0 ? 30 : CFG.trail);
  if (tl && !st.gnd) trail(v, m, t - tl, t, st, y); else m.line.visible = false;
  if (m.smoke) missileFx(v, m, t, st, hide);
  // a touchdown leaves a puff of tyre smoke
  if (m.ac && m.tr.marks.length !== m.tdSeen) touchdowns(v, m);
}
/* gear, flaps, propellers, rotors, radars, launchers, the afterburner */
function animate(v, m, st, t, dt) {
  m.gearK = ease(m.gearK, st.gear, dt, 8); m.flapK = ease(m.flapK, st.flap, dt, 6);
  m.launchK = ease(m.launchK, st.spd < 0.002 ? 1 : 0, dt, 6);
  for (const A of m.anims) {
    const k = A.a.kind;
    let ang = 0;
    if (k === 'gear') { A.node.visible = m.gearK > 0.02; ang = (1 - m.gearK) * A.a.up; }
    else if (k === 'flap') { A.node.visible = m.flapK > 0.02; ang = m.flapK * A.a.up; }
    else if (k === 'prop') ang = t * 22 * (A.a.rpm || 1);
    else if (k === 'rotor') ang = t * (A.a.axis[1] > 0.5 ? 5.5 : 24) * (A.a.rpm || 1);
    else if (k === 'radar') ang = st.det || m.tr.kind !== 'unit' ? t * 1.6 : 0.4;
    else if (k === 'launch') ang = m.launchK * A.a.up;
    else if (k === 'ab') { A.node.visible = st.ab > 0; if (st.ab) A.node.scale.setScalar(0.85 + 0.2 * Math.abs(Math.sin(t * 37))); continue; }
    else continue;
    // the model's axes are mirrored in the scene: an angle turns the other way
    A.node.quaternion.setFromAxisAngle(A.axis, -ang);
  }
}
const MI = {};
/* a mover drawn from its model's instanced mesh this frame */
function instance(v, m, st) {
  const key = (v.radar ? 'r|' + (m.tr.kind === 'threat' ? AFF_COL[st.aff | 0] : SIDE_COL[m.tr.side] || '#fff') + '|' : 'm|') + m.MP.key + '|' + (m.tr.meta.livery ? m.tr.meta.livery.join() : '');
  const p = pool(v, key, m.MP.rest, v.radar ? radarMat(m.tr.kind === 'threat' ? AFF_COL[st.aff | 0] : SIDE_COL[m.tr.side] || '#ffffff') : solidMat());
  if (!m.grp.visible) return;
  poolGrow(v, p, p.n + 1);
  m.grp.updateMatrix(); p.mesh.setMatrixAt(p.n, m.grp.matrix); p.users[p.n] = m; p.n++;
}
/* the recorded samples, with points on the same cubic the replay flies between them */
function trail(v, m, ta, tb, st, y) {
  const hk = v.hk, P = m.tmp; P.length = 0; IC.recPath(m.tr, ta, tb, P, true);
  const arr = m.line.geometry.attributes.position.array, n4 = P.length / 4;
  const sub = n4 * 3 < m.maxPts - 2 ? 3 : n4 * 2 < m.maxPts - 2 ? 2 : 1, step = Math.max(1, Math.ceil(n4 / (m.maxPts - 2)));
  let n = 0;
  const put = (x, yy, alt) => { arr[n * 3] = x - v.cx; arr[n * 3 + 1] = hT(v, x, yy) * hk + alt * KM * hk; arr[n * 3 + 2] = yy - v.cy; n++; };
  for (let i = 0; i < n4 && n < m.maxPts - 1; i += step) {
    const j = i * 4;
    if (P[j + 2] < 0.002 && m.tr.kind !== 'missile') { n = 0; continue; }   // only the part in the air
    put(P[j], P[j + 1], P[j + 2]);
    if (sub > 1 && i + 1 < n4 && P[j + 7] - P[j + 3] < 3) {
      const a = i > 0 ? j - 4 : j, b = j + 4, c = i + 2 < n4 ? j + 8 : b, ta0 = a === j ? P[j + 3] - (P[b + 3] - P[j + 3]) : P[a + 3], tc = c === b ? P[b + 3] + (P[b + 3] - P[j + 3]) : P[c + 3];
      for (let s = 1; s < sub; s++) {
        const k = s / sub, H = (f) => IC.recHerm(P[a + f], P[j + f], P[b + f], P[c + f], ta0, P[j + 3], P[b + 3], tc, k);
        put(H(0), H(1), Math.max(0, H(2)));
      }
    }
  }
  arr[n * 3] = m.grp.position.x; arr[n * 3 + 1] = y; arr[n * 3 + 2] = m.grp.position.z; n++;
  m.line.geometry.attributes.position.needsUpdate = true; m.line.geometry.setDrawRange(0, n); m.line.visible = n > 1;
}
const lockCol = new Map();
/* a missile: motor and smoke while it burns, lock lines by guidance, the seeker's cone */
function missileFx(v, m, t, st, hide) {
  const hk = v.hk, age = t - m.tL, burning = !hide && age >= 0 && age < m.burn;
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
      if (last && t > m.tL + m.burn) { arr[n * 3] = x0 - v.cx; arr[n * 3 + 1] = hT(v, x0, y0) * hk + a0 * KM * hk; arr[n * 3 + 2] = y0 - v.cy; n++; break; }
      const k = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x1 - x0, y1 - y0, (a1 - a0) * KM) / gap)));
      for (let s = 0; s < k && n < SMOKE_N; s++) { const f = s / k, x = x0 + (x1 - x0) * f, yy = y0 + (y1 - y0) * f; if (burning && Math.hypot(x - st.x, yy - st.y) < gap * 4) continue; arr[n * 3] = x - v.cx; arr[n * 3 + 1] = hT(v, x, yy) * hk + (a0 + (a1 - a0) * f) * KM * hk; arr[n * 3 + 2] = yy - v.cy; n++; }
    }
    m.smoke.geometry.attributes.position.needsUpdate = true; m.smoke.geometry.setDrawRange(0, n);
    m.smoke.material.opacity = 0.3 * U.clamp(1 - (age - m.burn) / 60, 0, 1); m.smoke.children[0].material.opacity = m.smoke.material.opacity * 1.6;
  }
  // lock lines: missile to target in the colour of its guidance; the battery's radar on the target for semi-active
  // and command guidance; the launcher's datalink to the missile in midcourse. Ends where the models are drawn
  const G = IC.GUIDANCE[st.ph | 0] || IC.GUIDANCE[1];
  m.locks.visible = v.locks && !hide;
  m.cone.visible = false;
  if (!m.locks.visible && !v.cone) return;
  const at = (ref, out, lift) => { const x = moverOfRef(v, ref); if (x && x.vis) return out.copy ? out.copy(x.grp.position) : Object.assign(out, { x: x.grp.position.x, y: x.grp.position.y, z: x.grp.position.z }); const tr = trackOf(v, ref), s = tr && IC.recPose(tr, t, out === P2 ? m.tst : m.ust); return s ? scenePos(v, s, out, lift) : null; };
  const M = m.grp.position, Tp = at(m.tr.meta.tref, P2), ut = trackOf(v, m.tr.meta.uref), Lp = at(m.tr.meta.uref, P3, ut && ut.kind === 'unit' ? 0.03 : 0);
  if (m.locks.visible) {
    const g = m.locks.geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
    let n = 0;
    const seg = (a, b, hex, k) => { let c = lockCol.get(hex); if (!c) { c = new THREE.Color(hex); lockCol.set(hex, c); } for (const p of [a, b]) { pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z; col[n * 3] = c.r * k; col[n * 3 + 1] = c.g * k; col[n * 3 + 2] = c.b * k; n++; } };
    const faint = G.k === 'lost' || G.k === 'decoy';
    if (Tp) seg(M, Tp, G.col, faint ? 0.35 : G.k === 'mid' ? 0.45 : 0.95);
    if (Lp && Tp && (G.k === 'sarh' || G.k === 'cmd')) seg(Lp, Tp, G.col, 0.55);
    if (Lp && (G.k === 'cmd' || G.k === 'mid')) seg(Lp, M, IC.GUIDANCE[1].col, 0.35);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.setDrawRange(0, n);
  }
  // the seeker's cone, once it homes on its own
  if (v.cone && !hide && (G.k === 'arh' || G.k === 'ir' || G.k === 'term' || G.k === 'sarh')) {
    const len = Tp ? Math.min(Math.hypot(Tp.x - M.x, Tp.y - M.y, Tp.z - M.z) * 1.1, 60) : 20, r = len * Math.tan(G.k === 'ir' ? 0.07 : 0.12);
    m.cone.visible = true; m.cone.position.copy(m.grp.position); m.cone.quaternion.copy(m.grp.quaternion); m.cone.scale.set(len, r, r);
    m.cone.material.color.set(G.col);
  }
}
/* the far dots: one point each for what is too small to see, in its side's colour */
function dots(v) {
  const g = v.dots.geometry, pos = g.attributes.position.array, col = g.attributes.color.array, n = Math.min(v.dotList.length, pos.length / 3);
  for (let i = 0; i < n; i++) {
    const m = v.dotList[i], p = m.grp.position, c = colorOf(v.radar && m.tr.kind === 'threat' ? AFF_COL[m.st.aff | 0] : SIDE_COL[m.tr.side] || '#ffffff');
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
}
/* tyre smoke where an aircraft touched down */
function touchdowns(v, m) {
  const marks = m.tr.marks;
  for (let i = m.tdSeen; i < marks.length; i++) {
    if (marks[i][1] !== 'td') continue;
    const s = IC.recAt(m.tr, marks[i][0], {}); if (!s) continue;
    const e = { id: 9e6 + v.made.event, t: marks[i][0], kind: 'td', x: s.x, y: s.y, alt: 0, sz: 0.3, h: s.h };
    if (v.kind === 'live') v.liveEvs.push(e);
    makeEvent(v, e);
  }
  m.tdSeen = marks.length;
}

/* ---------- events: flashes, smoke and fire; a proximity burst; chaff and flares; words where they happened ---------- */
function makeEvent(v, e) {
  const hk = v.hk, sc = v.scene, td = e.kind === 'td';
  let top = 0;
  for (const d of e.dmg || []) if (d.kind === 'block') for (const q of IC.blockBoxes(d.b, true)) top = Math.max(top, q.ht); else if (d.kind === 'part') top = Math.max(top, 0.1);
  const y0 = hT(v, e.x, e.y) * hk + e.alt * KM * hk + top * hk + (td ? LIFT.rw : 0);
  const air = e.alt > 0.05, burst = e.kind === 'intercept' || (e.kind === 'kill' && air) || (e.kind === 'mstat' && (e.what === 'hit' || e.text === 'MISS'));
  const flash = new THREE.Mesh(sphereG(), new THREE.MeshBasicMaterial({ color: e.kind === 'launch' || e.kind === 'fire' ? '#ffe0a0' : '#ffb060', transparent: true, opacity: 0.9 }));
  flash.position.set(e.x - v.cx, y0, e.y - v.cy); flash.visible = false; sc.add(flash);
  const puffs = [], rnd = seeded(e.id * 7919);
  if (!e.quiet) for (let i = 0; i < (td ? 4 : 7); i++) {
    const p = new THREE.Mesh(sphereG(), new THREE.MeshLambertMaterial({ color: td ? '#e8e8e4' : e.kind === 'kill' || e.kind === 'intercept' ? '#9a9a98' : '#4a4442', transparent: true, opacity: 0.5, depthWrite: false }));
    p.visible = false; sc.add(p);
    puffs.push({ m: p, dx: rnd() * 2 - 1, dz: rnd() * 2 - 1, k: 0.7 + rnd() * 0.6, ph: rnd() * 6 });
  }
  // a hit on the ground keeps burning for a while, so the damage still reads after the flash
  let fire = null;
  if (e.kind === 'impact' || e.kind === 'crash') { fire = new THREE.Mesh(flameG(), new THREE.MeshBasicMaterial({ color: '#ff8a30', transparent: true, opacity: 0.8, depthWrite: false })); fire.visible = false; sc.add(fire); }
  // a proximity fuse: fragments thrown out in a shell round the warhead
  let frag = null;
  if (burst) {
    const N = 90, g = lineGeom(N), dirs = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 0.6 + rnd() * 0.5; dirs[i * 3] = r * Math.cos(a) * k; dirs[i * 3 + 1] = u * k; dirs[i * 3 + 2] = r * Math.sin(a) * k; }
    g.setDrawRange(0, N);
    frag = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: '#ffd8a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    frag.frustumCulled = false; frag.visible = false; frag.userData.dirs = dirs; sc.add(frag);
  }
  const ev = { e, flash, puffs, fire, frag, y0, td, sz: burst && e.kind === 'mstat' ? 0.5 : e.sz || 1 };
  v.events.push(ev); v.made.event++;
  return ev;
}
function updateEvent(ev, t, wind) {
  const age = t - ev.e.t, s = ev.sz;
  if (ev.td) {
    // tyre smoke: a white puff at the wheels that trails back along the runway and thins out in a few seconds
    for (const p of ev.puffs) {
      const a = age - p.ph * 0.05, on = a > 0 && a < 7; p.m.visible = on; if (!on) continue;
      const k = a / 7, r = s * (0.05 + 0.12 * Math.sqrt(k)) * p.k, back = a * 0.18 * (1 - k * 0.5);
      p.m.position.set(ev.flash.position.x - Math.cos(ev.e.h) * back + p.dx * 0.02, ev.y0 + r * 0.6, ev.flash.position.z - Math.sin(ev.e.h) * back + p.dz * 0.02);
      p.m.scale.setScalar(r); p.m.material.opacity = 0.55 * (1 - k);
    }
    return;
  }
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
  const fx = { e, flare, N, TR, dirs, life, pts, smoke, y0: hT(v, e.x, e.y) * v.hk + e.alt * KM * v.hk };
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
  el.style.color = TAG_COL[e.text] || (e.kind === 'lock' && IC.GUIDANCE[e.ph] ? IC.GUIDANCE[e.ph].col : '#e8eef2');
  v.$('labels').appendChild(el);
  const tag = { e, el, p: { x: e.x - v.cx, y: hT(v, e.x, e.y) * v.hk + e.alt * KM * v.hk, z: e.y - v.cy }, on: false };
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
    orbit: { yaw: -0.8, pitch: 0.55, dist: Math.max(6, R * 0.9), tx: 0, ty: hRaw(S, o.x, o.y), tz: 0 } });
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
  // what the windows share stays: materials, textures, the models' geometry
  const keep = new Set(shared.values()); for (const P of partsCache.values()) { for (const g of [P.solid, P.win, P.rest, P.restHi]) keep.add(g); for (const a of P.anim) keep.add(a.geom); }
  v.scene.traverse(x => {
    if (x.geometry && !keep.has(x.geometry)) x.geometry.dispose();
    if (x.isInstancedMesh && x.dispose) x.dispose();
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
  v.focalPx = h / 2 / Math.tan(v.camera.fov * Math.PI / 360);   // screen pixels a world unit at one unit away
  const side = v.kind === 'gallery' && v.$('side');   // the gallery centres its models in the part the side list leaves free
  if (side) v.camera.setViewOffset(w, h, side.offsetWidth / 2, 0, w, h);
  v.camera.updateProjectionMatrix();
}
function makeRenderer(v) {
  const canvas = v.$('canvas');
  let renderer;
  // a logarithmic depth buffer: a metre apart is told apart at 1 m and at 500 km, so nothing flickers against the
  // ground; the stencil lets the finest ground tiles cover the coarser ones
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: true, logarithmicDepthBuffer: true, powerPreference: v.kind === 'live' ? 'low-power' : 'default' }); } catch (e) { msg(v, 'WebGL is not available in this browser, so the 3D view cannot draw.'); return null; }
  v.aniso = renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  renderer.setPixelRatio(Math.min(v.kind === 'live' ? 1.5 : 2, window.devicePixelRatio || 1));
  v.renderer = renderer;
  v.onResize = () => v.renderer && !v.closed && resize(v);
  window.addEventListener('resize', v.onResize);
  if (window.ResizeObserver) { v.ro = new ResizeObserver(v.onResize); v.ro.observe(v.$('view')); }
  return renderer;
}
/* sky, haze, the ground beyond the tiles and the lights, from the time of day */
function sceneBase(v) {
  const S = v.S, scene = v.scene = new THREE.Scene();
  const rev = +THREE.REVISION || 128, lk = rev >= 155 ? Math.PI : 1;
  const light = S.flat ? 1 : IC.daylight(S.time), dim = 0.1 + 0.9 * light;   // moonlight at night
  v.night = light < 0.55; v.light = light;
  const zen = new THREE.Color('#050a14').lerp(new THREE.Color('#4f86c6'), light), hor = new THREE.Color('#10161e').lerp(new THREE.Color('#c4d6e6'), light), gnd = new THREE.Color('#0c1410').lerp(new THREE.Color('#7e8a64'), light);
  scene.background = hor;
  scene.fog = new THREE.Fog(hor, 300, 1200);
  // the sky: a dome from the haze at the horizon to the blue overhead, always round the camera
  const n = 24, pos = [], col = [], idx = [];
  for (let j = 0; j <= 8; j++) { const el = -0.2 + j / 8 * (Math.PI / 2 + 0.2), k = U.clamp(Math.sin(Math.max(0, el)) * 1.6, 0, 1), c = hor.clone().lerp(zen, Math.pow(k, 0.7)); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pos.push(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); col.push(c.r, c.g, c.b); } }
  for (let j = 0; j < 8; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  v.sky = new THREE.Mesh(geom(new Float32Array(pos), null, new Float32Array(col), null, new Uint16Array(idx)), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  v.sky.scale.setScalar(30000); v.sky.renderOrder = -10; v.sky.frustumCulled = false; scene.add(v.sky);
  // beyond the tiles, a wide plain in the haze (drawn only where no tile is)
  const bm = new THREE.MeshLambertMaterial({ color: gnd }); bm.stencilWrite = true; bm.stencilRef = 1; bm.stencilFunc = THREE.GreaterStencilFunc; bm.stencilZPass = THREE.ReplaceStencilOp;
  v.beyond = new THREE.Mesh(discG(), bm); v.beyond.scale.set(20000, 1, 20000); v.beyond.position.y = -0.5; v.beyond.renderOrder = -1; scene.add(v.beyond);
  v.hemi = new THREE.HemisphereLight(light > 0.3 ? 0xcfe0f4 : 0x8aa0d0, 0x40382c, 0.9 * lk * dim); scene.add(v.hemi);
  v.sun = new THREE.DirectionalLight(0xfff0dc, 1.05 * lk * dim); v.sun.position.set(-600, 700, 360); scene.add(v.sun);
  v.static = new THREE.Group(); scene.add(v.static);
  v.dmgMeshes = []; v.nightLights = []; v.dotList = [];
  v.dots = new THREE.Points(lineGeom(512, true), new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  v.dots.frustumCulled = false; v.dots.renderOrder = 2; scene.add(v.dots);
  // windows lit at dusk
  winMat().color.set(v.night ? '#ffd890' : light < 0.8 ? '#8a7a5a' : '#303a44');
  return scene;
}
function buildReplay(v) {
  const S = v.S, cx = v.cx, cy = v.cy, R = v.R;
  msg(v, 'Building the scene…');
  if (!makeRenderer(v)) return;
  flatOf(v);
  sceneBase(v);
  v.camera = new THREE.PerspectiveCamera(50, 1.6, CFG.near, CFG.far);
  v.evs = IC.recEvents(S, v.t0, v.t1).filter(e => U.dxy(e.x, e.y, cx, cy) < R * 1.4);
  v.lowGnd = lowStart(v);
  staticSync(v, cx, cy, true);
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
/* the ground, the airports and the parked aircraft round (fx, fy); all at once when the window opens */
function staticSync(v, fx, fy, now) {
  v.sfx = fx; v.sfy = fy;
  groundSync(v, fx, fy);
  if (now) groundWork(v, 1e5);
  airportSync(v, fx, fy);
  parkedSync(v);
}
/* will the camera start low (the finest ground ring worth building at once)? From what it follows, or the orbit */
function lowStart(v) {
  const tr = trackOf(v, v.followRef || v.focusRef), st = tr && IC.recAt(tr, Math.min(v.t, tr.t1), {});
  return (st ? st.alt * KM * v.hk : 0) + (v.followRef || v.focusRef ? 1 : v.orbit.dist * Math.sin(v.orbit.pitch)) < 20;
}
/* heights ×3 or real: everything on the ground is built again at the new scale */
function rebuildStatic(v) {
  for (const k of [...v.tiles.keys()]) dropTile(v, k);
  for (const id of [...v.apts.keys()]) dropApt(v, id);
  for (const p of v.pools.values()) if (p.parked) { p.n = 0; if (p.mesh) p.mesh.count = 0; }
  v.parkSig = null; v.dmgMeshes = [];
  staticSync(v, v.sfx, v.sfy, v.kind !== 'live');
  for (const ev of v.events) { ev.y0 = hT(v, ev.e.x, ev.e.y) * v.hk + ev.e.alt * KM * v.hk; ev.flash.position.y = ev.y0; }
  for (const fx of v.fx) fx.y0 = hT(v, fx.e.x, fx.e.y) * v.hk + fx.e.alt * KM * v.hk;
  for (const tg of v.tags) tg.p.y = hT(v, tg.e.x, tg.e.y) * v.hk + tg.e.alt * KM * v.hk;
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
  const meshes = v.movers.filter(m => m.grp.visible && m.solid).map(m => m.lod ? m.solid : m.far);
  const hit = rc.intersectObjects(meshes, false)[0];
  let best = hit ? hit.object.userData.tr : null;
  if (!best) {
    let bd = 1e9;
    for (const m of v.movers) { if (!m.vis) continue; const d = rc.ray.distanceToPoint(m.grp.position), lim = Math.max(m.size * 2, m.grp.position.distanceTo(v.camera.position) * 0.02); if (d < lim && d < bd) { bd = d; best = m.tr; } }
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
  if (F && F.vis) return { mode: F.st.spd > 0.05 && F.tr.kind !== 'unit' && F.tr.kind !== 'veh' ? 'chase' : 'spin', subj: F, key: 'f' + F.tr.id + (F.st.gnd ? 'g' : 'a') };
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
function dirOf(m, out) { const h = m.st.h, p = m.st.pitch || 0; return out.set(Math.cos(h) * Math.cos(p), Math.sin(p), Math.sin(h) * Math.cos(p)); }
const camDist = m => Math.max(m.size * 3.2, m.tr.kind === 'missile' ? 0.12 : 0.25);
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
    F.pos.y = Math.max(F.pos.y, hT(v, F.pos.x + v.cx, F.pos.z + v.cy) * v.hk + 0.05);
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
    const Ln = B ? axis.length() : camDist(S) * 1.6, perp = vec(4).crossVectors(axis, up).normalize();
    if (v.sidePerp && perp.dot(v.sidePerp) < 0) perp.negate();
    (v.sidePerp || (v.sidePerp = new THREE.Vector3())).copy(perp);
    const d = Math.max(Ln * 0.8, camDist(S) * (B ? 4 : 1.3)) * v.camK;
    want.copy(mid).addScaledVector(perp, d); want.y += d * (B ? 0.18 : 0.08); look.copy(mid); ok = true;
  }
  if (!ok) {
    // orbit, follow and the slow orbit: round a point that may move with what is followed
    if (shot.mode === 'spin') O.yaw += dtR * 0.14;
    const at = shot.at ? vec(5).set(shot.at.x - v.cx, hT(v, shot.at.x, shot.at.y) * v.hk + shot.at.alt * KM * v.hk, shot.at.y - v.cy) : S ? S.grp.position : null;
    if (at && (shot.mode === 'follow' || shot.mode === 'spin' || shot.mode === 'chase' || shot.mode === 'target' || shot.mode === 'side' || v.kind === 'live')) {
      O.tx = at.x; O.ty = at.y; O.tz = at.z;
      if (v.snap && shot.mode === 'spin') O.dist = S ? Math.max(camDist(S) * 5, 1.2) : 3;
      if (v.kind !== 'live' && shot.mode === 'follow') O.dist = Math.min(O.dist, v.R * 2);
    }
    const px = O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, pz = O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist, py = O.ty + Math.sin(O.pitch) * O.dist;
    want.set(px, py, pz); look.set(O.tx, O.ty, O.tz);
    if (shot.mode === 'orbit' || shot.mode === 'follow') v.snap = true;   // the player's own camera answers at once
  }
  const gnd = hT(v, want.x + v.cx, want.z + v.cy) * v.hk + 0.02;
  if (want.y < gnd) want.y = gnd;
  // the cinematic cameras ease after what they film, so a jittery path does not shake the picture
  if (v.snap || !v.camPos || v.camPos.distanceTo(want) > 3 * Math.max(0.5, want.distanceTo(look))) { (v.camPos || (v.camPos = new THREE.Vector3())).copy(want); (v.lookAt || (v.lookAt = new THREE.Vector3())).copy(look); v.snap = false; }
  else { const k = 1 - Math.exp(-dtR * 7); v.camPos.lerp(want, k); v.lookAt.lerp(look, Math.min(1, k * 1.5)); }
  cam.position.copy(v.camPos); cam.lookAt(v.lookAt);
  cam.updateMatrixWorld();   // the labels project with this frame's camera, not the last one's
}
/* how fast the replay runs: slower round each hit and miss */
function slowK(v) {
  if (!v.slowmo || !v.keyT || !v.keyT.length) return 1;
  let d = 1e9;
  for (const kt of v.keyT) { const x = Math.abs(v.t - kt); if (x < d) d = x; if (kt > v.t + 5) break; }
  return d < 1.2 ? 0.2 : d < 4 ? 0.2 + 0.8 * (d - 1.2) / 2.8 : 1;
}

/* ---------- every frame ---------- */
const LV = {}, tmpV = () => LV.v || (LV.v = new THREE.Vector3());
function frame(v) {
  if (v.closed || !v.renderer) return;
  v.raf = requestAnimationFrame(() => frame(v));
  const now = performance.now();
  // the small live window draws at 30 fps and leaves the rest of the frame to the map
  if (v.kind === 'live' && !v.full && now - v.last < 1000 / CFG.live.fps - 4) return;
  step(v, now);
}
/* one frame: what the tests call directly, a few hundred times over */
function step(v, now) {
  const dtR = Math.min(0.1, Math.max(0, now - v.last) / 1000); v.last = now;
  v.frames++; if (now - v.fpsT > 1000) { v.fps = v.frames; v.frames = 0; v.fpsT = now; const f = v.$('fps'); if (f) f.textContent = `${v.fps} fps · ${v.movers.length} objects · ${(v.upMs || 0).toFixed(1)} ms`; }
  const S = v.S;
  if (v.kind === 'live') { v.t = Math.max(v.t, S.time - CFG.live.lag); liveSync(v, now); }
  else {
    if (v.playing) { v.t += dtR * v.speed * slowK(v); if (v.t >= v.t1) { v.t = v.t1; v.playing = false; v.$('play').textContent = '▶'; if (v.rec) stopVideo(v); } }
    v.$('range').value = v.t; v.$('time').textContent = `${U.hhmm(v.t)}:${String(Math.floor(v.t % 60)).padStart(2, '0')}`;
  }
  const t = v.t, wind = S.wind || { x: 0, y: 0 };
  // the instanced meshes are filled again from the start
  for (const p of v.pools.values()) if (!p.parked) p.n = 0;
  v.dotList.length = 0;
  for (const m of v.movers) updMover(v, m, t);
  for (const p of v.pools.values()) if (!p.parked && p.mesh) { p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; }
  v.eng = engagement(v, v.follow || (v.cam === 'auto' ? latestMissile(v, t) : null), t);
  v.endEv = v.cam === 'auto' ? lastEnd(v, t) : null;
  camera(v, t, dtR);
  const cp = v.camera.position;
  v.sky.position.copy(cp); v.beyond.position.x = cp.x; v.beyond.position.z = cp.z;
  // the haze thins with height: from 45 km on the ground to 180 km from the cruise
  const ch = Math.max(0, cp.y - hT(v, cp.x + v.cx, cp.z + v.cy) * v.hk), far = U.clamp(450 + ch * 9, 450, 1800);
  v.scene.fog.far = far; v.scene.fog.near = far * 0.3;
  dots(v);
  for (const ev of v.events) updateEvent(ev, t, wind);
  for (const fx of v.fx) updateCm(v, fx, t);
  for (const m of v.dmgMeshes) applyDamage(m, t);
  for (const L of v.nightLights) L.visible = v.night;
  // the finest ring of ground shows only from low down: from higher up the next ring is fine enough, and the two
  // are painted the same way (the finest adds the fields the map shows close in)
  const low = ch < (v.lowGnd ? 30 : 20); if (low !== v.lowGnd) { v.lowGnd = low; for (const [k, T] of v.tiles) if (T.userData.li === 0) T.visible = low; if (low && v.sfx != null) groundSync(v, v.sfx, v.sfy); }
  for (const A of v.apts.values()) for (const r of A.radars) r.rotation.y = -t * 1.3;
  // the ground follows what the camera looks at
  if (v.kind !== 'live' && v.lookAt && v.kind !== 'gallery') { const fx = v.lookAt.x + v.cx, fy = v.lookAt.z + v.cy; if (U.dxy(fx, fy, v.sfx, v.sfy) > 15) staticSync(v, fx, fy); groundIdle(v); }
  if (v.labels) labels(v, t); else for (const tg of v.tags) if (tg.on) { tg.el.hidden = true; tg.on = false; }
  if (now - v.panelT > 120) { v.panelT = now; panel(v, t); }
  // what a frame costs: the scene update in script, then the draw call submission (the GPU works after)
  const t1 = performance.now(); v.renderer.render(v.scene, v.camera); const t2 = performance.now();
  v.upMs = v.upMs == null ? t1 - now : v.upMs * 0.95 + (t1 - now) * 0.05; v.drawMs = v.drawMs == null ? t2 - t1 : v.drawMs * 0.95 + (t2 - t1) * 0.05;
  // detail goes before frame rate: shorter trails and no smoke when the scene gets expensive
  v.cost = v.upMs + v.drawMs; if (v.kind === 'live') v.lod = v.cost > 7 ? 2 : v.cost > 4 ? 1 : 0;
  if (v.rec) capture(v);
}
IC.replayStep = (v, now) => step(v, now == null ? performance.now() : now);
const lblOff = m => { if (m.lblOn) { m.label.hidden = true; m.lblOn = false; } };
/* names on the objects, just above each; the nearest first, none on top of another */
function labels(v, t) {
  const cam = v.camera, view = v.$('view'), w = view.clientWidth, h = view.clientHeight, p = tmpV();
  const list = [], max = v.kind === 'live' ? CFG.live.maxLabels : CFG.maxLabels, placed = [];
  for (const m of v.movers) { if (!m.vis) { lblOff(m); continue; } m.ld = m.grp.position.distanceTo(cam.position) - (m === v.follow ? 1e6 : 0); list.push(m); }
  list.sort((a, b) => a.ld - b.ld);
  let shown = 0;
  for (const m of list) {
    if (shown >= max) { lblOff(m); continue; }
    p.copy(m.grp.position); p.y += m.MP.top * 1.05; p.project(cam);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) { lblOff(m); continue; }
    const lx = (p.x + 1) / 2 * w, ly = (1 - p.y) / 2 * h - 5;
    if (m !== v.follow && placed.some(q => Math.abs(q[0] - lx) < 80 && Math.abs(q[1] - ly) < 24)) { lblOff(m); continue; }
    placed.push([lx, ly]); shown++;
    const st = m.st, tr = m.tr, gnd = st.gnd;
    let sub;
    if (tr.kind === 'missile') { const G = IC.GUIDANCE[st.ph | 0]; sub = `${G ? G.name : ''} · ${U.kmh(st.spd)}${st.g > 2 ? ` · ${Math.round(st.g)} g` : ''}`; }
    else if (gnd) sub = m.ac ? `${GND_WORDS[st.phase] || 'on the ground'}${st.spd > 0.02 ? ' · ' + U.kmh(st.spd) : ''}` : st.spd > 0.02 ? U.kmh(st.spd) : tr.kind === 'unit' ? (st.det ? 'radar on' : 'radar silent') : 'stopped';
    else sub = `${m.ac ? IC.flText(st.alt) : IC.kmText(st.alt)} · ${st.spd > 0.02 ? U.kmh(st.spd) : 'stopped'}${st.g > 1.4 ? ` · ${st.g.toFixed(1)} g` : ''}${st.ph & 1 ? ' · notching' : ''}`;
    const txt = `${esc(tr.name)}<small>${esc(sub)}</small>`;
    if (m.lblTxt !== txt) { m.label.innerHTML = txt; m.lblTxt = txt; }
    const cls = 'rp-lbl ' + (m === v.follow ? 'sel' : tr.side || '');
    if (m.lblCls !== cls) { m.label.className = cls; m.lblCls = cls; }
    m.lx = lx; m.ly = ly;
    m.label.style.transform = `translate(${lx.toFixed(0)}px,${ly.toFixed(0)}px) translate(-50%,-100%)`;
    if (!m.lblOn) { m.label.hidden = false; m.lblOn = true; }
  }
  // the words of the moment, for four seconds where they happened
  let n = 0;
  const words = [];
  for (let i = v.tags.length - 1; i >= 0; i--) {
    const tg = v.tags[i], age = t - tg.e.t;
    let on = age >= 0 && age <= 4.5 && n < 10;
    if (on) { p.set(tg.p.x, tg.p.y, tg.p.z).project(cam); on = p.z <= 1 && Math.abs(p.x) <= 1.05 && Math.abs(p.y) <= 1.05; }
    if (!on) { if (tg.on) { tg.el.hidden = true; tg.on = false; } continue; }
    tg.lx = (p.x + 1) / 2 * w; tg.ly = (1 - p.y) / 2 * h - 22 - age * 4;
    // words at the same moment and place stack instead of overprinting
    for (let k = 0; k < words.length; k++) { const q = words[k]; if (Math.abs(q[0] - tg.lx) < 70 && Math.abs(q[1] - tg.ly) < 16) { tg.ly = q[1] - 17; k = -1; } }
    words.push([tg.lx, tg.ly]);
    tg.el.style.transform = `translate(${tg.lx.toFixed(0)}px,${tg.ly.toFixed(0)}px) translate(-50%,-100%)`;
    tg.el.style.opacity = age < 3.3 ? 1 : ((4.5 - age) / 1.2).toFixed(2);
    if (!tg.on) { tg.el.hidden = false; tg.on = true; } n++;
  }
}

/* ---------- the panel: what a debrief shows for the chosen object ---------- */
const GND_WORDS = ['', 'pushing back', 'taxiing', 'holding', 'take-off roll', 'on final', 'landing', 'leaving the runway', 'parking', ''];
const mach = (spd, alt) => spd * 100 / (340.3 - 4.05 * Math.min(11, Math.max(0, alt)));
const compass = h => Math.round(((h * 180 / Math.PI + 90) % 360 + 360) % 360);
function panelRows(v, t) {
  const F = v.follow && v.follow.vis ? v.follow : v.shot && v.shot.subj && v.shot.subj.vis ? v.shot.subj : null;
  if (!F) return null;
  const st = F.st, a = F.st, tr = F.tr, air = !st.gnd, rows = [];
  rows.push(['', `<b>${esc(tr.name)}</b>`]);
  if (air) {
    rows.push(['SPD', `${U.kmh(st.spd)} · M${mach(st.spd, st.alt).toFixed(2)}`]);
    rows.push(['ALT', F.ac ? `${IC.flText(st.alt)} · ${IC.kmText(st.alt)}` : IC.kmText(st.alt)]);
    rows.push(['HDG', `${String(compass(st.h)).padStart(3, '0')}° · ${a.g.toFixed(1)} g${tr.kind !== 'missile' ? ` · bank ${Math.round(Math.abs(a.roll) * 180 / Math.PI)}°${a.roll > 0.05 ? ' R' : a.roll < -0.05 ? ' L' : ''}` : ''}`]);
  } else rows.push(['', `${st.spd > 0.02 ? U.kmh(st.spd) : tr.kind === 'unit' ? (st.det ? 'radar on' : 'radar silent') : 'stopped'}${F.ac ? ' · ' + GND_WORDS[st.phase] : ''}`]);
  if (air && F.ac && (st.gear > 0 || st.phase === IC.REC_PHASE.appr)) rows.push(['', `${st.phase === IC.REC_PHASE.final ? 'on final' : st.phase === IC.REC_PHASE.appr ? 'approach' : 'climbing out'} · gear ${st.gear ? 'down' : 'up'} · flaps ${st.flap ? Math.round(st.flap * 30) + '°' : 'up'}`]);
  if (tr.kind === 'missile') { const age = t - F.tL; rows.push(['MTR', F.burn && age < F.burn ? `burning · ${Math.ceil(F.burn - age)} s left` : `coasting · ${Math.round(age)} s flown`]); }
  else if (st.ph & 1) rows.push(['', '<span style="color:#ff9ab8">NOTCHING: side-on to the missile</span>']);
  const E = v.eng && (v.eng.m === F || v.eng.tg === F) ? v.eng : engagement(v, F, t);
  if (E) {
    rows.push(['hr']);
    const other = E.m === F ? E.tg : E.m;
    if (other) rows.push([E.m === F ? 'TGT' : 'MSL', esc(other.tr.name)]);
    if (E.r != null) rows.push(['RNG', `${U.km(E.r)}${E.cls != null ? ` · closing ${U.kmh(Math.max(0, E.cls))}` : ''}`]);
    if (E.tti != null) rows.push(['TTI', `${E.tti < 10 ? E.tti.toFixed(1) : Math.round(E.tti)} s`]);
    const G = IC.GUIDANCE[E.m.st.ph | 0];
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
    g.fillStyle = 'rgba(6,11,16,0.7)'; g.fillRect(10 * sx, 8 * sy, Math.max(250 * sx, fs * 24), list.length * lh + 12);
    list.forEach(([k, x], i) => { if (k === 'hr') return; g.font = `${fs}px monospace`; g.fillStyle = '#9ab0bf'; g.fillText(k, 18 * sx, 8 * sy + 6 + i * lh); g.fillStyle = i ? '#e8eef2' : '#f2b441'; g.fillText(x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'), 18 * sx + fs * 3.2, 8 * sy + 6 + i * lh); });
  }
  g.font = `${fs}px monospace`; g.fillStyle = '#e8eef2'; g.textBaseline = 'bottom';
  g.fillText(`${v.where || ''} · ${U.hhmm(v.t)}:${String(Math.floor(v.t % 60)).padStart(2, '0')}`, 14, H - 10);
  g.shadowBlur = 0;
}

/* ---------- the live view: a small window over the map that follows one thing as it happens ---------- */
IC.liveOpen = function (S, ref) {
  if (!S.rec || !ref) return null;
  if (L && L.S === S) { L.focusRef = ref; L.follow = null; L.snap = true; liveTitle(L); if (L.scene) liveSync(L, performance.now(), true); return L; }
  if (L) IC.liveClose();
  style();
  const el = document.createElement('div'); el.className = 'live'; el.id = 'liveView'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Live view');
  const host = $('app') || document.body;
  // at the bottom of the open map, between the arsenal and the inspector and minimap, never over them (smaller
  // where the gap is narrow)
  const hw = host.clientWidth || innerWidth, hh = host.clientHeight || innerHeight, hr = host.getBoundingClientRect(), box = id => { const e = $(id), r = e && e.offsetParent && e.getBoundingClientRect(); return r && r.width ? r : null; };
  let right = hw - 12, left = 12;
  for (const id of ['insp', 'mapbox']) { const r = box(id); if (r) right = Math.min(right, r.left - hr.left - 12); }
  const ar = box('arsenal'); if (ar) left = ar.right - hr.left + 12;
  let W = Math.round(U.clamp(right - left, 320, CFG.live.w)), H = Math.round(W * CFG.live.h / CFG.live.w), x = right - W, y = hh - H - 12;
  // too narrow there (the inspector is open): above the minimap instead, as large as fits under the top bar
  const mb = box('mapbox'), tb = box('topbar'), roof = tb ? tb.bottom - hr.top + 60 : 140;
  if (right - left < 400 && mb) {
    const h = Math.min(CFG.live.h, mb.top - hr.top - 12 - roof), w = Math.round(h * CFG.live.w / CFG.live.h);
    if (w >= 320) { W = w; H = h; x = mb.right - hr.left - W; y = mb.top - hr.top - 12 - H; }
  }
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.style.left = Math.max(12, x) + 'px'; el.style.top = Math.max(12, y) + 'px';
  el.innerHTML = `<div class="rp-head" data-el="head"><span class="x live-dot" title="Live: it follows the game as it runs">● LIVE</span><span class="sub" data-el="sub"></span>
      ${camSelect('auto', ['free', 'follow'])}
      <button class="x" data-rp="toReplay" title="Replay the last 15 minutes here">⟲</button><button class="x" data-rp="full" data-el="fullBtn" title="Fill the screen">⤢</button><button class="x" data-rp="close" aria-label="Close" title="Close">✕</button></div>
    <div class="rp-view" data-el="view">${viewInner()}</div>`;
  host.appendChild(el);
  const v = L = newView(S, el, 'live');
  Object.assign(v, { focusRef: ref, cx: Math.round(ref.x), cy: Math.round(ref.y), cam: 'auto', t: S.time - CFG.live.lag, locks: true, liveEvs: [],
    orbit: { yaw: -0.8, pitch: 0.35, dist: 3, tx: 0, ty: 0, tz: 0 } });
  liveTitle(v);
  bindWindow(v); bindDrag(v);
  loadThree().then(() => { if (L === v) buildLive(v); }).catch(e => {
    const why = THREE ? 'the 3D scene could not be built (the browser console has the error)' : 'the 3D library could not be loaded from cdnjs.cloudflare.com';
    msg(v, `The live view cannot draw: ${why}. It closes in a few seconds.`);
    IC.toast && IC.toast(S, 'warn', 'LIVE', `The live view closed: ${why}.`);
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
  if (!makeRenderer(v)) { setTimeout(() => { if (L === v) IC.liveClose(); }, 6000); return; }
  flatOf(v);
  sceneBase(v);
  v.camera = new THREE.PerspectiveCamera(50, 1.6, CFG.near, CFG.far);
  v.evSeen = 0; v.lowGnd = lowStart(v);
  // what happened in the last half minute is shown as it comes in
  const R = v.S.rec; for (const e of R.ev) if (e.t < v.S.time - 30) v.evSeen = e.id;
  bindPointer(v);
  resize(v);
  setCam(v, v.cam);
  liveSync(v, performance.now(), true);
  groundWork(v, 60);   // the coarse ground at once, the rest when the browser is idle
  msg(v, '');
  v.last = 0;
  frame(v);
}
/* keeps the live scene round what it follows: movers within reach (kept a little beyond it, so nothing at the edge
   comes and goes from one moment to the next), the events as they come, the ground and airports round it */
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
    // what is shown stays while it is within the wider reach; new things come in, nearest first, up to the cap
    for (const m of v.movers) if (!want.has(m.tr) && m.tr.t1 >= v.t - 3 && m.tr.n && U.dxy(IC.recGet(m.tr, m.tr.n - 1, 1), IC.recGet(m.tr, m.tr.n - 1, 2), fx, fy) < C.keep) want.add(m.tr);
    const near = [];
    for (const tr of R.tracks) {
      if (want.has(tr) || tr.t1 < v.t - 3 || !tr.n) continue;
      const d = U.dxy(IC.recGet(tr, tr.n - 1, 1), IC.recGet(tr, tr.n - 1, 2), fx, fy);
      if (d < C.reach) near.push([tr, d + (tr.kind === 'missile' ? 0 : tr.kind === 'veh' || tr.kind === 'unit' ? 60 : 20)]);
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
    if (v.events.length && v.events[0].e.t < old) v.events = v.events.filter(ev => { if (ev.e.t >= old) return true; for (const x of [ev.flash, ev.fire, ev.frag, ...ev.puffs.map(p => p.m)]) if (x) { v.scene.remove(x); if (x.geometry !== sphereG() && x.geometry !== flameG()) x.geometry.dispose(); x.material.dispose(); } return false; });
    if (v.fx.length && v.fx[0].e.t < v.t - 20) v.fx = v.fx.filter(fx => { if (fx.e.t >= v.t - 20) return true; for (const x of [fx.pts, fx.smoke]) if (x) { v.scene.remove(x); x.geometry.dispose(); x.material.dispose(); } return false; });
    if (v.tags.length && v.tags[0].e.t < v.t - 10) v.tags = v.tags.filter(tg => { if (tg.e.t >= v.t - 10) return true; tg.el.remove(); return false; });
    if (v.liveEvs.length > 200) v.liveEvs = v.liveEvs.slice(-100);
    liveTitle(v);
    // the ground and the airports round the focus; parked aircraft as they come and go
    if (force || U.dxy(fx, fy, v.sfx, v.sfy) > 15) staticSync(v, fx, fy);
    if (force || now - (v.parkT || 0) > 2000) { v.parkT = now; airportSync(v, fx, fy); parkedSync(v); }
  }
  groundIdle(v);
}
/* ---------- the gallery: every model in 3D on a grid; down the side each seen from above and from the side,
   inside a dashed box of the real aircraft's length, span and height, so the proportions can be checked ---------- */
IC.replayGallery = function (S) {
  if (V) IC.replayClose();
  const el = makeReplayWindow('Models', 'Every model in 3D; down the side, from above and from the side inside the real size');
  const v = V = newView(S, el, 'gallery');
  Object.assign(v, { cx: 0, cy: 0, R: 60, labels: true, wasPaused: S.paused, orbit: { yaw: 1.25, pitch: 0.7, dist: 110, tx: 0, ty: 0, tz: 0 } });
  S.paused = true;
  bindWindow(v);
  el.querySelector('.rp-bar').innerHTML = `<button class="btn" data-rp="above" title="Look straight down">From above</button><span class="hint">Drag to orbit · wheel to zoom · right-drag to pan · click a model to look at it. Models are at real size next to each other: a lorry is 10 m, a wide-body 64 m. The dashed boxes down the side are the real aircraft's length, span and height.</span>`;
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
  scene.add(new THREE.HemisphereLight(0xcfe0f4, 0x40382c, 1.05 * lk));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.25 * lk); sun.position.set(-300, 400, 200); scene.add(sun);
  v.dmgMeshes = []; v.nightLights = []; v.dotList = []; v.static = new THREE.Group(); scene.add(v.static);
  winMat().color.set('#303a44');
  // a grey slab with a 10 m grid
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.fillStyle = '#3a4038'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); for (let i = 0; i <= 512; i += 32) { g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); } g.stroke();
  const tex = texSRGB(new THREE.CanvasTexture(cv)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  const slab = new THREE.Mesh(discG(), new THREE.MeshLambertMaterial({ map: tex })); slab.scale.set(960, 1, 960); scene.add(slab);
  // in metres here (the models are scaled up a hundredfold), one row a group, spaced by size
  let z = -140;
  for (const grp of IC.MODEL_GROUPS) {
    const keys = Object.keys(IC.MODELS).filter(k => IC.MODELS[k].group === grp);
    const h4 = document.createElement('h4'); h4.textContent = grp; side.appendChild(h4);
    let x = -240, rowMax = 0;
    for (const k of keys) {
      const size = IC.modelSize(k), liv = grp === 'Civil aircraft' && k !== 'light' ? IC.LIVERY[(keys.indexOf(k) * 3) % IC.LIVERY.length] : null;
      if (x > 40) { x = -240; z += rowMax + 10; rowMax = 0; }   // wrap long groups so the grid stays compact
      x += size / 2 + 6;
      const tr = { id: k, kind: 'gallery', model: k, name: IC.MODELS[k].name, side: grp === 'Enemy weapons' ? 'enemy' : grp === 'Civil aircraft' ? 'civil' : 'us', meta: { livery: liv }, marks: [] };
      const m = makeMover(v, tr); m.grp.position.set(x, 0, z); m.grp.rotation.set(0, Math.PI / 2, 0); m.grp.scale.setScalar(100); m.line.visible = false; m.fixed = true; m.vis = true; m.gsize = size;
      for (const A of m.anims) if (A.a.kind === 'flap' || A.a.kind === 'ab') A.node.visible = false;
      x += size / 2 + 6; rowMax = Math.max(rowMax, size);
      const row = document.createElement('div'); row.style.display = 'block';
      const b = document.createElement('b'); b.textContent = IC.MODELS[k].name; row.appendChild(b);
      const c = IC.modelRefCanvas(k, 440, 150, { livery: liv }); c.className = 'ref'; row.appendChild(c);
      side.appendChild(row);
    }
    z += rowMax + 14;
  }
  side.style.width = '19rem';
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const m of v.movers) { x0 = Math.min(x0, m.grp.position.x); x1 = Math.max(x1, m.grp.position.x); z0 = Math.min(z0, m.grp.position.z); z1 = Math.max(z1, m.grp.position.z); }
  Object.assign(v.orbit, { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, dist: Math.max(x1 - x0, z1 - z0) * 0.85 });
  bindPointer(v);
  resize(v);
  msg(v, '');
  v.last = performance.now();
  galleryFrame(v);
}
const REST = { gear: 1, flap: 0, spd: 0, det: 1, ab: 0 };
function galleryFrame(v) {
  if (v.closed || !v.renderer) return;
  v.raf = requestAnimationFrame(() => galleryFrame(v));
  const now = performance.now(), dtR = Math.min(0.1, (now - v.last) / 1000); v.last = now;
  v.frames++; if (now - v.fpsT > 1000) { v.fps = v.frames; v.frames = 0; v.fpsT = now; v.$('fps').textContent = `${v.fps} fps · ${v.movers.length} models`; }
  const cam = v.camera, O = v.orbit, t = now / 1000;
  if (v.cam === 'follow' && v.follow) { const p = v.follow.grp.position; O.tx = p.x; O.ty = p.y; O.tz = p.z; O.dist = Math.min(O.dist, Math.max(20, v.follow.gsize * 3)); }
  if (v.cam === 'free' && v.free) {
    const F = v.free, sp = (v.freeSpd || 1) * 60 * dtR, fwd = new THREE.Vector3(Math.cos(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), Math.sin(F.yaw) * Math.cos(F.pitch)), right = new THREE.Vector3(-Math.sin(F.yaw), 0, Math.cos(F.yaw));
    if (v.keys.has('w')) F.pos.addScaledVector(fwd, sp); if (v.keys.has('s')) F.pos.addScaledVector(fwd, -sp); if (v.keys.has('d')) F.pos.addScaledVector(right, sp); if (v.keys.has('a')) F.pos.addScaledVector(right, -sp); if (v.keys.has('e')) F.pos.y += sp; if (v.keys.has('q')) F.pos.y -= sp;
    cam.position.copy(F.pos); cam.lookAt(F.pos.clone().add(fwd));
  } else { cam.position.set(O.tx + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist, Math.max(0.5, O.ty + Math.sin(O.pitch) * O.dist), O.tz + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist); cam.lookAt(O.tx, O.ty, O.tz); }
  cam.updateMatrixWorld();
  // propellers, rotors and radars turn; everything else rests with its gear down
  for (const m of v.movers) animate(v, m, REST, t, 0.02);
  if (v.labels) {
    const view = v.$('view'), w = view.clientWidth, h = view.clientHeight, p = tmpV();
    for (const m of v.movers) {
      p.copy(m.grp.position); p.y += m.MP.top * 100 + 2; p.project(cam);
      const d = m.grp.position.distanceTo(cam.position);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05 || d > 260) { lblOff(m); continue; }
      const txt = `${esc(m.tr.name)}<small>${Math.round(IC.modelSize(m.tr.model))} m</small>`;
      if (m.lblTxt !== txt) { m.label.innerHTML = txt; m.lblTxt = txt; }
      const cls = 'rp-lbl ' + (m === v.follow ? 'sel' : m.tr.side || '');
      if (m.lblCls !== cls) { m.label.className = cls; m.lblCls = cls; }
      m.label.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(0)}px,${((1 - p.y) / 2 * h - 4).toFixed(0)}px) translate(-50%,-100%)`;
      if (!m.lblOn) { m.label.hidden = false; m.lblOn = true; }
    }
  }
  v.renderer.render(v.scene, cam);
}

IC.replayState = () => V;

})(window.IC);
