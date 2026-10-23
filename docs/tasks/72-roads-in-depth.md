# 72 Roads in depth: the map's motorways, interchanges and border, and a road audit that passes

On the branch of brief 71 (PR #98), the second of the four map PRs. Owns the capital's ring motorway and the radials in `js/map-homeland.js`, the junction shapes a map can ask for and the depot it places (`gen.js`, the editor), the roughened border, the generator fixes a ring road needed, and the street and drive-graph passes that take the road audit on the map to zero open ends and stubs.

## What the owner said

> "top tier cities and interchanges and sensible road networks"

The plan: every motorway, bypass and ring road placed by hand with its interchange type, the main roads threaded through valleys and passes; done when the road audit passes with no stub, gap or one-car road anywhere on the map, and a car can be followed from the capital to the pass in its lane.

## What was wrong

The M1 and M2 met at Ashford as any two roads meet at a town: through its centre. A ring drawn at 11 km collapsed on the 6 km road grid into a few chords and a roundabout at the city node. Drawn at 15 km, three radials shared one trunk south for 9 km before splitting, because a motorway already laid is cheap to ride and the search rode it round to wherever it would rather leave. The ring's south point sat on a village, so the motorway ran through it, and its trunk through a garrison and the depot. The border read round. The road audit on the map found 49 ends that led nowhere, 70 that stopped a few metres short and 19 stubs: a neighbour's slip roads driven with no roads to join, an avenue's dead piece under the motorway at a half diamond, slip roads ending in the grass where the motorway bends just after a town's junction, street ends 5 to 13 m short at town centres, housing lanes begun a few metres before their avenue.

## What this brief does

1. **The ring and its radials.** `M0 Ashford Ring` is eight drawn points at 15 km; the M1 south and north, the M2 west and east, the M4 and the M5 each end on it, at their own interchange (three directional Ts, a trumpet, a diamond where the main road crosses). Three things in `buildNetwork` make that work: a drawn point on a village's cell moves to the open cell beside it farthest from any town; motorways keep off garrison and depot cells as they keep off villages (`T.vil`); and a drawn motorway that starts or ends on a motorway already laid leaves it two cells out along its own line (`lead`).
2. **Junction shapes by hand.** `junctions: [{ x, y, shape }]` in the map names the shape of the nearest road junction within 6 km, where the roads there allow it (a trumpet or a directional T needs a motorway ending on another, a stack or turbine two crossing; a dumbbell, single-point interchange or folded cloverleaf a road through). The M2 and the Gatlin motorway meet at a trumpet. The editor drags a junction, adds one with `J` and exports them; it drags the depot too (`depot: [x, y]`).
3. **The border.** A drawn border is a smooth polygon. `roughBorder` displaces it along its normals by two octaves of noise (up to about 20 km over 100 km, with a finer grain), except along the coast, where the shore is the border, and the radial table is raised where any drawn town, site, place or village would fall within 6 km of it.
4. **Slip roads on the road.** A slip road's points were placed straight along an arm's direction; where a motorway turns soon after a town's junction its ends lay 2 km from the carriageway. `at` now follows the arm's own line, with the offset along the local normal.
5. **Bypasses.** A drawn motorway passes every town by: a town it names is reached at a cell beside the town's own (one cell out for a small town, two for a large one, on the side that bends the road least) and a main road runs from there into the town (`bypass` in `buildNetwork`); no town's cell is on a drawn motorway's way (`T.vil`). A procedural motorway still runs through a town as its avenue, as brief 66 made it.
6. **Streets a car can follow, by the audit's own measure.** In `buildCity`: avenues that would join a few metres before the centre join at the centre (`joinRoads`); a turning head or an end at a square within 12 m of a street runs on to it like any other end (`tidyStreets`); a last pass after the housing lanes runs every end within 40 m of a street or road on to it, a head or an end at a square within 15 m (`runOnEnds`). In the drive graph (`traffic.js`): a neighbour's slip roads are not driven (its roads are not); a road's end in a town ties to a street within 5 m, and a street's end to its own body (a loop); a lesser road's dead piece past the slip roads' junction under a motorway, any dead end under 30 m off a junction and any piece under 30 m on its own are dropped, with the nodes they leave; a street's point that falls on a motorway's own vertex (a street traced to end on the carriageway's line does, now and then) is a node of the street's alone, not a way onto the motorway, except at a road node or where a slip road was tied on. The street passes never run an end across a motorway or a railway.
7. **The audit tool takes a map**: `node tools/road-audit.js --map=homeland --list=gap`. On the map it finds nothing to list: no end that leads nowhere, none that stops short, no stub, no trap.

## Worth knowing

- The ring is an octagon of grid chords: the 6 km grid quantises every drawn point to a cell, so two radii that land on the same cells make the same ring. Fifteen kilometres is the smallest ring the grid holds round a city of Ashford's size.
- The audit's thresholds in the brief 67 test still hold for seeded worlds, which get the street and drive-graph passes too; the map test asserts the map itself has no open end, no gap, no stub and no trap, and that a car can be driven from the capital's centre to Tarn Pass.

## Done when

- `npm test` green, the map test asserting the ring's interchanges, the drawn junction's shape, no motorway through a village, a garrison or the depot, the depot where the map puts it, the road audit on the map finding nothing, and a drive from the capital to Tarn Pass.
- Screenshots looked at: the ring at two zooms, the trumpet, the border north and east, two bypassed towns, the whole country.
