# 68 Towns in depth: streets to every door, and buildings that are more than boxes

On the branch of briefs 65 to 67. Owns the housing blocks' streets (`IC.resLanes` in `buildings.js`, `houseStreets` in `cities.js`), the forms `house`, `row`, `cul` and `tower` in `buildings.js`, the estates' plan (`IC.culPlan`, `IC.culHouses` in `cities.js`), the old towns' infill (`infill` in `buildings.js`) and which real faces keep their buildings (`realBlocks` in `cities.js`), towers in tiers (`q.on`, `q.z0` in a plan, drawn by `render-buildings.js`), and the roundabouts in the drive graph (`rings` in `traffic.js`).

## What the owner said

> "Yes do the fixed but yeah we are looking much better and you can do more indpeth building I don't mind about the original load time being long if that helps make better structures and streets"

The fix was the roundabouts: a line drawn along the drive graph crossed the island.

## What this brief does

1. **Roundabouts are driven round their ring** (`rings`). Every road into a roundabout is cut where it meets the ring, and the pieces of ring between are one-way links, anticlockwise from above, so a car in its lane goes round the island. A street that crossed the circle without a junction inside it is cut in two, both halves ending on the ring, and the crossings' paint is no longer drawn on the islands. 84 of the 85 roundabouts at home on the 4242 map are built this way.
2. **Every house is on a street a car can drive.** The houses and terraces used to stand along lanes inside their block that met nothing and no car drove. Those lanes are now streets of the city (`houseStreets`): along the block's longer side, one every 100 m between detached houses and every 62 m between terraces, each run on from the block's edge to the street round it, where it meets it at a T junction like any other (an end with no street ahead of it within 80 m ends in a turning head). A block too narrow for one faces its houses out to the streets round it.
3. **Houses on plots.** Detached houses stand on plots of 12 to 26 m along the street: a front garden, a drive to the garage beside the house, a wing at the back of some, a back garden with a shed, a tree or, in the bigger suburbs, a pool, and fences between the plots. Terraces come in runs of four to nine houses in one tone, small front yards, a back extension on half of them, long narrow gardens with a fence between each, and a path between runs to the backs.
4. **Estates are not ovals.** The loop of a cul-de-sac estate is a rounded box the shape of its block, squarer or rounder by the estate, with a slow wobble, a plot and a half in from the block's edge so its outer houses back onto the streets round it. Houses stand one every 20 m along the loop, the way in and the closes, either side, each turned to face its street on its own plot, five round each turning head; a big loop has a green in the middle with a playground. The estate's houses stand up on the map and in the 3D view like the other forms' (`FORMS.cul`).
5. **Downtown is many buildings.** A downtown plot used to be one box or a podium with one or two towers. Each plot is now a street wall of offices of six to fourteen floors round a court, in stone, brick, concrete and dark glass, the corners a floor or two taller, and in most a tower rising out of the court in tiers: a base, one or two set-back storeys of it and a crown, a mast on some of the tallest. Now and then a plaza, a multi-storey car park, or a tower standing back on its own plaza. A tier stands on the one below it (`q.on`), so the map draws it on that roof with its own walls and windows.
6. **Old towns are built up to the street.** A real old town's face that one of our roads only runs beside used to be left empty because the road came within a few metres of it; it now keeps its real buildings, all but those on the road, and is left empty only when the road runs through it or its outline still reaches onto the road. Where no mapped building stands along a block's edge, narrow houses of three to five floors fill the frontage (`infill`).

On the 4242 map, before and after:

| | Before | After |
| --- | --- | --- |
| Houses over 30 m from a street | 99% | 7% |
| Housing blocks with streets of their own | none | 94% |
| Houses on an estate (each) | painted, not standing | 56 |
| Buildings on a downtown block of the capital | 2.5 | 10.2 |
| Towers in tiers in the capital | none | 703 tiers |
| Old towns' blocks built over | 50% | 54% |
| Drive graph links | 84,430 | 110,260 |

### Closing the gaps

After the towns, the last of what a car could not follow (road audit on the 4242 map):

7. **A road that ends at a motorway gets slip roads both ways** (`roadsOverMotorways` in `gen.js`). A road that met a motorway at a diamond from one side only had half an interchange: it now crosses on a bridge to a terminal 130 m out on the far side (`e.over`), so the diamond has both halves. A town's road at a gate where motorways meet (the junction is the motorways' only) is led off on a curve to a diamond of its own 900 m along the motorway nearest its line (`roadsOffInterchanges`).
8. **National roads in town round their corners** into 15 m arcs, as the streets do (`roundAvenues`), except where a street meets them. **A motorway that turns onto a town's bypass** does so on a curve of up to 800 m radius, or passes through the interchange on the bend on a curve tangent to both pieces (`roundMotorwayBends`).
9. **A street end that stops just short of a road runs on to it**, straight on where it can (the last pass of `buildCity`); one with no road within 40 m gets a turning head.

| | Before | After |
| --- | --- | --- |
| Ends that lead nowhere | 14 | 1 |
| Ends that stop short of a road | 113 | 8 |
| Dead ends under 30 m | 38 | 7 |
| Sharp bends on national roads in town | 115 | 42 |
| Sharp bends on motorways | 12 | 1 |
| Bends a car cannot follow (all) | 687 | 678 (most are in the old towns' real streets) |

Also: the close-in vehicles take the links near the view from the link grid instead of walking every link in the country (2.9 to 2.3 ms a frame with 3,000 vehicles); a roundabout's splitter island is at least 80 m on a short arm; the test workers get the machine's memory divided by the workers, since the world group keeps a generated world per seed and ran out of Node's default heap; GitHub runs the suite in eight parts.

## Worth knowing

- About 9,000 new streets on the 4242 map. The road audit still passes its thresholds: pieces too short for two cars are 1.8% of the links (2.5% allowed), bends a car cannot follow 0.7% (1.2%).
- Generation takes about 10% longer than before (the owner said a longer load is fine for better towns; the budget test allows 19 s, GitHub measured 17.4 s), and the drive graph a little longer; the roundabout pass looks only at the links near each roundabout. The estates' houses are laid out when first drawn, not at generation.
- Blocks grown in play (`IC.cityGrowCell`) get no streets of their own: their plan still draws the street their houses face, but no car drives it.
- The changes move streets and buildings, so the world's fingerprints change and saves from before are refused, as with any change to world generation.

## Done when

- `npm test` green, with a test that a roundabout is driven round its ring (one loop, one way, anticlockwise, nothing through the island) and one that the towns have depth: 90% of the housing blocks have streets of their own, under 12% of the houses stand over 30 m from a street, estates have 20 houses each or more, the capital's downtown blocks six buildings each or more with towers in tiers that never overhang or float, and the old towns' blocks are 52% built over or more.
