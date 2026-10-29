# 77 The war planner: play their staff in the Sandbox, then send the plan in

Owns `js/planner.js` (the panel, DOM), `js/render-warplan.js` (the map) and the planner's side of `warplan.js` (`IC.wpRebuild`, `IC.wpFly`, `IC.wpHitInfo`, `IC.wpFileText`, `IC.wpParse`).

## What the owner said

> "I need the ability to place weapon systems and kinda plan attacks as the enemy"
> "I also need the ability to save an attack layout with targets and send it to you so that you can put it in the game to happen at a certain point"

## What this brief does

- The Sandbox panel's **War planner** opens the Career's plan on the real map. **Batteries**: pick a family and a version, launchers, rounds and stock, then click where it fires from on their soil; move, rename or delete it. **Waves**: write when each comes (after the wave before, hours into the war, after another wave, a story flag or beat), whether at night, the act it moves the enemy to, the warning; then **+ Hit**: click a battery, then the target on our side (a city, airport, base, power station or story place by name, or a point), and set the rounds and when they land against the peak. Named targets that follow the game (our busiest airport, a radar they know of…) are in the list. **Route** draws the points a weapon flies through.
- The map draws every battery, the reach of their air defence, and the wave being written: a line per hit with what flies and how long, and each hit says when it must leave.
- **Fly it now** runs the wave against the Sandbox's defence, warned and reported as in the Career. **Reset launchers** makes every battery whole again.
- **Save** keeps plans in the browser, **Export file** downloads `war-<map>-<name>.js` (the file the game loads), **Copy** puts it on the clipboard, **Import** reads one back.

## Sending a plan in

Export the file and attach it to the thread with when it should happen. It goes in as `js/war-homeland.js` (or its waves into it), and the test `map: the Career's war plan…` checks every battery stands on their soil and every target exists.
