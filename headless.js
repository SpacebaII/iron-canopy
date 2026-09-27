/* Shared headless loader: loads the simulation files and stubs out anything that needs a canvas. */
global.window = global;
const FILES = ['core', 'data', 'aviation-data', 'gen', 'world', 'terrain', 'weather', 'state', 'sensors', 'threats', 'defense', 'units', 'airport', 'groundops', 'enemy', 'ground', 'air', 'logistics', 'civil', 'traffic', 'aviation', 'airspace', 'growth', 'incidents', 'campaign', 'story', 'academy', 'sim'];
for (const f of FILES) require('./iron-canopy/js/' + f + '.js');
IC.buildTerrain = () => ({ scars: [], tiles: new Map() });
IC.buildClouds = () => null;
IC.addScar = () => {};
IC.cityLights = () => {};
module.exports = IC;
