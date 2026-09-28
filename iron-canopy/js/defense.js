/* Iron Canopy — air defense engagements and our own strike weapons.
   Missiles have a real envelope: reach shrinks against crossing and receding targets and down low.
   Seekers matter: semi-active and command-guided missiles need the battery radar until impact, heat-seekers
   fall for flares, radar seekers for chaff and notching. Every battery keeps a plain-language reason for what
   it is (or is not) doing. */
(function (IC) {
'use strict';
const U = IC.U;
const HIT = { INT: 1, IR: 1.2, IR2: 1.3, SR: 1.6, MR: 2, LR: 2.5, AAM: 1.8, TBD: 3, HAT: 3, EXO: 3 };

IC.maxRange = function (S, u) {
  const d = u.d;
  if (d.weapon === 'sam' || d.weapon === 'strike') { let r = 0; for (const m of IC.activeMags(S, u)) r = Math.max(r, IC.MUN[m.mun].range); return r; }
  if (d.gun) return d.gun.range;
  if (d.laser) return d.laser.range;
  if (d.hpm) return d.hpm.range;
  if (d.ecm) return d.ecm.range;
  return 0;
};
/* ---------- launchers ----------
   A battery's rounds sit on its launchers (m.l: rounds on each; m.mag is their sum). It fires from the emptiest
   launcher that still has rounds, so one launcher runs dry while the others stay full, and the crew reloads one
   launcher at a time from the stock on site: an empty one at once, a part-empty one when the battery is quiet. */
IC.magSync = function (u, m) {
  if (!m.l) {
    const D = u.d.mags && u.d.mags.find(x => x.mun === m.mun);
    m.ln = (D && D.ln) || 1; m.per = Math.max(1, Math.ceil(m.max / m.ln)); m.l = []; m.li = -1;
  }
  let n = 0; for (const k of m.l) n += k;
  if (n !== m.mag || m.l.length !== m.ln) {
    // the magazine was set from outside (a lesson, the test range): spread it over the launchers
    let left = Math.max(0, m.mag); m.l = [];
    for (let i = 0; i < m.ln; i++) { const k = Math.min(m.per, left); m.l.push(k); left -= k; }
    m.li = -1; m.rl = 0;
  }
  return m;
};
IC.takeRound = function (u, m) {
  IC.magSync(u, m);
  let i = -1;
  for (let k = 0; k < m.ln; k++) if (k !== m.li && m.l[k] > 0 && (i < 0 || m.l[k] < m.l[i])) i = k;
  if (i < 0 && m.li >= 0 && m.l[m.li] > 0) i = m.li;   // only the launcher being reloaded has rounds left
  if (i < 0) return false;
  m.l[i]--; m.mag--;
  return true;
};
function reloadStep(S, u, m, dt) {
  IC.magSync(u, m);
  if (m.li < 0) {
    if (m.store <= 0) return;
    let i = -1;
    for (let k = 0; k < m.ln; k++) if (m.l[k] < m.per && (i < 0 || m.l[k] < m.l[i])) i = k;
    if (i < 0 || (m.l[i] > 0 && S.time - u.lastFired < 60)) return;
    m.li = i; m.rl = 0; m.rlT = m.reload * (0.4 + 0.6 * (m.per - m.l[i]) / m.per);
  }
  m.rl += dt * IC.fatigueFactor(u) * (0.4 + 0.6 * IC.ok(u, 'crew'));
  if (m.rl < (m.rlT || m.reload)) return;
  const q = Math.min(m.per - m.l[m.li], m.store);
  m.l[m.li] += q; m.mag += q; m.store -= q; m.li = -1; m.rl = 0;
}
/* seconds until the launcher being reloaded is ready, or null */
IC.reloadLeft = (S, u, m) => { IC.magSync(u, m); return m.li < 0 ? null : Math.max(0, ((m.rlT || m.reload) - m.rl) / (IC.fatigueFactor(u) * (0.4 + 0.6 * IC.ok(u, 'crew')))); };

IC.typeRange = function (type) {
  const d = IC.UNITS[type];
  if (d.mags) return Math.max(...d.mags.map(m => IC.MUN[m.mun].range));
  return d.gun ? d.gun.range : d.laser ? d.laser.range : d.hpm ? d.hpm.range : d.ecm ? d.ecm.range : d.sensor ? d.sensor.R : 0;
};

/* effective reach against this target: head-on shots reach furthest */
function effRange(M, u, t) {
  let f = 1;
  const sp = Math.hypot(t.vx, t.vy);
  if (sp > 0.3 && t.d.move !== 'bal') {
    const c = -((t.vx * (u.x - t.x) + t.vy * (u.y - t.y)) / (sp * (U.dist(u, t) || 1)));
    const a = c <= 0 ? 0.55 + 0.45 * -c : 0.55 - 0.2 * c;   // c<0 closing
    f = 1 - (1 - a) * Math.min(1, sp / 2);
  }
  if (M.range > 300 && t.alt < 1) f *= 0.72;
  return M.range * f;
}
IC.effRange = effRange;

function need(S, u, t) {
  const c = IC.classOf(t), bal = c === 'bal' || c === 'mid' || c === 'hgv';
  const doc = IC.effDoctrine(S, u);
  return bal ? 2 : doc === 'salvo' ? 2 : 1;
}

/* ---------- ballistic intercepts ----------
   A warehead is not chased: the battery works out where it will be (the predicted intercept point) at a height
   its interceptor can reach, and launches so that both arrive there together. Upper-tier rounds meet it high,
   terminal rounds low; whatever the upper tier misses is still there for the lower one. */
IC.predictable = t => t.d.move === 'bal' || t.d.move === 'hgv';
IC.futurePos = function (t, tau) {
  if (t.d.move === 'bal' || (t.d.move === 'hgv' && !t.glide && (t.age + tau) / t.T < 0.5)) { const p = IC.balPos(t, t.age + tau); return { x: p.x, y: p.y, alt: t.d.move === 'hgv' ? Math.max(40, p.alt) : p.alt }; }
  return { x: t.x + t.vx * tau, y: t.y + t.vy * tau, alt: IC.altAt(t, tau) };
};
const km = v => Math.round(v);
/* the earliest point on the target's path this missile can meet; with the reason when there is none */
function planIntercept(u, t, M) {
  const tti = IC.timeToImpact(t);
  let altOk = false, inReach = false, hiAlt = 0;
  for (let tau = 2; tau < Math.min(tti - 1, 900); tau += tau < 60 ? 1 : 3) {
    const p = IC.futurePos(t, tau);
    const vs = M.vs[p.alt >= 90 ? 'mid' : IC.classOf(t) === 'mid' ? 'bal' : IC.classOf(t)];
    if (!vs || p.alt < M.alt[0] || p.alt > M.alt[1]) { hiAlt = Math.max(hiAlt, p.alt); continue; }
    altOk = true;
    const sl = Math.hypot(U.dxy(u.x, u.y, p.x, p.y), p.alt * 10);
    if (sl > M.range) continue;
    inReach = true;
    const fly = sl / M.spd * 1.1 + 2;
    if (fly > tau) continue;
    return { tau, x: p.x, y: p.y, alt: p.alt, sl, fly, wait: tau - fly, vs };
  }
  const why = !altOk ? (M.alt[0] > 1 && hiAlt < M.alt[0] ? `it flies too low for ${M.short} rounds (they work above ${M.alt[0]} km)` : `it stays outside the ${M.alt[0]}–${M.alt[1]} km band ${M.short} rounds reach`)
    : !inReach ? `it never comes within ${km(M.range / 10)} km of this battery at a height ${M.short} rounds reach` : 'too late: an interceptor cannot get there before impact';
  return { none: true, why };
}
IC.planIntercept = planIntercept;

function chooseMun(S, u, t, r, why) {
  const cls = IC.classOf(t);
  let best = null, bs = 1e9, reason = '';
  if (why) why.pip = null;
  if (IC.predictable(t)) {
    // ballistic: the best round that can meet it; wait for it rather than waste a weaker one early
    let bp = null;
    for (const m of u.mags) {
      if (!IC.hasTech(S, m.tech)) continue;
      const M = IC.MUN[m.mun];
      if (m.mag <= 0) { reason = reason || 'magazine empty'; continue; }
      if (!M.vs.bal && !M.vs.mid && !M.vs.hgv) { reason = reason || `${M.short} missiles cannot hit a ballistic warhead`; continue; }
      const P = planIntercept(u, t, M);
      if (P.none) { reason = reason || P.why; continue; }
      const sc = -M.pk * P.vs;
      if (sc < bs) { bs = sc; best = m; bp = P; }
    }
    if (best && bp.wait > 3) { reason = `waiting: TN ${t.tn} comes into ${IC.MUN[best.mun].short} reach in ${U.dur(bp.wait)}`; best = null; }
    if (why) { why.r = reason; why.pip = best ? bp : null; why.wait = !best && bp ? bp.wait : 0; }
    return best;
  }
  for (const m of u.mags) {
    if (!IC.hasTech(S, m.tech)) continue;
    const M = IC.MUN[m.mun];
    if (m.mag <= 0) { reason = reason || 'magazine empty'; continue; }
    const R = effRange(M, u, t);
    if (r > R) { reason = reason || (r <= M.range ? 'target crossing or receding: out of reach' : 'out of range'); continue; }
    const tof = r / M.spd * 1.15;
    const alt = IC.altAt(t, tof);
    const c2 = t.d.move === 'bal' ? (alt >= 90 ? 'mid' : 'bal') : cls;
    const vs = M.vs[c2]; if (!vs) { reason = reason || `${M.short} cannot engage ${IC.KLASS[t.klass] || 'this target'}`; continue; }
    if (alt < M.alt[0] || alt > M.alt[1]) { reason = reason || 'target outside the altitude envelope'; continue; }
    if (tof > IC.timeToImpact(t) - 1) { reason = reason || 'too late to intercept'; continue; }
    if (IC.effDoctrine(S, u) === 'conserve' && r > R * 0.7 && c2 !== 'bal' && c2 !== 'hgv') { reason = reason || 'holding for a high-probability shot'; continue; }
    const bal = c2 === 'bal' || c2 === 'mid' || c2 === 'hgv';
    const sc = bal ? -M.pk * vs : M.cost / vs;
    if (sc < bs) { bs = sc; best = m; }
  }
  if (why) why.r = reason;
  return best;
}
IC.chooseMun = chooseMun;

function canSee(S, u, t) {
  if (t.fcBy.includes(u.id)) return true;
  const f = u.d.fc;
  if (f && f.bmdOnly) return t.disc;
  return (u.d.remote || IC.hasTech(S, 'a_remote') || !!IC.linkedBy(S, u)) && t.fc;
}
IC.canSee = canSee;

/* rules of engagement against what we know about the track */
function eligible(S, u, t, manual) {
  if (t.dead || !t.det || t.spoofed || t.decoyKnown) return false;
  if (t.home && t.border && IC.inHostile(t.x, t.y)) return false;
  if (manual) return true;
  if (t.aff === 'N' || t.aff === 'A') return false;
  const roe = IC.effRoe(S, u);
  if (roe === 'hold') return false;
  if (t.aff === 'H') return true;
  if (roe === 'free' && t.aff === 'S') return S.time - (t.affT || t.firstDet || S.time) > 8;
  return false;
}
IC.eligible = eligible;

function priority(u, t, r) {
  let s = Math.min(IC.timeToImpact(t), 3000);
  const c = IC.classOf(t);
  if (c === 'bal' || c === 'mid' || c === 'hgv') s -= 2000;
  if (c === 'arm' && t.target === u) s -= 1500;
  if (t.d.jam) s -= 600;
  if (t.aff !== 'H') s += 400;
  return s + r * 0.2;
}

function fire(S, u, t, m, r, P, hoj) {
  const M = IC.MUN[m.mun];
  IC.takeRound(u, m); t.inbound++; t.shots = (t.shots || 0) + 1; S.stats.fired++;
  u.lastFired = S.time; u.fat = Math.min(100, u.fat + 1.5);
  const a = Math.atan2((P ? P.y : t.y) - u.y, (P ? P.x : t.x) - u.x);
  const R = effRange(M, u, t), cls = IC.classOf(t);
  const wx = IC.wx(S);
  const reach = P ? 1 - 0.25 * Math.pow(P.sl / M.range, 2) : 1 - 0.45 * Math.pow(r / Math.max(1, R), 2);
  let pk = M.pk * (P ? P.vs : M.vs[cls] || 0) * reach * IC.fatigueFactor(u) * (0.6 + 0.4 * IC.ok(u, 'launch'));
  if (M.seeker === 'IR') pk *= wx.ir;
  if (t.d.evasive) pk *= t.d.evasive;
  const tr = IC.newTrail(S, M.range > 1500 ? 'big' : 'sam');
  const pip = P ? { x: P.x, y: P.y, alt: P.alt, T: S.time + P.tau, tof: P.tau } : null;
  S.missiles.push({ id: IC.nid('m'), mun: m.mun, M, x: u.x, y: u.y, a, spd: M.spd, target: t, life: P ? P.tau + 5 : M.range / M.spd * 1.6 + 5, src: u.name, unit: u, pk, trailT: 0, side: 'us', tr, pip, alt: 0, hoj: !!hoj });
  for (let i = 0; i < 6; i++) IC.part(S, { x: u.x, y: u.y, ox: U.rand(-3, 3), oy: U.rand(-3, 3), vx: U.rand(-14, 14), vy: U.rand(-14, 14), life: U.rand(0.8, 1.6), size: U.rand(3, 5), grow: 8, col: '170,178,186', a: 0.45 });
  IC.part(S, { x: u.x, y: u.y, life: 0.2, size: 8, grow: 30, col: '255,225,160', add: true, a: 0.9 });
  S.fx.flashes.push({ x: u.x, y: u.y, t: 0, r: 40, wr: 3 });
  IC.sfx && IC.sfx.launch(u.x, u.y, M.range > 1500 ? 1.4 : M.range > 300 ? 1 : 0.7);
  if (M.range > 1500) IC.log(S, 'info', 'LAUNCH', `${u.name} fires ${M.name.toLowerCase()} at TN ${t.tn}.`);
  IC.emit(S, 'launch', { u, t, mun: m.mun });
}

IC.defense = function (S, dt) {
  const wx = IC.wx(S);
  for (const u of S.units) {
    if (u.state !== 'ready') { u.beam = null; u.why = u.state === 'transit' ? 'On the move' : 'Setting up'; continue; }
    const d = u.d;
    for (const m of u.mags) if (IC.hasTech(S, m.tech)) reloadStep(S, u, m, dt);
    if (d.link) { u.why = u.radarOn ? linkWhy(S, u) : 'Datalink off: batteries nearby fire only on their own radar'; continue; }
    if (!d.weapon || d.weapon === 'strike' || d.weapon === 'decoy') continue;
    const range = IC.maxRange(S, u);
    if (u.emcon === 'ambush') for (const t of S.threats) if (t.det && (t.aff === 'H' || t.aff === 'S') && U.dist(u, t) < range * 1.15) { u.ambushT = 120; break; }
    if (IC.ok(u, 'launch') < 0.25 && d.weapon !== 'ecm') { u.why = 'Launchers knocked out: needs repair'; continue; }

    if (d.weapon === 'sam') {
      u.cool -= dt;
      if (u.cool > 0) continue;
      let best = null, bm = null, bs = 1e12, br = 0;
      const p = u.prio;
      const why = { r: '' };
      let sawAny = false, blockedRoe = false, blockedSee = false, engaged = false;
      let bpip = null;
      if (p && !p.dead && p.det && canSee(S, u, p) && eligible(S, u, p, true)) {
        const r = U.dist(u, p), m = chooseMun(S, u, p, r, why);
        if (m && p.inbound < need(S, u, p) + 1) { best = p; bm = m; br = r; bpip = why.pip; }
      } else if (p && p.dead) u.prio = null;
      if (!best) for (const t of S.threats) {
        if (t.dead || !t.det) continue;
        const r = U.dist(u, t); if (r > range * 1.05) continue;
        if (t.d.civil && (t.aff === 'N' || t.aff === 'A')) continue;
        sawAny = true;
        if (!eligible(S, u, t)) { blockedRoe = true; continue; }
        if (t.inbound >= need(S, u, t)) { engaged = true; continue; }
        if (!canSee(S, u, t)) { if (!blockedSee) blockedSee = t; continue; }
        const m = chooseMun(S, u, t, r, why); if (!m) continue;
        const sc = priority(u, t, r);
        if (sc < bs) { bs = sc; best = t; bm = m; br = r; bpip = why.pip; }
      }
      // nothing to shoot, but a jammer on our radar: missiles that can home on its noise need no track
      let hojWhy = '';
      if (!best && u.jammers && IC.effRoe(S, u) !== 'hold') {
        for (const j of u.jammers) {
          if (j.dead || j.inbound >= 1 || j.aff !== 'H') continue;
          const r = U.dist(u, j);
          const m = IC.activeMags(S, u).find(m => m.mag > 0 && IC.MUN[m.mun].hoj && r <= IC.MUN[m.mun].range * 0.95 && j.alt <= IC.MUN[m.mun].alt[1]);
          if (!m) { hojWhy = hojWhy || `Jammed from ${U.compass(Math.atan2(j.y - u.y, j.x - u.x))}: the jammer is beyond missile reach`; continue; }
          fire(S, u, j, m, r, null, true);
          u.cool = 3 / IC.fatigueFactor(u); u.aim = Math.atan2(j.y - u.y, j.x - u.x);
          u.why = `Home-on-jam shot at the jammer to the ${U.compass(u.aim)}`;
          IC.log(S, 'warn', 'HOME-ON-JAM', `${u.name} fires a home-on-jam missile at the jammer to the ${U.compass(u.aim)}.`, u);
          hojWhy = 'fired';
          break;
        }
      }
      if (hojWhy === 'fired') continue;
      if (best) {
        const salvo = IC.effDoctrine(S, u) === 'salvo' || IC.predictable(best);
        fire(S, u, best, bm, br, bpip);
        if (salvo && bm.mag > 0 && best.inbound < need(S, u, best)) fire(S, u, best, bm, br, bpip);
        u.cool = 3 / IC.fatigueFactor(u); u.aim = Math.atan2(best.y - u.y, best.x - u.x);
        u.why = `Engaging TN ${best.tn}`;
      } else {
        const empty = IC.activeMags(S, u).every(m => m.mag + m.store === 0);
        const reloading = IC.activeMags(S, u).every(m => m.mag === 0) && !empty;
        u.why = empty ? 'Out of missiles: waiting for resupply' : reloading ? reloadWhy(S, u)
          : blockedSee ? IC.fcWhy(S, u, blockedSee) : why.r ? cap1(why.r)
          : blockedRoe ? (IC.effRoe(S, u) === 'hold' ? 'Weapons hold' : 'Holding: targets not identified hostile')
          : engaged ? 'Holding: interceptors already on their way to every target in reach' : hojWhy ? hojWhy : sawAny ? 'Tracking' : 'No targets';
        u.cool = 0.5;
      }
    } else if (d.weapon === 'gun') {
      u.cool -= dt;
      const G = d.gun;
      let best = null, bd = 1e9;
      for (const t of S.threats) {
        if (!eligible(S, u, t, u.prio === t)) continue;
        if (!G.vs[IC.classOf(t)]) continue;
        const r = U.dist(u, t); if (r > G.range || t.alt > 4) continue;
        if (!canSee(S, u, t) && !t.vis) continue;
        if (r < bd) { bd = r; best = t; }
      }
      u.why = best ? `Firing at TN ${best.tn}` : 'Watching';
      if (best) {
        u.aim = Math.atan2(best.y - u.y, best.x - u.x);
        if (u.cool <= 0) {
          u.cool = G.rof / IC.fatigueFactor(u);
          const hit = Math.random() < G.acc * G.vs[IC.classOf(best)] * (1 - 0.5 * bd / G.range) * (0.5 + 0.5 * wx.eo);
          const ex = best.x + (hit ? 0 : U.rand(-6, 6)), ey = best.y + (hit ? 0 : U.rand(-6, 6));
          S.fx.tracers.push({ x1: u.x, y1: u.y, x2: ex, y2: ey, t: 0 });
          IC.sfx && IC.sfx.gun(u.x, u.y);
          if (hit) { best.hp -= 0.5; IC.part(S, { x: ex, y: ey, life: 0.2, size: 3, grow: 10, col: '255,210,130', add: true }); if (best.hp <= 0) IC.killThreat(S, best, u.name); }
        }
      }
    } else if (d.weapon === 'laser') {
      const Lz = d.laser, R = Lz.range * (wx.fog > 0.3 ? 0.5 : 1) * (wx.precip > 0.5 ? 0.7 : 1);
      if (u.over) { u.heat -= dt; u.beam = null; u.why = 'Cooling down'; if (u.heat <= 0) { u.heat = 0; u.over = false; } continue; }
      let best = u.beam && !u.beam.dead && U.dist(u, u.beam) <= R ? u.beam : null;
      if (!best) { let bd = 1e9; for (const t of S.threats) { if (!eligible(S, u, t) || !Lz.vs[IC.classOf(t)]) continue; const r = U.dist(u, t); if (r <= R && r < bd && t.alt < 6) { bd = r; best = t; } } }
      u.beam = best; u.why = best ? `Burning TN ${best.tn}` : 'Watching';
      if (best) {
        u.heat += dt;
        best.hp -= Lz.dps * Lz.vs[IC.classOf(best)] * dt;
        if (Math.random() < 0.5) IC.part(S, { x: best.x, y: best.y, vx: U.rand(-40, 40), vy: U.rand(-40, 40), life: U.rand(0.15, 0.35), size: 1.5, col: '200,240,255', add: true, drag: 4 });
        if (best.hp <= 0) { IC.killThreat(S, best, u.name, 'BURN'); u.beam = null; }
        if (u.heat >= Lz.heat) { u.over = true; u.beam = null; IC.text(S, u.x, u.y, 'OVERHEAT', '#f2b441'); }
      } else u.heat = Math.max(0, u.heat - dt * 0.5);
    } else if (d.weapon === 'hpm') {
      u.cd -= dt;
      if (u.cd > 0) { u.why = 'Recharging'; continue; }
      const H = d.hpm, inR = S.threats.filter(t => !t.dead && t.det && t.d.cls === 'drone' && U.dist(u, t) <= H.range);
      u.why = 'Charged';
      if (inR.length && IC.effRoe(S, u) !== 'hold') {
        u.cd = H.cd;
        S.fx.rings.push({ x: u.x, y: u.y, r: H.range, t: 0, color: '160,220,255' });
        IC.sfx && IC.sfx.zap(u.x, u.y);
        let k = 0; for (const t of inR) if (Math.random() < H.pk) { IC.killThreat(S, t, u.name, 'FRIED'); k++; }
        IC.log(S, 'kill', 'HPM', `${u.name} pulse downed ${k} of ${inR.length} drones.`);
      }
    } else if (d.weapon === 'ecm') {
      u.why = u.radarOn ? 'Jamming satellite navigation' : 'Silent';
      if (!u.radarOn) continue;
      for (const t of S.threats) {
        if (t.dead || t.spoofed || !t.d.gps) continue;
        if (U.dist(u, t) > d.ecm.range) continue;
        if (Math.random() < d.ecm.rate * dt) {
          t.spoofed = true; t.spoofT = U.rand(80, 260); t.sd = Math.random() < 0.5 ? -1 : 1;
          t.hd = Math.atan2(t.vy, t.vx) + t.sd * U.rand(0.5, 1.4);
          if (t.det) IC.text(S, t.x, t.y, 'SPOOFED', '#9fe0ff');
        }
      }
    }
  }
};
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
function reloadWhy(S, u) {
  const m = IC.activeMags(S, u).find(m => m.li >= 0);
  return m ? `Reloading launcher ${m.li + 1} of ${m.ln}: ready in ${U.dur(IC.reloadLeft(S, u, m))}` : 'Reloading';
}

/* ---------- command posts ----------
   A command post that is on the air links every missile battery within its reach: they fire on any fire-control
   track, as the IADS network does for all of them. */
const cps = { S: null, t: -1, n: -1, list: [] };
/* on the network: command guidance can come over the datalink from another radar's track (semi-active cannot) */
const netted = (S, u) => u.d.remote || IC.hasTech(S, 'a_remote') || !!IC.linkedBy(S, u);
IC.linkedBy = function (S, u) {
  if (cps.S !== S || cps.t !== S.time || cps.n !== S.units.length) { cps.S = S; cps.t = S.time; cps.n = S.units.length; cps.list = S.units.filter(c => c.d.link && c.state === 'ready' && c.radarOn); }
  for (const c of cps.list) if (U.dist(c, u) <= c.d.link.R) return c;
  return null;
};
function linkWhy(S, c) {
  const n = S.units.filter(u => u.d.weapon === 'sam' && !u.callin && U.dist(c, u) <= c.d.link.R).length;
  return n ? `Linking ${n} batter${n === 1 ? 'y' : 'ies'} within ${U.km(c.d.link.R)}` : `No missile battery within ${U.km(c.d.link.R)} to link`;
}

/* why this battery can or cannot fire at this track, in plain words */
IC.fcWhy = function (S, u, t) {
  if (!u.radarOn && !(u.d.fc && u.d.fc.passive)) return u.emcon === 'ambush' ? 'Radar in ambush: it comes on when a hostile gets close' : 'Radar silent: no fire-control track';
  const s = (S.sensors || []).find(x => x.unit === u && x.org);
  if (!s) return 'Not tracked by fire control';
  const r = U.dist(s, t);
  if (s.bmdOnly && !IC.predictable(t)) return 'Its radar only tracks ballistic missiles';
  if (r > U.horizon(s.mast, t.alt)) return `Below its radar horizon: it sees ${U.km(U.horizon(s.mast, Math.max(0.05, t.alt)))} out at that height`;
  if (r > 1 && IC.aspHidden(s, t)) return 'Masked by a hill: its radar cannot see down behind it';
  if (s.jams) for (const J of s.jams) if (J.j !== t && Math.abs(U.angWrap(Math.atan2(t.y - s.y, t.x - s.x) - J.a)) < J.w) return `Jammed along that bearing: it sees only inside ${U.km(J.d * 0.3 * (1 + (s.eccm || 0)))}`;
  if (s.jams && s.jams.some(J => J.j === t)) return 'It is the jammer: no range, only a strobe';
  return `Beyond its radar's reach against a target this size (${U.km(s.R * Math.pow(t.rcs, 0.25))})`;
};
IC.engageWhy = function (S, u, t) {
  if (u.state !== 'ready') return u.why || 'Not ready';
  if (IC.ok(u, 'launch') < 0.25) return 'Launchers knocked out: needs repair';
  if (!eligible(S, u, t, u.prio === t)) {
    if (t.aff === 'N' || t.aff === 'A') return 'Civil track: it fires only if you assign it';
    return IC.effRoe(S, u) === 'hold' ? 'Weapons hold' : 'Not identified hostile: weapons are Tight';
  }
  if (!canSee(S, u, t)) return IC.fcWhy(S, u, t);
  const why = { r: '' };
  if (!chooseMun(S, u, t, U.dist(u, t), why)) return cap1(why.r || 'no missile can reach it');
  if (t.inbound >= need(S, u, t)) return `Already engaged: ${t.inbound} interceptor${t.inbound > 1 ? 's' : ''} on the way`;
  return u.cool > 0 ? 'Can engage: firing next' : 'Can engage now';
};

/* ---------- interceptors in flight ---------- */
IC.updateMissiles = function (S, dt) {
  for (const m of S.missiles) {
    const t = m.target;
    m.life -= dt;
    if (t.dead || m.life <= 0) { m.dead = true; IC.part(S, { x: m.x, y: m.y, life: 0.3, size: 4, grow: 14, col: '180,220,255', add: true, a: 0.6 }); continue; }
    if (m.pip) { flyToPip(S, m, t, dt); continue; }
    const r = U.dist(m, t), tt = r / m.spd;
    // guidance: lead the target unless the seeker has been fooled
    const ax = t.x + t.vx * tt + (m.fooled ? m.fx : 0), ay = t.y + t.vy * tt + (m.fooled ? m.fy : 0);
    const da = U.angWrap(Math.atan2(ay - m.y, ax - m.x) - m.a), mt = 1.2 * dt;
    m.a += U.clamp(da, -mt, mt);
    const step = m.spd * dt;
    m.x += Math.cos(m.a) * step; m.y += Math.sin(m.a) * step;
    m.trailT -= dt;
    if (m.trailT <= 0) { m.trailT = 0.6; m.tr.pts.push({ x: m.x, y: m.y, t: S.time }); if (m.tr.pts.length > 80) m.tr.pts.shift(); }
    // radar-guided missiles need the launching battery to keep illuminating the target
    if ((m.M.seeker === 'SARH' || m.M.seeker === 'CMD') && tt < 5 && !m.checked) {
      m.checked = true;
      const u = m.unit;
      if (m.hoj) { if (!t.jamming) { m.lostLock = true; m.pk *= 0.1; } }
      else if (!u || u.dead || ((!u.radarOn || !t.fcBy.includes(u.id)) && !(m.M.seeker === 'CMD' && t.fc && netted(S, u)))) { m.lostLock = true; m.pk *= 0.08; }
    }
    if (m.hoj && m.M.seeker === 'ARH' && tt < 5 && !m.checked) { m.checked = true; if (!t.jamming && !t.det) { m.lostLock = true; m.pk *= 0.3; } }
    // the target fights back in the last seconds
    if (tt < 5 && !m.cmDone && (t.d.cls === 'air' || t.d.cls === 'heli')) {
      m.cmDone = true;
      if (t.d.notch && (m.M.seeker === 'SARH' || m.M.seeker === 'ARH' || m.M.seeker === 'CMD') && Math.random() < 0.8) {
        t.notchT = 14; t.notchA = Math.atan2(m.y - t.y, m.x - t.x); m.pk *= m.M.seeker === 'SARH' ? 0.65 : 0.8;
        if (t.det) IC.text(S, t.px, t.py, 'NOTCHING', '#ffb0a6');
      }
      if (t.cm > 0) {
        t.cm--;
        if (m.M.seeker === 'IR') { m.pk *= m.M.ircm || 0.5; flares(S, t); }
        else { m.pk *= m.M.seeker === 'SARH' ? 0.7 : 0.82; chaff(S, t); }
        if (Math.random() < 0.5) { m.fooled = true; m.fx = U.rand(-8, 8); m.fy = U.rand(-8, 8); }
      }
    }
    if (r < Math.max(6, step * 0.8)) {
      m.dead = true;
      const inEnv = t.alt >= m.M.alt[0] - 2 && t.alt <= m.M.alt[1] + 5;
      let pk = m.pk;
      if (m.M.air && IC.hasTech(S, 'f_aam')) pk += 0.1;
      if (inEnv && Math.random() < pk) {
        IC.explode(S, t.x, t.y, 0.6, 'us');
        t.hp -= HIT[m.mun] || 2;
        if (t.hp <= 0 || t.d.cls !== 'air') IC.killThreat(S, t, m.src);
        else { IC.text(S, t.x, t.y, 'DAMAGED', '#ffd08a'); t.spd *= 0.85; }
      } else {
        IC.text(S, m.x, m.y, !inEnv ? 'OUT OF ENVELOPE' : m.lostLock ? 'LOST LOCK' : m.fooled ? 'DECOYED' : 'MISS', '#8fa3b0');
        IC.part(S, { x: m.x, y: m.y, life: 0.3, size: 4, grow: 12, col: '200,200,200', add: true, a: 0.5 });
      }
    }
  }
  for (const m of S.missiles) if (m.dead && !m.counted) { m.counted = true; m.target.inbound--; }
  S.missiles = S.missiles.filter(m => !m.dead);
};
/* an interceptor on its way to a predicted intercept point: it arrives when the warhead should, and its seeker
   does the last few hundred metres */
function flyToPip(S, m, t, dt) {
  const P = m.pip, left = P.T - S.time, d = U.dxy(m.x, m.y, P.x, P.y);
  m.a = Math.atan2(P.y - m.y, P.x - m.x);
  const step = left > dt ? d / left * dt : d;
  m.x += Math.cos(m.a) * step; m.y += Math.sin(m.a) * step;
  m.alt = P.alt * U.clamp(1 - left / P.tof, 0, 1);
  m.trailT -= dt;
  if (m.trailT <= 0) { m.trailT = 0.6; m.tr.pts.push({ x: m.x, y: m.y, t: S.time }); if (m.tr.pts.length > 80) m.tr.pts.shift(); }
  if (left > 0) return;
  m.dead = true;
  const off = Math.hypot(U.dxy(t.x, t.y, P.x, P.y), (t.alt - P.alt) * 10);
  let pk = m.pk;
  if (t.d.evasive) pk *= t.d.evasive;
  if (off < 40 && Math.random() < pk) {
    IC.explode(S, t.x, t.y, 0.8, 'us');
    t.hp -= HIT[m.mun] || 2;
    if (t.hp <= 0 || t.d.cls !== 'air') IC.killThreat(S, t, m.src);
    IC.emit(S, 'intercept', { t, m, alt: P.alt });
  } else {
    IC.text(S, m.x, m.y, off >= 40 ? 'MANOEUVRED' : 'MISS', '#8fa3b0');
    IC.part(S, { x: m.x, y: m.y, life: 0.3, size: 4, grow: 12, col: '200,200,200', add: true, a: 0.5 });
  }
}
function flares(S, t) {
  for (let i = 0; i < 10; i++) S.fx.chaff.push({ x: t.x, y: t.y, vx: -t.vx * 0.3 + U.rand(-1.5, 1.5), vy: -t.vy * 0.3 + U.rand(-1.5, 1.5), t: 0, life: U.rand(2.5, 4.5), kind: 'flare' });
  IC.sfx && IC.sfx.pop(t.x, t.y);
}
function chaff(S, t) {
  for (let i = 0; i < 8; i++) S.fx.chaff.push({ x: t.x, y: t.y, vx: -t.vx * 0.2 + U.rand(-0.6, 0.6), vy: -t.vy * 0.2 + U.rand(-0.6, 0.6), t: 0, life: U.rand(6, 10), kind: 'chaff' });
  IC.sfx && IC.sfx.pop(t.x, t.y);
}
IC.flares = flares; IC.chaffFx = chaff;

/* ---------- our strike weapons ----------
   targets: enemy site, launcher (tel) */
IC.aimOf = tg => tg.tel ? { x: tg.kx, y: tg.ky } : { x: tg.x, y: tg.y };
IC.fireMission = function (S, u, target, n) {
  const m = u.mags[0]; if (!m || !target) return 0;
  const M = IC.MUN[m.mun];
  const aim = IC.aimOf(target);
  const r = U.dist(u, aim);
  if (r > M.range || u.state !== 'ready') return 0;
  let fired = 0;
  const rep = { id: IC.nid('bda'), target, what: M.name, by: u.name, n: 0, hits: 0, dmg: 0, t: S.time, open: true };
  for (let i = 0; i < n && m.mag > 0; i++) {
    IC.takeRound(u, m); fired++;
    const spread = 8;
    const jit = { x: aim.x + U.rand(-spread, spread), y: aim.y + U.rand(-spread, spread) };
    const s = { id: IC.nid('s'), mun: m.mun, M, x: u.x + U.rand(-4, 4), y: u.y + U.rand(-4, 4), aim: jit, target, src: u.name, age: -i * (M.bal ? 4 : 20), side: 'us', rep, tr: null };
    if (M.bal) { const R = U.dist(s, jit); s.x0 = s.x; s.y0 = s.y; s.T = R / M.spd + 30; s.apex = Math.max(20, R * 0.025); }
    S.strikes.push(s);
  }
  rep.n = fired;
  u.lastFired = S.time;
  S.stats.strikes += fired;
  IC.log(S, 'warn', 'FIRE', `${u.name} fires ${fired}× ${M.name.toLowerCase()} at ${target.name}.`);
  IC.enemyLearn(S, u, 'launch');
  S.enemy.retaliate = Math.max(S.enemy.retaliate, 0.6);
  IC.emit(S, 'fire', u);
  return fired;
};
IC.updateStrikes = function (S, dt) {
  for (const s of S.strikes) {
    s.age += dt;
    if (s.age < 0) { s.pending = true; continue; }
    if (s.pending || s.pending === undefined) { s.pending = false; IC.part(S, { x: s.x, y: s.y, life: 0.25, size: 9, grow: 26, col: '255,225,160', add: true }); IC.sfx && IC.sfx.launch(s.x, s.y, s.M.bal ? 1.2 : 0.9); }
    if (!s.tr) s.tr = IC.newTrail(S, s.M.bal ? 'big' : 'sam');
    s.trT = (s.trT || 0) - dt;
    if (s.trT <= 0) { s.trT = 0.8; s.tr.pts.push({ x: s.x, y: s.y, t: S.time }); if (s.tr.pts.length > 80) s.tr.pts.shift(); }
    if (s.M.bal) {
      const f = U.clamp(s.age / s.T, 0, 1);
      s.x = s.x0 + (s.aim.x - s.x0) * f; s.y = s.y0 + (s.aim.y - s.y0) * f; s.alt = s.apex * 4 * f * (1 - f);
      if (f >= 1) { s.dead = true; strikeImpact(S, s); }
    } else {
      const dx = s.aim.x - s.x, dy = s.aim.y - s.y, L = Math.hypot(dx, dy), step = s.M.spd * dt;
      s.h = Math.atan2(dy, dx); s.alt = s.M === IC.GBU ? Math.min(6, L / 40) : 0.1;
      if (L <= step) { s.x = s.aim.x; s.y = s.aim.y; s.dead = true; strikeImpact(S, s); }
      else { s.x += dx / L * step; s.y += dy / L * step; }
    }
  }
  S.strikes = S.strikes.filter(s => !s.dead);
};
function strikeImpact(S, s) {
  IC.explode(S, s.x, s.y, 0.6 + s.M.dmg / 80, 'us');
  IC.crater(S, s.x, s.y, 1.5 + s.M.dmg * 0.03);
  const tg = s.target, rep = s.rep;
  const done = () => { if (rep) { rep.left = (rep.left == null ? rep.n : rep.left) - 1; if (rep.left <= 0) IC.bdaReport(S, rep); } };
  if (tg.tel) {
    if (!tg.dead && U.dxy(tg.x, tg.y, s.x, s.y) < 40) { IC.telDestroyed(S, tg, s.src); if (rep) { rep.hits++; rep.kill = true; } }
    else if (!s.reported) { s.reported = true; if (rep) rep.empty = true; }
    return done();
  }
  const pk = tg.pk >= 2 ? 0.9 : 0.45;
  if (Math.random() < pk) { IC.siteDamaged(S, tg, s.M.dmg, s.src, true); if (rep) { rep.hits++; rep.dmg += s.M.dmg; } }
  done();
}
/* battle damage assessment: what our strike achieved, as far as we can tell */
IC.bdaReport = function (S, rep) {
  if (!rep.open) return;
  rep.open = false;
  const tg = rep.target;
  let text;
  if (tg.tel) text = rep.kill ? `${tg.name} destroyed.` : rep.empty ? `Nothing at the aim point: the launcher had moved.` : 'No confirmed hits.';
  else text = tg.destroyed ? `${tg.name} destroyed.` : rep.hits ? `${rep.hits} of ${rep.n} hit. ${tg.name} about ${Math.round(100 - tg.hp / tg.max * 100)}% damaged.` : `All ${rep.n} missed.`;
  rep.text = text;
  S.reports.unshift(rep); if (S.reports.length > 20) S.reports.length = 20;
  IC.log(S, rep.hits ? 'kill' : 'info', 'BDA', `${rep.by}: ${text}`, IC.aimOf(tg));
  IC.emit(S, 'bda', rep);
};

})(window.IC);
