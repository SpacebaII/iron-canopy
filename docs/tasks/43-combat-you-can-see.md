# 43 Combat you can see, that lasts, and that you can win

Wave 11. Absorbs 31's second part (the missile energy simulation, never done). Owns `flight.js` missile flight, `defense.js`, `air.js`, `threats.js`, `enemy.js` raid shape, `render-combat.js`, `incidents.js`, and the after-action report. Coordinate with 42, which owns the 3D cameras.

## What the owner said

> "Make getting shot at much more visible. I think increasing everything's range is kind of how that is done. You never see real notching or long defending, and drones are very fast and hard to see. There's not a lot to shoot at regularly: it's either shoot or die, always. It never feels like you won."

## Why it feels that way now

- **Missiles fly at a constant speed** and most shots end in seconds.
  - Notching and chaff exist as dice rolls, not as something that happens on screen over time.
- **Time.** Drones fly at a real 180 km/h, but at 16× a drone crosses 8 km of map every real second.
  - Nothing slows the clock when weapons are in the air unless something "big" happens.
- **Being targeted is invisible.** A battery or fighter that is locked or has a missile inbound looks the same as one that is not.
- **Raids are all-or-nothing.** The enemy either sends something that must be shot down or does nothing.
  - There is little in between to react to, no retreat, and no moment that says "you won this one".

## Goal

**1. Longer ranges, longer engagements (the missile energy simulation from 31):**
- **Missiles have a motor that burns for seconds, then coast and slow** with drag by height, and lose energy in every turn.
  - A long-range shot at 100 km takes 2–3 minutes; an air-to-air shot at 45 km 60–80 s.
  - Their no-escape zone is much smaller than their maximum range.
- **Detection and weapon ranges grow toward the real ones,** so fights start further out and last longer:
  - fighters' radars;
  - air-to-air missiles;
  - long-range SAMs against high targets;
  - enemy fighters' and bombers' stand-off weapons.
- Keep `IC.REACH` as the single table of reach by height. Rebalance so the Quick war and the Career stay winnable (run `econtest.js quick`, `tools/enemy-timeline.js`).
- **Defending as a real, visible manoeuvre that takes time:**
  - the target turns to beam the radar (notching) and dives;
  - it drops chaff or flares;
  - it cranks away to bleed the missile's energy;
  - it turns back in when the missile is spent.
- **The missile can:**
  - lose the lock;
  - be decoyed;
  - run out of energy;
  - pass above or below;
  - hit.
- The outcome follows from geometry and energy, with a small roll only at the end.
- **Our fighters defend the same way,** and so do enemy fighters against our shots. Long, readable fights, not coin flips.

**2. Being shot at, visible everywhere:**
- **On the map:**
  - every inbound weapon draws its track, a predicted path, the aim point and a countdown ("impact in 1:40");
  - a warning ring pulses on what it is aimed at.
- **Locks are visible:**
  - a battery or aircraft painted by an enemy radar shows it (a lock line and "LOCKED" tag);
  - a missile launched at it flashes a MISSILE warning with the time to impact, like a radar warning receiver;
  - defending shows ("DEFENDING · notching") until the missile is spent.
- **Launch flashes and smoke trails** at every zoom, for theirs and ours.
- **Edge-of-screen arrows** for weapons off screen, sorted by time to impact.
- **Sound cues:** a lock tone, a launch warning, a missile warning.
- **Drones are easy to see:** bigger symbols with a short trail and a heading line, a buzzing sound when close, and a count ("12 drones, 6 min out").

**3. Combat time:**
- When hostile weapons are in the air near what the player is watching, the game eases down to a watchable speed (1×, or 0.5× for the last seconds of an intercept) and back up when they are gone.
- It is a setting, on by default. Skip still stops for them.
- It replaces the one-breath slow motion for "big moments".

**4. Something to fight regularly, not only shoot-or-die:**
- **A spectrum of enemy activity between quiet and a raid:**
  - reconnaissance drones to hunt;
  - fighters probing the border that turn back when locked (a win without firing);
  - jammers standing off;
  - low helicopters;
  - decoys that waste your missiles if you shoot them;
  - a single cruise missile at a radar;
  - drone swarms in waves;
  - escorted strike packages.
- **In peacetime and the gray zone, quick-reaction alert:** scramble fighters to intercept, identify, shadow and escort an intruder out, or force it to land. Scoring comes from doing it right, not from killing.
- **Raids that can break:** the enemy aborts a raid when it has lost too much or its escort is gone.
  - Tracks turn back on the map with "RAID ABORTED".
  - A package that loses its jammer turns home.

**5. Feeling that you won:**
- **Kill confirmation** on the map (a clear burst, the track struck through, "SPLASH").
- **A running tally** for the raid: "14 of 16 stopped".
- **A raid ends with a clear result card:**
  - what came;
  - what you stopped;
  - what got through and why;
  - money and stock spent against damage prevented;
  - a grade.
- **A day's summary** and a streak ("3 raids held").
- **Consequences:**
  - morale and the Prime Minister's confidence rise visibly after a held raid;
  - the enemy's losses show in Intel ("they have 40% fewer long-range drones than last week");
  - pilots and batteries earn a record (kills, missiles defeated) shown in their panel.
- **The 3D replay's highlight reel** (42) picks up the best intercept.

**6. Reach and mobility (the owner, later: "although 100 km is large there are still a lot of gaps that a much longer SAM needs to reach; IR needs a bit more range, it feels useless or heavily micromanaged; mobile launchers need to be faster and able to fire on the move … to move to intercept"):**

- **Very long range.** A research line of upgrades for the long-range battery and a new very-long-range system, with their own stock, cost and research:
  - an extended-range round at about 250 km against high targets (much less low down, per `IC.REACH`);
  - a very-long-range interceptor at about 400 km for aircraft, AWACS, tankers and jammers standing off, with its own fire-control radar; expensive, few rounds, slow to reload.
- **Filling the gaps (fewer holes, not only bigger circles):**
  - **Engage on remote:** a battery fires on a track from another radar (a 3D radar, an airborne early-warning aircraft, a gap filler) through the air defence network, so its reach is its missile's, not its own radar's.
  - **Airborne early warning** that sees low targets past the hills.
  - **Launchers placed away from their radar** (remote launchers, 5–20 km forward), linked by the network.
  - **Show the gaps.** Where the cover is thin by height is shown on the coverage layer, and the staff suggest where one more launcher or radar closes the biggest hole.
- **IR that is worth having:**
  - man-portable IR to about 8 km and the imaging IR to about 12 km at low level;
  - a vehicle-mounted IR launcher (4–8 ready rounds, its own search sensor, fires on the move) to about 12–15 km;
  - IR teams take care of themselves: they cue off the network, pick targets by threat and do not waste rounds on decoys when they can tell. No micromanagement needed.
- **Mobile launchers that act mobile:**
  - Mobile units drive faster, off road at a real cross-country speed and on roads at road speed.
  - Short-range and IR vehicles fire on the move (with a small accuracy cost); guns fire on the short halt.
  - Semi-mobile batteries still need to set up.
  - **Move to intercept:** order a mobile unit to "Intercept" a raid and it drives to where the raid will pass and engages. Or put it on "Hunt" in an area, where it moves toward drones the network sees.
  - Shoot-and-scoot: after firing, a mobile unit can move before counter-battery fire arrives.
  - **Balance** cost and upkeep so a mobile screen is a real choice against fixed batteries.

## Done when

- `npm test` and `npm run qa` are green, with tests:
  - a long shot takes minutes and coasts;
  - a notching target defeats a shot at long range and not one inside the no-escape zone;
  - a locked battery shows it;
  - combat time slows the clock and restores it;
  - a raid that loses its escort aborts;
  - a probing fighter turns back when locked;
  - the raid result card counts right;
  - engage-on-remote reaches past a battery's own radar;
  - a short-range vehicle hits while moving;
  - an Intercept order meets the raid;
  - IR reaches 8–12 km;
  - every Academy lesson still completes.
- Balance runs are printed in the pull request: `econtest.js quick`, `tools/enemy-timeline.js`, and the Career's Act IV in `storytest.js`.
- The pull request has clips, frame by frame, of:
  - a long SAM shot and a notch;
  - a fighter duel;
  - a drone wave with combat time;
  - a raid that aborts;
  - the result card.
