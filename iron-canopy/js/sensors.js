/* Iron Canopy — sensors and identification.
   Radars paint a target only when the beam sweeps past it; between paints the track coasts on its last plot.
   What a track *is* builds up in stages: detected → classified (type) → identified (friend, civil, hostile).
   VHF radars only detect. Radars with IFF read transponders and check them against filed flight plans.
   Type recognition (NCTR) works inside a shorter range. Fighters can fly up and look. Behaviour gives the rest away. */
(function (IC) {
'use strict';
const U = IC.U;
const TAU = Math.PI * 2;

IC.classOf = t => t.d.cls === 'bal' ? (t.alt >= 90 ? 'mid' : 'bal') : t.d.cls;
IC.powerFactor = S => 1 - 0.08 * S.infra.filter(i => i.kind === 'power' && i.offline).length;
IC.isIded = t => t.aff === 'H' || t.aff === 'N';

function buildSensors(S) {
  const L = [];
  const eccmT = IC.hasTech(S, 'e_eccm') ? 0.3 : 0;
  const nctrK = IC.hasTech(S, 's_nctr') ? 1.5 : 1;
  const grid = IC.powerFactor(S), wx = IC.wx(S);
  for (const u of S.units) {
    if (u.state !== 'ready') continue;
    const d = u.d, rq = IC.ok(u, 'radar');
    if (d.sensor && (d.sensor.passive || u.radarOn)) {
      const s = d.sensor;
      if (!u.phase) u.phase = Math.random() * TAU;
      const R = s.R * (s.passive ? 1 : grid) * (0.4 + 0.6 * rq) * (s.acou ? (wx.precip > 0.5 ? 0.6 : 1) : 1);
      L.push({ x: u.x, y: u.y, R, mast: s.mast, q: s.q, vhf: s.vhf, bmdOnly: s.bmdOnly, disc: s.disc,
        esm: s.esm, acou: s.acou, cbr: s.cbr, rktOnly: s.rktOnly, passive: s.passive, eccm: (s.eccm || 0) + eccmT,
        per: s.per || 1, rot: !!s.rot, phase: u.phase, err: (s.err || 0) * (rq < 0.6 ? 2 : 1), unit: u, emits: !s.passive,
        idc: s.idc, nctrR: (s.nctrR || 0) * nctrK, alt3d: s.alt3d, ssr: s.ssr, band: IC.BAND[u.type] });
    }
    if (d.fc && (d.fc.passive || u.radarOn)) {
      const f = d.fc;
      L.push({ x: u.x, y: u.y, R: f.R * (f.passive ? wx.eo : grid * (0.4 + 0.6 * rq)), mast: f.mast, q: 'fc', bmdOnly: f.bmdOnly, disc: f.disc, eo: f.passive,
        eccm: eccmT + (f.bmdOnly ? 0.5 : 0.1), per: 0.5, rot: false, err: 0, unit: u, org: true, emits: !f.passive,
        idc: f.passive ? 'eo' : f.nctr ? 'nctr' : 'iff', nctrR: (f.nctr || 0) * nctrK, alt3d: true });
    }
  }
  // airport approach radars see everything near the field and read transponders
  for (const ap of IC.bases(S)) {
    if (!ap.parts || ap.owner !== 'us') continue;
    for (const p of ap.parts) {
      if (p.kind !== 'atc' || !p.built || p.hp <= p.max * 0.25) continue;
      if (p.phase == null) p.phase = Math.random() * TAU;
      L.push({ x: p.x, y: p.y, R: 450 * grid, mast: 18, q: 'surv', per: 4.8, rot: true, phase: p.phase, err: 1.5, emits: true, idc: 'iff', alt3d: true, band: 'S', part: p, ap });
    }
  }
  // radars on the same band close together interfere unless the spectrum is planned
  const plan = S.flags && S.flags.spectrum ? 0.4 : 1;
  for (const u of S.units) { u.intf = 0; u.intfF = 1; }
  for (const s of L) {
    if (!s.band || s.passive) continue;
    let n = 0;
    for (const o of L) if (o !== s && o.band === s.band && !o.passive && U.dist(o, s) < 700) n++;
    if (!n) continue;
    const f = Math.max(0.6, 1 - 0.1 * n * plan);
    s.R *= f; s.err = (s.err || 0) * (1 + 0.4 * n * plan);
    if (s.unit) { s.unit.intf = n; s.unit.intfF = f; }
  }
  for (const a of S.air) {
    if (a.dead || a.gnd) continue;
    if (a.kind === 'aew') { if (!a.phase) a.phase = Math.random() * TAU; L.push({ x: a.x, y: a.y, R: 3200, mast: Math.max(1000, a.alt * 1000), q: 'fc', eccm: 0.3 + eccmT, per: 12, rot: true, phase: a.phase, err: 3, air: a, emits: true, idc: 'nctr', nctrR: 1000 * nctrK, alt3d: true }); }
    // a fighter's own radar looks down poorly: low fliers hide in the ground clutter beyond a short range
    else if (a.kind === 'ftr') L.push({ x: a.x, y: a.y, R: 700, mast: Math.max(100, a.alt * 1000), q: 'surv', air: a, emits: true, eyes: 22 * wx.eo, per: 1, rot: false, err: 4, idc: 'nctr', nctrR: 300 * nctrK, alt3d: true, lowR: 120 });
    else if (a.kind === 'ucav' || a.kind === 'isr') L.push({ x: a.x, y: a.y, R: 150 * wx.eo, mast: 2000, q: 'surv', air: a, eyes: 150 * wx.eo, per: 1, rot: false, err: 3, eo: true, idc: 'eo', alt3d: true });
  }
  return L;
}

function detects(s, t) {
  const d = t.d, r = Math.hypot(s.x - t.x, s.y - t.y);
  // nothing is seen beyond three times a sensor's reach (the largest airliner's echo stretches it 2.8 times): most pairs end here
  if (r > s.R * 3) return false;
  if (s.bmdOnly && !(d.cls === 'bal' || d.cls === 'hgv')) return false;
  if (s.rktOnly && d.cls !== 'rkt') return false;
  if (s.esm) return ((d.emits && t.radarOn !== false) || (d.jam && t.jamming)) && r <= s.R * (d.jam ? 1.25 : 1);
  if (s.acou) return (d.cls === 'drone' || d.cls === 'cm' || d.cls === 'ga') && t.alt < 3 && (t.spd || 0) < 3 && r <= s.R;
  if (s.eo) return r <= s.R && t.alt < 6;
  if (r > U.horizon(s.mast, t.alt)) return false;
  if (s.lowR && t.alt < 1 && r > s.lowR) return false;
  // radars on the ground, civil and military: high ground hides low aircraft (airspace.js)
  if (!s.air && r > 1 && IC.aspHidden(s, t)) return false;
  // a secondary radar only hears transponders
  if (s.ssr) return !!t.sq && !t.sqOff && r <= s.R;
  let rcs = t.rcs, jf = 1, burn = 1e9;
  // noise jamming: along a jammer's bearing the radar only sees what is close enough to burn through, about a
  // third of the way to the jammer; off the bearing it loses a little
  if (s.jams) for (const J of s.jams) {
    if (J.j === t) { if (r > J.d * 0.3 * (1 + (s.eccm || 0))) return false; continue; }
    const dA = Math.abs(U.angWrap(Math.atan2(t.y - s.y, t.x - s.x) - J.a));
    if (dA < J.w) burn = Math.min(burn, J.d * 0.3 * (1 + (s.eccm || 0)) / (J.j.d.jam || 1));
    else jf *= 1 - 0.12 * J.k;
  }
  if (s.vhf && rcs < 0.05 && d.cls === 'air') rcs *= 40;
  // notching: a target flying side-on to a pulse-doppler radar sinks into the ground clutter
  if (t.notchT > 0 && !s.vhf && U.clamp(Math.abs(Math.cos(Math.atan2(t.y - s.y, t.x - s.x) - Math.atan2(t.vy, t.vx))), 0, 1) < 0.35 && Math.random() < (s.eccm > 0.35 ? 0.35 : 0.6)) return false;
  const f = Math.pow(rcs, 0.25);
  return r <= Math.min(s.R * f * jf, burn * f);
}
IC.detects = detects;

IC.updateEmcon = function (S, dt) {
  for (const u of S.units) {
    if (u.ambushT > 0) u.ambushT -= dt;
    if (!u.emitter || u.state !== 'ready' || IC.ok(u, 'power') < 0.35 || IC.ok(u, 'radar') < 0.2) { u.radarOn = false; continue; }
    u.radarOn = u.emcon === 'on' || (u.emcon === 'ambush' && u.ambushT > 0);
  }
};

function plot(S, t, s) {
  const e = s.err || 0;
  const firstPlot = !t.pt;
  t.rx = t.x + (e ? U.gauss() * e : 0); t.ry = t.y + (e ? U.gauss() * e : 0);
  if (firstPlot) { t.px = t.rx; t.py = t.ry; }
  t.pvx = t.vx; t.pvy = t.vy;
  t.pt = S.time; t.perr = e; t.pper = s.per || 1;
  t.holdUntil = Math.max(t.holdUntil || 0, S.time + Math.max(2.5, s.per * 1.6));
  if (!t.trail) t.trail = [];
  if (!t.trailT || S.time - t.trailT > 4) { t.trail.push({ x: t.rx, y: t.ry }); if (t.trail.length > 8) t.trail.shift(); t.trailT = S.time; }
  t.blip = 1;
  t.plots = (t.plots || 0) + 1;
  if (firstPlot) t.flash = 1;
}

/* ---------- steady tracks ----------
   The player sees tracks, not plots. Between plots a track coasts on its last speed and heading, and each new plot
   pulls it part of the way back, so the symbol glides instead of jumping. With no plot for a while the track keeps
   coasting (still selectable) with a growing ellipse of where the aircraft could be; after its coast time it is lost.
   t.det: fresh enough to shoot at. t.held: shown and selectable. t.px, t.py: the track's position. */
IC.TRACK = { coast: { air: 150, ga: 150, heli: 120, drone: 120, cm: 60, arm: 30, bal: 40, hgv: 40, rkt: 15 }, lostShow: 60, groupR: 150 };
IC.coastT = t => IC.TRACK.coast[t.d.cls] || 40;
function steady(S, t, dt) {
  if (!t.pt) { t.held = false; return; }
  if (t.svx == null) { t.px = t.rx; t.py = t.ry; t.svx = t.pvx || 0; t.svy = t.pvy || 0; t.cx = t.cy = 0; }
  else {
    t.px += t.svx * dt; t.py += t.svy * dt;
    if (t.pt === S.time) {
      // a fresh plot: half of the difference is worked in over the next seconds; far outside the track's error, jump
      const ex = t.rx - t.px, ey = t.ry - t.py;
      if (ex * ex + ey * ey > Math.pow(5 * (t.perr || 1) + 25, 2)) { t.px = t.rx; t.py = t.ry; t.cx = t.cy = 0; }
      else { t.cx = ex * 0.5; t.cy = ey * 0.5; }
      t.svx = t.pvx || 0; t.svy = t.pvy || 0;
    }
    if (t.cx || t.cy) { const f = Math.min(1, dt / 2.5); t.px += t.cx * f; t.py += t.cy * f; t.cx *= 1 - f; t.cy *= 1 - f; if (Math.abs(t.cx) + Math.abs(t.cy) < 0.05) t.cx = t.cy = 0; }
  }
  const age = S.time - t.pt;
  t.coast = !t.det;
  t.held = !!t.tn && (t.det || age < IC.coastT(t));
  // how far it could be from the coasted position: radar error plus a turn it may have made since
  const sp = Math.hypot(t.svx, t.svy);
  t.unc = (t.perr || 0) + sp * Math.max(0, age - (t.pper || 1) * 1.2) * 0.35;
}
IC.trackUnc = t => ({ along: (t.unc || 0) * 1.5, across: t.unc || 0, a: Math.atan2(t.svy || t.vy || 0, t.svx || t.vx || 1) });

/* raids fly together: tracks close to each other on the same heading and speed are one group. Groups are rebuilt
   every few seconds, so they split when the aircraft split. A group is named after its lowest track number. */
// a raid is as hostile as its most hostile member
const grpAff = m => m.some(t => t.aff === 'H') ? 'H' : m.some(t => t.aff === 'S') ? 'S' : 'U';
function groupTracks(S) {
  const L = S.threats.filter(t => t.held && !t.dead && t.aff !== 'N' && t.aff !== 'A' && !t.decoyKnown &&
    (t.d.cls === 'air' || t.d.cls === 'drone' || t.d.cls === 'cm' || t.d.cls === 'heli'));
  const par = L.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const R = IC.TRACK.groupR, cell = new Map(), key = (x, y) => Math.floor(x / R) * 65536 + Math.floor(y / R);
  L.forEach((t, i) => { const k = key(t.px, t.py); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  L.forEach((t, i) => {
    const cx = Math.floor(t.px / R), cy = Math.floor(t.py / R), s1 = Math.hypot(t.svx, t.svy);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of cell.get((cx + dx) * 65536 + cy + dy) || []) {
      if (j <= i) continue;
      const o = L[j], s2 = Math.hypot(o.svx, o.svy);
      if ((t.aff === 'H') !== (o.aff === 'H') || U.dxy(t.px, t.py, o.px, o.py) > R) continue;
      if (Math.abs(s1 - s2) > 0.3 * Math.max(s1, s2) || Math.abs(U.angWrap(Math.atan2(t.svy, t.svx) - Math.atan2(o.svy, o.svx))) > 0.6) continue;
      par[find(i)] = find(j);
    }
  });
  const by = new Map();
  L.forEach((t, i) => { const r = find(i); (by.get(r) || by.set(r, []).get(r)).push(t); });
  for (const t of S.threats) t.grp = null;
  S.tgroups = [];
  for (const m of by.values()) {
    if (m.length < 2) continue;
    m.sort((a, b) => a.tn - b.tn);
    const g = { id: 'G' + m[0].tn, lead: m[0], members: m, n: m.length, aff: grpAff(m) };
    for (const t of m) t.grp = g;
    S.tgroups.push(g);
  }
}
IC.groupTracks = groupTracks;
IC.groupBox = g => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const t of g.members) { x0 = Math.min(x0, t.px); y0 = Math.min(y0, t.py); x1 = Math.max(x1, t.px); y1 = Math.max(y1, t.py); } return { x0, y0, x1, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; };

/* ---------- the air picture ----------
   Every track that is not a known friend or airliner, one row per group, most dangerous first: hostile before
   suspect before unknown, then by the time until it reaches what it is heading for. */
const TIER = { H: 0, S: 1, U: 2 };
function timeToTarget(S, t) {
  if (t.aff === 'H' && !t.d.civil && (t.x1 != null || t.aim) && (t.d.cls !== 'air' || !t.home)) {
    const ax = t.x1 != null ? t.x1 : t.aim.x, ay = t.y1 != null ? t.y1 : t.aim.y;
    const named = t.target && t.target.name && U.dxy(t.target.x, t.target.y, ax, ay) < 60 ? t.target.name : IC.bases(S).concat(IC.cities(S)).find(p => U.dxy(p.x, p.y, ax, ay) < 60);
    return { t: IC.timeToImpact(t), to: typeof named === 'string' ? named : named ? named.name : IC.nearestPlace(S, ax, ay) };
  }
  const sp = Math.hypot(t.svx || 0, t.svy || 0);
  if (sp < 0.05) return { t: Infinity, to: '' };
  const ux = t.svx / sp, uy = t.svy / sp;
  let best = null, bt = Infinity;
  const look = p => {
    const dx = p.x - t.px, dy = p.y - t.py, along = dx * ux + dy * uy;
    if (along <= 0 || along > 6000) return;
    if (Math.abs(dx * uy - dy * ux) > Math.max(120, along * 0.2)) return;
    const tt = along / sp; if (tt < bt) { bt = tt; best = p; }
  };
  for (const c of IC.cities(S)) look(c);
  for (const b of IC.bases(S)) if (b.owner === 'us' || b.kind === 'airbase') look(b);
  return best ? { t: bt, to: best.name } : { t: Infinity, to: '' };
}
IC.timeToTarget = timeToTarget;
IC.airPicture = function (S) {
  const rows = [], seen = new Set();
  for (const t of S.threats) {
    if (!t.held || t.dead || t.aff === 'N' || t.aff === 'A' || t.decoyKnown) continue;
    if (t.d.cls === 'rkt') continue;
    const g = t.grp;
    if (g) { if (seen.has(g)) continue; seen.add(g); }
    const lead = g ? g.lead : t;
    if (!lead.ttT || S.time - lead.ttT > 3) { lead.tt = timeToTarget(S, lead); lead.ttT = S.time; }
    const aff = g ? g.aff : t.aff || 'U';
    rows.push({ t: lead, g, n: g ? g.n : 1, aff, tti: lead.tt.t, to: lead.tt.to, inside: IC.inHome(lead.px, lead.py) });
  }
  rows.sort((a, b) => (TIER[a.aff] - TIER[b.aff]) || (a.tti - b.tti) || (b.inside - a.inside) || (a.t.tn - b.t.tn));
  return rows;
};
/* the next or previous hostile (or, with none, anything not friendly) in the air picture */
IC.cycleTrack = function (S, dir) {
  const rows = IC.airPicture(S), hot = rows.filter(r => r.aff === 'H' && !r.t.border), L = hot.length ? hot : rows;
  if (!L.length) return null;
  const cur = S.sel && S.sel.kind === 'track' ? S.sel.ref : null;
  let i = L.findIndex(r => r.t === cur || (r.g && cur && cur.grp === r.g));
  i = i < 0 ? (dir > 0 ? 0 : L.length - 1) : (i + dir + L.length) % L.length;
  return L[i].t;
};

/* ---------- electronic warfare ----------
   A noise jammer floods a radar along its own bearing. The radar still sees what is close enough to burn through,
   sees normally off that bearing, and gets a strobe: the jammer's direction, but not its range. Two radars far
   enough apart put their strobes across each other and the jammer is located. Radars with better ECCM suffer less. */
IC.JAM_R = t => t.d.jamR || 3600;
function jamSensor(S, s, jammers) {
  for (const j of jammers) {
    const d = U.dist(s, j), JR = IC.JAM_R(j);
    if (d > JR) continue;
    const k = Math.min(0.95, Math.sqrt(1 - d / JR) * (j.d.jam || 1) * (1 - Math.min(0.9, s.eccm || 0)));
    if (k < 0.05) continue;
    const a = Math.atan2(j.y - s.y, j.x - s.x), w = 0.06 + 0.12 * k;
    (s.jams = s.jams || []).push({ j, a, k, w, d });
    S.strobes.push({ x: s.x, y: s.y, a, k, w, j, unit: s.unit, part: s.part, R: s.R });
    if (s.unit) { s.unit.jamF = Math.min(s.unit.jamF, 1 - 0.85 * k); (s.unit.jammers = s.unit.jammers || []).push(j); }
    // jamming our radars is a hostile act: the strobe says what it is, if not where
    if (j.aff !== 'H') { j.klass = 'jammer'; setAff(S, j, 'H', 'jamming our radars'); }
  }
}
/* strobes from two radars at a good angle cross on the jammer */
function locateJammers(S) {
  const by = new Map();
  for (const st of S.strobes) { const L = by.get(st.j) || []; L.push(st); by.set(st.j, L); }
  for (const [j, L] of by) {
    j.strobed = S.time;
    let fix = false;
    for (let i = 0; i < L.length && !fix; i++) for (let k = i + 1; k < L.length; k++) {
      const cut = Math.abs(U.angWrap(L[i].a - L[k].a));
      if (cut > 0.26 && cut < Math.PI - 0.26 && U.dist(L[i], L[k]) > 150) { fix = true; break; }
    }
    if (fix && (!j.pt || S.time - j.pt > 6)) { plot(S, j, { per: 6, err: 12 }); j.triT = S.time; }
  }
}

/* is this flight where its filed plan says it should be? */
function onPlan(S, t) {
  if (!t.plan) return false;
  return IC.offRoute(t) < 220;
}
function setAff(S, t, aff, why) {
  if (t.aff === aff) return;
  const was = t.aff;
  t.aff = aff; t.affWhy = why; t.affT = S.time;
  t.ided = aff === 'H' || aff === 'N';
  if (t.grp) t.grp.aff = grpAff(t.grp.members);
  if (!t.tn || t.d.civil && aff !== 'S' && aff !== 'H') return;
  if (aff === 'H' && t.d.cls === 'air' && !t.border) IC.log(S, 'id', 'ID', `TN ${t.tn} identified HOSTILE: ${IC.KLASS[t.klass] || t.d.name}${why ? ' (' + why + ')' : ''}.`, t);
  else if (aff === 'S' && (was === 'A' || was === 'N')) IC.log(S, 'warn', 'SUSPECT', `TN ${t.tn} ${t.sq ? 'squawking ' + t.sq : ''} is now SUSPECT: ${why}.`, t);
  if (aff === 'H' && t.disguise) { IC.emit(S, 'unmasked', t); IC.log(S, 'warn', 'DECEPTION', `TN ${t.tn} was posing as airliner ${t.cs}. It is a ${IC.THR[t.type].name.toLowerCase()}.`, t); }
  IC.emit(S, 'aff', t);
}
IC.setAff = setAff;

IC.sense = function (S, dt) {
  const L = S.sensors = buildSensors(S);
  const jammers = S.threats.filter(t => t.d.jam && !t.dead && t.jamming);
  for (const u of S.units) { u.jamF = 1; u.jammers = null; }
  S.strobes = [];
  for (const s of L) {
    s.jams = null;
    if (s.rot) { s.a1 = s.phase + TAU * S.time / s.per; s.a0 = s.a1 - TAU * dt / s.per; }
    else s.tick = s.per <= dt + 1e-6 || Math.floor(S.time / s.per) !== Math.floor((S.time - dt) / s.per);
    if (s.emits && jammers.length && !s.air) jamSensor(S, s, jammers);
  }
  locateJammers(S);
  const sat = IC.hasTech(S, 's_sat');
  for (const t of S.threats) {
    if (t.dead) continue;
    const wasDet = t.det;
    t.fcBy.length = 0; t.vis = false; t.inView = false;
    let nctr = 0, iff = false;
    for (const s of L) {
      if (!detects(s, t)) continue;
      t.inView = true;
      const r = U.dist(s, t);
      if (s.eo || (s.eyes && r < s.eyes)) t.vis = true;
      if (s.org) t.fcBy.push(s.unit.id);
      if (s.unit && (t.aff === 'H' || t.aff === 'S')) s.unit.alertT = S.time;
      let painted;
      if (s.rot) { const b = Math.atan2(t.y - s.y, t.x - s.x); painted = U.mod(b - s.a0, TAU) <= U.mod(s.a1 - s.a0, TAU) + 1e-9; }
      else painted = s.tick;
      if (s.idc === 'nctr' && r < s.nctrR) nctr = Math.max(nctr, (s.org ? 0.12 : 0.08) * (r < s.nctrR * 0.5 ? 1.6 : 1));
      if (!painted) continue;
      plot(S, t, s);
      if (s.q === 'fc') t.fcUntil = S.time + Math.max(2.5, s.per * 1.15);
      if (s.alt3d) t.altT = S.time;
      if (s.idc === 'iff' || s.idc === 'nctr') iff = true;
      if (s.disc) t.discT = S.time;
      if (s.esm && t.d.mil) { t.klass = t.d.jam ? 'jammer' : t.d.klass; setAff(S, t, 'H', 'military radar emissions'); }
      if (s.acou && !t.klass) t.klass = t.d.cls === 'cm' ? 'cm' : t.d.cls === 'ga' ? 'light' : 'drone';
      if (s.cbr && t.src && !t.cbrDone) { t.cbrDone = true; IC.revealLauncher(S, t.src, 'counter-battery radar'); }
      if (s.air && s.air.kind === 'ftr') t.airSeen = S.time;
    }
    t.satOnly = false;
    if (sat && t.d.cls === 'bal' && !t.d.pen && t.age < 240 && !t.inView) {
      t.satOnly = true;
      if (!t.pt || S.time - t.pt > 20) plot(S, t, { per: 20, err: 30 });
    }
    t.det = !!t.pt && S.time <= t.holdUntil;
    t.fc = S.time < (t.fcUntil || -1);
    t.disc = S.time - (t.discT || -1e9) < 5;
    t.altKnown = S.time - (t.altT || -1e9) < 120;
    if (t.inView || t.satOnly) identify(S, t, dt, nctr, iff);
    if (t.det) {
      t.lost = 0;
      if (!t.tn) { t.tn = S.nextTN++; t.firstDet = S.time; t.firstIn = IC.inHome(t.x, t.y); onNewTrack(S, t); }
    } else if (t.tn) t.lost += dt;
    steady(S, t, dt);
    if (t.blip > 0) t.blip = Math.max(0, t.blip - dt * 0.6);
    if (!wasDet && t.det && t.tn && !t.held0) t.flash = 1;
    t.held0 = t.held;
  }
  S.grpT = (S.grpT || 0) - dt;
  if (S.grpT <= 0) { S.grpT = 3; groupTracks(S); }
};

function identify(S, t, dt, nctr, iff) {
  const c = t.d.cls;
  // trajectories that give themselves away
  if (c === 'bal' || c === 'hgv' || c === 'rkt' || c === 'arm') {
    if ((t.plots || 0) >= 2 || t.satOnly) { t.klass = t.klass || t.d.klass; if (c !== 'bal' || t.disc || t.alt < 60 || !t.d.pen) setAff(S, t, 'H', 'trajectory'); }
    return;
  }
  if (c === 'cm' && t.altKnown && (t.plots || 0) >= 3) { t.klass = 'cm'; setAff(S, t, 'H', 'low and fast'); return; }
  // a pilot has seen it: that stands until something new happens (a weapon release sets hostile directly)
  if (t.seenAs && !t.vis) return;
  // eyes on: definitive
  if (t.vis) {
    t.seenAs = t.d.decoy ? 'D' : t.d.civil ? 'N' : 'H';
    t.klass = t.d.decoy ? 'decoy' : t.d.klass;
    if (t.d.decoy) { t.decoyKnown = true; setAff(S, t, 'H', 'decoy'); }
    else setAff(S, t, t.d.civil ? 'N' : 'H', 'visual identification');
    return;
  }
  // type recognition from radar returns
  if (nctr > 0 && t.klass == null) {
    t.idp = (t.idp || 0) + dt * nctr;
    if (t.idp >= 1) {
      t.klass = t.d.klass;
      if (t.d.decoy && Math.random() < 0.5) { t.klass = 'decoy'; t.decoyKnown = true; }
      if (t.tn && !t.d.civil) IC.log(S, 'id', 'NCTR', `TN ${t.tn} recognised as ${(IC.KLASS[t.klass] || t.klass).toLowerCase()}.`);
    }
  }
  if (t.klass) {
    if (t.klass === 'airliner' || t.klass === 'light') {
      if (t.sqSeen && (onPlan(S, t) || t.type === 'ga')) setAff(S, t, 'N', 'type and flight plan match');
      else if (t.aff !== 'H') setAff(S, t, t.klass === 'light' ? 'U' : 'S', 'airliner without a matching plan');
    } else if (t.klass === 'decoy') setAff(S, t, 'H', 'decoy');
    else setAff(S, t, 'H', `${(IC.KLASS[t.klass] || t.klass).toLowerCase()} recognised`);
    if (t.aff === 'N' && t.disguise) setAff(S, t, 'H', 'military aircraft');
    return;
  }
  // transponders and flight plans
  if (iff) {
    t.sqSeen = !!t.sq;
    if (t.sq) {
      if (onPlan(S, t) || (t.type === 'ga' && t.sq === '7000')) { if (t.aff === 'U' || !t.aff) setAff(S, t, 'A', 'transponder matches flight plan'); }
      else if (t.aff === 'A' || t.aff === 'U' || !t.aff) setAff(S, t, 'S', t.plan ? 'off its filed route' : 'no flight plan on file');
    } else if (!t.aff || t.aff === 'U') {
      const inbound = IC.inHome(t.x, t.y) || IC.inHome(t.x + t.vx * 600, t.y + t.vy * 600);
      if (inbound && ((t.plots || 0) >= 2) && (t.spd > 1 || !t.firstIn || t.fromHostile)) setAff(S, t, 'S', 'no transponder');
      else if (!t.aff) t.aff = 'U';
    }
  } else if (!t.aff) t.aff = 'U';
  // behaviour: hostile tracks crossing in from hostile airspace at speed
  if (t.aff === 'S' && t.fromHostile && t.spd > 1.5 && IC.inHome(t.x, t.y) && t.d.mil && (t.plots || 0) > 6 && !t.disguise) setAff(S, t, 'H', 'crossed the border without clearance');
}

/* an aircraft that releases weapons is hostile, whatever it squawks */
IC.weaponRelease = function (S, t) {
  if (t.dead) return;
  const first = !t.released;
  t.released = true;
  if (t.det || t.inView) setAff(S, t, 'H', 'weapons release');
  if (first) IC.emit(S, 'weaponRelease', t);
};

function onNewTrack(S, t) {
  const c = t.d.cls;
  if (t.d.civil) return;
  IC.sfx && IC.sfx.contact(t);
  IC.emit(S, 'track', t);
  if (c === 'bal' && !t.d.pen) {
    IC.log(S, 'leak', 'BALLISTIC', `TN ${t.tn} ballistic missile in flight${t.satOnly ? ' (satellite cue)' : ''}.`, t);
    IC.sfx && IC.sfx.klaxon();
    IC.emit(S, 'ballistic', t);
  } else if (c === 'hgv') {
    IC.log(S, 'leak', 'HYPERSONIC', `TN ${t.tn} hypersonic glide vehicle detected.`, t);
    IC.sfx && IC.sfx.klaxon();
    IC.emit(S, 'ballistic', t);
  } else if (c === 'arm') {
    IC.log(S, 'leak', 'ARM', `TN ${t.tn} anti-radiation missile inbound on ${t.target ? t.target.name : 'unknown'}.`, t);
    IC.emit(S, 'arm', t);
  } else if (c === 'air' && !t.border && !t.disguise) IC.log(S, 'id', 'TRACK', `TN ${t.tn} new air track ${U.compass(Math.atan2(t.vy, t.vx))}-bound, ${IC.nearestPlace(S, t.x, t.y)}.`);
  else if (c === 'cm') IC.log(S, 'id', 'TRACK', `TN ${t.tn} low fast track near ${IC.nearestPlace(S, t.x, t.y)}.`);
  else if (c === 'rkt' && Math.random() < 0.3) IC.log(S, 'leak', 'ROCKETS', `Rocket fire detected near ${IC.nearestPlace(S, t.x, t.y)}.`);
}

})(window.IC);
