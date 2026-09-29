# Task briefs

Each brief is written for one Claude cloud session: it says what the owner asked for (in their words), what is in and out of scope, which files to work in, and how to know it is done. Start the session with: "Read CLAUDE.md, then do docs/tasks/<brief>.md."

Work in waves. A wave starts only when the previous one is merged and `npm test` is green on `main`, because later tasks build on earlier ones and parallel sessions must not edit the same files.

| Wave | Brief | Depends on | Main files |
| --- | --- | --- | --- |
| 1 | [01 World: cities, roads, traffic](01-world.md) | — | `gen.js`, `world.js`, `terrain.js`, new `traffic.js`, road drawing in `render.js` |
| 1 | [02 Airport simulation core](02-airport-sim.md) | — | `airport.js`, `groundops.js`, `aviation-data.js`, `weather.js` |
| 1 | [03 Airspace: waypoints, radar coverage, light aircraft](03-airspace.md) | — | new `airspace.js`, `aviation.js` routing, `civil.js` light aircraft |
| 2 | [04 The airport builder](04-builder.md) | 02 | `main.js` build mode, `render-airport.js`, airport panel in `inspector.js`, `airport.js` |
| 2 | [05 Growth, trade and roads](05-growth-trade.md) | 01, 02 | `logistics.js` economy, `aviation.js` demand, new `growth.js`, routing in `world.js` |
| 2 | [08 World look](08-world-look.md) | 01 | `terrain.js`, `render.js`, shapes in `gen.js`, impact marks, radar masking |
| 3 | [10 Cities, roads and traffic](10-cities.md) | 05, 08 | city and road generation in `gen.js`, `terrain.js`, `traffic.js`, new `render-roads.js`, city growth and road tool in `growth.js` |
| 3 | [11 Air defence that fights back](11-air-defense.md) | — | `defense.js`, `threats.js`, `enemy.js`, `sensors.js`, `data.js` stats, `air.js`, `campaign.js`, Academy, remove `ground.js`, new `reinforce.js`, `testrange.js` |
| 3 | [12 Combat look and feel](12-combat-feel.md) | — | new `render-combat.js`, `audio.js`, symbols, new `names.js` |
| 3 | [13 Economy and logistics](13-economy-logistics.md) | 05 | `logistics.js`, economy in `growth.js`, ordering in `units.js`, Economy/Supply rooms, new `render-logistics.js` |
| 4 | [07 Career: start small, learn by building](07-career-pacing.md) | wave 3 | `story.js`, start-up, map size (`core.js`, `gen.js`), entry and exit points and controllers (`airspace.js`), tutorial |
| 4 | [14 Menus and progression](14-menus-progression.md) | wave 3 | `ui.js`, `inspector.js`, `warroom.js`, `main.js` keys, `app.css`, start screen |
| 4 | [15 Runway rules](15-runway-rules.md) | wave 3 | `groundops.js`, capacity in `airport.js`, stop bars in `render-airport.js`, the airport panel's Operations tab |
| 5 | [16 A world ten times larger, and money to defend it](16-world-scale-income.md) | wave 4 | world size in `core.js`, `gen.js`, `cities.js`, `world.js`, `terrain.js`; money in `logistics.js`, `growth.js`, start money |
| 5 | [17 Magazines, reloads, helicopter resupply and more units](17-magazines-units.md) | wave 4 | `data.js` units, reloads in `defense.js`, helicopter resupply in `logistics.js`, `units.js`, `names.js` |
| 5 | [18 Road traffic: lifelike, cheap, a sign of health](18-traffic-simple.md) | wave 4 | `traffic.js`, traffic in `render-roads.js` |
| 6 | [19 An enemy commander with an agenda](19-enemy-commander.md) (Fable) | wave 5 | `enemy.js` (not aircraft flight), Quick war pacing in `campaign.js`, war beats in `story.js`, Intel |
| 6 | [20 Altitude everywhere, airspace classes and air traffic control](20-altitude-airspace.md) (Fable) | wave 5 | flight profiles in `threats.js`, missile flight in `defense.js`, `airspace.js`, ATC in `aviation.js`/`civil.js`, new `render-airspace.js` |
| 6 | [21 The air war: clear intercepts, more capability](21-air-war.md) (Fable) | wave 5 | `air.js`, enemy aircraft flight in `enemy.js`, tracks in `sensors.js`, new `render-air.js`, aircraft in `data.js` |
| 6 | [22 A 3D replay like Tacview, and real unit models](22-replay-3d-models.md) (Fable) | wave 5 | new `record.js`, `replay3d.js`, `models.js`, `render-models.js` |
| 7 | [23 Airports that look and work like airports](23-airport-life.md) | wave 5 | `builder.js`, `airport.js`, `render-airport.js`, service moves in `groundops.js`, new `landside.js`, airport research |
| 7 | [24 The Career's first airports: money, airlines, pace and teaching](24-career-economy-airlines.md) | wave 5 | Act I in `story.js`, deals in `aviation.js`, `growth.js`, Aviation/Economy/Guide rooms |
| 8 | [06 Save and load](06-save-load.md) (first) | wave 7 | new `save.js`, autosave, loading screen, small hooks |
| 8 | [29 Engine health: fast tests, fast start, the step budget](29-engine-health.md) | — | tests, start-up, `sensors.js` detection, a full code review |
| 8 | [30 Cities that make sense](30-city-roads.md) | — | where roads meet cities in `cities.js`/`gen.js`, traffic assignment |
| 8 | [31 Engagements that last, and a replay that looks like a real debrief](31-engagements-replay.md) | 20, 21, 22 | missile energy and guidance in `flight.js`/`defense.js`/`air.js`, `record.js`, `replay3d.js`, cameras and video export |
| 9 | [32 Years, not days: a calendar by months, and time to breathe](32-years-calendar.md) | 24, 06, 29 | the calendar (`core.js`, `ui.js`, `main.js`), months in `logistics.js`/`growth.js`/`aviation.js`/`story.js`, seasons in `weather.js`, construction stages |
| 10 | [38 An airport full of life: aircraft variety, GA, business jets and rare visitors](38-aircraft-variety.md) | 34 | `models.js`, `aviation-data.js` types and liveries, `civil.js` GA and business traffic, rare visitors |
| 10 | [37 Release QA: a v1.0 that does not look or feel vibe-coded](37-release-qa.md) | 32, 33 part 1, 34 | everything, fixes only; `docs/qa/`, `docs/release/`, `tools/smoke.js`, `tools/package.js` |
| 9 | [34 The 3D view: steady, good-looking, flying like the real thing](34-3d-quality.md) | 22, 31 | `models.js`, `replay3d.js`, `render-models.js`, `record.js` |
| 9 | [35 Airspace a pilot would recognise](35-airspace-simple.md) | 20 | `airspace.js` shapes, `render-airspace.js`, the Airspace tab, `sideview.js` read-only |
| 9 | [36 Smooth close in: the airport, traffic at every zoom, WebGL where it helps](36-airport-performance.md) | 34 | `render*.js`, `traffic.js` visibility, `landside.js` drawing |
| 9 | [33 Build any airport: real shapes, real layouts, cosmetics](33-airport-shapes.md) | 23, 32 | shapes and stands in `airport.js`, tools and blueprints in `builder.js`, `render-airport.js`, `landside.js` |
| 9 | [25 One game: what you build in peace matters in war](25-civil-war-bridge.md) | 19, 23, 24 | hooks across airports, airlines, airspace, the war acts |
| 9 | [26 Fewer things on screen, every choice a trade-off](26-decisions-focus.md) | 24 | `ui.js`, `warroom.js`, `inspector.js`, alerts, delegates |
| 9 | [27 Moments and after-action reports](27-moments.md) | 19, 22 | new `moments.js`, the report, replay links, audio |
| 9 | [28 A 20-minute Showcase for the portfolio](28-vertical-slice.md) | 25–27 | new `showcase.js` |
| — | [09 3D replay and tilt](09-tacview.md) | — | replaced by 22 |

Wave 3 moves some drawing out of `render.js` into new files (`render-roads.js`, `render-combat.js`, `render-logistics.js`) so the three sessions do not edit the same lines. `growth.js` is shared: 10 owns city growth and the road tool, 13 owns the economy. The land war is removed (11); the game is aviation and air defence.

In wave 4 the coordinator also does two follow-ups on `main`: city districts feeding demand (`growth.js`) and Quick war money.

Wave 5 (regular sessions) lays the foundations: a world ten times larger by area (the owner's choice), income to match, battery magazines that reload from site stock, and cheaper traffic. Wave 6 runs on Claude Fable 5.1: 20 provides the 3D flight and envelope code that 21 calls (agree the interface early); 19 owns `enemy.js` except enemy aircraft flight, which is 21's; 22 only adds files and small hooks.

Wave 7 (23, 24) came from the owner's first long play of the Career and runs alongside wave 6. The owner also found the airspace "very confusing and illogical, with little control": when 20 merges, the coordinator checks its editor against that, and anything missing becomes a follow-up.

Fable 5.1's safeguards flagged sessions on this codebase (a false positive on its military theme); wave 6 runs on Opus 5.5 except the replay.

Wave 8 comes from the coordinator's ideas that the owner approved (a session-timeline export for playtesting was left out). Order: 06 save/load, 29 engine health and 30 cities first, 31 engagements and replay next (the owner asked for it) (they make everything after them easier to test), then 25, 26, 27, then 28 last. Run at most three sessions at a time: six at once exhausted the account's 5-hour usage limit in an hour.

Wave 9 comes from the owner's view of pace: the Career should span ten years or more on a calendar by months, construction stays quick, and the player has time to let revenue come in. Release (the owner: "I just want a product"): after 32, 33 part 1 and 34, and one content pass the owner asked for (38, aircraft variety), scope is frozen and 37 (QA and release materials) runs; 31's missile simulation, 36, 33 part 2 and 25–28 wait until after v1.0. After the owner's first long play of wave 8: 34 (3D quality) and 35 (airspace) first, 32 finishing, then 33 (with snapping and guides first), 36 (performance), 31's missile simulation (the owner wants to rebuild real airports: round terminals, midfield concourses, people movers, cheap cosmetics); 25–28 wait for 32 and are adjusted to the calendar before they start.

After wave 6: a full `/code-review ultra`, then fixes and long balance runs.
