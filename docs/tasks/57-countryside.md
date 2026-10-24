# 57 The countryside, and the towns over the border

Wave 16, the last of the audit's plan (`52-roads-and-towns-audit.md`, items G1 and C9), on its own branch (`wave16/countryside`, from `wave16/junctions`). Owns the farmland's plan (`countryside.js`, painted by `terrain.js`) and the roads abroad (`foreignNetwork` in `gen.js`), on which the enemy's and the neutral neighbours' towns are now built like ours.

## What the owner said

> "nice natural looking streets and cities with depth and ... a good amount of variety"

## What was wrong

The field quilt repeated (G1): the farm blocks were one pattern of plot sizes everywhere, hedges on most edges, so a valley, a hill farm and the plain looked alike, and the whole country between the towns read as one carpet. Nothing stood in the fields: no farm, no wood smaller than the forest, no pond. Over the border (C9) the towns had no roads at all: a town of 600,000 sat in the fields with its streets ending at its edge, no road in, no villages joined to it, and the border crossings' roads stopped dead at the line.

## What this brief does

1. **A character for every block of farmland** (`IC.landKind`, `IC.CTRY`). The farm grid is 1.6 km (`IC.FB`) with jittered corners that neighbouring blocks share. Each block is read from the terrain: the *plain* (open fields, long strips between ditches with a hedge here and there, one block in six under a single crop), *enclosed country* where a smooth noise says so (smaller fields, hedges with trees on every edge), the *hills* (steep or high ground, `IC.CTRY.hillSlope` and `hillH`: each block cut into two or three holdings with their own slant, short plots along the contour, hedges and trees round every one), the *meadows* along a river (pasture with few fences, scattered trees, a pond in a third of them) and the *uplands* (rough grazing between stone walls).
2. **Things in the fields** (`P.feats`). Farmsteads on a quarter of the blocks or so, where no village is within 1.4 km: a house, a barn and a shed round a yard, a bigger one with a silo now and then, and a track to the nearest edge of the block; copses 50 to 140 m across, more in the hills; an orchard plot in a third of the blocks within 4 km of a village; ponds. Each is placed only in open farmland, off the roads and lanes, the forest, the rivers and anything built.
3. **Painted by the map** (`fields()` and `features()` in `terrain.js`). Plots in crop, pasture and rough tones by their kind, each holding clipped to its own outline so plots end at the hedge; field edges drawn as what they are (a ditch, a hedge with its trees, a post-and-wire fence, a wall, a track); the farmsteads' roofs and yards, the copses, the orchards' rows of trees close in, the ponds. Far out (the regional level) a holding is one tone with its biggest plots, so the quilt reads as country, not confetti.
4. **Roads abroad** (`foreignNetwork` in `gen.js`). Each neighbour gets a network of its own on its own soil: a motorway between its two biggest towns when they are near enough (and on to the third), main roads between neighbouring towns (a Gabriel graph, as ours), its villages on local roads with some joined to a neighbour, and the road from each border crossing carried on to the nearest town. Every piece is flagged `e.abroad` with its country (the crossing's own piece `e.crossing`), so our routing (`IC.buildRouting`), the travel times (`adjacency` in `world.js`), the bridges we hold (`owner: 'abroad'` in `state.js`) and the enemy's target lists never count them.
5. **Towns over the border built like ours.** A foreign town takes its roads in as avenues and lays its streets and blocks on them (`IC.buildCity`, with `c.home === false` deciding which side of the border is its ground), the villages abroad join it as ours do, and it gets a fringe (`IC.buildFringe`): ribbon houses along the roads out, the outer ring, an estate. The enemy's towns keep the `east` style; the neutral neighbours' look like ours.

## Worth knowing

- The plan is pure: everything is picked by hashes of the block's indices and its own points, so a save keeps it and two tiles agree on their shared edge. `IC.farmBlock(W, i, j)` is cached in `W._fbc` (a cache the save skips, cleared past 6,000 blocks), `IC.farmBlocks(W, box)` lists the blocks over a box.
- The roads abroad change the dice for everything generated after them, so every town on every seed is a different draw from before.
- Generation: the thirty towns abroad cost about two seconds on the machine that measured this, their roads one and a half; the block fitter (`segBox` in `cityfabric.js`), the field checks in `buildCity` (only the airfields and plants a town can reach) and the interchange footprint tests (one list per town, `IC.ixNear`; `IC.ixList` signed by the motorways alone) were made cheaper to pay for it, and the budget test passes within a few per cent of the branch before.
- Traffic abroad has no trips assigned, so those roads are quiet; the enemy's abstract supply lines (`W.eroads`) are as they were.

## Done when

- `npm test` green, with tests that the farmland's kinds follow the ground (the hills on steeper ground than the plain, smaller fields there and in the enclosed country, no ditch on the uplands), that farms, copses and ponds stand in open ground off the roads with a track from each farm, that nothing is planned over a town, and that a block is planned the same way twice (`world: the countryside has a plan by its ground...`); and that every foreign town stands on a road of its own country with blocks, streets and a fringe, every road abroad is flagged with the country it runs in and no home road runs abroad, the neutral crossings carry on over the border to a town, our routing and travel times skip the roads abroad, a bridge is ours only at home, and a route between our cities stays at home (`world: roads abroad: every foreign town...`).
- Before and after pictures from seed 4242 in `57-screens/`: the plain, the hills and a river meadow at zooms 3, 8 and 20, and the enemy's towns Torern and Harsk.

## What it does not do

Trips and traffic abroad (the roads are drawn and the enemy's convoys still run on `W.eroads`); hedgerow trees and farm buildings in the 3D view; the audit's B4 turning lanes. The wave 16 plan ends here.
