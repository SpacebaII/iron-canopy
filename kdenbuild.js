/* Builds a Denver-sized airport by hand, through the same clicks a player makes (IC.clickWorld), and counts them.
   node kdenbuild.js         prints every step, the action count and what the airport can do
   Used by tests/run.js. */
const IC = typeof module !== 'undefined' && require.main !== undefined ? require('./headless.js') : window.IC;
const U = IC.U;

function buildKden(seed) {
  const S = IC.newGame({ seed: seed || 12345, mode: 'story', preset: 'network', hour: 10 });
  // a hub this size uses what research opens: hydrant fuel, ground radar, CAT III landing systems, jet bridges
  for (const t of ['p_hydrant', 'p_gradar', 'p_ils3', 'p_bridge', 'p_rconc']) S.tech.done.add(t);
  const ap = S.byId[S.story.cap];
  if (S.av) { S.av.tails = []; S.av.routes = []; }
  S.threats = S.threats.filter(t => !t.tail);
  return buildKdenAt(S, ap);
}
/* KDEN-START: every click a player makes, on the airport ap (works in the browser too) */
function buildKdenAt(S, ap) {
  IC.S = S;  // an empty field where the capital airport was
  IC.initAirport(ap); ap.rwyA = 0; ap.crews = 12; IC.aptStats(S, ap);
  S.budget = 1e5;
  const P = (x, y) => IC.aptLocal(ap, x, y);
  let actions = 0;
  const log = [];
  const tool = (part, o) => { S.mode2 = Object.assign(IC.bldMode(S, ap, part), o || {}); actions++; };
  const click = (x, y, btn) => { const r = IC.clickWorld(P(x, y), btn || 0); actions++; if (r === 'err') throw new Error(`${S.mode2.part} at ${x},${y}: ${S.mode2.err}`); return r; };
  const again = (x, y) => { const r = click(x, y); if (r !== 'built') throw new Error(`${S.mode2.part} at ${x},${y} did not build: ${r}`); };
  const step = (what, fn) => { const a0 = actions, n0 = ap.parts.length; fn(); log.push(`${what}: ${actions - a0} actions, ${ap.parts.length - n0} parts`); };
  const line = (pts) => { for (const [x, y] of pts) click(x, y); again(...pts[pts.length - 1]); };

  step('six runways', () => {
    tool('runway');
    for (const r of [[[6, -26], [42, -26]], [[-42, 26], [-6, 26]], [[-30, -36], [-30, 0]], [[-20, -36], [-20, 0]], [[20, 0], [20, 36]], [[30, 0], [30, 48]]]) line(r);
  });
  step('a parallel taxiway for each, 300 m out', () => {
    tool('parallel');
    for (const [rx, ry, ox, oy] of [[24, -26, 24, -23], [-24, 26, -24, 23], [-30, -18, -27, -18], [-20, -18, -17, -18], [20, 18, 23, 18], [30, 24, 33, 24]]) { click(rx, ry); click(ox, oy); again(ox, oy); }
  });
  step('rapid exits on every runway', () => {
    tool('exits');
    for (const [x, y] of [[24, -26], [-24, 26], [-30, -18], [-20, -18], [20, 18], [30, 24]]) { click(x, y); again(x, y); }
  });
  step('crossings between the parallel taxiways of each pair', () => {
    tool('taxi', { fillet: false });
    for (const y of [-30, -12]) line([[-27, y], [-20, y], [-17, y]]);
    for (const y of [12, 30]) line([[23, y], [30, y], [33, y]]);
  });
  step('a perimeter taxiway round the terminal area, joined to the runways', () => {
    tool('taxi', { fillet: false });
    line([[11, -23], [11, 23], [-6, 23]]);
    line([[-11, 23], [-11, -23], [6, -23]]);
    for (const y of [-18, -6]) line([[-17, y], [-11, y]]);
    for (const y of [6, 18]) line([[11, y], [23, y]]);
  });
  step('three concourses with gates, their taxilanes joining the perimeter', () => {
    tool('concourse', { size: 'l' }); line([[-10.4, -8], [10.4, -8]]);
    tool('concourse', { size: 'm' }); line([[-10.4, -1.2], [10.4, -1.2]]); line([[-10.4, 4.6], [10.4, 4.6]]);
  });
  step('the inner taxilanes made one way', () => {
    const lanes = ap.parts.filter(p => p.kind === 'taxi' && p.nodes.length >= 3 && Math.abs(IC.rectLocal({ x: ap.x, y: ap.y, a: 0 }, ap.nodes[p.nodes[0]]).x + 11) < 0.2).sort((a, b) => ap.nodes[a.nodes[0]].y - ap.nodes[b.nodes[0]].y);
    lanes.slice(1, -1).forEach((t, i) => { actions += 2; IC.aptSetTaxiDir(S, ap, t, i % 2 ? -1 : 1, 0); });
  });
  step('a remote apron and the main terminal', () => {
    tool('remote'); line([[-10.4, 9.5], [10.4, 10.8]]);
    tool('terminal'); line([[-6, -12.5], [6, -15.5]]);
  });
  step('fuel farm with a hydrant system', () => {
    tool('fuel'); for (const x of [-8, -6, -4, -2]) for (const y of [16, 18]) { click(x, y); again(x, y); }
    tool('hydrant'); click(2, 17); again(2, 17);
  });
  step('fire stations, tower, approach and ground radar', () => {
    tool('fire'); for (const [x, y] of [[-22.5, -18], [22.5, 24], [-24, 19.5], [23.2, -24.6]]) { click(x, y); again(x, y); }
    tool('tower'); click(8, -14); again(8, -14);
    tool('atc'); click(4, 20); again(4, 20);
    tool('gradar'); click(-9.5, 12); again(-9.5, 12);
  });
  step('landing systems on every runway end', () => {
    tool('ils');
    for (const rw of ap.parts.filter(p => p.kind === 'runway')) for (const e of ['a', 'b']) { const q = IC.rectLocal({ x: ap.x, y: ap.y, a: 0 }, rw[e]); click(q.x, q.y); again(q.x, q.y); }
  });
  S.mode2 = null;
  return { S, ap, actions, log };
}
/* KDEN-END */
/* finish every planned part at once */
function finishAll(S, ap) { for (let i = 0; i < 50 && ap.works.length; i++) { for (const w of ap.works) w.prog = 1; IC.updateBases(S, 0.1); } ap.dirty = true; return IC.aptStats(S, ap); }

if (require.main === module) {
  const t0 = Date.now();
  const { S, ap, actions, log } = buildKden(+process.argv[2] || 12345);
  for (const l of log) console.log('  ' + l);
  const cost = ap.works.reduce((s, w) => s + w.cost, 0), dur = ap.works.reduce((s, w) => s + w.dur, 0);
  console.log(`${actions} actions, ${ap.parts.length} parts, ${U.money(cost)}, ${U.dur(dur)} of engineer work (${Date.now() - t0} ms)`);
  const st = finishAll(S, ap);
  console.log(`${st.rwy.length} runways, ${IC.aptStands(ap).length} stands (${IC.aptStands(ap).filter(s => !s.linked).length} cut off), ${st.arrPerHour} arrivals + ${st.depPerHour} departures an hour`);
  console.log(st.warn.join('\n'));
}
module.exports = { buildKden, finishAll };
