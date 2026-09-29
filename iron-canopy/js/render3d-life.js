/* Iron Canopy — life in the 3D view (brief 41): aircraft that move like real ones, airports that are alive, launches
   you can see. Loaded with the 3D view; replay3d.js calls it through a few hooks (IC.life3d) and lends it its
   geometry, materials and ground (IC.R3D). Everything is driven by the recorder (record.js), never scripted:

   - Aircraft, from IC.recPose: ailerons, elevators and rudder with the manoeuvre; flaps and slats by phase; spoilers
     and reversers after touchdown; the nose wheel steering on the taxi; gear folding nose first after lift-off; the
     wing bending (sagging on the ground, lifting in flight, shaking in rough air); fans and propellers spooling up,
     blurred at speed; lights as crews switch them, with the landing and taxi lights' beams and pools on the ground;
     tyre smoke, reverser spray, heat haze behind the engines, contrails high up in cold air, wingtip vapour on a
     humid approach, a fighter's shock diamonds.
   - Airports: runway edge, centreline, threshold and touchdown-zone lights, approach lights with their running
     flashers, PAPI (red and white by the camera's height), taxiway centre (green) and edge (blue) lights, stop bars
     lit until an aircraft is cleared across (then the green lead-on), floodlit aprons, windsocks with the wind, the
     tower's beacon. Jet bridges swing out to the door and back before the pushback; the service vehicles come and go
     by each turnaround's clock (record.js notes each one: what serves it and how long it takes), along a service
     lane in front of the stands: stairs, ground power, belt loaders and baggage trains, catering, fuel truck or
     hydrant dispenser, buses at remote stands, lorries at cargo stands, the pushback tug; a follow-me car ahead of a
     heavy taxiing in; fire tenders at their station, out to a crash or standing by in an air raid alert.
   - Launches: a flash and a ring of dust at the launcher, a cloud of smoke that hangs, and the booster that burns
     out and falls away tumbling.

   Nothing is made from frame to frame: vehicles, bridges, boosters and light pools are instanced meshes filled
   each frame; lights are points in one shader (size by distance, blinking by the clock in the shader); smoke, spray
   and flashes are two particle buffers rewritten each frame. What is out of reach is not drawn.

   The light interface with brief 40 (render3d-fx.js, its bloom): every glowing material made here is marked with
   its glow(material, k) (IC.R3D.glow, when it is there: drawn k times brighter, so it blooms), goes through the
   picture's tone mapping and colour space, and is listed in v.life.glow; the objects are also on layer
   IC.LIFE3D.bloomLayer for a selective pass; IC.life3d.gain(v, k) scales the lights' own brightness. */
(function (IC) {
'use strict';
const U = IC.U;
const L3 = IC.life3d = {};
const CFG = IC.LIFE3D = {
  bloomLayer: 1,
  drive: 0.08,            // service vehicles on the apron, world units a second (8 m/s, 29 km/h)
  reach: 140,             // airports farther than this from the camera (14 km) show no vehicles
  vehReach: 45,           // a turnaround farther than this (4.5 km) is not drawn
  smokeN: 7000, glowN: 2500, dynN: 1500, poolN: 400
};
const M = 0.01;           // a metre in world units
let T = null, H = null;
const init = () => { H = IC.R3D; T = (H.three || H.THREE)(); return T; };
const ramp = (x, a, b) => U.clamp((x - a) / (b - a), 0, 1);
const ease = (cur, want, dt, secs) => cur == null || dt > 2 ? want : cur + U.clamp(want - cur, -dt / secs, dt / secs);

/* ---------- materials: lights as points, smoke and glow as particles ---------- */
const LIGHT_VS = `
attribute vec3 lcol; attribute float lsz; attribute vec3 lblk; attribute float lon;
uniform float uTime, uFocal, uMinPx, uMaxPx, uGain, uFar;
varying vec3 vCol; varying float vA;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1e-4, -mv.z), px = lsz * uFocal / d, b = 1.0;
  if (lblk.x > 0.0) { float ph = fract(uTime / lblk.x + lblk.y); b = ph < lblk.z ? 1.0 : 0.0; }
  float a = lon * b * clamp(1.0 - d / uFar, 0.0, 1.0) * clamp(px / uMinPx, 0.35, 1.0);
  vA = a; vCol = lcol * uGain;
  gl_PointSize = a > 0.002 ? clamp(px * 2.4, uMinPx, uMaxPx) : 0.0;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const LIGHT_FS = `
varying vec3 vCol; varying float vA;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = ((1.0 - smoothstep(0.0, 0.42, r)) + pow(max(0.0, 1.0 - r), 3.0) * 0.5) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, a);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
const PART_VS = `
attribute vec4 pcol; attribute float psz;
uniform float uFocal, uMaxPx, uFar;
varying vec4 vCol;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1e-4, -mv.z), px = psz * uFocal / d;
  vCol = pcol; vCol.a *= clamp(1.0 - d / uFar, 0.0, 1.0) * clamp(px / 1.5, 0.2, 1.0);
  gl_PointSize = clamp(px, 1.5, uMaxPx);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PART_FS = `
varying vec4 vCol;
uniform float uAdd;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = vCol.a * (uAdd > 0.5 ? pow(max(0.0, 1.0 - r), 2.2) : (1.0 - smoothstep(0.25, 1.0, r)) * (0.85 + 0.15 * sin(c.x * 17.0 + c.y * 11.0)));
  if (a < 0.004) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(vCol.rgb * a, a) : vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
/* the output's colour space chunk by three's version (older ones call it encodings) */
const fs = src => src.replace('#include <OUT_CS>', (+T.REVISION || 128) >= 152 ? '#include <colorspace_fragment>' : '#include <encodings_fragment>');
/* brief 40's picture draws a material marked with glow k times brighter, so it blooms (render3d-fx.js) */
const glowMark = (v, m, k) => { m.userData.bloom = true; v.life.glow.push(m); return H.glow ? H.glow(m, k) : m; };
function lightMat(v) {
  const m = new T.ShaderMaterial({ vertexShader: LIGHT_VS, fragmentShader: fs(LIGHT_FS), transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFocal: { value: 1000 }, uMinPx: { value: 1.6 }, uMaxPx: { value: 72 }, uGain: { value: 1 }, uFar: { value: 900 } } });
  return glowMark(v, m, 5);
}
function partMat(v, add) {
  const m = new T.ShaderMaterial({ vertexShader: PART_VS, fragmentShader: fs(PART_FS), transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { uFocal: { value: 1000 }, uMaxPx: { value: 600 }, uFar: { value: 1400 }, uAdd: { value: add ? 1 : 0 } } });
  return add ? glowMark(v, m, 4) : m;
}
const bloom = o => { if (o.layers && o.layers.enable) o.layers.enable(CFG.bloomLayer); return o; };
/* a set of light points: positions, colours, sizes (world units), blinking [period s, phase 0–1, share lit], on */
function lightSet(v, n) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('lcol', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('lsz', new T.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('lblk', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('lon', new T.BufferAttribute(new Float32Array(n), 1));
  const p = new T.Points(g, v.life.lightMat); p.frustumCulled = false; p.renderOrder = 7;
  p.userData.n = 0;
  return bloom(p);
}
const colTmp = {};
function hexRGB(hex) { let c = colTmp[hex]; if (!c) { const x = new T.Color(hex); c = colTmp[hex] = [x.r, x.g, x.b]; } return c; }
function putLight(L, x, y, z, hex, sz, blk, on) {
  const i = L.userData.n++, g = L.geometry.attributes, c = hexRGB(hex);
  g.position.array[i * 3] = x; g.position.array[i * 3 + 1] = y; g.position.array[i * 3 + 2] = z;
  g.lcol.array[i * 3] = c[0]; g.lcol.array[i * 3 + 1] = c[1]; g.lcol.array[i * 3 + 2] = c[2];
  g.lsz.array[i] = sz; g.lon.array[i] = on == null ? 1 : on;
  if (blk) { g.lblk.array[i * 3] = blk[0]; g.lblk.array[i * 3 + 1] = blk[1]; g.lblk.array[i * 3 + 2] = blk[2]; }
  return i;
}
function lightsDone(L) { L.geometry.setDrawRange(0, L.userData.n); for (const k of ['position', 'lcol', 'lsz', 'lblk', 'lon']) L.geometry.attributes[k].needsUpdate = true; return L; }
/* a particle buffer: smoke (normal blending) or glow (additive) */
function partSet(v, n, add) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('pcol', new T.BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('psz', new T.BufferAttribute(new Float32Array(n), 1));
  g.setDrawRange(0, 0);
  const p = new T.Points(g, partMat(v, add)); p.frustumCulled = false; p.renderOrder = add ? 9 : 8;
  p.userData = { n: 0, cap: n };
  return add ? bloom(p) : p;
}
function emit(P, x, y, z, sz, r, g, b, a) {
  const d = P.userData; if (d.n >= d.cap || a < 0.004) return;
  const i = d.n++, A = P.geometry.attributes;
  A.position.array[i * 3] = x; A.position.array[i * 3 + 1] = y; A.position.array[i * 3 + 2] = z;
  A.pcol.array[i * 4] = r; A.pcol.array[i * 4 + 1] = g; A.pcol.array[i * 4 + 2] = b; A.pcol.array[i * 4 + 3] = a; A.psz.array[i] = sz;
}
function partFlush(P) { const A = P.geometry.attributes; P.geometry.setDrawRange(0, P.userData.n); A.position.needsUpdate = true; A.pcol.needsUpdate = true; A.psz.needsUpdate = true; P.userData.n = 0; }

/* textures made once: a soft round pool of light on the ground, a fan's blur */
const poolTex = () => H.share('life:pool', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return H.texSRGB(new T.CanvasTexture(c));
});
const blurTex = () => H.share('life:blur', () => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(150,158,166,0.9)'); gr.addColorStop(0.75, 'rgba(120,128,136,0.55)'); gr.addColorStop(1, 'rgba(90,96,102,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  g.strokeStyle = 'rgba(210,216,222,0.35)'; g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.arc(64, 64, 34 + (i % 3) * 9, a, a + 0.5); g.stroke(); }
  return H.texSRGB(new T.CanvasTexture(c));
});
/* a flat disc facing +x (a fan or propeller's plane), with uvs */
const discX = () => H.share('life:discX', () => {
  const N = 24, pos = new Float32Array((N + 1) * 3), uv = new Float32Array((N + 1) * 2), nor = new Float32Array((N + 1) * 3), idx = [];
  uv[0] = uv[1] = 0.5; nor[0] = 1;
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pos[(i + 1) * 3 + 1] = Math.cos(a); pos[(i + 1) * 3 + 2] = Math.sin(a); uv[(i + 1) * 2] = 0.5 + Math.cos(a) / 2; uv[(i + 1) * 2 + 1] = 0.5 + Math.sin(a) / 2; nor[(i + 1) * 3] = 1; idx.push(0, 1 + i, 1 + (i + 1) % N); }
  return H.geom(pos, nor, null, uv, new Uint16Array(idx));
});
const fanMat = () => H.share('life:fanMat', () => new T.MeshBasicMaterial({ map: blurTex(), transparent: true, depthWrite: false, side: T.DoubleSide }));
const propMat = () => H.share('life:propMat', () => new T.MeshBasicMaterial({ map: blurTex(), transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide }));
const beamMat = () => H.share('life:beam', () => { const m = new T.MeshBasicMaterial({ color: '#fff2d8', transparent: true, opacity: 0.035, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }); m.userData.bloom = true; return m; });

/* ---------- geometry of the pieces, from models.js ---------- */
/* a model or a fixture in one piece, in world units about its origin; and its moving groups apart */
function partsOf(key, fixture) {
  return H.share('life:parts:' + key, () => {
    const me = fixture ? IC.fixtureMesh(key, 1) : IC.modelMesh(key, 1), names = Object.keys(me.groups);
    const still = names.filter(n => !me.groups[n].pivot || me.groups[n].kind === 'main' || me.groups[n].kind === 'win');
    const moving = names.filter(n => !still.includes(n));
    return { all: H.toScene(me, names, {}, null, M), still: H.toScene(me, still, {}, null, M),
      moving: moving.map(n => { const g = me.groups[n], pv = g.pivot; return { name: n, kind: g.kind, up: g.up, geom: H.toScene(me, [n], {}, pv, M), pivot: [pv[0] * M, pv[2] * M, pv[1] * M], axis: [g.axis[0], g.axis[2], g.axis[1]] }; }),
      lights: me.lights.map(l => [l.x * M, l.z * M, l.y * M, l.kind]) };
  });
}

/* ---------- instanced pools, filled every frame ---------- */
function ipool(v, key, gm, mat, cap) {
  const P = v.life.pools;
  let p = P.get(key);
  if (p && p.cap >= cap) return p;
  const mesh = new T.InstancedMesh(gm, mat, cap); mesh.frustumCulled = false; mesh.count = 0;
  if (p) { v.scene.remove(p.mesh); if (p.mesh.dispose) p.mesh.dispose(); }
  p = { key, mesh, cap, n: 0, color: !!p && p.color }; P.set(key, p); v.scene.add(mesh); v.life.made++;
  return p;
}
/* makes sure a pool has room for n more than the airports built so far need (called when an airport is built) */
function need(v, key, n, gm, mat, A) { const w = (v.life.want.get(key) || 0) + n; v.life.want.set(key, w); if (A) A.wants.push([key, n]); return ipool(v, key, gm, mat, Math.max(16, w)); }
const E = {}, TQ = {}, TP = {}, TS = {};
function tmp() { if (!E.e) { E.e = new T.Euler(); TQ.q = new T.Quaternion(); TQ.q2 = new T.Quaternion(); TQ.q3 = new T.Quaternion(); TP.p = new T.Vector3(); TP.p2 = new T.Vector3(); TP.ax = new T.Vector3(); TS.s = new T.Vector3(1, 1, 1); TS.m = new T.Matrix4(); } }
/* one instance: at (x, y, z) in the scene, heading h on the map, pitched and rolled, scaled */
function inst(v, key, x, y, z, h, pitch, roll, sx, sy, sz) {
  const p = v.life.pools.get(key); if (!p || p.n >= p.cap) return -1;
  E.e.set(roll || 0, -h, pitch || 0, 'YZX'); TQ.q.setFromEuler(E.e);
  TP.p.set(x, y, z); TS.s.set(sx || 1, sy || 1, sz || 1);
  TS.m.compose(TP.p, TQ.q, TS.s); p.mesh.setMatrixAt(p.n, TS.m);
  return p.n++;
}
/* a moving part of the last instance: rotated about its pivot by ang, or slid along its axis by d, or stretched s */
function instPart(v, key, part, x, y, z, h, ang, d, s) {
  const p = v.life.pools.get(key); if (!p || p.n >= p.cap) return;
  E.e.set(0, -h, 0, 'YZX'); TQ.q.setFromEuler(E.e);
  TP.p.set(part.pivot[0] + part.axis[0] * (d || 0), part.pivot[1] + part.axis[1] * (d || 0), part.pivot[2] + part.axis[2] * (d || 0)).applyQuaternion(TQ.q);
  TP.p.x += x; TP.p.y += y; TP.p.z += z;
  if (ang) { TP.ax.set(part.axis[0], part.axis[1], part.axis[2]); TQ.q2.setFromAxisAngle(TP.ax, -ang); TQ.q.multiply(TQ.q2); }
  TS.s.set(1, s && part.axis[1] ? s : 1, 1);
  TS.m.compose(TP.p, TQ.q, TS.s); p.mesh.setMatrixAt(p.n++, TS.m);
}

/* ---------- the scene: what every view has ---------- */
L3.scene = function (v) {
  init(); tmp();
  v.life = { glow: [], pools: new Map(), want: new Map(), made: 0, apts: [], plans: new Map(), booster: 0, stats: {}, clock: 0, fN: 0, dtR: 1 / 30, updAcc: 0 };
  v.life.lightMat = lightMat(v);
  v.life.smoke = partSet(v, CFG.smokeN, false); v.life.glowP = partSet(v, CFG.glowN, true);
  v.life.dyn = lightSet(v, CFG.dynN); v.life.dyn.geometry.setDrawRange(0, 0);
  for (const x of [v.life.smoke, v.life.glowP, v.life.dyn]) v.scene.add(x);
  // pools of light on the ground (taxi and landing lights, floodlit aprons): brightness per instance by its colour
  const pm = new T.MeshBasicMaterial({ map: poolTex(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, color: '#ffffff' }); glowMark(v, pm, 1);
  const pp = ipool(v, 'lpool', H.quadG(), pm, CFG.poolN); pp.mesh.renderOrder = 6; pp.color = true; bloom(pp.mesh);
  if (pp.mesh.setColorAt) { const c = new T.Color(0, 0, 0); for (let i = 0; i < CFG.poolN; i++) pp.mesh.setColorAt(i, c); }
  v.life.pcol = new T.Color();
  // boosters falling away from the missiles that dropped them
  ipool(v, 'booster', partsOf('booster', true).all, H.solidMat(), 32);
  // the kinds of dayK: how bright a light of each kind is by day (strobes and beacons show, nav lights hardly)
  v.life.day = U.clamp(((v.light == null ? 1 : v.light) - 0.3) / 0.4, 0, 1);
  v.life.nightK = 1 - v.life.day;
  return v.life;
};
/* the lights' brightness (brief 40: above 1 for its HDR pipeline and bloom) */
L3.gain = (v, k) => { if (v.life) for (const m of v.life.glow) if (m.uniforms && m.uniforms.uGain) m.uniforms.uGain.value = k; };
L3.stats = v => v.life ? v.life.stats : null;

/* ---------- aircraft ---------- */
const LKIND = { red: ['#ff2a1e', 0.035, null], green: ['#2aff5a', 0.035, null], white: ['#ffffff', 0.03, null], strobe: ['#ffffff', 0.09, [1.2, 0, 0.05]],
  beacon: ['#ff2410', 0.06, [1.0, 0, 0.14]], land: ['#fff4dc', 0.09, null], taxi: ['#fff4dc', 0.06, null], logo: ['#fff0d8', 0.05, null], amber: ['#ffae2a', 0.03, [0.8, 0, 0.3]] };
const LFLAG = { red: 'nav', green: 'nav', white: 'nav', strobe: 'strobe', beacon: 'beacon', land: 'land', taxi: 'taxi', logo: 'logo' };
const LDAY = { nav: 0.25, strobe: 1, beacon: 0.9, land: 0.45, taxi: 0.25, logo: 0 };
const LBIT = { nav: 1, strobe: 2, beacon: 4, land: 8, taxi: 16, logo: 32 };
L3.mover = function (v, m) {
  if (!v.life) return;
  const X = m.life = { beams: [], blur: [], jet: false, fans: [], engines: [], tips: null, td: null, gear: [], fr: -1, gearK: null, ail: null, elev: null, rud: null, spoil: null, flex: null, rev: null, n1: null };
  if (m.tr.kind === 'missile') { missileInit(v, m); return; }
  if (!m.ac || !m.body) return;
  const nodeOf = new Map(m.anims.map(A => [A.a.name, A]));
  for (const A of m.anims) {
    A.base = A.node.position.clone();
    // parts that hang from a bending wing move with it
    if (A.a.parent && nodeOf.has(A.a.parent)) { const P = nodeOf.get(A.a.parent); P.node.add(A.node); A.node.position.set(A.a.pivot[0] - P.a.pivot[0], A.a.pivot[1] - P.a.pivot[1], A.a.pivot[2] - P.a.pivot[2]); A.base = A.node.position.clone(); }
    if (A.a.kind === 'fan' || A.a.kind === 'prop') {
      // the blur disc: the fan's face, or the propeller's sweep, seen when it turns fast
      let R = A.a.R ? A.a.R * M : 0; if (!R) { const p = A.a.geom.attributes.position.array; for (let i = 0; i < p.length; i += 3) R = Math.max(R, Math.hypot(p[i + 1], p[i + 2])); }
      const d = new T.Mesh(discX(), A.a.kind === 'fan' ? fanMat() : propMat()); d.scale.set(1, R, R); d.visible = false; d.renderOrder = 5;
      (A.node.parent || m.body).add(d); d.position.copy(A.node.position); d.position.x += A.a.kind === 'fan' ? 0.0003 : 0;
      X.blur.push({ A, d }); if (A.a.kind === 'fan') { X.jet = true; X.engines.push(A.a.pivot); }
    }
    if (A.a.kind === 'gear') X.gear.push(A);
  }
  if (m.tr.model === 'fighter' || m.tr.model === 'ftr_e' || m.tr.model === 'str' || m.tr.model === 'bmr' || m.tr.model === 'ewj') X.jet = true;
  // lights: points on the body, which ones burn follows the pose
  const Ls = m.MP.lights; X.lk = [];
  if (Ls.length) {
    const pts = X.lights = lightSet(v, Ls.length);
    Ls.forEach((l, i) => { const K = LKIND[l.kind] || LKIND.white, blk = K[2] ? [K[2][0], (m.ph0 + (l.p[1] < 0 ? 0.5 : 0) + (l.kind === 'strobe' && l.p[2] < 0 ? 0.08 : 0)) % 1, K[2][2]] : null; putLight(pts, l.p[0], l.p[1], l.p[2], K[0], K[1], blk, 0); X.lk.push(LFLAG[l.kind] || 'nav'); });
    lightsDone(pts); m.body.add(pts); X.lmask = -1;
    // the landing and taxi lights' beams, forward and a little down
    for (const l of Ls) if (l.kind === 'land' || l.kind === 'taxi') {
      const b = new T.Mesh(H.coneG(), beamMat()); b.position.set(l.p[0], l.p[1], l.p[2]); b.rotation.set(0, 0, -0.09);
      const len = l.kind === 'land' ? 1.8 : 0.7; b.scale.set(len, len * 0.13, len * 0.13); b.visible = false; b.renderOrder = 8; m.body.add(bloom(b)); X.beams.push({ b, kind: l.kind });
    }
  }
  // where the wingtips and the main wheels are, for vapour and tyre smoke (world units, body frame)
  let tip = 0; for (const l of Ls) if (l.kind === 'green') tip = Math.max(tip, Math.abs(l.p[2]));
  X.tip = tip || m.MP.size * 0.45; X.tipX = (Ls.find(l => l.kind === 'green') || { p: [0] }).p[0];
  X.mainY = 0; for (const A of X.gear) if (A.a.name !== 'gearN') X.mainY = Math.max(X.mainY, Math.abs(A.a.pivot[2]));
  X.mainX = m.MP.xm || 0;
  X.wet = seedOf(m.tr.id);
};
const seedOf = s => { let h = 7; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0; return (h >>> 0) % 1000 / 1000; };
L3.dropMover = function (v, m) {
  const X = m.life; if (!X) return;
  if (X.lights) { X.lights.parent && X.lights.parent.remove(X.lights); X.lights.geometry.dispose(); }
};
L3.hide = function (v, m) { const X = m.life; if (!X) return; for (const b of X.beams) b.b.visible = false; if (X.lights) X.lights.visible = false; };

/* the model's moving parts, from the pose: true when this took the part (else replay3d's own animation does) */
L3.anim = function (v, m, A, st, t, dt) {
  const k = A.a.kind, X = m.life;
  // eased once a frame for the whole aircraft (a model has two ailerons, three gear legs...)
  if (X && X.fr !== (v.life ? v.life.fN : t)) {
    X.fr = v.life ? v.life.fN : t;
    // the gear keeps the pose's own timing (it already takes eight seconds); the ease only smooths a jump
    X.gearK = ease(X.gearK, st.gear, dt, 1.2);
    X.ail = ease(X.ail, st.ail || 0, dt, 0.35); X.elev = ease(X.elev, st.elev || 0, dt, 0.35); X.rud = ease(X.rud, st.rud || 0, dt, 0.5);
    X.spoil = ease(X.spoil, st.spoil || 0, dt, 0.7); X.flex = ease(X.flex, st.flex == null ? 1 : st.flex, dt, 0.6);
    X.rev = ease(X.rev, st.rev || 0, dt / 2, 1.2);
    X.n1 = ease(X.n1, st.n1 == null ? (v.kind === 'gallery' ? 0 : 0.8) : st.n1, dt / 2, 1.5);
  }
  if (k === 'gear') {
    // the nose leg folds first, the mains after it; the nose wheel steers on the taxi
    const g = X && X.gearK != null ? X.gearK : m.gearK == null ? st.gear : m.gearK, nose = A.a.name === 'gearN', legK = nose ? ramp(g, 0.4, 1) : ramp(g, 0, 0.6);
    A.node.visible = legK > 0.02;
    A.node.quaternion.setFromAxisAngle(A.axis, -(1 - legK) * A.a.up);
    if (nose && st.steer) { TP.ax.set(0, 1, 0); TQ.q3.setFromAxisAngle(TP.ax, -st.steer); A.node.quaternion.multiply(TQ.q3); }
    return true;
  }
  if (!X) return false;
  const q = (ang) => { A.node.quaternion.setFromAxisAngle(A.axis, -ang); return true; };
  switch (k) {
    case 'flap': A.node.visible = m.flapK > 0.02; return q(m.flapK * A.a.up);
    case 'ail': return q(X.ail * A.a.up);
    case 'elev': return q(X.elev * A.a.up);
    case 'rud': return q(X.rud * A.a.up);
    case 'spoil': A.node.visible = X.spoil > 0.02; return q(X.spoil * A.a.up);
    case 'slat': A.node.visible = m.flapK > 0.02; return q(Math.min(1, m.flapK * 3) * A.a.up);
    case 'flex': return q((X.flex - 1) * A.a.up);
    case 'rev': case 'revc': {
      A.node.visible = X.rev > 0.02;
      if (k === 'rev') A.node.position.set(A.base.x + A.axis.x * X.rev * A.a.up * M, A.base.y, A.base.z + A.axis.z * X.rev * A.a.up * M);
      return true;
    }
    case 'fan': case 'prop': {
      // the engines spool: the fan turns with n1 and blurs at speed; propellers blur sooner
      // (turning by the real clock: at game speed they would only flicker)
      const fan = k === 'fan', w = fan ? 2 + X.n1 * 24 : (4 + X.n1 * 30) * (A.a.rpm || 1);
      A.ang = ((A.ang || 0) + (v.life ? v.life.dtR : 0.02) * w) % (Math.PI * 2);
      const blur = X.n1 > (fan ? 0.3 : 0.12);
      A.node.visible = !blur || !fan;
      for (const b of X.blur) if (b.A === A) { b.d.visible = blur; b.d.rotation.x = -A.ang * 0.2; }
      return q(A.ang);
    }
    case 'lift': return true;
    case 'scissor': return true;
    case 'sock': return true;
  }
  return false;
};

/* each frame, for every mover shown: lights, beams, the pools they throw, and the air it stirs */
const WP = {}, WQ = {}, FQ = {};
/* a point in the aircraft's own frame (world units: x forward, y up, z to starboard) to the scene */
function toWorld(m, lx, ly, lz, out) {
  const r = m.grp.rotation, cy = Math.cos(r.y), sy = Math.sin(r.y), cz = Math.cos(r.z), sz = Math.sin(r.z), cx = Math.cos(r.x), sx = Math.sin(r.x);
  // YZX: roll about x, then pitch about z, then yaw about y
  const y1 = ly * cx - lz * sx, z1 = ly * sx + lz * cx;
  const x2 = lx * cz - y1 * sz, y2 = lx * sz + y1 * cz;
  out.x = m.grp.position.x + x2 * cy + z1 * sy; out.y = m.grp.position.y + y2; out.z = m.grp.position.z - x2 * sy + z1 * cy;
  return out;
}
L3.upd = function (v, m, st, t, dt, dot) {
  const X = m.life; if (!X || !v.life) return;
  const t0 = performance.now(); updOne(v, m, X, st, t, dt, dot); v.life.updAcc += performance.now() - t0;
};
function updOne(v, m, X, st, t, dt, dot) {
  if (m.tr.kind === 'missile') { missileFx(v, m, st, t); return; }
  if (!m.ac || !m.body) return;
  const lod = !dot && m.lod, night = v.life.nightK > 0.35;
  if (X.lights) {
    X.lights.visible = !dot && !v.radar;
    // which lights burn: a mask of the pose's switches; the brightness written only when it changes
    const mask = (st.nav ? 1 : 0) | (st.strobe ? 2 : 0) | (st.beacon ? 4 : 0) | (st.land ? 8 : 0) | (st.taxi ? 16 : 0) | (st.logo && night ? 32 : 0);
    if (mask !== X.lmask) {
      X.lmask = mask; const on = X.lights.geometry.attributes.lon;
      for (let j = 0; j < X.lk.length; j++) { const k = X.lk[j]; on.array[j] = mask & LBIT[k] ? (night ? 1 : LDAY[k] * v.life.day + v.life.nightK) : 0; }
      on.needsUpdate = true;
    }
  }
  // the beams show in the air and on the runway (on the taxiway the pool on the ground says it)
  for (const b of X.beams) b.b.visible = lod && night && !v.radar && b.kind === 'land' && st.land > 0 && st.alt < 3 && (!st.gnd || st.phase === IC.REC_PHASE.roll || st.phase === IC.REC_PHASE.land);
  if (v.radar) return;
  // when the view is short of time (v.lod 2) the costly effects go first: contrails, vapour, haze, spray
  const S = v.S, P = WP, alt = st.alt, spd = st.spd, gnd = st.gnd, rich = v.lod < 2;
  // the pools the taxi and landing lights throw on the ground ahead
  if (night && !dot && (st.taxi || (st.land && alt < 0.15))) {
    const ahead = gnd ? 0.35 + m.MP.len * 0.5 : Math.min(2.5, alt * KMh(v) / 0.09), g0 = H.hT(v, st.x, st.y) * v.hk + H.LIFT.rw + 0.001;
    const hx = Math.cos(st.h), hy = Math.sin(st.h), k = gnd ? 0.55 : 0.8 * (1 - alt / 0.15);
    pool(v, st.x + hx * ahead - v.cx, g0, st.y + hy * ahead - v.cy, st.h, gnd ? 0.3 : 0.5, gnd ? 0.22 : 0.3, k, 0.95, 0.85);
  }
  // the pushback: the tug at the nose, facing the aircraft; let go, it drives off to the side
  if (gnd && !dot && v.life.pools.has('tug')) {
    const nose = m.MP.len / 2 + 0.036;
    if (st.phase === IC.REC_PHASE.push) { toWorld(m, nose, 0, 0, P); inst(v, 'tug', P.x, H.hT(v, st.x, st.y) * v.hk + H.LIFT.rw, P.z, st.h + Math.PI); }
    else {
      const p1 = lastMark(m.tr, 'p1', t, 45);
      if (p1 != null && (!X.p1 || X.p1.t !== p1)) { const s1 = IC.recAt(m.tr, p1, {}); X.p1 = s1 ? { t: p1, x: s1.x + Math.cos(st.h) * nose, y: s1.y + Math.sin(st.h) * nose, h: st.h } : null; }
      if (p1 != null && X.p1) {
        const a = t - p1, sd = Math.max(0, a - 4) * CFG.drive * 0.7, turn = ramp(a, 3, 9), h = X.p1.h, sx = -Math.sin(h), sy = Math.cos(h);
        inst(v, 'tug', X.p1.x + sx * sd - v.cx, H.hT(v, X.p1.x, X.p1.y) * v.hk + H.LIFT.rw, X.p1.y + sy * sd - v.cy, h + Math.PI - turn * Math.PI / 2);
      }
    }
    // a follow-me car leads a heavy in to its stand (where the record knows where it goes next)
    if (st.phase === IC.REC_PHASE.taxi && m.MP.len > 0.5 && lastMark(m.tr, 'td', t, 1500) != null && m.tr.t1 > t + 12) {
      const f = IC.recAt(m.tr, t + 11, WQ), g = f && IC.recAt(m.tr, t + 12, FQ);
      if (f && g && U.dxy(f.x, f.y, st.x, st.y) > m.MP.len * 0.6) inst(v, 'followme', f.x - v.cx, H.hT(v, f.x, f.y) * v.hk + H.LIFT.rw, f.y - v.cy, U.dxy(f.x, f.y, g.x, g.y) > 0.001 ? Math.atan2(g.y - f.y, g.x - f.x) : st.h);
    }
  }
  // tyre smoke: a puff at each main wheel as it touches, trailing back and thinning out
  const td = lastMark(m.tr, 'td', t, 6);
  if (td != null && m.MP.len > 0.2) for (const sg of [1, -1]) for (let i = 0; i < 9; i++) {
    const a = t - td - i * 0.08; if (a < 0 || a > 5) continue;
    const back = a * spd * 0.35 + a * 0.02, r = 0.012 + 0.045 * Math.sqrt(a / 5) * (1 + (i % 3) * 0.2);
    toWorld(m, X.mainX - back - i * 0.004, 0.006 + r * 0.4, sg * X.mainY * (1 + 0.15 * (i % 2)), P);
    emit(v.life.smoke, P.x, P.y, P.z, r * 2, 0.92, 0.92, 0.9, 0.55 * (1 - a / 5));
  }
  if (dot && alt < 7) return;
  const wet = IC.sky ? IC.sky(S).wet : false, humid = S.weather && ['rain', 'storm', 'fog', 'overcast', 'snow'].includes(S.weather.kind);
  // reversers: spray thrown forward and out on a wet runway, a haze of heat and dust on a dry one
  if (X.rev > 0.3 && gnd && spd > 0.15) for (const e of X.engines) for (let i = 0; i < 14; i++) {
    const a = ((t * 1.4 + i / 14 + seedOf(i)) % 1), side = e[2] > 0 ? 1 : -1;
    toWorld(m, e[0] - 0.03 + a * 0.12, e[1] + a * (wet ? 0.05 : 0.02), e[2] + side * (0.02 + a * (wet ? 0.1 : 0.05)) * (0.6 + seedOf(i + 3)), P);
    if (wet) emit(v.life.smoke, P.x, P.y, P.z, 0.03 + a * 0.12, 0.9, 0.92, 0.94, 0.4 * (1 - a) * X.rev);
    else emit(v.life.smoke, P.x, P.y, P.z, 0.02 + a * 0.08, 0.72, 0.68, 0.6, 0.12 * (1 - a) * X.rev);
  }
  // spray off a wet runway behind the wheels at speed
  if (rich && wet && gnd && spd > 0.3) for (const sg of [1, -1]) for (let i = 0; i < 10; i++) { const a = (t * 2 + i / 10) % 1; toWorld(m, X.mainX - 0.02 - a * spd * 0.4, 0.005 + a * 0.03, sg * X.mainY * (1 + a * 0.8), P); emit(v.life.smoke, P.x, P.y, P.z, 0.02 + a * 0.08, 0.86, 0.88, 0.9, 0.3 * (1 - a) * ramp(spd, 0.3, 0.6)); }
  // heat haze behind the engines at high power on the ground (a faint shimmer)
  if (rich && gnd && (X.n1 || 0) > 0.6 && lod) for (const e of X.engines) for (let i = 0; i < 6; i++) { const a = (t * 3 + i / 6) % 1; toWorld(m, e[0] - 0.05 - a * 0.25, e[1] + a * 0.01, e[2] + Math.sin(t * 13 + i) * 0.004, P); emit(v.life.smoke, P.x, P.y, P.z, 0.03 + a * 0.05, 0.85, 0.85, 0.82, 0.05 * (1 - a)); }
  // a fighter's afterburner: shock diamonds in the flame
  if (st.ab && lod) for (let i = 0; i < 5; i++) { toWorld(m, -m.MP.len / 2 - 0.012 - i * 0.012, m.MP.top * 0.4, 0, P); emit(v.life.glowP, P.x, P.y, P.z, 0.008 * (1 - i * 0.12), 1, 0.75 + 0.05 * i, 0.5, (0.8 - i * 0.12) * (0.85 + 0.15 * Math.sin(t * 40 + i))); }
  // contrails above about FL260 in cold air (jets only); a trail behind each engine along the recorded path
  if (rich && X.jet && alt > 7.6 && X.wet < 0.75) contrail(v, m, st, t, ramp(alt, 7.6, 8.6) * (0.6 + X.wet * 0.5));
  // wingtip vapour: humid air on the approach, or a hard pull
  if (rich && !gnd && !dot && (humid && st.flap > 0.3 || st.g > 1.6)) for (const sg of [1, -1]) for (let i = 0; i < 16; i++) {
    const a = i / 16, back = a * spd * 1.2;
    toWorld(m, X.tipX - back, 0, sg * X.tip, P);
    emit(v.life.smoke, P.x, P.y, P.z, 0.006 + a * 0.012, 0.95, 0.96, 0.98, 0.35 * (1 - a) * (humid ? 1 : ramp(st.g, 1.6, 3)));
  }
}
const KMh = v => IC.R3D.KM * v.hk;
function lastMark(tr, kind, t, within) { for (let i = tr.marks.length - 1; i >= 0; i--) { const q = tr.marks[i]; if (q[1] === kind && q[0] <= t) return t - q[0] < within ? q[0] : null; } return null; }
function pool(v, x, y, z, h, sx, sz, k, g, b) {
  const p = v.life.pools.get('lpool'); if (!p || p.n >= p.cap) return;
  const i = inst(v, 'lpool', x, y, z, h, 0, 0, sx, 1, sz);
  if (i >= 0 && p.mesh.setColorAt) { v.life.pcol.setRGB(k, k * g, k * b); p.mesh.setColorAt(i, v.life.pcol); }
}
const CP = [];
function contrail(v, m, st, t, k) {
  const P = CP; P.length = 0; IC.recPath(m.tr, t - 45, t, P, true);
  const n4 = P.length / 4; if (n4 < 2) return;
  const eng = m.life.engines.length ? m.life.engines : [[0, 0, m.MP.size * 0.12], [0, 0, -m.MP.size * 0.12]];
  let acc = 0;
  for (let i = n4 - 1; i > 0; i--) {
    const x0 = P[i * 4], y0 = P[i * 4 + 1], x1 = P[(i - 1) * 4], y1 = P[(i - 1) * 4 + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1e-6, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    for (let s = acc; s < L; s += 0.7) {
      const age = t - (P[i * 4 + 3] + (P[(i - 1) * 4 + 3] - P[i * 4 + 3]) * s / L), f = s / L;
      if (age < 1.2) continue;
      const x = x0 + ux * s, y = y0 + uy * s, a = P[i * 4 + 2] + (P[(i - 1) * 4 + 2] - P[i * 4 + 2]) * f, spread = 0.05 + age * 0.012;
      for (const e of eng) {
        const lat = e[2] * (1 + age * 0.004), px = x - uy * lat, py = y + ux * lat;
        emit(v.life.smoke, px - v.cx, a * KMh(v) + H.hT(v, px, py) * v.hk - age * 0.002, py - v.cy, spread, 0.95, 0.96, 0.98, k * 0.5 * U.clamp(1.4 - age / 40, 0, 1) * ramp(age, 1.2, 4));
      }
    }
    acc = 0;
  }
}

/* ---------- missiles: the launch and the booster ---------- */
const BOOST = { LR: 4.5, EXO: 5, HAT: 5, MR: 3.2, TBD: 3.5, VLR: 6, ER: 5 };
function missileInit(v, m) {
  const X = m.life, mun = m.tr.meta.mun, st0 = IC.recAt(m.tr, IC.recFirstT(m.tr), {});
  X.tL = IC.recFirstT(m.tr) - IC.REC.fine;
  // fired from the ground: from its launcher (the missile's first sample may already be well on its way)
  const ut = v.S.rec && m.tr.meta.uref ? v.S.rec.of.get(m.tr.meta.uref) : null, us = ut && (ut.kind === 'unit' || ut.kind === 'veh') ? IC.recAt(ut, X.tL, {}) || IC.recAt(ut, ut.t1, {}) : null;
  X.ground = !!us || (!!st0 && st0.alt < 0.05);
  X.x0 = us ? us.x : st0 ? st0.x : 0; X.y0 = us ? us.y : st0 ? st0.y : 0; X.p0 = st0;
  X.sep = BOOST[mun] != null ? X.tL + BOOST[mun] : null;
  if (X.sep != null) { const p = v.life.pools.get('booster'); if (p && v.life.booster + 1 > p.cap) ipool(v, 'booster', p.mesh.geometry, p.mesh.material, p.cap * 2); v.life.booster++; }
  X.s0 = null; X.s1 = null;
}
function missileFx(v, m, st, t) {
  const X = m.life, age = t - X.tL, P = WP, sm = v.life.smoke, gl = v.life.glowP;
  if (v.radar) return;
  // the launch: a flash, dust thrown out in a ring along the ground, a cloud of smoke that hangs and drifts
  if (X.ground && age >= 0 && age < 40) {
    const x0 = X.x0, y0 = X.y0, g0 = H.hT(v, x0, y0) * v.hk, w = v.S.wind || { x: 0, y: 0 };
    // the smoke from the launcher up to where the missile was first seen, spreading and thinning
    if (X.p0) { const px = X.p0.x, py = X.p0.y, pz = H.hT(v, px, py) * v.hk + X.p0.alt * KMh(v), n = Math.min(60, Math.ceil(Math.hypot(px - x0, py - y0, pz - g0) / 0.06)); for (let i = 0; i <= n; i++) { const f = i / n, sp = 0.04 + age * 0.012 * (0.5 + f); emit(sm, x0 + (px - x0) * f + w.x * age * 0.08 - v.cx, g0 + 0.02 + (pz - g0) * f, y0 + (py - y0) * f + w.y * age * 0.08 - v.cy, sp, 0.9, 0.9, 0.88, 0.55 * U.clamp(1 - age / 35, 0, 1)); } }
    if (age < 0.6) emit(gl, x0 - v.cx, g0 + 0.03, y0 - v.cy, 0.5 * (1 - age / 0.6) + 0.1, 1, 0.85, 0.55, 1 - age / 0.6);
    if (age < 8) for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, r = 0.05 + 0.35 * (1 - Math.exp(-age * 1.2)); emit(sm, x0 + Math.cos(a) * r - v.cx, g0 + 0.01 + age * 0.002, y0 + Math.sin(a) * r - v.cy, 0.08 + age * 0.03, 0.62, 0.58, 0.52, 0.45 * (1 - age / 8)); }
    for (let i = 0; i < 12; i++) { const a = age - i * 0.25; if (a < 0) continue; const k = seedOf(i + 11) - 0.5; emit(sm, x0 + k * 0.1 + w.x * a * 0.1 - v.cx, g0 + 0.02 + a * 0.004 + i * 0.01, y0 + (seedOf(i) - 0.5) * 0.1 + w.y * a * 0.1 - v.cy, 0.1 + a * 0.02, 0.86, 0.86, 0.84, 0.5 * (1 - age / 40)); }
  }
  // the booster: burnt out, it drops away and tumbles to the ground
  if (X.sep != null && !X.s1 && t > X.sep + 0.5 && t < X.sep + 60) { X.s0 = IC.recAt(m.tr, X.sep, {}); X.s1 = X.s0 && IC.recAt(m.tr, X.sep + 0.5, {}); }
  if (X.sep != null && X.s0 && X.s1 && t > X.sep) {
    const a = t - X.sep, vx = (X.s1.x - X.s0.x) / 0.5, vy = (X.s1.y - X.s0.y) / 0.5, vz = (X.s1.alt - X.s0.alt) * KMh(v) / 0.5, g0 = H.hT(v, X.s0.x, X.s0.y) * v.hk;
    // slowed hard by the air, then falling: where it is b seconds after it let go
    const at = (b, o) => { const c = 1.8 * (1 - Math.exp(-b / 1.8)); o.x = X.s0.x + vx * c; o.y = X.s0.y + vy * c; o.z = g0 + X.s0.alt * KMh(v) + vz * c - 0.5 * 0.0981 * v.hk * b * b; return o; };
    const q = at(a, WQ);
    if (q.z > H.hT(v, q.x, q.y) * v.hk && a < 60) {
      const s = m.MP.len * 100 * 0.35;
      inst(v, 'booster', q.x - v.cx, q.z, q.y - v.cy, Math.atan2(vy, vx), a * 2.1, a * 1.3, s, 1.3, 1.3);
      X.bpos = X.bpos || {}; X.bpos.x = q.x - v.cx; X.bpos.y = q.z; X.bpos.z = q.y - v.cy;   // where it is (for a camera)
      // the last of its smoke trails behind it as it tumbles
      for (let b = Math.max(0, a - 6); b < a; b += 0.2) { const r = at(b, FQ), k = 1 - (a - b) / 6; emit(v.life.smoke, r.x - v.cx, r.z, r.y - v.cy, 0.03 + (a - b) * 0.01, 0.88, 0.88, 0.86, 0.35 * k * U.clamp(1 - b / 8, 0, 1)); }
    }
  }
}

/* ---------- airports ---------- */
const LC = { edge: '#ffe6b4', centre: '#fff6ea', thr: '#35ff6a', end: '#ff3020', tdz: '#fff6ea', appr: '#fff0d0', flash: '#ffffff', taxi: '#22ff66', tedge: '#3a66ff', bar: '#ff2a14', flood: '#ffd8a0', white: '#ffffff', beacon: '#3aff6a' };
/* the nearest point of a building of these kinds to p (its kerb) */
function kerb(b, kinds, p) {
  let best = null, bd = 1e9;
  for (const q of b.parts) if (kinds.includes(q.kind) && q.built && q.hp > q.max * 0.25) {
    const w = q.w || (q.r || 0.1) * 2, h = q.h || (q.r || 0.1) * 2, l = IC.rectLocal(q, p), c = IC.rectWorld(q, U.clamp(l.x, -w / 2, w / 2), U.clamp(l.y, -h / 2, h / 2)), d = U.dist(c, p);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
/* stop bars at every hold-short line (as the map draws them: render-airport.js) */
function holdBars(b) {
  const G = IC.aptGraph(b), out = [];
  for (const [, Ls] of G.adj) for (const e of Ls) {
    const B = G.N.get(e.to), A = G.N.get(e.from);
    if (e.kind !== 'taxi' || !B || !B.rw || (A && A.rw) || e.len < IC.GOPS.HOLD + 0.1) continue;
    const ux = (A.x - B.x) / e.len, uy = (A.y - B.y) / e.len, part = b.parts.find(p => p.id === e.part);
    out.push({ key: e.key, x: B.x + ux * IC.GOPS.HOLD, y: B.y + uy * IC.GOPS.HOLD, ux, uy, w: part ? part.w : 0.23, i0: 0, on: -1 });
  }
  return out;
}
L3.airport = function (v, b, f, G) {
  if (!v.life) return null;
  const S = v.S, y0 = f.e * v.hk, cx = v.cx, cy = v.cy, A = { b, f, y0, lights: [], bars: [], papis: [], socks: [], floods: [], stands: [], fire: [], crashes: [], alertT: null, wants: [], frame: 0 };
  const Lr = lightSet(v, 12000), X = (x, y) => [x - cx, y - cy];
  const put = (L, x, y, dz, hex, sz, blk, on) => { if (L.userData.n >= L.geometry.attributes.lon.count) return -1; const [px, pz] = X(x, y); return putLight(L, px, y0 + (dz || 0.004), pz, hex, sz, blk, on); };
  const big = b.kind === 'airport' || b.kind === 'airbase';
  // runways: edge lights every 60 m, the centreline every 30 m, green thresholds and red ends, touchdown-zone
  // barrettes, approach lights 900 m out with a crossbar and running flashers, and the PAPI on the left
  for (const rw of b.parts) {
    if (rw.kind !== 'runway' || !rw.built) continue;
    const Lg = IC.rwLen(rw), d = IC.rwDir(rw), n = { x: -d.y, y: d.x }, hw = rw.w / 2 + 0.02, grass = IC.paveOf && IC.paveOf(rw) === 'grass';
    if (grass) continue;
    for (let s = 0; s <= Lg + 1e-6; s += 0.6) { const p = IC.rwAt(rw, s / Lg); for (const e of [-1, 1]) put(Lr, p.x + n.x * e * hw, p.y + n.y * e * hw, 0.004, LC.edge, 0.03); }
    if (Lg > 15) for (let s = 0.3; s < Lg; s += 0.3) { const p = IC.rwAt(rw, s / Lg); put(Lr, p.x, p.y, 0.003, LC.centre, 0.022); }
    for (const [t, sg] of [[0, 1], [1, -1]]) {
      const p = IC.rwAt(rw, t), dx = d.x * sg, dy = d.y * sg;
      for (let i = -6; i <= 6; i++) { put(Lr, p.x + n.x * i * hw / 6 - dx * 0.01, p.y + n.y * i * hw / 6 - dy * 0.01, 0.004, LC.thr, 0.035); put(Lr, p.x + n.x * i * hw / 6 + dx * 0.02, p.y + n.y * i * hw / 6 + dy * 0.02, 0.004, LC.end, 0.03); }
      if (Lg >= 24) for (let s = 0.6; s <= 9; s += 0.3) for (const e of [-1, 1]) for (let k = 0; k < 3; k++) { const q = { x: p.x + dx * s + n.x * e * (0.09 + k * 0.015), y: p.y + dy * s + n.y * e * (0.09 + k * 0.015) }; put(Lr, q.x, q.y, 0.003, LC.tdz, 0.02); }
      if (Lg >= 20) {
        for (let s = 0.3; s <= 9; s += 0.3) {
          const q = { x: p.x - dx * s, y: p.y - dy * s }, gz = (H.hT(v, q.x, q.y) - f.e) * v.hk + 0.01;
          for (let k = -2; k <= 2; k++) put(Lr, q.x + n.x * k * 0.012, q.y + n.y * k * 0.012, gz, LC.appr, 0.03);
          if (Math.abs(s - 3) < 0.01) for (let k = -7; k <= 7; k++) if (Math.abs(k) > 2) put(Lr, q.x + n.x * k * 0.02, q.y + n.y * k * 0.02, gz, LC.appr, 0.03);
          // the rabbit: a flash that runs from 900 m out to 300 m, twice a second
          if (s >= 3) put(Lr, q.x, q.y, gz + 0.004, LC.flash, 0.1, [0.5, (9 - s) / 6 * 0.9, 0.05]);
        }
        // PAPI: four boxes on the left 300 m in; their colours follow the camera (frame)
        const ln = { x: dy, y: -dx }, base = { x: p.x + dx * 3 + ln.x * (hw + 0.15), y: p.y + dy * 3 + ln.y * (hw + 0.15) }, idx = [];
        for (let i = 0; i < 4; i++) { const q = { x: base.x + ln.x * i * 0.09, y: base.y + ln.y * i * 0.09 }; idx.push(put(Lr, q.x, q.y, 0.006, LC.white, 0.035)); }
        A.papis.push({ x: base.x, y: base.y, dx, dy, idx, col: -1 });
      }
      // a windsock by each threshold
      if (big) { const ln = { x: dy, y: -dx }; A.socks.push({ x: p.x + dx * 3.5 + ln.x * (hw + 0.7), y: p.y + dy * 3.5 + ln.y * (hw + 0.7) }); }
    }
  }
  A.rwN = Lr.userData.n;
  // taxiways: green on the centreline every 30 m, blue at the edges every 60 m
  for (const p of b.parts) {
    if (p.kind !== 'taxi' || !p.built || !p.nodes) continue;
    const w = (p.w || 0.23) / 2 + 0.015;
    for (let i = 1; i < p.nodes.length; i++) {
      const a = b.nodes[p.nodes[i - 1]], c = b.nodes[p.nodes[i]]; if (!a || !c) continue;
      const Lg = U.dxy(a.x, a.y, c.x, c.y); if (Lg < 0.01) continue;
      const ux = (c.x - a.x) / Lg, uy = (c.y - a.y) / Lg;
      for (let s = 0; s < Lg; s += 0.3) put(Lr, a.x + ux * s, a.y + uy * s, 0.003, LC.taxi, 0.018);
      for (let s = 0.3; s < Lg - 0.2; s += 0.6) for (const e of [-1, 1]) put(Lr, a.x + ux * s - uy * e * w, a.y + uy * s + ux * e * w, 0.004, LC.tedge, 0.018);
    }
  }
  A.txN = Lr.userData.n; A.barN0 = Lr.userData.n;
  // stop bars and their green lead-on lights (which are lit follows the record of clearances: frame)
  for (const bar of holdBars(b)) {
    bar.i0 = Lr.userData.n;
    for (let i = 0; i < 7; i++) { const k = (i / 6 - 0.5) * bar.w * 1.1; put(Lr, bar.x - bar.uy * k, bar.y + bar.ux * k, 0.005, LC.bar, 0.028); }
    for (let s = 0.12; s <= IC.GOPS.HOLD; s += 0.15) put(Lr, bar.x - bar.ux * s, bar.y - bar.uy * s, 0.004, s < 0.3 ? '#ffd650' : LC.taxi, 0.022, null, 0);
    bar.i1 = Lr.userData.n; A.bars.push(bar);
  }
  A.barN1 = Lr.userData.n;
  // the aprons' floodlight masts, along the edge behind the stands
  const floodGeo = partsOf('flood', true).all, masts = [];
  for (const p of b.parts) {
    if (p.kind !== 'apron' || !p.built || !(p.stands || []).length) continue;
    const s0 = p.stands[0], l = IC.rectLocal(p, { x: s0.x + Math.cos(s0.a) * 0.2, y: s0.y + Math.sin(s0.a) * 0.2 }), back = Math.sign(l.y) || 1;
    const long = p.w >= p.h, Lg = long ? p.w : p.h;
    for (let x = -Lg / 2 + 0.5; x <= Lg / 2 - 0.3; x += 1.1) {
      const q = long ? IC.rectWorld(p, x, back * (p.h / 2 + 0.06)) : IC.rectWorld(p, back * (p.w / 2 + 0.06), x);
      masts.push(q); A.floods.push({ x: q.x, y: q.y, into: long ? IC.rectWorld(p, x, back * (p.h / 2 - 0.5)) : IC.rectWorld(p, back * (p.w / 2 - 0.5), x) });
      put(Lr, q.x, q.y, 0.245, LC.flood, 0.14, null, 0);
    }
  }
  A.flN = Lr.userData.n;
  // the tower's beacon: white and green in turn, as it rotates
  for (const p of b.parts) if (p.kind === 'tower' && p.built) { put(Lr, p.x, p.y, 0.49, LC.white, 0.1, [2, 0, 0.1], 0); put(Lr, p.x, p.y, 0.49, LC.beacon, 0.1, [2, 0.5, 0.1], 0); }
  A.end = Lr.userData.n;
  lightsDone(Lr); G.add(Lr); A.L = Lr;
  if (masts.length) {
    const im = new T.InstancedMesh(floodGeo, H.solidMat(), masts.length); im.frustumCulled = false;
    masts.forEach((q, i) => { E.e.set(0, 0, 0, 'YZX'); TQ.q.setFromEuler(E.e); TP.p.set(q.x - cx, y0, q.y - cy); TS.s.set(1, 1, 1); TS.m.compose(TP.p, TQ.q, TS.s); im.setMatrixAt(i, TS.m); });
    im.instanceMatrix.needsUpdate = true; G.add(im);
  }
  // PAPI boxes and windsocks
  const papiN = A.papis.length * 4;
  if (papiN) {
    const im = new T.InstancedMesh(partsOf('papi', true).all, H.solidMat(), papiN); im.frustumCulled = false; let i = 0;
    for (const pp of A.papis) for (let k = 0; k < 4; k++) { const ln = { x: pp.dy, y: -pp.dx }; E.e.set(0, -Math.atan2(pp.dy, pp.dx), 0, 'YZX'); TQ.q.setFromEuler(E.e); TP.p.set(pp.x + ln.x * k * 0.09 - cx, y0, pp.y + ln.y * k * 0.09 - cy); TS.s.set(1, 1, 1); TS.m.compose(TP.p, TQ.q, TS.s); im.setMatrixAt(i++, TS.m); }
    im.instanceMatrix.needsUpdate = true; G.add(im);
  }
  const sp = partsOf('sock', true);
  for (const s of A.socks) {
    const mast = new T.Mesh(sp.still, H.solidMat()); mast.position.set(s.x - cx, y0, s.y - cy); G.add(mast);
    const sock = new T.Mesh(sp.moving[0].geom, H.solidMat()); sock.position.set(s.x - cx + sp.moving[0].pivot[0], y0 + sp.moving[0].pivot[1], s.y - cy + sp.moving[0].pivot[2]); G.add(sock); s.node = sock;
  }
  // what the vehicles need: the stands, where their depots are, and room in the pools
  const stands = IC.aptStands ? IC.aptStands(b) : [];
  const per = { tug: 1.2, bagtractor: 2, bagcart: 6, stairs: 2, apbus: 3, refueller: 1, dispenser: 1, gpu: 1, lorry: 4, followme: 0.2 };
  for (const k in per) { const P = partsOf(k); need(v, k, Math.ceil(stands.length * per[k]) + 4, P.all, H.solidMat(), A); }
  const cat = partsOf('catering'), belt = partsOf('belt');
  need(v, 'catering.body', stands.length + 2, cat.still, H.solidMat(), A); for (const q of cat.moving) need(v, 'catering.' + q.kind, stands.length + 2, q.geom, H.solidMat(), A);
  need(v, 'belt.body', stands.length * 2 + 2, belt.still, H.solidMat(), A); need(v, 'belt.belt', stands.length * 2 + 2, belt.moving[0].geom, H.solidMat(), A);
  const contact = stands.filter(s => s.contact).length;
  for (const k of ['jbRot', 'jbTunnel', 'jbCab', 'jbLeg']) need(v, k, (k === 'jbTunnel' ? 2 : 1) * contact + 2, partsOf(k, true).all, H.solidMat(), A);
  const fires = b.parts.filter(p => p.kind === 'fire' && p.built);
  need(v, 'firetruck', fires.length * 3 + 2, partsOf('firetruck').all, H.solidMat(), A);
  for (const p of fires) {
    const long = p.w >= p.h, ds = p.doorSide || 1;
    for (let i = 0; i < 3; i++) { const q = long ? IC.rectWorld(p, (i - 1) * p.w * 0.28, ds * (p.h / 2 + 0.1)) : IC.rectWorld(p, ds * (p.w / 2 + 0.1), (i - 1) * p.h * 0.28); A.fire.push({ x: q.x, y: q.y, h: Math.atan2(q.y - p.y, q.x - p.x), i }); }
  }
  // the jet bridges: a rotunda by the terminal at each contact stand
  for (const s of stands) if (s.contact) {
    const f2 = { x: Math.cos(s.a), y: Math.sin(s.a) }, port = { x: Math.sin(s.a), y: -Math.cos(s.a) };
    const door = { x: s.x + f2.x * 0.13 + port.x * 0.02, y: s.y + f2.y * 0.13 + port.y * 0.02 };
    // (the rotunda where the map has it: on the wall, or at the end of its fixed link)
    const B = s.bridge, k = B ? { x: B.wx, y: B.wy } : kerb(b, ['terminal', 'concourse'], door); if (!k) continue;
    const out = U.dist(k, door) > 1e-4 ? { x: (door.x - k.x) / U.dist(k, door), y: (door.y - k.y) / U.dist(k, door) } : f2;
    A.stands.push({ s, rot: B ? { x: B.rx, y: B.ry } : { x: k.x + out.x * 0.04, y: k.y + out.y * 0.04 }, out, wall: k });
  }
  v.life.apts.push(A);
  return A;
};
L3.dropAirport = function (v, A) { v.life.apts = v.life.apts.filter(x => x !== A); if (A.L) A.L.geometry.dispose(); for (const [k, n] of A.wants) v.life.want.set(k, Math.max(0, (v.life.want.get(k) || 0) - n)); for (const q of [...v.life.plans.keys()]) if (q.ap === A.b.id) v.life.plans.delete(q); };

/* ---------- every frame ---------- */
L3.frame = function (v, t, dt) {
  const life = v.life; if (!life) return;
  const t0 = performance.now();
  const cam = v.camera, S = v.S;
  for (const m of life.glow) if (m.uniforms) { if (m.uniforms.uTime) m.uniforms.uTime.value = life.clock; if (m.uniforms.uFocal) m.uniforms.uFocal.value = v.focalPx || 1000; if (m.uniforms.uFar) m.uniforms.uFar.value = v.scene.fog ? v.scene.fog.far * 1.3 : 900; }
  if (life.smoke.material.uniforms) { life.smoke.material.uniforms.uFocal.value = v.focalPx || 1000; life.smoke.material.uniforms.uFar.value = v.scene.fog ? v.scene.fog.far * 1.2 : 1400; }
  const vis = IC.sky ? IC.sky(S).vis : 10, lowVis = vis < 5, nightK = Math.max(life.nightK, lowVis ? 0.8 : 0);
  const stats = life.stats; stats.bridges = 0; stats.docked = 0; stats.vehicles = 0; stats.bars = 0; stats.barsClear = 0; if (!stats.kinds) stats.kinds = {}; for (const k in stats.kinds) stats.kinds[k] = 0;
  life.fN++; life.clock += Math.min(0.1, dt || 0); life.dtR = Math.min(0.1, dt || 0);
  for (const A of life.apts) airportFrame(v, A, t, nightK, cam, stats);
  // flush what this frame drew
  for (const p of life.pools.values()) { p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; if (p.color && p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; p.n = 0; }
  stats.particles = life.smoke.userData.n + life.glowP.userData.n; stats.lights = life.apts.reduce((n, A) => n + A.end, 0);
  partFlush(life.smoke); partFlush(life.glowP);
  lightsDone(life.dyn); life.dyn.userData.n = 0;
  // what the life of the scene costs a frame, in ms of script (the movers' part and the airports' part)
  const ms = performance.now() - t0; life.ms = life.ms == null ? ms : life.ms * 0.95 + ms * 0.05; life.updMs = life.updMs == null ? life.updAcc : life.updMs * 0.95 + life.updAcc * 0.05; life.updAcc = 0;
  stats.ms = +(life.ms + life.updMs).toFixed(3);
};
const PC = {};
function airportFrame(v, A, t, nightK, cam, stats) {
  const b = A.b, S = v.S, L = A.L, on = L.geometry.attributes.lon, col = L.geometry.attributes.lcol, cx = v.cx, cy = v.cy;
  const dCam = Math.hypot(cam.position.x - (b.x - cx), cam.position.z - (b.y - cy));
  // the night: runway, taxiway, apron and beacon lights come on together (in fog by day too)
  const nk = Math.round(nightK * 20) / 20;
  if (A.nk !== nk) { A.nk = nk; for (let i = 0; i < A.end; i++) if (i < A.barN0 || i >= A.barN1) on.array[i] = nk; on.needsUpdate = true; for (const pp of A.papis) pp.col = -2; for (const bar of A.bars) bar.on = -1; }
  // stop bars: red until an aircraft is cleared across, then the green lead-on (day and night)
  for (const bar of A.bars) {
    const clear = IC.recBarClear(S, b.id, bar.key, t) ? 1 : 0; stats.bars++; stats.barsClear += clear;
    if (clear === bar.on) continue;
    bar.on = clear; const k = Math.max(0.75, nk);
    for (let i = bar.i0; i < bar.i1; i++) on.array[i] = (i < bar.i0 + 7) ? (clear ? 0 : k) : (clear ? k : 0);
    on.needsUpdate = true;
  }
  // PAPI: white above each box's angle, red below, seen from the approach (hidden from behind and from the side)
  for (const pp of A.papis) {
    const px = cam.position.x - (pp.x - cx), pz = cam.position.z - (pp.y - cy), along = -(px * pp.dx + pz * pp.dy), side = Math.abs(px * pp.dy - pz * pp.dx);
    const e = Math.atan2(cam.position.y - A.y0, Math.max(1e-3, along)) * 57.3, seen = along > 0.5 && side < along * 0.35;
    const code = seen ? (e > 3.5 ? 4 : e > 3.17 ? 3 : e > 2.83 ? 2 : e > 2.5 ? 1 : 0) : -1;
    if (code === pp.col) continue;
    pp.col = code;
    pp.idx.forEach((i, k) => { const white = code > k, c = hexRGB(white ? LC.white : LC.bar); col.array[i * 3] = c[0]; col.array[i * 3 + 1] = c[1]; col.array[i * 3 + 2] = c[2]; on.array[i] = code < 0 ? 0 : 1; });
    col.needsUpdate = true; on.needsUpdate = true;
  }
  // windsocks: they stream away from where the wind comes from, filling as it blows harder
  const W = IC.recWind ? IC.recWind(S, t) : S.wind || { dir: 0, kt: 0 }, droop = (1 - U.clamp(W.kt / 15, 0, 1)) * 1.2;
  for (const s of A.socks) if (s.node) { s.node.rotation.set(0, -(W.dir + Math.PI) + Math.sin(t * 1.7 + s.x) * 0.06 * U.clamp(W.kt / 10, 0.2, 1), -droop + Math.sin(t * 3.1 + s.y) * 0.03, 'YZX'); }
  if (dCam > CFG.reach * 3) return;
  const near = dCam < CFG.reach && cam.position.y - A.y0 < 60;
  // floodlit aprons at night: a pool of light under each mast
  if (near && nightK > 0.3) for (const q of A.floods) { const x = q.x + (q.into.x - q.x) * 0.55, y = q.y + (q.into.y - q.y) * 0.55; pool(v, x - cx, A.y0 + 0.0035, y - cy, 0, 1.1, 1.1, 0.16 * nightK, 0.86, 0.66); }
  // the turnarounds going on now: their bridges, and close in their vehicles
  const R = S.rec; A.frame = (A.frame || 0) + 1;
  if (R) for (const q of R.turns) {
    if (q.ap !== b.id || q.t0 > t + 1 || (q.t1 != null && q.t1 < t - 600)) continue;
    turnFrame(v, A, q, t, stats, near && Math.hypot(q.x - cx - cam.position.x, q.y - cy - cam.position.z) < CFG.vehReach);
  }
  // bridges at contact stands with nothing on them wait folded back
  for (const J of A.stands) if (J.used !== A.frame) bridge(v, A, J, null, 0, t, stats);
  if (near) fireFrame(v, A, t, stats);
}
/* the turnaround's vehicles and bridge at time t */
function turnFrame(v, A, q, t, stats, near) {
  const tEnd = q.t1 != null ? q.t1 : q.t0 + q.dur, D = Math.max(600, q.dur), t0 = q.t0;
  if (t > tEnd + 400 || t < t0 - 200) return;
  const P = planOf(v, A, q);
  if (q.kind === 'bridge' && P.J && t >= t0 && t < tEnd) {
    const k = ramp(t - t0, 25, 85) * (1 - ramp(t, tEnd - 170, tEnd - 100));
    P.J.used = A.frame; bridge(v, A, P.J, q, k, t, stats);
  }
  if (!near) return;
  const on = (key, path, ta, td, extra, lag) => drive(v, A, key, path, ta, td, t, stats, extra, lag);
  if (q.kind === 'bus' || q.kind === 'walk') { on('stairs', P.stairsF, t0 + 25, tEnd - 90); if (q.len > 0.3) on('stairs', P.stairsR, t0 + 45, tEnd - 110); }
  if (q.kind !== 'bridge') on('gpu', P.gpu, t0 + 40, tEnd - 60);
  if (q.kind === 'cargo') {
    for (let i = 0; i < Math.min(4, q.n || 2); i++) for (let c = 0; c < 3; c++) { const ta = t0 + 120 + i * 90 + c * D * 0.28; on('lorry', i % 2 ? P.holdA : P.holdF, ta, ta + D * 0.18); }
  } else {
    on('belt', P.beltA, t0 + 60, tEnd - 240, 'belt'); if (q.len > 0.5) on('belt', P.beltF, t0 + 70, tEnd - 250, 'belt');
    // the baggage train: off the aircraft, then back with the departing bags
    for (let j = 0; j < 2; j++) { const ta = j ? t0 + D * 0.55 : t0 + 90, td = j ? tEnd - 300 : t0 + D * 0.25; on('bagtractor', P.bag, ta, td); for (let i = 1; i <= 3; i++) on('bagcart', P.bag, ta, td, null, i); }
    const ct = t0 + D * 0.3; on('catering', P.cater, ct, ct + D * 0.2, 'catering');
    if (q.kind === 'bus') for (let i = 0; i < Math.min(3, q.n || 1); i++) { on('apbus', P.bus[i % 2], t0 + 50 + i * 25, t0 + 240 + i * 40); on('apbus', P.bus[i % 2], t0 + D * 0.62 + i * 30, tEnd - 400 + i * 60); }
  }
  on(q.fuel === 'hydrant' ? 'dispenser' : 'refueller', P.fuel, t0 + D * 0.45, t0 + D * 0.8);
  // the pushback tug comes to the nose and waits there (the aircraft's own track takes it from the pushback)
  if (q.t1 == null || t < q.t1) on('tug', P.tug, tEnd - 420, q.t1 == null ? 1e18 : q.t1);
}
/* a vehicle on its path: drives in to arrive at ta, stands until td, drives back out; hidden before and after */
function drive(v, A, key, path, ta, td, t, stats, extra, lag) {
  if (!path) return;
  const Lg = path.len, dT = Lg / CFG.drive, off = (lag || 0) * 0.036;
  if (t < ta - dT || t > td + dT) return;
  let d, rev = false;
  if (t < ta) d = (t - (ta - dT)) * CFG.drive; else if (t <= td) d = Lg; else { d = Lg - (t - td) * CFG.drive; rev = true; }
  d = Math.max(0, d - off);
  const p = along(path, d, PC);
  const y = A.y0 + H.LIFT.rw;
  const h = rev ? p.h + Math.PI : p.h;
  stats.vehicles++; stats.kinds[key] = (stats.kinds[key] || 0) + 1;
  if (extra === 'catering') {
    const lift = t < ta || t > td ? 0 : Math.min(ramp(t - ta, 10, 50), 1 - ramp(t, td - 50, td - 10));
    inst(v, 'catering.body', p.x - v.cx, y, p.y - v.cy, h);
    const cat = partsOf('catering');
    for (const q of cat.moving) if (q.kind === 'lift') instPart(v, 'catering.lift', q, p.x - v.cx, y, p.y - v.cy, h, 0, lift * q.up * M); else instPart(v, 'catering.scissor', q, p.x - v.cx, y, p.y - v.cy, h, 0, 0, 1 + lift * 2.4);
    return;
  }
  if (extra === 'belt') {
    const up = t < ta || t > td ? 0 : ramp(t - ta, 5, 20) * (1 - ramp(t, td - 20, td - 5));
    inst(v, 'belt.body', p.x - v.cx, y, p.y - v.cy, h); const q = partsOf('belt').moving[0]; instPart(v, 'belt.belt', q, p.x - v.cx, y, p.y - v.cy, h, up * q.up); return;
  }
  inst(v, key, p.x - v.cx, y, p.y - v.cy, h);
  // an amber beacon on top that turns while it drives
  if (t < ta || t > td) { const dl = v.life.dyn; if (dl.userData.n < CFG.dynN) putLight(dl, p.x - v.cx, y + 0.028, p.y - v.cy, '#ffae2a', 0.03, [0.8, (ta % 7) / 7, 0.35], 1); }
}
/* where along a path (distance d): x, y and heading */
function along(path, d, out) {
  const pts = path.pts, cum = path.cum;
  let i = 1; while (i < pts.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1e-6, k = U.clamp((d - cum[i - 1]) / seg, 0, 1);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.h = Math.atan2(b.y - a.y, b.x - a.x);
  return out;
}
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + U.dist(pts[i - 1], pts[i])); return { pts, cum, len: cum[cum.length - 1] }; }
/* how a turnaround is served: the doors and hatches of its aircraft, where each vehicle stands, and the way it comes
   there from its depot (a terminal, the fuel farm, the cargo shed): along the service lane in front of the stands */
function planOf(v, A, q) {
  let P = v.life.plans.get(q); if (P) return P;
  const b = A.b, a = q.a, f = { x: Math.cos(a), y: Math.sin(a) }, r = { x: -Math.sin(a), y: Math.cos(a) }, Ln = q.len, hw = Math.max(0.018, q.span * 0.055);
  const at = (fx, rx) => ({ x: q.x + f.x * fx + r.x * rx, y: q.y + f.y * fx + r.y * rx });
  const lane0 = at(Ln / 2 + 0.16, 0);
  const depot = kinds => kerb(b, kinds, lane0) || at(Ln / 2 + 0.16, 3);
  const term = depot(['terminal', 'concourse']), fuel = depot(['fuel', 'hydrant', 'terminal']), cargo = depot(['cargo', 'terminal']);
  // spot: where the vehicle stops, and which way it faces then (a unit vector)
  const route = (from, spot, face, back) => {
    const lp = { x: lane0.x + r.x * ((from.x - lane0.x) * r.x + (from.y - lane0.y) * r.y), y: lane0.y + r.y * ((from.x - lane0.x) * r.x + (from.y - lane0.y) * r.y) };
    const la = { x: lane0.x + r.x * U.clamp((spot.x - lane0.x) * r.x + (spot.y - lane0.y) * r.y, -2, 2), y: lane0.y + r.y * U.clamp((spot.x - lane0.x) * r.x + (spot.y - lane0.y) * r.y, -2, 2) };
    const app = { x: spot.x - face.x * (back || 0.12), y: spot.y - face.y * (back || 0.12) };
    return mkPath([from, lp, la, app, spot]);
  };
  const toF = { x: -r.x, y: -r.y };   // from the starboard side towards the fuselage
  P = {
    stairsF: route(term, at(Ln * 0.33, -hw - 0.042), r), stairsR: route(term, at(-Ln * 0.36, -hw - 0.042), r),
    gpu: route(term, at(Ln / 2 - 0.05, 0.03), { x: -f.x, y: -f.y }),
    beltA: route(term, at(-Ln * 0.2, hw + 0.043), toF), beltF: route(term, at(Ln * 0.2, hw + 0.043), toF),
    bag: route(term, at(-Ln * 0.08, hw + 0.075), { x: -f.x, y: -f.y }, 0.2),
    cater: route(term, at(-Ln * 0.38, hw + 0.05), toF),
    fuel: route(fuel, at(-0.02, q.span * 0.2), f),
    holdA: route(cargo, at(-Ln * 0.25, hw + 0.06), toF), holdF: route(cargo, at(Ln * 0.2, hw + 0.06), toF),
    bus: [route(term, at(Ln * 0.28, -hw - 0.13), f, 0.25), route(term, at(-Ln * 0.2, -hw - 0.13), f, 0.25)],
    tug: route(term, at(Ln / 2 + 0.042, 0), { x: -f.x, y: -f.y }, 0.1),
    J: A.stands.find(J => J.s.id === q.sid) || null
  };
  v.life.plans.set(q, P);
  return P;
}
/* a jet bridge: the rotunda by the terminal, the tunnel stretched to the cab, the cab at the door (k 1) or folded
   back along the terminal (k 0), a wheeled leg under the tunnel */
const SILL = { narrow: 3.4, wide: 5.0, jumbo: 5.2, widel: 5.0, rj: 2.6, cargo: 5.0, state: 5.0, outsize: 5.0 };
function bridge(v, A, J, q, k, t, stats) {
  const s = J.s, a = s.a, f = { x: Math.cos(a), y: Math.sin(a) }, port = { x: Math.sin(a), y: -Math.cos(a) };
  const Ln = q ? q.len : 0.38, hw = q ? Math.max(0.018, q.span * 0.055) : 0.02;
  const door = { x: s.x + f.x * Ln * 0.33 + port.x * (hw + 0.018), y: s.y + f.y * Ln * 0.33 + port.y * (hw + 0.018) };
  const R = J.rot, full = U.dist(R, door), dir0 = Math.atan2(door.y - R.y, door.x - R.x);
  // folded: turned back towards the terminal and drawn in
  const park = dir0 + (Math.atan2(J.out.y, J.out.x) - dir0 > 0 ? -0.5 : 0.5), len = Math.max(0.08, full * (0.55 + 0.45 * k)), dir = park + (dir0 - park) * k;
  const cab = { x: R.x + Math.cos(dir) * len, y: R.y + Math.sin(dir) * len };
  const y = A.y0, drop = ((q ? SILL[q.type] || 3.4 : 4.2) - 3.65) * M * k, pitch = Math.atan2(drop, Math.max(0.05, len));
  inst(v, 'jbRot', R.x - v.cx, y, R.y - v.cy, dir);
  // the fixed link from the wall, where the rotunda stands out from it
  if (J.wall && U.dist(J.wall, R) > 0.05) { const W = J.wall, la = Math.atan2(R.y - W.y, R.x - W.x); inst(v, 'jbTunnel', W.x - v.cx, y, W.y - v.cy, la, 0, 0, U.dist(W, R) * 100, 1, 1); }
  inst(v, 'jbTunnel', R.x + Math.cos(dir) * 0.02 - v.cx, y, R.y + Math.sin(dir) * 0.02 - v.cy, dir, pitch, 0, (len - 0.036) * 100, 1, 1);
  inst(v, 'jbCab', cab.x - v.cx, y + drop, cab.y - v.cy, dir + (k > 0.9 ? (a - Math.PI / 2 - dir) * 0 : 0));
  const lg = { x: R.x + Math.cos(dir) * len * 0.72, y: R.y + Math.sin(dir) * len * 0.72 };
  inst(v, 'jbLeg', lg.x - v.cx, y, lg.y - v.cy, dir, 0, 0, 1, 1 + drop * 0.72 / 0.038, 1);
  stats.bridges++; if (k > 0.98) stats.docked++;
}
/* fire tenders: at their station; out to a crash on the airport, spraying; standing by beside the runways in an air
   raid alert, their beacons turning */
function fireFrame(v, A, t, stats) {
  if (!A.fire.length) return;
  const S = v.S, b = A.b;
  if (!A.crashCheck || t - A.crashCheck > 2 || t < A.crashCheck) {
    A.crashCheck = t; const list = v.kind === 'replay' ? v.evs || [] : v.liveEvs || [];
    A.crashes = list.filter(e => e.kind === 'crash' && U.dxy(e.x, e.y, b.x, b.y) < (b.radius || 60));
    const c = IC.cities ? IC.cities(S).find(c => c.owner === 'us' && U.dxy(c.x, c.y, b.x, b.y) < 600 && c.alert > 0) : null;
    if (c && A.alertT == null) A.alertT = t; else if (!c) A.alertT = null;
  }
  const rw = b.parts.find(p => p.kind === 'runway' && p.built);
  for (const F of A.fire) {
    const cr = A.crashes.find(e => t >= e.t && t < e.t + 1200);
    let to = null, since = 0;
    if (cr) { const a = F.i / 3 * Math.PI * 2; to = { x: cr.x + Math.cos(a) * 0.35, y: cr.y + Math.sin(a) * 0.35 }; since = t - cr.t; }
    else if (A.alertT != null && rw) { const m = IC.rwAt(rw, 0.3 + F.i * 0.2), d = IC.rwDir(rw); to = { x: m.x - d.y * (rw.w / 2 + 0.9), y: m.y + d.x * (rw.w / 2 + 0.9) }; since = t - A.alertT; }
    let x = F.x, y = F.y, h = F.h, moving = false;
    if (to) { const L = U.dist(F, to), k = U.clamp(since * 0.2 / Math.max(0.1, L), 0, 1); x = F.x + (to.x - F.x) * k; y = F.y + (to.y - F.y) * k; h = Math.atan2(to.y - F.y, to.x - F.x); moving = k < 1; }
    inst(v, 'firetruck', x - v.cx, A.y0 + H.LIFT.rw, y - v.cy, h); stats.vehicles++; stats.kinds.firetruck = (stats.kinds.firetruck || 0) + 1;
    if (to) { const dl = v.life.dyn; for (const sg of [1, -1]) putLight(dl, x - v.cx - Math.sin(h) * sg * 0.011 + Math.cos(h) * 0.044, A.y0 + 0.031, y - v.cy + Math.cos(h) * sg * 0.011 + Math.sin(h) * 0.044, '#3a7aff', 0.03, [0.6, sg > 0 ? 0 : 0.5, 0.3], 1); }
    // water from the roof monitor onto the fire
    if (cr && !moving && since < 900 && v.lod < 2) for (let i = 0; i < 18; i++) { const a = (t * 1.5 + i / 18) % 1, dx = cr.x - x, dy = cr.y - y, L = Math.hypot(dx, dy) || 1; emit(v.life.smoke, x + dx * a - v.cx, A.y0 + 0.035 + Math.sin(a * Math.PI) * 0.06, y + dy * a - v.cy, 0.01 + a * 0.03, 0.9, 0.93, 0.96, 0.45 * (1 - a * 0.6)); }
  }
}
})(window.IC);
