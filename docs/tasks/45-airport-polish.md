# 45 Airport polish: smooth joins, real holding bays, attached buildings, round terminals, service roads

Wave 11, straight after 44 (`pavement.js`, `render-pavement.js`, `buildbar.js`) and 39 (outlines, bridges, people movers, roofs) are merged. Owns the same files as 44. Start from `origin/main` once PR #41 has merged, or from `origin/wave11/airport-look` if it has not yet.

## What the owner said (after seeing 44's pictures)

> "Make sure the textures connect smoothly; reduce the clunky bulbs on taxiways and smooth it out. A decent bit of this can be done with layering: the runway and more prominent features appear on top of taxiways. And stop being afraid to make things appear a bit bigger. The holding bay looks so goofy: it should be a slab of concrete that allows movement on different tracks. Same with the airport buildings: I saw a ramp connected to the terminal, then one with the boarding head connected to nothing. No floating prices. I have still yet to see complex circular terminals, ramps etc.: make sure we get that polished and implemented. Service roads would help the aesthetic; they don't have to be too functional, but they'd remove the blank look our airports have. And make sure the runways and taxiways merge: I don't like seeing a circular cutoff instead of a nice merge into the lane with added curves, instead of just overlap."

## Goal

**1. Joins with no seams:**
- **Layering by importance:**
  - the runway is drawn over the taxiways that meet it: its edge lines, markings and shoulders run straight through the junction;
  - a taxiway is drawn over its apron entry, and an apron over its stands.
- **No circular cut-offs anywhere:**
  - A taxiway entering a runway widens into it with curved fillets on both sides (entry, exit and rapid exit geometry), and its centreline curves onto the runway centreline.
  - The same holds where a taxiway joins an apron or another taxiway.
  - Audit every junction type in the tests: T, X, Y, acute, rapid exit, runway end, apron edge.
- **Textures continue across joins:** concrete slab joints line up across a fillet; asphalt grain has no seam; the shoulder runs round the fillet.
- **Bolder where it helps.** Fillets, shoulders and markings sized as real ones are (not timid): a Group V junction is large. Check against real airport diagrams.

**2. Holding bays that look and work like real ones:**
- A holding bay is a concrete slab beside the runway end: a widened area where several aircraft wait on separate painted tracks, so one can pass another.
- Draw it as one slab with:
  - two to four yellow lead-in tracks;
  - a holding position marking on each;
  - its own fillets.
- `groundops.js` uses the tracks: an aircraft ready to go can pass one still waiting.

**3. Buildings that connect:**
- Every jet bridge starts at a terminal or pier wall (a rotunda on the wall, or a fixed link), and ends at a stand's door position. None float.
- A stand whose bridge would not reach a wall gets no bridge: it is a remote stand with stairs, and it says so.
- Ramps, kerbs and service roads attach to what they serve.
- An automatic check lists anything unattached (`IC.aptOverlaps` or a sibling), and the tests assert none on every preset and blueprint.

**4. No floating prices or words:**
- Price tags show only on the ghost while placing, never left on the map.
- Construction labels sit on the site, small, and go when it is built.
- Audit every label drawn on the map at every zoom for things left hanging.

**5. Complex terminals, as tools and as blueprints:**
- **In the build bar:**
  - round terminals and rotundas;
  - satellite concourses on a round pod;
  - curved piers;
  - semicircular terminals (DFW style);
  - Y, T and X piers;
  - a people mover to a satellite;
  - aprons that follow the curve;
  - stands fanning round a rotunda with bridges to its wall.
- **In the Blueprints tab, ready to place (fictional names, "after …"):**
  - a round terminal with satellites and tubes (after Paris CDG T1);
  - round satellites linked to a landside hub by people mover (after Tampa);
  - a semicircular terminal on a loop road (after Dallas–Fort Worth);
  - midfield parallel concourses with a train (after Atlanta);
  - long concourses (after Dubai).
  - Built only from the general parts, so they must pass every check: stands reachable, bridges attached, no overlaps.
- **The Showcase lists them** until 39's real Denver and Los Angeles arrive.

**6. Service roads, for looks and some function:**
- Airside service roads:
  - behind and between stands (the equipment road);
  - round the apron edge;
  - to the fuel farm, cargo sheds, fire station and hangars;
  - a perimeter road inside the fence.
- White lines, zebra crossings where they cross a taxilane, "STOP" at the taxiway edge.
- Generated automatically for every airport and kept up to date as it grows. The player can also draw them.
- 41's service vehicles drive on them (hand them the network).

**7. From 44's review:**
- With the build bar open, the goals panel folds away and the airport panel narrows, so the map is visible, as in Cities: Skylines.
- The fence has an odd rectangular bump beside the terminal on the Career capital; trace it cleanly.

## Done when

- `npm test` and `npm run qa` are green, with tests:
  - every junction type has no circular edge and the runway's markings are continuous through it;
  - a holding bay lets a ready aircraft pass a waiting one;
  - every bridge is attached, on every preset and blueprint;
  - no map label is left without its thing;
  - every blueprint passes the checks and runs six hours of traffic without gridlock;
  - service roads reach the fuel farm, cargo and fire station.
- The pull request has:
  - before and after at a runway entry, a rapid exit, a holding bay, a gate and a round terminal;
  - each blueprint from above and in 3D;
  - the build bar with the panels folded.
- Look at every picture you make: the bar is a trailer.
