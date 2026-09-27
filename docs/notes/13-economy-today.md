# How the economy and supply work today (before task 13)

Written before changing anything, from reading `logistics.js`, `growth.js`, `units.js`, `warroom.js`,
`inspector.js` and `render.js`. Plain words, then what is confusing.

## Money

- **Where it comes from** (per game hour, worked out in `IC.economy`):
  - a base grant (₭25M/h in Quick war; `S.story.grant` in the Career, ₭5M/h at the start),
  - city taxes (`pop × 0.02 × prosperity × morale`), only a quarter of them in Act III and all of them in Act IV,
  - trade taxes (15% of what the remote industries sell, `growth.js`),
  - airline fees (landing, passenger, cargo and overflight charges, paid per flight in `aviation.js`),
  - "airport revenue" (a flat `rev` per airport, only when the airline model is off),
  - allied support (`support × 0.12`, Act IV only), plus random aid packages, war bonds, story grants and loans.
- **Where it goes**: running costs of every air-defence unit (`d.up`, with a hidden 15% surcharge for each other
  radar on the same band), ₭0.6M/h per air force flight, army brigades, airport upkeep (0.12% of the parts' cost an
  hour), staff (delegates in the Career), loan repayments; mobilization multiplies taxes and running costs.
  One-off spending (units, truck companies, munitions, research, airport works, roads, sorties) is taken from the
  treasury where it happens and is *not* booked by kind.
- **What the player sees**: the top bar shows the treasury and `income − upkeep` an hour, but that figure includes
  airline fees that are paid per flight, so it is not the real change. The Industry room has a "Budget per hour"
  table that misses half the lines (airline fees, trade, airport upkeep, staff, loans). The Economy room has a weekly
  statement with a catch-all "Construction, orders and research" line worked out as whatever is left over.

## Buying equipment

- Order a unit from the arsenal: pay, wait for a production slot (3 in peacetime), then its lead time
  (10 minutes to 1 h 40 of game time), then it sits in the "reserve". Deploy it: click the map, and it drives from the
  nearest depot, garrison or air base, then sets up. A fixed site is built where it is placed (15 min to 1 h).
- So the path from "I have the money" to "it is on the map" is: order → queue → lead time → reserve → place → drive
  → set up. Three waits, two clicks, and nothing on the map until the second click.

## Supply

- **Stock**: 12 kinds of item (IR, SR, MR, LR, BMD, HAT, EXO, cruise, ballistic, rockets, anti-tank kits, supply
  pallets). They live in depots (a Central Depot plus forward depots the player places), in factories and at airports.
- **Where stock comes from**: factories build munitions on "production lines" you pay for per round (5 min to 3 h a
  round per line), and make supply pallets on their own; imports are bought at a markup and flown to the capital's
  airport by an allied airlift 25–45 minutes later.
- **Who moves it**: "truck companies". Every factory has two, every airport one, the Central Depot two, each forward
  depot two, and more can be bought for ₭12M. Every 20 s a dispatcher looks for jobs: brigades short of supply,
  batteries short of missiles (priority units first), then every 2 minutes factories and airports push stock to the
  depot with the biggest shortfall and forward depots pull from the Central Depot. A job loads for 3–4 minutes,
  drives, unloads for 3 minutes and returns.
- **What a depot wants**: the full reload of every unit inside its 140 km ring, times a "stock profile" factor
  (Balanced, Air defence first ×1.6, Army first ×0.5).
- **Helicopters**: when a battery is empty and no truck can come, a transport helicopter flies missiles in; brigades
  can get helicopter lifts of supply, anti-tank kits or replacements.
- **On the map**: every truck company is drawn as a column of orange boxes, even when idle at a factory or an
  airport, with a label like `AMMO 4×SR`. A selected convoy shows its route as a dashed line.

## What is confusing

1. **There is no single money view.** Three different figures (top bar, Industry "Budget per hour", Economy
   statement) disagree, and none says why a line is what it is.
2. **Nothing warns before the money runs out.** The first sign is a negative treasury.
3. **Buying is slow and indirect.** Order → slot queue → lead time → reserve → place → drive → set up. The player
   pays and then waits with nothing to watch.
4. **Missiles are bought twice, in a different room.** A battery comes with a full magazine, but its reloads come
   from depot stock that only fills if the player remembers to buy rounds at a factory (Industry room). When stock
   runs dry, batteries quietly stop being resupplied.
5. **Supply runs through four hops** (factory → Central Depot → forward depot → battery, or airport → depot) each
   with its own loading time, and a dispatcher the player cannot see.
6. **Stock profiles** multiply an invisible demand by an abstract factor. The player cannot tell what it changes.
7. **Anonymous orange trucks.** Idle companies at factories and airports are drawn like convoys; labels such as
   `RESTOCK` or `AMMO 4×SR` do not say where they are going, for whom or when they arrive.
8. **A battery does not say when its next load comes**, or why it is not coming (no stock, no truck, road cut).
9. **A cut road is invisible to supply**: convoys slow down off-road through the gap, but nothing says so.

## What the task changes (plan)

- One money view: income by source, spending by kind, per hour now and per week, each line with its reason, a
  forecast of when the money runs out, and a warning well before it does.
- Buying: pay when you place it; the unit is loaded at the nearest depot or airfield and drives there at once.
  No production slots, no lead time; set-up stays (it is a decision: a battery is blind while it sets up).
- Missiles: bought as stock at the depots, automatically if the player lets the Ministry keep them stocked.
  One hop: depot → unit. Plants and imports fill the Central Depot directly.
- Depots: service area plus a resupply priority (first / normal / last) instead of stock profiles.
- Convoys: only trucks on a job are on the map, as a column of the right vehicles with a label that says what, to
  whom and when; flows between depots and units far out, red where a road is cut.
- Units say when the next load arrives and why it is late.
