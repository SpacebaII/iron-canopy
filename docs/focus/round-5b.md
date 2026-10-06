# Round 5b: depth

Round 5a measured us against Airport CEO and SimAirport and found the civil half hollow in places: departures stuck for days and blamed on fuel, debt with no consequence, an empty night, one number for what airlines think, and no ground fleet. This round fixes the two bugs and adds four systems. Each system works without the player touching it, and each has a tutorial that waits for the player to do the step.

Screenshots are in `docs/focus/round-5b/`. The playthrough tool is `tools/round5b-play.js`.

## What changed

### D1. Stuck departures (bug B1), fixed

**The cause.** The take-off check asked for the type's runway length plus 5% and 100 m. Everything else used the type's length alone: `IC.aptStats` (maxType), deals, founding and landing. So the Starter's 3.0 km runway took 2.9 km freighters in and never let them out:

- an MD-11-class freighter (`cargo`, 29 units) needed 31.45 units to take off;
- `IC.gopsDepart` returned nothing every 5 minutes;
- `tl.fuelWait` added 300 s each time;
- the map called that a fuel queue.

The 747 and A340 classes (`jumbo`, `widel`, 30 units) were caught the same way.

**The fix.**
- Take-off now needs the type's runway length, the same number every other check uses (`toNeed` in `groundops.js`).
- Each hold on a stand is recorded with its own reason (`tl.held = { k, t0, why }`, `IC.HOLD`): night, no fuel, fuel truck, light aircraft, airway release, runway, wind, taxi route, slot, cap, tug, bus.
- The map, the fuel farm, the boards and the aircraft's panel say the real reason. For example: "Ready at stand 3, held 25 min: no open runway is long enough to take off: a cargo freighter needs 2.9 km, the longest open has 2.4 km".
- Each reason has its own marker (`IC.aptHolds`, `problems.js`), with a fix where one exists.
- A departure held for 6 hours by something that will not pass on its own (runway, taxi route) is cancelled with its cause, and the aircraft goes off the route. A stuck aircraft no longer blocks a stand for days.
- A departure that cannot be planned is checked before it takes an airway release, so it no longer holds back the others.

### D5. Money with consequences (B2), and an honest Wait (B3)

- **Below zero, the Treasury steps in** (`IC.redTick`, `growth.js`):
  - The builder and buying refuse anything that costs money now, and say why ("The Treasury has frozen new spending…").
  - A card offers an emergency loan at 2.5% a month over 24 months. That is more than twice the banks' rate. The loan clears the hole plus three months of the present loss, or at least a month of running costs.
  - The loan is also offered at the top of the Economy room and in the Wait bar.
  - Each month in the red costs the Minister's confidence 6, and the grant falls with it. Before Act III, confidence keeps its floor of 5, so Act I never ends in dismissal.
  - The card's default answer is "Cut costs ourselves". An unanswered card never borrows for the player.
- **Wait** no longer lists a target it says will never be reached. When nothing is reachable it says so, and shows the Economy room and the loan.

### D2 with D11. The day board: slots and caps, never flight by flight

The day board is in the airport panel: "The day: flights by hour, cap and night" (`schedule.js`, `dayBoardHTML`).

- **The game plans the day.** Each airline gets a profile by kind (`IC.PROFILE`), and the plan comes from its fleet's round trips (`IC.dayPlan`):
  - the flag carrier flies banks at 07–09 and 17–19;
  - low-cost airlines fly early and late waves;
  - regionals fly business peaks;
  - freighters fly at night.
- **The board shows:**
  - each airline's departures by hour, stacked in its colours;
  - the arrivals expected;
  - today's real movements as white ticks;
  - what the runways take, in dashed lines (`IC.aptStats`' `depPerHour` and `arrPerHour`).
- **The player adjusts three things**, each with its effect in words:
  - a **cap** on departures an hour. "The cap of 9 departures an hour moves 1 flight a day out of the busiest hours. Airlines count the wait as delay."
  - an airline's **bank**, an hour earlier or later;
  - the **night**:
    - *open*: anything flies;
    - *quota*: 4 movements an hour, a heavy jet counting two. This is the new default, so the night is no longer empty.
    - *curfew*: nothing lands or leaves 23:00–06:00. Inbound flights leave later so that they land after 06:00.
  - Each night option gives the fees it earns or loses a month.
- **In the step:**
  - A departure ready before its airline's next slot waits for it. The aircraft's panel says "its airline's next slot is at 08:00". A late departure catches up.
  - An aircraft circling for a stand lets a slot-holder go early.
  - Waiting for a slot is not a delay; waiting for the cap is.
- **Noise.** Night movements cost the nearest town morale, and a line in the journal says so.
- **Deals:**
  - the offer card shows the slots a day the deal needs;
  - under a cap, a deal needs room in the day (`dealNeeds` 'slots').
- The old curfew button and the deck's noise card set the same policy (`IC.setNight`).

### D6. Airline scorecards

- Each airline marks each airport from its recent flights there (`al.sc[ap.id]`, `IC.aptScorecards`). It scores six things from 0 to 100:
  - on time;
  - taxi time;
  - gates against remote stands;
  - fuel waits;
  - charges;
  - bags and check-in (how full the terminal is).
- The aspects sit side by side under "Airline scorecards" in the airport panel.
- The worst one is named with its fix, one click away:
  - a terminal placed;
  - a fuel tank placed;
  - charges lowered to a named level;
  - the day board opened.
- A mark under 45 also becomes a marker on the map.

### D3. Ground vehicles

This follows the owner's guidance: kept light, with no per-vehicle management (`handling.js`).

- **What the airport owns.** Tugs, apron buses and fuel trucks, as a count each. There is one row per kind with − and +, its running cost a month, and its price.
- **The recommendation.** Each row says what the airport needs, for example "Recommended 6 for 24 stands with pushback". The recommendation comes from the stands and the busiest hour.
- **Starting fleet and "Keep it matched".** Each airport starts with what its stands need, so the Starter comes ready. "Keep it matched" is on by default and buys or sells to the recommendation every 5 minutes.
- **Too few vehicles.**
  - A tug is needed to push back. A bus is needed at a remote stand.
  - Fuel trucks now set the refuellings an hour (four each). They are no longer two per tank.
  - A shortage is a named hold: "1 departure held 6 min: waiting for a tug", with "Buy 1 tug (₭1.5M)" as its fix (`25-tug-hold.jpg`).
- **On the map.** Free vehicles park on a small depot pad beside the fuel farm (`26-depot.jpg`).
- **Running costs.** The vehicles' running costs join the airport's.

### Tutorials that wait for the player

There is one shared helper (`tutor.js`) that 5c can reuse for every other feature:

- **What a tutorial is.** `IC.TUTORS[id]` is a list of steps `{ el, title, text, on, seen }`.
- **What moves it on.** Each step puts a ring on the real button and moves on only when the game sees the action:
  - a click the page reports (`main.js` emits `'ui' { act, v, n, al }` for every click it answers);
  - a game event, such as a loan taken;
  - what the step opens appearing on screen.
- **Done early.** A step the player has already done is ticked off.
- **Closed again.** If the player closes what a step opened, the ring goes back to the button that opens it.
- **Skip and replay.** There is no Next button, only Skip. Progress saves with the game. The Guide's cards have "Show me" to replay a tutorial.
- **The four tutorials:**
  - the day board: open it, set a cap, move a bank, pick the night;
  - the scorecards: open them, press a fix;
  - ground vehicles: open them, buy a tug, try Keep it matched;
  - the Treasury: open the Economy room, see the loan.

## Before and after

**Before** is round 5a's playthrough (`round-5a-benchmark.md`). **After** is this round's playthrough: the same player at 1440 × 900 for 32 minutes. The radar rule is fixed so the player places at most one radar per airway, in its middle.

| | Before (5a) | After (5b, run 1) | After (5b, run 2) |
| --- | --- | --- | --- |
| Longest departure held on its stand (not a night stop or a slot) | 4 departures, 10,050 min | 26 min | 24 min |
| Movements at the grown airport | 1 an hour of 38 at 20:03 | 144 on the last full day, busiest hour 14 of 34 | 80 a day, busiest hour 10 |
| Night movements (23:00–06:00) | none (passenger flights stopped) | 27 | 16 |
| Passengers an hour at the end | 147 | 878 | 331 |
| Money floor | −₭17.9 billion | ₭3,736M | ₭3,683M |
| Page errors | 0 | 0 | 0 |

The money floor no longer goes negative mostly because the radar rule is fixed. Round 5a's player placed a radar every 20 seconds. When the treasury does go below zero, the Treasury steps in (`24-treasury-card.jpg`, test below).

A headless check of the D1 case: a grown Starter with a cargo area and two freighters on a route, three game days, seed 11. It compares `origin/focus/round-5a` with this branch:

| | Before | After |
| --- | --- | --- |
| Longest hold on a stand | 2,652 min (the freighters never left) | 4 min (light aircraft on the runway) |
| Departures on the last full day | 6 | 8 |
| Night movements | 2 | 6 |

## Screenshots (looked at)

- `21-dayboard.jpg`, `20-tutor-dayboard-2.jpg`: the board in the airport panel:
  - stacked departures by airline;
  - arrivals below the line;
  - the runways' 17 an hour dashed;
  - the Cap row (No cap, 9, 12, 14) and the Night row (Open, Quota, Curfew), each with its words;
  - the airlines with their ◂ / ▸ bank buttons;
  - the tutorial's ring on the Cap row, "2 of 4".
- `22-scorecards.jpg`: three airlines side by side. Zipjet minds charges (67), with "Lower charges to 70%". The others have "No complaints here".
- `23-fleet.jpg`, `20-tutor-fleet-2.jpg`: tugs, buses and fuel trucks, each with − and +, its recommendation and its cost, and Keep it matched.
- `24-treasury-card.jpg`, `20-tutor-treasury-2.jpg`: below zero, the card with its two choices. In the Economy room, the Treasury's row is at the top, with "Take it" ringed by the tutorial.
- `25-tug-hold.jpg`: the map marker "1 departure held 6 min: waiting for a tug" with "Buy 1 tug (₭1.5M)", repeated under Needs you.
- `26-depot.jpg`: the depot pad by the fuel farm at z 45. It is small, as it is at real size.
- `11-night.jpg`, `11b-night-z22.jpg`: at 01:56, the panel reads 7 movements an hour. In round 5a the night was empty.

## Checklist items affected

- **6. Alive at every zoom**: partly → better. The night has traffic, and a grown airport moves 10–14 flights in its busiest hour instead of 1.
- **10. Growth felt**: partly → better. The grown airport is no longer hollow: no stuck departures, and 878 passengers an hour at the end of run 1.
- **11. Problems where they happen, fix one click away**: partly → met for holds. Every hold names its real cause, with a fix where one exists: buy tugs or trucks, add a tank, lower charges, open the day board. The fuel marker no longer blames fuel for everything.
- **8. Next goal**: unchanged and still partly. Both runs stopped at Chapter 3's radar goal at 31–42%, even with the fixed radar rule (one or two radars). That is round 5a's R12 (where radars go). It is left for 5c.

## Tests

New tests in `tests/run.js`, all behaviour:

- **Departures**
  - a freighter that lands on the Starter's 3 km runway can take off again;
  - a grown airport has no departure held on its stand over three hours (and freighters take off);
  - a hold names its real cause, on the map and the aircraft's panel; after six hours on a closed runway the flight is cancelled and its stand freed.
- **Money**
  - below zero the Treasury steps in: spending frozen, a loan offered, confidence falls each month, no dismissal in Act I;
  - Wait never offers a target it says will never be reached.
- **The day board**
  - the day board's capacity matches `IC.aptStats`, its plan adds up, freighters have night slots, and a bank moved moves its busiest hour;
  - a cap moves flights out of the peak hour, and the day flown keeps under it;
  - night flights by default; a curfew stops them and costs the cargo airline.
- **Scorecards**
  - aspects side by side, the worst named, its fix one click away; dry tanks lower the fuel mark.
- **Ground vehicles**
  - an airport starts with what its stands need and keeps matched as it grows;
  - too few tugs is a named hold with its fix, and buying them lets departures go.
- **Tutorials**
  - each tutorial waits for the real action, ticks off what was done early, saves, replays and skips.

The playthrough also walked every tutorial on the real buttons in Chromium; each one finished on the clicks (`TUTORIALS` in the tool's output). New slow tests have their times in `tests/times.json`.

`npm test` (the last full run, 2,074 s on 4 workers): 295 passed, 1 failed. The failure was round 3's fuel-queue test, which expected a tank as the fix for a truck queue; with the fleet the fix is buying trucks. The test is updated and passes. The step budget holds: 159 aircraft moving, 0.92 ms a step. All eight Academy lessons pass, and so do the save tests.

## What is left

- **D3's rest**: baggage tractors, catering, and vehicles that wear out. The owner asked to keep this light; tugs, buses and fuel trucks are enough for now.
- **D4 (fuel supply and margin), D7 (shifts), D8–D10**: as planned for a later round.
- **The day board**:
  - The board plans departures. Arrivals follow them a turnaround earlier and are not themselves slotted.
  - The night quota counts departures. Arrivals still land; under a curfew they are held.
- **The Chapter 3 radar goal**: still stalls (R12).
- **Scorecards**: "Bags and check-in" is measured from how full the terminal is. There is no baggage system behind it.

## Decisions for the owner

1. **The default night**: a quota of 4 movements an hour, a heavy jet counting two. Would you rather default to open, or to a curfew as before?
2. **Take-off length.** A type now takes off on the runway length it lands on (the same number the airport panel, deals and founding use). The alternative is to keep the old margin and raise every other check to match. Then the Starter's 3 km runway would no longer take the big freighters or the 747/A340 classes.
3. **Cancelling a stuck flight after 6 hours.** A flight held that long for a reason that will not pass is cancelled, and the aircraft leaves the route with an unhappy airline. Is 6 hours right?
4. **The Treasury**: 2.5% a month over 24 months, and −6 confidence each month in the red. The card's default answer is not to borrow.
5. **Ground vehicles**:
   - prices and running costs: tug ₭1.5M, bus ₭0.6M, fuel truck ₭0.8M; ₭0.015–0.02M an hour each;
   - the recommendation: at least one tug per four pushback stands, sized to the busiest hour;
   - Keep it matched on by default.
6. **Slots**: the plan holds 25% more slots than the fleet can fly, so a late aircraft still finds one. Waiting for a slot is not counted as delay; waiting for the cap is.
7. **Tutorials**: progress saves with each game, not with the browser. Each tutorial shows once per game unless replayed from the Guide. Should one finished in one Career stay finished in the next?
