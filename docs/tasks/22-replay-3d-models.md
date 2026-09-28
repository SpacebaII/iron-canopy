# 22 A 3D replay window and real unit models

Wave 6. Needs wave 5 merged. Runs in parallel with 19, 20 and 21. Replaces brief 09.

Iron Canopy is a management and strategy game with made-up equipment and simple, readable rules. This task is about presentation: a replay camera and nicer models, like a sports replay or the "Tacview" debrief tools flight-sim players use.

## What the owner asked for

> "If we could break into 3D that'd be cool. The regular view should stay 2D, but we should be able to have a cool Tacview-style replay, and see an event at an airport or in a city from any angle."

> "We need better models for the units, especially if there's a 3D view: good models from overhead, and then real 3D models."

The owner allowed **three.js for the 3D window only**:
- load it from cdnjs when the replay opens;
- nothing else in the game depends on it;
- update the rule in `CLAUDE.md` to say so.

## Goal

**1. Record recent history, cheaply.**
- The step keeps short histories for everything that moves (aircraft, the air defence's tokens, vehicles near events) and for events on the map: position, height, heading and state, in ring buffers.
- Anything from the last 15 game minutes can be replayed.
- The recorder stays within the step budget.

**2. A replay window.**
- Opens from an event in the Journal or from a selected track.
- Shows:
  - terrain relief, with the map as its texture;
  - city blocks as buildings at their real height;
  - airports with runways, aprons, hangars and tanks;
  - aircraft, vehicles, launchers and radars as 3D models;
  - trails behind moving objects;
  - a simple flash-and-smoke effect where an event happened, and the building or tank that was damaged, shown darkened.
- Controls:
  - orbit the camera, follow an object, or fly free;
  - scrub a timeline and change the speed;
  - labels with name, height and speed;
  - an option to show what the radar saw.
- **Frame budget:** 60 fps on a mid-range laptop with 30 moving objects.

**3. Real models, used twice.**
- Build models in code from simple shapes with materials and colours: low-poly but recognisable. Cover:
  - fighters;
  - airliners in three sizes;
  - cargo aircraft;
  - helicopters;
  - drones;
  - the enemy's token types;
  - our launchers and radars for each unit type, including task 17's new ones;
  - lorries.
- From the same definitions, draw **top-down silhouettes on the 2D map** at close zoom, so aircraft and units look like themselves from above. The map symbols stay at far zoom.
- A models gallery in the Test range, or a debug key, shows every model in 3D and from above.

## Scope

In:
- new files `record.js` (the recorder, headless-safe), `replay3d.js`, `models.js` (model definitions) and `render-models.js` (drawing from above);
- small hooks in `render-combat.js` and `render-airport.js` to draw silhouettes close in;
- the entry points in the Journal and the inspector;
- `CLAUDE.md`'s dependency rule.

Out:
- A tilted main map (not now).
- Flight models (tasks 20 and 21 provide the data you record).
- Enemy behaviour (19).

## Done when

- `npm test` is green, with tests:
  - the recorder keeps the last 15 minutes of an event, with height, and stays within the step budget;
  - the game runs headless without three.js.
- The pull request has:
  - screenshots of the replay: an event in a city with tall blocks, an event at an airport's tank farm, and an air defence engagement at height with trails;
  - the models gallery in 3D and from above;
  - frame times;
  - what you could not finish.
