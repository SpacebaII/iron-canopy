# 04 The airport builder

Needs task 02 merged first.

## What the owner asked for

> "The airport building needs some work: undo by right-clicking, and finalize the build by left-clicking the same spot."
> "It didn't feel impactful enough."
> "Add actual resources like money when it comes to building, and overall an overhaul of making the building feel better."
> "Airports should be able to be built at other cities."

## Goal

Building an airport should feel like a real project the player plans and watches happen, and it should be precise enough to lay out a KDEN-scale airport (task 02) without fighting the controls.

## Scope

In: the build mode in `main.js`, the ghosts and construction visuals in `render-airport.js`, the airport panel and build palette in `inspector.js`, construction and costs in `airport.js` (engineering works), founding airports (`IC.foundAirport`).

Out: the simulation rules from task 02 (use them, do not change them), airlines, the story.

## Design notes

- **Controls:**
  - Left-click places a point. Right-click removes the last point; with no points left, it leaves the mode. Clicking the last point again, or pressing Enter, finishes. Esc cancels.
  - Show the snap target, the length, cost and build time live, and what the result will do: "fits A320s", "adds 6 medium stands", "second exit at 1.9 km cuts runway occupancy by 40 s".
  - Curves and fillets on taxiway corners.
  - Move and rotate planned parts before work starts.
  - Undo the last placement.
- **Tools for big airports:**
  - A parallel taxiway at a chosen distance from a runway.
  - Rapid exits at the right distances for the aircraft mix.
  - Holding bays at runway ends.
  - Gates with jet bridges along a concourse.
  - Remote apron blocks.
  - De-icing pads.
  - Service roads.
  - Marking taxiways one-way (from task 02).
  - Assigning parts and stands to civil, cargo, light-aircraft or military zones.
- **Construction you can see and pay for:**
  - Work goes in visible stages: survey, earthworks, paving, markings and lights, opening.
  - Engineer crews and vehicles show on site.
  - Money is spent as each stage runs, not all up front, so the treasury matters over time.
  - Materials (concrete, asphalt, steel) come by road from industry. Shortages slow work and show why.
  - Work next to an active runway reduces its capacity or closes it for a while. The player chooses when to do it.
  - Opening a major part (a runway, a terminal) is a small moment: a card, a sound, and the before and after numbers.
- **New airports at other cities:**
  - A site survey shows slope, obstacles, land cost and the noise footprint over the city.
  - The player chooses runway direction knowing the prevailing wind (task 02).
  - Towns object to noise near them.
- **Feel:** crisp snapping, clear colours for valid and invalid, sounds on placement and completion, and nothing that fails silently.

## Done when

- `npm test` is green, with tests for:
  - right-click undo and finishing a taxiway by clicking the last point (through `IC.clickWorld`);
  - staged construction spending money over time;
  - construction stopping when materials run out;
  - founding an airport at another city.
- A KDEN-scale airport can be built by hand in a reasonable number of actions. Record the steps and screenshots in the pull request.
- The pull request says what changed and what you could not finish.
