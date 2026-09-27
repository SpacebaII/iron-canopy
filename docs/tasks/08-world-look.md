# 08 World look: natural terrain, real roads, lasting damage

Needs task 01 merged first. Runs in parallel with 04 (builder) and 05 (growth, trade, roads).

## What the owner asked for

> "Make the world look much more natural, not airports having strange textured grass, natural-looking forest."
> "For scale I want Transport Fever 3 type of roads and cities fidelity, like nice interchanges that flow, and much more realistic cities."
> "Hills should affect military radar."
> "Make the game a bit better visually as well, so impacts visually affect the item they hit, whether that's a specific building or street in a city or a field, and the mark, depending on circumstance, should stay for a while but fade eventually."

## Goal

From the whole country down to a single street, the map should look like a real place seen from the air: natural ground, forests with shape, roads and interchanges that flow, and scars where weapons land. Hills now matter to every radar.

## Scope

In: `terrain.js` (ground, forests, fields, tiles), road and town drawing in `render.js`, the shapes of roads, junctions and forests in `gen.js`, impact effects (`IC.detonate` in `state.js` and the effects it leaves), radar masking by terrain for military radars (`sensors.js`, `airspace.js` coverage map).

Out: airports' own drawing (`render-airport.js`, task 04), the builder, the economy and road building (task 05). Parallel tasks: 04 owns `main.js` build mode, `render-airport.js`, `inspector.js` and `airport.js`; 05 owns `logistics.js`, `aviation.js` demand, `growth.js` and routing in `world.js`. When world data changes they call `IC.worldChanged(S, box)`; you make the terrain and road drawing redraw that box (whoever lands first defines the hook in `world.js` as a no-op that records the box in `S.worldDirty`).

## Design notes

- **Natural ground.**
  - The land around airports looks like the land around it: fields, grass verges mown near runways and paving, rough grass farther out, no repeating texture or odd tint. Airport ground blends into the terrain.
  - Forests follow the terrain: on slopes, along rivers, broken edges, clearings, individual trees at the edge when close in, a canopy with light and shadow when far out. No square or circular blobs.
  - Fields follow roads and slope, with hedgerows and farm tracks; fix the hard change in field direction every 150 km that task 01 left.
  - Hills read at every zoom: soft shading, and ridges visible far out.
- **Roads like Transport Fever.**
  - Motorway interchanges are real shapes: trumpet or cloverleaf where two motorways meet, diamond or roundabout where a motorway meets a main road, slip roads with smooth curves, bridges where roads cross.
  - Junctions of lesser roads are T-junctions or roundabouts with proper curves.
  - Close in: lane markings, verges, crash barriers on motorways, streetlights at night. Far out: a clean hierarchy by width and colour.
  - City streets connect to the network cleanly, no loose ends.
- **Damage that lands on what it hits, and fades.**
  - A weapon that lands on a building damages that building (rubble, fire, then a burnt shell); on a street, a crater in the street; on a field, a crater and scorched earth; on a runway or taxiway, the existing crater.
  - Marks last by what they are: a scorch on grass fades over a day or two; rubble stays until repaired or rebuilt; craters in paving stay until engineers fill them, then show a patch.
  - Store marks cheaply (a list with position, kind, size, age) and bake them into the detail tiles, so hundreds of marks cost nothing per frame.
- **Hills and military radar.** Terrain masking (task 03 built it for civil radars) now applies to military radars too, and the coverage map shows it. Low fliers use valleys. Check the Academy lessons still pass: if a lesson's radar is now blind in its valley, move the lesson's radar, do not switch masking off.
- **Performance.** Keep 60 fps with a busy capital on screen and the step budget in CLAUDE.md. Measure before and after.

## Done when

- `npm test` is green, with tests for:
  - a weapon landing on a city block damages that block; one landing in a field leaves a mark that fades after a set time;
  - a military radar does not see a low aircraft behind a hill that it sees over flat ground;
  - every motorway-to-motorway junction has an interchange shape, and generation stays within the time budget of task 01.
- Screenshots (`tools/shot.js`), day and night: the whole country, a region with forest and hills, a motorway interchange close in, the capital's centre, the capital airport and its surroundings, and a bombed street and field a few hours later. Look at them before you open the pull request.
- The pull request says what changed, the frame times before and after, and what you could not finish.
