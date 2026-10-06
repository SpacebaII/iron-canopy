# Round 4: progression and events

Branch `focus/round-4`, on `focus/round-3` with `main` (round 3, PR #54) merged in. This round covers checklist items 1, 8, 9 and 10 of `docs/focus/plan.md`.

All of it sits behind one new switch, `IC.FOCUS.progress` (core.js), and applies to the Career started from founding (`S.story.fresh`). With the switch off, the Career plays as round 3 left it. Nothing was deleted.

## How it was measured

`tools/round4-play.js` plays a fresh Career from the start screen in headless Chromium at 1440 × 900, for 32 minutes of real time. It plays as a steady player would:
- It founds the airport, orders the Starter and uses Finish now.
- It watches at 32×, and uses Wait when there has been nothing to do for 25 s.
- It answers every card with its first choice, as the scripted Career player does. For the airspace card it hires the consultants.
- It signs what the airport can carry.
- It builds what the markers and the goal line ask for, using the game's own fix (`IC.fixOpen`), and the piece each milestone opens.

The tool records every goal, event and treasury figure against real time, and writes `docs/focus/round-4/pacing.json`. `--before` runs the same player with `IC.FOCUS.progress` false and writes `before-pacing.json`. Screenshots are in `docs/focus/round-4/` (`before-*` for the run with round 4 off).

A headless probe of the same path gave the same picture at 32×, over 220 game hours.

## Pacing, before and after (32 minutes of real play)

| | Before (round 3) | After |
| --- | --- | --- |
| Goals done | 19: 10 in the first 2 minutes (3 of them already done when Chapter 2 opened), then 6 by minute 5, then **none from 5.3 to 19.5 min** | 14: 7 before the first landing, then 7 more between minutes 1.5 and 4.3, one every 30–60 s, **none already done** at a chapter's opening |
| Longest wait for a goal | 14.2 min. The Chapter 2 goal left on screen was "See a deal through to its end with no bad days" (`before-02-money.jpg`) | 27.8 min, in Chapter 3: the tool does not draw airways (see "What is left") |
| Events | 27, of 4 kinds: 13 offers, 11 visitors, 2 chapters, 1 decision | 42, of 13 kinds: 20 offers, 9 deck cards (all different), 8 visitors, 3 milestones, 2 chapters |
| Longest time with nothing new | 4.2 min | **2.3 min** |
| Weather | 149 weather changes; log lines held to one a day by round 3 | 84 weather changes; 1 weather card in 9 (the storm front) |
| Treasury, minutes 1 → 15 → 21 | ₭4,269M → ₭4,138M → ₭4,315M | ₭4,256M → ₭4,026M → ₭4,429M |
| Treasury at 31.6 min | −₭2,429M: from minute 23 the tool's own radar rule placed a civil radar every 20 s, a bug in the tool and not in the game | **₭5,167M**, rising since minute 12 (+₭1,140M in 20 minutes) |
| Top bar | "+₭60M this month", or red during building | "Running +₭299M · Invested ₭61M" (`06-end.jpg`) |

Deck cards came at minutes 3.0, 7.2, 11.4, 14.4, 18.0, 21.3, 24.6 and 29.0: one every 3–4.5 minutes of play. The other events filled the gaps between them.

The order in the after run was:
1. a celebrity's jet;
2. a lost passenger;
3. a fuel shortage;
4. a storm front;
5. a state visit;
6. a film crew;
7. a pay claim;
8. the regulator's inspection.

The test *the deck paces by the player* holds the same rules headless over four game days at 32×:
- a card at least every 6 minutes of play;
- no two weather cards in any five;
- at Wait's 432×, cards come by real minutes, not by game months.

## What changed

### 1. One clear thread of goals (`story.js`, `ui.js`)

- **Every goal says what it gives**, in green after it on the Next goal line. Examples: "→ +₭30M from the Ministry", "→ opens the Terminal with a pier", "→ keeps its first deal", "→ Chapter 3: the airspace" (`01-next-goal.jpg`, `04-milestone.jpg`).
  - Rewards are paid as the goal is done and booked as "Ministry rewards for goals" (`g.pay`, `g.conf`).
- **Chapters open on their goals.** No chapter waits months any more (`CH_FOCUS` / `IC.storyChMin`).
  - Each needs all its goals, or all but one where one can be out of reach for a while.
  - The month fallbacks stay as a safety net.
  - Only the last chapter keeps 6 months before the story's turn to Act II.
  - "Something new comes in about 8 months" is gone. The line now says what to do: "2 more goals open the next chapter", or "carry 2,500 passengers a day (1,900 now) and the regions will ask".
- **Chapter 2 rewritten**, so the Starter ticks none of it. Its goals, in order:
  1. a hangar for the flag carrier;
  2. sign a new deal;
  3. 2,000 passengers a day;
  4. six more stands;
  5. three new deals;
  6. three airlines at 65%;
  7. 6,000 passengers a day;
  8. six deals running.

  "See a deal through to its end" (9–18 months) is gone.
- **Other chapters.**
  - Chapter 3's "Twelve hours without a loss of separation" is now "Build an approach radar".
  - Chapter 6's "Raise the airport's name to 70" (which waited on deals ending) is now "Carry 15,000 passengers in a day".
- **A goal already met when its chapter opens** is ticked there and then, with a log line "Already done: …" and its reward. It is never found ticked afterwards.
- **The scripted Career player** (careerplayer.js) plays at 32×. Its Act I test now asks for at least 12 months (`IC.ACT1_MIN_MO_F`) instead of 36. It passes, and the chapters still open in order.

### 2. Money that feels like growth (`problems.js`, `growth.js`, `builder.js`, `aviation.js`)

- **Running apart from invested.** Building paid stage by stage is booked per airport (`IC.investBook`). The money line then says:
  - in the top bar: "Running +₭42M · Invested ₭1,077M", with running in green when it is positive and the investment in grey;
  - in the Economy room: "running the airports made ₭299M (₭522M came in…; ₭222M went out on running costs), and ₭61M was invested in building at Galsk";
  - when the month closes: "January closed: running the airports +₭223M; ₭1,529M invested in building" (`08-economy.jpg`).
- **Rebalance.** A well-built Starter already ran at a profit; what hid it was building and too few flights. Now:
  - the Ministry rewards goals (₭30–80M each);
  - offers come every 0.25–0.5 months instead of 1–2 (`IC.DEAL.offerMoF`);
  - contracts run 4–8 months instead of 9–18 (`monthsF`), so a deal is signed, flown and renewed within the first hour.

  Upkeep (0.12% an hour) is unchanged. Headless:
  - January, with ₭1,529M of building: running +₭223M (before: +₭59M);
  - March: +₭289M (before: +₭116M).

  In the page, the treasury rose from minute 12.
- **The hangar trap.** The founding deals now give a month (3 live days) to build what they need, not one day (`IC.DEAL.foundGraceMo`).
  - From the first minute, the apron shows an amber marker: "Selvara Airways needs hangar space … Its deal gives you 3 days to build it (by February, Year 1); after that it warns once, then walks out", with "Build a hangar ▸".
  - The hangar is also Chapter 2's first goal.
  - I chose this over putting a hangar in the Starter. The Starter would then tick the goal in advance, and the player would never learn that airlines base aircraft and need a hangar. The rule is now taught before it punishes. One click builds it.

### 3. Growth milestones (`deck.js`)

- **The milestones** are 2,000, 6,000, 15,000 and 50,000 passengers a day (`IC.MILESTONES`). Each is a short "moment" card, placed beside the airport, not over it.
- **Each card says what the airport has outgrown, from its own numbers**, and opens the piece that answers it:
  - 2,000: "At 15:00, its busiest hour, 3 of Jormar's 8 stands were taken and 8 of them have a gate. A pier reaches out from the terminal with gates on both sides… The Terminal with a pier is open under Airport pieces." Then "Place a pier" (`04-milestone.jpg`).
  - 6,000: a second runway, from the runway's movements an hour.
  - 15,000: the round terminal, from the terminals' busiest hour against what they are built for.
  - 50,000: "a hub", with ₭200M and the Minister's confidence +5.
- **Every lock says what opens it**, in one line.
  - A locked piece shows "🔒 2k passengers a day" on its card. Its tooltip, and the toast if picked, reads "Opens at 2,000 passengers a day (1,240 now), when one row of gates is no longer enough" (`IC.pieceLock`).
  - The second runway: "A second runway opens at 6,000 passengers a day (… now): until then one runway carries every flight." The first runway is never locked.
  - Story locks (`IC.storyLock`): "The airway editor: opens with Chapter 3 (the airspace), after 2 more goals here (next: Sign three new deals)."
  - The single parts under Detail stay open, as before.

### 4. A peacetime event deck of 25 cards (`deck.js`)

The cards are event cards like the story's own (`IC.EV`): made by name, saved and loaded with their choices. The play clock decides when the next one comes (`S.story.play`, `IC.playRate`):
- a card every 2.5–4.5 minutes of real play;
- never sooner than 4 game hours after the last;
- not one of the last 8 cards, and unseen cards first;
- weather at most one card in five;
- only after the first landing, and only in Act I of a Career started from founding.

Each card is tied to the player's airport and placed beside it. The first choice is the careful one, which an unanswered card takes after three hours.

| Card | Choice | Shows on the map or in money |
| --- | --- | --- |
| A state visit | Close the runway for an hour / fit them in | Runway closed (alert), the head of state's jet lands; ₭15M, Minister ±. |
| A storm front (weather) | Close 3 h / crews decide | The storm comes; runway closed or a crash risk |
| Fog tomorrow (weather) | With an ILS: tell airlines / hold the first wave. Without: move flights / fly as planned | The fog comes; aircraft held on stands, or diversions |
| Snow tonight (winter, weather) | Plough ₭6M / close 4 h | The snow comes; runway closed or ₭6M |
| Cabin crew strike | Mediate ₭20M (3 h) / stay out (12 h) | The airline's aircraft stay on their stands |
| A new airline wants slots | Invite an offer / say full | Its offer marker at the terminal; or name −2 |
| A record day | Staff bonus ₭10M / press release | ₭10M, airlines +3; or Minister +3 |
| The holiday rush | More flights / holiday surcharge | An offer at the terminal; or ₭ now, airlines −4 |
| The regulator's inspection | Now / in a month | Judged on the real airport (fire cover to each runway end, ILS, wear, fuel): name +4 or a ₭15M fine; postponed, it comes back |
| Bird strike | Bird-control team ₭12M + ₭0.1M/h / cut the grass ₭2M | Bird strikes here a quarter as likely (groundops); running costs |
| An airshow | Host it / decline | Runway closed 3 h, the display team flies in, ₭40M, town morale +6 |
| A celebrity's jet | Private stand ₭8M / no | A long-range business jet lands and parks |
| A diversion | Clear it in / send it on | A twin-aisle jet lands on a large stand, ₭6M; Minister ±. |
| A lost passenger | Hold the flight / let it go | That aircraft leaves 25 min late |
| A fuel shortage | Buy abroad ₭25M / ration | Aircraft on stands wait 40 min more |
| A power cut | Generators ₭6M / wait for the grid | Aircraft on stands wait 2 h |
| A film crew | Let them film ₭15M / no | One stand closed for the night |
| A medical flight | Priority / the queue | Departures wait 15 min; Minister ±. |
| A charter wave | Take them / not this season | A 2-aircraft offer at the terminal |
| Noise at night | Insulation ₭30M / night curfew / nothing | Curfew: nothing flies 23:00–06:00 (`ap.curfew`); town morale ± |
| A pay claim | Pay ₭0.2M an hour / refuse | Running costs; or slower turnarounds |
| A drone near the runway | Stop landings 20 min / keep landing | Runway closed |
| An open day | Open the gates ₭3M / not now | Town morale +4, Minister +2 |
| A vintage airliner (the existing visitor, as a card) | Welcome it ₭2M / no | It lands and parks; town morale +3 |
| Plane spotters | Viewing area ₭4M / move them on | Town morale ± |

The existing rare visitors (IC.RARE) still come by themselves and count as events.

## The checklist

| # | Item | Met? | Evidence |
| --- | --- | --- | --- |
| 1 | Within 2 minutes they know what they are building first, where and why | **Met** (as round 1 left it, now with what each step gives) | `01-next-goal.jpg`: one Next goal line, with "→ Chapter 2: airlines and deals" and the hangar marker with its fix |
| 8 | They always know the next goal and what it gives, in one line; goals every few minutes, not months | **Met for Chapters 1–2, not proven for Chapter 3 onward** | After: 7 goals in minutes 1.5–4.3, none already done, each with "→ …". The test *no Act I chapter opens with goals already done, no goal is only waiting, and each says what it gives* checks every chapter's goals for words of waiting, and the chapter line for "in about". Chapter 3 took the tool 28 minutes because it does not draw airways; a player who draws them meets each goal in a few minutes. |
| 9 | Something different happens at least every 5 minutes | **Met** | Longest gap 2.3 min; 13 kinds of event in 32 minutes against 4; deck cards every 3–4.5 min (`03-decision.jpg`). Weather was 1 card in 9. |
| 10 | Growth is felt within the first hour: one runway to a busy hub, bigger pieces opening because the airport needs them, and the game says why | **Met** | 2,000, 6,000 and 15,000 passengers a day at minutes 1.5, 3.5 and 9.4; the pier and round terminal built from their milestone cards (`04-milestone.jpg`, `05-later.jpg`); the treasury rising from minute 12 to ₭5,167M; 17 deals running at the end (`06-end.jpg`). The test *milestones open the bigger pieces…* checks the locks and the cards. |

## Tests

New in `tests/run.js` (section "round 4"), with their times in `tests/times.json`:
1. *no Act I chapter opens with goals already done, no goal is only waiting, and each says what it gives*;
2. *a deal that needs a hangar says so up front and gives a month to build it*;
3. *milestones open the bigger pieces because the airport needs them, and every lock says what opens it*;
4. *the event deck has 20 or more cards, each with a choice that changes something, and each saves and loads* (all 25 cards dealt, saved, loaded, and each card's first choice changes something on the loaded game);
5. *the deck paces by the player: a card every few minutes of play, weather at most one in five*;
6. *a well-built Starter airport runs at a profit from its first month, and building shows as invested* (built with real stage payments: first month running > 0 with over ₭900M invested; the treasury rises over the next 36 hours).

Changed to follow the new rules:
- *deals: a broken deal…*: the month's grace;
- *round 3: a deal short of a hangar…*: the amber up-front marker;
- *round 3: the money line…*: the split line;
- *calendar: … a deal's length*: 4-month contracts;
- the scripted Act I run: `IC.storyChMin`, at least 12 months.

`npm test`: **284 passed, 0 failed** (the coordinator's run on the branch head; my 2-worker run had 3 failures from tests changed after it started, each green alone). The scripted Career through Act I (`--slow`) passes. The eight Academy lessons and the save tests are among the 284.

The step gains a play-clock addition each step, and a deck and milestone check every 30 game seconds.

## What is left

- **Chapter 3 onward is not measured in the page.** The playthrough tool hires the consultants but does not draw airways, so it sat on "Place three entry points" for 28 minutes. Round 5's fresh-eyes playthrough should time those chapters with a human-like path.
- **The scripted player grows fast.** It signs everything at once, reaching 15,000 passengers a day at minute 9. A human will be slower; the milestone numbers may want raising after the owner plays.
- **The deck runs only in Act I** of a Career from founding. Acts II–III keep their own incidents. Extending the deck there needs a check of the balance runs.
- **Before-run treasury after minute 23.** It fell because of a bug in the tool's radar rule, not the game; the numbers in the table stop at minute 21 for that reason.
- **Weather is still 84 changes** in 32 minutes. Round 3 already held its log lines to one a day; only the storm, fog and snow cards interrupt.
- **Offers are many.** About 20 in 30 minutes, some the same airline again after an offer lapsed. A cap per airline could make each one weigh more.

## Decisions for the owner

1. **The hangar trap:** a month's grace with the need shown up front, and the hangar as the first goal, rather than a hangar in the Starter. Keep it?
2. **Pieces locked by milestones:** the pier at 2,000 a day, a second runway at 6,000, the round terminal at 15,000. The same parts stay open one by one under Detail. Is a bypass through Detail acceptable, or should Detail lock too?
3. **Act I in calendar time:** the scripted player now takes at least a year instead of three or more. The calendar still turns, but the chapters no longer wait. Is a shorter Act I in years fine for the Career's ten-year arc?
4. **Ministry rewards for goals** (₭30–80M each, ₭200M at 50,000 a day) are part of what makes the money feel like growth. Keep them, or move the money into fees?
5. **Unanswered cards:** the deck's cards pause the game like the story's decision cards (round 3's setting). With one every 3–4 minutes, a "don't pause for deck cards" option might be wanted.
