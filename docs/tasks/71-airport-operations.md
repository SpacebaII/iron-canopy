# 71 Airport operations: incidents, their response and building that feels like a game

Stacked on brief 64's branch (PR #91). Owns the airport's day-to-day incidents (`airops.js`, `render-ops.js`), the "Operations now" section of the airport panel, the building site's stage bar and Rush, and the Airside operations base. Leaves turnarounds, staff and the landside as they are: the work stays at the layout's level, never Airport CEO micromanagement.

## What the owner said

> "I need a agent to work on the operations side of the airport make sure it feels like a proper game make sure processes have things like time maybe even a status bar make it so accidents can happen and make building the airport actually fun so it might do a bit with adding new structures or just changing how some of our current ones are built and that's pretty easy but we need that feeling like a game"

## What was there

- Accidents were rare and final (a crash, a wreck, an accident report). Nothing smaller went wrong at an airport, so a day ran the same whatever the player had built.
- A stand's turnaround had a clock (`drawTurnClock`) only close in; there was no view of what the airport was doing right now.
- A building site showed its stage in words; nothing said how long it had left or let the player hurry it.

## What changes

**1. Incidents with stages and a bar.** An incident is a list of stages, each with its real duration (`ap.incs.list`, `IC.OPS_STG`), drawn on the map as a pill with a progress bar over the spot, and in the short list under the top bar with its buttons. Each has a cause the player can fix:
- **Debris on the runway** (`IC.OPS.debris` per movement, more on worn pavement, near patched craters and under heavy jets). A crew reports it and the player has 4 minutes to decide: close the runway and sweep it, or keep it open. Kept open, each movement over it has a 5% chance of damaging the aircraft; at night or after 2 hours the tower closes it anyway. Unanswered, the tower closes it.
- **Runway excursion**: an arrival in gusts beyond its crew's limit, or on a wet runway only just long enough, runs off the side: six times the crash risk of gusts or a tailwind, and on a short wet runway three quarters of its crash risk ends in the grass instead of in a crash. The fire trucks go out, the passengers leave by the stairs, a crane and lorry lift it back, a tug tows it off, the runway is inspected. Closed throughout; arrivals hold or divert.
- **Fuel spill** at a stand refuelled by truck (more when the airport is short of fuel trucks). The stand closes; it burns if the fire trucks are slow (`IC.fireTime` over 4 minutes); foam, then the clean-up.
- **Wingtip strike** at pushback: tight stands, too few tugs, the dark. Both aircraft are checked; the struck one is grounded.
- A survived **bird strike** grounds the aircraft for its check.
A damaged or grounded aircraft says why on its panel ("Grounded at stand B4: engine damaged by debris, 2 h 40 min to go") and costs the airline's and the airport's satisfaction.

**2. The Airside operations base** (`IC.APART.opsbase`, 80 × 50 m, ₭40M, in the Fuel & services tab): sweepers, the recovery crane, follow-me cars. Its vehicles drive out to each incident from it, so where it stands decides how fast they arrive; without one a contractor comes from town in 20 minutes and the work itself is slower. The build plan says how long its sweepers take to reach each runway.

**3. Rush.** Any clean-up stage or building stage can be rushed: an incident for ₭3M, a building job for 30% of what is left of it (at least ₭2M). Either halves the time left.

**4. Building sites read like a game.** Each site carries a segmented bar of its six stages under its label, the label says the stage and the time left ("PAVING (RUSHED) · 1 h 20 min"), the panel's works list shows a bar and a Rush button. When a new runway or apron opens, its first landing or first aircraft parked shows on the map ("the first landing on 09R").

**5. Operations now** in the airport panel: incidents with their bars and buttons; each runway's state (departures and arrivals this hour, closed and why, works); the turnarounds under way with their clocks; the last incidents. On the map each occupied stand has a turnaround ring (amber while it runs, green when ready, red when held or grounded) and the head of a departure queue says how many are waiting.

## How it turned out

- At the capital (the network preset) there are about four to five incidents a game day, most of them debris and spills. A debris closure takes about 47 minutes with no base and about half that with a base beside the runway.
- In a scripted Career (`careerplayer.js`, a month a live day, 12 game days, two seeds) the first airport and the second city's see about 1.5 incidents a game day: 6–9 fuel spills, 4–7 debris, 1–3 wingtip strikes and 0–1 excursions, no airport with an ops base. Spills take about an hour, debris 46 minutes, a strike's check up to 2 hours, an excursion about 2½ hours.
- The first balance run had runway excursions every few days at the first airport: its 3 km runway is short for a wide-body in the rain, and the excursion came on top of the crash risk the game already had for that. Now the excursion takes the place of most of those crashes (`IC.OPS.overrunExc`), so a short wet runway gives about as many bad landings as before, most of them survivable and closing the runway for hours rather than a wreck.
- Incidents are saved and carry on after a load.
- The words: every stage has a sentence of what is being done, every pill says the kind and the time left.

Pictures in `71-screens/` (`node tools/ops-shots.js`).

## Tests

- debris waits for the call; closing the runway holds arrivals until it is swept
- unanswered the tower closes it; kept open, aircraft over the debris get damaged
- an operations base near the runway clears debris sooner than the contractor
- an arrival off the side of the runway closes it until it is lifted back, then taxis in
- a fuel spill closes the stand and holds the aircraft on it
- rushing a building job costs extra and halves the time left
- an incident under way is saved and goes on after loading
