# 05 Growth and trade

Needs tasks 01 and 02 merged first.

## What the owner asked for

> "Find a way to make an airport bigger that makes sense in the game: maybe stimulate city growth, access to imports and exports for a remote industry, etc."
> "Start very small… get really good at the aviation side, then the economic side."

## Goal

A bigger airport should be worth it for reasons the player can see: cities grow, industry gets markets, and money follows. This is what makes the economy the second thing the player learns after aviation.

## Scope

In: the economy in `logistics.js`, demand in `aviation.js` (how many passengers and routes a city generates), city growth (population, prosperity) in cities' data, and a new trade layer for cargo.

Out: the airport simulation rules (task 02), the builder (task 04), the story (task 07 will use what you add).

## Design notes

- **Demand from cities:** passenger demand between two cities depends on their size, prosperity, distance and the service quality. Service quality means frequency, delays and fares, which follow the airport's charges.
- **Growth from connections:** cities with good air service grow in population and prosperity over days, which raises taxes and demand. Cities with poor service stagnate. Show it in the city panel ("grew 2% this week, mostly from new routes to …").
- **Cargo and trade:**
  - Industries, including remote ones (mines, farms, factories far from the capital), produce goods that need markets.
  - Air cargo gives them access to imports and exports: freighters, cargo terminals, belly cargo on airliners.
  - Without an airport or road link they produce less.
  - Imports matter too, for example spare parts and fuel supply.
- **Money that makes sense:** revenue from fees and trade taxes; costs from upkeep, staff and loans. Big projects may need borrowing, with interest. Show a clear weekly statement.
- Keep the numbers readable. The player should be able to say why their income went up.

## Done when

- `npm test` is green, with tests for:
  - better service raises demand and city growth over a few game days;
  - a remote industry with an air cargo link out-produces one without.
- The city and economy panels explain the numbers in plain words.
- The pull request includes a balance run: Career Act I over three game days, printing income, growth and demand.
