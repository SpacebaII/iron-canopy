global.window = global;
for (const f of ['core', 'data', 'gen', 'world']) require('./iron-canopy/js/' + f + '.js');
for (const seed of (process.argv[2] ? [+process.argv[2]] : [42, 7, 1234, 99, 5150])) {
  const t0 = Date.now();
  const W = IC.generate(seed);
  const t1 = Date.now();
  IC.buildRouting(W);
  IC.W = W;
  const t2 = Date.now();
  console.log(`seed ${seed}: gen ${t1 - t0}ms routing ${t2 - t1}ms nodes ${Object.keys(W.nodes).length} edges ${W.edges.length}`);
  console.log(`  cities ${W.cities.length} villages ${W.villages.length} (home ${W.villages.filter(v => v.home).length}) rivers ${W.rivers.length} lakes ${W.lakes.length} bridges ${W.bridges.length} rails ${W.rails.length} airways ${W.airways.length}`);
  console.log(`  fronts ${W.fronts.map(f => f.key + ':' + f.pts.length + 'pts/' + f.sectors.length + 'sec').join(' ')} infra ${W.infra.map(i => i.kind).join(',')}`);
  console.log(`  foreign ${W.foreign.length} esites ${W.esites.length} eroads ${W.eroads.length}`);
  const r = IC.route(W.cities[0].x, W.cities[0].y, W.cities[W.cities.length - 1].x, W.cities[W.cities.length - 1].y);
  console.log(`  route capital→last city: ${r.length} pts, ${Math.round(IC.routeLength(r))} units`);
}
