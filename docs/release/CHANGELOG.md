# Iron Canopy changelog

## v1.0 (first public release)

The first version for playtesters and the public. What is in the box:

### Three ways to play

- **Career.** You start as Director of Civil Aviation of a landlocked republic with no airport worth the name, and rise through four acts to Chief of the Air Force while the neighbour moves from border incidents to open war. Act I is six chapters: the national airport, the capital's airport, the airspace, light aircraft, a second city, the economy. The Minister's confidence decides your grant, and from Act III whether you keep the job.
- **Quick war.** Hours of tension, then raids in waves. Hold for three days with the country still working.
- **Academy.** Eight five-minute lessons, one system at a time, with stars for how well you did. Plus the **Test range**: place any system, send any threat, read the results.

### Airports at real scale

- Build part by part: runways, taxiways, aprons, terminals, hangars, fuel tanks, towers, landing systems, radars. A 3.4 km runway is 3.4 km long on the map.
- The build bar runs along the bottom of the screen (B, or Build in the top bar): ten tabs of parts, each with a picture of what it looks like, its price and what it is for; options above it for pavement, width, lights, stand size and zone; and the tools — Upgrade for the difference in price, Move, Bulldoze with the refund shown before the click, Undo, and info views for taxi congestion, stand use, walking distance, services, noise and runway capacity.
- The builder snaps to runways, aprons and taxiways, keeps lines square, and shows the length, cost, work time and what the part will change, beside the cursor. Tools for big airports lay a parallel taxiway, rapid exits, a concourse or a remote apron in one go.
- Pavement matters: grass, asphalt, concrete or reinforced concrete, each carrying aircraft up to a weight. Building takes time, money and lorry loads of concrete from the nearest industrial town, and may mean clearing homes.
- An airport is drawn as one paved surface: real fillets curving through every turn, concrete slabs and asphalt patches, shoulders, edge and hold lines, blast pads, stand numbers, approach lights and a perimeter fence with its gates.
- **Two real airports, near one to one.** The Airport showcase on the start screen opens Front Range International (after Denver International: the six-runway pinwheel, the Jeppesen Terminal's tent roof, the midfield concourses and the bridge to Concourse A that aircraft taxi under) or Pacific International (after Los Angeles International: the four parallel runways, the horseshoe of terminals, World Way on two levels, the Theme Building and the people mover). Both are laid out from OpenStreetMap and OurAirports data by an importer, not drawn by hand: runway ends within 30 m, gates within 5%, terminal footprints within 10%. In the Career they are blueprints you can place and turn.
- Aircraft taxi, hold short, cross runways, line up, take off and land along the network you built. The wind picks the runway; fog needs a landing system. Bad layouts cost minutes and money, and the airport's panel says why in plain words.
- Accidents are rare and always have a cause, and an accident report follows.

### Airlines and life at the airport

- Fictional airlines ask for routes where seats run full, sign deals with you and fly real-sized aircraft: regional turboprops and jets, narrow-bodies, wide-bodies, a double-deck giant, freighters.
- General aviation fills the light-aircraft fields and the small side of big airports: trainers, tourers, twins, taildraggers, helicopters, gliders on tow and microlights, each with its own livery and registration.
- Business jets arrive at odd hours and park on the business apron by the FBO.
- Rare visitors now and then: a vintage airliner, a supersonic jet, an outsize freighter, an airship, a firefighting amphibian, a display team, a head of state. The log tells you, and you can follow them in the live view.

### Airspace and air traffic control

- Airspace drawn as on a chart, from above: Class B, C and D rings round your airports with their floors and ceilings, shelves, military areas. Drag edges on the map, or set them in the airport's Airspace tab and the side view.
- Draw airways, put up radars (hills block them), split the country into sectors with controllers who only have so much attention.
- Arrivals are sequenced, held in stacks when busy, and kept apart from departures; light aircraft stay out of controlled airspace unless cleared.

### The country

- Every map is generated: 60 cities, 300 villages, rivers, forests, motorways, main and local roads with real junctions, railways, and cities with their own street plans and districts.
- Cities grow with good air service and roads, and shrink with war damage. Industries export by air and road.
- Road and rail traffic runs on the network; cut roads queue until engineers repair them.
- A calendar in months and years, with seasons, day and night, and weather.

### Defence

- Radars and identification, layered air defence (guns, short, medium and long-range missiles, ballistic missile defence), jamming, supply by convoy from depots, research, fighters on patrols and intercepts.
- An enemy commander with a campaign: gray-zone probing, then strikes on what matters most.
- Weapons stay on Hold in peacetime: shooting first is your choice.
- An after-action report after every raid.

### 3D replay and live view

- Every engagement is recorded for the last 15 game minutes. Open it from the Journal or a track's panel and watch it in 3D: chase, side-on, target and seeker cameras, locks, slow motion round each hit, and a data panel for what you follow.
- The live view follows any aircraft or missile as it happens, in a small window or full screen.
- Low-poly models built at real size for every aircraft, missile and vehicle; a models gallery on the Test range.
- The replay records itself to a video file (the Video button).

### Everything else

- Saves in the browser (IndexedDB), with autosave, Continue, and export and import as files.
- Settings for interface size, sound, hints, radar sweeps and when to pause.
- Keyboard shortcuts for almost everything; the start screen's Controls page lists them.
- Version 1.0 on the start screen.

### Release pass (this version)

- The replay and live view no longer show a frame-rate readout (add `#debug` to the address to see it).
- The builder: no hover card over its own card by the cursor, and its help line sits above the arsenal.
- The airport's hover card says "1 problem", not "1 problems".
- Batteries close together no longer write their reasons for holding fire over each other.
- Without the web fonts (offline), the airport panel's tabs wrap instead of running off the panel.
