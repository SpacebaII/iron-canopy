# 44 Airports good enough for a trailer, and a builder like Cities: Skylines

Wave 11. Builds on 39's branch (`wave11/real-airports`: outlines, bridges, people movers, roofs, runway markings), so start from it, not from main. Owns:
- how an airport is drawn (`render-airport.js`, the airport's tiles in `terrain.js`, pavement in the 3D view's airport meshes);
- the builder's interface (`builder.js` input, `ui.js`/`inspector.js` build panels, `app.css`).

39's session is waiting on map data. Coordinate through its branch: merge `origin/wave11/real-airports` hourly.

## What the owner said

> "It's looking better, but I want it to look nice, good enough to actually make a trailer viable. Not bulbous taxiways; matching textures so that taxiways look better. And not a sidebar, but more a Cities: Skylines type of UI when it comes to building and placing things down."

## What is wrong now

- **Fillets are circles.** `fillets()` in `render-airport.js` paints a filled circle at every junction. Every taxiway joint and every runway entry reads as a blob.
- **Pavement pieces do not match.**
  - Runway, taxiway, apron and fillet are each flat colours of slightly different tones, drawn one over another, with visible seams and overdraw.
  - No surface texture, no joints, no wear, no shoulders.
- **Building happens in the inspector's side panel:** a grid of buttons with prices, tool options stacked below, the map half hidden.

## Goal

**1. Pavement that looks like an aerial photo of a real airport, at every zoom:**
- **Real fillets.**
  - Where a taxiway meets another taxiway, a runway or an apron, the edge is a smooth curve on the inside of the turn, sized for the design aircraft (FAA AC 150/5300-13 judgemental oversteering or cockpit-over-centreline geometry), not a circle.
  - Straight crossings get no fillet bulge at all.
  - The yellow centreline follows the same curve, and lead-off lines curve onto the runway centreline.
- **One pavement, not layered strokes.**
  - Build each airport's pavement as one merged outline per material: runways, taxiways, fillets, aprons and holding bays unioned, with clean edges and no seams.
  - Draw it once into the airport's tiles.
- **Matching textures by material:**
  - **Concrete:** slabs about 5 × 5 m with joint lines, slightly varied tones, and darker rubber deposits in the touchdown zones and at stand lead-ins.
  - **Asphalt:** darker, with a fine grain and patch repairs.
  - **Grass strips** and **gravel** have their own textures.
  - One palette for all of them, tuned so a runway, its taxiways and the apron look like the same airport.
  - The texture scales correctly from the regional zoom (a tone) to the gate (joints and markings).
- **Shoulders and markings:**
  - paved shoulders a shade lighter or darker, with edge markings;
  - taxiway edge lines (double yellow where the shoulder is not load-bearing);
  - holding position markings (four yellow lines, two dashed);
  - apron safety lines (red and white) and stand numbers painted on the pavement;
  - service roads with white lines and zebra crossings;
  - runway markings as 39 already does, drawn crisp.
- **Surroundings:**
  - grass mowing stripes that follow the runway;
  - the airfield's graded strip a different green;
  - approach light bars;
  - blast pads at runway ends (yellow chevrons);
  - the fence and its gates;
  - perimeter roads.
- **Buildings from above:**
  - roofs with real detail: HVAC units, skylights, tent peaks, glass;
  - soft shadows on the ground, from the time of day's sun;
  - jet bridges as proper boxes with rotunda and cab.
- **No floating labels.** In 3D, labels are screen-space text, never giant letters lying on the ground (as in the current test field's 3D: "TOWER", "BRIDGE TO …").
- **Same look in 3D.** The 3D view's airport ground uses the same pavement outline and textures (40 owns the lighting and renders on top of it).
- **Reference:** compare against aerial imagery of real airports (Denver, LAX, Frankfurt, Singapore) at the same zoom, and put side-by-side crops in the pull request.

**2. A builder like Cities: Skylines:**
- **A toolbar along the bottom of the screen**, not the side panel. It shows:
  - category tabs with icons: Runways, Taxiways, Aprons & stands, Terminals & piers, Cargo & hangars, Fuel & services, Landside & roads, Navaids & radar, Looks & paint, Blueprints;
  - in each tab, a row of large items, each with an illustrated thumbnail drawn in code from the part itself, its name, price and a one-line use;
  - a hover card with the details: what it enables, upkeep, and what it needs.
- **An options bar above the toolbar** for the chosen item: material, width, stand size, zone, one-way, lights. Chips, not stacked forms.
- **Placing:**
  - a ghost of the part under the cursor, at real size, in the build colours: green buildable, red with the reason;
  - snapping and guides, as 33 part 1 and 39 do, drawn cleanly: dashed guide lines, length and angle readouts on the ghost;
  - cost and work time on a small tag by the cursor;
  - click to place, drag to size, R to rotate, Shift for free angle, right-click or Esc to cancel.
- **Tools, like Cities: Skylines:**
  - **Upgrade:** click an existing part to change its material, width or lights, paying the difference.
  - **Move:** a building, while not yet built, or with a relocation cost.
  - **Bulldoze:** with its refund shown before the click.
  - **Undo.**
  - **Info views,** as overlays that dim the rest of the map:
    - taxi congestion as a heat map;
    - stand use;
    - walking distance to gates;
    - fuel and service reach;
    - noise over the towns;
    - runway capacity.
- **The inspector stays** for the selected thing only. The airport's Build tab goes away; building happens from the toolbar whenever an airport is selected, or when the player picks the Build button in the top bar.
- **Keyboard:** 1–0 pick a tab, B toggles the toolbar, and the tool keys as in Cities: Skylines.
- **Everything the side panel did must still be possible.** The Academy lessons and `tools/smoke.js` must be updated to click the new toolbar, and they must stay completable.

## Done when

- `npm test` and `npm run qa` are green, with the smoke run clicking the new toolbar.
- New tests:
  - a straight crossing has no fillet bulge and a turn has an inner curve;
  - the pavement outline has no gaps under taxiways;
  - an upgrade charges the difference;
  - bulldozing refunds;
  - every tab's items can be placed.
- The pull request has:
  - before-and-after shots at four zooms (region, whole airport, a junction, a gate);
  - side-by-side crops with real aerial photos;
  - the toolbar in use: placing, a refusal, upgrading, bulldozing, and an info view;
  - frame times with a busy capital airport on screen (60 fps budget).
- Look at every picture you make. The owner wants it good enough for a trailer.
