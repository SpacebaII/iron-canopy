# 74 Story places and the enemy's side: a registry of places by id, and Korvath's and Tessk's towns, sites and roads drawn by hand

On the branch of briefs 71 to 73 (PR #98), the last of the four map PRs. Owns the places a map names (`js/map-homeland.js`, read in `gen.js`), the registry that resolves them (`IC.placeOf`), the enemy's side as the map draws it (foreign towns, enemy sites and the roads between them, in `gen.js`), the editor's handles for them (`js/mapedit.js`), the event card's "show on the map" button (`ui.js`, `main.js`), and the map test's assertions on all of it.

## What the owner said

> "so story events can be scripted on fixed places"

The plan: the place registry handed to the Story thread with ids and roles, enemy sites and roads over the border placed by hand, and events able to point at a place; done when the Story thread's beats reference places by id and the enemy timeline run still balances.

## What was wrong

The map named sixteen places, but a place was only a point with a name: nothing said which city, site or crossing it was, so a story beat could show a point but not act on the thing. Station 9, which the story's lore puts on the Korvath side of the ridge, stood inside Veyland, and the wreck of Northline 310 was not on the map at all. Everything over the border was still rolled by the dice: Korvath's towns, its air bases, missile brigades and depots landed wherever the radial placement found room, and the road between them was a spanning tree, so the staging area behind Tarn Pass might stand behind Elk Pass in the next version of the map and no cutscene could name it.

## What this brief does

1. **A place stands for a thing.** A place entry takes `of`, the name or id of the city, site, crossing, enemy site or foreign town it is, and `abroad`, the neighbour whose soil it stands on. `IC.placeOf(S, id)` finds the place and, once, the thing itself (`p._ref`, a cache the save skips); `IC.placesOf(S, role)` lists them by role. A seeded world has no places and `IC.placeOf` answers null, so the Quick war and the Academy are untouched.
2. **The partition runs along the ridge.** Station 9 moves over the border onto Korvath's soil above Hollin; the wreck (`crash310`) lies on the ridge between it and the border; Hollin (`hollin`) is the market town under the ridge on our side, a city of 8,000 with its square; the Northern Area Centre is `area_centre`. A place drawn abroad does not pull the border out to itself, and is not moved onto dry ground at home.
3. **The enemy's side by hand.** A map may draw a neighbour's towns (`foreign`: name, people, `apt` for the one with the airport, `frontier` for a border town), its sites (`esites`: by country and kind, taken in the generator's order so each keeps the loadout the balance was tuned on) and the roads between them (`eroads`: pairs of names, which replace the spanning tree for that country). Korvath gets nine towns on the plateau (Senitz over Tarn Pass, Salik over Elk Pass, Eldan the capital with its airport and air base), its thirteen sites (the rocket artillery at the passes, the drone sites and depots behind them, the staging area behind Senitz, the strategic missile base and the hypersonic range far north) and twenty roads; Tessk nine towns (Orvmar over Bristow Gate, Ivra the capital), eight sites and seventeen roads. Places `senitz`, `eldan`, `eldan_ab`, `staging_a` and `ivra` point at them.
4. **The editor draws them.** Foreign towns, enemy sites and enemy roads are handles in `edit.html` (F, E and G add one at the cursor; a road is drawn between two names), drag like the rest, and the export keeps them.
5. **A card points at a place.** An event card with `at` (a point, or a function of the state) shows the name beside the clock, and a click flies the camera there; a story beat can pass `IC.placeOf(S, 'hollin')` as its `at`.

## Worth knowing

- The generator's site list is still the balance's: the map only says where each stands and what it is called. A map that draws fewer sites of a kind than the generator wants gets the rest rolled as before, flagged without `drawn`.
- Enemy roads are drawn between things by name, and anything with no road (the strategic missile base, the hypersonic range) is left out as before; the map test checks every other site and town is reached from its country's staging area.
- `IC.placeOf` takes a state or a world, so the generator's tests and the game's code call it the same way.

## Done when

- `npm test` green, the map test asserting the towns, sites and roads where the map draws them and on their own soil, every site drawn, every site and town reached by road from its staging area, Station 9 and the wreck over the border and the town at home, every place with `of` resolving to its thing, and a limited strike on the capital in a Career on the map flying from the drawn sites and ending with a result.
- The Story thread told the ids (`station9`, `crash310`, `hollin`, `area_centre`, `senitz`, `eldan`, `eldan_ab`, `staging_a`, `ivra`, and the sixteen before them).
