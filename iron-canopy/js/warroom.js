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

/* ---------- civil aviation: an airline operations centre ----------
   Operations (the day at an airport, its boards, the numbers that matter), Deals (offers with their terms and what
   they need, and the contracts running), Airlines (each with a page of its own), Airports and routes, Airspace. */
const satCol = v => v > 65 ? 'var(--ok)' : v > 40 ? 'var(--amber)' : 'var(--hostile)';
const livery = al => `<i class="livery" style="background:linear-gradient(90deg,${al.livery[0]} 50%,${al.livery[1]} 50%)"></i>`;
const shortAp = n => n.replace(/ (International|Airport|Field)$/, '');
const code3 = n => shortAp(n).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
const ourApts = () => S.infra.filter(i => i.kind === 'airport' && i.owner === 'us');
const repWord = v => v < 30 ? 'poor' : v < 50 ? 'little known' : v < 65 ? 'fair' : v < 80 ? 'good' : 'excellent';
/* the room's clicks (main.js passes data-act="av" here): v is "what:value" */
IC.avRoomAct = function (st, v, id) {
  S = st;
  const [k, x] = String(v).split(':');
  if (k === 'lvl') IC.avNegotiate(S, id, +x);
  else if (k === 'excl') { const q = S.av.requests.find(r => r.id === id); if (q) IC.avNegotiate(S, id, null, !q.pick.excl); }
  else if (k === 'break') IC.avBreakDeal(S, id, 'we ended it', true);
  else if (k === 'al') { ui.alSel = id; ui.sub.aviation = 'airlines'; }
  else if (k === 'apt') ui.aptOps = x;
  else if (k === 'fee') { const ap = S.byId[id]; if (ap) { IC.avSetFee(S, ap, +x); IC.log(S, 'info', 'AVIATION', `${ap.name}: list charges set to ${Math.round(+x * 100)}%.`); } }
};
function aviation() {
  const A = S.av;
  const offers = A.requests.length, warn = A.deals.filter(d => d.st === 'active' && (d.badT || d.strikes)).length;
  const nw = ourApts().filter(ap => (ap.st && ap.st.warn || []).length).length;
  const top = pages('aviation', [['ops', 'Operations', '', 'The day at each airport, and how it is going'], ['deals', 'Deals', offers ? `${offers} offer${offers > 1 ? 's' : ''}` : warn ? `${warn} at risk` : '', 'Offers from airlines, their terms and what they need; the contracts running'],
    ['airlines', 'Airlines', '', 'Every airline: its fleet, routes, mood and what it wants next'], ['airports', 'Airports and routes', nw ? `${nw} with problems` : '', 'Every airport, and every route flown'], ['airspace', 'Airspace', '', 'Airways, radar cover, prohibited zones and light aircraft']]);
  const pg = ui.sub.aviation;
  if (pg === 'deals') return top + dealsPage();
  if (pg === 'airlines') return top + (ui.alSel && IC.avAirline(S, ui.alSel) ? airlinePage(IC.avAirline(S, ui.alSel)) : airlinesPage());
  if (pg === 'airports') return top + airportsPage();
  if (pg === 'airspace') return top + airspacePage();
  return top + opsPage();
}
/* ---- Operations ---- */
function opsPage() {
  const A = S.av, aps = ourApts();
  if (!aps.length) return `<div class="card wide ops"><h3>Operations<em>no airport yet</em></h3><p class="hint">Found the national airport first: the Aviation room fills with flights once it opens.</p><div class="acts">${lockOr('found', `<button class="btn primary" data-act="foundMode">+ Found a new airport · ${U.money(IC.FOUND_COST)}</button>`)}</div></div>`;
  const ap = S.byId[ui.aptOps] && S.byId[ui.aptOps].owner === 'us' ? S.byId[ui.aptOps] : aps[0];
  const rep = IC.aptRep(ap), act = A.deals.filter(d => d.st === 'active'), worth = act.reduce((s, d) => s + d.value, 0);
  const onT = A.day.flights ? 1 - A.day.delays / A.day.flights : 1;
  const tile = (k, v, sub, cls) => `<div class="kpi ${cls || ''}"><small>${k}</small><strong>${v}</strong><span>${sub}</span></div>`;
  const tiles = `<div class="kpis">${tile('Our name', Math.round(rep), `${repWord(rep)} · ${bar(rep / 100, rep >= 65 ? 'var(--ok)' : rep >= 45 ? 'var(--amber)' : 'var(--hostile)')}`, rep < 45 ? 'bad' : '')}
    ${tile('Deals running', act.length, `worth ${U.money(worth)} a day`)}${tile('Flights today', A.day.flights, `${Math.round(A.day.pax).toLocaleString('en-US')} passengers`)}
    ${tile('On time', U.pct(onT), `${A.day.delays} late · ${A.day.div} diverted`, onT < 0.8 ? 'bad' : '')}${tile('Airline fees', `${U.money(IC.avRevenueRate(S))}/h`, `upkeep ${U.money(IC.avUpkeep(S))}/h`)}</div>`;
  const pick = aps.length > 1 ? seg('av', 'apt:' + ap.id, aps.map(a => ['apt:' + a.id, esc(shortAp(a.name))])) : '';
  return `<div class="card wide ops"><h3>${esc(ap.name)}<em>${U.clock(S.time)}</em></h3>${pick}${tiles}${timeline(ap)}</div>
    <div class="card ops fids"><h3>Arrivals<em>next due</em></h3>${fids(ap, 'arr')}</div>
    <div class="card ops fids"><h3>Departures<em>next out</em></h3>${fids(ap, 'dep')}</div>
    ${nextUp()}`;
}
/* the airport's day: arrivals up, departures down, hour by hour; yesterday faint; what the runways can take dashed */
function timeline(ap) {
  const L = IC.aptDayLog(S, ap), P = L.prev, st = ap.st || {}, now = Math.floor((((S.time % 86400) + 86400) % 86400) / 3600);
  const cap = Math.max(1, st.arrPerHour || 0, st.depPerHour || 0);
  const mx = Math.max(4, cap * 0.6, ...L.arr, ...L.dep, ...(P ? P.arr.concat(P.dep) : []));
  const W = 720, H = 150, mid = 75, bw = W / 24, k = (mid - 12) / mx;
  let g = '';
  for (let h = 0; h < 24; h++) {
    const x = h * bw + 3, w = bw - 6, busy = L.arr[h] + L.dep[h] > (st.movesPerHour || 99) * 0.8;
    if (h < 6 || h >= 23) g += `<rect class="night" x="${h * bw}" y="0" width="${bw}" height="${H}"/>`;
    if (P) g += `<rect class="ghost" x="${x}" y="${mid - P.arr[h] * k}" width="${w}" height="${P.arr[h] * k}"/><rect class="ghost" x="${x}" y="${mid}" width="${w}" height="${P.dep[h] * k}"/>`;
    g += `<rect class="arr${busy ? ' busy' : ''}" x="${x}" y="${mid - L.arr[h] * k}" width="${w}" height="${L.arr[h] * k}"><title>${String(h).padStart(2, '0')}:00 · ${L.arr[h]} arrivals, ${L.dep[h]} departures</title></rect><rect class="dep${busy ? ' busy' : ''}" x="${x}" y="${mid}" width="${w}" height="${L.dep[h] * k}"/>`;
    if (h % 3 === 0) g += `<text x="${h * bw + 2}" y="${H - 2}">${String(h).padStart(2, '0')}</text>`;
  }
  // what the runways take, when it is within the chart (arrivals and departures are each capped by it)
  const capIn = st.arrPerHour && st.arrPerHour <= mx;
  const cy = n => `<line class="cap" x1="0" x2="${W}" y1="${mid - n * k}" y2="${mid - n * k}"/><line class="cap" x1="0" x2="${W}" y1="${mid + n * k}" y2="${mid + n * k}"/>`;
  g += (capIn ? cy(st.arrPerHour) : '') + `<line class="axis" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><line class="nowl" x1="${(now + 0.5) * bw}" x2="${(now + 0.5) * bw}" y1="4" y2="${H - 12}"/>`;
  const tot = L.arr.reduce((a, b) => a + b, 0) + L.dep.reduce((a, b) => a + b, 0), peak = L.arr.map((a, i) => a + L.dep[i]).reduce((b, v, i, arr) => v > arr[b] ? i : b, 0);
  return `<div class="tl"><div class="tl-key"><span class="k arr">Arrivals</span><span class="k dep">Departures</span><span class="k ghost">Yesterday</span>${st.arrPerHour ? `<span class="${capIn ? 'k cap' : 'muted'}">The runways take ${st.arrPerHour} arrivals and ${st.depPerHour} departures an hour</span>` : ''}<span class="muted">${tot} movements today${tot ? `, busiest ${String(peak).padStart(2, '0')}:00` : ''}. Airliners fly 06:00–23:00; freighters at night.</span></div>
    <svg class="tl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Movements by hour today">${g}</svg></div>`;
}
/* the flight information boards: what comes and goes next, from where, and how it is doing */
function fids(ap, kind) {
  const A = S.av, rows = [];
  for (const tl of A.tails) {
    if (tl.where === 'lost') continue;
    const r = IC.avRoute(S, tl); if (!r) continue;
    const far = r.a === ap.id ? IC.avEnd(S, r.b) : r.b.apt === ap.id ? S.byId[r.a] : null;
    if (!far) continue;
    const t = tl.track;
    let eta = null, stt = '', cls = '';
    if (kind === 'arr') {
      if (tl.where === 'air' && t && t.toApt === ap.id) { eta = (t.remain || U.dist(t, ap)) / Math.max(0.5, t.spd || 2) + 240; stt = t.stk || t.holding ? 'Holding' : t.appr ? 'On final' : t.seq ? 'Sequenced' : 'In the air'; cls = t.stk || t.holding ? 'amb' : 'ok'; }
      else if (tl.where === 'away' && tl.next === ap.id) { eta = Math.max(0, tl.t) + U.dist(far, ap) / tl.T.cruise; stt = 'Scheduled'; }
      else if (tl.where === 'arr' && tl.at === ap.id) { eta = 0; stt = 'Landed'; cls = 'ok'; }
    } else {
      if (tl.where === 'stand' && tl.at === ap.id) {
        // airliners stay the night (06:00–23:00 only); freighters fly on unless the airport has a curfew
        const h = (((S.time % 86400) + 86400) % 86400) / 3600, night = h < 6 || h >= 23, stays = night && (ap.curfew || IC.avAirline(S, tl.al).kind !== 'cargo');
        eta = stays ? Math.max(tl.t, ((h < 6 ? 6 : 30) - h) * 3600) : Math.max(0, tl.t);
        stt = stays ? 'Night stop' : tl.fuelWait > 300 && tl.t < 400 ? 'Waiting' : tl.t < 900 ? 'Boarding' : 'At stand'; cls = stt === 'Waiting' ? 'amb' : stt === 'Boarding' ? 'ok' : '';
      }
      else if (tl.where === 'dep' && tl.at === ap.id) { eta = 0; stt = 'Taxiing'; cls = 'ok'; }
    }
    if (eta == null) continue;
    const dl = IC.avDealOf(S, tl);
    rows.push({ eta, html: `<tr><td class="t">${U.hhmm(S.time + eta)}</td><td>${livery(IC.avAirline(S, tl.al))}${esc(tl.cs)}</td><td>${esc(shortAp(far.name))}</td><td class="m">${esc(tl.T.short)}</td><td class="s ${cls}">${stt}${dl && dl.badT ? ' ⚠' : ''}</td></tr>` });
  }
  rows.sort((a, b) => a.eta - b.eta);
  return rows.length ? `<table class="board"><tr><th>Time</th><th>Flight</th><th>${kind === 'arr' ? 'From' : 'To'}</th><th>Type</th><th>Status</th></tr>${rows.slice(0, 9).map(r => r.html).join('')}</table>` : `<p class="hint">${kind === 'arr' ? 'Nothing inbound.' : 'Nothing on the stands.'}</p>`;
}
/* what needs the player next, in a line each */
function nextUp() {
  const A = S.av, L = [];
  for (const q of A.requests) { const al = IC.avAirline(S, q.al), why = IC.avReqBlock(S, q); L.push(`<button class="li" data-act="sub" data-id="aviation" data-v="deals"><b>${livery(al)}${esc(al.name)} ${q.renew ? 'wants to renew' : 'offers a deal'}</b><small>${why ? `<span class="amber">${esc(why)}</span>` : 'Ready to sign.'} Decide within ${U.dur(Math.max(0, q.exp - S.time))}.</small></button>`); }
  for (const d of A.deals.filter(x => x.st === 'active' && x.badT)) { const al = IC.avAirline(S, d.al); L.push(`<button class="li" data-act="sub" data-id="aviation" data-v="deals"><b class="hostile">${esc(al.name)}'s deal is at risk</b><small>A facility it signed for is missing: it walks out in ${U.dur(Math.max(0, 12 * 3600 - (S.time - d.badT)))}.</small></button>`); }
  for (const ap of ourApts()) for (const w of (ap.st && ap.st.warn || []).slice(0, 2)) L.push(`<button class="li" data-act="selInfra" data-id="${ap.id}"><b>${esc(shortAp(ap.name))}</b><small>${esc(w)}</small></button>`);
  return `<div class="card wide"><h3>Needs you<em>${L.length || 'nothing'}</em></h3>${L.length ? `<div class="list">${L.slice(0, 8).join('')}</div>` : '<p class="hint">All quiet. Offers come more often the better the airport’s name.</p>'}</div>`;
}
/* ---- Deals ---- */
function dealsPage() {
  const A = S.av;
  const offers = A.requests.map(dealCard).join('');
  const act = A.deals.filter(d => d.st === 'active'), past = A.deals.filter(d => d.st !== 'active').slice(-6).reverse();
  const rows = act.map(contractRow).join('');
  const gone = past.map(d => { const al = IC.avAirline(S, d.al); return `<div class="li"><b>${livery(al)}${esc(al.name)} · ${esc(routeLbl(d))}</b><small class="${d.st === 'broken' ? 'hostile' : 'ok'}">${d.st === 'broken' ? `Broken ${U.clock(d.endT)}: ${esc(d.why || '')}. Compensation ${U.money(d.paid)}.` : `Ran its course ${U.clock(d.endT)}${d.strikes ? ` with ${d.strikes} bad day${d.strikes > 1 ? 's' : ''}` : ', every day on time'}.`}</small></div>`; }).join('');
  const rate = S.story && S.story.act === 1 ? ' Offers come every few hours, sooner the better our name.' : '';
  return `<div class="card wide"><h3>Offers<em>${A.requests.length ? `${A.requests.length} waiting` : 'none'}</em></h3>${offers ? `<div class="deals">${offers}</div>` : `<p class="hint">No offers. Airlines offer when their flights run full and the airport has a good name.${rate}</p>`}${S.story && S.story.del.routes ? '<p class="hint">The Route Planning Office signs offers the airports can carry, at list charges.</p>' : ''}</div>
    <div class="card wide"><h3>Contracts<em>${act.length} running · ${U.money(act.reduce((s, d) => s + d.value, 0))} a day</em></h3>${rows ? `<div class="list">${rows}</div>` : '<p class="hint">No deals signed yet.</p>'}
      <p class="hint">A day with a quarter of a deal’s flights more than ${IC.DEAL.lateMin} minutes late or cancelled is a bad day; after ${IC.DEAL.strikes} the airline walks out. Each late or cancelled flight costs the penalty in its contract.</p></div>
    ${gone ? `<div class="card wide"><h3>Ended<em>last ${past.length}</em></h3><div class="list">${gone}</div></div>` : ''}`;
}
const routeLbl = q => `${shortAp(S.byId[q.a].name)} – ${shortAp(IC.avEnd(S, q.b).name)}`;
function dealCard(q) {
  const al = IC.avAirline(S, q.al), T = IC.ACTYPES[q.type], a = S.byId[q.a], b = IC.avEnd(S, q.b);
  const k = IC.dealTerms(S, q), needs = IC.dealNeeds(S, q), block = needs.find(x => !x.ok);
  const lv = IC.DEAL.levels.map((d, i) => { const t = IC.dealTerms(S, q, i); return [String(i), `${d > 0 ? '+' : d < 0 ? '−' : ''}${d ? Math.round(Math.abs(d) * 100) + '%' : 'List'} · ${S.mode === 'story' ? t.days + ' mo' : t.days + ' d'}`, t.ok ? '' : 'red', t.ok ? `${U.pct(t.charge)} of standard charges for ${IC.dealLen(S, t.days)}: ${U.money(t.value)} a day` : `The airline refuses: ${t.why}`]; });
  const neg = `<div class="dl-neg"><span class="muted">Charges</span>${seg('av', 'lvl:' + k.lvl, lv.map(o => ['lvl:' + o[0], o[1], o[2], o[3]]), q.id)}
    ${q.terms.excl ? `<button class="btn sm ${k.excl ? 'primary' : ''}" data-act="av" data-v="excl" data-id="${q.id}" title="The airline asks for the route to itself: it pays 8% more, and no rival gets this route while the deal runs">${k.excl ? '✓ ' : ''}Exclusive</button>` : ''}</div>`;
  const need = needs.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><i>${x.ok ? '✓' : '✗'}</i>${esc(x.name)}${x.need != null ? `<span>${Math.floor(x.have)} / ${Math.ceil(x.need)}</span>` : ''}</li>`).join('');
  const brings = [k.paxDay ? `${k.paxDay.toLocaleString('en-US')} passengers` : '', k.cargoDay ? `${k.cargoDay.toLocaleString('en-US')} t of cargo` : ''].filter(Boolean).join(' and ');
  return `<div class="deal ${block ? 'blocked' : ''}" style="--liv:${al.livery[0]}">
    <div class="dl-head">${livery(al)}<b>${esc(al.name)}</b><span class="muted">${esc(al.K.style)}${q.renew ? ' · renewal' : ''}</span><em>decide within ${U.dur(Math.max(0, q.exp - S.time))}</em></div>
    <div class="dl-route"><span class="code">${code3(a.name)}</span><span class="arrow"></span><span class="code">${code3(b.name)}</span><small>${esc(routeLbl(q))} · ${U.km(U.dist(a, b))}</small></div>
    <div class="dl-terms"><div><small>Aircraft</small><b>${q.n} × ${esc(T.name.toLowerCase())}</b></div><div><small>Flights</small><b>${S.mode === 'story' ? `${Math.round(k.perWk / 7)} a day` : `${k.perWk} a week`}</b></div><div><small>Length</small><b>${IC.dealLen(S, k.days)}</b></div><div><small>Worth to us</small><b class="gold">${U.money(k.value)} a day</b></div></div>
    ${neg}
    <ul class="dl-needs">${need}</ul>
    <p class="dl-small">Brings about ${brings || 'little'} a day, and raises our name when it runs its term. Each late flight costs us ${U.money(q.terms.late)}, each cancelled one ${U.money(q.terms.cancel)}.</p>
    <div class="acts"><button class="btn primary" data-act="avYes" data-id="${q.id}" ${block || !k.ok ? 'disabled' : ''} title="${esc(block ? block.text : k.ok ? 'Sign on these terms' : k.why)}">Sign</button><button class="btn" data-act="avNo" data-id="${q.id}">Turn down</button>${block ? `<span class="amber dl-why">${esc(block.text)}</span>` : !k.ok ? `<span class="hostile dl-why">They will not sign: ${esc(k.why)}.</span>` : ''}</div></div>`;
}
function contractRow(d) {
  const al = IC.avAirline(S, d.al), f = U.clamp((S.time - d.t0) / Math.max(1, d.end - d.t0), 0, 1), left = Math.max(0, d.end - S.time);
  const dots = Array.from({ length: IC.DEAL.strikes }, (_, i) => `<i class="${i < d.strikes ? 'on' : ''}"></i>`).join('');
  const cost = d.value * left / 86400 * 0.3 + 5;
  return `<div class="li contract"><b>${livery(al)}${esc(al.name)} · ${esc(routeLbl(d))} <span class="muted">· ${d.n} × ${esc(IC.ACTYPES[d.type].short)} · ${U.pct(d.charge)} charges${d.excl ? ' · exclusive' : ''}</span></b>
    <small>${bar(f, d.badT ? 'var(--hostile)' : 'var(--friend)')} ${U.dur(left)} left · ${d.flown} flown, ${d.late} late, ${d.cancel} cancelled · penalties ${U.money(d.paid)} · <span class="strikes" title="Bad days: ${IC.DEAL.strikes} end the deal">${dots}</span>${d.badT ? ` · <span class="hostile">a facility it needs is missing: it walks out in ${U.dur(Math.max(0, 12 * 3600 - (S.time - d.badT)))}</span>` : ''}</small>
    <span class="la"><button class="btn sm" data-act="av" data-v="al" data-id="${al.id}">Airline</button><button class="btn sm" data-act="av" data-v="break" data-id="${d.id}" title="End the deal now: we pay ${U.money(cost)} and our name suffers">End · ${U.money(cost)}</button></span></div>`;
}
/* ---- Airlines ---- */
function airlinesPage() {
  const A = S.av;
  const cards = A.airlines.map(al => {
    const n = A.tails.filter(t => t.al === al.id && t.where !== 'lost').length, rs = A.routes.filter(r => r.al === al.id && r.st === 'active' && r.n > 0).length;
    const dl = A.deals.filter(d => d.al === al.id && d.st === 'active').length;
    return `<button class="alcard" data-act="av" data-v="al" data-id="${al.id}" style="--liv:${al.livery[0]};--liv2:${al.livery[1]}"><span class="band"></span><b>${esc(al.name)}</b><small>${esc(al.K.style)} · ${esc(al.code)}</small>
      <span class="alstats"><span><strong>${n}</strong> aircraft</span><span><strong>${rs}</strong> routes</span><span><strong>${dl}</strong> deals</span></span>
      <div class="bars one"><span>Mood</span>${bar(al.sat / 100, satCol(al.sat))}<span>${Math.round(al.sat)}%</span></div><small class="${al.sat < 40 ? 'hostile' : 'muted'}">Last: ${esc(al.lastWhy || 'nothing yet')}</small></button>`;
  }).join('');
  return `<div class="card wide"><h3>Airlines<em>${A.airlines.length ? `average mood ${Math.round(IC.avgSat(S))}% · click one for its page` : 'none yet'}</em></h3>${cards ? `<div class="algrid">${cards}</div>` : '<p class="hint">No airline flies here yet. They come when one of our airports can take their aircraft: a runway long enough, a stand, fire cover, a terminal and fuel.</p>'}</div>`;
}
function airlinePage(al) {
  const A = S.av, tails = A.tails.filter(t => t.al === al.id && t.where !== 'lost'), routes = A.routes.filter(r => r.al === al.id && r.st === 'active' && r.n > 0);
  const where = t => { const r = IC.avRoute(S, t), at = t.at && S.byId[t.at]; return t.where === 'stand' ? `on a stand at ${esc(shortAp(at.name))}` : t.where === 'air' ? `flying to ${esc(t.track && t.track.toApt ? shortAp(S.byId[t.track.toApt].name) : shortAp(IC.avEnd(S, r.b).name))}` : t.where === 'arr' || t.where === 'dep' ? `taxiing at ${esc(shortAp(at.name))}` : 'abroad'; };
  const fleet = tails.map(t => `<tr><td>${esc(t.cs)}</td><td>${esc(t.T.name)}</td><td>${where(t)}</td><td class="muted">${IC.avDealOf(S, t) ? 'under deal' : ''}</td></tr>`).join('');
  const deals = A.deals.filter(d => d.al === al.id && d.st === 'active').map(contractRow).join('');
  const offers = A.requests.filter(q => q.al === al.id);
  const hub = S.byId[al.hub];
  // what it wants next: its open offer and what blocks it; or what it complains of; or more where it flies full
  const lf = hub && hub.svc ? hub.svc.lf : 0;
  const wants = offers.length ? offers.map(q => { const why = IC.avReqBlock(S, q); return `It ${esc(q.why)}${why ? `, but <span class="amber">${esc(why)}</span>` : ', and the airport can take it: the offer is on the Deals page'}.`; }).join(' ')
    : al.sat < 45 ? `Nothing more until its complaint is fixed: <span class="amber">${esc(al.lastWhy || 'poor service')}</span>. Below 28% for six hours it cuts a route.`
    : lf > 0.85 ? `More flights: its seats at ${esc(shortAp(hub.name))} fly ${U.pct(lf)} full. An offer comes as our name allows.` : `It is content. It adds flights where its seats run full; at ${esc(hub ? shortAp(hub.name) : 'its hub')} they fly ${U.pct(lf)} full.`;
  return `<div class="card wide alpage" style="--liv:${al.livery[0]};--liv2:${al.livery[1]}"><div class="alhero"><span class="band"></span><div><small>${esc(al.K.style)} · ${esc(al.code)} · based at ${esc(hub ? hub.name : 'abroad')}</small><h2>${esc(al.name)}</h2><p class="muted">Likes: ${esc(al.K.likes)} Dislikes: ${esc(al.K.dislikes || '')}</p></div>
      <div class="alsat"><strong style="color:${satCol(al.sat)}">${Math.round(al.sat)}%</strong><small>mood</small></div></div>
      <div class="acts"><button class="btn sm" data-act="av" data-v="al" data-id="">← All airlines</button></div></div>
    <div class="card"><h3>Its routes<em>${routes.length} flown</em></h3>${routeMap(al, routes)}</div>
    <div class="card"><h3>Why it feels this way</h3>${kv([['Last visit', esc(al.lastWhy || 'nothing yet')], ['Delays it tolerates', `${al.K.delayTol} min`], ['Taxiing it tolerates', `${al.K.taxiTol} min`], ['Charges it tolerates', U.pct(al.K.feeTol)], ['Flights with us', al.flights]])}
      <p class="hint">Every visit is judged on taxiing, delays, charges and detours. It asks for more where it is happy and its seats run full; under 28% for six hours it drops its worst route.</p></div>
    <div class="card"><h3>What it wants next</h3><p>${wants}</p></div>
    <div class="card wide"><h3>Its deals<em>${A.deals.filter(d => d.al === al.id && d.st === 'active').length} running</em></h3>${deals ? `<div class="list">${deals}</div>` : '<p class="hint">No deal running.</p>'}</div>
    <div class="card wide"><h3>Fleet<em>${tails.length} aircraft</em></h3>${fleet ? `<table class="t">${fleet}</table>` : '<p class="hint">No aircraft.</p>'}</div>`;
}
/* the airline's routes over the country's outline: our airports, the places it flies, one line a route */
function routeMap(al, routes) {
  const W = S.world, poly = W.poly || [];
  const pts = [], ends = [];
  for (const r of routes) { const a = S.byId[r.a], b = IC.avEnd(S, r.b); pts.push(a, b); ends.push([a, b, r]); }
  for (const p of poly) pts.push({ x: p[0], y: p[1] });
  if (!pts.length) return '<p class="hint">No routes.</p>';
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = (x1 - x0) * 0.06, vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, sw = (x1 - x0) / 300;
  const outline = poly.length ? `<polygon class="land" points="${poly.map(p => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ')}" stroke-width="${sw}"/>` : '';
  const lines = ends.map(([a, b, r]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${al.livery[0]}" stroke-width="${sw * (1 + r.n * 0.6)}"><title>${esc(IC.avRouteName(S, r))}: ${r.n} aircraft, ${r.flown} flights</title></line>`).join('');
  const dots = [...new Set(pts.slice(0, ends.length * 2))].map(p => `<circle cx="${p.x}" cy="${p.y}" r="${sw * 3.2}" class="${p.apt || p.parts ? 'ours' : 'far'}"/><text x="${p.x + sw * 5}" y="${p.y + sw * 2}" font-size="${sw * 11}">${esc(shortAp(p.name))}</text>`).join('');
  return `<svg class="rmap" viewBox="${vb}" role="img" aria-label="${esc(al.name)} routes">${outline}${lines}${dots}</svg>`;
}
/* ---- Airports and routes, Airspace (as before) ---- */
function airportsPage() {
  const A = S.av;
  const routes = A.routes.filter(r => r.st === 'active' && r.n > 0).sort((a, b) => b.rev - a.rev).map(r => { const al = IC.avAirline(S, r.al); return `<tr class="click" data-act="routeFly" data-id="${r.id}"><td>${livery(al)}${esc(al.name)}</td><td>${esc(IC.avRouteName(S, r))}</td><td>${esc(IC.ACTYPES[r.type].short)}×${r.n}</td><td class="r">${r.flown}</td><td class="r">${U.money(r.rev)}</td></tr>`; }).join('');
  const apts = S.infra.filter(i => i.kind === 'airport').map(ap => {
    const st = ap.st || {}, kp = ap.kpi || {}, stands = IC.aptStands(ap);
    return `<tr class="click" data-act="selInfra" data-id="${ap.id}"><td>${esc(ap.name)}</td><td class="r">${Math.round(IC.aptRep(ap))}</td><td class="r">${Math.round(ap.paxRate || 0).toLocaleString('en-US')}</td><td class="r">${stands.filter(s => s.occ).length}/${stands.length}</td><td class="r ${kp.taxi > 600 ? 'amber' : ''}">${U.dur(kp.taxi || 0)}</td><td class="r ${kp.wait > 600 ? 'amber' : ''}">${U.dur(kp.wait || 0)}</td><td class="r ${kp.div ? 'hostile' : ''}">${kp.div || 0}</td><td class="r ${(st.warn || []).length ? 'amber' : ''}">${(st.warn || []).length}</td></tr>`;
  }).join('');
  return `<div class="card wide"><h3>Airports<em>click one to open it</em></h3><table class="t"><tr><th>Airport</th><th class="r">Name</th><th class="r">Pax/h</th><th class="r">Stands</th><th class="r">Taxi</th><th class="r">Delay</th><th class="r">Diversions</th><th class="r">Problems</th></tr>${apts}</table><div class="acts">${lockOr('found', `<button class="btn ${apts ? '' : 'primary'}" data-act="foundMode">+ Found a new airport · ${U.money(IC.FOUND_COST)}</button>`)}</div></div>
    <div class="card wide"><h3>Routes<em>${A.routes.filter(r => r.st === 'active').length} active · click one to see its airport</em></h3><table class="t"><tr><th>Airline</th><th>Route</th><th>Aircraft</th><th class="r">Flights</th><th class="r">Revenue</th></tr>${routes}</table></div>`;
}
function airspacePage() {
  const A = S.av, det = IC.avDetour(S);
  const zones = A.zones.map(z => `<div class="li"><b>${esc(z.name)}</b><small>${U.km(z.r)} radius</small><span class="la"><button class="btn sm" data-act="zoneDel" data-id="${z.id}">Remove</button></span></div>`).join('');
  return `${IC.storyLock(S, 'zones') ? '' : `<div class="card"><h3>Prohibited zones<em>routes are ${U.pct(det - 1)} longer</em></h3>${zones ? `<div class="list">${zones}</div>` : '<p class="hint">None. Airliners fly straight over everything, including our bases.</p>'}<div class="acts"><button class="btn" data-act="zoneMode">+ Draw a prohibited zone</button></div><p class="hint">Airliners route around zones: they cannot overfly what matters, and anything squawking as an airliner that enters one is off its route at once. Airlines dislike the detours.</p></div>`}
    ${airspace()}`;
}
/* a button, or why the Career has not opened it yet */
const lockOr = (key, html) => { const why = IC.storyLock(S, key); return why ? `<p class="hint">${esc(why)}</p>` : html; };
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
  // the controllers' load is shown from the start: the struggle comes before the tools to fix it
  const work = `<span class="${N.work > 1 ? 'hostile' : N.work > 0.8 ? 'amber' : ''}">${U.pct(N.work || 0)}</span> · ${Math.round(N.load || 0)} flights’ worth of work for a team that handles ${N.cap}`;
  if (IC.storyLock(S, 'airways')) return `<div class="card"><h3>Airspace<em>controllers work the old way</em></h3>
      ${kv([['Controllers’ workload', work], ['Airliners over us now', airOn.length], ['Separation lost today', `<span class="${d.los ? 'amber' : ''}">${d.los}</span>`], ['Near misses today', `<span class="${d.near ? 'hostile' : ''}">${d.near}</span>`], ['Departures held for spacing', N.stats.held]])}
      <p class="hint">Every flight flies direct and controllers keep them apart by the clock: slow, and it fails as the sky fills. ${esc(IC.storyLock(S, 'airways'))}</p></div>`;
  return `<div class="card"><h3>Airspace<em>${N.fixes.length} fixes · ${IC.aspGates(S).length} entry points · ${N.ways.length} airways</em></h3>
      ${kv([['Controllers’ workload', work], ['Radar cover at cruise height', `<span class="${hi < 0.8 ? 'amber' : ''}">${U.pct(hi)}</span> of the country`], ['Radar cover at 1 km', `<span class="${lo < 0.5 ? 'amber' : ''}">${U.pct(lo)}</span>`],
        ['Airports on the airways', `${joined} of ${apts.length}`], ['Airway crossings', xs], ['Airliners over us now', airOn.length], ['… on airways · on radar', `${onNet} · ${onRadar}`],
        ['Separation lost today', `<span class="${d.los ? 'amber' : ''}">${d.los}</span>`], ['Near misses today', `<span class="${d.near ? 'hostile' : ''}">${d.near}</span>`], ['Infringements today', d.inf],
        ['Conflicts solved by controllers', N.stats.solved], ['Departures held for spacing', N.stats.held]])}
      <div class="acts"><button class="btn primary" data-act="aspDraw">Draw airways</button><button class="btn" data-act="layer" data-v="coverage">${S.layers.coverage ? 'Hide' : 'Show'} radar cover</button></div>
      <p class="hint">Entry points are fixes within 25 km of the border: once there are any, traffic from abroad joins the airways only there. Controllers keep apart the flights they see on radar. Off the airways, or where radar does not reach, they space flights by time alone: fewer flights an hour, longer delays, and crossings that can go wrong. Radar sees less the lower an aircraft flies: hills and the curve of the earth hide it.</p></div>
    <div class="card"><h3>Light aircraft<em>${S.threats.filter(t => !t.dead && t.type === 'ga').length} flying</em></h3>${fields ? `<div class="list">${fields}</div>` : ''}
      <div class="acts">${lockOr('fields', `<button class="btn" data-act="fieldMode">+ Light-aircraft field · ${U.money(IC.ASP.FIELD_COST)}</button>`)}</div>
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
  const done = st.goals.filter(g => g.done).length, ch = IC.storyChapterInfo(S);
  const chapters = ch ? IC.CHAPTERS.map((C, n) => `<div class="li ${n < ch.n ? 'muted' : ''}"><b>${n < ch.n ? '✓ ' : n === ch.n ? '▸ ' : ''}Chapter ${n + 1} · ${esc(C.title)}</b>${n === ch.n ? `<small>${esc(ch.next)}</small>` : n > ch.n ? '<small>not yet</small>' : ''}</div>`).join('') : '';
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
      ${kv([['Standing', esc(IC.storyDismissal(S).text)], ['Command points (CP)', `<b class="amber">${st.cp}</b> · earned from ${st.act === 1 ? 'chapters' : 'goals'} and hard decisions`], ['Doctrine', docs || '<span class="muted">none yet</span>']])}</div>
    ${chapters ? `<div class="card"><h3>Act I<em>chapter ${ch.n + 1} of ${ch.of}</em></h3><div class="list">${chapters}</div></div>` : ''}
    <div class="card"><h3>Delegates<em>${U.money(IC.staffCost(S))}/h</em></h3><div class="list">${dels}</div><p class="hint">Delegates do routine work for you, for a running cost.</p></div>
    <div class="card"><h3>Requests<em>spend command points</em></h3><div class="list">${reqs}</div></div>
    <div class="card"><h3>Decisions</h3>${log ? `<div class="list">${log}</div>` : '<p class="hint">None yet.</p>'}</div>`;
}

/* ---------- air ---------- */
function air() {
  const tasks = S.ato.map(t => {
    const st = IC.taskStatus(S, t), cov = st.on.length;
    const relief = st.relief ? (cov ? `relief ${esc(st.relief.name)} ${st.launchIn > 0 ? 'launches in ' + U.dur(st.launchIn) : 'launching'}` : `${esc(st.relief.name)} on the way`) : `<span class="amber">no relief ready${cov ? ': uncovered in ' + U.dur(Math.max(0, st.emptyIn)) : ''}</span>`;
    return `<div class="li"><b>${esc(t.name)}</b><small>${cov} on task${st.on.map(o => ` · ${esc(o.a.name)} ${U.dur(Math.max(0, o.left))} left`).join('')} · wants ${t.want} · ${relief}</small><span class="la"><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="-1">−</button><button class="btn sm" data-act="twant" data-id="${t.id}" data-v="1">+</button><button class="btn sm" data-act="tdel" data-id="${t.id}">✕</button></span></div>`;
  }).join('');
  const add = [`<button class="btn" data-act="taskPoint" data-v="cap">+ Combat air patrol</button>`, `<button class="btn" data-act="taskPoint" data-v="aew">+ Early warning orbit</button>`, `<button class="btn" data-act="taskPoint" data-v="tanker">+ Tanker track</button>`, `<button class="btn" data-act="taskPoint" data-v="isr">+ Recon area</button>`].join('');
  const bases = IC.bases(S).filter(b => (b.kind === 'airbase' && !b.locked) || S.roster.some(r => r.base === b.id && r.st !== 'lost')).concat(S.units.filter(u => u.type === 'heliport'));
  const cards = bases.map(b => {
    const rs = S.roster.filter(r => r.base === b.id && r.st !== 'lost');
    const st = b.parts ? IC.baseStatus(S, b) : { runway: true };
    const rows = rs.map(r => {
      const a = r.ent;
      const state = (r.st === 'ready' ? '<span class="ok">Ready</span>' : r.st === 'turn' ? `Rearming ${U.dur(r.t)}` : a ? `${{ out: 'En route', station: 'On station', engage: 'Engaging', rtb: 'Returning', vid: 'Identifying', escort: 'Escorting', refuel: 'Refuelling' }[a.state] || 'Airborne'}${a.task ? ' · task' : ''} · ${U.dur(a.fuel)} fuel` : 'Airborne')
        + (r.n < (r.nMax || r.n) ? ` · ${r.n} of ${r.nMax}${r.back && r.back.length ? ` (${esc(IC.flightBackText(S, r))})` : ''}` : '') + ((r.fat || 0) > IC.FATIGUE.tired ? ' · <span class="amber">crews tired</span>' : '');
      const why = IC.missionOk(S, r, 'cap');
      let btn = '';
      if (r.st === 'air' && a && !a.job) btn = `<button class="btn sm" data-act="recall" data-rid="${r.id}">Recall</button><button class="btn sm" data-act="selAir" data-rid="${r.id}">Show</button>`;
      else if (r.st === 'ready') {
        const k = r.kind;
        if (k === 'ftr') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="cap" ${why ? 'disabled' : ''}>Patrol</button><button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="strike" ${IC.missionOk(S, r, 'strike') ? 'disabled' : ''}>Strike</button>`;
        else if (k === 'aew' || k === 'isr') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="${k === 'aew' ? 'aew' : 'isr'}" ${why ? 'disabled' : ''}>${k === 'aew' ? 'Orbit' : 'Recon'}</button>`;
        else if (k === 'tkr') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="tanker" ${why ? 'disabled' : ''}>Tanker track</button>`;
        else if (k === 'ucav') btn = `<button class="btn sm" data-act="airMode" data-rid="${r.id}" data-v="isr" ${why ? 'disabled' : ''}>Recon</button>`;
        else if (k === 'heli') btn = '<span class="muted" style="font-size:.78rem">resupply: select a battery</span>';
      }
      const load = r.kind === 'ftr' && r.st !== 'air' && (!S.story || S.story.act >= 3) ? seg('loadout', r.load, [['aa', 'Missiles', '', 'Loaded with air-to-air missiles, to fight aircraft'], ['strike', 'Bombs', '', 'Loaded with bombs, to strike targets on the ground']], r.id) : '';
      const qra = r.kind === 'ftr' && r.st !== 'lost' ? `<span class="seg">${[5, 15, 30].map(v => `<button data-act="air" data-op="alert" data-rid="${r.id}" data-v="${v}" aria-pressed="${IC.alertOf(r) === v}" title="${esc(IC.ALERT[v].desc)}">${v}′</button>`).join('')}</span>` : '';
      if (r.st !== 'air' && r.st !== 'lost') btn += `<button class="btn sm" data-act="selFlight" data-rid="${r.id}">Select</button>`;
      const block = r.st === 'ready' && b.parts ? IC.milLaunchBlock(S, b, r) : '';
      return `<div class="li stack"><b>${esc(r.name)} <span class="muted">· ${esc(IC.AIR_KIND[r.kind].name)} ×${r.n}</span></b><small>${state}${r.ent && r.ent.gnd ? ' · taxiing' : ''}${r.slot || r.st === 'air' ? '' : ' · <span class="amber">parked in the open</span>'}${block ? ` · <span class="hostile">${esc(block)}</span>` : ''}</small><span class="la">${qra}${load}${btn}</span></div>`;
    }).join('');
    const buy = b.infra && (!S.story || S.story.act >= 3) ? ['ftr', 'tkr', 'ucav', 'isr', 'heli'].map(k => `<button class="btn sm" data-act="buyAir" data-v="${k}" data-id="${b.id}" ${S.budget < IC.AIR_KIND[k].buy ? 'disabled' : ''} title="Buy a ${esc(IC.AIR_KIND[k].name.toLowerCase())} for this base">+ ${esc(IC.AIR_KIND[k].name)} · ${U.money(IC.AIR_KIND[k].buy)}</button>`).join('') : '';
    return `<div class="card"><h3>${esc(b.name)}<em>${st.runway ? rs.length + ' flights' : '<span class="hostile">runway closed</span>'}</em></h3><div class="list">${rows || '<p class="hint">No aircraft.</p>'}</div>${buy ? `<div class="acts">${buy}</div>` : ''}<div class="acts"><button class="btn sm" data-act="selInfra" data-id="${b.id}">Open base</button></div></div>`;
  }).join('');
  const storyNote = S.story && S.story.act < 3 ? `<p class="hint">In peacetime nobody fires without your order: Weapons are on Hold. A fighter sent to intercept flies up, identifies and escorts. To shoot, select the track and order the escort to fire.</p>` : '';
  const pil = S.pilots ? `<p class="hint">Spare pilots: ${S.pilots.spare}${S.pilots.rescue.length ? ` · ${S.pilots.rescue.length} being picked up` : ''}. A lost aircraft is replaced in about ${U.dur(IC.AIR_LOSS.replace)} if a pilot is free; a damaged one is back in ${U.dur(IC.AIR_LOSS.repair)}. Alert states: 5′ gets a flight airborne within 5 minutes but tires its crews; 30′ lets them rest.</p>` : '';
  return `<div class="card wide"><h3>Standing tasks<em>squadrons rotate aircraft to keep these covered</em></h3>${tasks ? `<div class="list">${tasks}</div>` : '<p class="hint">No standing tasks. Add one and the air wing keeps it covered around the clock.</p>'}<div class="acts">${add}</div>${storyNote}${pil}</div>${cards}`;
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

/* ---------- the economy: the monthly statement and the year's review, loans, passengers, growth, trade and roads ---------- */
function economy() {
  const E = S.econ; if (!E) return '<div class="card wide"><p class="hint">No economy in this mode.</p></div>';
  const wk = IC.monthStatement(S, 0), last = IC.monthStatement(S, 1), M = IC.money(S);
  const val = v => `<td class="r ${v >= 0 ? 'ok' : 'hostile'}">${v >= 0 ? '+' : '−'}${U.money(Math.abs(v)).replace('−', '')}</td>`;
  const mline = (l, sign) => `<button class="mline" data-act="why" data-v="${l.k}" aria-expanded="${ui.why === l.k}"><span>${esc(l.name)}</span><b class="${sign > 0 ? 'ok' : 'hostile'}">${sign > 0 ? '+' : '−'}${U.money(l.v)}</b></button>${ui.why === l.k ? `<p class="hint mwhy">${esc(l.why)}</p>` : ''}`;
  const warn = M.net < 0 && M.left < 24;
  const head = `<div class="card wide money"><h3>Money<em>click a line for the reason</em></h3>
    <div class="mtop"><div><small>Treasury</small><strong>${U.money(S.budget)}</strong></div><div><small>An hour, now</small><strong class="${M.net >= 0 ? 'ok' : 'hostile'}">${M.net >= 0 ? '+' : '−'}${U.money(Math.abs(M.net))}</strong></div><p class="${warn ? 'hostile' : M.net < 0 ? 'amber' : 'ok'}">${esc(M.forecast)}${warn ? ' Put units back in the reserve, raise airport charges, or borrow below.' : ''}</p></div>
    <div class="mcols"><div><h4>Coming in <em>+${U.money(M.inH)}/h</em></h4>${M.inc.map(l => mline(l, 1)).join('') || '<p class="hint">Nothing.</p>'}</div>
    <div><h4>Going out <em>−${U.money(M.outH)}/h</em></h4>${M.out.map(l => mline(l, -1)).join('') || '<p class="hint">Nothing.</p>'}</div></div>
    <p class="hint">Hourly lines are what runs all the time. Buying and building are paid when you do them${IC.storyLock(S, 'statement') ? '' : ' and show in the month below'}.</p></div>`;
  const keys = [...new Set((wk ? wk.lines : []).concat(last ? last.lines : []).map(l => l.k))];
  const get = (st, k) => { const l = st && st.lines.find(x => x.k === k); return l ? l.v : 0; };
  const rows = keys.sort((a, b) => get(wk, b) - get(wk, a)).map(k => `<tr><td>${esc(IC.STATEMENT[k] || k)}</td>${val(get(wk, k))}${last ? val(get(last, k)) : ''}</tr>`).join('');
  const stmt = head + econLesson() + aptMoney() + (IC.storyLock(S, 'charges') ? '' : chargesCard()) + (IC.storyLock(S, 'statement') ? '' : `<div class="card wide"><h3>This month<em>everything paid in and out, by kind</em></h3>
    ${wk ? `<table class="t"><tr><th>${esc(wk.name)}${wk.days < IC.dpm(S) - 0.01 ? ` (${Math.max(1, Math.ceil(wk.days))} of ${IC.dpm(S)} days so far)` : ''}</th><th class="r">This month</th>${last ? `<th class="r">${esc(IC.MONTHS[last.m % 12])}</th>` : ''}</tr>${rows}
      <tr><td><b>Came in</b></td>${val(wk.income)}${last ? val(last.income) : ''}</tr><tr><td><b>Went out</b></td>${val(wk.spend)}${last ? val(last.spend) : ''}</tr><tr><td><b>Change in the treasury</b></td>${val(wk.net)}${last ? val(last.net) : ''}</tr></table>` : ''}
    <p class="hint">The lines add up to the change in the treasury. Loans taken count in the change, not as income. A month is ${IC.dpm(S)} days and nights.</p></div>` + yearCard());
  // loans
  const owed = IC.loanOwed(S), lim = IC.loanLimit(S);
  const mo = S.mode === 'story', per = mo ? IC.MO(S) / 3600 : 24, perW = mo ? 'a month' : 'a day';
  const offers = IC.loanOffers(S).map((o, i) => { const pay = IC.loanPay(S, { amt: o.amt, left: o.amt, mo: o.mo, days: o.days, term: IC.loanTerm(S, o) }) * per; return `<div class="li"><b>Borrow ${U.money(o.amt)}</b><small>over ${IC.loanTermText(S, o)} · about ${U.money(pay)} ${perW} at first</small><span class="la"><button class="btn sm" data-act="loan" data-v="${i}" ${owed + o.amt > lim ? 'disabled' : ''}>Borrow</button></span></div>`; }).join('');
  const mine = E.loans.map(l => `<div class="li"><b>${U.money(l.amt)} loan</b><small>${U.money(l.left)} still owed · ${U.money(IC.loanPay(S, l) * per)} ${perW}</small><span class="la"><button class="btn sm" data-act="repayLoan" data-id="${l.id}" ${S.budget < l.left ? 'disabled' : ''}>Pay off</button></span></div>`).join('');
  const loans = `<div class="card"><h3>Loans<em>${U.money(owed)} owed of ${U.money(lim)} the banks allow</em></h3>${mine ? `<div class="list">${mine}</div>` : ''}<div class="list">${offers}</div>
    <p class="hint">For big projects: a new runway, a motorway. Repayments and ${IC.loanRateText(S)} interest come out of the budget every hour. The limit grows with last month's income.</p></div>`;
  // passengers at each airport
  const apts = S.infra.filter(i => i.kind === 'airport' && i.svc).map(ap => { const v = ap.svc; return `<tr class="click" data-act="selInfra" data-id="${ap.id}"><td>${esc(ap.name.replace(/ (International|Airport)$/, ''))}</td><td class="r">${Math.round(v.demand).toLocaleString('en-US')}</td><td class="r">${Math.round(v.seats).toLocaleString('en-US')}</td><td class="r ${v.lf > 0.9 ? 'amber' : ''}">${U.pct(v.lf)}</td><td class="r">${Math.round(v.deps)}</td><td class="r">${v.dests.size}</td><td class="r" title="frequency · choice of places · punctuality · fares">${U.pct(v.freqF)} · ${U.pct(v.destF)} · ${U.pct(v.relF)} · ${U.pct(v.fareF)}</td></tr>`; }).join('');
  const pax = `<div class="card wide"><h3>Passengers<em>a day, from the cities each airport serves</em></h3><table class="t"><tr><th>Airport</th><th class="r">Want to fly</th><th class="r">Seats</th><th class="r">Full</th><th class="r">Departures</th><th class="r">Places</th><th class="r">Frequency · choice · punctuality · fares</th></tr>${apts}</table>
    <p class="hint">People fly when flights are frequent, go to many places, leave on time and cost little. When seats run full, airlines ask for more routes; when they fly half empty, they lose interest.</p></div>`;
  // cities
  // one table for the cities: growth and air service, and (once at war) their industry and damage
  const war = ui.roomOk('industry');
  const cities = IC.cities(S).slice().sort((a, b) => b.pop - a.pop).map(c => { const g = c.gr ? c.gr.tot : 0; const cut = c.cuts && c.cuts.length, dark = c.plant && S.byId[c.plant] && S.byId[c.plant].offline; return `<tr class="click" data-act="selInfra" data-id="${c.id}"><td>${esc(c.name)}</td><td class="r">${c.pop}k</td><td class="r ${g > 0.05 ? 'ok' : g < -0.05 ? 'hostile' : ''}">${Math.abs(g) < 0.005 ? '' : g > 0 ? '+' : '−'}${Math.abs(g).toFixed(2)}%</td><td class="r">${c.air ? U.pct(c.air.score) : '–'}</td><td class="r">${c.air ? Math.round(c.air.demand).toLocaleString('en-US') : '–'}</td><td class="r ${cut ? 'hostile' : ''}">${U.pct(c.rc / Math.max(1, c.rc0 || 1))}${cut ? ' · cut' : ''}</td>${war ? `<td class="r">${c.ind}</td><td class="r">${U.pct(c.hp / c.max)}</td><td class="${c.alert > 0 ? 'hostile' : dark ? 'suspect' : ''}">${c.alert > 0 ? 'sirens' : dark ? 'blackout' : 'working'}</td>` : ''}</tr>`; }).join('');
  const growth = `<div class="card wide"><h3>Cities<em>growth ${S.mode === 'story' ? 'a year' : 'a day'} · click one for the reasons</em></h3><table class="t"><tr><th>City</th><th class="r">Pop</th><th class="r">Growth</th><th class="r">Air service</th><th class="r">Flyers a day</th><th class="r">Road links</th>${war ? '<th class="r">Industry</th><th class="r">Intact</th><th>Status</th>' : ''}</tr>${cities}</table>
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
  // the Career opens the economy a lever at a time (story.js locks): early on only money in and out, and the airport
  const noTrade = IC.storyLock(S, 'trade'), noLoans = IC.storyLock(S, 'loans'), noRoads = IC.storyLock(S, 'roads');
  const top = pages('economy', [['money', 'Money', M.net < 0 ? 'losing' : '', 'The treasury, what comes in and goes out, and what the airports earn']]
    .concat(noTrade ? [] : [['growth', 'Growth and trade', '', 'Passengers, cities and remote industries']])
    .concat(noLoans && noRoads ? [] : [['build', noRoads ? 'Loans' : noLoans ? 'Roads' : 'Roads and loans', E.works.length ? `${E.works.length} building` : '', 'Build roads to your airports; borrow for big projects']])
    .concat(war ? [['war', 'War economy', '', 'Mobilization and war bonds']] : []));
  const pg = ui.sub.economy;
  const later = [noTrade, noLoans, noRoads].some(Boolean) ? `<div class="card wide"><h3>Opens later</h3><p class="hint">${[noLoans, noRoads, IC.storyLock(S, 'charges'), IC.storyLock(S, 'statement'), noTrade].filter(Boolean).map(esc).join(' ')}</p></div>` : '';
  return top + (pg === 'growth' ? pax + growth + trade : pg === 'build' ? (noRoads ? '' : roads) + (noLoans ? '' : loans) : pg === 'war' ? warEconomy() : stmt + later);
}

/* the year so far, month by month, and last year's review */
function yearCard() {
  const E = S.econ; if (!E || !E.months || S.mode !== 'story') return '';
  const y = Math.floor(S.cal.m / 12) + 1, Ms = E.months.filter(M => Math.floor(M.m / 12) + 1 === y);
  const cur = IC.monthStatement(S, 0);
  const bar = (v, mx) => `<i style="width:${Math.round(Math.abs(v) / mx * 100)}%" class="${v >= 0 ? 'ok' : 'hostile'}"></i>`;
  const all = Ms.map(M => { const b = M.book; let inc = 0, out = 0; for (const k in b) if (k !== 'loanIn') { if (b[k] > 0) inc += b[k]; else out += b[k]; } return { name: IC.MONTHS[M.m % 12], net: inc + out + (b.loanIn || 0), inc, end: M.end.budget }; });
  all.push({ name: IC.MONTHS[S.cal.m % 12] + ' so far', net: cur.net, inc: cur.income, end: S.budget });
  const mx = Math.max(1, ...all.map(r => Math.abs(r.net)));
  const rows = all.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${U.money(r.inc)}</td><td class="r ${r.net >= 0 ? 'ok' : 'hostile'}">${r.net >= 0 ? '+' : '−'}${U.money(Math.abs(r.net)).replace('−', '')}</td><td class="bar">${bar(r.net, mx)}</td><td class="r">${U.money(r.end)}</td></tr>`).join('');
  const R = y > 1 && IC.yearReview(S, y - 1);
  const rev = R ? `<div class="card wide"><h3>Year ${R.y} in review<em>${R.months} months</em></h3><table class="t">${R.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`).join('')}</table><p class="hint">${esc(R.text)}</p></div>` : '';
  return `<div class="card wide"><h3>Year ${y}<em>month by month</em></h3><table class="t ymonths"><tr><th>Month</th><th class="r">Came in</th><th class="r">Change</th><th></th><th class="r">Treasury at the end</th></tr>${rows}</table></div>` + rev;
}
/* the lesson for the lever this chapter opened: what it does, and what good and bad look like, in our numbers */
function econLesson() {
  const st = S.story; if (!st || st.act > 1 || !st.fresh) return '';
  const M = IC.money(S), fees = IC.avRevenueRate(S), up = IC.avUpkeep(S), ap = st.cap && S.byId[st.cap];
  const sd = ap ? standDay(ap) : null;
  const L = {
    0: ['Money in, money out', `The Treasury gave you ${U.money(IC.CAREER_START)} to build the national airport, and pays a grant of ${U.money(M.inc.find(l => l.k === 'base') ? M.inc.find(l => l.k === 'base').v : 5)} an hour. Once airlines fly, they pay for every landing and every passenger. <b>Good</b>: airline fees above upkeep once the airport runs. <b>Bad</b>: building more than the airlines use: every ₭100M of concrete costs ₭0.12M an hour for as long as it stands.`],
    1: ['Charges and stands', `Airlines pay the airport’s list charges, or what their deal says. Most sign between 85% and 115%; low-cost airlines grumble above 65%, flag carriers above 130%, and every visit over their limit costs their goodwill. ${sd && sd.n ? `A stand here earned about ${U.money(sd.avg)} ${sd.when}; its apron costs about ${U.money(sd.keep)} a day to keep. <b>Good</b>: every stand earning several times its keep. <b>Bad</b>: stands that earn nothing: ${sd.idle ? `${sd.idle} of yours did` : 'none of yours did'}.` : 'The Money page shows what each stand earns once aircraft use them.'}`],
    2: ['The month’s statement', `Every payment by kind, this month against last; each January a review of the year. <b>Good</b>: once the building stops, the treasury grows by more than it shrank while you built. <b>Bad</b>: “building works” larger than all income month after month, with nothing new flying. Now: fees ${U.money(fees)} an hour against upkeep ${U.money(up)}.`],
    3: ['Small money', `Light aircraft pay ${U.money(IC.ACTYPES.light.fee * 0.5)} a landing, and traffic crossing the country ${U.money(0.5)} a flight on our airways (half that off them). Both are small money: they help, but the airlines pay for the airport. <b>Good</b>: clubs flying from fields of their own, off the big runway. <b>Bad</b>: light aircraft holding airliners on the runway at the capital.`],
    4: ['Loans', `The banks lend up to ${U.money(IC.loanLimit(S))} now. <b>Good</b>: ₭800M for a runway that brings deals worth ₭150M a month pays for itself within the loan’s two years. <b>Bad</b>: borrowing to pay running costs: the interest (${IC.loanRateText(S)}) makes the gap wider.`],
    5: ['Growth and trade', `Air service grows cities; growing cities fly more and trade more. <b>Good</b>: cities within 2½ hours of an airport growing each day, remote industries selling abroad by air. <b>Bad</b>: an airport nobody can reach by road: its catchment, not its runway, limits it.`]
  }[st.ch];
  return L ? `<div class="card wide elesson"><h3>${esc(L[0])}<em>what this chapter opens</em></h3><p>${L[1]}</p></div>` : '';
}
/* what a stand earned yesterday at an airport, against what its apron costs to keep */
function standDay(ap) {
  const D = IC.aptDayLog(S, ap), P = D.prev || D, stands = IC.aptStands(ap).filter(s => (s.zone || 'civil') !== 'mil' && s.linked !== false);
  const earn = stands.map(s => P.stand[s.id] || 0), n = stands.length;
  const aprons = ap.parts.filter(p => p.kind === 'apron' && p.built), keep = n ? aprons.reduce((s, p) => s + IC.partCost(ap, p), 0) * 0.0012 * 24 / n : 0;
  return { n, avg: n ? earn.reduce((a, b) => a + b, 0) / n : 0, best: Math.max(0, ...earn), keep, idle: D.prev ? earn.filter(v => v < keep).length : 0, when: D.prev ? 'yesterday' : 'so far today' };
}
/* each airport: what it took today and yesterday, what it costs to keep, and its stands */
function aptMoney() {
  const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts);
  if (!aps.length) return '';
  const rows = aps.map(ap => {
    const D = IC.aptDayLog(S, ap), keep = ap.parts.filter(p => p.built).reduce((s, p) => s + IC.partCost(ap, p), 0) * 0.0012 * 24, sd = standDay(ap);
    const y = D.prev ? D.prev.fee : null;
    return `<tr class="click" data-act="selInfra" data-id="${ap.id}"><td>${esc(ap.name.replace(/ (International|Airport)$/, ''))}</td><td class="r">${U.money(D.fee)}</td><td class="r">${y == null ? '–' : U.money(y)}</td><td class="r hostile">−${U.money(keep)}</td><td class="r ${y == null ? '' : y >= keep ? 'ok' : 'hostile'}">${y == null ? '–' : (y >= keep ? '+' : '−') + U.money(Math.abs(y - keep))}</td><td class="r">${sd.n ? `${U.money(sd.avg)} · best ${U.money(sd.best)}` : '–'}</td><td class="r ${sd.idle ? 'amber' : ''}">${D.prev ? sd.idle : '–'}</td></tr>`;
  }).join('');
  return `<div class="card wide"><h3>Your airports<em>airline fees against upkeep, a day</em></h3><table class="t"><tr><th>Airport</th><th class="r">Fees today</th><th class="r">Yesterday</th><th class="r">Upkeep a day</th><th class="r">Yesterday, net</th><th class="r">A stand earned (yesterday)</th><th class="r">Idle stands</th></tr>${rows}</table>
    <p class="hint">An idle stand earned less yesterday than its apron costs to keep. A few spare stands keep arrivals from holding; many mean you built ahead of the airlines.</p></div>`;
}
/* the charges lever: list charges per airport, and what they do */
function chargesCard() {
  const aps = S.infra.filter(i => i.kind === 'airport' && i.owner === 'us' && i.parts);
  if (!aps.length) return '';
  const rows = aps.map(ap => `<div class="rl"><span class="lbl">${esc(ap.name.replace(/ (International|Airport)$/, ''))}</span>${seg('av', 'fee:' + (ap.feeLevel || 1), [['0.7', '70%'], ['0.85', '85%'], ['1', '100%'], ['1.2', '120%'], ['1.5', '150%', 'amb']].map(o => ['fee:' + o[0], o[1], o[2], `List charges ${o[1]}: new deals are offered at this level`]), ap.id)}</div>`).join('');
  return `<div class="card wide"><h3>Charges<em>list charges for new deals and flights without one</em></h3>${rows}<p class="hint">Deals keep the charges they were signed at until they end. Higher list charges earn more per flight and make airlines harder to sign; lower ones fill the airport and earn less. Fares follow the charges, so passengers notice too.</p></div>`;
}

/* ---------- intelligence ---------- */
/* the enemy's side: where its campaign stands, what it seems to want, what it has hit, what it is saving, and the
   latest intelligence. Only what our side could know: the aim as intercepts read it, the stockpile as satellites
   see it (in round numbers without ESM or satellite warning), and the share of what they fired at each kind of target. */
function enemyAgenda() {
  const E = S.enemy, act = E.act || 0, A = IC.EACTS[act];
  const steps = [1, 2, 3, 4].map(n => `<span class="${n === act ? 'on' : n < act ? 'past' : ''}" title="${esc(IC.EACTS[n].text)}">${n} · ${esc(IC.EACTS[n].name)}</span>`).join('');
  const head = !E.war ? 'Massing on the border. No shot fired yet.' : `${esc(A.text)}${act === 3 && S.time < (E.lullEnd || 0) ? ` <b>A lull: they are reassessing${E.lullEnd ? `, for a few hours more` : ''}.</b>` : ''}`;
  const aim = E.war && E.aim ? `<p style="margin:0">Their aim, as intercepts read it: <b>${esc(IC.EAIMS[E.aim].name)}</b> (${esc(IC.EAIMS[E.aim].hint)}).${E.plan && E.plan.obj && E.raid ? ` Next raid being prepared${E.raid.warned ? `, most likely towards ${esc(IC.nearestPlace(S, E.plan.obj.x, E.plan.obj.y).replace(/^\d+ km \w+ of /, ''))}` : ''}.` : ''}</p>` : '';
  const T = IC.enemyTally(S), sets = Object.entries(T.all).sort((a, b) => b[1] - a[1]);
  const hit = sets.length ? `<div class="bars long">${sets.map(([k, n]) => `<span>${esc(IC.ESETS[k].name)}</span>${bar(n / T.allN, 'var(--hostile)')}<span>${U.pct(n / T.allN)}</span>`).join('')}</div><p class="hint">Share of the ${T.allN} weapons fired at each kind of target. What they fire at says what they want.</p>` : '';
  let save = '';
  if (E.save && !E.shock) {
    const st = IC.enemyStock(S), sharp = IC.hasTech(S, 's_sat') || IC.hasTech(S, 's_esm'), f = sharp ? st.f : Math.round(st.f * 4) / 4;
    const sites = S.esites.filter(s => s.hold && s.pk > 0 && (s.kind === 'bm' || s.kind === 'cm' || s.kind === 'mrbm')).map(s => `<button class="li" data-act="sels" data-id="${s.id}"><b>${esc(s.name)}</b><small>${s.destroyed ? 'destroyed' : `${U.pct(s.hp / s.max)} intact`} · stock burns if it is hit</small></button>`).join('');
    save = `<div class="card"><h3>Their stockpile<em>${E.save.reps ? (st.f >= 0.97 ? 'ready' : `ready ${IC.enemyStockWhen(S)}`) : 'not yet seen'}</em></h3>${E.save.reps ? `<div class="bars"><span>Put aside</span>${bar(f, 'var(--amber)')}<span>${U.pct(f)}</span></div><p class="hint">They have stopped firing their big missiles and are saving them for one large strike. Destroying the stock or the launchers sets it back; a lost launcher takes them about ${U.dur(IC.TEL_REPLACE)} to replace.</p>${sites ? `<div class="list">${sites}</div>` : ''}` : '<p class="hint">Satellite pictures are being read.</p>'}</div>`;
  }
  const news = E.intel.slice(0, 6).map(i => `<div class="li"><small>${U.hhmm(i.t)} · ${esc(i.text)}</small></div>`).join('');
  return `<div class="card wide"><h3>Their campaign<em>${esc(act ? `act ${act}: ${A.name}` : E.mood)}</em></h3><div class="acts-line">${steps}</div><p style="margin:0">${head}</p>${aim}${hit}<div class="bars"><span>Enemy will</span>${bar(E.will / 100, 'var(--hostile)')}<span>${Math.round(E.will)}%</span></div><p class="hint">Their will falls when their launchers, bases and aircraft are destroyed and their raids fail.</p></div>
    ${save}<div class="card"><h3>Latest intelligence</h3>${news ? `<div class="list">${news}</div>` : '<p class="hint">Nothing yet.</p>'}</div>`;
}
function intel() {
  const E = S.enemy;
  const ops = E.ops.slice(-8).reverse().map(o => `<div class="li"><b>${esc(o.label)}</b><small>${U.hhmm(o.t0)} · ${o.launched} launched · ${o.lost} shot down · ${o.hits} hits</small></div>`).join('');
  const known = [...E.known.values()].filter(k => !k.ref.dead).sort((a, b) => b.t - a.t);
  const mine = known.slice(0, 10).map(k => `<button class="li" data-act="selu" data-id="${k.ref.id}"><b>${esc(k.ref.name)}</b><small>${esc(k.ref.d.name)} · via ${esc(k.how)} · ${U.dur(S.time - k.t)} ago${U.dxy(k.x, k.y, k.ref.x, k.ref.y) > 30 ? ' · moved since' : ''}</small></button>`).join('');
  const sites = S.esites.filter(s => s.pk > 0).map(s => `<button class="li" data-act="sels" data-id="${s.id}"><b>${esc(s.name)}</b><small>${s.destroyed ? 'destroyed' : s.pk >= 2 ? `located · ${U.pct(s.hp / s.max)} intact` : 'suspected'}</small></button>`).join('');
  const tels = S.tels.filter(t => t.known && !t.dead).map(t => `<button class="li" data-act="selt" data-id="${t.id}"><b>${esc(t.name)}</b><small>last seen ${U.dur(S.time - t.kt)} ago</small></button>`).join('');
  const bda = S.reports.slice(0, 8).map(r => `<div class="li"><b>${esc(r.by)} → ${esc(r.target.name)}</b><small>${U.hhmm(r.t)} · ${esc(r.text)}</small></div>`).join('');
  return `${enemyAgenda()}
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
    return `<div class="slot"><small>Slot ${i + 1}</small><b>${esc(t.name)}</b><span>${U.pct(s.prog)} · ${IC.techDur(S, t, 1 - s.prog)} left</span><div class="prog"><i style="width:${s.prog * 100}%"></i></div></div>`;
  }).join('');
  const memo = {}, maxD = Math.max(...IC.TECH.map(t => depthOf(t, memo)));
  const node = t => {
    const done = T.done.has(t.id), cur = IC.researching(S, t.id), reqOk = t.req.every(r => T.done.has(r));
    const cls = done ? 'done' : cur ? 'cur' : reqOk ? 'open' : 'locked';
    const opens = ui.techOpens(t);
    const act = done ? `<span class="ok">${ui.icon('star', 'sm')} Done</span>` : cur ? `<span class="amber">${U.pct(cur.prog)} · ${IC.techDur(S, t, 1 - cur.prog)} left</span>`
      : !reqOk ? `<span class="need">${ui.icon('lock', 'sm')} After ${t.req.filter(r => !T.done.has(r)).map(r => esc(IC.TECH.find(x => x.id === r).name)).join(' and ')}</span>`
      : `<button class="btn sm primary" data-act="research" data-v="${t.id}" ${!free || S.budget < t.cost ? 'disabled' : ''} title="${!free ? 'Both slots are busy' : S.budget < t.cost ? 'Not enough money' : `Start it: ${U.money(t.cost)} now, ready in ${IC.techDur(S, t)}`}">Research</button>`;
    return `<div class="tnode ${cls}" data-tech="${t.id}" data-req="${t.req.join(' ')}"><b>${esc(t.name)}${ui.newTag('tech:' + t.id)}</b><p>${esc(ui.techWords(t))}</p>${opens.length ? `<p class="opens">Opens: ${esc(opens.join(', '))}</p>` : ''}
      <div class="meta"><span>${done ? '' : `${U.money(t.cost)} · ${IC.techDur(S, t)}`}</span>${act}</div>${cur ? `<div class="prog"><i style="width:${cur.prog * 100}%"></i></div>` : ''}</div>`;
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
    <ol class="log">${logs.map(l => `<li class="${l.at ? 'click' : ''}" ${l.at ? `data-act="logjump" data-x="${l.at.x}" data-y="${l.at.y}"` : ''}><time title="${U.clock(l.t)}">${S.mode === 'story' ? U.clock(l.t) : U.hhmm(l.t)}</time><span class="tg t-${l.kind}">${esc(l.tag)}</span><span>${esc(l.msg)}</span>${l.at && IC.replayOpen && S.time - l.t < IC.REC.span ? `<button class="btn sm" data-act="replay" data-x="${l.at.x}" data-y="${l.at.y}" data-t="${l.t}" title="Watch it again in 3D, from any angle">Replay</button>` : ''}</li>`).join('')}</ol></div>`;
}

/* ---------- reference ---------- */
function reference() {
  // the Career shows what the player has reached: equipment they may buy, threats and aircraft once they meet them
  const st = S.story, war = !st || st.act >= 2;
  const tabs = pages('reference', [['how', 'How it works', '', 'The lessons you have reached, the current one first']].concat(war ? [['units', 'Our equipment', '', 'Everything in the arsenal'], ['threats', 'Threats', '', 'What the enemy sends'], ['air', 'Aircraft', '', 'Our flights']] : []));
  ui.refCat = ui.sub.reference;
  let body = '';
  if (ui.refCat === 'units') body = Object.entries(IC.UNITS).filter(([k]) => !st || IC.storyAllows(S, k)).map(([k, d]) => `<div class="ref">${ui.sym(k, 68, 52)}<div><b>${esc(IC.fullName(d))}</b><p>${esc(d.desc)}</p>${kv([['Cost', `${U.money(d.cost)} · sets up in ${U.dur(d.build)}`], ['Reach', IC.typeRange(k) ? U.km(IC.typeRange(k)) : '–'], ['Mobility', IC.MOB_LABEL[d.mob]]].concat(d.mags ? [['Missiles', d.mags.map(m => `${IC.fullName(IC.MUN[m.mun])} (${IC.MUN[m.mun].seeker || ''})`).join(', ')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'threats') body = Object.entries(IC.THR).filter(([k]) => k !== 'pen').map(([k, d]) => `<div class="ref"><canvas data-thr="${k}" width="68" height="52"></canvas><div><b>${esc(IC.fullName(d))}</b><p>${esc(d.desc || '')}</p>${kv([['Class', esc(IC.KLASS[d.klass] || d.klass)], ['Speed', d.spd ? U.kmh(d.spd) : 'ballistic'], ['Altitude', d.alt ? U.alt(d.alt) : 'varies'], ['Warhead', d.dmg ? d.dmg : '–']].concat(d.cm ? [['Countermeasures', 'chaff, flares' + (d.notch ? ', notching' : '')]] : []))}</div></div>`).join('');
  else if (ui.refCat === 'air') body = Object.entries(IC.AIR_KIND).map(([k, d]) => `<div class="ref"><span class="badge friend" style="display:grid;place-items:center;height:2.6rem;border-radius:10px;background:var(--well)">${d.short}</span><div><b>${esc(d.name)}</b>${kv([['Aircraft per flight', d.n], ['Speed', U.kmh(d.spd)], ['Endurance', U.dur(d.endur)], ['Turnaround', U.dur(d.turn)], ['Needs a runway', d.runway ? 'yes' : 'no']])}</div></div>`).join('');
  else {
    const G = IC.guideFor(S), card = (g, cur) => `<div class="card guide ${cur ? 'gcur' : ''}">${cur ? '<small class="gnow">This chapter</small>' : ''}<b>${esc(g.t)}</b><p>${esc(g.d)}</p></div>`;
    const ch = st && st.act === 1 ? IC.CHAPTERS[st.ch] : null;
    return `${tabs}${G.now.length ? `<div class="card wide ghead"><h3>${ch ? `Chapter ${st.ch + 1} · ${esc(ch.title)}` : st ? esc(IC.ACTS[st.act].name + ' · ' + IC.ACTS[st.act].title) : 'How it works'}<em>lessons for where you are now</em></h3></div>` : ''}${G.now.map(g => card(g, true)).join('')}
      ${G.past.length ? `<div class="card wide ghead"><h3>${G.now.length ? 'Earlier' : 'How it works'}<em>${G.past.length} lesson${G.past.length > 1 ? 's' : ''}</em></h3></div>${G.past.map(g => card(g)).join('')}` : ''}
      ${st ? '<div class="card wide"><p class="hint">New lessons open as the Career reaches them.</p></div>' : ''}`;
  }
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
    ${start ? '' : IC.savesCardHTML(S)}`;
};
IC.keysHTML = () => `<div class="card"><h3>Map</h3>${kv([['Move the map', '<kbd>drag</kbd> or <kbd>←↑→↓</kbd>'], ['Zoom', '<kbd>wheel</kbd> or <kbd>+</kbd> <kbd>−</kbd>'], ['The capital', '<kbd>Home</kbd>'], ['Select', '<kbd>click</kbd> · <kbd>shift</kbd>+click adds'], ['Select several', '<kbd>shift</kbd>+drag a box · double-click picks all of a kind'], ['Order', '<kbd>right-click</kbd>: the card under the cursor says what it will do']])}</div>
  <div class="card"><h3>Time</h3>${kv([['Pause', '<kbd>Space</kbd>'], ['Speed 1× to 32×', '<kbd>1</kbd> to <kbd>6</kbd>'], ['Skip until something needs you', '<kbd>S</kbd>'], ['Back out of anything, or the menu', '<kbd>Esc</kbd>']])}</div>
  <div class="card"><h3>Rooms</h3>${kv(ui.ROOMS.map(([, n, k]) => [n, `<kbd>${k}</kbd>`]).concat([['Guide', '<kbd>?</kbd>']]))}</div>
  <div class="card"><h3>Selected unit</h3>${kv([['Radar on, ambush, silent', '<kbd>E</kbd>'], ['Weapons rules', '<kbd>W</kbd>'], ['Firing doctrine', '<kbd>Q</kbd>'], ['Move', '<kbd>M</kbd>'], ['Resupply by air', '<kbd>H</kbd>'], ['Repair', '<kbd>P</kbd>'], ['Back to the reserve', '<kbd>X</kbd>'], ['Fire mission', '<kbd>F</kbd>'], ['Call in a missile team', '<kbd>G</kbd>']])}</div>
  <div class="card"><h3>Selected track</h3>${kv([['Next or previous hostile', '<kbd>Tab</kbd> · <kbd>shift</kbd>+<kbd>Tab</kbd>'], ['Send the quickest fighter', '<kbd>V</kbd>'], ['Assign the best battery', '<kbd>B</kbd>']])}</div>
  <div class="card"><h3>Selected fighters</h3>${kv([['Plan an intercept', '<kbd>click</kbd> a track, or <kbd>Tab</kbd>'], ['Commit it', '<kbd>Enter</kbd>, or <kbd>right-click</kbd> the track'], ['Escort one of our aircraft', '<kbd>right-click</kbd> it'], ['Forget the plan', '<kbd>Esc</kbd>']])}</div>
  <div class="card"><h3>Airport builder</h3>${kv([['Place points', '<kbd>click</kbd>'], ['Build', 'click the last point again, or <kbd>Enter</kbd>'], ['Take a point back', '<kbd>right-click</kbd> or <kbd>Backspace</kbd>'], ['Turn', '<kbd>R</kbd> · <kbd>shift</kbd>+<kbd>R</kbd> 90°'], ['Round corners', '<kbd>F</kbd>'], ['Undo', '<kbd>Ctrl</kbd>+<kbd>Z</kbd>']])}</div>`;
function settings() { return IC.settingsHTML(S) + IC.keysHTML(); }

})(window.IC);
