# 05 Growth, trade and roads

Needs tasks 01 and 02 merged first. Runs in parallel with 04 (builder) and 08 (world look).

## What the owner asked for

> "Find a way to make an airport bigger that makes sense in the game: maybe stimulate city growth, access to imports and exports for a remote industry, etc."
> "Start very small… get really good at the aviation side, then the economic side."
> "The player should likely be able to build roads, and roads should be able to be targeted, and that could affect transportation, not on the micro scale, but if a highway is hit on any portion it should affect the connection between the cities."
> "Much more realistic city and city growth."

## Goal

A bigger airport should be worth it for reasons the player can see: cities grow, industry gets markets, and money follows. This is what makes the economy the second thing the player learns after aviation.

## Scope

In: the economy in `logistics.js`, demand in `aviation.js` (how many passengers and routes a city generates), city growth (population, prosperity) in cities' data, and a new trade layer for cargo.

Also in: roads as economic links. The player builds roads, and damaged roads cut connections (`world.js` routing, a new `growth.js` for growth and road works). City growth adds real blocks and streets.

Out: the airport simulation rules (task 02), the airport builder (task 04), how terrain, roads and towns are drawn (task 08: `terrain.js`, `render.js`, the shape code in `gen.js`), the story (task 07 will use what you add).

Parallel tasks: 04 owns `main.js` build mode, `render-airport.js`, `inspector.js` airport panel and `airport.js`; 08 owns `terrain.js`, `render.js` and road and town shapes in `gen.js`. When you add blocks or roads, change the data (`city.blocks`, `W.edges`, `W.nodes`) and call `IC.worldChanged(S, box)`; do not draw. Whoever lands first defines that hook in `world.js` as a no-op that records the box in `S.worldDirty`. A road-building tool needs a few lines in `main.js`; keep them in one separate commit.

## Design notes

- **Demand from cities:** passenger demand between two cities depends on their size, prosperity, distance and the service quality. Service quality means frequency, delays and fares, which follow the airport's charges.
- **Growth from connections:** cities with good air service grow in population and prosperity over days, which raises taxes and demand. Cities with poor service stagnate. Show it in the city panel ("grew 2% this week, mostly from new routes to …").
- **Cargo and trade:**
  - Industries, including remote ones (mines, farms, factories far from the capital), produce goods that need markets.
  - Air cargo gives them access to imports and exports: freighters, cargo terminals, belly cargo on airliners.
  - Without an airport or road link they produce less.
  - Imports matter too, for example spare parts and fuel supply.
- **Money that makes sense:** revenue from fees and trade taxes; costs from upkeep, staff and loans. Big projects may need borrowing, with interest. Show a clear weekly statement.
- **Roads the player builds.** A road tool in the map (not the airport builder): pick the class (local road, main road, motorway), draw it; it costs money per km by class and terrain (bridges, cuttings), takes time, and uses the same staged works idea as task 04. New roads join the routing graph (`IC.buildRouting`) and shorten trips between the places they connect.
- **Roads as links, and cutting them.** Every road edge has a condition. Weapons that land on a road (a crater on a motorway, a dropped bridge) cut that edge until engineers repair it. Model the effect at city level, not per car: rebuild the city-to-city travel times when an edge is cut, and let trade, growth, airport passenger catchment (people drive to the airport), fuel and material deliveries, convoys and brigades use the new times. A cut motorway between two cities should visibly hurt both: the city panel says "Motorway cut at Varn bridge: trips to Ostrel take 2 h 40 instead of 55 min; trade down 30%".
- **Cities that grow like cities.** Growth adds blocks: infill first, then new districts along roads out of town, industry near rail and motorways, suburbs thinning outward. Shrinking cities empty (blocks go dark) rather than vanish. Growth is slow (days), and follows connections: a new motorway or airport pulls growth toward it. Keep generation deterministic per seed and growth deterministic per game.
- Keep the numbers readable. The player should be able to say why their income went up.

## Done when

- `npm test` is green, with tests for:
  - better service raises demand and city growth over a few game days;
  - a remote industry with an air cargo link out-produces one without;
  - a road the player builds joins the routing graph and shortens a trip;
  - a crater on a motorway cuts the link between two cities (longer travel time, lower trade) until it is repaired;
  - a well-connected city adds blocks over a few game days.
- The city and economy panels explain the numbers in plain words.
- The pull request includes a balance run: Career Act I over three game days, printing income, growth and demand.
