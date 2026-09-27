# 07 Career pacing

Needs all earlier tasks merged: this ties them into the Career.

## What the owner asked for

> "We got through phase 1 way too quickly, so we should not put so many tasks up front. Let's start with one airport, the capital of the country, and work on building that."
> "We want to start very small and develop, starting by getting really good at knowing the aviation side, then the economic side, etc."
> "The whole civil aviation process should take some time, a lot, just because of the actual complexities of it, and the same for the other parts."
> "The pacing can feel similar to Frostpunk, but with a lot more to do when it comes to detail."
> "There's definitely going to be a gap before he implements custom controlled airspace, but that's after an event happens where the leader prompts him to do it. And the player should have a difficult time getting removed until much later in the game."
> "He also might be contracted to build smaller GA airports and given a grant, or not, to do so."
> "The ability to have military on the airport: this would protect it from an airborne invasion much later in the future."

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
- **Pacing like Frostpunk.** Steady pressure from a few visible needs (capacity, money, the Minister's patience), each new layer arriving because events force it, and decisions with trade-offs the player feels for days. Always more to do than time to do it, never a scripted outcome.
- **Airspace comes later, through an event.** At the start controllers use the default procedures (flights direct, procedural spacing) and the airway editor is locked. A leader-driven event opens it, for example a near miss or a complaint from the airlines; the Prime Minister or Minister asks the player to design proper airspace. Leave a real gap before it.
- **Contracts for small fields.** The Minister or a region asks the player to build a light-aircraft field or a small regional airport. Sometimes it comes with a grant, sometimes not. Accepting, refusing or doing it badly has visible consequences (support, confidence, flying clubs' mood).
- **Hard to fire early.** Failure costs confidence and money and brings warnings, but dismissal should only be possible late in the game after sustained failure, and the game says clearly how close the player is.
- **Military on the airport (later acts).** From Act II or III the player can base troops and air defence on an airport to guard it against an airborne assault. Keep the hooks for this; the attack itself can come in a later task.
- **Show one goal or two at a time, not five.** Hide systems the player has not reached yet (rooms, palette entries, map layers), and introduce each one with a short, plain explanation when it unlocks.
- **Keep the eerie build-up for later.** Small hints may appear late in Act I, such as an odd radar contact near the border. The drone collision ends Act I only after the civil aviation chapters are done.
- **Acts II to IV** get the same treatment later. Keep their current structure for now, but check the numbers still work with the new economy.
- **Target length:** a thoughtful player spends several real hours in Act I at normal speed. Write down the intended length of each chapter in the pull request.

## Done when

- `npm test` is green. The Career tests are updated so a scripted player can still reach every act, and a test checks that a player who does nothing does not leave Act I in under a set number of game days.
- A balance run (a scripted player through Act I) prints when each chapter starts. Include it in the pull request with screenshots of the start of the game.
