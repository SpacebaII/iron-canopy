# Audit: the 3D view (brief 67)

Seed 4242, Medium quality on a machine with no graphics card (SwiftShader). Stills from `tools/view3d-shots.js` and
the teaser's stills; launches frame by frame by `tools/launch-sheet-3d.js` (new), from a camera planted beside the
launcher. Worst first.

| # | Problem | Why it hurts | Status |
| - | --- | --- | --- |
| 1 | **Rounds jump out of their launchers.** The simulation starts a round at full speed on the launcher; drawn, it left along the canister at a fixed 300 m/s², then snapped onto its recorded path and its nose snapped round after 0.85 s. | The launch is the shot the owner named ("some weapons look so silly launching"). | Fixed: the recorded path is flown on a clock that starts still and catches the real one at the end of a launch window (2.6 s, shorter for short flights); the round leaves nose first from the canister mouth and bends onto its path; the nose follows the drawn motion and blends into the recorded attitude; the smoke is laid where the round was drawn (`launch/3d-before-lrsam.jpg`, `3d-after-lrsam.jpg`). |
| 2 | **A ground-launched cruise missile appears in mid-air**, level and at full speed, 30 m over its launcher. | Same. | Fixed: it goes up its canister's slope on a 2.5 s booster, then levels onto its path (`3d-before-lacm.jpg`, `3d-after-lacm.jpg`). |
| 3 | **A ballistic missile's lift-off** used a 2.5 g climb that doubled the climb rate where it met the record, jolted sideways and snapped its pitch. | Same. | Fixed: it rises from rest off the erector and pitches over onto the path on the same catch-up clock (`3d-before-srbm.jpg`, `3d-after-srbm.jpg`). |
| 4 | A ballistic missile's boost shows no smoke column in the launch sheets at Medium. | The launch reads small and clean. | Not fixed: check at High, then thicken the boost smoke. |
| 5 | Grass tufts close to a low camera are huge smeared straws; motion blur smears the terminal on a slow machine. | Ruins any ground-level airport shot. | Not fixed. |
| 6 | Clouds look like stretched brush strokes. | Visible in every sky. | Not fixed. |
| 7 | Terminals and city blocks are plain boxes by day (windows only at night). | Reads as a prototype close in. | Not fixed (the style pass, #79, chamfers vehicles and sites only). |
| 8 | The dusk airport from above looks good (`trailer/still-calm`). | | Kept as the 3D b-roll opener. |

The 3D view's own checks (`node tests/view3d.js`: nothing made per frame, every preset, every weather) pass.
