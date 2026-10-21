# 62 Light aircraft on the ground: the GA ramp and the club field

Wave 16, after brief 61 on the same branch. Owns the light-aircraft and business-jet side of `civil.js`, the GA ramp in `airport.js` (tie-down stands, the starting layouts), GA moves through `groundops.js`, the ramp's life in `aptlife.js` and its drawing (`render-life.js`, `render-models.js`), and the club fields' strips. Leaves the airliners' turnarounds as they are.

## What the owner said

> "do the same I guess quality type assessment for like ga and ramp stuff concerning smaller planes make it so that those operations look normal and lively they have different processes"

## What was there (the assessment)

- A light aircraft flying from or to one of our airports appeared out of nothing 15 m over the middle of the airport and vanished there on arrival. Nothing taxied: the runway was held by a timer (`IC.gaRunway`, `ap.gaUntil`), about 9 such flights an hour at the capital.
- What stood on the "business side" (`IC.apronLife`) was decoration from a hash of the airport's id: two light aircraft to a stand, the same ones all day whether they flew or not, on whatever remote civil apron there was. At the capital that was the cargo apron, next to a freighter.
- No starting airport had a light-aircraft apron. Stands came in three sizes (small 32 × 36 m and up), so a four-seat single took a regional jet's stand.
- At a club field the aircraft stood in a row, but one taking off appeared 15 m up over the middle of the field and one landing vanished there; no take-off or landing run, no taxiing.

## What changes

**1. Tie-downs and the GA ramp.** A fourth stand size, the tie-down (`IC.STAND.xs`, 18 × 18 m), for light aircraft and helicopters. An apron in the light-aircraft zone lays rows of tie-downs; business jets take its small stands. The starting capital and regional airports get a GA ramp away from the terminal, with the business terminal (FBO) behind it.

**2. Real aircraft on it.** Each airport with a GA ramp has its based aircraft (`S.ga.parked`), tied down on their own spots; visitors arrive, stay a few hours and leave. What stands on the ramp is what is really there: an aircraft out flying leaves its spot empty.

**3. They taxi.** A light aircraft or business jet from or to an airport with a GA ramp moves on the ground like any other (`groundops.js`): start-up at the tie-down, taxi to the runway, a run-up at the holding point for piston engines, take-off (from an intersection where the rules allow small aircraft); on arrival it joins the circuit, lands, turns off and taxis to a free tie-down. Helicopters air-taxi from the spot. With no GA ramp, the old way stays.

**4. The ramp's own processes**, drawn from what the simulation did (like an airliner's turnaround, but its own): on arrival a marshaller for visitors, the propeller stopping, chocks, the pilot and passengers walking to the FBO, the fuel bowser (avgas, or Jet A for turbines); tied down and covered for the night. Before a departure the pilot walks out, takes the cover off, walks round the aircraft, then starts up. A business jet gets the crew car, a fuel truck, catering, ground power and its passengers driven to the steps.

**5. The club field.** Take-off and landing runs on the strip, taxiing between the parking row and the strip's end, touch-and-goes on circuits.

## How it turned out

- The capital has an 18-spot GA ramp off the runway's far end, 320 m out from it, with three business-jet stands at its entry and two ways onto the taxiways (one way in made an arrival meet a departure nose to nose); the regional airport has 10 spots and one jet stand. The FBO stands behind the ramp.
- Based aircraft fill a little over half the tie-downs. Over 8 game hours at the capital about 45 light aircraft and business jets taxied out and as many in, all but a few piston singles with a run-up at the holding point, no gridlock and none stuck. A visitor stays 1–5 hours, a business jet 3–30. With the ramp full a business jet takes a remote stand; a light aircraft flies on to the nearest club field.
- On the ramp: a marshaller waves a visitor in and stays a moment; chocks at the main wheels; tie-down ropes once it is staying; the pilot and passengers walk to the FBO; the bowser drives out about 7 minutes later (a turbine gets Jet A from the fuel truck). Before a departure the pilot walks out, the cover comes off a minute later, a walk round the aircraft, chocks away, start-up. A business jet gets a car to the steps, ground power, the fuel truck, and catering before it leaves. All drawn from the record's times (`r.arr`, `r.dep`, `r.pre`), nothing kept.
- At a club field: from the row along the grass to the strip, back down it to the end that faces the wind, a 25 s run-up, a take-off run of about 250 m; in, a final from 1.2 km out, the landing run, off at the middle and back to the row. Circuits touch and go on every lap but the last. The field's own traffic is drawn where it is, not as a radar track (nothing sees an aircraft on the grass).
- Tie-downs are drawn as a yellow T with the wing and tail rings, not an airliner's stand box.

## Tests

- New: the capital's ramp has its based aircraft on their spots and the map shows exactly those; one sets off, the pilot walks out, it taxis, runs up and takes off, and its spot is empty.
- New: a visitor lands, taxis to a tie-down, its people walk to the FBO, and it leaves when its stay is up, with no gridlock.
- New: at a club field a circuit taxis from the row, takes off into the wind on the strip, touches and goes, lands and taxis back to the row.
- Sweep: 8 game hours each on worlds 12345 and 9001 (Career) and 777 (Quick war): no gridlock or stuck aircraft at any airport, nothing left on a field's ground.
- The save tests pass with aircraft on the ground at fields and on the ramp.
- Found by the full run: a GA ramp's spots counted as stands for the airlines' offers (now they do not), and light aircraft counted on the airlines' timetable, against a cap or a night curfew (now they do not). Three tests leaned on the old dice and now look for what they need: an offer short of something buildable, a gate at a busy airport for the 3D lights, and a far drone still on its way after a sandbox raid.

## Not done

- The 3D view shows the ramp's parked aircraft but not its people and vehicles (the airliners' turnaround vehicles there come from the recorder; these do not yet).
- The propeller is not drawn stopping; aircraft on the grass have no ground tracks or dust.
- Two departures from a field can line up at the same end one behind the other, and a field arrival does not wait for one taxiing down the strip (they are a few a day).
- Visitors to a field vanish at the end of its row (a field keeps no records).
- An airport with no GA ramp keeps the old way: light aircraft come and go over its middle.
