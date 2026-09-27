# Task briefs

Each brief is written for one Claude cloud session: it says what the owner asked for (in their words), what is in and out of scope, which files to work in, and how to know it is done. Start the session with: "Read CLAUDE.md, then do docs/tasks/<brief>.md."

Work in waves. A wave starts only when the previous one is merged and `npm test` is green on `main`, because later tasks build on earlier ones and parallel sessions must not edit the same files.

| Wave | Brief | Depends on | Main files |
| --- | --- | --- | --- |
| 1 | [01 World: cities, roads, traffic](01-world.md) | — | `gen.js`, `world.js`, `terrain.js`, new `traffic.js`, road drawing in `render.js` |
| 1 | [02 Airport simulation core](02-airport-sim.md) | — | `airport.js`, `groundops.js`, `aviation-data.js`, `weather.js` |
| 1 | [03 Airspace: waypoints, radar coverage, light aircraft](03-airspace.md) | — | new `airspace.js`, `aviation.js` routing, `civil.js` light aircraft |
| 2 | [04 The airport builder](04-builder.md) | 02 | `main.js` build mode, `render-airport.js`, airport panel in `inspector.js` |
| 2 | [05 Growth and trade](05-growth-trade.md) | 01, 02 | `logistics.js` economy, `aviation.js` demand, city growth |
| 2 | [06 Save and load](06-save-load.md) | 01–03 | new `save.js`, small hooks |
| 3 | [07 Career pacing](07-career-pacing.md) | all of the above | `story.js`, `aviation.js` start-up |

After wave 3: a full `/code-review ultra`, then fixes and long balance runs.
