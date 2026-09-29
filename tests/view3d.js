/* The 3D view run headless, for tests/run.js (in a process of its own: loading the view into the headless game
   would break the test that checks the game runs without it). A stand-in for three.js keeps the scene's objects and
   the vector sums the view needs, and counts everything created; a stand-in for the page's elements does the same.
   node tests/view3d.js → one line of JSON: what 300 frames of the live view and of a replay created, frame by frame,
   and where the models pointed. */
const IC = require('../headless.js');
const U = IC.U;

/* ---------- counting ---------- */
const made = { geometry: 0, material: 0, object: 0, texture: 0, element: 0, html: 0 };
// what is alive (made and not disposed): a preset switched back and forth must come back to the same numbers
const alive = { geometry: 0, material: 0, texture: 0 };
const born = (o, k) => { alive[k]++; o._k = k; };
const gone = o => { if (o._gone) return; o._gone = true; alive[o._k]--; };

/* ---------- a stand-in for three.js ---------- */
class Vector3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  negate() { return this.multiplyScalar(-1); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, k) { this.x += (v.x - this.x) * k; this.y += (v.y - this.y) * k; this.z += (v.z - this.z) * k; return this; }
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  toArray() { return [this.x, this.y, this.z]; }
  project(cam) {
    const d = this.clone().sub(cam.position), f = cam._f, r = cam._r, u = cam._u, z = d.dot(f);
    if (z <= 1e-6) return this.set(0, 0, 2);
    const t = Math.tan(cam.fov * Math.PI / 360);
    return this.set(d.dot(r) / (z * t * cam.aspect), d.dot(u) / (z * t), 0.5);
  }
}
class Vector2 { constructor(x, y) { this.x = x || 0; this.y = y || 0; } set(x, y) { this.x = x; this.y = y; return this; } }
class Vector4 { constructor(x, y, z, w) { this.set(x || 0, y || 0, z || 0, w || 0); } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } }
class Color {
  constructor(c) { this.r = this.g = this.b = 1; if (c != null) this.set(c); }
  set(c) {
    if (typeof c === 'number') { this.r = (c >> 16 & 255) / 255; this.g = (c >> 8 & 255) / 255; this.b = (c & 255) / 255; }
    else if (c instanceof Color) { this.r = c.r; this.g = c.g; this.b = c.b; }
    else if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); this.set(n); }
    else { const m = c.match(/[\d.]+/g) || [255, 255, 255]; this.r = m[0] / 255; this.g = m[1] / 255; this.b = m[2] / 255; }
    return this;
  }
  clone() { const c = new Color(); c.r = this.r; c.g = this.g; c.b = this.b; return c; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; } setScalar(k) { this.r = this.g = this.b = k; return this; } copy(c) { return this.set(c); }
  lerp(c, k) { this.r += (c.r - this.r) * k; this.g += (c.g - this.g) * k; this.b += (c.b - this.b) * k; return this; }
}
class Euler { constructor() { this.x = this.y = this.z = 0; this.order = 'XYZ'; } set(x, y, z, o) { this.x = x; this.y = y; this.z = z; if (o) this.order = o; return this; } }
class Quaternion { constructor() { this.x = this.y = this.z = 0; this.w = 1; } setFromAxisAngle(a, t) { const s = Math.sin(t / 2); this.x = a.x * s; this.y = a.y * s; this.z = a.z * s; this.w = Math.cos(t / 2); return this; } setFromEuler(e) { this.e = [e.x, e.y, e.z]; return this; } copy(q) { Object.assign(this, q); return this; } }
class Matrix4 { constructor() { this.elements = new Array(16).fill(0); } compose(p, q, s) { this.p = p.toArray(); return this; } copy(m) { this.p = m.p; return this; } multiplyMatrices() { return this; } }
class Object3D {
  constructor() { made.object++; this.position = new Vector3(); this.rotation = new Euler(); this.quaternion = new Quaternion(); this.scale = new Vector3(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.renderOrder = 0; this.matrix = new Matrix4(); this.parent = null; }
  add(c) { if (c.parent) c.parent.remove(c); this.children.push(c); c.parent = this; return this; }
  remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return this; }
  traverse(fn) { fn(this); for (const c of this.children.slice()) c.traverse(fn); }
  updateMatrix() { this.matrix.p = this.position.toArray(); }
  updateMatrixWorld() {}
}
class Group extends Object3D {}
class Scene extends Object3D {}
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class Points extends Mesh {}
class Line extends Mesh {}
class LineSegments extends Mesh {}
class InstancedMesh extends Mesh {
  constructor(g, m, n) { super(g, m); this.count = n; this.isInstancedMesh = true; this.instanceMatrix = { needsUpdate: false }; this.m = []; }
  setMatrixAt(i, M) { this.m[i] = M.p; } getMatrixAt(i, M) { M.p = this.m[i]; } setColorAt() {} dispose() {}
}
class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) { super(); Object.assign(this, { fov, aspect, near, far }); this._f = new Vector3(1, 0, 0); this._r = new Vector3(0, 0, 1); this._u = new Vector3(0, 1, 0); }
  lookAt(x, y, z) {
    const t = x instanceof Vector3 ? x : new Vector3(x, y, z), f = t.clone().sub(this.position).normalize();
    this._f = f; this._r = new Vector3().crossVectors(f, new Vector3(0, 1, 0)).normalize(); if (this._r.lengthSq() < 1e-9) this._r.set(0, 0, 1); this._u = new Vector3().crossVectors(this._r, f);
  }
  getWorldDirection(o) { return o.copy(this._f); }
  updateProjectionMatrix() {} setViewOffset() {}
  get projectionMatrix() { return this._pm || (this._pm = new Matrix4()); } get projectionMatrixInverse() { return this._pmi || (this._pmi = new Matrix4()); }
  get matrixWorld() { return this._mw || (this._mw = new Matrix4()); } get matrixWorldInverse() { return this._mwi || (this._mwi = new Matrix4()); }
}
class OrthographicCamera extends Object3D {}
class BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; this.needsUpdate = false; } }
class BufferGeometry {
  constructor() { made.geometry++; born(this, 'geometry'); this.userData = {}; this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; }
  setAttribute(k, a) { this.attributes[k] = a; return this; } setIndex(a) { this.index = a; return this; }
  setDrawRange(s, c) { this.drawRange = { start: s, count: c }; } dispose() { gone(this); }
}
class Material { constructor(o) { made.material++; born(this, 'material'); this.userData = {}; Object.assign(this, { opacity: 1, transparent: false }, o || {}); this.color = new Color(o && o.color != null ? o.color : '#ffffff'); } dispose() { gone(this); } }
class Texture { constructor(c) { made.texture++; born(this, 'texture'); this.image = c; } dispose() { gone(this); } }
class WebGLRenderTarget { constructor(w, h) { this.width = w; this.height = h; this.texture = new Texture(); this.depthTexture = null; } dispose() { this.texture.dispose(); } }
class Light extends Object3D {
  constructor(a, b, i) { super(); this.intensity = i; this.color = new Color(a); this.groundColor = new Color(b); this.target = new Object3D(); this.castShadow = false;
    this.shadow = { mapSize: new Vector2(512, 512), camera: { updateProjectionMatrix() {} }, map: null, bias: 0, normalBias: 0 }; }
}
class WebGLRenderer {
  constructor(o) { this.domElement = o && o.canvas; this.frames = 0; this.passes = 0; this.capabilities = { getMaxAnisotropy: () => 8 }; this.info = { render: { calls: 0, triangles: 0 }, reset() {} }; this.shadowMap = {}; this.target = null; }
  setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {} setRenderTarget(t) { this.target = t; } getDrawingBufferSize(v) { return v.set(960, 540); }
  render(s, c) { if (c instanceof OrthographicCamera) this.passes++; else this.frames++; }
}
class PMREMGenerator { constructor() { this.made = 0; } fromScene() { this.made++; return new WebGLRenderTarget(256, 256); } dispose() {} }
const THREE = {
  REVISION: '160', Vector3, Vector2, Vector4, Color, OrthographicCamera, WebGLRenderTarget, PMREMGenerator, DepthTexture: Texture,
  MeshStandardMaterial: Material, ShaderMaterial: Material, ShaderChunk: {}, ShaderLib: { standard: { uniforms: { fogColor: { value: null } } } },
  HalfFloatType: 1016, UnsignedByteType: 1009, LinearFilter: 1006, DepthStencilFormat: 1027, UnsignedInt248Type: 1020, ACESFilmicToneMapping: 4, PCFSoftShadowMap: 2, SRGBColorSpace: 'srgb', BackSide: 1, Euler, Quaternion, Matrix4, Object3D, Group, Scene, Mesh, Points, Line, LineSegments, InstancedMesh, PerspectiveCamera,
  BufferAttribute, BufferGeometry, WebGLRenderer, Fog: class { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } },
  MeshLambertMaterial: Material, MeshBasicMaterial: Material, PointsMaterial: Material, LineBasicMaterial: Material,
  CanvasTexture: Texture, HemisphereLight: Light, DirectionalLight: Light, Raycaster: class {},
  AdditiveBlending: 2, DoubleSide: 2, GreaterStencilFunc: 516, AlwaysStencilFunc: 519, ReplaceStencilOp: 7681, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001
};

/* ---------- a stand-in for the page ---------- */
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (t[k] = () => ({ addColorStop() {}, width: 10 })), set: (t, k, v) => { t['_' + String(k)] = v; return true; } });
class El {
  constructor(tag) { made.element++; this.tag = tag; this.style = {}; this.dataset = {}; this.children = []; this.hidden = false; this.textContent = ''; this._html = ''; this._q = {}; this.width = 300; this.height = 150; this.parentElement = null;
    this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }; }
  get innerHTML() { return this._html; } set innerHTML(h) { made.html++; this._html = h; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; } remove() {}
  querySelector(sel) { const m = sel.match(/data-(?:el|rp)="?([\w-]+)"?/); if (!m) return null; return this._q[m[1]] || (this._q[m[1]] = new El('div')); }
  querySelectorAll() { return []; } closest() { return null; } setAttribute() {} addEventListener() {} setPointerCapture() {}
  getContext() { return ctx; } getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; }
  get clientWidth() { return 960; } get clientHeight() { return 540; } get offsetWidth() { return 0; }
}
global.document = { createElement: t => new El(t), head: new El('head'), body: new El('body'), getElementById: () => null };
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
global.addEventListener = () => {}; global.removeEventListener = () => {}; global.innerWidth = 1280; global.innerHeight = 800;
IC.cam = { x: 0, y: 0, z: 1, vw: 1280, vh: 800 };
IC.drawAirport = () => {};
IC.drawTerrain = () => 0;   // the map's painters need a canvas: the ground is left unpainted here
IC.daylight = t => { const h = (t % 86400) / 3600; return h < 5 || h > 20.5 ? 0 : h < 7.5 ? (h - 5) / 2.5 : h > 18 ? 1 - (h - 18) / 2.5 : 1; };
require('../iron-canopy/js/replay3d.js');
IC.replayUseThree(THREE);
require('../iron-canopy/js/render3d-fx.js');   // the picture (brief 40): its passes, sky and weather run here too

/* ---------- the runs ---------- */
const tick = () => new Promise(r => setImmediate(r));
const snap = () => Object.assign({}, made);
const diff = (a, b) => { const d = {}; for (const k in a) if (b[k] !== a[k]) d[k] = b[k] - a[k]; return d; };
/* where a mover's model points (from its turn about y) and how it banks, against where its track goes */
function facing(v) {
  const out = [];
  for (const m of v.movers) {
    if (!m.vis || !m.ac || m.st.spd < 0.03 || m.st.gnd && m.st.phase === 1) continue;
    const tr = m.tr, a = IC.recAt(tr, v.t - 0.5, {}), b = IC.recAt(tr, v.t + 0.5, {}); if (!a || !b || U.dxy(a.x, a.y, b.x, b.y) < 0.05) continue;
    const move = Math.atan2(b.y - a.y, b.x - a.x), nose = -m.grp.rotation.y - m.st.crab;
    out.push({ off: Math.abs(U.angWrap(nose - move)), roll: m.grp.rotation.x, turn: m.st.roll, who: tr.name + ' ' + tr.kind + ' ' + tr.model + ' ph' + m.st.phase + ' spd' + m.st.spd.toFixed(2) + ' h' + (m.st.h * 57.3).toFixed(0) + ' mv' + (move * 57.3).toFixed(0) });
  }
  return out;
}
(async () => {
  IC.seedRandom(34);
  const out = {};
  // the live view following an airliner as it taxis at the capital, 300 frames with the game paused, then 300 with it running
  const S = IC.newGame({ seed: 4242, mode: 'sandbox' });
  let m = null;
  for (let i = 0; i < 4 * 1800; i++) IC.step(S, 0.25);
  for (let i = 0; i < 4 * 1800 && !m; i++) { IC.step(S, 0.25); for (const b of IC.bases(S)) for (const x of b.moves || []) if (!m && x.phase === 'taxi' && x.kind === 'dep' && x.type !== 'light') m = x; }
  const home = S.byId[m.ap];
  for (let i = 0; i < 4 * 8; i++) IC.step(S, 0.25);
  const L = IC.liveOpen(S, m); await tick(); await tick();
  let now = 1000;
  for (let i = 0; i < 30; i++) { IC.replayStep(L, now += 33); }
  const w0 = snap(), m0 = Object.assign({}, L.made);
  for (let i = 0; i < 300; i++) IC.replayStep(L, now += 33);
  out.livePaused = { made: diff(w0, snap()), view: diff(m0, L.made), movers: L.movers.length, tiles: L.tiles.size, frames: L.renderer.frames };
  // running: a new mover only for a new track, never twice for the same one; each tile built once
  const seen = new Map(), tilesSeen = new Map(), mk = L.made.mover;
  const origMake = L.movers.length;
  let again = 0, rebuilt = 0, faced = [];
  for (let i = 0; i < 300; i++) {
    IC.step(S, 0.25); IC.replayStep(L, now += 33);
    for (const x of L.movers) { const s = seen.get(x.tr); if (s && s !== x) again++; seen.set(x.tr, x); }
    for (const [k, T] of L.tiles) { const s = tilesSeen.get(k); if (s && s !== T) rebuilt++; tilesSeen.set(k, T); }
    if (i % 30 === 0) faced = faced.concat(facing(L));
  }
  out.liveRunning = { time: S.time, near: S.rec.tracks.filter(tr => tr.t1 > S.time - 3 && U.dxy(IC.recGet(tr, tr.n - 1, 1), IC.recGet(tr, tr.n - 1, 2), L.fx0, L.fy0) < 500).length, again, rebuilt, movers: L.movers.length, newMovers: L.made.mover - mk, from: origMake, faced };
  IC.liveClose();
  // a replay of the last minutes round the capital's airport, playing 300 frames
  const V = IC.replayOpen(S, { x: home.x, y: home.y, t: S.time - 120 }); await tick(); await tick();
  if (!V.renderer || !V.scene) throw new Error('the replay did not build: ' + V.$('msg').innerHTML);
  V.playing = true; V.speed = 1;
  for (let i = 0; i < 30; i++) IC.replayStep(V, now += 33);
  const r0 = snap(), rv0 = Object.assign({}, V.made);
  let rf = [];
  for (let i = 0; i < 300; i++) { IC.replayStep(V, now += 33); if (i % 30 === 0) rf = rf.concat(facing(V)); }
  out.replay = { made: diff(r0, snap()), view: diff(rv0, V.made), movers: V.movers.length, frames: V.renderer.frames, faced: rf };
  IC.replayClose();
  // strike aircraft notching against a battery on the Test range: a replay following the one that turned hardest
  const R = IC.newGame({ seed: 7, mode: 'range' }), T = R.range.target;
  IC.rangeAddUnit(R, 'mrsam', T.x - 30, T.y); IC.rangeAddUnit(R, 'lr3d', T.x - 60, T.y + 20);
  IC.rangeSpawn(R, { what: 'str', n: 3, brg: 90, km: 120, alt: '' });
  for (let i = 0; i < 4 * 360; i++) IC.step(R, 0.25);
  let tr = null, tt = 0, bank = 0;
  for (const x of R.rec.tracks) if (x.kind === 'threat') for (let i = 2; i < x.n - 2; i++) { const t = IC.recGet(x, i, 0), a = IC.recAttitude(x, t); if (Math.abs(a.roll) > bank) { bank = Math.abs(a.roll); tr = x; tt = t; } }
  const W = IC.replayOpen(R, { follow: tr.ref, x: IC.recGet(tr, 0, 1), y: IC.recGet(tr, 0, 2), t: tt - 2, r: 120, cam: 'chase' }); await tick(); await tick();
  W.t = tt; W.playing = false;
  for (let i = 0; i < 3; i++) IC.replayStep(W, now += 33);
  const f = W.moverOf.get(tr);
  out.turn = { bank, roll: f.grp.rotation.x, poseRoll: f.st.roll, faced: facing(W) };
  IC.replayClose();
  // the picture's presets: each switched to and run, then back to the first; weather and hours of the day built
  {
    const S2 = IC.newGame({ seed: 4242, mode: 'sandbox' });
    for (let i = 0; i < 4 * 1200; i++) IC.step(S2, 0.25);
    let m2 = null; for (let i = 0; i < 4 * 1800 && !m2; i++) { IC.step(S2, 0.25); for (const b of IC.bases(S2)) for (const x of b.moves || []) if (!m2 && x.phase === 'taxi' && x.type !== 'light') m2 = x; }
    const Lq = IC.liveOpen(S2, m2); await tick(); await tick();
    for (let i = 0; i < 20; i++) IC.replayStep(Lq, now += 33);
    const q = {}, al = () => Object.assign({}, alive);
    for (const [k, lvl] of [['medium', 'medium'], ['low', 'low'], ['high', 'high'], ['ultra', 'ultra'], ['medium2', 'medium']]) {
      IC.fx3d.setQuality(Lq, lvl);
      for (let i = 0; i < 20; i++) IC.replayStep(Lq, now += 33);
      const a = snap(), p0 = Lq.renderer.passes;
      for (let i = 0; i < 60; i++) IC.replayStep(Lq, now += 33);
      q[k] = { made: diff(a, snap()), alive: al(), state: IC.fx3d.state(Lq), passes: (Lq.renderer.passes - p0) / 60 };
    }
    out.presets = q;
    // the weather and the time of day: each state set, a few frames to settle, then frames that must make nothing
    const W = {};
    for (const [kind, hour] of [['clear', 12], ['clear', 19.6], ['clear', 23.5], ['scattered', 12], ['overcast', 12], ['rain', 22.5], ['storm', 15], ['fog', 7], ['snow', 11]]) {
      IC.fx3d.look(Lq, { hour, weather: kind });
      for (let i = 0; i < 10; i++) IC.replayStep(Lq, now += 33);
      const a = snap(); let flashes = 0;
      for (let i = 0; i < 700; i++) { IC.replayStep(Lq, now += 33); if (IC.fx3d.state(Lq).flash > 0.5) flashes++; }
      W[kind + '@' + hour] = Object.assign(IC.fx3d.state(Lq), { flashes, made: diff(a, snap()) });
    }
    out.weather = W;
    IC.liveClose();
    out.closed = al();
  }
  process.stdout.write(JSON.stringify(out) + '\n');
})().catch(e => { process.stdout.write(JSON.stringify({ error: e.stack }) + '\n'); process.exit(1); });
