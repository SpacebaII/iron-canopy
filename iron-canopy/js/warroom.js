/* Iron Canopy — war rooms: full-screen views for the things that do not fit on the map. The game keeps running
   underneath unless the player asks it to pause. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const ui = IC.ui, esc = U.esc, bar = ui.bar;
let S = null;
const seg = (act, cur, opts, id) => `<div class="seg">${opts.map(([v, n, c, t]) => `<button class="${c || ''}" data-act="${act}" data-v="${v}" ${id ? `data-id="${id}"` : ''} aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

IC.renderRoom = function (st, tab) {
  S = st;
  const btn = ([k, n, key]) => `<button data-act="room" data-v="${k}" aria-pressed="${tab === k}" title="${esc(ui.ROOM_INFO[k] || '')}">${n}${ui.fresh.has('room:' + k) ? '<span class="dot new"></span>' : ''}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  ui.setHTML($('wrTabs'), ui.ROOMS.filter(([k]) => ui.roomOk(k)).map(btn).join('') + '<span class="sep"></span>' + ui.EXTRA.map(btn).join(''));
  $('wrRun').textContent = S.paused ? 'Paused · Space resumes' : `Running at ${S.skip ? 'skip' : S.speed + '×'} · Space pauses`;
  const f = { aviation, staff, economy, air, logi, intel, research, journal, reference, settings }[tab];
  // a room with pages keeps each page's scroll apart
  const key = tab + (ui.sub[tab] ? ':' + ui.sub[tab] : '');
  const fresh = ui.keys.wrBody !== key;
  ui.setHTML($('wrBody'), f ? f() : '', key);
  if (fresh) $('wrBody').scrollTop = ui.roomScroll[key] || 0;
  if (tab === 'research') treeLinks();
};
/* the pages of a long room, as tabs across the top */
const pages = (room, opts) => {
  if (!opts.some(o => o[0] === ui.sub[room])) ui.sub[room] = opts[0][0];
  return `<nav class="pages" role="tablist">${opts.map(([v, n, badge, t]) => `<button data-act="sub" data-id="${room}" data-v="${v}" aria-pressed="${ui.sub[room] === v}" title="${esc(t || '')}">${n}${badge ? `<em>${badge}</em>` : ''}</button>`).join('')}</nav>`;
};

/* ---------- civil aviation ---------- */
const satCol = v => v > 65 ? 'var(--ok)' : v > 40 ? 'var(--amber)' : 'var(--hostile)';
function aviation() {
  const A = S.av;
  const end = e => esc(IC.avEnd(S, e).name.replace(/ (International|Airport)$/, ''));
  const reqs = A.requests.map(q => {
    const al = IC.avAirline(S, q.al), why = IC.avReqBlock(S, q);
    return `<div class="li req"><b>${esc(al.name)} <span class="muted">· ${esc(al.K.style)}</span></b><small>${esc(q.why)} · ${q.n}× ${esc(IC.ACTYPES[q.type].name.toLowerCase())} · worth about ${U.money(q.value)}/day${why ? ` · <span class="hostile">${esc(why)}</span>` : ''} · decide within ${U.dur(Math.max(0, q.exp - S.time))}</small><span class="la"><button class="btn sm primary" data-act="avYes" data-id="${q.id}" ${why ? 'disabled' : ''}>Approve</button><button class="btn sm" data-act="avNo" data-id="${q.id}">Decline</button></span></div>`;
  }).join('');
  const als = A.airlines.map(al => {
    const rs = A.routes.filter(r => r.al === al.id && r.st === 'active');
    const n = A.tails.filter(t => t.al === al.id && t.where !== 'lost').length;
    return `<div class="li"><b><i class="livery" style="background:linear-gradient(90deg,${al.livery[0]} 50%,${al.livery[1]} 50%)"></i>${esc(al.name)} <span class="muted">· ${esc(al.K.style)}</span></b><small>${n} aircraft · ${rs.length} routes · ${esc(al.K.likes)}</small><div class="bars"><span>Satisfaction</span>${bar(al.sat / 100, satCol(al.sat))}<span>${Math.round(al.sat)}%</span></div><small class="${al.sat < 40 ? 'hostile' : 'muted'}">Last: ${esc(al.lastWhy || '—')}</small></div>`;
  }).join('');
  const routes = A.routes.filter(r => r.st === 'active' && r.n > 0).sort((a, b) => b.rev - a.rev).map(r => { const al = IC.avAirline(S, r.al); return `<tr class="click" data-act="routeFly" data-id="${r.id}"><td><i class="livery" style="background:linear-gradient(90deg,${al.livery[0]} 50%,${al.livery[1]} 50%)"></i>${esc(al.name)}</td><td>${esc(IC.avRouteName(S, r))}</td><td>${esc(IC.ACTYPES[r.type].short)}×${r.n}</td><td class="r">${r.flown}</td><td class="r">${U.money(r.rev)}</td></tr>`; }).join('');
  const L = A.rate, tot = IC.avRevenueRate(S);
  const apts = S.infra.filter(i => i.kind === 'airport').map(ap => {
    const st = ap.st || {}, kp = ap.kpi || {};
    const stands = IC.aptStands(ap);
    return `<tr class="click" data-act="selInfra" data-id="${ap.id}"><td>${esc(ap.name)}</td><td class="r">${Math.round(ap.paxRate || 0).toLocaleString('en-US')}</td><td class="r">${stands.filter(s => s.occ).length}/${stands.length}</td><td class="r ${kp.taxi > 600 ? 'amber' : ''}">${U.dur(kp.taxi || 0)}</td><td class="r ${kp.wait > 600 ? 'amber' : ''}">${U.dur(kp.wait || 0)}</td><td class="r ${kp.div ? 'hostile' : ''}">${kp.div || 0}</td><td class="r ${(st.warn || []).length ? 'amber' : ''}">${(st.warn || []).length}</td></tr>`;
  }).join('');
  const zones = A.zones.map(z => `<div class="li"><b>${esc(z.name)}</b><small>${U.km(z.r)} radius</small><span class="la"><button class="btn sm" data-act="zoneDel" data-id="${z.id}">Remove</button></span></div>`).join('');
  const det = IC.avDetour(S);
  const nw = apts ? S.infra.filter(i => i.kind === 'airport' && (i.st && i.st.warn || []).length).length : 0;
  const top = pages('aviation', [['airlines', 'Airlines', A.requests.length ? `${A.requests.length} asking` : '', 'Route requests, the airlines and what they pay'], ['airports', 'Airports and routes', nw ? `${nw} with problems` : '', 'Every airport, and every route flown'], ['airspace', 'Airspace', '', 'Airways, radar cover, prohibited zones and light aircraft']]);
  if (ui.sub.aviation === 'airports') return top + `<div class="card wide"><h3>Airports<em>click one to open it</em></h3><table class="t"><tr><th>Airport</th><th class="r">Pax/h</th><th class="r">Stands</th><th class="r">Taxi</th><th class="r">Delay</th><th class="r">Diversions</th><th class="r">Problems</th></tr>${apts}</table><div class="acts"><button class="btn" data-act="foundMode">+ Found a new airport · ${U.money(IC.FOUND_COST)}</button></div></div>
    <div class="card wide"><h3>Routes<em>${A.routes.filter(r => r.st === 'active').length} active · click one to see its airport</em></h3><table class="t"><tr><th>Airline</th><th>Route</th><th>Aircraft</th><th class="r">Flights</th><th class="r">Revenue</th></tr>${routes}</table></div>`;
  if (ui.sub.aviation === 'airspace') return top + `<div class="card"><h3>Prohibited zones<em>routes are ${U.pct(det - 1)} longer</em></h3>${zones ? `<div class="list">${zones}</div>` : '<p class="hint">None. Airliners fly straight over everything, including our bases.</p>'}<div class="acts"><button class="btn" data-act="zoneMode">+ Draw a prohibited zone</button></div><p class="hint">Airliners route around zones: they cannot overfly what matters, and anything squawking as an airliner that enters one is off its route at once. Airlines dislike the detours.</p></div>
    ${airspace()}`;
  return top + `<div class="card wide"><h3>Route requests<em>${A.requests.length} waiting</em></h3>${reqs ? `<div class="list">${reqs}</div>` : '<p class="hint">No requests. Happy airlines ask for more; airlines ask faster when they are happy and the airports can take their aircraft.</p>'}${S.story && S.story.del.routes ? '<p class="hint">The Route Planning Office approves feasible requests for you.</p>' : ''}</div>
    <div class="card"><h3>Airlines<em>average ${Math.round(IC.avgSat(S))}%</em></h3><div class="list">${als}</div></div>
    <div class="card"><h3>Revenue per hour<em>${U.money(tot)}/h</em></h3><table class="t"><tr><td>Landing fees</td><td class="r ok">+${L.land.toFixed(1)}</td></tr><tr><td>Passenger charges</td><td class="r ok">+${L.pax.toFixed(1)}</td></tr><tr><td>Cargo</td><td class="r ok">+${L.cargo.toFixed(1)}</td></tr><tr><td>Overflights</td><td class="r ok">+${L.over.toFixed(1)}</td></tr><tr><td>Airport upkeep</td><td class="r hostile">−${IC.avUpkeep(S).toFixed(1)}</td></tr></table>
      ${kv([['Passengers today', Math.round(A.day.pax).toLocaleString('en-US')], ['Flights today', A.day.flights], ['Diversions today', A.day.div]])}</div>`;
}
/* the airspace: radar cover, airways, separation, light aircraft */
function airspace() {
  const N = S.asp; if (!N) return '';
  const lo = IC.aspCovShare(S, 1), hi = IC.aspCovShare(S, 9);
  const apts = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us');
  const joined = apts.filter(ap => IC.aspLink(S, ap)).length, xs = IC.aspCrossings(S).length;
  const airOn = S.threats.filter(t => !t.dead && t.d.civil && t.type === 'civ' && IC.inHome(t.x, t.y));
  const onNet = airOn.filter(t => t.net).length, onRadar = airOn.filter(t => IC.aspSeen(S, t)).length;
  const fields = N.fields.map(f => `<div class="li click" data-act="selField" data-id="${f.id}"><b>${esc(f.name)}</b><small>${esc(f.club)} · mood ${Math.round(f.mood)}% · ${f.today} movements today</small></div>`).join('');
  const d = N.day;
  return `<div class="card"><h3>Airspace<em>${N.fixes.length} fixes · ${N.ways.length} airways</em></h3>
      ${kv([['Radar cover at cruise height', `<span class="${hi < 0.8 ? 'amber' : ''}">${U.pct(hi)}</span> of the country`], ['Radar cover at 1 km', `<span class="${lo < 0.5 ? 'amber' : ''}">${U.pct(lo)}</span>`],
        ['Airports on the airways', `${joined} of ${apts.length}`], ['Airway crossings', xs], ['Airliners over us now', airOn.length], ['… on airways · on radar', `${onNet} · ${onRadar}`],
        ['Separation lost today', `<span class="${d.los ? 'amber' : ''}">${d.los}</span>`], ['Near misses today', `<span class="${d.near ? 'hostile' : ''}">${d.near}</span>`], ['Infringements today', d.inf],
        ['Conflicts solved by controllers', N.stats.solved], ['Departures held for spacing', N.stats.held]])}
      <div class="acts"><button class="btn primary" data-act="aspDraw">Draw airways</button><button class="btn" data-act="layer" data-v="coverage">${S.layers.coverage ? 'Hide' : 'Show'} radar cover</button></div>
      <p class="hint">Controllers keep apart the flights they see on radar. Off the airways, or where radar does not reach, they space flights by time alone: fewer flights an hour, longer delays, and crossings that can go wrong. Radar sees less the lower an aircraft flies: hills and the curve of the earth hide it.</p></div>
    <div class="card"><h3>Light aircraft<em>${S.threats.filter(t => !t.dead && t.type === 'ga').length} flying</em></h3>${fields ? `<div class="list">${fields}</div>` : ''}
      <div class="acts"><button class="btn" data-act="fieldMode">+ Light-aircraft field · ${U.money(IC.ASP.FIELD_COST)}</button></div>
      <p class="hint">Flying clubs fly slow and low, by sight, from grass fields and from our airports. On a big airport's runway each one takes as long as two airliners, so a field near the capital frees the runway. They must stay out of control zones unless cleared.</p></div>`;
}

/* ---------- the career: the acts and what each opens, delegates, requests, decisions ---------- */
/* what act n opens that act n − 1 did not: rooms, equipment, controls, delegates and requests */
function actOpens(n) {
  const st = S.story, at = k => ({ story: { act: k, doc: st.doc }, av: S.av });
  const out = [];
  for (const [k, name] of ui.ROOMS) if (IC.roomAllowed(at(n), k) && (n === 1 || !IC.roomAllowed(at(n - 1), k))) out.push(['room', `${name} room`]);
  const units = Object.keys(IC.UNITS).filter(t => !IC.UNITS[t].callin && IC.storyAllows(at(n), t) && (n === 1 || !IC.storyAllows(at(n - 1), t)));
  if (units.length) out.push(['unit', units.length > 3 ? `${units.length} kinds of equipment` : units.map(t => IC.UNITS[t].name).join(', ')]);
  if (n === 2) out.push(['ctl', 'Weapons status']);
  if (n === 3) out.push(['ctl', 'Firing doctrine']);
  for (const k in IC.DELEGATES) if (IC.DELEGATES[k].act === n) out.push(['del', IC.DELEGATES[k].name]);
  for (const R of IC.REQUESTS) if (R.act === n) out.push(['req', R.name]);
  return out;
}
function staff() {
  const st = S.story, A = IC.ACTS[st.act];
  const done = st.goals.filter(g => g.done).length;
  const dels = Object.entries(IC.DELEGATES).map(([k, D]) => {
    const avail = st.act >= D.act, on = st.del[k], hired = st.hired && st.hired.has(k);
    return `<div class="li ${avail ? '' : 'shut'}"><b>${esc(D.name)}${ui.newTag('del:' + k)}</b><small>${esc(D.desc)} · ${U.money(D.cost)}/h${!hired && D.cp ? ` · ${D.cp} CP to appoint` : ''}${avail ? '' : ` · from ${IC.ACTS[D.act].name}`}</small><span class="la">${avail ? `<button class="btn sm ${on ? 'primary' : ''}" data-act="delegate" data-v="${k}" ${!hired && !on && st.cp < D.cp ? 'disabled' : ''}>${on ? 'On duty' : hired ? 'Off' : 'Appoint'}</button>` : ui.icon('lock', 'sm')}</span></div>`;
  }).join('');
  const reqs = IC.REQUESTS.map(R => {
    const got = st.bought.has(R.id), avail = st.act >= R.act;
    return `<div class="li ${avail ? '' : 'shut'}"><b>${esc(R.name)}${ui.newTag('req:' + R.id)}</b><small>${esc(R.desc)} · ${R.cp} CP + ${U.money(R.cost)}${avail ? '' : ` · from ${IC.ACTS[R.act].name}`}</small><span class="la">${avail ? `<button class="btn sm" data-act="cpReq" data-v="${R.id}" ${got || st.cp < R.cp || S.budget < R.cost ? 'disabled' : ''}>${got ? 'Granted' : 'Request'}</button>` : ui.icon('lock', 'sm')}</span></div>`;
  }).join('');
  const log = st.log.slice().reverse().slice(0, 12).map(l => `<div class="li"><b>${esc(l.title)}</b><small>${U.clock(l.t)} · ${esc(l.choice)}</small></div>`).join('');
  const docs = Object.keys(st.doc).filter(k => st.doc[k]).map(k => `<span class="chip">${esc({ transparency: 'Transparency', quiet: 'Discretion', forward: 'Forward defence', depth: 'Defence in depth', cheapGuns: 'Airport guns' }[k] || k)}</span>`).join('');
  // the road ahead: every act, what it opened or will open
  const acts = [1, 2, 3, 4].map(n => {
    const cls = n < st.act ? 'done' : n === st.act ? 'cur' : n === st.act + 1 ? 'next' : '';
    const opens = actOpens(n);
    return `<div class="actstep ${cls}"><small>${IC.ACTS[n].name}${n < st.act ? ' · done' : n === st.act ? ' · now' : ''}</small><b>${esc(IC.ACTS[n].title)}</b><span>${esc(IC.ACTS[n].role)}</span>
      ${n === st.act ? `<div class="bars one"><span>Goals</span>${bar(done / Math.max(1, st.goals.length), 'var(--amber)')}<span>${done}/${st.goals.length}</span></div>` : ''}
      ${opens.length ? `<ul class="opens">${opens.map(([k, t]) => `<li class="${k}">${n > st.act ? ui.icon('lock', 'sm') : ''}${esc(t)}</li>`).join('')}</ul>` : ''}</div>`;
  }).join('');
  const nextHow = st.act < 4 ? `<p class="hint">Finish this act's goals (in the panel on the left) to move to ${esc(IC.ACTS[st.act + 1].name)}. The story also moves on by itself if you take too long.</p>` : '';
  return `<div class="card wide"><h3>Career<em>${esc(st.role)}</em></h3><div class="acts4">${acts}</div>${nextHow}
      <div class="bars"><span>Confidence</span>${bar(st.standing / 100)}<span>${Math.round(st.standing)}</span><span>Tension</span>${bar((S.tension || 0) / 100, 'var(--hostile)')}<span>${Math.round(S.tension || 0)}</span></div>
      ${kv([['Command points (CP)', `<b class="amber">${st.cp}</b> · earned from goals and hard decisions`], ['Doctrine', docs || '<span class="muted">none yet</span>']])}</div>
    <div class="card"><h3>Delegates<em>${U.money(IC.staffCost(S))}/h</em></h3><div class="list">${dels}</div><p class="hint">Delegates do routine work for you, for a running cost.</p></div>
    <div class="card"><h3>Requests<em>spend command points</em></h3><div class="list">${reqs}</div></div>
    <div class="card"><h3>Decisions</h3>${log ? `<div class="list">${log}</div>` : '<p class="hint">None yet.</p>'}</div>`;
}

/* ---------- air ---------- */
function air() {
  const tasks = S.ato.map(t => {
    const cov = S.air.filter(a => a.task === t && !a.dead && a.state !== 'rtb').length;
    return `<div class="li"><b>${esc(t.name)}</b><small>${cov} on task · wants ${t.want}</small><span class="la"><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="-1">−</button><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="1">+</button><button class="btn sm" data-act="tdel" data-id="${t.id}">✕</button></span></div>`;
  }).join('');
  const add = [`<button class="btn" data-act="taskPoint" data-v="cap">+ Combat air patrol</button>`, `<button class="btn" data-act="taskPoint" data-v="aew">+ Early warning orbit</button>`, `<button class="btn" data-act="taskPoint" data-v="isr">+ Recon area</button>`].join('');
  const bases = IC.bases(S).filter(b => (b.kind === 'airbase' && !b.locked) || S.roster.some(r => r.base === b.id && r.st !== 'lost')).concat(S.units.filter(u => u.type === 'heliport'));
  const cards = bases.map(b => {
    const rs = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
    const st = b.parts ? IC.baseStatus(S, b) : { runway: true };
    const rows = rs.map(r => {
      const a = r.ent;
      const state = r.st === 'ready' ? '<span class="ok">Ready</span>' : r.st === 'turn' ? `Rearming ${U.dur(r.t)}` : a ? `${{ out: 'En route', station: 'On station', engage: 'Engaging', rtb: 'Returning', vid: 'Identifying' }[a.state] || 'Airborne'}${a.task ? ' · task' : ''} · ${U.dur(a.fuel)} fuel` : 'Airborne';
      const why = IC.missionOk(S, r, 'cap');
      let btn = '';
      if (r.st === 'air' && a && !a.job) btn = `<button class="btn sm" data-act="recall" data-rid="${r.id}">Recall</button><button class="btn sm" data-act="selAir" data-rid="${r.id}">Show</button>`;
      else if (r.st === 'ready') {
        const k = r.kind;
        if (k === 'ftr') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="cap" ${why ? 'disabled' : ''}>Patrol</button><button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="strike" ${IC.missionOk(S, r, 'strike') ? 'disabled' : ''}>Strike</button>`;
        else if (k === 'aew' || k === 'isr') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="${k === 'aew' ? 'aew' : 'isr'}" ${why ? 'disabled' : ''}>${k === 'aew' ? 'Orbit' : 'Recon'}</button>`;
        else if (k === 'ucav') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="isr" ${why ? 'disabled' : ''}>Recon</button>`;
        else if (k === 'heli') btn = '<span class="muted" style="font-size:.78rem">resupply: select a battery</span>';
      }
      const load = r.kind === 'ftr' && r.st !== 'air' && (!S.story || S.story.act >= 3) ? seg('loadout', r.load, [['aa', 'Missiles', '', 'Loaded with air-to-air missiles, to fight aircraft'], ['strike', 'Bombs', '', 'Loaded with bombs, to strike targets on the ground']], r.id) : '';
      const qra = r.kind === 'ftr' ? `<button class="btn sm ${r.qra ? 'primary' : ''}" data-act="qra" data-rid="${r.id}" title="Crews on alert start engines in half the time">${r.qra ? 'On alert' : 'Alert'}</button>` : '';
      const block = r.st === 'ready' && b.parts ? IC.milLaunchBlock(S, b, r) : '';
      return `<div class="li stack"><b>${esc(r.name)} <span class="muted">· ${esc(IC.AIR_KIND[r.kind].name)} ×${r.n}</span></b><small>${state}${r.ent && r.ent.gnd ? ' · taxiing' : ''}${r.slot || r.st === 'air' ? '' : ' · <span class="amber">parked in the open</span>'}${block ? ` · <span class="hostile">${esc(block)}</span>` : ''}</small><span class="la">${qra}${load}${btn}</span></div>`;
    }).join('');
    const buy = b.infra && (!S.story || S.story.act >= 3) ? ['ftr', 'ucav', 'isr', 'heli'].map(k => `<button class="btn sm" data-act="buyAir" data-v="${k}" data-id="${b.id}" ${S.budget < IC.AIR_KIND[k].buy ? 'disabled' : ''} title="Buy a ${esc(IC.AIR_KIND[k].name.toLowerCase())} for this base">+ ${esc(IC.AIR_KIND[k].name)} · ${U.money(IC.AIR_KIND[k].buy)}</button>`).join('') : '';
    return `<div class="card"><h3>${esc(b.name)}<em>${st.runway ? rs.length + ' flights' : '<span class="hostile">runway closed</span>'}</em></h3><div class="list">${rows || '<p class="hint">No aircraft.</p>'}</div>${buy ? `<div class="acts">${buy}</div>` : ''}<div class="acts"><button class="btn sm" data-act="selInfra" data-id="${b.id}">Open base</button></div></div>`;
  }).join('');
  const storyNote = S.story && S.story.act < 3 ? `<p class="hint">In peacetime nobody fires without your order: Weapons are on Hold. A fighter sent to intercept flies up, identifies and escorts. To shoot, select the track and order the escort to fire.</p>` : '';
  return `<div class="card wide"><h3>Standing tasks<em>squadrons rotate aircraft to keep these covered</em></h3>${tasks ? `<div class="list">${tasks}</div>` : '<p class="hint">No standing tasks. Add one and the air wing keeps it covered around the clock.</p>'}<div class="acts">${add}</div>${storyNote}</div>${cards}`;
}

/* ---------- supply: stock, depots, convoys, buying ---------- */
function logi() {
  const depots = IC.depots(S), P = S.supply, { need, have } = IC.stockNeed(S);
  const keys = IC.STOCK_KEYS.filter(k => need[k] || have[k] >= 1);
  const rows = keys.map(k => {
    let dep = 0, units = 0, moving = 0;
    for (const d of depots) dep += d.inv[k] || 0;
    for (const u of S.units) for (const m of u.mags) if (m.mun === k) units += m.mag + m.store;
    for (const j of S.jobs) if (j.mun === k && j.state === 'active') moving += j.qty;
    const want = Math.max(4, Math.ceil(need[k] || 0)), low = (have[k] || 0) < want * IC.SUPPLY.reorder;
    const q = Math.max(4, Math.ceil(want / 2 / 4) * 4), cost = IC.canBuyMun(S, k) && depots.length ? IC.stockSource(S, k, q, depots[0]).cost : 0;
    return `<tr><td>${esc(IC.munWords(k))}</td><td class="r ${low ? 'amber' : ''}">${Math.floor(dep)}</td><td class="r">${need[k] ? want : '–'}</td><td class="r">${units || '–'}</td><td class="r">${moving || '–'}</td><td class="r">${cost ? `<button class="btn sm" data-act="buyStock" data-v="${k}:${q}" ${S.budget < cost ? 'disabled' : ''} title="Bought now, sent by rail to the depot that needs it most">+${q} · ${U.money(cost)}</button>` : ''}</td></tr>`;
  }).join('');
  const plantsUp = S.infra.filter(f => f.kind === 'factory' && f.owner === 'us' && !f.offline).length;
  const stock = `<div class="card wide"><h3>Stock<em>${plantsUp ? `${plantsUp} arms plant${plantsUp > 1 ? 's' : ''} working` : '<span class="hostile">every arms plant is down: imports only, by air</span>'}</em></h3>
    <table class="t"><tr><th>Item</th><th class="r">In depots</th><th class="r">Full reload</th><th class="r">At units</th><th class="r">Moving</th><th class="r">Buy</th></tr>${rows || '<tr><td colspan="6">No units that need supply.</td></tr>'}</table>
    <div class="rl"><span class="muted" style="font-size:.8rem;width:9rem">Keep stocked</span>${seg('autoStock', P.auto ? 'on' : 'off', [['on', 'On', '', 'The Ministry buys what falls below half a reload'], ['off', 'Off', 'amb', 'You buy stock yourself']])}</div>
    ${P.auto ? `<div class="rl"><span class="muted" style="font-size:.8rem;width:9rem">Keep back at least</span>${seg('floor', String(P.floor), IC.FLOORS.map(v => [String(v), U.money(v), '', `The Ministry never spends the treasury below ${U.money(v)}`]))}</div>` : ''}
    <p class="hint">Full reload: what every unit on the map would need to refill once. ${P.auto ? 'When the depots hold less than half of it, the Ministry buys the rest and it goes by rail to the depot that needs it most.' : 'Buy before the depots run dry: a battery with no missiles in reach waits, and says so.'}</p></div>`;
  const dem = IC.depotDemand(S);
  const dcards = depots.map(d => {
    const vs = S.vehicles.filter(v => v.home === d && !v.dead), out = vs.filter(v => v.state !== 'idle').length;
    const low = Object.keys(dem[d.id] || {}).filter(k => (d.inv[k] || 0) + (d.inc[k] || 0) < dem[d.id][k] * 0.5).map(k => IC.munWords(k));
    const served = S.units.filter(u => u.mags.length && IC.servingDepot(S, u) === d).length;
    return `<div class="card"><h3>${esc(d.name)}<em>${d.central ? 'national stock' : `${served} unit${served === 1 ? '' : 's'} within ${U.km(d.reach || 1400)}`}</em></h3>
      ${kv([['Truck companies', `${out} of ${vs.length} out`], ['Short of', low.length ? `<span class="amber">${esc(low.join(', '))}</span>` : 'nothing']])}
      ${d.central ? '' : `<div class="rl"><span class="muted" style="font-size:.8rem;width:7rem">Priority</span>${seg('dpri', d.pri || 'normal', Object.entries(IC.DEPOT_PRI).map(([k, p]) => [k, p.name, '', p.desc]), d.id)}</div>`}
      <div class="acts"><button class="btn sm" data-act="buyTruckAt" data-id="${d.id}" ${S.budget < 12 ? 'disabled' : ''}>+ Truck company ₭12M</button><button class="btn sm" data-act="selu" data-id="${d.id}">Show</button></div></div>`;
  }).join('');
  const jobs = S.jobs.filter(j => j.state === 'active').sort((a, b) => IC.jobEta(S, a) - IC.jobEta(S, b));
  const road = jobs.filter(j => j.v).slice(0, 14).map(j => `<button class="li" data-act="selv" data-id="${j.v.id}"><b>${esc(IC.jobLabel(j))}</b><small>${esc(j.v.name)} from ${esc(j.from.name)} · ${{ toSource: 'going to load', load: 'loading', toDest: 'on the road', unload: 'unloading' }[j.v.state] || ''} · here in ${U.dur(IC.jobEta(S, j))}${j.v.cut ? ` · <span class="amber">${esc(j.v.cut)}</span>` : ''}</small></button>`).join('');
  const other = jobs.filter(j => !j.v).map(j => `<div class="li"><b>${esc(IC.jobLabel(j))}</b><small>${j.mode === 'rail' ? `by rail from ${esc(j.from.name)}` : j.mode === 'heli' ? 'by helicopter' : 'allied airlift'} · in ${U.dur(IC.jobEta(S, j))}</small></div>`).join('');
  const waiting = S.units.filter(u => u.mags.some(m => m.why)).slice(0, 8).map(u => `<button class="li" data-act="selu" data-id="${u.id}"><b class="amber">${esc(u.name)} waits</b><small>${esc(u.mags.find(m => m.why).why)}</small></button>`).join('');
  const nWait = S.units.filter(u => u.mags.some(m => m.why)).length;
  const top = pages('logi', [['stock', 'Stock', nWait ? `${nWait} waiting` : '', 'What the depots hold, what units need, buying'], ['depots', 'Depots and convoys', `${jobs.length || ''}`, 'Each depot, its trucks, and what is on the way'], ['plants', 'Arms plants', plantsUp ? '' : 'all down', 'The factories that sell missiles to the depots']]);
  if (ui.sub.logi === 'depots') return top + dcards +
    `<div class="card"><h3>Convoys on the road<em>${jobs.filter(j => j.v).length}</em></h3>${road ? `<div class="list">${road}</div>` : '<p class="hint">No deliveries under way.</p>'}</div>
    <div class="card"><h3>By rail and air<em>${jobs.filter(j => !j.v).length}</em></h3>${other ? `<div class="list">${other}</div>` : '<p class="hint">Nothing coming. Bought stock goes by rail; helicopters fly to empty batteries when no truck can.</p>'}</div>`;
  if (ui.sub.logi === 'plants') return top + plants();
  return top + stock + (waiting ? `<div class="card wide"><h3>Waiting for supply</h3><div class="list">${waiting}</div></div>` : '') +
    `<div class="card wide"><h3>How supply works</h3><p class="hint">${esc(IC.SUPPLY_GUIDE)}</p></div>`;
}
/* the arms plants (they used to have a room of their own, Industry) */
function plants() {
  const facs = S.infra.filter(i => i.kind === 'factory').map(f => `<tr class="click" data-act="selInfra" data-id="${f.id}"><td>${esc(f.name)}</td><td class="r">${U.pct(f.hp / f.max)}</td><td>${f.offline ? '<span class="hostile">knocked out</span>' : 'working'}</td><td class="r">${S.jobs.filter(j => j.mode === 'rail' && j.from === f).length || '–'}</td></tr>`).join('');
  return `<div class="card wide"><h3>Arms plants<em>they sell missiles to the depots, by rail · click one to open it</em></h3><table class="t"><tr><th>Plant</th><th class="r">Intact</th><th>Status</th><th class="r">Loads on the way</th></tr>${facs}</table>
    <p class="hint">Buy stock on the Stock page, or from a plant's own panel. A damaged plant loads slower; with every plant down, stock is imported by air at ${U.pct(0.9 - S.support / 100)} more.</p></div>`;
}

/* ---------- the war economy: mobilization and war bonds (once the Industry room) ---------- */
function warEconomy() {
  const mob = IC.MOBIL.map((m, i) => `<button class="li ${S.mobil === i ? 'on' : ''}" data-act="mobil" data-v="${i}"><b>${esc(m.name)}${S.mobil === i ? ' · now' : ''}</b><small>${esc(m.desc.replace(/ [^.]*orders at a time\./, ''))} Taxes ×${m.tax}, running costs ×${m.up}.</small></button>`).join('');
  const bonds = S.time - S.bondsT >= 86400;
  return `<div class="card"><h3>Mobilization<em>national industry ${U.pct(IC.industry(S))}</em></h3><div class="list">${mob}</div></div>
    <div class="card"><h3>War bonds</h3><div class="acts"><button class="act" data-act="bonds" ${bonds ? '' : 'disabled'}>Sell war bonds · +${U.money(200 + S.mobil * 80)}</button></div><p class="hint">${bonds ? 'Cash now, a small cost to morale in every city. Once a day.' : `Bonds can be sold again in ${U.dur(86400 - (S.time - S.bondsT))}.`}</p></div>`;
}

/* ---------- the economy: the weekly statement, loans, passengers, growth, trade and roads ---------- */
function economy() {
  const E = S.econ; if (!E) return '<div class="card wide"><p class="hint">No economy in this mode.</p></div>';
  const wk = IC.weekStatement(S, 0), last = IC.weekStatement(S, 1), M = IC.money(S);
  const val = v => `<td class="r ${v >= 0 ? 'ok' : 'hostile'}">${v >= 0 ? '+' : '−'}${U.money(Math.abs(v)).replace('−', '')}</td>`;
  const mline = (l, sign) => `<button class="mline" data-act="why" data-v="${l.k}" aria-expanded="${ui.why === l.k}"><span>${esc(l.name)}</span><b class="${sign > 0 ? 'ok' : 'hostile'}">${sign > 0 ? '+' : '−'}${U.money(l.v)}</b></button>${ui.why === l.k ? `<p class="hint mwhy">${esc(l.why)}</p>` : ''}`;
  const warn = M.net < 0 && M.left < 24;
  const head = `<div class="card wide money"><h3>Money<em>click a line for the reason</em></h3>
    <div class="mtop"><div><small>Treasury</small><strong>${U.money(S.budget)}</strong></div><div><small>An hour, now</small><strong class="${M.net >= 0 ? 'ok' : 'hostile'}">${M.net >= 0 ? '+' : '−'}${U.money(Math.abs(M.net))}</strong></div><p class="${warn ? 'hostile' : M.net < 0 ? 'amber' : 'ok'}">${esc(M.forecast)}${warn ? ' Put units back in the reserve, raise airport charges, or borrow below.' : ''}</p></div>
    <div class="mcols"><div><h4>Coming in <em>+${U.money(M.inH)}/h</em></h4>${M.inc.map(l => mline(l, 1)).join('') || '<p class="hint">Nothing.</p>'}</div>
    <div><h4>Going out <em>−${U.money(M.outH)}/h</em></h4>${M.out.map(l => mline(l, -1)).join('') || '<p class="hint">Nothing.</p>'}</div></div>
    <p class="hint">Hourly lines are what runs all the time. Buying, building and research are paid when you do them and show in the week below.</p></div>`;
  const keys = [...new Set((wk ? wk.lines : []).concat(last ? last.lines : []).map(l => l.k))];
  const get = (st, k) => { const l = st && st.lines.find(x => x.k === k); return l ? l.v : 0; };
  const rows = keys.sort((a, b) => get(wk, b) - get(wk, a)).map(k => `<tr><td>${esc(IC.STATEMENT[k] || k)}</td>${val(get(wk, k))}${last ? val(get(last, k)) : ''}</tr>`).join('');
  const stmt = head + `<div class="card wide"><h3>This week<em>everything paid in and out, by kind</em></h3>
    ${wk ? `<table class="t"><tr><th>${wk.days >= 7 ? `Week ${wk.week}` : wk.days === 1 ? `Day ${wk.from} (week ${wk.week})` : `Days ${wk.from}–${wk.from + wk.days - 1} (week ${wk.week})`}</th><th class="r">This week</th>${last ? '<th class="r">Last week</th>' : ''}</tr>${rows}
      <tr><td><b>Came in</b></td>${val(wk.income)}${last ? val(last.income) : ''}</tr><tr><td><b>Went out</b></td>${val(wk.spend)}${last ? val(last.spend) : ''}</tr><tr><td><b>Change in the treasury</b></td>${val(wk.net)}${last ? val(last.net) : ''}</tr></table>` : ''}
    <p class="hint">The lines add up to the change in the treasury. Loans taken count in the change, not as income.</p></div>`;
  // loans
  const owed = IC.loanOwed(S), lim = IC.loanLimit(S);
  const offers = IC.LOANS.map((o, i) => { const pay = (o.amt / o.days + o.amt * IC.LOAN_RATE) * 1; return `<div class="li"><b>Borrow ${U.money(o.amt)}</b><small>over ${o.days} days · about ${U.money(pay)} a day at first</small><span class="la"><button class="btn sm" data-act="loan" data-v="${i}" ${owed + o.amt > lim ? 'disabled' : ''}>Borrow</button></span></div>`; }).join('');
  const mine = E.loans.map(l => `<div class="li"><b>${U.money(l.amt)} loan</b><small>${U.money(l.left)} still owed · ${U.money(IC.loanPay(l) * 24)} a day</small><span class="la"><button class="btn sm" data-act="repayLoan" data-id="${l.id}" ${S.budget < l.left ? 'disabled' : ''}>Pay off</button></span></div>`).join('');
  const loans = `<div class="card"><h3>Loans<em>${U.money(owed)} owed of ${U.money(lim)} the banks allow</em></h3>${mine ? `<div class="list">${mine}</div>` : ''}<div class="list">${offers}</div>
    <p class="hint">For big projects: a new runway, a motorway. Repayments and ${(IC.LOAN_RATE * 100).toFixed(1)}% interest a day come out of the budget every hour. The limit grows with last week's income.</p></div>`;
  // passengers at each airport
  const apts = S.infra.filter(i => i.kind === 'airport' && i.svc).map(ap => { const v = ap.svc; return `<tr class="click" data-act="selInfra" data-id="${ap.id}"><td>${esc(ap.name.replace(/ (International|Airport)$/, ''))}</td><td class="r">${Math.round(v.demand).toLocaleString('en-US')}</td><td class="r">${Math.round(v.seats).toLocaleString('en-US')}</td><td class="r ${v.lf > 0.9 ? 'amber' : ''}">${U.pct(v.lf)}</td><td class="r">${Math.round(v.deps)}</td><td class="r">${v.dests.size}</td><td class="r" title="frequency · choice of places · punctuality · fares">${U.pct(v.freqF)} · ${U.pct(v.destF)} · ${U.pct(v.relF)} · ${U.pct(v.fareF)}</td></tr>`; }).join('');
  const pax = `<div class="card wide"><h3>Passengers<em>a day, from the cities each airport serves</em></h3><table class="t"><tr><th>Airport</th><th class="r">Want to fly</th><th class="r">Seats</th><th class="r">Full</th><th class="r">Departures</th><th class="r">Places</th><th class="r">Frequency · choice · punctuality · fares</th></tr>${apts}</table>
    <p class="hint">People fly when flights are frequent, go to many places, leave on time and cost little. When seats run full, airlines ask for more routes; when they fly half empty, they lose interest.</p></div>`;
  // cities
  // one table for the cities: growth and air service, and (once at war) their industry and damage
  const war = ui.roomOk('industry');
  const cities = IC.cities(S).slice().sort((a, b) => b.pop - a.pop).map(c => { const g = c.gr ? c.gr.tot : 0; const cut = c.cuts && c.cuts.length, dark = c.plant && S.byId[c.plant] && S.byId[c.plant].offline; return `<tr class="click" data-act="selInfra" data-id="${c.id}"><td>${esc(c.name)}</td><td class="r">${c.pop}k</td><td class="r ${g > 0.05 ? 'ok' : g < -0.05 ? 'hostile' : ''}">${Math.abs(g) < 0.005 ? '' : g > 0 ? '+' : '−'}${Math.abs(g).toFixed(2)}%</td><td class="r">${c.air ? U.pct(c.air.score) : '–'}</td><td class="r">${c.air ? Math.round(c.air.demand).toLocaleString('en-US') : '–'}</td><td class="r ${cut ? 'hostile' : ''}">${U.pct(c.rc / Math.max(1, c.rc0 || 1))}${cut ? ' · cut' : ''}</td>${war ? `<td class="r">${c.ind}</td><td class="r">${U.pct(c.hp / c.max)}</td><td class="${c.alert > 0 ? 'hostile' : dark ? 'suspect' : ''}">${c.alert > 0 ? 'sirens' : dark ? 'blackout' : 'working'}</td>` : ''}</tr>`; }).join('');
  const growth = `<div class="card wide"><h3>Cities<em>growth a day · click one for the reasons</em></h3><table class="t"><tr><th>City</th><th class="r">Pop</th><th class="r">Growth</th><th class="r">Air service</th><th class="r">Flyers a day</th><th class="r">Road links</th>${war ? '<th class="r">Industry</th><th class="r">Intact</th><th>Status</th>' : ''}</tr>${cities}</table>
    <p class="hint">Click a city for the reasons. A new airport or road within reach of a city that has none is the biggest lift you can give it.</p></div>`;
  // industry
  const inds = E.inds.map(i => `<div class="li"><b>${esc(i.name)} <span class="muted">· ${esc(IC.INDUSTRY[i.kind].goods)}</span></b><small>${U.money(i.out * 24)} a day of ${U.money(i.cap * 24)} it could sell · ${IC.indWhy(S, i).map(esc).join(' ')}</small></div>`).join('');
  const trade = `<div class="card"><h3>Industry and trade<em>trade taxes ${U.money(IC.tradeTax(S))}/h</em></h3><div class="list">${inds}</div>
    <p class="hint">Remote industries sell more with a fast road to a city and an airport with cargo flights (freighters, or the holds of wide-bodies) within ${IC.GROWTH.indCatch} h. A cargo terminal helps.</p></div>`;
  // roads
  const build = Object.entries(IC.ROADS).map(([k, R]) => `<button class="act" data-act="roadMode" data-v="${k}" aria-pressed="${!!(S.mode2 && S.mode2.kind === 'road' && S.mode2.cls === k)}" title="${esc(R.what)}. ${U.money(R.perKm)} a km on flat ground, ${U.money(R.bridge)} a bridge, about ${R.kmh} km built an hour">${esc(R.name)} · ${U.money(R.perKm)}/km</button>`).join('');
  const works = E.works.map(w => `<div class="li"><b>${esc(w.name)}</b><small>${esc(w.stage)} · ${U.pct(w.prog)} · open in ${U.dur((1 - w.prog) * w.hours * 3600)} · ${w.km.toFixed(1)} km, ${U.money(w.cost)}</small></div>`).join('');
  const cuts = S.world.edges.filter(e => e.cut).map(e => `<div class="li"><b class="hostile">${esc(e.cutName)}</b><small>reopens in about ${U.dur(Math.max(0, (0.6 - e.cond) / ((e.cls === 'hw' ? 0.1 : 0.14) * (e.rush ? 3 : 1))) * 3600)}${e.rush ? ' · crews round the clock' : ''}</small>${e.rush ? '' : `<span class="la"><button class="btn sm" data-act="rushRepair" data-id="${e.id}" ${S.budget < IC.rushCost(e) ? 'disabled' : ''} title="Engineers work round the clock: three times as fast">Rush · ${U.money(IC.rushCost(e))}</button></span>`}</div>`).join('');
  const roads = `<div class="card"><h3>Roads<em>${E.works.length} under construction</em></h3><div class="acts">${build}</div>${works ? `<div class="list">${works}</div>` : ''}${cuts ? `<div class="list">${cuts}</div>` : ''}
    <p class="hint">You build roads for your airports: start at an airport and click points to a road, a town or a motorway (a motorway link gets an interchange). Hills mean cuttings, rivers bridges. A faster road to the airport brings more people within reach of it. Towns build their own streets. A crater closes a road until engineers fill it.</p></div>`;
  const top = pages('economy', [['money', 'Money', M.net < 0 ? 'losing' : '', 'The treasury, the hourly lines and the weekly statement'], ['growth', 'Growth and trade', '', 'Passengers, cities and remote industries'], ['build', 'Roads and loans', E.works.length ? `${E.works.length} building` : '', 'Build roads to your airports; borrow for big projects']]
    .concat(war ? [['war', 'War economy', '', 'Mobilization and war bonds']] : []));
  const pg = ui.sub.economy;
  return top + (pg === 'growth' ? pax + growth + trade : pg === 'build' ? roads + loans : pg === 'war' ? warEconomy() : stmt);
}

/* ---------- intelligence ---------- */
function intel() {
  const E = S.enemy;
  const P = E.plan;
  const assess = !E.war ? 'Massing on the border.' : P ? `Their air force appears to be trying to <b>${esc(P.label)}</b>, focused on ${esc(P.obj.name)}. ${P.phase === 'probe' ? 'Small raids so far: they are probing our coverage.' : P.phase === 'strike' ? 'Probing is over. <b class="hostile">Expect a heavy, coordinated strike.</b>' : 'They are assessing the damage from their last strike.'}` : 'No clear objective: harassment and opportunistic raids.';
  const ops = E.ops.slice(-8).reverse().map(o => `<div class="li"><b>${esc(o.label)}</b><small>${U.hhmm(o.t0)} · ${o.launched} launched · ${o.lost} shot down · ${o.hits} hits</small></div>`).join('');
  const known = [...E.known.values()].filter(k => !k.ref.dead).sort((a, b) => b.t - a.t);
  const mine = known.slice(0, 10).map(k => `<button class="li" data-act="selu" data-id="${k.ref.id}"><b>${esc(k.ref.name)}</b><small>${esc(k.ref.d.name)} · via ${esc(k.how)} · ${U.dur(S.time - k.t)} ago${U.dxy(k.x, k.y, k.ref.x, k.ref.y) > 30 ? ' · moved since' : ''}</small></button>`).join('');
  const sites = S.esites.filter(s => s.pk > 0).map(s => `<button class="li" data-act="sels" data-id="${s.id}"><b>${esc(s.name)}</b><small>${s.destroyed ? 'destroyed' : s.pk >= 2 ? `located · ${U.pct(s.hp / s.max)} intact` : 'suspected'}</small></button>`).join('');
  const tels = S.tels.filter(t => t.known && !t.dead).map(t => `<button class="li" data-act="selt" data-id="${t.id}"><b>${esc(t.name)}</b><small>last seen ${U.dur(S.time - t.kt)} ago</small></button>`).join('');
  const bda = S.reports.slice(0, 8).map(r => `<div class="li"><b>${esc(r.by)} → ${esc(r.target.name)}</b><small>${U.hhmm(r.t)} · ${esc(r.text)}</small></div>`).join('');
  return `<div class="card wide"><h3>Assessment<em>${esc(E.mood)}</em></h3><p style="margin:0">${assess}</p><div class="bars"><span>Enemy will</span>${bar(E.will / 100, 'var(--hostile)')}<span>${Math.round(E.will)}%</span></div><p class="hint">Their will falls when formations, launchers and bases are destroyed and their offensives stall. It rises when they take towns.</p></div>
    <div class="card"><h3>Recent enemy operations</h3>${ops ? `<div class="list">${ops}</div>` : '<p class="hint">Nothing yet.</p>'}</div>
    <div class="card"><h3>Strike reports</h3>${bda ? `<div class="list">${bda}</div>` : '<p class="hint">No strikes yet.</p>'}</div>
    <div class="card"><h3>What they know about us<em>${known.length} of ${S.units.length} units</em></h3>${mine ? `<div class="list">${mine}</div>` : '<p class="hint">No fix on any of our units.</p>'}<p class="hint">Radiating, firing and sitting near the border give units away. Moving makes their fix stale.</p></div>
    <div class="card"><h3>Enemy installations<em>${S.esites.filter(s => s.pk === 0).length} unlocated</em></h3><div class="list">${sites}</div></div>
    <div class="card"><h3>Mobile launchers</h3>${tels ? `<div class="list">${tels}</div>` : '<p class="hint">None located. Satellite warning, counter-battery radar and reconnaissance find them.</p>'}</div>`;
}

/* ---------- research: a tree of choices, one lane per field, each step to the right needs the one before ---------- */
const depthOf = (t, memo = {}) => memo[t.id] != null ? memo[t.id] : (memo[t.id] = t.req.length ? 1 + Math.max(...t.req.map(r => depthOf(IC.TECH.find(x => x.id === r), memo))) : 0);
function research() {
  const T = S.tech, free = T.slots.some(s => !s);
  const slots = T.slots.map((s, i) => {
    if (!s) return `<div class="slot idle"><small>Slot ${i + 1}</small><b>Free</b><span>Pick a project below.</span></div>`;
    const t = IC.TECH.find(x => x.id === s.id);
    return `<div class="slot"><small>Slot ${i + 1}</small><b>${esc(t.name)}</b><span>${U.pct(s.prog)} · ${U.dur((1 - s.prog) * t.time)} left</span><div class="prog"><i style="width:${s.prog * 100}%"></i></div></div>`;
  }).join('');
  const memo = {}, maxD = Math.max(...IC.TECH.map(t => depthOf(t, memo)));
  const node = t => {
    const done = T.done.has(t.id), cur = IC.researching(S, t.id), reqOk = t.req.every(r => T.done.has(r));
    const cls = done ? 'done' : cur ? 'cur' : reqOk ? 'open' : 'locked';
    const opens = ui.techOpens(t);
    const act = done ? `<span class="ok">${ui.icon('star', 'sm')} Done</span>` : cur ? `<span class="amber">${U.pct(cur.prog)} · ${U.dur((1 - cur.prog) * t.time)} left</span>`
      : !reqOk ? `<span class="need">${ui.icon('lock', 'sm')} After ${t.req.filter(r => !T.done.has(r)).map(r => esc(IC.TECH.find(x => x.id === r).name)).join(' and ')}</span>`
      : `<button class="btn sm primary" data-act="research" data-v="${t.id}" ${!free || S.budget < t.cost ? 'disabled' : ''} title="${!free ? 'Both slots are busy' : S.budget < t.cost ? 'Not enough money' : `Start it: ${U.money(t.cost)} now, ready in ${U.dur(t.time)}`}">Research</button>`;
    return `<div class="tnode ${cls}" data-tech="${t.id}" data-req="${t.req.join(' ')}"><b>${esc(t.name)}${ui.newTag('tech:' + t.id)}</b><p>${esc(ui.techWords(t))}</p>${opens.length ? `<p class="opens">Opens: ${esc(opens.join(', '))}</p>` : ''}
      <div class="meta"><span>${done ? '' : `${U.money(t.cost)} · ${U.dur(t.time)}`}</span>${act}</div>${cur ? `<div class="prog"><i style="width:${cur.prog * 100}%"></i></div>` : ''}</div>`;
  };
  const lanes = IC.TECH_CATS.map(c => {
    const ts = IC.TECH.filter(t => t.cat === c.id);
    const n = ts.filter(t => T.done.has(t.id)).length;
    const cols = Array.from({ length: maxD + 1 }, (_, d) => `<div class="tcol">${ts.filter(t => depthOf(t, memo) === d).map(node).join('')}</div>`).join('');
    return `<div class="lane"><div class="lname"><b>${esc(c.name)}</b><small>${n} of ${ts.length}</small></div>${cols}</div>`;
  }).join('');
  return `<div class="card wide"><h3>Research<em>two projects at a time · each is paid when it starts</em></h3><div class="slots2">${slots}</div></div>
    <div class="card wide tree"><h3>What to research<em>left to right: each step needs the one it is joined to</em></h3><div class="lanes" style="--cols:${maxD + 1}">${lanes}<svg class="links" aria-hidden="true"></svg></div></div>`;
}
/* the lines between a project and what it needs, drawn once the nodes are laid out */
function treeLinks() {
  const box = $('wrBody').querySelector('.lanes'), svg = box && box.querySelector('svg.links');
  if (!svg) return;
  const B = box.getBoundingClientRect(), at = {};
  for (const n of box.querySelectorAll('.tnode')) { const r = n.getBoundingClientRect(); at[n.dataset.tech] = { l: r.left - B.left, r: r.right - B.left, y: r.top - B.top + Math.min(26, r.height / 2), done: n.classList.contains('done'), lane: n.closest('.lane') }; }
  let d = '', dd = '', dx = '';
  for (const n of box.querySelectorAll('.tnode[data-req]')) for (const id of n.dataset.req.split(' ').filter(Boolean)) {
    const a = at[id], b = at[n.dataset.tech]; if (!a || !b) continue;
    const mx = (a.r + b.l) / 2, p = `M${a.r} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${b.l} ${b.y}`;
    // a step that needs something from another field: dashed, so the lanes stay readable
    if (a.lane !== b.lane) dx += p; else if (a.done) dd += p; else d += p;
  }
  const html = `<path class="l" d="${d}"/><path class="l done" d="${dd}"/><path class="l x" d="${dx}"/>`;
  if (svg.innerHTML !== html) { svg.setAttribute('width', B.width); svg.setAttribute('height', B.height); svg.innerHTML = html; }
}

/* ---------- journal ---------- */
function journal() {
  const F = { all: () => true, alerts: l => l.kind === 'leak' || l.kind === 'warn', combat: l => ['SPLASH', 'IMPACT', 'LAUNCH', 'FIRE', 'BDA', 'HIT', 'DESTROYED', 'BURN', 'FRIED', 'HPM', 'LOST', 'MISS'].includes(l.tag), id: l => l.kind === 'id' || l.tag === 'VID' || l.tag === 'SUSPECT' || l.tag === 'DECEPTION', logistics: l => ['CONVOY', 'LOGI', 'HELI', 'LIFT', 'ORDER', 'DELIVERED', 'IMPORT', 'ENG', 'REPAIR'].includes(l.tag), staff: l => ['CDS', 'AD', 'LOG', 'INT', 'AIR', 'ENG', 'INS', 'CMD'].includes(l.tag) };
  const f = F[ui.logFilter] || F.all;
  const logs = S.logs.filter(f).slice(0, 250);
  return `<div class="card wide"><h3>Journal<em>${seg('logf', ui.logFilter, [['all', 'All'], ['alerts', 'Alerts'], ['combat', 'Combat'], ['id', 'Identification'], ['logistics', 'Logistics'], ['staff', 'Staff']])}</em></h3>
    <ol class="log">${logs.map(l => `<li class="${l.at ? 'click' : ''}" ${l.at ? `data-act="logjump" data-x="${l.at.x}" data-y="${l.at.y}"` : ''}><time>${U.hhmm(l.t)}</time><span class="tg t-${l.kind}">${esc(l.tag)}</span><span>${esc(l.msg)}</span></li>`).join('')}</ol></div>`;
}

/* ---------- reference ---------- */
function reference() {
  const tabs = pages('reference', [['how', 'How it works', '', 'Every system in plain words'], ['units', 'Our equipment', '', 'Everything in the arsenal'], ['threats', 'Threats', '', 'What the enemy sends'], ['air', 'Aircraft', '', 'Our flights']]);
  ui.refCat = ui.sub.reference;
  let body = '';
  if (ui.refCat === 'units') body = Object.entries(IC.UNITS).map(([k, d]) => `<div class="ref">${ui.sym(k, 68, 52)}<div><b>${esc(IC.fullName(d))}</b><p>${esc(d.desc)}</p>${kv([['Cost', `${U.money(d.cost)} · sets up in ${U.dur(d.build)}`], ['Reach', IC.typeRange(k) ? U.km(IC.typeRange(k)) : '–'], ['Mobility', IC.MOB_LABEL[d.mob]]].concat(d.mags ? [['Missiles', d.mags.map(m => `${IC.fullName(IC.MUN[m.mun])} (${IC.MUN[m.mun].seeker || ''})`).join(', ')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'threats') body = Object.entries(IC.THR).filter(([k]) => k !== 'pen').map(([k, d]) => `<div class="ref"><canvas data-thr="${k}" width="68" height="52"></canvas><div><b>${esc(IC.fullName(d))}</b><p>${esc(d.desc || '')}</p>${kv([['Class', esc(IC.KLASS[d.klass] || d.klass)], ['Speed', d.spd ? U.kmh(d.spd) : 'ballistic'], ['Altitude', d.alt ? U.alt(d.alt) : 'varies'], ['Warhead', d.dmg ? d.dmg : '–']].concat(d.cm ? [['Countermeasures', 'chaff, flares' + (d.notch ? ', notching' : '')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'air') body = Object.entries(IC.AIR_KIND).map(([k, d]) => `<div class="ref"><span class="badge friend" style="display:grid;place-items:center;height:2.6rem;border-radius:10px;background:var(--well)">${d.short}</span><div><b>${esc(d.name)}</b>${kv([['Aircraft per flight', d.n], ['Speed', U.kmh(d.spd)], ['Endurance', U.dur(d.endur)], ['Turnaround', U.dur(d.turn)], ['Needs a runway', d.runway ? 'yes' : 'no']])}</div></div>`).join('');
  else body = [
    ['Detect, classify, identify', 'VHF radars see far but only give positions. Radars with IFF read transponders and check them against filed flight plans. Type recognition (NCTR) tells a bomber from an airliner, but only inside a shorter range. A fighter flying up to look settles it. Weapons Tight fires only on identified hostiles.'],
    ['Sweeps and blinking', 'A rotating radar updates a track only when its beam passes. Between paints, the track coasts and blinks, and its uncertainty ring grows.'],
    ['Missile envelopes', 'Reach is longest head-on and shrinks against crossing or receding targets and down low. Semi-active and command-guided missiles need the battery radar on until impact. Aircraft fight back with chaff, flares and notching.'],
    ['Crew fatigue', 'Radars that radiate for hours while raids come in wear their crews out: slower reactions, slower reloads, more misses. Stand some down while others cover.'],
    ['Raids', 'The enemy raids in cycles. A build-up first: an intelligence warning about an hour out, a reconnaissance drone, drones probing the flanks, then a jammer taking station. Then the raid: drones and decoys a few minutes early to soak up missiles, cruise and ballistic missiles at the peak, stragglers after. Then a calm of a few hours: repair, reload, move batteries. Each raid ends with a report of what got through and why. Raids grow over the days, up to the big one.'],
    ['Routes and gaps', 'Cruise missiles and drones fly low, where a radar only sees as far as its horizon and not behind hills. The enemy plans them through the holes in the cover it knows about. Gap fillers, overlapping radars and moving batteries after they have been seen close the holes.'],
    ['Jamming', 'A jammer floods a radar along its own bearing: there the radar only sees what is close enough to burn through, about a third of the way to the jammer. The amber wedge on the map is its strobe: a direction, not a range. Two radars far apart put their strobes across each other and locate it. MR and LR missiles can home on a jammer without a track. Radars with better ECCM suffer less.'],
    ['Ballistic missiles', 'Only hit-to-kill rounds stop warheads. The upper tier (High-Altitude BMD) meets them 40 to 150 km up; BMD rounds in the LRSAM meet them below 35 km. A battery waits, then fires two interceptors at the point where they will meet the warhead; whatever the upper tier misses, the lower tier still gets a shot at.'],
    ['Call-in teams', 'Press G and click anywhere in our territory: a helicopter drops a shoulder-fired missile team there in seconds. It fights drones, helicopters and low jets for a few minutes, then is lifted out. Charges come back on a timer.'],
    ['Why a battery holds fire', 'A battery with hostiles near that is not firing says why under its symbol and in its panel: weapons status, identity, radar silent, below its horizon, masked by a hill, jammed on that bearing, out of its missiles\' height band or reach, or everything in reach already has interceptors on the way.'],
    ['Airports are built part by part', 'Runways, taxiways, aprons, terminals, hangars, shelters, fuel tanks, tower, fire station and radar are separate parts at real size. Aircraft taxi along the network you build: a runway with no exit near where aircraft stop blocks it for minutes, a runway with no taxiway to its ends makes every departure backtrack, and a single taxiway carries traffic one way at a time. The airport panel lists what is wrong.'],
    ['Building takes time, money and materials', 'Engineers build in stages: survey, earthworks, paving, markings and lights, then the opening. Each stage is paid as it runs, and paving uses concrete, asphalt and steel that lorries bring from the nearest town with industry: when the site runs out, work stops and the panel says why. Paving next to a runway closes it, unless you set the job to night work. Homes in the way are bought and cleared; their town will not thank you.'],
    ['Pavement', 'Asphalt is cheap and quick but heavy aircraft break it up; concrete carries every airliner; reinforced concrete craters less and is patched faster. Grass is for light aircraft only. A worn runway closes until it is resurfaced.'],
    ['Damage lands where it lands', 'A crater splits a runway into shorter strips; landing needs a strip long enough. A cut taxiway strands whatever is behind it. Burning fuel tanks set fire to tanks close by: spread them out. Aircraft in a hardened shelter usually survive; aircraft on an open stand usually do not.'],
    ['Airlines', 'Each airline wants different things: low fees, short taxi times, night slots, big terminals. Happy airlines ask for new routes; unhappy ones cut them. Prohibited zones keep airliners away from what matters, at the cost of longer flights.'],
    ['Radio and routes', 'Every airliner flies a filed route. One that leaves it flashes on the map: call it on the radio. A real airliner answers and turns back; something pretending to be one does not.'],
    ['Radar spectrum', 'Radars on the same band close together blind each other, and every extra radar on a crowded band costs more to keep. Spread them out, mix bands, or buy a spectrum plan.'],
    ['Money', IC.MONEY_GUIDE],
    ['Supply', IC.SUPPLY_GUIDE + ' Helicopters fly emergency loads to empty batteries.'],
    ['Towns', 'Towns pay taxes and power industry.']
  ].map(([t, d]) => `<div class="ref"><span></span><div><b>${t}</b><p>${d}</p></div></div>`).join('');
  return `${tabs}${body.split('<div class="ref">').filter(Boolean).map(x => `<div class="card"><div class="ref">${x}</div>`).join('')}`;
}

/* ---------- settings (also on the start screen) and the controls ---------- */
const onOff = (act, v, on, name, t) => `<button class="act tog ${on ? 'on' : ''}" data-act="${act}" ${v ? `data-v="${v}"` : ''} aria-pressed="${!!on}" title="${esc(t || '')}"><i></i>${name}</button>`;
IC.settingsHTML = function (st, start) {
  S = st;
  const P = S.cfg.pauseOn;
  return `<div class="card"><h3>Display</h3><div class="rl"><span class="lbl">Interface size</span>${seg('uiscale', ui.scale, [[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.4, '140%']])}</div>
      <div class="rl"><span class="lbl">Radar sweeps</span>${seg('radarFx', S.cfg.radarFx || 'subtle', [['off', 'Off', '', 'No sweep or blip animation'], ['subtle', 'Subtle', '', 'A small sweep hand at each radar'], ['full', 'Full', '', 'Sweeps across the whole range']])}</div>
      <div class="acts col">${onOff('cfg', 'slowmo', S.cfg.slowmo, 'Slow motion on big moments', 'The clock slows for a breath when something big happens on screen')}${onOff('cfg', 'shake', S.cfg.shake, 'Screen shake')}${onOff('cfg', 'bars', S.cfg.bars, 'Cinema bars on chapter cards')}${onOff('pauseRoom', '', ui.pauseRoom, 'Pause while a room is open')}</div></div>
    <div class="card"><h3>Hints</h3><div class="acts col">${onOff('hintsOn', '', ui.hintsOn, 'Show hints for new players', 'Short notes that point at things the first time you meet them')}</div><div class="acts"><button class="btn" data-act="hintsReset">Show every hint again</button></div><p class="hint">Hints point at a part of the screen the first time it matters. Each shows once; Got it puts it away.</p></div>
    <div class="card"><h3>Sound</h3><div class="slider"><span class="muted">Volume</span><input type="range" min="0" max="100" step="5" value="${Math.round(IC.sfx.vol * 100)}" data-act="vol" aria-label="Volume"><span class="num">${Math.round(IC.sfx.vol * 100)}%</span></div><div class="acts col">${onOff('mute', '', !(IC.sfx.muted || !IC.sfx.on), 'Sound')}</div></div>
    <div class="card"><h3>Pause the game when…<em>skip ahead (S) always stops on these</em></h3><div class="acts col">${[['event', 'A decision is waiting'], ['ballistic', 'A ballistic missile is launched'], ['raid', 'A major raid is forming'], ['lost', 'A unit or aircraft is lost'], ['base', 'An air base is hit'], ['city', 'A city is hit'], ['launch', 'Weapons are released in peacetime']].map(([k, n]) => onOff('pauseOn', k, ui.pauseOnIs(P, k), n)).join('')}</div></div>
    ${start ? '' : '<div class="card"><h3>Game</h3><div class="acts"><button class="act warn" data-act="restart">Quit to the main menu</button></div><p class="hint">This game is not kept.</p></div>'}`;
};
IC.keysHTML = () => `<div class="card"><h3>Map</h3>${kv([['Move the map', '<kbd>drag</kbd> or <kbd>←↑→↓</kbd>'], ['Zoom', '<kbd>wheel</kbd> or <kbd>+</kbd> <kbd>−</kbd>'], ['The capital', '<kbd>Home</kbd>'], ['Select', '<kbd>click</kbd> · <kbd>shift</kbd>+click adds'], ['Select several', '<kbd>shift</kbd>+drag a box · double-click picks all of a kind'], ['Order', '<kbd>right-click</kbd>: the card under the cursor says what it will do']])}</div>
  <div class="card"><h3>Time</h3>${kv([['Pause', '<kbd>Space</kbd>'], ['Speed 1× to 32×', '<kbd>1</kbd> to <kbd>6</kbd>'], ['Skip until something needs you', '<kbd>S</kbd>'], ['Back out of anything, or the menu', '<kbd>Esc</kbd>']])}</div>
  <div class="card"><h3>Rooms</h3>${kv(ui.ROOMS.map(([, n, k]) => [n, `<kbd>${k}</kbd>`]).concat([['Guide', '<kbd>?</kbd>']]))}</div>
  <div class="card"><h3>Selected unit</h3>${kv([['Radar on, ambush, silent', '<kbd>E</kbd>'], ['Weapons rules', '<kbd>W</kbd>'], ['Firing doctrine', '<kbd>Q</kbd>'], ['Move', '<kbd>M</kbd>'], ['Resupply by air', '<kbd>H</kbd>'], ['Repair', '<kbd>P</kbd>'], ['Back to the reserve', '<kbd>X</kbd>'], ['Fire mission', '<kbd>F</kbd>'], ['Call in a missile team', '<kbd>G</kbd>']])}</div>
  <div class="card"><h3>Selected track</h3>${kv([['Send a fighter to look', '<kbd>V</kbd>'], ['Assign the best battery', '<kbd>B</kbd>']])}</div>
  <div class="card"><h3>Airport builder</h3>${kv([['Place points', '<kbd>click</kbd>'], ['Build', 'click the last point again, or <kbd>Enter</kbd>'], ['Take a point back', '<kbd>right-click</kbd> or <kbd>Backspace</kbd>'], ['Turn', '<kbd>R</kbd> · <kbd>shift</kbd>+<kbd>R</kbd> 90°'], ['Round corners', '<kbd>F</kbd>'], ['Undo', '<kbd>Ctrl</kbd>+<kbd>Z</kbd>']])}</div>`;
function settings() { return IC.settingsHTML(S) + IC.keysHTML(); }

})(window.IC);
