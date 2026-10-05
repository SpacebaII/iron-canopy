# 40 The 3D view, part 1: a picture like a flight-sim trailer

Wave 11. Builds on 22, 31 and 34 (`replay3d.js`, `models.js`, `render-models.js`). Runs beside 39 (real airports) and 41 (life in 3D).
- Coordinate with them: 41 owns aircraft animation, ground vehicles and airport lights; 39 owns the airport's 3D massing.
- This brief owns the rendering pipeline, lighting, sky, weather and ground.
- Put new rendering code in a new file, `render3d-fx.js`, loaded only with the 3D view, so that three sessions do not fight over `replay3d.js`.

## What the owner said

> "The 3D view does not feel cinematic yet. Let's go three times that: how can we make it look better?"

Today the live view and replay look like a debugging tool:
- flat light and no sun direction;
- a blob shadow under the aircraft;
- the same haze all day;
- blurry flat grass to the horizon;
- a grey slab for the terminal.

## Goal

A frame from the live view or the replay should be good enough to post as it is.

**The image pipeline (three.js only, no other libraries; loaded from cdnjs like three itself, or written here):**
- HDR rendering with ACES tone mapping and correct colour space.
- Bloom on bright things: landing lights, strobes, afterburners, flares, explosions, the sun's glint on a fuselage.
- Ambient occlusion where buildings and wheels meet the ground.
- Depth of field on long-lens shots.
- Motion blur on fast camera moves and for propellers and rotors.
- A subtle lens flare when looking near the sun, a vignette and film grain, and good anti-aliasing (SMAA or MSAA).
- Every effect has a switch and belongs to a quality preset.

**Light:**
- A sun and moon positioned by the game's time of day and season, with real shadows (a shadow map near the camera and the followed object; cascades if the budget allows).
- Hemisphere and ambient light from the sky's colour.
- Dawn and dusk golden, night dark blue with the airport lit.

**Materials:**
- Standard (PBR) materials with an environment map made from the procedural sky, so fuselages reflect the sky and catch the sun.
- Liveries painted to canvas textures at load: windows, doors, registration, panel lines, the airline's colours (`IC.liveryCols`).
- Glass, metal and paint read differently.

**The sky:**
- A physically based sky (a Preetham or Hosek-style model written here).
- Clouds: layered, lit by the sun, taken from the game's weather (cover, base height).
- Stars at night.

**Weather (from `weather.js` and `IC.sky`):**
- fog banks with the real visibility;
- rain with streaks and a wet runway that reflects the lights;
- snow falling and lying on the grass;
- thunderstorm cells with lightning;
- heat shimmer over the tarmac in summer;
- wind moving the grass.

**Ground:**
- sharp detail near the camera: a grass shader with mowing stripes and noise, instanced tufts and 3D trees near the camera;
- the tile picture further out, sharper than now;
- city blocks with lit windows at night and cars on the roads (cheap instanced boxes riding `IC.trafficAgents`, if the budget allows).

## Quality presets and budget

- Low, Medium, High and Ultra, chosen automatically from the GPU (`WEBGL_debug_renderer_info` and a short frame test), and changeable in Settings and in the view's header.
- The Medium preset must hold 60 fps full screen at 1080p on a mid-range laptop GPU.
- On software rendering the view still draws (Low).
- Nothing is rebuilt per frame (`tests/view3d.js` must still prove it); textures and render targets are made once.
- The 2D map and the simulation are untouched.

## Done when

- `npm test` and `npm run qa` are green, and `tests/view3d.js` extended: presets switch without leaks, nothing is made per frame, and weather states build.
- The pull request has before-and-after stills and clips (`tools/view3d-shots.js`, made frame by frame) of:
  - a take-off at noon;
  - a landing at golden hour;
  - a night arrival in rain;
  - a fog morning;
  - a snow day;
  - an intercept.
- It gives frame times per preset.
- Look at every frame you make.
