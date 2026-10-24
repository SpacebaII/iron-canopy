# 53 The city fabric: streets on a direction field

Wave 16, the second of the audit's plan (`52-roads-and-towns-audit.md`, items C1, C7, C2, C5 and B6), on its own branch (`wave16/city-fabric`, from `wave16/country-roads`). Owns how a city's streets and blocks are laid out (`cityfabric.js`, new, and `IC.buildCity` in `cities.js`), how the country's roads become its avenues (`joinRoads`), and how a growing city adds blocks (`IC.cityGrowCell`, used by `growth.js`).

## What the owner said

> "I want nice natural looking streets and cities with depth and ... a good amount of variety in the cities from roads, buildings, highway interchanges etc."

## What was wrong

A city was one lattice (`c.lat`), bent by a smooth noise, and everything else was drawn across it: the ring road an ellipse, the radials straight lines, the national roads straight lines, and every lattice cell they crossed was sliced into slivers and triangles (audit C1). Every block was one cell of the lattice, so the old town, the centre, the suburbs and the industrial estates all had the same block (C2). Streets ran to the last block and stopped in the grass, and a river city's streets crossed its river nowhere or everywhere (C5). The old town's lanes cut a corner into a building here and there (B6). Of the audit's plan, this is the one fix that changes how cities look; the rest is polish beside it.

## What this brief does

1. **A direction field instead of a lattice** (`IC.cityField(c)` in `cityfabric.js`, from `c.fld`, which a save keeps). At every point the field says which way the streets run: the city's own grid (strong in an American city, weak in a European one), the radial about the centre (the high roads and boulevards of a European city), the line of each national road and avenue near it, the river bank, and the old town's own winding directions, blended as tensors (an angle counts twice, so a street running east and one running west are the same street), with a slow noise that bends the whole by the style's `warp`. A block near an avenue fronts the avenue and turns with it; between two radials the blocks run square to both; a river front follows the river.
2. **Streets are traced on the field** (`IC.fabricTrace`): evenly spaced streamlines, the arterials first (every three or four blocks) and the side streets between them, in two families (along the field and across it), each line running until it comes within half a block of another line of its family, where it is run on to meet it, so every street ends on a street. A street stops short of a motorway, a lake, an airfield and the river, and at the city's edge.
3. **Block sizes by district** (C2, `IC.FABRIC.size`): the old town's lanes 100–130 m apart, the centre's streets 150 m, dense housing 200 m, the suburbs 280–340 m, industry 420 m and warehouses 460 m; American cities a sixth wider. A block is the rectangle that fits inside its face of the street net (`IC.fabricFaces`, the planar faces of the streets, avenues, roads and the city's edge), set back from the streets' kerbs, so no street cuts into a building (B6) and a wedge between two radials gets the building that fits it.
4. **Rings and avenues on the field** (C7). A ring road is traced as the across-the-field family round the centre, so in a grid city it is a loop of avenues with square corners and in a radial city a ring; the old town's boulevard follows the wall line as before and the field follows it. A national road reaching the city's edge goes on as an avenue traced on the field towards the centre, turning with the grid where it must, straight down a boulevard where it can, and ends where it meets an avenue laid before.
5. **Streets end properly** (C5). A street that meets nothing at the city's edge, short of a motorway or an airfield, ends in a turning head (`l.head`, a bit per end, drawn in the tiles by `terrain.js`); one that reaches a bank or a square simply stops there (`l.stop`). A river city crosses its river on two to four bridges carried by arterials (`l.br`, the two banks each one joins, drawn as a deck between parapets), and its side streets stop at the bank.
6. **Growth** (`growth.js`): a new block still goes into a cell of the city's plan next to built ones; `IC.cityGrowCell` now traces the field's streets inside that cell against the streets already there and returns the blocks that fit.

## Done when

- `npm test` green, with a test (`world: city streets follow a direction field...`) that the avenues and the streets beside them run with the field, that no kerbed corner cuts into a building, that no street ends in the grass without a head, that a river city has 2–4 bridges and the rest of its streets stop at the bank, and that block sizes differ by district.
- Generation stays under the time budget (`world: generation stays under the time budget`): the fabric costs about 3 s more than the lattice did (tracing, faces and fitting some 30,000 blocks, measured with the machine idle), so the budget line moves from 5 s to 9 s rather than hiding it.
- Before and after pictures from seed 4242 in `53-screens/`.

## What it does not do

The fringe, the suburbs' loops and cul-de-sacs, village plans (54); buildings with depth, pavements (55); junction footprints, the linear city's motorway spine (56); the enemy's towns' look (57).

## Worth knowing

- The tracing is chaotic in the mathematical sense: a street that stops a few millimetres earlier seeds the next one elsewhere. Node and Chromium give the same world for a seed only while their `Math.sin`, `Math.cos` and `Math.pow` agree to the last bit (V8 14 changed them: Chromium 141 and Node 22 differ, so the same seed gives Holitz the same streets and Corel a few different ones). A save regenerates its world in the browser that wrote it, so it loads; a save carried to another browser, or across a browser update that changes those functions, is refused by the world's fingerprint as before. The tests run in Node and are deterministic there.
- Agents close in (`IC.trafficAgents`) are capped at 3,600 (was 2,400): the traced streets are denser, and the capital's centre implies about a thousand vehicles in a 3 × 2 km window.

