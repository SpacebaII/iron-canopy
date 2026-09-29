/* Iron Canopy — aviation data: aircraft types, airport parts, airline archetypes.
   Airport geometry is real scale: one world unit is 100 m. */
(function (IC) {
'use strict';

/* rwy = runway length needed (units of 100 m); stand = smallest stand that fits; turn = turnaround seconds;
   fuel = fuel units per departure; fee = landing fee in ₭M; xw, tw = the largest crosswind and tailwind (knots) the
   crew may land or take off in; zone = where it parks */
IC.ACTYPES = {
  light:   { name: 'Light aircraft', short: 'C172', ht: 2.7, span: 0.11, len: 0.08, rwy: 6, seats: 3, turn: 900, fuel: 0.2, stand: 's', cruise: 0.6, alt: 2, fee: 0.05, xw: 15, tw: 5, zone: 'light', ga: 1 },
  turbo:   { name: 'Regional turboprop', short: 'ATR', ht: 7.6, span: 0.27, len: 0.27, rwy: 13, seats: 70, turn: 1500, fuel: 2, stand: 's', cruise: 1.6, alt: 7, fee: 0.5, xw: 25, tw: 10, zone: 'civil' },
  narrow:  { name: 'Narrow-body jet', short: 'A32', ht: 11.8, span: 0.36, len: 0.38, rwy: 21, seats: 180, turn: 2400, fuel: 6, stand: 'm', cruise: 2.3, alt: 11, fee: 1.1, xw: 33, tw: 10, zone: 'civil' },
  wide:    { name: 'Wide-body jet', short: 'B77', ht: 18.5, span: 0.62, len: 0.64, rwy: 27, seats: 330, turn: 3900, fuel: 16, stand: 'l', cruise: 2.5, alt: 11.5, fee: 2.4, xw: 38, tw: 15, zone: 'civil' },
  cargo:   { name: 'Freighter', short: 'F74', ht: 19.4, span: 0.64, len: 0.7, rwy: 29, seats: 0, cargo: 110, turn: 4800, fuel: 20, stand: 'l', cruise: 2.4, alt: 11, fee: 2.2, xw: 38, tw: 15, zone: 'cargo' },
  // more airliners: the airlines fly them by fleet (IC.AIRLINE_KIND[].fleets)
  rj:      { name: 'Regional jet', short: 'E75', ht: 9.9, span: 0.26, len: 0.32, rwy: 17, seats: 88, turn: 1800, fuel: 4, stand: 's', cruise: 2.2, alt: 11, fee: 0.8, xw: 30, tw: 10, zone: 'civil' },
  widel:   { name: 'Large twin-aisle jet', short: 'B7W', ht: 18.5, span: 0.65, len: 0.74, rwy: 30, seats: 396, turn: 4200, fuel: 22, stand: 'l', cruise: 2.5, alt: 11.5, fee: 3.0, xw: 38, tw: 15, zone: 'civil', ops: 'heavy' },
  jumbo:   { name: 'Double-deck giant', short: 'A38', ht: 24.1, span: 0.8, len: 0.73, rwy: 30, seats: 520, turn: 5400, fuel: 30, stand: 'l', cruise: 2.5, alt: 12, fee: 4.2, xw: 38, tw: 15, zone: 'civil', ops: 'heavy' },
  cargoprop: { name: 'Cargo turboprop', short: 'C27', ht: 9.6, span: 0.29, len: 0.23, rwy: 12, seats: 0, cargo: 10, turn: 2400, fuel: 2, stand: 's', cruise: 1.5, alt: 7, fee: 0.5, xw: 25, tw: 10, zone: 'cargo', ops: 'turbo' },
  fighter: { name: 'Fighter', short: 'FTR', ht: 5.1, span: 0.11, len: 0.16, rwy: 10, stand: 's', fuel: 3, mil: true, xw: 30, tw: 10, crew: 1, zone: 'mil' },
  heavy:   { name: 'Large military aircraft', short: 'AEW', ht: 12.6, span: 0.42, len: 0.46, rwy: 22, stand: 'm', fuel: 8, mil: true, xw: 30, tw: 10, crew: 12, zone: 'mil' },
  drone:   { name: 'Drone', short: 'UAV', ht: 3.6, span: 0.2, len: 0.1, rwy: 8, stand: 's', fuel: 1, mil: true, xw: 15, tw: 5, crew: 0, zone: 'mil' },
  heli:    { name: 'Helicopter', short: 'HEL', ht: 4.4, span: 0.16, len: 0.18, rwy: 0, stand: 's', fuel: 1, mil: true, vtol: true, xw: 40, tw: 40, crew: 3, zone: 'mil' }
};
/* general aviation, business aviation and the rare visitors (civil.js flies them; ga, biz, rare say which) */
Object.assign(IC.ACTYPES, {
  tourer:   { name: 'Low-wing tourer', short: 'P28', ht: 2.2, span: 0.107, len: 0.073, rwy: 6, seats: 3, turn: 900, fuel: 0.2, stand: 's', cruise: 0.62, alt: 2, fee: 0.05, xw: 17, tw: 5, zone: 'light', ga: 1 },
  retract:  { name: 'Retractable single', short: 'BE36', ht: 2.6, span: 0.102, len: 0.084, rwy: 7, seats: 5, turn: 900, fuel: 0.3, stand: 's', cruise: 0.85, alt: 3, fee: 0.06, xw: 17, tw: 10, zone: 'light', ga: 1 },
  twin:     { name: 'Light twin', short: 'BE58', ht: 3.0, span: 0.115, len: 0.091, rwy: 8, seats: 5, turn: 1200, fuel: 0.5, stand: 's', cruise: 0.95, alt: 3.5, fee: 0.08, xw: 22, tw: 10, zone: 'light', ga: 1 },
  taildrag: { name: 'Aerobatic taildragger', short: 'EXTR', ht: 2.6, span: 0.08, len: 0.071, rwy: 5, seats: 1, turn: 600, fuel: 0.15, stand: 's', cruise: 0.75, alt: 2, fee: 0.04, xw: 12, tw: 5, zone: 'light', ga: 1 },
  utility:  { name: 'Utility turboprop', short: 'C208', ht: 4.5, span: 0.159, len: 0.127, rwy: 7, seats: 12, turn: 1200, fuel: 0.6, stand: 's', cruise: 0.85, alt: 3, fee: 0.12, xw: 20, tw: 10, zone: 'light', ga: 1 },
  helil:    { name: 'Light helicopter', short: 'R44', ht: 3.3, span: 0.1, len: 0.117, rwy: 0, seats: 3, turn: 600, fuel: 0.2, stand: 's', cruise: 0.5, alt: 0.8, fee: 0.04, xw: 17, tw: 17, zone: 'light', ga: 1, vtol: true },
  helim:    { name: 'Medium helicopter', short: 'A139', ht: 3.9, span: 0.138, len: 0.167, rwy: 0, seats: 12, turn: 900, fuel: 0.8, stand: 's', cruise: 0.75, alt: 1.2, fee: 0.15, xw: 45, tw: 45, zone: 'light', ga: 1, vtol: true },
  glider:   { name: 'Glider', short: 'GLID', ht: 1.5, span: 0.17, len: 0.084, rwy: 5, seats: 2, turn: 900, fuel: 0, stand: 's', cruise: 0.3, alt: 1.5, fee: 0.02, xw: 12, tw: 5, zone: 'light', ga: 1 },
  micro:    { name: 'Microlight', short: 'ULM', ht: 2.5, span: 0.1, len: 0.042, rwy: 3, seats: 2, turn: 600, fuel: 0.05, stand: 's', cruise: 0.3, alt: 0.8, fee: 0.02, xw: 10, tw: 5, zone: 'light', ga: 1 },
  vlj:      { name: 'Very light jet', short: 'E50P', ht: 4.4, span: 0.123, len: 0.128, rwy: 10, seats: 4, turn: 1200, fuel: 0.8, stand: 's', cruise: 2.0, alt: 12, fee: 0.15, xw: 20, tw: 10, zone: 'light', biz: 1 },
  bizjet:   { name: 'Mid-size business jet', short: 'CL35', ht: 6.1, span: 0.21, len: 0.209, rwy: 15, seats: 9, turn: 1500, fuel: 2, stand: 's', cruise: 2.3, alt: 13, fee: 0.3, xw: 24, tw: 10, zone: 'light', biz: 1 },
  bizlong:  { name: 'Long-range business jet', short: 'GLF6', ht: 7.9, span: 0.304, len: 0.304, rwy: 18, seats: 14, turn: 1800, fuel: 4, stand: 's', cruise: 2.6, alt: 14, fee: 0.5, xw: 26, tw: 10, zone: 'light', biz: 1 },
  bizprop:  { name: 'Business turboprop', short: 'B350', ht: 4.4, span: 0.177, len: 0.142, rwy: 9, seats: 9, turn: 1200, fuel: 0.8, stand: 's', cruise: 1.45, alt: 9, fee: 0.15, xw: 25, tw: 10, zone: 'light', biz: 1 },
  vintage:  { name: 'Vintage four-engine airliner', short: 'L1049', ht: 7.4, span: 0.375, len: 0.346, rwy: 18, seats: 60, turn: 3600, fuel: 6, stand: 'm', cruise: 1.4, alt: 6, fee: 1, xw: 25, tw: 10, zone: 'civil', rare: 1 },
  sst:      { name: 'Supersonic airliner', short: 'CONC', ht: 12.2, span: 0.256, len: 0.617, rwy: 30, seats: 100, turn: 3600, fuel: 30, stand: 'l', cruise: 2.6, alt: 15, fee: 3, xw: 30, tw: 10, zone: 'civil', rare: 1 },
  outsize:  { name: 'Outsize freighter', short: 'BLGX', ht: 18.9, span: 0.603, len: 0.631, rwy: 26, seats: 0, cargo: 50, turn: 4800, fuel: 16, stand: 'l', cruise: 2.3, alt: 11, fee: 2.5, xw: 30, tw: 10, zone: 'civil', rare: 1 },
  airship:  { name: 'Airship', short: 'ZNT', ht: 17.4, span: 0.195, len: 0.751, rwy: 0, seats: 12, turn: 3600, fuel: 1, stand: 'l', cruise: 0.3, alt: 0.6, fee: 0.5, xw: 20, tw: 20, zone: 'civil', rare: 1, vtol: true },
  amphib:   { name: 'Firefighting amphibian', short: 'CL41', ht: 8.9, span: 0.286, len: 0.198, rwy: 10, seats: 2, turn: 1800, fuel: 3, stand: 's', cruise: 1.0, alt: 3, fee: 0.3, xw: 25, tw: 10, zone: 'civil', rare: 1 },
  display:  { name: 'Display team jet', short: 'HAWK', ht: 4.0, span: 0.094, len: 0.112, rwy: 10, seats: 2, turn: 1800, fuel: 1, stand: 's', cruise: 2.0, alt: 1.5, fee: 0.1, xw: 25, tw: 10, zone: 'civil', rare: 1 },
  state:    { name: 'State aircraft', short: 'VC25', ht: 19.3, span: 0.596, len: 0.707, rwy: 28, seats: 70, turn: 5400, fuel: 20, stand: 'l', cruise: 2.5, alt: 12, fee: 0, xw: 38, tw: 15, zone: 'civil', rare: 1 }
});
IC.STAND = { s: { w: 0.32, d: 0.36, name: 'small' }, m: { w: 0.46, d: 0.5, name: 'medium' }, l: { w: 0.76, d: 0.8, name: 'large' } };
IC.STAND_FITS = { s: ['s'], m: ['s', 'm'], l: ['s', 'm', 'l'] };
/* which aircraft type each air wing flight uses on the ground */
IC.AIRKIND_TYPE = { ftr: 'fighter', atk: 'heli', ucav: 'drone', aew: 'heavy', isr: 'drone', heli: 'heli', cargo: 'heavy', tkr: 'heavy' };

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
  ammo:     { name: 'Munitions store', w: 0.3, h: 0.22, cost: 50, build: 1200, hp: 40, mil: true, desc: 'Weapons for the air wing. A hit here blows up.' },
  ils:      { name: 'Landing system (ILS)', w: 0.3, h: 0.08, cost: 25, build: 900, hp: 20, perEnd: true, desc: 'Radio beams that guide arrivals down to 60 m above one runway end. In fog and low cloud, arrivals divert unless the end they land on has one.' },
  gradar:   { name: 'Ground radar', w: 0.1, h: 0.1, cost: 60, build: 900, hp: 20, desc: 'Shows the tower every aircraft on the ground, at night and in fog. Without it, an aircraft crossing a runway can stray onto one in use.' },
  hydrant:  { name: 'Hydrant fuel system', w: 0.24, h: 0.18, cost: 90, build: 1500, hp: 30, pipe: 900, reach: 14, desc: 'A pipeline feeds the tanks and pipes fuel under the aprons within 1.4 km: no fuel trucks to wait for, quicker turnarounds.' },
  support:  { name: 'Support building', area: true, cost: 15, build: 300, hp: 40, desc: 'Offices, workshops, catering, the airport authority. They keep the airport running; they add no capacity.' },
  skybridge: { name: 'Passenger bridge', area: true, cost: 400, build: 600, hp: 40, over: true, desc: 'A walkway over a taxiway between a terminal and a concourse. Aircraft taxi under it only if their tail clears it.' },
  people:   { name: 'People mover', line: true, w: 0.08, cost: 30, build: 400, hp: 40, desc: 'A driverless train between the terminal and its concourses, on a viaduct or in a tunnel: passengers change in minutes instead of a bus ride.' }
};
IC.APART_ORDER = ['runway', 'taxi', 'apron', 'terminal', 'cargo', 'hangar', 'fuel', 'hydrant', 'tower', 'fire', 'atc', 'gradar', 'ils', 'has', 'alert', 'ammo'];
/* who may park where: every part and stand belongs to one zone */
IC.ZONES = { civil: { name: 'Passenger', short: 'PAX' }, cargo: { name: 'Cargo', short: 'CGO' }, light: { name: 'Light aircraft', short: 'GA' }, mil: { name: 'Military', short: 'MIL' } };
/* fuel trucks: refuellings an hour each tank's trucks can make where there is no hydrant system */
IC.FUEL_TRUCKS = 8;

/* Airline archetypes: they fly differently and want different things from your airports. Each airline flies one of
   its kind's fleets (by its name, IC.avFleetOf) and wears one livery on all of them. */
IC.AIRLINE_KIND = {
  flag:     { style: 'Flag carrier', fleet: ['narrow', 'narrow', 'wide'], fleets: [['narrow', 'narrow', 'wide'], ['narrow', 'narrow', 'widel'], ['narrow', 'widel', 'jumbo']], feeTol: 1.3, delayTol: 12, taxiTol: 14, likes: 'A big terminal, long runways and a hub at the capital.', dislikes: 'Delays, cramped stands and being made to look small.' },
  budget:   { style: 'Low-cost', fleet: ['narrow'], fleets: [['narrow']], feeTol: 0.65, delayTol: 8, taxiTol: 8, likes: 'Quick turnarounds, short taxi times and low fees.', dislikes: 'Fees and long taxiing: every minute on the ground is money.' },
  regional: { style: 'Regional', fleet: ['turbo'], fleets: [['turbo'], ['turbo', 'rj']], feeTol: 0.85, delayTol: 15, taxiTol: 12, likes: 'Small airports and short hops.', dislikes: 'Being squeezed off busy runways.' },
  cargo:    { style: 'Cargo', fleet: ['cargo'], fleets: [['cargo'], ['cargo', 'cargo', 'cargoprop']], feeTol: 1.0, delayTol: 20, taxiTol: 16, night: true, likes: 'Night slots, cargo terminals and long runways.', dislikes: 'Curfews and short runways.' },
  foreign:  { style: 'Foreign carrier', fleet: ['narrow', 'wide'], fleets: [['narrow', 'wide'], ['narrow', 'widel'], ['narrow', 'jumbo'], ['rj', 'narrow']], feeTol: 1.1, delayTol: 14, taxiTol: 14, foreign: true, likes: 'Reliable connections and fair fees.', dislikes: 'Danger. They leave first when things get tense.' }
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
