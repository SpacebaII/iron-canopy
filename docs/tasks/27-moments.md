# 27 Moments, and an after-action report after every raid

Wave 8. Uses the 3D replay (task 22) and the enemy's shock operation (task 19).

## What the owner agreed to

The game needs memorable beats, not only the enemy's big shock operation, and the 3D replay can become the after-action report. *(The coordinator's suggestion; the owner: "I love everything.")*

## Goal

**Beats.** Each one is short, readable and skippable, and appears once, at the moment it happens:
- the first airliner landing at the player's airport (the camera eases to it, with a sound and a card);
- the first route to a foreign capital;
- the first time the radar picks up an unknown track;
- the day the player closes the airspace;
- the first intercept;
- the first loss;
- the first hit on the capital;
- the night the war starts.

Tie each to what the player did, never a scripted outcome.

**After-action report after every raid:**
- what came, what was shot down and by what, what got through and why ("flew under the radar behind the ridge at 40 m", "the battery was reloading"), what it cost on both sides, and what to change;
- each line links to the 3D replay at that moment.

**Sound and look:** a light pass on audio and screen effects for these moments. Keep it restrained and readable.

## With the calendar (32)

- Every moment carries its calendar date ("March, Year 3").
- **The yearly review:** each year ends with its moments (firsts, records, near-misses, losses), each with its replay if one was recorded, next to the year's money and traffic.
- Over ten years the Journal grows long. Group it by year and month, and keep the moments easy to find.

## Scope

- A new `moments.js` (beats and their triggers), the report in `warroom.js`/`inspector.js` in its own function, links into `replay3d.js`, and `audio.js`.
- Beats use events on `IC.emit`; do not add logic in other systems.

## Done when

- `npm test` is green, with tests:
  - each beat fires once, at its trigger;
  - a raid produces a report whose numbers add up;
  - a report line opens the replay at its moment.
- The pull request has screenshots of three beats and a report, and says how each beat can be switched off in Settings.
