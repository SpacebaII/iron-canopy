# 30 Cities that make sense: roads through towns, traffic on streets

Wave 8.

## What the owner said

> "I understand traffic is hard; it is looking better. But if you look at a city, you will 100% see what I'm talking about: it looks illogical."

The traffic count has already been halved (`IC.TRAFFIC_SHOW = 0.5`).

## What the coordinator saw (screenshots of the capital at zoom 4, 12 and 30)

- **National main roads run straight through cities at an angle,** across the city's own street grid and over blocks and buildings, instead of joining it. This is most of the "illogical" look.
- **Traffic piles onto those through-roads:** red congestion streaks, queues. Meanwhile the city's own streets are nearly empty close in.
- **At the middle zoom,** flow dashes are drawn along those same diagonal roads across the blocks.

## The owner's reference

> "For the traffic and streets, reference city street maps like New York, Chicago, London, Paris, Dubai, and try to get the generations to be variants of that."

## City plans as templates

Every generated city is a variant of one of five real street plans. The template is picked by the city's style (`c.style`), size and terrain, and randomised within its rules so no two cities are copies. Study the real maps and capture what makes each one readable, not its exact streets.

- **New York (`us`, large, on water):**
  - a strict rectangular grid of long avenues and short cross streets;
  - one old diagonal (like Broadway) that cuts across it and makes squares where it crosses avenues;
  - a large park rectangle;
  - an older irregular tip where the grid began;
  - bridges and tunnels at the edges;
  - expressways along the waterfront, not through the grid.
- **Chicago (`us`, inland or on a lake):**
  - a mile grid of major arterials with a finer street grid inside;
  - a few long diagonal avenues radiating from the centre;
  - a compact downtown loop;
  - expressways radiating out in corridors, with interchanges at the grid;
  - a lakefront drive.
- **London (`eu`, old, on a river):**
  - an organic medieval core of short, irregular streets;
  - old high roads radiating out, each a high street through former villages, now districts;
  - an inner and an outer ring road;
  - a river crossed by many bridges;
  - green squares and parks scattered through.
- **Paris (`eu`, planned):**
  - Haussmann boulevards: long straight avenues radiating from star-shaped squares (étoiles), cutting through an older fabric;
  - concentric boulevards on the lines of the old walls;
  - a ring motorway (périphérique) at the edge;
  - a river through the middle, with bridges and islands.
- **Dubai (`new`, desert or coast):**
  - linear along one great highway (like Sheikh Zayed Road), with tall towers lining it;
  - superblocks between big interchanges, with curving residential streets inside;
  - large, spread-out cloverleaf junctions;
  - newer districts as separate planned islands of development.

Keep today's districts (old, business, dense, suburbs, industry, logistics, rail) and let the template place them: the business district along the Broadway-like diagonal or the Dubai highway, and the old core in London's centre. The enemy's `east` style keeps its own character (Soviet-style: wide prospects, big squares, microdistrict superblocks) but follows the same rules.

## Goal

**Roads meet cities properly:**
- A national road entering a city becomes one of the city's streets. Pick the arterial of the city's lattice closest to the road's direction, widen it to an avenue or boulevard, and route the road along it through the centre or around it as a ring or bypass.
- No road passes over a block. Blocks on a road's line give way; the road is not drawn over them.
- Motorways skirt cities or pass on a clear corridor, with interchanges at the edge.
- The city's grid bends or its blocks shift to meet the roads where needed, so the result reads as a real town where the old road became the high street. With the templates above, national roads join the template's own arterials: a radial high road (London), a boulevard (Paris), an arterial of the mile grid (Chicago), the great highway (Dubai).

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
- each of the five templates appears on a typical map, and two cities of the same template are visibly different.
- The pull request has:
  - before and after screenshots of the capital and two other cities at zoom 4, 12 and 30;
  - a side-by-side of each template's generated city next to a sketch of the real plan it follows;
  - frame and step times.
