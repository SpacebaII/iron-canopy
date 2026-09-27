# 04 The airport builder

Needs task 02 merged first.

## What the owner asked for

> "The airport building needs some work: undo by right-clicking, and finalize the build by left-clicking the same spot."
> "It didn't feel impactful enough."
> "Add actual resources like money when it comes to building, and overall an overhaul of making the building feel better."
> "Airports should be able to be built at other cities."
> "Maybe some layering in the actual levels of materials when it comes to building, like asphalt, concrete, reinforced concrete etc."
> "Just some ramps where you can place stands, like for GA and larger aircraft. The player should be able to allow a massive military plane to be out in the open and not in a hangar if he wants."
> "Might even be to the point where the player demolishes houses or buildings to expand the airport."

## Goal

Building an airport should feel like a real project the player plans and watches happen, and it should be precise enough to lay out a KDEN-scale airport (task 02) without fighting the controls.

## Scope

In: the build mode in `main.js`, the ghosts and construction visuals in `render-airport.js`, the airport panel and build palette in `inspector.js`, construction and costs in `airport.js` (engineering works), founding airports (`IC.foundAirport`).

Out: the simulation rules from task 02 (use them, do not change them), airlines, the story, terrain and road drawing (task 08), city growth and roads outside airports (task 05).

Two other tasks run in parallel: 05 (growth, trade, roads: `logistics.js`, `aviation.js` demand, new `growth.js`, road building in `world.js`) and 08 (world look: `terrain.js`, `render.js`, `gen.js` shapes, radar masking). Stay out of their files. The shared hook is `IC.worldChanged(S, box)`: whoever lands first defines it in `world.js` as a no-op that records the changed box in `S.worldDirty`; 08 makes the terrain redraw from it.

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
- **Pavement materials.** Every paved part (runway, taxiway, apron, ramp, road) is built in a material the player picks: gravel or grass (light aircraft only), asphalt, concrete, reinforced concrete.
  - Each has a strength rating (which aircraft weights it carries; heavy aircraft on weak pavement wear it out, then it needs repair), a cost per 100 m or hectare, a build time, upkeep, and resistance to weapons (reinforced concrete craters less and is quicker to patch).
  - Show the choice and its effect in words when placing: "asphalt: fits up to a 737; a C-17 will wear it out".
  - Upgrading a part's material later is an engineering work, with the part closed while it runs.
- **Open ramps.** A ramp is an apron the player lays out where stands are placed freely, not only along a back edge: pick the stand size (light, medium, heavy, very heavy) and drop stands on it.
  - Any aircraft can park in the open if the player wants, including large military transports and tankers. Aircraft in the open are quicker to turn round but easier to destroy than in a hangar or shelter (the damage model already does this; show it in the stand's panel).
  - Ramps carry a zone like any other part (civil, cargo, light aircraft, military).
- **Demolishing to expand.** When a planned part overlaps city blocks, roads or other buildings, show what must go, what it costs (compensation per block, more in dense areas) and the political cost (a small confidence and public-support hit, a local protest card for large clearances). The player confirms; demolition is the first construction stage. Remove the blocks from `city.blocks` and call `IC.worldChanged(S, box)` (task 08 redraws that area; task 05 uses it too) so the city visibly loses them.
- **Feel:** crisp snapping, clear colours for valid and invalid, sounds on placement and completion, and nothing that fails silently.

## Done when

- `npm test` is green, with tests for:
  - right-click undo and finishing a taxiway by clicking the last point (through `IC.clickWorld`);
  - staged construction spending money over time;
  - construction stopping when materials run out;
  - founding an airport at another city;
  - a heavy aircraft on asphalt rated below its weight wears the pavement, and reinforced concrete takes a smaller crater than asphalt;
  - a very heavy military aircraft can be parked on an open ramp stand, and dies more easily there than in a shelter;
  - a part planned over houses removes those blocks, costs compensation and lowers public support.
- A KDEN-scale airport can be built by hand in a reasonable number of actions. Record the steps and screenshots in the pull request.
- The pull request says what changed and what you could not finish.
