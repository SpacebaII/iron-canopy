# 03 Airspace: waypoints, radar coverage and light aircraft

## What the owner asked for

> "There should be some conflicts in the beginning, like not having proper radar coverage, having to keep everything safe, and making flight points for airliners to follow."
> "The player should definitely feel the difference between GA and airline traffic."

## Goal

Early in the Career the player is a civil aviation director, not a general. Their first real problems should be the airspace itself:
- where the radar coverage is;
- where airliners fly, and how they are kept apart;
- how light aircraft (general aviation, GA) mix with airlines.

Today airliners fly straight lines between airports (`aviation.js` launches legs directly; prohibited zones only bend them).

## Scope

In:
- a new `airspace.js`: fixes, airways, departure and arrival routes, controlled airspace, radar coverage and separation;
- routing in `aviation.js` and `civil.js`;
- light aircraft in `civil.js`, or a new `ga.js` if it grows;
- airway drawing in `render.js`;
- a drawing mode in `main.js` and an inspector panel for fixes and airways.

Out: `airport.js` and `groundops.js` (task 02). Use only the existing arrival hook (`IC.gopsFaf`) and departures. Out too: the story, apart from making the new problems available to it.

## Design notes

- **Fixes and airways the player draws.**
  - The player places waypoints (fixes) and joins them into airways.
  - Each airport gets departure and arrival routes that join the airway network.
  - Airliners route over the network by shortest path, from the end of the departure route to the start of the arrival route.
  - With no network they fly direct, but controllers must separate them "procedurally": wider spacing, fewer flights per hour, more delay.
  - Airways crossing each other are conflict points. Airways over bases and cities can be moved away, which works with the prohibited zones that already exist.
- **Radar coverage as an early problem.**
  - Civil secondary radars (`ssr`) and approach radars have coverage that depends on altitude: low-level gaps behind terrain and far from the radar.
  - Show a coverage map layer with altitude bands.
  - Flights outside coverage need bigger spacing, and a pair of flights that loses separation is an incident: a near miss, with a card and a confidence cost.
  - Placing radars well, and routing airways through covered airspace, is the first thing the player learns.
  - The radar-interference rules in `sensors.js` (radars on the same band close together blind each other) already apply; keep them.
- **Controlled airspace.**
  - Zones around airports (control zone and terminal area) that light aircraft must stay out of unless cleared.
  - Infringements are incidents.
- **Light aircraft feel different.**
  - They are slow and low, and fly by sight in good weather only.
  - They use small fields and grass strips as well as big airports, often without a flight plan and sometimes without a transponder.
  - At a big airport a slow light aircraft uses the runway for as long as two airliners. That is the reason for a separate light-aircraft field near the capital.
  - Flying clubs bring little money but matter politically.
  - Draw them and label them clearly differently from airliners.

## Done when

- `npm test` is green, and new tests show:
  - airliners follow the airway network when one exists;
  - flights outside radar coverage are spaced wider;
  - a loss of separation produces an incident;
  - light aircraft avoid controlled airspace unless cleared.
- The player can draw, edit and delete fixes and airways with the mouse, and see coverage and conflicts on the map. Include screenshots in the pull request.
- The pull request says what changed and what you could not finish.
