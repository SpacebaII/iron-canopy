/* Iron Canopy — HUD shell: top bar, war-room rail, situation and staff panels, feed, arsenal, overlays.
   Panels rebuild from HTML strings only when their content changes, and never while a pointer is held down
   inside them, so clicks are never lost. The inspector and war rooms live in their own files. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const ui = IC.ui = { cat: 'ad', room: null, busyUntil: 0, cache: {}, ci: 0, shownAt: 0, lastLen: 0, toasts: [], cineShown: 0, cineT: 0, roomScroll: {}, aptTab: 'info', arMin: false, logFilter: 'all', refCat: 'units' };
let S = null;
const esc = U.esc;
ui.esc = esc;
ui.kbd = k => k ? `<kbd>${k}</kbd>` : '';
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

ui.bind = function (state) { S = state; ui.cache = {}; ui.keys = {}; ui.roomScroll = {}; ui.ci = 0; ui.lastLen = 0; ui.shownAt = performance.now(); ui.toasts = []; ui.cineShown = 0; ui.room = null; ui.overDismissed = false; $('warroom').hidden = true; ui.refresh(true); };

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
  setHTML($('feed'), ui.toasts.map((t, i) => `<button class="toast ${t.kind}" data-k="${t.id}" data-act="toast" data-v="${i}"><b>${esc(t.tag)}</b><span>${esc(t.msg)}</span><time>${U.hhmm(t.time)}</time></button>`).join(''));
}

/* ---------- top bar ---------- */
function topbar() {
  $('hClock').textContent = U.clock(S.time);
  const L = IC.daylight(S.time), h = (S.time % 86400) / 3600;
  $('hSky').textContent = `${L >= 1 ? 'Day' : L <= 0 ? 'Night' : (h < 12 ? 'Dawn' : 'Dusk')} · ${IC.WEATHER[S.weather.kind].name}`;
  setHTML($('speed'), `<button class="pz" data-act="pause" aria-pressed="${S.paused}" title="Pause (Space)">❚❚</button>` +
    IC.SPEEDS.map((v, i) => `<button data-act="speed" data-v="${v}" aria-pressed="${!S.paused && !S.skip && S.speed === v}" title="${v}× (${i + 1})">${v}×</button>`).join('') +
    `<button class="skip" data-act="skip" aria-pressed="${!!S.skip && !S.paused}" title="Skip ahead until something needs you (S)">⏭</button>`);
  const flow = S.income - S.upkeep, m = IC.nationalMorale(S);
  const meter = (f, col) => `<div class="meter"><i style="width:${U.clamp(f, 0, 1) * 100}%;background:${col}"></i></div>`;
  const st = S.story, act = st ? st.act : 4;
  if (S.range) { const R = IC.rangeStats(S); setHTML($('stats'), `<div class="stat"><span>Shots</span><strong>${R.shots}</strong></div><div class="stat"><span>Kills</span><strong class="ok">${R.kills}</strong></div><div class="stat"><span>Leakers</span><strong class="${R.leaks ? 'hostile' : ''}">${R.leaks}</strong></div>`); }
  const money = `<div class="stat" title="Treasury and hourly balance"><span>Treasury</span><strong class="amber">${U.money(S.budget)}</strong><em class="${flow >= 0 ? 'ok' : 'hostile'}">${flow >= 0 ? '+' : '−'}${Math.abs(flow).toFixed(0)}/h</em></div>`;
  if (st) {
    const sat = IC.avgSat(S), T = S.tension || 0;
    setHTML($('stats'), `
      <div class="stat role" title="${esc(IC.ACTS[act].name)}: ${esc(IC.ACTS[act].title)}"><span>${esc(IC.ACTS[act].name)}</span><strong>${esc(st.role)}</strong></div>
      ${money}
      <div class="stat" title="The Prime Minister's confidence in you. At zero you are replaced."><span>Confidence</span><strong class="${st.standing > 50 ? '' : st.standing > 25 ? 'amber' : 'hostile'}">${Math.round(st.standing)}</strong>${meter(st.standing / 100, st.standing > 50 ? 'var(--ok)' : st.standing > 25 ? 'var(--amber)' : 'var(--hostile)')}</div>
      <div class="stat" title="Average airline satisfaction"><span>Airlines</span><strong class="${sat > 60 ? '' : sat > 40 ? 'amber' : 'hostile'}">${Math.round(sat)}%</strong>${meter(sat / 100, 'var(--civil)')}</div>
      <div class="stat" title="Passengers through our airports in the last hour"><span>Pax/h</span><strong>${Math.round(S.av.paxHour || 0).toLocaleString('en-US')}</strong></div>
      ${act >= 2 ? `<div class="stat" title="Tension with ${esc(S.world.full.A)}"><span>Tension</span><strong class="${T > 60 ? 'hostile' : T > 30 ? 'amber' : ''}">${Math.round(T)}</strong>${meter(T / 100, 'var(--hostile)')}</div>` : ''}
      ${act >= 4 ? `<div class="stat" title="Enemy will to fight: ceasefire at zero"><span>Enemy will</span><strong class="hostile">${Math.round(S.enemy.will)}</strong>${meter(S.enemy.will / 100, 'var(--hostile)')}</div>` : ''}`);
  } else if (!S.range) setHTML($('stats'), `${money}
    <div class="stat" title="National morale: below 12% the government asks for terms"><span>Morale</span><strong class="${m > 55 ? '' : m > 30 ? 'amber' : 'hostile'}">${Math.round(m)}%</strong>${meter(m / 100, m > 55 ? 'var(--ok)' : m > 30 ? 'var(--amber)' : 'var(--hostile)')}</div>
    <div class="stat" title="Allied support: aid and import prices"><span>Allies</span><strong>${Math.round(S.support)}</strong>${meter(S.support / 100, 'var(--friend)')}</div>
    ${S.pm != null ? `<div class="stat" title="The Prime Minister's confidence: it falls when cities, power, factories and airports are hit, and when raids get through. At zero the government asks for terms."><span>PM</span><strong class="${S.pm > 50 ? '' : S.pm > 25 ? 'amber' : 'hostile'}">${Math.round(S.pm)}</strong>${meter(S.pm / 100, S.pm > 50 ? 'var(--ok)' : S.pm > 25 ? 'var(--amber)' : 'var(--hostile)')}</div>` : ''}
    ${S.enemy.war && S.mode !== 'range' ? `<div class="stat" title="Hold this long with the country working to win"><span>Hold</span><strong>${U.dur(Math.max(0, IC.HOLD_DAYS - IC.warDays(S)) * 86400)}</strong></div>` : ''}`);
  const seg = (act2, cur, opts) => `<div class="seg">${opts.map(([v, n, c, t]) => `<button class="${c || ''}" data-act="${act2}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(t || '')}">${n}</button>`).join('')}</div>`;
  setHTML($('rules'), `
    ${act >= 2 ? `<div class="rl" title="National weapons status: Tight fires only on identified hostiles; Free also on suspects; Hold never without your order"><span>Weapons</span>${seg('roeAll', S.ad.roe, [['free', 'Free', '', 'Engage hostile and suspect tracks'], ['tight', 'Tight', '', 'Engage only identified hostiles'], ['hold', 'Hold', 'red', 'Do not fire without an order']])}</div>` : ''}
    ${act >= 3 ? `<div class="rl doctrine" title="Firing doctrine"><span>Doctrine</span>${seg('doctrine', S.ad.doctrine, [['sls', 'Look', '', 'Shoot-look-shoot: one missile, then another if it missed'], ['salvo', 'Salvo', '', 'Two missiles at once'], ['conserve', 'Save', 'amb', 'Only high-probability shots']])}</div>` : ''}
    <div class="rl" title="Civil airspace"><span>Airspace</span>${seg('airspace', S.airspace, [['open', 'Open', ''], ['restricted', 'Restr.', 'amb', 'Southern corridors only'], ['closed', 'Closed', 'red']])}</div>
    <button class="btn sm" data-act="mute" title="Sound">${IC.sfx.muted || !IC.sfx.on ? '🔇' : '🔊'}</button>`);
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
  for (const b of IC.bases(S)) if (b.owner === 'us' && b.parts && !b.locked && b.parts.some(p => p.kind === 'runway') && !IC.baseStatus(S, b).runway) w.push(['amber', `${b.name}: runway closed`, b]);
  if (S.av) for (const b of S.infra.filter(i => i.kind === 'airport' && i.owner === 'us')) {
    const hold = S.threats.filter(t => t.tail && t.holding && t.toApt === b.id);
    if (hold.length >= 2 || hold.some(t => t.holdT > 600)) w.push(['amber', `${b.name}: ${hold.length} holding${hold.some(t => t.standShort) ? ' · stands full' : ''}`, b]);
  }
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
ui.ROOMS = [['aviation', 'Aviation', 'V'], ['staff', 'Staff', 'T'], ['economy', 'Economy', 'E'], ['air', 'Air', 'A'], ['logi', 'Supply', 'L'], ['industry', 'Industry', 'I'], ['intel', 'Intel', 'N'], ['research', 'Research', 'K'], ['journal', 'Journal', 'J'], ['reference', 'Guide', ''], ['settings', 'Settings', '']];
ui.roomOk = k => (!S.range || k === 'reference' || k === 'settings') && (k !== 'aviation' || !!S.av) && (k !== 'economy' || S.mode !== 'academy') && (k !== 'staff' || !!S.story) && IC.roomAllowed(S, k);
function rail() {
  const hot = S.logs.length && S.logs[0].kind === 'leak' && S.time - S.logs[0].t < 120;
  const idle = S.tech.slots.some(s => !s) && IC.roomAllowed(S, 'research');
  const req = S.av && S.av.requests.length;
  const staffDot = S.story && (S.story.events.length || S.story.cp > 0);
  setHTML($('rail'), ui.ROOMS.filter(([k]) => ui.roomOk(k)).map(([k, n, key]) => `${k === 'journal' ? '<div class="sep"></div>' : ''}<button id="rail-${k}" data-act="room" data-v="${k}" aria-pressed="${ui.room === k}" title="${n}${key ? ' (' + key + ')' : ''}"><svg viewBox="0 0 24 24">${ICON[k]}</svg><small>${n}</small>${key ? `<kbd>${key}</kbd>` : ''}${k === 'journal' && hot ? '<span class="dot"></span>' : ''}${k === 'research' && idle ? '<span class="dot" style="background:var(--amber)"></span>' : ''}${k === 'aviation' && req ? `<span class="dot n" style="background:var(--civil)">${req}</span>` : ''}${k === 'staff' && staffDot ? '<span class="dot" style="background:var(--amber)"></span>' : ''}</button>`).join(''));
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
    const st = S.story, A = IC.ACTS[st.act];
    const done = st.goals.filter(g => g.done).length;
    h = `<h3 data-act="briefMin" title="Collapse or expand">${esc(A.name)} · ${esc(A.title)}<em>${done}/${st.goals.length} goals${st.cp ? ` · ${st.cp} CP` : ''}</em></h3>
      <div class="goals">${st.goals.map((g, i) => `<button class="goalrow ${g.done ? 'done' : ''}" data-act="goal" data-v="${i}"><i>${g.done ? '✓' : ''}</i><span>${esc(g.text)}${!g.done && g.prog ? `<small>${esc(g.prog())}</small>` : ''}</span></button>`).join('')}</div>
      <p class="hint">${done >= st.goals.length - 1 ? 'Something is coming. Keep the sector running.' : 'Goals earn command points (Staff room) and the Minister’s confidence.'}</p>`;
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
function comms() {
  const C = S.camp;
  const Q = C ? C.comms : [];
  if (!Q.length) { setHTML($('comms'), ''); $('comms').classList.remove('glass'); return; }
  const now = performance.now();
  if (Q.length !== ui.lastLen) {
    if (!ui.lastLen) { ui.ci = 0; ui.shownAt = now; }
    else if (ui.ci >= ui.lastLen - 1) { ui.ci = ui.lastLen; ui.shownAt = now; }
    ui.lastLen = Q.length;
  }
  if (ui.ci >= Q.length) ui.ci = Q.length - 1;
  const m = Q[ui.ci];
  const shown = Math.min(m.text.length, Math.floor((now - ui.shownAt) / 1000 * 75));
  const full = shown >= m.text.length;
  if (full && ui.ci < Q.length - 1 && now - ui.shownAt > Math.max(5000, m.text.length * 50)) { ui.ci++; ui.shownAt = now; }
  const init = m.tag === 'CMD' ? m.name.replace('Gen. ', '').split(' ').map(x => x[0]).join('') : m.tag;
  $('comms').classList.add('glass');
  setHTML($('comms'), `<div class="who"><span class="av ${m.tag}">${esc(init)}</span><div><div class="nm">${esc(m.name)}</div><div class="rl2">${esc(m.role)}</div></div></div>
    <p>${esc(m.text.slice(0, shown))}${full ? '' : '▍'}</p>
    <div class="cfoot"><span>${ui.ci + 1} / ${Q.length} · ${U.hhmm(m.t)}</span><span><button data-act="cprev" ${ui.ci ? '' : 'hidden'}>◂ Back</button><button data-act="cnext" ${ui.ci < Q.length - 1 ? '' : 'hidden'}>Next ▸</button></span></div>`);
}

/* ---------- arsenal: what is in reserve, what is on order ---------- */
function arsenal() {
  const allowed = type => !IC.UNITS[type].callin && !S.range && (!S.story || IC.storyAllows(S, type));
  const cats = IC.CATS.filter(c => Object.entries(IC.UNITS).some(([t, d]) => d.cat === c.id && (allowed(t) || (S.reserve[t] || 0) > 0)));
  if (!cats.length) { setHTML($('arsenal'), ''); $('arsenal').classList.remove('glass'); $('app').classList.add('no-arsenal'); return; }
  $('app').classList.remove('no-arsenal');
  if (!cats.some(c => c.id === ui.cat)) ui.cat = cats[0].id;
  const tabs = cats.map(c => `<button data-act="cat" data-v="${c.id}" aria-pressed="${ui.cat === c.id && !ui.arMin}">${c.name}</button>`).join('');
  const slots = IC.slots(S), act = S.orders.filter(o => o.started);
  const slotHtml = Array.from({ length: slots }, (_, i) => { const o = act[i]; return `<i title="${o ? esc(IC.UNITS[o.type].name) + ' ' + U.pct(o.prog) : 'free production slot'}"><b style="width:${o ? o.prog * 100 : 0}%"></b></i>`; }).join('');
  const queued = S.orders.length - act.length;
  // call-in teams: an ability, not a unit you buy
  const CI = IC.callInState(S), CK = IC.callInStats(S), ciWhy = IC.callInWhy(S), ciOn = S.mode2 && S.mode2.kind === 'callin';
  const callTile = ui.cat === 'ad' && IC.callInOpen(S) ? `<div class="tile ${ciWhy ? 'locked' : ''}" id="tile-callin" role="button" tabindex="0" data-act="callin" aria-pressed="${!!ciOn}" title="A MANPADS team, dropped by helicopter anywhere in our territory in ${U.dur(IC.CALLIN.arrive)}. It fights drones, helicopters and low jets for ${U.dur(CK.stay)}, then is lifted out. ${U.money(IC.CALLIN.cost)} a call. Key: G">
      ${ui.sym('manpads')}<span class="res-n">${CI.charges}/${CK.max}</span>
      <span class="tn">Call in a team</span>
      <span class="tc ${ciWhy ? '' : 'ok'}">${ciWhy ? esc(ciWhy) : `Ready · ${U.money(IC.CALLIN.cost)}`}</span>
      ${CI.charges < CK.max ? `<span class="prog"><i style="width:${CI.t / CK.recharge * 100}%"></i></span>` : ''}
    </div>` : '';
  const tiles = callTile + Object.entries(IC.UNITS).filter(([t, d]) => d.cat === ui.cat && (allowed(t) || (S.reserve[t] || 0) > 0)).map(([type, d]) => {
    const locked = !IC.hasTech(S, d.tech);
    const r = S.reserve[type] || 0;
    const coming = S.orders.filter(p => p.type === type);
    const on = S.mode2 && S.mode2.kind === 'deploy' && S.mode2.type === type;
    const tech = locked ? IC.TECH.find(t => t.id === d.tech) : null;
    const first = coming.filter(o => o.started).sort((a, b) => b.prog - a.prog)[0];
    return `<div class="tile ${locked ? 'locked' : ''}" id="tile-${type}" role="button" tabindex="0" data-act="deploy" data-v="${type}" aria-pressed="${on}" title="${esc(IC.fullName(d))}. ${esc(d.desc)}">
      ${ui.sym(type)}${r ? `<span class="res-n">×${r}</span>` : ''}
      <span class="tn">${esc(d.name)}</span><span class="tr">${esc(d.role || '')}</span>
      ${locked ? `<span class="tc">Needs ${esc(tech.name)}</span>` : r ? `<span class="tc ok">Deploy · free</span>` : `<span class="tc">${U.money(IC.unitCost(S, type))} · ${U.dur(IC.leadTime(S, type))}</span>`}
      ${coming.length ? `<span class="eta">+${coming.length} on order</span>` : ''}
      ${!locked && allowed(type) ? `<button class="buy" data-act="order" data-v="${type}" ${S.budget < IC.unitCost(S, type) ? 'disabled' : ''}>Order</button>` : ''}
      ${first ? `<span class="prog"><i style="width:${first.prog * 100}%"></i></span>` : ''}
    </div>`;
  }).join('');
  $('arsenal').classList.add('glass');
  $('arsenal').classList.toggle('min', ui.arMin);
  setHTML($('arsenal'), `<div class="ar-head"><div class="tabs">${tabs}<button data-act="arMin" title="${ui.arMin ? 'Show' : 'Hide'} the arsenal">${ui.arMin ? '▴' : '▾'}</button></div><div class="slots" title="Production slots: orders build in parallel">${slotHtml}<span>${act.length}/${slots}${queued ? ` +${queued} queued` : ''}</span></div></div><div class="tiles">${tiles}</div>`, ui.cat);
}

function layers() {
  const L = [['coverage', 'Coverage'], ['rings', 'Ranges'], ['logistics', 'Supply'], ['civil', 'Traffic'], ['airways', 'Airways'], ['intel', 'Intel'], ['weather', 'Weather'], ['labels', 'Labels']];
  // with coverage on, a key to its colours: the lowest height controllers see
  const key = S.layers.coverage && S.asp ? `<div class="covkey" title="Radar cover for air traffic control: the lowest height a radar that reads transponders sees. Red: no radar sees our airspace there at any height. Blue: our military radars, deeper where they see lower."><span>Radar sees down to</span>${IC.ASP_BANDS.map(([, n], i) => `<em><i style="background:rgb(${IC.BAND_RGB[i]})"></i>${n.replace('below ', '<').replace('above ', '>')}</em>`).join('')}<em><i style="background:rgb(255,90,70)"></i>nothing</em><em title="Our military radars. Hills hide low aircraft from them: the holes behind high ground are where low fliers get through."><i style="background:rgb(92,200,255)"></i>military: deeper blue sees lower</em></div>` : '';
  setHTML($('layers'), L.map(([k, n]) => `<button data-act="layer" data-v="${k}" aria-pressed="${!!S.layers[k]}">${n}</button>`).join('') + key);
}
function modeHint() {
  const m = S.mode2, el = $('modehint');
  if (!m) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = {
    rangeTarget: () => 'Click the map where the threats should aim.',
    callin: () => `Click inside ${S.world.names.H} to drop a MANPADS team there. Shift-click to call another. Right-click or Esc to cancel.`,
    deploy: () => `Click inside ${S.world.names.H} to deploy the ${IC.UNITS[m.type].name}. The dashed rings show its reach. Right-click or Esc to cancel.`,
    move: () => `Click where ${m.unit.name} should go.`,
    airPoint: () => m.task ? `Click the map to place the ${IC.TASK_KIND[m.task].name.toLowerCase()} station.` : `Click the map to send ${m.r.name}.`,
    airSite: () => `Click an enemy target for ${m.r.name}.`,
    fireAt: () => `Click an enemy target for ${m.unit.name}.`,
    build: () => buildHint(m),
    bmove: () => `Click where the ${IC.APART[m.part.kind].name.toLowerCase()} should go. R turns it. Esc to cancel.`,
    bulldoze: () => 'Click a part of the airport to remove it. Planned work is refunded in part. Esc to stop.',
    airway: () => m.from ? `Click the next fix, or empty map for a new one, to extend the airway from ${IC.aspFix(S, m.from) ? IC.aspFix(S, m.from).name : 'here'}. Right-click ends the airway; drag a fix to move it; Delete removes the selected one. Esc to stop.`
      : 'Airways: click the map to place a fix, then keep clicking to join fixes into an airway. Click an airway to add a fix on it; drag fixes to move them. Airports join the nearest fix within 120 km. Esc to stop.',
    field: () => `Click a flat site near a town for a light-aircraft field (${U.money(IC.ASP.FIELD_COST)}). The town's flying club moves there from the big airport.`,
    zone: () => m.c ? 'Click again to set the radius of the prohibited zone.' : 'Click the centre of a prohibited zone. Civil routes will fly around it.',
    road: () => `${IC.ROADS[m.cls].name}: click points on the map; the first and last join the nearest road. ${m.plan && m.pts.length >= 2 ? `${m.plan.km.toFixed(1)} km, ${U.money(m.plan.cost)}, open in about ${U.dur(m.plan.hours * 3600)}${m.plan.why ? ` · ${m.plan.why.replace(/\.$/, '')}` : ' · right-click or Enter to build'}. ` : ''}Backspace undoes a point, Esc cancels.`,
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
    : IC.bldIsArea(t) ? (n < 2 ? `${T ? T.name : D.name}: click one corner, then the opposite one. R turns it 15°.` : `${T ? T.name : D.name}: click the second corner again (or Enter) to build; click elsewhere to resize.`)
    : `${D.name}: click to place, click the same spot again to build. R turns it.`;
  const plan = S.hover ? IC.bldPlanOf(S, m, S.hover, Math.max(0.12, 8 / IC.cam.z)) : null;
  const info = plan ? (plan.ok ? plan.text : [plan.why].concat(plan.text)).filter(Boolean).join(' · ') : '';
  return `${how} Right-click takes a point back; Esc stops.${info ? '\n' + info : ''}`;
}
const covTxt = a => a === Infinity ? 'no height (no radar)' : a < 0.05 ? 'the ground' : U.alt(a);
ui.covTxt = covTxt;
ui.tip = function (ent, sx, sy) {
  const el = $('tip');
  if (!ent) { el.hidden = true; return; }
  const r = ent.ref;
  let t = '', s = '';
  if (ent.kind === 'track') { t = `TN ${r.tn} · ${IC.AFF[r.aff || 'U'].name}${r.klass ? ' · ' + (IC.KLASS[r.klass] || r.klass) : ''}`; s = `${r.sq ? 'Squawk ' + r.sq + ' · ' : ''}${r.altKnown ? U.alt(r.alt) : 'altitude unknown'} · ${U.kmh(Math.hypot(r.vx, r.vy))}`; }
  else if (ent.kind === 'unit') { t = `${r.name} · ${IC.fullName(r.d)}`; s = r.why || IC.unitState(r)[0]; }
  else if (ent.kind === 'veh') { t = r.name; s = r.job ? r.job.label : 'Parked'; }
  else if (ent.kind === 'air') { t = r.name; s = (IC.AIR_KIND[r.kind] || {}).name || 'Airlift'; }
  else if (ent.kind === 'site') { t = r.name; s = `${r.destroyed ? 'Destroyed' : r.pk >= 2 ? 'Located' : 'Suspected'}`; }
  else if (ent.kind === 'tel') { t = r.name; s = `Seen ${U.dur(S.time - r.kt)} ago`; }
  else if (ent.kind === 'infra') { t = r.name; s = r.kind === 'city' ? `${r.pop}k · morale ${Math.round(r.morale)}%` : r.kind === 'bridge' ? (r.offline ? 'Destroyed' : 'Bridge') : r.parts ? (r.locked ? 'Air Force base' : `${IC.baseStatus(S, r).runway ? 'Runway open' : 'Runway closed'} · ${IC.aptStands(r).filter(x => x.occ).length}/${IC.aptStands(r).length} stands${r.kind === 'airbase' ? ` · ${S.roster.filter(x => x.base === r.id && x.st !== 'lost').length} flights` : ''}${r.st && r.st.warn.length ? ` · ${r.st.warn.length} problems` : ''}`) : ({ factory: 'Arms factory', power: 'Power plant' }[r.kind]); }
  else if (ent.kind === 'fix') { t = `Fix ${r.name}`; s = `${S.asp.ways.filter(w => w.a === r.id || w.b === r.id).length} airways · radar sees down to ${covTxt(IC.aspCovAlt(S, r.x, r.y))} here`; }
  else if (ent.kind === 'airway') { const [a, b] = IC.aspWayEnds(S, r); t = `Airway ${a.name} – ${b.name}`; s = `${U.km(U.dist(a, b))} · radar sees ${U.pct(IC.aspWayCover(S, r, 9))} of it at cruise height`; }
  else if (ent.kind === 'field') { t = r.name; s = `Light aircraft · ${r.club} · ${r.today} movements today`; }
  else if (ent.kind === 'apart') { const D = IC.APART[r.kind]; t = `${D.name} · ${ent.ap.name}`; s = !r.built ? `Planned · ${U.pct(r.prog || 0)}` : r.hp <= r.max * 0.25 ? 'Destroyed' : r.hp < r.max ? `Damaged · ${U.pct(r.hp / r.max)}` : r.kind === 'runway' ? `${U.km(IC.rwLen(r))}${r.craters.length ? ` · ${r.craters.length} craters` : ''}` : r.kind === 'fuel' ? `${Math.round(r.stock || 0)}/${D.cap} fuel` : r.kind === 'apron' ? `${(r.stands || []).length} stands` : D.desc; }
  el.innerHTML = `<b>${esc(t)}</b><span>${esc(s)}</span>`;
  el.hidden = false;
  const W = $('app').clientWidth;
  el.style.left = Math.min(W - 300, sx + 16) + 'px'; el.style.top = (sy + 16) + 'px';
};

/* ---------- cinematic cards ---------- */
function cine() {
  const C = S.camp, el = $('cine');
  if (!C || !C.cards) return;
  const now = performance.now();
  // a chapter card waits until the player closes the room they are reading
  if (el.hidden && !ui.room && ui.cineShown < C.cards.length && now > ui.cineT) {
    const c = C.cards[ui.cineShown];
    el.className = 'cine ' + c.kind; el.hidden = false;
    el.innerHTML = `<small>${esc(c.sub)}</small><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><div class="cfoot"><span>click to continue</span></div>`;
    ui.cineUntil = now + (c.kind === 'chapter' ? 7000 : 12000);
    if (c.kind === 'chapter' && S.cfg.bars) IC.cine = Object.assign(IC.cine || {}, { barsT: 2.5 });
    IC.sfx && IC.sfx.ui('chapter');
  } else if (!el.hidden && now > ui.cineUntil) ui.closeCine();
}
ui.closeCine = () => { const el = $('cine'); if (el.hidden) return; el.hidden = true; ui.cineShown++; ui.cineT = performance.now() + 800; };

/* ---------- academy highlight ---------- */
function coach() {
  for (const e of document.querySelectorAll('.coach-hi')) e.classList.remove('coach-hi');
  const h = IC.stepHint && IC.stepHint(S);
  if (!h || !h.el) return;
  const id = { arsenal: 'arsenal', insp: 'insp', speed: 'speed', doctrine: null, 'rail-air': 'rail-air' }[h.el];
  const el = id ? $(id) : h.el === 'doctrine' ? document.querySelector('.rl.doctrine') : null;
  if (el) el.classList.add('coach-hi');
}

/* ---------- refresh ---------- */
ui.refresh = function (force) {
  if (!S) return;
  topbar(); rail(); brief(); comms(); feed(); layers(); modeHint(); cine(); coach();
  const busy = performance.now() < ui.busyUntil;
  if (!busy || force) { arsenal(); IC.renderInspector(S); if (ui.room) IC.renderRoom(S, ui.room); }
  $('app').classList.toggle('has-insp', !!$('insp').innerHTML);
  if (S.over && !ui.overDismissed && $('over').hidden) showOver();
};
function showOver() {
  $('over').hidden = false;
  const aca = S.mode === 'academy', story = !!S.story;
  $('overKicker').textContent = aca ? 'Academy' : story ? `${IC.ACTS[S.story.act].name} · ${S.story.role}` : S.won ? 'Victory' : 'Defeat';
  $('overTitle').textContent = aca ? (S.won ? 'Lesson complete' : 'Lesson failed') : S.won ? 'Ceasefire' : story && S.story.standing <= 0 ? 'Replaced' : 'The defense has failed';
  $('overTitle').style.color = S.won ? 'var(--friend)' : 'var(--hostile)';
  $('overText').textContent = S.over;
  $('overStars').textContent = aca && S.won ? '★'.repeat(S.stars || 1) + '☆'.repeat(3 - (S.stars || 1)) : '';
  const L = aca && S.camp.lesson ? IC.LESSONS.findIndex(l => l.id === S.camp.lesson.id) : -1;
  $('overNext').hidden = !(aca && S.won && L >= 0 && L < IC.LESSONS.length - 1);
  if (aca && S.won) { const p = store.get('ic-academy', {}); p[S.camp.lesson.id] = Math.max(p[S.camp.lesson.id] || 0, S.stars || 1); store.set('ic-academy', p); }
  $('overStats').innerHTML = `<span>Time: ${U.clock(S.time)}</span><span>Threats destroyed: ${S.stats.kills}</span><span>Leakers: ${S.stats.leakers}</span><span>Interceptors fired: ${S.stats.fired}</span><span>Units lost: ${S.stats.unitsLost}</span><span>Aircraft lost: ${S.stats.acLost}</span><span>Enemy sites destroyed: ${S.stats.siteKills}</span><span>Civil aircraft lost: ${S.stats.civLost}</span>`;
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
  // each room opens where the player left it
  if (was) ui.roomScroll[was] = $('wrBody').scrollTop;
  ui.room = was === k ? null : k;
  $('warroom').hidden = !ui.room;
  ui.cache.wrBody = null; ui.cache.wrTabs = null; ui.keys.wrBody = null;
  if (ui.room) { IC.emit(S, 'warroom', k); if (!was && ui.pauseRoom) { ui.pausedByRoom = !S.paused; S.paused = true; } }
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

/* ---------- start screen ---------- */
ui.lessonList = function () {
  const p = store.get('ic-academy', {});
  $('lessons').innerHTML = IC.LESSONS.map((l, i) => `<button class="lesson" data-act="lesson" data-v="${l.id}"><b><span>${i + 1}. ${esc(l.title)}</span><span class="st">${p[l.id] ? '★'.repeat(p[l.id]) + '☆'.repeat(3 - p[l.id]) : ''}</span></b><span>${esc(l.sub)}</span></button>`).join('');
};

})(window.IC);
