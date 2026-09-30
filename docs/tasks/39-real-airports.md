# 39 Denver and Los Angeles, near one to one

Wave 11, before the public release. Builds on 23 (airport life), 33 part 1 (snapping) and 38 (aircraft variety). It takes the shape work from 33 part 2 as far as these two airports need it.

## What the owner said

> "Biggest thing is airport fidelity needs to be much higher before an actual release. The roads overlapping is a big no, and more complex shapes. I need you to build a good-looking DIA and LAX in all parts, near 1 to 1. Be super polished and QA'd."

The owner is a pilot. They know both airports and will compare them against the real ones.

## Goal

Two airports in the game that someone who knows Denver International (KDEN) and Los Angeles International (KLAX) recognises at once, at real scale, in every part:

- runways;
- taxiways;
- aprons and stands;
- terminals and concourses;
- landside roads;
- car parks and garages;
- cargo;
- support buildings.

They must also work: a day of traffic runs on them without gridlock, and they look good at every zoom.

Nothing on any airport overlaps what it should not. That covers these two, the generated ones, the Career's presets, and anything the player builds.

## Get the geometry from real data, not memory

Accuracy is the point, so measure. Do not guess.

- **Runways.**
  - Take runway ends (latitude and longitude), lengths, widths and headings from published data: OurAirports' `runways.csv`, the FAA's airport data, or OpenStreetMap.
  - Convert them to local metres around the airport reference point, then to world units (100 m).
  - Every runway end should land within 30 m of the real one.
- **Everything else from OpenStreetMap.** It has the whole airport mapped in detail: `aeroway=runway|taxiway|taxilane|apron|terminal|gate|parking_position|hangar|holding_position`, buildings, `highway=*` inside the fence and the car parks.
  - Fetch it with the Overpass API. Try `overpass-api.de`, then its mirrors.
  - Save the raw extract under `tools/airports/` so it can be rebuilt offline.
  - Write a converter (`tools/airport-import.js`) that turns an extract into the game's parts and nodes.
  - The shipped layouts are data files the game loads. They are not hand-typed coordinates.
- **Network, as tested by the coordinator.**
  - `raw.githubusercontent.com` works, so the runways come from `https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/runways.csv` (with `airports.csv` beside it).
  - OpenStreetMap (`overpass-api.de`, `openstreetmap.org`) is blocked by the environment's network policy. The owner has been asked to allow it.
  - Do the engine and overlap work first (it needs no data) and try Overpass again every hour or so. The coordinator may also push the raw extracts to your branch as `tools/airports/kden.osm.json` and `klax.osm.json`: fetch your branch before starting the import.
  - If OpenStreetMap is still unreachable when the engine work is done, stop and say so in a draft pull request rather than drawing the airports from memory.
- **Licence.** OpenStreetMap data is ODbL: credit it in the game's credits and in `docs/release/`.

What each airport must have, at least. Verify every item against the data; where this list and the data disagree, the data wins.

**Denver (KDEN):**
- **Runways:** the six-runway pinwheel.
  - 16R/34L is 16,000 ft. The other five are 12,000 ft: 16L/34R, 17L/35R, 17R/35L, 7/25 and 8/26.
  - All of them have the real taxiways, high-speed exits, hold bars and de-icing pads.
- **Jeppesen Terminal.**
  - Its tent roof of white peaks, drawn from above and in 3D.
  - The curbs on both sides (east and west) with their parking garages and economy lots.
  - The hotel and transit centre with the rail station at its south end.
- **Midfield concourses A, B and C.**
  - Long east–west concourses with gates on both sides, B the largest, at their real gate counts (about 150 gates in all; check the current number).
  - The underground train linking them to the terminal.
  - The pedestrian bridge to Concourse A over a taxiway: aircraft taxi under it.
- **Peña Boulevard** from the motorway to the terminal, with its interchanges.
- **Cargo, fuel and support:** the cargo area, fuel farm, fire stations, the FAA tower and the maintenance areas where the data puts them.

**Los Angeles (KLAX):**
- **Runways:** the four parallel runways in two pairs.
  - North pair: 6L/24R and 6R/24L.
  - South pair: 7L/25R and 7R/25L.
  - They have their real lengths and separations, the centre taxiways between each pair, and the crossing and end-around taxiways.
- **The central terminal area.**
  - Terminals 1–8 and the Tom Bradley International Terminal in a horseshoe, each with its own shape and piers.
  - TBIT's west gates and the West Gates concourse.
  - Gates at their real counts.
- **Landside of the central terminal area.**
  - World Way, the two-level loop road: departures above, arrivals below, drawn as two levels and never as crossing roads.
  - The parking structures inside the horseshoe.
  - The Theme Building.
- **The people mover and its stations:** from the central terminal area to the consolidated rent-a-car facility and the Metro connection, if in service in the data.
- **Cargo and support:**
  - the cargo complexes;
  - the fuel farm;
  - fire stations;
  - the tower;
  - the maintenance hangars.
- **Roads:** the approach roads (Century Boulevard, Sepulveda Boulevard and its tunnel under the south runways).

## Shapes the engine needs for this

Build them as general parts that the player's builder can also use, not special cases drawn only for these two airports.

- **Polygon terminals and concourses**, including curves and angled piers, with stands laid along any edge (from `aeroway=parking_position` where mapped).
- **Aprons as polygons.**
- **Taxilanes; bridges and tunnels.**
  - A taxiway under a passenger bridge, with the height checked against the tallest aircraft.
  - A road in a tunnel under a runway.
- **Landside roads as a proper network.**
  - Lanes, kerbs, one-way loops and ramps.
  - Two-level roads.
  - Grade-separated crossings drawn as bridges, joined to the world road network at real junctions.
- **Roofs as looks only.** A tent roof, parking-garage decks and the Theme Building are cosmetics. They cost little and never change capacity.
- **People movers and underground trains** as links between terminal parts. They set connection times; show them as the real line on the map.

## No overlaps, anywhere (the owner's "big no")

- **An overlap checker, `IC.aptOverlaps(S, ap)`.** It lists, in plain words, every:
  - road crossing another road with no junction, bridge or tunnel;
  - road over a runway, taxiway or apron with no tunnel or bridge;
  - building over a building, a road, a taxiway or a runway;
  - car park over a road;
  - landside item on the airfield;
  - world road running through the airport's fence.
- **Fix every case it finds** in `landside.js`, in the world roads round airports (`gen.js`, `growth.js`) and in the preset layouts.
- **The builder refuses** any plan that would make one, and says which part it would hit.
- **The tests assert zero overlaps** for DEN, for LAX, for every Career preset and for generated airports over several seeds.

## Where the player meets them

- **An "Airport showcase" on the start screen:** pick Denver or Los Angeles and the airport opens at real scale on a flat site at the capital, with airlines flying a real-looking day. It is the portfolio's front door, so make it look its best.
- **Blueprints in the Career.** Both are available as blueprints, paid for normally, placed and rotated by the player, and they must fit the site.
- **Names.** Use fictional in-game names like the rest of the game (for example "Front Range International", "Pacific International"), with "after Denver International" and "after Los Angeles International" in the description.
- **The old code layout.** Remove or replace `layoutKden` in `airport.js`: the real one supersedes it. Keep its test's intent.

## Look

- **At every zoom** from the whole map to the gate:
  - pavement tones and joints;
  - yellow taxiway centrelines, edge lines and hold bars;
  - runway markings to the real standard (thresholds, touchdown zones, aiming points, numbers);
  - lead-in lines to each stand;
  - jet bridges reaching the door;
  - service roads;
  - grass between the pavement;
  - car parks with rows;
  - roofs with some detail.
- **At night:** apron floodlights, taxiway edge lights and the runway lights.
- **In 3D:** the terminal and concourse massing, the tent roof and the Theme Building in the replay and live view, if it fits the frame budget. Otherwise say so in the pull request.

## Must work, not just look right

- **A full day at a busy schedule** (hundreds of movements) on each airport, with:
  - no gridlock and no taxi route through a building;
  - departures on the runways the wind picks;
  - arrivals leaving at the right exits;
  - passengers boarding at the gate that serves their stand;
  - cargo loading at the cargo areas.
- **Performance:**
  - 60 fps at the gate view and at the whole-airport view on a mid-range laptop;
  - the step within budget with 150 aircraft moving.

  Measure with `tools/world-perf.js` and give the numbers.

## QA

This must pass a pilot's eye.

- **Side by side:** for each airport, the game at the whole-airport zoom next to the real airport diagram at the same scale and orientation, in the pull request.
- **Close-ups:**
  - a concourse's gates;
  - a runway end with its hold bars and the de-icing pad;
  - the terminal kerb;
  - the Concourse A bridge with an aircraft under it;
  - World Way's two levels;
  - the Theme Building;
  - the tent roof.
- **A numeric check** against the source data:
  - runway ends within 30 m;
  - gate counts within 5%;
  - terminal footprints within 10% of area.

  Print it from a test.
- **Tests in `tests/run.js`:**
  - zero overlaps;
  - every stand reachable from a runway and back;
  - a day of traffic on each without gridlock;
  - the Concourse A bridge refuses an aircraft too tall;
  - World Way's levels never meet;
  - a blueprint placed rotated works like the original;
  - the showcase opens without errors.
- `npm test` and `npm run qa` stay green. Look at every picture you make before calling it done.

## Scope

- New: `tools/airport-import.js`, `tools/airports/` (the raw extracts), the shipped layouts (for example `iron-canopy/js/airports-real.js`, added to `index.html` and `headless.js`), and the showcase start.
- Changed:
  - shapes, stands and the graph in `airport.js`;
  - the overlap checker and refusals in `builder.js`;
  - drawing in `render-airport.js`;
  - `landside.js`;
  - where world roads meet airports in `gen.js` and `growth.js`;
  - massing in `models.js`.
- Out: new aircraft, the airspace, the war. Keep the file size sensible: the zip is 788 KB now; the two layouts should add well under 1 MB.
