# B-roll for a trailer (brief 67)

Every shot is the game itself, seed 4242, filmed frame by frame on the held clock (`tools/film-lib.js`), so it plays
smoothly however slowly the machine draws. The map's shots come from `tools/broll.js` (film mode: no interface, the
film look); the 3D shots come from the teaser's tool, `tools/teaser.js`.

    node tools/broll.js                       # every map shot at 1920 × 1080, 30 fps, to shots/broll/<shot>.mp4
    node tools/broll.js night fires --sec=2   # two shots, twice as long
    node tools/broll.js --stills              # one still per shot, to choose quickly
    node tools/teaser.js --stills --q=medium  # the 3D shots' stills (the whole teaser takes about 1½ hours)

## The map

| Shot | Length | What it shows | Use it for |
| --- | --- | --- | --- |
| `start` | 8 s | The title screen, the capital drifting behind it, the menu coming in | Open and close |
| `flyin` | 7 s | From the whole country down to the capital's airport at noon, the zoom even all the way | "Build the airports" |
| `airport` | 7 s | The capital's airport at mid-morning, a slow push towards the terminal, aircraft moving | Peacetime |
| `taxi` | 6 s | Airliners taxiing round corners close in | Peacetime, detail |
| `snow` | 6 s | The airport under snow | Seasons |
| `lake` | 6 s | A lake at dawn, glitter on the water | A quiet beat before the war |
| `night` | 7 s | The capital at night from the region, its glow, pushing in | The turn to war |
| `ballistic` | 6 s | A salvo of eight ballistic missiles coming down at night, with a caption | The first strike |
| `cruise` | 6 s | Cruise missiles low over the fields at dusk, followed | Tension |
| `defence` | 10 s | Forty weapons at the capital at dusk, the batteries firing, the director cutting | The fight |
| `fires` | 6 s | Ten minutes after a raid at night: what burns | Aftermath |

## The 3D view (tools/teaser.js)

The teaser's shots (`--only=` picks them): `calm` (the airport at dusk, a slow orbit), the ballistic launch, the
cruise missiles' flyby, the medium-range battery's launch, the intercept and the impact on the airport. With brief
67, rounds and missiles leave their launchers from rest and pitch over (see `67-screens/launch/`), so these shots are
worth filming again on a machine with a graphics card at High quality:

    node tools/teaser.js --q=high --w=1920 --h=1080 --fps=30
