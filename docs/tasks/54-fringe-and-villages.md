# 54 The fringe, the suburbs and the villages

Wave 16, the third of the audit's plan (`52-roads-and-towns-audit.md`, items C4, C3, E1, A3 and F2), on its own branch (`wave16/fringe`, from `wave16/city-fabric`). Owns what lies between a city's last block and the fields (`c.fringe`, built in `fringe.js`), what a suburb looks like at every zoom, the plan of a village (`village.js`, `v.plan`) and what grows round an airport (`growth.js`).

## What the owner said

> "nice natural looking streets and cities with depth and ... a good amount of variety in the cities from roads, buildings, highway interchanges etc. including access roads to airports"

## What was wrong

A city was an island on the field quilt: the blocks stopped on a line and the fields began at once (C4). Its suburbs read as empty at the town zoom, a thin street net over green with a few tiny houses (C3). A village was thirty boxes thrown either side of its road, no plots, no lane, no green, no church, and one straddled its river with no bridge to see (E1, A3). Nothing grew round an airport (F2).

## What this brief does

1. **Villages have a plan** (`IC.buildVillage(W, v, R, segs)` in `village.js`, kept in `v.plan`). Three forms by size and chance: a *street village* (houses on plots fronting the road on both sides for 300–600 m, a farm with its yard at each end), a *green village* (a green at the road with the houses and the church round it, the street running on), a *crossroads hamlet* (a few houses at the junction of two lanes). Every village has one to three lanes off its street (100–300 m, `W.lanes`, so the traffic drives them) with a few houses on them, hedged gardens behind the houses (`v.plan.plots`, painted in the tiles), a church with its yard in the bigger ones (`v.plan.church`), and a farm or two on the lanes outside. A village by a river sits on one bank, its houses 60 m clear of the water.
2. **Suburbs read as suburbs** (C3). In the tiles at the town zoom (lod 1–2) a suburb block is painted as built ground, a warm texture of roofs and gardens with its own closes, so the outer town reads as houses, not fields with lines on them; at the street zoom (lod 3–4) the houses stand on plots with hedges, a drive each and a garden behind. Suburb blocks with the `cul` form carry their close as a real street (`c.streets`, a stub from the block's street into it ending in a turning head), so the traffic and the junction drawing see it.
3. **The fringe** (C4, `IC.buildFringe(W, c, R)` in `fringe.js`, kept in `c.fringe`). Ribbon development along each road out of town: house plots fronting the road for 500–1,500 m beyond the last block, thinning out, with a petrol station, a car dealer or a garden centre among them. An outer ring in the open ground round the town, placed where nothing stands: allotments, playing fields, a cemetery, a sewage works, a water tower, a scrapyard, a riding school; a retail park (sheds with a car park) at the first motorway junction out of a big city; one or two outlying estates (a close of houses off a road out). Fringe items are painted in the tiles from the region zoom (lod 1) and close in with their own look; the houses among them are blocks of the city (`d: 'sub'`), so they count for traffic and can be hit.
4. **Round an airport** (F2, `growth.js`): an airport's access road gathers a petrol station and a hotel at 2,000 passengers a day, a logistics park at 6,000, and a business park at its motorway junction at 15,000 (`ap.land.outer`, placed by `IC.aptOuter`, painted like the fringe).

## Done when

- `npm test` green, with tests that a village has a street with houses fronting it on both sides, a lane off it and a church when big enough, and none of its houses in the water or on a road (`world: villages have a plan...`); that every city has ribbon houses along its roads out and outer items in open ground, none on water, a road or another block (`world: a city has a fringe...`); that suburb closes end in a head on the block's street (`world: suburb closes...`).
- Generation stays under the time budget (9 s).
- Before and after pictures from seed 4242 in `54-screens/`: a village at z 20, Halenn's and Holitz's edges at z 12 and z 25, an airport's access road at z 15.

## What it does not do

Buildings with depth, pavements and parked cars (55); junction footprints and the linear city's spine (56); the countryside's texture and the enemy's towns (57).
