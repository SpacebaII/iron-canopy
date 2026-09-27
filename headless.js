/* Shared headless loader: loads the simulation files and stubs out anything that needs a canvas. */
global.window = global;
const FILES = ['core', 'data', 'aviation-data', 'gen', 'world', 'terrain', 'weather', 'state', 'sensors', 'threats', 'defense', 'units', 'airport', 'groundops', 'enemy', 'ground', 'air', 'logistics', 'civil', 'traffic', 'aviation', 'incidents', 'campaign', 'story', 'academy', 'sim'];
for (const f of FILES) require('./iron-canopy/js/' + f + '.js');
IC.buildTerrain = W => {
  const R = IC.makeRng(W.seed);
  for (const c of W.cities.concat(W.villages, W.foreign)) { c.blocks = []; const n = c.kind === 'city' ? 40 : 6; for (let i = 0; i < n; i++) c.blocks.push({ x: c.x + R.gauss() * c.r * 0.4, y: c.y + R.gauss() * c.r * 0.4, w: 6, h: 5, a: 0, seed: i, hp: 1 }); }
  return { scars: [], tiles: new Map() };
};
IC.buildClouds = () => null;
IC.addScar = () => {};
IC.cityLights = () => {};
module.exports = IC;
