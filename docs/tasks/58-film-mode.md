# 58 Film mode: the map and the 3D view as a camera, with the interface off and a recorder on

Wave 17, the first of three (58, 59, 60). Builds on the Sandbox (PR #69: attacks on demand, instant building) and the atmosphere (PR #68: a real night, music that follows the war). Owns the new `film.js` and `film-cam.js`, the film layer in `render.js`, and the film hooks in `replay3d.js`. 59 (effects and Tacview) and 60 (the teaser) build on it.

## What the owner said

> "Make it more cinematic, meaning I'd be able to hide the HUD and use this same platform to almost record video. For that we need some Tacview upgrades … by the end you should be able to give me a proof-of-concept movie about the enemy launching an air attack, with cinematic scenes of the war going on both on the overhead and Tacview, like a teaser. It needs to look good: think of a War Thunder trailer, just a bit more coherent, good enough to keep the watcher on the edge of their seat."

## Where we are

- The map is a dashboard: the top bar, the rail, the air picture, the arsenal, the minimap and the layer buttons are always there, and every track carries a tag ("1 drone · 7 min out"), every battery its range ring and its status line. That is right for playing and wrong for filming (`shots/raid-1.png` before this brief).
- `IC.cine` (main.js) already gives combat a breath of letterbox and eases the clock down while weapons fly near the view. It is a gameplay aid, not a camera.
- The 3D view (`replay3d.js`) has a director, a recorder to WebM and an HDR picture (brief 40), but every frame carries the header, the data panel, labels on every object and lock lines. Brief 42 planned a cinematic mode there and was never built; its combat parts are folded into this brief and 59.
- The airport trailer (PR #58, `tools/trailer.js`) proved the way to film this game smoothly on any machine: hold the page's clock and move it exactly 1/30 s before each frame is captured. It did it with an overlay injected from outside; this brief puts that into the game.

## Goal

### 1. Film mode on the map (`Shift+H`, and "Film mode" in the menu)

- **The interface goes.** Every panel, bar, button, card, toast, hint and the minimap fade out over half a second (`body.film`). Esc or `Shift+H` brings them back. Nothing the player needs is lost: the game keeps running, and anything that would stop skip still pauses.
- **The map shows the world, not the data.** In film mode the map draws a film layer:
  - no track tags, range rings, unit status lines, labels, problem markers, airways or coverage;
  - our units, aircraft and missiles drawn as their models from above (`IC.modelTop`) at every zoom where they are bigger than a few pixels, a soft glow where they are not;
  - enemy weapons drawn as what they are (a cruise missile, a drone, a re-entry vehicle with its streak), never as a red symbol;
  - trails, plumes, explosions and fires kept and made stronger (59);
  - city lights, airport lights and road traffic kept: at night they are what makes the overhead shot.
- **A film look.** A grade over the canvas, cheap enough for 60 fps at 1080p: a soft bloom of the brightest pixels (lights, flames, flashes), a vignette, a fine grain, and a colour grade by the hour (cool blue at night, warm at dusk and dawn, a slightly bleached day). Optional letterbox bars at 2.39:1 (`IC.film.bars`). Each has a switch.
- **Captions.** `IC.film.caption(title, line, ms)` puts a title in the display font at the lower left, the way a war documentary names a place ("HOLITZ · 03:41"); `IC.film.card(title, line)` a full-screen card. Both fade on the page's clock.

### 2. A camera that moves like a camera (`film-cam.js`)

- **Shots, not jumps.** `IC.film.shot(spec)` takes over the map's camera until the shot ends or the player touches the mouse:
  - `hold`: a point and a zoom, with a slow drift (a few % of the screen over the shot);
  - `push` and `pull`: zoom in or out by a factor over the shot, eased, keeping a point still on screen;
  - `pan`: from one point to another, eased;
  - `track`: follow something (a missile, an aircraft, the centre of a raid) with lead in its direction of travel, its zoom set by its speed so it crosses the screen at a watchable pace, and easing, never a rigid lock;
  - `pair`: keep two things in frame (a missile and its target, a raid and a battery), zooming out as they part and in as they close;
  - `raid`: frame the whole of a raid (all hostile weapons within 150 km of each other) and the batteries firing at it.
- **Shake.** An explosion near the middle of the view shakes the camera by its size and distance (`IC.film.shake`), damped in under a second; off in normal play unless the player wants it.
- **Slow motion.** In film mode the speeds include ¼× and ½× (keys `Shift+1`, `Shift+2`), and the director can ease the clock down round a hit and back up.
- **The overhead director.** `IC.film.auto` (key `D` in film mode) picks shots by itself: it scores what is happening (salvos fired, an intercept within seconds, a weapon about to land, a fire starting, a fighter scrambling) and cuts to the best one, holding each shot 3–8 s, never cutting during an intercept or an impact. It always knows where the next moment will be from the simulation (time to intercept, time to impact), so it is there before it happens.
- **Headless.** The shot maths (where the camera is at time t in a shot, the director's scores and choices) is plain functions with no DOM, tested in Node.

### 3. Film mode in the 3D view

- `F` in the replay or the live view (and a "Film" button in their header): the header, the data panel, the timeline, the labels, the lock lines and the cone go; the picture fills the window, or the screen with full screen. Letterbox, captions and the grade come from the 3D picture's own passes (`render3d-fx.js` already has the vignette, grain and tone mapping; the bars and captions are added).
- The cameras and the director stay; 59 gives them new shots.

### 4. Recording

- **For the player:** "Record" in film mode (key `Shift+R`) records the map (or the 3D view) with the grade, bars and captions to a WebM file with `MediaRecorder`, at the window's size or 1080p, 60 fps where the machine keeps up. A red dot and the running time sit in a corner and are not in the recording.
- **For the tools, frame by frame:** `IC.film.clock` holds the page's clock (`performance.now`, `requestAnimationFrame`) and advances it by exactly one frame on `IC.film.tick(ms)`, the trailer's way, so a scene renders smoothly at 30 or 60 fps however slow the machine is. The game's step, the map, the 3D view and the film camera all run on that clock. A tool calls `IC.film.tick`, then captures the screen.
- `IC.film.frameOf(canvas)` gives the composited frame (map, grade, bars, captions) for a tool to save without a screenshot of the whole page.

## Out of scope

- New weapons or new behaviour: film mode only shows what the simulation does.
- Sound recording in the browser (the teaser's sound is made by 60's tool); MediaRecorder may carry the page's sound if the browser allows it, nothing more.
- Rotating the 2D map. The overhead camera stays north up.

## Tests (in `tests/run.js`, durations in `tests/times.json`)

- "film: a shot's camera is where its maths says at every time, and a pan ends exactly on its point" (headless).
- "film: the director films the intercept that is about to happen, and does not cut during it" (headless, a Sandbox raid).
- "film: track keeps a cruise missile on screen from launch to impact" (headless, the camera maths against the recorded path).
- "film: film mode adds nothing to the step: the simulation is the same with it on and off" (the same dice, both runs keep step).
- The suite stays green, the Academy lessons stay completable.

## Done when

- `node tools/film-shots.js` (new) saves, from one seed: a raid at night on the capital in normal play and in film mode, the same at noon, and a 10 s frame-by-frame clip of `track` on a cruise missile, and they have been looked at.
- Map frames in film mode at 1080p stay within the frame budget with a raid of 40 weapons on screen (`tools/world-perf.js --views`).
