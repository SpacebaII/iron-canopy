# 25 One game: what you build in peace matters in war

Wave 8.

## What the owner agreed to

> The best version makes Act I's choices pay off, or hurt, in the war. The trade-off between economy and safety is the game's own identity. *(The coordinator's suggestion; the owner: "I love everything.")*

## Goal

Right now the Career plays as an airport tycoon, then a separate air defence game. Link the halves on purpose, so that every major peacetime choice has a visible wartime consequence and every wartime choice has a civil cost.

**Peace shapes war:**
- **Civil radars:** the radars built for air traffic control see the border too. In war they feed the air picture, and are targets.
- **Hangars and concrete:**
  - hangars shelter aircraft from blast and debris;
  - reinforced concrete craters less and is repaired faster;
  - a single-runway airport is one crater from closed.
- **Airports:**
  - a busy airport is the country's income, a reason for the enemy to strike it, and a place to base fighters, disperse aircraft and bring in allied airlift;
  - the airport's size, layout and taxiway redundancy decide how well it survives.
- **Roads:** roads and access roads built for passengers carry convoys and repair crews.
- **Standing with the airlines:** reputation with airlines built in peace decides who keeps flying in, who leaves when the shooting starts, and how fast they come back.

**War costs peace:**
- **Closing the airspace** stops airline revenue and angers the carriers. Keeping it open risks an airliner being hit, which is a catastrophe.
- **Restricted and danger areas** (task 20) push airways into longer detours.
- **Military use of civil airports** takes stands and runway slots from the airlines.
- **Damage:** repairs compete with expansion for money and crews.
- **Evacuations and airlifts:** civil airliners can be asked to fly people out, at a price.

**Make the links visible:**
- When an Act I choice matters in the war, say so at that moment ("Reinforced concrete: the crater is half the size").
- In Act I, hints say what a choice will mean later, sparingly and in plain words.

## With the calendar (32)

The Career now spans ten years or more, with a calendar by months (brief 32). Use the time: consequences should arrive years after the choice.
- **Ageing:** a runway paved in Year 2 is older, and weaker against craters, by Year 9 unless it was renewed. An airport's hardened shelters, fuel farm and radar cover grow or age with it.
- **Airlines on long deals:** closing the airspace breaks deals that were meant to run for years. The airlines remember it, in offers and charges, for months after.
- **The gray zone over months:** incidents in Acts II–III rise month by month. What the player built in the quiet years is what they have when it turns.
- The play-through note gives the calendar date of each choice and of the moment it paid off.

## Scope

- Hooks across `airport.js`, `aviation.js`, `airspace.js`, `story.js` (Acts II–IV), `enemy.js` targeting (with task 19's merged work) and `growth.js`.
- Keep each link small and testable.

Out:
- New systems. This task connects existing ones.

## Done when

- `npm test` is green, with a test for each link:
  - civil radars feed the military picture;
  - a hangar protects aircraft;
  - closing the airspace costs airline revenue;
  - an airliner in a contested area can be lost.
- A play-through note in the pull request describes three moments where a peacetime choice decided a wartime outcome, with screenshots.
