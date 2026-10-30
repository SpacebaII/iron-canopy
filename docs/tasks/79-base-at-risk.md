# 79 The base at risk: a strike tells them where our jets are

Extends brief 78. Owns the base's side of a strike in `js/strike.js` (`IC.baseGuard`, `IC.strikeHomes`, the ground-loss report), the "After the strike" block on the Counter-strike page (`ui-strike.js`), the `base:strike` target in `warplan.js`, and the rearming after a strike in `air.js`.

## What the owner said

> "expand the offensive options by kinda having a bit of more in depth strike system so with ordering the offensive strikes the player is also semi responsible so the fighter jet fleet keeping it safe on the ground so if they don't protect the military parts of the airport they built they can lose planes or relevant equipment"

## What this brief does

- **They watched the jets take off.** A strike records the base most of its jets flew from (`S.strike.from`). The target `base:strike` is that base, aimed where our aircraft park (each flight's stand or shelter twice, the shelters, fuel farm and ammunition store once: `IC.wpParkAims`); until a strike has flown it falls back to the main base. Operation Iron Gate's retaliation wave puts its ballistic and cruise missiles on it, with Volkan's order to hit the jets while they refuel.
- **The jets come home slow.** After a strike across the border a flight rearms for twice its usual turnaround (bombs loaded again, every jet inspected), half as long again at a field that is not an air base. The retaliation comes 1 to 1.5 hours after the strike, so they are usually still on the ground.
- **What waits at home, in the open.** Voss's advice ends with the base: how long the jets will be on the ground, how many aircraft stand in hardened shelters, in hangars or alert sheds, on open stands, which of our batteries cover it, and a fuel farm too close to what it would burn (`IC.baseGuard`). The page's "After the strike" block says the same and grades the base Exposed (jets in the open and nothing covering it), Partly protected or Protected.
- **Land somewhere else.** The player can send the jets to another of our bases or airports after the strike, any they can reach on the fuel a round trip home would take (`IC.strikeHomes`, nearest home first). They come down there and are based there; their answer still comes on the base they took off from.
- **Losses on the ground are explained.** The existing damage model decides: a jet on an open stand near a hit is lost four times in five, in a hangar two in five, in a hardened shelter one in ten; hangars, shelters, fuel and ammunition burn. After any raid that destroys our military aircraft on the ground in the war, Voss says how many and what would have saved them (shelters for the ones in the open, a battery over the base, the fuel farm further away, or landing elsewhere), with a log line and a report card in the Career.

## Tests

- `base at risk: a strike's jets can land elsewhere, rearm twice as long, and their answer is aimed where the jets park at the base they took off from`
- `base at risk: jets in the open die near a hit and most in hardened shelters come through; she says what would have saved them`
