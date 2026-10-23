/* Iron Canopy — (brief 70, the twelve acts) the story's acts and its buried history: Northline 310.
   - The twelve acts (IC.STORY_ACTS) lie over the Career's four parts (IC.ACTS in story.js): part one holds Acts I to
     III (by its chapters), two IV and V, three VI and VII, four VIII and IX, and five (the peace, peace.js) X to XII.
     S.story.part is the act now; it only moves forward (IC.loreTick, from the story's tick).
   - The lore: 34 years before Day 1 an airliner, Northline 310, was shot down over the northern ridge; each country
     keeps half of the tapes, and each half alone blames the other side (docs/story/lore.md). Nothing here says so: the
     clues are in what people say (the 14 March silence, Marsh's sector, Lenz's brother, the memorial, Volkan's
     orders), and in four choices: answering the escort (IV), the tape (V), the border town on the eve (VII), and an
     airliner in the box in the war (IX), which is the night of 310 again with the player in the chair.
   Headless: it all runs in the step and through the event bus. */
(function (IC) {
'use strict';
const U = IC.U;
const MO = (S, n) => IC.MO(S, n);
const later = (S, dt, w, t) => IC.later(S, dt, 'castSay', S, w, t);
const conf = (S, v) => { S.story.standing = U.clamp(S.story.standing + v, 5, 100); };
const raise = (S, v) => IC.storyRaise && IC.storyRaise(S, v);
const town = S => IC.storyBorderTown(S);
const townName = S => { const t = town(S); return t ? t.name : 'the border town'; };
const beatDone = (S, id) => { const b = (S.story.beats || []).find(x => x.id === id); return !!(b && b.done); };

/* ---------- the twelve acts ---------- */
IC.STORY_ACTS = [
  { n: 1, r: 'I', part: 1, title: 'The National Airport', say: 'I thought the job was concrete. It was the first time I had been north of the capital in thirty years.' },
  { n: 2, r: 'II', part: 1, title: 'The Sky', say: 'A sky is not empty. It is full of agreements: who flies where, who listens, who answers. Some of them are older than the people keeping them.' },
  { n: 3, r: 'III', part: 1, title: 'The Network', say: 'By the third year the airports were talking to each other, and I started to hear what people did not say.' },
  { n: 4, r: 'IV', part: 2, title: 'The Shadows', say: 'After the collision, the quiet years were over. I did not know yet that they had never really started.' },
  { n: 5, r: 'V', part: 2, title: 'The Tapes', say: 'Everybody in this country knows where they were when they heard about Northline 310. I was four. I do not remember it. I have been told I do.' },
  { n: 6, r: 'VI', part: 3, title: 'The Gray Zone', say: 'Nobody decides to go to war. They decide something smaller, every week, and one day it adds up.' },
  { n: 7, r: 'VII', part: 3, title: 'The Eve', say: 'The last months before the war were the most ordinary of my life. People bought bread. Airliners landed on time.' },
  { n: 8, r: 'VIII', part: 4, title: 'The Shock', say: 'They came at dawn, the way everybody had said they would. Knowing did not help as much as I had hoped.' },
  { n: 9, r: 'IX', part: 4, title: 'The Long Sky', say: 'After the first weeks the war became a routine, and routine is where people make mistakes.' },
  { n: 10, r: 'X', part: 5, title: 'The Armistice', say: 'The war ended on a Tuesday. I remember thinking that the hard part was over. It had not started.' },
  { n: 11, r: 'XI', part: 5, title: 'The Ledger', say: 'For thirty-four years each country had kept half of one night. That year, for the first time, someone asked to hear both.' },
  { n: 12, r: 'XII', part: 5, title: 'The Commission', say: 'You know this part. You were in the room.' }
];
IC.storyAct = n => IC.STORY_ACTS[n - 1];
/* which act the Career has reached, from its part and how far into it the story is */
IC.storyPartWant = function (S) {
  const st = S.story; if (!st) return 0;
  if (st.act <= 1) return st.ch >= 4 ? 3 : st.ch >= 2 ? 2 : 1;
  if (st.act === 2) return beatDone(S, 'shadow') ? 5 : 4;
  if (st.act === 3) return beatDone(S, 'embassy') ? 7 : 6;
  if (st.act >= 5) return IC.peacePartWant ? IC.peacePartWant(S) : 10;
  return (S.enemy && S.enemy.act >= 4) || S.time - st.actT > 72 * 3600 ? 9 : 8;
};
IC.storyPartNow = S => S.story ? Math.max(S.story.part || 0, IC.storyPartWant(S)) || 1 : 0;
/* "Act IV", or with long "Act IV: The Shadows" */
IC.storyActLabel = function (S, long) {
  if (!S || !S.story) return '';
  const A = IC.storyAct(IC.storyPartNow(S));
  return long ? `Act ${A.r}: ${A.title}` : `Act ${A.r}`;
};

/* the chains of the lore: always in a Career (old saves get them when they load) */
const LORE_CHAINS = IC.LORE_CHAINS = ['escort', 'tape', 'evac', 'mirror'];   // (peace.js adds Part Five's)
/* the old range over the ridge (the box), on the drawn map: a restricted area published after Northline 310 and
   never withdrawn. The player cannot change it; a joint commission in Part Five can (IC.storyRidgeOpen) */
const R9_WHY = 'it was published in Year −34, after Northline 310 fell on the ridge, under a treaty with the neighbour. Only both governments together can withdraw it.';
function ridgeRange(S) {
  const st = S.story, p = IC.storyPlace(S, 'station9');
  st.r9 = 0;
  if (!p || !IC.aspAddArea) return;
  const sh = IC.aspAddArea(S, 'R', p.x, p.y, 200, true); if (!sh) return;
  sh.name = 'R-9, the old range over the ridge'; sh.fixed = `It cannot be changed: ${R9_WHY}`;
  sh.rings[0].lo = 0; sh.rings[0].hi = 25000 / IC.FT;
  IC.aspSync(S, sh);
  st.r9 = sh.id;
}
IC.storyRidgeRange = ridgeRange;
IC.storyRidgeOpen = function (S) {
  const st = S.story, sh = st.r9 && IC.aspShape(S, st.r9); if (!sh) return false;
  sh.fixed = null; IC.aspDelArea(S, sh); st.r9 = 0;
  IC.log(S, 'info', 'AIRSPACE', 'R-9, the old range over the ridge, is withdrawn by both governments. Airliners may fly over the ridge again for the first time since Year −34.');
  return true;
};
IC.loreTick = function (S, dt) {
  const st = S.story; if (!st || S.mode !== 'story' || !st.flags) return;
  st.loreT = (st.loreT || 0) - dt; if (st.loreT > 0) return;
  st.loreT = 20;
  if (st.r9 == null) ridgeRange(S);
  if (st.chains) for (const k of LORE_CHAINS) if (!st.chains[k]) st.chains[k] = { step: IC.CHAINS[k].first, at: null, seen: [], end: null };
  const want = IC.storyPartWant(S);
  if (!st.part) { st.part = want; st.partT = S.time; return; }
  if (want <= st.part) return;
  st.part = want; st.partT = S.time;
  const A = IC.storyAct(want);
  IC.emit(S, 'part', want);
  // the act's first line, the Director looking back; an act that opens a part has the part's card already
  if (IC.STORY_ACTS.find(a => a.part === A.part) !== A) IC.card(S, `Act ${A.r} · ${A.title}`, U.clock(S.time, S), A.say, 'chapter');
  else if (A.say) later(S, 1200, 'YOU', A.say);
};

/* ---------- the clues ---------- */
/* each year, in the middle of March: the anniversary of Northline 310. The controllers keep a minute's silence at
   22:34; from Part Two their television keeps it too, in its own way */
IC.onMonth((S, was, m) => {
  const st = S.story; if (!st || !st.flags || S.mode !== 'story' || m % 12 !== 2 || st.act === 4) return;
  const y = Math.floor(m / 12) + 1, ago = 33 + y, at = MO(S, 0.45);
  later(S, at, 'ATC', y === 1 ? `Ivo Marsh. Last night at 22:34 every frequency in the country went quiet for one minute. That was us. It is a tower thing, Director; it has been done every March for ${ago} years. Nobody will ask you to explain it.` : `Last night at 22:34, one minute of silence on every frequency, as every March. ${ago} years.`);
  if (st.act >= 2) later(S, at + 3 * 3600, 'KOLAR', `${ago} years ago tonight, on the Black Morning, the ${S.world.names.H} sent an airliner full of its own people into our missiles, and told the world we fired without a word. We remember the 212. Good evening.`);
});
/* the people, as each act opens */
IC.on((S, type, d) => {
  const st = S.story; if (!st || !st.flags || S.mode !== 'story' || type !== 'part') return;
  if (d === 2) later(S, 5 * 3600, 'ATC', `One thing, Director, before you redraw the sectors. Sector 9, the old northern one over the ridge: it stays closed. It has been closed since before you were at school. While I am alive nobody works it.`);
  if (d === 3) later(S, 4 * 3600, 'SISTER', `Mira. They cleaned the memorial on the square today: 212 names, and the blank stone at the end. Ana asked me who the blank one is for. I told her I did not know.`);
  if (d === 5) later(S, 6 * 3600, 'LISE', `Lise Marsh. I have been reading about Northline 310. The night it came down it was turned round a storm, off the airway, over the ridge. That is where they turned us, the day the drone hit. Exactly there. Has anybody else noticed?`);
  if (d === 7) later(S, 3 * 3600, 'SISTER', `Mira. If we have to go, it will not be the north road. Dad never drove us the north way. Not once, not since we came south. I never asked him why.`);
});
/* the first intercepted order of the war, and what the narrator says about it (Act XI will say it again) */
IC.on((S, type) => {
  const st = S.story; if (!st || !st.flags || S.mode !== 'story' || st.act !== 4 || type !== 'raidWarning' || st.flags.has('heardBox')) return;
  IC.flag(S, 'heardBox', true);
  later(S, 600, 'YOU', `"Confirm the box is hot." I had never heard those words before.`);
});

/* ---------- the four choices of the lore ---------- */
const N = S => S.world.names;
Object.assign(IC.CHAINS, {
  /* Act IV: their fighters fly beside our airliners. How we answer is what Moreva remembers in Act IX */
  escort: { name: 'The escort', who: 'PM', core: true, first: 'answer',
    steps: {
      answer: { act: [2, 2], when: S => beatDone(S, 'shadow'),
        card: S => ({ title: 'How do we answer the escort?', text: `Their fighters are flying beside our airliners, close enough for the passengers to see the pilots' faces. "They say it is for our safety," the Prime Minister says. "I want an answer that does not start anything. Kasimir Lenz could carry a note to their air force. The cabinet would rather say it out loud. General Voss would rather fly beside theirs."`,
          opts: [
            { t: 'A quiet note, through Lenz', tip: 'Tension −3. Lenz carries a note to their air force; nothing is said in public.', risk: 'If it does not work, it looks as if we did nothing.', trust: { LENZ: 8, PM: 3, CDS: -6 }, heat: -1, fx: S => raise(S, -3), set: { escort: 'quiet' }, end: 'quiet' },
            { t: 'Protest in public', tip: 'Confidence +3. Tension +4.', risk: 'Their pilots will be told we called them pirates.', trust: { PRESS: 4, LENZ: -4 }, heat: 1, fx: S => { conf(S, 3); raise(S, 4); }, set: { escort: 'public' }, end: 'public' },
            { t: 'Fly beside theirs with VIPER', tip: 'Tension +8. Confidence +5.', risk: 'Two sets of fighters a few metres apart is how wars start by accident.', trust: { CDS: 8, LENZ: -8, PM: -4 }, heat: 2, fx: S => { conf(S, 5); raise(S, 8); }, set: { escort: 'answered' }, end: 'answered' }
          ] }) }
    },
    ends: {
      quiet: { did: S => 'You answered their fighters with a quiet note, through Lenz.', came: S => 'The escorts stopped a month later. One of their pilots, Ilya Moreva, remembered who had kept their head.' },
      public: { did: S => 'You protested their escorts in public.', came: S => 'The escorts went on, and their television called our crews cowards.' },
      answered: { did: S => 'You sent our fighters to fly beside theirs.', came: S => 'For a year, four fighters flew a few metres apart over the border every week. Nobody fired. Everybody remembers it.' }
    } },

  /* Act V: the Courier has the southern half of the tapes */
  tape: { name: 'The tape', who: 'PRESS', core: true, first: 'offer',
    steps: {
      offer: { place: 'area_centre', act: [2, 2], when: S => (S.story.part || 0) >= 5 && S.time - (S.story.partT || 0) > MO(S, 2),
        card: S => ({ title: 'Northline 310', text: `Sol Varga puts a cassette on your desk. "The Northern Area Centre's tape from the night of Northline 310. Someone at the old ministry kept a copy. It proves what we always said: their battery shot down an airliner on a cleared airway, without a word. I print it on Saturday, with or without your comment." You listen to it twice. It stops at 22:33, in the middle of a word.`,
          opts: [
            { t: 'Ask him to wait until it is checked', tip: 'Varga waits, and is not pleased. Ruth Amberly is relieved.', risk: 'A story held back is a story someone else prints.', trust: { PRESS: -8, FLAG: 6, ATC: 6 }, set: { tape: 'held' }, end: 'held' },
            { t: 'Back him: the country should hear it', tip: 'Confidence +4. Tension +6. Their television calls it a forgery.', risk: 'Half a tape is half the truth. The other half is on their side of the ridge.', trust: { PRESS: 12, PM: -4, LENZ: -10 }, heat: 2, fx: S => { conf(S, 4); raise(S, 6); IC.cutscene(S, 'tape'); IC.storyPaper(S, 'NORTHLINE 310: THE TAPE', `"Cleared to turn." The last minutes of the airliner, heard for the first time`, `Thirty-odd years after Northline 310 fell on the northern ridge, the Courier has heard the Area Centre's tape from that night. It records an airliner cleared round a storm and, minutes later, silence.`, 'The tape ends at 22:33. The other side says it is a forgery.'); }, set: { tape: 'printed' }, end: 'printed' },
            { t: 'Tell him the tape has a second half', tip: 'Varga holds the story and starts looking for the other half. The Prime Minister −8.', risk: 'Once a journalist knows there is a second tape, he will not stop looking.', trust: { PRESS: 6, PM: -8, ATC: -4 }, heat: -1, set: { tape: 'both' }, end: 'both' }
          ] }) }
    },
    ends: {
      held: { did: S => 'You asked the Courier to sit on the Northline tape.', came: S => 'It sat in Sol Varga’s safe, and in his head.' },
      printed: { did: S => 'You let the Courier print the Northline tape.', came: S => 'Half the country heard proof. The other country heard a forgery. Both were half right.' },
      both: { did: S => 'You told Sol Varga the Northline tape had a second half.', came: S => 'He has been looking for it ever since.' }
    } },

  /* Act VII: the border town on the eve of the war */
  evac: { name: 'The eve', who: 'GOV', core: true, first: 'ask',
    steps: {
      ask: { place: S => town(S), act: [3, 3], when: S => beatDone(S, 'embassy') && !!town(S),
        card: S => ({ title: `Move ${townName(S)} out now?`, text: `The road south from ${townName(S)} is full every evening. "Half of them want to go and half of them will not," Governor Tessel says. "If you tell them to leave now, they leave while the road is open. If you wait, they leave under fire, or not at all." Your sister rang last night. She says she will not close the bakery unless you tell her to.`,
          opts: [
            { t: 'Move the town out now', tip: `Confidence −5. ${townName(S)}'s morale −10 and its trade stops. Everyone is south before the first missile.`, risk: 'If the war waits, people sit in school halls for months.', trust: { GOV: 8, SISTER: 10, FIN: -6 }, fx: S => { conf(S, -5); const t = town(S); if (t) t.morale = U.clamp(t.morale - 10, 0, 100); }, set: { evac: 'early' }, end: 'early' },
            { t: 'Keep it open and the roads ready', tip: 'Nothing changes now.', risk: `Some will not leave in time. Mira says she will not leave the bakery.`, trust: { GOV: -6, SISTER: -6 }, set: { evac: 'stay' }, end: 'stay' }
          ] }) }
    },
    ends: {
      early: { did: S => `On the eve of the war you moved ${townName(S)} south.`, came: S => 'Its people waited out the war in school halls and spare rooms, and came home to it.' },
      stay: { did: S => `On the eve of the war you kept ${townName(S)} open.`, came: S => IC.flagOf(S, 'mira') === 'lost' ? 'Your sister stayed with the bakery, and the war came to the square.' : 'Most of its people stayed, and most of them lived.' }
    } },

  /* Act IX: an airliner turns off its airway into the box over the ridge, during a raid. It is 310 again */
  mirror: { name: 'The box', who: 'ADA', core: true, first: 'track',
    steps: {
      track: { place: ['crash310', 'station9'], act: [4, 4], when: S => (S.story.part || 0) >= 9 && S.time - (S.story.partT || 0) > 6 * 3600 && !S.over,
        card: S => {
          const friend = IC.flagOf(S, 'corridor') === 'friend';
          const opts = [
            { t: 'Hold fire, call it on every frequency', tip: 'If it is a bomber, it reaches its target.', risk: 'Ninety seconds is a long time to wait for a bomber.', set: { mirror: 'held' }, fx: S => boxHeld(S), end: 'held' },
            { t: 'Fire', tip: 'If it is a bomber, it never reaches its target.', risk: 'If it is not, nothing you do will ever undo it.', set: { mirror: 'fired' }, fx: S => boxFired(S), end: 'fired' }
          ];
          if (friend) opts.splice(1, 0, { t: 'Call Lenz on the one line still open', tip: 'Lenz may reach their air force in time to call off their fighters.', risk: 'If he cannot, it is too late for anything else.', trust: { LENZ: 10 }, set: { mirror: 'lenz' }, fx: S => boxLenz(S), end: 'lenz' });
          return { title: 'Unknown track in the box', text: `Colonel Ashe, on the direct line. "A track has turned off the airway into the old box over the ridge, in the middle of their raid. Airliner height, airliner speed, no answer on any frequency. Their bombers have flown like airliners twice this week. Their fighters are turning towards it too. The battery has it locked. I need an answer in ninety seconds."`, opts };
        } }
    },
    ends: {
      held: { did: S => 'When an unknown track entered the box over the ridge, you held fire.', came: S => IC.flagOf(S, 'box') === 'theirs' ? 'It was an airliner, turned round a storm. Their fighters did not hold.' : 'It was an airliner, turned round a storm. Their pilot did not fire either.' },
      lenz: { did: S => 'When an unknown track entered the box over the ridge, you called Kasimir Lenz.', came: S => 'He reached their air force in time. The airliner landed at our airport with 231 people aboard who never knew.' },
      fired: { did: S => 'When an unknown track entered the box over the ridge, you gave the order to fire.', came: S => 'It was an airliner, turned round a storm, with 231 people aboard.' }
    } }
});
for (const k of LORE_CHAINS) IC.chainRegister(k);

/* what came of the box: an airliner of the Tessk Union (a neutral country) turned round a storm */
const AIRLINER = 'TU 3310';
function boxHeld(S) {
  const quiet = IC.flagOf(S, 'escort') === 'quiet';
  if (quiet) {
    IC.flag(S, 'box', 'held');
    later(S, 300, 'ADA', `It answered at the last moment: ${AIRLINER}, a neutral airliner turned round the storm with its radio dead. Their fighters were on it too. Their lead broke off without firing. Moreva, by his call sign.`);
    later(S, 3600, 'YOU', `He held. I have never known whether he did it because of a note I sent years before. I like to think so.`);
    IC.cutscene(S, 'box', { how: 'held' });
  } else {
    IC.flag(S, 'box', 'theirs');
    later(S, 300, 'ADA', `It was ${AIRLINER}, a neutral airliner turned round the storm with its radio dead. Their fighters fired before it answered. It came down on the ridge. 231 aboard.`);
    IC.news(S, `NEUTRAL AIRLINER SHOT DOWN OVER THE RIDGE: ${AIRLINER} hit by their fighters; 231 aboard. The Tessk Union recalls its ambassador from the ${S.world.full.A}.`);
    if (S.enemy) S.enemy.will = Math.max(0, S.enemy.will - 10);
    S.support = Math.min(100, (S.support || 0) + 10);
    IC.cutscene(S, 'box', { how: 'theirs' });
  }
}
function boxLenz(S) {
  IC.flag(S, 'box', 'lenz');
  later(S, 240, 'LENZ', `"Their fighters are called off. Volkan himself gave the order. He asked me one thing: whether the track was in the box. I told him yes. He did not say anything for a long time."`);
  later(S, 900, 'ATC', `${AIRLINER} is on the ground at the national airport, a neutral airliner with a dead radio. 231 people, and not one of them knows.`);
  if (S.enemy) S.enemy.will = Math.max(0, S.enemy.will - 5);
  IC.cutscene(S, 'box', { how: 'lenz' });
}
function boxFired(S) {
  IC.flag(S, 'box', 'fired');
  later(S, 200, 'ADA', `Two missiles. The track is down on the ridge. It answered as it fell: ${AIRLINER}, a neutral airliner, turned round the storm with its radio dead.`);
  IC.news(S, `NEUTRAL AIRLINER DOWN OVER THE RIDGE: ${AIRLINER}, 231 aboard, struck by our missiles during an enemy raid.`);
  S.story.standing = U.clamp(S.story.standing - 30, 0, 100);
  IC.castTrust(S, 'PM', -20, 'the airliner'); IC.castTrust(S, 'ENVOY', -15, 'the airliner');
  S.support = Math.max(0, (S.support || 0) - 20);
  if (S.enemy) S.enemy.will = Math.min(100, S.enemy.will + 10);
  IC.cutscene(S, 'box', { how: 'fired' });
}

/* the border town kept open: if the war reaches its square, Mira is lost (her voice stops) */
IC.on((S, type, d) => {
  const st = S.story; if (!st || !st.flags || S.mode !== 'story' || st.act !== 4 || type !== 'impact' || st.flags.get('evac') !== 'stay' || st.flags.has('mira')) return;
  const t = town(S); if (!t || !t.blocks || !d) return;
  const hurt = t.blocks.filter(b => b.hp != null && b.hp < 0.5).length;
  if (hurt <= t.blocks.length * 0.15) return;
  IC.flag(S, 'mira', 'lost');
  later(S, 1800, 'GOV', `Anja Tessel. Director, I am sorry. The square in ${t.name} was hit last night. Your sister was in the bakery. The children were in the cellar, and they are safe.`);
  later(S, 4 * 3600, 'YOU', `I had told her the road would be ready. It was. She did not take it, and I had not told her to.`);
});

/* ---------- the cutscenes of the lore ---------- */
Object.assign(IC.CUTSCENES, {
  tape: { title: 'Half a tape', panels: [
    { art: 'tape-1', src: 'ai', shot: 'A cassette tape on a ministry desk under a green banker\'s lamp, a label in old typewriter letters: NAC 14.03 22:00–22:40.', cap: 'Sol Varga brought it in a padded envelope. He said a man at the old ministry had kept it for thirty years and wanted it out of his house.' },
    { art: 'tape-2', src: 'ai', shot: 'Close on an old reel-to-reel tape deck in a dark room, the Director\'s hand on the stop key, a headphone cable trailing.', cap: 'A controller\'s voice clears Northline 310 round the storm. Then the military line: the range is cold. Then nothing, at 22:33, in the middle of a word.' },
    { art: 'tape-3', src: 'ai', shot: 'A newspaper front page on a kitchen table, the headline NORTHLINE 310: THE TAPE, a black-and-white photo of an airliner of the 1980s.', cap: 'The Courier printed it on the Saturday. I had heard that controller\'s voice before. I did not let myself think where.', say: ['KOLAR', 'A forgery, made for an election. We know what happened. We were there.'] }
  ] },
  box: { title: 'The box', pick: (S, d) => d && d.how, panels: [
    { art: 'box-1', src: '3d', shot: 'Night over a dark ridge with a ruined radar dome; an airliner\'s navigation lights crossing low over it in rain.', cap: 'It turned off the airway at 03:10, round a storm, into the old box over the ridge.' },
    { art: 'box-2', src: 'ai', shot: 'The operations room in red light, a single unknown track blinking on a huge screen, the Director standing with a phone to the ear, everyone turned towards them.', cap: 'Ashe gave me ninety seconds. I have since learned that is about how long it took, the first time.' },
    { art: 'box-3', src: '3d', shot: 'An airliner breaking out of cloud over a lit runway at dawn, two fighters peeling away high above it.', cap: 'Their lead broke off. Nobody fired. It landed with its radio dead and 231 people aboard who never knew.', only: 'held' },
    { art: 'box-3l', src: '3d', shot: 'An airliner breaking out of cloud over a lit runway at dawn, two fighters peeling away high above it.', cap: 'Kasimir picked up. Their fighters turned away. It landed with its radio dead and 231 people aboard who never knew.', only: 'lenz' },
    { art: 'box-3t', src: 'ai', shot: 'A fireball low over a dark ridge, a fighter\'s afterburner glow climbing away from it.', cap: 'Their fighters fired before it answered. I watched it on the screen. I had held, and it did not matter.', only: 'theirs' },
    { art: 'box-3f', src: '3d', shot: 'Two missile trails climbing from a battery in rain toward an airliner\'s lights over a ridge.', cap: 'I said "fire". I would like to tell you I hesitated. I did not, not long enough.', only: 'fired' },
    { art: 'box-4f', src: 'ai', shot: 'Dawn on a burnt ridge: scattered airliner wreckage among pines, a child\'s shoe in the ash, rescuers in orange with their heads bowed.', cap: 'It came down on the ridge, a few hundred metres from where the other one fell, thirty-odd years before.', only: 'fired' }
  ] },
  endBlack: { title: 'Black Morning', panels: [
    { art: 'endB-1', src: 'ai', shot: 'A long table under hard light, the Director alone on one side, a microphone, rows of people behind; on the wall, two photographs of airliners side by side.', cap: 'The war ended. Nobody remembers that part. They remember the ridge.' },
    { art: 'endB-2', src: 'ai', shot: 'A kitchen at night, a young woman in a controller\'s uniform (Ana) sitting across the table from the Director, both untouched cups of tea between them.', cap: 'Ana came to see me after her first night shift. She did not ask how the war was won.', say: ['YOU', 'Go on, then. Ask.'] },
    { art: 'endB-3', src: 'ai', shot: 'A memorial on a small-town square with a blank stone at the end of a row of names, now joined by a second, new row of names.', cap: 'There are two rows of names on the square now. The blank stone is still blank. I think I know who it was for.' }
  ] }
});

})(window.IC);
