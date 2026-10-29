/* Iron Canopy — the enemy's weapons as families with named versions (tiers), headless.
   Each family is one threat type in IC.THR. Its versions are what the enemy fields as the war goes on: an early drone
   that is slow and sometimes falls out of the sky, a later one that is fast, changes height and picks a new target
   when its own is gone. A version's numbers (IC.ARMS_D[key]: the type's IC.THR entry with the version's changes)
   are what the flight models read as t.d, so t.d.spd, t.d.dmg and the rest are the version's.

   The commander moves to a version when its act reaches the version's `act`; what happens to its weapons (shot down,
   crashed, got through) moves each family's favour (S.arms.f[type].fav): a family we keep shooting down is used less
   in its raids, whatever version it is on, and comes back slowly. The first time the player meets a version, an
   encounter card is queued (S.arms.cards) and 'encounter' is emitted.

   For a wave builder: IC.armsCatalog() lists every version with its numbers; IC.spawnThreat(S, type, x, y,
   { tier: key }) or IC.launchBallistic(..., { tier: key }) flies one; S.arms.force[type] = key pins a family. */
(function (IC) {
'use strict';
const U = IC.U;

/* fx: what the version changes in the type's numbers. Beyond the usual (spd, alt, rcs, hp, dmg, evasive, vAvg):
   crash   share that come down on their own on the way (an engine, a cheap receiver)
   hop     height (km) it jumps up to and back from treetop height, to break radar locks
   retgt   follows a target that moves, and takes the nearest other target when its own is gone
   cep     ballistic scatter (world units, 100 m) round the aim point
   boost   radar targets left by a separating booster (they look like warheads and fall short)
   weaveF  share of a ballistic flight after which a manoeuvring warhead weaves; weave its width
   endur   a loitering munition's endurance (s); radar how much more it wants a radiating radar
   spread  a rocket salvo's scatter against the first version's
   blind   chance an anti-radiation missile still hits once the radar it homed on goes silent
   size    [length m, weight kg] for the card: how big the thing coming at you is */
IC.ARMS = {
  owa: { fam: 'one-way attack drones', size: [3.5, 200], tiers: [
    { key: 'owa1', nick: 'Moth', act: 0, fx: { spd: 0.42, dmg: 14, crash: 0.17 },
      sum: 'A propeller drone built in a hurry. It flies low at 150 km/h on a route fixed before take-off, and about one in six comes down on its own before it gets anywhere.',
      good: ['Cheap: they send them by the dozen', 'Low and small: radars see it late, behind hills not at all'],
      bad: ['Slow: an hour or more inside our airspace', 'Guns and short-range missiles take it easily', 'Its engine fails: one in six crashes on the way'],
      stop: 'Guns, counter-drone guns and heat-seeking missiles. Do not spend a long-range missile on a Moth.' },
    { key: 'owa2', nick: 'Hawkmoth', act: 2, fx: {},
      sum: 'The Moth with a better engine and a satellite receiver. It no longer falls out of the sky, flies at 180 km/h and weaves a little on the way.',
      chg: 'No longer crashes on its own, a little faster, a bigger warhead.',
      good: ['Gets there: no engine failures', 'Low and small, like the Moth'],
      bad: ['Still slow and easy for guns', 'Steers by satellite: a GPS jammer sends it off course'],
      stop: 'Guns and short-range missiles; a GPS jammer on its way in sends it astray.' },
    { key: 'owa3', nick: 'Deathshead', act: 4, fx: { spd: 0.9, dmg: 28, rcs: 0.07, hop: 2, retgt: true },
      sum: 'Jet-assisted, 330 km/h. It jumps between treetop height and 2 km to shake off radar locks, follows a target that moves, and if its target is already gone it dives on the nearest other one.',
      chg: 'Almost twice as fast, jumps up and down to break locks, a warhead twice the size, and it picks a new target when its own is gone.',
      good: ['Fast for a drone: less time to engage it', 'Breaks radar locks by changing height', 'Never wasted: it finds another target'],
      bad: ['Still a drone: guns and short-range missiles kill it when they get a shot', 'Still steers by satellite: GPS jammers work'],
      stop: 'Layers of guns and short-range missiles close to what it is after; radars that see low, so it is tracked while it jumps.' }
  ] },
  jdr: { fam: 'jet attack drones', size: [3.2, 320], tiers: [
    { key: 'jdr1', nick: 'Wasp', act: 0, fx: {},
      sum: 'A jet-powered drone at 540 km/h and 2.5 km up: faster and higher than the propeller drones it flies with.',
      good: ['Fast enough that guns have little time', 'Comes mixed into drone swarms, which hides it'],
      bad: ['Higher: radars see it from far away', 'A short-range missile still kills it'],
      stop: 'Short-range and medium-range missiles. Guns only close to the target.' },
    { key: 'jdr2', nick: 'Mantis', act: 4, fx: { spd: 2, dmg: 32, evasive: 0.5, retgt: true },
      sum: 'A faster Wasp, 720 km/h, that jinks in its last minutes and changes target when its own is gone or moves.',
      chg: 'A third faster, jinks near the target, a bigger warhead, picks a new target.',
      good: ['Fast and jinking near the target', 'Never wasted: it finds another target'],
      bad: ['Still high enough to be seen far out', 'Medium-range missiles meet it well before it jinks'],
      stop: 'Engage it far out with medium-range missiles, before its last minutes.' }
  ] },
  lm: { fam: 'loitering munitions', size: [1.8, 25], tiers: [
    { key: 'lm1', nick: 'Vulture', act: 0, fx: {},
      sum: 'A small drone that circles over the front for up to an hour, looking for a vehicle or a battery, then dives on it.',
      good: ['Tiny on radar', 'Hunts: it goes for whatever it finds, radars that are on first'],
      bad: ['Short reach: only near the border', 'Slow; anything that sees it can kill it'],
      stop: 'Guns and short-range missiles near units at the front. A radar switched off is harder for it to find.' },
    { key: 'lm2', nick: 'Condor', act: 4, fx: { dmg: 40, rcs: 0.015, endur: 5400, radar: 3 },
      sum: 'The Vulture grown up: 90 minutes overhead, even smaller on radar, a heavier warhead, and it listens for radars that are transmitting.',
      chg: 'Half again as long overhead, smaller on radar, a heavier warhead, and it goes for transmitting radars first.',
      good: ['Very hard to see', 'Waits for a radar to switch on'],
      bad: ['Still slow and still near the border', 'A silent battery is hard for it to find'],
      stop: 'Keep radars at the front silent until they are needed; guns round the batteries.' }
  ] },
  isr: { fam: 'reconnaissance drones', size: [8, 1100], tiers: [
    { key: 'isr1', nick: 'Owl', act: 0, fx: {},
      sum: 'An unarmed drone that circles 6 km up and reports what it sees: our batteries, radars and convoys.',
      good: ['Tells them where our units are', 'High enough to watch a wide area'],
      bad: ['Unarmed', 'Big and slow on radar: an easy kill'],
      stop: 'Shoot it down before it goes home. Before the war, shooting first is your choice.' }
  ] },
  lacm: { fam: 'subsonic cruise missiles', size: [6.2, 1500], tiers: [
    { key: 'lacm1', nick: 'Viper', act: 0, fx: {},
      sum: 'A cruise missile that flies 40 m above the ground at 860 km/h along the valleys, round the batteries it knows about.',
      good: ['Below most radars: seen late, behind hills not at all', 'Routes round known batteries'],
      bad: ['Once seen, a steady target', 'Its route is fixed: a battery it did not know about surprises it'],
      stop: 'Radars that see low (gap fillers, aerostats) and medium-range missiles along the valleys.' },
    { key: 'lacm2', nick: 'Taipan', act: 3, fx: { spd: 2.7, rcs: 0.035, alt: 0.03 },
      sum: 'A newer Viper: lower, faster and smaller on radar.',
      chg: 'Flies 30 m up instead of 40, a little faster, a third smaller on radar.',
      good: ['Even later on radar', 'Less time between seen and impact'],
      bad: ['Still a steady target once tracked', 'Still a fixed route'],
      stop: 'More low-level radars, and batteries placed where the valleys lead.' },
    { key: 'lacm3', nick: 'Mamba', act: 4, fx: { spd: 2.9, rcs: 0.025, alt: 0.025, dmg: 70, retgt: true },
      sum: 'Their best cruise missile: 25 m up, 1,040 km/h, hard to see, and it takes another target if its own is already destroyed.',
      chg: 'Lower, faster, smaller still, a heavier warhead, and it changes target.',
      good: ['Almost invisible to radars that do not look low', 'Never wasted: it finds another target'],
      bad: ['Expensive: they cannot fire many', 'Once tracked, interceptors still kill it'],
      stop: 'Gap fillers and aerostats to see it; batteries on its likely lane.' }
  ] },
  mcm: { fam: 'manoeuvring cruise missiles', size: [6.5, 1600], tiers: [
    { key: 'mcm1', nick: 'Adder', act: 0, fx: {},
      sum: 'A Viper that jinks in its last minutes to throw off interceptors.',
      good: ['Low, like the Viper', 'Jinks near the target'],
      bad: ['Jinking costs it speed', 'Meet it before its last minutes and it flies straight'],
      stop: 'Engage it early, along its lane, before it starts to jink.' },
    { key: 'mcm2', nick: 'Krait', act: 4, fx: { spd: 2.9, evasive: 0.9 },
      sum: 'A faster Adder that jinks harder.',
      chg: 'Faster, and jinks much harder near the target.',
      good: ['Very hard to hit near the target'],
      bad: ['Flies straight until its last minutes'],
      stop: 'Engage it far out. Close in, guns and several missiles.' }
  ] },
  scm: { fam: 'supersonic cruise missiles', size: [8.9, 3000], tiers: [
    { key: 'scm1', nick: 'Lash', act: 0, fx: {},
      sum: 'A supersonic cruise missile, 2,900 km/h at 12 km up, that dives steeply on its target at the end.',
      good: ['Very fast: minutes from border to target', 'Weaves as it dives'],
      bad: ['High up: radars see it from far away', 'Flies straight to the target'],
      stop: 'Medium- and long-range missiles while it is high, before the dive.' },
    { key: 'scm2', nick: 'Whiplash', act: 4, fx: { spd: 9.5, dmg: 100 },
      sum: 'A faster Lash with a heavier warhead.',
      chg: 'A fifth faster and a heavier warhead.',
      good: ['Even less time to react'],
      bad: ['Still high and seen from far away'],
      stop: 'Long-range missiles early; a battery right on its line.' }
  ] },
  glb: { fam: 'glide bombs', size: [4, 1500], tiers: [
    { key: 'glb1', nick: 'Brick', act: 0, fx: {},
      sum: 'A bomb with wings, dropped by a strike aircraft from far away. It glides in silently.',
      good: ['Small on radar', 'The aircraft that drops it stays out of reach'],
      bad: ['Slow, and loses height as it goes', 'The aircraft has to come close first'],
      stop: 'Shoot the aircraft before it drops; short-range missiles on the bombs.' },
    { key: 'glb2', nick: 'Cinder', act: 3, fx: { spd: 3, dmg: 65 },
      sum: 'A glide bomb with a small rocket: faster and harder hitting.',
      chg: 'A rocket motor: faster, a heavier warhead.',
      good: ['Faster: less time to react'],
      bad: ['The aircraft still has to come close to drop it'],
      stop: 'Keep their strike aircraft away; fighters and long-range missiles on them.' }
  ] },
  srbm: { fam: 'short-range ballistic missiles', size: [11, 6000], tiers: [
    { key: 'srbm1', nick: 'Hammer', act: 0, fx: { cep: 6 },
      sum: 'An 11 m missile with a 500 kg warhead. It climbs 70 km, then falls at 3 km/s: five minutes from launch to impact. An old design that lands anywhere within 600 m of its aim.',
      good: ['Only ballistic missile defence can stop it', 'Minutes from launch to impact', 'A very heavy warhead'],
      bad: ['Not accurate: it misses small targets', 'Its launch is seen, and its arc says where it will land'],
      stop: 'BMD missiles near what it is aimed at. Hunt the launchers before they fire.' },
    { key: 'srbm2', nick: 'Sledge', act: 3, fx: {},
      sum: 'The Hammer with a guided warhead: it lands where it is aimed.',
      chg: 'Accurate: it no longer misses small targets.',
      good: ['Accurate', 'Only ballistic missile defence can stop it'],
      bad: ['Its arc still says where it will land'],
      stop: 'BMD missiles on what matters most; hunt the launchers.' },
    { key: 'srbm3', nick: 'Maul', act: 4, fx: { vAvg: 14.5, dmg: 145, boost: 1 },
      sum: 'Their newest: faster, heavier, and its booster breaks away near the top, so every Maul shows on radar as two warheads.',
      chg: 'A fifth faster, a heavier warhead, and a booster that looks like a second warhead.',
      good: ['Two radar targets for each missile', 'Less time to react'],
      bad: ['The booster falls short: wait and it shows itself', 'Still only one real warhead'],
      stop: 'BMD with enough missiles for the boosters too, or radars good enough to tell them apart.' }
  ] },
  marv: { fam: 'manoeuvring-warhead ballistic missiles', size: [12, 6500], tiers: [
    { key: 'marv1', nick: 'Sickle', act: 0, fx: {},
      sum: 'A Hammer whose warhead swerves in the last part of its fall, so interceptors aimed at its arc miss.',
      good: ['Swerves as it falls', 'Heavy warhead'],
      bad: ['Only swerves at the very end', 'An interceptor high up meets it before it swerves'],
      stop: 'High-altitude or space interceptors, before the swerve.' },
    { key: 'marv2', nick: 'Scythe', act: 4, fx: { weaveF: 0.75, weave: 40, dmg: 140 },
      sum: 'A Sickle that starts swerving earlier and wider.',
      chg: 'Swerves earlier and wider, a heavier warhead.',
      good: ['Very hard for low interceptors'],
      bad: ['Still flies a plain arc until its last quarter'],
      stop: 'High-altitude or space interceptors.' }
  ] },
  mrbm: { fam: 'medium-range ballistic missiles', size: [16, 20000], tiers: [
    { key: 'mrbm1', nick: 'Anvilhead', act: 0, fx: {},
      sum: 'A 16 m missile that climbs 150 km and falls at 3.5 km/s, carrying decoys that look like warheads.',
      good: ['The highest, fastest thing they fire', 'Comes with decoys', 'Huge warhead'],
      bad: ['Few of them', 'Its launch is seen far away'],
      stop: 'Space and high-altitude interceptors; enough missiles for the decoys.' }
  ] },
  hgv: { fam: 'hypersonic glide vehicles', size: [6, 2000], tiers: [
    { key: 'hgv1', nick: 'Comet', act: 0, fx: {},
      sum: 'Launched on a rocket, then glides at 40 km up at 7,200 km/h, swerving, before it dives.',
      good: ['Too low for space interceptors, too high and fast for most others', 'Swerves all the way'],
      bad: ['Very few of them', 'Long-range BMD can still meet it in the dive'],
      stop: 'The best ballistic missile defence you have, right at the target.' }
  ] },
  rkt: { fam: 'artillery rockets', size: [4, 300], tiers: [
    { key: 'rkt1', nick: 'Hail', act: 0, fx: { spread: 1.4 },
      sum: 'Rockets fired in salvos of six to twelve from launchers near the border. They spread wide.',
      good: ['Many at once', 'A minute from launch to impact'],
      bad: ['Short reach: 80 km', 'They scatter: half miss a small target'],
      stop: 'C-RAM guns near the border; counter-battery radar to find the launcher.' },
    { key: 'rkt2', nick: 'Downpour', act: 4, fx: { spread: 0.5, dmg: 18 },
      sum: 'Guided rockets: the same salvos, landing close together.',
      chg: 'Guided: a third of the scatter, a bigger warhead.',
      good: ['Accurate salvos'],
      bad: ['Still short reach', 'The launcher still shows itself when it fires'],
      stop: 'C-RAM guns, and strike the launchers as soon as they are found.' }
  ] },
  arm: { fam: 'anti-radiation missiles', size: [4.2, 360], tiers: [
    { key: 'arm1', nick: 'Needle', act: 0, fx: {},
      sum: 'Fired by their radar-hunting aircraft, it homes on a radar that is transmitting.',
      good: ['Fast', 'Goes straight for our eyes'],
      bad: ['Switch the radar off and it usually misses'],
      stop: 'Radars that go silent when it comes (Doctrine), and point defence near them.' },
    { key: 'arm2', nick: 'Stiletto', act: 4, fx: { spd: 7, blind: 0.7 },
      sum: 'A Needle that remembers where the radar was: switching off no longer saves it most of the time.',
      chg: 'Faster, and it hits a silent radar seven times in ten.',
      good: ['Switching off does not save the radar'],
      bad: ['A radar that has moved is safe'],
      stop: 'Point defence by the radars, and move a radar after it has been seen.' }
  ] },
  dcy: { fam: 'air-launched decoys', size: [2.8, 120], tiers: [{ key: 'dcy1', nick: 'Chaff Bird', act: 0, fx: {},
    sum: 'A small decoy that looks like a fighter on radar. It is there to make us waste missiles.',
    good: ['Draws our missiles away from the real raid'], bad: ['Harmless'],
    stop: 'Type recognition tells it apart. Let it fly; it runs out of fuel.' }] },
  ftr: { fam: 'fighters', size: [21, 30000], tiers: [{ key: 'ftr1', nick: 'Falchion', act: 0, fx: {},
    sum: 'Their fighter. It escorts raids, hunts our aircraft and patrols the border.',
    good: ['Chaff, flares and notching against our missiles', 'Kills our aircraft'], bad: ['Large on radar', 'Lost aircraft are gone for good'],
    stop: 'Long-range missiles and our own fighters.' }] },
  str: { fam: 'strike aircraft', size: [18, 25000], tiers: [{ key: 'str1', nick: 'Cudgel', act: 0, fx: {},
    sum: 'Carries glide bombs and drops them from outside short-range reach.',
    good: ['Hits hard targets'], bad: ['Has to come close to drop', 'Large on radar'],
    stop: 'Medium- and long-range missiles before it drops.' }] },
  sead: { fam: 'radar-hunting aircraft', size: [19, 27000], tiers: [{ key: 'sead1', nick: 'Jackal', act: 0, fx: {},
    sum: 'Hunts our radars with anti-radiation missiles.',
    good: ['Kills radars that stay on'], bad: ['Large on radar', 'Silent radars give it nothing'],
    stop: 'Radars that go silent at the right moment, and long-range missiles on the aircraft.' }] },
  ewj: { fam: 'stand-off jammers', size: [30, 60000], tiers: [{ key: 'ewj1', nick: 'Howler', act: 0, fx: {},
    sum: 'Stays outside our reach and blinds radars along its bearing.',
    good: ['Our radars see raids late'], bad: ['Very large on radar', 'Shoot it and the raid breaks off'],
    stop: 'Very-long-range missiles or fighters. Passive sensors still hear it.' }] },
  esj: { fam: 'escort jammer drones', size: [4, 400], tiers: [{ key: 'esj1', nick: 'Gnat', act: 0, fx: {},
    sum: 'Flies with the cruise missiles and jams the radars ahead of them.',
    good: ['Hides the cruise missiles behind it'], bad: ['Unarmed, and a fair target'],
    stop: 'Shoot it first, then the missiles show.' }] },
  ahe: { fam: 'attack helicopters', size: [17, 10000], tiers: [{ key: 'ahe1', nick: 'Hornet', act: 0, fx: {},
    sum: 'Flies low along the valleys to hit targets near the border.',
    good: ['Hills hide it from radar'], bad: ['Slow, and near the border only'],
    stop: 'Short-range missiles and guns at the front.' }] },
  bmr: { fam: 'missile-carrier bombers', size: [42, 110000], tiers: [{ key: 'bmr1', nick: 'Colossus', act: 0, fx: {},
    sum: 'A big bomber that launches cruise missiles from outside our reach. Sometimes it poses as an airliner.',
    good: ['Fires from far away', 'Four missiles at once'], bad: ['Huge on radar', 'Lost bombers are gone for good'],
    stop: 'Very-long-range missiles and fighters, before it launches.' }] }
};

// each version's numbers: the type's own, with the version's changes, kept by name for saves (IC.ARMS_D.owa3)
IC.ARMS_D = {};
for (const [type, F] of Object.entries(IC.ARMS)) F.tiers.forEach((v, i) => {
  v.type = type; v.n = i + 1;
  IC.ARMS_D[v.key] = Object.assign({}, IC.THR[type], v.fx, { nick: v.nick, tier: i + 1, tierKey: v.key });
});
IC.armsVer = key => { const m = /^([a-z]+)(\d)$/.exec(key || ''); return m && IC.ARMS[m[1]] ? IC.ARMS[m[1]].tiers[+m[2] - 1] : null; };

const fresh = () => ({ f: {}, seen: {}, cards: [], force: {} });
function A(S) { return S.arms || (S.arms = fresh()); }
function fam(S, type) {
  const F = A(S).f;
  return F[type] || (F[type] = { tier: 0, fav: 1, out: false, down: 0, hit: 0, crash: 0, rd: 0, rh: 0 });
}
IC.armsInit = S => { S.arms = fresh(); };
/* the version the enemy fields now: forced, else the newest its act has reached */
IC.armsKey = function (S, type) {
  const F = IC.ARMS[type];
  if (!F) return undefined;
  const a = A(S);
  if (a.force[type]) return a.force[type];
  const act = S.enemy ? S.enemy.act || 0 : 0;
  let k = 0;
  F.tiers.forEach((v, i) => { if (act >= v.act) k = i; });
  return F.tiers[k].key;
};
IC.armsDef = (S, type) => IC.ARMS_D[IC.armsKey(S, type)] || IC.THR[type];
IC.armsFav = (S, type) => IC.ARMS[type] ? fam(S, type).fav : 1;
/* every version, for a wave builder or a reference page */
IC.armsCatalog = () => Object.entries(IC.ARMS).flatMap(([type, F]) => F.tiers.map(v => ({ type, key: v.key, nick: v.nick, tier: v.n, of: F.tiers.length, act: v.act, fam: F.fam, d: IC.ARMS_D[v.key] })));

/* a version just launched: the things that are decided once */
IC.armsSpawned = function (S, t) {
  const d = t.d;
  if (d.crash && Math.random() < d.crash) {
    let L = 0, px = t.x, py = t.y;
    for (const p of t.route || []) { L += U.dxy(px, py, p.x, p.y); px = p.x; py = p.y; }
    if (L > 0 && t.spd) t.crashT = U.rand(0.2, 0.85) * L / t.spd;
  }
  if (d.retgt) t.retT = 0;
};
/* one that came down on its own */
IC.armsCrash = function (S, t) {
  t.dead = true;
  IC.explode(S, t.x, t.y, 0.4, 'ground');
  if (t.op) t.op.done++;
  if (t.det || t.tn) IC.log(S, 'kill', 'CRASHED', `TN ${t.tn || '----'} ${t.aff === 'H' ? t.d.nick : 'track'} came down on its own ${IC.nearPlace(S, t.x, t.y)}.`, { x: t.x, y: t.y });
  const f = fam(S, t.type); f.crash++; f.rd++;
  IC.emit(S, 'selfCrash', t);
};
/* a target gone or moved: follow it, or take the nearest other one */
const gone = r => !r || r.dead || r.destroyed || r.offline || (r.hp != null && r.hp <= 0);
IC.armsRetarget = function (S, t) {
  t.retT = t.age + 10;
  const r = t.target;
  if (r && !gone(r) && r.x != null && r.state && U.dxy(r.x, r.y, t.aim.x, t.aim.y) > 15) { setAim(t, r.x, r.y); return; }
  if (!r || !gone(r)) return;
  if (U.dxy(t.x, t.y, t.aim.x, t.aim.y) > 600) return;
  let best = null, bd = 250;
  for (const u of S.units) if (!u.dead && u.state === 'ready') { const k = U.dist(u, t.aim); if (k < bd) { bd = k; best = u; } }
  if (!best) for (const i of S.infra) if (i.owner === 'us' && !gone(i) && i.kind !== 'city') { const k = U.dist(i, t.aim); if (k < 350 && k < bd + 100) { bd = k; best = i; } }
  if (!best) return;
  t.target = best; setAim(t, best.x, best.y);
  if (t.det) IC.log(S, 'warn', 'RETARGET', `TN ${t.tn || '----'} ${t.aff === 'H' ? t.d.nick : 'track'}: its target was already destroyed. It has turned for ${best.name}.`, t);
  IC.emit(S, 'retarget', t);
};
function setAim(t, x, y) { t.aim = { x, y }; if (t.route) { t.route.length = 0; t.route.push({ x, y }); } }
/* a drone that jumps between treetops and its ceiling */
IC.armsHop = t => { const s = Math.sin(t.age * 0.035 + t.seed * 3); return 0.05 + (t.d.hop - 0.05) * U.clamp((s + 0.3) / 0.6, 0, 1); };

/* what happened to them, for the favour */
IC.on((S, type, d) => {
  if (!S.arms) return;
  const t = type === 'kill' ? d : type === 'arrive' ? d.t : null;
  if (!t || !t.d || !IC.ARMS[t.type] || !t.fromHostile && !t.op) return;
  const f = fam(S, t.type);
  if (type === 'kill') { f.down++; f.rd++; } else { f.hit++; f.rh++; }
});
const FAV = { owa: 1, jdr: 1, lacm: 1, mcm: 1, scm: 1, srbm: 1, marv: 1 };
/* after each raid: a family that keeps dying on the way is used less, one that gets through more; all drift home */
IC.armsLearn = function (S, say) {
  const a = A(S), out = [];
  for (const [type, f] of Object.entries(a.f)) {
    const n = f.rd + f.rh;
    if (!FAV[type]) { f.rd = f.rh = 0; continue; }
    if (n >= 2) f.fav = U.clamp(f.fav * (0.75 + 0.6 * f.rh / n), 0.2, 1.5);
    f.fav += (1 - f.fav) * 0.05;
    const v = IC.armsVer(IC.armsKey(S, type)), nick = v ? v.nick : type;
    if (!f.out && f.fav < 0.45) { f.out = true; out.push(`They are sending fewer ${nick}s: of the last ${n} we saw, ${n - f.rh} never got through.`); }
    else if (f.out && f.fav > 0.65) { f.out = false; out.push(`They are using ${nick}s again.`); }
    f.rd = f.rh = 0;
  }
  if (say) for (const s of out) say(s);
  return out;
};
/* a packet of a raid, sized by how much the commander trusts what goes in it */
const PACK = { drones: ['owa'], harass: ['owa'], cm: ['lacm', 'mcm', 'scm'], bal: ['srbm', 'marv'] };
// (against the others: when all three are doubted alike nothing changes, so a raid's size holds and its mix shifts)
const packFav = (S, w) => Math.max(...PACK[w].map(k => IC.armsFav(S, k)));
IC.armsPack = (S, w) => PACK[w] ? packFav(S, w) / ((packFav(S, 'drones') + packFav(S, 'cm') + packFav(S, 'bal')) / 3) : 1;
/* the act moved on: the families that have a newer version now, in words for the Intel room */
IC.armsTick = function (S, say) {
  const a = A(S), news = [];
  for (const type of Object.keys(IC.ARMS)) {
    const key = IC.armsKey(S, type), v = IC.armsVer(key), f = fam(S, type);
    if (v.n - 1 > f.tier) {
      const was = IC.ARMS[type].tiers[f.tier];
      f.tier = v.n - 1;
      // a new version is tried again, whatever the old one did
      f.fav = Math.max(f.fav, 0.9); f.out = false;
      if (f.down + f.hit + f.crash > 0) news.push(`They have a new ${IC.ARMS[type].fam.replace(/s$/, '')}: the ${v.nick}, replacing the ${was.nick}. ${v.chg || ''}`.trim());
    }
  }
  if (say) for (const s of news) say(s);
  return news;
};

/* ballistic missiles and gliders in the air that we track, grouped by where they will land (within 12 km): a salvo
   of six at one target is one salvo of six, with its first and last impact, what it falls on and how fast. The map
   draws each as one danger and the top of the screen warns of it (render-threat.js) */
IC.SALVO_R = 120;
IC.salvos = function (S) {
  const G = [];
  for (const t of S.threats) {
    if (t.dead || !t.det || t.d.pen || (t.d.move !== 'bal' && t.d.cls !== 'hgv') || t.d.cls === 'rkt') continue;
    const ix = t.d.move === 'bal' ? t.x1 : t.aim.x, iy = t.d.move === 'bal' ? t.y1 : t.aim.y, tti = IC.timeToImpact(t);
    let g = G.find(g => U.dxy(g.x, g.y, ix, iy) < IC.SALVO_R);
    if (!g) G.push(g = { x: ix, y: iy, n: 0, t0: 1e9, t1: 0, dmg: 0, hgv: 0, L: [], at: null, key: '' });
    g.x = (g.x * g.n + ix) / (g.n + 1); g.y = (g.y * g.n + iy) / (g.n + 1); g.n++;
    g.t0 = Math.min(g.t0, tti); g.t1 = Math.max(g.t1, tti); g.dmg += t.d.dmg || 0; if (t.d.cls === 'hgv') g.hgv++;
    g.L.push({ t, x: ix, y: iy, tti });
    if (!g.at && t.target && t.target.name && U.dxy(t.target.x, t.target.y, ix, iy) < 80) g.at = t.target.name;
  }
  for (const g of G) { g.at = g.at || IC.nearestPlace(S, g.x, g.y); g.key = g.L.map(e => e.t.id).sort()[0]; }
  return G.sort((a, b) => a.t0 - b.t0);
};
/* a ballistic missile's real speed, km/s: across the ground and up or down its arc */
IC.balSpeed = function (t) {
  const h = Math.hypot(t.vx || 0, t.vy || 0) * 0.1;
  if (t.d.move !== 'bal' || !t.T) return h;
  const f = U.clamp(t.age / t.T, 0, 1), v = t.apex * 4 * (1 - 2 * f) / t.T;
  return Math.hypot(h, v);
};

/* the first time we meet a version: a card for the player */
function meet(S, t) {
  if (!t.d || !IC.ARMS[t.type] || t.d.pen || t.d.civil || S.mode === 'range') return;
  const key = t.d.tierKey || IC.ARMS[t.type].tiers[0].key, a = A(S);
  if (a.seen[key]) return;
  a.seen[key] = S.time;
  // an earlier version of the same family met before makes this an upgrade card
  const v = IC.armsVer(key), F = IC.ARMS[t.type], prev = F.tiers.slice(0, v.n - 1).reverse().find(p => a.seen[p.key]);
  const c = { key, t: S.time, tn: t.tn || null, up: prev ? prev.key : null };
  a.cards.push(c);
  IC.log(S, 'warn', prev ? 'NEW VERSION' : 'NEW WEAPON', `${prev ? `The ${prev.nick} has a successor: the ${v.nick}.` : `First ${v.nick} seen: ${F.fam.replace(/s$/, '')}.`} ${v.sum}`, t);
  IC.emit(S, 'encounter', c);
}
IC.on((S, type, d) => {
  if (type === 'aff' && d.aff === 'H') meet(S, d);
  else if (type === 'ballistic') meet(S, d);
});

})(window.IC);
