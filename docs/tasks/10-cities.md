# 10 Cities, roads and traffic that look real

Wave 3. Runs in parallel with 11 (air defence systems), 12 (combat look and feel) and 13 (economy and logistics).

## What the owner asked for

> "For the cities in general, try to move away from those neat bundles: sprawling, uneven shapes make it feel much more real, as well as American and European etc. city construction. So cities themselves need an overhaul."
> "Building districts: an area that looks pretty industrial might be a cargo airport, or a regular city might service all types of flights."
> "The player should be able to build some connecting roads to the airport as well, but not become a city builder."
> "The traffic is spawning in the centre like regular bugs and scurrying around vs actual traffic. There should be vast types of cars and buses and trucks that go to actual places, making everything look real, and the roads still need a ton of work."
> "Transport Fever 3 type of roads and cities fidelity."

## Goal

From the air, no two cities look alike and none is a neat disc of blocks. Roads look built by engineers. Traffic is people and goods going somewhere: commuters into the centre in the morning, lorries between industry and depots and airports, buses on their lines, coaches between cities. A city's shape and districts tell the player what it needs from an airport.

## Scope

In (you own these): city, village and road generation in `gen.js`, `terrain.js` (towns and roads baked into tiles), `traffic.js`, road and traffic drawing (move it from `render.js` into a new `render-roads.js`), and in `growth.js` the city growth code (`grow`, `growBlocks`, `emptyBlocks`) and the road tool.

Out: the economy parts of `growth.js` (demand, industries, loans, statement: task 13, but add the district data they read), convoys (task 13), combat (tasks 11 and 12), airports, the map's overall size (task 07 next wave). Keep edits outside your files small and in separate commits.

## Design notes

- **Uneven, sprawling shapes.** Cities grow along roads, rivers and valleys, round hills and lakes, and swallow nearby villages. Edges are ragged: fingers of suburb along the roads out, gaps where the ground is steep or wet, detached estates and business parks. No circles.
- **Styles, mixed per country and city:**
  - **European:** an irregular old core of winding streets and small plots round a square or river crossing, a ring road where the walls were, 19th-century grid districts outside, then post-war estates and suburbs.
  - **American:** a strict downtown grid with towers, wide arterials, big blocks, strip malls and car parks along the arterials, cul-de-sac suburbs sprawling far out, motorways cutting through and looping round.
  - **Also:** planned new towns and industrial towns. The enemy's cities get their own style.
- **Districts that mean something.** Every block has a district: old centre, business, dense residential, suburban, industrial, logistics and warehouses, rail yard. Keep `city.blocks` and add the district to each block.
  - Industrial and logistics districts create cargo demand. Business districts create frequent passenger flights. Big residential areas create leisure travel.
  - Put the district mix on the city so task 13's demand can read it, and have the city panel say it in plain words: "Varn: industrial town. Most demand is cargo."
- **Roads worth looking at.**
  - Lanes and markings by class, and junctions that match the traffic (lights at busy crossroads, roundabouts, grade-separated interchanges on motorways).
  - Slip roads that traffic actually uses, and bridges and embankments.
  - City streets that form proper blocks.
  - Build on task 08's junction shapes and fix what looks wrong.
- **Traffic that goes somewhere.**
  - Trips have an origin and a destination by purpose: commuting (suburbs to business districts, rush hours at 8 and 17), freight (industry to logistics, rail yards, airports and border crossings), airport traffic (taxis, shuttles, fuel tankers, catering), buses on routed lines with stops, and coaches between cities.
  - Vehicles follow the road graph along their route, stay in their lane, slow and queue at junctions, and take slip roads.
  - Many kinds with their own size, colour and speed: cars in many colours, vans, box lorries, articulated lorries, tankers, city buses, coaches, taxis, and police and ambulances with lights at night.
  - Far out: flows. Close in: individual vehicles only near the camera, spawned where their trip starts (a car park, a depot, an estate), not in the middle of the road.
  - Keep the step budget: simulate trips per road link cheaply, and place individual vehicles only for the view, as now.
- **Roads to airports, not a city builder.** Limit the player's road tool to links for airports: an access road, a link to the nearest motorway, an interchange. Also allow repairing the existing network. Cities build their own streets. A good link widens the airport's catchment, and the airport panel says so.
- Deterministic per seed, and whole-world generation still within about 1.5 s in the browser.

## Done when

- `npm test` is green, with tests for:
  - cities are not round (a shape measure, such as area against the smallest enclosing circle, stays well below a disc's for every city on several seeds);
  - at least two city styles on every map;
  - districts change a city's cargo and passenger mix;
  - traffic trips start and end at real places and follow the road graph;
  - the road tool refuses a road that does not connect to an airport;
  - generation and the traffic step stay within budget.
- Screenshots of a European-style and an American-style city (whole city and street level, day and night), a motorway interchange with traffic, and a rush hour. Look at them before opening the pull request.
- The pull request says what changed, the timings, and what you could not finish.
