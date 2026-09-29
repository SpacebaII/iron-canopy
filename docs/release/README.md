# Iron Canopy v1.0: release materials

| File | What it is |
| --- | --- |
| `itch-page.md` | The itch.io page: title, tagline, short and long description, controls, upload settings, known issues |
| `playtester-guide.md` | One page for playtesters: what to try and how to send feedback |
| `CHANGELOG.md` | What v1.0 has, in plain words |
| `screenshots/` | Six store screenshots, 1920 × 1080 (`node tools/store-shots.js` makes them again) |
| `iron-canopy-clip.webm`, `iron-canopy-clip.gif` | A 48 s gameplay clip: the WebM 1280 × 720 at 30 fps, 15 MB (`KEEP=1 node tools/clip.js`); the GIF 432 × 243 at 7.5 fps, 8.7 MB (`python3 tools/clip-gif.py`, from the frames the clip kept) |
| `../../tools/package.js` | `npm run package` builds `dist/iron-canopy-v1.0.zip`, index.html at its root, for itch.io's HTML upload |

**The upload:** `dist/iron-canopy-v1.0.zip` is **788 KB** (56 files, 2.3 MB unpacked). Unzipped into a local folder it plays
from `index.html` opened straight from disk (file://) and from a local web server alike.

Screenshots, in the order for the store page:

1. `1-airport.jpg`: the capital's international airport close in on a Career morning: airliners at the gates, business
   jets and light aircraft on the remote stands, traffic on the taxiways.
2. `2-builder.jpg`: a taxiway drawn from the runway, locked square to it on a snapping guide, with its length, cost, work
   time and what it changes beside the cursor.
3. `3-airspace.jpg`: the capital's Class C airspace drawn as on a chart, its rings in the airport's Airspace tab.
4. `4-raid.jpg`: a raid on the capital: jet drones, cruise missiles and fighters coming in, the batteries firing.
5. `5-live.jpg`: the 3D live view of an airliner's take-off roll.
6. `6-replay.jpg`: the 3D replay of an intercept, chasing a long-range missile, with its data panel.

The clip: airport life on the map, a take-off in the live view, a raid on the map, and the replay of an intercept, each
with a one-line caption.

How they were made: headless Chromium on a cloud machine with no graphics card, so WebGL ran on SwiftShader (software)
with Chromium's GPU switches on. The pictures are what a GPU draws; the clip was made frame by frame on a virtual clock,
so it plays at a smooth 30 fps though the machine drew only a few frames a second. The replay's own Video button records
in real time, which on software rendering gives a slideshow; on a machine with a GPU it is the quickest way to record more.
