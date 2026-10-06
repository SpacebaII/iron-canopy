# 47 Building airports: a QA audit of construction

Wave 11, after 45 (airport polish) has merged. Owns the same files as 45: `builder.js`, `airport.js`, `render-airport.js`, `inspector.js`, `main.js`, plus `buildbar.js`, `ui.js` (the build hints), `pavement.js` / `render-pavement.js` where joins are drawn, `models-airport.js` and `replay3d.js` only for the tower, fuel farm and fire station in 3D, and the Career's build instructions in `story.js` and `academy.js`. Start from `origin/main`.

## What the owner said

> "there is still constuction issues like ramps starting not on the same plane as the taxi way coming off at like a 45 degree angle aswell as we need to make the fuel and fire feel more meaningful not just a small item I think they should apear much bigger along with the control tower I feel like a player can feel as if nothing is meaning anything as the same acts like like nothing is possible until are are pre recs are meant and it never allows them to see a problem and contruction ran into the double click issue again try to just change how that works I think it's bad desgin but yeah we need a large QA audit on construction for airports."

## Goal

**1. Ramps start flush with the taxiway.** An apron or ramp drawn off a taxiway must start on the taxiway's line and square to it, sharing its edge. Today it starts at about 45 degrees, off the taxiway's line.
- Find why (the snap in `IC.aptSnap` / `aptPlanPart`, the way the apron's first edge is oriented, or the join drawing) and fix the cause, not the picture.
- Check every way of making one: apron from a taxiway, apron from an apron edge (Stretch), remote apron, cargo and GA ramps, holding bays and de-icing pads, at taxiways that run north–south, east–west and at an angle.
- A test per case: the apron's edge is parallel to the taxiway it starts from (within 2°) and touches it.

**2. Fuel, fire and the tower that look like what they are, and matter.**
- **Real, imposing size.** Today a fuel tank is 13 m across, the fire station 28 × 20 m and the tower a 14 m square. A real fuel farm is several tanks of 20–40 m each inside a bund, with a truck loading rack and a lorry park; a crash fire station has three to six bays, an apron in front and a training ground; a tower stands 40–90 m tall with a cab wider than its shaft. Draw them at that size on the 2D map (with shadows that show height) and in 3D (`models-airport.js`): the tower must be visible from across the airport.
- **Visible function.** Fuel trucks drive from the farm to the stands they serve and back; the farm's tanks show how full they are. Fire tenders sit in their bays and drive out, lights on, to an accident or a drill, and the time they take is shown. The tower's cab lights up and the panel says how many movements it is handling.
- **Felt in play.** Say in the airport panel and at the moment it matters what each one does: "Departures waited 14 min for fuel today: one tank's trucks serve 8 aircraft an hour", "Fire trucks reach runway 09R in 4 min 10 s: heavy jets may not land", "Without a tower: one movement every 8 min". Their prices and footprints follow the new size (change `IC.APART` deliberately and note it in CLAUDE.md's balance section).

**3. Let the player build it wrong, and show the consequence.** Today much is refused until its prerequisites exist, so the player never sees a problem. Change that:
- Allow what is physically possible: an apron with no taxiway to it, exits before a parallel taxiway, a stand where nothing can reach, a runway with no fire cover, a tower with no view of a runway.
- Keep refusing only what cannot exist: overlapping parts, water, outside the site, not enough money for the first stage, research not done.
- Show the problem in plain words at once (on the ghost while placing, and in `IC.aptStats`'s warnings once built) and let the simulation carry it out: no aircraft reach the stand, heavy jets divert for lack of fire cover, departures wait for fuel. Each warning says what to build to fix it.
- Update the Career's chapter instructions (`story.js`) and the Academy lessons where they assume the old refusals. All eight Academy lessons must stay completable.

**4. Replace "click the same spot again to build".** The owner finds it bad design (`builder.js` around "a building: one click places it, a second on the same spot builds it", runways, parallel taxiways, exits, holding bays, Stretch and founding an airport all confirm the same way, and `ui.js` / `render-airport.js` say "click again to build").
- One model for every tool: click (or drag) to place a plan; the plan stays on the map with its cost and time, and a visible **Build** button beside it (and Enter) builds it. Right-click or Esc cancels. Clicking elsewhere moves the plan; it never builds by accident.
- Points of a line (runway, taxiway) are placed with clicks as now; the last point never doubles as the confirmation.
- Founding an airport works the same way: place, turn, then Build.
- Change every hint, guide line and Academy text that says "click again".

**5. A full QA pass over construction.** For every tool in the build bar, at four zooms (whole airport, a terminal, a stand, the closest), on flat ground and next to existing parts:
- place it, cancel it, build it, watch it build through every stage, use it, bulldoze it, undo it;
- screenshots (`node tools/shot.js`) of each in `docs/tasks/47-screens/`, and open them;
- a findings log in `docs/qa/construction-audit.md`: each problem with a picture, its cause, the fix and its commit, or why it stays;
- a test in `tests/run.js` for each bug fixed.

## Out of scope

The look of joins (45 did it; fix only what 1 needs), roads and the landside's roads (46), the economy's other balance.

## Done when

- A ramp off any taxiway starts flush and square with it, proven by tests.
- The tower, fuel farm and fire station read at a glance at every zoom and in 3D, and the panel says in numbers what each one does for the airport.
- Nothing possible is refused for a missing prerequisite; every such problem is shown in plain words and plays out in the simulation.
- No tool builds on a second click: place, then Build or Enter; Esc or right-click cancels. No text in the game says "click again".
- `docs/qa/construction-audit.md` lists every finding, with screenshots, and each fix has a test.
- `npm test` is green, the eight Academy lessons complete, and the performance budget holds (`tools/world-perf.js`, `tools/airspace-perf.js` before and after).
