# 61 Models that hold a close-up

Wave 17, after 60. Owns `models.js` (new and rebuilt models, more detail at q 1) and how `replay3d.js` lights and shades them. The shading work is shared with 63.

## What the owner said

> "Everything there that looks less than stellar in 3D I need a revamp: better models … much higher fidelity 3D model with launch and swivel animations."
> "Imagine like a low-poly DCS. I want to be able to match the YouTube cinematics in this game in terms of quality in scenes."

## Where we are

From the first teaser (`docs/trailer/`), frame by frame:

- **The launchers do not exist on screen.** The enemy's ballistic missile leaves a bare field: its launcher is not recorded, so nothing is drawn. Our batteries are a lorry with four boxes on the bed (`tel()` in `models.js`): a 12 m lorry, a box cab, wheels that are lathed discs, canisters as plain boxes, no turntable, no outriggers, no crew.
- **The missiles are pencils.** `missileBody()` makes a 10-sided lathe with four flat fins. Close in it shows facets and nothing else: no seeker window, no panel lines, no nozzle, no wing roots. At film distances it is hidden by its own glow.
- **The radars** are a box on a pole on a lorry.
- **Lighting:** every model is flat-coloured per slot, with no wear, no panel lines and no dirt. At dusk the green vehicles read as black cut-outs.

## Goal: "low-poly DCS"

Clean, faceted shapes with the right silhouette and proportions from real dimensions, enough detail at the camera's distance that a close-up reads as a machine, and paint that catches the light. Not photoreal; never toy-like.

### 1. Launchers

- **Long-range launcher (`lrsam`, "Bastion"):** a semi-trailer launcher behind a four-axle tractor, after the real layout of a modern long-range system: the tractor's cab, bonnet and grille, fuel tanks and steps; the trailer's levelling jacks (down when emplaced), the turntable that slews (a group `slew`), and on it the launcher frame that elevates (`launch`, its child) with four canisters in a 2 × 2 box, each with a frangible front cover that blows off when its round fires (groups `cap0`–`cap3`) and the round's nose visible inside until it goes (`rnd0`–`rnd3`). Cable reels, a generator, a crew step.
- **Medium-range (`mrsam`, "Aegir"):** a three-axle truck with a vertical-launch rack of four canisters behind the cab, the rack raised to vertical when emplaced, the same covers and rounds.
- **Short-range (`shorad`, "Vixen"):** the tracked vehicle with a turret that slews and two launcher arms either side that elevate, each with two rounds; the search radar on the turret's back turns.
- **The SPAAG (`spaag`, "Buzzsaw"):** hull with road wheels and track runs, a turret with two barrels that slew and elevate and a search radar that spins.
- **The enemy's ballistic missile launcher (`etel`):** a new model after the real eight-wheeled transporter-erector-launchers: a long low chassis, cab forward with a split windscreen, the erector arm that lifts the missile to vertical (`erect`), the launch table under it, outriggers. It carries the `bm` round. Its cruise missile launcher (`ecml`): a four-axle truck with three canisters that elevate.

### 2. Missiles

`missileBody` grows a detailed close version (q 1): 16 sides, a pointed ogive or blunt seeker dome (glass for infrared), the body in sections with a darker band at each joint, a raceway (the cable fairing along one side), clipped-delta fins with a root fairing and thickness, a nozzle that is a real bell (dark, flared, with a lighter throat), and the warhead section in a different shade. At q 0 it stays as cheap as now.

- Interceptor (`sam`): white, a red band, four tail fins, a black nozzle bell, a radome.
- Ballistic (`bm`): olive-grey with a darker re-entry vehicle and four small tail fins; a booster section that separates (`render3d-life.js` already drops one).
- Cruise missile (`cm`): the folded wings deployed, a ventral intake, a tail cone with four fins in an X, a dull dark grey; panel lines.

### 3. Radars

- **The fire-control radar** of the long-range battery (`lr3d`, "Sentinel"): a trailer with a flat phased-array face on a mount that faces the threat (it turns to where the raid comes from rather than spinning), the array's face divided into tiles, a generator lorry beside it.
- **Search radars** keep spinning; their antennas become frames rather than boxes.

### 4. Paint that catches the light (`render3d-fx.js` surfaces, `replay3d.js` materials)

- Military paint is matte with a low specular; the slot colours are lifted so that dusk light still shows the shape (a dark olive reads olive, not black).
- A world-space grime term darkens the lower parts and the edges of every vehicle, and panel lines are painted on missiles and launchers the way airliners already get them (`IC.fx3d.livery`).

## How it is checked

- `tests/run.js`: every new model builds at both levels of detail with closed shapes (no triangle with zero area, normals outward), its moving groups exist with a pivot and an axis, and its size matches the stated dimensions within 10%.
- The models gallery (`IC.replayGallery`) shows each new model; `tools/arms-shots.js` (new) films each launcher close in, at a three-quarter angle, in daylight and at dusk. Before and after go in `docs/tasks/61-screens/`.
- Triangle counts stay inside the budget: a launcher under 6,000 triangles at q 1 and under 800 at q 0; a missile under 1,200 and under 100.
