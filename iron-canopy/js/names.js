/* Iron Canopy — display names. Every unit, munition and threat gets a memorable name, a short code for the map and
   a plain line saying what it is. Loaded right after data.js; data.js keeps the stats.
   Units:     name 'Sentinel', role 'long-range search radar', short 'SNT' (unit names on the map are SNT-1, SNT-2…).
   Munitions and threats keep a plain `name` (logs write it in lower case: "fires long-range missile at TN 1004")
   and get a `nick` for panels: "Lance · long-range missile". IC.fullName(d) gives the panel form for any of them. */
(function (IC) {
'use strict';

// [name, short, role, what it does]
const UNITS = {
  acou:    ['Whisper', 'WSP', 'acoustic sensor net', 'Microphone posts that hear drones and low cruise missiles. Cheap, silent, imprecise.'],
  ssr:     ['Beacon', 'BCN', 'civil air traffic radar', 'Air traffic control radar. It only hears transponders: an aircraft flying with its transponder off is invisible to it.'],
  vhf:     ['Longwave', 'LWV', 'early-warning radar', 'Sees 440 km and sees stealth, but the antenna turns once every 48 s, gives no altitude and cannot tell an airliner from a bomber.'],
  lr3d:    ['Sentinel', 'SNT', 'long-range search radar', 'Altitude, IFF, and it recognises aircraft types inside 120 km. Sweeps every 24 s.'],
  mr3d:    ['Kestrel', 'KST', 'medium-range search radar', 'Mobile 3D radar with IFF and type recognition inside 65 km. Sweeps every 10 s.'],
  gf:      ['Lowwatch', 'LOW', 'low-level gap-filler radar', 'Radar on a tall mast for low fliers. The horizon still limits it to about 30 km against cruise missiles. Reads transponders.'],
  esm:     ['Harker', 'HRK', 'passive listening array', 'Hears jammers and aircraft radars 360 km out, which marks them hostile. Never transmits.'],
  pcl:     ['Echo', 'ECH', 'passive radar', 'Listens to broadcast radio and television bouncing off aircraft. It never transmits, so it cannot be found or hit by anti-radiation missiles. Position only, no height, and it misses low fliers.'],
  cbr:     ['Backtrack', 'BKT', 'counter-battery radar', 'Tracks rockets and pinpoints the launcher that fired them.'],
  aero:    ['Skyhook', 'SKY', 'radar balloon', 'Radar on a balloon at 3,000 m. Sees cruise missiles 250 km out. Fragile.'],
  bmd:     ['Farsight', 'FAR', 'ballistic missile tracking radar', 'Tracks ballistic missiles across the region and tells warheads from decoys.'],
  manpads: ['Nettle', 'NTL', 'shoulder-fired missile team', 'A team called in by helicopter anywhere in the country. It fights for a few minutes, then is lifted out. Heat-seeking missiles, 5 km reach; flares and bad weather hurt them.'],
  spaag:   ['Buzzsaw', 'BZS', 'anti-aircraft gun vehicle', 'Radar-directed 35 mm twin cannon, 4.5 km reach. Never runs dry.'],
  cram:    ['Hailstorm', 'HLS', 'rocket and drone defence gun', 'A fast-firing gun that shoots down rockets, drones and anti-radiation missiles in the last 3 km.'],
  shorad:  ['Vixen', 'VIX', 'short-range missile vehicle', 'Short-range missiles steered by its own radar. 20 km reach.'],
  mrsam:   ['Aegir', 'AEG', 'medium-range missile battery', 'Missiles with their own radar seeker, 70 km reach. Fires on any friendly fire-control track.'],
  lrsam:   ['Bastion', 'BST', 'long-range missile battery', '160 km area defence. Its long-range missiles need the battery radar on until impact. With BMD rounds it kills ballistic missiles.'],
  hatd:    ['Highwall', 'HWL', 'upper-tier ballistic missile defence', 'Kills ballistic missiles at 35–150 km altitude, before they come down.'],
  exo:     ['Zenith', 'ZEN', 'space intercept site', 'Hits ballistic missiles in space, halfway through their flight.'],
  vshorad: ['Thistle', 'THS', 'heat-seeking missile vehicle', 'Eight heat-seeking missiles on a light vehicle, aimed by a thermal sight. Silent and cheap, 5 km reach, with plenty of reloads. Flares and bad weather hurt it.'],
  dgun:    ['Rattler', 'RTL', 'counter-drone gun truck', 'A 30 mm gun firing airburst shells, aimed by a thermal sight. Silent, 2.5 km reach, never runs dry. Made for drones.'],
  idl:     ['Swift', 'SWF', 'interceptor drone launcher', 'A small radar and 24 interceptor drones that ram slow attack drones 15 km out, each for a fraction of the drone\'s price. Too slow to catch jet drones or missiles.'],
  mrmob:   ['Rover', 'RVR', 'mobile medium-range launcher', 'Medium-range missiles and their radar on two trucks. Once it has fired and the enemy has found it, it drives a few km and sets up again.'],
  cp:      ['Keystone', 'KEY', 'mobile command post', 'Links every missile battery within 60 km by datalink: they fire on any fire-control track, even with their own radar silent. Its radio can be found; switch it off and the link drops.'],
  laser:   ['Sunspear', 'SUN', 'high-energy laser', 'Burns drones and rockets for the price of electricity. Overheats, and fog cuts it.'],
  mlaser:  ['Glint', 'GLT', 'mobile drone laser', 'A smaller laser on a truck for small drones, 3 km reach. It overheats sooner than Sunspear, and fog cuts it.'],
  hpm:     ['Static', 'STC', 'microwave drone killer', 'Fries every drone in a 3.5 km bubble, then recharges.'],
  gnss:    ['Mirage', 'MIR', 'satellite navigation jammer', 'Spoofs satellite navigation on drones and cruise missiles within 45 km. It radiates, so the enemy can find it.'],
  decoy:   ['Phantom', 'PHM', 'radar decoy', 'Mimics a radar so the enemy wastes anti-radiation missiles and strikes on it.'],
  mlrs:    ['Rainmaker', 'RNM', 'guided rocket launcher', 'Guided rockets to 80 km, for counter-battery fire.'],
  glcm:    ['Harrow', 'HRW', 'cruise missile launcher', 'Cruise missiles for deep strikes on bases, 500 km range.'],
  tbml:    ['Spire', 'SPR', 'ballistic missile launcher', 'Ballistic missiles that reach 300 km in minutes. Catch launchers before they move.'],
  depot:   ['Forward Depot', 'DEP', 'supply depot', 'Stores munitions and supply and runs convoys to units within its service area.'],
  heliport:['Forward Heliport', 'HLP', 'helicopter pad', 'A forward pad with a transport helicopter flight for urgent deliveries.']
};
// [nick, short, plain name, what it does]
const MUN = {
  IR:  ['Sting', 'IR', 'Heat-seeking missile', 'Short reach, fire and forget. Flares, rain and cloud hurt it.'],
  IR2: ['Sting II', 'IR+', 'Imaging heat-seeking missile', 'Sees a picture of the target, not a hot spot: longer reach, and flares fool it less.'],
  INT: ['Flicker', 'INT', 'Interceptor drone', 'A fast little drone with a camera that flies into its target. Cheap; rain and cloud blind it.'],
  SR:  ['Dart', 'SR', 'Short-range missile', 'Steered by the launcher’s radar all the way.'],
  MR:  ['Lance', 'MR', 'Medium-range missile', 'Finds its target with its own radar in the last seconds.'],
  LR:  ['Longspear', 'LR', 'Long-range missile', 'Two-stage missile that climbs high and dives. The battery radar must light the target until impact.'],
  TBD: ['Anvil', 'BMD', 'Hit-to-kill BMD missile', 'Hits a ballistic warhead directly, low in its fall.'],
  HAT: ['Halo', 'HAT', 'High-altitude interceptor', 'Hits ballistic missiles at 35–150 km altitude.'],
  EXO: ['Starfall', 'EXO', 'Space interceptor', 'Hits ballistic missiles above the atmosphere.'],
  AAM: ['Kite', 'AAM', 'Air-to-air missile', 'Our fighters’ radar-guided missile.'],
  CRS: ['Harrow', 'CRS', 'Land-attack cruise missile', 'Flies low for 500 km to a fixed target.'],
  SRB: ['Spire', 'TBM', 'Tactical ballistic missile', 'Reaches 300 km in minutes.'],
  RKT: ['Rain', 'RKT', 'Guided rocket', 'Cheap, fast, 80 km.']
};
// enemy weapons get reporting names, the way air forces name what the other side flies
const THR = {
  owa:  ['Moth', 'One-way attack drone', 'Slow, low and cheap. Comes in numbers and dives on its target.'],
  jdr:  ['Wasp', 'Jet attack drone', 'A jet-powered drone: faster and higher than a moth.'],
  lm:   ['Vulture', 'Loitering munition', 'Circles over the front looking for a target, then dives.'],
  isr:  ['Owl', 'Reconnaissance drone', 'Watches from 6 km up and reports what it sees. Unarmed.'],
  lacm: ['Viper', 'Subsonic cruise missile', 'Flies at 40 m, below most radars, along the valleys.'],
  mcm:  ['Adder', 'Maneuvering cruise missile', 'A viper that jinks in its last minutes.'],
  scm:  ['Lash', 'Supersonic cruise missile', 'Fast and high, then dives on its target.'],
  glb:  ['Brick', 'Glide bomb', 'Dropped from far away; glides in silently.'],
  srbm: ['Hammer', 'Short-range ballistic missile', 'Falls from space in minutes. Only ballistic missile defence stops it.'],
  marv: ['Sickle', 'Maneuvering-warhead ballistic missile', 'A hammer whose warhead swerves as it falls.'],
  mrbm: ['Anvilhead', 'Medium-range ballistic missile', 'Longer reach, higher arc, bigger warhead.'],
  pen:  ['Anvilhead', 'Penetration-aid decoy', 'A decoy that looks like a warhead.'],
  hgv:  ['Comet', 'Hypersonic glide vehicle', 'Glides at 40 km altitude at 2 km/s, swerving. Very hard to hit.'],
  rkt:  ['Hail', 'Guided artillery rocket', 'Short-range rocket fired in salvos.'],
  arm:  ['Needle', 'Anti-radiation missile', 'Homes on radars that are transmitting. Switch the radar off and it loses its target.'],
  dcy:  ['Chaff Bird', 'Air-launched decoy', 'Looks like a fighter on radar. Soaks up our missiles.'],
  ftr:  ['Falchion', 'Fighter', 'Escorts raids and hunts our aircraft. Uses chaff, flares and notching.'],
  str:  ['Cudgel', 'Strike aircraft', 'Carries bombs and stand-off weapons.'],
  sead: ['Jackal', 'SEAD aircraft', 'Hunts radars with anti-radiation missiles.'],
  ewj:  ['Howler', 'Stand-off jammer', 'Blinds radars along its bearing from far away.'],
  esj:  ['Gnat', 'Escort jammer drone', 'Flies with the cruise missiles and jams radars along its bearing, so they see the raid late.'],
  ahe:  ['Hornet', 'Attack helicopter', 'Flies low along the valleys to hit targets near the border. Hills hide it from radar.'],
  bmr:  ['Colossus', 'Missile-carrier bomber', 'Launches cruise missiles from outside our reach.'],
  civ:  ['Airliner', 'Airliner', 'A passenger flight.'],
  ga:   ['Light aircraft', 'Light civil aircraft', 'A private or club aircraft.']
};

for (const [k, v] of Object.entries(UNITS)) { const d = IC.UNITS[k]; if (d) [d.name, d.short, d.role, d.desc] = v; }
for (const [k, v] of Object.entries(MUN)) { const M = IC.MUN[k]; if (M) { [M.nick, M.short, M.name, M.desc] = v; M.role = M.name.toLowerCase(); } }
for (const [k, v] of Object.entries(THR)) { const d = IC.THR[k]; if (d) { [d.nick, d.name, d.desc] = v; d.short = d.code; d.role = d.name.toLowerCase(); } }
if (IC.GBU) { IC.GBU.nick = 'Anchor'; IC.GBU.role = 'guided bomb'; }
// anything added later without a name here still reads sensibly
for (const d of Object.values(IC.UNITS)) { if (!d.role) d.role = (d.desc || '').split('.')[0].toLowerCase() || 'unit'; }

/* "Sentinel · long-range search radar" for panels; the name alone when there is no separate role */
IC.fullName = d => {
  if (!d) return '';
  const nick = d.nick || d.name, role = d.role;
  return role && nick && nick.toLowerCase() !== role ? `${nick} · ${role}` : nick || '';
};

})(window.IC);
