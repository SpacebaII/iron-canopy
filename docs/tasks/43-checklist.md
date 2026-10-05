# 43 Combat you can see: working checklist

Branch `wave11/combat`. Order of work:

1. [x] Missile energy simulation; defending (notch, chaff, crank); longer ranges
   - `flight.js`: `IC.MSL` (motor, peak speed, spent speed, g), `IC.mslInit`, `IC.mslFly` (guidance, seeker, illumination with a few seconds of coast, the notch, decoys, energy lost to drag and turns, the fuse, passed above or below, spent), `IC.mslTime`, `IC.mslNez`, `IC.defendPlan` (react, crank, notch and dive, chaff or flares, drag, recommit). The drag is set shot by shot so that a straight shot reaches exactly what `IC.REACH` says: one table of reach.
   - Wired in: our SAMs (`defense.js`, `IC.newMissile` with every field declared), our fighters' missiles and the enemy fighters' (`air.js` `IC.launchAAM`), enemy aircraft defend in `enemy.js`, ours in `air.js`.
   - Reach toward the real ones: SR 25 km, MR 90, LR 200 (75 against a sea-skimmer), IR 8, imaging IR 12, fighters' radar missile 90 (theirs 80), fighters' radar 120 km; battery radars grown to match. `IC.AAMS` rows moved into `IC.REACH` (`AAM`, `SRM`, `EAAM`, `EIR`).
2. [x] Being shot at, visible; combat time
   - `combat.js` (headless): `IC.inbound` (time to impact, aim, target), locks (`IC.lockedOn`, `IC.combatLock`), `IC.combatTime` (main.js eases the clock), records, splash, day summary, streak.
   - `render-warn.js`: predicted paths, aim crosses, countdowns, pulsing rings on the target, lock lines and LOCKED, MISSILE with time to impact, DEFENDING and the crew's manoeuvre, drone groups counted, SPLASH with the track struck through, edge arrows, raid tally, combat-time badge. Drones drawn larger with a longer heading line. Sounds: lock tone, missile warning, drone buzz.
   - The Combat time setting replaces "slow motion on big moments" (the cinema bars stay).
3. [ ] Reach and mobility
   - [x] Extended-range round (`LRE`, research `a_lre`) and the very-long-range battery (`vlrsam`, `VLR`, research `a_vlr`)
   - [x] Engage on remote (it was there: a test proves it)
   - [x] IR reach 8–12 km
   - [ ] Remote launchers, airborne early warning for low targets (partly there), gaps shown on the coverage layer and suggested
   - [ ] Mobile launchers: faster, fire on the move, Intercept and Hunt orders, shoot-and-scoot for all mobile units
4. [ ] Spectrum of enemy activity, quick-reaction alert, raids that abort
   - [x] Raids that abort: lost jammer, lost escort, half the strike aircraft down (`raidBreak` in `enemy.js`); bombers and SEAD packages fly with an escort
   - [x] Probing fighters turn back when one of our fire-control radars holds them
   - [ ] Quick-reaction alert scoring in peacetime and the gray zone
5. [x] Feeling that you won: splash, tally, result card (grade, spent against saved), day summary, streak, records in the panels, the Prime Minister's rise said out loud, enemy losses in Intel
   - [ ] The 3D replay's highlight reel (42 owns the cameras)
