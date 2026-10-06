# Iron Canopy trailer

`iron-canopy-trailer.mp4`: 1 min 40 s, 1280 × 720, H.264 (yuv420p, 30 fps), about 15.6 MB. A fresh Career played in headless Chromium with real clicks (`tools/trailer.js`). The dead time between scenes is cut out and the slow stretches play back faster.

| Starts | Scene | Caption |
| --- | --- | --- |
| 0:00 | Title card | IRON CANOPY. Build the airports. Run the skies. |
| 0:03 | Founding: the 15–40 km ring round the capital, the site survey, Found | Found your airport where the city and the wind agree |
| 0:12 | The Starter airport as one green plan with its price, then Build | One blueprint: runway, taxiways, terminal, tower, fire and fuel |
| 0:20 | Construction in stages (Finish now) | Watch it go up, stage by stage |
| 0:28 | The "Terminal opens" card and "+N movements an hour" on the map | Every opening says what it bought you |
| 0:33 | The first airliner: the clock eases to 1× and Follow picks it up | Your first airliner: the clock eases to 1× and the camera follows it in |
| 0:37 | Final approach, touchdown, taxi, parking | Final approach, touchdown, taxi to the stand |
| 0:49 | The first-landing card with the fee | Parked. The landing fee is yours |
| 0:54 | Turnaround at stand zoom | A real turnaround: stairs, bags and catering, each vehicle on its way |
| 0:59 | "REFUELLING · N MIN LEFT" on the stand | The fuel truck comes from the farm, and the stand counts down |
| 1:04 | Pushback | Then the tug pushes it back |
| 1:09 | A problem on the map ("Deal at risk: … needs hangar space"), its fix placed, Build | Problems show on the map, with the fix one click away |
| 1:17 | The chain overlay, zooming out to the region | Towns, roads, the airport and its flights: one chain, and the money moving along it |
| 1:26 | Dusk: from the stand out to the whole airport | Day and night, the airport keeps moving |
| 1:37 | End card | Then the airspace, airlines over the years, a network of cities. And later, the war. |

Stills: `still-1-plan.jpg` (the Starter plan placed, its price on the Build button), `still-2-opens.jpg` (Terminal opens), `still-3-landing.jpg` (the first-landing card), `still-4-turn.jpg` (refuelling at the stand).

To make it again, run `python3 -m http.server 8777 &` from the repository root, then `node tools/trailer.js`. It needs Playwright and ffmpeg. Each run makes a new world, so the names and numbers change.
