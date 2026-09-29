/* Shared headless loader: loads the simulation files and stubs out anything that needs a canvas. */
global.window = global;
const FILES = ['core', 'data', 'names', 'aviation-data', 'flight', 'models', 'models-airport', 'gen', 'cities', 'world', 'terrain', 'weather', 'state', 'sensors', 'threats', 'defense', 'reinforce', 'testrange', 'units', 'airport', 'airport-shapes', 'airports-real', 'pavement', 'groundops', 'builder', 'enemy', 'air', 'logistics', 'civil', 'traffic', 'aviation', 'airspace', 'growth', 'landside', 'svcroads', 'incidents', 'campaign', 'story', 'academy', 'buildbar', 'record', 'sim', 'save'];
for (const f of FILES) require('./iron-canopy/js/' + f + '.js');
IC.buildTerrain = () => ({ scars: [], tiles: new Map() });
IC.buildClouds = () => null;
IC.addScar = () => {};
IC.cityLights = () => {};
module.exports = IC;
