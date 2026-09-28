# 32 Years, not days: a calendar by months, and time to breathe

Wave 9. Builds on 24 (the Career's economy and pace), 06 (save and load) and 29 (engine health, for the speed). Runs before 25–28, which are rewritten on top of it.

## What the owner said

> "It's not realistic to get all of these done in that short of time. We should 100% draw this out, and likely game time should traverse multiple years."

> "Construction should not take forever. The way it is, is fast and I like that. It can be made longer a little bit through more animations and stages. The key is making sure we keep everything engaging whilst allowing time for the player to sit, and after a task, like 'hey, I did that, let's let revenue flow back in'. It does not have to be go-go-go the entire time, but the player's actions should be meaningful: waiting to afford an expansion, not so much waiting to wait (although that is okay sometimes). Likely this will span over years, like 10+ minimum. We could do it by months: a calendar that goes by month, with a day and night that is not tied to it, maybe 3 cycles, then the next month. This is also to give way and time to research, etc."

> On what the map shows when time runs fast: "always live-looking".

## What is there now

- One clock: game seconds (`S.time`, `IC.GS` = 10 a real second at 1×, speeds 1–32×, skip 64×). Day and night follow it (`86400` s a day).
- The whole Career fits in a few game days. Act I's six chapters need at least 80 game hours. The war is about three days.
- Research, city growth (% a day), deals (2–3 game days), loans (a term in days, 0.4% interest a day), the weekly statement, story beats and the enemy's escalation all count game hours or days.

## Goal

**Two clocks.**

1. **The live clock** is the simulation as it is: aircraft, construction, weather, day and night, radio, raids. Nothing in it slows down.
2. **The calendar** counts months and years: "March, Year 3".
   - A month is `IC.DAYS_PER_MONTH` live day-and-night cycles, 3 to start, tunable.
   - The date shows in the top bar, and every log line and report carries it.
   - The first Career starts in January, Year 1.

The simulation always looks live: planes fly and land at every speed. There is no summary mode.

**What moves to the calendar** (counted in months, so it scales with `DAYS_PER_MONTH`):
- **Research:** projects take months; a big one takes a year or more.
- **Cities:** growth and decline per year; a city can double over a decade with good service.
- **Airlines:**
  - deals run for months to years;
  - offers come every month or two;
  - airlines grow fleets and open routes over years.
- **Money:**
  - a monthly statement replaces the weekly one, and a yearly review is added;
  - loans run for years with monthly interest;
  - the grant and taxes stay per hour, so money keeps flowing live.
- **Wear and ageing:** runways, buildings and aircraft age over years and need resurfacing and renewal.
- **The story:** acts span years.
  - Act I: 3–5 years of building civil aviation.
  - Act II: 2–3 years.
  - Act III: 1–2 years of gray-zone incidents, rising month by month.
  - Act IV: the war, weeks to months, most of it live.

  Chapters wait for what the player has built and can afford, not for a timer. Where a chapter still needs time (demand growing, research finishing), the Guide says what is worth doing meanwhile.
- **Seasons:** each month has its weather. Winter brings fog, snow and crosswinds; summer brings thunderstorms. Traffic has seasons too: a summer peak for leisure, and holidays.

**What stays live:**
- Construction stays about as fast as now. Stretch it a little with more visible stages and animation: surveying, earthworks with lorries and graders, paving, markings, lights coming on.
- Flights, turnarounds, incidents and combat stay on the live clock. So do supply convoys and repairs.

**Time to breathe.**
- After a big task, the player can sit back and watch revenue come in.
- Add a faster speed for quiet stretches: a "wait for money" speed that stops by itself when the treasury reaches what the player wants to afford (the player picks the thing), a month turns, or something needs the player. Work out with 29's step budget how fast it can go with a busy map. A month (3 days) should pass in about a minute of real time when nothing happens.
- Skip still stops for anything that needs the player.
- Waiting should always have a reason on screen: "₭400M to go for the second runway, about 5 months at this rate".

**Balance.**
- Retune in months: prices, grants, running costs, research, growth, deal lengths.
- A player who builds well is never waiting long without something to afford.
- A player who overbuilds waits for months, and sees why.
- Keep the Quick war and the Academy on the live clock (a Quick war is a few days of war; lessons are hours). The calendar may show in them, but does not pace them.

## Scope

- **Clock and speeds:** the clock (`core.js`), the top bar and the speeds (`ui.js`, `main.js`).
- **Rescaled to months:** research in `logistics.js`; growth, the statement and loans in `growth.js`; deals and airline growth in `aviation.js`; act and chapter pacing in `story.js`.
- **Seasons:** in `weather.js`.
- **Construction stages:** in `builder.js` and `render-airport.js`.
- **Out:** the enemy commander's war pacing (19), which stays in live hours once the war starts; Act III's gray-zone schedule moves to months.

## Done when

- `npm test` is green, with tests:
  - the calendar turns a month after `DAYS_PER_MONTH` days;
  - research, city growth and a deal's length follow the calendar, so doubling `DAYS_PER_MONTH` doubles them in live days;
  - "wait for money" stops when the treasury reaches the target;
  - a save and load keeps the date;
  - every Academy lesson still completes.
- A Career balance run of all four acts, extending the scripted player in `careerplayer.js`, prints the date each act and chapter starts and the treasury by month. Act I lasts 3–5 calendar years, the whole Career 10 or more.
- The pull request has:
  - screenshots of the top bar's date, the monthly statement, the yearly review and a construction in stages;
  - the balance run's timeline;
  - real playing time estimates for each act at normal and fast speeds;
  - step times at the fastest speed with a busy map.
