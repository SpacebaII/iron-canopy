# 56 Junctions with room and variety

Wave 16, the fifth of the audit's plan (`52-roads-and-towns-audit.md`, items B1, B3, B4, B5 and C8), on its own branch (`wave16/junctions`, from `wave16/buildings`). Owns the shape every road junction gets (`junctions` in `gen.js`), the interchanges' footprints (`IC.ixList`, `IC.ixClear`), the bridges where a motorway crosses a lesser road (`roadBridges`, `W.roadX`) and the linear city's motorway spine (`joinRoads` in `cities.js`).

## What the owner said

> "a good amount of variety in the cities from roads, buildings, highway interchanges etc."

## What was wrong

Four shapes, and every instance of a kind the same (B4): every three-way motorway junction a partial cloverleaf, every diamond the same diamond, every roundabout 70 m across with the same shrubs whether two main roads crossed in the country or a lane met a road by a town (B3). Interchanges sat on whatever node the grid produced and a town's blocks, closes and roadside plots grew up to and into their slip roads (B1: on seed 4242 two interchanges had blocks inside them). A motorway bypass ran over local roads with no junction and rural lanes ran across motorways (B5: 7 such crossings on seed 4242). The linear city had no motorway to be linear along (C8).

## What this brief does

1. **Shapes by the roads meeting** (`J.shape`). A motorway ending on another is a trumpet seven times in ten (one loop in one quarter, the slip road and a second one sweeping round outside it in the other; only where both quarters beside the ending arm are between about 50° and 130°, so a motorway merging at a shallow angle stays a cloverleaf), else the partial cloverleaf. A diamond on a main road is half the time a dumbbell: its slip roads end on two roundabouts on the road either side of the bridge (`J.rbs`, drawn by `roadJoins` with the road through and the slip roads in). On a local road one diamond in three is a half diamond, slip roads on one side of the motorway only.
2. **Roundabouts by size** (`J.r`, `J.lanes`, `J.isle`). A motorway's end is 90 m across with two lanes; main roads meet on 60 m in the country and 80 m with two lanes by a town; local roads crossing get a painted mini roundabout. Each has an island of its own: mown grass with a sign, planting (the shrubs and flowers), a ring of trees, or in town a paved island with a lawn, flower beds and a monument. Two-lane rings carry a broken lane line.
3. **Footprints** (B1, `IC.ixFoot`, `IC.ixList`, `IC.ixClear`). Each interchange has a footprint read from the roads before the junctions are shaped, so a city being built sees the ones its own bypass just made: a diamond's two strips 600 m along the motorway and 150 m either side where the slip roads run, round a 240 m circle; a cloverleaf or trumpet a 500 m circle. The fabric's raster (`blockedRaw`), the blocks (`mkBlock`, `cityGrowCell`) and the fringe's plots, estates and retail parks (`ground` in `fringe.js`) keep out of it, and a street laid across one (a ring street) is cut at its edge after the streets are tied up.
4. **Bridges, and lanes that stop** (B5). A rural lane being traced stops short of a motorway (`hitsHw` in `gen.js`). After the junctions, `roadBridges` finds every crossing of a motorway by a local or access road, a lane or a city avenue it does not meet, away from an interchange's own bridge, and the lesser one rides a bridge over it (`W.roadX`, drawn by `render-roads.js` with the deck, shadow and parapets of the other bridges).
5. **The linear city's spine** (C8). A `dxb` city lays a motorway along its axis, 480 m beside the centre line so the great road along the axis runs next to it as its frontage road: from the national road out on one side to the one on the other (a gate on the axis if there is one, else the road nearest the axis beyond the town, a last leg bending to it; a town with one road in runs the other end out into the country), ending at a roundabout on each. Where an avenue crosses it, an interchange every 1.6 km or more (a diamond or a dumbbell, since the avenue is a main road), the other avenues on bridges.

## Worth knowing

- Nothing here changes routing: shapes, footprints and bridges are drawn, not driven, except the spine, which is a real motorway with real interchange nodes (`e.spine`).
- `IC.ixList` is cached on the world by its edge and node counts (`W._ixs`, a cache the save skips), so a road built later (growth.js) is seen the next time anything asks.
- The shapes are picked by a hash of the node's position, so a save keeps them.

## Done when

- `npm test` green, with tests that every three-way motorway junction is a trumpet or a partial cloverleaf with the right loops, dumbbells' slip roads end on their roundabouts and those are drawn with the road through, half diamonds have half the slip roads, roundabouts have the size, lanes and island their roads call for, and no block, street or plot of a town stands in an interchange's footprint (`world: junctions by the roads meeting...`); and that no lane crosses a motorway, every crossing by a lesser road or avenue has a bridge, and the linear cities have a spine with shaped interchanges 1.6 km or more apart that ends on the roads out at roundabouts, and a route runs along it (`world: a lane stops short of a motorway...`).
- Before and after pictures from seed 4242 in `56-screens/`: a trumpet, a partial cloverleaf, a dumbbell, a half diamond, a diamond, each kind of island, a motorway's end, a bridge over a bypass, both linear cities.

## What it does not do

Turning lanes at a T on a main road (the audit's B4 last line) stay for a later brief: they need the join's own markings to grow a ghost island. Signalised crossroads where a town has swallowed an interchange are not needed now that towns keep out. The countryside's texture and the enemy's towns are brief 57.
