# 67 Streets a car can follow

On the branch of briefs 65 and 66. Owns the road audit (`IC.roadAudit` in `traffic.js`, `tools/road-audit.js`), the last passes over a city's streets in `cities.js` (`tidyStreets`, then `roundCorners` with `weldEnds`, `unOverlap` and `joinEnds`), a village street that runs on past the end of its road (`streetOf` in `village.js`), and the drive graph's merging of junction points under a metre apart (`buildGraph` in `traffic.js`).

## What the owner said

> "you see the obvious issue of it just not connecting and looking rough all around fix that idk if that's more so to do with the generation or what but that needs to be corrected and a good way to force it to be correct is to be able to have a car seamlessly follow the street in a particular lane and once it can go that right that's how we'll know if we are in a good spot too many roads lead nowhere or make. No sense and end weird and can only for 1 car that should not be the case"

## What this brief does

1. **An audit that drives the network** (`IC.roadAudit(W, G)`, `node tools/road-audit.js [seed] [--list=kind]`). It reads the drive graph as a car in its lane would and counts six faults: an end that leads nowhere and was not meant to (`open`), an end that stops a few metres short of another road (`gap`), a dead end under 30 m (`stub`), a piece under 12 m between two junctions, too short for two cars (`jog`), a bend over 60° within 15 m (`kink`), and a one-way link a car can get onto but not off (`trap`).
2. **Ends meet, or turn round** (`tidyStreets`). A street that ends a few metres from a junction on the street it meets moves onto that junction, so two T junctions side by side are one crossroads; an end that stops just short of a street runs on to it; a piece left dangling past its last junction goes back to that junction. Turning heads that are long enough stay.
3. **A junction is one place** (`weldEnds`, `unOverlap`). Street ends a few metres apart meet at one point, on the street they meet if one of them sits on one; a street whose last piece runs on top of another (two mapped ways of a real old town sharing a few metres) ends where it meets it. The drive graph takes junction points under a metre apart as one node, and only those: a curve's own points stay apart.
4. **Bends are curves** (`roundCorners`, `joinEnds`). A corner that is not a junction becomes an arc of about 15 m radius (less where the pieces either side are short); two streets meeting end to end with nothing else there are one street round the corner, or, when they change class there, keep apart with the corner rounded between them; a street that folds back on itself loses the fold, unless another street ends on it.
5. **A village street runs on along its road.** Where a road ends at a village, the village street carries on in the road's own direction, not at whatever angle the last few metres gave.
6. **Estates' closes** start exactly on their loop (`closeStreets`), and a close too short to turn in is not built.

On the 4242 map, before and after:

| Fault | Before | After |
| --- | --- | --- |
| Pieces too short for two cars (`jog`) | 9,462 | 1,412 |
| Bends a car cannot follow (`kink`) | 3,633 | 675 |
| Ends just short of a road (`gap`) | 3,214 | 94 |
| Dead ends under 30 m (`stub`) | 1,405 | 24 |
| Ends that lead nowhere (`open`) | 13 | 17 |
| One-way traps (`trap`) | 0 | 0 |

## Worth knowing

- What is left is mostly in the real old towns, whose mapped streets meet at staggered junctions a few metres apart (real ones do too), and in the village lanes, which cross each other a few metres from where one leaves a road.
- The roundabouts are still one node in the drive graph: the vehicles drawn there go round the ring, but a line drawn along the graph crosses the island.
- The passes cost about 1.5 s of generation (10.0 s against 8.3 s here); the generation budget is 17 s, since GitHub's machines measured 15.6 s.
- The changes move streets, so the world's fingerprints change and saves from before are refused, as with any change to world generation.

## Done when

- `npm test` green, with a test that drives the 4242 and 7 maps through the audit: no traps, under 40 ends that lead nowhere, 200 short of a road and 80 dead ends under 30 m, pieces too short for two cars on under 2.5% of the links and bends a car cannot follow on under 1.2% (before this brief: 11% and 4%).
