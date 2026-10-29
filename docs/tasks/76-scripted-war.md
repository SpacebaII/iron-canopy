# 76 The scripted war: the enemy flies a written plan, not the dice

Owns `js/warplan.js` (the engine, headless), `js/war-homeland.js` (the Career's plan for the map) and the hooks in `enemy.js` (the calm hands over to the plan, the opening flies the plan's first wave, launchers hide where the plan says, a report carries the plan's note).

## What the owner said

> "we are taking the game deep into the story … so we need to drop the randomness as well as be able to script attacks with some procedural-ness … to truly make the player feel the difficulty of proper leadership and deadly coordination"

## What this brief does

1. **A plan per map** (`IC.WAR_PLANS[map]`): batteries (`w` a weapon family, `n` launchers, `salvo`, `stock`, `tier`, `replace`; `sam` for their own air defence) and waves (`when`, `night`, `act`, `warn`, `intel`, `say`, `cut`, `hits`, `loop`, `retaliation`). Every field is documented at the top of `warplan.js`.
2. **The Career's war flies it.** `IC.enemyInit` starts the map's plan in a Career; `IC.enemyOpening` opens with its first wave; the commander's calm asks `IC.wpCalm` and plans nothing of its own. The raid machinery is the same as before: build-up, warning, raid, after-action report. Retaliation waves come whenever we strike their soil.
3. **Launchers are real.** Ballistic and rocket batteries put their launchers in `S.tels`: they drive from hiding to the battery's firing point, set up, fire on time and drive back, and can be located and destroyed as before. Every other battery has launcher records. A wave fires only from live launchers; a battery with none left is skipped, and the warning and the report say so.
4. **Light variation, seeded per game**: a wave's peak moves by up to 10 minutes (`vary.t`), counts may be ranges, a hit may fly with a chance (`p`), and `alt` targets stand in. Targets are named (`city:`, `place:`, `infra:`, `apt:busiest`, `ad:radar`, `set:fuel`…) so the plan survives what the player builds; one that is not there falls back to one of its kind, then the main air base.
5. **Operation Iron Gate**: 25 batteries on Korvath's and Tessk's soil and twelve waves, from the opening strike to the major strike and a campaign loop, with Volkan's intercepted orders.

## Worth knowing

- The arms tiers (#103) follow the wave's `act`.
- `opts.warPlan: false` in `IC.newGame` keeps the old commander (balance comparisons); Quick war and the Academy keep it anyway.
- Slow weapons set the pace: a wave's peak waits for its slowest hit (a Moth crossing 500 km takes hours).
