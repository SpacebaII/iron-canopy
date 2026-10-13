# 52 Roads and towns: every flaw in the generation, and a fix for each

Wave 16. The audit the owner asked for before any more road work: "really look at the generation and see all the flaws, then come up with ideas to fix them one by one; I want nice natural-looking streets and cities with depth, variety in the cities from roads to buildings to highway interchanges, access roads to airports, everything polished."

What was looked at: one Quick war from seed 4242 at 08:10, seven cities of six styles (Halenn `eu/par`, Lisov `eu/lon`, Salra `us/ny`, Holitz `us/chi`, Marin `ind/chi`, Calern `new/dxb`, Corel on its river) at the region zoom (z 4), the town zoom (z 12) and the street zoom (z 25); the first two junctions of each kind (cloverleaf, diamond, roundabout, T) at z 30; three villages at z 20; two airports and their access roads at z 3 and z 15. 34 pictures; the ones that show a flaw are in `52-screens/`. Headless counts come from the same seed.

The short version: the roads are drawn well where they meet (brief 46) and now carry traffic (brief 51), but the **plan** under them is coarse. The country's roads are routed on a 6 km grid and smoothed, so a local road is a 15 km ruler line; every city is one lattice with ellipses and ruler lines laid across it; a village is thirty boxes thrown round a point; an airport's access road is a straight line to the nearest road cell. Those are generation flaws, and no amount of drawing fixes them.

## A. The country's roads (`buildNetwork` in gen.js)

**A1. Local roads are ruler lines, 10–24 km long, and fan out of one junction.** `12-village-roads-fan.jpg`: the thin dark lines that radiate from the diamond junction across the fields. They are village roads: 266 of the 893 road edges have one straight segment longer than 9 km, and the typical village road is two points (`e.pts.length === 2`, village to junction, 12–24 km). Cause: a village's `spur` searches on the 6 km cost grid (`RC = 60`) for the first cell with a road on it and lays the path; `smoothLine` rounds corners but a path with no corners stays a line, and several villages reach the same road cell, so the junction node gets a fan. Fix: route local and access roads on a finer grid (1.5–2 km) with a terrain cost that bends them (slopes, the field pattern, river crossings at right angles), make them join the road across at a T with the last 300 m turned towards it (the junction geometry already draws a T), and let a village road prefer to run on to the next village rather than every village having its own line to the main road.

**A2. Main roads approach towns dead straight for 30 km, then kink.** `01-halenn-region.jpg`: the road from the west is a ruler line, the one from the south-west has a right-angle elbow. Cause: A* on the grid with eight neighbours makes axis and diagonal runs; `smoothLine` rounds a corner over one cell (6 km), which leaves a kink at that scale, and a cheap flat plain gives no reason to bend. Fix: route on the finer grid for `rd` too, add a small random cost noise so roads wander like real ones, and smooth with a curvature limit by class (a motorway bends over 2 km, a main road over 600 m, a lane over 100 m) rather than one `ROUNDS` count.

**A3. A motorway runs through a village.** `10-village.jpg`: Village 0 sits on both sides of the motorway with its houses against the hard shoulder. `HOW.hw.byVil` is meant to keep motorways out of villages, but it only raises the cost of a village's cell, and a village placed near an already-laid motorway (or a later village) gets no protection. Fix: when a motorway's path runs within 1 km of a village, move the village's houses to one side (the side of its own road), or reroute the motorway with a hard block on village cells; and never let a village's own lane start on the motorway (it must start on a lesser road, which the `spur` rule says but the picture contradicts; to be checked in the fix).

**A4. All classes read the same from the region zoom.** `01-halenn-region.jpg`: the main road and the village lanes are the same pale hairline at z 4; only the motorway stands out. The tones (`IC.ROAD_TONE`) are close and the minimum pixel widths are equal. Fix: a width and tone ladder by class at the far zooms (motorway 3 px warm, main road 2 px, local 1 px, access road 1 px lighter), the way a road atlas does it, so the hierarchy is readable before the roads are drawn at real width.

## B. Junctions (`junctions` in gen.js, `roadgeom.js`)

**B1. The diamond is a tangle beside a town.** `07-diamond.jpg`: the first diamond interchange sits 400 m from an industrial estate; its slip roads cross stub streets, and the local road through it is one of the ruler lines above. Cause: junction shapes are placed on whatever node the grid produced, without room, and a city's lattice later grows up to it. Fix: give each interchange a footprint (a diamond 600 × 300 m, a cloverleaf 800 m square) that the city's blocks and streets keep out of, and where a town has grown round one anyway, make it a signalised junction with turning lanes instead.

**B2. Slip roads are hair-thin until z 30.** `08-cloverleaf.jpg`: at z 30 the loops are 1 px lines and the picture reads as a sketch. Cause: `IC.roadWidth('ramp', z)` follows the real width (one lane) with no minimum. Fix: a minimum of 2 px for ramps and local roads from z 5, like the main roads.

**B3. One roundabout for every size of road.** `09-roundabout.jpg`: the same 40 m roundabout with the same island where two main roads cross and where a lane meets a main road. Fix: size by the roads meeting (a mini roundabout for lanes, 40 m for main roads, 60 m with two lanes for a main road near a town), and a few island treatments (grass, planting, a monument in town).

**B4. One kind of each.** There are four shapes (`mm`, `mx`, `rb`, `tj`) and every instance of a kind is the same. Real networks vary: a trumpet where a motorway ends on another, a half-diamond, a dumbbell (two roundabouts joined over the motorway), a signalised crossroads with turning lanes in town. Fix: add trumpet, dumbbell and half-diamond shapes, chosen by the roads meeting and the room available, and let the `tj` on a main road get turning lanes.

## C. City fabric (`cities.js`)

**C1. One lattice per city, and everything else cuts across it.** `02-halenn-town.jpg`: Halenn's streets are one grid, bent slightly by noise; the ring road is an ellipse drawn over it, the national roads are straight lines through it, and every block they cross is sliced into slivers and triangles. `05-salra-river.jpg`: the same on the river. Cause: `IC.cityFrame` gives a city one lattice (`c.lat`), rings are ellipses, radials are straight, and blocks are lattice cells clipped by whatever crosses them. Fix (the deep one): a **direction field** instead of one lattice: each cell takes its street direction from the nearest arterial (a radial, a national road, the river bank, the shore) and blends to the city's own grid between them; blocks are laid in that field, so they front the high road along it, turn with it, and run square between the radials. A grid city's ring becomes a loop of its own avenues (on the lattice), a European city's ring follows the old wall line (the first ring) and the boulevards (the second), and a national road through a town becomes its high street with blocks fronting it. This touches `cityFrame`, block placement, `streets`, `joinRoads`, `growth.js` (new blocks fill cells of the field) and the tiles. It is the one fix that changes how cities look; the others are polish beside it.

**C2. Every block is the same size and the plans are the same.** Halenn's blocks are all one cell; Holitz's are all one cell. Real cities have a small-block old core (60–80 m), 100–150 m blocks in the 19th-century ring, 200–300 m superblocks and cul-de-sac loops in the suburbs, 400 m industrial plots. Fix: the cell size comes from the district (`b.d`) and the city's style (`c.style`), the lattice is subdivided or merged per district, and suburbs get real plans (loops and cul-de-sacs, a crescent, a grid of closes) rather than lattice cells with a few houses.

**C3. Suburbs read as empty.** `04-holitz-town.jpg`: Holitz's thin street lattice runs far beyond the visible buildings; the outer cells have a few tiny houses and read as empty fields with lines across them. Cause: suburb blocks are drawn as scattered houses on green, which is right close in and wrong at the town zoom. Fix: in the tiles at lod 1–3, paint a suburb cell as built ground (a warm roofs-and-gardens texture with its own streets), and close in the real houses with gardens, hedges, drives and parked cars.

**C4. No fringe: a city is an island on the field quilt.** `01-halenn-region.jpg`, `03-halenn-edge.jpg`: the blocks stop on a stair-stepped line and the fields start at once. Fix: ribbon development along each road out (houses, a petrol station, a garden centre, a car dealer), an outer ring of allotments, sports fields, a cemetery, a sewage works, a retail park at the motorway junction, and a few outlying estates; the city's outline follows the roads out and the valley, not the lattice's extent.

**C5. Streets end abruptly, and there are no bridges.** `03-halenn-edge.jpg`: streets run to the last block and stop with a square end in the grass; in Salra, streets cross the river without a bridge. Fix: streets at the edge end in a turning head or run on as a lane to the next farm; a street that crosses a river gets a bridge (the overpass drawing exists in `render-roads.js`) and a city crosses its river at three or four bridges, not every street.

**C6. Grass verges and trees in dense centres.** Downtown blocks sit on green with verges along the avenues. Fix: pavements (kerb, flagstones, street trees in pits) in `old`, `biz` and `dense` districts; verges in `sub` and `ind`; the tiles take the district's ground colour.

**C7. Rings are ellipses.** A European ring road follows the old walls (a polygon with rounded corners, the first ring) and the boulevards (the second); a grid city's ring is a loop of avenues with square corners (an ellipse cutting a grid at a diagonal is what reads as "incoherent"). Part of C1.

**C8. Calern (`new/dxb`), the linear city, has no motorway spine.** `06-calern-linear.jpg`: the template is a strip along a highway and the highway is not there; the strip hangs on a main road. Fix: the `dxb` template puts a motorway along its spine (an `hw` edge with interchanges every 2 km) and its blocks either side.

**C9. The `east` style (the enemy's towns) is unaudited;** it needs the same look over the border once the above is in.

## D. Buildings and depth

**D1. Repeated building stamps.** `02-halenn-town.jpg`: the same orange-roofed courtyards in the core, the same white bars in rows outside, the same grey sheds in the industrial estate, every block a copy. Cause: a building form per district (`b.f`) stamped per cell. Fix: a small grammar per form (a perimeter block with a courtyard, two to five parcels of different depths, a corner building, a church or a school every so often, a tower on a podium in `biz`), roofs in three or four tones per city with a few outliers, orientations following the street rather than the lattice, and landmark buildings (station, cathedral, stadium, hospital, university, the Ministry in the capital) placed on squares and at the end of avenues.

**D2. Parks and squares are rare and square.** Halenn has two green blobs. Fix: a park system per city (a central park, a river park along the banks, pocket parks in the dense ring, a cemetery, allotments, sports fields at the edge), and squares at the crossings of the main avenues in the old core.

**D3. No railway presence in town.** The railway runs through; there is no station forecourt, goods yard or sidings, and the `rail` district is a label. Fix: a station on the line nearest the centre with a forecourt on an avenue, a goods yard in the `log` district, sidings into the big industrial plots.

## E. Villages

**E1. Thirty boxes round a point.** `10-village.jpg`: a village is a scatter of houses either side of its road, on the motorway in this case, with no plots, lanes, green or church. Fix: a village plan: a main street along its road with the houses fronting it on plots, a green or a square at the crossroads, a church, a farm with its yard at each end, two or three lanes off the street with a few houses, hedged gardens behind, and a few outlying farms on the lanes. Three village forms (street village, green village, crossroads hamlet) by size and style.

## F. Airports

**F1. The access road is a ruler line with a kink.** `11-airport-access.jpg`: a 15 km straight line from a corner of the airport to the nearest road. Cause: `spur(i.id, 'sp')` on the 6 km grid. Fix: route it on the fine grid like the lanes (A1), from the terminal's forecourt (the landside's own access road, `IC.landAccessRoad`) to the nearest main road, joining it at a T or a roundabout; a big airport gets a dual carriageway with a grade-separated junction on the motorway when one is within 10 km, and a railway spur when a line is within 5 km.

**F2. Nothing grows round an airport.** Real airports pull hotels, logistics parks and a petrol station onto their access road and a business park to the motorway junction; the landside has hotels and warehouses inside the fence (brief 44) but nothing outside it. Fix: part of the fringe work (C4), seeded by passenger numbers.

## G. The map

**G1. The field quilt repeats.** The farm blocks are one pattern of plot sizes everywhere, hedges on most edges; valleys, hill farms and the plain look alike. Fix: plot size and shape by terrain (small irregular plots on hills, long strips on the plain, pasture with scattered trees near rivers), and orchards and woods in the pattern.

**G2. Roads at z 1–3 are the same pale line.** See A4.

## The plan, in order

Each is its own brief and pull request on a `wave16/` branch, with before and after pictures from seed 4242, a test in `tests/run.js`, and `npm test` green. The order puts what shows most, and what the later ones need, first.

1. **Brief 52: country roads that follow the ground** (A1, A2, A3, F1, B2, A4). The fine routing grid for lanes and access roads, curvature by class, Ts where lanes join, villages off the motorway, the access road from the forecourt, minimum pixel widths for ramps and lanes, a tone ladder at the far zooms. Measured by: no road edge with a straight segment over 3 km, no village within 500 m of a motorway, every airport's access road starting at its forecourt and ending at a T or a junction.
2. **Brief 53: the city fabric** (C1, C7, C2, C5). The direction field, blocks fronting the arterials, rings on the field, block sizes by district, streets ending properly, bridges. The big one; probably two pull requests (the field and the blocks; then streets and growth).
3. **Brief 54: the fringe and the suburbs** (C4, C3, F2, E1). Ribbon development, the outer ring, suburb plans and the suburb texture in the tiles, village plans. Villages are in this one because they share the plot-and-lane grammar with the suburbs.
4. **Brief 55: buildings with depth** (D1, D2, D3, C6). The building grammar, landmarks, parks and squares, pavements, the station.
5. **Brief 56: junctions with room and variety** (B1, B3, B4, C8). Footprints, more shapes, roundabouts by size, the linear city's spine.
6. **Brief 57: the countryside** (G1, C9). The field pattern by terrain, and the enemy's towns.

What the owner gets after each: 52 roads that look routed rather than ruled; 53 cities that read as cities at the town zoom; 54 the country between them; 55 depth close in; 56 interchanges worth zooming to; 57 the whole map.
