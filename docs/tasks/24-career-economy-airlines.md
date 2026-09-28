# 24 The Career's first airports: money, airlines, pace and teaching

Wave 7 (regular session). Runs alongside wave 6 and task 23.

## What the owner said after playing

> "I'd say start with 5.5 million, because I ran out and it sucked. The player shouldn't be too concerned with money for his first airport, as it will start pretty big and be his income generator. That amount will naturally dwindle as he is inefficient and has to do other tasks; it'll balance out."

> "The economy isn't even explained and feels like slop. One, withhold that info; then two, gradually introduce ways to manage it, and what good versus bad looks like."

> "The Aviation tab looks so boring and needs to be overhauled, along with the Airlines tab. No contract feels like it has weight: I just rushed through and clicked and clicked. Each deal should feel like it means something. It should truly mean something to have a busy, bustling airport with cargo, instead of just GA."

> "The guide feels like info vomit: tons of irrelevant info thrown at the player. It should be guides on relevant current or past lessons."

> "The game is progressing very, very fast. Let the pace be a bit slower: you shouldn't get through each act within 5 minutes. That doesn't mean making it slower; just require more soft requirements. That can look like slowing acquisition of new contracts, while also requiring more from the size of the airport, like enough on-field logistics, or hangars for multi-day stays: accommodations that eat that initial budget. Then the income starts to catch up, and expansions follow."

> "Find a way where the country will not only have one super hub: a large airport makes sense, along with other small ones, and they should grow in size by logical demand. Placement of smaller airports should likely not be at the very start, and they shouldn't spawn on routes of traffic."

> "The surplus is okay, because the war will definitely require that from the player: not only the lack of income, but the repairs and equipment costs. I'm not worried about the player having some surplus."

## Goal

**1. Money: enough to build a real first airport.**
- The Career starts with **₭5,500M** (the owner's 5.5, in the game's ₭M: ₭5.5 billion; five times today's ₭1,100M).
- The first airport is big and becomes the income engine.
- Balance so that a sensible player ends Act I with a comfortable surplus. An inefficient one (idle stands, unhappy airlines, overbuilt parts) sees it shrink, with the cause shown.

**2. Pace by soft requirements, not timers.** Acts and chapters move on when the airport can really carry more:
- airlines only sign more when their needs are met: enough stands and gates, fuel throughput, hangar space for aircraft staying several days, cargo handling, maintenance, on-field logistics;
- new contracts arrive more slowly and in proportion to the airport's reputation;
- **target:** a good player needs well over an hour of real play for Act I at normal speeds (measure it with the scripted player in real minutes at 1× to 4×, and report it);
- no chapter can be finished in under five real minutes.

**3. Contracts with weight.** Airlines offer **deals** instead of one-click route requests:
- each has terms: the aircraft and how many flights a week, a contract length, landing and passenger charges, the facilities they require (gates, hangar nights, cargo handling, fuel), penalties for delays or cancellations, and what they bring (passengers a day, cargo tonnes, reputation);
- the player can negotiate a little (charges against length or exclusivity) and must honour the deal;
- a broken deal costs reputation and money;
- cargo carriers need cargo facilities and make the airport visibly busy with freighters and lorries;
- general aviation stays small money.

**4. The Aviation and Airlines rooms, overhauled.**
- An airline page shows its fleet, its routes on a map, its satisfaction with reasons, its deal and what it wants next.
- The airport's day as a timeline: arrivals, departures and busy hours.
- Make it look like an airline operations centre, not a spreadsheet.

**5. The economy taught as it opens.**
- At the start the Economy room shows only what matters: money in, money out, the airport's income.
- Later chapters open the levers one at a time (charges, loans, taxes, trade), each with a short lesson on what good and bad look like ("a stand earns about ₭X a day; below Y it is idle").

**6. The guide follows the player.**
- The Guide shows only lessons the player has reached, the current one first, plus lessons they have been through.
- Nothing about ballistic missiles in Act I.

**7. A national network that grows by demand.**
- The first airport is at the capital or the biggest city.
- Other cities ask for airports later (not at the start), and only where demand exists. Their size follows that demand: a regional field, then a growing regional airport.
- Sites are never on the approach or departure paths, or under the busy airways, of existing airports.
- The capital's hub stays the biggest, but the country ends up with a hub and several regionals, not one super hub.

## Scope

In:
- Act I in `story.js` (not the war acts, which are task 19's);
- deals and airline behaviour in `aviation.js` (keep clear of the routing, levels and ATC code task 20 is changing there);
- demand and airport growth in `growth.js`;
- airport site choice in `gen.js`, only if needed;
- the Aviation, Economy and Guide rooms in `warroom.js`, in their own functions;
- the Career's start money.

Out:
- Building and ground services (task 23: you set what airlines require, they build the facilities that provide it; agree names in the first commits, for example `IC.aptProvides(ap)`).
- Airspace (20), the enemy (19).

## Done when

- `npm test` is green, with tests:
  - the Career starts with ₭5,500M;
  - an airline will not sign a deal until the airport has the facilities it requires;
  - a broken deal costs reputation;
  - a second city asks for an airport only once its demand is there, and never on another airport's approach;
  - the Guide shows no lesson the player has not reached;
  - the scripted player needs at least N game hours for Act I (set N from the owner's "well over an hour of real play" at normal speed, and justify it).
- Every Academy lesson still completes, and the scripted player still reaches Act II.
- The pull request has screenshots of the new Aviation room, a deal, the airline page, the Economy room early and later, and the Guide; the timeline of Act I from the balance run; and what you could not finish.
