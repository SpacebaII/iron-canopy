/* Iron Canopy — the war planner (brief 77), DOM: in the Sandbox, on the Career's map, the player plays the enemy's
   staff. Place their batteries on their soil (any weapon family and version, how many launchers, how much stock),
   then write the waves: when each comes, and for each hit which battery fires how many rounds at what, and when they
   should land against the wave's peak. The map draws every battery, its air defence's reach, and the lines of the
   wave being written with how long each weapon flies. Fly it now runs the wave against the Sandbox's defence. Save
   keeps plans in this browser; Export downloads the plan as the file the game loads (js/war-<map>.js), to send in. */
(function (IC) {
'use strict';
const U = IC.U;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const P = IC.planner = { on: false, tab: 'waves', bat: null, wave: null, hit: -1, tool: null, msg: '', form: { w: 'srbm', tier: '', n: 4, salvo: '', stock: '', R: 600 } };
const KEY = 'ic.warplans';
const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const saved = () => { try { return JSON.parse((store() && store().getItem(KEY)) || '{}'); } catch (e) { return {}; } };
const plan = S => S.wp && S.wp.plan;
const mapName = S => S.world.map || 'homeland';

/* the families a battery can be, in the order the menu shows them */
const FAMS = ['srbm', 'marv', 'mrbm', 'hgv', 'rkt', 'lacm', 'mcm', 'scm', 'owa', 'jdr', 'lm', 'dcy', 'esj', 'str', 'sead', 'bmr', 'ahe', 'ewj', 'sam'];
const famName = w => w === 'sam' ? 'their air defence (guards against our strikes)' : IC.ARMS[w] ? IC.ARMS[w].fam : w;
const tierNick = (S, B) => { const v = B.tier ? IC.armsVer(B.tier) : IC.ARMS[B.w] && IC.armsVer(IC.armsKey(S, B.w)); return v ? v.nick : B.w === 'sam' ? 'air defence' : B.w; };
const WHEN = [['prev', 'After the wave before'], ['war', 'Hours after the war starts'], ['after', 'After another wave ends'], ['flag', 'After a story flag is set'], ['beat', 'After a story beat']];
const whenKind = w => { const h = w.when || {}; return h.war != null ? 'war' : h.after ? 'after' : h.flag ? 'flag' : h.beat ? 'beat' : 'prev'; };
const whenWords = w => { const h = w.when || {}, hr = v => Array.isArray(v) ? `${v[0]}–${v[1]} h` : `${v} h`; const k = whenKind(w);
  return w.retaliation ? 'whenever we strike their soil' : k === 'war' ? `${hr(h.war)} into the war` : k === 'after' ? `${hr(h.h != null ? h.h : [2.5, 4])} after ${h.after}` : k === 'flag' ? `when "${h.flag}" is set` : k === 'beat' ? `after the beat "${h.beat}"` : `${hr(w.gap || [2.5, 4])} after the wave before`; };
const SPECIAL = [['apt:busiest', 'Our busiest airport'], ['apt:capital', "The capital's airport"], ['apt:north', 'Our airport nearest the border'], ['base:main', 'Our main air base'], ['command:capital', 'The government quarter'], ['ad:radar', 'A radar they know of'], ['ad:sam', 'A missile battery they know of'], ['ad:busiest', 'The battery that fired most'],
  ...Object.keys(IC.ESETS).map(k => ['set:' + k, `The best of ${IC.ESETS[k].name}`])];

/* ---------- opening ---------- */
IC.plannerOpen = function (S, on) {
  P.on = on == null ? !P.on : on;
  if (P.on && !S.wp) { IC.warPlanInit(S, IC.WAR_PLANS[mapName(S)] || { name: 'New plan', batteries: [], waves: [] }); S.wp.manual = !(S.sbx && S.sbx.auto); }
  if (P.on && S.wp) S.wp.manual = !(S.sbx && S.sbx.auto);
  if (!P.on) { P.tool = null; if (S.mode2 && S.mode2.kind === 'wpPlan') IC.setMode(null); }
  document.getElementById('app').classList.toggle('is-plan', P.on);
};
const rebuild = S => { IC.wpRebuild(S); S.wp.manual = !(S.sbx && S.sbx.auto); };
const tool = (S, t) => { P.tool = t; IC.setMode(t ? { kind: 'wpPlan', t } : null); };

/* ---------- the panel ---------- */
IC.plannerPanel = function (S) {
  const X = S.wp, A = plan(S);
  if (!A) return '';
  const btn = (v, text, tip, cls, on) => `<button class="btn sm ${cls || ''}" data-act="wp" data-v="${v}"${tip ? ` title="${esc(tip)}"` : ''}${on != null ? ` aria-pressed="${!!on}"` : ''}>${text}</button>`;
  const inp = (name, v, w, t, type) => `<input data-act="wpForm" name="${name}" value="${esc(v == null ? '' : v)}" style="width:${w}rem" title="${esc(t || '')}"${type ? ` type="${type}"` : ''}>`;
  const sel = (name, cur, opts, t) => `<select data-act="wpForm" name="${name}" title="${esc(t || '')}">${opts.map(([v, n]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const row = 'class="rl" style="flex-wrap:wrap;gap:.3rem;align-items:center"';
  const store = Object.keys(saved());
  let h = `<h3>War planner<em>${esc(A.name)} · ${A.batteries.length} batteries · ${A.waves.length} waves</em></h3>
    <div ${row}>${inp('name', A.name, 11, 'The plan’s name')}${btn('save', 'Save', 'Keep this plan in this browser')}${btn('export', 'Export file', 'Download the plan as the file the game loads, to send in')}${btn('copy', 'Copy', 'Copy the file to the clipboard')}</div>
    <div ${row}>${btn('load:career', 'The Career’s plan', 'Start again from the plan the Career flies')}${btn('new', 'Empty plan')}<label class="btn sm" title="Load a plan file you exported">Import…<input type="file" accept=".js,.json,.txt" data-act="wpFile" hidden></label>${store.length ? sel('slot', '', [['', 'Saved plans…']].concat(store.map(k => [k, k])), 'A plan you saved in this browser') : ''}${btn('close', 'Close', 'Back to the Sandbox panel')}</div>
    ${P.msg ? `<p class="hint">${esc(P.msg)}</p>` : ''}
    <nav class="pages">${['waves', 'bats'].map(t => `<button data-act="wp" data-v="tab:${t}" aria-pressed="${P.tab === t}">${t === 'waves' ? 'Waves' : 'Batteries'}</button>`).join('')}</nav>`;
  if (P.tab === 'bats') h += batsPanel(S, X, A, btn, inp, sel, row);
  else h += wavesPanel(S, X, A, btn, inp, sel, row);
  return h;
};
function batsPanel(S, X, A, btn, inp, sel, row) {
  const F = P.form;
  const tiers = IC.ARMS[F.w] ? [['', 'The version of the act']].concat(IC.ARMS[F.w].tiers.map(v => [v.key, `${v.nick} (from act ${v.act})`])) : [['', '—']];
  let h = `<div class="card" style="padding:.5rem .6rem"><b>New battery</b><div ${row}>${sel('f.w', F.w, FAMS.map(w => [w, famName(w)]))}${sel('f.tier', F.tier, tiers, 'Pin a version, or let it follow the act')}</div>
    <div ${row}>launchers ${inp('f.n', F.n, 2.4)} ${F.w === 'sam' ? `reach km ${inp('f.R', F.R / 10, 2.6)}` : `rounds each a wave ${inp('f.salvo', F.salvo, 2.4, `blank: ${IC.WP_W[F.w].salvo}`)} stock ${inp('f.stock', F.stock, 2.8, 'blank: four waves’ worth')}`}</div>
    <div ${row}>${btn('place', P.tool === 'place' ? 'Click on their soil…' : 'Place on the map', 'Then click where it fires from, on their side of the border', 'pri', P.tool === 'place')}</div></div>`;
  const L = Object.values(X.bats);
  h += `<div class="list sk-scroll">${L.map(B => `<button class="li" data-act="wp" data-v="selbat:${B.id}" aria-pressed="${P.bat === B.id}"><b>${esc(B.name)}</b><small>${B.n} × ${esc(tierNick(S, B))} · ${esc(IC.wpSectorWord(IC.wpSector(S, B.x, B.y)))}${B.w === 'sam' ? ` · reach ${U.km(B.R || 600)}` : ` · stock ${Math.floor(B.stock)}`}${IC.wpAlive(B) < B.n ? ` · ${B.n - IC.wpAlive(B)} destroyed` : ''}</small></button>`).join('') || '<p class="hint">No batteries yet: place one.</p>'}</div>`;
  const b = A.batteries.find(x => x.id === P.bat);
  if (b) {
    h += `<div class="card" style="padding:.5rem .6rem"><b>${esc(b.id)}</b><div ${row}>name ${inp('b.name', b.name, 12)}</div>
      <div ${row}>launchers ${inp('b.n', b.n, 2.4)} ${b.w === 'sam' ? `reach km ${inp('b.R', (b.R || 600) / 10, 2.6)}` : `rounds each ${inp('b.salvo', b.salvo, 2.4)} stock ${inp('b.stock', b.stock, 2.8)} replace after h ${inp('b.replace', b.replace || '', 2.2, '0 or blank: a destroyed launcher is gone for good')}`}</div>
      <div ${row}>${btn('movebat', P.tool === 'move' ? 'Click the new place…' : 'Move', '', '', P.tool === 'move')}${btn('delbat', 'Delete', 'Remove it and every hit it fires')}${btn('showbat', 'Show')}</div></div>`;
  }
  return h;
}
function wavesPanel(S, X, A, btn, inp, sel, row) {
  // (one wave open at a time: the rest is a list to pick from)
  const w = A.waves.find(x => x.id === P.wave);
  let h = w ? `<div ${row}>${sel('wave', w.id, A.waves.map((x, i) => [x.id, `${i + 1}. ${x.name || x.id}${x.loop ? ' ↻' : ''} · ${whenWords(x)}`]), 'Pick a wave to edit')}${btn('selwave:', 'All waves')}${btn('addwave', '+ Wave')}</div>`
    : `<div class="list sk-scroll">${A.waves.map((x, i) => `<button class="li" data-act="wp" data-v="selwave:${esc(x.id)}"><b>${i + 1}. ${esc(x.name || x.id)}${x.loop ? ' ↻' : ''}</b><small>${esc(whenWords(x))} · ${(x.hits || []).length} hits</small></button>`).join('') || '<p class="hint">No waves yet.</p>'}</div>
    <div ${row}>${btn('addwave', '+ Wave')}</div><p class="hint">Pick a wave to see its hits on the map. Waves fly in order; one marked ↻ comes round again after the last, until the war ends.</p>`;
  if (!w) return h;
  const k = whenKind(w), wh = w.when || {};
  const others = A.waves.filter(x => x !== w).map(x => [x.id, x.name || x.id]);
  const hrs = v => Array.isArray(v) ? v.join('-') : v == null ? '' : v;
  h += `<div class="card" style="padding:.5rem .6rem;display:grid;gap:.3rem"><div ${row}>${inp('w.name', w.name, 11, 'What intelligence and the report call it')}${btn('upwave', '↑', 'Earlier')}${btn('downwave', '↓', 'Later')}${btn('delwave', 'Delete')}</div>
    <div ${row}>${sel('w.when', k, WHEN)}${k === 'war' ? `${inp('w.war', hrs(wh.war), 3.2, 'Hours, or a range like 3-4')} h` : k === 'after' ? `${sel('w.after', wh.after || '', [['', 'which wave?']].concat(others))} + ${inp('w.h', hrs(wh.h), 3.2)} h` : k === 'flag' ? `${inp('w.flag', wh.flag, 7, 'A story flag, e.g. moreva')} + ${inp('w.h', hrs(wh.h), 2.6)} h` : k === 'beat' ? `${inp('w.beat', wh.beat, 7, 'A story beat id, e.g. embassy')} + ${inp('w.h', hrs(wh.h), 2.6)} h` : `${inp('w.gap', hrs(w.gap || [2.5, 4]), 3.2, 'Hours after the wave before, or a range')} h`}</div>
    <div ${row}><label><input type="checkbox" data-act="wpForm" name="w.night" ${w.night ? 'checked' : ''}> at night</label> <label><input type="checkbox" data-act="wpForm" name="w.loop" ${w.loop ? 'checked' : ''}> repeats after the last wave</label> <label><input type="checkbox" data-act="wpForm" name="w.retaliation" ${w.retaliation ? 'checked' : ''}> their answer to our strikes</label></div>
    <div ${row}>act ${sel('w.act', w.act || '', [['', 'as it is'], [1, '1 probing'], [2, '2 limited'], [3, '3 the shock'], [4, '4 campaign']], 'Moves the enemy on to this act: newer weapon versions come with it')} warning ${inp('w.warn', w.warn != null ? w.warn : 60, 2.4)} min · peak ±${inp('w.vary', w.vary && w.vary.t != null ? Math.round(w.vary.t / 60) : 10, 2.2)} min</div>
    <div ${row}>${inp('w.intel', w.intel || '', 19, 'What intelligence says before it (blank: the usual warning)')}</div></div>`;
  // the hits, each with its timing against the peak
  const hits = (w.hits || []).map((x, i) => {
    const I = IC.wpHitInfo(S, x), B = I && I.B;
    const tgt = SPECIAL.find(s => s[0] === x.at);
    const t = I && I.obj ? `${esc(I.obj.name)} · ${Math.round(I.km)} km · flies ${U.dur(I.flight)} · leaves ${U.dur(Math.max(0, I.lead - (x.t || 0)))} before the peak` : I ? '<span class="hostile">no such target in this game</span>' : '<span class="hostile">no such battery</span>';
    return `<div class="li stack${P.hit === i ? ' on' : ''}"><b>${sel(`h.${i}.bat`, x.bat, Object.values(X.bats).filter(b => b.w !== 'sam').map(b => [b.id, b.name]))}</b>
      <small>${inp(`h.${i}.n`, Array.isArray(x.n) ? x.n.join('-') : x.n, 2.4, 'Rounds, or a range like 4-6')} at ${tgt ? esc(tgt[1]) : esc(IC.wpTargetWords(x.at))} · lands ${inp(`h.${i}.t`, x.t || 0, 2.8, 'Seconds after the peak (negative: before)')} s · chance ${inp(`h.${i}.p`, x.p != null ? Math.round(x.p * 100) : 100, 2.2)}%</small>
      <small>${t}${x.via && x.via.length ? ` · route of ${x.via.length} points` : ''}</small>
      <span class="la">${sel(`h.${i}.at`, tgt ? x.at : '', [['', 'named target…']].concat(SPECIAL))}${btn(`tgt:${i}`, P.tool === 'target' && P.hit === i ? 'Click the target…' : 'Pick on map', '', '', P.tool === 'target' && P.hit === i)}${btn(`via:${i}`, P.tool === 'via' && P.hit === i ? 'Done' : 'Route', 'Click points it flies through, then Done', '', P.tool === 'via' && P.hit === i)}${btn(`delhit:${i}`, '✕')}</span></div>`;
  }).join('');
  h += `<div class="list">${hits || '<p class="hint">No hits yet.</p>'}</div>
    <div ${row}>${btn('addhit', P.tool === 'from' ? 'Click one of their batteries…' : P.tool === 'to' ? 'Now click the target…' : '+ Hit: battery, then target', 'Click a battery on the map, then what it fires at', 'pri', P.tool === 'from' || P.tool === 'to')}${btn(`fly:${w.id}`, 'Fly it now', 'Run this wave against the Sandbox’s defence: it peaks as soon as its slowest weapon can get there')}${btn('rebuild', 'Reset launchers', 'Every battery whole and stocked again')}</div>`;
  return h;
}

/* ---------- the panel's clicks and fields ---------- */
const uid = (A, base) => { let i = 1, id = base; while (A.batteries.some(b => b.id === id) || A.waves.some(w => w.id === id)) id = `${base}${++i}`; return id; };
const num = v => v === '' || v == null || isNaN(+v) ? null : +v;
const range = v => { const m = /^\s*(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*$/.exec(String(v)); return m ? [+m[1], +m[2]] : num(v); };
IC.plannerAct = function (S, v) {
  const [k, a] = String(v).split(':'), A = plan(S);
  P.msg = '';
  if (k === 'open') return IC.plannerOpen(S, true);
  if (k === 'close') return IC.plannerOpen(S, false);
  if (!A) return;
  const w = A.waves.find(x => x.id === P.wave);
  if (k === 'tab') P.tab = a;
  else if (k === 'save') { const all = saved(); all[A.name] = A; try { store().setItem(KEY, JSON.stringify(all)); P.msg = `Saved as "${A.name}" in this browser.`; } catch (e) { P.msg = 'This browser would not keep it: use Export.'; } }
  else if (k === 'export' || k === 'copy') {
    const text = IC.wpFileText(A, mapName(S));
    if (k === 'copy') { try { navigator.clipboard.writeText(text); P.msg = 'Copied: paste it in a message to send it in.'; } catch (e) { P.msg = 'The clipboard is not available: use Export.'; } }
    else { const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); el.download = `war-${mapName(S)}-${A.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.js`; el.click(); P.msg = `Downloaded ${el.download}: send it in and say when in the story it should happen.`; }
  } else if (k === 'load' || k === 'new') {
    S.wp.plan = k === 'new' ? { name: 'New plan', batteries: [], waves: [] } : JSON.parse(JSON.stringify(IC.WAR_PLANS[mapName(S)] || { name: 'New plan', batteries: [], waves: [] }));
    rebuild(S); P.bat = P.wave = null; P.hit = -1;
  } else if (k === 'place') tool(S, P.tool === 'place' ? null : 'place');
  else if (k === 'selbat') { P.bat = a; const B = S.wp.bats[a]; if (B) IC.flyTo(B.x, B.y, Math.max(IC.cam.z, 0.05)); }
  else if (k === 'showbat') { const B = S.wp.bats[P.bat]; if (B) IC.flyTo(B.x, B.y, 0.4); }
  else if (k === 'movebat') tool(S, P.tool === 'move' ? null : 'move');
  else if (k === 'delbat') { A.batteries = A.batteries.filter(b => b.id !== P.bat); for (const x of A.waves) x.hits = (x.hits || []).filter(h => h.bat !== P.bat); P.bat = null; rebuild(S); }
  else if (k === 'selwave') { P.wave = a; P.hit = -1; }
  else if (k === 'addwave') { const id = uid(A, 'w' + (A.waves.length + 1)); A.waves.push({ id, name: 'raid', hits: [] }); P.wave = id; rebuild(S); }
  else if (k === 'delwave' && w) { A.waves = A.waves.filter(x => x !== w); P.wave = null; rebuild(S); }
  else if ((k === 'upwave' || k === 'downwave') && w) { const i = A.waves.indexOf(w), j = i + (k === 'upwave' ? -1 : 1); if (j >= 0 && j < A.waves.length) { A.waves.splice(i, 1); A.waves.splice(j, 0, w); rebuild(S); } }
  else if (k === 'addhit' && w) tool(S, P.tool === 'from' || P.tool === 'to' ? null : 'from');
  else if (k === 'delhit' && w) { w.hits.splice(+a, 1); P.hit = -1; rebuild(S); }
  else if (k === 'tgt' && w) { P.hit = +a; tool(S, P.tool === 'target' ? null : 'target'); }
  else if (k === 'via' && w) { P.hit = +a; if (P.tool === 'via') { tool(S, null); rebuild(S); } else { w.hits[+a].via = []; tool(S, 'via'); } }
  else if (k === 'fly') { rebuild(S); const R = IC.wpFly(S, a); P.msg = R ? `The ${R.name} peaks at ${U.hhmm(R.T)}, in ${U.dur(R.T - S.time)}.${R.note ? ' ' + R.note : ''}` : 'Nothing in it can fly.'; if (S.paused) S.paused = false; }
  else if (k === 'rebuild') { rebuild(S); P.msg = 'Every battery is whole and stocked again.'; }
};
IC.plannerForm = function (S, el) {
  const A = plan(S); if (!A) return;
  const name = el.name, v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.act === 'wpFile') {
    const f = el.files && el.files[0]; if (!f) return;
    f.text().then(t => { try { S.wp.plan = IC.wpParse(t); rebuild(S); P.msg = `Loaded "${S.wp.plan.name}".`; } catch (e) { P.msg = `Could not read it: ${e.message}`; } IC.ui.refresh(true); });
    return;
  }
  if (name === 'name') { A.name = v; return; }
  if (name === 'wave') { P.wave = v; P.hit = -1; return; }
  if (name === 'slot') { const p = saved()[v]; if (p) { S.wp.plan = JSON.parse(JSON.stringify(p)); rebuild(S); P.msg = `Loaded "${p.name}".`; } return; }
  const [g, f, f2] = name.split('.');
  if (g === 'f') { P.form[f] = f === 'w' || f === 'tier' ? v : f === 'R' ? (num(v) || 60) * 10 : v; if (f === 'w') P.form.tier = ''; return; }
  if (g === 'b') {
    const b = A.batteries.find(x => x.id === P.bat); if (!b) return;
    b[f] = f === 'name' ? v : f === 'R' ? (num(v) || 60) * 10 : num(v);
    if (b[f] == null) delete b[f];
    return later(S);
  }
  const w = A.waves.find(x => x.id === P.wave); if (!w) return;
  if (g === 'w') {
    if (f === 'when') { const was = w.when || {}; w.when = v === 'war' ? { war: 1 } : v === 'after' ? { after: A.waves[Math.max(0, A.waves.indexOf(w) - 1)].id, h: [3, 4] } : v === 'flag' ? { flag: '' } : v === 'beat' ? { beat: '' } : {}; if (v === 'prev') delete w.when; void was; }
    else if (f === 'war' || f === 'h') { w.when = w.when || {}; w.when[f] = range(v); }
    else if (f === 'after' || f === 'flag' || f === 'beat') { w.when = w.when || {}; w.when[f] = v; }
    else if (f === 'gap') w.gap = range(v);
    else if (f === 'night' || f === 'loop' || f === 'retaliation') { if (v) w[f] = true; else delete w[f]; }
    else if (f === 'act') { if (v) w.act = +v; else delete w.act; }
    else if (f === 'warn') w.warn = num(v);
    else if (f === 'vary') w.vary = { t: (num(v) || 0) * 60 };
    else if (f === 'intel') { if (v) w.intel = v; else delete w.intel; }
    else w[f] = v;
    return later(S);
  }
  if (g === 'h') {
    const h = w.hits[+f]; if (!h) return;
    if (f2 === 'bat') h.bat = v;
    else if (f2 === 'n') h.n = range(v);
    else if (f2 === 't') h.t = num(v) || 0;
    else if (f2 === 'p') { const p = num(v); if (p == null || p >= 100) delete h.p; else h.p = Math.max(0, p) / 100; }
    else if (f2 === 'at' && v) h.at = v;
    return later(S);
  }
};
// the batteries are made again a moment after typing stops, not on every key
let rbT = null;
function later(S) { clearTimeout(rbT); rbT = setTimeout(() => { if (S.wp) rebuild(S); IC.ui.refresh(true); }, 500); }

/* ---------- map clicks with a planner tool ---------- */
const theirs = (S, p) => IC.inHostile(p.x, p.y);
function batAt(S, p, z) {
  let best = null, bd = 18 / z;
  for (const B of Object.values(S.wp.bats)) { const d = U.dist(B, p); if (d < bd) { bd = d; best = B; } }
  return best;
}
/* what a click on our side means as a target: a place we can name, else the point */
function targetAt(S, p, z) {
  const r = 22 / z;
  const inf = S.infra.filter(i => i.kind !== 'city' && i.kind !== 'bridge' && U.dist(i, p) < Math.max(r, 40)).sort((a, b) => U.dist(a, p) - U.dist(b, p))[0];
  if (inf) return 'infra:' + (inf.id && !/^i\d/.test(inf.id) ? inf.id : inf.name);
  const c = IC.cities(S).filter(c => U.dist(c, p) < Math.max(r, (c.r || 60) * 0.8)).sort((a, b) => U.dist(a, p) - U.dist(b, p))[0];
  if (c) return 'city:' + c.name;
  const pl = (S.world.places || []).filter(q => !q.abroad && U.dist(q, p) < Math.max(r, 40)).sort((a, b) => U.dist(a, p) - U.dist(b, p))[0];
  if (pl) return 'place:' + pl.id;
  return [Math.round(p.x), Math.round(p.y)];
}
IC.plannerClick = function (S, m, p, z) {
  const A = plan(S), w = A && A.waves.find(x => x.id === P.wave), say = (t, col) => IC.text(S, p.x, p.y, t, col || IC.C.amber);
  if (!A) return;
  if (P.tool === 'place') {
    if (!theirs(S, p)) return say('ON THEIR SIDE OF THE BORDER');
    const F = P.form, id = uid(A, F.w), b = { id, name: `${IC.ARMS[F.w] ? cap(IC.ARMS[F.w].fam.replace(/s$/, '')) : 'Air defence'} battery ${A.batteries.filter(x => x.w === F.w).length + 1}`, w: F.w, x: Math.round(p.x), y: Math.round(p.y), n: num(F.n) || 1 };
    if (F.tier) b.tier = F.tier;
    if (F.w === 'sam') b.R = F.R || 600; else { if (num(F.salvo)) b.salvo = num(F.salvo); if (num(F.stock)) b.stock = num(F.stock); }
    A.batteries.push(b); P.bat = id; tool(S, null); rebuild(S);
  } else if (P.tool === 'move') {
    if (!theirs(S, p)) return say('ON THEIR SIDE OF THE BORDER');
    const b = A.batteries.find(x => x.id === P.bat); if (b) { b.x = Math.round(p.x); b.y = Math.round(p.y); delete b.hx; delete b.hy; }
    tool(S, null); rebuild(S);
  } else if (P.tool === 'from' && w) {
    const B = batAt(S, p, z);
    if (!B || B.w === 'sam') return say(B ? 'AIR DEFENCE DOES NOT FIRE AT US' : 'CLICK ONE OF THEIR BATTERIES');
    w.hits = w.hits || []; w.hits.push({ bat: B.id, n: B.salvo * B.n, at: 'base:main', t: 0 }); P.hit = w.hits.length - 1; tool(S, 'to');
  } else if ((P.tool === 'to' || P.tool === 'target') && w && w.hits[P.hit]) {
    if (theirs(S, p)) return say('CLICK SOMETHING ON OUR SIDE');
    w.hits[P.hit].at = targetAt(S, p, z); tool(S, null); rebuild(S);
  } else if (P.tool === 'via' && w && w.hits[P.hit]) {
    (w.hits[P.hit].via = w.hits[P.hit].via || []).push([Math.round(p.x), Math.round(p.y)]);
  }
  IC.ui.refresh(true);
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

})(window.IC);
