# 73 Cities with character: the ten largest cities each their own, the other fifty with a hint

On the branch of briefs 71 and 72 (PR #98), the third of the four map PRs. Owns the per-city character a map can state (`js/map-homeland.js`, read in `gen.js`), the places in the generator that honour it (`cities.js`, `buildings.js`), the sentence a city's panel opens with (`inspector.js`), and the map test's assertions on the ten largest cities.

## What the owner said

> "top tier cities"

The plan: each of the ten largest cities gets its own hand-chosen old-town core, district layout, landmarks and skyline; the other fifty get a style and a few hints; done when each big city looks different from the others at zoom 2 to 80.

## What was wrong

Every city on the map was its style and its template and nothing else. A European town's old town was one of the five real cores picked by a hash of its name, so the capital might be Lucca and a hill town Bologna. What a city lived on (`c.role`: offices, factories, warehouses, housing) was a die roll, so the steel town could come out as a commuter suburb and the port as a business city. Landmarks followed population thresholds alone, every skyline followed the one measured gradient, and fifty-one of the sixty-six cities were "a square grid with diagonal avenues" on the panel. Nothing told the player what Gatlin was that Kessock was not.

## What this brief does

1. **A map states a city's character.** On a city entry, beside its style and template: `core` (the real old town it is built on: `bologna`, `nuremberg`, `bruges`, `krakow`, `lucca`), `live` (what it lives on: `biz`, `ind`, `log`, `res`, `mix`), `old` (its old town's size against its style's, 0.6 to 1.5), `tall` (its skyline against the measured gradient, 0.6 to 1.3), `marks` (landmarks it must have, `"university"`, or must not, `"!stadium"`), `parks` (more of them) and `blurb` (one sentence for its panel). `gen.js` copies them onto the city after the styles are dealt; the editor's export keeps them, since it writes each city entry whole.
2. **The generator honours it.** `buildCity` takes the named core instead of the hashed one (and records which it used in `c.coreOf`), sizes the old town by `old`, takes `live` as the city's role before the dice, and adds the parks. `placeLandmarks` places a wanted landmark whatever the population and never a refused one. `blockPlan` scales the density gradient by `tall`, so a business city's towers rise higher and a university town stays under its spire.
3. **The ten largest, each its own.** Ashford: Bologna's arcaded old town, the capital's offices, a tall skyline, every landmark, three extra parks. Westhaven: the port, warehouses, tall. Ironbridge: the steel town turned business city, the tallest skyline, a university and a stadium. Fort Ashby: the garrison and arms town, factories, a small old town, no cathedral. Corbin: the motor works' business town. Gatlin: the gateway between river and ridge, a university on the bluff, no stadium. Southport: the second port, low. Halloway: Nuremberg's walled old town half again as big, housing and colleges, a cathedral and a university, nothing tall. Kessock: the market town of the dry basin, low. Fenwick: the aerospace new town, factories and a research university.
4. **The other fifty get hints.** Six coastal towns take the grid-on-the-water plan instead of the diagonal grid; the two European towns big enough for an old town of five blocks or more get a real core and a bigger old town (Krakow at Northfield, Bruges at Kerrow; a smaller town's old town is too small to carry one, so it keeps its style's); the mining, steel and arms towns live on industry, Selby by its air base on freight, the resort and the beach town on housing.
5. **The panel says it.** A city's inspector opens with the map's sentence, then what its districts make it and what it wants from an airport, as before.

## Worth knowing

- `core` only applies to European and industrial-style towns, which are the ones built on a real old town; an American grid city ignores it.
- `tall` scales both gradients (`P.g` for flats and old houses, `P.gt` for towers), clamped at 1.4 and 1.6, so no city grows past the tallest measured form.
- The map's `version` is not bumped for a change of character: the roads and the terrain stay where they are, and saves are protected by the world fingerprint.

## Done when

- `npm test` green, the map test asserting for the ten largest cities the map's blurb, what they live on, their named cores, their wanted and refused landmarks, ten different looks among them, a business city taller than the university town, and the smaller towns' hints taken.
- Screenshots looked at: each of the ten at the zoom that shows the whole city, and two close in.
