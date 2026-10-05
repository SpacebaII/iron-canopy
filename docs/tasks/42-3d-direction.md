# 42 The 3D view, part 3: direction, photo mode, highlight reels and sound

Wave 11, after 40 and 41 merge (it builds on both). Owns cameras, the live view's controls, presentation and 3D sound (`replay3d.js`, `audio.js`).

## What the owner said

> "The live view: the speed should be selectable in there, 1–8×. It does not feel cinematic yet … three times that."

## Goal

- **Speed in the live view:** 1×, 2×, 4× and 8× buttons in its header (they set the game's speed), and Space pauses. Full screen covers the top bar, so the controls must be in the view.
- **Real lenses:** a focal length from 24 to 600 mm per shot. The long lens is the aviation-film look: it compresses the aircraft against the terminal.
- **Shots:**
  - runway-side tracking;
  - a planespotter's fixed camera that pans;
  - the tower;
  - over the wing;
  - the tail;
  - cockpit forward;
  - a drone orbit;
  - a crane rising at rotation;
  - a low shot on the threshold for landings.
- **Combat shots** for missiles and intercepts.
- **Camera movement:** eased, with inertia and a light handheld drift; never a rigid lock.
- **The Director (automatic):** cuts on the phases of a flight, using shot grammar (establish, then close, then react):
  - pushback;
  - taxi;
  - line-up;
  - take-off roll;
  - rotation;
  - gear up;
  - climb-out;
  - approach;
  - flare;
  - touchdown;
  - reversers;
  - turn off.
- **For engagements** it cuts on the launch, the lock, the notch or evasion and the end.
- **Cinematic mode:**
  - it hides data panels and labels;
  - letterbox bars at 2.39:1;
  - captions in the display font that fade in and out ("FXX 310 · Take-off · Runway 16R"; "Intercept · 34 km east of Holitz").
- **Photo mode, for social media:**
  - pause anywhere and fly a free camera;
  - choose the lens, depth of field and focus;
  - change the time of day and weather (a look only; the game does not change);
  - apply a filter;
  - hide the interface;
  - save a PNG at up to 4K.
- **Highlight reel:**
  - the game keeps the day's moments: first landing, the busiest hour, a storm arrival, a rare visitor, a raid, a big intercept;
  - it makes a 30–60 s cut with the Director, exported as 1080p60 WebM rendered frame by frame (smooth even on a slow machine).
- **Sound (Web Audio, `audio.js`):**
  - engine spool and roar by type and thrust;
  - reverse thrust;
  - a tyre chirp;
  - Doppler as aircraft pass;
  - wind;
  - rain;
  - ATC radio from the game's own radio calls, low under the scene;
  - missile motor and impact;
  - distance falloff from the camera.

## Done when

- `npm test` and `npm run qa` are green, with tests for:
  - the speed buttons;
  - the Director choosing shots for each phase;
  - the photo mode's still size;
  - the reel's cut list.
- The pull request has a highlight reel made by the game itself, photo-mode stills, and frame times.
