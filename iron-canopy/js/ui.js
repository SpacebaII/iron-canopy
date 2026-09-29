/* Iron Canopy — HUD shell: top bar, war-room rail, situation and staff panels, feed, arsenal, overlays.
   Panels rebuild from HTML strings only when their content changes, and never while a pointer is held down
   inside them, so clicks are never lost. The inspector and war rooms live in their own files. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const ui = IC.ui = { cat: 'ad', room: null, busyUntil: 0, cache: {}, ci: 0, shownAt: 0, lastLen: 0, toasts: [], cineShown: 0, cineT: 0, roomScroll: {}, aptTab: 'info', arMin: false, logFilter: 'all', refCat: 'units',
  sub: { aviation: 'ops', economy: 'money', logi: 'stock' }, fresh: new Set(), known: null, moments: [], momentT: 0 };
let S = null;
const esc = U.esc;
ui.esc = esc;
ui.kbd = k => k ? `<kbd>${k}</kbd>` : '';
/* a small line icon, drawn with the same stroke as the rail */
ui.icon = (k, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;
ui.newTag = k => ui.fresh.has(k) ? '<span class="new">New</span>' : '';
ui.bar = (f, col) => `<div class="bar"><i style="width:${U.clamp(f, 0, 1) * 100}%;background:${col || (f > 0.5 ? 'var(--ok)' : f > 0.25 ? 'var(--amber)' : 'var(--hostile)')}"></i></div>`;
ui.sym = (type, w, h) => `<canvas data-sym="${type}" width="${w || 96}" height="${h || 74}"></canvas>`;
ui.gsym = (id, w, h) => `<canvas data-gid="${id}" width="${w || 96}" height="${h || 74}"></canvas>`;

/* Panels refresh five times a second. Replacing their HTML would reset every scrolled list inside them and
   drop hover and clicks in progress, so the new HTML is patched onto the old: nodes that stay keep their
   scroll, hover and focus. A new key (another selection, tab or room) replaces the content outright and it
   starts at the top. List items carrying data-k are matched by key rather than by position. */
const tpl = document.createElement('template');
function morph(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (let i = a.attributes.length - 1; i >= 0; i--) { const n = a.attributes[i].name; if (!b.hasAttribute(n)) a.removeAttribute(n); }
  for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  // the attribute is only the starting value; a control the player is using keeps what they set
  if (a.tagName === 'INPUT' && a !== document.activeElement) { if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked'); else a.value = b.getAttribute('value') || ''; }
  morphKids(a, b);
}
function morphKids(a, b) {
  let x = a.firstChild;
  for (let y = b.firstChild; y;) {
    const next = y.nextSibling, k = y.nodeType === 1 ? y.getAttribute('data-k') : null;
    if (k != null && !(x && x.nodeType === 1 && x.getAttribute('data-k') === k)) {
      let m = x; while (m && !(m.nodeType === 1 && m.getAttribute('data-k') === k)) m = m.nextSibling;
      if (m) { a.insertBefore(m, x); x = m; }
    }
    if (x && x.nodeName === y.nodeName && (x.nodeType !== 1 || x.getAttribute('data-k') === k)) { morph(x, y); x = x.nextSibling; }
    else a.insertBefore(y, x);
    y = next;
  }
  while (x) { const n = x.nextSibling; a.removeChild(x); x = n; }
}
ui.keys = {};
// a number for any object, so a selection can be part of a key
const oids = new WeakMap(); let oidN = 0;
ui.oid = o => { if (!o || typeof o !== 'object') return String(o); if (!oids.has(o)) oids.set(o, ++oidN); return oids.get(o); };

ui.setHTML = function (el, html, key) {
  if (!el) return false;
  const fresh = key !== undefined && ui.keys[el.id] !== key;
  if (!fresh && ui.cache[el.id] === html) return false;
  ui.cache[el.id] = html; ui.keys[el.id] = key;
  if (fresh || !el.firstChild) { el.innerHTML = html; el.scrollTop = 0; }
  else { tpl.innerHTML = html; morphKids(el, tpl.content); tpl.innerHTML = ''; }
  for (const c of el.querySelectorAll('canvas[data-sym]')) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); IC.drawUnitSymbol(g, c.dataset.sym, c.width / 2, c.height / 2 - 3, c.width / 34, IC.C.friend); }
  for (const c of el.querySelectorAll('canvas[data-schem]')) IC.drawSchematic && IC.drawSchematic(c, S, S.byId[c.dataset.schem]);
  for (const c of el.querySelectorAll('canvas[data-reach]')) IC.drawReachChart && IC.drawReachChart(c, c.dataset.reach.split(','));
  for (const c of el.querySelectorAll('canvas[data-side]')) if (IC.drawSide) c._P = IC.drawSide(c, S, { kind: 'base', ref: S.byId[c.dataset.side] });
  for (const c of el.querySelectorAll('canvas[data-thr]')) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); IC.drawThreatSymbol(g, c.dataset.thr, c.width / 2, c.height / 2 + 4, c.width / 24); }
  return true;
};
const setHTML = ui.setHTML;

/* ---------- settings (kept in this browser only) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
ui.store = store;
// a decision and a peacetime launch pause the game unless the player turned them off
ui.pauseOnIs = (P, k) => k === 'launch' || k === 'event' ? P[k] !== false : !!P[k];
IC.savedCfg = () => { const c = store.get('ic-cfg', {}); return c.game || {}; };
ui.saveCfg = () => { if (!S) return; store.set('ic-cfg', { game: { pauseOn: S.cfg.pauseOn, slowmo: S.cfg.slowmo, shake: S.cfg.shake, bars: S.cfg.bars, radarFx: S.cfg.radarFx }, ui: ui.scale, vol: IC.sfx.vol, pauseRoom: ui.pauseRoom }); };
ui.applyScale = v => { ui.scale = v; document.documentElement.style.setProperty('--ui', v); };
{
  const c = store.get('ic-cfg', {});
  const auto = window.innerWidth > 2300 ? 1.2 : window.innerWidth > 1800 ? 1.08 : 1;
  ui.applyScale(c.ui || auto);
  ui.pauseRoom = !!c.pauseRoom;
  if (c.vol != null) IC.sfx.vol = c.vol;
}

ui.bind = function (state) {
  S = state; ui.cache = {}; ui.keys = {}; ui.roomScroll = {}; ui.ci = 0; ui.lastLen = 0; ui.shownAt = performance.now(); ui.toasts = []; ui.cineShown = 0; ui.room = null; ui.overDismissed = false;
  // nothing from the previous game stays on screen: its chapter card, its unlocks, its hints
  ui.fresh = new Set(); ui.known = null; ui.moments = []; ui.moment = null; ui.menu = false; IC.hint.clear();
  for (const id of ['warroom', 'cine', 'unlock', 'menu', 'tip']) $(id).hidden = true;
  ui.refresh(true);
};

/* ---------- toasts ---------- */
IC.toast = function (st, kind, tag, msg, at) {
  if (st !== S) return;
  if (ui.toasts.length && ui.toasts[0].msg === msg) return;
  ui.toasts.unshift({ id: IC.nid('toast'), kind, tag, msg, at, t: performance.now(), time: st.time });
  if (ui.toasts.length > 5) ui.toasts.length = 5;
};
function feed() {
  const now = performance.now();
  ui.toasts = ui.toasts.filter(t => now - t.t < 9000);
  const el = $('feed');
  setHTML(el, ui.toasts.map((t, i) => `<button class="toast ${t.kind}" data-k="${t.id}" data-act="toast" data-v="${i}"><b>${esc(t.tag)}</b><span>${esc(t.msg)}</span><time>${U.hhmm(t.time)}</time></button>`).join(''));
  // the newest are on top: the older ones that would run into the map controls below are left out (the Journal has them all)
  const box = $('mapbox').getBoundingClientRect(), room = box.height ? box.top - el.getBoundingClientRect().top - 8 : Infinity;
  let full = false;
  for (const c of el.children) { if (!full && c.offsetTop + c.offsetHeight > room) full = true; c.style.visibility = full ? 'hidden' : ''; }
}

/* ---------- waiting for money: the chooser, and the line that says what is still to come ---------- */
function waitLine() {
  if (S.wait) {
    const r = ui.waitRate ? ` · ${S.mode === 'story' ? `a month in about ${Math.max(1, Math.round(IC.MO(S) / ui.waitRate))} s` : `${Math.round(ui.waitRate / IC.GS)}×`}` : '';
    return `<div class="waitbar glass" role="status"><b>Waiting</b> ${esc(IC.waitText(S))}<small>Stops when it is there, when the month turns, or when something needs you${r}.</small><button class="btn sm" data-act="waitPick">Stop</button></div>`;
  }
  if (!ui.waitPick) return '';
  const L = IC.waitTargets(S);
  return `<div class="waitbar glass pick"><b>Wait until you can afford</b>${L.map(t => `<button class="li" data-act="wait" data-v="${esc(t.key)}"><span>${esc(t.what.charAt(0).toUpperCase() + t.what.slice(1))}</span><small>${esc(IC.waitText(S, t))}</small></button>`).join('')}<small>Time runs fast, and stops when the month turns or something needs you.</small></div>`;
}

/* ---------- top bar ---------- */
function topbar() {
  // two clocks: the calendar (months, years) and the live day and night inside it
  const L = IC.daylight(S.time), h = (S.time % 86400) / 3600, cal = S.mode === 'story' && IC.calAt(S, S.time);
  const sky = `${L >= 1 ? 'Day' : L <= 0 ? 'Night' : (h < 12 ? 'Dawn' : 'Dusk')} · ${IC.WEATHER[S.weather.kind].name}`;
  const ck = $('hClock');
  ck.textContent = cal ? `${U.hhmm(S.time)} · ${U.date(S.time)}` : U.clock(S.time);
  ck.parentNode.title = cal ? `The calendar counts months and years; each month is ${cal.dpm} days and nights of live time. Aircraft, weather and building run on the live clock.` : '';
  $('hSky').textContent = cal ? `Day ${cal.d} of ${cal.dpm} · ${IC.SEASON ? IC.SEASON[cal.mo].name + ' · ' : ''}${sky}` : sky;
  setHTML($('speed'), `<button class="pz" data-act="pause" aria-pressed="${S.paused}" title="Pause and resume (Space)">❚❚<kbd>Space</kbd></button>` +
    IC.SPEEDS.map((v, i) => `<button data-act="speed" data-v="${v}" aria-pressed="${!S.paused && !S.skip && S.speed === v}" title="${v}× speed: ${v * IC.GS} game seconds a second (key ${i + 1})">${v}×<kbd>${i + 1}</kbd></button>`).join('') +
    `<button class="skip" data-act="skip" aria-pressed="${!!S.skip && !S.paused}" title="Skip ahead fast until something needs you (S)">⏭<kbd>S</kbd></button>` +
    (S.mode === 'story' || S.mode === 'sandbox' ? `<button class="wait" data-act="waitPick" aria-pressed="${!!S.wait}" aria-expanded="${!!ui.waitPick}" title="Wait for money: time runs fast until you can afford what you pick, the month turns, or something needs you (7)">Wait<kbd>7</kbd></button>` : '') +
    waitLine());
  const flow = S.income - S.upkeep, m = IC.nationalMorale(S);
  const meter = (f, col) => `<div class="meter"><i style="width:${U.clamp(f, 0, 1) * 100}%;background:${col}"></i></div>`;
  const st = S.story, act = st ? st.act : 4;
  if (S.range) { const R = IC.rangeStats(S); setHTML($('stats'), `<div class="stat"><span>Shots</span><strong>${R.shots}</strong></div><div class="stat"><span>Kills</span><strong class="ok">${R.kills}</strong></div><div class="stat"><span>Leakers</span><strong class="${R.leaks ? 'hostile' : ''}">${R.leaks}</strong></div>`); }
  const left = S.moneyLeft == null ? Infinity : S.moneyLeft, short = left < 24;
  const money = `<button class="stat treasury" id="stat-money" data-act="room" data-v="economy" title="${short ? `Money runs out in about ${U.dur(left * 3600)} at this rate. ` : ''}Treasury, and how it changes an hour. Click for the Economy room."><span>Treasury</span><strong class="${short ? 'hostile' : 'gold'}">${U.money(S.budget)}</strong><em class="${flow >= 0 ? 'ok' : 'hostile'}">${flow >= 0 ? '+' : '−'}${Math.abs(flow).toFixed(0)}/h${short ? ` · ${U.dur(left * 3600)} left` : ''}</em></button>`;
  if (st) {
    const sat = IC.avgSat(S), T = S.tension || 0;
    setHTML($('stats'), `
      <div class="stat role" title="${esc(IC.ACTS[act].name)}: ${esc(IC.ACTS[act].title)}"><span>${esc(IC.ACTS[act].name)}</span><strong>${esc(st.role)}</strong></div>
      ${money}
      <div class="stat" title="The Minister's confidence in you. ${esc(IC.storyDismissal(S).text)}"><span>Confidence</span><strong class="${st.standing > 50 ? '' : st.standing > 25 ? 'amber' : 'hostile'}">${Math.round(st.standing)}</strong>${meter(st.standing / 100, st.standing > 50 ? 'var(--ok)' : st.standing > 25 ? 'var(--amber)' : 'var(--hostile)')}</div>
      <div class="stat" title="Average airline satisfaction"><span>Airlines</span><strong class="${!S.av.airlines.length ? 'muted' : sat > 60 ? '' : sat > 40 ? 'amber' : 'hostile'}">${S.av.airlines.length ? Math.round(sat) + '%' : 'none yet'}</strong>${meter(S.av.airlines.length ? sat / 100 : 0, 'var(--civil)')}</div>
      <div class="stat" title="Passengers through our airports in the last hour"><span>Pax/h</span><strong>${Math.round(S.av.paxHour || 0).toLocaleString('en-US')}</strong></div>
      ${act >= 2 ? `<div class="stat" title="Tension with the ${esc(S.world.full.A)}"><span>Tension</span><strong class="${T > 60 ? 'hostile' : T > 30 ? 'amber' : ''}">${Math.round(T)}</strong>${meter(T / 100, 'var(--hostile)')}</div>` : ''}
      ${act >= 4 ? `<div class="stat" title="Enemy will to fight: ceasefire at zero"><span>Enemy will</span><strong class="hostile">${Math.round(S.enemy.will)}</strong>${meter(S.enemy.will / 100, 'var(--hostile)')}</div>` : ''}`);
  } else if (!S.range) setHTML($('stats'), `${money}
    <div class="stat" title="National morale: below 12% the government asks for terms"><span>Morale</span><strong class="${m > 55 ? '' : m > 30 ? 'amber' : 'hostile'}">${Math.round(m)}%</strong>${meter(m / 100, m > 55 ? 'var(--ok)' : m > 30 ? 'var(--amber)' : 'var(--hostile)')}</div>
    <div class="stat" title="Allied support: aid and import prices"><span>Allies</span><strong>${Math.round(S.support)}</strong>${meter(S.support / 100, 'var(--friend)')}</div>
    ${S.pm != null ? `<div class="stat" title="The Prime Minister's confidence: it falls when cities, power, factories and airports are hit, and when raids get through. At zero the government asks for terms."><span>PM</span><strong class="${S.pm > 50 ? '' : S.pm > 25 ? 'amber' : 'hostile'}">${Math.round(S.pm)}</strong>${meter(S.pm / 100, S.pm > 50 ? 'var(--ok)' : S.pm > 25 ? 'var(--amber)' : 'var(--hostile)')}</div>` : ''}
    ${S.enemy.war && S.mode !== 'range' ? `<div class="stat" title="Hold this long with the country working to win"><span>Hold</span><strong>${U.dur(Math.max(0, IC.HOLD_DAYS - IC.warDays(S)) * 86400)}</strong></div>` : ''}`);
  const seg = (act2, cur, opts) => `<div class="seg">${opts.map(([v, n, c, t]) => `<button class="${c || ''}" data-act="${act2}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
  setHTML($('rules'), `
    ${act >= 2 ? `<div class="rl weapons" title="National weapons status: Tight fires only on identified hostiles; Free also on suspects; Hold never without your order"><span>Weapons</span>${seg('roeAll', S.ad.roe, [['free', 'Free', '', 'Engage hostile and suspect tracks'], ['tight', 'Tight', '', 'Engage only identified hostiles'], ['hold', 'Hold', 'red', 'Do not fire without an order']])}</div>` : ''}
    ${act >= 3 ? `<div class="rl doctrine" title="Firing doctrine"><span>Doctrine</span>${seg('doctrine', S.ad.doctrine, [['sls', 'Look', '', 'Shoot-look-shoot: one missile, then another if it missed'], ['salvo', 'Salvo', '', 'Two missiles at once'], ['conserve', 'Save', 'amb', 'Only high-probability shots']])}</div>` : ''}
    <div class="rl airspace" title="Civil airspace: who may fly over the country"><span>Airspace</span>${seg('airspace', S.airspace, [['open', 'Open', '', 'Airliners fly their normal routes'], ['restricted', 'Restricted', 'amb', 'Airliners keep to the southern corridors only'], ['closed', 'Closed', 'red', 'No civil flights at all: the airlines lose money']])}</div>
`);
  setHTML($('sys'), `<button class="ib" data-act="mute" title="Sound on or off">${ui.icon(IC.sfx.muted || !IC.sfx.on ? 'muted' : 'sound')}</button><button class="ib" data-act="room" data-v="reference" title="Guide: how everything works (?)">${ui.icon('reference')}</button><button class="ib" id="menuBtn" data-act="menu" title="Menu: settings, the Guide, quit (Esc)">${ui.icon('menu')}</button>`);
  alerts();
  incidents();
  evcard();
}
/* incidents: the short list of things that must not be missed */
function incidents() {
  const L = IC.activeIncidents(S).slice(0, 4);
  ui.incRefs = L;
  setHTML($('incidents'), L.map((it, i) => `<div class="inc ${it.level}" data-k="${it.id}"><button class="go" data-act="incGo" data-v="${i}"><b>${esc({ offroute: 'OFF ROUTE', launch: 'WEAPONS RELEASED', intrusion: 'INTRUDER', collision: 'MAYDAY', violation: 'AIRSPACE VIOLATION', ballistic: 'BALLISTIC', ground: 'GROUND', runway: 'RUNWAY', separation: 'SEPARATION LOST', nearmiss: 'NEAR MISS', infringe: 'INFRINGEMENT' }[it.kind] || it.kind.toUpperCase())}</b><span>${esc(it.text)}</span><time>${U.hhmm(it.t)}</time></button><button class="x" data-act="incX" data-v="${it.id}" aria-label="Dismiss">✕</button></div>`).join(''));
}
/* decisions: one card at a time */
function evcard() {
  const el = $('evcard');
  const e = S.story && S.story.events[0];
  if (!e) { el.hidden = true; ui.cache.evcard = null; return; }
  el.hidden = false;
  setHTML(el, `<small>${esc(e.who || 'Decision')} · ${U.clock(e.t)}${S.story.events.length > 1 ? ` · ${S.story.events.length - 1} more waiting` : ''}</small><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p>
    <div class="opts">${e.opts.map((o, i) => `<button class="opt" data-act="evChoose" data-id="${e.id}" data-v="${i}"><b>${esc(o.t)}</b>${o.tip ? `<span>${esc(o.tip)}</span>` : ''}</button>`).join('')}</div>`);
}
function alerts() {
  const w = [];
  const bal = S.threats.filter(t => t.det && !t.dead && (t.d.cls === 'bal' || t.d.cls === 'hgv') && t.aff === 'H' && !t.decoyKnown);
  if (bal.length) { const t = bal.slice().sort((a, b) => IC.timeToImpact(a) - IC.timeToImpact(b))[0]; w.push(['flash', `${bal.some(t => t.d.cls === 'hgv') ? 'Hypersonic' : 'Ballistic'} ×${bal.length} · impact ${U.dur(IC.timeToImpact(t))} · ${IC.nearestPlace(S, t.x1 || t.aim.x, t.y1 || t.aim.y)}`, t.x1 != null ? { x: t.x1, y: t.y1 } : t]); }
  const arms = {};
  for (const t of S.threats) if (t.det && !t.dead && t.type === 'arm' && !t.blind && t.target) arms[t.target.name] = arms[t.target.name] || { t: IC.timeToImpact(t), u: t.target };
  for (const n in arms) w.push(['flash', `ARM → ${n} · ${U.dur(arms[n].t)} · go silent`, arms[n].u]);
  const raid = S.threats.filter(t => t.det && !t.dead && t.aff === 'H' && !t.border && (t.d.cls === 'cm' || t.d.cls === 'drone' || t.d.cls === 'air') && IC.inHome(t.px, t.py));
  if (raid.length >= 4) w.push(['amber', `Raid in progress · ${raid.length} hostile tracks`, raid[0]]);
  const sus = S.threats.filter(t => t.det && !t.dead && t.aff === 'S' && IC.inHome(t.px, t.py) && t.d.cls === 'air');
  if (sus.length) w.push(['amber', `${sus.length} suspect aircraft in our airspace · send a fighter to look`, sus[0]]);
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && !b.locked && b.parts.some(p => p.kind === 'runway') && IC.rwyState(S, b).closed) w.push(['amber', `${b.name}: runway closed`, b]);
  if (S.av) for (const b of S.infra.filter(i => i.kind === 'airport' && i.owner === 'us')) {
    const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id);
    if (hold.length >= 2 || hold.some(t => t.holdT > 600)) w.push(['amber', `${b.name}: ${hold.length} holding${hold.some(t => t.standShort) ? ' · stands full' : ''}`, b]);
  }
  if (S.asp && S.asp.work > 1.05) w.push(['amber', `Controllers overloaded · ${Math.round(S.asp.load)} flights’ work for ${S.asp.cap}`, null]);
  const jam = S.units.filter(u => u.jamF < 0.97 && u.radarOn);
  if (jam.length) w.push(['info', `Jamming · ${jam.slice(0, 2).map(u => `${u.name} −${U.pct(1 - u.jamF)}`).join(' · ')}`, jam[0]]);
  const dry = S.units.filter(u => u.state === 'ready' && u.d.weapon === 'sam' && IC.activeMags(S, u).every(m => m.mag + m.store === 0));
  if (dry.length) w.push(['amber', `Out of missiles: ${dry.slice(0, 3).map(u => u.name).join(', ')}`, dry[0]]);
  if (raid.length && S.airspace === 'open' && S.threats.some(t => t.d.civil && !t.dead && !t.hostileCiv)) w.push(['info', 'Airliners aloft during a raid', null]);
  ui.alertRefs = w.map(x => x[2]);
  setHTML($('alerts'), w.slice(0, 4).map(([c, s], i) => `<div class="alert ${c}" data-act="alert" data-v="${i}">${esc(s)}</div>`).join(''));
}

/* ---------- rail ---------- */
const ICON = {
  air: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  logi: '<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  industry: '<path d="M3 20V10l6 3.5V10l6 3.5V5h4v15zM3 20h18"/>',
  intel: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10"/>',
  journal: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  reference: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
};
ICON.economy = '<path d="M4 20V11M10 20V6M16 20v-9M22 20H2M3 8l6-4 6 5 6-4"/>';
ICON.aviation = '<path d="M3 20h18M6 20V9l6-4 6 4v11M10 20v-5h4v5M9 11h6"/>';
ICON.staff = '<circle cx="12" cy="7" r="3.2"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M12 14l-1.5 4L12 21l1.5-3z"/>';
ICON.lock = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
ICON.menu = '<path d="M4 7h16M4 12h16M4 17h16"/>';
ICON.sound = '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>';
ICON.muted = '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>';
ICON.star = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';
ICON.airport = '<path d="M2 20h20M5 20l6-16M19 20l-6-16M9 12h6"/>';
ICON.airbase = '<path d="M12 3l2 5h5l-4 3.5 1.5 5.5L12 14l-4.5 3 1.5-5.5L5 8h5z"/>';
ICON.city = '<path d="M3 21V9l5-3v15M8 21V4l7 3v14M15 21v-9l6 2v7M3 21h18"/>';
ICON.power = '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>';
ICON.bridge = '<path d="M2 16h20M4 16c2-6 14-6 16 0M7 16v-3M12 16v-4.5M17 16v-3"/>';
ICON.fix = '<path d="M12 3l9 16H3z"/>';
ICON.airway = '<path d="M4 20L20 4M4 20l3-1M20 4l-1 3"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="4" r="1.5"/>';
ICON.field = '<path d="M3 17h18M6 17l3-7h6l3 7M12 10V5"/>';
ICON.part = '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16"/>';
ICON.group = '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>';
ICON.target = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>';
/* the rooms on the rail, with their keys. The Guide and Settings sit in the menu (Esc) and the top bar */
ui.ROOMS = [['aviation', 'Aviation', 'V'], ['staff', 'Career', 'C'], ['economy', 'Economy', 'E'], ['air', 'Air', 'A'], ['logi', 'Supply', 'L'], ['intel', 'Intel', 'I'], ['research', 'Research', 'R'], ['journal', 'Journal', 'J']];
ui.EXTRA = [['reference', 'Guide', '?'], ['settings', 'Settings', '']];
ui.roomName = k => (ui.ROOMS.concat(ui.EXTRA).find(r => r[0] === k) || [k, k])[1];
ui.roomOk = k => (!S.range || k === 'reference' || k === 'settings') && (k !== 'aviation' || !!S.av) && (k !== 'economy' || S.mode !== 'academy') && (k !== 'staff' || !!S.story) && IC.roomAllowed(S, k);
/* in the Career, the act that opens a room that is still shut */
ui.roomAct = k => { const st = S.story; if (!st || S.range) return 0; for (let n = st.act + 1; n <= 4; n++) if (IC.roomAllowed({ story: { act: n, doc: st.doc }, av: S.av }, k)) return n; return 0; };
function rail() {
  const hot = S.logs.length && S.logs[0].kind === 'leak' && S.time - S.logs[0].t < 120;
  const idle = S.tech.slots.some(s => !s) && IC.roomAllowed(S, 'research');
  const req = S.av && S.av.requests.length;
  const staffDot = S.story && (S.story.events.length || S.story.cp > 0);
  const dot = k => ui.fresh.has('room:' + k) ? '<span class="dot new">New</span>'
    : k === 'journal' && hot ? '<span class="dot"></span>' : k === 'research' && idle ? '<span class="dot amb" title="A research slot is free"></span>'
    : k === 'aviation' && req ? `<span class="dot n civ">${req}</span>` : k === 'staff' && staffDot ? '<span class="dot amb"></span>' : '';
  // the next act's rooms show, shut, so the player knows what is coming
  const next = S.story ? S.story.act + 1 : 0;
  setHTML($('rail'), ui.ROOMS.map(([k, n, key]) => {
    if (ui.roomOk(k)) return `${k === 'journal' ? '<div class="sep"></div>' : ''}<button id="rail-${k}" data-act="room" data-v="${k}" aria-pressed="${ui.room === k}" title="${n}${key ? ' (' + key + ')' : ''}: ${esc(ui.ROOM_INFO[k] || '')}"><svg viewBox="0 0 24 24">${ICON[k === 'staff' ? 'staff' : k]}</svg><small>${n}</small>${key ? `<kbd>${key}</kbd>` : ''}${dot(k)}</button>`;
    const at = ui.roomAct(k);
    return at && at === next ? `<button id="rail-${k}" class="locked" data-act="roomLocked" data-v="${k}" title="${n}: opens in ${esc(IC.ACTS[at].name)}, ${esc(IC.ACTS[at].title)}. ${esc(ui.ROOM_INFO[k] || '')}"><svg viewBox="0 0 24 24">${ICON[k]}</svg><small>${n}</small><span class="lk">${ui.icon('lock')}</span></button>` : '';
  }).join(''));
}


/* research in plain words: what it does, and what it opens in the arsenal */
const TECH_WORDS = {
  s_esm: 'Silent listening posts that find jammers and enemy aircraft radars without transmitting, and mark them hostile.',
  s_cbr: 'A radar that follows incoming rockets back to the launcher that fired them.',
  s_aero: 'A radar on a tethered balloon: it sees far over the horizon, low cruise missiles included.',
  s_bmd: 'A radar that tells real warheads from decoys. Needed to stop missiles in space.',
  c_teams: 'A third shoulder-fired missile team can be called in at once.',
  c_msl: 'Call-in teams get missiles that reach further and that flares fool less.',
  a_cram: 'Fast-firing guns that shoot down rockets, shells and drones close to what they guard.',
  a_hpm: 'A microwave weapon that knocks down a whole swarm of drones at once.',
  a_lrsam: 'A long-range missile battery that covers 100 km around it.',
  a_remote: 'Links every battery: any of them can fire on another radar\'s track, even with its own radar silent.',
  a_pac3: 'Missiles that hit ballistic warheads head-on, for the long-range batteries.',
  a_hatd: 'A battery that meets ballistic missiles 35 to 150 km up, before the lower tier gets its turn.',
  a_exo: 'Interceptors that destroy ballistic missiles in space, halfway through their flight.',
  e_decoy: 'Cheap fake radars that draw anti-radar missiles away from the real ones.',
  e_eccm: 'Every radar resists jamming 30% better and keeps its tracks when aircraft dodge.',
  x_isr: 'One more reconnaissance drone, and reconnaissance drones see 60 km instead of 45.',
  f_aam: 'Fighters carry 6 air-to-air missiles each, and hit more often.'
};
ui.techWords = t => TECH_WORDS[t.id] || t.desc;
ui.techOpens = t => Object.entries(IC.UNITS).filter(([, d]) => d.tech === t.id && !d.callin).map(([k, d]) => d.name)
  .concat(Object.entries(IC.MUN_TECH).filter(([, id]) => id === t.id).map(([m]) => IC.MUN[m] ? (IC.MUN[m].nick || IC.MUN[m].name) + ' missiles' : m));

/* ---------- progression: what is open now, what is new, what opens next ---------- */
/* everything the player can use, by key. A key that appears during play is new: it is marked until the player
   looks at it, and arrives with a short card. Kept in the interface, not the game state. */
const unitOk = (st, t) => { const d = IC.UNITS[t]; return !d.callin && !st.range && (!st.story || IC.storyAllows(st, t)) && IC.hasTech(st, d.tech); };
ui.ROOM_INFO = {
  aviation: 'Operations at our airports, airline deals, the airlines, our airports and the airspace.',
  staff: 'Your career: what each act opens up, your delegates and what command points buy.',
  economy: 'The treasury, the weekly statement, city growth, roads and loans.',
  air: 'The air wing: flights at each base, standing patrols and new aircraft.',
  logi: 'Missile stock, depots, convoys and the arms plants that sell to them.',
  intel: 'What the enemy is doing, what they know about us, and their launchers and bases.',
  research: 'New equipment and upgrades. Two projects run at once.',
  journal: 'Everything that happened, newest first. Click a line to see where.',
  reference: 'How every system works, and every piece of equipment.',
  settings: 'Display, sound, auto-pause and hints.'
};
function openNow() {
  const m = new Map(), st = S.story;
  for (const [k, n, key] of ui.ROOMS) if (ui.roomOk(k)) m.set('room:' + k, { title: `${n} room`, text: ui.ROOM_INFO[k], key, go: { room: k } });
  if (!S.range) for (const t in IC.UNITS) if (unitOk(S, t)) { const d = IC.UNITS[t]; m.set('unit:' + t, { title: d.name, text: `${d.role ? d.role.charAt(0).toUpperCase() + d.role.slice(1) : IC.fullName(d)}, in the arsenal under ${ui.catName(d.cat)}.`, sym: t, go: { cat: d.cat, type: t } }); }
  if (IC.callInOpen(S)) m.set('unit:callin', { title: 'Call-in teams', text: 'Shoulder-fired missile teams dropped by helicopter where you click.', key: 'G', sym: 'manpads', go: { cat: 'ad' } });
  for (const id of S.tech.done) { const t = IC.TECH.find(x => x.id === id); if (t) m.set('tech:' + id, { title: t.name, text: ui.techWords(t), go: { room: 'research' } }); }
  if (st) {
    if (st.act >= 2) m.set('ctl:roe', { title: 'Weapons status', text: 'Top right: Hold, Tight or Free decides when batteries fire on their own.', anchor: 'weapons' });
    if (st.act >= 3) m.set('ctl:doctrine', { title: 'Firing doctrine', text: 'Top right: one missile at a time, two at once, or only sure shots.', anchor: 'doctrine' });
    for (const k in IC.DELEGATES) if (st.act >= IC.DELEGATES[k].act) m.set('del:' + k, { title: IC.DELEGATES[k].name, text: IC.DELEGATES[k].desc, go: { room: 'staff' } });
    for (const R of IC.REQUESTS) if (st.act >= R.act) m.set('req:' + R.id, { title: R.name, text: `${R.desc} Costs ${R.cp} command points.`, go: { room: 'staff' } });
  }
  return m;
}
ui.isNew = k => ui.fresh.has(k);
// the arsenal's tabs in plain words (no "EW"), and Supply as on the rail
ui.catName = id => ({ ad: 'Air defence', ew: 'Jamming', log: 'Supply' }[id] || (IC.CATS.find(c => c.id === id) || { name: id }).name);
ui.seen = pre => { for (const k of [...ui.fresh]) if (k === pre || (pre.endsWith(':') && k.startsWith(pre))) ui.fresh.delete(k); };
function progress() {
  const now = openNow();
  if (!ui.known) { ui.known = new Set(now.keys()); return; }
  const fresh = [...now.keys()].filter(k => !ui.known.has(k));
  if (!fresh.length) return;
  for (const k of fresh) { ui.known.add(k); ui.fresh.add(k); }
  // one card for everything that opened at once (a new act opens several things)
  ui.moments.push({ items: fresh.map(k => Object.assign({ k }, now.get(k))), act: S.story && S.story.act });
}

/* ---------- situation: suggestions in the campaign, the lesson in the Academy ---------- */
function brief() {
  const C = S.camp; if (!C) return;
  let h = '';
  if (S.range) h = IC.rangePanel(S);
  else if (S.mode === 'academy' && C.lesson) {
    const steps = IC.stepText(S);
    const cur = steps.findIndex(s => s.cur), left = steps.length - cur - 1;
    const shown = steps.filter((s, i) => s.cur || (s.done && i >= cur - 2));
    h = `<h3 data-act="briefMin" title="Collapse or expand">${esc(C.lesson.title)}<em>step ${cur + 1} of ${steps.length}</em></h3><div class="steps" style="counter-reset:st ${Math.max(0, cur - 2)}">${shown.map(s => `<div class="step ${s.done ? 'done' : 'cur'}">${esc(s.text)}</div>`).join('')}</div>${left > 0 ? `<p class="hint">${left} more step${left > 1 ? 's' : ''} after this.</p>` : ''}`;
  } else if (S.story && S.story.act < 4) {
    // Act I: the chapter's goals two at a time, the first with a tip on how; later acts: all goals. Each shows how far along it is
    const st = S.story, A = IC.ACTS[st.act], ch = IC.storyChapterInfo(S);
    const done = st.goals.filter(g => g.done).length, shown = IC.storyShown(S).filter(x => !x.g.done || st.act > 1 || S.time - (x.g.doneT || 0) < 2 * 3600);
    const tip = (IC.storyTip(S) || {}).text;
    h = `<h3 data-act="briefMin" title="Collapse or expand">${ch ? `Chapter ${ch.n + 1} · ${esc(ch.title)}` : `${esc(A.name)} · ${esc(A.title)}`}<em>${done} of ${st.goals.length} goals${st.cp ? ` · ${st.cp} command point${st.cp > 1 ? 's' : ''}` : ''}</em></h3>
      <div class="gmeter" title="Goals done">${st.goals.map(g => `<i class="${g.done ? 'on' : ''}"></i>`).join('')}</div>
      <div class="goals">${shown.map(({ g, i }) => { const f = g.done ? 1 : ui.goalFrac(g), p = !g.done && g.prog ? g.prog() : ''; return `<button class="goalrow ${g.done ? 'done' : ''}" data-act="goal" data-v="${i}" title="${g.ref ? 'Click to see where' : ''}"><i>${g.failed ? '✗' : g.done ? '✓' : ''}</i><span>${esc(g.text)}${p || f != null ? `<small>${f != null && !g.done ? `<span class="gbar"><em style="width:${U.clamp(f, 0, 1) * 100}%"></em></span>` : ''}${esc(p || '')}</small>` : ''}</span></button>`; }).join('')}</div>
      ${tip ? `<p class="hint">${esc(tip)} <button class="btn sm" data-act="tutOff" title="Hide these tips (the goals stay)">Hide tips</button></p>` : ''}
      <p class="hint">${ch ? esc(ch.next) : done >= st.goals.length - 1 ? 'Something is coming. Keep the sector running.' : 'Goals earn command points (spend them in the Career room, C) and the Minister’s confidence.'}</p>`;
  } else {
    const sug = C.objs || [];
    h = `<h3 data-act="briefMin" title="Collapse or expand">${esc(C.chapter || 'Situation')}<em>${U.clock(S.time)}</em></h3>
      <div class="goal">${esc(C.goal || '')}</div>
      ${sug.length ? `<div class="sug">${sug.map((o, i) => `<button class="p${o.pri}" data-act="sug" data-v="${i}"><i></i><span>${esc(o.text)}</span></button>`).join('')}</div>` : '<p class="hint">Nothing urgent. Good time to build up: deploy reserves, order stock, research.</p>'}`;
  }
  $('brief').classList.add('glass');
  $('brief').classList.toggle('min', !!ui.briefMin);
  setHTML($('brief'), h);
}
/* how far along a goal is, 0–1, or null when it cannot be said. A goal can give its own (g.frac); otherwise
   it is read from its progress line: "2 of 3", or a number now against the number in the goal. */
const num = t => +String(t).replace(/,/g, '');
ui.goalFrac = function (g) {
  if (g.frac) return g.frac();
  const p = g.prog ? g.prog() : ''; if (!p) return null;
  let m = /([\d,.]+)\s+of\s+([\d,.]+)/.exec(p);
  if (m) return num(m[1]) / Math.max(1e-9, num(m[2]));
  const t = /([\d,]+(?:\.\d+)?)\s*(%|passengers)/.exec(g.text), q = /^\D*([\d,]+(?:\.\d+)?)/.exec(p);
  return t && q ? num(q[1]) / Math.max(1e-9, num(t[1])) : null;
};
function comms() {
  const C = S.camp;
  const Q = C ? C.comms : [];
  if (!Q.length) { setHTML($('comms'), ''); $('comms').classList.remove('glass'); return; }
  const now = performance.now();
  if (Q.length !== ui.lastLen) {
    if (!ui.lastLen) { ui.ci = 0; ui.shownAt = now; }
    else if (ui.ci >= ui.lastLen - 1) { ui.ci = ui.lastLen; ui.shownAt = now; }
    ui.lastLen = Q.length; ui.cOpen = now;
  }
  if (ui.ci >= Q.length) ui.ci = Q.length - 1;
  const m = Q[ui.ci];
  const shown = Math.min(m.text.length, Math.floor((now - ui.shownAt) / 1000 * 75));
  const full = shown >= m.text.length;
  if (full && ui.ci < Q.length - 1 && now - ui.shownAt > Math.max(5000, m.text.length * 50)) { ui.ci++; ui.shownAt = now; }
  // once the last message has been read for a while it folds away, so an old instruction does not linger; a click
  // or the next message opens it again
  if (full && ui.ci === Q.length - 1 && now - (ui.cOpen || 0) > Math.max(30000, m.text.length * 90)) {
    $('comms').classList.add('glass');
    setHTML($('comms'), `<button class="cfold" data-act="copen">${esc(m.name)} · ${Q.length} message${Q.length > 1 ? 's' : ''} ▸</button>`);
    return;
  }
  const init = m.tag === 'CMD' ? m.name.replace('Gen. ', '').split(' ').map(x => x[0]).join('') : m.tag;
  $('comms').classList.add('glass');
  setHTML($('comms'), `<div class="who"><span class="av ${m.tag}">${esc(init)}</span><div><div class="nm">${esc(m.name)}</div><div class="rl2">${esc(m.role)}</div></div></div>
    <p>${esc(m.text.slice(0, shown))}${full ? '' : '▍'}</p>
    <div class="cfoot"><span>${ui.ci + 1} / ${Q.length} · ${U.clock(m.t)}</span><span><button data-act="cprev" ${ui.ci ? '' : 'hidden'}>◂ Back</button><button data-act="cnext" ${ui.ci < Q.length - 1 ? '' : 'hidden'}>Next ▸</button></span></div>`);
}

/* ---------- arsenal: what is in reserve, what is on order ---------- */
function arsenal() {
  const allowed = type => !IC.UNITS[type].callin && !S.range && (!S.story || IC.storyAllows(S, type));
  const cats = IC.CATS.filter(c => Object.entries(IC.UNITS).some(([t, d]) => d.cat === c.id && (allowed(t) || (S.reserve[t] || 0) > 0)));
  if (!cats.length) { setHTML($('arsenal'), ''); $('arsenal').classList.remove('glass'); $('app').classList.add('no-arsenal'); return; }
  $('app').classList.remove('no-arsenal');
  if (!cats.some(c => c.id === ui.cat)) ui.cat = cats[0].id;
  const tabs = cats.map(c => `<button data-act="cat" data-v="${c.id}" aria-pressed="${ui.cat === c.id && !ui.arMin}">${ui.catName(c.id)}${Object.entries(IC.UNITS).some(([t, d]) => d.cat === c.id && ui.fresh.has('unit:' + t)) || (c.id === 'ad' && ui.fresh.has('unit:callin')) ? '<span class="dot new"></span>' : ''}</button>`).join('');
  // call-in teams: an ability, not a unit you buy
  const CI = IC.callInState(S), CK = IC.callInStats(S), ciWhy = IC.callInWhy(S), ciOn = S.mode2 && S.mode2.kind === 'callin';
  const callTile = ui.cat === 'ad' && IC.callInOpen(S) ? `<div class="tile ${ciWhy ? 'locked' : ''}" id="tile-callin" role="button" tabindex="0" data-act="callin" aria-pressed="${!!ciOn}" title="A shoulder-fired missile team, dropped by helicopter anywhere in our territory in ${U.dur(IC.CALLIN.arrive)}. It fights drones, helicopters and low jets for ${U.dur(CK.stay)}, then is lifted out. ${U.money(IC.CALLIN.cost)} a call. Key: G">
      ${ui.sym('manpads')}<span class="res-n">${CI.charges}/${CK.max}</span>${ui.newTag('unit:callin')}
      <span class="tn">Call in a team <kbd>G</kbd></span>
      <span class="tc ${ciWhy ? '' : 'ok'}">${ciWhy ? esc(ciWhy) : `Ready · ${U.money(IC.CALLIN.cost)}`}</span>
      ${CI.charges < CK.max ? `<span class="prog"><i style="width:${CI.t / CK.recharge * 100}%"></i></span>` : ''}
    </div>` : '';
  const tiles = callTile + Object.entries(IC.UNITS).filter(([t, d]) => d.cat === ui.cat && (allowed(t) || (S.reserve[t] || 0) > 0)).map(([type, d]) => {
    const locked = !IC.hasTech(S, d.tech);
    const r = S.reserve[type] || 0;
    const on = S.mode2 && S.mode2.kind === 'deploy' && S.mode2.type === type;
    const tech = locked ? IC.TECH.find(t => t.id === d.tech) : null;
    const why = r ? '' : IC.buyBlock(S, type);
    return `<div class="tile ${locked ? 'locked' : ''}" id="tile-${type}" role="button" tabindex="0" data-act="deploy" data-v="${type}" aria-pressed="${on}" title="${esc(IC.fullName(d))}. ${esc(d.desc)}${locked ? ` Research ${esc(tech.name)} to use it: click to open Research.` : ''}">
      ${ui.sym(type)}${r ? `<span class="res-n">×${r}</span>` : ''}${ui.newTag('unit:' + type)}
      <span class="tn">${esc(d.name)}</span><span class="tr">${esc(d.role || '')}</span>
      ${locked ? `<span class="tc">${ui.icon('lock', 'sm')} ${esc(tech.name)}</span>` : r ? `<span class="tc ok">Deploy · free</span>` : `<span class="tc ${why ? '' : 'ok'}">${U.money(IC.unitCost(S, type))} · ${why ? 'not enough money' : 'buy &amp; place'}</span>`}
    </div>`;
  }).join('');
  $('arsenal').classList.add('glass');
  $('arsenal').classList.toggle('min', ui.arMin);
  setHTML($('arsenal'), `<div class="ar-head"><div class="tabs">${tabs}<button data-act="arMin" title="${ui.arMin ? 'Show' : 'Hide'} the arsenal">${ui.arMin ? '▴' : '▾'}</button></div><div class="slots" title="Pick one, then click the map. Bought equipment is paid when you place it, loaded at the nearest depot or airfield and driven there at once."><span>Pick one, then click the map</span></div></div><div class="tiles">${tiles}</div>`, ui.cat);
}

function layers() {
  const L = [['coverage', 'Coverage'], ['rings', 'Ranges'], ['logistics', 'Supply'], ['civil', 'Traffic'], ['airways', 'Airways'], ['intel', 'Intel'], ['weather', 'Weather'], ['labels', 'Labels']];
  // with coverage on, a key to its colours: the lowest height controllers see
  const key = S.layers.coverage && S.asp ? `<div class="covkey" title="Radar cover for air traffic control: the lowest height a radar that reads transponders sees. Red: no radar sees our airspace there at any height. Blue: our military radars, deeper where they see lower."><span>Radar sees down to</span>${IC.ASP_BANDS.map(([, n], i) => `<em><i style="background:rgb(${IC.BAND_RGB[i]})"></i>${n.replace('below ', '<').replace('above ', '>')}</em>`).join('')}<em><i style="background:rgb(255,90,70)"></i>nothing</em><em title="Our military radars. Hills hide low aircraft from them: the holes behind high ground are where low fliers get through."><i style="background:rgb(92,200,255)"></i>military: deeper blue sees lower</em></div>` : '';
  setHTML($('layers'), L.filter(([k]) => IC.layerAllowed(S, k)).map(([k, n]) => `<button data-act="layer" data-v="${k}" aria-pressed="${!!S.layers[k]}">${n}</button>`).join('') + key);
}
function modeHint() {
  const m = S.mode2, el = $('modehint');
  if (!m) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = {
    rangeTarget: () => 'Click the map where the threats should aim.',
    callin: () => `Click inside ${S.world.names.H} to drop a missile team there. Shift-click to call another. Right-click or Esc to cancel.`,
    deploy: () => `Click inside ${S.world.names.H} to place the ${IC.UNITS[m.type].name}${S.reserve[m.type] > 0 ? ' from the reserve' : `: ${U.money(IC.unitCost(S, m.type))}, paid when placed`}. The dashed rings show its reach. Shift+click places more. Right-click or Esc to cancel.`,
    move: () => `Click where ${m.unit.name} should go.`,
    airPoint: () => m.task ? `Click the map to place the ${IC.TASK_KIND[m.task].name.toLowerCase()} station.` : `Click the map to send ${m.r.name}.`,
    airSite: () => `Click an enemy target for ${m.r.name}.`,
    fireAt: () => `Click an enemy target for ${m.unit.name}.`,
    build: () => buildHint(m),
    bmove: () => `Click where the ${U.lc(IC.APART[m.part.kind].name)} should go. R turns it. Esc to cancel.`,
    bulldoze: () => 'Click a part of the airport to remove it. Planned work is refunded in part. Esc to stop.',
    airway: () => m.from ? `Click the next fix, or empty map for a new one, to extend the airway from ${IC.aspFix(S, m.from) ? IC.aspFix(S, m.from).name : 'here'}. Right-click ends the airway; drag a fix to move it; Delete removes the selected one. Esc to stop.`
      : 'Airways: click the map to place a fix, then keep clicking to join fixes into an airway. Click an airway to add a fix on it; drag fixes to move them. Airports join the nearest fix within 120 km. Esc to stop.',
    field: () => `Click a flat site near a town for a light-aircraft field (${U.money(IC.ASP.FIELD_COST)}). The town's flying club moves there from the big airport.`,
    asp: () => IC.aspModeHint(m),
    zone: () => m.c ? 'Click again to set the radius of the prohibited zone.' : 'Click the centre of a prohibited zone. Civil routes will fly around it.',
    road: () => `${IC.ROADS[m.cls].name}, ${IC.ROADS[m.cls].what}: start at one of your airports and click points to the road it joins. ${m.plan && m.pts.length >= 2 ? `${m.plan.km.toFixed(1)} km, ${U.money(m.plan.cost)}, open in about ${U.dur(m.plan.hours * 3600)}${m.plan.why ? ` · ${m.plan.why.replace(/\.$/, '')}` : ' · right-click or Enter to build'}. ` : ''}Backspace undoes a point, Esc cancels.`,
    found: () => m.site ? `Turn the runway with the cursor, then click to found the airport. Right-click picks another site.\n${S.hover ? IC.foundLines(S, IC.foundSurvey(S, m.site.x, m.site.y, IC.foundAngle(m.site, S.hover))).join(' · ') : ''}`
      : `Click a flat site in ${S.world.names.H} for a new airport (from ${U.money(IC.FOUND_COST)} with land). At the edge of a town is fine; at least 12 km from another airport.`
  }[m.kind]();
}
/* the builder: how to use the tool, and what the plan under the cursor will do */
function buildHint(m) {
  const t = m.part, n = m.pts.length, D = IC.APART[t], T = IC.BTOOLS[t];
  const again = 'click the last point again (or Enter) to build';
  const how = t === 'taxi' ? `Taxiway: click points; ends snap to runways, aprons and taxiways. ${n >= 2 ? again[0].toUpperCase() + again.slice(1) + '.' : ''} Corners are ${m.fillet ? 'rounded (F: sharp)' : 'sharp (F: rounded)'}.`
    : t === 'runway' ? (n < 2 ? 'Runway: click one end, then the other.' : `Runway: click the far end again (or Enter) to build; click elsewhere to move it.`)
    : t === 'concourse' ? (n < 2 ? 'Concourse: click one end of the pier, then the other.' : 'Concourse: click the far end again (or Enter) to build.')
    : t === 'parallel' ? (n ? 'Move out from the runway to set the distance; click again to build.' : T.desc)
    : t === 'exits' ? (n ? 'Click the same runway again to build these exits.' : T.desc)
    : t === 'hold' ? (n ? 'Click the same runway end again to build it.' : T.desc)
    : t === 'stand' ? T.desc
    : t === 'stretch' ? (n ? 'Move out to where the new edge should be, then click again (or Enter) to build.' : T.desc)
    : IC.bldIsArea(t) ? (n < 2 ? `${T ? T.name : D.name}: click one corner, then the opposite one. R turns it 15°.` : `${T ? T.name : D.name}: click the second corner again (or Enter) to build; click elsewhere to resize.`)
    : `${D.name}: click to place, click the same spot again to build. Near a taxiway or apron it turns to face it and gets a way in; Shift places it freely. R turns it.`;
  const plan = S.hover ? IC.bldPlanOf(S, m, S.hover, Math.max(0.12, 8 / IC.cam.z), !!IC.bldFree) : null;
  const info = plan ? (plan.ok ? [plan.text[0], plan.size].concat(plan.text.slice(1)) : [plan.why, plan.size].concat(plan.text)).filter(Boolean).join(' · ') : '';
  const snap = IC.bldIsLine(t) || IC.bldIsArea(t) ? ` Lines keep to 0°, 45° and 90° and lock onto the dashed guides; ${IC.bldFree ? 'Shift held: drawing freely.' : 'hold Shift to draw freely.'}` : '';
  return `${how}${snap} Right-click takes a point back; Esc stops.${info ? '\n' + info : ''}`;
}
const covTxt = a => a === Infinity ? 'no height (no radar)' : a < 0.05 ? 'the ground' : U.alt(a);
ui.covTxt = covTxt;
/* the hover card: what is under the cursor, and what a right-click would do there, so it never surprises */
ui.tip = function (ent, sx, sy, rc) {
  const el = $('tip');
  if (!ent && !rc) { el.hidden = true; return; }
  if (!ent) { el.innerHTML = `<em class="rc">${ui.icon('target', 'sm')} Right-click: ${esc(rc)}</em>`; el.hidden = false; place(el, sx, sy); return; }
  const r = ent.ref;
  let t = '', s = '';
  if (ent.kind === 'track') { t = `TN ${r.tn} · ${IC.AFF[r.aff || 'U'].name}${r.klass ? ' · ' + (IC.KLASS[r.klass] || r.klass) : ''}`; s = `${r.sq ? 'Squawk ' + r.sq + ' · ' : ''}${r.altKnown ? U.alt(r.alt) : 'altitude unknown'} · ${U.kmh(Math.hypot(r.vx, r.vy))}`; }
  else if (ent.kind === 'unit') { t = `${r.name} · ${IC.fullName(r.d)}`; s = r.why || IC.unitState(r)[0]; }
  else if (ent.kind === 'veh') { t = r.name; s = r.job ? r.job.label : 'Parked'; }
  else if (ent.kind === 'air') { t = r.name; s = (IC.AIR_KIND[r.kind] || {}).name || 'Airlift'; }
  else if (ent.kind === 'site') { t = r.name; s = `${r.destroyed ? 'Destroyed' : r.pk >= 2 ? 'Located' : 'Suspected'}`; }
  else if (ent.kind === 'tel') { t = r.name; s = `Seen ${U.dur(S.time - r.kt)} ago`; }
  else if (ent.kind === 'infra') { t = r.name; s = r.kind === 'city' ? `${r.pop}k · morale ${Math.round(r.morale)}%` : r.kind === 'bridge' ? (r.offline ? 'Destroyed' : 'Bridge') : r.parts ? (r.locked ? 'Air Force base' : `${IC.rwyState(S, r).word} · ${IC.aptStands(r).filter(x => x.occ).length}/${IC.aptStands(r).length} stands${r.kind === 'airbase' ? ` · ${S.roster.filter(x => x.base === r.id && x.st !== 'lost').length} flights` : ''}${r.st && r.st.warn.length ? ` · ${r.st.warn.length} problems` : ''}`) : ({ factory: 'Arms factory', power: 'Power plant' }[r.kind]); }
  else if (ent.kind === 'fix') { t = `Fix ${r.name}`; s = `${S.asp.ways.filter(w => w.a === r.id || w.b === r.id).length} airways · radar sees down to ${covTxt(IC.aspCovAlt(S, r.x, r.y))} here`; }
  else if (ent.kind === 'airway') { const [a, b] = IC.aspWayEnds(S, r); t = `Airway ${a.name} – ${b.name}`; s = `${U.km(U.dist(a, b))} · radar sees ${U.pct(IC.aspWayCover(S, r, 9))} of it at cruise height`; }
  else if (ent.kind === 'field') { t = r.name; s = `Light aircraft · ${r.club} · ${r.today} movements today`; }
  else if (ent.kind === 'apart') { const D = IC.APART[r.kind]; t = `${D.name} · ${ent.ap.name}`; s = !r.built ? `Planned · ${U.pct(r.prog || 0)}` : r.hp <= r.max * 0.25 ? 'Destroyed' : r.hp < r.max ? `Damaged · ${U.pct(r.hp / r.max)}` : r.kind === 'runway' ? `${U.km(IC.rwLen(r))}${r.craters.length ? ` · ${r.craters.length} craters` : ''}` : r.kind === 'fuel' ? `${Math.round(r.stock || 0)}/${D.cap} fuel` : r.kind === 'apron' ? `${(r.stands || []).length} stands` : D.desc; }
  el.innerHTML = `<b>${esc(t)}</b><span>${esc(s)}</span>${rc ? `<em class="rc">${ui.icon('target', 'sm')} Right-click: ${esc(rc)}</em>` : ''}`;
  el.hidden = false;
  place(el, sx, sy);
};
function place(el, sx, sy) { const W = $('app').clientWidth; el.style.left = Math.min(W - 300, sx + 16) + 'px'; el.style.top = (sy + 16) + 'px'; }

/* ---------- cinematic cards ---------- */
function cine() {
  const C = S.camp, el = $('cine');
  if (!C || !C.cards) return;
  const now = performance.now();
  // a chapter card waits until the player closes the room they are reading
  if (el.hidden && !ui.room && $('start').hidden && ui.cineShown < C.cards.length && now > ui.cineT) {
    const c = C.cards[ui.cineShown];
    el.className = 'cine ' + c.kind; el.hidden = false;
    el.innerHTML = `<small>${esc(c.sub)}</small><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><div class="cfoot"><span>click to continue</span></div>`;
    ui.cineUntil = now + (c.kind === 'chapter' ? 7000 : 12000);
    if (c.kind === 'chapter' && S.cfg.bars) IC.cine = Object.assign(IC.cine || {}, { barsT: 2.5 });
    IC.sfx && IC.sfx.ui('chapter');
  } else if (!el.hidden && now > ui.cineUntil) ui.closeCine();
}
ui.closeCine = () => { const el = $('cine'); if (el.hidden) return; el.hidden = true; ui.cineShown++; ui.cineT = performance.now() + 800; };


/* ---------- hints: a ring on something on screen and a short note next to it ----------
   IC.hint.show(id, { el, at, title, text, side, btn, persist, ring }) points at an interface element (an anchor
   name below, a CSS selector or an element) or a place on the map ({x, y} in world units, or a function of the
   state that returns one). A persistent hint (the default) is shown once per browser: "Got it" remembers it.
   IC.hint.tour(id, [steps]) shows a series one after another. The Academy uses a ring without a note; the
   Career's first minutes use a short tour; the Career tutorial can use both. */
const hintStore = store.get('ic-hints', {});
ui.hintsOn = store.get('ic-hints-on', true);
const ANCHORS = {
  speed: '#speed', pause: '#speed .pz', skip: '#speed .skip', goals: '#brief', brief: '#brief', comms: '#comms', arsenal: '#arsenal', insp: '#insp',
  rail: '#rail', treasury: '#stat-money', menu: '#menuBtn', layers: '#layers', minimap: '#mini', weapons: '.rl.weapons', doctrine: '.rl.doctrine',
  airspace: '.rl.airspace', feed: '#feed', incidents: '#incidents', evcard: '#evcard', airpic: '#airpic'
};
const anchorEl = a => {
  if (!a) return null;
  if (a.nodeType === 1) return a;
  if (typeof a === 'function') return anchorEl(a(S));
  if (ANCHORS[a]) return document.querySelector(ANCHORS[a]);
  let m;
  if ((m = /^rail-(\w+)$/.exec(a))) return $('rail-' + m[1]);
  if ((m = /^room-(\w+)$/.exec(a))) return document.querySelector(`#wrTabs [data-v="${m[1]}"]`);
  if ((m = /^apt-(\w+)$/.exec(a))) return document.querySelector(`#insp [data-act="aptTab"][data-v="${m[1]}"]`);
  if ((m = /^tile-(\w+)$/.exec(a))) return $('tile-' + m[1]);
  if ((m = /^cat-(\w+)$/.exec(a))) return document.querySelector(`#arsenal [data-act="cat"][data-v="${m[1]}"]`);
  if ((m = /^act-(\w+)$/.exec(a))) return document.querySelector(`[data-act="${m[1]}"]`);
  try { return document.querySelector(a); } catch (e) { return null; }
};
const hints = new Map();
IC.hint = {
  anchors: ANCHORS,
  find: anchorEl,
  done: id => !!hintStore[id],
  show(id, o) {
    o = Object.assign({ persist: true, ring: true, side: 'auto', btn: 'Got it' }, o);
    if (o.persist && (hintStore[id] || !ui.hintsOn)) return false;
    hints.set(id, o); return true;
  },
  hide(id, remember) { const o = hints.get(id); if (!o) return; hints.delete(id); if (remember && o.persist) { hintStore[id] = 1; store.set('ic-hints', hintStore); } if (o.next) o.next(); },
  clear() { hints.clear(); },
  active: id => hints.has(id),
  reset() { for (const k in hintStore) delete hintStore[k]; store.set('ic-hints', hintStore); },
  tour(id, steps) {
    if (hintStore[id] || !ui.hintsOn) return;
    let i = 0;
    const next = () => { while (i < steps.length) { const s = steps[i++]; if (s.el && !anchorEl(s.el)) continue; if (IC.hint.show(id + ':' + i, Object.assign({}, s, { persist: false, next, tour: id, of: [i, steps.length] }))) return; } hintStore[id] = 1; store.set('ic-hints', hintStore); };
    next();
  },
  skipTour(id) { for (const [k, o] of [...hints]) if (o.tour === id) hints.delete(k); hintStore[id] = 1; store.set('ic-hints', hintStore); }
};
/* the note on top, for Esc; the Academy's ring has no note */
ui.topHint = () => { let id = null; for (const [k, o] of hints) if (o.text) id = k; return id; };
/* placed every frame (things on screen move, the map scrolls); each hint keeps its own elements */
const hEls = new Map();
const noteHTML = (id, o) => `${o.title ? `<b>${esc(o.title)}</b>` : ''}<p>${esc(o.text)}</p><div class="hfoot">${o.of ? `<span>${o.of[0]} of ${o.of[1]}</span>` : '<span></span>'}<span>${o.tour ? `<button class="btn sm ghost" data-act="hintSkip" data-v="${esc(o.tour)}">Skip tips</button>` : ''}<button class="btn sm primary" data-act="hintOk" data-v="${esc(id)}">${esc(o.btn)}</button></span></div>`;
ui.hintFrame = function () {
  const L = $('hints');
  for (const [id, h] of hEls) if (hints.get(id) !== h.o) { h.ring.remove(); if (h.note) h.note.remove(); hEls.delete(id); }
  if (!hints.size) return;
  const W = $('app').getBoundingClientRect();
  const covered = !!ui.room, blocked = ui.menu || !$('unlock').hidden || !$('evcard').hidden || !$('cine').hidden || !$('start').hidden;
  for (const [id, o] of hints) {
    let h = hEls.get(id);
    if (!h) {
      h = { o, ring: document.createElement('div'), note: null };
      h.ring.className = 'hring'; L.appendChild(h.ring);
      if (o.text) { h.note = document.createElement('div'); h.note.className = 'hnote'; h.note.innerHTML = noteHTML(id, o); L.appendChild(h.note); }
      hEls.set(id, h);
    }
    let r = null;
    if (o.at) { const p = typeof o.at === 'function' ? o.at(S) : o.at; if (p) { const q = IC.toScreen(p.x, p.y), R = o.r || 26; r = { left: q.x - R, top: q.y - R, width: 2 * R, height: 2 * R }; } }
    else { const e = anchorEl(o.el); if (e && e.offsetParent !== null && !(covered && !$('warroom').contains(e))) { const b = e.getBoundingClientRect(); if (b.width) r = { left: b.left - W.left, top: b.top - W.top, width: b.width, height: b.height }; } }
    // a note waits while a card, the menu or a room covers the screen (unless it points into the room)
    if (r && o.text && blocked) r = null;
    h.ring.hidden = !r || !o.ring; if (h.note) h.note.hidden = !r;
    if (!r) continue;
    h.ring.classList.toggle('round', !!o.at);
    h.ring.style.cssText = `left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px`;
    if (!h.note) continue;
    // the note goes on the side with the most room
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, bw = Math.min(310, W.width - 32);
    let side = o.side;
    if (side === 'auto') side = W.width - r.left - r.width > bw + 40 ? 'right' : r.left > bw + 40 ? 'left' : 'below';
    if (side === 'below' && r.top + r.height > W.height * 0.62) side = 'above';
    h.note.className = 'hnote ' + side;
    h.note.style.cssText = `width:${bw}px;` + (side === 'right' ? `left:${r.left + r.width + 16}px;top:${U.clamp(cy - 44, 8, W.height - 170)}px` : side === 'left' ? `left:${r.left - bw - 16}px;top:${U.clamp(cy - 44, 8, W.height - 170)}px`
      : side === 'above' ? `left:${U.clamp(cx - bw / 2, 8, W.width - bw - 8)}px;bottom:${W.height - r.top + 14}px` : `left:${U.clamp(cx - bw / 2, 8, W.width - bw - 8)}px;top:${r.top + r.height + 14}px`);
  }
};

/* the Academy: a ring on what the current step talks about (the step itself is in the lesson panel).
   A game mode can also point from the simulation without touching the page: S.hint = { id, el or at, title,
   text } shows one hint (a note when it has text), and setting it to null or another id takes it away. */
function coach() {
  const h = IC.stepHint && IC.stepHint(S), cur = hints.get('lesson');
  if (!h || !h.el) { if (cur) IC.hint.hide('lesson'); }
  else if (!cur || cur.el !== h.el) { hints.delete('lesson'); IC.hint.show('lesson', { el: h.el, persist: false }); }
  const sh = S.hint || null, id = sh ? 'game:' + (sh.id || sh.el || 'at') : null;
  if (ui.gameHint && ui.gameHint !== id) { hints.delete(ui.gameHint); ui.gameHint = null; }
  if (id && !hints.has(id) && ui.gameHint !== id) { IC.hint.show(id, Object.assign({ btn: 'OK' }, sh, { persist: false })); ui.gameHint = id; }
}
/* the first minutes of a game: a few notes on where things are, once per browser */
function firstRun() {
  if (ui.firstRunDone === S || S.over || !$('start').hidden || !$('cine').hidden || !$('evcard').hidden || ui.room) return;
  ui.firstRunDone = S;
  if (S.story) IC.hint.tour('career1', [
    { el: 'goals', title: 'Your goals', text: 'This act\'s goals, with how far along each one is. Click a goal to see where it is on the map.' },
    { el: 'rail-aviation', title: 'The rooms', text: 'Rooms for everything that does not fit on the map. Aviation holds the airlines\' deals. Keys are on each button.' },
    { el: 'speed', title: 'Time', text: 'The game runs at 1×: ten game seconds a second. Space pauses, 1–6 set the speed, S skips ahead until something needs you.' },
    { el: 'menu', title: 'The menu', text: 'Esc backs out of whatever is open; with nothing open it brings up the menu: settings, the Guide and quitting.' }
  ]);
  else if (S.mode === 'campaign' || S.mode === 'sandbox') IC.hint.tour('war1', [
    { el: 'arsenal', title: 'The arsenal', text: 'Equipment in reserve and for sale. Pick one, then click the map to place it. Right-click cancels.' },
    { el: 'brief', title: 'The situation', text: 'Your staff\'s suggestions, most urgent first. Click one to see where.' },
    { el: 'menu', title: 'The menu', text: 'Esc backs out of whatever is open; with nothing open it brings up the menu: settings, the Guide and quitting.' }
  ]);
}

/* ---------- unlocks: a short card when something opens ---------- */
function moment() {
  const el = $('unlock'), now = performance.now();
  if (!el.hidden) { if (now > ui.momentUntil) ui.closeMoment(); return; }
  if (!ui.moments.length || now < ui.momentT || !$('cine').hidden || !$('evcard').hidden || !$('start').hidden || ui.menu) return;
  const mo = ui.moment = ui.moments.shift(), it = mo.items, one = it.length === 1, go = it.find(x => x.go) || null;
  const research = it.every(x => x.k.startsWith('tech:'));
  const kick = research ? 'Research complete' : mo.act && it.some(x => x.k.startsWith('room:')) ? `${IC.ACTS[mo.act].name} · new orders` : 'Unlocked';
  const label = go ? go.go.room ? `Open ${ui.roomName(go.go.room)}${(ui.ROOMS.find(r => r[0] === go.go.room) || [])[2] ? ` <kbd>${ui.ROOMS.find(r => r[0] === go.go.room)[2]}</kbd>` : ''}` : 'Show in the arsenal' : '';
  ui.setHTML(el, `<div class="ul-shine"></div><small>${ui.icon(research ? 'research' : 'star', 'sm')} ${esc(kick)}</small>
    ${one ? `<div class="ul-one">${it[0].sym ? ui.sym(it[0].sym, 72, 56) : ''}<div><h2>${esc(it[0].title)}</h2><p>${esc(it[0].text)}${it[0].k.startsWith('tech:') && ui.techOpens(IC.TECH.find(t => 'tech:' + t.id === it[0].k)).length ? ` Opens: ${esc(ui.techOpens(IC.TECH.find(t => 'tech:' + t.id === it[0].k)).join(', '))}.` : ''}</p></div></div>`
      : `<h2>${it.length} new things</h2><ul>${it.slice(0, 6).map(x => `<li><b>${esc(x.title)}</b><span>${esc(x.text)}</span></li>`).join('')}${it.length > 6 ? `<li><span>and ${it.length - 6} more: they are marked New.</span></li>` : ''}</ul>`}
    <div class="ul-foot">${go ? `<button class="btn primary" data-act="momentGo">${label}</button>` : ''}<button class="btn" data-act="momentX">OK <kbd>Esc</kbd></button></div>`, ui.oid(mo));
  el.hidden = false; ui.momentUntil = now + (one ? 7000 : 11000);
  IC.sfx && IC.sfx.ui('chapter');
}
ui.closeMoment = () => { $('unlock').hidden = true; ui.momentT = performance.now() + 900; };
ui.momentGo = () => {
  const mo = ui.moment, x = mo && mo.items.find(i => i.go); ui.closeMoment(); if (!x) return;
  if (x.go.room) ui.openRoom(x.go.room);
  else if (x.go.cat) { if (ui.room) ui.openRoom(null); ui.cat = x.go.cat; ui.arMin = false; ui.refresh(true); }
};

/* ---------- refresh ---------- */
ui.refresh = function (force) {
  if (!S) return;
  progress(); topbar(); rail(); brief(); comms(); feed(); layers(); modeHint(); cine(); moment(); coach(); firstRun();
  const busy = performance.now() < ui.busyUntil;
  if (!busy || force) { arsenal(); IC.renderInspector(S); if (ui.room) IC.renderRoom(S, ui.room); }
  $('app').classList.toggle('has-insp', !!$('insp').innerHTML);
  // how much of the map's right side the inspector covers, for what the map draws beside the cursor
  { const lc = document.querySelector('.leftcol').getBoundingClientRect(); ui.mapLeft = lc.height > 40 ? lc.right - $('app').getBoundingClientRect().left + 8 : 0; }
  ui.mapRight = $('insp').innerHTML ? Math.max(0, $('app').getBoundingClientRect().right - $('insp').getBoundingClientRect().left) : 0;
  $('app').classList.toggle('at-start', !$('start').hidden);
  $('app').classList.toggle('has-room', !!ui.room);
  $('app').classList.toggle('is-range', !!S.range);   // (the test range is an empty plane: no minimap to show)
  if (S.over && !ui.overDismissed && $('over').hidden) showOver();
};
function showOver() {
  $('over').hidden = false; ui.closeCine(); ui.closeMoment(); IC.hint.clear(); ui.toggleMenu(false);
  const aca = S.mode === 'academy', story = !!S.story;
  $('overKicker').textContent = aca ? 'Academy' : story ? `${IC.ACTS[S.story.act].name} · ${S.story.role}` : S.won ? 'Victory' : 'Defeat';
  $('overTitle').textContent = aca ? (S.won ? 'Lesson complete' : 'Lesson failed') : S.won ? 'Ceasefire' : story && S.story.standing <= 0 ? 'Replaced' : 'The defence has failed';
  $('overTitle').style.color = S.won ? 'var(--friend)' : 'var(--hostile)';
  $('overText').textContent = S.over;
  $('overStars').textContent = aca && S.won ? '★'.repeat(S.stars || 1) + '☆'.repeat(3 - (S.stars || 1)) : '';
  const L = aca && S.camp.lesson ? IC.LESSONS.findIndex(l => l.id === S.camp.lesson.id) : -1;
  $('overNext').hidden = !(aca && S.won && L >= 0 && L < IC.LESSONS.length - 1);
  $('overRetry').hidden = !(aca && !S.won);
  if (aca && S.won) { const p = store.get('ic-academy', {}); p[S.camp.lesson.id] = Math.max(p[S.camp.lesson.id] || 0, S.stars || 1); store.set('ic-academy', p); }
  const st = [['Time', U.clock(S.time)], ['Threats destroyed', S.stats.kills, 'ok'], ['Got through', S.stats.leakers, S.stats.leakers ? 'hostile' : ''], ['Interceptors fired', S.stats.fired], ['Units lost', S.stats.unitsLost, S.stats.unitsLost ? 'hostile' : ''], ['Aircraft lost', S.stats.acLost, S.stats.acLost ? 'hostile' : ''], ['Enemy sites destroyed', S.stats.siteKills], ['Civil aircraft lost', S.stats.civLost, S.stats.civLost ? 'hostile' : '']];
  $('overStats').innerHTML = st.map(([k, v, c]) => `<div><small>${k}</small><b class="${c || ''}">${v}</b></div>`).join('');
  IC.sfx && IC.sfx.ui(S.won ? 'ok' : 'err');
}

/* ---------- selection and modes ---------- */
IC.select = function (sel, add) {
  if (add && sel && sel.kind === 'unit') {
    if (!S.group.length && S.sel && S.sel.kind === 'unit') S.group = [S.sel.ref];
    if (S.group.includes(sel.ref)) S.group = S.group.filter(x => x !== sel.ref); else S.group.push(sel.ref);
    S.sel = S.group.length === 1 ? { kind: 'unit', ref: S.group[0] } : S.group.length ? sel : null;
  } else { S.sel = sel; S.group = []; }
  if (sel) IC.emit(S, 'select', sel);
  IC.sfx && IC.sfx.ui('click');
  ui.refresh(true);
};
IC.setMode = function (m) { S.mode2 = m; document.getElementById('map').classList.toggle('placing', !!m); ui.refresh(true); };
ui.openRoom = function (k) {
  const was = ui.room;
  if (was && ui.seenOnClose === was) { ui.seen({ research: 'tech:', staff: 'del:' }[was] || '-'); if (was === 'staff') ui.seen('req:'); }
  // a room opened from the menu keeps the game paused until the room closes
  if (ui.menu) { const p = ui.pausedByMenu; ui.pausedByMenu = false; ui.toggleMenu(false); if (p && k) ui.pausedByRoom = true; else if (p) S.paused = false; }
  // each room opens where the player left it
  if (was) ui.roomScroll[ui.keys.wrBody || was] = $('wrBody').scrollTop;
  ui.room = was === k ? null : k;
  $('warroom').hidden = !ui.room;
  ui.cache.wrBody = null; ui.cache.wrTabs = null; ui.keys.wrBody = null;
  if (ui.room) {
    IC.emit(S, 'warroom', k); if (!was && ui.pauseRoom) { ui.pausedByRoom = ui.pausedByRoom || !S.paused; S.paused = true; }
    // looking is enough: what the room shows is no longer new once the player leaves it
    ui.seenOnClose = k;
    ui.seen('room:' + k);
  }
  else if (ui.pausedByRoom) { S.paused = false; ui.pausedByRoom = false; }
  ui.refresh(true);
};
ui.jump = function (ref, kind) {
  if (!ref) return;
  const p = ref.kx != null && ref.tel ? { x: ref.kx, y: ref.ky } : ref.px != null && ref.tn ? { x: ref.px, y: ref.py } : ref;
  IC.flyTo(p.x, p.y, Math.max(IC.cam.z, 0.35));
  if (kind) IC.select({ kind, ref });
  S.fx.rings.push({ x: p.x, y: p.y, r: 40, t: 0, color: '242,180,65', px: true });
};

/* ---------- the menu (Esc): the game pauses underneath ---------- */
ui.toggleMenu = function (on) {
  on = on == null ? !ui.menu : on;
  if (on === ui.menu) return;
  ui.menu = on; $('menu').hidden = !on;
  if (on) { ui.pausedByMenu = !S.paused; S.paused = true; }
  else if (ui.pausedByMenu) { S.paused = false; ui.pausedByMenu = false; }
  $('menuTime').textContent = `${U.clock(S.time)} · ${S.story ? `${IC.ACTS[S.story.act].name}, ${S.story.role}` : { campaign: 'Quick war', sandbox: 'Sandbox', academy: 'Academy', range: 'Test range' }[S.mode] || ''}`;
};

/* ---------- start screen: the title, the modes, and pages for the Academy, settings and controls ---------- */
ui.startPage = function (pg) {
  ui.stPage = pg || 'main';
  for (const k of ['main', 'lessons', 'saves', 'settings', 'keys']) $('st-' + k).hidden = k !== ui.stPage;
  if (ui.stPage === 'lessons') ui.lessonList();
  if (ui.stPage === 'saves' && IC.savesPage) IC.savesPage();
  if (ui.stPage === 'main' && IC.saves) IC.saves.refresh();
  if (ui.stPage === 'settings') setHTML($('stSettings'), IC.settingsHTML(S, true));
  const p = store.get('ic-academy', {}), n = IC.LESSONS.filter(l => p[l.id]).length;
  $('acaProg').textContent = n ? `${n} of ${IC.LESSONS.length} done · ${Object.values(p).reduce((a, b) => a + b, 0)} stars` : `${IC.LESSONS.length} lessons, 5 minutes each`;
};
ui.lessonList = function () {
  const p = store.get('ic-academy', {});
  const next = IC.LESSONS.findIndex(l => !p[l.id]);
  $('lessons').innerHTML = IC.LESSONS.map((l, i) => `<button class="lesson ${p[l.id] ? 'done' : ''} ${i === next ? 'next' : ''}" data-act="lesson" data-v="${l.id}"><i>${p[l.id] ? '✓' : i + 1}</i><b>${esc(l.title)}</b><span>${esc(l.sub)}</span><em>${p[l.id] ? '★'.repeat(p[l.id]) + '☆'.repeat(3 - p[l.id]) : i === next ? 'Start here' : ''}</em></button>`).join('');
};

})(window.IC);
