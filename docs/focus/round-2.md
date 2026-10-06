# Round 2: an airport that is alive

Branch `focus/round-2`, on `main` with round 1 (PR #52) merged in. This round covers checklist items 5 and 6 of `docs/focus/plan.md`, and the "life" half of item 7.

Screenshots are in `docs/focus/round-2/`. They come from the recorded playthrough, `tools/round2-play.js`:
- It starts a fresh Career from the start screen in headless Chromium at 1440 × 900.
- It founds an airport, orders the round-1 Starter airport, runs Finish now and plays at 32× to the first landing.
- It then watches the turnaround at stand zoom, zooming with the mouse wheel as a player would, and plays on to dusk.
- `before-*.jpg` are the same moments with round 2 switched off (`--before`: `IC.FOCUS.life` and `IC.FOCUS.firstLanding` false).

## What changed

### 1. The first landing is an event

- **The trigger.** In the Career, the first airliner bound for one of our airports reaches 30 km out (`IC.firstLandingTick`, `aptlife.js`). Then:
  - the clock eases to 1×; Wait and skip stop;
  - a line says why: "ESA 171, the first airliner, is 30 km out from Quenvel International. Time runs at 1× so you can watch it land, taxi and park";
  - the camera follows the aircraft in.
- **The camera.** While the game drives it, the camera also zooms by phase: about 6 in the air, 12 on final, 16 on the landing roll, 30 taxiing and 60 on the stand. The player can take it at any time:
  - the wheel takes the zoom and the camera keeps following;
  - dragging the map or the arrow keys stop the follow.
- **The card.** As the aircraft parks, a compact card, "The first landing", gives the takings: "It paid ₭1.1M: ₭0.6M landing fee and ₭0.6M for its 171 passengers". It says what that means, and that the turnaround now on screen decides how soon the stand is free.
- **Where cards go.** Every card now goes where it does not hide what it talks about (`ui.placeCard`). It moves to the opposite half of the screen from the followed aircraft, from the card's own point, or (close in) from what the camera is looking at. The first-landing card sits top left, beside the airport (`02-first-landing-card.jpg`). The Chapter 2 card that follows it is moved the same way. This was the round-1 review's complaint about the card covering the new terminal.
- **Once a game.** It happens once, it is saved, and `IC.FOCUS.firstLanding = false` hides it.
- **In the playthrough** (`moments` in the tool's output):
  - open for business at 0:59;
  - the clock eased to 1× at 1:24;
  - landed and parked, followed all the way, at 2:07, with no clicks in between.

  Before this round, the playtest's first landing happened off-screen at 32× (`career-playtest-1.md`, problem 3).

### 2. Turnarounds you can watch

- **One plan, two views.** One turnaround plan is now shared by the 2D map and the 3D replay (`aptlife.js`). `IC.turnJobs` says which vehicle comes when, and `IC.turnPaths` gives where it parks and how it drives there. The routes run along the airport's service roads from the terminal, the fuel farm or the cargo shed, then along the service lane in front of the stands. The timings are the 3D replay's (brief 41), now in one place; `render3d-life.js` uses the same plan.
- **The order** follows the simulation's own turnaround (`s.svc`: its start, its length, bridge / walk / bus / cargo, truck or hydrant):
  1. jet bridge, or stairs (front and rear), and ground power;
  2. belt loader, and the baggage train with the arriving bags;
  3. cleaners' van;
  4. catering truck (its box lifts in 3D);
  5. fuel truck from the fuel farm, or the hydrant cart;
  6. the baggage train again with the departing bags;
  7. boarding;
  8. the pushback tug, 7 minutes before the end.

  Buses come at remote stands and lorries at cargo stands.
- **Leaving.** Each vehicle drives in, works, and drives back out, with its amber beacon flashing while it moves.
- **Jet bridges** now reach out to the door when the aircraft has parked and fold back before the pushback. Before, they were always out.
- **Passengers** walk across the apron to the steps at gates without a bridge, and between the steps and the bus at remote stands.
- **On the map.** The vehicles are drawn at real size close in, and up to three times their size at the middle zoom so the apron reads. A dark rim keeps a white truck visible against a white fuselage.
- **Shots.** `04-turn-early.jpg`, `05-turn-mid.jpg`, `05b-turn-close.jpg` and `06-turn-late.jpg`, against `before-05-turn-mid.jpg` and `before-05b-turn-close.jpg`, where the stands are empty but for the aircraft.
- **Turnaround time on the stand.** Click an airliner on its stand or taxiing (new selection kind `tail`). It gets:
  - a ring round the stand that fills as the turnaround goes, with a line over it, for example "STAND 0: REFUELLING · 17 MIN LEFT";
  - a panel with the airline, the aircraft, "Doing now", what it paid on landing, and the turnaround as a bar;
  - three lists: at work ("stairs, ground power, belt loader, baggage carts, fuel truck"), done and to come;
  - one line on how it is served ("Passengers walk across the apron and up the steps. A fuel truck drives over from the fuel farm.").

  Shot: `03-stand-selected.jpg`. Hovering an airliner says what it is doing.

### 3. People and landside life

- **Cars.** Cars, taxis and the odd coach drive the landside roads (`IC.drawLandLife`, `render-life.js`):
  - they keep to the right-hand lane, or spread over the lanes of a one-way road;
  - on the kerb road along the terminal, half of them pull into the drop-off lane, stand for 30–90 s and drive on.
- **Passengers at the kerb.** They wait along the terminal front, some with bags, and others walk in through the doors.
- **Scale.** There are as many cars and people as the airport's passengers an hour bring: from a handful at a quiet field to about 80 cars a road and 160 people at the kerb.
- **Their clock.** They run on their own clock, never faster than 2× however fast the game goes, so they move smoothly at 32×.
- **Terminal glass** at night is as bright as the terminal is busy (passengers an hour against what it can handle).

### 4. Ambience

- **Aircraft at night:** red and green navigation lights on the wingtips, white strobes, the red beacon, and a landing or taxi light ahead while they move.
- **The tower:** at night it flashes the aerodrome beacon, white and green in turn, over the airport's darkness.
- **Apron vehicles at night:** headlights while they drive.
- **Already there:** floodlights over aprons and terminals, runway, approach and taxiway lights, and stop bars (`10-night-apron.jpg`).
- **Sound, through `audio.js`** and so through the master volume and mute:
  - a bed of engines that swells with the traffic moving in view at airport zoom;
  - a jet spooling up as each take-off roll starts;
  - now and then, close to the terminal, a chime and a far-off announcement.

### 5. Follow an aircraft

- **Starting.** Click an airliner on the ground, or select one in the air, then **Follow**. The camera stays with it from final approach to the gate and back out.
- **The chip.** A chip at the bottom says who it is following and what it is doing, in plain words (`IC.tailPhase`):
  - "Approaching Quenvel International: 23 km out, FL090";
  - "On final, runway 26: 3 km to go";
  - "Landing roll: slowing down";
  - "Taxiing to stand 4";
  - "Passengers getting off: 43 min left";
  - "Refuelling: 19 min left";
  - "Boarding: 5 min left";
  - "Pushing back from stand 4";
  - "Taking off from runway 26".

  It sits above the build bar when that is open, and has a Stop button.
- **The end.** The follow ends by itself, with a line saying why, once the aircraft has climbed away (30 km out), goes into the hangar or is lost.
- **In the air** the followed aircraft is drawn with its shadow and a turning ring, whatever the layers.

### 6. Scale with business

- **Turnarounds.** The apron has as many turnarounds as the airport has flights, each with its own vehicles. A quiet field with one aircraft on a stand has one set of vehicles; the Quick war's capital, at about 1,700 passengers an hour, had 6 turnarounds and about 570 vehicles, cars and people in view at z 60.
- **The landside** grows with passengers an hour (test below: 20 against 1,200 passengers an hour draws more than three times as many cars and people).
- **At night** passenger flights stop (the airlines' own rule), so the airport goes quiet but stays lit (`11-night-kerb.jpg`).

### The switch

`IC.FOCUS` (core.js) now reads:

```js
IC.FOCUS = { pieces: true, firstLanding: true, life: true }
```

- `life: false` brings back the old drawing: the always-out bridges and the old sparse turnaround shapes.
- `firstLanding: false` turns the event off.

Nothing was deleted.

## The checklist

| # | Item | Met? | Evidence |
| --- | --- | --- | --- |
| 5 | The first airliner lands within 10 minutes of starting. The player can follow it from approach to gate to pushback and see each service at work: bridge, fuel truck, baggage, catering, pushback tug | **Met** | The playthrough landed the first airliner at 2:07 of real time (19 clicks), followed by the camera from 30 km out with the clock at 1× (`01-approach.jpg`, `02-first-landing-card.jpg`). Each service is drawn in its turn and named in the panel (`03`–`06`, `05b`). Test *a turnaround brings its vehicles in the real order…*: bags before catering before fuel before the tug, stairs at a stand without a bridge, and the apron clear 15 minutes after the pushback. Follow goes on through the pushback and climb-out, with each phase in words. |
| 6 | The airport looks alive at every zoom: passengers at the kerb and gates, vehicles on the apron, lights at night, sound. A busier airport visibly looks busier | **Mostly met** | Apron vehicles from z 5, passengers from z 22, cars from z 10. Aircraft, vehicle and tower lights at night; engine, spool-up and announcement sounds. Life scales with passengers an hour (test). **Not yet:** at the whole-airport zoom (z 3–10) the life is specks; the round-1 Starter is small, and one or two turnarounds at a time do not fill it. No "queues at the gates" inside the terminal: the roof hides it, and only the glass brightens. |
| 7 (life half) | A new terminal fills with people; fire and fuel show their work | **Partly met** | The kerb fills with people and the glass brightens with passengers an hour. The fuel farm's trucks drive to the stands. The fire station's runs were already drawn. |

## Frame times

`node tools/world-perf.js --views`, software-rendered Chromium (no GPU here, so every number is far over a real machine's). This is the real Denver with 164 aircraft moving at 1×; drawing alone, median ms:

| View | Before (round 1) | After |
| --- | --- | --- |
| whole map | 29.2 | 29.6 |
| airport z 20 | 92.6 | 86.9 |
| airport z 40 | 88.5 | 92.8 |
| airport z 80 | 95.7 | 91.9 |
| capital z 4 | 44.4 | 43.2 |
| capital z 12 | 34.6 | 35.5 |
| capital z 30 | 44.3 | 41.0 |

The two columns are within run-to-run noise.

The life alone was measured in the Quick war's capital after 20 minutes at 32×: 6 turnarounds and about 1,700 passengers an hour. All of it was drawn with no culling, 200 times, timing `IC.drawTurns` + `IC.drawLandLife`:
- 1.1 ms at z 20 (252 things);
- 1.35 ms at z 60 (569 things);
- 0.56 ms at z 160 (333 things).

Software rendering again: about 2–8% of a software frame.

How it is kept cheap:
- Nothing is made per frame in the loops. Paths and jobs are worked out once per turnaround (`q._jobs`, `q._paths`), light colours are cached, and roads keep their running length.
- Turnarounds out of view are skipped.
- The simulation step is untouched apart from one check while the Career's first landing is still to come, and a small `tl.paid` note at each landing.

## Tests

New tests in `tests/run.js` (section "round 2"):
1. *the first landing eases the clock to 1×, follows the airliner in, and its card gives the fees beside the airport*. It checks:
   - the follow said "Approaching … km out", "On final, runway" and "Taxiing to stand";
   - it happens once;
   - the switch hides it.
2. *a turnaround brings its vehicles in the real order (bags, catering, fuel, then the pushback tug) and they all leave*.
3. *life on the map scales with the passengers: a busy airport draws more cars and people than a quiet one*. This runs the renderer's helper headless against a canvas that draws nothing.

The 3D life tests pass on the shared plan. The save tests pass with the new state (`S.first`, `S.follow`, `tl.paid`).

`npm test` after merging `main`: 270 passed and 1 failed (1,710 s on 4 workers), with the eight Academy lessons, the save tests and the timing tests among them.
- The failure was *calendar: waiting for money runs until the treasury reaches the target*. Its Wait was stopped by the new first-landing event ("VAA 444, the first airliner, is on its way in…"). That is the intended behaviour: the first landing stops any wait.
- The test now starts after the first landing has been seen, and passes when run again.

## What is left, and what needs the owner

- **Feel on real hardware.** The numbers and pictures are from software rendering. The vehicles' size at the middle zoom (up to 3× real) is a taste call best made on a real screen.
- **The whole-airport zoom still reads as quiet.** This is largely because the Starter is one 8-gate terminal with two or three aircraft at a time; Round 4's growth will fill it. A "busy" overlay at z 3–10 (dots for vehicles, a glow for crowds) could help if the owner wants more at that zoom.
- **Sound is untested by ear.** It is synthesized like the rest of `audio.js` and goes through its volume and mute. Levels may need tuning.
- **Night is quiet** because the airlines do not fly passengers at night (an existing rule). The airport stays lit, but nothing moves. Cargo airlines do fly at night.
- **The first landing card** sits over the goals panel for its 16 seconds. Round 3's "fewer panels" is the place to sort the left column.
- **Stand numbers start at 0** on the Starter ("Stand 0"), as the map's own labels do. Renumbering from 1 touches saves and is left for Round 3's stand work.
