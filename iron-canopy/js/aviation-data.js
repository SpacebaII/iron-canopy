/* Iron Canopy — aviation data: aircraft types, airport parts, airline archetypes.
   Airport geometry is real scale: one world unit is 100 m. */
(function (IC) {
'use strict';

/* rwy = runway length needed (units of 100 m); stand = smallest stand that fits; turn = turnaround seconds;
   fuel = fuel units per departure; fee = landing fee in ₭M */
IC.ACTYPES = {
  turbo:   { name: 'Regional turboprop', short: 'ATR', span: 0.27, len: 0.27, rwy: 13, seats: 70, turn: 1500, fuel: 2, stand: 's', cruise: 1.6, alt: 7, fee: 0.5 },
  narrow:  { name: 'Narrow-body jet', short: 'A32', span: 0.36, len: 0.38, rwy: 21, seats: 180, turn: 2400, fuel: 6, stand: 'm', cruise: 2.3, alt: 11, fee: 1.1 },
  wide:    { name: 'Wide-body jet', short: 'B77', span: 0.62, len: 0.64, rwy: 27, seats: 330, turn: 3900, fuel: 16, stand: 'l', cruise: 2.5, alt: 11.5, fee: 2.4 },
  cargo:   { name: 'Freighter', short: 'F74', span: 0.64, len: 0.7, rwy: 29, seats: 0, cargo: 110, turn: 4800, fuel: 20, stand: 'l', cruise: 2.4, alt: 11, fee: 2.2 },
  fighter: { name: 'Fighter', short: 'FTR', span: 0.11, len: 0.16, rwy: 10, stand: 's', fuel: 3, mil: true },
  heavy:   { name: 'Large military aircraft', short: 'AEW', span: 0.42, len: 0.46, rwy: 22, stand: 'm', fuel: 8, mil: true },
  drone:   { name: 'Drone', short: 'UAV', span: 0.2, len: 0.1, rwy: 8, stand: 's', fuel: 1, mil: true },
  heli:    { name: 'Helicopter', short: 'HEL', span: 0.16, len: 0.18, rwy: 0, stand: 's', fuel: 1, mil: true, vtol: true }
};
IC.STAND = { s: { w: 0.32, d: 0.36, name: 'small' }, m: { w: 0.46, d: 0.5, name: 'medium' }, l: { w: 0.76, d: 0.8, name: 'large' } };
IC.STAND_FITS = { s: ['s'], m: ['s', 'm'], l: ['s', 'm', 'l'] };
/* which aircraft type each air wing flight uses on the ground */
IC.AIRKIND_TYPE = { ftr: 'fighter', atk: 'heli', ucav: 'drone', aew: 'heavy', isr: 'drone', heli: 'heli', cargo: 'heavy' };

/* Airport parts. Line parts (runway, taxiway) cost per 100 m; area parts per hectare (1 unit²); the rest per item.
   build = seconds of engineer work per unit of the same measure. */
IC.APART = {
  runway:   { name: 'Runway', line: true, w: 0.45, cost: 15, build: 200, hp: 100, desc: 'Length decides which aircraft can use it. Craters split it into shorter strips.' },
  taxi:     { name: 'Taxiway', line: true, w: 0.23, cost: 4, build: 70, hp: 40, desc: 'Connects runways, aprons and shelters. Every exit off the runway shortens how long landings block it.' },
  apron:    { name: 'Apron', area: true, cost: 12, build: 150, hp: 60, desc: 'Parking stands. Its depth decides the stand size: deep aprons take wide-bodies.' },
  terminal: { name: 'Terminal', area: true, cost: 40, build: 420, hp: 80, pax: 450, desc: 'Passengers per hour. Stands next to it turn aircraft around faster.' },
  cargo:    { name: 'Cargo terminal', area: true, cost: 25, build: 360, hp: 60, desc: 'Needed for freighters. Freighters bring cargo revenue at night.' },
  hangar:   { name: 'Hangar', w: 0.7, h: 0.55, cost: 60, build: 1200, hp: 40, holds: 2, desc: 'Maintenance and shelter. Aircraft inside a hit hangar are usually lost.' },
  has:      { name: 'Hardened shelter', w: 0.32, h: 0.26, cost: 120, build: 2000, hp: 140, holds: 1, mil: true, desc: 'Concrete shelter for one fighter flight. Aircraft inside usually survive.' },
  alert:    { name: 'Alert pad', w: 0.42, h: 0.3, cost: 70, build: 1200, hp: 50, holds: 1, mil: true, desc: 'Quick-reaction shelter at the runway end: fighters on alert scramble in minutes.' },
  fuel:     { name: 'Fuel tank', r: 0.13, cost: 35, build: 900, hp: 40, cap: 100, desc: 'Fuel for departures. Burning tanks set fire to anything close: spread them out.' },
  tower:    { name: 'Control tower', w: 0.14, h: 0.14, cost: 50, build: 1200, hp: 40, desc: 'Without a tower an airport handles only a handful of movements an hour.' },
  fire:     { name: 'Fire station', w: 0.28, h: 0.2, cost: 35, build: 900, hp: 40, desc: 'Needed for large aircraft. It must be close to the runways.' },
  atc:      { name: 'Approach radar', w: 0.12, h: 0.12, cost: 110, build: 1200, hp: 30, emits: true, desc: 'Tighter arrival spacing and a radar picture out to about 45 km that sees aircraft without transponders. It shares the spectrum with other radars.' },
  ammo:     { name: 'Munitions store', w: 0.3, h: 0.22, cost: 50, build: 1200, hp: 40, mil: true, desc: 'Weapons for the air wing. A hit here blows up.' }
};
IC.APART_ORDER = ['runway', 'taxi', 'apron', 'terminal', 'cargo', 'hangar', 'fuel', 'tower', 'fire', 'atc', 'has', 'alert', 'ammo'];

/* Airline archetypes: they fly differently and want different things from your airports. */
IC.AIRLINE_KIND = {
  flag:     { style: 'Flag carrier', fleet: ['narrow', 'narrow', 'wide'], feeTol: 1.3, delayTol: 12, taxiTol: 14, likes: 'A big terminal, long runways and a hub at the capital.', dislikes: 'Delays, cramped stands and being made to look small.' },
  budget:   { style: 'Low-cost', fleet: ['narrow'], feeTol: 0.65, delayTol: 8, taxiTol: 8, likes: 'Quick turnarounds, short taxi times and low fees.', dislikes: 'Fees and long taxiing: every minute on the ground is money.' },
  regional: { style: 'Regional', fleet: ['turbo'], feeTol: 0.85, delayTol: 15, taxiTol: 12, likes: 'Small airports and short hops.', dislikes: 'Being squeezed off busy runways.' },
  cargo:    { style: 'Cargo', fleet: ['cargo'], feeTol: 1.0, delayTol: 20, taxiTol: 16, night: true, likes: 'Night slots, cargo terminals and long runways.', dislikes: 'Curfews and short runways.' },
  foreign:  { style: 'Foreign carrier', fleet: ['narrow', 'wide'], feeTol: 1.1, delayTol: 14, taxiTol: 14, foreign: true, likes: 'Reliable connections and fair fees.', dislikes: 'Danger. They leave first when things get tense.' }
};
IC.AIRLINE_NAMES = {
  budget: ['SkyHop', 'Zipjet', 'Flybee', 'Jetlink', 'Hopper Air', 'Cirrus Low'],
  regional: ['Aurora Connect', 'Valley Air', 'Kite Regional', 'Fjord Link'],
  cargo: ['Nordcargo', 'Atlas Freight', 'Meridian Cargo', 'Iron Kite Cargo']
};
/* radar bands: radars on the same band close together interfere with each other */
IC.BAND = { vhf: 'VHF', lr3d: 'L', mr3d: 'S', gf: 'X', aero: 'S', ssr: 'SSR', bmd: 'X' };
IC.BAND_NAME = { VHF: 'VHF', L: 'L-band', S: 'S-band', X: 'X-band', SSR: 'SSR' };
IC.LIVERY = [['#c8323c', '#1c2a44'], ['#1f6fb5', '#e8b820'], ['#e07b1a', '#2b2b2b'], ['#2f8f5b', '#e8eef2'], ['#6b3fa0', '#f0c040'], ['#20a3a8', '#1a3040'], ['#b01e68', '#f4f4f4'], ['#3d4f6b', '#e05a2a']];

})(window.IC);
