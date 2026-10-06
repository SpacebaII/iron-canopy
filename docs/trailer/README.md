# Iron Canopy: the airport trailer

`iron-canopy-airports.mp4`: 2 min 11 s, 1280 × 720, H.264 (yuv420p, 30 fps), about 19 MB. It covers airport building and operations only: a fresh Career played in headless Chromium with real clicks (`tools/trailer.js`). Every price on screen comes from the game at the moment it was built.

The page's clock is held and moved on exactly 1/30 s before each frame is captured, so the video plays smoothly however slowly the machine draws. Between shots the game runs on as normal: it waits for the first airliner, lets three months pass, and runs on to dusk.

| Starts | Caption | Second line |
| --- | --- | --- |
| 0:00 | Title card | Build an airport, part by part. Then keep it moving. |
| 0:03 | Choose the site | The survey reads the wind, the ground and the towns under the approach |
| 0:09 | Runway with taxiways | 3 km of concrete · parallel taxiway · rapid exits · landing systems · ₭681M |
| 0:15 | Terminal with apron | Six stands with jet bridges · a taxilane · joined to the parallel by itself · ₭143M |
| 0:23 | Services | Control tower ₭70M · fire station ₭60M · fuel farm ₭90M · ₭220M |
| 0:29 | Built in stages, paid as the work runs | Survey 3% · earthworks 27% · paving 50% · markings and lights 20% |
| 0:38 | Everything rises together | Runway, taxiways, terminal, tower, fire station and fuel farm |
| 0:39 | Ready for jets | All of it: ₭1,043M |
| 0:44 | Problems show on the map, with their fix | An airline needs hangar space · Hangar ₭60M |
| 0:53 | The first airliner, on final | Spaced in by the arrival manager, down the landing system |
| 0:57 | Touchdown, then a rapid exit | Off the runway sooner, so the next one can land |
| 1:00 | Taxi to the stand | Routes are reserved ahead: no one meets nose to nose |
| 1:03 | Every landing pays | ₭0.6M landing fee · ₭0.6M for 180 passengers |
| 1:07 | The turnaround | Jet bridge, bags, catering and the fuel truck from the farm |
| 1:16 | Fuel decides how soon it leaves | Two trucks per tank refuel 8 aircraft an hour; a hydrant removes the limit |
| 1:21 | Pushback, taxi out, hold short | Cleared by a tower that can see the runway |
| 1:27 | Line up and go | Departures wait under the arrivals until they are clear |
| 1:32 | Cargo area | A cargo shed, its apron and four freighter stands · ₭143M |
| 1:40 | 4 airlines, months later | Rated 17 arrivals and 17 departures an hour · 10 stands · 800 passengers an hour |
| 1:48 | Info views: runway capacity | What each runway takes an hour in the wind now |
| 1:52 | Info views: fuel and fire cover | Fire trucks must reach every point of a runway in 3 minutes |
| 1:57 | Day and night, it keeps going | Edge lights, floodlit stands and the tower's beacon |
| 2:07 | End card | Build it part by part. Run it hour by hour. |

Stills: `still-1.jpg` (the runway plan with its price), `still-2.jpg` (the terminal placed beside the parallel taxiway), `still-3.jpg` (earthworks and paving), `still-4.jpg` (the turnaround at the stand), `still-5.jpg` (three months later), `still-6.jpg` (dusk).

To make it again, run `python3 -m http.server 8777 &` from the repository root, then `node tools/trailer.js`. It takes about 15 minutes and needs Playwright (`npm i --no-save playwright`) and ffmpeg. The world comes from `--seed` (4242 by default). For work on one scene, `--stop=<scene> --save=file.json` stops there and saves the game, and `--from=file.json` starts from that save (`--skip-first` skips the first airliner).
