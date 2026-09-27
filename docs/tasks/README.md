# Task briefs

Each brief is written for one Claude cloud session: it says what the owner asked for (in their words), what is in and out of scope, which files to work in, and how to know it is done. Start the session with: "Read CLAUDE.md, then do docs/tasks/<brief>.md."

Work in waves. A wave starts only when the previous one is merged and `npm test` is green on `main`, because later tasks build on earlier ones and parallel sessions must not edit the same files.

| Wave | Brief | Depends on | Main files |
| --- | --- | --- | --- |
| 1 | [01 World: cities, roads, traffic](01-world.md) | — | `gen.js`, `world.js`, `terrain.js`, new `traffic.js`, road drawing in `render.js` |
| 1 | [02 Airport simulation core](02-airport-sim.md) | — | `airport.js`, `groundops.js`, `aviation-data.js`, `weather.js` |
| 1 | [03 Airspace: waypoints, radar coverage, light aircraft](03-airspace.md) | — | new `airspace.js`, `aviation.js` routing, `civil.js` light aircraft |
| 2 | [04 The airport builder](04-builder.md) | 02 | `main.js` build mode, `render-airport.js`, airport panel in `inspector.js`, `airport.js` |
| 2 | [05 Growth, trade and roads](05-growth-trade.md) | 01, 02 | `logistics.js` economy, `aviation.js` demand, new `growth.js`, routing in `world.js` |
| 2 | [08 World look](08-world-look.md) | 01 | `terrain.js`, `render.js`, shapes in `gen.js`, impact marks, radar masking |
| 3 | [10 Cities, roads and traffic](10-cities.md) | 05, 08 | city and road generation in `gen.js`, `terrain.js`, `traffic.js`, new `render-roads.js`, city growth and road tool in `growth.js` |
| 3 | [11 Air defence that fights back](11-air-defense.md) | — | `defense.js`, `threats.js`, `enemy.js`, `sensors.js`, `data.js` stats, `air.js`, `campaign.js`, Academy, remove `ground.js`, new `reinforce.js`, `testrange.js` |
| 3 | [12 Combat look and feel](12-combat-feel.md) | — | new `render-combat.js`, `audio.js`, symbols, new `names.js` |
| 3 | [13 Economy and logistics](13-economy-logistics.md) | 05 | `logistics.js`, economy in `growth.js`, ordering in `units.js`, Economy/Supply rooms, new `render-logistics.js` |
| 4 | [07 Career: start small, learn by building](07-career-pacing.md) | wave 3 | `story.js`, start-up, map size, tutorial |
| 4 | [14 Menus and progression](14-menus-progression.md) | wave 3 | `ui.js`, `inspector.js`, `warroom.js`, `app.css` |
| 5 | [06 Save and load](06-save-load.md) | all | new `save.js`, small hooks |
| 5 | [09 3D replay and tilt](09-tacview.md) | wave 3 | new files |

Wave 3 moves some drawing out of `render.js` into new files (`render-roads.js`, `render-combat.js`, `render-logistics.js`) so the three sessions do not edit the same lines. `growth.js` is shared: 10 owns city growth and the road tool, 13 owns the economy. The land war is removed (11); the game is aviation and air defence.

After wave 4: a full `/code-review ultra`, then fixes and long balance runs.
