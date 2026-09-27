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
| `gen.js`, `world.js`, `terrain.js` | World generation (countries, cities, villages, roads, rivers, airways), routing, the terrain canvas and detail tiles |
| `state.js` | `IC.newGame`, the state object `S`, damage (`IC.detonate`), effects |
| `sensors.js`, `threats.js`, `defense.js`, `units.js`, `enemy.js` | Radars and identification, enemy weapons, our air defence, procurement, the enemy commander |
| `airport.js` | Airports as parts: runways, taxiway nodes and graph (`IC.aptGraph`, Dijkstra `IC.aptPath`), stands, stats and warnings (`IC.aptStats`), damage by location (`IC.aptHit`), engineering works, the editor (`IC.aptSnap`, `aptPlanTaxi`, `aptPlanPart`), starting layouts (`IC.layoutAirport`), founding airports |
| `groundops.js` | Aircraft moving on the ground: runway locks, taxi, hold, line-up, take-off roll, final approach, landing roll, exits, parking; military launches and landings go through it too |
| `aviation.js` | Airlines, routes and aircraft ("tails"), fees, satisfaction, route requests, prohibited zones, radio calls |
| `civil.js` | Other traffic: overflights, light aircraft, cars and trains, sirens |
| `airspace.js` | Fixes and airways the player draws, routing over them, radar cover by altitude (terrain and earth curve), controllers' spacing and separation (losses, near misses), control zones, light-aircraft fields and clubs |
| `incidents.js` | Things that must not be missed: off-route airliners, intruders, weapons released |
| `air.js`, `ground.js`, `logistics.js` | Our air wing, the ground war, depots, trucks, economy, research |
| `story.js`, `campaign.js`, `academy.js` | Career mode (acts, goals, beats, event cards, delegates), Quick war, the Academy lessons |
| `sim.js` | One simulation step, in order |
| `render.js`, `render-airport.js` | The map, and airports and aircraft at real scale |
| `ui.js`, `inspector.js`, `warroom.js`, `main.js` | Top bar and panels, the selection inspector, the full-screen rooms, input and the main loop |

Tests and tools at the repository root: `headless.js` (loads the game in Node), `tests/run.js` (the suite), `storytest.js` / `camptest.js` / `academytest.js` / `simtest.js` (long diagnostic runs that print what happens), `tools/shot.js`, `devserver.py`.

## How the airport model works

- An airport (`ap`, also in `S.infra`) has `parts` and `nodes`. Taxiways are polylines of node ids; a node that sits on a runway centreline or apron edge is linked to it (`node.on`). `IC.aptGraph` builds the graph from built parts only; aprons get stands laid out along their back edge (depth decides size S/M/L).
- `IC.aptStats` measures what the airport can do (longest usable runway, runway occupancy, movements per hour, stands, terminal capacity, fuel) and lists what is wrong in plain words (`st.warn`).
- Ground movement (`groundops.js`): one aircraft holds a runway at a time (`ap.rl` locks); taxiway edges carry traffic one way at a time with spacing; two aircraft nose to nose wait, then one is towed clear (a "gridlock", counted against the airport).
- Airlines fly real aircraft between our airports and foreign ones. Arrivals ask for the runway at a final approach fix and hold if it is busy or no stand is free; long holds divert. Turnaround depends on contact stands, terminal load and fuel.
- Damage: craters split runways into strips (`IC.rwStrips`), taxiway segments get cut, buildings lose hit points, burning fuel spreads to tanks within 160 m, aircraft in the open die more easily than in shelters.

## Balance as it stands (change it deliberately)

- Airport parts cost per 100 m (runway ₭15M, taxiway ₭4M), per hectare (apron ₭12M, terminal ₭40M) or each (hangar ₭60M, hardened shelter ₭120M, fuel tank ₭35M). Upkeep is 0.12% of cost per game hour.
- Landing fee is half the type's `fee`, passenger charge ₭0.0035M per passenger; both scale with the airport's charge level.
- The Career starts with ₭220M and a ₭5M/h grant. Act I has lasted about half a game day when a player completes goals quickly; the owner wants it much longer and slower (see `docs/tasks/07-career-pacing.md`).

## Owner's preferences

- The interface floats on the map, with no hard borders, and is readable (15 px base). Few menus: one inspector for the selection, war rooms for the rest.
- Realistic but explained. Punish bad design, and always show why.
- The player decides; the game does not script outcomes. Peacetime weapons are on Hold: shooting first is the player's choice.
- A slow burn: the game should start small (one airport, civil aviation) and grow in scope as the player learns.
