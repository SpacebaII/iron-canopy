# Iron Canopy: guide for working on this project

Iron Canopy is a browser game. The player starts as Director of Civil Aviation, builds real-scale airports and runs fictional airlines, and rises through four acts to Chief of the Air Force while a neighbouring country escalates from gray-zone incidents to open war. The owner is building it for their portfolio and wants depth that stays readable: realistic systems, explained in plain words, that punish bad decisions fairly.

Task briefs for larger pieces of work are in `docs/tasks/`. Read the brief you were given, then this file.

## Run it

- Play: open `iron-canopy/index.html` in a browser, or `python devserver.py` and go to http://localhost:8766/iron-canopy/index.html.
- Test: `npm test` (about 40 s; `npm run test:quick` skips the slow ones). GitHub runs the same suite on every push.
- See it: `node tools/shot.js <name> "<setup script>"` saves a full screenshot (UI included) to `shots/<name>.png` and reports page errors. It needs Playwright: `npm i --no-save playwright && npx playwright install chromium`. Open the PNG to look at it. Visual work is not done until you have looked at it.

## Rules

- Plain HTML, CSS and JavaScript. No build step, no frameworks, no runtime dependencies. Scripts are classic scripts sharing one namespace, `window.IC`, loaded in the order listed in `iron-canopy/index.html`.
- New game file? Add it to `index.html` in the right place and to the `FILES` list in `headless.js` (same order), or the tests will not load it.
- Keep the simulation free of DOM code. Everything in the step (`IC.step` in `sim.js`) must run headless in Node.
- Match the surrounding style: compact functions, short comments that say why, `const U = IC.U` helpers.
- Every change keeps `npm test` green. New systems get tests in `tests/run.js`: assert behaviour ("a departure takes off", "a crater shortens the runway"), not implementation details.
- The eight Academy lessons must stay completable (the suite plays them).
- Performance budget: a simulation step (0.25 game s) well under 1 ms on a mid-range laptop, rendering at 60 fps with a busy capital airport on screen. Measure after big changes.
- Work on a branch named for your task, commit in sensible steps, and open a pull request with a short summary of what changed, what you tested, and what you could not finish. Do not push to `main`.

## Words on screen

The player reads a lot of text: messages, event cards, tooltips, panel labels. Keep it plain and specific. Say what happened and what the player can do about it, in short sentences, with real units (km, min, ₭M). No jargon without a word of explanation, no invented terms the player has not been taught, no filler.

## Units and time

- 1 world unit = 100 m. The world is 12,000 × 9,000 units (1,200 × 900 km). Airports are drawn at real size: a 3.4 km runway is 34 units long and 0.45 wide.
- Game seconds. `IC.GS = 10` game seconds per real second at 1×; speeds 1–32×, and skip (64×) stops when something needs the player.
- Money is in ₭M (`U.money`). Distances `U.km`, durations `U.dur`.
- The camera zoom `IC.cam.z` is screen pixels per world unit, from about 0.08 (whole map) to `IC.MAXZ` = 80 (aircraft at the gate). Anything drawn with a fixed world size must look right at both ends; effects scale with `WF` in `render.js`.

## Map of the code (`iron-canopy/js/`)

| File | What it does |
| --- | --- |
| `core.js` | Constants, seeded RNG, helpers (`IC.U`), the event bus `IC.on(fn)` / `IC.emit(S, type, data)` |
| `data.js`, `aviation-data.js` | Units, munitions, threats, aircraft types (`IC.ACTYPES`), airport parts (`IC.APART`), airline archetypes, radar bands |
| `gen.js`, `world.js`, `terrain.js` | World generation (countries, rivers, cities with streets and blocks, villages, the road network by class, railways, airways), routing, the terrain canvas and detail tiles |
| `state.js` | `IC.newGame`, the state object `S`, damage (`IC.detonate`), effects |
| `sensors.js`, `threats.js`, `defense.js`, `units.js`, `enemy.js` | Radars and identification, enemy weapons, our air defence, procurement, the enemy commander |
| `airport.js` | Airports as parts: runways (names, dependent groups), taxiway nodes and graph (`IC.aptGraph`; heap Dijkstra `IC.aptSearch`, cached trees `IC.aptTree`, `IC.aptPath`), zones (`IC.partZone`, `IC.standZoneOk`), stands, stats and warnings (`IC.aptStats`), damage by location (`IC.aptHit`), engineering works, the editor (`IC.aptSnap`, `aptPlanTaxi`, `aptPlanPart`), starting layouts (`IC.layoutAirport`, including the six-runway `'kden'`), founding airports |
| `groundops.js` | Aircraft moving on the ground: the wind's runway configuration (`IC.aptConfig`), runway clearances, taxi route reservations, hold-short, crossings, line-up, take-off roll, final approach, landing roll, exits, parking; crash risk and accidents (`IC.gopsRisk`); military launches and landings go through it too |
| `aviation.js` | Airlines, routes and aircraft ("tails"), fees, satisfaction, route requests, prohibited zones, radio calls |
| `civil.js` | Other air traffic: overflights, light aircraft; sirens and morale |
| `traffic.js` | Road and rail traffic: flows per road by class, city size and hour; cars and lorries placed only where drawn; buses, coaches, trains |
| `airspace.js` | Fixes and airways the player draws, routing over them, radar cover by altitude (terrain and earth curve), controllers' spacing and separation (losses, near misses), control zones, light-aircraft fields and clubs |
| `incidents.js` | Things that must not be missed: off-route airliners, intruders, weapons released |
| `air.js`, `ground.js`, `logistics.js` | Our air wing, the ground war, depots, trucks, economy, research |
| `story.js`, `campaign.js`, `academy.js` | Career mode (acts, goals, beats, event cards, delegates), Quick war, the Academy lessons |
| `sim.js` | One simulation step, in order |
| `render.js`, `render-airport.js` | The map, and airports and aircraft at real scale |
| `ui.js`, `inspector.js`, `warroom.js`, `main.js` | Top bar and panels, the selection inspector, the full-screen rooms, input and the main loop |

Tests and tools at the repository root: `headless.js` (loads the game in Node), `tests/run.js` (the suite), `storytest.js` / `camptest.js` / `academytest.js` / `simtest.js` (long diagnostic runs that print what happens), `tools/shot.js`, `devserver.py`.

## How the airport model works

- An airport (`ap`, also in `S.infra`) has `parts` and `nodes`. Taxiways are polylines of node ids; a node that sits on a runway centreline or apron edge is linked to it (`node.on`). Taxiways can be one-way (`part.oneway` ±1) or carry a preferred flow (`part.flow`). `IC.aptGraph` builds the graph from built parts only (`G.adj`, reverse `G.radj`, runway node lists `G.rwn`, dependent-runway groups `G.grp`); aprons get stands laid out along their back edge (depth decides size S/M/L). Every part and stand has a zone (passenger, cargo, light aircraft, military): civil aircraft never park in the military zone and the reverse.
- Wind (`S.wind`: `dir` it blows from, `kt`, `gust`) and visibility (`IC.sky`, `IC.needILS`) come from `weather.js`. Aircraft types have crosswind and tailwind limits (`xw`, `tw`); `IC.rwWindBlock` says when a runway is closed to a type. `IC.aptConfig` picks a direction for each runway and a role (arrivals, departures, mixed, spare); in fog, arrivals need a landing system (`ils` part) on the end they land on.
- `IC.aptStats` measures what the airport can do (runway occupancy per configuration and traffic mix, arrivals and departures an hour, stands per zone, gates against remote stands, terminal capacity, fuel by trucks or hydrant, fire-truck response) and lists what is wrong in plain words (`st.warn`). The numbers use the same timings as the simulation (`IC.rwOcc`).
- Ground movement (`groundops.js`): runways that cross or are closer than 760 m share one clearance (`ap.rl`, keyed by group). Aircraft stop at hold-short lines 75 m before a runway; aircraft at the same line cross together; a crossing starts only when the way off is clear. Routes are planned with time reservations (`ap.res`) so opposite traffic on a single taxiway is avoided in advance; an aircraft kept waiting by oncoming traffic claims the taxiway next. Only stopped, nose-to-nose traffic is a "gridlock" (one is towed clear, counted against the airport). Scrambles, then arrivals, have priority for runways.
- Airlines fly real aircraft between our airports and foreign ones. Arrivals get a runway from the arrival manager (`IC.gopsFaf`), ask for it at the final approach fix and hold if it is busy, its exit is blocked or no stand is free; long holds divert. Turnaround depends on contact stands, terminal load and fuel.
- Accidents are rare and always have a cause: gusts just beyond a crew's limit, a wet or short runway, an incursion at night or in fog where there are runway crossings and no ground radar, birds near water. Fire-truck response decides how many die; the wreck closes the runway until engineers clear it; an accident report card follows.
- Damage: craters split runways into strips (`IC.rwStrips`), taxiway segments get cut, buildings lose hit points, burning fuel spreads to tanks within 160 m, aircraft in the open die more easily than in shelters.

## How roads, towns and traffic work

- Roads are routed by A* on a 4 km cost grid (`buildNetwork` in `gen.js`): slopes, forest and river crossings cost more, and running on an existing road is cheap, so roads merge. Classes in `edge.cls`: `hw` motorway, `rd` main road, `lc` local road, `sp` access road. `W.nodes` are places plus junctions (`jct`, interchanges `ix`); `W.lanes` are rural lanes and `city.streets` city streets, both drawn and driven but not routed.
- A city has `blocks` on a street grid (flags `core`, `ind`, `sub`), `streets`, `parks` and an industrial direction `indA`. `W.farmAt` is zero inside built-up areas.
- Traffic (`traffic.js`): each road has a load (class, nearby population, hour, war, alerts, blown bridges) and a phase advanced every step. Vehicles are not simulated: `IC.trafficVisible` places them in slots riding the phase, only for the view being drawn. Close in (z ≥ 1.3) `render.js` draws the network live at real width; tiles carry streets and lanes.

## Balance as it stands (change it deliberately)

- Airport parts cost per 100 m (runway ₭15M, taxiway ₭4M), per hectare (apron ₭12M, terminal ₭40M) or each (hangar ₭60M, hardened shelter ₭120M, fuel tank ₭35M, landing system ₭25M, ground radar ₭60M, hydrant system ₭90M). Upkeep is 0.12% of cost per game hour.
- Runway separation: 480 s without a tower, 110 s with one, 60 s with an approach radar (half that after an arrival). Each tank's fuel trucks refuel 8 aircraft an hour; a hydrant system removes the limit and pipes in 900 fuel units an hour.
- Landing fee is half the type's `fee`, passenger charge ₭0.0035M per passenger; both scale with the airport's charge level.
- The Career starts with ₭220M and a ₭5M/h grant. Act I has lasted about half a game day when a player completes goals quickly; the owner wants it much longer and slower (see `docs/tasks/07-career-pacing.md`).

## Owner's preferences

- The interface floats on the map, with no hard borders, and is readable (15 px base). Few menus: one inspector for the selection, war rooms for the rest.
- Realistic but explained. Punish bad design, and always show why.
- The player decides; the game does not script outcomes. Peacetime weapons are on Hold: shooting first is the player's choice.
- A slow burn: the game should start small (one airport, civil aviation) and grow in scope as the player learns.
