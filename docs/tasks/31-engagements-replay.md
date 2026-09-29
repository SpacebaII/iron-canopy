# 31 Engagements that last, and a replay that looks like a real debrief

Wave 8. Builds on tasks 20 (height, `flight.js`), 21 (air war) and 22 (the replay). Runs before or alongside 27 (after-action reports).

## What the owner asked for

> "Are actions like notching viewable? Does it look as if I'm watching DCS?"

> "I like the upgrades: they will make it feel real and allow me to record and do some visual storytelling. And if possible, I think the engagement times should be a bit longer. It seems a bit short, whereas in real life an engagement, from a missile being fired, can last quite a bit longer than what we currently do. As well as adding a bit more simulation."

## What is there now

Missiles fly at a constant speed:
- the long-range round at 1.5 km/s, about 67 s to 100 km;
- the air-to-air round at 1.3 km/s, about 35 s to 45 km.

A real long-range shot takes roughly 2–3 minutes, and an air-to-air shot at 45 km roughly 60–80 s, because the motor burns for seconds and the missile then coasts and slows.

What the simulation models:
- notching: side-on to a radar-guided missile for 12–14 s;
- break-away turns when locked;
- chaff and flares, which reduce the kill chance.

The replay shows turns as flat heading changes. There is no bank, no chaff or flares, no lock lines, and nothing from the missile's point of view.

## Goal

**1. Engagements that last, with more simulation** (in `flight.js` and `defense.js`; air-to-air in `air.js`):

- **Energy:**
  - a boost phase (a few seconds at high thrust), then a coast in which the missile slows from drag, more in thick low air and in hard turns;
  - flight times come out about 2–3 times today's for long shots;
  - reach tables (`IC.REACH`) come from this energy model, not a fixed range. The owner asked for longer SAM range, and the best-height reach is now short range 20 km, medium 70 km and long 160 km: the energy model must keep these;
  - a missile that runs out of energy before it arrives misses, and the report says so ("ran out of energy 8 km short").
- **Guidance in phases:**
  - midcourse on the launcher's data;
  - then the missile's own seeker: semi-active needs the battery's radar on the target throughout, active goes "on its own" in the last 10–20 km, heat-seekers need a hot target in view;
  - a battery that shuts down or loses the track breaks semi-active guidance.
- **Evasion that works by geometry:**
  - notching succeeds when the target really is side-on to the seeker against ground clutter;
  - a hard turn bleeds the missile's energy (making it miss at long range);
  - chaff and flares decoy by chance, depending on seeker and aspect;
  - enemy crews choose among these by skill and type;
  - our crews do the same.
- **Timing matters:** longer flight means shoot-look-shoot takes real time, a second salvo may be needed, and a raid can overwhelm batteries whose missiles are still in flight. Retune doctrine and the balance so engagements still resolve; report the balance runs.

**2. A replay that looks like a real debrief** (`record.js`, `replay3d.js`):

- **Bank and pull:** roll from the turn rate, pitch from climbs, a g figure on the label.
- **Record and show:**
  - chaff bursts and flares falling away;
  - locks: lines from radar or missile to target, colour by guidance phase;
  - "LOST LOCK", "DECOYED", "OUT OF ENERGY", "PASSED ABOVE" labels at the moment they happen.
- **Smooth, flown paths:** the 0.5 s samples are smoothed with curves, and manoeuvres are recorded at a finer rate during engagements.
- **Missiles:**
  - a bright motor plume and smoke trail while burning, then a thin trail;
  - a proximity burst;
  - an optional seeker cone.
- **Tacview-style panel:** for the selected object, speed, height, g, range and closing speed to its target, time to impact, and guidance phase.

**2b. A live view** (the owner: "Tacview ideally should be an accessible live view, like a small launcher window after selecting a unit, an openable view happening live, with the ability to fill the screen, but you likely would not be able to command from that view"):

- Selecting a unit, track or aircraft offers "Live view": a small 3D window in a corner of the map, following it as it happens. It uses the same models, trails, locks and labels as the replay, fed from the live state.
- The player can drag it, resize it, fill the screen with it, and close it.
- It uses the same cameras as the replay (chase, target, side-on, orbit). The auto-director can switch to the missile when one is fired.
- It is view-only: no orders from inside it. The game keeps running behind it, and the map stays usable while the window is small.
- Performance: the map keeps 60 fps with the window open over a raid (budget the 3D scene; drop detail before frame rate). The window closes itself if three.js cannot load, and says why.
- One button jumps from the live view to the replay of the last 15 minutes.

**3. Recording and storytelling tools:**

- **Cameras:**
  - chase (behind a missile or aircraft);
  - target (looking back at what is coming);
  - side-on (showing the engagement's geometry);
  - a slow orbit;
  - a cinematic auto-director that cuts between them at the key moments of an engagement.
- **Keyframes:** the player can place camera keyframes on the timeline and play them back smoothly.
- **Export:** record the replay window to a video file (WebM, with the browser's own recorder), at chosen speed and resolution, with or without labels.
- **Slow motion** around the moment of intercept.

## Scope

- In: `flight.js`, the missile and evasion parts of `defense.js` and `air.js`, `record.js`, `replay3d.js`, and balance values in `data.js` (missiles only).
- Out: the enemy's choices (19), the after-action report (27, which will link here).

## Done when

- `npm test` is green, with tests:
  - a long-range shot at 100 km takes 2–3 minutes;
  - a missile fired too far out runs out of energy and misses, with that reason;
  - a semi-active shot misses when the battery's radar goes silent mid-flight;
  - a notch works side-on and fails nose-on;
  - the recorder keeps chaff, flares and lock events;
  - the replay shows bank on a hard turn (a headless check of the model's roll).
- Balance runs: engagements still resolve, and the defence's kill rate against a standard raid stays within 10% of today's, or the change is justified in the pull request.
- The pull request has:
  - frames from the replay: a notch with chaff, a heat-seeker decoyed by flares, a long-range shot's whole flight with its phases, and the chase and target cameras;
  - the live view, small over the map and full screen, during a raid, with frame times while it is open;
  - a short exported video;
  - flight times before and after;
  - frame times.
