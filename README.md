# Iron Canopy

A browser game about building airports and defending the sky. You start as Director of Civil Aviation, running airlines and fixing badly designed airports, and rise through four acts to Chief of the Air Force as a neighbouring country tests your border and finally attacks.

Plain HTML, CSS and JavaScript with no build step and no dependencies.

## Play

Open `iron-canopy/index.html` in a browser. Or run the local server, which turns caching off for development:

```
python devserver.py
```

then go to http://localhost:8766/iron-canopy/index.html.

On the start screen, **Career** is the story mode, **Academy** has eight short lessons on the defence systems, **Quick war** skips straight to the crisis, and **Sandbox** starts at war with everything deployed.

## What is in it

- **Airports built part by part, at real scale.** Runways, taxiways, aprons, terminals, hangars, hardened shelters, alert pads, fuel tanks, tower, fire station and approach radar. Aircraft push back, taxi, hold, take off, land and taxi in along the network you build, so layout matters: runways without exits, missing parallel taxiways, too few stands and clustered fuel tanks all cost time, money or aircraft.
- **Damage where it lands.** Craters split runways into shorter strips, cut taxiways strand aircraft, burning fuel spreads to nearby tanks, and shelters save the jets inside.
- **Fictional airlines** with their own priorities (fees, taxi times, night slots, terminals). Happy airlines ask for new routes and unhappy ones cut them. Prohibited zones reroute civil traffic around what matters.
- **A four-act career** with decision cards, a confidence meter, command points and delegates who take over routine work.
- **Air and missile defence**: rotating radars that paint on each sweep, identification by transponder, flight plan, type recognition and fighters, missile envelopes, chaff, flares and notching, radar interference, crew fatigue, and an enemy commander that probes, harasses and then strikes.
- **Ground war** on two fronts with brigades, towns that matter, helicopter strikes and lifts, and logistics you set up.

## Controls

Drag to pan, scroll to zoom (zoom all the way in to watch aircraft at the gate), click to select, right-click to give orders. Space pauses, 1–6 set the speed, S skips ahead until something needs you. War rooms: V aviation, T staff, A air, G army, L supply, I industry, N intelligence, K research, J journal.

## Code

All game code is in `iron-canopy/js/`, loaded in order by `iron-canopy/index.html` and sharing one `window.IC` namespace.

| Area | Files |
| --- | --- |
| World and state | `core`, `data`, `aviation-data`, `gen`, `world`, `terrain`, `weather`, `state` |
| Air defence | `sensors`, `threats`, `defense`, `units`, `enemy` |
| Airports and aviation | `airport` (layout, taxi graph, damage, building), `groundops` (taxiing and runway use), `aviation` (airlines, routes, fees), `civil`, `incidents` |
| Air force, army, logistics | `air`, `ground`, `logistics` |
| Modes | `story` (Career), `campaign` (Quick war), `academy` |
| Loop and interface | `sim`, `audio`, `render`, `render-airport`, `ui`, `inspector`, `warroom`, `main` |

## Tests

The simulation runs headless in Node (`headless.js` loads the game files and stubs out the canvas):

```
node storytest.js 12345 30     # a scripted player through the Career, 30 game hours
node camptest.js 12345 24      # a scripted commander in Quick war
node academytest.js            # every Academy lesson (or name one: node academytest.js airbase)
node simtest.js
```
