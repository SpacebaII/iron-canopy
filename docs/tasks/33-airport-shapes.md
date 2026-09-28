# 33 Build any airport: real shapes, real layouts, cosmetics

Wave 9. Builds on 23 (airport life) and 32 (the calendar, which also touches `builder.js` for construction stages: start after it merges, or merge its branch in early).

## What the owner said

> "With the airport building, a good spot to likely be in is some circular shapes, like terminals, or just some cosmetics for the airport that less so cost money but allow for, like, the KDEN terminal structure. Look at airports across cities and countries: I want the ability to reconstruct them pretty close. This does not mean for free, but the complex shapes and operations should be available."

## What is there now

- Parts are rectangles: runway, taxiway, apron, terminal, hangar, shelters, fuel, tower and so on. The pier tool lays a straight concourse between two clicks.
- `IC.layoutAirport(…, 'kden')` builds a six-runway Denver-like layout in code. The player cannot draw one like it.

## Goal

A player should be able to rebuild a real airport's layout closely, at its real scale, and have it work. Study real plans and make sure each can be built:

| Airport | What it needs |
| --- | --- |
| Denver (KDEN) | the tent-roofed landside terminal, midfield concourses A/B/C linked by an underground train, a bridge over a taxiway |
| Atlanta (KATL) | parallel midfield concourses, an end-around taxiway |
| Paris CDG T1 | the round terminal with satellites linked by tubes |
| Paris CDG T2 | the curved terminals |
| Dallas (KDFW) | the semicircular terminals |
| Heathrow (EGLL) | the pier and satellite terminals |
| Dubai (OMDB) | the long concourses |
| Orlando (KMCO) | the landside hub with airside satellites and a people mover |
| Tampa (KTPA) | the round satellites |

**Shapes (they cost what they are made of, as now):**
- Terminals and piers as polygons, arcs, circles and rotundas, not only rectangles.
- A pier can bend and branch: Y, T and X shapes, and a satellite at its end.
- Aprons can follow a curved or round terminal. Stands lay out along any edge, fanning round a rotunda. Jet bridges reach the stand's door.
- Taxiways already take curves. Add:
  - taxilanes that follow a curved apron edge;
  - dual taxilanes;
  - end-around taxiways;
  - de-icing pads;
  - holding pads.
- Tools: draw a polygon, an arc and a circle; rotate, copy and mirror; snap to runways, taxiways and each other (as `IC.aptSnap` does). Everything shows its real size as it is drawn.

**Operations that go with the shapes:**
- **People movers and tunnels** between a landside terminal and airside concourses.
  - They set how long a connection takes (`aptStats` counts it) and cost to build and run.
  - A concourse with no link loses passengers to the walk or the bus.
- **Airside bridges and tunnels** where a taxiway passes under a passenger bridge (Denver, Frankfurt). They are checked for the largest aircraft that fits.
- **Landside stays generated** (23) but follows the terminal's shape: its kerb, the car parks and the access road hug a curved or round terminal.
- Nothing here gets around the rules: zones, stand sizes, clearances, the tower's view and fire-truck reach apply to every shape.

**Cosmetics (cheap, no effect on capacity):**
- Roof styles and colours, including tent roofs like Denver's, glass and canopies. Also landscaping, water features, public art, lighting, signage and the airport's name on the terminal.
- Control tower styles.
- They cost little (a few ₭M) and add a small, capped bonus to the airport's name with passengers and airlines. They never change capacity.

**Blueprints:**
- The player can save any layout, or part of one, as a blueprint and place it again: rotated, mirrored, and paid for normally.
- A small library of blueprints inspired by real airports, under their own fictional names. Each is a starting point the player pays for, and it must fit the site's terrain and runways.

## Scope

- `airport.js`: shapes, stands along any edge, the graph around curved parts.
- `builder.js`: tools, blueprints and prices.
- `render-airport.js`: drawing shapes and cosmetics at real size, from the whole map to the gate.
- `landside.js`: following shapes.
- `models.js`: 3D shapes for the replay window if cheap; otherwise later.

## Done when

- `npm test` is green, with tests:
  - a round terminal gets stands all round it, and aircraft taxi to and from them;
  - a Y-shaped pier's stands are all reachable;
  - a people mover shortens a connection, and removing it lengthens it;
  - a taxiway under an airside bridge refuses aircraft that are too tall;
  - cosmetics change the look and the name bonus, never capacity;
  - a blueprint placed rotated and mirrored works like the original;
  - a Denver-like layout built with the player's tools (not `layoutKden`) runs a day of traffic without gridlock.
- Performance: 60 fps with a large, complex airport on screen; the step within budget with 150 aircraft moving.
- The pull request has:
  - screenshots of four real airports rebuilt with the tools next to their real plans;
  - the tools in use;
  - cosmetics before and after;
  - frame and step times.
