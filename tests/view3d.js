/* The 3D view run headless, for tests/run.js (in a process of its own: loading the view into the headless game
   would break the test that checks the game runs without it). A stand-in for three.js keeps the scene's objects and
   the vector sums the view needs, and counts everything created; a stand-in for the page's elements does the same.
   node tests/view3d.js → one line of JSON: what 300 frames of the live view and of a replay created, frame by frame,
   and where the models pointed. */
const IC = require('../headless.js');
const U = IC.U;

/* ---------- counting ---------- */
const made = { geometry: 0, material: 0, object: 0, texture: 0, element: 0, html: 0 };

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
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return this.set(ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx);
  }
  project(cam) {
    const d = this.clone().sub(cam.position), f = cam._f, r = cam._r, u = cam._u, z = d.dot(f);
    if (z <= 1e-6) return this.set(0, 0, 2);
    const t = Math.tan(cam.fov * Math.PI / 360);
    return this.set(d.dot(r) / (z * t * cam.aspect), d.dot(u) / (z * t), 0.5);
  }
}
class Vector2 { constructor(x, y) { this.x = x || 0; this.y = y || 0; } }
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
  lerp(c, k) { this.r += (c.r - this.r) * k; this.g += (c.g - this.g) * k; this.b += (c.b - this.b) * k; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
}
class Euler { constructor() { this.x = this.y = this.z = 0; this.order = 'XYZ'; } set(x, y, z, o) { this.x = x; this.y = y; this.z = z; if (o) this.order = o; return this; } }
class Quaternion {
  constructor() { this.x = this.y = this.z = 0; this.w = 1; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  setFromAxisAngle(a, t) { const s = Math.sin(t / 2); this.x = a.x * s; this.y = a.y * s; this.z = a.z * s; this.w = Math.cos(t / 2); return this; }
  setFromEuler(e) { this.e = [e.x, e.y, e.z]; this.x = this.y = this.z = 0; this.w = 1; return this; }
  multiply(q) { const a = this; return this.set(a.w * q.x + a.x * q.w + a.y * q.z - a.z * q.y, a.w * q.y - a.x * q.z + a.y * q.w + a.z * q.x, a.w * q.z + a.x * q.y - a.y * q.x + a.z * q.w, a.w * q.w - a.x * q.x - a.y * q.y - a.z * q.z); }
  copy(q) { Object.assign(this, q); return this; }
}
class Matrix4 { constructor() { this.elements = new Array(16).fill(0); } compose(p, q, s) { this.p = p.toArray(); return this; } copy(m) { this.p = m.p; return this; } }
class Object3D {
  constructor() { made.object++; this.layers = { enable() {}, set() {} }; this.position = new Vector3(); this.rotation = new Euler(); this.quaternion = new Quaternion(); this.scale = new Vector3(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.renderOrder = 0; this.matrix = new Matrix4(); this.parent = null; }
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
  setMatrixAt(i, M) { this.m[i] = M.p; } getMatrixAt(i, M) { M.p = this.m[i]; } dispose() {}
  setColorAt(i, c) { if (!this.instanceColor) this.instanceColor = { needsUpdate: false }; }
}
class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) { super(); Object.assign(this, { fov, aspect, near, far }); this._f = new Vector3(1, 0, 0); this._r = new Vector3(0, 0, 1); this._u = new Vector3(0, 1, 0); }
  lookAt(x, y, z) {
    const t = x instanceof Vector3 ? x : new Vector3(x, y, z), f = t.clone().sub(this.position).normalize();
    this._f = f; this._r = new Vector3().crossVectors(f, new Vector3(0, 1, 0)).normalize(); if (this._r.lengthSq() < 1e-9) this._r.set(0, 0, 1); this._u = new Vector3().crossVectors(this._r, f);
  }
  getWorldDirection(o) { return o.copy(this._f); }
  updateProjectionMatrix() {} setViewOffset() {}
}
class BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; this.needsUpdate = false; } }
class BufferGeometry {
  constructor() { made.geometry++; this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; }
  setAttribute(k, a) { this.attributes[k] = a; return this; } setIndex(a) { this.index = a; return this; }
  setDrawRange(s, c) { this.drawRange = { start: s, count: c }; } dispose() {}
}
class Material { constructor(o) { made.material++; Object.assign(this, { opacity: 1, transparent: false, userData: {} }, o || {}); this.color = new Color(o && o.color != null ? o.color : '#ffffff'); } dispose() {} }
class Texture { constructor(c) { made.texture++; this.image = c; } dispose() {} }
class Light extends Object3D { constructor(a, b, i) { super(); this.intensity = i; } }
class WebGLRenderer {
  constructor(o) { this.domElement = o && o.canvas; this.frames = 0; this.capabilities = { getMaxAnisotropy: () => 8 }; this.info = { render: { calls: 0, triangles: 0 } }; }
  setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
  render() { this.frames++; }
}
const THREE = {
  REVISION: '160', Vector3, Vector2, Color, Euler, Quaternion, Matrix4, Object3D, Group, Scene, Mesh, Points, Line, LineSegments, InstancedMesh, PerspectiveCamera,
  BufferAttribute, BufferGeometry, WebGLRenderer, Fog: class { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } },
  MeshLambertMaterial: Material, MeshBasicMaterial: Material, PointsMaterial: Material, LineBasicMaterial: Material, ShaderMaterial: Material,
  CanvasTexture: Texture, HemisphereLight: Light, DirectionalLight: Light, Raycaster: class {},
  AdditiveBlending: 2, NormalBlending: 1, DoubleSide: 2, SRGBColorSpace: 'srgb', GreaterStencilFunc: 516, AlwaysStencilFunc: 519, ReplaceStencilOp: 7681, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001
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
require('../iron-canopy/js/render3d-life.js');
IC.replayUseThree(THREE);

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
  // brief 41: a jet at a gate gets its jet bridge and its vehicles, nothing is made from frame to frame, and each
  // aircraft's lights burn as its pose says (the strobes on the runway and in the air, the beacon with the engines)
  {
    const G2 = IC.newGame({ seed: 4242, mode: 'sandbox' }); G2.time = Math.floor(G2.time / 86400) * 86400 + 11 * 3600;
    let q = null;
    for (let i = 0; i < 4 * 4 * 3600 && !q; i++) { IC.step(G2, 0.25); if (i % 40 === 0) q = G2.rec.turns.find(x => x.kind === 'bridge' && x.len > 0.3 && x.t1 == null && G2.time - x.t0 > 400 && G2.time - x.t0 < x.dur * 0.45); }
    if (!q) throw new Error('no jet turned round at a jet bridge in four hours');
    const L2 = IC.liveOpen(G2, { x: q.x, y: q.y, name: 'stand' }); await tick(); await tick();
    L2.cam = 'orbit'; L2.follow = null; Object.assign(L2.orbit, { tx: q.x - L2.cx, tz: q.y - L2.cy, ty: 0, yaw: 1, pitch: 0.4, dist: 1 });
    for (let i = 0; i < 30; i++) IC.replayStep(L2, now += 33);
    const g0 = snap(), gv0 = Object.assign({}, L2.made), lm0 = L2.life.made;
    let bad = 0, checked = 0;
    for (let i = 0; i < 200; i++) {
      IC.step(G2, 0.25); IC.replayStep(L2, now += 33);
      for (const m of L2.movers) if (m.life && m.life.lights && m.vis) {
        const on = m.life.lights.geometry.attributes.lon.array;
        m.life.lk.forEach((k, j) => { if (k === 'logo') return; checked++; if ((on[j] > 0) !== !!m.st[k]) bad++; });
      }
    }
    const st = IC.life3d.stats(L2);
    out.gate = { stats: { bridges: st.bridges, docked: st.docked, vehicles: st.vehicles, kinds: Object.assign({}, st.kinds), bars: st.bars }, made: diff(g0, snap()), view: diff(gv0, L2.made), lifeMade: L2.life.made - lm0, lights: { checked, bad }, turn: { kind: q.kind, type: q.type, age: G2.time - q.t0 } };
    IC.liveClose();
  }
  process.stdout.write(JSON.stringify(out) + '\n');
})().catch(e => { process.stdout.write(JSON.stringify({ error: e.stack }) + '\n'); process.exit(1); });
