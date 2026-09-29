/* A small made-up layout (not a real airport) that uses every shape the engine has, for the tests of brief 39:
   a runway with a parallel taxiway; an L-shaped terminal with a polygon apron, taxilanes and stands on it; a
   concourse on its own apron across a taxiway, joined to the terminal by a passenger bridge 13 m above the taxiway;
   a people mover underground; a two-level kerb road (departures above, arrivals below); car parks and a garage.
   x east, y south, in world units (100 m) from the reference point. */
const R = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];
module.exports = {
  key: 'mini', name: 'Test Field',
  runways: [{ a: [0, 0], b: [30, 0], w: 0.45, ends: ['09', '27'], hdg: 90, ils: ['a'] }],
  nodes: [
    [1, 0], [1, -2], [8, -2], [15, -2], [22, -2], [29, -2], [29, 0], [8, 0], [15, 0], [22, 0],   // 0-9 parallel and exits
    [10, -4.45], [20, -4.45],                                                                 // 10-11 apron entries
    [10, -5.4], [15, -5.4], [20, -5.4],                                                       // 12-14 the taxilane on the apron
    [32, -2], [32, -8.6], [32, -12], [33, -8.6]                                              // 15-17 the taxiway under the bridge, 18 into the concourse apron
  ],
  taxi: [
    { name: 'A', n: [1, 2, 3, 4, 5] }, { name: 'A1', n: [0, 1] }, { name: 'A2', n: [7, 2] }, { name: 'A3', n: [8, 3] }, { name: 'A4', n: [9, 4] }, { name: 'A5', n: [6, 5] },
    { name: 'B', n: [2, 10] }, { name: 'C', n: [4, 11] },
    { name: 'L', n: [10, 12, 13, 14, 11], lane: 1, w: 0.15 },
    { name: 'K', n: [5, 15, 16, 17] }, { name: 'K1', n: [16, 18] }
  ],
  aprons: [
    { poly: [7, -4.45, 23, -4.45, 23, -6.6, 16, -6.6, 16, -7.6, 7, -7.6], zone: 'civil' },
    { poly: R(33, -9.2, 38, -7.2) }
  ],
  stands: [
    { ap: 0, x: 8.5, y: -7.3, h: -Math.PI / 2, size: 'm', via: 12, ref: '1' }, { ap: 0, x: 9.3, y: -7.3, h: -Math.PI / 2, size: 'm', via: 12, ref: '2' },
    { ap: 0, x: 11, y: -7.15, h: -Math.PI / 2, size: 'l', via: 12, ref: '3' }, { ap: 0, x: 17.5, y: -6.3, h: -Math.PI / 2, size: 'm', via: 13, ref: '4' },
    { ap: 0, x: 19, y: -6.3, h: -Math.PI / 2, size: 'm', via: 14, ref: '5' },
    { ap: 1, x: 34, y: -8.9, h: -Math.PI / 2, size: 'm', via: 16, ref: '11' }, { ap: 1, x: 35.5, y: -8.9, h: -Math.PI / 2, size: 'm', via: 16, ref: '12' }
  ],
  blds: [
    { kind: 'terminal', poly: [7, -7.6, 16, -7.6, 16, -6.6, 23, -6.6, 23, -9.2, 7, -9.2], name: 'Main Terminal', roof: 'tent' },
    { kind: 'terminal', poly: R(33, -10.2, 38, -9.2), name: 'East Concourse', noApron: true },
    { kind: 'tower', poly: R(26, -6, 26.14, -5.86) },
    { kind: 'fire', poly: R(12, 1.5, 12.28, 1.7) }
  ],
  bridges: [{ poly: R(23, -8.05, 33, -7.65), clear: 13, name: 'the bridge to the East Concourse', joins: [0, 1] }],
  movers: [{ pts: [15, -8.4, 25, -12.5, 35.5, -9.8], lv: -1, name: 'the concourse train', stops: [0, 1] }],
  roads: [
    { pts: [5, -9.45, 25, -9.45], w: 0.14, lv: 1, oneway: 1, name: 'departures road', kind: 'upper' },
    { pts: [5, -9.45, 25, -9.45], w: 0.14, lv: 0, oneway: 1, name: 'arrivals road', kind: 'lower' },
    { pts: [5, -9.45, 5, -11.5, 25, -11.5, 25, -9.45], w: 0.12, name: 'the terminal loop' },
    { pts: [15, -11.5, 15, -16], w: 0.14, name: 'the airport road' }
  ],
  parks: [{ kind: 'garage', poly: R(8, -11.3, 13, -9.7), lvls: 5, name: 'Garage' }, { kind: 'park', poly: R(17, -11.3, 24, -9.7), name: 'Short stay' }]
};
