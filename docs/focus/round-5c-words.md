# Round 5c: the words, before and after

The rule for this pass: write like an experienced airport manager talking to a colleague. Be specific, short and dry, with real units. Say what happened and what to do about it. One word for one thing.

These are the 40 most telling changes. The whole diff is on `focus/round-5c`.

`tools/textlint.js` now flags these, and a test proves the rule is live and the source clean (`BANNED`):
- cheerleading: "Let's", "Great job", "Well done", "Congratulations";
- brochure words: "seamless", "robust", "leverage", "delve", "game-changer", "cutting-edge", "state-of-the-art", "exciting";
- padding: "simply", "feel free", "don't worry".

The survey of the civil act's 2,110 strings found few of these. Rounds 1–5b had already cut most of them. What remained were:
- answers that said nothing;
- directions that pointed at the wrong place since the build bar came in;
- one name said twice;
- numbers that read wrong.

## The answers on decision cards

Four cards ended in the same "Nothing happens." Each now says what the refusal costs or keeps.

| # | Before | After |
| --- | --- | --- |
| 1 | A film crew · "No: the apron is for aircraft" → *Nothing happens.* | → *They shoot it at an airfield abroad. The stand stays ours.* |
| 2 | A charter wave · "Not this season" → *Nothing happens.* | → *The charters go from a neighbour's airport, and their fees with them.* |
| 3 | An open day · "Not while we are this busy" → *Nothing happens.* | → *The teachers are disappointed. The day runs as planned.* |
| 4 | A vintage airliner · "No room this week" → *Nothing happens.* | → *It lands somewhere else on its tour.* |
| 5 | Card title: *An airshow?* | *An airshow request* |

## Directions that pointed at the wrong place

| # | Before | After |
| --- | --- | --- |
| 6 | Chapter 1's How: *Open the Aviation room (V) and press "Found a new airport".* | *Press Build (B), then Found an airport.* |
| 7 | Chapter 5's How: *Aviation room → Found a new airport, near Talford.* | *Build bar (B) → Found an airport, near Talford.* |
| 8 | Minister, nothing founded: *There is not even a site yet. Aviation room, Found a new airport.* | *There is not even a site yet. Build bar (B), Found an airport.* |
| 9 | After founding: *The airport is selected, and its build bar is open along the bottom of the screen: pick Runway under Runways.* | *Now the runway itself: the surveyed one is placed on the map, and Build lays it. Blueprints has the whole Starter airport at one price.* |
| 10 | A new airline: *Their offer is in the Aviation room, with what they need from us.* | *Their offer is on the map at the airport, with what they need from us.* |
| 11 | Treasury, airport unopened: *What is it waiting for? (The goals panel says what is missing.)* | *The goals panel says what it still lacks.* |

## One name, said once

| # | Before | After |
| --- | --- | --- |
| 12 | Message line: *Lena Okafor · Lena Okafor, airports. I will walk you through…* | *Lena Okafor · I will be at your elbow for the first one: each step shows where it happens, and Skip puts any of them away.* The introduction is cut wherever the line already shows who speaks; the Journal keeps the whole sentence. |
| 13 | *Ivo Marsh · Ivo Marsh, air traffic control. For now my people…* | *Ivo Marsh · For now my people…* |
| 14 | *Karl Ostrow · Karl Ostrow, Finance. The national airport has cost…* | *Karl Ostrow · The national airport has cost…* |

## Numbers that read wrong

| # | Before | After |
| --- | --- | --- |
| 15 | Aircraft panel: *Passengers getting off: 42 min left* (the whole turnaround's time, shown against a 10-minute stage) | *Turnaround: 42 min left · now: passengers getting off (9 min)* |
| 16 | On the map: *STAND 0: PASSENGERS GETTING OFF · 43 MIN LEFT* | *STAND 1 · 43 MIN LEFT · NOW: PASSENGERS GETTING OFF* |
| 17 | *Stand 0* (each apron counted from 0, so two stands could share a number) | *Stand 1* … numbered once across the airport |
| 18 | Day board, night quota: *About 1 movements a night* | *About 1 movement a night* |
| 19 | Build button: *Build · ₭1,077M* (no time for a piece or a blueprint) | *Build · ₭1,077M · 4.9 h* |
| 20 | Goal: *Put up a civil radar that sees 80% of the airways* (one radar never can) | *Put up civil radar that sees 80% of the airways* |
| 21 | Goal progress: *31% of the airways seen at cruise height* | *31% of the airways seen at cruise height · about 2 more radars* |

## Chapter 3's radar, where both playthroughs stalled

| # | Before | After |
| --- | --- | --- |
| 22 | How: *Pick the Secondary Surveillance Radar (bottom left) and place it between the airways, on open high ground if you can: it sees 400 km at cruise height, less behind hills. Amber stretches of airway are ones it cannot see.* | *Pick the Secondary Surveillance Radar (bottom left). About 2 more beacon radars, each on the middle of a gap and at least 150 km from the next: one sees about 400 km of airway at cruise height. The biggest gap is 954 km; the marker on the map shows its middle. The tag by the cursor says what each spot adds.* |
| 23 | (nothing by the cursor) | *+22% of the airways seen · 31% now, 53% with it* |
| 24 | (nothing) | *2 radars on this band within 70 km: +₭14M a month to keep* |
| 25 | (nothing on the map) | Marker: *954 km of airway no radar sees* · *Place a radar here ▸* |

## Click-through tips that now wait for the player

The old first-minutes tour had four notes, each with "Got it". Interactive tutorials replace it (`IC.FOCUS.tutors`); a few of the notes:

| # | Before (a note with Got it) | After (a ring on the real thing; moves on when you do it) |
| --- | --- | --- |
| 26 | *Your goals: This act's goals, with how far along each one is. Click a goal to see where it is on the map.* | *The next goal: One goal at a time, with what it pays in green. Click it and the map shows where.* (moves on when the goal is clicked) |
| 27 | *Time: The game runs at 1×: ten game seconds a second. Space pauses, 1–6 set the speed, S skips ahead until something needs you.* | *Time: Building takes game hours. Keys 1–6 set the speed and Space pauses. Try 4×.* (moves on when the speed changes) |
| 28 | *The rooms: Rooms for everything that does not fit on the map. Aviation holds the airlines' deals. Keys are on each button.* | *The build bar: Everything is built from the bar along the bottom. Press Build, or B.* |
| 29 | Goal tip, shown for 30 s with *Got it* | *Show me* (runs the goal's tutorial) and *How?* (the words, on demand); the button that folds it says *Fold ▴* |
| 30 | Settings: *Show hints for new players* | *Show each feature the first time I meet it* |
| 31 | Settings: *Hints point at a part of the screen the first time it matters. Each shows once; Got it puts it away.* | *A tutorial rings what to do and waits until you have done it. Skip puts it away; Show me in the Guide plays it again.* |
| 32 | *Show every hint again* | *Show every tutorial again* (it also resets the tutorials) |

## Smaller things

| # | Before | After |
| --- | --- | --- |
| 33 | Minister: *A country with more than one airport worth the name: well done.* | *A country with two airports worth the name. The regions noticed.* |
| 34 | Stretch apron: *the new paving joins it seamlessly.* | *the new paving joins it as one slab.* |
| 35 | Deals Guide: *Ask for more and the contract is shorter; give a little and it is longer.* ("contract" is the Ministry's word; airlines sign deals) | *Ask for more and the deal is shorter; give a little and it runs longer.* |
| 36 | Charges Guide: *Ask for higher charges and the contract is shorter* | *…and the deal is shorter* |
| 37 | *The tank farm is empty or destroyed.* (the game says fuel farm everywhere else) | *The fuel farm is empty or wrecked.* |
| 38 | Build bar caption over the plan: *Starter airport placed. R turns it. Build (or Enter) builds it; a click elsewhere mov…* (cut off, and repeated in the strip beside it) | One strip: *Placed · Build or Enter builds it · a click elsewhere moves it · R turns it · Esc drops it* |
| 39 | Chain, busiest route: *✈ Draeth* | *✈ Draeth · busiest: 3 aircraft on it* |
| 40 | Guide, new lessons: (none for following an aircraft, milestones or decision cards) | *Watching an aircraft*, *Milestones* and *Decisions*, each with Show me |
