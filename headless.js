/* Shared headless loader: loads the simulation files and stubs out anything that needs a canvas. */
global.window = global;
const FILES = ['core', 'fixedmath', 'tutor', 'data', 'names', 'aviation-data', 'flight', 'models', 'models-airport', 'models-arms', 'gen', 'city-samples', 'city-cores', 'cityfabric', 'village', 'fringe', 'countryside', 'buildings', 'cities', 'world', 'roadgeom', 'terrain', 'weather', 'atmos', 'state', 'sensors', 'threats', 'defense', 'reinforce', 'testrange', 'sandbox', 'units', 'airport', 'airport-shapes', 'airports-real', 'airports-real-data', 'airport-kits', 'pavement', 'groundops', 'builder', 'pieces', 'layouts', 'aptclass', 'enemy', 'air', 'logistics', 'research', 'civil', 'garamp', 'genav', 'traffic', 'aviation', 'schedule', 'handling', 'airspace', 'growth', 'landside', 'svcroads', 'incidents', 'campaign', 'story', 'deck', 'free', 'agenda', 'academy', 'combat', 'record', 'film-cam', 'aptlife', 'problems', 'pick', 'sim', 'save', 'buildbar'];
for (const f of FILES) require('./iron-canopy/js/' + f + '.js');
IC.buildTerrain = () => ({ scars: [], tiles: new Map() });
IC.buildClouds = () => null;
IC.addScar = () => {};
IC.cityLights = () => {};
module.exports = IC;
