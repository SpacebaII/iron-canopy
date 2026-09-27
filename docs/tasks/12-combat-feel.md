# 12 Combat look and feel, and units you can tell apart

Wave 3. Runs in parallel with 10 (cities, roads, traffic), 11 (air defence systems) and 13 (economy and logistics).

## What the owner asked for

> "Missiles need to look cooler. When a SAM goes up I don't feel anything. I want the game to feel a lot more impactful."
> "No one is memorizing what we currently have and everything looks the same. We need ways to make radars look distinguishable, and air defenses too."
> "Better names."
> "This is still a game. It needs to feel like a good one."

## Goal

A missile launch is a moment: the flash, the booster, the smoke trail arcing up, the intercept. Every radar and launcher is recognisable at a glance by its symbol, and has a name people remember with a plain line saying what it does.

## Scope

In (you own these): how our units, enemy threats, missiles, interceptions, explosions, debris and wrecks are drawn (move that drawing into a new `render-combat.js`; `render.js` keeps calling it), `audio.js`, unit and threat symbols (on the map, in the arsenal and in panels), and display names: a new `names.js` loaded right after `data.js` that sets `name`, `short` and `desc` for every unit, munition and threat (do not edit those fields in `data.js`).

Out: combat rules and new units (task 11; it adds units such as upper-tier ballistic missile defence and call-in teams with placeholder names. Name and draw them as they land, and ask in the pull request if one is missing). Out too: roads, towns and traffic drawing (task 10), convoys and logistics drawing (task 13), airports (`render-airport.js`).

## Design notes

- **Launches you feel.** Per missile class:
  - a launch flash and a ground dust cloud;
  - a booster flare that burns out, then a smoke trail that lingers, drifts with the wind and fades;
  - a real flight path: long-range missiles loft high and dive, short-range ones streak straight;
  - staging for the big ones.

  Ballistic missiles: a bright re-entry streak, and the interceptor's rising trail meeting it. A hit is a flash and a spray of debris; a miss flies on and self-destructs. Salvos ripple. Guns spray tracer. At night everything glows.
- **Impacts with weight.** Explosions scale with the warhead: a fireball, a shock ring, smoke that rises and drifts, secondary explosions on fuel and munitions. The screen shakes a little on big hits nearby (settings already allow turning it off). Short slow-motion on key moments stays optional.
- **Sound.** Distinct launch sounds per class, intercept pops, the rumble of distant impacts, the air raid siren, radar lock tones on the selected battery. All in `audio.js` (Web Audio, no files needed), with volume respected.
- **Readable at every zoom.** Effects already scale with `WF` in `render.js`: big and clear far out, real size close in. Keep 60 fps with a big raid on screen: pool particles, batch drawing, cap trails, and measure.
- **Symbols you can tell apart.** A shape language by role:
  - search radars;
  - fire-control radars;
  - short-, medium- and long-range launchers;
  - ballistic missile defence;
  - guns;
  - electronic warfare;
  - sensors.

  Each type gets its own silhouette, a range ring style, and a state (radar on, silent, reloading, damaged). The arsenal and panels use the same symbols. Enemy threats get the same care: drone, cruise missile, fighter, bomber, jammer, ballistic missile, anti-radiation missile.
- **Names.** Memorable fictional names with a plain role underneath, for example "Sentinel · long-range search radar" or "Aegir · medium-range missile battery". Avoid real brand names. Short codes on the map, full names in panels. Keep them consistent in logs, cards and tooltips.

## Done when

- `npm test` is green (drawing has no tests, but nothing in the step may break).
- Screenshots (`tools/shot.js`), and a short sequence of frames, of:
  - a SAM launch from flash to intercept, day and night, close in and far out;
  - a ballistic intercept;
  - a raid with a dozen missiles in the air;
  - the arsenal and map symbols side by side.

  Look at every one before opening the pull request.
- Frame times before and after with a big raid on screen (headless numbers only compare).
- The pull request lists the new names and says what changed and what you could not finish.
