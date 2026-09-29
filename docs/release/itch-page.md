# Iron Canopy: itch.io page

## Title

Iron Canopy

## Tagline (one line, under 100 characters)

Build the airports. Run the skies. Then defend them.

## Short description (for the game card, under 250 characters)

A browser strategy game at real scale. Found a national airport, lay its runways and taxiways, win airline deals and design the airspace, while a neighbouring country tests the border.

## Long description

You are the new Director of Civil Aviation of a small landlocked republic. The country has no airport worth the name: airliners cross its sky and nobody lands.

**Build airports part by part, at real size.** Pick a site, turn the runway into the wind and lay concrete: runways, taxiways, aprons, terminals, fuel tanks, a tower. Aircraft taxi, hold short, take off and land along the network you build, so a bad layout costs you minutes, money and goodwill, and the game tells you why in plain words. Building takes time, money and lorry loads of concrete from the nearest industrial town.

**Run the skies.** Airlines offer deals when their flights run full. Sign them, keep the flights on time, and your airport's name brings more. Draw airways, put up radars, and shape the controlled airspace round your airports like a real aeronautical chart. Light aircraft, holding stacks, controllers with only so much attention: it all has to fit.

**Then defend them.** The neighbour starts with gray-zone incidents and ends with open war. Four acts take you from the control tower to Chief of the Air Force: radars, identification, layered air defence, supply convoys, fighters and a 3D replay of every engagement.

Also in the box:

- **Quick war**: hours of tension, then raids in waves. Hold for three days with the country working.
- **Academy**: eight five-minute lessons, one system at a time.
- **Test range**: place any system, send any threat, read the results.

Every map is generated: 60 cities, 300 villages, roads, railways and rivers across a country 3,200 km wide.

## Controls

| | |
| --- | --- |
| Pan | drag, or arrow keys |
| Zoom | mouse wheel, + and − |
| Select | click |
| Orders | right-click |
| Pause | Space |
| Speed | 1–6 (1× to 32×), S skips ahead until something needs you, 7 waits for money (Career) |
| Rooms | V Aviation, C Career, E Economy, J Journal, ? Guide (A Air, L Supply, I Intel, R Research later) |
| Back out, menu | Esc |
| Builder | click the ends of a runway or taxiway, click again to build; Shift draws freely, R turns a building, Ctrl+Z undoes |

The start screen's Controls page lists every key.

## Details for the upload

- Kind of project: HTML. Upload `dist/iron-canopy-v1.0.zip` (`npm run package`), tick "This file will be played in the browser".
- Viewport: 1280 × 720 at least; "Fullscreen button" on. It plays best full screen at 1920 × 1080.
- Mobile: not supported (it needs a mouse and a wide screen).
- Genre: Strategy, Simulation. Tags: airport, air traffic control, city builder, tycoon, air defence, management, procedural.
- Saves stay in the player's browser (IndexedDB); the Saved games page exports and imports them as files.

## Known issues

- The game needs a desktop browser; Chrome, Edge and Firefox are tested most. It loads its fonts from Google Fonts and, for the 3D replay only, three.js from a CDN: offline it plays with plain fonts and without the replay.
- A save exported from one browser may not load in another browser engine (Chrome to Firefox, say): the map is rebuilt from its seed and the engines round some maths differently. The same browser on another computer is fine.
- The Career is long (Act I alone is several hours at normal speed). Use the speeds, S and Wait.
- A very busy capital airport, zoomed all the way in, is the heaviest scene; on an older laptop drop the speed or zoom out a little.
