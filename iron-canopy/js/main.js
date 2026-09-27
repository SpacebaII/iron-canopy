/* Iron Canopy — input, orders, time control (speed, skip ahead, auto-pause, slow motion), start screen, main loop. */
(function (IC) {
'use strict';
const U = IC.U;
const $ = id => document.getElementById(id);
const cv = $('map'), mini = $('mini'), app = $('app');
let S = null, mw = 225, mh = 169;
IC.cine = { slow: 0, barsT: 0, bars: 0, cool: 0 };

/* ---------- real-time effects ---------- */
function fx(S, dtR, gdt) {
  const F = S.fx;
  for (const p of F.parts) { p.t += dtR; const k = Math.max(0, 1 - p.drag * dtR); p.vx *= k; p.vy *= k; p.ox += p.vx * dtR; p.oy += p.vy * dtR; p.size += p.grow * dtR; }
  F.parts = F.parts.filter(p => p.t < p.life);
  for (const b of F.booms) b.t += dtR; F.booms = F.booms.filter(b => b.t < 0.8);
  for (const x of F.texts) x.t += dtR; F.texts = F.texts.filter(x => x.t < 1.8);
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

/* big moments slow the clock for a breath, if they happen on screen */
IC.cinematic = function (S2, x, y, big) {
  const c = IC.cam, C = IC.cine;
  if (!c || C.cool > 0 || !S2.cfg.slowmo) return;
  const inV = x > c.x && x < c.x + c.vw / c.z && y > c.y && y < c.y + c.vh / c.z;
  if (!inV || c.z < 0.12) return;
  C.slow = 1.6 * big + 0.4; C.cool = 25;
  if (S2.cfg.bars) C.barsT = Math.max(C.barsT, C.slow + 0.6);
};

/* ---------- picking ---------- */
function pick(p) {
  const px = 1 / IC.cam.z;
  let best = null, bd = 1e9;
  const consider = (kind, ref, x, y, r) => { const d = U.dxy(p.x, p.y, x, y); if (d < Math.max(16 * px, r || 0) && d < bd) { bd = d; best = { kind, ref }; } };
  for (const t of S.threats) if (t.det && !t.dead) consider('track', t, t.px, t.py);
  if (best) return best;
  for (const a of S.air) consider('air', a, a.x, a.y);
  if (best) return best;
  for (const u of S.units) consider('unit', u, u.x, u.y);
  if (S.layers.ground) for (const g of S.gunits) if (g.side === 'us') consider('gunit', g, g.x, g.y, 22 * px);
  if (best) return best;
  const aw = S.layers.airways || (S.mode2 && S.mode2.kind === 'airway');
  if (aw) for (const f of S.asp.fixes) consider('fix', f, f.x, f.y);
  if (IC.cam.z > 0.05) for (const f of S.asp.fields) consider('field', f, f.x, f.y);
  if (best) return best;
  if (S.layers.logistics) for (const v of S.vehicles) if (v.state !== 'idle' || IC.cam.z > 0.4) consider('veh', v, v.x, v.y);
  if (best) return best;
  if (S.layers.intel) {
    for (const g of S.gunits) if (g.side === 'them' && g.known) consider('gunit', g, g.kx, g.ky, 22 * px);
    for (const v of S.evehicles) if (v.known && !v.dead) consider('evehicle', v, v.kx, v.ky);
    for (const t of S.tels) if (t.known && !t.dead) consider('tel', t, t.kx, t.ky);
    for (const s of S.esites) if (s.pk > 0) consider('site', s, s.x, s.y, s.pk === 1 ? 180 : 0);
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
/* the airport builder (builder.js): left-click places a point, clicking the last point again builds, right-click
   takes the last point back and with none left leaves the mode */
function buildIn(m, p, btn, shift) {
  const r = IC.buildInput(S, m, p, btn, IC.cam.z, shift);
  if (r === 'exit') { IC.setMode(null); return r; }
  if (r === 'built') { IC.sfx.ui('ok'); ping(p); }
  else if (r === 'err') { IC.sfx.ui('err'); if (m.err) IC.text(S, p.x, p.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile); }
  else IC.sfx.ui('click');
  IC.ui.refresh(true);
  return r;
}
function foundIn(m, p, btn) {
  const r = IC.foundInput(S, m, p, btn);
  if (r === 'exit') { IC.setMode(null); return r; }
  if (r === 'built') { IC.setMode(null); IC.select({ kind: 'infra', ref: m.ap }); IC.flyTo(m.ap.x, m.ap.y, Math.max(IC.cam.z, 1.2)); IC.sfx.ui('ok'); return r; }
  if (r === 'err') { IC.sfx.ui('err'); IC.text(S, p.x, p.y, m.err.toUpperCase().replace(/\.$/, ''), IC.C.hostile); }
  else IC.sfx.ui('click');
  IC.ui.refresh(true);
  return r;
}
const selAp = () => S.sel ? (S.sel.kind === 'apart' ? S.sel.ap : S.sel.kind === 'infra' && S.sel.ref.parts ? S.sel.ref : null) : null;
const selUnits = () => S.group.length ? S.group.filter(x => !x.gunit) : S.sel && S.sel.kind === 'unit' ? [S.sel.ref] : [];
const selG = () => S.group.length ? S.group.filter(x => x.gunit) : S.sel && S.sel.kind === 'gunit' && S.sel.ref.side === 'us' ? [S.sel.ref] : [];
const isEnemyTarget = h => h && (h.kind === 'site' || h.kind === 'tel' || h.kind === 'evehicle' || (h.kind === 'gunit' && h.ref.side === 'them'));

function leftClick(p, shift) {
  if (!p || S.over && !IC.ui.overDismissed) return;
  const m = S.mode2;
  if (m) {
    if (m.kind === 'build') return buildIn(m, p, 0, shift);
    if (m.kind === 'bmove') {
      if (IC.bldMove(S, m.ap, m.part, p.x, p.y, m.rot)) { IC.sfx.ui('ok'); ping(p); IC.setMode(null); IC.select({ kind: 'apart', ref: m.part, ap: m.ap }); }
      else { IC.sfx.ui('err'); IC.text(S, p.x, p.y, 'DOES NOT FIT', IC.C.hostile); }
      return;
    }
    if (m.kind === 'airway') { airwayClick(m, p); IC.ui.refresh(true); return; }
    if (m.kind === 'field') {
      const why = IC.aspFieldWhy(S, p.x, p.y);
      if (why) { IC.text(S, p.x, p.y, why, IC.C.hostile); IC.sfx.ui('err'); return; }
      const f = IC.aspFoundField(S, p.x, p.y);
      IC.setMode(null); IC.select({ kind: 'field', ref: f }); ping(p); return;
    }
    if (m.kind === 'bulldoze') {
      const part = IC.partAt(m.ap, p, 6 / IC.cam.z);
      if (part) { IC.aptRemove(S, m.ap, part.id); IC.sfx.ui('ok'); ping(p); } else IC.text(S, p.x, p.y, 'NOTHING HERE', IC.C.amber);
      IC.ui.refresh(true); return;
    }
    if (m.kind === 'zone') {
      if (!m.c) { m.c = { x: p.x, y: p.y }; return; }
      const r = Math.max(60, U.dist(m.c, p));
      IC.avAddZone(S, m.c.x, m.c.y, r);
      IC.setMode(null); ping(p); return;
    }
    if (m.kind === 'found') return foundIn(m, p, 0);
    if (m.kind === 'deploy') {
      if (!IC.canPlace(S, m.type, p.x, p.y)) { IC.text(S, p.x, p.y, IC.inHome(p.x, p.y) ? (IC.enemyHeld(S, p.x, p.y) ? 'ENEMY-HELD' : 'TOO CLOSE') : 'OUTSIDE THE COUNTRY', IC.C.hostile); IC.sfx.ui('err'); return; }
      const u = IC.deploy(S, m.type, p.x, p.y);
      if (u) { IC.sfx.ui('ok'); ping(p); }
      if (!(S.reserve[m.type] > 0) || !shift) IC.setMode(null); else IC.ui.refresh(true);
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
    if (m.kind === 'hstrike') {
      if (hit && hit.kind === 'gunit' && hit.ref.side === 'them') { IC.launchAir(S, m.r, { type: 'hstrike', g: hit.ref }); IC.setMode(null); }
      else IC.text(S, p.x, p.y, 'PICK AN ENEMY BRIGADE', IC.C.amber);
      return;
    }
    if (m.kind === 'defend') {
      const town = S.world.townAt(p.x, p.y);
      if (town && town.kind === 'city') { IC.orderGround(S, m.g, 'defend', { town }); IC.setMode(null); ping(p); }
      else IC.text(S, p.x, p.y, 'PICK ONE OF OUR TOWNS', IC.C.amber);
      return;
    }
  }
  IC.select(pick(p), shift);
}

/* right-click: the obvious order for what is selected */
function rightClick(p, shift) {
  if (!p) return;
  if (S.mode2 && S.mode2.kind === 'build') return buildIn(S.mode2, p, 2, shift);
  if (S.mode2 && S.mode2.kind === 'found') return foundIn(S.mode2, p, 2);
  if (S.mode2 && S.mode2.kind === 'airway' && S.mode2.from) { S.mode2.from = null; IC.ui.refresh(true); return; }
  if (S.mode2) { IC.setMode(null); return; }
  const hit = pick(p);
  const air = S.sel && S.sel.kind === 'air' ? S.sel.ref : null;
  if (air && air.r && !air.job) {
    air.task = null; air.state = 'out'; air.tgt = null;
    if (hit && hit.kind === 'track' && air.kind === 'ftr') air.mission = { type: 'intercept', track: hit.ref };
    else if (isEnemyTarget(hit) && air.kind === 'ftr' && air.gbu > 0 && hit.kind !== 'gunit') air.mission = { type: 'strike', site: hit.ref };
    else if (hit && hit.kind === 'gunit' && hit.ref.side === 'them' && (air.kind === 'atk' || air.kind === 'ucav')) { air.mission = { type: 'hstrike', g: hit.ref }; air.runs = Math.max(air.runs, 1); }
    else air.mission = { type: air.kind === 'ftr' ? 'cap' : air.kind === 'aew' ? 'orbit' : 'isr', x: p.x, y: p.y };
    IC.log(S, 'info', 'AIR', `${air.name} retasked.`);
    ping(p); return;
  }
  const units = selUnits(), gs = selG();
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
  if (gs.length) {
    const town = S.world.townAt(p.x, p.y);
    if (town && town.kind === 'city' && town.owner === 'us' && gs.length === 1) { IC.orderGround(S, gs[0], 'defend', { town }); IC.log(S, 'info', 'ORDERS', `${gs[0].name}: defend ${town.name}.`); ping(p); return; }
    const best = IC.sectorAt(S, p.x, p.y);
    if (best && best.d < 1800) {
      for (const g of gs) IC.orderGround(S, g, LINEISH(g.order) ? g.order : 'hold', { front: best.f, sector: best.i });
      IC.log(S, 'info', 'ORDERS', `${gs.length > 1 ? gs.length + ' brigades' : gs[0].name} to sector ${best.f.sectors[best.i].name}.`);
      ping(p);
    }
  }
}
const LINEISH = o => o === 'hold' || o === 'dig' || o === 'attack' || o === 'reserve';
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
  if (kind === 'gunit') return S.gunits.find(g => g.id === id);
  if (kind === 'evehicle') return S.evehicles.find(v => v.id === id);
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
    case 'gorder': {
      const gs = selG(); if (!gs.length) return;
      if (v === 'defend') { if (gs.length === 1) IC.setMode({ kind: 'defend', g: gs[0] }); return; }
      for (const g of gs) IC.orderGround(S, g, v);
      IC.log(S, 'info', 'ORDERS', `${gs.length > 1 ? gs.length + ' brigades' : gs[0].name}: ${IC.GORDERS[v].name.toLowerCase()}.`);
      break;
    }
    case 'grelease': { const gs = selG(); const to = !gs.every(g => !g.manual) ? false : true; for (const g of gs) g.manual = to; IC.log(S, 'info', 'ORDERS', `${gs.length > 1 ? gs.length + ' brigades' : gs[0] ? gs[0].name : ''}: ${to ? 'under your orders' : 'back under the front commander'}.`); break; }
    case 'assignBest': {
      if (!sel || S.sel.kind !== 'track') return;
      const bats = S.units.filter(u => u.d.weapon === 'sam' && u.state === 'ready' && U.dist(u, sel) <= IC.maxRange(S, u) && IC.canSee(S, u, sel) && IC.chooseMun(S, u, sel, U.dist(u, sel)));
      bats.sort((a, b) => U.dist(a, sel) - U.dist(b, sel));
      if (bats[0]) { bats[0].prio = sel; IC.log(S, 'warn', 'ASSIGN', `${bats[0].name} assigned TN ${sel.tn}.`); } else IC.log(S, 'info', 'ASSIGN', `No battery can engage TN ${sel.tn} right now.`);
      break;
    }
    case 'scramble': {
      if (!sel || S.sel.kind !== 'track') return;
      const inAir = S.air.filter(x => x.kind === 'ftr' && x.state !== 'rtb' && x.aam > 0).sort((p, q) => U.dist(p, sel) - U.dist(q, sel))[0];
      const r = S.roster.filter(x => x.kind === 'ftr' && x.st === 'ready' && IC.canLaunch(S, x)).sort((p, q) => U.dist(IC.baseOf(S, p.base), sel) - U.dist(IC.baseOf(S, q.base), sel))[0];
      const ground = r && U.dist(IC.baseOf(S, r.base), sel);
      if (inAir && (!r || U.dist(inAir, sel) < ground)) { inAir.task = null; inAir.mission = { type: 'intercept', track: sel }; inAir.state = 'out'; IC.log(S, 'info', 'AIR', `${inAir.name} diverted to TN ${sel.tn}.`); }
      else if (r) IC.launchAir(S, r, { type: 'intercept', track: sel });
      break;
    }
  }
  IC.ui.refresh(true);
}
IC.command = command;

function onAct(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.tagName === 'INPUT') return;
  const a = b.dataset.act, v = b.dataset.v, id = b.dataset.id;
  IC.sfx && IC.sfx.init();
  if (!S) return;
  const sel = S.sel && S.sel.ref;
  const ui = IC.ui;
  switch (a) {
    case 'begin': IC.begin(v); return;
    case 'modeTab': { const L = $('lessons'); L.hidden = !L.hidden; ui.lessonList(); b.setAttribute('aria-pressed', String(!L.hidden)); return; }
    case 'lesson': IC.begin('academy', v); return;
    case 'nextLesson': { const i = IC.LESSONS.findIndex(l => l.id === S.camp.lesson.id); if (IC.LESSONS[i + 1]) IC.begin('academy', IC.LESSONS[i + 1].id); return; }
    case 'keepPlaying': ui.overDismissed = true; $('over').hidden = true; return;
    case 'reroll': IC.reroll(); return;
    case 'restart': IC.showStart(); return;
    case 'pause': S.paused = !S.paused; S.skip = false; break;
    case 'speed': S.speed = +v; S.paused = false; S.skip = false; break;
    case 'skip': startSkip(); break;
    case 'mute': if (!IC.sfx.on) IC.sfx.init(); else IC.sfx.toggle(); break;
    case 'roeAll': S.ad.roe = v; IC.log(S, 'info', 'WEAPONS', `National weapons status: ${v.toUpperCase()}.`); break;
    case 'doctrine': S.ad.doctrine = v; IC.emit(S, 'doctrine', v); IC.log(S, 'info', 'DOCTRINE', `Firing doctrine: ${{ sls: 'shoot-look-shoot', salvo: 'salvo', conserve: 'conserve' }[v]}.`); break;
    case 'airspace':
      if (S.airspace !== v) { S.airspace = v; IC.log(S, 'info', 'AIRSPACE', `Civil airspace ${v}.`); IC.news(S, v === 'closed' ? 'Government closes the national airspace to all civil flights.' : v === 'restricted' ? 'Airspace restricted to southern corridors.' : 'Airspace reopens to civil traffic.'); }
      break;
    case 'room': ui.openRoom(v); return;
    case 'wrclose': ui.openRoom(null); return;
    case 'toast': { const t = ui.toasts[+v]; if (t && t.at) ui.jump(t.at); break; }
    case 'alert': { const r = ui.alertRefs && ui.alertRefs[+v]; if (r) ui.jump(r, r.tn ? 'track' : r.gunit ? 'gunit' : r.d && r.type ? 'unit' : r.parts ? 'infra' : null); break; }
    case 'goal': { const g = S.story && S.story.goals[+v]; if (g && g.ref) { if (ui.room) ui.openRoom(null); ui.jump(g.ref, g.ref.parts || g.ref.kind === 'city' ? 'infra' : null); } break; }
    case 'qra': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r) { r.qra = !r.qra; IC.log(S, 'info', 'AIR', `${r.name} ${r.qra ? 'on quick-reaction alert' : 'stood down from alert'}.`); } break; }
    case 'sug': { const o = S.camp.objs[+v]; if (!o) break; if (o.kind === 'arsenal') { ui.arMin = false; break; } if (o.kind === 'tech') { ui.openRoom('research'); return; } if (o.kind === 'airspace') { S.airspace = 'restricted'; IC.log(S, 'info', 'AIRSPACE', 'Civil airspace restricted.'); break; } if (o.ref) ui.jump(o.ref, o.kind === 'point' ? null : o.kind); break; }
    case 'cnext': ui.ci++; ui.shownAt = performance.now() - 1e5; break;
    case 'cprev': ui.ci = Math.max(0, ui.ci - 1); ui.shownAt = performance.now() - 1e5; break;
    case 'zin': IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1.3); break;
    case 'zout': IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1 / 1.3); break;
    case 'zhome': { const c = IC.cap(S); IC.flyTo(c.x, c.y, Math.max(IC.cam.z, 0.3)); break; }
    case 'zfull': IC.flyTo(IC.WW / 2, IC.WH / 2, IC.minZoom()); break;
    case 'layer': S.layers[v] = !S.layers[v]; break;
    case 'cat': ui.cat = v; ui.arMin = false; break;
    case 'arMin': ui.arMin = !ui.arMin; break;
    case 'briefMin': ui.briefMin = !ui.briefMin; break;
    case 'deploy': {
      const d = IC.UNITS[v];
      if (!IC.hasTech(S, d.tech)) return;
      if (!(S.reserve[v] > 0)) { IC.toast(S, 'info', 'RESERVE', `No ${d.name} in reserve. Order one: about ${U.dur(IC.leadTime(S, v))}.`); break; }
      IC.setMode(S.mode2 && S.mode2.kind === 'deploy' && S.mode2.type === v ? null : { kind: 'deploy', type: v }); return;
    }
    case 'order': e.stopPropagation(); IC.order(S, v); break;
    case 'cancelOrder': IC.cancelOrder(S, id); break;
    case 'research': IC.startResearch(S, v); break;
    case 'mobil': IC.setMobil(S, +v); break;
    case 'bonds': IC.warBonds(S); break;
    case 'desel': S.sel = null; S.group = []; break;
    case 'emcon': case 'uroe': case 'udoc': case 'move': case 'heli': case 'pri': case 'repair': case 'clearPrio': case 'reserve': case 'fireMode': case 'gorder': case 'grelease': case 'assignBest': case 'scramble': command(a, v); return;
    case 'emconAll': command('emcon', v); return;
    case 'profile': if (sel) { sel.profile = v; IC.log(S, 'info', 'LOGI', `${sel.name}: ${IC.PROFILES[v].name.toLowerCase()}.`); } break;
    case 'profileD': { const d = S.units.find(u => u.id === id); if (d) d.profile = v; break; }
    case 'buyTruck': if (sel) IC.buyCompany(S, sel); break;
    case 'buyTruckAt': { const d = S.units.find(u => u.id === id); if (d) IC.buyCompany(S, d); break; }
    case 'moveTruck': { const others = IC.depots(S).filter(d => d !== sel).sort((p, q) => U.dist(p, sel) - U.dist(q, sel)); if (others[0]) IC.moveCompany(S, sel, others[0]); break; }
    case 'assign': { const u = S.units.find(x => x.id === b.dataset.uid); if (u && sel) { u.prio = sel; IC.log(S, 'warn', 'ASSIGN', `${u.name} assigned TN ${sel.tn}.`); } break; }
    case 'fireFrom': { const u = S.units.find(x => x.id === b.dataset.uid); if (u) IC.fireMission(S, u, findRef(b.dataset.k, id), +v); break; }
    case 'airStrike': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r) IC.launchAir(S, r, { type: 'strike', site: findRef(b.dataset.k, id) }); break; }
    case 'hstrike': { const r = S.roster.find(x => x.id === b.dataset.rid), g = findRef('gunit', id); if (r && g) IC.launchAir(S, r, { type: 'hstrike', g }); break; }
    case 'isrOn': { const r = S.roster.find(x => x.id === b.dataset.rid), tg = findRef(b.dataset.k, id); if (r && tg) { const p = IC.aimOf(tg); IC.launchAir(S, r, { type: 'isr', x: p.x, y: p.y }); } break; }
    case 'lift': if (sel && sel.gunit) IC.heliLift(S, sel, v); break;
    case 'loadout': { const r = S.roster.find(x => x.id === (b.dataset.rid || id)); if (r) IC.setLoadout(S, r, v); break; }
    case 'recall': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent) IC.recallAir(S, r.ent); break; }
    case 'recallSel': if (sel) IC.recallAir(S, sel); break;
    case 'selAir': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent) { ui.openRoom(null); ui.jump(r.ent, 'air'); } return; }
    case 'selAirE': { const a2 = S.air.find(x => x.id === id); if (a2) { ui.openRoom(null); ui.jump(a2, 'air'); } return; }
    case 'selFlight': { const r = S.roster.find(x => x.id === b.dataset.rid); if (r && r.ent) ui.jump(r.ent, 'air'); else ui.openRoom('air'); return; }
    case 'froe': if (sel && sel.r) { sel.r.roe = v; sel.roe = v; } break;
    case 'airMode': {
      const r = S.roster.find(x => x.id === b.dataset.rid); if (!r) break;
      ui.openRoom(null);
      if (v === 'strike') IC.setMode({ kind: 'airSite', r }); else if (v === 'hstrike') IC.setMode({ kind: 'hstrike', r }); else IC.setMode({ kind: 'airPoint', r, mission: v });
      return;
    }
    case 'buyAir': IC.buyAircraft(S, v, id); break;
    case 'taskPoint': ui.openRoom(null); IC.setMode({ kind: 'airPoint', task: v, mission: v }); return;
    case 'taskFront': { const f = S.fronts.find(x => x.key === id); if (f) IC.addTask(S, v, { front: f }); break; }
    case 'twant': { const t = S.ato.find(x => x.id === id); if (t) t.want = U.clamp(t.want + +v, 1, 4); break; }
    case 'tdel': { const t = S.ato.find(x => x.id === id); if (t) IC.removeTask(S, t); break; }
    case 'stance': { const f = S.fronts.find(x => x.key === id); if (f) { f.stance = v; f.cmdT = 0; IC.log(S, 'info', 'ORDERS', `${f.name}: ${{ defend: 'hold the line', active: 'active defense', offensive: 'go on the offensive' }[v]}.`); } break; }
    case 'spri': { const f = S.fronts.find(x => x.key === id); if (f) f.supplyPri = +v; break; }
    case 'raise': { const f = S.fronts.find(x => x.key === id); if (f) IC.raiseBrigade(S, f, v); break; }
    case 'prod': { const [m, q] = v.split(':'); IC.orderProduction(S, S.byId[id], m, +q); break; }
    case 'import': { const [m, q] = v.split(':'); IC.orderImport(S, m, +q); break; }
    case 'bwork': { const ap = selAp(); if (ap) IC.baseWork(S, ap, v, id); break; }
    case 'bcancel': { const ap = selAp(); if (ap) IC.cancelWork(S, ap, id); break; }
    case 'bauto': { const ap = selAp(); if (ap) ap.autoRepair = !ap.autoRepair; break; }
    case 'build': { const ap = selAp(); if (!ap || ap.locked) break; const cur = S.mode2; IC.setMode(cur && cur.kind === 'build' && cur.part === v && cur.ap === ap ? null : IC.bldMode(S, ap, v)); if (S.mode2 && IC.cam.z < 1.5) IC.flyTo(ap.x, ap.y, 2.2); return; }
    case 'bpref': { const [k, x] = v.split(':'); const P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true }; const val = k === 'fillet' ? !P.fillet : x === 'auto' ? null : x; P[k] = val; if (S.mode2 && S.mode2.kind === 'build') { S.mode2[k] = val; S.mode2.exitKey = null; } break; }
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
    case 'aptRwMode': { const ap = selAp(); if (ap) { ap.rwMode = ap.rwMode === 'mixed' ? 'auto' : 'mixed'; ap.cfg = null; IC.aptStats(S, ap); } break; }
    case 'aptCurfew': { const ap = selAp(); if (ap) { ap.curfew = !ap.curfew; if (!ap.curfew) { S.support = Math.max(0, S.support - 2); IC.log(S, 'warn', 'AVIATION', `${ap.name}: night flights allowed. Residents near the airport are not pleased.`, ap); } } break; }
    case 'aptRemove': if (S.sel && S.sel.kind === 'apart') { IC.aptRemove(S, S.sel.ap, S.sel.ref.id); S.sel = { kind: 'infra', ref: S.sel.ap }; } break;
    case 'aptBack': if (S.sel && S.sel.kind === 'apart') S.sel = { kind: 'infra', ref: S.sel.ap }; break;
    case 'incGo': { const it = ui.incRefs && ui.incRefs[+v]; if (it) { const r = it.ref; ui.jump(r && r.tn ? r : { x: it.x, y: it.y }, r && r.tn ? 'track' : r && r.parts ? 'infra' : null); } break; }
    case 'incX': IC.incidentDismiss(S, v); break;
    case 'evChoose': IC.storyChoose(S, id, +v); IC.sfx.ui('ok'); ui.cache.evcard = null; if (S.paused && !S.story.events.length) S.paused = false; break;
    case 'radio': if (sel && S.sel.kind === 'track') IC.callAircraft(S, sel); break;
    case 'escortFire': { const a2 = S.air.find(x => x.id === id); if (a2 && sel) { a2.roe = 'free'; if (a2.r) a2.r.roe = 'free'; a2.tgt = sel; IC.log(S, 'warn', 'ORDERS', `${a2.name}: cleared to fire on TN ${sel.tn}.`, sel); IC.emit(S, 'fireOrder', { a: a2, t: sel }); } break; }
    case 'avYes': IC.avDecide(S, id, true); break;
    case 'avNo': IC.avDecide(S, id, false); break;
    case 'zoneMode': ui.openRoom(null); IC.setMode({ kind: 'zone' }); return;
    case 'aspDraw': ui.openRoom(null); S.layers.airways = true; IC.setMode(S.mode2 && S.mode2.kind === 'airway' && !id ? null : { kind: 'airway', from: id || null }); if (IC.cam.z < 0.12) { const c = IC.cap(S); IC.flyTo(c.x, c.y, 0.14); } return;
    case 'fixDel': IC.aspDelFix(S, id); S.sel = null; if (S.mode2 && S.mode2.from === id) S.mode2.from = null; break;
    case 'wayDel': IC.aspDelWay(S, id); S.sel = null; break;
    case 'fieldMode': ui.openRoom(null); IC.setMode({ kind: 'field' }); return;
    case 'selFix': { const f = IC.aspFix(S, id); if (f) { S.layers.airways = true; ui.openRoom(null); ui.jump(f, 'fix'); } return; }
    case 'selField': { const f = S.asp.fields.find(x => x.id === id); if (f) { ui.openRoom(null); ui.jump(f, 'field'); } return; }
    case 'zoneDel': IC.avRemoveZone(S, id); break;
    case 'foundMode': ui.openRoom(null); IC.setMode({ kind: 'found' }); return;
    case 'delegate': IC.storyDelegate(S, v, !S.story.del[v]); break;
    case 'cpReq': IC.storyRequest(S, v); break;
    case 'routeFly': { const r = S.av.routes.find(x => x.id === id); if (r) { ui.openRoom(null); ui.jump(S.byId[r.a], 'infra'); } return; }
    case 'flySec': { const f = S.fronts.find(x => x.key === id); if (f) { ui.openRoom(null); const G = IC.secGeom(f, +v); IC.flyTo(G.x, G.y, 0.2); } return; }
    case 'selInfra': { const r = S.byId[id]; if (r) { ui.openRoom(null); ui.jump(r, 'infra'); } return; }
    case 'logjump': ui.openRoom(null); ui.jump({ x: +b.dataset.x, y: +b.dataset.y }); return;
    case 'logf': ui.logFilter = v; break;
    case 'refcat': ui.refCat = v; break;
    case 'uiscale': ui.applyScale(+v); ui.saveCfg(); setTimeout(resize, 50); break;
    case 'cfg': S.cfg[v] = !S.cfg[v]; ui.saveCfg(); break;
    case 'radarFx': S.cfg.radarFx = v; ui.saveCfg(); break;
    case 'pauseRoom': ui.pauseRoom = !ui.pauseRoom; ui.saveCfg(); break;
    case 'pauseOn': S.cfg.pauseOn[v] = !S.cfg.pauseOn[v]; ui.saveCfg(); break;
    case 'selg': case 'selu': case 'sels': case 'selt': case 'selv': {
      const kind = { selg: 'gunit', selu: 'unit', sels: 'site', selt: 'tel', selv: 'veh' }[a];
      const ref = kind === 'veh' ? S.vehicles.find(x => x.id === id) : findRef(kind, id);
      if (ref) { ui.openRoom(null); ui.jump(ref, kind); }
      return;
    }
  }
  IC.sfx && IC.sfx.ui('click');
  ui.refresh(true);
}
function onInput(e) {
  const el = e.target;
  if (el.dataset.act === 'ashare') {
    const f = S.fronts.find(x => x.key === el.dataset.id);
    if (f) { f.airShare = +el.value / 100; IC.ui.busyUntil = performance.now() + 600; }
  } else if (el.dataset.act === 'vol') { IC.sfx.setVol(+el.value / 100); IC.ui.saveCfg(); IC.ui.busyUntil = performance.now() + 600; }
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
function startSkip() { S.skip = true; S.paused = false; S.skipT = S.time; }
function stopSkip(why) { if (!S.skip) return; S.skip = false; if (why) IC.toast(S, 'info', 'SKIP', why); }
IC.on((S2, type, d) => {
  if (S2 !== S) return;
  const P = S.cfg.pauseOn;
  const pause = why => { if (!S.paused) { S.paused = true; S.skip = false; IC.toast(S, 'warn', 'PAUSED', why); } };
  if (type === 'ballistic') { if (P.ballistic) pause('Ballistic launch detected.'); else stopSkip('Ballistic launch.'); }
  else if (type === 'unitLost' || type === 'acLost' || type === 'brigadeLost') { if (P.lost) pause(`${d.name} lost.`); else stopSkip(`${d.name} lost.`); }
  else if (type === 'baseHit') { if (P.base) pause(`${d.base.name} hit.`); else stopSkip(`${d.base.name} hit.`); }
  else if (type === 'capture') { if (P.capture) pause(`${d.name} captured.`); else stopSkip(); }
  else if (type === 'enemyStrike') { if (P.raid) pause('Major enemy strike forming.'); }
  else if (type === 'cityHit') { if (P.city) pause(`${d.city.name} hit.`); else stopSkip(); }
  else if (type === 'aff' && (d.aff === 'H' || d.aff === 'S') && IC.inHome(d.x, d.y)) stopSkip(`TN ${d.tn}: ${IC.AFF[d.aff].name.toLowerCase()} track.`);
  else if (type === 'track' && (d.d.cls === 'air' || d.d.cls === 'cm') && !d.border) stopSkip(`New track TN ${d.tn}.`);
  else if (type === 'weaponRelease') { if (P.launch !== false && S.mode !== 'academy' && !S.enemy.war) pause('Weapons released.'); else stopSkip('Weapons released.'); }
  else if (type === 'event') { if (P.event !== false) pause(d.title); else stopSkip(d.title); }
  else if (type === 'incidentAdded' || type === 'act' || type === 'goal') stopSkip();
  else if (type === 'assault' || type === 'chapter' || type === 'war' || type === 'frontActive' || type === 'delivered' || type === 'lessonDone') stopSkip();
});

/* ---------- pointer and keyboard ---------- */
const ptrs = new Map();
let drag = null, pinch = null, lastClick = { t: 0, x: 0, y: 0 };
const local = (e, el) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const l = local(e, cv);
  ptrs.set(e.pointerId, l);
  S.hover = IC.toWorld(l.x, l.y);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; S.box = null; }
  else if (ptrs.size === 1) {
    drag = { sx: l.x, sy: l.y, cx: IC.cam.x, cy: IC.cam.y, moved: false, btn: e.button, box: e.shiftKey && e.button === 0 };
    // in the airway editor, fixes can be dragged
    if (e.button === 0 && S.mode2 && S.mode2.kind === 'airway') drag.fix = IC.aspFixAt(S, S.hover, 12 / IC.cam.z);
  }
  IC.cam.fly = null;
});
cv.addEventListener('pointermove', e => {
  const l = local(e, cv);
  S.hover = IC.toWorld(l.x, l.y);
  if (!ptrs.size) { const ent = pick(S.hover); IC.ui.tip(ent, l.x, l.y); cv.style.cursor = S.mode2 ? 'crosshair' : ent ? 'pointer' : 'default'; return; }
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
      else if (drag.box) S.box = { x0: drag.sx, y0: drag.sy, x1: l.x, y1: l.y };
      else { IC.cam.x = drag.cx - dx / IC.cam.z; IC.cam.y = drag.cy - dy / IC.cam.z; IC.clampCam(); }
    }
  }
});
function up(e) {
  const had = ptrs.has(e.pointerId);
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (had && drag && e.type === 'pointerup') {
    if (drag.fix && drag.moved) IC.ui.refresh(true);
    else if (drag.box && S.box) {
      const b = S.box, a = IC.toWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), c = IC.toWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      const inB = o => o.x >= a.x && o.x <= c.x && o.y >= a.y && o.y <= c.y;
      S.group = S.units.filter(inB).concat(S.gunits.filter(g => g.side === 'us' && inB(g)));
      S.sel = S.group.length ? { kind: S.group[0].gunit ? 'gunit' : 'unit', ref: S.group[0] } : null;
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
cv.addEventListener('wheel', e => { e.preventDefault(); const l = local(e, cv); IC.zoomAt(l.x, l.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function miniMove(e) { const l = local(e, mini); IC.cam.fly = null; IC.centerOn(l.x / mw * IC.WW, l.y / mh * IC.WH); }
mini.addEventListener('pointerdown', e => { mini.setPointerCapture(e.pointerId); miniMove(e); });
mini.addEventListener('pointermove', e => { if (e.buttons) miniMove(e); });

const keys = new Set();
window.addEventListener('keydown', e => {
  if (!S || !$('start').hidden) return;
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { const ap = (S.mode2 && S.mode2.ap) || selAp(); if (ap) { e.preventDefault(); IC.sfx.ui(IC.bldUndo(S, ap) ? 'ok' : 'err'); IC.ui.refresh(true); return; } }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, lk = k.toLowerCase();
  const ui = IC.ui;
  const rooms = { a: 'air', g: 'army', l: 'logi', i: 'industry', n: 'intel', k: 'research', j: 'journal', v: 'aviation', t: 'staff' };
  const bm = S.mode2 && S.mode2.kind === 'build' ? S.mode2 : null;
  if (bm && lk === 'r') { bm.rot = (bm.rot || 0) + (e.shiftKey ? Math.PI / 2 : Math.PI / 12); IC.ui.refresh(true); return; }
  if (bm && lk === 'f') { bm.fillet = !bm.fillet; S.bldPref.fillet = bm.fillet; IC.ui.refresh(true); return; }
  if (bm && k === 'Enter') { const r = IC.buildFinish(S, bm, IC.cam.z); IC.sfx.ui(r === 'built' ? 'ok' : 'err'); if (r === 'err' && bm.err && S.hover) IC.text(S, S.hover.x, S.hover.y, bm.err.toUpperCase(), IC.C.hostile); IC.ui.refresh(true); return; }
  if (bm && k === 'Backspace' && bm.pts && bm.pts.length) { bm.pts.pop(); IC.ui.refresh(true); return; }
  if (S.mode2 && S.mode2.kind === 'bmove' && lk === 'r') { S.mode2.rot += e.shiftKey ? Math.PI / 2 : Math.PI / 12; return; }
  if ((k === 'Delete' || k === 'Backspace') && S.sel && (S.sel.kind === 'fix' || S.sel.kind === 'airway')) {
    if (S.sel.kind === 'fix') { IC.aspDelFix(S, S.sel.ref.id); if (S.mode2 && S.mode2.from === S.sel.ref.id) S.mode2.from = null; } else IC.aspDelWay(S, S.sel.ref.id);
    S.sel = null; IC.ui.refresh(true); return;
  }
  const selKind = S.sel && S.sel.kind;
  const brig = selG().length > 0, unitSel = selUnits().length > 0, trackSel = selKind === 'track';
  const gkeys = { y: 'hold', d: 'dig', r: 'attack', t: 'defend', u: 'reserve', o: 'refit' };
  const ukeys = { e: 'emcon', w: 'uroe', q: 'udoc', m: 'move', h: 'heli', p: 'repair', x: 'reserve', f: 'fireMode' };
  if (k === ' ') { e.preventDefault(); S.paused = !S.paused; S.skip = false; }
  else if (k >= '1' && k <= '6') { S.speed = IC.SPEEDS[+k - 1]; S.paused = false; S.skip = false; }
  else if (lk === 's') startSkip();
  else if (k === 'Escape') { if (!$('cine').hidden) ui.closeCine(); else if (S.mode2) IC.setMode(null); else if (ui.room) ui.openRoom(null); else { S.sel = null; S.group = []; } }
  else if (brig && gkeys[lk]) command('gorder', gkeys[lk]);
  else if (brig && lk === 'c') command('grelease');
  else if (unitSel && ukeys[lk]) command(ukeys[lk]);
  else if (trackSel && lk === 'v') command('scramble');
  else if (trackSel && lk === 'b') command('assignBest');
  else if (rooms[lk]) { if (ui.roomOk(rooms[lk])) ui.openRoom(rooms[lk]); return; }
  else if (k === '+' || k === '=') IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 1.25);
  else if (k === '-' || k === '_') IC.zoomAt(IC.cam.vw / 2, IC.cam.vh / 2, 0.8);
  else if (k === 'Home') { const c = IC.cap(S); IC.flyTo(c.x, c.y, Math.max(IC.cam.z, 0.3)); }
  else if (k.startsWith('Arrow')) { keys.add(lk); e.preventDefault(); IC.cam.fly = null; }
  else return;
  IC.ui.refresh(true);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
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
function generate(seed, mode, lesson) {
  S = IC.S = IC.newGame({ seed, mode, lesson, hour: mode === 'academy' ? 10 : mode === 'story' ? 7 : 6 });
  IC.resetMini();
  IC.ui.bind(S);
  resize();
  IC.cam.z = Math.min(IC.cam.vw / 7800, IC.cam.vh / 5900);
  IC.centerOn(S.world.cx, S.world.cy);
  $('seed').textContent = String(seed);
  $('startLead').textContent = describe(S.world);
}
IC.reroll = function () {
  $('startLead').textContent = 'Generating a new region…';
  setTimeout(() => generate((Math.random() * 1e9) >>> 0, 'campaign'), 30);
};
IC.showStart = function () { $('over').hidden = true; $('start').hidden = false; IC.ui.openRoom && IC.ui.room && IC.ui.openRoom(null); IC.reroll(); };
IC.begin = function (mode, lesson) {
  IC.sfx.init();
  const go = () => {
    $('start').hidden = true; $('over').hidden = true;
    S.paused = false;
    const f = S.camp && S.camp.focus;
    if (mode === 'story') { const ap = S.byId[S.story.cap]; IC.cam.z = 0.9; IC.centerOn(ap.x, ap.y); IC.flyTo(ap.x, ap.y, 2.4); }
    else if (f) { IC.cam.z = f.z; IC.centerOn(f.x, f.y); }
    else { IC.cam.z = Math.max(IC.cam.z, 0.14); const c = IC.cap(S); IC.centerOn(c.x, c.y - 400); }
    IC.ui.refresh(true);
  };
  $('startLead').textContent = 'Preparing…';
  setTimeout(() => { generate(mode === 'academy' ? 20260926 : S.seed, mode, lesson); go(); }, 30);
};

IC.initRender(cv);
new ResizeObserver(resize).observe(app);
generate((Math.random() * 1e9) >>> 0, 'campaign');

let last = performance.now(), uiT = 0;
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  if (keys.size) {
    const v = 700 / IC.cam.z * dtR;
    if (keys.has('arrowup')) IC.cam.y -= v;
    if (keys.has('arrowdown')) IC.cam.y += v;
    if (keys.has('arrowleft')) IC.cam.x -= v;
    if (keys.has('arrowright')) IC.cam.x += v;
    IC.clampCam();
  }
  IC.camStep(dtR);
  const C = IC.cine;
  C.cool = Math.max(0, C.cool - dtR);
  if (C.slow > 0) C.slow -= dtR;
  if (C.barsT > 0) C.barsT -= dtR;
  C.bars = U.clamp(C.bars + (C.barsT > 0 ? 1 : -1) * dtR * 2.5, 0, 1);
  let gdt = 0;
  const running = !S.paused && (!S.over || IC.ui.overDismissed) && $('start').hidden;
  if (running) {
    let speed = S.skip ? 64 : S.speed;
    if (C.slow > 0) speed = Math.min(speed, 0.3);
    gdt = dtR * IC.GS * speed;
    if (S.skip && S.time - (S.skipT || S.time) > 3 * 3600) stopSkip('Three hours passed quietly.');
    let g = gdt, guard = 0;
    const t0 = performance.now();
    while (g > 1e-6 && guard++ < 2000) { const st = Math.min(IC.MAX_STEP * (S.skip ? 2 : 1), g); IC.step(S, st); g -= st; if (performance.now() - t0 > 40) break; }
  }
  fx(S, dtR, gdt);
  IC.render(S, now / 1000);
  IC.renderMini(S, mini, mw, mh);
  uiT += dtR;
  if (uiT > 0.2) { uiT = 0; IC.ui.refresh(false); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})(window.IC);
