/* Iron Canopy — game state, starting forces, damage, logging and effects. */
(function (IC) {
'use strict';
const U = IC.U;

IC.newGame = function (opts) {
  const seed = opts.seed >>> 0;
  const W = IC.W = IC.generate(seed);
  IC.buildRouting(W);
  const mode = opts.mode || 'campaign';
  const sandbox = mode === 'sandbox';
  const S = {
    mode, seed, world: W, lesson: opts.lesson || null,
    time: (opts.hour != null ? opts.hour : 6) * 3600, speed: 1, paused: true, skip: false, slow: 0, over: null, won: false,
    budget: sandbox ? 1600 : 1200, income: 0, upkeep: 0, ledger: {}, mobil: sandbox ? 1 : 0, support: 55, bondsT: -1e9,
    airspace: 'open', ad: { roe: 'tight', doctrine: 'sls' },
    cfg: Object.assign({ pauseOn: { ballistic: true, lost: true, base: true, raid: false, city: false, launch: true, event: true }, slowmo: true, shake: true, bars: true, radarFx: 'subtle' }, IC.savedCfg ? IC.savedCfg() : {}),
    infra: [], units: [], reserve: {}, orders: [],
    threats: [], missiles: [], strikes: [], eaam: [], air: [], roster: [], ato: [],
    vehicles: [], jobs: [], trains: [], imports: [],
    esites: [], tels: [], wrecks: [], marks: [],
    tech: { done: new Set(['a_lrsam']), slots: [null, null] },
    fx: { parts: [], booms: [], texts: [], tracers: [], rings: [], fires: [], flashes: [], plumes: [], trails: [], chaff: [], shocks: [] },
    logs: [], news: [], counters: {}, sensors: [], flags: {}, reports: [],
    stats: { kills: 0, leakers: 0, fired: 0, civLost: 0, strikes: 0, siteKills: 0, telKills: 0, convoysLost: 0, acLost: 0, unitsLost: 0 },
    nextTN: 1001, shake: 0, wind: { x: U.rand(-1, 1) * 0.6, y: U.rand(0.1, 0.6) },
    sel: null, group: [], mode2: null, hover: null,
    layers: { coverage: true, rings: true, logistics: true, civil: true, intel: true, labels: true, weather: true, airways: false },
    alertCities: 0
  };
  S.terrain = IC.buildTerrain(W);
  S.clouds = IC.buildClouds();

  for (const c of W.cities) S.infra.push(Object.assign(c, { infra: true, max: 130 + c.pop * 0.2, morale: 78, alert: 0, prosp: 1, owner: 'us', ind: Math.round(8 + c.pop * 0.05) }));
  for (const i of W.infra) {
    const inf = Object.assign(i, { infra: true, owner: 'us' });
    inf.r = { airport: 50, airbase: 60, factory: 40, power: 35 }[i.kind];
    inf.max = { airport: 150, airbase: 420, factory: 160, power: 120 }[i.kind];
    if (inf.kind === 'factory') { inf.queue = []; inf.active = []; }
    if (inf.kind === 'factory' || inf.kind === 'airport' || inf.kind === 'airbase') { inf.inv = {}; inf.inc = {}; }
    S.infra.push(inf);
  }
  // airports are laid out for this game: the story starts with flawed regional fields and a mothballed base
  {
    const story = mode === 'story';
    const apts = S.infra.filter(i => i.kind === 'airport').sort((a, b) => (b.city === W.cities[0].id) - (a.city === W.cities[0].id));
    apts.forEach((ap, i) => IC.layoutAirport(ap, i === 0 ? 'intl' : i === 1 || !story ? 'regional_ok' : 'regional_bad', ap.rwyA));
    for (const b of S.infra.filter(i => i.kind === 'airbase')) IC.layoutAirport(b, story && b.id === 'ab_fwd' ? 'mil_mothball' : 'mil_full', b.rwyA);
    for (const b of IC.bases(S)) { b.crews = b.kind === 'airbase' ? 2 : 1; b.works = []; b.autoRepair = true; IC.aptStats(S, b); }
  }
  for (const b of W.bridges) S.infra.push(Object.assign(b, { infra: true, owner: 'us', r: 8, max: 40, home: W.inHome(b.x, b.y) }));
  for (const i of S.infra) i.hp = i.max;
  S.byId = {}; for (const i of S.infra) S.byId[i.id] = i;
  // which plant powers which city
  const plants = S.infra.filter(i => i.kind === 'power');
  for (const c of IC.cities(S)) { const p = plants.slice().sort((a, b) => U.dist(a, c) - U.dist(b, c))[0]; c.plant = p ? p.id : null; }
  for (const i of S.infra) if (i.kind === 'factory' || i.kind === 'airport') for (let k = 0; k < (i.kind === 'factory' ? 2 : 1); k++) IC.addTruck(S, i);

  IC.weatherInit(S);
  const story = mode === 'story';
  if (story) IC.storyForces(S); else if (mode !== 'academy') startingForces(S, sandbox);
  IC.enemyInit(S);
  if (mode !== 'academy') IC.avInit(S);
  IC.aspInit(S);
  IC.civilInit(S);
  IC.trafficInit(S);
  IC.econInit(S);
  IC.airInit(S, sandbox, mode === 'academy', story);
  if (mode === 'academy') IC.academyInit(S, opts.lesson); else if (story) IC.storyInit(S); else IC.campaignInit(S);
  return S;
};

IC.cap = S => S.infra.find(i => i.capital);
IC.cities = S => S.infra.filter(i => i.kind === 'city');
IC.bases = S => S.infra.filter(i => i.kind === 'airbase' || i.kind === 'airport');

IC.findSpot = function (S, type, x, y, dmin, dmax) {
  for (let t = 0; t < 160; t++) {
    const a = U.rand(0, 6.283), d = U.rand(dmin, dmax), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (IC.canPlace(S, type, px, py)) return { x: px, y: py };
  }
  return null;
};

function startingForces(S, sandbox) {
  const W = S.world, cap = IC.cap(S);
  const fA = W.fronts.find(f => f.key === 'A'), fB = W.fronts.find(f => f.key === 'B');
  const mid = f => f.pts[Math.floor(f.pts.length / 2)];
  const inward = (p, d) => ({ x: p.x + p.nx * d, y: p.y + p.ny * d });
  const put = (type, near, dmin, dmax, o) => {
    const p = IC.findSpot(S, type, near.x, near.y, dmin, dmax); if (!p) return null;
    const u = IC.makeUnit(S, type, p.x, p.y, Object.assign({ instant: true, full: sandbox }, o || {}));
    if ((type === 'mrsam' || type === 'lrsam') && !sandbox) u.emcon = 'ambush';
    return u;
  };
  const dep = IC.makeUnit(S, 'depot', W.depotPos.x, W.depotPos.y, { instant: true });
  dep.name = 'Central Depot'; dep.central = true; dep.d_cap = 3000; dep.hp = dep.max = 300; dep.reach = 1e9;
  const stock = sandbox ? { IR: 20, SR: 36, MR: 18, LR: 10, RKT: 24 } : { IR: 12, SR: 16, MR: 8, LR: 4, RKT: 12 };
  for (const k in stock) dep.inv[k] = stock[k];
  for (let i = 0; i < 2; i++) IC.addTruck(S, dep);
  const fab = S.byId.ab_fwd || cap;
  put('lr3d', cap, 180, 420);
  put('vhf', { x: (cap.x + mid(fA).x) / 2, y: (cap.y + mid(fA).y) / 2 }, 0, 400);
  if (fA) { put('gf', inward(mid(fA), 570), 0, 300); put('acou', inward(fA.pts[Math.floor(fA.pts.length * 0.3)], 220), 0, 180); put('acou', inward(fA.pts[Math.floor(fA.pts.length * 0.7)], 220), 0, 180); }
  if (fB) put('gf', inward(mid(fB), 570), 0, 300);
  put('mrsam', cap, 150, 380);
  put('shorad', fab, 60, 160);
  put('shorad', cap, 220, 420);
  put('spaag', S.infra.find(i => i.kind === 'factory') || cap, 50, 140);
  put('spaag', dep, 40, 110);
  put('manpads', cap, 80, 200);
  put('manpads', fab, 50, 140);
  const bt = IC.cities(S).filter(c => !c.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0];
  if (bt) put('manpads', bt, bt.r * 0.5, bt.r + 60);
  if (sandbox) {
    put('lrsam', fab, 200, 450); put('mr3d', inward(mid(fA), 1100), 0, 350); put('gnss', inward(mid(fA), 1000), 0, 350);
    put('mlrs', inward(mid(fA), 700), 0, 300);
  }
  S.reserve = sandbox ? { gf: 1, shorad: 2, manpads: 2, mlrs: 1, depot: 1, mr3d: 1 } : { mr3d: 1, gf: 1, shorad: 2, spaag: 1, manpads: 3, gnss: 1, mlrs: 1, lrsam: 1, depot: 1 };
}

IC.hasTech = (S, id) => !id || S.tech.done.has(id);

IC.makeUnit = function (S, type, x, y, opts = {}) {
  const d = IC.UNITS[type];
  S.counters[type] = (S.counters[type] || 0) + 1;
  const emitter = !!((d.sensor && !d.sensor.passive) || (d.fc && !d.fc.passive) || d.emits);
  const u = {
    id: IC.nid('u'), type, d, x, y, h: 0, hp: d.hp, max: d.hp, name: `${d.short}-${S.counters[type]}`,
    state: opts.instant ? 'ready' : 'building', stT: opts.instant ? 0 : d.build, stMax: d.build,
    emitter, emcon: emitter ? 'on' : 'off', radarOn: false, ambushT: 0,
    roe: type === 'hatd' || type === 'exo' ? 'free' : 'auto', doctrine: 'auto',
    comp: {}, fat: opts.fat || 10, mags: [], cool: 0, prio: null, heat: 0, over: false, beam: null, cd: 0,
    lastFired: -1e9, route: null, dest: null, invested: d.cost, why: ''
  };
  for (const c of IC.compsOf(d)) u.comp[c] = 1;
  if (d.mags) for (const m of d.mags) u.mags.push({ mun: m.mun, tech: m.tech, max: m.mag, mag: opts.empty ? 0 : m.mag, storeMax: m.store, store: opts.full ? Math.ceil(m.store / 2) : 0, reload: m.reload, rl: 0, inc: 0 });
  if (d.logi && d.logi.cap) { u.inv = {}; u.inc = {}; for (const k of IC.STOCK_KEYS) { u.inv[k] = 0; u.inc[k] = 0; } u.d_cap = d.logi.cap; u.reach = d.logi.reach; u.profile = 'balanced'; }
  S.units.push(u);
  if (d.logi && d.logi.trucks && !opts.noTrucks) for (let i = 0; i < d.logi.trucks; i++) IC.addTruck(S, u);
  if (d.logi && d.logi.helis) S.roster.push(IC.newFlight(S, 'heli', `HOOK ${S.roster.filter(r => r.kind === 'heli').length + 1}`, u.id));
  return u;
};
IC.activeMags = (S, u) => u.mags.filter(m => IC.hasTech(S, m.tech));
IC.baseOf = (S, id) => S.byId[id] || S.units.find(u => u.id === id);
IC.effRoe = (S, u) => u.roe === 'auto' ? S.ad.roe : u.roe;
IC.effDoctrine = (S, u) => u.doctrine === 'auto' ? S.ad.doctrine : u.doctrine;
/* how well a component works: 1 = fine, 0 = knocked out */
IC.ok = (u, c) => u.comp[c] == null ? 1 : u.comp[c];

/* ---------- logging ---------- */
IC.log = function (S, kind, tag, msg, at) {
  S.logs.unshift({ t: S.time, kind, tag, msg, at: at ? { x: at.x, y: at.y } : null });
  if (S.logs.length > 400) S.logs.length = 400;
  if (kind === 'leak' || kind === 'warn' || at) IC.toast && IC.toast(S, kind, tag, msg, at);
};
IC.news = function (S, text) {
  S.news.unshift({ t: S.time, text });
  if (S.news.length > 40) S.news.length = 40;
};
IC.nearestPlace = function (S, x, y) {
  let best = null, bd = 1e9;
  for (const i of S.infra) if (i.kind === 'city') { const d = U.dxy(x, y, i.x, i.y); if (d < bd) { bd = d; best = i; } }
  for (const v of S.world.villages) { const d = U.dxy(x, y, v.x, v.y); if (d < bd * 0.5 && d < 200) { bd = d; best = v; } }
  if (!best) return IC.gridRef(x, y);
  return bd < (best.r || 60) * 1.4 ? best.name : `${U.km(bd)} ${U.compass(Math.atan2(y - best.y, x - best.x))} of ${best.name}`;
};

/* ---------- effects ----------
   parts: screen-sized particles that evolve in real time. World-sized pieces (fireballs, plumes, craters)
   carry w* fields so they scale when the camera zooms in. */
IC.part = (S, p) => { if (S.fx.parts.length < 3500) S.fx.parts.push(Object.assign({ t: 0, ox: 0, oy: 0, vx: 0, vy: 0, grow: 0, a: 1, add: false, drag: 1.2 }, p)); };
IC.explode = function (S, x, y, s, kind, o) {
  const F = S.fx; o = o || {};
  F.booms.push({ x, y, t: 0, max: 26 * s, wmax: 14 * s, color: kind === 'ground' ? '#ff6a4f' : kind === 'us' ? '#9fe0ff' : '#f2b441' });
  F.flashes.push({ x, y, t: 0, r: 60 * s, wr: 10 * s });
  if (s >= 1) F.shocks.push({ x, y, t: 0, wr: 30 * s, r: 90 * s });
  const n = Math.round(10 * s);
  for (let i = 0; i < n; i++) { const a = U.rand(0, 6.28), v = U.rand(30, 110) * s; IC.part(S, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.3, 0.9), size: U.rand(1, 2.2), col: '255,214,140', add: true, drag: 3 }); }
  for (let i = 0; i < n * 0.6; i++) IC.part(S, { x, y, ox: U.rand(-5, 5) * s, oy: U.rand(-5, 5) * s, vy: -6, life: U.rand(0.35, 0.7), size: U.rand(4, 8) * s, grow: 14, col: '255,130,50', add: true });
  for (let i = 0; i < n * 0.6; i++) IC.part(S, { x, y, ox: U.rand(-8, 8) * s, oy: U.rand(-8, 8) * s, vx: U.rand(-6, 6), vy: U.rand(-10, -2), life: U.rand(1.4, 3), size: U.rand(4, 7) * s, grow: 10, col: '95,102,110', a: 0.4 });
  if (kind === 'ground' && s >= 0.8) for (let i = 0; i < 6 * s; i++) { const a = U.rand(0, 6.28), v = U.rand(40, 140) * s; IC.part(S, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: U.rand(0.6, 1.4), size: U.rand(1.2, 2), col: '40,32,26', a: 0.9, drag: 1.5 }); }
  IC.sfx && IC.sfx.boom(x, y, s);
  if (s >= 1.1) IC.shake(S, 3 + s * 3, x, y);
  if (o.big && S.cfg.slowmo) IC.cinematic && IC.cinematic(S, x, y, o.big);
};
IC.addFire = (S, x, y, size, life) => {
  if (S.fx.fires.length > 160) S.fx.fires.shift();
  S.fx.fires.push({ x, y, size, life, t: 0, seed: Math.random() * 10 });
  if (size >= 0.7) IC.addPlume(S, x, y, size, life * 1.3);
};
IC.addPlume = (S, x, y, size, life) => {
  if (S.fx.plumes.length > 70) S.fx.plumes.shift();
  S.fx.plumes.push({ x, y, size, life, t: 0, seed: Math.random() * 100 });
};
IC.text = (S, x, y, s, color) => S.fx.texts.push({ x, y, s, color, t: 0 });
/* smoke trails live in game time so they linger and drift with the wind */
IC.newTrail = (S, kind) => { const tr = { pts: [], kind }; if (S.fx.trails.length > 240) S.fx.trails.shift(); S.fx.trails.push(tr); return tr; };
IC.shake = function (S, amount, x, y) {
  const c = IC.cam;
  if (!S.cfg.shake || !c) return;
  const d = U.dxy(x, y, c.x + c.vw / c.z / 2, c.y + c.vh / c.z / 2), R = Math.max(c.vw, c.vh) / c.z;
  if (d < R) S.shake = Math.min(16, S.shake + amount * (1 - d / R) * Math.min(1, c.z * 3));
};

/* ---------- damage ---------- */
IC.detonate = function (S, x, y, dmg, src) {
  const big = dmg >= 100;
  IC.explode(S, x, y, 0.7 + Math.min(1.8, dmg / 70), 'ground', { big: big && src && src.d ? 1 : 0 });
  // on an airfield the crater is drawn at its real size by the airport itself; elsewhere the ground keeps a mark
  const onField = IC.bases(S).some(b => b.parts && U.dxy(x, y, b.x, b.y) < b.radius);
  const gnd = onField ? { kind: 'airfield' } : IC.groundAt(S, x, y);
  IC.impactMark(S, x, y, dmg, gnd);
  if (dmg <= 0) return null;
  IC.roadHit(S, x, y, dmg);
  let hit = null, aptHit = false;
  const src2 = src || {};
  for (const inf of S.infra) {
    const d = U.dxy(x, y, inf.x, inf.y);
    const reach = inf.kind === 'city' ? inf.r : inf.parts ? inf.radius : inf.r;
    if (d > reach) continue;
    if (inf.kind === 'city') { IC.cityHit(S, inf, x, y, dmg, src2); if (gnd.town === inf) gnd.done = true; }
    else if (inf.parts) { IC.baseHit(S, inf, x, y, dmg, src2); aptHit = true; }
    else IC.hurtInfra(S, inf, dmg * (1 - d / inf.r * 0.5), src2, x, y);
    hit = hit || inf;
  }
  // a house in a village, or a block on a city's edge beyond its centre's reach
  if (gnd.kind === 'block' && !gnd.done && IC.blockHit(S, gnd.b, dmg) && gnd.town.kind === 'village') hit = hit || { name: `A house in ${gnd.town.name}` };
  for (const u of S.units.slice()) {
    const d = U.dxy(x, y, u.x, u.y);
    if (d < 30) { IC.hurtUnit(S, u, dmg * (1 - d / 30 * 0.6), src2); hit = hit || u; }
  }
  for (const v of S.vehicles) if (!v.dead && U.dxy(x, y, v.x, v.y) < 3 + dmg * 0.05) { IC.hitConvoy(S, v, src2.d ? src2.d.code : 'strike'); hit = hit || v; }
  if (hit && dmg > 25 && !aptHit) IC.addFire(S, x + U.rand(-4, 4), y + U.rand(-4, 4), 0.6 + dmg / 120, 900 + dmg * 20);
  const lbl = src2.tn ? `TN ${src2.tn} ${src2.d.code}` : `Undetected ${src2.d ? src2.d.code : 'weapon'}`;
  if (hit) { S.stats.leakers++; IC.log(S, 'leak', 'IMPACT', `${hit.name} hit by ${lbl}.`, { x, y }); IC.emit(S, 'impact', { x, y, hit, src: src2 }); }
  else IC.log(S, 'info', 'IMPACT', `${lbl} struck open ground ${IC.nearestPlace(S, x, y)}.`);
  return hit;
};
IC.cityHit = function (S, c, x, y, dmg, src) {
  // the block the weapon lands on takes the full blast; the blast and fires reach the blocks round it, less the
  // further they are
  const rb = 1.5 + dmg * 0.06;
  let lost = 0, harm = 0;
  const on = inBlock(c.blocks, x, y);
  for (const b of c.blocks) {
    if (b.hp <= 0) continue;
    const d = b === on ? 0 : Math.max(0, U.dxy(x, y, b.x, b.y) - Math.max(b.w, b.h) * 0.5);
    if (d > rb) continue;
    const was = b.hp;
    if (IC.blockHit(S, b, b === on ? dmg : dmg * (1 - d / rb) * U.rand(0.3, 1))) lost++;
    harm += was - b.hp;
  }
  const alive = c.blocks.reduce((s, b) => s + b.hp, 0) / Math.max(1, c.blocks.length);
  const was = c.hp;
  c.hp = Math.min(c.hp, c.max * (0.15 + 0.85 * alive));
  const hurt = Math.max(dmg * 0.3, was - c.hp);
  c.morale = Math.max(0, c.morale - hurt * 0.08 - harm * 0.4);
  c.prosp = Math.max(0.3, c.prosp - hurt * 0.002);
  for (const o of IC.cities(S)) if (o !== c) o.morale = Math.max(0, o.morale - hurt * 0.004);
  S.support = Math.min(100, S.support + hurt * 0.02);
  if (lost) { IC.cityLights(c); c.casualties = (c.casualties || 0) + lost * U.randi(3, 20); }
  if (lost >= 3 && Math.random() < 0.6) IC.news(S, U.pick([`Explosions in ${c.name}; emergency crews respond.`, `Residential blocks destroyed in ${c.name}.`, `${c.name} hospitals report casualties after strike.`]));
  IC.emit(S, 'cityHit', { city: c, lost });
};
/* ---------- where a weapon lands, and the marks it leaves ----------
   Blocks are city blocks, village houses and farmyards (hp 1 whole, 0 gone). A block that is hit burns for a while and
   stays a burnt shell. Marks on the ground (S.marks) are a cheap list the map bakes into its detail tiles: a scorch
   on grass fades in a day or two, a crater in a road stays until the road crews fill it, then shows a patch. */
const MARKS = {
  field: { life: 40 * 3600 },          // crater and scorched earth; ploughed over and grown back in under two days
  forest: { life: 5 * 86400 },         // burnt and broken trees
  road: { fix: 10 * 3600, life: 20 * 86400 },   // open until filled, then a darker patch that weathers in
  paving: { life: 12 * 3600 },         // scorch on an airfield: the airport draws its own craters
  block: { life: 0 }                   // rubble stays until rebuilt
};
IC.MARKS = MARKS;
function inBlock(blocks, x, y) {
  for (const b of blocks) {
    const dx = x - b.x, dy = y - b.y; if (Math.abs(dx) > b.w + b.h || Math.abs(dy) > b.w + b.h) continue;
    const c = Math.cos(b.a || 0), s = Math.sin(b.a || 0), u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) <= b.w / 2 + 0.05 && Math.abs(v) <= b.h / 2 + 0.05) return b;
  }
  return null;
}
/* what is on the ground at a point: a block, a road or street, water, forest, or open ground */
IC.groundAt = function (S, x, y) {
  const W = S.world;
  for (const t of W.cities.concat(W.villages, W.foreign)) {
    if (!t.blocks || U.dxy(x, y, t.x, t.y) > (t.r || 30) * 1.6 + 10) continue;
    const b = inBlock(t.blocks, x, y); if (b) return { kind: 'block', b, town: t };
  }
  if (W.inLake(x, y)) return { kind: 'water' };
  if (W.riverDist(x, y) < 12) for (const r of W.rivers) {
    if (x < r.bb[0] - 20 || x > r.bb[2] + 20 || y < r.bb[1] - 20 || y > r.bb[3] + 20) continue;
    for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (U.segDist(x, y, a[0], a[1], b[0], b[1]) < r.w * 0.15) return { kind: 'water' }; }
  }
  const near = (list, w) => {
    for (const l of list) {
      if (l.bb && (x < l.bb[0] - 1 || x > l.bb[2] + 1 || y < l.bb[1] - 1 || y > l.bb[3] + 1)) continue;
      const hw = (IC.ROAD_W[l.cls] || 0.1) / 2 + w;
      for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i]; if (U.segDist(x, y, a.x, a.y, b.x, b.y) < hw) return l; }
    }
    return null;
  };
  let road = near(W.edges, 0.05) || near(W.lanes, 0.02);
  for (const c of W.cities) if (!road && U.dxy(x, y, c.x, c.y) < c.r * 1.6) road = near(c.streets, 0.05);
  if (road) return { kind: 'road', cls: road.cls, road };
  return { kind: W.forestAt(x, y) ? 'forest' : 'field' };
};
/* the mark a weapon leaves where it lands (the block itself is hurt by blockHit) */
IC.impactMark = function (S, x, y, dmg, gnd) {
  gnd = gnd || IC.groundAt(S, x, y);
  const k = Math.max(0, dmg);
  if (gnd.kind === 'water') return null;
  if (gnd.kind === 'airfield') return IC.addMark(S, { kind: 'paving', x, y, r: 0.2 + k * 0.002 });
  if (gnd.kind === 'block') return IC.addMark(S, { kind: 'scorch', x, y, r: 0.15 + k * 0.003, life: MARKS.field.life });
  // crater radius about 3 m for a rocket, 8 m for a 500 kg bomb; the scorch reaches five times as far
  const cr = 0.03 + k * 0.0005, m = { kind: gnd.kind, x, y, r: cr * 7, cr, seed: Math.random() * 1000 };
  if (gnd.kind === 'road') { m.cls = gnd.cls; m.cr = Math.min(cr, (IC.ROAD_W[gnd.cls] || 0.1) * 0.6); m.r = m.cr * 3; if (gnd.road.id) m.edge = gnd.road.id; }
  return IC.addMark(S, m);
};
IC.crater = (S, x, y, r) => IC.impactMark(S, x, y, Math.max(20, (r - 1.5) / 0.025));
IC.addMark = function (S, m) {
  const M = S.marks || (S.marks = []);
  const D = MARKS[m.kind] || MARKS.field;
  m.t = S.time; m.id = IC.nid('mk');
  if (m.life == null) m.life = D.life;
  if (D.fix) m.fixAt = S.time + D.fix * (S.enemy && S.enemy.war ? 1.6 : 1) * U.rand(0.7, 1.3);
  // a long war leaves thousands: past the cap the oldest fading marks go first
  if (M.length > 2500) { M.sort((a, b) => (a.life ? 0 : 1) - (b.life ? 0 : 1) || a.t - b.t); M.splice(0, 300); }
  M.push(m);
  IC.bakeMark && IC.bakeMark(S, m);
  return m;
};
/* older callers: a destroyed block, a crater of radius r, a burnt patch on an airfield */
IC.addScar = (S, s) => s.kind === 'block' ? IC.blockHit(S, s.b, 999) : s.kind === 'burn' ? IC.addMark(S, { kind: 'paving', x: s.x, y: s.y, r: s.r }) : IC.impactMark(S, s.x, s.y, Math.max(20, (s.r - 0.5) * 60));
/* a block takes damage: 1 whole, 0 gone. Returns true if this destroyed it */
IC.blockHit = function (S, b, dmg) {
  if (!b || b.hp <= 0 || dmg <= 0) return false;
  const was = b.hp;
  b.hp = Math.max(0, b.hp - dmg / 60);
  b.hitT = S.time;
  if (b.hp < was && Math.random() < (b.hp <= 0 ? 0.7 : 0.25)) IC.addFire(S, b.x, b.y, b.hp <= 0 ? 0.5 + Math.random() * 0.5 : 0.3, U.rand(1800, 7200) * (b.hp <= 0 ? 1 : 0.4));
  IC.bakeBlock && IC.bakeBlock(S, b);
  return b.hp <= 0;
};
/* marks age: faded ones go, filled craters turn into patches */
IC.marksAge = function (S) {
  const M = S.marks; if (!M || !M.length) return;
  let gone = false;
  const D = S.econ && S.econ.damaged;
  for (const m of M) {
    // a crater in a road of the network is filled when the road engineers (growth.js) finish; elsewhere in time
    if (m.edge && D && !m.fixed) { if (D.includes(m.edge)) m.seen = true; else if (m.seen) m.fixAt = S.time; }
    if (m.fixAt && !m.fixed && S.time >= m.fixAt && !(m.edge && D && D.includes(m.edge))) { m.fixed = true; IC.bakeMark && IC.bakeMark(S, m, true); }
    if (m.life && S.time - m.t > m.life) { m.gone = true; gone = true; IC.bakeMark && IC.bakeMark(S, m, true); }
  }
  if (gone) S.marks = M.filter(m => !m.gone);
};
IC.hurtInfra = function (S, inf, dmg, src, x, y) {
  if (dmg <= 0) return;
  const was = inf.hp;
  inf.hp = Math.max(0, inf.hp - dmg);
  if (was > 0 && inf.hp <= inf.max * (inf.kind === 'bridge' ? 0.5 : 0) && !inf.offline) {
    inf.offline = true;
    IC.log(S, 'leak', 'LOST', `${inf.name} ${inf.kind === 'bridge' ? 'destroyed; traffic diverted' : 'knocked out'}.`, inf);
    IC.news(S, `${inf.name} ${inf.kind === 'bridge' ? 'collapses' : 'knocked out'} after ${src.d ? src.d.name.toLowerCase() : 'enemy'} strike.`);
    IC.addFire(S, inf.x, inf.y, inf.kind === 'bridge' ? 0.8 : 2, 7200);
    if (inf.kind === 'bridge') IC.bridgeChanged(S);
    if (inf.kind === 'power') { for (const c of IC.cities(S)) if (c.plant === inf.id) IC.cityLights(c); IC.news(S, `Blackouts across the region served by ${inf.name}.`); }
    IC.emit(S, 'infraLost', inf);
  }
};
IC.hurtUnit = function (S, u, dmg, src) {
  if (u.dead || dmg <= 0) return;
  u.hp -= dmg;
  // a hit knocks out one or two parts of the system, not just a health bar
  const comps = Object.keys(u.comp);
  const n = dmg > u.max * 0.5 ? 2 : 1;
  const hitList = [];
  for (let i = 0; i < n && comps.length; i++) {
    const c = comps.splice(Math.floor(Math.random() * comps.length), 1)[0];
    u.comp[c] = Math.max(0, u.comp[c] - U.clamp(dmg / u.max * U.rand(0.8, 1.8), 0.2, 1));
    if (u.comp[c] < 0.35) hitList.push(IC.COMPS[c].name.toLowerCase());
  }
  if (u.hp <= 0) {
    u.dead = true;
    S.stats.unitsLost++;
    IC.explode(S, u.x, u.y, 1.3, 'ground');
    IC.addFire(S, u.x, u.y, 0.9, 2400);
    S.wrecks.push({ x: u.x, y: u.y, type: u.type, t: S.time, h: U.rand(0, 6) });
    IC.log(S, 'leak', 'LOST', `${u.name} (${u.d.name}) destroyed${src && src.d ? ' by ' + src.d.code : ''}.`, u);
    IC.emit(S, 'unitLost', u);
    S.units = S.units.filter(x => x !== u);
    for (const v of S.vehicles) if (v.home === u) v.homeless = true;
    for (const r of S.roster) if (r.base === u.id) r.base = IC.fallbackBase(S, r);
    if (S.sel && S.sel.ref === u) S.sel = null;
    S.group = S.group.filter(x => x !== u);
    for (const x of S.units) if (x.prio === u) x.prio = null;
  } else {
    if (hitList.length) IC.log(S, 'warn', 'DAMAGE', `${u.name} hit: ${hitList.join(' and ')} knocked out.`, u);
    if (u.hp < u.max * 0.4) IC.addFire(S, u.x + U.rand(-2, 2), u.y + U.rand(-2, 2), 0.4, 900);
  }
};
IC.killThreat = function (S, t, by, how) {
  if (t.dead) return;
  t.dead = true;
  S.stats.kills++;
  if (t.op) t.op.done++;
  const big = t.d.cls === 'bal' || t.d.cls === 'hgv';
  IC.explode(S, t.x, t.y, t.d.cls === 'air' ? 1.3 : big ? 1.4 : 0.8, 'air', { big: big && !t.d.pen ? 0.6 : 0 });
  if (t.d.cls === 'air' || t.d.cls === 'ga') for (let i = 0; i < 8; i++) IC.part(S, { x: t.x, y: t.y, vx: U.rand(-30, 30) + t.vx * 20, vy: U.rand(-30, 30) + t.vy * 20, life: U.rand(1, 2.5), size: 1.3, col: '255,170,90', add: true, drag: 0.6 });
  if (t.d.civil) {
    S.stats.civLost++;
    for (const c of IC.cities(S)) c.morale = Math.max(0, c.morale - (t.type === 'ga' ? 4 : 12));
    S.support = Math.max(0, S.support - (t.type === 'ga' ? 8 : 25));
    IC.log(S, 'leak', 'CIVIL', `${t.type === 'ga' ? 'Civil light aircraft' : 'Airliner'} ${t.cs} shot down by ${by}. ${t.pax} people on board.`, t);
    IC.news(S, `Tragedy: ${t.type === 'ga' ? 'private plane' : 'airliner'} ${t.cs} shot down over ${S.world.names.H}. ${t.pax} dead. Allies demand answers.`);
    IC.emit(S, 'civilKill', t);
    return;
  }
  for (const c of IC.cities(S)) if (U.dxy(c.x, c.y, t.x, t.y) < 1350) c.morale = Math.min(100, c.morale + 0.25);
  if (t.d.cls !== 'drone' || t.type !== 'owa' || Math.random() < 0.25)
    IC.log(S, 'kill', how || 'SPLASH', `TN ${t.tn || '----'} ${t.aff === 'H' ? t.d.code : 'UNK'} destroyed by ${by}.`);
  if (t.home && t.d.cls === 'air') IC.enemyAircraftLost(S, t);
  IC.emit(S, 'kill', t);
};
IC.hitConvoy = function (S, v, what) {
  if (v.dead) return;
  v.trucks--;
  IC.explode(S, v.x, v.y, 0.7, 'ground');
  S.wrecks.push({ x: v.x + U.rand(-4, 4), y: v.y + U.rand(-4, 4), type: 'truck', t: S.time, h: v.h || 0 });
  IC.addFire(S, v.x, v.y, 0.5, 900);
  if (v.job && v.job.qty) v.job.qty = Math.max(0, Math.floor(v.job.qty * v.trucks / (v.trucks + 1)));
  if (v.trucks <= 0) {
    v.dead = true;
    S.stats.convoysLost++;
    if (v.job) IC.failJob(S, v.job);
    IC.log(S, 'leak', 'CONVOY', `${v.name} destroyed${what ? ' by ' + what : ''} ${IC.nearestPlace(S, v.x, v.y)}.`, v);
    IC.emit(S, 'convoyLost', v);
  } else IC.log(S, 'warn', 'CONVOY', `${v.name} hit${what ? ' by ' + what : ''}; ${v.trucks} trucks left.`, v);
};

/* crews tire while their radars radiate and threats are near, and recover when stood down */
IC.fatigue = function (S, dt) {
  const h = dt / 3600, rest = 12 + S.mobil * 4;
  for (const u of S.units) {
    if (u.state !== 'ready') { u.fat = Math.max(0, u.fat - rest * h); continue; }
    const alert = S.time - (u.alertT || -1e9) < 300;
    if (u.radarOn) u.fat += (alert ? 14 : 2) * h;
    else if (alert) u.fat += 5 * h;
    else u.fat -= rest * h;
    u.fat = U.clamp(u.fat, 0, 100);
    // field crews patch damaged parts slowly
    for (const c in u.comp) if (u.comp[c] < 1) u.comp[c] = Math.min(1, u.comp[c] + h * (u.repairing ? 0.5 : 0.06));
    if (u.repairing && Object.values(u.comp).every(v => v >= 1)) { u.repairing = false; u.hp = u.max; IC.log(S, 'info', 'REPAIR', `${u.name} fully repaired.`); }
    if (u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * h * (u.repairing ? 0.4 : 0.03));
  }
};
IC.fatigueFactor = u => u.fat < 55 ? 1 : 1 - (u.fat - 55) / 150;

IC.gameOver = function (S, why) {
  if (S.over) return;
  S.over = why;
  IC.log(S, 'leak', 'END', why);
  IC.emit(S, 'over', why);
};
IC.victory = function (S, why) {
  if (S.over) return;
  S.over = why; S.won = true;
  IC.log(S, 'kill', 'CEASEFIRE', why);
  IC.emit(S, 'over', why);
};

})(window.IC);
