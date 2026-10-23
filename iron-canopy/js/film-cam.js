/* Iron Canopy — the film camera's maths (brief 58), headless: where a shot puts the overhead camera at a moment, and
   the director that picks the next shot from what the simulation is about to do. film.js (browser) drives the map's
   camera with these; the tests call them in Node.
   A shot: { kind, t0, dur, ... } in film seconds (real seconds on the page's clock).
   - hold:  at {x, y}, zoom z, drifting by drift {x, y} (world units over the whole shot)
   - push:  at {x, y}, zoom from z to z1 (a push in when z1 > z, a pull out when smaller), eased in log zoom
   - pan:   from at {x, y} to to {x, y}, zoom z to z1, eased
   - track: follow ref (anything with x, y and a velocity), a little ahead of it, at zoom z (or one by its speed)
   - pair:  keep ref and ref2 in frame
   - raid:  frame the hostile weapons round ref (or all of them) and the batteries firing at them
   What a shot wants each frame is filmWant; track, pair and raid are eased towards it by the driver, the scripted
   moves (hold, push, pan) are exact, so a planned move ends exactly where it was planned. */
(function (IC) {
'use strict';
const U = IC.U;

IC.FILM = {
  hold: [3, 8],          // real seconds a director's shot stays on screen, least and most
  lead: 0.35,            // track: how far ahead of what it follows the camera looks, as a share of half the screen
  cross: 9,              // track: seconds something should take to cross the screen at its own speed
  zMin: 0.025, zMax: 60,
  margin: 1.5,           // pair and raid: room round what is framed
  raidR: 2500            // raid: weapons within this of the first one are one raid (world units)
};

/* ease in and out, 0..1 */
const ease = k => { k = U.clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
IC.filmEase = ease;

/* the velocity of anything that moves, world units per game second */
IC.filmVel = function (o) {
  if (!o) return { x: 0, y: 0 };
  if (o.vx != null && (o.vx || o.vy)) return { x: o.vx, y: o.vy };
  const sp = o.spd || 0, a = o.a != null ? o.a : o.h != null ? o.h : 0;
  return { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
};
/* where a thing really is (a threat's truth, not its radar track) */
IC.filmPos = o => o ? { x: o.x, y: o.y } : null;
const alive = o => o && !o.dead && o.x != null;

/* the hostile weapons in the air: what the enemy has launched, not airliners or our own aircraft */
IC.filmHostiles = S => S.threats.filter(t => !t.dead && !t.d.civil && !t.d.decoy && t.age > 0 && t.side !== 'us');
/* the box round a list of points, as a zoom and a middle for a view of vw × vh pixels */
function boxView(pts, vw, vh, margin, pad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const w = (x1 - x0) * margin + pad, h = (y1 - y0) * margin + pad;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: U.clamp(Math.min(vw / w, vh / h), IC.FILM.zMin, IC.FILM.zMax) };
}
IC.filmBox = boxView;

/* the raid round one weapon: the weapons near it and the batteries with missiles at them */
IC.filmRaid = function (S, ref) {
  const all = IC.filmHostiles(S); if (!all.length) return [];
  const c = alive(ref) ? ref : all[0], R = IC.FILM.raidR;
  const pts = all.filter(t => U.dxy(t.x, t.y, c.x, c.y) < R).map(t => ({ x: t.x, y: t.y }));
  for (const m of S.missiles) if (m.unit && m.target && !m.target.dead && U.dxy(m.x, m.y, c.x, c.y) < R) pts.push({ x: m.unit.x, y: m.unit.y }, { x: m.x, y: m.y });
  return pts;
};

/* what a shot wants at film time t: { x, y, z } (the middle of the screen and the zoom); null when its subject is gone */
IC.filmWant = function (S, sh, t, vw, vh) {
  const k = sh.dur ? U.clamp((t - sh.t0) / sh.dur, 0, 1) : 0, e = ease(k);
  const lz = (a, b, f) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f);
  switch (sh.kind) {
    case 'hold': { const d = sh.drift || { x: 0, y: 0 }; return { x: sh.at.x + d.x * (k - 0.5), y: sh.at.y + d.y * (k - 0.5), z: sh.z }; }
    case 'push': { const d = sh.drift || { x: 0, y: 0 }; return { x: sh.at.x + d.x * (k - 0.5), y: sh.at.y + d.y * (k - 0.5), z: lz(sh.z, sh.z1, e) }; }
    case 'pan': {
      // the zoom in log, and the middle moved so its screen speed is even however the zoom changes
      const z0 = sh.z, z1 = sh.z1 || sh.z, z = lz(z0, z1, e);
      const w = Math.abs(z1 - z0) < 1e-9 ? e : (1 / z - 1 / z0) / (1 / z1 - 1 / z0);
      return { x: sh.at.x + (sh.to.x - sh.at.x) * w, y: sh.at.y + (sh.to.y - sh.at.y) * w, z };
    }
    case 'track': {
      const o = sh.ref; if (!alive(o)) return null;
      const v = IC.filmVel(o), sp = Math.hypot(v.x, v.y);
      // the zoom: given, or what makes it cross the screen in FILM.cross seconds at the game's speed
      const z = sh.z || U.clamp(vw / Math.max(1e-3, sp * (sh.gs || IC.GS) * IC.FILM.cross), IC.FILM.zMin, IC.FILM.zMax);
      const ux = sp > 1e-6 ? v.x / sp : 0, uy = sp > 1e-6 ? v.y / sp : 0;
      // (the half screen the way it moves: wider across than up and down)
      const lead = (sh.lead == null ? IC.FILM.lead : sh.lead) * (Math.abs(ux) * vw + Math.abs(uy) * vh) / 2 / z;
      return { x: o.x + ux * lead, y: o.y + uy * lead, z: sh.z1 ? lz(z, sh.z1, e) : z };
    }
    case 'pair': {
      if (!alive(sh.ref)) return null;
      const pts = [sh.ref]; if (alive(sh.ref2)) pts.push(sh.ref2);
      const b = boxView(pts, vw, vh, sh.margin || IC.FILM.margin, sh.pad || 40);
      if (sh.zMax) b.z = Math.min(b.z, sh.zMax);
      return b;
    }
    case 'raid': {
      const pts = IC.filmRaid(S, sh.ref); if (!pts.length) return null;
      if (sh.with) for (const p of sh.with) pts.push(p);
      const b = boxView(pts, vw, vh, sh.margin || IC.FILM.margin, sh.pad || 600);
      if (sh.zMax) b.z = Math.min(b.z, sh.zMax);
      return b;
    }
  }
  return null;
};
/* the moves the driver eases towards (they follow something live); the rest are exact */
IC.filmEased = sh => sh.kind === 'track' || sh.kind === 'pair' || sh.kind === 'raid';

/* ---------- the director ----------
   Every half second it lists the moments about to happen, each with a score and the shot that films it, and cuts
   when a better one comes up and the shot on screen has run its least hold; it never cuts away while what it films
   is within two seconds of its moment (an intercept, an impact). Seconds here are film seconds; gs is game seconds
   per film second (the game's speed × IC.GS). */
IC.filmMoments = function (S, gs) {
  const out = [], toFilm = s => s / Math.max(0.01, gs);
  // intercepts about to happen: a missile closing on its target
  for (const m of S.missiles) {
    const tg = m.target; if (!tg || tg.dead || tg.x == null) continue;
    const d = Math.hypot(tg.x - m.x, tg.y - m.y, ((tg.alt || 0) - (m.alt || 0)) * 10), when = toFilm(isFinite(m.tti) && m.tti > 0 ? m.tti : d / Math.max(1e-3, m.spd || 1));
    const big = tg.d && (tg.d.cls === 'bal' || tg.d.cls === 'air' || tg.d.cls === 'hgv') ? 1.3 : 1;
    if (when < 25) out.push({ kind: 'intercept', key: 'i' + m.id, when, score: big * (when < 2 ? 10 : when < 8 ? 8 : 6 - when / 6), shot: { kind: 'pair', ref: m, ref2: tg } });
  }
  // weapons about to land
  for (const t of IC.filmHostiles(S)) {
    const when = toFilm(IC.timeToImpact(t));
    if (when < 20 && t.d.dmg) out.push({ kind: 'impact', key: 'h' + t.id, when, score: when < 3 ? 9 : 7 - when / 5, shot: { kind: 'track', ref: t, lead: 0.15, z: t.d.move === 'bal' ? 0.6 : 2.2 } });
  }
  // a battery firing now
  const fired = new Map();
  for (const m of S.missiles) if (m.unit && m.age != null && m.age < 3) fired.set(m.unit, (fired.get(m.unit) || 0) + 1);
  for (const [u, n] of fired) out.push({ kind: 'launch', key: 'l' + u.id, when: 0, score: 4 + Math.min(3, n), shot: { kind: 'push', at: { x: u.x, y: u.y }, z: 1.2, z1: 2.6 } });
  // the raid as a whole: always there while something hostile flies
  const H = IC.filmHostiles(S);
  if (H.length) out.push({ kind: 'raid', key: 'raid', when: 1e9, score: 2 + Math.min(2, H.length / 10), shot: { kind: 'raid', ref: H[0] } });
  return out.sort((a, b) => b.score - a.score);
};
/* one decision: D is the director's state { cur, since, t }; returns the shot to cut to, or null to stay */
IC.filmDirect = function (S, D, t, gs) {
  const M = IC.filmMoments(S, gs), best = M[0];
  D.t = t;
  if (!best) return null;
  const cur = D.cur, held = cur ? t - D.since : 1e9, [hmin, hmax] = IC.FILM.hold;
  if (cur) {
    const still = M.find(m => m.key === cur.key);
    // never away from a moment about to happen
    if (still && still.when < 2 && held < hmax + 3) return null;
    if (held < hmin && still) return null;
    if (still && best.key !== cur.key && best.score < still.score * 1.4 && held < hmax) return null;
    if (still && best.key === cur.key) return null;
  }
  D.cur = best; D.since = t;
  return Object.assign({ t0: t, dur: hmax, key: best.key, gs }, best.shot);
};

})(window.IC);
