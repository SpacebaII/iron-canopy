# 19 An enemy commander with an agenda

Wave 6. **Claude Fable 5.1.** Needs wave 5 (16, 17, 18) merged. Runs in parallel with 20, 21 and 22.

## What the owner asked for

> "The enemy commander should have a large agenda and things he will do, like target a city or highways. He seems very biased towards only my main airbase."

> "I want a good escalation, not just trying to murder you with deadly strikes immediately. The time scale should go with the player: the player should be winning for a decent bit before the heat really gets turned up."

> "The goal is to deliver an exciting moment that might shake things up for quite some time, before the enemy decides: no more playing around, let's actually try to damage this airport. That should not look like the funding just tripled. It should look like careful planning and strategy to really challenge the in-theatre assets the player has."

## What is there now

`enemy.js`:
- It picks a raid kind from a fixed ladder, then by escalation (`nextKind`).
- It picks an objective by weights (`chooseObjective`, `targets`). Airbases score high and grow with our fighters; ballistic raids favour airbases.
- It learns a little from how raids went (`learn`) and calms between raids (`calmFor`).
- Weapons come from sites with inventories (`S.esites`, `inv`).

## Goal

The enemy is a commander with a campaign, not a dice roll.

**An agenda the player can read.** The enemy has war aims: coerce the government, break morale, strangle trade, ground our air power. Each aim is served by target sets:
- cities and their power;
- motorways, bridges and railways;
- airports and trade;
- fuel;
- air defence and radars;
- airbases and shelters;
- command.

The commander plans operations toward the aims and keeps a plan for days, not raid by raid. Intelligence reports, news and the Minister give the player hints of what the enemy wants next, early enough to act.

**Escalation in acts, paced to the player:**

1. **Probing and gray zone.** Feints, drones and single missiles, with deniable harassment. A decent defence wins comfortably, and the player should feel good about what they built.
2. **Limited strikes on soft targets:** a power plant, a motorway bridge, a depot. Small raids chosen to test the player's reactions and learn where the defence is. The player is still mostly winning.
3. **The shock.** One memorable, surprising operation that shakes things up for a long time. Examples:
   - a coordinated night strike from an unexpected axis;
   - decoys that empty a battery first, then the real missiles;
   - a strike on something the player took for granted.

   It uses weapons the enemy has visibly saved for. Afterwards the enemy reassesses; there is a lull the player can feel.
4. **The deliberate campaign.** "No more playing around": a planned effort against the player's in-theatre assets:
   - suppression of air defence: hunting radars, anti-radiation missiles, jamming, decoys;
   - saturation timed against reloads and gaps (use task 17's magazines);
   - several axes at once;
   - cutting resupply;
   - then the airbase: runways, shelters, fuel.

   It is dangerous but fair: every loss has a visible cause the player could have countered.

**Real resources.** The enemy has finite stocks and production rates per weapon, and airbases with a real number of aircraft.
- It saves up for big operations, and that saving is what the player's intelligence can notice.
- Escalation comes from planning and stockpiling, never from sudden new money.
- Losses the player inflicts (launchers, sites, aircraft) set the enemy back visibly.

**Adapts to the defence:**
- It maps our coverage from what fires at it and routes around it.
- It targets batteries that are low on missiles.
- It avoids a layer that keeps winning, and switches aims when one fails.

It must not always pick the same target. Over a three-day Quick war:
- no single target set takes more than 35% of the weapons fired before act 4;
- the main airbase takes no more than 25%.

**Time goes with the player.**
- The Career's war acts and Quick war start the enemy's acts from the player's progress and strength, within limits. A strong defence brings act 4 sooner; a weak one gets more time.
- The owner wants the player winning for a good while first.

## Scope

In:
- `enemy.js`, except the flight of enemy aircraft (`IC.moveEnemyAir`, `arriveAir`), which belongs to task 21;
- war pacing in `campaign.js` (Quick war);
- the enemy's war beats in `story.js` (Acts II–IV);
- intelligence and news text;
- the enemy's side of the Intel room in `warroom.js`, in its own function.

Out:
- Missile flight and altitude (20), our air force and air combat (21), the 3D replay (22).
- The magazines themselves (17, merged).

## Done when

- `npm test` is green, with tests:
  - the enemy's target choice over a three-day Quick war meets the limits above;
  - the acts come in order, and act 4 does not start before the player has had a period of winning (set and justify the measure);
  - the enemy stockpiles before the shock, and intelligence reports it at least a few game hours ahead;
  - destroying a stockpile or a set of launchers delays the next big operation;
  - raids in act 4 aim at batteries that are low on missiles more often than chance.
- Every Academy lesson still completes, and the Career still plays through (the scripted players).
- The pull request has:
  - a balance run's timeline (what the enemy did, hour by hour, and why, in the commander's own log);
  - screenshots of the shock operation and of the Intel room;
  - what you could not finish.
