/* Iron Canopy — saving and loading a game.

   A save is the seed plus everything the state holds, written by one generic serializer, so new fields in S are
   saved without code here:
   - The world is not saved. It regenerates from its seed, and right after generation every world object gets an
     id and a fingerprint of its own fields (IC.worldBase, called by IC.newGame). A save stores only the world
     objects whose fingerprint changed (a city that grew, a cut road, an airport's parts), by id.
   - Objects from the static tables (IC.UNITS, IC.ACTYPES, IC.CHAPTERS …) and functions on IC are saved as their
     name, so u.d stays IC.UNITS[type] after a load.
   - Every other object is written once; a second reference to it is written as its number, so shared objects
     stay shared (a tail and its track, a unit and the missile that knows it).
   - Caches are skipped and rebuilt: keys starting with _, an airport's cached route trees (ap.G.trees), the keys in
     IC.SAVE_SKIP (the road traffic, the terrain canvases, radar-cover grids). Maps, Sets and typed arrays are kept.
   - Functions kept in the state must be named handlers: IC.hfn(name, ...args) makes the function from the factory
     IC.H[name] and remembers the name and the arguments, so a load makes it again. Objects that carry behaviour
     (goals with check(), event cards with effects) are tagged with IC.remake(obj, name, ...args): the load keeps
     their data and takes their functions from a fresh one made by IC.REMAKE[name]. A function that is neither is
     dropped and listed in the save's `lost` (the tests check that list stays empty).

   Storage (IndexedDB, localStorage as a fallback) and the slots are at the bottom; the screens are in ui.js. */
(function (IC) {
'use strict';

IC.SAVE_VERSION = 1;
// keys that are rebuilt after a load rather than saved, by where they live (paths from S)
IC.SAVE_SKIP = {
  '': ['terrain', 'clouds', 'traffic', 'buses', 'trains', 'hover', 'mode2', 'worldDirty'],
  fx: ['parts'],
  asp: ['cov', 'gnd', 'rc', 'vi', 'zs'],
  econ: ['tt', 'ti'],
  world: ['roadIds', 'roadIdx', 'roadAdj']
};

/* ---------- fingerprints ---------- */
const f64 = new Float64Array(1), i32 = new Int32Array(f64.buffer);
const mix = (h, x) => { h = Math.imul(h ^ x, 0x5bd1e995); return h ^ (h >>> 15); };
function hstr(h, s) { h = mix(h, s.length); for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i)); return h; }
const isObj = v => v !== null && (typeof v === 'object' || typeof v === 'function');
function hval(h, v, ids) {
  switch (typeof v) {
    case 'number': f64[0] = v; return mix(mix(h, i32[0]), i32[1]);
    case 'string': return hstr(mix(h, 0x2b), v);
    case 'boolean': return mix(h, v ? 3 : 5);
    case 'undefined': return mix(h, 11);
    case 'object': if (v === null) return mix(h, 7);
    // fall through
    case 'function': { const id = ids.get(v); return mix(h, id === undefined ? -2 : id); }
    default: return mix(h, 13);
  }
}
/* the object's own fields, and each object it holds passed to visit() */
function fingerprint(o, ids, skip, visit) {
  let h = 0x3c6ef372;
  if (Array.isArray(o)) {
    h = mix(h, o.length);
    for (let i = 0; i < o.length; i++) { const v = o[i]; h = hval(h, v, ids); if (visit && isObj(v)) visit(v); }
  } else if (ArrayBuffer.isView(o)) {
    const n = o.byteLength >> 2, a = new Int32Array(o.buffer, o.byteOffset, n), b = new Uint8Array(o.buffer, o.byteOffset, o.byteLength);
    h = mix(h, o.length); for (let i = 0; i < n; i++) h = mix(h, a[i]); for (let i = n * 4; i < b.length; i++) h = mix(h, b[i]);
  } else if (o instanceof Map) {
    h = mix(h, o.size);
    for (const [k, v] of o) { h = hval(hval(h, k, ids), v, ids); if (visit) { if (isObj(k)) visit(k); if (isObj(v)) visit(v); } }
  } else if (o instanceof Set) {
    h = mix(h, o.size);
    for (const v of o) { h = hval(h, v, ids); if (visit && isObj(v)) visit(v); }
  } else if (typeof o === 'function') {
    return h;
  } else {
    for (const k in o) {
      if (skip(o, k)) continue;
      const v = o[k]; h = hval(hstr(h, k), v, ids); if (visit && isObj(v)) visit(v);
    }
  }
  return h;
}

/* ---------- what is skipped ---------- */
let skipSets = new Map();   // parent object → keys skipped there
function skipFor(S, W) {
  const m = new Map();
  for (const path in IC.SAVE_SKIP) {
    let o = path ? path.split('.').reduce((a, k) => a && a[k], S) : S;
    if (path === 'world') o = W;
    if (o && typeof o === 'object') m.set(o, new Set(IC.SAVE_SKIP[path]));
  }
  return m;
}
function skip(o, k) {
  if (k.charCodeAt(0) === 95) return true;            // _cache
  if (k === 'trees' && o.adj instanceof Map) return true;   // an airport's cached route trees (ap.G.trees)
  const s = skipSets.get(o); return !!(s && s.has(k));
}

/* ---------- the world's baseline, taken right after generation ---------- */
const BASES = new WeakMap();   // world → its baseline (a test can hold two games at once)
function walkWorld(W, onObj) {
  const ids = new Map(), list = [], q = [W];
  ids.set(W, 0); list.push(W);
  for (let qi = 0; qi < q.length; qi++) {
    const o = q[qi];
    if (typeof o === 'function' || ArrayBuffer.isView(o)) continue;
    const add = v => { if (!ids.has(v)) { ids.set(v, list.length); list.push(v); q.push(v); } };
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) if (isObj(o[i])) add(o[i]); }
    else if (o instanceof Map) { for (const [k, v] of o) { if (isObj(k)) add(k); if (isObj(v)) add(v); } }
    else if (o instanceof Set) { for (const v of o) if (isObj(v)) add(v); }
    else for (const k in o) { if (skip(o, k)) continue; const v = o[k]; if (isObj(v)) add(v); }
  }
  return { ids, list };
}
IC.worldBase = function (W) {
  const prev = skipSets;
  skipSets = new Map([[W, new Set(IC.SAVE_SKIP.world)]]);
  const { ids, list } = walkWorld(W);
  const h = new Int32Array(list.length);
  let sig = mix(0x1234567, list.length);
  for (let i = 0; i < list.length; i++) { h[i] = fingerprint(list[i], ids, skip); sig = mix(sig, h[i]); }
  skipSets = prev;
  const wid = new WeakMap(); for (let i = 0; i < list.length; i++) wid.set(list[i], i);
  const B = { W, wid, h, n: list.length, sig: (sig >>> 0).toString(36) + '.' + list.length };
  BASES.set(W, B);
  return { list, sig: B.sig };
};

/* ---------- static tables and functions on IC ---------- */
let STATIC = null;
function staticRefs() {
  if (STATIC) return STATIC;
  STATIC = new Map();
  const walk = (o, path) => {
    if (!isObj(o) || STATIC.has(o)) return;
    STATIC.set(o, path);
    if (typeof o === 'function' || ArrayBuffer.isView(o) || o instanceof Map || o instanceof Set) return;
    for (const k of Object.keys(o)) walk(o[k], path.concat(k));
  };
  for (const k of Object.keys(IC)) {
    const v = IC[k];
    if (typeof v === 'function') { if (!STATIC.has(v)) STATIC.set(v, [k]); }
    else if (/^[A-Z]/.test(k) && k !== 'W' && k !== 'S' && k !== 'H' && k !== 'REMAKE' && k !== 'SAVE_SKIP') walk(v, [k]);
  }
  return STATIC;
}
const staticAt = path => path.reduce((o, k) => o == null ? o : o[k], IC);

/* ---------- writing ---------- */
const MARK = ['$w', '$s', '$r', '$f', '$n', '$u', '$t', '$m', '$S', '$c', '$h'];
const esc = k => k.charCodeAt(0) === 36 ? '$' + k : k;
const unesc = k => k.charCodeAt(0) === 36 && k.charCodeAt(1) === 36 ? k.slice(1) : k;
const DOM = /^(HTML|SVG|Canvas|OffscreenCanvas|Image|Path2D|WebGL|Audio|AudioNode|Gain|Oscillator|Window|Document|Text|Worker)/;
function b64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  if (typeof Buffer !== 'undefined') { const b = Buffer.from(s, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
  const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8;
}

function domish(v) {
  const p = Object.getPrototypeOf(v);
  if (p === Object.prototype || p === Array.prototype || p === null) return false;
  const n = p.constructor && p.constructor.name;
  return !!n && DOM.test(n);
}
function holdsDom(o) { for (const k in o) { const v = o[k]; if (v !== null && typeof v === 'object' && domish(v)) return true; } return false; }

function Writer(S, BASE) {
  const W = S.world, ids = BASE.wid, st = staticRefs();
  const idx = new Map(), wq = [], wseen = new Set(), later = [], jobs = [], lost = {};
  let n = 0, key = '';
  const loseIt = (what) => { const k = key + ' (' + what + ')'; lost[k] = (lost[k] || 0) + 1; };
  const world = o => { if (!wseen.has(o)) { wseen.add(o); wq.push(o); } };
  function val(v, d) {
    switch (typeof v) {
      case 'number': return isFinite(v) ? v : { $n: String(v) };
      case 'string': case 'boolean': return v;
      case 'undefined': return { $u: 0 };
      case 'function': return fn(v, d);
      case 'object': return v === null ? null : obj(v, d);
      default: return null;
    }
  }
  function fn(f, d) {
    const w = ids.get(f); if (w !== undefined) return { $w: w };
    const s = st.get(f); if (s) return { $s: s };
    if (f.$h) return { $h: f.$h, a: val(f.$a, d + 1) };
    loseIt('function' + (f.name ? ' ' + f.name : '')); return undefined;
  }
  function obj(o, d) {
    const w = ids.get(o); if (w !== undefined) { world(o); return { $w: w }; }
    const s = st.get(o); if (s) return { $s: s };
    const r = idx.get(o); if (r !== undefined) return { $r: r };
    // canvases and other page objects are the renderer's, and so is an object that holds one (a city's lights)
    if (domish(o) || (Object.getPrototypeOf(o) === Object.prototype && holdsDom(o))) return undefined;
    const i = n++; idx.set(o, i);
    if (d > 200) { later.push([i, o]); return { $f: i }; }
    return body(o, d);
  }
  function body(o, d) {
    if (Array.isArray(o)) {
      const out = new Array(o.length);
      for (let i = 0; i < o.length; i++) { const e = val(o[i], d + 1); out[i] = e === undefined ? null : e; }
      return out;
    }
    if (ArrayBuffer.isView(o)) return { $t: o.constructor.name, d: b64(new Uint8Array(o.buffer, o.byteOffset, o.byteLength)) };
    if (o instanceof Map) { const a = []; for (const [k, v] of o) { const ek = val(k, d + 1), ev = val(v, d + 1); if (ek !== undefined && ev !== undefined) a.push(ek, ev); } return { $m: a }; }
    if (o instanceof Set) { const a = []; for (const v of o) { const e = val(v, d + 1); if (e !== undefined) a.push(e); } return { $S: a }; }
    if (Object.prototype.hasOwnProperty.call(o, '$rc')) {
      const [name, args] = o.$rc, a = val(args, d + 1), out = {};
      for (const k of Object.keys(o)) {
        if (skip(o, k)) continue;
        const ds = Object.getOwnPropertyDescriptor(o, k);
        if (ds.get || typeof ds.value === 'function') continue;
        key = k; const e = val(ds.value, d + 1); if (e !== undefined) out[esc(k)] = e;
      }
      return { $c: name, a, o: out };
    }
    return fields(o, d);
  }
  function fields(o, d) {
    const out = {};
    for (const k in o) {
      if (skip(o, k)) continue;
      const v = o[k]; if (v === undefined) continue;
      key = k; const e = val(v, d + 1); if (e !== undefined) out[esc(k)] = e;
    }
    return out;
  }
  const visit = v => { if (ids.has(v)) world(v); };
  this.run = function () {
    const root = val(S, 0);
    let li = 0, wi = 0;
    for (;;) {
      if (li < later.length) { const [i, o] = later[li++]; jobs.push(['d', i, body(o, 0)]); continue; }
      if (wi >= wq.length) break;
      const o = wq[wi++], id = ids.get(o);
      const h = fingerprint(o, ids, skip, visit);
      if (h !== BASE.h[id]) {
        key = 'world';
        if (Array.isArray(o) || ArrayBuffer.isView(o) || o instanceof Map || o instanceof Set) jobs.push(['w', id, body(o, 0)]);
        else if (typeof o !== 'function') jobs.push(['w', id, fields(o, 0)]);
      }
    }
    return { root, jobs, lost };
  };
  void W;
}

/* the save as a plain object (JSON.stringify it to store it) */
IC.saveGame = function (S, meta) {
  const BASE = BASES.get(S.world);
  if (!BASE) throw new Error('This game cannot be saved: its map was not set up for saving.');
  const t0 = Date.now();
  skipSets = skipFor(S, S.world);
  try {
    const { root, jobs, lost } = new Writer(S, BASE).run();
    return { game: 'iron-canopy', v: IC.SAVE_VERSION, seed: S.world.seed, wsig: BASE.sig, nid: IC.nidPeek(), meta: Object.assign(IC.saveMeta(S), meta || {}),
      ms: Date.now() - t0, rebuild: ['terrain', 'clouds', 'traffic'].filter(k => S[k] != null), lost, root, jobs };
  } finally { skipSets = new Map(); }
};
/* what the slot list shows */
IC.saveMeta = function (S) {
  const act = S.story ? S.story.act : 0;
  const what = S.mode === 'story' ? `Career · Act ${['', 'I', 'II', 'III', 'IV'][act] || act}` + (act === 1 && IC.CHAPTERS[S.story.ch] ? ` · ${IC.CHAPTERS[S.story.ch].title}` : '')
    : S.mode === 'campaign' ? 'Quick war' : S.mode === 'sandbox' ? 'Sandbox' : S.mode === 'academy' ? 'Academy' : S.mode === 'range' ? 'Test range' : S.mode;
  return { mode: S.mode, act, what, day: IC.U.day(S.time), clock: IC.U.hhmm(S.time), time: S.time, budget: Math.round(S.budget), date: Date.now() };
};

/* ---------- reading ---------- */
/* checks the save before anything is thrown away: returns a sentence saying why it cannot be loaded, or null */
IC.saveProblem = function (data) {
  if (!data || data.game !== 'iron-canopy' || !data.root) return 'This is not an Iron Canopy save.';
  if (data.v > IC.SAVE_VERSION) return 'This save comes from a newer version of the game. Update the game to load it.';
  if (data.v < IC.SAVE_VERSION && !(IC.SAVE_MIGRATE && IC.SAVE_MIGRATE[data.v])) return 'This save comes from an older version of the game that this one cannot read.';
  return null;
};
IC.SAVE_MIGRATE = {};   // version → function (data) that returns the data in the next version's form

function Reader(data, wlist) {
  const R = [], fix = [], fills = [], fns = [], remakes = [];
  let n = 0;
  const put = (h, k, v) => { h[k] = v; };
  // decodes e and stores it in h[k]
  function dec(e, h, k) {
    if (e === null || typeof e !== 'object') return put(h, k, e);
    if (Array.isArray(e)) { const a = new Array(e.length); R[n++] = a; put(h, k, a); for (let i = 0; i < e.length; i++) dec(e[i], a, i); return; }
    if (e.$w !== undefined) { const o = wlist[e.$w]; if (o === undefined) throw new Error('world ' + e.$w); return put(h, k, o); }
    if (e.$r !== undefined) { if (e.$r < n && R[e.$r] !== undefined) return put(h, k, R[e.$r]); put(h, k, null); fix.push([h, k, e.$r]); return; }
    if (e.$s !== undefined) return put(h, k, staticAt(e.$s));
    if (e.$f !== undefined) { n++; put(h, k, null); fix.push([h, k, e.$f]); return; }
    if (e.$n !== undefined) return put(h, k, Number(e.$n));
    if (e.$u !== undefined) return put(h, k, undefined);
    if (e.$t !== undefined) { const u8 = unb64(e.d), C = globalThis[e.$t], a = new C(u8.slice().buffer); R[n++] = a; return put(h, k, a); }
    if (e.$m !== undefined) { const m = new Map(), tmp = []; R[n++] = m; put(h, k, m); for (let i = 0; i < e.$m.length; i++) dec(e.$m[i], tmp, i); fills.push([m, tmp]); return; }
    if (e.$S !== undefined) { const s = new Set(), tmp = []; R[n++] = s; put(h, k, s); for (let i = 0; i < e.$S.length; i++) dec(e.$S[i], tmp, i); fills.push([s, tmp]); return; }
    if (e.$c !== undefined) {
      const o = {}; R[n++] = o; put(h, k, o);
      const box = []; dec(e.a, box, 0);
      for (const kk in e.o) dec(e.o[kk], o, unesc(kk));
      remakes.push([o, e.$c, box]); return;
    }
    if (e.$h !== undefined) { put(h, k, null); const box = []; dec(e.a, box, 0); fns.push([h, k, e.$h, box]); return; }   // null keeps the key's place
    const o = {}; R[n++] = o; put(h, k, o);
    for (const kk in e) dec(e[kk], o, unesc(kk));
  }
  this.run = function () {
    const top = [];
    dec(data.root, top, 0);
    for (const [t, id, e] of data.jobs) {
      if (t === 'd') {
        if (e.$t !== undefined) { R[id] = new globalThis[e.$t](unb64(e.d).slice().buffer); continue; }
        decInto(Array.isArray(e) ? [] : e.$m ? new Map() : e.$S ? new Set() : {}, e, id); continue;
      }
      const o = wlist[id]; if (o === undefined) throw new Error('world ' + id);
      applyWorld(o, e);
    }
    for (const [h, k, i] of fix) h[k] = R[i];
    for (const [c, tmp] of fills) { if (c instanceof Map) { c.clear(); for (let i = 0; i < tmp.length; i += 2) c.set(tmp[i], tmp[i + 1]); } else { c.clear(); for (const v of tmp) c.add(v); } }
    return { S: top[0], fns, remakes };
  };
  // a deferred object: its number was taken where it was first met
  function decInto(o, e, id) {
    R[id] = o;
    if (Array.isArray(o)) { for (let i = 0; i < e.length; i++) dec(e[i], o, i); }
    else if (o instanceof Map || o instanceof Set) { const tmp = [], L = e.$m || e.$S; for (let i = 0; i < L.length; i++) dec(L[i], tmp, i); fills.push([o, tmp]); }
    else if (e.$c !== undefined) { const box = []; dec(e.a, box, 0); for (const kk in e.o) dec(e.o[kk], o, unesc(kk)); remakes.push([o, e.$c, box]); }
    else for (const kk in e) dec(e[kk], o, unesc(kk));
  }
  // a world object that changed since generation: its fields replace the generated ones
  function applyWorld(o, e) {
    if (Array.isArray(o)) { o.length = e.length; for (let i = 0; i < e.length; i++) dec(e[i], o, i); return; }
    if (ArrayBuffer.isView(o)) { const u8 = unb64(e.d); new Uint8Array(o.buffer, o.byteOffset, o.byteLength).set(u8.subarray(0, o.byteLength)); return; }
    if (o instanceof Map || o instanceof Set) { const tmp = [], L = e.$m || e.$S; for (let i = 0; i < L.length; i++) dec(L[i], tmp, i); fills.push([o, tmp]); return; }
    for (const k of Object.keys(o)) if (!skip(o, k) && !Object.prototype.hasOwnProperty.call(e, esc(k))) delete o[k];
    for (const kk in e) dec(e[kk], o, unesc(kk));
  }
}
/* a remade object keeps its saved data and takes behaviour (functions, getters, prototype) from a fresh one */
function graft(o, f, depth) {
  if (!f || typeof f !== 'object' || f === o) return;
  if (depth === 0 && Object.getPrototypeOf(f) !== Object.prototype) Object.setPrototypeOf(o, Object.getPrototypeOf(f));
  for (const k of Object.keys(f)) {
    const ds = Object.getOwnPropertyDescriptor(f, k);
    if (ds.get || ds.set) { Object.defineProperty(o, k, ds); continue; }
    const v = ds.value;
    if (typeof v === 'function') { if (typeof o[k] !== 'function') o[k] = v; }
    else if (depth < 4 && v && typeof v === 'object' && o[k] && typeof o[k] === 'object' && Object.getPrototypeOf(v) === Object.getPrototypeOf(o[k])) graft(o[k], v, depth + 1);
    else if (!(k in o) && typeof v !== 'object') o[k] = v;
  }
  if (f.$rc && depth === 0) IC.remake(o, f.$rc[0], ...f.$rc[1]);
}

/* loading in steps, so the browser can show progress between them; each yield is [fraction, what is happening] */
IC.loadSteps = function* (data) {
  if (typeof data === 'string') data = JSON.parse(data);
  const why = IC.saveProblem(data); if (why) throw new Error(why);
  while (data.v < IC.SAVE_VERSION) data = IC.SAVE_MIGRATE[data.v](data);
  yield [0.02, 'Generating the region'];
  const prevW = IC.W;
  try {
    let W;
    if (IC.generateSteps) { const g = IC.generateSteps(data.seed); for (;;) { const r = g.next(); if (r.done) { W = r.value; break; } yield [0.02 + 0.6 * (IC.LOAD_STAGES[r.value] || 0) / IC.LOAD_STAGES.routing, IC.STAGE_WORDS && IC.STAGE_WORDS[r.value] || 'Generating the region']; } }
    else W = IC.generate(data.seed);
    IC.W = W;
    IC.buildRouting(W);
    yield [0.64, 'Checking the map'];
    const { list, sig } = IC.worldBase(W);
    if (sig !== data.wsig) throw new Error('This save was made with a different version of the map generator, so its world cannot be rebuilt. It cannot be loaded in this version of the game.');
    yield [0.68, 'Restoring the game'];
    skipSets = new Map([[W, new Set(IC.SAVE_SKIP.world)]]);
    const { S, fns, remakes } = new Reader(data, list).run();
    skipSets = new Map();
    for (const [h, k, name, box] of fns) { if (IC.H[name]) h[k] = IC.hfn(name, ...box[0]); }
    for (const [o, name, box] of remakes) { const mk = IC.REMAKE[name]; if (mk) graft(o, mk(...box[0]), 0); }
    IC.nidSet(Math.max(data.nid || 0, 1));
    yield [0.78, 'Painting the map'];
    IC.afterLoad(S, data);
    yield [0.9, 'Starting the traffic'];
    if ((data.rebuild || []).includes('traffic')) IC.trafficInit(S);
    yield [1, 'Ready'];
    return S;
  } catch (err) {
    IC.W = prevW; skipSets = new Map();
    throw err;
  }
};
/* loads a save at once (the tests, and debugging from a saved position): IC.loadSave(json) → S */
IC.loadSave = function (data) {
  const g = IC.loadSteps(data);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
};
/* what a load rebuilds that the save skipped */
IC.afterLoad = function (S, data) {
  const W = S.world;
  IC.W = W;
  IC.buildRouting(W, W.blocked);
  const had = data.rebuild || [];
  if (had.includes('terrain')) S.terrain = IC.buildTerrain(W);
  if (had.includes('clouds')) S.clouds = IC.buildClouds();
  if (S.fx) S.fx.parts = [];
  if (S.econ && !S.econ.roadsDirty) IC.econTrees(S);
  for (const ap of S.infra) if (ap.G) ap.G.trees = new Map();
  S.hover = null; S.mode2 = null; S.paused = true; S.skip = false;
  if (IC.savedCfg) Object.assign(S.cfg, IC.savedCfg());
};

})(window.IC);
