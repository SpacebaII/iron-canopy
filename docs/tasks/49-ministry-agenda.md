# 49 The Ministry's agenda: a national focus track for the Career

Wave 15, with 48 (the research tree). Owns a new `agenda.js` (headless: the agenda's data and rules), the Career room (`staff()` in `warroom.js`, nothing else there), the agenda's hooks in `story.js` (separate from 48's `IC.roomAllowed` change), the agenda policy in `careerplayer.js` (beside 48's research policy), and the reads of any effect that is not an `IC.mod` key. It uses 48's `IC.mod` and `IC.MOD_SRC`: start from 48's branch once 48 has pushed that commit, and stack the PR on 48's. `IC.FOCUS` is already taken (round flags in `core.js`); use `IC.AGENDA`.

## What the owner said

> "we should really try to match a Frostpunk HOI4 type of deal"

He chose to build the focus track in the same wave as the research tree, after being told it is a second layer next to research: one policy at a time, on a timer, with branches that rule each other out.

## Goal

The Director puts one policy at a time to the Minister, as HOI4's national focus and Frostpunk's Book of Laws do. While it passes, the next is chosen; once passed it stays. Over a Career the choices shape what kind of country's aviation the player built, and what it brings to the war.

**1. The track.**
- One policy at a time, in the Career only (Acts I–III; Act IV keeps whatever was passed). Each takes real minutes of play on the same play clock as 48's research (`S.story.play`): about 5 to 12 minutes. The agenda's slot sits in the Career room (C) and on the rail with the idle dot, like research.
- A policy may need earlier ones (`req`), a state of the game (`need`: two airports, 6,000 passengers a day, the Minister at 50 or more), and an act. A few pairs rule each other out (`excl`). The tree shows each before it starts: what it needs, what it gives, what it closes.
- Starting one may cost money or the Minister's confidence (`S.story.standing`), and some pay back. A policy cannot be cancelled once started; one in progress can be swapped only by losing its progress.
- Saved by id (`S.story.agenda = { done, cur, closed }`); passed policies survive save and load like research does.

**2. What policies do.** Only things the game already has:
- shares through `IC.mod` (push a source onto `IC.MOD_SRC` with each passed policy and its name as `why`, so panels say "+5% from Open skies"), using the keys 48 wires;
- the Minister's confidence, the grant, one-off Ministry money (booked with `IC.pay` / `IC.econBook` as `bonus`);
- airline offers: which kinds come, how long deals run (`IC.DEAL`), flag-carrier terms;
- opening something sooner than its chapter would (`IC.storyLock` keys such as loans or roads), with the chapter's text saying so;
- what the war acts hand over or demand: the Act III air defence's cost, how the enemy's gray-zone pressure is met, whether civil airports carry military traffic.

**3. About 30 policies over three acts.** Examples, to keep the spirit; all on the aviation and national side:
- **Act I, aviation policy.** "Open skies" (foreign and low-cost offers come sooner, the flag carrier's satisfaction drifts down) against "Protect the flag carrier" (its deals run longer and pay list, fewer foreign offers). "Build to last" (pavement and buildings last longer, works cost more) against "Build fast" (stages quicker, wear faster). "One great hub" (the capital's charges accepted higher) against "A regional network" (a second city asks for an airport sooner, regional airlines' offers).
- **Act II, the country notices.** "Airspace reform" (a controller handles more flights, area sectors cheaper), "Aviation academy" (crosswind limits, fewer incidents), "Civil–military dual use" (the Act III air defence costs less to run, airports take military traffic, a small airline penalty) against "Civil first" (charges and satisfaction up, the military hands over less in Act III).
- **Act III, before the war.** "Harden the airports" (repairs faster, fuel spread smaller, Ministry money for shelters), "Civil reserve air fleet" (airlines' aircraft fly transport in the war), "Keep the airlines flying" (the Prime Minister's morale holds better while airports stay open) against "Close the skies early" (fewer incidents, airline income falls).
- Exclusive pairs should both be good in different games: test that the scripted player can finish Act I on either side of each.

**4. Words and the room.** The Career room gets the agenda as a tree laid out like the Research room (columns by act, lines between steps, exclusive pairs joined by a dashed "or"), each node in plain sentences with real units. Passing a policy is a log line and a short card in the Minister's voice: what it changes from today. The Guide gets a lesson on the agenda in Chapter 1.

**5. The scripted player.** `careerplayer.js` keeps the agenda busy with a fixed preference (a test can pass another), so the suite and `storytest.js` exercise it.

## Out of scope

The research tree and `IC.mod` itself (48). New economy layers the owner turned down (staff, slots, noise, retail, baggage, power: see project memory). Act IV policies. Quick war.

## Done when

- A new Career shows the agenda in the Career room on day one; one policy passes in a few minutes of play and changes what the panels say.
- About 30 policies over Acts I–III, three or four exclusive pairs; every effect is either an `IC.mod` key with words or a named change with a test.
- Tests: "a passed policy's share shows in the airport panel", "an exclusive pair rules the other out", "a policy survives save and load", "Wait does not pass a policy faster than play", and the scripted player finishes Act I on both sides of each Act I pair.
- `storytest.js` prints each policy passed by month; Act I still takes at least `IC.ACT1_MIN_MO` months; CLAUDE.md gets `agenda.js` in the code map and the agenda's pace in the balance section.
- New tests have entries in `tests/times.json`; `npm test` is green; the eight Academy lessons complete.
- Screenshots of the Career room's agenda in Acts I and III, opened and looked at.
