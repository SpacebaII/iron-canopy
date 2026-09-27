# 02 Airport simulation core

## What the owner asked for

> "The level of building complexity I want: the player should be able to remake KDEN, not easily, but with enough thought and care, and even bigger. To do that the systems need to be overhauled."
> "Work on the AI so the paths planes take on the ground…"
> "Establish a reason to have crosswind runways. Plane crashes should be able to happen."
> "Make airports service different things, so one side might be mainly civilian, the other side might host military, and make things like capacity make sense."

## Goal

Denver International (KDEN) has six runways in two directions, three concourses, de-icing pads and well over a hundred gates. An airport of that size and complexity must work in the simulation, at 60 fps. Aircraft must find sensible routes on the ground. Wind, weather and layout must create real reasons for design choices, and failures must have causes the player can see.

## Scope

In: `airport.js`, `groundops.js`, `aviation-data.js`, `weather.js` (wind), and drawing of any new part types in `render-airport.js`.

Out: the builder's controls and feel (task 04 builds on your model), airlines' business (`aviation.js`, except the hooks you need), the story.

Keep the functions other files call working, or update every caller:
- `IC.bases`, `IC.baseStatus`, `IC.canLaunch`, `IC.fallbackBase`, `IC.assignSlots`, `IC.parkPos`, `IC.baseHit`;
- `IC.aptStats`, `IC.aptCanTake`, `IC.gopsDepart`, `IC.gopsLand`, `IC.gopsFaf`, `IC.milDepart`, `IC.milApproach`.

## Design notes

- **Scale:** graphs of about 2,000 nodes, 200 stands and 6 runways. Use a binary-heap Dijkstra (or A*), cache routes, and rebuild only what changed when parts are added or damaged.
- **Runways:**
  - **Several runways at once, in configurations chosen by wind** (for example "north flow": arrivals on 34L/35R, departures on 34R/35L).
  - **Mixed or segregated use.**
  - **Crossings:** hold short, then cross when cleared.
  - **Parallel runways:** closely spaced ones cannot run independent approaches (under about 760 m apart they are dependent).
  - **Intersecting runways** depend on each other.
  - Show the active configuration in the airport panel.
- **Wind:**
  - Replace the smoke-drift `S.wind` with real wind: direction, speed in knots and gusts, changing with the weather.
  - Each aircraft type gets crosswind and tailwind limits, for example light aircraft 15 kt, turboprop 25, narrow-body 33, wide-body 38.
  - A runway is usable for a type only while the components are within its limits. A single-runway airport therefore closes to some aircraft on windy days, which is the reason for a crosswind runway.
- **Visibility:** low cloud and fog need an instrument landing system. Add ILS as a part per runway end; without it arrivals divert in poor visibility.
- **Ground routing:**
  - Plan taxi routes so opposite-direction traffic on single taxiways is avoided in advance (time reservations), rather than towing aircraft out of a jam.
  - Respect hold-short points.
  - Let the player mark taxiways one-way and mark a standard taxi flow; aircraft should prefer them.
  - Pushbacks must not block apron lanes for everyone.
- **Zones:** every part and stand belongs to a zone: civil, cargo, light aircraft or military. Civil aircraft never park in the military zone and the reverse. Military movements share runways with priority rules. The panel shows capacity per zone.
- **Capacity that makes sense:**
  - Runway movements per hour from configuration and separation.
  - Stands by size.
  - Gates with jet bridges versus remote stands served by bus (slower turnaround).
  - Terminal passengers per hour.
  - Fuel by tank farm, or by hydrant system for large airports.
  - Every number the panel shows must match what the simulation actually does.
- **Crashes and incidents:**
  - Rare, and always with a cause tied to the player's decisions:
    - a landing in gusts near the crosswind limit;
    - a runway incursion at a complex crossing with no ground radar;
    - an overrun on a short or wet runway;
    - a bird strike near water.
  - How bad it is depends on fire and rescue cover (station distance and response time).
  - Consequences: the runway closes, casualties, an investigation card that states the cause in plain words, and damage to the Prime Minister's confidence (`S.story.standing`).
  - With a sound layout and normal operations, crashes should almost never happen.
- **A KDEN-scale layout:** add a template (for example `'kden'`) that builds a six-runway pinwheel airport with concourses. It serves as a test and as proof that the model scales.

## Done when

- `npm test` is green, and new tests show:
  - the KDEN-scale template handles its rated movements per hour for two game hours without gridlock or stuck aircraft;
  - a crosswind beyond the limit closes a runway to a type, and a second runway orientation keeps the airport open;
  - fog without ILS causes diversions, and ILS prevents them;
  - zones are respected;
  - crash probability stays at zero in normal operations and rises only when operating beyond limits;
  - a simulation step with 150 aircraft moving stays within budget.
- Screenshots of the KDEN-scale airport at full zoom-out and close in, busy, day and night.
- The pull request says what changed, the performance numbers, and what you could not finish.
