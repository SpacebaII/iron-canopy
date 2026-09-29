/* Writes tests/fixtures/mini.osm.json: the made-up test field of mini-layout.js as an OpenStreetMap extract
   (Overpass JSON), tagged the way OpenStreetMap tags a real airport, so the importer can be tested end to end
   without the real extracts. Placed at 40° N, 100° W (open prairie; the place does not matter).
     node tests/fixtures/make-mini-osm.js */
const fs = require('fs'), path = require('path');
const L = require('./mini-layout.js');
const lat0 = 40, lon0 = -100, f = lat0 * Math.PI / 180;
const mLat = 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f), mLon = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f);
const E = []; let id = 1;
const node = (x, y, tags) => { const n = { type: 'node', id: id++, lat: +(lat0 - y * 100 / mLat).toFixed(8), lon: +(lon0 + x * 100 / mLon).toFixed(8) }; if (tags) n.tags = tags; E.push(n); return n.id; };
const way = (nodes, tags) => { E.push({ type: 'way', id: id++, nodes, tags }); return id - 1; };
const pairs = F => { const o = []; for (let i = 0; i < F.length; i += 2) o.push([F[i], F[i + 1]]); return o; };
const ring = (F, tags) => { const ns = pairs(F).map(([x, y]) => node(x, y)); return way(ns.concat([ns[0]]), tags); };
// the aerodrome
ring([-3, 4, 42, 4, 42, -10.3, -3, -10.3], { aeroway: 'aerodrome', name: 'Test Field' });
// the runway, its nodes shared with the taxiways that join it
const tn = L.nodes.map(([x, y]) => node(x, y));
const r = L.runways[0], ra = node(r.a[0], r.a[1]), rb = node(r.b[0], r.b[1]);
const onRwy = L.nodes.map((q, i) => ({ q, i })).filter(({ q }) => Math.abs(q[1]) < 0.01).sort((a, b) => a.q[0] - b.q[0]).map(o => tn[o.i]);
way([ra].concat(onRwy, [rb]), { aeroway: 'runway', ref: '09/27', width: '45', surface: 'concrete' });
for (const t of L.taxi) way(t.n.map(i => tn[i]), Object.assign({ aeroway: t.lane ? 'taxilane' : 'taxiway' }, t.name ? { ref: t.name } : {}, t.w ? { width: String(t.w * 100) } : {}));
for (const A of L.aprons) ring(A.poly, { aeroway: 'apron', surface: 'concrete' });
for (const s of L.stands) {
  // the stand's point is where the nose wheel stops
  const back = { l: 0.4, m: 0.25, s: 0.18 }[s.size];
  node(s.x + Math.cos(s.h) * back, s.y + Math.sin(s.h) * back, { aeroway: 'parking_position', ref: s.ref });
}
for (const B of L.blds) ring(B.poly, B.kind === 'terminal' ? { aeroway: 'terminal', building: 'terminal', name: B.name } : B.kind === 'tower' ? { building: 'yes', 'tower:type': 'airport_control', man_made: 'tower', name: 'Control tower' } : B.kind === 'fire' ? { building: 'fire_station', amenity: 'fire_station', name: 'Fire station' } : { building: 'yes' });
for (const B of L.bridges) { const P = pairs(B.poly), a = [(P[0][0] + P[3][0]) / 2, (P[0][1] + P[3][1]) / 2], b = [(P[1][0] + P[2][0]) / 2, (P[1][1] + P[2][1]) / 2]; way([node(a[0], a[1]), node(b[0], b[1])], { highway: 'footway', bridge: 'yes', layer: '2', indoor: 'corridor', width: String(Math.abs(P[3][1] - P[0][1]) * 100), min_height: String(B.clear), name: 'East Concourse bridge' }); }
for (const M of L.movers) way(pairs(M.pts).map(([x, y]) => node(x, y)), { railway: 'subway', tunnel: 'yes', layer: '-1', name: 'Concourse train (automated people mover)' });
for (const R of L.roads) way(pairs(R.pts).map(([x, y]) => node(x, y)), Object.assign({ highway: R.kind === 'upper' || R.kind === 'lower' ? 'primary' : 'secondary', name: R.name, lanes: '2' }, R.oneway ? { oneway: 'yes' } : {}, R.lv > 0 ? { bridge: 'yes', layer: '1' } : {}));
for (const K of L.parks) ring(K.poly, K.kind === 'garage' ? { amenity: 'parking', parking: 'multi-storey', building: 'parking', 'building:levels': String(K.lvls), name: K.name } : { amenity: 'parking', parking: 'surface', name: K.name });
fs.writeFileSync(path.join(__dirname, 'mini.osm.json'), JSON.stringify({ version: 0.6, generator: 'tests/fixtures/make-mini-osm.js (made up)', elements: E }));
console.log(`${E.length} elements`);
