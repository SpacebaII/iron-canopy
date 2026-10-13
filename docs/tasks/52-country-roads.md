# 52 Country roads that follow the ground

Wave 16, the first of the audit's plan (`52-roads-and-towns-audit.md`, items A1, A2, A3, F1), on its own branch (`wave16/country-roads`). Owns the roads' lines on the ground (`refineRoads`, `fineLine`, `IC.roadLine` in `gen.js`), the village lanes' ends (`spur`), and the line a road built in play takes (`roadFinish` in `growth.js`).

## What the owner said

> "Major part of this that needs extra help is the road generation. I want nice natural looking streets and cities with depth ... including access roads to airports, everything that needs to be polished."

## What was wrong

The country's roads were routed by A* on a 6 km grid and that grid's path was the road's line. So every road was a chain of 6–13 km straights with a kink at each turn, a village road was one straight line to the main road (266 of 893 roads had a straight stretch over 9 km; 121 were two points, 12–24 km apart), several villages' lanes met the same road cell and fanned out of one junction, a main road approached a town dead straight for 30 km, and an airport's access road was a ruler line from a corner of its fence. The roads were drawn well where they met (brief 46) and carried traffic (brief 51); the lines between were the problem.

## What this brief does

1. **Every road's line is drawn again on the ground.** The grid still decides which places a road joins and where roads meet. Then `refineRoads` takes each road, most important and longest first, and finds its own line between its two nodes with `fineLine`: an A* on an 800 m grid (`FC`), inside a corridor round the grid route (`FINE[cls].half`: 1.8 km for a motorway, 0.9 km for an access road). The corridor's centre line sways with a slow noise by class (`amp`, `wave`: a motorway 1.4 km over 12 km, a lane 1.2 km over 4 km), so a road on a plain bends as roads do. The ground prices each step: slopes (`slope`, squared), forest, a river crossing (`bridge`, dearer on the diagonal, so a road crosses squarely), the corridor's edge (`pull`). The first and last stretch out of each node is a straight lead (`lead`: 1.6 km for a motorway, 600 m for an access road), along one direction shared by the two roads of the highest class at the node (the pairs most nearly opposite at a crossroads), so a main road keeps its line where a lane joins it and the junction shapes (brief 46) lie on straights. The path is smoothed by class (`rounds`), given a second, smaller sway for the lattice's straights, and thinned to the points that matter (Douglas–Peucker, 40 m).
2. **Roads still meet only at their nodes.** The cells a road takes are marked; a later road may not enter them (nor slip between two of them on a diagonal), except in the cells of the two nodes it ends at. Every node's cell is kept for the roads that end there. Airfields and, for a motorway, villages are kept off. A road whose corridor is shut tries once more, twice as wide and without the sway, and failing that keeps its grid line (5 roads on seed 4242).
3. **Village lanes join the roads clear of junctions.** A village's `spur` ends on a plain stretch of road with no junction in the eight cells round it when one is in reach, so lanes do not fan out of one node.
4. **Roads built in play take the same kind of line.** `IC.roadLine(W, cls, pts, apt)` bends the line between the points a road is planned through, keeping off the roads already there and the other airports; `roadFinish` uses it for an airport's access road (`IC.landAccessRoad`) and the player's roads, and prices the bent line.
5. **Rural lanes** are laid every 12 km or so of road rather than every third point, so their number did not change with the points.

## Measured, seed 4242

| | before | after |
| --- | --- | --- |
| straight stretches over 5 km | 3,788 | 121 |
| straight stretches over 8 km | 498 | 20 |
| longest straight | 24 km | 16 km (a road no corridor could take) |
| roads over 3 km that are one straight line | 121 | 5 |
| pairs of roads crossing away from a node | 5 (a city's motorway pieces over lanes, audit B5) | 4 (of the same) |
| generation (`IC.generate`, on a loaded machine) | 4.3 s | 4.9 s, of which the lines 0.4–0.7 s |

Pictures from the same seed in `52-screens/`, before on the left and after on the right: the country at z 2 (`13`) and z 6 (`14`), Halenn from the region zoom (`15`), the capital's diamond interchange with its lanes (`16`), a village on its river (`17`), an airport's access road (`18`).

## What it does not do

- The city's own streets and avenues are untouched (brief 53). A national road still turns into a straight avenue at the city's gate, and the old town's corners still cut into a building now and then (B6).
- A junction with five arms (a motorway, a main road and two lanes at one node) is still drawn as five lines meeting at a point; room and footprints for junctions are brief 56.
- The motorway pieces a city lays as it takes its roads in (`cities.js`) still cross a few lanes at grade; they did before. Noted as B5 for brief 56.
- Where a lane meets a road, the angle is whatever the lattice brought it in at, from 22° up; a turned approach is for brief 56 with the junction footprints.

## Done when

- `npm test` is green, with the new test: on seeds 4242 and 7 fewer than 300 straight stretches over 5 km and 60 over 8 km, at most 8 roads over 3 km that are one straight line, four lanes in five over 6 km that bend, and no more roads crossing away from a node than before (B5's five).
- `world: generation stays under the time budget` still passes.
- Before and after pictures in the pull request.
