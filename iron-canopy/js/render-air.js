/* Iron Canopy — the air war on the map: where a coasting track could be, raids as groups, intercept vectors and the
   meeting point, the intercept being set up, combat air patrol stations with their endurance and relief, tanker
   tracks and the early-warning aircraft's low cover. Drawn in world coordinates after the tracks. */
(function (IC) {
'use strict';
const U = IC.U;
let ctx;
const CY = '#6fd2ff', CYA = a => `rgba(111,210,255,${a})`;

function label(txt, x, y, px, col, size, align, weight) {
  ctx.font = `${weight || 500} ${(size || 10) * px}px "IBM Plex Mono", monospace`;
  ctx.textAlign = align || 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(txt, x + 0.9 * px, y + 0.9 * px);
  ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}
const inView = (x, y, m) => { const c = IC.cam; return x > c.x - m && x < c.x + c.vw / c.z + m && y > c.y - m && y < c.y + c.vh / c.z + m; };
const clock = s => s >= 3600 ? U.dur(s) : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* a track with no fresh plot: the ellipse where it could be, longer along its heading */
IC.drawTrackUnc = function (g, S, t, aff, px) {
  const u = IC.trackUnc(t);
  if (u.across * IC.cam.z < 5) return;
  const col = aff === 'H' ? '255,91,79' : aff === 'S' ? '255,154,60' : aff === 'N' || aff === 'A' ? '127,232,176' : '242,209,74';
  const age = S.time - t.pt, left = IC.coastT(t) - age;
  g.save(); g.translate(t.px, t.py); g.rotate(u.a);
  g.fillStyle = `rgba(${col},0.05)`; g.strokeStyle = `rgba(${col},${left < 20 ? 0.2 : 0.4})`; g.lineWidth = 1 * px; g.setLineDash([3 * px, 4 * px]);
  g.beginPath(); g.ellipse(u.along * 0.35, 0, Math.max(u.along, 3 * px), Math.max(u.across, 3 * px), 0, 0, 7); g.fill(); g.stroke(); g.setLineDash([]);
  g.restore();
  if (S.sel && S.sel.ref === t) { ctx = g; label(`NO CONTACT ${clock(age)} · LOST IN ${clock(Math.max(0, left))}`, t.px, t.py + u.across + 14 * px, px, `rgb(${col})`, 8.5, 'center', 600); }
};

/* raids: a box round each group, with its size */
function groups(S, px) {
  const sel = S.sel && S.sel.kind === 'track' ? S.sel.ref : null;
  for (const g of S.tgroups || []) {
    const B = IC.groupBox(g), on = sel && sel.grp === g;
    if (!inView(B.x, B.y, 400)) continue;
    const pad = 10 * px + 4, col = g.aff === 'H' ? '255,91,79' : g.aff === 'S' ? '255,154,60' : '242,209,74';
    ctx.strokeStyle = `rgba(${col},${on ? 0.85 : 0.35})`; ctx.lineWidth = (on ? 1.6 : 1) * px; ctx.setLineDash(on ? [] : [5 * px, 4 * px]);
    ctx.strokeRect(B.x0 - pad, B.y0 - pad, B.x1 - B.x0 + pad * 2, B.y1 - B.y0 + pad * 2); ctx.setLineDash([]);
    if (IC.cam.z > 0.03 || on) label(`RAID ×${g.n}`, B.x0 - pad, B.y0 - pad - 4 * px, px, `rgb(${col})`, 9, 'left', 700);
  }
}

function marker(x, y, px, col) {
  const r = 6 * px;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5 * px;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.moveTo(x - r * 1.7, y); ctx.lineTo(x + r * 1.7, y); ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x, y + r * 1.7); ctx.stroke();
}
/* our fighters on an intercept: the vector to the meeting point, and the target beyond it */
function vectors(S, px) {
  for (const a of S.air) {
    if (a.dead || a.gnd || !a.mission) continue;
    const m = a.mission;
    if (m.type === 'intercept' && m.x != null && m.track && !m.track.dead) {
      const t = m.track;
      ctx.strokeStyle = CYA(0.75); ctx.lineWidth = 1.4 * px;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.setLineDash([3 * px, 4 * px]); ctx.strokeStyle = 'rgba(255,140,120,0.45)';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(t.px, t.py); ctx.stroke(); ctx.setLineDash([]);
      marker(m.x, m.y, px, CY);
      if (IC.cam.z > 0.02) label(`${a.name} → TN ${t.tn}${m.tau != null ? ' · ' + clock(m.tau) : ''}`, m.x + 10 * px, m.y - 9 * px, px, CY, 9, 'left', 600);
    } else if (m.type === 'escort' && m.who && !m.who.dead) {
      ctx.setLineDash([2 * px, 4 * px]); ctx.strokeStyle = CYA(0.4); ctx.lineWidth = 1 * px;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.who.x, m.who.y); ctx.stroke(); ctx.setLineDash([]);
    } else if (m.type === 'hold') {
      ctx.setLineDash([4 * px, 4 * px]); ctx.strokeStyle = CYA(0.35); ctx.lineWidth = 1 * px;
      ctx.beginPath(); ctx.arc(m.x, m.y, 200, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (IC.cam.z > 0.03) label(`${a.name} HOLD`, m.x, m.y - 200 - 6 * px, px, CY, 8.5, 'center', 600);
    }
    if (a.refuel && !a.refuel.dead) { ctx.setLineDash([2 * px, 3 * px]); ctx.strokeStyle = 'rgba(127,232,176,0.6)'; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.refuel.x, a.refuel.y); ctx.stroke(); ctx.setLineDash([]); }
  }
}
/* the intercept being set up: where, when, fuel after and the kill chance, before the player commits */
function plan(S, px, now) {
  const I = S.icpt;
  if (!I || !I.t || I.t.dead) return;
  if (!I.P || now - (I.PT || 0) > 0.5) { I.P = IC.interceptPlan(S, I.who, I.t); I.PT = now; }
  const P = I.P, who = I.who, a = who.ent || (who.r ? who : null), b = IC.baseOf(S, (a && a.r ? a.r : who).base);
  const from = a && !a.dead ? a : b;
  if (!P || P.x == null || !from) {
    if (I.t.held) label(P && P.why ? P.why.toUpperCase() : 'NO INTERCEPT', I.t.px, I.t.py + 22 * px, px, IC.C.amber, 9, 'center', 700);
    return;
  }
  const pulse = 0.55 + 0.35 * Math.sin(now * 5);
  ctx.strokeStyle = CYA(pulse); ctx.lineWidth = 1.6 * px; ctx.setLineDash([8 * px, 5 * px]);
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(P.x, P.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,140,120,0.5)'; ctx.setLineDash([3 * px, 4 * px]);
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(I.t.px, I.t.py); ctx.stroke(); ctx.setLineDash([]);
  marker(P.x, P.y, px, CY);
  // the missiles' reach at the target's height, round the meeting point
  if (P.reach > 0) { ctx.strokeStyle = CYA(0.25); ctx.setLineDash([2 * px, 5 * px]); ctx.beginPath(); ctx.arc(P.x, P.y, P.reach, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  const lines = [`INTERCEPT ${clock(P.T)}${P.delay > 30 ? ` (${clock(P.delay)} to get airborne)` : ''}`,
    P.fuelBack > 0 ? `FUEL AFTER ${U.dur(P.fuelBack)}` : 'NOT ENOUGH FUEL TO COME BACK',
    P.idFirst ? 'IDENTIFY FIRST · WEAPONS COLD' : `KILL ${Math.round(P.pk * 100)}%${P.n > 1 ? ` · ${P.enough ? 'ALL ' + P.n : 'MISSILES FOR ' + Math.floor((P.aam + P.srm) / 2) + ' OF ' + P.n}` : ''}`];
  if (P.late) lines.push(`REACHES ${P.late.toUpperCase()} FIRST`);
  // on a dark card beside the point, on the side away from the fighter
  const right = P.x >= from.x, bx = right ? P.x + 14 * px : P.x - 14 * px - 250 * px, by = P.y + 6 * px;
  ctx.fillStyle = 'rgba(6,16,24,0.82)'; ctx.strokeStyle = CYA(0.5); ctx.lineWidth = 1 * px;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, 250 * px, (lines.length * 13 + 8) * px, 6 * px) : ctx.rect(bx, by, 250 * px, (lines.length * 13 + 8) * px); ctx.fill(); ctx.stroke();
  lines.forEach((s, i) => label(s, bx + 8 * px, by + (15 + i * 13) * px, px, i === 1 && P.fuelBack <= 0 || i === 3 ? IC.C.amber : CY, 9.5, 'left', 700));
}
/* standing tasks: patrol stations, tanker tracks, early-warning orbits, each with who is there and for how long */
function stations(S, px) {
  const now = S.time;
  for (const task of S.ato) {
    if (!inView(task.x, task.y, 3500)) continue;
    const R = task.type === 'cap' ? 200 : task.type === 'tanker' ? 250 : task.type === 'aew' ? 180 : 330;
    if (!task.stT || now - task.stT > 2) { task.st = IC.taskStatus(S, task); task.stT = now; }
    const st = task.st, onSt = st.on.some(o => o.a.state === 'station');
    const col = onSt ? CY : IC.C.amber;
    ctx.strokeStyle = onSt ? CYA(0.45) : 'rgba(242,180,65,0.5)'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([7 * px, 5 * px]);
    ctx.beginPath(); ctx.arc(task.x, task.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (task.type === 'tanker') { ctx.beginPath(); ctx.moveTo(task.x - R * 0.7, task.y); ctx.lineTo(task.x + R * 0.7, task.y); ctx.stroke(); }
    if (IC.cam.z < 0.012) continue;
    const name = { cap: 'CAP', tanker: 'TANKER', aew: 'AEW', isr: 'RECON' }[task.type];
    const L = [`${name} · ${IC.nearestPlace(S, task.x, task.y).toUpperCase()}`];
    if (!st.on.length) L.push(st.relief ? `${st.relief.name} ON THE WAY` : 'UNCOVERED: NO AIRCRAFT READY');
    for (const o of st.on) L.push(`${o.a.name} ${o.a.state === 'station' ? 'ON STATION' : o.a.state === 'refuel' ? 'REFUELLING' : o.a.state === 'engage' ? 'ENGAGING' : 'EN ROUTE'} · ${U.dur(Math.max(0, o.left))} LEFT${o.a.kind === 'tkr' ? ` · ${U.dur(o.a.give || 0)} TO GIVE` : ''}`);
    if (st.on.length) L.push(st.relief ? (st.launchIn > 0 ? `RELIEF ${st.relief.name} LAUNCHES IN ${U.dur(st.launchIn)}` : `RELIEF ${st.relief.name} LAUNCHING`) : st.emptyIn < 7200 ? `NO RELIEF: EMPTY IN ${U.dur(Math.max(0, st.emptyIn))}` : 'NO RELIEF READY');
    L.forEach((s, i) => label(s, task.x, task.y - R - (6 + (L.length - 1 - i) * 11) * px, px, i === L.length - 1 && /NO RELIEF|UNCOVERED/.test(s) ? IC.C.amber : col, 8.5, 'center', i ? 500 : 700));
  }
}
/* the early-warning aircraft: how far it sees a cruise missile skimming the ground, over hills and the border */
IC.aewLowR = a => Math.min(3200 * Math.pow(0.05, 0.25), U.horizon(Math.max(1000, (a.alt || 9) * 1000), 0.05));
function aew(S, px) {
  for (const a of S.air) {
    if (a.dead || a.gnd || a.kind !== 'aew') continue;
    const R = IC.aewLowR(a);
    if (!inView(a.x, a.y, R + 200)) continue;
    ctx.fillStyle = 'rgba(111,210,255,0.035)'; ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, 7); ctx.fill();
    ctx.strokeStyle = CYA(0.5); ctx.lineWidth = 1.3 * px; ctx.setLineDash([10 * px, 6 * px]);
    ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (IC.cam.z > 0.008) label(`${a.name} · LOW COVER ${U.km(R)}: CRUISE MISSILES AND LOW FLIERS, OVER HILLS`, a.x, a.y - R - 6 * px, px, CY, 9, 'center', 700);
  }
}

IC.drawAirWar = function (g, S, px, now) {
  ctx = g;
  aew(S, px);
  stations(S, px);
  groups(S, px);
  vectors(S, px);
  plan(S, px, now);
};

})(window.IC);
