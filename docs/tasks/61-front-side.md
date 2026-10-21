# 61 The front side and outlines: airports that are not a collection of rectangles

Wave 16, beside the city work. Owns `landside.js`, the outline tool in `builder.js` (with `buildbar.js`, `ui.js`, `main.js` and the ghost in `render-airport.js`), the landside rows of the airport panel (`inspector.js`) and the gate in `growth.js`. Leaves `cities.js` and the buildings' models alone.

## What the owner said

> "do another refinement on airport operations again just in the construction and fidelity we are on a good system but have some odd optimal shapes and not so much on the irregular side especially with the intake size we likely need some parking lots and the ability to manage the front side or some part to stop airports from being a collection of rectangles so if necessary we can even go the airport ceo type of route although I don't recommend it or atleast at a much higher scale"

He turned down a landside economy (staff, baggage, retail, power) on 2026-10-09, so this stays at the level of layout: what the front side looks like, how much parking and kerb it has, and what running short costs. No tiles to manage.

## What changed

**1. A front side laid out like a real one.** Each passenger terminal gets (`front` in `landside.js`, `IC.landFront`):
- its kerb along the whole face, one way, and an upper departures deck when the kerb is too short for the cars (from 1,500 passengers an hour);
- a forecourt loop bowed out from the kerb and smoothed, with the parking garages in a row inside it, or a car park fitted to the loop;
- the airport road (`kind: 'approach'`, "Airport road") from the forecourt out towards the country's network, as far as free ground allows; the country's road is seated on its far end (`IC.landGate`, `IC.aptGate`), outside the fence.

**2. Car parks shaped by the ground.** Car parks along the airport road are cut to the free ground (`fitLot`: a 5 m raster of the plot minus the airfield, the forecourt, roads, rivers and homes, its largest piece traced and simplified), so they bend round taxiways, the fence and the river instead of being rectangles. Their far edge is straight but angled, one corner is cut, and garages, hotels and offices face the road. Nothing overlaps, on the capital, Estmar, Brengrad and two Quick war worlds at full growth.

**3. Sized to the intake, and felt when short.**
- Travellers bring about `IC.LAND_PARK.perPax` = 4 cars per passenger an hour (fewer at a big airport and with a rail station). Developers add car parks (350 spaces a hectare) and garages (5 levels, 1,900 spaces) until the spaces cover them, up to 24 lots and 8 garages; a busy airport builds garages first.
- The kerb needs about 7 m per car stopping two minutes.
- Short of either, the airport draws fewer travellers: `ap.land.accF` falls towards 1 − 0.3 × the parking shortfall − 0.1 × the kerb shortfall and multiplies the airport's quality in `growth.js`. The airport panel and `IC.aptStats` say how many spaces there are against the cars, how long the kerb is against what it needs, and what to do.
- Parking pays by the space it fills (`IC.LAND_PARK.earn`), and so do the player's own car parks (asphalt outside the fence, the Car park tool).
- "Who builds it" in the panel: developers (the default) or nobody (`IC.landAct`, op `auto`); with nobody, only what the player draws.

**4. Outlines.** Aprons, open ramps, terminals, cargo sheds and surfaces (car parks among them) can be drawn corner by corner (the Shape chips in the build bar, or O): each side keeps to 15° steps from the first and to 10 m lengths (Shift draws freely), corners snap like a rectangle's, a click on the first corner closes it and Build builds it. An outline that crosses itself or is under 30 m across is refused with a reason. The part keeps its outline (`part.poly`); cost and time follow its area; an outlined apron gets rows of stands along its edges, noses to a terminal or shed behind them (`IC.aptPolyStands`), shown on the ghost before it is built.

**5. Terminals that are not boxes** (the owner, after the first round: "you really only changed the parking lot you didn't help with the actual terminal shape or structure of the airport"). `IC.kitComplex` in `airport-kits.js` lays out a terminal from a seed:
- a head house whose airside face is in sections at different depths, parted by piers or by steps in the wall, its ends cut back at an angle, and a hall standing forward to the kerb on the landside;
- zero to three piers of different lengths, fanned outward, the longest where the weights put most of the gates; each pier's root runs deeper than the face beside it, so it joins the building along its whole width;
- gates along every face, nose to the wall, each with its jet bridge; a taxilane along each section and round each pier's tip, trimmed to the last gate so none ends in the grass;
- one apron poured round all of it (a 2.5 m raster traced to an outline), not a set of rectangles.

Where it is used: the build bar's Terminal with apron (no piers, a stepped face) and Terminal with piers (renamed from "with a pier"), with an "Another layout" chip that tries the next seed; the Starter airport (it measures the terminal first and joins each end or pier tip to the parallel taxiway); and the starting capital and regional airports in `IC.layoutAirport` (`kit`), seeded by the airport's position, so no two worlds have the same terminal. The starting capital now has a head house with two fanned piers and 28 gates.

**6. Piers on a terminal that is there.** "Pier on a terminal" in the pieces (and "Add a pier to it" on a terminal's panel): point out from a terminal wall and a pier grows from the wall nearest the cursor, square to it (R turns it 15° at a time), as far as the cursor and never past the next taxiway or runway. The apron in its way is cut round it (`attachCut`): the stands under it are taken up and the plan says how many, the rest stay where they were, and what is left of the apron becomes outlined aprons. A taxilane across its root is split and each end joined to the pier's own lanes; its tip joins the nearest taxiway. It is refused, with the reason, when an aircraft stands where it goes or there is no room, and it warns when it takes up as many stands as it gives. Undo before work starts puts the apron, its stands and the taxilane back (`IC.attachRestore`).

## Tests

- front side: a terminal gets a curved forecourt, an airport road and car parks shaped to the ground, as many spaces as travellers bring
- front side: with no room to park, travellers choose other airports, and with the developers turned off nothing is built
- builder: an outline drawn corner by corner becomes an apron of that shape, with stands along its edges and a cost by its area
- kits: a terminal complex steps in and out, its piers differ, and every stand has a bridge and a way out (six seeds, no two alike)
- kits: the Quick war capital has a terminal with fanned piers, and every stand is joined to the runways
- pieces: a pier on a terminal cuts the apron round it, keeps the stands clear of it, and Undo puts it all back

## Not done

- Garages and hotels are still boxes: their 3D heights belong with the city thread's buildings.
- A drawn outline cannot be edited corner by corner once built (bulldoze and draw again).
- The kerb is one length per terminal: no separate arrivals and departures kerbs at ground level.
- A pier needs room in front of the wall: on a tight airport (the Starter's terminal is 100 m from the parallel taxiway) there is none, which is why the pieces now lay out piers from the start.
- Terminals can be stretched only by adding a pier; a head house cannot be lengthened in place.

Screens: `61-screens/` (before and after at the capital, the outline tool, the terminal kit at three seeds, the Starter airport and the Quick war capital, a pier being placed and built).
