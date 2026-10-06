# Career playtest 1: the opening, as a new player

Played on `origin/main` at `1c40b94`, in headless Chromium at 1440 × 900, from the start screen. I drove the page with real mouse clicks and keys. I used `IC.*` only to read state (logs, warnings, the calendar) and to time frames. I never used it to build or to move time, except where noted. Screenshots are in `docs/focus/playtest-1/`; a bare number like `30` means `playtest-1/30-*.jpg`.

Real-time figures include about 1–3 s of tool lag per action, so a human would be faster. Frame rates come from software rendering with no GPU, so they are an upper bound on stutter, not a measurement of a real laptop.

## 1. Verdict

The first ten minutes are the best thing in the game. The Minister's card and the goals panel give a clear first task. The site survey is genuinely informative. Placing a runway, a parallel taxiway, an apron and a terminal gives precise, readable feedback: snap labels, metres from the centreline, and "this apron is 15 times what one airliner needs". Construction visibly moves through its stages, and a night airport with edge lights looks good.

After that the game goes flat. The first three airliners all divert in snow because nothing told me a landing system was needed, and the first landing happens off-screen at 32× without any fanfare. Chapter 2 opens with four of its goals already ticked. From there the loop is waiting: one offer every month or two, deals of 9–18 months, a goal to "see a deal through to its end", and a treasury that only goes down. January closed at −₭1,109M, March at −₭101M, and the Wait panel says reaching ₭4,700M will take "about 1.8 years at this rate". Wait mode then got stuck re-stopping on the same airspace incident.

The airport I built never looks like more than a small regional field. Nothing on the apron moves except aircraft and one pushback tug. Nothing I built after Chapter 1 changed what I saw or what I earned.

The owner's four complaints all hold:
- **Far apart.** Systems talk through panels, not on the map.
- **Building feels bad.** It is micro parts with no grand result.
- **Progression feels bad.** The only lever is waiting.
- **Unclear.** The important rules (ILS in winter, runway strip clearance, what earns money) arrive as log lines after the damage.

## 2. The path I played

| Real (min:s) | Game date | What I did / what happened | Shot |
| --- | --- | --- | --- |
| 0:00 | – | Start screen. Clear and attractive. Clicked **Career**. | `01-start` |
| 0:05 | Jan Y1 07:00 | The game loaded in 5.3 s. The Act I card appeared over half-loaded, blurred tiles with a black band along the bottom. | `03-career-open` |
| 0:30 | 07:01 | Four "Got it" tips (goals, rooms, time, menu). The tip box covers the goals panel title. | `04-after-card`, `07-tip4` |
| 1:00 | 07:05 | Clicked **Build** (top right) rather than Aviation (V) as the goal text says. The build bar offers "Found an airport". | `08-build-button` |
| 1:20 | 07:08 | Found mode. No ring for "15–40 km from Velova", no distance shown on hover, no wind arrow. | `09-found-mode`, `10-found-hover` |
| 1:40 | 07:10 | Clicked a site about 25 km east. The survey shows 08/26 into the prevailing wind, 6 m levelling, no homes, total ₭92M. The "Right-click: cancel" chip covers the Found button. | `11-survey`, `12-survey-zoom` |
| 2:00 | 07:12 | **Found**. The treasury fell by ₭140M, not ₭92M: a ₭48M, 20 km access road was added that the survey never mentioned. The surveyed runway line vanished; the field is empty except for a selection bracket. | `13-founded`, `14-after-found` |
| 2:30 | 07:19 | Picked **Runway**, clicked two ends, 3.0 km concrete. The info box covers the line being drawn and lists aircraft codes ("C172, ATR, A32, B77…"). The runway preview is a 2 px line at this zoom. | `16-runway-tool`, `17-runway-drag`, `18-runway-placed` |
| 2:45 | 07:23 | **Build · ₭449M · 1.9 h**. **First runway placed: about 17 clicks, about 2.5 real minutes.** | `19-runway-built` |
| 3:30 | 07:31 | Mouse-wheel zoom jumps 4.7 → 18 → 45 in two notches. The build bar, hint bar and inspector cover about 40% of the screen. | `24-zoom-apron` |
| 4:00 | 07:37 | Closed the inspector with ×. That **deselects the airport**, and the build bar empties to "Select an airport to build on". Clicked the airport again. | `28-parallel-preview`, `29-reselect` |
| 4:30 | 07:41 | **Parallel taxiway**: click the runway, click out at 190 m. A good tool. Once queued, the taxiway is **invisible** (only a tiny "QUEUED" label). | `30`, `31`, `33` |
| 5:00 | 07:45 | Apron 460 × 120 m, lined up with the taxiway, 10 stands; preview grid shown. | `34-apron-drag2`, `35-apron-set` |
| 5:30 | 07:50 | Terminal snapped "flush with the apron" (405 passengers/h). Eight terminal shapes on offer. The hint bar still described the Apron tool after I switched tabs. | `37`, `39` |
| 6:00 | 07:54 | **Wrong build on purpose:** fire station 110 m from the runway centreline, inside the runway strip. No warning then or later (`IC.aptStats` lists nothing). | `42`, `43`, `44` |
| 6:30 | 07:58 | Fuel farm, then control tower ("one movement every 2 min instead of every 8"). A toast: "out of concrete; runway waits". | `46-navaids-tab`, `47-tower-hover` |
| 7:00 | 08:04 | Works tab: one crew, jobs queued with reasons; "+ Crew ₭20M" exists. | `49-works-tab` |
| 7:30 | 09:43 | At 32×, "Runway 08/26 opens" card, while a banner says "RUNWAY CLOSED". The camera had moved. | `50-at-32x` |
| 8:00 | 10:44 → 11:18 | Taxiway, apron and terminal complete; snow starts. **"Open for business"** card. **Open: about 45 clicks, about 7 real minutes, 4 h 18 min game time.** | `51-runway-closed`, `52-reyes` |
| 9:00 | 12:24 | All four Chapter 1 buildings are visible and tidy, but small. | `54-landing` |
| 11:00 | 13:15–13:53 | **All three first airliners diverted**: "fog or low cloud, and no landing system (ILS)". This was log lines only; I found out by reading `S.logs`. Airline satisfaction fell from 62% to 54%, and each deal was charged a ₭2M cancellation. | `55-diverted` |
| 12:00 | 15:26 | Built an ILS on runway 26. The ILS hover shows "₭0M · about 0 s of work". Pressing **5** for 16× switched the build bar to tab 5 instead. | `57`, `60` |
| 13:00 | 18:56 | **First airliner landed and parked**, at 32× and off-screen; I never saw it. The Chapter 2 card came at 19:03 with **4 of 10 goals already done** (ILS, tower, stop backtracking, 10 stands). **First landing: about 13 real minutes, about 12 h game time.** | `61-first-landing` |
| 14:00 | 19:14 | Aviation room → Operations is a good dashboard. Deals tab: three contracts already running; "Sign a deal" is unticked; "no offers… every few hours". | `63-aviation-room`, `64-deals` |
| 14:30 | 19:14 | **Wait** popup: "₭271M to go for ₭4,700M, about 1.8 years at this rate". | `65-wait` |
| 15:00 | 19:55 | At z ≈ 200: two A320s on stands, one pushback tug. No buses for the remote stands, no fuel trucks, no baggage, no people. | `70-stand-zoom`, `71-stand-live`, `73-pushback2` |
| 16:00 | 20:10 | Hangar built (goal ticked). The landside grew by itself: car park, bus stop, taxis. | `74-after-wait` |
| 17:00 | Feb Y1 00:03 | "January closed: ₭166M came in, ₭1,276M went out, −₭1,109M." | – |
| 18:00 | Feb Y1 22:36 | Two offers. The deal card is the best screen in the game. Signed Aldis Air: "4 running, ₭19M a day". No acknowledgement; the card just vanished. | `76-offer`, `77-signed` |
| 19:00 | 22:41 | New goals: five deals at once, and see one deal (9–18 months) through to its end. "Something new comes in about 8 months." | `78-after-sign` |
| 20:00 | 22:41 | Economy room. **First money**: fees of about ₭1.4M/h against ₭2.1M/h going out. "+₭0.3M an hour, growing ₭22M a month" sits beside "yesterday, net −₭16M". | `86-economy` |
| 21:00 | Feb → Mar | Second terminal (666 passengers/h), and a second runway 400 m south. Its preview warns well: "closer than 760 m… one lands while the other departs; no taxiway joins it yet". | `79`–`82`, `85` |
| 23:00 | Mar Y1 12:21 | **Wait became unusable**: it stopped 10 times in a row within 0–1 game minute on "ALD 395 and ALD 770 lost spacing… no radar". | `87-wait-stuck`, `89-wait-stops`, `90-state` |
| 25:00 | Mar Y1 | Second runway open (26R arrivals, 26L departures); warning "no taxiway reaches it"; joined it with a 520 m taxiway. | `90-state`, `91-taxi2-view`, `92-taxi2-drag` |
| 26:00 | Mar Y1 | Whole-country view: our airport is one dot among air bases and industries. | `93-region` |
| 28:00 | Apr Y1 05:20 | 100 real s at 32× = 9 game hours. A month at 32× is about 13.5 real minutes; with Wait, about 63 s when it is not interrupted. March closed at −₭101M. Treasury ₭3,976M, −₭1/h. | `94-april`, `95-capital-button` |
| 29:00 | Apr Y1 | Career room: Act I unlocks are rooms and delegates; Acts II–IV list "Whisper, Kestrel, Lowwatch", "QRA Commander" and similar. | `96-career-room` |

**Key timings** (real time includes tool lag):
- First runway ordered: about 17 clicks, 2.5 minutes.
- Airport open for business: about 45 clicks, 7 minutes.
- First landing: 13 minutes, after a 4-hour game delay caused by three diversions.
- First money: fees start with the first landing. The treasury never grew in the three months I played (₭5,501M → ₭3,976M).
- Chapter 2: 14 minutes.
- Chapter 3: not reached. Its fallback is 15 months away, which is at least 16 real minutes of uninterrupted Wait.

## 3. Ranked problems

Severity: **blocker** = cannot continue or badly broken; **major** = confusing, ugly or feels pointless, and a reviewer would notice; **minor** = polish.

### Blockers

1. **The first airliners all divert, with no warning.** **(blocker)**
   - *What I did:* followed every Chapter 1 goal and the Guide, then opened in January.
   - *What I expected:* the first airliner to land, as the card promised.
   - *What happened:* snow came (winter, visibility 1.2 km). All three flights diverted with "no landing system (ILS)". Satisfaction went from 62% to 54% and each deal was charged ₭2M. ILS is not a Chapter 1 goal, not in the Guide, and not in the "Open for business" card. The only news was three log lines. The first landing slipped by about 8 game hours.
   - *Shots:* `55-diverted.jpg`, `52-reyes.jpg`.
2. **Wait gets stuck on a repeating incident.** **(blocker)**
   - *What I did:* used Wait to pass the month.
   - *What happened:* the same loss-of-spacing message between two of our flights (no radar, an Act I fact of life) stopped Wait 10 times in a row within a game minute. In Act I the player cannot fix it: radar is the next chapter. In practice the player has to drop back to 32× (13.5 real min a month).
   - *Shot:* `87-wait-stuck.jpg` (pause menu over it), `89-wait-stops.jpg`.

### Major

3. **The first landing is never shown.** At any speed the first touchdown and taxi-in happen wherever the camera is. The game cuts straight to the Chapter 2 card. This is the biggest emotional payoff of the opening, and it is missed. The Guide even says "zoom in to watch one land", but nothing takes you there or slows down. *Shot:* `61-first-landing.jpg`.
4. **Money only goes down, and the game says so in confusing ways.**
   - Month 1 was −₭1,109M, month 2 −₭313M, month 3 −₭101M.
   - The economy room shows "+₭0.3M an hour, growing ~₭22M a month" next to "yesterday net −₭16M" and "8 idle stands".
   - Wait says ₭271M will take 1.8 years.
   - A new player cannot tell whether they are doing well. There is no moment where money visibly flows in from what they built.

   *Shots:* `65-wait.jpg`, `86-economy.jpg`.
5. **Chapter 2 collapses, then stalls.** It opened with 4 of 10 goals ticked because I had built sensibly in Chapter 1. Its remaining goals are waits: five deals at once (offers arrive every 1–2 months), see a deal of 9–18 months through to its end, "something new in about 8 months", and a 15-month fallback. Nothing for the player to *do*. *Shots:* `61-first-landing.jpg`, `78-after-sign.jpg`.
6. **The surveyed runway disappears after Found.** The survey draws a runway, its approach funnels and "into the prevailing wind". After Found, the field is empty and the player must redraw by eye. Lena even says "a site, a survey and a runway heading", but the heading is gone. *Shots:* `12-survey-zoom.jpg` → `14-after-found.jpg`.
7. **The founding cost hides a ₭48M road.** The survey said "Total ₭92M"; ₭140M left the treasury. The 20 km access road (and that the site was 20 km from a road) was never mentioned before Found. *Shot:* `13-founded.jpg`.
8. **A wrong build goes unexplained.** A fire station 110 m from a runway centreline (inside the runway strip) was accepted, ticked the goal, and produced no warning in the preview, the inspector or `aptStats`. The second runway, by contrast, explains itself well (see section 4). *Shots:* `43-fire-placed.jpg`, `54-landing.jpg`.
9. **Queued and in-progress works are invisible.** A queued taxiway is not drawn at all, only a 6 px "QUEUED" label; a queued ILS draws nothing. The runway preview at the build zoom is a 2 px line. The player cannot see their plan. *Shots:* `33-parallel-built.jpg`, `48-works-tab.jpg`, `18-runway-placed.jpg`.
10. **Closing the inspector deselects the airport and empties the build bar.** The natural way to clear the screen is ×. It throws away your tools, and the bar says "Select an airport to build on". *Shot:* `28-parallel-preview.jpg`.
11. **The UI covers the airport you are building.** The build bar (two rows of tabs plus cards), the hint bar, the inspector (370 px) and the goals and messages panels leave a window of about 1000 × 450 px. Tooltips sit on top of the line you are drawing. *Shots:* `17-runway-drag.jpg`, `24-zoom-apron.jpg`, `34-apron-drag2.jpg`.
12. **The airport looks dead.** At stand zoom there are two aircraft and one pushback tug, nothing else. Passenger buses for remote stands, fuel trucks, baggage tugs, catering, people at the terminal and cars on the access road are all absent. The landside (car park, bus stop, taxis) appears but nothing moves in it. *Shots:* `70-stand-zoom.jpg`, `71-stand-live.jpg`, `73-pushback2.jpg`.
13. **The airport looks small, even when finished.** At the zoom a player would screenshot (z ≈ 18–30), a 3 km runway, a 460 m apron, two terminal boxes and a few sheds sit in a sea of fields. There is no sense of a "national airport". *Shots:* `54-landing.jpg`, `90-state.jpg`.
14. **Number keys mean two things.** "Speed time up (keys 1–6)" (Guide), but with the build bar open, 1–8 switch build tabs. Pressing 5 for 16× opened Cargo & hangars. *Shot:* `60-paused-check.jpg`.
15. **Military noise in the civil act.** Col. Dana Reyes reports "Weather has grounded the helicopters" (repeatedly). The goals header says "1 command point". The Career room shows Tension, Doctrine, QRA and fighter names with no explanation. A new Director has no helicopters. *Shots:* `52-reyes.jpg`, `96-career-room.jpg`.
16. **Unrelated events stop play.** "TRN 740 and KES 291 lost spacing 85 km W of Gravia": two foreign overflights the player cannot act on. Weather lines are 44 of 137 log entries in three months.
17. **Mouse-wheel zoom is too coarse.** One or two notches jump 4.7 → 18 → 45, and the point under the cursor drifts. Finding the airport again needs the "Capital" button. *Shot:* `24-zoom-apron.jpg`.
18. **Founding gives no guidance on the map.** No 15–40 km ring around Velova, no distance readout, no wind rose and no suitability shading. The survey only appears after a click. *Shot:* `10-found-hover.jpg`.

### Minor

19. **Overlapping chips and labels.** The "Right-click: cancel" chip covers the Found button. The survey and "BUILDING 3%" labels stack on each other. *Shots:* `11-survey.jpg`, `21-apron-tab.jpg`.
20. **Black band while a card is shown.** A black band about 70 px tall appears at the bottom of the map while a card is up. *Shots:* `03-career-open.jpg`, `50-at-32x.jpg`, `61-first-landing.jpg`.
21. **Contradictory runway status.** "RUNWAY CLOSED" banner at the same moment as the "Runway 08/26 opens" card. *Shot:* `50-at-32x.jpg`.
22. **ILS hover shows no cost.** It says "₭0M · about 0 s of work" (the card says ₭25M). *Shot:* `57-ils-hover.jpg`.
23. **Build-time units disagree.** The Runway card tooltip says "about 4 min to build" (per 100 m?) while the runway took 2.3 h. Offers say "decide within 52.6 h", deals say "9 months". Hours and months mix in one panel. *Shots:* `82-rwy2-start.jpg`, `76-offer.jpg`.
24. **Stale hint bar.** After switching from Aprons to Terminals it still described the Apron tool. *Shot:* `37-terminal-tab.jpg`.
25. **Tab click didn't switch.** The first click on the Taxiways tab highlighted it but left the Apron cards showing. *Shot:* `26-taxi-tab.jpg`.
26. **Escape stacks the pause menu.** Escape on the Wait popup opens the pause menu on top of it. *Shot:* `66-hangar-tool.jpg`.
27. **The speed buttons move.** The top bar's speed buttons shift sideways as the date text width changes ("January" vs "April"), so a remembered click lands on the wrong speed.
28. **Signing a deal has no payoff moment.** The card vanishes, and the terminal requirement on the other offer silently grew from 470 to 562 passengers/h. *Shot:* `77-signed.jpg`.
29. **The chapter title misleads.** "Chapter 2 · The capital's airport" reads as a second airport. It is the same one.
30. **Performance (software rendering, no GPU).**
    - At 32×: 23 fps, worst frame 221 ms.
    - At z 0.3 at 4×: 28 fps, 16 frames over 50 ms in 10 s.

    Worth checking on real hardware with `tools/world-perf.js`.
31. **Console.** No game errors in the whole session. Only a favicon 404 from the test server and font retries through the proxy.

## 4. What already feels good (keep these)

- **The start screen and the Act I card.** The tone is confident, and the Minister's brief is one clear goal.
- **The site survey's sentence:** "Runway 08/26 · into the prevailing wind · Ground: 6 m to level · No homes under the flight paths · Total". It teaches siting in one line.
- **Feedback in the build previews:**
  - "This apron is 114 times what one airliner needs: ₭490M… 480 m deep where its medium stands need 78 m";
  - "190 m from the Runway 08/26 centreline";
  - "flush with the apron";
  - "faces the taxiway, with a 37 m taxiway to its door";
  - "closer than 760 m to another runway: one lands while the other departs";
  - "No taxiway joins it yet".

  This is exactly "realistic but explained".
- **The parallel taxiway tool** (two clicks for a full-length taxiway with links), **auto-alignment** of aprons and terminals to the taxiway, and **auto-joined buildings** (tower, hangar get their own link).
- **Construction stages on the map:** pegs, brown earthworks with lorries, "waiting: concrete", then markings and lights. The Works tab gives each job's stage, cost so far and *why* it waits.
- **The airport at night:** blue taxiway edge lights, white runway lights, arrows "26R-ARR / 26L-DEP". *Shots:* `73-pushback2.jpg`, `90-state.jpg`.
- **The close-up:** aircraft models on numbered stands with lead-in lines, and the pushback tug. *Shot:* `73-pushback2.jpg`.
- **The landside growing by itself** (car park, bus and coach stop, taxis "built by private money"). It is a small, free surprise.
- **The deal card:** route, aircraft, flights, length, worth, charges slider, and a ✓/✗ checklist against what the airport provides. It is the clearest screen in the game and makes building purposeful. *Shot:* `76-offer.jpg`.
- **Visitors:** "A head of state is visiting Velova International today", and "a vintage four-engine airliner… people will come out to watch". These are exactly the kind of events the game needs more of.
- **Aviation → Operations:** flights today, on time, diverted, arrivals and departures boards, the day's movements by hour.

## 5. Answers to the owner's four complaints

### Far apart (systems disconnected, too many panels between the player and the action)

- **On the map.**
  - The airport sits 25 km from Velova (the goal asks for 15–40 km) and was given a 20 km access road. From the country view our airport is one dot (`93-region.jpg`).
  - At the "Capital" button's zoom, Velova (2.2 million people) and the airport are both specks (`95-capital-button.jpg`).
  - Flights to foreign cities are not drawn as anything you would notice.
- **In time.**
  - The meaningful events in the first three months were:
    - airport open (game 11:18);
    - three diversions (13:15–13:53);
    - first landing (18:56);
    - one offer (Feb 22:36);
    - visitors;
    - a month statement each month.
  - Between them, the player watches weather lines. From the first offer to "Something new comes in about 8 months" is one to eight months of calendar, which is about 1–8 real minutes of Wait at best and 13.5 real minutes a month at 32×.
- **Between systems.**
  - Building is in the bottom bar, airlines in the Aviation room, money in the Economy room, story in the goals panel and Career room, and incidents in the log.
  - What I built (a second terminal, a second runway) changed nothing I could see in fees or offers in the time I played.
  - The deal card is the one place where two systems meet: an airline's needs against the airport's facilities.
- **Panels I opened to do basic things:**
  - goals panel, messages panel (expand and collapse), Build (top bar);
  - Build bar: 8 numbered tabs plus Looks & paint and Blueprints, Upgrade / Move / Bulldoze / Undo / Info views, and the hint bar with pavement, width, lights, stands and zone toggles;
  - airport inspector: Overview / Works / Charges / Operations / Airspace;
  - part inspector (runway);
  - Aviation room: Operations / Deals / Airlines / Airports and routes / Airspace;
  - Economy room (Money), Career room, Wait popup, pause menu.

  To **sign one deal** I needed Aviation room → Deals → the card. To **find out why flights diverted** I needed the Journal or log, since no panel says it. To **add a builder** I needed inspector → Works → + Crew.

### Building feels bad ("we can't build anything cool at all effectively")

**(a) Clicks and minutes to something you would be proud to screenshot.**

A working single-runway airport took about 45 clicks and 7 minutes (`54-landing.jpg`). A two-runway airport with two terminals took about 90 clicks and 25 minutes, including waits (`90-state.jpg`). Neither looks impressive: the parts are correct, but the composition is a long grey strip with a few boxes. Every taxiway, stand row and building is placed one by one, with a pavement, width, lights, zone and stand-size choice each time.

What would make it faster and grander:

1. **Stamp the surveyed runway on Found.** The heading and length are already chosen; let Found lay it, and save 4 clicks plus the guesswork.
2. **Airport templates and blueprints as the main way to build in Act I.** For example "Regional field (1 runway, parallel taxiway, 6 stands, terminal, tower, fire, fuel)", "National airport", or "Hub expansion: second runway with crossover taxiways". Drop the template on the surveyed site, see one total price and one build time, then edit. The `Blueprints` tab exists with 0 entries; `IC.layoutAirport` and the `'kden'` layout already exist.
3. **Bigger building blocks:**
   - a "terminal complex" (terminal, apron with jet bridges, landside, tower) dragged as one rectangle;
   - "add a pier" with gates on both sides;
   - "runway + parallel taxiway + rapid exits" as one tool.
4. **Defaults that hide micro-choices.** Pavement, width, lights, zone and stand size should default from the airport's size, with the toggles behind an "Advanced" fold.
5. **Faster visual payoff.** Stages are already drawn. Make the completed part pop: a short camera move, lights switching on, and the first aircraft using it.

**(b) Every moment the airport looked dead, and the life that is missing.**
- *Moments:*
  - after Found (an empty field, `14-after-found.jpg`);
  - queued works (invisible, `33-parallel-built.jpg`);
  - open for business with no aircraft for 7 game hours (`54-landing.jpg`);
  - two A320s on stands, with only a tug at pushback (`71-stand-live.jpg`, `73-pushback2.jpg`);
  - the landside car park and bus stop with nothing moving (`74-after-wait.jpg`);
  - the country view, with no visible traffic to our airport (`93-region.jpg`).
- *Missing life:*
  - passenger buses to remote stands (the apron preview said "passengers go by bus");
  - fuel trucks from the fuel farm to the stands;
  - baggage carts, catering, stairs trucks;
  - fire tenders on standby by the runway;
  - cars and coaches on the access road into the car park;
  - people at the terminal kerb;
  - a follow-me car;
  - birds;
  - more than three aircraft.

  `render3d-life.js` already has much of this in the 3D replay window, but the 2D map at stand zoom shows none of it.

### Progression feels bad (always the same, unclear goals, slow, no sense of growth, arbitrary unlocks)

**(c) Events in the first three game months, and how varied they were:**

| Kind | Count | Examples |
| --- | --- | --- |
| Weather lines | 44 of 137 log entries | "Scattered cloud. Wind 211° 14 kt." |
| Build progress | 32 | "planned", "complete", "out of concrete" |
| Goals ticked | 13 | – |
| Aviation | 16 | 5 diversions (all ILS or weather), 2 offers, 1 request for "another narrow-body jet", 3 landside openings |
| Airspace | 9 | mostly loss of spacing, including foreign overflights |
| Visitor | 4 | head of state, vintage airliner |
| Air (military helicopters grounded) | 7 | – |
| Month statements | 3 | all negative |

Only the visitors felt like *events*. There was:
- no airline arriving with a story;
- no record day;
- no "first jet bridge", "100,000th passenger" or "city asks for a route";
- no incident on the ground that the player could fix with what they had just built.

**Goals and unlocks:**
- Chapter 2's goals were either already done or waits.
- The Career room's Act I unlocks are rooms and delegates. Its Acts II–IV unlocks are military names (`96-career-room.jpg`).
- No airport-building unlock is visible in Act I (jet bridges, hydrant fuel and CAT III are behind research, which I never saw offered).
- Growth is invisible: the treasury fell from ₭5.5B to ₭4.0B, and passengers per hour swung between 0 and 593.

### Clarity (moments I did not know what to do or why something happened)

- Which button to use: the goal says Aviation (V) → "Found a new airport"; Build (top right) also works. That is fine, but it is two routes.
- Where 15–40 km is, and where the wind comes from, while founding.
- Why ₭140M left the treasury instead of ₭92M.
- Where the surveyed runway went.
- Why the build bar became "Select an airport" (I had closed the inspector).
- Why the taxiway I ordered was not drawn.
- **Why the first airliners never landed** (ILS in snow). This was the worst moment.
- Why 5 opened a build tab instead of setting 16×.
- Why "Sign a deal" was unticked with three contracts running (the first three came with "Open for business" and do not count).
- Whether money was growing ("+₭0.3M an hour" or "−₭16M yesterday").
- Why Wait would not wait.
- What "command point", "Tension" and "Doctrine" mean.
- Whether the fire station between two runways is a problem (the game never said).

## 6. Features I would hide for now (hide, not delete)

| Hide | Why |
| --- | --- |
| Career room's Acts II–IV list, Command points, Doctrine, Tension, Requests | Military vocabulary in a civil act; promises nothing about airports. Show it when Act II starts. |
| Col. Dana Reyes / "helicopters grounded" messages, the locked AIR and INTEL buttons | Not the player's business in Act I; noise. |
| Airspace incidents between flights the player cannot help (foreign overflights; loss of spacing before radar is available) | They interrupt Wait and teach nothing until Chapter 3. Keep them as quiet log lines. |
| Open / Restricted / Closed airspace toggle (top right) | Never explained; nothing in Act I needs it. |
| Inspector tabs Airspace and Operations on the airport | Duplicates the Aviation room; Airspace is Chapter 3. |
| Build bar: Looks & paint, Blueprints (until it has templates), Holding bay, Rapid exits, De-icing pad, Fuel stand, Ground radar, Approach radar, six of the eight terminal shapes (keep Terminal and Concourse), Open ramp, Stand, Stretch apron | Fewer, bigger choices; unlock them as chapters ask for them. |
| Pavement, width, lights, zone and stand-size toggles | Default them from the airport's size, and put them behind "Advanced". |
| Weather log lines | One weather line a day, and the weather on the map. |
| Delegates (Route Planning Office, Chief Engineer) in Act I | Automation before the player has learned the manual way. |
| Traffic, Weather and Labels toggles and the minimap while building | Screen space. |

## 7. A proposed definition of "really good" for the Career opening

Each moment is checkable by a playtest like this one.

1. **Within 2 minutes of starting, the player has founded the airport.** They knew where to click, because the map showed the 15–40 km band from Velova and the prevailing wind, and the survey's runway stayed on the map as a placed plan.
2. **Within 5 minutes and 25 clicks,** a complete starter airport is ordered (runway, taxiway, apron, terminal, tower, fire, fuel), for example from one template dropped on the survey. One total price is shown before committing, and nothing is charged that was not shown.
3. **Everything ordered is visible on the map at once** as a plan, and every part goes through visible stages. The player never wonders "did that work?".
4. **No rule punishes the player before the game has told them about it.** If winter needs an ILS, the "Open for business" checklist says so before the first flight. Every diversion, cancellation and penalty appears as a card or map marker with the cause and the fix.
5. **The first landing is an event.** The camera goes to the runway, time drops to 1×, and the player watches the aircraft touch down, taxi in and park. A card follows with the first passengers and the first fee.
6. **Within 15 minutes, money visibly comes in** from what was built: a line per flight or per day on the map or in the top bar. The treasury rises over a good month, and the month statement says why.
7. **At stand zoom, a turnaround is alive:** stairs or a jet bridge, a bus or walking passengers, a fuel truck, baggage carts and a pushback tug, all in the 2D map.
8. **Every chapter has at least one thing to build that the player has not built before,** and a visible reason to build it, for example an airline offer whose ✗ line it fixes. No chapter opens with its goals already done, and no goal is only "wait N months".
9. **Something new happens at least every 2 real minutes of play** at the default speed or Wait: an offer, a visitor, a record, a request from a city, an incident the player can fix. No more than one interruption in five is weather.
10. **Wait always reaches the next meaningful event.** It is never stopped twice by the same thing, and never by something the player cannot act on yet.
11. **After 30 minutes the player has an airport worth a screenshot:** two runways, a terminal with a pier and jet bridges, a busy apron, a landside with traffic. At least 10 aircraft movements an hour are visible at the airport zoom.
12. **No military word appears before Act II,** and the screen while building leaves at least 60% of the map clear.

## Appendix: method

- The page was served by `python3 -m http.server` from the repo root and driven by Playwright (preinstalled Chromium) through a small HTTP driver. Every action was a real `page.mouse` or `page.keyboard` event, apart from the reads named above and the `S.paused` reset in the 32× timing loop.
- I timed frames with `requestAnimationFrame` in the page.
- No game code was changed.
