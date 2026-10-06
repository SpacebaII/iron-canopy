/* Iron Canopy — the life of an airport (focus round 2), headless. One plan of what serves a turnaround and when,
   shared by the 2D map (render-airport.js) and the 3D replay (render3d-life.js): each vehicle drives in along the
   service lane in front of the stands, stands at its door or hatch while it works, and drives back out, in the order
   real ground handling goes: stairs and ground power, the belt loader and the bags off, cleaners and catering, the
   fuel truck, the bags for the next flight, boarding, and last the pushback tug. The turnarounds themselves are
   the simulation's (s.svc on the stand, noted by the recorder as IC.recTurns).
   Also here: what an airliner is doing in plain words (IC.tailPhase), where it is (IC.tailWhere), following one
   (S.follow, the camera is main.js's), and the first landing as an event (the clock eases to 1×, the camera
   follows it in, a card gives the first fees). */
(function (IC) {
'use strict';
const U = IC.U;

IC.LIFE = {
  drive: 0.08,       // service vehicles on the apron, world units a game second (8 m/s, 29 km/h)
  firstR: 300        // the first arrival becomes an event this far out (30 km)
};

/* ---------- a turnaround's vehicles ---------- */
/* the jobs of a turnaround q ({ t0, dur, t1, kind, fuel, n, len }, record.js): one per vehicle, { key, path, ta, td,
   lag, extra }: it arrives at ta, works until td and drives away. Only the 2D map draws the jobs marked flat (the
   3D replay has no model for them yet). */
IC.turnJobs = function (q) {
  const t0 = q.t0, D = Math.max(600, q.dur), tEnd = q.t1 != null ? Math.max(q.t1, t0 + 120) : t0 + q.dur, out = [];
  const on = (key, path, ta, td, extra, lag, flat) => { if (td > ta) out.push({ key, path, ta, td, extra: extra || null, lag: lag || 0, flat: !!flat }); };
  if (q.kind === 'bus' || q.kind === 'walk') { on('stairs', 'stairsF', t0 + 25, tEnd - 90); if (q.len > 0.3) on('stairs', 'stairsR', t0 + 45, tEnd - 110); }
  if (q.kind !== 'bridge') on('gpu', 'gpu', t0 + 40, tEnd - 60);
  if (q.kind === 'cargo') {
    for (let i = 0; i < Math.min(4, q.n || 2); i++) for (let c = 0; c < 3; c++) { const ta = t0 + 120 + i * 90 + c * D * 0.28; on('lorry', i % 2 ? 'holdA' : 'holdF', ta, ta + D * 0.18); }
  } else {
    on('belt', 'beltA', t0 + 60, tEnd - 240, 'belt'); if (q.len > 0.5) on('belt', 'beltF', t0 + 70, tEnd - 250, 'belt');
    // the baggage train: the arriving bags off, then back with the departing ones
    for (let j = 0; j < 2; j++) { const ta = j ? t0 + D * 0.55 : t0 + 90, td = j ? tEnd - 300 : t0 + D * 0.25; on('bagtractor', 'bag', ta, td); for (let i = 1; i <= 3; i++) on('bagcart', 'bag', ta, td, null, i); }
    on('clean', 'clean', t0 + D * 0.18, t0 + D * 0.42, null, 0, true);
    const ct = t0 + D * 0.3; on('catering', 'cater', ct, ct + D * 0.2, 'catering');
    if (q.kind === 'bus') for (let i = 0; i < Math.min(3, q.n || 1); i++) { on('apbus', i % 2 ? 'bus1' : 'bus0', t0 + 50 + i * 25, t0 + 240 + i * 40); on('apbus', i % 2 ? 'bus1' : 'bus0', t0 + D * 0.62 + i * 30, tEnd - 400 + i * 60); }
  }
  on(q.fuel === 'hydrant' ? 'dispenser' : 'refueller', 'fuel', t0 + D * 0.45, t0 + D * 0.8);
  // the pushback tug comes to the nose and waits there (the aircraft's own move takes it from the pushback)
  on('tug', 'tug', tEnd - 420, q.t1 == null ? 1e18 : q.t1);
  return out;
};
/* a path through points, with its running length */
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + U.dist(pts[i - 1], pts[i])); return { pts, cum, len: cum[cum.length - 1] }; }
IC.lifePath = mkPath;
/* the nearest point of a building of these kinds to p (its kerb) */
function kerb(b, kinds, p) {
  let best = null, bd = 1e9;
  for (const q of b.parts) if (kinds.includes(q.kind) && q.built && q.hp > q.max * 0.25) {
    const w = q.w || (q.r || 0.1) * 2, h = q.h || (q.r || 0.1) * 2, l = IC.rectLocal(q, p), c = IC.rectWorld(q, U.clamp(l.x, -w / 2, w / 2), U.clamp(l.y, -h / 2, h / 2)), d = U.dist(c, p);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
IC.lifeKerb = kerb;
/* where each vehicle of turnaround q stands, and the way it comes there from its depot (a terminal, the fuel farm,
   the cargo shed): along the airport's service roads, then the service lane in front of the stands */
IC.turnPaths = function (b, q) {
  const a = q.a, f = { x: Math.cos(a), y: Math.sin(a) }, r = { x: -Math.sin(a), y: Math.cos(a) }, Ln = q.len, hw = Math.max(0.018, q.span * 0.055);
  const at = (fx, rx) => ({ x: q.x + f.x * fx + r.x * rx, y: q.y + f.y * fx + r.y * rx });
  const lane0 = at(Ln / 2 + 0.16, 0);
  const depot = kinds => kerb(b, kinds, lane0) || at(Ln / 2 + 0.16, 3);
  const term = depot(['terminal', 'concourse']), fuel = depot(['fuel', 'hydrant', 'terminal']), cargo = depot(['cargo', 'terminal']);
  const byRoad = {};
  // spot: where the vehicle stops; face: which way it faces then (a unit vector)
  const route = (from, spot, face, back) => {
    let way = [from];
    if (U.dist(from, lane0) > 2 && IC.svcPath) { const k = from.x.toFixed(2) + ',' + from.y.toFixed(2); if (!(k in byRoad)) byRoad[k] = IC.svcPath(b, from, lane0); if (byRoad[k]) way = byRoad[k].slice(0, -1); }
    const start = way[way.length - 1];
    const lp = { x: lane0.x + r.x * ((start.x - lane0.x) * r.x + (start.y - lane0.y) * r.y), y: lane0.y + r.y * ((start.x - lane0.x) * r.x + (start.y - lane0.y) * r.y) };
    const la = { x: lane0.x + r.x * U.clamp((spot.x - lane0.x) * r.x + (spot.y - lane0.y) * r.y, -2, 2), y: lane0.y + r.y * U.clamp((spot.x - lane0.x) * r.x + (spot.y - lane0.y) * r.y, -2, 2) };
    const app = { x: spot.x - face.x * (back || 0.12), y: spot.y - face.y * (back || 0.12) };
    return mkPath(way.concat([lp, la, app, spot]));
  };
  const toF = { x: -r.x, y: -r.y };   // from the starboard side towards the fuselage
  return {
    stairsF: route(term, at(Ln * 0.33, -hw - 0.042), r), stairsR: route(term, at(-Ln * 0.36, -hw - 0.042), r),
    gpu: route(term, at(Ln / 2 - 0.05, 0.03), { x: -f.x, y: -f.y }),
    beltA: route(term, at(-Ln * 0.2, hw + 0.043), toF), beltF: route(term, at(Ln * 0.2, hw + 0.043), toF),
    bag: route(term, at(-Ln * 0.08, hw + 0.075), { x: -f.x, y: -f.y }, 0.2),
    cater: route(term, at(-Ln * 0.38, hw + 0.05), toF),
    clean: route(term, at(Ln * 0.12, -hw - 0.06), { x: -f.x, y: -f.y }, 0.15),
    fuel: route(fuel, at(-0.02, q.span * 0.2), f),
    holdA: route(cargo, at(-Ln * 0.25, hw + 0.06), toF), holdF: route(cargo, at(Ln * 0.2, hw + 0.06), toF),
    bus0: route(term, at(Ln * 0.28, -hw - 0.13), f, 0.25), bus1: route(term, at(-Ln * 0.2, -hw - 0.13), f, 0.25),
    tug: route(term, at(Ln / 2 + 0.042, 0), { x: -f.x, y: -f.y }, 0.1),
    door: at(Ln * 0.33, -hw), term
  };
};
/* where along a path (distance d): x, y and heading into out */
function along(path, d, out) {
  const pts = path.pts, cum = path.cum;
  let i = 1; while (i < pts.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1e-6, k = U.clamp((d - cum[i - 1]) / seg, 0, 1);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.h = Math.atan2(b.y - a.y, b.x - a.x);
  return out;
}
IC.lifeAlong = along;
/* a job's vehicle at time t into out ({ x, y, h, moving, work }: work 0 → 1 while it stands at the aircraft):
   false before it sets out and after it is back */
IC.turnVehAt = function (job, path, t, out) {
  if (!path) return false;
  const Lg = path.len, dT = Lg / IC.LIFE.drive, off = job.lag * 0.036;
  if (t < job.ta - dT || t > job.td + dT) return false;
  let d, rev = false;
  if (t < job.ta) d = (t - (job.ta - dT)) * IC.LIFE.drive; else if (t <= job.td) d = Lg; else { d = Lg - (t - job.td) * IC.LIFE.drive; rev = true; }
  along(path, Math.max(0, d - off), out);
  if (rev) out.h += Math.PI;
  out.moving = t < job.ta || t > job.td;
  out.work = out.moving ? 0 : U.clamp((t - job.ta) / Math.max(1, job.td - job.ta), 0, 1);
  return true;
};
/* the turnaround's scene at time t: every vehicle that is out, in the order of the jobs ({ key, x, y, h, moving }) */
IC.turnScene = function (b, q, t) {
  const jobs = IC.turnJobs(q), P = IC.turnPaths(b, q), out = [];
  for (const j of jobs) { const o = {}; if (IC.turnVehAt(j, P[j.path], t, o)) { o.key = j.key; out.push(o); } }
  return out;
};

/* ---------- what an airliner is doing ---------- */
const VEH_WORD = { stairs: 'stairs', gpu: 'ground power', belt: 'belt loader', bagtractor: 'baggage carts', bagcart: 'baggage carts', clean: 'cleaners', catering: 'catering', refueller: 'fuel truck', dispenser: 'hydrant cart', apbus: 'buses', lorry: 'lorries', tug: 'pushback tug' };
IC.LIFE_WORDS = VEH_WORD;
const standOf = (ap, id) => ap && id ? IC.aptStands(ap).find(s => s.id === id) : null;
IC.standName = s => s ? (s.name || s.id.split('s').pop()) : '';
/* what stage a turnaround is at (f: the share of it done) */
function turnStage(T, f, kind) {
  if (T.cargo || kind === 'cargo') return f < 0.45 ? 'Unloading freight' : 'Loading freight';
  if (f < 0.2) return 'Passengers getting off';
  if (f < 0.45) return 'Cleaning and catering';
  if (f < 0.62) return 'Refuelling';
  return f < 0.8 ? 'Boarding and refuelling' : 'Boarding';
}
IC.turnStage = turnStage;
/* where it is now: { x, y, h, alt, ap, m, t, s } */
IC.tailWhere = function (S, tl) {
  if (!tl) return null;
  const ap = tl.at ? S.byId[tl.at] : null;
  if (tl.where === 'air' && tl.track && !tl.track.dead) { const t = tl.track; return { x: t.x, y: t.y, h: Math.atan2(t.vy || 0, t.vx || 1), alt: t.alt || 0, t, ap: t.toApt ? S.byId[t.toApt] : null }; }
  if (tl.mv && !tl.mv.dead) { const m = tl.mv, b = S.byId[m.ap] || ap; return { x: m.x, y: m.y, h: m.h, alt: m.alt || 0, m, ap: b }; }
  if (tl.where === 'stand' && ap) { const s = standOf(ap, tl.stand); if (s) return { x: s.x, y: s.y, h: s.a, alt: 0, s, ap }; }
  if (tl.where === 'hangar' && ap) return { x: ap.x, y: ap.y, h: 0, alt: 0, ap };
  return null;
};
/* its phase in plain words: "On final, runway 26: 6 km to go", "Taxiing to stand 4", "Boarding: 6 min left" */
IC.tailPhase = function (S, tl) {
  if (!tl) return '';
  const w = IC.tailWhere(S, tl);
  if (tl.where === 'lost') return tl.retired ? 'Retired from the fleet' : 'Lost';
  if (tl.where === 'away') return `Away: flies back in ${U.dur(Math.max(0, tl.t))}`;
  if (tl.where === 'hangar') return 'In the hangar for maintenance';
  if (!w) return '';
  if (w.t) {
    const t = w.t, to = t.toApt ? S.byId[t.toApt] : null, from = t.orig && t.orig.apt ? S.byId[t.orig.apt] : null;
    if (to && to.owner === 'us') {
      const d = U.dist(t, to);
      if (t.stk || (t.holding && !t.appr)) return `Holding near ${to.name}, waiting for its landing slot`;
      return d > 1500 ? `Flying to ${to.name}: ${U.km(d)} to go, ${IC.altText(t)}` : `Approaching ${to.name}: ${U.km(d)} out, ${IC.altText(t)}`;
    }
    if (from && U.dist(t, from) < 400) return `Climbing out from ${from.name}: ${IC.altText(t)}`;
    return `Cruising${t.plan && t.plan.b && t.plan.b.name ? ` to ${t.plan.b.name}` : ''}`;
  }
  if (w.m) {
    const m = w.m, rw = m.plan && m.plan.rw ? IC.rwEnd(m.plan.rw, m.plan.dir) : '', s = m.stand, sn = s ? IC.standName(s) : '';
    const why = m.holding && m.holdWhy ? `: ${m.holdWhy}` : '';
    if (m.kind === 'tow') return m.target && String(m.target).endsWith(':d') ? 'Under tow to the hangar' : `Under tow to stand ${sn}`;
    switch (m.phase) {
      case 'final': { const th = m.plan && m.plan.rw ? IC.rwAt(m.plan.rw, m.plan.dir > 0 ? 0 : 1) : null; return `On final, runway ${rw}${th ? `: ${U.km(U.dist(m, th))} to go` : ''}`; }
      case 'land': return `Touching down on runway ${rw}`;
      case 'rollout': return 'Landing roll: slowing down';
      case 'parkin': return `Parking on stand ${sn}`;
      case 'start': case 'wait': return m.kind === 'dep' ? `Ready at stand ${sn}, waiting to push back${why}` : 'Waiting';
      case 'push': return `Pushing back from stand ${sn}`;
      case 'svc': return `Stopped at the ${m.via && m.via[0] ? m.via[0].what : 'service'} pad`;
      case 'hold': return `Holding short of runway ${rw}${why}`;
      case 'lineup': return `Lining up on runway ${rw}`;
      case 'roll': return `Taking off from runway ${rw}`;
      case 'stranded': return 'Stranded: no way to taxi';
      default: return m.kind === 'arr' ? `Taxiing to stand ${sn}${m.holding ? ', waiting' + why : ''}` : `Taxiing to runway ${rw}${m.holding ? ', waiting' + why : ''}`;
    }
  }
  if (w.s) {
    const sv = w.s.svc, sn = IC.standName(w.s);
    if (tl.t <= 0) return `Ready at stand ${sn}: waiting for its departure slot`;
    const f = sv && sv.tail === tl.id ? U.clamp((S.time - sv.t0) / Math.max(60, sv.dur), 0, 1) : 0.5;
    return `${turnStage(tl.T, f, sv && sv.kind)}: ${U.dur(tl.t)} left`;
  }
  return '';
};
/* the turnaround on a stand now: what is done, what is at work and what is to come, for the panel */
IC.turnNow = function (S, ap, s) {
  const R = S.rec; if (!R || !s || !s.occ) return null;
  const q = R.turns.find(x => x.ap === ap.id && x.sid === s.id && x.t1 == null && x.tail === s.occ); if (!q) return null;
  const done = [], now = [], next = [], seen = new Set();
  for (const j of IC.turnJobs(q)) {
    const w = VEH_WORD[j.key]; if (!w || seen.has(w + (S.time > j.td ? 'd' : S.time >= j.ta ? 'n' : 'x'))) continue;
    seen.add(w + (S.time > j.td ? 'd' : S.time >= j.ta ? 'n' : 'x'));
    (S.time > j.td ? done : S.time >= j.ta ? now : next).push(w);
  }
  const uniq = L => L.filter((x, i) => L.indexOf(x) === i);
  return { q, f: U.clamp((S.time - q.t0) / Math.max(60, q.dur), 0, 1), left: Math.max(0, q.t0 + q.dur - S.time), done: uniq(done).filter(x => !now.includes(x) && !next.includes(x)), now: uniq(now), next: uniq(next).filter(x => !now.includes(x)) };
};

/* ---------- following an airliner ---------- */
/* S.follow = { tl: tail id, auto }: the camera stays with it (main.js) from final to the gate and back out; auto
   when the game started it (the first landing), so it may zoom by phase */
IC.followStart = function (S, tl, auto) { if (!tl) return false; S.follow = { tl: tl.id, auto: !!auto, t: S.time }; IC.emit(S, 'follow', { tl, auto: !!auto }); return true; };
IC.followStop = function (S) { S.follow = null; };
IC.followTail = S => S.follow && S.av ? S.av.tails.find(x => x.id === S.follow.tl) || null : null;
/* is it still worth following? '' or why it ends */
IC.followEnds = function (S) {
  const tl = IC.followTail(S); if (!tl) return 'It is no longer in the fleet.';
  if (tl.where === 'lost') return `${tl.cs} is lost.`;
  if (tl.where === 'away') return `${tl.cs} has left for its destination.`;
  if (tl.where === 'hangar') return `${tl.cs} is in the hangar for maintenance.`;
  const w = IC.tailWhere(S, tl);
  if (!w) return `${tl.cs} is out of sight.`;
  if (w.t && !(w.t.toApt && S.byId[w.t.toApt] && S.byId[w.t.toApt].owner === 'us')) { const from = w.t.orig && w.t.orig.apt ? S.byId[w.t.orig.apt] : null; if (!from || U.dist(w.t, from) > 300) return `${tl.cs} has climbed away to its destination.`; }
  return '';
};

/* ---------- the first landing is an event ---------- */
/* in the Career, the first airliner bound for one of our airports and 30 km out: the clock eases to 1× (Wait and
   skip stop), the camera follows it in; once parked, a card with its fees. Once a game. */
IC.firstLandingTick = function (S) {
  if (S.mode !== 'story' || !S.story || !S.av || !(IC.FOCUS && IC.FOCUS.firstLanding)) return;
  const st = S.story, F = S.first || null;
  if (F || st.cnt.parked > 0) return;
  for (const t of S.threats) {
    const tl = t.tail; if (!tl || t.dead || !t.toApt) continue;
    const ap = S.byId[t.toApt]; if (!ap || ap.owner !== 'us' || U.dist(t, ap) > IC.LIFE.firstR) continue;
    S.first = { tl: tl.id, ap: ap.id, t: S.time, was: S.speed };
    if (S.speed > 1) S.speed = 1;
    S.skip = false; if (S.wait) IC.waitStop(S, `${tl.cs}, the first airliner, is on its way in to ${ap.name}`);
    IC.followStart(S, tl, true);
    IC.log(S, 'info', 'APT', `${tl.cs}, the first airliner, is ${U.km(U.dist(t, ap))} out from ${ap.name}. Time runs at 1× so you can watch it land, taxi and park.`, t);
    IC.emit(S, 'firstArrival', { tl, ap, t });
    return;
  }
};
/* parked: the card with the first takings, put where it does not cover the airport */
IC.on((S, type, d) => {
  if (type !== 'tailParked' || !S.first || S.first.done || !S.camp || d.tl.id !== S.first.tl) return;
  const tl = d.tl, ap = d.ap, P = tl.paid || {}, al = IC.avAirline ? IC.avAirline(S, tl.al) : null, s = standOf(ap, tl.stand);
  S.first.done = S.time;
  const total = (P.land || 0) + (P.pf || 0) + (P.cg || 0);
  const what = [P.land ? `${U.money(P.land)} landing fee` : '', P.pf ? `${U.money(P.pf)} for its ${P.pax} passengers` : '', P.cg ? `${U.money(P.cg)} for its freight` : ''].filter(Boolean).join(' and ');
  IC.card(S, 'The first landing', `${tl.cs} · ${al ? al.name : ''} · stand ${IC.standName(s)}`,
    `It paid ${U.money(total)}${what ? `: ${what}` : ''}. Every landing pays like this, and the turnaround you can watch now (bags, fuel, catering, boarding) decides how soon the stand is free for the next. More stands, a quick turnaround and happy airlines bring more flights.`,
    'moment', { at: { x: ap.x, y: ap.y }, follow: tl.id });
});

})(window.IC);
