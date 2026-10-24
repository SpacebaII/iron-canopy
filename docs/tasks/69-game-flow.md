# 69 The Director's desk: a Career that plays like a game, not a checklist

Wave 18, with 70 (the story, the Story and narrative thread). Stacked on 49 (the Ministry agenda, PR #66) and 48 (research, PR #65), with `main` merged in. Career only: the Quick war stays as it is.

Owns a new `desk.js` (headless: the mandate, the pressures, the reviews, dismissal), the goal and chapter mechanics in `story.js` (`goalsFor`, `chapterGoals`, `startChapter`, `chapterTick`, `goalPaid`, `confidence`, `actOneTick`, `IC.storyChapterInfo`, `IC.storyShown`, `IC.storyTip`, `IC.guideFor`, `IC.storyDismissal`, `IC.CHAPTERS`, and the goal lines in `IC.storyTick`), the goals panel in `ui.js` (it becomes the desk), and the scripted player's answers to pressures in `careerplayer.js`. Brief 70 owns the rest of `story.js`, `deck.js`, `chains.js`, the cast (`IC.CAST`) and the cutscenes.

## What the owner said

> "it still feels like a tech demo … we look pretty good visually but the actual game play isn't good … this needs to feel a lot less … like do this do that and not an actual game."

> "So this is going to be a story game so the quick war likely can just be pushed aside, focus on the career piece first."

And for the story (brief 70): the Director mostly witnesses a grounded political drama; choices are occasional and weighty. So the play itself has to come from the job.

## Where it stands (balance run, `storytest.js 12345`, on this branch's base)

1. **The goals list is the game.** Each chapter is a list: "Build a runway at least 2.1 km long", "Build a fire station near the runway, and a fuel farm", "Carry 2,000 passengers in a day", "Sign three new deals". The game opens on a checkbox labelled "Next goal". The player is told what to build, then builds it.
2. **Nothing is at stake.** Before Act III the Minister's confidence cannot fall below 5 and only trims the grant. In the run it sat at 76–93 all year. The treasury fell from ₭5,500M to about ₭2,500M and stayed there. Nothing the player fails at costs more than a log line.
3. **The pace collapses, then stalls.** With round 4's flow the scripted player finished all six of Act I's chapters in 1.2 months. Act II then cannot start for at least 11 more months, and what fills them is a stream of one-off cards (32 decisions by July), most of them "pay ₭X, or lose a little".
4. **The airport's problems have no voice.** `problems.js` already finds what is going wrong (aircraft waiting for a stand, a full terminal, no fuel, no landing system, a deal at risk) and offers the one-click fix. But nobody cares if you leave them: they are markers, not stakes.
5. **No payoff.** A goal ticks with a log line. There is no review, no grade, no moment where the game tells you how you are doing.

## Goal

Replace "do this" with "this is going wrong, and it matters": a desk with the Minister's mandate and a few live problems at a time, each from a person, with a deadline, a price for ignoring it and more than one answer. The Minister judges outcomes every quarter. You can be sacked.

### 1. The mandate (one per chapter)

The Minister's aim for the chapter, as an outcome with a date, not a build list.
- Chapter 1: "Open the national airport to jets by April, Year 1." Chapter 2: "Make it the region's airport: 6,000 passengers a day and airlines that are content." Chapter 3: "A sky with a plan: airways, entry points and radar, and no near misses for a season." And so on for each chapter, from its old goals' intent.
- The old goals stay as the mandate's **How?**: steps a new player can open, with the tutorials' Show me. They no longer tick, gate or pay.
- The chapter turns when the mandate is met and its minimum months have passed (the same `fmin`, so `IC.ACT1_MIN_MO_F` holds). Missing the date is not fatal: the Minister's confidence takes a hit (−8) and a new date is set, once; a second miss costs −15.
- What a goal's `gives` used to open (milestone pieces, Ministry money) moves to the mandate or to the pressures that need it.

### 2. Pressures (two or three at a time)

Live problems the country throws at the Director, found in the simulation, not scripted in order. Each is `{ id, kind, who (an IC.CAST key), at (a place on the map), title, text, due, stake, check, prog, answers }`.
- **From the airport** (built on `IC.aptProblems` and the airline scores): an airline threatens to move its based aircraft unless its waits for a stand fall within a month; the terminal is turning passengers away; a winter forecast with no landing system on the runway arrivals use; the fuel trucks cannot keep up; a deal at risk.
- **From the airspace**: the regulator after a cluster of losses of separation ("three in a week: show me a plan within two months or I close the approach at night"); a sector overloaded for days; light aircraft straying into the control zone.
- **From the country**: a city that wants flights (`IC.cityAsks`), a council's noise complaint about a runway over its homes, a flying club that lost its strip (the old contract), the Treasury after two months in the red.
- **Answers**: every pressure has a fix (the one-click fix where `problems.js` has one, or a goal-like condition), and most have a second way out at a price: pay compensation, accept a curfew, give the airline a discount, refuse and take the hit. The price is said before you choose.
- **Stakes**, said up front and carried out by the simulation: an airline leaves or cuts a route, the Minister's confidence (−4 to −12), a city's growth for a year, a fine, the regulator's night curfew. Solved: confidence (+2 to +6), the person's trust (`IC.castTrust`), sometimes money.
- **Pace**: at most three open; a new one only when one closes or after a quiet spell. Pressures are paced on the play clock (`S.story.play`, as the deck is), so Wait cannot skip past them, and Wait stops when a deadline is close.
- On the map: each pressure is a pin at its place, in the same style as the problems' markers, with its deadline.
- `IC.emit(S, 'pressure', { id, kind, outcome })` when one is solved, answered another way, or failed: brief 70 sets story flags from it.

### 3. The quarterly review

Every three months the Minister judges four things against expectations that rise with the act and the chapter:
- **Passengers**: growth against the cities' demand.
- **Reliability**: flights on time, diversions, cancellations.
- **Safety**: losses of separation, accidents, runway incursions.
- **Money**: the quarter's net against the plan.

Each gets a grade (A to E) and a sentence that says why, from the numbers. The review moves confidence (about +8 for straight A's to −12 for E's) and is a card the player reads, with a cutscene hook (`IC.cutscene(S, 'review', { good })`) for a very good or very bad one. The yearly review (`IC.yearReview`) stays as the year's long view.

### 4. Losing

- Confidence keeps its meaning before Act III: no floor. Below 30 the Minister warns; below 15 the grant is cut and the Minister says so.
- At zero for a full month of the calendar the Director is replaced: game over, with the 'sacked' cutscene and a short account of what went wrong (the failed pressures and the last reviews).
- Warnings come in time: the desk shows the confidence trend and what moved it last.

### 5. Payoff moments

- The first airliner lands: the camera goes there, time slows to 1×, then `IC.cutscene(S, 'firstLanding')`.
- A mandate met: a card that names what the player achieved, in their own numbers.
- A pressure solved: a short line from the person who asked, in their voice.
- A fatal accident: `IC.cutscene(S, 'crash', { ap, cause })`.

## What stays

The research tree (48), the agenda (49), the deck of peacetime cards and the milestones (round 4), the deals, building, the tutorials. Acts II and III keep their goals as the How? steps under one mandate each (`IC.MANDATES_ACT`: the border watched in Act II, the capital and the air base hard targets in Act III); it judges the act (met or missed goes on the record) but the story's beats still turn it. Act IV keeps its goal.

Added after the first push: a city beyond every airport's reach writes after Act I (`city`), and incidents on an airfield (the `aptIncident` event from airport operations, PR #96, once it lands) bring the insurers (`incidents`). The council's noise complaint is the deck's `noise` card already, so it is not a pressure.

## Tests

- A new Career shows the mandate and no checklist; the How? steps are there and the tutorial's Show me still works.
- A pressure appears from a real problem (an airline whose aircraft wait for stands), shows on the map, and is solved by the fix; ignored, its stake happens (the airline cuts a route, confidence falls).
- A pressure's paid answer costs what it said and closes it.
- Wait stops before a pressure's deadline.
- The quarterly review grades a good airport better than a neglected one.
- A Career left alone loses confidence and the Director is replaced; the scripted player is never replaced.
- The scripted player finishes Act I in no fewer than `IC.ACT1_MIN_MO_F` months; save and load keep pressures and the mandate.
- The eight Academy lessons still pass.
