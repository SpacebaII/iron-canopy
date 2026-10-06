# Round 5a: the civil half against Airport CEO

Branch `focus/round-5a`, from `main` at round 4 (PR #55). No game code was changed. This round:
- benchmarks the civil half against **Airport CEO** (Apoapsis Studios, 82% of 4,694 Steam reviews positive) and **SimAirport** (LVGameDev, 81% of 2,688), everything outside the terminal's interior;
- plays a fresh Career for 32 minutes in the real page and scores the 12-point checklist;
- lists the rough edges;
- ranks what is left into two rounds: **5b, depth** and **5c, polish**.

The owner's goal: *"better than that one airport builder on Steam … at everything else when it comes to depth, function and process for the civil part."*

## The short answer

**Where we are already ahead of both games** is in what happens on and around the runways:
- the runway, taxiway and air traffic simulation;
- weather that matters;
- building at real scale;
- money that explains itself;
- a network of airports in a real country.

Airport CEO's most common complaint is aircraft and vehicle pathfinding. Ours plans taxi routes with reservations and never deadlocks.

**Where we are behind** is the operations *process* between landing and take-off. Airport CEO makes the player run:
- a schedule (the flight planner);
- the fleets of ground vehicles, and the depots and contracts behind them;
- fuel bought from suppliers and delivered;
- catering, cleaning and de-icing as supply chains;
- staff with shifts;
- emergencies handled live.

In our game all of this is drawn beautifully but decided for the player: the vehicles are scenery (`aptlife.js` plans them from the recorder after the fact), and fuel arrives by itself (`IC.FUEL_IN`).

That is the gap to close in 5b. It must be closed without copying Airport CEO's weak spot: its flight planner and baggage layouts are its two most hated chores.

The playthrough also found two real problems for 5b:
1. Departures stuck on their stands for days, reported to the player as "Fuel: 4 departures waiting 10,050 min".
2. A treasury that fell to −₭17.9 billion without anything happening to the player.

## 1. The benchmark

### What the two games do outside the terminal

**Airport CEO**
- **Contracts.** Signed with airlines of 1–5 stars; bigger airlines unlock with reputation; renegotiation since Alpha 36 ([store](https://store.steampowered.com/app/673610/Airport_CEO/), [Airlines](https://airportceo.fandom.com/wiki/Airlines), [dev blog 151](https://www.airportceo.com/post/dev-blog-151-businesses-and-contracts)).
- **Flight Planner** ([wiki](https://airportceo.wiki.gg/wiki/Flight_Planner)):
  - drag-and-drop each flight onto a stand and a time, at least 3 hours ahead;
  - flights only 05:00–22:00 until the Night Flights research;
  - weekly repeating flights;
  - an executive (COO and CIO) automates it.
- **Fuel** ([wiki](https://airportceo.wiki.gg/wiki/Fuel)):
  - Jet A-1 and Avgas;
  - a contract with one of three supplier classes, priced per litre;
  - deliveries of 200–800k litres into depots of 30k or 200k litres, plus up to 6 tanks;
  - tankers carry fuel from the depot to the stand.
- **Catering and cleaning** ([wiki](https://airportceo.wiki.gg/wiki/Cleaning)): depots, trucks and a contract; waste is hauled away.
- **De-icing** ([wiki](https://airportceo.fandom.com/wiki/De-Icing)): below freezing, aircraft request it; it needs pads, trucks, a depot and a contract.
- **Pushback trucks, buses, stairs and baggage tractors** are bought, assigned to depots, and break down; service technicians repair objects.
- **Staff** ([wiki](https://airportceo.wiki.gg/wiki/Staff)):
  - ramp agents, technicians, janitors, security and others, plus executives;
  - hiring by skill, training, and shift length against fatigue.
- **Emergencies** ([dev blog 153](https://www.airportceo.com/post/dev-blog-153-emergencies)): 24 types, such as an engine failure (fire trucks, then a stand, then a hangar) or a weather diversion; fail one and you get a fine and a lower security rating.
- **Taxiways** can be one-way at nodes. Runway direction follows the wind. There is no real ATC; a tower is required to schedule.
- **Money:** loans and an economy panel. **Ratings:** an airport star rating from many factors.
- **One airport per game.**

**SimAirport** ([store](https://store.steampowered.com/app/598330/SimAirport/)):
- **Airline deals:** negotiated, with higher fees or a flat daily fee, and exclusive lounges and gates.
- **Schedule:** a daily flight schedule, with standby gate availability.
- **Fuel:** a fuel marketplace with a pricing strategy, plus fuel pipelines.
- **Baggage:** tracked from conveyor to carousel.
- **Also:** weather, staff, 15+ research upgrades, a credit rating, financial reports and several airports.

**What players say:**
- Airport CEO is praised for "watching your airport in action is extremely satisfying, feels like a real one" and "easy to learn, hard to master" ([top reviews](https://steamcommunity.com/app/673610/positivereviews/?l=english&browsefilter=toprated)).
- It is panned for:
  - pathfinding ("will develop pathfinding bugs. It's only a matter of time");
  - late-game lag;
  - "systems feel shallow or only partially implemented";
  - the flight planner as late-game busywork ([negative reviews](https://steamcommunity.com/app/673610/negativereviews/?l=english&browsefilter=trendsixmonths), ["Flight Planner – has to go or be automated"](https://steamcommunity.com/app/673610/discussions/0/1520386297698236876/)).
- SimAirport is panned for bugs, a confusing UI, pathfinding and arbitrary balance ([reviews](https://steamcommunity.com/app/598330/negativereviews/?l=english&browsefilter=toprated)).

### System by system

Ahead / level / behind is against the better of the two games.

| System | Theirs | Ours (code) | Mark | Evidence |
| --- | --- | --- | --- | --- |
| Airline contracts and negotiation | ACEO: star tiers, unlocked by reputation, renegotiation. SimAirport: fee or flat-rate deals with perks | `aviation.js`: terms (charges −10..+20%, length, exclusivity, `IC.dealTerms`, `IC.avNegotiate`); needs measured against the real airport (`IC.dealNeeds` / `IC.aptProvides`: stands by size, gates, hangar, cargo, fuel, terminal); bad days, breaking, compensation, renewals, name; signed from the map | **Ahead** | A deal can fail because the airport cannot carry it, and it says why (`IC.avReqBlock`); theirs only check stand size |
| Flight scheduling | ACEO: a drag-and-drop planner, 3 h ahead, 05–22, weekly, automation by executives. SimAirport: a daily schedule | None. A tail leaves when its turnaround ends (`aviation.js` ~l.540); passenger flights do not depart 23:00–06:00 (`DAY0`/`DAY1`). `IC.aptDayLog` keeps the day's movements by hour, but nothing plans them | **Behind** | No timetable, slots or peak to manage. Theirs is the most criticised chore, so the answer is a board to *read and shape*, not to fill |
| Stand and gate allocation | ACEO: the player picks the stand per flight, by stand size | Automatic by size, zone, contact or remote, bridge, and height (`freeStand`); hand-placed stands (`apron.free`); buses to remote stands | **Level** | Better rules, but no way to keep an airline on its own pier or gates |
| Runways, taxiways, ATC | ACEO: runways turn with the wind, one-way taxiway nodes, pathfinding complaints, no ATC simulation | `groundops.js`: wind configuration, crosswind limits, dependent runways, hold-short, crossings, time reservations, holding bays; `airspace.js`: classes A–G, sectors, controller workload, sequencing, holding stacks, separation in 3D; ILS and fog | **Far ahead** | No one else simulates the tower and approach |
| Baggage (airside) | ACEO: tractors and carts, ramp agents, scanners inside. SimAirport: tracked conveyor to carousel | Belt loader and carts drawn in the turnaround (`IC.turnJobs`); no effect on the simulation | **Behind** (the interior part is out of scope) | Carts are scenery; nothing can run short |
| Fuel supply | ACEO: a supplier contract by class and price per litre, delivered loads, depots and tanks, tankers. SimAirport: a marketplace with pricing, pipelines | Fuel farm with 3 tanks, stock, 2 trucks a tank refuelling 8 an hour, hydrant and pipeline (`airport.js` ~l.1440, `IC.aptTakeFuel`); resupply is a constant `IC.FUEL_IN` = 45 an hour a tank; no price, margin or delivery | **Behind** on supply and money, **level** on capacity | Fuel cannot be bought, sold, delivered or run out by a choice |
| Catering, cleaning | ACEO: a depot, a truck and a contract each; waste hauled away | Drawn in the turnaround's order (`aptlife.js`), no supply | **Behind** | Pure scenery |
| De-icing | ACEO: below 0 °C requests, pads, trucks, depot, contract | A de-icing pad part (`IC.APART.deice`); without one it is done at the stand, which takes longer; winter fog and snow (`IC.SEASON`) | **Level** | No fluid, trucks or holdover; no queue to see |
| Pushback | ACEO: pushback trucks bought | Tug drawn; pushbacks and tows counted (`m.gmLog`) | **Level** | |
| Staff (airside) | ACEO: hire, train, shifts and fatigue; ramp agents, technicians; executives automate | Controllers per sector, costed automatically (₭0.08M an hour, workload in `airspace.js`); fire crews implicit; "Staff" is a line in the statement | **Behind** | Nothing to decide about people |
| Vehicles and maintenance | ACEO: bought per type, assigned to depots, break down, repaired by technicians | None bought; fire trucks and fuel trucks are implied by buildings | **Behind** | No fleet, no wear |
| Weather | Both: bad weather delays; ACEO: freezing → de-icing | Wind picks runway configuration and closes runways by type limits; fog (ILS CAT), snow, storms, seasons, diversions (`weather.js`, `IC.rwWindBlock`, `IC.aptConfig`); weather cards | **Ahead** | Weather changes how the airport runs, not just a delay |
| Research and progression | ACEO: an R&D panel run by administrators (night flights, automation…). SimAirport: 15+ upgrades | `IC.APT_TECH` (5 items: reinforced concrete, hydrant, ground radar, CAT III, jet bridges); milestones open bigger pieces (`deck.js`, `IC.pieceLock`); Act I chapters | **Level** | Ours is explained ("opens at 2,000 passengers a day"), theirs is wider |
| Finances | ACEO: loans, an economy panel, prices. SimAirport: credit rating, reports | Statement booked by kind, monthly and yearly review, running vs invested, every fee traced to an airport, `IC.moneyWhy` per line, loans, charge level per airport | **Ahead** in clarity, **behind** in consequence | Debt has no consequence: −₭17.9 billion in Act I, confidence 35, nothing happens (`06-end.jpg`) |
| Reputation and ratings | ACEO: airport stars from many factors, a security rating | Per airline satisfaction with reasons (`judge`: taxi, delay, fees, detours, airways, curfew); airport name (`IC.aptRep`); Minister's confidence | **Level** | One number per airline; the aspects are not shown side by side |
| Incidents and emergencies | ACEO: 24 emergency types handled live (fire trucks, stand, hangar), fine and rating if failed | Accidents with a cause (`IC.gopsRisk`), fire response decides deaths, the wreck closes the runway, a report card; deck cards (bird strike, diversion, medical flight, drone, power cut, fuel shortage) | **Level** | Ours are realistic but resolved by a card, not by the airport's response |
| Expansion and land | ACEO: buy land plots | The site grows with what is built; clearing city blocks for compensation; the player builds roads; landside grows by itself | **Ahead** | |
| Multiple airports | ACEO: one per game. SimAirport: several | A national network, a second city chapter, domestic routes, a country of 60 cities | **Ahead** | |
| Construction | ACEO: contractors, build time | Six stages paid as they run, lorries of material from industry, Finish now | **Ahead** | |
| Information and UI | ACEO: panels and overlays; praised as easy to navigate | Problems on the map with a one-click fix, the chain overlay, info views, the side view, `st.warn` | **Level** | Clearer causes, but no hour-by-hour view of demand against capacity |
| Ground pathing quality | Both: the top complaint | Reservations, hold-short, towing out of gridlock | **Ahead** | But see bug B1: departures can stick for days |

**Tally: 8 ahead, 7 level, 6 behind.** Everything behind is the process between landing and take-off.

## 2. The playthrough and the checklist

### How it was played

`tools/round5a-play.js` is round 4's steady player with more screenshots. It plays a fresh Career from the start screen at 1440 × 900 for 32 minutes:
- found the airport, order the Starter, Finish now;
- watch at 32×, and Wait when idle;
- answer cards with the first choice;
- sign what fits;
- build what markers, goals and milestones ask for.

Two more captures:
- `tools/round5a-zoom.js`: the turnaround at stand zoom, and the wheel while following.
- A copy of `tools/round2-play.js --quick`, writing to this folder: the `r2-*` shots.

Pacing (`round-5a/pacing.json`):
- **The airport.** Open at 1.2 min; first landing at 1.5 min.
- **Goals.** 14 done; the longest wait was 27.9 min, in Chapter 3.
- **Events.** 48, of 12 kinds; the longest gap was 1.9 min.
- **Milestones.** 2,000 a day at 2.1 min, 6,000 at 4.4, 15,000 at 9.2.
- **Errors.** No page errors.

**The tool's own fault, as in round 4.** In Chapter 3 it placed a civil radar beside the first fix every 20 s. That is 22 radars in one spot:
- band crowding made them cost ₭69M an hour;
- the treasury fell from ₭3,932M at minute 5 to −₭17,862M at minute 32.

A headless probe (seed 7, the consultants' three airways, 1,200–1,600 km long) reached 75% cover with one radar in the middle of each airway. So the goal can be reached, but nothing tells the player where radars go or how many are needed (see R12). The money rows after minute 7 measure the tool, not the game. What the game did with that debt is a finding (B2).

### The checklist

| # | Item | Score | Evidence |
| --- | --- | --- | --- |
| 1 | Knows what to build first, where and why, within 2 min | **Met** | `00-opening.jpg`, `01-next-goal.jpg`: Next goal with its reward and a How. Rough: Chapter 1's How says "Open the Aviation room (V) and press Found a new airport" (`story.js:211`), but founding is on the Build bar; the reward line is clipped at the panel edge |
| 2 | A working airport that looks real in 5 min and about 30 clicks | **Met** | Starter ordered at 0.6 min, open at 1.2 (`02-starter-ghost.jpg`, `04-built.jpg`) |
| 3 | Snaps, shows price and time, one action, Esc cancels, nothing crooked unsaid | **Partly** | Ghost, price and Build button are good (`02-starter-ghost.jpg`). The ghost shows no build time. The caption-like hint ("Starter airport placed. R turns it. Build (or Enter) builds it; a click elsewhere mov…") is clipped and doubles the shortcut strip beside it |
| 4 | Construction worth watching, skippable | **Met** | `03-construction.jpg`: stages, Finish now, "2 jobs left". Crews are specks at the whole-airport zoom |
| 5 | First airliner lands in 10 min; follow it; see each service | **Partly** | Lands at 1.5 min, followed in (`05-turnaround.jpg`). The panel lists the services at work. But: the vehicles are specks below z 150 and flat chips at z 320 (`z-stand150.jpg`, `z-stand320.jpg`). The label "Passengers getting off: 40 min left" is the whole turnaround's time, not deboarding. "Stand 0" counts from zero. Clicking the aircraft on its stand selected the airport (`r2-03-stand-selected.jpg`) |
| 6 | Alive at every zoom, busier looks busier | **Partly** | At 20:03 with 8 deals: 1 movement an hour of 38 (`11b-night-z22.jpg`). At 21:46: 0 passengers an hour (`12-chain.jpg`). Passenger flights stop 23:00–06:00. At the end, 31 aircraft and 17 deals gave 147 passengers an hour of 5,663 (`06-end.jpg`). Chapter 3 leaves the radar-coverage tint over the whole map |
| 7 | Everything built visibly changes something | **Met** | "+1,064 passengers an hour", "+8 stands", "Freighter can land" float over the works (`03-construction.jpg`); runway-opens card. The floating labels overlap each other and the building names |
| 8 | Always knows the next goal and its reward; goals every few minutes | **Partly** | The line is always there with its reward. But Chapter 3's radar goal stalled for 28 min: its How names no place or count, and placing a radar shows neither the airway cover it adds nor the crowding cost |
| 9 | Something different at least every 5 min | **Met** | 48 events, longest gap 1.9 min; 8 different deck cards (`03-decision.jpg`) |
| 10 | Growth felt within the first hour | **Partly** | Milestones and their pieces at minutes 2.1, 4.4 and 9.2 (`04-milestone.jpg`). But the airport they built was hollow by the end: 147 passengers an hour, 1 movement an hour, departures stuck (B1) |
| 11 | Basic tasks on the map; problems where they are, fix one click away | **Partly** | Markers with fixes work (`02`/`03-construction.jpg`, `06-end.jpg`). But the fuel marker blames fuel for every hold, reading "4 departures waiting 10,050 min" (B1). In `09-problem.jpg` a fuel problem was raised while the panel said "Nothing needs you here now" |
| 12 | The systems connect visibly | **Met** | Chain at region zoom: towns by road, the terminal, flights out, money back, in words (`12-chain.jpg`, `12b-chain-near.jpg`). The money dots are small at region zoom, and labels overlap the city name and route tags |

**5 met, 7 partly, 0 not.** Round 4's report had 1 and 8–10 met. Here 8 and 10 drop to partly: the chapter after Chapter 2 and the end state of a grown airport were measured for the first time.

## 3. Rough edges

**Bugs**
- **B1. Departures stuck for days, reported as fuel.**
  - `tl.fuelWait` adds every departure hold to one number: no fuel, the light-aircraft gap, the airway release, and `IC.gopsDepart` failing (`aviation.js` l.552–564).
  - The fuel problem (`problems.js` l.35) and the stand's words (`groundops.js` l.1219) average that number.
  - At minute 32, 4 departures had waited 10,050 min, and the marker offered "Add a fuel tank".
  - Something kept them on the stand (most likely `gopsDepart` returning nothing); it needs finding.
- **B2. Debt has no consequence.**
  - −₭17.9 billion in Act I, with running costs of ₭73M an hour against ₭3.1M coming in (`08-economy.jpg`).
  - Confidence fell to 35 and stopped there: it cannot fall below 5 before Act III.
  - Nothing stopped spending, offered a loan, or brought in the Treasury.
- **B3. Wait offered a target it will never reach.** "₭439M to go for ₭3,350M in the treasury, never at this rate" (`12-chain.jpg`).
- **B4. Clicking an aircraft on its stand selects the airport** (`r2-03-stand-selected.jpg`, at the default whole-airport zoom).

**Words**
- **The turnaround's label is wrong.** "Passengers getting off: 40 min left" is the turnaround's remaining time shown against a 10-minute phase.
- **Stands count from 0** ("Stand 0").
- **Chapter 1's How points at the Aviation room** for founding (`story.js:211`, also l.283).
- **Clipped lines:**
  - the reward line in the goal panel;
  - the Build hint caption;
  - the advisor line repeats the name ("Lena Okafor Lena Okafor, airports. I …").
- **Chapter 3's radar goal** says "sees 80% of the airways" but not how many radars, where, or what crowding costs.

**Visual polish**
- **Service vehicles are tiny** at stand zoom: specks at z 150, flat chips at z 320 (`z-stand150.jpg`, `z-stand320.jpg`). No people on the apron at the stairs.
- **Floating labels collide:**
  - over the works ("Regional turboprop can land" over "Fire station");
  - over the chain ("Talford" under the route tags);
  - beside the airport.
- **Money dots** on the chain are hard to see at region zoom.
- **Chapter 3 turns on coverage, airways and rings for good**: the civil map stays under a green tint with a radar legend (`06-end.jpg`).
- **Night is empty:** one or two aircraft and no movements.

**Feedback and controls**
- **The aircraft panel takes the right quarter of the screen** at full height. The airport panel's deal rows wrap into a narrow column beside their buttons (`r2-05-turn-mid.jpg`).
- **The Build bar stays open after building**, so together with the goal panel and the inspector, about 45% of the screen is covered (`z-stand320.jpg`).
- **The milestone card** came while the camera followed an aircraft in cruise, so it sits over empty fields (`04-milestone.jpg`).
- **Placing a radar** shows neither the airway cover it adds nor the crowding cost.

**Pacing**
- **Chapters 1–2 are fast** (milestones at 2, 4 and 9 minutes); Chapter 3 stalls.
- **The airport outgrows its traffic.** Capacity raced ahead (38 movements an hour, 5,663 passengers an hour) while actual use fell, so the hub looks empty.

## 4. The plan

What "better than Airport CEO outside the terminal" needs:
- **Their depth of process:** a schedule, ground handling, supply, people and emergencies as things to run.
- **Our clarity:** every one of these shows on the map, in plain words, with a cause and a one-click fix.
- **None of their busywork:**
  - no flight-by-flight planner;
  - no per-vehicle micromanagement;
  - fewer menus: everything inside the airport panel and on the map.

### (a) Depth and function, ranked

| # | Item | Why it matters to a player | Evidence | Size | Files |
| --- | --- | --- | --- | --- | --- |
| D1 | **Fix stuck departures and say the real reason** (B1): split `fuelWait` into a hold reason; each reason has its own marker and fix (fuel, release, no taxi route, light aircraft); a departure held over an hour gets towed or cancelled with a cause | A hub that silently stops moving is the worst thing a player can meet, and the marker sends them to build the wrong thing | `06-end.jpg`: 10,050 min; 1 movement an hour of 38 | S | aviation.js, problems.js, groundops.js |
| D2 | **The day board**: one airport-panel view of today's flights by hour against what the runways, stands and terminal can take (`IC.aptDayLog`, `IC.aptStats`). Each airline gets **slots**: its flights are spread to times, with a cap per hour the player sets. A **night policy** (curfew / cargo only / open, with noise and fees). Nothing is planned flight by flight | Airport CEO's planner is its core loop and its most hated chore. Ours lets the player see and shape the peak (and the empty night) in two clicks | No schedule (`aviation.js` ~l.540); flights stop 23:00–06:00; the quiet night in `11b-night-z22.jpg` | L | aviation.js (departure times from slots), inspector.js (board), warroom.js, deck.js (the holiday rush and charter cards use slots), tests |
| D3 | **Ground handling as a resource**: a GSE depot piece holds the airport's handling fleet (tugs, belt loaders, catering, buses, stairs, fuel trucks) in counts the player buys. The turnaround waits for a free vehicle of each kind, and the vehicles drawn are the real ones. Vehicles age and go to the depot for maintenance (a share off the road at a time) | The services are already shown; making them real gives the player something to size, and gives the scenery meaning | `aptlife.js` draws jobs after the fact; vehicles are scenery | L | aptlife.js, aviation.js (turn time), airport.js (`APART.gse`), pieces.js, problems.js ("Stand 4: waiting for a tug"), render-life.js |
| D4 | **Fuel supply and margin**: fuel bought at a price that moves (a monthly market line), delivered by lorry or rail (visible on the access road) or pipeline, sold into planes at a margin the player sets. Tanks can run dry when deliveries are cut (fuel shortage card, roads cut in war) | A second business line and a supply chain the player can see, the way Airport CEO and SimAirport have one | Resupply is the constant `IC.FUEL_IN` | M | airport.js, growth.js (statement line), traffic.js / landside.js (lorries), deck.js, inspector.js |
| D5 | **Money with consequences** (B2): below zero the Treasury steps in, in stages: a warning card with choices (an emergency loan at a worse rate, cut costs, sell an asset); then no new building; then confidence falls below 5. Buying asks first when it would put the treasury under zero | Without it, nothing is at stake; "punish bad decisions fairly" is an owner rule | `06-end.jpg`, `08-economy.jpg`: −₭17.9 billion and nothing | S | growth.js, story.js, units.js / builder.js (pre-check), logistics.js (Wait) |
| D6 | **Airline scorecards by aspect**: on-time, taxi time, gates and bridges, fees, facilities (hangar, cargo, lounge), routes, each 0–100 with the worst named and its fix. Shown on the airline's card and the deal row | Airport CEO's ratings are many factors; ours already has the reasons (`judge`) but shows one number | `aviation.js` l.423–445 | S | aviation.js, inspector.js, warroom.js |
| D7 | **Airside staff as shifts**: per airport, crews for the tower, approach, fire and ramp, on day and night shifts (one row each, a stepper). Too few means wider spacing, a slower fire response, or slower turnarounds, said on the map. The night shift opens night flights (D2) | People to decide about, without a hiring screen; ties night ops, fire cover and ATC workload together | Controllers are costed automatically; there is nothing to decide | M | airspace.js (workload), groundops.js (`IC.fireTime`), aviation.js, growth.js, inspector.js |
| D8 | **Emergencies handled live**: an in-flight emergency (engine failure, smoke, medical, gear) calls in. The player picks a runway and priority, the fire trucks roll and are seen, the runway closes until it is clear, and the aircraft goes to a hangar. Good fire cover and a free runway decide the outcome and the name | Airport CEO's Alpha 36 favourite; ours has the parts (fire time, runway closure, accident report) but resolves by card | `deck.js` medical and diversion cards; `IC.gopsRisk` | M | deck.js, groundops.js, render-airport.js, aviation.js |
| D9 | **De-icing operations**: frost days by season; aircraft need spraying within a holdover time before take-off; pads and trucks, a glycol stock delivered like fuel; the queue on the map | Winter becomes an operation, not just fog | `IC.APART.deice` only shortens a stand delay | S/M | weather.js, groundops.js (`m.via`), airport.js, problems.js |
| D10 | **Airlines keep their gates**: a preferred pier or gates for an airline (a deal term), and a contact-stand share in the scorecard | Airport CEO lets you choose stands; ours cannot keep the flag carrier on its pier | `freeStand` is automatic only | S | aviation.js (`freeStand`, `IC.dealTerms`), inspector.js |
| D11 | **A runway and ATC capacity view**: arrivals and departures an hour by hour against capacity, queue and holding, the controllers' load, in the airport panel's day board | Explains "1 movement of 38"; Airport CEO has nothing like it, so it is ours to win | `IC.aptStats` has the numbers; nothing shows them over a day | S (with D2) | inspector.js, airspace.js |

### (b) Process and polish, ranked

| # | Item | Why | Evidence | Size | Files |
| --- | --- | --- | --- | --- | --- |
| P1 | **Service vehicles at a size you can read**: drawn from z 30 at a floor of a few pixels, real outlines close in (tug, belt loader, high-loader, fuel bowser), people walking to the stairs; the tug pushes the aircraft | The trailer's first note; turnarounds are the most watched thing in the game | `z-stand150.jpg`, `z-stand320.jpg` | M | render-life.js, aptlife.js, render-models.js |
| P2 | **A compact aircraft panel**: a slim card (what it is doing, the time left, Follow) that expands on demand. A click on an aircraft at its stand picks the aircraft (B4) | A third of the screen covered is the trailer's second note | `05-turnaround.jpg`, `r2-03-stand-selected.jpg` | S | inspector.js, main.js (pick order) |
| P3 | **The Build bar closes after a build**; the caption hint over Build goes, its words move into the shortcut strip; the ghost shows the build time | The trailer's third note; screen space | `02-starter-ghost.jpg`, `z-stand320.jpg` | S | buildbar.js, builder.js, main.js |
| P4 | **Labels that never overlap**: the works' floating gains, building names and chain tags go through one placement pass (like `IC.aptLabels`), important first | Every busy screenshot has collisions | `03-construction.jpg`, `12b-chain-near.jpg` | M | render-airport.js, render-chain.js, airport-shapes.js |
| P5 | **Money dots readable at region zoom**: a fixed minimum size and a coin glyph, and the busiest route's figure as a tag | The trailer's fifth note | `12-chain.jpg` | S | render-chain.js |
| P6 | **Turnaround words**: "Turnaround: 40 min left · now: passengers off (8 min)"; stands numbered from 1; the advisor line without the repeated name; Chapter 1's How on the Build bar | Plain, correct words are an owner rule | `05-turnaround.jpg`, `00-opening.jpg`, `story.js:211` | S | aptlife.js, inspector.js, story.js, ui.js |
| P7 | **Radar placement that teaches**: while placing, show "+22% of the airways seen" and the crowding cost ("3 radars on this band within 70 km: +45% upkeep"); Chapter 3's How names where (the amber stretches) and roughly how many | Chapter 3 stalled 28 minutes in two rounds running | `13-ch3.jpg`, `06-end.jpg` | S/M | units.js / sensors.js (ghost), story.js |
| P8 | **Layers that belong to the moment**: the radar tint shows only while placing a radar or in the Airspace tab, not for the rest of the Career | The civil map stayed green from Chapter 3 on | `11b-night-z22.jpg`, `06-end.jpg` | S | story.js l.323, render.js |
| P9 | **Wait that is honest** (B3): never offer an unreachable target; say "never at this rate" with a loan or cut-cost button instead | Confusing at a bad moment | `12-chain.jpg` | S | logistics.js, ui.js |
| P10 | **A busy airport looks busy from afar**: aircraft and vehicles keep a minimum on-screen size at z 3–10; taxiing aircraft leave a short trail; the terminal glass brightens with passengers an hour | "The airport looks alive at every zoom" (checklist 6) | `11b-night-z22.jpg`, `09-problem.jpg` | S/M | render-airport.js, render-life.js |
| P11 | **Cards placed where the player is looking**: a milestone card frames the airport (stop following first) | `04-milestone.jpg` shows fields | — | S | deck.js, aptlife.js (follow) |
| P12 | **Airport panel rows that breathe**: deal rows on one line (airline · route · aircraft · charges · months left), buttons on hover | Cramped wraps | `r2-05-turn-mid.jpg` | S | inspector.js |

### Top 10, in order

1. D1 Fix stuck departures, with the real hold reason (S)
2. D5 Money with consequences (S)
3. D2 The day board, with slots and a night policy (L)
4. P1 Service vehicles you can read at stand zoom (M)
5. D3 Ground handling fleet and depot (L)
6. P2 Compact aircraft panel, and picking aircraft at stands (S)
7. D4 Fuel supply and margin (M)
8. D6 Airline scorecards by aspect (S)
9. P4 Labels that never overlap (M)
10. P7 Radar placement that teaches, and Chapter 3's words (S/M)

### Round 5b: depth (about a day)

1. **D1** (S): stuck departures and hold reasons. A test: *a departure held for any reason shows that reason; none is held over an hour without being towed or cancelled*.
2. **D5** (S): the Treasury steps in below zero. A test: *the treasury cannot fall below the emergency line without a card, and building stops*.
3. **D2 + D11** (L): the day board in the airport panel, slots per airline with an hourly cap, a night policy, and capacity against demand by hour. Tests: *flights spread to their slots; a cap moves flights out of the peak; a night policy lets cargo and red-eyes fly and the town's noise follows*.
4. **D6** (S): airline scorecards by aspect, on the airline card and the deal row.
5. **If time remains, D3's first step:** a GSE depot with tug and bus counts that gate pushbacks and remote boarding. Leave the other vehicle kinds and maintenance for a later round.

*Out of 5b:* D4, D7, D8, D9 and D10. These are the next depth round. D4 (fuel) and D3's rest are the strongest.

*Done when:*
- the end-of-run airport has no stuck departures;
- its day board shows a peak the player can move;
- the night is no longer empty by default;
- going broke has a consequence;
- `npm test` is green and the Academy plays.

### Round 5c: polish (about a day)

1. **P1** (M): vehicles and people at stand zoom.
2. **P2** (S), **P3** (S) and **P12** (S): the compact aircraft panel and picking order; the Build bar closing, the hint moved into the strip, build time on the ghost; airport panel rows.
3. **P4** (M) and **P5** (S): one label pass; readable money dots.
4. **P6** (S), **P7** (S/M), **P8** (S) and **P9** (S): words, Chapter 3 guidance, layers, an honest Wait.
5. **If time remains:** P10 and P11.

*Done when:*
- a repeat of this playthrough (`tools/round5a-play.js`, with its radar rule fixed to place along the amber stretches, plus `tools/round5a-zoom.js`) scores checklist 3, 5, 6, 8 and 11 as met;
- the trailer's five notes are gone in before-and-after shots.

## Decisions for the owner

1. **A schedule without a planner.** Slots per airline with an hourly cap and a night policy, never flight-by-flight dragging. Is that the right answer to Airport CEO's planner?
2. **Ground handling as a fleet the player buys** (counts per depot, not single vehicles to assign). Acceptable as "one more thing to run", or should handling stay automatic with only a capacity number?
3. **Going broke.** Should Act I be able to end in dismissal, or only stop building and cost confidence?
4. **Night flights.** Today passenger flights stop 23:00–06:00. Should a night policy (with the curfew card's noise trade-off) be the player's choice from the start, or a research item as in Airport CEO?

## Files

- This report: `docs/focus/round-5a-benchmark.md`.
- Screenshots and `pacing.json`: `docs/focus/round-5a/`.
  - `00`–`13`: the 32-minute playthrough.
  - `z-*`: stand zoom and following.
  - `r2-*`: the round-2 path.
- Tools: `tools/round5a-play.js` (the playthrough), `tools/round5a-zoom.js` (stand zoom).
