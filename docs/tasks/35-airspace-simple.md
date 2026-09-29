# 35 Airspace a pilot would recognise: top-down shapes, simple to set

Wave 9. Replaces the editor from 20 (the rules underneath stay).

## What the owner said (after playing; the owner is a pilot)

> "Airspace itself is like, what are you doing? I'm a pilot in real life and I kind of understood it, but in no way, shape or form should that be the way that you attempt to implement or explain it. It seemed very useless and convoluted. I think an easier way to implement that is a top-down way, and pretty predefined shapes, with the ability to scale up/down and add some custom shaping, but not crazy."

From the owner's screenshots, the coordinator also saw:
- A brand-new airport with 8 movements an hour gets "Capital hub" Class B up to FL150 with shelves to 60 km.
- In Chapter 1 it warns "Class B needs radar, but radar sees 0%", before airspace is taught (Chapter 3).
- The text says "7,000 ft" where the list says "FL070".

## Goal

**Top-down, like a sectional chart.**
- The airspace is drawn and edited on the map from above, in chart colours and styles: Class B solid blue rings, Class C magenta, Class D dashed blue, E faded magenta, restricted areas hatched.
- Each ring carries its floor and ceiling as a chart label ("FL150 / 30" means a floor of 3,000 ft and a ceiling of FL150), and a plain-words tooltip.

**Predefined shapes, scaled and lightly customised:**
- Pick a shape from a small set. The airport's size decides the default, which grows as traffic grows.
  - Class D cylinder (a small field);
  - Class C two-ring (regional);
  - Class B three-ring "upside-down wedding cake" (hub);
  - a military zone;
  - a restricted area;
  - a training area.
- One handle scales the whole shape. Per-ring handles set each radius.
- Light custom shaping:
  - a cut-out ("notch") for a nearby field or a VFR corridor;
  - an extension along the runway line for the approach;
  - a rotation to the runway.
- Floors and ceilings are chosen from a short list per ring (in steps of 500 ft), not dragged in a side view. The side view stays as a read-only picture, one click away.
- New airports start small (Class D, or Class C for an international airport) and the game suggests the next size up when traffic and radar support it: "Wenford has 30 movements an hour and approach radar: Class C would let controllers keep VFR traffic apart."

**Explained like a flight instructor would.** Keep it short.
- What each class means for who needs a clearance and who is kept apart.
- Why you would want it here, and what it costs (controllers, radar).
- One or two lines per class, with the real-world rule of thumb. No warnings about radar before the Airspace chapter.
- Use one unit style everywhere: feet below the transition level (6,000 ft) and flight levels above, the same in text, lists and labels.

**Keep the rules underneath.** The simulation of classes, clearances, spacing, sectors and controllers from 20 stays. Only the model's shapes and the editor change. Old saves convert.

## Scope

- In: `airspace.js` (volumes as shapes with parameters), `render-airspace.js`, the Airspace tab in `inspector.js`, and `sideview.js` (now read-only).
- Tests in `tests/run.js`.

## Done when

- `npm test` is green, with tests:
  - a new airport starts with the small preset;
  - scaling a shape keeps its rings nested;
  - a notch lets a light aircraft through below the floor without a clearance;
  - no airspace warning shows before the Airspace chapter;
  - the units are consistent.
- The pull request has:
  - screenshots of each preset on the map;
  - scaling and notching in use;
  - the tab before and after;
  - a note on what each class now says.
