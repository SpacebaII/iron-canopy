/* Cuts an OpenStreetMap extract (Overpass JSON) down to what tools/airport-import.js reads for its airport, so the
   repository carries a few megabytes, not the whole town round it: everything tagged aeroway; buildings, car parks,
   fire stations, tanks and towers within the importer's margin of the aerodrome's outline; roads within the margin,
   and the main roads (with their slip roads) out to its reach; railways within the margin or named as a people
   mover; footways only where they are bridges (a passenger bridge over a taxiway); the relations that tie any of
   it together. The layout the importer makes from the trimmed extract is the same as from the full one (checked by
   node tools/airports/trim.js --check).
     node tools/airports/trim.js [key ...]        writes <key>.osm.json in place (keep the full one elsewhere)
     node tools/airports/trim.js --check [key]    imports from the full and the trimmed extract and compares */
'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('./config.js');
const IMP = require('../airport-import.js');

function trim(key, srcFile) {
  const C = CFG[key];
  const J = JSON.parse(fs.readFileSync(srcFile, 'utf8')), E = J.elements;
  const N = new Map(), W = new Map(), R = [];
  for (const e of E) if (e.type === 'node') N.set(e.id, e); else if (e.type === 'way') W.set(e.id, e); else R.push(e);
  const ap = C.ident ? IMP.csv(fs.readFileSync(path.join(__dirname, 'ourairports-airports.csv'), 'utf8')).find(r => r.ident === C.ident) : null;
  const ns = [...N.values()];
  const lat0 = ap ? +ap.latitude_deg : ns.reduce((s, n) => s + n.lat, 0) / ns.length, lon0 = ap ? +ap.longitude_deg : ns.reduce((s, n) => s + n.lon, 0) / ns.length;
  const proj = IMP.projector(lat0, lon0), P = id => { const n = N.get(id); return n ? proj(n.lat, n.lon) : null; };
  const aeroW = [...W.values()].filter(w => w.tags && w.tags.aeroway === 'aerodrome' && w.nodes[0] === w.nodes[w.nodes.length - 1]).sort((a, b) => b.nodes.length - a.nodes.length)[0];
  const AP = aeroW ? aeroW.nodes.map(P).filter(Boolean) : null;
  const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
  const inPoly = (p, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if ((Q[i].y > p.y) !== (Q[j].y > p.y) && p.x < (Q[j].x - Q[i].x) * (p.y - Q[i].y) / (Q[j].y - Q[i].y) + Q[i].x) c = !c; return c; };
  const polyDist = p => { if (!AP) return 0; if (inPoly(p, AP)) return 0; let m = Infinity; for (let i = 0, j = AP.length - 1; i < AP.length; j = i++) m = Math.min(m, segDist(p, AP[j], AP[i])); return m; };
  const margin = (C.margin != null ? C.margin : 1.5) + 1.5, reach = (C.reach != null ? C.reach : 30) + 15;
  const within = (w, d) => w.nodes.some(id => { const p = P(id); return p && polyDist(p) <= d; });
  const PUB = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)(_link)?$/;
  const main = /^(motorway|trunk|primary|secondary)(_link)?$/;
  const keepW = new Set(), keepN = new Set(), keepR = new Set();
  const wantWay = w => {
    const t = w.tags; if (!t) return false;
    if (t.aeroway) return true;
    if (t.highway) {
      if (PUB.test(t.highway) || t.highway === 'service') { if (within(w, margin)) return true; if (C.approach && C.approach.test(t.name || t.ref || '')) return within(w, reach); return main.test(t.highway) && within(w, reach); }
      return !!(t.bridge && t.bridge !== 'no') && within(w, margin);   // (a passenger bridge, mapped as a footway)
    }
    if (t.building || t['building:part'] || /^(parking|fire_station)$/.test(t.amenity || '') || /^(storage_tank|tower|bridge)$/.test(t.man_made || '') || t.parking) return within(w, margin);
    if (t.railway || t['construction:railway'] || t.public_transport) return within(w, margin) || /people mover|apm|automated|train|guideway|skylink|landside access/i.test([t.name, t.service, t.usage, t.description, t.network].join(' '));
    return false;
  };
  for (const w of W.values()) if (wantWay(w)) keepW.add(w.id);
  // the slip roads that leave a kept main road, and what those meet, as the importer walks them
  const nodesOf = ids => { const s = new Set(); for (const id of ids) { const w = W.get(id); if (w) for (const n of w.nodes) s.add(n); } return s; };
  let front = new Set([...keepW].filter(id => { const t = W.get(id).tags; return t.highway && C.approach && C.approach.test(t.name || t.ref || ''); }));
  for (let hop = 0; hop < 3 && front.size; hop++) {
    const on = nodesOf(front), next = new Set();
    for (const w of W.values()) if (!keepW.has(w.id) && w.tags && w.tags.highway && (PUB.test(w.tags.highway) || w.tags.highway === 'service') && w.nodes.some(n => on.has(n))) { keepW.add(w.id); next.add(w.id); }
    front = next;
  }
  // relations by their own tags, as the importer reads them (multipolygon aprons, terminals, buildings, car parks):
  // kept with every member when any member is near
  const wantRel = t => t && (t.aeroway || t.building || t['building:part'] || t.amenity === 'parking' || t.parking);
  for (const r of R) if (wantRel(r.tags) && r.members.some(m => m.type === 'way' && W.has(m.ref) && (keepW.has(m.ref) || r.tags.aeroway || within(W.get(m.ref), margin)))) { keepR.add(r.id); for (const m of r.members) if (m.type === 'way' && W.has(m.ref)) keepW.add(m.ref); else if (m.type === 'node') keepN.add(m.ref); }
  for (const id of keepW) for (const n of W.get(id).nodes) keepN.add(n);
  for (const n of N.values()) if (n.tags && (n.tags.aeroway || /^(storage_tank|tower)$/.test(n.tags.man_made || '') || n.tags['tower:type']) && polyDist(proj(n.lat, n.lon)) <= margin) keepN.add(n.id);
  const strip = t => { if (!t) return t; const o = {}; for (const k of Object.keys(t)) if (!/^(tiger|gnis|lacounty|source|addr|wikidata|wikipedia|check_date|note|fixme|name:|survey|destination|turn|maxspeed|hgv|bicycle|foot|horse|lit|sidewalk|cycleway|change|placement|old_|alt_name|brand|phone|website|opening_hours|contact|email|payment|start_date|ele|roof|smoking|internet|wheelchair|air_conditioning|toilets|building:colour|building:material|is_in|nat_ref|official_name|short_name|operator:|network:|ref:|not:|seamark|noref|expressway|parking:|capacity|fee|charge|supervised|surface|lanes:|lane_markings|shoulder|oneway:|priority|overtaking|junction:ref|highway:ref|crossing|kerb|tactile|traffic_|railway:|gauge|electrified|voltage|frequency|usage|service:|passenger|level:|min_level|max_level|non_existent|indoor|room|door|entrance|access:|motor_vehicle|vehicle|psv|taxi|bus|emergency|disused|abandoned|proposed|construction:|description:|inscription|image|mapillary|flickr|panoramax|osm_)/.test(k)) o[k] = t[k]; return Object.keys(o).length ? o : undefined; };
  const el = [];
  for (const id of keepN) { const n = N.get(id); if (n) el.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: strip(n.tags) }); }
  for (const id of keepW) { const w = W.get(id); el.push({ type: 'way', id: w.id, nodes: w.nodes, tags: strip(w.tags) }); }
  for (const r of R) if (keepR.has(r.id)) el.push({ type: 'relation', id: r.id, members: r.members, tags: strip(r.tags) });
  return { version: 0.6, generator: (J.generator || 'OpenStreetMap') + ', trimmed by tools/airports/trim.js', osm3s: J.osm3s || { copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' }, elements: el };
}
module.exports = { trim };

if (require.main === module) {
  const args = process.argv.slice(2), check = args.includes('--check'), keys = args.filter(a => !a.startsWith('--'));
  for (const key of keys.length ? keys : Object.keys(CFG).filter(k => k !== 'mini')) {
    const file = path.join(__dirname, CFG[key].osm);
    if (!fs.existsSync(file)) { console.log(`${key}: no extract`); continue; }
    const out = trim(key, file), text = JSON.stringify(out);
    if (check) {
      const tmp = file.replace(/\.json$/, '.trim.json'); fs.writeFileSync(tmp, text);
      const a = IMP.importAirport(key), saved = CFG[key].osm; CFG[key].osm = path.basename(tmp); const b = IMP.importAirport(key); CFG[key].osm = saved; fs.unlinkSync(tmp);
      const same = JSON.stringify(Object.assign({}, a, { notes: 0, check: 0 })) === JSON.stringify(Object.assign({}, b, { notes: 0, check: 0 }));
      console.log(`${key}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB → ${(text.length / 1e6).toFixed(1)} MB, ${out.elements.length} elements; the layout ${same ? 'is the same' : 'DIFFERS'} from the trimmed extract`);
      if (!same) for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(`   ${k}: ${Array.isArray(a[k]) ? a[k].length + ' → ' + b[k].length : 'differs'}`);
    } else { fs.writeFileSync(file, text); console.log(`${key}: wrote ${(text.length / 1e6).toFixed(1)} MB, ${out.elements.length} elements`); }
  }
}
