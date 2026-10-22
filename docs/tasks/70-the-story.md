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

## The story

### Premise and theme

You are the new Director of Civil Aviation of the Republic of {H}: a young, growing country whose sky airliners cross without landing. The neighbour, the {A}, is poorer, prouder, and depends on that same sky. Over about ten years you build the country's aviation, and then you have to defend it.

The theme in one line: **everything you build for people becomes something you must defend.** The airport that brings a town its jobs is the one that is shelled. The airway you open to the neighbour is the corridor their drones fly up. The friend you make across the border is the one who is arrested. The story never says this outright; the cards and their consequences make it plain.

Tone: grounded political drama, closer to Frostpunk and This War of Mine than to Ace Combat. People are reasonable and want different things. There are no villains in the peace, only interests. The war is terrible, and the game says what it costs in people as well as in ₭M.

### Who you are

You stay "you", the Director, named by nobody, but people know you and you have a history with them. The story is told by what they say to you, how they say it, and how that changes.

### The cast

Each person has a **trust** in you (0–100, `st.cast[key].trust`, starting from their own nature), a **portrait**, a **voice** (how they write), and an **arc** that bends with trust and flags. Trust shows on the Journal's People page as a word (cold, wary, neutral, warm, loyal), never as a number in the cards.

**At home**

- **Petra Halloran, Minister of Transport** (`MIN`). Your patron. She bet her career on the national airport before you were hired; the opposition calls it "Halloran's Folly" until it opens. Ambitious, quick, impatient with excuses, loyal to people who make her look good. Arc: she wants to be Prime Minister. Help her and she rises to Deputy Prime Minister by Act III and argues your case in cabinet (confidence losses softened). Cross her, or expose the favour she asks for (the airport in her home region, chain *Home soil*), and she falls in a scandal and is replaced by Treasury man **Aurel Finch**, who judges you only by the books.
- **Oren Valk, Prime Minister** (`PM`). Careful, decent, tired; he wants a peace he can win an election on. Arc: in Act III he must decide whether to prepare for war in the open; you advise him. If he trusts you he listens; if not, he waits until it is too late, or he prepares too loudly and gives the neighbour its excuse.
- **Lena Okafor, Head of Airports** (`APT`). Your deputy and the voice of the Guide: practical, dry, on your side. She explains how things work in her own words. Arc: in the war she runs the civil airports under fire. If an airport she is at is hit hard, she can be hurt; she comes back, or she does not, depending on the fire cover you built. The only character the game may kill, and only through what the player built.
- **Ivo Marsh, Chief Air Traffic Controller** (`ATC`). Thirty years in the tower, gruff, protects his people. His niece **Lise Marsh** is first officer on the regional airliner that hits the drone at the end of Act I. Arc: the union (chain *The tower*) and the inquiry (chain *The inquiry*); whether he trusts you decides how the controllers work in the war (sectors hold or crack under load).
- **Anja Tessel, Governor of the border region** (`GOV`). Speaks for the towns nearest {A}. Arc: chain *The border town*. Her town gets an airport and becomes a forward base and a target, or it does not and empties, and the neighbour's broadcasts use it.
- **Ruth Amberly, chief executive of {H} Airways** (`FLAG`, new). The flag carrier, proud and in debt. Arc: chain *The flag carrier*: protection, a bail-out, and in the war either its aircraft fly the government's evacuation or they have gone abroad with a foreign partner.
- **Sol Varga, aviation correspondent of The {H} Courier** (`PRESS`, new). Sceptical, fair, persistent. He writes the front pages between chapters (the newspaper card). Arc: chain *The press*. Give him access and he tells your side; stonewall him and he digs. His book about the war is the epilogue.
- **Gen. Mara Voss, Chief of Defence** (`CDS`). Thinks a civil servant has no business running air defence. Arc: from Act II, a rival who becomes an ally if you take the threat seriously early, or who goes over your head to the Prime Minister if you do not.
- The military staff (`ADA`, `INT`, `AIR`, `LOG`, `ENG`) stay as they are, with portraits, and speak in the war as now.

**Across the border**

- **Kasimir Lenz, Director of Civil Aviation of the {A}** (`LENZ`, new). Your opposite number: a career engineer, cultured, proud of his country, wants his airline to reach the world through your sky. The heart of the story. Act I: he proposes a shared airway and entry points on the border (Chapter 3, *The airspace*, now has a reason and a person). Act II: he writes privately that the drones are "not his people's doing" and asks you to keep the corridor open. Act III: depending on what you did, he is purged, he warns you of the attack, or he tries to get his family out (the defector chain). Act IV: if he is free and trusts you, he is the back channel for the ceasefire.
- **The neighbour's leadership**, drawn from the seed (`st.foe`), never shown as a menu:
  - **Marshal Dorn**, the army's man, who took power after a coup: wants a victory to keep the officers loyal.
  - **President Ilka Varenne**, a populist with an election to win: needs an enemy on the news every night.
  - **The Council**, hard-liners who share power uneasily with the moderates: decide by faction, and the player's choices tip the faction.
- **Their grievance** (`st.grievance`), also from the seed, and fed by what the player does:
  - **The corridor**: the {A}'s airline needs our sky to reach the world; our overflight charges and closed airways strangle it.
  - **The river**: the dam upstream and a drought; the {A} says our new towns take its water.
  - **The lost province**: an old map, a border drawn by others; the {A} claims the border region.

### How the story is told

- **Event cards with a face.** Every card shows who is speaking: portrait, name, role, and a line of trust when it changes ("Halloran will remember this"). Choices say what they cost now and what they risk later, in plain words (the "never a hidden trap" rule from brief 50).
- **Letters.** Some cards are letters: Lenz's private notes, a widow's letter after the war, Varga's questions. Same card, a paper look.
- **The front page.** At each chapter, at each act, and after the big beats, The {H} Courier's front page: masthead, date, a headline and two short paragraphs that reflect what the player did ("HALLORAN'S FOLLY OPENS ON TIME", or "THE AIRPORT THAT ISN'T: A YEAR LATE"). Headlines are written per outcome, not generic.
- **Voices in the feed.** The messages in the feed come from the cast in their own voice, so a goal explained by Okafor sounds like Okafor.
- **The People page** in the Journal: each person, their portrait, how they feel about you and the last thing they said.
- **The epilogue**: Varga's book, a paragraph per thread, at the end.

### The acts

**Act I — The Director (about 4–5 years).** Building something for people.
- Halloran has staked her name on the national airport; the Courier calls it her folly. Opening it is the first front page.
- The capital's airport: Amberly wants protection from foreign airlines (*The flag carrier* begins).
- The airspace: Lenz proposes the shared airway and the entry points on the border (*The corridor* begins). His charges against yours are a real choice: overflight income against his goodwill.
- Light aircraft: the clubs, small, warm; Okafor's chapter.
- A second city: Halloran asks you to pick her home region over the city that needs it (*Home soil*).
- The economy: Finch and the Treasury; Marsh's controllers ask for pay (*The tower* begins).
- The end of Act I: the collision. Lise Marsh's airliner hits a drone nobody saw. She lands it. The inquiry (*The inquiry*) asks who knew.

**Act II — Quiet Skies (2–3 years).** The sky is contested.
- Survey drones, jamming, shadowing: as now, but each one has a voice and a reaction. Lenz writes after each incident; Voss presses for the forward base; Varga asks questions.
- The defector (*Across the wire*): an aircraft from across the border asks to land.
- The dilemma (as now: the spy aircraft disguised as an airliner), with the cast's reactions to whatever you do.
- First blood, as now.

**Act III — The Shield (2 years).** The road to the war, one of three (see below), with its own beats. Valk asks whether to prepare in the open. The ally's offer (*The alliance*). Evacuations from the border region (Tessel). The eve.

**Act IV — The Storm.** The war, on the live clock, as now. The story keeps going in it: the cast reacts to what is hit and what holds (Okafor at a hit airport, Marsh's tower, Amberly's evacuation flights, Varga's dispatches, Lenz's back channel), in short cards and feed messages that never pause a raid. The end: an epilogue.

### The chains

Ten chains in the peace, each three to five cards paced by the play clock (as `deck.js` paces cards), opened by the seed and by flags, so a Career meets most of them but not all, and not in the same order. Each has two or three endings that set flags and trust, and most come back in the war.

1. **The flag carrier** (Amberly; Acts I–IV). Protection from foreign airlines (longer deals, fewer foreign offers) or open competition. Then fuel prices rise and she asks for a bail-out. Endings: *nationalised* (the Treasury pays; its aircraft fly the evacuation and the government's transport in the war), *partnered* (it merges with a foreign airline; its aircraft leave when the war comes, but fees and satisfaction are better in the peace), *bankrupt* (refused twice: its routes go to others; Amberly is cold).
2. **The corridor** (Lenz; Acts I–III). The shared airway: low charges and Lenz's goodwill, or full charges and income. Later he asks for night routes for his cargo airline ("medical supplies"), which is how the survey drones learn our airways. Endings: *friends* (Lenz trusts you, the grievance *corridor* cools), *business* (no favours either way), *closed* (you close the airway after the drones: income lost, the corridor grievance flares, Lenz is purged sooner).
3. **Home soil** (Halloran; Act I). She asks for the second city's airport in her home region rather than the city that needs it. Endings: *her region* (she owes you; the right city waits and its morale drops), *the right city* (she is cool, then forgets), *the press* (you tell Varga: she falls, Finch replaces her).
4. **The tower** (Marsh; Acts I–IV). The controllers' pay claim. Settle generously (costly; controllers loyal), settle hard (cheaper; a slowdown in Act II), or automate (research cost; fewer controllers, and in the war a jammed sector fails worse). In the war, a loyal tower works through raids; a bitter one walks out of a hit tower for a few hours.
5. **The inquiry** (Marsh, Lise Marsh, Varga; end of Act I into Act II). Who knew about the drones? Publish the radar gaps (embarrassing; the public backs the military radar budget, Act II grant up), bury it (Halloran is grateful; Varga digs it up a year later), or blame the airline (Amberly never forgives you).
6. **The border town** (Tessel; Acts I–IV). A town near the border wants an airport. Build it (it grows, then in Act III it is a forward base and a target), refuse (it empties; the neighbour's broadcasts use it), or build it small and civil only (it stays out of the war if you never put military aircraft there, and the enemy knows it).
7. **Across the wire** (Lenz, Voss, Valk; Act II). An aircraft from the {A} asks to land: a pilot with intelligence, and Lenz's cousin aboard. Take it in (intelligence on the enemy's sites in Act III, the war comes sooner and the grievance hardens), turn it back (the peace lasts longer; Voss is furious), or land it quietly and send the pilot home after (half of each, and Lenz knows what you did).
8. **The alliance** (Valk, Voss, an allied envoy; Act III). An ally offers radars and long-range missiles for a base at one of your airports. Accept (aid in the war through `S.support`, a foreign base the enemy names as its reason; the airport loses civil stands), refuse (no aid; the neighbour's moderates hold on longer), or ask for aid without a base (less aid, later).
9. **The press** (Varga; Acts I–IV). Interviews, leaks, an exposé. Access or stonewalling; whether you answer his questions about the drones, the inquiry, the base. In the war his dispatches move the Prime Minister's confidence by a few points either way.
10. **Winter fuel** (Finch or Halloran, Amberly; Act II or III). A fuel crisis: ration airline fuel (airlines suffer), buy at any price (money), or take the neighbour's offer of cheap fuel through the corridor (cheaper, and dependence that is cut off on the eve of war).

Optional, if time allows: a rival director from the Defence Ministry, an air show that goes wrong, the neighbour's election night.

### The roads to the war

The war always comes. What the player did decides **why** it comes, **when**, **how it opens**, and **who stands with you**. Three roads, picked from flags and the seed at the start of Act III (`st.road`):

- **The election** (likely with President Varenne, or the corridor grievance hot, or *closed*): the neighbour's leader needs a war to win. Act III beats: rallies on their news, our airline banned, a deadline, the vote. The war opens with **break morale** against cities (`E.aim`), at the usual pace.
- **The border incident** (likely if the player fired first, took the defector, or built the border town as a base): an incident escalates. Act III beats: shelling of the border town, a shot-down patrol, a hostage crisis at the border crossing. The war comes **sooner** (the act's timer shorter) and opens with **ground our air power** against air bases and radars.
- **The base** (likely if the player accepted the ally's base): the neighbour says it is defending itself. Act III beats: an ultimatum to remove the base, a blockade of the corridor, the envoy's visit. The war opens with **coerce the government** and a **slower** start (the commander saves longer for a bigger shock).
- If no road is clearly favoured, the seed's leader decides (Dorn: the incident, Varenne: the election, the Council: the base).

The road sets only the enemy's opening aim and pace (`E.aim`, `IC.enemyOpening`), never its strength: the war is still the player's to win. Friends follow the alliance: aid through `S.support` if accepted, less and later if aid without a base, none if refused; *nationalised* gives evacuation flights; Lenz's back channel (if he is free and trusts you) lowers the threshold for a ceasefire a little (`S.enemy.will` at 25 instead of 20), the one way a good peace shortens the war.

### The endings

At the end, Varga's book: a title page and a paragraph per thread (the airports, the airlines, the people, the neighbour, the war), each saying what the player chose, when, and what came of it. Then one of these closing pages:

- **The canopy held** (the enemy asks for a ceasefire): two variants, by whether the country stayed open (corridor *friends*, flag carrier alive, no foreign base) or became a fortress.
- **A ceasefire through Lenz** (the back channel brought it sooner).
- **Replaced** (dismissed, in peace or war): what you left behind, and who came after you.
- **The capital fell silent** (if the war is lost by the game's existing rules): what was lost.

## Goal

**1. The cast and their trust.** `IC.CAST` in `data.js` with each person's name, role, tag, voice notes, starting trust and portrait parameters; `IC.ADVISORS` keeps working (it reads from the cast). `st.cast[key] = { trust, last }`, `IC.castTrust(S, key, dv, why)`, trust words (`IC.trustWord`). Cards and feed messages from a cast member carry their key. Saved like the rest.

**2. Story flags.** `st.flags` (a Map) set by card answers, chains, passed agenda policies (49), research (48), 69's problems (`'pressure'`), and measured play (built five airports, kept charges low for a year, never fired first, let a city go unserved). Every flag has words (`IC.FLAG_WORDS`) for the Journal. `st.fired` and `st.doc.*` become flags.

**3. Chains.** `IC.CHAINS` in `chains.js`: the ten chains above, each a list of steps (`when(S)`, a card made by name like `EV`, options with `t`, `tip` (now) and `risk` (later), `fx`, and the next step), paced by the play clock and never two cards at once with the deck. Which chains are in a Career's pool comes from the seed and flags. A chain survives save and load mid-way.

**4. The neighbour.** `st.foe` (leader) and `st.grievance` drawn from the seed at the start of a Career. They show only through the story: Lenz's letters, the Courier, intelligence, the enemy's broadcasts.

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
