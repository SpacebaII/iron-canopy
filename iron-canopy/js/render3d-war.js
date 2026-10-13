/* Iron Canopy — war in the 3D view (brief 59): the smoke, fire and wreckage of a fight, and the film cameras.
   Loaded with the 3D view; replay3d.js calls it through a few hooks (IC.war3d) and lends it its helpers (IC.R3D).

   Effects, all worked out from the record at the view's time t, so a scrub back and forth shows the same thing:
   - a missile's motor: a white-hot core and flame behind the nozzle, and the smoke it lays while it burns as lit
     puffs that swell, rise a little and drift with the wind for a minute and a half;
   - a ballistic missile's boost (a fat column of smoke behind a long flame) and its re-entry glow; a cruise
     missile's engine heat and the faint haze behind it;
   - a warhead in the air: the flash, a fireball that cools from white through orange to red, a ball of dark smoke
     that hangs and drifts, and burning pieces that fall away trailing smoke;
   - a hit on the ground: the flash, a fireball rising, a skirt of dust thrown out along the ground, debris, then
     fires at the base and a column of smoke that climbs, spreads and leans downwind for a quarter of an hour (a
     fuel farm: twice the size, oily black).
   Two particle buffers (smoke, normally blended and lit; fire, added and blooming) are filled again every frame,
   nothing is made from frame to frame.

   Film cameras (IC.replayShot(v, spec)): planted beside a flight path (a flyby), on the ground with a long lens, at
   the launcher, chasing, alongside, from the seeker, orbiting, dollying; each with a lens in mm, a handheld sway and
   the shake of an explosion close by. */
(function (IC) {
'use strict';
const U = IC.U;
const W3 = IC.war3d = {};
const CFG = IC.WAR3D = {
  smokeN: 18000, fireN: 7000,
  trailLife: 100,         // s a motor's smoke hangs
  colLife: 900,           // s a fire on the ground keeps burning and smoking
  colPuff: 240,           // s one puff of a smoke column lives
  reach: 1400             // particles farther than this from the camera (140 km) are not made
};
let T = null, H = null, KM = 10;
const hash = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

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
// smoke: a lumpy puff turned by the particle's own angle, lit from above, sinking into the haze with distance
const SMOKE_FS = `
uniform sampler2D uTex; uniform vec3 uFog;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), k = cos(vRot);
  vec2 q = vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5;
  float den = texture2D(uTex, q).r;
  float a = vCol.a * den;
  if (a < 0.004) discard;
  float lit = 0.72 + 0.5 * (0.5 - c.y) + 0.18 * den;
  vec3 col = mix(vCol.rgb * lit, uFog, vFog * vFog * 0.85);
  gl_FragColor = vec4(col, a * (1.0 - vFog * vFog * vFog * vFog));
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
// fire: a soft core that burns white in the middle (above 1: it blooms)
const FIRE_FS = `
uniform sampler2D uTex; uniform float uGain;
varying vec4 vCol; varying float vRot; varying float vFog;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; float s = sin(vRot), k = cos(vRot);
  float den = texture2D(uTex, vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5).r;
  float a = vCol.a * pow(max(0.0, 1.0 - r), 1.6) * (0.55 + 0.6 * den) * (1.0 - vFog * vFog);
  if (a < 0.004) discard;
  vec3 col = vCol.rgb * (1.0 + 1.1 * pow(max(0.0, 1.0 - r * 1.6), 3.0)) * uGain;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <OUT_CS>
}`;
const fsrc = src => src.replace('#include <OUT_CS>', (+T.REVISION || 128) >= 152 ? '#include <colorspace_fragment>' : '#include <encodings_fragment>');

/* the puff: a cloud of soft blobs, denser in the middle, painted once */
function puffTex() {
  return H.share('war:puff', () => {
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), rnd = H.seeded(91);
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 38; i++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.8) * N * 0.24, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, r = N * (0.1 + rnd() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // the edge: nothing past the circle
    g.globalCompositeOperation = 'destination-in';
    const e = g.createRadialGradient(N / 2, N / 2, N * 0.2, N / 2, N / 2, N / 2); e.addColorStop(0, '#fff'); e.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = e; g.fillRect(0, 0, N, N);
    const tex = new T.CanvasTexture(cv); tex.needsUpdate = true;
    return tex;
  });
}
function partSet(v, n, add) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('pcol', new T.BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('psz', new T.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('prot', new T.BufferAttribute(new Float32Array(n), 1));
  g.setDrawRange(0, 0);
  const m = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fsrc(add ? FIRE_FS : SMOKE_FS), transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { uFocal: { value: 1000 }, uMaxPx: { value: 900 }, uFar: { value: 1400 }, uTex: { value: puffTex() }, uFog: { value: new T.Color('#888') }, uGain: { value: 1 } } });
  if (add && H.glow) { m.userData.bloom = true; H.glow(m, 3); }
  const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = add ? 10 : 9;
  p.userData = { n: 0, cap: n };
  if (add && p.layers && IC.LIFE3D) p.layers.enable(IC.LIFE3D.bloomLayer);
  return p;
}
let CP = null, FAR2 = 1e12;   // the camera's place this frame and how far particles are made
function emit(P, x, y, z, sz, r, g, b, a, rot) {
  const d = P.userData; if (d.n >= d.cap || a < 0.004) return;
  if (CP) { const dx = x - CP.x, dy = y - CP.y, dz = z - CP.z; if (dx * dx + dy * dy + dz * dz > FAR2) return; }
  const i = d.n++, A = P.geometry.attributes;
  A.position.array[i * 3] = x; A.position.array[i * 3 + 1] = y; A.position.array[i * 3 + 2] = z;
  A.pcol.array[i * 4] = r; A.pcol.array[i * 4 + 1] = g; A.pcol.array[i * 4 + 2] = b; A.pcol.array[i * 4 + 3] = Math.min(1, a);
  A.psz.array[i] = sz; A.prot.array[i] = rot || 0;
}
function flush(P) { const A = P.geometry.attributes; P.geometry.setDrawRange(0, P.userData.n); for (const k of ['position', 'pcol', 'psz', 'prot']) A[k].needsUpdate = true; P.userData.n = 0; }

W3.scene = function (v) {
  H = IC.R3D; T = H.THREE(); KM = H.KM;
  v.war = { smoke: partSet(v, CFG.smokeN, false), fire: partSet(v, CFG.fireN, true), P: [], clock: 0, trauma: 0, look: null, stats: {} };
  v.scene.add(v.war.smoke); v.scene.add(v.war.fire);
  return v.war;
};

/* ---------- every frame ---------- */
const S1 = {}, S2 = {}, Q = { x: 0, y: 0, z: 0 };
const yOf = (v, x, y, alt) => H.hT(v, x, y) * v.hk + alt * KM * v.hk;
// temperature to colour: 0 white-hot, 1 deep red
function heat(k, out) { k = U.clamp(k, 0, 1); out[0] = 1; out[1] = k < 0.3 ? 0.95 - k * 1.3 : Math.max(0.12, 0.56 - (k - 0.3) * 0.6); out[2] = k < 0.2 ? 0.8 - k * 3.4 : Math.max(0.03, 0.12 - (k - 0.2) * 0.12); return out; }
const HC = [0, 0, 0];

W3.frame = function (v, t, dtR) {
  const w = v.war; if (!w) return;
  const t0 = performance.now(), S = v.S;
  w.clock += Math.min(0.1, dtR || 0);
  for (const P of [w.smoke, w.fire]) { const u = P.material.uniforms; u.uFocal.value = v.focalPx || 1000; u.uFar.value = v.scene.fog ? v.scene.fog.far * 1.25 : 1400; if (v.scene.fog) u.uFog.value.copy(v.scene.fog.color); }
  CP = v.camera.position; FAR2 = CFG.reach * CFG.reach;
  // the light on the smoke: sunlit by day, dark grey-blue by night (the fires light it from below)
  const day = IC.daylight ? IC.daylight(t) : v.light == null ? 1 : v.light;
  w.lit = 0.16 + 0.84 * U.clamp(day * 1.2, 0, 1); w.night = 1 - U.clamp(day * 1.6, 0, 1);
  w.fire.material.uniforms.uGain.value = 0.8 + 0.6 * w.night;
  const wd = S.wind || { dir: 0, kt: 5 }, ws = (wd.kt || 0) * 0.5144 / 100;   // the wind, world units a second
  w.wx = Math.cos((wd.dir || 0) + Math.PI) * ws; w.wy = Math.sin((wd.dir || 0) + Math.PI) * ws;
  for (const m of v.movers) {
    if (m.tr.kind === 'missile') motor(v, w, m, t);
    else if (m.tr.kind === 'threat' && m.vis) weapon(v, w, m, t);
  }
  for (const ev of v.events) boom(v, w, ev.e, t);
  w.stats.smoke = w.smoke.userData.n; w.stats.fire = w.fire.userData.n;
  flush(w.smoke); flush(w.fire);
  CP = null;
  w.ms = performance.now() - t0;
};
/* smoke laid along a recorded path between ta and tb: puffs every gap (finer near the camera), each as old as the
   time it was laid, swelling and drifting; o: { s0, grow, life, a0, col, rise, warm } */
function laySmoke(v, w, tr, ta, tb, t, o) {
  if (tb <= ta) return;
  const P = w.P; P.length = 0; IC.recPath(tr, ta, tb, P);
  if (P.length < 8) return;
  const L = w.lit, col = o.col || 0.92, seed = tr.id * 131;
  let n = 0;
  for (let j = 0; j + 4 < P.length; j += 4) {
    const xa = P[j], ya = P[j + 1], aa = P[j + 2], ta0 = P[j + 3], xb = P[j + 4], yb = P[j + 5], ab = P[j + 6], tb0 = P[j + 7];
    if (tb0 < ta) continue;
    const sx = xa - v.cx, sz = ya - v.cy, sy = yOf(v, xa, ya, aa);
    const dc = Math.hypot(sx - CP.x, sy - CP.y, sz - CP.z);
    if (dc > CFG.reach) continue;
    const gap = U.clamp(dc * 0.006, o.s0 * 0.8, 1.2), len = Math.hypot(xb - xa, yb - ya, (ab - aa) * KM), k = Math.max(1, Math.min(60, Math.ceil(len / gap)));
    for (let s = 0; s < k; s++) {
      const f = s / k, tp = ta0 + (tb0 - ta0) * f, age = t - tp; if (age < 0 || tp < ta) continue;
      const life = o.life * (0.8 + 0.4 * hash(seed + n)), kk = age / life; if (kk >= 1) { n++; continue; }
      const h1 = hash(seed + n * 3 + 1) - 0.5, h2 = hash(seed + n * 3 + 2) - 0.5, h3 = hash(seed + n * 3 + 3);
      const r = o.s0 + o.grow * Math.sqrt(age), spread = r * 0.35;
      const x = xa + (xb - xa) * f + w.wx * age + h1 * spread, y = ya + (yb - ya) * f + w.wy * age + h2 * spread;
      const alt = aa + (ab - aa) * f + (o.rise || 0.0012) * age;
      const a = o.a0 * Math.pow(1 - kk, 1.6) * (0.75 + 0.5 * h3) * U.clamp(age / 0.15, 0.35, 1);
      const warm = o.warm && age < o.warm ? 1 - age / o.warm : 0, c = col * L;
      emit(w.smoke, x - v.cx, yOf(v, x, y, alt), y - v.cy, r * (0.8 + 0.4 * h3), c + (1 - c) * warm * 0.8, c + (0.75 - c) * warm * 0.7, c + (0.5 - c) * warm * 0.6, a, h3 * 6.28);
      n++;
    }
  }
}
/* a missile's motor: flame while it burns, smoke along its path, a thin wisp after burn-out */
function motor(v, w, m, t) {
  const tr = m.tr, tL = m.tL, burn = m.burn || 0, age = t - tL;
  if (age < 0) return;
  const big = /^(LR|LRE|VLR|TBD|HAT|EXO)$/.test(tr.meta.mun) ? 1.6 : /^(MR)$/.test(tr.meta.mun) ? 1.2 : 1;
  if (burn > 0 && age < burn + CFG.trailLife) laySmoke(v, w, tr, tL, Math.min(t, tL + burn), t, { s0: 0.035 * big, grow: 0.05 * big, life: CFG.trailLife, a0: 0.62, col: 0.95, warm: 0.6 });
  // after burn-out, a thin wisp along the coast
  if (age > burn && age < burn + 120) laySmoke(v, w, tr, Math.max(tL + burn, t - 25), t, t, { s0: 0.015, grow: 0.02, life: 25, a0: 0.12, col: 0.95 });
  if (!m.vis || age > burn) return;
  // the flame: a white core at the nozzle, yellow and orange behind it, flickering
  const p = m.grp.position, st = m.st, ch = Math.cos(st.pitch || 0), dx = Math.cos(st.h) * ch, dy = Math.sin(st.pitch || 0), dz = Math.sin(st.h) * ch;
  const len = m.MP ? m.MP.len : 0.05, nx = p.x - dx * len * 0.55, ny = p.y - dy * len * 0.55, nz = p.z - dz * len * 0.55;
  const fl = 0.85 + 0.3 * hash(Math.floor(w.clock * 60) + tr.id), sz = 0.03 * big;
  for (let i = 0; i < 9; i++) {
    const k = i / 8, d = sz * (0.5 + i * 0.9) * fl;
    heat(k * 0.9, HC);
    emit(w.fire, nx - dx * d, ny - dy * d, nz - dz * d, sz * (1.5 - k * 0.8) * fl, HC[0], HC[1], HC[2], (1 - k) * 0.95, i);
  }
  // the glow that carries far, more at night
  emit(w.fire, nx, ny, nz, sz * (4 + 10 * w.night), 1, 0.65, 0.35, 0.1 + 0.4 * w.night, 0);
}
/* the enemy's weapons: a ballistic missile's boost and re-entry, a cruise missile's engine heat */
function weapon(v, w, m, t) {
  const tr = m.tr, d = tr.ref && tr.ref.d; if (!d) return;
  const p = m.grp.position, st = m.st, age = t - tr.t0;
  if (d.cls === 'bal' || d.cls === 'hgv') {
    // the boost: a long flame and a fat column of smoke where it climbed
    const boost = Math.min(70, (d.boost || 70));
    if (age < boost + CFG.trailLife) laySmoke(v, w, tr, tr.t0, Math.min(t, tr.t0 + boost), t, { s0: 0.12, grow: 0.12, life: CFG.trailLife * 1.5, a0: 0.55, col: 0.9, warm: 1.2, rise: 0.002 });
    // the launch: exhaust thrown out along the ground round the launcher, lit by the flame as it leaves
    if (age < 120) {
      const q = m._pad || (m._pad = IC.recPose(tr, IC.recFirstT(tr), {}));
      if (q) {
        const gx = q.x - v.cx, gz = q.y - v.cy, gy = H.hT(v, q.x, q.y) * v.hk, sp = 1 - Math.exp(-age * 2.5), fade = Math.exp(-age / 45), lit = Math.exp(-age / 1.5);
        for (let i = 0; i < 46; i++) {
          const a = i * 2.39996, u = 0.35 + 0.65 * ((i * 0.618) % 1), r = (0.06 + 1.6 * sp * u), up = 0.04 + 0.5 * sp * ((i * 0.377) % 1) * (1.2 - u) + age * 0.004;
          const c = 0.42 + 0.12 * ((i * 0.31) % 1);
          emit(w.smoke, gx + Math.cos(a) * r + w.wx * age, gy + up, gz + Math.sin(a) * r + w.wy * age, 0.18 + 0.5 * sp, c * 0.6 + 0.35 * lit, c * 0.57 + 0.15 * lit, c * 0.53 + 0.03 * lit, 0.7 * fade, i);
        }
        if (age < 4) emit(w.fire, gx, gy + 0.3, gz, 0.7, 1, 0.55, 0.25, 0.3 * lit, 0);
      }
    }
    if (age < boost && st.alt < 40) for (let i = 0; i < 26; i++) { const k = i / 25; heat(k, HC); emit(w.fire, p.x, p.y - 0.05 - k * 0.45, p.z, 0.1 * (1.5 - k), HC[0], HC[1], HC[2], 0.75 * Math.pow(1 - k, 1.3), i); }
    // coming down: the air ahead of it glows, and a short incandescent streak follows
    const falling = age > boost && st.alt < 55 && (st.pitch || 0) < -0.2;
    if (falling) {
      const g = U.clamp((55 - st.alt) / 30, 0, 1);
      emit(w.fire, p.x, p.y, p.z, 0.25 + 0.5 * g, 1, 0.75, 0.45, 0.6 * g + 0.2, 0);
      laySmoke(v, w, tr, Math.max(tr.t0, t - 12), t, t, { s0: 0.04, grow: 0.05, life: 12, a0: 0.35 * g, col: 0.85 });
      const P = w.P; P.length = 0; IC.recPath(tr, t - 1.2, t, P);
      for (let j = 0; j + 3 < P.length; j += 4) { const k = (t - P[j + 3]) / 1.2; heat(0.2 + k * 0.7, HC); emit(w.fire, P[j] - v.cx, yOf(v, P[j], P[j + 1], P[j + 2]), P[j + 1] - v.cy, 0.18 * (1 - k) * (0.5 + g), HC[0], HC[1], HC[2], 0.8 * (1 - k) * g, j); }
    }
    return;
  }
  if (d.cls === 'cm' || d.cls === 'drone') {
    // the engine's heat behind it, and a faint haze where it passed
    const h = st.h, len = m.MP ? m.MP.len : 0.06, ex = p.x - Math.cos(h) * len * 0.6, ez = p.z - Math.sin(h) * len * 0.6;
    if (d.cls === 'cm') {
      emit(w.fire, ex, p.y, ez, 0.025, 1, 0.6, 0.3, 0.5 + 0.4 * w.night, 0);
      emit(w.fire, ex, p.y, ez, 0.12, 1, 0.55, 0.25, 0.1 + 0.25 * w.night, 0);
      laySmoke(v, w, tr, Math.max(tr.t0, t - 4), t, t, { s0: 0.015, grow: 0.03, life: 4, a0: 0.1, col: 0.8, rise: 0 });
    } else if (w.night > 0.3) emit(w.fire, ex, p.y, ez, 0.012, 1, 0.5, 0.3, 0.35 * w.night, 0);
  }
}
/* how big a ground hit is, and whether it burns like fuel */
function hitKind(e) {
  let fuel = false, bld = false;
  for (const d of e.dmg || []) { if (d.kind === 'part' && d.p && (d.p.kind === 'fuel' || d.p.kind === 'hydrant')) fuel = true; if (d.kind === 'block' || d.kind === 'part') bld = true; }
  return { fuel, bld, k: (e.sz || 1) * (fuel ? 1.9 : 1) };
}
/* the explosions drawn here (the view's own flash and puffs stand down for them) */
W3.owns = e => e.kind === 'impact' || e.kind === 'crash' || e.kind === 'intercept' || e.kind === 'collision' || (e.kind === 'kill' && e.alt > 0.05) || (e.kind === 'mstat' && e.what === 'hit');
/* an explosion and what it leaves */
function boom(v, w, e, t) {
  const age = t - e.t;
  if (age < 0) return;
  const ground = e.kind === 'impact' || e.kind === 'crash';
  const air = !ground && (e.kind === 'intercept' || (e.kind === 'kill' && e.alt > 0.05) || (e.kind === 'mstat' && e.what === 'hit') || e.kind === 'collision');
  if (!ground && !air) return;
  if (age > (ground ? CFG.colLife + CFG.colPuff : 40)) return;
  const x0 = e.x - v.cx, z0 = e.y - v.cy, y0 = yOf(v, e.x, e.y, e.alt || 0), seed = e.id * 977, L = w.lit;
  const H1 = i => hash(seed + i);
  if (air) {
    // high up the air is thin and a blast spreads wider: a ballistic intercept at 20 km is a bloom you see from the ground
    const s = (e.kind === 'mstat' ? 0.5 : e.sz || 0.7) * (1 + U.clamp(((e.alt || 0) - 3) / 6, 0, 3));
    if (age < 0.18) emit(w.fire, x0, y0, z0, s * 2.2, 1, 0.95, 0.85, 1 - age / 0.18, 0);
    // the fireball
    for (let i = 0; i < 26; i++) {
      const life = 0.8 + 0.7 * H1(i), k = age / life; if (k >= 1) continue;
      const u = H1(i + 50) * 2 - 1, a = H1(i + 90) * 6.283, rr = Math.sqrt(1 - u * u), R = s * 0.28 * (0.4 + H1(i + 130)) * (1 - Math.exp(-age * 7));
      heat(k * 0.95, HC);
      emit(w.fire, x0 + rr * Math.cos(a) * R, y0 + u * R * 0.8 + age * 0.02, z0 + rr * Math.sin(a) * R, s * 0.16 * (0.6 + H1(i + 170)) * (1 + age * 1.6), HC[0], HC[1], HC[2], Math.pow(1 - k, 1.5) * 0.85, H1(i) * 6.28);
    }
    // the dark smoke it leaves, hanging and drifting
    for (let i = 0; i < 20; i++) {
      const a0 = 0.15 + H1(i + 200) * 0.3, a = age - a0; if (a < 0) continue;
      const life = 22 + 12 * H1(i + 210), k = a / life; if (k >= 1) continue;
      const u = H1(i + 220) * 2 - 1, an = H1(i + 230) * 6.283, rr = Math.sqrt(1 - u * u), R = s * 0.3 * (0.3 + H1(i + 240)) * (1 - Math.exp(-a * 3)) + a * 0.004;
      const c = (0.2 + 0.1 * H1(i + 250)) * L;
      emit(w.smoke, x0 + rr * Math.cos(an) * R + w.wx * a, y0 + u * R * 0.7 - a * 0.002, z0 + rr * Math.sin(an) * R + w.wy * a, s * 0.2 * (0.7 + H1(i + 260)) * (1 + Math.sqrt(a) * 0.9), c, c * 0.97, c * 0.94, 0.75 * Math.pow(1 - k, 2), H1(i) * 6.28);
    }
    debris(v, w, e, t, age, x0, y0, z0, s, 12, true);
    return;
  }
  const hk = hitKind(e), k = hk.k * 0.8, gY = H.hT(v, e.x, e.y) * v.hk;
  // the flash, and the light it throws on the ground
  if (age < 0.25) { emit(w.fire, x0, y0 + 0.05, z0, k * 3, 1, 0.92, 0.75, 1 - age / 0.25, 0); emit(w.fire, x0, gY + k * 2.6, z0, k * 6, 1, 0.7, 0.4, 0.5 * (1 - age / 0.25), 0); }
  // the fireball rising, bigger and slower for fuel
  const fbLife = hk.fuel ? 6 : 2.6;
  if (age < fbLife * 1.4) for (let i = 0; i < 60; i++) {
    const life = fbLife * (0.5 + 0.7 * H1(i)), kk = age / life; if (kk >= 1) continue;
    const u = H1(i + 50), a = H1(i + 90) * 6.283, rr = Math.sqrt(1 - u * u), R = k * 0.42 * (0.3 + H1(i + 130)) * (1 - Math.exp(-age * 4));
    heat(0.15 + kk * 0.85, HC);
    // it rolls up and over as it rises: the outside climbs slower than the middle
    const rise = age * 0.1 * k * (hk.fuel ? 1.4 : 1) * (1.2 - rr * 0.6);
    emit(w.fire, x0 + rr * Math.cos(a) * R, y0 + 0.03 + u * R * 0.7 + rise, z0 + rr * Math.sin(a) * R, k * 0.16 * (0.6 + H1(i + 170)) * (1 + age * 0.7), HC[0], HC[1], HC[2], Math.pow(1 - kk, 1.4) * (kk < 0.1 ? 0.9 : 0.7), H1(i) * 6.28);
    // and as it cools it turns to black smoke in the same place
    if (kk > 0.45) { const c = 0.08 * L; emit(w.smoke, x0 + rr * Math.cos(a) * R * 1.1, y0 + 0.05 + u * R * 0.7 + rise * 1.1, z0 + rr * Math.sin(a) * R * 1.1, k * 0.2 * (0.6 + H1(i + 170)) * (1 + age * 0.6), c, c, c, 0.6 * U.clamp((kk - 0.45) * 4, 0, 1), H1(i) * 6.28); }
  }
  // the smoke left where the fireball was, rising and spreading for half a minute
  if (age > fbLife * 0.6 && age < 40) for (let i = 0; i < 18; i++) {
    const a = age - fbLife * 0.6, life = 30 + 10 * H1(i + 600), kk = a / life; if (kk >= 1) continue;
    const an = H1(i + 610) * 6.283, R = k * (0.2 + 0.3 * H1(i + 620)) + a * 0.01, c = (hk.fuel ? 0.06 : 0.14) * L;
    emit(w.smoke, x0 + Math.cos(an) * R + w.wx * a, y0 + k * (0.3 + 0.7 * H1(i + 630)) + a * 0.03 * k, z0 + Math.sin(an) * R + w.wy * a, k * (0.3 + 0.03 * a) * (0.7 + 0.6 * H1(i + 640)), c, c * 0.96, c * 0.92, 0.7 * Math.pow(1 - kk, 1.5), H1(i) * 6.28);
  }
  // the skirt of dust thrown out along the ground
  if (age < 14) for (let i = 0; i < 28; i++) {
    const a = i / 28 * 6.283 + H1(i + 300) * 0.2, R = k * (0.12 + 1.1 * (1 - Math.exp(-age * 2.2))) * (0.8 + 0.3 * H1(i + 310)), kk = age / 14;
    const c = 0.48 * L;
    emit(w.smoke, x0 + Math.cos(a) * R + w.wx * age, gY + 0.02 + k * 0.04 * (1 + age * 0.2), z0 + Math.sin(a) * R + w.wy * age, k * 0.18 * (1 + age * 0.5), c, c * 0.92, c * 0.8, 0.55 * Math.pow(1 - kk, 1.5), H1(i) * 6.28);
  }
  debris(v, w, e, t, age, x0, y0, z0, k, 18, false);
  // fires at the base, the light they throw on the ground, and the column of smoke over them
  const burn = hk.bld || hk.fuel || e.kind === 'crash' ? CFG.colLife : 40;
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
    emit(w.fire, x0, gY + k * (hk.fuel ? 2.2 : 1.1), z0, k * (hk.fuel ? 5 : 2.5), 1, 0.45, 0.12, (0.12 + 0.25 * w.night) * fade, 0);
  }
  const pl = CFG.colPuff, every = hk.fuel ? 0.35 : 0.7, last = Math.min(age, burn);
  const j0 = Math.max(0, Math.ceil((age - pl) / every)), j1 = Math.floor(last / every);
  for (let j = j0; j <= j1; j++) {
    const born = j * every + 0.4, a = age - born; if (a < 0) continue;
    const kk = a / pl; if (kk >= 1) continue;
    const r1 = hash(seed + j * 3), r2 = hash(seed + j * 3 + 1), r3 = hash(seed + j * 3 + 2);
    // it climbs fast at first, slows as it cools, then spreads and leans downwind
    const hgt = k * (0.3 + (hk.fuel ? 22 : 14) * (1 - Math.exp(-a / 80))), lean = Math.min(1, hgt / (10 * k));
    const sz = k * ((hk.fuel ? 0.35 : 0.25) + (hk.fuel ? 0.05 : 0.04) * a) * (0.7 + 0.6 * r3);
    const x = x0 + (r1 - 0.5) * sz * 0.9 + w.wx * a * (0.3 + 1.6 * lean), z = z0 + (r2 - 0.5) * sz * 0.9 + w.wy * a * (0.3 + 1.6 * lean);
    // oily black over fuel, grey-brown over buildings; lit orange from below by the fire at night
    const base = (hk.fuel ? 0.05 + 0.04 * r3 : 0.12 + 0.08 * r3) * L, glow = (0.25 + 0.75 * w.night) * U.clamp(1 - hgt / (k * 4), 0, 1) * (born < burn ? 1 : 0);
    const fade = born > burn - 60 ? U.clamp((burn - born) / 60, 0, 1) : 1;
    emit(w.smoke, x, gY + hgt, z, sz, base + glow * 0.55, base + glow * 0.24, base + glow * 0.07, (hk.fuel ? 0.85 : 0.7) * Math.pow(1 - kk, 1.2) * fade * U.clamp(a / 1.2, 0.35, 1), r1 * 6.28);
  }
}
/* burning pieces thrown out by a blast: each falls under gravity with a smoke trail behind it */
function debris(v, w, e, t, age, x0, y0, z0, s, n, air) {
  if (age > 9) return;
  const seed = e.id * 7577, g = 0.098 * v.hk;   // 9.8 m/s² in world units
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed + i), h2 = hash(seed + i + 40), h3 = hash(seed + i + 80), life = 3 + 5 * h3;
    if (age > life) continue;
    const an = h1 * 6.283, up = air ? h2 * 2 - 0.6 : 0.4 + h2 * 0.9, sp = (0.15 + 0.5 * hash(seed + i + 120)) * Math.max(0.6, s);
    const vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, vy = up * sp * 1.3;
    const at = a => { Q.x = x0 + vx * a + w.wx * a; Q.y = y0 + vy * a - g * a * a / 2; Q.z = z0 + vz * a + w.wy * a; return Q; };
    const gY = H.hT(v, x0 + v.cx, z0 + v.cy) * v.hk;
    // the trail: where it was over the last second and a half
    for (let j = 8; j >= 0; j--) {
      const a = age - j * 0.18; if (a < 0) continue;
      const q = at(a); if (q.y < gY) continue;
      const k = j / 8, c = (0.25 + 0.15 * h3) * w.lit;
      emit(w.smoke, q.x, q.y, q.z, 0.02 + 0.06 * k * Math.max(0.6, s), c, c, c * 0.95, 0.5 * (1 - k) * (1 - age / life), i + j);
    }
    const q = at(age); if (q.y < gY) continue;
    heat(0.3 + 0.6 * age / life, HC);
    emit(w.fire, q.x, q.y, q.z, 0.03 * Math.max(0.6, s), HC[0], HC[1], HC[2], 0.9 * (1 - age / life), i);
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
