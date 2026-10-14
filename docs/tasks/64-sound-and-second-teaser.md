# 64 Sound design, and a second teaser

Wave 17, after 61–63. Owns `tools/teaser-score.js` (the sound) and `tools/teaser.js` (the cut).

## What the owner said

> "Better SFX … and send me video after."
> "I want to be able to match the YouTube cinematics in this game in terms of quality in scenes."

## Where we are

The first teaser's sound effects are one layer each: a launch is filtered noise, a blast is a noise burst with a low sine. They do not carry distance (no delay, no muffling), there is no flyby, and the music does not make room for the hits.

## Goal

### 1. Sound design (synthesised, deterministic, nothing licensed)

- **Launch:** an ignition crack, then a tearing, crackling roar with a low rumble, falling in pitch and getting duller as the missile climbs away.
- **Flyby:** a cruise missile's turbojet whine with a Doppler drop and a whoosh as it passes, panned across.
- **Close SAM launch:** hiss and bang, motor roar, gravel rattle.
- **Air burst:** a crack that arrives after the distance's delay (340 m/s), with a rolling echo; far ones are muffled thumps.
- **Ground hit:** a sub-bass thump (pitch falling 50 → 25 Hz), a mid crack, debris rain, a long rumble; fuel adds a whoomph and a fire's crackle after.
- **Ambience:** wind in the quiet shots, a distant air-raid siren rising through the raid, radio squelch.
- **Mix:** a soft limiter on the master, reverb, and the music ducking under the big hits.

### 2. The second teaser

Same raid, refilmed with 61–63: more of it in 3D and closer, in the order a DCS cinematic would cut it:

1. Establish: the capital's airport at dusk (as before).
2. The enemy's launcher at its site: the erector raising the missile, close and low; ignition, the missile leaving the table, the launcher in the cloud.
3. The ballistic boost from far away: the column climbing into the last light.
4. Cruise missiles over the fields: two flybys, one a long lens following, one planted at 30 m.
5. The battery waking: the radar turning to the threat, the launcher slewing and elevating, a cover blowing off, the round leaving; a second round from a lower angle.
6. The intercepts: an interceptor closing on a cruise missile and the fireball where they meet; the ballistic missile met high up.
7. The ones that get through: hits on the airport from the ground and from above, the fire and the column.
8. The aftermath and the title.

80–95 s, 1280 × 720 at 24 fps on this machine (1080p and High quality on a machine with a graphics card).

## How it is checked

- The film is looked at frame by frame before it is sent: every shot has its subject in frame and in focus, every blast is where its weapon was.
- `node tools/teaser-score.js` runs in under two minutes and gives the same file every run.
