# 30 Cities that make sense: roads through towns, traffic on streets

Wave 8.

## What the owner said

> "I understand traffic is hard; it is looking better. But if you look at a city, you will 100% see what I'm talking about: it looks illogical."

The traffic count has already been halved (`IC.TRAFFIC_SHOW = 0.5`).

## What the coordinator saw (screenshots of the capital at zoom 4, 12 and 30)

- **National main roads run straight through cities at an angle,** across the city's own street grid and over blocks and buildings, instead of joining it. This is most of the "illogical" look.
- **Traffic piles onto those through-roads:** red congestion streaks, queues. Meanwhile the city's own streets are nearly empty close in.
- **At the middle zoom,** flow dashes are drawn along those same diagonal roads across the blocks.

## Goal

**Roads meet cities properly:**
- A national road entering a city becomes one of the city's streets. Pick the arterial of the city's lattice closest to the road's direction, widen it to an avenue or boulevard, and route the road along it through the centre or around it as a ring or bypass.
- No road passes over a block. Blocks on a road's line give way; the road is not drawn over them.
- Motorways skirt cities or pass on a clear corridor, with interchanges at the edge.
- The city's grid bends or its blocks shift to meet the roads where needed, so the result reads as a real town where the old road became the high street.

**Traffic uses the city:**
- Commuters, errands and deliveries are spread across the street network by the zones' homes, jobs and freight, so residential streets have some cars, the high street and avenues many, and national roads the through traffic.
- Congestion shows where it would really be: approaches to the centre at rush hour, bridges and ring roads, not every through-road at all hours.
- Keep the halved count and the budget.

## Scope

- City and road generation where they meet: `cities.js` and `gen.js`.
- Traffic assignment and drawing: `traffic.js` and `render-roads.js`.
- Terrain tiles if roads move: `terrain.js`.

## Done when

- `npm test` is green, with tests:
  - no road segment inside a city crosses a block;
  - every national road entering a city continues along one of its streets or around it;
  - close in at rush hour, a residential street carries traffic and the busiest links are the arterials, not a diagonal through-road.
- The pull request has before and after screenshots of the capital and two other cities at zoom 4, 12 and 30, and frame and step times.
