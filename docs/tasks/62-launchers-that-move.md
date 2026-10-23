# 62 Launchers that move, and the enemy's launchers on screen

Wave 17, after 61 (it animates 61's groups). Owns a new `render3d-arms.js` (loaded with the 3D view after `render3d-life.js`, through hooks in `replay3d.js`, like brief 59's `render3d-war.js`).

## What the owner said

> "Do some better animations and much higher fidelity 3D model with launch and swivels animations etc."

## Where we are

- A unit's launcher (`launch` group) raises when the unit stops and lowers when it moves (`animate()` in `replay3d.js`). It never turns towards anything, never fires anything you can see leave it, and is always full.
- A radar spins whenever its unit is on, at the same rate whatever it is.
- The enemy's launchers are not in the record. A ballistic missile's first sample is on the ground somewhere in the enemy's country, and the 3D view shows nothing there.

## Goal

Everything worked out from the record at the view's time t (so scrubbing back and forth shows the same thing, and the film's held clock gets the same picture every run).

### 1. Our launchers, from the record

For each unit with a launcher, the view gathers the missiles it fired (tracks whose `meta.uref` is the unit) and its launches become a timeline:

- **Slew:** from about 12 s before a launch the turntable turns to the azimuth of the first leg of the missile's path (taken from its first seconds in the record), at a real rate (30° a second, easing in and out), and holds there until 6 s after; with several launches close together it goes from one bearing to the next.
- **Elevate:** an inclined launcher rises to its firing angle (`up`) before the first launch and stays up while the battery is engaged; a vertical launcher is already up when emplaced.
- **Fire:** the canister for that round is picked in turn (0, 1, 2, 3); its cover blows off (it is hidden, and two cover pieces fly forward and fall, tumbling), the round's nose disappears from the canister as the missile leaves, and the launcher rocks back on its jacks (a damped 3° kick).
- **Empty canisters** stay empty. **Reload:** after the record shows the unit reloaded (its magazine back up, or 10 minutes after its last round in a replay), the rounds' noses are back and the covers on.

### 2. Radars that work

- A fire-control radar faces the bearing of the threat it is guiding against (the target of its latest missile), turning at 20° a second.
- A search radar spins at its type's rate (`IC.UNITS[..].rpm` where given, else 15 rpm), faster when it is tracking.

### 3. The enemy's launchers (`IC.recLaunchers`)

- The view finds every enemy weapon whose track begins on the ground (its first sample under 50 m) and puts a launcher there: `etel` for a ballistic missile, `ecml` for a cruise missile, pointing along the weapon's first heading. A second weapon from the same place within 100 m uses the same launcher.
- **Before launch:** from 3 minutes before, the erector raises the missile to vertical over 60 s; the missile stands on the table.
- **At launch:** the missile leaves the table (its own track takes over), the erector stays up for 20 s then lowers, and the launcher drives away 2 minutes later (it moves off along its heading at 30 km/h and goes out of sight).
- The cruise missile launcher elevates its canisters and fires them one by one, with a cover off each.

### 4. Crew

Two or three figures (`person`, coloured as soldiers) stand by the vehicles before a launch and are inside or gone during it; they are only drawn within 300 m of the camera.

## How it is checked

- `tests/view3d.js` (headless three.js stand-in): a battery that fires four rounds slews within 2° of each round's first bearing before its launch; its cap and round groups for each fired canister are hidden after their launch and shown before; an enemy ballistic missile has an `etel` placed within 20 m of its first sample, the erector at vertical 10 s before launch. Nothing is made from frame to frame (the existing check).
- `tools/arms-shots.js` films the battery firing (side-on, 30 m away) and an enemy launch, for `docs/tasks/62-screens/`.
