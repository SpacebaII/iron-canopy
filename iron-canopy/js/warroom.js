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
  ui.setHTML($('wrTabs'), ui.ROOMS.filter(([k]) => ui.roomOk(k)).map(([k, n, key]) => `<button data-act="room" data-v="${k}" aria-pressed="${tab === k}">${n}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join(''));
  $('wrRun').textContent = S.paused ? 'Paused' : `Running at ${S.skip ? 'skip' : S.speed + '×'} · Space pauses`;
  const f = { aviation, staff, economy, air, army, logi, industry, intel, research, journal, reference, settings }[tab];
  ui.setHTML($('wrBody'), f ? f() : '');
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
  return `<div class="card wide"><h3>Route requests<em>${A.requests.length} waiting</em></h3>${reqs ? `<div class="list">${reqs}</div>` : '<p class="hint">No requests. Happy airlines ask for more; airlines ask faster when they are happy and the airports can take their aircraft.</p>'}${S.story && S.story.del.routes ? '<p class="hint">The Route Planning Office approves feasible requests for you.</p>' : ''}</div>
    <div class="card"><h3>Airlines<em>average ${Math.round(IC.avgSat(S))}%</em></h3><div class="list">${als}</div></div>
    <div class="card"><h3>Revenue per hour<em>${U.money(tot)}/h</em></h3><table class="t"><tr><td>Landing fees</td><td class="r ok">+${L.land.toFixed(1)}</td></tr><tr><td>Passenger charges</td><td class="r ok">+${L.pax.toFixed(1)}</td></tr><tr><td>Cargo</td><td class="r ok">+${L.cargo.toFixed(1)}</td></tr><tr><td>Overflights</td><td class="r ok">+${L.over.toFixed(1)}</td></tr><tr><td>Airport upkeep</td><td class="r hostile">−${IC.avUpkeep(S).toFixed(1)}</td></tr></table>
      ${kv([['Passengers today', Math.round(A.day.pax).toLocaleString('en-US')], ['Flights today', A.day.flights], ['Diversions today', A.day.div]])}</div>
    <div class="card wide"><h3>Airports<em>click to open</em></h3><table class="t"><tr><th>Airport</th><th class="r">Pax/h</th><th class="r">Stands</th><th class="r">Taxi</th><th class="r">Delay</th><th class="r">Diversions</th><th class="r">Problems</th></tr>${apts}</table><div class="acts"><button class="btn" data-act="foundMode">+ Found a new airport · ${U.money(IC.FOUND_COST)}</button></div></div>
    <div class="card wide"><h3>Routes<em>${A.routes.filter(r => r.st === 'active').length} active</em></h3><table class="t"><tr><th>Airline</th><th>Route</th><th>Aircraft</th><th class="r">Flights</th><th class="r">Revenue</th></tr>${routes}</table></div>
    <div class="card"><h3>Prohibited zones<em>routes are ${U.pct(det - 1)} longer</em></h3>${zones ? `<div class="list">${zones}</div>` : '<p class="hint">None. Airliners fly straight over everything, including our bases.</p>'}<div class="acts"><button class="btn" data-act="zoneMode">+ Draw a prohibited zone</button></div><p class="hint">Airliners route around zones: they cannot overfly what matters, and anything squawking as an airliner that enters one is off its route at once. Airlines dislike the detours.</p></div>
    ${airspace()}`;
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

/* ---------- the staff: career, goals, delegates, requests ---------- */
function staff() {
  const st = S.story, A = IC.ACTS[st.act];
  const goals = st.goals.map((g, i) => `<button class="li goalrow ${g.done ? 'done' : ''}" data-act="goal" data-v="${i}"><b>${g.done ? '✓ ' : ''}${esc(g.text)}</b>${!g.done && g.prog ? `<small>${esc(g.prog())}</small>` : ''}</button>`).join('');
  const dels = Object.entries(IC.DELEGATES).map(([k, D]) => {
    const avail = st.act >= D.act, on = st.del[k], hired = st.hired && st.hired.has(k);
    return `<div class="li"><b>${esc(D.name)}</b><small>${esc(D.desc)} · ${U.money(D.cost)}/h${!hired && D.cp ? ` · ${D.cp} CP to appoint` : ''}${avail ? '' : ` · available in ${IC.ACTS[D.act].name}`}</small><span class="la"><button class="btn sm ${on ? 'primary' : ''}" data-act="delegate" data-v="${k}" ${!avail || (!hired && !on && st.cp < D.cp) ? 'disabled' : ''}>${on ? 'On duty' : hired ? 'Off' : 'Appoint'}</button></span></div>`;
  }).join('');
  const reqs = IC.REQUESTS.map(R => {
    const got = st.bought.has(R.id), avail = st.act >= R.act;
    return `<div class="li"><b>${esc(R.name)}</b><small>${esc(R.desc)} · ${R.cp} CP + ${U.money(R.cost)}${avail ? '' : ` · from ${IC.ACTS[R.act].name}`}</small><span class="la"><button class="btn sm" data-act="cpReq" data-v="${R.id}" ${got || !avail || st.cp < R.cp || S.budget < R.cost ? 'disabled' : ''}>${got ? 'Granted' : 'Request'}</button></span></div>`;
  }).join('');
  const log = st.log.slice().reverse().slice(0, 12).map(l => `<div class="li"><b>${esc(l.title)}</b><small>${U.clock(l.t)} · ${esc(l.choice)}</small></div>`).join('');
  const docs = Object.keys(st.doc).filter(k => st.doc[k]).map(k => `<span class="chip">${esc({ transparency: 'Transparency', quiet: 'Discretion', forward: 'Forward defence', depth: 'Defence in depth', cheapGuns: 'Airport guns' }[k] || k)}</span>`).join('');
  const acts = [1, 2, 3, 4].map(n => `<div class="actstep ${n < st.act ? 'done' : n === st.act ? 'cur' : ''}"><small>${IC.ACTS[n].name}</small><b>${esc(IC.ACTS[n].title)}</b><span>${esc(IC.ACTS[n].role)}</span></div>`).join('');
  return `<div class="card wide"><h3>Career<em>${esc(st.role)}</em></h3><div class="acts4">${acts}</div>
      <div class="bars"><span>Confidence</span>${bar(st.standing / 100)}<span>${Math.round(st.standing)}</span><span>Tension</span>${bar((S.tension || 0) / 100, 'var(--hostile)')}<span>${Math.round(S.tension || 0)}</span></div>
      ${kv([['Command points', `<b class="amber">${st.cp}</b> · earned from goals and hard decisions`], ['Doctrine', docs || '<span class="muted">none yet</span>']])}</div>
    <div class="card"><h3>Goals<em>${esc(A.name)}: ${esc(A.title)}</em></h3><div class="list">${goals}</div><p class="hint">Finishing goals moves the story on and earns command points. The story also moves on by itself if you take too long.</p></div>
    <div class="card"><h3>Delegates<em>${U.money(IC.staffCost(S))}/h</em></h3><div class="list">${dels}</div></div>
    <div class="card"><h3>Requests<em>spend command points</em></h3><div class="list">${reqs}</div></div>
    <div class="card"><h3>Decisions</h3>${log ? `<div class="list">${log}</div>` : '<p class="hint">None yet.</p>'}</div>`;
}

/* ---------- air ---------- */
function air() {
  const tasks = S.ato.map(t => {
    const cov = S.air.filter(a => a.task === t && !a.dead && a.state !== 'rtb').length;
    return `<div class="li"><b>${esc(t.name)}</b><small>${cov} on task · wants ${t.want}${IC.TASK_KIND[t.type].front && !t.front.active ? ' · front quiet' : ''}</small><span class="la"><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="-1">−</button><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="1">+</button><button class="btn sm" data-act="tdel" data-id="${t.id}">✕</button></span></div>`;
  }).join('');
  const add = [`<button class="btn" data-act="taskPoint" data-v="cap">+ Combat air patrol</button>`, `<button class="btn" data-act="taskPoint" data-v="aew">+ Early warning orbit</button>`, `<button class="btn" data-act="taskPoint" data-v="isr">+ Recon area</button>`]
    .concat(S.story && S.story.act < 4 ? [] : S.fronts.map(f => `<button class="btn" data-act="taskFront" data-v="cas" data-id="${f.key}">+ Close air support · ${esc(f.name)}</button><button class="btn" data-act="taskFront" data-v="interdict" data-id="${f.key}">+ Interdiction · ${esc(f.name)}</button>`)).join('');
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
        else if (k === 'ucav') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="isr" ${why ? 'disabled' : ''}>Recon</button><button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="hstrike" ${why ? 'disabled' : ''}>Attack</button>`;
        else if (k === 'atk') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="hstrike" ${IC.missionOk(S, r, 'hstrike') ? 'disabled' : ''}>Attack</button>`;
        else if (k === 'heli') btn = '<span class="muted" style="font-size:.78rem">lifts: select a brigade</span>';
      }
      const load = r.kind === 'ftr' && r.st !== 'air' && (!S.story || S.story.act >= 3) ? seg('loadout', r.load, [['aa', 'A2A'], ['strike', 'Strike']], r.id) : '';
      const qra = r.kind === 'ftr' ? `<button class="btn sm ${r.qra ? 'primary' : ''}" data-act="qra" data-rid="${r.id}" title="Crews on alert start engines in half the time">${r.qra ? 'On alert' : 'Alert'}</button>` : '';
      const block = r.st === 'ready' && b.parts ? IC.milLaunchBlock(S, b, r) : '';
      return `<div class="li"><b>${esc(r.name)} <span class="muted">· ${esc(IC.AIR_KIND[r.kind].name)} ×${r.n}</span></b><small>${state}${r.ent && r.ent.gnd ? ' · taxiing' : ''}${r.slot || r.st === 'air' ? '' : ' · <span class="amber">parked in the open</span>'}${block ? ` · <span class="hostile">${esc(block)}</span>` : ''}</small><span class="la">${qra}${load}${btn}</span></div>`;
    }).join('');
    const buy = b.infra && (!S.story || S.story.act >= 3) ? ['ftr', 'atk', 'ucav', 'isr', 'heli'].map(k => `<button class="btn sm" data-act="buyAir" data-v="${k}" data-id="${b.id}" ${S.budget < IC.AIR_KIND[k].buy ? 'disabled' : ''}>+ ${IC.AIR_KIND[k].short} ${U.money(IC.AIR_KIND[k].buy)}</button>`).join('') : '';
    return `<div class="card"><h3>${esc(b.name)}<em>${st.runway ? rs.length + ' flights' : '<span class="hostile">runway closed</span>'}</em></h3><div class="list">${rows || '<p class="hint">No aircraft.</p>'}</div>${buy ? `<div class="acts">${buy}</div>` : ''}<div class="acts"><button class="btn sm" data-act="selInfra" data-id="${b.id}">Open base</button></div></div>`;
  }).join('');
  const storyNote = S.story && S.story.act < 3 ? `<p class="hint">In peacetime nobody fires without your order: Weapons are on Hold. A fighter sent to intercept flies up, identifies and escorts. To shoot, select the track and order the escort to fire.</p>` : '';
  return `<div class="card wide"><h3>Standing tasks<em>squadrons rotate aircraft to keep these covered</em></h3>${tasks ? `<div class="list">${tasks}</div>` : '<p class="hint">No standing tasks. Add one and the air wing keeps it covered around the clock.</p>'}<div class="acts">${add}</div>${storyNote}</div>${cards}`;
}

/* ---------- army ---------- */
function army() {
  const cards = S.fronts.map(f => {
    const us = S.gunits.filter(g => g.side === 'us' && g.front === f);
    const them = S.gunits.filter(g => g.side === 'them' && g.front === f && g.known).length;
    const secs = f.sectors.map((s, i) => {
      const d = (f.pts[s.i0].d + f.pts[s.i1].d) / 2, r = s.F / Math.max(0.01, s.E);
      const ours = us.filter(g => g.sector === i && g.order !== 'refit' && g.order !== 'defend');
      const fort = ours.length ? Math.max(...ours.map(g => g.fort)) : 0;
      return `<tr class="click" data-act="flySec" data-id="${f.key}" data-v="${i}"><td>${s.name}${s.eAttack ? (s.probe ? ' <span class="amber">probe</span>' : ' <span class="hostile">ASSAULT</span>') : ''}${s.usAttack ? ' <span class="friend">attacking</span>' : ''}</td><td class="r ${r >= 1.2 ? 'friend' : r >= 0.8 ? 'amber' : 'hostile'}">${f.active ? (r >= 10 ? '10+' : r.toFixed(1)) : '–'}</td><td class="r ${d > 5 ? 'hostile' : d < -5 ? 'friend' : ''}">${d > 5 ? '−' + U.km(d) : d < -5 ? '+' + U.km(-d) : '0'}</td><td class="r">${U.pct(fort)}</td><td>${ours.map(g => g.g.short).join(', ') || '<span class="hostile">empty</span>'}</td></tr>`;
    }).join('');
    const forms = us.map(g => `<button class="li" data-act="selg" data-id="${g.id}"><b>${esc(g.name)}${g.manual ? ' ◆' : ''}</b><small>${g.g.short} · ${IC.GORDERS[g.order] ? IC.GORDERS[g.order].name : g.order}${g.sector >= 0 ? ' ' + f.sectors[g.sector].name : ''}${g.obj ? ' · ' + esc(g.obj.name) : ''} · str ${Math.round(g.str)}% · sup ${Math.round(g.sup)}% · AT ${Math.round(g.kit.atgm)}</small></button>`).join('');
    const initials = f.cmd.name.replace('Gen. ', '').split(' ').map(x => x[0]).join('');
    const raise = S.mobil >= 1 ? `<div class="acts">${['inf', 'mech', 'arm', 'art'].map(t => `<button class="btn sm" data-act="raise" data-id="${f.key}" data-v="${t}" ${IC.canRaise(S, t) ? '' : 'disabled'} title="${esc(IC.GTYPES[t].desc)}">+ ${IC.GTYPES[t].short} ${U.money(IC.GTYPES[t].cost)}</button>`).join('')}</div><p class="hint">New brigades cost 40 manpower and train up before deploying. ${S.gunits.filter(g => g.side === 'us').length}/${IC.MAX_BRIGADES} brigades.</p>` : '<p class="hint">Declare mobilization (Industry) to raise new brigades.</p>';
    return `<div class="card"><h3>${esc(f.name)}<em class="${f.active ? 'hostile' : ''}">${f.active ? 'ACTIVE' : 'quiet'} · vs ${esc(f.enemy)}</em></h3>
      <div class="cmdrow"><span class="av CMD">${initials}</span><div><b>${esc(f.cmd.name)}</b><div class="hint">${esc(IC.TRAITS[f.cmd.trait].name)}: ${esc(IC.TRAITS[f.cmd.trait].desc)}</div></div></div>
      <div class="rl"><span class="muted" style="font-size:.8rem;width:7rem">Stance</span>${seg('stance', f.stance, [['defend', 'Hold', '', 'Dig in everywhere'], ['active', 'Active defense', '', 'Counterattack lost ground with armor'], ['offensive', 'Offensive', 'amb', 'Attack where we have the edge']], f.key)}</div>
      <div class="rl"><span class="muted" style="font-size:.8rem;width:7rem">Supply priority</span>${seg('spri', f.supplyPri, [[0, 'Low'], [1, 'Normal'], [2, 'High']], f.key)}</div>
      <div class="slider"><span class="muted">Air support share</span><input type="range" min="0" max="100" step="5" value="${Math.round(f.airShare * 100)}" data-act="ashare" data-id="${f.key}" aria-label="Air support share for ${esc(f.name)}"><span class="num">${U.pct(f.airShare)}</span></div>
      <table class="t"><tr><th>Sector</th><th class="r">Ratio</th><th class="r">Ground</th><th class="r">Dug in</th><th>Holding</th></tr>${secs}</table>
      <h3 class="sh">Brigades <em>${us.length} ours · ${them} enemy seen</em></h3><div class="list">${forms}</div>${raise}</div>`;
  }).join('');
  return `<div class="card wide"><h3>Manpower<em>${Math.floor(S.manpower)} available · +${IC.MOBIL[S.mobil].man}/h</em></h3><p class="hint">Manpower rebuilds brigades at the rear and rides helicopters forward as replacements. Mobilization raises the rate.</p></div>${cards}`;
}

/* ---------- logistics ---------- */
function logi() {
  const depots = IC.depots(S);
  const rows = IC.STOCK_KEYS.filter(k => k === 'SUP' || k === 'ATG' || IC.hasTech(S, IC.MUN_TECH[k])).map(k => {
    let dep = 0, other = 0, units = 0, tr = 0;
    for (const d of depots) dep += d.inv[k] || 0;
    for (const i of S.infra) if (i.inv) other += i.inv[k] || 0;
    for (const u of S.units) for (const m of u.mags) if (m.mun === k) { units += m.mag + m.store; tr += m.inc; }
    for (const j of S.jobs) if (j.mun === k && j.state === 'active' && !j.mag) tr += j.qty;
    return `<tr><td>${esc(IC.MUN[k].name)}</td><td class="r">${Math.floor(dep)}</td><td class="r">${Math.floor(other)}</td><td class="r">${k === 'SUP' || k === 'ATG' ? '–' : units}</td><td class="r">${tr || '–'}</td></tr>`;
  }).join('');
  const dcards = depots.map(d => {
    const vs = S.vehicles.filter(v => v.home === d);
    const dem = IC.depotDemand(S)[d.id] || {};
    const low = Object.keys(dem).filter(k => (d.inv[k] || 0) + (d.inc[k] || 0) < dem[k] * 0.5);
    return `<div class="card"><h3>${esc(d.name)}<em>${d.central ? 'national stock' : 'serves ' + U.km(d.reach || 1400)}</em></h3>
      ${kv([['Trucks', `${vs.filter(v => v.state !== 'idle').length}/${vs.length} busy`], ['Low on', low.length ? low.join(', ') : 'nothing']])}
      ${d.central ? '' : seg('profileD', d.profile || 'balanced', Object.entries(IC.PROFILES).map(([k, p]) => [k, p.name, '', p.desc]), d.id)}
      <div class="acts"><button class="btn sm" data-act="buyTruckAt" data-id="${d.id}" ${S.budget < 12 ? 'disabled' : ''}>+ Truck company ₭12M</button><button class="btn sm" data-act="selu" data-id="${d.id}">Show</button></div></div>`;
  }).join('');
  const convoys = S.vehicles.filter(v => v.job).slice(0, 14).map(v => `<button class="li" data-act="selv" data-id="${v.id}"><b>${esc(v.name)}</b><small>${esc(v.job.label)} · ${v.state === 'toDest' ? 'en route' : v.state}</small></button>`).join('');
  const helis = S.air.filter(a => a.job).map(a => `<button class="li" data-act="selAirE" data-id="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.job.label)}</small></button>`).join('');
  return `<div class="card wide"><h3>National stockpile</h3><table class="t"><tr><th>Item</th><th class="r">Depots</th><th class="r">Plants / airports</th><th class="r">At units</th><th class="r">Moving</th></tr>${rows}</table>
    <p class="hint">Depots serve units inside their ring and restock from the central depot; factories push output to whichever depot is short. Put a forward depot where the fighting is, give it trucks, and pick its stock profile.</p></div>
    ${dcards}
    <div class="card"><h3>Convoys on the road<em>${S.vehicles.filter(v => v.job).length} active</em></h3>${convoys ? `<div class="list">${convoys}</div>` : '<p class="hint">No deliveries under way.</p>'}</div>
    <div class="card"><h3>Helicopters and airlift</h3>${helis ? `<div class="list">${helis}</div>` : '<p class="hint">Nothing flying. Select a brigade for a helicopter lift, or a battery for air resupply.</p>'}</div>`;
}

/* ---------- industry and economy ---------- */
function industry() {
  const L = S.ledger || {};
  const facs = S.infra.filter(i => i.kind === 'factory').map(f => {
    const act = f.active.map(a => `<span class="chip">${a.mun} ${U.pct(a.prog)}</span>`).join('') + f.queue.map(x => `<span class="chip">${x.qty - x.started}× ${x.mun}</span>`).join('');
    const orders = IC.MUN_ORDER.filter(k => IC.hasTech(S, IC.MUN_TECH[k])).map(k => { const M = IC.MUN[k]; return `<div class="li"><b>${esc(M.name)}</b><small>${U.money(M.cost)} each · ${U.dur(M.prod)} per line</small><span class="la"><button class="btn sm" data-act="prod" data-id="${f.id}" data-v="${k}:1" ${S.budget < M.cost || f.offline ? 'disabled' : ''}>+1</button><button class="btn sm" data-act="prod" data-id="${f.id}" data-v="${k}:4" ${S.budget < M.cost * 4 || f.offline ? 'disabled' : ''}>+4</button></span></div>`; }).join('');
    return `<div class="card"><h3>${esc(f.name)}<em>${f.offline ? '<span class="hostile">knocked out</span>' : `${f.active.length}/${IC.factoryLines(S, f)} lines · ${Math.floor(f.inv.SUP || 0)} supply waiting`}</em></h3>${act ? `<div class="chips">${act}</div>` : ''}<div class="list">${orders}</div></div>`;
  }).join('');
  const imp = IC.MUN_ORDER.filter(k => IC.hasTech(S, IC.MUN_TECH[k])).map(k => { const c = IC.importPrice(S, k, 4); return `<div class="li"><b>${esc(IC.MUN[k].name)}</b><small>4 for ${U.money(c)}</small><span class="la"><button class="btn sm" data-act="import" data-v="${k}:4" ${S.budget < c ? 'disabled' : ''}>Import</button></span></div>`; }).join('');
  const pend = S.imports.map(i => `<span class="chip">${i.qty}× ${i.mun} ~${U.hhmm(i.eta)}</span>`).join('');
  const orders = S.orders.map(o => `<div class="li"><b>${esc(IC.UNITS[o.type].name)}</b><small>${o.started ? `${U.pct(o.prog)} · ${U.dur((1 - o.prog) * o.dur)} left` : 'queued'}</small><span class="la"><button class="btn sm" data-act="cancelOrder" data-id="${o.id}">✕</button></span></div>`).join('');
  const mob = IC.MOBIL.map((m, i) => `<button class="li" data-act="mobil" data-v="${i}" ${S.mobil === i ? 'style="background:rgba(111,210,255,.16)"' : ''}><b>${esc(m.name)}${S.mobil === i ? ' · current' : ''}</b><small>${esc(m.desc)}</small></button>`).join('');
  const bonds = S.time - S.bondsT >= 86400;
  const cities = IC.cities(S).slice().sort((a, b) => b.ind - a.ind).map(c => `<tr class="click" data-act="selInfra" data-id="${c.id}"><td>${esc(c.name)}</td><td class="r">${c.pop}k</td><td class="r">${c.ind}</td><td class="r">${U.pct(c.hp / c.max)}</td><td class="${c.owner === 'enemy' ? 'hostile' : c.besieged ? 'suspect' : ''}">${c.owner === 'enemy' ? 'occupied' : c.besieged ? 'surrounded' : 'ours'}</td></tr>`).join('');
  return `<div class="card"><h3>Budget per hour<em>${U.money(S.budget)} in the treasury</em></h3><table class="t">
      <tr><td>Taxes</td><td class="r ok">+${(L.tax || 0).toFixed(1)}</td></tr><tr><td>Airports</td><td class="r ok">+${(L.apt || 0).toFixed(1)}</td></tr><tr><td>Allied support</td><td class="r ok">+${(L.aid || 0).toFixed(1)}</td></tr><tr><td>State revenue</td><td class="r ok">+${(L.base || 0).toFixed(1)}</td></tr>
      <tr><td>Air defense upkeep</td><td class="r hostile">−${(L.upAD || 0).toFixed(1)}</td></tr><tr><td>Air force upkeep</td><td class="r hostile">−${(L.upAir || 0).toFixed(1)}</td></tr><tr><td>Army upkeep</td><td class="r hostile">−${(L.upG || 0).toFixed(1)}</td></tr></table>
      <div class="acts"><button class="act" data-act="bonds" ${bonds ? '' : 'disabled'}>War bonds · +${U.money(200 + S.mobil * 80)}</button></div><p class="hint">${bonds ? 'Cash now, a small cost to morale. Once a day.' : `Bonds available again in ${U.dur(86400 - (S.time - S.bondsT))}.`}</p></div>
    <div class="card"><h3>Mobilization</h3><div class="list">${mob}</div></div>
    <div class="card"><h3>Equipment on order<em>${S.orders.filter(o => o.started).length}/${IC.slots(S)} slots</em></h3>${orders ? `<div class="list">${orders}</div>` : '<p class="hint">Nothing on order. Order from the arsenal: several items build at once.</p>'}</div>
    ${facs}
    <div class="card"><h3>Foreign purchases<em>price falls as allied support rises</em></h3>${pend ? `<div class="chips">${pend}</div>` : ''}<div class="list">${imp}</div></div>
    <div class="card"><h3>Cities and industry<em>national industry ${U.pct(IC.industry(S))}</em></h3><table class="t"><tr><th>City</th><th class="r">Pop</th><th class="r">Ind</th><th class="r">Intact</th><th>Status</th></tr>${cities}</table></div>`;
}

/* ---------- the economy: the weekly statement, loans, passengers, growth, trade and roads ---------- */
function economy() {
  const E = S.econ; if (!E) return '<div class="card wide"><p class="hint">No economy in this mode.</p></div>';
  const wk = IC.weekStatement(S, 0), last = IC.weekStatement(S, 1);
  const val = v => `<td class="r ${v >= 0 ? 'ok' : 'hostile'}">${v >= 0 ? '+' : '−'}${U.money(Math.abs(v)).replace('−', '')}</td>`;
  const keys = [...new Set((wk ? wk.lines : []).concat(last ? last.lines : []).map(l => l.k))];
  const get = (st, k) => { const l = st && st.lines.find(x => x.k === k); return l ? l.v : 0; };
  const rows = keys.sort((a, b) => get(wk, b) - get(wk, a)).map(k => `<tr><td>${esc(IC.STATEMENT[k] || k)}</td>${val(get(wk, k))}${last ? val(get(last, k)) : ''}</tr>`).join('');
  const stmt = `<div class="card wide"><h3>Weekly statement<em>${U.money(S.budget)} in the treasury</em></h3>
    ${wk ? `<table class="t"><tr><th>${wk.days >= 7 ? `Week ${wk.week}` : wk.days === 1 ? `Day ${wk.from} (week ${wk.week})` : `Days ${wk.from}–${wk.from + wk.days - 1} (week ${wk.week})`}</th><th class="r">This week</th>${last ? '<th class="r">Last week</th>' : ''}</tr>${rows}
      <tr><td><b>Income</b></td>${val(wk.income)}${last ? val(last.income) : ''}</tr><tr><td><b>Spending</b></td>${val(wk.spend)}${last ? val(last.spend) : ''}</tr><tr><td><b>Change in the treasury</b></td>${val(wk.net)}${last ? val(last.net) : ''}</tr></table>` : ''}
    <p class="hint">Airline fees rise with passengers, and passengers with the cities your airports serve. Taxes follow each city's size and prosperity${S.story && S.story.act < 3 ? '; in this job they go to the Treasury, not to your budget' : ''}.</p></div>`;
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
  const cities = IC.cities(S).filter(c => c.air).sort((a, b) => b.pop - a.pop).map(c => { const g = c.gr ? c.gr.tot : 0; const cut = c.cuts && c.cuts.length; return `<tr class="click" data-act="selInfra" data-id="${c.id}"><td>${esc(c.name)}</td><td class="r">${c.pop}k</td><td class="r ${g > 0.05 ? 'ok' : g < -0.05 ? 'hostile' : ''}">${Math.abs(g) < 0.005 ? '' : g > 0 ? '+' : '−'}${Math.abs(g).toFixed(2)}%</td><td class="r">${U.pct(c.air.score)}</td><td class="r">${Math.round(c.air.demand).toLocaleString('en-US')}</td><td class="r ${cut ? 'hostile' : ''}">${U.pct(c.rc / Math.max(1, c.rc0))}${cut ? ' · cut' : ''}</td></tr>`; }).join('');
  const growth = `<div class="card wide"><h3>Cities<em>growth a day</em></h3><table class="t"><tr><th>City</th><th class="r">Pop</th><th class="r">Growth</th><th class="r">Air service</th><th class="r">Flyers a day</th><th class="r">Road links</th></tr>${cities}</table>
    <p class="hint">Click a city for the reasons. A new airport or road within reach of a city that has none is the biggest lift you can give it.</p></div>`;
  // industry
  const inds = E.inds.map(i => `<div class="li"><b>${esc(i.name)} <span class="muted">· ${esc(IC.INDUSTRY[i.kind].goods)}</span></b><small>${U.money(i.out * 24)} a day of ${U.money(i.cap * 24)} it could sell · ${IC.indWhy(S, i).map(esc).join(' ')}</small></div>`).join('');
  const trade = `<div class="card"><h3>Industry and trade<em>trade taxes ${U.money(IC.tradeTax(S))}/h</em></h3><div class="list">${inds}</div>
    <p class="hint">Remote industries sell more with a fast road to a city and an airport with cargo flights (freighters, or the holds of wide-bodies) within ${IC.GROWTH.indCatch} h. A cargo terminal helps.</p></div>`;
  // roads
  const build = Object.entries(IC.ROADS).map(([k, R]) => `<button class="act" data-act="roadMode" data-v="${k}" aria-pressed="${!!(S.mode2 && S.mode2.kind === 'road' && S.mode2.cls === k)}" title="${U.money(R.perKm)} a km on flat ground, ${U.money(R.bridge)} a bridge, about ${R.kmh} km built an hour">${esc(R.name)} · ${U.money(R.perKm)}/km</button>`).join('');
  const works = E.works.map(w => `<div class="li"><b>${esc(w.name)}</b><small>${esc(w.stage)} · ${U.pct(w.prog)} · open in ${U.dur((1 - w.prog) * w.hours * 3600)} · ${w.km.toFixed(1)} km, ${U.money(w.cost)}</small></div>`).join('');
  const cuts = S.world.edges.filter(e => e.cut).map(e => `<div class="li"><b class="hostile">${esc(e.cutName)}</b><small>reopens in about ${U.dur(Math.max(0, (0.6 - e.cond) / (e.cls === 'hw' ? 0.1 : 0.14)) * 3600)}</small></div>`).join('');
  const roads = `<div class="card"><h3>Roads<em>${E.works.length} under construction</em></h3><div class="acts">${build}</div>${works ? `<div class="list">${works}</div>` : ''}${cuts ? `<div class="list">${cuts}</div>` : ''}
    <p class="hint">Click points on the map; the ends join the nearest road or junction. Hills mean cuttings, rivers bridges. A new road shortens trips between the places it joins: more trade and growth, faster convoys. A crater closes a road until engineers fill it.</p></div>`;
  return stmt + pax + growth + loans + roads + trade;
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

/* ---------- research ---------- */
function research() {
  const T = S.tech;
  const slots = T.slots.map((s, i) => { if (!s) return `<div class="li"><b>Slot ${i + 1}</b><small>idle</small></div>`; const t = IC.TECH.find(x => x.id === s.id); return `<div class="li"><b>${esc(t.name)}</b><small>${U.pct(s.prog)} · ${U.dur((1 - s.prog) * t.time)} left</small></div>`; }).join('');
  return `<div class="card wide"><h3>Research<em>two projects at a time</em></h3><div class="list">${slots}</div></div>` + IC.TECH_CATS.map(c => `<div class="card"><h3>${c.name}</h3><div class="tech">${IC.TECH.filter(t => t.cat === c.id).map(t => {
    const done = T.done.has(t.id), cur = IC.researching(S, t.id), reqOk = t.req.every(r => T.done.has(r)), free = T.slots.some(s => !s);
    const act = done ? '<span class="ok">Done</span>' : cur ? `<span class="amber">${U.pct(cur.prog)}</span>` : !reqOk ? `<span>Needs ${t.req.filter(r => !T.done.has(r)).map(r => esc(IC.TECH.find(x => x.id === r).name)).join(', ')}</span>` : `<button class="btn sm" data-act="research" data-v="${t.id}" ${!free || S.budget < t.cost ? 'disabled' : ''}>Research</button>`;
    return `<div class="tnode ${done ? 'done' : cur ? 'cur' : reqOk ? '' : 'locked'}"><b>${esc(t.name)}</b><p>${esc(t.desc)}</p><div class="meta"><span>${U.money(t.cost)} · ${U.dur(t.time)}</span>${act}</div>${cur ? `<div class="prog"><i style="width:${cur.prog * 100}%"></i></div>` : ''}</div>`;
  }).join('')}</div></div>`).join('');
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
  const tabs = seg('refcat', ui.refCat, [['units', 'Our equipment'], ['threats', 'Threats'], ['air', 'Aircraft'], ['ground', 'Ground'], ['how', 'How it works']]);
  let body = '';
  if (ui.refCat === 'units') body = Object.entries(IC.UNITS).map(([k, d]) => `<div class="ref">${ui.sym(k, 68, 52)}<div><b>${esc(d.name)}</b><p>${esc(d.desc)}</p>${kv([['Cost', `${U.money(d.cost)} · ${U.dur(d.lead)} to build`], ['Reach', IC.typeRange(k) ? U.km(IC.typeRange(k)) : '–'], ['Mobility', IC.MOB_LABEL[d.mob]]].concat(d.mags ? [['Missiles', d.mags.map(m => `${IC.MUN[m.mun].name} (${IC.MUN[m.mun].seeker || ''})`).join(', ')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'threats') body = Object.entries(IC.THR).filter(([k]) => k !== 'pen').map(([k, d]) => `<div class="ref"><canvas data-thr="${k}" width="68" height="52"></canvas><div><b>${esc(d.name)}</b>${kv([['Class', esc(IC.KLASS[d.klass] || d.klass)], ['Speed', d.spd ? U.kmh(d.spd) : 'ballistic'], ['Altitude', d.alt ? U.alt(d.alt) : 'varies'], ['Warhead', d.dmg ? d.dmg : '–']].concat(d.cm ? [['Countermeasures', 'chaff, flares' + (d.notch ? ', notching' : '')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'air') body = Object.entries(IC.AIR_KIND).map(([k, d]) => `<div class="ref"><span class="badge friend" style="display:grid;place-items:center;height:2.6rem;border-radius:10px;background:var(--well)">${d.short}</span><div><b>${esc(d.name)}</b>${kv([['Aircraft per flight', d.n], ['Speed', U.kmh(d.spd)], ['Endurance', U.dur(d.endur)], ['Turnaround', U.dur(d.turn)], ['Needs a runway', d.runway ? 'yes' : 'no']])}</div></div>`).join('');
  else if (ui.refCat === 'ground') body = Object.entries(IC.GTYPES).map(([k, g]) => `<div class="ref"><span class="badge friend" style="display:grid;place-items:center;height:2.6rem;border-radius:10px;background:var(--well)">${g.short}</span><div><b>${esc(g.name)}</b><p>${esc(g.desc)}</p>${kv([['Attack', g.att], ['Defense', g.def], ['Cost', U.money(g.cost)]])}</div></div>`).join('') + `<div class="ref"><span></span><div><b>Terrain</b><p>Defenders gain: towns +50%, rivers +30%, forest +25%, hills +20%. Infantry does best in towns and forest; armor worst.</p></div></div>` + Object.entries(IC.GORDERS).map(([k, o]) => `<div class="ref"><span class="badge" style="display:grid;place-items:center;height:2.6rem;border-radius:10px;background:var(--well)">${o.key}</span><div><b>${o.name}</b><p>${esc(o.desc)}</p></div></div>`).join('');
  else body = [
    ['Detect, classify, identify', 'VHF radars see far but only give positions. Radars with IFF read transponders and check them against filed flight plans. Type recognition (NCTR) tells a bomber from an airliner, but only inside a shorter range. A fighter flying up to look settles it. Weapons Tight fires only on identified hostiles.'],
    ['Sweeps and blinking', 'A rotating radar updates a track only when its beam passes. Between paints, the track coasts and blinks, and its uncertainty ring grows.'],
    ['Missile envelopes', 'Reach is longest head-on and shrinks against crossing or receding targets and down low. Semi-active and command-guided missiles need the battery radar on until impact. Aircraft fight back with chaff, flares and notching.'],
    ['Crew fatigue', 'Radars that radiate for hours while raids come in wear their crews out: slower reactions, slower reloads, more misses. Stand some down while others cover.'],
    ['The enemy commander', 'It probes with small raids to find gaps, harasses to keep us awake and burning interceptors, then throws a heavy strike with everything timed to arrive together. It remembers which routes cost it.'],
    ['Airports are built part by part', 'Runways, taxiways, aprons, terminals, hangars, shelters, fuel tanks, tower, fire station and radar are separate parts at real size. Aircraft taxi along the network you build: a runway with no exit near where aircraft stop blocks it for minutes, a runway with no taxiway to its ends makes every departure backtrack, and a single taxiway carries traffic one way at a time. The airport panel lists what is wrong.'],
    ['Building takes time, money and materials', 'Engineers build in stages: survey, earthworks, paving, markings and lights, then the opening. Each stage is paid as it runs, and paving uses concrete, asphalt and steel that lorries bring from the nearest town with industry: when the site runs out, work stops and the panel says why. Paving next to a runway closes it, unless you set the job to night work. Homes in the way are bought and cleared; their town will not thank you.'],
    ['Pavement', 'Asphalt is cheap and quick but heavy aircraft break it up; concrete carries every airliner; reinforced concrete craters less and is patched faster. Grass is for light aircraft only. A worn runway closes until it is resurfaced.'],
    ['Damage lands where it lands', 'A crater splits a runway into shorter strips; landing needs a strip long enough. A cut taxiway strands whatever is behind it. Burning fuel tanks set fire to tanks close by: spread them out. Aircraft in a hardened shelter usually survive; aircraft on an open stand usually do not.'],
    ['Airlines', 'Each airline wants different things: low fees, short taxi times, night slots, big terminals. Happy airlines ask for new routes; unhappy ones cut them. Prohibited zones keep airliners away from what matters, at the cost of longer flights.'],
    ['Radio and routes', 'Every airliner flies a filed route. One that leaves it flashes on the map: call it on the radio. A real airliner answers and turns back; something pretending to be one does not.'],
    ['Radar spectrum', 'Radars on the same band close together blind each other, and every extra radar on a crowded band costs more to keep. Spread them out, mix bands, or buy a spectrum plan.'],
    ['Logistics', 'Depots serve units in their ring. Factories push output to depots; forward depots pull from the central depot. Helicopters fly emergency deliveries and lifts to brigades.'],
    ['Towns', 'Towns pay taxes and power industry. A garrisoned town holds while its brigade does, even behind the line; it can then only be supplied by air.']
  ].map(([t, d]) => `<div class="ref"><span></span><div><b>${t}</b><p>${d}</p></div></div>`).join('');
  return `<div class="card wide"><h3>Guide<em>${tabs}</em></h3></div>${body.split('<div class="ref">').filter(Boolean).map(x => `<div class="card"><div class="ref">${x}</div>`).join('')}`;
}

/* ---------- settings ---------- */
function settings() {
  const P = S.cfg.pauseOn;
  const t = (k, n) => `<button class="act ${P[k] ? 'on' : ''}" data-act="pauseOn" data-v="${k}">${n}: ${P[k] ? 'pause' : 'no'}</button>`;
  return `<div class="card"><h3>Display</h3><div class="rl"><span class="muted" style="width:6rem">UI scale</span>${seg('uiscale', ui.scale, [[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.4, '140%']])}</div>
      <div class="rl"><span class="muted" style="width:6rem">Radar effects</span>${seg('radarFx', S.cfg.radarFx || 'subtle', [['off', 'Off', '', 'No sweep or blip animation'], ['subtle', 'Subtle', '', 'A small sweep hand at each radar'], ['full', 'Full', '', 'Sweeps across the whole range']])}</div>
      <div class="acts"><button class="act ${S.cfg.slowmo ? 'on' : ''}" data-act="cfg" data-v="slowmo">Slow motion on big moments: ${S.cfg.slowmo ? 'on' : 'off'}</button><button class="act ${S.cfg.shake ? 'on' : ''}" data-act="cfg" data-v="shake">Screen shake: ${S.cfg.shake ? 'on' : 'off'}</button><button class="act ${S.cfg.bars ? 'on' : ''}" data-act="cfg" data-v="bars">Cinematic bars: ${S.cfg.bars ? 'on' : 'off'}</button><button class="act ${ui.pauseRoom ? 'on' : ''}" data-act="pauseRoom">Pause while a war room is open: ${ui.pauseRoom ? 'on' : 'off'}</button></div></div>
    <div class="card"><h3>Auto-pause<em>the game pauses itself when…</em></h3><div class="acts">${t('ballistic', 'Ballistic launch')}${t('lost', 'Unit or aircraft lost')}${t('base', 'Air base hit')}${t('capture', 'Town captured')}${t('raid', 'Major raid detected')}${t('city', 'City hit')}${t('launch', 'Weapons released (peacetime)')}${t('event', 'A decision is needed')}</div><p class="hint">Skip ahead (S) always stops on these, and when new hostile or suspect tracks appear.</p></div>
    <div class="card"><h3>Sound</h3><div class="slider"><span class="muted">Volume</span><input type="range" min="0" max="100" step="5" value="${Math.round(IC.sfx.vol * 100)}" data-act="vol" aria-label="Volume"><span class="num">${Math.round(IC.sfx.vol * 100)}%</span></div><div class="acts"><button class="act" data-act="mute">${IC.sfx.muted || !IC.sfx.on ? 'Unmute' : 'Mute'}</button></div></div>
    <div class="card"><h3>Controls</h3>${kv([['Pan / zoom', 'drag · wheel · arrows · +/−'], ['Select / order', 'click · right-click'], ['Box select', 'shift + drag'], ['Pause · speed · skip', 'Space · 1–6 · S'], ['War rooms', 'V aviation · T staff · A G L I N K J · Esc'], ['Airport builder', 'click points · click the last one again or Enter to build · right-click takes a point back · R turn · F round corners · Ctrl+Z undo'], ['Units', 'E emissions · W rules · Q doctrine · M move · H resupply · P repair · X reserve · F fire'], ['Tracks', 'V intercept · B best battery'], ['Brigades', 'Y hold · D dig · R attack · T defend · U reserve · O refit · C commander']])}</div>
    <div class="card"><h3>Game</h3><div class="acts"><button class="act warn" data-act="restart">Quit to menu</button></div></div>`;
}

})(window.IC);
