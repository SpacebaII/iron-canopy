# Focus plan: the Career and building airports

Status: **for the owner's sign-off.** Nothing in it starts changing the game until it is signed off.

## Why we are changing how we work

Up to three briefs ran at once, each landing at "good enough". The scope is right, but the core is not implemented well. From now on: **one thing at a time, done really well**, played and checked before the next thing starts.

## What the owner said

> "Focus on the mechanics: it feels really far apart, building feels bad, progression feels bad, and it all feels unclear. Scope is great but it is not implemented well."

What that means, from the owner's answers:
- **Far apart:** the systems feel disconnected (airports, airlines, airspace, money, story don't visibly push on each other), and there are too many menus and panels between the player and the action.
- **Building:** "we just can't build anything cool at all effectively". It is too micro (part by part). The controls fight you, nothing visibly changes because of what you build, and it doesn't look right.
- **Dead:** "the airport operations don't feel cool, fuel loading etc., and there's no life; even if it's very standard it feels dead."
- **Progression:** "there should be a lot more interesting things and events to make it not all feel the same at all times." The goals are unclear, it is slow and grindy, nothing seems to grow, and unlocks feel arbitrary.
- **Scope rule:** changes are welcome. Anything removed is **hidden behind a switch, never deleted**, so it can come back.

## What "really good" means: the checklist

The focus is done when a new player, starting a Career from the main menu, gets all of these. Each is checked in a recorded playthrough.

1. **Within 2 minutes** they know what they are building first, where, and why, without opening the Guide.
2. **Within 5 minutes and about 30 clicks** they have placed a working first airport that looks like a real one: runway, taxiways, terminal with stands, tower, fire and fuel.
3. Every placement **snaps where they meant it**, shows its price and build time, and builds with one obvious action. Esc or right-click always cancels. No piece ever ends up crooked, floating or unconnected without the game saying so.
4. Construction is **worth watching**, with crews, lorries and stages visible, and it can be skipped forward without waiting minutes of real time.
5. **The first airliner lands within 10 minutes** of starting. The player can follow it from approach to gate to pushback and see each service at work: bridge, fuel truck, baggage, catering, pushback tug.
6. **The airport looks alive at every zoom:** passengers at the kerb and gates, vehicles on the apron, lights at night, sound. A busier airport visibly looks busier.
7. **Everything they build visibly changes something:** a new terminal fills with people, the tower lets more aircraft move, fire and fuel show their work, and a number they care about goes up.
8. **They always know the next goal** and what it gives them, in one line on screen. Goals come every few minutes of play, not every few game months.
9. **Something different happens at least every 5 minutes:** an event, a choice, a milestone, a visitor. No two stretches feel the same.
10. **Growth is felt:** within the first hour the airport grows from one runway to a busy hub, with bigger building blocks opening because the airport needs them, and the game says why.
11. **The basic tasks are done on the map, not in menus.** Problems show where they happen ("Gate 4: 3 aircraft waiting"), and the fix is one click from there.
12. **The systems connect visibly:** people come from the city by road, fly out, and money comes back. Each step can be seen and is said in plain words.

## How we work

- **One working session at a time.** Each round ends with a recorded playthrough of the same path, before-and-after pictures, the checklist ticked or not, and `npm test` green on GitHub.
- **Each round lands as its own pull request.** I review it, merge it and republish the game.
- **The owner reviews direction between rounds.** I don't start a round that changes direction without your yes. Rounds inside the signed-off plan run on.
- **Hidden, not deleted:** one switch (`IC.FOCUS`) hides features from the Career's opening; the code and tests stay.
- **Paused while we focus:** briefs 26 (alerts and trade-offs, stopped part way, kept on its branch), 27 (moments) and 28 (showcase), and new work on the war acts. They keep working as they are; nothing is removed.

## The rounds

### Round 0: the honest playtest (running now)

One session plays the Career from the main menu as a new player, in the real page, and changes no code. It reports, with screenshots:
- the clicks and minutes to each key moment;
- every dead moment, and every menu needed for a basic task;
- how varied the events are;
- a ranked problem list;
- what already feels good;
- what to hide.

It lands as `docs/focus/career-playtest-1.md`. It sets the baseline for the checklist and may reorder what's below.

### Round 1: build something cool, fast (checklist 2, 3, 4, 7)

- **Big building blocks first.** The build bar opens on whole pieces, each placed, turned, stretched and built as one:
  - "Runway with taxiways" (runway, parallel taxiway, exits and holding bays);
  - "Terminal with apron and stands", from the existing terminal kits: straight, pier, round;
  - "Services": tower, fire station and fuel farm, sited correctly;
  - "Cargo area".
  - The single parts move into a folded "Detail" tab for players who want them.
- **Controls:** one model everywhere. Click to place, drag to stretch, R or drag to turn, the Build button or Enter to build, Esc or right-click to cancel. Snapping guides are drawn while placing. Undo works on whole pieces.
- **Payoff:** every finished piece triggers something visible. The first flight is offered when a runway and terminal open. Capacity numbers rise on screen ("+12 movements an hour"). The new terminal lights up and fills.
- **Construction you can watch or skip:** stages stay visible; "Finish now" fast-forwards time, as the existing Wait does.
- **Done when:** a fresh player builds a good-looking working airport in under 5 minutes and about 30 clicks, shown in a recording.

### Round 2: an airport that is alive (checklist 5, 6)

- **Turnarounds you can watch:** jet bridge or stairs, fuel truck or hydrant cart, baggage carts, catering, cleaning, pushback tug, each arriving and leaving in order. Turnaround time is shown on the stand.
- **People:** crowds at the kerb, in the terminal windows, queues at the gates; buses for remote stands.
- **Ambience:** apron and terminal lights at night, rotating beacons, sound (engines, radio chatter, an announcement), weather on the ground.
- **Follow an aircraft:** click it, then "Follow". The camera stays with it from final approach to the gate and back out.
- **Scale with business:** a quiet regional field looks quiet, a hub looks like a hub.
- **Within the performance budget:** 60 fps target at the airport zoom; the vehicles are drawn by the renderer and never slow the step.

### Round 3: hands on the airport, systems connected (checklist 11, 12)

- **The airport is the interface:** click a stand, gate, runway or building to see its live state and act on it, with one airport panel instead of many tabs.
- **Problems on the map, where they are:** "Gate 4: 3 aircraft waiting for a stand", "Fuel: departures waiting 12 min", "Runway 09: no fire cover for heavy jets", each with a one-click fix that opens the right build piece.
- **The chain made visible:**
  - an overlay showing passengers from the city by road to the terminal, flights out, and money in;
  - every coin of income traceable to where it came from.
- **Fewer panels in the way:** hide (behind `IC.FOCUS`) what the playtest finds doesn't serve the opening.

### Round 4: progression and events (checklist 1, 8, 9, 10)

- **One clear thread of goals:** a single "Next goal" line on screen with its reward, coming every few minutes of play. Act I's chapters are reworked from calendar months into goal-driven steps; the calendar still turns, but waiting is never the goal.
- **Growth milestones** (for example 1,000, 10,000 and 50,000 passengers a day), each opening a bigger piece (second runway, pier, concourse, cargo hub). The game says why: "Your terminal is full at 9 am: a pier would add 8 gates".
- **A peacetime event deck of 20 or more cards**, each with a choice and a consequence that shows on the map. Today peacetime has 4 kinds. Examples:
  - a VIP state visit;
  - a storm front, fog season;
  - an airline strike;
  - a new airline asking for slots;
  - a record day, a holiday rush;
  - an inspection by the regulator;
  - a bird strike;
  - an airshow;
  - a celebrity's jet, a diverted wide-body, a lost passenger;
  - a fuel shortage, a power cut.
- **No arbitrary unlocks:** every lock says what opens it, in one line.

### Round 5: clarity and the final check (checklist 1–12)

- **The first 10 minutes:** words and contextual hints, the Guide reduced to what you need at that moment.
- **A final recorded playthrough** against the checklist, by a fresh session that has not seen the code changes. The owner plays it, and anything left becomes a short last round.

## Overnight, after sign-off

1. Round 0 finishes. I read its report, check its screenshots, and adjust Round 1's details to its findings (not its direction).
2. PR #50 (brief 25: peace matters in war) merges when its tests are green. It was finished and tested before the focus began.
3. Round 1 runs in one session: built, tested, played, before-and-after pictures, merged when green, game republished.
4. Then I stop and wait for you. You'll find:
   - the playtest report;
   - Round 1's results, with a recording and pictures;
   - an updated checklist;
   - anything that needs your call.
   Round 2 starts only on your yes.

## What I need from you to start

- **Yes or no** to the checklist (change any line you disagree with).
- **Yes or no** to the order of the rounds.
- **Yes or no** to running Round 1 overnight without waiting for you.
