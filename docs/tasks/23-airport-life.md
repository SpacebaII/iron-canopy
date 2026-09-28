# 23 Airports that look and work like airports

Wave 7 (regular session). Runs alongside wave 6 and task 24.

## What the owner said after playing

> "This feels a bit unpolished. I like the snapping, but we need to polish it: building items should snap to taxiways, and the flooring should make sense. We might need to scale up some items or increase the zoom, because you can barely see the facilities at this airport and the ones you do see feel meaningless."

> "An apron should be a bit more flexible than it is now, and you should be able to place stands within it. The terminal needs some work: it should not just be a building placed down with no interaction. It should connect planes to passengers, cargo, etc. The planes should also go places to refuel, maintenance, etc. A couple of movements at the airport before taking off shouldn't be unheard of."

> "Set up automatically a connection road between an airport and a city in range, as well as computer-generated things like parking garages and other lively things, and a texture tool."

> "Airports shouldn't be limited in size as such; rework that system. It causes issues, like when I'd put a radar or beacon in the middle of the airport and can't."

> "Lock things like building materials and some items behind research, as part of game progression."

> "This radar is way too big: scaling it down, or zoom with better textures, will be pivotal."

## Goal

The player's airport should read at a glance like a real one, and every part should visibly do a job.

**1. Building that fits together.**
- Buildings (terminal, hangar, fire station, tower, fuel farm, cargo shed) snap to a taxiway or apron edge. They face it and get a short connector, so nothing floats in the grass.
- Paved surfaces join cleanly: fillets, shoulders and apron edges line up; there are no gaps or overlaps between pieces.
- **Aprons are free-form areas.** The player paints or stretches them, then places stands inside them (size S/M/L, contact or remote, nose-in or drive-through). Automatic stand layout stays as an option.
- **The airport boundary grows with what is built**, instead of being a fixed size. Anything that belongs on an airfield (radar, beacon, landing system, fuel) can be placed inside it. Keep the zone rules (civil, military, cargo, light aircraft).

**2. The airport works, and you can see it.**
- **Terminal:** passengers flow between the terminal and aircraft. Contact stands use jet bridges; remote stands use buses that you see driving. A terminal has gates and capacity, and a full terminal slows boarding.
- **Cargo:** a cargo shed and cargo stands; lorries you see loading freighters.
- **Services:** before a departure or after an arrival, aircraft may taxi to fuel (or have a fuel truck drive to them), to a hangar for maintenance, or to a de-icing pad, and are sometimes towed. Two or three movements on the ground before take-off are normal.
- **Hangars:** they hold aircraft that stay for days (maintenance, night stops, based aircraft). An airline with based aircraft needs hangar space.
- Every building's panel says what it does right now, with numbers: "Fuel farm: 6 trucks, 4 aircraft waiting, 12 min average".

**3. Scale and readability.**
- Revisit the sizes of everything drawn at the airport so facilities are visible at a sensible zoom. That may mean a closer maximum zoom, better textures on pavement, grass and roofs, and outlines.
- The radar and other symbols that are too big at airport zoom shrink to their real footprint close in. Symbols stay for the far view.
- A **surface tool** paints ground textures: grass, gravel, concrete, asphalt and landscaping, for looks and for cheap areas such as car parks.

**4. Landside, generated.**
- When an airport opens, an access road to the nearest city in reach is laid automatically, and the player sees it and its cost. The road tool still lets the player add more.
- As traffic grows, the airport generates landside life by itself: car parks and parking garages, a rental and taxi area, a rail or bus stop, hotels and offices near the terminal, and cargo warehouses by the cargo apron. These grow with passengers and cargo. They cost nothing up front and pay a small income.

**5. Progression by research.**
- Advanced materials (reinforced concrete, hydrant fuel systems, ground radar, landing systems of higher categories, jet bridges) unlock through research, so the player starts simple.
- The Research room says which airport items each research opens.

## Scope

In:
- `builder.js`, `airport.js`, `render-airport.js`;
- the service moves in `groundops.js`;
- landside generation (a new file, `landside.js`);
- the research entries for airport items in `logistics.js`, where research lives (research only);
- the airport panel's Build and Overview tabs in `inspector.js`, in their own functions.

Out:
- Airspace and ATC (task 20).
- Airlines, contracts and the Career's money and pacing (task 24).
- The enemy (19), the air war (21), the replay (22).

## Done when

- `npm test` is green, with tests:
  - a hangar placed near a taxiway snaps to it and connects;
  - a free-form apron takes stands placed by hand, and aircraft use them;
  - an arrival at a remote stand gets a bus, and one at a contact stand a jet bridge;
  - a departure can visit fuel and then the runway, with the moves counted;
  - an aircraft stays days in a hangar for maintenance;
  - a new airport gets an access road to its city;
  - a radar can be placed inside the airport boundary;
  - a locked material cannot be chosen until its research is done.
- Every Academy lesson still completes, and the Career's scripted player still plays through Act I.
- The pull request has before-and-after screenshots of the owner's airport view (a small international airport close in), the apron and stand editor, a busy terminal with buses, and the landside; plus what you could not finish.
