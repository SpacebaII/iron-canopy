# 60 The teaser: a proof-of-concept film of the enemy's first strike

Wave 17, after 58 and 59. Owns `tools/teaser.js`, `tools/teaser-score.js` and `docs/trailer/`. Changes no game file except small hooks the shots need.

## What the owner said

> "By the end you should be able to give me a proof-of-concept movie about the enemy launching an air attack and have cinematic scenes of the war going on both on the overhead and Tacview, like a teaser. It needs to look good: think of a War Thunder trailer, just a bit more coherent. Good enough to have the watcher engaged, on the edge of their seat."

## The film

About 90–120 seconds, 1920 × 1080, 30 fps, H.264 with AAC sound. Every frame is the game itself, in film mode (58) with 59's cameras and effects, staged in the Sandbox (PR #69) from one seed, rendered frame by frame on the page's clock, so it is smooth whatever the machine. Nothing is painted over it except titles.

One story, told in order, so it is coherent where a montage trailer is not:

1. **Cold open (night, quiet):** the capital asleep from above, city lights and a last airliner landing; a caption with the place and the hour. A radar turns. Then a line of text: their launch sites are active.
2. **The launch:** across the border, launchers fire one after another; ballistic missiles climb out of their own light, cruise missiles and drones leave low. From the overhead, the raid spreads out over the dark country.
3. **The approach:** in 3D, a flyby of a cruise missile skimming the hills; a drone swarm passing over a village; the ballistic missiles high above, coming over.
4. **The defence wakes:** the battery's radar turns towards the threat; launchers lift; the first interceptors climb out in their launch clouds (3D launcher and ground observer); from above, trails arc out from the batteries towards the incoming raid.
5. **Intercepts:** chase, seeker and the burst; slow motion on the hit, the target breaking up and falling burning; the overhead with flashes across the sky.
6. **Leakers:** a cruise missile gets through, the impact camera at the fuel farm; the fireball and the smoke column; the city's fires from above; sirens.
7. **The fighters:** a pair scrambling from the air base, afterburners at night; a missile off the rail; flares.
8. **The climax:** the last wave, the screen full of trails, cuts getting shorter with the music; one big intercept in slow motion; then black.
9. **Title:** IRON CANOPY. A line: "Build the airports. Run the skies. Then defend them."

## The sound

- **Score** (`tools/teaser-score.js`): made in an `OfflineAudioContext` in the browser from the cut list, in the game's key (D minor, `audio-score.js`): a low drone and a pulse that builds, hits ("braams") on the cuts that matter, a riser into the climax, silence before the title, a last hit on it.
- **Effects:** the game's own sounds where the picture shows them (launches, booms, sirens, jets), mixed under the score, from the event list the film recorded.
- ffmpeg puts picture and sound together.

## How

- `node tools/teaser.js [--seed=4242] [--fps=30] [--out=docs/trailer/iron-canopy-first-strike.mp4] [--scene=name]` (Playwright, ffmpeg, three.js on disk as the other tools).
- Each scene is a function: it sets the game up (time of day, weather, the raid from `IC.sandboxLaunch` / `IC.sandboxRaid`), runs the game to the right moment, then films a number of seconds on the overhead or in the 3D view with the shot it needs. `--scene` renders one for work on it.
- Scenes are written to frames, then cut with their transitions (cuts, a few fades, a flash on impacts).

## Done when

- The film is in `docs/trailer/` and the project's `trailer/` folder, with three stills and a README that says how it was made and how to make it again.
- It has been watched through, and every shot is in focus, framed and smooth, with nothing on screen that the player would not understand.
