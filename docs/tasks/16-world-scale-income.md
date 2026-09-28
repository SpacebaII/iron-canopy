# 16 A world ten times larger, and money to defend it

Wave 5 (regular session). Runs in parallel with 17 (magazines and units) and 18 (traffic). Wave 6 builds on it.

## What the owner asked for

> "We need to make the scale a lot larger. It seems unreasonable for all this air traffic in such a small place."

> "We need more income. It takes a very long time to feel properly protected, or even like you are keeping the country safe."

The owner chose **ten times the area**: about 3.2 times longer each way.

## Goal

**The world grows from 1,800 × 1,350 km to about 5,700 × 4,300 km** (`IC.WW`, `IC.WH` ≈ 57,000 × 43,000 units).
- It stays a region of real scale: our country, the hostile neighbours, the neutral ones, and the sea or mountains around them.
- Everything still sits at real size: runways, city blocks, missile ranges, aircraft speeds.
- The country gets correspondingly more cities, villages, roads, railways, industries and airfields. It must not be the same country with more empty land between places.

**Income:** a player who builds sensibly can afford a defence that feels like it protects the country, well before the heavy fighting.

## Scope

In:
- `core.js` world size and zoom limits.
- `gen.js` and `cities.js` generation at the new size: counts, spacing, road grid, rivers, borders.
- `world.js` and `terrain.js`: routing, tile painting and the far image, which must stay inside their budgets.
- The minimap.
- Start-up camera and `IC.cap` framing.
- Money in `logistics.js` (economy tick), `growth.js` (demand, tax) and `story.js` / `campaign.js` start money and grants.

Out:
- The enemy's behaviour and pacing: task 19 on the next wave. Only fix what the size change breaks, such as sites placed outside the map.
- Magazines and unit types (17), traffic (18), airspace classes (20).

## Design notes

**What grows with the map, and what doesn't:**
- More places: roughly 3–4 times as many cities and villages for our country.
  - The capital and the big cities keep their real sizes; there are just more of them.
  - Keep the city styles and districts from task 10.
- Airports and air traffic spread out: flights between our cities are now 300–1,500 km. Airline demand (`growth.js`) must still add up with the new distances; longer routes favour bigger aircraft.
- Enemy launch sites and airbases move back to match the distances. A ballistic missile still reaches the capital; a drone takes longer to get there.
- Ranges of our weapons stay real, so one battery now covers a much smaller share of the country. That is intended: the player must choose what to protect. Income and unit counts (17) must make that choice feel fair, not hopeless.

**Performance:**
- World generation stays under its time budget. The test `world: generation stays under the time budget` may get a new budget; say what and why.
- The far image and tiles paint on demand as now; memory must not grow tenfold. Measure the step and the frame with a busy capital.
- `IC.travelFrom` and routing work on the larger road graph without stalls. Precompute what can be precomputed at generation time.

**Money:**
- Quick war:
  - by the first big raid, a player who spends sensibly has two layers of air defence over the capital, the main airbase and the two largest cities;
  - by the end of day 2 they can add radar cover along the border.
- Career: Act I stays slow (task 07), but from Act II the military budget grows enough that the country visibly fills with defences.
- Keep money meaningful: running costs, losses and wasted missiles still hurt. The owner wants to feel safe because they built well, not because money is endless.
- Print the numbers in a balance run (`econtest.js`): income per hour, what the player owns by hour 6, 24 and 48, and the treasury.

## Done when

- `npm test` is green.
  - Tests that depend on distances are updated to the new world, not deleted.
  - New tests:
    - the world is about 5,700 × 4,300 km, with at least three times the cities of before;
    - generation stays within budget;
    - a sensible scripted spender in Quick war has the defence described above by the first big raid.
- Every Academy lesson still completes. The Academy may keep a small map if that is simpler; say so.
- The Career still plays through Act I (the scripted player).
- The pull request has:
  - screenshots of the whole map, the capital region and a busy airport;
  - generation time, step and frame times before and after;
  - the balance run's money numbers;
  - what you could not finish.
