# v1.0 release QA: session A findings

The shell, save and load, the Career through Chapter 3, airports close in, the airspace editor, the Academy's text, and the release materials. Session B has the Quick war, the enemy, combat, 3D, the live view and the replay.

Severity: **blocker** (breaks play or looks broken), **ugly** (a stranger would notice and wince), **minor** (polish).
Screenshots are in `docs/qa/shots/`, taken with headless Chromium through `tools/shot.js`-style scripts with real mouse input.

| # | Where | What is wrong | Severity | Screenshot | Fixed? |
| --- | --- | --- | --- | --- | --- |
| 1 | Whole app | The app container could be scrolled sideways (a focused or scripted element outside the view pulled it): the left panels and the brand slid off-screen and a black strip showed on the right. | blocker | `01-before-app-scrolled.jpg` | Fixed: `.app` clips instead of hiding overflow, so nothing can scroll it |
| 2 | Top bar, 1280 and 1440 px wide | The right half of the top bar ran off the screen: Treasury cut in half, the Airspace row cut to "Cl", Weapons and Doctrine rows gone in Act III and the Quick war. | blocker | `02-before-topbar-1280.jpg`, `02-after-topbar-1280.jpg` | Fixed: below 1600 px no brand, no row labels (tooltips stay), tighter speed buttons, the role wraps to two lines |
| 3 | Career, first card and war messages | "Director of Civil Aviation of Republic of Kestria", "Next door, Drakhov Directorate has been quiet", "Varsk Federation has attacked": no article before country names. | ugly | – | Fixed in every message that names a country |
| 4 | Career, founding | The access-road card and toast called the new airport "Saldal Airport" while the panel called it "Saldal International": the story renamed it after the road was laid. | ugly | – | Fixed: the name is settled before anything mentions it |
| 5 | Airport panel, new site | A large empty dark box where the airport's plan will be drawn, before anything is built. | ugly | – | Fixed: no plan box until there is a part |
| 6 | Toasts, right side | In a busy game the toast stack ran down into the map layer buttons and the radar legend, text over text. | ugly | – | Fixed: toasts that would reach the map controls are not shown (the Journal keeps them) |
| 7 | Builder | The bottom help line was centred on the whole screen, so with the airport panel open it covered the build palette. The cost card beside the cursor ran under the panel. | ugly | – | Fixed: both keep to the visible map |
| 8 | Builder, materials | "out of concrete; build runway 1 waits": the work kept the runway's first name after it became Runway 09/27. | minor | – | Fixed |
| 9 | Founding | The access road was announced three times: two toasts saying the same thing and a card. | minor | – | Fixed: one toast and the card |
