# 22 A 3D replay like Tacview, and real unit models

Wave 6. **Claude Fable 5.1.** Needs wave 5 (16, 17, 18) merged. Runs in parallel with 19, 20 and 21. Replaces brief 09.

## What the owner asked for

> "If we could break into 3D that'd be cool. Regular should likely stay 2D … but we should be able to have the cool Tacview knock-off, be able to show a missile hitting a skyscraper or a bulged fuel tank at an airport."

> "We need more actual units and better models for them as well, especially if Fable is going to do a 3D view. We need good models on the overhead, but then real 3D models."

The owner allowed **three.js for the 3D view**.
- Load it from cdnjs, only when the replay opens.
- Nothing else in the game depends on it.
- Update the rule in `CLAUDE.md` to say so.

## Goal

**1. Record everything, cheaply.**
- The step keeps short histories: ring buffers of positions with altitude, heading and state, for aircraft, missiles, threats and vehicles near events, and for impacts and damage.
- Any engagement or impact from the last 15 game minutes can be replayed.
- The recorder stays within the step budget.

**2. A replay window like Tacview.**
- Opens from an event: an intercept, an impact, a crash or a raid in the Journal, or from a selected track.
- Shows:
  - terrain relief with the map as its texture;
  - city blocks as buildings at real height;
  - airports with runways, aprons, hangars, shelters and fuel tanks;
  - aircraft, missiles, launchers and radars as 3D models;
  - missile trails and smoke;
  - fireballs, and the thing that was hit, burning or collapsing.
- Controls:
  - camera orbit, follow a missile or target, a free camera;
  - timeline scrubbing and speed;
  - labels with type, altitude and speed;
  - a side-by-side "what the radar saw" option.
- **Frame budget:** 60 fps on a mid-range laptop for a raid of 30 weapons.

**3. Real models, used twice.**
- Build models in code from simple shapes with materials and colours: low-poly but recognisable. Cover:
  - fighters;
  - airliners in three sizes;
  - cargo aircraft;
  - helicopters;
  - drones;
  - cruise and ballistic missiles;
  - our launchers and radars for each unit type, including task 17's new ones;
  - lorries.
- From the same definitions, draw **top-down silhouettes on the 2D map** at close zoom, so aircraft and units look like themselves overhead. The NATO-style symbols stay at far zoom.
- A models gallery in the Test range, or a debug key, shows every model in 3D and top-down.

## Scope

In:
- new files: `record.js` (the recorder, headless-safe), `replay3d.js`, `models.js` (model definitions), `render-models.js` (top-down drawing);
- a hook in `render-combat.js` and `render-airport.js` to draw silhouettes close in, kept small;
- the entry points in the Journal and inspector;
- `CLAUDE.md`'s dependency rule.

Out:
- A tilted main map (not now).
- Flight models (20 and 21 provide the data you record).
- Enemy behaviour (19).

## Done when

- `npm test` is green, with tests:
  - the recorder keeps the last 15 minutes of an intercept, with altitude, and stays within the step budget;
  - the headless game runs without three.js.
- The pull request has:
  - screenshots of the replay: a missile hitting a tall city block, a fuel tank burning at an airport, and an intercept at altitude with trails;
  - the models gallery in 3D and top-down;
  - frame times;
  - what you could not finish.
