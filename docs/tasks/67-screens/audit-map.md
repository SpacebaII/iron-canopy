# Audit: the 2D map (brief 67)

The map from the whole country to the gate, from one seed: a Quick war, `IC.S.seed = 4242`, 15 game minutes in, the
coverage layer off and the enemy held still. `node tools/map-shots.js <tag> [scene …] [--root=checkout]` takes every
still below on the held film clock (`shots/map-<tag>-<scene>.png`). `node tools/motion-probe.js <tag> --speeds=1,8,32
[--detail]` films the capital airport frame by frame and measures the motion. The base is the branch this lane started
from (3f8d8f5).

The stills are in `67-screens/map/`, as `before-<scene>.jpg` and `after-<scene>.jpg`: country (z 0.03),
night-region (z 0.3 at 23:00), city (z 3), apt25 (the runway at z 25), gate200, dusk, night-gate, snow, rain, coast.
The motion contact sheets are `motion-before-x8.jpg` and `motion-after-x8.jpg`.

## The worst problems, in order

1. **Aircraft on the ground snapped and slid (fixed: 5851e25, d820561).** The simulation moves an aircraft along
   straight taxiway pieces and turns it at each node in one step. The map drew exactly that, so the nose jumped up to
   99° in a frame at 8× and 130° at 32×, aircraft slid sideways up to 80°, and pushbacks ended in a pivot. The map now
   draws each aircraft from its own eased pose (`IC.movePose`, draw-only, not saved). The lag is about 30 m at 1× and
   never under three frames. The nose turns at most 23° a game second and 17° a frame, and the aircraft moves along
   its nose (or its tail when pushed), so a corner is driven round. The runway phases keep almost no lag, so take-off
   hands over to the airborne track where it is.
   Motion probe, before → after:

   | Speed | Heading snaps over 12° | Largest snap | Sideways slip, 95% / max | Jerk, max |
   | --- | --- | --- | --- | --- |
   | x1 | 0 → 0 | 0° → 0° | 0° / 0° → 0° / 0° | 0.9 → 0.06 px |
   | x8 | 6 → 13 | 99° → 17° | 0° / 28° → 0° / 15° | 20 → 9 px |
   | x32 | 19 → 66 | 130° → 34° | 43° / 89° → 25–40° / 72–83° | 63 → 86–275 px |

   At 8× the turns are now spread over several frames at 17° each, which is why more of them count as over 12°.
   **Not fixed at 32×: the take-off roll.** At 32× a whole lineup and take-off roll lasts about three frames, so the
   drawn aircraft accelerates by tens of pixels a frame and still finishes its lineup turn on the runway. Smoothing it
   further would need the runway phases to lag behind the simulation, which breaks the handover to the airborne track.
2. **The camera's fly-to lurched (fixed: 817b485, d820561).** The old flight eased out only, so its first frame was
   its fastest: 11.6× the average step, and 14.3× at its largest. It also zoomed in pixels per unit, so it raced through
   the far zooms and crawled close in. Now it is a timed flight of 0.45–2.4 s, the zoom changes in log terms on a sine
   ease, and the pan keeps the target (zooming in) or the start (zooming out) gliding steadily across the screen. The
   first step is now 0.55× the average and the largest 2.1–2.3× (the sine's own peak is 1.6×; the pan adds the rest).
   A wheel notch or zoom button now eases in over about a sixth of a second instead of jumping; a pinch still follows
   the fingers at once.
3. **Road and service vehicles jumped at every bend (fixed: 5851e25, 285b8cb).** Cars, buses and trains followed
   polylines point to point, turning at once at each corner. Airport vehicles slid at their stands and spun 180° in
   one frame when reversing. Road agents now round each link join, trains, buses and slots round each corner, airport
   vehicles follow a curve round their corners, and a reversal turns over a short distance.
4. **At night the terminal and the whole landside stayed in daylight (fixed: 817b485, 285b8cb).** Each airport graded
   only the inside of its fence, and the map's grade left airports out, so a terminal on the fence line and the car
   parks and roads beyond it were a white slab in a dark map (`before-night-gate`). Each airport now grades the union of
   its fence and its buildings' outlines, and the landside is drawn before the grade. A pixel on the terminal roof went
   from (186,188,189) to (46,52,78).
5. **The coverage layer tinted everything teal (fixed: 817b485).** At 50% everywhere, it washed out the airport and
   the city close in. It now fades from z 1 to z 4, to a quarter of its far strength.
6. **Water was flat ink (fixed: 817b485).** Lakes and rivers were one dark blue with a hard edge (`before-coast`). Lakes
   now have shallows that lighten towards the shore. Water has a moving ripple pattern, a sheen and sun glitter by day,
   and rivers carry the same pattern.
7. **Forest was a staircase from the region out (fixed: 817b485).** The forest density was sampled in 2 × 2 blocks
   with hard steps, so every wood was made of squares at z 0.03–0.3 (`before-country`). It now interpolates between
   the samples.
8. **Night cities were dim from the region (fixed: 817b485).** From z 0.3 a city at night was a few orange dots
   (`before-night-region`). It now has a sky-glow, warm haze over its reach that fades in as the camera pulls out.
9. **Snow fell on a green country (fixed: 817b485).** It snowed over summer fields (`before-snow`). The ground now
   whitens under the snow, in drifts from the cloud pattern, and stays white for a while after it stops.
10. **Buses were 400 m red bars and call signs piled up (fixed: 5851e25).** A bus at the middle zoom was drawn at its
    slot's length, a red bar several blocks long (`before-air`). It is now a short bus, its length growing only a
    little with the zoom, in a muted red. Call signs at a busy airport were drawn on top of each other; they now go
    through the map's label placer (`IC.LBL`), so none covers another.

## Further problems seen, not fixed

11. **No contrails (added: 817b485).** Airliners and bombers above 8 km now leave a fading trail drifting with the
    wind, at the region zoom. It is subtle at the zooms in these stills.
12. **Dusk and dawn look muddy.** The grade's golden hour is a soft-light orange over a desaturated map, and it reads
    as brown haze rather than low sun. It needs long shadows or a warm key from the sun's side; not attempted here.
13. **Rivers loop back on themselves (`coast`).** These are generation shapes (meanders that curl into hooks), not
    drawing: out of this lane.
14. **The terminal roof is flat dark at night.** Now that the night grade reaches it (item 4), the skylights no longer
    read as lit. A glow for lit roofs, drawn after the grade like the apron floodlights, would bring them back.
15. **The forest from the country zoom still reads as camouflage.** The staircase is gone, but the blotches are the
    same size everywhere. Breaking them up needs a second noise octave in the density field, which is world
    generation.
16. **The take-off roll at 32×** (item 1).

## Performance

`tools/world-perf.js --views` (the real Denver with 164 aircraft moving), on this sandbox's headless Chromium without
a graphics card. The absolute numbers are far over budget on both checkouts; only the comparison means anything:

| View | Base: frame / drawing (median, ms) | This branch: frame / drawing (median, ms) |
| --- | --- | --- |
| Whole map | 34.5 / 27.5 | 29.8 / 26.8 |
| Airport, z 20 | 87.7 / 78.4 | 89.5 / 84.0 |
| Airport, z 40 | 85.6 / 78.4 | 88.1 / 84.1 |
| Airport, z 80 | 89.9 / 84.7 | 92.4 / 91.9 |
| Capital, z 4 | 59.4 / 46.9 | 61.0 / 60.9 |
| Capital, z 12 | 39.4 / 43.0 | 36.8 / 26.6 |
| Capital, z 30 | 43.3 / 42.2 | 45.2 / 36.6 |

`tools/frame-prof.js --only="capital z 4"` gives the same functions in the same shares on both, 74 and 80 ms a frame,
mostly tile painting (`getImageData`), with no new hotspot. The traffic slot placement (`IC.trafficVisible`) went from
1.10 to 1.28 ms with the rounded corners in a headless timing, and passes the traffic test's budget. The simulation
step is untouched.
