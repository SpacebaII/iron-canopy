# 70 The story: people who want something, choices that are remembered, a war that comes for reasons

Wave 18, with 69 (the gameplay and game-flow overhaul, the "pressures"). Stacked on #66 (49, the Ministry agenda, which carries 48), with `main` merged in. It replaces brief 50, which was written but never built: its flags, chains, roads to the war and the epilogue are all here, with the people to carry them.

Owns: a new `chains.js` (headless: story flags, the cast's trust, event chains, the roads to war, the epilogue), `IC.CAST` in `data.js` (beside `IC.ADVISORS`), `story.js`'s beats, `EV` cards, acts and the war's start (`beatsFor`, `EV`, `event`, `IC.storyChoose`, `startAct`'s beats and openers), `deck.js`, a new `render-portrait.js` (the cast's faces, drawn in code), the event card and the newspaper card in `ui.js` (`evcard` and a new `paper`), the Journal's story pages (`journal` in `warroom.js`), the enemy's opening aim and pace (`IC.enemyOpening` callers only), allied aid in `logistics.js`, and the scripted player's card answers in `careerplayer.js`.

Does not touch (69 owns them): `goalsFor`, `chapterGoals`, `startChapter`, `chapterTick`, `goalPaid`, `confidence`, `actOneTick`, `IC.storyChapterInfo`, `IC.storyShown`, `IC.storyTip`, `IC.guideFor`, `IC.storyDismissal`, `IC.CHAPTERS`, the goal lines in `IC.storyTick`, the goals panel, `campaign.js`, and the scripted player's build policy. Where the two meet: 69's problems name a cast key as `who`, call `IC.castTrust(S, key, dv)` when a problem is solved or failed, and emit `'pressure'` `{ id, outcome }`, which this brief turns into flags.

## What the owner said

> "Okay now I need a really extensive game flow overhaul okay it stills feels like a tech demo what is keep this from feeling 1 like a polished game and story and we look pretty good visually but the actual game play isn't good … we need this to feel a lot less bad in the sense of the game feels like do this do that and not an actual game."

Earlier (brief 50): "a much better story too, to have that Frostpunk / HOI4 type of decision making that is not always the same but has parts of the story that shape the player path."

## Where it stands

- The cast exists only as names on messages (`IC.ADVISORS`: Minister Petra Halloran, Prime Minister Oren Valk, General Mara Voss, Ivo Marsh, Lena Okafor, Governor Anja Tessel and the military staff). None of them wants anything of their own, none remembers you, and none changes.
- Goals are a checklist the Minister hands down. Nobody explains why they matter to anyone. That is the "do this, do that" feeling.
- About 40 decision cards (`EV` in `story.js`, 25 in `deck.js`). Each changes a number for a while; almost nothing is remembered (`st.fired`, `st.doc.cheapGuns`). Every Career meets the same beats in the same order.
- The neighbour is a name on the map. Nobody across the border has a face, a reason or a choice.
- The war comes because Act III's timer runs out. It ends with one line ("You held"), or with dismissal.

## What the owner said next (2026-10-22, answering the first draft's questions)

> "The tone should be grounded political drama but you are not a politician you are kinda just witnessing it and you'll have some choices but that's not your main job at all your choices matter occasionally and at varying amount but has to make sense and appear to make sense … You are just a regular director with a backstory and it's likely help to add some cut scenes to the story like maybe ai generated comic style framing action shots … the war cannot be avoided but there can be a ton of different ways this war cannot happen and look and escalate and de escalate that would effect timing and intensity etc. The enemy should have a cast … the intense and complex story is done through those cut scene action shots and likely told in past tense narrated by the main character, then the non cut scene pieces will likely be live commentary from characters for the most part might have some retrospective lines from the main character. I think multiple endings would be good … our characters need a lot of emotion … think of almost even Cry of Fear sort of commentary all the way towards being super positive we just need it to be shown how actually important this is"

So: the Director is a witness to a political drama, not a player in it. The job (airports, airspace, defence) is the play; the story happens around the player and through people, and the player's choices land now and then, sometimes small, sometimes huge, always for a reason the player can see.

## The story

### Premise and theme

You are the new Director of Civil Aviation of the Republic of {H}: a young, growing country whose sky airliners cross without landing. The neighbour, the {A}, is poorer, prouder, and depends on that same sky. Over about ten years you build the country's aviation, and then you have to defend it.

The theme in one line: **everything you build for people becomes something you must defend.** The airport that brings your home town its jobs is the one that is shelled. The airway you open to the neighbour is the corridor their drones fly up. The friend you made across the border is the one who is arrested. The story never says this outright; it shows it.

Tone: grounded political drama, seen from below. Ministers, generals and presidents decide; you hear about it in the corridor, on the phone at night, on the news. The emotional range is wide on purpose: dread and grief when the war comes (the bleakest lines should land like Cry of Fear's), warmth and pride in the peace and when something holds (a town at the fence for the first flight, controllers who stay at their scopes). References the owner named: Frostpunk, Banished, The Precinct, police stories.

### The narrator: you

You stay "you" on screen, but you have a past, and in the cutscenes you tell the story yourself, **in the first person and the past tense**, as someone looking back after the war ("I didn't know then that it was the last quiet summer").

- **Where you are from.** You grew up in {border town}, the town nearest the {A} border. Your sister **Mira** still lives there with her two children and runs the bakery on the square. She calls you when things happen up north, and her calls are the war coming closer.
- **What you carry.** You trained as an air traffic controller under **Ivo Marsh** at the old capital airfield. Fourteen years ago, on your night shift, a training jet and a light aircraft collided in the dark: the radar could not see the light aircraft. Two people died. Nobody blamed you, and you left the tower anyway. You became an engineer, then a planner. Halloran picked you because "you are the one who knows what a blind spot costs".
- **Who you knew.** Years ago, at an aviation conference abroad, you spent a night on a hotel roof talking about the future of flying with a young engineer from across the border: **Kasimir Lenz**. He is now their Director of Civil Aviation.
- The prologue cutscene tells this before the first card, so the Act I collision (a drone nobody's radar could see) is your old nightmare coming back.

### How the story is told

1. **Cutscenes, the story's spine.** Full-screen comic pages between stretches of play: four to eight framed panels, each with a narration caption in your voice (past tense), and sometimes a line of dialogue in a balloon. About fifteen in a Career (see the list below), several with variants that follow what happened. The game pauses; a click turns the panel; Esc skips the whole cutscene, and the Journal keeps every cutscene seen so it can be watched again.
2. **Live commentary.** Between cutscenes the characters talk in the feed as things happen, in their own voices: Okafor on the airports, Marsh on the tower, Varga's headlines, Mira's calls from up north, the enemy's broadcasts and intercepted orders. This is where most of the story is, line by line.
3. **Your own lines, now and then.** A short retrospective line in italics in the feed at the right moment ("I remember that morning. The fog lifted at ten, and the first one came in at ten past.").
4. **Choices, occasionally.** A decision card comes when the story genuinely asks something of you, roughly once every year of the calendar in the peace and a handful of times in the war, never as filler. Each says what it costs now and what it risks later. Some are small (an interview), some change the war (a defector, a foreign base). The deck's small peacetime cards stay as they are (they are the job).
5. **The Courier's front pages** at the turning points, headlines that follow what happened.
6. **The People page** and **Your story** in the Journal; the **epilogue** at the end.

### The cast at home

Each has a portrait, a voice, a trust in you that moves with what happens (shown as a word on the People page, never as a number in a card), and an arc.

- **Petra Halloran, Minister of Transport.** Your patron, who staked her career on the national airport ("Halloran's Folly"). Ambitious and warm with people who make her look good. She wants to be Prime Minister. If she trusts you she rises and shields you in cabinet; if she falls (the *Home soil* chain), Treasury man **Aurel Finch** takes her place.
- **Oren Valk, Prime Minister.** Careful, decent, tired. In Act III he must decide how openly to prepare for war; you are in the room, not at the table.
- **Lena Okafor, Head of Airports.** Your deputy and friend; dry humour; the voice of the Guide. In the war she runs the airports under fire. If a missile hits an airport she is at and there is no fire crew to reach her, she is hurt; her absence is felt in the feed. The only one of your people the game may hurt, and only through what you built.
- **Ivo Marsh, Chief Air Traffic Controller.** Your old mentor. Calls you "kid" in private. Thirty years in the tower; protective of his people. His niece **Lise Marsh** is the first officer on the airliner the drone hits at the end of Act I.
- **Mira**, your sister, in {border town}. The story's heart at home: phone calls about the drones she hears at night, the shelling, whether to leave. Her fate in the war depends on what was built up north (an airport that can fly people out, air defence over the town) and on luck the player can see coming.
- **Anja Tessel, Governor of the border region.** Speaks for the north.
- **Ruth Amberly, chief executive of {H} Airways.** The flag carrier: proud, in debt.
- **Sol Varga, the Courier's aviation correspondent.** Writes the front pages; his book about the war is the epilogue.
- **Gen. Mara Voss, Chief of Defence.** Thinks a civil servant has no business near air defence, until you prove otherwise.
- **Karl Ostrow** at the Treasury, **Ambassador Clare Whitlow** for our allies, and the military staff as now.

### The cast across the border

The enemy has faces. The player meets them through letters, intercepts, broadcasts and the news, and in cutscenes.

- **Kasimir Lenz, their Director of Civil Aviation.** Your old acquaintance from the rooftop. Cultured, proud, wants his airline to reach the world. Writes to you through the peace. Purged, silent, or the back channel for the ceasefire, depending on how he came to see you.
- **The leader**, drawn from the seed: **Marshal Dorn** (the army's man, after a coup), **President Ilka Varenne** (a populist with an election to win), or **Chair Sefa Oran of the Council** (hard-liners and moderates in an uneasy coalition). Heard in speeches and broadcasts.
- **Gen. Taras Volkan, their air force commander.** Cold and professional. His orders, intercepted, are the voice of the raids ("Second wave holds until their batteries have fired"). The enemy commander's aims and acts (`enemy.js`) are his.
- **Capt. Ilya Moreva, a fighter pilot.** He shadows our airliners in Act II, close enough that passengers photograph him waving. In the war he flies the raids. If he is shot down over our country, the letter to his daughter found in the wreck is one of the war's cutscenes.
- **Vesna Kolar, state television.** Their news, in her voice, between acts and in the war: the propaganda the player hears through Intelligence.

### The cutscenes

Each is a short page sequence; the ones marked with a variant change with what happened. Panels are described here as shots, for the art.

| When | Cutscene | Variants |
| --- | --- | --- |
| Before the first card | **The blind spot.** The tower at night fourteen years ago, the radar showing nothing, the fireball; you at the window; the empty chair after; Halloran's call years later. | — |
| The first airliner lands | **First light.** Dawn, the terminal, the crowd at the fence; Halloran beside you; Okafor's grin; the wheels touching. | on time or late |
| End of Act I | **Nothing on the scope.** Lise's airliner, the drone's shape in the cloud, the bang; the cockpit; the ops room; Marsh's face; your hands; "it was the same blank screen". | — |
| Act II, the shadowing | **Close enough to wave.** Moreva's fighter off an airliner's wing; a child at the window; the photo in the next day's paper. | — |
| Act II, the defector (if the chain runs) | **Across the wire.** Night, a transport low over the border, the runway lights coming on for it, or going off. | land, turn back, half |
| End of Act II | **First blood.** | we fired first, or they did |
| Act III, the road | **The road to war**, one of three: Varenne's rally, the shelling of {border town}, or the ultimatum over the base. | three roads |
| Act III, Mira's call | **The north empties.** Cars on the road south, or a queue at the little airport for the last flights; Mira's voice. | airport up north or not |
| The eve | **The last quiet night.** Satellite photos, the cabinet room, Valk alone, you on the roof of the ministry looking north. | — |
| Act IV begins | **The first night.** Sirens, the first launches, the sky over the capital. | by the road |
| In the war | **A letter in the wreck** (Moreva shot down), **The airport burns** (an airport you built hit hard), **They held** (the first raid fully stopped). | — |
| The end | One of the endings below. | — |

The gameplay thread (69) may also call: `firstLanding`, `crash` (a fatal accident, with its cause), `sacked`, `review`.

### The chains (fewer choices, more to witness)

The ten chains of the first draft stay, but each now has at most two decision cards; the rest of each chain is witnessed in commentary and cutscenes. Act I: the flag carrier, the corridor (Lenz's letter), home soil, the tower. Act II: the inquiry, the border town, the defector, winter fuel, the press. Act III: the alliance. Which ones a Career meets comes from the seed (the core four always) and what has happened.

### The war: unavoidable, but never the same

The war always comes. How it comes, when, how hard and how it turns follow what happened, through four levers:

- **The road** (why it comes): the election, the border incident, or the base, picked from flags at the start of Act III. Each has its own Act III beats and cutscene, and sets the enemy's opening aim.
- **Escalation** (`S.tension` and the story's heat): fired first, defectors taken, airways closed, a base accepted push it up; restraint, low charges, kept promises push it down. High escalation brings the war sooner (Act III's timer shorter, by up to a third) and harder (the enemy's stock at the start larger, up to +25%); low, later and lighter (down to −20%).
- **De-escalation in the war**: a friend across the border (Lenz) opens a back channel, so a ceasefire comes at a higher enemy will (25 instead of 20); the base road ends harder (a ceasefire needs 15).
- **Friends**: allied aid follows the alliance.

The war is still the player's to win: the levers change timing and intensity within bounds, never the outcome.

### The endings

Varga's book closes the Career: the paragraph per thread as before, then one of these, each with its own cutscene and an emotional register from devastating to hopeful.

- **Through the back channel**: Lenz carries the first message; a ceasefire comes early; the last panel is a handshake on a runway at the border.
- **The canopy held, open**: we won and stayed the country we were; the first airliner back, the crowd at the fence again.
- **The canopy held, at a price**: we won, but {border town} burned, or Okafor or Mira was lost; the last panel is a quiet one.
- **A fortress**: we won by becoming harder, with foreign soldiers at our airports and nobody across the border to call.
- **Replaced**: the Prime Minister lost faith; someone else finishes it; you watch from home.
- **The sky fell silent**: the war is lost; what was built is what the country will rebuild from.

Which closing, and its tone, comes from the war's result, Mira's and Okafor's fate, the flags, and who still trusts you.

## Goal

**1. The cast and their trust.** `IC.CAST` in `data.js` with each person's name, role, tag, voice notes, starting trust and portrait parameters; `IC.ADVISORS` keeps working (it reads from the cast). `st.cast[key] = { trust, last }`, `IC.castTrust(S, key, dv, why)`, trust words (`IC.trustWord`). Cards and feed messages from a cast member carry their key. Saved like the rest.

**2. Story flags.** `st.flags` (a Map) set by card answers, chains, passed agenda policies (49), research (48), 69's problems (`'pressure'`), and measured play (built five airports, kept charges low for a year, never fired first, let a city go unserved). Every flag has words (`IC.FLAG_WORDS`) for the Journal. `st.fired` and `st.doc.*` become flags.

**3. Chains.** `IC.CHAINS` in `chains.js`: the ten chains above, each a list of steps (`when(S)`, a card made by name like `EV`, options with `t`, `tip` (now) and `risk` (later), `fx`, and the next step), paced by the play clock and never two cards at once with the deck. Which chains are in a Career's pool comes from the seed and flags. A chain survives save and load mid-way.

**4. The neighbour.** `st.foe` (leader) and `st.grievance` drawn from the seed at the start of a Career. They show only through the story: Lenz's letters, the Courier, intelligence, the enemy's broadcasts.

**4b. Cutscenes.** `IC.CUTSCENES` (headless data: panels with a shot description for the art, a narration caption, an optional line of dialogue, variants by flag), `IC.cutscene(S, id, data)` queues one, a full-screen comic viewer pauses the game and shows it, the Journal lists those seen. Art per panel from `iron-canopy/art/cut/` when it exists, else a stand-in drawn in code.

**4c. The narrator and the enemy's cast.** Your backstory, Mira, and retrospective lines in the feed; Lenz, the leader, Volkan, Moreva and Kolar, each with a portrait and a voice in intercepts and broadcasts.

**4d. Escalation.** The war's timing and intensity from tension and heat, within the bounds above.

**5. Faces and paper.** `render-portrait.js`: each cast member's portrait drawn in code (a bust in flat colours, with a consistent house style: head, hair, glasses, collar or uniform, a background tone per side), cached as an image per person and size. The event card shows the portrait; the newspaper card (`paper` kind) shows the Courier's front page. The People page. All of it readable at 15 px base and in both themes.

**6. Act beats with people.** Every act opener, chapter opener and big beat rewritten in a cast member's voice, with a front page where it fits. Act II and III beats get reactions. Act IV gets the war's story cards (short, never pausing a raid by default).

**7. Roads to the war.** `st.road` picked at the start of Act III, its Act III beats, the opening aim and pace, allied aid by alliance.

**8. The epilogue and "Your story".** The Journal's Your story page during play (chains met, choices, flags in words, with dates) and the epilogue at the end of the Career.

**9. The scripted player and tests.**
- `careerplayer.js` answers cards by a preference a test can change (`careful`, `bold`, `open`, `fortress`).
- `storytest.js` prints flags, trust and chains by month, and which road led to war.
- Tests: two Careers with the same seed and different answers take different roads to war; a flag set in Act I changes an Act III beat; a chain survives save and load mid-way; every card option has a `tip` and every chain option a `risk`; every cast member has a portrait and words; the epilogue names at least one choice per thread.

## Out of scope

The goals, chapter gates, pacing and economy (69); new military systems; the enemy commander's raids and balance beyond its opening aim and pace; the Quick war and the Academy (unchanged; the eight lessons must stay completable); voice acting. Anything on the owner's rejected list in project memory.

## Done when

- The cast has faces and trust, cards show who speaks, and the ten chains run in the peace with branching endings that come back later.
- Three roads to the war, chosen by flags, each with its own Act III beats, setting the enemy's opening aim and pace; allied aid follows the alliance.
- Two Careers with the same seed and different choices visibly diverge (`storytest.js` output for both in the PR).
- The front page, the People page, Your story and the epilogue exist and have been looked at in screenshots.
- Act I still takes at least `IC.ACT1_MIN_MO` months; CLAUDE.md describes the cast, flags, chains and roads to war.
- New tests have entries in `tests/times.json`; `npm test` is green; the eight Academy lessons complete.
