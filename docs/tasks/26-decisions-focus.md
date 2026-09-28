# 26 Fewer things on screen, and every choice a trade-off

Wave 8. Builds on task 24, which does this for Act I's economy, deals and guide.

## What the owner agreed to

> "The guide feels like info vomit." "No contract feels like it has weight: I just rushed through and clicked and clicked."

The coordinator suggested applying two principles to the whole game, and the owner agreed:
- **One core loop per act.** Everything else runs quietly or is handed to a delegate.
- **Every decision a trade-off with a visible cost**, never a checkbox.

## Goal

**Focus, act by act:**
- Define the core loop and the three to five decisions that matter in each act:
  - Act I: build and run the airport;
  - Act II: the airspace and the first incidents;
  - Act III: the air defence;
  - Act IV: the war.
- Rooms, panels and alerts show those first. Everything else is folded away, summarised in one line, or run by a delegate the player can appoint (who does it adequately, not optimally).
- **Alerts:** one queue, sorted by what needs the player now. There are no more than a few on screen, and nothing informational interrupts.

**Trade-offs everywhere.** Review every button that commits the player and give each a cost and a benefit, shown before the click:
- weapons rules (free, tight, hold): risk to airliners against leakers;
- airspace closure: revenue against safety;
- research: what you give up while researching;
- buying units: running costs, crews and depot space;
- airport expansion: disruption while it's built;
- delegates: cost and quality.

The player should be able to say why they chose something.

## Scope

- `ui.js`, `warroom.js`, `inspector.js` (presentation and the alert queue); delegates in `story.js`; costs and effects where each decision lives.
- Coordinate with 24 (merged by then).

## Done when

- `npm test` is green.
- For each act, the pull request lists its core loop and decisions, with a screenshot of what the screen shows at that point.
- A list of every committing button with its visible trade-off; any button that remains a plain checkbox is justified.
- An alert-flood test: during a big raid, no more than N alerts on screen at once, and none of them informational.
