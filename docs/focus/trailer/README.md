# Iron Canopy trailer (round 5c)

`iron-canopy-trailer.mp4` is 2 min 2 s long, 1280 × 720, H.264 (yuv420p, 30 fps), and about 12 MB.

It is a fresh Career played in headless Chromium with real clicks (`tools/trailer.js`). The dead time between scenes is cut, and the slow stretches play back faster.

| Starts | Scene | Caption |
| --- | --- | --- |
| 0:00 | Title card | IRON CANOPY. Build the airports. Run the skies. |
| 0:03 | A tutorial step: the build bar's note, then Found an airport, ringed | Every feature is taught on the real screen, and waits for you to do it |
| 0:07 | Founding: the site and its survey, then Found | Found your airport where the city and the wind agree |
| 0:16 | The Starter airport as one green plan; the Build button with its price and time | One blueprint: runway, taxiways, terminal, tower, fire and fuel |
| 0:24 | Construction in stages (Finish now) | Watch it go up, stage by stage |
| 0:32 | The "Terminal opens" card | Every opening says what it bought you |
| 0:37 | The first airliner: the clock eases to 1× and the camera follows it in | Your first airliner: the clock eases to 1× and the camera follows it in |
| 0:41 | Final approach, touchdown, taxi, parking | Final approach, touchdown, taxi to the stand |
| 0:53 | The first-landing card | Parked. The landing fee is yours |
| 0:58 | The turnaround close in: stairs, belt loaders, bags, people | A real turnaround: stairs, bags and catering, each vehicle on its way |
| 1:03 | Refuelling at the stand | The fuel truck comes from the farm, and the stand counts down |
| 1:08 | Pushback | Then the tug pushes it back |
| 1:13 | A problem on the map, its fix placed, then Build | Problems show on the map, with the fix one click away |
| 1:21 | The chain: towns, roads, the airport, flights, coins coming back | Towns, roads, the airport and its flights: one chain, and the money moving along it |
| 1:30 | The day board | The day board: departures by hour against what the runways take. Cap the peak, move a bank, pick the night |
| 1:35 | The ground fleet | Tugs, apron buses and fuel trucks, as many as the stands and the busiest hour need |
| 1:39 | The airline scorecards | Every airline marks the airport, and its worst mark comes with its fix |
| 1:43 | A decision card (a bird strike) | Something different every few minutes: each answer says what it costs |
| 1:48 | Night: aircraft moving under the lights, from the apron out to the airport | Day and night, the airport keeps moving |
| 1:59 | End card | Then the airspace, airlines over the years, a network of cities. And later, the war. |

## Fixed since the first cut

- **The caption over Build.** The caption now keeps above the Build button and above a tutorial's note.
- **Tiny vehicles.** The game draws apron vehicles and people readably, and the turnaround is filmed close in.
- **The quiet night.** The night scene waits until aircraft are moving, and starts from the apron.

## Stills

- `still-0-tutorial.jpg`: a tutorial step.
- `still-1-plan.jpg`: the Starter plan.
- `still-2-opens.jpg`: Terminal opens.
- `still-3-landing.jpg`: the first-landing card.
- `still-4-turn.jpg`: the stands at work.
- `still-5-dayboard.jpg`: the day board.
- `still-6-deck.jpg`: a decision card.

## Making it again

1. Run `python3 -m http.server 8779 &` from the repository root.
2. Run `node tools/trailer.js`.

It needs Playwright and ffmpeg. Each run makes a new world, so the names and numbers change.
