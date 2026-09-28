# 29 Engine health: fast tests, fast start, the step budget

Wave 8. Can run alongside anything; touches tests and hot paths.

## Why

The owner agreed to spend a round on speed:
- the test suite takes 20–30 minutes on the larger map (GitHub's limit had to be raised to 45);
- a Quick war takes about 8 s to start;
- the step runs to about 1.5 ms with 300 flights and a raid (budget: well under 1 ms).

All three slow every future change.

## Goal

**Tests:**
- `npm test` under 8 minutes, `npm run test:quick` under 3.
- Share a generated world between tests that only read it (generate once per seed, deep-copy or reset the state).
- Move the long balance runs into a nightly job, `npm run test:slow`, run by GitHub on a schedule.
- Make the tests deterministic: a seeded random number source for tests, `Math.random` replaced where the simulation depends on it, so a failure reproduces.

**Start-up:**
- Show a loading screen with progress.
- Generate the start screen's world once and reuse it when the game begins (today it is generated twice).
- Cache what can be cached.
- Target: under 4 s to a playable Quick war on a mid-range laptop.

**The step:**
- Bucket radar detection (`IC.sense` / `detects` in `sensors.js`) by sensor reach on a grid, instead of every sensor against every target. Task 20 measured it at about a third of the step.
- Profile the rest and fix the top three.
- Target: under 1 ms with 300 flights and a raid.

**Code review:**
- Run a full review of the codebase (`/code-review` at the highest level) and fix what it finds.
- List what was fixed and what was left, with reasons.

## Done when

- `npm test` is green and meets the times above on GitHub.
- The pull request has before and after numbers for the tests, start-up and the step, and the review's findings with outcomes.
