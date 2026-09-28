# 09 Replay in 3D and a tilted view

Replaced by [22](22-replay-3d-models.md).

## What the owner asked for

> "If we could break into 3D that'd be cool. Regular should likely stay 2D, maybe possible tilt like Door Kickers 2, but we should be able to have the cool Tacview knock-off, be able to show a missile hitting a skyscraper or a bulged fuel tank at an airport."

## Goal

The game stays a 2D map. Two additions:
- **A slight tilt** of the normal map (as in Door Kickers 2), to give buildings and terrain some depth.
- **A 3D replay window, like Tacview:** pick an engagement or impact and watch it in 3D from any angle. Missile tracks, aircraft, terrain relief, and the building, fuel tank or aircraft that was hit.

## Notes for whoever picks this up

- No build step or runtime dependencies, so the 3D view is hand-written WebGL (or Canvas 2D projection if that is enough).
- Record short histories of tracks and missiles in the step (cheap ring buffers) so any event from the last few minutes can be replayed.
- Scope this in the pull request before building: what the replay shows, how it opens, the frame budget.
