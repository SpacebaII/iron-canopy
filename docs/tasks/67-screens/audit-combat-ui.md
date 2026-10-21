# Audit: combat on the map, film mode and the interface (brief 67)

Seed 4242, the Sandbox (`mode: 'test'`), a "big one" raid of 40 on the capital from across the border, at 12:00 and
23:00, in normal play and in film mode, at the regional (z 0.3), city (z 2) and close (z 12) zooms. Stills by
`tools/fidelity-combat.js`; launches frame by frame by `tools/launch-sheet.js` (both new). Worst first, with why it
hurts a trailer.

| # | Problem | Why it hurts | Status |
| - | --- | --- | --- |
| 1 | **Weapons pop out of their launchers at full speed.** The simulation's missile leaves at its top speed from the launcher's centre on its first step; the drawn one did the same, with a round flash ball over it. No boost, no climb, no pitch-over (owner: "some weapons look so silly launching"). | Every launch shot is the money shot of a defence trailer; a missile that teleports a few pixels per frame from frame one reads as a game bug. | Fixed in code, not yet filmed: a drawn boost phase (`boost()` in render-combat.js): the missile starts at rest in its launcher, accelerates along the line to the simulation's missile and catches it at the end of its boost (1.2–4 game s by class, 0.15–1.4 s of real time so it shows at 32× and does not drag in slow motion), rising off the launcher first (`CLS.climb`) so vertical launchers climb and pitch over; the flame grows from the tube, smoke puffs come three times as often during the boost; the simulation's flat launch flash ball is no longer drawn over it. |
| 2 | **Ballistic missiles are strings of glowing pearls.** Each warhead's re-entry glow was a round sprite 20–30 px across; a salvo coming down reads as a row of balls (film mode, both hours). | The re-entry streak is the most dramatic thing in the sky; balls look like a placeholder. | Fixed in code: a tapered plasma streak along the warhead's line (the flame sprite stretched to 40–100 px) with a small hot head. |
| 3 | **A missile in flight is a ball of light.** The motor glow was a round sprite (6 + length) px, larger at night, that hid the missile (the 2D form of brief 63's complaint). | From afar every weapon is the same white dot. | Fixed in code: a shaped flame sprite (white core, yellow sheath, shock diamonds) along the missile's own line from its tail, and only a small light round the nozzle. |
| 4 | **Explosions are flat discs.** A blast was round glow sprites in a sphere and a ring; at noon a big hit is a white blob (`noon-film`). | Explosions are what the trailer cuts on. | Fixed in code: a spiked star flash for an instant, a fireball of 7–13 lumpy fire billows (noise sprites made once) thrown out and up that burn white to orange and darken into the soot they leave, smaller light, then the existing sparks, debris and smoke. |
| 5 | **Smoke and fire are soft balls.** Every smoke, dust and steam puff was the same radial gradient; smoke columns were flat circles of one grey. | Smoke is most of what stays on screen after a hit; identical balls look procedural. | Fixed in code: four noise-shaped variants each of smoke, soot, dust, steam and fire, lit from the upper left; smoke columns drawn from them. |
| 6 | **Fires are one glowing dot** and do not light the ground at night. | A burning fuel farm at night is the overhead shot. | Fixed in code: flame tongues that lick up and shrink, a wide warm ground light at night, and smoke from the fire's own bed close in (pooled particles). |
| 7 | **Transient white-out of the whole screen** in normal play at noon during the ballistic salvo on the capital, at the city and close zooms (`noon-city`, `noon-close` before), lasting several seconds. | Unusable footage; also bad in play. | Not fixed: not reproduced in a second run at the same moment; suspect a large additive glow from the old explosion or flash sizes (several are gone with fixes 3 and 4). Needs a re-run of `tools/fidelity-combat.js noon` to confirm. |
| 8 | **The start screen backdrop is a dead, near-black dashboard** with unit symbols and labels under the menu, and nothing moves. | It is the trailer's first and last frame. | Fixed in code: the map behind the start screen is drawn as a film shot (no symbols or labels, the film grade, bloom and vignette, `IC.film.backdrop`), the camera drifts and pushes slowly over the capital to the right of the menu (`startDrift` in main.js), the overlay is lighter on the right, and the kicker, title (opening out from blur), tagline and mode cards come in one after another. |
| 9 | **Film mode, cruise missiles close in are faint dots** with a barely visible trail (`night-film-close`). | The "cruise missile over the fields" shot has no subject. | Not fixed. Next: a brighter young trail and the model drawn larger at z 1–3. |
| 10 | **Radar tracks jump at each plot** in normal play (symbols and heading lines move only when a radar sees them). | Judder on every hostile symbol. | Not fixed. Next: dead-reckon each track from its plot by its velocity and ease the correction at the next plot (a WeakMap in render-combat.js, no fields on the threat). |
| 11 | Panels and the war room close with a hard pop (they open with an ease). | Visible in any interface b-roll. | Not fixed. |

## Not done, and why

Partway through, the shell became unavailable to this worker, so the fixes above after the first group are not yet
syntax-checked, filmed, timed or tested, and nothing is committed. To finish:

1. `node --check iron-canopy/js/render-combat.js iron-canopy/js/film.js iron-canopy/js/main.js`
2. `node tools/launch-sheet.js` (and with `--root=` on the base branch for before) and look at each contact sheet;
   `node tools/fidelity-combat.js noon night bal ui` for the after stills.
3. `node tools/combat-shots.js perf` on both checkouts (40-weapon raid frame times).
4. `node tests/run.js film`, `combat`, `sandbox`, `academy`, then `npm run test:quick`.
