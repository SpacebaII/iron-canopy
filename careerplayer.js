/* A scripted Career player, for the balance run (storytest.js) and the tests. It plays Act I the way a steady
   player would: builds the national airport, grows it, draws the airspace, takes the contracts, founds a second
   airport and a freight operation, approves what the airports can take and answers every card with its first
   choice. It uses the same functions as the interface. Call it every game minute or so: player(S). */
const IC = require('./headless.js');
const U = IC.U;

/* a flat site near a town, with few homes under the approaches */
function site(S, c, rmin, rmax) {
  let best = null, bs = 1e9;
  for (let r = rmin; r <= rmax; r += 20) for (let a = 0; a < 6.28; a += Math.PI / 12) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    if (IC.foundCheck(S, x, y)) continue;
    const sv = IC.foundSurvey(S, x, y, IC.PREVAIL);
    if (sv.river) continue;
    const s = sv.cost + sv.homes * 8 + sv.obst * 0.5 + r * 0.05;
    if (s < bs) { bs = s; best = { x, y }; }
  }
  return best;
}
// the terminal side of the runway (+1 or -1): the other side when a river or the site's edge is in the way
const L = (ap, x, y) => IC.aptLocal(ap, x, y * (ap._side || 1));
const has = (ap, k) => ap.parts.some(p => p.kind === k);
const part = (S, ap, k, x, y, w, h, o) => { const c = L(ap, x, y); return IC.aptPlanPart(S, ap, k, c.x, c.y, ap.rwyA, w, h, o); };
const taxi = (S, ap, pts) => IC.aptPlanTaxi(S, ap, pts.map(([x, y]) => L(ap, x, y)), 0.3, { mat: 'conc' });
/* the first airport: a 3 km runway, one apron, a stub taxiway, terminal, fire station and fuel */
function starter(S, ap, len) {
  const h = len / 2, o = { mat: 'conc' };
  if (!has(ap, 'runway')) IC.aptPlanRunway(S, ap, L(ap, -h, 0), L(ap, h, 0), 'Runway 1', o);
  if (!has(ap, 'apron') && !part(S, ap, 'apron', 0, 4, 4, 1.3, o) && !ap._side) { ap._side = -1; part(S, ap, 'apron', 0, 4, 4, 1.3, o); }
  if (!has(ap, 'taxi')) taxi(S, ap, [[0, 0], [0, 3.35]]);
  if (!has(ap, 'terminal')) part(S, ap, 'terminal', 0, 5.1, 3, 0.8);
  if (!has(ap, 'fire')) part(S, ap, 'fire', 3.5, 1.5);
  if (!has(ap, 'fuel')) part(S, ap, 'fuel', -5, 4.5);
}
/* what a steady player does next at the capital: tower, taxiways to both ends, more stands, cargo */
function grow(S, ap, st) {
  if (!has(ap, 'tower')) return part(S, ap, 'tower', 3.5, 2.6);
  if (!ap.parts.some(p => p.kind === 'taxi' && p.nodes.length > 3)) return taxi(S, ap, [[-15, 0], [-15, 1.8], [0, 1.8], [15, 1.8], [15, 0]]);
  if (!has(ap, 'ils') && S.budget > 100) { const rw = ap.parts.find(p => p.kind === 'runway'); return rw && IC.aptPlanPart(S, ap, 'ils', rw.a.x, rw.a.y); }
  if (ap.parts.filter(p => p.kind === 'apron').length < 2 && S.budget > 150) { part(S, ap, 'apron', 4.3, 4, 4, 1.3, { mat: 'conc' }); return taxi(S, ap, [[4.3, 1.8], [4.3, 3.35]]); }
  if (ap.parts.filter(p => p.kind === 'fuel').length < 2 && S.budget > 120) return part(S, ap, 'fuel', -8, 4.5);
  // more stands when they fill up: all but one taken (on long routes a fleet spends most of its time away, so the
  // number of aircraft says little about the stands they need)
  const stands = IC.aptStands(ap).filter(s2 => s2.zone !== 'cargo' && s2.zone !== 'mil'), full = stands.filter(s2 => s2.occ).length >= stands.length - 1;
  const aprons = ap.parts.filter(p => p.kind === 'apron' && p.zone !== 'cargo').length;
  if (full && aprons < 6 && S.budget > 150) { const x = [8.6, 12.9, -12.9, 17.2][aprons - 2] || 0; if (x) { part(S, ap, 'apron', x, 4, 4, 1.3, { mat: 'conc' }); return taxi(S, ap, [[x, 1.8], [x, 3.35]]); } }
  if (st.ch >= 5 && !has(ap, 'cargo') && S.budget > 200) { part(S, ap, 'cargo', -4.5, 6.2, 2.5, 0.8); part(S, ap, 'apron', -4.5, 4.9, 3, 1, { mat: 'conc', zone: 'cargo' }); return taxi(S, ap, [[-3, 1.8], [-3, 4.2]]); }
  return null;
}
/* the airspace: an entry point where the way to each foreign airport crosses the border, a fix near the airport,
   airways between them, and a civil radar in the middle */
function airspace(S, ap) {
  const N = S.asp;
  if (!N.fixes.length) {
    const hub = IC.aspAddFix(S, ap.x + 300, ap.y);
    for (const p of IC.avPorts(S)) {
      let q = null;
      for (let i = 1; i <= 80; i++) { const x = ap.x + (p.x - ap.x) * i / 80, y = ap.y + (p.y - ap.y) * i / 80; if (!IC.inHome(x, y)) { q = { x, y }; break; } }
      if (!q) continue;
      const f = IC.aspAddFix(S, q.x, q.y);
      if (f) IC.aspAddWay(S, hub.id, f.id);
    }
    // overflights: an airway joining entry points on opposite borders through the hub catches them
  }
  if (!S.units.some(u => u.type === 'ssr') && S.budget > 80) {
    const hub = N.fixes[0], p = IC.findSpot(S, 'ssr', hub.x, hub.y, 0, 300);
    if (p) IC.deploy(S, 'ssr', p.x, p.y);
  }
  // more radars where the airways are least seen, until most of them are
  if (S.budget > 120 && !S.units.some(u => u.type === 'ssr' && u.state !== 'ready')) {
    let worst = null, wc = 1;
    for (const w of N.ways) { const [a, b] = IC.aspWayEnds(S, w); for (let i = 1; i < 10; i++) { const p = { x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 }; const c = IC.aspCovAlt(S, p.x, p.y) <= 9 ? 1 : 0; if (c < wc && IC.inHome(p.x, p.y)) { wc = c; worst = p; } } }
    if (worst) { const p = IC.findSpot(S, 'ssr', worst.x, worst.y, 0, 300); if (p) IC.deploy(S, 'ssr', p.x, p.y); }
  }
}
function player(S, log) {
  const st = S.story, cc = IC.cap(S);
  for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q)) IC.avDecide(S, q.id, true);
  for (const e of st.events.slice()) if (S.time - e.t > 120) IC.storyChoose(S, e.id, 0);
  for (const t of S.threats) if (t.offFlag && !t.called && t.d.civil) IC.callAircraft(S, t);
  for (const t of S.threats) if (t.infFlag && !t.called && t.type === 'ga') IC.callAircraft(S, t);
  if (st.act !== 1) return;
  // the national airport
  if (!st.cap) { const p = site(S, cc, 180, 380); if (p) IC.foundAirport(S, p.x, p.y, IC.PREVAIL); return; }
  const ap = S.byId[st.cap];
  starter(S, ap, 30);
  // worn pavement and damage: resurface what needs it
  for (const b of IC.bases(S)) if (b.kind === 'airport' && b.owner === 'us') for (const it of IC.aptRepairList(b)) if (S.budget > it.cost + 40) IC.aptQueue(S, b, it.key);
  // (while the chapter asks for a second airport, the money is saved for it)
  const saving = st.ch >= 4 && st.city2 && !st.apt2;
  if (st.ch >= 1 && !ap.works.length && !saving) grow(S, ap, st);
  if (st.ch >= 2 && !IC.storyLock(S, 'airways')) airspace(S, ap);
  // the contract: a field near the town
  const c = st.contract;
  if (st.ch >= 3 && c && !c.done && !c.refused && !c.late && !S.asp.fields.some(f => f.built)) {
    const t = S.byId[c.town];
    for (let a = 0; a < 6.28; a += 0.4) { const x = t.x + Math.cos(a) * (t.r + 60), y = t.y + Math.sin(a) * (t.r + 60); if (!IC.aspFieldWhy(S, x, y)) { IC.aspFoundField(S, x, y); break; } }
  }
  // the second city's airport
  // (works are paid as they run: founding needs the site's price and some money in hand, not the whole airport)
  if (st.ch >= 4 && st.city2 && !st.apt2 && S.budget > IC.FOUND_COST + 150) { const p = site(S, S.byId[st.city2], 140, 400); if (p) IC.foundAirport(S, p.x, p.y, IC.PREVAIL); }
  if (st.apt2) starter(S, S.byId[st.apt2], 18);
}
module.exports = { player, site };
