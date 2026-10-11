# 48 A research tree from day one: small upgrades, real choices, a HOI4 pace

Wave 15, alongside 49 (the Ministry's agenda). Owns the research: `IC.TECH` and `IC.TECH_CATS` (`data.js`, `logistics.js`), a new `research.js` (the civil tree and the modifier system), the Research room (`research()` and `treeLinks()` in `warroom.js`, nothing else there), the reads of each modifier where the simulation uses its constant (`airport.js`, `groundops.js`, `builder.js`, `aviation.js`, `handling.js`, `airspace.js`, `logistics.js`), `IC.roomAllowed` and the research locks in `story.js`, the research policy in `careerplayer.js`. 49 owns the Career room and `focus.js`; both call `IC.mod`, which this brief owns (interface below: agree it first). Start from `origin/main`.

## What the owner said

> "what are your thoughts on game progression I feel like it still might be too fast not in the context of things to do but in the context of there's a massive research tree, for 1 it seems a little small honestly I feel like maybe some upgrades should be less tangible and like refueling is 5% faster etc. and then expand the tangible side so that a player could be generic all round or has the ability and depth to specialize in different areas."

> "let's start the research tree, from the very beginning because that will help make everything feel better and the career pacing is horrible off the simple fact of like we should really try to match a Frostpunk HOI4 type of deal."

## Where it stands (read against `main` at #59)

- 37 projects: 32 military in six lanes (`data.js:239`), 5 airport ones (`logistics.js:824`: jet bridges, reinforced concrete, hydrant fuel, ground radar, CAT III).
- In the Career the Research room opens only in Act III (`story.js:61`, `research: 3`). Locked airport parts still send the player there (`IC.aptLockWhy`, `airport.js:15`). The first playtest never saw research offered (`docs/focus/career-playtest-1.md:247`). In effect, the Career has no research for its first two acts.
- Durations are calendar months (`IC.techMonths`, `logistics.js:834`), and Wait runs at 432× (`core.js:17`), so a 5-month project ends after about five minutes of waiting. Costs are ₭60–150M against a ₭5,500M start: never a choice.
- Every effect is a hand-written `IC.hasTech(S, 'id')` at the place it acts (43 of them). That does not scale to dozens of small upgrades.

## What HOI4 and Frostpunk do that we take

- **Something is always queued.** Every slot is busy and a project ends every few real minutes; an idle slot is a visible waste.
- **Research speed is earned.** More slots over the game (HOI4), more workshops (Frostpunk).
- **Choices close doors.** Some branches rule each other out, so two players' airports end up different.
- **Time is felt in play, not skipped.** Projects are long enough that you plan around them, and fast-forwarding does not finish them for free.

## Goal

**1. Research from day one.** The Research room opens at the start of the Career. Before Act III it shows the civil lanes; the military lanes show greyed as "Opens with Act III" (one line, no nodes), and open there as now. Quick war and the sandbox are unchanged (all lanes, live clock). `IC.aptLockWhy` and every "(Research room)" pointer now lead somewhere real. The rail shows the idle-slot dot from day one.

**2. Paced by play, like the event cards.** In the Career a project's length is in real minutes of play: progress runs on the play clock `S.story.play` (`deck.js:3`, `IC.playRate`), which counts real seconds whatever the speed. Waiting and skip do not finish research faster than playing. Lengths run from about 4 minutes (a first step) to 25 (a capstone). The tree and the slot show "about 12 min of play" and, beside it, the calendar date it will land at the current speed. The Quick war keeps game seconds (`t.time`). Tune it so that in the scripted Career (`storytest.js`) a slot is never idle for long and Act I finishes about half of the civil tree.

**3. Modifiers, not more `hasTech` checks.** A project may carry `fx: { refuel: 0.05 }` (a share) and/or `opens` (a part, a material, a mode, as `IC.APT_TECH` does today).
- `IC.mod(S, key)` returns 1 + the sum of every source's share for `key`, capped by `IC.MOD_CAP[key]` (default +30%), cached until a source changes. Sources are a list, `IC.MOD_SRC`: this brief adds finished research; 49 adds the Ministry's agenda. A source is `(S) => [{ fx, why }]`, so the panels can say where each share came from.
- `IC.MOD_WORDS[key]`: what it does in a sentence and the unit it changes ("Fuel trucks refuel 5% more aircraft an hour").
- Each system multiplies its own constant once, in the simulation and in `IC.aptStats` alike, so what a panel promises is what happens. The keys this brief wires (49 may only use these, plus its own): `refuel`, `board` (boarding and deplaning), `catering`, `pushback`, `turn` (whole turnaround), `rwOcc` (runway occupancy, lower is better), `ctlLoad` (flights a controller handles), `buildSpeed`, `buildCost`, `matLoads` (lorry loads per hectare), `paveLife`, `bldLife`, `xwind` (crew crosswind limit, in kt not share), `fireTime`, `birds`, `offerRate`, `overList` (how far over list an airline accepts), `forgive` (bad days forgiven sooner), `cargoRate`, `repair` (runway and road repair), `fuelSpread`, `grant`.
- Where the player reads the number, they read the research too: "Fuel: 24 aircraft an hour (+10% from research)", in the airport panel, the deal needs table and the info views. A test asserts that every key in any `fx` is read by the simulation and has words.

**4. A civil tree of about 45 projects in six lanes.** The five existing airport projects keep their ids (saves and tests use them). Each lane has cheap first steps, ranked small upgrades (I, II, III, each needing the one before, each costing more), and one or two tangible capstones. These are examples; keep the spirit, and keep everything on the airport and airline side:

| Lane | Small upgrades | Tangible capstones |
| --- | --- | --- |
| Ground handling | refuelling +5% ×3, boarding +5% ×3, catering, quicker pushback | jet bridges, hydrant fuel (existing), towbarless tugs (pushback and tows quicker, a gate is free sooner) |
| Runways and control | runway occupancy −3% ×3, a controller handles one more flight ×2 | ground radar, CAT III (existing), high-speed exits (rapid exits taken at 50 kt, not 35) |
| Construction | stages 8% quicker ×3, works 5% cheaper ×2, pavement lasts 10% longer ×2 | reinforced concrete (existing), slip-form paving (30% fewer lorry loads), night works on any job |
| Weather and safety | crosswind limits +2 kt ×2 (crew training), fire response −10% ×2, fewer bird strikes | glycol recovery (de-icing pad twice as fast), winter operations (snow closes a runway for less time) |
| Airlines and cargo | offers come 5% sooner ×2, airlines accept 2% more over list ×2, bad days forgiven sooner | cargo automation (warehouses handle 50% more), a third research slot |
| Resilience (pays off in the war) | repairs +10% ×2, burning fuel spreads less | hardened fuel farm (a part), dispersed stands, rapid runway repair (moved here from Logistics, same id) |

- **Exclusive forks**: two or three pairs at the ends of lanes rule each other out, for example "Quick turns" (turnaround −10%, for low-cost and regional airlines) against "Premium handling" (satisfaction +5, flag and foreign airlines accept 5% more over list). The node says before it starts what it closes, the closed one shows why, and nothing is ever lost that was already done.
- **Slots**: two at the start, a third from the Airlines lane's capstone, a fourth when Act II begins. The slot row shows the next slot and what opens it.
- **Costs**: real money against Act I's income, rising with depth (about ₭30M to ₭500M); check with `econtest.js` that a project competes with building, and that no lane's total pays for itself within a month.

**5. Words.** Every project has one or two plain sentences that say what it changes, in real units, and what it is good for ("Worth it if departures wait for fuel: the airport panel shows how long"). The idle-slot warning says what is open. The Guide gets a lesson on research in Chapter 1 (`IC.GUIDE`).

**6. The scripted player researches.** `careerplayer.js` keeps its slots busy with a simple policy (what its airports' warnings ask for, else the cheapest open), so the suite and `storytest.js` exercise the tree.

## Out of scope

The Ministry's agenda (49). New military projects and the military lanes' balance (they open in Act III as now, on the play clock). Night flights (already a per-airport curfew choice). Anything on the owner's rejected list in project memory (staff, slots, noise, retail, baggage, power).

## Done when

- A new Career shows the Research room on day one with the civil lanes, and every "Needs research" message leads to a project that can be started.
- `IC.mod` exists with its sources, words and caps; every `fx` key is read by the simulation and shown where the player reads that number; tests prove a few end to end ("refuelling research lets the trucks refuel more aircraft an hour", "exclusive projects rule each other out", "Wait does not finish research faster than play").
- About 45 civil projects with words; two or three exclusive forks; slots grow to four.
- `storytest.js` prints research started and finished by month; Act I still takes at least `IC.ACT1_MIN_MO` months, and CLAUDE.md's balance section says how research is paced.
- New tests have entries in `tests/times.json`; `npm test` is green; the eight Academy lessons complete; the step budget holds.
- Screenshots of the Research room in Act I and Act III (`node tools/shot.js`), opened and looked at.
