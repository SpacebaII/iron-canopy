/* Iron Canopy — the build bar (brief 44): building airports from a toolbar along the bottom of the screen, as in a
   city builder. Category tabs (1–0), a row of large items with a picture of each drawn in code, a card with the
   details on hover, an options bar of chips above for the chosen item (pavement, width, lights, stand size, zone,
   one-way), and the tools: Upgrade, Move, Bulldoze, Undo and the info views. It opens with B, with the Build button in
   the top bar, or when an airport is selected; the inspector keeps showing whatever is selected. The placing itself
   (the ghost, snapping, guides, the cost by the cursor) is builder.js and render-airport.js. */
(function (IC) {
'use strict';
const U = IC.U, esc = U.esc, $ = id => (typeof document === 'undefined' ? null : document.getElementById(id));
const S_ = () => IC.S;

/* The info views the bar's Info button opens (drawn by render-infoview.js) */
IC.INFO_VIEWS = {
  taxi: { name: 'Taxi congestion', desc: 'Where aircraft taxi and where they wait, while this view is open: green flows, red queues.' },
  stands: { name: 'Stand use', desc: 'How much of the time each stand has had an aircraft on it, while this view is open.' },
  walk: { name: 'Walking to gates', desc: 'How far passengers walk from the terminal to each stand; beyond 400 m they go by bus.' },
  service: { name: 'Fuel and services', desc: 'What the hydrant pipes reach, the fire station\'s three-minute reach, and where a burning tank spreads.' },
  noise: { name: 'Noise over towns', desc: 'Under each runway\'s flight paths: the homes that hear every take-off and landing.' },
  capacity: { name: 'Runway capacity', desc: 'What each runway takes an hour in the wind now, and what it is used for.' }
};

/* The heat on each taxiway edge and the use of each stand, gathered while the info view is open (game seconds,
   fading over about two hours). Leave it open through a busy morning and it shows where the queues form. */
function gather(S, ap) {
  const H = ap._iv || (ap._iv = { t: S.time, e: new Map(), s: new Map() });
  const dt = U.clamp(S.time - H.t, 0, 600); H.t = S.time; if (!dt) return H;
  const k = Math.exp(-dt / 7200);
  for (const [key, v] of H.e) H.e.set(key, v * k);
  for (const [key, v] of H.s) H.s.set(key, v * k);
  for (const m of ap.moves) if (!m.dead && m.edgeKey) H.e.set(m.edgeKey, (H.e.get(m.edgeKey) || 0) + dt * (m.holding ? 3 : 1));
  for (const p of ap.parts) if (p.kind === 'apron' && p.built) for (const s of p.stands || []) H.s.set(s.id, (H.s.get(s.id) || 0) + (s.occ ? dt : 0));
  return H;
}
IC.infoGather = gather;

/* the tabs and what is in each (part kinds from IC.APART, tools from IC.BTOOLS, roads from IC.ROADS) */
IC.BB_TABS = [
  { k: 'rw', key: '1', name: 'Runways', items: ['runway', 'exits'] },
  { k: 'tw', key: '2', name: 'Taxiways', items: ['taxi', 'parallel', 'hold'] },
  { k: 'ap', key: '3', name: 'Aprons & stands', items: ['apron', 'remote', 'ramp', 'stand', 'stretch', 'alert'] },
  { k: 'tm', key: '4', name: 'Terminals & piers', items: ['terminal', 'concourse', 'rotunda', 'satellite', 'curved', 'semicircle', 'pierT', 'pierY', 'pierX', 'skybridge', 'people'] },
  { k: 'cg', key: '5', name: 'Cargo & hangars', items: ['cargo', 'hangar', 'has', 'ammo'] },
  { k: 'fs', key: '6', name: 'Fuel & services', items: ['fuel', 'hydrant', 'fuelpad', 'deice', 'fire'] },
  { k: 'ls', key: '7', name: 'Landside & roads', items: ['svcroad', 'road:lc', 'road:rd', 'road:hw', 'carpark'] },
  { k: 'nv', key: '8', name: 'Navaids & radar', items: ['ils', 'tower', 'atc', 'gradar'] },
  { k: 'lk', key: '9', name: 'Looks & paint', items: ['surface'] },
  { k: 'bp', key: '0', name: 'Blueprints', items: ['blueprint'] }
];
const TAB_ICON = {
  rw: '<path d="M9 2l-3 20M15 2l3 20M12 4v3M12 10v3M12 16v3"/>',
  tw: '<path d="M4 21v-8a6 6 0 0 1 6-6h10M4 13a6 6 0 0 1 6-6"/><path d="M8 21v-7a3 3 0 0 1 3-3h9" opacity=".5"/>',
  ap: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M7 19v-6M12 19v-6M17 19v-6"/>',
  tm: '<path d="M3 20V9h18v11M3 9l9-5 9 5M7 13h2M11 13h2M15 13h2"/>',
  cg: '<path d="M3 20V8l9-4 9 4v12M7 20v-6h10v6M7 17h10"/>',
  fs: '<path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M4 21h13M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M8 7h5"/>',
  ls: '<path d="M8 3L5 21M16 3l3 18M12 5v2M12 11v2M12 17v2"/>',
  nv: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  lk: '<path d="M4 20c4 0 5-3 5-5a3 3 0 0 1 6 0M14 4l6 6-8 8-3-3z"/>',
  bp: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9M14 13h4M14 17h4"/>'
};
const TOOL_ICON = {
  upgrade: '<path d="M12 20V5M6 11l6-6 6 6M5 20h14"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  bulldoze: '<path d="M3 17h11l3-6h4M3 17v3h14v-3M5 17V9h6l2 4M17 11V6"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>',
  info: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/>'
};
const ico = p => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

/* what the player reads about each item: name, price, one line of use, and the details card */
const USE = {
  runway: 'where aircraft land and take off', exits: 'angled exits: landings clear the runway sooner', taxi: 'joins runways, aprons and buildings',
  parallel: 'a full-length taxiway beside a runway', hold: 'a second entry, so one aircraft can pass another', apron: 'stands along its back edge',
  remote: 'stands served by bus, with its own taxilane', ramp: 'paving where you place stands yourself', stand: 'one parking place, any size',
  stretch: 'makes an apron bigger', alert: 'fighters on alert at the runway end', terminal: 'passengers an hour; gates for the stands beside it',
  concourse: 'a pier with gates on both sides', rotunda: 'gates fanned round a round building', satellite: 'a round pod of gates on a people mover',
  curved: 'a pier on an arc, gates both sides', semicircle: 'gates outside, parking inside the curve', pierT: 'a pier that splits at its end',
  pierY: 'a pier that forks at its end', pierX: 'four piers from a hub', skybridge: 'a walkway over a taxiway', people: 'a train from the terminal to its concourses',
  cargo: 'freighters load and unload here', hangar: 'maintenance: airlines want some based here', has: 'protects one fighter flight', ammo: 'weapons for the air wing',
  fuel: 'fuel for departures, by truck', hydrant: 'fuel piped under the stands', fuelpad: 'a stand to refuel at', deice: 'de-icing on frosty mornings',
  fire: 'crash rescue: needed for large aircraft', ils: 'landings in fog, at one runway end', tower: 'clearances: many more movements an hour',
  atc: 'closer spacing of arrivals', gradar: 'the tower sees aircraft on the ground in fog', surface: 'grass, gravel, paving or planting', blueprint: 'a whole real airport',
  svcroad: 'an airside road for the ground vehicles', 'road:lc': 'a two-lane road to the nearest road', 'road:rd': 'a main road to a town', 'road:hw': 'a motorway spur and interchange', carpark: 'parking outside the airfield: income'
};
const NEEDS = {
  runway: 'Room in line with the wind, clear of towns under the approach. Paving it needs lorry loads of concrete or asphalt.',
  exits: 'A runway with a parallel taxiway.', hold: 'A runway end with a parallel taxiway.', parallel: 'A runway.',
  taxi: 'Something to join: a runway, an apron or another taxiway.', apron: 'A taxiway to reach it.', remote: 'Buses from the terminal (automatic).',
  stand: 'An apron or open ramp.', stretch: 'An apron to stretch.', alert: 'A runway end.', terminal: 'An apron beside it for gates; a road from the town.',
  concourse: 'Room for aprons on both sides.', rotunda: 'Room round it; a taxiway to its ring.', satellite: 'A terminal, and a people mover to it.',
  curved: 'Room for its aprons.', semicircle: 'A road from the town to its kerb.', pierT: 'A terminal at its root.', pierY: 'A terminal at its root.', pierX: 'A people mover from the terminal.', skybridge: 'A taxiway to bridge, between two terminal buildings.', people: 'A terminal and a concourse to join.',
  cargo: 'An apron beside it.', hangar: 'A taxiway to its door.', has: 'A taxiway to its door.', fuel: 'Keep tanks 140 m apart: one fire takes them all.',
  hydrant: 'Fuel tanks; stands within reach of its pipes.', fuelpad: 'A taxiway, near the fuel farm.', deice: 'A taxiway near the runway ends.',
  fire: 'A place from which trucks reach every runway in three minutes.', ils: 'A runway end, and research for the best category.', tower: 'A view of the runways.',
  atc: 'Nothing: it covers about 110 km.', gradar: 'Research (Career).', surface: 'Nothing. Aircraft never use it.', blueprint: 'A flat site big enough for it.',
  svcroad: 'Nothing: it may cross taxiways, not runways.', 'road:lc': 'An airport.', 'road:rd': 'An airport.', 'road:hw': 'An airport, and a motorway within reach.', carpark: 'Ground outside the fence, near the terminal.'
};
function itemOf(k) {
  const S = S_(), R = k.startsWith('road:') ? IC.ROADS[k.slice(5)] : null;
  if (R) return { k, name: R.name, price: `${U.money(R.perKm)} a km`, use: USE[k], desc: `${R.what[0].toUpperCase() + R.what.slice(1)}. It is built at ${R.kmh} km a game hour; bridges cost ${U.money(R.bridge)} each.`, upkeep: '' };
  if (k === 'carpark') return { k, name: 'Car park', price: `${U.money(IC.APART.surface.cost * IC.SURF.asph.k)} a ha`, use: USE[k], desc: `Asphalt outside the airfield parks about ${IC.SURF.asph.park} cars a hectare, and travellers pay to park.`, upkeep: '' };
  const D = IC.APART[k], T = IC.BTOOLS[k];
  if (D) {
    const per = D.line ? ' / 100 m' : D.area ? ' / ha' : '';
    return { k, name: D.name, price: U.money(D.cost) + per, use: USE[k] || '', desc: D.desc, upkeep: `${U.money(D.cost * 0.0012 * 24)}${per} a day`, time: U.dur(D.build), lock: IC.aptLockWhy(S, k), mil: D.mil };
  }
  if (T && T.kit) return { k, name: T.name, price: `${U.money(IC.kitCost(k, 'm'))} (medium gates)`, use: USE[k] || '', desc: T.desc, upkeep: `${U.money(IC.kitCost(k, 'm') * 0.0012 * 24)} a day`, avail: true };
  if (T) return { k, name: T.name, price: k === 'stand' ? '₭0.5M each' : k === 'svcroad' ? `${U.money(IC.SVC_ROAD_COST)} / 100 m` : k === 'blueprint' ? 'a whole airport' : 'several parts', use: USE[k] || '', desc: T.desc, upkeep: '', avail: !T.avail || T.avail() };
  return { k, name: k, price: '', use: '', desc: '' };
}

/* ---------- pictures of the items, drawn once ---------- */
const THUMB = {};
const TW = 132, TH = 76;
function thumb(k) {
  if (THUMB[k]) return THUMB[k];
  const c = document.createElement('canvas'); c.width = TW * 2; c.height = TH * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  // grass, then the part at about 20 px a 100 m
  g.fillStyle = IC.paveFill ? IC.paveFill(g, 'grass', 60, 0, 0, 0) : '#5e7a48'; g.fillRect(0, 0, TW, TH);
  const conc = IC.paveFill ? IC.paveFill(g, 'conc', 240, 0, 0, 0.3) : '#8c8e8a', asph = IC.paveFill ? IC.paveFill(g, 'asph', 240, 0, 0, 0) : '#3e4042';
  const Y = '#e8bc34', W = '#eeeee6', lw = w => { g.lineWidth = w; };
  const strip = (x0, y0, x1, y1, w, fill) => { g.strokeStyle = fill; lw(w); g.lineCap = 'butt'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const runway = (y, x0, x1) => { g.fillStyle = '#6a6c68'; g.fillRect(x0, y - 9, x1 - x0, 18); g.fillStyle = conc; g.fillRect(x0, y - 7, x1 - x0, 14); g.fillStyle = W; for (let x = x0 + 16; x < x1 - 14; x += 12) g.fillRect(x, y - 0.5, 7, 1); for (let i = 0; i < 5; i++) { g.fillRect(x0 + 3, y - 6 + i * 2.6, 9, 1.4); } g.fillRect(x0, y - 6.8, x1 - x0, 0.7); g.fillRect(x0, y + 6.1, x1 - x0, 0.7); };
  const taxi = (pts, w) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#74766f'; lw((w || 7) + 3); g.beginPath(); pts.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q[0], q[1])); g.stroke(); g.strokeStyle = conc; lw(w || 7); g.stroke(); g.strokeStyle = Y; lw(0.8); g.stroke(); };
  const plane = (x, y, a, s) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s || 1, s || 1); g.fillStyle = 'rgba(0,0,0,0.25)'; g.translate(1, 1); shape(); g.translate(-1, -1); g.fillStyle = '#f2f3f4'; shape(); g.restore(); };
  const shape = () => { g.beginPath(); g.moveTo(9, 0); g.lineTo(6, -1.2); g.lineTo(1, -1.2); g.lineTo(-2, -8); g.lineTo(-4, -8); g.lineTo(-2, -1.2); g.lineTo(-6, -1); g.lineTo(-8, -4); g.lineTo(-9, -4); g.lineTo(-8.5, 0); g.lineTo(-9, 4); g.lineTo(-8, 4); g.lineTo(-6, 1); g.lineTo(-2, 1.2); g.lineTo(-4, 8); g.lineTo(-2, 8); g.lineTo(1, 1.2); g.lineTo(6, 1.2); g.closePath(); g.fill(); };
  const apron = (x, y, w, h) => { g.fillStyle = conc; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(232,188,52,0.8)'; lw(0.7); g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); };
  const bld = (x, y, w, h, col) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 3, y + 3, w, h); g.fillStyle = col; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,255,255,0.25)'; lw(0.8); g.strokeRect(x + 1, y + 1, w - 2, h - 2); };
  const stands = (x, y, n, sp, up) => { for (let i = 0; i < n; i++) { const cx = x + i * sp; g.strokeStyle = Y; lw(0.7); g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y + (up ? -16 : 16)); g.stroke(); plane(cx, y + (up ? -8 : 8), up ? -Math.PI / 2 : Math.PI / 2, 0.85); } };
  const road = (pts, w) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#2e3032'; lw(w + 1.5); g.beginPath(); pts.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q[0], q[1])); g.stroke(); g.strokeStyle = asph; lw(w); g.stroke(); g.setLineDash([4, 4]); g.strokeStyle = W; lw(0.7); g.stroke(); g.setLineDash([]); };
  switch (k) {
    case 'runway': runway(38, 6, 126); g.fillStyle = W; g.font = '700 7px monospace'; g.fillText('09', 16, 41); break;
    case 'exits': runway(24, 0, 132); taxi([[16, 58], [120, 58]]); taxi([[40, 24], [70, 58]]); taxi([[80, 24], [110, 58]]); break;
    case 'taxi': taxi([[10, 66], [10, 44], [16, 30], [34, 22], [124, 22]], 8); break;
    case 'parallel': runway(22, 0, 132); taxi([[8, 22], [8, 56], [124, 56], [124, 22]]); taxi([[66, 22], [66, 56]]); break;
    case 'hold': runway(14, 0, 132); g.fillStyle = conc; g.beginPath(); g.moveTo(10, 23); g.lineTo(96, 23); g.lineTo(122, 62); g.lineTo(10, 62); g.closePath(); g.fill(); taxi([[0, 66], [132, 66]]); g.strokeStyle = Y; lw(0.9); for (const x of [22, 50, 78]) { g.beginPath(); g.moveTo(x + 24, 64); g.quadraticCurveTo(x, 58, x, 40); g.lineTo(x, 14); g.stroke(); g.fillStyle = Y; g.fillRect(x - 4, 32, 8, 1.2); g.fillRect(x - 4, 34, 8, 1.2); } plane(50, 44, -Math.PI / 2, 0.9); break;
    case 'apron': taxi([[0, 66], [132, 66]]); apron(10, 10, 112, 48); stands(28, 14, 4, 26, false); break;
    case 'remote': taxi([[0, 10], [132, 10]]); apron(8, 16, 116, 50); stands(24, 62, 5, 22, true); break;
    case 'ramp': apron(8, 8, 116, 60); plane(40, 34, 0.4, 1.1); plane(92, 40, -0.3, 1.4); break;
    case 'stand': apron(14, 8, 104, 60); stands(66, 14, 1, 0, false); g.strokeStyle = 'rgba(196,52,44,0.9)'; lw(0.8); g.strokeRect(50, 12, 32, 34); break;
    case 'stretch': apron(10, 14, 60, 48); g.fillStyle = 'rgba(111,230,140,0.35)'; g.fillRect(70, 14, 44, 48); g.strokeStyle = '#6fe68c'; lw(1.2); g.setLineDash([3, 3]); g.strokeRect(70, 14, 44, 48); g.setLineDash([]); g.beginPath(); g.moveTo(78, 38); g.lineTo(104, 38); g.lineTo(98, 33); g.moveTo(104, 38); g.lineTo(98, 43); g.stroke(); break;
    case 'alert': runway(14, 0, 132); taxi([[20, 14], [20, 52]]); apron(24, 36, 40, 30); g.save(); g.translate(44, 51); g.fillStyle = '#a8b0b6'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-4, -8); g.lineTo(-8, -8); g.lineTo(-6, 0); g.lineTo(-8, 8); g.lineTo(-4, 8); g.closePath(); g.fill(); g.restore(); break;
    case 'terminal': apron(0, 44, 132, 32); bld(10, 10, 112, 30, '#b8bcc2'); g.fillStyle = 'rgba(130,178,210,0.9)'; for (let x = 18; x < 116; x += 20) g.fillRect(x, 22, 12, 5); stands(26, 44, 4, 27, false); break;
    case 'concourse': apron(0, 0, 132, 76); bld(8, 31, 116, 14, '#b8bcc2'); stands(22, 31, 5, 22, true); stands(22, 45, 5, 22, false); break;
    case 'skybridge': taxi([[66, 0], [66, 76]], 12); bld(4, 24, 36, 28, '#b8bcc2'); bld(92, 24, 36, 28, '#b8bcc2'); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(40, 38, 52, 6); g.fillStyle = '#d6d8dc'; g.fillRect(40, 34, 52, 6); g.fillStyle = 'rgba(110,150,180,0.9)'; g.fillRect(40, 36, 52, 2); break;
    case 'rotunda': case 'satellite': { g.fillStyle = conc; g.beginPath(); g.arc(66, 38, 36, 0, 7); g.fill(); g.strokeStyle = Y; lw(0.8); g.beginPath(); g.arc(66, 38, 33, 0, 7); g.stroke(); const R = k === 'rotunda' ? 17 : 12; for (let i = 0; i < (k === 'rotunda' ? 9 : 7); i++) { const a = i / (k === 'rotunda' ? 9 : 7) * 6.283; plane(66 + Math.cos(a) * (R + 9), 38 + Math.sin(a) * (R + 9), a + Math.PI, 0.8); } g.fillStyle = '#c6cace'; g.beginPath(); g.arc(66, 38, R, 0, 7); g.fill(); g.fillStyle = 'rgba(130,178,210,0.9)'; g.beginPath(); g.arc(66, 38, R * 0.3, 0, 7); g.fill(); if (k === 'satellite') { g.strokeStyle = '#c8c8c4'; lw(3); g.setLineDash([3, 2]); g.beginPath(); g.moveTo(66 - R, 38); g.lineTo(0, 38); g.stroke(); g.setLineDash([]); } break; }
    case 'curved': case 'semicircle': { const cx = 66, cy = k === 'curved' ? 150 : 74, Rc = k === 'curved' ? 120 : 44, a0 = k === 'curved' ? -1.95 : -Math.PI, a1 = k === 'curved' ? -1.19 : 0; g.fillStyle = conc; g.beginPath(); g.arc(cx, cy, Rc + 26, a0, a1); g.arc(cx, cy, Rc - (k === 'curved' ? 26 : 8), a1, a0, true); g.fill(); g.fillStyle = '#b8bcc2'; g.beginPath(); g.arc(cx, cy, Rc + 6, a0, a1); g.arc(cx, cy, Rc - 6, a1, a0, true); g.fill(); for (let a = a0 + 0.1; a < a1; a += k === 'curved' ? 0.12 : 0.3) plane(cx + Math.cos(a) * (Rc + 15), cy + Math.sin(a) * (Rc + 15), a + Math.PI, 0.7); if (k === 'semicircle') { g.fillStyle = asph; g.beginPath(); g.arc(cx, cy, Rc - 10, Math.PI, 0); g.fill(); } break; }
    case 'pierT': case 'pierY': case 'pierX': { g.fillStyle = conc; g.fillRect(0, 0, TW, TH); const arms = k === 'pierT' ? [Math.PI, -Math.PI / 2, Math.PI / 2] : k === 'pierY' ? [Math.PI, -0.6, 0.6] : [0.79, 2.36, 3.93, 5.5]; g.strokeStyle = '#b8bcc2'; lw(8); g.lineCap = 'butt'; for (const a of arms) { g.beginPath(); g.moveTo(66, 38); g.lineTo(66 + Math.cos(a) * 44, 38 + Math.sin(a) * 34); g.stroke(); } g.fillStyle = '#c6cace'; g.beginPath(); g.arc(66, 38, 8, 0, 7); g.fill(); break; }
    case 'people': bld(6, 20, 30, 36, '#b8bcc2'); bld(96, 20, 30, 36, '#b8bcc2'); g.strokeStyle = '#c8c8c4'; lw(4); g.beginPath(); g.moveTo(36, 38); g.bezierCurveTo(60, 20, 72, 56, 96, 38); g.stroke(); g.fillStyle = '#f0f2f4'; g.fillRect(56, 33, 14, 4); break;
    case 'cargo': apron(0, 46, 132, 30); bld(12, 8, 108, 34, '#a89e86'); g.fillStyle = 'rgba(170,196,214,0.7)'; for (let x = 20; x < 114; x += 10) for (let y = 14; y < 38; y += 10) g.fillRect(x, y, 3, 3); stands(40, 46, 2, 50, false); break;
    case 'hangar': taxi([[0, 66], [132, 66]]); apron(30, 50, 72, 16); bld(30, 10, 72, 40, '#8a9096'); { const gr = g.createLinearGradient(0, 10, 0, 50); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(30, 10, 72, 40); } g.fillStyle = '#2a2e32'; g.fillRect(34, 48, 64, 2); break;
    case 'has': taxi([[66, 76], [66, 50]]); g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(69, 33, 30, 20, 0, 0, 7); g.fill(); g.fillStyle = '#968f7e'; g.beginPath(); g.ellipse(66, 30, 30, 20, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(58, 24, 16, 9, 0, 0, 7); g.fill(); g.fillStyle = '#2a2a26'; g.fillRect(52, 48, 28, 3); break;
    case 'ammo': for (const x of [14, 50, 86]) { g.fillStyle = '#6a7a5c'; g.beginPath(); g.ellipse(x + 16, 38, 16, 22, 0, 0, 7); g.fill(); g.fillStyle = '#3c4a34'; g.fillRect(x + 12, 58, 8, 4); } break;
    case 'fuel': for (const [x, y] of [[34, 24], [78, 24], [34, 56], [78, 56]]) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + 3, y + 3, 13, 0, 7); g.fill(); g.fillStyle = '#e2e0d4'; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.2)'; lw(0.8); g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); } break;
    case 'hydrant': apron(0, 0, 132, 76); g.strokeStyle = '#4a6e96'; lw(2); g.beginPath(); g.moveTo(0, 60); g.lineTo(132, 60); for (const x of [22, 54, 86, 118]) { g.moveTo(x, 60); g.lineTo(x, 26); } g.stroke(); for (const x of [22, 54, 86, 118]) { g.fillStyle = '#8fb4dc'; g.beginPath(); g.arc(x, 26, 3, 0, 7); g.fill(); } break;
    case 'fuelpad': taxi([[0, 60], [132, 60]]); apron(34, 12, 64, 40); g.strokeStyle = Y; lw(1); g.strokeRect(38, 16, 56, 32); g.fillStyle = '#c83c32'; g.fillRect(84, 38, 7, 6); plane(62, 32, 0, 1); break;
    case 'deice': taxi([[0, 60], [132, 60]]); apron(24, 8, 84, 46); g.strokeStyle = '#5ac88c'; lw(1); g.strokeRect(28, 12, 76, 38); g.fillStyle = '#ec7828'; g.fillRect(30, 28, 6, 6); g.fillRect(96, 28, 6, 6); plane(66, 31, 0, 1.3); break;
    case 'fire': bld(28, 12, 76, 46, '#b04638'); g.fillStyle = '#fff'; g.fillRect(60, 20, 12, 30); g.fillRect(50, 30, 32, 10); g.fillStyle = conc; g.fillRect(28, 58, 76, 14); break;
    case 'ils': runway(20, 0, 110); g.fillStyle = '#3a3a3a'; g.fillRect(114, 6, 10, 30); g.fillStyle = '#dc823c'; for (let i = 0; i < 7; i++) g.fillRect(116, 8 + i * 4, 6, 1.6); g.strokeStyle = 'rgba(111,210,255,0.6)'; lw(1); g.beginPath(); g.moveTo(119, 21); g.lineTo(10, 60); g.moveTo(119, 21); g.lineTo(10, 72); g.stroke(); break;
    case 'tower': bld(52, 24, 28, 28, '#c4c6cc'); g.fillStyle = '#28465a'; g.beginPath(); g.arc(66, 38, 10, 0, 7); g.fill(); g.fillStyle = 'rgba(150,200,220,0.8)'; g.beginPath(); g.arc(66, 38, 6, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(80, 52); g.lineTo(130, 76); g.lineTo(110, 76); g.lineTo(52, 52); g.fill(); break;
    case 'atc': case 'gradar': g.strokeStyle = 'rgba(111,210,255,0.35)'; lw(1); for (const r of [14, 26, 38]) { g.beginPath(); g.arc(66, 38, r, 0, 7); g.stroke(); } g.fillStyle = '#c8ccd0'; g.beginPath(); g.arc(66, 38, 8, 0, 7); g.fill(); g.strokeStyle = '#222'; lw(2.5); g.beginPath(); g.moveTo(58, 44); g.lineTo(74, 32); g.stroke(); break;
    case 'surface': g.fillStyle = IC.paveFill ? IC.paveFill(g, 'gravel', 120, 0, 0, 0) : '#968e78'; g.fillRect(8, 8, 56, 28); g.fillStyle = conc; g.fillRect(68, 8, 56, 28); g.fillStyle = asph; g.fillRect(8, 40, 56, 28); g.fillStyle = '#5c8048'; g.fillRect(68, 40, 56, 28); g.fillStyle = '#3e6a34'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(74 + (i % 3) * 20, 46 + Math.floor(i / 3) * 8, 3.5, 0, 7); g.fill(); } break;
    case 'blueprint': g.fillStyle = 'rgba(20,50,80,0.55)'; g.fillRect(0, 0, TW, TH); g.strokeStyle = 'rgba(160,210,255,0.9)'; lw(3); for (const [a, b, c2, d] of [[10, 10, 122, 10], [18, 20, 18, 68], [114, 20, 114, 68], [30, 66, 102, 66]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); } lw(1); g.strokeRect(46, 28, 40, 22); break;
    case 'svcroad': apron(0, 0, 50, 76); taxi([[92, 0], [92, 76]], 14); road([[0, 44], [132, 44]], 5); g.fillStyle = W; for (let x = 85; x < 100; x += 3) g.fillRect(x, 41, 1.5, 6); g.font = '700 5px monospace'; g.fillText('STOP', 64, 40); break;
    case 'road:lc': road([[0, 50], [50, 44], [132, 26]], 5); break;
    case 'road:rd': road([[0, 54], [60, 40], [132, 30]], 7); break;
    case 'road:hw': road([[0, 20], [132, 20]], 9); road([[0, 60], [52, 56], [80, 34], [96, 20]], 6); break;
    case 'carpark': g.fillStyle = asph; g.fillRect(8, 8, 116, 60); g.strokeStyle = W; lw(0.6); for (let y = 14; y < 64; y += 14) for (let x = 12; x < 120; x += 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 6); g.stroke(); } { const col = ['#c8cace', '#282c32', '#962024', '#e6e6e2', '#3c5078']; let i = 0; for (let y = 14; y < 64; y += 14) for (let x = 13; x < 118; x += 5) if (U.hash(x, y) > 0.35) { g.fillStyle = col[i++ % col.length]; g.fillRect(x, y + 0.5, 3, 5); } } break;
    default: apron(20, 16, 92, 44);
  }
  return (THUMB[k] = c.toDataURL());
}
IC.bbThumb = thumb;
/* what the bar says about an item (the tests read it too) */
IC.BB_ITEM = (S, k) => itemOf(k);

/* ---------- state ---------- */
IC.bb = { open: false, tab: 'rw', view: null, hover: null };
const selAp = S => S.sel ? (S.sel.kind === 'apart' ? S.sel.ap : S.sel.kind === 'infra' && S.sel.ref.parts ? S.sel.ref : null) : null;
/* the airport the bar builds on: the one being built on, the one selected, or the nearest of ours on screen */
IC.bbAirport = function (S) {
  const m = S.mode2; if (m && m.ap && m.ap.parts) return m.ap;
  const a = selAp(S); if (a && !a.locked) return a;
  return IC.bb.ap && IC.bb.ap.parts && S.byId[IC.bb.ap.id] === IC.bb.ap ? IC.bb.ap : null;
};
/* open or close the bar; opening with no airport picks the nearest of ours in view (or offers to found one) */
IC.bbToggle = function (open) {
  const S = S_(); if (!S) return;
  const bb = IC.bb; bb.open = open == null ? !bb.open : !!open;
  const sa = selAp(S); bb.closed = bb.open ? null : sa ? sa.id : null;
  if (bb.open && !IC.bbAirport(S)) {
    const c = IC.toWorld(IC.cam.vw / 2, IC.cam.vh / 2);
    const mine = IC.bases(S).filter(b => b.parts && !b.locked && b.owner !== 'enemy' && (b.kind === 'airport' || b.kind === 'airbase'));
    const ap = mine.sort((a, b) => U.dist(a, c) - U.dist(b, c))[0];
    if (ap) { bb.ap = ap; IC.select({ kind: 'infra', ref: ap }); }
  }
  if (!bb.open) { if (S.mode2 && ['build', 'bulldoze', 'upgrade', 'bpick', 'bmove'].includes(S.mode2.kind)) IC.setMode(null); bb.view = null; }
  IC.ui.refresh(true);
};
/* pick a tab (1–0) */
IC.bbTab = function (k) { IC.bb.tab = k; IC.bb.open = true; IC.ui.refresh(true); };
/* start placing an item */
IC.bbPick = function (k) {
  const S = S_(), ap = IC.bbAirport(S); if (!ap) return false;
  const cur = S.mode2;
  if (k.startsWith('road:')) { IC.setMode(cur && cur.kind === 'road' && cur.cls === k.slice(5) ? null : { kind: 'road', cls: k.slice(5), pts: [], snaps: [] }); return true; }
  const part = k === 'carpark' ? 'surface' : k;
  if (cur && cur.kind === 'build' && cur.part === part && cur.ap === ap && (k !== 'carpark' || cur.surf === 'asph')) { IC.setMode(null); return true; }
  const lock = IC.APART[part] && IC.aptLockWhy(S, part);
  if (lock) { IC.toast(S, 'info', 'NOT YET', lock); IC.sfx && IC.sfx.ui('err'); return false; }
  const m = IC.bldMode(S, ap, part);
  if (k === 'carpark') m.surf = 'asph';
  IC.setMode(m);
  if (IC.cam.z < 1.5) IC.flyTo(ap.x, ap.y, 2.2);
  return true;
};
/* the tools: upgrade, move, bulldoze (each a mode that waits for a click on a part), undo, the info views */
IC.bbTool = function (t) {
  const S = S_(), ap = IC.bbAirport(S); if (!ap) return;
  const cur = S.mode2, P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true };
  if (t === 'undo') { IC.sfx && IC.sfx.ui(IC.bldUndo(S, ap) ? 'ok' : 'err'); IC.ui.refresh(true); return; }
  if (t === 'info') { IC.bb.view = IC.bb.view ? null : 'taxi'; IC.ui.refresh(true); return; }
  const kind = t === 'move' ? 'bpick' : t;
  if (cur && (cur.kind === kind || (t === 'move' && cur.kind === 'bmove'))) { IC.setMode(null); return; }
  IC.setMode(t === 'upgrade' ? { kind: 'upgrade', ap, mat: P.mat || 'conc', twid: P.twid || null, rwid: P.rwid || null, lit: P.lit === false ? false : true } : { kind, ap });
};

/* ---------- the options bar: chips for what the chosen item is built with ---------- */
const chip = (k, v, label, on, title, dis) => `<button class="chip ${on ? 'on' : ''}" data-bb="pref" data-k="${k}" data-v="${esc(String(v))}" title="${esc(title || '')}" ${dis ? 'disabled' : ''}>${label}</button>`;
const group = (name, chips) => `<div class="bb-og"><span>${name}</span>${chips}</div>`;
const PAVED_TOOLS = { runway: 1, taxi: 1, apron: 1, alert: 1, parallel: 1, exits: 1, hold: 1, concourse: 1, remote: 1, ramp: 1, stretch: 1 };
const TAXI_TOOLS = { taxi: 1, parallel: 1, exits: 1, hold: 1 };
const STAND_TOOLS = { apron: 1, remote: 1, ramp: 1, stand: 1, concourse: 1, stretch: 1 };
const ZONE_TOOLS = { apron: 1, remote: 1, ramp: 1, stand: 1, stretch: 1 };
function options(S, m) {
  if (!m) return '';
  const P = S.bldPref || {}, g = [];
  const mat = m.mat || P.mat || 'conc', t = m.kind === 'build' ? m.part : m.kind;
  // (bulldozing and moving say what to do in the hint over the map: no chips to choose here)
  if (m.kind === 'bulldoze' || m.kind === 'bpick' || m.kind === 'bmove') return '';
  if (t === 'upgrade' || PAVED_TOOLS[t]) g.push(group('Pavement', IC.PAVE_ORDER.map(k => { const lock = IC.aptLockWhy(S, 'runway', k); return chip('mat', k, (lock ? '🔒 ' : '') + IC.PAVE[k].name.replace('Reinforced concrete', 'Reinforced'), mat === k, `${lock ? lock + ' ' : ''}${IC.paveFits(k)}. ${IC.PAVE[k].desc}. Cost ×${IC.PAVE[k].cost}, time ×${IC.PAVE[k].build}.`, !!lock); }).join('')));
  if (t === 'runway' || t === 'upgrade') g.push(group(t === 'upgrade' ? 'Runway width' : 'Width', IC.WIDTHS.runway.map(w => chip('rwid', w, `${Math.round(w * 100)} m`, (m.rwid || IC.APART.runway.w) === w, w < 0.4 ? 'Narrow: cheaper; enough for regional aircraft and narrow-bodies' : w > 0.5 ? 'Wide: for the largest aircraft, and more margin in a crosswind' : 'The standard width for airliners')).join('')));
  if (TAXI_TOOLS[t] || t === 'upgrade') g.push(group(t === 'upgrade' ? 'Taxiway width' : 'Width', IC.WIDTHS.taxi.map(w => chip('twid', w, `${Math.round(w * 100)} m`, (m.twid || IC.APART.taxi.w) === w, w < 0.16 ? 'A taxilane: narrow-bodies and smaller, at walking pace on the apron' : w < 0.2 ? 'For narrow-bodies' : 'For wide-bodies: the standard')).join('')));
  if (t === 'runway' || TAXI_TOOLS[t] || t === 'upgrade') g.push(group('Lights', chip('lit', 1, 'Edge lights', m.lit !== false, 'Lit for night and fog') + chip('lit', 0, 'None', m.lit === false, 'A tenth cheaper, but a runway without lights is closed from dusk to dawn')));
  if (t === 'taxi') g.push(group('Traffic', chip('oneway', 0, 'Both ways', !m.oneway, 'Aircraft use it either way') + chip('oneway', 1, 'One way', !!m.oneway, 'Only the way it is drawn: arrows on the pavement') + chip('fillet', 1, 'Round corners (F)', !!m.fillet, 'Bends drawn as curves an aircraft can follow')));
  if (STAND_TOOLS[t]) g.push(group('Stands', Object.entries(IC.RAMP_SIZE).map(([k, n]) => chip('size', k, n, (m.size || 'm') === k, `${IC.STAND[k].name} stand, ${Math.round(IC.STAND[k].w * 100)} m wide`)).join('') + chip('drive', '', 'Nose-in', !m.drive, 'Pushed back by a tug to leave') + chip('drive', 1, 'Drive-through', !!m.drive, 'Taxis in and out forwards: no tug, more room')));
  if (ZONE_TOOLS[t]) g.push(group('Zone', [chip('zone', 'auto', 'Auto', !m.zone, 'From what is next to it')].concat(Object.keys(IC.ZONES).map(k => chip('zone', k, ({ civil: 'Passenger', cargo: 'Cargo', light: 'Light', mil: 'Military' })[k] || IC.ZONES[k].name, m.zone === k, `Only ${IC.ZONES[k].name.toLowerCase()} aircraft park here`))).join('')));
  if (t === 'surface') g.push(group('Surface', Object.entries(IC.SURF).map(([k, v]) => chip('surf', k, v.name, (m.surf || 'grass') === k, `${U.money(IC.APART.surface.cost * v.k)} a hectare${v.park ? '; outside the airfield a car park' : ''}`)).join('')));
  if (IC.TERM_KITS && IC.TERM_KITS[t]) g.push(group('Gates', ['m', 'l'].map(k => chip('size', k, IC.RAMP_SIZE[k], (m.size === 'l' ? 'l' : 'm') === k, k === 'l' ? 'Wide-body gates: fewer, larger stands' : 'Narrow-body gates')).join('') + '<em>R turns it</em>'));
  if (t === 'blueprint' && IC.showcaseKeys) g.push(group('Blueprint', IC.showcaseKeys().map(k => chip('bp', k, esc(IC.REAL_APT[k].name), m.bp === k, IC.REAL_APT[k].after)).join('') + '<em>R turns it</em>'));
  if (t === 'upgrade') g.unshift(`<div class="bb-say">${ico(TOOL_ICON.upgrade)} Click a runway, taxiway or apron: it gets what is chosen here, and you pay the difference.</div>`);
  return g.join('');
}
/* a chip was pressed: the choice is kept for next time and applies to what is being placed now */
IC.bbPref = function (k, v) {
  const S = S_(), P = S.bldPref = S.bldPref || { mat: 'conc', size: 'm', zone: null, fillet: true }, m = S.mode2;
  let val = v;
  if (k === 'mat') { if (!IC.bldPick(S, v)) { IC.sfx && IC.sfx.ui('err'); return; } }
  if (k === 'rwid' || k === 'twid') val = +v;
  if (k === 'lit') val = v === '1';
  if (k === 'oneway') val = v === '1' ? 1 : 0;
  if (k === 'fillet') val = !(m ? m.fillet : P.fillet);
  if (k === 'drive') val = !!v;
  if (k === 'zone' && v === 'auto') val = null;
  P[k] = val;
  if (m && (m.kind === 'build' || m.kind === 'upgrade')) { m[k] = val; m.exitKey = null; }
  IC.ui.refresh(true);
};

/* ---------- the bar ---------- */
function card(it) {
  if (!it) return '';
  return `<b>${esc(it.name)}</b><span class="bb-price">${esc(it.price)}${it.time ? ` · about ${esc(it.time)} to build` : ''}</span><p>${esc(it.desc || '')}</p>
    ${it.use ? `<p><em>Enables:</em> ${esc(it.use)}.</p>` : ''}${it.upkeep ? `<p><em>Upkeep:</em> ${esc(it.upkeep)}.</p>` : ''}
    <p><em>Needs:</em> ${esc(it.lock || NEEDS[it.k] || 'Nothing special.')}</p>`;
}
IC.renderBuildBar = function (S) {
  const el = $('bbar'); if (!el) return;
  const bb = IC.bb, sa = selAp(S);
  // selecting one of our airports brings the bar up (unless it was closed while that airport was selected)
  // (not in the Academy: its lessons are about the air defence, and the bar would cover their hints)
  if (sa && !sa.locked && sa.id !== bb.selId && bb.closed !== sa.id && S.mode !== 'academy' && !S.range) bb.open = true;
  bb.selId = sa ? sa.id : null;
  const ap = bb.open ? IC.bbAirport(S) : null;
  const show = bb.open && !IC.ui.room && $('start').hidden;
  $('app').classList.toggle('bb-open', !!show); $('app').classList.toggle('bb-hover', !!(show && bb.hover));
  if (!show) { if (!el.hidden) el.hidden = true; return; }
  el.hidden = false;
  const m = S.mode2 && S.mode2.ap === ap ? S.mode2 : S.mode2 && S.mode2.kind === 'road' ? S.mode2 : null;
  const cur = m && m.kind === 'build' ? (m.part === 'surface' && m.surf === 'asph' && bb.last === 'carpark' ? 'carpark' : m.part) : m && m.kind === 'road' ? 'road:' + m.cls : null;
  const civil = ap && ap.kind === 'airport';
  const tab = IC.BB_TABS.find(t => t.k === bb.tab) || IC.BB_TABS[0];
  const items = tab.items.map(itemOf).filter(it => it.avail !== false && !(civil && it.mil));
  const tools = [['upgrade', 'Upgrade', 'U'], ['move', 'Move', 'M'], ['bulldoze', 'Bulldoze', 'Del'], ['undo', 'Undo', 'Ctrl+Z'], ['info', 'Info views', 'I']];
  const toolOn = t => !!(m && (m.kind === t || (t === 'move' && (m.kind === 'bpick' || m.kind === 'bmove')))) || (t === 'info' && !!bb.view);
  const views = bb.view ? `<div class="bb-og"><span>Info view</span>${Object.entries(IC.INFO_VIEWS || {}).map(([k, v]) => `<button class="chip ${bb.view === k ? 'on' : ''}" data-bb="view" data-v="${k}" title="${esc(v.desc)}">${esc(v.name)}</button>`).join('')}</div>` : '';
  const opts = (views + options(S, m));
  const head = ap ? `<span class="bb-apt">${esc(ap.name)}</span>` : '<span class="bb-apt amber">Select an airport to build on</span>';
  const body = !ap ? `<div class="bb-empty">Click one of your airports on the map, or found a new one.${IC.storyLock && !IC.storyLock(S, 'found') ? ' <button class="btn" data-act="foundMode">Found an airport</button>' : ''}</div>`
    : items.length ? items.map(it => `<button class="bb-it ${cur === it.k ? 'on' : ''}" data-bb="item" data-v="${it.k}" ${it.lock ? 'data-lock="1"' : ''} aria-label="${esc(it.name)}"><img src="${thumb(it.k)}" alt=""><b>${esc(it.name)}</b><small>${it.lock ? '🔒 research' : esc(it.price)}</small><em>${esc(it.use)}</em></button>`).join('')
    : `<div class="bb-empty">${tab.k === 'bp' ? 'No blueprints yet: the real airports come with their map data.' : 'Nothing here for this airport.'}</div>`;
  const html = `${opts ? `<div class="bb-opts">${opts}</div>` : ''}
    <div class="bb-main">
      <div class="bb-top">${head}<nav class="bb-tabs">${IC.BB_TABS.map(t => `<button class="${t.k === tab.k ? 'on' : ''}" data-bb="tab" data-v="${t.k}" title="${esc(t.name)} (${t.key})">${ico(TAB_ICON[t.k])}<span>${esc(t.name)}</span><kbd>${t.key}</kbd></button>`).join('')}</nav><button class="x" data-bb="close" title="Close (B)" aria-label="Close the build bar">✕</button></div>
      <div class="bb-row"><div class="bb-tools">${tools.map(([k, n, key]) => `<button class="${toolOn(k) ? 'on' : ''}" data-bb="tool" data-v="${k}" title="${n} (${key})" ${ap ? '' : 'disabled'}>${ico(TOOL_ICON[k])}<span>${n}</span></button>`).join('')}</div>
      <div class="bb-items">${body}</div></div>
    </div>
    <div class="bb-card" ${bb.hover ? '' : 'hidden'}>${bb.hover ? card(itemOf(bb.hover)) : ''}</div>`;
  IC.ui.setHTML(el, html);
  // (where the card sits: over the item under the mouse)
  if (bb.hover) { const b = el.querySelector(`.bb-it[data-v="${bb.hover}"]`), c = el.querySelector('.bb-card'); if (b && c) { const r = b.getBoundingClientRect(), R = el.getBoundingClientRect(); c.style.left = `${Math.max(0, Math.min(R.width - 300, r.left - R.left + r.width / 2 - 150))}px`; } }
};
/* clicks and hovers on the bar */
function wire() {
  const el = $('bbar'); if (!el || el._wired) return; el._wired = true;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-bb]'); if (!b || b.disabled) return;
    const k = b.dataset.bb, v = b.dataset.v, S = S_(); if (!S) return;
    if (k === 'tab') IC.bbTab(v);
    else if (k === 'item') { IC.bb.last = v; IC.bbPick(v); }
    else if (k === 'tool') IC.bbTool(v);
    else if (k === 'pref') IC.bbPref(b.dataset.k, v);
    else if (k === 'view') { IC.bb.view = IC.bb.view === v ? null : v; IC.ui.refresh(true); }
    else if (k === 'close') IC.bbToggle(false);
    IC.sfx && IC.sfx.ui('click');
  });
  el.addEventListener('mouseover', e => { const b = e.target.closest('.bb-it'); const v = b ? b.dataset.v : null; if (v !== IC.bb.hover) { IC.bb.hover = v; IC.ui.refresh(true); } });
  el.addEventListener('mouseleave', () => { if (IC.bb.hover) { IC.bb.hover = null; IC.ui.refresh(true); } });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
})(typeof window !== 'undefined' && window.IC ? window.IC : IC);
