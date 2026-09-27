# 01 World: cities, roads and traffic

## What the owner asked for

> "make the world much higher quality… these random roads make everything look unnatural… focus on some realistic city and road generation, along with highways etc."
> "try to get some traffic in if it can stay optimized… seeing buses, traffic, full highways etc. makes it feel alive."

## Goal

The map should read like a real country from any zoom: a road hierarchy that makes sense, cities with structure, and traffic that shows where life happens. Today roads are wiggly straight lines between towns (`gen.js`, "roads" section) and cities are scattered blocks.

## Scope

In: `gen.js` (cities, villages, the road network, bridges, rail), `world.js` (routing), `terrain.js` (how roads and towns are painted into the terrain and detail tiles), a new `traffic.js` for road traffic (move cars and trains out of `civil.js`), road and traffic drawing in `render.js`.

Out: airports, airspace, the story. Do not change how airports are placed except to keep them sensible (near their city, on flat ground, reachable by road).

## Design notes

- **Roads have classes, and each class looks and behaves differently.**
  - **Motorways:** join the capital and the big cities. They are smooth and gently curved, follow easy ground (use `W.slopeAt`, avoid lakes), cross rivers on bridges, and meet other roads at interchanges.
  - **Main roads:** join the rest of the cities.
  - **Local roads:** reach villages and airports.
  - **Rural lanes:** cover the farmland.

  The network should be connected, without near-duplicate parallel roads, and with junctions where roads actually meet.
- **Cities have structure.**
  - A dense centre with a street grid or radial pattern, and ring roads for the largest cities.
  - Districts: centre, residential, industrial near rail and motorway, and suburbs that thin out.
  - Villages strung along roads.

  Keep `city.blocks` (damage and lights use them: `IC.cityHit`, `IC.cityLights`), `W.townAt`, `W.edges` (with `pts`, `cls`, `len`), `W.nodes`, `W.bridges` and the routing used by convoys and brigades (`IC.buildRouting`, `IC.edgeBetween`). If you change their shape, update every caller.
- **Traffic.**
  - Cars, lorries and buses move along the network. Density depends on road class, city size and time of day (rush hours, quiet nights). Motorways near the capital should look busy.
  - Buses run routes inside cities and between them. Trains stay.
  - Wartime and air-raid effects already change traffic (`civil.js`); keep them.
  - Only simulate individual vehicles where the camera can see them at useful zoom. Farther out, draw density as flow along roads. Traffic must not slow the simulation noticeably (see the budget in CLAUDE.md).
- Generation must stay deterministic for a seed (the tests check this) and fast: the whole world in under about 1.5 s in the browser.

## Done when

- `npm test` is green.
- New tests:
  - every city is reachable by road;
  - motorways join the capital to the four largest cities;
  - generation stays under the time budget;
  - traffic update time for a busy hour stays under budget.
- Screenshots (`tools/shot.js`) at the whole-country, region, city and street zooms look like a real place, day and night. Put them in the pull request.
- The pull request says what changed and what you could not finish.
