# 07 Career pacing

Needs all earlier tasks merged: this ties them into the Career.

## What the owner asked for

> "We got through phase 1 way too quickly, so we should not put so many tasks up front. Let's start with one airport, the capital of the country, and work on building that."
> "We want to start very small and develop, starting by getting really good at knowing the aviation side, then the economic side, etc."
> "The whole civil aviation process should take some time, a lot, just because of the actual complexities of it, and the same for the other parts."

## Goal

Act I becomes a long, satisfying civil aviation game in its own right. It starts with one airport and a few airlines. It grows only as the player shows they can handle each layer: the airport, then the airspace, then more airports, then the economy. The gray-zone build-up of later acts starts only after that.

## Scope

In: `story.js` (acts, goals, beats, events), the Career start-up in `state.js` and `aviation.js` (which airports and airlines exist at the start), and the goal and room unlocks in the interface.

Out: the systems themselves; use what tasks 01 to 06 built.

## Design notes

- **Start small.** Only the capital's airport exists, modest and with clear room to grow. There are two or three airlines and a thin schedule. Other cities have no airport yet, only demand.
- **Chapters inside Act I, each unlocked by the one before**, with fallback timers generous enough that a thoughtful player never feels rushed:
  1. Run the capital's airport well: stands, exits, fuel, the first expansion.
  2. The airspace: radar coverage, the first airways, the first near miss (task 03).
  3. Light aircraft and a second field (task 03).
  4. A second city's airport, founded and built (task 04).
  5. The economy: demand, growth and cargo (task 05).
- **Show one goal or two at a time, not five.** Hide systems the player has not reached yet (rooms, palette entries, map layers), and introduce each one with a short, plain explanation when it unlocks.
- **Keep the eerie build-up for later.** Small hints may appear late in Act I, such as an odd radar contact near the border. The drone collision ends Act I only after the civil aviation chapters are done.
- **Acts II to IV** get the same treatment later. Keep their current structure for now, but check the numbers still work with the new economy.
- **Target length:** a thoughtful player spends several real hours in Act I at normal speed. Write down the intended length of each chapter in the pull request.

## Done when

- `npm test` is green. The Career tests are updated so a scripted player can still reach every act, and a test checks that a player who does nothing does not leave Act I in under a set number of game days.
- A balance run (a scripted player through Act I) prints when each chapter starts. Include it in the pull request with screenshots of the start of the game.
