/* Iron Canopy — being shot at, visible everywhere (brief 43). On the map: every inbound weapon's predicted path, its
   aim point and a countdown, a ring pulsing on what it is aimed at, lock lines and LOCKED tags on what an enemy radar
   holds, MISSILE warnings with the time to impact, DEFENDING and what the crew is doing, drone groups counted, and a
   burst with the track struck through on each kill. On the screen's edge: arrows to weapons out of view, soonest
   first; the raid's running tally; and the combat-time badge. Reads combat.js; draws only. */
(function (IC) {
'use strict';
const U = IC.U, C = IC.C, cam = IC.cam, RS = IC.rs;
let ctx;
const RED = '255,91,79', CYAN = '111,210,255';
const mmss = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
IC.mmss = mmss;
const label = (...a) => RS.label(...a);
const posOf = o => o.held ? { x: o.px, y: o.py } : { x: o.x, y: o.y };
function pill(txt, x, y, px, col, bg, size) {
  ctx.font = `700 ${(size || 9) * px}px "IBM Plex Mono", monospace`;
  const w = ctx.measureText(txt).width + 8 * px, h = (size || 9) * 1.5 * px;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h * 0.75, w, h, 3 * px) : ctx.rect(x - w / 2, y - h * 0.75, w, h); ctx.fill();
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}

/* ---------- on the map ---------- */
IC.drawWarnings = function (c, S, px, now) {
  ctx = c;
  const list = IC.inbound(S), shown = new Set(), group = new Set();
  let n = 0;
  for (const it of list) {
    const o = it.o, p = it.kind === 'missile' ? o : posOf(o);
    if (!RS.inView(p.x, p.y, 2000) && !(it.aim && RS.inView(it.aim.x, it.aim.y, 200))) continue;
    if (++n > 40) break;
    const soon = it.tti < 120, a = soon ? 0.75 : 0.4;
    // a swarm or a salvo on one aim point gets one path, one cross and one countdown: its leader's
    const gk = it.aim ? (o.op ? o.op.id : '') + ':' + Math.round(it.aim.x / 60) + ':' + Math.round(it.aim.y / 60) : o;
    const lead = !group.has(gk); group.add(gk);
    // the predicted path to the aim point
    if (lead && it.aim && it.kind !== 'missile') {
      ctx.strokeStyle = `rgba(${RED},${a * 0.6})`; ctx.lineWidth = 1.1 * px; ctx.setLineDash([5 * px, 6 * px]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      if (o.route && o.route.length && o.d.move !== 'bal') for (const q of o.route) ctx.lineTo(q.x, q.y); else ctx.lineTo(it.aim.x, it.aim.y);
      ctx.stroke(); ctx.setLineDash([]);
      // the aim point: a small cross
      const r = 6 * px; ctx.strokeStyle = `rgba(${RED},${a})`; ctx.lineWidth = 1.4 * px;
      ctx.beginPath(); ctx.moveTo(it.aim.x - r, it.aim.y - r); ctx.lineTo(it.aim.x + r, it.aim.y + r); ctx.moveTo(it.aim.x + r, it.aim.y - r); ctx.lineTo(it.aim.x - r, it.aim.y + r); ctx.stroke();
    }
    // a ring pulsing on what it is aimed at (once per target: the soonest)
    const tg = it.tgt || it.aim;
    if (tg && !shown.has(it.tgt || o)) {
      shown.add(it.tgt || o);
      const k = (now * (soon ? 1.6 : 0.8) + (o.seed || 0)) % 1;
      ctx.strokeStyle = `rgba(${RED},${(1 - k) * (soon ? 0.9 : 0.5)})`; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, (14 + k * 20) * px, 0, 7); ctx.stroke();
    }
    // the countdown by the weapon
    if (lead && cam.z > 0.03 && n <= 16 && it.kind === 'weapon') label(`impact ${mmss(it.tti)}`, p.x, p.y + 17 * px, px, soon ? '#ff8a80' : 'rgba(255,170,160,0.8)', 8.5, 'center', 700);
  }
  locks(S, px, now);
  ourMissiles(S, px);
  defending(S, px, now);
  droneGroups(S, px);
  splashes(S, px, now);
};
/* what an enemy radar holds: a line from it and a LOCKED tag; a missile on its way: MISSILE and its time to impact */
function locks(S, px, now) {
  const flash = Math.sin(now * 12) > 0;
  const one = (x, isAir) => {
    if (!IC.lockedOn(S, x) || !RS.inView(x.x, x.y, 300)) return;
    const by = x.lockBy, bp = by && (by.held || by.px != null ? posOf(by) : by);
    if (bp && bp.x != null) { ctx.strokeStyle = `rgba(${RED},0.55)`; ctx.lineWidth = 1.2 * px; ctx.setLineDash([3 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(x.x, x.y); ctx.stroke(); ctx.setLineDash([]); }
    const m = isAir ? x.mslIn : null;
    if (m && !m.dead) pill(`MISSILE ${mmss(m.tti)}`, x.x, x.y - 22 * px, px, flash ? '#fff' : '#ffd0cc', `rgba(${RED},${flash ? 0.95 : 0.7})`, 9);
    else pill('LOCKED', x.x, x.y - 22 * px, px, '#ffe0dc', `rgba(${RED},0.75)`, 8.5);
  };
  for (const a of S.air) if (!a.dead && !a.gnd) one(a, true);
  for (const u of S.units) one(u, false);
  // anything aimed straight at one of our units: its time to impact
  for (const it of IC.inbound(S)) if (it.tgt && S.units.includes(it.tgt) && it.tti < 600 && RS.inView(it.tgt.x, it.tgt.y, 200)) {
    pill(`MISSILE ${mmss(it.tti)}`, it.tgt.x, it.tgt.y - 32 * px, px, flash ? '#fff' : '#ffd0cc', `rgba(${RED},${flash ? 0.95 : 0.7})`, 9);
  }
}
/* our own missiles: the time to the target, and a faint line to it while the seeker holds it */
function ourMissiles(S, px) {
  if (cam.z < 0.04) return;
  for (const m of S.missiles) {
    if (m.dead || !RS.inView(m.x, m.y, 100)) continue;
    const t = m.target, tt = m.pip ? m.pip.T - S.time : m.tti;
    if (t && !m.lostLock && !m.fooled && !m.pip) { const tp = posOf(t); ctx.strokeStyle = `rgba(${CYAN},0.22)`; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); }
    if (isFinite(tt) && tt < 600) label(mmss(tt), m.x + 7 * px, m.y - 6 * px, px, m.lostLock || m.fooled ? C.muted : '#a0e1ff', 8, 'left', 600);
  }
}
/* aircraft defending against a missile, theirs and ours: what the crew is doing */
function defending(S, px, now) {
  const tag = (x, y, w, col) => { if (w.def && w.def !== 'react' || (w.def === 'react' && w.mslIn)) label(IC.DEF_WORDS[w.def] || 'DEFENDING', x, y + 26 * px, px, col, 8.5, 'center', 700); };
  for (const a of S.air) if (!a.dead && !a.gnd && a.def && RS.inView(a.x, a.y, 200)) tag(a.x, a.y, a, '#9fe0ff');
  for (const t of S.threats) if (!t.dead && t.held && t.def && RS.inView(t.px, t.py, 200)) tag(t.px, t.py, t, '#ffb0a6');
  // a raid that broke: its aircraft say so all the way home
  for (const t of S.threats) if (!t.dead && t.held && t.abort === true && !t.def && RS.inView(t.px, t.py, 200)) label('RAID ABORTED · going home', t.px, t.py + 26 * px, px, '#9fe0ff', 8.5, 'center', 700);
}
/* drone groups: how many, and how long until the first arrives */
function droneGroups(S, px) {
  if (cam.z < 0.025) return;
  const G = new Map();
  for (const it of IC.inbound(S)) {
    if (it.kind !== 'drone') continue;
    // a drone close by on screen buzzes
    if (cam.z > 0.4 && IC.sfx && IC.sfx.buzz && RS.inView(it.o.px, it.o.py, 0)) IC.sfx.buzz(it.o.px, it.o.py);
    const k = it.o.op || it.o, g = G.get(k);
    if (!g) G.set(k, { n: 1, lead: it.o, tti: it.tti }); else { g.n++; if (it.tti < g.tti) { g.tti = it.tti; g.lead = it.o; } }
  }
  for (const g of G.values()) {
    const p = posOf(g.lead); if (!RS.inView(p.x, p.y, 300)) continue;
    pill(`${g.n} drone${g.n > 1 ? 's' : ''} · ${g.tti >= 60 ? Math.round(g.tti / 60) + ' min' : Math.round(g.tti) + ' s'} out`, p.x, p.y - 26 * px, px, '#ffe1dc', 'rgba(60,12,10,0.8)', 9);
  }
}
/* kill confirmation: a burst, the track struck through and SPLASH, for a few real seconds */
const seen = new Map();
function splashes(S, px, now) {
  for (const s of S.fx.splash || []) if (!seen.has(s)) seen.set(s, now);
  for (const [s, t0] of seen) {
    const k = (now - t0) / 3.5;
    if (k > 1 || !(S.fx.splash || []).includes(s)) { seen.delete(s); continue; }
    if (!RS.inView(s.x, s.y, 100)) continue;
    const r = (10 + 30 * Math.sqrt(k)) * px;
    ctx.strokeStyle = `rgba(255,210,122,${(1 - k) * 0.9})`; ctx.lineWidth = 2.2 * px;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.stroke();
    const q = 9 * px; ctx.strokeStyle = `rgba(255,236,190,${1 - k})`; ctx.lineWidth = 2.4 * px;
    ctx.beginPath(); ctx.moveTo(s.x - q, s.y - q); ctx.lineTo(s.x + q, s.y + q); ctx.moveTo(s.x + q, s.y - q); ctx.lineTo(s.x - q, s.y + q); ctx.stroke();
    ctx.globalAlpha = 1 - k; label(`SPLASH${s.tn ? ' · TN ' + s.tn : ''}`, s.x, s.y - 16 * px, px, '#ffd27a', 10, 'center', 700); ctx.globalAlpha = 1;
  }
}

/* ---------- on the screen ---------- */
IC.drawWarnHud = function (c, S, now) {
  ctx = c;
  edgeArrows(S, now);
  tally(S);
  const ct = IC.combatNow;
  if (ct && ct.active) {
    const x = cam.vw / 2, y = cam.vh - 118;
    ctx.font = '700 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    const txt = `COMBAT TIME · ${ct.speed < 1 ? ct.speed.toFixed(1) : Math.round(ct.speed)}×`;
    const w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(40,10,8,0.75)'; ctx.fillRect(x - w / 2, y - 15, w, 22);
    ctx.fillStyle = '#ffb0a6'; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
};
/* weapons off the screen: an arrow on the edge pointing at each, soonest first, with its countdown */
function edgeArrows(S, now) {
  const W = cam.vw, H = cam.vh, cx = W / 2, cy = H / 2, M = 30;
  const used = [];
  let k = 0;
  for (const it of IC.inbound(S)) {
    if (k >= 8) break;
    const o = it.o, p = it.kind === 'missile' ? o : posOf(o);
    const sx = (p.x - cam.x) * cam.z, sy = (p.y - cam.y) * cam.z;
    if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
    // what it is aimed at must be on screen, or it must be coming soon: otherwise it is not this view's business
    const tg = it.tgt || it.aim;
    const tOn = tg && (tg.x - cam.x) * cam.z > -100 && (tg.x - cam.x) * cam.z < W + 100 && (tg.y - cam.y) * cam.z > -100 && (tg.y - cam.y) * cam.z < H + 100;
    if (!tOn && it.tti > 900) continue;
    const a = Math.atan2(sy - cy, sx - cx);
    if (used.some(u => Math.abs(U.angWrap(u.a - a)) < 0.12)) { const u = used.find(u => Math.abs(U.angWrap(u.a - a)) < 0.12); u.n++; continue; }
    const f = Math.min((W / 2 - M) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - M) / Math.abs(Math.sin(a) || 1e-6));
    used.push({ a, x: cx + Math.cos(a) * f, y: cy + Math.sin(a) * f, it, n: 1 });
    k++;
  }
  for (const u of used) {
    const soon = u.it.tti < 120, pulse = soon ? 0.6 + 0.4 * Math.sin(now * 8) : 0.85;
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.a);
    ctx.fillStyle = `rgba(${RED},${pulse})`; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    const what = u.it.kind === 'missile' ? 'MISSILE' : u.it.kind === 'drone' ? 'DRONE' : (u.it.o.d && u.it.o.d.code) || 'WPN';
    const tx = u.x - Math.cos(u.a) * 26, ty = u.y - Math.sin(u.a) * 18 + 4;
    ctx.font = '700 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(`${what}${u.n > 1 ? ' ×' + u.n : ''} ${mmss(u.it.tti)}`, tx + 1, ty + 1);
    ctx.fillStyle = soon ? '#ffb0a6' : '#ffd8d2'; ctx.fillText(`${what}${u.n > 1 ? ' ×' + u.n : ''} ${mmss(u.it.tti)}`, tx, ty);
    ctx.textAlign = 'left';
  }
}
/* the raid in the air: what came, what we stopped so far, what is still flying */
function tally(S) {
  const T = IC.raidTally(S);
  if (!T || !(T.n || T.R.aborted)) return;
  const x = cam.vw / 2, y = 134;
  const txt = `${T.R.name.toUpperCase()} · ${T.stopped} of ${T.n} stopped${T.air ? ` · ${T.air} in the air` : ''}${T.ac ? ` · ${T.ac} aircraft down` : ''}${T.through ? ` · ${T.through} through` : ''}${T.R.aborted ? ' · RAID ABORTED' : ''}`;
  ctx.font = '700 12.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
  const w = ctx.measureText(txt).width + 22;
  ctx.fillStyle = 'rgba(6,11,16,0.82)'; ctx.fillRect(x - w / 2, y - 16, w, 24);
  if (T.n) { ctx.fillStyle = `rgba(${RED},0.9)`; ctx.fillRect(x - w / 2, y + 6, w * (T.through / T.n), 2); ctx.fillStyle = 'rgba(88,211,154,0.95)'; ctx.fillRect(x - w / 2, y + 6, w * (T.stopped / T.n), 2); }
  ctx.fillStyle = '#e4edf2'; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}

})(window.IC);
