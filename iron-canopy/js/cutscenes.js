/* Iron Canopy — (brief 70) the cutscenes: the story's spine, told by the Director looking back, in the first
   person and the past tense, as comic pages of four to eight panels. Headless data and a queue; the viewer is in
   render-cutscene.js.
   - IC.CUTSCENES[id] = { title, pick(S, data) → a variant key or '', panels: [{ art, src, shot, cap, say, only }] }
     art: the image's name in iron-canopy/art/cut/ (art/cut/<art>.jpg); src: '3d' for a frame rendered from the
     game's 3D view, 'ai' for a painted panel (see docs/story/art-prompts.md); shot: what the panel shows (for the
     art, and drawn as a stand-in until the art exists); cap: the narration; say: [cast key, words] in a balloon;
     only: the variant the panel belongs to (no only: every variant).
   - Words carry tokens filled from the game: {H} {A} {Hfull} {Afull} {town} {cap} {capCity} {leader} {sister}.
   - IC.cutscene(S, id, data) queues one (once per id unless data.again); S.story.cuts lists those seen, for the
     Journal. */
(function (IC) {
'use strict';
const U = IC.U;

IC.SISTER = 'Mira';
IC.cutFill = function (S, s, d) {
  if (!s) return '';
  const W = S.world, st = S.story || {}, town = IC.storyBorderTown ? IC.storyBorderTown(S) : null, ap = st.cap && S.byId[st.cap];
  const F = IC.foeOf && st.foe ? IC.foeOf(S) : { name: 'their leader' };
  const map = { H: W.names.H, A: W.names.A, Hfull: W.full.H, Afull: W.full.A, town: town ? town.name : 'the border town', cap: ap ? ap.name.replace(/ (International|Airport)$/, '') : 'the national airport', capCity: IC.cap(S).name, leader: F.name, sister: IC.SISTER, ap: 'the airport', cause: '' };
  Object.assign(map, d || {});
  return s.replace(/\{(\w+)\}/g, (m, k) => map[k] != null ? map[k] : m);
};

/* the cutscenes, in the order a Career meets them */
IC.CUTSCENES = {
  prologue: { title: 'The blind spot', panels: [
    { art: 'prologue-1', src: 'ai', shot: 'Night. The glass cab of an old control tower, rain on the windows, a young controller (the Director, seen from behind) at a round green radar scope. An older man in a cardigan (Ivo Marsh) stands behind with a mug.', cap: 'Fourteen years before any of this, I was a controller at the old airfield outside {capCity}. Night shift. Ivo Marsh had taught me everything I knew. He had known my father.' },
    { art: 'prologue-2', src: 'ai', shot: 'Close on the radar scope: one bright blip of a jet, and nothing else. Empty green.', cap: 'The scope showed one training jet on approach. It did not show the little aircraft with no transponder, crossing below it in the rain.' },
    { art: 'prologue-3', src: 'ai', shot: 'From the tower, far off in the dark rain: a small orange fireball low over the fields.', cap: 'I saw it before I understood it.' },
    { art: 'prologue-4', src: 'ai', shot: 'Morning. An empty controller\'s chair in the tower, a coat over its back. Grey light.', cap: 'Two people died. Nobody blamed me. I left the tower anyway, and I never sat in that chair again.' },
    { art: 'prologue-5', src: 'ai', shot: 'Years later. A modern office at night, the Director at a desk with plans; a phone lit up on the desk; through the window a city.', cap: 'Fourteen years later, Petra Halloran called. The country wanted an airport, and she wanted someone who knew what a blind spot costs.', say: ['MIN', 'They tell me you are the best planner in the country, and the only one who still has nightmares about radar. I need both.'] },
    { art: 'prologue-6', src: 'ai', shot: 'Dawn over empty farmland: survey pegs with orange tape in a long straight line toward the horizon. The Director stands among them.', cap: 'I said yes. That is where this story starts: a line of pegs in a field, and a country that had never had a sky of its own.' }
  ] },

  firstLanding: { title: 'First light', pick: (S, d) => d && d.late ? 'late' : 'ontime', panels: [
    { art: 'first-1', src: '3d', shot: 'Dawn over the new airport: the terminal, the runway lights still on, mist on the grass.', cap: 'I remember that morning. The fog lifted at ten, and the first one came in at ten past.' },
    { art: 'first-2', src: 'ai', shot: 'A crowd at the perimeter fence: families, children on shoulders, an old man with a flag, phones held up.', cap: 'Half of {capCity} came to the fence. Nobody had told them to.', only: 'ontime' },
    { art: 'first-2b', src: 'ai', shot: 'A thin crowd at the perimeter fence in drizzle; a few umbrellas; a hand-painted sign reading FINALLY.', cap: 'It was months late, and over budget, and people came to the fence anyway. Someone had painted a sign: FINALLY.', only: 'late' },
    { art: 'first-3', src: '3d', shot: 'An airliner on short final, gear down, landing lights on, low over the runway threshold.', cap: 'The wheels touched at 10:12.' },
    { art: 'first-4', src: 'ai', shot: 'On the apron: Minister Halloran in a dark coat, laughing, gripping the Director\'s arm; Lena Okafor beside them grinning, a radio in her hand.', cap: 'Halloran held my arm so hard it bruised. Lena Okafor said it was the first time she had seen a minister cry.', say: ['MIN', '“Halloran\'s Folly.” Let them print that tomorrow.'] }
  ] },

  collision: { title: 'Nothing on the scope', panels: [
    { art: 'coll-1', src: '3d', shot: 'A regional turboprop airliner in cloud, seen from the side, its cabin windows lit.', cap: 'Lise Marsh was the first officer that afternoon. Ivo\'s niece. I had known her since she was eight.' },
    { art: 'coll-2', src: '3d', shot: 'A grey drone with no lights in the cloud, a few metres ahead, about to hit the airliner\'s wing.', cap: 'The drone had no transponder and no lights. None of our radars could see it. I had built most of them.' },
    { art: 'coll-3', src: 'ai', shot: 'Inside the cockpit: a young woman pilot (Lise) wrestling the controls, warning lights red, a crack across the windscreen, the captain calling on the radio.', cap: 'She flew it down on one engine.', say: ['LISE', 'Mayday, mayday, mayday. We have hit something.'] },
    { art: 'coll-4', src: 'ai', shot: 'The operations room: rows of screens, people on their feet; Ivo Marsh grey-faced, staring at one screen; the Director behind him, hands flat on the desk.', cap: 'In the ops room Ivo didn\'t say a word. He didn\'t need to. It was the same blank screen.' },
    { art: 'coll-5', src: '3d', shot: 'The damaged airliner on the runway, fire trucks around it, foam, blue lights in the rain.', cap: 'Everyone walked off that aircraft. That was luck, and I knew it.' },
    { art: 'coll-6', src: 'ai', shot: 'Wreckage on a table under hard light: a carbon-fibre drone wing with foreign stencilled markings.', cap: 'The wreckage was military. It was theirs. Someone was mapping our sky, and the quiet years were over.' }
  ] },

  shadow: { title: 'Close enough to wave', panels: [
    { art: 'shadow-1', src: '3d', shot: 'A fighter jet in close formation off an airliner\'s wingtip, high above the clouds.', cap: 'They started flying alongside our airliners. Close. Close enough to read the pilot\'s name on his helmet.' },
    { art: 'shadow-2', src: 'ai', shot: 'Through an airliner cabin window: a child pressing her hand to the glass; outside, a fighter pilot in a dark helmet raising a gloved hand.', cap: 'His name was Ilya Moreva. A girl in row 14 waved at him, and he waved back.' },
    { art: 'shadow-3', src: 'ai', shot: 'A newspaper front page on a kitchen table: a blurry photo of the fighter beside the airliner, headline "CLOSE ENOUGH TO WAVE".', cap: 'Her mother\'s photo was on every front page the next morning. Their television called it an escort, for our safety.', say: ['KOLAR', 'Our pilots keep watch over a sky that the {H} cannot.'] }
  ] },

  defector: { title: 'Across the wire', pick: (S, d) => d && d.end, panels: [
    { art: 'def-1', src: '3d', shot: 'Night. A military transport aircraft low over dark hills, no lights, a border fence and floodlights below.', cap: 'It came in at two in the morning, under their radars and nearly under ours.' },
    { art: 'def-2', src: 'ai', shot: 'Inside the dark transport cockpit: a pilot in a flight suit; behind him a woman holding two sleeping children, and an older man in a suit clutching a briefcase.', cap: 'A pilot, his wife and children, and a man who said he was Kasimir Lenz\'s cousin.' },
    { art: 'def-3', src: '3d', shot: 'Runway edge lights coming on in sequence in the dark, an air base runway lit for landing.', cap: 'We turned the lights on.', only: 'took' },
    { art: 'def-3b', src: '3d', shot: 'Runway edge lights coming on in sequence in the dark, an air base runway lit for landing.', cap: 'We turned the lights on, for a while.', only: 'half' },
    { art: 'def-3c', src: 'ai', shot: 'A dark runway, all its lights off; far above, the transport\'s silhouette turning back toward the hills.', cap: 'We kept the lights off. I listened to him on the radio until he was out of range.', only: 'back' },
    { art: 'def-4', src: 'ai', shot: 'A cold hangar at dawn: the family wrapped in grey blankets, a child asleep on a cot; General Voss in uniform studying a folded map.', cap: 'Voss had her maps by breakfast. Across the border they called it theft.', only: 'took' },
    { art: 'def-4b', src: 'ai', shot: 'A cold hangar at dawn: the family wrapped in grey blankets; through the open doors, the transport taking off alone.', cap: 'We kept the family and sent the aircraft home, and the pilot in it. Everyone was angry. Nobody went to war over it.', only: 'half' },
    { art: 'def-4c', src: 'ai', shot: 'An empty radio room at dawn, a headset on the desk, a cold cup of coffee.', cap: 'I never found out what happened to them. I have stopped trying.', only: 'back' }
  ] },

  firstBlood: { title: 'First blood', pick: S => S.story.fired ? 'fired' : 'they', panels: [
    { art: 'blood-1', src: '3d', shot: 'An airliner-shaped jet with military sensor pods, flying alone above the clouds at dusk.', cap: 'It squawked like an airliner. It was not an airliner.', only: 'fired' },
    { art: 'blood-2', src: '3d', shot: 'A missile streaking up from the ground toward the jet, a bright trail against the dusk sky.', cap: 'I gave the order. I have thought about it every day since, and I would give it again. I think.', only: 'fired' },
    { art: 'blood-1b', src: '3d', shot: 'Cruise missiles low over farmland at dusk, three of them in a loose line.', cap: 'They did not declare anything. They just fired.', only: 'they' },
    { art: 'blood-2b', src: '3d', shot: 'An explosion at an air base: a hangar burning, black smoke, a fire truck racing.', cap: 'The first of their missiles hit the air base at 18:40.', only: 'they' },
    { art: 'blood-3', src: 'ai', shot: 'A television in a dark living room: a news anchor (Vesna Kolar, sharp suit, cold eyes) in front of a map with red arrows.', cap: 'Their television had the story before our cabinet did.', say: ['KOLAR', 'The {H} has chosen blood. We did not.'] },
    { art: 'blood-4', src: 'ai', shot: 'The Director alone in an office at night, phone to the ear, the city lights through the window.', cap: '{sister} called at midnight. She had heard the jets over {town}. I told her it was nothing. It was the first time I lied to her.', say: ['SISTER', 'Tell me the truth. Should I take the children south?'] }
  ] },

  road: { title: 'The road to war', pick: S => S.story.road, panels: [
    { art: 'road-e1', src: 'ai', shot: 'A huge night rally in a square across the border, flags and torches, a leader at a lectern lit from below.', cap: '{leader} needed an enemy to win an election. Every rally ended with our name.', only: 'election', say: ['LEADER', 'They charge us for our own sky!'] },
    { art: 'road-e2', src: 'ai', shot: 'An airline check-in hall with every departure board flashing CANCELLED in red.', cap: 'They banned our airlines from their sky. Then the cancellations started on our side too.', only: 'election' },
    { art: 'road-i1', src: '3d', shot: 'Rocket fire at night: bright trails arcing over hills toward a small town\'s lights.', cap: 'The shells fell on the farms outside {town} first. I knew those farms.', only: 'incident' },
    { art: 'road-i2', src: 'ai', shot: 'A bakery on a small-town square at dawn, its window cracked, a woman (Mira, flour on her apron) sweeping glass, two children watching from the doorway.', cap: '{sister} swept up the glass and opened the bakery anyway. That was the kind of town it was.', only: 'incident' },
    { art: 'road-b1', src: 'ai', shot: 'A foreign military base inside an airport fence: a radar on a truck, foreign flags, soldiers in a different uniform at a gate.', cap: 'The allies built their fence at our national airport. Across the border, it was all they talked about.', only: 'base' },
    { art: 'road-b2', src: 'ai', shot: 'A diplomat reading a long ultimatum aloud at a podium; behind her the two countries\' flags.', cap: 'The ultimatum gave us a year to send the allies home. Nobody in our cabinet thought they would wait a year.', only: 'base' },
    { art: 'road-3', src: 'ai', shot: 'A long table in a dim cabinet room: the Prime Minister at the end with his head in his hands; generals and ministers along the sides; the Director standing at the back wall.', cap: 'I was in the room, at the back, by the wall. Valk asked everyone what they thought. Then he asked me.', say: ['PM', 'Director. If it comes, what do we lose first?'] }
  ] },

  north: { title: 'The north empties', pick: S => IC.storyNorthOut ? IC.storyNorthOut(S) : 'road', panels: [
    { art: 'north-1', src: 'ai', shot: 'A two-lane road at dusk jammed with cars loaded with mattresses and suitcases, all heading south, headlights on.', cap: 'By the spring the road south from {town} was full every evening.' },
    { art: 'north-2', src: '3d', shot: 'A small regional airport at night, a turboprop on the apron with its stairs down, floodlights, a queue of people.', cap: 'The little airport we built up there flew people out four times a day. I had argued for it in a different world.', only: 'air' },
    { art: 'north-3', src: 'ai', shot: 'A woman (Mira) at a car window with two children in the back seat, turning to look at the town square behind her.', cap: '{sister} left on a Tuesday. She locked the bakery and left the key with a neighbour who would not go.', say: ['SISTER', 'You built half this country. Build something that keeps them off us.'] }
  ] },

  eve: { title: 'The last quiet night', panels: [
    { art: 'eve-1', src: 'ai', shot: 'Satellite photographs pinned to a board: rows of missile launchers leaving a garrison, circled in red marker.', cap: 'The pictures came in on a Thursday. Launchers leaving their garrisons. Aircraft dispersing.' },
    { art: 'eve-2', src: 'ai', shot: 'The flat roof of a ministry building at night, the Director alone at the parapet looking north over a quiet city.', cap: 'I went up on the roof of the ministry and looked north. You could not see anything, of course. Just the city, asleep.' },
    { art: 'eve-3', src: '3d', shot: 'An air defence radar on a hilltop at night, its antenna turning, a red warning light on top.', cap: 'Everything we had was switched on. Whatever was not ready now would not be ready.' }
  ] },

  firstNight: { title: 'The first night', panels: [
    { art: 'night-1', src: '3d', shot: 'Ballistic missiles rising from launchers at dawn across the border, bright exhaust plumes.', cap: 'They came at dawn.' },
    { art: 'night-2', src: '3d', shot: 'Interceptor missiles launching from a battery, two bright trails climbing into a pink dawn sky.', cap: 'Our batteries fired for the first time in anger at 05:52.' },
    { art: 'night-3', src: 'ai', shot: 'A metro station used as a shelter: families on blankets on the platform, an old woman holding a radio, a child asleep on a suitcase.', cap: 'The city went underground and listened.' },
    { art: 'night-4', src: 'ai', shot: 'The operations room in red emergency light, every screen full of tracks; Ivo Marsh behind a young controller with a hand on her shoulder.', cap: 'Ivo stood behind the youngest controller all night, the way he had stood behind me.', say: ['ATC', 'One at a time, kid. One at a time.'] }
  ] },

  letter: { title: 'A letter in the wreck', panels: [
    { art: 'letter-1', src: '3d', shot: 'A fighter jet trailing smoke and fire, falling toward a forest.', cap: 'Ilya Moreva was shot down over the forest north of {town}.' },
    { art: 'letter-2', src: 'ai', shot: 'Soldiers at a crash site in a burnt forest; one kneels, holding a small folded letter with a child\'s drawing of an aircraft on it.', cap: 'He did not get out. In his flight suit there was a letter to his daughter, and a drawing she had made of his aircraft.' },
    { art: 'letter-3', src: 'ai', shot: 'The Director at a desk reading the letter by a lamp, face in shadow.', cap: 'Someone sent me a copy. I do not know why. I read it more times than I can count.' }
  ] },

  burn: { title: 'The airport burns', panels: [
    { art: 'burn-1', src: '3d', shot: 'An airport apron at night with a terminal on fire, smoke lit orange, an airliner silhouetted on its stand.', cap: 'They hit {ap} at night. I had walked every metre of that apron when it was survey pegs.' },
    { art: 'burn-2', src: 'ai', shot: 'Firefighters in silhouette spraying foam at a burning terminal; one carries an injured woman in a high-visibility vest.', cap: 'The fire crews went in before the last missile had landed.', only: 'fire' },
    { art: 'burn-2b', src: 'ai', shot: 'Airport staff with garden hoses and extinguishers fighting a huge fire, no fire trucks in sight.', cap: 'There was no fire station. People fought it with hoses from the hangars. I had decided we could build one later.', only: 'nofire' },
    { art: 'burn-3', src: 'ai', shot: 'A hospital corridor, the Director sitting on a plastic chair, head bowed, a high-visibility vest folded on the knees.', cap: 'Lena Okafor was on the apron when it was hit.', only: 'hurt' }
  ], pick: (S, d) => d && d.hurt ? 'hurt' : d && d.fire ? 'fire' : 'nofire' },

  held: { title: 'They held', panels: [
    { art: 'held-1', src: '3d', shot: 'Many interceptor trails crossing a night sky, bright flashes where they meet incoming missiles.', cap: 'The night they came with everything, we stopped everything.' },
    { art: 'held-2', src: 'ai', shot: 'A battery crew in helmets on a launcher truck at dawn, exhausted, one laughing, one crying, sharing a cigarette.', cap: 'Nobody cheered in the ops room. People just sat down, wherever they were.' },
    { art: 'held-3', src: 'ai', shot: 'A city street at morning, people coming up from a metro entrance into sunlight, an intact skyline behind them.', cap: 'In the morning, the city came up into the light, and it was still there.' }
  ] },

  crash: { title: 'The accident', panels: [
    { art: 'crash-1', src: '3d', shot: 'An airliner wreck burning beside a runway at dusk, fire trucks arriving, foam arcs.', cap: 'It happened at {ap}. {cause}' },
    { art: 'crash-2', src: 'ai', shot: 'Families waiting in a terminal hall behind a rope, a board showing one flight with no status.', cap: 'Every accident has a cause. That is what makes them unbearable: someone could have known.' }
  ] },

  sacked: { title: 'Replaced', panels: [
    { art: 'sacked-1', src: 'ai', shot: 'The Director carrying a cardboard box of belongings down a ministry staircase, a security guard holding the door.', cap: 'Halloran told me herself. She owed me that.' },
    { art: 'sacked-2', src: 'ai', shot: 'A kitchen at night, the Director watching an airliner\'s lights cross the window, a cold cup of tea.', cap: 'The airliners still came over the house at night. I still knew every one of them by its sound.' }
  ] },

  review: { title: 'The year', pick: (S, d) => d && d.good ? 'good' : 'bad', panels: [
    { art: 'review-g', src: '3d', shot: 'A busy airport at golden hour, airliners at every gate, one taking off.', cap: 'It was a good year. I did not know how rare they would be.', only: 'good' },
    { art: 'review-b', src: 'ai', shot: 'An empty departures hall, half the lights off, a cleaner mopping alone.', cap: 'It was a bad year, and everyone knew whose.', only: 'bad' }
  ] },

  /* the endings */
  endLenz: { title: 'Through the back channel', panels: [
    { art: 'endL-1', src: 'ai', shot: 'A neutral country\'s café, two tired men in coats at a small table, one older with round glasses (Lenz), passing a folded paper.', cap: 'It was Kasimir who carried the first message. We met once, in a café in a country that was neither of ours.' },
    { art: 'endL-2', src: '3d', shot: 'A quiet runway at a border airfield at dawn, two small aircraft parked nose to nose.', cap: 'The ceasefire was signed on a runway at the border, because it was the one place both sides agreed was nobody\'s.' },
    { art: 'endL-3', src: 'ai', shot: 'The rooftop of a hotel at night, two silhouettes with drinks, a city below. Echo of a memory.', cap: 'He reminded me of the rooftop. We had talked about the future of flying. We had been right about some of it.', say: ['LENZ', 'Next time, Director, let us only argue about charges.'] }
  ] },
  endOpen: { title: 'The canopy held', panels: [
    { art: 'endO-1', src: '3d', shot: 'An airliner on final approach to the national airport in morning light, gear down.', cap: 'The first airliner came back three weeks after the ceasefire.' },
    { art: 'endO-2', src: 'ai', shot: 'A crowd at an airport fence again, older children now, the same old man with a flag, many people crying and cheering.', cap: 'Half of {capCity} came to the fence again. Some of them were the same people.' },
    { art: 'endO-3', src: 'ai', shot: 'A bakery on a small-town square reopening: Mira hanging an OPEN sign, her children helping, a crowd waiting.', cap: '{sister} opened the bakery on the first Saturday. I drove up for it. The bread was terrible. Nobody minded.' }
  ] },
  endPrice: { title: 'The canopy held, at a price', pick: S => IC.flagOf && IC.flagOf(S, 'mira') === 'lost' ? 'mira' : '', panels: [
    { art: 'endP-1', src: 'ai', shot: 'A small-town square in ruins, a burnt-out bakery with its sign hanging by one hook, snow falling.', cap: 'We held. {town} did not.' },
    { art: 'endP-m', src: 'ai', shot: 'A teenage girl (Ana) alone behind the counter of a rebuilt bakery at dawn, flour on her hands, an old photo of her mother pinned by the till.', cap: '{sister} did not leave the bakery, and I did not make her. Ana runs it now. She has never once asked me why.', only: 'mira' },
    { art: 'endP-2', src: 'ai', shot: 'A memorial wall with many names, flowers and candles, the Director standing in front of it in a dark coat.', cap: 'I go to the wall every year. I read every name. I know which ones were blind spots.' },
    { art: 'endP-3', src: '3d', shot: 'A single airliner taking off into a grey winter sky.', cap: 'The airports still work. I made sure of that. It is the only thing I know how to do.' }
  ] },
  endFortress: { title: 'A fortress', panels: [
    { art: 'endF-1', src: '3d', shot: 'An airport behind tall fences and radars, missile launchers among the aircraft stands.', cap: 'We won by becoming something harder. The airports have fences now, and soldiers, and some of them are not ours.' },
    { art: 'endF-2', src: 'ai', shot: 'A border checkpoint closed with concrete blocks, a guard in a winter coat, nobody on the other side.', cap: 'There is nobody across the border I can call. I used to know someone there.' }
  ] },
  endLost: { title: 'The sky fell silent', panels: [
    { art: 'endX-1', src: 'ai', shot: 'An airport in ruins under a grey sky, a cratered runway, a broken control tower.', cap: 'In the end it was not enough.' },
    { art: 'endX-2', src: 'ai', shot: 'A child\'s drawing of an airport taped to a wall in a shelter: a sun, a runway, a plane.', cap: 'What we built is what this country will rebuild from. Someone will draw the first line of pegs again. I hope they are better at it than I was.' }
  ] }
};

/* queue one: once per id (unless data.again), shown by the viewer; seen ones go to the Journal */
IC.cutscene = function (S, id, data) {
  const C = IC.CUTSCENES[id]; if (!C || !S.story || S.mode !== 'story') return false;
  const st = S.story; st.cuts = st.cuts || []; st.cutQ = st.cutQ || [];
  if (!(data && data.again) && (st.cuts.some(c => c.id === id) || st.cutQ.some(c => c.id === id))) return false;
  const v = C.pick ? C.pick(S, data) || '' : '';
  // (the words want names, not objects: an airport passed as { ap } is kept as its name)
  const d = {}; for (const k in data || {}) { const x = data[k]; d[k] = x && typeof x === 'object' ? (x.name || '').replace(/ (International|Airport)$/, '') : x; }
  st.cutQ.push({ id, v, t: S.time, d });
  IC.emit(S, 'cutscene', { id, v });
  return true;
};
/* the panels of a queued or seen cutscene, its words filled in */
IC.cutPanels = function (S, c) {
  const C = IC.CUTSCENES[c.id];
  return C.panels.filter(p => !p.only || p.only === c.v).map(p => ({ art: p.art, src: p.src, shot: p.shot, cap: IC.cutFill(S, p.cap, c.d), say: p.say ? [p.say[0], IC.cutFill(S, p.say[1], c.d)] : null }));
};
/* the viewer took it: seen */
IC.cutDone = function (S, c) {
  const st = S.story; st.cutQ = st.cutQ.filter(x => x !== c);
  st.cuts.push({ id: c.id, v: c.v, t: c.t, d: c.d });
};
/* a headless player (tests, the balance run) never opens the viewer: it takes them as seen */
IC.cutSkipAll = S => { const st = S.story; if (st && st.cutQ) for (const c of st.cutQ.slice()) IC.cutDone(S, c); };

})(window.IC);
