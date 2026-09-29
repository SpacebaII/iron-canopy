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
