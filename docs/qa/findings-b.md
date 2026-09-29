# Release QA, session B: findings

Quick war (start to day 2), raids and the Intel room, combat on the map, the air wing, supply and helicopters, the 3D
views, the Test range, the Academy. Played in headless Chromium through Playwright (1440×900 unless noted);
screenshots in `shots/qa/` (not committed; the PR carries the worst before and after).

Severity: **blocker** (breaks play), **ugly** (looks unfinished or confuses), **minor**.

| # | Where | What | Severity | Shot | Fixed? |
| --- | --- | --- | --- | --- | --- |
| 1 | Quick war, peacetime and war | The same pair of airliners was reported as "separation lost" and "near miss" again every 5 minutes while they stayed close (the pair's record was replaced each time controllers looked again, forgetting it had been reported). This is the near-miss spam. | ugly | b04-0707 | yes: reported once per pair (test added) |
| 2 | Near-miss card and toast | "passed 0.0 km apart and 0 ft above or below" | ugly | | yes: "passed 180 m apart at the same level"; metres under 1 km |
| 3 | Quick war | Near-miss cards ("The Prime Minister's office wants to know how it happened") during the war; separation-lost toasts stacked over the combat alerts | ugly | b04-0707 | yes: no near-miss card once the war starts; lost spacing goes to the log outside the Career |
| 4 | Quick war opening | The Tension card and the logistics officer still described the old start ("not on a war footing… thin magazines", "put a forward depot near the northern border") though the layers and the Forward Depot are already deployed | ugly | b02-qw-open | yes: the texts describe the defence as it starts |
| 5 | Combat, centre of the screen | The incident toasts (INTRUDER, WEAPONS RELEASED, NEAR MISS) and the alert pills (RAID IN PROGRESS, AIRLINERS ALOFT) were two stacks positioned independently: with two or more pills they ran over each other, text over text | ugly | b08, b13-alerts | yes: the incidents hang under the pills |
| 6 | Messages everywhere | "unidentified aircraft in our airspace near 109 km E of Ostec", "holding near 40 km N of…", "struck open ground Ostec", "crashed Ostec" | minor | b07 | yes: `IC.nearPlace` gives "near Ostec" or "109 km E of Ostec" |
| 7 | After-action card | "Opening strike on LOW-2 … 3 cruise missiles at Holitz International … They were after LOW-2 (air defence and radars)": a code the player may not know, and it read as if the hits contradicted the aim | minor | b11-sandbox | yes: "Their main target was LOW-2, a long-range search radar, in their push on air defence and radars." |
| 8 | Impact toasts | "Holitz International hit by TN 1060 LACM", "Undetected OWA struck open ground": codes | minor | b11-sandbox | yes: "hit by a subsonic cruise missile (TN 1060)", "An unseen one-way attack drone struck open ground near…" |
| 9 | Air wing, standing tasks | Patrols sent fighters that could not stay: from 750–1,060 km away they arrived with minus 39 min on station ("EN ROUTE · 0 s LEFT", "NO RELIEF: EMPTY IN 0 s"), and more were launched to cover for them. The sandbox's patrol over the capital and its early-warning orbit were both out of reach, so the sandbox air wing never covered anything | ugly | b14-cap | yes: a flight that cannot give 10 min on station is not sent; the label says "TOO FAR FROM OUR AIR BASES"; the sandbox patrol sits over the forward air base and SENTRY 1 flies from there |
| 10 | Quick war toasts | Career-flavoured lines toasted in a war: "taxi and rental cars opens by the terminal, built by private money", controllers overloaded, lost spacing | minor | b14-cap | yes: journal only outside the Career |
| 11 | Map labels close in, war | Patrol station labels, track tags and depot names drawn over each other near the capital | minor | b14-cap | not yet |
| 12 | Shell at 1280×720 | Top bar and rail run off / under the arsenal | ugly | b12-1280 | session A's (their #2) |
| 13 | Live view | The window opened over the inspector and the minimap (bottom right, 110 px up) | ugly | b15-live | yes: it opens on the open map, between the arsenal and the minimap, or above the minimap when the inspector is open |
| 14 | 3D chase camera | A fast jet ran away from its own chase camera: the camera eased after it in the world, so at 1,000 km/h it hung 40 m further back than meant, more in turns | ugly | qa3d/3d-fighter | yes: the chase eases in the frame of what it follows, and sits a fifth closer |
| 15 | Intel room | "SNT-1 · Sentinel · via ELINT", "via observation": jargon; "18 unlocated" above a list of 3 located sites | minor | b17-intel | yes: "its radar was heard", "seen from the border"; "3 found · 18 not yet" |
| 16 | ID toasts | "TN 1002 identified HOSTILE: Fighter-size jet (fighter-size jet recognised)" | minor | b20-range-fight | yes: the reason is left out when it repeats the class |
| 17 | Academy, lesson 1 (and 3, 4, 5, 6) | "Pick Longwave from the Arsenal" but the arsenal opens on Air defence; the radar is on another tab | ugly | b22-lesson1 | yes: a step that asks for something from the arsenal opens it on the right tab |
| 18 | Models gallery | Header: "Every model in 3D; down the side, from above and from the side inside the real size" | minor | qa3d/3d-gallery | yes: "Every model in the game, side by side at real size" |
| 19 | Replay, over a city | Ground texture is blurry at low altitude and a straight diagonal seam shows across the city | minor | b16-replay | not fixed: needs a detail texture for the replay ground (after the release) |
| 20 | Live view / replay full screen | The top bar's text peeks out in the 12 px margin round the full-screen window | minor | qa3d/3d-heli | not yet |
