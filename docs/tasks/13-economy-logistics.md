# 13 Economy and logistics you can understand

Wave 3. Runs in parallel with 10 (cities, roads, traffic), 11 (air defence systems) and 12 (combat look and feel).

## What the owner asked for

> "The economy and logistics are so unclear I don't even know how they work. That needs to be helped, as well as you need to make that clear and make the systems better."
> "The time aspect I really don't like, especially being a game. If you have the resources you should be able to buy and have it move there pretty quickly."
> "We need to find a way to make convoys look less stupid. You just see orange trucks around, but they are near irrelevant and hard to tell what they are doing. Overhaul that system as well."

## Goal

The player can say, in one sentence each, where their money comes from, where it goes, and what their supply lines are doing. Buying something is quick and satisfying when you can afford it. Supply is a visible, meaningful system: a convoy on the map clearly carries something somewhere for a reason, and cutting or protecting it matters.

## Scope

In (you own these): `logistics.js` (depots, trucks, supply, the economy tick), the economy parts of `growth.js` (demand, industries, loans, the weekly statement; task 10 owns city growth and the road tool in the same file), ordering and delivery in `units.js`, the Economy, Supply and Industry rooms in `warroom.js`, depot and convoy panels in `inspector.js`, and convoy drawing (move it into a new `render-logistics.js`).

Out: combat rules and new units (task 11), unit names and symbols (task 12), roads and road traffic (task 10). Keep edits outside your files small and in separate commits.

## Design notes

- **Understand it first.** Before changing anything, write down in the pull request how money and supply work today, in plain words, and what is confusing. Fix what does not earn its complexity; cut what the player cannot see or affect.
- **Money you can read.**
  - One clear view: income by source, spending by kind, the trend, and what changes it.
  - Every number the player sees has a "why" one click away.
  - Plain names: "Airline fees", "Grant from the Ministry", "Running costs: air defence".
  - Warnings before the money runs out, not after.
- **Buying is quick.** If you can afford it, a new unit arrives in minutes of game time, not hours: it is bought, loaded and driven (or flown) to where you place it, and you can watch it arrive. Keep a short, visible delay where it adds a decision (a battery takes a few minutes to set up), not waiting for its own sake. Research can take time; ordering should not.
- **Supply that means something.**
  - Missiles, fuel and spare parts come from a small number of depots.
  - A battery that runs low says so and when the next load arrives.
  - Supply follows roads (task 10's network; a cut road detours or blocks).
  - The player sets priorities (which area gets resupplied first), not truck by truck.
- **Convoys that read.**
  - A convoy is a short column of the right vehicles (missile transporters, fuel tankers, flatbeds), with a label when zoomed in ("12 SAM rounds to Aegir-2, 14 min").
  - Its route shows when selected.
  - It moves at road speed in traffic.
  - It can be seen by the enemy, and struck.
  - Far out, supply lines draw as flows between depots and units, thicker when busy, red when cut.
  - No more anonymous orange trucks wandering about.
- **The economy is not a second game.** Keep it light: a few levers (fees, loans, priorities, what to build), each with a visible effect.

## Done when

- `npm test` is green, with tests for:
  - an ordered unit arrives and is ready within a set number of game minutes when money allows;
  - a battery low on missiles is resupplied by a convoy that can be seen on the road;
  - a cut road delays resupply, and the panel says why;
  - the money panel's lines add up to the change in the treasury.
- The pull request starts with "How the economy and supply work", a short plain-words explanation that also goes into the in-game Guide.
- Screenshots of the money view, a convoy on the road close in and far out, and a battery panel waiting for resupply. Look at them first.
- The pull request says what changed and what you could not finish.
