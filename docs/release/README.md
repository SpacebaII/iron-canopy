# Iron Canopy v1.0: release materials

| File | What it is |
| --- | --- |
| `itch-page.md` | The itch.io page: title, tagline, short and long description, controls, upload settings, known issues |
| `playtester-guide.md` | One page for playtesters: what to try and how to send feedback |
| `screenshots/` | Six screenshots, 1920 × 1080 (the builder 1440 × 900, the 3D view 1280 × 800) |
| `../../tools/package.js` | `npm run package` builds `dist/iron-canopy-v1.0.zip`, index.html at its root, for itch.io's HTML upload |

Screenshots, in the order for the store page:

1. `1-start.jpg`: the start screen and the generated region.
2. `2-national-airport.jpg`: a Career's national airport in Chapter 3: four terminals, aircraft at the gates and taxiing.
3. `3-builder.jpg`: laying the first runway: snapping, length, cost and which aircraft it takes, beside the cursor.
4. `4-airspace-editor.jpg`: the Class C airspace drawn as on a chart, with its rings in the airport's Airspace tab.
5. `5-aviation-room.jpg`: the Aviation room: the day's movements, departures board and what needs you.
6. `6-live-view-3d.jpg`: the 3D live view of an airliner's take-off roll.

Still to make: the 30–60 s clip from the replay's video export (session B owns the replay and the live view; once
their work merges, record it with the Video button in the replay and put it here). The 3D shot was taken with
software rendering in a headless browser; retake it on a machine with a GPU for the store page.
