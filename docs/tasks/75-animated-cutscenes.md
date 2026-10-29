# Brief 75: the cutscenes animated

Preston asked for true cutscenes: animation and proper scripting, with Claude doing the 3D and painted art made in ChatGPT.

## What it does

- **Every cutscene plays as a scene** (`cutscript.js`, `render-cutscene.js`). A title card, then each panel in turn on its own clock: the camera moves over the picture (push in, pull out, pan, rise, slam), the Director's caption types in at reading pace, the balloon pops after it, the weather and light play over it (rain, snow, embers, fog, dust, scanlines on screens, blue lights, a warm dawn), flashes and shakes land on their beats, and the panel gives way to the next by a fade, a slide, a dip to black, a flash or a cut. It plays by itself; a click finishes the words or turns the panel, ← goes back, P pauses, Esc skips.
- **The script.** A panel may say `dur`, `cam` (a name in `IC.CUT_CAMS` or `{ x0, y0, s0, x1, y1, s1 }`), `at` (the point the camera looks at), `fx`, `beats` and `trans`. Anything it leaves out is read from its shot line, so all 114 panels animate without hand-written scripts, and any one can be tuned.
- **Staged 3D shots.** A panel with `stage: { id, part, hour, model }` is filmed in the game's own 3D view instead of a picture: `IC.CUT_STAGES` flies scripted actors (an airliner on a 3° glide to the national airport's main runway, a take-off roll and climb-out, a drone crossing a turboprop's path, an enemy fighter sliding onto an airliner's wingtip, a ballistic salvo met by interceptors over the capital) into a record of their own, with explosions at set times and film-camera shots over them (`W3.cam`: fixed, chase, along, orbit, lens zooms, lag). It runs on a copy of the state, so the game is untouched. With no airport yet, or no three.js, the panel keeps its picture.
- **The Journal** lists the scenes seen so far, to play again.

## Art

`node tools/art-prompts.js --out=prompts.md` writes one ready-to-paste prompt for every painted panel still missing, with the look and the cast written into each. A picture saved as `iron-canopy/art/cut/<art>.jpg` replaces the storyboard frame by name and keeps the same moves.

## Clips

`node tools/cut-clip.js <cutscene id> [--w=1280 --h=720]` films a cutscene frame by frame on the held clock and encodes an H.264 MP4 that plays on a phone; `--stills=t,…` saves PNGs instead.
