/* Iron Canopy — war in the 3D view (briefs 59 and 63): the flame, smoke, fire and wreckage of a fight, and the film
   cameras. Loaded with the 3D view; replay3d.js calls it through a few hooks (IC.war3d) and lends it its helpers (IC.R3D).

   Effects, all worked out from the record at the view's time t, so a scrub back and forth shows the same thing, and
   all of them at their source:
   - a missile's motor: a flame mesh fixed to the nozzle along the round's axis, white at the root with shock diamonds,
     orange at the edges, flickering; from far away a short bright streak, never a ball. Its smoke starts at the
     nozzle (the trail runs on to where the round is now, not to the last recorded point) and, in the first second
     and a half, at the canister's mouth with the round;
   - a launch at the launcher: a flash at the mouth and at the back of the canister, the gas thrown out of the back
     and along the ground, a white cloud that rolls out round the vehicle lit by the flame, a ring of dust;
   - a ballistic missile's boost (a long flame along its axis and a fat column of smoke) and its re-entry (a glowing
     nose and an incandescent streak); a cruise missile's turbojet, a faint short flame;
   - a warhead in the air, where the weapon it killed was at that moment and carried on with its speed: a star of
     light, a lumpy fireball stretched along the way it flew, fragments as bright streaks, pieces of the wreck that
     tumble down trailing smoke, black smoke that hangs and drifts;
   - a hit on the ground: the star, a short fireball (rolling and rising for fuel), the shock ring racing out along
     the ground, fingers of earth and dust thrown up and falling back, sparks, chunks that land and lie, a scorch
     mark, then fires at the base and a column of smoke from the ground that climbs, spreads and leans downwind.
   Three particle buffers (smoke, normally blended and lit; fire and stars, added and blooming), one buffer of
   streaks, one instanced mesh of chunks and small pools of rings and scorch marks are filled again every frame;
   nothing is made from frame to frame (a missile's flame mesh is made with its mover).

   Film cameras (IC.replayShot(v, spec)): planted beside a flight path (a flyby), on the ground with a long lens, at
   the launcher, chasing, alongside, from the seeker, orbiting, dollying; each with a lens in mm, a handheld sway and
   the shake of an explosion close by. */
(function (IC) {
'use strict';
const U = IC.U;
const W3 = IC.war3d = {};
const CFG = IC.WAR3D = {
  smokeN: 32000, fireN: 9000, starN: 400, sparkN: 3000, chunkN: 800, rings: 12, scorch: 48,
  trailLife: 100,         // s a motor's smoke hangs
  colLife: 900,           // s a fire on the ground keeps burning and smoking
  colPuff: 240,           // s one puff of a smoke column lives
  reach: 1400,            // particles farther than this from the camera (140 km) are not made
  streakPx: 14            // a flame shorter than this on screen is drawn this long and thin: a streak
};
let T = null, H = null, KM = 10;
const hash = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const G = 0.098;          // 9.8 m/s² in world units

const VS = `
attribute vec4 pcol; attribute float psz; attribute float prot;
uniform float uFocal, uMaxPx, uFar;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1e-4, -mv.z), px = psz * uFocal / d;
  vCol = pcol; vCol.a *= clamp(px / 2.0, 0.12, 1.0);
  // a puff the camera is inside, or nearly, fades out rather than filling the frame
  vCol.a *= smoothstep(0.7, 3.0, d / max(psz, 1e-4));
  vFog = clamp(d / uFar, 0.0, 1.0); vRot = prot;
  gl_PointSize = clamp(px, 1.0, uMaxPx);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
// each particle reads its own patch of a noise texture, turned by its own angle: lumps, not balls
const LUMP = `
  vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), k = cos(vRot);
  vec2 q = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
  float r = length(c) * 2.0;
  float n = texture2D(uNoise, q * 0.55 + fract(vec2(vRot * 0.618, vRot * 0.377))).r;`;
// smoke: lit from above, the lumps catching the light, sinking into the haze with distance
const SMOKE_FS = `
uniform sampler2D uNoise; uniform vec3 uFog;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  ${LUMP}
  float den = clamp((1.0 - r * r) * (0.2 + 1.35 * n) - 0.1, 0.0, 1.0);
  float a = vCol.a * den;
  if (a < 0.004) discard;
  float lit = 0.72 + 0.34 * (0.5 - c.y) * (0.5 + n) + 0.14 * den;
  vec3 col = mix(vCol.rgb * lit, uFog, vFog * vFog * 0.85);
  gl_FragColor = vec4(col, a * (1.0 - vFog * vFog * vFog * vFog));
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
// fire: lumpy flame that burns white in its hottest lumps (above 1: it blooms)
const FIRE_FS = `
uniform sampler2D uNoise; uniform float uGain;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  ${LUMP}
  float den = clamp((1.0 - r) * (0.3 + 1.3 * n), 0.0, 1.0);
  float a = vCol.a * pow(den, 1.3) * (1.0 - vFog * vFog);
  if (a < 0.004) discard;
  vec3 col = vCol.rgb * (1.0 + 1.4 * pow(max(0.0, 1.0 - r * 1.5), 2.0) * n) * uGain;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
// a star: a hot point with rays, for a flash, a nozzle seen end on, a glowing nose
const STAR_FS = `
uniform sampler2D uTex; uniform float uGain;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), k = cos(vRot);
  float d = texture2D(uTex, vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5).r;
  float a = vCol.a * d * (1.0 - vFog * vFog);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * (1.0 + 2.0 * d * d) * uGain * a, a);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
// the flame mesh: u runs from the nozzle (0) to the tail (1); brighter where the eye looks through more of it
const PVS = `
varying float vU; varying float vF;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vU = uv.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PFS = `
uniform float uTime, uHot, uDia, uA; uniform vec3 uCore, uEdge;
varying float vU; varying float vF;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float u = vU, core = pow(vF, 1.4);
  // shock diamonds: bright knots close behind the nozzle
  float dia = uDia > 0.0 ? pow(0.5 + 0.5 * cos(u * uDia * 6.2832), 4.0) * (1.0 - smoothstep(0.04, 0.3, u)) : 0.0;
  // it flickers as a whole and the tail wavers; no ripples along it
  float fl = 0.88 + 0.08 * sin(uTime * 97.0) + 0.06 * sin(uTime * 61.0 + u * 3.0) * u;
  vec3 col = mix(uEdge, uCore, clamp(core * (1.3 - u * 1.9) + dia * 0.5, 0.0, 1.0));
  float a = uA * pow(1.0 - u, 1.6) * (0.2 + 0.8 * core) * fl * (1.0 + 0.5 * dia);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * uHot * (1.0 + dia) * min(a, 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
const fsrc = src => src.replace('#include <OUT_CS>', (+T.REVISION || 128) >= 152 ? '#include <colorspace_fragment>' : '#include <encodings_fragment>');

/* ---------- textures, painted once ---------- */
const canvas = N => { const cv = document.createElement('canvas'); cv.width = cv.height = N; return cv; };
const texOf = (cv, wrap) => { const t = new T.CanvasTexture(cv); if (wrap) t.wrapS = t.wrapT = T.RepeatWrapping; t.needsUpdate = true; return t; };
/* noise that tiles: four octaves of smoothed value noise */
function noiseTex() {
  return H.share('war:noise', () => {
    const N = 128, cv = canvas(N), g = cv.getContext('2d'), img = g.createImageData(N, N), rnd = H.seeded(57);
    if (img && img.data) {
      const val = new Float32Array(N * N);
      for (const [cells, amp] of [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]]) {
        const L = new Float32Array(cells * cells); for (let i = 0; i < L.length; i++) L[i] = rnd();
        const at = (i, j) => L[(j % cells) * cells + (i % cells)];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx = x / N * cells, fy = y / N * cells, i = Math.floor(fx), j = Math.floor(fy), u = ease(fx - i), w = ease(fy - j);
          val[y * N + x] += amp * ((at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w);
        }
      }
      for (let i = 0; i < N * N; i++) { const c = U.clamp((val[i] - 0.25) * 2, 0, 1) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = c; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    return texOf(cv, true);
  });
}
/* the star: a core and four long rays, two fainter ones between */
function starTex() {
  return H.share('war:star', () => {
    const N = 128, cv = canvas(N), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * 0.22);
    core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.25, 'rgba(255,255,255,0.55)'); core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core; g.fillRect(0, 0, N, N);
    for (const [a, w, k] of [[0, 2.4, 0.9], [Math.PI / 2, 2.4, 0.9], [Math.PI / 4, 1.4, 0.4], [-Math.PI / 4, 1.4, 0.4]]) {
      g.save(); g.translate(N / 2, N / 2); g.rotate(a);
      const ray = g.createLinearGradient(-N / 2, 0, N / 2, 0);
      ray.addColorStop(0, 'rgba(255,255,255,0)'); ray.addColorStop(0.5, `rgba(255,255,255,${k})`); ray.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = ray; g.fillRect(-N / 2, -w / 2, N, w); g.restore();
    }
    return texOf(cv);
  });
}
/* the shock ring: a thin bright edge, soft inside */
function ringTex() {
  return H.share('war:ring', () => {
    const N = 128, cv = canvas(N), g = cv.getContext('2d'), r = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.62, 'rgba(255,255,255,0.08)'); r.addColorStop(0.88, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, N, N);
    return texOf(cv);
  });
}
/* a scorch mark: a dark blotch, ragged at the edge */
function scorchTex() {
  return H.share('war:scorch', () => {
    const N = 128, cv = canvas(N), g = cv.getContext('2d'), rnd = H.seeded(313);
    for (let i = 0; i < 46; i++) {
      const a = rnd() * 6.283, d = Math.pow(rnd(), 0.7) * N * 0.3, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, r = N * (0.05 + rnd() * 0.14);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    return texOf(cv);
  });
}

/* ---------- what is filled every frame ---------- */
function partSet(v, n, kind) {
  const g = new T.BufferGeometry(), add = kind !== 'smoke';
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('pcol', new T.BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('psz', new T.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('prot', new T.BufferAttribute(new Float32Array(n), 1));
  g.setDrawRange(0, 0);
  const m = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fsrc(kind === 'smoke' ? SMOKE_FS : kind === 'fire' ? FIRE_FS : STAR_FS), transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { uFocal: { value: 1000 }, uMaxPx: { value: 900 }, uFar: { value: 1400 }, uNoise: { value: noiseTex() }, uTex: { value: starTex() }, uFog: { value: new T.Color('#888') }, uGain: { value: 1 } } });
  bloom(m, 3);
  const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = add ? 10 : 9;
  p.userData = { n: 0, cap: n };
  if (add && p.layers && IC.LIFE3D) p.layers.enable(IC.LIFE3D.bloomLayer);
  return p;
}
const bloom = (m, k) => { if (H.glow && m.blending === T.AdditiveBlending) { m.userData.bloom = true; H.glow(m, k); } return m; };
let CP = null, FAR2 = 1e12;   // the camera's place this frame and how far particles are made
function emit(P, x, y, z, sz, r, g, b, a, rot) {
  const d = P.userData; if (d.n >= d.cap || a < 0.004) return;
  if (CP) { const dx = x - CP.x, dy = y - CP.y, dz = z - CP.z; if (dx * dx + dy * dy + dz * dz > FAR2) return; }
  const i = d.n++, A = P.geometry.attributes;
  A.position.array[i * 3] = x; A.position.array[i * 3 + 1] = y; A.position.array[i * 3 + 2] = z;
  A.pcol.array[i * 4] = r; A.pcol.array[i * 4 + 1] = g; A.pcol.array[i * 4 + 2] = b; A.pcol.array[i * 4 + 3] = Math.min(1, a);
  A.psz.array[i] = sz; A.prot.array[i] = rot || 0;
}
function flush(P) { const A = P.geometry.attributes; P.geometry.setDrawRange(0, P.userData.n); for (const k in A) A[k].needsUpdate = true; P.userData.n = 0; }
/* streaks: line segments, bright at the head and fading to the tail */
function lineSet(n) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 6), 3));
  g.setDrawRange(0, 0);
  const L = new T.LineSegments(g, bloom(new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }), 4));
  L.frustumCulled = false; L.renderOrder = 11; L.userData = { n: 0, cap: n };
  if (L.layers && IC.LIFE3D) L.layers.enable(IC.LIFE3D.bloomLayer);
  return L;
}
function streak(L, x1, y1, z1, x2, y2, z2, r, g, b, a) {
  const d = L.userData; if (d.n >= d.cap || a < 0.01) return;
  if (CP) { const dx = x1 - CP.x, dy = y1 - CP.y, dz = z1 - CP.z; if (dx * dx + dy * dy + dz * dz > FAR2) return; }
  const i = d.n++, A = L.geometry.attributes, p = A.position.array, c = A.color.array;
  p[i * 6] = x1; p[i * 6 + 1] = y1; p[i * 6 + 2] = z1; p[i * 6 + 3] = x2; p[i * 6 + 4] = y2; p[i * 6 + 5] = z2;
  c[i * 6] = r * a; c[i * 6 + 1] = g * a; c[i * 6 + 2] = b * a; c[i * 6 + 3] = r * a * 0.12; c[i * 6 + 4] = g * a * 0.08; c[i * 6 + 5] = b * a * 0.05;
}
function flushLines(L) { const A = L.geometry.attributes; L.geometry.setDrawRange(0, L.userData.n * 2); A.position.needsUpdate = A.color.needsUpdate = true; L.userData.n = 0; }
/* a chunk of wreck or earth: an irregular stone, flat-shaded */
function chunkGeom() {
  return H.share('war:chunk', () => {
    const v = [[1.1, 0.1, 0], [-0.9, -0.1, 0.1], [0.1, 0.7, 0.1], [-0.1, -0.8, 0], [0, 0.1, 0.6], [0.1, 0, -0.75]];
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    const pos = new Float32Array(F.length * 9), nor = new Float32Array(F.length * 9);
    F.forEach((f, i) => {
      const [a, b, c] = f.map(k => v[k]), ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach((p, j) => { pos.set(p, i * 9 + j * 3); nor.set([nx, ny, nz], i * 9 + j * 3); });
    });
    return H.geom(pos, nor);
  });
}
function chunk(w, x, y, z, s, spin, seed) {
  const C = w.chunks; if (w.ci >= CFG.chunkN) return;
  if (CP) { const dx = x - CP.x, dy = y - CP.y, dz = z - CP.z; if (dx * dx + dy * dy + dz * dz > 400) return; }   // 2 km: smaller than a pixel beyond
  w.cv.set(x, y, z); w.ca.set(hash(seed) - 0.5, hash(seed + 1) - 0.5, hash(seed + 2) - 0.5).normalize(); w.cq.setFromAxisAngle(w.ca, spin);
  w.cs.set(s * (0.7 + 0.6 * hash(seed + 3)), s * (0.5 + 0.5 * hash(seed + 4)), s * (0.6 + 0.6 * hash(seed + 5)));
  w.cm.compose(w.cv, w.cq, w.cs); C.setMatrixAt(w.ci++, w.cm);
}
/* a flat thing on the ground from a pool: a shock ring or a scorch mark */
function flat(pool, i, x, y, z, r, rot, op) {
  const M = pool[i]; if (!M) return;
  M.visible = true; M.position.set(x, y, z); M.scale.set(r * 2, 1, r * 2); M.rotation.set(0, rot || 0, 0);
  if (op != null) M.material.opacity = op;
}

/* ---------- the flame mesh ---------- */
function plumeGeom() {
  return H.share('war:plume', () => {
    const NU = 22, NA = 14, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = Math.pow(i / NU, 1.4);
      // out of the nozzle it swells a little, then narrows to the tail
      const r = u < 0.12 ? 1 + 2.4 * u : 1.29 * Math.pow(1 - (u - 0.12) / 0.88, 0.75) + 0.04;
      for (let j = 0; j <= NA; j++) { const a = j / NA * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(-u, r * c, r * s); nor.push(0, c, s); uv.push(u, j / NA); }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return H.geom(new Float32Array(pos), new Float32Array(nor), null, new Float32Array(uv), new Uint16Array(idx));
  });
}
const FLAME = {
  // a solid rocket motor: white root, shock diamonds, orange edge
  motor: { core: '#fffaf0', edge: '#ffa040', dia: 10, len: 1.3, r: 0.055 },
  // a ballistic missile's boost: longer, whiter, wider
  boost: { core: '#fffaf0', edge: '#ff9a40', dia: 9, len: 1.4, r: 0.1 },
  // a turbojet: short, faint, with no diamonds
  jet: { core: '#ffc890', edge: '#a04018', dia: 0, len: 0.3, r: 0.03 }
};
W3.mover = function (v, m) {
  const d = m.tr.kind === 'threat' && m.tr.ref && m.tr.ref.d;
  const kind = m.tr.kind === 'missile' ? 'motor' : d && (d.cls === 'bal' || d.cls === 'hgv') ? 'boost' : d && d.cls === 'cm' ? 'jet' : null;
  if (!kind) return;
  const F = FLAME[kind];
  const mat = new T.ShaderMaterial({ vertexShader: PVS, fragmentShader: fsrc(PFS), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uTime: { value: 0 }, uHot: { value: 1 }, uDia: { value: F.dia }, uA: { value: 1 }, uCore: { value: new T.Color(F.core) }, uEdge: { value: new T.Color(F.edge) } } });
  bloom(mat, 2.5);
  // added light that leaves the frame's alpha alone: the passes after read it, and a flame's alpha over 1 turned them black
  Object.assign(mat, { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor });
  const wp = new T.Mesh(plumeGeom(), mat); wp.visible = false; wp.frustumCulled = false; wp.renderOrder = 11; wp.userData.F = F;
  if (wp.layers && IC.LIFE3D) wp.layers.enable(IC.LIFE3D.bloomLayer);
  v.scene.add(wp); m.wp = wp;
  if (kind === 'motor') m.mo = { P: new T.Vector3(), D: new T.Vector3(), ok: false, at: -1, t0: 0, m };
};
/* the flame on a mover's nozzle: k scales its length (a motor tailing off), hot its brightness */
const FW = { x: 0, y: 0, z: 0 };
function flame(v, w, m, k, hot) {
  const wp = m.wp; if (!wp) return;
  const F = wp.userData.F, g = m.grp, len = m.MP ? m.MP.len : 0.05, p = g.position;
  const pz = g.rotation.z, h = -g.rotation.y, cp = Math.cos(pz);
  FW.x = Math.cos(h) * cp; FW.y = Math.sin(pz); FW.z = Math.sin(h) * cp;
  let L = len * F.len * k, r = len * F.r;
  const nx = p.x - FW.x * len * 0.5, ny = p.y - FW.y * len * 0.5, nz = p.z - FW.z * len * 0.5;
  // far away: a streak a few pixels long and one or two wide, never a blob
  const d = Math.max(1e-3, Math.hypot(nx - CP.x, ny - CP.y, nz - CP.z)), f = v.focalPx || 1000, px = L * f / d;
  let far = 1;
  if (px < CFG.streakPx) { L = CFG.streakPx * d / f; far = U.clamp(px / CFG.streakPx, 0.35, 1); }
  r = Math.max(r, 0.9 * d / f);
  wp.visible = true; wp.position.set(nx, ny, nz); wp.rotation.set(g.rotation.x, g.rotation.y, g.rotation.z, 'YZX'); wp.scale.set(L, r, r);
  const u = wp.material.uniforms; u.uTime.value = w.clock + (m.tr.id || 0) * 0.37; u.uHot.value = hot * (0.9 + 0.5 * w.night); u.uA.value = 0.85 * far + 0.15;
  // the nozzle itself, white hot: a small star that shows end on
  emit(w.star, nx, ny, nz, r * (5 + 5 * w.night) * hot, 1, 0.9, 0.75, (0.35 + 0.45 * w.night) * hot, (m.tr.id || 0) * 0.7);
}

W3.scene = function (v) {
  H = IC.R3D; T = H.THREE(); KM = H.KM;
  const w = v.war = { smoke: partSet(v, CFG.smokeN, 'smoke'), fire: partSet(v, CFG.fireN, 'fire'), star: partSet(v, CFG.starN, 'star'), spark: lineSet(CFG.sparkN),
    P: [], clock: 0, trauma: 0, look: null, stats: {}, ci: 0, ri: 0, si: 0,
    cv: new T.Vector3(), ca: new T.Vector3(), cs: new T.Vector3(), cq: new T.Quaternion(), cm: new T.Matrix4(), bp: {} };
  w.chunks = new T.InstancedMesh(chunkGeom(), new T.MeshStandardMaterial({ color: '#3b342d', roughness: 0.95, metalness: 0.05 }), CFG.chunkN);
  w.chunks.frustumCulled = false; w.chunks.count = 0;
  const ringMat = () => new T.MeshBasicMaterial({ map: ringTex(), color: '#e8e2d6', transparent: true, opacity: 0.5, depthWrite: false });
  w.rings = []; for (let i = 0; i < CFG.rings; i++) { const M = new T.Mesh(H.quadG(), ringMat()); M.visible = false; M.renderOrder = 8; w.rings.push(M); v.scene.add(M); }
  const sm = new T.MeshBasicMaterial({ map: scorchTex(), color: '#14110e', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  w.scorch = []; for (let i = 0; i < CFG.scorch; i++) { const M = new T.Mesh(H.quadG(), sm); M.visible = false; M.renderOrder = 2; w.scorch.push(M); v.scene.add(M); }
  for (const x of [w.smoke, w.fire, w.star, w.spark, w.chunks]) v.scene.add(x);
  return w;
};

/* ---------- every frame ---------- */
const Q = { x: 0, y: 0, z: 0 }, R1 = {}, R2 = {};
const yOf = (v, x, y, alt) => H.hT(v, x, y) * v.hk + alt * KM * v.hk;
// temperature to colour: 0 white-hot, 1 deep red
function heat(k, out) { k = U.clamp(k, 0, 1); out[0] = 1; out[1] = k < 0.3 ? 0.95 - k * 1.3 : Math.max(0.12, 0.56 - (k - 0.3) * 0.6); out[2] = k < 0.2 ? 0.8 - k * 3.4 : Math.max(0.03, 0.12 - (k - 0.2) * 0.12); return out; }
const HC = [0, 0, 0];

W3.frame = function (v, t, dtR) {
  const w = v.war; if (!w) return;
  const t0 = performance.now(), S = v.S;
  w.clock += Math.min(0.1, dtR || 0);
  for (const P of [w.smoke, w.fire, w.star]) { const u = P.material.uniforms; u.uFocal.value = v.focalPx || 1000; u.uFar.value = v.scene.fog ? v.scene.fog.far * 1.25 : 1400; if (v.scene.fog) u.uFog.value.copy(v.scene.fog.color); }
  CP = v.camera.position; FAR2 = CFG.reach * CFG.reach;
  // the light on the smoke: sunlit by day, dark grey-blue by night (the fires light it from below)
  const day = IC.daylight ? IC.daylight(t) : v.light == null ? 1 : v.light;
  w.lit = 0.16 + 0.84 * U.clamp(day * 1.2, 0, 1); w.night = 1 - U.clamp(day * 1.6, 0, 1);
  w.fire.material.uniforms.uGain.value = 0.8 + 0.6 * w.night; w.star.material.uniforms.uGain.value = 1 + 0.5 * w.night;
  const wd = S.wind || { dir: 0, kt: 5 }, ws = (wd.kt || 0) * 0.5144 / 100;   // the wind, world units a second
  w.wx = Math.cos((wd.dir || 0) + Math.PI) * ws; w.wy = Math.sin((wd.dir || 0) + Math.PI) * ws;
  w.ci = w.ri = w.si = 0;
  for (const m of v.movers) {
    if (m.wp) m.wp.visible = false;
    if (m.tr.kind === 'missile') motor(v, w, m, t);
    else if (m.tr.kind === 'threat' && m.vis) weapon(v, w, m, t);
  }
  for (const ev of v.events) if (W3.owns(ev.e)) boom(v, w, ev, t);
  for (let i = w.ri; i < w.rings.length; i++) w.rings[i].visible = false;
  for (let i = w.si; i < w.scorch.length; i++) w.scorch[i].visible = false;
  w.chunks.count = w.ci; w.chunks.instanceMatrix.needsUpdate = true;
  Object.assign(w.stats, { smoke: w.smoke.userData.n, fire: w.fire.userData.n, star: w.star.userData.n, spark: w.spark.userData.n, chunks: w.ci, rings: w.ri, scorch: w.si });
  flush(w.smoke); flush(w.fire); flush(w.star); flushLines(w.spark);
  CP = null;
  w.ms = performance.now() - t0;
};
/* smoke laid along a recorded path between ta and tb: puffs every gap (finer near the camera), each as old as the
   time it was laid, swelling and drifting; o: { s0, grow, life, a0, col, rise, warm, st (where the motor is now, so
   the smoke runs on to it), mo (the canister's mouth: the first 1.6 s leave from it, as the round does) } */
function laySmoke(v, w, tr, ta, tb, t, o) {
  if (tb <= ta) return;
  const P = w.P; P.length = 0; IC.recPath(tr, ta, tb, P);
  if (o.st && tb >= t - 1e-6 && P.length >= 4 && P[P.length - 1] < t - 1e-3) P.push(o.st.x, o.st.y, o.st.alt, t);
  if (P.length < 8) return;
  const L = w.lit, col = o.col || 0.92, seed = tr.id * 131, mo = o.mo && o.mo.ok ? o.mo : null;
  let n = 0;
  for (let j = 0; j + 4 < P.length; j += 4) {
    const xa = P[j], ya = P[j + 1], aa = P[j + 2], ta0 = P[j + 3], xb = P[j + 4], yb = P[j + 5], ab = P[j + 6], tb0 = P[j + 7];
    if (tb0 < ta) continue;
    const sx = xa - v.cx, sz = ya - v.cy, sy = yOf(v, xa, ya, aa);
    const dc = Math.hypot(sx - CP.x, sy - CP.y, sz - CP.z);
    if (dc > CFG.reach) continue;
    const gap = U.clamp(dc * 0.006, o.s0 * 0.8, 1.2), len = Math.hypot(xb - xa, yb - ya, (ab - aa) * KM), k = Math.max(1, Math.min(160, Math.ceil(len / gap))), step = len / k;
    for (let s = 0; s < k; s++) {
      const f = s / k, tp = ta0 + (tb0 - ta0) * f, age = t - tp; if (age < 0.03 || tp < ta) continue;
      const life = o.life * (0.8 + 0.4 * hash(seed + n)), kk = age / life; if (kk >= 1) { n++; continue; }
      const h1 = hash(seed + n * 3 + 1) - 0.5, h2 = hash(seed + n * 3 + 2) - 0.5, h3 = hash(seed + n * 3 + 3);
      // never narrower than the spacing, or a fast round's trail is a string of beads
      const r = Math.max(o.s0 + o.grow * Math.sqrt(age), step * 1.4), spread = r * 0.35;
      let bx = xa + (xb - xa) * f, by = ya + (yb - ya) * f, balt = aa + (ab - aa) * f;
      if (o.lift != null && balPos(tr, tp, BS)) { bx = BS.x; by = BS.y; balt = BS.alt; }   // (a ballistic missile's lift-off, as drawn)
      let X = bx - v.cx, Y = yOf(v, bx, by, balt), Z = by - v.cy;
      // (the round's first seconds are drawn by render3d-arms.js: the smoke is laid where it was drawn)
      if (mo && mo.m && IC.arms3d && IC.arms3d.launchAt && IC.arms3d.launchAt(v, mo.m, tp, LV)) { X = LV.x; Y = LV.y; Z = LV.z; }
      else if (mo && tp - mo.t0 < 1.6) { const a = tp - mo.t0, d = 1.5 * a * a, e = ease(a / 1.6); X = (mo.P.x + mo.D.x * d) * (1 - e) + X * e; Y = (mo.P.y + mo.D.y * d) * (1 - e) + Y * e; Z = (mo.P.z + mo.D.z * d) * (1 - e) + Z * e; }
      const a = o.a0 * Math.pow(1 - kk, 1.6) * (0.75 + 0.5 * h3) * U.clamp(age / 0.15, 0.35, 1);
      const warm = o.warm && age < o.warm ? 1 - age / o.warm : 0, c = col * L;
      emit(w.smoke, X + w.wx * age + h1 * spread, Y + (o.rise || 0.0012) * age * KM * v.hk, Z + w.wy * age + h2 * spread, r * (0.8 + 0.4 * h3), c + (1 - c) * warm * 0.8, c + (0.75 - c) * warm * 0.7, c + (0.5 - c) * warm * 0.6, a, h3 * 6.28);
      n++;
    }
  }
}
/* a ballistic missile's lift-off (brief 67): the simulation flies its boost at full speed on a straight slant from the
   pad. Drawn, it rises from rest straight up off the pad and pitches over onto that path: the recorded path is flown
   on a clock that starts still and runs up to the real one (as a round leaving its canister, render3d-arms.js), a
   third faster than real two thirds of the way and on time, at the recorded speed, when the window ends; until then
   it climbs the distance it has come straight up, bending onto the path. The model points the way it moves and
   the boost's smoke is laid where it was drawn, so nothing jumps. A window: the first 50 s, or less of a short boost */
// A cruise missile's booster throws it up out of its canister at the canister's 35° (models-arms.js, ecml) and it
// levels onto its path in seconds
const BAL = { win: 50, min: 8, cmWin: 7, cmEl: 0.62 }, CM_BOOST = 2.5;
const balTau = (a, A) => { const u = a / A; return a - a * (1 - u) * (1 - u); };
const balWin = new WeakMap(), BQ = {}, BR = {}, BH = {};
function balPos(tr, tp, out) {
  const t0 = IC.recFirstT(tr), a = tp - t0, d0 = tr.ref && tr.ref.d, cm = d0 && d0.cls === 'cm';
  let W = balWin.get(tr);
  if (!W) balWin.set(tr, W = { A: 0, az: 0, n: -1 });
  if (W.n !== tr.n || W.t0 !== t0) {   // (again while it is still being recorded)
    W.n = tr.n; W.t0 = t0;
    // a short flight gets a shorter window (it must still be where it was when it is hit); one still flying the longest
    const fl = tr.live ? 1e9 : tr.t1 - t0;
    W.A = cm ? U.clamp(fl * 0.3, 2, BAL.cmWin) : U.clamp(Math.min(BAL.win, (d0 && d0.boost) || 70, fl * 0.3), BAL.min, BAL.win);
    const h = cm && IC.recAt(tr, Math.min(tr.t1, t0 + 5), BH), q = IC.recAt(tr, t0, BQ);
    W.az = h && q ? Math.atan2(h.y - q.y, h.x - q.x) : 0;
  }
  const A = W.A;
  if (a < 0 || a >= A) return false;
  const q = IC.recAt(tr, t0, BQ), r = IC.recAt(tr, t0 + balTau(a, A), BR); if (!q || !r || q.alt > 0.05) return false;
  const d = Math.hypot((r.x - q.x) * 0.1, (r.y - q.y) * 0.1, r.alt - q.alt), k = ease(a / (A * 0.8));   // km along it; how far onto the path
  // straight up (or up its canister's slope) as far as it has come, bending onto the path
  const ce = cm ? Math.cos(BAL.cmEl) : 0, se = cm ? Math.sin(BAL.cmEl) : 1;
  const ux = q.x + Math.cos(W.az) * d * ce * 10, uy = q.y + Math.sin(W.az) * d * ce * 10, ua = q.alt + (cm ? 0.002 : 0.007) + d * se;   // (from where it stood on its launcher)
  out.x = ux + (r.x - ux) * k; out.y = uy + (r.y - uy) * k; out.alt = ua + (r.alt - ua) * k;
  return true;
}
const LV = { x: 0, y: 0, z: 0 }, BP = { x: 0, y: 0, alt: 0 }, BN = { x: 0, y: 0, alt: 0 }, BS = { x: 0, y: 0, alt: 0 };
W3.pose = function (v, m, st, t) {
  const d = m.tr.kind === 'threat' && m.tr.ref && m.tr.ref.d; if (!d || (d.cls !== 'bal' && d.cls !== 'hgv' && d.cls !== 'cm')) return;
  if (!balPos(m.tr, t, BP)) return;
  st.x = BP.x; st.y = BP.y; st.alt = BP.alt;
  // the nose along the way it moves, a moment ahead (straight up on the pad)
  if (balPos(m.tr, t + 0.4, BN)) {
    const hz = Math.hypot(BN.x - BP.x, BN.y - BP.y) * 100, vt = (BN.alt - BP.alt) * 1000;
    st.pitch = hz + vt > 1e-3 ? Math.atan2(vt, hz) : Math.PI / 2;
    if (hz > 0.5) st.h = Math.atan2(BN.y - BP.y, BN.x - BP.x);
  } else st.pitch = Math.min(st.pitch || 0, Math.PI / 2);
};
/* where a round leaves from: its canister's mouth when its launcher is drawn (render3d-arms.js), else the first
   recorded point, pointing along its first second */
function mouthOf(v, m, t) {
  const mo = m.mo; if (!mo) return null;
  const age = t - m.tL; mo.t0 = m.tL;
  if (age < 0) { mo.ok = false; return null; }
  if (mo.ok && (age >= 1.6 || mo.at === t)) return mo;
  mo.at = t;
  if (IC.arms3d && v.arms && IC.arms3d.mouth(v, m, mo.P, mo.D)) { mo.ok = true; return mo; }
  const tr = m.tr, a = IC.recAt(tr, m.tL, R1), b = a && IC.recAt(tr, Math.min(tr.t1, m.tL + 1), R2);
  if (!a || !b) return null;
  mo.P.set(a.x - v.cx, yOf(v, a.x, a.y, a.alt) + 0.02, a.y - v.cy);
  mo.D.set(b.x - a.x, (b.alt - a.alt) * KM * v.hk, b.y - a.y).normalize();
  mo.ok = true;
  return mo;
}
/* a missile's motor: the launch at the canister, the flame while it burns, smoke along its path, a wisp after */
function motor(v, w, m, t) {
  const tr = m.tr, tL = m.tL, burn = m.burn || 0, age = t - tL;
  if (age < 0) { if (m.mo) m.mo.ok = false; return; }
  const big = /^(LR|LRE|VLR|TBD|HAT|EXO)$/.test(tr.meta.mun) ? 1.6 : /^(MR)$/.test(tr.meta.mun) ? 1.2 : 1;
  const mo = age < 60 ? mouthOf(v, m, t) : null;
  if (mo && age < 60) launchBlast(v, w, m, mo, age, big);
  if (burn > 0 && age < burn + CFG.trailLife) laySmoke(v, w, tr, tL, Math.min(t, tL + burn), t, { s0: 0.012 * big, grow: 0.06 * big, life: CFG.trailLife, a0: 0.62, col: 0.95, warm: 0.5, st: m.vis ? m.st : null, mo });
  // after burn-out, a thin wisp along the coast
  if (age > burn && age < burn + 120) laySmoke(v, w, tr, Math.max(tL + burn, t - 25), t, t, { s0: 0.012, grow: 0.02, life: 25, a0: 0.1, col: 0.95, st: m.vis ? m.st : null });
  if (!m.vis || age > burn) return;
  // the flame grows out of the nozzle in the first tenth of a second and gutters as the motor burns out
  const k = U.clamp(age / 0.12, 0.15, 1) * (age > burn - 0.6 ? U.clamp((burn - age) / 0.6, 0.2, 1) : 1);
  flame(v, w, m, k * (0.85 + 0.25 * big), 1);
}
/* a round leaving its canister: the flash, the gas out of the back, the white cloud rolling round the launcher */
function launchBlast(v, w, m, mo, age, big) {
  const P = mo.P, D = mo.D, len = m.MP ? m.MP.len : 0.05, cl = len * 1.1, seed = m.tr.id * 61, L = w.lit;
  const rx = P.x - D.x * cl, ry = P.y - D.y * cl, rz = P.z - D.z * cl, gY = H.hT(v, P.x + v.cx, P.z + v.cy) * v.hk;
  const lit = Math.exp(-age / 0.5);
  if (age < 0.15) {
    const k = 1 - age / 0.15;
    emit(w.star, P.x, P.y, P.z, len * 0.8 * big * k, 1, 0.92, 0.8, k, seed);
    emit(w.star, rx, ry, rz, len * 1.2 * big * k, 1, 0.85, 0.65, k, seed + 1);
  }
  // the gas out of the back of the canister, bending along the ground
  if (age < 1.2) for (let i = 0; i < 16; i++) {
    const k = i / 15, d = len * (0.2 + k * 2.4) * Math.min(1, age * 5), fade = 1 - age / 1.2;
    let x = rx - D.x * d, y = ry - D.y * d, z = rz - D.z * d;
    if (y < gY + len * 0.08) { const o = gY + len * 0.08 - y; y = gY + len * 0.08; x -= D.x * o; z -= D.z * o; }
    heat(0.1 + k * 0.6 + age * 0.4, HC);
    emit(w.fire, x, y, z, len * (0.16 + 0.35 * k) * big, HC[0], HC[1], HC[2], (1 - k * 0.7) * fade * 0.9, seed + i);
  }
  if (age < 0.4) for (let i = 0; i < 18; i++) {
    const a = age, h1 = hash(seed + i * 3), h2 = hash(seed + i * 3 + 1), sp = 2 + 4 * h2, tau = 0.15;
    const dx = -D.x + (h1 - 0.5) * 1.4, dz = -D.z + (h2 - 0.5) * 1.4, dy = 0.2 + h1 * 0.5, l = Math.hypot(dx, dy, dz);
    const d1 = sp * tau * (1 - Math.exp(-a / tau)), d0 = sp * tau * (1 - Math.exp(-Math.max(0, a - 0.05) / tau));
    streak(w.spark, rx + dx / l * d1, ry + dy / l * d1, rz + dz / l * d1, rx + dx / l * d0, ry + dy / l * d0, rz + dz / l * d0, 1, 0.8, 0.45, 1 - a / 0.4);
  }
  // the cloud: most of it out of the back, some round the mouth; it rolls out, slows, rises a little and drifts
  for (let i = 0; i < 26; i++) {
    const h1 = hash(seed + i * 5 + 11), h2 = hash(seed + i * 5 + 12), h3 = hash(seed + i * 5 + 13), back = i % 4 !== 0;
    const a = age - h3 * 0.15; if (a <= 0) continue;
    const life = 35 + 25 * h1, kk = a / life; if (kk >= 1) continue;
    const an = h2 * 6.283, sp = (0.15 + 0.35 * h1) * big, tau = 0.8, out = sp * tau * (1 - Math.exp(-a / tau));
    let dx, dy, dz;
    if (back) { dx = -D.x * 0.8 + Math.cos(an) * 0.6; dz = -D.z * 0.8 + Math.sin(an) * 0.6; dy = 0.15 + 0.3 * h3; }
    else { dx = D.x * 0.4 + Math.cos(an) * 0.5; dz = D.z * 0.4 + Math.sin(an) * 0.5; dy = D.y * 0.3 + 0.2; }
    const ox = back ? rx : P.x, oy = back ? ry : P.y, oz = back ? rz : P.z, sz = len * (0.15 + 0.4 * h2) * big + 0.04 * Math.sqrt(a) * big;
    let y = oy + dy * out + 0.0025 * a * KM * v.hk; if (y < gY + sz * 0.35) y = gY + sz * 0.35;
    const c = (0.2 + 0.08 * h3) * L, warm = lit * 0.9;
    emit(w.smoke, ox + dx * out + w.wx * a, y, oz + dz * out + w.wy * a, sz, c + (1 - c) * warm, c + (0.62 - c) * warm, c + (0.3 - c) * warm, 0.34 * Math.pow(1 - kk, 1.6) * U.clamp(a / 0.1, 0.3, 1), h1 * 6.28);
  }
  // dust off the ground round the launcher
  if (age < 16) for (let i = 0; i < 14; i++) {
    const an = hash(seed + i + 290) * 6.283, R = len * (0.4 + 2.2 * (1 - Math.exp(-age * 1.8))) * (0.5 + 0.7 * hash(seed + i + 310)), kk = age / 16, c = 0.22 * L, sz = len * (0.18 + 0.04 * age) * (0.7 + 0.6 * hash(seed + i + 320));
    emit(w.smoke, P.x + Math.cos(an) * R + w.wx * age, gY + sz * 0.55, P.z + Math.sin(an) * R + w.wy * age, sz, c, c * 0.92, c * 0.8, 0.25 * Math.pow(1 - kk, 1.5), i);
  }
}
/* the enemy's weapons: a ballistic missile's boost and re-entry, a cruise missile's engine */
function weapon(v, w, m, t) {
  const tr = m.tr, d = tr.ref && tr.ref.d; if (!d) return;
  const p = m.grp.position, st = m.st, age = t - tr.t0;
  if (d.cls === 'bal' || d.cls === 'hgv') {
    // the boost: a long flame along its axis and a fat column of smoke where it climbed
    const boost = Math.min(70, (d.boost || 70));
    if (age < boost + CFG.trailLife) laySmoke(v, w, tr, tr.t0, Math.min(t, tr.t0 + boost), t, { s0: 0.05, grow: 0.12, life: CFG.trailLife * 1.5, a0: 0.55, col: 0.9, warm: 1.2, rise: 0.002, st, lift: tr.t0 });
    // the launch: the flame hits the ground and the exhaust is thrown out round the launcher, lit as it leaves
    if (age < 120) {
      const q = m._pad || (m._pad = IC.recPose(tr, IC.recFirstT(tr), {}));
      if (q) {
        // it rolls out along the ground over the first ten seconds, lumpy, then rises and thins
        const gx = q.x - v.cx, gz = q.y - v.cy, gy = H.hT(v, q.x, q.y) * v.hk, sp = 1 - Math.exp(-age * 0.35), fade = Math.exp(-age / 45), lit = Math.exp(-age / 1.5);
        for (let i = 0; i < 80; i++) {
          const a = i * 2.39996 + hash(i + tr.id) * 0.5, u = 0.25 + 0.75 * hash(i * 3 + tr.id), r = (0.03 + 1.1 * sp * u), sz = (0.06 + 0.28 * sp) * (0.6 + 0.8 * hash(i * 5 + 1));
          const up = sz * 0.45 + 0.25 * sp * hash(i * 7 + 2) * (1.2 - u) + age * 0.003;
          const c = 0.48 + 0.16 * hash(i * 11 + 3);
          emit(w.smoke, gx + Math.cos(a) * r + w.wx * age, gy + up, gz + Math.sin(a) * r + w.wy * age, sz, c * 0.55 + 0.35 * lit, c * 0.5 + 0.14 * lit, c * 0.46 + 0.02 * lit, 0.6 * fade * U.clamp(age / 0.3, 0.2, 1), i * 1.7);
        }
        if (age < 0.2) emit(w.star, gx, gy + 0.05, gz, 0.6, 1, 0.85, 0.6, 1 - age / 0.2, 0);
        // the flame splashing on the pad for the first seconds
        if (age < 3.5) for (let i = 0; i < 18; i++) {
          const an = i / 18 * 6.283, k = 1 - age / 3.5, R = 0.05 + 0.25 * Math.min(1, age * 3) * (0.6 + 0.4 * hash(i + tr.id));
          heat(0.15 + 0.5 * (1 - k) + 0.2 * hash(i), HC);
          emit(w.fire, gx + Math.cos(an) * R, gy + 0.02 + 0.03 * hash(i + 7), gz + Math.sin(an) * R, 0.08 + 0.06 * k, HC[0], HC[1], HC[2], 0.8 * k, i);
        }
      }
    }
    if (age < boost && st.alt < 60) flame(v, w, m, Math.min(1, age / 0.3), 1.2);
    // coming down: the nose glows and an incandescent streak follows it
    const falling = age > boost && st.alt < 55 && (st.pitch || 0) < -0.2;
    if (falling) {
      const g = U.clamp((55 - st.alt) / 30, 0, 1);
      emit(w.star, p.x, p.y, p.z, 0.08 + 0.2 * g, 1, 0.8, 0.55, 0.5 + 0.5 * g, tr.id);
      laySmoke(v, w, tr, Math.max(tr.t0, t - 12), t, t, { s0: 0.02, grow: 0.05, life: 12, a0: 0.35 * g, col: 0.85, st });
      const P = w.P; P.length = 0; IC.recPath(tr, t - 1.2, t, P); P.push(st.x, st.y, st.alt, t);
      for (let j = 0; j + 7 < P.length; j += 4) {
        const k = (t - P[j + 3]) / 1.2; heat(0.15 + k * 0.7, HC);
        streak(w.spark, P[j + 4] - v.cx, yOf(v, P[j + 4], P[j + 5], P[j + 6]), P[j + 5] - v.cy, P[j] - v.cx, yOf(v, P[j], P[j + 1], P[j + 2]), P[j + 1] - v.cy, HC[0], HC[1], HC[2], (1 - k) * (0.4 + 0.6 * g));
      }
    }
    return;
  }
  if (d.cls === 'cm') {
    // off the ground, a booster for its first seconds: a long bright flame and a trail of white smoke that hangs
    const q = age < 60 ? (m._pad || (m._pad = IC.recPose(tr, IC.recFirstT(tr), {}))) : null, boost = q && q.alt <= 0.05 ? CM_BOOST : 0;
    if (boost && age < boost + 40) laySmoke(v, w, tr, tr.t0, Math.min(t, tr.t0 + boost), t, { s0: 0.02, grow: 0.07, life: 40, a0: 0.55, col: 0.92, warm: 0.6, st, lift: tr.t0 });
    // the turbojet: a short faint flame, plainer at night, and a haze where it passed
    if (age < boost) flame(v, w, m, 4 * U.clamp(age / 0.15, 0.2, 1) * (age > boost - 0.4 ? U.clamp((boost - age) / 0.4, 0.25, 1) : 1), 1.2);
    else flame(v, w, m, 1, 0.25 + 0.6 * w.night);
    laySmoke(v, w, tr, Math.max(tr.t0, t - 4), t, t, { s0: 0.012, grow: 0.03, life: 4, a0: 0.08, col: 0.8, rise: 0, st });
  } else if (d.cls === 'drone' && w.night > 0.3) {
    const h = st.h, len = m.MP ? m.MP.len : 0.06;
    emit(w.star, p.x - Math.cos(h) * len * 0.5, p.y, p.z - Math.sin(h) * len * 0.5, 0.012, 1, 0.5, 0.3, 0.35 * w.night, 0);
  }
}
/* how big a ground hit is, and whether it burns like fuel */
function hitKind(e) {
  let fuel = false, bld = false;
  for (const d of e.dmg || []) { if (d.kind === 'part' && d.p && (d.p.kind === 'fuel' || d.p.kind === 'hydrant')) fuel = true; if (d.kind === 'block' || d.kind === 'part') bld = true; }
  return { fuel, bld, k: (e.sz || 1) * (fuel ? 1.9 : 1) };
}
/* the explosions and launches drawn here (the view's own flashes and puffs stand down for them) */
W3.owns = e => e.kind === 'impact' || e.kind === 'crash' || e.kind === 'intercept' || e.kind === 'collision' || e.kind === 'kill' || e.kind === 'mstat' || e.kind === 'launch' || e.kind === 'fire';
/* where an air burst was: what it killed, where it was at that moment and how fast it was going (scene units, per s) */
function burstAt(v, ev) {
  if (ev._wb && ev._wb.cx === v.cx && ev._wb.cy === v.cy) return ev._wb;
  const e = ev.e, b = ev._wb = { cx: v.cx, cy: v.cy, x: e.x - v.cx, y: yOf(v, e.x, e.y, e.alt || 0), z: e.y - v.cy, vx: 0, vy: 0, vz: 0 };
  const tr = e.tref && H.trackOf(v, e.tref);
  if (tr) {
    const f = IC.recFirstT(tr), t1 = U.clamp(e.t, f, tr.t1), t0 = Math.max(f, t1 - 0.5), a = IC.recAt(tr, t1, R1);
    if (a) {
      b.x = a.x - v.cx; b.y = yOf(v, a.x, a.y, a.alt); b.z = a.y - v.cy;
      const c = t1 - t0 > 0.05 && IC.recAt(tr, t0, R2);
      if (c) { const dt = t1 - t0; b.vx = (a.x - c.x) / dt; b.vy = (a.alt - c.alt) * KM * v.hk / dt; b.vz = (a.y - c.y) / dt; }
    }
  }
  return b;
}
/* an explosion and what it leaves */
function boom(v, w, ev, t) {
  const e = ev.e, age = t - e.t;
  if (age < 0) return;
  if (e.kind === 'launch') return;     // drawn with the round (motor)
  if (e.kind === 'fire') { muzzle(v, w, e, age); return; }
  const ground = e.kind === 'impact' || e.kind === 'crash' || (e.kind === 'kill' && !(e.alt > 0.05));
  const air = !ground && (e.kind === 'intercept' || e.kind === 'kill' || e.kind === 'collision' || (e.kind === 'mstat' && (e.what === 'hit' || e.text === 'MISS')));
  if (!ground && !air) return;
  if (age > (ground ? CFG.colLife + CFG.colPuff : 45)) return;
  if (air) return airBurst(v, w, ev, e, age);
  groundHit(v, w, e, age);
}
/* a gun or rocket firing on the ground: a flash and a puff */
function muzzle(v, w, e, age) {
  if (age > 8) return;
  const x = e.x - v.cx, z = e.y - v.cy, y = H.hT(v, e.x, e.y) * v.hk + 0.03, c = 0.7 * w.lit;
  if (age < 0.1) emit(w.star, x, y, z, 0.15, 1, 0.85, 0.6, 1 - age / 0.1, e.id);
  for (let i = 0; i < 6; i++) { const an = hash(e.id + i) * 6.283, R = 0.04 * Math.sqrt(age) * (1 + i * 0.2); emit(w.smoke, x + Math.cos(an) * R + w.wx * age, y + 0.01 * age, z + Math.sin(an) * R + w.wy * age, 0.05 + 0.03 * age, c, c, c * 0.95, 0.4 * (1 - age / 8), i); }
}
function airBurst(v, w, ev, e, age) {
  const b = burstAt(v, ev), seed = e.id * 977, L = w.lit, H1 = i => hash(seed + i);
  // high up the air is thin and a blast spreads wider: a ballistic intercept at 20 km is a bloom you see from the ground
  const small = e.kind === 'mstat' ? (e.text === 'MISS' ? 0.25 : 0.45) : e.sz || 0.7, s = small * (1 + U.clamp(((e.alt || 0) - 3) / 6, 0, 3));
  // what blew up carries on: the gas slows within a second, the pieces keep going and fall
  const sp = Math.hypot(b.vx, b.vy, b.vz), ux = sp > 1e-4 ? b.vx / sp : 0, uy = sp > 1e-4 ? b.vy / sp : 0, uz = sp > 1e-4 ? b.vz / sp : 0;
  const carry = (a, tau) => tau * (1 - Math.exp(-a / tau));
  const gx = c => b.x + b.vx * c, gy = c => b.y + b.vy * c, gz = c => b.z + b.vz * c;
  if (age < 0.12) emit(w.star, b.x, b.y, b.z, s * 2.6 * (1 - age / 0.12), 1, 0.95, 0.85, 1, seed);
  if (age < 0.3) emit(w.fire, b.x, b.y, b.z, s * 0.5, 1, 0.95, 0.85, 1 - age / 0.3, seed);
  // the fireball: lumps strung out along the way it was flying, white to orange to dull red, turning to smoke
  const cf = carry(age, 0.6);
  for (let i = 0; i < 18; i++) {
    const life = 0.5 + 0.7 * H1(i), k = age / life; if (k >= 1) continue;
    const along = (H1(i + 30) - 0.3) * s * 0.4, uu = H1(i + 50) * 2 - 1, an = H1(i + 90) * 6.283, rr = Math.sqrt(1 - uu * uu), R = s * 0.2 * (0.4 + H1(i + 130)) * (1 - Math.exp(-age * 9));
    heat(k * 0.95, HC);
    emit(w.fire, gx(cf) + ux * along + rr * Math.cos(an) * R, gy(cf) + uy * along + uu * R * 0.8 + age * 0.02, gz(cf) + uz * along + rr * Math.sin(an) * R, s * 0.14 * (0.6 + H1(i + 170)) * (1 + age * 1.8), HC[0], HC[1], HC[2], Math.pow(1 - k, 1.4) * 0.9, H1(i) * 6.28);
  }
  // fragments: bright streaks out in a shell, thrown forward by the speed it had
  if (age < 0.7) for (let i = 0; i < 46; i++) {
    const life = 0.3 + 0.4 * H1(i + 700); if (age > life) continue;
    const uu = H1(i + 710) * 2 - 1, an = H1(i + 720) * 6.283, rr = Math.sqrt(1 - uu * uu), v0 = (3 + 6 * H1(i + 730)) * Math.max(0.5, s), tau = 0.35;
    const dx = rr * Math.cos(an) * v0 + b.vx, dy = uu * v0 + b.vy, dz = rr * Math.sin(an) * v0 + b.vz;
    const c1 = carry(age, tau), c0 = carry(Math.max(0, age - 0.05), tau);
    streak(w.spark, b.x + dx * c1, b.y + dy * c1, b.z + dz * c1, b.x + dx * c0, b.y + dy * c0, b.z + dz * c0, 1, 0.82, 0.5, 1 - age / life);
  }
  // the dark smoke it leaves, strung out, hanging and drifting
  for (let i = 0; i < 22; i++) {
    const a0 = 0.15 + H1(i + 200) * 0.35, a = age - a0; if (a < 0) continue;
    const life = 24 + 14 * H1(i + 210), k = a / life; if (k >= 1) continue;
    const c0 = carry(a0 + a, 0.8), along = (H1(i + 270) - 0.35) * s * 0.6;
    const uu = H1(i + 220) * 2 - 1, an = H1(i + 230) * 6.283, rr = Math.sqrt(1 - uu * uu), R = s * 0.22 * (0.3 + H1(i + 240)) * (1 - Math.exp(-a * 3)) + a * 0.004;
    const c = (0.16 + 0.1 * H1(i + 250)) * L;
    emit(w.smoke, gx(c0) + ux * along + rr * Math.cos(an) * R + w.wx * a, gy(c0) + uy * along + uu * R * 0.7 - a * 0.002, gz(c0) + uz * along + rr * Math.sin(an) * R + w.wy * a, s * 0.17 * (0.7 + H1(i + 260)) * (1 + Math.sqrt(a) * 0.9), c, c * 0.97, c * 0.94, 0.78 * Math.pow(1 - k, 2), H1(i) * 6.28);
  }
  pieces(v, w, seed, age, b.x, b.y, b.z, b.vx * 0.7, b.vy * 0.7, b.vz * 0.7, s, e.kind === 'mstat' ? 4 : 12, true);
}
function groundHit(v, w, e, age) {
  const hk = hitKind(e), k = hk.k * (e.kind === 'kill' ? 0.5 : 0.8), seed = e.id * 977, L = w.lit, H1 = i => hash(seed + i);
  const x0 = e.x - v.cx, z0 = e.y - v.cy, gY = H.hT(v, e.x, e.y) * v.hk, y0 = gY;
  // the flash, and the light it throws round
  if (age < 0.15) emit(w.star, x0, y0 + k * 0.2, z0, k * 3.2 * (1 - age / 0.15), 1, 0.9, 0.7, 1, seed);
  if (age < 0.3) emit(w.fire, x0, gY + k * 0.4, z0, k * 2.2, 1, 0.7, 0.4, 0.5 * (1 - age / 0.3), 0);
  // the shock ring racing out along the ground, raising dust as it goes
  if (age < 0.6 && w.ri < w.rings.length) flat(w.rings, w.ri++, x0, gY + 0.004, z0, k * (0.1 + 3.2 * age), H1(1) * 6, 0.55 * (1 - age / 0.6) * L);
  // a scorch mark where it hit
  if (age > 0.1 && w.si < w.scorch.length) flat(w.scorch, w.si++, x0, gY + 0.003, z0, k * (0.18 + 0.1 * H1(2)), H1(3) * 6.28);
  // the fireball: short for a warhead, rolling up and rising for fuel
  const fbLife = hk.fuel ? 6 : 1.4;
  if (age < fbLife * 1.4) for (let i = 0; i < (hk.fuel ? 60 : 34); i++) {
    const life = fbLife * (0.5 + 0.7 * H1(i)), kk = age / life; if (kk >= 1) continue;
    const u = H1(i + 50), a = H1(i + 90) * 6.283, rr = Math.sqrt(1 - u * u), R = k * 0.3 * (0.3 + H1(i + 130)) * (1 - Math.exp(-age * 6));
    heat(0.1 + kk * 0.9, HC);
    // it rolls up and over as it rises: the outside climbs slower than the middle
    const rise = age * 0.1 * k * (hk.fuel ? 1.4 : 0.8) * (1.2 - rr * 0.6);
    emit(w.fire, x0 + rr * Math.cos(a) * R, y0 + 0.02 + u * R * 0.8 + rise, z0 + rr * Math.sin(a) * R, k * 0.13 * (0.6 + H1(i + 170)) * (1 + age * 0.8), HC[0], HC[1], HC[2], Math.pow(1 - kk, 1.4) * (kk < 0.1 ? 0.95 : 0.75), H1(i) * 6.28);
    if (kk > 0.4) { const c = 0.07 * L; emit(w.smoke, x0 + rr * Math.cos(a) * R * 1.1, y0 + 0.05 + u * R * 0.8 + rise * 1.1, z0 + rr * Math.sin(a) * R * 1.1, k * 0.18 * (0.6 + H1(i + 170)) * (1 + age * 0.6), c, c, c, 0.65 * U.clamp((kk - 0.4) * 4, 0, 1), H1(i) * 6.28); }
  }
  // earth and dust thrown up in fingers 60–160 m high that arc over and fall back, each a dense trail of dirt that hangs
  if (age < 30) for (let i = 0; i < 16; i++) {
    const an = H1(i + 800) * 6.283, tilt = 0.1 + 0.7 * Math.pow(H1(i + 810), 1.5), gg = G * v.hk, v0 = Math.sqrt(2 * gg * k * (0.6 + 1.0 * H1(i + 820))) / Math.max(0.5, Math.cos(tilt));
    const vh = Math.sin(tilt) * v0, vv = Math.cos(tilt) * v0, tLand = 2 * vv / gg, c = (0.22 + 0.08 * H1(i + 830)) * L;
    for (let j = 0; j < 12; j++) {
      const ta = Math.min(age, tLand) * (1 - j / 12), a = age - ta;     // where it was ta into its flight, laid a ago
      if (ta <= 0) continue;
      const kk = a / 20; if (kk >= 1) continue;
      const px = x0 + Math.cos(an) * vh * ta + w.wx * a, pz = z0 + Math.sin(an) * vh * ta + w.wy * a, py = gY + vv * ta - gg * ta * ta / 2;
      const sz = k * (0.06 + 0.05 * j / 12) * (1 + Math.sqrt(a) * 1.1);
      emit(w.smoke, px, Math.max(gY + sz * 0.4, py - a * 0.004), pz, sz, c, c * 0.9, c * 0.78, 0.75 * Math.pow(1 - kk, 1.5) * (1 - j / 14), H1(i * 13 + j) * 6.28);
    }
  }
  // the low skirt of dust thrown out along the ground
  if (age < 16) for (let i = 0; i < 30; i++) {
    const a = H1(i + 290) * 6.283, R = k * (0.12 + 1.3 * (1 - Math.exp(-age * 2.2))) * (0.6 + 0.6 * H1(i + 310)), kk = age / 16, c = 0.46 * L, sz = k * 0.16 * (1 + age * 0.5) * (0.7 + 0.6 * H1(i + 320));
    emit(w.smoke, x0 + Math.cos(a) * R + w.wx * age, gY + sz * 0.5, z0 + Math.sin(a) * R + w.wy * age, sz, c, c * 0.92, c * 0.8, 0.55 * Math.pow(1 - kk, 1.5), H1(i) * 6.28);
  }
  // sparks in a dome
  if (age < 0.8) for (let i = 0; i < 40; i++) {
    const life = 0.35 + 0.45 * H1(i + 900); if (age > life) continue;
    const an = H1(i + 910) * 6.283, el = 0.1 + 1.3 * H1(i + 920), v0 = (4 + 6 * H1(i + 930)) * k, tau = 0.3;
    const dx = Math.cos(an) * Math.cos(el) * v0, dy = Math.sin(el) * v0, dz = Math.sin(an) * Math.cos(el) * v0, c1 = tau * (1 - Math.exp(-age / tau)), c0 = tau * (1 - Math.exp(-Math.max(0, age - 0.05) / tau));
    streak(w.spark, x0 + dx * c1, gY + dy * c1, z0 + dz * c1, x0 + dx * c0, gY + dy * c0, z0 + dz * c0, 1, 0.78, 0.42, 1 - age / life);
  }
  pieces(v, w, seed, age, x0, gY + 0.01, z0, 0, 0, 0, k, e.kind === 'kill' ? 10 : 22, false);
  // fires at the base, the light they throw on the ground, and the column of smoke over them
  const burn = hk.bld || hk.fuel || e.kind === 'crash' ? CFG.colLife : e.kind === 'kill' ? 240 : 40;
  if (age > 0.6 && age < burn) {
    const fade = U.clamp((burn - age) / 60, 0, 1) * U.clamp((age - 0.6) / 1.5, 0, 1), spots = hk.fuel ? 3 : 2, tall = hk.fuel ? 7 : 4;
    for (let s = 0; s < spots; s++) {
      const ox = (H1(s + 400) - 0.5) * k * (hk.fuel ? 0.9 : 0.5), oz = (H1(s + 410) - 0.5) * k * (hk.fuel ? 0.9 : 0.5), w0 = k * (hk.fuel ? 0.3 : 0.13) * (0.7 + 0.5 * H1(s + 420));
      for (let i = 0; i < tall; i++) {
        // a flame: wide and white-yellow at the bottom, licking up thinner and redder, flickering
        const f = hash(Math.floor(w.clock * 14) + i * 7 + s * 31 + seed), q = i / tall, sz = w0 * (1.25 - q * 0.8) * (0.75 + 0.5 * f);
        heat(0.15 + q * 0.75, HC);
        emit(w.fire, x0 + ox + (f - 0.5) * w0 * 0.3, gY + w0 * 0.4 + q * w0 * (hk.fuel ? 2.6 : 2) * (0.85 + 0.3 * f), z0 + oz, sz, HC[0], HC[1], HC[2], (0.85 - q * 0.45) * fade, f * 6 + i);
      }
    }
    // the glow on the ground and on what stands round it
    emit(w.fire, x0, gY + k * (hk.fuel ? 2.2 : 1.1), z0, k * (hk.fuel ? 5 : 2.5), 1, 0.45, 0.12, (0.1 + 0.22 * w.night) * fade, 0);
  }
  const pl = CFG.colPuff, every = hk.fuel ? 0.35 : 0.7, last = Math.min(age, burn);
  const j0 = Math.max(0, Math.ceil((age - pl) / every)), j1 = Math.floor(last / every);
  for (let j = j0; j <= j1; j++) {
    const born = j * every + 0.4, a = age - born; if (a < 0) continue;
    const kk = a / pl; if (kk >= 1) continue;
    const r1 = hash(seed + j * 3), r2 = hash(seed + j * 3 + 1), r3 = hash(seed + j * 3 + 2);
    // it rises from the fire on the ground, fast at first, slows as it cools, then spreads and leans downwind
    const hgt = k * (0.05 + (hk.fuel ? 22 : 14) * (1 - Math.exp(-a / 80))), lean = Math.min(1, hgt / (10 * k));
    const sz = k * ((hk.fuel ? 0.22 : 0.15) + (hk.fuel ? 0.05 : 0.04) * a) * (0.7 + 0.6 * r3);
    const x = x0 + (r1 - 0.5) * sz * 0.9 + w.wx * a * (0.3 + 1.6 * lean), z = z0 + (r2 - 0.5) * sz * 0.9 + w.wy * a * (0.3 + 1.6 * lean);
    // oily black over fuel, grey-brown over buildings; lit orange from below by the fire at night
    const base = (hk.fuel ? 0.05 + 0.04 * r3 : 0.12 + 0.08 * r3) * L, glow = (0.25 + 0.75 * w.night) * U.clamp(1 - hgt / (k * 4), 0, 1) * (born < burn ? 1 : 0);
    const fade = born > burn - 60 ? U.clamp((burn - born) / 60, 0, 1) : 1;
    emit(w.smoke, x, gY + hgt + sz * 0.3, z, sz, base + glow * 0.55, base + glow * 0.24, base + glow * 0.07, (hk.fuel ? 0.85 : 0.7) * Math.pow(1 - kk, 1.2) * fade * U.clamp(a / 1.2, 0.35, 1), r1 * 6.28);
  }
}
/* pieces thrown out by a blast: chunks that tumble under gravity, some burning with a trail of smoke; on the ground
   they land and lie */
function pieces(v, w, seed, age, x0, y0, z0, bvx, bvy, bvz, s, n, air) {
  if (age > (air ? 14 : 120)) return;
  const g = G * v.hk, gY0 = H.hT(v, x0 + v.cx, z0 + v.cy) * v.hk;
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed + i), h2 = hash(seed + i + 40), h3 = hash(seed + i + 80), h4 = hash(seed + i + 120);
    const an = h1 * 6.283, up = air ? h2 * 2 - 0.6 : 0.5 + h2 * 0.9, sp = (0.3 + 0.9 * h4) * Math.max(0.6, s);
    const vx = Math.cos(an) * sp + bvx, vz = Math.sin(an) * sp + bvz, vy = up * sp * 1.3 + bvy;
    // the drag of a tumbling piece: it loses the blast's speed within a few seconds
    const tau = 2.5 + 3 * h3, at = a => { const c = tau * (1 - Math.exp(-a / tau)); Q.x = x0 + vx * c + w.wx * a; Q.y = y0 + vy * a - g * a * a / 2; Q.z = z0 + vz * c + w.wy * a; return Q; };
    // when it lands (the ground is flat enough under a blast)
    const tl = air ? 1e9 : (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, y0 - gY0))) / g;
    const a = Math.min(age, tl), q = at(a), sz = (air ? 0.006 : 0.004) * (0.6 + 1.4 * h3) * Math.max(0.6, s);
    if (air && q.y < gY0) continue;
    chunk(w, q.x, Math.max(q.y, gY0 + sz * 0.4), q.z, sz, a * (4 + 8 * h2), seed + i * 7);
    const burning = h2 > (air ? 0.25 : 0.55), life = 3 + 5 * h3;
    if (!burning || age > life || age > tl) continue;
    // the trail: where it was over the last second and a half
    for (let j = 8; j >= 1; j--) {
      const b = age - j * 0.18; if (b < 0) continue;
      const p = at(b), k = j / 8, c = (0.22 + 0.15 * h3) * w.lit;
      emit(w.smoke, p.x, p.y, p.z, 0.015 + 0.05 * k * Math.max(0.6, s), c, c, c * 0.95, 0.5 * (1 - k) * (1 - age / life), i + j);
    }
    const p = at(age);
    heat(0.3 + 0.6 * age / life, HC);
    emit(w.fire, p.x, p.y, p.z, sz * 4, HC[0], HC[1], HC[2], 0.9 * (1 - age / life), i);
  }
}

/* ---------- film cameras ----------
   A shot: { mode, ref, at, from, lens, ... }, its time t0 (the view's time when it started) and dur.
   - fixed:  the camera at from { x, y, h (m above the ground) or alt (km) }, looking at ref or at
   - plant:  a flyby: the camera set down beside where ref will be lead s after the shot starts, side units to its right (negative:
             left) and up units above its path; it stays there as ref goes by
   - chase:  behind ref, back units, a little up and to the side (side, up), eased
   - along:  alongside ref, side units out, looking at it (a wingman)
   - seeker: from ref's nose, looking at its target
   - orbit:  round ref or at, dist units out at height up, turning rate radians a second from yaw
   - dolly:  the camera moves from from to to over the shot, looking at ref or at
   lens: mm on a full-frame camera (24 is wide, 50 normal, 200 long, 600 very long), or [from, to] over the shot.
   shake: the handheld sway in degrees; explosions near the camera shake it too. lag: seconds the operator's aim
   trails what it follows. */
const D2R = Math.PI / 180;
W3.lens = function (v, mm) {
  const fov = 2 * Math.atan(12 / mm) / D2R, cam = v.camera;
  if (Math.abs(cam.fov - fov) < 1e-4) return;
  cam.fov = fov; cam.updateProjectionMatrix();
  const view = v.$('view'), h = view && view.clientHeight || 1080;
  v.focalPx = h / 2 / Math.tan(fov * D2R / 2);
};
const PA = {}, PB = {};
/* where a thing is in the scene now: a mover's model if it shows, else its recorded place; a point { x, y, alt } */
function placeOf(v, ref, t, out) {
  if (!ref) return null;
  if (ref.id == null && ref.x != null) return spot(v, ref, out);   // a place, not a thing
  const m = H.moverOfRef(v, ref);
  if (m && m.vis) return out.copy(m.grp.position);
  const tr = H.trackOf(v, ref), st = tr && IC.recPose(tr, U.clamp(t, IC.recFirstT(tr), tr.t1), PA);
  if (st) { out.set(st.x - v.cx, yOf(v, st.x, st.y, st.alt), st.y - v.cy); return out; }
  if (ref.x != null) { out.set(ref.x - v.cx, yOf(v, ref.x, ref.y, ref.alt || 0), ref.y - v.cy); return out; }
  return null;
}
W3.placeOf = (v, ref, t) => placeOf(v, ref, t, new T.Vector3());
/* a place on the ground (or in the air) as given by a shot: { x, y } world, h metres above the ground or alt km */
function spot(v, p, out) { const g = H.hT(v, p.x, p.y) * v.hk; return out.set(p.x - v.cx, p.alt != null ? g + p.alt * KM * v.hk : g + (p.h != null ? p.h : 2) / 100, p.y - v.cy); }
let TV = null;
const tv = i => (TV || (TV = []))[i] || (TV[i] = new T.Vector3());
W3.cam = function (v, t, dtR) {
  const sh = v.fshot; if (!sh || !T) return false;
  const cam = v.camera, w = v.war || {}, want = tv(0), look = tv(1);
  const el = U.clamp(sh.dur ? (t - sh.t0) / sh.dur : 0, 0, 1), e = IC.filmEase ? IC.filmEase(el) : el;
  const subj = placeOf(v, sh.ref, t, tv(2)) || (sh.at ? placeOf(v, sh.at, t, tv(2)) : null);
  if (!subj) return false;
  look.copy(subj);
  const st = sh.ref && H.moverOfRef(v, sh.ref) ? H.moverOfRef(v, sh.ref).st : null;
  const h = st ? st.h : sh.yaw || 0, pitch = st && st.pitch || 0;
  const fwd = tv(3).set(Math.cos(h) * Math.cos(pitch), Math.sin(pitch), Math.sin(h) * Math.cos(pitch)), right = tv(4).set(-Math.sin(h), 0, Math.cos(h));
  switch (sh.mode) {
    case 'fixed': spot(v, sh.from, want); break;
    case 'plant': {
      if (!sh._at) {
        const tr = H.trackOf(v, sh.ref), q = tr && IC.recPose(tr, Math.min(tr.t1, (sh.t0 != null ? sh.t0 : t) + (sh.lead || 4)), PB);
        const p = q ? tv(5).set(q.x - v.cx, yOf(v, q.x, q.y, q.alt), q.y - v.cy) : subj.clone();
        const hh = q ? q.h : h, rx = -Math.sin(hh), rz = Math.cos(hh), side = sh.side == null ? 0.6 : sh.side;
        sh._at = new T.Vector3(p.x + rx * side + Math.cos(hh) * (sh.ahead || 0), p.y + (sh.up == null ? 0.1 : sh.up), p.z + rz * side + Math.sin(hh) * (sh.ahead || 0));
        const g = H.hT(v, sh._at.x + v.cx, sh._at.z + v.cy) * v.hk + 0.02; if (sh._at.y < g) sh._at.y = g;
      }
      want.copy(sh._at); break;
    }
    case 'chase': {
      const back = sh.back || 0.4;
      want.copy(subj).addScaledVector(fwd, -back).addScaledVector(right, sh.side || back * 0.25); want.y += sh.up == null ? back * 0.25 : sh.up;
      look.addScaledVector(fwd, back * (sh.ahead == null ? 0.8 : sh.ahead));
      break;
    }
    case 'along': {
      const side = sh.side || 0.5;
      want.copy(subj).addScaledVector(right, side).addScaledVector(fwd, sh.ahead || side * 0.3); want.y += sh.up || 0;
      break;
    }
    case 'seeker': {
      const m = H.moverOfRef(v, sh.ref), tg = m && placeOf(v, m.tr.meta.tref, t, tv(6));
      want.copy(subj).addScaledVector(fwd, (m && m.MP ? m.MP.len : 0.05) * 0.8);
      if (tg) look.copy(tg); else look.copy(want).addScaledVector(fwd, 1);
      break;
    }
    case 'orbit': {
      const a = (sh.yaw0 || 0) + (sh.rate == null ? 0.08 : sh.rate) * (t - sh.t0), d = sh.dist || 3;
      want.set(subj.x + Math.cos(a) * d, subj.y + (sh.up == null ? d * 0.3 : sh.up), subj.z + Math.sin(a) * d);
      break;
    }
    case 'dolly': { const A = spot(v, sh.from, tv(7)), B = spot(v, sh.to, tv(8)); want.copy(A).lerp(B, e); break; }
    default: return false;
  }
  if (sh.lookAt) placeOf(v, sh.lookAt, t, look);
  if (sh.lookOff) look.add(tv(9).set(sh.lookOff.x || 0, sh.lookOff.y || 0, sh.lookOff.z || 0));
  // never under the ground
  const g = H.hT(v, want.x + v.cx, want.z + v.cy) * v.hk + 0.012; if (want.y < g) want.y = g;
  // the lens, and where it is aimed: locked, or trailing a little like a person following it
  const mm = Array.isArray(sh.lens) ? Math.exp(Math.log(sh.lens[0]) + (Math.log(sh.lens[1]) - Math.log(sh.lens[0])) * e) : sh.lens || 35;
  W3.lens(v, mm);
  if (v.fsnap || !w.look) { w.look = (w.look || new T.Vector3()).copy(look); w.pos = (w.pos || new T.Vector3()).copy(want); v.fsnap = false; }
  else {
    const kl = sh.lag ? 1 - Math.exp(-dtR / sh.lag) : 1, kp = sh.ease ? 1 - Math.exp(-dtR / sh.ease) : 1;
    w.look.lerp(look, kl); w.pos.lerp(want, kp);
  }
  cam.position.copy(w.pos); cam.lookAt(w.look);
  (v.camPos || (v.camPos = new T.Vector3())).copy(w.pos); (v.lookAt || (v.lookAt = new T.Vector3())).copy(sh.focusOn === 'look' ? w.look : subj);
  // the shake: a slow handheld sway, and the jolt of a blast nearby that dies away
  let tr = 0;
  for (const ev of v.events) {
    const E = ev.e, a = t - E.t; if (a < 0 || a > 2.5) continue;
    if (!(E.kind === 'impact' || E.kind === 'intercept' || E.kind === 'kill' || E.kind === 'crash')) continue;
    const d = Math.hypot(E.x - v.cx - w.pos.x, E.y - v.cy - w.pos.z), R = (E.sz || 1) * (E.kind === 'impact' ? 60 : 25);
    // the jolt comes with the sound: a kilometre is three seconds
    const delay = d * 100 / 340, aa = a - delay; if (aa < 0 || aa > 1.5) continue;
    tr += Math.max(0, 1 - d / R) * Math.exp(-aa * 2.5);
  }
  w.trauma = Math.min(1, Math.max(w.trauma * Math.exp(-dtR * 3), tr));
  const c = w.clock || 0, hand = (sh.shake == null ? 0.12 : sh.shake) * D2R * (mm > 100 ? 0.4 : 1), jolt = w.trauma * w.trauma * 1.6 * D2R;
  const n = (f, p) => Math.sin(c * f + p) * 0.6 + Math.sin(c * f * 2.13 + p * 1.7) * 0.3 + Math.sin(c * f * 5.7 + p * 0.3) * 0.1;
  cam.rotateX(n(0.9, 1) * hand + n(19, 2) * jolt);
  cam.rotateY(n(0.7, 4) * hand + n(23, 5) * jolt);
  cam.rotateZ((sh.roll || 0) * D2R + n(0.5, 7) * hand * 0.5 + n(17, 8) * jolt * 0.5);
  cam.updateMatrixWorld();
  return true;
};

})(window.IC);
