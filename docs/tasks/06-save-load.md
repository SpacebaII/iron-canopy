# 06 Save and load

Needs tasks 01 to 03 merged first, so the data it saves is settled.

## What the owner asked for

> "Also add the save and load feature."

## Goal

Save a game at any moment and load it later, in the same browser, with nothing lost or broken, including mid-air missiles, taxiing aircraft and half-built runways.

## Scope

In: a new `save.js`, the save and load interface (start screen and settings room), and small hooks where a module keeps state outside `S`.

Out: gameplay changes.

## Design notes

- **Save the state, rebuild the rest.** The world regenerates from its seed (`IC.generate`), so save the seed and the changes (damage, captures, built parts, craters), not the terrain.
- **Keep it generic.** Other tasks will keep adding fields to `S`. Write a serializer that walks the object graph, gives shared objects an id and restores references. It must survive new fields without per-field code.
  - Skip what can be rebuilt: canvases, caches (`ap.G`, `ap._box`), `Map`s used as indexes, and functions.
  - For functions stored in state (callbacks such as `onAir` on ground moves, `fn` in `S.later`, event card effects), replace them with named handlers so they can be restored. That refactor is part of this task.
- **Where saves live.** IndexedDB or localStorage, in several slots with a name, date and act, plus export and import as a file.
  - The game is published as a web page where each viewer has their own storage, so saves stay in the player's browser.
  - Wrap all storage access in try/catch.
- **Versioning.** Store a save version. Refuse or migrate old saves with a clear message rather than loading them broken.

## Done when

- `npm test` is green, with a test that saves and loads a Career game and a Quick war mid-battle. It then runs both on and checks they match unsaved runs closely: same aircraft, same airports, same works in progress, and no errors.
- Saving and loading through the interface works in the browser. Include screenshots.
- The pull request says what is not saved, if anything.
