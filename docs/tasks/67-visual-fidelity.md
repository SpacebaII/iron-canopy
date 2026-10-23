# 67 Visual fidelity: a pass over everything the camera sees, and b-roll for a trailer

Wave 17. Built on an integration of the open visual work: film mode and the 3D war effects (#72, briefs 58–64), atmosphere (#68), the 3D flicker cleanup (#76) and the style pass (#79). Real-data towns and buildings (#90, briefs 65–66) and the airport front side (#91, brief 61) are not in this branch and are not redone here.

## What the owner said

> "I need a fidelity check for all of our processes, we should be able to collect like a b-roll for a trailer, so let's refine visually, add some animations, effects etc. … refine the 3D, the 2D and everything in between. Our game overall does not look good, we have to work on that."

## How it was done

1. **Audit.** Stills of every system a trailer would show, from one seed (`IC.S.seed = 4242`), on this branch: the map from the whole country to the gate, an airport working, a raid by day and night in normal play and in film mode, the 3D view on an airport and on an engagement, the start screen and the panels. Each domain lists its worst problems in order (`docs/tasks/67-screens/audit-*.md`).
2. **Fixes in three lanes**, each owning its files so they could be done side by side:
   - **The map** (`render.js` outside the combat and film layers, `terrain.js`, `render-airport.js`, `render-roads.js`, `render-airspace.js`, `render-models.js`): what the world looks like from the country to the gate, and its life (aircraft, vehicles, lights, water, weather).
   - **Combat, film mode and the interface** (`render-combat.js`, `film.js`, `film-cam.js`, the film layer in `render.js`, `ui.js`, `main.js`, `style.css`, `index.html`): effects on the map, the film look and camera, transitions and motion in the interface, the start screen.
   - **The 3D view** (`replay3d.js`, `render3d-fx.js`, `render3d-life.js`, `render3d-war.js`, `render3d-arms.js`, `models.js`): the picture, the effects and the motion in the replay and the live view.
3. **B-roll.** A shot list for a trailer, each shot made by a script (`tools/broll.js`) on the held film clock so it plays smoothly however slow the machine is; stills and clips in the project files under `fidelity/broll/`.

## Rules

- No change to what the simulation does: everything here is drawing, animation and camera.
- The performance budget holds (60 fps on the map with a busy capital on screen; brief 40's budget in the 3D view).
- Before and after stills for every fix, looked at.
