/* Iron Canopy — the inspector: one panel on the right for whatever is selected. Each kind of thing shows
   what it is doing right now in plain words, its state, and the orders it can take (with their keys). */
(function (IC) {
'use strict';
const U = IC.U;
/* the live 3D view of something the recorder follows (replay3d.js); nothing when the replay is not loaded */
const liveBtn = o => IC.liveOpen && S && S.rec && S.rec.of.has(o) ? `<button class="act" data-act="liveView" title="A small 3D window that follows it as it happens; it can fill the screen">Live view</button>` : '';
const $ = id => document.getElementById(id);
const ui = IC.ui, esc = U.esc;
const kbd = ui.kbd, bar = ui.bar;
let S = null;

IC.unitState = function (u) {
  if (u.state === 'transit') return [u.toReserve ? 'Returning to reserve' : `${u.airlift ? 'Flown in' : u.deliver ? 'On the way' : 'Moving'} · ${u.eta ? U.dur(Math.max(0, u.eta - S.time)) : ''}`, 'busy'];
  if (u.state === 'building') return [`Building · ${U.dur(u.stT)}`, 'busy'];
  if (u.state === 'setup') return [`Setting up · ${U.dur(u.stT)}`, 'busy'];
  if (u.state === 'packing') return [`${u.deliver ? 'Loading' : 'Packing'} · ${U.dur(u.stT)}`, 'busy'];
  if (u.over) return ['Overheated', 'busy'];
  if (u.emitter) return [u.radarOn ? 'Radiating' : u.emcon === 'ambush' ? 'Ambush' : 'Silent', u.radarOn ? 'ok' : 'fr'];
  return ['Ready', 'ok'];
};
const head = (icon, title, sub, pill, cls) => `<div class="ihead">${icon}<div><h2>${esc(title)}</h2><p>${sub}</p></div><span class="xs">${ui.compact() ? `<button class="x" data-act="inspMin" aria-label="${ui.inspMin ? 'Open' : 'Fold'}" title="${ui.inspMin ? 'Open the panel' : 'Fold the panel to a strip: the map behind it'}">${ui.inspMin ? '▾' : '▴'}</button>` : ''}<button class="x" data-act="desel" aria-label="Close" title="Close (Esc)">✕</button></span></div>${pill ? `<div style="padding:0 .95rem .5rem"><span class="pill ${cls || ''}">${esc(pill)}</span></div>` : ''}`;
const hh = h => IC.hh(h);
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
    else if (s.kind === 'tail') h = tailPanel(r);
    else if (s.kind === 'site') h = site(r);
    else if (s.kind === 'tel') h = tel(r);
    else if (s.kind === 'infra') h = r.parts ? base(r) : r.kind === 'city' ? city(r) : r.kind === 'factory' ? factory(r) : infra(r);
    else if (s.kind === 'apart') h = apart(s);
    else if (s.kind === 'veh') h = convoy(r);
    else if (s.kind === 'air') h = air(r);
    else if (s.kind === 'flight') { if (r.ent && !r.ent.gnd && S.air.includes(r.ent)) { S.sel = { kind: 'air', ref: r.ent }; h = air(r.ent); } else h = flight(r); }
    else if (s.kind === 'fix') h = fix(r);
    else if (s.kind === 'airway') h = airway(r);
    else if (s.kind === 'field') h = field(r);
  }
  el.classList.toggle('glass', !!h);
  el.classList.toggle('slim', !!(IC.FOCUS.polish && s && S.group.length <= 1 && s.kind === 'tail'));
  // another selection, or another airport tab, starts at the top; the same one holds its scroll
  const key = S.group.length > 1 ? 'group' : s ? `${s.kind}:${ui.oid(s.ref)}:${s.kind === 'infra' && s.ref.parts ? ui.aptTab : ''}` : '';
  ui.setHTML(el, h, key);
  if (ui.scrollTo) { const t = document.getElementById(ui.scrollTo); if (t) { t.scrollIntoView({ block: 'start' }); ui.scrollTo = null; } }
  IC.renderAirPicture(S);
};

/* ---------- an airliner of ours, wherever it is: what it is doing, its turnaround, and Follow (round 2) ---------- */
const followBtn = tl => { const on = S.follow && S.follow.tl === tl.id; return `<button class="act ${on ? '' : 'pri'}" data-act="follow" title="${on ? 'Let the camera go' : 'The camera stays with it from the approach to the gate and back out. Drag the map to stop.'}">${on ? 'Stop following' : 'Follow'}</button>`; };
function tailPanel(tl) {
  const al = IC.avAirline(S, tl.al), w = IC.tailWhere(S, tl), ap = w && w.ap, T = tl.T;
  const rows = [['Airline', esc(al ? al.name : '')], ['Aircraft', `${esc(T.name)}${T.seats ? `, ${T.seats} seats` : ''}`], ['Doing now', `<b>${esc(IC.tailPhase(S, tl))}</b>`]];
  if (ap) rows.push(['At', esc(ap.name)]);
  const P = tl.paid; if (P && S.time - P.t < 6 * 3600) rows.push(['Paid on landing', `${U.money(P.land + P.pf + P.cg)}${P.pax ? ` (${P.pax} passengers)` : ''}`]);
  let turn = '';
  if (w && w.s && ap) {
    const n = IC.turnNow(S, ap, w.s);
    if (n) {
      const li = (k, L) => L.length ? `<dt>${k}</dt><dd>${esc(L.join(', '))}</dd>` : '';
      turn = `<div class="sec"><h3 class="sh">Turnaround at stand ${esc(IC.standName(w.s))}</h3>${bar(n.f, 'var(--amber)')} <span class="muted">${tl.t > 0 ? `${U.dur(tl.t)} left` : 'turned round'}</span>
        <dl class="kv">${li('At work', n.now)}${li('Done', n.done)}${li('To come', n.next)}</dl>
        <p class="hint">${n.q.kind === 'bridge' ? 'Passengers walk through the jet bridge.' : n.q.kind === 'bus' ? 'A remote stand: buses carry the passengers to and from the terminal, which takes longer.' : n.q.kind === 'walk' ? 'Passengers walk across the apron and up the steps.' : 'Lorries from the cargo shed load the freight.'} ${n.q.fuel === 'hydrant' ? 'Fuel comes from the hydrant under the stand.' : 'A fuel truck drives over from the fuel farm.'}</p></div>`;
    }
  }
  const mv = tl.mv && !tl.mv.dead ? tl.mv : tl.track && !tl.track.dead ? tl.track : null;
  const acts = [followBtn(tl)]; if (mv && liveBtn(mv)) acts.push(liveBtn(mv));
  // (round 5c) a slim card: what it is doing and the time left, the services at work, Follow; the rest on demand
  if (IC.FOCUS.polish) {
    let tr = '';
    if (w && w.s && ap) { const n = IC.turnNow(S, ap, w.s); if (n) tr = `<div class="turnsec">${bar(n.f, 'var(--amber)')}<div class="tchips">${n.now.map(x => `<span class="chip on">${esc(x)}</span>`).join('')}${n.next.slice(0, 3).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`; }
    const more = ui.tailMore ? `${kv(rows.filter(r => r[0] !== 'Doing now'))}${turn.replace('<div class="sec">', '<div class="sec turnmore">')}` : '';
    acts.push(`<button class="act" data-act="tailMore" aria-expanded="${!!ui.tailMore}">${ui.tailMore ? 'Less ▴' : 'More ▾'}</button>`);
    return head(`<span class="badge civil">${ui.icon('air')}</span>`, tl.cs, `${esc(al ? al.name : 'Airliner')} · ${esc(T.short || '')}${ap ? ` · ${esc(ap.name.replace(/ (International|Airport)$/, ''))}` : ''}`) + `<div class="ibody"><p class="now">${esc(IC.tailPhase(S, tl))}</p>${tr}<div class="acts">${acts.join('')}</div>${more}</div>`;
  }
  return head(`<span class="badge civil">${ui.icon('air')}</span>`, tl.cs, `${esc(al ? al.name : 'Airliner')} · ${esc(T.short || '')}`) + `<div class="ibody">${kv(rows)}${turn}<div class="acts">${acts.join('')}</div></div>`;
}

/* ---------- the airspace: fixes, airways, light-aircraft fields ---------- */
const covTxt = a => ui.covTxt(a);
function fix(f) {
  const ways = S.asp.ways.filter(w => w.a === f.id || w.b === f.id);
  const apts = IC.bases(S).filter(b => b.kind === 'airport' && b.owner === 'us' && IC.aspLink(S, b) === f);
  const rows = [['Near', esc(IC.nearestPlace(S, f.x, f.y))], ['Airways', ways.length ? ways.map(w => { const o = IC.aspFix(S, w.a === f.id ? w.b : w.a); return esc(o.name); }).join(', ') : '<span class="amber">none yet</span>'],
    ['Radar sees down to', covTxt(IC.aspCovAlt(S, f.x, f.y))], ['Airports joining here', apts.length ? esc(apts.map(b => b.name).join(', ')) : '—']];
  return head(`<span class="badge friend">${ui.icon('fix')}</span>`, f.name, 'Fix · a named point airliners fly over') + `<div class="ibody">${kv(rows)}
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
  return head(`<span class="badge friend">${ui.icon('airway')}</span>`, `${a.name} – ${b.name}`, 'Airway') + `<div class="ibody">${kv(rows)}${tips.map(x => `<p class="hint">${x}</p>`).join('')}
    <div class="acts"><button class="act warn" data-act="wayDel" data-id="${w.id}">Delete airway</button></div></div>`;
}
function field(f) {
  const n = S.threats.filter(t => !t.dead && t.type === 'ga' && t.gaTo && t.gaTo.field === f.id).length;
  const rows = [['Club', esc(f.club)], ['Club mood', `${bar(f.mood / 100, f.mood > 60 ? 'var(--ok)' : f.mood > 35 ? 'var(--amber)' : 'var(--hostile)')} ${Math.round(f.mood)}%`], ['Movements today', f.today], ['Inbound now', n], ['Radar sees down to', covTxt(IC.aspCovAlt(S, f.x, f.y))]];
  return head(`<span class="badge friend">${ui.icon('field')}</span>`, f.name, 'Grass strip for light aircraft') + `<div class="ibody">${kv(rows)}
    <p class="hint">Light aircraft fly slow and low, by sight, in daylight and fair weather. Many have no flight plan and some no transponder. Clubs pay little, but grounding them for long makes them loud.</p></div>`;
}

/* ---------- our air defence, sensors, launchers, depots ---------- */
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
  if (u.mags.length) acts.push(`<button class="act ${u.pri ? 'on' : ''}" data-act="pri">Priority resupply</button>`);
  if (Object.values(u.comp).some(v => v < 1) || u.hp < u.max) acts.push(`<button class="act ${u.repairing ? 'on' : ''}" data-act="repair" ${u.repairing ? 'disabled' : ''}>${kbd('P')}${u.repairing ? 'Repair crew on site' : `Repair · ${U.money(Math.max(3, d.cost * 0.08))}`}</button>`);
  if (u.prio && !u.prio.dead) acts.push(`<button class="act" data-act="clearPrio">Clear target TN ${u.prio.tn}</button>`);
  if (liveBtn(u)) acts.push(liveBtn(u));
  if (!u.central) acts.push(`<button class="act warn" data-act="reserve">${kbd('X')}${d.mob === 'fixed' ? 'Dismantle' : 'To reserve'}</button>`);
  if (acts.length) parts.push(`<div class="acts">${acts.join('')}</div>`);
  // launchers drawn as rounds, the stock on site, the next reload and the next load
  if (u.mags.length) {
    const mags = IC.activeMags(S, u).map(m => {
      const M = IC.MUN[m.mun], sh = esc(M.short || m.mun);
      IC.magSync(u, m);
      const lns = m.l.map((n, i) => `<span class="ln ${i === m.li ? 'rl' : ''}" title="Launcher ${i + 1}: ${n} of ${m.per} ready${i === m.li ? ', reloading' : ''}">${Array.from({ length: m.per }, (_, k) => `<i class="${k < n ? '' : 'e'}"></i>`).join('')}</span>`).join('');
      const left = IC.reloadLeft(S, u, m);
      const rl = left != null ? `<span class="amber">launcher ${m.li + 1} reloading, ready in ${U.dur(left)}</span>`
        : m.mag >= m.max ? 'every launcher full' : m.store > 0 ? 'the part-empty launcher reloads once it has been quiet for a minute' : '<span class="hostile">nothing on site to reload from</span>';
      return `<div class="mag" title="${esc(IC.fullName(M))}: ${esc(IC.SEEKER[M.seeker] || '')}"><b>${sh}</b><span class="rounds">${lns}</span><small>${m.mag}/${m.max}</small></div>
        <p class="hint" style="margin:0 0 .15rem">${m.ln > 1 ? `${m.ln} launchers of ${m.per}. ` : ''}Stock on site: <b>${m.store}</b> of ${m.storeMax}${m.inc ? ` · ${m.inc} coming` : ''} · ${rl}.</p>`;
    }).join('');
    const next = IC.activeMags(S, u).map(m => { const n = IC.nextLoad(S, u, m); return `<p class="hint ${n.cls === 'ok' ? '' : n.cls}" style="margin:.25rem 0"><b>${esc(IC.MUN[m.mun].short || m.mun)}:</b> ${esc(n.text)}</p>`; }).join('');
    const P = IC.heliPlan(S, u);
    const heli = P.why ? `<p class="hint amber" style="margin:.25rem 0">${esc(P.why)}</p>`
      : `<p class="hint" style="margin:.25rem 0">${esc(P.r.name)} from ${esc(P.src.name)}: ${esc(P.loads.filter(l => l.u === u).map(l => IC.munWords(l.m.mun, l.qty)).join(' and '))}, here in about ${U.dur(P.eta)}. The sortie costs ${U.money(P.cost)}.${P.stops.length > 1 ? ` On the way it also brings loads to ${esc(P.stops.filter(x => x !== u).map(x => x.name).join(', '))}.` : ''}</p>`;
    parts.push(`<div class="sec"><h3 class="sh">Launchers <em>ready · stock on site · coming</em></h3><div class="mags">${mags}</div>${next}
      <div class="acts"><button class="act" data-act="heli" ${P.why ? 'disabled' : ''}>${kbd('H')}Resupply by helicopter</button></div>${heli}</div>`);
  }
  // parts and crew
  const comps = Object.entries(u.comp).map(([c, v]) => `<span>${IC.COMPS[c].name}</span>${bar(v)}<span>${v < 0.35 ? '<b class="hostile">OUT</b>' : U.pct(v)}</span>`).join('');
  parts.push(`<div class="sec"><h3 class="sh">Condition</h3><div class="bars"><span>Integrity</span>${bar(u.hp / u.max)}<span>${U.pct(u.hp / u.max)}</span>${comps}<span>Crew rest</span>${bar(1 - u.fat / 100, u.fat > 70 ? 'var(--hostile)' : u.fat > 50 ? 'var(--amber)' : 'var(--ok)')}<span>${u.fat > 70 ? '<b class="amber">tired</b>' : U.pct(1 - u.fat / 100)}</span></div></div>`);
  // what it can do
  const rows = [];
  const rng = IC.maxRange(S, u); if (rng) rows.push(['Weapon reach', U.km(rng)]);
  const sams = u.mags.map(m => m.mun).filter((m, i, a) => IC.MUN[m].alt && a.indexOf(m) === i);
  if (sams.length) parts.push(`<div class="sec"><h3 class="sh">Reach by height <em>side view</em></h3><canvas class="reach" data-reach="${sams.join(',')}" width="400" height="160"></canvas>${sams.map(m => `<p class="hint"><b>${esc(IC.MUN[m].short || m)}</b> ${esc(IC.reachText(m))}.</p>`).join('')}</div>`);
  if (d.sensor) {
    const sn = d.sensor;
    rows.push(['Radar', `${U.km(sn.R)}${sn.per && sn.rot ? ` · turns every ${sn.per} s` : ''}`]);
    rows.push(['Identification', sn.idc === 'none' ? 'position only' : sn.idc === 'iff' ? 'reads transponders' : sn.idc === 'nctr' ? `types inside ${U.km(sn.nctrR * (IC.hasTech(S, 's_nctr') ? 1.5 : 1))}` : sn.idc === 'emit' ? 'emitter types' : 'rough class']);
    if (sn.mast && !sn.passive) rows.push(['Sees low fliers', `to ~${U.km(U.horizon(sn.mast, 0.05))}`]);
  }
  if (d.fc && !d.fc.passive) rows.push(['Fire-control radar', U.km(d.fc.R)]);
  if (u.jamF < 0.97) rows.push(['Jammed', `<span class="amber">−${U.pct(1 - u.jamF)}</span>`]);
  if (u.rec && (u.rec.fired || u.rec.kills)) rows.push(['Record', `${u.rec.kills} shot down · ${u.rec.fired} missile${u.rec.fired === 1 ? '' : 's'} fired`]);
  if (IC.lockedOn(S, u)) rows.push(['Warning', '<span class="hostile">Locked on: an enemy weapon is homing on it</span>']);
  if (u.intf) rows.push(['Interference', `<span class="amber">${u.intf} other ${IC.BAND_NAME[IC.BAND[u.type]] || ''} radar${u.intf > 1 ? 's' : ''} within 70 km: −${U.pct(1 - u.intfF)} range</span>`]);
  else if (IC.BAND[u.type] && d.sensor && !d.sensor.passive) rows.push(['Band', `${IC.BAND_NAME[IC.BAND[u.type]]} · clear`]);
  rows.push(['Enemy knowledge', intel]);
  parts.push(kv(rows));
  if (u.inv) parts.push(depot(u));
  return head(ui.sym(u.type, 104, 80), u.name, `${esc(IC.fullName(d))} · ${IC.MOB_LABEL[d.mob]}`, st, cls) + `<div class="ibody"><div class="now ${whyCls}">${esc(why)}</div>${parts.join('')}<p class="hint">${d.weapon === 'strike' ? 'Right-click an enemy target to fire; shift+right-click fires a salvo.' : d.mob !== 'fixed' ? 'Right-click the map to move. With a battery selected, right-click a track to make it the priority target.' : esc(d.desc)}</p></div>`;
}
function depot(u) {
  const dem = IC.depotDemand(S)[u.id] || {};
  const keys = IC.STOCK_KEYS.filter(k => (u.inv[k] || 0) >= 1 || dem[k] || (u.inc[k] || 0) > 0);
  const rows = keys.map(k => { const want = Math.ceil(dem[k] || 0), have = Math.floor(u.inv[k] || 0), low = want && have + (u.inc[k] || 0) < want * 0.5; return `<tr><td>${esc(IC.munWords(k))}</td><td class="r ${low ? 'amber' : ''}">${have}</td><td class="r">${want || '–'}</td><td class="r">${u.inc[k] ? '+' + u.inc[k] : ''}</td></tr>`; }).join('');
  const trucks = S.vehicles.filter(v => v.home === u && !v.dead);
  const others = IC.depots(S).filter(d => d !== u);
  const served = S.units.filter(x => x.mags.length && IC.servingDepot(S, x) === u).length;
  return `<div class="sec"><h3 class="sh">Stock <em>${u.central ? 'national stock' : `serves ${served} unit${served === 1 ? '' : 's'} within ${U.km(u.reach || 1400)}`}</em></h3>
    <table class="t"><tr><th>Item</th><th class="r">Held</th><th class="r">Needed</th><th class="r">Coming</th></tr>${rows || '<tr><td colspan="4">Empty</td></tr>'}</table>
    <p class="hint">Needed: one full reload for every unit it looks after${u.central ? ', and half a reload for the forward depots' : ''}.${S.supply.auto ? ' Keep stocked is on: the Ministry buys what runs low.' : ' Keep stocked is off: buy stock in Supply (L).'}</p>
    ${u.central ? '' : `<h3 class="sh">Resupply priority</h3>${seg('dpri', u.pri || 'normal', Object.entries(IC.DEPOT_PRI).map(([k, p]) => [k, p.name, '', p.desc]))}`}
    <h3 class="sh">Truck companies <em>${trucks.filter(v => v.state !== 'idle').length} of ${trucks.length} out</em></h3>
    <div class="acts"><button class="act" data-act="buyTruck" ${S.budget < 12 ? 'disabled' : ''}>+ Truck company · ₭12M</button>${others.length ? `<button class="act" data-act="moveTruck" ${trucks.some(v => v.state === 'idle') ? '' : 'disabled'}>Send one to ${esc(others.sort((a, b) => U.dist(a, u) - U.dist(b, u))[0].name)}</button>` : ''}</div>
    <p class="hint">Each company is one convoy of three lorries: more companies, more deliveries at once.</p></div>`;
}

/* ---------- tracks: what we know, how we know it ---------- */
function track(t) {
  const aff = t.decoyKnown ? 'D' : t.aff || 'U';
  const colCls = { H: 'hostile', S: 'suspect', U: 'unknown', A: 'civil', N: 'civil', D: 'muted' }[aff];
  const name = aff === 'N' || aff === 'A' ? `${t.type === 'ga' ? 'Light aircraft' : 'Airliner'} ${t.cs}` : aff === 'H' ? IC.fullName(t.d) : t.decoyKnown ? 'Decoy' : IC.AFF[aff].name + ' track';
  const age = S.time - t.pt;
  const q = t.fc ? 'fire-control quality' : t.satOnly ? 'satellite cue' : t.det ? `surveillance, ${age < 3 ? 'fresh' : U.dur(age) + ' old'}` : 'lost';
  const ladder = `<div class="ladder">
    <div class="y"><small>Detected</small><b>${esc(q)}</b></div>
    <div class="${t.klass ? 'y' : ''}"><small>Type</small><b>${t.klass ? esc(IC.KLASS[t.klass] || t.klass) : t.idp > 0 ? 'recognising ' + U.pct(Math.min(1, t.idp)) : 'unknown'}</b></div>
    <div class="${aff === 'H' || aff === 'N' ? 'y' : ''}"><small>Identity</small><b class="${colCls}">${IC.AFF[aff === 'D' ? 'H' : aff].name}${aff === 'D' ? ' decoy' : ''}</b></div></div>`;
  const rows = [
    ['Height', t.altKnown ? `${esc(IC.altText(t))}${IC.isAircraft(t) ? ` · ${U.alt(t.alt)}` : ''}${t.lvl != null && Math.abs(t.lvl - t.alt) > 0.1 ? ` · ${t.lvl > t.alt ? 'climbing' : 'descending'} to ${esc(IC.flText(t.lvl))}` : ''}` : '<span class="muted">unknown (2D radar only)</span>'],
    ['Speed', U.kmh(Math.hypot(t.vx, t.vy))], ['Heading', U.compass(Math.atan2(t.vy, t.vx))],
    ['Transponder', t.sqSeen || t.sq && t.aff !== 'U' ? `${t.sq || 'none'}${t.cs ? ' · ' + esc(t.cs) : ''}` : t.sq ? '<span class="muted">not interrogated</span>' : 'none'],
    ['Flight plan', t.plan ? `${esc(t.plan.a.name || '?')} → ${esc(t.plan.b.name || '?')}${t.sqSeen ? (IC.offRoute(t) < 50 ? ' · <span class="civil">on route</span>' : ` · <span class="suspect">${U.km(IC.offRoute(t))} OFF ROUTE</span>`) : ''}` : t.d.civil && t.type === 'ga' ? `${t.fpl ? 'filed' : 'none'} · flying by sight${t.gaTo ? ` to ${esc(t.gaTo === t.gaFrom ? 'and back from ' + t.gaFrom.name : t.gaTo.name)}` : ''}` : 'none filed']
  ];
  // what air traffic control can do for it
  if (t.d.civil && (aff === 'N' || aff === 'A')) {
    if (t.plan && t.plan.pts) { const fx = t.plan.pts.filter(p => p.fix).map(p => p.name); rows.push(['Route', fx.length ? `airways via ${esc(fx.join(', '))}` : '<span class="amber">direct: no airway fits, so controllers space it wider</span>']); }
    rows.push(['Controllers', IC.aspSeen(S, t) ? '<span class="civil">see it on radar</span>' : `<span class="amber">cannot see it${t.sq ? ' at this height' : ': no transponder'}</span>`]);
    if (t.type === 'ga') rows.push(['Cleared into', t.cleared && t.cleared.length ? esc(t.cleared.map(id => S.byId[id] ? S.byId[id].name : id).join(', ')) : 'no controlled airspace']);
    if (S.asp && S.asp.vols) {
      const c = IC.aspClassAt(S, t.x, t.y, t.alt), sec = t.sec && IC.aspSector(S, t.sec);
      rows.push(['Airspace', `${esc(IC.ASP_CLS[c.cls].name)}${c.vol && c.vol.ap ? ` (${esc(S.byId[c.vol.ap].name)})` : c.way ? ' (airway)' : ''}${sec ? ` · ${esc(sec.name)}` : ''}`]);
      if (t.stk) rows.push(['Holding', `${esc(t.stk.k)} stack at ${esc(S.byId[t.stk.ap].name)}, level ${IC.atcStackIndex(S, t) + 1}: ${esc(IC.flText(t.lvl))}`]);
      else if (t.slot && t.toApt && !t.appr) rows.push(['Landing slot', `${U.clock(t.slot)}${t.spdF < 0.99 ? ` · slowed to ${Math.round(t.spdF * 100)}% to meet it` : ''}${t.seqVec && t.vector != null ? ' · on a heading to lose time' : ''}`]);
      if (t.pCmd) rows.push(['Radio', '<span class="amber">flying your instructions; controllers leave it to you</span>']);
    }
  }
  if (aff === 'H' && IC.PROFILES) { const pf = IC.profileOf(t); rows.push(['Height profile', `<b>${esc(pf.name)}</b> (${esc(pf.band)}). ${esc(pf.words)}`]); }
  if (t.tail) { const al = IC.avAirline(S, t.tail.al); rows.push(['Operator', `${esc(al.name)} · ${esc(IC.ACTYPES[t.tail.type].name)}`]); }
  if (t.emergency) rows.push(['Status', '<span class="hostile">MAYDAY · emergency landing</span>']);
  if (t.noReply) rows.push(['Radio', '<span class="suspect">no answer</span>']);
  if (t.affWhy) rows.push(['Why', esc(t.affWhy)]);
  if (t.inbound) rows.push(['Interceptors', `${t.inbound} in flight`]);
  if (!t.det && t.held) rows.push(['Contact', `<span class="amber">no plot for ${U.dur(S.time - t.pt)}: shown where it should be by now, within ${U.km(IC.trackUnc(t).along)}. Lost in ${U.dur(Math.max(0, IC.coastT(t) - (S.time - t.pt)))}.</span>`]);
  if (t.grp) rows.push(['Raid', `${t.grp.n} aircraft flying together: TN ${t.grp.members.slice(0, 6).map(x => x.tn).join(', ')}${t.grp.n > 6 ? '…' : ''}. Fighters sent at one take them all on.`]);
  if (aff === 'H' && !t.d.civil && (t.aim || t.x1 != null)) {
    const ax = t.x1 != null ? t.x1 : t.aim.x, ay = t.y1 != null ? t.y1 : t.aim.y;
    rows.push(['Impact', `<span class="hostile">${esc(IC.nearestPlace(S, ax, ay))} · ${U.dur(IC.timeToImpact(t))}</span>`]);
  }
  if (t.d.civil && aff === 'N') rows.push(['Aboard', `${t.pax}`]);
  const hostile = !(aff === 'N' || aff === 'A' || aff === 'D');
  const bats = S.units.filter(u => u.d.weapon === 'sam' && u.state === 'ready' && (U.dist(u, t) <= IC.maxRange(S, u) * 1.05 || IC.predictable(t) && U.dxy(u.x, u.y, t.x1 != null ? t.x1 : t.aim.x, t.y1 != null ? t.y1 : t.aim.y) <= IC.maxRange(S, u))).slice(0, 5);
  const acts = [];
  if ((t.d.cls === 'air' || t.d.cls === 'ga' || t.d.cls === 'drone' || t.d.cls === 'cm') && !t.border) acts.push(`<button class="act ${aff === 'S' || aff === 'U' ? 'pri' : ''}" data-act="scramble" ${S.roster.some(r => r.kind === 'ftr' && r.st === 'ready' && IC.canLaunch(S, r)) || S.air.some(a => a.kind === 'ftr' && a.state !== 'rtb') ? '' : 'disabled'}>${kbd('V')}${aff === 'H' ? 'Intercept' : 'Intercept & identify'}</button>`);
  if (t.d.civil && (aff === 'N' || aff === 'A') && !t.appr && S.asp) {
    const o = (op, v, l, x) => `<button class="act ${x || ''}" data-act="atc" data-op="${op}" ${v != null ? `data-v="${v}"` : ''} title="On the radio to ${esc(t.cs)}">${l}</button>`;
    acts.push(o('lvl', 20, 'Climb 2,000 ft'), o('lvl', -20, 'Descend 2,000 ft'), o('turn', -30, 'Left 30°'), o('turn', 30, 'Right 30°'), t.phold ? '' : o('hold', null, 'Hold here'), t.pCmd ? o('resume', null, 'Back to controllers', 'on') : '');
    if (t.type === 'ga') { const ap = IC.bases(S).filter(x => x.owner === 'us' && IC.aspVols(S, x).length).sort((p, q) => U.dist(p, t) - U.dist(q, t))[0]; if (ap && !(t.cleared || []).includes(ap.id)) acts.push(`<button class="act" data-act="atc" data-op="clear" data-id="${ap.id}">Clear into ${esc(ap.name)} airspace</button>`); }
  }
  acts.push(`<button class="act" data-act="atc" data-op="side" title="A slice along its path: what flies above and below it">Side view</button>`);
  if ((t.sq || t.d.civil || t.disguise) && t.d.cls !== 'bal' && !t.border) acts.push(`<button class="act ${t.offFlag ? 'pri' : ''}" data-act="radio" ${t.called && S.time - t.called < 300 ? 'disabled' : ''} title="Call the aircraft on the guard frequency">${t.called && S.time - t.called < 300 ? 'Calling…' : 'Call on radio'}</button>`);
  const escort = S.air.find(a => !a.dead && !a.gnd && a.kind === 'ftr' && a.mission && a.mission.track === t);
  const ftrs = (t.d.cls === 'air' || t.d.cls === 'ga' || t.d.cls === 'drone' || t.d.cls === 'cm' || t.d.cls === 'heli') && !t.border ? fighterOptions(t) : '';
  if (escort && hostile && (escort.roe || S.ad.roe) === 'hold') acts.push(`<button class="act danger" data-act="escortFire" data-id="${escort.id}" title="${esc(escort.name)} is escorting it with weapons held. This order lets it fire.">Order ${esc(escort.name)} to fire</button>`);
  if (hostile && S.units.some(u => u.d.weapon)) acts.push(`<button class="act ${aff === 'H' ? 'pri' : ''}" data-act="assignBest" ${bats.length ? '' : 'disabled'}>${kbd('B')}Assign best battery</button>`);
  if (IC.replayOpen && S.rec && S.rec.of.has(t)) acts.push(`<button class="act" data-act="replayTrack" title="The last minutes of this track in 3D, following it">Replay</button>`);
  acts.push(liveBtn(t));
  if (t.tail) acts.push(followBtn(t.tail));
  const warn = (aff === 'A' || aff === 'N') ? `<div class="warnbox">This track squawks a civil code on a filed route. Batteries will not fire at it unless you assign one by hand.</div>` : aff === 'S' && S.ad.roe === 'tight' ? `<p class="hint">Weapons are Tight: batteries hold fire on suspects. Identify it (fighter or type recognition) or assign a battery by hand.</p>` : '';
  const list = bats.map(u => `<div class="li"><b>${esc(u.name)}</b><small>${U.km(U.dist(u, t))} · ${IC.activeMags(S, u).map(m => `${m.mag} ${m.mun}`).join(', ')} · ${esc(IC.engageWhy(S, u, t))}</small><span class="la"><button class="btn sm" data-act="assign" data-uid="${u.id}" ${u.prio === t ? 'disabled' : ''}>${u.prio === t ? 'Assigned' : 'Assign'}</button></span></div>`).join('');
  // a known hostile shows its symbol; anything else the aircraft sign in the colour of what we think it is
  const badge = aff === 'H' && IC.THR[t.type] ? `<span class="badge hostile"><canvas data-thr="${t.type}" width="68" height="52"></canvas></span>` : `<span class="badge ${colCls}">${ui.icon('air')}</span>`;
  return head(badge, `TN ${t.tn}`, `<span class="${colCls}">${esc(name)}</span>`) + `<div class="ibody">${ladder}${kv(rows)}${warn}<div class="acts">${acts.join('')}</div>${ftrs}${list ? `<div class="sec"><h3 class="sh">Batteries in reach</h3><div class="list">${list}</div></div>` : ''}</div>`;
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
// zones in words that fit a button (no PAX, CGO, GA, MIL)
const zoneWord = k => ({ civil: 'Passenger', cargo: 'Cargo', light: 'Light', mil: 'Military' }[k] || IC.ZONES[k].name);
const TEMPLATE_NAME = { intl: 'International airport', regional_ok: 'Regional airport', regional_bad: 'Regional airport', mil_mothball: 'Air base (mothballed)', mil_full: 'Air base', new: 'New airport' };
function base(b) {
  const st = b.st && b.st.rwy ? b.st : IC.aptStats(S, b);
  const bs = IC.baseStatus(S, b);
  const flights = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
  const civil = b.kind === 'airport';
  const locked = b.locked;
  const stands = IC.aptStands(b), used = stands.filter(s => s.occ).length, linked = stands.filter(s => s.linked !== false && s.hp > 0).length;
  const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id).length;
  const pill = locked ? 'Air Force' : !st.rwy.length ? 'No runway' : bs.runway ? `${st.movesPerHour} movements/h` : IC.rwyState(S, b).building ? IC.rwyState(S, b).word : 'RUNWAY CLOSED';
  const rw0 = b.parts.filter(p => p.kind === 'runway' && p.built);
  const sub = `${TEMPLATE_NAME[b.template] || (civil ? 'Airport' : 'Air base')} · ${st.longest ? U.km(st.longest) + ' runway' : rw0.length ? 'runway closed' : 'no runway yet'}`;
  const H = head(`<span class="badge friend">${ui.icon(civil ? 'airport' : 'airbase')}</span>`, b.name, esc(sub), ui.hands() && civil && bs.runway ? '' : pill, locked ? '' : bs.runway ? 'ok' : 'bad');
  // (a site with nothing on it yet has no plan to draw: an empty dark box looks broken)
  const schem = `${b.parts.length ? `<canvas class="schem" data-schem="${b.id}" width="560" height="250"></canvas>` : ''}<div class="acts"><button class="act" data-act="aptZoom">Zoom to the airport</button><button class="act pri" data-act="bbToggle" title="The build bar along the bottom of the screen (B)">Build (B)</button></div>`;
  if (locked) return H + `<div class="ibody">${schem}<p class="hint">${esc(b.name)} belongs to the Air Force. It comes under your command later in your career.</p></div>`;
  const warn = st.warn.length ? `<div class="sec"><h3 class="sh">Problems <em>${st.warn.length}</em></h3>${st.warn.slice(0, 6).map(w => `<div class="warnrow">${esc(w)}</div>`).join('')}</div>` : '<div class="now ok">No layout problems found.</div>';
  const fuelF = st.fuelCap ? st.fuel / st.fuelCap : 0, svc = IC.aptServiceLines(S, b);
  const kp = b.kpi || {};
  const ROLE = { arr: 'arrivals', dep: 'departures', mixed: 'arrivals and departures', spare: 'not in use' };
  const flown = { arr: 0, dep: 0 }; for (const x of b.mvLog || []) flown[x.k]++;
  // the runway configuration the wind has chosen, one line per runway
  const rwSec = st.rwy.length ? `<div class="sec"><h3 class="sh">Runways <em>${st.cfg ? esc(st.cfg.name.toLowerCase()) + ' · ' : ''}wind ${IC.windText(S)}</em></h3>${st.rwy.map(r => {
    const busy = r.role === 'arr' ? `${U.dur(r.land)} a landing` : r.role === 'dep' ? `${U.dur(r.dep)} a take-off` : r.role === 'mixed' ? `${U.dur(r.land)} a landing, ${U.dur(r.dep)} a take-off` : 'crosswind or not needed';
    return `<div class="rwrow ${r.role}"><b>${esc(r.end)}</b><span>${ROLE[r.role] || ''} · ${busy}${r.threshold ? '' : ' · <span class="amber">backtrack</span>'}${r.ils[r.dir > 0 ? 'a' : 'b'] ? ' · ILS' : ''}</span><em>${r.perHour ? r.perHour + '/h' : ''}</em></div>`; }).join('')}
    ${IC.needILS(S) ? '<p class="hint amber">Poor visibility: arrivals land only where there is a landing system (ILS).</p>' : ''}</div>` : '';
  const zoneSec = Object.keys(st.zones || {}).length ? `<div class="sec"><h3 class="sh">Stands <em>${used}/${linked} in use${stands.length > linked ? ` · <span class="amber">${stands.length - linked} cut off</span>` : ''}</em></h3>${Object.entries(st.zones).map(([k, z]) => `<div class="rwrow zone"><b>${zoneWord(k)}</b><span>${k === 'civil' ? `${z.contact} at gates, ${z.remote} remote (bus)` : `${z.s + z.m + z.l} stands`}</span><em>S${z.s} M${z.m} L${z.l}</em></div>`).join('')}</div>` : '';
  const rows = [
    ['Capacity', `${st.arrPerHour} arrivals + ${st.depPerHour} departures an hour`],
    ['Last hour', `${flown.arr} arrivals, ${flown.dep} departures`],
    ['Largest aircraft', st.maxType ? esc(IC.ACTYPES[st.maxType].name) : '<span class="hostile">none</span>'],
    ['Fuel', `${Math.round(st.fuel)}/${st.fuelCap}${fuelF < 0.25 ? ' <span class="amber">low</span>' : ''} · enough for ${st.fuelDeps || 0} departures an hour. <span class="${svc.fuel.includes('waited') || !st.tanks ? 'amber' : ''}">${esc(svc.fuel)}</span>`],
    ['Control tower', `<span class="${!st.tower ? 'hostile' : svc.tower.includes('cannot see') ? 'amber' : ''}">${esc(svc.tower)}</span>`],
    ['Approach radar · ground radar', `${st.radar ? 'yes' : 'no'} · ${st.gradar ? 'yes' : st.complex ? '<span class="amber">no</span>' : 'no'}`],
    ['Fire and rescue', `<span class="${!st.fire || svc.fire.includes('heavy jets') ? 'amber' : ''}">${esc(svc.fire)}</span>`],
    ['Landing systems', `${st.ilsEnds || 0} of ${st.rwy.length * 2} runway ends`]
  ];
  if (civil) rows.push(['Terminal', `${Math.round(b.paxRate || 0).toLocaleString('en-US')} / ${Math.round(st.pax).toLocaleString('en-US')} passengers an hour`]);
  if (civil) rows.push(...lifeRows(b));
  const rr = civil && IC.aptRoadReport ? IC.aptRoadReport(S, b) : null;
  if (rr) rows.push(['Roads', `${esc(rr.text)}${rr.works.length ? ' ' + rr.works.map(esc).join(' ') : ''}<div class="acts">${Object.entries(IC.ROADS).map(([k, R]) => `<button class="act" data-act="roadMode" data-v="${k}" title="${esc(R.what)}: ${U.money(R.perKm)} a km">${esc(R.name)}</button>`).join('')}</div>`]);
  if (civil && S.asp) { const f = IC.aspLink(S, b), ga = (b.gaMoves || []).filter(x => S.time - x < 3600).length; rows.push(['Airspace', `${f ? `joins the airways at ${esc(f.name)}` : '<span class="amber">no airway within 120 km</span>'} · light aircraft ${ga} an hour${ga >= 3 ? ' <span class="amber">(each holds the runway as long as two airliners)</span>' : ''}`]); }
  const kpis = `<div class="kpis">
    <div><small>Avg taxi</small><b class="${kp.taxi > 600 ? 'amber' : ''}">${U.dur(kp.taxi || 0)}</b></div>
    <div><small>Avg delay</small><b class="${kp.wait > 600 ? 'amber' : ''}">${U.dur(kp.wait || 0)}</b></div>
    <div><small>Backtracks</small><b class="${kp.back ? 'amber' : ''}">${kp.back || 0}</b></div>
    <div><small>Gridlocks</small><b class="${kp.grid ? 'amber' : ''}">${kp.grid || 0}</b></div>
    <div><small>Diversions</small><b class="${kp.div ? 'hostile' : ''}">${kp.div || 0}</b></div>
    <div><small>Holding now</small><b class="${hold ? 'amber' : ''}">${hold}</b></div></div>`;
  const works = b.works.map((w, i) => workRow(b, w, i)).join('');
  const reps = IC.aptRepairList(b).filter(it => !b.works.some(w => w.key === it.key)).slice(0, 8).map(it => `<div class="li"><b>${esc(it.label)}</b><small>${U.money(it.cost)} · ${U.dur(it.dur)}</small><span class="la"><button class="btn sm" data-act="aptRepair" data-v="${it.key}" ${S.budget < it.cost ? 'disabled' : ''}>Repair</button></span></div>`).join('');
  const fl = flights.map(r => {
    const pp = IC.parkPos(S, b, r);
    const where = r.st === 'air' ? (r.ent && r.ent.gnd ? `taxiing (${r.ent.ground ? r.ent.ground.phase : ''})` : 'airborne') : pp.fac ? ({ has: 'in a shelter', hangar: 'in a hangar', alert: 'on the alert pad' }[pp.fac.kind]) : pp.stand ? 'on a stand' : '<span class="amber">in the open</span>';
    const stt = r.st === 'ready' ? '<span class="ok">ready</span>' : r.st === 'turn' ? `rearming ${U.dur(r.t)}` : r.st === 'air' ? '' : r.st;
    const block = r.st === 'ready' ? IC.milLaunchBlock(S, b, r) : '';
    const park = r.st !== 'air' && !IC.ACTYPES[r.type || IC.AIRKIND_TYPE[r.kind]].vtol ? `<span class="la"><button class="btn sm ${r.park === 'open' ? 'on' : ''}" data-act="flPark" data-rid="${r.id}" title="In the open aircraft turn round a fifth quicker, but a bomb nearby destroys 8 in 10 (1 in 10 inside a hardened shelter).">${r.park === 'open' ? 'Open' : 'Shelter'}</button></span>` : '';
    return `<div class="li"><button class="lib" data-act="selFlight" data-rid="${r.id}"><b>${esc(r.name)}</b><small>${esc(IC.AIR_KIND[r.kind].short)}×${r.n} · ${stt} ${where}${pp.stand && !pp.fac ? ' (quicker turnaround, easier to destroy)' : ''}${block ? ` · <span class="hostile">${esc(block)}</span>` : ''}</small></button>${park}</div>`;
  }).join('');
  const fee = civil && !IC.storyLock(S, 'charges') ? `<div class="sec"><h3 class="sh">Charges <em>airlines weigh fees against service</em></h3>${seg('aptFee', String(b.feeLevel || 1), [['0.7', '70%'], ['0.85', '85%'], ['1', '100%'], ['1.2', '120%'], ['1.5', '150%', 'amb']])}
    <div class="acts"><button class="act ${b.rwMode === 'mixed' ? 'on' : ''}" data-act="aptRwMode" title="Automatic: with two or more independent runways, some take arrivals and some departures. Mixed: every runway takes both.">Runway use: ${b.rwMode === 'mixed' ? 'mixed' : 'automatic'}</button><button class="act ${b.curfew ? 'on' : ''}" data-act="aptCurfew" title="Nothing lands or leaves 23:00–06:00. Cargo airlines hate it; the neighbours love it. More choices on the day board.">Night curfew: ${b.curfew ? 'on' : 'off'}</button></div></div>` : '';
  // (round 3) the Career's airport panel: the few numbers that matter, its problems with their fixes, its deals,
  // and the rest folded (the tower's rules and the airspace open on their own page from there)
  if (ui.hands() && civil && b.owner === 'us' && ui.aptTab !== 'asp' && ui.aptTab !== 'rules') return H + handsPanel(b, st, { schem, kpis, warn, rwSec, rows, zoneSec, fee, works, reps });
  // four tabs instead of one long page, so the build tools are one click away
  const tab = ui.aptTab === 'build' ? 'info' : ui.aptTab, nw = b.works.length, nd = IC.aptRepairList(b).length;
  const tabs = ui.hands() && civil ? `<div class="itabs"><button class="act" data-act="aptTab" data-v="info">◂ Back to ${esc(b.name.replace(/ (International|Airport)$/, ''))}</button></div>` : `<div class="itabs">${seg('aptTab', tab, [['info', `Overview${st.warn.length ? ` <em class="amber">${st.warn.length}</em>` : ''}`, '', 'Capacity, runways, stands and problems'],
    ['works', `Works${nw + nd ? ` <em>${nw + nd}</em>` : ''}`, '', 'Engineering crews, work queued and repairs'],
    ['ops', civil ? 'Charges' : 'Flights', '', civil ? 'Fees, runway use and night curfew' : 'The flights based here'], ['rules', 'Operations', '', 'The tower\'s rules: when aircraft may go onto a runway'],
    ['asp', `Airspace${S.asp && S.asp.shapes && IC.aspCheck(S, b).length ? ' <em class="amber">!</em>' : ''}`, '', 'Controlled airspace round the airport, drawn as on a chart: its shape, controllers and holding stacks']])}</div>`;
  const body = tab === 'works' ? `<div class="sec"><h3 class="sh">Engineering <em>${b.works.filter(w => !w.wait).length}/${b.crews} crews working</em></h3>${yard(b)}${works ? `<div class="list">${works}</div>` : '<p class="hint">No work queued.</p>'}
      ${reps ? `<h3 class="sh">Damage</h3><div class="list">${reps}</div>` : ''}
      <div class="acts">${(b.works || []).some(w => w.stages) ? `<button class="act" data-act="finishNow" data-v="${b.id}" title="Time runs on fast until every work here is finished; it stops for anything that needs you">⏩ Finish now</button>` : ''}<button class="act" data-act="bwork" data-v="crew" ${S.budget < 20 ? 'disabled' : ''}>+ Crew · ₭20M</button><button class="act ${b.autoRepair ? 'on' : ''}" data-act="bauto">Auto-repair: ${b.autoRepair ? 'on' : 'off'}</button></div></div>`
    : tab === 'rules' ? opsTab(b, st)
    : tab === 'asp' ? airspaceTab(b, st)
    : tab === 'ops' ? `${fee}${civil && S.av ? `<div class="sec"><h3 class="sh">The day</h3>${dayBoardHTML(b)}</div>${scorecardHTML(b)}${IC.FOCUS.gse ? `<div class="sec"><h3 class="sh">Ground vehicles</h3>${fleetHTML(b)}</div>` : ''}` : ''}${fl ? `<div class="sec"><h3 class="sh">Flights here</h3><div class="list">${fl}</div></div>` : civil ? '' : '<p class="hint">No flights are based here.</p>'}`
    : `${schem}${kpis}${warn}${rwSec}${kv(rows)}${zoneSec}`;
  return H + tabs + `<div class="ibody">${body}</div>`;
}
/* (round 5b) ground vehicles: a count per kind with − / +, what this traffic needs, what they cost to run */
function fleetHTML(b) {
  const F = IC.fleet(S, b), N = IC.gseNeed(S, b), cal = S.mode === 'story', per = cal ? IC.MO(S) / 3600 : 24, perW = cal ? 'a month' : 'a day';
  const why = { tug: `${N.push} stand${N.push === 1 ? '' : 's'} with pushback`, bus: `${N.remote} remote stand${N.remote === 1 ? '' : 's'}`, fuel: (b.st || {}).hydrant ? 'the hydrant feeds every stand' : `${N.peak} departures in the busiest hour` };
  const rows = Object.entries(IC.GSE).map(([k, G]) => {
    const n = F[k] || 0, rec = N[k], free = IC.gseFree(S, b, k), off = n < rec ? 'amber' : '';
    // (round 5c) less to read in a row: what it has against what it needs; the money in the tooltip
    if (IC.FOCUS.polish) return `<div class="li" title="${esc(`${U.money(n * G.up * per)} ${perW} to run · ${U.money(G.cost)} each`)}"><b>${esc(G.name)} <span class="${off}">${n}</span><span class="muted"> of ${rec}</span></b><small>${esc(why[k])}${n ? ` · ${free} free now` : ''}</small><span class="la"><button class="btn sm" data-act="gseAdd" data-v="${k}" data-n="-1" ${n ? '' : 'disabled'} title="Sell one for half its price">−</button><button class="btn sm" data-act="gseAdd" data-v="${k}" data-n="1" ${S.budget < G.cost ? 'disabled' : ''} title="Buy one for ${U.money(G.cost)}">+</button></span></div>`;
    return `<div class="li"><b>${esc(G.name)} <span class="${off}">${n}</span></b><small>Recommended ${rec} for ${esc(why[k])} · ${n ? `${free} free now · ` : ''}${U.money(n * G.up * per)} ${perW} to run · ${U.money(G.cost)} each</small><span class="la"><button class="btn sm" data-act="gseAdd" data-v="${k}" data-n="-1" ${n ? '' : 'disabled'} title="Sell one for half its price">−</button><button class="btn sm" data-act="gseAdd" data-v="${k}" data-n="1" ${S.budget < G.cost ? 'disabled' : ''} title="Buy one for ${U.money(G.cost)}">+</button></span></div>`;
  }).join('');
  return `<div class="fleet"><div class="list">${rows}</div><div class="acts"><button class="act ${F.auto ? 'on' : ''}" data-act="gseAuto" title="The airport buys and sells to the recommendation as it grows">Keep it matched: ${F.auto ? 'on' : 'off'}</button></div>
    <p class="hint">Tugs ${esc(IC.GSE.tug.does)}, buses ${esc(IC.GSE.bus.does)}, trucks ${esc(IC.GSE.fuel.does)}. Too few and departures wait on their stands; the map says which.</p></div>`;
}
/* (round 5b) the airlines' scorecards here: each aspect 0–100 side by side, the worst named, its fix one click away */
function scorecardHTML(b) {
  const C = IC.aptScorecards(S, b); if (!C.length) return '';
  const ks = Object.keys(IC.ASPECTS), cls = v => v >= 75 ? 'ok' : v >= 50 ? 'amber' : 'hostile';
  ui.pmById = ui.pmById || new Map();
  const rows = C.map(c => {
    const id = `score:${c.al.id}:${b.id}`; if (c.worst.fix) ui.pmById.set(id, { id, ap: b.id, fix: c.worst.fix, kind: 'score' });
    const cells = ks.map(k => c.ks.includes(k) ? `<td class="r ${cls(c.sc[k])}" title="${esc(IC.ASPECTS[k].name)}">${Math.round(c.sc[k])}</td>` : '<td class="r muted">–</td>').join('');
    const bad = c.worst.v < 75;
    return `<tr><td title="${esc(c.al.name)}: ${c.sat} overall"><i class="livery" style="background:linear-gradient(90deg,${c.al.livery[0]} 50%,${c.al.livery[1]} 50%)"></i>${esc(c.al.name.replace(/ (Airlines|Airways|Air|Cargo|Connect)$/, ''))}</td>${cells}</tr>
      <tr class="sub"><td colspan="${ks.length + 1}"><small>${bad ? `Minds most: <b class="${cls(c.worst.v)}">${esc(c.worst.name.toLowerCase())} ${c.worst.v}</b>. ${esc(c.worst.text)}` : 'No complaints here.'}</small>${c.worst.fix && bad ? ` <button class="btn sm" data-act="pmFix" data-v="${esc(id)}">${esc(c.worst.fix.label)}</button>` : ''}</td></tr>`;
  }).join('');
  const AB = { delay: 'Time', taxi: 'Taxi', gates: 'Gate', fuel: 'Fuel', fees: 'Fees', bags: 'Bags' };
  return `<div class="sec"><h3 class="sh">Scorecards <em>0–100, from their recent flights here</em></h3><table class="t score"><colgroup><col class="nm">${ks.map(() => '<col>').join('')}</colgroup><tr><th>Airline</th>${ks.map(k => `<th class="r" title="${esc(IC.ASPECTS[k].name)}">${AB[k]}</th>`).join('')}</tr>${rows}</table></div>`;
}
/* (round 5b) the day board: each airline's departures by hour as the game plans them, arrivals below, today's
   real movements as ticks, what the runways take (the same numbers as the panel's capacity), and the three things
   the player sets: a cap an hour, an airline's bank earlier or later, and the night policy, each with its effect */
function dayBoardHTML(b) {
  const D = IC.dayBoard(S, b), P = D.plan, now = Math.floor((((S.time % 86400) + 86400) % 86400) / 3600);
  // (round 5c) drawn at the panel's own size, so the hours read and nothing is squeezed; scaled to the flights, not to
  // runways that take five times more (that line then waits at the top with its number)
  const pol = IC.FOCUS.polish, W = pol ? 300 : 720, H = pol ? 168 : 170, mid = pol ? 92 : 92, bw = W / 24;
  const peak = Math.max(4, ...P.dep, ...P.arr, ...D.today.dep, ...D.today.arr);
  const mx = pol ? Math.max(peak * 1.3, Math.min(Math.max(D.capDep, D.capArr), peak * 2.2)) : Math.max(4, D.capDep, D.capArr, ...P.dep, ...P.arr, ...D.today.dep, ...D.today.arr), kU = (mid - 14) / mx, kD = (H - mid - (pol ? 20 : 14)) / mx;
  let g = '';
  for (let h = 0; h < 24; h++) {
    const x = h * bw + 3, w = bw - 6;
    if (h < 6 || h >= 23) g += `<rect class="${D.night === 'curfew' ? 'curfew' : 'night'}" x="${h * bw}" y="0" width="${bw}" height="${H}"/>`;
    let y = mid;
    for (const a of P.al) { const n = a.dep[h]; if (!n) continue; y -= n * kU; g += `<rect x="${x}" y="${y}" width="${w}" height="${n * kU}" style="fill:${a.al.livery[0]}" stroke="rgba(0,0,0,.35)"><title>${hh(h)} · ${esc(a.al.name)}: ${n} departure${n > 1 ? 's' : ''} planned</title></rect>`; }
    g += `<rect class="arrp" x="${x}" y="${mid}" width="${w}" height="${P.arr[h] * kD}"><title>${hh(h)} · ${P.arr[h]} arrivals expected</title></rect>`;
    if (h <= now) g += `<line class="real" x1="${x}" x2="${x + w}" y1="${mid - D.today.dep[h] * kU}" y2="${mid - D.today.dep[h] * kU}"/><line class="real" x1="${x}" x2="${x + w}" y1="${mid + D.today.arr[h] * kD}" y2="${mid + D.today.arr[h] * kD}"/>`;
    if (h % 3 === 0) g += `<text x="${h * bw + (pol ? bw / 2 : 2)}" y="${H - (pol ? 4 : 2)}" ${pol ? 'text-anchor="middle"' : ''}>${String(h).padStart(2, '0')}${pol ? ':00' : ''}</text>`;
  }
  const line = (cls, yy, t) => `<line class="${cls}" x1="0" x2="${W}" y1="${yy}" y2="${yy}"><title>${t}</title></line>`;
  // (a runway line beyond the scale sits at its edge, marked with its number)
  const capU = Math.max(4, mid - D.capDep * kU), capD = Math.min(H - (pol ? 18 : 2), mid + D.capArr * kD);
  if (D.capDep) g += line('cap', capU, `The runways take ${D.capDep} departures an hour`) + line('cap', capD, `The runways take ${D.capArr} arrivals an hour`);
  if (D.capDep && pol) g += `<text class="capt" x="${W - 3}" y="${capU + 10}" text-anchor="end">runways ${D.capDep}/h${mid - D.capDep * kU < 4 ? ' ↑' : ''}</text>`;
  if (D.cap) g += line('mycap', mid - D.cap * kU, `Your cap: ${D.cap} departures an hour`);
  g += `<line class="axis" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><line class="nowl" x1="${(now + 0.5) * bw}" x2="${(now + 0.5) * bw}" y1="4" y2="${H - 12}"/>`;
  const caps = [...new Set([0.5, 0.7, 0.85].map(f => Math.max(1, Math.round(D.capDep * f))))].filter(n => n > 0 && D.capDep > 2);
  const rows = P.al.slice().sort((p, q) => q.tails - p.tails).map(a => {
    const tot = a.dep.reduce((x, y) => x + y, 0), pk = a.dep.reduce((x, v, i, L) => v > L[x] ? i : x, 0);
    const sh = a.shift ? ` · bank ${a.shift > 0 ? '+' : '−'}${Math.abs(a.shift)} h` : '';
    return `<div class="li"><b>${`<i class="livery" style="background:linear-gradient(90deg,${a.al.livery[0]} 50%,${a.al.livery[1]} 50%)"></i>`}${esc(a.al.name)}</b><small>${tot} departure${tot === 1 ? '' : 's'} a day from ${a.tails} aircraft, busiest ${hh(pk)}${sh}</small><span class="la"><button class="btn sm" data-act="dayShift" data-al="${a.id}" data-v="-1" title="Its flights an hour earlier: the bank at ${hh(pk)} moves to ${hh(pk - 1)}">◂ 1 h</button><button class="btn sm" data-act="dayShift" data-al="${a.id}" data-v="1" title="Its flights an hour later: the bank at ${hh(pk)} moves to ${hh(pk + 1)}">1 h ▸</button></span></div>`;
  }).join('');
  return `<div class="dayb"><div class="tl-key"><span class="k dep">Departures planned, by airline</span><span class="k arr">Arrivals expected</span><span class="k real">Today so far</span>${D.capDep ? `<span class="k cap">The runways take ${D.capDep} departures and ${D.capArr} arrivals an hour</span>` : ''}</div>
    <svg class="tl-svg day" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="The day's flights by hour">${g}</svg>
    <div class="dcap"><h3 class="sh">Cap <em>departures an hour</em></h3>${seg('dayCap', String(D.cap), [['0', 'No cap']].concat(caps.map(n => [String(n), String(n), '', `At most ${n} departures in any hour`])))}<p class="hint">${esc(D.capWords)}</p></div>
    <div class="dnight"><h3 class="sh">Night <em>23:00–06:00</em></h3>${seg('dayNight', D.night, Object.entries(IC.NIGHT_POL).map(([k, v]) => [k, v.name, k === 'open' ? 'amb' : '', `${v.brief}. ${D.nightWords[k]}`]))}<p class="hint">${esc(IC.NIGHT_POL[D.night].brief.charAt(0).toUpperCase() + IC.NIGHT_POL[D.night].brief.slice(1))}. ${esc(D.nightWords[D.night])}</p></div>
    ${rows ? `<div class="dbanks"><h3 class="sh">Airlines <em>move a bank an hour</em></h3><div class="list">${rows}</div></div>` : '<p class="hint">No airline flies from here yet.</p>'}</div>`;
}
/* (round 3) one airport panel: passengers, movements and money; the chain from the city; problems with their
   fix; deals to sign and deals at risk; works; and the details folded */
function handsPanel(b, st, X) {
  const O = ui.aptOpen = ui.aptOpen || {}, A = S.av, M = IC.aptMonth(S, b), C = IC.aptChain(S, b);
  const mv = (b.mvLog || []).length, cal = S.mode === 'story';
  const keepH = b.parts.filter(p => p.built).reduce((s2, p) => s2 + IC.partCost(b, p), 0) * 0.0012, upk = keepH * Math.max(0, S.time - M.t0) / 3600;
  const earned = M.land + M.pax + M.cargo;
  const nums = `<div class="anums">
    <div title="Passengers through the terminal in the last hour, against what it can handle"><small>Passengers an hour</small><b>${Math.round(b.paxRate || 0).toLocaleString('en-US')}</b><em>${st.pax ? `of ${Math.round(st.pax).toLocaleString('en-US')} it can take` : 'no terminal yet'}</em></div>
    <div title="Landings and take-offs in the last hour, against what the runways take"><small>Movements an hour</small><b>${mv}</b><em>of ${st.movesPerHour || 0} the runways take</em></div>
    <div title="${esc(`What airlines paid here ${cal ? 'this month' : 'today'}: landings ${U.money(M.land)}, passengers ${U.money(M.pax)}${M.cargo ? `, cargo ${U.money(M.cargo)}` : ''}. Upkeep runs at ${U.money(keepH)} an hour.`)}"><small>${cal ? 'This month' : 'Today'}</small><b class="gold">${U.money(earned)}</b><em>${M.flights} flight${M.flights === 1 ? '' : 's'} paid · upkeep ${U.money(upk)}</em></div></div>`;
  const chain = `<div class="chainline"><span>${esc(C.text)}</span><button class="btn sm ${IC.chainOn ? 'primary' : ''}" data-act="chainTog" title="People from the towns by road, through the terminal, out on flights, and the money back, drawn on the map">${IC.chainOn ? 'Hide' : 'Show'} on the map</button></div>`;
  const P = IC.aptProblems(S, b).filter(p => p.kind !== 'offer');
  const probs = P.length || st.warn.length ? `<div class="sec"><h3 class="sh">Needs you <em>${P.length + st.warn.length}</em></h3>${P.map(p => `<div class="prow ${p.lvl}"><div><b>${esc(p.title)}</b><small>${esc(p.text)}</small></div>${p.fix ? `<button class="btn sm ${p.lvl === 'bad' ? 'primary' : ''}" data-act="pmFix" data-v="${esc(p.id)}">${esc(p.fix.label)}</button>` : ''}</div>`).join('')}
    ${st.warn.slice(0, O.warn ? 12 : 2).map(w => `<div class="warnrow">${esc(w)}</div>`).join('')}${st.warn.length > 2 ? `<button class="more" data-act="aptOpen" data-v="warn">${O.warn ? 'Fewer ▴' : `${st.warn.length - 2} more layout notes ▾`}</button>` : ''}</div>` : '<div class="now ok">Nothing needs you here now.</div>';
  // (problems, as markers have them, keyed for the click)
  ui.pmById = ui.pmById || new Map(); for (const p of IC.aptProblems(S, b)) ui.pmById.set(p.id, Object.assign(p, { ap: b.id }));
  const offers = A ? A.requests.filter(q => q.a === b.id || (q.b && q.b.apt === b.id)) : [];
  const risk = A ? A.deals.filter(d => d.st === 'active' && (d.a === b.id || d.b.apt === b.id)) : [];
  const deals = offers.length || risk.length ? `<div class="sec" id="aptDeals"><h3 class="sh">Airlines <em>${offers.length ? `${offers.length} offer${offers.length > 1 ? 's' : ''} · ` : ''}${risk.length} deal${risk.length === 1 ? '' : 's'} running</em></h3>
    ${offers.sort((p, q) => (q.id === ui.dealFocus) - (p.id === ui.dealFocus)).map(q => { const pr = ui.pmById.get('offer:' + q.id); return IC.dealCardHTML(S, q) + (pr && pr.fix && pr.fix.part ? `<div class="acts"><button class="act pri" data-act="pmFix" data-v="offer:${q.id}">${esc(pr.fix.label)} for it</button></div>` : ''); }).join('')}
    ${risk.length ? `<button class="more" data-act="aptOpen" data-v="deals">${O.deals ? 'Hide the deals running ▴' : `The ${risk.length} deal${risk.length > 1 ? 's' : ''} running ▾`}</button>${O.deals || risk.some(d => d.badT) ? `<div class="list">${risk.filter(d => O.deals || d.badT).map(d => IC.contractHTML(S, d)).join('')}</div>` : ''}` : ''}</div>` : '';
  const nw = b.works.length;
  const works = nw ? `<div class="sec"><h3 class="sh">Building <em>${nw} job${nw > 1 ? 's' : ''} · ${b.works.filter(w => !w.wait).length}/${b.crews} crews at work</em></h3>
    <div class="acts">${b.works.some(w => w.stages) ? `<button class="act pri" data-act="finishNow" data-v="${b.id}" title="Time runs on fast until every work here is finished; it stops for anything that needs you">⏩ Finish now</button>` : ''}<button class="act" data-act="aptOpen" data-v="works">${O.works ? 'Hide the jobs ▴' : 'The jobs ▾'}</button></div>
    ${O.works ? `<div class="list">${X.works}</div>` : ''}</div>` : '';
  const ex = (k, name) => `<button class="more" data-act="aptOpen" data-v="${k}">${O[k] ? '▴' : '▾'} ${name}</button>`;
  const day = A && !IC.storyLock(S, 'charges') ? `<div class="sec">${ex('day', 'The day: flights by hour, cap and night')}${O.day ? dayBoardHTML(b) : ''}</div>` : '';
  const more = `<div class="sec">${ex('more', 'Runways, stands and services')}${O.more ? `${X.schem}${X.kpis}${X.rwSec}${kv(X.rows)}${X.zoneSec}` : ''}
    ${X.fee ? ex('fee', 'Charges') + (O.fee ? X.fee : '') : ''}
    ${X.reps ? ex('reps', 'Damage to repair') + (O.reps ? `<div class="list">${X.reps}</div>` : '') : ''}
    <div class="acts"><button class="act" data-act="aptTab" data-v="rules" title="The tower's rules: when aircraft may go onto a runway">Tower rules</button>${S.asp && !IC.storyLock(S, 'airspace') ? '<button class="act" data-act="aptTab" data-v="asp" title="Controlled airspace round the airport">Airspace</button>' : ''}<button class="act" data-act="aptZoom">Zoom to it</button><button class="act pri" data-act="bbToggle" title="The build bar along the bottom of the screen (B)">Build (B)</button></div></div>`;
  const cards = A ? `${ex('score', 'Airline scorecards')}${O.score ? scorecardHTML(b) : ''}` : '';
  const gse = IC.FOCUS.gse && b.st && b.st.longest > 0 ? `<div class="sec">${ex('fleet', 'Ground vehicles')}${O.fleet ? fleetHTML(b) : ''}</div>` : '';
  return `<div class="ibody">${nums}${chain}${probs}${deals}${works}${day}${cards ? `<div class="sec">${cards}</div>` : ''}${gse}${more}</div>`;
}
/* ---------- the Airspace tab: the airport's shape, drawn from above like a chart; controllers and stacks ---------- */
const lvlT = a => a <= 0.01 ? 'the ground' : IC.flText(a);
const FLOORS = [...Array(21).keys()].map(i => i * 500);   // the ground to FL100 in 500 ft steps
const CEILS = [...Array(19).keys()].map(i => 1000 + i * 500).concat([11000, 12000, 13000, 14000, 15000, 18000, 19500]);
const chartTag = v => `<span class="chart"  style="color:rgb(${IC.ASP_CLS[v.cls].col})" title="Ceiling over floor, as on a chart"><b>${IC.aspChart(v.hi)}</b><b>${IC.aspChart(v.lo)}</b></span>`;
function airspaceTab(b, st) {
  const sh = S.asp && S.asp.shapes && IC.aspShapeOf(S, b);
  if (!sh) return '<p class="hint">The airspace is being set up.</p>';
  const P = b.asp || {}, cur = ui.aspVol, taught = IC.aspTaught(S), SH = IC.ASP_SHAPES[sh.key] || {};
  const btn = (op, v, label, o) => `<button class="act ${o && o.on ? 'on' : ''} ${o && o.warn ? 'warn' : ''}" data-act="asp" data-op="${op}" ${v != null ? `data-v="${v}"` : ''} ${o && o.id ? `data-id="${o.id}"` : ''} ${o && o.sh ? `data-sh="${o.sh}"` : ''} ${o && o.sec ? `data-sec="${o.sec}"` : ''} ${o && o.off ? 'disabled' : ''} title="${esc(o && o.t || '')}">${label}</button>`;
  // a short list to pick from: floors, ceilings, widths
  const pick = (op, val, list, o) => `<select class="aspsel" data-asel="1" data-ap="${b.id}" data-op="${op}" ${o && o.id ? `data-id="${o.id}"` : ''} ${o && o.sh ? `data-sh="${o.sh}"` : ''} title="${esc(o && o.t || '')}">${list.map(([k, label]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  const ftOf = a => Math.round(a * IC.FT / 100) * 100, hl = x => x ? IC.flText(x / IC.FT) : 'SFC';
  const heights = (L, cur2, f) => [...new Set(L.filter(f).concat([cur2]))].sort((p, q) => p - q).map(x => [x, hl(x)]);
  const line = (label, body) => `<div class="asprow"><span>${label}</span>${body}</div>`;
  const ringRow = v => {
    const C = IC.ASP_CLS[v.cls], on = cur === v.id, i = +String(v.id).split(':')[1], s2 = IC.aspShape(S, v.sh), lo = ftOf(v.lo), hi = ftOf(v.hi);
    if (v.kind === 'ext') return `<div class="li"><button class="lib ${on ? 'on' : ''}" data-act="asp" data-op="sel" data-id="${v.id}">${chartTag(v)}<b style="color:rgb(${C.col})">Approach extension · Class E</b><small>${Math.round(v.ext.len / 10)} km beyond the core, ${Math.round(v.ext.w / 5)} km wide · ${esc(lvlT(v.lo))} to ${esc(IC.flText(v.hi))}</small></button></div>${on ? `<p class="hint">${esc(IC.aspWords(v))}</p>` : ''}`;
    const floor = v.kind === 'ctr' ? '<b>SFC</b>' : pick('lo', lo, heights(FLOORS, lo, x => x < hi), { id: v.id, t: 'The floor: below it, light aircraft fly free' });
    const ceil = pick('hi', hi, heights(CEILS, hi, x => x > lo), { id: v.id, t: 'The ceiling' });
    const rad = s2.rings.length > 1 ? `${btn('r', -1, '−', { id: v.id, t: '5 km smaller' })}<b class="aspval">${Math.round(v.r1 / 10)} km</b>${btn('r', 1, '+', { id: v.id, t: '5 km larger' })}` : '';
    return `<div class="li"><button class="lib ${on ? 'on' : ''}" data-act="asp" data-op="sel" data-id="${v.id}">${chartTag(v)}<b style="color:rgb(${C.col})">${esc(v.kind === 'mil' ? v.name : `${v.name} · ${C.name}`)}</b><small>${v.r0 ? `${Math.round(v.r0 / 10)}–` : 'out to '}${Math.round(v.r1 / 10)} km · ${esc(lvlT(v.lo))} to ${esc(IC.flText(v.hi))}</small></button></div>
      ${line('Ceiling over floor', `${ceil}<b>/</b>${floor}`)}${rad ? line('Out to', rad) : ''}${on ? `<p class="hint">${esc(IC.aspWords(v))}</p>` : ''}`;
  };
  const V = IC.aspVols(S, b).sort((p, q) => (p.kind === 'ext') - (q.kind === 'ext') || p.r1 - q.r1);
  // the shape: the airport's size decides the default, and the game says when the next size up pays off
  const keys = b.kind === 'airbase' ? ['M', 'D'] : ['D', 'C', 'B'], sg = IC.aspSuggest(S, b);
  const shapes = `<div class="acts">${keys.map(k => btn('preset', k, `${esc(IC.ASP_SHAPES[k].name)}${sg && sg.ok && sg.key === k ? ' ↑' : ''}`, { on: sh.key === k, t: `${IC.ASP_SHAPES[k].what} ${IC.ASP_SHAPES[k].why}` })).join('')}</div>
    <p class="hint"><b>${esc(SH.what || '')}</b> ${esc(SH.why || '')}${P.mod ? ' You have reshaped it; pick a shape to start again from it.' : ''}</p>
    ${sg ? sg.ok ? `<div class="now ok">${esc(sg.text)} ${btn('preset', sg.key, `Grow to Class ${sg.key}`)}</div>` : `<p class="hint">${esc(sg.text)}</p>` : ''}`;
  const size = line('Size', `${btn('scale', -1, '−', { sh: sh.id, t: 'The whole shape 10% smaller' })}<b class="aspval">${Math.round(sh.rings[sh.rings.length - 1].r / 10)} km</b>${btn('scale', 1, '+', { sh: sh.id, t: 'The whole shape 10% larger' })}`);
  // light shaping: a notch and an approach extension
  const n = sh.notch, e = sh.ext, core = sh.rings[0];
  const nOpts = FLOORS.filter(x => x >= 500 && x < ftOf(core.hi)).map(x => [x, hl(x)]).concat([[65000, 'cut out']]), nVal = n && (ftOf(n.lo) >= ftOf(core.hi) ? 65000 : ftOf(n.lo));
  const notch = n ? `${line(`Notch <small>towards ${U.compass(sh.rot + n.a)}, from ${Math.round(n.r / 10)} km</small>`, `${pick('nlo', nVal, nOpts, { sh: sh.id, t: 'The floor inside the notch' })}${pick('nw', Math.round(n.w * 360 / Math.PI / 10) * 10, [20, 30, 40, 60, 90, 120].map(w => [w, `${w}° wide`]), { sh: sh.id })}${btn('notch', 'del', 'Remove', { sh: sh.id })}`)}
      <p class="hint">Drag the diamond on the map to turn the notch or move where it starts. Below its floor light aircraft pass without a clearance.</p>`
    : `${line('Notch', btn('notch', 'add', '+ Add a notch', { sh: sh.id, t: 'A slice where the floor is higher: room under it for a nearby field or a VFR corridor' }))}`;
  const ext = !sh.ap ? '' : e ? `${line(`Approach extension <small>${Math.round(e.len / 10)} km out</small>`, `${pick('ew', Math.round(e.w / 5), [2, 4, 6, 8].map(k => [k, `${k} km wide`]), { sh: sh.id })}${btn('align', null, 'Line up with the runway', { sh: sh.id })}${btn('ext', 'del', 'Remove', { sh: sh.id })}`)}
      <p class="hint">Drag a triangle on the map to lengthen or turn it.</p>`
    : line('Approach extension', btn('ext', 'add', '+ Add an extension', { sh: sh.id, t: 'Class E from the ground along the runway line, so arrivals stay in controlled airspace on a long final approach' }));
  const warn = IC.aspCheck(S, b);
  const secs = IC.aspSectors(S).filter(s => s.ap === b.id), acc = IC.aspSectorAt(S, b.x + IC.aspOuter(S, b) + 50, b.y, 5);
  const secRow = s => `<div class="li"><b>${esc(s.name)}</b><small>${s.staff} controller${s.staff === 1 ? '' : 's'} · ${Math.round(s.load * 10) / 10} of ${Math.round(s.cap)} flights' work now${s.peak > s.cap ? ` · <span class="amber">peak ${Math.round(s.peak)}</span>` : ''}</small><span class="la">${btn('staff', -1, '−', { sec: s.id, off: s.staff <= (s.kind === 'acc' ? 1 : 0) })}${btn('staff', 1, '+', { sec: s.id })}</span></div>
    ${s.kind === 'app' ? `<div class="acts">${btn('space', null, `Spacing: ${s.rules.space > 1 ? 'wide' : 'standard'}`, { sec: s.id, on: s.rules.space > 1, t: 'Wide spacing: arrivals and departures half as far apart again. Fewer conflicts, more holding.' })}${btn('depBelow', null, `Departures under arrivals: ${s.rules.depBelow ? 'yes' : 'no'}`, { sec: s.id, on: s.rules.depBelow, t: 'Departures are kept below the arrivals until they leave the terminal area, then climb in steps.' })}${btn('lanes', null, `Lanes: ${s.rules.lanes === false ? 'off' : 'standard'}`, { sec: s.id, on: s.rules.lanes !== false, t: 'Standard lanes: arrivals come in from their stack by a gate 15 km out on the runway line; departures fly the runway heading 15 km first. Off: everyone flies direct, shorter but across each other.' })}</div>
    <div class="acts"><span class="hint" style="align-self:center">Stack levels</span>${[4, 6, 8].map(k => btn('stack', k, k, { sec: s.id, on: s.rules.stack === k })).join('')}</div>` : ''}`;
  const staff = secs.reduce((a, s) => a + s.staff, 0);
  const stacks = IC.atcStacks(S, b).map(k => `<div class="li"><b>${esc(k.k)} stack</b><small>${k.lv.map((t, i) => `${esc(t.cs)} ${IC.flText(IC.atcStackLevel(i))}`).join(' · ')}</small></div>`).join('');
  const used = [...new Set(V.map(v => v.cls))].map(c => IC.ASP_CLS[c]);
  const areas = IC.aspShapesNear(S, b).filter(s => !s.ap);
  const areaRow = a => `${S.asp.vols.filter(v => v.sh === a.id).map(ringRow).join('')}${line('Size', `${btn('scale', -1, '−', { sh: a.id })}<b class="aspval">${Math.round(a.rings[0].r / 10)} km</b>${btn('scale', 1, '+', { sh: a.id })}${btn('adel', null, 'Withdraw', { sh: a.id, warn: 1 })}`)}`;
  return `<p class="hint">Airspace is drawn as on a chart, from above. Each ring shows its ceiling over its floor: hundreds of feet below 6,000 ft (40 over 12 is 1,200 to 4,000 ft), flight levels above. Its class says who needs a clearance and who controllers keep apart. On the map, drag the square to scale the shape and a dot to move one ring.</p>
    <div class="sec"><h3 class="sh">Shape <em>${esc(sh.name)}</em></h3>${shapes}${size}</div>
    ${taught && warn.length ? `<div class="sec"><h3 class="sh">Problems <em>${warn.length}</em></h3>${warn.map(w => `<div class="warnrow">${esc(w)}</div>`).join('')}</div>` : taught ? '<div class="now ok">Arrivals stay inside controlled airspace all the way down.</div>' : ''}
    <div class="sec"><h3 class="sh">Rings <em>ceiling over floor</em></h3><div class="list">${V.map(ringRow).join('')}</div></div>
    <div class="sec"><h3 class="sh">Shaping <em>light touches</em></h3>${notch}${ext}</div>
    <div class="sec"><h3 class="sh">Areas <em>by height band</em></h3>
      <div class="acts">${['R', 'T', 'X'].map(k => btn('area', k, `${esc(IC.ASP_SHAPES[k].name)}…`, { t: `${IC.ASP_SHAPES[k].what} ${IC.ASP_SHAPES[k].why}` })).join('')}</div>
      ${areas.length ? `<div class="list">${areas.map(areaRow).join('')}</div>` : '<p class="hint">None near here. Each closes only its height band, so an airway can pass over it.</p>'}</div>
    <div class="sec"><h3 class="sh">Controllers <em>${staff} here · ${U.money(staff * IC.ASP.ctlCost)} an hour</em></h3><div class="list">${secs.map(secRow).join('')}${acc ? secRow(acc) : ''}</div>
      <div class="acts">${btn('sector', null, 'Split the area: new sector…', { t: 'Area sectors share the country by whichever centre is nearest' })}</div>
      ${taught ? `<p class="hint">Radar: ${st.radar ? 'an approach radar sees aircraft here, with or without transponders' : used.some(c => c.radar) ? '<span class="amber">no approach radar: class B and C need one, or another radar that covers the area</span>' : 'none needed for this class'}. Under radar, controllers keep flights 1,000 ft or 5 NM apart; without it, 10 NM.</p>` : ''}</div>
    ${stacks ? `<div class="sec"><h3 class="sh">Holding now</h3><div class="list">${stacks}</div></div>` : ''}
    <div class="acts">${btn('side', null, 'Side view', { t: 'A slice through the airspace with the traffic in it, to look at' })}</div>
    <div class="sec"><h3 class="sh">The classes <em>strictest first</em></h3>${'ABCDEG'.split('').map(k => { const C = IC.ASP_CLS[k]; return `<p class="hint"${used.includes(C) ? '' : ' style="opacity:.6"'}><b style="color:rgb(${C.col})">${k}</b> ${esc(C.who)} ${esc(C.sep)} <i>${esc(C.rule)}</i></p>`; }).join('')}</div>`;
}
/* ---------- the Operations tab: the tower's rules for this airport ---------- */
/* the player edits a copy (ui.opsDraft) and sees what it would do to capacity before applying it */
const ENTER_SHORT = { hold: 'Hold short', luaw: 'Line up and wait', luawDay: 'By day' };
const draftOf = b => { const D = ui.opsDraft = ui.opsDraft || {}; if (!D[b.id] || D[b.id].base !== b.ops) D[b.id] = { base: b.ops, ops: IC.opsClone(IC.opsOf(b)) }; return D[b.id].ops; };
const sameOps = (a, c) => JSON.stringify([a.r, a.rw]) === JSON.stringify([c.r, c.rw]);
IC.opsAct = function (S2, b, ds) {
  const d = draftOf(b), op = ds.op, v = ds.v;
  if (op === 'preset') IC.opsPreset(d, v);
  else if (op === 'enter') { d.r.enter[ds.k] = v; d.preset = 'custom'; }
  else if (op === 'gap') { d.r.gap = +v; d.preset = 'custom'; }
  else if (op === 'cross') { d.r.cross = v; d.preset = 'custom'; }
  else if (op === 'inter') { d.r.inter = v; d.preset = 'custom'; }
  else if (op === 'rw') { if (v) d.rw[ds.k] = v; else delete d.rw[ds.k]; }
  else if (op === 'reset') ui.opsDraft[b.id] = null;
  else if (op === 'apply') {
    b.ops = IC.opsClone(d); ui.opsDraft[b.id] = null; IC.aptStats(S2, b);
    const P = IC.OPS_PRESETS[b.ops.preset];
    IC.log(S2, 'info', 'AIRPORT', `${b.name}: the tower now works to ${P ? `the ${P.name} rules` : 'your own rules'}: an arrival gap of ${b.ops.r.gap} km. ${b.st.depPerHour} departures and ${b.st.arrPerHour} arrivals an hour.`, b);
  }
};
function opsTab(b, st) {
  const cur = IC.opsOf(b), d = draftOf(b), changed = !sameOps(cur, d), R = d.r;
  const now = IC.opsCapacity(S, b, st, cur), next = changed ? IC.opsCapacity(S, b, st, d) : now;
  const num = (a, c) => a === c ? `<b>${a}</b>` : `<b>${a}</b> now, <b class="${c < a ? 'amber' : 'ok'}">${c}</b> with these rules`;
  const kp = b.kpi || {}, gaH = (b.gaLog || []).filter(t => S.time - t < 3600).length;
  const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id).length;
  const rwNames = st.rwy.filter(r => r.role !== 'spare');
  const queue = rwNames.map(r => { const k = r.grp; let n = 0, why = ''; for (const m of b.moves) if (m.kind === 'dep' && m.plan && !m.dead && (IC.aptGraph(b).grp[m.plan.rw.id] || m.plan.rw.id) === k && (m.holding || m.phase === 'hold' || m.phase === 'wait')) { n++; if (!why && m.holdWhy && m.holding !== 'queue') why = m.holdWhy; } return { r, n, why }; });
  const fig = `<div class="kpis">
    <div><small>Go-arounds, last hour</small><b class="${gaH ? 'amber' : ''}">${gaH}</b></div>
    <div><small>Go-arounds in all</small><b>${kp.ga || 0}</b></div>
    <div><small>Losses of separation</small><b class="${kp.lossSep ? 'hostile' : ''}">${kp.lossSep || 0}</b></div>
    <div><small>Avg delay</small><b class="${kp.wait > 600 ? 'amber' : ''}">${U.dur(kp.wait || 0)}</b></div>
    <div><small>Arrivals holding</small><b class="${hold ? 'amber' : ''}">${hold}</b></div>
    <div><small>Incursions</small><b class="${kp.inc ? 'amber' : ''}">${kp.inc || 0}</b></div></div>`;
  const qSec = queue.length ? `<div class="sec"><h3 class="sh">Waiting to depart</h3>${queue.map(q => `<div class="rwrow ${q.r.role}"><b>${esc(q.r.end)}</b><span>${q.n ? `${q.n} waiting${q.why ? ` · first: ${esc(q.why)}` : ''}` : 'no queue'}</span><em>${esc(IC.OPS_PRESETS[cur.rw[q.r.id]] ? IC.OPS_PRESETS[cur.rw[q.r.id]].name : '')}</em></div>`).join('')}</div>` : '';
  const effect = `<div class="now ${changed ? 'busy' : 'ok'}"><div>Departures an hour: ${num(now.dep, next.dep)}.<br>Arrivals an hour: ${num(now.arr, next.arr)}.${IC.opsNotes(S, b, st, d).map(t => `<br><span class="amber">${esc(t)}</span>`).join('')}</div></div>`;
  const presets = seg('ops', d.preset, Object.entries(IC.OPS_PRESETS).map(([k, P]) => [k, P.name, '', P.text]), true).replace(/data-act="ops"/g, 'data-act="ops" data-op="preset"');
  const pick = (op, cur2, opts, k) => seg('ops', cur2, opts).replace(/data-act="ops"/g, `data-act="ops" data-op="${op}"${k ? ` data-k="${k}"` : ''}`);
  const kinds = IC.OPS_KINDS.map(([k, name]) => `<div class="oprow"><b>${esc(name)}</b>${pick('enter', R.enter[k], Object.entries(IC.OPS_ENTER).map(([v, E]) => [v, ENTER_SHORT[v], '', `${name}, ${E.name.toLowerCase()}: ${E.text}`]), k)}</div>`).join('');
  const enterHelp = `<p class="hint"><b>Hold short</b>: ${esc(IC.OPS_ENTER.hold.text)} <b>Line up and wait</b>: ${esc(IC.OPS_ENTER.luaw.text)}Military scrambles always go first.</p>`;
  const gapSec = `${pick('gap', String(R.gap), IC.OPS_GAPS.map(g => [String(g), `${g} km`, g <= 4 ? 'amb' : '', `The next arrival must be at least ${g} km out when a departure starts its take-off run.`]))}
    <p class="hint">How far out the next arrival must be when a departure starts to roll, or an aircraft crosses. A shorter gap fits more departures between arrivals, and sends more arrivals around when a departure is slow to go.</p>`;
  const crossSec = `${pick('cross', R.cross, Object.entries(IC.OPS_CROSS).map(([v, C]) => [v, v === 'gap' ? 'Within the gap' : 'Twice the gap in the dark', '', C.text]))}<p class="hint">${esc(IC.OPS_CROSS[R.cross].text)}</p>`;
  const interSec = `${pick('inter', R.inter, Object.entries(IC.OPS_INTER).map(([v, I]) => [v, I.name, '', I.text]))}<p class="hint">${esc(IC.OPS_INTER[R.inter].text)}</p>`;
  const rwSec = rwNames.length > 1 ? `<div class="sec"><h3 class="sh">By runway <em>a runway can keep its own preset</em></h3>${rwNames.map(r => `<div class="oprow"><b>Runway ${esc(r.end)}</b>${pick('rw', d.rw[r.id] || '', [['', 'Airport rules', '', 'The rules above']].concat(Object.entries(IC.OPS_PRESETS).map(([k, P]) => [k, P.name, '', P.text])), r.id)}</div>`).join('')}</div>` : '';
  const acts = changed ? `<div class="acts"><button class="act pri" data-act="ops" data-op="apply">Apply these rules</button><button class="act" data-act="ops" data-op="reset">Keep the current rules</button></div>` : '';
  return `<div class="sec"><h3 class="sh">Tower rules <em>when aircraft may go onto a runway</em></h3>${presets}<p class="hint">${esc(IC.OPS_PRESETS[d.preset] ? IC.OPS_PRESETS[d.preset].text : 'Rules you have set yourself.')}</p>${effect}${acts}</div>
    <div class="sec"><h3 class="sh">Going onto the runway to depart</h3>${kinds}${enterHelp}</div>
    <div class="sec"><h3 class="sh">Arrival gap</h3>${gapSec}</div>
    <div class="sec"><h3 class="sh">Runway crossings</h3>${crossSec}</div>
    <div class="sec"><h3 class="sh">Intersection departures</h3>${interSec}</div>
    ${rwSec}${qSec}<div class="sec"><h3 class="sh">What the rules have cost</h3>${fig}</div>`;
}
/* the airport at work: services on the ground, hangars, and the landside that has grown round it */
function lifeRows(b) {
  const pv = IC.aptProvides(b), L = b.land, gm = (b.gmLog || []).filter(x => S.time - x.t < 3600), by = {};
  for (const x of gm) by[x.what] = (by[x.what] || 0) + 1;
  const inH = b.parts.filter(p => p.kind === 'hangar').reduce((a, p) => a + (p.inside || []).length, 0);
  const rows = [['Gates · remote · cargo stands', `${pv.gates} · ${pv.remote} (by bus) · ${pv.cargoStands}${pv.gates && !IC.aptTechOk(S, 'bridge') ? ' <span class="amber">· no jet bridges yet (research)</span>' : ''}`],
    ['On the ground, last hour', gm.length ? Object.entries(by).map(([k, n]) => `${n} ${k === 'push' ? 'pushbacks' : k === 'tow' ? 'tows' : k === 'fuel' ? 'stops to refuel' : k === 'de-icing' ? 'de-icings' : k}`).join(', ') : 'no pushbacks, tows or service stops'],
    ['Hangars', pv.hangar ? `${inH} of ${pv.hangar} places in use for maintenance` : '<span class="amber">none: airliners due for maintenance fly elsewhere</span>']];
  if (L) {
    const n = {}; for (const it of L.items) n[it.kind] = (n[it.kind] || 0) + 1;
    const what = Object.entries(n).map(([k, c]) => `${c} ${IC.LAND[k].name.toLowerCase()}${c > 1 && !/s$/.test(IC.LAND[k].name) ? 's' : ''}`).join(', ');
    rows.push(['Landside', `${L.road ? '' : '<span class="amber">no road reaches it</span> · '}${what || 'nothing yet: it grows with passengers'}${pv.parking ? ` · ${pv.parking.toLocaleString('en-US')} parking spaces` : ''}${L.earn ? ` · earns ${U.money(L.earn)} an hour` : ''}`]);
  }
  return rows;
}
/* an apron's stands: laid out along its back edge automatically, or placed by hand */
function apronStands(ap, p) {
  const by = {}; for (const s of p.stands || []) by[s.size] = (by[s.size] || 0) + 1;
  const gates = (p.stands || []).filter(s => s.contact).length, drive = (p.stands || []).filter(s => s.drive).length;
  const what = Object.entries(by).map(([k, n]) => `${n} ${IC.RAMP_SIZE[k]}`).join(', ') || 'none';
  // (next to a terminal but too far from its wall for a jet bridge: remote, with stairs, and the panel says so)
  const far = (p.stands || []).filter(s => s.noBridge).map(s => IC.standName(s));
  const farTxt = far.length ? ` · <span class="amber">${far.length > 1 ? `stands ${far.join(', ')} are` : `stand ${far[0]} is`} remote, with stairs: a jet bridge reaches ${Math.round(IC.BRIDGE_REACH.tunnel * 100)} m from a terminal wall in front of the nose, and ${far.length > 1 ? 'they are' : 'it is'} further</span>` : '';
  return [['Stands', `${what}${gates ? ` · ${gates} at gates` : ''}${drive ? ` · ${drive} drive-through` : ''}${farTxt}<div class="acts"><button class="act ${p.ramp ? '' : 'on'}" data-act="apl" data-op="stands" data-v="auto" title="Stands in a row along the back edge; the apron's depth decides their size">Laid out automatically</button><button class="act ${p.ramp ? 'on' : ''}" data-act="apl" data-op="stands" data-v="hand" title="Place, turn and remove stands yourself with the Stand tool">Placed by hand</button></div>`]];
}
/* one job for the engineers: its stage, money spent, and why it waits */
function workRow(b, w, i) {
  const st = w.stages && w.stages[Math.min(w.si, w.stages.length - 1)];
  const left = w.stages ? w.stages.slice(w.si).reduce((a, s, k) => a + s.dur * (k ? 1 : 1 - w.t / s.dur), 0) : (1 - w.prog) * w.dur;
  const what = st ? `${esc(st.name)} (${w.si + 1}/${w.stages.length}) · ${U.pct(w.prog)} · ${U.money(w.spent || 0)} of ${U.money(w.cost)}` : `${U.pct(w.prog)}`;
  const rw = w.near && b.parts.find(p => p.id === w.near);
  const when = rw ? `<button class="btn sm ${w.rwMode === 'night' ? 'on' : ''}" data-act="bwhen" data-id="${w.id}" title="Paving next to ${esc(rw.name)} closes it. Night work keeps it open by day but only runs 23:00–06:00.">${w.rwMode === 'night' ? 'Nights only' : 'Shuts rwy'}</button>` : '';
  // a job waiting for money says how long the treasury needs, and offers to wait for it
  const broke = w.stages && /money/.test(w.wait || ''), t = broke && IC.waitTargets(S).find(x => x.work === w.id);
  const wait = t && (S.mode === 'story' || S.mode === 'sandbox') ? `<button class="btn sm" data-act="wait" data-v="${esc(t.key)}" title="Time runs fast until there is enough to finish it, the month turns, or something needs you">Wait</button>` : '';
  return `<div class="li"><b>${esc(w.label)}</b><small>${what} · ${w.wait ? `<span class="amber">${esc(w.wait)}</span>` : `${U.dur(left)} left`}${t ? ` · ${esc(IC.waitText(S, t))}` : ''}</small><span class="la">${wait}${when}<button class="btn sm" data-act="bcancel" data-id="${w.id}" title="Cancel: money already spent is lost">✕</button></span></div>`;
}
/* the materials stockpile and where it comes from */
function yard(b) {
  if (!b.works.some(w => w.stages) && !(b.convoys || []).length) return '';
  const M = b.mat || {}, sp = b.supply || {}, n = (b.convoys || []).length;
  return `<p class="hint">Site stock: ${Object.entries(IC.MATS).map(([k, n2]) => `${n2} ${Math.floor(M[k] || 0)}`).join(' · ')} loads. ${sp.name ? `Lorries from ${esc(sp.name)}, ${U.km(sp.km * 10)} by road, about ${sp.rate} loads an hour.` : ''}${n ? ` ${n} convoy${n > 1 ? 's' : ''} on the way.` : ''}</p>`;
}
/* one part of an airport */
function apart(sel) {
  const p = sel.ref, ap = sel.ap, D = IC.APART[p.kind];
  const w = ap.works.find(x => x.part === p || (x.it && x.it.part === p));
  const rows = [];
  if (p.kind === 'runway') { const c = ap.cfg && ap.cfg.rw[p.id]; rows.push(['Length', U.km(IC.rwLen(p))], ['Usable', U.km(IC.rwUsable(p))], ['Craters', `${p.craters.length}`], ['In use', c ? `${esc(c.name)} · ${{ arr: 'arrivals', dep: 'departures', mixed: 'arrivals and departures', spare: 'not in use' }[c.role]} · crosswind ${Math.round(c.cross)} kt` : 'no'], ['Landing systems', p.ends ? [['a', 1], ['b', -1]].filter(([e, d]) => IC.rwHasILS(ap, p, d)).map(([e]) => p.ends[e]).join(', ') || 'none' : 'none']); }
  else if (p.kind === 'taxi') { rows.push(['Length', U.km(IC.partMeasure(ap, p))], ['Cut', `${Object.keys(p.cut).length} places`], ['Traffic', p.oneway ? 'one way' : p.flow ? 'both ways, one preferred' : 'both ways']); }
  else if (p.kind === 'apron') {
    rows.push(...apronStands(ap, p), ['Zone', IC.ZONES[IC.partZone(ap, p)].name], ['Area', `${(p.w * p.h).toFixed(1)} ha`]);
  }
  else if (p.kind === 'fuel') rows.push(['Stock', `${Math.round(p.stock || 0)}/${D.cap}`]);
  else if (p.kind === 'terminal') rows.push(['Capacity', `${Math.round(D.pax * p.w * p.h).toLocaleString('en-US')} passengers/h`]);
  if (IC.PAVED[p.kind]) { const P = IC.PAVE[IC.paveOf(p)]; rows.push(['Pavement', `${P.name}: carries ${P.t} t${p.wear ? ` · <span class="${p.wear >= 0.5 ? 'amber' : ''}">${U.pct(p.wear)} worn</span>` : ''}`]); }
  if (w && w.stages) rows.push(['Work', `${esc(w.stages[Math.min(w.si, w.stages.length - 1)].name)} · ${U.money(w.spent || 0)} of ${U.money(w.cost)} spent${w.wait ? ` · <span class="amber">${esc(w.wait)}</span>` : ''}`]);
  if (p.linked === false) rows.push(['Taxiway', '<span class="amber">not connected</span>']);
  if (p.burning > 0) rows.push(['Fire', '<span class="hostile">burning</span>']);
  const now = IC.partNow ? IC.partNow(S, ap, p) : '';
  if (now) rows.unshift(['Now', esc(now)]);
  const hp = p.hp / p.max;
  // (round 3) the part as the interface: what it is doing now, and what to do about it, from here
  const acts = ui.hands() && ap.kind === 'airport' && p.built ? partActs(ap, p) : '';
  return head(`<span class="badge friend">${ui.icon('part')}</span>`, p.kind === 'runway' && p.name ? p.name : D.name, esc(ap.name), !p.built ? `Building ${U.pct(p.prog || 0)}` : hp <= 0.25 ? 'Destroyed' : hp < 1 ? 'Damaged' : 'Intact', !p.built ? 'busy' : hp <= 0.25 ? 'bad' : hp < 1 ? 'busy' : 'ok') +
    `<div class="ibody">${acts}<div class="bars"><span>Condition</span>${bar(hp)}<span>${U.pct(hp)}</span></div>${kv(rows)}<p class="hint">${esc(D.desc)}</p>
    ${ui.hands() && !ui.partMore ? `<button class="more" data-act="partMore">▾ More options: pavement, zone, traffic, move</button>` : `${ui.hands() ? '<button class="more" data-act="partMore">▴ Fewer options</button>' : ''}${partControls(ap, p, w)}`}
    <div class="acts">${w ? `<span class="pill busy">${esc(w.label)} ${U.pct(w.prog)}</span>` : ''}<button class="act" data-act="aptBack">◂ ${esc(ap.name)}</button><button class="act warn" data-act="aptRemove">${p.built ? 'Bulldoze' : 'Cancel'}</button></div></div>`;
}
/* (round 3) a part's actions where it stands: each opens the piece that helps, already placed beside it */
const fixBtn = (part, at, label, pri) => `<button class="act ${pri ? 'pri' : ''}" data-act="fixAt" data-v="${part}" data-x="${at.x.toFixed(2)}" data-y="${at.y.toFixed(2)}">${esc(label)}</button>`;
function partActs(ap, p) {
  const st = ap.st || {}, L = [], say = [];
  if (p.kind === 'runway') {
    const ends = [['a', 1], ['b', -1]].filter(([e, d]) => !IC.rwHasILS(ap, p, d));
    for (const [e] of ends) L.push(fixBtn('ils', p[e], `Landing system at the ${p.ends ? p.ends[e] : e} end`, ends.length === 2));
    const t = (st.rescueRw || {})[p.id] || 0, mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
    say.push(!st.fire ? 'No fire station covers it: only turboprops may land.' : `Fire trucks reach its far end in ${IC.mmss(t)}${t > IC.FIRE_STD ? `: heavy jets need ${IC.mmss(IC.FIRE_STD)}` : ', in time for heavy jets'}.`);
    if (!st.fire || t > IC.FIRE_STD) L.push(fixBtn('fire', mid, 'Fire station nearer', true));
    if (st.fire) L.push(`<button class="act" data-act="fireDrill" title="The fire trucks race to the far end and the panel times them">Fire drill now</button>`);
    const mv = (ap.mvLog || []).length; say.unshift(`${mv} movement${mv === 1 ? '' : 's'} in the last hour; the runways take ${st.movesPerHour || 0}.`);
  } else if (p.kind === 'terminal') { L.push(fixBtn('tstraight', p, 'Add a terminal beside it', (ap.paxRate || 0) > (st.pax || 1) * 0.8)); }
  else if (p.kind === 'apron') L.push(fixBtn('tstraight', p, 'More stands: a terminal beside it'));
  else if (p.kind === 'fuel') L.push(fixBtn('fuel', p, 'Add a fuel tank beside it', IC.aptProblems(S, ap).some(x => x.kind === 'fuel')));
  else if (p.kind === 'fire') { const rw = ap.parts.find(q => q.kind === 'runway' && q.built); if (rw) L.push(`<button class="act pri" data-act="fireDrill" title="The fire trucks race to the far end of ${esc(rw.name || 'the runway')} and the panel times them">Fire drill now</button>`); }
  else if (p.kind === 'tower') L.push(`<button class="act" data-act="towerRules">Tower rules</button>`);
  else if (p.kind === 'hangar') L.push(fixBtn('hangar', p, 'Add a hangar beside it'));
  return say.length || L.length ? `<div class="sec">${say.map(t => `<p class="now">${esc(t)}</p>`).join('')}${L.length ? `<div class="acts">${L.join('')}</div>` : ''}</div>` : '';
}
/* what the player can change about one part: pavement, zone, one-way, position before work starts */
function partControls(ap, p, w) {
  const out = [];
  const fix = IC.aptRepairList(ap).filter(it => it.part === p && !ap.works.some(x => x.key === it.key));
  if (fix.length) out.push(`<h3 class="sh">Repairs</h3><div class="acts">${fix.slice(0, 3).map(it => `<button class="act" data-act="aptRepair" data-v="${it.key}" ${S.budget < it.cost ? 'disabled' : ''}>${esc(it.label)} · ${U.money(it.cost)}</button>`).join('')}</div>`);
  if (IC.PAVED[p.kind] && p.built && !w) out.push(`<h3 class="sh">Pavement <em>relaid in another material for the difference in price; closed meanwhile</em></h3><div class="seg two">${IC.PAVE_ORDER.map(k => { const q = Object.assign({}, p, { mat: k }); return `<button data-act="aptMat" data-v="${k}" aria-pressed="${k === IC.paveOf(p)}" title="${esc(IC.paveFits(k))}. ${esc(IC.PAVE[k].desc)}."><b>${IC.PAVE[k].name.replace('Reinforced concrete', 'Reinforced')}</b><small>${k === IC.paveOf(p) ? 'now' : '+' + U.money(Math.max(0, IC.partCost(ap, q) - IC.partCost(ap, p)))} · ${IC.PAVE[k].t} t</small></button>`; }).join('')}</div>`);
  if (p.kind === 'apron') out.push(`<h3 class="sh">Zone <em>who may park here</em></h3>${seg('aptZone', IC.partZone(ap, p), Object.entries(IC.ZONES).map(([k, z]) => [k, zoneWord(k), '', `${z.name} zone`]))}`);
  if (p.kind === 'taxi') out.push(`<h3 class="sh">Traffic <em>one-way lanes keep opposite traffic apart</em></h3><div class="acts"><button class="act ${p.oneway ? 'on' : ''}" data-act="aptDir">${p.oneway ? `One way (${p.oneway > 0 ? 'as drawn' : 'reversed'}): change` : 'Both ways: make one way'}</button></div>`);
  if (!p.built && IC.bldCanMove(ap, p)) out.push(`<div class="acts"><button class="act" data-act="aptMove">Move</button><button class="act" data-act="aptRot">Turn 15°</button><button class="act" data-act="aptRot" data-v="${Math.PI / 2}">Turn 90°</button></div>`);
  return out.length ? `<div class="sec">${out.join('')}</div>` : '';
}
function city(c) {
  const alive = c.blocks ? c.blocks.filter(b => b.hp > 0).length / Math.max(1, c.blocks.length) : 1;
  const plant = c.plant && S.byId[c.plant];
  const tax = c.pop * 0.02 * (c.hp / c.max) * c.prosp * (0.5 + c.morale / 200);
  const R = IC.cityReport(S, c);
  const gar = S.world.garrisons && S.world.garrisons.find(g => g.name === `${c.name} Garrison`);
  // growth: how it is doing, why, and what its air service and roads give it
  const P = (t, cls) => `<p class="hint ${cls || ''}" style="margin:.25rem 0">${t}</p>`;
  // what the city is, from its districts, and so what it wants from an airport
  const ch = IC.cityCharacter ? IC.cityCharacter(c) : null;
  const what = ch ? `<div class="sec"><p class="hint" style="margin:.25rem 0"><b>${esc(c.name)}: ${esc(ch.kind)}.</b> ${esc(ch.why)}</p><p class="hint" style="margin:.25rem 0">${esc(ch.parts.charAt(0).toUpperCase() + ch.parts.slice(1))}.</p></div>` : '';
  const growth = R ? `<div class="sec"><h3 class="sh">Growth</h3>${P(`<b>${esc(R.growth)}</b> ${esc(R.rate)}`)}
    ${P(`<b>Air service:</b> ${esc(R.air)} ${esc(R.demand)}`)}${P(`<b>Roads:</b> ${esc(R.roads)}`, R.cuts.length ? 'hostile' : '')}${R.cuts.map(t => P(esc(t), 'hostile')).join('')}
    ${R.inds.length ? P(`<b>Industry selling here:</b> ${R.inds.map(esc).join(' ')}`) : ''}
    <p class="hint">Cities grow with good air service (frequent flights to many places, few delays, fair fees within ${IC.GROWTH.catch[1]} h by road) and good roads. Growth raises taxes and passengers.</p></div>` : '';
  return head(`<span class="badge friend">${ui.icon('city')}</span>`, c.name, c.capital ? 'Capital' : 'City', c.alert > 0 ? 'Sirens' : 'Calm', false || c.alert > 0 ? 'bad' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Morale</span>${bar(c.morale / 100, 'var(--friend)')}<span>${Math.round(c.morale)}%</span><span>Buildings</span>${bar(alive)}<span>${U.pct(alive)}</span><span>Prosperity</span>${bar(Math.min(1, c.prosp), 'var(--supply)')}<span>${U.pct(c.prosp)}</span></div>
    ${kv([['Population', `${c.pop}k`], ['Industry', `${c.ind} pts`], ['Taxes', `${tax.toFixed(1)}/h${S.story && S.story.act < 3 ? ' (to the Treasury, not your budget yet)' : ''}`], ['Power', plant ? (plant.offline ? `<span class="hostile">blackout (${esc(plant.name)} down)</span>` : esc(plant.name)) : '–'], ['Casualties', `${c.casualties || 0}`], ['Garrison', gar ? esc(gar.name) : 'none']])}
    ${what}${growth}
    </div>`;
}
function factory(i) {
  const buy = IC.MUN_ORDER.filter(k => IC.canBuyMun(S, k)).map(k => { const c = IC.plantPrice(S, k, 8); return `<button class="act" data-act="buyStock" data-v="${k}:8" ${S.budget < c || i.offline ? 'disabled' : ''}>8 ${esc(IC.MUN[k].short)} · ${U.money(c)}</button>`; }).join('');
  const sent = S.jobs.filter(j => j.mode === 'rail' && j.from === i).map(j => `<span class="chip">${esc(IC.munWords(j.mun, j.qty))} → ${esc(j.to.name)} ${U.dur(IC.jobEta(S, j))}</span>`).join('');
  return head(`<span class="badge friend">${ui.icon('industry')}</span>`, i.name, 'Arms plant', i.offline ? 'Knocked out' : 'Working', i.offline ? 'bad' : 'ok') +
    `<div class="ibody"><div class="bars"><span>Integrity</span>${bar(i.hp / i.max)}<span>${U.pct(i.hp / i.max)}</span></div>
    ${sent ? `<div class="sec"><h3 class="sh">On the railway</h3><div class="chips">${sent}</div></div>` : ''}
    <div class="sec"><h3 class="sh">Buy for the depots</h3><div class="acts">${buy}</div></div>
    <p class="hint">Missiles bought here go by rail to the depot that needs them most. A damaged plant loads slower; when every plant is knocked out, stock is imported by air at a higher price.</p></div>`;
}
function infra(i) {
  const sub = { power: 'Power plant', bridge: `Bridge over the ${i.river || 'river'}` }[i.kind] || i.kind;
  const effect = i.kind === 'power' ? 'Every plant lost costs radars range, slows factories and blacks out the cities it serves.' : i.kind === 'bridge' ? 'When it falls, convoys detour to a ford: slower deliveries.' : '';
  return head(`<span class="badge friend">${ui.icon(i.kind === 'power' ? 'power' : 'bridge')}</span>`, i.name, sub, i.offline ? (i.kind === 'bridge' ? 'Destroyed' : 'Knocked out') : 'Working', i.offline ? 'bad' : 'ok') +
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
  for (const r of S.roster) if ((r.kind === 'ftr' || r.kind === 'ucav') && r.st === 'ready') { const why = IC.missionOk(S, r, 'strike'); opts.push(`<div class="li"><b>${esc(r.name)}</b><small>${why || 'Air strike · enemy fighters may intercept'}</small><span class="la">${why === 'Needs the strike loadout' ? `<button class="btn sm" data-act="loadout" data-rid="${r.id}" data-v="strike">Re-arm</button>` : `<button class="btn sm" data-act="airStrike" data-rid="${r.id}" data-k="${k}" data-id="${tg.id}" ${why ? 'disabled' : ''}>Strike</button>`}</span></div>`); }
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
  return head(`<span class="badge hostile">${ui.icon('target')}</span>`, s.name, `<span class="hostile">${esc(S.world.full[s.nat])}</span>`, s.destroyed ? 'Destroyed' : kn, s.destroyed ? 'ok' : 'bad') +
    `<div class="ibody"><div class="bars"><span>Intact</span>${bar(s.hp / s.max, 'var(--hostile)')}<span>${U.pct(s.hp / s.max)}</span></div>${inv ? kv([['Holdings', inv]]) : ''}${strikeList(s, 'site')}</div>`;
}
function tel(t) {
  return head(`<span class="badge hostile">${ui.icon('target')}</span>`, t.name, `Mobile launcher · seen ${U.dur(S.time - t.kt)} ago`, S.time - t.kt < 300 ? 'Fresh fix' : 'Stale fix', S.time - t.kt < 300 ? 'bad' : 'busy') +
    `<div class="ibody"><p class="hint">Launchers move soon after they fire. The older the sighting, the less likely a strike finds it.</p>${strikeList(t, 'tel')}</div>`;
}
function convoy(v) {
  const j = v.job;
  const st = { idle: 'Parked', load: 'Loading', toSource: 'Driving to pick up', toDest: 'Delivering', unload: 'Unloading', return: 'Going back' }[v.state];
  const rows = [];
  if (j) {
    rows.push(['Carrying', esc(IC.munWords(j.mun, j.qty))], ['From', esc(j.from.name)], ['To', esc(j.to.name)]);
    rows.push(['Arrives', `in about ${U.dur(IC.jobEta(S, j))}`]);
    if (j.kind === 'unit') rows.push(['Why', `${esc(j.to.name)} is short of ${esc(IC.munWords(j.mun))}`]);
    else if (j.kind === 'restock') rows.push(['Why', `${esc(j.to.name)} holds less than it needs for the units in its area`]);
    else if (j.kind === 'buy') rows.push(['Why', 'Stock bought for the depot, taken on from the airport']);
  } else if (v.state === 'return') rows.push(['Back at', `${esc(v.home.name)} in about ${U.dur(Math.max(0, v.eta - S.time))}`]);
  if (v.cut) rows.push(['Road', `<span class="amber">${esc(v.cut)}: a slow detour, +${U.dur(v.lost)}</span>`]);
  const lorries = { missile: 'missile transporters', rocket: 'rocket carriers', flat: 'flatbed lorries', empty: 'lorries' }[IC.cargoKind(j && j.loaded && j.mun)];
  return head(`<span class="badge supply">${ui.icon('logi')}</span>`, v.name, `${v.trucks} ${lorries} · ${v.contract ? 'supplier' : `based at ${esc(v.home.name)}`}`, st, j ? 'busy' : '') +
    `<div class="ibody">${rows.length ? kv(rows) : '<p class="hint">Parked at the depot, waiting for a job. Convoys are sent automatically, priority areas first.</p>'}<p class="hint">Its route is drawn on the map. The enemy watches roads near the border and strikes convoys it sees: a depot further back, or air defence along the road, keeps them alive.</p></div>`;
}
/* ---------- the air war: our aircraft, flights on the ground, intercepts, the air picture ---------- */
const STATE_WORDS = { out: 'En route', station: 'On station', engage: 'Engaging', rtb: 'Returning', vid: 'Identifying', escort: 'Escorting', refuel: 'Refuelling' };
const fatWords = f => f >= 0.95 ? '<span class="hostile">exhausted: must rest</span>' : f > IC.FATIGUE.tired ? `<span class="amber">tired (${U.pct(f)}): slower to start, shoot less well</span>` : f > 0.35 ? `fair (${U.pct(f)})` : `rested (${U.pct(f)})`;
function whoAttr(who) { return who.r && who.kind ? `data-aid="${who.id}"` : `data-rid="${who.id}"`; }
/* what an intercept would look like, and the button that commits it */
function planBox(who, t) {
  const P = IC.interceptPlan(S, who, t);
  const tn = t.grp ? `the raid of ${t.grp.n} led by TN ${t.tn}` : `TN ${t.tn}`;
  if (P.x == null) return `<div class="sec plan"><h3 class="sh">Intercept ${esc(tn)}</h3><div class="warnbox">${esc(P.why || 'No intercept possible.')}</div><div class="acts"><button class="act" data-act="air" data-op="cancel">Cancel</button></div></div>`;
  const rows = [
    ['Meets it', `in ${U.dur(P.T)}${P.delay > 30 ? ` <span class="muted">(${U.dur(P.delay)} of it on the ground)</span>` : ''} ${esc(IC.nearPlace(S, P.x, P.y))}`],
    ['Fuel after', P.fuelBack > 0 ? `${U.dur(P.fuelBack)} once home` : `<span class="hostile">not enough to come back</span>${S.air.some(k => k.kind === 'tkr' && k.state === 'station') ? ' · a tanker is up' : ''}`],
    ['Weapons', `${P.aam} radar missiles, ${P.srm} heat-seeking · reach ${esc(P.reachWords)}`],
    ['Kill chance', P.idFirst ? '<span class="unknown">identify first: nobody fires at it until a pilot has seen it</span>' : `${U.pct(P.pk)} a target with two missiles${P.n > 1 ? ` · ${P.enough ? `enough for all ${P.n}` : `<span class="amber">missiles for ${Math.floor((P.aam + P.srm) / 2)} of ${P.n}</span>`}` : ''}${P.weapons === 'hold' ? ' · <span class="amber">weapons on Hold: it will only escort</span>' : ''}`]
  ];
  if (P.late) rows.push(['Too late', `<span class="amber">it reaches ${esc(P.late)} first</span>`]);
  return `<div class="sec plan"><h3 class="sh">Intercept ${esc(tn)} <em>drawn on the map</em></h3>${kv(rows)}<div class="acts"><button class="act pri" data-act="air" data-op="go" ${P.ok ? '' : 'disabled'}>${kbd('Enter')}Commit</button><button class="act" data-act="air" data-op="cancel">Cancel</button></div><p class="hint">${P.ok ? 'Right-clicking the track commits at once. Click the track again to select it instead.' : esc(P.why)}</p></div>`;
}
function air(a) {
  const K = IC.AIR_KIND[a.kind] || { name: 'Allied cargo aircraft', short: 'CGO' };
  const m = a.mission || {};
  const mission = { cap: 'Combat air patrol', intercept: `Intercept TN ${m.track ? m.track.tn : '?'}`, strike: 'Strike', orbit: 'Early warning', isr: 'Reconnaissance', supply: 'Resupply', hold: 'Holding', escort: `Escort for ${m.who ? esc(m.who.name) : '?'}`, tanker: 'Tanker track' }[m.type] || (a.allied ? 'Airlift' : '—');
  const rows = [['Mission', mission + (a.task ? ' (standing task)' : '')]];
  if (!a.allied) {
    const base = a.r && IC.baseOf(S, a.r.base), K2 = IC.AIR_KIND[a.kind];
    const home = base ? U.dist(a, base) / K2.spd * 1.25 + 300 : 0;
    rows.push(['Fuel', `${U.dur(Math.max(0, a.fuel))}${base && a.state !== 'rtb' ? ` · must turn home in ${U.dur(Math.max(0, a.fuel - home))}` : ''}`], ['Aircraft', `${a.hp}/${a.n}${a.dmg ? ` · <span class="amber">${a.dmg} damaged</span>` : ''}`]);
    if (a.r && a.kind !== 'isr' && a.kind !== 'ucav') rows.push(['Crews', fatWords(a.r.fat || 0)]);
  }
  if (a.r && a.r.rec && (a.r.rec.fired || a.r.rec.kills || a.r.rec.defeated)) rows.push(['Record', `${a.r.rec.kills} shot down · ${a.r.rec.fired} missiles fired · ${a.r.rec.defeated} enemy missiles defeated`]);
  if (a.mslIn && !a.mslIn.dead) rows.push(['Warning', `<span class="hostile">Missile inbound, ${IC.mmss ? IC.mmss(a.mslIn.tti) : Math.round(a.mslIn.tti) + ' s'} to impact${a.def ? ' · ' + (IC.DEF_WORDS[a.def] || '').toLowerCase() : ''}</span>`]);
  if (a.kind === 'ftr') rows.push(['Missiles', `${a.aam} radar · ${a.srm || 0} heat-seeking${a.gbu ? ' · ' + a.gbu + ' bombs' : ''} · radar missiles reach ${U.km(IC.aamReach('mrm', a.alt, { alt: a.alt }, null))} at its height`]);
  if (a.kind === 'tkr') rows.push(['Fuel to give', `${U.dur(a.give || 0)} of fighter flying`]);
  if (a.kind === 'aew') rows.push(['Low cover', `${U.km(IC.aewLowR(a))} against cruise missiles, over hills and across the border`]);
  rows.push(['Chaff / flares', a.cm]);
  if (a.job) rows.push(['Cargo', esc(IC.jobLabel(a.job))]);
  const plan = S.icpt && S.icpt.who === a && S.icpt.t && !S.icpt.t.dead ? planBox(a, S.icpt.t) : '';
  const acts = a.r && !a.job ? `<div class="acts">${a.state !== 'rtb' ? `<button class="act" data-act="recallSel">Return to base</button>` : ''}${a.state !== 'rtb' && m.type !== 'hold' ? `<button class="act" data-act="air" data-op="hold">Hold here</button>` : ''}</div>` : '';
  const esc2 = (a.kind === 'heli' || a.kind === 'cargo' || a.kind === 'aew' || a.kind === 'tkr') && !a.allied && !S.air.some(f => f.mission && f.mission.who === a) ? `<div class="acts"><button class="act" data-act="air" data-op="escort" data-aid="${a.id}" ${IC.escortFor(S, a) ? '' : 'disabled'}>Send a fighter escort</button></div>` : '';
  const roe = a.kind === 'ftr' && a.r ? `<div class="sec"><h3 class="sh">Weapons</h3>${seg('froe', a.r.roe || 'auto', [['auto', `National (${S.ad.roe})`], ['free', 'Free'], ['tight', 'Tight'], ['hold', 'Hold', 'red']])}</div>` : '';
  const hint = a.kind === 'ftr' ? 'Click a track to see an intercept (Tab picks the next hostile). Right-click the map to patrol there, one of our aircraft to escort it, an enemy target to strike.' : 'Right-click the map to move its station.';
  return head(`<span class="badge friend">${ui.icon('air')}</span>`, a.name, esc(K.name), a.gnd ? 'Taxiing' : STATE_WORDS[a.state] || a.state, a.state === 'rtb' ? '' : 'ok') +
    `<div class="ibody">${plan}${kv(rows)}${roe}${acts}${esc2}${liveBtn(a) ? `<div class="acts">${liveBtn(a)}</div>` : ''}<p class="hint">${hint}</p></div>`;
}
/* a flight on the ground: its alert state, its crews, what it is missing */
function flight(r) {
  const K = IC.AIR_KIND[r.kind], b = IC.baseOf(S, r.base);
  const st = r.st === 'ready' ? 'Ready' : r.st === 'turn' ? `Rearming ${U.dur(r.t)}` : r.st === 'lost' ? 'Lost' : r.ent && r.ent.gnd ? 'Taxiing' : 'Airborne';
  const rows = [['Aircraft', `${r.n} of ${r.nMax || K.n}${r.back && r.back.length ? ` · ${esc(IC.flightBackText(S, r))}` : ''}`]];
  if (r.kind !== 'isr' && r.kind !== 'ucav') rows.push(['Crews', fatWords(r.fat || 0)]);
  if (r.kind === 'ftr') { const L = IC.LOADOUTS[r.load || 'aa']; rows.push(['Loadout', `${esc(L.name)}: ${esc(L.desc)}`]); }
  if (r.st === 'ready' || r.st === 'turn') rows.push(['Airborne in', `about ${U.dur(IC.launchDelay(S, r))} from an order`]);
  const why = r.st === 'ready' ? IC.missionOk(S, r, 'cap') : '';
  if (why) rows.push(['Cannot launch', `<span class="hostile">${esc(why)}</span>`]);
  const alert = r.kind === 'ftr' ? `<div class="sec"><h3 class="sh">Alert <em>how fast it gets airborne</em></h3><div class="seg">${[5, 15, 30].map(v => `<button data-act="air" data-op="alert" data-rid="${r.id}" data-v="${v}" aria-pressed="${IC.alertOf(r) === v}" title="${esc(IC.ALERT[v].desc)}">${IC.ALERT[v].name}</button>`).join('')}</div><p class="hint">${esc(IC.ALERT[IC.alertOf(r)].desc)}</p></div>` : '';
  const plan = S.icpt && S.icpt.who === r && S.icpt.t && !S.icpt.t.dead ? planBox(r, S.icpt.t) : '';
  const acts = r.st === 'ready' && r.kind === 'ftr' ? `<div class="acts"><button class="act" data-act="airMode" data-rid="${r.id}" data-v="cap" ${why ? 'disabled' : ''}>Patrol a point</button><button class="act" data-act="airMode" data-rid="${r.id}" data-v="strike" ${IC.missionOk(S, r, 'strike') ? 'disabled' : ''}>Strike</button></div>` : '';
  return head(`<span class="badge friend">${ui.icon('air')}</span>`, r.name, `${esc(K.name)} · ${esc(b ? b.name : '?')}`, st, r.st === 'ready' ? 'ok' : r.st === 'lost' ? 'bad' : 'busy') +
    `<div class="ibody">${plan}${kv(rows)}${alert}${acts}${r.kind === 'ftr' ? '<p class="hint">Click a track on the map, or a row of the air picture, to see an intercept by this flight.</p>' : ''}</div>`;
}
/* the fighters that could take a track, quickest first */
function fighterOptions(t) {
  const who = S.air.filter(a => a.kind === 'ftr' && a.r && !a.dead && a.state !== 'rtb' && (a.aam > 0 || a.srm > 0))
    .concat(S.roster.filter(r => r.kind === 'ftr' && (r.st === 'ready' || r.st === 'turn') && !r.ent));
  const L = who.map(w => ({ w, P: IC.interceptPlan(S, w, t) })).filter(o => o.P.x != null).sort((a, b) => a.P.T - b.P.T).slice(0, 4);
  if (!L.length) return '';
  return `<div class="sec"><h3 class="sh">Fighters <em>quickest first</em></h3><div class="list">${L.map(({ w, P }) => {
    const on = w.mission && w.mission.track === t;
    return `<div class="li"><b>${esc(w.name)}</b><small>${w.r && w.kind ? (w.gnd ? 'taxiing' : (STATE_WORDS[w.state] || 'Airborne').toLowerCase()) : w.st === 'turn' ? 'rearming' : `on ${IC.ALERT[IC.alertOf(w)].name} alert`} · meets it in ${U.dur(P.T)} · fuel after ${P.fuelBack > 0 ? U.dur(P.fuelBack) : '<span class="hostile">none</span>'}${P.idFirst ? '' : ` · kill ${U.pct(P.pk)}`}</small><span class="la">${on ? '<span class="pill ok">On it</span>' : `<button class="btn sm" data-act="air" data-op="plan" ${whoAttr(w)} data-id="${t.id}">Show</button><button class="btn sm primary" data-act="air" data-op="commit" ${whoAttr(w)} data-id="${t.id}" ${P.ok ? '' : 'disabled'}>Commit</button>`}</span></div>`;
  }).join('')}</div></div>`;
}
/* ---------- the air picture: everything not known friendly, most dangerous first ---------- */
IC.renderAirPicture = function (S2) {
  S = S2;
  const el = $('airpic');
  if (!el) return;
  const rows = S.mode === 'range' ? [] : IC.airPicture(S);
  if (!rows.length) { ui.setHTML(el, ''); el.classList.remove('glass'); return; }
  el.classList.add('glass');
  const sel = S.sel && S.sel.kind === 'track' ? S.sel.ref : null;
  const hot = rows.filter(r => r.aff === 'H').length;
  const item = r => {
    const t = r.t, on = sel && (sel === t || (r.g && sel.grp === r.g));
    const what = r.aff === 'H' ? (IC.KLASS[t.klass] || t.d.name) : r.aff === 'S' ? 'Suspect' : 'Unknown';
    const when = isFinite(r.tti) && r.tti < 36000 ? `${U.dur(r.tti)} to ${esc(r.to)}` : t.border ? 'patrolling the border' : r.inside ? 'over our territory' : 'outside the border';
    const ours = S.air.filter(a => a.mission && a.mission.track && (a.mission.track === t || (r.g && a.mission.track.grp === r.g))).map(a => a.name);
    return `<button class="aprow ${r.aff}${on ? ' on' : ''}" data-act="air" data-op="pick" data-id="${t.id}" title="Select it${r.g ? ' (the whole raid)' : ''}"><i></i><b>TN ${t.tn}${r.n > 1 ? ` ×${r.n}` : ''}</b><span>${esc(what)}${t.det ? '' : ' · <em>no contact</em>'}</span><small>${when}${ours.length ? ` · <span class="friend">${esc(ours.join(', '))}</span>` : ''}</small></button>`;
  };
  const n = ui.apMin ? 0 : 7;
  ui.setHTML(el, `<h3 data-act="air" data-op="apMin" title="Collapse or expand">Air picture<em>${hot ? `${hot} hostile · ` : ''}${rows.length} track${rows.length > 1 ? 's' : ''} · Tab</em></h3>${rows.slice(0, n).map(item).join('')}${!ui.apMin && rows.length > n ? `<p class="hint">and ${rows.length - n} more</p>` : ''}`);
};
/* clicking a track with fighters selected sets up an intercept instead of selecting it */
IC.airClick = function (S2, hit) {
  const s = S2.sel;
  if (!s || !hit || hit.kind !== 'track') { S2.icpt = null; return false; }
  const who = s.kind === 'air' && s.ref.kind === 'ftr' && s.ref.r && !s.ref.job ? s.ref : s.kind === 'flight' && s.ref.kind === 'ftr' ? s.ref : null;
  if (!who) return false;
  if (S2.icpt && S2.icpt.who === who && S2.icpt.t === hit.ref) { S2.icpt = null; return false; }
  S2.icpt = { who, t: hit.ref };
  return true;
};
/* the fighter best placed to escort one of our aircraft */
IC.escortFor = function (S2, a) {
  const air = S2.air.filter(f => f.kind === 'ftr' && f.r && !f.dead && !f.gnd && f.state !== 'rtb' && f.state !== 'engage' && (!f.mission || f.mission.type !== 'intercept') && (f.aam > 0 || f.srm > 0)).sort((p, q) => U.dist(p, a) - U.dist(q, a))[0];
  if (air) return air;
  return S2.roster.filter(r => r.kind === 'ftr' && r.st === 'ready' && !IC.missionOk(S2, r, 'cap')).sort((p, q) => U.dist(IC.baseOf(S2, p.base), a) - U.dist(IC.baseOf(S2, q.base), a))[0] || null;
};
const whoOf = (S2, ds) => ds.aid ? S2.air.find(x => x.id === ds.aid) : ds.rid ? S2.roster.find(x => x.id === ds.rid) : null;
IC.airAct = function (S2, ds) {
  const op = ds.op, t = ds.id ? S2.threats.find(x => x.id === ds.id) : null, sel = S2.sel && S2.sel.ref;
  if (op === 'pick' && t) { ui.jump(t, 'track'); return; }
  if (op === 'apMin') { ui.apMin = !ui.apMin; return; }
  if (op === 'plan' && t) { const w = whoOf(S2, ds); if (w) { S2.icpt = { who: w, t }; IC.select(w.r && w.kind ? { kind: 'air', ref: w } : { kind: 'flight', ref: w }); } return; }
  if (op === 'commit' && t) { const w = whoOf(S2, ds); if (w) IC.commitIntercept(S2, w, t); return; }
  if (op === 'go' && S2.icpt) {
    const x = IC.commitIntercept(S2, S2.icpt.who, S2.icpt.t);
    S2.icpt = null;
    if (x && !x.gnd) IC.select({ kind: 'air', ref: x });
    return;
  }
  if (op === 'cancel') { S2.icpt = null; return; }
  if (op === 'hold' && S2.sel && S2.sel.kind === 'air') { IC.holdAir(S2, sel); return; }
  if (op === 'alert') { const r = whoOf(S2, ds); if (r) IC.setAlert(S2, r, +ds.v); return; }
  if (op === 'escort') {
    const a = S2.air.find(x => x.id === ds.aid), f = a && IC.escortFor(S2, a);
    if (!f) return;
    if (f.r && f.kind) IC.escortAir(S2, f, a); else IC.launchAir(S2, f, { type: 'escort', who: a });
  }
};

function group() {
  const g = S.group;
  const types = {}; for (const u of g) { const k = u.d.short; types[k] = (types[k] || 0) + 1; }
  const acts = [`<button class="act" data-act="emconAll" data-v="on">Radiate</button>`, `<button class="act" data-act="emconAll" data-v="ambush">Ambush</button>`, `<button class="act" data-act="emconAll" data-v="off">Silent</button>`, `<button class="act warn" data-act="reserve">${kbd('X')}To reserve</button>`];
  return head(`<span class="badge friend">${ui.icon('group')}</span>`, `Group of ${g.length}`, Object.entries(types).map(([k, n]) => `${n}× ${k}`).join(' · ')) + `<div class="ibody"><div class="acts">${acts.join('')}</div><p class="hint">Right-click to move the group. Esc to clear.</p></div>`;
}

})(window.IC);
