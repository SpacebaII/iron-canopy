# 37 Release QA: a v1.0 that does not look or feel vibe-coded

Release. After 32 (calendar), 33 part 1 (snapping) and 34 (3D quality) merge. No new features.

## What the owner said

> "I just want a product, so no real gold plating: just something tangible, recorded and playable enough to give to playtesters or post on social media. So polish, and make it a true deliverable."

> "You'll need to do a ton of QA, making sure everything looks good, is in working order, and looks good enough that it does not look or feel vibe-coded."

## The standard

A stranger opens the link, plays for 20 minutes and records a clip, and nothing breaks, confuses them or looks unfinished. Specifically:

- **No errors:** no page errors, no NaN, no "undefined", no `[object Object]`, no stray debug text.
- **Every message makes sense:**
  - every label, tooltip, card and log line is plain English, spelt right, with real units, and matches the numbers beside it;
  - nothing is stale (an instruction that no longer applies), contradictory (two numbers for the same thing) or wrong in context.
- **Visually consistent:**
  - fonts, sizes, spacing, colours and icons agree across the map, panels, rooms and cards;
  - nothing overlaps, is clipped or runs off the screen at 1280×720, 1920×1080 and 2560×1440;
  - nothing flickers or pops.
- **Every button does what it says,** and every screen has a way back. The keyboard shortcuts shown are the ones that work.
- **Performance:** 60 fps in normal play on a mid-range laptop (measure with the GPU, not software rendering; note the machine), with no hitch longer than 100 ms at 1× speed.
- **First ten minutes of each mode:** a new player knows what to do next without reading a manual.

## How

1. **Play every mode on camera, as a player would:**
   - Career from the start through Chapter 3;
   - a Quick war for two game days;
   - every Academy lesson;
   - the Test range;
   - save, reload and Continue;
   - the replay and the live view, including a video export.

   Screenshot every screen and state you reach (`tools/shot.js`, and scripted Playwright runs with real mouse input for the builder).
2. **Keep a findings list** in `docs/qa/findings.md`, one line each: where, what is wrong, how bad (blocker / ugly / minor), and a screenshot.
3. **Fix as you go,** in small commits, worst first. Blockers and ugly issues must be fixed; minor ones if time allows. Do not add features or redesign systems: when something needs more than a fix, write it down for after the release.
4. **Automate the checks that can be automated:**
   - `tools/smoke.js` plays every mode in a browser and fails on any page error;
   - a text lint scans the UI strings for "undefined", "NaN", doubled spaces, and "1 minutes" or "1 aircrafts";
   - both are added to `npm test`, or to a `npm run qa` if slow.
5. **Release materials** in `docs/release/`:
   - itch.io page text (title, tagline, short and long description, controls, known issues);
   - six screenshots and a 30–60 s clip made with the replay's video export;
   - a one-page playtester guide ("what to try, and how to send feedback");
   - `tools/package.js`, which builds an upload-ready zip of `iron-canopy/`.
   - Version the game as v1.0 on the start screen.

## Done when

- `npm test` and the smoke run are green.
- `docs/qa/findings.md` has every blocker and ugly finding fixed, and says what minor ones are left.
- `docs/release/` has everything above.
- A pull request with before and after screenshots of the worst finds.
