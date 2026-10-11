# 50 A story that branches: choices that shape the Career, different every time

Wave 15, last: start once 48 and 49 have merged, from `origin/main`. It reads the agenda's passed policies (49) and research (48) as story flags. Owns `story.js` (beats, `EV` cards, acts, the war's start), `deck.js`, a new `chains.js` (headless: story flags, event chains, the epilogue), the Journal's story pages (`journal` in `warroom.js`, nothing else there), the hooks it needs in `enemy.js` (the commander's opening aim and pace only) and `logistics.js` (allied aid only), and the scripted player's choices in `careerplayer.js`.

## What the owner said

> "you might want to also start like a much better story too, to have that Frostpunk / HOI4 type of decision making that is not always the same but has parts of the story that shape the player path."

## Where it stands (read against `main` at #59)

The Career's story is one line. Each act's beats come in a fixed order (`beatsFor`, `story.js:767`): Act I's chapters, Act II's survey drones, jamming, shadowing, airport drones, the dilemma, first blood (`story.js:898`, `story.js:934`), Act III's rising gray zone, the embassy, the massing, the war. Decisions are cards with two or three answers (`EV`, `story.js:381`, and the 25 peacetime cards in `deck.js:227`), but almost none of them is remembered: the only lasting flags are `st.fired` (who fired first) and `st.doc.cheapGuns`. Two players see the same story in the same order, and what they chose changes a number for a while, not the road ahead.

## What Frostpunk and HOI4 do that we take

- **Choices are remembered and come back.** A promise made in Act I is called in years later; a shortcut has a price that arrives when it hurts.
- **Event chains.** One card opens the next: a strike leads to arbitration, then a new contract or a lockout. Each chain has two or three endings.
- **The big beats branch.** HOI4's world goes a different way depending on what you did; the war comes for different reasons, at a different pace, with different friends.
- **Not the same every time.** Which chains appear, who the neighbour's leadership is and what they want vary with the seed and with the player.
- **A reckoning.** Frostpunk ends by telling you what you did and what it cost. The Career should too.

## Goal

**1. Story flags.** One place for what the story remembers: `st.flags` (a Map of name to value), set by card answers, passed agenda policies (49), research (48), and by measured play (the player built five airports, kept charges low for a year, let a city go unserved, never fired first). Every flag has a plain sentence (`IC.FLAG_WORDS`) for the Journal. Old one-off flags (`st.fired`, `st.doc.cheapGuns`) become flags. Saved like the rest (`IC.remake` for anything with behaviour).

**2. Event chains.** About ten chains of three to five cards over the peace (Acts I–III), each paced by the play clock (`S.story.play`, as `deck.js` paces cards), each with two or three endings that set flags. Examples, on the aviation and national side:
- **The flag carrier.** Its chief executive asks for protection from foreign airlines. Help it, and later it asks for a bail-out when fuel prices rise, then flies the government's transport in the war. Refuse, and it merges with a foreign airline and its aircraft leave when the war comes.
- **The border town.** A city near the border wants an airport. Build it, and it becomes a forward base and a target. Refuse, and its people leave, and the enemy's propaganda uses it.
- **The defector pilot.** In Act II an aircraft from across the border asks to land. Taking it in brings intelligence and a diplomatic crisis; turning it away keeps the peace a while longer.
- **The allied deal.** An ally offers radars and long-range missiles for landing rights. Accepting brings aid in the war (`S.support`) and a foreign base the enemy names as a reason.
- **The union.** Controllers strike over pay. Settle generously, break the strike, or automate; each changes how the sectors work later.
- Plus chains about the Minister's rival, the press, the neighbour's elections, a fuel crisis, and an aviation accident's inquiry.
Each chain says before every choice what it costs now and what it risks, in plain words; never a hidden trap. Which chains appear in a Career depends on the seed and on flags, so two Careers differ.

**3. The big beats branch.** The main plot keeps its four acts and the player's rise, but how it gets there depends on flags:
- **Why and how the war comes.** At least three roads to Act IV, each with its own Act III beats: the neighbour's hard-liners win an election; a border incident escalates (sooner if the player fired first or took the defector); a crisis over the allied base. The road sets the enemy commander's opening aim and pace (`E.aim`, `IC.enemyOpening`), not its strength: the war is still the player's to win.
- **Friends.** Allied aid in the war (`S.support`, `logistics.js`) follows the alliances the player made or refused.
- **The home front.** What the Minister and the Prime Minister expect, and what costs their confidence, follows the agenda and the chains (a "Civil first" Career is judged harder for losses at airports).
- Keep the player deciding: nothing scripts a battle's outcome, and peacetime weapons stay on Hold.

**4. Not the same every time.** At the start of a Career, draw from the seed: the neighbour's leadership and its grievance (two or three kinds), which chains are in the pool, and the order of Act II's incidents. Show it to the player only through the story, never as a menu.

**5. The reckoning.** When the Career ends (won, lost or dismissed), an epilogue in the Journal: a short paragraph per thread of the story (the airlines, the cities, the alliance, the war), each saying what the player chose and what came of it, with the dates. The Journal gets a "Your story" page during play too: the chains seen, their choices, and the flags in words.

**6. The scripted player and tests.**
- `careerplayer.js` answers cards by a preference a test can change.
- `storytest.js` prints the flags and chains by month and which road led to war.
- Tests: two Careers with the same seed and different answers take different roads to war; a flag set in Act I changes an Act III beat; a chain survives save and load mid-way; every card answer says what it costs and risks.

## Out of scope

New military systems; the enemy commander's raids and balance beyond its opening aim and pace; the Quick war and the Academy (unchanged; the eight lessons must stay completable); the research tree and the agenda (48, 49), except reading them as flags. Anything on the owner's rejected list in project memory.

## Done when

- The story's lasting choices live in `st.flags`, each with words, and at least ten chains run in the peace with branching endings.
- At least three roads to the war, chosen by flags, each with its own Act III beats, setting the enemy's opening aim and pace; allied aid follows alliances.
- Two Careers with the same seed and different choices visibly diverge (`storytest.js` output for both is in the PR).
- The epilogue and the "Your story" page show what was chosen and what came of it.
- Act I still takes at least `IC.ACT1_MIN_MO` months; CLAUDE.md's code map and balance section describe the flags, chains and roads to war.
- New tests have entries in `tests/times.json`; `npm test` is green; the eight Academy lessons complete.
- Screenshots of a chain's card, the "Your story" page and an epilogue, opened and looked at.
