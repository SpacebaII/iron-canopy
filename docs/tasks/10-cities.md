# 10 Cities that look and work like real ones

Needs 05 (growth, trade and roads) and 08 (world look) merged: this builds on their growth model and drawing.

## What the owner asked for

> "For the cities in general, try to move away from those neat bundles: sprawling, uneven shapes make it feel much more real, as well as American and European etc. city construction. So cities themselves need an overhaul."
> "Building districts: an area that looks pretty industrial might be a cargo airport, or a regular city might service all types of flights."
> "The player should be able to build some connecting roads to the airport as well, but not become a city builder."

## Goal

From the air, no two cities look alike, and none looks like a neat disc of blocks. A city's shape and its districts tell the player what it needs from an airport.

## Scope

In: city and village generation in `gen.js` (the shapes, street patterns and districts), the district data that growth (`growth.js`) and airline demand (`aviation.js`) read, and the road tool's limits.

Out: terrain and road drawing style (task 08 set it; draw the new shapes with it), airports, the story.

## Design notes

- **Uneven, sprawling shapes.** Cities grow along roads, rivers and valleys, round hills and lakes, and swallow nearby villages. Edges are ragged: fingers of suburb along the roads out, gaps where the ground is steep or wet, detached estates and business parks. No circles or rings of even blocks.
- **Styles by country and city.** Pick a style per city and mix them:
  - **European:** an old core of irregular, winding streets and small plots round a square or river crossing, a ring road where the walls were, 19th-century grid districts outside it, then post-war estates and suburbs.
  - **American:** a strict grid downtown with tall towers, wide arterials, big blocks, strip malls and car parks along the arterials, cul-de-sac suburbs sprawling far out, motorways cutting through and looping round.
  - Mixed or newer cities (planned towns, industrial towns) as variety. The enemy's cities can have their own style.
- **Districts that mean something.** Each block belongs to a district: old centre, business, residential (dense or suburban), industrial, logistics and warehouses, port or rail yard. Keep `city.blocks` and add the district to each block.
  - Districts drive what the airport sees: industrial and logistics districts create cargo demand (freighters, a cargo terminal pays off); business districts create business travel (frequent narrow-body flights, the budget and flag carriers); big residential areas create leisure and holiday demand (wide-bodies in summer, budget carriers).
  - So an industrial town suits a cargo airport, and a big mixed city wants all types of flights. Show this in the city panel in plain words: "Varn: industrial town. Most demand is cargo: 40 t a day."
  - Growth (task 05) adds blocks to the districts that its economy favours.
- **Roads to the airport, not a city builder.** The player's road tool (task 05) is for connecting airports to the network: an access road, a link to the nearest motorway, an interchange. Limit it to roads that start or end at an airport or at an airport's road, plus repairing the existing network. Cities build their own streets.
  - A good road link widens the airport's catchment (how far people will drive to it), and the airport panel says so.
- Keep generation deterministic per seed and within task 01's time budget.

## Done when

- `npm test` is green, with tests for:
  - cities are not round: a shape measure (for example area against the smallest enclosing circle) stays well below a disc's for every city on several seeds;
  - at least two city styles appear on every map;
  - an industrial district raises a city's cargo demand, and a business district its passenger demand;
  - the road tool refuses a road that does not connect to an airport.
- Screenshots of at least one European-style and one American-style city, whole city and street level, day and night. Look at them before you open the pull request.
- The pull request says what changed and what you could not finish.
