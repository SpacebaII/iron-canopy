/* Iron Canopy — the Academy. Short, scripted lessons that each teach one system and check that the player
   actually did it. The open campaign never scripts like this; the Academy is where scripted scenes live. */
(function (IC) {
'use strict';
const U = IC.U;
// units by the names the arsenal shows: "Kestrel · medium-range search radar", or just "Kestrel"
const nm = t => IC.fullName(IC.UNITS[t]), nk = t => IC.UNITS[t].name;

/* ---------- helpers for lesson setups ---------- */
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
const affCount = (S, set) => S.threats.filter(t => !t.dead && t.det && set.includes(t.aff)).length;
/* a forced enemy operation is over when nothing it launched is still flying or waiting to launch */
function resolved(S, op) {
  if (!op) return true;
  if (S.time - op.t0 < 300 || S.enemy.pending.length) return false;
  if (S.threats.some(t => !t.dead && t.op === op && t.mission !== 'rtb')) return false;
  if (S.tels.some(t => t.mission && t.mission.op === op)) return false;
  return true;
}

IC.LESSONS = [
  {
    id: 'radar', title: 'Eyes on the Sky', sub: 'Radars, sweeps and the identification ladder',
    learn: ['Deploy from the reserve', 'How slow sweeps make tracks blink', 'Detect → classify → identify'],
    setup(S) {
      const cap = IC.cap(S); depot(S);
      S.reserve = { vhf: 1, mr3d: 1 };
      focus(S, cap, 0.18);
    },
    steps: [
      { text: S => `Open the Arsenal at the bottom left, pick ${nm('vhf')} and click near ${IC.cap(S).name} to deploy it. It drives out of the depot and sets up.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'vhf') },
      { text: () => 'While it drives and sets up, time runs at 1×: ten game seconds per real second. Press 3 to go 4× faster, Space to pause.', hint: { el: 'speed' }, done: S => S.units.some(u => u.type === 'vhf' && u.state === 'ready') },
      { text: () => 'It is on. The antenna turns once every 48 seconds, so a track only moves when the sweep passes it, then blinks while it coasts. It sees 440 km, but it cannot tell what anything is: every track is a yellow UNKNOWN. Click one.', done: S => S.sel && S.sel.kind === 'track' },
      { text: S => `The panel on the right shows everything we know: no altitude, no identity. Now deploy ${nm('mr3d')} near ${IC.cap(S).name}. It reads transponders and recognises aircraft types inside 65 km.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'mr3d' && u.state === 'ready') },
      { text: () => 'Watch the tracks near it. Airliners squawking on their filed routes turn green: Assumed civil. Wait until four tracks have an identity.', done: S => affCount(S, ['A', 'N', 'H']) >= 4 },
      { text: () => `Two slow tracks are crossing the border with no transponder. They will show Suspect. Let them fly into the ${nk('mr3d')}'s recognition range.`, start(S) { const cap = IC.cap(S), f = frontA(S), p = f.pts[Math.floor(f.pts.length / 2)]; for (let i = 0; i < 2; i++) IC.spawnThreat(S, 'owa', p.x - p.nx * 150 + i * 30, p.y - p.ny * 150, { route: [{ x: cap.x, y: cap.y }], aim: { x: cap.x, y: cap.y }, target: cap, fromHostile: true, spd: 0.9 }); }, done: S => S.threats.some(t => t.type === 'owa' && t.aff === 'H') },
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
      S.camp.sched.push({ t: S.time + 600, fn: () => { IC.enemyForceOp(S, 'disguise', { x: cap.x, y: cap.y, ref: cap, name: cap.name }); S.camp.bomber = S.threats.find(t => t.disguise); } });
      focus(S, cap, 0.13);
    },
    steps: [
      { text: () => 'The sky is full of airliners, and one of them is not an airliner. Weapons are Tight: batteries only fire at tracks identified hostile. Click three green tracks and read their panels: transponder, flight plan, type.', done: S => (S.flags.viewed || new Set()).size >= 3 },
      { text: () => 'Watch for an airliner that leaves its filed route. When it does, it turns orange: Suspect. (Speed up with 3 if you like.)', done: S => S.camp.bomber && (S.camp.bomber.aff === 'S' || S.camp.bomber.aff === 'H') },
      { text: S => `TN ${S.camp.bomber.tn} is squawking as ${S.camp.bomber.cs} but has left its route. Select it.`, hint: { track: S => S.camp.bomber }, done: S => S.sel && S.sel.ref === S.camp.bomber },
      { text: () => 'A suspect could still be a lost airliner, and Tight will not shoot it. Send a fighter to look: press Intercept (V) in its panel.', hint: { el: 'insp' }, done: S => S.air.some(a => a.mission && a.mission.track === S.camp.bomber) || (S.camp.bomber && S.camp.bomber.aff === 'H') },
      { text: () => 'The fighter closes to visual range. Watch.', done: S => S.camp.bomber && S.camp.bomber.aff === 'H' },
      { text: () => `Confirmed: a bomber with a civil squawk. Shoot it down before it launches. The fighters and the ${nk('mrsam')} battery will now engage it.`, done: S => S.camp.bomber && S.camp.bomber.dead },
      { text: () => 'Splash. Most of the tracks you will ever see are innocent; the ones that hide among them are the dangerous ones. Lesson complete.', done: () => true, wait: 40 }
    ],
    fail: S => S.stats.civLost ? 'A civilian aircraft was shot down.' : null,
    score: S => S.camp.bomber && !S.camp.bomber.released ? 3 : 2
  },
  {
    id: 'layers', title: 'Layered Defense', sub: 'Low fliers, gap fillers, doctrine',
    learn: ['Radar horizon and low-flying missiles', 'Short-range last layer', 'Shoot-look-shoot vs salvo'],
    setup(S) {
      const b = fwd(S); depot(S);
      put(S, 'mrsam', b, 120, 260, { emcon: 'on' }); put(S, 'lr3d', b, 350, 600);
      S.reserve = { gf: 1, shorad: 1 };
      focus(S, b, 0.3);
    },
    steps: [
      { text: S => `Cruise missiles fly at 30–50 m, below the horizon of most radars. Deploy ${nm('gf')} within 15 km of ${fwd(S).name}.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'gf' && u.state === 'ready' && U.dist(u, fwd(S)) < 160) },
      { text: S => `Now ${nm('shorad')}, close to ${fwd(S).name}. It is the last layer when something leaks through.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'shorad' && u.state === 'ready' && U.dist(u, fwd(S)) < 160) },
      { text: () => 'Pick a firing doctrine in the top bar: Shoot-look-shoot saves missiles, Salvo fires two and kills more surely, Conserve only takes high-odds shots.', hint: { el: 'doctrine' }, done: S => !!S.flags.doctrine },
      { text: () => `Raid inbound: cruise missiles and drones, low. Watch the layers work: the ${nk('mrsam')} reaches far, the ${nk('gf')} gives it low tracks, the ${nk('shorad')} cleans up.`, start(S) { const b = fwd(S); const o = { x: b.x, y: b.y, ref: b, name: b.name }; S.camp.raid = [IC.enemyForceOp(S, 'cm', o, { n: 6, T: 2400, nat: 'A' }), IC.enemyForceOp(S, 'drones', o, 4)]; }, done: S => S.time - S.camp.stepT > 600 && S.camp.raid.every(op => resolved(S, op)) },
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
      { text: S => `That is the lower tier: one chance, late. Deploy ${nm('hatd')} from the reserve within 30 km of ${fwd(S).name}. It meets warheads 40 to 150 km up, so the lower tier gets a second chance at what it misses.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'hatd' && u.state === 'ready') },
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
      const d = U.dist(b, st), k = Math.max(0, (d - 750) / d);
      const bat = put(S, 'lrsam', { x: b.x + (st.x - b.x) * k, y: b.y + (st.y - b.y) * k }, 0, 120, { emcon: 'on' });
      bat.roe = 'hold';
      S.camp.bat = bat; S.camp.rad = rad;
      S.camp.jam = IC.spawnThreat(S, 'ewj', st.x, st.y, { home: eb, mission: 'jam', route: [], st, jamT: 1e6, jamming: true });
      S.reserve = { mr3d: 1 };
      focus(S, b, 0.12);
    },
    steps: [
      { text: S => `A stand-off jammer is on station across the border. Select ${S.camp.rad.name}: the amber wedge is the jammer's strobe. Along it the radar only sees what is close enough to burn through; everywhere else it sees normally.`, hint: { at: S => S.camp.rad }, done: S => S.sel && S.sel.ref === S.camp.rad && !!S.camp.rad.jammers },
      { text: () => `A strobe gives a direction, not a range. Deploy ${nm('mr3d')} at least 40 km to one side. Where the two strobes cross, the jammer is.`, hint: { el: 'arsenal' }, done: S => S.camp.jam.dead || S.camp.jam.triT > 0 },
      { text: S => `Located. Jamming is a hostile act, so the jammer is marked hostile. ${S.camp.bat.name} is on Weapons Hold: select it and set its weapons to Free (W). Its missiles home on the jammer's own noise.`, hint: { at: S => S.camp.bat }, done: S => S.camp.jam.dead },
      { text: () => 'The jammer is down and the strobes are gone. Jammers ride with every big raid: two radars far apart, and missiles that home on jamming, are the answer. Lesson complete.', done: () => true, wait: 40 }
    ]
  },
  {
    id: 'logi', title: 'Keep Them Fed', sub: 'Depots, truck companies, helicopters',
    learn: ['Depot service areas', 'Resupply priority and truck companies', 'Helicopter resupply'],
    setup(S) {
      depot(S);
      const t = borderTown(S);
      const u = put(S, 'shorad', t, t.r + 40, t.r + 160, { emcon: 'on' });
      for (const m of u.mags) { m.mag = 0; m.store = 0; }
      S.camp.bat = u;
      S.reserve = { depot: 1 };
      flight(S, 'heli', 'HOOK 1', fwd(S));
      S.budget = 400;
      focus(S, t, 0.25);
    },
    steps: [
      { text: S => `${S.camp.bat.name} near ${borderTown(S).name} has no missiles left, and the central depot is far away. Deploy the Forward Depot within 60 km of it.`, hint: { el: 'arsenal' }, done: S => S.units.some(u => u.type === 'depot' && !u.central && u.state === 'ready' && U.dist(u, S.camp.bat) < 600) },
      { text: () => 'A depot serves units inside its ring, and refills from the Central Depot. Select it and set its resupply priority to First: units in its area go to the front of the queue.', done: S => S.units.some(u => u.type === 'depot' && !u.central && u.pri === 'first') },
      { text: () => 'It came with two truck companies. Add a third from its panel: more trucks, more deliveries at once.', done: S => S.units.some(u => u.type === 'depot' && !u.central && S.vehicles.filter(v => v.home === u).length >= 3) },
      { text: S => `Trucks take time. For an emergency, select ${S.camp.bat.name} and press Air resupply (H): a helicopter flies missiles straight in.`, done: S => S.air.some(a => a.job && a.job.to === S.camp.bat) || S.camp.bat.mags.some(m => m.mag + m.store > 0) },
      { text: S => `Now wait until ${S.camp.bat.name} is re-armed. Its panel says when the next load arrives; click a convoy to see its route. (3 speeds things up.)`, done: S => IC.fill(S, S.camp.bat) > 0.4 },
      { text: () => 'Re-armed. Set the network up once and it runs itself: depots, priorities and trucks. Lesson complete.', done: () => true, wait: 40 }
    ]
  },
  {
    id: 'airbase', title: 'The Air Base', sub: 'Call-in teams, a raid, the damage and the repairs',
    learn: ['Calling in a missile team', 'What a raid does to a base', 'Repairing runways and hangars'],
    setup(S) {
      const b = fwd(S);
      depot(S);
      put(S, 'mrsam', b, 120, 250, { emcon: 'on' }); put(S, 'shorad', b, 50, 120, { emcon: 'on' }); put(S, 'lr3d', b, 350, 600); put(S, 'gf', b, 150, 300);
      flight(S, 'ftr', 'VIPER 1', b); flight(S, 'ftr', 'VIPER 2', b); flight(S, 'ftr', 'LANCE 1', b);
      for (const s of S.esites) s.dormant = !['airbase', 'mrbm', 'bm', 'staging', 'supply'].includes(s.kind);
      IC.enemyStageTels(S, b);
      focus(S, b, 0.3);
      S.budget = 700;
      S.camp.acBefore = S.roster.filter(r => r.base === b.id).length;
    },
    steps: [
      { text: S => `Drones are heading for ${fwd(S).name}. Call in a ${nk('manpads')} team (shoulder-fired missiles): press G (or the team tile in the arsenal) and click near the base. A helicopter drops it in seconds; it fights for eight minutes, then is lifted out.`, hint: { el: 'arsenal' },
        start(S) { const b = fwd(S); S.camp.drones = IC.enemyForceOp(S, 'drones', { x: b.x, y: b.y, ref: b, name: b.name }, 5); },
        done: S => S.units.some(u => u.callin) },
      { text: () => 'The team is in position: the ring is its reach, the arc the time it has left. Watch the drones come in.', done: S => S.time - S.camp.stepT > 300 && resolved(S, S.camp.drones) },
      { text: S => `Warning: an enemy bomber is heading for launch range of ${fwd(S).name}, and missile launchers are moving behind it. Fight the raid: fighters can hunt the bomber, the batteries take the cruise missiles. We have nothing here that stops ballistic missiles.`,
        start(S) { const b = fwd(S), o = { x: b.x, y: b.y, ref: b, name: b.name }; const T = Math.max(2400, IC.enemyLead(S, o) + 300); S.camp.raid = [IC.enemyForceOp(S, 'bomber', o, { T }), IC.enemyForceOp(S, 'mrbm', o, { n: 2, T }), IC.enemyForceOp(S, 'bal', o, { n: 2, T })]; },
        done: S => S.time - S.camp.stepT > 1200 && S.camp.raid.every(op => resolved(S, op)) },
      { text: S => `Damage report. Select ${fwd(S).name} to see what was hit.`, hint: { at: S => fwd(S) }, done: S => S.sel && S.sel.ref === fwd(S) },
      { text: () => 'The panel shows the runway, hangars and aircraft. Engineers already started on the runway. Rebuild or repair a hangar too: engineers work a couple of jobs at once, so queue what matters first.', hint: { el: 'insp' }, done: S => IC.baseStatus(S, fwd(S)).runway && !!S.flags.hangarWork },
      { text: () => 'The base is flying again. Lesson complete.', done: () => true, wait: 40 }
    ],
    score: S => { const lost = S.stats.acLost; return lost <= 1 ? 3 : lost <= 3 ? 2 : 1; }
  },
  {
    id: 'strike', title: 'Fire Back', sub: 'Find the launcher from the air, hit it before it moves',
    learn: ['Reconnaissance drones', 'Air strikes on launchers', 'Battle damage reports'],
    setup(S) {
      depot(S);
      flight(S, 'isr', 'REAPER 1', fwd(S));
      flight(S, 'ucav', 'HAWK 1', fwd(S));
      const v = flight(S, 'ftr', 'VIPER 1', fwd(S)); v.load = 'strike';
      // the rocket battery shells the nearest place it can reach
      const town = borderTown(S);
      const site = S.esites.filter(s => s.kind === 'rkt').sort((a, c) => U.dist(a, town) - U.dist(c, town))[0];
      const t = S.world.villages.filter(v => v.home).concat(IC.cities(S)).sort((a, c) => U.dist(a, site) - U.dist(c, site))[0];
      S.camp.town = t;
      for (let k = 0; k < 12; k++) S.camp.sched.push({ t: S.time + 300 + k * 2400, fn: () => { if (!S.stats.telKills) IC.enemyForceOp(S, 'rkt', { x: t.x, y: t.y, ref: t.kind === 'city' ? t : null, name: t.name }); } });
      if (site) site.pk = 1;
      S.camp.site = site;
      focus(S, t, 0.2);
    },
    steps: [
      { text: S => `Rockets are about to fall on ${S.camp.town.name}. Send REAPER 1 to look for the launcher: open the Air war room (A), pick REAPER 1, Recon, and click the dashed enemy area across the border.`, hint: { el: 'rail-air' }, ensure: reaper, done: S => S.tels.some(t => t.kind === 'rkt' && t.known && !t.dead) },
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
