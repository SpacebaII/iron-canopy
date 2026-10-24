# 55 Buildings with depth

Wave 16, the fourth of the audit's plan (`52-roads-and-towns-audit.md`, items D1, D2, D3 and C6), on its own branch (`wave16/buildings`, from `wave16/fringe`). Owns what a city block is built of (`buildings.js`, `IC.blockPlan`), the landmarks a town has and where they stand (`IC.placeLandmarks`), the station and the goods yard, the parks along a river, the pavements, the parked cars (`IC.parkedSpots` in `traffic.js`) and the villages' hedges.

## What the owner said

> "nice natural looking streets and cities with depth and ... a good amount of variety in the cities from roads, buildings, highway interchanges etc."

## What was wrong

Every block was a stamp: the same orange courtyard in every old-town block, the same white bars in rows, the same grey sheds, a building form per district drawn per cell with the same palette in every city, and the buildings well inside their block with pavement all round (D1). Parks were a few green blobs; nothing along the river (D2). The railway ran through a town as a line, with no station, forecourt or sidings, and the `rail` district was a label (D3). Downtown blocks sat on green with verges along the avenues (C6). Nobody parked. The villages' gardens had no hedge to see.

## What this brief does

1. **A plan for every block** (`IC.blockPlan(b, c)` in `buildings.js`, headless, cached on the block as `b._plan`): the open ground, lots (courts, gardens, car parks, plazas, pitches), lanes and sidings, buildings (centre, size, height, roof colour, roof kind, what it is) and trees, in the block's own frame, from its seed and its city's roof tones. The map paints the plan (`paintPlan` in `terrain.js`: the lowest buildings first, each with its shadow and its roof: pitched, hipped, flat with a plant room, glass, ribbed, round, a spire, a dome) and the 3D view builds the same buildings (`IC.blockBoxes` in `models.js`), so a tall building stands where its shadow lies.
2. **A grammar per form.** The old town and the perimeter blocks: parcels of different widths and depths round a court, three to four floors in the old town and four to six further out, the corner buildings a floor taller with a flat or hipped roof, a passage into the court now and then, the court paved in the old town and a garden elsewhere; a parish church in its yard in one old block in fourteen, a school with its playground and pitch in one block of flats in twenty-five. Downtown: a podium the whole plot with one or two towers on it, a mid-rise block, a plaza or a car park. Terraces in runs of three to eight houses of one tone with gardens behind; detached houses on their plots with a garage and a tree; the estates' slabs with a point block; the factories' sheds, tanks and stacks; the warehouses with their trailers; the goods yard's tracks, wagons and shed.
3. **Roof tones per town** (`IC.cityTones(c)`, `IC.ROOF_TONES`): four of its style's eight, by its seed, the first the common one, one roof in twelve an odd one out, each a little lighter or darker, so one town is terracotta and slate and the next brown and tar.
4. **Landmarks** (`IC.placeLandmarks(W, c, roads)`, from `cities.js`; `b.land`): the **station** on the railway (the goods yard nearest the centre: platforms along the line, `b.ra`, the station building and a forecourt with a bus loop and trees on the centre's side, `b.face`, a car park beyond), **sidings** into the factories and warehouses beside the line (`b.sid`: a turnout off the line, a curve across the corridor, a track along the yard with wagons on it), a **cathedral** in the old town of a town of 25,000, a **hospital** (a tall block, wings, a helipad) from 20,000, a **university** quad from 40,000, a **stadium** (the bowl round its pitch, car parks) from 30,000, and the **Ministry** with its dome on a forecourt in the capital.
5. **River parks** (D2, `cities.js`): in a town of 25,000 the housing blocks on the river banks stay green, up to ten, a park along the water (`c.parks`, `river: true`).
6. **Pavements** (C6, `terrain.js`): the lots of the old town, downtown and the dense housing are paved with a kerb drawn round them from the street zoom; the suburbs and the estates keep their verges.
7. **Parked cars** (`IC.parkedSpots(W, c, l)` in `traffic.js`, drawn by `render-roads.js` from z 36): a fifth of the spaces along a side street's kerbs have a car in them (an eighth on a close), in the parking lane beside the driving lane, none within 25 m of a crossing, a street's end or inside a bend; the same cars every time the view comes back (`l._pk`). They cast no light at night.
8. **Village hedges** (`terrain.js`, from the street zoom): a bushy line round every garden and a tree at the back of half of them.

## Worth knowing

- The plan is pure: the block's seed, size, form, landmark and the city's tones decide it, so a save needs nothing new (`_plan` and `_tones` are caches). A block the city grows later gets its plan the same way.
- Every building is pulled inside its block, and a plan never comes out empty (a one-plot downtown block always builds on it; a goods yard always has its shed).
- The fringe's own forms (ribbon plots, petrol stations, dealers, garden centres, retail parks) and the estates (`cul`, brief 54's plan) keep their pictures.

## Done when

- `npm test` green, with tests that every block's buildings stay inside it, its roofs are in the town's tones, perimeter blocks have their corner buildings and parcels of different widths, and there are churches and schools (`world: every block has a plan...`); that every town on the railway has a station with platforms along the line and a forecourt towards the centre, that factories by the line have sidings, that the cathedrals, hospitals, stadiums, the Ministry and the river parks are there (`world: landmarks...`); that parked cars sit in the parking lane on both sides, none at a crossing or a street's end (`traffic: parked cars...`).
- Before and after pictures from seed 4242 in `55-screens/`: the old town, a perimeter block, downtown, terraces and houses, the station, the cathedral, the stadium, the hospital, the university, the Ministry, a park, a village.

## What it does not do

Junction footprints, more interchange shapes and roundabouts by size (56); the countryside's texture and the enemy's towns (57). Squares at the crossings of the old core's main avenues stay as brief 53 left them. The tiles' finest level stays 32 pixels a unit, so a 10 m house is three pixels in the tile and soft at the closest zooms.
