# Iron Canopy: the lore and the twelve acts

The full draft, with the cast's secrets and the six endings, is the Claude Doc "Iron Canopy: the lore and the twelve acts" (https://claude.ai/artifact/HKLHXRYXyedNRtFJKwcuQM). This file keeps the facts the code depends on, so later work agrees with what is already in the game.

## The night of Northline 310

- The two countries were one, the Federation, until 32 years before Day 1. The **Iron Canopy** was the Federation's line of radars and missile batteries on the northern ridge, joined by one fire-control computer. **Station 9** sat on the ridge above the market town where the Director's sister Mira now keeps her bakery.
- 14 March, Year −34. An exercise drone, track number 310 in the computer, was due to fly into the range (the box). At 22:10 storms cancelled it; the battery was told, the computer was not.
- At 22:31 the Northern Area Centre cleared **Northline 310**, an airliner with 212 aboard, to turn north round the storm, after the military line said the range was cold. The controller was the Director's father, **Emil**. Beside him sat a trainee, **Ivo Marsh**.
- At 22:33 the computer showed TRACK 310 where the drone should be. The battery commander, **Lt. Taras Volkan**, asked for confirmation. The southern liaison officer, **Lt. Oren Valk** (now Prime Minister), answering a question about the storm, said "the box is hot". At 22:34 two missiles. Nobody survived. Pavel Lenz, Kasimir Lenz's brother, was the first officer.
- Each side kept its own room's tapes. The southern half proves a northern battery shot down a cleared airliner without warning (the south calls it *the Northline*). The northern half proves a southern officer confirmed the target (the north calls it *the Black Morning*). The partition followed, along the ridge: Station 9 and the wreck in the north, the town in the south. The allies, who sold the computer, fixed its fault quietly the next year.

## What the game shows now (lore.js)

- Twelve acts over the five parts of the Career (`IC.STORY_ACTS`; `IC.ACTS` are Part One to Part Five). The ceasefire no longer ends the Career: it opens Part Five, the peace (peace.js), with Acts X to XII (the armistice, the Ledger, the Commission).
- Clues: one minute of silence on every frequency at 22:34 each March; Kolar's Black Morning broadcast from Part Two; Marsh will not open Sector 9; the memorial's blank stone; Lenz's "For Pavel" postscript; Lise sees her collision was on 310's line; Mira: "Dad never drove us the north way"; every intercepted order ends "Confirm the box is hot", and the narrator says "I had never heard those words before" (a lie Act XI will correct). The prologue: Marsh "had known my father".
- Choices: the escort (Act IV; a quiet note through Lenz is what Moreva remembers), the tape (Act V), the border town on the eve (Act VII; kept open, Mira can be lost), the airliner in the box (Act IX: hold, call Lenz, or fire, which ends as Black Morning).

## Rules for later work

- The Director stays unnamed and ungendered. The narration is testimony given years later; who listens depends on the ending.
- Nobody did it alone, and the game never says so before Act XI.
- The airliner in Act IX is TU 3310, a neutral (Tessk Union) flight, 231 aboard.
- The father's name, Emil, is first said by Mira in Act X, at the blank stone: the town could not carve the controller's name and could not leave him out.
- The narrator's two lies, corrected in Act XI when both halves are heard: "the first time I had been north of the capital in thirty years" (the Director was born in the north and left at four), and "I had never heard those words before" (the father said "the box is hot" in his sleep).
- The Ledger (`S.story.ledger`): our half from Marsh's locker, the sealed room's log (the drone cancelled at 22:10, the battery told, the computer not), and their half (Lenz in Station 9's ruins if he is a friend, an unsigned parcel if not, and only by demanding it under the armistice if he was arrested). The halves disagree until both are heard.
- Endings after Part Five: the joint commission with both halves is the Open Sky, the joint commission with one half or a public release is Two Halves, sealing it again is the Iron Canopy; Black Morning (the airliner in the box shot down) overrides them all. Mira lost makes Ana the one at the stone; Lenz a friend stands beside the Director there.
