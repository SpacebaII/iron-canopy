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
| 6 | Toasts, right side | In a busy game the toast stack ran down into the map layer buttons and the radar legend, text over text. | ugly | `08-before-toasts.jpg` | Fixed: toasts that would reach the map controls are not shown (the Journal keeps them) |
| 7 | Builder | The bottom help line was centred on the whole screen, so with the airport panel open it covered the build palette. The cost card beside the cursor ran under the panel. | ugly | `03-before-builder-help.jpg`, `03-after-builder-help.jpg` | Fixed: both keep to the visible map |
| 8 | Builder, materials | "out of concrete; build runway 1 waits": the work kept the runway's first name after it became Runway 09/27. | minor | – | Fixed |
| 9 | Founding | The access road was announced three times: two toasts saying the same thing and a card. | minor | – | Fixed: one toast and the card |
| 10 | Airport panel | **Crash:** selecting an airport whose runway is built but closed (works, wear, a crater) threw "ap is not defined" every refresh, and the panel stopped updating. On main before this pass. | blocker | – | Fixed; `npm run lint` (ESLint's undefined-name rule) now catches this kind |
| 11 | Map, any panel | Dragging on the map (an airspace handle, a box) selected the text of the panels it passed over, in blue. | ugly | `04-before-drag-selects-text.jpg` | Fixed: a drag that starts on the map selects nothing |
| 12 | Journal, Works | "landing system (ils) complete": part names were lower-cased whole. | minor | – | Fixed: abbreviations keep their capitals |
| 13 | Aviation room, Deals | "1691.2 h left" on a contract. | ugly | `07-before-deal-hours.jpg`, `07-after-deal-months.jpg` | Fixed: the Career says "16 months left"; any duration over three days reads in days |
| 14 | Runways | Named "Runway 26/08" when drawn west to east; charts put the lower number first. | minor | – | Fixed: "Runway 08/26" |
| 15 | Start screen, Settings and Controls | The cards were cut off at the bottom of a 900 px screen, inside a box with its own thin scrollbar. | ugly | `05-before-settings-clipped.jpg`, `05-after-settings.jpg` | Fixed: the page scrolls as a whole |
| 16 | Journal | The date column wrapped "Jan Y1 · 07:00" onto three lines. | ugly | – | Fixed |
| 17 | Career tips | "press Wait (W)": the key is 7 (W is a unit's weapons). | ugly | – | Fixed |
| 18 | Economy room, Chapter 1 | "Airline fees +₭4M" before any airport existed: it was overflight fees. | minor | – | Fixed: called overflight fees until an airport earns landing fees |
| 19 | Academy | Lesson 3 said "Shoot-look-shoot … Conserve" but the buttons read Look, Salvo, Save; "Layered Defense" and "Air war room". | minor | – | Fixed |
| 20 | Whole game | "defense" in eight places, "defence" in sixty. | minor | – | Fixed; the text lint now rejects American spellings |
| 21 | Saves between browsers | A save made in one browser engine may not load in another: the map is regenerated from its seed, and engines differ in the last digit of some maths, so the map fingerprint differs ("made with a different version of the map generator"). Node and Chromium already differ. | minor (known issue) | – | Not fixed: needs engine-independent maths in the generator. Listed in the known issues; the export text no longer promises "another browser" |
| 22 | Test range, Airspace tab | Form fields were the browser's white boxes on the dark interface. | ugly | `06-before-range-forms.jpg`, `06-after-range-forms.jpg` | Fixed: every input and select in the game's colours |
| 23 | Test range | An empty black minimap in the corner (the range has no map to show). | minor | `06-before-range-forms.jpg` | Fixed: no minimap on the range |
| 24 | New game after another | The previous game's cursor tip ("Right-click: take the last point back") stayed on screen. | minor | `06-after-range-forms.jpg` (taken before this fix) | Fixed |
| 25 | 1280 × 720 | The goals panel was squeezed to two lines under a tall staff message, above the arsenal. | ugly | – | Fixed: on short screens the staff message is smaller and the column longer |
| 26 | Builder | The help line at the bottom repeats the cost line of the card beside the cursor. | minor | `03-after-builder-help.jpg` | Left: harmless, both are right |
| 27 | Top bar | The treasury's hourly change read "−0/h" when it rounded to nothing. | minor | – | Fixed |
| 28 | Wait chooser | The speed buttons' key hints (Space, 1–6, S, 7) showed through the top of the Wait list while the mouse was over it. | ugly | – | Fixed |
| 29 | Map, close in | After a jump across the map (the minimap, Capital) the ground tiles paint in patches for a few seconds in a software-rendered browser. | minor | – | Left: tiles paint on demand by design; on a real GPU it is well under a second. Measure on the owner's laptop |
| 30 | Map, airport | A light aircraft's data tag can sit on top of the runway's "08 ARR/DEP" label. | minor | – | Left: labels do not avoid each other yet |
| 31 | Cards over rooms (Quick war, coordinator's "text over text") | A card that opened while the player read a room (Journal, say) sat on top of the room's text. | ugly | – | Fixed: a room opened over a card puts it away until the room closes |
| 32 | Near-miss cards (coordinator's smoke run) | In a busy sky every near miss opened a card, one after another; the text read "passed 0.0 km apart and 0 ft above or below". | ugly | – | Fixed: one card in six hours (the Journal and incident list keep every one); "within 100 m at the same height" |
| 33 | Airport landside | "offices opens by the terminal". | minor | – | Fixed |

## Automated checks added

- `npm run lint`: names used but never defined (it would have caught #10).
- `node tools/textlint.js`: every string in the source, and every log line, card, staff message and news item written by a 90-hour Career and a 10-hour Quick war, checked for "undefined", "NaN", "[object Object]", "1 minutes", doubled spaces, repeated words, "aircrafts" and American spellings. The source part and a short play run in `npm test`.
- `node tools/smoke.js`: every mode played in Chromium with real clicks (founding and the first runway by mouse, every room, save, quit and Continue, a Quick war into the war, all eight lessons, the range, the sandbox); fails on page errors or broken text on screen. Clean in about eight minutes.
- `npm run qa` runs all three.

## Minor ones left

- #21: saves across browser engines.
- The cursor card and the help line in the builder say the same thing twice (#26).
- The side view's axis labels are small at 1280 px.

## Final pass before v1.0 (after QA sessions A and B, the 3D rebuild and aircraft variety)

Played the new aircraft at the airports close in and in 3D (the business side, light-aircraft fields, rare visitors in
flight), made the store screenshots and the clip, and ran `npm run qa` on the merged main (clean, smoke 605 s).

| # | Where | What | Severity | Fixed? |
| --- | --- | --- | --- | --- |
| F1 | Replay and live view | A frame-rate readout ("2 fps · 8 objects · 50.9 ms") in the corner of every 3D view: debug text | ugly | Fixed: shows only with `#debug` on the address |
| F2 | Builder | Hovering the airport while placing points put its hover card ("Morice International · Runway open · 11/36 stands · 1 problems · Right-click: take the last point back") over the builder's own card and the snapping guide's labels | ugly | Fixed: no hover card while building (the help line says what a right-click does) |
| F3 | Airport hover card | "1 problems" | minor | Fixed |
| F4 | Builder | The help line at the bottom covered the top of the arsenal (it sat at a fixed height; the arsenal is taller in a war) | ugly | Fixed: it sits above the arsenal, whatever its height |
| F5 | Map, a raid zoomed out | Batteries close together wrote their reasons for holding fire over each other ("Out of reach at 50 m up: MR rounds reach 34…" three times over) | ugly | Fixed: where two would overlap, the first says it |
| F6 | Without the web fonts (offline, or Google Fonts blocked) | The airport panel's last tab ran off the panel ("Airsp"); the fallback was a wide system font | ugly | Fixed: condensed system fonts first, and the tabs wrap |
| F7 | Map, software rendering | After a jump the detail tiles paint in patches for several seconds (as #29) | minor | Left: on a GPU it is well under a second |
| F8 | Replay over the country | The ground away from airports is a flat, soft picture (as B#19, B#36) | minor | Left: in the known issues |
| F9 | Arsenal | The last card in a full row is cut at the panel's edge ("medium-range missil") | minor | Left: the row scrolls sideways; noted for after the release |

Looked at and fine: the business apron and its FBO in 3D, jets and light aircraft two to a stand; a club's row of
light aircraft with its fuel bowser; a microlight, an airship, the display team, the vintage airliner, the supersonic
jet and the outsize freighter in the live view; the live view's take-off roll and climb-out.
