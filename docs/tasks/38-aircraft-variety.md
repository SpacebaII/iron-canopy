# 38 An airport full of life: aircraft variety, GA, business jets and rare visitors

Release content pass, after 34 (the 3D rebuild) merges and before 37's QA of the 3D views. It uses 34's mesh builder.

## What the owner said

> "Possibly up the quality a little bit when it comes to models, and overall we just need more of them, more variety, so the airport looks like there's tons of actual life, mainly in GA. The majors will have life too but be more uniform. As well as we need some corporate or cooler aircraft, like business jets, or some one-of-a-kind types of planes we can occasionally see."

## What is there now

Civil aircraft come in five types (light aircraft, regional turboprop, narrow-body, wide-body, freighter), plus our military types. Every light aircraft looks the same, and general aviation is sparse.

## Goal

**More types, each a model at real dimensions, with sensible numbers in `IC.ACTYPES`.** Use generic or fictional names, not manufacturers' trademarks.

| Group | Types |
| --- | --- |
| General aviation | high-wing trainer; low-wing tourer; retractable single; light twin; taildragger or aerobatic; turboprop single (utility, floats optional); helicopter (light and medium); glider on tow; microlight |
| Business | very light jet; mid-size business jet; large long-range business jet; business turboprop |
| Airline | the majors stay uniform by airline (one fleet, one livery); add a regional jet, a large twin-aisle, a double-deck giant, and a cargo turboprop |
| Rare visitors (occasional, and noticed) | a vintage airliner or warbird; a supersonic or unusual jet; a huge outsize freighter; an airship; a firefighting amphibian; an air-show display team; a presidential or state aircraft |

A rare visitor gets a small moment in the log ("A vintage four-engine airliner is visiting Wenford today"), and a live-view link.

**Life at airports, mainly general aviation:**
- **Light-aircraft fields and the GA side of big airports are busy:**
  - aircraft parked in rows with covers and tie-downs;
  - flying club traffic in circuits;
  - fuel bowsers and people walking out to aircraft;
  - a helicopter pad in use.
- **Business aviation:** a business-aviation apron and terminal (FBO) at international airports, with its own traffic mix (executive jets arriving at odd hours).
- **Liveries:**
  - **GA:** varied, random but tasteful: white with one or two stripe colours, registration letters on the side.
  - **Majors:** uniform by airline.
  - **Rare visitors:** distinctive.
- **Model quality up a notch across the board:**
  - smoother fuselage lofts;
  - cockpit windows and passenger window lines;
  - engine intake and exhaust detail, winglets where real, propellers visibly turning;
  - lights: beacon, strobes and navigation lights, and landing lights on approach.

  Stay low poly (a few thousand triangles at most for the largest), instanced, with levels of detail.
- **On the 2D map:** the top-down sprites come from the same meshes, so the variety shows on the map too.

## Performance

A busy airport close in with 150 aircraft (many GA) keeps 60 fps on the map and in the 3D view. Measure and report.

## Scope

- In:
  - `models.js`;
  - `aviation-data.js` (types, with liveries by kind);
  - `civil.js` (general aviation, club and business traffic, rare visitors);
  - `aviation.js` (airline fleet mixes, where needed);
  - `render-models.js`.
- Out: new systems. Any new behaviour is limited to how often each type appears and where it parks.

## Done when

- `npm test` is green, with tests:
  - every type has a model at its real size;
  - general aviation fills a light-aircraft field over a day;
  - a rare visitor appears within a set number of game days and is logged;
  - majors keep one livery per airline.
- The pull request has:
  - the models gallery;
  - a GA field in daytime;
  - an international airport's business apron;
  - three rare visitors in the live view;
  - frame times.
