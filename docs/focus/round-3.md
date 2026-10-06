# Round 3: hands on the airport, systems connected

Branch `focus/round-3`, on `focus/round-2` (PR #53). This round covers checklist items 11 and 12 of `docs/focus/plan.md`, and takes the screen back for the map.

Screenshots are in `docs/focus/round-3/`. They come from the recorded playthrough, `tools/round3-play.js`:
- It starts a fresh Career from the start screen in headless Chromium at 1440 × 900, with real mouse clicks and keys.
- It founds an airport, orders the round-1 Starter, runs Finish now, and plays to the first landing.
- It plays on (32×, then Wait) until something goes wrong at the airport, fixes it from the map, and then signs the next offer.
- It counts the clicks for each task and measures, at each moment, how much of the screen shows the map unobstructed (`tools/mapshare.js`).
- `before-*.jpg` are the same path with round 3 switched off (`--before`: `IC.FOCUS.screen`, `calm`, `hands` and `chain` false), done the old way.

How the map share is measured: every 8 px, `tools/mapshare.js` asks the page what is on top of the map there. The point counts as covered when it finds a panel or bar with a background (the top bar's shade counts), a button, the minimap, or text. Labels drawn on the map itself count as map.

## The numbers

Free map share at 1440 × 900 (before = round 2 as it was; ranges are over two runs):

| Moment | Before | After |
| --- | --- | --- |
| Opening (Act I card up) | 48% | 71–74% |
| **Placing the Starter (building)** | 52% | **70–71%** |
| **Airport open, its panel up (watching)** | 28–30% | **64–67%** |
| First landing, its card up | 33–36% | 56–59% |
| **Airliner on its stand, its panel up (watching)** | 34–37% | **62–66%** |
| A problem appears, the airport panel up | 31–34% | 59–63% |
| The fix placed, build bar up | 52% | 69–71% |
| An offer arrives | 40% | 59–60% |

The target was 60% while building and while watching the airport: met (70% and 62–67%). The first-landing moment is under it (56–59%) because its card is up; when the card goes it is back over 60%.

Clicks for the three basic tasks, counted in the playthrough from the moment the task could start:

| Task | Before | After |
| --- | --- | --- |
| **Check money** (this month's in and out) | 1 click: Treasury → Economy room, which covers the whole map; then Esc | **0**: the top bar says "−₭1,516M this month"; its tooltip, the Economy room and the airport panel give the same line |
| **Fix a problem** (a deal at risk for want of a hangar, or fuel queues) | 7: the airport, Build, ▸ Detail, the tab, the part, a click on the map, Build. Nothing on the map says where | **2**: the marker's "Build a hangar ▸" / "Add a fuel tank ▸" (the piece comes already placed where it helps), Build. Finish now is a third if you do not want to wait |
| **Sign a deal** | 3 and a room over the map: Aviation (V) → Deals → Sign, then Esc | **2**: the offer's marker at the airport → Sign (its card opens in the airport panel) |
| Sign an offer the airport cannot carry yet | read the ✗ in the card, close the room, find the part in the build bar, place it, Build, wait, reopen the room, Sign | 6: "Build wide-body gates for it" under the card (placed), Build, Finish now, close the bar, Sign |

Moments, after (real time, tool lag included): open for business 1:00 (19 clicks), first landing 2:10 (19 clicks), the first problem 2:40, fixed 2:44, an offer 3:40, signed 3:56.

## What changed

All of it is behind four new switches in `IC.FOCUS` (core.js), and applies only to the Career (`S.mode === 'story'`). Quick war, the Academy, the showcase and the test range look and play as before.

```js
IC.FOCUS = { pieces: true, firstLanding: true, life: true, screen: true, calm: true, hands: true, chain: true };
```

### 1. The map first (`screen`)

- **One "Next goal" line.** The goals panel is now the next open goal with its progress bar, and "Chapter 2 · 3 of 10 done ▾". A click on the header opens the chapter's list; a click on the goal still flies to where it is.
- **Tips once, small.** A goal's tip shows for 30 seconds under it, cut to three lines (a click reads it all), then folds behind a small "How?". "Got it" folds it at once.
- **One message line.** The staff's message is one line ("Lena Okafor: Kesyn International: a si…"); a click opens it whole, with Back and Next; it folds again by itself.
- **One feed line.** The newest event is one line under the message, with "+3 more ▾" to open the rest. It lives in the left column now: no more stack of toasts over the middle of the map.
- **The inspector** is 21rem instead of 25rem, only as tall as its content (not full height), and folds to its title strip (▴). The airport panel is short (below).
- **Cards beside what they talk about.** Every card (chapter, report, moment, decision) is a side card: in the left column under the goal line, or on the right beside the inspector when what it talks about is on the left. Round 2 did this for the first landing; now it is everywhere in the Career.
- **The black band is gone.** The letterbox bands drawn when a chapter card came up are not drawn in the Career.
- **The minimap** is shown on demand: a "Minimap" button by Capital and Region.
- **The build bar** no longer opens by itself when an airport is selected (the airport panel has Build (B)); its hint strip is one line, and the bar is as wide as its pieces, not the screen.
- **The top bar** is one row in Act I (the airspace toggle is gone, below), so the panels start higher.

### 2. The civil act is civil (`calm`)

`IC.civilAct(S)` is true in the Career before Act II. See the table below for what it hides.

### 3. The airport is the interface (`hands`)

- **One airport panel** instead of five tabs:
  - three numbers: passengers an hour (of what the terminal takes), movements an hour (of what the runways take), and what airlines paid here this month (with the upkeep so far);
  - the chain in one line, with "Show on the map";
  - **Needs you**: each problem with its fix button, then the layout notes (two, "more" for the rest);
  - **Airlines**: the offers here as deal cards with Sign, the deals at risk, the deals running (folded);
  - **Building**: the jobs, with Finish now;
  - folded: runways, stands and services (the old Overview), charges, damage; buttons for the tower's rules and the airspace (their old pages, with "◂ Back").
- **Parts act on themselves.** Click a part and its panel starts with what it is doing now and what to do about it:
  - runway: movements in the last hour against capacity, how fast the fire trucks reach its far end, "Landing system at the 08 end" if one is missing, "Fire station nearer" if the trucks are too slow, "Fire drill now";
  - terminal: its passengers against capacity, "Add a terminal beside it";
  - fuel farm: tanks, trucks and anyone waiting, "Add a fuel tank beside it";
  - fire station: where the trucks are, "Fire drill now" (the trucks race to the far end and the panel times them);
  - tower: what it handles, "Tower rules"; apron: stands in use, "More stands"; hangar: who is inside, "Add a hangar".
  - Pavement, zone, one-way and move fold under "More options".
- Each "beside it" button opens the build bar with the piece **already placed** where it fits (below).

### 4. Problems on the map, where they are (`hands`, `problems.js`)

`IC.aptProblems(S, ap)` lists what the player can act on now, each at its place, with its fix:

| Marker | Where | Fix |
| --- | --- | --- |
| "Terminal: 3 aircraft waiting for a stand" (arrivals circling because every stand that fits is taken) | the terminal | a Terminal with apron, placed beside |
| "Terminal full: 1,020 of 1,064 passengers an hour" | the terminal | a terminal beside |
| "Fuel: 2 departures waiting 8 min" / "No fuel farm" | the fuel farm | a fuel tank, at least 100 m from other fuel |
| "No fire cover: only turboprops may land" / "Runway 08/26: no fire cover for heavy jets" | the runway's middle | a fire station nearer |
| "Runway 08/26: no landing system" | the runway end | a landing system at that end |
| "Deal at risk: Selvara Airways needs hangar space…" (two deals of one airline short of the same thing are one marker) | the apron | a hangar, placed |
| "Offer: Sorrel Air, 1 × A32 to Milgrad" | the terminal | its deal card in the airport panel, with Sign; if the airport cannot carry it yet, the fix for what it lacks ("Build wide-body gates") |

- On the map each is a pulsing ring at the place and a box beside it: the title, and the fix as a button. Red for what is going wrong, amber for what will, green for an offer. Boxes stack so none hides another, and stay out from under the inspector.
- From afar there is one chip per airport: "Draost: 2 things need you ▸", which flies there.
- **The fix** (`IC.fixPlan`) tries places round the spot, nearest first, in the runway's frame, and keeps the first the builder accepts with nothing to warn about (in a strip, unconnected, fuel within 100 m). The build bar opens with that plan set and its price: Build or Enter builds it, a click elsewhere moves it, Esc cancels. If nothing fits, the piece is picked and the player clicks.
- **Deals are signed where the airport is.** The offer's marker opens its card in the airport panel (scrolled to it); Sign is there. The Chapter 2 goal and its tip now say so ("its offer shows on the map at the airport"). The Aviation room still has every deal.

### 5. The chain made visible (`chain`)

- **On the map** (`render-chain.js`, "Show on the map" in the airport panel): a dashed green line from each town in reach, as thick as the people it brings, with green dots running in, labelled "Kesyn · 1.7 million · 26 min by road"; blue lines out to each place served, with blue dots flying out and gold dots (money) coming back; and over the airport "166 passengers an hour → 3 places → ₭21M this month". Shots `11-chain.jpg` and `12-chain-region.jpg`.
- **In words**, the same in the airport panel: "Kesyn: 1.7 million people within 2.5 h by road → 166 passengers an hour → 3 places served → ₭21M this month" (`IC.aptChain`).
- **Every coin traced.** Each landing's fees are also booked to its airport's month (`IC.aptMonth`: landings, passengers, cargo, flights). A test checks that the airports' months add up to the airline-fee lines of the monthly statement.
- **One honest money line** (`IC.moneyLine`), from the month's statement, so it always agrees with it: "January so far: ₭69M came in, most of it grant from the ministry; ₭1,586M went out, ₭1,513M of it building. The treasury fell ₭1,516M."
  - The top bar shows "−₭1,516M this month" under the treasury (before: "+2/h", which left out building), with the line as its tooltip.
  - The Economy room leads with the same line. The hourly figures follow, said for what they are: "Running all the time, an hour (building and buying not counted): +₭0.3M. That alone would add about ₭22M a month." The playtest's contradiction ("+₭0.3M an hour, growing ₭22M a month" beside "yesterday net −₭16M") is now one story: building is where the money went.

## Hidden behind `IC.FOCUS` in the Career's civil act

Hidden in the Career until Act II (`IC.FOCUS.calm`, `IC.civilAct`); they stay in Quick war, the Academy and later acts. Nothing was deleted.

| Hidden | Where | Why |
| --- | --- | --- |
| Messages from the military staff (Col. Reyes "Weather has grounded the helicopters", air defence, intelligence, logistics, the Chief of Defence) | `say` in campaign.js | A new Director has no helicopters or batteries. The words still go to the Journal. |
| "helicopters grounded" in the weather lines, and more than one weather line a day (unless the weather closes runways) | weather.js | Weather was 44 of 137 log lines in the playtest. |
| The Open / Restricted / Closed airspace toggle | top bar | Never explained; nothing in Act I needs it. Comes with Act II. |
| The locked Air and Intel buttons on the rail | rail | Promises of war in a civil act. |
| "1 command point" on the goals, and the dot it put on the Career button | goals line, rail | Command points buy nothing in Act I. |
| In the Career room: Acts II–IV, Tension, Command points, Doctrine, Delegates (Route Planning Office, Chief Engineer), Requests | warroom.js | Military vocabulary and automation before the player has learned the manual way. The room keeps confidence, the chapters and the decisions. |
| "COMBAT TIME · 2×" and the slow-down it shows | main.js, render-warn.js | Nothing military flies in Act I; round 2's first landing showed the badge. |
| The airport's five tabs (Overview, Works, Charges, Operations, Airspace) | inspector.js (`hands`) | One airport panel; Operations duplicated the Aviation room. Tower rules and Airspace open on their own page from the panel; Airspace only once Chapter 3 opens it. |
| Per-part options: pavement relay, zone (with Military), one-way, move and turn | part panels (`hands`) | Folded under "More options". |
| The build bar opening by itself on selecting an airport | buildbar.js (`hands`) | It covered a third of the map; Build (B) is in the panel. |
| The minimap | (`screen`) | A button brings it back. |
| Letterbox bands under chapter cards | render.js (`screen`) | The playtest's "black band". |

Already folded by round 1: the specialist build cards (Detail).

## The checklist

| # | Item | Met? | Evidence |
| --- | --- | --- | --- |
| 11 | The basic tasks are done on the map, not in menus. Problems show where they happen ("Gate 4: 3 aircraft waiting"), and the fix is one click from there | **Met** | The playthrough's first problem ("Fuel: 1 departure waiting 8 min", another run "Deal at risk: … needs hangar space") showed as a marker at the fuel farm / apron (`06-problem.jpg`). One click on its fix placed the tank / hangar where it fits (`07-fix-placed.jpg`), Build ordered it, and after the works the marker was gone. Signing a deal: marker → Sign, 2 clicks (`08-offer.jpg`, `09-deal-card.jpg`). Money: on screen, 0 clicks. Tests: *a stand short of capacity shows a marker at the terminal, with a fix that places a terminal beside it*; *fuel queues show at the fuel farm…*; *a deal short of a hangar is marked at the airport, with the hangar as its fix*; *a deal can be signed from the airport*; *an offer the airport cannot carry yet says what it lacks, and its fix builds it*. Not yet: the Aviation room is still the place for the airlines' pages, charges and the deals running in depth. |
| 12 | The systems connect visibly: people come from the city by road, fly out, and money comes back. Each step can be seen and is said in plain words | **Met** | "Show on the map" draws the towns by road, the terminal, the flights out and the money back, with numbers (`11-chain.jpg`, `12-chain-region.jpg`); the airport panel says it in one line; the money line in the top bar, the panel and the Economy room is the statement's. Tests: *the money line agrees with the monthly statement, and every fee is traced to an airport*. Not yet: the road leg is drawn as a straight line from each town, not along the roads it uses; flights out are drawn a short way toward their foreign ends, which are off the map. |

## Tests

New in `tests/run.js` (section "round 3"), all headless:
1. *a stand short of capacity shows a marker at the terminal, with a fix that places a terminal beside it* (every stand taken; arrivals circle; the marker, its place, its words; the placed terminal is joined to the taxiways and builds);
2. *fuel queues show at the fuel farm, and the tank the fix places keeps 100 m from it*;
3. *a deal can be signed from the airport: the offer is marked there with its card, and signing opens the route*;
4. *an offer the airport cannot carry yet says what it lacks, and its fix builds it*;
5. *a deal short of a hangar is marked at the airport, with the hangar as its fix* (a Career played from founding with the Starter, as the playthrough; the hangar placed by the fix ends the risk);
6. *nothing military shows in the Career before Act II* (staff messages, weather lines; Act II, the Quick war and the switch bring it back);
7. *the money line agrees with the monthly statement, and every fee is traced to an airport* (also the chain's words and numbers).

Their times are in `tests/times.json`.

`npm test` (round 3 code, before the last small UI fixes): **278 passed, 0 failed** (1,812 s on 4 workers), with the eight Academy lessons, the save tests (`ap.mo` is saved like any field) and the timing tests among them. After merging `main` (round 2 merged as PR #53) and the last UI fixes: **278 passed, 0 failed** (1,797 s on 4 workers).

The simulation step gains one object update per landing (`IC.aptMonth`); markers, the panel and the chain are worked out by the page five times a second, a few airports at most, and the chain once a second.

## What is left, and what needs the owner

- **Feel on real hardware.** Software-rendered Chromium again. The markers are DOM boxes moved every frame; with five airports in view that is at most ~25 boxes.
- **Markers can still sit under the left column** (goal, message and feed lines) when the problem is in the top-left of the screen; they are kept out from under the inspector.
- **The road leg of the chain** is a straight dashed line from each town; following the real roads (`IC.route`) would read better and costs a route search per town.
- **The first-landing moment** is at 56–59% map: its card is 24rem wide. A smaller card, or one that fades after a few seconds, would reach 60%.
- **The Aviation room** is still there for airlines' pages, routes and charges. The owner may want its Deals page to say "or sign at the airport".
- **Needs the owner's call:**
  - The build bar no longer opens when an airport is selected in the Career (it covered a third of the map). Build (B) and the panel's buttons open it. Round 1 had it open by itself.
  - The minimap is off by default in the Career, with a button to bring it back.
  - Weather is one line a day in Act I, unless it closes runways.
- **Stand numbers** still start at 0 ("Stand 0"); left for Round 4's stand work with saves in mind.
