# 46 Roads that join like real roads

Wave 11, beside 45 (airport polish). Builds on 44's pavement approach (`pavement.js`: surfaces built as geometry, curved fillets, painted once into tiles).

This brief owns how roads look where they meet, everywhere:
- country roads and motorways (`render-roads.js`, the road painting in `terrain.js`'s tiles);
- junction shapes (`W.junctions`, `W.ramps` from `gen.js`: geometry only, not routing);
- city streets (`cities.js` drawing);
- an airport's landside roads (`landside.js` and their drawing).

Airside service roads are 45's. Build the road surface engine so 45 can use it, and look at `origin/wave11/airport-polish` before touching anything near an airport.

## What the owner said

> "Fix the roads not connecting neatly. I like how you did it with the taxiway and runway; we need the roads to act the same. I'm tired of seeing the intersections look so stupid."

## Why they look bad now

- **Overlapping strokes.** Roads are drawn as thick strokes with round caps and joins, one over another. A junction is wherever they overlap.
- **Circles on top.** Where there is a junction shape, `render-roads.js` stamps a filled circle over it (and a green disc for a roundabout's island).
- **Markings clash.** Centre and edge lines run through junctions and over each other.
- **Mixed widths and tones.** Roads of different classes meet with mismatched widths and tones, and none of the markings stop where they should.

## Goal

**Every road junction is one surface with real geometry, drawn like 44's pavement:**
- **Curb returns.** Where roads meet, the edge is a curve of a real curb radius (about 6–10 m in town, 15–25 m on rural main roads, larger for lorries), tangent to both edges. No circles, no bulges, no round stroke caps.
- **Priority layering.** The main road runs straight through a minor junction: its edge lines and centre line continue, and the minor road ends at a give-way or stop line with its own markings.
- **Signalled or kerbed junctions in town:** stop lines, zebra crossings, lane arrows on the approaches, and pavements (sidewalks) that follow the curb returns.
- **Roundabouts:**
  - a round central island (kerbed, with grass and a planted centre);
  - a ring road of the right width;
  - flared entries and exits with splitter islands;
  - give-way markings.
- **Motorway interchanges:**
  - slip roads that leave and join with tapers and gore markings (chevrons);
  - bridges over and under, drawn with parapets and shadows;
  - diamond and cloverleaf loops as smooth curves;
  - no crossings at grade.
- **Where a road meets a railway:** a level crossing (barriers, markings) or a bridge, as the data says.
- **Consistent widths by class:** lanes 3.5 m on motorways, 3–3.25 m elsewhere, hard shoulders, verges.
- **Markings that stop at the right places:**
  - dashed and solid centre lines by class;
  - edge lines;
  - motorway lane lines.
- **City streets:** blocks meet their streets at kerbed corners with pavements, and a street grid's crossings are proper junctions, not overlaps.
- **Airport landside:**
  - the loop road, kerb and car-park roads get the same treatment: one-way arrows, the kerb lane, zebra crossings to the terminal;
  - car parks with rows of bays and trees;
  - the loop road's levels as real bridges.
- **Tiles:** roads are painted once into the tiles, like 44's pavement, from the regional zoom (clean lines of the right weight) to street level (asphalt texture, patches, markings). No seam between tile levels, and the same tones at every zoom. The live close-in drawing matches the tiles exactly.
- **Performance:** the step is untouched. Frame times at the city and airport zooms must stay within budget (`tools/world-perf.js` before and after).

## Done when

- `npm test` and `npm run qa` are green, with tests:
  - a T junction has curb returns and no circle;
  - a main road's centre line continues through a minor junction;
  - a roundabout has an island and flared entries;
  - an interchange's slip roads meet the motorway with a taper;
  - no road surface overlaps another road's at a different level;
  - city block corners meet their streets.
- The pull request has before-and-after pictures:
  - a village T junction;
  - a town crossroads;
  - a roundabout;
  - a motorway interchange;
  - a city grid close in;
  - an airport's landside loop;
  - the whole capital at the regional zoom.
- Look at every picture you make. The bar is a trailer: the owner is "tired of seeing the intersections look so stupid".
