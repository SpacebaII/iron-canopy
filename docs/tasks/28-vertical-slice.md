# 28 A polished 20-minute scenario for the portfolio

Wave 8, after 25–27.

## What the owner agreed to

> A reviewer won't play 5 hours. One tight scenario would show off the best parts in 20 minutes. *(The coordinator's suggestion; the owner: "I love everything.")*

## Goal

A new start-screen mode, **Showcase**: a guided 20-minute scenario on a fixed map and seed that shows the game at its best, and that someone who has never seen it can finish.

**Arc:**
1. **About 5 min.** A small international airport, already running. The player adds a stand and approves a cargo deal, and airliners arrive and land.
2. **About 5 min.** Tension. An unknown track appears; the player identifies it, sets the airspace and places a battery.
3. **About 8 min.** A raid that tests the choices they made: interceptors climb, some weapons leak, the airport takes a hit.
4. **About 2 min.** The after-action report and a replay of the best moment.

**Standards:**
- It opens fast, with the world prepared or cached.
- There's no dead time: time jumps are offered where nothing happens.
- Every screen is polished: text, layout, sound and pacing.
- It ends with a clear summary and an invitation to the full Career.
- Two runs can end differently depending on the player's choices.

## Scope

- A new `showcase.js` (scenario script, like the Academy lessons but longer) and start screen entries.
- It uses existing systems only; fix any rough edges it exposes in their own small commits.

## Done when

- `npm test` is green, with a scripted player completing the Showcase in under 25 game minutes of real time at the intended speeds.
- The pull request has a screen recording or a sequence of screenshots of the whole 20 minutes, the times of each part, and the rough edges found and fixed.
