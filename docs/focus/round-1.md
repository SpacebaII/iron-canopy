# Round 1: build something cool, fast

Branch `focus/round-1`, on `main` with the playtest report (`docs/focus/career-playtest-1.md`) merged in. This round covers checklist items 2, 3, 4 and 7 of `docs/focus/plan.md`, plus the playtest's two blockers.

Screenshots are in `docs/focus/round-1/`:
- `before-*.jpg` are copies from the playtest.
- The numbered shots come from the recorded playthrough, `tools/round1-play.js`. It starts a fresh Career from the start screen in headless Chromium at 1440 × 900, using real mouse clicks and keys. It reads `IC` for positions and state only.
- `pieces-*.jpg` are the same playthrough built piece by piece instead of from the Starter blueprint.

## The numbers

| Moment | Before (playtest 1) | After: Starter blueprint | After: piece by piece |
| --- | --- | --- | --- |
| Airport founded | about 9 clicks, 2:00 | 11 clicks, 0:37 | 11 clicks, 0:39 |
| First runway ordered | about 17 clicks, 2:30 | 16 clicks, 0:46 (with the whole airport) | 12 clicks, 0:41 (Build on the surveyed runway) |
| **Complete starter airport ordered** | about 45 clicks, 7:00 (part by part) | **16 clicks, 0:46** | **19 clicks, 0:55** (runway, terminal, services) |
| Airport open for business | 4 h 18 min of game time, 7 real minutes | 17 clicks, 1:00, with Finish now (10 s of real time) | 23 clicks, 1:13 (Finish now: 9 s) |
| First landing | 13:00, after 3 diversions | 19 clicks, 1:30, 0 diversions | 23 clicks, 1:48, 0 diversions |
| Chapter 2 | 14:00 | 1:30 | 1:48 |
| Wait | stopped 10 times in a row by one incident | 4 stops in 101 game hours: a deal at risk, an offer, a deal over, February begins | 3 stops in 40 game hours: a deal at risk, an offer, a deal over |

How to read the counts:
- Clicks include the 7 clicks that close the opening tips and cards. A player who skips the tips saves those.
- Real time includes about 0.3–1.5 s of tool pauses per action, and the time Chromium takes to load the region (about 20 s).
- A human reads more and clicks fewer times by mistake. Treat the times as a lower bound and the clicks as close to exact.

## What changed, step by step

### 0. The playtest's blockers

**(a) The landing system is taught before fog punishes.**
- Chapter 1 has a new goal: "Put a landing system (ILS) on the runway: fog and snow close it without one". Its "how" text says why, what it costs (₭25M) and where it goes.
- The Runway with taxiways piece and the Starter airport come with a landing system at each end, so the usual path never meets the rule.
- If the airport opens without one, the "Open for business" card says so and has a **Build a landing system** button.
- The airport's warning now gives the price and where to build it.
- An arrival that diverts for want of one brings, at most once every six game hours per airport:
  - a "Diverted in the fog" card with the reason and the same button, which selects the airport, opens the build bar and picks the landing system;
  - a red "DIVERTED: NO LANDING SYSTEM" marker over the airport.
- The rule itself is unchanged.
- Test: *an arrival diverted for lack of a landing system says why, with the fix one click away*.

**(b) Wait reaches the next meaningful event.**
- `IC.waitWorth` decides whether an incident may stop Wait or skip.
- In Act I, before the airspace chapter, spacing incidents and near misses do not stop it: the player has no radar or airways to give yet. Neither do incidents between foreign flights.
- The same incident about the same aircraft never stops it twice, and the same kind of incident stops it at most once per game day.
- The near-miss card is not shown in Act I before the airspace chapter. The Journal and the news still have it.
- Test: *Wait is not stopped twice by the same incident, nor by one the player cannot act on yet*.

### 1. Founding keeps the plan

- **Full price up front.** The survey prices the access road (`IC.landAccessPlan`, shared with the road that is then laid), so Found's price is the whole price. The survey adds the lines "Access road 11 km to the nearest road: ₭25M" and "25 km from Wengrad · Total ₭126M, everything included". In the playthrough the treasury fell by exactly the price shown, against ₭92M shown and ₭140M taken in the playtest.
- **The surveyed runway stays.** After Found, the surveyed runway stays on the map as a placed plan: the Runway with taxiways piece on the survey's line, with its Build button and price. Build or Enter lays it. Nobody redraws it by eye.
- **The founding band is drawn.** While founding:
  - the 15–40 km band round the capital is on the map (round the nearest town once the national airport exists);
  - the distance from the town is shown under the cursor ("25 km from Wengrad", amber outside the band);
  - an arrow shows the prevailing wind.
- Test: *founding keeps the surveyed runway as a plan, and Found's price is the whole price*.

### 2. Big building blocks first

- **Pieces.** The build bar opens on **Airport pieces** (Shift+1). Each piece is a layout planned through the blueprint path (`pieces.js`), built as one plan with one price and undone as one step:
  - **Runway with taxiways:** the runway, a parallel taxiway 190 m out, end links, a holding entry at each end, two rapid exits and a landing system at each end. It is placed by two clicks or a drag; R puts the taxiway on the other side.
  - **Terminal with apron:** a straight terminal with 6 gates.
  - **Terminal with a pier:** 10 gates.
  - **Round terminal:** 11 gates.
  - **Services:** a tower, a fire station and a fuel farm, set outside the 150 m runway strip.
  - **Cargo area:** a shed, 4 large stands and a taxilane.
- **Placing a terminal or the cargo area.** It turns to face the nearest runway and joins the nearest taxiway by itself. The links are drawn on the ghost as dashed guides.
- **Blueprints** (Shift+2) has the **Starter airport**:
  - a 3 km runway with its taxiways and two landing systems;
  - a terminal with 8 gates and 1,060 passengers an hour;
  - a tower, a fire station and a fuel farm.

  It costs ₭1,077M, all in one plan. On a new airport it lies on the surveyed runway. With a runway already planned it is built round that runway: it adds the parallel taxiway only if there is none, and links to it if there is.
- **Detail.** The single parts are folded under **▸ Detail**, with pavement, width, lights and zone still there. Pieces use sensible defaults: concrete, lit, the zone from what the piece is. Terminals keep one choice, the gate size.
- **The switch.** `IC.FOCUS = { pieces: true }` in `core.js` is the one switch. With `false` the old bar comes back as it was.
- **Tests:**
  - *a starter airport template places a complete working airport as one plan*: one undo step refunds all of it. Once built, every stand is joined, nothing is in a strip, jets can land, and every Chapter 1 goal but the first airliner is met.
  - *a terminal piece placed beside the runway faces it and joins the parallel taxiway by itself*.
  - *the build bar opens on whole pieces*.

### 3. Controls: one model everywhere

- **Click, drag, turn, build, cancel.**
  - Click to place.
  - Drag to stretch: a runway, a runway piece or an area drags out from where the button went down.
  - R or the ⟲ ⟳ buttons turn a piece a quarter turn (Shift+R turns it 15°). For the runway piece and the Starter, R puts the taxiways on the other side.
  - Build or Enter builds; Esc or right-click cancels.
- **Undo** takes back a whole piece, its links and its landing systems as one step.
- **Closing the inspector** with × keeps the build bar on its airport. The bar also remembers the last airport selected.
- **Keys 1–6** are the speeds and 7 is Wait, with the build bar open too. Shift with a number picks a build-bar tab; each tab shows its key, for example ⇧1.
- **The cursor card** (price, warnings) goes on ahead of a line being drawn, never over the line behind it. The hover card and the "Right-click: cancel" chip are not shown while founding, so they no longer cover the Found button.
- **Wheel zoom** moves in even steps of at most about 20% a notch, however large a step the browser reports. Before, two notches went from 4.7 to 45.
- **More room for the map.** While placing, the selection panel slides off to the right. Picking a piece zooms the camera to show the whole airport.

### 4. Visible plans and payoff

- **Plans are visible.** Queued and surveyed taxiways are staked out end to end, at least 3 px wide. Before, a queued taxiway showed only 5% of its line. The ghost of a piece or blueprint draws the runway at least 7 px wide with a dark edge, and taxiways at least 3 px. Shots: `08-plan-close.jpg`, against `before-33-queued-invisible.jpg`.
- **A wrong build is explained.** A building inside a runway strip (150 m either side of the centreline, 60 m past the ends) is accepted but said:
  - on the plan: "Fire station stands 110 m from the Runway 08/26 centreline, inside its 150 m strip: an aircraft that runs off the side would hit it. Place it at least 40 m further out";
  - in the airport's warnings, with "Move it … (Move on the build bar)".

  Landing systems and radars belong there and are exempt. Test: *a building inside a runway strip is warned about on the plan and on the airport, with the fix*.
- **Every finished piece shows what it changed.** The change rises over it on the map for six seconds, for example "+26 MOVEMENTS AN HOUR", "+8 STANDS", "+1,064 PASSENGERS AN HOUR" or "FREIGHTER CAN LAND". Shot: `10-built.jpg`. The runway and terminal "opens" cards still give before → after.
- **The first flight is offered when the airport opens.** The "Open for business" card comes as soon as a runway, a terminal, fire cover and fuel are built. In the playthrough it came as Finish now ended.
- **Finish now.** It sits on the build bar and in the Works tab. Time runs at three times Wait's speed until every work at the airport is done, then stops. It is not stopped by goals that its own works tick off, but stops for anything that needs the player, or when the works run out of money. The six hours of the Starter's works took 10–14 real seconds.
- **Construction stays watchable.** The stages are unchanged: survey pegs, earthworks with lorries, paving, markings and lights.

## The checklist

| # | Item | Met? | Evidence |
| --- | --- | --- | --- |
| 2 | Within 5 minutes and about 30 clicks, a working first airport that looks real: runway, taxiways, terminal with stands, tower, fire, fuel | **Met** | The Starter path ordered it in 16 clicks and 46 s; it opened in 17 clicks and 60 s. Piece by piece: 19 clicks and 55 s to order, 23 clicks and 73 s to open.
 Shots `12-airport.jpg` and `13-terminal.jpg`: an 8-gate terminal with its apron, taxilane, kerb loop and car park, the tower, fire station and fuel farm, the runway with its taxiways. |
| 3 | Every placement snaps where meant, shows price and build time, builds with one obvious action; Esc or right-click always cancels; nothing crooked, floating or unconnected without the game saying so | **Mostly met** | Pieces face the runway and join the nearest taxiway, with the links drawn. One Build button shows the price; the "planned" message says how long the work takes for the crews there. Esc and right-click cancel, and undo takes back a piece. A building in the strip is now said. Not yet: the piece's ghost does not show its build time before the click (only after), and terminal pieces do not snap to a set distance from the parallel taxiway (they join it from wherever they are put). |
| 4 | Construction worth watching, skippable without minutes of real waiting | **Met** | The stages are drawn as before, queued work is now visible, and Finish now runs the Starter's 6 game hours in 10–14 real seconds (`09-construction.jpg`). |
| 7 | Everything built visibly changes something | **Partly met** | Movements an hour, stands, passengers an hour and the largest aircraft rise over each finished part (`10-built.jpg`). The airport opens as soon as it can take jets. Not yet: the terminal "filling with people" and services at work (fuel, fire) are Round 2's. |

## Tests

New tests in `tests/run.js` (section "round 1"):
1. an arrival diverted for lack of a landing system says why, with the fix one click away;
2. Wait is not stopped twice by the same incident, nor by one the player cannot act on yet;
3. founding keeps the surveyed runway as a plan, and Found's price is the whole price;
4. a starter airport template places a complete working airport as one plan;
5. a terminal piece placed beside the runway faces it and joins the parallel taxiway by itself;
6. a building inside a runway strip is warned about on the plan and on the airport, with the fix;
7. the build bar opens on whole pieces, each with a price and what it does; the parts fold under Detail.

`npm test`: NPM_RESULT

## What is left, and what needs the owner

- **Feel on real hardware.** The playthrough ran in software-rendered Chromium. Wheel steps and drag placing should be tried with a real mouse and touchpad.
- **The Starter's size is a choice.** It is a single 3 km runway with 8 gates for ₭1,077M. That is about a fifth of the Career's ₭5,500M, which leaves room for the second terminal or pier that Chapter 2's deals will ask for. A bigger "National airport" blueprint (two terminals, a cargo area) could be offered later.
- **A hangar in the Starter?** In both Wait runs the flag carrier's deal ended within two game days of opening, because nobody built the hangar it needs. Chapter 2 asks for one, and the deal allows a day. The Starter has no hangar. Adding one would make the first deal safe, but it would also tick one more Chapter 2 goal in advance. This is the owner's call.
- **Snapping.** Pieces are placed freely and joined by links. A snap that puts a terminal exactly 100 m beyond the parallel taxiway would make layouts tidier. Round 3 (problems on the map) is a good place for it.
- **More room on screen.** The message feed in the middle of the screen still covers the airport while building; the inspector now steps aside. Round 3 plans fewer panels.
- **The old tips** still talk about "the build bar's tabs (1–0)". Round 5 rewrites the first ten minutes' words.
- **Chapter 2's goals** open with several already ticked, because the Starter builds a tower, a landing system and taxiways to both runway ends. That is Round 4's rework of goals.
