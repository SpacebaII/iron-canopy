/* Iron Canopy — what a click on the map picks (main.js asks; headless, so the tests can click): tracks first, then our
   aircraft and units, the airspace, convoys and intelligence, then close in an airliner on the ground or on its stand,
   an airport's parts, and the places. z is the camera's zoom (screen pixels per world unit). */
(function (IC) {
'use strict';
const U = IC.U;
IC.pickAt = function (S, p, z) {
  const px = 1 / z;
  let best = null, bd = 1e9;
  const consider = (kind, ref, x, y, r) => { const d = U.dxy(p.x, p.y, x, y); if (d < Math.max(16 * px, r || 0) && d < bd) { bd = d; best = { kind, ref }; } };
  // (an airliner parked right under the cursor wins over a track passing a kilometre off)
  if (S.av && z >= (IC.FOCUS.polish ? 0.9 : 2.5)) for (const ap of IC.bases(S)) {
    if (!ap.parts || U.dist(ap, p) > (ap.radius || 20) + 5) continue;
    for (const s of IC.aptStands(ap)) if (s.occ && U.dist(s, p) < 0.4) { const tl = S.av.tails.find(t => t.id === s.occ); if (tl && tl.where === 'stand' && tl.T && U.dist(s, p) < tl.T.len * 0.5) return { kind: 'tail', ref: tl }; }
  }
  // a track is clicked where the map draws it (an identified one stays there after radar loses it)
  const tv = {};
  for (const t of S.threats) if (IC.trackView(S, t, tv)) consider('track', t, tv.x, tv.y);
  if (best) return best;
  for (const a of S.air) consider('air', a, a.x, a.y);
  if (best) return best;
  for (const u of S.units) consider('unit', u, u.x, u.y);
  if (best) return best;
  const aw = S.layers.airways || (S.mode2 && S.mode2.kind === 'airway');
  if (aw) for (const f of S.asp.fixes) consider('fix', f, f.x, f.y);
  if (z > 0.05) for (const f of S.asp.fields) consider('field', f, f.x, f.y);
  if (best) return best;
  if (S.layers.logistics) for (const v of S.vehicles) if (v.state !== 'idle') consider('veh', v, v.x, v.y);
  if (best) return best;
  if (S.layers.intel) {
    for (const t of S.tels) if (t.known && !t.dead) consider('tel', t, t.kx, t.ky);
    for (const s of S.esites) if (s.pk > 0) consider('site', s, s.x, s.y, s.pk === 1 ? 180 : 0);
    if (best) return best;
  }
  // (round 2) close in, an airliner on the ground: taxiing, or on its stand (its panel follows it and shows its turnaround)
  // (round 5c) from the whole-airport zoom too, but only a click on the aircraft itself (or a few pixels from it): the
  // airport is still a click away anywhere else
  const zA = IC.FOCUS.polish ? 0.9 : 2.5;
  if (z >= zA && S.av) {
    const tight = z < 2.5, near = (kind, ref, x, y, r) => tight ? (U.dxy(p.x, p.y, x, y) < Math.max(r, 7 * px) && consider(kind, ref, x, y, Math.max(r, 7 * px))) : consider(kind, ref, x, y, r);
    for (const ap of IC.bases(S)) {
      if (!ap.parts || !ap.moves || U.dist(ap, p) > ap.radius + 5) continue;
      for (const m of ap.moves) if (m.tail && !m.dead && m.tail.T) near('tail', m.tail, m.x, m.y, m.tail.T.len * 0.55);
      for (const s of IC.aptStands(ap)) if (s.occ && U.dist(s, p) < Math.max(1, 7 * px)) { const tl = S.av.tails.find(t => t.id === s.occ); if (tl && tl.where === 'stand') near('tail', tl, s.x, s.y, tl.T.len * 0.5); }
    }
    if (best) return best;
    // (brief 62) a light aircraft or business jet: on the GA ramp, moving on the airport, or on a club field
    if (S.ga) for (const ap of IC.bases(S)) {
      if (!ap.parts || U.dist(ap, p) > ap.radius + 5) continue;
      for (const m of ap.moves) if (m.ga && !m.dead && m.T && !(m.kind !== 'arr' && m.phase === 'start')) near('ga', m, m.x, m.y, m.T.len * 0.6);
      for (const r of S.ga.parked) if (r.ap === ap.id && !r.away) { const s = IC.aptStands(ap).find(x => x.id === r.sid); if (s && U.dist(s, p) < 1) near('ga', r, s.x, s.y, IC.ACTYPES[r.type].len * 0.6); }
    }
    for (const t of S.threats) if (t.fld && !t.dead && !t.held) near('ga', t, t.x, t.y, 0.06);
    if (best) return best;
  }
  // close in, airports are picked part by part
  if (z >= 2.5) for (const ap of IC.bases(S)) {
    if (!ap.parts || U.dist(ap, p) > ap.radius + 5) continue;
    const part = IC.partAt(ap, p, 6 * px);
    if (part && part.kind !== 'runway' && part.kind !== 'taxi' && part.kind !== 'apron') return { kind: 'apart', ref: part, ap };
    if (part) return { kind: 'apart', ref: part, ap };
  }
  for (const i of S.infra) {
    if (i.kind === 'bridge') { if (z > 0.2 && U.dxy(p.x, p.y, i.x, i.y) < Math.max(10, 10 * px)) return { kind: 'infra', ref: i }; continue; }
    const r = i.kind === 'city' ? Math.max(i.r * 0.7, 10 * px) : i.parts && z > 0.3 ? Math.max(i.radius * 0.7, 13 * px) : 13 * px;
    if (U.dxy(p.x, p.y, i.x, i.y) < r) return { kind: 'infra', ref: i };
  }
  if (aw) { const w = IC.aspWayAt(S, p, 8 * px); if (w) return { kind: 'airway', ref: w }; }
  return null;
};
})(window.IC);
