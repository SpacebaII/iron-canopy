// Fetches an airport's area from the OpenStreetMap API (api.openstreetmap.org/api/0.6/map) in tiles, keeps what
// tools/airports/fetch.sh's Overpass query would, and writes Overpass JSON ({ elements }) for tools/airport-import.js.
//   node osmfetch.js <out.json> <south,west,north,east> [step]
const { execFileSync } = require('child_process');
const fs = require('fs');
const [out, bb, stepArg] = process.argv.slice(2);
const [S, Wd, N, E] = bb.split(',').map(Number), step = +(stepArg || 0.02);
const nodes = new Map(), ways = new Map(), rels = new Map();
const attrs = s => { const o = {}; s.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { o[k] = v; }); return o; };
const unesc = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tagsOf = body => { const t = {}; body.replace(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g, (_, k, v) => { t[unesc(k)] = unesc(v); }); return Object.keys(t).length ? t : undefined; };
function parse(xml) {
  xml.replace(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g, (_, a, __, body) => { const o = attrs(a); nodes.set(+o.id, { type: 'node', id: +o.id, lat: +o.lat, lon: +o.lon, tags: body ? tagsOf(body) : undefined }); });
  xml.replace(/<way ([^>]*?)>([\s\S]*?)<\/way>/g, (_, a, body) => { const o = attrs(a); const nd = []; body.replace(/<nd ref="(\d+)"\s*\/>/g, (_, r) => { nd.push(+r); }); ways.set(+o.id, { type: 'way', id: +o.id, nodes: nd, tags: tagsOf(body) }); });
  xml.replace(/<relation ([^>]*?)>([\s\S]*?)<\/relation>/g, (_, a, body) => { const o = attrs(a); const m = []; body.replace(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"\s*\/>/g, (_, t, r, ro) => { m.push({ type: t, ref: +r, role: unesc(ro) }); }); rels.set(+o.id, { type: 'relation', id: +o.id, members: m, tags: tagsOf(body) }); });
}
let n = 0;
// a tile over the API's 50,000-node limit answers 400: split it in four and try again
function tile(w, s, e, nn) {
  const b = [w, s, e, nn].map(v => v.toFixed(6)).join(',');
  for (let tries = 0; ; tries++) {
    let code = '', xml = '';
    try { xml = execFileSync('curl', ['-sS', '-m', '180', '-w', '\n%{http_code}', `https://api.openstreetmap.org/api/0.6/map?bbox=${b}`], { maxBuffer: 1 << 30 }).toString(); code = xml.slice(xml.lastIndexOf('\n') + 1); xml = xml.slice(0, xml.lastIndexOf('\n')); } catch (err) { code = 'net'; }
    if (code === '200') { parse(xml); n++; process.stderr.write(`tile ${n} ${b}: ${nodes.size} nodes, ${ways.size} ways\n`); return; }
    if (code === '400' && e - w > 0.0015) { const mx = (w + e) / 2, my = (s + nn) / 2; tile(w, s, mx, my); tile(mx, s, e, my); tile(w, my, mx, nn); tile(mx, my, e, nn); return; }
    if (tries >= 4) throw new Error(`tile ${b}: ${code}`);
    execFileSync('sleep', [String(2 ** (tries + 1))]);
  }
}
for (let lat = S; lat < N - 1e-9; lat += step) for (let lon = Wd; lon < E - 1e-9; lon += step) tile(lon, lat, Math.min(lon + step, E), Math.min(lat + step, N));
// what the Overpass query in fetch.sh keeps
const want = t => t && (t.aeroway || t.building || t['building:part'] || t.highway || /^(parking|fire_station)$/.test(t.amenity || '') || t.railway || t.public_transport || /^(storage_tank|tower|bridge)$/.test(t.man_made || ''));
const keepW = new Set(), keepN = new Set(), keepR = new Set();
for (const r of rels.values()) if (want(r.tags)) { keepR.add(r.id); for (const m of r.members) if (m.type === 'way') keepW.add(m.ref); else if (m.type === 'node') keepN.add(m.ref); }
for (const w of ways.values()) if (want(w.tags)) keepW.add(w.id);
for (const id of keepW) { const w = ways.get(id); if (w) for (const nd of w.nodes) keepN.add(nd); }
for (const nd of nodes.values()) if (want(nd.tags)) keepN.add(nd.id);
const el = [];
for (const id of keepN) { const x = nodes.get(id); if (x) el.push(x); }
for (const id of keepW) { const x = ways.get(id); if (x) el.push(x); }
for (const id of keepR) el.push(rels.get(id));
fs.writeFileSync(out, JSON.stringify({ version: 0.6, generator: 'api.openstreetmap.org/api/0.6/map, filtered as tools/airports/fetch.sh', osm3s: { copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' }, elements: el }));
console.log(out, el.length, 'elements', (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
