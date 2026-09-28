/* Iron Canopy — the test range. A flat, empty plane with no story: place any of our radars and launchers, send any
   threat or raid preset from any direction and height, and read what happened: shots, kills, leakers, kill
   probability per system, missiles spent and the cost exchange. A scenario is recorded as it is built, so it can be
   reset and replayed after a balance change, or saved and loaded. The simulation part runs headless. */
(function (IC) {
'use strict';
const U = IC.U;

/* what each enemy weapon costs them, for the cost exchange (₭M) */
IC.THR_COST = { owa: 0.05, jdr: 0.3, lm: 0.1, isr: 1, lacm: 1.5, mcm: 2, scm: 3, glb: 0.2, srbm: 3, marv: 5, mrbm: 8, pen: 0.5, hgv: 20, rkt: 0.1, arm: 0.8, dcy: 0.2, esj: 0.8, ftr: 40, str: 40, sead: 45, ewj: 60, bmr: 150, ahe: 20 };
IC.RANGE_PRESETS = {
  drones: { name: 'Drone swarm', mix: [['owa', 1], ['dcy', 0.2]] },
  cruise: { name: 'Cruise missile salvo', mix: [['lacm', 1], ['esj', 0.15]] },
  ballistic: { name: 'Ballistic salvo', mix: [['srbm', 1]] },
  mixed: { name: 'Mixed raid', mix: [['owa', 1], ['lacm', 0.6], ['esj', 0.15], ['sead', 0.2]], jammer: true },
  sead: { name: 'SEAD strike with jammer', mix: [['sead', 1]], jammer: true },
  big: { name: 'The big one', mix: [['owa', 1.2], ['lacm', 0.8], ['srbm', 0.4], ['mrbm', 0.1], ['esj', 0.2], ['sead', 0.2], ['ahe', 0.15]], jammer: true }
};
IC.RANGE_TYPES = Object.keys(IC.THR).filter(k => !IC.THR[k].civil && k !== 'pen');

/* the plane: every place is flat, the west half is ours and the east half theirs */
function flatten(W) {
  const mid = IC.WW / 2;
  for (const k of Object.keys(W)) if (Array.isArray(W[k])) W[k] = [];
  W.hAt = () => 0.25;
  W.inLake = () => false;
  W.countryAt = x => x < mid ? 'H' : 'A';
  W.inHome = x => x < mid;
  W.inHostile = x => x >= mid;
  W.hostileBorderDist = x => Math.abs(x - mid);
  W.depthOut = x => x - mid;
  W.townAt = () => null;
  W.terrainAt = () => 'open';
  W.farmAt = () => 0;
  const pts = []; for (let y = 60; y <= IC.WH - 60; y += 300) pts.push({ x: mid, y, nx: -1, ny: 0 });
  W.fronts = [{ key: 'A', pts, sectors: [] }];
  W.cx = mid - 900; W.cy = IC.WH / 2;
}

IC.rangeInit = function (S) {
  const W = S.world;
  flatten(W);
  S.flat = true; S.terrain = null; S.clouds = null;
  S.time = 12 * 3600; S.budget = 1e6; S.airspace = 'closed';
  S.tech.done = new Set(IC.TECH.map(t => t.id));
  S.ad.roe = 'free';
  S.layers.civil = false; S.layers.weather = false; S.layers.coverage = true;
  IC.weatherInit(S);
  S.weather.kind = S.weather.prev = 'clear'; S.weather.fade = 1; S.weather.hold = true;
  IC.enemyInit(S);
  S.enemy.war = true; S.enemy.warT = S.time; S.enemy.cycle = { phase: 'range', next: 1e12 };
  IC.aspInit(S);
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: 'Test range', objs: [], sched: [], cool: {}, goal: '' };
  S.byId = {};
  S.callin = null;
  S.reserve = {}; for (const k in IC.UNITS) if (!IC.UNITS[k].callin && !IC.UNITS[k].logi) S.reserve[k] = 99;
  const target = { x: IC.WW / 2 - 900, y: IC.WH / 2 };
  S.range = { target, scen: { units: [], waves: [], target: { x: target.x, y: target.y }, roe: 'free', doctrine: 'sls' }, t0: S.time, pending: [], form: { what: 'drones', n: 8, brg: 90, km: 150, alt: '' } };
  resetStats(S);
  S.camp.focus = { x: target.x, y: target.y, z: 0.12 };
  return S;
};

function resetStats(S) {
  S.range.st = { shots: 0, kills: 0, leaks: 0, launched: 0, sys: {}, mun: {}, ours: 0, theirs: 0, leakCost: 0, byType: {} };
  S.range.op = { id: IC.nid('op'), type: 'range', label: 'test range', launched: 0, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time };
}

/* ---------- building a scenario ---------- */
IC.rangeAddUnit = function (S, type, x, y, o, replay) {
  const u = IC.makeUnit(S, type, x, y, { instant: true });
  for (const m of u.mags) { m.mag = m.max; m.store = m.storeMax; }
  u.fat = 0;
  if (o && o.emcon) u.emcon = o.emcon;
  else if (u.emitter) u.emcon = 'on';
  if (!replay) S.range.scen.units.push({ type, x: Math.round(x), y: Math.round(y), emcon: u.emcon });
  IC.enemyLearn(S, u, 'range');
  return u;
};

/* send threats: spec = { what: type or preset, n, brg (degrees from north, where they come from), km, alt (km, blank for the type's own) } */
IC.rangeSpawn = function (S, spec, replay) {
  const R = S.range, tg = R.target;
  const n = Math.max(1, Math.min(200, Math.round(+spec.n || 1)));
  const a = (+spec.brg - 90) * Math.PI / 180, dist = Math.max(20, (+spec.km || 150) * 10);
  const P = { x: tg.x + Math.cos(a) * dist, y: tg.y + Math.sin(a) * dist };
  const nx = -Math.sin(a), ny = Math.cos(a);
  if (!replay) R.scen.waves.push({ t: Math.round(S.time - R.t0), what: spec.what, n, brg: +spec.brg, km: +spec.km, alt: spec.alt === '' || spec.alt == null ? '' : +spec.alt });
  const pre = IC.RANGE_PRESETS[spec.what];
  const list = [];
  if (pre) { for (const [type, f] of pre.mix) for (let i = 0; i < Math.max(type === 'sead' ? 2 : 1, Math.round(n * f)); i++) list.push(type); }
  else if (IC.THR[spec.what]) for (let i = 0; i < n; i++) list.push(spec.what);
  if (pre && pre.jammer) list.push('ewj');
  list.forEach((type, i) => {
    const off = (i - list.length / 2) * 12;
    const from = { x: P.x + nx * off, y: P.y + ny * off };
    R.pending.push({ t: S.time + i * (IC.THR[type].move === 'bal' ? 8 : 4), fn: () => spawnOne(S, type, from, spec) });
  });
  return list.length;
};
function spawnOne(S, type, from, spec) {
  const R = S.range, tg = R.target, d = IC.THR[type], op = R.op;
  const aim = { x: tg.x + U.rand(-15, 15), y: tg.y + U.rand(-15, 15) };
  const alt = spec.alt === '' || spec.alt == null ? null : +spec.alt;
  const home = { x: from.x, y: from.y };
  let t;
  if (d.move === 'bal') { t = IC.launchBallistic(S, type, from.x, from.y, aim, { op }); t.tr = IC.newTrail(S, 'bal'); }
  else if (d.move === 'hgv') { const L = U.dist(from, aim); t = IC.spawnThreat(S, 'hgv', from.x, from.y, { x0: from.x, y0: from.y, x1: aim.x, y1: aim.y, T: L / 12, apex: 90, aim, op, vx: (aim.x - from.x) / (L / 12), vy: (aim.y - from.y) / (L / 12) }); }
  else if (d.move === 'wp') { const low = d.cls === 'cm' || d.cls === 'drone'; const route = low && type !== 'scm' ? IC.enemyPlanRoute(S, from, aim, true) : [aim]; t = IC.spawnThreat(S, type, from.x, from.y, { route, aim, op, jamming: !!d.jam, altHold: alt }); }
  else if (d.move === 'lm') t = IC.spawnThreat(S, type, from.x, from.y, { route: [aim], aim, op });
  else if (d.move === 'isr') t = IC.spawnThreat(S, type, from.x, from.y, { area: aim, phase: 'out', loiterT: 1800, home });
  else if (d.move === 'arm') { const u = S.units.filter(x => x.radarOn).sort((p, q) => U.dist(p, from) - U.dist(q, from))[0]; if (!u) return; t = IC.spawnThreat(S, 'arm', from.x, from.y, { target: u, aim: { x: u.x, y: u.y }, op }); }
  else if (d.move === 'air') {
    const dir = Math.atan2(aim.y - from.y, aim.x - from.x);
    const o = { home, op, altHold: alt };
    if (type === 'ewj') Object.assign(o, { mission: 'jam', st: { x: from.x, y: from.y }, route: [], jamming: true, jamT: 7200 });
    else if (type === 'sead') { const lp = { x: aim.x - Math.cos(dir) * 900, y: aim.y - Math.sin(dir) * 900 }; Object.assign(o, { mission: 'sead', route: [lp], arms: 2, dcy: 1, tgt: aim }); }
    else if (type === 'bmr') { const st = { x: aim.x - Math.cos(dir) * 1300, y: aim.y - Math.sin(dir) * 1300 }; Object.assign(o, { mission: 'bomber', route: [st], load: 4, tgt: { x: aim.x, y: aim.y, name: 'the target' } }); }
    else if (type === 'ftr') Object.assign(o, { mission: 'patrol', st: { x: aim.x, y: aim.y }, route: [aim], noFire: false });
    else { const rp = { x: aim.x - Math.cos(dir) * (type === 'ahe' ? 60 : 350), y: aim.y - Math.sin(dir) * (type === 'ahe' ? 60 : 350) }; Object.assign(o, { mission: 'strike', route: [rp], tgt: { x: aim.x, y: aim.y, name: 'the target' }, low: type === 'ahe' || (alt != null && alt < 0.5) }); }
    t = IC.spawnThreat(S, type, from.x, from.y, o);
  }
  if (!t) return;
  if (alt != null && d.move !== 'bal' && d.move !== 'hgv') t.alt = alt;
  t.fromHostile = true;
  op.launched++; R.st.launched++;
  const bt = R.st.byType[type] || (R.st.byType[type] = { n: 0, kill: 0, leak: 0 }); bt.n++;
}

/* ---------- the step: only what the range needs ---------- */
IC.rangeStep = function (S, dt) {
  const R = S.range;
  if (R.pending.length) { const due = R.pending.filter(p => p.t <= S.time); if (due.length) { R.pending = R.pending.filter(p => p.t > S.time); for (const p of due) p.fn(); } }
  IC.updateUnits(S, dt);
  IC.reinforce(S, dt);
  IC.updateEmcon(S, dt);
  R.intelT = (R.intelT || 0) - dt;
  if (R.intelT <= 0) { R.intelT = 30; IC.enemyIntel(S); }
  if (S.enemy.pending.length) { const due = S.enemy.pending.filter(p => p.t <= S.time); if (due.length) { S.enemy.pending = S.enemy.pending.filter(p => p.t > S.time); for (const p of due) p.fn(); } }
  IC.updateAir(S, dt);
  IC.sense(S, dt);
  IC.moveThreats(S, dt);
  IC.defense(S, dt);
  IC.updateMissiles(S, dt);
  for (const u of S.units) u.fat = 0;
};

/* ---------- statistics ---------- */
IC.on((S, type, d) => {
  if (!S.range) return;
  const st = S.range.st;
  if (type === 'launch') {
    st.shots++;
    const k = d.u.callin ? 'call-in team' : d.u.type, s = st.sys[k] || (st.sys[k] = { shots: 0, kills: 0 });
    s.shots++;
    const M = IC.MUN[d.mun];
    st.mun[d.mun] = (st.mun[d.mun] || 0) + 1;
    st.ours += M ? M.cost : 0;
  }
  if (type === 'kill' && !d.d.civil) {
    st.kills++;
    st.theirs += IC.THR_COST[d.type] || 0;
    (st.byType[d.type] || (st.byType[d.type] = { n: 0, kill: 0, leak: 0 })).kill++;
    const u = S.units.find(x => x.name === d.killer) || (d.killerType ? { type: d.killerType } : null);
    const k = u ? (u.callin ? 'call-in team' : u.type) : 'other';
    const s = st.sys[k] || (st.sys[k] = { shots: 0, kills: 0 });
    s.kills++;
  }
  if (type === 'arrive') { st.leaks++; st.leakCost += IC.THR_COST[d.t.type] || 0; if (st.byType[d.t.type]) st.byType[d.t.type].leak++; }
});
IC.rangeStats = function (S) {
  const st = S.range.st;
  const sys = Object.entries(st.sys).map(([k, s]) => ({ sys: k, name: IC.UNITS[k] ? IC.UNITS[k].name : k, shots: s.shots, kills: s.kills, pk: s.shots ? s.kills / s.shots : null }));
  return { launched: S.range.op.launched, shots: st.shots, kills: st.kills, leaks: st.leaks, sys, mun: Object.assign({}, st.mun), ours: st.ours, theirs: st.theirs, exchange: st.ours ? st.theirs / st.ours : null, byType: st.byType };
};

/* ---------- reset, save and load ---------- */
IC.rangeClear = function (S) {
  S.units = []; S.threats = []; S.missiles = []; S.strikes = []; S.eaam = []; S.air = [];
  S.range.pending = []; S.enemy.pending = []; S.enemy.known.clear(); S.sel = null; S.group = [];
  S.callin = null; S.strobes = [];
  for (const k of Object.keys(S.fx)) S.fx[k] = [];
  S.range.t0 = S.time;
  resetStats(S);
};
/* play the scenario again from the start: the same units, and each wave at the same moment */
IC.rangeReset = function (S) {
  const sc = S.range.scen;
  IC.rangeClear(S);
  S.range.target = { x: sc.target.x, y: sc.target.y };
  S.ad.roe = sc.roe || 'free'; S.ad.doctrine = sc.doctrine || 'sls';
  for (const u of sc.units) IC.rangeAddUnit(S, u.type, u.x, u.y, u, true);
  for (const w of sc.waves) S.range.pending.push({ t: S.time + w.t, fn: () => IC.rangeSpawn(S, w, true) });
};
IC.rangeNew = function (S) { S.range.scen = { units: [], waves: [], target: { x: S.range.target.x, y: S.range.target.y }, roe: S.ad.roe, doctrine: S.ad.doctrine }; IC.rangeClear(S); };
IC.rangeExport = S => JSON.stringify(Object.assign({}, S.range.scen, { roe: S.ad.roe, doctrine: S.ad.doctrine }));
IC.rangeImport = function (S, json) {
  let sc; try { sc = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return false; }
  if (!sc || !Array.isArray(sc.units) || !Array.isArray(sc.waves)) return false;
  S.range.scen = { units: sc.units, waves: sc.waves, target: sc.target || S.range.target, roe: sc.roe || 'free', doctrine: sc.doctrine || 'sls' };
  IC.rangeReset(S);
  return true;
};

/* ---------- the panel (HTML only; main.js routes its buttons here) ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get() { try { return JSON.parse(localStorage.getItem('ic-range') || '{}'); } catch (e) { return {}; } },
  set(v) { try { localStorage.setItem('ic-range', JSON.stringify(v)); } catch (e) { /* private window */ } }
};
IC.rangePanel = function (S) {
  const R = S.range, F = R.form, st = IC.rangeStats(S);
  const opt = (v, n) => `<option value="${v}" ${F.what === v ? 'selected' : ''}>${esc(n)}</option>`;
  const what = `<optgroup label="Raids">${Object.entries(IC.RANGE_PRESETS).map(([k, p]) => opt(k, p.name)).join('')}</optgroup><optgroup label="One type">${IC.RANGE_TYPES.map(k => opt(k, IC.THR[k].name)).join('')}</optgroup>`;
  const inp = (name, v, w, t) => `<input data-act="rangeForm" name="${name}" value="${esc(v)}" style="width:${w}rem" title="${esc(t)}" inputmode="decimal">`;
  const sys = st.sys.sort((a, b) => b.shots - a.shots).map(s => `<tr><td>${esc(s.name)}</td><td class="r">${s.shots}</td><td class="r">${s.kills}</td><td class="r">${s.pk == null ? '–' : U.pct(s.pk)}</td></tr>`).join('');
  const mun = Object.entries(st.mun).map(([k, n]) => `${n} ${esc(IC.MUN[k] ? IC.MUN[k].short : k)}`).join(' · ');
  const saved = Object.keys(store.get());
  const left = R.pending.length ? ` · ${R.pending.length} to come` : '';
  return `<h3>Test range<em>${S.threats.filter(t => !t.dead).length} in the air${left}</em></h3>
    <p class="hint" style="margin:.2rem 0">Place our systems from the arsenal (they arrive set up and full). Send threats from a bearing and distance at the target ⊕; click Target, then the map, to move it.</p>
    <div class="rl" style="flex-wrap:wrap;gap:.3rem"><select data-act="rangeForm" name="what" style="max-width:13rem">${what}</select>
      ${inp('n', F.n, 3, 'How many')}<span class="muted">×</span> from ${inp('brg', F.brg, 3, 'Bearing they come from, degrees from north')}° at ${inp('km', F.km, 3.2, 'Distance, km')} km · height ${inp('alt', F.alt, 2.6, 'Height in km; blank for the usual height')} km</div>
    <div class="acts"><button class="act pri" data-act="rangeLaunch">Launch</button><button class="act" data-act="rangeTarget">Target</button><button class="act" data-act="rangeReset" title="Play the scenario again from the start">Reset</button><button class="act" data-act="rangeNew" title="Clear everything and start a new scenario">New</button>${IC.replayGallery ? `<button class="act" data-act="rangeGallery" title="Every model in 3D and from above">Models</button>` : ''}</div>
    <div class="sec"><h3 class="sh">Results <em>${st.launched} threats</em></h3>
      <div class="kv"><span>Shots</span><b>${st.shots}</b><span>Kills</span><b>${st.kills}</b><span>Leakers</span><b class="${st.leaks ? 'hostile' : ''}">${st.leaks}</b><span>Missiles spent</span><b>${mun || '–'}</b><span>Cost exchange</span><b>${U.money(st.ours)} spent · ${U.money(st.theirs)} shot down${st.exchange != null ? ` · ${st.exchange.toFixed(1)}:1` : ''}</b></div>
      ${sys ? `<table class="t"><tr><th>System</th><th class="r">Shots</th><th class="r">Kills</th><th class="r">Pk</th></tr>${sys}</table>` : ''}</div>
    <div class="sec"><h3 class="sh">Scenario <em>${R.scen.units.length} units · ${R.scen.waves.length} waves</em></h3>
      <div class="acts"><button class="act" data-act="rangeSave">Save</button><button class="act" data-act="rangeExport" title="Copy the scenario as text">Copy</button><button class="act" data-act="rangeImport" title="Paste a scenario copied before">Paste</button></div>
      ${saved.length ? `<div class="acts">${saved.slice(-8).map(k => `<button class="act" data-act="rangeLoad" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}</div>`;
};
IC.rangeForm = function (S, name, value) { S.range.form[name] = value; };
IC.rangeAct = function (S, a, v) {
  const R = S.range;
  if (a === 'rangeLaunch') IC.rangeSpawn(S, R.form);
  else if (a === 'rangeReset') IC.rangeReset(S);
  else if (a === 'rangeNew') IC.rangeNew(S);
  else if (a === 'rangeTarget') IC.setMode({ kind: 'rangeTarget' });
  else if (a === 'rangeGallery') IC.replayGallery(S);
  else if (a === 'rangeSave') { const name = (typeof prompt === 'function' && prompt('Name this scenario', `Scenario ${Object.keys(store.get()).length + 1}`)) || ''; if (name) { const all = store.get(); all[name] = IC.rangeExport(S); store.set(all); } }
  else if (a === 'rangeLoad') { const all = store.get(); if (all[v]) IC.rangeImport(S, all[v]); }
  else if (a === 'rangeExport') { const j = IC.rangeExport(S); try { navigator.clipboard.writeText(j); IC.toast(S, 'info', 'RANGE', 'Scenario copied.'); } catch (e) { if (typeof prompt === 'function') prompt('Copy the scenario', j); } }
  else if (a === 'rangeImport') { const j = typeof prompt === 'function' ? prompt('Paste a scenario') : ''; if (j && !IC.rangeImport(S, j)) IC.toast(S, 'warn', 'RANGE', 'That is not a scenario.'); }
};

})(window.IC);
