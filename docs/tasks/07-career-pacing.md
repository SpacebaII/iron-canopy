# 07 Career: start small, learn by building

Wave 4. Needs 10, 11, 12 and 13 merged: this ties them into the Career. Runs in parallel with 14 (menus and progression) and 15 (runway rules).

## What the owner asked for

> "We got through phase 1 way too quickly, so we should not put so many tasks up front. Let's start with one airport, the capital of the country, and work on building that."
> "We want to start very small and develop, starting by getting really good at knowing the aviation side, then the economic side, etc."
> "The whole civil aviation process should take some time, a lot, just because of the actual complexities of it, and the same for the other parts."
> "The pacing can feel similar to Frostpunk, but with a lot more to do when it comes to detail."
> "There's definitely going to be a gap before he implements custom controlled airspace, but that's after an event happens where the leader prompts him to do it. And the player should have a difficult time getting removed until much later in the game."
> "He also might be contracted to build smaller GA airports and given a grant, or not, to do so."
> "The ability to have military on the airport: this would protect it from an airborne invasion much later in the future."
> "We are still starting off very large: there are a lot of airports or parts of the game at the start of the campaign that aren't helping the player actually learn. We still need a bigger map size and fewer actual assets. We need to be in charge of developing the actual aviation of the country."
> "We can even start with having the player build the airport he's going to start with, through a light prompted tutorial, and help the player learn how to place navigation points that airliners will use to enter and exit his country, and, with traffic that is not going to land there, how they can traverse the sky."
> "The player will learn and feel the struggle that ATC feels, but not constantly. It is much more a growing pain, but once it is set up and pretty understood it should be easier to manage. It is not forced, but these systems should be implemented to avoid messy gameplay, and that is fine if it happens because it is a learning experience."
> "Remove the ground invasion piece" (task 11 removes the land war; the acts here are air only).

## Goal

Act I becomes a long, satisfying civil aviation game in its own right. It starts with one airport and a few airlines. It grows only as the player shows they can handle each layer: the airport, then the airspace, then more airports, then the economy. The gray-zone build-up of later acts starts only after that.

## Scope

In (you own these):
- `story.js`: acts, goals, beats and events.
- The Career start-up in `state.js` and `aviation.js`: which airports and airlines exist at the start.
- The world's size (`core.js`, `gen.js`).
- Entry and exit points, overflights and controllers' workload in `airspace.js`.
- The tutorial's prompts, and the goal and room unlocks in the interface.

Out:
- The systems themselves: use what the earlier tasks built.
- Runway rules and ground movement (`groundops.js`): task 15.
- The look of menus and panels: task 14. It builds a hint layer your tutorial can use; agree on it through small, separate commits.
- Two follow-ups the coordinator does on `main` while you work:
  - city districts feeding passenger and cargo demand (`c.mix`, `IC.cityDemand` in `growth.js`);
  - Quick war money, which today earns far more than it spends.

  Merge `main` before you open the pull request.

Keep edits outside your files small and in separate commits.

## Design notes

- **A bigger country, almost empty of aviation.** Make the world larger (in `core.js` and `gen.js`; about 1.5× each way if generation, drawing and the step stay in budget) and start with far fewer assets: no ready-made airports, bases or batteries that the player did not build or earn. Other cities have demand, not airports.
- **Build your first airport, with a light tutorial.** The Career opens with a prompted, skippable walkthrough: pick the site near the capital (the survey from task 04), lay the runway, a taxiway, an apron and a terminal, watch the first flight arrive. Prompts point at the thing to do and explain why in one sentence; they never block, and the player can go their own way.
- **Entry and exit points, and overflights.** The next lesson is the airspace: the player places the points on the border where international traffic enters and leaves the country, and airways between them and the airport. Overflights (traffic crossing the country without landing) use them too and pay overflight fees. Without them, traffic wanders in anywhere and controllers struggle.
- **Air traffic control as a growing pain.** As traffic grows, the player feels the struggle: holds, delays, a loss of separation, a near miss. Each has a clear fix (a radar, an airway, spacing rules, a second runway). Once the airspace is set up well it runs itself and needs only occasional attention. It is never a constant chore, and a messy setup is allowed: it teaches.
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
- **The acts are air only.** I: Director of Civil Aviation (the long build). II: the gray zone (odd contacts, drones, spoofed transponders, the first air defence duties). III: Air Defence Commander (radars and batteries, intercepts, rules of engagement, raids). IV: Chief of the Air Force (airbases, counter-strikes, the airborne assault, keeping the country flying). No land war.
- **Military on the airport (later acts).** From Act II or III the player can base troops and air defence on an airport to guard it against an airborne assault. Keep the hooks for this; the attack itself can come in a later task.
- **Show one goal or two at a time, not five.** Hide systems the player has not reached yet (rooms, palette entries, map layers), and introduce each one with a short, plain explanation when it unlocks.
- **Keep the eerie build-up for later.** Small hints may appear late in Act I, such as an odd radar contact near the border. The drone collision ends Act I only after the civil aviation chapters are done.
- **Acts II to IV** get the same treatment later. Keep their current structure for now, but check the numbers still work with the new economy.
- **Target length:** a thoughtful player spends several real hours in Act I at normal speed. Write down the intended length of each chapter in the pull request.

## Done when

- `npm test` is green. The Career tests are updated so a scripted player can still reach every act, and a test checks that a player who does nothing does not leave Act I in under a set number of game days.
- A balance run (a scripted player through Act I) prints when each chapter starts. Include it in the pull request with screenshots of the start of the game.
