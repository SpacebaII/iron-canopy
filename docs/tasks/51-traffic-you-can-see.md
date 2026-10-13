# 51 Traffic you can see: streets that carry what a city of that size would

Wave 16, on its own branch (`wave16/traffic-you-can-see`), beside the open wave 15 work and touching none of its files. Owns how full the roads are (`assign` in `traffic.js`), the vehicles close in (`IC.trafficAgents`), and the traffic tests. Start from `origin/main`.

## What the owner said

> "Is there a way to make traffic actually good and like road generation? Every time it has been bad still."

## Why the last three attempts did not fix it

Three briefs have been at this: 18 (cheap, lifelike vehicles), 30 (roads through towns, traffic on the city's own streets) and 46 (junctions drawn as one surface). Each delivered what it set out to, and the roads close in are now drawn properly. Traffic still looked bad for one reason none of them touched.

- **The loads were scaled to the busiest link.** Trips follow shortest paths, so a city's flows pile onto a few avenues and leave most streets with a hundredth of the busiest one. `assign` then scaled every class so that its 95th-percentile link sat at "full" (`TOP`), which left the median street in the capital at 0.1 of full and 212 of its 1,789 streets at exactly zero. Measured on `main` for a capital of 1.9 million people at 08:10: 606 vehicles implied over 605 km of streets, one car to the kilometre, and `IC.TRAFFIC_SHOW` then drew half of those. A city of two million cannot read as busy from that, whatever the drawing does.
- **"Full" was the same in a village and in the capital.** The scaling ran class by class per city, so the busiest street of a town of 40,000 was as full as the capital's.
- **The densities were low to begin with.** A street at load 1 showed one car to the 140 m, an avenue one to the 67 m a lane. Real heavy traffic runs at a car every 30–50 m a lane.
- Brief 30 halved the count (`IC.TRAFFIC_SHOW = 0.5`) because the vehicles all sat on the through roads. The problem was concentration, not count; halving it made the streets emptier still.

## What this brief does

1. **An absolute scale.** The flows are still assigned as before (they feed growth, supply and the cut-road queues), then turned into loads in `IC.TRAFFIC_LOAD`: the busiest links of each class keep their place at `TOP`, and the quiet ones are pulled up towards them by a root (`gamma`: a link at 1% of the busiest reads a sixth of it, not a hundredth), so the ranking stays and the long tail no longer reads as empty.
2. **Every street carries its residents.** A floor per class on city streets (`floor`: a street never below 0.12 of full, an avenue 0.25, a ring road 0.3, scaled by the town's size). No street in a town is dead.
3. **A town is quieter than the capital.** The city's size scales its loads (`fullPop` 500,000 at full, down to `minSize` 0.4 for a village), so a village street is a village street.
4. **Densities that look like traffic.** `CLS.dens` roughly doubled (a street at full: one car to the 80 m; an avenue: one to the 40 m a lane), `IC.TRAFFIC_SHOW` back up to 0.8, and the cap on vehicles close in (`AG_MAX`) 900 → 1,600, which the frame budget test still passes with room (0.8 ms for 1,260 vehicles).
5. **Turning traffic follows the busy roads harder.** Close in a vehicle picks its next road by load to the power 1.5, so an avenue at half load takes most of the turning traffic from a side street at a tenth.

Measured after, same capital, 08:10: median street at 0.19 of full, median avenue 0.24, no street at zero, one avenue in twelve jammed; 3,500 vehicles implied where there were 600. In a 3.6 × 2.2 km window at street zoom: 190 vehicles where there were 84.

## What it does not do, and what a real fix of "road generation" takes

The roads themselves (brief 46) are fine where they meet. What still looks wrong in a city is the **fabric**: every city is one lattice (`IC.cityFrame`), bent by noise, and every road that is not on the lattice (a radial high road, a national road, the ring) cuts straight across it, slicing blocks into slivers. Real cities are not one grid: the fabric turns to follow each old road, and a grid city's ring is a loop of its own avenues. That is a direction field, not a lattice: each cell takes its street direction from the nearest arterial (radial or national road) and blends to the city's grid away from them, so the blocks along a high road front it, and the grid runs between the radials. It touches `cityFrame`, the block placement, the street lines, growth (`growth.js` places new blocks in lattice cells) and the tiles, so it is a wave of its own (brief 52), not a fix inside this one. The second thing that reads as "bad roads" is suburbs drawn as empty cells at the region zoom (cul-de-sac lots with a few tiny houses), which is a drawing job in `terrain.js`.

## Done when

- `npm test` is green, with a new test: in the capital at 08:00 every street carries something, the median street is above 0.12 of full and the median avenue above 0.2, at most one avenue in eight is jammed, and a small town's median street is quieter than the capital's.
- The pull request has before and after pictures of the capital at zooms 5, 15, 40 and 80 and of two other cities, from the same seed, at 08:10.
