# 63 Effects at the source: plumes, trails and explosions you can describe

Wave 17, after 59. Owns `render3d-war.js` (rebuilt), with small hooks in `replay3d.js`.

## What the owner said

> "Better SFX and less just blowing indescribable ball to show a missile, also make effects closer to the actual source."

## Where we are

From the first teaser, frame by frame:

- **A missile in flight is a ball of light.** The motor's glow is a screen-sized round sprite (`emit(w.fire, …, sz * (4 + 10 * night))`) far larger than the missile, so the missile itself never shows. From far away every weapon is the same white dot.
- **Explosions are balls.** Each is 26 round fire sprites in a sphere and 20 round smoke sprites; they all read as one soft circle that grows and fades. A blast high up is a white disc on a white sky.
- **Effects sit away from what made them.** A kill in the air is drawn at the event's recorded place, which is up to a step (0.25 s, 250 m at 1 km/s) away from where the missile and its target meet on screen; the motor's flame starts at the model's centre minus half a length, which for a 0.07-unit missile is fine but is pinned to the record's heading, not the model's; the launch cloud is a ring of puffs round the pad, not under the nozzle; a ground hit's fireball sits at the impact point but its smoke column starts 30 m up.
- **Trails are dotted lines.** The puffs are spaced by camera distance but are all round and the same size at one age.

## Goal: effects you could describe in a sentence each

### 1. The motor, attached to the nozzle

- A **plume mesh**, not sprites: a narrow cone along the missile's own axis from its nozzle (the model's tail, in its body frame, so it turns with the model), drawn with a shader: a white-hot core, a yellow-orange sheath, three to five shock diamonds in the first metres, flicker in noise, length by the motor's thrust (a ballistic boost 40 m, an interceptor 12 m, a sustainer 5 m). It blooms but has a hard shape.
- A **small light**, a few metres across at most, around the nozzle, larger only at night and only as far as it would light the smoke.
- **The smoke starts at the nozzle** and is laid along the model's path (the same smoothed curve the model flies), not the record's samples.
- From far away (under 3 pixels) the missile becomes a short bright streak along its direction of travel, not a round dot.

### 2. Trails with a shape

- The trail is a **ribbon** in the first seconds (a tight, bright, turbulent tube right behind the nozzle) that breaks into **puffs** of varied size and shade as it ages, swelling and drifting with the wind; the sunward side brighter. A ballistic boost leaves a thick twisting column that catches the low sun.
- Burn-out leaves a gap; the coasting missile pulls a thin vapour line at most.

### 3. Explosions with parts

Every blast is made of distinct, named pieces, each with its own shape:

- **Flash:** a short, small, white-hot star with four to six spikes (a sprite with streaks), not a disc; it lights the ground and smoke near it for 0.1 s.
- **Fireball:** a cluster of noisy, lumpy fire billboards (fbm noise in the shader, each its own rotation and a scrolling noise) that billows outwards and up and darkens from white to orange to deep red to black at its edges, sized by the warhead (a cruise missile's 450 kg: 25–30 m; an interceptor's blast-fragmentation: 8–10 m; a ballistic warhead: 40 m).
- **Shock:** in the air, a thin bright **condensation ring** that expands at the speed of sound for half a second and vanishes; on the ground, a **dust ring** thrown out low along the surface and a ripple of light.
- **Sparks:** 40–80 white-yellow **streaks** (stretched quads along their velocity) thrown out fast and falling, each leaving a thin smoke line; a ground hit throws **clods and debris** as small dark tumbling meshes.
- **Smoke:** black-brown, lumpy, lit from the sun's side; a ground hit leaves a **column** that rises from the ground (not above it) and leans with the wind, and a fire at its base.
- **Scorch:** a dark crater mark on the ground that stays.
- **In the air:** an intercept is a fireball and black puff that hangs, with the target's pieces falling away burning and trailing smoke; a ballistic missile met high up is a bright flash with a wide grey ring and fragments raining down.

### 4. At the source

- An air kill is drawn where the two models actually meet on screen: at the victim's pose at the event's time (`IC.recPose` of the target track at `e.t`), not the event's stored point.
- A ground impact's fireball starts on the ground at the weapon's last pose; the smoke column grows from the ground.
- The launch cloud comes out from under the nozzle along the ground (for a canister launch, also a puff forward out of the canister), and the launcher (62) is inside it.

## How it is checked

- `tests/view3d.js`: an intercept's fireball centre is within 5 m of the target's pose at the kill; a motor plume's root is within 1 m of the model's tail along its axis; no effect allocates per frame.
- Step and frame budgets: the war effects take under 3 ms a frame with a 16-missile raid and four fires on screen on a mid-range laptop (`tools/frame-prof.js`).
- `tools/arms-shots.js` adds an effects sheet: a launch, a missile passing at 30 m, an intercept at 300 m, a ground hit at 500 m, each at 0, 0.2, 0.5, 1, 3 and 10 s; before and after in `docs/tasks/63-screens/`.
