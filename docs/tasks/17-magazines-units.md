# 17 Magazines, reloads, helicopter resupply and more units

Wave 5 (regular session). Runs in parallel with 16 (world scale and income) and 18 (traffic).

## What the owner asked for

> "Let's up the magazine size for AA. Give them a firing magazine and then a storage they can pull from. It happens too often: a long-range AA shoots 8 missiles and is done for 10 minutes if you notice quick enough. It should fire about 16, then spend time to reload from the storage it has, to fire again. And order resupply via helicopter, and the whole heli resupply system should be a bit easier."

> "Overall we need more actual units."

## What is there now

- Each unit has `mags` in `data.js` (`mag` ready to fire, `store` on site, `reload` seconds). For example, the long-range battery has `{ mun: 'LR', mag: 8, store: 8, reload: 150 }`.
- Reloading and stock are in `defense.js` and `logistics.js`.
- Helicopter resupply is `IC.heliResupply` in `logistics.js`. It needs a transport helicopter ready at a base, a depot with stock and good weather, and it is started by a key (H) or automatically when a unit is empty for 30 minutes.

## Goal

**Batteries fight like batteries.**
- A long-range battery has about 16 missiles ready on its launchers (for example 4 launchers × 4) and a stock on site to reload from.
- Launchers reload one at a time, so the battery never goes from full to silent at once. It fires, reloads a launcher, fires again.
- The panel shows ready rounds per launcher, stock on site and the next reload.
- Every air defence unit gets sensible numbers of the same kind:
  - short-range systems carry many cheap rounds;
  - the exo-atmospheric interceptors stay scarce and expensive.

**Helicopter resupply is one click, and often none.**
- The unit's panel has "Resupply by helicopter", with where the missiles come from, which helicopter, the arrival time and the cost, before you press it.
- With Keep stocked on, a unit whose site stock falls below a threshold calls a helicopter by itself when lorries would be too slow or the road is cut.
- The helicopter picks the nearest depot that has the round.
- The panel says why it cannot fly (weather, no helicopter, no stock), in one sentence, with what to do.
- A helicopter can serve several units on one sortie if they are near each other.

**More units.** Add 6–10 new unit types that fill real gaps, each with a reason to exist, fictional names (in `names.js`, like the others) and a plain role. Candidates:
- a medium-range battery on trucks that shoots and moves;
- a gun system for drones;
- a gap-filler low-level radar on a mast;
- a passive sensor that listens for emitters;
- decoy radars;
- a mobile command post that links batteries;
- a laser for small drones;
- a long-range early-warning radar;
- a coastal or naval-style battery, if the map has a coast.

Keep what the Test range and the Academy use working.

## Scope

In:
- `data.js` unit and munition stats;
- reload logic in `defense.js`;
- helicopter resupply and Keep stocked in `logistics.js` (not the economy tick, which is task 16's);
- `units.js` buying;
- `names.js`;
- the unit's panel in `inspector.js`: magazine, stock and resupply rows only;
- symbols for new units in `render-combat.js`: glyphs only.

Out:
- World size and income (16), traffic (18), enemy behaviour (19), altitude and missile flight (20), aircraft (21), 3D models (22).

## Done when

- `npm test` is green, with new tests:
  - a long-range battery fires about 16 before it pauses, then reloads launcher by launcher from site stock and keeps firing;
  - with Keep stocked, a battery low on stock behind a cut road is resupplied by helicopter without the player doing anything;
  - "Resupply by helicopter" says why not when weather grounds the helicopters;
  - each new unit type can be bought, placed, and does its job in a Test range run.
- Every Academy lesson still completes; retune a lesson if its numbers change, and say how.
- The pull request has:
  - screenshots of a battery's panel mid-reload, a helicopter resupply on the map, and each new unit's symbol;
  - a Test range table for each new unit (shots, kills, cost);
  - what you could not finish.
