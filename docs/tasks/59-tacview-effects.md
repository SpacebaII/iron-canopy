# 59 Tacview for film, and effects that hold up on screen

Wave 17, after 58 (it uses film mode, the frame clock and the captions). Owns the cameras and effects in `replay3d.js`, a new `render3d-war.js` (effects in 3D, loaded with three.js like `render3d-life.js`), and the combat effects in `render-combat.js`.

## What the owner said

> "For that we need some Tacview upgrades … also the effects in game need to look a bit better for that to work possibly … think of a War Thunder trailer, just a bit more coherent."

## Where we are

- The 3D view films an engagement as a debrief: a missile's smoke is a flat white ribbon, an explosion is a sphere that grows and fades with seven grey balls round it, a hit on the ground is one orange cone, an aircraft that is hit simply stops being drawn. The director cuts between chase, side-on, target and a slow orbit (`shots/replay-lr-*.png` before this brief).
- On the map, missiles leave pooled particle trails and explosions are sprites (`IC.cfx`); they read well at the strategic zoom and thin out close in. Fires on the ground are a few particles.

## Goal

### 1. Cameras a film would use (`replay3d.js`)

Each a mode of `camera()`, chosen by hand (`1`–`9`, the header's list) or by the director:

- **Flyby:** the camera is planted a little ahead of and beside the path of what it films, and turns to follow it as it passes, then holds as it goes away. The classic aviation shot; for a cruise missile at 30 m, it is the shot.
- **Ground observer:** from the ground near the target or a battery (a street in the city, the battery's own field), a long lens looking up at the trails crossing the sky. The shot that makes it a war and not a game.
- **Launcher:** at a battery as it fires, low and to one side; the launch blast fills the frame, the missile climbs out of it.
- **Wingman:** beside an aircraft, matching its speed, a little behind its wing line.
- **Seeker:** from the missile's nose, looking where it looks, the target growing in the last seconds; a faint reticle optional.
- **Impact:** planted where a weapon will land, a few seconds before it lands (the recorder knows the future in a replay; the live view uses the predicted point).
- **High wide:** the whole raid from far above and to one side, the trails converging on the city: the establishing shot.
- **Lens and focus:** a focal length per shot (24–600 mm), depth of field focused on the subject (the HDR pipeline already has it), a light handheld drift, and shake from blasts by their size and distance.

### 2. A director with shot grammar

- **For a raid:** establish (high wide) → the launch (launcher) → follow (chase or wingman) → the pass (flyby) → the end (target, seeker or impact) → the reaction (ground observer on the smoke, or a slow orbit of the fireball), then the next engagement.
- Holds of 2–7 s, a cut on action (a launch, a lock, a hit), never two cuts within 1.5 s, no crossing of the line between subject and target, slow motion eased in round each hit.
- `IC.replayDirector(v, plan)` takes a list of beats from a tool (60), so a scripted film can ask for exactly the shot it needs and the director fills the gaps.

### 3. Effects in 3D (`render3d-war.js`)

Made once, pooled and reused, nothing allocated per frame (`tests/view3d.js` proves it):

- **Rocket motors:** a hot core and a longer, tapered plume with shock diamonds, glowing (bloom), flickering; a launch cloud of dust and smoke that rolls out from the launcher and hangs.
- **Smoke trails:** billboard puffs laid along the path that grow, thin and drift with the wind over a minute, lit by the sun (bright on one side), with gaps where the motor burns out; interceptors' trails curl where they turned. They replace the flat ribbon.
- **Explosions:** a fireball from an animated sprite sheet (made in code once, no image files), a white-hot flash that lights the ground and nearby buildings for a moment, a shock ring on the ground, debris thrown out with smoke trails, and a column of dark smoke that rises, leans with the wind and stays for minutes.
- **Intercepts in the air:** a proximity burst (a flash and a cloud of fragments), and the target breaking up: burning pieces that fall with smoke trails, the biggest one tumbling down to the ground where it lands as a fire.
- **Ballistic missiles:** the re-entry glow and its streak as it comes down.
- **Fires:** burning targets (fuel tanks, buildings, crashed aircraft) burn with flames and a smoke column, glowing at night and lighting the ground round them.
- **Guns:** C-RAM tracer streams and the flash of the gun.
- **Quality:** each effect scales with the preset (`IC.FX3D`): fewer puffs and no lit smoke on Low.

### 4. Effects on the map (`render-combat.js`)

- Explosions with a fireball, a shock ring, debris sparks and a smoke column that drifts in the wind and casts a soft shadow; bigger and brighter in film mode.
- Rocket plumes and smoke trails that stay readable close in (they thin out today); trails that widen and fade with age.
- Fires that glow at night and light the ground round them; a burning city block or fuel farm visible from the regional zoom.
- Interceptor launches with a flash and a cloud at the battery.

## Out of scope

- Changes to the simulation's outcomes: effects follow what the recorder and the simulation say.
- New models (brief 38 and 41 have them).

## Tests

- "tacview: each new camera keeps its subject in the picture from the start of its shot to the end" (the camera maths, headless where possible, else `tests/view3d.js`).
- "tacview: the director's plan for a raid uses the establish → launch → follow → end order and never cuts twice within 1.5 s".
- "tacview: effects make nothing per frame" (`tests/view3d.js`, a raid with hits).
- "combat look: an explosion leaves a smoke column that is still there a minute later and gone after its life".

## Done when

- `tools/view3d-shots.js` and `tools/combat-shots.js` have before and after frames of: a SAM launch, a smoke trail in the sun, an intercept with break-up, a cruise missile in a flyby, an impact in the city at night, a fuel farm burning. They have been looked at.
- Frame times in the 3D view on High stay within brief 40's budget with a raid of 40 weapons.
