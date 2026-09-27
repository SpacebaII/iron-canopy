/* Iron Canopy — the inspector: one panel on the right for whatever is selected. Each kind of thing shows
   what it is doing right now in plain words, its state, and the orders it can take (with their keys). */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const ui = IC.ui, esc = U.esc;
const kbd = ui.kbd, bar = ui.bar;
let S = null;

IC.unitState = function (u) {
  if (u.state === 'transit') return [u.toReserve ? 'Returning to reserve' : `Moving · ${u.eta ? U.dur(Math.max(0, u.eta - S.time)) : ''}`, 'busy'];
  if (u.state === 'building') return [`Building · ${U.dur(u.stT)}`, 'busy'];
  if (u.state === 'setup') return [`Setting up · ${U.dur(u.stT)}`, 'busy'];
  if (u.state === 'packing') return [`Packing · ${U.dur(u.stT)}`, 'busy'];
  if (u.over) return ['Overheated', 'busy'];
  if (u.emitter) return [u.radarOn ? 'Radiating' : u.emcon === 'ambush' ? 'Ambush' : 'Silent', u.radarOn ? 'ok' : 'fr'];
  return ['Ready', 'ok'];
};
const head = (icon, title, sub, pill, cls) => `<div class="ihead">${icon}<div><h2>${esc(title)}</h2><p>${sub}</p></div><button class="x" data-act="desel" aria-label="Close" title="Close (Esc)">✕</button></div>${pill ? `<div style="padding:0 .95rem .5rem"><span class="pill ${cls || ''}">${esc(pill)}</span></div>` : ''}`;
const seg = (act, cur, opts, big) => `<div class="seg ${big ? 'big' : ''}">${opts.map(([v, n, c, t]) => `<button class="${c || ''}" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

IC.renderInspector = function (st) {
  S = st;
  const el = $('insp');
  let h = '';
  const s = S.sel;
  if (S.group.length > 1) h = group();
  else if (s) {
    const r = s.ref;
    if (s.kind === 'unit') h = unit(r);
    else if (s.kind === 'track') h = track(r);
    else if (s.kind === 'gunit') h = r.side === 'us' ? brigade(r) : ebrigade(r);
    else if (s.kind === 'site') h = site(r);
    else if (s.kind === 'tel') h = tel(r);
    else if (s.kind === 'evehicle') h = econvoy(r);
    else if (s.kind === 'infra') h = r.parts ? base(r) : r.kind === 'city' ? city(r) : r.kind === 'factory' ? factory(r) : infra(r);
    else if (s.kind === 'apart') h = apart(s);
    else if (s.kind === 'veh') h = convoy(r);
    else if (s.kind === 'air') h = air(r);
    else if (s.kind === 'fix') h = fix(r);
    else if (s.kind === 'airway') h = airway(r);
    else if (s.kind === 'field') h = field(r);
  }
  el.classList.toggle('glass', !!h);
  ui.setHTML(el, h ? h.replace('<div class="ihead">', '<div class="ihead">') : '');
};

/* ---------- the airspace: fixes, airways, light-aircraft fields ---------- */
const covTxt = a => ui.covTxt(a);
function fix(f) {
  const ways = S.asp.ways.filter(w => w.a === f.id || w.b === f.id);
  const apts = IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us' && IC.aspLink(S, b) === f);
  const rows = [['Near', esc(IC.nearestPlace(S, f.x, f.y))], ['Airways', ways.length ? ways.map(w => { const o = IC.aspFix(S, w.a === f.id ? w.b : w.a); return esc(o.name); }).join(', ') : '<span class="amber">none yet</span>'],
    ['Radar sees down to', covTxt(IC.aspCovAlt(S, f.x, f.y))], ['Airports joining here', apts.length ? esc(apts.map(b => b.name).join(', ')) : '—']];
  return head('<span class="badge friend">FIX</span>', f.name, 'Fix · a named point airliners fly over') + `<div class="ibody">${kv(rows)}
    <div class="acts"><button class="act pri" data-act="aspDraw" data-id="${f.id}">Draw an airway from here</button><button class="act warn" data-act="fixDel" data-id="${f.id}">Delete fix</button></div>
    <p class="hint">In the airway editor you can drag a fix to move it; the airways move with it.</p></div>`;
}
function airway(w) {
  const [a, b] = IC.aspWayEnds(S, w), hi = IC.aspWayCover(S, w, 9), lo = IC.aspWayCover(S, w, 3);
  const xs = IC.aspCrossings(S).filter(c => c.w === w.id || c.v === w.id), over = IC.aspOverflies(S, w);
  const using = S.threats.filter(t => !t.dead && t.plan && t.plan.pts && t.plan.pts.some((p, i, P) => i && ((p.fix === w.a && P[i - 1].fix === w.b) || (p.fix === w.b && P[i - 1].fix === w.a)))).length;
  const rows = [['Length', U.km(U.dist(a, b))], ['Radar cover', `${U.pct(hi)} at cruise height · ${U.pct(lo)} at 3 km`], ['Flights on it now', using],
    ['Crosses', xs.length ? `<span class="amber">${xs.length} other airway${xs.length > 1 ? 's' : ''}</span>` : 'no other airway'], ['Passes over', over.length ? `<span class="amber">${esc(over.join(', '))}</span>` : 'nothing sensitive']];
  const tips = [];
  if (hi < 0.9) tips.push('Part of it is outside radar cover (drawn dashed amber). Controllers there space flights by time alone: fewer flights and more delay. A radar near that stretch fixes it.');
  if (xs.length) tips.push('Where airways cross, flights at the same height can meet. Controllers watch crossings; outside radar they keep apart only most of the time.');
  if (over.length) tips.push('Airliners over bases and cities are a risk in a crisis. Move the fixes, or publish a prohibited zone.');
  return head('<span class="badge friend">AWY</span>', `${a.name} – ${b.name}`, 'Airway') + `<div class="ibody">${kv(rows)}${tips.map(x => `<p class="hint">${x}</p>`).join('')}
    <div class="acts"><button class="act warn" data-act="wayDel" data-id="${w.id}">Delete airway</button></div></div>`;
}
function field(f) {
  const n = S.threats.filter(t => !t.dead && t.type === 'ga' && t.gaTo && t.gaTo.field === f.id).length;
  const rows = [['Club', esc(f.club)], ['Club mood', `${bar(f.mood / 100, f.mood > 60 ? 'var(--ok)' : f.mood > 35 ? 'var(--amber)' : 'var(--hostile)')} ${Math.round(f.mood)}%`], ['Movements today', f.today], ['Inbound now', n], ['Radar sees down to', covTxt(IC.aspCovAlt(S, f.x, f.y))]];
  return head('<span class="badge friend">GA</span>', f.name, 'Grass strip for light aircraft') + `<div class="ibody">${kv(rows)}
    <p class="hint">Light aircraft fly slow and low, by sight, in daylight and fair weather. Many have no flight plan and some no transponder. Clubs pay little, but grounding them for long makes them loud.</p></div>`;
}

/* ---------- our air defense, sensors, launchers, depots ---------- */
function unit(u) {
  const d = u.d, [st, cls] = IC.unitState(u);
  const k = S.enemy.known.get(u.id);
  const intel = !k ? '<span class="ok">not located</span>' : U.dxy(k.x, k.y, u.x, u.y) > 30 ? `<span class="amber">stale fix</span>` : `<span class="hostile">located (${esc(k.how)})</span>`;
  const why = u.state !== 'ready' ? st : u.why || (d.sensor ? (u.radarOn || d.sensor.passive ? 'Watching the sky' : 'Silent: not transmitting, not seen') : d.logi ? 'Running deliveries' : 'Standing by');
  const whyCls = /Engaging|Firing|Burning/.test(why) ? 'fr' : /Out of|knocked|Holding|silent|Silent|exhausted/.test(why) ? 'busy' : 'ok';
  const parts = [];
  // orders
  const acts = [];
  if (u.emitter) parts.push(`<div class="sec"><h3 class="sh">Emissions <em>E</em></h3>${seg('emcon', u.emcon, d.weapon === 'sam' ? [['on', 'Radiate', '', 'Radar on: sees and fires, but is seen'], ['ambush', 'Ambush', 'amb', 'Silent until a hostile comes close'], ['off', 'Silent', 'red', 'Radar off: hidden, blind']] : [['on', 'Radiate'], ['off', 'Silent', 'red']], true)}</div>`);
  if (d.weapon && d.weapon !== 'strike' && d.weapon !== 'decoy' && d.weapon !== 'ecm') {
    parts.push(`<div class="sec"><h3 class="sh">Rules <em>W · Q</em></h3>${seg('uroe', u.roe, [['auto', `National (${S.ad.roe})`], ['free', 'Free'], ['tight', 'Tight'], ['hold', 'Hold', 'red']])}${d.weapon === 'sam' ? seg('udoc', u.doctrine, [['auto', 'National'], ['sls', 'Look'], ['salvo', 'Salvo'], ['conserve', 'Save', 'amb']]) : ''}</div>`);
  }
  if (d.weapon === 'strike') acts.push(`<button class="act pri" data-act="fireMode" ${u.state !== 'ready' || !u.mags[0].mag ? 'disabled' : ''}>${kbd('F')}Fire mission</button>`);
  if (d.mob !== 'fixed') acts.push(`<button class="act" data-act="move" ${u.state !== 'ready' ? 'disabled' : ''}>${kbd('M')}Move</button>`);
  if (u.mags.length) { acts.push(`<button class="act" data-act="heli">${kbd('H')}Air resupply</button>`); acts.push(`<button class="act ${u.pri ? 'on' : ''}" data-act="pri">Priority resupply</button>`); }
  if (Object.values(u.comp).some(v => v < 1) || u.hp < u.max) acts.push(`<button class="act ${u.repairing ? 'on' : ''}" data-act="repair" ${u.repairing ? 'disabled' : ''}>${kbd('P')}${u.repairing ? 'Repair crew on site' : `Repair · ${U.money(Math.max(3, d.cost * 0.08))}`}</button>`);
  if (u.prio && !u.prio.dead) acts.push(`<button class="act" data-act="clearPrio">Clear target TN ${u.prio.tn}</button>`);
  if (!u.central) acts.push(`<button class="act warn" data-act="reserve">${kbd('X')}${d.mob === 'fixed' ? 'Dismantle' : 'To reserve'}</button>`);
  if (acts.length) parts.push(`<div class="acts">${acts.join('')}</div>`);
  // magazines drawn as rounds
  if (u.mags.length) {
    const mags = IC.activeMags(S, u).map(m => {
      const M = IC.MUN[m.mun];
      const rounds = Array.from({ length: m.max }, (_, i) => `<i class="${i < m.mag ? '' : 'e'}"></i>`).join('') + Array.from({ length: Math.min(12, m.store) }, () => '<i class="s"></i>').join('');
      return `<div class="mag" title="${esc(M.name)}: ${esc(IC.SEEKER[M.seeker] || '')}"><b>${M.short || m.mun}</b><span class="rounds">${rounds}</span><small>${m.mag}/${m.max} +${m.store}${m.inc ? ` · ${m.inc}↘` : ''}</small></div>`;
    }).join('');
    parts.push(`<div class="sec"><h3 class="sh">Magazine <em>ready / reserve / inbound</em></h3><div class="mags">${mags}</div></div>`);
  }
  // parts and crew
  const comps = Object.entries(u.comp).map(([c, v]) => `<span>${IC.COMPS[c].name}</span>${bar(v)}<span>${v < 0.35 ? '<b class="hostile">OUT</b>' : U.pct(v)}</span>`).join('');
  parts.push(`<div class="sec"><h3 class="sh">Condition</h3><div class="bars"><span>Integrity</span>${bar(u.hp / u.max)}<span>${U.pct(u.hp / u.max)}</span>${comps}<span>Crew rest</span>${bar(1 - u.fat / 100, u.fat > 70 ? 'var(--hostile)' : u.fat > 50 ? 'var(--amber)' : 'var(--ok)')}<span>${u.fat > 70 ? '<b class="amber">tired</b>' : U.pct(1 - u.fat / 100)}</span></div></div>`);
  // what it can do
  const rows = [];
  const rng = IC.maxRange(S, u); if (rng) rows.push(['Weapon reach', U.km(rng)]);
  if (d.sensor) {
    const sn = d.sensor;
    rows.push(['Radar', `${U.km(sn.R)}${sn.per && sn.rot ? ` · turns every ${sn.per} s` : ''}`]);
    rows.push(['Identification', sn.idc === 'none' ? 'position only' : sn.idc === 'iff' ? 'reads transponders' : sn.idc === 'nctr' ? `types inside ${U.km(sn.nctrR * (IC.hasTech(S, 's_nctr') ? 1.5 : 1))}` : sn.idc === 'emit' ? 'emitter types' : 'rough class']);
    if (sn.mast && !sn.passive) rows.push(['Sees low fliers', `to ~${U.km(U.horizon(sn.mast, 0.05))}`]);
  }
  if (d.fc && !d.fc.passive) rows.push(['Fire-control radar', U.km(d.fc.R)]);
  if (u.jamF < 0.97) rows.push(['Jammed', `<span class="amber">−${U.pct(1 - u.jamF)}</span>`]);
  if (u.intf) rows.push(['Interference', `<span class="amber">${u.intf} other ${IC.BAND_NAME[IC.BAND[u.type]] || ''} radar${u.intf > 1 ? 's' : ''} within 70 km: −${U.pct(1 - u.intfF)} range</span>`]);
  else if (IC.BAND[u.type] && d.sensor && !d.sensor.passive) rows.push(['Band', `${IC.BAND_NAME[IC.BAND[u.type]]} · clear`]);
  rows.push(['Enemy knowledge', intel]);
  parts.push(kv(rows));
  if (u.inv) parts.push(depot(u));
  return head(ui.sym(u.type, 104, 80), u.name, `${esc(d.name)} · ${IC.MOB_LABEL[d.mob]}`, st, cls) + `<div class="ibody"><div class="now ${whyCls}">${esc(why)}</div>${parts.join('')}<p class="hint">${d.weapon === 'strike' ? 'Right-click an enemy target to fire; shift+right-click fires a salvo.' : d.mob !== 'fixed' ? 'Right-click the map to move. With a battery selected, right-click a track to make it the priority target.' : esc(d.desc)}</p></div>`;
}
function depot(u) {
  const dem = IC.depotDemand(S)[u.id] || {};
  const rows = IC.STOCK_KEYS.filter(k => (u.inv[k] || 0) >= 1 || dem[k] || (u.inc[k] || 0) > 0).map(k => `<tr><td>${k}</td><td class="r">${Math.floor(u.inv[k] || 0)}</td><td class="r">${u.central ? '–' : Math.ceil(dem[k] || 0)}</td><td class="r">${u.inc[k] ? '+' + u.inc[k] : ''}</td></tr>`).join('');
  const trucks = S.vehicles.filter(v => v.home === u);
  const others = IC.depots(S).filter(d => d !== u);
  return `<div class="sec"><h3 class="sh">Stock <em>${u.central ? 'national' : 'service area ' + U.km(u.reach || 1400)}</em></h3>
    <table class="t"><tr><th>Item</th><th class="r">Held</th><th class="r">Wanted</th><th class="r">Inbound</th></tr>${rows || '<tr><td colspan="4">Empty</td></tr>'}</table>
    ${u.central ? '' : `<h3 class="sh">Stock profile</h3>${seg('profile', u.profile || 'balanced', Object.entries(IC.PROFILES).map(([k, p]) => [k, p.name, '', p.desc]))}`}
    <h3 class="sh">Truck companies <em>${trucks.filter(v => v.state !== 'idle').length}/${trucks.length} busy</em></h3>
    <div class="acts"><button class="act" data-act="buyTruck" ${S.budget < 12 ? 'disabled' : ''}>+ Truck company · ₭12M</button>${others.length ? `<button class="act" data-act="moveTruck" ${trucks.some(v => v.state === 'idle') ? '' : 'disabled'}>Send one to ${esc(others.sort((a, b) => U.dist(a, u) - U.dist(b, u))[0].name)}</button>` : ''}</div></div>`;
}

/* ---------- tracks: what we know, how we know it ---------- */
function track(t) {
  const aff = t.decoyKnown ? 'D' : t.aff || 'U';
  const colCls = { H: 'hostile', S: 'suspect', U: 'unknown', A: 'civil', N: 'civil', D: 'muted' }[aff];
  const name = aff === 'N' || aff === 'A' ? `${t.type === 'ga' ? 'Light aircraft' : 'Airliner'} ${t.cs}` : aff === 'H' ? (t.d.name) : t.decoyKnown ? 'Decoy' : IC.AFF[aff].name + ' track';
  const age = S.time - t.pt;
  const q = t.fc ? 'fire-control quality' : t.satOnly ? 'satellite cue' : t.det ? `surveillance, ${age < 3 ? 'fresh' : U.dur(age) + ' old'}` : 'lost';
  const ladder = `<div class="ladder">
    <div class="y"><small>Detected</small><b>${esc(q)}</b></div>
    <div class="${t.klass ? 'y' : ''}"><small>Type</small><b>${t.klass ? esc(IC.KLASS[t.klass] || t.klass) : t.idp > 0 ? 'recognising ' + U.pct(Math.min(1, t.idp)) : 'unknown'}</b></div>
    <div class="${aff === 'H' || aff === 'N' ? 'y' : ''}"><small>Identity</small><b class="${colCls}">${IC.AFF[aff === 'D' ? 'H' : aff].name}${aff === 'D' ? ' decoy' : ''}</b></div></div>`;
  const rows = [
    ['Altitude', t.altKnown ? U.alt(t.alt) : '<span class="muted">unknown (2D radar only)</span>'],
    ['Speed', U.kmh(Math.hypot(t.vx, t.vy))], ['Heading', U.compass(Math.atan2(t.vy, t.vx))],
    ['Transponder', t.sqSeen || t.sq && t.aff !== 'U' ? `${t.sq || 'none'}${t.cs ? ' · ' + esc(t.cs) : ''}` : t.sq ? '<span class="muted">not interrogated</span>' : 'none'],
    ['Flight plan', t.plan ? `${esc(t.plan.a.name || '?')} → ${esc(t.plan.b.name || '?')}${t.sqSeen ? (IC.offRoute(t) < 50 ? ' · <span class="civil">on route</span>' : ` · <span class="suspect">${U.km(IC.offRoute(t))} OFF ROUTE</span>`) : ''}` : t.d.civil && t.type === 'ga' ? `${t.fpl ? 'filed' : 'none'} · flying by sight${t.gaTo ? ` to ${esc(t.gaTo === t.gaFrom ? 'and back from ' + t.gaFrom.name : t.gaTo.name)}` : ''}` : 'none filed']
  ];
  // what air traffic control can do for it
  if (t.d.civil && (aff === 'N' || aff === 'A')) {
    if (t.plan && t.plan.pts) { const fx = t.plan.pts.filter(p => p.fix).map(p => p.name); rows.push(['Route', fx.length ? `airways via ${esc(fx.join(', '))}` : '<span class="amber">direct: no airway fits, so controllers space it wider</span>']); }
    rows.push(['Controllers', IC.aspSeen(S, t) ? '<span class="civil">see it on radar</span>' : `<span class="amber">cannot see it${t.sq ? ' at this height' : ': no transponder'}</span>`]);
    if (t.type === 'ga') rows.push(['Cleared into', t.cleared && t.cleared.length ? esc(t.cleared.map(id => S.byId[id] ? S.byId[id].name : id).join(', ')) : 'no controlled airspace']);
  }
  if (t.tail) { const al = IC.avAirline(S, t.tail.al); rows.push(['Operator', `${esc(al.name)} · ${esc(IC.ACTYPES[t.tail.type].name)}`]); }
  if (t.emergency) rows.push(['Status', '<span class="hostile">MAYDAY · emergency landing</span>']);
  if (t.noReply) rows.push(['Radio', '<span class="suspect">no answer</span>']);
  if (t.affWhy) rows.push(['Why', esc(t.affWhy)]);
  if (t.inbound) rows.push(['Interceptors', `${t.inbound} in flight`]);
  if (aff === 'H' && !t.d.civil && (t.aim || t.x1 != null)) {
    const ax = t.x1 != null ? t.x1 : t.aim.x, ay = t.y1 != null ? t.y1 : t.aim.y;
    rows.push(['Impact', `<span class="hostile">${esc(IC.nearestPlace(S, ax, ay))} · ${U.dur(IC.timeToImpact(t))}</span>`]);
  }
  if (t.d.civil && aff === 'N') rows.push(['Aboard', `${t.pax}`]);
  const hostile = !(aff === 'N' || aff === 'A' || aff === 'D');
  const bats = S.units.filter(u => u.d.weapon === 'sam' && u.state === 'ready' && U.dist(u, t) <= IC.maxRange(S, u) * 1.05).slice(0, 5);
  const acts = [];
  if ((t.d.cls === 'air' || t.d.cls === 'ga' || t.d.cls === 'drone' || t.d.cls === 'cm') && !t.border) acts.push(`<button class="act ${aff === 'S' || aff === 'U' ? 'pri' : ''}" data-act="scramble" ${S.roster.some(r => r.kind === 'ftr' && r.st === 'ready' && IC.canLaunch(S, r)) || S.air.some(a => a.kind === 'ftr' && a.state !== 'rtb') ? '' : 'disabled'}>${kbd('V')}${aff === 'H' ? 'Intercept' : 'Intercept & identify'}</button>`);
  if ((t.sq || t.d.civil || t.disguise) && t.d.cls !== 'bal' && !t.border) acts.push(`<button class="act ${t.offFlag ? 'pri' : ''}" data-act="radio" ${t.called && S.time - t.called < 300 ? 'disabled' : ''} title="Call the aircraft on the guard frequency">${t.called && S.time - t.called < 300 ? 'Calling…' : 'Call on radio'}</button>`);
  const escort = S.air.find(a => !a.dead && !a.gnd && a.kind === 'ftr' && a.mission && a.mission.track === t);
  if (escort && hostile && (escort.roe || S.ad.roe) === 'hold') acts.push(`<button class="act danger" data-act="escortFire" data-id="${escort.id}" title="${esc(escort.name)} is escorting it with weapons held. This order lets it fire.">Order ${esc(escort.name)} to fire</button>`);
  if (hostile && S.units.some(u => u.d.weapon)) acts.push(`<button class="act ${aff === 'H' ? 'pri' : ''}" data-act="assignBest" ${bats.length ? '' : 'disabled'}>${kbd('B')}Assign best battery</button>`);
  const warn = (aff === 'A' || aff === 'N') ? `<div class="warnbox">This track squawks a civil code on a filed route. Batteries will not fire at it unless you assign one by hand.</div>` : aff === 'S' && S.ad.roe === 'tight' ? `<p class="hint">Weapons are Tight: batteries hold fire on suspects. Identify it (fighter or type recognition) or assign a battery by hand.</p>` : '';
  const list = bats.map(u => `<div class="li"><b>${esc(u.name)}</b><small>${U.km(U.dist(u, t))} · ${IC.activeMags(S, u).map(m => `${m.mag} ${m.mun}`).join(', ')}${IC.canSee(S, u, t) ? '' : ' · no fire-control track'}</small><span class="la"><button class="btn sm" data-act="assign" data-uid="${u.id}" ${u.prio === t ? 'disabled' : ''}>${u.prio === t ? 'Assigned' : 'Assign'}</button></span></div>`).join('');
  const badge = `<span class="badge ${colCls}">${aff === 'N' || aff === 'A' ? 'CIV' : aff === 'H' ? esc(t.d.code) : aff === 'S' ? 'SUS' : 'UNK'}</span>`;
  return head(badge, `TN ${t.tn}`, `<span class="${colCls}">${esc(name)}</span>`) + `<div class="ibody">${ladder}${kv(rows)}${warn}<div class="acts">${acts.join('')}</div>${list ? `<div class="sec"><h3 class="sh">Batteries in reach</h3><div class="list">${list}</div></div>` : ''}</div>`;
}

/* ---------- brigades ---------- */
function brigade(g) {
  const f = g.front, sec = g.sector >= 0 ? f.sectors[g.sector] : null;
  const ter = IC.terrainOf(S, g), terF = IC.TERRAIN_DEF[ter];
  const O = IC.GORDERS;
  const orders = `<div class="seg wide">${Object.entries(O).map(([k, o]) => `<button data-act="gorder" data-v="${k}" aria-pressed="${g.order === k}" title="${esc(o.desc)}">${o.name}<kbd>${o.key}</kbd></button>`).join('')}</div>`;
  const now = g.order === 'refit' ? `Refitting at the rear: ${Math.round(g.str)}% and rising while manpower lasts.` : g.moving ? `Moving to ${g.order === 'defend' && g.obj ? g.obj.name : 'its position'}.` : g.order === 'defend' && g.obj ? `Garrisoning ${g.obj.name}${g.obj.besieged ? ': SURROUNDED, supply only by air' : ''}.` : sec ? `${O[g.order] ? O[g.order].name : g.order} in sector ${sec.name}. ${f.active ? `Force ratio ${(sec.F / Math.max(0.01, sec.E)).toFixed(1)}:1${sec.eAttack ? (sec.probe ? ', enemy probing' : ', UNDER ASSAULT') : ''}.` : 'The front is quiet for now.'}` : 'Awaiting orders.';
  const lift = ['SUP', 'ATG', 'REPL'].map(c => { const why = IC.liftCheck(S, g, c); return `<button class="act" data-act="lift" data-v="${c}" ${why ? 'disabled' : ''} title="${esc(why || IC.HLIFT[c].desc)}">${IC.HLIFT[c].name}</button>`; }).join('');
  const nearE = S.gunits.filter(e => e.side === 'them' && e.known && U.dxy(e.kx, e.ky, g.x, g.y) < 900);
  return head(ui.gsym(g.id, 104, 80), g.name, `${esc(g.g.name)} · ${esc(f.name)}${sec ? ' · ' + sec.name : ''}`, `${O[g.order] ? O[g.order].name : g.order}${g.manual ? ' · your orders' : ' · commander'}`, g.order === 'attack' ? 'fr' : g.order === 'refit' ? 'busy' : 'ok') +
    `<div class="ibody"><div class="now ${g.obj && g.obj.besieged ? 'bad' : g.sup < 30 ? 'busy' : 'ok'}">${esc(now)}</div>
    <div class="sec"><h3 class="sh">Orders</h3>${orders}<div class="acts"><button class="act ${!g.manual ? 'on' : ''}" data-act="grelease">${kbd('C')}${g.manual ? 'Hand back to ' + esc(f.cmd.name) : 'Commander in control'}</button></div></div>
    <div class="bars"><span>Strength</span>${bar(g.str / 100)}<span>${Math.round(g.str)}%</span><span>Supply</span>${bar(g.sup / 100, 'var(--supply)')}<span>${Math.round(g.sup)}%</span><span>Morale</span>${bar(g.mor / 100, 'var(--friend)')}<span>${Math.round(g.mor)}%</span><span>Dug in</span>${bar(g.fort, 'var(--supply)')}<span>${U.pct(g.fort)}</span><span>Experience</span>${bar(g.exp / 0.6, 'var(--civil)')}<span>${U.pct(g.exp / 0.6)}</span></div>
    ${kv([['Position', `${ter}${terF !== 1 ? ` · ${terF > 1 ? '+' : ''}${Math.round((terF - 1) * 100)}% defense` : ''}`], ['Anti-tank teams', `${Math.round(g.kit.atgm)}${g.kit.atgm < 4 ? ' <span class="amber">low</span>' : ''}`], ['Air defense teams', `${g.kit.mpd}`], ['Enemy nearby', nearE.length ? nearE.map(e => `${e.g.short} ~${Math.round(e.str / 10) * 10}%`).join(', ') : 'none seen']])}
    <div class="sec"><h3 class="sh">Helicopter lift <em>manpower ${Math.floor(S.manpower)}</em></h3><div class="acts">${lift}</div>${g.lift ? '<p class="hint">A helicopter is on its way.</p>' : ''}</div>
    <p class="hint">Right-click a sector of the front to move it there; right-click a town to garrison it.</p></div>`;
}
function ebrigade(g) {
  const age = S.time - g.kt;
  const atk = S.roster.filter(r => (r.kind === 'atk' || r.kind === 'ucav') && r.st === 'ready');
  const hs = atk.map(r => { const why = IC.missionOk(S, r, 'hstrike'); const b = IC.baseOf(S, r.base); const far = b && IC.AIR_KIND[r.kind].reach && U.dist(b, { x: g.kx, y: g.ky }) > IC.AIR_KIND[r.kind].reach; return `<div class="li"><b>${esc(r.name)}</b><small>${esc(IC.AIR_KIND[r.kind].name)} · ${far ? 'out of reach' : why || U.km(U.dist(b, { x: g.kx, y: g.ky })) + ' away'}</small><span class="la"><button class="btn sm" data-act="hstrike" data-rid="${r.id}" data-id="${g.id}" ${why || far ? 'disabled' : ''}>Attack</button></span></div>`; }).join('');
  return head(ui.gsym(g.id, 104, 80), g.name, `<span class="hostile">${esc(g.front.enemy)} ${esc(g.g.name)}</span>`, `seen ${U.dur(age)} ago`, 'bad') +
    `<div class="ibody"><div class="bars"><span>Est. strength</span>${bar(g.str / 100, 'var(--hostile)')}<span>~${Math.round(g.str / 10) * 10}%</span></div>
    ${kv([['Doing', g.order === 'attack' ? '<span class="hostile">attacking</span>' : g.order === 'refit' ? 'refitting' : g.order === 'reserve' ? 'in reserve' : 'holding'], ['Air defense', g.ad >= 1 ? 'mobile SAMs and MANPADS: helicopters take fire' : 'light']])}
    <div class="sec"><h3 class="sh">Helicopter and drone attack</h3>${hs ? `<div class="list">${hs}</div>` : '<p class="hint">No attack helicopters or strike drones ready.</p>'}</div>
    ${strikeList(g, 'gunit')}</div>`;
}

/* ---------- airports and air bases: the layout, what it can do, what is wrong with it ---------- */
IC.drawSchematic = function (c, S2, b) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  if (!b || !b.parts) return;
  // fit the airport, rotated so the main runway runs across
  const a = -(b.rwyA || 0);
  const loc = p => { const dx = p.x - b.x, dy = p.y - b.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; };
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = p => { const q = loc(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
  for (const p of b.parts) { if (p.kind === 'runway') { grow(p.a); grow(p.b); } else if (p.kind === 'taxi') p.nodes.forEach(id => b.nodes[id] && grow(b.nodes[id])); else grow(p); }
  const k = Math.min((W - 20) / Math.max(1, x1 - x0 + 1), (H - 20) / Math.max(1, y1 - y0 + 1.5));
  g.save(); g.translate(W / 2, H / 2); g.scale(k, k); g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2); g.rotate(a); g.translate(-b.x, -b.y);
  const hpCol = p => { const f = p.hp / p.max; return !p.built ? 'rgba(242,180,65,0.5)' : f >= 0.75 ? 'rgba(170,200,215,0.9)' : f >= 0.5 ? 'rgba(242,180,65,0.95)' : f > 0.25 ? 'rgba(255,140,80,0.95)' : 'rgba(255,70,50,0.95)'; };
  const lw = 1 / k;
  for (const p of b.parts) if (p.kind === 'apron' || p.kind === 'alert') { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.built ? 'rgba(110,120,126,0.9)' : 'rgba(242,180,65,0.3)'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
  g.lineCap = 'round';
  for (const p of b.parts) if (p.kind === 'taxi') {
    const pts = p.nodes.map(id => b.nodes[id]).filter(Boolean);
    g.strokeStyle = p.built ? 'rgba(80,88,94,1)' : 'rgba(242,180,65,0.8)'; g.lineWidth = Math.max(p.w, 2.5 * lw);
    g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke();
    for (const i in p.cut) { const q = b.nodes[p.nodes[i - 1]], r = b.nodes[p.nodes[i]]; g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc((q.x + r.x) / 2, (q.y + r.y) / 2, 4 * lw, 0, 7); g.fill(); }
  }
  for (const p of b.parts) if (p.kind === 'runway') {
    g.strokeStyle = p.built ? 'rgba(44,48,52,1)' : 'rgba(242,180,65,0.8)'; g.lineWidth = Math.max(p.w, 5 * lw); g.lineCap = 'butt';
    g.beginPath(); g.moveTo(p.a.x, p.a.y); g.lineTo(p.b.x, p.b.y); g.stroke();
    g.strokeStyle = 'rgba(230,230,220,0.6)'; g.lineWidth = lw; g.setLineDash([6 * lw, 5 * lw]); g.beginPath(); g.moveTo(p.a.x, p.a.y); g.lineTo(p.b.x, p.b.y); g.stroke(); g.setLineDash([]);
    for (const cr of p.craters) { const q = IC.rwAt(p, cr.t); g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(q.x, q.y, Math.max(cr.r, 4 * lw), 0, 7); g.fill(); }
  }
  for (const p of b.parts) {
    if (['runway', 'taxi', 'apron', 'alert'].includes(p.kind)) continue;
    g.fillStyle = hpCol(p);
    if (p.r) { g.beginPath(); g.arc(p.x, p.y, Math.max(p.r, 3 * lw), 0, 7); g.fill(); }
    else { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-Math.max(p.w, 5 * lw) / 2, -Math.max(p.h, 5 * lw) / 2, Math.max(p.w, 5 * lw), Math.max(p.h, 5 * lw)); g.restore(); }
  }
  for (const p of b.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) { g.fillStyle = s.hp <= 0 ? '#ff4a3a' : s.occ ? '#e8f6ff' : s.linked === false ? 'rgba(242,180,65,0.8)' : 'rgba(150,170,180,0.5)'; g.beginPath(); g.arc(s.x, s.y, 2.2 * lw, 0, 7); g.fill(); }
  for (const m of b.moves) { g.fillStyle = m.kind === 'arr' ? '#7fe8b0' : '#80e0ff'; g.beginPath(); g.arc(m.x, m.y, 3 * lw, 0, 7); g.fill(); }
  for (const r of S2.roster) {
    if (r.base !== b.id || r.st === 'lost' || r.st === 'air') continue;
    const pp = IC.parkPos(S2, b, r);
    g.fillStyle = r.st === 'ready' ? '#80e0ff' : '#f2b441'; g.beginPath(); g.moveTo(pp.x, pp.y - 4 * lw); g.lineTo(pp.x + 3 * lw, pp.y + 3 * lw); g.lineTo(pp.x - 3 * lw, pp.y + 3 * lw); g.closePath(); g.fill();
  }
  g.restore();
};
const TEMPLATE_NAME = { intl: 'International airport', regional_ok: 'Regional airport', regional_bad: 'Regional airport', mil_mothball: 'Air base (mothballed)', mil_full: 'Air base', new: 'New airport' };
function base(b) {
  const st = b.st && b.st.rwy ? b.st : IC.aptStats(S, b);
  const bs = IC.baseStatus(S, b);
  const flights = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
  const civil = b.kind === 'airport';
  const locked = b.locked;
  const stands = IC.aptStands(b), used = stands.filter(s => s.occ).length, linked = stands.filter(s => s.linked !== false && s.hp > 0).length;
  const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id).length;
  const pill = locked ? 'Air Force' : !st.rwy.length ? 'No runway' : bs.runway ? `${st.movesPerHour} movements/h` : 'RUNWAY CLOSED';
  const sub = `${TEMPLATE_NAME[b.template] || (civil ? 'Airport' : 'Air base')} · ${st.longest ? U.km(st.longest) + ' runway' : 'no runway yet'}`;
  const H = head(`<span class="badge friend">${civil ? 'APT' : 'AB'}</span>`, b.name, esc(sub), pill, locked ? '' : bs.runway ? 'ok' : 'bad');
  const schem = `<canvas class="schem" data-schem="${b.id}" width="560" height="250"></canvas><div class="acts"><button class="act" data-act="aptZoom">Zoom to the airport</button></div>`;
  if (locked) return H + `<div class="ibody">${schem}<p class="hint">${esc(b.name)} belongs to the Air Force. It comes under your command later in your career.</p></div>`;
  const warn = st.warn.length ? `<div class="sec"><h3 class="sh">Problems <em>${st.warn.length}</em></h3>${st.warn.slice(0, 6).map(w => `<div class="warnrow">${esc(w)}</div>`).join('')}</div>` : '<div class="now ok">No layout problems found.</div>';
  const fuelF = st.fuelCap ? st.fuel / st.fuelCap : 0;
  const kp = b.kpi || {};
  const ROLE = { arr: 'arrivals', dep: 'departures', mixed: 'arrivals and departures', spare: 'not in use' };
  const flown = { arr: 0, dep: 0 }; for (const x of b.mvLog || []) flown[x.k]++;
  // the runway configuration the wind has chosen, one line per runway
  const rwSec = st.rwy.length ? `<div class="sec"><h3 class="sh">Runways <em>${st.cfg ? esc(st.cfg.name.toLowerCase()) + ' · ' : ''}wind ${IC.windText(S)}</em></h3>${st.rwy.map(r => {
    const busy = r.role === 'arr' ? `${U.dur(r.land)} a landing` : r.role === 'dep' ? `${U.dur(r.dep)} a take-off` : r.role === 'mixed' ? `${U.dur(r.land)} a landing, ${U.dur(r.dep)} a take-off` : 'crosswind or not needed';
    return `<div class="rwrow ${r.role}"><b>${esc(r.end)}</b><span>${ROLE[r.role] || ''} · ${busy}${r.threshold ? '' : ' · <span class="amber">backtrack</span>'}${r.ils[r.dir > 0 ? 'a' : 'b'] ? ' · ILS' : ''}</span><em>${r.perHour ? r.perHour + '/h' : ''}</em></div>`; }).join('')}
    ${IC.needILS(S) ? '<p class="hint amber">Poor visibility: arrivals land only where there is a landing system (ILS).</p>' : ''}</div>` : '';
  const zoneSec = Object.keys(st.zones || {}).length ? `<div class="sec"><h3 class="sh">Stands <em>${used}/${linked} in use${stands.length > linked ? ` · <span class="amber">${stands.length - linked} cut off</span>` : ''}</em></h3>${Object.entries(st.zones).map(([k, z]) => `<div class="rwrow"><b>${IC.ZONES[k].short}</b><span>${IC.ZONES[k].name} · ${k === 'civil' ? `${z.contact} at gates, ${z.remote} remote (bus)` : `${z.s + z.m + z.l} stands`}</span><em>S${z.s} M${z.m} L${z.l}</em></div>`).join('')}</div>` : '';
  const rows = [
    ['Capacity', `${st.arrPerHour} arrivals + ${st.depPerHour} departures an hour`],
    ['Last hour', `${flown.arr} arrivals, ${flown.dep} departures`],
    ['Largest aircraft', st.maxType ? esc(IC.ACTYPES[st.maxType].name) : '<span class="hostile">none</span>'],
    ['Fuel', `${Math.round(st.fuel)}/${st.fuelCap}${fuelF < 0.25 ? ' <span class="amber">low</span>' : ''} · enough for ${st.fuelDeps || 0} departures an hour (${st.hydrant ? 'hydrant system' : 'fuel trucks'})`],
    ['Tower · approach radar · ground radar', `${st.tower ? 'yes' : '<span class="hostile">no</span>'} · ${st.radar ? 'yes' : 'no'} · ${st.gradar ? 'yes' : st.complex ? '<span class="amber">no</span>' : 'no'}`],
    ['Fire and rescue', !st.fire ? '<span class="amber">no station near the runway</span>' : `trucks reach every runway in ${st.rescue > 180 ? `<span class="amber">${U.dur(st.rescue)}</span>` : U.dur(st.rescue)}`],
    ['Landing systems', `${st.ilsEnds || 0} of ${st.rwy.length * 2} runway ends`]
  ];
  if (civil) rows.push(['Terminal', `${Math.round(b.paxRate || 0).toLocaleString('en-US')} / ${Math.round(st.pax).toLocaleString('en-US')} passengers an hour`]);
  if (civil && S.asp) { const f = IC.aspLink(S, b), ga = (b.gaMoves || []).filter(x => S.time - x < 3600).length; rows.push(['Airspace', `${f ? `joins the airways at ${esc(f.name)}` : '<span class="amber">no airway within 120 km</span>'} · light aircraft ${ga} an hour${ga >= 3 ? ' <span class="amber">(each holds the runway as long as two airliners)</span>' : ''}`]); }
  const kpis = `<div class="kpis">
    <div><small>Avg taxi</small><b class="${kp.taxi > 600 ? 'amber' : ''}">${U.dur(kp.taxi || 0)}</b></div>
    <div><small>Avg delay</small><b class="${kp.wait > 600 ? 'amber' : ''}">${U.dur(kp.wait || 0)}</b></div>
    <div><small>Backtracks</small><b class="${kp.back ? 'amber' : ''}">${kp.back || 0}</b></div>
    <div><small>Gridlocks</small><b class="${kp.grid ? 'amber' : ''}">${kp.grid || 0}</b></div>
    <div><small>Diversions</small><b class="${kp.div ? 'hostile' : ''}">${kp.div || 0}</b></div>
    <div><small>Holding now</small><b class="${hold ? 'amber' : ''}">${hold}</b></div></div>`;
  const kinds = IC.APART_ORDER.filter(k => civil ? !IC.APART[k].mil : true);
  const palette = `<div class="palette">${kinds.map(k => { const D = IC.APART[k]; const unit = D.line ? '/100 m' : D.area ? '/ha' : ''; const on = S.mode2 && S.mode2.kind === 'build' && S.mode2.part === k && S.mode2.ap === b; return `<button class="pal ${on ? 'on' : ''}" data-act="build" data-v="${k}" title="${esc(D.desc)}"><b>${esc(D.name)}</b><small>${U.money(D.cost)}${unit}</small></button>`; }).join('')}<button class="pal warn ${S.mode2 && S.mode2.kind === 'bulldoze' ? 'on' : ''}" data-act="bulldoze" title="Remove a part (click it on the map)"><b>Bulldoze</b><small>refunds planned work</small></button></div>`;
  const works = b.works.map((w, i) => `<div class="li"><b>${esc(w.label)}</b><small>${i < b.crews ? `${U.pct(w.prog)} · ${U.dur((1 - w.prog) * w.dur)} left` : 'queued'}</small><span class="la"><button class="btn sm" data-act="bcancel" data-id="${w.id}">✕</button></span></div>`).join('');
  const reps = IC.aptRepairList(b).filter(it => !b.works.some(w => w.key === it.key)).slice(0, 8).map(it => `<div class="li"><b>${esc(it.label)}</b><small>${U.money(it.cost)} · ${U.dur(it.dur)}</small><span class="la"><button class="btn sm" data-act="aptRepair" data-v="${it.key}" ${S.budget < it.cost ? 'disabled' : ''}>Repair</button></span></div>`).join('');
  const fl = flights.map(r => {
    const pp = IC.parkPos(S, b, r);
    const where = r.st === 'air' ? (r.ent && r.ent.gnd ? `taxiing (${r.ent.ground ? r.ent.ground.phase : ''})` : 'airborne') : pp.fac ? ({ has: 'in a shelter', hangar: 'in a hangar', alert: 'on the alert pad' }[pp.fac.kind]) : pp.stand ? 'on a stand' : '<span class="amber">in the open</span>';
    const stt = r.st === 'ready' ? '<span class="ok">ready</span>' : r.st === 'turn' ? `rearming ${U.dur(r.t)}` : r.st === 'air' ? '' : r.st;
    const block = r.st === 'ready' ? IC.milLaunchBlock(S, b, r) : '';
    return `<button class="li" data-act="selFlight" data-rid="${r.id}"><b>${esc(r.name)}</b><small>${esc(IC.AIR_KIND[r.kind].short)}×${r.n} · ${stt} ${where}${block ? ` · <span class="hostile">${esc(block)}</span>` : ''}</small></button>`;
  }).join('');
  const fee = civil ? `<div class="sec"><h3 class="sh">Charges <em>airlines weigh fees against service</em></h3>${seg('aptFee', String(b.feeLevel || 1), [['0.7', '70%'], ['0.85', '85%'], ['1', '100%'], ['1.2', '120%'], ['1.5', '150%', 'amb']])}
    <div class="acts"><button class="act ${b.rwMode === 'mixed' ? 'on' : ''}" data-act="aptRwMode" title="Automatic: with two or more independent runways, some take arrivals and some departures. Mixed: every runway takes both.">Runway use: ${b.rwMode === 'mixed' ? 'mixed' : 'automatic'}</button><button class="act ${b.curfew ? 'on' : ''}" data-act="aptCurfew" title="No departures 23:00–06:00. Cargo airlines hate it; the neighbours love it.">Night curfew: ${b.curfew ? 'on' : 'off'}</button></div></div>` : '';
  return H + `<div class="ibody">${schem}${kpis}${warn}${rwSec}${kv(rows)}${zoneSec}
    <div class="sec"><h3 class="sh">Build <em>pick a part, then click the map</em></h3>${palette}</div>
    <div class="sec"><h3 class="sh">Engineering <em>${Math.min(b.crews, b.works.length)}/${b.crews} crews working</em></h3>${works ? `<div class="list">${works}</div>` : '<p class="hint">No work queued.</p>'}
      ${reps ? `<h3 class="sh">Damage</h3><div class="list">${reps}</div>` : ''}
      <div class="acts"><button class="act" data-act="bwork" data-v="crew" ${S.budget < 20 ? 'disabled' : ''}>+ Crew · ₭20M</button><button class="act ${b.autoRepair ? 'on' : ''}" data-act="bauto">Auto-repair: ${b.autoRepair ? 'on' : 'off'}</button></div></div>
    ${fee}
    ${fl ? `<div class="sec"><h3 class="sh">Flights here</h3><div class="list">${fl}</div></div>` : ''}</div>`;
}
/* one part of an airport */
function apart(sel) {
  const p = sel.ref, ap = sel.ap, D = IC.APART[p.kind];
  const w = ap.works.find(x => x.part === p || (x.it && x.it.part === p));
  const rows = [];
  if (p.kind === 'runway') { const c = ap.cfg && ap.cfg.rw[p.id]; rows.push(['Length', U.km(IC.rwLen(p))], ['Usable', U.km(IC.rwUsable(p))], ['Craters', `${p.craters.length}`], ['In use', c ? `${esc(c.name)} · ${{ arr: 'arrivals', dep: 'departures', mixed: 'arrivals and departures', spare: 'not in use' }[c.role]} · crosswind ${Math.round(c.cross)} kt` : 'no'], ['Landing systems', p.ends ? [['a', 1], ['b', -1]].filter(([e, d]) => IC.rwHasILS(ap, p, d)).map(([e]) => p.ends[e]).join(', ') || 'none' : 'none']); }
  else if (p.kind === 'taxi') { rows.push(['Length', U.km(IC.partMeasure(ap, p))], ['Cut', `${Object.keys(p.cut).length} places`], ['Traffic', p.oneway ? 'one way' : p.flow ? 'both ways, one preferred' : 'both ways']); }
  else if (p.kind === 'apron') { rows.push(['Stands', `${(p.stands || []).length} ${p.stands && p.stands[0] ? IC.STAND[p.stands[0].size].name : ''}${p.stands && p.stands[0] && p.stands[0].contact ? ' at gates' : ' remote'}`], ['Zone', IC.ZONES[IC.partZone(ap, p)].name], ['Area', `${(p.w * p.h).toFixed(1)} ha`]); }
  else if (p.kind === 'fuel') rows.push(['Stock', `${Math.round(p.stock || 0)}/${D.cap}`]);
  else if (p.kind === 'terminal') rows.push(['Capacity', `${Math.round(D.pax * p.w * p.h).toLocaleString('en-US')} passengers/h`]);
  if (p.linked === false) rows.push(['Taxiway', '<span class="amber">not connected</span>']);
  if (p.burning > 0) rows.push(['Fire', '<span class="hostile">burning</span>']);
  const hp = p.hp / p.max;
  return head(`<span class="badge friend">${esc(D.name.slice(0, 3).toUpperCase())}</span>`, D.name, esc(ap.name), !p.built ? `Building ${U.pct(p.prog || 0)}` : hp <= 0.25 ? 'Destroyed' : hp < 1 ? 'Damaged' : 'Intact', !p.built ? 'busy' : hp <= 0.25 ? 'bad' : hp < 1 ? 'busy' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Condition</span>${bar(hp)}<span>${U.pct(hp)}</span></div>${kv(rows)}<p class="hint">${esc(D.desc)}</p>
    <div class="acts">${w ? `<span class="pill busy">${esc(w.label)} ${U.pct(w.prog)}</span>` : ''}<button class="act" data-act="aptBack">◂ ${esc(ap.name)}</button><button class="act warn" data-act="aptRemove">Bulldoze</button></div></div>`;
}
function city(c) {
  const alive = c.blocks ? c.blocks.filter(b => b.hp > 0).length / Math.max(1, c.blocks.length) : 1;
  const plant = c.plant && S.byId[c.plant];
  const gar = S.gunits.find(g => g.side === 'us' && g.order === 'defend' && g.obj === c);
  const tax = c.pop * 0.02 * (c.hp / c.max) * c.prosp * (0.5 + c.morale / 200);
  const R = IC.cityReport(S, c);
  // growth: how it is doing, why, and what its air service and roads give it
  const P = (t, cls) => `<p class="hint ${cls || ''}" style="margin:.25rem 0">${t}</p>`;
  const growth = R ? `<div class="sec"><h3 class="sh">Growth</h3>${P(`<b>${esc(R.growth)}</b> ${esc(R.rate)}`)}
    ${P(`<b>Air service:</b> ${esc(R.air)} ${esc(R.demand)}`)}${P(`<b>Roads:</b> ${esc(R.roads)}`, R.cuts.length ? 'hostile' : '')}${R.cuts.map(t => P(esc(t), 'hostile')).join('')}
    ${R.inds.length ? P(`<b>Industry selling here:</b> ${R.inds.map(esc).join(' ')}`) : ''}
    <p class="hint">Cities grow with good air service (frequent flights to many places, few delays, fair fees within ${IC.GROWTH.catch[1]} h by road) and good roads. Growth raises taxes and passengers.</p></div>` : '';
  return head(`<span class="badge friend">${c.capital ? 'CAP' : 'CITY'}</span>`, c.name, c.capital ? 'Capital' : 'City', c.owner === 'enemy' ? 'OCCUPIED' : c.besieged ? 'SURROUNDED' : c.alert > 0 ? 'Sirens' : 'Calm', c.owner === 'enemy' || c.besieged || c.alert > 0 ? 'bad' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Morale</span>${bar(c.morale / 100, 'var(--friend)')}<span>${Math.round(c.morale)}%</span><span>Buildings</span>${bar(alive)}<span>${U.pct(alive)}</span><span>Prosperity</span>${bar(Math.min(1, c.prosp), 'var(--supply)')}<span>${U.pct(c.prosp)}</span></div>
    ${kv([['Population', `${c.pop}k`], ['Industry', `${c.ind} pts`], ['Taxes', `${tax.toFixed(1)}/h${S.story && S.story.act < 3 ? ' (to the Treasury, not your budget yet)' : ''}`], ['Power', plant ? (plant.offline ? `<span class="hostile">blackout (${esc(plant.name)} down)</span>` : esc(plant.name)) : '–'], ['Casualties', `${c.casualties || 0}`], ['Garrison', gar ? esc(gar.name) : 'none']])}
    ${growth}
    <p class="hint">A brigade ordered to Defend this town holds it even if the front line flows past. Select a brigade and right-click the town.</p></div>`;
}
function factory(i) {
  const lines = IC.factoryLines(S, i);
  const q = i.active.map(a => `<span class="chip">${a.mun} ${U.pct(a.prog)}</span>`).join('') + i.queue.map(x => `<span class="chip">${x.qty - x.started}× ${x.mun} queued</span>`).join('');
  const quick = IC.MUN_ORDER.filter(k => IC.hasTech(S, IC.MUN_TECH[k])).map(k => `<button class="act" data-act="prod" data-id="${i.id}" data-v="${k}:4" ${S.budget < IC.MUN[k].cost * 4 || i.offline ? 'disabled' : ''}>+4 ${IC.MUN[k].short} · ${U.money(IC.MUN[k].cost * 4)}</button>`).join('');
  const inv = IC.STOCK_KEYS.filter(k => i.inv[k] >= 1).map(k => `<span class="chip">${k} ${Math.floor(i.inv[k])}</span>`).join('');
  return head(`<span class="badge friend">IND</span>`, i.name, 'Arms factory', i.offline ? 'Knocked out' : `${i.active.length}/${lines} lines busy`, i.offline ? 'bad' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Integrity</span>${bar(i.hp / i.max)}<span>${U.pct(i.hp / i.max)}</span><span>Industry</span>${bar(IC.industry(S), 'var(--supply)')}<span>${U.pct(IC.industry(S))}</span></div>
    ${q ? `<div class="chips">${q}</div>` : ''}<div class="sec"><h3 class="sh">Order production</h3><div class="acts">${quick}</div></div>
    ${inv ? `<div class="sec"><h3 class="sh">Waiting for trucks</h3><div class="chips">${inv}</div></div>` : ''}<p class="hint">Output rides the factory's own trucks to the depots. National industry depends on the cities we hold and power.</p></div>`;
}
function infra(i) {
  const sub = { power: 'Power plant', bridge: `Bridge over the ${i.river || 'river'}` }[i.kind] || i.kind;
  const effect = i.kind === 'power' ? 'Every plant lost costs radars range, slows factories and blacks out the cities it serves.' : i.kind === 'bridge' ? 'When it falls, convoys and brigades detour to a ford: slower deliveries.' : '';
  return head(`<span class="badge friend">${i.kind === 'power' ? 'PWR' : 'BR'}</span>`, i.name, sub, i.offline ? (i.kind === 'bridge' ? 'Destroyed' : 'Knocked out') : 'Working', i.offline ? 'bad' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Integrity</span>${bar(i.hp / i.max)}<span>${U.pct(i.hp / i.max)}</span></div>${i.offline ? `<p class="hint">Repair crews are working: back in service at 60%.</p>` : ''}<p class="hint">${effect}</p></div>`;
}

/* ---------- enemy targets ---------- */
function strikeList(tg, k) {
  if (tg.destroyed || tg.dead) return '';
  const pos = IC.aimOf(tg);
  const opts = [];
  for (const u of S.units) {
    if (u.d.weapon !== 'strike' || u.state !== 'ready') continue;
    const m = u.mags[0]; if (!IC.hasTech(S, IC.MUN_TECH[m.mun])) continue;
    const r = U.dist(u, pos); if (r > IC.MUN[m.mun].range) continue;
    const M = IC.MUN[m.mun], eta = M.bal ? r / M.spd + 30 : r / M.spd;
    opts.push(`<div class="li"><b>${esc(u.name)}</b><small>${m.mag} ready · impact in ${U.dur(eta)}</small><span class="la"><button class="btn sm" data-act="fireFrom" data-uid="${u.id}" data-k="${k}" data-id="${tg.id}" data-v="1" ${m.mag < 1 ? 'disabled' : ''}>Fire 1</button><button class="btn sm" data-act="fireFrom" data-uid="${u.id}" data-k="${k}" data-id="${tg.id}" data-v="99" ${m.mag < 1 ? 'disabled' : ''}>Salvo</button></span></div>`);
  }
  if (k !== 'gunit') for (const r of S.roster) if (r.kind === 'ftr' && r.st === 'ready') { const why = IC.missionOk(S, r, 'strike'); opts.push(`<div class="li"><b>${esc(r.name)}</b><small>${why || 'Air strike · enemy fighters may intercept'}</small><span class="la">${why === 'Needs the strike loadout' ? `<button class="btn sm" data-act="loadout" data-rid="${r.id}" data-v="strike">Re-arm</button>` : `<button class="btn sm" data-act="airStrike" data-rid="${r.id}" data-k="${k}" data-id="${tg.id}" ${why ? 'disabled' : ''}>Strike</button>`}</span></div>`); }
  for (const r of S.roster) if ((r.kind === 'isr' || r.kind === 'ucav') && r.st === 'ready' && IC.canLaunch(S, r)) {
    opts.push(`<div class="li"><b>${esc(r.name)}</b><small>Reconnaissance over the target</small><span class="la"><button class="btn sm" data-act="isrOn" data-rid="${r.id}" data-k="${k}" data-id="${tg.id}">Send</button></span></div>`);
    break;
  }
  return `<div class="sec"><h3 class="sh">Strike options</h3>${opts.length ? `<div class="list">${opts.slice(0, 6).join('')}</div>` : '<p class="hint">Nothing can reach it. Deploy launchers closer, research deeper strike weapons, or re-arm a fighter flight for strike.</p>'}</div>`;
}
function site(s) {
  const kn = s.pk >= 2 ? 'Located' : s.pk === 1 ? 'Suspected' : 'Unknown';
  let inv = '';
  if (s.pk >= 2) inv = s.acAvail ? Object.entries(s.acAvail).filter(([, n]) => n > 0).map(([k, n]) => `~${Math.round(n)} ${IC.THR[k].code}`).join(', ') : s.kind === 'supply' ? `stock ~${Math.round(s.stock / 10) * 10}` : Object.entries(s.inv).filter(([, n]) => n >= 1).map(([k, n]) => `~${Math.round(n)} ${IC.THR[k] ? IC.THR[k].code : k}`).join(', ');
  return head(`<span class="badge hostile">${{ airbase: 'AB', drone: 'UAV', cm: 'CM', bm: 'BM', mrbm: 'MRB', hgv: 'HGV', rkt: 'RKT', supply: 'SUP', staging: 'HQ' }[s.kind]}</span>`, s.name, `<span class="hostile">${esc(S.world.full[s.nat])}</span>`, s.destroyed ? 'Destroyed' : kn, s.destroyed ? 'ok' : 'bad') +
    `<div class="ibody"><div class="bars"><span>Intact</span>${bar(s.hp / s.max, 'var(--hostile)')}<span>${U.pct(s.hp / s.max)}</span></div>${inv ? kv([['Holdings', inv]]) : ''}${strikeList(s, 'site')}</div>`;
}
function tel(t) {
  return head(`<span class="badge hostile">${t.kind === 'rkt' ? 'MLRS' : 'TEL'}</span>`, t.name, `Mobile launcher · seen ${U.dur(S.time - t.kt)} ago`, S.time - t.kt < 300 ? 'Fresh fix' : 'Stale fix', S.time - t.kt < 300 ? 'bad' : 'busy') +
    `<div class="ibody"><p class="hint">Launchers move soon after they fire. The older the sighting, the less likely a strike finds it.</p>${strikeList(t, 'tel')}</div>`;
}
function econvoy(v) {
  return head(`<span class="badge hostile">CNV</span>`, v.name, `${v.trucks} trucks · seen ${U.dur(S.time - v.kt)} ago`) + `<div class="ibody">${strikeList(v, 'evehicle')}</div>`;
}
function convoy(v) {
  const j = v.job;
  const st = { idle: 'Parked', load: 'Loading', toSource: 'Driving to pick up', toDest: 'Delivering', unload: 'Unloading', return: 'Returning' }[v.state];
  return head(`<span class="badge amber">${v.trucks}×</span>`, v.name, `Truck company · based at ${esc(v.home.name)}`, st, j ? 'busy' : '') +
    `<div class="ibody">${j ? kv([['Job', esc(j.label)], ['ETA', v.state === 'toDest' && v.eta ? U.hhmm(v.eta) : '–']]) : '<p class="hint">Waiting for a job. Convoys are dispatched automatically by priority.</p>'}<p class="hint">Enemy loitering munitions hunt convoys near the front. Air defense along the road, or a depot further back, keeps them alive.</p></div>`;
}
function air(a) {
  const K = IC.AIR_KIND[a.kind] || { name: 'Allied cargo aircraft', short: 'CGO' };
  const m = a.mission || {};
  const mission = { cap: 'Combat air patrol', intercept: 'Intercept', strike: 'Strike', cas: 'Close air support', interdict: 'Interdiction', orbit: 'Early warning', isr: 'Reconnaissance', supply: 'Resupply', hstrike: 'Helicopter attack', hlift: 'Helicopter lift' }[m.type] || (a.allied ? 'Airlift' : '—');
  const rows = [['Mission', mission + (a.task ? ' (standing task)' : '')]];
  if (!a.allied) rows.push(['Fuel', U.dur(a.fuel)], ['Aircraft', `${a.hp}/${a.n}`]);
  if (a.kind === 'ftr') rows.push(['Missiles', `${a.aam} AAM${a.gbu ? ' · ' + a.gbu + ' bombs' : ''}`]);
  if (a.runs && (a.kind === 'atk' || a.kind === 'ucav')) rows.push(['Attack runs left', a.runs]);
  rows.push(['Chaff / flares', a.cm]);
  if (a.job) rows.push(['Cargo', esc(a.job.label)]);
  const acts = a.r && !a.job && a.state !== 'rtb' ? `<div class="acts"><button class="act" data-act="recallSel">Recall</button></div>` : '';
  const roe = a.kind === 'ftr' && a.r ? `<div class="sec"><h3 class="sh">Weapons</h3>${seg('froe', a.r.roe || 'auto', [['auto', `National (${S.ad.roe})`], ['free', 'Free'], ['tight', 'Tight'], ['hold', 'Hold', 'red']])}</div>` : '';
  return head(`<span class="badge friend">${K.short}</span>`, a.name, esc(K.name), { out: 'En route', station: 'On station', engage: 'Engaging', rtb: 'Returning', vid: 'Identifying' }[a.state] || a.state, a.state === 'rtb' ? '' : 'ok') +
    `<div class="ibody">${kv(rows)}${roe}${acts}<p class="hint">Right-click the map to move its station, a track to intercept, or an enemy target to strike.</p></div>`;
}
function group() {
  const g = S.group;
  const types = {}; for (const u of g) { const k = u.gunit ? u.g.short : u.d.short; types[k] = (types[k] || 0) + 1; }
  const ground = g.every(u => u.gunit);
  const acts = ground
    ? Object.entries(IC.GORDERS).filter(([k]) => k !== 'defend').map(([k, o]) => `<button class="act" data-act="gorder" data-v="${k}">${kbd(o.key)}${o.name}</button>`).concat([`<button class="act" data-act="grelease">${kbd('C')}Commander control</button>`])
    : [`<button class="act" data-act="emconAll" data-v="on">Radiate</button>`, `<button class="act" data-act="emconAll" data-v="ambush">Ambush</button>`, `<button class="act" data-act="emconAll" data-v="off">Silent</button>`, `<button class="act warn" data-act="reserve">${kbd('X')}To reserve</button>`];
  return head(`<span class="badge friend">${g.length}</span>`, 'Group', Object.entries(types).map(([k, n]) => `${n}× ${k}`).join(' · ')) + `<div class="ibody"><div class="acts">${acts.join('')}</div><p class="hint">Right-click to move the group${ground ? ' or commit it to a front sector' : ''}. Esc to clear.</p></div>`;
}

})(window.IC);
