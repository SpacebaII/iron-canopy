# 14 Menus and progression that feel polished

Wave 4. Runs in parallel with 07 (Career). Needs 11, 12 and 13 merged.

## What the owner asked for

> "Much friendlier menus and progression. Make it look more polished, with better names. No one is memorizing what we currently have, and everything looks the same."
> "This is still a game. It needs to feel like a good one."

## Goal

A new player finds their way without a manual. Every screen looks like part of one designed game, the player always knows what to do next and what they have unlocked, and nothing needs memorising.

## Scope

In: `ui.js`, `inspector.js`, `warroom.js`, `main.js` (input and keys only), `app.css`, the start screen in `index.html`, and the research and unlock presentation.

Out: game rules, drawing on the map (task 12 did combat, task 10 towns), the Career's content (task 07, which adds prompts and unlocks through your UI).

## Design notes

- **One visual language.** A small set of components (panel, card, list row, button, tab, badge, meter) used everywhere, consistent spacing and type, icons with labels, colour meaning the same thing everywhere (friendly, hostile, warning, money). Use the unit symbols and names from task 12.
- **Fewer, clearer menus.** Audit every room and panel: cut, merge or rename. Tabs where a panel is long (the airport panel already has them). Plain labels, no codes the player has not been taught, tooltips that explain in one sentence.
- **Progression you can see.**
  - What is new is marked.
  - What unlocks next, and how, is shown.
  - Research reads as a tree of choices with effects in plain words.
  - Goals sit in one place with progress bars.
  - Unlocks arrive with a short, well-made moment.
- **The start screen and the first minutes.** A clean title screen, clear mode choices (Career, Quick war, Academy, Test range), settings, and a first-run hint layer that task 07's tutorial can use.
- **Keyboard and mouse.** Shortcuts shown on buttons, Esc always backs out, and right-click never surprises.
- Keep the owner's preferences in CLAUDE.md: the interface floats on the map with no hard borders, and is readable at a 15 px base.

## Done when

- `npm test` is green.
- Before and after screenshots of every room, the main panels, the start screen and a new player's first five minutes. Look at them first.
- The pull request lists what was cut, merged and renamed, and what you could not finish.
