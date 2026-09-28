# 21 The air war: clear intercepts, more capability

Wave 6. **Claude Fable 5.1.** Needs wave 5 (16, 17, 18) merged. Runs in parallel with 19, 20 and 22.

## What the owner asked for

> "The military air needs a bit more refinement. It's hard to pick an aircraft to intercept, since it blinks and moves around. As well, I want that system a bit overhauled: more capability. But set up some clear, supportive, cool goals for that yourself."

## What is there now

- `air.js`: our squadrons (`S.roster`), launches through ground operations, missions (CAP, intercept, supply, strike), fuel and a few weapons.
- Enemy aircraft fly in `enemy.js` (`IC.moveEnemyAir`, `arriveAir`).
- Tracks come from `sensors.js`: they appear and disappear with radar sweeps, which makes them blink and jump.

## Goals

The coordinator set these goals.

**1. Tracks you can pick.**
- A track does not blink. Between sweeps it coasts on its last speed and heading, drawn as a steady symbol. It fades to "lost" only after a set time, with its uncertainty shown as a growing ellipse.
- Clicking near a track selects it; the selection holds while it moves.
- An **air picture list** sorts tracks by threat and time to target. Click a row to select the track; keys cycle through hostiles.
- Grouped tracks (a raid of eight) select as a group, and split when they split.

**2. An intercept in three clicks.**
- Select fighters, click a track, and see the intercept point, time to get there, fuel left after, weapons and the kill chance. Then commit.
- Vectors are drawn on the map.
- Fighters can be re-tasked in flight, told to return, or told to hold.
- The player never has to chase a moving symbol with the mouse.

**3. More capability:**
- **Alert states per squadron:** 5, 15 or 30 minutes to launch, which cost crew fatigue.
- **Combat air patrol stations** drawn on the map, with endurance and relief shown.
- **An airborne early-warning aircraft** whose orbit extends low cover over hills and the border. Fighters under it can see low cruise missiles.
- **Tankers** that extend patrols.
- **Air-to-air missiles with real ranges by altitude.** Use task 20's 3D flight and envelopes; agree the interface in the first commits.
- **Visual identification** of an unknown: a fighter can close in, and see an airliner that is off its route or a hostile one without a transponder, before anyone fires.
- **Escorts** for our transports and helicopters.
- **Losses and fatigue:** aircraft and pilots are lost, repaired and replaced over time.

**4. The enemy's aircraft fly like aircraft:** formations, patrols, escorts, running away when locked, and fuel.

## Scope

In:
- `air.js`;
- enemy aircraft flight in `enemy.js`, only `IC.moveEnemyAir` and `arriveAir`;
- tracks in `sensors.js`;
- the air picture list and intercept controls: a new file `render-air.js` for map drawing, and panels in their own functions in `inspector.js` and `warroom.js`;
- aircraft types in `data.js` (the air section only).

Out:
- The enemy's decisions (19), altitude and airspace (20, but you call its flight and envelope code), the 3D replay (22).

## Done when

- `npm test` is green, with tests:
  - a track stays selectable and steady across radar sweeps for a set time after contact is lost;
  - a fighter launched from 5-minute alert is airborne within 5 minutes;
  - an intercept commits, flies to the predicted point and engages;
  - fighters under an early-warning orbit see a low cruise missile that ground radar behind a hill does not;
  - visual identification tells an off-route airliner from a hostile before firing;
  - a combat air patrol is relieved before its fuel runs out when relief is available.
- Every Academy lesson still completes. The Academy's airbase lesson may be extended to teach the intercept flow.
- The pull request has:
  - screenshots or frames of the air picture list, an intercept being set up, and the early-warning aircraft's cover;
  - what you could not finish.
