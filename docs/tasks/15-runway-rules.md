# 15 Runway rules: control over airport operations

Wave 4. Runs in parallel with 07 (Career) and 14 (menus and progression).

## What the owner asked for

> "Let's try to have some more control over the airport operations. I don't like seeing all airplanes enter the runway early. Now that's okay for GA, but a way to deem what's acceptable."

## Goal

The player sets the rules the tower follows at each airport: when a departure may go onto the runway, how close an arrival may be when it does, when aircraft may cross a runway, and whether small aircraft may depart from an intersection. The rules differ by kind of aircraft: a club Cessna may line up early, while an airliner waits at the hold-short line until the runway is really its own. Aircraft visibly hold at lit stop bars until the rules let them on. Every rule has a price the player can see before choosing it (departures an hour, delay) and a benefit (fewer incursions, go-arounds and accidents).

## First: find what the owner saw

Before changing anything, reproduce it. Watch a busy capital airport and the six-runway `'kden'` layout close in, by day and at night, and screenshot every case where an aircraft goes onto a runway earlier than a careful tower would allow. Candidates:
- a departure lining up while an arrival is on short final;
- a departure entering behind one that is still rolling;
- aircraft taxiing along a runway (backtracking) or crossing it just ahead of an arrival;
- several aircraft sharing one runway clearance (`L.with` in `groundops.js`).

Today a departure takes the runway's clearance at the hold-short line as soon as the runway is free (`canTake`, `take`, `lineUp` in `groundops.js`). Nothing looks at how far away the next arrival is, and nothing depends on the kind of aircraft. Write what you found in the pull request, with the screenshots.

## Scope

In (you own these):
- `groundops.js`: clearances, line-up, crossings, go-arounds.
- Runway occupancy and capacity in `airport.js` (`IC.rwOcc`, `IC.aptStats`, `IC.aptSep`), so the numbers follow the rules.
- Crash and incident risk (`IC.gopsRisk`).
- Stop bars and holding tags in `render-airport.js`.
- A new **Operations** tab in the airport panel (`inspector.js`). Keep it in its own function, because task 14 restyles the panels around it.
- Radio calls for these events in `aviation.js`.

Out:
- The look of menus and panels (task 14).
- The Career and airspace (task 07).
- New airport parts, unless one is essential. Stop bars can simply be part of the runway lighting.

Keep edits outside your files small and in separate commits.

## Design notes

**Rules, per airport, with an optional override per runway:**
- **Entering the runway to depart:**
  - *Only when cleared for take-off*: hold short until the runway is empty and the next arrival is at least the gap below.
  - *Line up and wait*: the aircraft may line up behind a departure that is already rolling, or while the arrival is beyond the gap.
  - *Line up and wait, by day only.*
- **Arrival gap:** how far out the next arrival must be when a departure enters the runway (4, 6, 8 or 10 km). A shorter gap moves more traffic and causes more go-arounds.
- **Crossings:** aircraft may cross a runway only when no arrival is within the gap, and optionally only where there is a ground radar.
- **Intersection departures:** allowed for small aircraft when the runway left beyond the intersection is long enough for the type (`T.rwy`). This saves taxi time.
- **By kind of aircraft:** light and club aircraft, turboprops and regional jets, airliners, heavies, military. Each kind can have its own entry rule.
  - Defaults: light aircraft may line up and wait; airliners and heavies hold short until cleared.
  - Military scrambles keep their priority.
- **Presets** for players who don't want to tune: *Cautious*, *Standard* (the default) and *Busy hub*. For *Busy hub*: line up and wait for everyone by day, a 6 km gap, intersection departures allowed.

**Consequences, shown before the player picks:**
- **Capacity:** `IC.aptStats` uses the same rules, so the Operations tab can say "Departures an hour: 26 now, 21 with these rules" before the player applies them. The simulation and the stats must agree.
- **Go-arounds:**
  - If the runway is still occupied when an arrival is about 1 km out, it goes around and rejoins the approach queue. This costs time, fuel and airline satisfaction.
  - Count go-arounds in the airport's figures and give the arrival a radio call.
- **Risk** (in `IC.gopsRisk`, rare and always with a cause):
  - Lining up and waiting at night or in fog without a ground radar raises the chance of an arrival being cleared onto a runway where a departure is waiting in the dark.
  - Tight gaps raise the chance of a go-around turning into a loss of separation.
  - Crossings close ahead of arrivals raise the chance of an incursion.
  - The accident report names the rule that allowed it.

**What the player sees:**
- Red stop bars across the taxiway at the hold-short line while an aircraft may not enter, and green lead-on lights when it is cleared. They matter most at night and close in.
- A holding aircraft's tag says why it waits, for example "holding: arrival 5 km out".
- The queue at each runway is visible.

**Words on screen:** each rule gets one plain sentence saying what it does and what it costs. There are no controller codes the player has not been taught. Say "line up and wait", then what it means.

**Performance:** keep the step budget with the six-runway `'kden'` airport at peak.

## Done when

- `npm test` is green, with tests for:
  - under *Only when cleared*, an airliner never enters the runway while an arrival is inside the gap;
  - under the defaults, a light aircraft lines up and waits while an airliner in the same queue holds short;
  - *Line up and wait* lets a departure line up behind one that is rolling;
  - an arrival goes around when the runway is still occupied, and the go-around is counted;
  - the Operations tab's departures an hour match a simulated hour within about 10%;
  - lining up and waiting at night without a ground radar carries more risk than by day.
- Every Academy lesson still completes.
- The pull request starts with what the owner saw and why, then gives:
  - screenshots of a departure holding at lit stop bars while an arrival lands (day and night), of the Operations tab, and of a busy airport under *Cautious* and *Busy hub*;
  - capacity and delay numbers for each preset;
  - what you could not finish.
