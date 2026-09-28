# 20 Height in the simulation, airspace classes and air traffic control

Wave 6. Needs wave 5 merged. Runs in parallel with 19, 21 and 22.

Iron Canopy is a management and strategy game, closer to an air traffic control game than to a flight simulator. Everything below is a game mechanic with simple, readable rules and made-up equipment. We want the right *feel*, not engineering accuracy.

## What the owner asked for

> "I'm unsure if altitude is modelled properly. Two things can be at the same spot on the map but tens of thousands of feet apart in height. We need that modelled, for air traffic and for the air defence."

> "That's where the player will really get into designing the airspace for an individual airport, with different shelves and corridors: class A, B, C, D, E, G. Uncontrolled can be general though."

The owner also asked for real air traffic control.

## What is there now

- Every flying object has a height in km (`t.alt`).
- The air defence checks whether a target's height is inside a system's band (`M.alt`).
- The interceptor tokens the defence fires (`S.missiles`) do not really change height: `m.alt` simply ramps from 0 to the target's height.
- `airspace.js` has fixes, airways, radar cover by height, control zones (`ctr`, `tma`) and controllers who keep flights apart. But airspace has no classes, no shelves and no vertical spacing rules.

## Goal

**1. Height matters everywhere on the map.**
- **Interceptors (air defence):**
  - The interceptor tokens follow a simple climb-and-descend curve to their meeting point, instead of a straight ramp.
  - They count as a hit only when they reach the target's height as well as its position. Two tokens at the same map point but far apart in height do not meet.
  - Each system's reach shrinks against targets that are very low or far away. Keep this as a small table per system, which the unit's panel shows as a side-view chart ("reaches 2–25 km up, out to 80 km").
- **Enemy tokens:** each type keeps a simple height profile that the player can learn: low and slow, high and fast, or a high arc. Most of this exists already; make it consistent and visible.
- **Radar:** radar keeps seeing by height, with the horizon and hills, as now.
- **Show height:**
  - Tags give flight level or feet for aircraft, and km for everything else.
  - A **side view** (vertical profile) opens for the selected track or airport and shows what is above what.
  - Objects stacked at one point on the map must read clearly as several objects at different heights.

**2. Airspace classes the player designs.** For each airport, the player shapes controlled airspace in 3D:
- a control zone from the ground up (class D, or C for busier airports);
- a terminal area built as shelves, like an upside-down wedding cake, where each ring has its own floor and ceiling (class C or B);
- corridors and airways: class A above a transition level, E below;
- everything else uncontrolled (G), kept simple;
- military areas: restricted and danger areas by height band, and an air defence zone by height band, so an air defence area can sit under a civil airway.

Classes mean something, in plain words on screen:
- who needs a clearance;
- whether radar and radio are required;
- speed limits below a level;
- how controllers keep traffic apart: 1,000 ft vertically or 5 nm sideways in radar cover, more without it;
- light aircraft flying by sight stay out unless cleared.

The editor:
- draw shelves on the map, with a side view to set floors and ceilings;
- presets per airport size: small field, regional, capital hub;
- a warning when a shelf is too low for the approaches, or too big for the controllers;
- costs: controllers per sector, and the radar needed.

**3. Real air traffic control.**
- Sectors with controllers (tower, approach, area), each with a workload that depends on traffic, class and radar.
- Controllers assign levels and step-climbs, and put arrivals in sequence with headings and speeds. They build holding stacks at different levels and hand flights from sector to sector.
- Standard arrival and departure lanes for each runway direction, which the player can draw or accept.
- The player can take a flight and give it a level, a heading or a hold, and can set sector rules.
- Losses of spacing are counted in 3D, each with a cause. Near misses depend on the design, the staffing and the radar.
- This links to task 15's runway rules: the approach sequence feeds the arrival gap.

## Scope

In:
- height profiles in `threats.js`;
- the interceptor path and the hit check in `defense.js` (only those parts);
- `airspace.js`, and routing, levels and ATC in `aviation.js` and `civil.js`;
- height tags and the side view: a new `render-airspace.js` and a new file for the side-view panel;
- the airport panel's Airspace tab, in its own function in `inspector.js`.

Out:
- The enemy's choices (19).
- Our aircraft and air combat (21). You provide the height and reach helpers they call; see below.
- The 3D replay (22).
- Runway rules (15, merged).

**Shared helpers for task 21:** early on, put the interceptor path and reach-table helpers in a new file (for example `iron-canopy/js/flight.js`, added to `index.html` and `headless.js`). Document them at the top and push, so task 21 can use them for its fighters' weapons.

## Performance

- The step stays well under 1 ms with 300 flights in the air and a raid.
- Spacing checks use a spatial grid, never all pairs.

## Done when

- `npm test` is green, with tests:
  - an interceptor token passing 8 km above or below a target does not count as a hit;
  - a long-reach system reaches less far against a low target, as its table says;
  - two airliners crossing at the same point 2,000 ft apart are not a loss of spacing, while 500 ft apart is;
  - a light aircraft stays out of a class C shelf unless cleared;
  - arrivals are sequenced, and held in a stack at different levels when the runway is busy;
  - an overloaded sector has more near misses than a well-staffed one;
  - the airspace presets are valid for the six-runway `'kden'` layout.
- Every Academy lesson still completes.
- The pull request has:
  - screenshots of a capital's airspace in plan and side view, an interception in side view, and a holding stack;
  - step times before and after;
  - what you could not finish.
