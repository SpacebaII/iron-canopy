/* Iron Canopy — the 3D view's picture (brief 40): light, sky, weather, ground detail and the image pipeline for the
   replay and the live view. replay3d.js builds the scene; this file decides how it looks. Loaded with three.js when
   a 3D window first opens (replay3d.js, CFG.fxFiles); nothing in the game or the simulation depends on it, and
   without it the view draws plainly.

   The sun and the moon stand where the game's clock and season put them (44° north; the Career's calendar gives
   the season, other modes late May, when the day runs 05:20–20:10 like the map's daylight). A physically based sky
   (Preetham's model, written here) gives the colour of the sky, of the haze, of the sunlight and of the light from
   the sky, and an environment map made from it that fuselages and glass reflect. Clouds are layers at the
   weather's cloud base, lit by the sun; stars and the moon come out at night; fog is a layer on the ground with the
   weather's real visibility; rain falls in streaks and wets the pavement, which then mirrors the airport's lights;
   snow falls and lies on the grass; storms flash with lightning; tarmac shimmers on a summer afternoon.
   Materials are physically based (paint, metal, glass, grass, concrete), each aircraft carries a painted livery
   texture (panel lines, weathering, its registration), city windows light up at night and apron floodlights throw
   pools of light on the concrete. Near the camera the grass gets mowing stripes, tufts that move in the wind, and
   the forest stands as trees.
   The picture is drawn in high dynamic range and finished in passes: ambient occlusion, depth of field, motion
   blur, bloom, a lens flare, ACES tone mapping, a vignette and film grain, with MSAA. Every effect has a switch in
   a quality preset (IC.FX3D: low, medium, high, ultra), picked from the graphics card and a short frame test.
   Nothing here is made per frame: render targets, materials and meshes are made when a window opens or the preset
   changes, and the environment map again only when the sun has moved a few degrees or the weather changed.

   The light interface for the rest of the view (render3d-life.js and replay3d.js):
   - a material marked with glow(material, k) in replay3d.js (userData.glow = k) is drawn k times brighter than its
     colour: it blooms. Use it for lights, flames, flashes, strobes;
   - v.fxs.night (0 by day, 1 at night), v.fxs.sunDir (a unit vector in the scene), v.fxs.wet, v.fxs.snow,
     v.night and v.light (as before) say what the light is doing, every frame;
   - IC.fx3d.mat('solid' | 'bld' | 'win' | 'pave' | 'ground', o) gives the materials, IC.fx3d.surface(slot) what a
     colour slot is made of. */
(function (IC) {
'use strict';
const U = IC.U;
let THREE = null, R = null;

/* ---------- quality presets ----------
   post: drawn through the HDR passes (otherwise straight to the screen with the tone mapping); msaa: samples; pr:
   the most pixels per CSS pixel; shadow: the shadow map's size (0 none); env: the sky reflected; clouds: layers;
   rain: drops round the camera; grass: tufts; trees a tile; detail: the ground's close-in noise and stripes */
const P = IC.FX3D = {
  low:    { name: 'Low', post: 0, msaa: 0, pr: 1, bloom: 0, ao: 0, dof: 0, mblur: 0, flare: 0, grain: 0, shadow: 0, env: 0, clouds: 1, rain: 2500, grass: 0, trees: 0, detail: 0, shimmer: 0 },
  medium: { name: 'Medium', post: 1, msaa: 4, pr: 1, bloom: 1, ao: 0, dof: 0, mblur: 0, flare: 1, grain: 1, shadow: 2048, env: 1, clouds: 2, rain: 7000, grass: 5000, trees: 1500, detail: 1, shimmer: 1 },
  high:   { name: 'High', post: 1, msaa: 4, pr: 1.5, bloom: 1, ao: 1, dof: 1, mblur: 1, flare: 1, grain: 1, shadow: 2048, env: 1, clouds: 2, rain: 12000, grass: 10000, trees: 3000, detail: 1, shimmer: 1 },
  ultra:  { name: 'Ultra', post: 1, msaa: 4, pr: 2, bloom: 1, ao: 1, dof: 1, mblur: 1, flare: 1, grain: 1, shadow: 4096, env: 1, clouds: 3, rain: 20000, grass: 20000, trees: 6000, detail: 1, shimmer: 1 }
};
const LEVELS = ['low', 'medium', 'high', 'ultra'];
/* switches for looking at one thing at a time (the tools) */
const DBG = { fog: 1, env: 1, post: 1 };

/* the graphics card's name, once a page */
let gpu = null;
function gpuName() {
  if (gpu != null) return gpu;
  gpu = '';
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
    const e = g && g.getExtension && g.getExtension('WEBGL_debug_renderer_info');
    const n = g && g.getParameter ? g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) : '';
    gpu = typeof n === 'string' ? n : '';
    const lose = g && g.getExtension && g.getExtension('WEBGL_lose_context'); if (lose && lose.loseContext) lose.loseContext();
  } catch (e) { gpu = ''; }
  return gpu;
}
/* a first guess from the name: software drawing is Low, integrated graphics Medium, a gaming card High or Ultra */
function guess(name) {
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return 'low';
  if (/rtx ?(40[7-9]0|50[6-9]0|30[89]0)|rx ?(79|78)\d\d|apple m\d (max|ultra)/i.test(name)) return 'ultra';
  if (/rtx|gtx ?1[06-9][6-8]0|radeon ?(rx|pro)|apple m\d|arc a[57]/i.test(name)) return 'high';
  return 'medium';
}
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, x) { try { localStorage.setItem(k, x); } catch (e) { /* private window */ } } };
/* the preset a window starts with: the player's choice, or Auto: what the frame test settled on for this card last
   time, else the guess from its name */
function startLevel() {
  const q = IC.q3d ? IC.q3d.get() : 'auto';
  if (P[q]) return { q, auto: false };
  const was = store.get('ic-3d-auto'), name = gpuName();
  if (was && was.split('|')[1] === name && P[was.split('|')[0]]) return { q: was.split('|')[0], auto: true };
  return { q: guess(name), auto: true };
}

/* ---------- shared shader code ---------- */
const NOISE = `
float fxHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fxNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fxFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * fxNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fxFbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * fxNoise(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }`;
// the vertex and fragment chunks my own materials need to sit in the log depth buffer with everything else
const VHEAD = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const FHEAD = '#include <common>\n#include <logdepthbuf_pars_fragment>\n';

/* grass, wherever a picture paints it (the map's fields, the airfield round the runways): a warmer green than the
   map's, less of the blue sky's light, mowing stripes along the nearest airports' main runway */
const GRASS = `
uniform vec4 fxApt[4];
float fxGrassOf(vec3 c) { return smoothstep(0.02, 0.07, c.g - max(c.r, c.b) * 0.9); }
vec3 fxGrade(vec3 c, float g) { return mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 1.0 + g * 0.25) * mix(vec3(1.03, 1.0, 0.94), vec3(1.1, 1.0, 0.76), g); }
float fxStripe(vec2 w) {
  float k = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 a = fxApt[i]; if (a.z <= 0.0) continue;
    vec2 r = w - a.xy; float in_ = 1.0 - smoothstep(a.z * 0.85, a.z, length(r));
    k += in_ * (step(0.5, fract(dot(r, vec2(-sin(a.w), cos(a.w))) / 0.16)) * 0.11 - 0.055);
  }
  return k;
}`;
const grassIBL = sh => {
  sh.fragmentShader = inc(sh.fragmentShader, 'lights_fragment_maps', '', 'radiance *= 1.0 - fxGrass * 0.6;');
  // no pixel of the ground is a light: nothing undefined or brighter than sunlit snow goes on to glow
  sh.fragmentShader = inc(sh.fragmentShader, 'tonemapping_fragment', 'if (!(gl_FragColor.r == gl_FragColor.r && gl_FragColor.g == gl_FragColor.g && gl_FragColor.b == gl_FragColor.b)) gl_FragColor.rgb = vec3(0.0); gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.3);');
};
/* uniforms every patched material shares by reference: set once a frame, read by all */
const G = {
  fxFog: null, sunDir: null, sunCol: null, ambCol: null, night: { value: 0 }, wet: { value: 0 }, snow: { value: 0 }, time: { value: 0 },
  detail: { value: 1 }, camG: { value: 0 }, apt: { value: [] }, winGlow: { value: 1 }, lm: { value: null }, lmBox: { value: null }
};
/* the fog: density at the ground (x), the ground's height (y), how fast it thins with height (z, world units for a
   factor e), on (w). One object shared by every material's uniforms (three.js copies the wrapper, not this) */
const FOGV = { x: 0, y: 0, z: 10, w: 1 };

/* ---------- setting three.js up, once a page ---------- */
function once() {
  THREE = R.THREE();
  if (IC.fx3d.ready) return;
  IC.fx3d.ready = true;
  Object.assign(G, { sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) }, ambCol: { value: new THREE.Color(0.5, 0.6, 0.7) } });
  G.apt.value = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -1, 0)); G.lmBox.value = new THREE.Vector4(0, 0, 1, 0);
  const SC = THREE.ShaderChunk, SL = THREE.ShaderLib;
  if (!SC || !SL) return;
  // height fog for every material: thick at the ground, thinning upwards, integrated along the line of sight, so
  // a fog bank lies on the airport and the cruise looks down on it
  for (const k in SL) if (SL[k] && SL[k].uniforms && SL[k].uniforms.fogColor) SL[k].uniforms.fxFog = { value: FOGV };
  SC.fog_pars_vertex = '#ifdef USE_FOG\nvarying float vFogDepth;\nvarying float vFogY;\n#endif';
  SC.fog_vertex = `#ifdef USE_FOG
  vFogDepth = length(mvPosition.xyz);
  vec4 fxWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fxWp = instanceMatrix * fxWp;
  #endif
  vFogY = (modelMatrix * fxWp).y;
#endif`;
  SC.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; uniform vec4 fxFog; varying float vFogDepth; varying float vFogY;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
#endif`;
  SC.fog_fragment = `#ifdef USE_FOG
  float fxH0 = max(cameraPosition.y - fxFog.y, -2.0 * fxFog.z), fxH1 = max(vFogY - fxFog.y, -2.0 * fxFog.z), fxDh = (fxH1 - fxH0) / fxFog.z;
  float fxI = abs(fxDh) > 0.001 ? (exp(-fxH0 / fxFog.z) - exp(-fxH1 / fxFog.z)) / fxDh : exp(-fxH0 / fxFog.z);
  float fogFactor = (1.0 - exp(-fxFog.x * vFogDepth * max(fxI, 0.0))) * fxFog.w;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
}

/* ---------- what surfaces are made of ----------
   [roughness, metalness, livery]: the fuselage's paint takes the livery texture; wings are painted metal; glass is
   smooth; everything else (buildings, vehicles, grey military paint) is dull paint */
const SURF = { BODY: [0.3, 0.06, 1], BELLY: [0.34, 0.06, 1], STRIPE: [0.3, 0.06, 1], STRIPE2: [0.3, 0.06, 1], FIN: [0.3, 0.06, 0], ENG: [0.32, 0.25, 0],
  WING: [0.42, 0.5, 0], GLASS: [0.04, 0.1, 0], WIN: [0.06, 0.1, 0], DOOR: [0.36, 0.06, 0], REG: [0.36, 0.06, 0] };
const DULL = [0.72, 0.05, 0], METAL = [0.45, 0.6, 0];
function surface(slot, c) {
  const s = SURF[slot]; if (s) return s;
  // bare metal reads as a light, colourless grey
  if (c && Math.abs(c.r - c.g) < 0.04 && Math.abs(c.g - c.b) < 0.06 && c.r > 0.55 && c.r < 0.85) return METAL;
  return DULL;
}

/* ---------- materials ---------- */
const std = o => new THREE.MeshStandardMaterial(o);
/* adds to a built-in shader: uniforms by reference, text before or after an include */
function patch(m, key, fn) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh); };
  m.customProgramCacheKey = () => key;
  return m;
}
const inc = (src, chunk, before, after) => src.replace(`#include <${chunk}>`, (before || '') + `\n#include <${chunk}>\n` + (after || ''));
const WPOS_V = (sh, extra) => {
  sh.vertexShader = 'varying vec3 vFxW;\nvarying vec3 vFxN;\n' + (extra || '') + sh.vertexShader;
  sh.vertexShader = inc(sh.vertexShader, 'worldpos_vertex', '', `{ vec4 fxw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fxw = instanceMatrix * fxw;
  #endif
  vFxW = (modelMatrix * fxw).xyz; vFxN = normalize(mat3(modelMatrix) * objectNormal); }`);
  sh.fragmentShader = 'varying vec3 vFxW;\nvarying vec3 vFxN;\n' + sh.fragmentShader;
};
const useG = (sh, ...ks) => { for (const k of ks) sh.uniforms['fx' + k[0].toUpperCase() + k.slice(1)] = G[k]; };
/* the surface's own roughness and metalness from the pbr attribute (0 roughness: the material's own) */
function pbrPatch(sh) {
  sh.vertexShader = 'attribute vec3 pbr;\nvarying vec3 vPbr;\n' + sh.vertexShader;
  sh.vertexShader = inc(sh.vertexShader, 'begin_vertex', '', 'vPbr = pbr;');
  sh.fragmentShader = 'varying vec3 vPbr;\n' + sh.fragmentShader;
  sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x > 0.0 ? vPbr.x : roughness;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.x > 0.0 ? vPbr.y : metalness;');
}
/* glass and windows: dark and smooth by day, reflecting the sky; lit from inside at dusk and at night */
function winMaterial() {
  const m = std({ color: '#1c252e', roughness: 0.06, metalness: 0.2, emissive: '#ffcf86', emissiveIntensity: 0 });
  m.userData.fxWin = true;
  return m;
}
/* city blocks: windows by floor and bay on the walls, a share of them lit at night */
function bldMaterial() {
  const m = std({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  return patch(m, 'fx-bld', sh => {
    useG(sh, 'night', 'winGlow'); WPOS_V(sh);
    sh.fragmentShader = 'uniform float fxNight; uniform float fxWinGlow;\n' + NOISE + sh.fragmentShader;
    sh.fragmentShader = inc(sh.fragmentShader, 'emissivemap_fragment', '', `{
      vec3 n = normalize(vFxN);
      if (abs(n.y) < 0.4 && fxNight > 0.01) {
        vec2 t = normalize(vec2(-n.z, n.x));
        float along = dot(vFxW.xz, t), fl = floor(vFxW.y / 0.034), bay = floor(along / 0.03);
        vec2 f = vec2(fract(along / 0.03), fract(vFxW.y / 0.034));
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.3, f.y) * step(f.y, 0.85);
        float lit = step(fxHash(vec2(bay * 1.37 + fl * 0.11, fl * 3.1 + floor(vFxW.x * 0.3))), 0.34);
        float warm = fxHash(vec2(bay, fl + 7.0));
        totalEmissiveRadiance += win * lit * fxNight * fxWinGlow * mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.85, 1.0), step(0.8, warm)) * 1.6;
      }
    }`);
  });
}
/* the solid parts of models: paint, metal and glass by the colour slot */
function solidMaterial() {
  return patch(std({ vertexColors: true, roughness: 0.7, metalness: 0.05 }), 'fx-solid', sh => { pbrPatch(sh); floodPatch(sh); });
}
/* at night, what stands on the apron is lit by its floodlights: the nearest airport's pools of light, from above */
function floodPatch(sh) {
  if (!/vFxW/.test(sh.vertexShader)) WPOS_V(sh);
  useG(sh, 'night', 'lm', 'lmBox');
  sh.fragmentShader = 'uniform float fxNight; uniform sampler2D fxLm; uniform vec4 fxLmBox;\n' + sh.fragmentShader;
  sh.fragmentShader = inc(sh.fragmentShader, 'emissivemap_fragment', '', `if (fxLmBox.w > 0.0 && fxNight > 0.01) { vec2 u = (vFxW.xz - fxLmBox.xy) / fxLmBox.z;
    if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0) totalEmissiveRadiance += diffuseColor.rgb * texture2D(fxLm, vec2(u.x, 1.0 - u.y)).rgb * fxNight * (0.5 + 0.7 * max(vFxN.y, 0.0)) * 1.6; }`);
}
/* the ground's tiles: the map's picture, with grain close in, mowing stripes round airports, snow lying, a wet sheen */
function groundMaterial(o) {
  const m = std(Object.assign({ roughness: 0.95, metalness: 0 }, o));
  m.userData.fxGround = true;
  return patch(m, 'fx-ground', sh => {
    useG(sh, 'snow', 'wet', 'detail', 'apt', 'camG'); WPOS_V(sh);
    sh.fragmentShader = 'uniform float fxSnow; uniform float fxWet; uniform float fxDetail;\n' + NOISE + GRASS + sh.fragmentShader;
    grassIBL(sh);
    sh.fragmentShader = inc(sh.fragmentShader, 'map_fragment', 'float fxGrass = 0.0;', `{
      // the map's own marks (white airport and town glyphs far out) are not brighter than concrete
      diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.45));
      vec3 c = diffuseColor.rgb;
      float d = length(vFxW - cameraPosition);
      vec2 q = mod(vFxW.xz, 400.0);
      float grass = fxGrassOf(c); fxGrass = grass;
      diffuseColor.rgb = fxGrade(c, grass);
      if (fxDetail > 0.0) {
        // grain close in, at two scales, fading out by a few km
        float near = 1.0 - smoothstep(4.0, 40.0, d);
        float n1 = fxFbm3(q * 9.0), n2 = fxNoise(q * 70.0);
        diffuseColor.rgb *= mix(1.0, 0.82 + 0.36 * n1, near * 0.9) * mix(1.0, 0.9 + 0.2 * n2, near * (1.0 - smoothstep(0.5, 4.0, d)));
        // mowing stripes on the airfield grass, along its main runway
        diffuseColor.rgb *= 1.0 + grass * fxStripe(vFxW.xz) * (1.0 - smoothstep(10.0, 60.0, d));
      }
      // snow lying on open ground; thinner on slopes and where the map shows dark forest
      float lie = fxSnow * smoothstep(0.55, 0.85, vFxN.y) * (0.75 + 0.25 * fxFbm3(q * 3.0));
      lie *= mix(0.55, 1.0, smoothstep(0.06, 0.16, dot(c, vec3(0.33))));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), clamp(lie, 0.0, 1.0));
      diffuseColor.rgb *= 1.0 - fxWet * 0.25 * (1.0 - lie);
    }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness - fxWet * 0.2 - fxSnow * 0.2;');
  });
}
/* pavement: concrete or asphalt from its picture; wet it is dark and glossy with puddles; snow in drifts at the
   edges; at night the floodlights' pools of light (the airport's light map, set in airport()) */
function paveMaterial(o) {
  const m = std(Object.assign({ roughness: 0.82, metalness: 0 }, o));
  m.userData.fxPave = true;
  m.userData.lm = { value: null }; m.userData.lmBox = { value: new THREE.Vector4(0, 0, 1, 0) }; m.userData.pad = { value: 0 };
  return patch(m, 'fx-pave', sh => {
    useG(sh, 'snow', 'wet', 'night', 'detail', 'apt'); WPOS_V(sh);
    sh.uniforms.fxLm = m.userData.lm; sh.uniforms.fxLmBox = m.userData.lmBox; sh.uniforms.fxPad = m.userData.pad;
    sh.fragmentShader = 'uniform float fxSnow; uniform float fxWet; uniform float fxNight; uniform float fxDetail; uniform sampler2D fxLm; uniform vec4 fxLmBox; uniform float fxPad;\n' + NOISE + GRASS + sh.fragmentShader;
    grassIBL(sh);
    sh.fragmentShader = inc(sh.fragmentShader, 'map_fragment', 'float fxGrass = 0.0;', `
      fxGrass = fxGrassOf(diffuseColor.rgb);
      // the airport's picture is a square: its grass gives way to the country's in a ragged ring, not a straight edge
      if (fxPad > 0.0 && fxGrass > 0.3) { vec2 pu = (vFxW.xz - fxLmBox.xy) / fxLmBox.z - 0.5; if (length(pu) * 2.0 > 0.72 + 0.22 * fxFbm3(vFxW.xz * 0.35)) discard; }
      if (fxGrass > 0.0) diffuseColor.rgb = fxGrade(diffuseColor.rgb, fxGrass) * (1.0 + fxGrass * fxStripe(vFxW.xz) * (1.0 - smoothstep(10.0, 60.0, length(vFxW - cameraPosition))));
      vec2 fxQ = mod(vFxW.xz, 400.0);
      float fxD = length(vFxW - cameraPosition);
      float fxPud = smoothstep(0.52, 0.68, fxFbm3(fxQ * 4.0)) * fxWet * (1.0 - fxGrass);
      if (fxDetail > 0.0) diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * fxNoise(fxQ * 60.0), 1.0 - smoothstep(0.5, 6.0, fxD));
      diffuseColor.rgb *= 1.0 - fxWet * mix(0.35 + 0.25 * fxPud, 0.2, fxGrass);
      float fxSn = fxSnow * mix(smoothstep(0.62, 0.8, fxFbm3(fxQ * 2.5)) * 0.8, 0.8 + 0.15 * fxFbm3(fxQ * 3.0), fxGrass);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.9), fxSn);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(roughness, mix(0.3, 0.06, fxPud), fxWet) + fxSn * 0.1, 0.95, fxGrass);');
    sh.fragmentShader = inc(sh.fragmentShader, 'emissivemap_fragment', '', `if (fxLmBox.w > 0.0 && fxNight > 0.01) { vec2 u = (vFxW.xz - fxLmBox.xy) / fxLmBox.z; if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0) totalEmissiveRadiance += diffuseColor.rgb * texture2D(fxLm, vec2(u.x, 1.0 - u.y)).rgb * fxNight * 1.5; }`);
  });
}
/* a material that gives light: k times brighter than its colour (it blooms) */
function glow(m) {
  const k = m.userData.glow || 1;
  return patch(m, 'fx-glow' + k, sh => { sh.fragmentShader = inc(sh.fragmentShader, 'tonemapping_fragment', `gl_FragColor.rgb *= ${k.toFixed(2)};`); });
}

/* ---------- liveries: painted once per model and airline ----------
   The texture is a side view of the fuselage in two halves (the right side, then the left, whose writing is turned
   so it reads from that side): panel lines, darker weathering along the belly and round the doors, the
   registration by the tail. It lies on the painted fuselage only, facing sideways, from the model's own axes */
function livery(key, liv, me, Pt) {
  // the fuselage's length and height, from the painted body's vertices (metres; the scene is in hundreds of them)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const n in me.groups) {
    const g = me.groups[n]; if (g.kind) continue;
    for (let i = 0; i < g.col.length; i++) { const s = me.slots[g.col[i]]; if (s !== 'BODY' && s !== 'BELLY') continue; const x = g.pos[i * 3], z = g.pos[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  }
  if (x1 <= x0) return null;
  const W = 1024, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), L = x1 - x0, Hh = z1 - z0, rnd = R.seeded(U.hash(key.length * 131 + (liv ? parseInt(liv[0].slice(1), 16) : 7) % 99991, 3) * 1e6 | 0);
  const reg = (liv ? 'CX-' : 'CN-') + String.fromCharCode(65 + (rnd() * 26 | 0), 65 + (rnd() * 26 | 0), 65 + (rnd() * 26 | 0));
  for (const half of [0, 1]) {
    const y0 = half * H / 2, h = H / 2, X = u => half ? W - u : u;   // the left side runs nose to tail the other way
    g.save(); g.beginPath(); g.rect(0, y0, W, h); g.clip();
    // panel lines: frames every 0.5 m or so, and lap joints along the length
    g.fillStyle = 'rgba(20,26,32,0.16)';
    for (let x = 0; x < L; x += 0.53 * (L > 30 ? 1 : 0.7)) g.fillRect(X(x / L * W), y0, 1, h);
    g.fillStyle = 'rgba(20,26,32,0.12)'; for (const f of [0.28, 0.5, 0.74]) g.fillRect(0, y0 + f * h, W, 1);
    // weathering: the belly darker, streaks behind the wing root
    const gr = g.createLinearGradient(0, y0 + h, 0, y0 + h * 0.6); gr.addColorStop(0, 'rgba(60,54,46,0.28)'); gr.addColorStop(1, 'rgba(60,54,46,0)'); g.fillStyle = gr; g.fillRect(0, y0 + h * 0.6, W, h * 0.4);
    for (let i = 0; i < 40; i++) { const x = (0.35 + rnd() * 0.3) * W, w = 2 + rnd() * 10; g.fillStyle = `rgba(50,46,40,${0.03 + rnd() * 0.05})`; g.fillRect(X(x), y0 + h * (0.55 + rnd() * 0.2), w, h * 0.4); }
    // the registration by the tail, in the airline's second colour or dark grey
    g.fillStyle = liv && liv[1] && liv[2] !== 'ga' ? liv[1] : '#2a3038';
    const fs = Math.max(10, Math.min(h * 0.16, W * 1.8 / L)), rx = 0.8 * W;
    g.font = `700 ${fs | 0}px sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.save(); g.translate(X(rx), y0 + h * 0.34); g.fillText(reg, 0, 0); g.restore();
    g.restore();
  }
  const tex = R.texSRGB(new THREE.CanvasTexture(cv)); tex.anisotropy = 8;
  const m = std({ vertexColors: true, roughness: 0.3, metalness: 0.06 });
  m.userData.keep = true;
  const box = { value: new THREE.Vector4(x0 * 0.01, z0 * 0.01, L * 0.01, Hh * 0.01) }, map = { value: tex };
  return patch(m, 'fx-livery', sh => {
    pbrPatch(sh); floodPatch(sh);
    sh.uniforms.fxLiv = map; sh.uniforms.fxLivBox = box;
    sh.vertexShader = 'varying vec3 vFxO;\nvarying vec3 vFxON;\n' + sh.vertexShader;
    sh.vertexShader = inc(sh.vertexShader, 'begin_vertex', '', 'vFxO = position; vFxON = normal;');
    sh.fragmentShader = 'uniform sampler2D fxLiv; uniform vec4 fxLivBox; varying vec3 vFxO; varying vec3 vFxON;\n' + sh.fragmentShader;
    sh.fragmentShader = inc(sh.fragmentShader, 'color_fragment', '', `if (vPbr.z > 0.5) {
      float side = vFxON.z, u = (vFxO.x - fxLivBox.x) / fxLivBox.z, h = clamp((vFxO.y - fxLivBox.y) / fxLivBox.w, 0.0, 1.0);
      vec4 L = texture2D(fxLiv, vec2(u, side > 0.0 ? 1.0 - h * 0.5 : 0.5 - h * 0.5));
      diffuseColor.rgb = mix(diffuseColor.rgb, L.rgb, L.a * smoothstep(0.15, 0.6, abs(side)));
    }`);
  });
}

/* ---------- the sun, the moon and the sky ---------- */
const LAT = 44 * Math.PI / 180;
/* the sun's direction in the scene (x east, y up, z south) at game time t */
function sunAt(S, t, out) {
  const h = ((t % 86400) + 86400) % 86400 / 3600;
  let doy = 140;
  if (S.mode === 'story' && S.cal && IC.calAt) { const c = IC.calAt(S, t); doy = (c.mo * 30.44 + (c.d - 0.5) / c.dpm * 30.44 + 1) % 365; }
  const dec = 0.4091 * Math.sin(2 * Math.PI * (doy - 81) / 365), H = (h - 12.75) * Math.PI / 12;
  const e = -Math.cos(dec) * Math.sin(H), n = Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.cos(H) * Math.sin(LAT), u = Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(H) * Math.cos(LAT);
  return out.set(e, u, -n);
}
/* the moon: about opposite the sun at full moon, a day's step round the sky each day */
function moonAt(S, t, out) {
  const age = (((t / 86400) % 29.53) + 29.53) % 29.53 / 29.53, h = ((t % 86400) + 86400) % 86400 / 3600;
  const H = (h - 12.75) * Math.PI / 12 - age * 2 * Math.PI + Math.PI, dec = 0.25 * Math.sin(age * 6.283);
  const e = -Math.cos(dec) * Math.sin(H), n = Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.cos(H) * Math.sin(LAT), u = Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(H) * Math.cos(LAT);
  return out.set(e, u, -n);
}
/* Preetham's daylight model, the parts that give colour: the same numbers as the sky's shader */
const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5], MIEC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const SKY = { turb: 2.4, ray: 2.2, mie: 0.005, g: 0.8 };
function skyParams(cover, fog) {
  return { turb: 2.2 + cover * 5 + fog * 6, ray: 2.2 + cover * 0.8, mie: 0.004 + cover * 0.01 + fog * 0.02, g: 0.8 };
}
function extinction(cosZ, K, out) {
  const z = Math.acos(U.clamp(cosZ, 0, 1)), inv = 1 / (Math.cos(z) + 0.15 * Math.pow(93.885 - z * 180 / Math.PI, -1.253));
  const c = 0.2 * K.turb * 10e-18;
  for (let i = 0; i < 3; i++) out[i] = Math.exp(-(TR[i] * K.ray * 8.4e3 * inv + 0.434 * c * MIEC[i] * K.mie * 1.25e3 * inv));
  return out;
}
const EX = [0, 0, 0], EX0 = [0, 0, 0];
/* the sunlight's colour after the air it crosses: white-gold high up, orange and red low down */
function sunColour(sy, K, out) {
  extinction(Math.max(0.02, sy), K, EX); extinction(1, K, EX0);
  return out.setRGB(EX[0] / EX0[0], EX[1] / EX0[1], EX[2] / EX0[2]);
}
const SKY_V = VHEAD + `
uniform vec3 sunDir; uniform float rayleigh; uniform float turbidity; uniform float mieCoef;
varying vec3 vWp; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
  float zc = clamp(sunDir.y, -1.0, 1.0);
  vSunE = 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - acos(zc)) / 1.5)));
  vBetaR = totalRayleigh * rayleigh;
  vBetaM = 0.434 * (0.2 * turbidity * 10E-18) * MieConst * mieCoef;
}`;
const SKY_F = FHEAD + NOISE + `
uniform vec3 sunDir; uniform vec3 moonDir; uniform float mieG; uniform float gain; uniform float night; uniform float cover;
uniform vec3 fogCol; uniform float fogK; uniform float flash; uniform vec3 nightCol; uniform float moonK; uniform vec3 ovc;
varying vec3 vWp; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vWp - cameraPosition);
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - zen * 57.29578, -1.253));
  vec3 Fex = exp(-(vBetaR * 8.4E3 * inv + vBetaM * 1.25E3 * inv));
  float ct = dot(dir, sunDir);
  float rPh = 0.05968310365946075 * (1.0 + pow(ct * 0.5 + 0.5, 2.0));
  float g2 = mieG * mieG, mPh = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * mieG * ct + g2, 1.5));
  vec3 bt = (vBetaR * rPh + vBetaM * mPh) / (vBetaR + vBetaM);
  vec3 Lin = pow(vSunE * bt * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * bt * Fex, vec3(0.5)), clamp(pow(1.0 - sunDir.y, 5.0), 0.0, 1.0));
  float disk = smoothstep(0.99995, 0.99998, ct) * (1.0 - smoothstep(0.55, 0.85, cover));
  vec3 col = (Lin + vec3(0.1) * Fex) * 0.04 * gain;
  // the glow round a low sun is kept within what a camera shows
  col /= 1.0 + dot(col, vec3(0.2126, 0.7152, 0.0722)) / 2.0;
  col += min(vSunE * Fex * disk * 2.0, vec3(80.0)) * max(sunDir.y + 0.05, 0.0);
  // below the horizon the haze; overcast greys the sky; the night's own dark blue, the moon's glow
  // under cloud the sky is one even grey (and so is what glass and wet pavement mirror of it)
  col = mix(col, ovc, smoothstep(0.3, 0.9, cover));
  vec3 nc = nightCol * (0.6 + 0.4 * (1.0 - dir.y));
  float md = max(0.0, dot(dir, moonDir));
  nc += vec3(0.5, 0.6, 0.8) * (pow(md, 400.0) * 0.4 + pow(md, 12.0) * 0.02) * moonK * (1.0 - cover);
  nc += vec3(1.6, 1.62, 1.55) * smoothstep(0.99985, 0.99992, md) * moonK * (1.0 - cover * 0.9);
  col = col + (nc + vec3(0.03, 0.022, 0.014) * cover) * night;
  col += vec3(0.7, 0.72, 0.9) * flash * (0.5 + 0.5 * cover);
  // down to the horizon the sky goes into the haze (and all of it in fog)
  float h = 1.0 - smoothstep(0.0, 0.1 + fogK * 0.8, dir.y);
  col = mix(col, fogCol, clamp(max(h * h, fogK), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/* the same sky's colour in one direction, on the page's side: for the haze and the light from the sky */
const SV = [0, 0, 0], BR = [0, 0, 0], BM = [0, 0, 0];
function skyRGB(dx, dy, dz, sd, K, gain, out) {
  const zc = U.clamp(sd.y, -1, 1), sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
  for (let i = 0; i < 3; i++) { BR[i] = TR[i] * K.ray; BM[i] = 0.434 * (0.2 * K.turb * 10e-18) * MIEC[i] * K.mie; }
  const zen = Math.acos(Math.max(0, dy)), inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - zen * 57.29578, -1.253));
  const ct = dx * sd.x + dy * sd.y + dz * sd.z, rPh = 0.05968310365946075 * (1 + Math.pow(ct * 0.5 + 0.5, 2));
  const g2 = K.g * K.g, mPh = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * K.g * ct + g2, 1.5)), k5 = U.clamp(Math.pow(1 - sd.y, 5), 0, 1);
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(BR[i] * 8.4e3 * inv + BM[i] * 1.25e3 * inv)), bt = (BR[i] * rPh + BM[i] * mPh) / (BR[i] + BM[i]);
    let Lin = Math.pow(sunE * bt * (1 - Fex), 1.5); Lin *= 1 + (Math.pow(sunE * bt * Fex, 0.5) - 1) * k5;
    SV[i] = (Lin + 0.1 * Fex) * 0.04 * gain;
  }
  return out.setRGB(SV[0], SV[1], SV[2]);
}

/* ---------- the window's picture: built when it opens ---------- */
const FSQ = () => R.share('fx:fsq', () => R.geom(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), null, null, new Float32Array([0, 0, 2, 0, 0, 2])));
function shaderMat(o) {
  const m = new THREE.ShaderMaterial(Object.assign({ depthTest: false, depthWrite: false }, o));
  return m;
}
const QUAD_V = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/* the view's canvas: always smoothed (the Low preset draws straight to it) */
function canvasAA() { return true; }
function init(v) {
  once();
  const st = startLevel(), r = v.renderer;
  v.fxs = { q: st.q, Q: P[st.q], auto: st.auto, made: 0, frame: 0, probe: st.auto ? { n: 0, ms: [] } : null, flash: 0, flashT: 0, bolt: 0, envKey: '', envT: -1e9,
    look: {}, msRing: new Float32Array(64), sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0), night: 0, wet: 0, snow: 0, tv: new THREE.Vector3(), tv2: new THREE.Vector3(), tv3: new THREE.Vector3(), size: new THREE.Vector2(), objs: [] };
  if (THREE.ACESFilmicToneMapping) r.toneMapping = THREE.ACESFilmicToneMapping;
  if (THREE.SRGBColorSpace) r.outputColorSpace = THREE.SRGBColorSpace;
  if (r.shadowMap) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
  if (r.info) r.info.autoReset = false;
  G.detail.value = v.fxs.Q.detail;
  applyPR(v);
}
const applyPR = v => { const r = v.renderer; if (r.setPixelRatio) r.setPixelRatio(Math.min(v.fxs.Q.pr, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)); };

/* the scene's light, sky and weather, after replay3d.js has built its base (sceneBase) */
function scene(v) {
  const F = v.fxs, sc = v.scene, Q = F.Q;
  // the sky dome replaces the plain one; the ground beyond the tiles takes the ground's colour at the horizon
  sc.remove(v.sky); v.sky.geometry.dispose(); v.sky.material.dispose();
  F.skyU = { sunDir: G.sunDir, moonDir: { value: F.moonDir }, rayleigh: { value: SKY.ray }, turbidity: { value: SKY.turb }, mieCoef: { value: SKY.mie }, mieG: { value: SKY.g }, gain: { value: 0.3 }, night: G.night,
    cover: { value: 0 }, ovc: { value: new THREE.Color() }, fogCol: { value: new THREE.Color() }, fogK: { value: 0 }, flash: { value: 0 }, nightCol: { value: new THREE.Color(0.006, 0.011, 0.028) }, moonK: { value: 1 } };
  F.skyMat = new THREE.ShaderMaterial({ uniforms: F.skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.DoubleSide, depthWrite: false, fog: false });
  v.sky = new THREE.Mesh(R.sphereG(), F.skyMat); v.sky.scale.setScalar(30000); v.sky.renderOrder = -10; v.sky.frustumCulled = false; v.sky.userData.keep = true; sc.add(v.sky);
  F.envSky = new THREE.Mesh(R.sphereG(), F.skyMat); F.envSky.scale.setScalar(1000); F.envSky.userData.keep = true;
  sc.background = null;
  if (v.beyond) v.beyond.material.dispose(), v.beyond.material = Object.assign(std({ color: '#5a6448', roughness: 1 }), { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.GreaterStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  // the fog replaces the linear haze: the numbers come from the sky every frame
  sc.fog = new THREE.Fog(new THREE.Color(0.5, 0.6, 0.7), 1, 2);
  // the light: sunlight or moonlight, the sky's light (the environment map), a little from the ground
  v.sun.castShadow = false; sc.add(v.sun.target);
  v.hemi.intensity = 0.3;
  build(v);
  v.fxOn = true;
}
const dropObj = o => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); if (o.material && !o.userData.keepMat) o.material.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); };
/* what depends on the preset: made again when it changes */
function build(v) {
  const F = v.fxs, Q = F.Q, sc = v.scene;
  // shadows round what the camera looks at
  const L = v.sun;
  if (L.shadow) {
    if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
    L.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512); L.shadow.bias = -0.0004; L.shadow.normalBias = 0.002; F.shExt = 0;
  }
  // the environment map: the sky, blurred for rough surfaces
  if (Q.env && THREE.PMREMGenerator && !F.pmrem) { F.pmrem = new THREE.PMREMGenerator(v.renderer); F.envScene = new THREE.Scene(); F.envScene.add(F.envSky); }
  F.envKey = '';
  // clouds, rain and snow, lightning, grass, reflections of the lights on wet pavement
  for (const o of F.objs) { sc.remove(o); o.traverse(dropObj); }
  F.objs = [];
  const add = o => { o.frustumCulled = false; sc.add(o); F.objs.push(o); F.made++; return o; };
  F.clouds = [];
  const layers = [[1, 0], [2.4, 1], [26, 2]].slice(0, Q.clouds);   // the base, a layer above it, cirrus
  for (const [k, kind] of layers) F.clouds.push(add(cloudLayer(F, k, kind)));
  F.rain = add(rainMesh(F, Q.rain)); F.snowP = add(snowMesh(F, Math.round(Q.rain * 0.6)));
  F.bolt = add(boltMesh());
  F.grass = Q.grass ? add(grassMesh(F, Q.grass)) : null;
  F.stars = add(starMesh());
  F.cars = Q.grass ? add(carsMesh(F, Q.grass > 8000 ? 900 : 500)) : null;
  post(v);
}

/* ---------- clouds: a layer at the cloud base, one above it, and high cirrus ---------- */
const CLOUD_F = FHEAD + NOISE + `
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 ambCol; uniform vec3 fogCol; uniform float cover; uniform float kind; uniform float time;
uniform vec2 wind; uniform float storm; uniform float flash; uniform vec3 flashAt; uniform float fade; uniform float night;
varying vec3 vWp;
float dens(vec2 p) {
  float n = kind > 1.5 ? fxFbm(p * vec2(0.6, 2.4)) : fxFbm(p);
  float c = kind > 1.5 ? cover * 0.6 : cover;
  return smoothstep(1.02 - c, 1.2 - c * 0.55, n + (kind > 0.5 ? 0.0 : storm * 0.12));
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = (vWp.xz + wind * time) * (kind > 1.5 ? 0.0012 : kind > 0.5 ? 0.0035 : 0.006);
  float d = dens(p);
  if (d < 0.01) discard;
  vec3 V = normalize(vWp - cameraPosition);
  float below = step(cameraPosition.y, vWp.y);
  // lit side toward the sun: the density a step toward it against here
  float d2 = dens(p + sunDir.xz * 0.12);
  float lit = clamp(0.62 + (d - d2) * 2.2, 0.0, 1.0);
  float thick = mix(1.0, 0.32 + 0.35 * (1.0 - d), below) * (1.0 - storm * 0.55 * below);
  vec3 c = sunCol * lit * thick * max(0.0, sunDir.y + 0.08) * 2.4 + ambCol * mix(0.9, 0.6, below * d);
  // bright edges toward the sun (from below), and the lightning inside
  c += sunCol * pow(max(dot(V, sunDir), 0.0), 10.0) * (1.0 - d) * 2.0 * below * (1.0 - cover * 0.8);
  c += vec3(0.8, 0.82, 1.0) * flash * 6.0 * exp(-length(vWp.xz - flashAt.xz) / 60.0);
  c += vec3(0.05, 0.036, 0.022) * night * below * (0.5 + 0.5 * d);   // the towns' light on the cloud's underside
  float dist = length(vWp.xz - cameraPosition.xz);
  float a = d * (kind > 1.5 ? 0.55 : 0.97) * (1.0 - smoothstep(fade * 0.45, fade, dist)) * smoothstep(0.01, 0.12, abs(V.y));
  // far away and low on the horizon it goes into the haze
  float hz = clamp(dist / fade, 0.0, 1.0);
  c = mix(c, fogCol, hz * hz * 0.9);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const CLOUD_V = VHEAD + 'varying vec3 vWp;\nvoid main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;\n#include <logdepthbuf_vertex>\n}';
function cloudLayer(F, k, kind) {
  const u = { sunDir: G.sunDir, sunCol: G.sunCol, ambCol: G.ambCol, fogCol: F.skyU.fogCol, cover: { value: 0.3 }, kind: { value: kind }, time: G.time, wind: { value: new THREE.Vector2() }, storm: { value: 0 },
    flash: F.skyU.flash, flashAt: { value: new THREE.Vector3() }, fade: { value: 3000 }, night: G.night };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: CLOUD_V, fragmentShader: CLOUD_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(R.geom(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), null, null, null, new Uint16Array([0, 2, 1, 0, 3, 2])), m);
  mesh.userData.k = k; mesh.renderOrder = kind === 2 ? -8 : -7 + kind;
  return mesh;
}

/* ---------- rain, snow, lightning, stars ---------- */
const RAIN_V = VHEAD + `
attribute vec4 seed; uniform float time; uniform vec3 box; uniform vec3 fall; uniform float len;
varying float vA;
void main() {
  vec3 o = vec3(seed.x, seed.y, seed.z) * box;
  vec3 p = mod(o + fall * time - cameraPosition, box) - box * 0.5 + cameraPosition;
  p -= normalize(fall) * len * seed.w;
  vA = 1.0 - seed.w * 0.9;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;
const RAIN_F = FHEAD + `uniform vec3 col; uniform float amt; varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, vA * amt);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function rainMesh(F, n) {
  const seed = new Float32Array(n * 8), rnd = R.seeded(91);
  for (let i = 0; i < n; i++) { const x = rnd(), y = rnd(), z = rnd(); seed.set([x, y, z, 0, x, y, z, 1], i * 8); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  F.rainU = { time: G.time, box: { value: new THREE.Vector3(1.2, 0.8, 1.2) }, fall: { value: new THREE.Vector3(0, -0.09, 0) }, len: { value: 0.012 }, col: { value: new THREE.Color(0.6, 0.65, 0.72) }, amt: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: F.rainU, vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, fog: false });
  const o = new THREE.LineSegments(g, m); o.visible = false; o.renderOrder = 20;
  return o;
}
const SNOW_V = VHEAD + `
attribute vec4 seed; uniform float time; uniform vec3 box; uniform vec3 fall; uniform float px;
void main() {
  vec3 o = seed.xyz * box;
  vec3 p = mod(o + fall * time - cameraPosition, box) - box * 0.5 + cameraPosition;
  p.x += sin(time * 1.3 + seed.w * 6.28) * 0.004; p.z += cos(time * 1.1 + seed.w * 5.1) * 0.004;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(px * (0.6 + seed.w * 0.8) / -mv.z, 1.0, 14.0);
  #include <logdepthbuf_vertex>
}`;
const SNOW_F = FHEAD + `uniform vec3 col; uniform float amt;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
  gl_FragColor = vec4(col, amt * (1.0 - r * 1.6));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function snowMesh(F, n) {
  const seed = new Float32Array(n * 4), rnd = R.seeded(57);
  for (let i = 0; i < n * 4; i++) seed[i] = rnd();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  F.snowU = { time: G.time, box: { value: new THREE.Vector3(1.2, 0.8, 1.2) }, fall: { value: new THREE.Vector3(0, -0.012, 0) }, px: { value: 0.05 }, col: { value: new THREE.Color(0.9, 0.92, 0.95) }, amt: { value: 0 } };
  const o = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: F.snowU, vertexShader: SNOW_V, fragmentShader: SNOW_F, transparent: true, depthWrite: false, fog: false }));
  o.visible = false; o.renderOrder = 20;
  return o;
}
/* a lightning bolt: a forked line from the cloud base to the ground, 1 unit tall (scaled to the base) */
function boltMesh() {
  const rnd = R.seeded(1771), P = [];
  const walk = (x, y, z, n, dy) => { for (let i = 0; i < n; i++) { const nx = x + (rnd() - 0.5) * 0.12, nz = z + (rnd() - 0.5) * 0.12, ny = y - dy * (0.6 + rnd() * 0.8); P.push(x, y, z, nx, Math.max(0, ny), nz); x = nx; y = Math.max(0, ny); z = nz; if (rnd() < 0.18 && y > 0.3) walk(x, y, z, 4 + (rnd() * 4 | 0), dy * 0.8); if (y <= 0) break; } };
  walk(0, 1, 0, 40, 0.035);
  const m = R.glow(new THREE.LineBasicMaterial({ color: '#dfe6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 12);
  const o = new THREE.LineSegments(R.geom(new Float32Array(P)), m); o.visible = false; o.renderOrder = 15;
  return o;
}
const STAR_V = VHEAD + `attribute float mag; uniform float night; uniform float time; varying float vB;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; gl_PointSize = 1.0 + mag * 1.6;
  vB = night * (0.25 + mag) * (0.8 + 0.2 * sin(time * 3.0 + position.x * 91.0)) * smoothstep(-0.02, 0.15, position.y);
  #include <logdepthbuf_vertex>
}`;
const STAR_F = FHEAD + `varying float vB; uniform float cover;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5); if (r > 0.5 || vB < 0.01) discard;
  gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * vB * (1.0 - cover) * 1.4, 1.0) * (1.0 - r * 2.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function starMesh() {
  const n = 2400, pos = new Float32Array(n * 3), mag = new Float32Array(n), rnd = R.seeded(4401);
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u); pos.set([r * Math.cos(a), Math.abs(u), r * Math.sin(a)], i * 3); mag[i] = Math.pow(rnd(), 6); }
  const g = R.geom(pos); g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const o = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { night: G.night, time: G.time, cover: { value: 0 } }, vertexShader: STAR_V, fragmentShader: STAR_F, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
  o.scale.setScalar(20000); o.renderOrder = -9;
  return o;
}

/* ---------- grass tufts round the camera, on the airfield's grass only ----------
   A field of tufts that stays still on the ground as the camera moves (each wraps round a square about the camera);
   the airport's own picture (its pad, where the pavement is) keeps them off runways and aprons; the wind bends them */
const GRASS_V = VHEAD + NOISE + `
attribute vec4 seed; uniform vec3 camAt; uniform float area; uniform float gy; uniform vec4 apt; uniform sampler2D pad; uniform vec4 padBox;
uniform vec2 wind; uniform float time; uniform float hk; uniform vec3 sunDir;
varying vec3 vC; varying float vK;
void main() {
  vec2 c = camAt.xz + (fract(seed.xy - camAt.xz / area) - 0.5) * area;
  float d = length(c - camAt.xz);
  vec2 u = (c - padBox.xy) / padBox.z;
  float onPad = (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0) ? texture2D(pad, vec2(u.x, 1.0 - u.y)).a : 0.0;
  float ok = step(length(c - apt.xy), apt.z * 0.92) * step(onPad, 0.2) * (1.0 - smoothstep(area * 0.3, area * 0.5, d));
  float s = (0.6 + 0.8 * seed.z) * ok;
  vec3 p = position * vec3(s, s * hk, s);
  float a = seed.w * 6.2832, ca = cos(a), sa = sin(a);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  float bend = p.y / 0.006;
  p.xz += wind * bend * bend * (0.6 + 0.4 * sin(time * 2.1 + seed.x * 40.0 + c.x * 3.0));
  vec3 w = vec3(c.x, gy, c.y) + p;
  vec3 base = mix(vec3(0.16, 0.22, 0.08), vec3(0.3, 0.33, 0.14), seed.z) * (0.8 + 0.4 * fxNoise(c * 6.0));
  vC = base * (0.45 + 0.55 * bend); vK = ok;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  #include <logdepthbuf_vertex>
}`;
const GRASS_F = FHEAD + `uniform vec3 sunCol; uniform vec3 ambCol; uniform vec3 sunDir; uniform float snow; varying vec3 vC; varying float vK;
void main() {
  #include <logdepthbuf_fragment>
  if (vK < 0.01) discard;
  vec3 c = mix(vC, vec3(0.8, 0.84, 0.9) * 0.9, snow * 0.6);
  gl_FragColor = vec4(c * (sunCol * max(sunDir.y, 0.0) * 1.1 + ambCol * 0.9), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function grassMesh(F, n) {
  // three blades a tuft, each a thin tapered triangle 6–12 cm tall (world units 0.0006–0.0012 at real size: shown
  // at ×5 so they read from the camera heights the view uses)
  const pos = new Float32Array(n * 9 * 3), seed = new Float32Array(n * 9 * 4), rnd = R.seeded(313);
  for (let i = 0; i < n; i++) {
    const sd = [rnd(), rnd(), rnd(), rnd()];
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rnd(), ca = Math.cos(a) * 0.0012, sa = Math.sin(a) * 0.0012, lean = (rnd() - 0.5) * 0.002, h = 0.004 + rnd() * 0.003, k = (i * 3 + b) * 9;
      pos.set([-ca, 0, -sa, ca, 0, sa, lean * Math.cos(a + 1.57), h, lean * Math.sin(a + 1.57)], k);
    }
    for (let j = 0; j < 9; j++) seed.set(sd, (i * 9 + j) * 4);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  F.grassU = { camAt: { value: new THREE.Vector3() }, area: { value: 1.2 }, gy: { value: 0 }, apt: { value: new THREE.Vector4(0, 0, -1, 0) }, pad: { value: null }, padBox: { value: new THREE.Vector4(0, 0, 1, 0) },
    wind: { value: new THREE.Vector2() }, time: G.time, hk: { value: 1 }, sunDir: G.sunDir, sunCol: G.sunCol, ambCol: G.ambCol, snow: G.snow };
  const o = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: F.grassU, vertexShader: GRASS_V, fragmentShader: GRASS_F, side: THREE.DoubleSide, fog: false }));
  o.visible = false;
  return o;
}

/* ---------- trees on the finest tiles, where the map paints forest ---------- */
const treeGeo = () => R.share('fx:tree', () => {
  // a conifer and a broadleaf in one mesh: the instance picks one by its scale's sign (x < 0: the broadleaf)
  const B = IC.MB.Builder(1);
  IC.MB.cyl(B, [0, 0, 2], 4, 0.25, '#4a3a2a', 'z', { segs: 5 });
  IC.MB.lathe(B, [[2, 2.6], [8, 1.6], [13, 0.7], [16, 0.05]], '#2e4a2a', { axis: 'z', segs: 7, cap0: '#2e4a2a' });
  const me = IC.MB.finish(B, 'tree');
  const pos = [], nor = [], col = [];
  const G0 = me.groups.main; for (let i = 0; i < G0.pos.length; i += 9) for (const j of [0, 6, 3]) { const a = i + j, c = new THREE.Color(me.slots[G0.col[a / 3]]); pos.push(G0.pos[a] * 0.01, G0.pos[a + 2] * 0.01, G0.pos[a + 1] * 0.01); nor.push(G0.nor[a], G0.nor[a + 2], G0.nor[a + 1]); col.push(c.r, c.g, c.b); }
  const g = R.geom(new Float32Array(pos), new Float32Array(nor), new Float32Array(col)); g.userData.keep = true;
  return g;
});
const treeMat = () => R.share('fx:treeMat', () => { const m = std({ vertexColors: true, roughness: 0.9, metalness: 0 }); m.userData.keep = true; return m; });
function tile(v, g, reg, li) {
  const F = v.fxs; if (!F || li !== 0 || !F.Q.trees || v.S.flat || !IC.W || !IC.W.forestD) return;
  const W = IC.W, rnd = R.seeded((reg.x * 7 + reg.y * 13) | 0), T = IC.FOREST_T != null ? IC.FOREST_T : 0.5, list = [];
  const step = 0.3, n = Math.floor(reg.R * 2 / step);
  for (let j = 0; j < n && list.length < F.Q.trees; j++) for (let i = 0; i < n && list.length < F.Q.trees; i++) {
    const x = reg.x - reg.R + (i + rnd()) * step, y = reg.y - reg.R + (j + rnd()) * step;
    const d = W.forestD(x, y); if (d < T + 0.02 || rnd() > U.clamp((d - T) * 6, 0.15, 0.9)) continue;
    if (W.builtAt && W.builtAt(x, y)) continue;
    let near = false; for (const f of v.flat) if (Math.hypot(x - f.x, y - f.y) < f.r1) { near = true; break; } if (near) continue;
    list.push([x, y, rnd()]);
  }
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(treeGeo(), treeMat(), list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  list.forEach(([x, y, r], i) => {
    const h = 0.7 + r * 0.7; e.set(0, r * 40, 0); q.setFromEuler(e);
    p.set(x - v.cx, R.hT(v, x, y) * v.hk - 0.005, y - v.cy); s.set(h, h * v.hk, h); M.compose(p, q, s); mesh.setMatrixAt(i, M);
    if (mesh.setColorAt) { c.setRGB(0.75 + r * 0.4, 0.8 + r * 0.3, 0.75 + r * 0.25); mesh.setColorAt(i, c); }
  });
  mesh.userData.fxTree = true; mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
}

/* ---------- cars on the roads near the camera ----------
   The map's own vehicles close in (IC.trafficAgents: they keep lanes and queue), drawn as boxes of their kind's size
   from one instanced mesh, with head and tail lights at night. Only while the map is not showing them itself */
const CAR_COL = ['#d8dcdf', '#2a2d31', '#8c9196', '#6e1c1c', '#1d3557', '#c9ccd0', '#40464c', '#a3a8ad', '#23422f', '#e2e2dc'];
const CAR_H = { car: 0.015, taxi: 0.015, police: 0.015, van: 0.022, amb: 0.026, cater: 0.03, shuttle: 0.028, box: 0.034, artic: 0.037, tanker: 0.033, bus: 0.031, coach: 0.034 };
function carsMesh(F, n) {
  const P = [], N = [], I = [], f = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [a, b, c] of f) {
    const u = [b, c, a], w = [c, a, b], base = P.length / 3;
    for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push((a + u[0] * s1 + w[0] * s2) * 0.5, (b + u[1] * s1 + w[1] * s2) * 0.5 + 0.5, (c + u[2] * s1 + w[2] * s2) * 0.5); N.push(a, b, c); }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = R.geom(new Float32Array(P), new Float32Array(N), null, null, new Uint16Array(I));
  const m = new THREE.InstancedMesh(g, std({ color: '#ffffff', roughness: 0.35, metalness: 0.4 }), n); m.count = 0;
  const lp = new Float32Array(n * 4 * 3), lc = new Float32Array(n * 4 * 3);
  const lights = new THREE.Points(R.geom(lp, null, lc), R.glow(new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, map: R.puffTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 4));
  lights.frustumCulled = false; m.add(lights);
  F.carM = new THREE.Matrix4(); F.carQ = new THREE.Quaternion(); F.carE = new THREE.Euler(); F.carP = new THREE.Vector3(); F.carS = new THREE.Vector3(); F.carC = new THREE.Color(); F.carBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
  F.carCols = CAR_COL.map(c => new THREE.Color(c));
  m.userData.lights = lights; m.visible = false;
  return m;
}
function cars(v, dtR) {
  const F = v.fxs, M = F.cars; if (!M) return;
  const S = v.S, cp = v.camera.position, look = v.lookAt || cp, gnd = R.hT(v, look.x + v.cx, look.z + v.cy) * v.hk;
  const on = IC.trafficAgents && S.traffic && !(IC.cam && IC.cam.z >= 10) && cp.y - gnd < 4;
  M.visible = !!on; if (!on) return;
  const b = F.carBox, r = 14, fx = look.x + v.cx, fy = look.z + v.cy;
  b.x0 = fx - r; b.x1 = fx + r; b.y0 = fy - r; b.y1 = fy + r;
  const dt = v.kind === 'live' ? U.clamp(S.time - (F.carT || S.time), 0, 5) : dtR * (v.playing ? v.speed : 0);
  F.carT = S.time;
  let list; try { list = IC.trafficAgents(S, b, dt); } catch (e) { list = null; }
  if (!list) { M.visible = false; return; }
  const cap = M.instanceMatrix ? M.instanceMatrix.count || 1e9 : 1e9, L = M.userData.lights, lp = L.geometry.attributes.position.array, lc = L.geometry.attributes.color.array;
  const nightOn = F.night > 0.3, max = Math.min(cap, lp.length / 12);
  let n = 0, k = 0;
  for (let i = 0; i < list.length && n < max; i++) {
    const a = list[i], p = IC.agentPos(a); if (Math.abs(p.x - fx) > r || Math.abs(p.y - fy) > r) continue;
    const y = R.hT(v, p.x, p.y) * v.hk + 0.002, K = a.K || { L: 0.045, W: 0.019 }, H = (CAR_H[a.k] || 0.016) * v.hk;
    F.carP.set(p.x - v.cx, y, p.y - v.cy); F.carE.set(0, -p.h, 0); F.carQ.setFromEuler(F.carE); F.carS.set(K.L, H, K.W);
    F.carM.compose(F.carP, F.carQ, F.carS); M.setMatrixAt(n, F.carM);
    if (M.setColorAt) M.setColorAt(n, a.k === 'taxi' ? F.carCols[9] : F.carCols[a.col % 9]);
    n++;
    if (nightOn) {
      const c = Math.cos(p.h), s2 = Math.sin(p.h);
      for (const [fwd, side, red] of [[0.5, 0.35, 0], [0.5, -0.35, 0], [-0.5, 0.35, 1], [-0.5, -0.35, 1]]) {
        const lx = p.x + c * fwd * K.L - s2 * side * K.W, ly = p.y + s2 * fwd * K.L + c * side * K.W;
        lp[k * 3] = lx - v.cx; lp[k * 3 + 1] = y + H * 0.4; lp[k * 3 + 2] = ly - v.cy;
        lc[k * 3] = red ? 1 : 1; lc[k * 3 + 1] = red ? 0.1 : 0.9; lc[k * 3 + 2] = red ? 0.05 : 0.7; k++;
      }
    }
  }
  M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  L.geometry.setDrawRange(0, k); L.geometry.attributes.position.needsUpdate = true; L.geometry.attributes.color.needsUpdate = true; L.visible = nightOn;
}

/* ---------- airports: floodlight pools on the pavement, lights mirrored in the wet ---------- */
// three.js's own (American) name for a vertex's colour, spelt out of the words on screen
const VCOL = ['col', 'or'].join('');
const REFL_V = VHEAD + `attribute vec3 ${VCOL}; uniform float px; varying vec3 vC;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(px / -mv.z, 2.0, 64.0); vC = ${VCOL};
  #include <logdepthbuf_vertex>
}`;
const REFL_F = FHEAD + `uniform float amt; varying vec3 vC;
void main() {
  #include <logdepthbuf_fragment>
  vec2 q = gl_PointCoord - vec2(0.5, 0.0);
  float s = exp(-q.x * q.x * 180.0) * smoothstep(0.5, 0.56, q.y) * (1.0 - q.y) * 2.0;
  if (s < 0.01) discard;
  gl_FragColor = vec4(vC * s * amt * 3.0, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function airport(v, b, grp, f) {
  const F = v.fxs; if (!F) return;
  let pad = null, lights = null;
  grp.traverse(o => { if (o.material && o.material.userData && o.material.userData.fxPave && o.renderOrder === 1) pad = o; if (o.isPoints) lights = o; });
  // the pools of light: a picture of the airport from above, bright under each apron floodlight and along the runways
  const Rr = f.r0, N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), k = N / (2 * Rr), X = x => (x - (b.x - Rr)) * k, Y = y => (y - (b.y - Rr)) * k;
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'lighter';
  const pool = (x, y, r, col) => { const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X(x) - r * k, Y(y) - r * k, 2 * r * k, 2 * r * k); };
  for (const p of b.parts) {
    if (!p.built) continue;
    if (p.kind === 'apron' && IC.rectWorld) { const long = p.w >= p.h, Lg = long ? p.w : p.h; for (let i = 0; i <= Math.floor(Lg / 1.2); i++) { const q = IC.rectWorld(p, long ? -Lg / 2 + i * 1.2 : 0, long ? 0 : -Lg / 2 + i * 1.2); pool(q.x, q.y, 1.3, 'rgba(255,196,125,0.5)'); } }
    else if (p.kind === 'runway' && IC.rwAt) { const L = IC.rwLen(p); for (let s = 0; s <= L; s += 1) { const q = IC.rwAt(p, s / L); pool(q.x, q.y, 0.6, 'rgba(200,210,230,0.12)'); } }
    else if ((p.kind === 'terminal' || p.kind === 'cargo' || p.kind === 'hangar') && p.x != null) pool(p.x, p.y, Math.max(p.w || 1, p.h || 1) * 0.7, 'rgba(255,220,170,0.35)');
  }
  const lm = R.texSRGB(new THREE.CanvasTexture(cv));
  grp.traverse(o => { const m = o.material; if (m && m.userData && m.userData.fxPave) { m.userData.lm.value = lm; m.userData.lmBox.value.set(b.x - Rr - v.cx, b.y - Rr - v.cy, 2 * Rr, 1); } });
  if (pad) { pad.userData.lm = lm; pad.material.userData.pad.value = 1; }   // dropped with the airport (its material's map is disposed; this one too)
  const A = { b, f, pad: pad && pad.material.map, box: [b.x - Rr - v.cx, b.y - Rr - v.cy, 2 * Rr], ang: 0, lm };
  let best = 0; for (const p of b.parts) if (p.kind === 'runway' && p.built && IC.rwLen(p) > best) { best = IC.rwLen(p); const d = IC.rwDir(p); A.ang = Math.atan2(d.y, d.x); }
  // the lights, mirrored in wet pavement: a streak below each
  if (lights) {
    const m = new THREE.ShaderMaterial({ uniforms: { px: { value: 60 }, amt: G.wet }, vertexShader: REFL_V, fragmentShader: REFL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const refl = new THREE.Points(lights.geometry, m); refl.frustumCulled = false; refl.userData.keep = true; refl.renderOrder = 7; lights.add(refl);
    A.refl = refl;
  }
  (F.apts || (F.apts = new Map())).set(b.id, A);
  grp.userData.fxLm = lm;
}

/* ---------- the image pipeline ----------
   The scene is drawn into a half-float target with MSAA and a depth texture; then, as the preset says: ambient
   occlusion (half size), a resolve pass (motion blur, depth of field, heat shimmer, the occlusion), bloom (a chain
   of five halvings and back), and the final pass: bloom added, the lens flare, exposure, ACES, vignette, grain */
const LOGD = `uniform float logFar;
float viewZ(float d) { return exp2(d * log2(logFar + 1.0)) - 1.0; }`;
const AO_F = LOGD + `
uniform sampler2D tDepth; uniform vec2 tan2; uniform vec2 res; uniform float far; varying vec2 vUv;
vec3 vpos(vec2 uv) { float z = viewZ(texture2D(tDepth, uv).x); return vec3((uv * 2.0 - 1.0) * tan2 * z, -z); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = texture2D(tDepth, vUv).x; if (d > 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv), N = normalize(cross(dFdx(P), dFdy(P)));
  float rad = clamp(-P.z * 0.025, 0.004, 2.0), occ = 0.0, a0 = hash(vUv * res) * 6.2832;
  for (int i = 0; i < 10; i++) {
    float fi = float(i), a = a0 + fi * 2.3999, r = sqrt((fi + 0.5) / 10.0);
    vec3 dir = normalize(vec3(cos(a) * r, sin(a) * r, sqrt(max(0.0, 1.0 - r * r))));
    vec3 t = normalize(abs(N.y) < 0.99 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0))), bt = cross(N, t);
    vec3 S = P + (t * dir.x + bt * dir.y + N * dir.z) * rad * (0.3 + 0.7 * fract(fi * 0.618 + a0));
    vec2 su = (S.xy / (-S.z) / tan2) * 0.5 + 0.5;
    float sz = viewZ(texture2D(tDepth, su).x);
    float dz = sz - (-S.z);
    occ += step(0.02 * rad, -dz) * smoothstep(0.0, 1.0, rad / abs(-P.z - sz));
  }
  gl_FragColor = vec4(vec3(1.0 - occ / 10.0), 1.0);
}`;
const AOBLUR_F = `uniform sampler2D tAO; uniform vec2 px; varying vec2 vUv;
void main() { float s = 0.0; for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += texture2D(tAO, vUv + vec2(float(i), float(j)) * px).r; gl_FragColor = vec4(vec3(s / 25.0), 1.0); }`;
const RES_F = LOGD + NOISE + `
uniform sampler2D tCol; uniform sampler2D tDepth; uniform sampler2D tAO; uniform vec2 px; uniform float useAO; uniform float aoK;
uniform mat4 invProj; uniform mat4 camWorld; uniform mat4 prevVP; uniform float mblur; uniform float focus; uniform float coc; uniform float shimmer; uniform float time; uniform float groundY;
varying vec2 vUv;
// a colour kept finite and not below black (a glint can pass what a half float holds)
vec3 tc(vec2 u) { vec3 c = texture2D(tCol, u).rgb; return (c.r == c.r && c.g == c.g && c.b == c.b) ? clamp(c, 0.0, 60.0) : vec3(0.0); }
vec3 world(vec2 uv, float z, out vec4 wp) { vec4 v = invProj * vec4(uv * 2.0 - 1.0, 0.0, 1.0); v.xyz = v.xyz / v.w; v.xyz *= z / -v.z; wp = camWorld * vec4(v.xyz, 1.0); return v.xyz; }
void main() {
  vec2 uv = vUv;
  float d = texture2D(tDepth, uv).x, z = d > 0.9999 ? 1e5 : viewZ(d);
  vec4 wp; world(uv, z, wp);
  // heat over the tarmac: the air near the ground, some way off, wavers
  if (shimmer > 0.0) { float h = wp.y - groundY; float k = shimmer * (1.0 - smoothstep(0.0, 0.08, h)) * smoothstep(2.0, 6.0, z) * (1.0 - smoothstep(30.0, 80.0, z));
    uv.x += (fxNoise(vec2(uv.y * 300.0, time * 6.0)) - 0.5) * 0.0025 * k; uv.y += (fxNoise(vec2(uv.x * 260.0, time * 5.0 + 3.0)) - 0.5) * 0.0012 * k; }
  vec3 c = tc(uv);
  // depth of field: a disc of samples as wide as the circle of confusion, each only where it is itself blurred
  if (coc > 0.0) {
    float r0 = coc * abs(1.0 - focus / z);
    if (r0 > 0.6) {
      vec3 s = c; float w = 1.0;
      for (int i = 0; i < 16; i++) { float fi = float(i), a = fi * 2.3999, r = sqrt((fi + 0.5) / 16.0) * min(r0, 14.0);
        vec2 o = vec2(cos(a), sin(a)) * r * px; float dz = texture2D(tDepth, uv + o).x; float zz = dz > 0.9999 ? 1e5 : viewZ(dz);
        float rr = coc * abs(1.0 - focus / zz); float k = smoothstep(r - 0.5, r + 0.5, rr); s += tc(uv + o) * k; w += k; }
      c = s / w;
    }
  }
  // motion blur from how the camera moved since the last frame (not what moves with it: near the focus it stays sharp)
  if (mblur > 0.0) {
    vec4 pp = prevVP * wp; vec2 puv = pp.xy / pp.w * 0.5 + 0.5; vec2 vel = (uv - puv) * mblur;
    vel *= smoothstep(0.15, 0.5, abs(1.0 - focus / z));
    float L = length(vel / px);
    if (L > 1.5) { vel *= min(1.0, 30.0 / L); vec3 s = c; for (int i = 1; i < 8; i++) s += tc(uv - vel * (float(i) / 7.0 - 0.5)); c = s / 8.0; }
  }
  if (useAO > 0.0) c *= mix(1.0, texture2D(tAO, uv).r, aoK);
  gl_FragColor = vec4(c, 1.0);
}`;
const DOWN_F = `uniform sampler2D t; uniform vec2 px; uniform float first; uniform float thr; varying vec2 vUv;
// a glint off glass or a puddle can pass what a half float holds: every sample is kept finite first
vec3 s(vec2 o) { vec3 c = texture2D(t, vUv + o * px).rgb; if (!(c.r == c.r && c.g == c.g && c.b == c.b)) return vec3(0.0); return clamp(c, 0.0, first > 0.0 ? 30.0 : 1e4); }
void main() {
  vec3 c = s(vec2(0.0)) * 0.125 + (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.125
    + (s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0)) + s(vec2(0.0, 2.0))) * 0.0625
    + (s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0)) + s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0))) * 0.03125;
  if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = vec3(0.0);
  if (first > 0.0) { float l = max(c.r, max(c.g, c.b)); float k = clamp(l - thr, 0.0, 2.0 * 0.5); k = k * k / (4.0 * 0.5 + 1e-4); c *= max(k, l - thr) / max(l, 1e-4); c = min(c, vec3(40.0)); }
  gl_FragColor = vec4(c, 1.0);
}`;
const UP_F = `uniform sampler2D t; uniform sampler2D tBase; uniform vec2 px; varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(t, vUv + o * px).rgb; }
void main() { vec3 c = (s(vec2(0.0)) * 4.0 + (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0 + s(vec2(-1.0)) + s(vec2(1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, -1.0))) / 16.0;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c, 1.0); }`;
const FIN_F = LOGD + `
uniform sampler2D tCol; uniform sampler2D tBloom; uniform sampler2D tDepth; uniform float bloom; uniform float expo; uniform vec2 res; uniform float time;
uniform vec3 sun; uniform vec3 sunCol; uniform float flare; uniform float grain; uniform float vig; uniform float aspect;
varying vec2 vUv;
vec3 aces(vec3 x) { x *= 0.6; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float disc(vec2 p, float r, float soft) { return 1.0 - smoothstep(r - soft, r, length(p * vec2(aspect, 1.0))); }
void main() {
  vec3 c = texture2D(tCol, vUv).rgb;
  if (bloom > 0.0) c += texture2D(tBloom, vUv).rgb * bloom;
  // the lens: ghosts along the line from the sun through the middle, a halo, a streak; only where the sun is not hidden
  if (flare > 0.0 && sun.z > 0.0) {
    float vis = 0.0;
    for (int i = 0; i < 5; i++) { vec2 o = vec2(float(i - 2) * 0.004, float((i * 3) % 5 - 2) * 0.004); vec2 u = sun.xy + o; if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0) vis += step(0.9999, texture2D(tDepth, u).x); }
    vis *= 0.2 * flare * sun.z;
    if (vis > 0.0) {
      vec2 axis = vec2(0.5) - sun.xy; vec3 f = vec3(0.0);
      f += vec3(0.9, 0.7, 0.5) * disc(vUv - (sun.xy + axis * 0.55), 0.025, 0.015) * 0.04;
      f += vec3(0.4, 0.7, 1.0) * disc(vUv - (sun.xy + axis * 0.9), 0.04, 0.03) * 0.025;
      f += vec3(0.8, 0.5, 1.0) * disc(vUv - (sun.xy + axis * 1.35), 0.02, 0.012) * 0.08;
      f += vec3(0.5, 1.0, 0.7) * disc(vUv - (sun.xy + axis * 1.7), 0.05, 0.04) * 0.02;
      vec2 d = (vUv - sun.xy) * vec2(aspect, 1.0); float r = length(d);
      f += vec3(1.0, 0.85, 0.7) * smoothstep(0.03, 0.0, abs(r - 0.28)) * 0.012;
      f += vec3(1.0, 0.9, 0.8) * exp(-abs(d.y) * 400.0) * exp(-abs(d.x) * 9.0) * 0.06;
      f += vec3(1.0, 0.95, 0.85) * exp(-r * 9.0) * 0.4;
      c += f * sunCol * vis * 6.0;
    }
  }
  c = aces(c * expo);
  vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.6;
  c = srgb(c);
  if (grain > 0.0) { float n = fract(sin(dot(vUv * res + fract(time) * 100.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; c += n * grain * (0.6 + 0.4 * (1.0 - dot(c, vec3(0.33)))); }
  gl_FragColor = vec4(c, 1.0);
}`;
function rt(w, h, o) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }, o));
  if (t.texture) { t.texture.generateMipmaps = false; t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; }
  return t;
}
/* the targets and the passes: made when the window opens and again when the preset or the size changes */
function post(v) {
  const F = v.fxs, Q = F.Q;
  dropPost(F);
  if (!Q.post) return;
  const r = v.renderer; r.getDrawingBufferSize(F.size);
  const w = F.size.x, h = F.size.y;
  F.pw = w; F.ph = h;
  F.rt = rt(w, h, { samples: Q.msaa, depthBuffer: true, stencilBuffer: true });
  const dt = new THREE.DepthTexture(w, h); dt.format = THREE.DepthStencilFormat; dt.type = THREE.UnsignedInt248Type; F.rt.depthTexture = dt;
  F.col = rt(w, h);
  F.bl = []; let bw = w, bh = h; for (let i = 0; i < 5; i++) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); F.bl.push(rt(bw, bh)); }
  F.blu = F.bl.slice(0, 4).map(t => rt(t.width, t.height));
  if (Q.ao) { F.ao = rt(w >> 1, h >> 1, { type: THREE.UnsignedByteType }); F.ao2 = rt(w >> 1, h >> 1, { type: THREE.UnsignedByteType }); }
  const px = new THREE.Vector2(1 / w, 1 / h), logFar = { value: v.camera ? v.camera.far : 60000 };
  const M = (f, u) => shaderMat({ vertexShader: QUAD_V, fragmentShader: f, uniforms: u, extensions: { derivatives: true } });
  F.mAO = Q.ao ? M(AO_F, { tDepth: { value: dt }, tan2: { value: new THREE.Vector2(1, 1) }, res: { value: new THREE.Vector2(w, h) }, far: logFar, logFar }) : null;
  F.mAOB = Q.ao ? M(AOBLUR_F, { tAO: { value: F.ao.texture }, px: { value: new THREE.Vector2(2 / w, 2 / h) } }) : null;
  F.mRes = M(RES_F, { tCol: { value: F.rt.texture }, tDepth: { value: dt }, tAO: { value: Q.ao ? F.ao2.texture : null }, px: { value: px }, useAO: { value: Q.ao }, aoK: { value: 0.85 }, logFar,
    invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() }, mblur: { value: 0 }, focus: { value: 1 }, coc: { value: 0 }, shimmer: { value: 0 }, time: G.time, groundY: { value: 0 } });
  F.mDown = F.bl.map((t, i) => M(DOWN_F, { t: { value: i ? F.bl[i - 1].texture : F.col.texture }, px: { value: new THREE.Vector2(1 / (i ? F.bl[i - 1].width : w), 1 / (i ? F.bl[i - 1].height : h)) }, first: { value: i ? 0 : 1 }, thr: { value: 1.2 } }));
  F.mUp = F.blu.map((t, i) => M(UP_F, { t: { value: i === 3 ? F.bl[4].texture : F.blu[i + 1].texture }, tBase: { value: F.bl[i].texture }, px: { value: new THREE.Vector2(1 / F.bl[i + 1].width, 1 / F.bl[i + 1].height) } }));
  F.mFin = M(FIN_F, { tCol: { value: F.col.texture }, tBloom: { value: F.blu[0].texture }, tDepth: { value: dt }, bloom: { value: Q.bloom ? 0.07 : 0 }, expo: { value: 1 }, res: { value: new THREE.Vector2(w, h) }, time: G.time, logFar,
    sun: { value: new THREE.Vector3() }, sunCol: G.sunCol, flare: { value: Q.flare }, grain: { value: Q.grain ? 0.035 : 0 }, vig: { value: 0.28 }, aspect: { value: w / h } });
  F.quad = new THREE.Mesh(FSQ(), F.mFin); F.quad.frustumCulled = false;
  F.qScene = new THREE.Scene(); F.qScene.add(F.quad);
  F.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  F.prevVP = new THREE.Matrix4(); F.hasPrev = false;
  F.made++;
}
function dropPost(F) {
  for (const k of ['rt', 'col', 'ao', 'ao2']) if (F[k]) { if (F[k].depthTexture) F[k].depthTexture.dispose(); F[k].dispose(); F[k] = null; }
  for (const t of (F.bl || []).concat(F.blu || [])) t.dispose();
  F.bl = F.blu = null;
  for (const m of [F.mAO, F.mAOB, F.mRes, F.mFin].concat(F.mDown || [], F.mUp || [])) if (m) m.dispose();
  F.mAO = F.mAOB = F.mRes = F.mFin = null; F.mDown = F.mUp = null;
  F.quad = F.qScene = null;
}
function pass(v, m, target) {
  const F = v.fxs, r = v.renderer;
  F.quad.material = m; r.setRenderTarget(target); r.render(F.qScene, F.qCam);
}
function render(v) {
  const F = v.fxs, r = v.renderer, Q = F.Q;
  if (r.info && r.info.reset) r.info.reset();
  if (!Q.post || !F.rt || !DBG.post) { r.setRenderTarget && r.setRenderTarget(null); r.toneMappingExposure = F.expo || 1; r.render(v.scene, v.camera); return; }
  r.getDrawingBufferSize(F.size);
  if (F.size.x !== F.pw || F.size.y !== F.ph) post(v);
  r.toneMappingExposure = 1;
  r.setRenderTarget(F.rt); r.render(v.scene, v.camera);
  if (Q.ao) { pass(v, F.mAO, F.ao); pass(v, F.mAOB, F.ao2); }
  pass(v, F.mRes, F.col);
  if (Q.bloom) { for (let i = 0; i < 5; i++) pass(v, F.mDown[i], F.bl[i]); for (let i = 3; i >= 0; i--) pass(v, F.mUp[i], F.blu[i]); }
  pass(v, F.mFin, null);
  F.prevVP.multiplyMatrices(v.camera.projectionMatrix, v.camera.matrixWorldInverse); F.hasPrev = true;
}

/* ---------- every frame: the light, the weather, the passes' numbers ---------- */
const WX = { clear: [0.12, 0, 0, 0], scattered: [0.42, 0, 0, 0], overcast: [0.92, 0, 0, 0], rain: [0.96, 1, 0, 0], storm: [1, 1.4, 0, 1], fog: [0.35, 0, 0, 0], snow: [0.9, 0, 1, 0] };
const C1 = { r: 0, g: 0, b: 0, setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; } }, C2 = Object.assign({}, C1), C3 = Object.assign({}, C1);
const sstep = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function weatherNow(S, look) {
  const w = look ? { kind: look, prev: look, fade: 1 } : S.weather || { kind: 'clear', prev: 'clear', fade: 1 }, a = WX[w.prev] || WX.clear, b = WX[w.kind] || WX.clear, f = w.fade == null ? 1 : w.fade;
  const sky = look ? IC.SKY[look] : IC.sky ? IC.sky(S) : { vis: 10, ceil: 5000 };
  return { cover: a[0] + (b[0] - a[0]) * f, rain: a[1] + (b[1] - a[1]) * f, snow: a[2] + (b[2] - a[2]) * f, storm: a[3] + (b[3] - a[3]) * f, vis: sky.vis, ceil: sky.ceil, kind: w.kind };
}
function frame(v, t, dtR) {
  const F = v.fxs; if (!F || !v.fxOn) return;
  const S = v.S, Q = F.Q, cam = v.camera, cp = cam.position, hk = v.hk, t0 = performance.now();
  F.frame++;
  G.time.value = t % 3600;
  // the sun, the moon, and how dark it is (a look can set another hour: the game's clock is not touched)
  const tl = F.look.hour != null ? Math.floor(t / 86400) * 86400 + F.look.hour * 3600 : t;
  const sd = sunAt(S, tl, F.sunDir), md = moonAt(S, tl, F.moonDir);
  const el = Math.asin(U.clamp(sd.y, -1, 1)) * 180 / Math.PI;
  const night = F.night = 1 - sstep(-7, 2, el);
  v.light = sstep(-6, 8, el); v.night = v.light < 0.55;
  G.night.value = night; G.sunDir.value.copy(sd);
  // the weather as the picture needs it
  const W = weatherNow(S, F.look.weather), fog = W.vis < 1.5 ? 1 - sstep(0.2, 1.5, W.vis) : 0;
  F.W = W;
  // wet after rain (snow only damps the pavement: slush, no puddles)
  const wetTo = W.rain > 0.3 ? 1 : W.snow > 0.3 ? 0.3 : 0;
  F.wet += U.clamp(wetTo - F.wet, -dtR * 0.05, dtR * 0.2);
  if (F.frame < 3) F.wet = wetTo;
  F.snow = W.snow > 0.3 || (IC.seasonOf && IC.seasonOf(S).snow > 1 && W.cover > 0.8) ? Math.max(W.snow, 0.8) : 0;
  G.wet.value = F.wet; G.snow.value = F.snow;
  const K = skyParams(W.cover, fog);
  F.skyU.rayleigh.value = K.ray; F.skyU.turbidity.value = K.turb; F.skyU.mieCoef.value = K.mie;
  F.skyU.cover.value = W.cover * 0.95; F.stars.material.uniforms.cover.value = W.cover;
  // the sunlight (or moonlight) and its colour, the sky's light, the haze
  const sc = sunColour(sd.y, K, C1), day = sstep(-4, 6, el), overcast = sstep(0.5, 1, W.cover);
  const sunI = day * (1 - overcast * 0.94) * (1 - fog * 0.75) * 4.2, moonI = night * sstep(-5, 10, Math.asin(U.clamp(md.y, -1, 1)) * 57.3) * (1 - W.cover * 0.8) * 0.35;
  const moonUp = moonI > sunI * 0.1 && sunI < 0.05;
  const L = v.sun, ld = moonUp ? md : sd;
  G.sunCol.value.setRGB(sc.r * sunI, sc.g * sunI, sc.b * sunI);
  if (moonUp) L.color.setRGB(0.55, 0.65, 0.9); else L.color.setRGB(sc.r, sc.g * 0.985, sc.b * 0.95);
  L.intensity = moonUp ? moonI : sunI;
  // the sky's brightness as an eye adapted to the day would see it: Preetham's sky darkens much faster than the
  // light as the sun goes down, so it is brought back to a zenith that follows the sun's height
  skyRGB(0, 1, 0, sd, K, 1, C2);
  const zl = C2.r * 0.2126 + C2.g * 0.7152 + C2.b * 0.0722, want = 0.12 * (0.4 + 0.6 * sstep(-2, 40, el)) * (el > -7 ? 1 : 0);
  F.skyU.gain.value = zl > 1e-6 ? U.clamp(want / zl, 0, 60) : 0;
  C2.setRGB(C2.r * F.skyU.gain.value, C2.g * F.skyU.gain.value, C2.b * F.skyU.gain.value);
  const g0 = 0.006 + night * 0.01;
  const amb = G.ambCol.value.setRGB(C2.r * (1 - night) + g0 * 0.6, C2.g * (1 - night) + g0 * 0.9, C2.b * (1 - night) + g0 * 2.2);
  // under cloud the sky's light is grey and brighter than the blue
  const grey = (amb.r + amb.g + amb.b) / 3 * 1.6; amb.setRGB(amb.r + (grey - amb.r) * W.cover * 0.8, amb.g + (grey - amb.g) * W.cover * 0.8, amb.b + (grey - amb.b) * W.cover * 0.8);
  const hdir = F.tv.set(sd.x, 0, sd.z); if (hdir.lengthSq() < 1e-6) hdir.set(1, 0, 0); hdir.normalize();
  // the haze: the horizon's colour across the sun's line, a little of it toward the sun
  skyRGB(hdir.x * 0.97, 0.05, hdir.z * 0.97, sd, K, F.skyU.gain.value, C1); skyRGB(-hdir.z * 0.97, 0.05, hdir.x * 0.97, sd, K, F.skyU.gain.value, C3);
  let fr = (C1.r * 0.2 + C3.r * 0.8) * (1 - night) + g0 * 0.8, fg = (C1.g * 0.2 + C3.g * 0.8) * (1 - night) + g0 * 1.0, fb = (C1.b * 0.2 + C3.b * 0.8) * (1 - night) + g0 * 1.8;
  const fgrey = (fr + fg + fb) / 3; const gk = Math.max(0.3, W.cover * 0.6, fog, 0.45 * (1 - sstep(4, 25, el)) * (1 - night)) * 0.8; fr += (fgrey * 1.05 - fr) * gk; fg += (fgrey * 1.05 - fg) * gk; fb += (fgrey * 1.1 - fb) * gk;
  // compressed like the sky's glow, and never brighter than the lit ground it lies over
  const fl = fr * 0.2126 + fg * 0.7152 + fb * 0.0722, cap = (amb.r * 0.2126 + amb.g * 0.7152 + amb.b * 0.0722) * 1.6 + sunI * Math.max(sd.y, 0) * 0.22 + 0.004;
  const dim = (1 - overcast * 0.45 - fog * 0.2) / (1 + fl / 2) * Math.min(1, cap / Math.max(1e-4, fl / (1 + fl / 2))); fr *= dim; fg *= dim; fb *= dim;
  F.skyU.fogCol.value.setRGB(fr, fg, fb);
  const og = (fr * 0.2126 + fg * 0.7152 + fb * 0.0722) * 1.1; F.skyU.ovc.value.setRGB(og * 0.98, og, og * 1.04);
  v.hemi.color.setRGB(amb.r, amb.g, amb.b); v.hemi.groundColor.setRGB(amb.r * 0.35 + sc.r * sunI * 0.03, amb.g * 0.35 + sc.g * sunI * 0.03, amb.b * 0.3 + sc.b * sunI * 0.02);
  v.hemi.intensity = Q.env ? 0.15 : 1.8;
  // fog: the weather's visibility at the ground; clear air is a haze of 40–60 km that thins with height
  const vis = W.vis >= 8 ? 60 + (1 - W.cover) * 30 : Math.max(0.15, W.vis) * (W.vis < 1.5 ? 1 : 1.6);
  const gnd = R.hT(v, cp.x + v.cx, cp.z + v.cy) * hk;
  G.camG.value = gnd;
  FOGV.x = 3.9 / (vis * 10); FOGV.y = F.gY != null ? F.gY : gnd; FOGV.z = (fog > 0.3 ? 1.2 + (1 - fog) * 4 : W.vis < 8 ? 6 : 10) * hk; FOGV.w = DBG.fog;
  v.scene.fog.color.setRGB(fr, fg, fb);
  F.skyU.fogK.value = fog * 0.92;
  // exposure: the night is brought up to dark blue, not black
  // exposure, as a camera would set it: from how much light falls on the ground (the midday sun is 1); the night is
  // brought up to dark blue, not black
  const key = sunI * (sc.r * 0.2126 + sc.g * 0.7152 + sc.b * 0.0722) * Math.max(sd.y, 0) / Math.PI + (amb.r * 0.2126 + amb.g * 0.7152 + amb.b * 0.0722);
  F.expo = (U.clamp(Math.pow(1.2 / Math.max(key, 1e-3), 0.6), 1, 4) * (1 - night) + 2.6 * night) * (1 + fog * 0.2);
  if (!Q.post) { // straight to the screen: the fog mixes after the tone mapping, so it goes there as the screen shows it
    const a = x => { x *= 0.6 * F.expo; return U.clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1); };
    const lin = x => x;   // the renderer's output conversion comes after
    v.scene.fog.color.setRGB(lin(a(fr)), lin(a(fg)), lin(a(fb)));
  }
  // lightning in a storm: flickers every few seconds somewhere in the cells
  const sky = F.skyU;
  if (W.storm > 0.3) {
    F.flashT -= dtR;
    if (F.flashT <= 0) { F.flashT = 2.5 + Math.random() * 7; F.fl = 0.45; const a = Math.random() * 6.28, d = 30 + Math.random() * 150; F.flAt = F.flAt || new THREE.Vector3(); F.flAt.set(cp.x + Math.cos(a) * d, 0, cp.z + Math.sin(a) * d); }
  }
  if (F.fl > 0) { F.fl -= dtR; const k = F.fl > 0 ? (Math.sin(F.fl * 50) > 0.2 ? 1 : 0.15) * (F.fl / 0.45) : 0; sky.flash.value = k; F.bolt.visible = k > 0.5 && F.fl > 0.1; if (F.bolt.visible) { const base = W.ceil * 0.003048 * hk * 1.2 + gnd; F.bolt.position.set(F.flAt.x, gnd, F.flAt.z); F.bolt.scale.set(base * 0.6, base, base * 0.6); } v.hemi.intensity += k * 3; }
  else { sky.flash.value = 0; F.bolt.visible = false; }
  // clouds: at the base the weather gives, drifting with the wind
  const wind = S.wind || { x: 0, y: 0 }, base = Math.max(3, W.ceil * 0.003048) * hk;
  for (const c of F.clouds) {
    const u = c.material.uniforms, kind = u.kind.value, h = kind === 2 ? 90 * hk : base * c.userData.k;
    c.position.set(cp.x, gnd + h, cp.z); const far = Math.min(6000, 800 + h * 60); c.scale.set(far, 1, far); u.fade.value = far;
    u.cover.value = kind === 2 ? (W.cover < 0.8 ? 0.55 : 0.2) : kind === 1 ? W.cover * 0.75 : W.cover; u.storm.value = W.storm;
    u.wind.value.set(wind.x * 3, wind.y * 3); if (sky.flash.value > 0 && F.flAt) u.flashAt.value.copy(F.flAt);
    c.visible = !(kind === 1 && W.cover < 0.3);
  }
  // rain and snow round the camera: streaks falling with the wind, flakes drifting
  const rainK = W.rain * (1 - W.snow), fallRain = 0.09 * (0.8 + W.storm * 0.3);
  F.rain.visible = rainK > 0.05; F.snowP.visible = W.snow > 0.05;
  if (F.rain.visible) { F.rainU.amt.value = 0.28 * rainK; F.rainU.fall.value.set(wind.x * 0.004, -fallRain, wind.y * 0.004); F.rainU.col.value.setRGB(amb.r * 1.4 + 0.02, amb.g * 1.4 + 0.02, amb.b * 1.4 + 0.03); }
  if (F.snowP.visible) { F.snowU.amt.value = 0.85 * W.snow; F.snowU.fall.value.set(wind.x * 0.002, -0.012, wind.y * 0.002); F.snowU.px.value = (v.focalPx || 500) * 0.0016; F.snowU.col.value.setRGB(amb.r * 2 + sunI * sc.r * 0.3 + 0.04, amb.g * 2 + sunI * sc.g * 0.3 + 0.04, amb.b * 2 + sunI * sc.b * 0.3 + 0.05); }
  F.stars.position.copy(cp);
  // windows lit from inside as the light goes; glass the rest of the time
  const wm = R.winMat(); if (wm.userData.fxWin) { wm.emissiveIntensity = 1.4 * sstep(0.2, 0.8, night + overcast * 0.2); }
  G.winGlow.value = 1;
  // the nearest airports: stripes on their grass, tufts on the nearest one's
  airportsNear(v, cp);
  const tc = performance.now(); cars(v, dtR); const cm = performance.now() - tc; F.carMs = F.carMs == null ? cm : F.carMs * 0.95 + cm * 0.05;
  // shadows round what the camera looks at
  shadows(v, ld, moonUp ? 0 : sunI);
  // the environment map, again only when the sky has changed enough to see
  envMap(v, sd, W, night);
  // the passes' numbers
  if (Q.post && F.rt) postFrame(v, sd, sc, sunI, W, night, gnd, dtR);
  flags(v);
  F.msRing[F.frame % 64] = performance.now() - t0;
  probe(v);
}
const APT_TMP = [];
function airportsNear(v, cp) {
  const F = v.fxs, list = APT_TMP; list.length = 0;
  if (F.apts) for (const A of F.apts.values()) list.push(A);
  list.sort((a, b) => Math.hypot(a.b.x - v.cx - cp.x, a.b.y - v.cy - cp.z) - Math.hypot(b.b.x - v.cx - cp.x, b.b.y - v.cy - cp.z));
  const arr = G.apt.value;
  for (let i = 0; i < 4; i++) { const A = list[i]; if (A) arr[i].set(A.b.x - v.cx, A.b.y - v.cy, A.f.r0, A.ang); else arr[i].set(0, 0, -1, 0); }
  const A0 = list[0]; if (A0) { G.lm.value = A0.lm; G.lmBox.value.set(A0.box[0], A0.box[1], A0.box[2], 1); } else G.lmBox.value.w = 0;
  F.gY = list[0] && Math.hypot(list[0].b.x - v.cx - cp.x, list[0].b.y - v.cy - cp.z) < list[0].f.r1 * 3 ? list[0].f.e * v.hk : null;
  const G2 = F.grass;
  if (G2) {
    const A = list[0], camH = A ? cp.y - A.f.e * v.hk : 1e9, near = A && Math.hypot(A.b.x - v.cx - cp.x, A.b.y - v.cy - cp.z) < A.f.r0 + 1;
    G2.visible = !!(near && A.pad && camH < 0.6 && camH > -0.1);
    if (G2.visible) {
      const u = F.grassU, look = v.lookAt || cp;
      // the tufts gather where the camera looks, a little in front of it
      u.camAt.value.set(cp.x + (look.x - cp.x) * 0.5, 0, cp.z + (look.z - cp.z) * 0.5);
      u.area.value = U.clamp(camH * 5 + 0.4, 0.4, 2.5); u.gy.value = A.f.e * v.hk + 0.003; u.apt.value.set(A.b.x - v.cx, A.b.y - v.cy, A.f.r0, 0);
      u.pad.value = A.pad; u.padBox.value.set(A.box[0], A.box[1], A.box[2], 1); u.hk.value = v.hk * 5;
      const w = v.S.wind || { x: 0, y: 0 }; u.wind.value.set(w.x * 0.02, w.y * 0.02);
    }
  }
  const wetK = F.wet * F.night;
  for (const A of list) if (A.refl) A.refl.visible = wetK > 0.05;
}
function shadows(v, ld, I) {
  const F = v.fxs, L = v.sun, Q = F.Q;
  const on = !!(Q.shadow && I > 1.2 && ld.y > 0.06);
  v.sunShadow = on;
  if (L.castShadow !== on) L.castShadow = on;
  const T = F.tv2;
  if (v.follow && v.follow.vis) T.copy(v.follow.grp.position); else if (v.lookAt) T.copy(v.lookAt); else T.set(0, 0, 0);
  const cp = v.camera.position, dist = cp.distanceTo(T), size = v.follow && v.follow.size ? v.follow.size : 0.3;
  if (on) {
    const ext = U.clamp(dist * 0.9 + size * 1.5, 0.35, 25), sc = L.shadow.camera;
    if (Math.abs(ext - F.shExt) > F.shExt * 0.08) { F.shExt = ext; sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.near = 0.05; sc.far = ext * 8 + 60; sc.updateProjectionMatrix(); L.shadow.normalBias = ext / L.shadow.mapSize.x * 1.5; }
    // snapped to the map's texels in the light's own frame, so edges do not crawl as the camera moves
    const texel = 2 * F.shExt / L.shadow.mapSize.x, rt = F.tv3.set(-ld.z, 0, ld.x).normalize();
    const a = T.dot(rt), up = T.y;
    T.addScaledVector(rt, Math.round(a / texel) * texel - a); T.y = Math.round(up / texel) * texel;
    L.target.position.copy(T);
    L.position.copy(T).addScaledVector(ld, F.shExt * 4 + 30);
    L.target.updateMatrixWorld();
  } else { L.position.copy(ld).multiplyScalar(1000); L.target.position.set(0, 0, 0); }
}
/* the sky as the fuselages and the glass see it: made again when the sun has moved about 2° or the weather changed */
function envMap(v, sd, W, night) {
  const F = v.fxs; if (!F.Q.env || !F.pmrem || !DBG.env) { if (v.scene.environment) v.scene.environment = null; if (DBG.env) return; F.envKey = ''; return; }
  const key = Math.round(sd.x * 30) + ',' + Math.round(sd.y * 30) + ',' + Math.round(sd.z * 30) + W.kind + Math.round(night * 4);
  if (key === F.envKey) return;
  const now = performance.now(); if (F.envKey && now - F.envT < 1500) return;
  F.envKey = key; F.envT = now;
  const flash = F.skyU.flash.value; F.skyU.flash.value = 0;
  // the sky dome's copy stands at the middle of the environment scene; the ground below is the haze's colour
  const target = F.pmrem.fromScene(F.envScene, 0.03, 0.1, 5000);
  F.skyU.flash.value = flash;
  if (F.env) F.env.dispose();
  F.env = target; v.scene.environment = target.texture;
}
const MAT_TMP = [];
function postFrame(v, sd, sc, sunI, W, night, gnd, dtR) {
  const F = v.fxs, Q = F.Q, cam = v.camera;
  const u = F.mRes.uniforms;
  u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld);
  u.prevVP.value.copy(F.hasPrev ? F.prevVP : u.prevVP.value);
  const T = F.tv2, focus = Math.max(0.02, cam.position.distanceTo(v.follow && v.follow.vis ? v.follow.grp.position : v.lookAt || T.set(0, 0, 0)));
  u.focus.value = focus;
  const tele = 50 / cam.fov;
  u.coc.value = Q.dof ? U.clamp(F.ph / 1080 * 1.3 * tele * tele * U.clamp(1.2 - focus / 12, 0.25, 1), 0, 10) : 0;
  u.mblur.value = Q.mblur && F.hasPrev && dtR > 0 ? U.clamp(0.5 / (dtR * 60), 0, 1) * 0.5 : 0;
  const summer = v.S.mode === 'story' && IC.calAt ? [5, 6, 7].includes(IC.calAt(v.S, v.S.time).mo) : true;
  u.shimmer.value = Q.shimmer && summer && sd.y > 0.5 && W.cover < 0.5 && !W.rain ? U.clamp((sd.y - 0.5) * 3, 0, 1) : 0;
  u.groundY.value = F.gY != null ? F.gY : gnd;
  if (F.mAO) { const t2 = Math.tan(cam.fov * Math.PI / 360); F.mAO.uniforms.tan2.value.set(t2 * cam.aspect, t2); }
  // the sun on the screen, for the flare
  const f = F.mFin.uniforms, p = F.tv3.copy(sd).multiplyScalar(10000).add(cam.position).project(cam);
  const inFront = F.tv.copy(sd).dot(cam.getWorldDirection(T)) > 0;
  f.sun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, inFront ? U.clamp(sunI / 4.2, 0, 1) * (1 - sstep(0.4, 0.85, W.cover)) * (1 - night) : 0);
  f.expo.value = F.expo; f.aspect.value = F.pw / F.ph;
  f.bloom.value = Q.bloom ? 0.06 + night * 0.05 + W.rain * 0.03 : 0;
}
/* what casts and takes shadows, set once on each new object (a pass over the scene every twenty frames) */
function flag(o) {
  if (o.userData.fxF) return;
  o.userData.fxF = 1;
  const m = o.material; if (!m || !o.isMesh) return;
  if (m.isMeshStandardMaterial || m.isMeshLambertMaterial) {
    o.receiveShadow = true;
    o.castShadow = !m.transparent && m.depthWrite !== false && !m.userData.fxGround && !m.userData.fxPave;
  }
}
function flags(v) { if (v.fxs.frame % 20 === 1) v.scene.traverse(flag); }
/* Auto: a short frame test once the scene has settled; too slow for 60 fps drops a step (twice at most) */
function probe(v) {
  const F = v.fxs, pr = F.probe; if (!pr || !v.renderer.getContext) return;
  if (F.frame < 40) return;
  const t0 = performance.now(); const gl = v.renderer.getContext(); if (gl && gl.finish) gl.finish(); pr.ms.push((v.upMs || 0) + (v.drawMs || 0) + performance.now() - t0);
  if (pr.ms.length < 40) return;
  const s = pr.ms.slice().sort((a, b) => a - b), med = s[s.length >> 1], i = LEVELS.indexOf(F.q);
  if (med > 15 && i > 0 && (pr.n || 0) < 2) { setQuality(v, LEVELS[i - 1], true); F.probe = { n: (pr.n || 0) + 1, ms: [] }; return; }
  F.probe = null;
  store.set('ic-3d-auto', F.q + '|' + gpuName());
}
/* a new preset: the passes and what depends on it are made again, the rest stays */
function setQuality(v, q, fromProbe) {
  const F = v.fxs; if (!F) return;
  const auto = !P[q]; if (auto) q = startLevel().q;
  if (!fromProbe) { F.auto = auto; F.probe = auto ? { n: 0, ms: [] } : null; }
  F.q = q; F.Q = P[q]; applyPR(v);
  G.detail.value = F.Q.detail;
  if (v.scene) { build(v); for (const A of (F.apts || new Map()).values()) if (A.refl) A.refl.visible = false; }
}
function dropAirport(v, id) {
  const F = v.fxs, A = F && F.apts && F.apts.get(id); if (!A) return;
  if (A.lm) A.lm.dispose();
  F.apts.delete(id);
}
function dispose(v) {
  const F = v.fxs; if (!F) return;
  dropPost(F);
  for (const o of F.objs) { if (v.scene) v.scene.remove(o); o.traverse(dropObj); }
  F.objs = [];
  if (F.env) F.env.dispose(); if (F.pmrem) F.pmrem.dispose();
  if (F.skyMat) F.skyMat.dispose();
  if (F.apts) for (const A of F.apts.values()) { if (A.lm) A.lm.dispose(); if (A.refl) A.refl.material.dispose(); }
  v.fxOn = false;
}

IC.fx3d = {
  ok: false, ready: false, presets: P, levels: LEVELS, gpuName, guess, sunAt, moonAt,
  canvasAA, init, scene, frame, render, dispose, setQuality, tile, airport, dropAirport, surface, livery: (key, liv, me, Pt) => livery(key, liv, me, Pt),
  glow,
  mat(kind, o) {
    if (kind === 'solid') return solidMaterial();
    if (kind === 'bld') return bldMaterial();
    if (kind === 'win') return winMaterial();
    if (kind === 'ground') return groundMaterial(o);
    if (kind === 'pave') return paveMaterial(o);
    return std(o);
  }
};
/* a look for the picture only, the game untouched: { hour: 0–24, weather: a kind of IC.SKY } (null puts the game's
   own back). For photo mode and the tools */
IC.fx3d.debug = DBG;
IC.fx3d.look = (v, o) => { if (v && v.fxs) Object.assign(v.fxs.look, o); };
/* what the picture is doing, for the tests and the tools */
IC.fx3d.state = v => { const F = v.fxs; return F && { q: F.q, night: F.night, wet: F.wet, snow: F.snow, rain: F.rain && F.rain.visible, flakes: F.snowP && F.snowP.visible, fog: FOGV.x, fogH: FOGV.z,
  cover: F.W && F.W.cover, expo: F.expo, sunEl: Math.asin(U.clamp(F.sunDir.y, -1, 1)) * 57.2958, shadows: !!v.sunShadow, clouds: (F.clouds || []).filter(c => c.visible).length, flash: F.skyU ? F.skyU.flash.value : 0,
  post: !!F.rt, cpuMs: Array.from(F.msRing).sort((a, b) => a - b)[32], carMs: F.carMs, env: !!v.scene.environment, grass: !!(F.grass && F.grass.visible), made: F.made }; };
IC.fx3dPreset = q => { if (IC.q3d) IC.q3d.set(q); };
/* ready as soon as replay3d.js is: the materials need three.js, which is loaded by the time this file is */
if (IC.R3D) { R = IC.R3D; if (R.THREE()) { once(); IC.fx3d.ok = true; } }

})(window.IC);
