# 41 The 3D view, part 2: aircraft and airports that are alive

Wave 11. Builds on 34 and 38 (`models.js`, `render-models.js`, `record.js`, `replay3d.js`). Runs beside 39 and 40.
- This brief owns aircraft animation, ground vehicles and airport lights in 3D.
- 40 owns lighting and the image pipeline: use its bloom for lights, and agree the light interface early.
- 39 owns the airport's buildings: use its parts.
- Put new code in `models.js` (meshes), `record.js` (what is recorded) and a new `render3d-life.js` loaded with the 3D view. Touch `replay3d.js` only to hook them in.

## What the owner said

> "It does not feel cinematic yet … three times that." Earlier: "more life at the airport", "face the heading and look like the item is actually flying and reacting".

## Goal

**Aircraft that move like real ones.** Everything is driven by recorded or live state (`IC.recPose`), never scripted:
- ailerons, elevator and rudder with the manoeuvre;
- flaps and slats by phase;
- spoilers and speed brakes deploying at touchdown;
- thrust reversers with their roar and spray;
- tyre smoke at touchdown;
- nose-wheel steering on the taxi;
- rotation with the right pitch;
- wing flex on the ground and in turbulence;
- gear retracting in sequence after lift-off;
- engines that spool (fan blur);
- propeller and rotor discs;
- lights:
  - navigation lights;
  - white strobes and the red beacon, by phase as real crews switch them;
  - landing and taxi lights with their beams on the ground;
  - logo lights at night.
- Contrails above about FL260 in cold air, wingtip vapour on humid approaches, heat haze behind the engines, and afterburner and exhaust for military jets.

**The airport, alive:**
- Jet bridges that swing out to the door when an aircraft parks and back before pushback.
- Pushback tugs, fuel trucks or the hydrant dispenser, baggage tractors with carts, catering trucks, stairs and buses at remote stands, a follow-me car.
- Fire trucks on alert.
- The service vehicles follow what `groundops.js` and `s.svc` say is happening at each stand; they drive the airside service roads.
- Apron floodlights; runway edge, centreline and touchdown-zone lights; approach lights and PAPI (red and white correct from the camera's height); taxiway edge (blue) and centreline (green) lights; stop bars at holding points lit when a clearance is not given.
- Windsocks moving with `S.wind`.
- The rotating beacon on the tower.

**Military the same way:** launchers raising, radars turning, missiles leaving with a launch flash, smoke and a booster that drops away.

## Budget

- Instanced meshes for vehicles and lights, LOD by distance, nothing made per frame.
- The Medium preset of 40 holds 60 fps at 1080p with a busy capital airport in view.
- `tests/view3d.js` extended: no per-frame allocation; a parked aircraft gets its bridge and vehicles; the lights follow the phase.

## Done when

- `npm test` and `npm run qa` are green.
- The pull request has clips, frame by frame with `tools/view3d-shots.js`, of:
  - a full turnaround at a gate (arrival, bridge, vehicles, pushback);
  - a take-off with rotation and gear retraction;
  - a landing with spoilers, reversers and tyre smoke;
  - the airport at night;
  - a missile launch.
- It gives frame times.
- Look at every frame you make.
