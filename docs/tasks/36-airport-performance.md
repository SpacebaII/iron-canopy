# 36 Smooth close in: the airport, traffic at every zoom, WebGL where it helps

Wave 9. After 34 (both touch drawing).

## What the owner said

> "We need to optimize the performance zoomed into the airport, and traffic needs to stay consistent depending on zoom and not kill performance."

> On moving off the browser: "If you want, we can move this to something to run off the actual computer." The coordinator's answer: stay in the browser (the game will be released on itch.io), and move the heaviest drawing to the graphics card (WebGL).

## Goal

- **Measure first.** Frame times at the national airport close in (z 20, 40, 80) with 150 aircraft moving, busy landside and traffic; the capital at z 4, 12 and 30; and the whole map. Profile where the time goes.
- **Traffic consistent across zooms.** The number of vehicles on a street should not jump or vanish as the player zooms. The three systems (the middle zoom's flow slots, `IC.trafficAgents` close in, and the airport's own vehicles) blend smoothly and share one budget. Traffic is still halved.
- **The airport close in:**
  - cache static layers (pavement, markings, buildings) into canvases per zoom band, and redraw only what moves;
  - cull off-screen objects;
  - batch similar draws.
- **WebGL where it helps.** The owner allows it: this changes the rule in CLAUDE.md that three.js is only for the replay.
  - Consider moving the busiest moving layers (vehicles, aircraft on the ground, people and landside activity) to one WebGL canvas under the UI. Use raw WebGL or three.js, whichever is simpler, loaded once. Keep the 2D canvas for text and UI.
  - Do it only if measurement shows Canvas 2D cannot hold 60 fps.
- **Targets:** 60 fps at the national airport close in and in the capital at every zoom, on a mid-range laptop. The step stays within budget.

## Scope

- In: `render.js`, `render-airport.js`, `render-roads.js`, `traffic.js` (visibility and agents), and `landside.js` drawing.
- Update CLAUDE.md if WebGL is used, and add a performance test to `tools/world-perf.js`.

## Done when

- `npm test` is green, with frame-time checks in `tools/world-perf.js` for the airport and the capital.
- The pull request has before and after frame times at each zoom, and a short capture of zooming from the whole map into a gate with traffic that never pops.

## Added after brief 39 (the real Denver)

The step-budget test (`airport: a step with 150 aircraft moving stays within budget`) now runs on the real Denver from map data: 566 parts, about 2,500 taxi nodes. On GitHub's machines a step there measures 1.8–2.0 ms and ground operations 0.6–0.66 ms, so the test allows 2.3 ms and 0.8 ms for now. Bring them back under 2 ms and 0.6 ms, then restore those limits. The cost is spread (ground operations' per-aircraft checks in `stepTaxi`, `mayEnter`, `holdShort`; traffic; sensors; the recorder; 12% garbage collection); departure planning searches the whole taxi graph for each departure (`planDeparture` in `groundops.js`), where a search that stops once every candidate runway node is settled would do.
