# 18 Road traffic: lifelike, cheap, a sign of health

Wave 5 (regular session). Runs in parallel with 16 (world scale and income) and 17 (magazines and units).

## What the owner asked for

> "The traffic also can have less detail than modelled stop lights. I saw a performance issue there. I'm more so going for something that looks lifelike but can pick a random path while looking like normal traffic. It's more a sign of health, or of needs: how much, and where traffic is going."

## What is there now

`traffic.js` assigns trips to routes, turns them into loads per link and hour, places vehicles in slots at middle zoom (`IC.trafficVisible`), and close in runs vehicles on their own trips (`IC.trafficAgents`). Those vehicles keep lanes, stop at signals and give way. `render-roads.js` draws signals and streetlights.

## Goal

- **Close in, traffic looks like normal traffic but is cheap.**
  - Vehicles drive in lane, keep a gap, slow at junctions and turn plausibly, on random paths weighted by the link loads.
  - They don't have to reach real destinations, and signals don't need phases: a vehicle slows through a junction and yields to one already in it.
  - Drop anything that costs more than it shows.
- **Traffic reads as health.** How much traffic, and where it goes, tells the player how the country is doing:
  - busy rush hours in a healthy city;
  - lorries on the roads to industries and airports;
  - empty roads in a raid or after one;
  - queues at a cut road or a fallen bridge;
  - thin traffic in a shrinking town.
- **Keep the numbers that matter.** Keep the loads per link from trips, since growth and supply read them, but compute them less often or more cheaply if that helps.
- **Budget:**
  - the frame stays at 60 fps with the capital close in at rush hour;
  - the traffic part of the step stays under 0.05 ms.

  Measure before and after on the new, larger world if task 16 has landed, or on today's.

## Scope

In: `traffic.js`, road traffic drawing in `render-roads.js`, and the Traffic map layer.

Out:
- The road network and cities themselves (16);
- convoys (`logistics.js`, `render-logistics.js`);
- aircraft.

## Done when

- `npm test` is green. Update the traffic tests to what the owner asked for:
  - rush hour is busier than night;
  - a raid empties the roads;
  - a cut road makes a visible queue;
  - the budget test.
- The pull request has:
  - before and after frame times close in at rush hour;
  - a short screen recording or a few frames of close-in traffic;
  - what you could not finish.
