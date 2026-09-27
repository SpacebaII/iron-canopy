# 11 Air defence that fights back

Wave 3. Runs in parallel with 10 (cities, roads, traffic), 12 (combat look and feel) and 13 (economy and logistics).

## What the owner asked for

> "Remove the ground invasion piece and focus on the gamified aspect of the air defense. It feels too broad, and aviation geeks will not want to also play war commander."
> "The whole missile defense needs to be looked at. I haven't shot down a single ballistic missile ever, so implementing something like THAAD would be good, but overall the systems need to be deepened."
> "The overall game flow should feel more intense, less like one missile of doom and despair, but a way of going up against an air defense system, and then calm down."
> "I felt pretty defeated because I was just getting hit with attacks that were not really a fight. None of my defenses did anything. There were no complexities like jamming; they just flew around or over my defenses."
> "MANPADS teams need to be able to be deployed anywhere pretty quickly and then dissolved, because they can't do much, so it's better to use them like reinforcements, like the ones you see in Kingdom Rush."
> "A sandbox mode where I can spawn anything on a flat plane and simulate attacks would be great for me to test balance."
> "This is still a game. It needs to feel like a good one."

## Goal

The second half of the game is air defence command, and it plays like a good tower-defence game with real depth. Raids come in waves you can read and prepare for, your defences visibly do their job, the enemy uses real tricks (jamming, decoys, terrain, saturation) that you can counter, and between raids there is time to repair, rearm and rethink.

## Scope

In (you own these): `defense.js`, `threats.js`, `enemy.js`, `sensors.js` (jamming and detection), the stats and new entries in `data.js` (units, munitions, threats, research), `air.js` (interceptions), `campaign.js` (Quick war), the Academy (`academy.js`, `academytest.js`), removing the ground war (`ground.js` and every caller), a new `reinforce.js` (call-in teams) and a new `testrange.js` (the test range).

Out: how units, missiles and explosions are drawn and sound (task 12 owns `render.js` unit and effect drawing, a new `render-combat.js`, `audio.js`, and display names); procurement and delivery (task 13 owns `units.js` ordering and `logistics.js`); roads and towns (task 10); the Career's acts (task 07 rewrites them next wave; keep `story.js` working, with the land war removed).

Parallel sessions touch nearby code. Keep edits outside your files small, in separate commits. Leave `name`, `short` and `desc` fields in `data.js` to task 12; add new units with plain placeholder names.

## Design notes

1. **Cut the ground war.** Remove brigades, fronts, sectors, ground orders, the Army room, the ground war room keys, the "ground" Academy lesson, and ground combat in Quick war, Sandbox and the Career. Delete the code; do not leave it dormant.
   - The enemy's launch sites, airbases and supply stay as targets for our counter-strikes (drones and strike aircraft), and the "strike" lesson becomes finding and hitting a launcher from the air.
   - New pressure and losing conditions, all in the air: cities and industry hit, airports closed, airlines pulling out, civilian aircraft lost, the Prime Minister's confidence, national morale. Winning Quick war means holding for a set number of days with the country still working.
2. **Raids with a rhythm.** The enemy plans raids and the player can read them.
   - A build-up: intelligence warnings, jamming and reconnaissance flights before a big raid, drones probing the edges.
   - The raid: waves timed to arrive together, a peak, stragglers.
   - The calm: time to repair runways, reload and move batteries, and an after-action report ("32 threats, 27 shot down, 5 leaked: 3 cruise missiles through the valley north of Varn, where your gap filler was down").
   - Escalation over days: probes, drones at night, cruise missiles, mixed raids, ballistic salvos, then the big one. Never a single unstoppable missile that decides everything.
3. **Threats that behave, and counters that work.** Cruise missiles and drones use terrain and the holes in your radar cover; fighters and bombers avoid known SAM rings; big raids saturate a battery; anti-radiation missiles hunt radars that stay on. Each trick has a counter the player can learn: gap fillers, overlapping batteries, emission control, decoys, shoot-look-shoot against salvo, fighters on combat air patrol.
4. **Electronic warfare both ways.** Stand-off jammers blind radars along a bearing (show it as a strobe on the map), escort jammers ride with raids, chaff and decoys confuse tracks. Our side has jammers, decoys, radars that are harder to jam, and missiles that home on jammers. It is visible and understandable, never a hidden dice roll.
5. **Ballistic missile defence that works.**
   - Layers: an upper tier like THAAD (outside the atmosphere and high in it) and a lower tier like Patriot PAC-3 (terminal), cued by a ballistic missile defence radar or early warning, with a predicted impact ellipse on the map and two interceptors per warhead.
   - Decoys and manoeuvring warheads come later.
   - In Quick war the player can have it without a long research chain when ballistic threats appear. Explain in plain words why a battery can or cannot engage.
   - Find out why ballistic missiles are never shot down today, and fix it.
6. **Call-in teams (MANPADS), like Kingdom Rush reinforcements.**
   - An ability on a cooldown, with a small cost: pick a spot anywhere in our territory, and a team is there in seconds.
   - It fights for a few minutes against drones, helicopters and low jets, then dissolves.
   - Upgrades later: more teams, longer stay, better missiles.
   - Not a unit you buy, move and supply.
7. **Every defence does something.** A battery that cannot fire says why on the map (out of range, not tracked, hold fire, reloading, masked by a hill). A battery that fires has a real chance and the player can see the result.
8. **Test range** (new mode on the start screen, and the owner's balance tool).
   - A flat, empty plane with no story.
   - Spawn anything: our radars and launchers, any threat or raid preset, with a count, direction and height.
   - Controls: pause, speed, reset.
   - A stats panel: shots, kills, leakers, kill probability per system, missiles spent, cost exchange.
   - Save a scenario to replay it after a balance change.
   - Keep it simple and fast to use.

## Done when

- `npm test` is green, with tests for:
  - a layered upper and lower tier battery defends a city against a ballistic salvo (most warheads intercepted);
  - a stand-off jammer degrades a radar along its bearing, and a home-on-jam missile can kill it;
  - a call-in team appears within seconds, engages a drone and dissolves after its time;
  - raids have a build-up and a calm (the enemy is quiet for a stretch after a big raid);
  - cruise missiles route through a radar gap when one exists;
  - no ground war code runs in the step;
  - the test range spawns a raid against a defence and reports the stats.
- Every Academy lesson (rework them for an air-only game) is played many times on two seeds and always completes.
- Quick war balance run: three game days, printing raids, threats, kills, leakers and damage per day. The player should win some fights and lose some.
- The pull request says what changed, the balance numbers, and what you could not finish.
