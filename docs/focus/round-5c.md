# Round 5c: polish, tutorials, menus, and the words

Round 5c had six jobs, in this order:
1. Teach every civil feature on the real screen.
2. Get Chapter 3 past its radar goal.
3. Fix the benchmark's and the trailer's visual notes (P1–P12).
4. Put the menus under one set of rules.
5. Go over every word on screen.
6. Play it fresh, score it, and record a new trailer.

Everything taken out is hidden behind two switches in `IC.FOCUS`, never deleted:
- `tutors` hides the old click-through tour and the self-opening tips;
- `polish` switches off the visual changes.

- Pictures: `docs/focus/round-5c/` (after) and `docs/focus/round-5c/before-*.jpg` (the `focus/round-5b` checkout, played the same way).
- The playthrough tool: `tools/round5c-play.js`.
- The words, before and after: `round-5c-words.md`.
- The trailer: `trailer/iron-canopy-trailer.mp4`.

## 1. Tutorials that wait for the player

Round 5b's `tutor.js` grew into the tutorial engine for the whole civil act.

**What a step can do now:**
- point at the map (`at`) as well as at a button (`el`), or at a list of buttons where the first one on screen wins;
- check the state itself (`ok`): the bar is open, a plan is placed;
- start on a game event (`trig`): the first airliner, the first offer, a milestone, the first decision card.

**How tutorials behave:**
- One shows at a time, with a short pause between them.
- None cuts in while a plan is being placed, except the builder's own.
- A tutorial whose target has gone (a card closed, a panel slid away) is put aside, and comes back when the target can be shown again.
- A place off the screen gets **Show me where**, which moves the camera there. That is navigation, not a Next button: steps move on only when the game sees the action done.
- The builder reports what the player does as `bld` events: placed, moved, turned, built, dropped, site, found.

**Fifteen new tutorials, each 2–5 steps, each met the first time:**

| Tutorial | Starts when | Steps |
| --- | --- | --- |
| Goals and time | the Career begins | click the goal · change the speed |
| Founding | no airport yet | Build · Found an airport · the site (a ring on a good spot 20–30 km out) · Found |
| The Starter | the airport is founded | Blueprints · Starter · place it · Build · Finish now |
| Problems and fixes | a problem marker with a fix | press the fix · Build or Esc |
| Airport pieces | the bar is opened after the airport opens | Airport pieces · pick one · place it |
| Build or Esc | any plan is placed | a plan, not a building (move, turn) · Build, or Esc |
| Following | the first airliner comes in | click it (or its call sign on the follow strip) · zoom to the stand · let it go |
| Offers | the first offer | open it · sign, or build what is missing |
| The airport panel | Chapter 2 | click the airport (or "◂ airport" from a building) · the details · close |
| Milestones | the first milestone card | place the piece · Build or Esc |
| Decisions | the first deck card | pick an answer · the Journal |
| The chain | money comes in | Show on the map · zoom out |
| Wait | short of money with nothing building | Wait · pick a target |
| Airways | Chapter 3 | Draw airways · an entry point · lay the airway |
| Civil radar | airways exist | Show the gaps · the beacon radar · place it on the biggest gap |

- **Show me.** Each tutorial is listed under its Guide lesson, so it can be played again. Three lessons are new: *Watching an aircraft*, *Milestones* and *Decisions*.
- **The goal panel.** A goal that a tutorial teaches gets **Show me** next to **How?**. Its tip no longer opens by itself with a *Got it*.
- **The old tour.** The first-minutes click-through tour (four notes, each with *Got it*) is hidden.
- **Settings.** The Settings card now speaks of tutorials. *Show every tutorial again* resets them.

**Tests:**
- every civil tutorial step advances on its real action (founding and the Starter go through the real builder), and only once the story reaches it or its event has happened; Skip, Show me and saving work;
- round 5b's test now accepts map steps.

## 2. Chapter 3: radar the player can place

Both earlier playthroughs stalled here at 31–42%.

**The new pieces** (`airspace.js`):
- `IC.wayPoints`: the airways sampled every 10 km.
- `IC.radarGap`: the longest stretch of airway no radar sees.
- `IC.radarGain`: what one radar at a spot would add, and what its band's crowding would cost.
- `IC.radarPlan`: how many beacon radars on the middle of each gap would reach 80%.

The goal, the tag, the tip and the marker all read the same measure. `IC.wayCoverAll` is now the goal's own check.

**What the player sees:**
- **The goal's tip.** *"About 2 more beacon radars, each on the middle of a gap and at least 150 km from the next: one sees about 400 km of airway at cruise height. The biggest gap is 954 km; the marker on the map shows its middle."*
- **The progress line.** *"54% of the airways seen at cruise height · about 2 more radars"*.
- **While placing.** Above the radar ghost: *"+18% of the airways seen · 0% now, 18% with it"*, and *"2 radars on this band within 70 km: +₭… a month to keep"* (`13-radar-tag.jpg`).
- **Show the gaps.** A new layer button paints every unseen stretch amber and pulses on the biggest gap.
- **A fix-it marker.** *"2348 km of airway no radar sees · Place a radar here ▸"* picks the beacon radar and takes the camera there.
- **Radar cover belongs to the moment (P8).** It shows while a civil radar is placed or the Airspace tab is open. Chapter 3 no longer turns it on for the rest of the Career.

**The consultants.** Hiring them now always leaves the chapter's three entry points on airways. Before, two foreign airports in the same direction gave one fix, and a far airport's entry point could land more than 25 km past the border, which does not count as an entry. Eight worlds out of eight now pass that goal.

**The proof:**
- A test plays Chapter 3's card, hires the consultants, and places beacon radars where the gap marker is, as the tip says. It reaches 80% within the count the tip gave, plus one, on two worlds.
- The playthrough did the same through the real buttons. Chapter 3 took **3.8 minutes with 4 radars, the number the tip named**, against 28 minutes or more in rounds 5a and 5b.

## 3. Visual polish (P1–P12)

| | What changed | Evidence |
| --- | --- | --- |
| P1 | Apron vehicles are at least 15 px long from the middle zoom, with wheels, a windscreen and a light edge. People are drawn from above with a head. The pushback tug is the stand's tug, on a tow bar. | `05b-stand-z150.jpg` against `before-05b-stand-z150.jpg` |
| P2 | A click on an aircraft at its stand picks the aircraft from the whole-airport zoom in (`IC.pickAt`, now headless and tested). The aircraft's panel is a slim card: what it is doing, the turnaround's bar, the services at work as chips, Follow, and *More ▾*. | `05-turnaround.jpg` |
| P3 | The build bar closes after a build. Its caption moved into the one strip of keys (*"Placed · Build or Enter builds it · a click elsewhere moves it · R turns it · Esc drops it"*). The Build button gives the time for pieces and blueprints too (*"Build · ₭1,077M · 4.9 h"*). | `t-starter-4.jpg` against `before-02-starter-ghost.jpg` |
| P4 | `IC.LBL`: one placement pass for the airport's labels, town names, the words floating over the works, the stand clock and the chain's tags. Close in, labels are drawn in screen pixels; a fraction-of-a-unit canvas font came out squeezed. | test; `12-chain.jpg` |
| P5 | The money comes back as coins with the ₭ sign. The busiest route says how busy it is (*"✈ Belvel · busiest: 4 aircraft on it"*). | `12-chain.jpg` |
| P6 | Stands are numbered from 1 across the airport. *"Turnaround: 38 min left · now: passengers getting off (4 min)"*. The advisor's line no longer says their name twice. Founding's How points at the build bar. | `05b-stand-z150.jpg` |
| P7 | Radar placement that teaches (section 2). | `13-radar-tag.jpg` |
| P8 | Radar cover only while a radar is placed or in the Airspace tab. | `06-end.jpg` |
| P9 | Wait's round sums appear only if they come within a year ("about 28 years at this rate" is gone). 5b already hid unreachable ones. | — |
| P10 | Taxiing aircraft leave a short trail from the middle zoom. | `11b-night-z22.jpg` |
| P11 | A milestone card brings the camera home and stops following. | `04-milestone.jpg` |
| P12 | Deal rows are on one line (airline · route · aircraft · charges · time left · bad days), with buttons on hover. A problem's fix sits under its words, never squeezed into a column. | `06-end.jpg` |

**Also:**
- **The day board's chart** is drawn at the panel's own size and scaled to the flights. The hour labels read, and the runways' line waits at the top with its number.
- **The ground fleet's rows** read *"Tugs 5 of 4 · 14 stands with pushback · 5 free now"*. The money is in the tooltip.
- **The Sensors card** stays folded in the civil act unless Chapter 3's radar goal needs it.
- **The top bar** no longer runs off the screen at 1440 px. The role takes two lines at most, the money line drops "invested" (the tooltip keeps it), and the sky's line is cut short instead.

## 4. The menus: one set of rules

The rules are at the end of `app.css`, under the `.app.pol` class:

- **Spacing:** 4, 6, 8, 12 and 16 px.
- **Type:** a 15 px base. Panel text .9rem, small print .8rem, row labels .7rem capitals. Numbers in the mono face, titles in the display face.
- **Weights:** 600 for what can be pressed, 400 for prose.
- **Colour:** each colour keeps one meaning.
- **States:** every control has rest, hover, pressed (a pixel down), disabled (40%, not-allowed) and a focus ring for the keyboard. Before, focus and pressed states were missing and disabled varied by control.

**Nothing clipped:**
- A goal's reward wraps under it.
- Long airport names break at a word.
- With the bar open, the goal panel folds to a whole first goal.

## 5. The words

There are 40 before/after lines in `round-5c-words.md`:
- four "Nothing happens." answers now say what happens;
- the old directions to the Aviation room are fixed;
- one name is said once;
- the numbers read right (*Stand 1*, *About 1 movement a night*);
- *deal*, not *contract*, for airlines;
- *fuel farm* everywhere;
- no rhetorical question, *well done* or *seamlessly*.

`tools/textlint.js` flags a list of filler and brochure phrases (`BANNED`). A test proves the rule catches them and passes good lines, that the source has none, and that no tutorial step has one or an exclamation mark.

The survey of the civil act's 2,110 strings found little else. Rounds 1–5b had already done most of this.

## 6. The final check

`tools/round5c-play.js`: a fresh Career from the start screen, 1440 × 900, 30 minutes. It follows each tutorial the way a new player would: it reads the note, clicks what it rings, and checks that the step moved on. Otherwise it plays as round 5b's player did.

| | Round 5a | Round 5b | **Round 5c** |
| --- | --- | --- | --- |
| Airport open | 1.2 min | about 1 min | **1.0 min, 16 clicks** |
| First airliner parked | 1.5 min | about 1.5 min | **1.2 min** |
| Chapter 3 (airspace) | stalled 28 min (31–42%) | stalled (31–42%) | **3.8 min, 4 radars, 95% seen at the end** |
| Chapters reached in 30 min | 3 | 3 | **5** (Ch 4 at 14.1 min, Ch 5 at 15.0) |
| Events | 48, longest gap 1.9 min | — | **34 of 15 kinds, longest gap 3.2 min** |
| Milestones | 2.1 / 4.4 / 9.2 min | — | 6.1 / 10.9 / 25.5 min |
| Longest departure hold on a stand | 10,050 min | 26 min | **8 min** |
| Passengers an hour at the end | 147 | 878 | **1,750** |
| Page errors | 0 | 0 | **0** |

**Tutorials in the run.** Fifteen civil and round 5b tutorials came up.
- Eleven finished on the clicks.
- Airways and Civil radar were finished by their own checks: the consultants drew the airways, and radars went on the marker.
- **Following** stuck at its first step. The follow strip was rebuilt every few seconds, so the call-sign button the player clicks was replaced under the mouse. That is fixed after the run, and the selection itself was checked in the page.
- **Airport pieces** stuck at its third step. The scripted player found no free spot beside the taxiway. This is the tool, not the game.

### The checklist

| # | Item | Score | Evidence |
| --- | --- | --- | --- |
| 1 | Knows what to build first, where and why, within 2 min | **Met** | The founding tutorial rings Build, then Found, then a good site, then Found again: `t-found-1`…`4.jpg`. Founded at 0.4 min. |
| 2 | A working airport in 5 min and about 30 clicks | **Met** | Open at 1.0 min after 16 clicks (`03-built-z14.jpg`) |
| 3 | Snaps; price and build time; one action; Esc cancels; nothing crooked unsaid | **Met** | *"Build · ₭1,077M · 4.9 h"* (`t-starter-4.jpg`); the Build or Esc tutorial; the bar closes after a build; the strip has no clipped caption |
| 4 | Construction worth watching, skippable | **Met** | Finish now in the Starter tutorial (`t-starter-5.jpg`); stages on site |
| 5 | First airliner in 10 min; follow it; see each service | **Met** | Parked at 1.2 min. At stand zoom: stairs, ground power, belt loader, bags, people (`05b-stand-z150.jpg`). The slim card lists the services at work. |
| 6 | Alive at every zoom; busier looks busier | **Met** | Night traffic, trails, lit apron (`11-night.jpg`, `11b-night-z22.jpg`); 90 movements a day and 1,750 passengers an hour at the end |
| 7 | Everything built visibly changes something | **Met** | *Terminal opens*, the milestone's piece, the gains placed without overlap (`04-milestone.jpg`) |
| 8 | Always knows the next goal; goals every few minutes | **Met through Chapter 4; not measured in Chapter 5** | One line with its reward and Show me. Chapter 3 now takes 3.8 min. The longest gap, 15.1 min, is Chapter 5's "Found an airport within 60 km of Kesyn": the scripted player does not found a second airport. The goal, its How and the card say what to do. |
| 9 | Something different at least every 5 min | **Met** | 34 events of 15 kinds, longest gap 3.2 min |
| 10 | Growth felt within the first hour | **Met** | 2,000 / 6,000 / 15,000 passengers a day at 6.1 / 10.9 / 25.5 min; 13 deals; 1,750 passengers an hour |
| 11 | Basic tasks on the map; problems where they are, fix one click away | **Met** | The problems tutorial presses a marker's fix (`t-problems-1.jpg`, `09-problem.jpg`); the gap marker's *Place a radar here* |
| 12 | The systems connect visibly | **Met** | The chain with coins and the busiest route (`12-chain.jpg`, `12b-chain-near.jpg`) |

**11 met. Item 8 is met as far as the run reached.** Its one long wait is a step the scripted player cannot take: founding a second airport in a new city. A human player has the goal line, its How and the Guide.

## The trailer

`trailer/iron-canopy-trailer.mp4` was recorded again with `tools/trailer.js`, copied from `focus/trailer`. Its new scenes:
- a tutorial step (the build bar's first note, then Found an airport);
- the day board;
- the ground fleet;
- the airline scorecards;
- a decision card.

Its three known flaws are fixed:
- the caption keeps above the Build button and the tutorial's note;
- the turnaround is filmed at z 260, where the vehicles read;
- the night scene waits for aircraft moving under the lights, closer in.

The scene list is in `trailer/README.md`.

## Tests

New behaviour tests in `tests/run.js`:
- every civil tutorial step advances on its real action, one at a time, and the Guide replays it;
- Chapter 3 radar: the tip names how many and where, the tag says what a spot adds, and radars on the gap marker reach 80%;
- clicking an aircraft on its stand selects it from the whole-airport zoom in, and a click beside it picks the airport; stands count from 1;
- no two map labels overlap at the airport zooms, and the floating words go round them;
- textlint finds none of the banned phrases, in the source or in any tutorial step.

Their times are in `tests/times.json`.

## What is left

- **Chapter 5 in the scripted run.** The playthrough tool does not found the second airport, so the pacing of Chapters 5 and 6 is still unmeasured.
- **Two tutorials stuck in the run.** Following was fixed after the run but not replayed for 30 minutes. Airport pieces' last step needs a smarter scripted player, not a game change.
- **Terminal glass that brightens with passengers (P10's third part)** was not done.
- **Sound** was not checked in this round.
- **The Wait tutorial** did not come up in the final run. Money never ran short with nothing building.
