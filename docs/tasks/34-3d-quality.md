# 34 The 3D view: steady, good-looking, flying like the real thing

Wave 9. Builds on 22 (the replay) and 31's first half (the live view, PR #27).

## What the owner said (after playing)

> "You have to fix the constant blinking in 3D mode, as well as the models look absolutely horrible. They need a massive increase in quality. They can stay low poly, or not hyper detailed, but they can't continue like this."

> "The 3D view needs some better animations, like landing, takeoff, taxiing etc. Also need to face the heading and look like the item is actually flying and reacting etc. Try to keep performance good."

From the owner's screenshots, the coordinator also saw:
- An airliner at FL370 and a drone at 6 km looked a few hundred metres above the fields: heights or model scale are wrong in the live view.
- The labels float at the top of the screen instead of on the object.
- The airliner's route was drawn on the ground, not at its height; the drone had a red line going off into the sky.
- The edge of the ground plane was visible at the horizon.
- There was a square patch of blurrier ground (tiles at two resolutions), and no hills.

## Goal

**1. No blinking.**
- Find and fix every cause: z-fighting (depth range and near/far planes over 1 m to 500 km, logarithmic depth or layered ground), objects rebuilt or re-added each frame, labels recreated, and materials or textures reloaded.
- A test: render 300 frames of a live view and a replay headless (or count scene rebuilds), and prove nothing is recreated per frame.

**2. Much better models.** They can stay low poly, but should be well made: proportioned from real dimensions, and recognisable at a glance.
- **Airliners:**
  - lofted fuselages with a proper nose, cockpit windows and tail cone;
  - swept, tapered wings with dihedral and winglets;
  - engines on pylons with intakes;
  - a tailplane and fin;
  - landing gear that retracts;
  - liveries per airline in the airline's colours;
  - window lines and navigation and strobe lights at night.
- **Fighters, bombers, drones and helicopters:**
  - fighters with a canopy and afterburner glow;
  - drones by type;
  - helicopters with spinning rotors.
- **Missiles:** a body, fins and a motor plume.
- **Ground units:** launchers that elevate, and radars that turn.
- Flat shading or simple smooth normals with a small colour palette per object. A few hundred to a couple of thousand triangles each, instanced where many are on screen.
- The models gallery shows every model beside a reference silhouette.

**3. Moving like the real thing.**
- **Attitude:** everything faces its heading and velocity. It banks into turns (from the turn rate), pitches with climb and descent, and yaws into the wind on final. Smooth between samples.
- **Airliners and our aircraft on the ground and near airports:**
  - taxiing along the real taxiways at taxi speed;
  - lining up;
  - the take-off roll, rotation, lift-off and gear up;
  - the climb-out;
  - on approach: gear and flaps down, the flare, touchdown with a puff of smoke, the rollout and the exit.
  - These come from the ground movement the simulation already does (`groundops.js`); the 3D view shows it truthfully.
- **Airports in 3D:** runways with markings and lights, taxiways, aprons, terminals and hangars from the airport's parts, so taking off and landing have a place.
- **Terrain:** real heights (hills and valleys from `W.hAt`), a ground big enough that its edge is never seen (fog, then a horizon), one consistent texture detail, rivers, roads and towns from the map.
- **Heights and scale:** true heights by default in the live view, with the replay's exaggeration switch as an option. Models at real size. Labels anchored just above the object. Routes and lock lines drawn at their true heights.

**4. Performance.**
- 60 fps with the live view small over a busy map, and 60 fps full screen over a raid on a mid-range laptop.
- Level of detail: simpler models far away, instancing for many of one kind, and nothing rebuilt per frame.
- Measure and report.

## Scope

- In: `models.js`, `replay3d.js`, `render-models.js` (the same models seen from above on the map, if cheap), and `record.js` (anything the animations need recorded, such as gear and flap state from ground operations).
- Out: missile physics, which is part 2 of brief 31 and runs after this.

## Done when

- `npm test` is green, with tests:
  - no scene object is recreated per frame in a 300-frame run;
  - an aircraft's model faces its velocity and banks in a turn;
  - gear is down on approach and up in the cruise;
  - a take-off in the replay follows the runway.
- The pull request has:
  - before and after frames: an airliner at the gate, taxiing, taking off, cruising and landing; a fighter turning; a drone; a helicopter; the models gallery;
  - a short video of the live view without blinking;
  - frame times.
