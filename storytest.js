/* Story mode smoke test with a scripted player: node storytest.js [seed] [hours] */
const IC = require('./headless.js');
const U = IC.U;
const seed = +process.argv[2] || 12345, hours = +process.argv[3] || 8;
const quiet = process.env.QUIET;
const S = IC.newGame({ seed, mode: 'story', hour: 7 });
const st = S.story;
const bad = S.byId[st.bad], cap = S.byId[st.cap];
console.log('airports:', IC.bases(S).map(b => `${b.name} [${b.template}] parts=${b.parts.length} stands=${IC.aptStands(b).length} longest=${(b.st.longest / 10).toFixed(1)}km warn=${b.st.warn.length}`).join('\n  '));
for (const b of IC.bases(S)) if (b.st.warn.length) console.log('  ', b.name, '→', b.st.warn.join(' | '));
console.log('airlines:', S.av.airlines.map(a => `${a.name}(${a.kind})`).join(', '));
console.log('routes:', S.av.routes.length, 'tails:', S.av.tails.length);
const t0 = S.time;
let built = {};
const logs = [];
const origLog = IC.log;
IC.log = function (S2, kind, tag, msg, at) { if (['GOAL', 'MAYDAY', 'DECISION', 'GROUND', 'AVIATION', 'QRA', 'AIR', 'VID', 'RADIO', 'BUILD', 'WAR', 'LOST', 'END', 'INT', 'ATC', 'MIN', 'PM', 'CDS', 'ID', 'SUSPECT', 'DECEPTION', 'AIRPORT', 'IMPACT', 'SPLASH'].includes(tag) && !quiet) logs.push(`${U.clock(S2.time)} [${tag}] ${msg}`); return origLog(S2, kind, tag, msg, at); };
let lastH = -1;
const dt = 0.5;
for (let step = 0; S.time - t0 < hours * 3600 && !S.over; step++) {
  IC.step(S, dt);
  const el = S.time - t0;
  if (step % 120 === 0) {
    for (const q of S.av.requests.slice()) if (!IC.avReqBlock(S, q)) IC.avDecide(S, q.id, true);
    for (const e of st.events.slice()) if (S.time - e.t > 60) IC.storyChoose(S, e.id, 0);
    // radio calls for off-route airliners
    for (const t of S.threats) if (t.offFlag && !t.called && t.d.civil) IC.callAircraft(S, t);
  }
  if (el > 3600 && !built.tx) {
    built.tx = true;
    const P = (x, y) => IC.aptLocal(bad, x, y);
    const a = IC.aptPlanTaxi(S, bad, [P(2, 1.75), P(-6, 1.75), P(-11.8, 1.75), P(-11.8, 0)]);
    const b = IC.aptPlanTaxi(S, bad, [P(2, 1.75), P(8, 1.75), P(11.8, 1.75), P(11.8, 0)]);
    console.log('planned taxiways', !!a, !!b, 'budget', S.budget.toFixed(0));
  }
  if (el > 2 * 3600 && !built.apron) {
    built.apron = true;
    const c = IC.aptLocal(bad, -2.2, 2.22);
    const p = IC.aptPlanPart(S, bad, 'apron', c.x, c.y, bad.rwyA, 2.4, 0.95);
    if (p) { const c2 = IC.aptLocal(bad, -2.2, 1.75); const d = IC.aptLocal(bad, -2.2, 1.767); }
    console.log('planned apron', !!p, 'budget', S.budget.toFixed(0));
  }
  if (st.act >= 2 && !built.a2) {
    built.a2 = true;
    const fb = S.byId.ab_fwd;
    IC.storyDelegate(S, 'qra', true);
    const P = (x, y) => IC.aptLocal(fb, x, y);
    const c = P(-13.7, -1.05);
    const pad = IC.aptPlanPart(S, fb, 'alert', c.x, c.y, fb.rwyA);
    const stub = IC.aptPlanTaxi(S, fb, [P(-12.8, -1.6), P(-13.7, -1.25)]);
    console.log('act2 setup: pad', !!pad, 'stub', !!stub, 'qra', st.del.qra, 'cp', st.cp);
    IC.order(S, 'gf');
    IC.avAddZone(S, fb.x, fb.y, 250, 'P-1 base');
  }
  if (st.act >= 2 && (S.reserve.gf || 0) > 0) {
    const fA = S.fronts.find(f => f.key === 'A'), p = fA.pts[Math.floor(fA.pts.length / 2)];
    const spot = IC.findSpot(S, 'gf', p.x + p.nx * 500, p.y + p.ny * 500, 0, 300);
    if (spot) { IC.deploy(S, 'gf', spot.x, spot.y); console.log('deployed gap filler'); }
  }
  const h = Math.floor(el / 3600);
  if (h !== lastH) {
    lastH = h;
    const A = S.av;
    const kp = IC.bases(S).filter(b => b.kind === 'airport').map(b => `${b.name.split(' ')[0]}:n${b.kpi.n} taxi${(b.kpi.taxi / 60).toFixed(1)}m wait${(b.kpi.wait / 60).toFixed(1)}m back${b.kpi.back || 0} grid${b.kpi.grid} div${b.kpi.div} mv${b.moves.length} occ${IC.aptStands(b).filter(s => s.occ).length}/${IC.aptStands(b).length}`).join('  ');
    console.log(`${U.clock(S.time)} act${st.act} stand${st.standing.toFixed(0)} cp${st.cp} tension${(S.tension || 0).toFixed(0)} ₭${S.budget.toFixed(0)} in${S.income.toFixed(1)} up${S.upkeep.toFixed(1)} av${IC.avRevenueRate(S).toFixed(1)} pax${A.day.pax} fl${A.day.flights} sat[${A.airlines.map(a => a.sat.toFixed(0)).join(',')}] req${A.requests.length} tails:${['stand', 'dep', 'air', 'arr', 'away', 'lost'].map(k => k[0] + A.tails.filter(t => t.where === k).length).join(' ')} civ${S.threats.filter(t => t.type === 'civ' && !t.dead).length}`);
    console.log('   ', kp);
    console.log('    goals:', st.goals.map(g => (g.done ? '✓' : '·') + g.id).join(' '), 'events', st.events.length, 'inc', IC.activeIncidents(S).map(i => i.kind).join(','), 'roster', S.roster.map(r => `${r.name}:${r.st}${r.ent && r.ent.gnd ? '(gnd ' + (r.ent.ground ? r.ent.ground.phase : '?') + ')' : ''}@${r.slot ? r.slot.slice(-6) : '-'}`).join(' '), 'quickest', st.cnt.quickest < 1e8 ? st.cnt.quickest.toFixed(0) : '-', 'vid', st.cnt.vid);
    while (logs.length) console.log('     ', logs.shift());
  }
}
while (logs.length) console.log('     ', logs.shift());
console.log('over:', S.over);
console.log('bad regional:', bad.st.warn.join(' | '));
