# 20 Altitude everywhere, airspace classes and real air traffic control

Wave 6. **Claude Fable 5.1.** Needs wave 5 (16, 17, 18) merged. Runs in parallel with 19, 21 and 22.

## What the owner asked for

> "I'm unsure if altitude is modelled properly. A missile can be directly where the other missile is, but it might be tens of thousands of feet different in altitude. We need that modelled for the missiles and also air traffic."

> "That's where the player will really get into making airspaces for an individual airport, and different shelves or corridors: class A, B, C, D, E, G. Uncontrolled can be general though."

Earlier the owner also asked for "real air traffic control" to be built on Fable.

## What is there now

- Threats have an altitude in km (`t.alt`), set by simple profiles in `threats.js`.
- Engagement checks the target's altitude against a missile's band (`M.alt`), and the kill check (`defense.js`) uses the 3D miss distance.
- **Our missiles do not really fly in 3D:** `m.alt` is a straight line from 0 to the aim point.
- Airliners and light aircraft have altitudes. `airspace.js` has fixes, airways, radar cover by altitude, control zones (`ctr`, `tma`) and controllers who keep flights apart. But **airspace has no classes, no shelves and no vertical separation rules.**

## Goal

**1. Altitude is real for everything that flies.**
- Our missiles fly a 3D path:
  - boost, climb or loft, then glide or dive to the intercept;
  - speed and turning lost with altitude and time;
  - the altitude of the intercept point matters.
- A missile that passes over a cruise missile 8 km above it misses. Proximity fuzes work on 3D distance.
- Enemy weapons fly believable profiles:
  - cruise missiles terrain-following, pop-up at the end;
  - drones low and slow;
  - ballistic arcs;
  - glide vehicles that pull up and dive.
- Radar sees by altitude, as now with the horizon and hills. A launcher's reach depends on target altitude: a table per munition that the player can see in the unit's panel as a side view of its envelope.
- **Show altitude:**
  - tags give flight level or height in feet for aircraft, km for missiles;
  - a side view (vertical profile) opens for the selected track or airport, showing what is above what;
  - a stack of tracks at one point on the map must be clearly several objects at different heights.

**2. Airspace classes the player designs.** For each airport, the player shapes controlled airspace in 3D:
- a control zone from the surface up (class D, or C for busier airports);
- a terminal area as shelves stacked like a wedding cake: each ring has its own floor and ceiling (class C or B);
- corridors and airways (class A above a transition level, E below);
- everything else is uncontrolled (G), kept general.
- Military areas: restricted and danger areas by altitude band, and air defence engagement zones by altitude, so a SAM zone can sit under a civil airway.

Classes mean something, in plain words on screen:
- who needs a clearance;
- radar and radio required;
- speed limits below a level;
- how controllers separate traffic (vertical 1,000 ft or horizontal 5 nm in radar cover, wider without it);
- light aircraft (flying by sight) stay out unless cleared.

**Editor:**
- Draw shelves on the map, with a side view to set floors and ceilings.
- Presets per airport size: small field, regional, capital hub.
- A warning when a shelf is too low for the approaches, or too big for the controllers.
- Costs: controllers per sector, radar needed.

**3. Real air traffic control:**
- Sectors with controllers: tower, approach, area. Each has a workload that depends on traffic, class and radar.
- Controllers assign levels and make aircraft step-climb. They vector and speed-control arrivals into a sequence, build holding stacks at levels, and hand flights from sector to sector.
- Standard arrival and departure lanes per runway direction, which the player can draw or accept.
- The player can take a flight and give it a level, heading or hold, and set sector rules.
- Losses of separation are counted in 3D, with a cause. The number of near misses depends on design, staffing and radar.
- Link to task 15's runway rules: the approach sequence feeds the arrival gap.

## Scope

In:
- the flight profiles and altitude in `threats.js`;
- missile flight and the 3D kill check in `defense.js`, only those parts;
- `airspace.js`, and routing, levels and ATC in `aviation.js` and `civil.js`;
- altitude tags and the side view: a new file `render-airspace.js` and a new file for the side-view panel;
- the airport panel's Airspace tab, in its own function in `inspector.js`.

Out:
- The enemy's choices (19), our aircraft and air combat (21, though you provide the 3D flight and envelope code they call), the 3D replay (22), runway rules (15, merged).

## Performance

- The step stays well under 1 ms with 300 flights in the air and a raid.
- Separation checks use a spatial grid, never all pairs.

## Done when

- `npm test` is green, with tests:
  - a missile passing a target 8 km above or below it misses;
  - a long-range missile climbs and loses reach against a low target far out, as its envelope table says;
  - two airliners on crossing airways at the same point but 2,000 ft apart are not a loss of separation, while 500 ft apart is;
  - a light aircraft stays out of a class C shelf unless cleared;
  - arrivals are sequenced and held in a stack at different levels when the runway is busy;
  - an overloaded sector produces more near misses than a well-staffed one;
  - the airspace editor's presets are valid for the six-runway `'kden'` layout.
- Every Academy lesson still completes.
- The pull request has:
  - screenshots of a capital's airspace in plan and side view, a missile intercept in side view, and a holding stack;
  - before and after step times;
  - what you could not finish.
