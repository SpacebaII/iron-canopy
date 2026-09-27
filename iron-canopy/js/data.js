/* Iron Canopy — static game data. The map itself is procedurally generated (gen.js).
   All durations are game seconds; at 1× speed ten game seconds pass every real second. */
(function (IC) {
'use strict';

/* ---------- Munitions ----------
   range in world units (100 m), spd units/game-second, alt window km, w = truck weight,
   prod = factory seconds per round per line. seeker: IR (flares), CMD/SARH (need our radar until impact),
   ARH (own radar at the end, chaff), HTK (hit-to-kill ballistic defense). */
IC.MUN = {
  IR:  { name: 'IR missile', short: 'IR', seeker: 'IR', cost: 0.3, w: 0.25, prod: 300, range: 55, spd: 7, pk: 0.62, alt: [0, 4], vs: { drone: 1, heli: 1, cm: 0.6, air: 0.75, ga: 1 } },
  SR:  { name: 'Short-range missile', short: 'SR', seeker: 'CMD', cost: 0.8, w: 0.5, prod: 600, range: 120, spd: 9, pk: 0.78, alt: [0, 6], vs: { drone: 1, heli: 1, cm: 1, air: 1, arm: 0.8, ga: 1 } },
  MR:  { name: 'Medium-range missile', short: 'MR', seeker: 'ARH', cost: 1.6, w: 1, prod: 1200, range: 450, spd: 12, pk: 0.8, alt: [0, 20], vs: { drone: 1, heli: 1, cm: 1, air: 1, arm: 1, ga: 1 } },
  LR:  { name: 'Long-range missile', short: 'LR', seeker: 'SARH', cost: 4, w: 2, prod: 2400, range: 1000, spd: 15, pk: 0.82, alt: [0, 25], vs: { air: 1, cm: 1, arm: 1, drone: 0.8, bal: 0.45, ga: 1 } },
  TBD: { name: 'Hit-to-kill BMD missile', short: 'BMD', seeker: 'HTK', cost: 6, w: 1.5, prod: 3000, range: 350, spd: 17, pk: 0.85, alt: [0, 35], vs: { bal: 1, cm: 1, air: 1, hgv: 0.45 } },
  HAT: { name: 'High-altitude interceptor', short: 'HAT', seeker: 'HTK', cost: 14, w: 4, prod: 6000, range: 2000, spd: 26, pk: 0.85, alt: [35, 150], vs: { bal: 1, hgv: 0.55 } },
  EXO: { name: 'Exo-atmospheric interceptor', short: 'EXO', seeker: 'HTK', cost: 28, w: 6, prod: 10800, range: 5000, spd: 33, pk: 0.8, alt: [90, 700], vs: { mid: 1 } },
  AAM: { name: 'Radar air-to-air missile', short: 'AAM', seeker: 'ARH', cost: 0, w: 0, prod: 0, range: 450, spd: 13, pk: 0.72, alt: [0, 20], vs: { air: 1, drone: 1, cm: 0.8, heli: 1, ga: 1 }, air: true },
  CRS: { name: 'Land-attack cruise missile', short: 'CRS', cost: 3, w: 3, prod: 3000, range: 5000, spd: 2.6, dmg: 55, strike: true },
  SRB: { name: 'Tactical ballistic missile', short: 'TBM', cost: 5, w: 6, prod: 4800, range: 3000, spd: 12, dmg: 80, strike: true, bal: true },
  RKT: { name: 'Guided rocket', short: 'RKT', cost: 0.3, w: 0.15, prod: 180, range: 800, spd: 9, dmg: 14, strike: true, bal: true },
  ATG: { name: 'Anti-tank missile kit', short: 'ATGM', cost: 0.4, w: 0.5, prod: 300, ground: true },
  SUP: { name: 'Supply pallet', short: 'SUP', cost: 0.25, w: 1, prod: 0, ground: true }
};
IC.MUN_ORDER = ['IR', 'SR', 'MR', 'LR', 'TBD', 'HAT', 'EXO', 'CRS', 'SRB', 'RKT', 'ATG'];
IC.STOCK_KEYS = IC.MUN_ORDER.concat(['SUP']);
IC.MUN_TECH = { TBD: 'a_pac3', HAT: 'a_hatd', EXO: 'a_exo', CRS: 'x_glcm', SRB: 'x_tbm', LR: 'a_lrsam' };
IC.SEEKER = {
  IR: 'Heat-seeking. Flares decoy it; rain and cloud cut its range.',
  CMD: 'Command-guided by the launcher\'s radar until impact.',
  SARH: 'Semi-active: the battery\'s radar must illuminate the target until impact. Chaff and notching hurt it.',
  ARH: 'Active radar seeker for the last seconds. Chaff and notching hurt it a little.',
  HTK: 'Hit-to-kill interceptor for ballistic missiles.'
};

IC.CATS = [
  { id: 'sensor', name: 'Sensors', key: 'Z' },
  { id: 'ad', name: 'Air defense', key: 'X' },
  { id: 'ew', name: 'EW', key: 'C' },
  { id: 'strike', name: 'Strike', key: 'V' },
  { id: 'log', name: 'Logistics', key: 'B' }
];
IC.MOB_LABEL = { mobile: 'Mobile', semi: 'Semi-mobile', fixed: 'Fixed site' };

/* ---------- Player units ----------
   build = setup / construction seconds, lead = procurement seconds, up = upkeep ₭M/h, nato = text in the frame.
   sensor.per = antenna rotation period (s); idc = what it can tell about a track:
   none (position only), iff (reads transponders), nctr (iff + recognises the aircraft type inside nctrR). */
IC.UNITS = {
  acou:   { cat: 'sensor', name: 'Acoustic Sensor Net', short: 'ACS', mob: 'fixed', cost: 10, up: 0.2, build: 300, lead: 300, hp: 10, nato: 'ACO',
            sensor: { R: 220, mast: 3, q: 'surv', acou: true, passive: true, per: 2, err: 40, idc: 'class' },
            desc: 'Microphone posts that hear drones and low cruise missiles. Cheap, silent, imprecise.' },
  ssr:    { cat: 'sensor', name: 'Secondary Surveillance Radar', short: 'SSR', mob: 'fixed', cost: 40, up: 0.6, build: 900, lead: 900, hp: 20, nato: 'SSR', civil: true,
            sensor: { R: 2200, mast: 20, q: 'surv', ssr: true, per: 8, rot: true, err: 2, idc: 'iff', alt3d: true },
            desc: 'Civil air traffic control radar. It only hears transponders: an aircraft flying with its transponder off is invisible to it.' },
  vhf:    { cat: 'sensor', name: 'VHF Surveillance Radar', short: 'VHF', mob: 'semi', cost: 110, up: 2.5, build: 480, lead: 1500, hp: 45, nato: 'EW',
            sensor: { R: 4400, mast: 20, q: 'surv', vhf: true, per: 48, rot: true, err: 45, idc: 'none', alt3d: false },
            desc: 'Sees 440 km and sees stealth, but the antenna turns once every 48 s, gives no altitude and cannot tell an airliner from a bomber.' },
  lr3d:   { cat: 'sensor', name: 'Long-Range 3D Radar', short: 'L3D', mob: 'semi', cost: 170, up: 3.5, build: 400, lead: 1800, hp: 45, nato: '3D',
            sensor: { R: 3000, mast: 14, q: 'fc', per: 24, rot: true, err: 6, idc: 'nctr', nctrR: 1200, alt3d: true, eccm: 0.25 },
            desc: 'Military surveillance radar: altitude, IFF, and it recognises aircraft types inside 120 km. Sweeps every 24 s.' },
  mr3d:   { cat: 'sensor', name: 'Medium-Range 3D Radar', short: 'M3D', mob: 'mobile', cost: 75, up: 1.8, build: 240, lead: 900, hp: 30, nato: 'M3D',
            sensor: { R: 1500, mast: 12, q: 'fc', per: 10, rot: true, err: 3, idc: 'nctr', nctrR: 650, alt3d: true, eccm: 0.15 },
            desc: 'Tactical 3D radar with IFF and type recognition inside 65 km. Sweeps every 10 s.' },
  gf:     { cat: 'sensor', name: 'Low-Level Gap Filler', short: 'GAP', mob: 'mobile', cost: 35, up: 0.8, build: 180, lead: 600, hp: 25, nato: 'LL',
            sensor: { R: 800, mast: 25, q: 'fc', per: 5, rot: true, err: 2, idc: 'iff', alt3d: true },
            desc: 'Mast-mounted radar for low fliers. The horizon limits it to about 30 km against cruise missiles. Reads transponders.' },
  esm:    { cat: 'sensor', name: 'Passive ESM Array', short: 'ESM', mob: 'semi', cost: 80, up: 1, build: 600, lead: 1200, hp: 30, nato: 'ESM', tech: 's_esm',
            sensor: { R: 3600, mast: 10, q: 'surv', esm: true, passive: true, per: 4, err: 25, idc: 'emit' },
            desc: 'Hears jammers and aircraft radars 360 km out, which marks them hostile. Never transmits.' },
  cbr:    { cat: 'sensor', name: 'Counter-Battery Radar', short: 'CBR', mob: 'mobile', cost: 60, up: 2, build: 180, lead: 900, hp: 30, nato: 'CB', tech: 's_cbr',
            sensor: { R: 900, mast: 6, q: 'fc', rktOnly: true, cbr: true, per: 1, err: 1, idc: 'class' },
            desc: 'Tracks rockets and pinpoints the launcher that fired them.' },
  aero:   { cat: 'sensor', name: 'Aerostat Radar', short: 'AER', mob: 'fixed', cost: 180, up: 5, build: 1800, lead: 2400, hp: 18, nato: 'AER', tech: 's_aero',
            sensor: { R: 2600, mast: 3000, q: 'fc', per: 10, rot: true, err: 4, idc: 'iff', alt3d: true },
            desc: 'Radar on a balloon at 3,000 m. Sees cruise missiles 250 km out. Fragile.' },
  bmd:    { cat: 'sensor', name: 'BMD X-Band Radar', short: 'XBR', mob: 'fixed', cost: 600, up: 12, build: 3600, lead: 4800, hp: 60, nato: 'X', tech: 's_bmd',
            sensor: { R: 7000, mast: 20, q: 'fc', bmdOnly: true, disc: true, eccm: 0.6, per: 3, rot: false, err: 1, idc: 'class' },
            desc: 'Tracks ballistic missiles across the region and tells warheads from decoys.' },

  manpads:{ cat: 'ad', name: 'MANPADS Team', short: 'MPD', mob: 'mobile', fast: true, cost: 8, up: 0.3, build: 60, lead: 300, hp: 10, nato: 'MP',
            fc: { R: 70, mast: 2, passive: true }, weapon: 'sam', mags: [{ mun: 'IR', mag: 2, store: 4, reload: 40 }],
            desc: 'Shoulder-fired IR missiles. Cheap, silent, 5 km reach. Flares and bad weather hurt them.' },
  spaag:  { cat: 'ad', name: 'SPAAG Gun Vehicle', short: 'SPG', mob: 'mobile', cost: 35, up: 1, build: 120, lead: 600, hp: 25, nato: 'G',
            fc: { R: 180, mast: 4, nctr: 120 }, weapon: 'gun', gun: { range: 45, rof: 1.2, acc: 0.22, vs: { drone: 1, heli: 1, cm: 0.5, arm: 0.35, air: 0.3, ga: 0.6 } },
            desc: 'Radar-directed 35 mm twin cannon. Never runs dry.' },
  cram:   { cat: 'ad', name: 'C-RAM Gun', short: 'CRM', mob: 'fixed', cost: 45, up: 1.5, build: 600, lead: 900, hp: 30, nato: 'CR', tech: 'a_cram',
            fc: { R: 250, mast: 6, nctr: 150 }, weapon: 'gun', gun: { range: 30, rof: 0.6, acc: 0.3, vs: { rkt: 1, drone: 1, cm: 0.7, arm: 0.6 } },
            desc: 'Point-defense gun that shoots down rockets, drones and ARMs.' },
  shorad: { cat: 'ad', name: 'SHORAD Vehicle', short: 'SHO', mob: 'mobile', cost: 60, up: 2, build: 180, lead: 900, hp: 30, nato: 'SR',
            fc: { R: 320, mast: 5, nctr: 160 }, weapon: 'sam', mags: [{ mun: 'SR', mag: 8, store: 8, reload: 45 }],
            desc: 'Short-range command-guided missiles with its own radar. 12 km reach.' },
  mrsam:  { cat: 'ad', name: 'MRSAM Battery', short: 'MRS', mob: 'semi', cost: 250, up: 6, build: 600, lead: 1800, hp: 50, nato: 'MR', remote: true,
            fc: { R: 900, mast: 8, nctr: 400 }, weapon: 'sam', mags: [{ mun: 'MR', mag: 6, store: 12, reload: 90 }],
            desc: 'Networked medium-range battery with active-seeker missiles. Fires on any friendly fire-control track.' },
  lrsam:  { cat: 'ad', name: 'LRSAM Battery', short: 'LRS', mob: 'semi', cost: 700, up: 14, build: 900, lead: 3000, hp: 70, nato: 'LR', tech: 'a_lrsam',
            fc: { R: 1700, mast: 10, nctr: 700 }, weapon: 'sam',
            mags: [{ mun: 'LR', mag: 8, store: 8, reload: 150 }, { mun: 'TBD', mag: 8, store: 8, reload: 150, tech: 'a_pac3' }],
            desc: '100 km area defense. Its long-range missiles need the battery radar on until impact. With BMD rounds it kills ballistic missiles.' },
  hatd:   { cat: 'ad', name: 'High-Altitude BMD', short: 'HAT', mob: 'semi', cost: 1200, up: 20, build: 1200, lead: 4200, hp: 70, nato: 'HA', tech: 'a_hatd',
            fc: { R: 3500, mast: 10, bmdOnly: true, disc: true }, weapon: 'sam', mags: [{ mun: 'HAT', mag: 8, store: 8, reload: 300 }],
            desc: 'Kills ballistic missiles at 35–150 km altitude.' },
  exo:    { cat: 'ad', name: 'Exo Interceptor Site', short: 'EXO', mob: 'fixed', cost: 2000, up: 30, build: 3600, lead: 6000, hp: 80, nato: 'EX', tech: 'a_exo',
            fc: { R: 3500, mast: 20, bmdOnly: true, disc: true }, weapon: 'sam', mags: [{ mun: 'EXO', mag: 6, store: 4, reload: 600 }],
            desc: 'Midcourse defense that hits ballistic missiles in space.' },
  laser:  { cat: 'ad', name: 'High-Energy Laser', short: 'HEL', mob: 'fixed', cost: 150, up: 3, build: 900, lead: 1800, hp: 30, nato: 'HEL', tech: 'a_laser',
            fc: { R: 120, mast: 5, passive: true }, weapon: 'laser', laser: { range: 60, dps: 0.35, heat: 40, vs: { drone: 1, rkt: 1, heli: 0.6, cm: 0.4 } },
            desc: 'Burns drones and rockets for the price of electricity. Overheats, and fog cuts it.' },
  hpm:    { cat: 'ad', name: 'High-Power Microwave', short: 'HPM', mob: 'fixed', cost: 120, up: 3, build: 900, lead: 1800, hp: 30, nato: 'HPM', tech: 'a_hpm',
            fc: { R: 100, mast: 5, passive: true }, weapon: 'hpm', hpm: { range: 35, cd: 90, pk: 0.7 },
            desc: 'Fries every drone in a 3.5 km bubble, then recharges.' },

  gnss:   { cat: 'ew', name: 'GNSS Jammer', short: 'GNJ', mob: 'mobile', cost: 50, up: 1, build: 120, lead: 600, hp: 20, nato: 'EW', emits: true,
            weapon: 'ecm', ecm: { range: 450, rate: 0.012 },
            desc: 'Spoofs satellite navigation on drones and cruise missiles within 45 km. It radiates.' },
  decoy:  { cat: 'ew', name: 'Radar Decoy', short: 'DCE', mob: 'mobile', cost: 15, up: 0.3, build: 60, lead: 300, hp: 10, nato: 'DCY', tech: 'e_decoy', emits: true,
            weapon: 'decoy', desc: 'Mimics a radar so the enemy wastes ARMs and missiles on it.' },

  mlrs:   { cat: 'strike', name: 'MLRS Launcher', short: 'MLR', mob: 'mobile', cost: 70, up: 2, build: 120, lead: 900, hp: 25, nato: 'RKT',
            weapon: 'strike', mags: [{ mun: 'RKT', mag: 12, store: 12, reload: 30 }],
            desc: 'Guided rockets to 80 km. Counter-battery and front-line strikes.' },
  glcm:   { cat: 'strike', name: 'GLCM Launcher', short: 'GLC', mob: 'mobile', cost: 90, up: 2, build: 240, lead: 1500, hp: 25, nato: 'CM', tech: 'x_glcm',
            weapon: 'strike', mags: [{ mun: 'CRS', mag: 4, store: 4, reload: 300 }],
            desc: 'Cruise missiles for deep strikes on bases, 500 km range.' },
  tbml:   { cat: 'strike', name: 'Tactical BM Launcher', short: 'TBL', mob: 'mobile', cost: 150, up: 3, build: 300, lead: 2400, hp: 25, nato: 'BM', tech: 'x_tbm',
            weapon: 'strike', mags: [{ mun: 'SRB', mag: 2, store: 2, reload: 600 }],
            desc: 'Ballistic missiles that reach 300 km in minutes. Catch launchers before they move.' },

  depot:  { cat: 'log', name: 'Forward Depot', short: 'DEP', mob: 'fixed', cost: 80, up: 2, build: 900, lead: 600, hp: 60, nato: 'DEP',
            logi: { trucks: 2, cap: 600, reach: 1400 }, desc: 'Stores munitions and supply and runs convoys to units within its service area.' },
  heliport:{ cat: 'log', name: 'Forward Heliport', short: 'HLP', mob: 'fixed', cost: 60, up: 1, build: 900, lead: 900, hp: 40, nato: 'H',
            logi: { helis: 1 }, desc: 'A forward pad with a transport helicopter flight for urgent deliveries.' }
};
/* which component each hit can knock out, per unit role */
IC.COMPS = {
  radar: { name: 'Radar', desc: 'Detection and fire control' },
  launch: { name: 'Launchers', desc: 'Firing and magazine' },
  power: { name: 'Power', desc: 'Without it, radars cannot transmit' },
  crew: { name: 'Crew', desc: 'Reload and setup speed' },
  mob: { name: 'Vehicles', desc: 'Needed to move' }
};
IC.compsOf = d => {
  const c = ['crew'];
  if ((d.sensor && !d.sensor.passive) || (d.fc && !d.fc.passive) || d.emits) c.push('radar', 'power');
  if (d.weapon && d.weapon !== 'decoy' && d.weapon !== 'ecm') c.push('launch');
  if (d.mob !== 'fixed') c.push('mob');
  return c;
};

/* ---------- Ground formations (NATO APP-6 style) ---------- */
IC.GTYPES = {
  inf:  { name: 'Infantry Brigade', short: 'Inf', sym: 'inf', ech: 'X', att: 0.85, def: 1.35, use: 1.0, spd: 0.12, cost: 160, soft: true,
          desc: 'Holds ground, strongest in towns and forest. Anti-tank kits make it deadly to armor.' },
  mech: { name: 'Mechanized Brigade', short: 'Mech', sym: 'mech', ech: 'X', att: 1.35, def: 1.2, use: 1.5, spd: 0.2, cost: 260,
          desc: 'Infantry in armored carriers. Good at everything, great at nothing.' },
  arm:  { name: 'Armored Brigade', short: 'Armd', sym: 'armor', ech: 'X', att: 1.9, def: 1.1, use: 2.0, spd: 0.2, cost: 340, armor: true,
          desc: 'Tanks. The hammer for attacks and counterattacks. Vulnerable to anti-tank missiles and attack helicopters.' },
  art:  { name: 'Artillery Brigade', short: 'Arty', sym: 'arty', ech: 'X', att: 0, def: 0.3, fire: 1.5, use: 1.6, spd: 0.15, cost: 220,
          desc: 'Fire support for its own and neighbouring sectors. Stays behind the line.' }
};
IC.GORDERS = {
  hold:    { name: 'Hold', key: 'Y', desc: 'Defend the sector where it stands.' },
  dig:     { name: 'Dig in', key: 'D', desc: 'Build fighting positions: much stronger in defense, cannot attack. Moving loses the work.' },
  attack:  { name: 'Attack', key: 'R', desc: 'Push the line forward in its sector. Needs a clear edge in force.' },
  defend:  { name: 'Defend town', key: 'T', desc: 'Garrison a town. The town holds while the brigade does, even if the line passes it.' },
  reserve: { name: 'Reserve', key: 'U', desc: 'Wait behind the line and counterattack wherever the line bends.' },
  refit:   { name: 'Refit', key: 'O', desc: 'Pull back to rebuild strength with replacements.' }
};
IC.TERRAIN_DEF = { urban: 1.5, forest: 1.25, hills: 1.2, river: 1.3, open: 1 };
IC.TRAITS = {
  aggressive:  { name: 'Aggressive', desc: 'Counterattacks early. +20% attack, +15% losses.' },
  cautious:    { name: 'Cautious', desc: 'Trades ground for lives. −20% losses, yields ground faster.' },
  logistician: { name: 'Logistician', desc: 'Supply lasts 25% longer.' },
  gunner:      { name: 'Artillerist', desc: '+30% artillery effect.' },
  engineer:    { name: 'Engineer', desc: 'Digs in twice as fast.' }
};
IC.CMD_NAMES = ['Gen. Anna Rudek', 'Gen. Pavel Ostrin', 'Gen. Lina Sorvan', 'Gen. Tomas Brell', 'Gen. Iva Kastell', 'Gen. Emil Draganov', 'Gen. Sofia Marr', 'Gen. Viktor Hale', 'Gen. Oren Laskar', 'Gen. Mira Tenne'];
IC.ADVISORS = {
  CDS: { name: 'Gen. Mara Voss', role: 'Chief of Defence', tag: 'CDS' },
  ADA: { name: 'Col. Teodor Ashe', role: 'Air Defence Command', tag: 'AD' },
  LOG: { name: 'Maj. Ilse Brandt', role: 'Logistics', tag: 'LOG' },
  INT: { name: 'Capt. Niko Sayer', role: 'Intelligence', tag: 'INT' },
  AIR: { name: 'Col. Dana Reyes', role: 'Air Operations', tag: 'AIR' },
  ENG: { name: 'Maj. Rafe Okonkwo', role: 'Base Engineering', tag: 'ENG' },
  INS: { name: 'Lt. Col. Hana Brix', role: 'Academy Instructor', tag: 'INS' },
  MIN: { name: 'Min. Petra Halloran', role: 'Minister of Transport', tag: 'MIN' },
  ATC: { name: 'Ivo Marsh', role: 'Chief Air Traffic Controller', tag: 'ATC' },
  APT: { name: 'Lena Okafor', role: 'Head of Airports', tag: 'APT' },
  PM:  { name: 'Prime Minister Oren Valk', role: 'Prime Minister', tag: 'PM' }
};

/* ---------- Hostile and civil air objects ----------
   klass = what type recognition (NCTR, eyes) reports. cm = chaff / flare salvoes carried. notch = turns
   side-on to radar-guided missiles. */
IC.THR = {
  owa:  { code: 'OWA',  name: 'One-way attack drone', cls: 'drone', klass: 'drone', spd: 0.5, alt: 0.4, rcs: 0.1, hp: 1, dmg: 18, gps: true, move: 'wp' },
  jdr:  { code: 'JDR',  name: 'Jet attack drone', cls: 'drone', klass: 'drone', spd: 1.5, alt: 2.5, rcs: 0.1, hp: 1, dmg: 25, gps: true, move: 'wp' },
  lm:   { code: 'LM',   name: 'Loitering munition', cls: 'drone', klass: 'drone', spd: 0.8, alt: 0.5, rcs: 0.02, hp: 0.6, dmg: 30, gps: true, move: 'lm' },
  isr:  { code: 'ISR',  name: 'Reconnaissance drone', cls: 'drone', klass: 'drone', spd: 0.6, alt: 6, rcs: 0.6, hp: 2, dmg: 0, move: 'isr' },
  lacm: { code: 'LACM', name: 'Subsonic cruise missile', cls: 'cm', klass: 'cm', spd: 2.4, alt: 0.04, rcs: 0.05, hp: 1.5, dmg: 60, gps: true, move: 'wp' },
  mcm:  { code: 'MCM',  name: 'Maneuvering cruise missile', cls: 'cm', klass: 'cm', spd: 2.6, alt: 0.03, rcs: 0.03, hp: 1.5, dmg: 70, gps: true, move: 'wp', evasive: 0.6 },
  scm:  { code: 'SCM',  name: 'Supersonic cruise missile', cls: 'cm', klass: 'cm', spd: 8, alt: 12, rcs: 0.1, hp: 2, dmg: 90, move: 'wp', evasive: 0.8, dive: true },
  glb:  { code: 'GLB',  name: 'Glide bomb', cls: 'cm', klass: 'cm', spd: 2.2, alt: 7, rcs: 0.02, hp: 1, dmg: 55, move: 'wp', glide: true },
  srbm: { code: 'SRBM', name: 'Short-range ballistic missile', cls: 'bal', klass: 'ballistic', rcs: 0.1, hp: 2, dmg: 120, move: 'bal', apexK: 0.025, vAvg: 12 },
  marv: { code: 'MaRV', name: 'Maneuvering-warhead ballistic missile', cls: 'bal', klass: 'ballistic', rcs: 0.08, hp: 2, dmg: 130, move: 'bal', apexK: 0.025, vAvg: 13, evasive: 0.6 },
  mrbm: { code: 'MRBM', name: 'Medium-range ballistic missile', cls: 'bal', klass: 'ballistic', rcs: 0.2, hp: 2.5, dmg: 160, move: 'bal', apexK: 0.055, vAvg: 14 },
  pen:  { code: 'MRBM', name: 'Penetration-aid decoy', cls: 'bal', klass: 'ballistic', rcs: 0.2, hp: 0.5, dmg: 0, move: 'bal', apexK: 0.055, vAvg: 14, decoy: true, pen: true },
  hgv:  { code: 'HGV',  name: 'Hypersonic glide vehicle', cls: 'hgv', klass: 'ballistic', spd: 20, alt: 40, rcs: 0.1, hp: 2.5, dmg: 180, move: 'hgv', evasive: 0.5 },
  rkt:  { code: 'RKT',  name: 'Guided artillery rocket', cls: 'rkt', klass: 'rocket', rcs: 0.01, hp: 0.5, dmg: 14, move: 'bal', apexK: 0.04, vAvg: 9 },
  arm:  { code: 'ARM',  name: 'Anti-radiation missile', cls: 'arm', klass: 'cm', spd: 6, alt: 8, rcs: 0.05, hp: 0.8, dmg: 45, move: 'arm' },
  dcy:  { code: 'DCY',  name: 'Air-launched decoy', cls: 'air', klass: 'fighter', spd: 2.4, alt: 6, rcs: 4, hp: 0.6, dmg: 0, move: 'wp', decoy: true },
  ftr:  { code: 'FTR',  name: 'Fighter', cls: 'air', klass: 'fighter', spd: 2.6, alt: 9, rcs: 4, hp: 2, move: 'air', emits: true, cm: 6, notch: true, mil: true },
  str:  { code: 'STK',  name: 'Strike aircraft', cls: 'air', klass: 'fighter', spd: 2.4, alt: 7, rcs: 5, hp: 2, move: 'air', emits: true, cm: 6, notch: true, mil: true },
  sead: { code: 'SEAD', name: 'SEAD aircraft', cls: 'air', klass: 'fighter', spd: 2.6, alt: 8, rcs: 4, hp: 2, move: 'air', emits: true, cm: 6, notch: true, mil: true },
  ewj:  { code: 'EWJ',  name: 'Stand-off jammer', cls: 'air', klass: 'jammer', spd: 2, alt: 10, rcs: 12, hp: 3, move: 'air', emits: true, jam: true, cm: 4, mil: true },
  bmr:  { code: 'BMR',  name: 'Missile-carrier bomber', cls: 'air', klass: 'bomber', spd: 2.2, alt: 11, rcs: 15, hp: 4, move: 'air', emits: true, cm: 4, mil: true },
  civ:  { code: 'CIV',  name: 'Airliner', cls: 'air', klass: 'airliner', spd: 2.3, alt: 11, rcs: 40, hp: 3, move: 'civ', civil: true },
  ga:   { code: 'GA',   name: 'Light civil aircraft', cls: 'ga', klass: 'light', spd: 0.55, alt: 1.5, rcs: 1.5, hp: 1, move: 'civ', civil: true }
};
IC.KLASS = {
  fighter: 'Fighter-size jet', bomber: 'Large military jet', airliner: 'Airliner', light: 'Light aircraft', drone: 'Drone',
  cm: 'Cruise missile', ballistic: 'Ballistic missile', rocket: 'Rocket', jammer: 'Jammer aircraft', heli: 'Helicopter'
};
IC.AFF = {
  U: { name: 'Unknown', desc: 'Nothing known yet.' },
  S: { name: 'Suspect', desc: 'Something is wrong: no transponder, no flight plan, or off its route.' },
  A: { name: 'Assumed civil', desc: 'Transponder matches a filed flight plan.' },
  N: { name: 'Civil', desc: 'Confirmed civilian.' },
  H: { name: 'Hostile', desc: 'Confirmed enemy.' },
  F: { name: 'Friend', desc: 'Our own aircraft.' }
};

/* ---------- Research (time in game seconds; two projects can run at once) ---------- */
IC.TECH = [
  { id: 's_esm',  cat: 'sensor', name: 'Passive ESM', cost: 120, time: 2400, req: [], desc: 'Silent sensors that locate jammers and aircraft radars and mark them hostile.' },
  { id: 's_cbr',  cat: 'sensor', name: 'Counter-battery radar', cost: 80, time: 1800, req: [], desc: 'Track rockets and find the launchers.' },
  { id: 's_nctr', cat: 'sensor', name: 'Improved type recognition', cost: 140, time: 2700, req: [], desc: 'Radars recognise aircraft types 50% further out.' },
  { id: 's_aero', cat: 'sensor', name: 'Aerostat radar', cost: 150, time: 3600, req: ['s_esm'], desc: 'Balloon radar that looks over the horizon at cruise missiles.' },
  { id: 's_sat',  cat: 'sensor', name: 'Satellite launch warning', cost: 300, time: 4500, req: ['s_esm'], desc: 'Allied satellites report every ballistic launch and its launch point.' },
  { id: 's_bmd',  cat: 'sensor', name: 'BMD X-band radar', cost: 400, time: 5400, req: ['s_sat'], desc: 'Discriminates warheads from decoys. Needed for exo intercepts.' },
  { id: 'a_cram', cat: 'ad', name: 'C-RAM', cost: 100, time: 2400, req: [], desc: 'Point-defense guns against rockets and drones.' },
  { id: 'a_laser',cat: 'ad', name: 'High-energy laser', cost: 250, time: 4500, req: ['a_cram'], desc: 'Kill drones for the cost of electricity.' },
  { id: 'a_hpm',  cat: 'ad', name: 'High-power microwave', cost: 250, time: 4500, req: ['a_laser'], desc: 'Area kill against drone swarms.' },
  { id: 'a_lrsam',cat: 'ad', name: 'Long-range SAM', cost: 400, time: 4500, req: [], desc: '100 km area defense battery.' },
  { id: 'a_remote',cat:'ad', name: 'IADS network', cost: 200, time: 3600, req: [], desc: 'Every SAM can fire on any fire-control track, even with its own radar silent.' },
  { id: 'a_pac3', cat: 'ad', name: 'Terminal BMD rounds', cost: 300, time: 3600, req: ['a_lrsam'], desc: 'Hit-to-kill rounds for LRSAM batteries.' },
  { id: 'a_hatd', cat: 'ad', name: 'High-altitude BMD', cost: 800, time: 7200, req: ['a_pac3', 's_bmd'], desc: 'Upper-tier terminal defense at 35–150 km altitude.' },
  { id: 'a_exo',  cat: 'ad', name: 'Exo-atmospheric intercept', cost: 1200, time: 9000, req: ['a_hatd'], desc: 'Midcourse interceptors that kill in space.' },
  { id: 'e_decoy',cat: 'ew', name: 'Radar decoys', cost: 80, time: 1800, req: [], desc: 'Cheap emitters that soak up ARMs.' },
  { id: 'e_eccm', cat: 'ew', name: 'ECCM upgrade', cost: 200, time: 3600, req: [], desc: 'All radars resist jamming 30% better and hold tracks through notching.' },
  { id: 'x_glcm', cat: 'strike', name: 'Ground-launched cruise missiles', cost: 200, time: 3600, req: [], desc: 'Deep strike on enemy bases.' },
  { id: 'x_tbm',  cat: 'strike', name: 'Tactical ballistic missiles', cost: 350, time: 5400, req: ['x_glcm'], desc: 'Fast strike on mobile launchers.' },
  { id: 'x_isr',  cat: 'strike', name: 'Long-endurance ISR', cost: 100, time: 1800, req: [], desc: '+1 ISR drone; ISR drones see 60 km instead of 45.' },
  { id: 'g_atgm', cat: 'ground', name: 'Improved anti-tank missiles', cost: 150, time: 2700, req: [], desc: 'Anti-tank teams hit armor 20% harder.' },
  { id: 'g_fpv',  cat: 'ground', name: 'FPV drone companies', cost: 180, time: 3600, req: [], desc: 'Front-line brigades inflict 25% more losses.' },
  { id: 'g_fort', cat: 'ground', name: 'Field engineering', cost: 120, time: 2400, req: [], desc: 'Brigades dig in twice as fast and deeper.' },
  { id: 'g_arty', cat: 'ground', name: 'Counter-battery fire control', cost: 200, time: 3600, req: ['g_fort'], desc: 'Artillery 30% more effective.' },
  { id: 'l_lines',cat: 'log', name: 'Extra production lines', cost: 250, time: 4500, req: [], desc: '+1 production line at every factory.' },
  { id: 'l_trucks',cat:'log', name: 'Heavy trucks', cost: 120, time: 2400, req: [], desc: 'Convoys carry 50% more and drive faster.' },
  { id: 'l_ind',  cat: 'log', name: 'War industry', cost: 300, time: 5400, req: ['l_lines'], desc: 'Factories produce supply 50% faster.' },
  { id: 'l_rrr',  cat: 'log', name: 'Rapid runway repair', cost: 120, time: 2400, req: [], desc: 'Base engineers repair runways and taxiways twice as fast.' },
  { id: 'f_aam',  cat: 'air', name: 'Improved AAMs', cost: 150, time: 2700, req: [], desc: 'Fighters carry 6 missiles each with better kill probability.' },
  { id: 'f_aew',  cat: 'air', name: 'Second AEW aircraft', cost: 250, time: 3600, req: ['s_esm'], desc: 'Another airborne radar.' },
  { id: 'f_atk',  cat: 'air', name: 'Attack helicopter wing', cost: 200, time: 3600, req: [], desc: 'Another attack helicopter flight.' },
  { id: 'f_ucav', cat: 'air', name: 'Strike drones', cost: 180, time: 2700, req: [], desc: 'Two armed long-endurance drones for ISR and close support.' },
  { id: 'f_cm',   cat: 'air', name: 'Improved countermeasures', cost: 160, time: 2700, req: [], desc: 'Our aircraft carry more chaff and flares, and use them better.' }
];
IC.TECH_CATS = [
  { id: 'sensor', name: 'Sensors' }, { id: 'ad', name: 'Air defense' }, { id: 'ew', name: 'Electronic warfare' },
  { id: 'strike', name: 'Strike & ISR' }, { id: 'ground', name: 'Ground forces' }, { id: 'log', name: 'Logistics & industry' }, { id: 'air', name: 'Air force' }
];

/* ---------- Air force ----------
   A flight is n aircraft that fly together. turn = turnaround on the ground. */
IC.AIR_KIND = {
  ftr:   { name: 'Fighter flight', short: 'FTR', n: 2, spd: 2.6, dash: 3.3, endur: 7200, turn: 1200, buy: 350, cm: 8, runway: true,
           roles: ['cap', 'intercept', 'vid', 'strike', 'cas', 'interdict'], loads: ['aa', 'strike'] },
  atk:   { name: 'Attack helicopters', short: 'ATK', n: 2, spd: 0.8, dash: 0.9, endur: 9000, turn: 1200, buy: 180, cm: 10, reach: 2400,
           roles: ['hstrike', 'cas'] },
  ucav:  { name: 'Strike drone', short: 'UCAV', n: 1, spd: 0.6, dash: 0.7, endur: 64800, turn: 1800, buy: 90, cm: 0, runway: true,
           roles: ['isr', 'cas', 'interdict', 'hstrike'] },
  aew:   { name: 'AEW aircraft', short: 'AEW', n: 1, spd: 1.6, endur: 21600, turn: 2400, buy: 500, cm: 4, runway: true, roles: ['aew'] },
  isr:   { name: 'ISR drone', short: 'ISR', n: 1, spd: 0.8, endur: 43200, turn: 1800, buy: 60, cm: 0, runway: true, roles: ['isr'] },
  heli:  { name: 'Transport helicopters', short: 'HEL', n: 2, spd: 0.75, endur: 14400, turn: 600, buy: 60, cap: 4, cm: 6, roles: ['hlift'] },
  cargo: { name: 'Cargo aircraft', short: 'CGO', n: 1, spd: 1.7, endur: 36000, turn: 1800, buy: 60, cap: 40, cm: 4, runway: true, roles: [] }
};
IC.LOADOUTS = {
  aa:     { name: 'Air superiority', aam: 4, gbu: 0, desc: '4 air-to-air missiles per aircraft.' },
  strike: { name: 'Strike', aam: 2, gbu: 2, desc: '2 guided bombs and 2 air-to-air missiles per aircraft.' }
};
IC.GBU = { name: 'Guided bomb', short: 'GBU', spd: 2.5, dmg: 40, strike: true };
IC.TASK_KIND = {
  cap:       { name: 'Combat air patrol', roles: ['ftr'], point: true, radius: 550 },
  cas:       { name: 'Close air support', roles: ['atk', 'ftr', 'ucav'], front: true },
  interdict: { name: 'Interdiction', roles: ['ftr', 'ucav'], front: true },
  isr:       { name: 'Reconnaissance', roles: ['isr', 'ucav'], point: true, radius: 450 },
  aew:       { name: 'Airborne early warning', roles: ['aew'], point: true, radius: 3200 }
};
IC.HLIFT = {
  SUP:  { name: 'Supply', desc: '+30% supply', mun: 'SUP', qty: 8 },
  ATG:  { name: 'Anti-tank kits', desc: '+10 anti-tank teams: heavy damage to armor', mun: 'ATG', qty: 8 },
  REPL: { name: 'Replacements', desc: '+12% strength from the manpower pool', repl: 12 }
};

/* ---------- Air bases ----------
   Facilities on each base. Damage matters: a cratered runway grounds jets, a lost hangar takes its aircraft with it. */
IC.FAC = {
  runway: { name: 'Runway', hp: 100, repair: 900, cost: 12, desc: 'Below half strength, jets cannot take off or land.' },
  taxi:   { name: 'Taxiway', hp: 60, repair: 600, cost: 8, desc: 'Damage doubles turnaround.' },
  hangar: { name: 'Hangar', hp: 40, repair: 1500, cost: 25, build: 1500, buildCost: 30, desc: 'Shelters one flight. Aircraft inside a hit hangar are often lost.' },
  has:    { name: 'Hardened shelter', hp: 120, repair: 1800, cost: 35, build: 2400, buildCost: 60, desc: 'Concrete shelter. Aircraft inside usually survive.' },
  fuel:   { name: 'Fuel farm', hp: 40, repair: 900, cost: 15, desc: 'Without fuel, turnaround takes 50% longer.' },
  ammo:   { name: 'Munitions store', hp: 40, repair: 900, cost: 15, desc: 'Without it, turnaround takes 50% longer.' },
  tower:  { name: 'Control tower', hp: 30, repair: 600, cost: 10, desc: 'Coordinates launches.' }
};

/* ---------- Policy ---------- */
IC.MOBIL = [
  { name: 'Peacetime', tax: 1, prod: 1, up: 1, morale: 0, sup: 1, slots: 3, man: 0.5, desc: 'Normal economy. Factories on single shifts. Three procurement orders at a time.' },
  { name: 'Partial mobilization', tax: 0.9, prod: 1.6, up: 1.15, morale: -0.06, sup: 1.8, slots: 4, man: 2, desc: 'Reservists called up, factories on double shifts, four orders at a time. Raise new brigades.' },
  { name: 'Full mobilization', tax: 0.78, prod: 2.4, up: 1.3, morale: -0.2, sup: 2.8, slots: 5, man: 4, desc: 'The whole nation at war. Maximum output, steady strain on morale.' }
];
IC.MAX_BRIGADES = 12;

/* ---------- Weather ---------- */
IC.WEATHER = {
  clear:    { name: 'Clear', cloud: 0.1, eo: 1, ir: 1, heli: true, precip: 0, fog: 0 },
  scattered:{ name: 'Scattered cloud', cloud: 0.35, eo: 0.95, ir: 0.95, heli: true, precip: 0, fog: 0 },
  overcast: { name: 'Overcast', cloud: 0.7, eo: 0.75, ir: 0.85, heli: true, precip: 0, fog: 0.05 },
  rain:     { name: 'Rain', cloud: 0.85, eo: 0.55, ir: 0.7, heli: true, precip: 0.6, fog: 0.1 },
  storm:    { name: 'Thunderstorms', cloud: 1, eo: 0.4, ir: 0.6, heli: false, precip: 1, fog: 0.15 },
  fog:      { name: 'Fog', cloud: 0.3, eo: 0.35, ir: 0.65, heli: false, precip: 0, fog: 0.6 }
};

/* ---------- Names for procedural worlds ---------- */
IC.NAMES = {
  home: ['Kestria', 'Valdor', 'Estrany', 'Morvane', 'Selvara', 'Ostrevia', 'Caldria', 'Veyland', 'Arvenna'],
  hostileA: ['Varsk', 'Drakhov', 'Korvath', 'Ulmar', 'Zhevra', 'Brodna'],
  hostileB: ['Oltan', 'Tessk', 'Rhune', 'Kazmir', 'Velgor'],
  neutral: ['Dresh', 'Merran', 'Aldis', 'Sorrel', 'Lunor', 'Faeris', 'Corvale'],
  suffixA: ['Federation', 'Union', 'Directorate'],
  suffixB: ['Union', 'Khanate', 'People’s Republic'],
  suffixN: ['Commonwealth', 'Republic', 'Kingdom', 'Confederation'],
  pre: ['Aur', 'Vel', 'Kes', 'Tess', 'Ad', 'Har', 'Bren', 'Lis', 'Orv', 'Kad', 'Mor', 'Sal', 'Dra', 'Ost', 'Vin', 'Cal', 'Ter', 'Nor', 'Mar', 'Hal', 'Est', 'Rov', 'Gal', 'Wen', 'Tal', 'Sen', 'Bel', 'Fen', 'Lor', 'Ven', 'Ard', 'Bro', 'Cor', 'Dun', 'Eld', 'Grav', 'Hol', 'Iv', 'Jor', 'Kar', 'Lun', 'Mil', 'Ner', 'Pol', 'Quen', 'Rad', 'Stav', 'Tor', 'Ul', 'Vard', 'Zel'],
  suf: ['el', 'mar', 'in', 'ia', 'row', 'enn', 'ik', 'vel', 'ade', 'ford', 'holm', 'grad', 'ova', 'eth', 'ra', 'an', 'esk', 'ton', 'sk', 'ice', 'burg', 'ane', 'ost', 'ern', 'ov', 'ec', 'yn', 'itz', 'dal', 'by'],
  ridge: ['Iron Ridge', 'Grey Teeth', 'Stormcrown', 'Old Mountains', 'Wolf Hills', 'High Karst', 'Pale Range', 'Crow Heights'],
  airline: ['KES', 'AUR', 'VAL', 'MER', 'ALD', 'SOR', 'LUN', 'FAE', 'COR', 'DRE', 'TRN', 'NRD']
};

})(window.IC);
