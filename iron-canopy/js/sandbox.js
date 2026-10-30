/* Iron Canopy — the sandbox. The real map and the Quick war's forces with the rules taken off, for trying things:
   money that never runs out, building and deploying that finish at once, and a panel to send any attack at any
   place on demand. The enemy commander waits until it is asked: a planned raid, or switching it on to fight the war
   by itself. The simulation part runs headless; the panel is HTML only (main.js routes its buttons here). */
(function (IC) {
'use strict';
const U = IC.U;

/* the rules the player can switch, with the words the panel shows for each */
IC.SBX_RULES = [
  { k: 'free', name: 'Free money', on: true, tip: 'The treasury never runs dry: build and buy whatever you like.' },
  { k: 'instant', name: 'Instant build', on: true, tip: 'Airport parts, roads and repairs finish at once; units arrive set up wherever you place them.' },
  { k: 'ammo', name: 'Endless missiles', on: false, tip: 'Our launchers reload the moment they fire.' },
  { k: 'stock', name: 'Enemy never runs out', on: true, tip: 'Their launch sites keep enough weapons for any raid you ask for.' },
  { k: 'auto', name: 'Enemy attacks by itself', on: false, tip: 'The enemy commander plans and flies its own raids, as in a Quick war. Off: nothing comes unless you send it.' },
  { k: 'war', name: 'At war', on: false, tip: 'At war, foreign airlines stay away and the enemy fights back. At peace, airliners fly and your weapons stay on their rules.' }
];
/* where an attack is launched from */
IC.SBX_FROM = { close: 'Close by: 100 km out', border: 'From across the border', bearing: 'A bearing and distance' };
/* the raids the enemy commander can be asked to plan (its own mix of weapons for the target) */
IC.SBX_RAIDS = { limited: 'Limited strike', pressure: 'Combined raid', sead: 'Strike on our radars', saturate: 'Saturation raid', shock: 'Major strike' };

IC.sandboxInit = function (S) {
  const E = S.enemy, c = IC.cap(S);
  S.sbx = { form: { what: 'drones', n: 8, from: 'close', brg: 0, km: 150, alt: '', raid: 'pressure' }, target: { x: c.x, y: c.y, name: c.name, ref: c.id }, st: { launched: 0, kills: 0, leaks: 0 }, ops: 0 };
  for (const r of IC.SBX_RULES) S.sbx[r.k] = r.on;
  E.allow = new Set();   // at peace, no reconnaissance of its own (setWar lets it fight)
  S.tech.done = new Set(IC.TECH.map(t => t.id));
  S.budget = 1e6;
  S.camp.chapter = 'Sandbox';
  S.camp.goal = 'Build, deploy and attack as you like. Nothing here counts.';
  IC.say(S, 'CDS', 'This is the sandbox. Money is free and everything you build or deploy is ready at once. The enemy does nothing until you send an attack from the panel on the left: pick what, how many and where, then Launch.');
};

/* ---------- the rules, every step ---------- */
IC.sandboxTick = function (S, dt) {
  const X = S.sbx, E = S.enemy;
  if (X.free && S.budget < 5e5) S.budget = 1e6;
  if (X.instant) instant(S);
  if (X.ammo) for (const u of S.units) if (u.state === 'ready') for (const m of u.mags) m.mag = m.max;
  if (X.stock && (X.stockT = (X.stockT || 0) - dt) <= 0) {
    X.stockT = 60;
    for (const s of S.esites) {
      if (s.regen) for (const k in s.regen) s.inv[k] = Math.max(s.inv[k] || 0, (s.hold && s.hold[k] || 0) + 40);
      if (s.acAvail) for (const a in s.acMax) s.acAvail[a] = Math.max(s.acAvail[a], 1);
    }
  }
  // the commander sits on its hands between the raids it is asked for
  if (!X.auto && E.war && E.cycle && !(S.wp && S.wp.R)) {
    if (E.cycle.phase === 'buildup') E.cycle = { phase: 'calm', next: S.time + 3600, since: S.time };
    else if (E.cycle.phase === 'calm') E.cycle.next = Math.max(E.cycle.next, S.time + 3600);
  }
};
/* everything under way finishes now: airport works (paid in full if money is not free), roads, units on the move */
function instant(S) {
  for (const b of IC.bases(S)) {
    if (!b.parts || !b.works || !b.works.length) continue;
    b.crews = Math.max(b.crews || 1, b.works.length);
    for (const w of b.works) {
      if (w.prog >= 1) continue;
      if (w.stages && !S.sbx.free) S.budget -= Math.max(0, (w.cost || 0) - (w.spent || 0));
      w.prog = 1;
    }
  }
  if (S.econ && S.econ.works) for (const w of S.econ.works) w.prog = 1;
  if (S.world.edges) for (const e of S.world.edges) if (e.cut) { e.cond = 1; e.cut = false; S.sbx.roads = true; }
  if (S.sbx.roads) { S.sbx.roads = false; IC.roadsChanged(S); }
  for (const u of S.units) {
    if (u.state === 'transit' || (u.state === 'packing' && u.dest)) {
      if (u.toReserve) { if (u.state === 'packing') u.stT = 0; continue; }
      u.x = u.dest.x; u.y = u.dest.y; u.route = null; u.moved = true; u.deliver = false; u.airlift = false;
      u.state = 'setup'; u.stT = 0;
    } else if (u.state === 'building' || u.state === 'setup') u.stT = 0;
  }
}

/* ---------- attacks ---------- */
/* the nearest point across a hostile border from p: its bearing (radians, 0 = east) and distance in units */
function borderOf(S, p) {
  let best = null;
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24, cx = Math.cos(a), cy = Math.sin(a);
    for (let d = 50; d <= 40000 && (!best || d < best.d); d += 50) {
      const x = p.x + cx * d, y = p.y + cy * d;
      if (x < 0 || y < 0 || x > IC.WW || y > IC.WH) break;
      if (IC.inHostile(x, y)) { best = { a, d }; break; }
    }
  }
  return best || { a: -Math.PI / 2, d: 1500 };
}
/* where an attack comes from, by the form (the panel's own by default): { x, y, words } */
IC.sandboxFrom = function (S, F) {
  const X = S.sbx, T = X.target;
  F = F || X.form;
  if (F.from === 'bearing') {
    const a = (+F.brg - 90) * Math.PI / 180, d = Math.max(20, (+F.km || 150) * 10);
    return { x: T.x + Math.cos(a) * d, y: T.y + Math.sin(a) * d, words: `${F.brg}° · ${F.km} km` };
  }
  const k = X._bk === `${T.x},${T.y}` && X._b ? X._b : (X._b = borderOf(S, T));
  X._bk = `${T.x},${T.y}`;
  const d = F.from === 'close' ? 1000 : k.d + 300;
  return { x: T.x + Math.cos(k.a) * d, y: T.y + Math.sin(k.a) * d, words: F.from === 'close' ? '100 km out, from the border side' : `from across the border, ${U.km(d)} away` };
};
/* set the target: a thing with a place (a city, airport, unit) or a point on the map, named by what is nearest.
   z (the map's zoom) is given for a click: a unit is the target only when the click lands on its symbol, so a click
   beside one still means the place */
IC.sandboxTarget = function (S, p, z) {
  let ref = p && p.id ? IC.baseOf(S, p.id) || null : null;
  if (!ref && z) { const r = 16 / z, u = S.units.filter(u => !u.dead && U.dist(u, p) < r).sort((a, b) => U.dist(a, p) - U.dist(b, p))[0]; if (u) { ref = u; p = u; } }
  if (!ref) { const near = S.infra.filter(i => U.dist(i, p) < Math.max(50, i.r || 0)).sort((a, b) => U.dist(a, p) - U.dist(b, p))[0]; ref = near || null; }
  S.sbx.target = { x: p.x, y: p.y, name: ref ? ref.name : IC.nearPlace(S, p.x, p.y), ref: ref ? ref.id : null };
};
/* what a launch sends, by the form: a raid's mix is scaled to the count, with at least one of each kind (two SEAD
   aircraft) and its jammer, so it can be more than the count */
IC.sandboxList = function (F) {
  const n = Math.max(1, Math.min(200, Math.round(+F.n || 1))), pre = IC.RANGE_PRESETS[F.what], list = [];
  if (pre) { for (const [type, f] of pre.mix) for (let i = 0; i < Math.max(type === 'sead' ? 2 : 1, Math.round(n * f)); i++) list.push(type); if (pre.jammer) list.push('ewj'); }
  else if (IC.THR[F.what]) for (let i = 0; i < n; i++) list.push(F.what);
  return list;
};
/* send what the form says at the target: returns how many are on their way */
IC.sandboxLaunch = function (S, spec) {
  const X = S.sbx, F = Object.assign({}, X.form, spec), T = X.target;
  const from = IC.sandboxFrom(S, F);
  const a = Math.atan2(T.y - from.y, T.x - from.x), nx = -Math.sin(a), ny = Math.cos(a);
  const pre = IC.RANGE_PRESETS[F.what], list = IC.sandboxList(F);
  if (!list.length) return 0;
  const op = { id: IC.nid('op'), type: 'sandbox', label: `${pre ? pre.name : IC.THR[F.what].name} at ${T.name}`, launched: 0, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time, sbx: true };
  const alt = F.alt === '' || F.alt == null ? null : +F.alt;
  list.forEach((type, i) => {
    const off = (i - list.length / 2) * 12, at = { x: from.x + nx * off, y: from.y + ny * off };
    const aim = { x: T.x + U.rand(-15, 15), y: T.y + U.rand(-15, 15) };
    S.enemy.pending.push({ t: S.time + i * (IC.THR[type].move === 'bal' ? 8 : 4), fn: IC.hfn('sbxOne', S, type, at, aim, alt, op) });
  });
  X.ops++;
  IC.log(S, 'warn', 'SANDBOX', `${list.length} launched at ${T.name}: ${pre ? pre.name.toLowerCase() : IC.THR[F.what].name}, ${from.words}.`, T);
  return list.length;
};
IC.H.sbxOne = (S, type, at, aim, alt, op) => () => { if (IC.sendThreat(S, type, at, aim, alt, op)) S.sbx.st.launched++; };
/* the enemy commander plans a raid of its own choosing on the target, with its warning and its report after */
IC.sandboxRaid = function (S, kind) {
  const E = S.enemy, T = S.sbx.target, ref = T.ref && IC.baseOf(S, T.ref);
  if (!E.war) setWar(S, true);
  const obj = { x: T.x, y: T.y, name: T.name, ref: ref || null };
  if (ref) obj.set = ref.kind === 'city' ? 'city' : ref.kind === 'airbase' ? 'airbase' : ref.kind === 'airport' ? 'trade' : ref.kind === 'power' ? 'city' : ref.kind === 'factory' ? 'trade' : 'transport';
  E.raid = null;
  const op = IC.enemyForceOp(S, 'raid', obj, { kind: kind || 'pressure', T: 1500 });
  // its weapons count in the panel's tally (sent, shot down, got through)
  if (E.raid) { E.raid.sbx = true; (S.sbx.raids || (S.sbx.raids = [])).push(E.raid); }
  IC.log(S, 'warn', 'SANDBOX', `The enemy is planning a ${(IC.SBX_RAIDS[kind] || 'raid').toLowerCase()} on ${T.name}. It strikes in about 25 min.`, T);
  return op;
};
function setWar(S, on) {
  const E = S.enemy;
  S.sbx.war = on;
  if (on && !E.war) { E.allow = null; E.war = true; E.warT = S.time; E.actT = S.time; E.aimT = S.time; if (!E.act) E.act = 1; E.cycle = { phase: 'calm', next: S.time + 3600, since: S.time }; IC.log(S, 'leak', 'SANDBOX', `The country is at war with ${S.world.names.A}.`); }
  else if (!on && E.war) { E.allow = new Set(); E.war = false; E.raid = null; E.cycle = null; IC.log(S, 'info', 'SANDBOX', 'Back at peace. Anything already in the air keeps coming.'); }
}
/* take every enemy weapon and aircraft out of the sky, and what was about to launch */
IC.sandboxClear = function (S) {
  let n = 0;
  for (const t of S.threats) if (!t.dead && !t.d.civil) { t.dead = true; n++; }
  const due = S.enemy.pending.length;
  S.enemy.pending = [];
  if (S.enemy.raid) { S.enemy.raid = null; if (S.enemy.cycle) S.enemy.cycle = { phase: 'calm', next: S.time + 3600, since: S.time }; }
  IC.log(S, 'info', 'SANDBOX', n || due ? `Sky cleared: ${n} enemy weapon${n === 1 ? '' : 's'} and aircraft taken out of the air${due ? `, ${due} launch${due === 1 ? '' : 'es'} called off` : ''}.` : 'Sky cleared: there was nothing of theirs in the air.');
  return n;
};
/* mend everything: units, airports, cities, power, roads */
IC.sandboxRepair = function (S) {
  let n = 0;
  for (const u of S.units) { if (u.hp < u.max || Object.values(u.comp || {}).some(c => c < 1)) n++; u.hp = u.max; for (const k in u.comp) u.comp[k] = 1; u.repairing = false; }
  for (const i of S.infra) {
    if (i.max && i.hp < i.max) n++;
    if (i.max) i.hp = i.max;
    i.offline = false;
    if (i.blocks) { let hit = false; for (const b of i.blocks) if (b.hp < 1) { b.hp = 1; hit = true; } if (hit) { const r = (i.r || 30) * 2; IC.worldChanged(S, { x0: i.x - r, y0: i.y - r, x1: i.x + r, y1: i.y + r }); } }
  }
  for (const b of IC.bases(S)) {
    if (!b.parts) continue;
    for (const p of b.parts) {
      if (p.max) p.hp = p.max;
      if (p.craters) p.craters = [];
      if (p.cut) p.cut = {};
      p.burning = 0; p.scorch = null;
      for (const s of p.stands || []) s.hp = 1;
    }
    if (b.works) b.works = b.works.filter(w => w.kind !== 'repair');
    b.dirty = true; b.cfg = null; IC.aptStats(S, b);
  }
  let roads = false;
  let nr = 0;
  for (const e of S.world.edges) if (e.cut || (e.cond != null && e.cond < 1)) { e.cond = 1; e.cut = false; roads = true; nr++; }
  if (roads) IC.roadsChanged(S);
  IC.log(S, 'info', 'SANDBOX', n || nr ? `Repaired: ${n} unit${n === 1 ? '' : 's'} and place${n === 1 ? '' : 's'}${nr ? `, ${nr} road${nr === 1 ? '' : 's'}` : ''}, and every airport, all as new.` : 'Repaired: nothing was damaged. Every airport is as new.');
  return n + nr;
};
/* the score of what was sent: shot down and got through */
IC.on((S, type, d) => {
  if (!S.sbx) return;
  if (type === 'kill' && mine(d.op)) S.sbx.st.kills++;
  if (type === 'arrive' && mine(d.t.op)) S.sbx.st.leaks++;
});
const mine = op => !!op && (op.sbx || !!(op.raid && op.raid.sbx));
/* how many have been sent from the panel and by the raids the enemy was asked to plan */
IC.sandboxSent = function (S) {
  let n = S.sbx.st.launched;
  for (const R of S.sbx.raids || []) for (const op of new Set(R.ops)) n += op.launched || 0;
  return n;
};

/* ---------- the panel ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mixWords = list => { const c = {}; for (const k of list) c[k] = (c[k] || 0) + 1; return Object.entries(c).map(([k, v]) => `${v}× ${IC.THR[k].name.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())}`).join(', '); };
IC.sandboxPanel = function (S) {
  const X = S.sbx, F = X.form, st = X.st, T = X.target;
  const opt = (v, n, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(n)}</option>`;
  const what = `<optgroup label="Raids">${Object.entries(IC.RANGE_PRESETS).map(([k, p]) => opt(k, p.name, F.what)).join('')}</optgroup><optgroup label="One type">${IC.RANGE_TYPES.map(k => opt(k, IC.THR[k].name, F.what)).join('')}</optgroup>`;
  const from = Object.entries(IC.SBX_FROM).map(([k, n]) => opt(k, n, F.from)).join('');
  const raid = Object.entries(IC.SBX_RAIDS).map(([k, n]) => opt(k, n, F.raid)).join('');
  const inp = (name, v, w, t) => `<input data-act="sbxForm" name="${name}" value="${esc(v)}" style="width:${w}rem" title="${esc(t)}" inputmode="decimal">`;
  const list = IC.sandboxList(F), n = Math.max(1, Math.min(200, Math.round(+F.n || 1)));
  const up = S.threats.filter(t => !t.dead && !t.d.civil).length, sel = S.sel && S.sel.ref && S.sel.ref.x != null;
  const rules = IC.SBX_RULES.map(r => `<button class="btn sm sbx-rule" data-act="sbxRule" data-v="${r.k}" aria-pressed="${!!X[r.k]}" title="${esc(r.tip)}">${X[r.k] ? '✓' : '○'} ${esc(r.name)}</button>`).join('');
  const btn = (act, v, text, tip, cls) => `<button class="btn sm ${cls || ''}" data-act="${act}"${v ? ` data-v="${v}"` : ''}${tip ? ` title="${esc(tip)}"` : ''}>${text}</button>`;
  const row = 'class="rl" style="flex-wrap:wrap;gap:.3rem;align-items:center"';
  return `<h3 data-act="briefMin" title="Collapse or expand">Sandbox<em>${up} enemy in the air</em></h3>
    <div ${row}><span class="muted">Target</span> <b>${esc(T.name)}</b></div>
    <div ${row}>${btn('sbxPick', '', 'Pick on the map', 'Then click anywhere on the map')}${btn('sbxAt', 'cap', 'Capital')}${btn('sbxAt', 'base', 'Air base')}${sel ? btn('sbxAt', 'sel', 'Selected', 'What you have selected') : ''}</div>
    <div ${row}><select data-act="sbxForm" name="what" style="max-width:12rem">${what}</select>${inp('n', F.n, 2.6, IC.RANGE_PRESETS[F.what] ? 'How many of the main weapon: the rest of the mix is scaled to it' : 'How many')}<button class="act pri" data-act="sbxLaunch">Launch</button></div>
    ${list.length !== n ? `<p class="hint" style="margin:0" title="${esc(mixWords(list))}">Sends ${list.length} in all, with the rest of the mix</p>` : ''}
    <div ${row}><select data-act="sbxForm" name="from" style="max-width:12rem" title="Where they are launched from">${from}</select>${F.from === 'bearing' ? `${inp('brg', F.brg, 2.6, 'Bearing they come from, degrees from north')}° ${inp('km', F.km, 2.8, 'Distance, km')} km ·` : ''} height ${inp('alt', F.alt, 2.2, 'Height in km; blank for their usual height')} km</div>
    <div ${row}><select data-act="sbxForm" name="raid" style="max-width:12rem" title="The enemy picks its own weapons for the target, warns you through intelligence, and reports after">${raid}</select>${btn('sbxRaid', '', 'Enemy plans it', 'The enemy chooses its own mix of weapons for the target; intelligence warns you about 25 min ahead, and a report follows')}</div>
    <p class="hint" style="margin:0">Sent ${IC.sandboxSent(S)} · <span class="ok">shot down ${st.kills}</span> · <span class="${st.leaks ? 'hostile' : ''}">got through ${st.leaks}</span></p>
    <div ${row}>${rules}</div>
    <div ${row}><button class="btn sm pri" data-act="wp" data-v="open" title="Play their staff: place their batteries and plan their waves, fly them here, and export the plan for the game">War planner</button>${btn('sbxClear', '', 'Clear the sky', 'Take every enemy weapon and aircraft out of the sky')}${btn('sbxRepair', '', 'Repair everything', 'Units, airports, cities, power stations and roads, all as new')}</div>`;
};
IC.sandboxForm = function (S, name, value) { S.sbx.form[name] = value; };
IC.sandboxAct = function (S, a, v) {
  const X = S.sbx;
  if (a === 'sbxLaunch') { const n = IC.sandboxLaunch(S); if (S.paused && n) S.paused = false; }
  else if (a === 'sbxRaid') { IC.sandboxRaid(S, X.form.raid); if (S.paused) S.paused = false; }
  else if (a === 'sbxClear') IC.sandboxClear(S);
  else if (a === 'sbxRepair') IC.sandboxRepair(S);
  else if (a === 'sbxPick') IC.setMode({ kind: 'sbxTarget' });
  else if (a === 'sbxAt') {
    const p = v === 'cap' ? IC.cap(S) : v === 'base' ? IC.mainBase(S) : S.sel && S.sel.ref;
    if (p && p.x != null) IC.sandboxTarget(S, p);
  } else if (a === 'sbxRule') {
    if (v === 'war') setWar(S, !X.war);
    else if (v === 'auto') {
      X.auto = !X.auto;
      if (X.auto) { S.enemy.allow = null; if (!S.enemy.war) { IC.enemyOpening(S, { act: 2 }); X.war = true; } }
      else if (!S.enemy.war) S.enemy.allow = new Set();
    } else X[v] = !X[v];
  }
};

})(window.IC);
