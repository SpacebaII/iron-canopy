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
| `names.js` | Display names: a name, short code and plain role for every unit (`d.name`, `d.short`, `d.role`), a `nick` for munitions and threats (their plain `name` stays for logs); `IC.fullName(d)` for panels |
| `data.js`, `aviation-data.js` | Units, munitions, threats, aircraft types (`IC.ACTYPES`), airport parts (`IC.APART`), airline archetypes, radar bands |
| `gen.js`, `cities.js`, `world.js`, `terrain.js` | World generation (countries, rivers, villages, the road network by class, railways, airways), cities (`cities.js`: styles, street plans, districts, blocks), routing (`IC.roadsChanged`, travel times `IC.travelFrom`), the `IC.worldChanged(S, box)` hook, the terrain canvas and detail tiles |
| `state.js` | `IC.newGame`, the state object `S`, damage (`IC.detonate`), effects |
| `sensors.js`, `threats.js`, `defense.js`, `units.js`, `enemy.js` | Radars and identification, enemy weapons, our air defence, procurement, the enemy commander |
| `airport.js` | Airports as parts: runways (names, dependent groups), taxiway nodes and graph (`IC.aptGraph`; heap Dijkstra `IC.aptSearch`, cached trees `IC.aptTree`, `IC.aptPath`), zones (`IC.partZone`, `IC.standZoneOk`), stands, stats and warnings (`IC.aptStats`), damage by location (`IC.aptHit`), engineering works, the editor (`IC.aptSnap`, `aptPlanTaxi`, `aptPlanPart`), starting layouts (`IC.layoutAirport`, including the six-runway `'kden'`), founding airports |
| `builder.js` | Building airports: pavement materials (`IC.PAVE`, strength against `IC.MTOW`, wear, crater size), construction in stages paid as they run (`IC.bldPreview`, `IC.bldAdvance`), materials trucked from industry (`IC.bldSupply`, site stock `ap.mat`), clearing homes (`IC.bldClearance`, `IC.worldChanged`), works that close a runway, the builder's tools and plan preview (`IC.bldPlanOf`: parallel taxiway, rapid exits, concourse, remote apron, open ramps and stands, fillets), the controls (`IC.buildInput`, `IC.bldUndo`, `IC.bldMove`) and founding with a site survey (`IC.foundSurvey`, `IC.foundInput`) |
| `groundops.js` | Aircraft moving on the ground: the wind's runway configuration (`IC.aptConfig`), runway clearances, taxi route reservations, hold-short, crossings, line-up, take-off roll, final approach, landing roll, exits, parking; crash risk and accidents (`IC.gopsRisk`); military launches and landings go through it too |
| `aviation.js` | Airlines, routes and aircraft ("tails"), fees, satisfaction, route requests, prohibited zones, radio calls |
| `civil.js` | Other air traffic: overflights, light aircraft; sirens and morale |
| `traffic.js` | Road and rail traffic: the drive graph (`IC.driveGraph`), trips by purpose assigned to routes, loads per link and direction by hour, vehicles in slots for the middle zoom, vehicles on their own trips close in (`IC.trafficAgents`); bus lines, coaches, trains |
| `airspace.js` | Fixes and airways the player draws, routing over them, radar cover by altitude (terrain and earth curve), controllers' spacing and separation (losses, near misses), control zones, light-aircraft fields and clubs |
| `growth.js` | Growth, trade and roads: passenger demand per city and load factors per airport, remote industries and trade taxes, city growth (population, prosperity, new and emptied blocks), roads cut by weapons and repaired, roads the player builds, loans and the weekly statement |
| `incidents.js` | Things that must not be missed: off-route airliners, intruders, weapons released |
| `air.js`, `ground.js` | Our air wing, the ground war |
| `logistics.js` | Supply (depots, truck companies, convoys at road speed, stock bought by rail or imported, Keep stocked, why a unit waits: `IC.nextLoad`), the economy tick (income and running costs, `S.ledger`, low-money warnings), research |
| `story.js`, `campaign.js`, `academy.js` | Career mode (acts, goals, beats, event cards, delegates), Quick war, the Academy lessons |
| `sim.js` | One simulation step, in order |
| `render.js`, `render-airport.js`, `render-roads.js`, `render-logistics.js` | The map; airports and aircraft at real scale; roads, bridges, streetlights, signals and traffic; convoys and supply lines |
| `render-combat.js` | Unit and threat symbols (a shape by role, a glyph per type, `IC.drawUnitSymbol`, `IC.drawThreatSymbol`), our units and ranges, the known enemy, tracks, missiles and every combat effect: a pooled particle system that watches missiles and explosions frame to frame (`IC.cfx`) |
| `ui.js`, `inspector.js`, `warroom.js`, `main.js` | Top bar and panels, the selection inspector, the full-screen rooms, input and the main loop |

Tests and tools at the repository root: `headless.js` (loads the game in Node), `tests/run.js` (the suite), `tools/combat-shots.js` (combat scenes as frames, and frame timing with a raid in the air), `storytest.js` / `camptest.js` / `academytest.js` / `simtest.js` / `econtest.js` (long diagnostic runs that print what happens; `econtest.js` is the economy balance run), `tools/shot.js`, `devserver.py`.

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
- Cities (`cities.js`): a city grows out from its centre over a cost field (roads cheap; hills, forest and rivers dear), so it reaches out along roads and valleys and swallows villages. Its street plan is a lattice bent by a smooth warp (`IC.cityFrame(c)`, parameters in `c.lat`); a style (`c.style`: `eu`, `us`, `new`, `ind`, and `east` for the enemy's towns) sets the plan, districts and buildings. Every block has a district `b.d` (`old`, `biz`, `dense`, `sub`, `ind`, `log`, `rail`), a building form `b.f`, its lattice cell `b.i, b.j`, and the old flags `core`, `ind`, `sub`. The city keeps `blocks`, `streets`, `parks`, `squares`, its reach `ext` and its district mix `mix`; `IC.cityDemand(c)` turns the mix into cargo, business and leisure demand and `IC.cityCharacter(c)` into words. `W.farmAt` is zero on built ground (`W.builtAt`).
- Junctions (`junctions` in `gen.js`): every road junction has a shape in `W.junctions` (`mm` cloverleaf, `mx` diamond, `rb` roundabout, `tj` kerbed junction) with slip roads in `W.ramps`; routing still runs through the node. Roads cross railways on bridges (`W.railX`).
- The map (`terrain.js`): a far image (colour × hillshade) and tiles at four levels, painted on demand: fields in farm blocks lying along `W.fieldAng`, forest from the density `W.forestD`, airfield grass from the airport's parts, towns, and marks. Change world data, then call `IC.worldChanged(S, box)`; the map repaints that box.
- Damage (`state.js`): `IC.groundAt` says what a weapon landed on; a block takes the hit (`IC.blockHit`, `b.hp` 1 → 0), everything else gets a mark in `S.marks` (field and forest scorch fade in under two days, road craters stay until the road engineers repair the road (growth.js), then leave a patch). Tiles bake marks in and repaint as they fade.
- Radar and hills: every ground radar, civil or military, uses the terrain profile in `airspace.js` (`IC.aspHidden`, `IC.radarFloor`); the coverage layer shows military cover in blue with the holes behind hills.
- Traffic (`traffic.js`): roads, streets, slip roads and lanes form one drive graph (streets meet where they cross; motorways only by their one-way slip roads). City blocks are grouped into zones with homes, jobs and freight; commuters, lorries, airport travellers and errands are assigned to routes once (again when roads change), giving every link a flow per direction and purpose. Every two game minutes (and at once when an alert starts or ends) the step turns flows into loads for the hour (war, alerts, cut roads). In the middle zoom `IC.trafficVisible` places vehicles of each kind in slots riding the flow; from z 10 `IC.trafficAgents` (called by the renderer, never the step) runs vehicles on their own trips near the camera: from a zone's car park to their destination, in lane, stopping at signals and giving way. Close in (z ≥ 1.3) `render-roads.js` draws the network live at real width; tiles carry streets and lanes.

## How growth, trade and roads work

- Travel times are per place, not per car: `IC.travelFrom` runs Dijkstra over `W.edges` at class speeds (motorway 100 km/h, main 75, local 55); a cut road (`edge.cut`, a crater) or a fallen bridge is six times slower. `S.econ.tt` holds trees from every city and industry with cuts, `S.econ.ti` without. `IC.roadsChanged(S)` re-plans convoy routing and marks these stale.
- Demand: a city wants `pop × 28 × prosperity` flights a day (`IC.GROWTH`), times its air score: each airport within 2.5 h by road counts for its quality (frequency, places served, delays over the last day, fares). Airports' load factors (`ap.svc.lf`) fill the seats in `aviation.js`; airlines ask for routes where seats run full and not where they fly half empty.
- Industries (`S.econ.inds`, at remote villages): sales = capacity × (a floor, a home market by road, exports by air cargo or lorry over a neutral border). Trade taxes are 15% of sales and follow the story's tax share.
- Cities grow with their air score and road reach, shrink with war damage, drift down slowly with neither. Blocks follow population (`city.bpp` blocks per thousand): new ones fill cells of the city's own street plan next to built ones, pulled by roads, rail and airports, with a district and building, and streets on their open sides (`block.grown`); shrinking marks the outer ones `empty`. The district mix follows. Every change calls `IC.worldChanged`.
- Roads: a hit within reach of a road (`IC.roadHit`, from `IC.detonate`) lowers `edge.cond`; below 0.6 it is cut until engineers bring it back (about 10–15% an hour, three times that when rushed, `IC.rushRepair`). The player builds roads only for airports (`IC.ROADS`: access road, link road, motorway link, which ends on a motorway at a new interchange); `IC.roadPlan` refuses anything else and says why. They are works in `W.roadWorks` (surveying, earthworks, paving) and open as new edges, splitting existing roads where they join; bridges they need become real bridges. `IC.aptCatchment` counts the people within reach of an airport by road.
- Money: pay with `IC.pay(S, kind, amount)` so the payment is booked (`IC.econBook`) by kind (names in `IC.STATEMENT`); `IC.weekStatement(S, 0 | 1)` sums this week or last week, and anything not booked shows as "Building works and other spending". `IC.money(S)` is the hourly view (income and running costs, each line with its reason from `IC.moneyWhy`). Loans (`IC.LOANS`) repay over their term with 0.4% interest a day.

## How supply works

- Buying a unit: `IC.deploy` places it from the reserve, or buys it if there is none (`IC.buyBlock` says why not). It loads for 2 min at the nearest depot, garrison, city barracks or airfield (`IC.deliveryPlan`) and drives there, or is flown from the nearest airfield by heavy-lift helicopter when the drive would take over 25 min (`IC.AIRLIFT`), then sets up. No production queue.
- Stock (missiles and rockets) lives in depots. Each depot's truck companies (3 lorries each) take it to units inside its ring, first-priority areas (`depot.pri`) and the emptiest units first; forward depots refill from the Central Depot. Stock is bought from the arms plants (`IC.buyStock`, by rail, `IC.SUPPLY.railKmh`) or imported by air when every plant is down. `S.supply.auto` (Keep stocked) buys whatever falls below half of one full reload, never below `S.supply.floor`.
- Convoys drive `IC.route(…, true)` (roads only) at `IC.SUPPLY.kmh` by class, slower in towns at rush hour, crawling past cuts; `v.cut` names the cut. `IC.nextLoad(S, u, mag)` is what a unit's panel says about its next load.

## Balance as it stands (change it deliberately)

- Airport parts cost per 100 m (runway ₭15M, taxiway ₭4M), per hectare (apron ₭12M, terminal ₭40M) or each (hangar ₭60M, hardened shelter ₭120M, fuel tank ₭35M, landing system ₭25M, ground radar ₭60M, hydrant system ₭90M). Those are concrete prices: asphalt ×0.7 (carries 90 t), grass ×0.15 (6 t), reinforced concrete ×1.6 (600 t, craters about half the size). Upkeep is 0.12% of cost per game hour.
- Construction: 10% of the cost must be in hand to start; the rest is paid stage by stage (survey 3%, earthworks 27%, paving 50%, markings and lights 20%). Paving needs about 10 lorry loads of concrete (8 of asphalt) a hectare; an industrial town delivers 20 + 1.5 × its industry loads an hour. Clearing a city block costs ₭6–40M in compensation and public support.
- Runway separation: 480 s without a tower, 110 s with one, 60 s with an approach radar (half that after an arrival). Each tank's fuel trucks refuel 8 aircraft an hour; a hydrant system removes the limit and pipes in 900 fuel units an hour.
- Landing fee is half the type's `fee`, passenger charge ₭0.0035M per passenger; both scale with the airport's charge level.
- Roads cost per km on flat ground ₭2M (access road), ₭5M (link road), ₭15M (motorway link, plus ₭40M for its interchange), plus ₭15M/₭40M/₭100M a bridge; hills and forest add up to 170%. They build at 4/2/1 km a game hour.
- A city grows up to 0.5% a day with perfect air service, 1.5% a day for each 100% better road reach than at the start, and drifts −0.08% a day with neither.
- Supply: convoys 150/120/90/70 km/h on motorway/main/local/access roads (military, escorted), 35 km/h on tracks; load and unload 90 s; stock by rail at 200 km/h after 5 min loading; the Central Depot starts with six truck companies in Quick war.
- The Career starts with ₭220M and a ₭5M/h grant. Act I has lasted about half a game day when a player completes goals quickly; the owner wants it much longer and slower (see `docs/tasks/07-career-pacing.md`).

## Owner's preferences

- The interface floats on the map, with no hard borders, and is readable (15 px base). Few menus: one inspector for the selection, war rooms for the rest.
- Realistic but explained. Punish bad design, and always show why.
- The player decides; the game does not script outcomes. Peacetime weapons are on Hold: shooting first is the player's choice.
- A slow burn: the game should start small (one airport, civil aviation) and grow in scope as the player learns.
