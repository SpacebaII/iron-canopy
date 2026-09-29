/* A sensible Quick war commander, for balance runs (econtest.js quick) and the tests. It spends in order of what
   matters: two layers of air defence (an area battery and a point-defence system) over the capital, the main air
   base and the two largest cities; then radars along the hostile border; then layers over the next cities. It keeps
   some money back for missiles (Keep stocked buys them), deploys what is in the reserve before buying, and does not
   fight: the batteries fight on their own. */
const IC = typeof module !== 'undefined' && require.main !== undefined ? require('./headless.js') : window.IC;
const U = IC.U;

const KEEP = 150;   // ₭M kept back for stock and repairs
const AD = t => { const d = IC.UNITS[t]; return d && d.cat === 'ad' && !d.callin; };
const area = t => AD(t) && IC.typeRange(t) >= 300;   // reaches 30 km or more: a battery that covers a whole city
const point = t => AD(t) && IC.typeRange(t) < 300;
const radar = t => { const d = IC.UNITS[t]; return d && d.cat === 'sensor' && !d.sensor.passive && !d.sensor.bmdOnly && !d.sensor.rktOnly && d.sensor.R >= 1500; };
// where a unit is or is going
const at = u => u.dest || u;
/* does a unit of this kind cover the place (the place well inside its reach)? ready = only units set up now */
const covers = (u, p, ready) => (!ready || u.state === 'ready') && !u.dead && U.dist(at(u), p) <= IC.typeRange(u.type) * 0.8;
/* the layers over a place: 'area' and 'point' */
function layers(S, p, ready) {
  const L = new Set();
  for (const u of S.units) if (AD(u.type) && covers(u, p, ready)) L.add(area(u.type) ? 'area' : 'point');
  return L;
}
/* how much of the hostile border (its front points) is inside a surveillance radar's reach */
function borderCover(S, ready) {
  const pts = S.world.fronts.flatMap(f => f.pts);
  const R = S.units.filter(u => radar(u.type) && !u.dead && (!ready || u.state === 'ready'));
  return pts.filter(p => R.some(u => U.dist(at(u), p) <= u.d.sensor.R * 0.8)).length / Math.max(1, pts.length);
}
/* the places that matter first: the capital, the main (forward) air base, the two largest other cities */
function keyPlaces(S) {
  const cap = IC.cap(S), big = IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop);
  return [cap, S.byId.ab_fwd || S.byId.ab_rear, big[0], big[1]].filter(Boolean);
}
/* the next thing to buy or deploy: [type, place, min, max distance] or null */
function nextGoal(S) {
  const tier = (p, want) => {
    const L = layers(S, p, false);
    if (!L.has('area')) return [want.area, p, 60, 220];
    if (!L.has('point')) return [want.point, p, 30, 90];
    return null;
  };
  const inRes = f => Object.keys(S.reserve).find(t => S.reserve[t] > 0 && f(t));
  const want = { area: inRes(area) || 'mrsam', point: inRes(point) || 'shorad' };
  for (const p of keyPlaces(S)) { const g = tier(p, want); if (g) return g; }
  // radars along the hostile border, 80 km inside it, one for each stretch it does not see yet
  if (borderCover(S, false) < 0.9) {
    const R = S.units.filter(u => radar(u.type) && !u.dead);
    for (const f of S.world.fronts) for (const p of f.pts) {
      const q = { x: p.x + p.nx * 800, y: p.y + p.ny * 800 };
      if (!R.some(u => U.dist(at(u), p) <= u.d.sensor.R * 0.8)) return [inRes(radar) || 'lr3d', q, 0, 250];
    }
  }
  // then layers over the next cities, largest first
  const more = IC.cities(S).filter(c => !c.capital).sort((a, b) => b.pop - a.pop).slice(2, 10);
  for (const c of more) { const g = tier(c, want); if (g) return g; }
  return null;
}
/* one decision: deploy from the reserve, or buy if the money is there (keeping KEEP back) */
function commander(S, max) {
  for (let k = 0; k < (max || 6) && decide(S); k++);
}
function decide(S) {
  if (S.over) return false;
  const g = nextGoal(S); if (!g) return false;
  const [type, p, d0, d1] = g;
  if (!(S.reserve[type] > 0) && (IC.buyBlock(S, type) || S.budget < IC.unitCost(S, type) + KEEP)) return false;
  const q = IC.findSpot(S, type, p.x, p.y, d0, d1);
  if (!q) return false;
  const u = IC.deploy(S, type, q.x, q.y);
  if (u && u.d.weapon === 'sam') u.emcon = 'ambush';
  return !!u;
}
/* what the player owns, in a line */
function owned(S) {
  const n = {};
  for (const u of S.units) if (!u.dead && !u.callin) n[u.d.short] = (n[u.d.short] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
}
if (typeof module !== 'undefined') module.exports = { commander, layers, borderCover, keyPlaces, owned };
