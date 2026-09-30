/* What the importer (tools/airport-import.js) needs to know about each airport beyond the map data: which extract,
   the reference point's ident in OurAirports, the game's fictional name, and the few facts OpenStreetMap does not
   carry as tags (where it does, the tags win). Roofs are looks only. */
module.exports = {
  kden: {
    ident: 'KDEN', osm: 'kden.osm.json',
    name: 'Front Range International', after: 'after Denver International',
    // the landside within 300 m of the aerodrome's outline, and Peña Boulevard out to the motorways (E-470, I-70)
    // with their interchanges
    margin: 3, approach: /^Peña Boulevard$/, reach: 26,
    roofs: [[/Jeppesen|Terminal/i, 'tent']],
    // the pedestrian bridge to Concourse A: the taxiway under it takes tails up to this height (m) when the data has
    // no maxheight or min_height on it (a 747's tail, 19.4 m, passes; an A380's, 24 m, does not)
    bridgeClear: 20,
    ils: ['16L', '16R', '17L', '17R', '34L', '34R', '35L', '35R', '07', '08', '25', '26']
  },
  klax: {
    ident: 'KLAX', osm: 'klax.osm.json',
    name: 'Pacific International', after: 'after Los Angeles International',
    // Century Boulevard and Sepulveda Boulevard (its tunnel runs under the south runways); the people mover runs
    // out to the rental-car centre whatever the margin
    margin: 2, approach: /^(Century Boulevard|(North |South )?Sepulveda Boulevard)$/, reach: 12,
    roofs: [[/Theme Building/i, 'saucer']],
    bridgeClear: 0,
    ils: ['06L', '06R', '07L', '07R', '24L', '24R', '25L', '25R']
  },
  // a made-up extract for the importer's own test (tests/fixtures/mini.osm.json)
  mini: { ident: null, osm: '../../tests/fixtures/mini.osm.json', name: 'Test Field', after: 'made up for the tests', roofs: [[/Main/, 'tent']], bridgeClear: 13, ils: [] }
};
