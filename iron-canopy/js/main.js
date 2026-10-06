/* Iron Canopy — input, orders, time control (speed, skip ahead, auto-pause, slow motion), start screen, main loop. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const cv = $('map'), mini = $('mini'), app = $('app'), esc = U.esc;
let S = null, mw = 225, mh = 169;
IC.cine = { slow: 0, barsT: 0, bars: 0, cool: 0 };

/* ---------- real-time effects ---------- */
function fx(S, dtR, gdt) {
  const F = S.fx;
  for (const p of F.parts) { p.t += dtR; const k = Math.max(0, 1 - p.drag * dtR); p.vx *= k; p.vy *= k; p.ox += p.vx * dtR; p.oy += p.vy * dtR; p.size += p.grow * dtR; }
  F.parts = F.parts.filter(p => p.t < p.life);
  for (const b of F.booms) b.t += dtR; F.booms = F.booms.filter(b => b.t < 0.8);
  for (const x of F.texts) x.t += dtR; F.texts = F.texts.filter(x => x.t < (x.life || 1.8));
  for (const x of F.tracers) x.t += dtR; F.tracers = F.tracers.filter(x => x.t < 0.08);
  for (const r of F.rings) r.t += dtR; F.rings = F.rings.filter(r => r.t < 1);
  for (const f of F.flashes) f.t += dtR; F.flashes = F.flashes.filter(f => f.t < 0.35);
  for (const s of F.shocks) s.t += dtR; F.shocks = F.shocks.filter(s => s.t < 0.9);
  for (const c of F.chaff) { c.t += dtR; c.x += c.vx * gdt; c.y += c.vy * gdt; if (c.kind === 'flare') c.vy += 0.02 * gdt; }
  F.chaff = F.chaff.filter(c => c.t < c.life);
  if (F.flashes.length > 120) F.flashes.splice(0, F.flashes.length - 120);
  if (F.booms.length > 150) F.booms.splice(0, F.booms.length - 150);
  if (F.texts.length > 60) F.texts.splice(0, F.texts.length - 60);
  if (F.rings.length > 60) F.rings.splice(0, F.rings.length - 60);
  if (F.chaff.length > 400) F.chaff.splice(0, F.chaff.length - 400);
  for (const f of F.fires) if (Math.random() < dtR * 3 * f.size) {
    IC.part(S, { x: f.x, y: f.y, ox: U.rand(-3, 3), oy: U.rand(-3, 3), vx: S.wind.x * 14 + U.rand(-3, 3), vy: S.wind.y * 14 - 10, life: U.rand(3, 6), size: U.rand(3, 5) * f.size, grow: 5, col: '58,58,60', a: 0.35, drag: 0.1 });
    if (Math.random() < 0.4) IC.part(S, { x: f.x, y: f.y, ox: U.rand(-3, 3), oy: U.rand(-3, 3), vy: -8, life: U.rand(0.3, 0.7), size: U.rand(1.5, 3) * f.size, grow: 2, col: '255,150,60', add: true, a: 0.8 });
  }
}

/* big moments on screen: the cinema bars for a breath (combat time, below, sets the pace while weapons fly) */
IC.cinematic = function (S2, x, y, big) {
  const c = IC.cam, C = IC.cine;
  if (!c || C.cool > 0 || !S2.cfg.bars) return;
  const inV = x > c.x && x < c.x + c.vw / c.z && y > c.y && y < c.y + c.vh / c.z;
  if (!inV || c.z < 0.12) return;
  C.cool = 25; C.barsT = Math.max(C.barsT, 1.6 * big + 1);
};
/* combat time: while hostile weapons fly near what is on screen, the clock eases down to a watchable speed
   (IC.combatTime in combat.js) and back up when they are gone. Down fast, up gently. A setting, on by default */
function combatSpeed(S, speed, dtR) {
  const C = IC.cine;
  if (S.cfg.combat === false || S.wait || S.skip || IC.civilAct(S)) { C.ct = null; IC.combatNow = null; return speed; }
  const c = IC.cam, cap = IC.combatTime(S, { x0: c.x, y0: c.y, x1: c.x + c.vw / c.z, y1: c.y + c.vh / c.z });
  const want = Math.min(speed, cap);
  if (C.ct == null) C.ct = speed;
  C.ct = Math.min(speed, C.ct + (want - C.ct) * Math.min(1, dtR * (want < C.ct ? 3 : 0.7)));
  if (want >= speed && C.ct > speed * 0.97) C.ct = speed;
  IC.combatNow = { active: C.ct < speed - 0.01, speed: C.ct };
  return C.ct;
}

/* ---------- picking ---------- */
function pick(p) {
  const px = 1 / IC.cam.z;
  let best = null, bd = 1e9;
  const consider = (kind, ref, x, y, r) => { const d = U.dxy(p.x, p.y, x, y); if (d < Math.max(16 * px, r || 0) && d < bd) { bd = d; best = { kind, ref }; } };
  for (const t of S.threats) if (t.held && !t.dead) consider('track', t, t.px, t.py);
  if (best) return best;
  for (const a of S.air) consider('air', a, a.x, a.y);
  if (best) return best;
  for (const u of S.units) consider('unit', u, u.x, u.y);
  if (best) return best;
  const aw = S.layers.airways || (S.mode2 && S.mode2.kind === 'airway');
  if (aw) for (const f of S.asp.fixes) consider('fix', f, f.x, f.y);
  if (IC.cam.z > 0.05) for (const f of S.asp.fields) consider('field', f, f.x, f.y);
  if (best) return best;
  if (S.layers.logistics) for (const v of S.vehicles) if (v.state !== 'idle') consider('veh', v, v.x, v.y);
  if (best) return best;
  if (S.layers.intel) {
    for (const t of S.tels) if (t.known && !t.dead) consider('tel', t, t.kx, t.ky);
    for (const s of S.esites) if (s.pk > 0) consider('site', s, s.x, s.y, s.pk === 1 ? 180 : 0);
    if (best) return best;
  }
  // (round 2) close in, an airliner on the ground: taxiing, or on its stand (its panel follows it and shows its turnaround)
  if (IC.cam.z >= 2.5 && S.av) {
    for (const ap of IC.bases(S)) {
      if (!ap.parts || !ap.moves || U.dist(ap, p) > ap.radius + 5) continue;
      for (const m of ap.moves) if (m.tail && !m.dead && m.tail.T) consider('tail', m.tail, m.x, m.y, m.tail.T.len * 0.55);
      for (const s of IC.aptStands(ap)) if (s.occ && U.dist(s, p) < 1) { const tl = S.av.tails.find(t => t.id === s.occ); if (tl && tl.where === 'stand') consider('tail', tl, s.x, s.y, tl.T.len * 0.5); }
    }
    if (best) return best;
  }
  // close in, airports are picked part by part
  if (IC.cam.z >= 2.5) for (const ap of IC.bases(S)) {
    if (!ap.parts || U.dist(ap, p) > ap.radius + 5) continue;
    const part = IC.partAt(ap, p, 6 * px);
    if (part && part.kind !== 'runway' && part.kind !== 'taxi' && part.kind !== 'apron') return { kind: 'apart', ref: part, ap };
    if (part) return { kind: 'apart', ref: part, ap };
  }
  for (const i of S.infra) {
    if (i.kind === 'bridge') { if (IC.cam.z > 0.2 && U.dxy(p.x, p.y, i.x, i.y) < Math.max(10, 10 * px)) return { kind: 'infra', ref: i }; continue; }
    const r = i.kind === 'city' ? Math.max(i.r * 0.7, 10 * px) : i.parts && IC.cam.z > 0.3 ? Math.max(i.radius * 0.7, 13 * px) : 13 * px;
    if (U.dxy(p.x, p.y, i.x, i.y) < r) return { kind: 'infra', ref: i };
  }
  if (aw) { const w = IC.aspWayAt(S, p, 8 * px); if (w) return { kind: 'airway', ref: w }; }
  return null;
}
/* the airway editor: click empty map for a new fix, click fixes to join them, click an airway to add a fix on it.
   Each click continues the chain from the last fix; right-click ends the chain */
function airwayClick(m, p) {
  const px = 1 / IC.cam.z, f = IC.aspFixAt(S, p, 12 * px), w = !f && IC.aspWayAt(S, p, 7 * px);
  let to = f;
  if (!to && w) to = IC.aspSplitWay(S, w.id, p.x, p.y);
  if (!to && !w) { const why = IC.aspFixWhy(S, p.x, p.y); if (why) { IC.text(S, p.x, p.y, why, IC.C.hostile); IC.sfx.ui('err'); return; } to = IC.aspAddFix(S, p.x, p.y); }
  if (!to) { IC.sfx.ui('err'); return; }
  if (m.from && m.from !== to.id) IC.aspAddWay(S, m.from, to.id);
  m.from = to.id;
  S.sel = { kind: 'fix', ref: to };
  IC.sfx.ui('click');
}
/* the airport builder (builder.js): left-click places a point or the plan, a click elsewhere moves a placed plan;
   Build (the button beside the plan) or Enter builds it; right-click takes a point back or cancels, and with nothing
   placed leaves the mode. Nothing builds on a click (brief 47) */
function buildIn(m, p, btn, shift) {
  const r = IC.buildInput(S, m, p, btn, IC.cam.z, shift);
  if (r === 'exit') { IC.setMode(null); return r; }
  if (r === 'built') { IC.sfx.ui('ok'); ping(p); if (m.done) IC.toast(S, 'info', 'BUILD', m.done, m.ap); }
  else if (r === 'err') { IC.sfx.ui('err'); if (m.err) { IC.text(S, p.x, p.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile); IC.toast(S, 'warn', 'NOT BUILT', m.err, m.ap); } }
  else if (r === 'same') IC.text(S, p.x, p.y, IC.bldReady(S, m) ? 'PRESS BUILD OR ENTER TO BUILD IT' : 'CLICK THE NEXT POINT', IC.C.muted);
  else IC.sfx.ui('click');
  IC.ui.refresh(true);
  return r;
}
/* Build or Enter: what is placed is built (the founding of an airport too) */
function buildGo() {
  const m = S.mode2; if (!m) return;
  if (m.kind === 'found') return foundGo();
  if (m.kind === 'bmove') {
    if (!m.at) return;
    if (IC.bldRelocate(S, m.ap, m.part, m.at.x, m.at.y, m.rot)) { IC.sfx.ui('ok'); ping(m.at); IC.setMode(null); IC.select({ kind: 'apart', ref: m.part, ap: m.ap }); }
    else { IC.sfx.ui('err'); IC.text(S, m.at.x, m.at.y, 'DOES NOT FIT', IC.C.hostile); }
    return;
  }
  if (m.kind !== 'build') return;
  const r = IC.buildFinish(S, m), at = m.at || m.pts[m.pts.length - 1] || S.hover;
  if (r === 'built') {
    IC.sfx.ui('ok'); if (at) ping(at); if (m.done) IC.toast(S, 'info', 'BUILD', m.done, m.ap);
    // a whole airport, or the surveyed runway: the tool is put down (one more click would order a second)
    if (m.part === 'starter' || m.fromSurvey) IC.setMode(null);
  }
  else { IC.sfx.ui('err'); if (m.err && at) { IC.text(S, at.x, at.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile); IC.toast(S, 'warn', 'NOT BUILT', m.err, m.ap); } }
  IC.ui.refresh(true);
}
/* Esc: a placed plan or the points so far go; with none, the tool is put down */
function buildEsc() {
  const m = S.mode2;
  if (m && m.kind === 'build' && IC.buildCancel(S, m) !== 'exit') { IC.sfx.ui('click'); IC.ui.refresh(true); return true; }
  if (m && m.kind === 'found' && m.site) { m.site = null; IC.ui.refresh(true); return true; }
  if (m && m.kind === 'bmove' && m.at) { m.at = null; IC.ui.refresh(true); return true; }
  return false;
}
/* what the Career has not reached yet: say why, and do nothing */
function locked(key) { const why = IC.storyLock(S, key); if (why) { IC.toast(S, 'info', 'NOT YET', why); IC.sfx.ui('err'); } return !!why; }
function foundIn(m, p, btn) {
  const r = IC.foundInput(S, m, p, btn);
  if (r === 'exit') { IC.setMode(null); return r; }
  if (r === 'err') { IC.sfx.ui('err'); IC.text(S, p.x, p.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile); }
  else IC.sfx.ui('click');
  IC.ui.refresh(true);
  return r;
}
function foundGo() {
  const m = S.mode2, r = IC.foundFinish(S, m);
  if (r === 'built') {
    IC.setMode(null); IC.select({ kind: 'infra', ref: m.ap }); IC.flyTo(m.ap.x, m.ap.y, Math.max(IC.cam.z, 1.2)); IC.sfx.ui('ok');
    // (round 1) the surveyed runway stays on the map as a placed plan: Build (or Enter) lays it, with its taxiways
    if (m.next) { IC.bb.ap = m.ap; IC.bb.tab = 'pc'; IC.bbToggle(true); IC.setMode(m.next); }
    return r;
  }
  IC.sfx.ui('err'); if (m.err && S.hover) IC.text(S, S.hover.x, S.hover.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile);
  IC.ui.refresh(true);
  return r;
}
/* the Build button beside a placed plan: its cost and time, or why it cannot be built; Cancel beside it; turning
   buttons for an airport's runway. Placed every frame by the plan's point on screen */
const goEl = document.createElement('div'); goEl.id = 'bldgo'; goEl.hidden = true; app.appendChild(goEl);
let goKey = '';
goEl.addEventListener('pointerdown', e => e.stopPropagation());
goEl.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b || b.disabled) return;
  const m = S.mode2, v = b.dataset.go;
  if (v === 'build') buildGo();
  else if (v === 'cancel') { if (!buildEsc()) IC.setMode(null); }
  else if (v === 'turn' && m && m.kind === 'found') { IC.foundTurn(m, +b.dataset.d); IC.ui.refresh(true); }
  else if (v === 'turn' && m) { if (!IC.pieceTurn(m, +b.dataset.d)) m.rot = (m.rot || 0) + (+b.dataset.d) * Math.PI / 12; IC.ui.refresh(true); }
});
function goFrame() {
  const m = S && S.mode2;
  let at = null, html = '';
  if (m && m.kind === 'build') {
    goEl._k = '';
    const plan = IC.bldReady(S, m);
    if (plan) {
      at = m.at || m.pts[m.pts.length - 1];
      const turn = !IC.bldIsLine(m.part) && !['parallel', 'exits', 'hold', 'stretch'].includes(m.part);
      const what = plan.bp ? U.money(plan.cost) : plan.specs && plan.specs.length ? `${U.money(plan.cost)}${plan.dur ? ' · ' + U.dur(plan.dur) : ''}` : '';
      html = `<button class="btn go" data-go="build" ${plan.ok ? '' : 'disabled'} title="${plan.ok ? 'Build it (Enter)' : esc(plan.why || '')}">Build${what ? ` · ${what}` : ''}</button>${turn ? `<button class="btn sm" data-go="turn" data-d="-1" title="Turn it (Shift+R)">⟲</button><button class="btn sm" data-go="turn" data-d="1" title="Turn it (R)">⟳</button>` : ''}<button class="btn sm" data-go="cancel" title="Cancel (Esc or right-click)">✕</button>${plan.ok ? '' : `<em>${esc(plan.why || '')}</em>`}`;
    }
  } else if (m && m.kind === 'bmove' && m.at) {
    at = m.at;
    const k = `mv|${at.x}|${at.y}|${m.rot}`;
    if (goEl._k === k) html = goKey; else {
    goEl._k = k;
    const p = m.part, probe = Object.assign({}, p, { x: m.at.x, y: m.at.y, a: m.rot });
    m.ap.parts = m.ap.parts.filter(q => q !== p); const fits = IC.aptCanPlace(S, m.ap, probe), why = IC.aptPlaceWhy; m.ap.parts.push(p);
    html = `<button class="btn go" data-go="build" ${fits ? '' : 'disabled'} title="Move it (Enter)">Move${m.cost ? ` · ${U.money(m.cost)}` : ' · free'}</button><button class="btn sm" data-go="turn" data-d="-1" title="Turn it (Shift+R)">⟲</button><button class="btn sm" data-go="turn" data-d="1" title="Turn it (R)">⟳</button><button class="btn sm" data-go="cancel" title="Cancel (Esc or right-click)">✕</button>${fits ? '' : `<em>${esc(why || 'It does not fit there.')}</em>`}`; }
  } else if (m && m.kind === 'found' && m.site) {
    at = m.site;
    // (the survey reads the ground and the towns round it: once for each place and heading, not every frame)
    const k = `fd|${at.x}|${at.y}|${m.hdg}|${Math.round(S.budget)}`;
    if (goEl._k === k) html = goKey; else {
    goEl._k = k;
    const sv = IC.foundSurvey(S, m.site.x, m.site.y, m.hdg != null ? m.hdg : IC.PREVAIL), why = sv.river ? 'A river crosses the runway line: turn it or move the site.' : S.budget < sv.cost ? `Not enough money: ${U.money(sv.cost)} needed.` : '';
    html = `<button class="btn go" data-go="build" ${why ? 'disabled' : ''} title="Found it (Enter)">Found · ${U.money(sv.cost)}</button><button class="btn sm" data-go="turn" data-d="-1" title="Turn the runway (Shift+R)">⟲</button><button class="btn sm" data-go="turn" data-d="1" title="Turn the runway (R)">⟳</button><button class="btn sm" data-go="cancel" title="Pick another site (Esc or right-click)">✕</button>${why ? `<em>${esc(why)}</em>` : ''}`; }
  }
  if (!at) { if (!goEl.hidden) { goEl.hidden = true; goKey = ''; goEl._k = ''; } return; }
  if (html !== goKey) { goEl.innerHTML = html; goKey = html; }
  const sc = IC.toScreen(at.x, at.y), r = app.getBoundingClientRect(), w = goEl.offsetWidth || 200;
  goEl.hidden = false;
  goEl.style.left = `${U.clamp(sc.x + 26, (IC.ui.mapLeft || 0) + 8, r.width - (IC.ui.mapRight || 0) - w - 8)}px`;
  // (above the build bar and its help line: when the plan is low on the screen the button goes above it)
  let lim = r.height - 20; for (const id of ['bbar', 'modehint']) { const e = $(id); if (e && !e.hidden && e.offsetParent) lim = Math.min(lim, e.getBoundingClientRect().top - r.top); }
  const h = goEl.offsetHeight || 40, y = sc.y + 26 + h + 8 > lim ? sc.y - 26 - h : sc.y + 26;
  goEl.style.top = `${U.clamp(y, 70, Math.max(70, lim - h - 8))}px`;
}
const selAp = () => S.sel ? (S.sel.kind === 'apart' ? S.sel.ap : S.sel.kind === 'infra' && S.sel.ref.parts ? S.sel.ref : null) : null;
/* the airport's Airspace tab is open: its rings can be picked and their edges dragged on the map */
/* (round 3) a fix from the map or a panel: the airport, the build bar, and the piece already placed where it helps
   (IC.fixPlan); Build or Enter builds it, a click elsewhere moves it, Esc cancels */
IC.fixOpen = function (S2, ap, part, near, size) {
  const ui = IC.ui; ui.closeCine(); if (ui.room) ui.openRoom(null);
  const lock = IC.APART[part] && IC.aptLockWhy(S2, part);
  if (lock) { IC.toast(S2, 'info', 'NOT YET', lock); IC.sfx && IC.sfx.ui('err'); return false; }
  IC.bb.ap = ap; IC.select({ kind: 'infra', ref: ap }); IC.bbToggle(true);
  const m = IC.fixPlan(S2, ap, part, near || ap, size);
  if (!m) { IC.bbPick(part); IC.flyTo((near || ap).x, (near || ap).y, Math.max(IC.cam.z, 5)); IC.toast(S2, 'info', 'BUILD', 'No room found nearby: click where it should go.'); return true; }
  IC.bb.last = part; IC.setMode(m);
  const P = IC.PIECES && IC.PIECES[part];
  IC.flyTo(m.at.x, m.at.y, U.clamp(Math.max(IC.cam.z, P ? 6 : 9), 5, P ? 9 : 16));
  return true;
};
const aspEditing = () => { const ap = selAp(); return !S.mode2 && IC.ui.aptTab === 'asp' && ap && S.sel.kind === 'infra' && ap.owner === 'us' && S.asp && S.asp.vols; };
const selUnits = () => S.group.length ? S.group : S.sel && S.sel.kind === 'unit' ? [S.sel.ref] : [];
const isEnemyTarget = h => h && (h.kind === 'site' || h.kind === 'tel');

function leftClick(p, shift) {
  if (!p || S.over && !IC.ui.overDismissed) return;
  const m = S.mode2;
  if (m) {
    if (m.kind === 'build') return buildIn(m, p, 0, shift);
    // moving a building: a click places where it goes, Move (or Enter) moves it (brief 47: nothing on a click)
    if (m.kind === 'bmove') { m.at = { x: p.x, y: p.y }; IC.sfx.ui('click'); IC.ui.refresh(true); return; }
    if (m.kind === 'airway') { airwayClick(m, p); IC.ui.refresh(true); return; }
    if (m.kind === 'asp') { IC.aspMapClick(S, m, p); IC.ui.refresh(true); return; }
    if (m.kind === 'road') { IC.roadClick(S, m, p, 14 / IC.cam.z); IC.ui.refresh(true); return; }
    if (m.kind === 'field') {
      const why = IC.aspFieldWhy(S, p.x, p.y);
      if (why) { IC.text(S, p.x, p.y, why, IC.C.hostile); IC.sfx.ui('err'); return; }
      const f = IC.aspFoundField(S, p.x, p.y);
      IC.setMode(null); IC.select({ kind: 'field', ref: f }); ping(p); return;
    }
    if (m.kind === 'bulldoze') {
      const part = IC.partAt(m.ap, p, 6 / IC.cam.z);
      if (part) { const q = IC.bldRefund(S, m.ap, part); if (!q.why && IC.bldBulldoze(S, m.ap, part)) { IC.sfx.ui('ok'); ping(p); if (q.refund) IC.text(S, p.x, p.y, '+' + U.money(q.refund), IC.C.money || '#f3d98b'); } else { IC.sfx.ui('err'); IC.text(S, p.x, p.y, q.why ? 'IN USE' : 'NOT REMOVED', IC.C.amber); if (q.why) IC.toast(S, 'warn', 'NOT BULLDOZED', q.why, m.ap); } } else IC.text(S, p.x, p.y, 'NOTHING HERE', IC.C.amber);
      IC.ui.refresh(true); return;
    }
    // the build bar's Upgrade tool: the part clicked gets what the options bar says, for the difference in price
    if (m.kind === 'upgrade') {
      const part = IC.partAt(m.ap, p, 6 / IC.cam.z);
      const o = { mat: m.mat, lit: m.lit !== false, w: part && part.kind === 'runway' ? m.rwid : part && part.kind === 'taxi' ? m.twid : null };
      const q = part ? IC.bldUpgradeCost(S, m.ap, part, o) : { why: 'Click a runway, taxiway or apron.' };
      if (!q.why && IC.bldUpgrade(S, m.ap, part, o)) { IC.sfx.ui('ok'); ping(p); IC.toast(S, 'info', 'UPGRADE', `${part.name || IC.APART[part.kind].name}: ${q.what.join(', ')} for ${U.money(q.cost)}, about ${U.dur(q.dur)}.`, m.ap); }
      else { IC.sfx.ui('err'); IC.text(S, p.x, p.y, (q.why || 'NOT UPGRADED').toUpperCase().replace(/\.$/, ''), IC.C.hostile); }
      IC.ui.refresh(true); return;
    }
    // Move: pick the building, then place it
    if (m.kind === 'bpick') {
      const part = IC.partAt(m.ap, p, 6 / IC.cam.z), q = part ? IC.bldRelocateCost(S, m.ap, part) : { why: 'Click a building.' };
      if (q.why) { IC.sfx.ui('err'); IC.text(S, p.x, p.y, q.why.toUpperCase().replace(/\.$/, ''), IC.C.hostile); return; }
      IC.setMode({ kind: 'bmove', ap: m.ap, part, rot: part.a || 0, cost: q.cost }); IC.sfx.ui('click'); return;
    }
    if (m.kind === 'zone') {
      if (!m.c) { m.c = { x: p.x, y: p.y }; return; }
      const r = Math.max(60, U.dist(m.c, p));
      IC.avAddZone(S, m.c.x, m.c.y, r);
      IC.setMode(null); ping(p); return;
    }
    if (m.kind === 'found') return foundIn(m, p, 0);
    if (m.kind === 'callin') {
      const why = IC.callInWhy(S, p.x, p.y);
      if (why) { IC.text(S, p.x, p.y, why.toUpperCase(), IC.C.hostile); IC.sfx.ui('err'); return; }
      IC.callIn(S, p.x, p.y); IC.sfx.ui('ok'); ping(p);
      if (!shift || IC.callInState(S).charges < 1) IC.setMode(null); else IC.ui.refresh(true);
      return;
    }
    if (m.kind === 'rangeTarget') { S.range.target = { x: p.x, y: p.y }; S.range.scen.target = { x: Math.round(p.x), y: Math.round(p.y) }; IC.setMode(null); ping(p); return; }
    if (m.kind === 'deploy' && S.range) {
      if (!IC.canPlace(S, m.type, p.x, p.y)) { IC.text(S, p.x, p.y, IC.inHome(p.x, p.y) ? 'TOO CLOSE' : 'OUR SIDE ONLY', IC.C.hostile); IC.sfx.ui('err'); return; }
      IC.rangeAddUnit(S, m.type, p.x, p.y); IC.sfx.ui('ok'); ping(p);
      if (!shift) IC.setMode(null); else IC.ui.refresh(true);
      return;
    }
    if (m.kind === 'deploy') {
      if (!IC.canPlace(S, m.type, p.x, p.y)) { IC.text(S, p.x, p.y, IC.inHome(p.x, p.y) ? 'TOO CLOSE' : 'OUTSIDE THE COUNTRY', IC.C.hostile); IC.sfx.ui('err'); return; }
      const u = IC.deploy(S, m.type, p.x, p.y);
      if (u) { IC.sfx.ui('ok'); ping(p); }
      if (!shift || (!(S.reserve[m.type] > 0) && IC.buyBlock(S, m.type))) IC.setMode(null); else IC.ui.refresh(true);
      return;
    }
    if (m.kind === 'move') { if (IC.relocate(S, m.unit, p.x, p.y)) { IC.setMode(null); ping(p); } else IC.text(S, p.x, p.y, 'NOT HERE', IC.C.hostile); return; }
    if (m.kind === 'airPoint') {
      if (m.task) IC.addTask(S, m.task, { x: p.x, y: p.y });
      else IC.launchAir(S, m.r, { type: m.mission === 'aew' ? 'orbit' : m.mission, x: p.x, y: p.y });
      IC.setMode(null); ping(p); return;
    }
    const hit = pick(p);
    if (m.kind === 'airSite' || m.kind === 'fireAt') {
      if (isEnemyTarget(hit)) {
        if (m.kind === 'airSite') IC.launchAir(S, m.r, { type: 'strike', site: hit.ref });
        else IC.fireMission(S, m.unit, hit.ref, shift ? 99 : 1);
        IC.setMode(null);
      } else IC.text(S, p.x, p.y, 'PICK AN ENEMY TARGET', IC.C.amber);
      return;
    }
  }
  const hit = pick(p);
  // fighters selected and a track clicked: show the intercept before committing it
  if (IC.airClick(S, hit)) { IC.sfx.ui('click'); IC.ui.refresh(true); return; }
  if (aspEditing() && (!hit || hit.ref === selAp())) {
    const v = IC.aspVolUnder(S, selAp(), p);
    if (v) { IC.ui.aspVol = IC.ui.aspVol === v.id ? null : v.id; IC.ui.refresh(true); return; }
  }
  IC.select(hit, shift);
}

function roadDone() { if (IC.roadFinish(S, S.mode2)) { IC.sfx.ui('ok'); IC.setMode(null); } else IC.sfx.ui('err'); IC.ui.refresh(true); }

/* right-click: the obvious order for what is selected */
function rightClick(p, shift) {
  if (!p) return;
  if (S.mode2 && S.mode2.kind === 'build') return buildIn(S.mode2, p, 2, shift);
  if (S.mode2 && S.mode2.kind === 'found') return foundIn(S.mode2, p, 2);
  if (S.mode2 && S.mode2.kind === 'airway' && S.mode2.from) { S.mode2.from = null; IC.ui.refresh(true); return; }
  if (S.mode2 && S.mode2.kind === 'road' && S.mode2.pts.length >= 2) { roadDone(); return; }
  if (S.mode2) { IC.setMode(null); return; }
  const hit = pick(p);
  const air = S.sel && S.sel.kind === 'air' ? S.sel.ref : null;
  if (S.sel && S.sel.kind === 'flight' && hit && hit.kind === 'track' && S.sel.ref.kind === 'ftr') { S.icpt = null; if (IC.commitIntercept(S, S.sel.ref, hit.ref)) ping(p); return; }
  if (air && air.r && !air.job) {
    S.icpt = null;
    if (hit && hit.kind === 'track' && air.kind === 'ftr') { if (IC.commitIntercept(S, air, hit.ref)) ping(p); return; }
    if (hit && hit.kind === 'air' && hit.ref !== air && air.kind === 'ftr' && !hit.ref.allied) { IC.escortAir(S, air, hit.ref); ping(p); return; }
    air.task = null; air.state = 'out'; air.tgt = null; air.refuel = null;
    if (isEnemyTarget(hit) && (air.kind === 'ftr' || air.kind === 'ucav') && air.gbu > 0) air.mission = { type: 'strike', site: hit.ref };
    else air.mission = { type: air.kind === 'ftr' ? 'cap' : air.kind === 'aew' ? 'orbit' : 'isr', x: p.x, y: p.y };
    IC.log(S, 'info', 'AIR', `${air.name} retasked.`);
    ping(p); return;
  }
  const units = selUnits();
  if (units.length) {
    const strike = units.filter(u => u.d.weapon === 'strike' && u.state === 'ready');
    if (strike.length && isEnemyTarget(hit)) { for (const u of strike) IC.fireMission(S, u, hit.ref, shift ? 99 : 1); return; }
    if (hit && hit.kind === 'track') {
      const bats = units.filter(u => u.d.weapon === 'sam' || u.d.weapon === 'gun');
      for (const u of bats) u.prio = hit.ref;
      if (bats.length) { IC.log(S, 'warn', 'ASSIGN', `${bats.length > 1 ? bats.length + ' batteries' : bats[0].name} assigned TN ${hit.ref.tn}.`); if (hit.ref.aff === 'A' || hit.ref.aff === 'N') IC.toast(S, 'warn', 'CAUTION', `TN ${hit.ref.tn} squawks as civil. Your battery will fire anyway.`); }
      ping(p); return;
    }
    const mov = units.filter(u => u.d.mob !== 'fixed' && u.state === 'ready');
    if (mov.length) {
      const cx = mov.reduce((s, u) => s + u.x, 0) / mov.length, cy = mov.reduce((s, u) => s + u.y, 0) / mov.length;
      let ok = 0;
      for (const u of mov) {
        let q = { x: p.x + U.clamp(u.x - cx, -150, 150), y: p.y + U.clamp(u.y - cy, -150, 150) };
        if (!IC.canPlace(S, u.type, q.x, q.y, u)) q = IC.findSpot(S, u.type, q.x, q.y, 10, 90);
        if (q && IC.relocate(S, u, q.x, q.y)) ok++;
      }
      if (ok) { ping(p); IC.sfx.ui('ok'); } else { IC.text(S, p.x, p.y, 'NOT HERE', IC.C.hostile); IC.sfx.ui('err'); }
    }
    return;
  }
}
/* what a right-click at this spot would do, in words, for the hover card: an order should never surprise */
function rightWhat(hit) {
  const m = S.mode2;
  if (m) return m.kind === 'build' ? (m.set ? 'cancel the plan' : m.pts && m.pts.length ? 'take the last point back' : 'stop building') : m.kind === 'found' ? (m.site ? 'pick another site' : 'cancel')
    : m.kind === 'airway' && m.from ? 'end this airway' : m.kind === 'road' && m.pts.length >= 2 ? 'build the road' : 'cancel';
  const air = S.sel && S.sel.kind === 'air' ? S.sel.ref : null;
  if (S.sel && S.sel.kind === 'flight' && hit && hit.kind === 'track' && S.sel.ref.kind === 'ftr') return `${S.sel.ref.name} launches to intercept TN ${hit.ref.tn}`;
  if (air && air.r && !air.job) return hit && hit.kind === 'track' && air.kind === 'ftr' ? `${air.name} intercepts TN ${hit.ref.tn}` : hit && hit.kind === 'air' && hit.ref !== air && air.kind === 'ftr' ? `${air.name} escorts ${hit.ref.name}` : isEnemyTarget(hit) && (air.kind === 'ftr' || air.kind === 'ucav') && air.gbu > 0 ? `${air.name} strikes ${hit.ref.name}` : `${air.name} flies here`;
  const units = selUnits(); if (!units.length) return '';
  const who = units.length > 1 ? `${units.length} units` : units[0].name;
  if (isEnemyTarget(hit) && units.some(u => u.d.weapon === 'strike' && u.state === 'ready')) return `fire on ${hit.ref.name} (shift: a salvo)`;
  if (hit && hit.kind === 'track') return units.some(u => u.d.weapon === 'sam' || u.d.weapon === 'gun') ? `make TN ${hit.ref.tn} the priority target` : '';
  return units.some(u => u.d.mob !== 'fixed' && u.state === 'ready') ? `move ${who} here` : '';
}
/* for automated testing: a click at a world position */
IC.clickWorld = (p, btn, shift) => { S.hover = p; return btn === 2 ? rightClick(p, shift) : leftClick(p, shift); };
function ping(p) { S.fx.rings.push({ x: p.x, y: p.y, r: 26, t: 0, color: '111,210,255', px: true }); }

/* ---------- orders from buttons and keys ---------- */
function findRef(kind, id) {
  if (kind === 'unit') return S.units.find(u => u.id === id);
  if (kind === 'infra') return S.byId[id];
  if (kind === 'site') return S.esites.find(s => s.id === id);
  if (kind === 'tel') return S.tels.find(t => t.id === id);
  if (kind === 'track') return S.threats.find(t => t.id === id);
  return null;
}
function command(a, v) {
  const sel = S.sel && S.sel.ref;
  switch (a) {
    case 'emcon': { const us = selUnits().filter(u => u.emitter); if (!us.length) return; if (v) { for (const u of us) u.emcon = u.d.weapon === 'sam' || v !== 'ambush' ? v : 'off'; } else { const order = us[0].d.weapon === 'sam' ? ['on', 'ambush', 'off'] : ['on', 'off']; const nx = order[(order.indexOf(us[0].emcon) + 1) % order.length]; for (const u of us) u.emcon = u.d.weapon === 'sam' || nx !== 'ambush' ? nx : 'off'; } break; }
    case 'uroe': for (const u of selUnits()) u.roe = v || ['auto', 'free', 'tight', 'hold'][(['auto', 'free', 'tight', 'hold'].indexOf(u.roe) + 1) % 4]; break;
    case 'udoc': for (const u of selUnits()) if (u.d.weapon === 'sam') u.doctrine = v || ['auto', 'sls', 'salvo', 'conserve'][(['auto', 'sls', 'salvo', 'conserve'].indexOf(u.doctrine) + 1) % 4]; IC.emit(S, 'doctrine', v); break;
    case 'move': { const us = selUnits(); if (us.length === 1 && us[0].d.mob !== 'fixed') IC.setMode({ kind: 'move', unit: us[0] }); return; }
    case 'heli': for (const u of selUnits()) IC.heliResupply(S, u, true); break;
    case 'pri': for (const u of selUnits()) u.pri = !u.pri; break;
    case 'repair': for (const u of selUnits()) IC.repairUnit(S, u); break;
    case 'clearPrio': for (const u of selUnits()) u.prio = null; break;
    case 'reserve': for (const u of selUnits()) if (!u.central) IC.toReserve(S, u); S.sel = null; S.group = []; break;
    case 'fireMode': { const us = selUnits(); if (us[0] && us[0].d.weapon === 'strike') IC.setMode({ kind: 'fireAt', unit: us[0] }); return; }
    case 'assignBest': {
      if (!sel || S.sel.kind !== 'track') return;
      const bats = S.units.filter(u => u.d.weapon === 'sam' && u.state === 'ready' && U.dist(u, sel) <= IC.maxRange(S, u) && IC.canSee(S, u, sel) && IC.chooseMun(S, u, sel, U.dist(u, sel)));
      bats.sort((a, b) => U.dist(a, sel) - U.dist(b, sel));
      if (bats[0]) { bats[0].prio = sel; IC.log(S, 'warn', 'ASSIGN', `${bats[0].name} assigned TN ${sel.tn}.`); } else IC.log(S, 'info', 'ASSIGN', `No battery can engage TN ${sel.tn} right now.`);
      break;
    }
    case 'scramble': {
      if (!sel || S.sel.kind !== 'track') return;
      // the flight that gets there first, in the air or on the ground
      const w = IC.bestInterceptor(S, sel);
      if (w) IC.commitIntercept(S, w, sel); else IC.log(S, 'info', 'AIR', `No fighter can reach TN ${sel.tn} right now.`);
      break;
    }
  }
  IC.ui.refresh(true);
}
IC.command = command;

function onAct(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const a = b.dataset.act, v = b.dataset.v, id = b.dataset.id;
  if (a && a.startsWith('range') && a !== 'rangeForm' && S && S.range) { IC.rangeAct(S, a, v); IC.sfx && IC.sfx.ui('click'); IC.ui.refresh(true); return; }
  IC.sfx && IC.sfx.init();
  // before the first region is built only the start screen answers (IC.begin waits for the region)
  if (!S && a !== 'begin' && a !== 'lesson' && a !== 'stPage') return;
  const sel = S && S.sel && S.sel.ref;
  const ui = IC.ui;
  if (IC.savesAct(S, a, v)) { IC.sfx.ui('click'); return; }
  switch (a) {
    case 'begin': if (/^showcase:/.test(v)) IC.begin('showcase', v.slice(9)); else IC.begin(v); return;
    case 'stPage': ui.startPage(v); if (v === 'keys') $('stKeys').innerHTML = IC.keysHTML(); IC.sfx.ui('click'); return;
    case 'menu': ui.toggleMenu(); break;
    case 'roomLocked': { const n = ui.roomAct(v); IC.toast(S, 'info', 'LATER', `The ${ui.roomName(v)} room opens in ${IC.ACTS[n].name}, ${IC.ACTS[n].title}. Finish this act's goals to get there.`); IC.sfx.ui('err'); break; }
    case 'sub': ui.roomScroll[ui.keys.wrBody] = $('wrBody').scrollTop; ui.sub[id] = v; break;
    case 'momentGo': ui.momentGo(); return;
    case 'momentX': ui.closeMoment(); break;
    case 'hintOk': IC.hint.hide(v, true); if (v.startsWith('game:') && S.hint) S.hint.done = true; break;
    case 'hintSkip': IC.hint.skipTour(v); break;
    case 'hintsOn': ui.hintsOn = !ui.hintsOn; ui.store.set('ic-hints-on', ui.hintsOn); if (!ui.hintsOn) for (const k of ['career1', 'war1']) IC.hint.skipTour(k); break;
    case 'hintsReset': IC.hint.reset(); ui.firstRunDone = null; IC.toast(S, 'info', 'HINTS', 'Every hint will show again.'); break;
    case 'lesson': IC.begin('academy', v); return;
    case 'nextLesson': { const i = IC.LESSONS.findIndex(l => l.id === S.camp.lesson.id); if (IC.LESSONS[i + 1]) IC.begin('academy', IC.LESSONS[i + 1].id); return; }
    case 'retryLesson': IC.begin('academy', S.camp.lesson.id); return;
    case 'keepPlaying': ui.overDismissed = true; $('over').hidden = true; return;
    case 'reroll': IC.reroll(); return;
    case 'pause': S.paused = !S.paused; S.skip = false; IC.waitStop(S); break;
    case 'speed': S.speed = +v; S.paused = false; S.skip = false; IC.waitStop(S); break;
    case 'waitPick': if (S.wait) { IC.waitStop(S); ui.waitPick = false; } else ui.waitPick = !ui.waitPick; break;
    case 'wait': ui.waitPick = false; IC.waitStart(S, v); break;
    case 'finishNow': ui.waitPick = false; if (!IC.waitStart(S, 'works:' + v)) IC.toast(S, 'info', 'WORKS', 'Nothing is being built here.'); break;
    case 'skip': startSkip(); break;
    case 'mute': if (!IC.sfx.on) IC.sfx.init(); else IC.sfx.toggle(); break;
    case 'roeAll': S.ad.roe = v; IC.log(S, 'info', 'WEAPONS', `National weapons status: ${v.toUpperCase()}.`); break;
    case 'doctrine': S.ad.doctrine = v; IC.emit(S, 'doctrine', v); IC.log(S, 'info', 'DOCTRINE', `Firing doctrine: ${{ sls: 'shoot-look-shoot', salvo: 'salvo', conserve: 'conserve' }[v]}.`); break;
    case 'airspace':
      IC.airspaceSet(S, v);
      break;
    // the rail and the keys open and close a room; its own tab strip only switches rooms
    case 'aptTab': ui.aptTab = v; break;
    case 'room': if (v !== ui.room || !b.closest('#wrTabs')) ui.openRoom(v); return;
    case 'wrclose': ui.openRoom(null); return;
    case 'toast': { const t = ui.toasts[+v]; if (t && t.at) ui.jump(t.at); break; }
    case 'alert': { const r = ui.alertRefs && ui.alertRefs[+v]; if (r) ui.jump(r, r.tn ? 'track' : r.d && r.type ? 'unit' : r.parts ? 'infra' : null); break; }
    case 'goal': { const g = S.story && S.story.goals[+v]; if (g && g.ref) { if (ui.room) ui.openRoom(null); ui.jump(g.ref, g.ref.parts || g.ref.kind === 'city' ? 'infra' : null); } break; }
    case 'qra': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r) IC.setAlert(S, r, IC.alertOf(r) === 5 ? 30 : 5); break; }
    case 'air': IC.airAct(S, b.dataset); break;
    case 'sug': { const o = S.camp.objs[+v]; if (!o) break; if (o.kind === 'arsenal') { ui.arMin = false; break; } if (o.kind === 'tech') { ui.openRoom('research'); return; } if (o.kind === 'airspace') { IC.airspaceSet(S, 'restricted'); break; } if (o.ref) ui.jump(o.ref, o.kind === 'point' ? null : o.kind); break; }
    case 'copen': ui.cOpen = performance.now(); ui.shownAt = performance.now() - 1e5; break;
    case 'cnext': ui.cOpen = performance.now(); ui.ci++; ui.shownAt = performance.now() - 1e5; break;
    case 'cprev': ui.cOpen = performance.now(); ui.ci = Math.max(0, ui.ci - 1); ui.shownAt = performance.now() - 1e5; break;
    case 'zin': IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1.3); break;
    case 'zout': IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1 / 1.3); break;
    case 'zhome': { const c = IC.cap(S); IC.flyTo(c.x, c.y, Math.max(IC.cam.z, 0.3)); break; }
    case 'zfull': IC.flyTo(IC.WW / 2, IC.WH / 2, IC.minZoom()); break;
    case 'layer': S.layers[v] = !S.layers[v]; break;
    case 'cat': ui.cat = v; ui.arMin = false; break;
    case 'arMin': ui.arMin = !ui.arMin; break;
    case 'briefMin': if (ui.compact()) ui.briefOpen = !ui.briefOpen; else ui.briefMin = !ui.briefMin; break;
    // (round 3) the one-line goal, message and feed open on demand
    case 'tipFold': ui.tipOpen = null; if (ui.tipSeen) for (const k of ui.tipSeen.keys()) ui.tipSeen.set(k, -1e9); break;
    case 'tipOpen': { const t = S.story && IC.storyTip(S); ui.tipOpen = t ? t.text : null; break; }
    case 'cexp': ui.cExp = !ui.cExp; ui.cOpen = performance.now(); ui.shownAt = performance.now() - 1e5; break;
    case 'feedOpen': ui.feedOpen = !ui.feedOpen; break;
    case 'inspMin': ui.inspMin = !ui.inspMin; break;
    case 'miniTog': ui.miniOn = !ui.miniOn; break;
    case 'deploy': {
      const d = IC.UNITS[v];
      ui.seen('unit:' + v);
      // a locked tile says what it needs; clicking it shows that research
      if (!IC.hasTech(S, d.tech)) { if (ui.roomOk('research')) ui.openRoom('research'); return; }
      const why = S.reserve[v] > 0 ? '' : IC.buyBlock(S, v);
      if (why) { IC.toast(S, 'info', 'BUY', `${d.name}: ${why.toLowerCase()}.`); break; }
      IC.setMode(S.mode2 && S.mode2.kind === 'deploy' && S.mode2.type === v ? null : { kind: 'deploy', type: v }); return;
    }
    case 'buyStock': { const [m, q] = v.split(':'); IC.buyStock(S, m, +q, id ? S.units.find(u => u.id === id) : null); break; }
    case 'autoStock': S.supply.auto = v === 'on'; IC.log(S, 'info', 'SUPPLY', S.supply.auto ? 'Keep stocked: the Ministry buys missiles and supply as stock runs low.' : 'Keep stocked is off: buy stock yourself in Supply.'); break;
    case 'floor': S.supply.floor = +v; break;
    case 'callin': { ui.seen('unit:callin'); const why = IC.callInWhy(S); if (why) { IC.toast(S, 'info', 'CALL-IN', why + '.'); break; } IC.setMode(S.mode2 && S.mode2.kind === 'callin' ? null : { kind: 'callin' }); return; }
    case 'research': IC.startResearch(S, v); break;
    case 'mobil': IC.setMobil(S, +v); break;
    case 'bonds': IC.warBonds(S); break;
    // (closing the panel keeps the build bar on the airport it was building: only Esc on the map lets go of it)
    case 'desel': { const a = selAp(); if (a && IC.bb) IC.bb.ap = a; S.sel = null; S.group = []; break; }
    // a card's fix: the airport, the build bar and the piece that fixes it, in one click
    case 'buildPick': {
      const a = (b.dataset.ap && S.byId[b.dataset.ap]) || selAp() || IC.bbAirport(S); if (!a) break;
      ui.closeCine(); if (ui.room) ui.openRoom(null);
      IC.bb.ap = a; IC.select({ kind: 'infra', ref: a }); IC.bbToggle(true); IC.bbPick(v);
      IC.flyTo(a.x, a.y, Math.max(IC.cam.z, 2.2)); return;
    }

    // (round 3) a problem marker on the map: what it is about, or its fix in one click
    case 'partMore': ui.partMore = !ui.partMore; break;
    case 'fixAt': { const a = selAp(); if (a) IC.fixOpen(S, a, v, { x: +b.dataset.x, y: +b.dataset.y }); return; }
    case 'fireDrill': { const a = selAp(), rw = a && a.parts.filter(q => q.kind === 'runway' && q.built).sort((p, q) => (a.st && a.st.rescueRw ? (a.st.rescueRw[q.id] || 0) - (a.st.rescueRw[p.id] || 0) : 0))[0];
      if (rw) { const fs = a.parts.find(q => q.kind === 'fire' && q.built) || a, far = U.dist(rw.a, fs) > U.dist(rw.b, fs) ? rw.a : rw.b, R = IC.fireRun(S, a, far, 'drill'); if (R) IC.toast(S, 'info', 'FIRE', `Drill: the trucks race to the far end of ${rw.name || 'the runway'}. They need to be there within ${IC.mmss(IC.FIRE_STD)} for heavy jets.`); } break; }
    case 'towerRules': { const a = selAp(); if (a) { ui.aptTab = 'rules'; IC.select({ kind: 'infra', ref: a }); } return; }
    case 'chainTog': IC.chainOn = !IC.chainOn; break;
    case 'aptOpen': ui.aptOpen = ui.aptOpen || {}; ui.aptOpen[v] = !ui.aptOpen[v]; break;
    case 'pmZoom': { const a = S.byId[v]; if (a) { IC.select({ kind: 'infra', ref: a }); IC.flyTo(a.x, a.y, Math.max(IC.cam.z, 6)); } return; }
    case 'pmGo': case 'pmFix': {
      const p = ui.pmById && ui.pmById.get(v), a = p && S.byId[p.ap]; if (!a) break;
      if (a !== selAp()) { IC.bb.closed = a.id; }
      if (b.dataset.act === 'pmFix' && p.fix && p.fix.part) { IC.fixOpen(S, a, p.fix.part, p.fix.near, p.fix.size); return; }
      ui.aptOpen = Object.assign(ui.aptOpen || {}, { deals: true }); ui.dealFocus = p.req || p.deal || null; ui.inspMin = false; ui.aptTab = 'info';
      if (p.req || p.deal) ui.scrollTo = 'aptDeals';
      const part = { fuel: 'fuel', term: 'terminal', stand: 'terminal' }[p.kind], q = part && a.parts.find(x => x.kind === part && x.built);
      if (b.dataset.act === 'pmGo' && q) IC.select({ kind: 'apart', ref: q, ap: a }); else IC.select({ kind: 'infra', ref: a });
      return;
    }
    case 'emcon': case 'uroe': case 'udoc': case 'move': case 'heli': case 'pri': case 'repair': case 'clearPrio': case 'reserve': case 'fireMode': case 'assignBest': case 'scramble': command(a, v); return;
    case 'emconAll': command('emcon', v); return;
    case 'dpri': { const d = id ? S.units.find(u => u.id === id) : sel; if (d) { d.pri = v; IC.log(S, 'info', 'LOGI', `${d.name}: resupply priority ${IC.DEPOT_PRI[v].name.toLowerCase()}.`); } break; }
    case 'buyTruck': if (sel) IC.buyCompany(S, sel); break;
    case 'buyTruckAt': { const d = S.units.find(u => u.id === id); if (d) IC.buyCompany(S, d); break; }
    case 'moveTruck': { const others = IC.depots(S).filter(d => d !== sel).sort((p, q) => U.dist(p, sel) - U.dist(q, sel)); if (others[0]) IC.moveCompany(S, sel, others[0]); break; }
    case 'assign': { const u = S.units.find(x => x.id === b.dataset.uid); if (u && sel) { u.prio = sel; IC.log(S, 'warn', 'ASSIGN', `${u.name} assigned TN ${sel.tn}.`); } break; }
    case 'fireFrom': { const u = S.units.find(x => x.id === b.dataset.uid); if (u) IC.fireMission(S, u, findRef(b.dataset.k, id), +v); break; }
    case 'airStrike': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r) IC.launchAir(S, r, { type: 'strike', site: findRef(b.dataset.k, id) }); break; }
    case 'isrOn': { const r = S.roster.find(x => x.id === b.dataset.rid), tg = findRef(b.dataset.k, id); if (r && tg) { const p = IC.aimOf(tg); IC.launchAir(S, r, { type: 'isr', x: p.x, y: p.y }); } break; }
    case 'loadout': { const r = S.roster.find(x => x.id === (b.dataset.rid || id)); if (r) IC.setLoadout(S, r, v); break; }
    case 'recall': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent) IC.recallAir(S, r.ent); break; }
    case 'recallSel': if (sel) IC.recallAir(S, sel); break;
    case 'selAir': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent) { ui.openRoom(null); ui.jump(r.ent, 'air'); } return; }
    case 'selAirE': { const a2 = S.air.find(x => x.id === id); if (a2) { ui.openRoom(null); ui.jump(a2, 'air'); } return; }
    case 'selFlight': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent && !r.ent.gnd) ui.jump(r.ent, 'air'); else if (r) { if (ui.room) ui.openRoom(null); IC.select({ kind: 'flight', ref: r }); } return; }
    case 'froe': if (sel && sel.r) { sel.r.roe = v; sel.roe = v; } break;
    case 'airMode': {
      const r = S.roster.find(x => x.id === b.dataset.rid); if (!r) break;
      ui.openRoom(null);
      if (v === 'strike') IC.setMode({ kind: 'airSite', r }); else IC.setMode({ kind: 'airPoint', r, mission: v });
      return;
    }
    case 'buyAir': IC.buyAircraft(S, v, id); break;
    case 'taskPoint': ui.openRoom(null); IC.setMode({ kind: 'airPoint', task: v, mission: v }); return;
    case 'twant': { const t = S.ato.find(x => x.id === id); if (t) t.want = U.clamp(t.want + +v, 1, 4); break; }
    case 'tdel': { const t = S.ato.find(x => x.id === id); if (t) IC.removeTask(S, t); break; }
    case 'prod': { const [m, q] = v.split(':'); IC.orderProduction(S, S.byId[id], m, +q); break; }
    case 'import': { const [m, q] = v.split(':'); IC.orderImport(S, m, +q); break; }
    case 'bwork': { const ap = selAp(); if (ap) IC.baseWork(S, ap, v, id); break; }
    case 'bcancel': { const ap = selAp(); if (ap) IC.cancelWork(S, ap, id); break; }
    case 'bauto': { const ap = selAp(); if (ap) ap.autoRepair = !ap.autoRepair; break; }
    case 'build': { const ap = selAp(); if (!ap || ap.locked) break; const cur = S.mode2; IC.setMode(cur && cur.kind === 'build' && cur.part === v && cur.ap === ap ? null : IC.bldMode(S, ap, v)); if (S.mode2 && IC.cam.z < 1.5) IC.flyTo(ap.x, ap.y, 2.2); return; }
    case 'bpref': { const [k, x] = v.split(':'); if (k === 'mat' && IC.bldPick && !IC.bldPick(S, x)) break; const P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true }; const val = k === 'fillet' ? !P.fillet : x === 'auto' ? null : x; P[k] = val; if (S.mode2 && S.mode2.kind === 'build') { S.mode2[k] = val; S.mode2.exitKey = null; } break; }
    case 'bundo': { const ap = selAp(); if (ap && IC.bldUndo(S, ap)) IC.sfx.ui('ok'); else IC.sfx.ui('err'); break; }
    case 'bwhen': { const ap = selAp(); const w = ap && ap.works.find(x => x.id === id); if (w) { w.rwMode = w.rwMode === 'night' ? 'close' : 'night'; } break; }
    case 'aptMove': if (S.sel && S.sel.kind === 'apart') { IC.setMode({ kind: 'bmove', ap: S.sel.ap, part: S.sel.ref, rot: S.sel.ref.a || 0 }); return; } break;
    case 'aptRot': if (S.sel && S.sel.kind === 'apart') { const p = S.sel.ref; if (!IC.bldMove(S, S.sel.ap, p, p.x, p.y, (p.a || 0) + (+v || Math.PI / 12))) IC.sfx.ui('err'); } break;
    case 'aptMat': if (S.sel && S.sel.kind === 'apart') { if (IC.bldUpgrade(S, S.sel.ap, S.sel.ref, v)) IC.sfx.ui('ok'); else IC.sfx.ui('err'); } break;
    case 'aptZone': if (S.sel && S.sel.kind === 'apart') IC.aptSetZone(S, S.sel.ap, S.sel.ref, v); break;
    case 'aptDir': if (S.sel && S.sel.kind === 'apart') { const p = S.sel.ref, nx = { '0': 1, '1': -1, '-1': 0 }[String(p.oneway || 0)]; IC.aptSetTaxiDir(S, S.sel.ap, p, nx, 0); } break;
    case 'flPark': { const r = S.roster.find(x => x.id === b.dataset.rid); const ap = selAp(); if (r && ap) { r.park = r.park === 'open' ? null : 'open'; IC.assignSlots(S, ap); } break; }
    case 'bulldoze': { const ap = selAp(); if (!ap) break; IC.setMode(S.mode2 && S.mode2.kind === 'bulldoze' ? null : { kind: 'bulldoze', ap }); return; }
    case 'aptZoom': { const ap = selAp(); if (ap) IC.flyTo(ap.x, ap.y, U.clamp(IC.cam.vw / (ap.radius * 2.4), 1.2, 12)); return; }
    case 'aptRepair': { const ap = selAp(); if (ap) IC.aptQueue(S, ap, v); break; }
    case 'aptFee': { const ap = selAp(); if (ap) { IC.avSetFee(S, ap, +v); IC.log(S, 'info', 'AVIATION', `${ap.name}: charges set to ${Math.round(+v * 100)}%.`); } break; }
    case 'ops': { const ap = selAp(); if (ap) IC.opsAct(S, ap, b.dataset); break; }
    case 'asp': IC.aspAct(S, selAp(), b.dataset); break;
    case 'apl': { const ap = selAp(); if (ap && IC.aplAct) IC.aplAct(S, ap, b.dataset); break; }
    case 'atc': if (sel && S.sel.kind === 'track') IC.atcAct(S, sel, b.dataset); break;
    case 'aptRwMode': { const ap = selAp(); if (ap) { ap.rwMode = ap.rwMode === 'mixed' ? 'auto' : 'mixed'; ap.cfg = null; IC.aptStats(S, ap); } break; }
    case 'aptCurfew': { const ap = selAp(); if (ap) { ap.curfew = !ap.curfew; if (!ap.curfew) { S.support = Math.max(0, S.support - 2); IC.log(S, 'warn', 'AVIATION', `${ap.name}: night flights allowed. Residents near the airport are not pleased.`, ap); } } break; }
    case 'aptRemove': if (S.sel && S.sel.kind === 'apart') { const why = IC.aptRemoveBlock(S, S.sel.ap, S.sel.ref); if (why) { IC.toast(S, 'warn', 'BULLDOZE', why); break; } IC.aptRemove(S, S.sel.ap, S.sel.ref.id); S.sel = { kind: 'infra', ref: S.sel.ap }; } break;
    case 'aptBack': if (S.sel && S.sel.kind === 'apart') S.sel = { kind: 'infra', ref: S.sel.ap }; break;
    case 'incGo': { const it = ui.incRefs && ui.incRefs[+v]; if (it) { const r = it.ref; ui.jump(r && r.tn ? r : { x: it.x, y: it.y }, r && r.tn ? 'track' : r && r.parts ? 'infra' : null); } break; }
    case 'incX': IC.incidentDismiss(S, v); break;
    case 'evChoose': IC.storyChoose(S, id, +v); IC.sfx.ui('ok'); ui.cache.evcard = null; if (S.paused && !S.story.events.length) S.paused = false; break;
    case 'radio': if (sel && S.sel.kind === 'track') IC.callAircraft(S, sel); break;
    case 'escortFire': { const a2 = S.air.find(x => x.id === id); if (a2 && sel) { a2.roe = 'free'; if (a2.r) a2.r.roe = 'free'; a2.tgt = sel; IC.log(S, 'warn', 'ORDERS', `${a2.name}: cleared to fire on TN ${sel.tn}.`, sel); IC.emit(S, 'fireOrder', { a: a2, t: sel }); } break; }
    case 'avYes': IC.avDecide(S, id, true); break;
    case 'avNo': IC.avDecide(S, id, false); break;
    case 'av': IC.avRoomAct(S, v, id); break;
    case 'zoneMode': ui.openRoom(null); IC.setMode({ kind: 'zone' }); return;
    case 'aspDraw': if (locked('airways')) return; ui.openRoom(null); S.layers.airways = true; IC.setMode(S.mode2 && S.mode2.kind === 'airway' && !id ? null : { kind: 'airway', from: id || null }); if (IC.cam.z < 0.04) { const c = IC.cap(S); IC.flyTo(c.x, c.y, 0.05); } return;
    case 'fixDel': IC.aspDelFix(S, id); S.sel = null; if (S.mode2 && S.mode2.from === id) S.mode2.from = null; break;
    case 'wayDel': IC.aspDelWay(S, id); S.sel = null; break;
    case 'fieldMode': if (locked('fields')) return; ui.openRoom(null); IC.setMode({ kind: 'field' }); return;
    case 'selFix': { const f = IC.aspFix(S, id); if (f) { S.layers.airways = true; ui.openRoom(null); ui.jump(f, 'fix'); } return; }
    case 'selField': { const f = S.asp.fields.find(x => x.id === id); if (f) { ui.openRoom(null); ui.jump(f, 'field'); } return; }
    case 'zoneDel': IC.avRemoveZone(S, id); break;
    case 'foundMode': if (locked('found')) return; ui.openRoom(null); IC.setMode({ kind: 'found' }); return;
    case 'tutOff': if (S.story) S.story.tut = false; break;
    case 'bbToggle': IC.bbToggle(); return;
    case 'roadMode': ui.openRoom(null); IC.setMode({ kind: 'road', cls: v, pts: [], snaps: [] }); return;
    case 'rushRepair': IC.rushRepair(S, id); break;
    case 'loan': IC.takeLoan(S, +v); break;
    case 'repayLoan': IC.repayLoan(S, id); break;
    case 'delegate': IC.storyDelegate(S, v, !S.story.del[v]); break;
    case 'cpReq': IC.storyRequest(S, v); break;
    case 'routeFly': { const r = S.av.routes.find(x => x.id === id); if (r) { ui.openRoom(null); ui.jump(S.byId[r.a], 'infra'); } return; }
    case 'selInfra': { const r = S.byId[id]; if (r) { ui.openRoom(null); ui.jump(r, 'infra'); } return; }
    case 'logjump': ui.openRoom(null); ui.jump({ x: +b.dataset.x, y: +b.dataset.y }); return;
    case 'replay': ui.openRoom(null); IC.replayOpen(S, { x: +b.dataset.x, y: +b.dataset.y, t: +b.dataset.t }); return;
    case 'replayTrack': if (sel) IC.replayOpen(S, { follow: sel, x: sel.x, y: sel.y, t: S.time - 90 }); return;
    case 'liveView': { const o = S.sel && S.sel.kind === 'tail' ? (sel.mv && !sel.mv.dead ? sel.mv : sel.track) : sel; if (o) IC.liveOpen(S, o); return; }
    case 'followOff': followOff(); return;
    case 'follow': {
      const tl = S.sel && S.sel.kind === 'tail' ? S.sel.ref : S.sel && S.sel.kind === 'track' && S.sel.ref.tail ? S.sel.ref.tail : null;
      if (!tl) return;
      if (S.follow && S.follow.tl === tl.id) { followOff(); return; }
      IC.followStart(S, tl, false); const w = IC.tailWhere(S, tl); if (w) IC.flyTo(w.x, w.y, Math.max(IC.cam.z, w.t ? 4 : 20)); IC.sfx.ui('ok'); return;
    }
    case 'logf': ui.logFilter = v; break;
    case 'refcat': ui.refCat = v; break;
    case 'why': ui.why = ui.why === v ? null : v; break;
    case 'uiscale': ui.applyScale(+v); ui.saveCfg(); setTimeout(resize, 50); break;
    case 'cfg': S.cfg[v] = !S.cfg[v]; ui.saveCfg(); break;
    case 'radarFx': S.cfg.radarFx = v; ui.saveCfg(); break;
    case 'q3d': if (IC.q3d) IC.q3d.set(v); break;
    case 'pauseRoom': ui.pauseRoom = !ui.pauseRoom; ui.saveCfg(); break;
    case 'pauseOn': S.cfg.pauseOn[v] = !ui.pauseOnIs(S.cfg.pauseOn, v); ui.saveCfg(); break;
    case 'selu': case 'sels': case 'selt': case 'selv': {
      const kind = { selu: 'unit', sels: 'site', selt: 'tel', selv: 'veh' }[a];
      const ref = kind === 'veh' ? S.vehicles.find(x => x.id === id) : findRef(kind, id);
      if (ref) { ui.openRoom(null); ui.jump(ref, kind); }
      return;
    }
  }
  IC.sfx && IC.sfx.ui('click');
  ui.refresh(true);
  if (!$('start').hidden && ui.stPage === 'settings') ui.startPage('settings');
}
function onInput(e) {
  const el = e.target;
  if (el.dataset.act === 'rangeForm' && S.range) { IC.rangeForm(S, el.name, el.value); IC.ui.busyUntil = performance.now() + 1500; return; }
  if (el.dataset.act === 'vol') { IC.sfx.setVol(+el.value / 100); IC.ui.saveCfg(); IC.ui.busyUntil = performance.now() + 600; }
}
document.addEventListener('click', onAct);
document.addEventListener('input', onInput);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('tile')) onAct(e); });
for (const id of ['arsenal', 'insp', 'wrBody', 'feed', 'comms', 'rail', 'brief']) {
  const el = $(id);
  el.addEventListener('pointerdown', () => { IC.ui.busyUntil = performance.now() + 1500; });
  el.addEventListener('pointerup', () => { IC.ui.busyUntil = performance.now() + 150; });
}
$('cine').addEventListener('click', () => IC.ui.closeCine());

/* ---------- time: skip ahead and auto-pause ---------- */
function startSkip() { IC.waitStop(S); S.skip = true; S.paused = false; S.skipT = S.time; }
// anything that stops skip stops a wait for money too
function stopSkip(why) { if (S.wait) { IC.waitStop(S, why); return; } if (!S.skip) return; S.skip = false; if (why) IC.toast(S, 'info', 'SKIP', why); }
IC.on((S2, type, d) => {
  if (S2 !== S) return;
  const P = S.cfg.pauseOn;
  const pause = why => { if (!S.paused) { S.paused = true; S.skip = false; if (S.wait) IC.waitStop(S, why); IC.toast(S, 'warn', 'PAUSED', why); } };
  // a wait ends on its own: back to the speed the player had, and say why
  if (type === 'waitDone') { if (d.why) IC.toast(S, 'info', 'WAIT', d.why); IC.ui.waitPick = false; return; }
  if (type === 'ballistic') { if (P.ballistic) pause('Ballistic launch detected.'); else stopSkip('Ballistic launch.'); }
  else if (type === 'unitLost' || type === 'acLost') { if (P.lost) pause(`${d.name} lost.`); else stopSkip(`${d.name} lost.`); }
  else if (type === 'baseHit') { if (P.base) pause(`${d.base.name} hit.`); else stopSkip(`${d.base.name} hit.`); }
  else if (type === 'enemyStrike') { if (P.raid) pause('Major enemy strike forming.'); }
  else if (type === 'cityHit') { if (P.city) pause(`${d.city.name} hit.`); else stopSkip(); }
  else if (type === 'aff' && (d.aff === 'H' || d.aff === 'S') && IC.inHome(d.x, d.y)) stopSkip(`TN ${d.tn}: ${IC.AFF[d.aff].name.toLowerCase()} track.`);
  else if (type === 'track' && (d.d.cls === 'air' || d.d.cls === 'cm') && !d.border) stopSkip(`New track TN ${d.tn}.`);
  else if (type === 'weaponRelease') { if (P.launch !== false && S.mode !== 'academy' && !S.enemy.war) pause('Weapons released.'); else stopSkip('Weapons released.'); }
  else if (type === 'event') { if (P.event !== false) pause(d.title); else stopSkip(d.title); }
  else if (type === 'incidentAdded') { if ((S.wait || S.skip) && IC.waitWorth(S, type, d)) stopSkip(d.text ? d.text.charAt(0).toUpperCase() + d.text.slice(1) + '.' : ''); }
  // (Finish now runs through the goals its own works tick off: the airport opening is what it waits for)
  else if (type === 'act' || type === 'goal') { if (!(S.wait && S.wait.works && type === 'goal')) stopSkip(); }

  else if (type === 'request') stopSkip(`${IC.avAirline(S, d.al).name} offers a deal.`);
  else if (type === 'dealWarn' || type === 'dealStrike' || type === 'dealBroken') stopSkip(`${d.al.name}: its deal ${type === 'dealBroken' ? 'is over' : 'is at risk'}.`);
  else if (type === 'assault' || type === 'chapter' || type === 'war' || type === 'frontActive' || type === 'delivered' || type === 'lessonDone') stopSkip();
});

/* ---------- pointer and keyboard ---------- */
const ptrs = new Map();
let drag = null, pinch = null, lastClick = { t: 0, x: 0, y: 0 };
const local = (e, el) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener('pointerdown', e => {
  // (a drag that starts on the map must not select the text of the panels it passes over)
  e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  cv.setPointerCapture(e.pointerId);
  const l = local(e, cv);
  ptrs.set(e.pointerId, l);
  S.hover = IC.toWorld(l.x, l.y);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; S.box = null; }
  else if (ptrs.size === 1) {
    drag = { sx: l.x, sy: l.y, cx: IC.cam.x, cy: IC.cam.y, moved: false, btn: e.button, box: e.shiftKey && e.button === 0 };
    // in the airway editor, fixes can be dragged
    if (e.button === 0 && S.mode2 && S.mode2.kind === 'airway') drag.fix = IC.aspFixAt(S, S.hover, 12 / IC.cam.z);
    // a planned airport's runway turns by dragging along it
    if (e.button === 0 && S.mode2 && S.mode2.kind === 'found' && S.mode2.site && U.dist(S.mode2.site, S.hover) < 18) drag.turn = true;
    // (round 1) a two-point piece or area drags out from where the button went down: drag to stretch
    const bm = S.mode2 && S.mode2.kind === 'build' ? S.mode2 : null;
    if (e.button === 0 && bm && !bm.set && !bm.pts.length && IC.bldDragPart(bm.part)) drag.bstart = { x: S.hover.x, y: S.hover.y };
    // in the airport's Airspace tab, a ring's edge can be dragged
    if (e.button === 0 && aspEditing()) drag.edge = IC.aspEdgeAt(S, selAp(), S.hover, 8 / IC.cam.z);
  }
  IC.cam.fly = null;
});
cv.addEventListener('pointermove', e => {
  const l = local(e, cv);
  S.hover = IC.toWorld(l.x, l.y);
  IC.bldFree = e.shiftKey;   // Shift draws without snapping (builder.js)
  if (!ptrs.size) {
    const edge = aspEditing() && IC.aspEdgeAt(S, selAp(), S.hover, 8 / IC.cam.z);
    IC.ui.aspEdge = edge ? edge.id : null;
    if (edge) { IC.ui.tip(null); cv.title = `Drag to move the edge of the ${edge.name.toLowerCase()} (now ${U.km(edge.r1)} out)`; cv.style.cursor = 'grab'; return; }
    cv.title = '';
    // (the builder's own card sits by the cursor and its help line says what a right-click does: no hover card over it)
    const ent = pick(S.hover); if (S.mode2 && (S.mode2.kind === 'build' || S.mode2.kind === 'found')) IC.ui.tip(null); else IC.ui.tip(ent, l.x, l.y, rightWhat(ent)); cv.style.cursor = S.mode2 ? 'crosshair' : ent ? 'pointer' : 'default'; return;
  }
  IC.ui.tip(null);
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, l);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    IC.zoomAt(mx, my, d / pinch.d);
    IC.cam.x -= (mx - pinch.mx) / IC.cam.z; IC.cam.y -= (my - pinch.my) / IC.cam.z; IC.clampCam();
    pinch = { d, mx, my };
  } else if (drag) {
    const dx = l.x - drag.sx, dy = l.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; if (!drag.box) cv.classList.add('dragging'); }
    if (drag.moved) {
      if (drag.fix) IC.aspMoveFix(S, drag.fix, S.hover.x, S.hover.y);
      else if (drag.turn) IC.foundTurn(S.mode2, 0, S.hover);
      else if (drag.bstart) { if (!drag.bplaced && S.mode2 && S.mode2.kind === 'build') { drag.bplaced = buildIn(S.mode2, drag.bstart, 0, e.shiftKey) === 'point'; if (!drag.bplaced) drag.bstart = null; } }
      else if (drag.edge) { IC.aspResize(S, drag.edge, U.dist(drag.edge, S.hover)); IC.ui.aspVol = drag.edge.id; IC.ui.aspEdge = drag.edge.id; cv.style.cursor = 'grabbing'; }
      else if (drag.box) S.box = { x0: drag.sx, y0: drag.sy, x1: l.x, y1: l.y };
      else { IC.cam.x = drag.cx - dx / IC.cam.z; IC.cam.y = drag.cy - dy / IC.cam.z; IC.clampCam(); if (S.follow) followOff(); }
    }
  }
});
function up(e) {
  const had = ptrs.has(e.pointerId);
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (had && drag && e.type === 'pointerup') {
    if (drag.bplaced && drag.moved && S.mode2 && S.mode2.kind === 'build') buildIn(S.mode2, S.hover, 0, e.shiftKey);
    else if (drag.fix && drag.moved) IC.ui.refresh(true);
    else if (drag.edge && drag.moved) { const v = drag.edge; IC.log(S, 'info', 'AIRSPACE', `${selAp().name}: ${IC.aspShort(v)}`, selAp()); IC.ui.refresh(true); }
    else if (drag.box && S.box) {
      const b = S.box, a = IC.toWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), c = IC.toWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      const inB = o => o.x >= a.x && o.x <= c.x && o.y >= a.y && o.y <= c.y;
      S.group = S.units.filter(inB);
      S.sel = S.group.length ? { kind: 'unit', ref: S.group[0] } : null;
      if (S.group.length === 1) S.group = [];
      S.box = null; IC.ui.refresh(true);
    } else if (!drag.moved) {
      if (drag.btn === 2) rightClick(S.hover, e.shiftKey);
      else if (drag.btn === 0) {
        const now = performance.now();
        if (now - lastClick.t < 320 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 6 && S.sel && S.sel.kind === 'unit') {
          const type = S.sel.ref.type, c = IC.cam;
          S.group = S.units.filter(u => u.type === type && u.x > c.x && u.x < c.x + c.vw / c.z && u.y > c.y && u.y < c.y + c.vh / c.z);
          if (S.group.length < 2) S.group = [];
          IC.ui.refresh(true);
        } else leftClick(S.hover, e.shiftKey);
        lastClick = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }
  drag = null; S.box = null; cv.classList.remove('dragging');
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => { if (!ptrs.size) { S.hover = null; IC.ui.tip(null); } });
cv.addEventListener('contextmenu', e => e.preventDefault());
// (round 1) one notch of the wheel is one step of about 20%, however large the browser reports it; a touchpad's
// small deltas still zoom smoothly
cv.addEventListener('wheel', e => { e.preventDefault(); if (S && S.follow) S.follow.auto = false; const l = local(e, cv), d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1); IC.zoomAt(l.x, l.y, Math.exp(-U.clamp(d * 0.0018, -0.18, 0.18))); }, { passive: false });


function miniMove(e) { const l = local(e, mini); IC.cam.fly = null; IC.centerOn(l.x / mw * IC.WW, l.y / mh * IC.WH); }
mini.addEventListener('pointerdown', e => { mini.setPointerCapture(e.pointerId); miniMove(e); });
mini.addEventListener('pointermove', e => { if (e.buttons) miniMove(e); });

const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.key === 'Shift') IC.bldFree = true;
  if (e.target.closest && e.target.closest('input,textarea')) return;
  // the start screen: Enter starts a Career, Esc goes back a page (also while the first region is still being built)
  if (!$('start').hidden) {
    if (e.key === 'Escape' && IC.ui.stPage && IC.ui.stPage !== 'main') IC.ui.startPage('main');
    else if (e.key === 'Enter' && (!IC.ui.stPage || IC.ui.stPage === 'main') && !(e.target.closest && e.target.closest('button'))) IC.begin('story');
    return;
  }
  if (!S) return;
  if (IC.ui.menu && e.key !== 'Escape') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { const ap = (S.mode2 && S.mode2.ap) || selAp(); if (ap) { e.preventDefault(); IC.sfx.ui(IC.bldUndo(S, ap) ? 'ok' : 'err'); IC.ui.refresh(true); return; } }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, lk = k.toLowerCase();
  const ui = IC.ui;
  // the keys shown on the rail (and the old ones, N K T, still work)
  const rooms = { a: 'air', l: 'logi', i: 'intel', n: 'intel', r: 'research', k: 'research', j: 'journal', v: 'aviation', c: 'staff', t: 'staff', e: 'economy' };
  const bm = S.mode2 && S.mode2.kind === 'build' ? S.mode2 : null;
  if (bm && lk === 'r') {
    if (!IC.pieceTurn(bm, 1, e.shiftKey)) bm.rot = (bm.rot || 0) + (e.shiftKey ? Math.PI / 2 : Math.PI / 12);
    IC.ui.refresh(true); return;
  }
  if (bm && lk === 'f') { bm.fillet = !bm.fillet; S.bldPref.fillet = bm.fillet; IC.ui.refresh(true); return; }
  if (bm && k === 'Enter') { buildGo(); return; }
  if (bm && k === 'Backspace' && bm.pts && bm.pts.length) { IC.buildCancel(S, bm, true); IC.ui.refresh(true); return; }
  const fm = S.mode2 && S.mode2.kind === 'found' ? S.mode2 : null;
  if (fm && lk === 'r') { IC.foundTurn(fm, e.shiftKey ? -1 : 1); IC.ui.refresh(true); return; }
  if (fm && k === 'Enter' && fm.site) { foundGo(); return; }
  if (S.mode2 && S.mode2.kind === 'bmove' && lk === 'r') { S.mode2.rot += e.shiftKey ? -Math.PI / 12 : Math.PI / 12; return; }
  if (S.mode2 && S.mode2.kind === 'bmove' && k === 'Enter') { buildGo(); return; }
  const rm = S.mode2 && S.mode2.kind === 'road' ? S.mode2 : null;
  if (rm && k === 'Enter' && rm.pts.length >= 2) { roadDone(); return; }
  if (rm && k === 'Backspace' && rm.pts.length) { IC.roadUndo(S, rm, 14 / IC.cam.z); IC.ui.refresh(true); return; }
  if ((k === 'Delete' || k === 'Backspace') && S.sel && (S.sel.kind === 'fix' || S.sel.kind === 'airway')) {
    if (S.sel.kind === 'fix') { IC.aspDelFix(S, S.sel.ref.id); if (S.mode2 && S.mode2.from === S.sel.ref.id) S.mode2.from = null; } else IC.aspDelWay(S, S.sel.ref.id);
    S.sel = null; IC.ui.refresh(true); return;
  }
  // the build bar: B opens and closes it; while it is open 1–0 pick its tabs and U, M, Del, I its tools
  const bbOn = IC.bb && IC.bb.open && $('bbar') && !$('bbar').hidden;
  if (lk === 'b' && !(S.sel && S.sel.kind === 'track')) { IC.bbToggle(); return; }
  // (round 1) the number keys are the speeds everywhere; Shift with a number picks the build bar's tab
  const dg = /^Digit([0-9])$/.exec(e.code || '');
  if (bbOn && !(selUnits().length) && e.shiftKey && dg) { const t = IC.bbTabs(S).find(x => x.key === dg[1]); if (t) { IC.bbTab(t.k); return; } }
  if (bbOn && !(selUnits().length) && (lk === 'u' || lk === 'm' || lk === 'i' || k === 'Delete')) { IC.bbTool(lk === 'u' ? 'upgrade' : lk === 'm' ? 'move' : lk === 'i' ? 'info' : 'bulldoze'); return; }
  const selKind = S.sel && S.sel.kind;
  const unitSel = selUnits().length > 0, trackSel = selKind === 'track';
  const ukeys = { e: 'emcon', w: 'uroe', q: 'udoc', m: 'move', h: 'heli', p: 'repair', x: 'reserve', f: 'fireMode' };
  if (k === ' ') { e.preventDefault(); S.paused = !S.paused; S.skip = false; IC.waitStop(S); }
  else if (k >= '1' && k <= '6') { S.speed = IC.SPEEDS[+k - 1]; S.paused = false; S.skip = false; IC.waitStop(S); }
  else if (k === '7') { if (S.wait) IC.waitStop(S); else ui.waitPick = !ui.waitPick; IC.ui.refresh(true); }
  else if (lk === 's') startSkip();
  // Esc always backs out of the top thing, one at a time; with nothing open it brings up the menu
  else if (k === 'Escape') {
    const note = IC.ui.topHint();
    if (ui.menu) ui.toggleMenu(false);
    else if (note) IC.hint.hide(note, true);
    else if (!$('unlock').hidden) ui.closeMoment();
    else if (!$('cine').hidden) ui.closeCine();
    else if (S.mode2 && buildEsc()) {}
    else if (S.mode2) IC.setMode(null);
    else if (ui.room) ui.openRoom(null);
    else if (IC.bb && IC.bb.open && IC.bb.view) { IC.bb.view = null; }
    else if (IC.bb && IC.bb.open) IC.bbToggle(false);
    else if (S.icpt) S.icpt = null;
    else if (S.sel || S.group.length) { S.sel = null; S.group = []; }
    else if (S.over && !ui.overDismissed) return;
    else ui.toggleMenu(true);
  }
  else if (k === '?' || (k === '/' && e.shiftKey)) ui.openRoom('reference');
  else if (unitSel && ukeys[lk]) command(ukeys[lk]);
  else if (k === 'Tab') { e.preventDefault(); const t = IC.cycleTrack(S, e.shiftKey ? -1 : 1); if (t) { if (S.sel && (S.sel.kind === 'air' || S.sel.kind === 'flight') && IC.airClick(S, { kind: 'track', ref: t })) IC.flyTo(t.px, t.py, Math.max(IC.cam.z, 0.05)); else IC.ui.jump(t, 'track'); } }
  else if (k === 'Enter' && S.icpt) IC.airAct(S, { op: 'go' });
  else if (trackSel && lk === 'v') command('scramble');
  else if (trackSel && lk === 'b') command('assignBest');
  else if (lk === 'g' && IC.callInOpen(S)) { const why = IC.callInWhy(S); if (why) IC.toast(S, 'info', 'CALL-IN', why + '.'); else IC.setMode(S.mode2 && S.mode2.kind === 'callin' ? null : { kind: 'callin' }); }
  else if (rooms[lk]) { if (ui.roomOk(rooms[lk])) ui.openRoom(rooms[lk]); return; }
  else if (k === '+' || k === '=') IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1.25);
  else if (k === '-' || k === '_') IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 0.8);
  else if (k === 'Home') { const c = IC.cap(S); IC.flyTo(c.x, c.y, Math.max(IC.cam.z, 0.3)); }
  else if (k.startsWith('Arrow')) { keys.add(lk); e.preventDefault(); IC.cam.fly = null; }
  else return;
  IC.ui.refresh(true);
});
window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') IC.bldFree = false; });
window.addEventListener('blur', () => keys.clear());

function resize() {
  IC.resizeRender(app.clientWidth, app.clientHeight);
  const r = mini.getBoundingClientRect(); mw = r.width || 225; mh = r.height || 169;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mini.width = Math.round(mw * dpr); mini.height = Math.round(mh * dpr);
}

/* ---------- start screen ---------- */
function describe(W) {
  const dirA = compass(W, 'A'), dirB = compass(W, 'B');
  return `The ${W.full.H} is landlocked between the hostile ${W.full.A} to the ${dirA} and the ${W.full.B} to the ${dirB}, with ${W.names.C} and ${W.names.D} neutral. Its capital, ${W.cities[0].name}, is home to ${(W.cities[0].pop / 1000).toFixed(1)} million people; ${W.cities.length} cities, ${W.villages.filter(v => v.home).length} villages and ${W.bridges.length} bridges tie it together.`;
}
function compass(W, k) { const [a0, a1] = W.secSpan(k), a = (a0 + a1) / 2; return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
/* while a game is built the page draws between stages (state.js); IC.onLoadProgress(stage, share done) says how far it
   has got: here in the start screen's line, and a loading screen can put its own in place */
const STAGE_WORDS = { relief: 'Raising the hills', rivers: 'Running the rivers', cities: 'Founding the cities', roads: 'Laying the roads and railways',
  bridges: 'Bridging the rivers', towns: 'Building the towns', junctions: 'Joining the roads', routing: 'Mapping the routes', airports: 'Laying out the airports',
  forces: 'Placing the forces', traffic: 'Setting the traffic going', economy: 'Setting up the budget', done: 'Ready' };
IC.STAGE_WORDS = STAGE_WORDS;
IC.onLoadProgress = IC.onLoadProgress || ((stage, f) => { $('startLead').textContent = `${STAGE_WORDS[stage] || 'Preparing'}… ${Math.round(f * 100)}%`; });
let loading = 0, building = Promise.resolve(), nth = 0;
IC.building = () => loading > 0;   // (IC.loading is a save being loaded, saves.js)
function generate(seed, mode, lesson) { return (building = build(seed, mode, lesson)); }
/* the latest build wins: one started later (a new map, another mode) makes an earlier one's game go unused, and it
   resolves to null */
async function build(seed, mode, lesson) {
  const me = ++nth;
  loading++;
  let S2;
  // (the airport showcase is the Career's ready-made network with a real airport in place of the capital's)
  const o = mode === 'showcase' ? { seed, mode: 'story', preset: 'network', showcase: lesson, hour: 9 } : { seed, mode, lesson, hour: mode === 'academy' ? 10 : mode === 'story' ? 7 : 6 };
  try { S2 = await IC.newGameAsync(o, (st, f) => { if (me === nth) IC.onLoadProgress(st, f); }); }
  finally { loading--; }
  if (me !== nth) return null;
  S = IC.S = S2;
  IC.resetMini();
  IC.ui.bind(S);
  resize();
  if (S.range) { IC.cam.z = IC.frameZoom(0, 0, 18000, 13500); IC.centerOn(S.world.cx, S.world.cy); } else IC.frame(...IC.homeBox(S.world));
  $('seed').textContent = String(seed);
  $('startLead').textContent = S.range ? 'The test range: a flat, empty plane.' : describe(S.world);
  return S;
}
IC.reroll = function () {
  $('startLead').textContent = 'Generating a new region…';
  setTimeout(() => generate((Math.random() * 1e9) >>> 0, 'campaign'), 30);
};
/* the start screen's game is a fresh Quick war on its region: starting one uses it as it is instead of building it again */
const fresh = (mode, seed) => mode === 'campaign' && S && S.mode === 'campaign' && S.world.seed === seed && !S.started;
/* a loaded game takes over from the one on screen (saves.js) */
IC.adopt = function (st, view) {
  S = IC.S = st;
  IC.resetMini();
  IC.ui.bind(S);
  // what the player had already read stays read: chapter cards and staff messages from before the save
  if (S.camp) { IC.ui.cineShown = S.camp.cards.length; IC.ui.lastLen = S.camp.comms.length; IC.ui.ci = Math.max(0, S.camp.comms.length - 1); $('cine').hidden = true; }
  resize();
  $('seed').textContent = String(S.seed);
  $('start').hidden = true; $('over').hidden = true;
  if (view) { IC.cam.z = view.z; IC.centerOn(view.x, view.y); } else IC.frame(...IC.homeBox(S.world));
  S.paused = true;
  IC.ui.refresh(true);
};
IC.showStart = function () { $('over').hidden = true; $('start').hidden = false; IC.ui.toggleMenu(false); IC.ui.room && IC.ui.openRoom(null); IC.ui.startPage('main'); IC.reroll(); };
IC.begin = function (mode, lesson) {
  IC.sfx.init();
  const go = () => {
    $('start').hidden = true; $('over').hidden = true;
    S.paused = false;
    const f = S.camp && S.camp.focus;
    const ap = (mode === 'story' || mode === 'showcase') && S.byId[S.story.cap];
    if (ap && S.showcase) { const r = ap.radius || 60; IC.frame(ap.x - r, ap.y - r * 0.8, ap.x + r, ap.y + r * 0.8, false, 1); }
    else if (ap) { IC.cam.z = 0.9; IC.centerOn(ap.x, ap.y); IC.flyTo(ap.x, ap.y, 2.4); }
    else if (f) { IC.cam.z = f.z; IC.centerOn(f.x, f.y); }
    else {
      // Quick war: the capital and the forward air base, where the war starts
      const c = IC.cap(S), b = S.byId.ab_fwd || c;
      IC.frame(Math.min(c.x, b.x) - 1500, Math.min(c.y, b.y) - 1500, Math.max(c.x, b.x) + 1500, Math.max(c.y, b.y) + 1500, false, 1.1);
    }
    IC.ui.refresh(true);
  };
  // (a promise, kept when the game is ready: scripts and tools await it; a region still being built is finished first)
  return building.catch(() => null).then(() => {
    const seed = mode === 'academy' ? 20260926 : S.seed;
    if (fresh(mode, seed)) { S.started = true; go(); return S; }
    $('startLead').textContent = 'Preparing…';
    return new Promise(ok => setTimeout(() => generate(seed, mode, lesson).then(S2 => { if (S2) { S.started = true; go(); } ok(S2); }), 30));
  });
};

IC.initRender(cv);
$('stVer').textContent = 'v' + IC.VERSION;
new ResizeObserver(resize).observe(app);
generate((Math.random() * 1e9) >>> 0, 'campaign');
IC.ui.startPage('main');

/* (round 2) following an airliner: the camera stays with it from final to the gate and back out (S.follow,
   aptlife.js); when the game started it (the first landing) it also zooms by what the aircraft is doing, until
   the player zooms. Dragging the map or the arrow keys let it go */
const FOLLOW_Z = { air: 6, near: 9, final: 12, land: 16, rollout: 18, taxi: 30, parkin: 50, stand: 60, push: 45, start: 50, wait: 50, svc: 30, hold: 26, lineup: 20, roll: 14 };
function followOff() { if (!S.follow) return; const tl = IC.followTail(S); IC.followStop(S); IC.toast(S, 'info', 'FOLLOW', `Stopped following ${tl ? tl.cs : 'the aircraft'}.`); }
IC.followOff = followOff;
function followCam(dtR) {
  if (!S.follow) return;
  const why = IC.followEnds(S);
  if (why) { IC.followStop(S); IC.toast(S, 'info', 'FOLLOW', why); return; }
  const tl = IC.followTail(S), w = IC.tailWhere(S, tl); if (!w) return;
  const c = IC.cam, cx = c.x + c.vw / c.z / 2, cy = c.y + c.vh / c.z / 2;
  c.fly = null;
  if (S.follow.auto) {
    const ph = w.t ? (w.ap && U.dist(w.t, w.ap) < 150 ? 'near' : 'air') : w.m ? w.m.phase : 'stand';
    const want = FOLLOW_Z[ph] || 26;
    c.z = Math.exp(Math.log(c.z) + (Math.log(want) - Math.log(c.z)) * (1 - Math.exp(-dtR * 0.9)));
  }
  const k = 1 - Math.exp(-dtR * 5);
  IC.centerOn(cx + (w.x - cx) * k, cy + (w.y - cy) * k);
}
let last = performance.now(), uiT = 0;
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  // nothing to draw until the first game is built, while the next is built, or while a save replaces it
  if (!S || loading || IC.loading) { requestAnimationFrame(frame); return; }
  if (keys.size) {
    if (S.follow && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some(k => keys.has(k))) followOff();
    const v = 700 / IC.cam.z * dtR;
    if (keys.has('arrowup')) IC.cam.y -= v;
    if (keys.has('arrowdown')) IC.cam.y += v;
    if (keys.has('arrowleft')) IC.cam.x -= v;
    if (keys.has('arrowright')) IC.cam.x += v;
    IC.clampCam();
  }
  IC.camStep(dtR);
  followCam(dtR);
  const C = IC.cine;
  C.cool = Math.max(0, C.cool - dtR);
  if (C.slow > 0) C.slow -= dtR;
  if (C.barsT > 0) C.barsT -= dtR;
  C.bars = U.clamp(C.bars + (C.barsT > 0 ? 1 : -1) * dtR * 2.5, 0, 1);
  let gdt = 0;
  const running = !S.paused && (!S.over || IC.ui.overDismissed) && $('start').hidden;
  if (running) {
    let speed = combatSpeed(S, S.wait ? (S.wait.speed || IC.WAIT.speed) : S.skip ? 64 : S.speed, dtR);
    gdt = dtR * IC.GS * speed;
    // the life on the ground (people, cars) keeps its own clock: no faster than 2× however fast the game runs
    IC.lifeT = (IC.lifeT || 0) + dtR * IC.GS * Math.min(2, speed);
    if (S.skip && S.time - (S.skipT || S.time) > 3 * 3600) stopSkip('Three hours passed quietly.');
    // waiting for money takes long steps while the sky is calm, fine ones as soon as anything armed is about
    const calm = S.wait && IC.calmSky(S);
    const big = S.wait ? (calm ? IC.WAIT.step : IC.MAX_STEP * 2) : IC.MAX_STEP * (S.skip ? 2 : 1);
    let g = gdt, guard = 0;
    const t0 = performance.now();
    while (g > 1e-6 && guard++ < 2000) { const st = Math.min(big, g); IC.step(S, st); g -= st; if (performance.now() - t0 > (S.wait ? 30 : 40)) break; }
    // (the rate the wait really runs at, for its line in the top bar)
    if (S.wait) { const got = gdt - g; IC.ui.waitRate = (IC.ui.waitRate || got / dtR) * 0.95 + got / Math.max(1e-3, dtR) * 0.05; }
  }
  IC.autosaveTick(S);
  fx(S, dtR, gdt);
  IC.render(S, now / 1000);
  if (IC.lifeSoundEnd) IC.lifeSoundEnd();
  IC.renderMini(S, mini, mw, mh);
  uiT += dtR;
  if (uiT > 0.2) { uiT = 0; IC.ui.refresh(false); }
  IC.ui.hintFrame();
  IC.ui.pmFrame();
  goFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})(window.IC);
