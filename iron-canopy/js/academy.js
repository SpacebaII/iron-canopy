/* Iron Canopy — the Academy. Short, scripted lessons that each teach one system and check that the player
   actually did it. The open campaign never scripts like this; the Academy is where scripted scenes live. */
(function (IC) {
'use strict';
const U = IC.U;
// units by the names the arsenal shows: "Kestrel · medium-range search radar", or just "Kestrel"
const nm = t => IC.fullName(IC.UNITS[t]), nk = t => IC.UNITS[t].name;

/* ---------- helpers for lesson setups ---------- */
/* a step's hint that names an arsenal tile: the arsenal opens on its tab, scrolls to the tile and rings it (the whole
   arsenal while it is folded); zone draws a limit the step names on the map */
const tile = (type, cat, zone) => ({ el: ['tile-' + type, 'arsenal'], cat, tile: type, zone });
// lesson 3: the 15 km round the forward base, and what the player is told when a unit stands outside it
const near15 = S => { const b = fwd(S); return { x: b.x, y: b.y, r: 150, label: '15 km' }; };
function tooFar(S, type) {
  const b = fwd(S), u = S.units.filter(x => x.type === type && !x.dead).sort((p, q) => U.dist(p, b) - U.dist(q, b))[0];
  return u && U.dist(u, b) >= 160 ? ` ${u.name} is ${U.km(U.dist(u, b))} away, too far to count: select it and move it (M) inside the ring.` : '';
}
function put(S, type, near, dmin, dmax, o) {
  const p = IC.findSpot(S, type, near.x, near.y, dmin, dmax); if (!p) return null;
  const u = IC.makeUnit(S, type, p.x, p.y, Object.assign({ instant: true, full: true }, o || {}));
  if (o && o.emcon) u.emcon = o.emcon;
  return u;
}
function depot(S, stock) {
  const W = S.world;
  const dep = IC.makeUnit(S, 'depot', W.depotPos.x, W.depotPos.y, { instant: true });
  dep.name = 'Central Depot'; dep.central = true; dep.d_cap = 3000; dep.hp = dep.max = 300; dep.reach = 1e9;
  Object.assign(dep.inv, stock || { IR: 12, SR: 24, MR: 12, LR: 8, TBD: 8, RKT: 24 });
  return dep;
}
const fwd = S => S.byId.ab_fwd || IC.bases(S)[0];
const rear = S => S.byId.ab_rear || IC.bases(S)[0];
const frontA = S => S.world.fronts.find(f => f.key === 'A');
function borderTown(S) { return IC.cities(S).filter(c => !c.capital).sort((a, b) => IC.hostileBorderDist(a.x, a.y) - IC.hostileBorderDist(b.x, b.y))[0]; }
function flight(S, kind, name, base) { const r = IC.newFlight(S, kind, name, base.id); S.roster.push(r); IC.assignSlots(S, base); return r; }
function focus(S, p, z) { S.camp.focus = { x: p.x, y: p.y, z: z || 0.35 }; }
/* a lesson that needs a reconnaissance drone always has one */
function reaper(S) {
  if (S.roster.some(r => r.kind === 'isr' && r.st !== 'lost')) return;
  const n = S.roster.filter(r => r.kind === 'isr').length + 1;
  flight(S, 'isr', `REAPER ${n}`, fwd(S));
  IC.say(S, 'AIR', `We lost that drone. REAPER ${n} is ready at ${fwd(S).name}.`);
}
// a lost strike aircraft is replaced, so the lesson can still be finished
function strikers(S) {
  if (S.roster.some(r => (r.kind === 'ucav' || r.kind === 'ftr') && r.st !== 'lost')) return;
  flight(S, 'ucav', `HAWK ${S.roster.filter(r => r.kind === 'ucav').length + 1}`, fwd(S));
  IC.say(S, 'AIR', 'We lost our strike aircraft. Another strike drone is ready at the forward base.');
}
/* lesson 2: domestic airliners on their filed routes past the capital, so there are green tracks to read at once */
function airliners(S, c, n) {
  const towns = IC.cities(S).filter(x => x !== c && IC.inHome(x.x, x.y)), pairs = [];
  for (let i = 0; i < towns.length; i++) for (let k = i + 1; k < towns.length; k++) {
    const a = towns[i], b = towns[k];
    if (U.dist(a, b) > 1500) pairs.push({ a, b, m: U.segDist(c.x, c.y, a.x, a.y, b.x, b.y) });
  }
  pairs.sort((p, q) => p.m - q.m);
  pairs.slice(0, n).forEach((pr, i) => {
    const fw = Math.random() < 0.5, a = { x: (fw ? pr.a : pr.b).x, y: (fw ? pr.a : pr.b).y, name: (fw ? pr.a : pr.b).name }, b = { x: (fw ? pr.b : pr.a).x, y: (fw ? pr.b : pr.a).y, name: (fw ? pr.b : pr.a).name };
    // short of where the route passes the capital, a few minutes apart, so they pass one after another
    const L = U.dist(a, b), f = U.clamp(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / (L * L) - (300 + i * 600) / L, 0.05, 0.9);
    const cs = `${U.pick(IC.NAMES.airline)} ${U.randi(100, 989)}`, cruise = IC.aspLevel(11, a, b);
    IC.spawnThreat(S, 'civ', a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, { dest: { x: b.x, y: b.y }, wps: [{ x: b.x, y: b.y }], orig: a, cs, sq: IC.squawk(), plan: { a, b, cs, pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] }, pax: U.randi(80, 290), alt: cruise, cruise, route: [b], aim: b, dist0: L });
  });
}
/* lesson 2: the bomber takes off when the player is watching for it, not on a clock that may run out first */
function bomberSoon(S) { S.camp.bomber = null; S.camp.sched.push({ t: S.time + 60, fn: IC.hfn('acaBomber', S, IC.cap(S)) }); }
// it was shot down, or got home, before the player reached it: another one comes, and the lesson goes back a step
function bomberAgain(S) {
  const b = S.camp.bomber;
  if (!b || (!b.dead && S.threats.includes(b))) return;
  IC.log(S, 'warn', 'INS', `The disguised bomber ${b.dead ? 'was shot down' : 'got home'} before you reached it. Another one is taking off: watch for the next airliner that leaves its route.`);
  S.camp.step = 0; next(S);
}
// a fighter goes up on patrol over the capital as the airliner nears it, so the look the lesson asks for can be flown
// in time (from the air bases it would meet the bomber long after it launched)
function patrol(S) {
  const b = S.camp.bomber, c = IC.cap(S);
  if (S.camp.cap || !b || U.dist(b, c) > 8000) return;
  const r = S.roster.filter(x => x.kind === 'ftr' && x.st === 'ready').sort((p, q) => U.dist(IC.baseOf(S, p.base), c) - U.dist(IC.baseOf(S, q.base), c))[0];
  if (!r || !IC.launchAir(S, r, { type: 'cap', x: c.x, y: c.y })) return;
  S.camp.cap = true;
  IC.log(S, 'info', 'AIR', `${r.name} is going up on patrol over ${c.name}.`);
}
/* lesson 6: short-range rounds come in by rail to the depots, so the helicopter has something to carry (with its own
   24 the forward depot does not draw the Central Depot's away by lorry before the player calls the helicopter) */
function heliStock(S) {
  if (IC.depots(S).some(d => (d.inv.SR || 0) >= 1)) return;
  const ds = IC.depots(S);
  for (const d of ds) d.inv.SR = (d.inv.SR || 0) + 24;
  IC.log(S, 'info', 'SUPPLY', `Short-range missiles have come in by rail: 24 each to ${ds.map(d => d.name).join(' and ')}. ${S.camp.bat.name} still waits for its lorry from the Central Depot: a helicopter can bring some now.`, S.camp.bat);
}
/* lesson 7: drones from the nearest stretch of border, about ten minutes out, so they arrive while the team the
   player calls in is still there (from the enemy's drone sites they would take hours) */
function droneWave(S, b, n) {
  const fp = S.world.fronts.flatMap(f => f.pts).sort((p, q) => U.dist(p, b) - U.dist(q, b))[0];
  const d = U.dist(fp, b) || 1, ux = (fp.x - b.x) / d, uy = (fp.y - b.y) / d;
  const op = { id: IC.nid('op'), type: 'drones', label: `drones at ${b.name}`, launched: n, done: 0, hits: 0, lost: 0, shots: 0, t0: S.time };
  S.enemy.ops.push(op);
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * 25, r = 300 + i * 15;
    IC.spawnThreat(S, 'owa', b.x + ux * r - uy * k, b.y + uy * r + ux * k, { route: [{ x: b.x, y: b.y }], aim: { x: b.x, y: b.y }, target: b, op, fromHostile: true });
  }
  return op;
}
/* lesson 7: the bomber presses in to launch from within reach of our radars and fighters (a real one may stand off
   far beyond them, and the lesson's intercept could not be flown) */
function closeBomber(S, b, op) {
  const e = S.enemy.pending.find(p => p.fn.$h === 'eSpawn' && p.fn.$a[1] === 'bmr' && p.fn.$a[4].op === op);
  const fp = S.world.fronts.flatMap(f => f.pts).sort((p, q) => U.dist(p, b) - U.dist(q, b))[0];
  if (!e || !fp) return;
  const d = U.dist(fp, b) || 1, r = Math.min(d + 300, 2000);
  e.fn.$a[4].route = [{ x: b.x + (fp.x - b.x) / d * r, y: b.y + (fp.y - b.y) / d * r }];
}
/* lesson 7: the intelligence warning said a bomber is coming, so the track is named as soon as a radar holds it
   (from 265 km out no radar of ours could tell its type) */
function namedBomber(S) {
  const op = S.camp.raid && S.camp.raid[0];
  for (const t of S.threats) if (t.type === 'bmr' && t.op === op && t.det && !t.dead && t.aff !== 'H') { t.klass = t.d.klass; IC.setAff(S, t, 'H', 'the bomber the intelligence warning named'); }
  if (bomberTaken(S)) S.camp.intercepted = true;
}
// the share of a unit's rounds on site (IC.fill counts the ones on their way too)
const onSite = (S, u) => { let a = 0, b = 0; for (const m of IC.activeMags(S, u)) { a += m.mag + m.store; b += m.max + m.storeMax; } return b ? a / b : 1; };
const bomberTaken = S => S.air.some(a => a.mission && a.mission.type === 'intercept' && a.mission.track && a.mission.track.type === 'bmr');
const affCount = (S, set) => S.threats.filter(t => !t.dead && t.det && set.includes(t.aff)).length;
/* a forced enemy operation is over when nothing it launched is still flying or waiting to launch */
function resolved(S, op) {
  if (!op) return true;
  if (S.time - op.t0 < 300 || S.enemy.pending.length) return false;
  if (S.threats.some(t => !t.dead && t.op === op && t.mission !== 'rtb')) return false;
  if (S.tels.some(t => t.mission && t.mission.op === op)) return false;
  return true;
}

/* the lessons' timetables (S.camp.sched) */
IC.H.acaBomber = (S, cap) => () => {
  // a bomber is always on hand for the lesson, however many have flown
  const eb = S.esites.find(s => s.kind === 'airbase' && !s.destroyed && !s.dormant);
  if (eb && !S.esites.some(s => s.kind === 'airbase' && !s.destroyed && !s.dormant && (s.acAvail.bmr || 0) >= 1)) eb.acAvail.bmr = 1;
  IC.enemyForceOp(S, 'disguise', { x: cap.x, y: cap.y, ref: cap, name: cap.name });
  S.camp.bomber = S.threats.filter(t => t.disguise && !t.dead).pop() || null;
  const t = S.camp.bomber;
  if (!t) return;
  // the lesson teaches the fighter's look: its radar returns are never enough to name its type
  t.idp = -1e9;
  // it leaves the airway 250 km before it passes the capital and turns 70 km off to the side to launch, so it flies
  // some minutes as a suspect first (where it would turn off on its own, it may never stray far from the airway)
  const a = t.plan.a, z = t.plan.b, L = U.dist(a, z);
  if (L < 1) return;
  const ux = (z.x - a.x) / L, uy = (z.y - a.y) / L, s0 = U.clamp((cap.x - a.x) * ux + (cap.y - a.y) * uy, 0, L);
  const fx = a.x + ux * s0, fy = a.y + uy * s0, side = (cap.x - fx) * -uy + (cap.y - fy) * ux > 0 ? -1 : 1, s1 = Math.max(0, s0 - 2500);
  t.route = [{ x: a.x + ux * s1, y: a.y + uy * s1 }, { x: fx - uy * 700 * side, y: fy + ux * 700 * side }];
};
IC.H.acaRockets = (S, t) => () => { if (!S.stats.telKills) IC.enemyForceOp(S, 'rkt', { x: t.x, y: t.y, ref: t.kind === 'city' ? t : null, name: t.name }); };
IC.LESSONS = [
  {
    id: 'radar', title: 'Eyes on the Sky', sub: 'Radars, sweeps and the identification ladder',
    learn: ['Deploy from the reserve', 'Tracks between slow sweeps', 'Detect → classify → identify'],
    setup(S) {
      const cap = IC.cap(S); depot(S);
      S.reserve = { vhf: 1, mr3d: 1 };
      focus(S, cap, 0.18);
    },
    steps: [
      { text: S => `Open the Arsenal at the bottom left, pick ${nm('vhf')} and click near ${IC.cap(S).name} to deploy it. It drives out of the depot and sets up.`, hint: tile('vhf', 'sensor'), done: S => S.units.some(u => u.type === 'vhf') },
      { text: () => 'While it drives and sets up, time runs at 1×: ten game seconds per real second. Press 3 to go 4× faster, Space to pause.', hint: { el: 'speed' }, done: S => S.units.some(u => u.type === 'vhf' && u.state === 'ready') },
      { text: () => 'It is on. The antenna turns once every 48 seconds: between sweeps each track glides on its last speed and heading, and a dashed ellipse shows where the aircraft could really be. It sees 440 km, but it cannot tell what anything is: every track is a yellow UNKNOWN. Most are far out: press Tab to jump to one, or zoom out and click one.', done: S => S.sel && S.sel.kind === 'track' },
      { text: S => `The panel on the right shows everything we know: no altitude, no identity. Now deploy ${nm('mr3d')} near ${IC.cap(S).name}. It reads transponders and recognises aircraft types inside 65 km.`, hint: tile('mr3d', 'sensor'), done: S => S.units.some(u => u.type === 'mr3d' && u.state === 'ready') },
      { text: () => 'Watch the tracks near it. Airliners squawking on their filed routes turn green: Assumed civil. Wait until four tracks have an identity.', start(S) { const c = IC.cap(S), p = { x: c.x, y: c.y, name: c.name }; for (let i = 0; i < 4; i++) IC.gaLaunch(S, p, p, { progress: 0.1 + i * 0.1, xpdr: true, alt: 1.8 }); }, done: S => affCount(S, ['A', 'N', 'H']) >= 4 },
      { text: () => `Two slow tracks are crossing the border with no transponder: Unknown for now, because nothing has told us what they are. Let them fly into the ${nk('mr3d')}'s recognition range.`, start(S) { const cap = IC.cap(S), f = frontA(S), p = f.pts[Math.floor(f.pts.length / 2)]; for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'owa', p.x - p.nx * 150 + i * 30, p.y - p.ny * 150, { route: [{ x: cap.x, y: cap.y }], aim: { x: cap.x, y: cap.y }, target: cap, fromHostile: true, spd: 0.9 }); }, done: S => S.threats.some(t => t.type === 'owa' && t.aff === 'H') },
      { text: () => 'Recognised: attack drones, hostile. That is the whole ladder: a radar detects, a better one classifies, and the pieces add up to an identity. Lesson complete.', done: () => true, wait: 40 }
    ]
  },
  {
    id: 'id', title: 'Friend or Foe', sub: 'Transponders, flight plans, visual identification',
    learn: ['Reading a track: squawk, plan, type', 'Suspect vs hostile under Tight', 'Sending a fighter to look'],
    setup(S) {
      const cap = IC.cap(S); depot(S);
      put(S, 'lr3d', cap, 150, 350); put(S, 'mr3d', cap, 300, 500); put(S, 'mrsam', cap, 120, 300);
      flight(S, 'ftr', 'VIPER 1', rear(S)); flight(S, 'ftr', 'VIPER 2', fwd(S));
      S.camp.bomber = null;
      airliners(S, cap, 5);
      focus(S, cap, 0.13);
    },
    steps: [
      { text: () => 'The sky is full of airliners, and one of them is not an airliner. Weapons are Tight: batteries only fire at tracks identified hostile. Click three green tracks and read their panels: transponder, flight plan, type.', done: S => (S.flags.viewed || new Set()).size >= 3 },
      { text: () => 'Watch for an airliner that leaves its filed route. When it does, it turns orange: Suspect. (Speed up with 3 if you like.)', start: bomberSoon, ensure: S => { bomberAgain(S); patrol(S); }, done: S => S.camp.bomber && (S.camp.bomber.aff === 'S' || S.camp.bomber.aff === 'H') },
      { text: S => `TN ${S.camp.bomber.tn} is squawking as ${S.camp.bomber.cs} but has left its route. Select it.`, hint: { track: S => S.camp.bomber }, ensure: bomberAgain, done: S => S.sel && S.sel.ref === S.camp.bomber },
      { text: () => 'A suspect could still be a lost airliner, and Tight will not shoot it. Send a fighter to look: press Intercept (V) in its panel.', hint: { el: 'insp' }, ensure: bomberAgain, done: S => S.air.some(a => a.mission && a.mission.track === S.camp.bomber) || (S.camp.bomber && S.camp.bomber.aff === 'H') },
      { text: () => 'The fighter closes to visual range. Watch.', done: S => S.camp.bomber && S.camp.bomber.aff === 'H' },
      { text: () => `Confirmed: a bomber with a civil squawk. Shoot it down before it launches. The fighters and the ${nk('mrsam')} battery will now engage it.`, done: S => S.camp.bomber && (S.camp.bomber.dead || !S.threats.includes(S.camp.bomber)) },
      { text: S => (S.camp.bomber && !S.camp.bomber.dead ? 'It got home after launching. ' : 'Splash. ') + 'Most of the tracks you will ever see are innocent; the ones that hide among them are the dangerous ones. Lesson complete.', done: () => true, wait: 40 }
    ],
    fail: S => S.stats.civLost ? 'A civilian aircraft was shot down.' : null,
    score: S => S.camp.bomber && !S.camp.bomber.released ? 3 : 2
  },
  {
    id: 'layers', title: 'Layered Defence', sub: 'Low fliers, gap fillers, doctrine',
    learn: ['Radar horizon and low-flying missiles', 'Short-range last layer', 'Shoot-look-shoot vs salvo'],
    setup(S) {
      const b = fwd(S); depot(S);
      put(S, 'mrsam', b, 120, 260, { emcon: 'on' }); put(S, 'lr3d', b, 350, 600);
      S.reserve = { gf: 1, shorad: 1 };
      focus(S, b, 0.3);
    },
    steps: [
      { text: S => `Cruise missiles fly at 30–50 m, below the horizon of most radars. Deploy ${nm('gf')} within 15 km of ${fwd(S).name}: inside the dashed ring.${tooFar(S, 'gf')}`, hint: tile('gf', 'sensor', near15), done: S => S.units.some(u => u.type === 'gf' && u.state === 'ready' && U.dist(u, fwd(S)) < 160) },
      { text: S => `Now ${nm('shorad')}, within 15 km of ${fwd(S).name} (the dashed ring). It is the last layer when something leaks through.${tooFar(S, 'shorad')}`, hint: tile('shorad', 'ad', near15), done: S => S.units.some(u => u.type === 'shorad' && u.state === 'ready' && U.dist(u, fwd(S)) < 160) },
      { text: () => 'Pick a firing doctrine in the top bar: Look (shoot, look, shoot again) saves missiles, Salvo fires two and kills more surely, Save only takes high-odds shots.', hint: { el: 'doctrine' }, done: S => !!S.flags.doctrine },
      { text: () => `Raid inbound: cruise missiles and drones, low. Watch the layers work: the ${nk('mrsam')} reaches far, the ${nk('gf')} gives it low tracks, the ${nk('shorad')} cleans up.`, start(S) { const b = fwd(S); const o = { x: b.x, y: b.y, ref: b, name: b.name }; S.camp.raid = [IC.enemyForceOp(S, 'cm', o, { n: 6, T: 2400, nat: 'A' }), IC.enemyForceOp(S, 'drones', o, { n: 4, nat: 'A' })]; }, done: S => S.time - S.camp.stepT > 600 && S.camp.raid.every(op => resolved(S, op)) },
      { text: () => 'Raid over. Layers cover each other\'s blind spots; no single system does it alone. Lesson complete.', done: () => true, wait: 40 }
    ],
    fail: S => S.camp.raid && S.camp.raid.reduce((s, op) => s + (op ? op.hits : 0), 0) >= 5 ? 'Too many hits on the base.' : null,
    score: S => { const h = S.camp.raid.reduce((s, op) => s + (op ? op.hits : 0), 0); return h === 0 ? 3 : h <= 2 ? 2 : 1; }
  },
  {
    id: 'bmd', title: 'Ballistic Missiles', sub: 'Two tiers, predicted intercept points, two interceptors per warhead',
    learn: ['Which systems can stop ballistic missiles', 'The upper and the lower tier', 'Why a battery waits before it fires'],
    setup(S) {
      S.tech.done.add('a_pac3'); S.tech.done.add('a_hatd');
      const b = fwd(S); depot(S);
      put(S, 'lrsam', b, 150, 300, { emcon: 'on' }); put(S, 'lr3d', b, 400, 700);
      S.reserve = { hatd: 1 };
      IC.enemyStageTels(S, b);
      focus(S, b, 0.2);
    },
    steps: [
      { text: () => `Select ${nm('lrsam')}. It carries two missiles: LR for aircraft, and BMD rounds that hit ballistic warheads directly, below 35 km.`, done: S => S.sel && S.sel.ref && S.sel.ref.type === 'lrsam' },
      { text: S => `That is the lower tier: one chance, late. Deploy ${nm('hatd')} from the reserve within 30 km of ${fwd(S).name}. It meets warheads 40 to 150 km up, so the lower tier gets a second chance at what it misses.`, hint: tile('hatd', 'ad'), done: S => S.units.some(u => u.type === 'hatd' && u.state === 'ready') },
      { text: () => 'Launch detected! The red ellipse is where the warheads will land. A battery does not chase a warhead: it waits, then fires two interceptors at the point where they will meet it (the blue cross, with its height and seconds to go).', start(S) { const b = fwd(S); S.camp.raid = [IC.enemyForceOp(S, 'bal', { x: b.x, y: b.y, ref: b, name: b.name }, { n: 5, T: 900 })]; }, done: S => S.time - S.camp.stepT > 600 && resolved(S, S.camp.raid[0]) },
      { text: () => 'All warheads accounted for. Two tiers, two interceptors each: most salvoes stop there. Lesson complete.', done: () => true, wait: 40 }
    ],
    score: S => { const h = S.camp.raid[0].hits; return h === 0 ? 3 : h === 1 ? 2 : 1; }
  },
  {
    id: 'ew', title: 'Jamming', sub: 'Strobes, crossing bearings and home-on-jam missiles',
    learn: ['What a jammer does to a radar', 'Locating a jammer with two radars', 'Missiles that home on jamming'],
    setup(S) {
      const b = fwd(S); depot(S);
      const rad = put(S, 'lr3d', b, 100, 250, { emcon: 'on' });
      // a stand-off jammer on station across the border, and an LRSAM that can reach it
      const eb = S.esites.filter(s => s.kind === 'airbase').sort((p, q) => U.dist(p, b) - U.dist(q, b))[0];
      let st = { x: eb.x, y: eb.y };
      for (let f = 0; f <= 1; f += 0.02) { const x = b.x + (eb.x - b.x) * f, y = b.y + (eb.y - b.y) * f; if (IC.inHostile(x, y) && IC.hostileBorderDist(x, y) > 250) { st = { x, y }; break; } }
      S.camp.jst = st;
      // the battery stands on the radar's own line to the jammer, so its strobe does not cross the radar's: finding
      // the jammer takes the second radar the player deploys
      const d = U.dist(rad, st), k = Math.max(0, (d - 750) / d);
      const bat = put(S, 'lrsam', { x: rad.x + (st.x - rad.x) * k, y: rad.y + (st.y - rad.y) * k }, 0, 40, { emcon: 'on' });
      bat.roe = 'hold';
      S.camp.bat = bat; S.camp.rad = rad;
      S.camp.jam = IC.spawnThreat(S, 'ewj', st.x, st.y, { home: eb, mission: 'jam', route: [], st, jamT: 1e6, jamming: true });
      S.reserve = { mr3d: 1 };
      focus(S, b, 0.12);
    },
    steps: [
      { text: S => `A stand-off jammer is on station across the border. Select ${S.camp.rad.name}: the amber wedge is the jammer's strobe. Along it the radar only sees what is close enough to burn through; everywhere else it sees normally.`, hint: { at: S => S.camp.rad }, done: S => S.sel && S.sel.ref === S.camp.rad && !!S.camp.rad.jammers },
      { text: () => `A strobe gives a direction, not a range. Deploy ${nm('mr3d')} at least 40 km to one side. Where the two strobes cross, the jammer is.`, hint: tile('mr3d', 'sensor'), done: S => S.camp.jam.dead || (S.camp.jam.triT > 0 && S.units.some(u => u.type === 'mr3d' && u.state === 'ready' && (u.jammers || []).includes(S.camp.jam))) },
      { text: S => `Located. Jamming is a hostile act, so the jammer is marked hostile. ${S.camp.bat.name} is on Weapons Hold: select it and click Free under Rules in its panel (W steps through National, Free, Tight and Hold). Its missiles home on the jammer's own noise.`, hint: { at: S => S.camp.bat }, done: S => S.camp.jam.dead },
      { text: () => 'The jammer is down and the strobes are gone. Jammers ride with every big raid: two radars far apart, and missiles that home on jamming, are the answer. Lesson complete.', done: () => true, wait: 40 }
    ]
  },
  {
    id: 'logi', title: 'Keep Them Fed', sub: 'Depots, truck companies, helicopters',
    learn: ['Depot service areas', 'Resupply priority and truck companies', 'Helicopter resupply'],
    setup(S) {
      // the Central Depot has only one lorry load of short-range rounds: the battery still has room for the helicopter's
      const dep = depot(S, { IR: 12, SR: 12, MR: 12, LR: 8, TBD: 8, RKT: 24 });
      // a town a long drive from the Central Depot (300–500 km, a few hours by lorry) but within a helicopter's
      // reach, and the helicopter at the air base nearest the depot
      const t = IC.cities(S).filter(c => !c.capital).sort((a, b) => Math.abs(U.dist(a, dep) - 4000) - Math.abs(U.dist(b, dep) - 4000))[0];
      S.camp.town = t;
      const u = put(S, 'shorad', t, t.r + 40, t.r + 160, { emcon: 'on' });
      for (const m of u.mags) { m.mag = 0; m.store = 0; }
      S.camp.bat = u;
      S.reserve = { depot: 1 };
      flight(S, 'heli', 'HOOK 1', IC.bases(S).filter(b => b.kind === 'airbase').sort((a, b) => U.dist(a, dep) - U.dist(b, dep))[0] || fwd(S));
      S.budget = 400;
      focus(S, t, 0.25);
    },
    steps: [
      { text: S => `${S.camp.bat.name} near ${S.camp.town.name} has no missiles left, and the central depot is far away. Deploy the Forward Depot within 60 km of it.`, hint: tile('depot', 'log'), done: S => S.units.some(u => u.type === 'depot' && !u.central && u.state === 'ready' && U.dist(u, S.camp.bat) < 600) },
      { text: () => 'A depot serves units inside its ring, and refills from the Central Depot. Select it and set its resupply priority to First: units in its area go to the front of the queue.', done: S => S.units.some(u => u.type === 'depot' && !u.central && u.pri === 'first') },
      { text: () => 'It came with two truck companies. Add a third from its panel: more trucks, more deliveries at once.', done: S => S.units.some(u => u.type === 'depot' && !u.central && S.vehicles.filter(v => v.home === u).length >= 3) },
      { text: S => `Trucks take time. For an emergency, select ${S.camp.bat.name} and press Resupply by helicopter (H): its panel shows where the missiles come from, which helicopter and when it lands.`, start: heliStock, done: S => S.air.some(a => a.job && a.job.to === S.camp.bat) || S.camp.bat.mags.some(m => m.mag + m.store > 0) },
      { text: S => `Now wait until ${S.camp.bat.name} is re-armed. Its panel says when the next load arrives; click a convoy to see its route. (3 speeds things up.)`, done: S => onSite(S, S.camp.bat) > 0.4 },
      { text: () => 'Re-armed. Set the network up once and it runs itself: depots, priorities and trucks. Lesson complete.', done: () => true, wait: 40 }
    ]
  },
  {
    id: 'airbase', title: 'The Air Base', sub: 'Call-in teams, a raid, the damage and the repairs',
    learn: ['Calling in a missile team', 'An intercept from the air picture', 'What a raid does to a base', 'Repairing runways and hangars'],
    setup(S) {
      const b = fwd(S);
      depot(S);
      put(S, 'mrsam', b, 120, 250, { emcon: 'on' }); put(S, 'shorad', b, 50, 120, { emcon: 'on' }); put(S, 'lr3d', b, 350, 600); put(S, 'gf', b, 150, 300);
      flight(S, 'ftr', 'VIPER 1', b); flight(S, 'ftr', 'VIPER 2', b); flight(S, 'ftr', 'LANCE 1', b);
      for (const s of S.esites) s.dormant = !['airbase', 'drone', 'mrbm', 'bm', 'staging', 'supply'].includes(s.kind);
      IC.enemyStageTels(S, b);
      focus(S, b, 0.3);
      S.budget = 700;
      S.camp.acBefore = S.roster.filter(r => r.base === b.id).length;
    },
    steps: [
      { text: S => `Drones are heading for ${fwd(S).name}. Call in a ${nk('manpads')} team (shoulder-fired missiles): press G (or the team tile in the arsenal) and click near the base. A helicopter drops it in seconds; it fights for eight minutes, then is lifted out.`, hint: tile('callin', 'ad'),
        start(S) { S.camp.drones = droneWave(S, fwd(S), 5); },
        done: S => S.units.some(u => u.callin) },
      { text: () => 'The team is in position: the ring is its reach, the arc the time it has left. Watch the drones come in.', done: S => S.time - S.camp.stepT > 300 && resolved(S, S.camp.drones) },
      { text: S => `Warning: an enemy bomber is heading for launch range of ${fwd(S).name}, and missile launchers are moving behind it. When it shows up, the Air picture on the left lists it with the time it needs to get here. Click its row, or press Tab.`,
        start(S) { const b = fwd(S), o = { x: b.x, y: b.y, ref: b, name: b.name }; const T = Math.max(2400, IC.enemyLead(S, o) + 300); S.camp.raid = [IC.enemyForceOp(S, 'bomber', o, { T }), IC.enemyForceOp(S, 'mrbm', o, { n: 2, T }), IC.enemyForceOp(S, 'bal', o, { n: 2, T })]; closeBomber(S, b, S.camp.raid[0]); },
        hint: { el: 'airpic' }, ensure: namedBomber, done: S => (S.sel && S.sel.kind === 'track' && S.sel.ref.type === 'bmr') || bomberTaken(S) || S.camp.raid.every(op => resolved(S, op)) },
      { text: () => 'Now send a fighter. Press Intercept (V) in its panel for the quickest flight, or select VIPER 1 (Air room, A: Select) and click the bomber. The map shows where they meet, how long it takes, the fuel left after and the kill chance. Commit (Enter).', hint: { el: 'insp' }, ensure: namedBomber,
        done: S => bomberTaken(S) || S.camp.raid.every(op => resolved(S, op)) },
      { text: () => 'The fighter flies to the predicted meeting point, not after the symbol, and fires when the bomber is in reach at its height. The batteries take the cruise missiles. We have nothing here that stops ballistic missiles.', ensure: namedBomber,
        done: S => S.time - S.camp.stepT > 600 && S.camp.raid.every(op => resolved(S, op)) },
      { text: S => `Damage report. Select ${fwd(S).name} to see what was hit.`, hint: { at: S => fwd(S) }, done: S => S.sel && S.sel.ref === fwd(S) },
      { text: S => `The panel shows the runway, hangars and aircraft. ${IC.baseStatus(S, fwd(S)).runway ? 'The runway came through and is open.' : 'The runway is closed: with Auto-repair on (Works tab) the engineers start on it by themselves.'} Rebuild or repair a hangar too: engineers work a couple of jobs at once, so queue what matters first.`, hint: { el: 'insp' }, done: S => IC.baseStatus(S, fwd(S)).runway && !!S.flags.hangarWork },
      { text: () => 'The base is flying again. Lesson complete.', done: () => true, wait: 40 }
    ],
    // three stars need the intercept the lesson asks for, not only a base that came through
    score: S => { const lost = S.stats.acLost, k = lost <= 1 ? 3 : lost <= 3 ? 2 : 1; return S.camp.intercepted ? k : Math.min(k, 2); }
  },
  {
    id: 'strike', title: 'Fire Back', sub: 'Find the launcher from the air, hit it before it moves',
    learn: ['Reconnaissance drones', 'Air strikes on launchers', 'Battle damage reports'],
    setup(S) {
      depot(S);
      flight(S, 'isr', 'REAPER 1', fwd(S));
      flight(S, 'ucav', 'HAWK 1', fwd(S));
      const v = flight(S, 'ftr', 'VIPER 1', fwd(S)); v.load = 'strike';
      // the rocket battery nearest the base (a drone flight away on the big map) shells the nearest place it can reach
      const b = fwd(S);
      const site = S.esites.filter(s => s.kind === 'rkt').sort((a, c) => U.dist(a, b) - U.dist(c, b))[0];
      // on the large map the nearest battery may be far along the border: for the lesson it stands across the
      // border from the base, 40 km into their side
      const fp = S.world.fronts.flatMap(f => f.pts).sort((p, q) => U.dist(p, b) - U.dist(q, b))[0];
      if (site && fp) for (let d = 400; d < 1200; d += 100) { const x = fp.x - fp.nx * d, y = fp.y - fp.ny * d; if (IC.inHostile(x, y)) {
        site.x = x; site.y = y;
        for (const tl of S.tels) if (tl.site === site) for (let k = 0; k < 20; k++) { const hx = x + U.rand(-150, 150), hy = y + U.rand(-150, 150); if (IC.inHostile(hx, hy)) { tl.x = hx; tl.y = hy; break; } }
        break;
      } }
      const t = S.world.villages.filter(v => v.home).concat(IC.cities(S)).sort((a, c) => U.dist(a, site) - U.dist(c, site))[0];
      S.camp.town = t;
      for (let k = 0; k < 12; k++) S.camp.sched.push({ t: S.time + 300 + k * 2400, fn: IC.hfn('acaRockets', S, t) });
      if (site) site.pk = 1;
      S.camp.site = site;
      focus(S, t, 0.2);
    },
    steps: [
      { text: S => `Rockets are about to fall on ${S.camp.town.name}. Send REAPER 1 to look for the launcher: open the Air room (A), pick REAPER 1, Recon, and click the dashed enemy area across the border.`, hint: { el: 'rail-air' }, ensure: reaper, done: S => S.tels.some(t => t.kind === 'rkt' && t.known && !t.dead) },
      { text: () => 'Launcher located! Strike it from the air: select HAWK 1 (a strike drone with two bombs) or VIPER 1 (strike loadout) and right-click the launcher, or pick one in the launcher\'s panel. Launchers move soon after they are seen: if it has gone, send the drone to find it again.', ensure: S => { reaper(S); strikers(S); }, done: S => S.stats.telKills >= 1 },
      { text: () => 'Destroyed. Every strike ends with a damage report: read them, because a launcher that moved means an empty crater. Lesson complete.', done: () => true, wait: 40 }
    ]
  }
];

IC.academyInit = function (S, id) {
  const L = IC.LESSONS.find(l => l.id === id) || IC.LESSONS[0];
  S.camp = { comms: [], tips: new Set(), cards: [], chapter: L.title, objs: [], sched: [], cool: {}, lesson: L, step: -1, stepT: S.time, focus: null };
  S.enemy.allow = new Set();
  S.ad.roe = 'tight';
  // fair weather for the whole lesson: storms would ground the helicopters a lesson needs
  S.weather.kind = S.weather.prev = U.pick(['clear', 'scattered']); S.weather.fade = 1; S.weather.hold = true;
  L.setup(S);
  for (const b of IC.bases(S)) IC.assignSlots(S, b);
  IC.card(S, L.title, 'Academy', L.sub + '. You will learn: ' + L.learn.join(' · ') + '.', 'chapter');
  next(S);
};
function next(S) {
  const C = S.camp, L = C.lesson;
  C.step++;
  C.stepT = S.time; C.waitT = 0;
  const st = L.steps[C.step];
  if (!st) return;
  if (st.start) st.start(S);
  IC.log(S, 'info', 'INS', typeof st.text === 'function' ? st.text(S) : st.text);
  IC.sfx && IC.sfx.ui('ok');
}
IC.academyTick = function (S, dt) {
  const C = S.camp, L = C.lesson;
  for (const e of C.sched) if (!e.done && S.time >= e.t) { e.done = true; e.fn(); }
  if (S.over) return;
  const why = L.fail && L.fail(S);
  if (why) { S.over = why; S.won = false; IC.emit(S, 'over', why); return; }
  const st = L.steps[C.step];
  if (!st) return;
  C.checkT = (C.checkT || 0) - dt;
  if (C.checkT > 0) return;
  C.checkT = 0.5;
  if (st.ensure) st.ensure(S);
  if (!st.done(S)) return;
  if (st.wait) { C.waitT += 0.5; if (C.waitT < st.wait) return; }
  if (C.step >= L.steps.length - 1) {
    S.over = `Lesson complete: ${L.title}`; S.won = true;
    S.stars = L.score ? L.score(S) : 3;
    IC.emit(S, 'lessonDone', { id: L.id, stars: S.stars });
    return;
  }
  next(S);
};
IC.stepText = S => { const C = S.camp, L = C && C.lesson; if (!L) return []; return L.steps.map((s, i) => ({ text: typeof s.text === 'function' ? (i <= C.step ? s.text(S) : '') : s.text, done: i < C.step, cur: i === C.step })); };
IC.stepHint = S => { const C = S.camp, L = C && C.lesson; const st = L && L.steps[C.step]; return st && st.hint ? st.hint : null; };

/* flags the lessons check */
IC.on((S, type, d) => {
  if (!S.flags) return;
  if (type === 'select' && d && d.kind === 'track') (S.flags.viewed = S.flags.viewed || new Set()).add(d.ref.id);
  if (type === 'warroom') S.flags['room_' + d] = true;
  if (type === 'doctrine') S.flags.doctrine = true;
  if (type === 'baseWorkDone' && d.w && /hangar|shelter/.test(d.w.label.toLowerCase())) S.flags.hangarWork = true;
  if (type === 'aptBuilt' && d.part && (d.part.kind === 'hangar' || d.part.kind === 'has')) S.flags.hangarWork = true;
  if (type === 'teamIn') S.flags.team = true;
});

})(window.IC);
