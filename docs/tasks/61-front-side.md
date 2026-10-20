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

## Tests

- front side: a terminal gets a curved forecourt, an airport road and car parks shaped to the ground, as many spaces as travellers bring
- front side: with no room to park, travellers choose other airports, and with the developers turned off nothing is built
- builder: an outline drawn corner by corner becomes an apron of that shape, with stands along its edges and a cost by its area

## Not done

- Garages and hotels are still boxes: their 3D heights belong with the city thread's buildings.
- A drawn outline cannot be edited corner by corner once built (bulldoze and draw again).
- The kerb is one length per terminal: no separate arrivals and departures kerbs at ground level.

Screens: `61-screens/` (before and after at the capital, the outline tool).
